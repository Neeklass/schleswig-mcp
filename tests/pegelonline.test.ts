import { describe, expect, it } from 'vitest';
import {
  fetchSchleswigMeasurement,
  SOURCE_URL,
  STATION_ID,
} from '../src/providers/pegelonline.ts';
import { stationFixture } from './fixtures.ts';

describe('PEGELONLINE provider', () => {
  it('returns a domain reading without exposing the upstream response format', async () => {
    const reading = await fetchSchleswigMeasurement({
      fetch: async () => Response.json(stationFixture()),
    });

    expect(reading).toEqual({
      station: {
        id: STATION_ID,
        number: '9610040',
        name: 'SCHLESWIG',
        water: 'OSTSEE',
      },
      measurement: {
        value: 521,
        unit: 'cm',
        timestamp: '2026-10-14T15:24:00+02:00',
        reference: 'gauge_zero',
      },
      source: {
        name: 'PEGELONLINE',
        url: SOURCE_URL,
        license: 'DL-DE-Zero-2.0',
        licenseUrl: 'https://www.govdata.de/dl-de/zero-2-0',
      },
      notices: ['PEGELONLINE provides unvalidated raw measurements.'],
    });
  });

  it.each([
    [{ shortDescription: 'Short notice.' }, 'Short notice.'],
    [
      { shortDescription: 'Short notice.', longDescription: 'Full notice.' },
      'Full notice.',
    ],
    [
      { shortDescription: 'Short notice.', longDescription: '' },
      'Short notice.',
    ],
  ])('maps source comments to domain notices (%j)', async (comment, notice) => {
    const fixture = stationFixture();
    const reading = await fetchSchleswigMeasurement({
      fetch: async () =>
        Response.json({
          ...fixture,
          timeseries: [{ ...fixture.timeseries[0], comment }],
        }),
    });
    expect(reading.notices).toContain(`PEGELONLINE station notice: ${notice}`);
  });
});
