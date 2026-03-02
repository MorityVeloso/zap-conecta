import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { ScheduledMessagesService } from '../scheduled-messages.service';
import type { PrismaService } from '@/prisma/prisma.service';
import type { Queue } from 'bullmq';
import type { ScheduleMessageDto } from '../scheduled-messages.dto';

function makePrismaMock() {
  return {
    scheduledMessage: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
  } as unknown as PrismaService;
}

function makeQueueMock() {
  return {
    add: vi.fn().mockResolvedValue({}),
    getJob: vi.fn(),
  } as unknown as Queue;
}

const TENANT_ID = 'tenant-1';
const INSTANCE_ID = 'inst-1';
const TENANT_SLUG = 'acme';

describe('ScheduledMessagesService', () => {
  let service: ScheduledMessagesService;
  let prisma: ReturnType<typeof makePrismaMock>;
  let queue: ReturnType<typeof makeQueueMock>;

  beforeEach(() => {
    prisma = makePrismaMock();
    queue = makeQueueMock();
    service = new ScheduledMessagesService(prisma, queue);
    vi.clearAllMocks();
  });

  // ── schedule ────────────────────────────────────────

  describe('schedule', () => {
    const dto: ScheduleMessageDto = {
      phone: '5511999998888',
      type: 'TEXT',
      payload: { text: 'Hello!' },
      scheduledAt: new Date(Date.now() + 60_000).toISOString(),
    };

    it('creates DB record and enqueues job with delay', async () => {
      const record = { id: 'sched-1', ...dto, tenantId: TENANT_ID };
      vi.mocked(prisma.scheduledMessage.create).mockResolvedValue(record as never);

      const result = await service.schedule(TENANT_ID, INSTANCE_ID, TENANT_SLUG, dto);

      expect(prisma.scheduledMessage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: TENANT_ID,
          instanceId: INSTANCE_ID,
          phone: dto.phone,
          type: 'TEXT',
        }),
      });

      expect(queue.add).toHaveBeenCalledWith(
        'send-scheduled',
        { scheduledMessageId: 'sched-1', tenantSlug: TENANT_SLUG },
        expect.objectContaining({
          jobId: 'sched-1',
          removeOnComplete: 100,
          removeOnFail: 200,
        }),
      );

      // delay should be positive (scheduled in the future)
      const addCall = vi.mocked(queue.add).mock.calls[0][2];
      expect(addCall?.delay).toBeGreaterThan(0);

      expect(result).toBe(record);
    });

    it('sets delay to 0 if scheduledAt is in the past', async () => {
      const pastDto = { ...dto, scheduledAt: new Date(Date.now() - 10_000).toISOString() };
      vi.mocked(prisma.scheduledMessage.create).mockResolvedValue({ id: 'sched-2' } as never);

      await service.schedule(TENANT_ID, INSTANCE_ID, TENANT_SLUG, pastDto);

      const addCall = vi.mocked(queue.add).mock.calls[0][2];
      expect(addCall?.delay).toBe(0);
    });
  });

  // ── list ────────────────────────────────────────────

  describe('list', () => {
    it('returns paginated scheduled messages ordered by scheduledAt', async () => {
      const messages = [{ id: '1' }, { id: '2' }];
      vi.mocked(prisma.scheduledMessage.findMany).mockResolvedValue(messages as never);
      vi.mocked(prisma.scheduledMessage.count).mockResolvedValue(2);

      const result = await service.list(TENANT_ID);

      expect(prisma.scheduledMessage.findMany).toHaveBeenCalledWith({
        where: { tenantId: TENANT_ID },
        orderBy: { scheduledAt: 'asc' },
        skip: 0,
        take: 20,
      });
      expect(prisma.scheduledMessage.count).toHaveBeenCalledWith({
        where: { tenantId: TENANT_ID },
      });
      expect(result).toEqual({ data: messages, total: 2, page: 1, limit: 20 });
    });
  });

  // ── cancel ──────────────────────────────────────────

  describe('cancel', () => {
    it('updates status to CANCELLED and removes BullMQ job', async () => {
      const record = { id: 'sched-1', status: 'PENDING' };
      vi.mocked(prisma.scheduledMessage.findFirst).mockResolvedValue(record as never);
      vi.mocked(prisma.scheduledMessage.update).mockResolvedValue({} as never);
      const mockJob = { remove: vi.fn() };
      vi.mocked(queue.getJob).mockResolvedValue(mockJob as never);

      const result = await service.cancel(TENANT_ID, 'sched-1');

      expect(prisma.scheduledMessage.findFirst).toHaveBeenCalledWith({
        where: { id: 'sched-1', tenantId: TENANT_ID, status: 'PENDING' },
      });
      expect(prisma.scheduledMessage.update).toHaveBeenCalledWith({
        where: { id: 'sched-1' },
        data: { status: 'CANCELLED' },
      });
      expect(mockJob.remove).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });

    it('throws NotFoundException when record not found', async () => {
      vi.mocked(prisma.scheduledMessage.findFirst).mockResolvedValue(null);

      await expect(service.cancel(TENANT_ID, 'nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('handles missing BullMQ job gracefully (already processed)', async () => {
      vi.mocked(prisma.scheduledMessage.findFirst).mockResolvedValue({ id: 'sched-1', status: 'PENDING' } as never);
      vi.mocked(prisma.scheduledMessage.update).mockResolvedValue({} as never);
      vi.mocked(queue.getJob).mockResolvedValue(null as never);

      await expect(service.cancel(TENANT_ID, 'sched-1')).resolves.toEqual({ success: true });
    });
  });
});
