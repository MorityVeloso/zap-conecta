import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash, randomBytes } from 'crypto';
import { ApiKeysService } from '../api-keys.service';
import type { PrismaService } from '@/prisma/prisma.service';

// Minimal PrismaService mock — only the methods used by ApiKeysService
function makePrismaMock() {
  return {
    apiKey: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    tenant: {
      findUnique: vi.fn(),
    },
    plan: {
      findUnique: vi.fn(),
    },
  } as unknown as PrismaService;
}

describe('ApiKeysService', () => {
  let service: ApiKeysService;
  let prisma: ReturnType<typeof makePrismaMock>;

  beforeEach(() => {
    prisma = makePrismaMock();
    service = new ApiKeysService(prisma);
  });

  // ── create ──────────────────────────────────────────────────

  it('generates a key with zc_live_ prefix', async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue({
      id: 'tenant-1',
      planId: 'plan-1',
    } as never);
    vi.mocked(prisma.plan.findUnique).mockResolvedValue({
      apiKeysLimit: 5,
    } as never);
    vi.mocked(prisma.apiKey.count).mockResolvedValue(2);
    vi.mocked(prisma.apiKey.create).mockResolvedValue({
      id: 'key-id-1', name: 'Minha chave', tenantId: 'tenant-1',
      keyHash: 'hash', keyPrefix: 'zc_live_', createdAt: new Date(),
      lastUsedAt: null, expiresAt: null, revokedAt: null, createdById: null,
    } as never);

    const result = await service.create('tenant-1', 'Minha chave');

    expect(result.plainKey).toMatch(/^zc_live_/);
    expect(result.keyPrefix).toMatch(/^zc_live_/);
    expect(result.plainKey).not.toEqual(result.keyPrefix); // plain is longer
    expect(prisma.apiKey.create).toHaveBeenCalledOnce();
  });

  it('stores SHA-256 hash, never the plain key', async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue({ id: 'tenant-1', planId: 'plan-1' } as never);
    vi.mocked(prisma.plan.findUnique).mockResolvedValue({ apiKeysLimit: 5 } as never);
    vi.mocked(prisma.apiKey.count).mockResolvedValue(0);

    vi.mocked(prisma.apiKey.create).mockResolvedValue({
      id: 'key-id', name: 'Test', tenantId: 'tenant-1',
      keyHash: 'placeholder', keyPrefix: 'zc_live_', createdAt: new Date(),
      lastUsedAt: null, expiresAt: null, revokedAt: null, createdById: null,
    } as never);

    const { plainKey } = await service.create('tenant-1', 'Test');

    // Capture actual data passed to prisma.create to check the hash
    const createCall = vi.mocked(prisma.apiKey.create).mock.calls[0][0];
    const storedHash = (createCall.data as { keyHash: string }).keyHash;

    const expectedHash = createHash('sha256').update(plainKey).digest('hex');
    expect(storedHash).toEqual(expectedHash);
    // Plain key must NOT appear anywhere in stored data
    expect(storedHash).not.toContain('zc_live_');
  });

  it('throws when API key limit is reached', async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue({ id: 'tenant-1', planId: 'plan-1' } as never);
    vi.mocked(prisma.plan.findUnique).mockResolvedValue({ apiKeysLimit: 2 } as never);
    vi.mocked(prisma.apiKey.count).mockResolvedValue(2); // at limit

    await expect(service.create('tenant-1', 'Over limit')).rejects.toThrow(
      /limite/i,
    );
  });

  // ── validateKey ─────────────────────────────────────────────

  it('validates a correct key and returns tenantId', async () => {
    const plainKey = `zc_live_${randomBytes(16).toString('hex')}`;
    const keyHash = createHash('sha256').update(plainKey).digest('hex');
    const keyPrefix = plainKey.slice(0, 16);

    vi.mocked(prisma.apiKey.findFirst).mockResolvedValue({
      id: 'key-id',
      tenantId: 'tenant-1',
      keyHash,
      revokedAt: null,
      expiresAt: null,
      tenant: { status: 'ACTIVE' },
    } as never);
    vi.mocked(prisma.apiKey.update).mockResolvedValue({} as never);

    const result = await service.validateKey(plainKey);

    expect(result).toMatchObject({ tenantId: 'tenant-1' });
    expect(prisma.apiKey.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ keyPrefix }),
      }),
    );
  });

  it('returns null for unknown key prefix', async () => {
    vi.mocked(prisma.apiKey.findFirst).mockResolvedValue(null);

    const result = await service.validateKey('zc_live_unknownprefix00000000000000000000');

    expect(result).toBeNull();
  });

  it('returns null for revoked key', async () => {
    const plainKey = `zc_live_${randomBytes(16).toString('hex')}`;
    const keyHash = createHash('sha256').update(plainKey).digest('hex');

    vi.mocked(prisma.apiKey.findFirst).mockResolvedValue({
      id: 'key-id',
      tenantId: 'tenant-1',
      keyHash,
      revokedAt: new Date(), // revoked!
      expiresAt: null,
      tenant: { status: 'ACTIVE' },
    } as never);

    const result = await service.validateKey(plainKey);
    expect(result).toBeNull();
  });

  // ── list ────────────────────────────────────────────────────

  it('lists API keys without exposing hashes (paginated)', async () => {
    vi.mocked(prisma.apiKey.findMany).mockResolvedValue([
      { id: 'k1', name: 'Key 1', keyPrefix: 'zc_live_abcde123', createdAt: new Date(), lastUsedAt: null, expiresAt: null, revokedAt: null },
    ] as never);
    vi.mocked(prisma.apiKey.count).mockResolvedValue(1);

    const result = await service.list('tenant-1');

    expect(result.data).toHaveLength(1);
    expect(result.data[0]).not.toHaveProperty('keyHash');
    expect(result.data[0]).toHaveProperty('keyPrefix', 'zc_live_abcde123');
    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
  });

  // ── revoke ──────────────────────────────────────────────────

  it('revokes a key that belongs to the tenant', async () => {
    vi.mocked(prisma.apiKey.findFirst).mockResolvedValue({
      id: 'k1',
      tenantId: 'tenant-1',
    } as never);
    vi.mocked(prisma.apiKey.update).mockResolvedValue({} as never);

    await service.revoke('tenant-1', 'k1');

    expect(prisma.apiKey.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'k1' },
        data: expect.objectContaining({ revokedAt: expect.any(Date) }),
      }),
    );
  });

  it('throws when trying to revoke a key belonging to another tenant', async () => {
    vi.mocked(prisma.apiKey.findFirst).mockResolvedValue(null); // not found for this tenant

    await expect(service.revoke('tenant-1', 'k-other')).rejects.toThrow(
      /não encontrada/i,
    );
  });
});
