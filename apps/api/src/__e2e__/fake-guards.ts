/**
 * Fake guards for E2E testing.
 * FakeCombinedAuthGuard reads `x-test-tenant` header to populate tenantContext,
 * respects @Public() decorator, and throws 401 when no auth is provided.
 */
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../auth/public.decorator';
import type { TenantContext } from '../auth/supabase-jwt.guard';

@Injectable()
export class FakeCombinedAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const tenantHeader = request.headers['x-test-tenant'] as string | undefined;

    if (!tenantHeader) {
      throw new UnauthorizedException(
        'Autenticação necessária. Forneça um Bearer token ou x-api-key.',
      );
    }

    request.tenantContext = JSON.parse(tenantHeader) as TenantContext;
    return true;
  }
}
