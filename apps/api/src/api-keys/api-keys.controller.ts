import {
  Controller,
  Get,
  Post,
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
import { ApiKeysService } from './api-keys.service';

const CreateApiKeySchema = z.object({
  name: z.string().min(1).max(100),
});

@ApiTags('API Keys')
@ApiSecurity('x-api-key')
@Controller('api-keys')
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new API key (value shown only once)' })
  @ApiResponse({ status: 201, description: 'API key created — store the plainKey now' })
  async create(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: unknown,
  ) {
    const { name } = CreateApiKeySchema.parse(body);
    return this.apiKeysService.create(tenant.tenantId, name, tenant.userId);
  }

  @Get()
  @ApiOperation({ summary: 'List all API keys for the current tenant' })
  @ApiResponse({ status: 200, description: 'API keys listed (no plain values)' })
  async list(
    @CurrentTenant() tenant: TenantContext,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.apiKeysService.list(
      tenant.tenantId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke an API key' })
  @ApiResponse({ status: 204, description: 'API key revoked' })
  async revoke(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') keyId: string,
  ): Promise<void> {
    await this.apiKeysService.revoke(tenant.tenantId, keyId);
  }
}
