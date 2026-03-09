import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WhatsAppReconnectService } from '../whatsapp-reconnect.service';
import type { EvolutionInstanceService } from '../evolution-instance.service';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { RedisService } from '../../common/redis/redis.service';

function makeEvolutionInstanceMock() {
  return {
    findByTenant: vi.fn().mockResolvedValue({
      instanceName: 'tenant-test',
      tenantId: 'tid-1',
      reconnectAttempts: 0,
    }),
    attemptRestart: vi.fn().mockResolvedValue(true),
    incrementReconnectAttempts: vi.fn().mockResolvedValue(1),
    markAsNeedsQr: vi.fn().mockResolvedValue(undefined),
  } as unknown as EvolutionInstanceService;
}

function makeRedisMock() {
  return {
    setnx: vi.fn().mockResolvedValue(true), // Lock acquired by default
    del: vi.fn().mockResolvedValue(undefined),
  } as unknown as RedisService;
}

function makeEventEmitterMock() {
  return {
    emit: vi.fn(),
  } as unknown as EventEmitter2;
}

describe('WhatsAppReconnectService', () => {
  let service: WhatsAppReconnectService;
  let evolution: ReturnType<typeof makeEvolutionInstanceMock>;
  let redis: ReturnType<typeof makeRedisMock>;
  let emitter: ReturnType<typeof makeEventEmitterMock>;

  beforeEach(() => {
    vi.useFakeTimers();
    evolution = makeEvolutionInstanceMock();
    redis = makeRedisMock();
    emitter = makeEventEmitterMock();
    service = new WhatsAppReconnectService(
      evolution as unknown as EvolutionInstanceService,
      emitter as unknown as EventEmitter2,
      redis as unknown as RedisService,
    );
  });

  // ── Redis distributed lock ────────────────────────────

  it('acquires Redis lock before reconnecting', async () => {
    const promise = service.handleDisconnect('test', 'tenant-test');
    await vi.advanceTimersByTimeAsync(60_000);
    await promise;

    expect(redis.setnx).toHaveBeenCalledWith(
      'reconnect:lock:tenant-test',
      '1',
      120, // 2min TTL
    );
  });

  it('skips reconnect if Redis lock is already held', async () => {
    vi.mocked(redis.setnx).mockResolvedValue(false);

    await service.handleDisconnect('test', 'tenant-test');

    expect(evolution.findByTenant).not.toHaveBeenCalled();
    expect(evolution.attemptRestart).not.toHaveBeenCalled();
  });

  it('releases Redis lock after completion', async () => {
    const promise = service.handleDisconnect('test', 'tenant-test');
    await vi.advanceTimersByTimeAsync(60_000);
    await promise;

    expect(redis.del).toHaveBeenCalledWith('reconnect:lock:tenant-test');
  });

  it('releases Redis lock even when restart fails', async () => {
    // attemptRestart returns false on failure (catches errors internally)
    vi.mocked(evolution.attemptRestart).mockResolvedValue(false);

    const promise = service.handleDisconnect('test', 'tenant-test');
    await vi.advanceTimersByTimeAsync(60_000);
    await promise;

    expect(redis.del).toHaveBeenCalledWith('reconnect:lock:tenant-test');
    expect(evolution.incrementReconnectAttempts).toHaveBeenCalled();
  });

  // ── Reconnect attempts ────────────────────────────────

  it('attempts restart with backoff delay', async () => {
    vi.mocked(evolution.findByTenant).mockResolvedValue({
      instanceName: 'tenant-test',
      tenantId: 'tid-1',
      reconnectAttempts: 0,
    } as never);

    const promise = service.handleDisconnect('test', 'tenant-test');

    // First attempt uses BACKOFF_MS[0] = 10_000ms
    await vi.advanceTimersByTimeAsync(10_000);
    await promise;

    expect(evolution.attemptRestart).toHaveBeenCalledWith('tenant-test');
    expect(evolution.incrementReconnectAttempts).toHaveBeenCalledWith('tenant-test');
  });

  it('uses increasing backoff delays based on attempt count', async () => {
    // Attempt 2: BACKOFF_MS[1] = 30_000ms
    vi.mocked(evolution.findByTenant).mockResolvedValue({
      instanceName: 'tenant-test',
      tenantId: 'tid-1',
      reconnectAttempts: 1,
    } as never);

    const promise = service.handleDisconnect('test', 'tenant-test');
    await vi.advanceTimersByTimeAsync(30_000);
    await promise;

    expect(evolution.attemptRestart).toHaveBeenCalled();
  });

  // ── Max attempts → NEEDS_QR ───────────────────────────

  it('marks as NEEDS_QR when max attempts reached', async () => {
    vi.mocked(evolution.findByTenant).mockResolvedValue({
      instanceName: 'tenant-test',
      tenantId: 'tid-1',
      reconnectAttempts: 3, // MAX_ATTEMPTS = 3
    } as never);

    await service.handleDisconnect('test', 'tenant-test');

    expect(evolution.markAsNeedsQr).toHaveBeenCalledWith('tenant-test');
    expect(evolution.attemptRestart).not.toHaveBeenCalled();
    expect(emitter.emit).toHaveBeenCalledWith(
      'whatsapp.instance.needs_qr',
      expect.objectContaining({ instanceName: 'tenant-test' }),
    );
  });

  it('does NOT attempt restart when already at max attempts', async () => {
    vi.mocked(evolution.findByTenant).mockResolvedValue({
      instanceName: 'tenant-test',
      tenantId: 'tid-1',
      reconnectAttempts: 5, // Over max
    } as never);

    await service.handleDisconnect('test', 'tenant-test');

    expect(evolution.attemptRestart).not.toHaveBeenCalled();
  });
});
