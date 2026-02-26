/**
 * WhatsApp Service
 * Core messaging logic — no business-domain dependencies.
 * Adapted from saas-whatsapp-b2b: removed CustomersService, OrdersService,
 * CycleOrderService. handleReceivedMessage is a clean extension point.
 */

import {
  Injectable,
  Inject,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { ConversationStateService } from './conversation-state.service';
import type {
  SendTextMessageDto,
  SendButtonMessageDto,
  SendListMessageDto,
  SendImageMessageDto,
  SendDocumentMessageDto,
  SendPixMessageDto,
  SendTemplateMessageDto,
} from './dto/message.dto';
import type {
  ReceivedMessageWebhook,
  MessageStatusWebhook,
} from './dto/webhook.dto';
import {
  WHATSAPP_CLIENT,
  type WhatsAppClientInterface,
  type WhatsAppClientResponse,
} from './whatsapp-client.interface';

export interface MessageResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface ConnectionStatus {
  connected: boolean;
  phone?: string;
  instanceConfigured: boolean;
}

// Built-in message templates (variable substitution via {{key}})
const MESSAGE_TEMPLATES: Record<string, string> = {
  WELCOME: `Olá {{name}}! 👋\n\nBem-vindo(a)!\n\nComo posso ajudar você hoje?`,
  PAYMENT_PIX: `Olá {{name}}! 💳\n\nSeu pagamento de R$ {{amount}} está aguardando.\n\nSe precisar de ajuda, é só responder esta mensagem!`,
};

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);

  constructor(
    @Inject(WHATSAPP_CLIENT)
    private readonly whatsappClient: WhatsAppClientInterface,
    private readonly conversationState: ConversationStateService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ── Connection ─────────────────────────────────────────────

  async getConnectionStatus(): Promise<ConnectionStatus> {
    if (!this.whatsappClient.isConfigured()) {
      return { connected: false, instanceConfigured: false };
    }

    try {
      const status = await this.whatsappClient.getStatus();
      return { ...status, instanceConfigured: true };
    } catch {
      return { connected: false, instanceConfigured: true };
    }
  }

  async getQrCode(): Promise<{ qrcode: string; imageBase64?: string }> {
    this.ensureConfigured();
    return this.whatsappClient.getQrCode();
  }

  async disconnect(): Promise<void> {
    this.ensureConfigured();
    await this.whatsappClient.disconnect();
  }

  async restart(): Promise<void> {
    this.ensureConfigured();
    await this.whatsappClient.restart();
  }

  // ── Messaging ──────────────────────────────────────────────

  async sendTextMessage(dto: SendTextMessageDto): Promise<MessageResult> {
    this.ensureConfigured();
    try {
      return this.mapResponse(await this.whatsappClient.sendTextMessage(dto));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async sendButtonMessage(dto: SendButtonMessageDto): Promise<MessageResult> {
    this.ensureConfigured();
    try {
      return this.mapResponse(await this.whatsappClient.sendButtonMessage(dto));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async sendListMessage(dto: SendListMessageDto): Promise<MessageResult> {
    this.ensureConfigured();
    try {
      return this.mapResponse(await this.whatsappClient.sendListMessage(dto));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async sendImageMessage(dto: SendImageMessageDto): Promise<MessageResult> {
    this.ensureConfigured();
    try {
      return this.mapResponse(await this.whatsappClient.sendImageMessage(dto));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async sendDocumentMessage(
    dto: SendDocumentMessageDto,
  ): Promise<MessageResult> {
    this.ensureConfigured();
    try {
      return this.mapResponse(
        await this.whatsappClient.sendDocumentMessage(dto),
      );
    } catch (error) {
      return this.handleError(error);
    }
  }

  async sendPixMessage(dto: SendPixMessageDto): Promise<MessageResult> {
    this.ensureConfigured();
    try {
      return this.mapResponse(await this.whatsappClient.sendPixMessage(dto));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async sendTemplateMessage(
    dto: SendTemplateMessageDto,
  ): Promise<MessageResult> {
    this.ensureConfigured();

    const template = MESSAGE_TEMPLATES[dto.templateId];
    if (!template) {
      throw new BadRequestException(`Template "${dto.templateId}" not found`);
    }

    let message = template;
    if (dto.variables) {
      for (const [key, value] of Object.entries(dto.variables)) {
        message = message.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
      }
    }

    return this.sendTextMessage({ phone: dto.phone, message });
  }

  // ── Webhook handlers ───────────────────────────────────────

  /**
   * Handle incoming message from webhook.
   * Emits 'whatsapp.message.received' for MessagesListener to persist.
   */
  async handleReceivedMessage(
    tenantSlug: string,
    payload: ReceivedMessageWebhook,
    tenantId?: string,
    instanceId?: string,
  ): Promise<void> {
    const fromApi = Boolean((payload as Record<string, unknown>).fromApi);
    if (fromApi) return;

    // Skip group messages (not button/list responses)
    if (
      payload.isGroup &&
      !payload.listResponse &&
      !payload.listResponseMessage &&
      !payload.buttonResponse &&
      !payload.buttonsResponseMessage
    ) {
      return;
    }

    const phone = payload.phone.replace('@c.us', '');
    const textContent =
      payload.text?.message ??
      (payload.image ? '[image]' : null) ??
      (payload.audio ? '[audio]' : null) ??
      (payload.video ? '[video]' : null) ??
      (payload.document ? '[document]' : null) ??
      '[unknown]';

    this.logger.log(
      `[${tenantSlug}] from=${phone} fromMe=${String(payload.fromMe ?? false)} content=${textContent}`,
    );

    if (tenantId && instanceId) {
      const type = payload.image ? 'image'
        : payload.audio ? 'audio'
        : payload.video ? 'video'
        : payload.document ? 'document'
        : 'text';

      void this.eventEmitter.emitAsync('whatsapp.message.received', {
        tenantId,
        instanceId,
        phone,
        type,
        content: { text: textContent },
      });
    }
  }

  /**
   * Emit a sent-message event so MessagesListener can persist it.
   * Call after a successful send* response.
   */
  emitSent(
    tenantId: string,
    instanceId: string,
    phone: string,
    type: string,
    content: Record<string, unknown>,
    externalId?: string,
  ): void {
    void this.eventEmitter.emitAsync('whatsapp.message.sent', {
      tenantId,
      instanceId,
      phone,
      type,
      content,
      externalId,
    });
  }

  handleMessageStatus(payload: MessageStatusWebhook): void {
    this.logger.log(`Message ${payload.messageId} status: ${payload.status}`);
  }

  // ── Private ────────────────────────────────────────────────

  private ensureConfigured(): void {
    if (!this.whatsappClient.isConfigured()) {
      throw new BadRequestException('WhatsApp integration is not configured');
    }
  }

  private mapResponse(response: WhatsAppClientResponse): MessageResult {
    if (response.error) {
      return { success: false, error: response.error };
    }
    return { success: true, messageId: response.messageId };
  }

  private handleError(error: unknown): MessageResult {
    const message = error instanceof Error ? error.message : 'Unknown error';
    this.logger.error(`WhatsApp error: ${message}`);
    return { success: false, error: message };
  }
}
