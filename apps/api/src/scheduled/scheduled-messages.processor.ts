import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { PrismaService } from '@/prisma/prisma.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { QUEUE_SCHEDULED_MESSAGES } from '../queue/queue.constants';

interface ScheduledMessageJob {
  scheduledMessageId: string;
  tenantSlug: string;
}

@Processor(QUEUE_SCHEDULED_MESSAGES)
export class ScheduledMessagesProcessor extends WorkerHost {
  private readonly logger = new Logger(ScheduledMessagesProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsAppService: WhatsAppService,
  ) {
    super();
  }

  async process(job: Job<ScheduledMessageJob>): Promise<void> {
    const { scheduledMessageId, tenantSlug } = job.data;

    const record = await this.prisma.scheduledMessage.findUnique({
      where: { id: scheduledMessageId },
    });

    if (!record || record.status !== 'PENDING') {
      this.logger.warn(`Scheduled message ${scheduledMessageId} skipped (status: ${record?.status})`);
      return;
    }

    const payload = record.payload as Record<string, unknown>;

    try {
      let result: { success: boolean; error?: string };

      const baseDto = { phone: record.phone, tenantSlug } as Record<string, unknown>;

      switch (record.type) {
        case 'TEXT':
          result = await this.whatsAppService.sendTextMessage({
            ...baseDto,
            message: payload.text as string,
          } as Parameters<WhatsAppService['sendTextMessage']>[0]);
          break;

        case 'IMAGE':
          result = await this.whatsAppService.sendImageMessage({
            ...baseDto,
            image: payload.mediaUrl as string,
            caption: payload.caption as string | undefined,
          } as Parameters<WhatsAppService['sendImageMessage']>[0]);
          break;

        case 'DOCUMENT':
          result = await this.whatsAppService.sendDocumentMessage({
            ...baseDto,
            document: payload.mediaUrl as string,
            fileName: (payload.fileName as string) ?? 'document',
            caption: payload.caption as string | undefined,
          } as Parameters<WhatsAppService['sendDocumentMessage']>[0]);
          break;

        case 'AUDIO':
          result = await this.whatsAppService.sendAudioMessage({
            ...baseDto,
            audio: payload.mediaUrl as string,
          } as Parameters<WhatsAppService['sendAudioMessage']>[0]);
          break;

        case 'VIDEO':
          result = await this.whatsAppService.sendVideoMessage({
            ...baseDto,
            video: payload.mediaUrl as string,
            caption: payload.caption as string | undefined,
          } as Parameters<WhatsAppService['sendVideoMessage']>[0]);
          break;

        default:
          throw new Error(`Unsupported message type: ${record.type}`);
      }

      if (!result.success) throw new Error(result.error ?? 'Send failed');

      await this.prisma.scheduledMessage.update({
        where: { id: scheduledMessageId },
        data: { status: 'SENT', sentAt: new Date() },
      });

      this.logger.log(`Scheduled message ${scheduledMessageId} sent`);
    } catch (err) {
      await this.prisma.scheduledMessage.update({
        where: { id: scheduledMessageId },
        data: { status: 'FAILED', error: String(err) },
      });

      this.logger.error(`Scheduled message ${scheduledMessageId} failed: ${String(err)}`);
    }
  }
}
