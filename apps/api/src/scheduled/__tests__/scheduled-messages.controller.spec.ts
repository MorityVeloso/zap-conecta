import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScheduledMessagesController } from '../scheduled-messages.controller';
import type { ScheduledMessagesService } from '../scheduled-messages.service';
import type { EvolutionInstanceService } from '../../whatsapp/evolution-instance.service';
import type { TenantContext } from '../../auth/supabase-jwt.guard';

function makeScheduledServiceMock() {
  return {
    schedule: vi.fn(),
    list: vi.fn(),
    cancel: vi.fn(),
  } as unknown as ScheduledMessagesService;
}

function makeEvolutionInstanceServiceMock() {
  return {
    findByTenant: vi.fn().mockResolvedValue({ id: 'inst-1', instanceName: 'acme-inst' }),
  } as unknown as EvolutionInstanceService;
}

const TENANT: TenantContext = {
  tenantId: 'tenant-1',
  tenantSlug: 'acme',
  userId: 'user-1',
  email: 'user@acme.com',
  role: 'owner',
};

describe('ScheduledMessagesController', () => {
  let controller: ScheduledMessagesController;
  let scheduledService: ReturnType<typeof makeScheduledServiceMock>;
  let instService: ReturnType<typeof makeEvolutionInstanceServiceMock>;

  beforeEach(() => {
    scheduledService = makeScheduledServiceMock();
    instService = makeEvolutionInstanceServiceMock();
    controller = new ScheduledMessagesController(scheduledService, instService);
    vi.clearAllMocks();
    vi.mocked(instService.findByTenant).mockResolvedValue({ id: 'inst-1' } as never);
  });

  // ── schedule ────────────────────────────────────────

  it('schedule resolves instanceId and passes to service', async () => {
    vi.mocked(scheduledService.schedule).mockResolvedValue({ id: 'sched-1' } as never);

    const dto = {
      phone: '5511999998888',
      type: 'TEXT' as const,
      payload: { text: 'Hello!' },
      scheduledAt: new Date(Date.now() + 60_000).toISOString(),
    };

    const result = await controller.schedule(TENANT, dto);

    expect(instService.findByTenant).toHaveBeenCalledWith('acme');
    expect(scheduledService.schedule).toHaveBeenCalledWith('tenant-1', 'inst-1', 'acme', dto);
    expect(result).toEqual({ id: 'sched-1' });
  });

  it('schedule uses tenantSlug as instanceId fallback', async () => {
    vi.mocked(instService.findByTenant).mockResolvedValue(null as never);
    vi.mocked(scheduledService.schedule).mockResolvedValue({ id: 'sched-2' } as never);

    const dto = {
      phone: '5511999998888',
      type: 'TEXT' as const,
      payload: { text: 'Hello!' },
      scheduledAt: new Date(Date.now() + 60_000).toISOString(),
    };

    await controller.schedule(TENANT, dto);

    expect(scheduledService.schedule).toHaveBeenCalledWith('tenant-1', 'acme', 'acme', dto);
  });

  // ── list ────────────────────────────────────────────

  it('list passes tenantId with default pagination to service', async () => {
    const paginated = { data: [{ id: 'sched-1' }, { id: 'sched-2' }], total: 2, page: 1, limit: 20 };
    vi.mocked(scheduledService.list).mockResolvedValue(paginated as never);

    const result = await controller.list(TENANT);

    expect(scheduledService.list).toHaveBeenCalledWith('tenant-1', 1, 20);
    expect(result).toEqual(paginated);
  });

  // ── cancel ──────────────────────────────────────────

  it('cancel passes tenantId and message id', async () => {
    vi.mocked(scheduledService.cancel).mockResolvedValue({ success: true });

    const result = await controller.cancel(TENANT, 'sched-1');

    expect(scheduledService.cancel).toHaveBeenCalledWith('tenant-1', 'sched-1');
    expect(result).toEqual({ success: true });
  });
});
