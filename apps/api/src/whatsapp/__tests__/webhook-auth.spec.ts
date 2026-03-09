import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WhatsAppWebhookController } from '../whatsapp-webhook.controller';
import type { WhatsAppService } from '../whatsapp.service';
import type { ConfigService } from '@nestjs/config';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { EvolutionInstanceService } from '../evolution-instance.service';
import type { WhatsAppReconnectService } from '../whatsapp-reconnect.service';
import type { PrismaService } from '@/prisma/prisma.service';
import type { RedisService } from '@/common/redis/redis.service';

function makeWhatsAppServiceMock() {
  return {
    handleReceivedMessage: vi.fn(),
    handleMessageStatus: vi.fn(),
  } as unknown as WhatsAppService;
}

function makeConfigMock() {
  return {
    get: vi.fn().mockReturnValue('default'),
  } as unknown as ConfigService;
}

function makeEvolutionMock() {
  return {
    findByTenant: vi.fn().mockResolvedValue({
      id: 'inst-1',
      tenantId: 'tid-1',
      instanceName: 'tenant-test',
      instanceToken: 'secret-token-123',
    }),
  } as unknown as EvolutionInstanceService;
}

function makeEmitterMock() {
  return { emit: vi.fn() } as unknown as EventEmitter2;
}

function makePrismaMock() {
  return {
    whatsAppInstance: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'inst-1',
        tenantId: 'tid-1',
        instanceName: 'tenant-test',
      }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  } as unknown as PrismaService;
}

function makeRedisMock() {
  return {
    get: vi.fn().mockResolvedValue(null),
    setex: vi.fn().mockResolvedValue(undefined),
    setnx: vi.fn().mockResolvedValue(true),
    del: vi.fn().mockResolvedValue(undefined),
  } as unknown as RedisService;
}

function makeReconnectMock() {
  return {
    handleDisconnect: vi.fn().mockResolvedValue(undefined),
  } as unknown as WhatsAppReconnectService;
}

describe('Webhook Auth — apikey validation', () => {
  let controller: WhatsAppWebhookController;
  let whatsApp: ReturnType<typeof makeWhatsAppServiceMock>;
  let evolution: ReturnType<typeof makeEvolutionMock>;
  let redis: ReturnType<typeof makeRedisMock>;
  let emitter: ReturnType<typeof makeEmitterMock>;

  beforeEach(() => {
    whatsApp = makeWhatsAppServiceMock();
    evolution = makeEvolutionMock();
    redis = makeRedisMock();
    emitter = makeEmitterMock();
    const config = makeConfigMock();
    const prisma = makePrismaMock();
    const reconnect = makeReconnectMock();

    controller = new WhatsAppWebhookController(
      whatsApp,
      config,
      evolution,
      emitter,
      prisma,
      reconnect,
      redis,
    );
  });

  const validPayload = (apikey?: string) => ({
    event: 'messages.upsert',
    instance: 'tenant-test',
    ...(apikey !== undefined ? { apikey } : {}),
    data: {
      key: { id: 'msg-1', remoteJid: '5511999998888@s.whatsapp.net', fromMe: false },
      message: { conversation: 'Hello' },
      messageTimestamp: 1700000000,
      pushName: 'User',
      messageType: 'conversation',
    },
  });

  it('allows webhook with correct apikey', async () => {
    const result = await controller.webhookReceiveTenant('test', validPayload('secret-token-123'));
    expect(result).toEqual({ received: true });
    expect(whatsApp.handleReceivedMessage).toHaveBeenCalled();
  });

  it('rejects webhook with wrong apikey', async () => {
    const result = await controller.webhookReceiveTenant('test', validPayload('wrong-key'));
    expect(result).toEqual({ received: true }); // Still returns 200 (don't leak info)
    expect(whatsApp.handleReceivedMessage).not.toHaveBeenCalled();
  });

  it('rejects webhook with no apikey when instance has token', async () => {
    const result = await controller.webhookReceiveTenant('test', validPayload());
    expect(result).toEqual({ received: true });
    expect(whatsApp.handleReceivedMessage).not.toHaveBeenCalled();
  });

  it('allows webhook with no apikey when instance has no token', async () => {
    vi.mocked(evolution.findByTenant).mockResolvedValue({
      id: 'inst-1',
      tenantId: 'tid-1',
      instanceName: 'tenant-test',
      instanceToken: null,
    } as never);

    const result = await controller.webhookReceiveTenant('test', validPayload());
    expect(result).toEqual({ received: true });
    expect(whatsApp.handleReceivedMessage).toHaveBeenCalled();
  });

  it('caches token in Redis after first DB lookup', async () => {
    await controller.webhookReceiveTenant('test', validPayload('secret-token-123'));
    expect(redis.setex).toHaveBeenCalledWith('webhook:token:test', 300, 'secret-token-123');
  });

  it('rejects from cache when apikey is missing', async () => {
    vi.mocked(redis.get).mockResolvedValue('secret-token-123'); // Token cached

    const result = await controller.webhookReceiveTenant('test', validPayload());
    expect(whatsApp.handleReceivedMessage).not.toHaveBeenCalled();
  });
});
