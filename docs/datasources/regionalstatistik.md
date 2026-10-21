# Regionaldatenbank Deutschland

Status: **Gold files refreshed by a scheduled, reviewed pipeline; served through
the REST API and MCP**. This document corresponds to
[`src/providers/regionalstatistik.ts`](../../src/providers/regionalstatistik.ts).
The provider supplies the module
[`src/modules/statistics.ts`](../../src/modules/statistics.ts) with five datasets.

## Source

Publisher: Statistische Ämter des Bundes und der Länder, through the
[Regionaldatenbank Deutschland](https://www.regionalstatistik.de/genesis/online)
(GENESIS). Access uses the GENESIS REST API 2020 at
`https://www.regionalstatistik.de/genesisws/rest/2020/`, service
`data/tablefile`, format `ffcsv` (flat-file CSV in a ZIP archive). Requests
filter by the regional variable `GEMEIN` and key `01059075` (Schleswig, Stadt)
from 2008, the first year of municipality-level tables.

The API requires a free registered account. The pipeline reads its username and
password from the repository secrets `REGIONALSTATISTIK_USERNAME` and
`REGIONALSTATISTIK_PASSWORD` and sends them as request headers, never in a URL
or file. Public REST and MCP requests do not contact the API; they read the
validated Gold files.

Verified with the account on **2026-10-21**: login, table catalogue, table
structure and the `GEMEIN` filter.

## Datasets and tables

| Dataset (REST / MCP)  | Tables                                            | Gold file                                                 |
| --------------------- | ------------------------------------------------- | --------------------------------------------------------- |
| `population`          | `12411-01-01-5`, `12411-07-01-5`                  | `data/curated/regionalstatistik/population.json`          |
| `population-movement` | `12612-01-01-5`, `12613-01-01-5`, `12711-91-01-5` | `data/curated/regionalstatistik/population-movement.json` |
| `construction`        | `31111-01-02-5`, `31121-01-02-5`                  | `data/curated/regionalstatistik/construction.json`        |
| `tourism`             | `45412-01-02-5`                                   | `data/curated/regionalstatistik/tourism.json`             |
| `municipal-taxes`     | `71231-01-03-5`                                   | `data/curated/regionalstatistik/municipal-taxes.json`     |

- `12411-01-01-5` population on 31 December by sex; `12411-07-01-5` average age by sex.
- `12612-01-01-5` live births and `12613-01-01-5` deaths by sex, annual sums.
- `12711-91-01-5` moves into and out of Schleswig across municipal borders.
  The more detailed `12711-01-03-5` ends in 2017 and is not used.
- `31111-01-02-5` permits and `31121-01-02-5` completions of new residential
  buildings: buildings and dwellings by number of dwellings, and living space.
- `45412-01-02-5` monthly accommodation survey, annual sums. The survey covers
  establishments above its size threshold, not all private rentals. Beds
  (`GAST03`) are marked `-` from 2018, because this table no longer reports
  them; `45412-01-03-5` (sleeping places) is a possible later addition.
- `71231-01-03-5` local tax rates (Hebesätze), revenue, base amounts and
  municipal shares of income and turnover tax, 2016 onward. The predecessor
  `71231-01-02-5` (2008–2015) has a different structure and is not used.

## Processing

[`scripts/update-statistics.ts`](../../scripts/update-statistics.ts) downloads
the tables one after another, extracts the single CSV file and maps rows to one
series per table, measure (`value_variable_code`) and breakdown (e.g. sex). The
series ID is `<table>.<measure>.<breakdown codes>`; `TOTAL` marks an
"Insgesamt" row. Periods are years for annual sums and dates for stocks.
Decimal commas become numbers. Official signs (`-`, `.`, `...`, `x`, `/`) stay
in `marker` with a null value. GENESIS defines `-` as "nothing", but tables
also use it for measures no longer collected, so no sign is converted to a
number. Rows outside Schleswig, unknown values or duplicate periods reject the
whole update.

Statistics can be revised, so each run replaces a dataset as a whole, but only
when the data differs from the stored file. `dates.retrievedAt` and
`dates.curatedAt` record that run; `dates.dataAsOf` is the newest reference date
(31 December for annual sums). Changes reach `main` only through the reviewed
`data-update` pull request (see the [README](../../README.md#data-updates)).

## License and attribution

The API states for every response: "© Statistische Ämter des Bundes und der
Länder, Deutschland, 2026. Dieses Werk ist lizenziert unter der Datenlizenz
Deutschland – Namensnennung – Version 2.0." License text:
[DL-DE-BY-2.0](https://www.govdata.de/dl-de/by-2-0). Gold metadata carries this
credit with the table codes, and `processing.steps` documents the changes.
Reusers must keep the credit and the license reference.

The data license does not license this project's source code.

## Limitations

- Official figures are published with a delay, and the newest period differs
  by table (as of 2026-10-21: 2025 for population, deaths and tourism; 2024 for
  births, migration, construction and taxes).
- Series can contain methodological breaks, such as census rebasing of the
  population figures. Values are passed through unchanged.
- Moves count crossings of the municipal border, not net migration.
