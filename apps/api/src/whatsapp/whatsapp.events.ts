/** Shared event payload types for WhatsApp EventEmitter2 events. */

export interface WhatsAppMessageReceivedEvent {
  tenantId: string;
  instanceId: string;
  phone: string;
  type: string;
  content: Record<string, unknown>;
  externalId?: string;
}

export interface WhatsAppMessageSentEvent {
  tenantId: string;
  instanceId: string;
  phone: string;
  type: string;
  content: Record<string, unknown>;
  externalId?: string;
}

export interface WhatsAppMessageStatusEvent {
  tenantId: string;
  instanceId: string;
  messageId: string;
  status: string;
  phone?: string;
}
