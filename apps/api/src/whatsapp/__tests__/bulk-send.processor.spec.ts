import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BulkSendProcessor, type BulkSendJobData } from '../bulk-send.processor';
import type { WhatsAppService } from '../whatsapp.service';
import type { PrismaService } from '@/prisma/prisma.service';
import type { Job } from 'bullmq';

function makeWhatsAppServiceMock() {
  return {
    sendTextMessage: vi.fn().mockResolvedValue({ success: true }),
    sendImageMessage: vi.fn().mockResolvedValue({ success: true }),
    sendDocumentMessage: vi.fn().mockResolvedValue({ success: true }),
    sendAudioMessage: vi.fn().mockResolvedValue({ success: true }),
    sendVideoMessage: vi.fn().mockResolvedValue({ success: true }),
  } as unknown as WhatsAppService;
}

function makePrismaMock() {
  return {
    bulkSendBatch: {
      update: vi.fn().mockResolvedValue({ id: 'batch-1', sent: 1, failed: 0, total: 5 }),
    },
  } as unknown as PrismaService;
}

function makeJob(data: BulkSendJobData) {
  return { data } as Job<BulkSendJobData>;
}

describe('BulkSendProcessor', () => {
  let processor: BulkSendProcessor;
  let whatsApp: ReturnType<typeof makeWhatsAppServiceMock>;

  beforeEach(() => {
    whatsApp = makeWhatsAppServiceMock();
    const prisma = makePrismaMock();
    processor = new BulkSendProcessor(whatsApp, prisma);
    vi.clearAllMocks();
  });

  // ── Dispatch by type ────────────────────────────────

  it('dispatches TEXT to sendTextMessage', async () => {
    await processor.process(makeJob({
      tenantSlug: 'acme', phone: '5511999998888', type: 'TEXT', text: 'Hello!',
    }));

    expect(whatsApp.sendTextMessage).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '5511999998888', message: 'Hello!' }),
    );
  });

  it('dispatches IMAGE to sendImageMessage', async () => {
    await processor.process(makeJob({
      tenantSlug: 'acme', phone: '5511999998888', type: 'IMAGE', mediaUrl: 'https://img.com/x.jpg', caption: 'pic',
    }));

    expect(whatsApp.sendImageMessage).toHaveBeenCalledWith(
      expect.objectContaining({ image: 'https://img.com/x.jpg', caption: 'pic' }),
    );
  });

  it('dispatches DOCUMENT to sendDocumentMessage', async () => {
    await processor.process(makeJob({
      tenantSlug: 'acme', phone: '5511999998888', type: 'DOCUMENT', mediaUrl: 'https://f.com/d.pdf', fileName: 'report.pdf',
    }));

    expect(whatsApp.sendDocumentMessage).toHaveBeenCalledWith(
      expect.objectContaining({ document: 'https://f.com/d.pdf', fileName: 'report.pdf' }),
    );
  });

  it('dispatches AUDIO to sendAudioMessage', async () => {
    await processor.process(makeJob({
      tenantSlug: 'acme', phone: '5511999998888', type: 'AUDIO', mediaUrl: 'https://a.com/voice.ogg',
    }));

    expect(whatsApp.sendAudioMessage).toHaveBeenCalledWith(
      expect.objectContaining({ audio: 'https://a.com/voice.ogg' }),
    );
  });

  it('dispatches VIDEO to sendVideoMessage', async () => {
    await processor.process(makeJob({
      tenantSlug: 'acme', phone: '5511999998888', type: 'VIDEO', mediaUrl: 'https://v.com/clip.mp4', caption: 'vid',
    }));

    expect(whatsApp.sendVideoMessage).toHaveBeenCalledWith(
      expect.objectContaining({ video: 'https://v.com/clip.mp4', caption: 'vid' }),
    );
  });

  // ── Unsupported type ────────────────────────────────

  it('throws on unsupported type', async () => {
    await expect(
      processor.process(makeJob({
        tenantSlug: 'acme', phone: '5511999998888', type: 'STICKER',
      })),
    ).rejects.toThrow('Unsupported bulk send type: STICKER');
  });

  // ── Failure handling ────────────────────────────────

  it('does not throw when send returns success: false (logs warning)', async () => {
    vi.mocked(whatsApp.sendTextMessage).mockResolvedValue({ success: false, error: 'Not connected' });

    await expect(
      processor.process(makeJob({ tenantSlug: 'acme', phone: '5511999998888', type: 'TEXT', text: 'hi' })),
    ).resolves.toBeUndefined();
  });
});
