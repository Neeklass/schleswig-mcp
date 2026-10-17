# PEGELONLINE water-level data

Status: **technically retrievable and integrated into the public HTTP API and MCP**.
This document corresponds to [`src/providers/pegelonline.ts`](../../src/providers/pegelonline.ts).
The provider represents PEGELONLINE and can supply multiple modules; its only
current consumer is [`src/modules/water-level.ts`](../../src/modules/water-level.ts).
The adapters in `api/index.ts` and `mcp/mcp.ts` both call that module:
REST `/api/v1/schleswig/water-level`, MCP `get_schleswig_water_level`.

## Source and verified station

Provider: Germany's Federal Waterways and Shipping Administration
(Wasserstraßen- und Schifffahrtsverwaltung des Bundes, WSV), via
[PEGELONLINE](https://pegelonline.wsv.de/webservice/ueberblick).

This source is fetched from the live REST API on each request. It is not a local
dataset under `data/imported/`. The integration in
[`src/providers/pegelonline.ts`](../../src/providers/pegelonline.ts) fetches and
validates the response, maps source fields into a domain reading, and supplies
source notices and license metadata. The shared service in
[`src/modules/water-level.ts`](../../src/modules/water-level.ts) applies freshness
rules; HTTP and MCP adapters call that service.

The implemented static datasets under `data/curated/` do not affect this live
integration. PEGELONLINE has no Gold file or local original. It needs neither
raw nor curated local files and returns one station's latest W measurement.
WSV is both the original provider and publisher; no discovery catalog is queried.

Verified against the live REST API on **2026-10-14**:

| Field                              | Value                                  |
| ---------------------------------- | -------------------------------------- |
| Station                            | SCHLESWIG                              |
| UUID                               | `09370c05-1041-4395-a5d4-b8db6e59c4c8` |
| Station number                     | `9610040`                              |
| Water name reported by PEGELONLINE | OSTSEE                                 |
| Parameter                          | `W` — raw water-level measurement      |
| Unit                               | `cm`                                   |
| Reported measurement interval      | 1 minute                               |

The [station endpoint](https://pegelonline.wsv.de/webservices/rest-api/v2/stations/09370c05-1041-4395-a5d4-b8db6e59c4c8.json?includeTimeseries=true&includeCurrentMeasurement=true)
returns station metadata and `timeseries`, including the unit and
`currentMeasurement.timestamp` / `currentMeasurement.value`. This gives the MVP all
required information in one request. Discovery used `stations.json?fuzzyId=schleswig`;
runtime requests use the immutable UUID, as recommended by the
[official REST guide](https://pegelonline.wsv.de/webservice/guideRestapi).

## Meaning and limitations

The reading is a water level relative to the station's gauge zero, not water depth.
The MVP does not convert it into an elevation, navigation depth, flood warning, or
safety assessment. It preserves the supplied unit and timestamp. The source also
provides gauge-zero metadata; this MVP does not use it for conversions.

The API documents timezone-qualified timestamps and a measurement interval in
minutes. See the [official response documentation](https://pegelonline.wsv.de/webservice/dokuRestapi).
An interval does not guarantee delivery latency or availability. The application's
15-minute stale threshold is its own policy. Missing and invalid measurements
produce errors; old valid measurements remain visible with a warning.

WSV describes the data as unvalidated raw measurements and does not guarantee its
accuracy, completeness, or timeliness. Station comments, when supplied, are passed
through as source notices. See the [source overview](https://pegelonline.wsv.de/webservice/ueberblick).

## Data license and attribution

PEGELONLINE identifies the data license as **Data licence Germany – Zero –
Version 2.0 (DL-DE-Zero-2.0)** in its
[source overview](https://pegelonline.wsv.de/webservice/ueberblick).
The authoritative [license text is available from GovData](https://www.govdata.de/dl-de/zero-2-0).
License references checked on **2026-10-17**. The license permits reuse without
conditions, including without a mandatory attribution notice.

Every successful response includes PEGELONLINE's name, the exact source endpoint,
and the data-license name and URL so consumers can trace the measurement. This
documentation credits WSV as the provider.

The source-code license of Schleswig MCP is undecided. The external data license
does not grant a license to this project's code or replace dependency licenses.

## Reacquisition and verification

No original file is required after a clone. The provider fetches the documented
station endpoint on each call with a five-second timeout. Run `npm run smoke`
against the running server for an explicit live check; `npm run check` uses no
external service. The 15-minute freshness policy remains in the shared module.
