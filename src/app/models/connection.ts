import { HandleSide } from './node';
import { Text } from './text';

// The three Arrowhead shapes a Connection endpoint may carry.
export type ArrowheadType = 'none' | 'arrow' | 'triangle';
export const ARROWHEAD_TYPES: readonly ArrowheadType[] = ['none', 'arrow', 'triangle'];

// Which endpoint of a Connection an Arrowhead sits on: 'start' = source, 'end' = target.
export type ArrowheadEnd = 'start' | 'end';

// Asymmetric defaults (ADR-0012): a Connection shows its source→target direction
// out of the box, so an absent start Arrowhead is 'none' but an absent end is 'arrow'.
export const DEFAULT_START_ARROWHEAD: ArrowheadType = 'none';
export const DEFAULT_END_ARROWHEAD: ArrowheadType = 'arrow';

// Stroke styling (ADR-0020): two independent dash-scheme and thickness presets.
// Absent means the default, which matches the pre-feature rendering exactly.
export type StrokePattern = 'solid' | 'dashed' | 'dotted';
export const STROKE_PATTERNS: readonly StrokePattern[] = ['solid', 'dashed', 'dotted'];
export const DEFAULT_STROKE_PATTERN: StrokePattern = 'solid';

export type StrokeWeight = 'thin' | 'normal' | 'thick';
export const STROKE_WEIGHTS: readonly StrokeWeight[] = ['thin', 'normal', 'thick'];
export const DEFAULT_STROKE_WEIGHT: StrokeWeight = 'normal';

// Route Style (ADR-0031): how a Connection's curve routes — the legacy cubic
// ('curve') or handle-constrained right-angle segments ('orthogonal') bending
// through Reroute Points as sharp corners. Absent means the default.
export type RouteStyle = 'curve' | 'orthogonal';
export const ROUTE_STYLES: readonly RouteStyle[] = ['curve', 'orthogonal'];
export const DEFAULT_ROUTE_STYLE: RouteStyle = 'curve';

// Text position along the curve (ADR-0013): a bezier parameter clamped away
// from the endpoints so the Text card never buries an Arrowhead or a node.
// Absent means the midpoint; only deviations are stored.
export const TEXT_POSITION_MIN = 0.1;
export const TEXT_POSITION_MAX = 0.9;
export const TEXT_POSITION_DEFAULT = 0.5;

// Reroute Points are authored in absolute Canvas coordinates and belong to a
// Connection's geometry rather than having identities of their own.
export interface ReroutePoint {
  x: number;
  y: number;
}

export const MAX_REROUTE_POINTS = 32;

export interface Connection {
  id: string;
  sourceNodeId: string;
  sourceHandle: HandleSide;
  targetNodeId: string;
  targetHandle: HandleSide;
  // Optional Text shown along the curve; absent means unannotated
  text?: Text;
  // Bezier parameter where the Text card sits without Reroute Points, or
  // normalized arc-length progress along the complete route with them
  textPosition?: number;
  // Ordered user-authored route vertices in absolute Canvas coordinates;
  // absent means the legacy single cubic route
  reroutePoints?: ReroutePoint[];
  // Curve color from NODE_PALETTE; absent means the default stroke
  color?: string;
  // Arrowhead at the source endpoint; absent means DEFAULT_START_ARROWHEAD
  startArrowhead?: ArrowheadType;
  // Arrowhead at the target endpoint; absent means DEFAULT_END_ARROWHEAD
  endArrowhead?: ArrowheadType;
  // Stroke Pattern of the curve (ADR-0020); absent means DEFAULT_STROKE_PATTERN
  strokePattern?: StrokePattern;
  // Stroke Weight of the curve (ADR-0020); absent means DEFAULT_STROKE_WEIGHT
  strokeWeight?: StrokeWeight;
  // Route Style of the curve (ADR-0031); absent means DEFAULT_ROUTE_STYLE
  routeStyle?: RouteStyle;
}

/** The position a Connection's Text actually occupies (stored value, or the midpoint). */
export function effectiveTextPosition(conn: Connection): number {
  return conn.textPosition ?? TEXT_POSITION_DEFAULT;
}

/** The default Arrowhead shape for an endpoint when no value is stored. */
export function defaultArrowhead(end: ArrowheadEnd): ArrowheadType {
  return end === 'start' ? DEFAULT_START_ARROWHEAD : DEFAULT_END_ARROWHEAD;
}

/** The Arrowhead a Connection actually shows at an endpoint (stored value, or the default). */
export function effectiveArrowhead(conn: Connection, end: ArrowheadEnd): ArrowheadType {
  const stored = end === 'start' ? conn.startArrowhead : conn.endArrowhead;
  return stored ?? defaultArrowhead(end);
}

/** The Stroke Pattern a Connection actually shows (stored value, or solid). */
export function effectiveStrokePattern(conn: Connection): StrokePattern {
  return conn.strokePattern ?? DEFAULT_STROKE_PATTERN;
}

/** The Stroke Weight a Connection actually shows (stored value, or normal). */
export function effectiveStrokeWeight(conn: Connection): StrokeWeight {
  return conn.strokeWeight ?? DEFAULT_STROKE_WEIGHT;
}

/** The Route Style a Connection actually shows (stored value, or curve). */
export function effectiveRouteStyle(conn: Connection): RouteStyle {
  return conn.routeStyle ?? DEFAULT_ROUTE_STYLE;
}

// Interaction state a Connection's curve renders in: at rest, hovered, or selected.
export type StrokeState = 'base' | 'hover' | 'selected';

// Weight presets in px; 'normal' equals the pre-feature base width so existing
// graphs stay pixel-identical. Selection chrome thickens relatively (ADR-0020):
// a fixed increment on top of the Connection's own weight, keeping the
// thin/normal/thick ordering visible while selected — normal's 2.5/3.5/4
// reproduces the shipped hover/selected widths exactly.
const STROKE_WEIGHT_PX: Record<StrokeWeight, number> = { thin: 1.5, normal: 2.5, thick: 4.5 };
const STROKE_STATE_INCREMENT: Record<StrokeState, number> = { base: 0, hover: 1, selected: 1.5 };

/** The rendered curve width in px for a weight preset in an interaction state. */
export function strokeWidthPx(weight: StrokeWeight, state: StrokeState): number {
  return STROKE_WEIGHT_PX[weight] + STROKE_STATE_INCREMENT[state];
}

/**
 * The SVG dasharray for a pattern at a stroke width, or null for solid.
 * Rhythms are multiples of the width (ADR-0020) so a pattern reads the same
 * at every weight: dashed is a 3w dash with a 2w gap; dotted is a near-zero
 * dash (rounded caps make it a dot) with a 2w gap.
 */
export function strokeDasharray(pattern: StrokePattern, widthPx: number): string | null {
  if (pattern === 'solid') return null;
  if (pattern === 'dashed') return `${3 * widthPx} ${2 * widthPx}`;
  return `0.1 ${2 * widthPx}`;
}
