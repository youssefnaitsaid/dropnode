import { describe, it, expect } from 'vitest';
import { presentSteps, connectionFollowingSteps, interpolateViewport } from './present';
import { GraphNode } from './node';
import { Connection } from './connection';
import { ViewportState } from './viewport-state';

function group(id: string, x: number, y: number): GraphNode {
  return { id, label: id, x, y, width: 320, height: 200, kind: 'group' };
}

function conn(id: string, sourceNodeId: string, targetNodeId: string): Connection {
  return { id, sourceNodeId, sourceHandle: 'right', targetNodeId, targetHandle: 'left' };
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

describe('connectionFollowingSteps', () => {
  it('follows outgoing Connections from the start instead of reading order', () => {
    const nodes = [group('a', 0, 0), group('b', 500, 0), group('c', 0, 500)];
    const connections = [conn('e1', 'a', 'c'), conn('e2', 'c', 'b')];
    expect(connectionFollowingSteps(nodes, connections, 'a').map(g => g.id)).toEqual(['a', 'c', 'b']);
  });

  it('visits branches in reading order of the successor Groups', () => {
    const nodes = [group('a', 0, 0), group('b', 500, 0), group('c', 0, 500)];
    const connections = [conn('e1', 'a', 'c'), conn('e2', 'a', 'b')];
    expect(connectionFollowingSteps(nodes, connections, 'a').map(g => g.id)).toEqual(['a', 'b', 'c']);
  });

  it('walks depth-first: a child chain under the first branch comes before the second branch', () => {
    const nodes = [group('a', 0, 0), group('b', 500, 0), group('c', 0, 500), group('d', 500, 500)];
    const connections = [conn('e1', 'a', 'b'), conn('e2', 'a', 'c'), conn('e3', 'b', 'd')];
    expect(connectionFollowingSteps(nodes, connections, 'a').map(g => g.id)).toEqual(['a', 'b', 'd', 'c']);
  });

  it('visits a merge successor once', () => {
    const nodes = [group('a', 0, 0), group('b', 500, 0), group('c', 0, 500), group('d', 500, 500)];
    const connections = [conn('e1', 'a', 'b'), conn('e2', 'a', 'c'), conn('e3', 'b', 'd'), conn('e4', 'c', 'd')];
    expect(connectionFollowingSteps(nodes, connections, 'a').map(g => g.id)).toEqual(['a', 'b', 'd', 'c']);
  });

  it('terminates on cycles and visits each Group once', () => {
    const nodes = [group('a', 0, 0), group('b', 500, 0), group('c', 0, 500)];
    const connections = [conn('e1', 'a', 'b'), conn('e2', 'b', 'c'), conn('e3', 'c', 'a')];
    expect(connectionFollowingSteps(nodes, connections, 'a').map(g => g.id)).toEqual(['a', 'b', 'c']);
  });

  it('skips the backward visit of a directed 2-cycle', () => {
    const nodes = [group('a', 0, 0), group('b', 500, 0)];
    const connections = [conn('e1', 'a', 'b'), conn('e2', 'b', 'a')];
    expect(connectionFollowingSteps(nodes, connections, 'a').map(g => g.id)).toEqual(['a', 'b']);
  });

  it('promotes child endpoints to their parent Group', () => {
    const nodes = [
      group('a', 0, 0),
      group('b', 500, 0),
      node('a1', 10, 10, 'a'),
      node('b1', 510, 10, 'b'),
    ];
    expect(connectionFollowingSteps(nodes, [conn('e1', 'a1', 'b1')], 'a').map(g => g.id)).toEqual(['a', 'b']);
  });

  it('counts Group-to-child and child-to-Group Connections as Group edges', () => {
    const nodes = [
      group('a', 0, 0),
      group('b', 500, 0),
      group('c', 0, 500),
      node('b1', 510, 10, 'b'),
      node('c1', 10, 510, 'c'),
    ];
    const connections = [conn('e1', 'a', 'b1'), conn('e2', 'c1', 'a')];
    // a -> b via the child; c -> a is incoming to the start so c stays unreachable-appended
    expect(connectionFollowingSteps(nodes, connections, 'a').map(g => g.id)).toEqual(['a', 'b', 'c']);
  });

  it('ignores Connections internal to one Group', () => {
    const nodes = [group('a', 0, 0), group('b', 500, 0), node('a1', 10, 10, 'a'), node('a2', 60, 10, 'a')];
    const connections = [conn('e1', 'a1', 'a2'), conn('e2', 'a', 'b')];
    expect(connectionFollowingSteps(nodes, connections, 'a').map(g => g.id)).toEqual(['a', 'b']);
  });

  it('does not bridge through loose Nodes', () => {
    const nodes = [group('a', 0, 0), group('c', 500, 0), group('b', 0, 500), node('loose', 250, 250)];
    const connections = [conn('e1', 'a', 'loose'), conn('e2', 'loose', 'b')];
    // Bridging would reach b directly (a, b, c); without bridging b is unreachable-appended (a, c, b)
    expect(connectionFollowingSteps(nodes, connections, 'a').map(g => g.id)).toEqual(['a', 'c', 'b']);
  });

  it('counts duplicate Connections between one pair once', () => {
    const nodes = [group('a', 0, 0), group('b', 500, 0)];
    const connections = [conn('e1', 'a', 'b'), conn('e2', 'a', 'b')];
    expect(connectionFollowingSteps(nodes, connections, 'a').map(g => g.id)).toEqual(['a', 'b']);
  });

  it('appends Groups unreachable from the start in reading order', () => {
    const nodes = [group('a', 0, 0), group('b', 500, 0), group('c', 0, 500), group('island', 500, 500)];
    const connections = [conn('e1', 'a', 'b')];
    expect(connectionFollowingSteps(nodes, connections, 'a').map(g => g.id)).toEqual(['a', 'b', 'c', 'island']);
  });

  it('ignores incoming Connections to the start for reachability', () => {
    const nodes = [group('a', 500, 500), group('b', 0, 0)];
    const connections = [conn('e1', 'b', 'a')];
    // Start at a: b is upstream, so the walk is just the start plus reading-order rest
    expect(connectionFollowingSteps(nodes, connections, 'a').map(g => g.id)).toEqual(['a', 'b']);
  });

  it('falls back to the reading-order first Group for a missing start', () => {
    const nodes = [group('a', 0, 0), group('b', 500, 0)];
    const connections = [conn('e1', 'a', 'b')];
    expect(connectionFollowingSteps(nodes, connections, 'nope').map(g => g.id)).toEqual(['a', 'b']);
    expect(connectionFollowingSteps(nodes, connections).map(g => g.id)).toEqual(['a', 'b']);
  });

  it('returns every Group with zero Group edges as start plus reading-order rest', () => {
    const nodes = [group('a', 0, 0), group('b', 500, 0), group('c', 0, 500)];
    expect(connectionFollowingSteps(nodes, [], 'c').map(g => g.id)).toEqual(['c', 'a', 'b']);
  });

  it('returns an empty list when there are no Groups', () => {
    expect(connectionFollowingSteps([node('n1', 0, 0)], [], 'n1')).toEqual([]);
  });

  it('does not mutate its inputs', () => {
    const nodes = [group('b', 500, 0), group('a', 0, 0)];
    const connections = [conn('e1', 'a', 'b')];
    connectionFollowingSteps(nodes, connections, 'a');
    expect(nodes.map(n => n.id)).toEqual(['b', 'a']);
    expect(connections.map(c => c.id)).toEqual(['e1']);
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
