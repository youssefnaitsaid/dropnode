import { Command } from '../models/command';
import { GraphNode, HandleSide, oppositeHandle } from '../models/node';
import { NodeRect, NodeShape, effectiveNodeShape } from '../models/node-shape';
export type { NodeRect } from '../models/node-shape';
import { Connection, ReroutePoint, ArrowheadType, ArrowheadEnd, effectiveArrowhead, defaultArrowhead, StrokePattern, StrokeWeight, effectiveStrokePattern, effectiveStrokeWeight, DEFAULT_STROKE_PATTERN, DEFAULT_STROKE_WEIGHT } from '../models/connection';
import { Text } from '../models/text';
import { Pin, PinAnchor } from '../models/pin';
import { AlignKind, DistributeAxis, RootRect, TargetPosition, alignRects, distributeRects } from '../models/align-distribute';
import { TidyResult, applyTidyToState, isTidyEmpty, tidyLayout } from '../models/tidy-layout';
import { GraphService } from './graph.service';

export class CreateNodeCommand implements Command {
  description = 'Create Node';
  private node: GraphNode | null = null;

  constructor(
    private graphService: GraphService,
    private label: string,
    private x: number,
    private y: number,
    private parentId?: string,
  ) {}

  execute(): void {
    this.node = this.graphService.createNode(this.label, this.x, this.y);
    if (this.parentId) {
      this.graphService.setNodeParent(this.node.id, this.parentId);
    }
  }

  undo(): void {
    if (this.node) {
      this.graphService.deleteNode(this.node.id);
    }
  }

  getNode(): GraphNode | null {
    return this.node;
  }
}

export class MoveNodeCommand implements Command {
  description = 'Move Node';
  private originalX = 0;
  private originalY = 0;

  constructor(
    private graphService: GraphService,
    private nodeId: string,
    private newX: number,
    private newY: number,
    explicitOriginalX?: number,
    explicitOriginalY?: number,
  ) {
    if (explicitOriginalX !== undefined && explicitOriginalY !== undefined) {
      this.originalX = explicitOriginalX;
      this.originalY = explicitOriginalY;
    } else {
      const node = this.graphService.nodes().find(n => n.id === nodeId);
      if (node) {
        this.originalX = node.x;
        this.originalY = node.y;
      }
    }
  }

  execute(): void {
    this.graphService.updateNodePosition(this.nodeId, this.newX, this.newY);
  }

  undo(): void {
    this.graphService.updateNodePosition(this.nodeId, this.originalX, this.originalY);
  }
}

// Groups only — regular nodes carry Text, changed via SetNodeTextCommand
export class RenameNodeCommand implements Command {
  description = 'Rename Node';
  private originalLabel = '';

  constructor(
    private graphService: GraphService,
    private nodeId: string,
    private newLabel: string,
  ) {
    const node = this.graphService.nodes().find(n => n.id === nodeId);
    if (node) {
      this.originalLabel = node.label ?? '';
    }
  }

  execute(): void {
    this.graphService.updateNodeLabel(this.nodeId, this.newLabel);
  }

  undo(): void {
    this.graphService.updateNodeLabel(this.nodeId, this.originalLabel);
  }
}

// One Text edit session commits as exactly one of these; unchanged content
// never constructs a command (the editor guards that)
export class SetNodeTextCommand implements Command {
  description = 'Set Node Text';
  private originalText: Text = [];

  constructor(
    private graphService: GraphService,
    private nodeId: string,
    private newText: Text,
  ) {
    const node = this.graphService.nodes().find(n => n.id === nodeId);
    this.originalText = structuredClone(node?.text ?? []);
  }

  execute(): void {
    this.graphService.setNodeText(this.nodeId, this.newText);
  }

  undo(): void {
    this.graphService.setNodeText(this.nodeId, this.originalText);
  }
}

export class DeleteNodeCommand implements Command {
  description = 'Delete Node';
  private deletedNode: GraphNode | null = null;
  private removedConnections: Connection[] = [];
  private releasedChildIds: string[] = [];
  private removedPins: Pin[] = [];

  constructor(
    private graphService: GraphService,
    private nodeId: string,
  ) {}

  execute(): void {
    const result = this.graphService.deleteNode(this.nodeId);
    this.deletedNode = result.node;
    this.removedConnections = result.removedConnections;
    this.releasedChildIds = result.releasedChildIds;
    this.removedPins = result.removedPins;
  }

  undo(): void {
    if (!this.deletedNode) return;
    // Re-create the node and re-parent the children it had released
    this.graphService.nodes.update(nodes => [
      ...nodes.map(n =>
        this.releasedChildIds.includes(n.id) ? { ...n, parentId: this.nodeId } : n
      ),
      { ...this.deletedNode! },
    ]);
    // Re-create removed connections
    if (this.removedConnections.length > 0) {
      this.graphService.connections.update(conns => [
        ...conns,
        ...structuredClone(this.removedConnections),
      ]);
    }
    // Re-create the Pins that cascaded away with the node
    if (this.removedPins.length > 0) {
      this.graphService.pins.update(pins => [...pins, ...structuredClone(this.removedPins)]);
    }
  }
}

// Pin commands (ADR-0025): full History citizens, one undo step each.

/** Ghost-pin commit: the Pin materializes only here, already carrying its message. */
export class CreatePinCommand implements Command {
  description = 'Create Pin';
  private pin: Pin | null = null;

  constructor(
    private graphService: GraphService,
    private anchor: PinAnchor,
    private message: string,
  ) {}

  execute(): void {
    this.pin = this.graphService.createPin(this.anchor, this.message);
  }

  undo(): void {
    if (this.pin) {
      this.graphService.deletePin(this.pin.id);
    }
  }

  getPin(): Pin | null {
    return this.pin;
  }
}

export class EditPinCommand implements Command {
  description = 'Edit Pin';
  private originalMessage = '';

  constructor(
    private graphService: GraphService,
    private pinId: string,
    private newMessage: string,
  ) {
    const pin = this.graphService.pins().find(p => p.id === pinId);
    this.originalMessage = pin?.message ?? '';
  }

  execute(): void {
    this.graphService.setPinMessage(this.pinId, this.newMessage);
  }

  undo(): void {
    this.graphService.setPinMessage(this.pinId, this.originalMessage);
  }
}

/** One Pin drag commits as exactly one of these (anchor snapshots in the ctor). */
export class MovePinCommand implements Command {
  description = 'Move Pin';
  private originalAnchor: PinAnchor | null;

  constructor(
    private graphService: GraphService,
    private pinId: string,
    private newAnchor: PinAnchor,
    explicitOriginalAnchor?: PinAnchor,
  ) {
    if (explicitOriginalAnchor !== undefined) {
      this.originalAnchor = explicitOriginalAnchor;
    } else {
      const pin = this.graphService.pins().find(p => p.id === pinId);
      this.originalAnchor = pin ? structuredClone(pin.anchor) : null;
    }
  }

  execute(): void {
    this.graphService.setPinAnchor(this.pinId, this.newAnchor);
  }

  undo(): void {
    if (this.originalAnchor !== null) {
      this.graphService.setPinAnchor(this.pinId, this.originalAnchor);
    }
  }
}

export class DeletePinCommand implements Command {
  description = 'Delete Pin';
  private deletedPin: Pin | null = null;

  constructor(
    private graphService: GraphService,
    private pinId: string,
  ) {}

  execute(): void {
    const deleted = this.graphService.deletePin(this.pinId);
    this.deletedPin = deleted ? structuredClone(deleted) : null;
  }

  undo(): void {
    if (!this.deletedPin) return;
    this.graphService.pins.update(pins => [...pins, structuredClone(this.deletedPin!)]);
  }
}

export class CreateConnectionCommand implements Command {
  description = 'Create Connection';
  private connection: Connection | null = null;

  constructor(
    private graphService: GraphService,
    private sourceNodeId: string,
    private sourceHandle: HandleSide,
    private targetNodeId: string,
    private targetHandle: HandleSide,
  ) {}

  execute(): void {
    this.connection = this.graphService.createConnection(
      this.sourceNodeId, this.sourceHandle,
      this.targetNodeId, this.targetHandle
    );
  }

  undo(): void {
    if (this.connection) {
      this.graphService.deleteConnection(this.connection.id);
    }
  }

  getConnection(): Connection | null {
    return this.connection;
  }
}

export class DeleteConnectionCommand implements Command {
  description = 'Delete Connection';
  private deletedConnection: Connection | null = null;

  constructor(
    private graphService: GraphService,
    private connectionId: string,
  ) {}

  execute(): void {
    const deleted = this.graphService.deleteConnection(this.connectionId);
    this.deletedConnection = deleted ? structuredClone(deleted) : null;
  }

  undo(): void {
    if (!this.deletedConnection) return;
    this.graphService.connections.update(conns => [...conns, structuredClone(this.deletedConnection!)]);
  }
}

export class SetConnectionTextCommand implements Command {
  description = 'Set Connection Text';
  private originalText: Text | null;
  // Captured alongside the Text: clearing discards the position (ADR-0013),
  // so one undo must restore the annotation at its exact previous spot
  private originalPosition: number | null;

  constructor(
    private graphService: GraphService,
    private connectionId: string,
    private newText: Text | null,
  ) {
    const conn = this.graphService.connections().find(c => c.id === connectionId);
    this.originalText = conn?.text ? structuredClone(conn.text) : null;
    this.originalPosition = conn?.textPosition ?? null;
  }

  execute(): void {
    this.graphService.setConnectionText(this.connectionId, this.newText);
  }

  undo(): void {
    // An absent original Text is restored by committing null (which clears it)
    this.graphService.setConnectionText(this.connectionId, this.originalText);
    if (this.originalText !== null) {
      this.graphService.setConnectionTextPosition(this.connectionId, this.originalPosition);
    }
  }
}

// One Text card drag commits as exactly one of these, pushed on mouseup only
// if the drag crossed the 2px threshold (the drag itself updates transiently)
export class MoveConnectionTextCommand implements Command {
  description = 'Move Connection Text';
  private originalPosition: number | null;

  constructor(
    private graphService: GraphService,
    private connectionId: string,
    private newPosition: number,
    explicitOriginalPosition?: number | null,
  ) {
    if (explicitOriginalPosition !== undefined) {
      this.originalPosition = explicitOriginalPosition;
    } else {
      const conn = this.graphService.connections().find(c => c.id === connectionId);
      this.originalPosition = conn?.textPosition ?? null;
    }
  }

  execute(): void {
    this.graphService.setConnectionTextPosition(this.connectionId, this.newPosition);
  }

  undo(): void {
    // A null original means the Text sat at the midpoint (absent field)
    this.graphService.setConnectionTextPosition(this.connectionId, this.originalPosition);
  }
}

// Reroute Point edits snapshot the whole ordered array so undo/redo preserves
// route order and the optional absent/empty canonical form exactly.
export class AddConnectionReroutePointCommand implements Command {
  description = 'Add Reroute Point';
  private originalPoints: ReroutePoint[];
  private nextPoints: ReroutePoint[];

  constructor(
    private graphService: GraphService,
    private connectionId: string,
    point: ReroutePoint,
    index: number,
  ) {
    const conn = this.graphService.connections().find(c => c.id === connectionId);
    this.originalPoints = structuredClone(conn?.reroutePoints ?? []);
    this.nextPoints = structuredClone(this.originalPoints);
    const insertionIndex = Math.min(Math.max(index, 0), this.nextPoints.length);
    this.nextPoints.splice(insertionIndex, 0, { x: point.x, y: point.y });
  }

  execute(): void {
    this.graphService.setConnectionReroutePoints(this.connectionId, this.nextPoints);
  }

  undo(): void {
    this.graphService.setConnectionReroutePoints(this.connectionId, this.originalPoints);
  }
}

export class MoveConnectionReroutePointCommand implements Command {
  description = 'Move Reroute Point';
  private originalPoints: ReroutePoint[];
  private nextPoints: ReroutePoint[];

  constructor(
    private graphService: GraphService,
    private connectionId: string,
    private pointIndex: number,
    point: ReroutePoint,
    explicitOriginalPoints?: readonly ReroutePoint[],
  ) {
    const conn = this.graphService.connections().find(c => c.id === connectionId);
    this.originalPoints = structuredClone([...(explicitOriginalPoints ?? conn?.reroutePoints ?? [])]);
    this.nextPoints = structuredClone(this.originalPoints);
    if (this.pointIndex >= 0 && this.pointIndex < this.nextPoints.length) {
      this.nextPoints[this.pointIndex] = { x: point.x, y: point.y };
    }
  }

  execute(): void {
    this.graphService.setConnectionReroutePoints(this.connectionId, this.nextPoints);
  }

  undo(): void {
    this.graphService.setConnectionReroutePoints(this.connectionId, this.originalPoints);
  }
}

export class RemoveConnectionReroutePointCommand implements Command {
  description = 'Remove Reroute Point';
  private originalPoints: ReroutePoint[];
  private nextPoints: ReroutePoint[];

  constructor(
    private graphService: GraphService,
    private connectionId: string,
    pointIndex: number,
  ) {
    const conn = this.graphService.connections().find(c => c.id === connectionId);
    this.originalPoints = structuredClone(conn?.reroutePoints ?? []);
    this.nextPoints = structuredClone(this.originalPoints);
    if (pointIndex >= 0 && pointIndex < this.nextPoints.length) {
      this.nextPoints.splice(pointIndex, 1);
    }
  }

  execute(): void {
    this.graphService.setConnectionReroutePoints(this.connectionId, this.nextPoints);
  }

  undo(): void {
    this.graphService.setConnectionReroutePoints(this.connectionId, this.originalPoints);
  }
}

export class SetConnectionColorCommand implements Command {
  description = 'Set Connection Color';
  private originalColor: string | null;

  constructor(
    private graphService: GraphService,
    private connectionId: string,
    private newColor: string | null,
  ) {
    const conn = this.graphService.connections().find(c => c.id === connectionId);
    this.originalColor = conn?.color ?? null;
  }

  execute(): void {
    this.graphService.setConnectionColor(this.connectionId, this.newColor);
  }

  undo(): void {
    this.graphService.setConnectionColor(this.connectionId, this.originalColor);
  }
}

export class SetConnectionArrowheadCommand implements Command {
  description = 'Set Connection Arrowhead';
  private originalType: ArrowheadType;

  constructor(
    private graphService: GraphService,
    private connectionId: string,
    private end: ArrowheadEnd,
    private newType: ArrowheadType,
  ) {
    const conn = this.graphService.connections().find(c => c.id === connectionId);
    // Capture the effective value so undo restores the exact rendered state,
    // whether the original was stored explicitly or left at its default.
    this.originalType = conn ? effectiveArrowhead(conn, end) : defaultArrowhead(end);
  }

  execute(): void {
    this.graphService.setConnectionArrowhead(this.connectionId, this.end, this.newType);
  }

  undo(): void {
    this.graphService.setConnectionArrowhead(this.connectionId, this.end, this.originalType);
  }
}

export class SetConnectionStrokePatternCommand implements Command {
  description = 'Set Connection Stroke Pattern';
  private originalPattern: StrokePattern;

  constructor(
    private graphService: GraphService,
    private connectionId: string,
    private newPattern: StrokePattern,
  ) {
    const conn = this.graphService.connections().find(c => c.id === connectionId);
    // Capture the effective value so undo restores the exact rendered state,
    // whether the original was stored explicitly or left at its default.
    this.originalPattern = conn ? effectiveStrokePattern(conn) : DEFAULT_STROKE_PATTERN;
  }

  execute(): void {
    this.graphService.setConnectionStrokePattern(this.connectionId, this.newPattern);
  }

  undo(): void {
    this.graphService.setConnectionStrokePattern(this.connectionId, this.originalPattern);
  }
}

export class SetConnectionStrokeWeightCommand implements Command {
  description = 'Set Connection Stroke Weight';
  private originalWeight: StrokeWeight;

  constructor(
    private graphService: GraphService,
    private connectionId: string,
    private newWeight: StrokeWeight,
  ) {
    const conn = this.graphService.connections().find(c => c.id === connectionId);
    this.originalWeight = conn ? effectiveStrokeWeight(conn) : DEFAULT_STROKE_WEIGHT;
  }

  execute(): void {
    this.graphService.setConnectionStrokeWeight(this.connectionId, this.newWeight);
  }

  undo(): void {
    this.graphService.setConnectionStrokeWeight(this.connectionId, this.originalWeight);
  }
}

// Compound command for deleting a node and its connections as a single undoable action
export class DeleteNodeCompoundCommand implements Command {
  description = 'Delete Node';
  private deleteNodeCmd: DeleteNodeCommand;

  constructor(
    private graphService: GraphService,
    private nodeId: string,
  ) {
    this.deleteNodeCmd = new DeleteNodeCommand(graphService, nodeId);
  }

  execute(): void {
    this.deleteNodeCmd.execute();
  }

  undo(): void {
    this.deleteNodeCmd.undo();
  }
}

export class CreateGroupCommand implements Command {
  description = 'Create Group';
  private group: GraphNode | null = null;

  constructor(
    private graphService: GraphService,
    private label: string,
    private x: number,
    private y: number,
  ) {}

  execute(): void {
    this.group = this.graphService.createGroup(this.label, this.x, this.y);
  }

  undo(): void {
    if (this.group) {
      this.graphService.deleteNode(this.group.id);
    }
  }

  getGroup(): GraphNode | null {
    return this.group;
  }
}

export class ChangeParentCommand implements Command {
  description = 'Change Group Membership';
  private originalParentId: string | null;

  constructor(
    private graphService: GraphService,
    private nodeId: string,
    private newParentId: string | null,
  ) {
    const node = this.graphService.nodes().find(n => n.id === nodeId);
    this.originalParentId = node?.parentId ?? null;
  }

  execute(): void {
    this.graphService.setNodeParent(this.nodeId, this.newParentId);
  }

  undo(): void {
    this.graphService.setNodeParent(this.nodeId, this.originalParentId);
  }
}

export class MoveGroupCommand implements Command {
  description = 'Move Group';

  constructor(
    private graphService: GraphService,
    private groupId: string,
    private newX: number,
    private newY: number,
    private originalX: number,
    private originalY: number,
  ) {}

  execute(): void {
    this.graphService.moveGroup(this.groupId, this.newX, this.newY);
  }

  undo(): void {
    this.graphService.moveGroup(this.groupId, this.originalX, this.originalY);
  }
}

export class ResizeNodeCommand implements Command {
  description = 'Resize Node';

  constructor(
    private graphService: GraphService,
    private nodeId: string,
    private newRect: NodeRect,
    private originalRect: NodeRect,
  ) {}

  execute(): void {
    this.graphService.resizeNode(this.nodeId, this.newRect);
  }

  undo(): void {
    this.graphService.resizeNode(this.nodeId, this.originalRect);
  }
}

export class SetNodeColorCommand implements Command {
  description = 'Set Node Color';
  private originalColor: string | null;

  constructor(
    private graphService: GraphService,
    private nodeId: string,
    private newColor: string | null,
  ) {
    const node = this.graphService.nodes().find(n => n.id === nodeId);
    this.originalColor = node?.color ?? null;
  }

  execute(): void {
    this.graphService.setNodeColor(this.nodeId, this.newColor);
  }

  undo(): void {
    this.graphService.setNodeColor(this.nodeId, this.originalColor);
  }
}

export class SetNodeShapeCommand implements Command {
  description = 'Set Node Shape';
  private originalShape: NodeShape;
  private originalRect: NodeRect;
  private appliedRect: NodeRect | null = null;

  constructor(
    private graphService: GraphService,
    private nodeId: string,
    private newShape: NodeShape,
  ) {
    const node = this.graphService.nodes().find(n => n.id === nodeId);
    this.originalShape = effectiveNodeShape(node?.shape);
    this.originalRect = {
      x: node?.x ?? 0,
      y: node?.y ?? 0,
      width: node?.width ?? 0,
      height: node?.height ?? 0,
    };
  }

  execute(): void {
    this.graphService.setNodeShape(this.nodeId, this.newShape);
    if (this.appliedRect) {
      this.graphService.resizeNode(this.nodeId, this.appliedRect);
    }
  }

  recordAutoResize(nodeId: string, rect: NodeRect): void {
    if (nodeId !== this.nodeId) return;
    const node = this.graphService.nodes().find(item => item.id === nodeId);
    if (node && effectiveNodeShape(node.shape) === this.newShape) {
      this.appliedRect = { ...rect };
    }
  }

  undo(): void {
    this.graphService.setNodeShape(this.nodeId, this.originalShape);
    this.graphService.resizeNode(this.nodeId, this.originalRect);
  }
}

// Generic compound: executes parts in order, undoes them in reverse order.
// Used for drops that change membership and sever Group/child connections.
export class CompoundCommand implements Command {
  constructor(
    public description: string,
    private parts: Command[],
  ) {}

  execute(): void {
    for (const part of this.parts) {
      part.execute();
    }
  }

  undo(): void {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      this.parts[i].undo();
    }
  }

  recordAutoResize(nodeId: string, rect: NodeRect): void {
    for (const part of this.parts) {
      part.recordAutoResize?.(nodeId, rect);
    }
  }
}

// Quick-add: dropping a connection drag in empty space (no snap) spawns a
// default "New Node" anchored so its incoming Handle — the one opposite the
// source Handle, matching the ghost bezier — sits exactly at the drop point,
// already connected. Spawn, parenting, and Connection are one undo step; the
// auto-opened Text edit commits separately as its own SetNodeTextCommand.
export class QuickAddNodeCommand implements Command {
  description = 'Quick-add Node';
  private node: GraphNode | null = null;

  constructor(
    private graphService: GraphService,
    private sourceNodeId: string,
    private sourceHandle: HandleSide,
    private dropX: number,
    private dropY: number,
  ) {}

  execute(): void {
    const width = 160;
    const height = 48;
    // Position the node so its incoming Handle lands on the drop point
    let x: number;
    let y: number;
    switch (this.sourceHandle) {
      case 'right': // incoming left Handle
        x = this.dropX;
        y = this.dropY - height / 2;
        break;
      case 'left': // incoming right Handle
        x = this.dropX - width;
        y = this.dropY - height / 2;
        break;
      case 'bottom': // incoming top Handle
        x = this.dropX - width / 2;
        y = this.dropY;
        break;
      case 'top': // incoming bottom Handle
        x = this.dropX - width / 2;
        y = this.dropY - height;
        break;
    }

    this.node = this.graphService.createNode('New Node', x, y);
    // Containment by drop point, except when the source IS that Group: a
    // Group can never connect to its own child, and the Connection — what
    // the gesture was about — wins over parenting
    const group = this.graphService.findGroupAt(this.dropX, this.dropY);
    if (group && group.id !== this.sourceNodeId) {
      this.graphService.setNodeParent(this.node.id, group.id);
    }
    this.graphService.createConnection(
      this.sourceNodeId, this.sourceHandle,
      this.node.id, oppositeHandle(this.sourceHandle),
    );
    // Selection lives in execute so redo re-selects (Paste precedent)
    this.graphService.selectNode(this.node.id);
  }

  undo(): void {
    if (!this.node) return;
    // deleteNode cascade-deletes the Connection created alongside and prunes
    // the spawned Node from the Selection
    this.graphService.deleteNode(this.node.id);
  }

  getNodeId(): string | null {
    return this.node?.id ?? null;
  }
}

// Inserts a prepared set of elements (ids already generated) as one undo
// step — the single Command behind Paste, Duplicate, and Alt+drag duplicate.
// undo removes exactly the set without a prior execute, so Alt+drag can
// create transiently during the gesture and push-without-execute on drop.
export class InsertElementsCommand implements Command {
  private nodes: GraphNode[];
  private connections: Connection[];
  private pins: Pin[];

  constructor(
    private graphService: GraphService,
    public description: string,
    nodes: GraphNode[],
    connections: Connection[],
    pins: Pin[] = [],
  ) {
    // Deep copy so later graph mutations can't alias into the redo snapshot
    this.nodes = structuredClone(nodes);
    this.connections = structuredClone(connections);
    this.pins = structuredClone(pins);
  }

  execute(): void {
    this.graphService.nodes.update(nodes => [...nodes, ...structuredClone(this.nodes)]);
    if (this.connections.length > 0) {
      this.graphService.connections.update(conns => [...conns, ...structuredClone(this.connections)]);
    }
    if (this.pins.length > 0) {
      this.graphService.pins.update(current => [...current, ...structuredClone(this.pins)]);
    }
    // The new copies become the Selection (ADR-0015); normalization keeps
    // inserted Group children implicit. Pins never join the Selection.
    this.graphService.setSelection(
      this.nodes.map(n => n.id),
      this.connections.map(c => c.id),
    );
  }

  undo(): void {
    const nodeIds = new Set(this.nodes.map(n => n.id));
    const connIds = new Set(this.connections.map(c => c.id));
    const pinIds = new Set(this.pins.map(p => p.id));
    this.graphService.nodes.update(nodes => nodes.filter(n => !nodeIds.has(n.id)));
    this.graphService.connections.update(conns => conns.filter(c => !connIds.has(c.id)));
    this.graphService.pins.update(current => current.filter(p => !pinIds.has(p.id)));
    // Removed elements leave the Selection; anything else selected stays
    this.graphService.setSelection(
      this.graphService.selectedNodeIds().filter(id => !nodeIds.has(id)),
      this.graphService.selectedConnectionIds().filter(id => !connIds.has(id)),
    );
  }
}

// ---------------------------------------------------------------------------
// Selection-scale factories (ADR-0015): each builds ONE compound Command for
// an operation over the whole Selection, so bulk gestures stay single undo
// steps. All return null when the operation would change nothing.
// ---------------------------------------------------------------------------

/**
 * Delete the whole Selection as one undo step. Explicitly selected
 * Connections go first; then, per selected Group, its children and the Group
 * itself (a Group in a multi-delete is removed WITH its children — the
 * deliberate divergence from single-Group Delete, which releases them);
 * loose selected Nodes last. Node deletion cascades touching Connections.
 */
export function buildDeleteSelectionCommand(
  graphService: GraphService,
  nodeIds: readonly string[],
  connectionIds: readonly string[],
): Command | null {
  const parts: Command[] = [];

  for (const connId of connectionIds) {
    parts.push(new DeleteConnectionCommand(graphService, connId));
  }

  const nodes = graphService.nodes();
  for (const nodeId of nodeIds) {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) continue;
    if (node.kind === 'group') {
      // Children first, then the Group: reverse-order undo restores the
      // Group before the children re-claim their parentId (Cut precedent)
      for (const child of nodes.filter(n => n.parentId === nodeId)) {
        parts.push(new DeleteNodeCommand(graphService, child.id));
      }
    }
    parts.push(new DeleteNodeCommand(graphService, nodeId));
  }

  return parts.length > 0 ? new CompoundCommand('Delete Selection', parts) : null;
}

/**
 * Recolor every given Node as one undo step, skipping Nodes already carrying
 * the color so unchanged elements add no dead undo weight.
 */
export function buildSetNodesColorCommand(
  graphService: GraphService,
  nodeIds: readonly string[],
  color: string | null,
): Command | null {
  const nodes = graphService.nodes();
  const parts = nodeIds
    .filter(id => {
      const node = nodes.find(n => n.id === id);
      return node !== undefined && (node.color ?? null) !== color;
    })
    .map(id => new SetNodeColorCommand(graphService, id, color));
  return parts.length > 0 ? new CompoundCommand('Set Node Color', parts) : null;
}

/** Set every given regular Node's Shape as one undo step, skipping no-ops. */
export function buildSetNodesShapeCommand(
  graphService: GraphService,
  nodeIds: readonly string[],
  shape: NodeShape,
): Command | null {
  const nodes = graphService.nodes();
  const parts = nodeIds
    .filter(id => {
      const node = nodes.find(n => n.id === id);
      return node !== undefined && node.kind !== 'group' && effectiveNodeShape(node.shape) !== shape;
    })
    .map(id => new SetNodeShapeCommand(graphService, id, shape));
  return parts.length > 0 ? new CompoundCommand('Set Node Shape', parts) : null;
}

/** Recolor every given Connection as one undo step, skipping no-ops. */
export function buildSetConnectionsColorCommand(
  graphService: GraphService,
  connectionIds: readonly string[],
  color: string | null,
): Command | null {
  const conns = graphService.connections();
  const parts = connectionIds
    .filter(id => {
      const conn = conns.find(c => c.id === id);
      return conn !== undefined && (conn.color ?? null) !== color;
    })
    .map(id => new SetConnectionColorCommand(graphService, id, color));
  return parts.length > 0 ? new CompoundCommand('Set Connection Color', parts) : null;
}

/** Restyle one Arrowhead end of every given Connection as one undo step, skipping no-ops. */
export function buildSetConnectionsArrowheadCommand(
  graphService: GraphService,
  connectionIds: readonly string[],
  end: ArrowheadEnd,
  type: ArrowheadType,
): Command | null {
  const conns = graphService.connections();
  const parts = connectionIds
    .filter(id => {
      const conn = conns.find(c => c.id === id);
      return conn !== undefined && effectiveArrowhead(conn, end) !== type;
    })
    .map(id => new SetConnectionArrowheadCommand(graphService, id, end, type));
  return parts.length > 0 ? new CompoundCommand('Set Connection Arrowhead', parts) : null;
}

/** Restyle the Stroke Pattern of every given Connection as one undo step, skipping no-ops. */
export function buildSetConnectionsStrokePatternCommand(
  graphService: GraphService,
  connectionIds: readonly string[],
  pattern: StrokePattern,
): Command | null {
  const conns = graphService.connections();
  const parts = connectionIds
    .filter(id => {
      const conn = conns.find(c => c.id === id);
      return conn !== undefined && effectiveStrokePattern(conn) !== pattern;
    })
    .map(id => new SetConnectionStrokePatternCommand(graphService, id, pattern));
  return parts.length > 0 ? new CompoundCommand('Set Connection Stroke Pattern', parts) : null;
}

/** Restyle the Stroke Weight of every given Connection as one undo step, skipping no-ops. */
export function buildSetConnectionsStrokeWeightCommand(
  graphService: GraphService,
  connectionIds: readonly string[],
  weight: StrokeWeight,
): Command | null {
  const conns = graphService.connections();
  const parts = connectionIds
    .filter(id => {
      const conn = conns.find(c => c.id === id);
      return conn !== undefined && effectiveStrokeWeight(conn) !== weight;
    })
    .map(id => new SetConnectionStrokeWeightCommand(graphService, id, weight));
  return parts.length > 0 ? new CompoundCommand('Set Connection Stroke Weight', parts) : null;
}

// Align/Distribute participants (spec #25, ADR-0018): the Selection's roots
// only — a child whose Group is also in the set rides with the Group and is
// never an independent rect. Groups participate as their own frame.
function selectionRootRects(graphService: GraphService, nodeIds: readonly string[]): { roots: GraphNode[]; rects: RootRect[] } {
  const idSet = new Set(nodeIds);
  const roots = graphService.nodes().filter(
    n => idSet.has(n.id) && !(n.parentId && idSet.has(n.parentId)),
  );
  return { roots, rects: roots.map(n => ({ id: n.id, x: n.x, y: n.y, width: n.width, height: n.height })) };
}

// One move part per target: a Group moves rigidly with its children
// (ADR-0005) — membership is never touched (ADR-0018).
function movePartsFor(graphService: GraphService, roots: GraphNode[], targets: TargetPosition[]): Command[] {
  const byId = new Map(roots.map(n => [n.id, n]));
  return targets.map(t => {
    const node = byId.get(t.id)!;
    return node.kind === 'group'
      ? new MoveGroupCommand(graphService, t.id, t.x, t.y, node.x, node.y)
      : new MoveNodeCommand(graphService, t.id, t.x, t.y);
  });
}

const ALIGN_DESCRIPTIONS: Record<AlignKind, string> = {
  left: 'Align left',
  center: 'Align horizontal center',
  right: 'Align right',
  top: 'Align top',
  middle: 'Align vertical middle',
  bottom: 'Align bottom',
};

/**
 * Align the Selection's roots along one axis of their union box as one undo
 * step. Roots already in place add no parts; null when nothing would move.
 */
export function buildAlignSelectionCommand(
  graphService: GraphService,
  nodeIds: readonly string[],
  kind: AlignKind,
): Command | null {
  const { roots, rects } = selectionRootRects(graphService, nodeIds);
  const parts = movePartsFor(graphService, roots, alignRects(rects, kind));
  return parts.length > 0 ? new CompoundCommand(ALIGN_DESCRIPTIONS[kind], parts) : null;
}

/**
 * Equalize the edge gaps between the Selection's roots along one axis as one
 * undo step, the two outermost roots anchored. Null when nothing would move.
 */
export function buildDistributeSelectionCommand(
  graphService: GraphService,
  nodeIds: readonly string[],
  axis: DistributeAxis,
): Command | null {
  const { roots, rects } = selectionRootRects(graphService, nodeIds);
  const parts = movePartsFor(graphService, roots, distributeRects(rects, axis));
  const description = axis === 'horizontal' ? 'Distribute horizontally' : 'Distribute vertically';
  return parts.length > 0 ? new CompoundCommand(description, parts) : null;
}

// Tidy up (spec #26, ADR-0019): the whole-graph layered layout as ONE undo
// step. The pure module computes the complete mutation; this Command applies
// it via applyTidyToState and undoes it from a before-snapshot of exactly the
// touched fields — positions, Group rects, Connection Handles, and Reroute
// Points. The Selection is never read or written.
export class TidyUpCommand implements Command {
  description = 'Tidy up';
  private inverse: TidyResult;

  constructor(
    private graphService: GraphService,
    private result: TidyResult,
  ) {
    const nodeById = new Map(graphService.nodes().map(n => [n.id, n]));
    const connById = new Map(graphService.connections().map(c => [c.id, c]));
    this.inverse = {
      nodePositions: result.nodePositions.map(p => {
        const n = nodeById.get(p.id)!;
        return { id: p.id, x: n.x, y: n.y };
      }),
      groupRects: result.groupRects.map(r => {
        const n = nodeById.get(r.id)!;
        return { id: r.id, x: n.x, y: n.y, width: n.width, height: n.height };
      }),
      handleAssignments: result.handleAssignments.map(h => {
        const c = connById.get(h.id)!;
        return { id: h.id, sourceHandle: c.sourceHandle, targetHandle: c.targetHandle };
      }),
      rerouteAdjustments: result.rerouteAdjustments.map(r => {
        const c = connById.get(r.id)!;
        return {
          id: r.id,
          reroutePoints: c.reroutePoints
            ? c.reroutePoints.map(p => ({ x: p.x, y: p.y }))
            : null,
        };
      }),
    };
  }

  execute(): void {
    this.apply(this.result);
  }

  undo(): void {
    this.apply(this.inverse);
  }

  private apply(result: TidyResult): void {
    const applied = applyTidyToState(
      this.graphService.nodes(),
      this.graphService.connections(),
      result,
    );
    this.graphService.nodes.set(applied.nodes);
    this.graphService.connections.set(applied.connections);
  }
}

/**
 * Tidy up the whole graph as one undo step. Null when there is nothing to
 * do — an empty graph or one that is already tidy pushes no History entry.
 */
export function buildTidyUpCommand(graphService: GraphService): Command | null {
  const result = tidyLayout(graphService.nodes(), graphService.connections());
  return isTidyEmpty(result) ? null : new TidyUpCommand(graphService, result);
}
