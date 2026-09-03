import { GraphNode } from './node';
import { Connection, effectiveTextPosition } from './connection';
import { ConnectionRoute, Curve, Point, connectionRoute, handlePoint, routePointAt, sampleRoute } from './curve';

export type { Point };

// Pure Marquee hit-testing (ADR-0016). Touch/intersect semantics: an element
// joins the Selection when the Marquee rect touches any part of it — a Node
// by rect overlap, a Connection by its sampled curve or its Text card, a
// Group as a unit (its own rect or any child rect; children are never
// independent members). No Angular, no DOM — everything is unit-testable.

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Bezier→polyline sampling resolution for curve-vs-rect testing; 32 segments
// track the curve within a couple of canvas units at any realistic length.
const CURVE_SEGMENTS = 32;

// The Text card's true size is DOM-measured; hit-testing uses this nominal
// extent centered on the card's curve anchor (cards render ~120x28 typically,
// max-width 240).
const TEXT_CARD_HALF_WIDTH = 60;
const TEXT_CARD_HALF_HEIGHT = 14;

/** The axis-aligned rect spanned by two opposite corners, in any order. */
export function normalizedRect(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

/** Touch-inclusive axis-aligned overlap: shared edges count. */
export function rectsOverlap(a: Rect, b: Rect): boolean {
  return (
    a.x <= b.x + b.width && b.x <= a.x + a.width &&
    a.y <= b.y + b.height && b.y <= a.y + a.height
  );
}

function pointInRect(p: Point, r: Rect): boolean {
  return p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
}

// Segment-vs-segment intersection via orientation signs (collinear touches
// are caught by the endpoint-in-rect checks before this runs).
function orientation(a: Point, b: Point, c: Point): number {
  return Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
}

function segmentsIntersect(p1: Point, p2: Point, q1: Point, q2: Point): boolean {
  const o1 = orientation(p1, p2, q1);
  const o2 = orientation(p1, p2, q2);
  const o3 = orientation(q1, q2, p1);
  const o4 = orientation(q1, q2, p2);
  return o1 !== o2 && o3 !== o4;
}

function segmentTouchesRect(p1: Point, p2: Point, r: Rect): boolean {
  if (pointInRect(p1, r) || pointInRect(p2, r)) return true;
  const tl = { x: r.x, y: r.y };
  const tr = { x: r.x + r.width, y: r.y };
  const bl = { x: r.x, y: r.y + r.height };
  const br = { x: r.x + r.width, y: r.y + r.height };
  return (
    segmentsIntersect(p1, p2, tl, tr) ||
    segmentsIntersect(p1, p2, tr, br) ||
    segmentsIntersect(p1, p2, br, bl) ||
    segmentsIntersect(p1, p2, bl, tl)
  );
}

/** Whether the rect touches the curve itself (sampled as a short polyline). */
export function curveTouchesRect(curve: Curve, rect: Rect): boolean {
  return routeTouchesRect({
    segments: [curve],
    hasReroutePoints: false,
    lengths: [],
    totalLength: 0,
  }, rect);
}

/** Whether any segment of a complete Connection route touches the rect. */
export function routeTouchesRect(route: ConnectionRoute, rect: Rect): boolean {
  const points = sampleRoute(route, CURVE_SEGMENTS);
  let prev = points[0];
  for (let i = 1; i < points.length; i++) {
    const next = points[i];
    if (segmentTouchesRect(prev, next, rect)) return true;
    prev = next;
  }
  return false;
}

function nodeRect(node: GraphNode): Rect {
  return { x: node.x, y: node.y, width: node.width, height: node.height };
}

/**
 * The elements a Marquee rect selects: top-level Nodes by rect overlap —
 * a Group as a unit, hit through its own rect or any child's rect, children
 * never independent members — and Connections by curve or Text card touch.
 */
export function marqueeSelection(
  nodes: GraphNode[],
  connections: Connection[],
  rect: Rect,
): { nodeIds: string[]; connectionIds: string[] } {
  const byId = new Map(nodes.map(n => [n.id, n]));

  const nodeIds = nodes
    .filter(node => {
      if (node.parentId) return false; // children ride with their Group
      if (rectsOverlap(nodeRect(node), rect)) return true;
      return node.kind === 'group' &&
        nodes.some(c => c.parentId === node.id && rectsOverlap(nodeRect(c), rect));
    })
    .map(node => node.id);

  const connectionIds = connections
    .filter(conn => {
      const source = byId.get(conn.sourceNodeId);
      const target = byId.get(conn.targetNodeId);
      if (!source || !target) return false;
      const route = connectionRoute(
        handlePoint(source, conn.sourceHandle),
        handlePoint(target, conn.targetHandle),
        conn.sourceHandle,
        conn.targetHandle,
        conn.reroutePoints,
        conn.routeStyle,
      );
      if (routeTouchesRect(route, rect)) return true;
      if (!conn.text) return false;
      const anchor = routePointAt(route, effectiveTextPosition(conn));
      const card: Rect = {
        x: anchor.x - TEXT_CARD_HALF_WIDTH,
        y: anchor.y - TEXT_CARD_HALF_HEIGHT,
        width: TEXT_CARD_HALF_WIDTH * 2,
        height: TEXT_CARD_HALF_HEIGHT * 2,
      };
      return rectsOverlap(card, rect);
    })
    .map(conn => conn.id);

  return { nodeIds, connectionIds };
}
