import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EvolutionInstanceService } from './evolution-instance.service';
import { RedisService } from '../common/redis/redis.service';

@Injectable()
export class WhatsAppReconnectService {
  private readonly logger = new Logger(WhatsAppReconnectService.name);
  private static readonly MAX_ATTEMPTS = 3;
  private static readonly BACKOFF_MS = [10_000, 30_000, 60_000];
  private static readonly LOCK_TTL_SECONDS = 120; // 2min lock

  constructor(
    private readonly evolutionInstanceService: EvolutionInstanceService,
    private readonly eventEmitter: EventEmitter2,
    private readonly redis: RedisService,
  ) {}

  async handleDisconnect(tenantSlug: string, instanceName: string): Promise<void> {
    // Distributed lock — prevents duplicate reconnects across processes
    const lockKey = `reconnect:lock:${instanceName}`;
    const acquired = await this.redis.setnx(
      lockKey,
      '1',
      WhatsAppReconnectService.LOCK_TTL_SECONDS,
    );

    if (!acquired) {
      this.logger.log(`Reconnect already in progress: ${instanceName}`);
      return;
    }

    try {
      const instance = await this.evolutionInstanceService.findByTenant(tenantSlug);
      const attempts = instance?.reconnectAttempts ?? 0;

      if (attempts >= WhatsAppReconnectService.MAX_ATTEMPTS) {
        this.logger.warn(`${instanceName}: max reconnect attempts reached — marking NEEDS_QR`);
        await this.evolutionInstanceService.markAsNeedsQr(instanceName);
        this.eventEmitter.emit('whatsapp.instance.needs_qr', {
          tenantId: instance?.tenantId,
          tenantSlug,
          instanceName,
        });
        return;
      }

      const delay = WhatsAppReconnectService.BACKOFF_MS[attempts] ?? 60_000;
      this.logger.log(`${instanceName}: reconnect attempt ${attempts + 1}/${WhatsAppReconnectService.MAX_ATTEMPTS} in ${delay / 1000}s`);

      await new Promise((r) => setTimeout(r, delay));

      // Attempt restart FIRST, then increment counter only if we actually tried
      const success = await this.evolutionInstanceService.attemptRestart(instanceName);
      const newCount = await this.evolutionInstanceService.incrementReconnectAttempts(instanceName);

      if (success) {
        this.logger.log(`${instanceName}: restart sent (attempt ${newCount})`);
      } else {
        this.logger.warn(`${instanceName}: restart failed (attempt ${newCount})`);
      }
    } finally {
      await this.redis.del(lockKey);
    }
  }
}
