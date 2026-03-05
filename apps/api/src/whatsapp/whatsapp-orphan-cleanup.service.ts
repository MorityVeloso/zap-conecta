import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EvolutionInstanceService } from './evolution-instance.service';
import { WhatsAppReconnectService } from './whatsapp-reconnect.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Periodically checks for orphaned WhatsApp instances stuck in
 * "connecting" state and disconnects them to avoid WhatsApp rate limits.
 * Also detects DISCONNECTED instances and triggers auto-reconnect.
 */
@Injectable()
export class WhatsAppOrphanCleanupService {
  private readonly logger = new Logger(WhatsAppOrphanCleanupService.name);

  /** Track when we first saw an instance in "connecting" state */
  private readonly connectingSince = new Map<string, number>();

  private static readonly MAX_CONNECTING_MS = 5 * 60_000; // 5 min
  private static readonly RECONNECT_COOLDOWN_MS = 90_000; // 90s — skip if recently attempted

  constructor(
    private readonly evolutionInstanceService: EvolutionInstanceService,
    private readonly reconnectService: WhatsAppReconnectService,
    private readonly prisma: PrismaService,
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

    // ── Health check: reconnect DISCONNECTED instances ──
    await this.reconnectDisconnectedInstances(instances);
  }

  /**
   * Find DB instances marked DISCONNECTED, verify against Evolution API,
   * and trigger reconnect if truly disconnected.
   */
  private async reconnectDisconnectedInstances(
    evolutionStates: { name: string; state: string }[],
  ): Promise<void> {
    const now = Date.now();
    const stateByName = new Map(evolutionStates.map((i) => [i.name, i.state]));

    const disconnected = await this.prisma.whatsAppInstance.findMany({
      where: { status: 'DISCONNECTED' },
      select: {
        instanceName: true,
        tenantSlug: true,
        lastReconnectAt: true,
        reconnectAttempts: true,
      },
    });

    for (const inst of disconnected) {
      // Skip if recently attempted (avoid race with webhook-triggered reconnect)
      if (inst.lastReconnectAt && now - inst.lastReconnectAt.getTime() < WhatsAppOrphanCleanupService.RECONNECT_COOLDOWN_MS) {
        continue;
      }

      const evolutionState = stateByName.get(inst.instanceName);

      // If Evolution says it's open but DB says DISCONNECTED → sync DB
      if (evolutionState === 'open') {
        this.logger.log(`Health sync: ${inst.instanceName} is open on Evolution but DISCONNECTED in DB — syncing`);
        await this.prisma.whatsAppInstance.updateMany({
          where: { instanceName: inst.instanceName },
          data: { status: 'CONNECTED', reconnectAttempts: 0 },
        });
        continue;
      }

      // Truly disconnected (or not found on Evolution) → trigger reconnect
      this.reconnectService.handleDisconnect(inst.tenantSlug, inst.instanceName)
        .catch((err) => this.logger.warn(`Health reconnect failed for ${inst.instanceName}: ${String(err)}`));
    }
  }
}
