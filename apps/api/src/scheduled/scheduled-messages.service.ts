import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { QUEUE_SCHEDULED_MESSAGES } from '../queue/queue.constants';
import type { ScheduleMessageDto } from './scheduled-messages.dto';

@Injectable()
export class ScheduledMessagesService {
  private readonly logger = new Logger(ScheduledMessagesService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_SCHEDULED_MESSAGES) private readonly queue: Queue,
  ) {}

  async schedule(
    tenantId: string,
    instanceId: string,
    tenantSlug: string,
    dto: ScheduleMessageDto,
  ) {
    const scheduledAt = new Date(dto.scheduledAt);
    const delay = Math.max(0, scheduledAt.getTime() - Date.now());

    const record = await this.prisma.scheduledMessage.create({
      data: {
        tenantId,
        instanceId,
        phone: dto.phone,
        type: dto.type,
        payload: dto.payload as unknown as Prisma.InputJsonValue,
        scheduledAt,
      },
    });

    await this.queue.add(
      'send-scheduled',
      { scheduledMessageId: record.id, tenantSlug },
      { delay, jobId: record.id, removeOnComplete: 100, removeOnFail: 200 },
    );

    this.logger.log(`Scheduled message ${record.id} for ${scheduledAt.toISOString()}`);
    return record;
  }

  async list(tenantId: string) {
    return this.prisma.scheduledMessage.findMany({
      where: { tenantId },
      orderBy: { scheduledAt: 'asc' },
    });
  }

  async cancel(tenantId: string, id: string) {
    const record = await this.prisma.scheduledMessage.findFirst({
      where: { id, tenantId, status: 'PENDING' },
    });

    if (!record) throw new NotFoundException('Scheduled message not found or already processed');

    await this.prisma.scheduledMessage.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });

    const job = await this.queue.getJob(id);
    if (job) await job.remove();

    this.logger.log(`Cancelled scheduled message ${id}`);
    return { success: true };
  }
}
