import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { WhatsAppMessageReceivedEvent, WhatsAppMessageSentEvent } from '../whatsapp/whatsapp.events';
import { MessagesService } from './messages.service';

export type { WhatsAppMessageReceivedEvent, WhatsAppMessageSentEvent };

/**
 * Listens to WhatsApp events emitted by WhatsAppService and
 * persists them to the messages table.
 *
 * Decoupled via EventEmitter2 to avoid circular module dependencies.
 */
@Injectable()
export class MessagesListener {
  private readonly logger = new Logger(MessagesListener.name);

  constructor(private readonly messagesService: MessagesService) {}

  @OnEvent('whatsapp.message.received', { async: true })
  async handleMessageReceived(event: WhatsAppMessageReceivedEvent): Promise<void> {
    this.logger.debug(`Persisting inbound from ${event.phone}`);
    await this.messagesService.saveInbound(event.tenantId, event.instanceId, {
      phone: event.phone,
      type: event.type,
      content: event.content,
      externalId: event.externalId,
    });
  }

  @OnEvent('whatsapp.message.sent', { async: true })
  async handleMessageSent(event: WhatsAppMessageSentEvent): Promise<void> {
    this.logger.debug(`Persisting outbound to ${event.phone}`);
    await this.messagesService.saveOutbound(event.tenantId, event.instanceId, {
      phone: event.phone,
      type: event.type,
      content: event.content,
      externalId: event.externalId,
    });
  }
}
