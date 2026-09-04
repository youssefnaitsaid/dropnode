// Outline (spec issue #66): pure row-building, counting, and filtering over
// Graph State. Position- and size-free by construction — rows derive from
// identity, kind, membership, plain names, and Emoji only, so per-frame drag
// writes never invalidate them (see outlineStructureKey).

import { GraphNode } from './node';
import { Connection } from './connection';
import { textToPlainString } from './text';

export type OutlineRowKind = 'group' | 'node' | 'text-block';

export interface OutlineRow {
  id: string;
  kind: OutlineRowKind;
  /** Plain-text name: Group Label or flattened Text with newlines as spaces. */
  name: string;
  /** Curated Emoji glyph, kept beside the name and never matched by the filter. */
  emoji?: string;
  /** Owning Group id for child rows; absent for top-level rows. */
  parentId?: string;
  /** Number of children for Group rows. */
  childCount?: number;
  inCount: number;
  outCount: number;
}

/** Display name of a Node: the Group Label for Groups, flattened Text otherwise. */
export function outlineName(n: GraphNode): string {
  const raw = n.kind === 'group' ? (n.label ?? '') : textToPlainString(n.text ?? []);
  return raw.replace(/\n/g, ' ');
}

function rowKind(n: GraphNode): OutlineRowKind {
  return n.kind === 'group' ? 'group' : n.kind === 'annotation' ? 'text-block' : 'node';
}

/** Build Outline rows: Groups with children first, then loose Nodes, then Text Blocks. */
export function buildOutlineRows(
  nodes: readonly GraphNode[],
  connections: readonly Connection[],
): OutlineRow[] {
  const inCount = new Map<string, number>();
  const outCount = new Map<string, number>();
  for (const c of connections) {
    outCount.set(c.sourceNodeId, (outCount.get(c.sourceNodeId) ?? 0) + 1);
    inCount.set(c.targetNodeId, (inCount.get(c.targetNodeId) ?? 0) + 1);
  }
  const groupIds = new Set(nodes.filter(n => n.kind === 'group').map(g => g.id));
  const childrenOf = new Map<string, GraphNode[]>();
  for (const n of nodes) {
    if (n.parentId && groupIds.has(n.parentId)) {
      const kids = childrenOf.get(n.parentId) ?? [];
      kids.push(n);
      childrenOf.set(n.parentId, kids);
    }
  }
  const claimed = new Set<string>();
  for (const kids of childrenOf.values()) for (const k of kids) claimed.add(k.id);

  const rows: OutlineRow[] = [];
  for (const g of nodes) {
    if (g.kind !== 'group') continue;
    const kids = childrenOf.get(g.id) ?? [];
    let groupIn = 0;
    let groupOut = 0;
    for (const c of connections) {
      if (c.targetNodeId === g.id || kids.some(k => k.id === c.targetNodeId)) groupIn++;
      if (c.sourceNodeId === g.id || kids.some(k => k.id === c.sourceNodeId)) groupOut++;
    }
    rows.push({
      id: g.id, kind: 'group', name: outlineName(g),
      childCount: kids.length, inCount: groupIn, outCount: groupOut,
    });
    for (const k of kids) {
      rows.push({
        id: k.id, kind: rowKind(k), name: outlineName(k),
        emoji: k.emoji, parentId: g.id,
        inCount: inCount.get(k.id) ?? 0, outCount: outCount.get(k.id) ?? 0,
      });
    }
  }
  for (const n of nodes) {
    if (n.kind === 'group' || n.kind === 'annotation' || claimed.has(n.id)) continue;
    rows.push({
      id: n.id, kind: 'node', name: outlineName(n), emoji: n.emoji,
      inCount: inCount.get(n.id) ?? 0, outCount: outCount.get(n.id) ?? 0,
    });
  }
  for (const n of nodes) {
    if (n.kind !== 'annotation' || claimed.has(n.id)) continue;
    rows.push({
      id: n.id, kind: 'text-block', name: outlineName(n), emoji: n.emoji,
      inCount: 0, outCount: 0,
    });
  }
  return rows;
}

/**
 * Narrow rows by a case-insensitive substring over plain names. Blank queries
 * return the input unchanged. A Group survives when itself or any child
 * matches — a matching Group keeps all children, otherwise only matching
 * children are kept.
 */
export function filterOutlineRows(rows: readonly OutlineRow[], query: string): OutlineRow[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return rows as OutlineRow[];
  const childrenOf = new Map<string, OutlineRow[]>();
  for (const r of rows) {
    if (!r.parentId) continue;
    const kids = childrenOf.get(r.parentId) ?? [];
    kids.push(r);
    childrenOf.set(r.parentId, kids);
  }
  const visible: OutlineRow[] = [];
  for (const r of rows) {
    if (r.parentId) continue;
    if (r.kind === 'group') {
      const kids = childrenOf.get(r.id) ?? [];
      if (r.name.toLocaleLowerCase().includes(needle)) {
        visible.push(r, ...kids);
      } else {
        const matching = kids.filter(k => k.name.toLocaleLowerCase().includes(needle));
        if (matching.length > 0) visible.push(r, ...matching);
      }
      continue;
    }
    if (r.name.toLocaleLowerCase().includes(needle)) visible.push(r);
  }
  return visible;
}

/**
 * Identity of the Outline's inputs: ids, kinds, membership, plain names,
 * Emoji, and Connection endpoints. Position, size, and all other styling are
 * excluded so drag frames share one key.
 */
export function outlineStructureKey(
  nodes: readonly GraphNode[],
  connections: readonly Connection[],
): string {
  return JSON.stringify([
    nodes.map(n => [n.id, n.kind ?? '', n.parentId ?? '', outlineName(n), n.emoji ?? '']),
    connections.map(c => [c.id, c.sourceNodeId, c.targetNodeId]),
  ]);
}
