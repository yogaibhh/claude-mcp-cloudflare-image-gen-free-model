# Prompt Crafting Reference (anti-slop)

Specific beats pretty. Every vague adjective ("modern", "clean", "professional", "premium", "sleek") is an invitation for the model's average output. Replace it with something you could photograph or paint.

## Replace vague words with concrete ones

| Instead of | Write |
|---|---|
| modern, clean | "matte white powder-coated steel, one hairline seam" |
| professional | "shot on a 50mm lens at f/4, soft north-facing window light" |
| premium, luxurious | "brushed brass, walnut veneer with visible grain, wool felt" |
| vibrant colours | the hex values from the design tokens: "#0F5132 and #F4C430" |
| futuristic | the actual object and era: "1970s Braun-style radio dial" |
| friendly illustration | "gouache on cold-press paper, visible brush strokes, two colours" |
| dynamic | "diagonal composition, subject entering frame from lower left" |

## Mediums that read as made by a person

- **Photography**: name lens, aperture, light source and direction, film stock or "digital, neutral grade".
- **Risograph / screen print**: 2–3 spot colours, paper grain, slight misregistration.
- **Gouache / watercolour / ink**: paper type, visible brush or pen marks, unfinished edges.
- **Collage**: torn paper edges, halftone photo fragments, tape.
- **Linocut / woodcut**: carved line texture, one or two inks.
- **Technical drawing**: line weights, hatch shading, blueprint or graph paper.
- **Still life**: real objects arranged on a real surface, physical shadows.

Mediums that drift to slop unless tightly directed: "3D render", "isometric", "flat vector", "low-poly", "gradient mesh". If you use them, pin material, light and palette precisely.

## Light

| Term | Effect |
|---|---|
| Window light from the left | soft, natural, editorial |
| Raking light | reveals surface texture (paper, fabric, stone) |
| Overcast daylight | even, honest, low drama |
| Late-afternoon sun | warm, long shadows |
| Single hard spotlight | graphic, high contrast |
| Flash on-camera | candid, documentary |

Avoid by default: neon, rim-light glow, volumetric god rays, lens flare.

## Composition for UI slots

- **Hero (16:9)**: leave a clear third for the headline; state which side: "empty space on the right third".
- **Section image (4:3 / 3:2)**: one subject, one idea; crop tighter than you think.
- **Card thumbnail (1:1)**: subject fills 60–70% of frame, simple backdrop.
- **Background texture**: "very low contrast", "no focal point", "tileable feel" so text stays readable.
- **Empty state**: small subject, lots of negative space, calm.

## Palette

Always pull hex values from the project (CSS variables, Tailwind theme, DESIGN.md) and name them in the prompt with their role: "background oat #E8E0D0, ink #1F2A44, accent rust #B5502C (used sparingly)". One accent colour, used sparingly, looks more designed than five.

## Industry starting points (adapt, don't paste)

### SaaS / B2B tools
```
Overhead photograph of the physical work the product replaces (paper forms, ledgers,
sticky notes, a tangle of cables), natural window light, 35mm, muted palette from the
brand tokens, empty third for headline.
```

### Government / public service
```
Documentary photograph of a real local place the service touches (a neighbourhood
office counter, a market street, a village road) in overcast daylight, eye-level,
no posed people, palette leaning on the brand's primary colour.
```

### Healthcare
```
Still life of everyday care objects (a folded cotton blanket, a glass of water,
reading glasses on a book) on a linen surface, soft morning light, warm neutral palette.
```

### Finance
```
Macro photograph of tactile materials associated with trust (embossed paper,
engraved metal, a fountain pen nib), raking light, deep green #0F3D2E and cream.
```

### Food / hospitality
```
Top-down photograph of the actual dish on a worn ceramic plate, crumbs and a used fork
in frame, daylight from the side, natural colours, slight imperfection.
```

## Consistency across a set

1. Write the style block once (medium, palette hex, light, texture, framing).
2. Paste it verbatim at the start of every prompt in the set.
3. Generate the anchor image, approve it, then pass it as reference image 0:
   `"in the same style, palette and grain as image 0, show <new subject>"`.
4. Keep subject scale and camera height consistent between sibling images.

## Review checklist (look at every image before using it)

- Does it match the style block and palette?
- Any banned default sneaking in (gradient glow, floating shapes, generic people)?
- Warped hands, extra fingers, melted objects, impossible perspective?
- Gibberish text or fake logos? Regenerate or crop them out.
- Is the space reserved for headline/UI actually empty?
- Would a designer believe a human art-directed this?
