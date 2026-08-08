# AgentSim — Live Demo

A fully self-contained, deterministic demo of the AgentSim product loop from
[VISION.md](../docs/VISION.md): **map → target → create → wind tunnel → ship**,
driven end-to-end by voice.

Everything is simulated locally (followers, embeddings, Grok Imagine renders,
the agent-population A/B test) so the demo needs **no keys, no network, no
backend** — and can never break on stage.

## Run it

```bash
cd demo
npm install
npm run dev        # → http://localhost:5173
```

Use **Chrome** (best Web Speech support). Grant microphone permission when the
orb starts listening. Headphones recommended — the copilot speaks.

## The scenario

You're **@adityaships** (18,442 followers), launching **Byte** — a palm-sized
AI study-companion robot for students. $99 early bird, launching Sept 4.

## Demo flow & presenter script

Every listening beat is deterministic: *any* recognized speech advances the
story, so your exact wording never matters. Cluster selection is the one
keyword-routed beat (say "students" → Students & EdTech). The lines below are
the suggested script:

| Beat | Copilot says | You say |
|---|---|---|
| 1 · Map | "…six tribes. Which audience are we targeting?" | **"Let's target the students cluster."** |
| 2 · Target | "Students & EdTech — 4,400 followers… What are we launching for them?" | **"I'm launching a little robot for students — let me show you."** |
| 3 · Camera | "Want to turn your camera on and show me the product?" | Click **Turn camera on**, hold up the product |
| 4 · Brief | "Tell me about it." | **"It's called Byte — a palm-sized AI study buddy. It quizzes you from your own notes and guards your focus. Early bird is ninety-nine dollars."** |
| 5 · Iteration 1 | "Here's iteration one. What should I change?" | **"Make it warmer — put it on a student's desk, and show the price."** |
| 6 · Iteration 2 | "Warmer palette, desk scene… Anything else?" | **"Love it. Make the robot the hero, and add the launch date and an early-bird badge."** |
| 7 · Wind tunnel | "…want me to run it through the wind tunnel?" | **"Run the test."** |
| 8 · Verdict | "Variant B out-performed by 38%… Ship it?" | **"Ship it."** |

## Stage controls (rehearsal & fail-safes)

| Key | Action |
|---|---|
| `space` / `enter` | Advance the current listening beat (injects the scripted line — use if the mic misbehaves) |
| `a` | Toggle **autopilot**: the whole demo runs itself, typing the scripted lines |
| `m` | Mute the copilot's TTS (captions always render) |
| `r` | Restart |

Clicking the orb while it's listening also advances; clicking while it speaks
skips the line. Clicking any node in the map view targets that tribe directly.

## What's real vs. staged

| Piece | In this demo | In the product |
|---|---|---|
| Voice in/out | Web Speech API (real mic + TTS) | Grok Voice |
| Follower graph | 369 rendered nodes, seeded PRNG (~2% sample of 18,442) | X API ingest → persona documents |
| Embedding map | Hand-placed HDBSCAN-style tribes in a 3D force layout | UMAP → HDBSCAN over bge embeddings, served via **MCP from the hosted vector store** (the onboarding sync log mirrors this wire) |
| Poster generation | Crafted SVG per iteration | Grok Imagine API |
| A/B wind tunnel | Deterministic event stream, students-weighted | Agent personas grounded in each tribe's real posts (AgentTorch-style) |
| Ship | Staged success screen | `POST /2/tweets` + Ads custom-audience export |

## Architecture

```
src/
  state/script.ts      # the deterministic beat sheet: stages, dialogue, iterations
  App.tsx              # the director: speak → listen → advance state machine
  lib/voice.ts         # Grok Voice stand-in (Web Speech + fail-safes)
  data/clusters.ts     # the six tribes
  data/followers.ts    # seeded persona generator (names, handles, bios, avatars)
  data/sim.ts          # wind-tunnel event stream + final scoreboard
  three/Galaxy.tsx     # the audience map: avatar sprites, edges, labels, camera rig
  components/          # onboarding, HUD, voice dock, camera flow, studio, A/B, ship
```

Avatars in `public/avatars/` are stock portraits from randomuser.me (licensed
for mockups).
