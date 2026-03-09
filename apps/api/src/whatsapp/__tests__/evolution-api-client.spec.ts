import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EvolutionApiClientService } from '../evolution-api-client.service';
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '@/prisma/prisma.service';

function makeConfigServiceMock() {
  const config: Record<string, string> = {
    EVOLUTION_API_URL: 'https://evo.test',
    EVOLUTION_API_KEY: 'test-api-key',
    DEFAULT_INSTANCE_SLUG: 'default',
  };
  return {
    get: vi.fn((key: string, defaultValue?: string) => config[key] ?? defaultValue ?? ''),
  } as unknown as ConfigService;
}

function makePrismaMock() {
  return {
    whatsAppInstance: {
      findFirst: vi.fn().mockResolvedValue({ instanceName: 'acme-inst', status: 'CONNECTED' }),
    },
  } as unknown as PrismaService;
}

let mockFetch: ReturnType<typeof vi.fn>;

describe('EvolutionApiClientService', () => {
  let service: EvolutionApiClientService;
  let prisma: ReturnType<typeof makePrismaMock>;
  let configService: ReturnType<typeof makeConfigServiceMock>;

  beforeEach(() => {
    configService = makeConfigServiceMock();
    prisma = makePrismaMock();
    service = new EvolutionApiClientService(configService, prisma);

    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({ key: { id: 'msg-123' } })),
    });
    vi.stubGlobal('fetch', mockFetch);
    vi.clearAllMocks();
    // Re-mock after clearAllMocks
    vi.mocked(prisma.whatsAppInstance.findFirst).mockResolvedValue({ instanceName: 'acme-inst', status: 'CONNECTED' } as never);
  });

  // ── makeRequest ─────────────────────────────────────

  it('sends request with correct URL, headers, and body', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({ success: true })),
    });

    await service.sendTextMessage({
      phone: '5511999998888',
      message: 'Hello!',
      tenantSlug: 'acme',
    } as never);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('https://evo.test/message/sendText/acme-inst'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          apikey: 'test-api-key',
        }),
      }),
    );
  });

  it('throws on non-OK response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal Server Error'),
    });

    await expect(
      service.sendTextMessage({ phone: '5511999998888', message: 'Hi', tenantSlug: 'acme' } as never),
    ).rejects.toThrow('Internal Server Error');
  });

  it('returns empty object on empty response body', async () => {
    mockFetch.mockResolvedValue({ ok: true, text: () => Promise.resolve('') });

    const result = await service.sendTextMessage({ phone: '5511999998888', message: 'Hi', tenantSlug: 'acme' } as never);
    expect(result).toEqual({});
  });

  // ── Instance resolution ─────────────────────────────

  it('resolves instance name from tenant slug via Prisma', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({})),
    });

    await service.sendTextMessage({ phone: '5511999998888', message: 'Hi', tenantSlug: 'acme' } as never);

    expect(prisma.whatsAppInstance.findFirst).toHaveBeenCalledWith({
      where: { tenantSlug: 'acme' },
    });
  });

  it('throws when no instance found for tenant slug', async () => {
    vi.mocked(prisma.whatsAppInstance.findFirst).mockResolvedValue(null);

    await expect(
      service.sendTextMessage({ phone: '5511999998888', message: 'Hi', tenantSlug: 'acme' } as never),
    ).rejects.toThrow('No WhatsApp instance configured for this tenant');

    expect(mockFetch).not.toHaveBeenCalled();
  });

  // ── Send methods build correct payloads ─────────────

  it('sendTextMessage builds correct body with number and text', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({})),
    });

    await service.sendTextMessage({
      phone: '5511999998888',
      message: 'Hello world',
      tenantSlug: 'acme',
    } as never);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.number).toBe('5511999998888');
    expect(body.text).toBe('Hello world');
  });

  it('sendTextMessage includes quoted key when provided', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({})),
    });

    await service.sendTextMessage({
      phone: '5511999998888',
      message: 'Reply!',
      tenantSlug: 'acme',
      quoted: { messageId: 'msg-original', remoteJid: '5511@c.us', fromMe: false },
    } as never);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.quoted).toBeDefined();
    expect(body.quoted.key.id).toBe('msg-original');
    expect(body.quoted.key.remoteJid).toBe('5511@c.us');
    expect(body.quoted.key.fromMe).toBe(false);
  });

  it('sendAudioMessage sends to correct endpoint with audio URL', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({})),
    });

    await service.sendAudioMessage({
      phone: '5511999998888',
      audio: 'https://audio.com/voice.ogg',
      tenantSlug: 'acme',
    } as never);

    const url = mockFetch.mock.calls[0][0] as string;
    // Default (no ptt) uses sendMedia endpoint
    expect(url).toContain('/message/sendMedia/');

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.number).toBe('5511999998888');
    expect(body.mediatype).toBe('audio');
    expect(body.media).toBe('https://audio.com/voice.ogg');
  });

  it('sendLocationMessage sends lat/lng', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({})),
    });

    await service.sendLocationMessage({
      phone: '5511999998888',
      latitude: -23.55,
      longitude: -46.63,
      name: 'Office',
      tenantSlug: 'acme',
    } as never);

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('/message/sendLocation/');

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.latitude).toBe(-23.55);
    expect(body.longitude).toBe(-46.63);
    expect(body.name).toBe('Office');
  });

  it('sendReaction sends reaction with key structure', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({})),
    });

    await service.sendReaction({
      messageId: 'msg-1',
      remoteJid: '5511@c.us',
      fromMe: false,
      reaction: '👍',
      tenantSlug: 'acme',
    } as never);

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('/message/sendReaction/');

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.key.id).toBe('msg-1');
    expect(body.reaction).toBe('👍');
  });

  // ── Group methods ───────────────────────────────────

  it('createGroup sends correct payload', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({ groupJid: '120363@g.us' })),
    });

    await service.createGroup('acme-inst', 'Team', ['5511999998888'], 'Desc');

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('/group/create/acme-inst');

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.subject).toBe('Team');
    expect(body.participants).toEqual(['5511999998888']);
    expect(body.description).toBe('Desc');
  });

  it('fetchAllGroups uses GET', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify([])),
    });

    await service.fetchAllGroups('acme-inst');

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('/group/fetchAllGroups/acme-inst');
    expect(mockFetch.mock.calls[0][1].method).toBe('GET');
  });

  // ── Chat operations ─────────────────────────────────

  it('sendPresence sends correct payload', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({})),
    });

    await service.sendPresence('acme-inst', '5511999998888', 'composing', 3000);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    // Evolution API expects JID format for chat operations
    expect(body.number).toBe('5511999998888@s.whatsapp.net');
    expect(body.presence).toBe('composing');
    expect(body.delay).toBe(3000);
  });

  it('blockContact sends correct payload', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({})),
    });

    await service.blockContact('acme-inst', '5511999998888');

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.number).toBe('5511999998888@s.whatsapp.net');
    expect(body.status).toBe('block');
  });

  // ── Labels / Archive / Status ───────────────────────

  it('findLabels uses GET', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify([{ id: 'lbl-1' }])),
    });

    const result = await service.findLabels('acme-inst');

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('/label/findLabels/acme-inst');
    expect(result).toEqual([{ id: 'lbl-1' }]);
  });

  it('archiveChat sends correct payload', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({})),
    });

    await service.archiveChat('acme-inst', '5511@c.us', true);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.chat).toBe('5511@c.us');
    expect(body.archive).toBe(true);
  });
});
