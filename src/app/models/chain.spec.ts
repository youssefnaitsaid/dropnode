import { describe, it, expect } from 'vitest';
import { GraphNode } from './node';
import { Connection } from './connection';
import { textFromString } from './text';
import { chainOf, chainConnectionDirection } from './chain';

function node(id: string, extra: Partial<GraphNode> = {}): GraphNode {
  return { id, text: textFromString(id), x: 0, y: 0, width: 160, height: 48, ...extra };
}

function group(id: string, extra: Partial<GraphNode> = {}): GraphNode {
  return { id, label: id, x: 0, y: 0, width: 320, height: 200, kind: 'group', ...extra };
}

function conn(id: string, sourceNodeId: string, targetNodeId: string, extra: Partial<Connection> = {}): Connection {
  return { id, sourceNodeId, sourceHandle: 'right', targetNodeId, targetHandle: 'left', ...extra };
}

describe('chainOf', () => {
  it('returns empty when hovered id is null', () => {
    const nodes = [node('a'), node('b')];
    const connections = [conn('c1', 'a', 'b')];
    const result = chainOf(null, nodes, connections);
    expect(result.empty).toBe(true);
    expect(result.nodeIds.size).toBe(0);
    expect(result.connectionIds.size).toBe(0);
  });

  it('returns empty when hovered element has no Connections (isolated)', () => {
    const nodes = [node('a'), node('b'), node('c')];
    const connections = [conn('c1', 'a', 'b')];
    const result = chainOf('c', nodes, connections);
    expect(result.empty).toBe(true);
    expect(result.nodeIds.size).toBe(0);
    expect(result.connectionIds.size).toBe(0);
  });

  it('returns empty for a Text Block hover: docs own no Connections and never light', () => {
    const nodes = [node('a'), node('b'), node('t', { kind: 'annotation' })];
    const connections = [conn('c1', 'a', 'b')];
    const result = chainOf('t', nodes, connections);
    expect(result.empty).toBe(true);
    expect(result.nodeIds.size).toBe(0);
    expect(result.connectionIds.size).toBe(0);
  });

  it('returns empty when graph has no Connections at all', () => {
    const nodes = [node('a'), node('b')];
    const result = chainOf('a', nodes, []);
    expect(result.empty).toBe(true);
  });

  it('returns empty when hovered id does not exist', () => {
    const nodes = [node('a'), node('b')];
    const connections = [conn('c1', 'a', 'b')];
    expect(chainOf('missing', nodes, connections).empty).toBe(true);
  });

  it('lights linear chain A -> B -> C', () => {
    const nodes = [node('a'), node('b'), node('c')];
    const connections = [conn('c1', 'a', 'b'), conn('c2', 'b', 'c')];
    const result = chainOf('b', nodes, connections);
    expect(result.empty).toBe(false);
    expect(result.nodeIds).toEqual(new Set(['a', 'b', 'c']));
    expect(result.connectionIds).toEqual(new Set(['c1', 'c2']));
  });

  it('hovering any member of same component yields identical chain', () => {
    const nodes = [node('a'), node('b'), node('c')];
    const connections = [conn('c1', 'a', 'b'), conn('c2', 'b', 'c')];
    const fromA = chainOf('a', nodes, connections);
    const fromC = chainOf('c', nodes, connections);
    expect(fromA.nodeIds).toEqual(fromC.nodeIds);
    expect(fromA.connectionIds).toEqual(fromC.connectionIds);
  });

  it('follows Connections both directions ignoring direction (undirected)', () => {
    // A -> B <- C (B has incoming from both)
    const nodes = [node('a'), node('b'), node('c')];
    const connections = [conn('c1', 'a', 'b'), conn('c2', 'c', 'b')];
    const result = chainOf('a', nodes, connections);
    // Should reach C via B despite edge directions
    expect(result.nodeIds).toEqual(new Set(['a', 'b', 'c']));
    expect(result.connectionIds).toEqual(new Set(['c1', 'c2']));
  });

  it('lights branching chain B -> C, B -> D', () => {
    const nodes = [node('a'), node('b'), node('c'), node('d')];
    const connections = [conn('c1', 'a', 'b'), conn('c2', 'b', 'c'), conn('c3', 'b', 'd')];
    const result = chainOf('b', nodes, connections);
    expect(result.nodeIds).toEqual(new Set(['a', 'b', 'c', 'd']));
    expect(result.connectionIds).toEqual(new Set(['c1', 'c2', 'c3']));
  });

  it('does not include disconnected component', () => {
    const nodes = [node('a'), node('b'), node('c'), node('d')];
    const connections = [conn('c1', 'a', 'b'), conn('c2', 'c', 'd')];
    const result = chainOf('a', nodes, connections);
    expect(result.nodeIds).toEqual(new Set(['a', 'b']));
    expect(result.connectionIds).toEqual(new Set(['c1']));
  });

  it('handles diamond: A->B, A->C, B->D, C->D', () => {
    const nodes = [node('a'), node('b'), node('c'), node('d')];
    const connections = [
      conn('c1', 'a', 'b'),
      conn('c2', 'a', 'c'),
      conn('c3', 'b', 'd'),
      conn('c4', 'c', 'd'),
    ];
    const result = chainOf('a', nodes, connections);
    expect(result.nodeIds).toEqual(new Set(['a', 'b', 'c', 'd']));
    expect(result.connectionIds).toEqual(new Set(['c1', 'c2', 'c3', 'c4']));
  });

  it('handles cycle A->B->C->A', () => {
    const nodes = [node('a'), node('b'), node('c')];
    const connections = [conn('c1', 'a', 'b'), conn('c2', 'b', 'c'), conn('c3', 'c', 'a')];
    const result = chainOf('b', nodes, connections);
    expect(result.nodeIds).toEqual(new Set(['a', 'b', 'c']));
    expect(result.connectionIds).toEqual(new Set(['c1', 'c2', 'c3']));
  });

  it('handles merges: two parents into one child, traversal is undirected', () => {
    const nodes = [node('a'), node('b'), node('c')];
    const connections = [conn('c1', 'a', 'c'), conn('c2', 'b', 'c')];
    const result = chainOf('a', nodes, connections);
    expect(result.nodeIds).toEqual(new Set(['a', 'b', 'c']));
  });

  it('Group orthogonal: lit Group does not pull its children', () => {
    const g = group('g');
    const n1 = node('n1', { parentId: 'g' });
    const n2 = node('n2', { parentId: 'g' });
    const x = node('x');
    const nodes = [g, n1, n2, x];
    const connections = [conn('c1', 'g', 'x')];
    const result = chainOf('x', nodes, connections);
    expect(result.nodeIds).toEqual(new Set(['g', 'x']));
    expect(result.nodeIds.has('n1')).toBe(false);
    expect(result.nodeIds.has('n2')).toBe(false);
  });

  it('Group orthogonal: lit child does not pull its parent Group', () => {
    const g = group('g');
    const child = node('child', { parentId: 'g' });
    const other = node('other');
    const nodes = [g, child, other];
    const connections = [conn('c1', 'child', 'other')];
    const result = chainOf('child', nodes, connections);
    expect(result.nodeIds).toEqual(new Set(['child', 'other']));
    expect(result.nodeIds.has('g')).toBe(false);
  });

  it('Group itself can be connected and lit', () => {
    const g = group('g');
    const a = node('a');
    const b = node('b');
    const nodes = [g, a, b];
    const connections = [conn('c1', 'a', 'g'), conn('c2', 'g', 'b')];
    const result = chainOf('g', nodes, connections);
    expect(result.nodeIds).toEqual(new Set(['a', 'g', 'b']));
    expect(result.connectionIds).toEqual(new Set(['c1', 'c2']));
  });

  it('isolated child inside connected Group yields empty', () => {
    const g = group('g');
    const child = node('child', { parentId: 'g' });
    const other = node('other');
    const nodes = [g, child, other];
    const connections = [conn('c1', 'g', 'other')];
    const result = chainOf('child', nodes, connections);
    expect(result.empty).toBe(true);
  });

  it('handles long linear chain without stack overflow (200 nodes)', () => {
    const count = 200;
    const nodes = Array.from({ length: count }, (_, i) => node(`n${i}`));
    const connections = Array.from({ length: count - 1 }, (_, i) => conn(`c${i}`, `n${i}`, `n${i + 1}`));
    const result = chainOf('n100', nodes, connections);
    expect(result.nodeIds.size).toBe(count);
    expect(result.connectionIds.size).toBe(count - 1);
  });
});

describe('chainConnectionDirection', () => {
  it('forward: start none, end arrow (default)', () => {
    const c = conn('c1', 'a', 'b', { startArrowhead: 'none', endArrowhead: 'arrow' });
    expect(chainConnectionDirection(c)).toBe('forward');
  });

  it('forward: default arrowheads (absent fields) => start none, end arrow', () => {
    const c = conn('c1', 'a', 'b');
    expect(chainConnectionDirection(c)).toBe('forward');
  });

  it('reverse: start arrow, end none', () => {
    const c = conn('c1', 'a', 'b', { startArrowhead: 'arrow', endArrowhead: 'none' });
    expect(chainConnectionDirection(c)).toBe('reverse');
  });

  it('reverse: start triangle, end none', () => {
    const c = conn('c1', 'a', 'b', { startArrowhead: 'triangle', endArrowhead: 'none' });
    expect(chainConnectionDirection(c)).toBe('reverse');
  });

  it('both: both ends have arrow', () => {
    const c = conn('c1', 'a', 'b', { startArrowhead: 'arrow', endArrowhead: 'arrow' });
    expect(chainConnectionDirection(c)).toBe('both');
  });

  it('both: both triangle', () => {
    const c = conn('c1', 'a', 'b', { startArrowhead: 'triangle', endArrowhead: 'triangle' });
    expect(chainConnectionDirection(c)).toBe('both');
  });

  it('both: mixed arrow/triangle both present', () => {
    const c = conn('c1', 'a', 'b', { startArrowhead: 'arrow', endArrowhead: 'triangle' });
    expect(chainConnectionDirection(c)).toBe('both');
  });

  it('both: none + none', () => {
    const c = conn('c1', 'a', 'b', { startArrowhead: 'none', endArrowhead: 'none' });
    expect(chainConnectionDirection(c)).toBe('both');
  });

  it('triangle behaves like arrow (presence only)', () => {
    const c1 = conn('c1', 'a', 'b', { startArrowhead: 'none', endArrowhead: 'triangle' });
    expect(chainConnectionDirection(c1)).toBe('forward');
    const c2 = conn('c2', 'a', 'b', { startArrowhead: 'triangle', endArrowhead: 'none' });
    expect(chainConnectionDirection(c2)).toBe('reverse');
  });
});
