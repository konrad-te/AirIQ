#!/bin/sh
set -e

echo "Running Alembic migrations..."
cd /app/backend
alembic upgrade head
cd /app

echo "Starting uvicorn..."
exec uvicorn backend.app:app --host 0.0.0.0 --port 8000
