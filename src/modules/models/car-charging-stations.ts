import { z } from 'zod';
export const chargingStationSchema = z
  .strictObject({
    id: z.string().regex(/^\d+$/),
    operator: z.string().min(1),
    displayName: z.string().nullable(),
    status: z.string().min(1),
    stationType: z.string().min(1),
    chargingPointCount: z.number().int().positive(),
    ratedPowerKw: z.number().positive(),
    commissionedAt: z.iso.date(),
    address: z.strictObject({
      street: z.string().min(1),
      houseNumber: z.string(),
      addressSuffix: z.string().nullable(),
      postalCode: z.literal('24837'),
      city: z.literal('Schleswig'),
    }),
    coordinates: z.strictObject({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
    }),
    locationName: z.string().nullable(),
    parkingInformation: z.string().nullable(),
    paymentMethods: z.array(z.string().min(1)),
    openingHours: z.string().nullable(),
    chargingPoints: z
      .array(
        z.strictObject({
          position: z.number().int().positive(),
          connectors: z
            .array(
              z.strictObject({
                connectorType: z.string().min(1),
                ratedPowerKw: z.number().positive(),
              }),
            )
            .min(1),
          evseId: z.string().nullable(),
          publicKey: z.string().nullable(),
        }),
      )
      .min(1),
  })
  .superRefine((station, context) => {
    if (
      station.chargingPoints.length !== station.chargingPointCount ||
      station.chargingPoints.some(
        (point, index) => point.position !== index + 1,
      )
    )
      context.addIssue({
        code: 'custom',
        message: 'Charging-point counts or positions do not match.',
      });
  });
export type ChargingStation = z.infer<typeof chargingStationSchema>;
