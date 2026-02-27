import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScheduledMessagesProcessor } from '../scheduled-messages.processor';
import type { PrismaService } from '@/prisma/prisma.service';
import type { WhatsAppService } from '../../whatsapp/whatsapp.service';
import type { Job } from 'bullmq';

function makePrismaMock() {
  return {
    scheduledMessage: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  } as unknown as PrismaService;
}

function makeWhatsAppServiceMock() {
  return {
    sendTextMessage: vi.fn(),
    sendImageMessage: vi.fn(),
    sendDocumentMessage: vi.fn(),
    sendAudioMessage: vi.fn(),
    sendVideoMessage: vi.fn(),
  } as unknown as WhatsAppService;
}

function makeJob(data: { scheduledMessageId: string; tenantSlug: string }) {
  return { data } as Job<{ scheduledMessageId: string; tenantSlug: string }>;
}

const SLUG = 'acme';

describe('ScheduledMessagesProcessor', () => {
  let processor: ScheduledMessagesProcessor;
  let prisma: ReturnType<typeof makePrismaMock>;
  let whatsApp: ReturnType<typeof makeWhatsAppServiceMock>;

  beforeEach(() => {
    prisma = makePrismaMock();
    whatsApp = makeWhatsAppServiceMock();
    processor = new ScheduledMessagesProcessor(prisma, whatsApp);
    vi.clearAllMocks();
  });

  // ── TEXT ─────────────────────────────────────────────

  it('sends TEXT message and updates status to SENT', async () => {
    const record = {
      id: 'sched-1',
      status: 'PENDING',
      type: 'TEXT',
      phone: '5511999998888',
      payload: { text: 'Hello!' },
    };
    vi.mocked(prisma.scheduledMessage.findUnique).mockResolvedValue(record as never);
    vi.mocked(whatsApp.sendTextMessage).mockResolvedValue({ success: true });
    vi.mocked(prisma.scheduledMessage.update).mockResolvedValue({} as never);

    await processor.process(makeJob({ scheduledMessageId: 'sched-1', tenantSlug: SLUG }));

    expect(whatsApp.sendTextMessage).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '5511999998888', message: 'Hello!', tenantSlug: SLUG }),
    );
    expect(prisma.scheduledMessage.update).toHaveBeenCalledWith({
      where: { id: 'sched-1' },
      data: { status: 'SENT', sentAt: expect.any(Date) },
    });
  });

  // ── IMAGE ───────────────────────────────────────────

  it('sends IMAGE message', async () => {
    const record = {
      id: 'sched-2',
      status: 'PENDING',
      type: 'IMAGE',
      phone: '5511999998888',
      payload: { mediaUrl: 'https://img.com/pic.jpg', caption: 'Look!' },
    };
    vi.mocked(prisma.scheduledMessage.findUnique).mockResolvedValue(record as never);
    vi.mocked(whatsApp.sendImageMessage).mockResolvedValue({ success: true });
    vi.mocked(prisma.scheduledMessage.update).mockResolvedValue({} as never);

    await processor.process(makeJob({ scheduledMessageId: 'sched-2', tenantSlug: SLUG }));

    expect(whatsApp.sendImageMessage).toHaveBeenCalledWith(
      expect.objectContaining({ image: 'https://img.com/pic.jpg', caption: 'Look!' }),
    );
  });

  // ── FAILED ──────────────────────────────────────────

  it('updates status to FAILED when send returns success: false', async () => {
    const record = {
      id: 'sched-3',
      status: 'PENDING',
      type: 'TEXT',
      phone: '5511999998888',
      payload: { text: 'fail' },
    };
    vi.mocked(prisma.scheduledMessage.findUnique).mockResolvedValue(record as never);
    vi.mocked(whatsApp.sendTextMessage).mockResolvedValue({ success: false, error: 'Not connected' });
    vi.mocked(prisma.scheduledMessage.update).mockResolvedValue({} as never);

    await processor.process(makeJob({ scheduledMessageId: 'sched-3', tenantSlug: SLUG }));

    expect(prisma.scheduledMessage.update).toHaveBeenCalledWith({
      where: { id: 'sched-3' },
      data: { status: 'FAILED', error: expect.stringContaining('Not connected') },
    });
  });

  // ── Skips non-PENDING ───────────────────────────────

  it('skips already processed messages', async () => {
    vi.mocked(prisma.scheduledMessage.findUnique).mockResolvedValue({
      id: 'sched-4',
      status: 'SENT',
    } as never);

    await processor.process(makeJob({ scheduledMessageId: 'sched-4', tenantSlug: SLUG }));

    expect(whatsApp.sendTextMessage).not.toHaveBeenCalled();
    expect(prisma.scheduledMessage.update).not.toHaveBeenCalled();
  });

  // ── Not found ───────────────────────────────────────

  it('skips when record not found', async () => {
    vi.mocked(prisma.scheduledMessage.findUnique).mockResolvedValue(null);

    await processor.process(makeJob({ scheduledMessageId: 'nonexistent', tenantSlug: SLUG }));

    expect(whatsApp.sendTextMessage).not.toHaveBeenCalled();
  });

  // ── Unsupported type ────────────────────────────────

  it('marks as FAILED for unsupported message type', async () => {
    const record = {
      id: 'sched-5',
      status: 'PENDING',
      type: 'STICKER',
      phone: '5511999998888',
      payload: {},
    };
    vi.mocked(prisma.scheduledMessage.findUnique).mockResolvedValue(record as never);
    vi.mocked(prisma.scheduledMessage.update).mockResolvedValue({} as never);

    await processor.process(makeJob({ scheduledMessageId: 'sched-5', tenantSlug: SLUG }));

    expect(prisma.scheduledMessage.update).toHaveBeenCalledWith({
      where: { id: 'sched-5' },
      data: { status: 'FAILED', error: expect.stringContaining('Unsupported') },
    });
  });
});
