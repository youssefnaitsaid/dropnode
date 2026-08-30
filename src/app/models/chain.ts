import { GraphNode } from './node';
import { Connection, effectiveArrowhead } from './connection';

export type ChainDirection = 'forward' | 'reverse' | 'both';

export interface ChainSets {
  nodeIds: Set<string>;
  connectionIds: Set<string>;
  empty: boolean;
}

/**
 * The weakly-connected component containing the hovered element.
 * Follows every Connection in both directions ignoring direction.
 * Returns empty when hovered has no Connections or does not exist.
 */
export function chainOf(
  startNodeId: string | null,
  nodes: readonly GraphNode[],
  connections: readonly Connection[],
): ChainSets {
  if (!startNodeId) return { nodeIds: new Set(), connectionIds: new Set(), empty: true };

  const nodeSet = new Set(nodes.map((n) => n.id));
  if (!nodeSet.has(startNodeId)) return { nodeIds: new Set(), connectionIds: new Set(), empty: true };

  // Quick check: does start have any incident connection?
  const hasIncident = connections.some(
    (c) => c.sourceNodeId === startNodeId || c.targetNodeId === startNodeId,
  );
  if (!hasIncident) return { nodeIds: new Set(), connectionIds: new Set(), empty: true };

  // Build adjacency: nodeId -> connections incident
  const adj = new Map<string, Connection[]>();
  for (const c of connections) {
    if (!adj.has(c.sourceNodeId)) adj.set(c.sourceNodeId, []);
    if (!adj.has(c.targetNodeId)) adj.set(c.targetNodeId, []);
    adj.get(c.sourceNodeId)!.push(c);
    adj.get(c.targetNodeId)!.push(c);
  }

  const visitedNodes = new Set<string>();
  const visitedConns = new Set<string>();
  const queue: string[] = [startNodeId];
  visitedNodes.add(startNodeId);

  while (queue.length > 0) {
    const cur = queue.shift()!;
    const incident = adj.get(cur) ?? [];
    for (const conn of incident) {
      if (!visitedConns.has(conn.id)) {
        visitedConns.add(conn.id);
        const other = conn.sourceNodeId === cur ? conn.targetNodeId : conn.sourceNodeId;
        if (!visitedNodes.has(other)) {
          visitedNodes.add(other);
          queue.push(other);
        } else {
          // Already visited node may still have unvisited edges; ensure the other side's adjacency is explored
          // But BFS already visits nodes once; edges from already visited nodes are considered when that node was visited.
          // However, if other was visited earlier via different path, its edges are already queued/processed.
          // Need to ensure we don't miss connections between two already-visited nodes via current cur?
          // VisitedConns handles it: we added conn above.
          // But the other node's other connections are already covered when that node was dequeued.
        }
      }
      // Also need to consider that visitedNodes might have been visited but not all its incident connections have been processed
      // if it was visited via a different route but not yet dequeued? Our loop processes each node's incident list when dequeued.
      // So we are fine.
    }
    // To handle connections between two visited nodes where the other node was already visited before cur was dequeued,
    // we must ensure we don't skip connections where both endpoints already visited but connection itself not yet visited.
    // The above handles it because we check visitedConns.
  }

  // The BFS as written processes incident list per visited node, so any connection between two visited nodes
  // will be visited when either endpoint is dequeued. Since we add conn when processing cur, we will capture it.

  return { nodeIds: visitedNodes, connectionIds: visitedConns, empty: false };
}

/**
 * Direction a lit Connection's traveling light should run, derived from Arrowheads.
 * Only presence matters, not shape (arrow vs triangle).
 */
export function chainConnectionDirection(conn: Connection): ChainDirection {
  const start = effectiveArrowhead(conn, 'start');
  const end = effectiveArrowhead(conn, 'end');
  const startHas = start !== 'none';
  const endHas = end !== 'none';

  if (startHas && !endHas) return 'reverse';
  if (!startHas && endHas) return 'forward';
  return 'both'; // both present or both none
}
