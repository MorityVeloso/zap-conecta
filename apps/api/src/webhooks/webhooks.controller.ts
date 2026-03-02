import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiSecurity } from '@nestjs/swagger';
import { z } from 'zod';

import { CurrentTenant } from '@/common/decorators/current-tenant.decorator';
import type { TenantContext } from '@/auth/supabase-jwt.guard';
import { WebhooksService, WEBHOOK_EVENTS } from './webhooks.service';

const CreateWebhookSchema = z.object({
  url: z.string().url('URL inválida'),
  events: z
    .array(z.enum(WEBHOOK_EVENTS))
    .min(1, 'Selecione pelo menos um evento'),
});

const UpdateWebhookSchema = z.object({
  url: z.string().url('URL inválida').optional(),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1).optional(),
  isActive: z.boolean().optional(),
}).strict();

@ApiTags('Webhooks')
@ApiSecurity('x-api-key')
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Get()
  @ApiOperation({ summary: 'List webhooks for the current tenant' })
  @ApiResponse({ status: 200 })
  list(
    @CurrentTenant() tenant: TenantContext,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.webhooksService.list(
      tenant.tenantId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Post()
  @ApiOperation({ summary: 'Create a webhook (secret shown only once)' })
  @ApiResponse({ status: 201 })
  create(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: unknown,
  ) {
    const { url, events } = CreateWebhookSchema.parse(body);
    return this.webhooksService.create(tenant.tenantId, url, events);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update webhook (url, events, isActive); empty body = toggle active' })
  @ApiResponse({ status: 200 })
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const dto = body && typeof body === 'object' && Object.keys(body).length > 0
      ? UpdateWebhookSchema.parse(body)
      : {};
    return this.webhooksService.update(tenant.tenantId, id, dto);
  }

  @Post(':id/test')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send a test ping to the webhook URL' })
  @ApiResponse({ status: 200 })
  test(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.webhooksService.test(tenant.tenantId, id);
  }

  @Get(':id/logs')
  @ApiOperation({ summary: 'Get delivery logs for a webhook' })
  @ApiResponse({ status: 200 })
  getLogs(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Query('limit') limit?: string,
  ) {
    return this.webhooksService.getLogs(tenant.tenantId, id, limit ? parseInt(limit, 10) : 20);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a webhook' })
  @ApiResponse({ status: 204 })
  async remove(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ): Promise<void> {
    await this.webhooksService.delete(tenant.tenantId, id);
  }
}
