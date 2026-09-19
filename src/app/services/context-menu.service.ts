import { Injectable, inject, signal, computed } from '@angular/core';
import { GraphService } from './graph.service';
import { HistoryService } from './history.service';
import { ClipboardService } from './clipboard.service';
import {
  CreateNodeCommand, CreateGroupCommand, CreateTextBlockCommand,
  DeletePinCommand, AddConnectionReroutePointCommand,
  buildDeleteSelectionCommand, buildAlignSelectionCommand, buildDistributeSelectionCommand,
} from './commands';
import { AlignKind, DistributeAxis } from '../models/align-distribute';
import { PinAnchor } from '../models/pin';
import { MAX_REROUTE_POINTS } from '../models/connection';
import { connectionRoute, routePointAt } from '../models/curve';

/**
 * What a right-click landed on: the empty Canvas, or a Pin. Element actions
 * (Nodes, Groups, Text Blocks, Connections, multi-Selections) live in the
 * Selection Toolbar — right-clicks there are swallowed, never a menu.
 */
export type ContextTarget =
  | { kind: 'canvas' }
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

  // The context the currently-open menu acts on, plus the canvas-coordinate
  // point of the right-click (where empty-Canvas creations are centered).
  private target = signal<ContextTarget | null>(null);
  private pointX = 0;
  private pointY = 0;

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

  // Which menu the thin UI should render for the currently-open context:
  // the empty Canvas, or a Pin (which never joins the Selection).
  readonly menuKind = computed(() => {
    const t = this.target();
    if (!t) return null;
    return t.kind;
  });

  // The Pin target of the open menu, if any — Pins never join the
  // Selection, so the Selection Toolbar reads this for its Pin case.
  readonly activePinId = computed(() => {
    const t = this.target();
    return t?.kind === 'pin' ? t.pinId : null;
  });

  // Drives the Paste item's disabled state — the menu shape stays stable
  readonly canPaste = this.clipboardService.canPaste;

  /** Clear the menu target — called when the overlay closes (dismiss or action). */
  clear(): void {
    this.target.set(null);
  }

  /**
   * Prime the menu for a right-click: the empty Canvas clears the Selection,
   * a Pin leaves it untouched (Pins never join the Selection).
   */
  openFor(target: ContextTarget, canvasX: number, canvasY: number): void {
    this.target.set(target);
    this.pointX = canvasX;
    this.pointY = canvasY;

    if (target.kind === 'canvas') {
      this.graphService.clearSelection();
    }
  }

  /** Create a "New Node" (160x48) centered on the right-click point. */
  addNode(): void {
    this.historyService.execute(
      new CreateNodeCommand(
        this.graphService,
        'New Node',
        this.pointX - NODE_OFFSET_X,
        this.pointY - NODE_OFFSET_Y,
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

  /**
   * Create a "New Text Block" (160x48) centered on the right-click point.
   */
  addTextBlock(): void {
    this.historyService.execute(
      new CreateTextBlockCommand(
        this.graphService,
        'New Text Block',
        this.pointX - NODE_OFFSET_X,
        this.pointY - NODE_OFFSET_Y,
      ),
    );
  }

  /**
   * Request a ghost-pin at the right-click point, anchored to the Canvas.
   * The popover opens; Graph State and History stay untouched until a
   * non-empty commit. Node-anchored Pins come from the Selection Toolbar,
   * the Command Palette, or armed placement instead.
   */
  addPin(): void {
    if (!this.target()) return;
    this.pinCreateRequest.set({ kind: 'canvas', x: this.pointX, y: this.pointY });
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

  private isGroup(nodeId: string): boolean {
    return this.graphService.nodes().find(n => n.id === nodeId)?.kind === 'group';
  }

  clearRenameRequest(): void {
    this.renameRequest.set(null);
  }

  /** Request an inline Group Label editor without opening a Context Menu. */
  requestRename(nodeId: string): void {
    if (this.isGroup(nodeId)) this.renameRequest.set(nodeId);
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

  /**
   * "Add Reroute Point": append a point at the route's midpoint (the route's
   * default text position) and focus it, so arrows move it immediately (shape
   * brief). Silent past the drag path's 32-point ceiling, matching the mouse
   * add's guard. Shared by the Selection Toolbar and the Command Palette
   * (which acts on the selected Connection).
   */
  addReroutePointToConnection(connectionId: string): void {
    const conn = this.graphService.connections().find(c => c.id === connectionId);
    if (!conn) return;
    const points = conn.reroutePoints ?? [];
    if (points.length >= MAX_REROUTE_POINTS) return;
    const start = this.graphService.getHandlePosition(conn.sourceNodeId, conn.sourceHandle);
    const end = this.graphService.getHandlePosition(conn.targetNodeId, conn.targetHandle);
    if (!start || !end) return;
    const route = connectionRoute(start, end, conn.sourceHandle, conn.targetHandle, conn.reroutePoints, conn.routeStyle);
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

  // Clipboard actions on the Selection (ADR-0015): Cut/Copy/Duplicate stay
  // Node/Group operations — with no Node in the Selection they are silent
  // no-ops, matching the shortcuts. The Selection Toolbar and the Command
  // Palette drive these; the Canvas menu offers Paste on empty Canvas.

  /** Paste the Clipboard entry centered on the right-click point. */
  pasteHere(): void {
    this.clipboardService.pasteAt(this.pointX, this.pointY);
  }

  clearEditTextRequest(): void {
    this.editTextRequest.set(null);
  }

  clearConnectionTextRequest(): void {
    this.connectionTextRequest.set(null);
  }

  // Selection actions (ADR-0015): each acts on the whole Selection.
  // Cut/Copy/Duplicate stay Node/Group operations — with no Node in the
  // Selection they are silent no-ops, matching the shortcuts.

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
