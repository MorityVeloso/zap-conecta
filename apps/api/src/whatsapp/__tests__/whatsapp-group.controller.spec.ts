import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WhatsAppGroupController } from '../whatsapp-group.controller';
import type { EvolutionApiClientService } from '../evolution-api-client.service';
import type { EvolutionInstanceService } from '../evolution-instance.service';
import type { TenantContext } from '../../auth/supabase-jwt.guard';

function makeEvolutionClientMock() {
  return {
    createGroup: vi.fn().mockResolvedValue({ groupJid: '120363@g.us' }),
    fetchAllGroups: vi.fn().mockResolvedValue([{ id: 'g1', subject: 'Team' }]),
    findGroupInfo: vi.fn().mockResolvedValue({ subject: 'Team', size: 5 }),
    fetchGroupParticipants: vi.fn().mockResolvedValue([{ id: '5511@c.us', admin: false }]),
    fetchGroupInviteCode: vi.fn().mockResolvedValue({ inviteCode: 'abc123' }),
    updateGroupSubject: vi.fn().mockResolvedValue(undefined),
    updateGroupDescription: vi.fn().mockResolvedValue(undefined),
    updateGroupPicture: vi.fn().mockResolvedValue(undefined),
    updateGroupParticipants: vi.fn().mockResolvedValue({ status: 'ok' }),
    updateGroupSetting: vi.fn().mockResolvedValue(undefined),
    sendGroupInvite: vi.fn().mockResolvedValue(undefined),
    leaveGroup: vi.fn().mockResolvedValue(undefined),
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

const GROUP_JID = '120363123456789@g.us';

describe('WhatsAppGroupController', () => {
  let controller: WhatsAppGroupController;
  let client: ReturnType<typeof makeEvolutionClientMock>;
  let instService: ReturnType<typeof makeEvolutionInstanceServiceMock>;

  beforeEach(() => {
    client = makeEvolutionClientMock();
    instService = makeEvolutionInstanceServiceMock();
    controller = new WhatsAppGroupController(client, instService);
    vi.clearAllMocks();
    vi.mocked(instService.findByTenant).mockResolvedValue({ instanceName: 'acme-inst' } as never);
  });

  // ── CRUD ────────────────────────────────────────────

  it('createGroup calls Evolution client', async () => {
    const result = await controller.createGroup(TENANT, {
      subject: 'New Group', participants: ['5511999998888'], description: 'A group',
    });
    expect(client.createGroup).toHaveBeenCalledWith('acme-inst', 'New Group', ['5511999998888'], 'A group');
    expect(result).toEqual({ groupJid: '120363@g.us' });
  });

  it('listGroups calls Evolution client', async () => {
    const result = await controller.listGroups(TENANT);
    expect(client.fetchAllGroups).toHaveBeenCalledWith('acme-inst');
    expect(result).toHaveLength(1);
  });

  it('getGroupInfo calls Evolution client', async () => {
    const result = await controller.getGroupInfo(TENANT, GROUP_JID);
    expect(client.findGroupInfo).toHaveBeenCalledWith('acme-inst', GROUP_JID);
    expect(result).toEqual({ subject: 'Team', size: 5 });
  });

  it('getParticipants calls Evolution client', async () => {
    const result = await controller.getParticipants(TENANT, GROUP_JID);
    expect(client.fetchGroupParticipants).toHaveBeenCalledWith('acme-inst', GROUP_JID);
    expect(result).toHaveLength(1);
  });

  it('getInviteCode returns invite code', async () => {
    const result = await controller.getInviteCode(TENANT, GROUP_JID);
    expect(result).toEqual({ inviteCode: 'abc123' });
  });

  // ── Updates ─────────────────────────────────────────

  it('updateSubject calls Evolution client', async () => {
    const result = await controller.updateSubject(TENANT, GROUP_JID, { subject: 'New Name' });
    expect(client.updateGroupSubject).toHaveBeenCalledWith('acme-inst', GROUP_JID, 'New Name');
    expect(result).toEqual({ success: true });
  });

  it('updateDescription calls Evolution client', async () => {
    const result = await controller.updateDescription(TENANT, GROUP_JID, { description: 'New desc' });
    expect(client.updateGroupDescription).toHaveBeenCalledWith('acme-inst', GROUP_JID, 'New desc');
    expect(result).toEqual({ success: true });
  });

  it('updatePicture calls Evolution client', async () => {
    const result = await controller.updatePicture(TENANT, GROUP_JID, { picture: 'https://img.com/group.jpg' });
    expect(client.updateGroupPicture).toHaveBeenCalledWith('acme-inst', GROUP_JID, 'https://img.com/group.jpg');
    expect(result).toEqual({ success: true });
  });

  // ── Participants ────────────────────────────────────

  it('updateParticipants calls Evolution client with action', async () => {
    const result = await controller.updateParticipants(TENANT, GROUP_JID, {
      action: 'add', participants: ['5511888887777'],
    });
    expect(client.updateGroupParticipants).toHaveBeenCalledWith('acme-inst', GROUP_JID, 'add', ['5511888887777']);
    expect(result).toEqual({ status: 'ok' });
  });

  // ── Settings ────────────────────────────────────────

  it('updateSettings calls Evolution client', async () => {
    const result = await controller.updateSettings(TENANT, GROUP_JID, { action: 'announcement' });
    expect(client.updateGroupSetting).toHaveBeenCalledWith('acme-inst', GROUP_JID, 'announcement');
    expect(result).toEqual({ success: true });
  });

  // ── Invite ──────────────────────────────────────────

  it('sendInvite calls Evolution client', async () => {
    const result = await controller.sendInvite(TENANT, GROUP_JID, {
      numbers: ['5511999998888'], description: 'Join us!',
    });
    expect(client.sendGroupInvite).toHaveBeenCalledWith('acme-inst', GROUP_JID, ['5511999998888'], 'Join us!');
    expect(result).toEqual({ success: true });
  });

  // ── Leave ───────────────────────────────────────────

  it('leaveGroup calls Evolution client', async () => {
    const result = await controller.leaveGroup(TENANT, GROUP_JID);
    expect(client.leaveGroup).toHaveBeenCalledWith('acme-inst', GROUP_JID);
    expect(result).toEqual({ success: true });
  });
});
