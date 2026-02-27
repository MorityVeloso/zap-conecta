import { z } from 'zod';

export const SendPresenceDtoSchema = z.object({
  phone: z.string().min(1),
  presence: z.enum(['composing', 'recording', 'paused']),
  delay: z.number().int().min(0).max(30000).optional(),
});

export type SendPresenceDto = z.infer<typeof SendPresenceDtoSchema>;

export const DeleteMessageDtoSchema = z.object({
  messageId: z.string().min(1),
  remoteJid: z.string().min(1),
  fromMe: z.boolean(),
});

export type DeleteMessageDto = z.infer<typeof DeleteMessageDtoSchema>;

export const EditMessageDtoSchema = z.object({
  messageId: z.string().min(1),
  remoteJid: z.string().min(1),
  fromMe: z.boolean(),
  text: z.string().min(1).max(4096),
});

export type EditMessageDto = z.infer<typeof EditMessageDtoSchema>;

export const BlockContactDtoSchema = z.object({
  phone: z.string().min(1),
});

export type BlockContactDto = z.infer<typeof BlockContactDtoSchema>;

export const UpdateProfileNameDtoSchema = z.object({
  name: z.string().min(1).max(25),
});

export type UpdateProfileNameDto = z.infer<typeof UpdateProfileNameDtoSchema>;

export const UpdateProfileStatusDtoSchema = z.object({
  status: z.string().min(1).max(139),
});

export type UpdateProfileStatusDto = z.infer<typeof UpdateProfileStatusDtoSchema>;

export const UpdateProfilePictureDtoSchema = z.object({
  picture: z.string().url('Invalid picture URL'),
});

export type UpdateProfilePictureDto = z.infer<typeof UpdateProfilePictureDtoSchema>;

export const PrivacySettingsDtoSchema = z.object({
  readreceipts: z.enum(['all', 'none']).optional(),
  profile: z.enum(['all', 'contacts', 'contact_blacklist', 'none']).optional(),
  status: z.enum(['all', 'contacts', 'contact_blacklist', 'none']).optional(),
  online: z.enum(['all', 'match_last_seen']).optional(),
  last: z.enum(['all', 'contacts', 'contact_blacklist', 'none']).optional(),
  groupadd: z.enum(['all', 'contacts', 'contact_blacklist']).optional(),
});

export type PrivacySettingsDto = z.infer<typeof PrivacySettingsDtoSchema>;

export const SetPresenceDtoSchema = z.object({
  presence: z.enum(['available', 'unavailable']),
});

export type SetPresenceDto = z.infer<typeof SetPresenceDtoSchema>;

export const DownloadMediaDtoSchema = z.object({
  messageId: z.string().min(1),
  remoteJid: z.string().min(1),
  fromMe: z.boolean(),
});

export type DownloadMediaDto = z.infer<typeof DownloadMediaDtoSchema>;

// ── Labels ──────────────────────────────────────

export const HandleLabelDtoSchema = z.object({
  labelId: z.string().min(1),
  chatId: z.string().min(1),
  action: z.enum(['add', 'remove']),
});

export type HandleLabelDto = z.infer<typeof HandleLabelDtoSchema>;

// ── Archive ─────────────────────────────────────

export const ArchiveChatDtoSchema = z.object({
  chatId: z.string().min(1),
  archive: z.boolean(),
});

export type ArchiveChatDto = z.infer<typeof ArchiveChatDtoSchema>;

// ── Status/Stories ──────────────────────────────

export const SendStatusDtoSchema = z.object({
  type: z.enum(['text', 'image', 'video', 'audio']),
  content: z.string().min(1),
  caption: z.string().optional(),
  backgroundColor: z.string().optional(),
  font: z.number().int().min(0).max(5).optional(),
  allContacts: z.boolean().default(true),
  statusJidList: z.array(z.string()).optional(),
});

export type SendStatusDto = z.infer<typeof SendStatusDtoSchema>;
