import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebhooksController } from '../webhooks.controller';
import type { WebhooksService, WebhookListItem, WebhookCreatedResult } from '../webhooks.service';
import type { TenantContext } from '../../auth/supabase-jwt.guard';

function makeWebhooksServiceMock() {
  return {
    list: vi.fn(),
    create: vi.fn(),
    toggleActive: vi.fn(),
    delete: vi.fn(),
  } as unknown as WebhooksService;
}

const TENANT: TenantContext = {
  tenantId: 'tenant-1',
  tenantSlug: 'acme',
  userId: 'user-1',
  email: 'user@acme.com',
  role: 'owner',
};

describe('WebhooksController', () => {
  let controller: WebhooksController;
  let service: ReturnType<typeof makeWebhooksServiceMock>;

  beforeEach(() => {
    service = makeWebhooksServiceMock();
    controller = new WebhooksController(service);
    vi.clearAllMocks();
  });

  // ── list ────────────────────────────────────────────

  it('list passes tenantId to service', async () => {
    const webhooks = [{ id: 'wh-1', url: 'https://a.com' }] as WebhookListItem[];
    vi.mocked(service.list).mockResolvedValue(webhooks);

    const result = await controller.list(TENANT);

    expect(service.list).toHaveBeenCalledWith('tenant-1');
    expect(result).toEqual(webhooks);
  });

  // ── create ──────────────────────────────────────────

  it('create validates body with Zod and passes to service', async () => {
    const created: WebhookCreatedResult = {
      id: 'wh-new',
      url: 'https://example.com/hook',
      events: ['message.received'],
      isActive: true,
      secret: 'abc123',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    vi.mocked(service.create).mockResolvedValue(created);

    const result = await controller.create(TENANT, {
      url: 'https://example.com/hook',
      events: ['message.received'],
    });

    expect(service.create).toHaveBeenCalledWith('tenant-1', 'https://example.com/hook', ['message.received']);
    expect(result).toEqual(created);
  });

  it('create throws ZodError on invalid URL', () => {
    expect(() =>
      controller.create(TENANT, { url: 'not-a-url', events: ['message.received'] }),
    ).toThrow();
  });

  it('create throws ZodError on empty events', () => {
    expect(() =>
      controller.create(TENANT, { url: 'https://example.com/hook', events: [] }),
    ).toThrow();
  });

  it('create throws ZodError on invalid event name', () => {
    expect(() =>
      controller.create(TENANT, { url: 'https://example.com/hook', events: ['invalid.event'] }),
    ).toThrow();
  });

  // ── toggle ──────────────────────────────────────────

  it('toggle passes tenantId and webhook id', async () => {
    vi.mocked(service.toggleActive).mockResolvedValue({ id: 'wh-1', isActive: false } as WebhookListItem);

    const result = await controller.toggle(TENANT, 'wh-1');

    expect(service.toggleActive).toHaveBeenCalledWith('tenant-1', 'wh-1');
    expect(result.isActive).toBe(false);
  });

  // ── remove ──────────────────────────────────────────

  it('remove passes tenantId and webhook id', async () => {
    vi.mocked(service.delete).mockResolvedValue(undefined);

    await controller.remove(TENANT, 'wh-1');

    expect(service.delete).toHaveBeenCalledWith('tenant-1', 'wh-1');
  });
});
