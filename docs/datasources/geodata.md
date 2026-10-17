# LVermGeo SH address coordinates

Provider: [`src/providers/geodata.ts`](../../src/providers/geodata.ts).
Original provider and publisher: **Landesamt für Vermessung und Geoinformation
Schleswig-Holstein (LVermGeo SH)**. No discovery catalog is required. Data folders
retain `geodata-sh`; provider/document names remain `geodata`.

Status: **Gold reader, domain module, REST and MCP implemented**. Consumer:
`src/modules/addresses.ts`, REST `/api/v1/schleswig/addresses`, MCP
`list_schleswig_addresses`. There is no separate street dataset or street API.

## Original and Gold data

The [official ALKIS house-coordinate download client](https://geodaten.schleswig-holstein.de/gaialight-sh/_apps/dladownload/dl-hk_alkis.html)
offers the house-coordinate product without postal-code reconciliation. Select
and download it through the interface; a stable direct archive URL has not been
verified, so Gold `source.downloadUrl` is null.

Optional unchanged originals:

- `data/imported/geodata-sh/2026-06-01_Adressen.txt`
- `data/imported/geodata-sh/Datenformat_HK_aus_ALKIS_ohne_PLZ_Abgleich_04_2023.pdf`
- `data/imported/geodata-sh/info-sh.txt`

Original format: headerless UTF-8 text with 24 semicolon-separated fields,
coordinates in ETRS89 / UTM zone 32N (EPSG:25832). The accompanying notes give
**953,360** statewide house coordinates and `Auslesedatum: 2026-06-01`.

Gold: [`data/curated/geodata-sh/addresses.json`](../../data/curated/geodata-sh/addresses.json),
**7,619 addresses**, 7,619 unique OIDs and 310 distinct source street names.
The data array was unchanged during this architecture audit.

| Gold field              | Source/rule                          |
| ----------------------- | ------------------------------------ |
| `id`                    | Column 2, original 16-character OID  |
| `street`                | Column 15, original German name      |
| `streetCode`            | Column 14, five-character string     |
| `houseNumber`           | Column 16, string                    |
| `addressExtra`          | Column 17; empty string becomes null |
| `postalCode`            | Column 21; empty string becomes null |
| `latitude`, `longitude` | Transformed columns 19/20; EPSG:4326 |

## Dates, preparation and verification

`dataAsOf = 2026-06-01` means the extraction snapshot documented in `info-sh.txt`,
not a download event or observation date for every address. Publication/update,
download and preparation event times are unproven and null. The old `sourceDate`
field was replaced by the common date fields; `processing` became `{steps: [...]}`.

The existing preparation record documents these steps:

1. Read the original as strict UTF-8 with 24 fields. Select state `01`, district
   `59`, municipality `075`; verify administrative region `0` and AGS `01059075`.
2. Preserve OIDs, names, street/house-number strings, nonempty additions and source
   order. Retain records sharing coordinates; do not filter by quality code.
3. Convert empty optional additions/postal codes to null. There are 6,645 null
   additions and no null postal codes.
4. Transform zone-32 easting/northing from EPSG:25832 to EPSG:4326 with pyproj 3.7.2,
   PROJ 9.5.1, network disabled, `always_xy=True`, `allow_ballpark=False`,
   `only_best=True`, without rounding. Assign longitude and latitude explicitly.
5. Verify retained fields, source membership, IDs, coordinate ranges, reference
   points and inverse coordinate transformation; originals remain byte-identical.

The documented PROJ operation is inverse UTM zone 32N, ETRS89 to WGS 84 (1), axis
order change. PROJ reports 1 metre operation accuracy, not address-point accuracy.
The existing preparation checked the published UTM reference
`(687071.44, 6210141.33)` → approximately `(longitude 12, latitude 56)` and a
central-meridian control. The current audit independently compared every retained
address field and repeated all 7,619 inverse transformations: maximum numerical
error **2.7939677238464355e-9 metres**, below 1e-6 metres.

Latitude range: `54.492538602138396`–`54.542654501100166`;
longitude: `9.514787456961404`–`9.597083365296816`. A broad Schleswig-vicinity check
is only a plausibility check; municipality selection comes from official keys.

Original SHA-256 values, unchanged in the current audit:

| Original                                                 | SHA-256                                                            |
| -------------------------------------------------------- | ------------------------------------------------------------------ |
| `2026-06-01_Adressen.txt`                                | `89a86e50c31bcc87c9b1c41e053c35c9518427034d0e26a779b1a15818c97302` |
| `Datenformat_HK_aus_ALKIS_ohne_PLZ_Abgleich_04_2023.pdf` | `3ba4c855a09255f635309927e8e741b97bc36207b9265b9a81c899784c222a92` |
| `info-sh.txt`                                            | `be1fc4cf1b07d51d44bb5d23861b0166611b823200175d4b347d956824b13f4d` |

These are manual audit checks, not requirements to install Python or obtain raw
data for application tests/builds.

## License

The [official OpenGBD terms](https://geodaten.schleswig-holstein.de/gaialight-sh/_apps/dladownload/lizenz.html)
specify [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), checked on
2026-10-17. Required modified-source credit:
**©GeoBasis-DE/LVermGeo SH/CC BY 4.0 (Quelle verändert)**.
Preserve it together with dataset/license links and processing notices. The
German required credit is intentional. This does not select a source-code license.

## Access, updates and limitations

`getAddressDataset()` loads cached Gold. The retained explicit
`loadSchleswigAddresses(path, dataAsOf)` streams an original TXT for manual
inspection and returns projected metres; it is not called by REST/MCP. Public
addresses use the already transformed Gold coordinates.

Obtain replacement originals and accompanying notes through the official client,
extract into a new directory, and never overwrite existing originals. Manually
prepare/review Gold, record the new extraction date, run `npm run check`, and
restart/redeploy. No fixed update interval or automatic archive integration is
claimed. The portal may not retain old releases. It was accessible through the
system certificate store; Node's default trust previously reported an incomplete
chain. Never disable TLS verification to download data.

Postal codes are not reconciled with Deutsche Post. Source address peculiarities
and multiple addresses at identical coordinates are preserved. The historical
`data/scripts/filter_addresses.py` targets an explicitly supplied intermediate
TXT, not the current Gold JSON. No conversion pipeline is part of the application.
