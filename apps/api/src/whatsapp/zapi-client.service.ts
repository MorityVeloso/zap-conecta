/**
 * Z-API Client Service
 * Handles communication with Z-API WhatsApp API
 *
 * @deprecated Use EvolutionApiClientService via WHATSAPP_CLIENT injection token instead.
 * Kept for rollback via WHATSAPP_PROVIDER=zapi environment variable.
 */

import { Injectable, Logger, NotImplementedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

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
import type { WhatsAppClientResponse } from './whatsapp-client.interface';

/** @deprecated Use WhatsAppClientResponse instead */
export interface ZApiResponse {
  zapiMessageId?: string;
  messageId?: string;
  phone?: string;
  status?: string;
  error?: string;
}

export interface ZApiConfig {
  instanceId: string;
  token: string;
  baseUrl: string;
}

/** @deprecated Use EvolutionApiClientService instead */
@Injectable()
export class ZApiClientService {
  private readonly logger = new Logger(ZApiClientService.name);
  private readonly baseUrl: string;
  private readonly instanceId: string;
  private readonly token: string;
  private readonly clientToken: string;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl = this.configService.get<string>(
      'ZAPI_BASE_URL',
      'https://api.z-api.io',
    );
    this.instanceId = this.configService.get<string>('ZAPI_INSTANCE_ID', '');
    this.token = this.configService.get<string>('ZAPI_TOKEN', '');
    this.clientToken = this.configService.get<string>('ZAPI_CLIENT_TOKEN', '');
  }

  /**
   * Get headers for Z-API requests
   */
  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Client-Token': this.clientToken,
    };
  }

  /**
   * Build endpoint URL
   */
  private buildUrl(endpoint: string): string {
    return `${this.baseUrl}/instances/${this.instanceId}/token/${this.token}/${endpoint}`;
  }

  /**
   * Make HTTP request to Z-API
   */
  private async makeRequest<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    body?: unknown,
  ): Promise<T> {
    const url = this.buildUrl(endpoint);

    try {
      const response = await fetch(url, {
        method,
        headers: this.getHeaders(),
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(
          `Z-API error: ${String(response.status)} - ${errorText}`,
        );
        throw new Error(`Z-API request failed: ${String(response.status)}`);
      }

      return (await response.json()) as T;
    } catch (error) {
      this.logger.error(`Z-API request error: ${String(error)}`);
      throw error;
    }
  }

  /**
   * Check if Z-API is configured
   */
  isConfigured(): boolean {
    return Boolean(this.instanceId && this.token);
  }

  /**
   * Get instance status
   */
  async getStatus(): Promise<{ connected: boolean; phone?: string }> {
    const response = await this.makeRequest<{
      connected: boolean;
      phone?: string;
    }>('status', 'GET');

    return response;
  }

  /**
   * Get QR Code for connection
   */
  async getQrCode(): Promise<{ qrcode: string; imageBase64?: string }> {
    const response = await this.makeRequest<{
      value: string;
      imageBase64?: string;
    }>('qr-code', 'GET');

    return {
      qrcode: response.value,
      imageBase64: response.imageBase64,
    };
  }

  /**
   * Send text message
   */
  async sendTextMessage(dto: SendTextMessageDto): Promise<ZApiResponse> {
    const response = await this.makeRequest<ZApiResponse>('send-text', 'POST', {
      phone: dto.phone,
      message: dto.message,
    });

    this.logger.log(`Text message sent to ${dto.phone}`);
    return response;
  }

  /**
   * Send button message
   */
  async sendButtonMessage(dto: SendButtonMessageDto): Promise<ZApiResponse> {
    const response = await this.makeRequest<ZApiResponse>(
      'send-button-list',
      'POST',
      {
        phone: dto.phone,
        message: dto.message,
        title: dto.title,
        footer: dto.footer,
        buttonList: {
          buttons: dto.buttons.map((btn) => ({
            id: btn.id,
            label: btn.text,
          })),
        },
      },
    );

    this.logger.log(`Button message sent to ${dto.phone}`);
    return response;
  }

  /**
   * Send list message
   */
  async sendListMessage(dto: SendListMessageDto): Promise<ZApiResponse> {
    // Z-API expects optionList wrapper with flat options array (no sections/rows nesting)
    const allOptions = dto.sections.flatMap((section) =>
      section.rows.map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description,
      })),
    );

    const response = await this.makeRequest<ZApiResponse>(
      'send-option-list',
      'POST',
      {
        phone: dto.phone,
        message: dto.message,
        optionList: {
          title: dto.sections[0]?.title ?? 'Opções',
          buttonLabel: dto.buttonText,
          options: allOptions,
        },
      },
    );

    this.logger.log(`List message sent to ${dto.phone}`);
    return response;
  }

  /**
   * Send image message
   */
  async sendImageMessage(dto: SendImageMessageDto): Promise<ZApiResponse> {
    const response = await this.makeRequest<ZApiResponse>(
      'send-image',
      'POST',
      {
        phone: dto.phone,
        image: dto.image,
        caption: dto.caption,
      },
    );

    this.logger.log(`Image message sent to ${dto.phone}`);
    return response;
  }

  /**
   * Send document message
   */
  async sendDocumentMessage(
    dto: SendDocumentMessageDto,
  ): Promise<ZApiResponse> {
    const response = await this.makeRequest<ZApiResponse>(
      'send-document',
      'POST',
      {
        phone: dto.phone,
        document: dto.document,
        fileName: dto.fileName,
        caption: dto.caption,
      },
    );

    this.logger.log(`Document message sent to ${dto.phone}`);
    return response;
  }

  /**
   * Generate PIX QR Code and send as image
   */
  async sendPixMessage(dto: SendPixMessageDto): Promise<ZApiResponse> {
    // Generate PIX EMV code
    const pixCode = this.generatePixCode(dto);

    // Send as text with PIX code
    const message = dto.description
      ? `${dto.description}\n\nPIX: ${pixCode}`
      : `PIX: ${pixCode}`;

    const response = await this.makeRequest<ZApiResponse>('send-text', 'POST', {
      phone: dto.phone,
      message,
    });

    this.logger.log(`PIX message sent to ${dto.phone}`);
    return response;
  }

  /**
   * Generate PIX EMV code (simplified BR Code)
   */
  private generatePixCode(dto: SendPixMessageDto): string {
    // Simplified PIX code generation
    // In production, use a proper library like 'pix-utils' or 'pix-payload'
    const pixKeyTypeMap: Record<string, string> = {
      cpf: '01',
      cnpj: '02',
      email: '03',
      phone: '04',
      random: '05',
    };

    const formatAmount = (amount: number): string => amount.toFixed(2);

    const fields = [
      '000201', // Payload Format Indicator
      '010212', // Static QR Code
      `26${this.padField(`0014br.gov.bcb.pix01${pixKeyTypeMap[dto.pixKeyType] ?? '05'}${String(dto.pixKey.length).padStart(2, '0')}${dto.pixKey}`)}`,
      '52040000', // Merchant Category Code
      '5303986', // Transaction Currency (BRL)
      dto.amount > 0
        ? `54${formatAmount(dto.amount).length.toString().padStart(2, '0')}${formatAmount(dto.amount)}`
        : '',
      '5802BR', // Country Code
      `59${dto.merchantName.length.toString().padStart(2, '0')}${dto.merchantName}`,
      `60${dto.merchantCity.length.toString().padStart(2, '0')}${dto.merchantCity}`,
      dto.txid
        ? `62${this.padField(`05${dto.txid.length.toString().padStart(2, '0')}${dto.txid}`)}`
        : '',
      '6304', // CRC placeholder
    ];

    const codeWithoutCrc = fields.filter(Boolean).join('');
    const crc = this.calculateCrc16(codeWithoutCrc);

    return codeWithoutCrc + crc;
  }

  /**
   * Pad field with length
   */
  private padField(content: string): string {
    return content.length.toString().padStart(2, '0') + content;
  }

  /**
   * Calculate CRC-16 CCITT
   */
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

  /**
   * Read messages from chat
   */
  async readMessages(phone: string): Promise<void> {
    await this.makeRequest<ZApiResponse>('read-message', 'POST', {
      phone,
    });

    this.logger.log(`Messages marked as read for ${phone}`);
  }

  /**
   * Check if phone has WhatsApp
   */
  async checkNumber(
    _phone: string,
  ): Promise<{ exists: boolean; jid?: string }> {
    const response = await this.makeRequest<{
      exists: boolean;
      jid?: string;
    }>('phone-exists', 'GET');

    return response;
  }

  /**
   * Get chat profile picture
   */
  async getProfilePicture(phone: string): Promise<{ url?: string }> {
    const response = await this.makeRequest<{
      profilePictureUrl?: string;
    }>(`profile-picture/${phone}`, 'GET');

    return { url: response.profilePictureUrl };
  }

  async sendAudioMessage(_dto: SendAudioMessageDto): Promise<WhatsAppClientResponse> {
    throw new NotImplementedException('Z-API sendAudioMessage not implemented — use Evolution API');
  }

  async sendVideoMessage(_dto: SendVideoMessageDto): Promise<WhatsAppClientResponse> {
    throw new NotImplementedException('Z-API sendVideoMessage not implemented — use Evolution API');
  }

  async sendStickerMessage(_dto: SendStickerMessageDto): Promise<WhatsAppClientResponse> {
    throw new NotImplementedException('Z-API sendStickerMessage not implemented — use Evolution API');
  }

  async sendLocationMessage(_dto: SendLocationMessageDto): Promise<WhatsAppClientResponse> {
    throw new NotImplementedException('Z-API sendLocationMessage not implemented — use Evolution API');
  }

  async sendContactMessage(_dto: SendContactMessageDto): Promise<WhatsAppClientResponse> {
    throw new NotImplementedException('Z-API sendContactMessage not implemented — use Evolution API');
  }

  async sendReaction(_dto: SendReactionDto): Promise<WhatsAppClientResponse> {
    throw new NotImplementedException('Z-API sendReaction not implemented — use Evolution API');
  }

  async sendPoll(_dto: SendPollDto): Promise<WhatsAppClientResponse> {
    throw new NotImplementedException('Z-API sendPoll not implemented — use Evolution API');
  }

  /**
   * Disconnect instance
   */
  async disconnect(): Promise<void> {
    await this.makeRequest<ZApiResponse>('disconnect', 'POST');
    this.logger.log('Instance disconnected');
  }

  /**
   * Restart instance
   */
  async restart(): Promise<void> {
    await this.makeRequest<ZApiResponse>('restart', 'POST');
    this.logger.log('Instance restarted');
  }
}
