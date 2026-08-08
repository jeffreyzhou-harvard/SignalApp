---
name: AgentSim
description: A launch studio's flight deck — dark Grok-native shell where each project is a wind-tunnel run for a launch on X.
colors:
  ground: "#08090a"
  surface: "#0e0f11"
  raised: "#16181b"
  overlay: "#1b1e22"
  line: "#212428"
  line-strong: "#2f343a"
  fg: "#f2f4f6"
  muted: "#a3abb4"
  faint: "#82898f"
  accent: "#4da3ff"
  danger: "#ff6369"
typography:
  headline:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
  reading:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: "28px"
  label:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
  mono:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "12px"
    fontWeight: 400
rounded:
  xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  full: "9999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "20px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.fg}"
    textColor: "{colors.ground}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "8px 16px"
  button-primary-dialog:
    backgroundColor: "{colors.fg}"
    textColor: "{colors.ground}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-secondary:
    textColor: "{colors.muted}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.ground}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  input:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.fg}"
    rounded: "{rounded.md}"
    padding: "10px 14px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
  chip:
    textColor: "{colors.muted}"
    rounded: "{rounded.full}"
    padding: "6px 14px"
  nav-item:
    textColor: "{colors.faint}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  composer:
    backgroundColor: "{colors.raised}"
    rounded: "{rounded.xl}"
    padding: "10px 12px"
---

# Design System: AgentSim

## Overview

**Creative North Star: "The Wind-Tunnel Flight Deck"**

AgentSim is a launch studio's flight deck: each project is a wind-tunnel run for a product launch on X. The world is dark and Grok-native — layered near-blacks separated by hairline borders, crisp white Geist type, and white pill primary actions — with one signal blue reserved for identity, links, and focus. The direction contract explicitly refuses two defaults, and the build holds both refusals: no SaaS dashboard of stat cards, and no generic chatbot shell. The file-browser grid of runs and the copilot chat *are* the product surface.

Density is calm and workmanlike, in the idiom of a dark file browser (the projects home takes its structure from Figma's Drafts view): a fixed left rail, a hairline-divided content column, and a thumbnail grid. Air — empty states, image-rendering waits, blank thumbnails — is never blank; it carries the drifting streamline motif, thin curved lines flowing left to right as if the tunnel were running.

**Key Characteristics:**
- Layered near-black tonal ladder (ground → surface → raised → overlay) instead of shadows for everyday depth.
- Hairline separation: 1px `line` borders divide everything; borders brighten to `line-strong` on hover.
- White pill primary actions (Grok idiom); the accent blue is never a button color.
- One signal blue (#4da3ff) rationed to identity, links, focus, and selection.
- The AgentSim mark is rendered through a CSS mask (`.logo-mask`) in `currentColor`, so it takes any text color.
- Streamlines as the signature motif for empty and waiting air.

## Colors

An almost-monochrome cool-dark palette: four near-black surface steps, two hairline grays, three text grays, one signal blue, one danger red.

### Primary
- **Signal Blue** (`accent`, #4da3ff): the single accent, rationed hard. It appears on the linked X account (avatar disc at `accent/15` with accent initial, linked check), text links ("Back to projects"), input focus borders, the `:focus-visible` outline, and text selection (accent at 35% over transparent). It is never a button fill and never decoration.

### Neutral
- **Ground** (#08090a): the page itself — `html/body` background, and the text color sitting on white pills.
- **Surface** (#0e0f11): first layer up — sidebar, project cards, search field, composer bar backdrop (`surface/60` with blur).
- **Raised** (#16181b): second layer — active nav item, hover fills, dialog inputs, user chat bubbles, inline code, skeleton blocks, empty thumbnails.
- **Overlay** (#1b1e22): the floating layer — dialogs and context menus only.
- **Hairline** (`line`, #212428): the default 1px border everywhere — panel dividers, card edges, input strokes. Doubles as the ink for blank-thumbnail streamlines.
- **Hairline Strong** (`line-strong`, #2f343a): hover/emphasis border, the border of floating layers, scrollbar thumbs, and the ink for large streamline illustrations and the chat empty-state mark.
- **Foreground** (`fg`, #f2f4f6): crisp near-white primary type; also the fill of primary buttons and the logo mark.
- **Muted** (#a3abb4): secondary text — descriptions, secondary buttons, inactive icons, thinking dots.
- **Faint** (#82898f): tertiary text — timestamps, placeholders, captions, disabled nav.
- **Danger** (#ff6369): destructive actions and errors — delete button fill, error text, error notes on `danger/10` fill with `danger/40` border.

### Named Rules
**The One Blue Rule.** Signal blue marks *who you are and where you are*: identity (the X account), links, focus, selection. It never fills a button, never tints a surface, never decorates. If blue is spreading, it's wrong.

**The White Pill Rule.** The primary action on any dark surface is a white (`fg`) pill with `ground` text. White is the loudest color in this world; that's what makes the call to action unmistakable without an accent.

## Typography

**Body Font:** Geist (with ui-sans-serif, system-ui fallback), loaded via `next/font` as `--font-geist-sans`
**Mono Font:** Geist Mono (with ui-monospace fallback) — model names and inline code only

**Character:** One family, tight tracking on anything semibold, small sizes throughout. The voice is an instrument panel: precise, quiet, never display-scaled. The largest type in the whole app is 20px.

### Hierarchy
- **Headline** (600, 20px, tracking -0.025em): section-level moments only — the empty-state heading. The chat's brief heading steps down to 18px.
- **Title** (600, 15px, tracking -0.025em): the app name, page titles ("Projects"), project titles in the chat header.
- **Reading** (400, 15px, line-height 28px): chat transcript text — user bubbles, copilot markdown, the composer.
- **Body** (400, 14px): default UI text — nav items, descriptions, form inputs, most buttons (buttons at 500–600).
- **Label** (500, 13px): field labels, secondary buttons, menus, starter chips, search input.
- **Caption** (400, 11–12px): footer hints, timestamps, poster credits; 10px uppercase with wide tracking only on the "Soon" badge.
- **Mono** (400, 12–13px): model identifiers ("Grok · grok-4.5") and inline code on a `raised` chip.

### Named Rules
**The Instrument Panel Rule.** No display type. Hierarchy is built from weight (400/500/600), one size step, and tracking — never from scale jumps. Semibold always tightens its tracking.

## Layout

The shell is a full-height (`h-dvh`, overflow hidden) two-part frame: a fixed 240px left rail (`surface`, hairline right border) and a fluid content column. The rail stacks mark + wordmark, nav, and — pinned to the bottom behind a hairline top border — the X account/settings row. Below 768px the rail hides entirely; the mark and a settings button move into the content header.

The content column leads with a hairline-bordered header row (py-14px, px-24px): title left, search + white "New project" pill right. Below it, the project grid: `repeat(auto-fill, minmax(220px, 1fr))`, 20px gaps, 24px padding, content-start, scrolling independently.

The chat is a single centered column, `max-w-2xl` (672px), 16px side padding: hairline header (back, mark, editable title, X-account pill right), scrolling transcript with 24px gaps between turns, and a composer bar docked at the bottom on translucent `surface/60` with backdrop blur.

Spacing runs on the Tailwind 4px scale; the working rhythm is 8/12/16/20/24px, with 14px (`3.5`) as the recurring card/input inset. Density is uniform — no compact/comfortable modes.

## Elevation & Depth

Depth is tonal, not shadowed. The four-step ladder — `ground` page, `surface` panels, `raised` interaction, `overlay` floating — does the everyday work: each nested or hovered layer steps one rung up and the hairline border does the separation. Real shadows exist only under the two truly floating layers, and they are large, soft, and heavily darkened, reading as distance from the deck rather than material thickness. The composer bar adds one translucency: `surface` at 60% with backdrop blur, so the transcript ghosts beneath it (the card menu trigger does the same with `ground/80`).

### Shadow Vocabulary
- **Menu float** (`box-shadow: 0 12px 32px -8px rgba(0,0,0,0.7)`): context menus (project card options).
- **Dialog float** (`box-shadow: 0 24px 64px -16px rgba(0,0,0,0.8)`): modal dialogs over the `black/60` scrim.

### Named Rules
**The Hairline Rule.** Surfaces are separated by 1px `line` borders and tonal steps, never by resting shadows. A shadow means the element has left the deck: menus and dialogs only.

## Shapes

Rounding scales with how much an element floats. Hairline-bordered rectangles with 8px radius (`rounded-lg`) are the default working shape — inputs, nav items, secondary buttons, menus, error notes. Containers step up to 12px (cards, dialogs, generated posters, transcript images); the composer and user chat bubbles reach 16px, with the user bubble's bottom-right corner cut to 6px as the speaker's tail. Fully round pills mark actions and identity: primary buttons, starter chips, the X-account pill, avatar discs, the send button. Small dense elements (menu triggers, inline code, the "Soon" badge) drop to 4–6px.

Two signature geometries: the masked AgentSim mark (`currentColor` through a PNG mask, so it inherits any text color — `fg` in headers, `line-strong` as a large watermark), and the streamline — a thin (1–1.5px) curved path flowing left to right, drawn in `line` or `line-strong`, appearing wherever air would otherwise be empty (empty state, blank thumbnails, the Imagine rendering placeholder). Icons are lucide-react, 12–18px, stroke width 2 (2.5 when bold, inside primary pills).

## Components

### Buttons
- **Primary (shell):** white pill — `fg` fill, `ground` text, semibold 13–14px, `Plus`/`ArrowUp` icon at stroke 2.5, padding 8px 16px to 10px 20px. Hover scales to 1.03, active to 0.98 (transform only, no color change). Disabled drops to 30–40% opacity.
- **Primary (dialog forms):** same white fill and semibold text, but 8px radius instead of a pill — form-row actions ("Create & open chat", "Rename", "Link").
- **Secondary:** transparent with hairline border, `muted` text at 500; hover brightens border to `line-strong` and text to `fg` (color transition ~200ms).
- **Danger:** `danger` fill, `ground` text, 8px radius — destructive confirms only.
- **Icon buttons:** 6–8px radius, `muted` icon; hover gains `raised` (or `overlay` on raised ground) fill and `fg` icon.

### Chips
- **Starter chips / X-account pill:** full-round, hairline border, transparent fill, 13px `muted` text; hover brightens border and text. Selected-state toggles (Imagine wand) invert to `fg` fill with `ground` icon.
- **"Soon" badge:** 4px radius, hairline border, 10px uppercase wide-tracked `faint` text.

### Cards / Containers
- **Project card:** 12px radius, hairline border, `surface` fill, clipped 4:3 thumbnail on `raised` above a 14px-inset meta row (medium 14px title, `faint` 12px timestamp). Hover brightens the border and scales the thumbnail image to 1.03 over 300ms; no lift, no shadow. Blank thumbnails show three thin streamlines in `line` behind the project's initial in `muted`. Cards enter with `rise-in`, staggered 45ms per card (capped at 360ms).
- **Skeleton:** the same card anatomy with `raised` pulse blocks — loading mirrors the loaded shape.

### Inputs / Fields
- **Style:** hairline border, `raised` fill (`surface` for the header search), 8px radius, 14px text, `faint` placeholder.
- **Focus:** border turns `accent`, outline suppressed (non-input elements get the global 2px `accent` outline at 2px offset).
- **Composer:** 16px-radius `raised` bar with `line-strong` border holding attach + Imagine icon buttons, an auto-growing borderless textarea (15px/28, max 200px), and the white round send button.

### Navigation
- **Rail items:** 8px radius, 14px text, 16px `muted` icon. Active: `raised` fill, `fg` medium text. Inactive/disabled: `faint` text with a "Soon" badge. Hover (on interactive rows): `raised` fill.
- **Rail footer:** the X-account row — accent avatar disc when linked, dashed-hairline disc with the X logo when not — with a settings glyph, pinned above the rail's bottom edge.

### Dialogs
12px radius, `line-strong` border, `overlay` fill, dialog-float shadow, over a `black/60` scrim; `rise-in` on entry. Hairline-divided header (semibold 14px title, ghost close button) above 16–20px-padded content. Focus is trapped, first field auto-focused, Escape and scrim-click close.

### Chat transcript (signature)
Asymmetric by design: the user speaks in a `raised` 16px-radius bubble (tail corner 6px, max-width 85%, right-aligned); the copilot answers as bare markdown directly on `ground` — no bubble, no avatar. Generated posters render as 12px-radius bordered images (320px column) with a mono model credit + quoted prompt caption in `faint`. Waiting states: three pulsing `muted` dots with a label for text ("Grok is thinking"), and a square `raised` placeholder crossed by animated streamlines for images ("Rendering with Grok Imagine"). Errors land in the transcript as `danger/10` notes with `danger/40` borders.

### Motion
One easing — `--ease-out-expo` `cubic-bezier(0.16, 1, 0.3, 1)` — for entrances; plain easing for color transitions (~200ms) and the 1.2s thinking-dot pulse. `rise-in` (fade + 6px lift, 500ms) is the only entrance animation. Streamlines draw in over 1.6s, then drift on an 18s linear loop. All decorative animation is disabled under `prefers-reduced-motion`.

## Do's and Don'ts

### Do:
- **Do** step up the tonal ladder for depth: `ground` → `surface` → `raised` → `overlay`, one rung per nesting or hover, with a hairline border doing the separation.
- **Do** make every primary action a white `fg` pill (shell) or white 8px-radius button (dialog forms) with `ground` text — hover scale 1.03, active 0.98.
- **Do** reserve #4da3ff for identity, links, focus borders/outlines, and selection only.
- **Do** fill empty or waiting air with streamlines (1–1.5px curves in `line`/`line-strong`) — empty states, blank thumbnails, image-rendering waits.
- **Do** render the AgentSim mark via `.logo-mask` in `currentColor` (`fg` at small size, `line-strong` as a watermark) — never as an `<img>`.
- **Do** enter content with `rise-in` on `--ease-out-expo`, stagger grids at 45ms per item capped at 360ms, and honor `prefers-reduced-motion`.
- **Do** give every state a designed body: skeletons that mirror the loaded layout, authored empty states with a next action, retryable error screens, inline `danger/10` error notes.

### Don't:
- **Don't** put resting shadows on cards, inputs, or panels — the two catalogued shadows belong to menus and dialogs alone.
- **Don't** fill buttons or tint surfaces with the accent blue, and don't introduce a second accent.
- **Don't** build stat-card dashboards or a generic centered chatbot shell — the grid of runs and the asymmetric transcript are the product's own forms.
- **Don't** wrap copilot replies in bubbles or add avatars to the transcript; only the user gets a bubble.
- **Don't** exceed 20px type or reach for a display face; hierarchy comes from weight and tight tracking.
- **Don't** use light-theme values anywhere — this world is dark-only, `ground` to the edges.
