import { z } from 'zod';

// One calendar day (Europe/Berlin) of raw PEGELONLINE W measurements.
export const waterLevelDaySchema = z
  .strictObject({
    id: z.iso.date(),
    date: z.iso.date(),
    unit: z.literal('cm'),
    reference: z.literal('gauge_zero'),
    minimum: z.number(),
    mean: z.number(),
    maximum: z.number(),
    measurementCount: z.number().int().positive().max(1500),
  })
  .refine((day) => day.id === day.date, {
    message: 'The identifier must equal the date.',
    path: ['id'],
  })
  .refine((day) => day.minimum <= day.mean && day.mean <= day.maximum, {
    message: 'Expected minimum <= mean <= maximum.',
    path: ['mean'],
  });
export type WaterLevelDay = z.infer<typeof waterLevelDaySchema>;
