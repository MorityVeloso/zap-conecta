import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpException, HttpStatus } from '@nestjs/common';
import { UsageService } from '../usage.service';
import type { PrismaService } from '@/prisma/prisma.service';

function makePrismaMock() {
  return {
    tenant: {
      findUnique: vi.fn(),
    },
    usageRecord: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  } as unknown as PrismaService;
}

const FREE_PLAN = { messagesPerMonth: 300, displayName: 'Free' };
const STARTER_PLAN = { messagesPerMonth: 5000, displayName: 'Starter' };
const TENANT_ID = 'tenant-1';

describe('UsageService', () => {
  let service: UsageService;
  let prisma: ReturnType<typeof makePrismaMock>;

  beforeEach(() => {
    prisma = makePrismaMock();
    service = new UsageService(prisma);
    vi.clearAllMocks();
  });

  // ── assertBelowQuota ────────────────────────────────────────

  it('does not throw when under quota', async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue({ plan: FREE_PLAN } as never);
    vi.mocked(prisma.usageRecord.findUnique).mockResolvedValue({ messagesSent: 100 } as never);

    await expect(service.assertBelowQuota(TENANT_ID)).resolves.not.toThrow();
  });

  it('throws 429 when quota reached', async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue({ plan: FREE_PLAN } as never);
    vi.mocked(prisma.usageRecord.findUnique).mockResolvedValue({ messagesSent: 300 } as never);

    await expect(service.assertBelowQuota(TENANT_ID)).rejects.toThrow(HttpException);

    try {
      await service.assertBelowQuota(TENANT_ID);
    } catch (err) {
      expect((err as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    }
  });

  it('does not throw when usage record is null (0 messages sent)', async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue({ plan: FREE_PLAN } as never);
    vi.mocked(prisma.usageRecord.findUnique).mockResolvedValue(null);

    await expect(service.assertBelowQuota(TENANT_ID)).resolves.not.toThrow();
  });

  it('skips check when tenant not found', async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue(null);

    await expect(service.assertBelowQuota(TENANT_ID)).resolves.not.toThrow();
    expect(prisma.usageRecord.findUnique).not.toHaveBeenCalled();
  });

  it('skips check for unlimited plan (messagesPerMonth = -1)', async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue({
      plan: { messagesPerMonth: -1, displayName: 'Enterprise' },
    } as never);

    await expect(service.assertBelowQuota(TENANT_ID)).resolves.not.toThrow();
    expect(prisma.usageRecord.findUnique).not.toHaveBeenCalled();
  });

  // ── incrementSent ────────────────────────────────────────────

  it('upserts usage record on incrementSent', async () => {
    vi.mocked(prisma.usageRecord.upsert).mockResolvedValue({} as never);

    await service.incrementSent(TENANT_ID);

    expect(prisma.usageRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { messagesSent: { increment: 1 } },
        create: expect.objectContaining({ tenantId: TENANT_ID, messagesSent: 1 }),
      }),
    );
  });

  it('does not throw when upsert fails (non-critical)', async () => {
    vi.mocked(prisma.usageRecord.upsert).mockRejectedValue(new Error('DB down'));

    await expect(service.incrementSent(TENANT_ID)).resolves.not.toThrow();
  });

  // ── incrementReceived ────────────────────────────────────────

  it('upserts usage record on incrementReceived', async () => {
    vi.mocked(prisma.usageRecord.upsert).mockResolvedValue({} as never);

    await service.incrementReceived(TENANT_ID);

    expect(prisma.usageRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { messagesReceived: { increment: 1 } },
        create: expect.objectContaining({ tenantId: TENANT_ID, messagesReceived: 1 }),
      }),
    );
  });

  // ── getUsage ─────────────────────────────────────────────────

  it('returns usage with plan limits', async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue({ plan: STARTER_PLAN } as never);
    vi.mocked(prisma.usageRecord.findUnique).mockResolvedValue({
      messagesSent: 150,
      messagesReceived: 30,
    } as never);

    const usage = await service.getUsage(TENANT_ID);

    expect(usage.messagesSent).toBe(150);
    expect(usage.messagesReceived).toBe(30);
    expect(usage.limit).toBe(5000);
    expect(usage.planName).toBe('Starter');
    expect(usage.period).toMatch(/^\d{4}-\d{2}$/);
  });
});
