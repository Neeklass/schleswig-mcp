# Bundesnetzagentur charging-station register

This document corresponds to [`src/providers/bundesnetzagentur.ts`](../../src/providers/bundesnetzagentur.ts).
The provider represents the agency and can supply several modules or data
products. Currently only the register reader below is implemented. The existing
`src/modules/car-charging-stations.ts` file contains only its provider assignment
comment and does not expose a function.

## Source and local file

Provider: Germany's Federal Network Agency (Bundesnetzagentur).
The [official charging-station map and downloads](https://www.bundesnetzagentur.de/DE/Fachthemen/ElektrizitaetundGas/E-Mobilitaet/Ladesaeulenkarte/start.html)
publish registered publicly accessible charging infrastructure in Germany.

- Local snapshot: [2026-09-01_Ladesaeulenregister.csv](../../data/imported/bundesnetzagentur/2026-09-01_Ladesaeulenregister.csv).
- The file's introductory rows identify its update date as **2026-09-01**.
- Format: semicolon-separated CSV, with introductory rows before the column
  headers and decimal commas in coordinates.

Status: **technically retrievable; provider implemented; not publicly integrated**.
[`src/providers/bundesnetzagentur.ts`](../../src/providers/bundesnetzagentur.ts)
exports `fetchSchleswigChargingStations()`. It streams the pinned CSV download,
discovers and validates the header and update date, supports quoted multiline
fields and decimal commas, and maps selected fields to typed records. It selects
`Ort = Schleswig`, postal code `24837`, and state `Schleswig-Holstein`; this is
an explicit source-field selection, not a geographical boundary intersection.
No public module, REST endpoint, or MCP tool calls it. Local originals are optional.

Originals in `data/imported/` remain unchanged and are not intended for direct
production API use. The project owner will manually prepare reduced datasets in
`data/curated/`, potentially in Parquet, for later provider use. There is no automatic
preparation, conversion, or curated-data reader, and curated-file versioning remains
undecided. The existing remote reader does not write local or prepared files.

Live retrieval and parsing verified on **2026-10-17**: 116,443 source records,
61 selected records. The 55,559,083-byte CSV is streamed and only the selected
records are retained. The download limit is 128 MiB and the default deadline is
60 seconds. Call this during an explicit refresh, not on every API request.

## Data license and attribution

License: [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/).
The agency explicitly assigns this license to both the map and the published
register list in the data-use notice on its
[official download page](https://www.bundesnetzagentur.de/DE/Fachthemen/ElektrizitaetundGas/E-Mobilitaet/Ladesaeulenkarte/start.html).
License references checked on **2026-10-17**.

The required attribution name is **Bundesnetzagentur.de**. Retain the source and
license links and identify any changes when distributing adapted data.
This data license does not license the project's source code.

## Updates and limitations

The publisher provides updated downloads. This integration deliberately pins a
verified release; it does not scrape the map or silently select another release.
Verify a newer CSV and its license on the official download page before updating
`CHARGING_STATIONS_URL`. The provider reads the data date from the CSV preamble.
Keep downloaded originals under distinct dated filenames. No scheduled refresh
is implemented here.

The register covers operators that completed the notification procedure and is
not a complete inventory of all publicly accessible charging infrastructure.
The agency disclaims accuracy and completeness. The snapshot does not provide
live connector availability or charging-session status.

## Reacquisition

Exact pinned download:

```text
https://data.bundesnetzagentur.de/Bundesnetzagentur/DE/Fachthemen/ElektrizitaetundGas/E-Mobilitaet/Ladesaeulenregister_BNetzA_2026-09-01.csv
```

Save it as `data/imported/bundesnetzagentur/2026-09-01_Ladesaeulenregister.csv`
if absent, or under a new name. It is excluded from Git and is not needed by
tests, builds, or the water-level API. The provider downloads the resource only
when explicitly called and does not write a local file.
