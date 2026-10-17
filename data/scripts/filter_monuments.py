"""Keep only Schleswig city entries in the curated monument list."""

import json
from pathlib import Path


def main():
    path = Path(__file__).resolve().parents[1] / "curated/opendata-sh/2026-10-12_Denkmalliste.json"
    entries = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(entries, list) or not all(isinstance(entry, dict) for entry in entries):
        raise ValueError("Expected a JSON array of objects.")

    kept = [entry for entry in entries if entry.get("Gemeinde") == "Schleswig, Stadt"]
    path.write_text(json.dumps(kept, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Kept {len(kept)} entries; removed {len(entries) - len(kept)} from {path.name}.")


if __name__ == "__main__":
    main()
