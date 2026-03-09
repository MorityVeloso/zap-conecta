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
import { EventEmitter2 } from '@nestjs/event-emitter';
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
  EvolutionQrcodeUpdatedDataSchema,
  EvolutionMessagesDeleteDataSchema,
  EvolutionCallDataSchema,
} from './dto/evolution-webhook.dto';
import {
  transformEvolutionMessage,
  transformEvolutionMessageStatus,
} from './evolution-webhook.transformer';
import { EvolutionWebhookSchema } from './dto/evolution-webhook.dto';
import { WhatsAppService } from './whatsapp.service';
import { EvolutionInstanceService } from './evolution-instance.service';
import { WhatsAppReconnectService } from './whatsapp-reconnect.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';

@ApiTags('WhatsApp Webhooks')
@Controller('whatsapp')
export class WhatsAppWebhookController {
  private readonly logger = new Logger(WhatsAppWebhookController.name);

  constructor(
    private readonly whatsAppService: WhatsAppService,
    private readonly configService: ConfigService,
    private readonly evolutionInstanceService: EvolutionInstanceService,
    private readonly eventEmitter: EventEmitter2,
    private readonly prisma: PrismaService,
    private readonly reconnectService: WhatsAppReconnectService,
    private readonly redis: RedisService,
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
    // Validate top-level shape
    const topLevel = EvolutionWebhookSchema.safeParse(payload);
    if (!topLevel.success) {
      this.logger.warn(`Invalid webhook shape from ${tenantSlug}: ${topLevel.error.message}`);
      return;
    }

    // Validate apikey if present (webhook signature check)
    const payloadApikey = typeof payload.apikey === 'string' ? payload.apikey : undefined;
    if (payloadApikey) {
      const valid = await this.validateWebhookApikey(tenantSlug, payloadApikey);
      if (!valid) {
        this.logger.warn(`Webhook apikey mismatch for tenant ${tenantSlug} — ignoring`);
        return;
      }
    }

    const event = payload.event as string;
    this.logger.log(`Evolution webhook: event=${event} instance=${String(payload.instance)}`);

    switch (event) {
      case 'messages.upsert': {
        const parsed = EvolutionMessagesUpsertDataSchema.safeParse(payload.data);
        if (!parsed.success) {
          this.logger.warn(`Invalid messages.upsert payload: ${parsed.error.message}`);
          return;
        }

        // Idempotency: skip duplicate messages (Redis key with 5min TTL)
        const messageId = parsed.data.key?.id;
        if (messageId) {
          const idempotencyKey = `webhook:msg:${tenantSlug}:${messageId}`;
          const isNew = await this.redis.setnx(idempotencyKey, '1', 300);
          if (!isNew) {
            this.logger.debug(`Duplicate message skipped: ${messageId}`);
            return;
          }
        }

        // Resolve tenantId + instanceId so the event is emitted for persistence & webhook dispatch
        const instance = await this.evolutionInstanceService.findByTenant(tenantSlug);
        await this.whatsAppService.handleReceivedMessage(
          tenantSlug,
          transformEvolutionMessage(parsed.data),
          instance?.tenantId,
          instance?.id,
        );
        break;
      }

      case 'messages.update': {
        const parsed = EvolutionMessagesUpdateDataSchema.safeParse(payload.data);
        if (!parsed.success) {
          this.logger.warn(`Invalid messages.update payload: ${parsed.error.message}`);
          return;
        }
        const instUpdate = await this.evolutionInstanceService.findByTenant(tenantSlug);
        this.whatsAppService.handleMessageStatus(
          transformEvolutionMessageStatus(parsed.data),
          instUpdate?.tenantId,
          instUpdate?.id,
        );
        break;
      }

      case 'connection.update': {
        const t0 = Date.now();
        const parsed = EvolutionConnectionUpdateDataSchema.safeParse(payload.data);
        if (!parsed.success) {
          this.logger.warn(`Invalid connection.update payload: ${parsed.error.message}`);
          return;
        }
        const state = parsed.data.state;
        this.logger.log(`[TIMELINE] connection.update received: state=${state} tenant=${tenantSlug} at ${new Date().toISOString()}`);

        // Only persist terminal states (open / close) — ignore transient "connecting"
        if (state !== 'open' && state !== 'close') break;

        const newStatus = state === 'open' ? 'CONNECTED' : 'DISCONNECTED';

        // Fast path: single updateMany by tenantSlug (no findByTenant round-trip)
        await this.prisma.whatsAppInstance.updateMany({
          where: { tenantSlug },
          data: {
            status: newStatus,
            ...(state === 'open' && parsed.data.number
              ? { phone: parsed.data.number }
              : {}),
          },
        });
        this.logger.log(`[TIMELINE] DB updated to ${newStatus} for ${tenantSlug} (${Date.now() - t0}ms)`);

        // On open: reset reconnect counter
        if (state === 'open') {
          const instanceName = typeof payload.instance === 'string' ? payload.instance : '';
          this.evolutionInstanceService.resetReconnectAttempts(instanceName)
            .catch((err) => this.logger.warn(`Failed to reset reconnect count: ${String(err)}`));
        }

        // On close: auto-reconnect with backoff
        if (state === 'close') {
          const instanceName = typeof payload.instance === 'string' ? payload.instance : '';
          this.reconnectService.handleDisconnect(tenantSlug, instanceName)
            .catch((err) => this.logger.error(`Reconnect handler error: ${String(err)}`));
        }

        // Emit events async (don't block webhook response)
        this.emitConnectionEvent(tenantSlug, state, parsed.data.number);
        break;
      }

      case 'qrcode.updated': {
        const parsed = EvolutionQrcodeUpdatedDataSchema.safeParse(payload.data);
        if (!parsed.success) {
          this.logger.warn(`Invalid qrcode.updated payload: ${parsed.error.message}`);
          return;
        }
        const qrCode = parsed.data.qrcode?.base64 ?? parsed.data.base64 ?? parsed.data.qrcode?.code ?? parsed.data.code ?? '';
        const pairingCode = parsed.data.qrcode?.pairingCode ?? parsed.data.pairingCode;
        if (qrCode) {
          const inst = await this.evolutionInstanceService.findByTenant(tenantSlug);
          this.eventEmitter.emit('whatsapp.instance.qr_updated', {
            tenantId: inst?.tenantId ?? '',
            tenantSlug,
            instanceId: inst?.id,
            qrCode,
            pairingCode,
          });
        }
        break;
      }

      case 'messages.delete': {
        const parsed = EvolutionMessagesDeleteDataSchema.safeParse(payload.data);
        if (!parsed.success) {
          this.logger.warn(`Invalid messages.delete payload: ${parsed.error.message}`);
          return;
        }
        this.logger.log(`Message deleted: remoteJid=${parsed.data.remoteJid ?? 'unknown'} id=${parsed.data.id ?? 'unknown'}`);
        break;
      }

      case 'call': {
        const parsed = EvolutionCallDataSchema.safeParse(payload.data);
        if (!parsed.success) {
          this.logger.warn(`Invalid call payload: ${parsed.error.message}`);
          return;
        }
        this.logger.log(`Call received: from=${parsed.data.from ?? 'unknown'} video=${String(parsed.data.isVideo)} status=${parsed.data.status ?? 'unknown'}`);
        const instCall = await this.evolutionInstanceService.findByTenant(tenantSlug);
        if (instCall?.tenantId) {
          this.eventEmitter.emit('whatsapp.call.received', {
            tenantId: instCall.tenantId,
            instanceId: instCall.id,
            from: parsed.data.from ?? '',
            isVideo: parsed.data.isVideo ?? false,
            status: parsed.data.status ?? 'unknown',
          });
        }
        break;
      }

      case 'send.message': {
        this.logger.debug(`Send confirmation: instance=${String(payload.instance)}`);
        break;
      }

      default:
        this.logger.log(`Unhandled Evolution event: ${event}`);
    }
  }

  /** Validate webhook apikey against the instanceToken stored in DB (cached in Redis) */
  private async validateWebhookApikey(tenantSlug: string, apikey: string): Promise<boolean> {
    const cacheKey = `webhook:token:${tenantSlug}`;

    // Check Redis cache first
    const cached = await this.redis.get(cacheKey);
    if (cached) return cached === apikey;

    const inst = await this.evolutionInstanceService.findByTenant(tenantSlug);
    if (!inst?.instanceToken) return true; // No token stored — allow (backwards compat)

    // Cache for 5min
    await this.redis.setex(cacheKey, 300, inst.instanceToken);
    return inst.instanceToken === apikey;
  }

  /** Fire-and-forget: resolve instance data and emit connection event (with 1 retry) */
  private emitConnectionEvent(tenantSlug: string, state: string, phone?: string): void {
    const doEmit = (): Promise<void> =>
      this.prisma.whatsAppInstance.findFirst({
        where: { tenantSlug },
        select: { id: true, tenantId: true, instanceName: true },
      }).then((inst) => {
        if (!inst) return;
        const event = state === 'open'
          ? 'whatsapp.instance.connected'
          : 'whatsapp.instance.disconnected';
        this.eventEmitter.emit(event, {
          tenantId: inst.tenantId,
          tenantSlug,
          instanceId: inst.id,
          ...(phone ? { phone } : {}),
        });
      });

    doEmit().catch((err) => {
      this.logger.warn(`emitConnectionEvent failed, retrying in 1s: ${String(err)}`);
      setTimeout(() => {
        doEmit().catch((err2) => {
          // Emit degraded event (no instanceId) to unblock listeners
          this.logger.error(`emitConnectionEvent retry failed: ${String(err2)}`);
          const event = state === 'open'
            ? 'whatsapp.instance.connected'
            : 'whatsapp.instance.disconnected';
          this.eventEmitter.emit(event, { tenantId: '', tenantSlug, ...(phone ? { phone } : {}) });
        });
      }, 1_000);
    });
  }
}
