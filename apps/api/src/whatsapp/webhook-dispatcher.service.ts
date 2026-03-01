/**
 * WebhookDispatcherService — forwards events to tenant-configured URLs.
 *
 * Uses BullMQ for reliable delivery with exponential backoff retry.
 * Signs each request with HMAC-SHA256 in X-Zap-Signature header.
 */
import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { OnEvent } from '@nestjs/event-emitter';
import type { Queue } from 'bullmq';
import type {
  WhatsAppMessageReceivedEvent,
  WhatsAppMessageSentEvent,
  WhatsAppMessageStatusEvent,
  WhatsAppInstanceConnectedEvent,
  WhatsAppInstanceDisconnectedEvent,
} from './whatsapp.events';
import type { WebhookDeliveryJobData } from './webhook-delivery.processor';
import { QUEUE_WEBHOOK_DELIVERY } from '../queue/queue.constants';
import { PrismaService } from '@/prisma/prisma.service';

interface WebhookEventPayload {
  event: string;
  tenantId: string;
  data: Record<string, unknown>;
  timestamp: string;
}

@Injectable()
export class WebhookDispatcherService {
  private readonly logger = new Logger(WebhookDispatcherService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_WEBHOOK_DELIVERY) private readonly webhookQueue: Queue<WebhookDeliveryJobData>,
  ) {}

  @OnEvent('whatsapp.message.received', { async: true })
  async onMessageReceived(event: WhatsAppMessageReceivedEvent): Promise<void> {
    await this.dispatch(event.tenantId, 'message.received', {
      phone: event.phone,
      type: event.type,
      content: event.content,
      externalId: event.externalId,
    });
  }

  @OnEvent('whatsapp.message.sent', { async: true })
  async onMessageSent(event: WhatsAppMessageSentEvent): Promise<void> {
    await this.dispatch(event.tenantId, 'message.sent', {
      phone: event.phone,
      type: event.type,
      content: event.content,
      externalId: event.externalId,
    });
  }

  @OnEvent('whatsapp.message.status', { async: true })
  async onMessageStatus(event: WhatsAppMessageStatusEvent): Promise<void> {
    await this.dispatch(event.tenantId, 'message.status', {
      messageId: event.messageId,
      status: event.status,
      phone: event.phone,
    });
  }

  @OnEvent('whatsapp.instance.connected', { async: true })
  async onInstanceConnected(event: WhatsAppInstanceConnectedEvent): Promise<void> {
    await this.dispatch(event.tenantId, 'instance.connected', {
      tenantSlug: event.tenantSlug,
      instanceId: event.instanceId,
      phone: event.phone,
    });
  }

  @OnEvent('whatsapp.instance.disconnected', { async: true })
  async onInstanceDisconnected(event: WhatsAppInstanceDisconnectedEvent): Promise<void> {
    await this.dispatch(event.tenantId, 'instance.disconnected', {
      tenantSlug: event.tenantSlug,
      instanceId: event.instanceId,
    });
  }

  private async dispatch(
    tenantId: string,
    eventName: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    const webhooks = await this.prisma.webhook.findMany({
      where: {
        tenantId,
        isActive: true,
        events: { has: eventName },
      },
    });

    if (webhooks.length === 0) return;

    const payload: WebhookEventPayload = {
      event: eventName,
      tenantId,
      data,
      timestamp: new Date().toISOString(),
    };

    const body = JSON.stringify(payload);

    await Promise.allSettled(
      webhooks.map((wh) =>
        this.webhookQueue.add(
          'deliver',
          { url: wh.url, secret: wh.secret, body },
          {
            attempts: 5,
            backoff: { type: 'exponential', delay: 5000 },
            removeOnComplete: 100,
            removeOnFail: 500,
          },
        ),
      ),
    );

    this.logger.debug(
      `Enqueued ${webhooks.length} webhook delivery job(s) for ${eventName}`,
    );
  }
}
