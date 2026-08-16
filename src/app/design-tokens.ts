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
  /** Canvas backdrop (--dn-canvas) */
  canvas: '#0e0e11',
  /** Default Node surface / Group Label ink (--dn-paper) */
  paper: '#f0f0f5',
  /** Node Text on light surfaces (--dn-ink) */
  ink: '#1a1a2e',
  /** The Dropnode purple (--dn-accent) */
  accent: '#7c5cff',
  /** Ink on accent fills (--dn-accent-ink) */
  accentInk: '#ffffff',
  /** Snap highlight / Alignment Guide (--dn-danger) */
  danger: '#ff6b6b',
  /** Text highlight mark (--dn-highlight) */
  highlight: '#ffe066',
  /** Chip surface: Connection Text cards, Pin popover, Formatting Toolbar (--dn-chip) */
  chip: '#1c1c22',
  /** Ink on chips and overlays (--dn-chip-ink) */
  chipInk: '#e8e8ee',
  /** Dashed Group border (--dn-group-edge) */
  groupEdge: 'rgba(255, 255, 255, 0.22)',

  // Minimap tones (2D-context draws; flattened per ADR-0001's palette)
  /** Minimap regular-Node fill (--dn-paper at 80%) */
  minimapNode: 'rgba(240, 240, 245, 0.8)',
  /** Minimap Group fill (--dn-paper at 25%) */
  minimapGroup: 'rgba(240, 240, 245, 0.25)',
  /** Minimap Connection stroke (--dn-chip-ink at 35%) */
  minimapConnection: 'rgba(232, 232, 238, 0.35)',
  /** Minimap Viewport outline (--dn-chip-ink at 90%) */
  minimapViewport: 'rgba(232, 232, 238, 0.9)',
  /** Minimap Selection highlight — the Palette's Cyan */
  minimapAccent: '#86dced',
} as const;

export type DesignTokenName = keyof typeof DN_TOKENS;
