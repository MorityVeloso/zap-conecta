import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessagesService } from '../messages.service';
import type { PrismaService } from '@/prisma/prisma.service';

function makePrismaMock() {
  return {
    message: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    whatsAppInstance: {
      findFirst: vi.fn(),
    },
  } as unknown as PrismaService;
}

describe('MessagesService', () => {
  let service: MessagesService;
  let prisma: ReturnType<typeof makePrismaMock>;

  const TENANT = 'tenant-1';
  const INSTANCE = 'instance-1';

  beforeEach(() => {
    prisma = makePrismaMock();
    service = new MessagesService(prisma);
  });

  // ── saveOutbound ────────────────────────────────────────────

  it('saves an outbound message with correct fields', async () => {
    vi.mocked(prisma.message.create).mockResolvedValue({
      id: 'msg-1',
      tenantId: TENANT,
      direction: 'OUTBOUND',
      type: 'TEXT',
    } as never);

    await service.saveOutbound(TENANT, INSTANCE, {
      phone: '5511999990001',
      type: 'text',
      content: { text: 'Olá!' },
      externalId: 'evo-123',
    });

    expect(prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: TENANT,
          instanceId: INSTANCE,
          direction: 'OUTBOUND',
          type: 'TEXT',
          phone: '5511999990001',
          content: { text: 'Olá!' },
        }),
      }),
    );
  });

  it('does not throw when create fails (non-critical path)', async () => {
    vi.mocked(prisma.message.create).mockRejectedValue(new Error('DB down'));

    // Should not throw — message persistence is best-effort
    await expect(
      service.saveOutbound(TENANT, INSTANCE, {
        phone: '5511999990001',
        type: 'text',
        content: { text: 'hello' },
      }),
    ).resolves.not.toThrow();
  });

  // ── saveInbound ─────────────────────────────────────────────

  it('saves an inbound message', async () => {
    vi.mocked(prisma.message.create).mockResolvedValue({ id: 'msg-2' } as never);

    await service.saveInbound(TENANT, INSTANCE, {
      phone: '5511999990002',
      type: 'text',
      content: { text: 'Oi!' },
    });

    expect(prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: TENANT,
          direction: 'INBOUND',
          phone: '5511999990002',
        }),
      }),
    );
  });

  // ── findByTenant ────────────────────────────────────────────

  it('queries messages filtered by tenantId', async () => {
    vi.mocked(prisma.message.findMany).mockResolvedValue([]);
    vi.mocked(prisma.message.count).mockResolvedValue(0);

    await service.findByTenant(TENANT, {});

    expect(prisma.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT }),
      }),
    );
  });

  it('applies phone filter when provided', async () => {
    vi.mocked(prisma.message.findMany).mockResolvedValue([]);
    vi.mocked(prisma.message.count).mockResolvedValue(0);

    await service.findByTenant(TENANT, { phone: '5511999990001' });

    expect(prisma.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: TENANT,
          phone: '5511999990001',
        }),
      }),
    );
  });

  // ── getConversations ────────────────────────────────────────

  it('returns conversations grouped by phone', async () => {
    vi.mocked(prisma.message.findMany).mockResolvedValue([
      {
        phone: '5511999990001',
        content: { text: 'Olá' },
        direction: 'INBOUND',
        type: 'TEXT',
        createdAt: new Date('2026-02-25'),
        status: 'DELIVERED',
      },
      {
        phone: '5511999990002',
        content: { text: 'Oi' },
        direction: 'OUTBOUND',
        type: 'TEXT',
        createdAt: new Date('2026-02-24'),
        status: 'SENT',
      },
    ] as never);

    const result = await service.getConversations(TENANT);

    expect(result).toHaveLength(2);
    expect(result[0]).toHaveProperty('phone');
    expect(result[0]).toHaveProperty('lastMessage');
  });
});
