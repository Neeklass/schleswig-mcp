# Datasets discovered through GovData

GovData is the discovery catalog for these datasets, not their publisher. This
document corresponds to [`src/providers/govdata.ts`](../../src/providers/govdata.ts),
which groups both existing integrations and calls the publishers' verified
download/API endpoints directly. It does not query GovData at runtime. A shared
provider can supply several modules; the local snapshots remain optional.
Both sources have status **technically retrievable; provider implemented; not
publicly integrated**. The files `src/modules/bathing-waters.ts` and
`src/modules/population-forecast.ts` contain only the intended `govdata` assignment
comments. Neither implements a public function, REST endpoint, or MCP tool.

Local originals remain unchanged under `data/imported/govdata/` and are not
intended for direct production API use. The project owner will manually prepare
reduced datasets in `data/curated/`, potentially in Parquet, for later provider
use. No automatic preparation, conversion, or curated-data reader exists;
whether curated files will be versioned remains undecided.

License references checked on **2026-10-17**. These data licenses do not license
the project's source code.

## Bathing-water reference data

### Source and local file

- Discovery: [GovData bathing-water reference data](https://www.govdata.de/suche/daten/badegewasser-stammdaten).
- Source CSV linked by GovData: [bathing-water reference data download](https://efi2.schleswig-holstein.de/bg/opendata/v_badegewaesser_odata.csv).
- Publisher listed in the source metadata: Schleswig-Holstein's Ministry of
  Justice and Health (Ministerium für Justiz und Gesundheit).
- Local snapshot: [2026-04-01_Badegewaesser.csv](../../data/imported/govdata/2026-04-01_Badegewaesser.csv).

The source documents ISO-8859-1 encoding, pipe-separated columns, and double-quote
text delimiters. The local file begins directly with a data record; the ordered
field definitions are in the source metadata.

[`src/providers/govdata.ts`](../../src/providers/govdata.ts)
exports `fetchSchleswigBathingWaters()`. It parses the 29-column CSV, validates
municipality identifiers and selected records, and maps coordinates and fields
to typed records. The current CSV also includes literal quotes inside unquoted
fields, so the parser allows that specific source irregularity while still
checking column counts. Municipalities are selected using the district and
municipality key, not a substring search for "Schleswig".

Live retrieval and parsing verified on **2026-10-17**: 329 source records and
two records for Schleswig (Auf der Freiheit and Luisenbad). The download limit
is 4 MiB with a default 30-second deadline. The download has no reliable embedded
data date, so provider results use `dataAsOf: null`; the catalog date is not used
as the date of every returned record.

On **2026-10-16**, the local file matched the source CSV byte for byte. The date in
the local filename matches the catalog's **2026-04-01** modification date; the
download URL itself is not versioned. This file is different from the portal's
separately archived release with the same date.

### Data license and attribution

License: [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/).
GovData's [official metadata](https://www.govdata.de/ckan/api/3/action/package_show?id=badegewasser-stammdaten)
identifies CC BY 4.0 specifically for the CSV distribution and supplies
**Sozialministerium S-H** as the attribution text. Preserve that credit together
with the source and license links, and identify any changes to the data. This
declaration applies to the CSV; other distributions in the catalog can have
different license metadata.

### Updates and limitations

The source metadata declares an irregular update frequency. The local snapshot
is refreshed manually. It describes bathing-water locations and characteristics;
it does not establish current water quality, opening status, or swimming safety.
The publisher supplies measurements, classifications, infrastructure, and season
dates as separate datasets.

### Reacquisition

Download the [publisher's CSV](https://efi2.schleswig-holstein.de/bg/opendata/v_badegewaesser_odata.csv)
into a new dated file under `data/imported/govdata/`, retaining its original bytes
and encoding. Do not substitute the separately cataloged JSON distribution,
whose license metadata differs. The CSV URL is mutable; a fresh download is not
guaranteed to recreate the existing `2026-04-01_Badegewaesser.csv` snapshot. The
provider fetches the current CSV on explicit invocation and does not need a local
copy. Automated tests use synthetic data.

## Population projection through 2040

### Source and local file

- Discovery: [GovData population projection for Schleswig-Holstein through 2040](https://www.govdata.de/suche/daten/bevolkerungsvorausberechnung-fur-schleswig-holstein-bis-2040).
- Publisher: Bertelsmann Stiftung, through Wegweiser Kommune. The source metadata
  credits the statistical offices' research data centers and Deenst GmbH alongside
  Bertelsmann Stiftung.
- Local snapshot: [2025-06-04_Bevoelkerungsvorausrechnung_bis_2040.JSO](../../data/imported/govdata/2025-06-04_Bevoelkerungsvorausrechnung_bis_2040.JSO).

The file contains JSON despite its `.JSO` extension. It stores regions, indicators,
years, and value arrays. [`src/providers/govdata.ts`](../../src/providers/govdata.ts)
exports `fetchSchleswigPopulationProjection()`. It validates unique identifiers
and the dimensions of these arrays, selects municipality key `01059075`, and
associates each indicator value with its year. Missing values remain `null`.

Live retrieval and parsing verified on **2026-10-17**: 114 regions including the
state aggregate, 39 indicators, years **2018, 2020, 2030, 2035, 2040**. The local
snapshot and verified API response do not include 2025. The JSON download is
bounded to 16 MiB and 30 seconds by default. Its dataset date is not supplied
reliably in the response, so provider results use `dataAsOf: null`.

### Data license and attribution

License: [Creative Commons CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/).
The [official Open Data SH metadata](https://opendata.schleswig-holstein.de/api/3/action/package_show?id=bevolkerungsvorausberechnung-fur-schleswig-holstein-bis-2040)
declares `cc-zero` for the dataset and its JSON distribution. CC0 does not impose
an attribution requirement; retaining the publisher, source link, and snapshot
date is useful for provenance.

### Updates and limitations

The source metadata declares an irregular update frequency. The filename uses
the catalog's **2025-06-04** modification date; it is not a claim that every
underlying observation was measured on that date. Updates here are manual.

The published projection covers municipalities with at least 5,000 residents and
includes district and state aggregates. The dataset mixes historical inputs with
future projections; its future values depend on demographic assumptions. The
provider preserves the actual year axis and does not relabel all values as
observed population counts. No automatic refresh of local originals is performed.

### Reacquisition

The verified publisher API URL is:

```text
https://www.wegweiser-kommune.de/data-api/rest/statistics/data/demografie-bevoelkerungsstand+demografische-prognose-bewegung+bevoelkerung-nach-altersgruppen-1+anteile-der-altersgruppen-1-1+entwicklung-der-altersgruppen-1+generationsentwicklung+gemeinden-und-staedte-und-landkreise-aus-schleswig-holstein+schleswig-holstein+2018-2040+tabelle
```

Save the JSON response under a new dated filename in `data/imported/govdata/`.
The historical `.JSO` filename is retained locally, but new downloads may use
`.json`. The URL describes the selection rather than an immutable release;
exact reconstruction of an older snapshot requires an archived original and
checksum. The remote provider, builds, and tests do not use the local file.
