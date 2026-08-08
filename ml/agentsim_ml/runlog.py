"""One results table across all runs: runs/results.csv, one row per run."""
from __future__ import annotations

import csv
from pathlib import Path


def log_run(out_dir: Path, row: dict) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / "results.csv"
    exists = path.exists()
    existing_fields: list[str] = []
    if exists:
        with path.open() as f:
            existing_fields = next(csv.reader(f), [])
    fields = existing_fields or list(row)
    for k in row:
        if k not in fields:
            fields.append(k)
    rows = []
    if exists:
        with path.open() as f:
            rows = list(csv.DictReader(f))
    rows.append({k: row.get(k, "") for k in fields})
    with path.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)
    return path
