import { Injectable, signal, computed } from '@angular/core';
import { GraphNode, HandleSide, NODE_PALETTE, isTextBlock } from '../models/node';
import { NodeShape, isNodeShape, storedNodeShape } from '../models/node-shape';
import { isNodeEmoji } from '../models/node-emoji';
import { Connection, ReroutePoint, MAX_REROUTE_POINTS, ArrowheadType, ArrowheadEnd, ARROWHEAD_TYPES, defaultArrowhead, StrokePattern, StrokeWeight, STROKE_PATTERNS, STROKE_WEIGHTS, DEFAULT_STROKE_PATTERN, DEFAULT_STROKE_WEIGHT, RouteStyle, ROUTE_STYLES, DEFAULT_ROUTE_STYLE, TEXT_POSITION_MIN, TEXT_POSITION_MAX, TEXT_POSITION_DEFAULT } from '../models/connection';
import { GraphState } from '../models/graph-state';
import { ViewportState, ZOOM_MIN, ZOOM_MAX } from '../models/viewport-state';
import { Bounds, unionBounds, contentBounds, connectionBounds, frameViewport } from '../models/bounds';
import { handlePoint } from '../models/curve';
import { Text, textFromString, isTextEmpty, validateText, canonicalizeText } from '../models/text';
import { Pin, PinAnchor, pinAnchorPoint } from '../models/pin';
import { decodeShareParam } from '../models/share-link';

@Injectable({ providedIn: 'root' })
export class GraphService {
  // Padding kept between a Group's edges and its children's bounding box
  static readonly GROUP_CHILD_PADDING = 16;
  // Framing never over-magnifies: fit the whole graph no larger than 1x, a
  // single selection no larger than 2x (both still within the [0.1,5] clamp)
  static readonly FIT_MAX_ZOOM = 1;
  static readonly SELECTION_MAX_ZOOM = 2;

  // Core state signals
  readonly nodes = signal<GraphNode[]>([]);
  readonly connections = signal<Connection[]>([]);
  readonly pins = signal<Pin[]>([]);
  readonly viewportState = signal<ViewportState>({ panX: 0, panY: 0, zoom: 1 });

  // The Selection (ADR-0015): one set freely mixing Nodes and Connections.
  // Transient interaction state — never part of Graph State or exports.
  readonly selectedNodeIds = signal<readonly string[]>([]);
  readonly selectedConnectionIds = signal<readonly string[]>([]);

  // Computed signals
  readonly nodeCount = computed(() => this.nodes().length);
  readonly selectionSize = computed(
    () => this.selectedNodeIds().length + this.selectedConnectionIds().length,
  );
  // Sole-selection views: the id only when exactly one element of that kind
  // is the entire Selection — what grips, inline editors, and single-element
  // affordances key off.
  readonly selectedNodeId = computed(() => {
    const nodeIds = this.selectedNodeIds();
    return nodeIds.length === 1 && this.selectedConnectionIds().length === 0
      ? nodeIds[0]
      : null;
  });
  readonly selectedConnectionId = computed(() => {
    const connIds = this.selectedConnectionIds();
    return connIds.length === 1 && this.selectedNodeIds().length === 0
      ? connIds[0]
      : null;
  });
  readonly selectedNode = computed(() => {
    const id = this.selectedNodeId();
    return id ? this.nodes().find(n => n.id === id) ?? null : null;
  });
  readonly selectedNodes = computed(() => {
    const ids = new Set(this.selectedNodeIds());
    return this.nodes().filter(n => ids.has(n.id));
  });
  readonly selectedConnections = computed(() => {
    const ids = new Set(this.selectedConnectionIds());
    return this.connections().filter(c => ids.has(c.id));
  });

  private idCounter = 0;

  private generateId(prefix: string): string {
    return `${prefix}_${Date.now()}_${++this.idCounter}`;
  }

  // Public id minting for Paste/Duplicate: copies must carry fresh ids in the
  // same node_/conn_ pattern, from the same monotonic session counter
  generateNodeId(): string {
    return this.generateId('node');
  }

  generateConnectionId(): string {
    return this.generateId('conn');
  }

  generatePinId(): string {
    return this.generateId('pin');
  }

  // Node operations
  createNode(text: string, x: number, y: number, width = 160, height = 48): GraphNode {
    const node: GraphNode = {
      id: this.generateId('node'),
      text: textFromString(text),
      x,
      y,
      width,
      height,
    };
    this.nodes.update(nodes => [...nodes, node]);
    return node;
  }

  updateNodePosition(id: string, x: number, y: number): void {
    this.nodes.update(nodes =>
      nodes.map(n => n.id === id ? { ...n, x, y } : n)
    );
  }

  // Text Block operations (ADR-0035): full regular Node minus Handles —
  // required Text, same default size, node_ ids; zero Handles, never connected
  createTextBlock(text: string, x: number, y: number, width = 160, height = 48): GraphNode {
    const block: GraphNode = {
      id: this.generateId('node'),
      text: textFromString(text),
      x,
      y,
      width,
      height,
      kind: 'annotation',
    };
    this.nodes.update(nodes => [...nodes, block]);
    return block;
  }

  // Group operations
  createGroup(label: string, x: number, y: number, width = 320, height = 200): GraphNode {
    const group: GraphNode = {
      id: this.generateId('node'),
      label,
      x,
      y,
      width,
      height,
      kind: 'group',
    };
    this.nodes.update(nodes => [...nodes, group]);
    return group;
  }

  setNodeParent(id: string, parentId: string | null): void {
    const node = this.nodes().find(n => n.id === id);
    if (!node) throw new Error(`Node ${id} not found`);
    if (parentId !== null) {
      if (node.kind === 'group') throw new Error('A Group cannot have a parent');
      const parent = this.nodes().find(n => n.id === parentId);
      if (!parent || parent.kind !== 'group') {
        throw new Error(`Parent ${parentId} is not a Group`);
      }
    }
    this.nodes.update(nodes =>
      nodes.map(n => {
        if (n.id !== id) return n;
        if (parentId === null) {
          const { parentId: _removed, ...rest } = n;
          return rest;
        }
        return { ...n, parentId };
      })
    );
  }

  childrenOf(groupId: string): GraphNode[] {
    return this.nodes().filter(n => n.parentId === groupId);
  }

  // Topmost-rendered Group (later in the array) whose bounds contain the point
  findGroupAt(x: number, y: number, excludeNodeId?: string): GraphNode | null {
    const groups = this.nodes().filter(n =>
      n.kind === 'group' &&
      n.id !== excludeNodeId &&
      x >= n.x && x <= n.x + n.width &&
      y >= n.y && y <= n.y + n.height
    );
    return groups.length > 0 ? groups[groups.length - 1] : null;
  }

  // Rigid move: the Group and all its children shift by the same delta
  moveGroup(id: string, x: number, y: number): void {
    const group = this.nodes().find(n => n.id === id);
    if (!group) return;
    const dx = x - group.x;
    const dy = y - group.y;
    this.nodes.update(nodes =>
      nodes.map(n => {
        if (n.id === id) return { ...n, x, y };
        if (n.parentId === id) return { ...n, x: n.x + dx, y: n.y + dy };
        return n;
      })
    );
  }

  updateNodeSize(id: string, width: number, height: number): void {
    this.nodes.update(nodes =>
      nodes.map(n => n.id === id ? { ...n, width, height } : n)
    );
  }

  // Resize to the requested rect; a Group is clamped so it keeps containing
  // its children plus padding. Returns the applied rect.
  resizeNode(
    id: string,
    rect: { x: number; y: number; width: number; height: number },
  ): { x: number; y: number; width: number; height: number } {
    const node = this.nodes().find(n => n.id === id);
    if (!node) throw new Error(`Node ${id} not found`);

    let { x, y, width, height } = rect;

    if (node.kind === 'group') {
      const children = this.childrenOf(id);
      if (children.length > 0) {
        const pad = GraphService.GROUP_CHILD_PADDING;
        const boundLeft = Math.min(...children.map(c => c.x)) - pad;
        const boundTop = Math.min(...children.map(c => c.y)) - pad;
        const boundRight = Math.max(...children.map(c => c.x + c.width)) + pad;
        const boundBottom = Math.max(...children.map(c => c.y + c.height)) + pad;
        const left = Math.min(x, boundLeft);
        const top = Math.min(y, boundTop);
        const right = Math.max(x + width, boundRight);
        const bottom = Math.max(y + height, boundBottom);
        x = left;
        y = top;
        width = right - left;
        height = bottom - top;
      }
    }

    this.nodes.update(nodes =>
      nodes.map(n => n.id === id ? { ...n, x, y, width, height } : n)
    );
    return { x, y, width, height };
  }

  setNodeColor(id: string, color: string | null): void {
    this.nodes.update(nodes =>
      nodes.map(n => {
        if (n.id !== id) return n;
        if (color === null) {
          const { color: _removed, ...rest } = n;
          return rest;
        }
        return { ...n, color };
      })
    );
  }

  // Shape is a visual property of regular Nodes only. The rectangle is the
  // default and is represented by an absent field, like other optional styles.
  setNodeShape(id: string, shape: NodeShape | null): void {
    const stored = shape === null ? undefined : storedNodeShape(shape);
    this.nodes.update(nodes =>
      nodes.map(n => {
        if (n.id !== id || n.kind === 'group') return n;
        if (stored === undefined) {
          const { shape: _removed, ...rest } = n;
          return rest;
        }
        return { ...n, shape: stored };
      })
    );
  }

  // Emoji is a regular-Node-only mark like Shape (ADR-0030): absent means
  // none, and there is no default to canonicalize. Null removes the field.
  setNodeEmoji(id: string, emoji: string | null): void {
    this.nodes.update(nodes =>
      nodes.map(n => {
        if (n.id !== id || n.kind === 'group') return n;
        if (emoji === null) {
          const { emoji: _removed, ...rest } = n;
          return rest;
        }
        return { ...n, emoji };
      })
    );
  }
  // Group Label only — regular nodes carry Text, set via setNodeText
  updateNodeLabel(id: string, label: string): void {
    this.nodes.update(nodes =>
      nodes.map(n => n.id === id ? { ...n, label } : n)
    );
  }

  setNodeText(id: string, text: Text): void {
    this.nodes.update(nodes =>
      nodes.map(n => n.id === id ? { ...n, text } : n)
    );
  }

  deleteNode(id: string): { node: GraphNode; removedConnections: Connection[]; releasedChildIds: string[]; removedPins: Pin[] } {
    const node = this.nodes().find(n => n.id === id);
    if (!node) throw new Error(`Node ${id} not found`);

    const removedConnections = this.connections().filter(
      c => c.sourceNodeId === id || c.targetNodeId === id
    );
    // Deleting a Group releases its children in place; only Pins anchored to
    // the deleted Node itself cascade away with it
    const releasedChildIds = this.nodes()
      .filter(n => n.parentId === id)
      .map(n => n.id);
    const removedPins = this.pins().filter(
      p => p.anchor.kind === 'node' && p.anchor.nodeId === id
    );
    const removedPinIds = new Set(removedPins.map(p => p.id));

    this.connections.update(conns =>
      conns.filter(c => c.sourceNodeId !== id && c.targetNodeId !== id)
    );
    this.pins.update(pins => pins.filter(p => !removedPinIds.has(p.id)));
    this.nodes.update(nodes =>
      nodes
        .filter(n => n.id !== id)
        .map(n => {
          if (n.parentId !== id) return n;
          const { parentId: _removed, ...rest } = n;
          return rest;
        })
    );

    // Prune the deleted Node and its cascaded Connections from the Selection
    this.selectedNodeIds.update(ids => ids.filter(nodeId => nodeId !== id));
    if (removedConnections.length > 0) {
      const removedIds = new Set(removedConnections.map(c => c.id));
      this.selectedConnectionIds.update(ids => ids.filter(connId => !removedIds.has(connId)));
    }

    return { node, removedConnections, releasedChildIds, removedPins };
  }

  // Connection operations
  createConnection(
    sourceNodeId: string,
    sourceHandle: HandleSide,
    targetNodeId: string,
    targetHandle: HandleSide
  ): Connection | null {
    if (this.connectionViolation(sourceNodeId, sourceHandle, targetNodeId, targetHandle)) return null;

    const connection: Connection = {
      id: this.generateId('conn'),
      sourceNodeId,
      sourceHandle,
      targetNodeId,
      targetHandle,
    };
    this.connections.update(conns => [...conns, connection]);
    return connection;
  }

  /**
   * Why createConnection would refuse a Connection, or null if it would
   * succeed. The single source of truth for the three guards — the keyboard
   * Connection path and the Connect dialog map the violation to user-facing
   * copy instead of re-implementing the rules.
   */
  connectionViolation(
    sourceNodeId: string,
    sourceHandle: HandleSide,
    targetNodeId: string,
    targetHandle: HandleSide
  ): 'self' | 'group-child' | 'duplicate' | 'text-block' | null {
    // Prevent self-connections
    if (sourceNodeId === targetNodeId) return 'self';

    // Text Blocks own zero Handles and can never be connected (ADR-0035)
    const source = this.nodes().find(n => n.id === sourceNodeId);
    const target = this.nodes().find(n => n.id === targetNodeId);
    if ((source && isTextBlock(source)) || (target && isTextBlock(target))) return 'text-block';

    // Prevent connections between a Group and its own children
    if (source?.parentId === targetNodeId || target?.parentId === sourceNodeId) return 'group-child';

    // Prevent duplicate connections
    const exists = this.connections().some(
      c => c.sourceNodeId === sourceNodeId &&
           c.sourceHandle === sourceHandle &&
           c.targetNodeId === targetNodeId &&
           c.targetHandle === targetHandle
    );
    if (exists) return 'duplicate';

    return null;
  }

  deleteConnection(id: string): Connection | undefined {
    const conn = this.connections().find(c => c.id === id);
    if (!conn) return undefined;
    this.connections.update(conns => conns.filter(c => c.id !== id));
    this.selectedConnectionIds.update(ids => ids.filter(connId => connId !== id));
    return conn;
  }

  // Pin operations (ADR-0025). A Pin always carries a non-empty message —
  // createPin refuses anything else (and a missing anchor Node) by returning
  // null, the createConnection precedent for invalid operations.
  createPin(anchor: PinAnchor, message: string): Pin | null {
    if (message.trim() === '') return null;
    if (anchor.kind === 'node' && !this.nodes().some(n => n.id === anchor.nodeId)) return null;
    const pin: Pin = {
      id: this.generateId('pin'),
      anchor: clonePinAnchor(anchor),
      message,
    };
    this.pins.update(pins => [...pins, pin]);
    return pin;
  }

  setPinMessage(id: string, message: string): void {
    this.pins.update(pins => pins.map(p => p.id === id ? { ...p, message } : p));
  }

  setPinAnchor(id: string, anchor: PinAnchor): void {
    this.pins.update(pins => pins.map(p =>
      p.id === id ? { ...p, anchor: clonePinAnchor(anchor) } : p
    ));
  }

  deletePin(id: string): Pin | undefined {
    const pin = this.pins().find(p => p.id === id);
    if (!pin) return undefined;
    this.pins.update(pins => pins.filter(p => p.id !== id));
    return pin;
  }

  // Where a Pin renders: its stored Canvas point, or its Node's top-left plus
  // offset. Null when a Node-anchored Pin lost its Node (only possible
  // transiently — deletion cascades).
  pinPoint(pinId: string): { x: number; y: number } | null {
    const pin = this.pins().find(p => p.id === pinId);
    return pin ? pinAnchorPoint(pin.anchor, this.nodes()) : null;
  }

  // Connection Text: committing null or an empty Text removes the field entirely.
  // The textPosition lives and dies with the Text (ADR-0013), so clearing
  // drops it too.
  setConnectionText(id: string, text: Text | null): void {
    const cleared = text === null || isTextEmpty(text);
    this.connections.update(conns =>
      conns.map(c => {
        if (c.id !== id) return c;
        if (cleared) {
          const { text: _removed, textPosition: _removedPos, ...rest } = c;
          return rest;
        }
        return { ...c, text: text! };
      })
    );
  }

  // Text position along the curve (ADR-0013): clamped to [0.1, 0.9]; the
  // midpoint or null removes the field (absent means midpoint). A position
  // may only exist alongside Text — Text-less Connections are a silent no-op.
  setConnectionTextPosition(id: string, position: number | null): void {
    this.connections.update(conns =>
      conns.map(c => {
        if (c.id !== id || !c.text) return c;
        const clamped = position === null
          ? null
          : Math.min(Math.max(position, TEXT_POSITION_MIN), TEXT_POSITION_MAX);
        if (clamped === null || clamped === TEXT_POSITION_DEFAULT) {
          const { textPosition: _removed, ...rest } = c;
          return rest;
        }
        return { ...c, textPosition: clamped };
      })
    );
  }

  // Reroute Point geometry is stored as one optional ordered array. Invalid
  // transient writes are ignored; import validation is the wholesale rejection
  // boundary for persisted Graph State.
  setConnectionReroutePoints(id: string, points: readonly ReroutePoint[] | null): void {
    const normalized = points && points.length > 0
      ? points.map(point => ({ x: point.x, y: point.y }))
      : null;
    if (normalized && !validReroutePoints(normalized)) return;

    this.connections.update(conns =>
      conns.map(c => {
        if (c.id !== id) return c;
        if (!normalized) {
          const { reroutePoints: _removed, ...rest } = c;
          return rest;
        }
        return { ...c, reroutePoints: normalized };
      })
    );
  }

  // Connection color: null (the "default" swatch) removes the field entirely
  setConnectionColor(id: string, color: string | null): void {
    this.connections.update(conns =>
      conns.map(c => {
        if (c.id !== id) return c;
        if (color === null) {
          const { color: _removed, ...rest } = c;
          return rest;
        }
        return { ...c, color };
      })
    );
  }

  // Connection Arrowhead: setting an endpoint to its default value removes the
  // field (absent means default, ADR-0012), so only deviations are stored.
  setConnectionArrowhead(id: string, end: ArrowheadEnd, type: ArrowheadType): void {
    const isDefault = type === defaultArrowhead(end);
    this.connections.update(conns =>
      conns.map(c => {
        if (c.id !== id) return c;
        if (end === 'start') {
          if (isDefault) {
            const { startArrowhead: _removed, ...rest } = c;
            return rest;
          }
          return { ...c, startArrowhead: type };
        }
        if (isDefault) {
          const { endArrowhead: _removed, ...rest } = c;
          return rest;
        }
        return { ...c, endArrowhead: type };
      })
    );
  }

  // Stroke styling (ADR-0020): like Arrowheads, setting a field to its default
  // removes it — absent means default, so only deviations are stored.
  setConnectionStrokePattern(id: string, pattern: StrokePattern): void {
    this.connections.update(conns =>
      conns.map(c => {
        if (c.id !== id) return c;
        if (pattern === DEFAULT_STROKE_PATTERN) {
          const { strokePattern: _removed, ...rest } = c;
          return rest;
        }
        return { ...c, strokePattern: pattern };
      })
    );
  }

  setConnectionStrokeWeight(id: string, weight: StrokeWeight): void {
    this.connections.update(conns =>
      conns.map(c => {
        if (c.id !== id) return c;
        if (weight === DEFAULT_STROKE_WEIGHT) {
          const { strokeWeight: _removed, ...rest } = c;
          return rest;
        }
        return { ...c, strokeWeight: weight };
      })
    );
  }

  // Route Style (ADR-0031): same deviation-only discipline — absent means the
  // curve default, so only orthogonal deviations are stored.
  setConnectionRouteStyle(id: string, style: RouteStyle): void {
    this.connections.update(conns =>
      conns.map(c => {
        if (c.id !== id) return c;
        if (style === DEFAULT_ROUTE_STYLE) {
          const { routeStyle: _removed, ...rest } = c;
          return rest;
        }
        return { ...c, routeStyle: style };
      })
    );
  }

  // Selection (ADR-0015): one set freely mixing Nodes and Connections. The
  // set is normalized so a Group and its own children are never both members
  // (group-as-unit — children ride along implicitly).

  /** Replace the Selection with a single Node (null clears the Selection). */
  selectNode(id: string | null): void {
    this.selectedNodeIds.set(id === null ? [] : [id]);
    this.selectedConnectionIds.set([]);
  }

  /** Replace the Selection with a single Connection. */
  selectConnection(id: string): void {
    this.selectedConnectionIds.set([id]);
    this.selectedNodeIds.set([]);
  }

  /** Replace the whole Selection with the given (normalized) set. */
  setSelection(nodeIds: readonly string[], connectionIds: readonly string[]): void {
    this.selectedNodeIds.set(this.normalizeNodeSelection(nodeIds));
    this.selectedConnectionIds.set([...new Set(connectionIds)]);
  }

  /** Union the given elements into the Selection (Shift+Marquee). */
  addToSelection(nodeIds: readonly string[], connectionIds: readonly string[]): void {
    this.setSelection(
      [...this.selectedNodeIds(), ...nodeIds],
      [...this.selectedConnectionIds(), ...connectionIds],
    );
  }

  /** Shift+click on a Node: toggle its Selection membership. */
  toggleNodeSelection(id: string): void {
    const current = this.selectedNodeIds();
    if (current.includes(id)) {
      this.selectedNodeIds.set(current.filter(nodeId => nodeId !== id));
    } else {
      this.selectedNodeIds.set(this.normalizeNodeSelection([...current, id]));
    }
  }

  /** Shift+click on a Connection: toggle its Selection membership. */
  toggleConnectionSelection(id: string): void {
    const current = this.selectedConnectionIds();
    this.selectedConnectionIds.set(
      current.includes(id) ? current.filter(connId => connId !== id) : [...current, id],
    );
  }

  clearSelection(): void {
    this.selectedNodeIds.set([]);
    this.selectedConnectionIds.set([]);
  }

  /** Ctrl+A: every Group (as a unit), every loose Node, every Connection. */
  selectAll(): void {
    this.selectedNodeIds.set(this.nodes().filter(n => !n.parentId).map(n => n.id));
    this.selectedConnectionIds.set(this.connections().map(c => c.id));
  }

  isNodeSelected(id: string): boolean {
    return this.selectedNodeIds().includes(id);
  }

  isConnectionSelected(id: string): boolean {
    return this.selectedConnectionIds().includes(id);
  }

  // Dedupe, and drop any Node whose Group is also in the set: a child never
  // sits in the Selection beside its own Group (it would double-count moves).
  private normalizeNodeSelection(nodeIds: readonly string[]): string[] {
    const unique = [...new Set(nodeIds)];
    const idSet = new Set(unique);
    const parentOf = new Map(this.nodes().map(n => [n.id, n.parentId]));
    return unique.filter(id => {
      const parentId = parentOf.get(id);
      return !(parentId && idSet.has(parentId));
    });
  }

  // Viewport
  setViewport(state: Partial<ViewportState>): void {
    this.viewportState.update(current => ({ ...current, ...state }));
  }

  resetViewport(): void {
    this.viewportState.set({ panX: 0, panY: 0, zoom: 1 });
  }

  zoomBy(delta: number, centerX: number, centerY: number): void {
    const current = this.viewportState();
    const newZoom = Math.min(Math.max(current.zoom + delta, ZOOM_MIN), ZOOM_MAX);
    const zoomRatio = newZoom / current.zoom;

    // Zoom centered on the given point
    const newPanX = centerX - (centerX - current.panX) * zoomRatio;
    const newPanY = centerY - (centerY - current.panY) * zoomRatio;

    this.viewportState.set({ panX: newPanX, panY: newPanY, zoom: newZoom });
  }

  // Frame the whole graph (all Nodes plus Connection curves, Groups included)
  // into the given visible-canvas region, centered, never magnifying past 1x.
  // An empty graph is a silent no-op. Pure Viewport change — no History entry.
  zoomToFit(viewWidth: number, viewHeight: number): void {
    const bounds = contentBounds(this.nodes(), this.connections());
    if (!bounds) return;
    this.viewportState.set(frameViewport(bounds, viewWidth, viewHeight, GraphService.FIT_MAX_ZOOM));
  }

  // Frame the selected element into the given visible-canvas region, centered,
  // magnifying no further than 2x. No selection is a silent no-op. Pure
  // Viewport change — no History entry.
  zoomToSelection(viewWidth: number, viewHeight: number): void {
    const bounds = this.selectionBounds();
    if (!bounds) return;
    this.viewportState.set(frameViewport(bounds, viewWidth, viewHeight, GraphService.SELECTION_MAX_ZOOM));
  }

  // Frame the given elements exactly like zoomToSelection but without reading
  // or writing the Selection — the Canvas Search Viewport-only jump in Canvas
  // Lock. Empty lists are a silent no-op. Pure Viewport change, no History.
  zoomToElements(nodeIds: readonly string[], connectionIds: readonly string[], viewWidth: number, viewHeight: number): void {
    const bounds = this.elementsBounds(nodeIds, connectionIds);
    if (!bounds) return;
    this.viewportState.set(frameViewport(bounds, viewWidth, viewHeight, GraphService.SELECTION_MAX_ZOOM));
  }

  // Bounds of the current Selection: each Node by its rect, a Group unioned
  // with its children (a child's edge can overhang the Group rect), each
  // Connection by its cubic bezier curve bounds. Null when nothing is selected.
  private selectionBounds(): Bounds | null {
    return this.elementsBounds(this.selectedNodeIds(), this.selectedConnectionIds());
  }

  // Bounds of the given elements under the same rules as the Selection.
  private elementsBounds(nodeIds: readonly string[], connectionIds: readonly string[]): Bounds | null {
    const parts: Bounds[] = [];
    const nodeSet = new Set(nodeIds);
    const nodeById = new Map(this.nodes().map(n => [n.id, n]));

    for (const id of nodeSet) {
      const node = nodeById.get(id);
      if (!node) continue;
      parts.push({ x: node.x, y: node.y, width: node.width, height: node.height });
      if (node.kind === 'group') {
        for (const c of this.childrenOf(node.id)) {
          parts.push({ x: c.x, y: c.y, width: c.width, height: c.height });
        }
      }
    }

    if (connectionIds.length > 0) {
      for (const id of new Set(connectionIds)) {
        const conn = this.connections().find(c => c.id === id);
        if (!conn) continue;
        const bounds = connectionBounds(conn, nodeById);
        if (bounds) parts.push(bounds);
      }
    }

    return parts.length > 0 ? unionBounds(parts) : null;
  }

  // Handle position computation — the pure geometry lives in curve.ts so bounds
  // and the connection layer share one definition.
  getHandlePosition(nodeId: string, handle: HandleSide): { x: number; y: number } | null {
    const node = this.nodes().find(n => n.id === nodeId);
    // Text Blocks own zero Handles (ADR-0035): no position exists for any side
    if (!node || node.kind === 'annotation') return null;
    return handlePoint(node, handle);
  }

  // Import/Export
  importGraph(state: GraphState): { success: boolean; error?: string } {
    const validation = this.validateGraphState(state);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    const canonical = this.canonicalizeGraphState(state);
    this.nodes.set(canonical.nodes);
    this.connections.set(canonical.connections);
    this.pins.set(canonical.pins ?? []);
    this.clearSelection();
    return { success: true };
  }

  /** Apply the same legacy migration and default canonicalization as Import. */
  canonicalizeGraphState(state: GraphState): GraphState {
    const canonical: GraphState = structuredClone({
      nodes: state.nodes.map(node => this.migrateNode(node)),
      connections: state.connections.map(connection => this.migrateConnection(connection)),
      pins: (state.pins ?? []).map(pin => ({
        ...pin,
        anchor: pin.anchor.kind === 'canvas'
          ? { kind: 'canvas' as const, x: pin.anchor.x, y: pin.anchor.y }
          : { ...pin.anchor },
      })),
    });
    // The canonical absent form: no key when there are no Pins
    if (canonical.pins !== undefined && canonical.pins.length === 0) delete canonical.pins;
    return canonical;
  }

  /** Canonicalize only Shape defaults for collection envelopes. */
  canonicalizeNodeShapes(state: GraphState): GraphState {
    return structuredClone({
      nodes: state.nodes.map(node => {
        const raw = node as Omit<GraphNode, 'shape'> & { shape?: NodeShape };
        if (raw.shape !== 'rectangle' && raw.shape !== undefined) return raw;
        const { shape: _removed, ...rest } = raw;
        return rest;
      }),
      connections: state.connections,
    });
  }

  // Legacy payloads carry plain-string labels on regular nodes/connections;
  // they migrate into single-run Text on import (ADR-0009). Groups keep label.
  // Text is canonicalized so imported key order can't spoof a later change.
  private migrateNode(node: GraphNode): GraphNode {
    if (node.kind === 'group') return { ...node };
    const { label, shape, ...rest } = node as Omit<GraphNode, 'shape'> & { label?: string; shape?: NodeShape };
    const migrated = {
      ...rest,
      text: node.text ? canonicalizeText(node.text) : textFromString(label ?? ''),
    } as GraphNode;
    return shape === 'rectangle' || shape === undefined
      ? migrated
      : { ...migrated, shape };
  }

  private migrateConnection(conn: Connection): Connection {
    const { label, ...rest } = conn as Connection & { label?: string };
    // Canonicalize Arrowheads: an explicitly-default value is dropped so only
    // deviations persist (ADR-0012), matching the "absent means default" rule.
    if (rest.startArrowhead === defaultArrowhead('start')) delete rest.startArrowhead;
    if (rest.endArrowhead === defaultArrowhead('end')) delete rest.endArrowhead;
    // Same canonical form for stroke styling (ADR-0020)
    if (rest.strokePattern === DEFAULT_STROKE_PATTERN) delete rest.strokePattern;
    if (rest.strokeWeight === DEFAULT_STROKE_WEIGHT) delete rest.strokeWeight;
    // Same canonical form for Route Style (ADR-0031)
    if (rest.routeStyle === DEFAULT_ROUTE_STYLE) delete rest.routeStyle;
    // Same canonical form for textPosition: an explicit midpoint is absent
    if (rest.textPosition === TEXT_POSITION_DEFAULT) delete rest.textPosition;
    // Empty Reroute Point arrays are the canonical absent form. Import has
    // already validated the coordinates, so the copy here is only to avoid
    // aliasing the caller's payload into Graph State.
    if (rest.reroutePoints?.length === 0) {
      delete rest.reroutePoints;
    } else if (rest.reroutePoints) {
      rest.reroutePoints = rest.reroutePoints.map(point => ({ x: point.x, y: point.y }));
    }
    if (conn.text) return { ...rest, text: canonicalizeText(conn.text) };
    if (label !== undefined && label.trim() !== '') {
      return { ...rest, text: textFromString(label) };
    }
    return rest;
  }

  exportGraph(): GraphState {
    // Deep copy: Text blocks are nested arrays, a shallow copy would alias them
    const pins = this.pins();
    return structuredClone({
      nodes: this.nodes(),
      connections: this.connections(),
      ...(pins.length > 0 ? { pins } : {}),
    });
  }

  // Public so collection import can validate each project's graph with the
  // exact same rules — never re-implement this validation elsewhere.
  validateGraphState(state: unknown): { valid: boolean; error?: string } {
    if (!state || typeof state !== 'object') {
      return { valid: false, error: 'Invalid graph state: not an object' };
    }

    const s = state as Record<string, unknown>;

    if (!Array.isArray(s['nodes'])) {
      return { valid: false, error: 'Invalid graph state: nodes must be an array' };
    }
    if (!Array.isArray(s['connections'])) {
      return { valid: false, error: 'Invalid graph state: connections must be an array' };
    }
    // Absent means pin-less; present-but-not-an-array rejects wholesale
    const pinsRaw = s['pins'];
    if (pinsRaw !== undefined && !Array.isArray(pinsRaw)) {
      return { valid: false, error: 'Invalid graph state: pins must be an array' };
    }

    const nodesArr = s['nodes'] as unknown[];
    const connsArr = s['connections'] as unknown[];
    const nodeIds = new Set<string>();
    const validHandles: HandleSide[] = ['top', 'right', 'bottom', 'left'];

    for (let i = 0; i < nodesArr.length; i++) {
      const node = nodesArr[i] as Record<string, unknown>;
      if (!node || typeof node !== 'object') {
        return { valid: false, error: `Invalid node at index ${i}: not an object` };
      }
      if (typeof node['id'] !== 'string' || !node['id']) {
        return { valid: false, error: `Invalid node at index ${i}: missing or invalid id` };
      }
      const nodeId = node['id'] as string;
      if (nodeIds.has(nodeId)) {
        return { valid: false, error: `Duplicate node id: ${nodeId}` };
      }
      // Groups carry a plain Label; regular nodes carry Text (or a legacy
      // string label that will migrate). Anything else is rejected wholesale.
      if (node['kind'] === 'group') {
        if (typeof node['label'] !== 'string') {
          return { valid: false, error: `Invalid node ${nodeId}: label must be a string` };
        }
        if (node['text'] !== undefined) {
          return { valid: false, error: `Invalid node ${nodeId}: a Group cannot carry text` };
        }
      } else {
        // Labels are the Group-only field: a Text Block carries Text, never a Label
        if (node['kind'] === 'annotation' && node['label'] !== undefined) {
          return { valid: false, error: `Invalid node ${nodeId}: a Text Block cannot carry label` };
        }
        if (node['text'] !== undefined) {
          const reason = validateText(node['text']);
          if (reason) {
            return { valid: false, error: `Invalid node ${nodeId}: ${reason}` };
          }
        } else if (node['label'] === undefined) {
          return { valid: false, error: `Invalid node ${nodeId}: missing text` };
        }
        if (node['label'] !== undefined && typeof node['label'] !== 'string') {
          return { valid: false, error: `Invalid node ${nodeId}: label must be a string` };
        }
      }
      if (typeof node['x'] !== 'number' || typeof node['y'] !== 'number') {
        return { valid: false, error: `Invalid node ${nodeId}: x and y must be numbers` };
      }
      if (typeof node['width'] !== 'number' || typeof node['height'] !== 'number') {
        return { valid: false, error: `Invalid node ${nodeId}: width and height must be numbers` };
      }
      if (node['kind'] !== undefined && node['kind'] !== 'group' && node['kind'] !== 'annotation') {
        return { valid: false, error: `Invalid node ${nodeId}: kind must be 'group' or 'annotation'` };
      }
      if (node['shape'] !== undefined) {
        if (node['kind'] === 'group') {
          return { valid: false, error: `Invalid node ${nodeId}: a Group cannot carry shape` };
        }
        if (!isNodeShape(node['shape'])) {
          return { valid: false, error: `Invalid node ${nodeId}: shape must be rectangle, pill, diamond, or ellipse` };
        }
      }
      if (node['color'] !== undefined && !NODE_PALETTE.includes(node['color'] as string)) {
        return { valid: false, error: `Invalid node ${nodeId}: color must be a palette color` };
      }
      if (node['emoji'] !== undefined) {
        if (node['kind'] === 'group') {
          return { valid: false, error: `Invalid node ${nodeId}: a Group cannot carry emoji` };
        }
        if (!isNodeEmoji(node['emoji'])) {
          return { valid: false, error: `Invalid node ${nodeId}: emoji must be a curated emoji` };
        }
      }
      nodeIds.add(nodeId);
    }

    // parentId rules need the full node set, so they run as a second pass
    const groupIds = new Set<string>();
    const kindOf = new Map<string, unknown>();
    const parentOf = new Map<string, string>();
    for (const raw of nodesArr) {
      const node = raw as Record<string, unknown>;
      if (node['kind'] === 'group') groupIds.add(node['id'] as string);
      kindOf.set(node['id'] as string, node['kind']);
    }
    for (const raw of nodesArr) {
      const node = raw as Record<string, unknown>;
      const nodeId = node['id'] as string;
      const parentId = node['parentId'];
      if (parentId === undefined) continue;
      if (node['kind'] === 'group') {
        return { valid: false, error: `Invalid node ${nodeId}: a Group cannot have a parentId` };
      }
      if (typeof parentId !== 'string' || !nodeIds.has(parentId)) {
        return { valid: false, error: `Invalid node ${nodeId}: parentId references non-existent node` };
      }
      if (!groupIds.has(parentId)) {
        return { valid: false, error: `Invalid node ${nodeId}: parentId must reference a Group` };
      }
      parentOf.set(nodeId, parentId);
    }

    for (let i = 0; i < connsArr.length; i++) {
      const conn = connsArr[i] as Record<string, unknown>;
      if (!conn || typeof conn !== 'object') {
        return { valid: false, error: `Invalid connection at index ${i}: not an object` };
      }
      if (typeof conn['id'] !== 'string' || !conn['id']) {
        return { valid: false, error: `Invalid connection at index ${i}: missing or invalid id` };
      }
      const connId = conn['id'] as string;
      if (typeof conn['sourceNodeId'] !== 'string' || !nodeIds.has(conn['sourceNodeId'] as string)) {
        return { valid: false, error: `Invalid connection ${connId}: sourceNodeId references non-existent node` };
      }
      if (typeof conn['targetNodeId'] !== 'string' || !nodeIds.has(conn['targetNodeId'] as string)) {
        return { valid: false, error: `Invalid connection ${connId}: targetNodeId references non-existent node` };
      }
      if (!validHandles.includes(conn['sourceHandle'] as HandleSide)) {
        return { valid: false, error: `Invalid connection ${connId}: invalid sourceHandle` };
      }
      if (!validHandles.includes(conn['targetHandle'] as HandleSide)) {
        return { valid: false, error: `Invalid connection ${connId}: invalid targetHandle` };
      }
      if (conn['text'] !== undefined) {
        const reason = validateText(conn['text']);
        if (reason) {
          return { valid: false, error: `Invalid connection ${connId}: ${reason}` };
        }
      } else if (conn['label'] !== undefined && typeof conn['label'] !== 'string') {
        // Legacy plain-string label, migrated on import
        return { valid: false, error: `Invalid connection ${connId}: label must be a string` };
      }
      if (conn['color'] !== undefined && !NODE_PALETTE.includes(conn['color'] as string)) {
        return { valid: false, error: `Invalid connection ${connId}: color must be a palette color` };
      }
      if (conn['startArrowhead'] !== undefined && !ARROWHEAD_TYPES.includes(conn['startArrowhead'] as ArrowheadType)) {
        return { valid: false, error: `Invalid connection ${connId}: startArrowhead must be none, arrow, or triangle` };
      }
      if (conn['endArrowhead'] !== undefined && !ARROWHEAD_TYPES.includes(conn['endArrowhead'] as ArrowheadType)) {
        return { valid: false, error: `Invalid connection ${connId}: endArrowhead must be none, arrow, or triangle` };
      }
      if (conn['strokePattern'] !== undefined && !STROKE_PATTERNS.includes(conn['strokePattern'] as StrokePattern)) {
        return { valid: false, error: `Invalid connection ${connId}: strokePattern must be solid, dashed, or dotted` };
      }
      if (conn['strokeWeight'] !== undefined && !STROKE_WEIGHTS.includes(conn['strokeWeight'] as StrokeWeight)) {
        return { valid: false, error: `Invalid connection ${connId}: strokeWeight must be thin, normal, or thick` };
      }
      if (conn['routeStyle'] !== undefined && !ROUTE_STYLES.includes(conn['routeStyle'] as RouteStyle)) {
        return { valid: false, error: `Invalid connection ${connId}: routeStyle must be curve or orthogonal` };
      }
      if (conn['reroutePoints'] !== undefined) {
        const points = conn['reroutePoints'];
        if (!Array.isArray(points)) {
          return { valid: false, error: `Invalid connection ${connId}: reroutePoints must be an array` };
        }
        if (points.length > MAX_REROUTE_POINTS) {
          return { valid: false, error: `Invalid connection ${connId}: reroutePoints may contain at most ${MAX_REROUTE_POINTS} points` };
        }
        let previous: ReroutePoint | null = null;
        for (let pointIndex = 0; pointIndex < points.length; pointIndex++) {
          const point = points[pointIndex] as Record<string, unknown>;
          if (!point || typeof point !== 'object' ||
              typeof point['x'] !== 'number' || !Number.isFinite(point['x']) ||
              typeof point['y'] !== 'number' || !Number.isFinite(point['y'])) {
            return { valid: false, error: `Invalid connection ${connId}: reroute point ${pointIndex} must have finite numeric x and y` };
          }
          if (previous && point['x'] === previous.x && point['y'] === previous.y) {
            return { valid: false, error: `Invalid connection ${connId}: consecutive reroute points must be distinct` };
          }
          previous = { x: point['x'] as number, y: point['y'] as number };
        }
      }
      // textPosition is geometry-determining like a handle side: one legal
      // shape, rejected wholesale otherwise (ADR-0013) — never repaired.
      if (conn['textPosition'] !== undefined) {
        const pos = conn['textPosition'];
        if (typeof pos !== 'number' || Number.isNaN(pos) || pos < TEXT_POSITION_MIN || pos > TEXT_POSITION_MAX) {
          return { valid: false, error: `Invalid connection ${connId}: textPosition must be a number between ${TEXT_POSITION_MIN} and ${TEXT_POSITION_MAX}` };
        }
        if (conn['text'] === undefined || isTextEmpty(conn['text'] as Text)) {
          return { valid: false, error: `Invalid connection ${connId}: textPosition requires text` };
        }
      }
      const sourceId = conn['sourceNodeId'] as string;
      const targetId = conn['targetNodeId'] as string;
      // Text Blocks own zero Handles and can never be connected (ADR-0035)
      if (kindOf.get(sourceId) === 'annotation' || kindOf.get(targetId) === 'annotation') {
        return { valid: false, error: `Invalid connection ${connId}: connects a Text Block` };
      }
      if (parentOf.get(sourceId) === targetId || parentOf.get(targetId) === sourceId) {
        return { valid: false, error: `Invalid connection ${connId}: connects a Group to its own child` };
      }
    }

    // Pins (ADR-0025): validated wholesale like everything else. Groups are
    // valid anchors; Connections never are (no anchor kind for them exists).
    if (pinsRaw !== undefined) {
      const pinIds = new Set<string>();
      for (let i = 0; i < pinsRaw.length; i++) {
        const pin = pinsRaw[i] as Record<string, unknown>;
        if (!pin || typeof pin !== 'object') {
          return { valid: false, error: `Invalid pin at index ${i}: not an object` };
        }
        if (typeof pin['id'] !== 'string' || !pin['id']) {
          return { valid: false, error: `Invalid pin at index ${i}: missing or invalid id` };
        }
        const pinId = pin['id'] as string;
        if (pinIds.has(pinId)) {
          return { valid: false, error: `Duplicate pin id: ${pinId}` };
        }
        if (typeof pin['message'] !== 'string' || (pin['message'] as string).trim() === '') {
          return { valid: false, error: `Invalid pin ${pinId}: message must be a non-empty string` };
        }
        const anchor = pin['anchor'];
        if (!anchor || typeof anchor !== 'object') {
          return { valid: false, error: `Invalid pin ${pinId}: anchor must be canvas or node` };
        }
        const a = anchor as Record<string, unknown>;
        if (a['kind'] === 'canvas') {
          if (typeof a['x'] !== 'number' || !Number.isFinite(a['x']) ||
              typeof a['y'] !== 'number' || !Number.isFinite(a['y'])) {
            return { valid: false, error: `Invalid pin ${pinId}: canvas anchor must have finite numeric x and y` };
          }
        } else if (a['kind'] === 'node') {
          if (typeof a['nodeId'] !== 'string' || !nodeIds.has(a['nodeId'] as string)) {
            return { valid: false, error: `Invalid pin ${pinId}: anchor references non-existent node` };
          }
          if (typeof a['offsetX'] !== 'number' || !Number.isFinite(a['offsetX']) ||
              typeof a['offsetY'] !== 'number' || !Number.isFinite(a['offsetY'])) {
            return { valid: false, error: `Invalid pin ${pinId}: node anchor must have finite numeric offsetX and offsetY` };
          }
        } else {
          return { valid: false, error: `Invalid pin ${pinId}: anchor must be canvas or node` };
        }
        pinIds.add(pinId);
      }
    }

    return { valid: true };
  }

  // URL parameter loading — async because the gz share-link payload
  // decompresses through DecompressionStream (ADR-0026).
  async loadFromUrlParam(): Promise<{ loaded: boolean; error?: string }> {
    if (typeof window === 'undefined') return { loaded: false };

    const params = new URLSearchParams(window.location.search);
    const dataParam = params.get('data');

    if (!dataParam) return { loaded: false };

    try {
      const json = await decodeShareParam(dataParam);
      const parsed = JSON.parse(json);
      const result = this.importGraph(parsed);
      return { loaded: result.success, error: result.error };
    } catch (e) {
      return { loaded: false, error: 'Failed to parse URL data parameter' };
    }
  }

  // Clear all
  clearGraph(): void {
    this.nodes.set([]);
    this.connections.set([]);
    this.pins.set([]);
    this.clearSelection();
  }
}

function validReroutePoints(points: readonly ReroutePoint[]): boolean {
  if (points.length === 0 || points.length > MAX_REROUTE_POINTS) return false;
  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
    const previous = points[i - 1];
    if (previous && point.x === previous.x && point.y === previous.y) return false;
  }
  return true;
}

// Defensive copy so a caller's anchor object can't alias into Graph State
function clonePinAnchor(anchor: PinAnchor): PinAnchor {
  return anchor.kind === 'canvas'
    ? { kind: 'canvas', x: anchor.x, y: anchor.y }
    : { ...anchor };
}
