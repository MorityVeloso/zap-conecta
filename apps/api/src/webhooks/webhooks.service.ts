import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
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

  async toggleActive(tenantId: string, id: string): Promise<WebhookListItem> {
    const webhook = await this.prisma.webhook.findFirst({
      where: { id, tenantId },
    });

    if (!webhook) {
      throw new NotFoundException('Webhook não encontrado');
    }

    return this.prisma.webhook.update({
      where: { id },
      data: { isActive: !webhook.isActive },
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
