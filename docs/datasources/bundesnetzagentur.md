# Bundesnetzagentur charging-station register

Provider: [`src/providers/bundesnetzagentur.ts`](../../src/providers/bundesnetzagentur.ts).
Publisher and original data provider: **Bundesnetzagentur** (Federal Network Agency).
No discovery catalog is required. Status: **Gold reader, domain module, REST and
MCP implemented**. Consumer: `src/modules/car-charging-stations.ts`, REST
`/api/v1/schleswig/charging-stations`, MCP `list_schleswig_charging_stations`.

## Original and Gold data

- [Official map, downloads and terms](https://www.bundesnetzagentur.de/DE/Fachthemen/ElektrizitaetundGas/E-Mobilitaet/Ladesaeulenkarte/start.html).
- [Pinned CSV download](https://data.bundesnetzagentur.de/Bundesnetzagentur/DE/Fachthemen/ElektrizitaetundGas/E-Mobilitaet/Ladesaeulenregister_BNetzA_2026-09-01.csv).
- Optional local original: `data/imported/bundesnetzagentur/2026-09-01_Ladesaeulenregister.csv`.
- Format: UTF-8 semicolon-separated CSV with introductory lines, quoted multiline
  values, decimal commas and German date strings. Original: 116,443 records.
- Gold: [`data/curated/bundesnetzagentur/charging-stations.json`](../../data/curated/bundesnetzagentur/charging-stations.json),
  **61 installations**, each with address, coordinates, connector details and
  source identifiers. All station IDs are unique. Gold coordinates use EPSG:4326;
  latitude/longitude numbers were retained from the source without transformation.

Selection is `Ort = Schleswig`, postal code `24837`, state `Schleswig-Holstein`.
The Gold municipality is Schleswig city, AGS `01059075`. The source selection
uses administrative address fields, not a geographic boundary intersection or
a substring match on the district/state.

## Dates and evidenced processing

The original preamble explicitly says the register was updated **2026-09-01**.
Gold uses this as the register snapshot date (`dataAsOf`) and `sourceUpdatedAt`.
It does not date every commissioning event. Publication time is unknown.
Actual download/preparation timestamps are unproven and remain null; the formerly
claimed preparation timestamp was removed.

Manual preparation selected Schleswig, renamed fields, grouped address/coordinate
objects and charging points/connectors, converted numbers and dates, split
payment/connector lists, removed empty list entries, and converted missing
optional values and `Keine Angabe` opening hours to null. It retains the source
opening-hours code, including `247`. Separate weekday/time columns are omitted
(12 retained installations have source details in those columns).

The 2026-10-17 audit
compared all 61 retained records, including connector type/power,
EVSE IDs, public keys, addresses, dates and coordinates, with the original.
The data array was unchanged. The top-level `recordCount` was moved into metadata;
processing, source format/download and explicit date semantics were added.

## License

The official download page explicitly licenses the published register list under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) and requires the credit
**Bundesnetzagentur.de**. This was rechecked on 2026-10-18. Preserve that credit,
the source and license URLs, and `processing.steps` as the modification notice.
This does not select a source-code license.

## Access, updates and limitations

`getChargingStationDataset()` reads and validates cached Gold. The original
`fetchSchleswigChargingStations()` remains an explicit remote inspection reader,
bounded to 128 MiB and 60 seconds; no endpoint calls it. Neither creates Gold.

For updates, obtain a new release from the official page, verify its preamble,
license and fields, and save it under a new name in `data/imported/bundesnetzagentur/`.
The owner prepares a replacement Gold snapshot manually, updates provenance,
runs `npm run check`, then restarts/redeploys. No automatic refresh is implemented.
The existing `data/scripts/filter_charging_stations.py` targets an older
intermediate CSV, not the current Gold JSON.

The official page checked on 2026-10-18 lists a release dated 2026-09-30. The
packaged snapshot remains 2026-09-01; this documentation review did not replace
it. Availability of newer upstream data does not update the API automatically.

The register is not exhaustive: it includes installations whose notification
procedure was complete at the update date. Status is not live occupancy or
connector availability. The publisher does not guarantee accuracy/completeness.
Public keys are meter-verification material supplied in the public source, not
application secrets.
