import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * RedisService with optional Redis connection.
 *
 * When REDIS_URL is set → connects to Redis normally.
 * When REDIS_URL is empty/unset → runs in no-op mode (in-memory fallback).
 * This allows suspending Redis costs without breaking the application.
 *
 * To reactivate: set REDIS_URL in environment variables.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis | null = null;
  private readonly memoryStore = new Map<string, { value: string; expiresAt: number }>();

  constructor(private readonly configService: ConfigService) {
    const redisUrl = this.configService.get<string>('REDIS_URL');

    if (redisUrl) {
      this.client = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        lazyConnect: true,
      });
      this.client.connect().catch((err: Error) => {
        this.logger.error(`Redis connection failed: ${err.message}`);
      });
      this.logger.log('Redis connected');
    } else {
      this.logger.warn('REDIS_URL not set — running in memory-only mode (no cost)');
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) await this.client.quit();
  }

  async get(key: string): Promise<string | null> {
    if (this.client) return this.client.get(key);
    const entry = this.memoryStore.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) { this.memoryStore.delete(key); return null; }
    return entry.value;
  }

  async setex(key: string, ttlSeconds: number, value: string): Promise<void> {
    if (this.client) { await this.client.setex(key, ttlSeconds, value); return; }
    this.memoryStore.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  /** SET key value NX EX ttl — returns true if set (lock acquired), false if key exists */
  async setnx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    if (this.client) {
      const result = await this.client.set(key, value, 'EX', ttlSeconds, 'NX');
      return result === 'OK';
    }
    const existing = this.memoryStore.get(key);
    if (existing && Date.now() <= existing.expiresAt) return false;
    this.memoryStore.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    return true;
  }

  async del(key: string): Promise<void> {
    if (this.client) { await this.client.del(key); return; }
    this.memoryStore.delete(key);
  }
}
