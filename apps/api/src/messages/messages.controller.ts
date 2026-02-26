import {
  Controller,
  Get,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiSecurity, ApiQuery } from '@nestjs/swagger';
import { CurrentTenant } from '@/common/decorators/current-tenant.decorator';
import type { TenantContext } from '@/auth/supabase-jwt.guard';
import { MessagesService } from './messages.service';

@ApiTags('Messages')
@ApiSecurity('x-api-key')
@Controller('messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get()
  @ApiOperation({ summary: 'List messages for the current tenant' })
  @ApiResponse({ status: 200, description: 'Messages returned with pagination' })
  @ApiQuery({ name: 'phone', required: false })
  @ApiQuery({ name: 'direction', required: false, enum: ['INBOUND', 'OUTBOUND'] })
  @ApiQuery({ name: 'type', required: false })
  @ApiQuery({ name: 'period', required: false, description: 'YYYY-MM' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async list(
    @CurrentTenant() tenant: TenantContext,
    @Query('phone') phone?: string,
    @Query('direction') direction?: 'INBOUND' | 'OUTBOUND',
    @Query('type') type?: string,
    @Query('period') period?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.messagesService.findByTenant(tenant.tenantId, {
      phone,
      direction,
      type,
      period,
      page: page ? Number(page) : 1,
      limit: limit ? Math.min(Number(limit), 200) : 50,
    });
  }

  @Get('conversations')
  @ApiOperation({ summary: 'List conversations (latest message per phone)' })
  @ApiResponse({ status: 200, description: 'Conversation list returned' })
  async conversations(@CurrentTenant() tenant: TenantContext) {
    return this.messagesService.getConversations(tenant.tenantId);
  }
}
