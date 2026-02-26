import {
  Injectable,
  ConflictException,
  NotFoundException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import type { TenantContext } from '../auth/supabase-jwt.guard';

export const SignupDtoSchema = z.object({
  fullName: z.string().min(2).max(100),
  companyName: z.string().min(2).max(100),
  email: z.string().email(),
  password: z
    .string()
    .min(8)
    .regex(/[A-Z]/, 'Deve conter pelo menos uma letra maiúscula')
    .regex(/[0-9]/, 'Deve conter pelo menos um número'),
});

export type SignupDto = z.infer<typeof SignupDtoSchema>;

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

function uniqueSlug(base: string): string {
  const suffix = Math.random().toString(36).slice(2, 7);
  return `${base}-${suffix}`;
}

@Injectable()
export class TenantsService {
  private readonly logger = new Logger(TenantsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  private getAdminClient() {
    return createClient(
      this.configService.getOrThrow<string>('SUPABASE_URL'),
      this.configService.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
  }

  async signup(dto: SignupDto) {
    const parsed = SignupDtoSchema.safeParse(dto);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }

    const { fullName, companyName, email, password } = parsed.data;

    // Verificar se email já existe
    const existing = await this.prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count FROM auth.users WHERE email = ${email}
    `;
    if (Number(existing[0]?.count) > 0) {
      throw new ConflictException('Email já cadastrado');
    }

    // Buscar plano Free
    const freePlan = await this.prisma.plan.findUnique({
      where: { name: 'free' },
    });
    if (!freePlan) {
      throw new NotFoundException('Plano Free não encontrado. Execute as migrations.');
    }

    // Gerar slug único para o tenant
    const baseSlug = generateSlug(companyName);
    let slug = baseSlug;

    const slugExists = await this.prisma.tenant.findFirst({
      where: { slug },
    });
    if (slugExists) slug = uniqueSlug(baseSlug);

    // Criar tenant (sem userId ainda)
    const tenant = await this.prisma.tenant.create({
      data: { slug, name: companyName, planId: freePlan.id },
    });

    // Criar usuário no Supabase Auth (com tenantId nos metadados)
    const admin = this.getAdminClient();
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: false, // exige confirmação
      user_metadata: {
        tenant_id: tenant.id,
        full_name: fullName,
        role: 'OWNER',
      },
    });

    if (authError || !authData.user) {
      // Rollback: deletar tenant criado
      await this.prisma.tenant.delete({ where: { id: tenant.id } }).catch(() => void 0);
      this.logger.error(`Supabase user creation failed: ${authError?.message}`);
      throw new ConflictException(
        authError?.message ?? 'Erro ao criar usuário',
      );
    }

    // Profile é criado automaticamente pelo trigger handle_new_user()

    // Criar subscription em trial (14 dias)
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 14);

    await this.prisma.subscription.create({
      data: {
        tenantId: tenant.id,
        planId: freePlan.id,
        status: 'TRIALING',
        trialEndsAt,
      },
    });

    this.logger.log(`Tenant created: ${tenant.slug} (${tenant.id})`);

    return {
      message: 'Conta criada. Verifique seu email para ativar.',
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
    };
  }

  async getMyTenant(ctx: TenantContext) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: ctx.tenantId },
      include: {
        plan: true,
        subscription: true,
        _count: {
          select: {
            instances: true,
            apiKeys: { where: { revokedAt: null } },
          },
        },
      },
    });

    if (!tenant) throw new NotFoundException('Tenant não encontrado');

    return {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      status: tenant.status,
      plan: {
        id: tenant.plan.id,
        name: tenant.plan.name,
        displayName: tenant.plan.displayName,
        priceBrlCents: tenant.plan.priceBrlCents,
        messagesPerMonth: tenant.plan.messagesPerMonth,
        instancesLimit: tenant.plan.instancesLimit,
        apiKeysLimit: tenant.plan.apiKeysLimit,
        features: tenant.plan.features,
      },
      subscription: tenant.subscription
        ? {
            status: tenant.subscription.status,
            currentPeriodEnd: tenant.subscription.currentPeriodEnd,
            trialEndsAt: tenant.subscription.trialEndsAt,
          }
        : null,
      stats: {
        instances: tenant._count.instances,
        activeApiKeys: tenant._count.apiKeys,
      },
    };
  }

  async getUsage(ctx: TenantContext) {
    const period = new Date().toISOString().slice(0, 7); // 'YYYY-MM'

    const usage = await this.prisma.usageRecord.findFirst({
      where: { tenantId: ctx.tenantId, period },
    });

    const plan = await this.prisma.tenant
      .findUnique({ where: { id: ctx.tenantId }, select: { plan: true } })
      .then((t) => t?.plan);

    const messagesSent = usage?.messagesSent ?? 0;
    const messagesLimit = plan?.messagesPerMonth ?? 300;
    const usagePercent =
      messagesLimit === -1
        ? 0
        : Math.round((messagesSent / messagesLimit) * 100);

    return {
      period,
      messagesSent,
      messagesReceived: usage?.messagesReceived ?? 0,
      messagesLimit,
      usagePercent: Math.min(usagePercent, 100),
    };
  }

  async getDashboardStats(ctx: TenantContext) {
    const period = new Date().toISOString().slice(0, 7);

    const [usage, instances, recentMessages] = await Promise.all([
      this.prisma.usageRecord.findFirst({
        where: { tenantId: ctx.tenantId, period },
      }),
      this.prisma.whatsAppInstance.findMany({
        where: { tenantId: ctx.tenantId },
        select: { id: true, status: true },
      }),
      this.prisma.message.findMany({
        where: { tenantId: ctx.tenantId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          phone: true,
          type: true,
          direction: true,
          content: true,
          createdAt: true,
        },
      }),
    ]);

    const plan = await this.prisma.tenant
      .findUnique({ where: { id: ctx.tenantId }, select: { plan: true } })
      .then((t) => t?.plan);

    const messagesSent = usage?.messagesSent ?? 0;
    const messagesLimit = plan?.messagesPerMonth ?? 300;
    const activeInstances = instances.filter((i) => i.status === 'CONNECTED').length;

    return {
      messagesSentThisMonth: messagesSent,
      messagesReceivedThisMonth: usage?.messagesReceived ?? 0,
      activeInstances,
      totalInstances: instances.length,
      messagesLimit,
      usagePercent:
        messagesLimit === -1
          ? 0
          : Math.min(Math.round((messagesSent / messagesLimit) * 100), 100),
      recentMessages: recentMessages.map((m) => ({
        ...m,
        createdAt: m.createdAt.toISOString(),
      })),
    };
  }
}
