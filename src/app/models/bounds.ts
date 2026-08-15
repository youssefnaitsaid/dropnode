import { GraphNode } from './node';
import { Connection } from './connection';
import { ViewportState, ZOOM_MIN, ZOOM_MAX } from './viewport-state';
import { ConnectionRoute, Curve, connectionRoute, pointAt, handlePoint } from './curve';

// A rectangle in Canvas units.
export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Framing fills at most this fraction of each viewport axis, leaving a margin
// so content isn't flush against the edges. Zoom stays within the editor's
// shared [ZOOM_MIN, ZOOM_MAX] range.
const FRAME_FILL = 0.9;

/** Raw bounding box of all Nodes (Groups included — they are Nodes); null when there are none. */
export function graphBounds(nodes: readonly GraphNode[]): Bounds | null {
  if (nodes.length === 0) return null;
  const minX = Math.min(...nodes.map(n => n.x));
  const minY = Math.min(...nodes.map(n => n.y));
  const maxX = Math.max(...nodes.map(n => n.x + n.width));
  const maxY = Math.max(...nodes.map(n => n.y + n.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Union of one or more rects; null when the list is empty. */
export function unionBounds(rects: readonly Bounds[]): Bounds | null {
  if (rects.length === 0) return null;
  const minX = Math.min(...rects.map(r => r.x));
  const minY = Math.min(...rects.map(r => r.y));
  const maxX = Math.max(...rects.map(r => r.x + r.width));
  const maxY = Math.max(...rects.map(r => r.y + r.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Box enclosing a cubic bezier: its tight bounding box — the curve's actual
 *  extremes (t=0, t=1, and any derivative-zero t between), not the looser
 *  control-point hull. So a bowing Connection claims only the room its arc
 *  really occupies. */
export function curveBounds(curve: Curve): Bounds {
  const ts = [
    0, 1,
    ...cubicExtremaTs(curve.start.x, curve.cp1.x, curve.cp2.x, curve.end.x),
    ...cubicExtremaTs(curve.start.y, curve.cp1.y, curve.cp2.y, curve.end.y),
  ];
  const pts = ts.map(t => pointAt(curve, t));
  const xs = pts.map(p => p.x);
  const ys = pts.map(p => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
}

/** Bounds of every segment in a complete Connection route. */
export function routeBounds(route: ConnectionRoute): Bounds {
  return unionBounds(route.segments.map(segment => curveBounds(segment)))!;
}

// The t values in (0,1) where a 1D cubic bezier's derivative is zero — its
// interior extrema. B'(t)/3 = a*t^2 + b*t + c.
function cubicExtremaTs(p0: number, p1: number, p2: number, p3: number): number[] {
  const a = -p0 + 3 * p1 - 3 * p2 + p3;
  const b = 2 * p0 - 4 * p1 + 2 * p2;
  const c = p1 - p0;
  const EPS = 1e-9;
  const inRange = (t: number): number[] => (t > 0 && t < 1 ? [t] : []);
  if (Math.abs(a) < EPS) {
    return Math.abs(b) < EPS ? [] : inRange(-c / b);
  }
  const disc = b * b - 4 * a * c;
  if (disc < 0) return [];
  const sq = Math.sqrt(disc);
  return [...inRange((-b + sq) / (2 * a)), ...inRange((-b - sq) / (2 * a))];
}

/** A single Connection's curve bounds; null if either endpoint Node is absent. */
export function connectionBounds(
  conn: Connection,
  nodeById: Map<string, GraphNode>,
): Bounds | null {
  const source = nodeById.get(conn.sourceNodeId);
  const target = nodeById.get(conn.targetNodeId);
  if (!source || !target) return null;
  const route = connectionRoute(
    handlePoint(source, conn.sourceHandle),
    handlePoint(target, conn.targetHandle),
    conn.sourceHandle,
    conn.targetHandle,
    conn.reroutePoints,
  );
  return routeBounds(route);
}

/** Bounds of everything drawn — all Nodes plus every Connection's curve (which
 *  bows outside the node box). Null when there are no Nodes. */
export function contentBounds(
  nodes: readonly GraphNode[],
  connections: readonly Connection[],
): Bounds | null {
  const nodeBox = graphBounds(nodes);
  if (!nodeBox) return null;
  const nodeById = new Map(nodes.map(n => [n.id, n]));
  const rects: Bounds[] = [nodeBox];
  for (const conn of connections) {
    const b = connectionBounds(conn, nodeById);
    if (b) rects.push(b);
  }
  return unionBounds(rects);
}

/**
 * A Viewport that frames `bounds` centered in a `viewWidth` x `viewHeight`
 * region, filling at most 90% of each axis (a ~10% margin). Zoom is capped at
 * `maxZoom` so framing never over-magnifies, then clamped to the editor's
 * [0.1, 5] range. A zero-width or zero-height bounds (e.g. a straight
 * Connection) does not constrain that axis. This is bounds-centered — a third
 * centering behavior beside cursor-centered wheel zoom and origin-centered
 * toolbar zoom.
 */
export function frameViewport(
  bounds: Bounds,
  viewWidth: number,
  viewHeight: number,
  maxZoom: number,
): ViewportState {
  const fitX = bounds.width > 0 ? (FRAME_FILL * viewWidth) / bounds.width : Infinity;
  const fitY = bounds.height > 0 ? (FRAME_FILL * viewHeight) / bounds.height : Infinity;
  let zoom = Math.min(fitX, fitY);
  if (!Number.isFinite(zoom)) zoom = maxZoom; // a point: nothing constrains the fit
  zoom = Math.min(zoom, maxZoom);
  zoom = Math.min(Math.max(zoom, ZOOM_MIN), ZOOM_MAX);

  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  return {
    panX: viewWidth / 2 - centerX * zoom,
    panY: viewHeight / 2 - centerY * zoom,
    zoom,
  };
}
