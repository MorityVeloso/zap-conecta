import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EvolutionInstanceService } from './evolution-instance.service';
import { WhatsAppReconnectService } from './whatsapp-reconnect.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Periodically checks for orphaned WhatsApp instances stuck in
 * "connecting" state and disconnects them to avoid WhatsApp rate limits.
 * Also performs bidirectional sync and triggers auto-reconnect.
 */
@Injectable()
export class WhatsAppOrphanCleanupService implements OnModuleInit {
  private readonly logger = new Logger(WhatsAppOrphanCleanupService.name);

  /** Track when we first saw an instance in "connecting" state */
  private readonly connectingSince = new Map<string, number>();

  /** Guard against overlapping cron executions */
  private running = false;

  private static readonly MAX_CONNECTING_MS = 5 * 60_000; // 5 min
  private static readonly RECONNECT_COOLDOWN_MS = 90_000; // 90s

  constructor(
    private readonly evolutionInstanceService: EvolutionInstanceService,
    private readonly reconnectService: WhatsAppReconnectService,
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /** On startup: verify webhook URLs for all instances (may be stale after redeploy) */
  async onModuleInit(): Promise<void> {
    try {
      const instances = await this.prisma.whatsAppInstance.findMany({
        select: { instanceName: true, tenantSlug: true, webhookUrl: true },
      });

      for (const inst of instances) {
        const expectedUrl = this.evolutionInstanceService.buildWebhookUrl(inst.tenantSlug);
        if (inst.webhookUrl !== expectedUrl) {
          this.logger.log(`Webhook URL mismatch for ${inst.instanceName}: ${inst.webhookUrl ?? 'null'} → ${expectedUrl}`);
          this.evolutionInstanceService.configureWebhook(inst.instanceName, inst.tenantSlug)
            .catch((err) => this.logger.warn(`Failed to reconfigure webhook for ${inst.instanceName}: ${String(err)}`));
        }
      }
    } catch (err) {
      this.logger.warn(`Webhook URL verification failed on startup: ${String(err)}`);
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async cleanupOrphanedInstances(): Promise<void> {
    if (this.running) {
      this.logger.debug('Health check skipped — previous run still in progress');
      return;
    }
    this.running = true;

    try {
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
          this.connectingSince.delete(inst.name);
        }
      }

      // Clean up entries for instances that no longer exist
      for (const name of this.connectingSince.keys()) {
        if (!activeNames.has(name)) {
          this.connectingSince.delete(name);
        }
      }

      // ── Bidirectional health sync ──
      await this.syncInstanceStates(instances);
    } finally {
      this.running = false;
    }
  }

  /**
   * Bidirectional sync:
   * 1. DB=DISCONNECTED but Evolution=open → sync to CONNECTED
   * 2. DB=CONNECTED but Evolution=close → sync to DISCONNECTED + trigger reconnect
   * 3. DB=DISCONNECTED and Evolution=close → trigger reconnect
   */
  private async syncInstanceStates(
    evolutionStates: { name: string; state: string }[],
  ): Promise<void> {
    // If Evolution API returned no instances, it likely failed — skip sync to avoid
    // false-positive disconnects (fail-open: preserve current state when uncertain)
    if (evolutionStates.length === 0) {
      this.logger.debug('Health sync skipped — Evolution API returned no instances');
      return;
    }

    const now = Date.now();
    const stateByName = new Map(evolutionStates.map((i) => [i.name, i.state]));

    const dbInstances = await this.prisma.whatsAppInstance.findMany({
      where: { status: { in: ['CONNECTED', 'DISCONNECTED'] } },
      select: {
        instanceName: true,
        tenantSlug: true,
        tenantId: true,
        id: true,
        status: true,
        lastReconnectAt: true,
        reconnectAttempts: true,
      },
    });

    for (const inst of dbInstances) {
      const evolutionState = stateByName.get(inst.instanceName);

      // If instance is not in the Evolution list, skip — don't assume disconnected.
      // It may have been deleted or the list was partial.
      if (evolutionState === undefined) {
        this.logger.debug(`Health sync: ${inst.instanceName} not found in Evolution list — skipping`);
        continue;
      }

      // ── DB=CONNECTED but Evolution=close → confirmed stale CONNECTED ──
      if (inst.status === 'CONNECTED' && evolutionState === 'close') {
        this.logger.warn(`Health sync: ${inst.instanceName} DB=CONNECTED but Evolution=close — syncing to DISCONNECTED`);
        await this.prisma.whatsAppInstance.updateMany({
          where: { instanceName: inst.instanceName },
          data: { status: 'DISCONNECTED' },
        });
        this.eventEmitter.emit('whatsapp.instance.disconnected', {
          tenantId: inst.tenantId,
          tenantSlug: inst.tenantSlug,
          instanceId: inst.id,
        });
        this.reconnectService.handleDisconnect(inst.tenantSlug, inst.instanceName)
          .catch((err) => this.logger.warn(`Health reconnect failed for ${inst.instanceName}: ${String(err)}`));
        continue;
      }

      // ── DB=DISCONNECTED but Evolution=open → missed connection event ──
      if (inst.status === 'DISCONNECTED' && evolutionState === 'open') {
        this.logger.log(`Health sync: ${inst.instanceName} is open on Evolution but DISCONNECTED in DB — syncing`);
        await this.prisma.whatsAppInstance.updateMany({
          where: { instanceName: inst.instanceName },
          data: { status: 'CONNECTED', reconnectAttempts: 0 },
        });
        this.eventEmitter.emit('whatsapp.instance.connected', {
          tenantId: inst.tenantId,
          tenantSlug: inst.tenantSlug,
          instanceId: inst.id,
        });
        continue;
      }

      // ── DB=DISCONNECTED and Evolution=close → trigger reconnect ──
      if (inst.status === 'DISCONNECTED' && evolutionState === 'close') {
        if (inst.lastReconnectAt && now - inst.lastReconnectAt.getTime() < WhatsAppOrphanCleanupService.RECONNECT_COOLDOWN_MS) {
          continue;
        }
        this.reconnectService.handleDisconnect(inst.tenantSlug, inst.instanceName)
          .catch((err) => this.logger.warn(`Health reconnect failed for ${inst.instanceName}: ${String(err)}`));
      }
    }
  }
}
