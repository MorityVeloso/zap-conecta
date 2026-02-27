import { z } from 'zod';

export const BulkSendDtoSchema = z.object({
  recipients: z
    .array(z.string().min(1))
    .min(1, 'At least 1 recipient')
    .max(1000, 'Maximum 1000 recipients per batch'),
  message: z.object({
    type: z.enum(['TEXT', 'IMAGE', 'DOCUMENT', 'AUDIO', 'VIDEO']),
    text: z.string().max(4096).optional(),
    mediaUrl: z.string().url().optional(),
    caption: z.string().max(1024).optional(),
    fileName: z.string().max(255).optional(),
  }),
  delay: z.number().int().min(500).max(30000).optional().default(1000),
});

export type BulkSendDto = z.infer<typeof BulkSendDtoSchema>;
