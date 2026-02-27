import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { SuperTest, Test } from 'supertest';

import { TenantsController } from '../tenants/tenants.controller';
import { TenantsService } from '../tenants/tenants.service';
import {
  createTestApp,
  makePrismaMock,
  withAuth,
  TENANT_A,
  type PrismaMock,
} from './test-helpers';

describe('Tenants E2E', () => {
  let app: INestApplication;
  let req: SuperTest<Test>;
  let prisma: PrismaMock;

  beforeAll(async () => {
    prisma = makePrismaMock();
    const result = await createTestApp(prisma, {
      controllers: [TenantsController],
      providers: [TenantsService],
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

  // ── Signup (@Public) ───────────────────────────────────────

  it('POST /tenants/signup with empty body → 400', async () => {
    const res = await req.post('/tenants/signup').send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Validation failed');
    expect(res.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: expect.any(String) }),
      ]),
    );
  });

  it('POST /tenants/signup with invalid email → 400', async () => {
    const res = await req.post('/tenants/signup').send({
      fullName: 'Test User',
      companyName: 'Test Co',
      email: 'invalid-email',
      password: 'Passw0rd123',
    });
    expect(res.status).toBe(400);
  });

  it('POST /tenants/signup with weak password → 400', async () => {
    const res = await req.post('/tenants/signup').send({
      fullName: 'Test User',
      companyName: 'Test Co',
      email: 'test@example.com',
      password: '123',
    });
    expect(res.status).toBe(400);
  });

  // ── GET /tenants/me ────────────────────────────────────────

  it('GET /tenants/me without auth → 401', async () => {
    const res = await req.get('/tenants/me');
    expect(res.status).toBe(401);
  });

  it('GET /tenants/me with auth → 200', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      id: TENANT_A.tenantId,
      slug: TENANT_A.tenantSlug,
      name: 'Acme Corp',
      status: 'ACTIVE',
      plan: {
        id: 'plan-free',
        name: 'free',
        displayName: 'Free',
        priceBrlCents: 0,
        messagesPerMonth: 300,
        instancesLimit: 1,
        apiKeysLimit: 2,
        features: [],
      },
      subscription: null,
      _count: { instances: 1, apiKeys: 1 },
    });

    const res = await withAuth(req.get('/tenants/me'));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: TENANT_A.tenantId,
      slug: TENANT_A.tenantSlug,
      plan: { name: 'free', displayName: 'Free' },
      stats: { instances: 1, activeApiKeys: 1 },
    });
  });

  // ── GET /tenants/usage ─────────────────────────────────────

  it('GET /tenants/usage with auth → 200', async () => {
    prisma.usageRecord.findFirst.mockResolvedValue({
      messagesSent: 50,
      messagesReceived: 120,
    });
    prisma.tenant.findUnique.mockImplementation(() =>
      Promise.resolve({ plan: { messagesPerMonth: 300 } }),
    );

    const res = await withAuth(req.get('/tenants/usage'));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      messagesSent: 50,
    });
  });
});
