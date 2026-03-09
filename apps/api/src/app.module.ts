import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { TenantContextMiddleware } from './tenants/tenant-context.middleware';
import { HttpLoggingInterceptor } from './common/interceptors/http-logging.interceptor';

import { PrismaModule } from './prisma/prisma.module';
import { CombinedAuthGuard } from './auth/combined-auth.guard';
import { SupabaseJwtGuard } from './auth/supabase-jwt.guard';
import { TenantApiKeyGuard } from './auth/tenant-api-key.guard';
import { TenantsModule } from './tenants/tenants.module';
import { ApiKeysModule } from './api-keys/api-keys.module';
import { MessagesModule } from './messages/messages.module';
import { BillingModule } from './billing/billing.module';
import { WhatsAppModule } from './whatsapp/whatsapp.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { ScheduledMessagesModule } from './scheduled/scheduled-messages.module';
import { QueueModule } from './queue/queue.module';
import { RedisModule } from './common/redis/redis.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    // Rate limiting: 200 requests per 60 seconds per IP (in-memory)
    ThrottlerModule.forRoot([{
      name: 'global',
      ttl: 60_000,
      limit: 200,
    }]),
    EventEmitterModule.forRoot({ wildcard: false, maxListeners: 20 }),
    QueueModule,
    RedisModule,
    PrismaModule,
    TenantsModule,
    ApiKeysModule,
    MessagesModule,
    BillingModule,
    WebhooksModule,
    ScheduledMessagesModule,
    WhatsAppModule,
  ],
  providers: [
    SupabaseJwtGuard,
    TenantApiKeyGuard,
    {
      provide: APP_GUARD,
      useClass: CombinedAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpLoggingInterceptor,
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
