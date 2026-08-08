# AgentSim — A Wind Tunnel for Product Launches on X

*Team vision · xAI Grokathon · August 2026*

## The pitch

Nobody knows who their X audience actually is — so every launch post is one-size-fits-none. AgentSim clusters your real followers into interest tribes, and an agent turns your marketing goal into a targeting decision: tell it who to reach ("my biggest following," "this new group of people"), and it emits a tailored post + Grok Imagine poster for each targeted cluster. For paid reach, every cluster exports as an Ads-ready custom audience so each segment sees the version built for it.

## The problem

- Organic posts can't be targeted — no per-follower delivery control, one shot at your announcement.
- Paid targeting is coarse — X Ads "dark posts" can show different creative to different uploaded ID lists, but marketers have no good way to build those lists.
- Nobody knows their own audience — 20k followers might really be 6 tribes that respond to completely different framing.

## The product loop

1. **Ingest** — pull followers via the X API: bios, recent posts, engagement with the account, follow graph.
2. **Cluster** — embed each follower as a persona document (bio + posts + engagement + who they follow), cluster the embeddings, refine with the graph. Output: named tribes backed by real members and real posts.
3. **Generate** — brief the copilot on your product; it drafts a variant per cluster: pitch copy + a Grok Imagine poster styled for that tribe.
4. **Target** — tell the copilot who to reach ("my biggest following," "this new group"); it picks the cluster(s) and pairs each with its variant.
5. **Deploy** — post the chosen variant organically; export each cluster + matched creative as Ads-ready dark-post audiences.

## Future: the agent iteration loop (not P0)

Post-hackathon, the loop closes into continuous iteration: deploy → measure real per-cluster engagement → refine clusters and creative → deploy again. Simulation and backtesting live here — before each iteration, variants are pre-tested on agent personas grounded in each cluster's real posts, and the sim is calibrated by backtesting against the engagement data the loop keeps collecting. Cool, differentiated, and the ambition slide — but not required for the core demo.

## Interaction layer

One chat surface, driven by **Grok Voice** (text fallback), with two modes:

- **Campaign copilot** — a launch strategist you brief out loud. Its core job is turning a marketing goal into a **targeting decision**: "target my biggest existing following" → picks the largest/most-engaged cluster and emits its tailored post + poster; "reach people like this who don't follow me yet" → discovery mode (below). It drives the pipeline and narrates results into the UI (audience map, variant grid).
- **Focus group mode** — voice-interview any cluster's persona: "You're my AI-skeptic engineer followers — what would make you try this?" A focus group of your own audience, on demand.

## Discovery: targeting new populations

The clustering pipeline is seed-agnostic. Point it at a competitor/adjacent account's followers, or users posting about a topic, and the same embed + cluster machinery produces personas for an audience you *don't* have yet — with tailored creative and an exportable audience list per new cluster. (Delivery constraint applies doubly to non-followers: the deliverable is creative + audience export, not organic reach.)

## What's novel vs. what's rails

Custom audiences and dark posts are existing X Ads features — our last-mile rail, not our invention. What doesn't exist today: auto-deriving ad audiences by clustering your own follower graph, an agent that turns marketing goals into targeting decisions with per-tribe creative, and (future) pre-testing that creative on a simulated twin of your audience inside a closed iteration loop.

## Demo (6 beats)

Audience map ("18k followers = 6 tribes") → voice-brief the copilot; ask it to "target my biggest following" and watch it pick the cluster → Imagine-generated post + poster per targeted cluster → voice-interview a skeptical persona, revise the creative → post it live + export audiences → one discovery flourish: "now reach people like this who don't follow me" (precomputed seed) → close on the ambition slide: the agent iteration loop with simulation + backtesting.

## Fit to judging (usefulness × technical complexity)

- **Technical complexity:** embedding + clustering + graph communities with an interactive audience map (visible DS work), per-cluster generative creative, and agentic targeting decisions. The future agent-iteration-loop (sim + backtest) is the ambition slide.
- **Usefulness:** the copilot answers the marketer's actual question — *who* to target and *with what* — instead of narrating a pipeline.

## Decisions locked

- Core demo loop (P0): cluster → agent picks target → emit tailored post + poster per cluster → deploy/export. Sim + backtest are future work inside the agent iteration loop, not P0.
- One chat surface: copilot (targeting brain) + persona interviews, Grok Voice first.
- Variants = copy + Grok Imagine graphic, per cluster.
- Deploy = organic winner + audience export. Live Ads dark posts are out of scope: Ads API access is a separate manual approval taking weeks (plus a funded ads account), so dark-post delivery is the production-roadmap slide — "this export uploads straight into X Ads custom audiences."

## Open questions

- App permissions: current access token is Read-only — set up user authentication with Read + Write and regenerate before demo day so the copilot can post the winner.
- Which account to demo on (needs enough followers to cluster interestingly).
- How the copilot ranks clusters for "my biggest following" — raw size, engagement-weighted, or a blend.
- Future loop details (sim fidelity, AgentTorch-style populations, engagement scoring) — park until post-hackathon.
