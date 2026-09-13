#!/usr/bin/env python3
"""
Terraria Wiki recipe scraper.

Pulls item and recipe data from the official Terraria Wiki's Cargo database
(https://terraria.wiki.gg, MediaWiki + Cargo extension) via the public
action=cargoquery API, and stores it in a local SQLite database
(terraria.db) for the Flask app to read.

This hits the wiki's structured Cargo tables (Items, Recipes) instead of
scraping rendered HTML, which is far more reliable.

Run this once to build the database (and re-run any time you want to
refresh it after a game update):

    pip install -r requirements.txt
    python scraper.py
"""

import sqlite3
import sys
import time

import requests

API_URL = "https://terraria.wiki.gg/api.php"
DB_PATH = "terraria.db"
HEADERS = {
    "User-Agent": "TerrariaRecipeLookup/1.0 (personal/educational project)"
}
PAGE_LIMIT = 500      # Cargo's max rows per request on this wiki
REQUEST_DELAY = 0.25  # seconds between requests - be polite to the wiki


def cargo_query(tables, fields):
    """Yield every row (as a dict) from a Cargo table, handling pagination."""
    offset = 0
    while True:
        params = {
            "action": "cargoquery",
            "format": "json",
            "tables": tables,
            "fields": fields,
            "limit": PAGE_LIMIT,
            "offset": offset,
        }

        data = None
        for attempt in range(4):
            try:
                resp = requests.get(API_URL, params=params, headers=HEADERS, timeout=30)
                resp.raise_for_status()
                data = resp.json()
                break
            except (requests.RequestException, ValueError) as exc:
                print(f"  request failed ({exc}), retrying in 2s...", file=sys.stderr)
                time.sleep(2)
        if data is None:
            raise RuntimeError(f"Giving up on {tables} after repeated failures")

        if "error" in data:
            raise RuntimeError(f"Cargo query error: {data['error']}")

        rows = [r["title"] for r in data.get("cargoquery", [])]
        if not rows:
            break

        for row in rows:
            yield row

        if len(rows) < PAGE_LIMIT:
            break
        offset += PAGE_LIMIT
        time.sleep(REQUEST_DELAY)


def parse_args_field(args_value):
    """
    Parse the Recipes Cargo table's `args` field, formatted like:
        "Stone Block¦5^Luminite¦1"
    (ingredients separated by ^, name/amount within each separated by ¦)
    into a list of (ingredient_name, amount) tuples.
    """
    ingredients = []
    if not args_value:
        return ingredients
    for chunk in args_value.split("^"):
        chunk = chunk.strip()
        if not chunk:
            continue
        parts = chunk.split("¦")
        name = parts[0].strip()
        amount = 1
        if len(parts) > 1:
            try:
                amount = int(float(parts[1].strip().replace(",", "")))
            except ValueError:
                amount = 1
        if name:
            ingredients.append((name, amount))
    return ingredients


def to_int(value, default=1):
    try:
        return int(float(str(value).replace(",", "")))
    except (TypeError, ValueError):
        return default


def build_database():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    cur.executescript(
        """
        DROP TABLE IF EXISTS recipe_ingredients;
        DROP TABLE IF EXISTS recipes;
        DROP TABLE IF EXISTS items;

        CREATE TABLE items (
            name TEXT PRIMARY KEY,
            item_id INTEGER,
            type TEXT,
            rarity TEXT,
            sell_value TEXT,
            research INTEGER
        );

        CREATE TABLE recipes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            result_name TEXT NOT NULL,
            result_amount INTEGER DEFAULT 1,
            station TEXT
        );

        CREATE TABLE recipe_ingredients (
            recipe_id INTEGER NOT NULL,
            ingredient_name TEXT NOT NULL,
            amount INTEGER DEFAULT 1,
            FOREIGN KEY (recipe_id) REFERENCES recipes(id)
        );

        CREATE INDEX idx_recipes_result ON recipes(result_name);
        CREATE INDEX idx_ingredients_recipe ON recipe_ingredients(recipe_id);
        CREATE INDEX idx_ingredients_name ON recipe_ingredients(ingredient_name);
        """
    )

    print("Fetching items from the Items Cargo table (this may take a minute)...")
    item_count = 0
    for row in cargo_query(tables="Items", fields="name,itemid,type,rare,sell,research"):
        name = row.get("name")
        if not name:
            continue
        cur.execute(
            "INSERT OR REPLACE INTO items (name, item_id, type, rarity, sell_value, research) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (
                name,
                to_int(row.get("itemid"), default=None) if row.get("itemid") else None,
                row.get("type"),
                row.get("rare"),
                row.get("sell"),
                to_int(row.get("research"), default=0),
            ),
        )
        item_count += 1
        if item_count % 500 == 0:
            print(f"  ...{item_count} items so far")
            conn.commit()
    conn.commit()
    print(f"Stored {item_count} items.")

    print("Fetching recipes from the Recipes Cargo table...")
    recipe_count = 0
    for row in cargo_query(tables="Recipes", fields="result,resultid,amount,station,args"):
        result_name = row.get("result")
        if not result_name:
            continue
        result_amount = to_int(row.get("amount"), default=1)
        station = row.get("station") or "By Hand"

        cur.execute(
            "INSERT INTO recipes (result_name, result_amount, station) VALUES (?, ?, ?)",
            (result_name, result_amount, station),
        )
        recipe_id = cur.lastrowid

        for ing_name, ing_amount in parse_args_field(row.get("args")):
            cur.execute(
                "INSERT INTO recipe_ingredients (recipe_id, ingredient_name, amount) VALUES (?, ?, ?)",
                (recipe_id, ing_name, ing_amount),
            )

        recipe_count += 1
        if recipe_count % 500 == 0:
            print(f"  ...{recipe_count} recipes so far")
            conn.commit()

    conn.commit()
    conn.close()
    print(f"Stored {recipe_count} recipes.")
    print(f"Done. Database written to {DB_PATH}")


if __name__ == "__main__":
    build_database()
