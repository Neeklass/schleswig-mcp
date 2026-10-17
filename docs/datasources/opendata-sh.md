# Open Data SH heritage register

This document corresponds to [`src/providers/opendata-sh.ts`](../../src/providers/opendata-sh.ts).
The provider groups sources accessed through Open Data SH and can supply several
modules. Open Data SH is the publication portal; the publisher of this dataset is
identified below. The existing `src/modules/monuments.ts` file contains only its
provider assignment comment and does not expose a function.

## Source and local file

Provider: Schleswig-Holstein's State Office for Heritage Conservation
(Landesamt für Denkmalpflege Schleswig-Holstein).

- Source: [heritage register release of 2026-10-12](https://opendata.schleswig-holstein.de/dataset/denkmalliste-2026-10-12).
- Local snapshot: [2026-10-12_Denkmalliste.json](../../data/imported/opendata-sh/2026-10-12_Denkmalliste.json).
- Format: JSON records with source field names in German, covering identifiers,
  locations, descriptions, heritage types, and the scope and grounds of protection.

Status: **technically retrievable; provider implemented; not publicly integrated**.
[`src/providers/opendata-sh.ts`](../../src/providers/opendata-sh.ts) exports
`fetchSchleswigHeritage()`. It downloads the pinned release, validates the JSON,
selects Schleswig in Schleswig-Flensburg, and maps fields into typed records.
Missing address/protection details remain `null`. Photo URLs are not exposed or
downloaded. No public module, REST endpoint, or MCP tool uses this provider yet.
The local original remains optional and unchanged.

Originals in `data/imported/` are not intended for direct production API use.
Reduced datasets will be prepared manually by the project owner in
`data/curated/`, potentially in Parquet, for later provider use. No automatic
preparation, conversion, or curated-data reader exists; curated-file versioning
remains undecided. The current provider fetches the remote release only when called.

Live retrieval and parsing verified on **2026-10-17**: 11,621 source records,
251 selected records. The JSON download is limited to 16 MiB and 30 seconds by
default. The full bounded JSON is parsed once per explicit provider call.

## Data license and attribution

License: [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/).
The release's [official metadata](https://opendata.schleswig-holstein.de/api/3/action/package_show?id=denkmalliste-2026-10-12)
identifies CC BY 4.0 and supplies **Landesamt für Denkmalpflege Schleswig-Holstein**
as the attribution text. License references checked on **2026-10-17**.

Retain this credit, the source link, and the license link, and identify any
changes when distributing adapted data. This data license does not license the
project's source code.

## Updates and limitations

The publisher describes weekly publication and ongoing corrections and additions.
The integration deliberately pins the 2026-10-12 release. To update, verify the
new release metadata and license, update `HERITAGE_URL` and `dataAsOf` together,
and run an explicit live check. There is no automatic latest-release discovery.
Local originals are only added manually, under a new dated filename.

The register is not exhaustive. Some descriptions and protection details migrated
from the register used before 2015 have not yet been fully updated. A local
snapshot can therefore differ from the current official register.

## Reacquisition

The exact JSON resource for the pinned release is:

```text
https://opendata.schleswig-holstein.de/dataset/f67c373c-3665-4ddf-946b-285b550a72a4/resource/810e96ef-0cf3-445a-a3ce-080d77696930/download/denkmalliste.json
```

Download it into `data/imported/opendata-sh/2026-10-12_Denkmalliste.json` only if
that file is absent; otherwise use a new name. The provider itself does not need
this local file. The catalog's separate Frictionless metadata JSON is not the
record array and must not be substituted for this download.
