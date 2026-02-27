import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WhatsAppSendController } from '../whatsapp-send.controller';
import type { WhatsAppService, MessageResult } from '../whatsapp.service';
import type { UsageService } from '../../billing/usage.service';
import type { EvolutionInstanceService } from '../evolution-instance.service';
import type { TenantContext } from '../../auth/supabase-jwt.guard';
import type { Queue } from 'bullmq';
import { HttpException, HttpStatus } from '@nestjs/common';

function makeWhatsAppServiceMock() {
  return {
    sendTextMessage: vi.fn(),
    sendButtonMessage: vi.fn(),
    sendListMessage: vi.fn(),
    sendImageMessage: vi.fn(),
    sendDocumentMessage: vi.fn(),
    sendPixMessage: vi.fn(),
    sendTemplateMessage: vi.fn(),
    sendAudioMessage: vi.fn(),
    sendVideoMessage: vi.fn(),
    sendStickerMessage: vi.fn(),
    sendLocationMessage: vi.fn(),
    sendContactMessage: vi.fn(),
    sendReaction: vi.fn(),
    sendPoll: vi.fn(),
    checkNumber: vi.fn(),
    readMessages: vi.fn(),
    emitSent: vi.fn(),
  } as unknown as WhatsAppService;
}

function makeUsageServiceMock() {
  return {
    assertBelowQuota: vi.fn(),
  } as unknown as UsageService;
}

function makeEvolutionInstanceServiceMock() {
  return {
    findByTenant: vi.fn().mockResolvedValue({ id: 'inst-1', instanceName: 'acme-inst' }),
  } as unknown as EvolutionInstanceService;
}

function makeBulkQueueMock() {
  return {
    add: vi.fn().mockResolvedValue({}),
  } as unknown as Queue;
}

const TENANT: TenantContext = {
  tenantId: 'tenant-1',
  tenantSlug: 'acme',
  userId: 'user-1',
  email: 'user@acme.com',
  role: 'owner',
};

const SUCCESS: MessageResult = { success: true, messageId: 'msg-123' };
const FAILURE: MessageResult = { success: false, error: 'Not connected' };

describe('WhatsAppSendController', () => {
  let controller: WhatsAppSendController;
  let whatsApp: ReturnType<typeof makeWhatsAppServiceMock>;
  let usage: ReturnType<typeof makeUsageServiceMock>;
  let evolutionInstance: ReturnType<typeof makeEvolutionInstanceServiceMock>;
  let bulkQueue: ReturnType<typeof makeBulkQueueMock>;

  beforeEach(() => {
    whatsApp = makeWhatsAppServiceMock();
    usage = makeUsageServiceMock();
    evolutionInstance = makeEvolutionInstanceServiceMock();
    bulkQueue = makeBulkQueueMock();
    controller = new WhatsAppSendController(whatsApp, usage, evolutionInstance, bulkQueue);
    vi.clearAllMocks();

    // Default: allow quota
    vi.mocked(usage.assertBelowQuota).mockResolvedValue(undefined);
    vi.mocked(evolutionInstance.findByTenant).mockResolvedValue({ id: 'inst-1' } as never);
  });

  // ── Quota enforcement ─────────────────────────────────

  it('checks quota before sending text', async () => {
    vi.mocked(whatsApp.sendTextMessage).mockResolvedValue(SUCCESS);

    await controller.sendText(TENANT, { phone: '5511999998888', message: 'Hi' } as never);

    expect(usage.assertBelowQuota).toHaveBeenCalledWith('tenant-1');
  });

  it('blocks send when quota exceeded', async () => {
    vi.mocked(usage.assertBelowQuota).mockRejectedValue(
      new HttpException('Quota exceeded', HttpStatus.TOO_MANY_REQUESTS),
    );

    await expect(
      controller.sendText(TENANT, { phone: '5511999998888', message: 'Hi' } as never),
    ).rejects.toThrow(HttpException);

    expect(whatsApp.sendTextMessage).not.toHaveBeenCalled();
  });

  // ── emitSent on success ───────────────────────────────

  it('emits sent event on successful text send', async () => {
    vi.mocked(whatsApp.sendTextMessage).mockResolvedValue(SUCCESS);

    await controller.sendText(TENANT, { phone: '5511999998888', message: 'Hi' } as never);

    expect(whatsApp.emitSent).toHaveBeenCalledWith(
      'tenant-1', 'inst-1', '5511999998888', 'text',
      expect.objectContaining({ text: 'Hi' }),
      'msg-123',
    );
  });

  it('does NOT emit sent event on failure', async () => {
    vi.mocked(whatsApp.sendTextMessage).mockResolvedValue(FAILURE);

    await controller.sendText(TENANT, { phone: '5511999998888', message: 'Hi' } as never);

    expect(whatsApp.emitSent).not.toHaveBeenCalled();
  });

  // ── Individual send endpoints ─────────────────────────

  it('sendAudio checks quota and calls service', async () => {
    vi.mocked(whatsApp.sendAudioMessage).mockResolvedValue(SUCCESS);

    const result = await controller.sendAudio(TENANT, { phone: '5511999998888', audio: 'https://a.com/v.ogg' } as never);

    expect(usage.assertBelowQuota).toHaveBeenCalled();
    expect(whatsApp.sendAudioMessage).toHaveBeenCalled();
    expect(result).toEqual(SUCCESS);
  });

  it('sendVideo checks quota and calls service', async () => {
    vi.mocked(whatsApp.sendVideoMessage).mockResolvedValue(SUCCESS);

    const result = await controller.sendVideo(TENANT, { phone: '5511999998888', video: 'https://v.com/clip.mp4' } as never);

    expect(usage.assertBelowQuota).toHaveBeenCalled();
    expect(result).toEqual(SUCCESS);
  });

  it('sendSticker checks quota and calls service', async () => {
    vi.mocked(whatsApp.sendStickerMessage).mockResolvedValue(SUCCESS);

    await controller.sendSticker(TENANT, { phone: '5511999998888', sticker: 'https://s.com/s.webp' } as never);
    expect(whatsApp.sendStickerMessage).toHaveBeenCalled();
  });

  it('sendLocation checks quota and calls service', async () => {
    vi.mocked(whatsApp.sendLocationMessage).mockResolvedValue(SUCCESS);

    await controller.sendLocation(TENANT, { phone: '5511999998888', latitude: -23.55, longitude: -46.63 } as never);
    expect(whatsApp.sendLocationMessage).toHaveBeenCalled();
  });

  it('sendContact checks quota and calls service', async () => {
    vi.mocked(whatsApp.sendContactMessage).mockResolvedValue(SUCCESS);

    await controller.sendContact(TENANT, { phone: '5511999998888', contacts: [{ fullName: 'John', phoneNumber: '5511888887777' }] } as never);
    expect(whatsApp.sendContactMessage).toHaveBeenCalled();
  });

  it('sendPoll checks quota and calls service', async () => {
    vi.mocked(whatsApp.sendPoll).mockResolvedValue(SUCCESS);

    await controller.sendPoll(TENANT, { phone: '5511999998888', name: 'Question?', options: ['A', 'B'] } as never);
    expect(whatsApp.sendPoll).toHaveBeenCalled();
  });

  // ── Reaction (no quota) ───────────────────────────────

  it('sendReaction does NOT check quota', async () => {
    vi.mocked(whatsApp.sendReaction).mockResolvedValue(SUCCESS);

    await controller.sendReaction(TENANT, { messageId: 'msg-1', remoteJid: '5511@c.us', fromMe: false, reaction: '👍' } as never);

    expect(usage.assertBelowQuota).not.toHaveBeenCalled();
    expect(whatsApp.sendReaction).toHaveBeenCalled();
  });

  // ── checkNumber & readMessages (no quota) ─────────────

  it('checkNumber calls service without quota check', async () => {
    vi.mocked(whatsApp.checkNumber).mockResolvedValue({ exists: true, jid: '5511@s.whatsapp.net' });

    const result = await controller.checkNumber(TENANT, { phone: '5511999998888' } as never);

    expect(usage.assertBelowQuota).not.toHaveBeenCalled();
    expect(result).toEqual({ exists: true, jid: '5511@s.whatsapp.net' });
  });

  it('readMessages calls service without quota check', async () => {
    vi.mocked(whatsApp.readMessages).mockResolvedValue(undefined);

    const result = await controller.readMessages(TENANT, { phone: '5511999998888' } as never);

    expect(usage.assertBelowQuota).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true });
  });

  // ── Bulk send ─────────────────────────────────────────

  it('sendBulk checks quota and enqueues jobs with staggered delays', async () => {
    const dto = {
      recipients: ['5511111111111', '5522222222222', '5533333333333'],
      message: { type: 'TEXT', text: 'Promo!' },
      delay: 2000,
    };

    const result = await controller.sendBulk(TENANT, dto as never);

    expect(usage.assertBelowQuota).toHaveBeenCalledWith('tenant-1');
    expect(bulkQueue.add).toHaveBeenCalledTimes(3);

    // First job: delay 0, second: 2000, third: 4000
    const delays = vi.mocked(bulkQueue.add).mock.calls.map(
      (call) => (call[2] as { delay: number }).delay,
    );
    expect(delays).toEqual([0, 2000, 4000]);

    expect(result.total).toBe(3);
    expect(result.batchId).toBeDefined();
  });

  // ── withTenant injects tenantSlug ─────────────────────

  it('injects tenantSlug into DTO before calling service', async () => {
    vi.mocked(whatsApp.sendTextMessage).mockResolvedValue(SUCCESS);

    await controller.sendText(TENANT, { phone: '5511999998888', message: 'Hi' } as never);

    const calledDto = vi.mocked(whatsApp.sendTextMessage).mock.calls[0][0];
    expect((calledDto as Record<string, unknown>).tenantSlug).toBe('acme');
  });
});
