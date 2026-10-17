import { z } from 'zod';
export const addressSchema = z.strictObject({
  id: z.string().regex(/^[A-Za-z0-9]{16}$/),
  street: z.string().min(1),
  streetCode: z.string().regex(/^[A-Za-z0-9]{5}$/),
  houseNumber: z.string().regex(/^\d+$/),
  addressExtra: z.string().min(1).nullable(),
  postalCode: z
    .string()
    .regex(/^\d{5}$/)
    .nullable(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});
export type Address = z.infer<typeof addressSchema>;
