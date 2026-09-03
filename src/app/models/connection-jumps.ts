import type { Point } from './curve';

// Pure Connection Jump geometry (ADR-0032): which lower-painted Connection
// breaks where, computed from sampled route polylines. No Angular, no DOM —
// everything here is unit-testable. The connection layer samples each
// complete route and feeds the polylines in paint order (index 0 = bottom).

export interface JumpInputRoute {
  readonly id: string;
  readonly points: readonly Point[];
  readonly width: number;
}

export interface ConnectionJumpGaps {
  readonly gaps: ReadonlyMap<string, readonly Point[]>;
  readonly capped: boolean;
}

// Intersections this close (canvas units) to any endpoint of either route
// are ignored: same-Handle fans share endpoints, and Arrowheads live there.
export const JUMP_ENDPOINT_EXCLUSION = 12;

// Past this many gaps the whole layer hides its jumps rather than janking
// (ADR-0003 dense-graph budget) — deterministic, no popping subsets.
export const MAX_JUMP_GAPS = 400;

// A pair claiming more crossings than this is near-coincident (sampled
// polylines weaving across each other along their whole length, e.g. an
// allowed reverse-direction twin rendered almost on top of its sibling),
// not a set of proper crossings — its gaps are dropped as noise rather
// than soup. Genuinely woven routes stay far below this.
export const MAX_JUMP_GAPS_PER_PAIR = 32;

// Gap radius scales with the lower Connection's rendered width (ADR-0032),
// mirroring how dash rhythms scale — thin < normal < thick always.
export function jumpGapRadius(width: number): number {
  return 1.5 * width + 2;
}

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function boundsOf(points: readonly Point[]): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    if (point.x < minX) minX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.x > maxX) maxX = point.x;
    if (point.y > maxY) maxY = point.y;
  }
  return { minX, minY, maxX, maxY };
}

function boundsOverlap(a: Bounds, b: Bounds): boolean {
  return a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY;
}

function subtract(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y };
}

function cross(a: Point, b: Point): number {
  return a.x * b.y - a.y * b.x;
}

// Inclusive segment–segment intersection (touching counts: a graze still
// reads as a junction without a gap). Collinear overlaps return null —
// overlap is coincidence, never a proper crossing.
function segmentIntersection(p: Point, q: Point, r: Point, s: Point): Point | null {
  const d1 = subtract(q, p);
  const d2 = subtract(s, r);
  const denominator = cross(d1, d2);
  const epsilon = 1e-9;
  if (Math.abs(denominator) < epsilon) return null;
  const diff = subtract(r, p);
  const t = cross(diff, d2) / denominator;
  const u = cross(diff, d1) / denominator;
  if (t < -epsilon || t > 1 + epsilon || u < -epsilon || u > 1 + epsilon) return null;
  return { x: p.x + t * d1.x, y: p.y + t * d1.y };
}

function distanceSq(a: Point, b: Point): number {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}

/** Gap centers per lower-painted Connection id, in paint order. */
export function findConnectionJumps(routes: readonly JumpInputRoute[]): ConnectionJumpGaps {
  const empty: ConnectionJumpGaps = { gaps: new Map(), capped: false };
  if (routes.length < 2) return empty;

  const boxes = routes.map(route => boundsOf(route.points));
  const gaps = new Map<string, Point[]>();
  let total = 0;

  for (let lower = 0; lower < routes.length; lower++) {
    for (let upper = lower + 1; upper < routes.length; upper++) {
      if (!boundsOverlap(boxes[lower], boxes[upper])) continue;
      const pair = pairCrossings(routes[lower], routes[upper]);
      if (pair.length === 0) continue;
      if (pair.length > MAX_JUMP_GAPS_PER_PAIR) continue;
      let owned = gaps.get(routes[lower].id);
      if (!owned) {
        owned = [];
        gaps.set(routes[lower].id, owned);
      }
      for (const point of pair) {
        if (owned.some(existing => distanceSq(existing, point) < 1)) continue;
        owned.push(point);
        total++;
        if (total > MAX_JUMP_GAPS) return { gaps: new Map(), capped: true };
      }
    }
  }
  return { gaps, capped: false };
}

// Proper mid-curve crossings between two routes, excluding touches near any
// of the four endpoints (shared-endpoint fans and Arrowhead zones).
function pairCrossings(lower: JumpInputRoute, upper: JumpInputRoute): Point[] {
  if (lower.points.length < 2 || upper.points.length < 2) return [];
  const endpoints = [
    lower.points[0],
    lower.points[lower.points.length - 1],
    upper.points[0],
    upper.points[upper.points.length - 1],
  ];
  const exclusionSq = JUMP_ENDPOINT_EXCLUSION ** 2;
  const crossings: Point[] = [];
  for (let i = 0; i < lower.points.length - 1; i++) {
    for (let j = 0; j < upper.points.length - 1; j++) {
      const hit = segmentIntersection(
        lower.points[i], lower.points[i + 1],
        upper.points[j], upper.points[j + 1],
      );
      if (!hit) continue;
      if (!Number.isFinite(hit.x) || !Number.isFinite(hit.y)) continue;
      if (endpoints.some(end => distanceSq(end, hit) < exclusionSq)) continue;
      crossings.push(hit);
    }
  }
  return crossings;
}
