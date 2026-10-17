import { z } from 'zod';
export const populationIndicatorSchema = z.strictObject({
  id: z.string().regex(/^\d+$/),
  name: z.string().min(1),
  unit: z.string().min(1),
  explanation: z.string(),
  calculation: z.string(),
  source: z.string(),
  values: z
    .array(
      z.strictObject({
        year: z.number().int().min(1900).max(2200),
        value: z.number().nullable(),
      }),
    )
    .min(1),
});
export type PopulationIndicator = z.infer<typeof populationIndicatorSchema>;
