# Terraria Recipe Lookup

Search Terraria items for their crafting recipes, uses, and ingredient trees.
Data comes from the [Official Terraria Wiki](https://terraria.wiki.gg)'s
structured **Cargo database** through its public `action=cargoquery` API.
Content is CC BY-NC-SA 4.0; this is an unofficial fan tool, not affiliated
with Re-Logic.

## How the architecture evolved

The project has grown in layers, and the earlier data path is still part of
the current deployment:

1. **Structured wiki data:** [`scraper.py`](./scraper.py) queries the wiki's
   Cargo API and builds the local `terraria.db` SQLite dataset. This avoids
   depending on the layout of rendered wiki pages.
2. **Flask and SQLite:** [`app.py`](./app.py) began as a Flask app that read
   SQLite directly and served a small browser UI from [`static/`](./static/).
   It can still run in that mode for a lightweight local setup.
3. **Separate Next.js frontend:** [`frontend/`](./frontend/) adds a React and
   TypeScript interface. It calls Flask's JSON endpoints; Next.js rewrites
   `/api` requests to the API service rather than querying the database itself.
4. **PostgreSQL and containers:** [`docker-compose.yml`](./docker-compose.yml)
   now runs the Next.js frontend, Flask API, and PostgreSQL as separate
   services. On first startup, [`migrate_sqlite_to_postgres.py`](./migrate_sqlite_to_postgres.py)
   imports the existing SQLite snapshot into a persistent PostgreSQL volume.
   The SQLite file remains the scraper's output and the source for an
   intentional database refresh.

So the current Compose path is **Cargo API → SQLite snapshot → PostgreSQL →
Flask JSON API → Next.js UI**. The older **Flask + SQLite + static UI** path
remains available when running `python app.py` without PostgreSQL settings.

## Run the full app with Docker Compose

Docker Compose starts the Next.js frontend, Flask API, and PostgreSQL database.
On first start, the API imports the checked-in `terraria.db` SQLite dataset
into PostgreSQL. PostgreSQL data is stored in a named Docker volume, so it
survives container rebuilds and `docker compose down`.

```bash
docker compose up --build
```

Open http://localhost:3000. The API is available at http://localhost:5000.
Use `docker compose up --build -d` to run in the background, and
`docker compose logs -f` to follow the logs.

The default PostgreSQL password is intended for local development only. Before
deploying, create a `.env` file based on `.env.example` and set a strong,
unique `POSTGRES_PASSWORD`. Keep `.env` private; it is git-ignored.

Stop the stack without deleting the database:

```bash
docker compose down
```

`docker compose down -v` also deletes the PostgreSQL volume and its data. Use
that only when you explicitly want to reset the database.

### Refresh the PostgreSQL dataset

After updating `terraria.db` with `scraper.py`, rebuild the API image and
explicitly replace the PostgreSQL data:

```bash
docker compose build api
docker compose run --rm api python migrate_sqlite_to_postgres.py --replace
docker compose up -d api
```

The `--replace` option deletes the current item, recipe, and ingredient rows
before importing the updated SQLite dataset.

### Deploy the Compose stack

Deploy the repository to a Docker host that supports Docker Compose, set
`POSTGRES_PASSWORD` securely in the host environment or its private `.env`
file, and run `docker compose up --build -d`. Keep the named `postgres_data`
volume persistent and back it up. The app stays available while the remote
host is running; turning off your laptop does not stop a remote host.

## Run only the Flask API without Docker

For the local SQLite setup, create and activate a Python environment, then
install requirements:

```bash
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Visit http://localhost:5000. If `DATABASE_URL` or `PGHOST` is configured, the
Flask API uses PostgreSQL instead of the local SQLite file.

## Refresh the source dataset

Run the scraper to update `terraria.db` from the wiki:

```bash
python scraper.py
```

Then follow the PostgreSQL refresh steps above to import the updated data.

## Notes on the data

- Item/ingredient images load through the app's image proxy from the wiki's
  `Special:FilePath/<Item_Name>.png` endpoint. Some unusual names may not have
  an image; the UI hides a broken image in that case.
- Items can have multiple valid recipes, which appear as separate recipe cards.
- The ingredient tree limits depth (default 5, adjustable through `?depth=`
  on `/api/tree/<name>`) and total nodes to keep large trees manageable.
