import { STATION_ID } from '../src/providers/pegelonline.ts';

// Synthetic values in the shape verified against the official station endpoint.
export function stationFixture() {
  return {
    uuid: STATION_ID,
    number: '9610040',
    longname: 'SCHLESWIG',
    water: { longname: 'OSTSEE' },
    timeseries: [
      {
        shortname: 'W',
        unit: 'cm',
        equidistance: 1,
        currentMeasurement: {
          timestamp: '2026-10-14T15:24:00+02:00',
          value: 521,
        },
      },
    ],
  };
}

export const NOW = new Date('2026-10-14T13:25:00Z');
