FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py migrate_sqlite_to_postgres.py terraria.db ./
COPY static ./static
COPY frontend/public/ANDYB.ttf ./frontend/public/ANDYB.ttf

EXPOSE 5000

CMD ["sh", "-c", "python migrate_sqlite_to_postgres.py && exec gunicorn --bind 0.0.0.0:5000 app:app"]
