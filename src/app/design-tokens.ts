/**
 * TS mirror of the `--dn-*` design tokens defined in `src/styles.scss`.
 *
 * Only for consumers that need a resolved string: SVG marker/attribute
 * values (markers cannot read CSS variables), the Minimap's 2D context,
 * and the PNG Export themes (inline-style overrides on the serialized
 * snapshot). Styling belongs in CSS via `var(--dn-*)` — do not import
 * this module from a stylesheet-adjacent context just to repeat a value.
 *
 * `design-tokens.spec.ts` reads `src/styles.scss` and asserts this
 * mirror stays in sync; change both together, and update `DESIGN.md`.
 */
export const DN_TOKENS = {
  /** Canvas backdrop (--dn-canvas) — Discord chat surface */
  canvas: '#313338',
  /** Default Node surface (--dn-paper) — off-white */
  paper: '#f0f0f5',
  /** Node Text (--dn-ink) — near-black */
  ink: '#1a1a2e',
  /** The Dropnode grey (--dn-accent) */
  accent: '#6B7280',
  /** Ink on accent fills (--dn-accent-ink) */
  accentInk: '#ffffff',
  /** Snap highlight / Alignment Guide (--dn-danger) */
  danger: '#ffffff',
  /** Text highlight mark (--dn-highlight) */
  highlight: '#f0b232',
  /** Chip surface: Connection Text cards, Pin popover, Formatting Toolbar (--dn-chip) */
  chip: '#2b2d31',
  /** Ink on chips and overlays (--dn-chip-ink) */
  chipInk: '#ffffff',
  /** Dashed Group border (--dn-group-edge) */
  groupEdge: 'rgba(255, 255, 255, 0.1)',
  /** Group label (--dn-group-ink) */
  groupInk: '#ffffff',

  // Minimap tones (2D-context draws; flattened per ADR-0001's palette).
  // Nodes are off-white paper again, so node/group glyphs derive from
  // --dn-paper; hairline strokes and the Viewport outline use --dn-chip-ink.
  /** Minimap regular-Node fill (--dn-paper at 80%) */
  minimapNode: 'rgba(240, 240, 245, 0.8)',
  /** Minimap Group fill (--dn-paper at 25%) */
  minimapGroup: 'rgba(240, 240, 245, 0.25)',
  /** Minimap Connection stroke (--dn-chip-ink at 35%) */
  minimapConnection: 'rgba(219, 222, 225, 0.35)',
  /** Minimap Viewport outline (--dn-chip-ink at 90%) */
  minimapViewport: 'rgba(219, 222, 225, 0.9)',
  /** Minimap Selection highlight — the Palette's PastelBlue */
  minimapAccent: '#B3EBF2',
} as const;

export type DesignTokenName = keyof typeof DN_TOKENS;
