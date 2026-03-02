import {
  Controller,
  Get,
  Post,
  Query,
  HttpCode,
  HttpStatus,
  HttpException,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiSecurity,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import type { TenantContext } from '../auth/supabase-jwt.guard';
import { EvolutionInstanceService } from './evolution-instance.service';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('WhatsApp')
@ApiSecurity('x-api-key')
@Controller('whatsapp')
export class WhatsAppConnectionController {
  private readonly logger = new Logger(WhatsAppConnectionController.name);
  private readonly qrTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

  /** Rate-limiting state (in-memory, per-process) */
  private readonly lastConnectAttempt = new Map<string, number>();
  private readonly hourlyAttempts = new Map<string, { count: number; resetAt: number }>();

  private static readonly QR_TIMEOUT_MS = 60_000;       // 1 min
  private static readonly COOLDOWN_MS = 30_000;          // 30s between attempts
  private static readonly MAX_ATTEMPTS_PER_WINDOW = 5;
  private static readonly WINDOW_MS = 10 * 60_000;      // 10 min

  constructor(
    private readonly evolutionInstanceService: EvolutionInstanceService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('status')
  @ApiOperation({ summary: 'Get WhatsApp connection status' })
  @ApiResponse({ status: 200, description: 'Connection status retrieved' })
  async getStatus(
    @CurrentTenant() tenant: TenantContext,
    @Query('instanceId') instanceId?: string,
  ) {
    const instance = instanceId
      ? await this.evolutionInstanceService.findById(instanceId)
      : await this.evolutionInstanceService.findByTenant(tenant.tenantSlug);

    if (!instance) {
      return { status: 'DISCONNECTED' as const, instanceConfigured: false };
    }

    const connectionStatus = await this.evolutionInstanceService.getConnectionStatusForInstance(instance.instanceName);

    if (connectionStatus.connected) {
      this.clearQrTimeout(instance.instanceName);
      // Sync DB status if stale
      if (instance.status !== 'CONNECTED') {
        await this.prisma.whatsAppInstance.update({
          where: { id: instance.id },
          data: { status: 'CONNECTED', phone: connectionStatus.phone ?? instance.phone },
        });
      }
      return { status: 'CONNECTED' as const, phone: connectionStatus.phone, instanceConfigured: true, instanceId: instance.id };
    }

    try {
      const qrData = await this.evolutionInstanceService.getQrCodeForInstance(instance.instanceName);
      if (qrData.imageBase64 ?? qrData.qrcode) {
        return { status: 'QR_CODE' as const, qrCode: qrData.imageBase64 ?? qrData.qrcode, instanceConfigured: true, instanceId: instance.id };
      }
    } catch {
      // QR not available yet
    }

    return { status: 'DISCONNECTED' as const, instanceConfigured: true, instanceId: instance.id };
  }

  @Get('qr-code')
  @ApiOperation({ summary: 'Get QR code for WhatsApp connection' })
  @ApiResponse({ status: 200, description: 'QR code retrieved' })
  async getQrCode(@CurrentTenant() tenant: TenantContext): Promise<{ qrcode: string; imageBase64?: string }> {
    const instance = await this.evolutionInstanceService.getInstance(tenant.tenantSlug);
    return this.evolutionInstanceService.getQrCodeForInstance(instance.instanceName);
  }

  @Post('connect')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Connect WhatsApp instance (get QR code + pairing code)' })
  @ApiResponse({ status: 200, description: 'QR code and/or pairing code returned' })
  @ApiResponse({ status: 429, description: 'Too many connection attempts' })
  async connect(
    @CurrentTenant() tenant: TenantContext,
    @Query('instanceId') instanceId?: string,
  ) {
    this.enforceRateLimit(tenant.tenantSlug);

    let instance;
    if (instanceId) {
      instance = await this.evolutionInstanceService.findById(instanceId);
      if (!instance) throw new HttpException('Instance not found', HttpStatus.NOT_FOUND);
    } else {
      instance = await this.evolutionInstanceService.getOrCreateInstance(tenant.tenantSlug, tenant.tenantId);
    }

    // Evolution API needs a moment to configure a newly created instance
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const qrData = await this.evolutionInstanceService.getConnectDataForInstance(instance.instanceName);
        if (qrData.imageBase64 ?? qrData.qrcode) {
          this.scheduleQrTimeout(instance.instanceName);
          return {
            status: 'QR_CODE' as const,
            qrCode: qrData.imageBase64 ?? qrData.qrcode,
            pairingCode: qrData.pairingCode ?? null,
          };
        }
      } catch (error) {
        this.logger.warn(`QR code attempt ${attempt + 1}/3 failed: ${String(error)}`);
      }
      await new Promise((r) => setTimeout(r, 2000));
    }

    return { status: 'DISCONNECTED' as const, error: 'Não foi possível gerar o QR code. Tente novamente.' };
  }

  @Post('disconnect')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Disconnect WhatsApp instance' })
  @ApiResponse({ status: 200, description: 'Disconnected successfully' })
  async disconnect(
    @CurrentTenant() tenant: TenantContext,
    @Query('instanceId') instanceId?: string,
  ): Promise<{ success: boolean }> {
    const instance = instanceId
      ? await this.evolutionInstanceService.findById(instanceId)
      : await this.evolutionInstanceService.findByTenant(tenant.tenantSlug);
    if (!instance) throw new HttpException('Instance not found', HttpStatus.NOT_FOUND);
    this.clearQrTimeout(instance.instanceName);
    await this.evolutionInstanceService.disconnectInstance(instance.instanceName);
    return { success: true };
  }

  @Post('restart')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Restart WhatsApp instance' })
  @ApiResponse({ status: 200, description: 'Restarted successfully' })
  async restart(@CurrentTenant() tenant: TenantContext): Promise<{ success: boolean }> {
    const instance = await this.evolutionInstanceService.getInstance(tenant.tenantSlug);
    await this.evolutionInstanceService.restartInstance(instance.instanceName);
    return { success: true };
  }

  /** Enforce cooldown (30s) and window rate limit (5 per 10min) */
  private enforceRateLimit(tenantSlug: string): void {
    const now = Date.now();

    // Cooldown: reject if last attempt was <30s ago
    const lastAttempt = this.lastConnectAttempt.get(tenantSlug);
    if (lastAttempt && now - lastAttempt < WhatsAppConnectionController.COOLDOWN_MS) {
      const waitSec = Math.ceil((WhatsAppConnectionController.COOLDOWN_MS - (now - lastAttempt)) / 1000);
      throw new HttpException(
        `Aguarde ${waitSec}s antes de tentar conectar novamente.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Window limit: max 5 attempts per 10min
    const window = this.hourlyAttempts.get(tenantSlug);
    if (window && now < window.resetAt) {
      if (window.count >= WhatsAppConnectionController.MAX_ATTEMPTS_PER_WINDOW) {
        const waitMin = Math.ceil((window.resetAt - now) / 60_000);
        throw new HttpException(
          `Limite de ${WhatsAppConnectionController.MAX_ATTEMPTS_PER_WINDOW} tentativas atingido. Tente em ${waitMin} min.`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      window.count++;
    } else {
      this.hourlyAttempts.set(tenantSlug, { count: 1, resetAt: now + WhatsAppConnectionController.WINDOW_MS });
    }

    this.lastConnectAttempt.set(tenantSlug, now);
  }

  /** Auto-disconnect after QR_TIMEOUT_MS if not scanned */
  private scheduleQrTimeout(instanceName: string): void {
    this.clearQrTimeout(instanceName);
    const timer = setTimeout(async () => {
      try {
        const state = await this.evolutionInstanceService.getConnectionStatusForInstance(instanceName);
        if (!state.connected) {
          this.logger.warn(`QR timeout: disconnecting idle instance ${instanceName}`);
          await this.evolutionInstanceService.disconnectInstance(instanceName);
        }
      } catch (err) {
        this.logger.error(`QR timeout cleanup failed for ${instanceName}: ${String(err)}`);
      } finally {
        this.qrTimeouts.delete(instanceName);
      }
    }, WhatsAppConnectionController.QR_TIMEOUT_MS);
    timer.unref(); // don't block Node shutdown
    this.qrTimeouts.set(instanceName, timer);
  }

  private clearQrTimeout(instanceName: string): void {
    const existing = this.qrTimeouts.get(instanceName);
    if (existing) {
      clearTimeout(existing);
      this.qrTimeouts.delete(instanceName);
    }
  }
}
