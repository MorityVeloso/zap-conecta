import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiTags,
  ApiSecurity,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import type { TenantContext } from '../auth/supabase-jwt.guard';
import {
  BillingService,
  type SubscribeDto,
  type AsaasWebhookPayload,
} from './billing.service';

@ApiTags('Billing')
@ApiSecurity('x-api-key')
@Controller('billing')
export class BillingController {
  private readonly logger = new Logger(BillingController.name);

  constructor(
    private readonly billingService: BillingService,
    private readonly config: ConfigService,
  ) {}

  @Get('plans')
  @ApiOperation({ summary: 'List available plans' })
  @ApiResponse({ status: 200, description: 'Plans listed' })
  getPlans() {
    return this.billingService.getPlans();
  }

  @Get('subscription')
  @ApiOperation({ summary: 'Get current tenant subscription' })
  @ApiResponse({ status: 200, description: 'Subscription retrieved' })
  getSubscription(@CurrentTenant() tenant: TenantContext) {
    return this.billingService.getCurrentSubscription(tenant.tenantId);
  }

  @Post('subscribe')
  @ApiOperation({ summary: 'Subscribe to a plan' })
  @ApiResponse({ status: 201, description: 'Subscription created' })
  subscribe(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: SubscribeDto,
  ) {
    return this.billingService.subscribe(tenant.tenantId, dto);
  }

  @Delete('subscription')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cancel current subscription' })
  @ApiResponse({ status: 204, description: 'Subscription cancelled' })
  async cancelSubscription(@CurrentTenant() tenant: TenantContext): Promise<void> {
    await this.billingService.cancelSubscription(tenant.tenantId);
  }

  /**
   * Asaas webhook — public, validated by accessToken header.
   * Configure in Asaas: Configurações → Integrações → Webhooks → URL
   */
  @Post('webhook/asaas')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Asaas payment webhook (public)' })
  @ApiResponse({ status: 200, description: 'Webhook processed' })
  async webhookAsaas(
    @Body() payload: AsaasWebhookPayload,
  ): Promise<{ received: boolean }> {
    // Validate webhook token
    const expectedToken = this.config.get<string>('ASAAS_WEBHOOK_TOKEN');
    if (expectedToken && payload.accessToken !== expectedToken) {
      this.logger.warn('Asaas webhook: invalid accessToken');
      throw new UnauthorizedException('Invalid webhook token');
    }

    await this.billingService.handleWebhook(payload);
    return { received: true };
  }
}
