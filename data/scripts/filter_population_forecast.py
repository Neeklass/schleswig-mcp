"""Keep Schleswig and its forecast values in the curated GovData snapshot."""

import json
from pathlib import Path


def main():
    path = Path(__file__).resolve().parents[1] / "curated/govdata/2025-06-04_Bevoelkerungsvorausrechnung_bis_2040.JSO"
    document = json.loads(path.read_text(encoding="utf-8"))
    data = document["data"]
    regions = data["regions"]
    matches = [i for i, region in enumerate(regions) if region.get("name") == "Schleswig"]
    if len(matches) != 1:
        raise ValueError("Expected exactly one region named Schleswig.")

    index = matches[0]
    for indicator in data["indicators"]:
        rows = indicator["regionYearValues"]
        if len(rows) != len(regions) or any(len(row) != len(document["years"]) for row in rows):
            raise ValueError("Region/year dimensions do not match the forecast values.")
        indicator["regionYearValues"] = [rows[index]]
        values = [value for value in rows[index] if value is not None]
        indicator["minValue"] = min(values, default=None)
        indicator["maxValue"] = max(values, default=None)

    data["regions"] = [regions[index]]
    document["regionsAndRegionFilters"] = [regions[index]]
    path.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Kept Schleswig with {len(data['indicators'])} indicators; removed {len(regions) - 1} regions.")


if __name__ == "__main__":
    main()
