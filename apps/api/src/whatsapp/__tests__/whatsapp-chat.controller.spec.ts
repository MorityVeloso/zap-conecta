import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WhatsAppChatController } from '../whatsapp-chat.controller';
import type { EvolutionApiClientService } from '../evolution-api-client.service';
import type { EvolutionInstanceService } from '../evolution-instance.service';
import type { TenantContext } from '../../auth/supabase-jwt.guard';

function makeEvolutionClientMock() {
  return {
    sendPresence: vi.fn().mockResolvedValue(undefined),
    deleteMessage: vi.fn().mockResolvedValue(undefined),
    editMessage: vi.fn().mockResolvedValue(undefined),
    blockContact: vi.fn().mockResolvedValue(undefined),
    unblockContact: vi.fn().mockResolvedValue(undefined),
    fetchProfile: vi.fn().mockResolvedValue({ name: 'John', picture: 'https://img.com/j.jpg' }),
    updateProfileName: vi.fn().mockResolvedValue(undefined),
    updateProfileStatus: vi.fn().mockResolvedValue(undefined),
    updateProfilePicture: vi.fn().mockResolvedValue(undefined),
    fetchPrivacySettings: vi.fn().mockResolvedValue({ readreceipts: 'all' }),
    updatePrivacySettings: vi.fn().mockResolvedValue(undefined),
    setGlobalPresence: vi.fn().mockResolvedValue(undefined),
    downloadMedia: vi.fn().mockResolvedValue({ base64: 'abc', mimetype: 'image/png' }),
    findLabels: vi.fn().mockResolvedValue([{ id: 'lbl-1', name: 'VIP' }]),
    handleLabel: vi.fn().mockResolvedValue(undefined),
    archiveChat: vi.fn().mockResolvedValue(undefined),
    sendStatus: vi.fn().mockResolvedValue({ success: true }),
  } as unknown as EvolutionApiClientService;
}

function makeEvolutionInstanceServiceMock() {
  return {
    findByTenant: vi.fn().mockResolvedValue({ instanceName: 'acme-inst' }),
  } as unknown as EvolutionInstanceService;
}

const TENANT: TenantContext = {
  tenantId: 'tenant-1',
  tenantSlug: 'acme',
  userId: 'user-1',
  email: 'user@acme.com',
  role: 'owner',
};

describe('WhatsAppChatController', () => {
  let controller: WhatsAppChatController;
  let client: ReturnType<typeof makeEvolutionClientMock>;
  let instService: ReturnType<typeof makeEvolutionInstanceServiceMock>;

  beforeEach(() => {
    client = makeEvolutionClientMock();
    instService = makeEvolutionInstanceServiceMock();
    controller = new WhatsAppChatController(client, instService);
    vi.clearAllMocks();
    vi.mocked(instService.findByTenant).mockResolvedValue({ instanceName: 'acme-inst' } as never);
  });

  // ── Instance resolution ─────────────────────────────

  it('resolves instance name from tenant slug', async () => {
    await controller.sendTyping(TENANT, { phone: '5511999998888', presence: 'composing' });

    expect(instService.findByTenant).toHaveBeenCalledWith('acme');
    expect(client.sendPresence).toHaveBeenCalledWith('acme-inst', '5511999998888', 'composing', undefined);
  });

  it('throws when no instance configured', async () => {
    vi.mocked(instService.findByTenant).mockResolvedValue(null as never);

    await expect(
      controller.sendTyping(TENANT, { phone: '5511999998888', presence: 'composing' }),
    ).rejects.toThrow('No WhatsApp instance configured for this tenant');
  });

  // ── Chat operations ─────────────────────────────────

  it('sendTyping calls sendPresence', async () => {
    const result = await controller.sendTyping(TENANT, { phone: '5511999998888', presence: 'recording', delay: 5000 });

    expect(client.sendPresence).toHaveBeenCalledWith('acme-inst', '5511999998888', 'recording', 5000);
    expect(result).toEqual({ success: true });
  });

  it('deleteMessage calls evolutionClient', async () => {
    const result = await controller.deleteMessage(TENANT, { messageId: 'msg-1', remoteJid: '5511@c.us', fromMe: true });

    expect(client.deleteMessage).toHaveBeenCalledWith('acme-inst', 'msg-1', '5511@c.us', true);
    expect(result).toEqual({ success: true });
  });

  it('editMessage calls evolutionClient', async () => {
    const result = await controller.editMessage(TENANT, { messageId: 'msg-1', remoteJid: '5511@c.us', fromMe: true, text: 'edited' });

    expect(client.editMessage).toHaveBeenCalledWith('acme-inst', 'msg-1', '5511@c.us', true, 'edited');
    expect(result).toEqual({ success: true });
  });

  it('block calls blockContact', async () => {
    const result = await controller.block(TENANT, { phone: '5511999998888' });
    expect(client.blockContact).toHaveBeenCalledWith('acme-inst', '5511999998888');
    expect(result).toEqual({ success: true });
  });

  it('unblock calls unblockContact', async () => {
    const result = await controller.unblock(TENANT, { phone: '5511999998888' });
    expect(client.unblockContact).toHaveBeenCalledWith('acme-inst', '5511999998888');
    expect(result).toEqual({ success: true });
  });

  // ── Profile ─────────────────────────────────────────

  it('getProfile returns profile data', async () => {
    const result = await controller.getProfile(TENANT, '5511999998888');
    expect(client.fetchProfile).toHaveBeenCalledWith('acme-inst', '5511999998888');
    expect(result).toEqual({ name: 'John', picture: 'https://img.com/j.jpg' });
  });

  it('updateProfileName calls evolutionClient', async () => {
    const result = await controller.updateProfileName(TENANT, { name: 'New Name' });
    expect(client.updateProfileName).toHaveBeenCalledWith('acme-inst', 'New Name');
    expect(result).toEqual({ success: true });
  });

  // ── Privacy ─────────────────────────────────────────

  it('getPrivacy returns settings', async () => {
    const result = await controller.getPrivacy(TENANT);
    expect(client.fetchPrivacySettings).toHaveBeenCalledWith('acme-inst');
    expect(result).toEqual({ readreceipts: 'all' });
  });

  it('updatePrivacy filters undefined values', async () => {
    const result = await controller.updatePrivacy(TENANT, { readreceipts: 'none', profile: undefined } as never);

    expect(client.updatePrivacySettings).toHaveBeenCalledWith('acme-inst', { readreceipts: 'none' });
    expect(result).toEqual({ success: true });
  });

  // ── Media download ──────────────────────────────────

  it('downloadMedia returns base64 and mimetype', async () => {
    const result = await controller.downloadMedia(TENANT, { messageId: 'msg-1', remoteJid: '5511@c.us', fromMe: false });
    expect(result).toEqual({ base64: 'abc', mimetype: 'image/png' });
  });

  // ── Labels (Sprint 7) ──────────────────────────────

  it('getLabels returns labels list', async () => {
    const result = await controller.getLabels(TENANT);
    expect(client.findLabels).toHaveBeenCalledWith('acme-inst');
    expect(result).toEqual([{ id: 'lbl-1', name: 'VIP' }]);
  });

  it('handleLabel calls evolutionClient with action', async () => {
    const result = await controller.handleLabel(TENANT, { labelId: 'lbl-1', chatId: '5511@c.us', action: 'add' });
    expect(client.handleLabel).toHaveBeenCalledWith('acme-inst', 'lbl-1', '5511@c.us', 'add');
    expect(result).toEqual({ success: true });
  });

  // ── Archive (Sprint 7) ─────────────────────────────

  it('archiveChat calls evolutionClient', async () => {
    const result = await controller.archiveChat(TENANT, { chatId: '5511@c.us', archive: true });
    expect(client.archiveChat).toHaveBeenCalledWith('acme-inst', '5511@c.us', true);
    expect(result).toEqual({ success: true });
  });

  // ── Status/Stories (Sprint 7) ──────────────────────

  it('sendStatus calls evolutionClient with content', async () => {
    const result = await controller.sendStatus(TENANT, {
      type: 'text', content: 'Hello world!', allContacts: true,
    } as never);
    expect(client.sendStatus).toHaveBeenCalledWith('acme-inst', 'text', expect.objectContaining({ content: 'Hello world!' }));
    expect(result).toEqual({ success: true });
  });
});
