import {
  Controller,
  Get,
  Post,
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
  private static readonly MAX_ATTEMPTS_PER_HOUR = 5;

  constructor(
    private readonly evolutionInstanceService: EvolutionInstanceService,
  ) {}

  @Get('status')
  @ApiOperation({ summary: 'Get WhatsApp connection status' })
  @ApiResponse({ status: 200, description: 'Connection status retrieved' })
  async getStatus(@CurrentTenant() tenant: TenantContext) {
    const instance = await this.evolutionInstanceService.findByTenant(tenant.tenantSlug);

    if (!instance) {
      return { status: 'DISCONNECTED' as const, instanceConfigured: false };
    }

    const connectionStatus = await this.evolutionInstanceService.getConnectionStatusForInstance(instance.instanceName);

    if (connectionStatus.connected) {
      this.clearQrTimeout(instance.instanceName);
      return { status: 'CONNECTED' as const, phone: connectionStatus.phone, instanceConfigured: true };
    }

    try {
      const qrData = await this.evolutionInstanceService.getQrCodeForInstance(instance.instanceName);
      if (qrData.imageBase64 ?? qrData.qrcode) {
        return { status: 'QR_CODE' as const, qrCode: qrData.imageBase64 ?? qrData.qrcode, instanceConfigured: true };
      }
    } catch {
      // QR not available yet
    }

    return { status: 'DISCONNECTED' as const, instanceConfigured: true };
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
  async connect(@CurrentTenant() tenant: TenantContext) {
    this.enforceRateLimit(tenant.tenantSlug);

    const instance = await this.evolutionInstanceService.getOrCreateInstance(tenant.tenantSlug, tenant.tenantId);

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
  async disconnect(@CurrentTenant() tenant: TenantContext): Promise<{ success: boolean }> {
    const instance = await this.evolutionInstanceService.getInstance(tenant.tenantSlug);
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

  /** Enforce cooldown (30s) and hourly rate limit (5/hour) */
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

    // Hourly limit: max 5 attempts per rolling hour
    const hourly = this.hourlyAttempts.get(tenantSlug);
    if (hourly && now < hourly.resetAt) {
      if (hourly.count >= WhatsAppConnectionController.MAX_ATTEMPTS_PER_HOUR) {
        const waitMin = Math.ceil((hourly.resetAt - now) / 60_000);
        throw new HttpException(
          `Limite de ${WhatsAppConnectionController.MAX_ATTEMPTS_PER_HOUR} tentativas por hora atingido. Tente em ${waitMin} min.`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      hourly.count++;
    } else {
      this.hourlyAttempts.set(tenantSlug, { count: 1, resetAt: now + 3_600_000 });
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
