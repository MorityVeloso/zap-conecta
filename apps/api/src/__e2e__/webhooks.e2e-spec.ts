import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { SuperTest, Test } from 'supertest';

import { WebhooksController } from '../webhooks/webhooks.controller';
import { WebhooksService } from '../webhooks/webhooks.service';
import {
  createTestApp,
  makePrismaMock,
  withAuth,
  TENANT_A,
  TENANT_B,
  type PrismaMock,
} from './test-helpers';

describe('Webhooks E2E', () => {
  let app: INestApplication;
  let req: SuperTest<Test>;
  let prisma: PrismaMock;

  beforeAll(async () => {
    prisma = makePrismaMock();
    const result = await createTestApp(prisma, {
      controllers: [WebhooksController],
      providers: [WebhooksService],
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

  it('GET /webhooks without auth → 401', async () => {
    const res = await req.get('/webhooks');
    expect(res.status).toBe(401);
    expect(res.body.message).toContain('Autenticação necessária');
  });

  it('GET /webhooks with auth → 200', async () => {
    prisma.webhook.findMany.mockResolvedValue([]);
    const res = await withAuth(req.get('/webhooks'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  // ── Zod Validation ─────────────────────────────────────────

  it('POST /webhooks with empty body → 400 Validation failed', async () => {
    const res = await withAuth(req.post('/webhooks').send({}));
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Validation failed');
    expect(res.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'url' }),
        expect.objectContaining({ path: 'events' }),
      ]),
    );
  });

  it('POST /webhooks with invalid URL → 400', async () => {
    const res = await withAuth(
      req.post('/webhooks').send({ url: 'not-a-url', events: ['message.received'] }),
    );
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'url', message: 'URL inválida' }),
      ]),
    );
  });

  it('POST /webhooks with invalid event → 400', async () => {
    const res = await withAuth(
      req
        .post('/webhooks')
        .send({ url: 'https://example.com/hook', events: ['invalid.event'] }),
    );
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'events.0' })]),
    );
  });

  // ── CRUD ───────────────────────────────────────────────────

  it('POST /webhooks with valid body → 201 + secret (64 hex chars)', async () => {
    prisma.webhook.count.mockResolvedValue(0);
    prisma.webhook.create.mockResolvedValue({
      id: 'wh-1',
      url: 'https://example.com/hook',
      events: ['message.received'],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await withAuth(
      req
        .post('/webhooks')
        .send({ url: 'https://example.com/hook', events: ['message.received'] }),
    );

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: 'wh-1',
      url: 'https://example.com/hook',
      events: ['message.received'],
      isActive: true,
    });
    expect(res.body.secret).toMatch(/^[0-9a-f]{64}$/);
  });

  it('GET /webhooks → 200 array (no secret field)', async () => {
    prisma.webhook.findMany.mockResolvedValue([
      {
        id: 'wh-1',
        url: 'https://example.com/hook',
        events: ['message.received'],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const res = await withAuth(req.get('/webhooks'));
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).not.toHaveProperty('secret');
  });

  it('PATCH /webhooks/:id → 200 toggles isActive', async () => {
    prisma.webhook.findFirst.mockResolvedValue({
      id: 'wh-1',
      tenantId: TENANT_A.tenantId,
      isActive: true,
    });
    prisma.webhook.update.mockResolvedValue({
      id: 'wh-1',
      url: 'https://example.com/hook',
      events: ['message.received'],
      isActive: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await withAuth(req.patch('/webhooks/wh-1'));
    expect(res.status).toBe(200);
    expect(res.body.isActive).toBe(false);
  });

  it('DELETE /webhooks/:id → 204', async () => {
    prisma.webhook.findFirst.mockResolvedValue({
      id: 'wh-1',
      tenantId: TENANT_A.tenantId,
    });
    prisma.webhook.delete.mockResolvedValue({});

    const res = await withAuth(req.delete('/webhooks/wh-1'));
    expect(res.status).toBe(204);
  });

  // ── Tenant Isolation ───────────────────────────────────────

  it('Tenant B cannot see Tenant A webhooks', async () => {
    prisma.webhook.findMany.mockImplementation(
      ({ where }: { where: { tenantId: string } }) => {
        if (where.tenantId === TENANT_A.tenantId) {
          return [{ id: 'wh-1', url: 'https://a.com' }];
        }
        return [];
      },
    );

    const res = await withAuth(req.get('/webhooks'), TENANT_B);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });

  it('Tenant B cannot delete Tenant A webhook → 404', async () => {
    prisma.webhook.findFirst.mockImplementation(
      ({ where }: { where: { id: string; tenantId: string } }) => {
        if (where.tenantId === TENANT_B.tenantId) return null;
        return { id: 'wh-1', tenantId: TENANT_A.tenantId };
      },
    );

    const res = await withAuth(req.delete('/webhooks/wh-1'), TENANT_B);
    expect(res.status).toBe(404);
  });

  // ── Limit ──────────────────────────────────────────────────

  it('POST /webhooks when at limit → 400', async () => {
    prisma.webhook.count.mockResolvedValue(10);

    const res = await withAuth(
      req
        .post('/webhooks')
        .send({ url: 'https://example.com/hook', events: ['message.received'] }),
    );

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Limite');
  });
});
