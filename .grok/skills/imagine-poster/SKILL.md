---
name: imagine-poster
description: Generate or iterate an X launch poster with Grok Imagine — tribe-tuned style, price/date lockups, 2:3 ratio. Use for any "make/edit the poster" request.
---

# Launch posters with Grok Imagine

Endpoints (XAI_API_KEY): POST https://api.x.ai/v1/images/generations
{model:"grok-imagine-image-quality", prompt} → {url}; edits go to /v1/images/edits
with {image:{url,type:"image_url"}}. In the app, use POST /api/imagine instead
({kind:"image"|"edit"|"video", prompt, imageUrl?, aspectRatio:"2:3"}) — it
persists results and returns a servable /api/files URL.

Prompt recipe — always include, in order:

1. Format: "launch poster, 2:3 portrait, bold single focal product"
2. The product, physically described (never a brand name alone)
3. Tribe tuning: students→warm/relatable/price-forward; builders→dark/technical/spec-forward;
   designers→typographic/minimal; founders→traction metrics lockup
4. Text lockups in quotes, max 3: launch date, price badge, one-line hook
5. Style anchors: "clean vector-adjacent render, premium gradient background, no watermark"

Iterate with edits (keep composition, change one axis per call):
"warmer palette, add '$99 EARLY BIRD' badge top-right, keep robot pose".
Iterate ≤3 times; present each to the founder before the next change.
