import { z } from 'zod';

export const ScheduleMessageDtoSchema = z.object({
  phone: z.string().min(1),
  type: z.enum(['TEXT', 'IMAGE', 'DOCUMENT', 'AUDIO', 'VIDEO']),
  payload: z.object({
    text: z.string().optional(),
    mediaUrl: z.string().url().optional(),
    caption: z.string().max(1024).optional(),
    fileName: z.string().max(255).optional(),
  }),
  scheduledAt: z.string().datetime({ message: 'ISO 8601 datetime required' }),
});

export type ScheduleMessageDto = z.infer<typeof ScheduleMessageDtoSchema>;
