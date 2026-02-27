import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '../prisma/prisma.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { QUEUE_SCHEDULED_MESSAGES } from '../queue/queue.constants';
import { ScheduledMessagesController } from './scheduled-messages.controller';
import { ScheduledMessagesService } from './scheduled-messages.service';
import { ScheduledMessagesProcessor } from './scheduled-messages.processor';

@Module({
  imports: [
    PrismaModule,
    WhatsAppModule,
    BullModule.registerQueue({ name: QUEUE_SCHEDULED_MESSAGES }),
  ],
  controllers: [ScheduledMessagesController],
  providers: [ScheduledMessagesService, ScheduledMessagesProcessor],
})
export class ScheduledMessagesModule {}
