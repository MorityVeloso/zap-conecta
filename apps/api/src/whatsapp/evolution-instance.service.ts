/**
 * Evolution Instance Service
 * Manages WhatsApp instances in Evolution API.
 * Adapted from saas-whatsapp-b2b — uses local PrismaService instead of monorepo package.
 */

import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EvolutionApiException } from '../common/exceptions/evolution-api.exception';
import { ConfigService } from '@nestjs/config';
import { retryWithBackoff } from '../common/utils/retry-with-backoff';
import { CircuitBreaker } from '../common/utils/circuit-breaker';

import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';

export enum WhatsAppInstanceStatus {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING   = 'CONNECTING',
  CONNECTED    = 'CONNECTED',
  NEEDS_QR     = 'NEEDS_QR',
}

export interface WhatsAppInstance {
  id: string;
  tenantId: string;
  tenantSlug: string;
  displayName: string | null;
  instanceName: string;
  instanceToken: string | null;
  status: string;
  phone: string | null;
  webhookUrl: string | null;
  metadata: unknown;
  reconnectAttempts: number;
  lastReconnectAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateInstanceResult {
  instanceName: string;
  instanceId: string;
  status: WhatsAppInstanceStatus;
}

@Injectable()
export class EvolutionInstanceService {
  private readonly logger = new Logger(EvolutionInstanceService.name);
  private readonly evolutionUrl: string;
  private readonly evolutionApiKey: string;
  private readonly webhookBaseUrl: string;
  private readonly circuitBreaker = new CircuitBreaker('evolution-instance');

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly redis: RedisService,
  ) {
    this.evolutionUrl = this.configService.get<string>(
      'EVOLUTION_API_URL',
      'http://localhost:8080',
    );
    this.evolutionApiKey = this.configService.get<string>(
      'EVOLUTION_API_KEY',
      '',
    );
    // URL that Evolution API (inside Docker) uses to reach our NestJS API
    this.webhookBaseUrl = this.configService.get<string>(
      'WEBHOOK_BASE_URL',
      'http://host.docker.internal:3001',
    );
  }

  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      apikey: this.evolutionApiKey,
    };
  }

  private static readonly REQUEST_TIMEOUT_MS = 30_000;

  /**
   * Central HTTP method with circuit breaker + retry.
   * Instance management operations (GET, PUT restart) are retryable.
   * POST create is NOT retried (could create duplicates).
   */
  private async makeRequest<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    body?: unknown,
    options?: { retryable?: boolean },
  ): Promise<T> {
    const url = `${this.evolutionUrl}${endpoint}`;
    const retryable = options?.retryable ?? (method === 'GET' || method === 'PUT' || method === 'DELETE');

    const doFetch = async (): Promise<T> => {
      const response = await fetch(url, {
        method,
        headers: this.getHeaders(),
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(EvolutionInstanceService.REQUEST_TIMEOUT_MS),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(
          `Evolution API error: ${String(response.status)} - ${errorText}`,
        );
        throw new EvolutionApiException(response.status, errorText);
      }

      const text = await response.text();
      if (!text) {
        this.logger.warn(`Empty response body: ${method} ${endpoint}`);
        return {} as T;
      }
      return JSON.parse(text) as T;
    };

    try {
      return await this.circuitBreaker.execute(() =>
        retryable ? retryWithBackoff(doFetch) : doFetch(),
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === 'TimeoutError') {
        this.logger.error(`Evolution API timeout: ${method} ${endpoint}`);
        throw new EvolutionApiException(504, 'Evolution API request timed out');
      }
      throw error;
    }
  }

  buildInstanceName(tenantSlug: string): string {
    const suffix = randomBytes(3).toString('hex');
    return `${tenantSlug}-${suffix}`;
  }

  buildWebhookUrl(tenantSlug: string): string {
    return `${this.webhookBaseUrl}/whatsapp/webhook/receive/${tenantSlug}`;
  }

  async findByTenant(tenantSlug: string): Promise<WhatsAppInstance | null> {
    const instance = await this.prisma.whatsAppInstance.findFirst({
      where: { tenantSlug },
    });
    return instance as WhatsAppInstance | null;
  }

  async findById(instanceId: string): Promise<WhatsAppInstance | null> {
    const instance = await this.prisma.whatsAppInstance.findUnique({
      where: { id: instanceId },
    });
    return instance as WhatsAppInstance | null;
  }

  async listByTenantId(tenantId: string): Promise<WhatsAppInstance[]> {
    const instances = await this.prisma.whatsAppInstance.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
    });
    return instances as WhatsAppInstance[];
  }

  async createInstance(
    tenantSlug: string,
    tenantId: string,
    displayName?: string,
  ): Promise<CreateInstanceResult> {
    // Enforce plan instance limit
    await this.assertBelowInstanceLimit(tenantId);

    const instanceName = this.buildInstanceName(tenantSlug);
    const webhookUrl = this.buildWebhookUrl(tenantSlug);

    const createResponse = await this.makeRequest<{
      instance?: {
        instanceName?: string;
        instanceId?: string;
        status?: string;
      };
      hash?: Record<string, string>;
    }>('/instance/create', 'POST', {
      instanceName,
      integration: 'WHATSAPP-BAILEYS',
      qrcode: true,
      webhook: {
        url: webhookUrl,
        byEvents: false,
        base64: false,
        events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE', 'QRCODE_UPDATED', 'MESSAGES_DELETE', 'SEND_MESSAGE', 'CALL'],
      },
    });

    const instanceToken = createResponse.hash?.apikey ?? undefined;

    const record = await this.prisma.whatsAppInstance.create({
      data: {
        tenantId,
        tenantSlug,
        displayName: displayName ?? null,
        instanceName,
        instanceToken: instanceToken ?? null,
        status: WhatsAppInstanceStatus.DISCONNECTED,
        webhookUrl,
        metadata: {},
      },
    });

    this.logger.log(
      `Instance created: ${instanceName} for tenant ${tenantSlug}`,
    );

    // Invalidate cached instance name so api-client picks up the new one
    this.eventEmitter.emit('whatsapp.instance.cache_invalidate', { tenantSlug });

    // Configure recommended settings (non-fatal)
    this.configureInstanceSettings(instanceName).catch(() => {});

    return {
      instanceName,
      instanceId: record.id,
      status: record.status as WhatsAppInstanceStatus,
    };
  }

  private async assertBelowInstanceLimit(tenantId: string): Promise<void> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { planId: true },
    });

    if (!tenant?.planId) return;

    const plan = await this.prisma.plan.findUnique({
      where: { id: tenant.planId },
      select: { instancesLimit: true },
    });

    const limit = plan?.instancesLimit ?? 1;
    if (limit === -1) return; // unlimited

    const current = await this.prisma.whatsAppInstance.count({
      where: { tenantId },
    });

    if (current >= limit) {
      throw new BadRequestException(
        `Limite de ${limit} instância(s) atingido. Faça upgrade para adicionar mais.`,
      );
    }
  }

  async getOrCreateInstance(
    tenantSlug: string,
    tenantId: string,
  ): Promise<WhatsAppInstance> {
    // Fast path: check without lock
    const existing = await this.prisma.whatsAppInstance.findFirst({
      where: { tenantSlug },
    });

    if (existing) {
      // Verify the instance still exists on Evolution API (may have been lost on redeploy)
      const existsOnEvolution = await this.instanceExistsOnEvolutionApi(
        existing.instanceName,
      );

      if (!existsOnEvolution) {
        this.logger.warn(
          `Instance ${existing.instanceName} exists in DB but not on Evolution API — re-creating`,
        );
        await this.recreateOnEvolutionApi(existing.instanceName, tenantSlug);
      }

      return existing as WhatsAppInstance;
    }

    // Distributed lock to prevent race condition (two concurrent requests creating duplicates)
    const lockKey = `instance:lock:${tenantSlug}`;
    const acquired = await this.redis.setnx(lockKey, '1', 10);

    if (!acquired) {
      // Another process is creating — wait and retry findFirst
      await new Promise((r) => setTimeout(r, 500));
      const retry = await this.prisma.whatsAppInstance.findFirst({
        where: { tenantSlug },
      });
      if (retry) return retry as WhatsAppInstance;
      throw new BadRequestException('Instance creation in progress, try again');
    }

    try {
      // Double-check inside lock
      const doubleCheck = await this.prisma.whatsAppInstance.findFirst({
        where: { tenantSlug },
      });
      if (doubleCheck) return doubleCheck as WhatsAppInstance;

      await this.createInstance(tenantSlug, tenantId);

      const created = await this.prisma.whatsAppInstance.findFirst({
        where: { tenantSlug },
      });

      return created as WhatsAppInstance;
    } finally {
      await this.redis.del(lockKey);
    }
  }

  /** Check if an instance exists on Evolution API without throwing */
  private async instanceExistsOnEvolutionApi(
    instanceName: string,
  ): Promise<boolean> {
    try {
      await this.makeRequest(
        `/instance/connectionState/${instanceName}`,
        'GET',
      );
      return true;
    } catch (error) {
      if (error instanceof EvolutionApiException && error.upstreamStatus === 404) {
        return false;
      }
      // For other errors (network, 500, etc.), assume it exists to avoid recreating
      this.logger.warn(
        `Could not verify instance ${instanceName} on Evolution API: ${String(error)}`,
      );
      return true;
    }
  }

  /** Re-create an instance on Evolution API (DB record already exists).
   *  Returns QR data from the create response to avoid a second round-trip. */
  private async recreateOnEvolutionApi(
    instanceName: string,
    tenantSlug: string,
  ): Promise<{ qrcode?: string; imageBase64?: string; pairingCode?: string }> {
    const webhookUrl = this.buildWebhookUrl(tenantSlug);

    const createResponse = await this.makeRequest<{
      instance?: { instanceName?: string };
      hash?: Record<string, string>;
      qrcode?: { code?: string; base64?: string; pairingCode?: string };
    }>('/instance/create', 'POST', {
      instanceName,
      integration: 'WHATSAPP-BAILEYS',
      qrcode: true,
      webhook: {
        url: webhookUrl,
        byEvents: false,
        base64: false,
        events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE', 'QRCODE_UPDATED', 'MESSAGES_DELETE', 'SEND_MESSAGE', 'CALL'],
      },
    });

    const instanceToken = createResponse.hash?.apikey ?? null;

    await this.prisma.whatsAppInstance.updateMany({
      where: { instanceName },
      data: {
        instanceToken,
        status: WhatsAppInstanceStatus.DISCONNECTED,
        webhookUrl,
        phone: null,
      },
    });

    this.logger.log(`Instance re-created on Evolution API: ${instanceName}`);

    // Invalidate cached instance name
    this.eventEmitter.emit('whatsapp.instance.cache_invalidate', { tenantSlug });

    // Configure recommended settings (non-fatal)
    this.configureInstanceSettings(instanceName).catch(() => {});

    return {
      qrcode: createResponse.qrcode?.code,
      imageBase64: createResponse.qrcode?.base64,
      pairingCode: createResponse.qrcode?.pairingCode,
    };
  }

  /** Public: verify instance exists on Evolution API; recreate if not.
   *  Returns QR data when recreation happened (avoids extra round-trip). */
  async ensureEvolutionInstance(
    instanceName: string,
    tenantSlug: string,
  ): Promise<{ qrcode?: string; imageBase64?: string; pairingCode?: string } | null> {
    const exists = await this.instanceExistsOnEvolutionApi(instanceName);
    if (!exists) {
      this.logger.warn(
        `Instance ${instanceName} missing on Evolution API — re-creating`,
      );
      return this.recreateOnEvolutionApi(instanceName, tenantSlug);
    }
    return null;
  }

  async getInstance(tenantSlug: string): Promise<WhatsAppInstance> {
    const instance = await this.prisma.whatsAppInstance.findFirst({
      where: { tenantSlug },
    });

    if (!instance) {
      throw new NotFoundException(
        'WhatsApp instance not found for this tenant',
      );
    }

    return instance as WhatsAppInstance;
  }

  async deleteInstance(tenantSlug: string, instanceId?: string): Promise<void> {
    const instance = instanceId
      ? await this.prisma.whatsAppInstance.findFirst({
          where: { id: instanceId, tenantSlug },
        })
      : await this.prisma.whatsAppInstance.findFirst({
          where: { tenantSlug },
        });

    if (!instance) {
      throw new NotFoundException('WhatsApp instance not found');
    }

    try {
      await this.makeRequest(
        `/instance/delete/${instance.instanceName}`,
        'DELETE',
      );
    } catch (error) {
      this.logger.warn(
        `Failed to delete instance from Evolution API: ${String(error)}`,
      );
    }

    await this.prisma.whatsAppInstance.delete({ where: { id: instance.id } });

    this.logger.log(`Instance deleted: ${instance.instanceName}`);
  }

  async configureWebhook(
    instanceName: string,
    tenantSlug: string,
  ): Promise<void> {
    const webhookUrl = this.buildWebhookUrl(tenantSlug);

    await this.makeRequest(`/webhook/set/${instanceName}`, 'POST', {
      url: webhookUrl,
      byEvents: false,
      base64: false,
      events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE', 'QRCODE_UPDATED', 'MESSAGES_DELETE', 'SEND_MESSAGE', 'CALL'],
    });

    await this.prisma.whatsAppInstance.updateMany({
      where: { instanceName },
      data: { webhookUrl },
    });

    this.logger.log(`Webhook configured: ${instanceName} -> ${webhookUrl}`);
  }

  /** Lightweight: single GET to check connection state only (no phone lookup) */
  async isConnected(instanceName: string): Promise<boolean> {
    try {
      const response = await this.makeRequest<{
        instance: { state: string };
      }>(`/instance/connectionState/${instanceName}`, 'GET');
      return response.instance?.state === 'open';
    } catch {
      return false;
    }
  }

  async getConnectionStatusForInstance(
    instanceName: string,
  ): Promise<{ connected: boolean; phone?: string }> {
    try {
      const response = await this.makeRequest<{
        instance: { state: string };
      }>(`/instance/connectionState/${instanceName}`, 'GET');

      const connected = response.instance?.state === 'open';
      let phone: string | undefined;

      if (connected) {
        try {
          const instances = await this.makeRequest<
            { name: string; ownerJid?: string; number?: string }[]
          >('/instance/fetchInstances', 'GET');
          const inst = instances.find((i) => i.name === instanceName);
          if (inst?.ownerJid) phone = inst.ownerJid.replace('@s.whatsapp.net', '');
          else if (inst?.number) phone = inst.number;
        } catch {
          // phone lookup failed, not critical
        }
      }

      return { connected, phone };
    } catch {
      return { connected: false };
    }
  }

  async getQrCodeForInstance(
    instanceName: string,
  ): Promise<{ qrcode: string; imageBase64?: string }> {
    const response = await this.makeRequest<{
      pairingCode?: string;
      code?: string;
      base64?: string;
    }>(`/instance/connect/${instanceName}`, 'GET');

    return {
      qrcode: response.code ?? response.pairingCode ?? '',
      imageBase64: response.base64,
    };
  }

  /** Returns QR code + pairing code (8-digit code for phone linking) */
  async getConnectDataForInstance(
    instanceName: string,
  ): Promise<{ qrcode: string; imageBase64?: string; pairingCode?: string }> {
    const response = await this.makeRequest<{
      pairingCode?: string;
      code?: string;
      base64?: string;
    }>(`/instance/connect/${instanceName}`, 'GET');

    return {
      qrcode: response.code ?? '',
      imageBase64: response.base64,
      pairingCode: response.pairingCode,
    };
  }

  /** List all instances from Evolution API with their connection state */
  async listAllInstanceStates(): Promise<
    { name: string; state: string }[]
  > {
    try {
      const instances = await this.makeRequest<
        { instance: { instanceName: string; state: string; status: string } }[]
      >('/instance/fetchInstances', 'GET');

      return instances.map((i) => ({
        name: i.instance?.instanceName ?? '',
        state: i.instance?.state ?? i.instance?.status ?? 'unknown',
      }));
    } catch (error) {
      this.logger.error(`Failed to list instance states: ${String(error)}`);
      return [];
    }
  }

  async disconnectInstance(instanceName: string): Promise<void> {
    await this.makeRequest(`/instance/logout/${instanceName}`, 'DELETE');
    this.logger.log(`Instance disconnected: ${instanceName}`);
  }

  async restartInstance(instanceName: string): Promise<void> {
    await this.makeRequest(`/instance/restart/${instanceName}`, 'POST');
    this.logger.log(`Instance restarted: ${instanceName}`);
  }

  async syncStatus(tenantSlug: string): Promise<WhatsAppInstanceStatus> {
    const instance = await this.getInstance(tenantSlug);

    try {
      const response = await this.makeRequest<{
        instance: { state: string };
      }>(`/instance/connectionState/${instance.instanceName}`, 'GET');

      const stateMap: Record<string, WhatsAppInstanceStatus> = {
        open:       WhatsAppInstanceStatus.CONNECTED,
        close:      WhatsAppInstanceStatus.DISCONNECTED,
        connecting: WhatsAppInstanceStatus.CONNECTING,
      };

      const newStatus =
        stateMap[response.instance?.state] ??
        WhatsAppInstanceStatus.DISCONNECTED;

      if (newStatus !== instance.status) {
        await this.prisma.whatsAppInstance.updateMany({
          where: { id: instance.id },
          data: { status: newStatus },
        });
      }

      return newStatus;
    } catch {
      return instance.status as WhatsAppInstanceStatus;
    }
  }

  // ── Instance settings ──────────────────────────────────────

  /** Configure recommended settings for a new/recreated instance (non-fatal). */
  async configureInstanceSettings(instanceName: string): Promise<void> {
    try {
      await this.makeRequest(`/settings/set/${instanceName}`, 'POST', {
        rejectCall: true,
        msgCall: 'Não aceitamos chamadas por este número.',
        groupsIgnore: false,
        alwaysOnline: false,
        readMessages: false,
        readStatus: false,
        syncFullHistory: false,
      });
      this.logger.log(`Settings configured for instance: ${instanceName}`);
    } catch (error) {
      this.logger.warn(`Failed to configure settings for ${instanceName}: ${String(error)}`);
    }
  }

  // ── Auto-reconnect helpers ──────────────────────────────────

  async attemptRestart(instanceName: string): Promise<boolean> {
    try {
      await this.makeRequest(`/instance/restart/${instanceName}`, 'POST');
      this.logger.log(`Auto-restart triggered: ${instanceName}`);
      return true;
    } catch (error) {
      this.logger.warn(`Auto-restart failed for ${instanceName}: ${String(error)}`);
      return false;
    }
  }

  async incrementReconnectAttempts(instanceName: string): Promise<number> {
    const inst = await this.prisma.whatsAppInstance.findFirst({
      where: { instanceName },
      select: { reconnectAttempts: true },
    });
    const newCount = (inst?.reconnectAttempts ?? 0) + 1;
    await this.prisma.whatsAppInstance.updateMany({
      where: { instanceName },
      data: { reconnectAttempts: newCount, lastReconnectAt: new Date() },
    });
    return newCount;
  }

  async resetReconnectAttempts(instanceName: string): Promise<void> {
    await this.prisma.whatsAppInstance.updateMany({
      where: { instanceName },
      data: { reconnectAttempts: 0, lastReconnectAt: null },
    });
  }

  async markAsNeedsQr(instanceName: string): Promise<void> {
    await this.prisma.whatsAppInstance.updateMany({
      where: { instanceName },
      data: { status: 'NEEDS_QR', reconnectAttempts: 0 },
    });
  }
}
