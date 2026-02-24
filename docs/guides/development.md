# Development

This page explains how to set up JuryArena for local development.

The Quick Start covers production-equivalent startup, while this page focuses on the development configuration.

## Development Setup Overview

JuryArena consists of the following components:

- Web (Next.js)
- Worker (evaluation execution)
- Database (PostgreSQL)
- Infrastructure (Docker Compose)

For development, the recommended setup is to run Web and Worker locally while running only the DB via Docker.

## 1. Start DB Only via Docker (Recommended)

```bash
cd infra
docker compose -f docker-compose.dev.yml up -d db
```

To stop:

```bash
docker compose -f docker-compose.dev.yml down
```

## 2. Set Up the Worker

```bash
cd worker
uv sync
```

The Worker processes evaluation jobs asynchronously.

## 3. Set Up the Web App

```bash
cd web
pnpm install
pnpm run db:migrate
```

## 4. Start the Web App

```bash
pnpm run dev
```

Starts at http://localhost:3000 by default.

## Full Container Startup (for Diff Verification)

If you want to verify the container configuration, use the dev compose file.

Start:

```bash
cd infra
docker compose -f docker-compose.dev.yml up -d
```

Stop:

```bash
docker compose -f docker-compose.dev.yml down
```
