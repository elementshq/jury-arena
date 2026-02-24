#!/bin/sh
set -eu

echo "[web] waiting for db..."
until pg_isready -h db -U postgres -d app >/dev/null 2>&1; do
  sleep 1
done

echo "[web] running migrations..."
pnpm --dir /app/web db:migrate

echo "[web] starting next (prod)..."
pnpm --dir /app/web start
