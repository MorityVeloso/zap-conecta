import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';
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

  constructor(private readonly configService: ConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return false; // não lança — deixa Combined guard tentar API key
    }

    const token = authHeader.slice(7);

    const supabase = createClient(
      this.configService.getOrThrow<string>('SUPABASE_URL'),
      this.configService.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY'),
    );

    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      this.logger.warn(`Invalid JWT: ${error?.message ?? 'no user'}`);
      throw new UnauthorizedException('Token inválido ou expirado');
    }

    // Busca perfil do usuário (inclui tenantId e role)
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('tenant_id, role, tenants(slug)')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      this.logger.warn(`Profile not found for user ${user.id}`);
      throw new UnauthorizedException('Perfil de usuário não encontrado');
    }

    const tenantData = (profile.tenants as unknown as { slug: string }[] | null)?.[0] ?? null;

    request.tenantContext = {
      userId: user.id,
      email: user.email ?? '',
      tenantId: profile.tenant_id as string,
      tenantSlug: tenantData?.slug ?? '',
      role: profile.role as string,
    };

    return true;
  }
}
