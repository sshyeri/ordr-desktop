#!/usr/bin/env python3
"""One-time downloader for the unit icons captured in unit-display.json."""

from __future__ import annotations

import json
import time
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "data" / "unit-display.json"
OUTPUT = ROOT / "app" / "assets" / "units"


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    rows = json.loads(MANIFEST.read_text(encoding="utf-8"))
    downloaded = skipped = failed = 0
    for row in rows:
        target = OUTPUT / f"{row['id']}.png"
        if target.exists() and target.stat().st_size > 100:
            skipped += 1
            continue
        url = row.get("image_url") or f"https://ordsearch.b-cdn.net/images/units/ord/icons/{row['id']}.png"
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(request, timeout=20) as response:
                target.write_bytes(response.read())
            downloaded += 1
        except Exception as error:
            failed += 1
            print(f"failed {row['id']}: {error}")
        time.sleep(0.02)
    wisp = OUTPUT / "wisp.png"
    if not wisp.exists():
        request = urllib.request.Request(
            "https://ordsearch.b-cdn.net/images/units/ord/icons/wisp.png",
            headers={"User-Agent": "Mozilla/5.0"},
        )
        with urllib.request.urlopen(request, timeout=20) as response:
            wisp.write_bytes(response.read())
        downloaded += 1
    print(f"downloaded={downloaded} skipped={skipped} failed={failed}")


if __name__ == "__main__":
    main()
