/**
 * WebhookDispatcherService — forwards events to tenant-configured URLs.
 *
 * Signs each request with HMAC-SHA256 in X-Zap-Signature header:
 *   X-Zap-Signature: sha256=<hex>
 *
 * Tenants validate the signature on their side using their webhook secret.
 */
import { Injectable, Logger } from '@nestjs/common';
import { createHmac } from 'crypto';
import { OnEvent } from '@nestjs/event-emitter';
import type { WhatsAppMessageReceivedEvent, WhatsAppMessageSentEvent } from './whatsapp.events';
import { PrismaService } from '@/prisma/prisma.service';

interface WebhookEvent {
  event: string;
  tenantId: string;
  data: Record<string, unknown>;
  timestamp: string;
}

@Injectable()
export class WebhookDispatcherService {
  private readonly logger = new Logger(WebhookDispatcherService.name);

  constructor(private readonly prisma: PrismaService) {}

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

    const payload: WebhookEvent = {
      event: eventName,
      tenantId,
      data,
      timestamp: new Date().toISOString(),
    };

    const body = JSON.stringify(payload);

    await Promise.allSettled(
      webhooks.map((wh) => this.send(wh.url, wh.secret, body)),
    );
  }

  private async send(url: string, secret: string, body: string): Promise<void> {
    const signature = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Zap-Signature': signature,
          'User-Agent': 'Zap-Conecta-Webhook/1.0',
        },
        body,
        signal: AbortSignal.timeout(10_000), // 10s timeout
      });

      if (!res.ok) {
        this.logger.warn(`Webhook delivery failed: ${url} → ${res.status}`);
      }
    } catch (err) {
      this.logger.warn(`Webhook delivery error: ${url} → ${String(err)}`);
    }
  }
}
