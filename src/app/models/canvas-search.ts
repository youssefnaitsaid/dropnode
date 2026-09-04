// Canvas Search (grilled spec, issue #64): pure match rules over the whole
// Canvas. Case-insensitive substring over plain-text extraction — Formatting
// stripped via textToPlainString, Emoji never inside Text, Group Labels and
// Pin messages matched as-is. Order follows the graph arrays; no scoring.

import { GraphNode } from './node';
import { Connection } from './connection';
import { Pin } from './pin';
import { textToPlainString } from './text';

export type CanvasSearchHitKind = 'node' | 'text-block' | 'connection' | 'group' | 'pin';

export interface CanvasSearchHit {
  kind: CanvasSearchHitKind;
  id: string;
  /** Truncated plain-text window centered on the first match. */
  snippet: string;
  /** Char offset of the match start within snippet, for emphasis. */
  matchStart: number;
  matchLength: number;
  /** Disambiguating context line, or null when the snippet stands alone. */
  context: string | null;
}

export interface CanvasSearchScope {
  nodes: readonly GraphNode[];
  connections: readonly Connection[];
  pins: readonly Pin[];
  pinsHidden: boolean;
}

export function searchCanvas(query: string, scope: CanvasSearchScope): CanvasSearchHit[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [];
  const hits: CanvasSearchHit[] = [];
  const nodeById = new Map(scope.nodes.map(n => [n.id, n]));
  for (const n of scope.nodes) {
    const plain = nodePlain(n);
    if (!plain) continue;
    const at = plain.toLocaleLowerCase().indexOf(needle);
    if (at < 0) continue;
    hits.push({
      kind: n.kind === 'group' ? 'group' : n.kind === 'annotation' ? 'text-block' : 'node',
      id: n.id,
      ...buildSnippet(plain, at, needle.length),
      context: childContext(n, nodeById),
    });
  }
  for (const c of scope.connections) {
    if (!c.text) continue;
    const plain = textToPlainString(c.text).replace(/\n/g, ' ');
    if (!plain) continue;
    const at = plain.toLocaleLowerCase().indexOf(needle);
    if (at < 0) continue;
    hits.push({
      kind: 'connection',
      id: c.id,
      ...buildSnippet(plain, at, needle.length),
      context: endpointContext(c, nodeById),
    });
  }
  if (!scope.pinsHidden) {
    for (const p of scope.pins) {
      const plain = (p.message ?? '').replace(/\n/g, ' ');
      if (!plain.trim()) continue;
      const at = plain.toLocaleLowerCase().indexOf(needle);
      if (at < 0) continue;
      hits.push({
        kind: 'pin',
        id: p.id,
        ...buildSnippet(plain, at, needle.length),
        context: pinContext(p, nodeById),
      });
    }
  }
  return hits;
}

/** Display text of a Node: the Group Label for Groups, Text flattened otherwise. */
function nodePlain(n: GraphNode): string {
  return displayName(n).replace(/\n/g, ' ');
}

/** Owner Group Label for a child hit, so same-word hits tell apart. */
function childContext(
  n: GraphNode,
  nodeById: Map<string, GraphNode>,
): string | null {
  if (!n.parentId) return null;
  const owner = n.parentId ? nodeById.get(n.parentId) : undefined;
  const label = owner?.kind === 'group' ? (owner.label ?? '').trim() : '';
  return label ? label : null;
}

/** `source → target` preview so same-word Connection hits tell apart. */
function endpointContext(
  c: Connection,
  nodeById: Map<string, GraphNode>,
): string | null {
  const source = nodeById.get(c.sourceNodeId);
  const target = nodeById.get(c.targetNodeId);
  const left = source ? displayName(source).trim() || 'Node' : 'Node';
  const right = target ? displayName(target).trim() || 'Node' : 'Node';
  return `${left} → ${right}`;
}

/** Node-anchored Pins name their owner Node; Canvas Pins stand alone. */
function pinContext(p: Pin, nodeById: Map<string, GraphNode>): string | null {
  if (p.anchor.kind !== 'node') return null;
  const owner = nodeById.get(p.anchor.nodeId);
  if (!owner) return null;
  const name = displayName(owner).trim();
  return name ? name : null;
}

/** Group Label for Groups, flattened Text otherwise. */
function displayName(n: GraphNode): string {
  return n.kind === 'group' ? (n.label ?? '') : textToPlainString(n.text ?? []);
}

export const CANVAS_SEARCH_SNIPPET_LENGTH = 80;

export function buildSnippet(
  plain: string,
  matchIndex: number,
  matchLength: number,
): Pick<CanvasSearchHit, 'snippet' | 'matchStart' | 'matchLength'> {
  if (plain.length <= CANVAS_SEARCH_SNIPPET_LENGTH) {
    return { snippet: plain, matchStart: matchIndex, matchLength };
  }
  const half = Math.floor((CANVAS_SEARCH_SNIPPET_LENGTH - matchLength) / 2);
  const rawStart = Math.min(
    Math.max(matchIndex - half, 0),
    plain.length - CANVAS_SEARCH_SNIPPET_LENGTH,
  );
  // Reserve one char per clipped side for the ellipsis, keeping the match
  // fully inside the window.
  const clippedStart = rawStart > 0;
  const innerStart = clippedStart ? rawStart + 1 : rawStart;
  const innerLength = CANVAS_SEARCH_SNIPPET_LENGTH - (clippedStart ? 1 : 0) - 1;
  const inner = plain.slice(innerStart, innerStart + innerLength);
  const clippedEnd = innerStart + innerLength < plain.length;
  const snippet = `${clippedStart ? '…' : ''}${inner}${clippedEnd ? '…' : ''}`;
  return { snippet, matchStart: matchIndex - innerStart + (clippedStart ? 1 : 0), matchLength };
}
