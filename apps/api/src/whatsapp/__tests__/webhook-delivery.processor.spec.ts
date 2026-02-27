import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHmac } from 'crypto';
import { WebhookDeliveryProcessor, type WebhookDeliveryJobData } from '../webhook-delivery.processor';
import type { Job } from 'bullmq';

function makeJob(data: WebhookDeliveryJobData, overrides?: Partial<Job>): Job<WebhookDeliveryJobData> {
  return {
    data,
    attemptsMade: 0,
    opts: { attempts: 5 },
    ...overrides,
  } as Job<WebhookDeliveryJobData>;
}

describe('WebhookDeliveryProcessor', () => {
  let processor: WebhookDeliveryProcessor;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    processor = new WebhookDeliveryProcessor();
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    vi.clearAllMocks();
  });

  const JOB_DATA: WebhookDeliveryJobData = {
    url: 'https://example.com/webhook',
    secret: 'my-secret-key',
    body: JSON.stringify({ event: 'message.received', data: { phone: '5511999998888' } }),
  };

  // ── HMAC signature ──────────────────────────────────

  it('sends correct HMAC-SHA256 signature in X-Zap-Signature header', async () => {
    mockFetch.mockResolvedValue({ ok: true });

    await processor.process(makeJob(JOB_DATA));

    const expectedSig = `sha256=${createHmac('sha256', JOB_DATA.secret).update(JOB_DATA.body).digest('hex')}`;

    expect(mockFetch).toHaveBeenCalledWith(
      JOB_DATA.url,
      expect.objectContaining({
        method: 'POST',
        body: JOB_DATA.body,
        headers: expect.objectContaining({
          'X-Zap-Signature': expectedSig,
          'Content-Type': 'application/json',
          'User-Agent': 'Zap-Conecta-Webhook/1.0',
        }),
      }),
    );
  });

  // ── Success ─────────────────────────────────────────

  it('resolves on successful delivery (2xx)', async () => {
    mockFetch.mockResolvedValue({ ok: true });

    await expect(processor.process(makeJob(JOB_DATA))).resolves.toBeUndefined();
  });

  // ── Retry on failure ────────────────────────────────

  it('throws on non-2xx so BullMQ retries', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });

    await expect(processor.process(makeJob(JOB_DATA))).rejects.toThrow('HTTP 500');
  });

  it('throws on 4xx (webhook endpoint error)', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404 });

    await expect(processor.process(makeJob(JOB_DATA))).rejects.toThrow('HTTP 404');
  });

  // ── Timeout ─────────────────────────────────────────

  it('passes AbortSignal.timeout to fetch', async () => {
    mockFetch.mockResolvedValue({ ok: true });

    await processor.process(makeJob(JOB_DATA));

    const fetchCall = mockFetch.mock.calls[0][1];
    expect(fetchCall.signal).toBeDefined();
  });

  // ── Network error ───────────────────────────────────

  it('propagates fetch errors for BullMQ retry', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(processor.process(makeJob(JOB_DATA))).rejects.toThrow('ECONNREFUSED');
  });
});
