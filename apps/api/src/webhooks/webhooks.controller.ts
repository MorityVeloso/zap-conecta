import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
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

@ApiTags('Webhooks')
@ApiSecurity('x-api-key')
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Get()
  @ApiOperation({ summary: 'List webhooks for the current tenant' })
  @ApiResponse({ status: 200 })
  list(@CurrentTenant() tenant: TenantContext) {
    return this.webhooksService.list(tenant.tenantId);
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
  @ApiOperation({ summary: 'Toggle webhook active/inactive' })
  @ApiResponse({ status: 200 })
  toggle(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.webhooksService.toggleActive(tenant.tenantId, id);
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
