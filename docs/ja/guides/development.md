

# 開発手順

このページでは、JuryArena をローカルで開発するための手順を説明します。

Quick Start は本番相当の起動手順を対象としていますが、
ここでは開発時の構成を扱います。



## 開発構成の概要

JuryArena は以下のコンポーネントで構成されています。

- Web（Next.js）
- Worker（評価実行）
- Database（PostgreSQL）
- Infrastructure（Docker Compose）

開発時は、Web と Worker をローカルで起動し、
DB のみ Docker で動かす構成を推奨します。



## 1. DBのみDockerで起動（推奨）

```bash
cd infra
docker compose -f docker-compose.dev.yml up -d db

```

停止:

```bash
docker compose -f docker-compose.dev.yml down

```

## 2. Worker のセットアップ

```bash
cd worker
uv sync
```

Worker は評価ジョブを非同期で処理します。


## 3. Web のセットアップ

```bash
cd web
pnpm install
pnpm run db:migrate
```

## 4. Web の起動

```bash
pnpm run dev
```

デフォルトで http://localhost:3000 が起動します。


## フルコンテナ起動（差分確認用）

コンテナ構成を確認したい場合は、dev用 compose を使用します。

起動:

```bash
cd infra
docker compose -f docker-compose.dev.yml up -d

```

停止:

```bash
docker compose -f docker-compose.dev.yml down

```