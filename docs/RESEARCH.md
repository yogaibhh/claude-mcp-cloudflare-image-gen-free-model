# Research notes: free, anti-slop image generation from Claude Code

Notes from building this fork (October 2026). Prices and limits were checked against the providers' own pages on 2026-10-07 unless marked otherwise; they change often, so re-check before relying on them.

## Goal

Generate UI/UX assets (hero images, illustrations, empty states, textures) directly from Claude Code, without paying per image, and without the generic "AI slop" look.

## 1. What already existed

**Anti-slop design skills** (art direction, no image generation of their own):

| Repo | What it does |
|---|---|
| [Leonxlnx/taste-skill](https://github.com/leonxlnx/taste-skill) | Anti-slop frontend skills (`design-taste-frontend`, `redesign-existing-projects`, ...). Its `imagegen-*` skills only write art direction; they need an image tool. |
| [pbakaus/impeccable](https://github.com/pbakaus/impeccable) | Design commands (`audit`, `polish`, `critique`, ...) and deterministic AI-pattern detectors (`npx impeccable detect`). |

**Image generation for Claude Code**: plenty of MCP servers/skills ([awesome-ai-image-skills](https://github.com/zhuyansen/awesome-ai-image-skills) lists 150+). [guinacio/claude-image-gen](https://github.com/guinacio/claude-image-gen) stood out: MIT, TypeScript, skill + CLI + MCP in one plugin, saves to disk, reference images, clean provider routing. Its only providers (Gemini, OpenAI) have no free tier, which is what this fork changes.

## 2. Free-tier reality check

| Provider | Free via API? | Cheapest paid option |
|---|---|---|
| Google Gemini (Nano Banana family) | **No.** Every image model is listed "Free Tier: Not available". The Google Cloud $300 trial credit cannot be used for the Gemini Developer API. | Gemini 2.5 Flash Image $0.039/image; Nano Banana 2 $0.067 (1K); Nano Banana Pro $0.134 (1K/2K) |
| OpenAI GPT Image 2.5 (Flare / Sunburst) | **No.** | Token-priced; third-party estimates for 1024×1024 output only: low ~$0.006, medium ~$0.013, high ~$0.053, xhigh ~$0.094, max ~$0.21. Flare and Sunburst cost the same per token; Sunburst is slower and more precise. |
| **Cloudflare Workers AI** | **Yes: 10,000 neurons/day** on the free Workers plan, resets 00:00 UTC | $0.011 per 1,000 neurons above the allocation (Workers Paid) |
| Pollinations.ai | Yes, keyless but throttled (and possibly watermarked) unless you register | n/a |
| Local models (Qwen-Image, Z-Image Turbo, FLUX.2 klein) | Free and unlimited, Apache 2.0 | Needs a real GPU. Not viable on the test laptop (Radeon 780M iGPU, 16 GB RAM). |

Conclusion: Cloudflare Workers AI is the only realistic free API, so it became the default provider.

## 3. Cloudflare Workers AI image models

Endpoint: `POST https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/run/{model}` with `Authorization: Bearer {TOKEN}`. Responses carry the image as base64 in `result.image`.

| Model | Request format | Size | References | Neuron cost (official) | ≈ free images/day at 1024×1024 |
|---|---|---|---|---|---|
| `@cf/black-forest-labs/flux-2-klein-4b` | **multipart/form-data** (even for a bare prompt) | `width`/`height` 256-1920 | up to 4 (`input_image_0..3`), each **smaller than 512×512** | 5.37/input tile + 26.05/output 512² tile | ~95 |
| `@cf/black-forest-labs/flux-2-klein-9b` | multipart | 256-1920 | up to 4 | 1363.64 first MP + 181.82 per extra MP | ~7 |
| `@cf/black-forest-labs/flux-2-dev` | multipart | | up to 4 | 18.75/input tile/step + 37.5/output tile/step | very few (not wired in) |
| `@cf/black-forest-labs/flux-1-schnell` | JSON `{prompt, steps≤8}`, `additionalProperties: false` (sending a size is a 400) | fixed square | none | 4.8/tile + 9.6/step | ~170 |
| `@cf/leonardo/lucid-origin` | JSON, `width`/`height` ≤2500 | | none | 636/tile + 12/step | ~3 |
| `@cf/leonardo/phoenix-1.0` | JSON, `width`/`height` ≤2048, `negative_prompt` | | none | 530/tile + 10/step | ~4 |

Daily counts are estimates from the per-tile prices; real cost depends on size and steps.

Not available: Cloudflare's OpenAI-compatible endpoints cover chat, embeddings and responses only, **not** `/v1/images/generations`, so generic "OpenAI-compatible image" MCP servers cannot point at Cloudflare directly. Transparent backgrounds and masks are not supported by any of these models.

## 4. Existing Cloudflare MCP servers (evaluated, not used)

| Repo | Why not |
|---|---|
| [kostety0/mcp-cf-image](https://github.com/kostety0/mcp-cf-image) | Closest fit (Node, saves to disk) but **PolyForm Noncommercial** license; FLUX.1/SDXL only; brand new |
| [puspoaditya/cloudflare-workers-ai-mcp](https://github.com/puspoaditya/cloudflare-workers-ai-mcp) | Returns base64 instead of saving a file (expensive in context tokens); FLUX.1 only |
| [lordmannu993/cloudflare-image-mcp](https://github.com/lordmannu993/cloudflare-image-mcp) | Requires deploying your own Worker + R2; images are expiring URLs |
| [bytefer/mcp-flux-schnell](https://github.com/bytefer/mcp-flux-schnell) | Needs your own Worker endpoint |

Adding a provider to guinacio/claude-image-gen was less work and kept its skill, CLI, file saving and tests.

## 5. Live test results (2026-10-07)

| Asset | Model | Size | Result | Time |
|---|---|---|---|---|
| Hero, regional government service counter | klein-4b | 1280×720 | Good: real-looking photo, palette respected, empty third for headline | ~20 s |
| Section image with the hero as reference | klein-4b | 1152×864 | Style matched; **composition copied too** (see findings) | ~11 s |
| Paper texture | flux-1-schnell | 1024×1024 (16:9 requested, warned) | Usable low-contrast texture | ~4 s |
| Empty state: enamel dish on linen | klein-4b | 1024×1024 | Very good, on palette | ~33 s |
| Onboarding: terracotta *celengan ayam* | klein-9b | 864×1152 | First call failed with a transient API error; retry fine and excellent | ~4 s |

Roughly 10 images used well under 30% of one day's free allocation.

## 6. Findings and gotchas

- **klein reference images carry composition, not just style.** Asking for a close-up "in the style of image 0" returned nearly the same room re-dressed. For assets with a different framing, reuse a written style block instead of a reference image; use references when you want the same scene or subject.
- **FLUX has no negative prompt.** "No text, no gradient" tends to add them. Describe what is in the frame ("plain matte grey-green wall").
- **Concrete art direction is what removes the slop**: real objects and materials, light direction, lens, hex palette from the project's design tokens, framing for the UI slot. Local subjects (e.g. a clay *celengan ayam* piggy bank) read as designed rather than generated.
- **Small in-image text is gibberish** (receipts, signs). Keep text out of images; overlay real HTML text.
- **Output is JPEG** even when `.png` is requested; the storage layer fixes the extension.
- **Occasional transient errors** on klein-9b: one retry is enough. Quota exhaustion is a separate, stable error code (`CLOUDFLARE_QUOTA_EXCEEDED`).

### Credential setup pitfalls

- Easiest path: Cloudflare dashboard → **AI → Workers AI → Use REST API** → *Create a Workers AI API Token*. The same page shows the Account ID.
- A token can be valid (`GET /client/v4/user/tokens/verify` → `active`) and still fail with 401/403 if it has no Workers AI permission on that account (`GET /client/v4/accounts` lists 0 accounts). Account ID and Zone ID are both 32 hex characters; make sure you copied the Account ID.

### Windows notes

- `setx NAME "value"` writes a **user** environment variable (registry, not a folder). Only processes started afterwards see it.
- The Claude desktop app keeps running in the system tray. Closing the window is not enough: **quit it from the tray** and reopen, or the plugin's MCP server starts without the variables and fails to connect.
- Opening this repo itself as a Claude Code project also loads the root `.mcp.json` as a project server, which fails there because `${CLAUDE_PLUGIN_ROOT}` is only defined for installed plugins. Harmless.
- `tests/pack-freshness.test.mjs` fails on a Windows checkout with `core.autocrlf=true` (the packed `.mcpb` bundle hashes LF files); it failed before any change in this fork.

## Sources

- [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing), [Google Cloud free trial](https://docs.cloud.google.com/free)
- [GPT-Image-2.5 Sunburst (OpenAI docs)](https://developers.openai.com/api/docs/models/gpt-image-2.5-sunburst.md), [per-image estimates (CometAPI)](https://www.cometapi.com/gpt-image-2-5-price-api-cost-per-image/)
- [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/), [OpenAI compatibility](https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/), [REST API get started](https://developers.cloudflare.com/workers-ai/get-started/rest-api/)
- [FLUX.2 klein 4B](https://developers.cloudflare.com/changelog/2026-01-15-flux-2-klein-4b-workers-ai), [FLUX.2 klein 9B](https://developers.cloudflare.com/changelog/2026-01-28-flux-2-klein-9b-workers-ai/), [flux-1-schnell](https://developers.cloudflare.com/workers-ai/models/flux-1-schnell/)
- [Find account and zone IDs](https://developers.cloudflare.com/fundamentals/account/find-account-and-zone-ids/)
- [Best open-source image models 2026](https://www.thundercompute.com/blog/best-open-source-image-generation-models)
