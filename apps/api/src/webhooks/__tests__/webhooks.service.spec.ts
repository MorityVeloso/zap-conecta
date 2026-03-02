import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { WebhooksService } from '../webhooks.service';
import type { PrismaService } from '@/prisma/prisma.service';

function makePrismaMock() {
  return {
    webhook: {
      findMany: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
  } as unknown as PrismaService;
}

const TENANT_ID = 'tenant-1';

describe('WebhooksService', () => {
  let service: WebhooksService;
  let prisma: ReturnType<typeof makePrismaMock>;

  beforeEach(() => {
    prisma = makePrismaMock();
    service = new WebhooksService(prisma);
    vi.clearAllMocks();
  });

  // ── list ────────────────────────────────────────────

  describe('list', () => {
    it('returns paginated webhooks for tenant ordered by createdAt desc', async () => {
      const webhooks = [{ id: 'wh-1' }, { id: 'wh-2' }];
      vi.mocked(prisma.webhook.findMany).mockResolvedValue(webhooks as never);
      vi.mocked(prisma.webhook.count).mockResolvedValue(2);

      const result = await service.list(TENANT_ID);

      expect(prisma.webhook.findMany).toHaveBeenCalledWith({
        where: { tenantId: TENANT_ID },
        select: expect.objectContaining({ id: true, url: true, events: true, isActive: true }),
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 20,
      });
      expect(prisma.webhook.count).toHaveBeenCalledWith({
        where: { tenantId: TENANT_ID },
      });
      expect(result).toEqual({ data: webhooks, total: 2, page: 1, limit: 20 });
    });
  });

  // ── create ──────────────────────────────────────────

  describe('create', () => {
    it('creates webhook with HMAC secret', async () => {
      vi.mocked(prisma.webhook.count).mockResolvedValue(0);
      vi.mocked(prisma.webhook.create).mockResolvedValue({
        id: 'wh-new',
        url: 'https://example.com/hook',
        events: ['message.received'],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);

      const result = await service.create(TENANT_ID, 'https://example.com/hook', ['message.received']);

      expect(prisma.webhook.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: TENANT_ID,
          url: 'https://example.com/hook',
          events: ['message.received'],
          isActive: true,
          secret: expect.any(String),
        }),
        select: expect.objectContaining({ id: true }),
      });

      // secret should be a 64-char hex string (32 bytes)
      expect(result.secret).toMatch(/^[0-9a-f]{64}$/);
    });

    it('throws when webhook limit reached (10)', async () => {
      vi.mocked(prisma.webhook.count).mockResolvedValue(10);

      await expect(
        service.create(TENANT_ID, 'https://example.com/hook', ['message.received']),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows creation when under limit', async () => {
      vi.mocked(prisma.webhook.count).mockResolvedValue(9);
      vi.mocked(prisma.webhook.create).mockResolvedValue({
        id: 'wh-new', url: 'https://a.com', events: [], isActive: true,
        createdAt: new Date(), updatedAt: new Date(),
      } as never);

      await expect(
        service.create(TENANT_ID, 'https://a.com', ['message.received']),
      ).resolves.toBeDefined();
    });
  });

  // ── toggleActive ────────────────────────────────────

  describe('toggleActive', () => {
    it('toggles isActive from true to false', async () => {
      vi.mocked(prisma.webhook.findFirst).mockResolvedValue({ id: 'wh-1', isActive: true } as never);
      vi.mocked(prisma.webhook.update).mockResolvedValue({ id: 'wh-1', isActive: false } as never);

      const result = await service.toggleActive(TENANT_ID, 'wh-1');

      expect(prisma.webhook.update).toHaveBeenCalledWith({
        where: { id: 'wh-1' },
        data: { isActive: false },
        select: expect.objectContaining({ id: true, isActive: true }),
      });
      expect(result.isActive).toBe(false);
    });

    it('toggles isActive from false to true', async () => {
      vi.mocked(prisma.webhook.findFirst).mockResolvedValue({ id: 'wh-1', isActive: false } as never);
      vi.mocked(prisma.webhook.update).mockResolvedValue({ id: 'wh-1', isActive: true } as never);

      const result = await service.toggleActive(TENANT_ID, 'wh-1');

      expect(prisma.webhook.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isActive: true } }),
      );
      expect(result.isActive).toBe(true);
    });

    it('throws NotFoundException when webhook not found', async () => {
      vi.mocked(prisma.webhook.findFirst).mockResolvedValue(null);

      await expect(service.toggleActive(TENANT_ID, 'nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  // ── delete ──────────────────────────────────────────

  describe('delete', () => {
    it('deletes webhook belonging to tenant', async () => {
      vi.mocked(prisma.webhook.findFirst).mockResolvedValue({ id: 'wh-1' } as never);
      vi.mocked(prisma.webhook.delete).mockResolvedValue({} as never);

      await service.delete(TENANT_ID, 'wh-1');

      expect(prisma.webhook.findFirst).toHaveBeenCalledWith({
        where: { id: 'wh-1', tenantId: TENANT_ID },
      });
      expect(prisma.webhook.delete).toHaveBeenCalledWith({ where: { id: 'wh-1' } });
    });

    it('throws NotFoundException when webhook not found', async () => {
      vi.mocked(prisma.webhook.findFirst).mockResolvedValue(null);

      await expect(service.delete(TENANT_ID, 'nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('enforces tenant isolation (cannot delete another tenant webhook)', async () => {
      vi.mocked(prisma.webhook.findFirst).mockResolvedValue(null);

      await expect(service.delete('other-tenant', 'wh-1')).rejects.toThrow(NotFoundException);
      expect(prisma.webhook.delete).not.toHaveBeenCalled();
    });
  });
});
