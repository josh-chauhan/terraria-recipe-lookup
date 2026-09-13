# Terraria Recipe Lookup

Search any Terraria item and see:
- its crafting recipe(s) and required station,
- every other item it's used to craft ("Used In"),
- a full recursive ingredient tree down to base materials.

Data comes from the [Official Terraria Wiki](https://terraria.wiki.gg)'s
structured **Cargo database** (via its public `action=cargoquery` API) —
this is more reliable than scraping rendered HTML and is how the wiki
itself generates its recipe tables. Content is CC BY-NC-SA 4.0; this
project is an unofficial fan tool, not affiliated with Re-Logic.

## 1. Set up locally

```bash
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

## 2. Build the database (one-time scrape)

This downloads all item and recipe data from the wiki into `terraria.db`.
It makes a few thousand small paginated API calls, so it takes a few
minutes — that's normal, and it's polite-rate-limited so it won't hammer
the wiki.

```bash
python scraper.py
```

Re-run this any time you want to refresh the data (e.g. after a Terraria
update changes recipes).

## 3. Run the app

```bash
python app.py
```

Visit http://localhost:5000 and start searching.

## 4. Deploy (Render)

1. Push this folder to a GitHub repo — **including the `terraria.db` file**
   you generated in step 2 (it's a static, read-only dataset, so it's fine
   to commit; typically a few MB).
2. On [Render](https://render.com), create a new **Web Service** from that repo.
3. Build command: `pip install -r requirements.txt`
4. Start command: `gunicorn app:app`
5. Deploy. Render will run the Procfile/start command automatically.

Because the database is only ever read at runtime (never written to), this
works fine even on platforms with ephemeral/read-only filesystems. If you
later want the data to stay current automatically, you could add a
scheduled job that re-runs `scraper.py` and re-deploys periodically.

### Alternative: Vercel
Vercel can also run this as a Python serverless function since the app
never writes to `terraria.db` at runtime — just make sure the `.db` file
is included in the deployment and add a `vercel.json` routing all requests
to `app.py`. Render is generally simpler for a small persistent Flask app
like this one.

## Notes on the data

- Item/ingredient images are loaded directly from the wiki via
  `Special:FilePath/<Item_Name>.png`, which redirects to the real hosted
  image. A handful of items with unusual names may not resolve to an
  image — the UI just hides a broken image icon in that case.
- Some items have multiple valid recipes (e.g. an item craftable with
  either of two different bars) — these show up as separate recipe cards.
- The ingredient tree caps depth (default 5, adjustable via `?depth=`
  on `/api/tree/<name>`) and total node count, since a few very
  late-game items (e.g. Zenith) have enormous full trees.
