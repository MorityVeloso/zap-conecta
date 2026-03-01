import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { randomBytes, createHmac } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';

export const WEBHOOK_EVENTS = [
  'message.received',
  'message.sent',
  'message.status',
  'instance.connected',
  'instance.disconnected',
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

const MAX_WEBHOOKS_PER_TENANT = 10;

export interface WebhookListItem {
  id: string;
  url: string;
  events: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface WebhookCreatedResult extends WebhookListItem {
  /** HMAC signing secret — shown ONCE on creation, never again */
  secret: string;
}

export interface UpdateWebhookDto {
  url?: string;
  events?: WebhookEvent[];
  isActive?: boolean;
}

export interface WebhookTestResult {
  success: boolean;
  statusCode?: number;
  durationMs: number;
  error?: string;
}

export interface WebhookDeliveryLogItem {
  id: string;
  event: string;
  success: boolean;
  statusCode: number | null;
  durationMs: number;
  attempt: number;
  error: string | null;
  createdAt: Date;
}

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string): Promise<WebhookListItem[]> {
    return this.prisma.webhook.findMany({
      where: { tenantId },
      select: {
        id: true,
        url: true,
        events: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(
    tenantId: string,
    url: string,
    events: WebhookEvent[],
  ): Promise<WebhookCreatedResult> {
    await this.assertBelowLimit(tenantId);

    const secret = randomBytes(32).toString('hex');

    const webhook = await this.prisma.webhook.create({
      data: { tenantId, url, events, secret, isActive: true },
      select: {
        id: true,
        url: true,
        events: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return { ...webhook, secret };
  }

  async update(tenantId: string, id: string, dto: UpdateWebhookDto): Promise<WebhookListItem> {
    const webhook = await this.prisma.webhook.findFirst({ where: { id, tenantId } });
    if (!webhook) throw new NotFoundException('Webhook não encontrado');

    // If no fields provided, fall back to toggle isActive
    const data: UpdateWebhookDto = Object.keys(dto).length === 0
      ? { isActive: !webhook.isActive }
      : dto;

    return this.prisma.webhook.update({
      where: { id },
      data,
      select: {
        id: true,
        url: true,
        events: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async test(tenantId: string, id: string): Promise<WebhookTestResult> {
    const webhook = await this.prisma.webhook.findFirst({ where: { id, tenantId } });
    if (!webhook) throw new NotFoundException('Webhook não encontrado');

    const body = JSON.stringify({
      event: 'test',
      timestamp: new Date().toISOString(),
      data: { message: 'Zap-Conecta test ping' },
    });

    const signature = `sha256=${createHmac('sha256', webhook.secret).update(body).digest('hex')}`;
    const start = Date.now();

    let result: WebhookTestResult;

    try {
      const res = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Zap-Signature': signature,
          'User-Agent': 'Zap-Conecta-Webhook/1.0',
        },
        body,
        signal: AbortSignal.timeout(5_000),
      });

      const durationMs = Date.now() - start;
      result = { success: res.ok, statusCode: res.status, durationMs };
    } catch (error) {
      const durationMs = Date.now() - start;
      const message = error instanceof Error ? error.message : 'Unknown error';
      result = { success: false, durationMs, error: message };
    }

    await this.prisma.webhookDeliveryLog.create({
      data: {
        webhookId: webhook.id,
        event: 'test',
        success: result.success,
        statusCode: result.statusCode ?? null,
        durationMs: result.durationMs,
        error: result.error ?? null,
      },
    });

    return result;
  }

  async getLogs(tenantId: string, webhookId: string, limit = 20): Promise<WebhookDeliveryLogItem[]> {
    const webhook = await this.prisma.webhook.findFirst({ where: { id: webhookId, tenantId } });
    if (!webhook) throw new NotFoundException('Webhook não encontrado');

    return this.prisma.webhookDeliveryLog.findMany({
      where: { webhookId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        event: true,
        success: true,
        statusCode: true,
        durationMs: true,
        attempt: true,
        error: true,
        createdAt: true,
      },
    });
  }

  async toggleActive(tenantId: string, id: string): Promise<WebhookListItem> {
    return this.update(tenantId, id, {});
  }

  async delete(tenantId: string, id: string): Promise<void> {
    const webhook = await this.prisma.webhook.findFirst({
      where: { id, tenantId },
    });

    if (!webhook) {
      throw new NotFoundException('Webhook não encontrado');
    }

    await this.prisma.webhook.delete({ where: { id } });
    this.logger.log(`Webhook ${id} deleted for tenant ${tenantId}`);
  }

  private async assertBelowLimit(tenantId: string): Promise<void> {
    const count = await this.prisma.webhook.count({ where: { tenantId } });
    if (count >= MAX_WEBHOOKS_PER_TENANT) {
      throw new BadRequestException(
        `Limite de ${MAX_WEBHOOKS_PER_TENANT} webhooks atingido.`,
      );
    }
  }
}
