# Provider documentation template

Copy this structure to `docs/datasources/<provider>.md` when adding a provider
(`src/providers/<provider>.ts`). Keep one document per provider, not per dataset.

## Inclusion criteria

Add a dataset only when all of these are documented by the publisher itself
(dataset page, metadata record or official terms), not by a third party:

- The license is CC BY 4.0, CC0 1.0, DL-DE-BY-2.0 or DL-DE-Zero-2.0.
- Redistribution and modification are permitted, including through a public API.
- There is no purpose limitation, recipient restriction or additional platform
  agreement that conflicts with public redistribution.

Record the evidence (URL and date checked) in the license section below.

## Sections

- **Publisher and catalog:** organisation, catalog or portal, dataset page.
- **Official endpoint or download:** stable URL, access requirements.
- **Original format:** file type, encoding, coordinate reference system.
- **Gold files:** path under `data/curated/`, record count, scope (AGS `01059075`).
- **Dates:** domain date, source publication and update, retrieval, preparation;
  `null` when unknown.
- **Processing:** every step from original to Gold, including filters and
  corrections, as listed in `metadata.processing.steps`.
- **License and credit:** license identifier, canonical URL, required source
  credit, modification notice, evidence URL and date checked.
- **Update procedure:** how a new source version is obtained, validated and
  reviewed.
- **Provider and modules:** functions, domain modules, REST routes, MCP theme
  tool and dataset name.
- **Status and limitations:** integration status and known gaps.
