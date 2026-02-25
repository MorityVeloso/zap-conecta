/**
 * WhatsApp Client Interface
 * Provider-agnostic contract for WhatsApp messaging operations.
 * Implemented by EvolutionApiClientService (and legacy ZApiClientService).
 */

import type {
  SendTextMessageDto,
  SendButtonMessageDto,
  SendListMessageDto,
  SendImageMessageDto,
  SendDocumentMessageDto,
  SendPixMessageDto,
} from './dto/message.dto';

/**
 * Injection token for the WhatsApp client provider
 */
export const WHATSAPP_CLIENT = Symbol('WHATSAPP_CLIENT');

/**
 * Standardised response from any WhatsApp client
 */
export interface WhatsAppClientResponse {
  messageId?: string;
  phone?: string;
  status?: string;
  error?: string;
}

/**
 * Provider-agnostic WhatsApp client contract
 */
export interface WhatsAppClientInterface {
  /** Whether the provider is configured and ready */
  isConfigured(): boolean;

  /** Get connection status of the WhatsApp instance */
  getStatus(): Promise<{ connected: boolean; phone?: string }>;

  /** Get QR code for pairing */
  getQrCode(): Promise<{ qrcode: string; imageBase64?: string }>;

  /** Send a plain text message */
  sendTextMessage(dto: SendTextMessageDto): Promise<WhatsAppClientResponse>;

  /** Send a button message (max 3 buttons) */
  sendButtonMessage(dto: SendButtonMessageDto): Promise<WhatsAppClientResponse>;

  /** Send a list message */
  sendListMessage(dto: SendListMessageDto): Promise<WhatsAppClientResponse>;

  /** Send an image message */
  sendImageMessage(dto: SendImageMessageDto): Promise<WhatsAppClientResponse>;

  /** Send a document message */
  sendDocumentMessage(
    dto: SendDocumentMessageDto,
  ): Promise<WhatsAppClientResponse>;

  /** Send a PIX payment message */
  sendPixMessage(dto: SendPixMessageDto): Promise<WhatsAppClientResponse>;

  /** Mark messages as read */
  readMessages(phone: string): Promise<void>;

  /** Check if a phone number has WhatsApp */
  checkNumber(phone: string): Promise<{ exists: boolean; jid?: string }>;

  /** Disconnect the WhatsApp instance */
  disconnect(): Promise<void>;

  /** Restart the WhatsApp instance */
  restart(): Promise<void>;
}
