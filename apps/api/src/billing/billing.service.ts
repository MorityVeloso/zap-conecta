/**
 * BillingService — Gerencia assinaturas recorrentes via Asaas.
 *
 * Fluxo de assinatura:
 *  1. Criar customer no Asaas (ou reusar asaasCustomerId existente)
 *  2. Criar subscription no Asaas com externalReference = tenantId
 *  3. Upsert subscription no DB + atualizar tenant.planId
 *  4. Webhook confirma pagamento → ACTIVE
 */

import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Plan, Subscription } from '@prisma/client';
import { SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';

// ── Asaas types ──────────────────────────────────────────────────────────────

export type AsaasBillingType = 'PIX' | 'CREDIT_CARD' | 'BOLETO';

interface AsaasCustomerResponse {
  id: string;
  name: string;
  email: string;
}

interface AsaasSubscriptionResponse {
  id: string;
  status: string;
  nextDueDate: string;
  value: number;
}

interface AsaasWebhookPayment {
  id: string;
  status: string;
  value: number;
  externalReference: string | null; // tenantId
  subscription?: string | null;     // Asaas subscription ID
}

export interface AsaasWebhookPayload {
  event: string;
  accessToken?: string;
  payment?: AsaasWebhookPayment;
}

// ── DTOs ──────────────────────────────────────────────────────────────────────

export interface SubscribeDto {
  planName: string;   // 'starter' | 'pro'
  customerName: string;
  cpf: string;        // 11 dígitos sem formatação
  billingType: AsaasBillingType;
}

export interface ChangePlanDto {
  planName: string;
  billingType?: AsaasBillingType;
}

export interface SubscriptionResult {
  asaasSubscriptionId: string;
  status: string;
  nextDueDate: string;
}

// ── Constantes de webhook ────────────────────────────────────────────────────

const PAID_EVENTS = new Set([
  'PAYMENT_CONFIRMED',
  'PAYMENT_RECEIVED',
  'CHECKOUT_PAID',
]);

// ── BillingService ───────────────────────────────────────────────────────────

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  // ── Plans ─────────────────────────────────────────────────────

  async getPlans(): Promise<Plan[]> {
    return this.prisma.plan.findMany({
      where: { isActive: true },
      orderBy: { priceBrlCents: 'asc' },
    });
  }

  // ── Subscription CRUD ─────────────────────────────────────────

  async getCurrentSubscription(
    tenantId: string,
  ): Promise<{ subscription: Subscription | null; plan: Plan }> {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      include: {
        plan: true,
        subscription: true,
      },
    });

    return { subscription: tenant.subscription, plan: tenant.plan };
  }

  async subscribe(tenantId: string, dto: SubscribeDto): Promise<SubscriptionResult> {
    // 1. Validate plan exists and is paid
    const plan = await this.prisma.plan.findFirst({
      where: { name: dto.planName, isActive: true },
    });

    if (!plan) throw new NotFoundException(`Plano '${dto.planName}' não encontrado`);
    if (plan.priceBrlCents === 0) {
      throw new BadRequestException('Não é necessário assinar o plano gratuito');
    }

    // 2. Check tenant doesn't already have an active subscription
    const existing = await this.prisma.subscription.findUnique({
      where: { tenantId },
    });

    if (existing?.status === SubscriptionStatus.ACTIVE) {
      throw new ConflictException('Tenant já possui uma assinatura ativa. Cancele antes de trocar de plano.');
    }

    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      include: { profiles: { take: 1 } },
    });

    const apiKey = this.asaasApiKey();

    // 3. Create or reuse Asaas customer
    let asaasCustomerId = existing?.asaasCustomerId ?? null;
    if (!asaasCustomerId) {
      const profileEmail = `tenant+${tenant.slug}@zap-conecta.app`;
      asaasCustomerId = await this.createAsaasCustomer(
        apiKey,
        dto.customerName,
        profileEmail,
        dto.cpf,
      );
    }

    // 4. Create Asaas subscription
    const priceInBrl = plan.priceBrlCents / 100;
    const asaasSub = await this.createAsaasSubscription(
      apiKey,
      asaasCustomerId,
      tenantId,
      priceInBrl,
      plan.displayName,
      dto.billingType,
    );

    // 5. Upsert subscription in DB
    await this.prisma.subscription.upsert({
      where: { tenantId },
      create: {
        tenantId,
        planId: plan.id,
        asaasSubscriptionId: asaasSub.id,
        asaasCustomerId,
        status: SubscriptionStatus.TRIALING,
      },
      update: {
        planId: plan.id,
        asaasSubscriptionId: asaasSub.id,
        asaasCustomerId,
        status: SubscriptionStatus.TRIALING,
        cancelledAt: null,
      },
    });

    // 6. Pre-update tenant plan (will be confirmed by webhook)
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { planId: plan.id },
    });

    this.logger.log(
      `Subscription created: tenant=${tenantId} plan=${dto.planName} asaas=${asaasSub.id}`,
    );

    return {
      asaasSubscriptionId: asaasSub.id,
      status: asaasSub.status,
      nextDueDate: asaasSub.nextDueDate,
    };
  }

  async cancelSubscription(tenantId: string): Promise<void> {
    const sub = await this.prisma.subscription.findUnique({ where: { tenantId } });
    if (!sub) throw new NotFoundException('Nenhuma assinatura encontrada');

    if (sub.asaasSubscriptionId) {
      await this.deleteAsaasSubscription(this.asaasApiKey(), sub.asaasSubscriptionId);
    }

    const freePlan = await this.prisma.plan.findFirstOrThrow({
      where: { name: 'free' },
    });

    await this.prisma.$transaction([
      this.prisma.subscription.update({
        where: { tenantId },
        data: {
          status: SubscriptionStatus.CANCELLED,
          cancelledAt: new Date(),
        },
      }),
      this.prisma.tenant.update({
        where: { id: tenantId },
        data: { planId: freePlan.id },
      }),
    ]);

    this.logger.log(`Subscription cancelled: tenant=${tenantId}`);
  }

  async changePlan(tenantId: string, dto: ChangePlanDto): Promise<SubscriptionResult> {
    const plan = await this.prisma.plan.findFirst({
      where: { name: dto.planName, isActive: true },
    });
    if (!plan) throw new NotFoundException(`Plano '${dto.planName}' não encontrado`);
    if (plan.priceBrlCents === 0) throw new BadRequestException('Para fazer downgrade, cancele sua assinatura');

    const sub = await this.prisma.subscription.findUnique({ where: { tenantId } });
    if (!sub) throw new NotFoundException('Nenhuma assinatura encontrada');

    const apiKey = this.asaasApiKey();

    // Cancel existing Asaas subscription
    if (sub.asaasSubscriptionId) {
      await this.deleteAsaasSubscription(apiKey, sub.asaasSubscriptionId);
    }

    // Create new Asaas subscription (reuse existing customer)
    const customerId = sub.asaasCustomerId;
    if (!customerId) throw new BadRequestException('Dados de cobrança não encontrados. Recadastre o CPF.');

    const priceInBrl = plan.priceBrlCents / 100;
    const asaasSub = await this.createAsaasSubscription(
      apiKey,
      customerId,
      tenantId,
      priceInBrl,
      plan.displayName,
      dto.billingType ?? 'PIX',
    );

    await this.prisma.$transaction([
      this.prisma.subscription.update({
        where: { tenantId },
        data: {
          planId: plan.id,
          asaasSubscriptionId: asaasSub.id,
          status: SubscriptionStatus.TRIALING,
          cancelledAt: null,
        },
      }),
      this.prisma.tenant.update({
        where: { id: tenantId },
        data: { planId: plan.id },
      }),
    ]);

    this.logger.log(`Plan changed: tenant=${tenantId} newPlan=${dto.planName} asaas=${asaasSub.id}`);

    return { asaasSubscriptionId: asaasSub.id, status: asaasSub.status, nextDueDate: asaasSub.nextDueDate };
  }

  async getPayments(tenantId: string): Promise<unknown[]> {
    const sub = await this.prisma.subscription.findUnique({ where: { tenantId } });
    if (!sub?.asaasSubscriptionId) return [];

    const apiKey = this.asaasApiKey();
    const url = `${this.asaasBaseUrl()}/payments?subscription=${sub.asaasSubscriptionId}&limit=10`;
    const res = await fetch(url, { headers: { 'access_token': apiKey } });

    if (!res.ok) {
      this.logger.warn(`Failed to fetch Asaas payments: ${res.status}`);
      return [];
    }

    const data = await res.json() as { data?: unknown[] };
    return data.data ?? [];
  }

  // ── Webhook handler ───────────────────────────────────────────

  async handleWebhook(payload: AsaasWebhookPayload): Promise<void> {
    const { event, payment } = payload;
    this.logger.log(`Asaas webhook: event=${event}`);

    if (!payment) return;

    const tenantId = payment.externalReference;
    if (!tenantId) {
      this.logger.warn('Webhook without externalReference, skipping');
      return;
    }

    if (PAID_EVENTS.has(event)) {
      await this.handlePaymentConfirmed(tenantId, payment);
      return;
    }

    if (event === 'PAYMENT_OVERDUE') {
      await this.handlePaymentOverdue(tenantId);
      return;
    }

    if (event === 'PAYMENT_DELETED' || event === 'SUBSCRIPTION_DELETED') {
      await this.handleSubscriptionDeleted(tenantId);
      return;
    }

    this.logger.log(`Unhandled Asaas event: ${event}`);
  }

  private async handlePaymentConfirmed(
    tenantId: string,
    payment: AsaasWebhookPayment,
  ): Promise<void> {
    const sub = await this.prisma.subscription.findUnique({ where: { tenantId } });
    if (!sub) {
      this.logger.warn(`Webhook payment confirmed but no subscription for tenant=${tenantId}`);
      return;
    }

    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    await this.prisma.subscription.update({
      where: { tenantId },
      data: {
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
      },
    });

    this.logger.log(
      `Payment confirmed: tenant=${tenantId} amount=${payment.value}`,
    );
  }

  private async handlePaymentOverdue(tenantId: string): Promise<void> {
    await this.prisma.subscription.updateMany({
      where: { tenantId },
      data: { status: SubscriptionStatus.PAST_DUE },
    });
    this.logger.warn(`Payment overdue: tenant=${tenantId}`);
  }

  private async handleSubscriptionDeleted(tenantId: string): Promise<void> {
    const freePlan = await this.prisma.plan.findFirst({ where: { name: 'free' } });
    if (!freePlan) return;

    await this.prisma.$transaction([
      this.prisma.subscription.updateMany({
        where: { tenantId },
        data: { status: SubscriptionStatus.CANCELLED, cancelledAt: new Date() },
      }),
      this.prisma.tenant.update({
        where: { id: tenantId },
        data: { planId: freePlan.id },
      }),
    ]);
    this.logger.log(`Subscription deleted externally: tenant=${tenantId}`);
  }

  // ── Asaas API helpers ─────────────────────────────────────────

  private asaasApiKey(): string {
    const key = this.config.get<string>('ASAAS_API_KEY');
    if (!key) throw new Error('ASAAS_API_KEY not configured');
    return key;
  }

  private asaasBaseUrl(): string {
    const sandbox = this.config.get<string>('ASAAS_SANDBOX');
    return sandbox === 'true'
      ? 'https://sandbox.asaas.com/api/v3'
      : 'https://api.asaas.com/v3';
  }

  private async createAsaasCustomer(
    apiKey: string,
    name: string,
    email: string,
    cpfCnpj: string,
  ): Promise<string> {
    const res = await fetch(`${this.asaasBaseUrl()}/customers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'access_token': apiKey,
      },
      body: JSON.stringify({ name, email, cpfCnpj, notificationDisabled: true }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Asaas /customers ${res.status}: ${text}`);
    }

    const data = await res.json() as AsaasCustomerResponse;
    return data.id;
  }

  private async createAsaasSubscription(
    apiKey: string,
    customerId: string,
    tenantId: string,
    valueInBrl: number,
    description: string,
    billingType: AsaasBillingType,
  ): Promise<AsaasSubscriptionResponse> {
    const nextDueDate = new Date();
    nextDueDate.setDate(nextDueDate.getDate() + 1);
    const dueDateStr = nextDueDate.toISOString().slice(0, 10);

    const res = await fetch(`${this.asaasBaseUrl()}/subscriptions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'access_token': apiKey,
      },
      body: JSON.stringify({
        customer: customerId,
        billingType,
        value: valueInBrl,
        nextDueDate: dueDateStr,
        cycle: 'MONTHLY',
        description: `Zap-Conecta — Plano ${description}`,
        externalReference: tenantId,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new BadRequestException(`Asaas /subscriptions ${res.status}: ${text}`);
    }

    return res.json() as Promise<AsaasSubscriptionResponse>;
  }

  private async deleteAsaasSubscription(
    apiKey: string,
    subscriptionId: string,
  ): Promise<void> {
    const res = await fetch(
      `${this.asaasBaseUrl()}/subscriptions/${subscriptionId}`,
      { method: 'DELETE', headers: { 'access_token': apiKey } },
    );

    if (!res.ok && res.status !== 404) {
      this.logger.warn(
        `Failed to delete Asaas subscription ${subscriptionId}: ${res.status}`,
      );
    }
  }
}
