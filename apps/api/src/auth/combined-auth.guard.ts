import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from './public.decorator';
import { SupabaseJwtGuard } from './supabase-jwt.guard';
import { TenantApiKeyGuard } from './tenant-api-key.guard';

/**
 * Guard principal da aplicação.
 * Ordem: @Public() → skip | JWT Bearer → API Key → 401
 */
@Injectable()
export class CombinedAuthGuard implements CanActivate {
  private readonly logger = new Logger(CombinedAuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly jwtGuard: SupabaseJwtGuard,
    private readonly apiKeyGuard: TenantApiKeyGuard,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 1. Rota pública → bypass
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();

    // 2. Tenta JWT Bearer (dashboard web)
    if (request.headers.authorization?.startsWith('Bearer ')) {
      const ok = await this.jwtGuard.canActivate(context);
      if (ok) return true;
    }

    // 3. Tenta API Key (developers)
    if (request.headers['x-api-key']) {
      const ok = await this.apiKeyGuard.canActivate(context);
      if (ok) return true;
    }

    this.logger.debug(`Unauthorized request to ${request.url}`);
    throw new UnauthorizedException(
      'Autenticação necessária. Forneça um Bearer token ou x-api-key.',
    );
  }
}
