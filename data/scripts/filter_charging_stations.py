"""Keep Schleswig city charging stations, preserving the original CSV records."""

import csv
from pathlib import Path


def main():
    path = Path(__file__).resolve().parents[1] / "curated/bundesnetzagentur/2026-09-01_Ladesaeulenregister.csv"
    preamble, kept, record_lines = [], [], []
    header = None
    total = 0
    with path.open("rb") as handle:
        def lines():
            for line in handle:
                record_lines.append(line)
                yield line.decode("utf-8-sig")

        for row in csv.reader(lines(), delimiter=";", strict=True):
            record = b"".join(record_lines)
            record_lines.clear()
            if header is None:
                preamble.append(record)
                if row and row[0] == "Ladeeinrichtungs-ID":
                    header = row
                    if len(set(header)) != len(header):
                        raise ValueError("Duplicate register columns.")
                    columns = [header.index(name) for name in ("Ort", "Postleitzahl", "Bundesland")]
                elif len(preamble) > 32:
                    raise ValueError("Register header was not found.")
                continue
            if len(row) != len(header):
                raise ValueError("Register row does not match the header.")
            location = tuple(row[index].strip().casefold() for index in columns)
            if location == ("schleswig", "24837", "schleswig-holstein"):
                kept.append(record)
            total += 1

    if not kept:
        raise ValueError("No Schleswig city charging stations found; file left unchanged.")
    path.write_bytes(b"".join(preamble + kept))
    print(f"Kept {len(kept)} charging stations; removed {total - len(kept)} records.")


if __name__ == "__main__":
    main()
