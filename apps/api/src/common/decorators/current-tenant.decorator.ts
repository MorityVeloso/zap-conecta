import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { TenantContext } from '../../auth/supabase-jwt.guard';

/**
 * Injeta o contexto do tenant autenticado no parâmetro do método.
 *
 * @example
 * async myMethod(@CurrentTenant() tenant: TenantContext) { ... }
 */
export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantContext => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const context = request.tenantContext;

    if (!context) {
      throw new UnauthorizedException('Contexto de tenant não encontrado');
    }

    return context;
  },
);
