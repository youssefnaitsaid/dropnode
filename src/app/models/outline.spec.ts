import { describe, it, expect } from 'vitest';
import { textFromString } from './text';
import { buildOutlineRows, filterOutlineRows, outlineStructureKey } from './outline';
import type { GraphNode } from './node';
import type { Connection } from './connection';

function node(id: string, text: string, extra?: Partial<GraphNode>): GraphNode {
  return { id, text: textFromString(text), x: 0, y: 0, width: 160, height: 48, ...extra };
}

function group(id: string, label: string, extra?: Partial<GraphNode>): GraphNode {
  return { id, kind: 'group', label, x: 0, y: 0, width: 320, height: 200, ...extra };
}

function conn(id: string, sourceNodeId: string, targetNodeId: string): Connection {
  return { id, sourceNodeId, sourceHandle: 'right', targetNodeId, targetHandle: 'left' };
}

describe('Outline model', () => {
  it('builds no rows for an empty graph', () => {
    expect(buildOutlineRows([], [])).toEqual([]);
  });

  it('orders Groups with children first, then loose Nodes, then Text Blocks', () => {
    const nodes = [
      node('n1', 'Loose'),
      node('t1', 'Doc', { kind: 'annotation' }),
      node('c1', 'Child', { parentId: 'g1' }),
      group('g1', 'Flow'),
    ];
    const ids = buildOutlineRows(nodes, []).map(r => r.id);
    expect(ids).toEqual(['g1', 'c1', 'n1', 't1']);
  });

  it('keeps nodes-array order within each section', () => {
    const nodes = [
      node('n2', 'Second'),
      node('n1', 'First'),
      group('g2', 'B'),
      group('g1', 'A'),
      node('c2', 'Y', { parentId: 'g1' }),
      node('c1', 'X', { parentId: 'g1' }),
    ];
    const ids = buildOutlineRows(nodes, []).map(r => r.id);
    expect(ids).toEqual(['g2', 'g1', 'c2', 'c1', 'n2', 'n1']);
  });

  it('marks Text Blocks with the text-block kind', () => {
    const rows = buildOutlineRows([node('t1', 'Doc', { kind: 'annotation' })], []);
    expect(rows[0].kind).toBe('text-block');
  });

  it('flattens Node Text newlines to spaces and keeps Emoji out of the name', () => {
    const rows = buildOutlineRows(
      [node('n1', 'Hello\nWorld', { emoji: '✅' })],
      [],
    );
    expect(rows[0].name).toBe('Hello World');
    expect(rows[0].emoji).toBe('✅');
  });

  it('uses the Group Label as the row name', () => {
    const rows = buildOutlineRows([group('g1', 'Checkout flow')], []);
    expect(rows[0]).toMatchObject({ kind: 'group', name: 'Checkout flow', childCount: 0 });
  });

  it('counts per-Node in and out Connections', () => {
    const nodes = [node('a', 'A'), node('b', 'B'), node('c', 'C')];
    const connections = [conn('c1', 'a', 'b'), conn('c2', 'a', 'b'), conn('c3', 'b', 'c')];
    const byId = new Map(buildOutlineRows(nodes, connections).map(r => [r.id, r]));
    expect(byId.get('a')).toMatchObject({ inCount: 0, outCount: 2 });
    expect(byId.get('b')).toMatchObject({ inCount: 2, outCount: 1 });
    expect(byId.get('c')).toMatchObject({ inCount: 1, outCount: 0 });
  });

  it('reports zero counts for Text Blocks', () => {
    const rows = buildOutlineRows([node('t1', 'Doc', { kind: 'annotation' })], []);
    expect(rows[0]).toMatchObject({ inCount: 0, outCount: 0 });
  });

  it('aggregates Group counts over the Group and its children', () => {
    const nodes = [
      group('g1', 'Flow'),
      node('c1', 'Child', { parentId: 'g1' }),
      node('o1', 'Outside'),
      node('o2', 'Other'),
    ];
    const connections = [
      conn('c1', 'o1', 'c1'),
      conn('c2', 'c1', 'o2'),
      conn('c3', 'o2', 'g1'),
    ];
    const byId = new Map(buildOutlineRows(nodes, connections).map(r => [r.id, r]));
    expect(byId.get('g1')).toMatchObject({ inCount: 2, outCount: 1, childCount: 1 });
  });

  it('returns all rows for a blank filter query', () => {
    const rows = buildOutlineRows([node('n1', 'Todo')], []);
    expect(filterOutlineRows(rows, '')).toBe(rows);
    expect(filterOutlineRows(rows, '   ')).toBe(rows);
  });

  it('matches names as a case-insensitive substring', () => {
    const rows = buildOutlineRows([node('n1', 'Checkout redesign'), node('n2', 'Other')], []);
    expect(filterOutlineRows(rows, 'checkout').map(r => r.id)).toEqual(['n1']);
  });

  it('never matches Emoji content', () => {
    const rows = buildOutlineRows([node('n1', 'Todo', { emoji: '✅' })], []);
    expect(filterOutlineRows(rows, '✅')).toEqual([]);
  });

  it('keeps a matching Group with all of its children', () => {
    const rows = buildOutlineRows(
      [group('g1', 'Checkout flow'), node('c1', 'Unrelated', { parentId: 'g1' })],
      [],
    );
    expect(filterOutlineRows(rows, 'checkout').map(r => r.id)).toEqual(['g1', 'c1']);
  });

  it('keeps a matching child with its Group but hides other children', () => {
    const rows = buildOutlineRows(
      [
        group('g1', 'Flow'),
        node('c1', 'Checkout step', { parentId: 'g1' }),
        node('c2', 'Unrelated', { parentId: 'g1' }),
      ],
      [],
    );
    expect(filterOutlineRows(rows, 'checkout').map(r => r.id)).toEqual(['g1', 'c1']);
  });

  it('hides loose rows that do not match', () => {
    const rows = buildOutlineRows(
      [node('n1', 'Checkout'), node('n2', 'Elsewhere'), node('t1', 'Notes', { kind: 'annotation' })],
      [],
    );
    expect(filterOutlineRows(rows, 'checkout').map(r => r.id)).toEqual(['n1']);
  });

  it('keeps the structure key stable across position and size writes', () => {
    const nodes = [group('g1', 'Flow'), node('n1', 'Todo')];
    const moved = nodes.map(n => ({ ...n, x: n.x + 37, y: n.y - 12, width: 200, height: 90 }));
    expect(outlineStructureKey(moved, [])).toBe(outlineStructureKey(nodes, []));
  });

  it('changes the structure key on renames, Emoji, membership, and Connections', () => {
    const nodes = [group('g1', 'Flow'), node('n1', 'Todo')];
    const base = outlineStructureKey(nodes, []);
    expect(outlineStructureKey([group('g1', 'Renamed'), nodes[1]], [])).not.toBe(base);
    expect(outlineStructureKey([nodes[0], node('n1', 'Todo', { emoji: '✅' })], [])).not.toBe(base);
    expect(outlineStructureKey([nodes[0], node('n1', 'Todo', { parentId: 'g1' })], [])).not.toBe(base);
    expect(outlineStructureKey(nodes, [conn('c1', 'n1', 'n1')])).not.toBe(base);
  });
});
