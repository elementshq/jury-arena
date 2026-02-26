<div align="center">

# JuryArena

**Open-source LLM arena evaluation — no ground truth required**

[![Version](https://img.shields.io/badge/version-v0.1.0-blueviolet.svg)](CHANGELOG.md)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-green.svg)](LICENSE)
[![Docs](https://img.shields.io/badge/docs-JuryArena-orange)](https://elementshq.github.io/jury-arena/)

[Documentation](https://elementshq.github.io/jury-arena/) · [Quick Start](#quick-start) · [Data Format](#data-format)

</div>

JuryArena is an open-source evaluation tool for comparing multiple LLMs in an arena format using your **actual production prompts**.

You can relatively compare model response quality in a way close to real-world tasks, without defining ground truth or scoring rubrics in advance.

## Features

- **No ground truth needed** — evaluate subjective quality using LLM-as-a-Judge pairwise judgments
- **Arena format** — models compete 1-on-1; ratings update after every match to build a live ranking
- **Your real prompts** — upload production logs as JSONL or ZIP; includes sample templates to start immediately
- **Multi-judge consensus** — run up to 3 Judge models in parallel and aggregate results by majority vote
- **Elo & Glicko-2** — choose the rating system that fits your evaluation budget and accuracy needs
- **Full trace review** — every judgment, reasoning, cost, and latency is saved and browsable after the run
- **File attachment support** — evaluate RAG and document-QA tasks by attaching PDFs alongside prompts

## How It Works

```
Dataset (JSONL / ZIP)
       │
       ▼
  New Evaluation
  ├─ Select candidate models   (e.g. GPT-4o vs Claude Sonnet)
  ├─ Select judge model(s)     (up to 3)
  ├─ Set max matches           (e.g. 100)
  └─ Choose rating system      (Elo or Glicko-2)
       │
       ▼
  Arena Loop ×N matches
  1. Model A & B each respond to the same prompt
  2. Judge LLM picks the winner  →  "A" | "B" | "tie"
  3. Ratings update  →  next pair selected by rating proximity
       │
       ▼
  Rankings  ·  Match history  ·  Judge reasoning  ·  Cost & latency
```

## Quick Start

### Prerequisites

- **Docker** and **Docker Compose**
- **Node.js** v24.x or later

### 1. Clone

```bash
git clone https://github.com/elementshq/jury-arena.git
cd jury-arena
```

### 2. Configure environment

```bash
cp web/.env.example web/.env
# Edit web/.env — set your LLM provider API keys
```

### 3. Configure models

```bash
cp web/config/models.example.yaml web/config/models.yaml
# Edit web/config/models.yaml — add models you want to compare
```

```yaml
# web/config/models.yaml
model_list:
  - model: openai/gpt-4o
    capabilities:
      inputs:
        pdf: ["base64"]

  - model: anthropic/claude-sonnet-4-5
    capabilities:
      inputs:
        pdf: ["base64"]

  - model: gemini/gemini-2.0-flash
    capabilities:
      inputs:
        pdf: ["base64"]
```

Model identifiers follow the **LiteLLM `provider/model` format**. See [LLM Configuration](https://elementshq.github.io/jury-arena/guides/llm-configuration) for details.

### 4. Start

```bash
cd infra
docker compose up -d
```

Open [http://localhost:3000](http://localhost:3000) — the dashboard is ready.

## Data Format

Upload a JSONL file (one sample per line) or a ZIP with file attachments.

**Minimal example** — single-turn prompt:

```json
{
  "input": {
    "messages": [
      { "role": "user", "content": "Explain the difference between RAG and fine-tuning." }
    ]
  },
  "usage_output": null
}
```

**Multi-turn** — pass conversation history as a single sample; the last user message is what gets evaluated.

**PDF attachment** — use `file_ref` inside a ZIP:

```json
{
  "type": "file_ref",
  "path": "attachments/doc.pdf"
}
```

See [Data Format](https://elementshq.github.io/jury-arena/guides/data-format) for the full specification.

## Architecture

JuryArena is split into two layers that communicate via the file system — no direct API coupling.

| Layer | Technology | Responsibility |
|-------|-----------|----------------|
| **Web** | Next.js | UI, dataset upload, Worker orchestration, DB cache |
| **Worker** | Python (uv) | LLM calls, judging, rating calculation, file output |
| **DB** | PostgreSQL | UI cache (source of truth is Worker files) |

The Worker writes results to `worker/worksets/`; the Web layer watches those files via chokidar and syncs them to the DB for the UI. 

## Rating Systems

| | Elo | Glicko-2 |
|-|-----|----------|
| Uncertainty tracking | None | Yes (Rating Deviation φ) |
| Pair selection | Rating-proximity | Information-maximizing via φ |
| Accuracy with few matches | Low | **High** |
| Interpretability | Single value | 3 parameters |

**Glicko-2 is recommended** for most use cases. Its advantage is especially pronounced when matches are limited or when you need to distinguish models quickly.

See [Rating System](https://elementshq.github.io/jury-arena/concepts/rating-system) for the algorithm details.

## License

[Apache 2.0](LICENSE)
