/**
 * Evolution API Webhook Transformer
 * Converts Evolution API v2 webhook payloads to the internal
 * ReceivedMessageWebhook / MessageStatusWebhook formats used
 * by WhatsAppService, so the rest of the codebase is unaffected.
 */

import type {
  EvolutionMessagesUpsertData,
  EvolutionMessagesUpdate,
} from './dto/evolution-webhook.dto';
import type {
  ReceivedMessageWebhook,
  MessageStatusWebhook,
} from './dto/webhook.dto';

/**
 * Extract the phone number from a WhatsApp JID.
 * Handles `@s.whatsapp.net`, `@g.us`, and `@lid` formats.
 */
export function extractPhoneFromJid(jid: string): string {
  return jid
    .replace(/@s\.whatsapp\.net$/, '')
    .replace(/@g\.us$/, '')
    .replace(/@lid$/, '');
}

/**
 * Detect whether a JID represents a group chat.
 */
export function isGroupJid(jid: string): boolean {
  return jid.endsWith('@g.us');
}

/**
 * Extract text content from an Evolution message object.
 */
function extractText(
  messageType: string,
  message: Record<string, unknown>,
): string | undefined {
  if (
    messageType === 'conversation' &&
    typeof message.conversation === 'string'
  ) {
    return message.conversation;
  }

  if (messageType === 'extendedTextMessage') {
    const ext = message.extendedTextMessage as
      | Record<string, unknown>
      | undefined;
    if (ext && typeof ext.text === 'string') {
      return ext.text;
    }
  }

  return undefined;
}

/**
 * Extract button response from an Evolution message object.
 */
function extractButtonResponse(
  messageType: string,
  message: Record<string, unknown>,
): ReceivedMessageWebhook['buttonsResponseMessage'] | undefined {
  if (messageType !== 'buttonsResponseMessage') return undefined;

  const resp = message.buttonsResponseMessage as
    | Record<string, unknown>
    | undefined;
  if (!resp) return undefined;

  return {
    buttonId:
      typeof resp.selectedButtonId === 'string'
        ? resp.selectedButtonId
        : undefined,
    message:
      typeof resp.selectedDisplayText === 'string'
        ? resp.selectedDisplayText
        : undefined,
  };
}

/**
 * Extract list response from an Evolution message object.
 */
function extractListResponse(
  messageType: string,
  message: Record<string, unknown>,
): ReceivedMessageWebhook['listResponseMessage'] | undefined {
  if (messageType !== 'listResponseMessage') return undefined;

  const resp = message.listResponseMessage as
    | Record<string, unknown>
    | undefined;
  if (!resp) return undefined;

  const singleSelectReply = resp.singleSelectReply as
    | Record<string, unknown>
    | undefined;
  return {
    selectedRowId:
      typeof singleSelectReply?.selectedRowId === 'string'
        ? singleSelectReply.selectedRowId
        : undefined,
    title: typeof resp.title === 'string' ? resp.title : undefined,
    message:
      typeof resp.description === 'string' ? resp.description : undefined,
  };
}

/**
 * Transform an Evolution API `messages.upsert` data payload into
 * the internal `ReceivedMessageWebhook` format consumed by WhatsAppService.
 */
export function transformEvolutionMessage(
  data: EvolutionMessagesUpsertData,
): ReceivedMessageWebhook {
  const jid = data.key.remoteJid;
  const phone = extractPhoneFromJid(jid);
  const message = data.message ?? {};
  const messageType = data.messageType;

  const textContent = extractText(messageType, message);
  const buttonsResponse = extractButtonResponse(messageType, message);
  const listResponse = extractListResponse(messageType, message);

  // Image
  const imageMsg =
    messageType === 'imageMessage'
      ? (message.imageMessage as Record<string, unknown> | undefined)
      : undefined;

  // Document
  const documentMsg =
    messageType === 'documentMessage'
      ? (message.documentMessage as Record<string, unknown> | undefined)
      : undefined;

  // Audio
  const audioMsg =
    messageType === 'audioMessage'
      ? (message.audioMessage as Record<string, unknown> | undefined)
      : undefined;

  // Video
  const videoMsg =
    messageType === 'videoMessage'
      ? (message.videoMessage as Record<string, unknown> | undefined)
      : undefined;

  return {
    phone,
    fromMe: data.key.fromMe,
    messageId: data.key.id,
    isGroup: isGroupJid(jid),
    timestamp: data.messageTimestamp,
    senderName: data.pushName ?? undefined,
    // Text
    text: textContent ? { message: textContent } : undefined,
    // Button response (Evolution -> internal format)
    buttonsResponseMessage: buttonsResponse,
    // List response (Evolution -> internal format)
    listResponseMessage: listResponse,
    // Image
    image: imageMsg
      ? {
          url: typeof imageMsg.url === 'string' ? imageMsg.url : undefined,
          caption:
            typeof imageMsg.caption === 'string' ? imageMsg.caption : undefined,
          mimeType:
            typeof imageMsg.mimetype === 'string'
              ? imageMsg.mimetype
              : undefined,
        }
      : undefined,
    // Document
    document: documentMsg
      ? {
          url:
            typeof documentMsg.url === 'string' ? documentMsg.url : undefined,
          fileName:
            typeof documentMsg.fileName === 'string'
              ? documentMsg.fileName
              : undefined,
          mimeType:
            typeof documentMsg.mimetype === 'string'
              ? documentMsg.mimetype
              : undefined,
        }
      : undefined,
    // Audio
    audio: audioMsg
      ? {
          url: typeof audioMsg.url === 'string' ? audioMsg.url : undefined,
          mimeType:
            typeof audioMsg.mimetype === 'string'
              ? audioMsg.mimetype
              : undefined,
        }
      : undefined,
    // Video
    video: videoMsg
      ? {
          url: typeof videoMsg.url === 'string' ? videoMsg.url : undefined,
          caption:
            typeof videoMsg.caption === 'string' ? videoMsg.caption : undefined,
          mimeType:
            typeof videoMsg.mimetype === 'string'
              ? videoMsg.mimetype
              : undefined,
        }
      : undefined,
  };
}

/**
 * Map Evolution API status string to the internal status enum.
 */
function mapStatus(
  status: string | undefined,
): 'PENDING' | 'SENT' | 'RECEIVED' | 'READ' | 'PLAYED' | 'ERROR' {
  const mapping: Record<
    string,
    'PENDING' | 'SENT' | 'RECEIVED' | 'READ' | 'PLAYED' | 'ERROR'
  > = {
    PENDING: 'PENDING',
    SERVER_ACK: 'SENT',
    DELIVERY_ACK: 'RECEIVED',
    READ: 'READ',
    PLAYED: 'PLAYED',
    DELETED: 'ERROR',
  };
  return mapping[status ?? ''] ?? 'PENDING';
}

/**
 * Transform an Evolution API `messages.update` payload into
 * the internal `MessageStatusWebhook` format.
 */
export function transformEvolutionMessageStatus(
  data: EvolutionMessagesUpdate['data'],
): MessageStatusWebhook {
  const phone = data.remoteJid ? extractPhoneFromJid(data.remoteJid) : '';
  return {
    messageId: data.keyId ?? data.messageId ?? '',
    phone,
    status: mapStatus(data.status),
  };
}
