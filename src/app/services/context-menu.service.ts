import { Injectable, inject, signal, computed } from '@angular/core';
import { GraphService } from './graph.service';
import { HistoryService } from './history.service';
import { ClipboardService } from './clipboard.service';
import { ExportDialogService } from './export-dialog.service';
import {
  CreateNodeCommand, CreateGroupCommand, DeleteNodeCompoundCommand, DeleteConnectionCommand,
  DeletePinCommand, AddConnectionReroutePointCommand,
  buildDeleteSelectionCommand, buildAlignSelectionCommand, buildDistributeSelectionCommand,
} from './commands';
import { AlignKind, DistributeAxis } from '../models/align-distribute';
import { ExportScopeRequest } from '../models/export-image';
import { PinAnchor } from '../models/pin';
import { MAX_REROUTE_POINTS } from '../models/connection';
import { connectionRoute, routePointAt } from '../models/curve';

/** What a right-click landed on, and — for the empty Canvas — nothing more. */
export type ContextTarget =
  | { kind: 'canvas' }
  | { kind: 'node'; nodeId: string }
  | { kind: 'connection'; connectionId: string }
  | { kind: 'pin'; pinId: string };

// New Node / New Group placement, centered on the right-click point. The Node
// x-offset is 60 (matching the existing double-click create), not width/2.
const NODE_OFFSET_X = 60;
const NODE_OFFSET_Y = 24;
const GROUP_OFFSET_X = 160;
const GROUP_OFFSET_Y = 100;

@Injectable({ providedIn: 'root' })
export class ContextMenuService {
  private graphService = inject(GraphService);
  private historyService = inject(HistoryService);
  private clipboardService = inject(ClipboardService);
  private exportDialogService = inject(ExportDialogService);

  // The context the currently-open menu acts on, plus the canvas-coordinate
  // point of the right-click (where empty-Canvas creations are centered).
  private target = signal<ContextTarget | null>(null);
  private pointX = 0;
  private pointY = 0;
  // Captured after openFor applies the target/Selection keep-or-collapse rule;
  // later graph or Selection changes cannot change the requested artifact.
  private exportScopeRequest: ExportScopeRequest = { rootIds: [], isMultiSelection: false };

  // Requests for the thin UI to open an existing inline editor. The Node and
  // Connection-Layer components watch these and clear them once consumed.
  readonly renameRequest = signal<string | null>(null);
  readonly editTextRequest = signal<string | null>(null);
  readonly connectionTextRequest = signal<string | null>(null);

  // Ghost-pin creation (ADR-0025): the anchor the Pin popover component
  // should open at. Nothing enters Graph State until a non-empty commit —
  // that commit is the CreatePinCommand.
  readonly pinCreateRequest = signal<PinAnchor | null>(null);
  readonly pinEditRequest = signal<string | null>(null);

  // Which menu the thin UI should render for the currently-open context.
  // Right-clicking a member of a multi-Selection keeps the set and shows the
  // multi menu; a non-member collapsed to a single target in openFor.
  readonly menuKind = computed(() => {
    const t = this.target();
    if (!t) return null;
    if (this.graphService.selectionSize() > 1) {
      if (t.kind === 'node' && this.graphService.isNodeSelected(t.nodeId)) return 'multi';
      if (t.kind === 'connection' && this.graphService.isConnectionSelected(t.connectionId)) return 'multi';
    }
    return t.kind;
  });

  // A node target shows "Add node" only when it is a Group. Reads nodes()
  // inside the computed so it stays correct if the target Group is mutated.
  readonly targetIsGroup = computed(() => {
    const t = this.target();
    return t?.kind === 'node' && this.isGroup(t.nodeId);
  });

  // Drives the Paste item's disabled state — the menu shape stays stable
  readonly canPaste = this.clipboardService.canPaste;

  /** Clear the menu target — called when the overlay closes (dismiss or action). */
  clear(): void {
    this.target.set(null);
  }

  /**
   * Prime the menu for a right-click. A target that is already part of a
   * multi-Selection keeps the whole Selection (the menu acts on the set);
   * any other target collapses the Selection to itself, and the empty
   * Canvas clears it.
   */
  openFor(target: ContextTarget, canvasX: number, canvasY: number): void {
    this.target.set(target);
    this.pointX = canvasX;
    this.pointY = canvasY;

    switch (target.kind) {
      case 'node':
        if (!this.graphService.isNodeSelected(target.nodeId)) {
          this.graphService.selectNode(target.nodeId);
        }
        break;
      case 'connection':
        if (!this.graphService.isConnectionSelected(target.connectionId)) {
          this.graphService.selectConnection(target.connectionId);
        }
        break;
      case 'canvas':
        this.graphService.clearSelection();
        break;
      case 'pin':
        // Pins never join the Selection — the current Selection stays as-is
        break;
    }

    const isMultiSelection = this.menuKind() === 'multi';
    this.exportScopeRequest = {
      rootIds: isMultiSelection
        ? [...this.graphService.selectedNodeIds()]
        : target.kind === 'node' ? [target.nodeId] : [],
      isMultiSelection,
    };
  }

  /**
   * Create a "New Node" (160x48) centered on the right-click point. When the
   * menu was opened on a Group, the node becomes a child of that Group.
   */
  addNode(): void {
    const target = this.target();
    if (!target) return;
    const parentId =
      target.kind === 'node' && this.isGroup(target.nodeId) ? target.nodeId : undefined;
    this.historyService.execute(
      new CreateNodeCommand(
        this.graphService,
        'New Node',
        this.pointX - NODE_OFFSET_X,
        this.pointY - NODE_OFFSET_Y,
        parentId,
      ),
    );
  }

  /** Create a "New Group" (320x200) centered on the right-click point. */
  addGroup(): void {
    this.historyService.execute(
      new CreateGroupCommand(
        this.graphService,
        'New Group',
        this.pointX - GROUP_OFFSET_X,
        this.pointY - GROUP_OFFSET_Y,
      ),
    );
  }

  private isGroup(nodeId: string): boolean {
    return this.graphService.nodes().find(n => n.id === nodeId)?.kind === 'group';
  }

  /**
   * Request a ghost-pin at the right-click point: anchored to the Canvas, or
   * to the Node/Group target at an offset from its top-left. The popover
   * opens; Graph State and History stay untouched until a non-empty commit.
   */
  addPin(): void {
    const target = this.target();
    if (!target) return;
    if (target.kind === 'canvas') {
      this.pinCreateRequest.set({ kind: 'canvas', x: this.pointX, y: this.pointY });
      return;
    }
    if (target.kind === 'node') {
      const node = this.graphService.nodes().find(n => n.id === target.nodeId);
      if (!node) return;
      this.pinCreateRequest.set({
        kind: 'node', nodeId: node.id,
        offsetX: this.pointX - node.x, offsetY: this.pointY - node.y,
      });
    }
  }

  /** Request ghost-pin creation without opening a Context Menu (Palette path). */
  requestCreatePin(anchor: PinAnchor): void {
    this.pinCreateRequest.set(anchor);
  }

  clearPinCreateRequest(): void {
    this.pinCreateRequest.set(null);
  }

  /** Ask the UI to open the target Pin's editor (Popover component consumes). */
  editPin(): void {
    const target = this.target();
    if (target?.kind === 'pin') {
      this.pinEditRequest.set(target.pinId);
    }
  }

  clearPinEditRequest(): void {
    this.pinEditRequest.set(null);
  }

  /** Delete the target Pin — the same removal Command an empty commit runs. */
  deletePin(): void {
    const target = this.target();
    if (target?.kind === 'pin') {
      this.historyService.execute(new DeletePinCommand(this.graphService, target.pinId));
    }
  }

  /**
   * Delete the target — a Node with its Connections (one compound undo step),
   * or a lone Connection — matching the Delete/Backspace shortcut exactly.
   */
  deleteTarget(): void {
    const target = this.target();
    if (!target) return;
    if (target.kind === 'node') {
      this.historyService.execute(new DeleteNodeCompoundCommand(this.graphService, target.nodeId));
    } else if (target.kind === 'connection') {
      this.historyService.execute(new DeleteConnectionCommand(this.graphService, target.connectionId));
    }
  }

  /** Ask the UI to open the target Group's inline Label editor (Groups only). */
  rename(): void {
    const target = this.target();
    if (target?.kind === 'node' && this.isGroup(target.nodeId)) {
      this.renameRequest.set(target.nodeId);
    }
  }

  clearRenameRequest(): void {
    this.renameRequest.set(null);
  }

  /** Request an inline Group Label editor without opening a Context Menu. */
  requestRename(nodeId: string): void {
    if (this.isGroup(nodeId)) this.renameRequest.set(nodeId);
  }

  /** Ask the UI to open the target Node's or Connection's Text editor. */
  editText(): void {
    const target = this.target();
    if (target?.kind === 'node' && !this.isGroup(target.nodeId)) {
      this.editTextRequest.set(target.nodeId);
    } else if (target?.kind === 'connection') {
      this.connectionTextRequest.set(target.connectionId);
    }
  }

  /** Request an inline Text editor without opening a Context Menu. */
  requestEditText(nodeId: string): void {
    if (this.isGroup(nodeId)) return;
    this.editTextRequest.set(nodeId);
  }

  /** Request an inline Connection Text editor without opening a Context Menu. */
  requestConnectionText(connectionId: string): void {
    this.connectionTextRequest.set(connectionId);
  }

  /** Keyboard Enter on a focused Pin: open its edit popover. */
  requestEditPin(pinId: string): void {
    this.pinEditRequest.set(pinId);
  }

  /** Context Menu "Add Reroute Point": same action on the right-clicked Connection. */
  addReroutePoint(): void {
    const target = this.target();
    if (target?.kind !== 'connection') return;
    this.addReroutePointToConnection(target.connectionId);
  }

  /**
   * "Add Reroute Point": append a point at the route's midpoint (the route's
   * default text position) and focus it, so arrows move it immediately (shape
   * brief). Silent past the drag path's 32-point ceiling, matching the mouse
   * add's guard. Shared by the Connection Context Menu and the Command
   * Palette (which acts on the selected Connection).
   */
  addReroutePointToConnection(connectionId: string): void {
    const conn = this.graphService.connections().find(c => c.id === connectionId);
    if (!conn) return;
    const points = conn.reroutePoints ?? [];
    if (points.length >= MAX_REROUTE_POINTS) return;
    const start = this.graphService.getHandlePosition(conn.sourceNodeId, conn.sourceHandle);
    const end = this.graphService.getHandlePosition(conn.targetNodeId, conn.targetHandle);
    if (!start || !end) return;
    const route = connectionRoute(start, end, conn.sourceHandle, conn.targetHandle, conn.reroutePoints);
    const midpoint = routePointAt(route, 0.5);
    this.historyService.execute(new AddConnectionReroutePointCommand(
      this.graphService,
      conn.id,
      midpoint,
      points.length,
    ));
    // The new point renders once the Command lands; focus it so arrows move it
    queueMicrotask(() => {
      const pointEls = document.querySelectorAll<SVGCircleElement>(
        `.reroute-point[data-connection-id="${conn.id}"]`,
      );
      pointEls[pointEls.length - 1]?.focus();
    });
  }

  // Clipboard actions apply to Nodes and Groups only — a Connection or the
  // empty Canvas is a silent no-op, matching the shortcut convention.

  /** Copy the target Node or Group onto the Clipboard. Never touches History. */
  copyTarget(): void {
    const target = this.target();
    if (target?.kind === 'node') {
      this.clipboardService.copy(target.nodeId);
    }
  }

  /** Cut the target Node or Group: copy, then remove as one undo step. */
  cutTarget(): void {
    const target = this.target();
    if (target?.kind === 'node') {
      this.clipboardService.cut(target.nodeId);
    }
  }

  /**
   * Paste centered on the right-click point. On a Group target the pasted
   * nodes become its children (mirroring "Add node"); on the Canvas they
   * land parentless.
   */
  pasteHere(): void {
    const target = this.target();
    if (!target) return;
    const parentGroupId =
      target.kind === 'node' && this.isGroup(target.nodeId) ? target.nodeId : undefined;
    this.clipboardService.pasteAt(this.pointX, this.pointY, parentGroupId);
  }

  /** Duplicate the target Node or Group at +24,+24 — Clipboard untouched. */
  duplicateTarget(): void {
    const target = this.target();
    if (target?.kind === 'node') {
      this.clipboardService.duplicate(target.nodeId);
    }
  }

  clearEditTextRequest(): void {
    this.editTextRequest.set(null);
  }

  clearConnectionTextRequest(): void {
    this.connectionTextRequest.set(null);
  }

  /** Open the existing Export as… dialog for the frozen Node/Group roots. */
  exportPng(): void {
    const kind = this.menuKind();
    if (kind !== 'node' && kind !== 'multi') return;
    this.exportDialogService.requestOpen(undefined, this.exportScopeRequest);
  }

  // Multi-Selection menu actions (ADR-0015): each acts on the whole
  // Selection. Cut/Copy/Duplicate stay Node/Group operations — with no Node
  // in the Selection they are silent no-ops, matching the shortcuts.

  cutSelection(): void {
    const nodeIds = this.graphService.selectedNodeIds();
    if (nodeIds.length === 0) return;
    this.clipboardService.cut(nodeIds, this.graphService.selectedConnectionIds());
  }

  copySelection(): void {
    const nodeIds = this.graphService.selectedNodeIds();
    if (nodeIds.length === 0) return;
    this.clipboardService.copy(nodeIds);
  }

  duplicateSelection(): void {
    const nodeIds = this.graphService.selectedNodeIds();
    if (nodeIds.length === 0) return;
    this.clipboardService.duplicate(nodeIds);
  }

  /** Delete the whole Selection as one compound undo step. */
  deleteSelection(): void {
    const cmd = buildDeleteSelectionCommand(
      this.graphService,
      this.graphService.selectedNodeIds(),
      this.graphService.selectedConnectionIds(),
    );
    if (cmd) this.historyService.execute(cmd);
  }

  // Align/Distribute (spec #25, ADR-0018): participants are the Selection's
  // node roots — selectedNodeIds is already normalized, so its length counts
  // them. Connections in the Selection just follow their endpoints.

  readonly canAlign = computed(() => this.graphService.selectedNodeIds().length >= 2);
  readonly canDistribute = computed(() => this.graphService.selectedNodeIds().length >= 3);

  /** Align the Selection's roots as one undo step; silent no-op when flush. */
  alignSelection(kind: AlignKind): void {
    const cmd = buildAlignSelectionCommand(
      this.graphService,
      this.graphService.selectedNodeIds(),
      kind,
    );
    if (cmd) this.historyService.execute(cmd);
  }

  /** Distribute the Selection's roots as one undo step; silent no-op when even. */
  distributeSelection(axis: DistributeAxis): void {
    const cmd = buildDistributeSelectionCommand(
      this.graphService,
      this.graphService.selectedNodeIds(),
      axis,
    );
    if (cmd) this.historyService.execute(cmd);
  }
}
