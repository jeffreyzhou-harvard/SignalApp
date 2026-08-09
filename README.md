<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="public/signal-white.png" />
    <img src="public/NewSignal.png" alt="Signal" width="220" />
  </picture>

# Signal

**A wind tunnel for product launches on X.**

Your followers' bios, posts, and engagement, embedded into constellations.
One launch, engagement-tuned for every niche.

[How It Works](#how-it-works) ·
[Getting Started](#getting-started) ·
[Architecture](#architecture) ·
[Configuration](#configuration)

</div>

---

## What is Signal?

Launching on X is a one-shot experiment: you write a post, pick an image, hit send, and find out afterwards whether your audience cared. Signal runs that experiment *before* you post.

It ingests your real follower graph, clusters it into niches with per-follower personas, and renders your launch creative with Grok Imagine. For any niche you target, Grok rewrites the post for how that audience reads, and the two versions go head to head in a simulated feed where every agent is one of your actual followers, powered by Grok and reacting in character. An improvement agent reads the results and drafts the next challenger, and when a variant earns its win you ship it to X in one click and track its live engagement.

## How It Works

1. **Brief** · Create a project, upload product shots, and describe how the marketing material should look. Grok Imagine renders the launch creative (image or teaser video).
2. **Map** · Your followers appear as an interactive galaxy, clustered into niches (persona cards, cluster labels, and co-engagement edges from the ingestion pipeline).
3. **Target and tailor** · Pick a niche. Grok rewrites your baseline post for that audience, giving you an A/B pair.
4. **Wind tunnel** · Both variants run through a simulated audience built on [camel-ai/OASIS](https://github.com/camel-ai/oasis): each agent is seeded with a real follower's persona and decides to like, repost, reply, or scroll past. Test on just the niche or your whole follower demographic.
5. **Improve** · An agent reads the verdict, engagement, and simulated replies, then rewrites the copy and re-renders the creative into a new challenger. Loop until it wins convincingly.
6. **Ship** · Post the winner to X from your linked account. The Deploys tab tracks live likes, reposts, replies, and views for everything Signal published.

You can also iterate conversationally: the project chat is a Grok copilot that refines copy and re-renders creative, and any draft can be sent straight back into the wind tunnel.

## Getting Started

### Prerequisites

- Node.js 20+ and [uv](https://docs.astral.sh/uv/) (for the Python services)
- An [xAI API key](https://docs.x.ai/) (chat, image, and video generation)
- Optional: an X developer app for Sign in with X and real follower ingestion
- Optional: Postgres (local Docker or Neon) for the ingestion backend

### Run the app

```bash
npm install
cp .env.example .env   # set XAI_API_KEY
npm run dev            # http://localhost:3000
```

That alone gives you the full flow on a seeded sample audience with a deterministic sample wind tunnel.

### Real audience (ingestion backend)

```bash
cd backend
uv sync
uv run uvicorn app.main:app --port 8000
```

Set `AUDIENCE_PROVIDER=db` and `BACKEND_URL=http://localhost:8000` in `.env`. The backend ingests followers from the X API, enriches them into personas with Grok, and clusters them with the pipeline in `ml/`. If the backend is down or has no active run, the frontend falls back to the sample audience automatically.

### Real wind tunnel (OASIS agents)

```bash
cd simlab
uv sync
uv run uvicorn app:app --port 8100
```

Set `SIMULATION_PROVIDER=oasis` and `SIMLAB_URL=http://localhost:8100` in `.env`. Every simulated follower becomes a Grok-driven OASIS agent with their real persona; runs take a couple of minutes and fall back to the sample simulation on any failure.

## Architecture

Everything external is behind a small interface chosen by an environment variable, so each layer swaps independently: the same UI runs on sample data or your real follower graph, on a seeded simulation or live Grok agents.

| Seam | Interface | Implementations |
| --- | --- | --- |
| Text generation | `TextProvider` | `grok` (grok-4.5) |
| Image generation | `ImageProvider` | `grok-imagine` (grok-imagine-image-quality) |
| Video generation | `VideoProvider` | `grok-imagine-video` (grok-imagine-video-1.5) |
| Persistence | `StorageAdapter` | `json` (files under `data/`) |
| Account linking | `AccountProvider` | `x-oauth` (PKCE), `x-stub` (auto-selected) |
| Audience data | `AudienceProvider` | `db` (ingestion backend), `mock` (seeded sample) |
| Simulation | `SimulationProvider` | `oasis` (Grok agents), `mock-agents` (seeded) |

### Repository layout

```
src/                  Next.js app
  app/api/            API routes: chat, campaign, simulate, publish, auth, deploys
  components/         UI: projects, chat, audience galaxy, campaign panel
  lib/                Core: providers, storage, audience, simulation, accounts, launch copy
backend/              FastAPI ingestion service: X follower ingest, Grok persona
                      enrichment, clustering store, MCP server (uv project)
ml/                   Clustering pipeline: embeddings, KMeans, Grok cluster labels
simlab/               OASIS wind-tunnel service: persona agents on a simulated
                      X platform (uv project)
docs/                 Vision, design notes, and specs
data/                 Local storage (gitignored)
```

The voice copilot harness (Grok Voice Agent API) lives in `src/lib/voice/`; see [AGENTS.md](AGENTS.md) for its map.

## Configuration

All settings live in `.env` (see [.env.example](.env.example) for the full annotated list). The ones that matter most:

| Variable | Purpose |
| --- | --- |
| `XAI_API_KEY` | xAI key for chat, Imagine images, and video |
| `X_OAUTH_CLIENT_ID` | Enables real Sign in with X (PKCE); unset uses a local stub |
| `AUDIENCE_PROVIDER` | `db` for the real clustered audience, `mock` for the sample |
| `SIMULATION_PROVIDER` | `oasis` for Grok agents, `mock-agents` for the seeded loop |
| `BACKEND_URL` / `SIMLAB_URL` | Where the ingestion backend and wind tunnel run |
| `DATABASE_URL` | Postgres for the ingestion backend |

## Acknowledgements

- [xAI](https://x.ai/) Grok and Grok Imagine power the copy, creative, personas, and every simulated agent.
- [camel-ai/OASIS](https://github.com/camel-ai/oasis) provides the social simulation the wind tunnel is built on.
- [React Three Fiber](https://github.com/pmndrs/react-three-fiber) renders the audience galaxy.

Built at the xAI Grokathon, August 2026.
