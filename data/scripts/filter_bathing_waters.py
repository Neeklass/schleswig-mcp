"""Keep Schleswig city bathing waters without changing retained CSV records."""

import csv
from pathlib import Path


def main():
    path = Path(__file__).resolve().parents[1] / "curated/govdata/2026-04-01_Badegewaesser.csv"
    lines = path.read_bytes().splitlines(keepends=True)
    reader = csv.reader((line.decode("latin1") for line in lines), delimiter="|")
    kept = []
    start = total = 0
    for row in reader:
        if len(row) != 29:
            raise ValueError("Expected 29 columns in the headerless bathing-water CSV.")
        # Column 22 is the municipality; the district is a separate column.
        if row[21].strip().casefold() in {"schleswig", "schleswig, stadt"}:
            kept.append(b"".join(lines[start:reader.line_num]))
        start = reader.line_num
        total += 1

    if not kept:
        raise ValueError("No Schleswig city records found; file left unchanged.")
    path.write_bytes(b"".join(kept))
    print(f"Kept {len(kept)} bathing waters; removed {total - len(kept)} records.")


if __name__ == "__main__":
    main()
