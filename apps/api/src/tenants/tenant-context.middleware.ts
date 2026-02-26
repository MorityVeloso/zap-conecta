import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { PrismaService } from '@/prisma/prisma.service';

/**
 * Sets PostgreSQL session variable `app.current_tenant_id` for every request.
 * Supabase RLS policies that use `current_setting('app.current_tenant_id')`
 * will automatically scope queries to the authenticated tenant.
 *
 * This middleware must run AFTER the auth guard has populated request.tenantContext.
 * It is registered in AppModule for all routes.
 */
@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantContextMiddleware.name);

  constructor(private readonly prisma: PrismaService) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const tenantId = req.tenantContext?.tenantId;

    if (tenantId) {
      try {
        // Set PostgreSQL session variable for RLS. Prisma runs this as a
        // raw query in the same connection pool slot. The variable is
        // session-scoped, meaning it resets when the connection is returned.
        await this.prisma.$executeRawUnsafe(
          `SELECT set_config('app.current_tenant_id', $1, true)`,
          tenantId,
        );
      } catch (err) {
        // Non-fatal: log and continue — worst case RLS falls back to user-level policy
        this.logger.warn(`Failed to set tenant context for ${tenantId}: ${String(err)}`);
      }
    }

    next();
  }
}
