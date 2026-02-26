import {
  Controller,
  Get,
  Post,
  Delete,
  HttpCode,
  HttpStatus,
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
export class WhatsAppInstanceController {
  constructor(private readonly evolutionInstanceService: EvolutionInstanceService) {}

  @Post('instance/create')
  @ApiOperation({ summary: 'Create WhatsApp instance for tenant' })
  @ApiResponse({ status: 201, description: 'Instance created' })
  createInstance(@CurrentTenant() tenant: TenantContext) {
    return this.evolutionInstanceService.createInstance(tenant.tenantSlug, tenant.tenantId);
  }

  @Get('instance')
  @ApiOperation({ summary: 'Get WhatsApp instance for tenant' })
  @ApiResponse({ status: 200, description: 'Instance retrieved' })
  getInstance(@CurrentTenant() tenant: TenantContext) {
    return this.evolutionInstanceService.getInstance(tenant.tenantSlug);
  }

  @Delete('instance')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete WhatsApp instance for tenant' })
  @ApiResponse({ status: 204, description: 'Instance deleted' })
  async deleteInstance(@CurrentTenant() tenant: TenantContext): Promise<void> {
    await this.evolutionInstanceService.deleteInstance(tenant.tenantSlug);
  }

  @Post('instance/sync-status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sync WhatsApp instance connection status' })
  @ApiResponse({ status: 200, description: 'Status synced' })
  async syncInstanceStatus(@CurrentTenant() tenant: TenantContext) {
    const status = await this.evolutionInstanceService.syncStatus(tenant.tenantSlug);
    return { status };
  }
}
