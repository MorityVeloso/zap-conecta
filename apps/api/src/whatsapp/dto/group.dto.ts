import { z } from 'zod';

export const CreateGroupDtoSchema = z.object({
  subject: z.string().min(1).max(100),
  participants: z.array(z.string().min(1)).min(1),
  description: z.string().max(512).optional(),
});

export type CreateGroupDto = z.infer<typeof CreateGroupDtoSchema>;

export const UpdateParticipantsDtoSchema = z.object({
  action: z.enum(['add', 'remove', 'promote', 'demote']),
  participants: z.array(z.string().min(1)).min(1),
});

export type UpdateParticipantsDto = z.infer<typeof UpdateParticipantsDtoSchema>;

export const UpdateGroupSubjectDtoSchema = z.object({
  subject: z.string().min(1).max(100),
});

export type UpdateGroupSubjectDto = z.infer<typeof UpdateGroupSubjectDtoSchema>;

export const UpdateGroupDescriptionDtoSchema = z.object({
  description: z.string().max(512),
});

export type UpdateGroupDescriptionDto = z.infer<typeof UpdateGroupDescriptionDtoSchema>;

export const UpdateGroupPictureDtoSchema = z.object({
  picture: z.string().url('Invalid picture URL'),
});

export type UpdateGroupPictureDto = z.infer<typeof UpdateGroupPictureDtoSchema>;

export const UpdateGroupSettingDtoSchema = z.object({
  action: z.enum([
    'announcement',       // only admins can send messages
    'not_announcement',   // all participants can send
    'locked',             // only admins can edit group info
    'unlocked',           // all participants can edit
  ]),
});

export type UpdateGroupSettingDto = z.infer<typeof UpdateGroupSettingDtoSchema>;

export const SendGroupInviteDtoSchema = z.object({
  numbers: z.array(z.string().min(1)).min(1),
  description: z.string().max(256).optional(),
});

export type SendGroupInviteDto = z.infer<typeof SendGroupInviteDtoSchema>;
