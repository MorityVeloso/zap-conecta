import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WhatsAppOrphanCleanupService } from '../whatsapp-orphan-cleanup.service';
import type { EvolutionInstanceService } from '../evolution-instance.service';
import type { WhatsAppReconnectService } from '../whatsapp-reconnect.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { EventEmitter2 } from '@nestjs/event-emitter';

function makeEvolutionMock() {
  return {
    listAllInstanceStates: vi.fn().mockResolvedValue([]),
    disconnectInstance: vi.fn().mockResolvedValue(undefined),
    buildWebhookUrl: vi.fn().mockReturnValue('https://api.test/whatsapp/webhook/receive/test'),
    configureWebhook: vi.fn().mockResolvedValue(undefined),
  } as unknown as EvolutionInstanceService;
}

function makeReconnectMock() {
  return {
    handleDisconnect: vi.fn().mockResolvedValue(undefined),
  } as unknown as WhatsAppReconnectService;
}

function makePrismaMock() {
  return {
    whatsAppInstance: {
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  } as unknown as PrismaService;
}

function makeEmitterMock() {
  return {
    emit: vi.fn(),
  } as unknown as EventEmitter2;
}

describe('WhatsAppOrphanCleanupService', () => {
  let service: WhatsAppOrphanCleanupService;
  let evolution: ReturnType<typeof makeEvolutionMock>;
  let reconnect: ReturnType<typeof makeReconnectMock>;
  let prisma: ReturnType<typeof makePrismaMock>;
  let emitter: ReturnType<typeof makeEmitterMock>;

  beforeEach(() => {
    vi.useFakeTimers();
    evolution = makeEvolutionMock();
    reconnect = makeReconnectMock();
    prisma = makePrismaMock();
    emitter = makeEmitterMock();

    service = new WhatsAppOrphanCleanupService(
      evolution as unknown as EvolutionInstanceService,
      reconnect as unknown as WhatsAppReconnectService,
      prisma as unknown as PrismaService,
      emitter as unknown as EventEmitter2,
    );
  });

  // ── Orphan cleanup: "connecting" timeout ──────────────

  it('disconnects instances stuck in "connecting" for >5 minutes', async () => {
    vi.mocked(evolution.listAllInstanceStates).mockResolvedValue([
      { name: 'stuck-instance', state: 'connecting' },
    ]);

    // First call: registers the instance as "connecting"
    await service.cleanupOrphanedInstances();
    expect(evolution.disconnectInstance).not.toHaveBeenCalled();

    // Advance 6 minutes
    vi.advanceTimersByTime(6 * 60_000);

    // Second call: instance has been connecting for >5min → disconnect
    await service.cleanupOrphanedInstances();
    expect(evolution.disconnectInstance).toHaveBeenCalledWith('stuck-instance');
  });

  it('does NOT disconnect instances connecting for less than 5 minutes', async () => {
    vi.mocked(evolution.listAllInstanceStates).mockResolvedValue([
      { name: 'recent-instance', state: 'connecting' },
    ]);

    await service.cleanupOrphanedInstances();
    vi.advanceTimersByTime(3 * 60_000); // Only 3 minutes
    await service.cleanupOrphanedInstances();

    expect(evolution.disconnectInstance).not.toHaveBeenCalled();
  });

  it('clears connecting timer when instance transitions to another state', async () => {
    vi.mocked(evolution.listAllInstanceStates)
      .mockResolvedValueOnce([{ name: 'inst', state: 'connecting' }])
      .mockResolvedValueOnce([{ name: 'inst', state: 'open' }])
      .mockResolvedValueOnce([{ name: 'inst', state: 'connecting' }]);

    await service.cleanupOrphanedInstances(); // Register connecting
    vi.advanceTimersByTime(3 * 60_000);
    await service.cleanupOrphanedInstances(); // Now open → timer cleared

    vi.advanceTimersByTime(4 * 60_000); // 4min from "open" call
    await service.cleanupOrphanedInstances(); // connecting again → fresh timer

    expect(evolution.disconnectInstance).not.toHaveBeenCalled();
  });

  // ── Bidirectional sync ────────────────────────────────

  it('syncs DB=DISCONNECTED to CONNECTED when Evolution=open', async () => {
    vi.mocked(evolution.listAllInstanceStates).mockResolvedValue([
      { name: 'tenant-test', state: 'open' },
    ]);
    vi.mocked(prisma.whatsAppInstance.findMany).mockResolvedValue([
      {
        instanceName: 'tenant-test',
        tenantSlug: 'test',
        tenantId: 'tid-1',
        id: 'inst-1',
        status: 'DISCONNECTED',
        lastReconnectAt: null,
        reconnectAttempts: 2,
      } as never,
    ]);

    await service.cleanupOrphanedInstances();

    expect(prisma.whatsAppInstance.updateMany).toHaveBeenCalledWith({
      where: { instanceName: 'tenant-test' },
      data: { status: 'CONNECTED', reconnectAttempts: 0 },
    });
    expect(emitter.emit).toHaveBeenCalledWith(
      'whatsapp.instance.connected',
      expect.objectContaining({ tenantId: 'tid-1' }),
    );
  });

  it('syncs DB=CONNECTED to DISCONNECTED when Evolution=close', async () => {
    vi.mocked(evolution.listAllInstanceStates).mockResolvedValue([
      { name: 'tenant-test', state: 'close' },
    ]);
    vi.mocked(prisma.whatsAppInstance.findMany).mockResolvedValue([
      {
        instanceName: 'tenant-test',
        tenantSlug: 'test',
        tenantId: 'tid-1',
        id: 'inst-1',
        status: 'CONNECTED',
        lastReconnectAt: null,
        reconnectAttempts: 0,
      } as never,
    ]);

    await service.cleanupOrphanedInstances();

    expect(prisma.whatsAppInstance.updateMany).toHaveBeenCalledWith({
      where: { instanceName: 'tenant-test' },
      data: { status: 'DISCONNECTED' },
    });
    expect(emitter.emit).toHaveBeenCalledWith(
      'whatsapp.instance.disconnected',
      expect.objectContaining({ tenantId: 'tid-1' }),
    );
    expect(reconnect.handleDisconnect).toHaveBeenCalledWith('test', 'tenant-test');
  });

  it('triggers reconnect when DB=DISCONNECTED and Evolution=close (past cooldown)', async () => {
    const pastCooldown = new Date(Date.now() - 120_000); // 2min ago

    vi.mocked(evolution.listAllInstanceStates).mockResolvedValue([
      { name: 'tenant-test', state: 'close' },
    ]);
    vi.mocked(prisma.whatsAppInstance.findMany).mockResolvedValue([
      {
        instanceName: 'tenant-test',
        tenantSlug: 'test',
        tenantId: 'tid-1',
        id: 'inst-1',
        status: 'DISCONNECTED',
        lastReconnectAt: pastCooldown,
        reconnectAttempts: 1,
      } as never,
    ]);

    await service.cleanupOrphanedInstances();

    expect(reconnect.handleDisconnect).toHaveBeenCalledWith('test', 'tenant-test');
  });

  it('skips reconnect when within cooldown period', async () => {
    const recent = new Date(Date.now() - 30_000); // 30s ago (< 90s cooldown)

    vi.mocked(evolution.listAllInstanceStates).mockResolvedValue([
      { name: 'tenant-test', state: 'close' },
    ]);
    vi.mocked(prisma.whatsAppInstance.findMany).mockResolvedValue([
      {
        instanceName: 'tenant-test',
        tenantSlug: 'test',
        tenantId: 'tid-1',
        id: 'inst-1',
        status: 'DISCONNECTED',
        lastReconnectAt: recent,
        reconnectAttempts: 1,
      } as never,
    ]);

    await service.cleanupOrphanedInstances();

    expect(reconnect.handleDisconnect).not.toHaveBeenCalled();
  });

  // ── Fail-open: empty Evolution list ───────────────────

  it('skips sync when Evolution API returns empty list (fail-open)', async () => {
    vi.mocked(evolution.listAllInstanceStates).mockResolvedValue([]);
    vi.mocked(prisma.whatsAppInstance.findMany).mockResolvedValue([
      {
        instanceName: 'tenant-test',
        tenantSlug: 'test',
        tenantId: 'tid-1',
        id: 'inst-1',
        status: 'CONNECTED',
        lastReconnectAt: null,
        reconnectAttempts: 0,
      } as never,
    ]);

    await service.cleanupOrphanedInstances();

    // Should NOT change anything — empty list means Evolution API may be down
    expect(prisma.whatsAppInstance.updateMany).not.toHaveBeenCalled();
    expect(emitter.emit).not.toHaveBeenCalled();
  });

  it('skips instances not found in Evolution list', async () => {
    vi.mocked(evolution.listAllInstanceStates).mockResolvedValue([
      { name: 'other-instance', state: 'open' },
    ]);
    vi.mocked(prisma.whatsAppInstance.findMany).mockResolvedValue([
      {
        instanceName: 'tenant-test', // Not in Evolution list
        tenantSlug: 'test',
        tenantId: 'tid-1',
        id: 'inst-1',
        status: 'CONNECTED',
        lastReconnectAt: null,
        reconnectAttempts: 0,
      } as never,
    ]);

    await service.cleanupOrphanedInstances();

    // Should NOT mark as disconnected — instance may have been deleted or list was partial
    expect(prisma.whatsAppInstance.updateMany).not.toHaveBeenCalled();
  });

  // ── Overlap guard ─────────────────────────────────────

  it('prevents overlapping cron executions', async () => {
    vi.mocked(evolution.listAllInstanceStates).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve([]), 5000)),
    );

    // Start first run
    const firstRun = service.cleanupOrphanedInstances();

    // Try second run while first is in progress
    const secondRun = service.cleanupOrphanedInstances();
    await secondRun;

    // Only one call to listAllInstanceStates
    expect(evolution.listAllInstanceStates).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5000);
    await firstRun;
  });

  // ── Webhook URL verification on startup ───────────────

  it('reconfigures webhook if URL mismatches on startup', async () => {
    vi.mocked(prisma.whatsAppInstance.findMany).mockResolvedValue([
      {
        instanceName: 'tenant-test',
        tenantSlug: 'test',
        webhookUrl: 'https://old-url.com/webhook',
      } as never,
    ]);
    vi.mocked(evolution.buildWebhookUrl).mockReturnValue('https://api.test/whatsapp/webhook/receive/test');

    await service.onModuleInit();

    expect(evolution.configureWebhook).toHaveBeenCalledWith('tenant-test', 'test');
  });

  it('does NOT reconfigure webhook if URL matches', async () => {
    const expectedUrl = 'https://api.test/whatsapp/webhook/receive/test';
    vi.mocked(prisma.whatsAppInstance.findMany).mockResolvedValue([
      {
        instanceName: 'tenant-test',
        tenantSlug: 'test',
        webhookUrl: expectedUrl,
      } as never,
    ]);
    vi.mocked(evolution.buildWebhookUrl).mockReturnValue(expectedUrl);

    await service.onModuleInit();

    expect(evolution.configureWebhook).not.toHaveBeenCalled();
  });
});
