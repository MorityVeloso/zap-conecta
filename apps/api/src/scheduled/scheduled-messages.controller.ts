import { Controller, Post, Get, Delete, Body, Param } from '@nestjs/common';
import { ApiTags, ApiSecurity, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import type { TenantContext } from '../auth/supabase-jwt.guard';
import { EvolutionInstanceService } from '../whatsapp/evolution-instance.service';
import { ScheduledMessagesService } from './scheduled-messages.service';
import type { ScheduleMessageDto } from './scheduled-messages.dto';

@ApiTags('Scheduled Messages')
@ApiSecurity('x-api-key')
@Controller('whatsapp/scheduled')
export class ScheduledMessagesController {
  constructor(
    private readonly scheduledService: ScheduledMessagesService,
    private readonly evolutionInstanceService: EvolutionInstanceService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Schedule a message for future delivery' })
  @ApiResponse({ status: 201, description: 'Message scheduled' })
  async schedule(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: ScheduleMessageDto,
  ) {
    const instance = await this.evolutionInstanceService.findByTenant(tenant.tenantSlug);
    const instanceId = instance?.id ?? tenant.tenantSlug;
    return this.scheduledService.schedule(tenant.tenantId, instanceId, tenant.tenantSlug, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List scheduled messages' })
  @ApiResponse({ status: 200, description: 'Scheduled messages listed' })
  async list(@CurrentTenant() tenant: TenantContext) {
    return this.scheduledService.list(tenant.tenantId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Cancel a pending scheduled message' })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiResponse({ status: 200, description: 'Message cancelled' })
  async cancel(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.scheduledService.cancel(tenant.tenantId, id);
  }
}
