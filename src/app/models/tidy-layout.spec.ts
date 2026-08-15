import { describe, it, expect } from 'vitest';
import { GraphNode } from './node';
import { Connection } from './connection';
import {
  tidyLayout,
  isTidyEmpty,
  applyTidyToState,
  TIDY_LAYER_GAP,
  TIDY_NODE_GAP,
  TIDY_COMPONENT_GAP,
  TIDY_GRID_GAP,
} from './tidy-layout';

// Seam under test (spec #26, ADR-0019): tidyLayout(nodes, connections) →
// TidyResult, the complete Tidy up mutation as data. Assertions cover the
// result shape only — never the pipeline's internal stages.

function node(id: string, x: number, y: number, width = 160, height = 48, extra: Partial<GraphNode> = {}): GraphNode {
  return { id, text: [], x, y, width, height, ...extra };
}

function conn(id: string, sourceNodeId: string, sourceHandle: Connection['sourceHandle'], targetNodeId: string, targetHandle: Connection['targetHandle']): Connection {
  return { id, sourceNodeId, sourceHandle, targetNodeId, targetHandle };
}

describe('tidyLayout', () => {
  it('returns an empty result for an empty graph', () => {
    const result = tidyLayout([], []);

    expect(isTidyEmpty(result)).toBe(true);
    expect(result.nodePositions).toEqual([]);
    expect(result.groupRects).toEqual([]);
    expect(result.handleAssignments).toEqual([]);
  });

  it('lays a linear chain out left-to-right, anchored at the old bounds top-left', () => {
    // Scattered chain a→b→c; old node bounds top-left is (-100, 0)
    const nodes = [
      node('a', 0, 0),
      node('b', 500, 300),
      node('c', -100, 900),
    ];
    const connections = [
      conn('c1', 'a', 'top', 'b', 'top'),
      conn('c2', 'b', 'bottom', 'c', 'top'),
    ];

    const result = tidyLayout(nodes, connections);

    // Three layers on one row: each 160 wide plus the 120 layer gap,
    // anchored so the arrangement's top-left is the old top-left (-100, 0)
    const byId = new Map(result.nodePositions.map(p => [p.id, p]));
    expect(byId.get('a')).toEqual({ id: 'a', x: -100, y: 0 });
    expect(byId.get('b')).toEqual({ id: 'b', x: -100 + 160 + TIDY_LAYER_GAP, y: 0 });
    expect(byId.get('c')).toEqual({ id: 'c', x: -100 + 2 * (160 + TIDY_LAYER_GAP), y: 0 });
  });

  it('tidies a single Node with no Connections to no change', () => {
    const result = tidyLayout([node('only', 50, 60)], []);

    expect(isTidyEmpty(result)).toBe(true);
  });

  it('fans a diamond out and rejoins it without overlapping rects', () => {
    const nodes = [
      node('a', 0, 0),
      node('b', 200, 0),
      node('c', 0, 200),
      node('d', 200, 200),
    ];
    const connections = [
      conn('c1', 'a', 'right', 'b', 'left'),
      conn('c2', 'a', 'right', 'c', 'left'),
      conn('c3', 'b', 'right', 'd', 'left'),
      conn('c4', 'c', 'right', 'd', 'left'),
    ];

    const result = tidyLayout(nodes, connections);

    // Middle layer stacks b over c (array order) with the node gap; a and d
    // center on that stack. Old bounds top-left is (0,0).
    const byId = new Map(result.nodePositions.map(p => [p.id, p]));
    const midStack = 48 + TIDY_NODE_GAP + 48;
    expect(byId.get('a')).toEqual({ id: 'a', x: 0, y: (midStack - 48) / 2 });
    expect(byId.get('b')).toEqual({ id: 'b', x: 160 + TIDY_LAYER_GAP, y: 0 });
    expect(byId.get('c')).toEqual({ id: 'c', x: 160 + TIDY_LAYER_GAP, y: 48 + TIDY_NODE_GAP });
    expect(byId.get('d')).toEqual({ id: 'd', x: 2 * (160 + TIDY_LAYER_GAP), y: (midStack - 48) / 2 });
  });

  it('orders a layer by its neighbors to uncross straight-across Connections', () => {
    // r fans to a and b; a→d and b→c would cross if layer three kept the
    // array order c, d — the ordering sweep flips it so d faces a
    const nodes = [
      node('r', 0, 0),
      node('a', 300, 0),
      node('b', 300, 100),
      node('c', 600, 0),
      node('d', 600, 100),
    ];
    const connections = [
      conn('c1', 'r', 'right', 'a', 'left'),
      conn('c2', 'r', 'right', 'b', 'left'),
      conn('c3', 'a', 'right', 'd', 'left'),
      conn('c4', 'b', 'right', 'c', 'left'),
    ];

    const result = tidyLayout(nodes, connections);

    const byId = new Map(result.nodePositions.map(p => [p.id, p]));
    const y = (id: string) => byId.get(id)?.y ?? nodes.find(n => n.id === id)!.y;
    // a stays above b (array order); the last layer flips: d above c
    expect(y('a')).toBeLessThan(y('b'));
    expect(y('d')).toBeLessThan(y('c'));
  });

  it('lays a cycle out with the back Connection arcing over the top', () => {
    const nodes = [node('a', 0, 0), node('b', 0, 100)];
    const connections = [
      conn('c1', 'a', 'top', 'b', 'top'),
      conn('c2', 'b', 'bottom', 'a', 'bottom'),
    ];

    const result = tidyLayout(nodes, connections);

    const byId = new Map(result.nodePositions.map(p => [p.id, p]));
    expect(byId.get('b')!.x).toBeGreaterThan(byId.get('a')?.x ?? 0);
    // Forward edge flows right; the back edge must NOT mirror it onto the
    // same straight segment — it arcs over the row via top Handles
    const handles = new Map(result.handleAssignments.map(h => [h.id, h]));
    expect(handles.get('c1')).toEqual({ id: 'c1', sourceHandle: 'right', targetHandle: 'left' });
    expect(handles.get('c2')).toEqual({ id: 'c2', sourceHandle: 'top', targetHandle: 'top' });
  });

  it('routes a three-Node cycle so the closing Connection stays visible', () => {
    // The reported bug: n1→n2→n3→n1 — the back edge used to get left/right
    // Handles, a dead-straight line camouflaged under the forward segments
    // and hidden behind n2's card
    const nodes = [node('n1', 0, 0), node('n2', 400, 200), node('n3', 100, 500)];
    const connections = [
      conn('c1', 'n1', 'right', 'n2', 'left'),
      conn('c2', 'n2', 'right', 'n3', 'left'),
      conn('c3', 'n3', 'right', 'n1', 'left'),
    ];

    const result = tidyLayout(nodes, connections);

    const handles = new Map(result.handleAssignments.map(h => [h.id, h]));
    // Forward edges already face — untouched; the back edge arcs over
    expect(handles.get('c1')).toBeUndefined();
    expect(handles.get('c2')).toBeUndefined();
    expect(handles.get('c3')).toEqual({ id: 'c3', sourceHandle: 'top', targetHandle: 'top' });
  });

  it('detours a layer-skipping Connection under the row it would hide behind', () => {
    // a→b→c plus direct a→c: the a→c corridor runs straight through b's
    // card at the shared row center — it detours under via bottom Handles
    const nodes = [node('a', 0, 0), node('b', 300, 0), node('c', 600, 0)];
    const connections = [
      conn('c1', 'a', 'right', 'b', 'left'),
      conn('c2', 'b', 'right', 'c', 'left'),
      conn('c3', 'a', 'right', 'c', 'left'),
    ];

    const result = tidyLayout(nodes, connections);

    expect(result.handleAssignments).toEqual([
      { id: 'c3', sourceHandle: 'bottom', targetHandle: 'bottom' },
    ]);
  });

  it('emits no Handle assignment for a Connection already facing its counterpart', () => {
    const nodes = [node('a', 0, 0), node('b', 500, 0)];
    const connections = [conn('c1', 'a', 'right', 'b', 'left')];

    const result = tidyLayout(nodes, connections);

    expect(result.handleAssignments).toEqual([]);
  });

  it('re-picks Handles vertically when the counterpart sits mostly below or above', () => {
    // An 8-target fan: the target stack (8×48 + 7×40 = 664) towers over the
    // 280-unit layer step, so the extreme targets' centers sit further off
    // the flow axis than along it — their Handles go vertical while a
    // mid-stack target stays right/left
    const nodes = [
      node('s', 0, 0),
      ...Array.from({ length: 8 }, (_, i) => node(`t${i + 1}`, 300, i * 60)),
    ];
    const connections = Array.from({ length: 8 }, (_, i) =>
      conn(`c${i + 1}`, 's', 'right', `t${i + 1}`, 'left'),
    );

    const result = tidyLayout(nodes, connections);

    const handles = new Map(result.handleAssignments.map(h => [h.id, h]));
    // t1 (top of the stack): source center is 308 above — vertical wins
    expect(handles.get('c1')).toEqual({ id: 'c1', sourceHandle: 'top', targetHandle: 'bottom' });
    // t8 (bottom): 308 below — vertical wins the other way
    expect(handles.get('c8')).toEqual({ id: 'c8', sourceHandle: 'bottom', targetHandle: 'top' });
    // t4 (44 above the source center): the 280-unit flow axis dominates,
    // and right/left is already stored — no assignment
    expect(handles.get('c4')).toBeUndefined();
  });

  it('contracts a Group to one unit, tidies its children inside, and sizes it to exact fit', () => {
    const nodes = [
      node('g', 0, 0, 320, 200, { kind: 'group', label: 'G', text: undefined }),
      node('x', 30, 30, 160, 48, { parentId: 'g' }),
      node('y', 30, 120, 160, 48, { parentId: 'g' }),
      node('out', 600, 0),
    ];
    const connections = [
      conn('ci', 'x', 'right', 'y', 'left'), // intra-group
      conn('ce', 'y', 'right', 'out', 'left'), // promoted to g→out
    ];

    const result = tidyLayout(nodes, connections);

    // Children chain inside below the 28-unit label strip: x at the content
    // origin (16 in, 28+16 down), y one layer right; the Group shrinks to
    // exactly their bounds + 16 padding, plus the strip's headroom on top
    expect(result.groupRects).toEqual([
      { id: 'g', x: 0, y: 0, width: 160 + TIDY_LAYER_GAP + 160 + 32, height: 28 + 48 + 32 },
    ]);
    const byId = new Map(result.nodePositions.map(p => [p.id, p]));
    expect(byId.get('x')).toEqual({ id: 'x', x: 16, y: 44 });
    expect(byId.get('y')).toEqual({ id: 'y', x: 16 + 160 + TIDY_LAYER_GAP, y: 44 });
    // The promoted edge lays out g→out left-to-right: out sits one layer
    // right of the Group's 472-unit width, centered on its 108-unit height
    expect(byId.get('out')).toEqual({ id: 'out', x: 472 + TIDY_LAYER_GAP, y: (108 - 48) / 2 });
    // Every Connection already faces its counterpart — nothing re-picked
    expect(result.handleAssignments).toEqual([]);
  });

  it('stacks components largest-first and corrals Connection-less Nodes into a grid', () => {
    const nodes = [
      node('a', 0, 0),
      node('b', 300, 300),
      node('g', 900, 900, 320, 200, { kind: 'group', label: 'G', text: undefined }),
      node('l1', 50, 500),
      node('l2', 700, 100),
    ];
    const connections = [conn('c1', 'a', 'right', 'b', 'left')];

    const result = tidyLayout(nodes, connections);

    // The childless, Connection-less Group is a component of one unit — it
    // keeps its size and stacks FIRST (area 64000 beats the a→b chain's),
    // never joining the loner grid
    expect(result.groupRects).toEqual([{ id: 'g', x: 0, y: 0, width: 320, height: 200 }]);
    const byId = new Map(result.nodePositions.map(p => [p.id, p]));
    // a→b chain lands below the Group plus the component gap
    const chainY = 200 + TIDY_COMPONENT_GAP;
    expect(byId.get('a')).toEqual({ id: 'a', x: 0, y: chainY });
    expect(byId.get('b')).toEqual({ id: 'b', x: 160 + TIDY_LAYER_GAP, y: chainY });
    // Loners grid in array order after the last component, 40-unit gutters
    const gridY = chainY + 48 + TIDY_COMPONENT_GAP;
    expect(byId.get('l1')).toEqual({ id: 'l1', x: 0, y: gridY });
    expect(byId.get('l2')).toEqual({ id: 'l2', x: 160 + TIDY_GRID_GAP, y: gridY });
  });

  it('is deterministic: the same Graph State always tidies identically', () => {
    const nodes = [
      node('a', 5, 5),
      node('b', 700, 40),
      node('g', 300, 300, 320, 200, { kind: 'group', label: 'G', text: undefined }),
      node('kid', 330, 330, 160, 48, { parentId: 'g' }),
      node('loner', -200, 800),
    ];
    const connections = [
      conn('c1', 'a', 'top', 'b', 'bottom'),
      conn('c2', 'kid', 'left', 'b', 'right'),
    ];

    expect(tidyLayout(nodes, connections)).toEqual(tidyLayout(nodes, connections));
  });

  it('is idempotent: tidying a tidied graph changes nothing', () => {
    const nodes = [
      node('a', 13, 7),
      node('b', 500, 300, 200, 80),
      node('c', -100, 900),
      node('loner', 400, -50),
    ];
    const connections = [
      conn('c1', 'a', 'top', 'b', 'top'),
      conn('c2', 'b', 'bottom', 'c', 'left'),
      conn('c3', 'c', 'right', 'a', 'bottom'),
    ];

    const first = tidyLayout(nodes, connections);
    expect(isTidyEmpty(first)).toBe(false);

    const applied = applyTidyToState(nodes, connections, first);
    const second = tidyLayout(applied.nodes, applied.connections);

    expect(second).toEqual({ nodePositions: [], groupRects: [], handleAssignments: [] });
  });

  it('preserves absolute Reroute Points while applying Node and Handle changes', () => {
    const nodes = [node('a', 200, 0), node('b', -100, 200)];
    const points = [{ x: 40, y: 80 }, { x: 180, y: 260 }];
    const connections: Connection[] = [{
      ...conn('c1', 'a', 'right', 'b', 'left'),
      reroutePoints: points,
    }];

    const result = tidyLayout(nodes, connections);
    const applied = applyTidyToState(nodes, connections, result);

    expect(applied.connections[0].reroutePoints).toEqual(points);
  });
});
