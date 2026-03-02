import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiSecurity,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import type { TenantContext } from '../auth/supabase-jwt.guard';
import { EvolutionInstanceService } from './evolution-instance.service';

@ApiTags('WhatsApp')
@ApiSecurity('x-api-key')
@Controller('whatsapp')
export class WhatsAppInstanceController {
  constructor(private readonly evolutionInstanceService: EvolutionInstanceService) {}

  @Get('instances')
  @ApiOperation({ summary: 'List all WhatsApp instances for tenant' })
  @ApiResponse({ status: 200, description: 'Instances listed' })
  listInstances(@CurrentTenant() tenant: TenantContext) {
    return this.evolutionInstanceService.listByTenantId(tenant.tenantId);
  }

  @Post('instance/create')
  @ApiOperation({ summary: 'Create WhatsApp instance for tenant' })
  @ApiResponse({ status: 201, description: 'Instance created' })
  createInstance(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: { displayName?: string },
  ) {
    return this.evolutionInstanceService.createInstance(
      tenant.tenantSlug,
      tenant.tenantId,
      body?.displayName,
    );
  }

  @Get('instance')
  @ApiOperation({ summary: 'Get first WhatsApp instance for tenant' })
  @ApiResponse({ status: 200, description: 'Instance retrieved' })
  getInstance(@CurrentTenant() tenant: TenantContext) {
    return this.evolutionInstanceService.getInstance(tenant.tenantSlug);
  }

  @Delete('instance/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete WhatsApp instance by ID' })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiResponse({ status: 204, description: 'Instance deleted' })
  async deleteInstanceById(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ): Promise<void> {
    await this.evolutionInstanceService.deleteInstance(tenant.tenantSlug, id);
  }

  @Delete('instance')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete WhatsApp instance for tenant (legacy)' })
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
