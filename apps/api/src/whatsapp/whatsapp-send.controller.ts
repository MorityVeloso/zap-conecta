/**
 * WhatsAppSendController — all message send endpoints.
 * Enforces per-tenant monthly quota before each send.
 */
import { Controller, Post, Body } from '@nestjs/common';
import {
  ApiTags,
  ApiSecurity,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import type { TenantContext } from '../auth/supabase-jwt.guard';
import { UsageService } from '../billing/usage.service';
import type {
  SendTextMessageDto,
  SendButtonMessageDto,
  SendListMessageDto,
  SendImageMessageDto,
  SendDocumentMessageDto,
  SendPixMessageDto,
  SendTemplateMessageDto,
} from './dto/message.dto';
import { WhatsAppService, type MessageResult } from './whatsapp.service';

@ApiTags('WhatsApp')
@ApiSecurity('x-api-key')
@Controller('whatsapp')
export class WhatsAppSendController {
  constructor(
    private readonly whatsAppService: WhatsAppService,
    private readonly usageService: UsageService,
  ) {}

  @Post('send/text')
  @ApiOperation({ summary: 'Send a text message via WhatsApp' })
  @ApiResponse({ status: 201, description: 'Text message sent' })
  async sendText(@CurrentTenant() tenant: TenantContext, @Body() dto: SendTextMessageDto): Promise<MessageResult> {
    await this.usageService.assertBelowQuota(tenant.tenantId);
    const result = await this.whatsAppService.sendTextMessage(dto);
    if (result.success) {
      this.whatsAppService.emitSent(tenant.tenantId, tenant.tenantSlug, dto.phone, 'text', { text: dto.message }, result.messageId);
    }
    return result;
  }

  @Post('send/button')
  @ApiOperation({ summary: 'Send a button message via WhatsApp' })
  @ApiResponse({ status: 201, description: 'Button message sent' })
  async sendButton(@CurrentTenant() tenant: TenantContext, @Body() dto: SendButtonMessageDto): Promise<MessageResult> {
    await this.usageService.assertBelowQuota(tenant.tenantId);
    const result = await this.whatsAppService.sendButtonMessage(dto);
    if (result.success) {
      this.whatsAppService.emitSent(tenant.tenantId, tenant.tenantSlug, dto.phone, 'button', { title: dto.title }, result.messageId);
    }
    return result;
  }

  @Post('send/list')
  @ApiOperation({ summary: 'Send a list message via WhatsApp' })
  @ApiResponse({ status: 201, description: 'List message sent' })
  async sendList(@CurrentTenant() tenant: TenantContext, @Body() dto: SendListMessageDto): Promise<MessageResult> {
    await this.usageService.assertBelowQuota(tenant.tenantId);
    const result = await this.whatsAppService.sendListMessage(dto);
    if (result.success) {
      this.whatsAppService.emitSent(tenant.tenantId, tenant.tenantSlug, dto.phone, 'list', { title: dto.title }, result.messageId);
    }
    return result;
  }

  @Post('send/image')
  @ApiOperation({ summary: 'Send an image message via WhatsApp' })
  @ApiResponse({ status: 201, description: 'Image message sent' })
  async sendImage(@CurrentTenant() tenant: TenantContext, @Body() dto: SendImageMessageDto): Promise<MessageResult> {
    await this.usageService.assertBelowQuota(tenant.tenantId);
    const result = await this.whatsAppService.sendImageMessage(dto);
    if (result.success) {
      this.whatsAppService.emitSent(tenant.tenantId, tenant.tenantSlug, dto.phone, 'image', { image: dto.image }, result.messageId);
    }
    return result;
  }

  @Post('send/document')
  @ApiOperation({ summary: 'Send a document message via WhatsApp' })
  @ApiResponse({ status: 201, description: 'Document message sent' })
  async sendDocument(@CurrentTenant() tenant: TenantContext, @Body() dto: SendDocumentMessageDto): Promise<MessageResult> {
    await this.usageService.assertBelowQuota(tenant.tenantId);
    const result = await this.whatsAppService.sendDocumentMessage(dto);
    if (result.success) {
      this.whatsAppService.emitSent(tenant.tenantId, tenant.tenantSlug, dto.phone, 'document', { document: dto.document }, result.messageId);
    }
    return result;
  }

  @Post('send/pix')
  @ApiOperation({ summary: 'Send a PIX payment message via WhatsApp' })
  @ApiResponse({ status: 201, description: 'PIX message sent' })
  async sendPix(@CurrentTenant() tenant: TenantContext, @Body() dto: SendPixMessageDto): Promise<MessageResult> {
    await this.usageService.assertBelowQuota(tenant.tenantId);
    const result = await this.whatsAppService.sendPixMessage(dto);
    if (result.success) {
      this.whatsAppService.emitSent(tenant.tenantId, tenant.tenantSlug, dto.phone, 'pix', { amount: dto.amount }, result.messageId);
    }
    return result;
  }

  @Post('send/template')
  @ApiOperation({ summary: 'Send a template message via WhatsApp' })
  @ApiResponse({ status: 201, description: 'Template message sent' })
  async sendTemplate(@CurrentTenant() tenant: TenantContext, @Body() dto: SendTemplateMessageDto): Promise<MessageResult> {
    await this.usageService.assertBelowQuota(tenant.tenantId);
    const result = await this.whatsAppService.sendTemplateMessage(dto);
    if (result.success) {
      this.whatsAppService.emitSent(tenant.tenantId, tenant.tenantSlug, dto.phone, 'template', { templateId: dto.templateId }, result.messageId);
    }
    return result;
  }
}
