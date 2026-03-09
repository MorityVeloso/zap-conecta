/**
 * Evolution API v2 Webhook DTOs (Zod schemas)
 * Based on Baileys protobuf message structures.
 */

import { z } from 'zod';

// ── Message Key ──────────────────────────────────────────────
export const EvolutionMessageKeySchema = z.object({
  remoteJid: z.string(),
  fromMe: z.boolean(),
  id: z.string(),
  participant: z.string().optional(),
});

// ── Message Content Variants ─────────────────────────────────
const ContextInfoSchema = z
  .object({
    stanzaId: z.string().optional(),
    participant: z.string().optional(),
    quotedMessage: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough()
  .optional();

const TextMessageSchema = z.object({
  conversation: z.string().optional(),
});

const ExtendedTextMessageSchema = z.object({
  extendedTextMessage: z.object({
    text: z.string(),
    contextInfo: ContextInfoSchema,
  }),
});

const ImageMessageSchema = z.object({
  imageMessage: z.object({
    url: z.string().optional(),
    mimetype: z.string().optional(),
    caption: z.string().optional(),
    contextInfo: ContextInfoSchema,
  }),
});

const DocumentMessageSchema = z.object({
  documentMessage: z.object({
    url: z.string().optional(),
    mimetype: z.string().optional(),
    fileName: z.string().optional(),
    caption: z.string().optional(),
    contextInfo: ContextInfoSchema,
  }),
});

const AudioMessageSchema = z.object({
  audioMessage: z.object({
    url: z.string().optional(),
    mimetype: z.string().optional(),
    ptt: z.boolean().optional(),
    contextInfo: ContextInfoSchema,
  }),
});

const VideoMessageSchema = z.object({
  videoMessage: z.object({
    url: z.string().optional(),
    mimetype: z.string().optional(),
    caption: z.string().optional(),
    contextInfo: ContextInfoSchema,
  }),
});

const ButtonsResponseMessageSchema = z.object({
  buttonsResponseMessage: z.object({
    selectedButtonId: z.string().nullable().optional(),
    selectedDisplayText: z.string().nullable().optional(),
    type: z.number().optional(),
    contextInfo: ContextInfoSchema,
  }),
});

const ListResponseMessageSchema = z.object({
  listResponseMessage: z.object({
    title: z.string().nullable().optional(),
    listType: z.number().optional(),
    singleSelectReply: z
      .object({
        selectedRowId: z.string().nullable().optional(),
      })
      .optional(),
    description: z.string().nullable().optional(),
    contextInfo: ContextInfoSchema,
  }),
});

// ── Composite message schema (union via passthrough) ─────────
export const EvolutionBaileysMessageSchema = z.record(z.string(), z.unknown());

// ── messages.upsert ──────────────────────────────────────────
export const EvolutionMessagesUpsertDataSchema = z.object({
  key: EvolutionMessageKeySchema,
  pushName: z.string().nullable().optional(),
  status: z.string().optional(),
  message: EvolutionBaileysMessageSchema.optional(),
  messageType: z.string(),
  messageTimestamp: z.number().optional(),
  instanceId: z.string().optional(),
  source: z.string().optional(),
});

export const EvolutionMessagesUpsertSchema = z.object({
  event: z.literal('messages.upsert'),
  instance: z.string(),
  data: EvolutionMessagesUpsertDataSchema,
  date_time: z.string().optional(),
  sender: z.string().optional(),
  server_url: z.string().optional(),
  apikey: z.string().optional(),
});

export type EvolutionMessagesUpsert = z.infer<
  typeof EvolutionMessagesUpsertSchema
>;
export type EvolutionMessagesUpsertData = z.infer<
  typeof EvolutionMessagesUpsertDataSchema
>;

// ── messages.update ──────────────────────────────────────────
export const EvolutionMessagesUpdateDataSchema = z.object({
  keyId: z.string().optional(),
  remoteJid: z.string().optional(),
  fromMe: z.boolean().optional(),
  participant: z.string().optional(),
  status: z.string().optional(),
  instanceId: z.string().optional(),
  messageId: z.string().optional(),
});

export const EvolutionMessagesUpdateSchema = z.object({
  event: z.literal('messages.update'),
  instance: z.string(),
  data: EvolutionMessagesUpdateDataSchema,
  date_time: z.string().optional(),
  sender: z.string().optional(),
});

export type EvolutionMessagesUpdate = z.infer<
  typeof EvolutionMessagesUpdateSchema
>;

// ── connection.update ────────────────────────────────────────
export const EvolutionConnectionUpdateDataSchema = z.object({
  instance: z.string().optional(),
  state: z.enum(['open', 'close', 'connecting']),
  statusReason: z.number().optional(),
  number: z.string().optional(), // phone number sent when state='open'
});

export const EvolutionConnectionUpdateSchema = z.object({
  event: z.literal('connection.update'),
  instance: z.string(),
  data: EvolutionConnectionUpdateDataSchema,
  date_time: z.string().optional(),
  sender: z.string().optional(),
});

export type EvolutionConnectionUpdate = z.infer<
  typeof EvolutionConnectionUpdateSchema
>;

// ── qrcode.updated ──────────────────────────────────────────
export const EvolutionQrcodeUpdatedDataSchema = z.object({
  qrcode: z.object({
    code: z.string().nullish(),
    base64: z.string().nullish(),
    pairingCode: z.string().nullish(),
  }).nullish(),
  // Some versions send flat fields
  code: z.string().nullish(),
  base64: z.string().nullish(),
  pairingCode: z.string().nullish(),
});

export type EvolutionQrcodeUpdatedData = z.infer<typeof EvolutionQrcodeUpdatedDataSchema>;

// ── messages.delete ─────────────────────────────────────────
export const EvolutionMessagesDeleteDataSchema = z.object({
  id: z.string().optional(),
  remoteJid: z.string().optional(),
  fromMe: z.boolean().optional(),
  participant: z.string().optional(),
  instanceId: z.string().optional(),
});

export type EvolutionMessagesDeleteData = z.infer<typeof EvolutionMessagesDeleteDataSchema>;

// ── call ────────────────────────────────────────────────────
export const EvolutionCallDataSchema = z.object({
  callId: z.string().optional(),
  from: z.string().optional(),
  isVideo: z.boolean().optional(),
  status: z.string().optional(),
  instanceId: z.string().optional(),
});

export type EvolutionCallData = z.infer<typeof EvolutionCallDataSchema>;

// ── Generic webhook (for routing) ────────────────────────────
export const EvolutionWebhookSchema = z.object({
  event: z.string(),
  instance: z.string(),
  data: z.record(z.string(), z.unknown()),
  date_time: z.string().optional(),
  sender: z.string().optional(),
});

export type EvolutionWebhook = z.infer<typeof EvolutionWebhookSchema>;

// Re-export individual message schemas for testing
export {
  TextMessageSchema,
  ExtendedTextMessageSchema,
  ImageMessageSchema,
  DocumentMessageSchema,
  AudioMessageSchema,
  VideoMessageSchema,
  ButtonsResponseMessageSchema,
  ListResponseMessageSchema,
};
