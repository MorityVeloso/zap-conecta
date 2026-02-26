/**
 * WhatsApp Module
 * Standalone Evolution API / Z-API integration.
 * Adapted from saas-whatsapp-b2b: removed business modules
 * (CustomersModule, OrdersModule, PaymentsModule, BuyingCyclesModule).
 */

import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { PrismaModule } from '../prisma/prisma.module';
import { BillingModule } from '../billing/billing.module';

import { ConversationStateService } from './conversation-state.service';
import { EvolutionApiClientService } from './evolution-api-client.service';
import { EvolutionInstanceService } from './evolution-instance.service';
import { WebhookDispatcherService } from './webhook-dispatcher.service';
import { WHATSAPP_CLIENT } from './whatsapp-client.interface';
import { WhatsAppConnectionController } from './whatsapp-connection.controller';
import { WhatsAppInstanceController } from './whatsapp-instance.controller';
import { WhatsAppSendController } from './whatsapp-send.controller';
import { WhatsAppWebhookController } from './whatsapp-webhook.controller';
import { WhatsAppService } from './whatsapp.service';
import { ZApiClientService } from './zapi-client.service';

@Module({
  imports: [ConfigModule, PrismaModule, BillingModule],
  controllers: [
    WhatsAppConnectionController,
    WhatsAppInstanceController,
    WhatsAppSendController,
    WhatsAppWebhookController,
  ],
  providers: [
    WhatsAppService,
    ZApiClientService,
    EvolutionApiClientService,
    EvolutionInstanceService,
    ConversationStateService,
    WebhookDispatcherService,
    // Feature-flag provider: WHATSAPP_PROVIDER=zapi|evolution (default: evolution)
    {
      provide: WHATSAPP_CLIENT,
      useFactory: (
        config: ConfigService,
        evolution: EvolutionApiClientService,
        zapi: ZApiClientService,
      ) => {
        const provider = config.get<string>('WHATSAPP_PROVIDER', 'evolution');
        return provider === 'zapi' ? zapi : evolution;
      },
      inject: [ConfigService, EvolutionApiClientService, ZApiClientService],
    },
  ],
  exports: [WhatsAppService, WHATSAPP_CLIENT, EvolutionInstanceService],
})
export class WhatsAppModule {}
