# Geodata SH address coordinates

This document corresponds to [`src/providers/geodata.ts`](../../src/providers/geodata.ts).
The existing `addresses.ts` module file contains only the `geodata-sh` source
comment; it has no implementation or public integration. The raw-data folder
retains the name `data/imported/geodata-sh/`.

## Source and local files

Provider: Schleswig-Holstein's surveying and geoinformation authority
(Landesamt für Vermessung und Geoinformation Schleswig-Holstein, LVermGeo SH).
The [official download page](https://geodaten.schleswig-holstein.de/gaialight-sh/_apps/dladownload/dl-hk_alkis.html)
provides house coordinates from ALKIS without postal-code reconciliation.

- Local snapshot: [2026-06-01_Adressen.txt](../../data/imported/geodata-sh/2026-06-01_Adressen.txt).
- Format specification: [ALKIS house-coordinate format, April 2023](../../data/imported/geodata-sh/Datenformat_HK_aus_ALKIS_ohne_PLZ_Abgleich_04_2023.pdf).
- Accompanying source notes: [info-sh.txt](../../data/imported/geodata-sh/info-sh.txt).

The source notes record an extraction date of **2026-06-01**, 953,360 house
coordinates, and the coordinate reference system **ETRS89 / UTM zone 32N
(EPSG:25832)**.

Status: **local provider implemented and verified; download portal reachable;
not publicly integrated**. There is no implemented remote download API.
[`src/providers/geodata.ts`](../../src/providers/geodata.ts) exports
`loadSchleswigAddresses(path, dataAsOf)`. Both arguments must be supplied explicitly;
the loader does not depend on a file being present after a clone.

The provider streams the UTF-8 file, validates its 24 semicolon-separated fields,
selects municipality key `01059075`, and maps the selected records into typed
addresses. House-number suffixes, quality codes, and projected coordinates are
preserved. There is no coordinate conversion or street-list API. This retained
reader is an explicit offline inspection operation; it does not modify the source
or write prepared files. Originals are not intended for direct production API use.
The project owner will manually prepare reduced datasets in `data/curated/`,
potentially in Parquet, for later provider use. There is no automatic preparation,
conversion, or curated-data reader, and curated-file versioning remains undecided.

Verified against the existing local original on **2026-10-17**: 953,360 records,
7,619 selected addresses. The download portal and its public configuration were
also reachable using the operating system's certificate store. Node's default
certificate verification failed for that host with an incomplete-chain error;
TLS verification was not disabled. An automated archive download is not claimed
as verified or implemented.

## Data license and attribution

License: [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/).
The official [OpenGBD terms of use](https://geodaten.schleswig-holstein.de/gaialight-sh/_apps/dladownload/lizenz.html)
state this license and specify the attribution. License references checked on
**2026-10-17**.

Required source credit: **©GeoBasis-DE/LVermGeo SH/CC BY 4.0**. Include the dataset
and license links. For modified data, the provider specifies the additional
wording **(Quelle verändert)**, meaning "source modified".
This data license does not license the project's source code.

## Updates and limitations

This is a manually imported snapshot. A fixed upstream update interval has not
been verified; consult the download page for newer releases.

Coordinates use projected metres, not longitude and latitude. Postal-code
reconciliation is not part of this product. The accompanying notes describe
address peculiarities, including house-number ranges represented by several
addresses at the same coordinate, parenthesized address suffixes, and courtyard
addressing in Lübeck. Preserve these source values during import.

## Reacquisition

Open the official [house-coordinate download client](https://geodaten.schleswig-holstein.de/gaialight-sh/_apps/dladownload/dl-hk_alkis.html),
select the available house-coordinate dataset, and download the UTF-8/ZIP product.
The client assembles downloads through its selection interface; a stable direct
archive URL has not been verified. Retain the included format PDF and `info-sh.txt`.
Extract into a new subdirectory of `data/imported/geodata-sh/` so existing originals
are not overwritten. Use the extraction date in `info-sh.txt` as `dataAsOf`.
The portal may only offer a newer release; it is not a guarantee that the local
2026-06-01 snapshot can be recreated byte for byte later.

Example after acquiring the documented snapshot:

```sh
node --input-type=module -e "import { loadSchleswigAddresses } from './src/providers/geodata.ts'; console.log((await loadSchleswigAddresses('data/imported/geodata-sh/2026-06-01_Adressen.txt', '2026-06-01')).records.length)"
```

No build or automated test downloads or requires this file.
