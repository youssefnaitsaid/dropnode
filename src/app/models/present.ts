import { GraphNode } from './node';
import { Connection } from './connection';
import { ViewportState } from './viewport-state';

// One Step transition's duration. The tour's feel lives here, not in the
// rAF ticker that consumes it.
export const PRESENT_TRANSITION_MS = 500;

// The two Present Mode orders: positional reading order (the default) and
// Connection-following order (a directed walk from a start Group).
export type PresentOrder = 'reading' | 'connection-following';

/**
 * The ordered Steps of a Present Mode tour: every Group (childless ones
 * included), in reading order of its top-left corner — y first, x as
 * tiebreak. Exact ties keep nodes-array order (sort is stable), matching the
 * Tidy-up determinism convention. Order is purely positional — reordering
 * Steps means moving Groups (ADR-0020). Loose Nodes are never Steps.
 */
export function presentSteps(nodes: readonly GraphNode[]): GraphNode[] {
  return nodes
    .filter(n => n.kind === 'group')
    .sort((a, b) => a.y - b.y || a.x - b.x);
}

/**
 * The ordered Steps of a Present Mode walk in Connection-following order:
 * a depth-first pre-order from the start Group over outgoing Group-level
 * Connections (child endpoints resolve to their parent Group; loose-Node
 * endpoints resolve to nothing), successors in reading order, first visit
 * wins, then every still-unvisited Group appended in reading order — so the
 * result is always a permutation of all Groups. Zero storage: purely derived.
 */
export function connectionFollowingSteps(
  nodes: readonly GraphNode[],
  connections: readonly Connection[],
  startGroupId?: string | null,
): GraphNode[] {
  const reading = presentSteps(nodes);
  if (reading.length === 0) return [];
  const byId = new Map(nodes.map(n => [n.id, n]));
  const groupIds = new Set(reading.map(g => g.id));
  const resolveToGroup = (id: string): string | null => {
    const node = byId.get(id);
    if (!node) return null;
    if (node.kind === 'group') return node.id;
    if (node.parentId && groupIds.has(node.parentId)) return node.parentId;
    return null;
  };
  const adjacency = new Map<string, Set<string>>();
  for (const conn of connections) {
    const from = resolveToGroup(conn.sourceNodeId);
    const to = resolveToGroup(conn.targetNodeId);
    if (!from || !to || from === to) continue;
    let successors = adjacency.get(from);
    if (!successors) {
      successors = new Set<string>();
      adjacency.set(from, successors);
    }
    successors.add(to);
  }
  const orderIndex = new Map(reading.map((g, index) => [g.id, index]));
  const start = startGroupId && groupIds.has(startGroupId) ? startGroupId : reading[0].id;
  const visited = new Set<string>([start]);
  const stack: string[] = [start];
  const walk: string[] = [];
  while (stack.length > 0) {
    const current = stack.pop()!;
    walk.push(current);
    const successors = [...(adjacency.get(current) ?? [])]
      .filter(id => !visited.has(id))
      .sort((a, b) => orderIndex.get(a)! - orderIndex.get(b)!);
    for (let i = successors.length - 1; i >= 0; i--) {
      visited.add(successors[i]);
      stack.push(successors[i]);
    }
  }
  for (const group of reading) {
    if (!visited.has(group.id)) {
      visited.add(group.id);
      walk.push(group.id);
    }
  }
  return walk.map(id => byId.get(id)!);
}

/**
 * The camera position at progress `t` (clamped to [0,1]) of a Step
 * transition: pan and zoom eased together with a symmetric cubic
 * ease-in-out. Simultaneous easing is the accepted v1 camera path — a
 * van Wijk-style zoom-out-then-in upgrade would slot in here, behind the
 * same signature, without touching the ticker.
 */
export function interpolateViewport(
  from: ViewportState,
  to: ViewportState,
  t: number,
): ViewportState {
  const clamped = Math.min(Math.max(t, 0), 1);
  const e = easeInOutCubic(clamped);
  return {
    panX: from.panX + (to.panX - from.panX) * e,
    panY: from.panY + (to.panY - from.panY) * e,
    zoom: from.zoom + (to.zoom - from.zoom) * e,
  };
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(2 - 2 * t, 3) / 2;
}
