/**
 * WhatsApp Message DTOs with Zod validation
 * Compatible with Z-API message formats
 */

import { z } from 'zod';

// WhatsApp phone number format (country code + number)
const phoneRegex = /^[1-9]\d{10,14}$/;

/**
 * Base message DTO
 */
const BaseMessageDtoSchema = z.object({
  phone: z
    .string()
    .regex(
      phoneRegex,
      'Invalid phone number format (use country code + number, e.g., 5511999998888)',
    ),
});

/**
 * Quoted message reference (reply/quote)
 */
export const QuotedMessageSchema = z.object({
  messageId: z.string().min(1),
  remoteJid: z.string().min(1),
  fromMe: z.boolean(),
});

/**
 * Text Message DTO
 */
export const SendTextMessageDtoSchema = BaseMessageDtoSchema.extend({
  message: z
    .string()
    .min(1, 'Message is required')
    .max(4096, 'Message must be at most 4096 characters'),
  quoted: QuotedMessageSchema.optional(),
});

export type SendTextMessageDto = z.infer<typeof SendTextMessageDtoSchema> & {
  /** Optional tenant ID override — bypasses request-scoped TenantContextService */
  tenantId?: string;
};

/**
 * Button for button messages
 */
export const ButtonDtoSchema = z.object({
  id: z.string().min(1).max(256),
  text: z.string().min(1).max(20, 'Button text must be at most 20 characters'),
});

export type ButtonDto = z.infer<typeof ButtonDtoSchema>;

/**
 * Button Message DTO (max 3 buttons)
 */
export const SendButtonMessageDtoSchema = BaseMessageDtoSchema.extend({
  message: z
    .string()
    .min(1, 'Message is required')
    .max(1024, 'Message must be at most 1024 characters'),
  title: z.string().max(60, 'Title must be at most 60 characters').optional(),
  footer: z.string().max(60, 'Footer must be at most 60 characters').optional(),
  buttons: z
    .array(ButtonDtoSchema)
    .min(1, 'At least one button is required')
    .max(3, 'Maximum 3 buttons allowed'),
});

export type SendButtonMessageDto = z.infer<typeof SendButtonMessageDtoSchema>;

/**
 * List row for list messages
 */
export const ListRowDtoSchema = z.object({
  id: z.string().min(1).max(200),
  title: z.string().min(1).max(24, 'Row title must be at most 24 characters'),
  description: z
    .string()
    .max(72, 'Row description must be at most 72 characters')
    .optional(),
});

export type ListRowDto = z.infer<typeof ListRowDtoSchema>;

/**
 * List section for list messages
 */
export const ListSectionDtoSchema = z.object({
  title: z
    .string()
    .min(1)
    .max(24, 'Section title must be at most 24 characters'),
  rows: z
    .array(ListRowDtoSchema)
    .min(1, 'At least one row is required')
    .max(10, 'Maximum 10 rows per section'),
});

export type ListSectionDto = z.infer<typeof ListSectionDtoSchema>;

/**
 * List Message DTO
 */
export const SendListMessageDtoSchema = BaseMessageDtoSchema.extend({
  message: z
    .string()
    .min(1, 'Message is required')
    .max(1024, 'Message must be at most 1024 characters'),
  title: z.string().max(60, 'Title must be at most 60 characters').optional(),
  footer: z.string().max(60, 'Footer must be at most 60 characters').optional(),
  buttonText: z
    .string()
    .min(1, 'Button text is required')
    .max(20, 'Button text must be at most 20 characters'),
  sections: z
    .array(ListSectionDtoSchema)
    .min(1, 'At least one section is required')
    .max(10, 'Maximum 10 sections allowed'),
});

export type SendListMessageDto = z.infer<typeof SendListMessageDtoSchema>;

/**
 * Image Message DTO
 */
export const SendImageMessageDtoSchema = BaseMessageDtoSchema.extend({
  image: z.string().url('Invalid image URL'),
  caption: z
    .string()
    .max(1024, 'Caption must be at most 1024 characters')
    .optional(),
  quoted: QuotedMessageSchema.optional(),
});

export type SendImageMessageDto = z.infer<typeof SendImageMessageDtoSchema>;

/**
 * Document Message DTO
 */
export const SendDocumentMessageDtoSchema = BaseMessageDtoSchema.extend({
  document: z.string().url('Invalid document URL'),
  fileName: z
    .string()
    .min(1, 'File name is required')
    .max(255, 'File name must be at most 255 characters'),
  caption: z
    .string()
    .max(1024, 'Caption must be at most 1024 characters')
    .optional(),
  quoted: QuotedMessageSchema.optional(),
});

export type SendDocumentMessageDto = z.infer<
  typeof SendDocumentMessageDtoSchema
>;

/**
 * PIX Payment DTO
 */
export const SendPixMessageDtoSchema = BaseMessageDtoSchema.extend({
  pixKey: z.string().min(1, 'PIX key is required'),
  pixKeyType: z.enum(['cpf', 'cnpj', 'email', 'phone', 'random']),
  merchantName: z
    .string()
    .min(1, 'Merchant name is required')
    .max(25, 'Merchant name must be at most 25 characters'),
  merchantCity: z
    .string()
    .min(1, 'Merchant city is required')
    .max(15, 'Merchant city must be at most 15 characters'),
  amount: z
    .number()
    .positive('Amount must be positive')
    .max(99999999.99, 'Amount exceeds maximum'),
  description: z
    .string()
    .max(72, 'Description must be at most 72 characters')
    .optional(),
  txid: z
    .string()
    .max(25, 'Transaction ID must be at most 25 characters')
    .optional(),
});

export type SendPixMessageDto = z.infer<typeof SendPixMessageDtoSchema>;

/**
 * Template Message DTO
 */
export const SendTemplateMessageDtoSchema = BaseMessageDtoSchema.extend({
  templateId: z.string().min(1, 'Template ID is required'),
  variables: z.record(z.string(), z.string()).optional(),
});

export type SendTemplateMessageDto = z.infer<
  typeof SendTemplateMessageDtoSchema
>;

/**
 * Message Status enum
 */
export const MessageStatus = {
  PENDING: 'PENDING',
  SENT: 'SENT',
  DELIVERED: 'DELIVERED',
  READ: 'READ',
  FAILED: 'FAILED',
} as const;

export type MessageStatus = (typeof MessageStatus)[keyof typeof MessageStatus];

/**
 * Message Type enum
 */
export const MessageType = {
  TEXT: 'TEXT',
  IMAGE: 'IMAGE',
  DOCUMENT: 'DOCUMENT',
  AUDIO: 'AUDIO',
  VIDEO: 'VIDEO',
  STICKER: 'STICKER',
  LOCATION: 'LOCATION',
  CONTACT: 'CONTACT',
  BUTTON: 'BUTTON',
  LIST: 'LIST',
  PIX: 'PIX',
  TEMPLATE: 'TEMPLATE',
} as const;

export type MessageType = (typeof MessageType)[keyof typeof MessageType];

/**
 * Audio Message DTO
 */
export const SendAudioMessageDtoSchema = BaseMessageDtoSchema.extend({
  audio: z.string().url('Invalid audio URL'),
  ptt: z.boolean().optional().default(true),
  quoted: QuotedMessageSchema.optional(),
});

export type SendAudioMessageDto = z.infer<typeof SendAudioMessageDtoSchema>;

/**
 * Video Message DTO
 */
export const SendVideoMessageDtoSchema = BaseMessageDtoSchema.extend({
  video: z.string().url('Invalid video URL'),
  caption: z
    .string()
    .max(1024, 'Caption must be at most 1024 characters')
    .optional(),
  quoted: QuotedMessageSchema.optional(),
});

export type SendVideoMessageDto = z.infer<typeof SendVideoMessageDtoSchema>;

/**
 * Sticker Message DTO
 */
export const SendStickerMessageDtoSchema = BaseMessageDtoSchema.extend({
  sticker: z.string().url('Invalid sticker URL'),
});

export type SendStickerMessageDto = z.infer<typeof SendStickerMessageDtoSchema>;

/**
 * Location Message DTO
 */
export const SendLocationMessageDtoSchema = BaseMessageDtoSchema.extend({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  name: z.string().max(100).optional(),
  address: z.string().max(256).optional(),
});

export type SendLocationMessageDto = z.infer<typeof SendLocationMessageDtoSchema>;

/**
 * Contact card entry
 */
export const ContactEntrySchema = z.object({
  fullName: z.string().min(1),
  phoneNumber: z.string().min(1),
  organization: z.string().optional(),
  email: z.string().email().optional(),
});

/**
 * Contact Message DTO
 */
export const SendContactMessageDtoSchema = BaseMessageDtoSchema.extend({
  contacts: z.array(ContactEntrySchema).min(1).max(10),
});

export type SendContactMessageDto = z.infer<typeof SendContactMessageDtoSchema>;

/**
 * Reaction DTO (emoji reaction to a message)
 */
export const SendReactionDtoSchema = z.object({
  messageId: z.string().min(1),
  remoteJid: z.string().min(1),
  fromMe: z.boolean(),
  reaction: z.string().max(2, 'Send empty string to remove reaction'),
});

export type SendReactionDto = z.infer<typeof SendReactionDtoSchema>;

/**
 * Poll Message DTO
 */
export const SendPollDtoSchema = BaseMessageDtoSchema.extend({
  name: z.string().min(1).max(256, 'Poll question must be at most 256 characters'),
  options: z
    .array(z.string().min(1).max(100))
    .min(2, 'At least 2 options required')
    .max(12, 'Maximum 12 options allowed'),
  selectableCount: z.number().int().min(1).max(12).optional().default(1),
});

export type SendPollDto = z.infer<typeof SendPollDtoSchema>;

/**
 * Check Number DTO
 */
export const CheckNumberDtoSchema = z.object({
  phone: z
    .string()
    .regex(phoneRegex, 'Invalid phone number format'),
});

export type CheckNumberDto = z.infer<typeof CheckNumberDtoSchema>;

/**
 * Read Messages DTO
 */
export const ReadMessagesDtoSchema = z.object({
  phone: z
    .string()
    .regex(phoneRegex, 'Invalid phone number format'),
});

export type ReadMessagesDto = z.infer<typeof ReadMessagesDtoSchema>;
