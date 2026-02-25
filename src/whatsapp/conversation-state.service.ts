/**
 * Conversation State Service
 * Redis-based state machine for WhatsApp conversation flows
 */

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export type ConversationStateName =
  | 'IDLE'
  | 'AWAITING_QUANTITY'
  | 'AWAITING_DUPLICATE_ACTION';

export interface ConversationData {
  state: ConversationStateName;
  cycleId?: string;
  tenantSlug?: string;
  pendingQuantity?: number;
  existingOrderId?: string;
  existingQuantity?: number;
  timestamp: number;
}

const STATE_TTL_SECONDS = 3600; // 1 hour
const KEY_PREFIX = 'whatsapp:conv';

@Injectable()
export class ConversationStateService implements OnModuleDestroy {
  private readonly logger = new Logger(ConversationStateService.name);
  private readonly redis: Redis;

  constructor(private readonly configService: ConfigService) {
    const redisUrl = this.configService.get<string>('REDIS_URL');

    if (redisUrl) {
      this.redis = new Redis(redisUrl, { maxRetriesPerRequest: 3 });
    } else {
      this.redis = new Redis({
        host: this.configService.get<string>('REDIS_HOST', 'localhost'),
        port: this.configService.get<number>('REDIS_PORT', 6379),
        maxRetriesPerRequest: 3,
      });
    }

    this.redis.on('error', (err) => {
      this.logger.error('Redis connection error', err.message);
    });
  }

  onModuleDestroy(): void {
    this.redis.disconnect();
  }

  private getKey(tenantSlug: string, phone: string): string {
    return `${KEY_PREFIX}:${tenantSlug}:${phone}`;
  }

  async getState(tenantSlug: string, phone: string): Promise<ConversationData | null> {
    const key = this.getKey(tenantSlug, phone);
    const data = await this.redis.get(key);

    if (!data) return null;

    try {
      return JSON.parse(data) as ConversationData;
    } catch {
      this.logger.warn(`Invalid conversation state data for ${key}`);
      await this.redis.del(key);
      return null;
    }
  }

  async setState(tenantSlug: string, phone: string, data: ConversationData): Promise<void> {
    const key = this.getKey(tenantSlug, phone);
    await this.redis.setex(key, STATE_TTL_SECONDS, JSON.stringify(data));
    this.logger.debug(`State set: ${key} → ${data.state}`);
  }

  async clearState(tenantSlug: string, phone: string): Promise<void> {
    const key = this.getKey(tenantSlug, phone);
    await this.redis.del(key);
    this.logger.debug(`State cleared: ${key}`);
  }
}
