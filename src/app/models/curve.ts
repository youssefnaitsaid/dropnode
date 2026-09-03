import { HandleSide, GraphNode } from './node';
import { TEXT_POSITION_MIN, TEXT_POSITION_MAX, TEXT_POSITION_DEFAULT, RouteStyle, DEFAULT_ROUTE_STYLE } from './connection';

// Pure Connection curve geometry (ADR-0013). The single source of truth for
// the cubic bezier a Connection renders as, the point-at-t evaluation the
// Text card centers on, and the cursor→textPosition projection used while
// dragging the card. No Angular, no DOM — everything here is unit-testable.

export interface Point {
  x: number;
  y: number;
}

export interface Curve {
  start: Point;
  cp1: Point;
  cp2: Point;
  end: Point;
}

/** The complete geometry of a Connection, either one legacy cubic or a
 * piecewise cubic passing through ordered Reroute Points. */
export interface ConnectionRoute {
  segments: Curve[];
  hasReroutePoints: boolean;
  lengths: number[];
  totalLength: number;
}

export interface RouteProjection {
  segmentIndex: number;
  t: number;
  point: Point;
  distance: number;
  progress: number;
}

// A dragged Text card within this radius (canvas units) of the curve midpoint
// snaps back to it — the Snap Zone idiom applied to the default position.
export const TEXT_POSITION_SNAP_RADIUS = 15;

function controlPoint(pos: Point, handle: HandleSide, offset: number): Point {
  return add(pos, scale(handleDirection(handle), offset));
}

/** The cubic bezier for a Connection: control points extend perpendicular to
 *  each Handle's edge, offset clamped between 40 and 150 (distance x 0.4). */
export function connectionCurve(
  start: Point,
  end: Point,
  startHandle: HandleSide,
  endHandle: HandleSide,
): Curve {
  const distance = Math.sqrt((end.x - start.x) ** 2 + (end.y - start.y) ** 2);
  const offset = Math.min(Math.max(distance * 0.4, 40), 150);
  return {
    start,
    end,
    cp1: controlPoint(start, startHandle, offset),
    cp2: controlPoint(end, endHandle, offset),
  };
}

function handleDirection(handle: HandleSide): Point {
  switch (handle) {
    case 'top': return { x: 0, y: -1 };
    case 'right': return { x: 1, y: 0 };
    case 'bottom': return { x: 0, y: 1 };
    case 'left': return { x: -1, y: 0 };
  }
}

function distance(a: Point, b: Point): number {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
}

function add(a: Point, b: Point): Point {
  return { x: a.x + b.x, y: a.y + b.y };
}

function subtract(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y };
}

function scale(point: Point, factor: number): Point {
  return { x: point.x * factor, y: point.y * factor };
}

function pointInEndpointBox(point: Point, first: Point, second: Point): boolean {
  const epsilon = 1e-9;
  return point.x >= Math.min(first.x, second.x) - epsilon &&
    point.x <= Math.max(first.x, second.x) + epsilon &&
    point.y >= Math.min(first.y, second.y) - epsilon &&
    point.y <= Math.max(first.y, second.y) + epsilon;
}

/** Scale one shared tangent until both adjacent control points fit inside
 * their endpoint boxes. Keeping one scale for both sides preserves C1
 * continuity at every interior Reroute Point while the cubic's convex-hull
 * property keeps each segment bounded by its authored vertices. */
function boundedTangent(
  tangent: Point,
  vertex: Point,
  previous: Point | undefined,
  next: Point | undefined,
  controlFactor: number,
): Point {
  const fits = (factor: number): boolean => {
    if (previous && !pointInEndpointBox(
      subtract(vertex, scale(tangent, controlFactor * factor)), previous, vertex,
    )) return false;
    if (next && !pointInEndpointBox(
      add(vertex, scale(tangent, controlFactor * factor)), vertex, next,
    )) return false;
    return true;
  };

  if (fits(1)) return tangent;

  let low = 0;
  let high = 1;
  for (let i = 0; i < 24; i++) {
    const middle = (low + high) / 2;
    if (fits(middle)) low = middle;
    else high = middle;
  }
  return scale(tangent, low);
}

function routeControlOffset(start: Point, end: Point): number {
  return Math.min(Math.max(distance(start, end) * 0.4, 40), 150);
}

/** How far a point lies ahead of a Handle along its Handle direction; a point
 *  behind the Handle returns zero (no forward sweep possible). */
function forwardProjection(point: Point, handle: Point, side: HandleSide): number {
  const dir = handleDirection(side);
  return Math.max((point.x - handle.x) * dir.x + (point.y - handle.y) * dir.y, 0);
}

const ROUTE_LENGTH_SAMPLES = 40;

function segmentLength(curve: Curve, untilT = 1): number {
  if (untilT <= 0) return 0;
  let length = 0;
  let previous = pointAt(curve, 0);
  for (let i = 1; i <= ROUTE_LENGTH_SAMPLES; i++) {
    const current = pointAt(curve, untilT * i / ROUTE_LENGTH_SAMPLES);
    length += distance(previous, current);
    previous = current;
  }
  return length;
}

function measuredRoute(segments: Curve[], hasReroutePoints: boolean): ConnectionRoute {
  const lengths = segments.map(segment => segmentLength(segment));
  return {
    segments,
    hasReroutePoints,
    lengths,
    totalLength: lengths.reduce((sum, length) => sum + length, 0),
  };
}

/** Build the complete Connection route. Without Reroute Points this returns
 * the existing single cubic unchanged. With points, each segment interpolates
 * its two consecutive route vertices using bounded Catmull-Rom-like tangents.
 * With the orthogonal Route Style, every leg becomes sharp axis-aligned steps
 * through the same vertices (ADR-0031) — see `orthogonalRoute` below.
 */
export function connectionRoute(
  start: Point,
  end: Point,
  startHandle: HandleSide,
  endHandle: HandleSide,
  reroutePoints: readonly Point[] = [],
  routeStyle: RouteStyle = DEFAULT_ROUTE_STYLE,
): ConnectionRoute {
  if (routeStyle === 'orthogonal') {
    return orthogonalRoute(start, end, startHandle, endHandle, reroutePoints);
  }
  if (reroutePoints.length === 0) {
    return measuredRoute([connectionCurve(start, end, startHandle, endHandle)], false);
  }

  const vertices = [start, ...reroutePoints, end];
  const tangents: Point[] = vertices.map((vertex, index) => {
    if (index === 0) {
      // The plain Connection's span-based sweep, capped so the departure
      // control point never passes the first Reroute Point along the Handle
      // direction (a point behind the Handle clamps the sweep to zero).
      const length = Math.min(
        routeControlOffset(start, end),
        forwardProjection(vertices[1], start, startHandle),
      );
      return scale(handleDirection(startHandle), length);
    }
    if (index === vertices.length - 1) {
      const length = Math.min(
        routeControlOffset(start, end),
        forwardProjection(vertices[index - 1], end, endHandle),
      );
      return scale(handleDirection(endHandle), -length);
    }
    return scale(subtract(vertices[index + 1], vertices[index - 1]), 0.5);
  });

  const boundedTangents = tangents.map((tangent, index) => boundedTangent(
    tangent,
    vertices[index],
    vertices[index - 1],
    vertices[index + 1],
    index === 0 || index === vertices.length - 1 ? 1 : 1 / 3,
  ));

  const segments = vertices.slice(0, -1).map((vertex, index) => {
    const next = vertices[index + 1];
    const cp1 = index === 0
      ? add(vertex, boundedTangents[index])
      : add(vertex, scale(boundedTangents[index], 1 / 3));
    const cp2 = index + 1 === vertices.length - 1
      ? subtract(next, boundedTangents[index + 1])
      : subtract(next, scale(boundedTangents[index + 1], 1 / 3));
    return {
      start: vertex,
      cp1,
      cp2,
      end: next,
    };
  });

  return measuredRoute(segments, true);
}

// --- Orthogonal routing (ADR-0031) ------------------------------------------
// Handle-constrained Manhattan geometry: the route departs along the source
// Handle and arrives along the target Handle, hitting every vertex (source,
// ordered Reroute Points, target) exactly with sharp 90° corners. Each leg is
// emitted as uniform straight cubic segments (collinear third-spaced control
// points), so every existing consumer — sampling, projection, Text anchoring,
// bounds, hit-testing, SVG and Minimap stroking — works unchanged. The route
// always uses arc-length progress (flagged via hasReroutePoints, which is
// exact on uniform legs), keeping the legacy cubic-t meaning for plain curves.

type Axis = 'h' | 'v';

function axisOf(direction: Point): Axis {
  return direction.x !== 0 ? 'h' : 'v';
}

/** A uniform straight segment: the cubic evaluates to exact linear interpolation. */
function straightLeg(start: Point, end: Point): Curve {
  return {
    start,
    end,
    cp1: { x: start.x + (end.x - start.x) / 3, y: start.y + (end.y - start.y) / 3 },
    cp2: { x: start.x + 2 * (end.x - start.x) / 3, y: start.y + 2 * (end.y - start.y) / 3 },
  };
}

/** Full point chain [from, ...bends, to] for one vertex pair. A null
 * constraint means that end is free. Handle axes always win over travel
 * direction; travel direction wins over the H-first default; step signs are
 * best-effort so degenerate placements stay deterministic. */
function orthogonalChain(
  from: Point,
  to: Point,
  startDir: Point | null,
  endDir: Point | null,
  incoming: Point | null,
): Point[] {
  if (from.x === to.x && from.y === to.y) return [from];
  const hFirst: Point[] = [from, { x: to.x, y: from.y }, to];
  const vFirst: Point[] = [from, { x: from.x, y: to.y }, to];
  if (from.x === to.x || from.y === to.y) return [from, to];
  if (startDir && endDir) {
    if (axisOf(startDir) === axisOf(endDir)) {
      // Same-axis Handles need an H-V-H (or V-H-V) mid-split to honor both.
      if (axisOf(startDir) === 'h') {
        const midX = (from.x + to.x) / 2;
        return [from, { x: midX, y: from.y }, { x: midX, y: to.y }, to];
      }
      const midY = (from.y + to.y) / 2;
      return [from, { x: from.x, y: midY }, { x: to.x, y: midY }, to];
    }
    // Differing axes: the single L starting along the departure axis.
    return axisOf(startDir) === 'h' ? hFirst : vFirst;
  }
  if (startDir) return axisOf(startDir) === 'h' ? hFirst : vFirst;
  if (endDir) return axisOf(endDir) === 'h' ? vFirst : hFirst;
  // Interior leg: keep the incoming travel direction when it makes progress
  // toward the next vertex, else turn at the vertex. No incoming direction
  // (a zero-length leg preceded us) falls back to H-first.
  if (incoming) {
    if (incoming.x !== 0) {
      return Math.sign(to.x - from.x) === Math.sign(incoming.x) ? hFirst : vFirst;
    }
    if (incoming.y !== 0) {
      return Math.sign(to.y - from.y) === Math.sign(incoming.y) ? vFirst : hFirst;
    }
  }
  return hFirst;
}

function orthogonalRoute(
  start: Point,
  end: Point,
  startHandle: HandleSide,
  endHandle: HandleSide,
  reroutePoints: readonly Point[],
): ConnectionRoute {
  const vertices = [start, ...reroutePoints, end];
  // The departure step leaves along the source Handle's outward direction;
  // the arrival step enters against the target Handle's outward direction.
  const departDir = handleDirection(startHandle);
  const arriveDir = scale(handleDirection(endHandle), -1);

  const joints: Point[] = [start];
  let incoming: Point | null = null;
  for (let i = 0; i < vertices.length - 1; i++) {
    const from = vertices[i];
    const to = vertices[i + 1];
    const first = i === 0;
    const last = i === vertices.length - 2;
    // A lone pair carries both Handle constraints; otherwise the first leg
    // owns the departure and the last leg owns the arrival.
    const chain = orthogonalChain(
      from,
      to,
      first ? departDir : null,
      last ? arriveDir : null,
      first ? null : incoming,
    );
    for (let j = 1; j < chain.length; j++) {
      const prev = joints[joints.length - 1];
      const next = chain[j];
      if (next.x === prev.x && next.y === prev.y) continue;
      incoming = { x: Math.sign(next.x - prev.x), y: Math.sign(next.y - prev.y) };
      joints.push(next);
    }
  }

  const segments = joints.slice(1).map((joint, index) => straightLeg(joints[index], joint));
  if (segments.length === 0) segments.push(straightLeg(start, start));
  return measuredRoute(segments, true);
}

/** The Canvas-coordinate anchor of a Node's Handle on the given edge — derived
 *  from the Node's rect. The single source of truth shared by the connection
 *  layer, hit-testing, and bounds. */
export function handlePoint(node: GraphNode, side: HandleSide): Point {
  switch (side) {
    case 'top': return { x: node.x + node.width / 2, y: node.y };
    case 'right': return { x: node.x + node.width, y: node.y + node.height / 2 };
    case 'bottom': return { x: node.x + node.width / 2, y: node.y + node.height };
    case 'left': return { x: node.x, y: node.y + node.height / 2 };
  }
}

/** Cubic bezier point at parameter t. */
export function pointAt(curve: Curve, t: number): Point {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * curve.start.x + b * curve.cp1.x + c * curve.cp2.x + d * curve.end.x,
    y: a * curve.start.y + b * curve.cp1.y + c * curve.cp2.y + d * curve.end.y,
  };
}

function pointAtDistance(curve: Curve, distanceAlong: number): Point {
  const total = segmentLength(curve);
  if (total === 0 || distanceAlong <= 0) return curve.start;
  if (distanceAlong >= total) return curve.end;

  let low = 0;
  let high = 1;
  for (let i = 0; i < 20; i++) {
    const middle = (low + high) / 2;
    if (segmentLength(curve, middle) < distanceAlong) low = middle;
    else high = middle;
  }
  return pointAt(curve, (low + high) / 2);
}

/** Point at normalized progress along the complete Connection route. A
 * legacy one-segment route keeps the original cubic parameter semantics;
 * routed Connections use normalized arc length across all segments. */
export function routePointAt(route: ConnectionRoute, progress: number): Point {
  const clamped = Math.min(Math.max(progress, 0), 1);
  if (!route.hasReroutePoints || route.totalLength === 0) {
    return pointAt(route.segments[0], clamped);
  }

  const targetDistance = clamped * route.totalLength;
  let travelled = 0;
  for (let i = 0; i < route.segments.length; i++) {
    const length = route.lengths[i];
    if (i === route.segments.length - 1 || targetDistance <= travelled + length) {
      return pointAtDistance(route.segments[i], targetDistance - travelled);
    }
    travelled += length;
  }
  return route.segments[route.segments.length - 1].end;
}

function distanceSq(a: Point, b: Point): number {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}

// Nearest t on the curve to the given point: coarse sampling then local
// refinement — plenty of precision for a drag target, with no root-finding.
function nearestT(curve: Curve, point: Point): number {
  const COARSE_STEPS = 100;
  let bestT = 0;
  let bestDist = Infinity;
  for (let i = 0; i <= COARSE_STEPS; i++) {
    const t = i / COARSE_STEPS;
    const dist = distanceSq(pointAt(curve, t), point);
    if (dist < bestDist) {
      bestDist = dist;
      bestT = t;
    }
  }
  let step = 1 / COARSE_STEPS;
  for (let i = 0; i < 20; i++) {
    step /= 2;
    for (const candidate of [bestT - step, bestT + step]) {
      const t = Math.min(Math.max(candidate, 0), 1);
      const dist = distanceSq(pointAt(curve, t), point);
      if (dist < bestDist) {
        bestDist = dist;
        bestT = t;
      }
    }
  }
  return bestT;
}

/** Project a Canvas point onto the complete route. Comparisons use strict
 * improvement, so a projection tie at a self-intersection keeps the earliest
 * route segment deterministically. */
export function routeProjection(route: ConnectionRoute, point: Point): RouteProjection {
  let bestSegmentIndex = 0;
  let bestT = 0;
  let bestPoint = route.segments[0].start;
  let bestDistanceSq = Infinity;

  for (let i = 0; i < route.segments.length; i++) {
    const segment = route.segments[i];
    const t = nearestT(segment, point);
    const projected = pointAt(segment, t);
    const projectedDistanceSq = distanceSq(projected, point);
    if (projectedDistanceSq < bestDistanceSq) {
      bestSegmentIndex = i;
      bestT = t;
      bestPoint = projected;
      bestDistanceSq = projectedDistanceSq;
    }
  }

  const segmentDistanceBefore = route.lengths
    .slice(0, bestSegmentIndex)
    .reduce((sum, length) => sum + length, 0);
  const routeDistance = segmentDistanceBefore + segmentLength(route.segments[bestSegmentIndex], bestT);
  const progress = route.hasReroutePoints && route.totalLength > 0
    ? routeDistance / route.totalLength
    : bestT;

  return {
    segmentIndex: bestSegmentIndex,
    t: bestT,
    point: bestPoint,
    distance: Math.sqrt(bestDistanceSq),
    progress,
  };
}

/** Sample every segment of a route as one polyline, retaining shared vertices
 * only once. This is used by hit testing and marquee selection. */
export function sampleRoute(route: ConnectionRoute, samplesPerSegment = 32): Point[] {
  const samples: Point[] = [];
  for (const [segmentIndex, segment] of route.segments.entries()) {
    if (segmentIndex === 0) samples.push(segment.start);
    for (let i = 1; i <= samplesPerSegment; i++) {
      samples.push(pointAt(segment, i / samplesPerSegment));
    }
  }
  return samples;
}

/** The Text card's normalized position for a cursor point on a route. The
 * legacy cubic retains its t semantics; routed curves use arc-length progress
 * and the existing midpoint Snap Zone behavior. */
export function textPositionFromRoute(route: ConnectionRoute, point: Point): number {
  const projection = routeProjection(route, point);
  const progress = Math.min(Math.max(projection.progress, TEXT_POSITION_MIN), TEXT_POSITION_MAX);
  const midpoint = routePointAt(route, TEXT_POSITION_DEFAULT);
  if (distanceSq(routePointAt(route, progress), midpoint) <= TEXT_POSITION_SNAP_RADIUS ** 2) {
    return TEXT_POSITION_DEFAULT;
  }
  return progress;
}

/** The textPosition for a cursor point while dragging a Text card: the nearest
 *  t on the curve, clamped to [TEXT_POSITION_MIN, TEXT_POSITION_MAX], snapping
 *  to the midpoint when the projected point lands inside the snap radius. */
export function textPositionFromPoint(curve: Curve, point: Point): number {
  return textPositionFromRoute(measuredRoute([curve], false), point);
}
