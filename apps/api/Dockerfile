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

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
