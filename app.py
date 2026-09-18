#!/usr/bin/env python3
"""
Flask backend for the Terraria Recipe Lookup app.

Reads from the local terraria.db SQLite file (built by scraper.py) and
exposes a small JSON API consumed by static/app.js.
"""

import os
import sqlite3
import urllib.parse

from flask import Flask, jsonify, request, send_from_directory

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "terraria.db")
WIKI_IMAGES = "https://terraria.wiki.gg/images/"

app = Flask(__name__, static_folder="static", static_url_path="")


def get_db():
    if not os.path.exists(DB_PATH):
        raise RuntimeError(
            "terraria.db not found. Run `python scraper.py` first to build the database."
        )
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def image_url(item_name):
    """
    Build the wiki's actual image URL. Item sprites are hosted directly at
    https://terraria.wiki.gg/images/<Item_Name>.png - this matches the
    <img> src the wiki itself renders on item pages. A handful of animated
    items (e.g. "Any Wood") use .gif instead; the frontend retries with
    that extension on load failure before giving up.
    """
    filename = item_name.replace(" ", "_") + ".png"
    return WIKI_IMAGES + urllib.parse.quote(filename)


def format_coins(copper):
    """
    Format a total-copper-coin value the way Terraria displays currency:
    1 Platinum = 100 Gold = 10,000 Silver = 1,000,000 Copper.
    """
    if not copper:
        return None
    platinum, remainder = divmod(copper, 1_000_000)
    gold, remainder = divmod(remainder, 10_000)
    silver, copper_rem = divmod(remainder, 100)
    parts = []
    if platinum:
        parts.append(f"{platinum} Platinum")
    if gold:
        parts.append(f"{gold} Gold")
    if silver:
        parts.append(f"{silver} Silver")
    if copper_rem or not parts:
        parts.append(f"{copper_rem} Copper")
    return " ".join(parts)


def fetch_recipes_for(conn, name):
    """All recipe rows that craft `name`, each with its ingredient list."""
    recipe_rows = conn.execute(
        "SELECT id, result_amount, station FROM recipes WHERE result_name = ?",
        (name,),
    ).fetchall()
    recipes = []
    for r in recipe_rows:
        ing_rows = conn.execute(
            "SELECT ingredient_name, amount FROM recipe_ingredients WHERE recipe_id = ?",
            (r["id"],),
        ).fetchall()
        recipes.append(
            {
                "station": r["station"],
                "result_amount": r["result_amount"],
                "ingredients": [
                    {
                        "name": i["ingredient_name"],
                        "amount": i["amount"],
                        "image": image_url(i["ingredient_name"]),
                    }
                    for i in ing_rows
                ],
            }
        )
    return recipes


def fetch_used_in(conn, name):
    rows = conn.execute(
        "SELECT DISTINCT r.result_name, r.result_amount, r.station "
        "FROM recipes r JOIN recipe_ingredients ri ON ri.recipe_id = r.id "
        "WHERE ri.ingredient_name = ? ORDER BY r.result_name",
        (name,),
    ).fetchall()
    return [
        {
            "name": r["result_name"],
            "amount": r["result_amount"],
            "station": r["station"],
            "image": image_url(r["result_name"]),
        }
        for r in rows
    ]

@app.route('/craft_site_icon.ico')
def favicon():
    return send_from_directory(
        os.path.join(app.root_path, 'static'),
        'craft_site_icon.ico', 
        mimetype='image/vnd.microsoft.icon'
    )

@app.route('/favicon.ico')
def favicon_fallback():
    return favicon()


@app.route("/")
def index():
    return app.send_static_file("index.html")


@app.route("/api/search")
def search():
    q = request.args.get("q", "").strip()
    try:
        limit = min(int(request.args.get("limit", 20)), 50)
    except ValueError:
        limit = 20
    if not q:
        return jsonify([])

    conn = get_db()
    rows = conn.execute(
        "SELECT name, type FROM items WHERE name LIKE ? "
        "ORDER BY CASE WHEN name LIKE ? THEN 0 ELSE 1 END, LENGTH(name) "
        "LIMIT ?",
        (f"%{q}%", f"{q}%", limit),
    ).fetchall()
    conn.close()

    return jsonify(
        [{"name": r["name"], "type": r["type"], "image": image_url(r["name"])} for r in rows]
    )


@app.route("/api/item/<path:name>")
def item_detail(name):
    conn = get_db()
    item = conn.execute("SELECT * FROM items WHERE name = ?", (name,)).fetchone()

    recipes = fetch_recipes_for(conn, name)
    if not item and not recipes:
        conn.close()
        return jsonify({"error": f'"{name}" was not found.'}), 404

    result = {
        "name": name,
        "type": item["type"] if item else None,
        "rarity": item["rarity"] if item else None,
        "sell_value": format_coins(item["sell_copper"]) if item else None,
        "research": item["research"] if item else None,
        "image": image_url(name),
        "recipes": recipes,
        "used_in": fetch_used_in(conn, name),
    }
    conn.close()
    return jsonify(result)


@app.route("/api/tree/<path:name>")
def item_tree(name):
    try:
        max_depth = min(int(request.args.get("depth", 5)), 8)
    except ValueError:
        max_depth = 5

    conn = get_db()
    budget = [1500]  # hard cap on total nodes so huge trees (e.g. Zenith) don't blow up

    def build(item_name, ancestors):
        node = {"name": item_name, "image": image_url(item_name)}
        budget[0] -= 1

        if item_name in ancestors:
            node["circular"] = True
            return node
        if len(ancestors) >= max_depth or budget[0] <= 0:
            node["truncated"] = True
            return node

        recipes = fetch_recipes_for(conn, item_name)
        if not recipes:
            node["base_material"] = True
            return node

        new_ancestors = ancestors | {item_name}
        node["recipes"] = [
            {
                "station": r["station"],
                "result_amount": r["result_amount"],
                "ingredients": [
                    {**build(ing["name"], new_ancestors), "amount": ing["amount"]}
                    for ing in r["ingredients"]
                ],
            }
            for r in recipes
        ]
        return node

    tree = build(name, frozenset())
    conn.close()
    return jsonify(tree)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
