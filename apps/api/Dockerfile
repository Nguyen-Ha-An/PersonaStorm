FROM python:3.11-slim

WORKDIR /app

# System deps kept minimal — pure-Python service.
COPY apps/api/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY apps/api/app ./app
# Benchmark samples + presets ship with the image; runs/ is a volume.
COPY data /data

ENV DATA_DIR=/data \
    RUNS_DIR=/data/runs \
    PYTHONUNBUFFERED=1

# Drop root: the service only needs to read /app and write /data/runs.
RUN useradd --create-home --uid 10001 appuser \
    && mkdir -p /data/runs \
    && chown -R appuser:appuser /data
USER appuser

EXPOSE 8000
# Shell form (not exec form) so $PORT expands — Render/Railway inject PORT and
# expect the process to bind to it; falls back to 8000 for local `docker run`.
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
