/**
 * WhatsAppWebhookController — receives Evolution API and Z-API webhooks.
 * All endpoints are @Public (no auth required — called by external providers).
 */
import {
  Controller,
  Post,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  Logger,
  UsePipes,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';
import type { ReceivedMessageWebhook, MessageStatusWebhook } from './dto/webhook.dto';
import {
  EvolutionMessagesUpsertDataSchema,
  EvolutionMessagesUpdateDataSchema,
  EvolutionConnectionUpdateDataSchema,
} from './dto/evolution-webhook.dto';
import {
  transformEvolutionMessage,
  transformEvolutionMessageStatus,
} from './evolution-webhook.transformer';
import { WhatsAppService } from './whatsapp.service';

@ApiTags('WhatsApp Webhooks')
@Controller('whatsapp')
export class WhatsAppWebhookController {
  private readonly logger = new Logger(WhatsAppWebhookController.name);

  constructor(
    private readonly whatsAppService: WhatsAppService,
    private readonly configService: ConfigService,
  ) {}

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
    if (typeof payload.event === 'string' && typeof payload.instance === 'string') {
      await this.handleEvolutionWebhook(tenantSlug, payload);
      return { received: true };
    }

    const zapiPayload = payload as unknown as ReceivedMessageWebhook;
    if (zapiPayload.phone) {
      await this.whatsAppService.handleReceivedMessage(tenantSlug, zapiPayload);
    }

    return { received: true };
  }

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

    if (typeof payload.event === 'string' && typeof payload.instance === 'string') {
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
  webhookStatus(@Body() payload: MessageStatusWebhook): { received: boolean } {
    this.whatsAppService.handleMessageStatus(payload);
    return { received: true };
  }

  private async handleEvolutionWebhook(
    tenantSlug: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const event = payload.event as string;
    this.logger.log(`Evolution webhook: event=${event} instance=${String(payload.instance)}`);

    switch (event) {
      case 'messages.upsert': {
        const parsed = EvolutionMessagesUpsertDataSchema.safeParse(payload.data);
        if (!parsed.success) {
          this.logger.warn(`Invalid messages.upsert payload: ${parsed.error.message}`);
          return;
        }
        await this.whatsAppService.handleReceivedMessage(tenantSlug, transformEvolutionMessage(parsed.data));
        break;
      }

      case 'messages.update': {
        const parsed = EvolutionMessagesUpdateDataSchema.safeParse(payload.data);
        if (!parsed.success) {
          this.logger.warn(`Invalid messages.update payload: ${parsed.error.message}`);
          return;
        }
        this.whatsAppService.handleMessageStatus(transformEvolutionMessageStatus(parsed.data));
        break;
      }

      case 'connection.update': {
        const parsed = EvolutionConnectionUpdateDataSchema.safeParse(payload.data);
        if (!parsed.success) {
          this.logger.warn(`Invalid connection.update payload: ${parsed.error.message}`);
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
