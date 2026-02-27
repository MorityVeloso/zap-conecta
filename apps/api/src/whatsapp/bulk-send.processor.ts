import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { WhatsAppService } from './whatsapp.service';
import { QUEUE_BULK_SEND } from '../queue/queue.constants';

export interface BulkSendJobData {
  tenantSlug: string;
  phone: string;
  type: string;
  text?: string;
  mediaUrl?: string;
  caption?: string;
  fileName?: string;
}

@Processor(QUEUE_BULK_SEND)
export class BulkSendProcessor extends WorkerHost {
  private readonly logger = new Logger(BulkSendProcessor.name);

  constructor(private readonly whatsAppService: WhatsAppService) {
    super();
  }

  async process(job: Job<BulkSendJobData>): Promise<void> {
    const { tenantSlug, phone, type, text, mediaUrl, caption, fileName } = job.data;
    const base = { phone, tenantSlug } as Record<string, unknown>;

    let result: { success: boolean; error?: string };

    switch (type) {
      case 'TEXT':
        result = await this.whatsAppService.sendTextMessage({
          ...base, message: text!,
        } as Parameters<WhatsAppService['sendTextMessage']>[0]);
        break;
      case 'IMAGE':
        result = await this.whatsAppService.sendImageMessage({
          ...base, image: mediaUrl!, caption,
        } as Parameters<WhatsAppService['sendImageMessage']>[0]);
        break;
      case 'DOCUMENT':
        result = await this.whatsAppService.sendDocumentMessage({
          ...base, document: mediaUrl!, fileName: fileName ?? 'document', caption,
        } as Parameters<WhatsAppService['sendDocumentMessage']>[0]);
        break;
      case 'AUDIO':
        result = await this.whatsAppService.sendAudioMessage({
          ...base, audio: mediaUrl!,
        } as Parameters<WhatsAppService['sendAudioMessage']>[0]);
        break;
      case 'VIDEO':
        result = await this.whatsAppService.sendVideoMessage({
          ...base, video: mediaUrl!, caption,
        } as Parameters<WhatsAppService['sendVideoMessage']>[0]);
        break;
      default:
        throw new Error(`Unsupported bulk send type: ${type}`);
    }

    if (!result.success) {
      this.logger.warn(`Bulk send to ${phone} failed: ${result.error}`);
    }
  }
}
