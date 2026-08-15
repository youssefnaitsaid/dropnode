import { Injectable, inject, signal, computed } from '@angular/core';
import { GraphNode } from '../models/node';
import { Connection } from '../models/connection';
import { GraphService } from './graph.service';
import { HistoryService } from './history.service';
import { CompoundCommand, DeleteNodeCommand, DeleteConnectionCommand, InsertElementsCommand } from './commands';
import { Command } from '../models/command';

// A captured Selection: the top-level roots (Nodes and Groups) whose copies
// re-form the Selection after a paste, plus every rider (Group children and
// internal Connections).
interface ClipboardEntry {
  nodes: GraphNode[];
  connections: Connection[];
  rootIds: string[];
}

// Duplicate stagger and repeat-paste cascade step, in canvas units
const DUPLICATE_OFFSET = 24;

/**
 * The Clipboard (ADR-0011): an in-memory, single-entry, session-scoped
 * holding area for the most recently Cut or Copied Selection of Nodes and
 * Groups (ADR-0015). Duplicate lives here too but never reads or writes the
 * Clipboard entry.
 */
@Injectable({ providedIn: 'root' })
export class ClipboardService {
  private graphService = inject(GraphService);
  private historyService = inject(HistoryService);

  private entry = signal<ClipboardEntry | null>(null);

  readonly canPaste = computed(() => this.entry() !== null);

  // Last known cursor position (raw, cheap to store on every mousemove) and
  // the repeat-paste cascade: unchanged anchor → +24,+24 per repeat. The
  // Canvas registers a resolver converting the raw point to canvas
  // coordinates lazily at paste time, keeping mousemove reflow-free.
  private cursorX = 0;
  private cursorY = 0;
  private hasCursorPosition = false;
  private cursorResolver: ((point: { x: number; y: number }) => { x: number; y: number } | null) | null = null;
  private lastPasteAnchor: { x: number; y: number } | null = null;
  private cascadeCount = 0;

  // A pending Alt+drag duplicate, created transiently and committed on drop
  private spawned: {
    nodes: GraphNode[]; connections: Connection[]; rootIds: string[]; sourceIds: string[];
    baseConnections: Connection[];
  } | null = null;

  /**
   * Capture a Selection of Nodes and Groups — each Group with its children,
   * plus Connections whose BOTH endpoints are inside the captured set (a
   * dangling selected Connection is silently dropped) — onto the Clipboard.
   * No graph mutation, nothing on History.
   */
  copy(nodeIds: string | readonly string[]): void {
    const captured = this.capture(toArray(nodeIds));
    if (captured) this.entry.set(captured);
  }

  /**
   * Capture like copy, then remove the captured set — plus every Connection
   * touching any member and every explicitly selected Connection — as one
   * compound undo step. Unlike Delete, cutting a Group removes its children
   * instead of releasing them.
   */
  cut(nodeIds: string | readonly string[], connectionIds: readonly string[] = []): void {
    const roots = toArray(nodeIds);
    const captured = this.capture(roots);
    if (!captured) return;
    this.entry.set(captured);

    // Explicitly selected Connections first (a dangler is deleted even though
    // it isn't copied); then per root: children first, then the root — each
    // DeleteNodeCommand captures its own cascaded Connections, and
    // reverse-order undo restores a Group before its children re-claim their
    // parentId.
    const parts: Command[] = connectionIds.map(
      id => new DeleteConnectionCommand(this.graphService, id),
    );
    const childIds = new Set(captured.nodes.map(n => n.id));
    for (const rootId of captured.rootIds) childIds.delete(rootId);
    for (const rootId of captured.rootIds) {
      for (const node of captured.nodes) {
        if (node.parentId === rootId && childIds.has(node.id)) {
          parts.push(new DeleteNodeCommand(this.graphService, node.id));
        }
      }
      parts.push(new DeleteNodeCommand(this.graphService, rootId));
    }
    this.historyService.execute(new CompoundCommand('Cut', parts));
  }

  /**
   * Paste the Clipboard entry centered on a canvas point (the Context Menu
   * path). With a parentGroupId, pasted regular top-level nodes become
   * children of that Group; a pasted Group always lands parentless.
   */
  pasteAt(x: number, y: number, parentGroupId?: string): void {
    const entry = this.entry();
    if (!entry) return;

    const materialized = this.materialize(entry, { parentGroupId });
    const bounds = this.boundsOf(materialized.nodes);
    const dx = x - (bounds.minX + bounds.maxX) / 2;
    const dy = y - (bounds.minY + bounds.maxY) / 2;
    for (const node of materialized.nodes) {
      node.x += dx;
      node.y += dy;
    }
    translateConnections(materialized.connections, dx, dy);

    this.historyService.execute(new InsertElementsCommand(
      this.graphService, 'Paste', materialized.nodes, materialized.connections,
    ));
  }

  /** The Canvas pushes the raw cursor position here on every mousemove. */
  setCursorPosition(x: number, y: number): void {
    this.cursorX = x;
    this.cursorY = y;
    this.hasCursorPosition = true;
  }

  /** Converts the raw cursor point to canvas coordinates at paste time. */
  registerCursorResolver(
    resolver: (point: { x: number; y: number }) => { x: number; y: number } | null,
  ): void {
    this.cursorResolver = resolver;
  }

  /**
   * Ctrl+V: paste centered on the tracked cursor position. Repeated pastes
   * at an unchanged cursor cascade by +24,+24 so copies never stack
   * invisibly. Canvas paste — parent references are stripped.
   */
  pasteAtCursor(fallbackPoint?: { x: number; y: number }): void {
    if (!this.entry()) return;

    const useFallback = !this.hasCursorPosition && fallbackPoint !== undefined;
    const cursorX = useFallback ? fallbackPoint.x : this.cursorX;
    const cursorY = useFallback ? fallbackPoint.y : this.cursorY;

    const anchor = this.lastPasteAnchor;
    if (anchor && anchor.x === cursorX && anchor.y === cursorY) {
      this.cascadeCount++;
    } else {
      this.cascadeCount = 0;
      this.lastPasteAnchor = { x: cursorX, y: cursorY };
    }
    const raw = { x: cursorX, y: cursorY };
    const point = this.cursorResolver ? this.cursorResolver(raw) : raw;
    if (!point) return;
    const offset = this.cascadeCount * DUPLICATE_OFFSET;
    this.pasteAt(point.x + offset, point.y + offset);
  }

  /**
   * Duplicate: an immediate copy of the Selection at +24,+24, each root
   * keeping its original parentId (a sibling), selected, one undo step.
   * Never reads or writes the Clipboard.
   */
  duplicate(nodeIds: string | readonly string[]): void {
    const materialized = this.materializeLiveCopy(toArray(nodeIds), DUPLICATE_OFFSET, DUPLICATE_OFFSET);
    if (!materialized) return;
    this.historyService.execute(new InsertElementsCommand(
      this.graphService, 'Duplicate', materialized.nodes, materialized.connections,
    ));
  }

  /**
   * Alt+drag start: spawn a copy of the whole Selection at the source
   * position and select the copies — the drag then moves them transiently.
   * Nothing on History until commitSpawnedDuplicate records the drop.
   */
  spawnDuplicate(
    nodeIds: string | readonly string[],
    grabbedId?: string,
  ): { primaryId: string; rootIds: string[]; isGroup: boolean } | null {
    const sourceIds = toArray(nodeIds);
    const materialized = this.materializeLiveCopy(sourceIds, 0, 0);
    if (!materialized) return null;

    this.spawned = {
      nodes: materialized.nodes,
      connections: materialized.connections,
      rootIds: materialized.rootIds,
      sourceIds,
      baseConnections: structuredClone(materialized.connections),
    };
    this.graphService.nodes.update(nodes => [...nodes, ...materialized.nodes]);
    if (materialized.connections.length > 0) {
      this.graphService.connections.update(conns => [...conns, ...materialized.connections]);
    }
    this.graphService.setSelection(materialized.rootIds, []);

    const primaryId = materialized.idMap.get(grabbedId ?? sourceIds[0]) ?? materialized.rootIds[0];
    const isGroup = materialized.nodes.find(n => n.id === primaryId)?.kind === 'group';
    return { primaryId, rootIds: materialized.rootIds, isGroup };
  }

  /** Keep absolute Reroute Points attached to an Alt+drag duplicate while the
   * copied graph fragment is moved transiently by the Canvas. */
  moveSpawnedDuplicate(dx: number, dy: number): void {
    const spawned = this.spawned;
    if (!spawned) return;
    const baseById = new Map(spawned.baseConnections.map(conn => [conn.id, conn]));
    this.graphService.connections.update(conns => conns.map(conn => {
      const base = baseById.get(conn.id);
      if (!base) return conn;
      if (!base.reroutePoints) {
        const { reroutePoints: _removed, ...rest } = conn;
        return rest;
      }
      return {
        ...conn,
        reroutePoints: base.reroutePoints.map(point => ({
          x: point.x + dx,
          y: point.y + dy,
        })),
      };
    }));
  }

  /**
   * Alt+drag drop: snapshot the spawned elements as they now stand (position
   * and membership included) into one InsertElementsCommand, pushed without
   * re-executing — mirroring how moves are recorded.
   */
  commitSpawnedDuplicate(): void {
    const spawned = this.spawned;
    this.spawned = null;
    if (!spawned) return;

    const nodeIds = new Set(spawned.nodes.map(n => n.id));
    const connIds = new Set(spawned.connections.map(c => c.id));
    const nodes = this.graphService.nodes().filter(n => nodeIds.has(n.id));
    const connections = this.graphService.connections().filter(c => connIds.has(c.id));
    this.historyService.pushWithoutExecute(new InsertElementsCommand(
      this.graphService, 'Duplicate', nodes, connections,
    ));
  }

  /**
   * Alt+drag abort (no movement): remove the spawn and restore the source
   * selection — an aborted gesture behaves like a plain click. History
   * untouched.
   */
  cancelSpawnedDuplicate(): void {
    const spawned = this.spawned;
    this.spawned = null;
    if (!spawned) return;

    const nodeIds = new Set(spawned.nodes.map(n => n.id));
    const connIds = new Set(spawned.connections.map(c => c.id));
    this.graphService.nodes.update(nodes => nodes.filter(n => !nodeIds.has(n.id)));
    this.graphService.connections.update(conns => conns.filter(c => !connIds.has(c.id)));
    if (spawned.rootIds.some(id => this.graphService.isNodeSelected(id))) {
      this.graphService.setSelection(spawned.sourceIds, []);
    }
  }

  // Capture the live Selection (not the Clipboard) and materialize a copy
  // offset by dx/dy; each root keeps its live parentId (sibling semantics).
  private materializeLiveCopy(
    nodeIds: readonly string[],
    dx: number,
    dy: number,
  ): { nodes: GraphNode[]; connections: Connection[]; rootIds: string[]; idMap: Map<string, string> } | null {
    const captured = this.capture(nodeIds);
    if (!captured) return null;

    const materialized = this.materialize(captured, { preserveOutsideParents: true });
    for (const node of materialized.nodes) {
      node.x += dx;
      node.y += dy;
    }
    translateConnections(materialized.connections, dx, dy);
    return materialized;
  }

  // Deep-cloned capture of the Selection roots: each Group brings its
  // children, and only Connections with BOTH endpoints inside the captured
  // set travel (danglers are dropped). A root whose own Group is also a root
  // is folded into that Group (group-as-unit).
  private capture(nodeIds: readonly string[]): ClipboardEntry | null {
    const byId = new Map(this.graphService.nodes().map(n => [n.id, n]));
    const rootSet = new Set(nodeIds.filter(id => byId.has(id)));
    const roots = [...rootSet]
      .map(id => byId.get(id)!)
      .filter(n => !(n.parentId && rootSet.has(n.parentId)));
    if (roots.length === 0) return null;

    const nodes: GraphNode[] = [];
    for (const root of roots) {
      nodes.push(root);
      if (root.kind === 'group') {
        // A child listed alongside its own Group was folded out of roots
        // above, so bringing every child here can't duplicate it
        nodes.push(...this.graphService.childrenOf(root.id));
      }
    }
    const ids = new Set(nodes.map(n => n.id));
    const connections = this.graphService.connections().filter(
      c => ids.has(c.sourceNodeId) && ids.has(c.targetNodeId),
    );

    return structuredClone({ nodes, connections, rootIds: roots.map(r => r.id) });
  }

  // Fresh ids for every element, internal references remapped; parentId is
  // remapped when its Group is in the set, else kept (Duplicate's sibling
  // semantics), replaced by parentGroupId (Group paste-target), or stripped
  // (Canvas paste).
  private materialize(
    entry: ClipboardEntry,
    opts: { parentGroupId?: string; preserveOutsideParents?: boolean } = {},
  ): { nodes: GraphNode[]; connections: Connection[]; rootIds: string[]; idMap: Map<string, string> } {
    const cloned: ClipboardEntry = structuredClone(entry);
    const idMap = new Map<string, string>();
    for (const node of cloned.nodes) {
      idMap.set(node.id, this.graphService.generateNodeId());
    }

    const nodes = cloned.nodes.map(node => {
      const { parentId, ...rest } = node;
      const remapped: GraphNode = { ...rest, id: idMap.get(node.id)! };
      if (parentId && idMap.has(parentId)) {
        remapped.parentId = idMap.get(parentId);
      } else if (parentId && opts.preserveOutsideParents) {
        remapped.parentId = parentId;
      } else if (opts.parentGroupId && remapped.kind !== 'group') {
        remapped.parentId = opts.parentGroupId;
      }
      return remapped;
    });

    const connections = cloned.connections.map(conn => ({
      ...conn,
      id: this.graphService.generateConnectionId(),
      sourceNodeId: idMap.get(conn.sourceNodeId)!,
      targetNodeId: idMap.get(conn.targetNodeId)!,
    }));

    return {
      nodes,
      connections,
      rootIds: entry.rootIds.map(id => idMap.get(id)!),
      idMap,
    };
  }

  private boundsOf(nodes: GraphNode[]): { minX: number; minY: number; maxX: number; maxY: number } {
    return {
      minX: Math.min(...nodes.map(n => n.x)),
      minY: Math.min(...nodes.map(n => n.y)),
      maxX: Math.max(...nodes.map(n => n.x + n.width)),
      maxY: Math.max(...nodes.map(n => n.y + n.height)),
    };
  }
}

function toArray(nodeIds: string | readonly string[]): string[] {
  return typeof nodeIds === 'string' ? [nodeIds] : [...nodeIds];
}

function translateConnections(connections: Connection[], dx: number, dy: number): void {
  for (const connection of connections) {
    if (!connection.reroutePoints) continue;
    connection.reroutePoints = connection.reroutePoints.map(point => ({
      x: point.x + dx,
      y: point.y + dy,
    }));
  }
}
