/**
 * WhatsApp Controller
 * REST endpoints for WhatsApp messaging + Evolution API instance management.
 * Adapted from saas-whatsapp-b2b:
 *  - Removed TenantContextService (uses header x-tenant-slug or DEFAULT_INSTANCE_SLUG)
 *  - Removed @RequirePermissions (global ApiKeyGuard handles auth)
 *  - Removed zodToOpenApi helper (plain @ApiBody descriptions)
 *  - Removed order/customer business endpoints
 */

import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  Logger,
  UsePipes,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiTags,
  ApiSecurity,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';

import { Public } from '../auth/public.decorator';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import type { TenantContext } from '../auth/supabase-jwt.guard';

import {
  EvolutionMessagesUpsertDataSchema,
  EvolutionMessagesUpdateDataSchema,
  EvolutionConnectionUpdateDataSchema,
} from './dto/evolution-webhook.dto';
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
import { EvolutionInstanceService } from './evolution-instance.service';
import {
  transformEvolutionMessage,
  transformEvolutionMessageStatus,
} from './evolution-webhook.transformer';
import { WhatsAppService, type MessageResult } from './whatsapp.service';

@ApiTags('WhatsApp')
@ApiSecurity('x-api-key')
@Controller('whatsapp')
export class WhatsAppController {
  private readonly logger = new Logger(WhatsAppController.name);

  constructor(
    private readonly whatsAppService: WhatsAppService,
    private readonly evolutionInstanceService: EvolutionInstanceService,
    private readonly configService: ConfigService,
  ) {}

  // ── Connection ─────────────────────────────────────────────

  @Get('status')
  @ApiOperation({ summary: 'Get WhatsApp connection status' })
  @ApiResponse({ status: 200, description: 'Connection status retrieved' })
  async getStatus() {
    const connectionStatus = await this.whatsAppService.getConnectionStatus();

    if (connectionStatus.connected) {
      return {
        status: 'CONNECTED' as const,
        phone: connectionStatus.phone,
        instanceConfigured: true,
      };
    }

    if (connectionStatus.instanceConfigured) {
      try {
        const qrData = await this.whatsAppService.getQrCode();
        if (qrData.imageBase64 ?? qrData.qrcode) {
          return {
            status: 'QR_CODE' as const,
            qrCode: qrData.imageBase64 ?? qrData.qrcode,
            instanceConfigured: true,
          };
        }
      } catch {
        // QR not available yet
      }
    }

    return {
      status: 'DISCONNECTED' as const,
      phone: connectionStatus.phone,
      instanceConfigured: connectionStatus.instanceConfigured,
    };
  }

  @Post('connect')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Connect WhatsApp instance (get QR code)' })
  @ApiResponse({ status: 200, description: 'QR code returned for scanning' })
  async connect(
    @CurrentTenant() tenant: TenantContext,
  ) {
    await this.evolutionInstanceService.getOrCreateInstance(tenant.tenantSlug, tenant.tenantId);

    try {
      const qrData = await this.whatsAppService.getQrCode();
      return {
        status: 'QR_CODE' as const,
        qrCode: qrData.imageBase64 ?? qrData.qrcode,
      };
    } catch (error) {
      this.logger.warn(`Failed to get QR code: ${String(error)}`);
      return {
        status: 'DISCONNECTED' as const,
        error: 'Não foi possível gerar o QR code. Tente novamente.',
      };
    }
  }

  @Get('qr-code')
  @ApiOperation({ summary: 'Get QR code for WhatsApp connection' })
  @ApiResponse({ status: 200, description: 'QR code retrieved' })
  async getQrCode(): Promise<{ qrcode: string; imageBase64?: string }> {
    return this.whatsAppService.getQrCode();
  }

  @Post('disconnect')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Disconnect WhatsApp instance' })
  @ApiResponse({ status: 200, description: 'Disconnected successfully' })
  async disconnect(): Promise<{ success: boolean }> {
    await this.whatsAppService.disconnect();
    return { success: true };
  }

  @Post('restart')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Restart WhatsApp instance' })
  @ApiResponse({ status: 200, description: 'Restarted successfully' })
  async restart(): Promise<{ success: boolean }> {
    await this.whatsAppService.restart();
    return { success: true };
  }

  // ── Instance Management ────────────────────────────────────

  @Post('instance/create')
  @ApiOperation({ summary: 'Create WhatsApp instance for tenant' })
  @ApiResponse({ status: 201, description: 'Instance created' })
  async createInstance(
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.evolutionInstanceService.createInstance(tenant.tenantSlug, tenant.tenantId);
  }

  @Get('instance')
  @ApiOperation({ summary: 'Get WhatsApp instance for tenant' })
  @ApiResponse({ status: 200, description: 'Instance retrieved' })
  async getInstance(
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.evolutionInstanceService.getInstance(tenant.tenantSlug);
  }

  @Delete('instance')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete WhatsApp instance for tenant' })
  @ApiResponse({ status: 204, description: 'Instance deleted' })
  async deleteInstance(
    @CurrentTenant() tenant: TenantContext,
  ): Promise<void> {
    await this.evolutionInstanceService.deleteInstance(tenant.tenantSlug);
  }

  @Post('instance/sync-status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sync WhatsApp instance connection status' })
  @ApiResponse({ status: 200, description: 'Status synced' })
  async syncInstanceStatus(
    @CurrentTenant() tenant: TenantContext,
  ) {
    const status = await this.evolutionInstanceService.syncStatus(tenant.tenantSlug);
    return { status };
  }

  // ── Messaging ──────────────────────────────────────────────

  @Post('send/text')
  @ApiOperation({ summary: 'Send a text message via WhatsApp' })
  @ApiResponse({ status: 201, description: 'Text message sent' })
  async sendText(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: SendTextMessageDto,
  ): Promise<MessageResult> {
    const result = await this.whatsAppService.sendTextMessage(dto);
    if (result.success) {
      this.whatsAppService.emitSent(tenant.tenantId, tenant.tenantSlug, dto.phone, 'text', { text: dto.message }, result.messageId);
    }
    return result;
  }

  @Post('send/button')
  @ApiOperation({ summary: 'Send a button message via WhatsApp' })
  @ApiResponse({ status: 201, description: 'Button message sent' })
  async sendButton(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: SendButtonMessageDto,
  ): Promise<MessageResult> {
    const result = await this.whatsAppService.sendButtonMessage(dto);
    if (result.success) {
      this.whatsAppService.emitSent(tenant.tenantId, tenant.tenantSlug, dto.phone, 'button', { title: dto.title }, result.messageId);
    }
    return result;
  }

  @Post('send/list')
  @ApiOperation({ summary: 'Send a list message via WhatsApp' })
  @ApiResponse({ status: 201, description: 'List message sent' })
  async sendList(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: SendListMessageDto,
  ): Promise<MessageResult> {
    const result = await this.whatsAppService.sendListMessage(dto);
    if (result.success) {
      this.whatsAppService.emitSent(tenant.tenantId, tenant.tenantSlug, dto.phone, 'list', { title: dto.title }, result.messageId);
    }
    return result;
  }

  @Post('send/image')
  @ApiOperation({ summary: 'Send an image message via WhatsApp' })
  @ApiResponse({ status: 201, description: 'Image message sent' })
  async sendImage(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: SendImageMessageDto,
  ): Promise<MessageResult> {
    const result = await this.whatsAppService.sendImageMessage(dto);
    if (result.success) {
      this.whatsAppService.emitSent(tenant.tenantId, tenant.tenantSlug, dto.phone, 'image', { image: dto.image }, result.messageId);
    }
    return result;
  }

  @Post('send/document')
  @ApiOperation({ summary: 'Send a document message via WhatsApp' })
  @ApiResponse({ status: 201, description: 'Document message sent' })
  async sendDocument(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: SendDocumentMessageDto,
  ): Promise<MessageResult> {
    const result = await this.whatsAppService.sendDocumentMessage(dto);
    if (result.success) {
      this.whatsAppService.emitSent(tenant.tenantId, tenant.tenantSlug, dto.phone, 'document', { document: dto.document }, result.messageId);
    }
    return result;
  }

  @Post('send/pix')
  @ApiOperation({ summary: 'Send a PIX payment message via WhatsApp' })
  @ApiResponse({ status: 201, description: 'PIX message sent' })
  async sendPix(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: SendPixMessageDto,
  ): Promise<MessageResult> {
    const result = await this.whatsAppService.sendPixMessage(dto);
    if (result.success) {
      this.whatsAppService.emitSent(tenant.tenantId, tenant.tenantSlug, dto.phone, 'pix', { amount: dto.amount }, result.messageId);
    }
    return result;
  }

  @Post('send/template')
  @ApiOperation({ summary: 'Send a template message via WhatsApp' })
  @ApiResponse({ status: 201, description: 'Template message sent' })
  async sendTemplate(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: SendTemplateMessageDto,
  ): Promise<MessageResult> {
    const result = await this.whatsAppService.sendTemplateMessage(dto);
    if (result.success) {
      this.whatsAppService.emitSent(tenant.tenantId, tenant.tenantSlug, dto.phone, 'template', { templateId: dto.templateId }, result.messageId);
    }
    return result;
  }

  // ── Webhooks ───────────────────────────────────────────────

  /**
   * Tenant-aware webhook endpoint.
   * Accepts both Evolution API (event+instance fields) and Z-API (phone field) formats.
   */
  @Post('webhook/receive/:tenantSlug')
  @Public()
  @UsePipes()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Webhook for incoming WhatsApp messages (tenant)' })
  @ApiParam({ name: 'tenantSlug', type: 'string' })
  @ApiResponse({ status: 200, description: 'Message processed' })
  async webhookReceiveTenant(
    @Param('tenantSlug') tenantSlug: string,
    @Body() payload: Record<string, unknown>,
  ): Promise<{ received: boolean }> {
    if (
      typeof payload.event === 'string' &&
      typeof payload.instance === 'string'
    ) {
      await this.handleEvolutionWebhook(tenantSlug, payload);
      return { received: true };
    }

    const zapiPayload = payload as unknown as ReceivedMessageWebhook;
    if (zapiPayload.phone) {
      await this.whatsAppService.handleReceivedMessage(tenantSlug, zapiPayload);
    }

    return { received: true };
  }

  /**
   * Default webhook endpoint (uses DEFAULT_INSTANCE_SLUG).
   */
  @Post('webhook/receive')
  @Public()
  @UsePipes()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Webhook for incoming WhatsApp messages (default)' })
  @ApiResponse({ status: 200, description: 'Message processed' })
  async webhookReceive(
    @Body() payload: Record<string, unknown>,
  ): Promise<{ received: boolean }> {
    const tenantSlug = this.configService.get<string>('DEFAULT_INSTANCE_SLUG', 'default');

    if (
      typeof payload.event === 'string' &&
      typeof payload.instance === 'string'
    ) {
      await this.handleEvolutionWebhook(tenantSlug, payload);
      return { received: true };
    }

    const zapiPayload = payload as unknown as ReceivedMessageWebhook;
    if (zapiPayload.phone) {
      await this.whatsAppService.handleReceivedMessage(tenantSlug, zapiPayload);
    }

    return { received: true };
  }

  @Post('webhook/status')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Webhook for WhatsApp message status updates' })
  @ApiResponse({ status: 200, description: 'Status update received' })
  webhookStatus(
    @Body() payload: MessageStatusWebhook,
  ): { received: boolean } {
    this.whatsAppService.handleMessageStatus(payload);
    return { received: true };
  }

  // ── Evolution webhook routing ──────────────────────────────

  private async handleEvolutionWebhook(
    tenantSlug: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const event = payload.event as string;
    this.logger.log(
      `Evolution webhook: event=${event} instance=${String(payload.instance)}`,
    );

    switch (event) {
      case 'messages.upsert': {
        const parsed = EvolutionMessagesUpsertDataSchema.safeParse(
          payload.data,
        );
        if (!parsed.success) {
          this.logger.warn(
            `Invalid messages.upsert payload: ${parsed.error.message}`,
          );
          return;
        }
        const message = transformEvolutionMessage(parsed.data);
        await this.whatsAppService.handleReceivedMessage(tenantSlug, message);
        break;
      }

      case 'messages.update': {
        const parsed = EvolutionMessagesUpdateDataSchema.safeParse(
          payload.data,
        );
        if (!parsed.success) {
          this.logger.warn(
            `Invalid messages.update payload: ${parsed.error.message}`,
          );
          return;
        }
        const status = transformEvolutionMessageStatus(parsed.data);
        this.whatsAppService.handleMessageStatus(status);
        break;
      }

      case 'connection.update': {
        const parsed = EvolutionConnectionUpdateDataSchema.safeParse(
          payload.data,
        );
        if (!parsed.success) {
          this.logger.warn(
            `Invalid connection.update payload: ${parsed.error.message}`,
          );
          return;
        }
        this.logger.log(`Connection update: state=${parsed.data.state}`);
        break;
      }

      default:
        this.logger.log(`Unhandled Evolution event: ${event}`);
    }
  }
}
