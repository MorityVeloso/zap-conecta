import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Logger,
} from '@nestjs/common';
import { createHash } from 'crypto';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import type { TenantContext } from './supabase-jwt.guard';

@Injectable()
export class TenantApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(TenantApiKeyGuard.name);

  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    const rawKey = request.headers['x-api-key'];
    if (!rawKey || typeof rawKey !== 'string') {
      return false; // sem API key — deixa Combined guard decidir
    }

    // Extrai prefixo (primeiros 16 chars) para busca indexada
    const prefix = rawKey.slice(0, 16);
    const keyHash = createHash('sha256').update(rawKey).digest('hex');

    const apiKey = await this.prisma.apiKey.findFirst({
      where: {
        keyPrefix: prefix,
        keyHash,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      include: {
        tenant: {
          include: { plan: true },
        },
      },
    });

    if (!apiKey) {
      return false;
    }

    if (apiKey.tenant.status !== 'ACTIVE') {
      this.logger.warn(
        `API key used by inactive tenant: ${apiKey.tenant.slug}`,
      );
      return false;
    }

    // Atualiza lastUsedAt de forma assíncrona (não bloqueia request)
    void this.prisma.apiKey
      .update({
        where: { id: apiKey.id },
        data: { lastUsedAt: new Date() },
      })
      .catch(() => void 0); // ignorar falha silenciosa

    const context_: TenantContext = {
      userId: apiKey.createdById,
      email: '',
      tenantId: apiKey.tenantId,
      tenantSlug: apiKey.tenant.slug,
      role: 'OWNER',
    };

    request.tenantContext = context_;

    return true;
  }
}
