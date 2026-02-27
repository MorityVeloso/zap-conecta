import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { SuperTest, Test } from 'supertest';

import { ScheduledMessagesController } from '../scheduled/scheduled-messages.controller';
import { ScheduledMessagesService } from '../scheduled/scheduled-messages.service';
import { EvolutionInstanceService } from '../whatsapp/evolution-instance.service';
import {
  createTestApp,
  makePrismaMock,
  withAuth,
  TENANT_A,
  type PrismaMock,
} from './test-helpers';

function makeEvolutionInstanceMock() {
  return {
    findByTenant: vi.fn().mockResolvedValue({ id: 'inst-1', instanceName: 'acme-inst' }),
  };
}

function makeQueueMock() {
  return {
    add: vi.fn().mockResolvedValue({ id: 'job-1' }),
    addBulk: vi.fn(),
    getJob: vi.fn().mockResolvedValue({ remove: vi.fn() }),
  };
}

describe('Scheduled Messages E2E', () => {
  let app: INestApplication;
  let req: SuperTest<Test>;
  let prisma: PrismaMock;

  beforeAll(async () => {
    prisma = makePrismaMock();
    const QUEUE_SCHEDULED_MESSAGES = 'scheduled-messages';
    const result = await createTestApp(prisma, {
      controllers: [ScheduledMessagesController],
      providers: [
        ScheduledMessagesService,
        { provide: EvolutionInstanceService, useValue: makeEvolutionInstanceMock() },
        { provide: `BullQueue_${QUEUE_SCHEDULED_MESSAGES}`, useValue: makeQueueMock() },
      ],
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

  it('GET /whatsapp/scheduled without auth → 401', async () => {
    const res = await req.get('/whatsapp/scheduled');
    expect(res.status).toBe(401);
  });

  // ── CRUD ───────────────────────────────────────────────────

  it('POST /whatsapp/scheduled with valid data → 201', async () => {
    const now = new Date();
    const future = new Date(now.getTime() + 3600000);

    prisma.scheduledMessage.create.mockResolvedValue({
      id: 'sched-1',
      tenantId: TENANT_A.tenantId,
      phone: '5511999998888',
      type: 'TEXT',
      payload: { text: 'Hello' },
      scheduledAt: future,
      status: 'PENDING',
      createdAt: now,
    });

    const res = await withAuth(
      req.post('/whatsapp/scheduled').send({
        phone: '5511999998888',
        type: 'TEXT',
        payload: { text: 'Hello' },
        scheduledAt: future.toISOString(),
      }),
    );

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: 'sched-1',
      status: 'PENDING',
    });
  });

  it('GET /whatsapp/scheduled → 200 array', async () => {
    prisma.scheduledMessage.findMany.mockResolvedValue([
      {
        id: 'sched-1',
        phone: '5511999998888',
        type: 'TEXT',
        status: 'PENDING',
        scheduledAt: new Date(),
      },
    ]);

    const res = await withAuth(req.get('/whatsapp/scheduled'));
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it('DELETE /whatsapp/scheduled/:id → 200', async () => {
    prisma.scheduledMessage.findFirst.mockResolvedValue({
      id: 'sched-1',
      tenantId: TENANT_A.tenantId,
      status: 'PENDING',
    });
    prisma.scheduledMessage.update.mockResolvedValue({
      id: 'sched-1',
      status: 'CANCELLED',
    });

    const res = await withAuth(req.delete('/whatsapp/scheduled/sched-1'));
    expect(res.status).toBe(200);
  });
});
