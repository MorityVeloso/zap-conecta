import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { HttpException, HttpStatus } from '@nestjs/common';
import type { SuperTest, Test } from 'supertest';

import { WhatsAppSendController } from '../whatsapp/whatsapp-send.controller';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { UsageService } from '../billing/usage.service';
import { EvolutionInstanceService } from '../whatsapp/evolution-instance.service';
import { QUEUE_BULK_SEND } from '../queue/queue.constants';
import {
  createTestApp,
  makePrismaMock,
  withAuth,
  type PrismaMock,
} from './test-helpers';

function makeWhatsAppServiceMock() {
  return {
    sendTextMessage: vi.fn().mockResolvedValue({ success: true, messageId: 'msg-1' }),
    emitSent: vi.fn(),
    sendButtonMessage: vi.fn().mockResolvedValue({ success: true, messageId: 'msg-2' }),
    checkNumber: vi.fn().mockResolvedValue({ exists: true, jid: '5511999998888@s.whatsapp.net' }),
    readMessages: vi.fn().mockResolvedValue(undefined),
  };
}

function makeUsageServiceMock() {
  return {
    assertBelowQuota: vi.fn().mockResolvedValue(undefined),
  };
}

function makeEvolutionInstanceMock() {
  return {
    findByTenant: vi.fn().mockResolvedValue({ id: 'inst-1', instanceName: 'acme-inst' }),
  };
}

function makeBulkQueueMock() {
  return { add: vi.fn().mockResolvedValue({ id: 'job-1' }) };
}

describe('WhatsApp Send E2E', () => {
  let app: INestApplication;
  let req: SuperTest<Test>;
  let prisma: PrismaMock;
  let usageMock: ReturnType<typeof makeUsageServiceMock>;
  let whatsappMock: ReturnType<typeof makeWhatsAppServiceMock>;

  beforeAll(async () => {
    prisma = makePrismaMock();
    usageMock = makeUsageServiceMock();
    whatsappMock = makeWhatsAppServiceMock();
    const result = await createTestApp(prisma, {
      controllers: [WhatsAppSendController],
      providers: [
        { provide: WhatsAppService, useValue: whatsappMock },
        { provide: UsageService, useValue: usageMock },
        { provide: EvolutionInstanceService, useValue: makeEvolutionInstanceMock() },
        { provide: `BullQueue_${QUEUE_BULK_SEND}`, useValue: makeBulkQueueMock() },
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
    usageMock.assertBelowQuota.mockResolvedValue(undefined);
    whatsappMock.sendTextMessage.mockResolvedValue({ success: true, messageId: 'msg-1' });
  });

  // ── Auth ────────────────────────────────────────────────────

  it('POST /whatsapp/send/text without auth → 401', async () => {
    const res = await req.post('/whatsapp/send/text').send({ phone: '5511999998888', message: 'Hello' });
    expect(res.status).toBe(401);
  });

  // ── Below quota → 201 ────────────────────────────────────────

  it('POST /whatsapp/send/text within quota → 201', async () => {
    const res = await withAuth(
      req.post('/whatsapp/send/text').send({ phone: '5511999998888', message: 'Hello' }),
    );

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ success: true, messageId: 'msg-1' });
    expect(usageMock.assertBelowQuota).toHaveBeenCalled();
  });

  // ── Over quota → 429 ────────────────────────────────────────

  it('POST /whatsapp/send/text over quota → 429', async () => {
    usageMock.assertBelowQuota.mockRejectedValue(
      new HttpException('Quota mensal atingida', HttpStatus.TOO_MANY_REQUESTS),
    );

    const res = await withAuth(
      req.post('/whatsapp/send/text').send({ phone: '5511999998888', message: 'Hello' }),
    );

    expect(res.status).toBe(429);
    expect(res.body.message).toContain('Quota');
  });

  // ── Check number ────────────────────────────────────────────

  it('POST /whatsapp/check-number → 200', async () => {
    const res = await withAuth(
      req.post('/whatsapp/check-number').send({ phone: '5511999998888' }),
    );

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ exists: true });
  });
});
