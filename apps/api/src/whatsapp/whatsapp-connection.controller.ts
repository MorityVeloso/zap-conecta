import {
  Controller,
  Get,
  Post,
  Sse,
  Query,
  HttpCode,
  HttpStatus,
  HttpException,
  Logger,
  MessageEvent,
} from '@nestjs/common';
import {
  ApiTags,
  ApiSecurity,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Observable } from 'rxjs';
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
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Get('status')
  @ApiOperation({ summary: 'Get WhatsApp connection status' })
  @ApiResponse({ status: 200, description: 'Connection status retrieved' })
  async getStatus(
    @CurrentTenant() tenant: TenantContext,
    @Query('instanceId') instanceId?: string,
  ) {
    const t0 = Date.now();

    // Fast path: read from DB (kept in sync by webhooks)
    const instance = instanceId
      ? await this.prisma.whatsAppInstance.findUnique({ where: { id: instanceId } })
      : await this.prisma.whatsAppInstance.findFirst({ where: { tenantSlug: tenant.tenantSlug } });

    if (!instance) {
      return { status: 'DISCONNECTED' as const, instanceConfigured: false };
    }

    // ── Always verify with Evolution API (DB can be stale) ──────────────
    try {
      const connected = await this.evolutionInstanceService.isConnected(instance.instanceName);
      const tCheck = Date.now();
      this.logger.log(`[TIMELINE] Active check for ${instance.instanceName}: connected=${connected} (${tCheck - t0}ms)`);

      if (connected) {
        // Sync DB if needed
        if (instance.status !== 'CONNECTED') {
          await this.prisma.whatsAppInstance.update({
            where: { id: instance.id },
            data: { status: 'CONNECTED' },
          });
          this.eventEmitter.emit('whatsapp.instance.connected', {
            tenantId: instance.tenantId,
            tenantSlug: instance.tenantSlug,
            instanceId: instance.id,
          });
        }
        this.clearQrTimeout(instance.instanceName);
        return { status: 'CONNECTED' as const, phone: instance.phone, instanceConfigured: true, instanceId: instance.id };
      }

      // Evolution says NOT connected — sync DB if needed
      if (instance.status === 'CONNECTED') {
        await this.prisma.whatsAppInstance.update({
          where: { id: instance.id },
          data: { status: 'DISCONNECTED' },
        });
      }
    } catch (err) {
      this.logger.warn(`Active connection check failed for ${instance.instanceName}: ${String(err)}`);
      // Fallback to DB status if Evolution API is unreachable
      if (instance.status === 'CONNECTED') {
        return { status: 'CONNECTED' as const, phone: instance.phone, instanceConfigured: true, instanceId: instance.id };
      }
    }

    // Not connected — check if there's a pending QR code
    try {
      const qrData = await this.evolutionInstanceService.getQrCodeForInstance(instance.instanceName);
      if (qrData.imageBase64 ?? qrData.qrcode) {
        return { status: 'QR_CODE' as const, qrCode: qrData.imageBase64 ?? qrData.qrcode, instanceConfigured: true, instanceId: instance.id };
      }
    } catch {
      // QR not available
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

    // Ensure the instance exists on Evolution API (may have been lost on redeploy/delete)
    // Returns QR data if instance was just recreated (avoids extra round-trip)
    const recreatedQr = await this.evolutionInstanceService.ensureEvolutionInstance(instance.instanceName, tenant.tenantSlug);

    if (recreatedQr && (recreatedQr.imageBase64 ?? recreatedQr.qrcode)) {
      this.scheduleQrTimeout(instance.instanceName);
      return {
        status: 'QR_CODE' as const,
        qrCode: recreatedQr.imageBase64 ?? recreatedQr.qrcode,
        pairingCode: recreatedQr.pairingCode ?? null,
      };
    }

    // Instance already existed — get fresh QR code (1 attempt + 1 retry)
    for (let attempt = 0; attempt < 2; attempt++) {
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
        this.logger.warn(`QR code attempt ${attempt + 1}/2 failed: ${String(error)}`);
      }
      if (attempt === 0) await new Promise((r) => setTimeout(r, 1500));
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

  @Sse('status/stream')
  @ApiOperation({ summary: 'SSE stream for real-time connection status updates' })
  statusStream(@CurrentTenant() tenant: TenantContext): Observable<MessageEvent> {
    return new Observable((subscriber) => {
      const onConnected = (data: { tenantId: string; instanceId: string; phone?: string }) => {
        if (data.tenantId !== tenant.tenantId) return;
        subscriber.next({
          data: JSON.stringify({ status: 'CONNECTED', instanceId: data.instanceId, phone: data.phone }),
        } as MessageEvent);
      };

      const onDisconnected = (data: { tenantId: string; instanceId: string }) => {
        if (data.tenantId !== tenant.tenantId) return;
        subscriber.next({
          data: JSON.stringify({ status: 'DISCONNECTED', instanceId: data.instanceId }),
        } as MessageEvent);
      };

      const onNeedsQr = (data: { tenantId?: string; tenantSlug: string; instanceId?: string }) => {
        if (data.tenantSlug !== tenant.tenantSlug) return;
        subscriber.next({
          data: JSON.stringify({ status: 'NEEDS_QR', instanceId: data.instanceId }),
        } as MessageEvent);
      };

      const onQrUpdated = (data: { tenantId: string; tenantSlug: string; qrCode: string; pairingCode?: string }) => {
        if (data.tenantSlug !== tenant.tenantSlug) return;
        subscriber.next({
          data: JSON.stringify({ status: 'QR_CODE', qrCode: data.qrCode, pairingCode: data.pairingCode }),
        } as MessageEvent);
      };

      this.eventEmitter.on('whatsapp.instance.connected', onConnected);
      this.eventEmitter.on('whatsapp.instance.disconnected', onDisconnected);
      this.eventEmitter.on('whatsapp.instance.needs_qr', onNeedsQr);
      this.eventEmitter.on('whatsapp.instance.qr_updated', onQrUpdated);

      // Keep-alive every 30s to prevent proxy/LB timeouts
      const keepAlive = setInterval(() => {
        subscriber.next({ data: JSON.stringify({ type: 'ping' }) } as MessageEvent);
      }, 30_000);

      return () => {
        this.eventEmitter.off('whatsapp.instance.connected', onConnected);
        this.eventEmitter.off('whatsapp.instance.disconnected', onDisconnected);
        this.eventEmitter.off('whatsapp.instance.needs_qr', onNeedsQr);
        this.eventEmitter.off('whatsapp.instance.qr_updated', onQrUpdated);
        clearInterval(keepAlive);
      };
    });
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
          try {
            await this.evolutionInstanceService.disconnectInstance(instanceName);
          } catch {
            // Instance may already be disconnected — safe to ignore
            this.logger.log(`QR timeout: instance ${instanceName} already disconnected`);
          }
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
