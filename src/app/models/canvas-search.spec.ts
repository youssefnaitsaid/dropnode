import { describe, it, expect } from 'vitest';
import { textFromString } from './text';
import { searchCanvas } from './canvas-search';
import type { GraphNode } from './node';
import type { Connection } from './connection';

function node(id: string, text: string, extra?: Partial<GraphNode>): GraphNode {
  return { id, text: textFromString(text), x: 0, y: 0, width: 160, height: 48, ...extra };
}

function conn(
  id: string,
  sourceNodeId: string,
  targetNodeId: string,
  extra?: Partial<Connection>,
): Connection {
  return { id, sourceNodeId, sourceHandle: 'right', targetNodeId, targetHandle: 'left', ...extra };
}

const EMPTY = { nodes: [], connections: [], pins: [], pinsHidden: false } as const;

describe('Canvas Search model', () => {
  it('returns no hits for an empty or blank query', () => {
    const scope = { ...EMPTY, nodes: [node('n1', 'Todo')] };
    expect(searchCanvas('', scope)).toEqual([]);
    expect(searchCanvas('   ', scope)).toEqual([]);
  });

  it('matches regular Node Text as a case-insensitive substring', () => {
    const scope = { ...EMPTY, nodes: [node('n1', 'Checkout redesign'), node('n2', 'Other')] };
    const hits = searchCanvas('checkout', scope);
    expect(hits.map(h => h.id)).toEqual(['n1']);
    expect(hits[0].kind).toBe('node');
  });

  it('includes Text Block Text with a text-block kind', () => {
    const scope = { ...EMPTY, nodes: [node('t1', 'Parked doc idea', { kind: 'annotation' })] };
    const hits = searchCanvas('parked', scope);
    expect(hits.map(h => h.id)).toEqual(['t1']);
    expect(hits[0].kind).toBe('text-block');
  });

  it('matches Group Labels with a group kind', () => {
    const scope = {
      ...EMPTY,
      nodes: [{ id: 'g1', kind: 'group', label: 'Checkout flow', x: 0, y: 0, width: 400, height: 300 } as GraphNode],
    };
    const hits = searchCanvas('checkout', scope);
    expect(hits.map(h => h.id)).toEqual(['g1']);
    expect(hits[0].kind).toBe('group');
    expect(hits[0].snippet).toBe('Checkout flow');
  });

  it('matches Connection Text and names both endpoints as context', () => {
    const scope = {
      ...EMPTY,
      nodes: [node('a', 'Cart'), node('b', 'Checkout')],
      connections: [conn('c1', 'a', 'b', { text: textFromString('depends on') })],
    };
    const hits = searchCanvas('depends', scope);
    expect(hits.map(h => h.id)).toEqual(['c1']);
    expect(hits[0].kind).toBe('connection');
    expect(hits[0].context).toBe('Cart → Checkout');
  });

  it('skips Connections without Text', () => {
    const scope = {
      ...EMPTY,
      nodes: [node('a', 'Cart'), node('b', 'Checkout')],
      connections: [conn('c1', 'a', 'b')],
    };
    expect(searchCanvas('cart', scope).map(h => h.id)).toEqual(['a']);
  });

  it('matches Pin messages and skips them while Pins are hidden', () => {
    const pin = { id: 'p1', anchor: { kind: 'canvas', x: 1, y: 2 } as const, message: 'Fix me' };
    const scope = { ...EMPTY, pins: [pin] };
    const hits = searchCanvas('fix', scope);
    expect(hits.map(h => h.id)).toEqual(['p1']);
    expect(hits[0].kind).toBe('pin');
    expect(searchCanvas('fix', { ...scope, pinsHidden: true })).toEqual([]);
  });

  it('strips Formatting and matches link visible text, never URLs', () => {
    const scope = {
      ...EMPTY,
      nodes: [{
        id: 'n1', x: 0, y: 0, width: 160, height: 48,
        text: [{ kind: 'paragraph', runs: [
          { text: 'Ship ', bold: true },
          { text: 'it', link: 'https://example.com/ship-it-now' },
        ] }],
      } as unknown as GraphNode],
    };
    expect(searchCanvas('ship it', scope).map(h => h.id)).toEqual(['n1']);
    expect(searchCanvas('example.com', scope)).toEqual([]);
  });

  it('never hits empty or whitespace-only Text', () => {
    const scope = {
      ...EMPTY,
      nodes: [node('n1', '   '), node('n2', 'Real')],
    };
    expect(searchCanvas('real', scope).map(h => h.id)).toEqual(['n2']);
    expect(searchCanvas('   ', scope)).toEqual([]);
  });

  it('keeps graph order: Nodes, then Connections, then Pins', () => {
    const scope = {
      ...EMPTY,
      nodes: [node('b-node', 'alpha'), node('a-node', 'alpha')],
      connections: [conn('c1', 'b-node', 'a-node', { text: textFromString('alpha link') })],
      pins: [{ id: 'p1', anchor: { kind: 'canvas', x: 0, y: 0 } as const, message: 'alpha note' }],
    };
    expect(searchCanvas('alpha', scope).map(h => h.id)).toEqual(['b-node', 'a-node', 'c1', 'p1']);
  });

  it('names the owner Group for a child hit and the owner Node for a Node-anchored Pin', () => {
    const scope = {
      ...EMPTY,
      nodes: [
        { id: 'g', kind: 'group', label: 'Onboarding', x: 0, y: 0, width: 400, height: 300 } as GraphNode,
        node('child', 'Welcome copy', { parentId: 'g' }),
        node('owner', 'Billing settings'),
      ],
      pins: [{ id: 'p1', anchor: { kind: 'node', nodeId: 'owner', offsetX: 4, offsetY: 4 } as const, message: 'verify copy' }],
    };
    expect(searchCanvas('welcome', scope)[0].context).toBe('Onboarding');
    expect(searchCanvas('verify', scope)[0].context).toBe('Billing settings');
  });

  it('centers long snippets on the first match with ellipsis and a corrected offset', () => {
    const long = `start ${'x'.repeat(100)} middle-word ${'y'.repeat(100)} end`;
    const scope = { ...EMPTY, nodes: [node('n1', long)] };
    const [hit] = searchCanvas('middle-word', scope);
    expect(hit.snippet.length).toBeLessThanOrEqual(81);
    expect(hit.snippet).toContain('middle-word');
    expect(hit.snippet.startsWith('…')).toBe(true);
    expect(hit.snippet.endsWith('…')).toBe(true);
    expect(hit.snippet.slice(hit.matchStart, hit.matchStart + hit.matchLength)).toBe('middle-word');
  });
});
