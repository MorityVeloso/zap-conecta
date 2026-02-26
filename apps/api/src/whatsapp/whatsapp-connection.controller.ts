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
import { WhatsAppService } from './whatsapp.service';

@ApiTags('WhatsApp')
@ApiSecurity('x-api-key')
@Controller('whatsapp')
export class WhatsAppConnectionController {
  private readonly logger = new Logger(WhatsAppConnectionController.name);

  constructor(
    private readonly whatsAppService: WhatsAppService,
    private readonly evolutionInstanceService: EvolutionInstanceService,
  ) {}

  @Get('status')
  @ApiOperation({ summary: 'Get WhatsApp connection status' })
  @ApiResponse({ status: 200, description: 'Connection status retrieved' })
  async getStatus() {
    const connectionStatus = await this.whatsAppService.getConnectionStatus();

    if (connectionStatus.connected) {
      return { status: 'CONNECTED' as const, phone: connectionStatus.phone, instanceConfigured: true };
    }

    if (connectionStatus.instanceConfigured) {
      try {
        const qrData = await this.whatsAppService.getQrCode();
        if (qrData.imageBase64 ?? qrData.qrcode) {
          return { status: 'QR_CODE' as const, qrCode: qrData.imageBase64 ?? qrData.qrcode, instanceConfigured: true };
        }
      } catch {
        // QR not available yet
      }
    }

    return {
      status: 'DISCONNECTED' as const,
      phone: connectionStatus.phone,
      instanceConfigured: connectionStatus.instanceConfigured,
    };
  }

  @Get('qr-code')
  @ApiOperation({ summary: 'Get QR code for WhatsApp connection' })
  @ApiResponse({ status: 200, description: 'QR code retrieved' })
  getQrCode(): Promise<{ qrcode: string; imageBase64?: string }> {
    return this.whatsAppService.getQrCode();
  }

  @Post('connect')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Connect WhatsApp instance (get QR code)' })
  @ApiResponse({ status: 200, description: 'QR code returned for scanning' })
  async connect(@CurrentTenant() tenant: TenantContext) {
    await this.evolutionInstanceService.getOrCreateInstance(tenant.tenantSlug, tenant.tenantId);

    try {
      const qrData = await this.whatsAppService.getQrCode();
      return { status: 'QR_CODE' as const, qrCode: qrData.imageBase64 ?? qrData.qrcode };
    } catch (error) {
      this.logger.warn(`Failed to get QR code: ${String(error)}`);
      return { status: 'DISCONNECTED' as const, error: 'Não foi possível gerar o QR code. Tente novamente.' };
    }
  }

  @Post('disconnect')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Disconnect WhatsApp instance' })
  @ApiResponse({ status: 200, description: 'Disconnected successfully' })
  async disconnect(): Promise<{ success: boolean }> {
    await this.whatsAppService.disconnect();
    return { success: true };
  }

  @Post('restart')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Restart WhatsApp instance' })
  @ApiResponse({ status: 200, description: 'Restarted successfully' })
  async restart(): Promise<{ success: boolean }> {
    await this.whatsAppService.restart();
    return { success: true };
  }
}
