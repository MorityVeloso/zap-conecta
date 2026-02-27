import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { SuperTest, Test } from 'supertest';

import { WhatsAppWebhookController } from '../whatsapp/whatsapp-webhook.controller';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { EvolutionInstanceService } from '../whatsapp/evolution-instance.service';
import {
  createTestApp,
  makePrismaMock,
  type PrismaMock,
} from './test-helpers';

function makeWhatsAppServiceMock() {
  return {
    handleReceivedMessage: vi.fn().mockResolvedValue(undefined),
    handleMessageStatus: vi.fn(),
  };
}

function makeEvolutionInstanceMock() {
  return {
    findByTenant: vi.fn().mockResolvedValue(null),
  };
}

describe('Inbound Webhook E2E', () => {
  let app: INestApplication;
  let req: SuperTest<Test>;
  let prisma: PrismaMock;

  beforeAll(async () => {
    prisma = makePrismaMock();
    const result = await createTestApp(prisma, {
      controllers: [WhatsAppWebhookController],
      providers: [
        { provide: WhatsAppService, useValue: makeWhatsAppServiceMock() },
        { provide: EvolutionInstanceService, useValue: makeEvolutionInstanceMock() },
      ],
    });
    app = result.app;
    req = result.request;
  });

  afterAll(async () => {
    await app.close();
  });

  // ── @Public routes — no auth required ────────────────────────

  it('POST /whatsapp/webhook/receive/:slug → 200 without auth', async () => {
    const res = await req
      .post('/whatsapp/webhook/receive/acme')
      .send({ phone: '5511999998888', message: { text: 'Hi' } });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('POST /whatsapp/webhook/receive → 200 without auth', async () => {
    const res = await req
      .post('/whatsapp/webhook/receive')
      .send({ phone: '5511999998888', message: { text: 'Hi' } });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('POST /whatsapp/webhook/status → 200 without auth', async () => {
    const res = await req
      .post('/whatsapp/webhook/status')
      .send({ messageId: 'msg-1', status: 'delivered' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });
});
