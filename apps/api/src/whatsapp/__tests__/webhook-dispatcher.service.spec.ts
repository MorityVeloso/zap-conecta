import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebhookDispatcherService } from '../webhook-dispatcher.service';
import type { PrismaService } from '@/prisma/prisma.service';
import type { Queue } from 'bullmq';
import type { WhatsAppMessageReceivedEvent, WhatsAppMessageSentEvent, WhatsAppMessageStatusEvent } from '../whatsapp.events';

function makePrismaMock() {
  return {
    webhook: {
      findMany: vi.fn(),
    },
  } as unknown as PrismaService;
}

function makeQueueMock() {
  return {
    add: vi.fn().mockResolvedValue({}),
  } as unknown as Queue;
}

const TENANT_ID = 'tenant-1';

const ACTIVE_WEBHOOK = {
  id: 'wh-1',
  url: 'https://example.com/hook',
  secret: 'secret-123',
  events: ['message.received', 'message.sent', 'message.status'],
  isActive: true,
};

describe('WebhookDispatcherService', () => {
  let service: WebhookDispatcherService;
  let prisma: ReturnType<typeof makePrismaMock>;
  let queue: ReturnType<typeof makeQueueMock>;

  beforeEach(() => {
    prisma = makePrismaMock();
    queue = makeQueueMock();
    service = new WebhookDispatcherService(prisma, queue);
    vi.clearAllMocks();
  });

  // ── onMessageReceived ───────────────────────────────

  it('enqueues delivery job on message.received', async () => {
    vi.mocked(prisma.webhook.findMany).mockResolvedValue([ACTIVE_WEBHOOK] as never);

    const event: WhatsAppMessageReceivedEvent = {
      tenantId: TENANT_ID,
      instanceId: 'inst-1',
      phone: '5511999998888',
      type: 'text',
      content: { text: 'Hello' },
    };

    await service.onMessageReceived(event);

    expect(prisma.webhook.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID, isActive: true, events: { has: 'message.received' } },
    });

    expect(queue.add).toHaveBeenCalledWith(
      'deliver',
      expect.objectContaining({
        url: ACTIVE_WEBHOOK.url,
        secret: ACTIVE_WEBHOOK.secret,
      }),
      expect.objectContaining({
        attempts: 5,
        backoff: { type: 'exponential', delay: 5000 },
      }),
    );
  });

  // ── onMessageSent ───────────────────────────────────

  it('enqueues delivery job on message.sent', async () => {
    vi.mocked(prisma.webhook.findMany).mockResolvedValue([ACTIVE_WEBHOOK] as never);

    const event: WhatsAppMessageSentEvent = {
      tenantId: TENANT_ID,
      instanceId: 'inst-1',
      phone: '5511999998888',
      type: 'text',
      content: { text: 'Olá!' },
    };

    await service.onMessageSent(event);

    expect(queue.add).toHaveBeenCalledWith(
      'deliver',
      expect.objectContaining({ url: ACTIVE_WEBHOOK.url }),
      expect.anything(),
    );
  });

  // ── onMessageStatus ─────────────────────────────────

  it('enqueues delivery job on message.status', async () => {
    vi.mocked(prisma.webhook.findMany).mockResolvedValue([ACTIVE_WEBHOOK] as never);

    const event: WhatsAppMessageStatusEvent = {
      tenantId: TENANT_ID,
      instanceId: 'inst-1',
      messageId: 'msg-1',
      status: 'delivered',
      phone: '5511999998888',
    };

    await service.onMessageStatus(event);

    expect(prisma.webhook.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID, isActive: true, events: { has: 'message.status' } },
    });

    expect(queue.add).toHaveBeenCalledTimes(1);
  });

  // ── No webhooks ─────────────────────────────────────

  it('does not enqueue when no active webhooks found', async () => {
    vi.mocked(prisma.webhook.findMany).mockResolvedValue([]);

    await service.onMessageReceived({
      tenantId: TENANT_ID,
      instanceId: 'inst-1',
      phone: '5511999998888',
      type: 'text',
      content: {},
    });

    expect(queue.add).not.toHaveBeenCalled();
  });

  // ── Multiple webhooks ───────────────────────────────

  it('enqueues one job per active webhook', async () => {
    const webhooks = [
      { ...ACTIVE_WEBHOOK, id: 'wh-1', url: 'https://a.com/hook' },
      { ...ACTIVE_WEBHOOK, id: 'wh-2', url: 'https://b.com/hook' },
      { ...ACTIVE_WEBHOOK, id: 'wh-3', url: 'https://c.com/hook' },
    ];
    vi.mocked(prisma.webhook.findMany).mockResolvedValue(webhooks as never);

    await service.onMessageReceived({
      tenantId: TENANT_ID,
      instanceId: 'inst-1',
      phone: '5511999998888',
      type: 'text',
      content: {},
    });

    expect(queue.add).toHaveBeenCalledTimes(3);
  });

  // ── Body contains event + tenantId + data ───────────

  it('serializes payload with event name, tenantId, data and timestamp', async () => {
    vi.mocked(prisma.webhook.findMany).mockResolvedValue([ACTIVE_WEBHOOK] as never);

    await service.onMessageReceived({
      tenantId: TENANT_ID,
      instanceId: 'inst-1',
      phone: '5511999998888',
      type: 'text',
      content: { text: 'test' },
    });

    const jobData = vi.mocked(queue.add).mock.calls[0][1];
    const parsed = JSON.parse(jobData.body);

    expect(parsed.event).toBe('message.received');
    expect(parsed.tenantId).toBe(TENANT_ID);
    expect(parsed.data.phone).toBe('5511999998888');
    expect(parsed.timestamp).toBeDefined();
  });
});
