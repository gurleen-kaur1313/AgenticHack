# MindMesh

MindMesh is an autonomous mental wellness platform that monitors behavioral signals in real time, runs them through a multi-agent AI pipeline, and deploys targeted interventions when stress or risk is detected.

## How it works

1. The frontend captures behavioral signals (typing speed, pause frequency, deletions, journal text) and streams them to the backend over WebSocket.
2. The backend runs a LangGraph pipeline where four specialized AI agents analyze the data in sequence:
   - **Emotion agent** — classifies emotional state from the signal
   - **Risk agent** — scores mental health risk level (low → critical)
   - **Intervention agent** — (conditional) recommends an action if risk is elevated
   - **Reflection agent** — generates a reflective summary for the user
3. Results are sent back to the frontend in real time and persisted to ClickHouse for analytics.

```
Signal → Ingest → Emotion → Risk → [Intervention?] → Reflection → Persist
```

## Tech stack

| Layer | Tools |
|---|---|
| Frontend | Next.js 14, TypeScript, Tailwind CSS, Recharts, Framer Motion |
| Backend | FastAPI, LangGraph, Python 3.12+ |
| AI | OpenAI GPT-4o (or any OpenAI-compatible model) |
| Analytics | ClickHouse |
| Observability | Datadog APM + LLM Observability |
| Signal enrichment | Senso |

## Project structure

```
AgenticHack/
├── app/                    # Next.js pages and layout
├── lib/
│   ├── api.ts              # Typed fetch + WebSocket helpers
│   ├── mock-data.ts        # Fallback data when backend is offline
│   └── types.ts            # Shared TypeScript types
├── mindmesh/               # FastAPI backend
│   ├── main.py             # API routes and WebSocket handler
│   ├── models.py           # Pydantic request/response models
│   ├── agents/             # AI agents (emotion, risk, intervention, reflection)
│   ├── orchestrator/       # LangGraph graph, router, and state management
│   ├── prompts/            # System prompts for each agent
│   ├── utils/              # Datadog, ClickHouse, Senso, LLM clients
│   └── sql/schema.sql      # ClickHouse table definitions
└── tests/                  # Backend and agent tests
```

## Setup

### Prerequisites

- Node.js 18+
- Python 3.12+
- An OpenAI API key

### Frontend

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

### Backend

```bash
cd mindmesh
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # then add your API keys
uvicorn main:app --reload --port 8000
```

The frontend connects to `http://localhost:8000` by default. To change this, set `NEXT_PUBLIC_API_BASE_URL` in `.env.local`.

## Environment variables

### Frontend (`.env.local`)

| Variable | Default | Description |
|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:8000` | Backend base URL |

### Backend (`mindmesh/.env`)

| Variable | Required | Description |
|---|---|---|
| `OPENAI_API_KEY` | Yes | OpenAI key for all agents |
| `MODEL_NAME` | No (default: `gpt-4o`) | Model to use |
| `CLICKHOUSE_HOST` | No | Analytics persistence |
| `DD_API_KEY` | No | Datadog APM tracing |
| `DD_LLMOBS_ENABLED` | No | Datadog LLM Observability |
| `SENSO_API_KEY` | No | Behavioral signal enrichment |

All sponsor integrations are optional. If their environment variables are absent, the clients silently no-op.

## API reference

| Method | Path | Description |
|---|---|---|
| `WS` | `/ws/sessions/{session_id}` | Real-time signal stream (used by frontend) |
| `POST` | `/analyze` | One-shot signal analysis (no WebSocket) |
| `GET` | `/signals` | Current wellness signals for the dashboard |
| `GET` | `/analytics/mood` | Mood/stress/anxiety trend series |
| `GET` | `/analytics/timeline/{session_id}` | Historical signal timeline |
| `GET` | `/analytics/interventions/{session_id}` | Past interventions |
| `GET` | `/analytics/summary/{session_id}` | Aggregate wellness summary |
| `POST` | `/interventions/{id}/deploy` | Manually trigger an intervention |
| `GET` | `/health` | Service + integration health check |

## Useful scripts

```bash
# Frontend
npm run dev          # dev server on :3000
npm run build        # production build
npm run typecheck    # TypeScript type check

# Backend
uvicorn main:app --reload --port 8000   # dev server on :8000
python test_pipeline.py                  # run a quick pipeline smoke test
```
