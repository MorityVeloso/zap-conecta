import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
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
  type ChangePlanDto,
  type AsaasWebhookPayload,
} from './billing.service';
import { UsageService } from './usage.service';

@ApiTags('Billing')
@ApiSecurity('x-api-key')
@Controller('billing')
export class BillingController {
  private readonly logger = new Logger(BillingController.name);

  constructor(
    private readonly billingService: BillingService,
    private readonly usageService: UsageService,
    private readonly config: ConfigService,
  ) {}

  @Get('plans')
  @ApiOperation({ summary: 'List available plans' })
  @ApiResponse({ status: 200, description: 'Plans listed' })
  getPlans() {
    return this.billingService.getPlans();
  }

  @Get('usage')
  @ApiOperation({ summary: 'Get current month message usage' })
  @ApiResponse({ status: 200, description: 'Usage retrieved' })
  getUsage(@CurrentTenant() tenant: TenantContext) {
    return this.usageService.getUsage(tenant.tenantId);
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
    return this.billingService.subscribe(tenant.tenantId, {
      ...dto,
      customerEmail: tenant.email,
    });
  }

  @Patch('subscription')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change current plan' })
  @ApiResponse({ status: 200, description: 'Plan changed' })
  changePlan(@CurrentTenant() tenant: TenantContext, @Body() dto: ChangePlanDto) {
    return this.billingService.changePlan(tenant.tenantId, dto);
  }

  @Delete('subscription')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cancel current subscription' })
  @ApiResponse({ status: 204, description: 'Subscription cancelled' })
  async cancelSubscription(@CurrentTenant() tenant: TenantContext): Promise<void> {
    await this.billingService.cancelSubscription(tenant.tenantId);
  }

  @Get('payments')
  @ApiOperation({ summary: 'List recent payments from Asaas' })
  @ApiResponse({ status: 200, description: 'Payments returned' })
  getPayments(@CurrentTenant() tenant: TenantContext) {
    return this.billingService.getPayments(tenant.tenantId);
  }

  /**
   * Asaas webhook — public, validated by accessToken header.
   *
   * CRITICAL: Always returns 200 OK. Asaas penalizes non-200 responses
   * with retry storms and eventually disables the webhook endpoint.
   * Auth failures are logged but still return 200.
   */
  @Post('webhook/asaas')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Asaas payment webhook (public)' })
  @ApiResponse({ status: 200, description: 'Webhook processed' })
  async webhookAsaas(
    @Body() payload: AsaasWebhookPayload,
    @Headers('asaas-access-token') headerToken?: string,
  ): Promise<{ received: boolean }> {
    // Validate webhook token — log and return 200 even on failure (never 4xx)
    const expectedToken = this.config.get<string>('ASAAS_WEBHOOK_TOKEN');
    const receivedToken = payload.accessToken ?? headerToken;
    if (expectedToken && receivedToken !== expectedToken) {
      this.logger.warn(
        `Asaas webhook: invalid token (event=${payload.event}, ref=${payload.payment?.externalReference ?? 'none'})`,
      );
      return { received: true };
    }

    try {
      await this.billingService.handleWebhook(payload);
    } catch (err) {
      // Log but never let errors propagate to a non-200 response
      this.logger.error(
        `Asaas webhook handler error: ${err} (event=${payload.event}, ref=${payload.payment?.externalReference ?? 'none'})`,
      );
    }

    return { received: true };
  }
}
