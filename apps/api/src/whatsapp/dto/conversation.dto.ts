/**
 * WhatsApp Conversation DTOs
 * DTOs for conversation list and message history endpoints
 */

import { z } from 'zod';

/**
 * Conversation summary (one per phone number)
 */
export const ConversationSummarySchema = z.object({
  phone: z.string(),
  customerName: z.string().nullable(),
  customerId: z.string().nullable(),
  lastMessage: z.string(),
  lastMessageAt: z.string().datetime(),
  unreadCount: z.number().int().min(0),
  direction: z.enum(['INBOUND', 'OUTBOUND']),
});

export type ConversationSummaryDto = z.infer<typeof ConversationSummarySchema>;

/**
 * Query parameters for conversation messages
 */
export const ConversationMessagesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: z.string().datetime().optional(),
});

export type ConversationMessagesQueryDto = z.infer<
  typeof ConversationMessagesQuerySchema
>;

/**
 * Query parameters for conversation list
 */
export const ConversationListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
});

export type ConversationListQueryDto = z.infer<
  typeof ConversationListQuerySchema
>;

/**
 * Message response DTO
 */
export const MessageResponseSchema = z.object({
  id: z.string().uuid(),
  phone: z.string(),
  direction: z.enum(['INBOUND', 'OUTBOUND']),
  messageType: z.enum([
    'TEXT',
    'IMAGE',
    'DOCUMENT',
    'AUDIO',
    'VIDEO',
    'LOCATION',
    'CONTACT',
    'STICKER',
    'BUTTON_RESPONSE',
    'LIST_RESPONSE',
  ]),
  content: z.string(),
  metadata: z.unknown().nullable(),
  externalId: z.string().nullable(),
  status: z.enum(['PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED']),
  customerId: z.string().nullable(),
  createdAt: z.string().datetime(),
});

export type MessageResponseDto = z.infer<typeof MessageResponseSchema>;

/**
 * Paginated messages response
 */
export interface PaginatedMessagesDto {
  data: MessageResponseDto[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

/**
 * Paginated conversations response
 */
export interface PaginatedConversationsDto {
  data: ConversationSummaryDto[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

/**
 * Input for saving a message
 */
export interface SaveMessageInput {
  tenantId: string;
  phone: string;
  direction: 'INBOUND' | 'OUTBOUND';
  messageType?:
    | 'TEXT'
    | 'IMAGE'
    | 'DOCUMENT'
    | 'AUDIO'
    | 'VIDEO'
    | 'LOCATION'
    | 'CONTACT'
    | 'STICKER'
    | 'BUTTON_RESPONSE'
    | 'LIST_RESPONSE';
  content: string;
  metadata?: Record<string, unknown>;
  externalId?: string;
  customerId?: string;
  status?: 'PENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
}
