# DESIGN.md — Dropnode visual design system

The design contract for everything users see. The editor is **dark-only**:
`index.html` ships `<html class="dark">`, there is no theme toggle, and the
light-theme CSS variable block in `src/styles.scss` is inert spartan/shadcn
default config — never style against it. (The *Export Theme* "light" value is
a different concept: a PNG-only appearance, see [Export themes](#export-themes).)

> **2026-08 redesign — "grey-dark" with luminous Nodes (updated from blurple-dark).** The previous
> refined-dark identity was replaced on explicit user direction with a
> Discord-derived world, now with a neutral **grey** accent — layered slate surfaces, one **grey** accent —
> while the Nodes kept their **off-white paper with near-black ink**
> (user-mandated). This file is the contract for that world. See the flag
> log at the bottom for what changed and what was deliberately kept.

## Identity

Dropnode's look is the **grey-dark layered canvas**: Discord's surface
hierarchy, tuned for a graph editor —

- **Surfaces layer like Discord.** The Canvas is the "chat" surface
  (`#313338` with a 26px dot grid); the Sidebar is the "channel list"
  (`#2b2d31`); menus and popovers drop to `#111214`; hover/input chips sit at
  `#383a40`. Boundaries come from color, not borders — Discord's signature.
- **Nodes are off-white paper with near-black ink** (`#f0f0f5` surface,
  `#1a1a2e` text — user-mandated), so the graph glows bright on the slate
  canvas. Groups render beneath Connections and regular Nodes (ADR-0008)
  so children stay visible without needing translucent fills.
- **One grey** (`#6B7280`) is the accent for everything interactive:
  default Connection stroke, Handles, Resize Grips, the text caret, chrome
  buttons, focus rings. Chrome (`--primary`) and canvas (`--dn-accent`) are
  the same literal value by design.
- **One white** (`#ffffff`) means magnetic feedback: a Handle snapping a
  connection drag, an Alignment Guide lighting up mid-drag.
- **One yellow** (`#f0b232`) is the Text highlight mark.
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
| `--dn-canvas` | `#313338` | Canvas backdrop (Discord chat surface) |
| `--dn-canvas-dot` | `rgba(255, 255, 255, 0.04)` | Canvas grid dots (26px pitch) |
| `--dn-paper` | `#f0f0f5` | Default Node surface — off-white (user-mandated) |
| `--dn-ink` | `#1a1a2e` | Node Text, Group Label ink — near-black (user-mandated) |
| `--dn-node-edge` | `rgba(0, 0, 0, 0.3)` | Node surface border |
| `--dn-group-edge` | `rgba(255, 255, 255, 0.1)` | Dashed Group border |
| `--dn-group-strip` | `rgba(0, 0, 0, 0.25)` | Group Label strip fill |
| `--dn-chip` | `#2b2d31` | Floating chips: Connection Text cards, Pin popover, Formatting Toolbar |
| `--dn-chip-ink` | `#ffffff` | Ink on chips and canvas overlays (Step counter, Minimap strokes, default selection glow) |
| `--dn-chip-input` | `#1e1f22` | Input field inside a chip (link input) |
| `--dn-accent` | `#6B7280` | The grey — default Connection stroke, Handles, Grips, caret, chrome `--primary` |
| `--dn-accent-ink` | `#ffffff` | Ink on accent fills |
| `--dn-danger` | `#ffffff` | Handle snap highlight, Alignment Guide |
| `--dn-highlight` | `#f0b232` | Text highlight mark (`mark` / `.tv-highlight`) |
| `--dn-sel-edge` | `#949ba4` | 1px edge ring under the selection glow |

Derived translucency is composed, never duplicated: use
`color-mix(in srgb, var(--dn-accent) 45%, transparent)` rather than
re-hardcoding an `rgba()` of the same hue (see Marquee fill, chip borders,
Formatting Toolbar hovers, Minimap glass).

Chrome (Sidebar, Toolbar, dialogs, Command Palette, toasts, chips) is themed
through the spartan/shadcn semantic variables defined in `src/styles.scss`.
Since the 2026-08 sidebar consolidation, **all chrome shares the Sidebar's
design system** (user-mandated): every surface — cards, menus, popovers,
hover chips — is the Sidebar slate `#2b2d31` (`--card`, `--popover`,
`--muted`, `--accent`, `--secondary`), hovers lift to `#35373c`, and **all
ink is pure white** (`--foreground`, `--card-foreground`,
`--popover-foreground`, `--muted-foreground`, `--accent-foreground`,
`--sidebar-foreground` all literal `#ffffff`), resting or hovered. The one
exception is `--background` `#313338` (the canvas slate): it only shows on
input wells and the rename fields, so fields read as lighter wells against
the darker surfaces. Hairline `--border`/`--input` stay white 6%.
`--primary`/`--ring`/`--sidebar-primary`/`--sidebar-ring` are literal
`#6B7280` so chrome and canvas can never drift apart (asserted by the sync
spec). Floating canvas chips (`--dn-chip` `#2b2d31`) take the same pure
white ink (`--dn-chip-ink` `#ffffff`). Semantic Tailwind colors in chrome:
success = `text-emerald-400`, error = `text-destructive`, info =
`text-primary`.

## The Palette

The single fixed set of eight curated colors a user may apply to a Node's
background or a Connection's curve (`NODE_PALETTE`, order is canonical and
matches the toolbar swatch row and the Command Palette names):

| Name | Value |
| --- | --- |
| PastelBlue | `#B3EBF2` |
| PastelRed | `#FF746C` |
| LightGray | `#D3D3D3` |
| Beige | `#EDE8D0` |
| Emerald | `#50C878` |
| Lavender | `#D3D3FF` |
| Pink | `#F2A3E8` |
| LightOrange | `#FFDBBB` |

An element without an applied Palette color shows its default appearance
(Node: `--dn-paper`; Connection: `--dn-accent`). Applied colors are stored in
Graph State — changing the palette array changes rendering of *new* choices
only and must never re-map stored hexes (ADR-0006). The Minimap's selection
highlight is PastelBlue (`DN_TOKENS.minimapAccent`). A selected element's glow
(`--selection-glow`) is its own solid color identity, so Palette colors
double as feedback; an uncolored Node's default glow is `--dn-paper`.

## Export themes

`EXPORT_THEMES` in `src/app/models/export-image.ts` — render-time only, never
stored (ADR-0014). **Dark** composes from `DN_TOKENS` and must keep mirroring
the on-screen editor (slate Canvas, off-white Nodes, dark Connection Text
chips). **Light** has been fully independent since the 2026-08 redesign (the
on-screen defaults are dark-on-dark chrome, so "flip the dark-only defaults"
no longer yields a legible light image): its own literals — white
background, `#f2f3f5` cards, `#1e1f22` ink, dark Group border — with no
on-screen token counterparts. Palette-applied colors pass through untouched
in both.

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
| `--dn-shadow-node-hover` | `0 6px 20px rgba(107, 114, 128, 0.3)` | Node hover |
| `--dn-shadow-chip` | `0 6px 24px rgba(0, 0, 0, 0.45)` | Formatting Toolbar |
| `--dn-shadow-pop` | `0 8px 24px rgba(0, 0, 0, 0.5)` | Pin popover |
| `--dn-shadow-pin` | `0 2px 8px rgba(0, 0, 0, 0.45)` | Pin bubble |

Selection is a glow, not a shadow: `0 0 6px 2px var(--selection-glow)` over
a 1px `--dn-sel-edge` ring — the glow uses the element's own color identity
(`node.color`, or `--dn-paper` for uncolored Nodes).

## Radius, spacing, sizing

- Node surface radius **10px** (pill → `9999px`, ellipse → `50%`, diamond →
  clip-path). Connection Text cards 10px. Chrome `--radius` is **8px**
  (Discord's panel radius); small controls 6px, chips 8px, Marks 2px,
  full-round pills for Handles/Pins/Step counter.
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
scale/brightness only — except **Chain Highlight** (ADR-0029): the traveling light
loops with a fixed **1.2s linear** duration (`animation: chain-travel 1.2s linear infinite`,
`stroke-dasharray` overlay, `pathLength="100"` normalized). The `prefers-reduced-motion`
block collapses it to a static highlight automatically.

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

## Flag log

### 2026-08 redesign — refined-dark → blurple-dark (Discord-derived)

Replaced on explicit user direction ("similar to Discord design"). The
changed values are the ones that appear in the tables above; highlights:

- Accent `#7c5cff` → `#5865F2` (Discord blurple) across canvas and chrome
  (`--dn-accent`, `--primary`, `--ring`, `--sidebar-primary`,
  `--dn-shadow-node-hover` tint).
- Canvas `#0e0e11` → `#313338` (Discord chat surface), dots to white 4%.
- Chrome semantic surfaces remapped to Discord's layer stack (sidebar
  `#2b2d31`, menus `#111214`, hover `#383a40`, muted text `#949ba4`, hairline
  white 6% borders).
- Danger `#ff6b6b` → `#f23f43`; highlight `#ffe066` → `#f0b232`;
  `--dn-sel-edge` → `#949ba4`; `--radius` → 8px.
- Export light theme became fully independent (white bg, `#f2f3f5` cards,
  `#1e1f22` ink) since "flip the dark-only defaults" no longer applies.

### 2026-08 correction — Nodes stay luminous (user-mandated)

A first pass made the Nodes dark chips (`#383a40` surface, `#dbdee1` ink) to
match Discord's all-dark world; the user explicitly overrode it: **default
Node background must be off-white and default Node text near-black**. Nodes
are `--dn-paper` `#f0f0f5` with `--dn-ink` `#1a1a2e` — the pre-redesign
luminous material, now glowing on the Discord slate Canvas. Knock-on effects:

- Group Label ink stays `--dn-ink` (dark ink reads correctly on the
  light-translucent Group fill and its darkened strip).
- The default selection-glow fallback stays `--dn-paper`.
- Minimap Node/Group glyphs derive from `--dn-paper` again; hairlines and
  the Viewport outline derive from `--dn-chip-ink`.
- `--dn-node-edge` is `rgba(0, 0, 0, 0.3)` so the bright cards stay crisply
  separated on the lighter Canvas.

### 2026-08 correction — Sidebar ink is pure white (user-mandated)

In the blurple-dark pass the Sidebar text was Discord's near-white
`#dbdee1` and its labels/icons used the global muted gray `#949ba4`. The
user explicitly overrode it: **Sidebar text must be white and hover-revealed
icons white too**. `--sidebar-foreground` and `--sidebar-accent-foreground`
are now literal `#ffffff`; every `text-muted-foreground` in the Sidebar
body (the Collections label, row chevrons/actions, file icons, "No
projects", the version badge, and the footer line) now uses
`text-sidebar-foreground`; and a scoped `aside button:hover` rule keeps
ghost-variant icons white through their own hover instead of dropping to
`--foreground`. Deliberately untouched: `--muted-foreground` stays `#949ba4`
for dropdown menus and dialogs, which keep their gray secondary hierarchy.

### 2026-08 correction — Toolbar joins the Sidebar surface (user-mandated)

The Toolbar originally kept the canvas surface (`bg-card` `#313338`) with
near-white inherited text and muted gray readouts. The user overrode it:
**Toolbar text and icons must be white, and its background must match the
Sidebar's**. The Toolbar row is now `bg-sidebar` (`#2b2d31`) with
`text-sidebar-foreground` (pure white), the node-count and zoom readouts
switched from `text-muted-foreground`, the Commands kbd keycap inks
`--sidebar-foreground`, and a scoped `.toolbar-row button:hover` rule keeps
ghost/outline icons white through their own hover. The Toolbar now shares
the Sidebar's tokens, so the two can never drift apart.

### 2026-08 consolidation — all chrome adopts the Sidebar system (user-mandated)

The user extended the Sidebar design to every remaining chrome surface:
"for the entire components except sidebar, toolbar and canvas-container,
apply the same design system in the sidebar." The chrome tokens collapsed
from Discord's multi-layer stack to one surface + one ink:

- `--card`/`--popover` `#313338`/`#111214` → `#2b2d31` (the Sidebar slate);
  `--muted`/`--accent`/`--secondary` `#383a40`/`#3f4148` → `#35373c` (the
  Sidebar hover), so dialogs, dropdown menus, the Command Palette, and
  toasts read as Sidebar surfaces.
- All ink → pure white: `--foreground` `#dbdee1` → `#ffffff`,
  `--muted-foreground` `#949ba4` → `#ffffff` (and the card/popover/…
  -foreground mirrors), so there is no gray secondary text left in chrome.
- `--background` deliberately stays `#313338` — the only lighter surface —
  so input wells and rename fields read as lighter wells against the darker
  cards.
- Floating canvas chips keep `--dn-chip` `#2b2d31` and their ink goes pure
  white (`--dn-chip-ink` `#dbdee1` → `#ffffff`), so Connection Text cards,
  the Pin popover, the Formatting Toolbar, the Step counter, and the Minimap
  strokes match the chrome.
- Excluded by the user: the Sidebar and Toolbar (already consolidated) and
  the canvas-container, which keeps its own `--dn-canvas` `#313338` dot-grid
  world with off-white Nodes.

Deliberate non-fixes: `NODE_PALETTE` hexes, the light-export literals, and
the semantic colors (`--dn-danger`, `--dn-highlight`) stay as
data; the accent (`--dn-accent`) was blurple and is now grey (see grey update below).

### 2026-08 polish — segmented pills in the Import/Export dialogs

In the consolidated chrome, the segmented controls (Export format/theme,
Import source tabs) rendered their active pill with `variant="secondary"`
— `--secondary` `#35373c` on a `--muted` `#35373c` track, so the active
pill was invisible. User direction: **give the active buttons a background
and replace the gray hover mix
(`color-mix(in oklch, var(--secondary), var(--foreground) 5%)`) with a
polish color.** The pills now use a shared `.export-seg` style in both
dialogs: the active pill is a solid grey fill (`var(--primary)`,
white ink), any pill's hover tints 15% toward the grey, and the active
pill's hover stays solid grey.

### 2026-08 de-slop — Command Palette joins the Sidebar system

User direction: "apply the same design system in the sidebar for the
hlm-dialog-content commands palette. remove any additional UI style slop."
The palette dropped every decorative layer: the grey-tinted shell (previously blurple-tinted, `color-mix(card 96%, primary 4%)`) is now flat `var(--card)`, the tinted
header and content borders are plain `--border` hairlines, the decorative
command-mark chip is gone, the active item lost its tinted border and 3px
inset accent bar (now a flat `--muted` highlight, matching Sidebar rows),
and the kbd chips and focus ring are flat (`--ring`). Result: a Sidebar-
surface panel with pure white ink and no color-mix tinting anywhere.

Deliberate non-fixes: `NODE_PALETTE` hexes and the light-export literals stay
as data (see [Token sources](#token-sources)); radii and density beyond
`--radius` keep their pre-redesign values (a later pass may tighten them).

### 2026-08 Chain Highlight — traveling light is the first loop (ADR-0029)

User request: hover-triggered **Chain Highlight** reveals the weakly-connected component.
Amended Motion contract to allow the overlay's loop (`1.2s linear infinite` via
`chain-travel` keyframes, `pathLength="100"` normalized dash). Added token
`--dn-dim-opacity: 0.25` for non-chain dimming. `prefers-reduced-motion` already
collapses the loop to static (glow + dim remain). No new colors, no new z-token —
lit Nodes reuse `--dn-z-selected` (Groups excluded per ADR-0008).

### 2026-08 grey accent — blurple → neutral grey (user-mandated)

User direction: "Change the primary color #5865F2 with grey color for the whole application."
The single accent was swapped from Discord blurple `#5865F2` to neutral grey `#6B7280` (Tailwind gray-500, 4.83:1 vs white, WCAG AA):

- Canvas `--dn-accent` `#5865F2` → `#6B7280` (default Connection stroke, Handles, Grips, caret)
- Chrome `--primary`, `--ring`, `--sidebar-primary`, `--sidebar-ring` → `#6B7280` (unified, asserted by `design-tokens.spec.ts`)
- TS mirror `DN_TOKENS.accent` → `#6B7280`
- Elevation `--dn-shadow-node-hover` `rgba(88, 101, 242, 0.3)` → `rgba(107, 114, 128, 0.3)` (grey tint)
- Docs updated: Identity, Color tokens table, Elevation table, chrome unification paragraph.
- Previous polish pills now grey fills/tints (were blurple).
- All derived translucency (`color-mix(... var(--dn-accent) ...)`) automatically follows; no other literals.
- To revert or tweak grey, edit the 5 variables + `DN_TOKENS.accent` + shadow tint together.
