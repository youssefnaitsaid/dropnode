import { describe, it, expect } from 'vitest';
import { GraphNode } from './node';
import { Connection } from './connection';
import { textFromString } from './text';
import { normalizedRect, rectsOverlap, curveTouchesRect, marqueeSelection, Rect } from './marquee';
import { connectionCurve } from './curve';

function node(id: string, x: number, y: number, extra: Partial<GraphNode> = {}): GraphNode {
  return { id, text: textFromString(id), x, y, width: 160, height: 48, ...extra };
}

function conn(id: string, sourceNodeId: string, targetNodeId: string, extra: Partial<Connection> = {}): Connection {
  return { id, sourceNodeId, sourceHandle: 'right', targetNodeId, targetHandle: 'left', ...extra };
}

describe('normalizedRect', () => {
  it('builds the same rect from any pair of opposite corners', () => {
    const expected: Rect = { x: 10, y: 20, width: 30, height: 40 };
    expect(normalizedRect({ x: 10, y: 20 }, { x: 40, y: 60 })).toEqual(expected);
    expect(normalizedRect({ x: 40, y: 60 }, { x: 10, y: 20 })).toEqual(expected);
    expect(normalizedRect({ x: 40, y: 20 }, { x: 10, y: 60 })).toEqual(expected);
    expect(normalizedRect({ x: 10, y: 60 }, { x: 40, y: 20 })).toEqual(expected);
  });
});

describe('rectsOverlap', () => {
  const base: Rect = { x: 0, y: 0, width: 100, height: 100 };

  it('detects partial overlap', () => {
    expect(rectsOverlap(base, { x: 50, y: 50, width: 100, height: 100 })).toBe(true);
  });

  it('detects full containment either way', () => {
    expect(rectsOverlap(base, { x: 20, y: 20, width: 10, height: 10 })).toBe(true);
    expect(rectsOverlap({ x: 20, y: 20, width: 10, height: 10 }, base)).toBe(true);
  });

  it('counts touching edges as overlap (touch semantics)', () => {
    expect(rectsOverlap(base, { x: 100, y: 0, width: 50, height: 50 })).toBe(true);
  });

  it('rejects disjoint rects', () => {
    expect(rectsOverlap(base, { x: 101, y: 0, width: 50, height: 50 })).toBe(false);
    expect(rectsOverlap(base, { x: 0, y: 200, width: 50, height: 50 })).toBe(false);
  });
});

describe('curveTouchesRect', () => {
  // A horizontal right→left curve between two handles at the same height is
  // effectively a straight line along y = 100 from x = 0 to x = 300.
  const flat = connectionCurve({ x: 0, y: 100 }, { x: 300, y: 100 }, 'right', 'left');

  it('detects a rect crossing the middle of the curve', () => {
    expect(curveTouchesRect(flat, { x: 140, y: 80, width: 20, height: 40 })).toBe(true);
  });

  it('detects a rect containing the whole curve', () => {
    expect(curveTouchesRect(flat, { x: -50, y: 0, width: 400, height: 200 })).toBe(true);
  });

  it('rejects a rect near but not touching the curve', () => {
    expect(curveTouchesRect(flat, { x: 140, y: 110, width: 20, height: 40 })).toBe(false);
  });

  it('rejects a rect inside the curve bounding box but away from the curve itself', () => {
    // top-right handle to bottom-left handle bows outward: the bbox center
    // region near the straight chord midpoint is empty for a wide sweep
    const bowed = connectionCurve({ x: 0, y: 0 }, { x: 300, y: 300 }, 'top', 'bottom');
    // The curve leaves (0,0) upward and enters (300,300) from below, so the
    // chord-adjacent corner regions are empty; probe one far corner pocket.
    expect(curveTouchesRect(bowed, { x: 10, y: 200, width: 30, height: 30 })).toBe(false);
  });
});

describe('marqueeSelection', () => {
  it('selects a Node the rect touches and skips untouched Nodes', () => {
    const nodes = [node('a', 0, 0), node('b', 500, 500)];
    const result = marqueeSelection(nodes, [], { x: 100, y: 20, width: 100, height: 100 });
    expect(result.nodeIds).toEqual(['a']);
    expect(result.connectionIds).toEqual([]);
  });

  it('selects a loose Text Block the rect touches like any Node root', () => {
    const nodes = [
      node('t', 0, 0, { kind: 'annotation' }),
      node('b', 500, 500),
    ];
    const result = marqueeSelection(nodes, [], { x: 100, y: 20, width: 100, height: 100 });
    expect(result.nodeIds).toEqual(['t']);
  });

  it('selects a Group when only its Text Block child rect is touched', () => {
    const group = node('g', 0, 0, { kind: 'group', label: 'G', text: undefined, width: 320, height: 200 });
    const child = node('t', 40, 40, { kind: 'annotation', parentId: 'g' });
    const result = marqueeSelection([group, child], [], { x: 50, y: 50, width: 10, height: 10 });
    expect(result.nodeIds).toEqual(['g']);
  });

  it('never returns a child as an independent member — touching a child selects its Group', () => {
    const group = node('g', 0, 0, { kind: 'group', label: 'G', text: undefined, width: 320, height: 200 });
    const child = node('c', 40, 40, { parentId: 'g' });
    const result = marqueeSelection([group, child], [], { x: 50, y: 50, width: 10, height: 10 });
    expect(result.nodeIds).toEqual(['g']);
  });

  it('selects a Group whose own rect is touched', () => {
    const group = node('g', 0, 0, { kind: 'group', label: 'G', text: undefined, width: 320, height: 200 });
    const result = marqueeSelection([group], [], { x: 300, y: 190, width: 50, height: 50 });
    expect(result.nodeIds).toEqual(['g']);
  });

  it('selects a Group when only an overhanging child rect is touched', () => {
    const group = node('g', 0, 0, { kind: 'group', label: 'G', text: undefined, width: 320, height: 200 });
    // Child overhangs the right edge of its Group
    const child = node('c', 300, 40, { parentId: 'g' });
    const result = marqueeSelection([group, child], [], { x: 400, y: 40, width: 30, height: 30 });
    expect(result.nodeIds).toEqual(['g']);
  });

  it('selects a Connection when the rect brushes its curve between untouched Nodes', () => {
    const a = node('a', 0, 76); // right handle at (160, 100)
    const b = node('b', 460, 76); // left handle at (460, 100)
    const c = conn('c1', 'a', 'b');
    const result = marqueeSelection([a, b], [c], { x: 300, y: 90, width: 20, height: 20 });
    expect(result.nodeIds).toEqual([]);
    expect(result.connectionIds).toEqual(['c1']);
  });

  it('selects a routed Connection when the Marquee touches a Reroute Point segment', () => {
    const a = node('a', 0, 76);
    const b = node('b', 460, 76);
    const c = conn('c1', 'a', 'b', { reroutePoints: [{ x: 300, y: 220 }] });
    const result = marqueeSelection([a, b], [c], { x: 292, y: 205, width: 16, height: 16 });

    expect(result.connectionIds).toEqual(['c1']);
  });

  it('selects a Connection via its Text card extent beside the curve', () => {
    const a = node('a', 0, 76); // right handle at (160, 100)
    const b = node('b', 460, 76); // left handle at (460, 100)
    // Text sits near the source end of the curve (t = 0.1); the curve here is
    // a straight line along y = 100, so a probe below it can only hit the card
    const withText = conn('c1', 'a', 'b', { text: textFromString('label'), textPosition: 0.1 });
    const bare = conn('c2', 'a', 'b', { sourceHandle: 'right', targetHandle: 'left' });
    const probe: Rect = { x: 200, y: 108, width: 12, height: 12 };
    expect(marqueeSelection([a, b], [withText], probe).connectionIds).toEqual(['c1']);
    // The same probe misses a Text-less Connection: no card, curve untouched
    expect(marqueeSelection([a, b], [bare], probe).connectionIds).toEqual([]);
  });

  it('leaves a Connection unselected when the rect misses curve and card', () => {
    const a = node('a', 0, 76);
    const b = node('b', 460, 76);
    const c = conn('c1', 'a', 'b');
    const result = marqueeSelection([a, b], [c], { x: 300, y: 200, width: 20, height: 20 });
    expect(result.connectionIds).toEqual([]);
  });

  it('selects an orthogonal Connection by its mid-split vertical leg', () => {
    // Handles (160,100) → (460,200): orthogonal mid-splits at x = 310, so a
    // probe over the vertical leg hits while the free curve passes below it.
    const a = node('a', 0, 76);
    const b = node('b', 460, 176);
    const probe: Rect = { x: 300, y: 160, width: 20, height: 30 };
    expect(marqueeSelection([a, b], [conn('c1', 'a', 'b', { routeStyle: 'orthogonal' })], probe).connectionIds)
      .toEqual(['c1']);
    expect(marqueeSelection([a, b], [conn('c2', 'a', 'b')], probe).connectionIds).toEqual([]);
  });
});
