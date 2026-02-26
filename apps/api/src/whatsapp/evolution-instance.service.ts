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
  private readonly apiBaseUrl: string;

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
    this.apiBaseUrl = this.configService.get<string>(
      'API_BASE_URL',
      'http://localhost:3000',
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
      throw new Error(
        `Evolution API request failed: ${String(response.status)}`,
      );
    }

    const text = await response.text();
    if (!text) return {} as T;
    return JSON.parse(text) as T;
  }

  buildInstanceName(tenantSlug: string): string {
    return `tenant-${tenantSlug}`;
  }

  buildWebhookUrl(tenantSlug: string): string {
    return `${this.apiBaseUrl}/whatsapp/webhook/receive/${tenantSlug}`;
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

    if (existing) return existing as WhatsAppInstance;

    await this.createInstance(tenantSlug, tenantId);

    const created = await this.prisma.whatsAppInstance.findFirst({
      where: { tenantSlug },
    });

    return created as WhatsAppInstance;
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
