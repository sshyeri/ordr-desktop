#!/usr/bin/env python3
"""Build a normalized SQLite database from the ORDSearch mix-helper page."""

from __future__ import annotations

import argparse
import json
import sqlite3
import urllib.request
from html.parser import HTMLParser
from pathlib import Path


SKILL_KEYS = (
    "damageb", "speedb", "sky", "berserk", "sstun", "singlelost", "last",
    "single", "regen", "docking", "mshield", "shield", "ignore", "rangellpd",
    "rangetlpd", "rangenlpd", "stun", "boss", "blink", "splash", "armorbreak",
    "udelete", "slow", "life", "bombup",
)

# Non-character materials that remain visible and participate in V1 calculations.
# Names are documented in docs/v1-scope.md; IDs are the stable external IDs.
V1_INCLUDED_MATERIAL_IDS = {31, 124, 144, 168, 304, 307, 322, 325, 332, 361}


class HelperParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.units: list[dict] = []
        self.current: dict | None = None
        self.in_button = False
        self.text: list[str] = []

    def handle_starttag(self, tag: str, attrs_list: list[tuple[str, str | None]]) -> None:
        attrs = dict(attrs_list)
        classes = set((attrs.get("class") or "").split())
        if tag == "tr":
            self.current = {
                "id": int(attrs["data-unit-id"]) if attrs.get("data-unit-id") else None,
                "level": int(attrs.get("data-level", 0)),
                "skills": [k for k in SKILL_KEYS if attrs.get(f"data-{k}") == "Y"],
            }
        elif self.current and tag == "button" and "deck-add-button" in classes:
            if self.current["id"] is None and attrs.get("data-id"):
                self.current["id"] = int(attrs["data-id"])
            if not self.current["level"]:
                self.current["level"] = int(attrs.get("data-level", 0))
            self.current.update({
                "name": attrs.get("data-origin-name", ""),
                "level_text": attrs.get("data-level-text", ""),
                "mate_ids": [int(x) for x in (attrs.get("data-mates") or "").split(",") if x],
                "add_count": int(attrs.get("data-add-count", 1)),
                "hotkey": attrs.get("data-hotkey", ""),
                "tooltip_html": attrs.get("data-bs-original-title", ""),
            })
            self.in_button = True
            self.text = []

    def handle_data(self, data: str) -> None:
        if self.in_button:
            self.text.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag == "button" and self.in_button:
            self.in_button = False
            if self.current and not self.current.get("name"):
                self.current["name"] = " ".join("".join(self.text).split())
        elif tag == "tr" and self.current:
            if self.current.get("name") and self.current.get("id") is not None:
                self.units.append(self.current)
            self.current = None


def fetch_units(url: str) -> list[dict]:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 Chrome/151 Safari/537.36"})
    with urllib.request.urlopen(req, timeout=60) as response:
        html = response.read().decode("utf-8", errors="replace")
    parser = HelperParser()
    parser.feed(html)
    return parser.units


def build_database(units: list[dict], output: Path, source_url: str) -> None:
    # Some base/material rows use a different DOM class than normal helper units.
    # Preserve referential integrity with explicit placeholder records; detail-page
    # crawling can enrich these later without changing recipe IDs.
    known_ids = {int(u["id"]) for u in units}
    referenced_ids = {int(mid) for u in units for mid in u.get("mate_ids", [])}
    for missing_id in sorted(referenced_ids - known_ids):
        units.append({
            "id": missing_id,
            "name": f"미수집 유닛 #{missing_id}",
            "level": 0,
            "level_text": "미수집",
            "mate_ids": [],
            "skills": [],
            "hotkey": "",
            "tooltip_html": "",
        })
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists():
        output.unlink()
    db = sqlite3.connect(output)
    db.executescript("""
        PRAGMA foreign_keys = ON;
        CREATE TABLE rarities (
          level INTEGER PRIMARY KEY,
          name TEXT NOT NULL UNIQUE
        );
        CREATE TABLE units (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          rarity_level INTEGER NOT NULL REFERENCES rarities(level),
          hotkey TEXT,
          tooltip_html TEXT,
          input_visible INTEGER NOT NULL DEFAULT 1,
          calculation_policy TEXT NOT NULL DEFAULT 'include'
            CHECK (calculation_policy IN ('include','exclude','user_selectable')),
          emphasize_when_required INTEGER NOT NULL DEFAULT 0,
          source_url TEXT NOT NULL,
          scraped_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE skills (
          code TEXT PRIMARY KEY,
          name_ko TEXT
        );
        CREATE TABLE unit_skills (
          unit_id INTEGER NOT NULL REFERENCES units(id),
          skill_code TEXT NOT NULL REFERENCES skills(code),
          PRIMARY KEY (unit_id, skill_code)
        );
        CREATE TABLE unit_effects (
          unit_id INTEGER NOT NULL REFERENCES units(id),
          effect_code TEXT NOT NULL CHECK (effect_code IN ('armor_reduction','slow')),
          value REAL,
          value_unit TEXT NOT NULL DEFAULT 'flat',
          condition_text TEXT,
          source_text TEXT,
          PRIMARY KEY (unit_id, effect_code, condition_text)
        );
        CREATE TABLE recipes (
          output_unit_id INTEGER NOT NULL REFERENCES units(id),
          material_unit_id INTEGER NOT NULL REFERENCES units(id),
          quantity INTEGER NOT NULL DEFAULT 1,
          PRIMARY KEY (output_unit_id, material_unit_id)
        );
        CREATE INDEX idx_units_name ON units(name);
        CREATE INDEX idx_units_rarity ON units(rarity_level);
        CREATE INDEX idx_recipes_material ON recipes(material_unit_id);
    """)
    rarities = sorted({(int(u["level"]), u.get("level_text") or f"level-{u['level']}") for u in units})
    db.executemany("INSERT INTO rarities(level,name) VALUES (?,?)", rarities)
    db.executemany("INSERT INTO skills(code,name_ko) VALUES (?,NULL)", [(k,) for k in SKILL_KEYS])
    db.executemany(
        "INSERT INTO units(id,name,rarity_level,hotkey,tooltip_html,source_url) VALUES (?,?,?,?,?,?)",
        [(u["id"], u["name"], u["level"], u.get("hotkey", ""), u.get("tooltip_html", ""), source_url) for u in units],
    )
    # "기타" is excluded by default. Only the explicitly approved material IDs
    # stay visible, count toward recipes, and receive required-material emphasis.
    db.execute("""
        UPDATE units
        SET input_visible = 0, calculation_policy = 'exclude'
        WHERE rarity_level = 14
    """)
    db.executemany("""
        UPDATE units
        SET input_visible = 1,
            calculation_policy = 'include',
            emphasize_when_required = 1
        WHERE id = ?
    """, [(unit_id,) for unit_id in sorted(V1_INCLUDED_MATERIAL_IDS)])
    db.executemany(
        "INSERT INTO unit_skills(unit_id,skill_code) VALUES (?,?)",
        [(u["id"], skill) for u in units for skill in u.get("skills", [])],
    )
    recipes: list[tuple[int, int, int]] = []
    for unit in units:
        counts: dict[int, int] = {}
        for material_id in unit.get("mate_ids", []):
            counts[material_id] = counts.get(material_id, 0) + 1
        recipes.extend((unit["id"], material_id, quantity) for material_id, quantity in counts.items())
    db.executemany("INSERT INTO recipes(output_unit_id,material_unit_id,quantity) VALUES (?,?,?)", recipes)
    db.commit()
    db.close()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="https://ordsearch.net/mix/helper")
    parser.add_argument("--input-json", type=Path)
    parser.add_argument("--output", type=Path, default=Path("data/ord_units.sqlite3"))
    args = parser.parse_args()
    units = json.loads(args.input_json.read_text(encoding="utf-8")) if args.input_json else fetch_units(args.url)
    build_database(units, args.output, args.url)
    print(f"created {args.output} with {len(units)} units")


if __name__ == "__main__":
    main()
