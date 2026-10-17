import { describe, expect, it } from 'vitest';
import { listSchleswigAddresses } from '../src/modules/addresses.ts';
import { listSchleswigMonuments } from '../src/modules/monuments.ts';
import { listSchleswigBathingWaters } from '../src/modules/bathing-waters.ts';
import { listSchleswigChargingStations } from '../src/modules/car-charging-stations.ts';
import { listSchleswigPopulationForecast } from '../src/modules/population-forecast.ts';

const features = [
  ['addresses', listSchleswigAddresses, 'Abelsteg'],
  ['monuments', listSchleswigMonuments, 'Dom'],
  ['bathing waters', listSchleswigBathingWaters, 'Luisenbad'],
  ['charging stations', listSchleswigChargingStations, 'Stadtwerke'],
  ['population forecast', listSchleswigPopulationForecast, 'Bevölkerung'],
] as const;

describe.each(features)('%s pagination and search', (_name, list, search) => {
  it('applies defaults and combines exact ID and trimmed, case-insensitive search', async () => {
    const defaults = await list();
    expect(defaults.pagination.limit).toBe(20);
    expect(defaults.pagination.offset).toBe(0);
    const match = await list({ q: search });
    expect(match.data.length).toBeGreaterThan(0);
    expect(await list({ q: ` ${search.toLocaleUpperCase('de-DE')} ` })).toEqual(
      match,
    );
    const id = match.data[0]!.id;
    expect((await list({ q: search, id })).data).toEqual([match.data[0]]);
    expect((await list({ q: 'no-such-search-value', id })).data).toEqual([]);
    expect((await list({ q: search, id: 'missing' })).pagination).toMatchObject(
      { total: 0, returned: 0, nextOffset: null },
    );
  });

  it('traverses every record once, handles final and out-of-range pages and bounds payloads', async () => {
    const first = await list({ limit: 100 });
    const records = [...first.data];
    let next = first.pagination.nextOffset;
    while (next !== null) {
      const page = await list({ limit: 100, offset: next });
      expect(page.pagination.total).toBe(first.pagination.total);
      expect(page.pagination.returned).toBe(page.data.length);
      expect(page.data.length).toBeGreaterThan(0);
      records.push(...page.data);
      if (page.pagination.nextOffset !== null)
        expect(page.pagination.nextOffset).toBeGreaterThan(next);
      next = page.pagination.nextOffset;
    }
    const total = first.pagination.total;
    expect(records).toHaveLength(total);
    expect(new Set(records.map((record) => record.id)).size).toBe(total);
    expect(
      (await list({ offset: total - 1, limit: 100 })).pagination,
    ).toMatchObject({ returned: 1, nextOffset: null });
    for (const offset of [total, total + 1, Number.MAX_SAFE_INTEGER]) {
      const page = await list({ offset });
      expect(page.data).toEqual([]);
      expect(page.pagination).toEqual({
        offset,
        limit: 20,
        total,
        returned: 0,
        nextOffset: null,
      });
    }
    // The largest 100 records bound any filtered page. Include both MCP content
    // representations and JSON-RPC framing, with ample headroom below 4.5 MB.
    const size = (value: unknown) => Buffer.byteLength(JSON.stringify(value));
    const recordSize = (value: unknown) =>
      size(value) + size(JSON.stringify(value));
    const worstPage = {
      ...first,
      data: records.sort((a, b) => recordSize(b) - recordSize(a)).slice(0, 100),
    };
    const payload = {
      jsonrpc: '2.0',
      id: 1,
      result: {
        structuredContent: worstPage,
        content: [{ type: 'text', text: JSON.stringify(worstPage) }],
      },
    };
    expect(size(payload)).toBeLessThan(1_000_000);
  });
});
