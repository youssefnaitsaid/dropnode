import { describe, it, expect } from 'vitest';
import { connectionCurve, connectionRoute, pointAt, routePointAt, routeProjection, textPositionFromPoint, textPositionFromRoute } from './curve';
import { TEXT_POSITION_MIN, TEXT_POSITION_MAX, TEXT_POSITION_DEFAULT } from './connection';

// A horizontal right→left curve: start (0,0), end (100,0), distance 100,
// control offset clamp(100 * 0.4, 40, 150) = 40 → cp1 (40,0), cp2 (60,0).
// Every curve point lies on y = 0 with x strictly increasing, so projections
// have an independently checkable ground truth.
const flatCurve = () =>
  connectionCurve({ x: 0, y: 0 }, { x: 100, y: 0 }, 'right', 'left');

describe('connectionCurve', () => {
  it('extends control points perpendicular to each Handle edge, offset clamped at 40 minimum', () => {
    const curve = flatCurve();
    expect(curve.cp1).toEqual({ x: 40, y: 0 });
    expect(curve.cp2).toEqual({ x: 60, y: 0 });
  });

  it('caps the control offset at 150 for long curves', () => {
    const curve = connectionCurve({ x: 0, y: 0 }, { x: 1000, y: 0 }, 'right', 'left');
    expect(curve.cp1).toEqual({ x: 150, y: 0 });
    expect(curve.cp2).toEqual({ x: 850, y: 0 });
  });

  it('offsets vertically for top/bottom Handles', () => {
    const curve = connectionCurve({ x: 0, y: 0 }, { x: 0, y: 100 }, 'bottom', 'top');
    expect(curve.cp1).toEqual({ x: 0, y: 40 });
    expect(curve.cp2).toEqual({ x: 0, y: 60 });
  });
});

describe('connectionRoute', () => {
  it('builds a piecewise curve through ordered Reroute Points', () => {
    const start = { x: 0, y: 0 };
    const first = { x: 100, y: 80 };
    const second = { x: 220, y: -40 };
    const end = { x: 320, y: 0 };

    const route = connectionRoute(start, end, 'right', 'left', [first, second]);

    expect(route.segments).toHaveLength(3);
    expect(route.segments.map(segment => segment.start)).toEqual([start, first, second]);
    expect(route.segments.map(segment => segment.end)).toEqual([first, second, end]);
  });

  it('uses normalized route progress for routed curves and preserves cubic t without points', () => {
    const routed = connectionRoute(
      { x: 0, y: 0 },
      { x: 300, y: 0 },
      'right',
      'left',
      [{ x: 100, y: 0 }, { x: 200, y: 0 }],
    );

    const routedMidpoint = routePointAt(routed, 0.5);
    expect(routedMidpoint.x).toBeCloseTo(150, 4);
    expect(routedMidpoint.y).toBeCloseTo(0, 4);

    const unrouted = connectionRoute({ x: 0, y: 0 }, { x: 100, y: 0 }, 'right', 'left');
    expect(routePointAt(unrouted, 0.5)).toEqual(pointAt(flatCurve(), 0.5));
  });

  it('keeps endpoint tangents aligned with the source and target Handles', () => {
    const route = connectionRoute(
      { x: 0, y: 0 },
      { x: 300, y: 0 },
      'right',
      'left',
      [{ x: 120, y: 100 }],
    );

    expect(route.segments[0].cp1.x).toBeGreaterThan(route.segments[0].start.x);
    expect(route.segments[route.segments.length - 1].cp2.x)
      .toBeLessThan(route.segments[route.segments.length - 1].end.x);
  });

  it('sweeps the endpoints with the plain curve offset when points sit beyond the sweep', () => {
    // A single mid-route point must barely change the look: the routed
    // endpoint control points equal the plain Connection's exactly.
    const start = { x: 0, y: 0 };
    const end = { x: 300, y: 100 };
    const route = connectionRoute(start, end, 'right', 'left', [{ x: 150, y: 50 }]);
    const plain = connectionCurve(start, end, 'right', 'left');

    expect(route.segments[0].cp1).toEqual(plain.cp1);
    expect(route.segments[route.segments.length - 1].cp2).toEqual(plain.cp2);
  });

  it('caps the departure sweep at a Reroute Point inside the plain sweep', () => {
    // Plain offset would be 120, but the point sits 60 ahead of the source
    // Handle, so the control point stops at its forward projection.
    const route = connectionRoute(
      { x: 0, y: 0 },
      { x: 300, y: 0 },
      'right',
      'left',
      [{ x: 60, y: 80 }],
    );

    expect(route.segments[0].cp1).toEqual({ x: 60, y: 0 });
  });

  it('caps the arrival sweep at the last Reroute Point', () => {
    // The last point sits 60 ahead of the target Handle (toward the source),
    // capping the arrival control point at its forward projection.
    const route = connectionRoute(
      { x: 0, y: 0 },
      { x: 300, y: 0 },
      'right',
      'left',
      [{ x: 240, y: -60 }],
    );

    expect(route.segments[route.segments.length - 1].cp2).toEqual({ x: 240, y: 0 });
  });

  it('does not sweep forward past a Reroute Point behind the Handle', () => {
    // A point behind the Handle leaves no room for a forward sweep.
    const route = connectionRoute(
      { x: 0, y: 0 },
      { x: 300, y: 0 },
      'right',
      'left',
      [{ x: -20, y: 0 }],
    );

    expect(route.segments[0].cp1).toEqual({ x: 0, y: 0 });
  });

  it('keeps interior tangents continuous while bounding every segment control point', () => {
    const route = connectionRoute(
      { x: 0, y: 0 },
      { x: 300, y: 0 },
      'right',
      'left',
      [{ x: 120, y: 140 }, { x: 180, y: -80 }],
    );

    const incoming = {
      x: route.segments[0].end.x - route.segments[0].cp2.x,
      y: route.segments[0].end.y - route.segments[0].cp2.y,
    };
    const outgoing = {
      x: route.segments[1].cp1.x - route.segments[1].start.x,
      y: route.segments[1].cp1.y - route.segments[1].start.y,
    };
    expect(outgoing.x).toBeCloseTo(incoming.x, 6);
    expect(outgoing.y).toBeCloseTo(incoming.y, 6);

    for (const segment of route.segments) {
      for (const control of [segment.cp1, segment.cp2]) {
        expect(control.x).toBeGreaterThanOrEqual(Math.min(segment.start.x, segment.end.x));
        expect(control.x).toBeLessThanOrEqual(Math.max(segment.start.x, segment.end.x));
        expect(control.y).toBeGreaterThanOrEqual(Math.min(segment.start.y, segment.end.y));
        expect(control.y).toBeLessThanOrEqual(Math.max(segment.start.y, segment.end.y));
      }
    }
  });

  it('projects a point to the route segment and returns arc-length progress', () => {
    const route = connectionRoute(
      { x: 0, y: 0 },
      { x: 300, y: 0 },
      'right',
      'left',
      [{ x: 100, y: 100 }, { x: 200, y: 0 }],
    );

    const projection = routeProjection(route, { x: 100, y: 100 });
    expect(projection.segmentIndex).toBe(0);
    expect(projection.point).toEqual({ x: 100, y: 100 });
    expect(projection.progress).toBeGreaterThan(0);
    expect(projection.progress).toBeLessThan(1);
  });

  it('chooses the earliest segment at a self-intersection tie', () => {
    const diagonal = (start: { x: number; y: number }, end: { x: number; y: number }) => ({
      start,
      cp1: { x: start.x + (end.x - start.x) / 3, y: start.y + (end.y - start.y) / 3 },
      cp2: { x: start.x + 2 * (end.x - start.x) / 3, y: start.y + 2 * (end.y - start.y) / 3 },
      end,
    });
    const segments = [
      diagonal({ x: 0, y: 0 }, { x: 100, y: 100 }),
      diagonal({ x: 100, y: 100 }, { x: 0, y: 100 }),
      diagonal({ x: 0, y: 100 }, { x: 100, y: 0 }),
    ];
    const route = {
      segments,
      hasReroutePoints: true,
      lengths: [100, 100, 141.421356237],
      totalLength: 341.421356237,
    };

    expect(routeProjection(route, { x: 50, y: 50 }).segmentIndex).toBe(0);
  });

  it('projects routed Text against the complete route using arc-length progress', () => {
    const route = connectionRoute(
      { x: 0, y: 0 },
      { x: 300, y: 0 },
      'right',
      'left',
      [{ x: 80, y: 120 }, { x: 220, y: -120 }],
    );
    const point = route.segments[1].end;
    const position = textPositionFromRoute(route, point);

    expect(position).toBeGreaterThan(TEXT_POSITION_DEFAULT);
    expect(position).toBeLessThan(TEXT_POSITION_MAX);
    expect(routePointAt(route, position).x).toBeCloseTo(point.x, 0);
  });
});

describe('connectionRoute orthogonal', () => {
  it('renders an aligned Handle pair as one straight leg', () => {
    const route = connectionRoute({ x: 0, y: 0 }, { x: 100, y: 0 }, 'right', 'left', [], 'orthogonal');

    expect(route.segments).toHaveLength(1);
    expect(route.totalLength).toBeCloseTo(100, 6);
    const quarter = routePointAt(route, 0.25);
    expect(quarter.x).toBeCloseTo(25, 3);
    expect(quarter.y).toBeCloseTo(0, 6);
    const half = routePointAt(route, 0.5);
    expect(half.x).toBeCloseTo(50, 3);
    expect(half.y).toBeCloseTo(0, 6);
  });

  it('mid-splits an offset same-axis Handle pair (H-V-H)', () => {
    // Source departs +x, target arrives +x: minimal satisfaction is
    // (0,0) → (150,0) → (150,100) → (300,100).
    const route = connectionRoute({ x: 0, y: 0 }, { x: 300, y: 100 }, 'right', 'left', [], 'orthogonal');

    expect(route.segments).toHaveLength(3);
    expect(route.totalLength).toBeCloseTo(400, 6);
    expect(routePointAt(route, 0)).toEqual({ x: 0, y: 0 });
    expect(routePointAt(route, 150 / 400)).toEqual({ x: 150, y: 0 });
    expect(routePointAt(route, 250 / 400)).toEqual({ x: 150, y: 100 });
    expect(routePointAt(route, 1)).toEqual({ x: 300, y: 100 });
  });

  it('joins differing-axis Handles with a single L-bend', () => {
    // Source departs +x, target Handle bottom arrives -y:
    // (0,0) → (100,0) → (100,-100).
    const route = connectionRoute({ x: 0, y: 0 }, { x: 100, y: -100 }, 'right', 'bottom', [], 'orthogonal');

    expect(route.segments).toHaveLength(2);
    expect(route.totalLength).toBeCloseTo(200, 6);
    expect(routePointAt(route, 0.5)).toEqual({ x: 100, y: 0 });
  });

  it('hits every Reroute Point exactly with sharp axis-aligned legs', () => {
    const start = { x: 0, y: 0 };
    const first = { x: 200, y: 50 };
    const end = { x: 400, y: 50 };
    const route = connectionRoute(start, end, 'right', 'left', [first], 'orthogonal');

    // First leg starts along the source Handle: (0,0) → (200,0) → first;
    // last leg is aligned straight: first → end.
    expect(route.segments).toHaveLength(3);
    expect(route.totalLength).toBeCloseTo(450, 6);
    const joints = [route.segments[0].start, ...route.segments.map(s => s.end)];
    expect(joints).toEqual([
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 50 },
      { x: 400, y: 50 },
    ]);
  });

  it('continues straight through a vertex when it makes progress, else turns at it', () => {
    const route = connectionRoute(
      { x: 0, y: 0 },
      { x: 300, y: 50 },
      'right',
      'left',
      [{ x: 100, y: 0 }, { x: 200, y: 50 }],
    );
    // Without a style the curve default applies even with points present.
    expect(route.hasReroutePoints).toBe(true);

    const ortho = connectionRoute(
      { x: 0, y: 0 },
      { x: 300, y: 50 },
      'right',
      'left',
      [{ x: 100, y: 0 }, { x: 200, y: 50 }],
      'orthogonal',
    );
    // S → P1 straight; P1 → P2 continues +x (H-first): bend (200,0);
    // P2 → T arrives +x (H-last): arrives from (200,50) straight.
    const joints = [ortho.segments[0].start, ...ortho.segments.map(s => s.end)];
    expect(joints).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 50 },
      { x: 300, y: 50 },
    ]);
    expect(ortho.totalLength).toBeCloseTo(100 + 100 + 50 + 100, 6);
  });

  it('turns immediately at a vertex when continuing would backtrack', () => {
    const ortho = connectionRoute(
      { x: 0, y: 0 },
      { x: 300, y: 80 },
      'right',
      'left',
      [{ x: 100, y: 0 }, { x: 50, y: 80 }],
      'orthogonal',
    );
    // P1 → P2 heads -x against the +x arrival: V-first via (100,80).
    const joints = [ortho.segments[0].start, ...ortho.segments.map(s => s.end)];
    expect(joints).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 80 },
      { x: 50, y: 80 },
      { x: 300, y: 80 },
    ]);
  });

  it('projects onto the nearest orthogonal leg with earliest-wins ties', () => {
    const route = connectionRoute({ x: 0, y: 0 }, { x: 300, y: 100 }, 'right', 'left', [], 'orthogonal');

    const onVertical = routeProjection(route, { x: 160, y: 50 });
    expect(onVertical.point.x).toBeCloseTo(150, 6);
    expect(onVertical.point.y).toBeCloseTo(50, 6);
    expect(onVertical.segmentIndex).toBe(1);

    const position = textPositionFromRoute(route, { x: 160, y: 50 });
    expect(routePointAt(route, position).x).toBeCloseTo(150, 0);
    expect(routePointAt(route, position).y).toBeCloseTo(50, 0);
  });

  it('keeps a degenerate same-point route measurable', () => {
    const route = connectionRoute({ x: 50, y: 50 }, { x: 50, y: 50 }, 'right', 'left', [], 'orthogonal');

    expect(route.totalLength).toBeCloseTo(0, 9);
    expect(routePointAt(route, 0.5)).toEqual({ x: 50, y: 50 });
  });
});

describe('pointAt', () => {
  it('returns the start point at t = 0 and the end point at t = 1', () => {
    const curve = flatCurve();
    expect(pointAt(curve, 0)).toEqual({ x: 0, y: 0 });
    expect(pointAt(curve, 1)).toEqual({ x: 100, y: 0 });
  });

  it('returns the known bezier midpoint at t = 0.5', () => {
    // (start + 3·cp1 + 3·cp2 + end) / 8 = (0 + 120 + 180 + 100) / 8 = 50
    expect(pointAt(flatCurve(), 0.5)).toEqual({ x: 50, y: 0 });
  });
});

describe('textPositionFromPoint', () => {
  it('snaps to the midpoint when the projected point is within 15 canvas units of it', () => {
    // Cursor above x = 60: nearest curve point is (60, 0), 10 units from the
    // midpoint (50, 0) — inside the snap radius
    const t = textPositionFromPoint(flatCurve(), { x: 60, y: 5 });
    expect(t).toBe(TEXT_POSITION_DEFAULT);
  });

  it('does not snap when the projected point is farther than 15 canvas units from the midpoint', () => {
    // Nearest curve point is (70, 0), 20 units from the midpoint
    const t = textPositionFromPoint(flatCurve(), { x: 70, y: 0 });
    expect(t).toBeGreaterThan(TEXT_POSITION_DEFAULT);
  });

  it('projects the cursor to the nearest point on the curve', () => {
    const curve = flatCurve();
    const t = textPositionFromPoint(curve, { x: 85, y: 10 });
    // On this flat curve the nearest point to (85, 10) sits at x = 85
    expect(pointAt(curve, t).x).toBeCloseTo(85, 0);
    expect(pointAt(curve, t).y).toBe(0);
  });

  it('clamps to the maximum when the cursor is past the target endpoint', () => {
    const t = textPositionFromPoint(flatCurve(), { x: 250, y: 0 });
    expect(t).toBe(TEXT_POSITION_MAX);
  });

  it('clamps to the minimum when the cursor is before the source endpoint', () => {
    const t = textPositionFromPoint(flatCurve(), { x: -250, y: 0 });
    expect(t).toBe(TEXT_POSITION_MIN);
  });
});
