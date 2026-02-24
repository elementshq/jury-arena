# web/Dockerfile
# syntax=docker/dockerfile:1.6

############################
# base
############################
FROM node:24.12.0-bookworm-slim AS base
WORKDIR /app

# --- minimal system deps ---
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    postgresql-client \
    python3 \
    python3-venv \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# pnpm
RUN corepack enable && corepack prepare pnpm@10.25.0 --activate


############################
# node deps (node_modules)
############################
FROM base AS node-deps
WORKDIR /app/web
COPY web/package.json web/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile


############################
# python deps (venv) - shared cache layer
############################
FROM base AS py-deps
WORKDIR /app

# --- build deps (Python native / Rust) ---
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    pkg-config \
    libssl-dev \
    git \
    && rm -rf /var/lib/apt/lists/*

# --- Rust (Cargo.lock v4 対応) ---
RUN curl https://sh.rustup.rs -sSf | sh -s -- \
    -y \
    --profile minimal \
    --default-toolchain stable
ENV PATH="/root/.cargo/bin:${PATH}"

# worker lockfiles only (to maximize cache)
RUN mkdir -p /app/worker
COPY worker/pyproject.toml worker/uv.lock /app/worker/

# ------------------------------------------------------------
# Python 3.12 venv + deps (cached by uv.lock/pyproject.toml)
# ------------------------------------------------------------
RUN python3 -m venv /opt/uv-bootstrap && \
    /opt/uv-bootstrap/bin/pip install --upgrade pip uv && \
    /opt/uv-bootstrap/bin/uv python install 3.12 && \
    UV_PYTHON_FOUND="$(/opt/uv-bootstrap/bin/uv python find 3.12)" && \
    UV_PY_DIR="$(dirname "$(dirname "$UV_PYTHON_FOUND")")" && \
    rm -rf /opt/python312 && \
    cp -a "$UV_PY_DIR" /opt/python312 && \
    /opt/python312/bin/python3.12 -m venv /opt/venv && \
    /opt/venv/bin/pip install --upgrade pip uv && \
    cd /app/worker && \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    UV_PYTHON=/opt/venv/bin/python \
      /opt/venv/bin/uv sync --frozen && \
    rm -rf /opt/uv-bootstrap


############################
# builder-dev (NO pnpm build)
############################
FROM base AS builder-dev
WORKDIR /app

# bring cached node_modules + python env
COPY --from=node-deps /app/web/node_modules /app/web/node_modules
COPY --from=py-deps /opt/python312 /opt/python312
COPY --from=py-deps /opt/venv /opt/venv

# (optional) copy sources for completeness; dev will override by bind mount anyway
COPY web /app/web
COPY worker /app/worker


############################
# builder (prod) - DOES pnpm build
############################
FROM base AS builder
WORKDIR /app

# bring cached node_modules + python env
COPY --from=node-deps /app/web/node_modules /app/web/node_modules
COPY --from=py-deps /opt/python312 /opt/python312
COPY --from=py-deps /opt/venv /opt/venv

# copy full sources (changing these won't invalidate py-deps unless lockfiles change)
COPY web /app/web
COPY worker /app/worker

# build Next.js (prod artifacts)
WORKDIR /app/web
RUN pnpm build


############################
# dev runtime
############################
FROM node:24.12.0-bookworm-slim AS dev
WORKDIR /app

ENV NODE_ENV=development
ENV PATH="/opt/venv/bin:${PATH}"

# runtime deps only
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    postgresql-client \
    python3 \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.25.0 --activate

# python env from builder-dev
COPY --from=builder-dev /opt/python312 /opt/python312
COPY --from=builder-dev /opt/venv /opt/venv

# entrypoint
COPY web/docker/entrypoint.dev.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

EXPOSE 3000
CMD ["/app/entrypoint.sh"]


############################
# prod runtime
############################
FROM node:24.12.0-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PATH="/opt/venv/bin:${PATH}"

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    postgresql-client \
    python3 \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.25.0 --activate

# artifacts from builder (prod)
COPY --from=builder /opt/python312 /opt/python312
COPY --from=builder /opt/venv /opt/venv
COPY --from=builder /app/web /app/web
COPY --from=builder /app/worker /app/worker

COPY web/docker/entrypoint.prod.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

EXPOSE 3000
CMD ["/app/entrypoint.sh"]
