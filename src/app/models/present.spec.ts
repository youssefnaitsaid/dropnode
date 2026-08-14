import { describe, it, expect } from 'vitest';
import { presentSteps, interpolateViewport } from './present';
import { GraphNode } from './node';
import { ViewportState } from './viewport-state';

function group(id: string, x: number, y: number): GraphNode {
  return { id, label: id, x, y, width: 320, height: 200, kind: 'group' };
}

function node(id: string, x: number, y: number, parentId?: string): GraphNode {
  return { id, x, y, width: 160, height: 48, parentId };
}

describe('presentSteps', () => {
  it('returns only Groups — loose Nodes are never Steps', () => {
    const nodes = [node('n1', 0, 0), group('g1', 100, 100), node('n2', 500, 500)];
    expect(presentSteps(nodes).map(g => g.id)).toEqual(['g1']);
  });

  it('returns an empty list for a graph with no Groups', () => {
    expect(presentSteps([node('n1', 0, 0), node('n2', 50, 50)])).toEqual([]);
  });

  it('orders Steps in reading order: top-left corner, y before x', () => {
    const nodes = [
      group('bottom', 0, 500),
      group('top-right', 400, 0),
      group('top-left', 0, 0),
    ];
    expect(presentSteps(nodes).map(g => g.id)).toEqual(['top-left', 'top-right', 'bottom']);
  });

  it('breaks a y tie by x — strict comparison, no row-banding', () => {
    // 2px vertical offset decides before x does (deliberately strict, ADR-0020)
    const nodes = [group('right-higher', 900, 98), group('left-lower', 0, 100)];
    expect(presentSteps(nodes).map(g => g.id)).toEqual(['right-higher', 'left-lower']);
  });

  it('breaks an exact position tie by nodes-array order', () => {
    const nodes = [group('second', 100, 100), group('first', 100, 100)];
    expect(presentSteps(nodes).map(g => g.id)).toEqual(['second', 'first']);
  });

  it('includes childless Groups as Steps', () => {
    const nodes = [group('empty', 0, 0), group('full', 0, 300), node('child', 20, 320, 'full')];
    expect(presentSteps(nodes).map(g => g.id)).toEqual(['empty', 'full']);
  });

  it('does not mutate the input array', () => {
    const nodes = [group('b', 0, 100), group('a', 0, 0)];
    presentSteps(nodes);
    expect(nodes.map(g => g.id)).toEqual(['b', 'a']);
  });
});

describe('interpolateViewport', () => {
  const from: ViewportState = { panX: 0, panY: 200, zoom: 1 };
  const to: ViewportState = { panX: 100, panY: -200, zoom: 2 };

  it('returns the exact start at t=0 and the exact destination at t=1', () => {
    expect(interpolateViewport(from, to, 0)).toEqual(from);
    expect(interpolateViewport(from, to, 1)).toEqual(to);
  });

  it('sits at the exact midpoint at t=0.5 (ease-in-out is symmetric)', () => {
    expect(interpolateViewport(from, to, 0.5)).toEqual({ panX: 50, panY: 0, zoom: 1.5 });
  });

  it('eases in: a quarter of the time covers far less than a quarter of the way', () => {
    // Cubic ease-in-out worked example: eased(0.25) = 4(0.25)^3 = 0.0625
    const vp = interpolateViewport(from, to, 0.25);
    expect(vp.panX).toBeCloseTo(6.25, 10);
    expect(vp.panY).toBeCloseTo(200 - 25, 10);
    expect(vp.zoom).toBeCloseTo(1.0625, 10);
  });

  it('eases out symmetrically: eased(0.75) mirrors eased(0.25)', () => {
    // 1 - (2 - 2*0.75)^3 / 2 = 0.9375
    expect(interpolateViewport(from, to, 0.75).panX).toBeCloseTo(93.75, 10);
  });

  it('progresses monotonically as t grows', () => {
    let last = interpolateViewport(from, to, 0);
    for (const t of [0.1, 0.3, 0.5, 0.7, 0.9, 1]) {
      const cur = interpolateViewport(from, to, t);
      expect(cur.panX).toBeGreaterThan(last.panX);
      expect(cur.panY).toBeLessThan(last.panY);
      expect(cur.zoom).toBeGreaterThan(last.zoom);
      last = cur;
    }
  });

  it('clamps t outside [0,1] to the endpoints', () => {
    expect(interpolateViewport(from, to, -0.5)).toEqual(from);
    expect(interpolateViewport(from, to, 1.5)).toEqual(to);
  });
});
