import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ServiceUnavailableException, HttpException } from '@nestjs/common';
import { EvolutionApiClientService } from '../evolution-api-client.service';
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '@/prisma/prisma.service';

function makeConfigMock() {
  const config: Record<string, string> = {
    EVOLUTION_API_URL: 'https://evo.test',
    EVOLUTION_API_KEY: 'test-key',
    DEFAULT_INSTANCE_SLUG: 'default',
  };
  return {
    get: vi.fn((key: string, defaultValue?: string) => config[key] ?? defaultValue ?? ''),
  } as unknown as ConfigService;
}

function makePrismaMock() {
  return {
    whatsAppInstance: {
      findFirst: vi.fn(),
    },
  } as unknown as PrismaService;
}

describe('EvolutionApiClientService — Cache & Pre-send', () => {
  let service: EvolutionApiClientService;
  let prisma: ReturnType<typeof makePrismaMock>;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    prisma = makePrismaMock();
    service = new EvolutionApiClientService(makeConfigMock(), prisma);

    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({ key: { id: 'msg-123' } })),
    });
    vi.stubGlobal('fetch', mockFetch);
  });

  // ── Cache positive results ────────────────────────────

  it('caches instance name and reuses on subsequent calls', async () => {
    vi.mocked(prisma.whatsAppInstance.findFirst).mockResolvedValue({
      instanceName: 'tenant-test',
      status: 'CONNECTED',
    } as never);

    // First call — hits DB
    await service.sendTextMessage({ phone: '5511999998888', message: 'Hi', tenantSlug: 'test' } as never);
    expect(prisma.whatsAppInstance.findFirst).toHaveBeenCalledTimes(1);

    // Second call within TTL — uses cache
    await service.sendTextMessage({ phone: '5511999998888', message: 'Hi', tenantSlug: 'test' } as never);
    expect(prisma.whatsAppInstance.findFirst).toHaveBeenCalledTimes(1); // Still 1
  });

  it('refreshes cache after TTL expires', async () => {
    vi.mocked(prisma.whatsAppInstance.findFirst).mockResolvedValue({
      instanceName: 'tenant-test',
      status: 'CONNECTED',
    } as never);

    await service.sendTextMessage({ phone: '5511999998888', message: 'Hi', tenantSlug: 'test' } as never);

    // Advance past 30s TTL
    vi.advanceTimersByTime(31_000);

    await service.sendTextMessage({ phone: '5511999998888', message: 'Hi', tenantSlug: 'test' } as never);
    expect(prisma.whatsAppInstance.findFirst).toHaveBeenCalledTimes(2);
  });

  // ── Cache does NOT store null ─────────────────────────

  it('does NOT cache null results (instance not found)', async () => {
    vi.mocked(prisma.whatsAppInstance.findFirst).mockResolvedValue(null);

    await expect(
      service.sendTextMessage({ phone: '5511999998888', message: 'Hi', tenantSlug: 'test' } as never),
    ).rejects.toThrow();

    // Second call should hit DB again (null was not cached)
    await expect(
      service.sendTextMessage({ phone: '5511999998888', message: 'Hi', tenantSlug: 'test' } as never),
    ).rejects.toThrow();

    expect(prisma.whatsAppInstance.findFirst).toHaveBeenCalledTimes(2);
  });

  // ── Pre-send status check ─────────────────────────────

  it('rejects send when instance status is NEEDS_QR', async () => {
    vi.mocked(prisma.whatsAppInstance.findFirst).mockResolvedValue({
      instanceName: 'tenant-test',
      status: 'NEEDS_QR',
    } as never);

    await expect(
      service.sendTextMessage({ phone: '5511999998888', message: 'Hi', tenantSlug: 'test' } as never),
    ).rejects.toThrow(ServiceUnavailableException);

    // fetch should NOT have been called (pre-send guard blocked)
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('rejects send when instance status is DISCONNECTED', async () => {
    vi.mocked(prisma.whatsAppInstance.findFirst).mockResolvedValue({
      instanceName: 'tenant-test',
      status: 'DISCONNECTED',
    } as never);

    await expect(
      service.sendTextMessage({ phone: '5511999998888', message: 'Hi', tenantSlug: 'test' } as never),
    ).rejects.toThrow(ServiceUnavailableException);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('allows send when instance status is CONNECTED', async () => {
    vi.mocked(prisma.whatsAppInstance.findFirst).mockResolvedValue({
      instanceName: 'tenant-test',
      status: 'CONNECTED',
    } as never);

    await service.sendTextMessage({ phone: '5511999998888', message: 'Hi', tenantSlug: 'test' } as never);

    expect(mockFetch).toHaveBeenCalled();
  });

  // ── Cache invalidation ────────────────────────────────

  it('clears cache for a specific tenant slug', async () => {
    vi.mocked(prisma.whatsAppInstance.findFirst).mockResolvedValue({
      instanceName: 'tenant-test',
      status: 'CONNECTED',
    } as never);

    // Populate cache
    await service.sendTextMessage({ phone: '5511999998888', message: 'Hi', tenantSlug: 'test' } as never);
    expect(prisma.whatsAppInstance.findFirst).toHaveBeenCalledTimes(1);

    // Invalidate
    service.clearInstanceNameCache('test');

    // Next call should hit DB
    await service.sendTextMessage({ phone: '5511999998888', message: 'Hi', tenantSlug: 'test' } as never);
    expect(prisma.whatsAppInstance.findFirst).toHaveBeenCalledTimes(2);
  });

  it('updates cache status on connected event', async () => {
    vi.mocked(prisma.whatsAppInstance.findFirst).mockResolvedValue({
      instanceName: 'tenant-test',
      status: 'DISCONNECTED',
    } as never);

    // Populate cache with DISCONNECTED status — should reject sends
    await expect(
      service.sendTextMessage({ phone: '5511999998888', message: 'Hi', tenantSlug: 'test' } as never),
    ).rejects.toThrow();

    // Simulate connection event updating cache
    service.onInstanceConnected({ tenantSlug: 'test' });

    // Now the cached status is CONNECTED — should allow send
    await service.sendTextMessage({ phone: '5511999998888', message: 'Hi', tenantSlug: 'test' } as never);
    expect(mockFetch).toHaveBeenCalled();
  });

  // ── No instance configured ────────────────────────────

  it('throws 422 when no instance exists for tenant', async () => {
    vi.mocked(prisma.whatsAppInstance.findFirst).mockResolvedValue(null);

    await expect(
      service.sendTextMessage({ phone: '5511999998888', message: 'Hi', tenantSlug: 'test' } as never),
    ).rejects.toThrow(HttpException);
  });
});
