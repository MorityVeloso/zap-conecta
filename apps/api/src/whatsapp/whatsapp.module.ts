/**
 * WhatsApp Module
 * Standalone Evolution API / Z-API integration.
 * Adapted from saas-whatsapp-b2b: removed business modules
 * (CustomersModule, OrdersModule, PaymentsModule, BuyingCyclesModule).
 */

import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { PrismaModule } from '../prisma/prisma.module';

import { ConversationStateService } from './conversation-state.service';
import { EvolutionApiClientService } from './evolution-api-client.service';
import { EvolutionInstanceService } from './evolution-instance.service';
import { WHATSAPP_CLIENT } from './whatsapp-client.interface';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppService } from './whatsapp.service';
import { ZApiClientService } from './zapi-client.service';

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [WhatsAppController],
  providers: [
    WhatsAppService,
    ZApiClientService,
    EvolutionApiClientService,
    EvolutionInstanceService,
    ConversationStateService,
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
