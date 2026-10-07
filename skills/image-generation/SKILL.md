---
name: image-generation
description: Generates bitmap assets for UI work (hero images, section illustrations, empty states, OG/social cards, backgrounds, textures) with art direction that avoids the generic "AI slop" look. Defaults to free Cloudflare Workers AI FLUX.2 models; Gemini and OpenAI are optional paid fallbacks. Use when a page or app genuinely needs an image asset, not for icons, logos, charts or UI screenshots.
---

# Image Generation (anti-slop)

Generate image assets for websites and apps, saved straight into the project.
The default provider is **Cloudflare Workers AI** on its free daily allocation, so every image spends a shared, limited budget: plan the asset list first, generate deliberately, and look at each result before making more.

## Use it for / don't use it for

| Use it for | Don't generate these, use the real thing |
|---|---|
| Hero and section imagery | **Icons**: use an SVG set (Lucide, Phosphor, Tabler) |
| Editorial illustrations, empty states, error pages | **Logos and wordmarks**: need vector, exact geometry |
| OG / social cards *without* text (add text in HTML/SVG) | **Text inside images**: FLUX misspells it; overlay real text instead |
| Background textures, materials, photographic details | **Charts, diagrams, UI mockups, screenshots**: build them in code |
| Product-style shots of physical objects | **Avatars of "real" people for testimonials**: that's fake social proof |

## Step 1: Art direction brief (before any generation)

1. **Read the project's design source**: `DESIGN.md`, `PRODUCT.md`, Tailwind config, CSS custom properties (`--color-*`), existing images in `public/`/`assets/`. Pull out the palette as **hex values**, the type personality, and the mood.
2. **Write a one-paragraph style block**: medium, palette (hex), light, texture, framing. You will paste this block **verbatim** into every prompt of the set so the assets belong together.
3. **List the assets you need** (slot, aspect ratio, file path) and show the list to the user before generating more than two or three.

If the project has no design source, ask the user for the mood and two or three reference sites, or propose a direction and confirm it first.

## Step 2: Write prompts that don't look AI-generated

Describe the scene the way a photographer or illustrator would brief it: **concrete subject, material, light, lens/medium, palette, framing**.

```
[medium + style block] [specific subject doing/being something specific] [setting with real materials]
[light source and direction] [camera/lens or illustration technique] [palette as hex] [framing for the slot]
```

**Banned defaults** (these are what make images read as AI slop):
- Purple-to-blue gradients, neon glow, "electric" accents, lens flares
- Floating abstract 3D shapes, glossy blobs, spheres and cubes "in space"
- Generic isometric people, faceless corporate-memphis characters
- "Diverse team smiling at a laptop", handshake, lightbulb, rocket, brain-with-circuits metaphors
- Holographic UI floating in the air, glowing dashboards, matrix code
- Everything perfectly centred and symmetrical, plastic-smooth skin, oversaturated HDR

**FLUX models have no negative prompt.** Writing "no text, no gradient" tends to *add* those things. Describe what *is* in the frame instead: "plain matte warm-grey backdrop" rather than "no gradient background".

### Bad → better

**Hero, B2B software**
- ✗ `Minimalist 3D illustration of abstract geometric shapes floating in space, gradient from deep purple to electric blue, subtle glow`
- ✓ `Overhead photograph of a cluttered wooden workbench: printed invoices held by a brass binder clip, a half-finished cup of black coffee, a pencil with a chewed end. Late-afternoon window light from the left, long soft shadows. 35mm lens, shallow depth of field. Muted palette of oat #E8E0D0, ink navy #1F2A44 and one rust accent #B5502C. Wide frame with empty space on the right third for headline text.`

**Empty state, task app**
- ✗ `Cute flat illustration of a person relaxing, pastel colors, clean`
- ✓ `Risograph-style illustration, two-colour print in teal #2F6F6A and coral #E86A50 on off-white paper with visible grain and slight misregistration. A single empty wire in-tray on a desk, one paper clip beside it. Generous negative space, centred-left, small scale in frame.`

**Section background texture**
- ✓ `Macro photograph of handmade cotton paper, deckled edge entering from the bottom, raking light revealing fibres, colour #F3EEE6, very low contrast so text stays readable on top.`

## Step 3: Generate a set that stays consistent

1. Generate **one anchor asset** first (usually the hero) with `flux-2-klein-4b`.
2. **Look at it** (Read the saved file) and check: matches the brief? any slop tells, extra limbs, warped objects, garbage text? Fix the prompt rather than re-rolling the same prompt.
3. Once approved, pass it as `--reference-images` for every other asset in the set and say how to use it: `"in the same visual style, palette and grain as image 0, show ..."`. klein models take up to 4 references.
4. Use `flux-2-klein-9b` only for the final version of the one or two most visible assets.

## Models and free daily budget (Cloudflare Workers AI, 10,000 neurons/day, resets 00:00 UTC)

| Model | ≈ images/day free (1MP) | Sizes | References | Use for |
|---|---|---|---|---|
| `@cf/black-forest-labs/flux-2-klein-4b` **(default)** | ~95 | all aspect ratios | up to 4 | drafts and most assets |
| `@cf/black-forest-labs/flux-2-klein-9b` | ~7 | all aspect ratios | up to 4 | final hero / key visuals |
| `@cf/black-forest-labs/flux-1-schnell` | ~170 | square only | none | quick throwaway tests |
| `@cf/leonardo/lucid-origin` | ~3 | all aspect ratios | none | photographic alternative |
| `@cf/leonardo/phoenix-1.0` | ~4 | all aspect ratios | none | alternative illustration look |

Sizes are ~1 megapixel (16:9 → 1280×720, 1:1 → 1024×1024). Paid fallbacks: any `gpt-image*` model (needs `OPENAI_API_KEY`) or Gemini models (needs `GEMINI_API_KEY`); use them only when the user asks or needs transparent backgrounds or reliable in-image text.

## Running it

Prefer the MCP tool `create_asset` from the `media-pipeline` server when it is available. Otherwise use the bundled CLI:

```bash
node "${CLAUDE_PLUGIN_ROOT}/mcp-server/build/cli.bundle.js" \
  --prompt "<prompt with the style block>" \
  --aspect-ratio "16:9" \
  --output-dir "./public/images" \
  --output "hero-workbench.png"
```

| Flag | Default | Notes |
|---|---|---|
| `--prompt, -p` | required | |
| `--aspect-ratio, -a` | 1:1 | 16:9 hero/header · 4:3 or 3:2 sections · 1:1 cards · 9:16 mobile · 1200×630 OG → use 16:9 and crop |
| `--model, -m` | `CLOUDFLARE_DEFAULT_MODEL` | see table above |
| `--reference-images, -r` | – | Cloudflare klein: max 4, PNG/JPEG, auto-scaled to fit 500×500 |
| `--output-dir, -d` / `--output, -o` | cwd / generated name | use descriptive kebab-case file names |
| `--background`, `--mask`, `--output-format` | – | OpenAI only; Cloudflare rejects transparent backgrounds and masks |

The CLI prints JSON: `{"success": true, "filePath": "...", "warnings": [...]}` or `{"success": false, "errorCode": "...", "error": "..."}`.

| errorCode | What to do |
|---|---|
| `CLOUDFLARE_QUOTA_EXCEEDED` | Stop generating. Tell the user the free budget resets at 00:00 UTC; don't retry in a loop. |
| `CLOUDFLARE_AUTH_ERROR` | `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN` are wrong or the token lacks Workers AI permission. |
| `OPTION_UNSUPPORTED_BY_MODEL` | Drop the option, or ask the user before switching to a paid provider. |
| `TOO_MANY_REFERENCE_IMAGES` | Use a klein model, or fewer references. |

## Step 4: Integrate properly

- Save into the project's real asset folder (`public/images/`, `src/assets/`), not the repo root.
- Write meaningful `alt` text describing the image's role, and set `width`/`height` to avoid layout shift.
- Put headline text in HTML over the image, never baked into it.
- Tell the user which assets were generated and with which model, so they can regenerate or replace them later.

Pairs with the `design-taste-frontend` skill (layout, typography, motion); this skill covers imagery only. More prompt vocabulary: [references/prompt-crafting.md](references/prompt-crafting.md)
