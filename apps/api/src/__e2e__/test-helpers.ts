/**
 * Shared E2E test helpers.
 * Provides mock factories, tenant fixtures, and auth helpers for supertest.
 */
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import * as request from 'supertest';
import { vi } from 'vitest';

import { PrismaService } from '../prisma/prisma.service';
import { ZodExceptionFilter } from '../common/filters/zod-exception.filter';
import { FakeCombinedAuthGuard } from './fake-guards';
import type { TenantContext } from '../auth/supabase-jwt.guard';

// ── Tenant fixtures ─────────────────────────────────────────

export const TENANT_A: TenantContext = {
  userId: 'user-a',
  email: 'user-a@acme.com',
  tenantId: 'tenant-a',
  tenantSlug: 'acme',
  role: 'OWNER',
};

export const TENANT_B: TenantContext = {
  userId: 'user-b',
  email: 'user-b@other.com',
  tenantId: 'tenant-b',
  tenantSlug: 'other',
  role: 'OWNER',
};

// ── Auth helpers for supertest ──────────────────────────────

export function withAuth(
  req: request.Test,
  tenant: TenantContext = TENANT_A,
): request.Test {
  return req.set('x-test-tenant', JSON.stringify(tenant));
}

// ── Prisma mock factory ─────────────────────────────────────

export interface PrismaMock {
  webhook: {
    findMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
  apiKey: {
    findMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
  tenant: {
    findUnique: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  plan: {
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
  };
  profile: {
    create: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
  };
  scheduledMessage: {
    findMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  message: {
    findMany: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
  usageRecord: {
    findUnique: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
  };
  whatsAppInstance: {
    findUnique: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  subscription: {
    findUnique: ReturnType<typeof vi.fn>;
  };
  $executeRawUnsafe: ReturnType<typeof vi.fn>;
}

export function makePrismaMock(): PrismaMock {
  return {
    webhook: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    },
    apiKey: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    },
    tenant: {
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      update: vi.fn(),
    },
    plan: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
    profile: {
      create: vi.fn(),
      findUnique: vi.fn().mockResolvedValue(null),
    },
    scheduledMessage: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      update: vi.fn(),
    },
    message: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    usageRecord: {
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      upsert: vi.fn(),
    },
    whatsAppInstance: {
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    subscription: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    $executeRawUnsafe: vi.fn(),
  };
}

// ── App factory ─────────────────────────────────────────────

interface CreateTestAppOptions {
  controllers: unknown[];
  providers: unknown[];
}

export async function createTestApp(
  prismaMock: PrismaMock,
  options: CreateTestAppOptions,
): Promise<{ app: INestApplication; request: request.SuperTest<request.Test> }> {
  const moduleRef = await Test.createTestingModule({
    imports: [ConfigModule.forRoot({ isGlobal: true })],
    controllers: options.controllers as [],
    providers: [
      ...options.providers as [],
      { provide: PrismaService, useValue: prismaMock },
    ],
  }).compile();

  const app = moduleRef.createNestApplication();
  const reflector = moduleRef.get(Reflector);
  app.useGlobalGuards(new FakeCombinedAuthGuard(reflector));
  app.useGlobalFilters(new ZodExceptionFilter());
  await app.init();

  return {
    app,
    request: request.default(app.getHttpServer()),
  };
}
