# DESIGN.md — Dropnode visual design system

The design contract for everything users see. The editor is **dark-only**:
`index.html` ships `<html class="dark">`, there is no theme toggle, and the
light-theme CSS variable block in `src/styles.scss` is inert spartan/shadcn
default config — never style against it. (The *Export Theme* "light" value is
a different concept: a PNG-only appearance, see [Export themes](#export-themes).)

## Identity

Dropnode's look is the **refined-dark canvas**: a near-black dotted Canvas
where light pastel Nodes are the bright material. The signature is contrast of
materials, not decoration —

- **Canvas** is deep, quiet space (`#0e0e11` with a 26px dot grid).
- **Nodes** are light paper surfaces (`#f0f0f5` default) with dark ink text —
  they glow against the Canvas by sheer luminance, not by borders or fills.
- **One purple** (`#7c5cff`) is the accent for everything interactive:
  default Connection stroke, Handles, Resize Grips, the text caret, chrome
  buttons, focus rings. Chrome (`--primary`) and canvas (`--dn-accent`) are
  the same literal value by design.
- **One red** (`#ff6b6b`) means magnetic feedback: a Handle snapping a
  connection drag, an Alignment Guide lighting up mid-drag.
- The **Palette** (below) is the only sanctioned color variety — user-applied,
  never decorative.

## Token sources

There are exactly three places a color may live, each with one job:

| Source | Consumed by | Sync guard |
| --- | --- | --- |
| `src/styles.scss` → `--dn-*` custom properties | All on-screen styling: component CSS strings via `var(--dn-*)`, Tailwind arbitrary values like `accent-(--dn-accent)` | `design-tokens.spec.ts` reads the file and asserts the mirror |
| `src/app/design-tokens.ts` → `DN_TOKENS` | Consumers needing a *resolved string*: SVG marker/attribute values, the Minimap's 2D context, Export themes, `DEFAULT_NODE_BACKGROUND` | same spec |
| `src/app/models/node.ts` → `NODE_PALETTE` | Domain data — the Palette is stored in Graph State and serialized; its hexes are product data, not theme | documented here only |

The PNG export pipeline (`ExportImageRenderer.collectCss`) inlines every
stylesheet rule into its snapshot, so `var(--dn-*)` references resolve inside
the export — CSS variables are export-safe. But inline-style theme overrides
need resolved strings, which is why `EXPORT_THEMES` composes from `DN_TOKENS`.

**Changing a value:** edit the `--dn-*` definition in `src/styles.scss` *and*
its `DN_TOKENS` mirror, update the tables below, and the sync spec keeps you
honest. Adding a token: give it a `--dn-` name, a one-line role comment in
both files, and a row here.

## Color tokens

| Token | Value | Role |
| --- | --- | --- |
| `--dn-canvas` | `#0e0e11` | Canvas backdrop |
| `--dn-canvas-dot` | `rgba(255, 255, 255, 0.05)` | Canvas grid dots (26px pitch) |
| `--dn-paper` | `#f0f0f5` | Default Node surface; Group Label ink |
| `--dn-ink` | `#1a1a2e` | Node Text on light surfaces |
| `--dn-node-edge` | `rgba(15, 15, 18, 0.15)` | Node surface border |
| `--dn-group-edge` | `rgba(255, 255, 255, 0.22)` | Dashed Group border |
| `--dn-group-strip` | `rgba(58, 58, 92, 0.35)` | Group Label strip fill |
| `--dn-chip` | `#1c1c22` | Floating chips: Connection Text cards, Pin popover, Formatting Toolbar |
| `--dn-chip-ink` | `#e8e8ee` | Ink on chips and canvas overlays (Step counter, Minimap strokes) |
| `--dn-chip-input` | `#121216` | Input field inside a chip (link input) |
| `--dn-accent` | `#7c5cff` | The purple — default Connection stroke, Handles, Grips, caret, chrome `--primary` |
| `--dn-accent-ink` | `#ffffff` | Ink on accent fills |
| `--dn-danger` | `#ff6b6b` | Handle snap highlight, Alignment Guide |
| `--dn-highlight` | `#ffe066` | Text highlight mark (`mark` / `.tv-highlight`) |
| `--dn-sel-edge` | `#808080` | 1px edge ring under the selection glow |

Derived translucency is composed, never duplicated: use
`color-mix(in srgb, var(--dn-accent) 45%, transparent)` rather than
re-hardcoding an `rgba()` of the same hue (see Marquee fill, chip borders,
Formatting Toolbar hovers, Minimap glass).

Chrome (Sidebar, Toolbar, dialogs, Command Palette, toasts) is themed through
the spartan/shadcn semantic variables (`--background`, `--primary`,
`--muted-foreground`, `--border`, …) defined in `src/styles.scss`. Those stay
in oklch except `--primary`/`--ring`/`--sidebar-primary`/`--sidebar-ring`,
which are literal `#7c5cff` so chrome and canvas can never drift apart
(asserted by the sync spec). Semantic tailwind colors in chrome:
success = `text-emerald-400`, error = `text-destructive`, info = `text-primary`.

## The Palette

The single fixed set of eight curated colors a user may apply to a Node's
background or a Connection's curve (`NODE_PALETTE`, order is canonical and
matches the toolbar swatch row and the Command Palette names):

| Name | Value |
| --- | --- |
| Rose | `#ff8fa3` |
| Peach | `#ffb37a` |
| Yellow | `#ffe08a` |
| Green | `#9fe0a3` |
| Cyan | `#86dced` |
| Periwinkle | `#9fb4ff` |
| Lavender | `#c3a3ff` |
| Pink | `#f2a3e8` |

An element without an applied Palette color shows its default appearance
(Node: `--dn-paper`; Connection: `--dn-accent`). Applied colors are stored in
Graph State — changing the palette array changes rendering of *new* choices
only and must never re-map stored hexes (ADR-0006). The Minimap's selection
highlight is Cyan (`DN_TOKENS.minimapAccent`). A selected element's glow
(`--selection-glow`) is its own solid color identity, so Palette colors
double as feedback.

## Export themes

`EXPORT_THEMES` in `src/app/models/export-image.ts` — render-time only, never
stored (ADR-0014). **Dark** composes from `DN_TOKENS` and must keep mirroring
the on-screen editor. **Light** is an export-only appearance: white background
(`#ffffff`) and a dark Group border (`rgba(15, 15, 18, 0.3)`) are the only two
color literals without an on-screen token counterpart; everything else
reuses `paper`/`ink`. Palette-applied colors pass through untouched in both.

## Layering (z-index ladder)

All stacking goes through `--dn-z-*` tokens — no raw z-index in components.
Overlay chrome above the app (CDK overlays, dialogs) lives in the 1000+ range
managed by Angular CDK; the Toast sits at `--dn-z-toast` (1000) alongside it.

| Token | Value | Layer |
| --- | --- | --- |
| `--dn-z-selected` | 5 | Selected Node card (lifts its glow above neighbours) |
| `--dn-z-handle` | 10 | Handles, Marquee |
| `--dn-z-grip` | 11 | Resize Grips (above Handles) |
| `--dn-z-overlay` | 20 | Alignment Guides, Minimap, Step counter |
| `--dn-z-pin` | 30 | Pin layer |
| `--dn-z-toast` | 1000 | Toasts |

## Elevation

Shadows are warm-black depth on the dark canvas; the hover lift tints toward
the accent. Diamond Nodes cast from the card via `drop-shadow` (clip-path
clips same-element shadows — see the node component comments).

| Token | Value | Used by |
| --- | --- | --- |
| `--dn-shadow-color` | `rgba(0, 0, 0, 0.45)` | Shadow black — the tone the elevation shadows and the diamond `drop-shadow` tint from |
| `--dn-shadow-node` | `0 2px 10px rgba(0, 0, 0, 0.45)` | Node resting |
| `--dn-shadow-node-hover` | `0 6px 20px rgba(124, 92, 255, 0.28)` | Node hover |
| `--dn-shadow-chip` | `0 6px 24px rgba(0, 0, 0, 0.45)` | Formatting Toolbar |
| `--dn-shadow-pop` | `0 8px 24px rgba(0, 0, 0, 0.5)` | Pin popover |
| `--dn-shadow-pin` | `0 2px 8px rgba(0, 0, 0, 0.45)` | Pin bubble |

Selection is a glow, not a shadow: `0 0 6px 2px var(--selection-glow)` over
a 1px `--dn-sel-edge` ring — the glow uses the element's own color identity
(`node.color` or `--dn-paper` fallback).

## Radius, spacing, sizing

- Node surface radius **10px** (pill → `9999px`, ellipse → `50%`, diamond →
  clip-path). Connection Text cards 10px. Small controls 6px, chips 8px,
  Marks 2px, full-round pills for Handles/Pins/Step counter.
- Text metrics are per-host via `--tv-size-s` / `--tv-size-l` (Node Text
  11/14/18px; Connection Text 10/12/15px, base 12px). Group Labels 12px/600.
  Canvas body text line-height 1.4.
- Repeating one-off metrics (28px Group Label strip, 12px Handle, 10px Grip,
  200×150 Minimap) are intentional sizes documented in their components, not
  tokens — they don't scale as a system.

## Motion

One duration everywhere: **0.15s ease** for state transitions (node shadow,
Handle grow, swatch scale, stroke growth). Exceptions: connection stroke
growth shares the 0.15s; Toast slide-in 0.3s ease; Present Mode has no motion
budget of its own. Nothing loops, nothing parallaxes; hover feedback is
scale/brightness only.

## Policy

1. **No new raw color literals in component styles or TS.** Reference
   `var(--dn-*)` in CSS, `DN_TOKENS` in TS, or a chrome semantic variable.
   A genuinely new color becomes a token first (with a DESIGN.md row).
2. **Derived translucency is composed** with `color-mix()` from a token, not
   re-hardcoded as `rgba()`.
3. **Stacking uses the z ladder.** A new layer needs a reason and a token.
4. **The Palette is data.** Never restyle it, never theme it, never reorder
   it casually — stored graphs depend on its hexes.
5. `design-tokens.spec.ts` is the tripwire: if it fails, the mirror broke.

## Flag log — 2026-08 polish pass

Hardcoded values found and fixed (each now resolves through the token layer):

- `#7c5cff` ×15 — canvas accent across 7 files (Handles, Grips, Marquee,
  Connection stroke/ghost/reroute/text-card borders, Pin bubble, caret,
  Formatting Toolbar, link input, export-dialog checkbox).
- `#0e0e11` ×3 — Canvas backdrop, Grip border, dark Export Theme.
- `#f0f0f5` ×5 — default Node surface (toolbar swatch, Node fallbacks,
  Export Themes, `DEFAULT_NODE_BACKGROUND`).
- `#1a1a2e` ×4 — Node Text ink (node, Export Themes).
- `#1c1c22` / `#e8e8ee` ×7 — chip surface/ink (Connection Text cards,
  Formatting Toolbar, Pin popover, link input, Step counter, Export Theme).
- `#ff6b6b` ×3 — snap highlight + Alignment Guide + dark Export parity.
- `#ffe066` ×2 — highlight mark (text-view, text-editor).
- `#86dced` + 4 Minimap rgba tones — Minimap 2D-context draws.
- `grey` (CSS keyword) ×3 — selection edge ring → `--dn-sel-edge` (#808080).
- Bare z-index values ×8 across 6 files → `--dn-z-*` ladder.
- **Chrome/canvas accent drift**: chrome `--primary` was
  `oklch(0.62 0.233 293.5)` ≈ `#925cff` while the canvas used `#7c5cff` —
  two purples. Unified on `#7c5cff` (the value baked into exports and docs).

Deliberate non-fixes: `NODE_PALETTE` hexes and the two light-Export-only
literals stay as data (see [Token sources](#token-sources)).
