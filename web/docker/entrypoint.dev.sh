#!/bin/sh
set -eu

echo "[web] waiting for db..."
until pg_isready -h db -U postgres -d app >/dev/null 2>&1; do
  sleep 1
done

echo "[web] ensure node_modules..."
pnpm --dir /app/web install

echo "[web] running migrations (dev)..."
pnpm --dir /app/web db:migrate

echo "[web] starting next (dev)..."
pnpm --dir /app/web dev
