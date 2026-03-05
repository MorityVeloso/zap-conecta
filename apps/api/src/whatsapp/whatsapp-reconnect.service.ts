import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EvolutionInstanceService } from './evolution-instance.service';

@Injectable()
export class WhatsAppReconnectService {
  private readonly logger = new Logger(WhatsAppReconnectService.name);
  private static readonly MAX_ATTEMPTS = 3;
  private static readonly BACKOFF_MS = [10_000, 30_000, 60_000];

  private readonly reconnectLock = new Set<string>();

  constructor(
    private readonly evolutionInstanceService: EvolutionInstanceService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async handleDisconnect(tenantSlug: string, instanceName: string): Promise<void> {
    if (this.reconnectLock.has(instanceName)) {
      this.logger.log(`Reconnect already in progress: ${instanceName}`);
      return;
    }
    this.reconnectLock.add(instanceName);

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

      const newCount = await this.evolutionInstanceService.incrementReconnectAttempts(instanceName);
      const success = await this.evolutionInstanceService.attemptRestart(instanceName);

      if (success) {
        this.logger.log(`${instanceName}: restart sent (attempt ${newCount})`);
      } else {
        this.logger.warn(`${instanceName}: restart failed (attempt ${newCount})`);
      }
    } finally {
      this.reconnectLock.delete(instanceName);
    }
  }
}
