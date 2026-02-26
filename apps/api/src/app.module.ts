import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { TenantContextMiddleware } from './tenants/tenant-context.middleware';

import { PrismaModule } from './prisma/prisma.module';
import { CombinedAuthGuard } from './auth/combined-auth.guard';
import { SupabaseJwtGuard } from './auth/supabase-jwt.guard';
import { TenantApiKeyGuard } from './auth/tenant-api-key.guard';
import { TenantsModule } from './tenants/tenants.module';
import { WhatsAppModule } from './whatsapp/whatsapp.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    PrismaModule,
    TenantsModule,
    WhatsAppModule,
  ],
  providers: [
    SupabaseJwtGuard,
    TenantApiKeyGuard,
    {
      provide: APP_GUARD,
      useClass: CombinedAuthGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // TenantContextMiddleware runs after guards, so tenantContext is already set.
    // It sets app.current_tenant_id in the Postgres session for RLS enforcement.
    consumer
      .apply(TenantContextMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
