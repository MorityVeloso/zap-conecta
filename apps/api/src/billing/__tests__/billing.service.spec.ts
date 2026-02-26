import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { SubscriptionStatus } from '@prisma/client';
import { BillingService } from '../billing.service';
import type { PrismaService } from '@/prisma/prisma.service';
import type { ConfigService } from '@nestjs/config';

function makePrismaMock() {
  return {
    plan: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findFirstOrThrow: vi.fn(),
    },
    tenant: {
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    subscription: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn().mockImplementation((ops: unknown[]) => Promise.all(ops)),
  } as unknown as PrismaService;
}

function makeConfigMock() {
  return {
    get: vi.fn().mockImplementation((key: string) => {
      const env: Record<string, string> = {
        ASAAS_API_KEY: 'test-api-key',
        ASAAS_SANDBOX: 'true',
        ASAAS_WEBHOOK_TOKEN: 'test-webhook-token',
      };
      return env[key];
    }),
  } as unknown as ConfigService;
}

// Intercept fetch globally in tests
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('BillingService', () => {
  let service: BillingService;
  let prisma: ReturnType<typeof makePrismaMock>;

  const TENANT_ID = 'tenant-1';

  const STARTER_PLAN = {
    id: 'plan-starter',
    name: 'starter',
    displayName: 'Starter',
    priceBrlCents: 9700,
    messagesPerMonth: 5000,
    instancesLimit: 3,
    apiKeysLimit: 5,
    features: {},
    isActive: true,
    createdAt: new Date(),
  };

  const FREE_PLAN = {
    id: 'plan-free',
    name: 'free',
    displayName: 'Free',
    priceBrlCents: 0,
    messagesPerMonth: 300,
    instancesLimit: 1,
    apiKeysLimit: 2,
    features: {},
    isActive: true,
    createdAt: new Date(),
  };

  beforeEach(() => {
    prisma = makePrismaMock();
    service = new BillingService(prisma, makeConfigMock());
    vi.clearAllMocks();
  });

  // ── getPlans ────────────────────────────────────────────────────

  it('returns active plans ordered by price', async () => {
    vi.mocked(prisma.plan.findMany).mockResolvedValue([FREE_PLAN, STARTER_PLAN]);

    const plans = await service.getPlans();

    expect(plans).toHaveLength(2);
    expect(prisma.plan.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isActive: true },
        orderBy: { priceBrlCents: 'asc' },
      }),
    );
  });

  // ── subscribe ───────────────────────────────────────────────────

  it('throws NotFoundException for unknown plan', async () => {
    vi.mocked(prisma.plan.findFirst).mockResolvedValue(null);

    await expect(
      service.subscribe(TENANT_ID, {
        planName: 'nonexistent',
        customerName: 'Test',
        cpf: '12345678901',
        billingType: 'PIX',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws BadRequestException for free plan subscription', async () => {
    vi.mocked(prisma.plan.findFirst).mockResolvedValue(FREE_PLAN);

    await expect(
      service.subscribe(TENANT_ID, {
        planName: 'free',
        customerName: 'Test',
        cpf: '12345678901',
        billingType: 'PIX',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws ConflictException if tenant already has active subscription', async () => {
    vi.mocked(prisma.plan.findFirst).mockResolvedValue(STARTER_PLAN);
    vi.mocked(prisma.subscription.findUnique).mockResolvedValue({
      id: 'sub-1',
      status: SubscriptionStatus.ACTIVE,
      asaasCustomerId: 'cus-1',
    } as never);

    await expect(
      service.subscribe(TENANT_ID, {
        planName: 'starter',
        customerName: 'Test',
        cpf: '12345678901',
        billingType: 'PIX',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('creates Asaas customer and subscription on success', async () => {
    vi.mocked(prisma.plan.findFirst).mockResolvedValue(STARTER_PLAN);
    vi.mocked(prisma.subscription.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.tenant.findUniqueOrThrow).mockResolvedValue({
      id: TENANT_ID,
      slug: 'my-company',
      profiles: [],
    } as never);
    vi.mocked(prisma.subscription.upsert).mockResolvedValue({} as never);
    vi.mocked(prisma.tenant.update).mockResolvedValue({} as never);

    // Mock Asaas customer creation
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'cus-asaas-1' }),
      })
      // Mock Asaas subscription creation
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          id: 'sub-asaas-1',
          status: 'ACTIVE',
          nextDueDate: '2026-03-01',
          value: 97,
        }),
      });

    const result = await service.subscribe(TENANT_ID, {
      planName: 'starter',
      customerName: 'Test Company',
      cpf: '12345678901',
      billingType: 'PIX',
    });

    expect(result.asaasSubscriptionId).toBe('sub-asaas-1');
    expect(prisma.subscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          tenantId: TENANT_ID,
          asaasSubscriptionId: 'sub-asaas-1',
          asaasCustomerId: 'cus-asaas-1',
        }),
      }),
    );
  });

  // ── cancelSubscription ──────────────────────────────────────────

  it('throws NotFoundException when no subscription exists', async () => {
    vi.mocked(prisma.subscription.findUnique).mockResolvedValue(null);

    await expect(service.cancelSubscription(TENANT_ID)).rejects.toThrow(NotFoundException);
  });

  it('calls Asaas delete and updates DB to CANCELLED + free plan', async () => {
    vi.mocked(prisma.subscription.findUnique).mockResolvedValue({
      id: 'sub-1',
      asaasSubscriptionId: 'sub-asaas-1',
    } as never);
    vi.mocked(prisma.plan.findFirstOrThrow).mockResolvedValue(FREE_PLAN);
    vi.mocked(prisma.subscription.update).mockResolvedValue({} as never);
    vi.mocked(prisma.tenant.update).mockResolvedValue({} as never);

    // Mock Asaas delete
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

    await service.cancelSubscription(TENANT_ID);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('sub-asaas-1'),
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  // ── handleWebhook ───────────────────────────────────────────────

  it('activates subscription on PAYMENT_CONFIRMED', async () => {
    vi.mocked(prisma.subscription.findUnique).mockResolvedValue({
      id: 'sub-1',
    } as never);
    vi.mocked(prisma.subscription.update).mockResolvedValue({} as never);

    await service.handleWebhook({
      event: 'PAYMENT_CONFIRMED',
      payment: {
        id: 'pay-1',
        status: 'CONFIRMED',
        value: 97,
        externalReference: TENANT_ID,
      },
    });

    expect(prisma.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: TENANT_ID },
        data: expect.objectContaining({ status: SubscriptionStatus.ACTIVE }),
      }),
    );
  });

  it('marks subscription PAST_DUE on PAYMENT_OVERDUE', async () => {
    vi.mocked(prisma.subscription.updateMany).mockResolvedValue({ count: 1 });

    await service.handleWebhook({
      event: 'PAYMENT_OVERDUE',
      payment: {
        id: 'pay-1',
        status: 'OVERDUE',
        value: 97,
        externalReference: TENANT_ID,
      },
    });

    expect(prisma.subscription.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: TENANT_ID },
        data: expect.objectContaining({ status: SubscriptionStatus.PAST_DUE }),
      }),
    );
  });

  it('ignores webhooks without externalReference', async () => {
    await service.handleWebhook({
      event: 'PAYMENT_CONFIRMED',
      payment: {
        id: 'pay-1',
        status: 'CONFIRMED',
        value: 97,
        externalReference: null,
      },
    });

    expect(prisma.subscription.findUnique).not.toHaveBeenCalled();
    expect(prisma.subscription.update).not.toHaveBeenCalled();
  });
});
