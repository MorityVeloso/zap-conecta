/**
 * WhatsAppSendController — all message send endpoints.
 * Enforces per-tenant monthly quota before each send.
 */
import { Controller, Post, Get, Param, Body, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
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
  SendAudioMessageDto,
  SendVideoMessageDto,
  SendStickerMessageDto,
  SendLocationMessageDto,
  SendContactMessageDto,
  SendReactionDto,
  SendPollDto,
  CheckNumberDto,
  ReadMessagesDto,
} from './dto/message.dto';
import { BulkSendDtoSchema, type BulkSendDto } from './dto/bulk.dto';
import type { BulkSendJobData } from './bulk-send.processor';
import { QUEUE_BULK_SEND } from '../queue/queue.constants';
import { EvolutionInstanceService } from './evolution-instance.service';
import { PrismaService } from '@/prisma/prisma.service';
import { WhatsAppService, type MessageResult } from './whatsapp.service';

/** Inject tenantSlug into DTO so EvolutionApiClient resolves the correct instance */
function withTenant<T>(dto: T, tenant: TenantContext): T {
  return Object.assign({}, dto, { tenantSlug: tenant.tenantSlug }) as T;
}

@ApiTags('WhatsApp')
@ApiSecurity('x-api-key')
@Controller('whatsapp')
export class WhatsAppSendController {
  constructor(
    private readonly whatsAppService: WhatsAppService,
    private readonly usageService: UsageService,
    private readonly evolutionInstanceService: EvolutionInstanceService,
    @InjectQueue(QUEUE_BULK_SEND) private readonly bulkQueue: Queue<BulkSendJobData>,
    private readonly prisma: PrismaService,
  ) {}

  private async getInstanceId(tenantSlug: string): Promise<string> {
    const instance = await this.evolutionInstanceService.findByTenant(tenantSlug);
    return instance?.id ?? tenantSlug;
  }

  /** Ensure tenant has at least one connected WhatsApp instance before sending */
  private async assertConnected(tenantId: string): Promise<void> {
    const connected = await this.prisma.whatsAppInstance.findFirst({
      where: { tenantId, status: 'CONNECTED' },
      select: { id: true },
    });
    if (!connected) {
      throw new BadRequestException(
        'Nenhuma instância WhatsApp conectada. Conecte um número antes de enviar mensagens.',
      );
    }
  }

  @Post('send/text')
  @ApiOperation({ summary: 'Send a text message via WhatsApp' })
  @ApiResponse({ status: 201, description: 'Text message sent' })
  async sendText(@CurrentTenant() tenant: TenantContext, @Body() dto: SendTextMessageDto): Promise<MessageResult> {
    await this.assertConnected(tenant.tenantId);
    await this.usageService.assertBelowQuota(tenant.tenantId);
    const result = await this.whatsAppService.sendTextMessage(withTenant(dto, tenant));
    if (result.success) {
      const instanceId = await this.getInstanceId(tenant.tenantSlug);
      this.whatsAppService.emitSent(tenant.tenantId, instanceId, dto.phone, 'text', { text: dto.message }, result.messageId);
    }
    return result;
  }

  @Post('send/button')
  @ApiOperation({ summary: 'Send a button message via WhatsApp' })
  @ApiResponse({ status: 201, description: 'Button message sent' })
  async sendButton(@CurrentTenant() tenant: TenantContext, @Body() dto: SendButtonMessageDto): Promise<MessageResult> {
    await this.assertConnected(tenant.tenantId);
    await this.usageService.assertBelowQuota(tenant.tenantId);
    const result = await this.whatsAppService.sendButtonMessage(withTenant(dto, tenant));
    if (result.success) {
      const instanceId = await this.getInstanceId(tenant.tenantSlug);
      this.whatsAppService.emitSent(tenant.tenantId, instanceId, dto.phone, 'button', { title: dto.title }, result.messageId);
    }
    return result;
  }

  @Post('send/list')
  @ApiOperation({ summary: 'Send a list message via WhatsApp' })
  @ApiResponse({ status: 201, description: 'List message sent' })
  async sendList(@CurrentTenant() tenant: TenantContext, @Body() dto: SendListMessageDto): Promise<MessageResult> {
    await this.assertConnected(tenant.tenantId);
    await this.usageService.assertBelowQuota(tenant.tenantId);
    const result = await this.whatsAppService.sendListMessage(withTenant(dto, tenant));
    if (result.success) {
      const instanceId = await this.getInstanceId(tenant.tenantSlug);
      this.whatsAppService.emitSent(tenant.tenantId, instanceId, dto.phone, 'list', { title: dto.title }, result.messageId);
    }
    return result;
  }

  @Post('send/image')
  @ApiOperation({ summary: 'Send an image message via WhatsApp' })
  @ApiResponse({ status: 201, description: 'Image message sent' })
  async sendImage(@CurrentTenant() tenant: TenantContext, @Body() dto: SendImageMessageDto): Promise<MessageResult> {
    await this.assertConnected(tenant.tenantId);
    await this.usageService.assertBelowQuota(tenant.tenantId);
    const result = await this.whatsAppService.sendImageMessage(withTenant(dto, tenant));
    if (result.success) {
      const instanceId = await this.getInstanceId(tenant.tenantSlug);
      this.whatsAppService.emitSent(tenant.tenantId, instanceId, dto.phone, 'image', { image: dto.image }, result.messageId);
    }
    return result;
  }

  @Post('send/document')
  @ApiOperation({ summary: 'Send a document message via WhatsApp' })
  @ApiResponse({ status: 201, description: 'Document message sent' })
  async sendDocument(@CurrentTenant() tenant: TenantContext, @Body() dto: SendDocumentMessageDto): Promise<MessageResult> {
    await this.assertConnected(tenant.tenantId);
    await this.usageService.assertBelowQuota(tenant.tenantId);
    const result = await this.whatsAppService.sendDocumentMessage(withTenant(dto, tenant));
    if (result.success) {
      const instanceId = await this.getInstanceId(tenant.tenantSlug);
      this.whatsAppService.emitSent(tenant.tenantId, instanceId, dto.phone, 'document', { document: dto.document }, result.messageId);
    }
    return result;
  }

  @Post('send/pix')
  @ApiOperation({ summary: 'Send a PIX payment message via WhatsApp' })
  @ApiResponse({ status: 201, description: 'PIX message sent' })
  async sendPix(@CurrentTenant() tenant: TenantContext, @Body() dto: SendPixMessageDto): Promise<MessageResult> {
    await this.assertConnected(tenant.tenantId);
    await this.usageService.assertBelowQuota(tenant.tenantId);
    const result = await this.whatsAppService.sendPixMessage(withTenant(dto, tenant));
    if (result.success) {
      const instanceId = await this.getInstanceId(tenant.tenantSlug);
      this.whatsAppService.emitSent(tenant.tenantId, instanceId, dto.phone, 'pix', { amount: dto.amount }, result.messageId);
    }
    return result;
  }

  @Post('send/template')
  @ApiOperation({ summary: 'Send a template message via WhatsApp' })
  @ApiResponse({ status: 201, description: 'Template message sent' })
  async sendTemplate(@CurrentTenant() tenant: TenantContext, @Body() dto: SendTemplateMessageDto): Promise<MessageResult> {
    await this.assertConnected(tenant.tenantId);
    await this.usageService.assertBelowQuota(tenant.tenantId);
    const result = await this.whatsAppService.sendTemplateMessage(withTenant(dto, tenant));
    if (result.success) {
      const instanceId = await this.getInstanceId(tenant.tenantSlug);
      this.whatsAppService.emitSent(tenant.tenantId, instanceId, dto.phone, 'template', { templateId: dto.templateId }, result.messageId);
    }
    return result;
  }

  @Post('send/audio')
  @ApiOperation({ summary: 'Send an audio message via WhatsApp' })
  @ApiResponse({ status: 201, description: 'Audio message sent' })
  async sendAudio(@CurrentTenant() tenant: TenantContext, @Body() dto: SendAudioMessageDto): Promise<MessageResult> {
    await this.assertConnected(tenant.tenantId);
    await this.usageService.assertBelowQuota(tenant.tenantId);
    const result = await this.whatsAppService.sendAudioMessage(withTenant(dto, tenant));
    if (result.success) {
      const instanceId = await this.getInstanceId(tenant.tenantSlug);
      this.whatsAppService.emitSent(tenant.tenantId, instanceId, dto.phone, 'audio', { audio: dto.audio }, result.messageId);
    }
    return result;
  }

  @Post('send/video')
  @ApiOperation({ summary: 'Send a video message via WhatsApp' })
  @ApiResponse({ status: 201, description: 'Video message sent' })
  async sendVideo(@CurrentTenant() tenant: TenantContext, @Body() dto: SendVideoMessageDto): Promise<MessageResult> {
    await this.assertConnected(tenant.tenantId);
    await this.usageService.assertBelowQuota(tenant.tenantId);
    const result = await this.whatsAppService.sendVideoMessage(withTenant(dto, tenant));
    if (result.success) {
      const instanceId = await this.getInstanceId(tenant.tenantSlug);
      this.whatsAppService.emitSent(tenant.tenantId, instanceId, dto.phone, 'video', { video: dto.video }, result.messageId);
    }
    return result;
  }

  @Post('send/sticker')
  @ApiOperation({ summary: 'Send a sticker message via WhatsApp' })
  @ApiResponse({ status: 201, description: 'Sticker message sent' })
  async sendSticker(@CurrentTenant() tenant: TenantContext, @Body() dto: SendStickerMessageDto): Promise<MessageResult> {
    await this.assertConnected(tenant.tenantId);
    await this.usageService.assertBelowQuota(tenant.tenantId);
    const result = await this.whatsAppService.sendStickerMessage(withTenant(dto, tenant));
    if (result.success) {
      const instanceId = await this.getInstanceId(tenant.tenantSlug);
      this.whatsAppService.emitSent(tenant.tenantId, instanceId, dto.phone, 'sticker', { sticker: dto.sticker }, result.messageId);
    }
    return result;
  }

  @Post('send/location')
  @ApiOperation({ summary: 'Send a location message via WhatsApp' })
  @ApiResponse({ status: 201, description: 'Location message sent' })
  async sendLocation(@CurrentTenant() tenant: TenantContext, @Body() dto: SendLocationMessageDto): Promise<MessageResult> {
    await this.assertConnected(tenant.tenantId);
    await this.usageService.assertBelowQuota(tenant.tenantId);
    const result = await this.whatsAppService.sendLocationMessage(withTenant(dto, tenant));
    if (result.success) {
      const instanceId = await this.getInstanceId(tenant.tenantSlug);
      this.whatsAppService.emitSent(tenant.tenantId, instanceId, dto.phone, 'location', { latitude: dto.latitude, longitude: dto.longitude }, result.messageId);
    }
    return result;
  }

  @Post('send/contact')
  @ApiOperation({ summary: 'Send a contact card message via WhatsApp' })
  @ApiResponse({ status: 201, description: 'Contact message sent' })
  async sendContact(@CurrentTenant() tenant: TenantContext, @Body() dto: SendContactMessageDto): Promise<MessageResult> {
    await this.assertConnected(tenant.tenantId);
    await this.usageService.assertBelowQuota(tenant.tenantId);
    const result = await this.whatsAppService.sendContactMessage(withTenant(dto, tenant));
    if (result.success) {
      const instanceId = await this.getInstanceId(tenant.tenantSlug);
      this.whatsAppService.emitSent(tenant.tenantId, instanceId, dto.phone, 'contact', { contacts: dto.contacts }, result.messageId);
    }
    return result;
  }

  @Post('send/reaction')
  @ApiOperation({ summary: 'Send an emoji reaction to a message' })
  @ApiResponse({ status: 201, description: 'Reaction sent' })
  async sendReaction(@CurrentTenant() tenant: TenantContext, @Body() dto: SendReactionDto): Promise<MessageResult> {
    await this.assertConnected(tenant.tenantId);
    return this.whatsAppService.sendReaction(withTenant(dto, tenant));
  }

  @Post('send/poll')
  @ApiOperation({ summary: 'Send a poll message via WhatsApp' })
  @ApiResponse({ status: 201, description: 'Poll message sent' })
  async sendPoll(@CurrentTenant() tenant: TenantContext, @Body() dto: SendPollDto): Promise<MessageResult> {
    await this.assertConnected(tenant.tenantId);
    await this.usageService.assertBelowQuota(tenant.tenantId);
    const result = await this.whatsAppService.sendPoll(withTenant(dto, tenant));
    if (result.success) {
      const instanceId = await this.getInstanceId(tenant.tenantSlug);
      this.whatsAppService.emitSent(tenant.tenantId, instanceId, dto.phone, 'poll', { name: dto.name, options: dto.options }, result.messageId);
    }
    return result;
  }

  @Post('check-number')
  @ApiOperation({ summary: 'Check if a phone number has WhatsApp' })
  @ApiResponse({ status: 200, description: 'Number checked' })
  async checkNumber(@CurrentTenant() tenant: TenantContext, @Body() dto: CheckNumberDto): Promise<{ exists: boolean; jid?: string }> {
    return this.whatsAppService.checkNumber(dto.phone);
  }

  @Post('read-messages')
  @ApiOperation({ summary: 'Mark messages from a phone as read' })
  @ApiResponse({ status: 200, description: 'Messages marked as read' })
  async readMessages(@CurrentTenant() tenant: TenantContext, @Body() dto: ReadMessagesDto): Promise<{ success: boolean }> {
    await this.whatsAppService.readMessages(dto.phone);
    return { success: true };
  }

  @Post('send/bulk')
  @ApiOperation({ summary: 'Send a message to multiple recipients (queued)' })
  @ApiResponse({ status: 201, description: 'Bulk send enqueued' })
  async sendBulk(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: unknown,
  ): Promise<{ batchId: string; total: number }> {
    const dto = BulkSendDtoSchema.parse(body);
    await this.assertConnected(tenant.tenantId);
    await this.usageService.assertBelowQuota(tenant.tenantId);

    const batch = await this.prisma.bulkSendBatch.create({
      data: {
        tenantId: tenant.tenantId,
        total: dto.recipients.length,
        status: 'PROCESSING',
      },
    });

    const delay = dto.delay ?? 1000;

    await Promise.all(
      dto.recipients.map((phone, index) =>
        this.bulkQueue.add(
          'bulk-send',
          {
            batchId: batch.id,
            tenantSlug: tenant.tenantSlug,
            phone,
            type: dto.message.type,
            text: dto.message.text,
            mediaUrl: dto.message.mediaUrl,
            caption: dto.message.caption,
            fileName: dto.message.fileName,
          },
          {
            delay: index * delay,
            removeOnComplete: 100,
            removeOnFail: 200,
          },
        ),
      ),
    );

    return { batchId: batch.id, total: dto.recipients.length };
  }

  @Get('send/bulk/:batchId')
  @ApiOperation({ summary: 'Get bulk send batch status' })
  @ApiResponse({ status: 200, description: 'Batch status retrieved' })
  async getBatchStatus(
    @CurrentTenant() tenant: TenantContext,
    @Param('batchId') batchId: string,
  ) {
    const batch = await this.prisma.bulkSendBatch.findFirst({
      where: { id: batchId, tenantId: tenant.tenantId },
    });

    if (!batch) throw new NotFoundException('Batch not found');

    return {
      id: batch.id,
      total: batch.total,
      sent: batch.sent,
      failed: batch.failed,
      status: batch.status,
      progress: batch.total > 0 ? Math.round(((batch.sent + batch.failed) / batch.total) * 100) : 0,
      createdAt: batch.createdAt,
    };
  }
}
