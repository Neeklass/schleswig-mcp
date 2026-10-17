# Open Data SH monument register

Provider: [`src/providers/opendata-sh.ts`](../../src/providers/opendata-sh.ts).
Original provider/publisher: **Landesamt für Denkmalpflege Schleswig-Holstein**.
Publication catalog: **Open Data SH**. Status: **Gold reader, domain module, REST
and MCP implemented**. Consumer: `src/modules/monuments.ts`, REST
`/api/v1/schleswig/monuments`, MCP `list_schleswig_monuments`.

## Original and Gold data

- [Official release page](https://opendata.schleswig-holstein.de/dataset/denkmalliste-2026-10-12).
- [Official release metadata](https://opendata.schleswig-holstein.de/api/3/action/package_show?id=denkmalliste-2026-10-12).
- [Pinned record JSON](https://opendata.schleswig-holstein.de/dataset/f67c373c-3665-4ddf-946b-285b550a72a4/resource/810e96ef-0cf3-445a-a3ce-080d77696930/download/denkmalliste.json).
- Optional original: `data/imported/opendata-sh/2026-10-12_Denkmalliste.json`.
- Original format: JSON array with German fields; 11,621 statewide records.
- Gold: [`data/curated/opendata-sh/monuments.json`](../../data/curated/opendata-sh/monuments.json),
  **251 monuments**, with 251 unique `object_id` values.

The Gold file selects `Gemeinde = Schleswig, Stadt` and
`Kreis = Kreis Schleswig-Flensburg`. Its municipality metadata is AGS `01059075`.
It does not select all records in the district or state.

## Dates and evidenced processing

Official release metadata gives publication/update and temporal start on
**2026-10-12**. These support the release snapshot date and source publication/
update dates. Download and preparation timestamps cannot be established and are
null; the former date-only `curatedAt` claim was removed.

Preparation selected Schleswig and renamed fields while preserving object IDs,
German descriptions, protection information and photo URLs. No deduplication is
claimed. Source omissions remain optional fields. The provider maps `object_id`
to string `id` for the public domain model without rewriting the Gold records.

The audit compared every retained field against the original and corrected two
unintended text substitutions:

| Object ID | Field         | Correction                                         |
| --------- | ------------- | -------------------------------------------------- |
| 10545     | `description` | `Kirchenmunicipality` → original `Kirchengemeinde` |
| 9381      | `name`        | `municipalityhaus` → original `Gemeindehaus`       |

All other retained content remains unchanged. Metadata now includes the actual
publisher as provider, separate catalog, exact download URL, format and processing.

## License

The official release metadata identifies
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) and the required credit
**Landesamt für Denkmalpflege Schleswig-Holstein**, rechecked on 2026-10-17.
Retain source/license links and processing notices. Photo URLs are retained
references; the application does not fetch, embed or redistribute image files.
Image-specific reuse conditions should be checked before separate image reuse.
The data license does not license this project's source code.

## Access, updates and limitations

`getMonumentDataset()` validates and caches Gold. `fetchSchleswigHeritage()`
remains an explicit original-release reader (16 MiB, 30 seconds) and is not used
by public requests. It has a smaller legacy record projection, omitting photos.

The publisher describes weekly publication and ongoing corrections. Obtain the
new release and its metadata, save the original under a new path in
`data/imported/opendata-sh/`, and manually prepare/review a replacement Gold file.
Do not confuse the record array with the separate Frictionless metadata resource.
Run `npm run check` and restart/redeploy after replacing Gold. No automatic
refresh or preparation is implemented. `data/scripts/filter_monuments.py` targets
an older intermediate JSON filename, not the current Gold envelope.

The register is not exhaustive. Some descriptions/protection information migrated
from the pre-2015 register are not fully updated. The pinned snapshot can differ
from the current official register.
