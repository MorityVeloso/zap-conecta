/** Shared event payload types for WhatsApp EventEmitter2 events. */

export interface WhatsAppInstanceConnectedEvent {
  tenantId: string;
  tenantSlug: string;
  instanceId?: string;
  phone?: string;
}

export interface WhatsAppInstanceDisconnectedEvent {
  tenantId: string;
  tenantSlug: string;
  instanceId?: string;
}

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

export interface WhatsAppInstanceNeedsQrEvent {
  tenantId?: string;
  tenantSlug: string;
  instanceName: string;
  instanceId?: string;
}

export interface WhatsAppQrUpdatedEvent {
  tenantId: string;
  tenantSlug: string;
  instanceId?: string;
  qrCode: string;
  pairingCode?: string;
}

export interface WhatsAppCallReceivedEvent {
  tenantId: string;
  instanceId?: string;
  from: string;
  isVideo: boolean;
  status: string;
}
