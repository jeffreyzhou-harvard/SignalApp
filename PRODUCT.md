# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js (App Router) + TypeScript + Tailwind CSS. Confirmed by user 2026-08-08. Server API routes proxy all xAI/Grok calls so keys stay server-side. Storage is local JSON files behind a `StorageAdapter` interface (confirmed); X account linking is a local stub behind an auth-provider interface, real X OAuth 2.0 later (confirmed).

## Users

Founders/marketers launching products on X (initially the 4-person Grokathon team, later external users who "plug in" to the platform). They open AgentSim, create a project per launch/campaign, and brief an AI copilot in chat — typing an initial prompt and uploading product images/screenshots.

## Product Purpose

AgentSim is a wind tunnel for product launches on X: it clusters a founder's real followers into interest tribes and an agent turns a marketing goal into a targeting decision, emitting a tailored post + Grok Imagine poster per targeted cluster. This build is the app shell for that loop: a projects workspace (one project per campaign) and the chat surface where the copilot conversation happens. Full pipeline details in [docs/VISION.md](docs/VISION.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Positioning

Auto-derives ad audiences by clustering your own follower graph, with an agent that turns marketing goals into targeting decisions and per-tribe creative. X's SimClusters power recommendations internally; AgentSim is the founder-facing version.

## Operating Context

- Hackathon build (xAI Grokathon, Aug 2026), demoed live; must feel production-grade.
- Chat backend: xAI API — Grok text (chat completions) and Grok Imagine (image generation), called via server routes with `XAI_API_KEY` from env.
- The linked X account is the identity projects hang off ("your projects will remember").

## Capabilities and Constraints

- **Modularity is a hard requirement.** Others must be able to plug in later: AI providers (text + image) behind a provider interface with Grok as the first implementation; storage behind a `StorageAdapter`; X/account auth behind an auth-provider interface.
- P0 surfaces: (1) Projects home — Figma-file-browser-style grid with left sidebar, starts with a real empty state; (2) new-project flow that titles the project; (3) chat interface per project with initial prompt + image upload, streaming Grok text replies and Grok Imagine generations.
- Settings entry lives at the bottom of the left sidebar on the projects home; it's where the X account gets linked.
- No real X OAuth yet (stub stores handle locally); Ads API delivery out of scope.

## Evidence on Hand

- Vision + architecture docs: `docs/VISION.md`, `docs/ARCHITECTURE.md`.
- Logo asset: `public/` (AgentSim logo, per git history).
- User-supplied visual reference for the projects page: Figma's Drafts file browser (dark top bar, left nav sidebar, thumbnail card grid, empty at first).

## Product Principles

- Modular seams over monolith speed: every external dependency (AI, storage, auth) sits behind a swappable interface.
- The copilot is the product; the shell's job is to get the founder into a productive chat fast (title → prompt → generating).
- Projects are memory: everything a campaign produces accumulates in its project.
- Demo-grade polish: every state shown live (empty, loading, streaming, error) must look intentional.
