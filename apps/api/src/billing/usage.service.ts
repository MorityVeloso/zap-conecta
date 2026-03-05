/**
 * UsageService — Tracks and enforces per-tenant message quotas.
 *
 * quota check flow:
 *  1. assertBelowQuota(tenantId) — throws 429 if over plan limit
 *  2. incrementSent / incrementReceived — called after message success
 *
 * Storage: usage_records table (tenantId + period YYYY-MM, upserted).
 */
import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { WhatsAppMessageSentEvent, WhatsAppMessageReceivedEvent } from '../whatsapp/whatsapp.events';
import { PrismaService } from '@/prisma/prisma.service';

@Injectable()
export class UsageService {
  private readonly logger = new Logger(UsageService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Current period string, e.g. '2026-02' */
  private currentPeriod(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  /** Throws 429 if tenant has exceeded plan's monthly message quota. */
  async assertBelowQuota(tenantId: string): Promise<void> {
    const period = this.currentPeriod();

    const [tenant, usage] = await Promise.all([
      this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { plan: { select: { messagesPerMonth: true, displayName: true } } },
      }),
      this.prisma.usageRecord.findUnique({
        where: { tenantId_period: { tenantId, period } },
        select: { messagesSent: true },
      }),
    ]);

    if (!tenant) return; // safeguard

    const { messagesPerMonth, displayName } = tenant.plan;
    if (messagesPerMonth === -1) return; // unlimited plan

    const sent = usage?.messagesSent ?? 0;
    if (sent >= messagesPerMonth) {
      throw new HttpException(
        `Quota mensal atingida (${sent}/${messagesPerMonth} mensagens — plano ${displayName}). Faça upgrade para continuar.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /** Increments messagesSent counter for the current period. */
  async incrementSent(tenantId: string): Promise<void> {
    const period = this.currentPeriod();
    try {
      await this.prisma.usageRecord.upsert({
        where: { tenantId_period: { tenantId, period } },
        create: { tenantId, period, messagesSent: 1 },
        update: { messagesSent: { increment: 1 } },
      });
    } catch (err) {
      this.logger.warn(`Failed to increment sent usage for ${tenantId}: ${String(err)}`);
    }
  }

  /** Increments messagesReceived counter for the current period. */
  async incrementReceived(tenantId: string): Promise<void> {
    const period = this.currentPeriod();
    try {
      await this.prisma.usageRecord.upsert({
        where: { tenantId_period: { tenantId, period } },
        create: { tenantId, period, messagesReceived: 1 },
        update: { messagesReceived: { increment: 1 } },
      });
    } catch (err) {
      this.logger.warn(`Failed to increment received usage for ${tenantId}: ${String(err)}`);
    }
  }

  /** Gets current period usage for a tenant. */
  async getUsage(tenantId: string) {
    const period = this.currentPeriod();
    const [tenant, usage] = await Promise.all([
      this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { plan: { select: { messagesPerMonth: true, displayName: true } } },
      }),
      this.prisma.usageRecord.findUnique({
        where: { tenantId_period: { tenantId, period } },
      }),
    ]);

    return {
      period,
      messagesSent: usage?.messagesSent ?? 0,
      messagesReceived: usage?.messagesReceived ?? 0,
      limit: tenant?.plan.messagesPerMonth ?? 300,
      planName: tenant?.plan.displayName ?? 'Free',
    };
  }

  // ── EventEmitter listeners ────────────────────────────────────

  @OnEvent('whatsapp.message.sent', { async: true })
  async onMessageSent(event: WhatsAppMessageSentEvent): Promise<void> {
    if (event.tenantId) {
      await this.incrementSent(event.tenantId);
    }
  }

  @OnEvent('whatsapp.message.received', { async: true })
  async onMessageReceived(event: WhatsAppMessageReceivedEvent): Promise<void> {
    if (event.tenantId) {
      await this.incrementReceived(event.tenantId);
    }
  }
}
