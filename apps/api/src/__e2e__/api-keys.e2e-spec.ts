import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { SuperTest, Test } from 'supertest';

import { ApiKeysController } from '../api-keys/api-keys.controller';
import { ApiKeysService } from '../api-keys/api-keys.service';
import {
  createTestApp,
  makePrismaMock,
  withAuth,
  TENANT_A,
  type PrismaMock,
} from './test-helpers';

describe('API Keys E2E', () => {
  let app: INestApplication;
  let req: SuperTest<Test>;
  let prisma: PrismaMock;

  beforeAll(async () => {
    prisma = makePrismaMock();
    const result = await createTestApp(prisma, {
      controllers: [ApiKeysController],
      providers: [ApiKeysService],
    });
    app = result.app;
    req = result.request;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Auth ────────────────────────────────────────────────────

  it('GET /api-keys without auth → 401', async () => {
    const res = await req.get('/api-keys');
    expect(res.status).toBe(401);
  });

  // ── Zod Validation ─────────────────────────────────────────

  it('POST /api-keys with empty body → 400', async () => {
    const res = await withAuth(req.post('/api-keys').send({}));
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Validation failed');
  });

  it('POST /api-keys with empty name → 400', async () => {
    const res = await withAuth(req.post('/api-keys').send({ name: '' }));
    expect(res.status).toBe(400);
  });

  // ── CRUD ───────────────────────────────────────────────────

  it('POST /api-keys → 201 with plainKey starting zc_live_', async () => {
    prisma.tenant.findUnique.mockResolvedValue({ planId: null });
    prisma.apiKey.count.mockResolvedValue(0);
    prisma.apiKey.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({
        id: 'key-1',
        name: data.name,
        keyPrefix: data.keyPrefix,
        createdAt: new Date(),
      }),
    );

    const res = await withAuth(req.post('/api-keys').send({ name: 'Produção' }));

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Produção');
    expect(res.body.plainKey).toMatch(/^zc_live_[0-9a-f]{48}$/);
    expect(res.body.keyPrefix).toHaveLength(16);
  });

  it('GET /api-keys → 200 array WITHOUT plainKey', async () => {
    prisma.apiKey.findMany.mockResolvedValue([
      {
        id: 'key-1',
        name: 'Produção',
        keyPrefix: 'zc_live_abc12345',
        lastUsedAt: null,
        expiresAt: null,
        revokedAt: null,
        createdAt: new Date(),
      },
    ]);

    const res = await withAuth(req.get('/api-keys'));
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).not.toHaveProperty('plainKey');
    expect(res.body[0]).not.toHaveProperty('keyHash');
  });

  it('DELETE /api-keys/:id → 204', async () => {
    prisma.apiKey.findFirst.mockResolvedValue({
      id: 'key-1',
      tenantId: TENANT_A.tenantId,
    });
    prisma.apiKey.update.mockResolvedValue({});

    const res = await withAuth(req.delete('/api-keys/key-1'));
    expect(res.status).toBe(204);
  });

  it('DELETE /api-keys/:id with wrong tenant → 404', async () => {
    prisma.apiKey.findFirst.mockResolvedValue(null);

    const res = await withAuth(req.delete('/api-keys/nonexistent'));
    expect(res.status).toBe(404);
  });

  // ── Plan Limit ─────────────────────────────────────────────

  it('POST /api-keys when at plan limit → 400', async () => {
    prisma.tenant.findUnique.mockResolvedValue({ planId: 'plan-1' });
    prisma.plan.findUnique.mockResolvedValue({ apiKeysLimit: 2 });
    prisma.apiKey.count.mockResolvedValue(2);

    const res = await withAuth(req.post('/api-keys').send({ name: 'Another' }));
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Limite');
  });
});
