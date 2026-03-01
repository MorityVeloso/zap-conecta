import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import {
  QUEUE_WEBHOOK_DELIVERY,
  QUEUE_SCHEDULED_MESSAGES,
  QUEUE_BULK_SEND,
} from './queue.constants';

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redisUrl = config.get<string>('REDIS_URL', 'redis://localhost:6379');
        const url = new URL(redisUrl);
        const useTls = url.protocol === 'rediss:';
        return {
          connection: {
            host: url.hostname,
            port: Number(url.port) || 6379,
            password: url.password || undefined,
            username: url.username || undefined,
            tls: useTls ? {} : undefined,
          },
        };
      },
    }),
    BullModule.registerQueue(
      { name: QUEUE_WEBHOOK_DELIVERY },
      { name: QUEUE_SCHEDULED_MESSAGES },
      { name: QUEUE_BULK_SEND },
    ),
  ],
  exports: [BullModule],
})
export class QueueModule {}
