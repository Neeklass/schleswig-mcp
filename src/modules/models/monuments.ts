import { z } from 'zod';
export const monumentSchema = z.strictObject({
  id: z.string().regex(/^\d+$/),
  name: z.string().min(1),
  description: z.string(),
  heritageType: z.string().min(1),
  municipality: z.literal('Schleswig, Stadt'),
  district: z.literal('Kreis Schleswig-Flensburg'),
  addressLocation: z.string().optional(),
  protectionScope: z.array(z.string()).optional(),
  protectionReason: z.array(z.string()).optional(),
  photoURL: z.url().optional(),
});
export type Monument = z.infer<typeof monumentSchema>;
