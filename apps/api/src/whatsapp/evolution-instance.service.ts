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
import { EvolutionApiException } from '../common/exceptions/evolution-api.exception';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../prisma/prisma.service';

export enum WhatsAppInstanceStatus {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING   = 'CONNECTING',
  CONNECTED    = 'CONNECTED',
}

export interface WhatsAppInstance {
  id: string;
  tenantId: string;
  tenantSlug: string;
  instanceName: string;
  instanceToken: string | null;
  status: string;
  phone: string | null;
  webhookUrl: string | null;
  metadata: unknown;
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

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
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

  private async makeRequest<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    body?: unknown,
  ): Promise<T> {
    const url = `${this.evolutionUrl}${endpoint}`;

    const response = await fetch(url, {
      method,
      headers: this.getHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error(
        `Evolution API error: ${String(response.status)} - ${errorText}`,
      );
      throw new EvolutionApiException(response.status, errorText);
    }

    const text = await response.text();
    if (!text) return {} as T;
    return JSON.parse(text) as T;
  }

  buildInstanceName(tenantSlug: string): string {
    return `tenant-${tenantSlug}`;
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

  async createInstance(
    tenantSlug: string,
    tenantId: string,
  ): Promise<CreateInstanceResult> {
    const instanceName = this.buildInstanceName(tenantSlug);
    const webhookUrl = this.buildWebhookUrl(tenantSlug);

    const existing = await this.prisma.whatsAppInstance.findFirst({
      where: { tenantSlug },
    });

    if (existing) {
      throw new BadRequestException(
        'WhatsApp instance already exists for this tenant',
      );
    }

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
        events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE'],
      },
    });

    const instanceToken = createResponse.hash?.apikey ?? undefined;

    const record = await this.prisma.whatsAppInstance.create({
      data: {
        tenantId,
        tenantSlug,
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

    return {
      instanceName,
      instanceId: record.id,
      status: record.status as WhatsAppInstanceStatus,
    };
  }

  async getOrCreateInstance(
    tenantSlug: string,
    tenantId: string,
  ): Promise<WhatsAppInstance> {
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

    await this.createInstance(tenantSlug, tenantId);

    const created = await this.prisma.whatsAppInstance.findFirst({
      where: { tenantSlug },
    });

    return created as WhatsAppInstance;
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

  /** Re-create an instance on Evolution API (DB record already exists) */
  private async recreateOnEvolutionApi(
    instanceName: string,
    tenantSlug: string,
  ): Promise<void> {
    const webhookUrl = this.buildWebhookUrl(tenantSlug);

    const createResponse = await this.makeRequest<{
      instance?: { instanceName?: string };
      hash?: Record<string, string>;
    }>('/instance/create', 'POST', {
      instanceName,
      integration: 'WHATSAPP-BAILEYS',
      qrcode: true,
      webhook: {
        url: webhookUrl,
        byEvents: false,
        base64: false,
        events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE'],
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

  async deleteInstance(tenantSlug: string): Promise<void> {
    const instance = await this.prisma.whatsAppInstance.findFirst({
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
      events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE'],
    });

    await this.prisma.whatsAppInstance.updateMany({
      where: { instanceName },
      data: { webhookUrl },
    });

    this.logger.log(`Webhook configured: ${instanceName} -> ${webhookUrl}`);
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
    await this.makeRequest(`/instance/restart/${instanceName}`, 'PUT');
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
}
