/**
 * WebhookDeliveryProcessor — processes queued webhook deliveries with retry.
 * BullMQ handles exponential backoff: 5s → 10s → 20s → 40s → 80s
 */
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { createHmac } from 'crypto';
import type { Job } from 'bullmq';
import { QUEUE_WEBHOOK_DELIVERY } from '../queue/queue.constants';

export interface WebhookDeliveryJobData {
  url: string;
  secret: string;
  body: string;
}

@Processor(QUEUE_WEBHOOK_DELIVERY)
export class WebhookDeliveryProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhookDeliveryProcessor.name);

  async process(job: Job<WebhookDeliveryJobData>): Promise<void> {
    const { url, secret, body } = job.data;
    const signature = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Zap-Signature': signature,
        'User-Agent': 'Zap-Conecta-Webhook/1.0',
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      this.logger.warn(
        `Webhook delivery failed: ${url} → ${res.status} (attempt ${job.attemptsMade + 1}/${(job.opts.attempts ?? 5)})`,
      );
      throw new Error(`HTTP ${res.status}`);
    }

    this.logger.debug(`Webhook delivered: ${url} (attempt ${job.attemptsMade + 1})`);
  }
}
