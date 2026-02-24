# Quick Start

This guide walks you through setting up JuryArena locally and verifying it works.

## Prerequisites

- **Docker** and **Docker Compose** available
- **Node.js** v24.x or later installed

## 1. Clone the Repository

```bash
git clone git@github.com:Liquid-dev/ele-cloud-autobench.git
cd ele-cloud-autobench
```

## 2. Configure Environment Variables

Create the environment file for the web application:

```bash
cp web/.env.example web/.env
```

Edit `web/.env` as needed to set LLM API keys and other settings.
For details on API key configuration, see [LLM Configuration › API Keys](./guides/llm-configuration#api-keys).

## 3. Configure LLMs

Set up the LLMs you want to use for evaluation:

```bash
cp web/config/models.example.yaml web/config/models.yaml
```

Edit `web/config/models.yaml` as needed.
For details, see [LLM Configuration](./guides/llm-configuration).

## 4. Start the Application

Use Docker Compose to start the application:

```bash
cd infra
docker compose up -d
```

Open [http://localhost:3000](http://localhost:3000) in your browser and confirm the dashboard loads.

## Next Steps

- See [Overview](./) for the overall project structure.
