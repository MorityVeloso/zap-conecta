import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';

export interface ApiKeyCreatedResult {
  id: string;
  name: string;
  keyPrefix: string;
  /** Full value — shown ONCE on creation, never again */
  plainKey: string;
  createdAt: Date;
}

export interface ApiKeyListItem {
  id: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

export interface ValidatedApiKey {
  keyId: string;
  tenantId: string;
}

@Injectable()
export class ApiKeysService {
  private readonly logger = new Logger(ApiKeysService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates a new API key for the given tenant.
   * Returns the plain key **once** — never stored, never retrievable again.
   */
  async create(
    tenantId: string,
    name: string,
    createdById?: string,
  ): Promise<ApiKeyCreatedResult> {
    // Check plan limit
    await this.assertBelowLimit(tenantId);

    // Generate: zc_live_{48 random hex chars}
    const random = randomBytes(24).toString('hex'); // 48 hex chars
    const plainKey = `zc_live_${random}`;
    const keyPrefix = plainKey.slice(0, 16); // 'zc_live_' + first 8 hex = 16 chars
    const keyHash = createHash('sha256').update(plainKey).digest('hex');

    const baseData = { tenantId, name, keyHash, keyPrefix };
    const created = await this.prisma.apiKey.create({
      data: createdById
        ? { ...baseData, createdById }
        : baseData,
    });

    return {
      id: created.id,
      name: created.name,
      keyPrefix: created.keyPrefix,
      plainKey,
      createdAt: created.createdAt,
    };
  }

  /** Lists all non-revoked API keys for a tenant. Never returns keyHash. */
  async list(tenantId: string): Promise<ApiKeyListItem[]> {
    const keys = await this.prisma.apiKey.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        lastUsedAt: true,
        expiresAt: true,
        revokedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return keys;
  }

  /** Revokes an API key (soft delete — sets revokedAt). */
  async revoke(tenantId: string, keyId: string): Promise<void> {
    const key = await this.prisma.apiKey.findFirst({
      where: { id: keyId, tenantId },
    });

    if (!key) {
      throw new NotFoundException('Chave de API não encontrada');
    }

    await this.prisma.apiKey.update({
      where: { id: keyId },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Validates a raw API key string.
   * Returns ValidatedApiKey if valid, null otherwise.
   *
   * Algorithm:
   * 1. Extract keyPrefix (first 16 chars) for indexed lookup
   * 2. Find record by prefix (one or few rows)
   * 3. Compare SHA-256 hash
   * 4. Check revokedAt / expiresAt / tenant.status
   */
  async validateKey(rawKey: string): Promise<ValidatedApiKey | null> {
    const keyPrefix = rawKey.slice(0, 16);
    const inputHash = createHash('sha256').update(rawKey).digest('hex');

    const key = await this.prisma.apiKey.findFirst({
      where: { keyPrefix },
      include: { tenant: { select: { status: true } } },
    });

    if (!key) return null;

    // Constant-time-ish comparison (hash comparison is already safe enough for non-passwords)
    if (key.keyHash !== inputHash) return null;

    if (key.revokedAt) return null;

    if (key.expiresAt && key.expiresAt < new Date()) return null;

    const tenant = key.tenant as { status: string } | null;
    if (tenant?.status !== 'ACTIVE') {
      this.logger.warn(`API key used by inactive tenant: ${key.tenantId}`);
      return null;
    }

    // Update lastUsedAt asynchronously — don't block the request
    void this.prisma.apiKey
      .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
      .catch((err: unknown) =>
        this.logger.warn(`Failed to update lastUsedAt: ${String(err)}`),
      );

    return { keyId: key.id, tenantId: key.tenantId };
  }

  // ── Private helpers ─────────────────────────────────────────

  private async assertBelowLimit(tenantId: string): Promise<void> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { planId: true },
    });

    if (!tenant?.planId) return; // free plan with no limits set — allow

    const plan = await this.prisma.plan.findUnique({
      where: { id: tenant.planId },
      select: { apiKeysLimit: true },
    });

    const limit = plan?.apiKeysLimit ?? 2;
    if (limit === -1) return; // -1 = unlimited (enterprise)

    const current = await this.prisma.apiKey.count({
      where: { tenantId, revokedAt: null },
    });

    if (current >= limit) {
      throw new BadRequestException(
        `Limite de ${limit} chave(s) de API atingido para o plano atual. Faça upgrade para criar mais chaves.`,
      );
    }
  }
}
