import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EvolutionInstanceService } from './evolution-instance.service';

/**
 * Periodically checks for orphaned WhatsApp instances stuck in
 * "connecting" state and disconnects them to avoid WhatsApp rate limits.
 */
@Injectable()
export class WhatsAppOrphanCleanupService {
  private readonly logger = new Logger(WhatsAppOrphanCleanupService.name);

  /** Track when we first saw an instance in "connecting" state */
  private readonly connectingSince = new Map<string, number>();

  private static readonly MAX_CONNECTING_MS = 5 * 60_000; // 5 min

  constructor(
    private readonly evolutionInstanceService: EvolutionInstanceService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async cleanupOrphanedInstances(): Promise<void> {
    const instances = await this.evolutionInstanceService.listAllInstanceStates();
    const now = Date.now();

    const activeNames = new Set<string>();

    for (const inst of instances) {
      activeNames.add(inst.name);

      if (inst.state === 'connecting') {
        const since = this.connectingSince.get(inst.name);
        if (!since) {
          this.connectingSince.set(inst.name, now);
          continue;
        }

        if (now - since >= WhatsAppOrphanCleanupService.MAX_CONNECTING_MS) {
          this.logger.warn(
            `Orphan cleanup: instance ${inst.name} stuck in "connecting" for >${WhatsAppOrphanCleanupService.MAX_CONNECTING_MS / 60_000}min — disconnecting`,
          );
          try {
            await this.evolutionInstanceService.disconnectInstance(inst.name);
          } catch (err) {
            this.logger.error(
              `Failed to disconnect orphaned instance ${inst.name}: ${String(err)}`,
            );
          }
          this.connectingSince.delete(inst.name);
        }
      } else {
        // No longer connecting — clear tracking
        this.connectingSince.delete(inst.name);
      }
    }

    // Clean up entries for instances that no longer exist
    for (const name of this.connectingSince.keys()) {
      if (!activeNames.has(name)) {
        this.connectingSince.delete(name);
      }
    }
  }
}
