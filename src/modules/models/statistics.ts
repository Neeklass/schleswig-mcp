import { z } from 'zod';

// One official statistic series for Schleswig: a measure from one table,
// optionally broken down (e.g. by sex), with its values per period.
export const statisticSeriesSchema = z.strictObject({
  id: z.string().regex(/^[0-9A-Za-z.-]+$/),
  table: z.strictObject({
    code: z.string().regex(/^\d{5}-\d{2}-\d{2}-5$/),
    statistic: z.string().min(1),
  }),
  measure: z.strictObject({
    code: z.string().min(1),
    label: z.string().min(1),
  }),
  unit: z.string().min(1),
  breakdown: z.array(
    z.strictObject({
      variable: z.string().min(1),
      variableLabel: z.string().min(1),
      // null is the total over this variable ("Insgesamt").
      code: z.string().min(1).nullable(),
      label: z.string().min(1),
    }),
  ),
  values: z
    .array(
      z.strictObject({
        // A year (annual sum) or a reference date (stock on that day).
        period: z.string().regex(/^\d{4}(-\d{2}-\d{2})?$/),
        value: z.number().nullable(),
        // Official GENESIS sign when the source has no plain number, e.g.
        // "-" (nothing / not collected) or "." (confidential); value is null.
        marker: z.string().min(1).nullable(),
      }),
    )
    .min(1),
});
export type StatisticSeries = z.infer<typeof statisticSeriesSchema>;
