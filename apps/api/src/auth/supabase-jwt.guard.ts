import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Request } from 'express';

export interface SupabaseUser {
  id: string;
  email: string;
}

export interface TenantContext {
  userId: string;
  email: string;
  tenantId: string;
  tenantSlug: string;
  role: string;
}

declare module 'express' {
  interface Request {
    tenantContext?: TenantContext;
  }
}

@Injectable()
export class SupabaseJwtGuard implements CanActivate {
  private readonly logger = new Logger(SupabaseJwtGuard.name);
  private readonly supabase: SupabaseClient;

  /** Token → TenantContext cache (avoids 2 Supabase round-trips per request) */
  private authCache = new Map<string, { context: TenantContext; ts: number }>();
  private static readonly AUTH_CACHE_TTL_MS = 60_000; // 60s
  private static readonly AUTH_CACHE_MAX_SIZE = 500;

  constructor(private readonly configService: ConfigService) {
    this.supabase = createClient(
      this.configService.getOrThrow<string>('SUPABASE_URL'),
      this.configService.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY'),
    );
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return false; // não lança — deixa Combined guard tentar API key
    }

    const token = authHeader.slice(7);

    // Fast path: return cached TenantContext (avoids getUser + profile query)
    const cached = this.authCache.get(token);
    if (cached && Date.now() - cached.ts < SupabaseJwtGuard.AUTH_CACHE_TTL_MS) {
      request.tenantContext = cached.context;
      return true;
    }

    const supabase = this.supabase;

    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      this.authCache.delete(token); // evict stale entry
      this.logger.warn(`Invalid JWT: ${error?.message ?? 'no user'}`);
      throw new UnauthorizedException('Token inválido ou expirado');
    }

    // Busca perfil do usuário (inclui tenantId e role)
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('tenantId, role, tenants(slug)')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      this.logger.warn(`Profile not found for user ${user.id}: ${profileError?.message}`);
      throw new UnauthorizedException('Perfil de usuário não encontrado');
    }

    const tenantData = (profile.tenants as unknown as { slug: string } | null);

    const tenantContext: TenantContext = {
      userId: user.id,
      email: user.email ?? '',
      tenantId: profile.tenantId as string,
      tenantSlug: tenantData?.slug ?? '',
      role: profile.role as string,
    };

    request.tenantContext = tenantContext;

    // Cache for subsequent requests (evict old entries if over limit)
    if (this.authCache.size >= SupabaseJwtGuard.AUTH_CACHE_MAX_SIZE) {
      this.evictExpired();
    }
    this.authCache.set(token, { context: tenantContext, ts: Date.now() });

    return true;
  }

  private evictExpired(): void {
    const now = Date.now();
    for (const [key, val] of this.authCache) {
      if (now - val.ts > SupabaseJwtGuard.AUTH_CACHE_TTL_MS) {
        this.authCache.delete(key);
      }
    }
  }
}
