"""Keep Schleswig city addresses in the curated ALKIS snapshot."""

from pathlib import Path


def main():
    path = Path(__file__).resolve().parents[1] / "curated/geodata-sh/2026-06-01_Adressen.txt"
    kept = []
    total = 0
    with path.open("rb") as handle:
        for line in handle:
            fields = line.decode("utf-8").rstrip("\r\n").split(";")
            if len(fields) != 24:
                raise ValueError("Expected 24 semicolon-separated address fields.")
            # Municipality is column 11; columns 4, 6, 8 and 10 form the AGS.
            ags = fields[3] + fields[5] + fields[7] + fields[9]
            if fields[10].strip().casefold() == "schleswig" and ags == "01059075":
                kept.append(line)
            total += 1

    if not kept:
        raise ValueError("No Schleswig city addresses found; file left unchanged.")
    path.write_bytes(b"".join(kept))
    print(f"Kept {len(kept)} addresses; removed {total - len(kept)} records.")


if __name__ == "__main__":
    main()
