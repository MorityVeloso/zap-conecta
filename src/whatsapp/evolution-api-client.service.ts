/**
 * Evolution API Client Service
 * Implements WhatsAppClientInterface using Evolution API v2 (self-hosted).
 * Adapted from saas-whatsapp-b2b — uses local PrismaService, no TenantContextService,
 * PIX generation inlined (no external PixGeneratorService).
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../prisma/prisma.service';

import type {
  SendTextMessageDto,
  SendButtonMessageDto,
  SendListMessageDto,
  SendImageMessageDto,
  SendDocumentMessageDto,
  SendPixMessageDto,
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

  private async getInstanceName(
    overrideSlug?: string,
  ): Promise<string | null> {
    const slug =
      overrideSlug ??
      this.configService.get<string>('DEFAULT_INSTANCE_SLUG', 'default');

    const instance = await this.prisma.whatsAppInstance.findFirst({
      where: { tenantSlug: slug },
    });

    return instance?.instanceName ?? null;
  }

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
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(
          `Evolution API error: ${String(response.status)} - ${errorText}`,
        );
        throw new Error(
          `Evolution API request failed: ${String(response.status)}`,
        );
      }

      const text = await response.text();
      if (!text) return {} as T;
      return JSON.parse(text) as T;
    } catch (error) {
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
    if (!instanceName) throw new Error('No WhatsApp instance');

    const response = await this.makeRequest<{ key?: { id?: string } }>(
      `/message/sendText/${instanceName}`,
      'POST',
      { number: dto.phone, text: dto.message },
    );

    this.logger.log(`Text message sent to ${dto.phone}`);
    return { messageId: response.key?.id };
  }

  async sendButtonMessage(
    dto: SendButtonMessageDto,
  ): Promise<WhatsAppClientResponse> {
    const instanceName = await this.getInstanceName();
    if (!instanceName) throw new Error('No WhatsApp instance');

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
    const instanceName = await this.getInstanceName();
    if (!instanceName) throw new Error('No WhatsApp instance');

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
    const instanceName = await this.getInstanceName();
    if (!instanceName) throw new Error('No WhatsApp instance');

    const response = await this.makeRequest<{ key?: { id?: string } }>(
      `/message/sendMedia/${instanceName}`,
      'POST',
      {
        number: dto.phone,
        mediatype: 'image',
        media: dto.image,
        caption: dto.caption ?? '',
      },
    );

    this.logger.log(`Image message sent to ${dto.phone}`);
    return { messageId: response.key?.id };
  }

  async sendDocumentMessage(
    dto: SendDocumentMessageDto,
  ): Promise<WhatsAppClientResponse> {
    const instanceName = await this.getInstanceName();
    if (!instanceName) throw new Error('No WhatsApp instance');

    const response = await this.makeRequest<{ key?: { id?: string } }>(
      `/message/sendMedia/${instanceName}`,
      'POST',
      {
        number: dto.phone,
        mediatype: 'document',
        media: dto.document,
        fileName: dto.fileName,
        caption: dto.caption ?? '',
      },
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

    return this.sendTextMessage({ phone: dto.phone, message });
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
}
