import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { SuperTest, Test } from 'supertest';

import { WebhooksController } from '../webhooks/webhooks.controller';
import { WebhooksService } from '../webhooks/webhooks.service';
import { TenantsController } from '../tenants/tenants.controller';
import { TenantsService } from '../tenants/tenants.service';
import {
  createTestApp,
  makePrismaMock,
  withAuth,
  TENANT_A,
  type PrismaMock,
} from './test-helpers';

describe('Auth E2E', () => {
  let app: INestApplication;
  let req: SuperTest<Test>;
  let prisma: PrismaMock;

  beforeAll(async () => {
    prisma = makePrismaMock();
    const result = await createTestApp(prisma, {
      controllers: [WebhooksController, TenantsController],
      providers: [WebhooksService, TenantsService],
    });
    app = result.app;
    req = result.request;
  });

  afterAll(async () => {
    await app.close();
  });

  // ── Protected routes ───────────────────────────────────────

  it('GET /webhooks without auth → 401', async () => {
    const res = await req.get('/webhooks');
    expect(res.status).toBe(401);
    expect(res.body.message).toContain('Autenticação necessária');
  });

  it('GET /webhooks with valid auth → 200', async () => {
    prisma.webhook.findMany.mockResolvedValue([]);
    const res = await withAuth(req.get('/webhooks'));
    expect(res.status).toBe(200);
  });

  // ── @Public routes ─────────────────────────────────────────

  it('POST /tenants/signup is @Public → no auth required', async () => {
    // Should hit Zod validation (400) instead of auth (401)
    const res = await req.post('/tenants/signup').send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Validation failed');
  });

  // ── Tenant context ─────────────────────────────────────────

  it('x-test-tenant header populates tenantContext', async () => {
    prisma.webhook.findMany.mockResolvedValue([]);
    const res = await withAuth(req.get('/webhooks'), TENANT_A);
    expect(res.status).toBe(200);
    // The service received tenantId from the guard
    expect(prisma.webhook.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: TENANT_A.tenantId },
      }),
    );
  });
});
