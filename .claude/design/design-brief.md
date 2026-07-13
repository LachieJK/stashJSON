# StashJSON Design Brief

This is the single source of truth for the product's look and feel. The
`ux-design-engineer` agent reads this file before doing any design work and
treats it as binding. Anything still marked `TBD` means the agent must
preserve the current design for that aspect rather than invent its own.

## Brand personality / tone

**Strong, bold, minimalist, simple.** Less is more — every element must earn
its place. Confidence comes from restraint: generous whitespace, stark
contrast, and decisive typography rather than decoration. Bold text/weights
are the primary emphasis tool — used deliberately and sparingly so they hit
hard when they appear. No gradients-for-the-sake-of-it, no clutter, no visual
noise. If in doubt, remove it.

The north star is **Vercel's site (vercel.com)**: simple, strong, bold.

## Typography

- **Core font: Geist Sans** (Vercel's font — https://vercel.com/font).
  Load self-hosted via `next/font/google` (`Geist`) or the `geist` npm
  package in `app/layout.tsx`, wired into the `@theme` font tokens. Never via
  external `<link>` tags.
- **Mono: Geist Mono** — the natural companion; use for JSON blobs, API keys,
  IDs, code, and anything data-shaped.
- Headings are heavy and tight: bold-to-black weights, tight tracking and
  leading, large sizes on marketing pages. Body text stays regular weight and
  highly readable. Emphasis = weight and size, not colour or italics.
- Keep the scale simple — a few decisive sizes, not a dozen near-identical ones.

## Colour palette

**Monochrome-first.** The product is a mix of pure-black pages with white
text and pure-white pages with black text — bold and simple. The vast
majority of every page is black, white, and gray. Colour is reserved for
small, functional "pop" elements — precisely *because* the base is
monochrome, these hit hard when they appear:

- semantic states (danger/success notices, destructive actions);
- badges/pills (e.g. the docs' HTTP-verb badges — GET/POST/PUT/PATCH/DELETE
  keep their distinct colours, greens/reds/ambers and all);
- terminal/code styling (prompt markers, syntax accents inside code blocks).

Colour never appears on page backgrounds, panels, headings, body copy,
navigation, or primary actions — only on these compact, data-shaped accents.

Tokens in `app/globals.css` `@theme` (dark = black page, light = white page):

| Token | Dark (black page) | Light (white page) | Notes |
|---|---|---|---|
| bg | `#000000` | `#ffffff` | pure black / pure white — no near-blacks for the page itself |
| panel | `#0a0a0a` | `#fafafa` | cards/surfaces: barely lifted off the page |
| panel-2 | `#111111` | `#f2f2f2` | inputs, nested surfaces |
| border | `#333333` | `#eaeaea` | hairline, subtle — borders separate, they don't decorate |
| text | `#ffffff` | `#000000` | full-contrast foreground |
| muted | `#a1a1a1` | `#666666` | subtext / secondary copy — off-white / gray, never pure |
| accent | `#ffffff` | `#000000` | **the accent is the inverse of the page**: white buttons on black pages, black buttons on white pages |
| accent-2 | `#cccccc` | `#333333` | hover/active shift of the accent — a subtle step, not a colour change |
| danger | `#ff4d4d` | `#e00000` | semantic colour — errors, destructive actions, DELETE |
| ok | `#4ade80` | `#0f9d58` | semantic colour — success, public badges, POST |

Further pop colours (e.g. an amber for PUT/PATCH verb badges, code syntax
accents) are permitted but must enter as named `@theme` tokens, stay confined
to badge/code-sized elements, and pass AA contrast in both modes.

- Primary buttons are the inverted block: white bg + black text on dark pages,
  black bg + white text on light pages (button text colour must flip with the
  accent — no hardcoded `text-white`).
- Highlights/accents on structural UI stay **subtle**: an inverted fill, an
  underline, a border — never a splash of colour. (Badges and code accents
  are the sanctioned exception, per above.)
- Hover/focus feedback is a small tonal shift or inversion, in the Vercel way.

### Colour modes & the theme toggle

- The page **defaults to the browser's `prefers-color-scheme`** (dark = black
  page, light = white page).
- A **floating circular toggle** sits fixed in the **bottom-right corner** of
  every page: hairline border, panel background, flat (no shadow), ≥44px hit
  target. It shows the Lucide **sun** icon in dark mode and **moon** in light
  mode (the icon names the mode you'll switch to).
- An explicit choice is applied as `data-theme="light" | "dark"` on `<html>`
  and persisted in `localStorage` (restored pre-paint by an inline script in
  `app/layout.tsx`). Toggling back to the system's own preference clears the
  override so the page resumes following the browser setting.
- Token overrides in `app/globals.css` must cover **both** paths — the
  `prefers-color-scheme` media query (gated on `:not([data-theme="dark"])`)
  and the `[data-theme]` attribute — and the two light-value blocks must be
  kept in sync.

## Iconography

- **Icon pack: Lucide** (lucide.dev, ISC licence) — stroke-based, minimalist,
  the natural companion to Geist. Use it for every icon in the product; never
  mix packs.
- Icons are **inlined as SVG** (no npm dependency): 24×24 viewBox,
  `stroke="currentColor"`, `stroke-width="2"`, round caps/joins, `fill="none"`,
  rendered at ~16–20px. They inherit text colour — no colour of their own
  (the badge/semantic exceptions above still apply).
- Icons are aids, not decoration: use one only where it clarifies an action or
  state, always with an accessible label (`aria-label` on the control,
  `aria-hidden` on the SVG).

## Shape, spacing & texture

- **Flat.** No drop shadows for depth — hairline borders and background tonal
  steps do that job. (A faint shadow is tolerable only on floating overlays
  like menus/dialogs.)
- Small, consistent radii (~6–8px on controls and cards); nothing pill-shaped
  except actual pills/badges.
- Generous whitespace; airy marketing pages, efficient but never cramped
  dashboard. Spacing on a consistent 4/8px rhythm.
- Motion: minimal and fast — subtle opacity/transform transitions (~150ms),
  nothing bouncy or attention-seeking. Honour `prefers-reduced-motion`.

## Reference sites / inspiration

- **vercel.com** — the primary reference for everything: navigation, hero
  typography, black/white inversion between sections, button treatment,
  hairline-bordered cards, docs layout, table/list density, empty states.
  When making any call this brief doesn't cover, ask: "what would Vercel do?"

## Hard rules

- **Monochrome base** — black, white, grays everywhere by default. Colour
  appears only in small functional pops: semantic states (danger/success),
  badges/pills (HTTP verbs included), and terminal/code accents. Never on
  backgrounds, panels, headings, body copy, or primary actions.
- Page backgrounds are **pure** `#000` / `#fff` — don't soften them.
- The accent/primary-action treatment is always the **inverse of the page**,
  and must remain subtle: bold through contrast, not colour.
- Subtext/secondary copy uses the muted gray tokens, never full-contrast text.
- Both modes (black page / white page) must always be styled and AA-contrast
  checked — muted grays especially.
- Bold type is an accent, not a default: if everything is bold, nothing is.
- Less is more: prefer removing an element over styling it.
