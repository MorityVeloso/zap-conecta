/**
 * Evolution API Client Service
 * Implements WhatsAppClientInterface using Evolution API v2 (self-hosted).
 * Adapted from saas-whatsapp-b2b — uses local PrismaService, no TenantContextService,
 * PIX generation inlined (no external PixGeneratorService).
 */

import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../prisma/prisma.service';
import { EvolutionApiException } from '../common/exceptions/evolution-api.exception';

import type {
  SendTextMessageDto,
  SendButtonMessageDto,
  SendListMessageDto,
  SendImageMessageDto,
  SendDocumentMessageDto,
  SendPixMessageDto,
  SendAudioMessageDto,
  SendVideoMessageDto,
  SendStickerMessageDto,
  SendLocationMessageDto,
  SendContactMessageDto,
  SendReactionDto,
  SendPollDto,
} from './dto/message.dto';
import type {
  WhatsAppClientInterface,
  WhatsAppClientResponse,
} from './whatsapp-client.interface';

interface EvolutionApiConfig {
  baseUrl: string;
  apiKey: string;
}

@Injectable()
export class EvolutionApiClientService implements WhatsAppClientInterface {
  private readonly logger = new Logger(EvolutionApiClientService.name);
  private readonly config: EvolutionApiConfig;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.config = {
      baseUrl: this.configService.get<string>(
        'EVOLUTION_API_URL',
        'http://localhost:8080',
      ),
      apiKey: this.configService.get<string>('EVOLUTION_API_KEY', ''),
    };
  }

  // ── Helpers ────────────────────────────────────────────

  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      apikey: this.config.apiKey,
    };
  }

  private instanceNameCache = new Map<string, { name: string | null; ts: number }>();
  private static readonly CACHE_TTL_MS = 60_000; // 1 min

  private async getInstanceName(
    overrideSlug?: string,
  ): Promise<string | null> {
    const slug =
      overrideSlug ??
      this.configService.get<string>('DEFAULT_INSTANCE_SLUG', 'default');

    const cached = this.instanceNameCache.get(slug);
    if (cached && Date.now() - cached.ts < EvolutionApiClientService.CACHE_TTL_MS) {
      return cached.name;
    }

    const instance = await this.prisma.whatsAppInstance.findFirst({
      where: { tenantSlug: slug },
    });

    const name = instance?.instanceName ?? null;
    this.instanceNameCache.set(slug, { name, ts: Date.now() });
    return name;
  }

  private static readonly REQUEST_TIMEOUT_MS = 30_000; // 30s — prevents hanging when Evolution API is stuck

  private async makeRequest<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    body?: unknown,
  ): Promise<T> {
    const url = `${this.config.baseUrl}${endpoint}`;

    try {
      const response = await fetch(url, {
        method,
        headers: this.getHeaders(),
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(EvolutionApiClientService.REQUEST_TIMEOUT_MS),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(
          `Evolution API error: ${String(response.status)} - ${errorText}`,
        );
        throw new EvolutionApiException(response.status, errorText);
      }

      const text = await response.text();
      if (!text) return {} as T;
      return JSON.parse(text) as T;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'TimeoutError') {
        this.logger.error(`Evolution API timeout after ${EvolutionApiClientService.REQUEST_TIMEOUT_MS}ms: ${method} ${endpoint}`);
        throw new EvolutionApiException(504, 'Evolution API request timed out');
      }
      this.logger.error(`Evolution API request error: ${String(error)}`);
      throw error;
    }
  }

  // ── PIX inline (CRC-16 CCITT) ──────────────────────────

  private padField(content: string): string {
    return content.length.toString().padStart(2, '0') + content;
  }

  private calculateCrc16(str: string): string {
    let crc = 0xffff;
    for (let i = 0; i < str.length; i++) {
      crc ^= str.charCodeAt(i) << 8;
      for (let j = 0; j < 8; j++) {
        if (crc & 0x8000) {
          crc = (crc << 1) ^ 0x1021;
        } else {
          crc <<= 1;
        }
        crc &= 0xffff;
      }
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
  }

  private generatePixCode(dto: SendPixMessageDto): string {
    const pixKeyTypeMap: Record<string, string> = {
      cpf: '01', cnpj: '02', email: '03', phone: '04', random: '05',
    };

    const formatAmount = (amount: number): string => amount.toFixed(2);

    const fields = [
      '000201',
      '010212',
      `26${this.padField(`0014br.gov.bcb.pix01${pixKeyTypeMap[dto.pixKeyType] ?? '05'}${String(dto.pixKey.length).padStart(2, '0')}${dto.pixKey}`)}`,
      '52040000',
      '5303986',
      dto.amount > 0
        ? `54${formatAmount(dto.amount).length.toString().padStart(2, '0')}${formatAmount(dto.amount)}`
        : '',
      '5802BR',
      `59${dto.merchantName.length.toString().padStart(2, '0')}${dto.merchantName}`,
      `60${dto.merchantCity.length.toString().padStart(2, '0')}${dto.merchantCity}`,
      dto.txid
        ? `62${this.padField(`05${dto.txid.length.toString().padStart(2, '0')}${dto.txid}`)}`
        : '',
      '6304',
    ];

    const codeWithoutCrc = fields.filter(Boolean).join('');
    return codeWithoutCrc + this.calculateCrc16(codeWithoutCrc);
  }

  private buildQuotedKey(
    dto: { quoted?: { messageId: string; remoteJid: string; fromMe: boolean } },
  ): Record<string, unknown> | undefined {
    if (!dto.quoted) return undefined;
    return {
      key: {
        remoteJid: dto.quoted.remoteJid,
        fromMe: dto.quoted.fromMe,
        id: dto.quoted.messageId,
      },
    };
  }

  // ── WhatsAppClientInterface ────────────────────────────

  isConfigured(): boolean {
    return Boolean(this.config.apiKey);
  }

  async getStatus(): Promise<{
    connected: boolean;
    phone?: string;
    instanceConfigured?: boolean;
  }> {
    const instanceName = await this.getInstanceName();
    if (!instanceName) {
      return { connected: false, instanceConfigured: false };
    }

    try {
      const response = await this.makeRequest<{
        instance: { state: string };
      }>(`/instance/connectionState/${instanceName}`, 'GET');

      const connected = response.instance?.state === 'open';
      const phone = connected
        ? await this.fetchInstancePhone(instanceName)
        : undefined;

      return { connected, phone, instanceConfigured: true };
    } catch {
      return { connected: false, instanceConfigured: true };
    }
  }

  private async fetchInstancePhone(
    instanceName: string,
  ): Promise<string | undefined> {
    try {
      const instances = await this.makeRequest<
        { name: string; ownerJid?: string; number?: string }[]
      >('/instance/fetchInstances', 'GET');
      const inst = instances.find((i) => i.name === instanceName);
      if (inst?.ownerJid) return inst.ownerJid.replace('@s.whatsapp.net', '');
      if (inst?.number) return inst.number;
      return undefined;
    } catch {
      return undefined;
    }
  }

  async getQrCode(): Promise<{ qrcode: string; imageBase64?: string }> {
    const instanceName = await this.getInstanceName();
    if (!instanceName) {
      throw new Error('WhatsApp instance not configured');
    }

    const response = await this.makeRequest<{
      pairingCode?: string;
      code?: string;
      base64?: string;
    }>(`/instance/connect/${instanceName}`, 'GET');

    return {
      qrcode: response.code ?? response.pairingCode ?? '',
      imageBase64: response.base64,
    };
  }

  async sendTextMessage(
    dto: SendTextMessageDto,
  ): Promise<WhatsAppClientResponse> {
    const slug = (dto as { tenantSlug?: string }).tenantSlug;
    const instanceName = await this.getInstanceName(slug);
    if (!instanceName) throw new HttpException('No WhatsApp instance configured for this tenant', HttpStatus.UNPROCESSABLE_ENTITY);

    const body: Record<string, unknown> = { number: dto.phone, text: dto.message };
    const quoted = this.buildQuotedKey(dto);
    if (quoted) body.quoted = quoted;

    const response = await this.makeRequest<{ key?: { id?: string } }>(
      `/message/sendText/${instanceName}`,
      'POST',
      body,
    );

    this.logger.log(`Text message sent to ${dto.phone}`);
    return { messageId: response.key?.id };
  }

  async sendButtonMessage(
    dto: SendButtonMessageDto,
  ): Promise<WhatsAppClientResponse> {
    const slug = (dto as { tenantSlug?: string }).tenantSlug;
    const instanceName = await this.getInstanceName(slug);
    if (!instanceName) throw new HttpException('No WhatsApp instance configured for this tenant', HttpStatus.UNPROCESSABLE_ENTITY);

    const response = await this.makeRequest<{ key?: { id?: string } }>(
      `/message/sendButtons/${instanceName}`,
      'POST',
      {
        number: dto.phone,
        title: dto.title ?? '',
        description: dto.message,
        footer: dto.footer ?? '',
        buttons: dto.buttons.map((btn) => ({
          buttonId: btn.id,
          buttonText: { displayText: btn.text },
          type: 1,
        })),
      },
    );

    this.logger.log(`Button message sent to ${dto.phone}`);
    return { messageId: response.key?.id };
  }

  async sendListMessage(
    dto: SendListMessageDto,
  ): Promise<WhatsAppClientResponse> {
    const slug = (dto as { tenantSlug?: string }).tenantSlug;
    const instanceName = await this.getInstanceName(slug);
    if (!instanceName) throw new HttpException('No WhatsApp instance configured for this tenant', HttpStatus.UNPROCESSABLE_ENTITY);

    const response = await this.makeRequest<{ key?: { id?: string } }>(
      `/message/sendList/${instanceName}`,
      'POST',
      {
        number: dto.phone,
        title: dto.title ?? '',
        description: dto.message,
        footer: dto.footer ?? '',
        buttonText: dto.buttonText,
        sections: dto.sections.map((section) => ({
          title: section.title,
          rows: section.rows.map((row) => ({
            title: row.title,
            description: row.description ?? '',
            rowId: row.id,
          })),
        })),
      },
    );

    this.logger.log(`List message sent to ${dto.phone}`);
    return { messageId: response.key?.id };
  }

  async sendImageMessage(
    dto: SendImageMessageDto,
  ): Promise<WhatsAppClientResponse> {
    const slug = (dto as { tenantSlug?: string }).tenantSlug;
    const instanceName = await this.getInstanceName(slug);
    if (!instanceName) throw new HttpException('No WhatsApp instance configured for this tenant', HttpStatus.UNPROCESSABLE_ENTITY);

    const body: Record<string, unknown> = {
      number: dto.phone,
      mediatype: 'image',
      media: dto.image,
      caption: dto.caption ?? '',
    };
    const quoted = this.buildQuotedKey(dto);
    if (quoted) body.quoted = quoted;

    const response = await this.makeRequest<{ key?: { id?: string } }>(
      `/message/sendMedia/${instanceName}`,
      'POST',
      body,
    );

    this.logger.log(`Image message sent to ${dto.phone}`);
    return { messageId: response.key?.id };
  }

  async sendDocumentMessage(
    dto: SendDocumentMessageDto,
  ): Promise<WhatsAppClientResponse> {
    const slug = (dto as { tenantSlug?: string }).tenantSlug;
    const instanceName = await this.getInstanceName(slug);
    if (!instanceName) throw new HttpException('No WhatsApp instance configured for this tenant', HttpStatus.UNPROCESSABLE_ENTITY);

    const body: Record<string, unknown> = {
      number: dto.phone,
      mediatype: 'document',
      media: dto.document,
      fileName: dto.fileName,
      caption: dto.caption ?? '',
    };
    const quoted = this.buildQuotedKey(dto);
    if (quoted) body.quoted = quoted;

    const response = await this.makeRequest<{ key?: { id?: string } }>(
      `/message/sendMedia/${instanceName}`,
      'POST',
      body,
    );

    this.logger.log(`Document message sent to ${dto.phone}`);
    return { messageId: response.key?.id };
  }

  async sendPixMessage(
    dto: SendPixMessageDto,
  ): Promise<WhatsAppClientResponse> {
    const pixCode = this.generatePixCode(dto);

    const message = dto.description
      ? `${dto.description}\n\nPIX Copia e Cola:\n${pixCode}`
      : `PIX Copia e Cola:\n${pixCode}`;

    const slug = (dto as { tenantSlug?: string }).tenantSlug;
    return this.sendTextMessage({ phone: dto.phone, message, tenantSlug: slug } as SendTextMessageDto);
  }

  async sendAudioMessage(
    dto: SendAudioMessageDto,
  ): Promise<WhatsAppClientResponse> {
    const slug = (dto as { tenantSlug?: string }).tenantSlug;
    const instanceName = await this.getInstanceName(slug);
    if (!instanceName) throw new HttpException('No WhatsApp instance configured for this tenant', HttpStatus.UNPROCESSABLE_ENTITY);

    const endpoint = dto.ptt
      ? `/message/sendWhatsAppAudio/${instanceName}`
      : `/message/sendMedia/${instanceName}`;

    const body: Record<string, unknown> = dto.ptt
      ? { number: dto.phone, audio: dto.audio }
      : { number: dto.phone, mediatype: 'audio', media: dto.audio };
    const quoted = this.buildQuotedKey(dto);
    if (quoted) body.quoted = quoted;

    const response = await this.makeRequest<{ key?: { id?: string } }>(
      endpoint,
      'POST',
      body,
    );

    this.logger.log(`Audio message sent to ${dto.phone}`);
    return { messageId: response.key?.id };
  }

  async sendVideoMessage(
    dto: SendVideoMessageDto,
  ): Promise<WhatsAppClientResponse> {
    const slug = (dto as { tenantSlug?: string }).tenantSlug;
    const instanceName = await this.getInstanceName(slug);
    if (!instanceName) throw new HttpException('No WhatsApp instance configured for this tenant', HttpStatus.UNPROCESSABLE_ENTITY);

    const body: Record<string, unknown> = {
      number: dto.phone,
      mediatype: 'video',
      media: dto.video,
      caption: dto.caption ?? '',
    };
    const quoted = this.buildQuotedKey(dto);
    if (quoted) body.quoted = quoted;

    const response = await this.makeRequest<{ key?: { id?: string } }>(
      `/message/sendMedia/${instanceName}`,
      'POST',
      body,
    );

    this.logger.log(`Video message sent to ${dto.phone}`);
    return { messageId: response.key?.id };
  }

  async sendStickerMessage(
    dto: SendStickerMessageDto,
  ): Promise<WhatsAppClientResponse> {
    const slug = (dto as { tenantSlug?: string }).tenantSlug;
    const instanceName = await this.getInstanceName(slug);
    if (!instanceName) throw new HttpException('No WhatsApp instance configured for this tenant', HttpStatus.UNPROCESSABLE_ENTITY);

    const response = await this.makeRequest<{ key?: { id?: string } }>(
      `/message/sendSticker/${instanceName}`,
      'POST',
      { number: dto.phone, sticker: dto.sticker },
    );

    this.logger.log(`Sticker message sent to ${dto.phone}`);
    return { messageId: response.key?.id };
  }

  async sendLocationMessage(
    dto: SendLocationMessageDto,
  ): Promise<WhatsAppClientResponse> {
    const slug = (dto as { tenantSlug?: string }).tenantSlug;
    const instanceName = await this.getInstanceName(slug);
    if (!instanceName) throw new HttpException('No WhatsApp instance configured for this tenant', HttpStatus.UNPROCESSABLE_ENTITY);

    const response = await this.makeRequest<{ key?: { id?: string } }>(
      `/message/sendLocation/${instanceName}`,
      'POST',
      {
        number: dto.phone,
        latitude: dto.latitude,
        longitude: dto.longitude,
        name: dto.name ?? '',
        address: dto.address ?? '',
      },
    );

    this.logger.log(`Location message sent to ${dto.phone}`);
    return { messageId: response.key?.id };
  }

  async sendContactMessage(
    dto: SendContactMessageDto,
  ): Promise<WhatsAppClientResponse> {
    const slug = (dto as { tenantSlug?: string }).tenantSlug;
    const instanceName = await this.getInstanceName(slug);
    if (!instanceName) throw new HttpException('No WhatsApp instance configured for this tenant', HttpStatus.UNPROCESSABLE_ENTITY);

    const response = await this.makeRequest<{ key?: { id?: string } }>(
      `/message/sendContact/${instanceName}`,
      'POST',
      {
        number: dto.phone,
        contact: dto.contacts.map((c) => ({
          fullName: c.fullName,
          wuid: `${c.phoneNumber}@s.whatsapp.net`,
          phoneNumber: c.phoneNumber,
          organization: c.organization ?? '',
          email: c.email ?? '',
        })),
      },
    );

    this.logger.log(`Contact message sent to ${dto.phone}`);
    return { messageId: response.key?.id };
  }

  async sendReaction(
    dto: SendReactionDto,
  ): Promise<WhatsAppClientResponse> {
    const slug = (dto as { tenantSlug?: string }).tenantSlug;
    const instanceName = await this.getInstanceName(slug);
    if (!instanceName) throw new HttpException('No WhatsApp instance configured for this tenant', HttpStatus.UNPROCESSABLE_ENTITY);

    const response = await this.makeRequest<{ key?: { id?: string } }>(
      `/message/sendReaction/${instanceName}`,
      'POST',
      {
        key: {
          remoteJid: dto.remoteJid,
          fromMe: dto.fromMe,
          id: dto.messageId,
        },
        reaction: dto.reaction,
      },
    );

    this.logger.log(`Reaction sent for message ${dto.messageId}`);
    return { messageId: response.key?.id };
  }

  async sendPoll(
    dto: SendPollDto,
  ): Promise<WhatsAppClientResponse> {
    const slug = (dto as { tenantSlug?: string }).tenantSlug;
    const instanceName = await this.getInstanceName(slug);
    if (!instanceName) throw new HttpException('No WhatsApp instance configured for this tenant', HttpStatus.UNPROCESSABLE_ENTITY);

    const response = await this.makeRequest<{ key?: { id?: string } }>(
      `/message/sendPoll/${instanceName}`,
      'POST',
      {
        number: dto.phone,
        name: dto.name,
        selectableCount: dto.selectableCount ?? 1,
        values: dto.options,
      },
    );

    this.logger.log(`Poll sent to ${dto.phone}`);
    return { messageId: response.key?.id };
  }

  async readMessages(phone: string): Promise<void> {
    const instanceName = await this.getInstanceName();
    if (!instanceName) return;

    await this.makeRequest(`/chat/markMessageAsRead/${instanceName}`, 'POST', {
      readMessages: [
        { remoteJid: `${phone}@s.whatsapp.net`, fromMe: false, id: 'all' },
      ],
    });

    this.logger.log(`Messages marked as read for ${phone}`);
  }

  async checkNumber(phone: string): Promise<{ exists: boolean; jid?: string }> {
    const instanceName = await this.getInstanceName();
    if (!instanceName) return { exists: false };

    const response = await this.makeRequest<
      { exists: boolean; jid?: string }[]
    >(`/chat/whatsappNumbers/${instanceName}`, 'POST', { numbers: [phone] });

    const first = Array.isArray(response) ? response[0] : undefined;
    return { exists: first?.exists ?? false, jid: first?.jid };
  }

  async disconnect(): Promise<void> {
    const instanceName = await this.getInstanceName();
    if (!instanceName) return;

    await this.makeRequest(`/instance/logout/${instanceName}`, 'DELETE');
    this.logger.log('Instance disconnected');
  }

  async restart(): Promise<void> {
    const instanceName = await this.getInstanceName();
    if (!instanceName) return;

    await this.makeRequest(`/instance/restart/${instanceName}`, 'PUT');
    this.logger.log('Instance restarted');
  }

  // ── Chat operations (direct, not through WhatsAppClientInterface) ──

  async sendPresence(
    instanceName: string,
    phone: string,
    presence: string,
    delay?: number,
  ): Promise<void> {
    await this.makeRequest(`/chat/sendPresence/${instanceName}`, 'POST', {
      number: `${phone}@s.whatsapp.net`,
      presence,
      delay: delay ?? 0,
    });
  }

  async deleteMessage(
    instanceName: string,
    messageId: string,
    remoteJid: string,
    fromMe: boolean,
  ): Promise<void> {
    await this.makeRequest(
      `/chat/deleteMessageForEveryone/${instanceName}`,
      'POST',
      { id: messageId, fromMe, remoteJid },
    );
  }

  async editMessage(
    instanceName: string,
    messageId: string,
    remoteJid: string,
    fromMe: boolean,
    text: string,
  ): Promise<void> {
    await this.makeRequest(
      `/chat/updateMessage/${instanceName}`,
      'POST',
      {
        number: remoteJid,
        key: { remoteJid, fromMe, id: messageId },
        text,
      },
    );
  }

  async blockContact(instanceName: string, phone: string): Promise<void> {
    await this.makeRequest(
      `/chat/updateBlockStatus/${instanceName}`,
      'POST',
      { number: `${phone}@s.whatsapp.net`, status: 'block' },
    );
  }

  async unblockContact(instanceName: string, phone: string): Promise<void> {
    await this.makeRequest(
      `/chat/updateBlockStatus/${instanceName}`,
      'POST',
      { number: `${phone}@s.whatsapp.net`, status: 'unblock' },
    );
  }

  async fetchProfile(
    instanceName: string,
    phone: string,
  ): Promise<Record<string, unknown>> {
    return this.makeRequest<Record<string, unknown>>(
      `/chat/fetchProfile/${instanceName}`,
      'POST',
      { number: `${phone}@s.whatsapp.net` },
    );
  }

  async updateProfileName(instanceName: string, name: string): Promise<void> {
    await this.makeRequest(
      `/chat/updateProfileName/${instanceName}`,
      'POST',
      { name },
    );
  }

  async updateProfileStatus(instanceName: string, status: string): Promise<void> {
    await this.makeRequest(
      `/chat/updateProfileStatus/${instanceName}`,
      'POST',
      { status },
    );
  }

  async updateProfilePicture(instanceName: string, picture: string): Promise<void> {
    await this.makeRequest(
      `/chat/updateProfilePicture/${instanceName}`,
      'POST',
      { picture },
    );
  }

  async fetchPrivacySettings(instanceName: string): Promise<Record<string, unknown>> {
    return this.makeRequest<Record<string, unknown>>(
      `/chat/fetchPrivacySettings/${instanceName}`,
      'GET',
    );
  }

  async updatePrivacySettings(
    instanceName: string,
    settings: Record<string, string>,
  ): Promise<void> {
    await this.makeRequest(
      `/chat/updatePrivacySettings/${instanceName}`,
      'POST',
      settings,
    );
  }

  async setGlobalPresence(instanceName: string, presence: string): Promise<void> {
    await this.makeRequest(
      `/instance/setPresence/${instanceName}`,
      'POST',
      { presence },
    );
  }

  async downloadMedia(
    instanceName: string,
    messageId: string,
    remoteJid: string,
    fromMe: boolean,
  ): Promise<{ base64: string; mimetype: string }> {
    return this.makeRequest<{ base64: string; mimetype: string }>(
      `/chat/getBase64FromMediaMessage/${instanceName}`,
      'POST',
      { message: { key: { remoteJid, fromMe, id: messageId } } },
    );
  }

  // ── Group operations ──────────────────────────────────────

  async createGroup(
    instanceName: string,
    subject: string,
    participants: string[],
    description?: string,
  ): Promise<Record<string, unknown>> {
    return this.makeRequest<Record<string, unknown>>(
      `/group/create/${instanceName}`,
      'POST',
      { subject, participants, description },
    );
  }

  async fetchAllGroups(instanceName: string): Promise<Record<string, unknown>[]> {
    return this.makeRequest<Record<string, unknown>[]>(
      `/group/fetchAllGroups/${instanceName}?getParticipants=false`,
      'GET',
    );
  }

  async findGroupInfo(instanceName: string, groupJid: string): Promise<Record<string, unknown>> {
    return this.makeRequest<Record<string, unknown>>(
      `/group/findGroupInfos/${instanceName}?groupJid=${encodeURIComponent(groupJid)}`,
      'GET',
    );
  }

  async fetchGroupParticipants(instanceName: string, groupJid: string): Promise<Record<string, unknown>[]> {
    return this.makeRequest<Record<string, unknown>[]>(
      `/group/participants/${instanceName}?groupJid=${encodeURIComponent(groupJid)}`,
      'GET',
    );
  }

  async fetchGroupInviteCode(instanceName: string, groupJid: string): Promise<{ inviteCode: string }> {
    return this.makeRequest<{ inviteCode: string }>(
      `/group/inviteCode/${instanceName}?groupJid=${encodeURIComponent(groupJid)}`,
      'GET',
    );
  }

  async updateGroupSubject(instanceName: string, groupJid: string, subject: string): Promise<void> {
    await this.makeRequest(
      `/group/updateGroupSubject/${instanceName}`,
      'POST',
      { groupJid, subject },
    );
  }

  async updateGroupDescription(instanceName: string, groupJid: string, description: string): Promise<void> {
    await this.makeRequest(
      `/group/updateGroupDescription/${instanceName}`,
      'POST',
      { groupJid, description },
    );
  }

  async updateGroupPicture(instanceName: string, groupJid: string, picture: string): Promise<void> {
    await this.makeRequest(
      `/group/updateGroupPicture/${instanceName}`,
      'POST',
      { groupJid, image: picture },
    );
  }

  async updateGroupParticipants(
    instanceName: string,
    groupJid: string,
    action: string,
    participants: string[],
  ): Promise<Record<string, unknown>> {
    return this.makeRequest<Record<string, unknown>>(
      `/group/updateParticipant/${instanceName}`,
      'POST',
      { groupJid, action, participants },
    );
  }

  async updateGroupSetting(instanceName: string, groupJid: string, action: string): Promise<void> {
    await this.makeRequest(
      `/group/updateSetting/${instanceName}`,
      'POST',
      { groupJid, action },
    );
  }

  async sendGroupInvite(
    instanceName: string,
    groupJid: string,
    numbers: string[],
    description?: string,
  ): Promise<void> {
    await this.makeRequest(
      `/group/sendInvite/${instanceName}`,
      'POST',
      { groupJid, numbers, description },
    );
  }

  async leaveGroup(instanceName: string, groupJid: string): Promise<void> {
    await this.makeRequest(
      `/group/leaveGroup/${instanceName}?groupJid=${encodeURIComponent(groupJid)}`,
      'DELETE',
    );
  }

  // ── Labels ────────────────────────────────────────────────

  async findLabels(instanceName: string): Promise<Record<string, unknown>[]> {
    return this.makeRequest<Record<string, unknown>[]>(
      `/label/findLabels/${instanceName}`,
      'GET',
    );
  }

  async handleLabel(
    instanceName: string,
    labelId: string,
    chatId: string,
    action: 'add' | 'remove',
  ): Promise<void> {
    await this.makeRequest(
      `/label/handleLabel/${instanceName}`,
      'POST',
      { labelId, chatId, action },
    );
  }

  // ── Archive ───────────────────────────────────────────────

  async archiveChat(instanceName: string, chatId: string, archive: boolean): Promise<void> {
    await this.makeRequest(
      `/chat/archiveChat/${instanceName}`,
      'POST',
      { chat: chatId, archive },
    );
  }

  // ── Status/Stories ────────────────────────────────────────

  async sendStatus(
    instanceName: string,
    type: 'text' | 'image' | 'video' | 'audio',
    content: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.makeRequest<Record<string, unknown>>(
      `/message/sendStatus/${instanceName}`,
      'POST',
      { type, ...content },
    );
  }
}
