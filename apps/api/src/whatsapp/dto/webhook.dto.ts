/**
 * WhatsApp Webhook DTOs
 * Handles incoming events from Z-API
 */

import { z } from 'zod';

/**
 * Webhook Event Types from Z-API
 */
export const WebhookEventType = {
  // Message events
  MESSAGE_RECEIVED: 'ReceivedCallback',
  MESSAGE_SENT: 'MessageStatusCallback',
  MESSAGE_STATUS: 'DeliveryCallback',

  // Connection events
  CONNECTED: 'StatusCallback',
  DISCONNECTED: 'DisconnectCallback',
  QR_CODE: 'QrCodeCallback',

  // Chat events
  CHAT_PRESENCE: 'ChatPresence',
} as const;

export type WebhookEventType = (typeof WebhookEventType)[keyof typeof WebhookEventType];

/**
 * Base Webhook Payload
 */
export const BaseWebhookPayloadSchema = z.object({
  instanceId: z.string().optional(),
  phone: z.string().optional(),
  event: z.string(),
});

/**
 * Received Message Webhook
 */
export const ReceivedMessageWebhookSchema = z.object({
  phone: z.string(),
  fromMe: z.boolean().optional(),
  momType: z.string().optional(),
  messageId: z.string().optional(),
  chatId: z.string().optional(),
  isGroup: z.boolean().optional(),
  timestamp: z.number().optional(),
  text: z
    .object({
      message: z.string(),
    })
    .optional(),
  image: z
    .object({
      url: z.string().optional(),
      caption: z.string().optional(),
      mimeType: z.string().optional(),
    })
    .optional(),
  document: z
    .object({
      url: z.string().optional(),
      fileName: z.string().optional(),
      mimeType: z.string().optional(),
    })
    .optional(),
  audio: z
    .object({
      url: z.string().optional(),
      mimeType: z.string().optional(),
    })
    .optional(),
  video: z
    .object({
      url: z.string().optional(),
      caption: z.string().optional(),
      mimeType: z.string().optional(),
    })
    .optional(),
  location: z
    .object({
      latitude: z.number().optional(),
      longitude: z.number().optional(),
      name: z.string().optional(),
      address: z.string().optional(),
    })
    .optional(),
  contact: z
    .object({
      name: z.string().optional(),
      phones: z.array(z.string()).optional(),
    })
    .optional(),
  buttonResponse: z
    .object({
      buttonId: z.string().optional(),
      buttonText: z.string().optional(),
    })
    .optional(),
  buttonsResponseMessage: z
    .object({
      buttonId: z.string().optional(),
      message: z.string().optional(),
    })
    .optional(),
  listResponse: z
    .object({
      rowId: z.string().optional(),
      title: z.string().optional(),
    })
    .optional(),
  listResponseMessage: z
    .object({
      selectedRowId: z.string().optional(),
      title: z.string().optional(),
      message: z.string().optional(),
    })
    .optional(),
  senderName: z.string().optional(),
  senderPhoto: z.string().optional(),
});

export type ReceivedMessageWebhook = z.infer<typeof ReceivedMessageWebhookSchema>;

/**
 * Message Status Webhook
 */
export const MessageStatusWebhookSchema = z.object({
  messageId: z.string(),
  phone: z.string(),
  status: z.enum(['PENDING', 'SENT', 'RECEIVED', 'READ', 'PLAYED', 'ERROR']),
  timestamp: z.number().optional(),
});

export type MessageStatusWebhook = z.infer<typeof MessageStatusWebhookSchema>;

/**
 * Connection Status Webhook
 */
export const ConnectionStatusWebhookSchema = z.object({
  connected: z.boolean(),
  phone: z.string().optional(),
  smartphoneConnected: z.boolean().optional(),
});

export type ConnectionStatusWebhook = z.infer<typeof ConnectionStatusWebhookSchema>;

/**
 * QR Code Webhook
 */
export const QrCodeWebhookSchema = z.object({
  qrcode: z.string(),
  imageBase64: z.string().optional(),
});

export type QrCodeWebhook = z.infer<typeof QrCodeWebhookSchema>;

/**
 * Generic Webhook Handler DTO
 */
export const WebhookHandlerDtoSchema = z.object({
  event: z.string(),
  payload: z.record(z.string(), z.unknown()),
});

export type WebhookHandlerDto = z.infer<typeof WebhookHandlerDtoSchema>;
