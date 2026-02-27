import {
  Controller,
  Get,
  Post,
  HttpCode,
  HttpStatus,
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
  @ApiOperation({ summary: 'Connect WhatsApp instance (get QR code)' })
  @ApiResponse({ status: 200, description: 'QR code returned for scanning' })
  async connect(@CurrentTenant() tenant: TenantContext) {
    const instance = await this.evolutionInstanceService.getOrCreateInstance(tenant.tenantSlug, tenant.tenantId);

    // Evolution API needs a moment to configure a newly created instance
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const qrData = await this.evolutionInstanceService.getQrCodeForInstance(instance.instanceName);
        if (qrData.imageBase64 ?? qrData.qrcode) {
          return { status: 'QR_CODE' as const, qrCode: qrData.imageBase64 ?? qrData.qrcode };
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
}
