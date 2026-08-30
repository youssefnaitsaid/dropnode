import {
  Component, inject, signal, computed, ChangeDetectionStrategy,
  HostListener, ElementRef, viewChild,
} from '@angular/core';
import { CdkContextMenuTrigger } from '@angular/cdk/menu';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideSquarePlus, lucideGroup, lucidePencil, lucideTag, lucideTrash2,
  lucideScissors, lucideCopy, lucideClipboardPaste, lucideCopyPlus,
  lucideImageDown, lucideMessageCircle,
  lucideAlignStartVertical, lucideAlignCenterVertical, lucideAlignEndVertical,
  lucideAlignStartHorizontal, lucideAlignCenterHorizontal, lucideAlignEndHorizontal,
  lucideAlignHorizontalSpaceBetween, lucideAlignVerticalSpaceBetween,
  lucideMoveDiagonal2, lucideCheck, lucideMapPin,
} from '@ng-icons/lucide';
import {
  HlmDropdownMenu, HlmDropdownMenuItem, HlmDropdownMenuSub, HlmDropdownMenuSubTrigger,
  HlmDropdownMenuItemSubIndicator,
} from '@spartan-ng/helm/dropdown-menu';
import { GraphService } from '../../services/graph.service';
import { HistoryService } from '../../services/history.service';
import { ContextMenuService } from '../../services/context-menu.service';
import { ClipboardService } from '../../services/clipboard.service';
import { PresentationService } from '../../services/presentation.service';
import { ResizeModeService } from '../../services/resize-mode.service';
import { ChainHighlightService } from '../../services/chain-highlight.service';
import {
  CreateNodeCommand,
  MoveNodeCommand,
  MoveGroupCommand,
  RenameNodeCommand,
  ResizeNodeCommand,
  ChangeParentCommand,
  CompoundCommand,
  CreateConnectionCommand,
  DeleteConnectionCommand,
  SetNodeTextCommand,
  SetConnectionTextCommand,
  MoveConnectionTextCommand,
  AddConnectionReroutePointCommand,
  MoveConnectionReroutePointCommand,
  RemoveConnectionReroutePointCommand,
  QuickAddNodeCommand,
  NodeRect,
} from '../../services/commands';
import { NodeComponent, GripCorner, NodeSizeChangedEvent } from '../node/node';
import { ConnectionLayerComponent } from '../connection-layer/connection-layer';
import { PinLayerComponent } from '../pin-layer/pin-layer';
import { HandleSide, GraphNode } from '../../models/node';
import { MAX_REROUTE_POINTS, ReroutePoint, TEXT_POSITION_DEFAULT } from '../../models/connection';
import { Rect, normalizedRect, marqueeSelection, rectsOverlap } from '../../models/marquee';
import { computeAlignment, computeResizeAlignment, ALIGNMENT_SNAP_THRESHOLD, AlignmentGuide, MovingEdges } from '../../models/alignment';
import { Text } from '../../models/text';

@Component({
  selector: 'app-canvas',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NodeComponent, ConnectionLayerComponent, PinLayerComponent, NgIcon,
    CdkContextMenuTrigger, HlmDropdownMenu, HlmDropdownMenuItem,
    HlmDropdownMenuSub, HlmDropdownMenuSubTrigger, HlmDropdownMenuItemSubIndicator,
  ],
  providers: [
    provideIcons({
      lucideSquarePlus, lucideGroup, lucidePencil, lucideTag, lucideTrash2,
      lucideScissors, lucideCopy, lucideClipboardPaste, lucideCopyPlus,
      lucideImageDown, lucideMessageCircle,
      lucideAlignStartVertical, lucideAlignCenterVertical, lucideAlignEndVertical,
      lucideAlignStartHorizontal, lucideAlignCenterHorizontal, lucideAlignEndHorizontal,
      lucideAlignHorizontalSpaceBetween, lucideAlignVerticalSpaceBetween,
      lucideMoveDiagonal2, lucideCheck, lucideMapPin,
    }),
  ],
  template: `
    <div class="canvas-viewport" role="region" aria-label="Canvas" [cdkContextMenuTriggerFor]="contextMenu" (cdkContextMenuClosed)="onContextMenuClosed()">
      <div
        class="canvas-container"
        [class.panning]="isPanning"
        [class.space-pan]="spaceHeld()"
        (dblclick)="onCanvasDoubleClick($event)"
        (mousedown)="onCanvasMouseDown($event)"
        (pointerdown)="onCanvasPointerDown($event)"
        (pointermove)="onCanvasPointerMove($event)"
        (pointerup)="onCanvasPointerUp($event)"
        (pointercancel)="onCanvasPointerUp($event)"
        (contextmenu)="onContextMenu($event)"
        (wheel)="onWheel($event)"
      >
        <div
          class="canvas-transform"
          [class.transforming]="isTransforming()"
          [style.transform]="transformStyle()"
        >
          <!-- ADR-0008 stacking: Group cards, then Connections, then regular nodes,
               so Connections stay clickable over a Group's rect -->
          <div class="nodes-container">
            @for (node of groupNodes(); track node.id) {
              <app-node
                [node]="node"
                [isSelected]="graphService.isNodeSelected(node.id)"
                [soleSelected]="graphService.selectedNodeId() === node.id"
                [snapTarget]="currentSnapTarget"
                (startMove)="onNodeStartMove($event)"
                (keyboardSelect)="onKeyboardSelect($event)"
                (keyboardMove)="onKeyboardMove($event)"
                (keyboardResize)="onKeyboardResize($event)"
                (rename)="onNodeRename($event)"
                (textCommit)="onNodeTextCommit($event)"
                (handleDragStart)="onHandleDragStart($event)"
                (sizeChanged)="onNodeSizeChanged($event)"
                (startResize)="onNodeStartResize($event)"
                (createChild)="onCreateChild($event)"
                (hoverEnter)="onNodeHoverEnter($event)"
                (hoverLeave)="onNodeHoverLeave()"
              />
            }
          </div>

          <app-connection-layer
            #connectionLayer
            (connectionSelect)="onConnectionSelect($event)"
            (textDragStart)="onConnectionTextDragStart($event)"
            (textCommit)="onConnectionTextCommit($event)"
            (reroutePointAdd)="onReroutePointAdd($event)"
            (reroutePointDragStart)="onReroutePointDragStart($event)"
            (reroutePointRemove)="onReroutePointRemove($event)"
          />

          <div class="nodes-container">
            @for (node of regularNodes(); track node.id) {
              <app-node
                [node]="node"
                [isSelected]="graphService.isNodeSelected(node.id)"
                [soleSelected]="graphService.selectedNodeId() === node.id"
                [snapTarget]="currentSnapTarget"
                (startMove)="onNodeStartMove($event)"
                (keyboardSelect)="onKeyboardSelect($event)"
                (keyboardMove)="onKeyboardMove($event)"
                (keyboardResize)="onKeyboardResize($event)"
                (rename)="onNodeRename($event)"
                (textCommit)="onNodeTextCommit($event)"
                (handleDragStart)="onHandleDragStart($event)"
                (sizeChanged)="onNodeSizeChanged($event)"
                (startResize)="onNodeStartResize($event)"
                (createChild)="onCreateChild($event)"
                (hoverEnter)="onNodeHoverEnter($event)"
                (hoverLeave)="onNodeHoverLeave()"
              />
            }
          </div>

          <!-- The Pin layer rides above the nodes (ADR-0025): Pins are
               never Selection members, hidden by the global toggle and in
               Present Mode -->
          <app-pin-layer />

          <!-- The Marquee rectangle (ADR-0016), in canvas coordinates inside
               the shared transform so it scales with the graph -->
          @if (marqueeRect(); as rect) {
            <div
              class="marquee-rect"
              [style.left.px]="rect.x"
              [style.top.px]="rect.y"
              [style.width.px]="rect.width"
              [style.height.px]="rect.height"
            ></div>
          }

          <!-- Alignment Guides (issue #22, ADR-0017): transient red lines while
               dragging, in canvas coordinates, a constant 1px on screen via 1/zoom -->
          @for (guide of alignmentGuides(); track $index) {
            <div
              class="alignment-guide"
              [style.left.px]="guide.orientation === 'vertical' ? guide.position - guideThickness() / 2 : guide.start"
              [style.top.px]="guide.orientation === 'vertical' ? guide.start : guide.position - guideThickness() / 2"
              [style.width.px]="guide.orientation === 'vertical' ? guideThickness() : guide.end - guide.start"
              [style.height.px]="guide.orientation === 'vertical' ? guide.end - guide.start : guideThickness()"
            ></div>
          }
        </div>
      </div>
    </div>

    <ng-template #contextMenu>
      <div hlmDropdownMenu class="w-44">
        @switch (contextMenuService.menuKind()) {
          @case ('canvas') {
            <button hlmDropdownMenuItem (triggered)="contextMenuService.addNode()">
              <ng-icon name="lucideSquarePlus" />
              <span>Add node</span>
            </button>
            <button hlmDropdownMenuItem (triggered)="contextMenuService.addGroup()">
              <ng-icon name="lucideGroup" />
              <span>Add group</span>
            </button>
            <button hlmDropdownMenuItem (triggered)="contextMenuService.addPin()">
              <ng-icon name="lucideMessageCircle" />
              <span>Add pin</span>
            </button>
            <button hlmDropdownMenuItem [disabled]="!contextMenuService.canPaste()" (triggered)="contextMenuService.pasteHere()">
              <ng-icon name="lucideClipboardPaste" />
              <span>Paste</span>
            </button>
          }
          @case ('node') {
            @if (contextMenuService.targetIsGroup()) {
              <button hlmDropdownMenuItem (triggered)="contextMenuService.addNode()">
                <ng-icon name="lucideSquarePlus" />
                <span>Add node</span>
              </button>
              <button hlmDropdownMenuItem (triggered)="contextMenuService.rename()">
                <ng-icon name="lucidePencil" />
                <span>Rename</span>
              </button>
            } @else {
              <button hlmDropdownMenuItem (triggered)="contextMenuService.editText()">
                <ng-icon name="lucidePencil" />
                <span>Edit text</span>
              </button>
            }
            <button
              hlmDropdownMenuItem
              [attr.aria-pressed]="resizeMode.mode()"
              (triggered)="resizeMode.toggle()"
            >
              <ng-icon name="lucideMoveDiagonal2" />
              <span>Resize mode</span>
              @if (resizeMode.mode()) {
                <ng-icon name="lucideCheck" class="ml-auto" />
              }
            </button>
            <button hlmDropdownMenuItem (triggered)="contextMenuService.addPin()">
              <ng-icon name="lucideMessageCircle" />
              <span>Add pin</span>
            </button>
            <button hlmDropdownMenuItem (triggered)="contextMenuService.cutTarget()">
              <ng-icon name="lucideScissors" />
              <span>Cut</span>
            </button>
            <button hlmDropdownMenuItem (triggered)="contextMenuService.copyTarget()">
              <ng-icon name="lucideCopy" />
              <span>Copy</span>
            </button>
            @if (contextMenuService.targetIsGroup()) {
              <button hlmDropdownMenuItem [disabled]="!contextMenuService.canPaste()" (triggered)="contextMenuService.pasteHere()">
                <ng-icon name="lucideClipboardPaste" />
                <span>Paste</span>
              </button>
            }
            <button hlmDropdownMenuItem (triggered)="contextMenuService.duplicateTarget()">
              <ng-icon name="lucideCopyPlus" />
              <span>Duplicate</span>
            </button>
            <button hlmDropdownMenuItem (triggered)="contextMenuService.exportPng()">
              <ng-icon name="lucideImageDown" />
              <span>Export as PNG</span>
            </button>
            <button hlmDropdownMenuItem variant="destructive" (triggered)="contextMenuService.deleteTarget()">
              <ng-icon name="lucideTrash2" />
              <span>Delete</span>
            </button>
          }
          @case ('connection') {
            <button hlmDropdownMenuItem (triggered)="contextMenuService.editText()">
              <ng-icon name="lucideTag" />
              <span>Edit text</span>
            </button>
            <button hlmDropdownMenuItem (triggered)="contextMenuService.addReroutePoint()">
              <ng-icon name="lucideMapPin" />
              <span>Add Reroute Point</span>
            </button>
            <button hlmDropdownMenuItem variant="destructive" (triggered)="contextMenuService.deleteTarget()">
              <ng-icon name="lucideTrash2" />
              <span>Delete</span>
            </button>
          }
          @case ('pin') {
            <button hlmDropdownMenuItem (triggered)="contextMenuService.editPin()">
              <ng-icon name="lucideMessageCircle" />
              <span>Edit pin</span>
            </button>
            <button hlmDropdownMenuItem variant="destructive" (triggered)="contextMenuService.deletePin()">
              <ng-icon name="lucideTrash2" />
              <span>Delete pin</span>
            </button>
          }
          @case ('multi') {
            <button hlmDropdownMenuItem (triggered)="contextMenuService.cutSelection()">
              <ng-icon name="lucideScissors" />
              <span>Cut</span>
            </button>
            <button hlmDropdownMenuItem (triggered)="contextMenuService.copySelection()">
              <ng-icon name="lucideCopy" />
              <span>Copy</span>
            </button>
            <button hlmDropdownMenuItem (triggered)="contextMenuService.duplicateSelection()">
              <ng-icon name="lucideCopyPlus" />
              <span>Duplicate</span>
            </button>
            @if (contextMenuService.canAlign()) {
              <button hlmDropdownMenuItem [hlmDropdownMenuSubTrigger]="alignSubmenu">
                <ng-icon name="lucideAlignStartVertical" />
                <span>Align</span>
                <hlm-dropdown-menu-item-sub-indicator />
              </button>
            }
            <button hlmDropdownMenuItem (triggered)="contextMenuService.exportPng()">
              <ng-icon name="lucideImageDown" />
              <span>Export as PNG</span>
            </button>
            <button hlmDropdownMenuItem variant="destructive" (triggered)="contextMenuService.deleteSelection()">
              <ng-icon name="lucideTrash2" />
              <span>Delete</span>
            </button>
          }
        }
      </div>
    </ng-template>

    <!-- Align/Distribute submenu of the multi menu (spec #25): eight Commands
         on the Selection's roots; Distribute needs three of them -->
    <ng-template #alignSubmenu>
      <div hlmDropdownMenuSub class="w-52">
        <button hlmDropdownMenuItem (triggered)="contextMenuService.alignSelection('left')">
          <ng-icon name="lucideAlignStartVertical" />
          <span>Align left</span>
        </button>
        <button hlmDropdownMenuItem (triggered)="contextMenuService.alignSelection('center')">
          <ng-icon name="lucideAlignCenterVertical" />
          <span>Align horizontal center</span>
        </button>
        <button hlmDropdownMenuItem (triggered)="contextMenuService.alignSelection('right')">
          <ng-icon name="lucideAlignEndVertical" />
          <span>Align right</span>
        </button>
        <button hlmDropdownMenuItem (triggered)="contextMenuService.alignSelection('top')">
          <ng-icon name="lucideAlignStartHorizontal" />
          <span>Align top</span>
        </button>
        <button hlmDropdownMenuItem (triggered)="contextMenuService.alignSelection('middle')">
          <ng-icon name="lucideAlignCenterHorizontal" />
          <span>Align vertical middle</span>
        </button>
        <button hlmDropdownMenuItem (triggered)="contextMenuService.alignSelection('bottom')">
          <ng-icon name="lucideAlignEndHorizontal" />
          <span>Align bottom</span>
        </button>
        <button hlmDropdownMenuItem [disabled]="!contextMenuService.canDistribute()" (triggered)="contextMenuService.distributeSelection('horizontal')">
          <ng-icon name="lucideAlignHorizontalSpaceBetween" />
          <span>Distribute horizontally</span>
        </button>
        <button hlmDropdownMenuItem [disabled]="!contextMenuService.canDistribute()" (triggered)="contextMenuService.distributeSelection('vertical')">
          <ng-icon name="lucideAlignVerticalSpaceBetween" />
          <span>Distribute vertically</span>
        </button>
      </div>
    </ng-template>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
      height: 100%;
      overflow: hidden;
    }
    .canvas-viewport {
      width: 100%;
      height: 100%;
    }
    .canvas-container {
      width: 100%;
      height: 100%;
      background-color: var(--dn-canvas);
      background-image:
        radial-gradient(circle at 1px 1px, var(--dn-canvas-dot) 1px, transparent 0);
      background-size: 26px 26px;
      position: relative;
      overflow: hidden;
      cursor: default;
      /* Touch adaptation: the browser must never hijack canvas gestures (no
         scroll, no double-tap zoom, no pinch). Effective for the whole
         subtree, so Node/Handle/Text-card drags stream compatibility mouse
         events instead of being canceled mid-drag. */
      touch-action: none;
    }
    .canvas-container.space-pan {
      cursor: grab;
    }
    .canvas-container.panning {
      cursor: grabbing;
    }
    .marquee-rect {
      position: absolute;
      border: 1px solid var(--dn-accent);
      background: color-mix(in srgb, var(--dn-accent) 12%, transparent);
      pointer-events: none;
      z-index: var(--dn-z-handle);
    }
    .alignment-guide {
      position: absolute;
      background: var(--dn-danger);
      pointer-events: none;
      z-index: var(--dn-z-overlay);
    }
    .canvas-transform {
      position: absolute;
      top: 0;
      left: 0;
      transform-origin: 0 0;
    }
    .canvas-transform.transforming {
      will-change: transform;
    }
    .nodes-container {
      position: absolute;
      top: 0;
      left: 0;
    }
  `],
})
export class CanvasComponent {
  graphService = inject(GraphService);
  contextMenuService = inject(ContextMenuService);
  presentationService = inject(PresentationService);
  protected resizeMode = inject(ResizeModeService);
  private historyService = inject(HistoryService);
  private clipboardService = inject(ClipboardService);
  private chainHighlightService = inject(ChainHighlightService);

  constructor() {
    // Ctrl+V converts the raw cursor point to canvas coordinates lazily at
    // paste time — mousemove itself stays reflow-free (ADR-0003 hot path)
    this.clipboardService.registerCursorResolver(
      point => this.clientPointToCanvas(point.x, point.y),
    );
  }

  private connectionLayer = viewChild<ConnectionLayerComponent>('connectionLayer');

  // Groups render beneath the connection layer, regular nodes above it (ADR-0008)
  groupNodes = computed(() => this.graphService.nodes().filter(n => n.kind === 'group'));
  regularNodes = computed(() => this.graphService.nodes().filter(n => n.kind !== 'group'));

  // Node drag state — a drag moves one or many roots (the whole Selection
  // when a member was grabbed, ADR-0015) rigidly by the same delta
  protected isDraggingNode = false;
  private dragRoots: { id: string; startX: number; startY: number; isGroup: boolean }[] = [];
  private dragStartX = 0;
  private dragStartY = 0;
  private hasMoved = false;
  // True when the drag grabbed a member of a multi-Selection: membership is
  // frozen on drop, and a no-move release collapses to the grabbed element
  private dragIsSelectionDrag = false;
  private dragCollapseToId: string | null = null;
  // True while dragging Alt+drag-spawned duplicates instead of the originals
  private dragIsSpawnedDuplicate = false;

  // Resize drag state
  protected isResizingNode = false;
  private resizeNodeId: string | null = null;
  private resizeCorner: GripCorner | null = null;
  private resizeAnchorX = 0;
  private resizeAnchorY = 0;
  private resizeMinWidth = 120;
  private resizeMinHeight = 48;
  private resizeStartRect: NodeRect | null = null;
  // Same 2px latch as node drags: Alignment Snap never fires on a grip click
  private resizeStartClientX = 0;
  private resizeStartClientY = 0;
  private resizeMoved = false;

  // Pan state (ADR-0016: Space+drag and middle-mouse-drag; empty-canvas
  // left-drag is the Marquee)
  protected isPanning = false;

  // Touch/pen gestures (adapt): touch has no middle button or Space, so one
  // finger pans the empty Canvas and two fingers pinch-zoom around their
  // midpoint. Element drags (Nodes, Handles, Text cards, Pins) run through
  // the browser's compatibility mouse events — touch-action: none on the
  // container lets those through — so only empty-canvas gestures need the
  // pointer handlers here.
  private touchPointers = new Map<number, { x: number; y: number }>();
  private touchPanPointerId: number | null = null;
  private pinchStartDist = 0;
  private pinchStartZoom = 1;

  protected isTransforming(): boolean {
    return this.isPanning || this.isDraggingNode || this.isResizingNode;
  }
  private panStartX = 0;
  private panStartY = 0;
  private panStartPanX = 0;
  private panStartPanY = 0;
  readonly spaceHeld = signal(false);

  // Marquee state (ADR-0016) — armed on empty-canvas left-mousedown, active
  // past the 2px threshold; below it the release is a click
  private isMarqueeArmed = false;
  private marqueeActive = false;
  private marqueeAdditive = false;
  private marqueeStartClientX = 0;
  private marqueeStartClientY = 0;
  private marqueeBase: { nodeIds: readonly string[]; connectionIds: readonly string[] } | null = null;
  readonly marqueeRect = signal<Rect | null>(null);

  // Alignment Guides (issue #22) — transient lines shown during a node drag,
  // set each mousemove and cleared on mouseup. Never part of Graph State.
  readonly alignmentGuides = signal<AlignmentGuide[]>([]);
  // Guide lines render a constant 1px on screen regardless of zoom (ADR-0017)
  protected guideThickness = computed(() => 1 / this.graphService.viewportState().zoom);

  // Chain Highlight — hover-triggered weakly-connected component (ADR-0029)
  // Deferred clear: leaving schedules RAF, entering cancels pending clear to avoid
  // leave-then-enter flicker when crossing overlapping elements (Groups beneath Nodes).
  private chainClearFrame: number | null = null;

  // Connection drag state — track source info for CreateConnectionCommand on drop;
  // the moved flag is the standard 2px (canvas-unit) guard that keeps a stray
  // Handle click from Quick-adding a Node
  private isDraggingConnection = false;
  private connectionSourceNodeId: string | null = null;
  private connectionSourceHandle: HandleSide | null = null;
  private connectionDragStartClientX = 0;
  private connectionDragStartClientY = 0;
  private connectionDragMoved = false;

  // Connection Text card drag state — same 2px click/drag split as node drags;
  // a null original position means the Text sat at the midpoint (absent field)
  private isDraggingConnectionText = false;
  private textDragConnectionId: string | null = null;
  private textDragStartClientX = 0;
  private textDragStartClientY = 0;
  private textDragOriginalPosition: number | null = null;
  private textDragMoved = false;

  // Reroute Point drag state — direct Canvas movement with no snapping; the
  // full ordered array is captured so one undo restores the exact route.
  private isDraggingReroutePoint = false;
  private reroutePointConnectionId: string | null = null;
  private reroutePointIndex = -1;
  private reroutePointStartClientX = 0;
  private reroutePointStartClientY = 0;
  private reroutePointOriginalPoints: ReroutePoint[] = [];
  private reroutePointMoved = false;

  transformStyle = () => {
    const vp = this.graphService.viewportState();
    return `translate(${vp.panX}px, ${vp.panY}px) scale(${vp.zoom})`;
  };

  get currentSnapTarget() {
    return this.connectionLayer()?.snapTarget() ?? null;
  }

  // Chain Highlight hover — Canvas mediates, Node emits
  onNodeHoverEnter(nodeId: string): void {
    if (this.chainClearFrame !== null) {
      cancelAnimationFrame(this.chainClearFrame);
      this.chainClearFrame = null;
    }
    this.chainHighlightService.setHovered(nodeId);
  }

  onNodeHoverLeave(): void {
    if (this.chainClearFrame !== null) {
      cancelAnimationFrame(this.chainClearFrame);
    }
    if (typeof requestAnimationFrame === 'function') {
      this.chainClearFrame = requestAnimationFrame(() => {
        this.chainHighlightService.clearHovered();
        this.chainClearFrame = null;
      });
    } else {
      this.chainHighlightService.clearHovered();
      this.chainClearFrame = null;
    }
  }

  private syncChainDragSuppression(): void {
    const dragging =
      this.isDraggingNode ||
      this.isResizingNode ||
      this.isPanning ||
      this.marqueeActive ||
      this.isDraggingConnection ||
      this.isDraggingConnectionText ||
      this.isDraggingReroutePoint ||
      this.touchPanPointerId !== null;
    this.chainHighlightService.setDragSuppressed(dragging);
    if (dragging && this.chainClearFrame !== null) {
      cancelAnimationFrame(this.chainClearFrame);
      this.chainClearFrame = null;
    }
  }

  private screenToCanvas(screenX: number, screenY: number): { x: number; y: number } {
    const vp = this.graphService.viewportState();
    return {
      x: (screenX - vp.panX) / vp.zoom,
      y: (screenY - vp.panY) / vp.zoom,
    };
  }

  private clientPointToCanvas(clientX: number, clientY: number): { x: number; y: number } | null {
    const container = document.querySelector('.canvas-container');
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    return this.screenToCanvas(clientX - rect.left, clientY - rect.top);
  }

  // The visible Canvas region in canvas coordinates — the Alignment candidate
  // scope (Viewport-only, ADR-0017). Null when the container isn't in the DOM.
  private viewportCanvasRect(): Rect | null {
    const container = document.querySelector('.canvas-container');
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    const tl = this.screenToCanvas(0, 0);
    const br = this.screenToCanvas(rect.width, rect.height);
    return { x: tl.x, y: tl.y, width: br.x - tl.x, height: br.y - tl.y };
  }

  // Alignment candidates: every visible Node (Groups included) outside the
  // moving set — Viewport-only per ADR-0017.
  private visibleRectsExcluding(moving: Set<string>): Rect[] {
    const view = this.viewportCanvasRect();
    return this.graphService.nodes()
      .filter(n => !moving.has(n.id))
      .map(n => ({ x: n.x, y: n.y, width: n.width, height: n.height }))
      .filter(r => !view || rectsOverlap(r, view));
  }

  // Alignment for the current node drag at the given raw (un-snapped) delta:
  // aligns the moving set's bounding rect against the visible Nodes outside it,
  // returning the snap offset and the guide lines to draw (issue #22).
  private computeDragAlignment(rawDx: number, rawDy: number): { dx: number; dy: number; guides: AlignmentGuide[] } {
    const nodes = this.graphService.nodes();
    const byId = new Map(nodes.map(n => [n.id, n]));

    // The moving set: every dragged root plus the children of any Group root
    const moving = new Set<string>();
    for (const root of this.dragRoots) {
      moving.add(root.id);
      if (root.isGroup) {
        for (const child of this.graphService.childrenOf(root.id)) moving.add(child.id);
      }
    }

    // The dragged reference: the union of the roots' own rects at the raw
    // offset (a Group aligns by its own rect)
    const rootRects: Rect[] = [];
    for (const root of this.dragRoots) {
      const node = byId.get(root.id);
      if (node) rootRects.push({ x: root.startX + rawDx, y: root.startY + rawDy, width: node.width, height: node.height });
    }
    if (rootRects.length === 0) return { dx: 0, dy: 0, guides: [] };

    const zoom = this.graphService.viewportState().zoom;
    return computeAlignment(
      unionRect(rootRects),
      this.visibleRectsExcluding(moving),
      ALIGNMENT_SNAP_THRESHOLD / zoom,
    );
  }

  onCanvasDoubleClick(event: MouseEvent): void {
    if (this.presentationService.active()) return;
    if ((event.target as HTMLElement).closest('app-node, [data-pin-id]')) return;

    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;
    const canvasPos = this.screenToCanvas(screenX, screenY);

    const cmd = new CreateNodeCommand(this.graphService, 'New Node', canvasPos.x - 60, canvasPos.y - 24);
    this.historyService.execute(cmd);
  }

  onCanvasMouseDown(event: MouseEvent): void {
    // A touch pan already owns this press — its compatibility mousedown must
    // never also arm a Marquee or clear selection (touch pans, mouse marquees)
    if (this.touchPanPointerId !== null) return;
    // Middle-mouse-drag pans from anywhere; Space turns a left-drag into a
    // pan even over elements (ADR-0016)
    if (event.button === 1 || (event.button === 0 && this.spaceHeld())) {
      event.preventDefault();
      this.startPan(event);
      return;
    }
    if ((event.target as HTMLElement).closest('app-node, [data-pin-id], .pin-popover')) return;
    // Left button only — right-click is reserved for the context menu and
    // must never start a Marquee or clear selection (the menu handles that)
    if (event.button !== 0) return;
    // Present Mode: no Marquee, no click-to-clear — the pan branches above
    // stay live (free-roam is part of the tour)
    if (this.presentationService.active()) return;

    // Arm a Marquee; whether it becomes one (drag) or stays a click (clear,
    // or Ctrl no-op) is resolved by the 2px threshold
    this.isMarqueeArmed = true;
    this.marqueeActive = false;
    this.marqueeAdditive = event.ctrlKey;
    this.marqueeStartClientX = event.clientX;
    this.marqueeStartClientY = event.clientY;
    this.marqueeBase = event.ctrlKey
      ? {
          nodeIds: this.graphService.selectedNodeIds(),
          connectionIds: this.graphService.selectedConnectionIds(),
        }
      : null;
  }

  private startPan(event: MouseEvent): void {
    this.isPanning = true;
    this.panStartX = event.clientX;
    this.panStartY = event.clientY;
    const vp = this.graphService.viewportState();
    this.panStartPanX = vp.panX;
    this.panStartPanY = vp.panY;
    this.syncChainDragSuppression();
  }

  onCanvasPointerDown(event: PointerEvent): void {
    if (event.pointerType === 'mouse') return;
    const isFirstFinger = this.touchPointers.size === 0;
    // Present Mode is free-roam: pan over everything. Otherwise an element
    // press belongs to its own (compatibility-mouse) drag, not a pan.
    if (isFirstFinger && !this.presentationService.active()) {
      const target = event.target as HTMLElement;
      if (target.closest('app-node, [data-pin-id], .pin-popover, .connection-text-card, .reroute-point')) return;
    }
    // Capture so pointerup lands here even when the finger lifts off-canvas;
    // jsdom lacks setPointerCapture, hence the optional calls (tests)
    (event.currentTarget as HTMLElement | null)?.setPointerCapture?.(event.pointerId);
    this.touchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (this.touchPointers.size === 2) {
      // Second finger: end the one-finger pan and start a pinch. No
      // compatibility mouse events fire during multi-touch, so the pinch path
      // below never double-pans.
      this.isPanning = false;
      this.touchPanPointerId = null;
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      const points = [...this.touchPointers.values()];
      this.pinchStartDist = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      this.pinchStartZoom = this.graphService.viewportState().zoom;
      this.syncChainDragSuppression();
      return;
    }
    if (this.touchPointers.size > 2) return;

    this.touchPanPointerId = event.pointerId;
    this.startPan(event);
    this.syncChainDragSuppression();
  }

  onCanvasPointerMove(event: PointerEvent): void {
    if (event.pointerType === 'mouse') return;
    if (!this.touchPointers.has(event.pointerId)) return;
    this.touchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (this.touchPointers.size >= 2 && this.pinchStartDist > 0) {
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      const points = [...this.touchPointers.values()];
      const mid = {
        x: (points[0].x + points[1].x) / 2 - rect.left,
        y: (points[0].y + points[1].y) / 2 - rect.top,
      };
      const dist = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      const ratio = dist / this.pinchStartDist;
      // zoomBy clamps to the zoom bounds and re-derives the pan from the
      // clamped zoom, so the raw delta keeps the pinch midpoint anchored
      const delta = this.pinchStartZoom * ratio - this.graphService.viewportState().zoom;
      this.graphService.zoomBy(delta, mid.x, mid.y);
    }
  }

  onCanvasPointerUp(event: PointerEvent): void {
    if (event.pointerType === 'mouse') return;
    const wasPanPointer = this.touchPanPointerId === event.pointerId;
    this.touchPointers.delete(event.pointerId);
    if (this.touchPanPointerId === event.pointerId) this.touchPanPointerId = null;
    if (this.touchPointers.size < 2) this.pinchStartDist = 0;
    // A pan's own compatibility mouseup ends isPanning; pointercancel has no
    // compat counterpart, so end the pan here too (idempotent with onMouseUp)
    if (wasPanPointer && this.touchPointers.size === 0) {
      this.isPanning = false;
    }
    this.syncChainDragSuppression();
  }

  // Space tracking for the pan gesture; ignored while typing so the editors
  // keep their spacebar. Shift+F10 / the Context Menu key opens the Canvas
  // context menu for keyboard users (WCAG 2.1.1): the menu resolves its
  // target exactly like a right-click, from the focused element downward.
  @HostListener('document:keydown', ['$event'])
  onDocumentKeyDown(event: KeyboardEvent): void {
    if (event.key === 'F10' && event.shiftKey || event.key === 'ContextMenu') {
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
      event.preventDefault();
      this.openContextMenuForKeyboard();
      return;
    }
    if (event.code !== 'Space') return;
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
    event.preventDefault(); // keep the page (and focused buttons) inert
    this.spaceHeld.set(true);
  }

  /**
   * Keyboard path to the Context Menu. Dispatches a synthetic contextmenu on
   * the element that represents the current target — the focused Node card,
   * the selected Node/Connection, or the empty Canvas — so the existing
   * target-resolution and open flow runs unchanged (synthetic events never
   * summon the browser's native menu).
   */
  private openContextMenuForKeyboard(): void {
    if (this.presentationService.active()) return;
    // Element, not HTMLElement: SVG paths (Connection hit targets) are
    // focusable too, and they are Elements, never HTMLElements
    const active = document.activeElement instanceof Element ? document.activeElement : null;

    // Focus is on a Node card: its menu (multi-Selection keep/collapse applies)
    const nodeEl = active?.closest('[data-node-id]') as HTMLElement | null;
    if (nodeEl) {
      this.dispatchContextMenu(nodeEl);
      return;
    }

    // Focus is on a Connection hit path (tab order or the [ / ] cycle):
    // select it if needed, then open its menu — the keyboard path to a
    // Connection's commands
    const connHit = active?.closest('path.connection-hit') as SVGPathElement | null;
    if (connHit) {
      const connectionId = connHit.getAttribute('data-connection-id');
      if (connectionId && !this.graphService.isConnectionSelected(connectionId)) {
        this.graphService.selectConnection(connectionId);
      }
      this.dispatchContextMenu(connHit);
      return;
    }

    // Focus is on a Reroute Point: its Connection's menu — the point can't
    // carry its own menu, and its actions (Edit text, Delete) are the
    // Connection's
    const rerouteEl = active?.closest('.reroute-point') as SVGCircleElement | null;
    if (rerouteEl) {
      const connectionId = rerouteEl.getAttribute('data-connection-id');
      if (connectionId) {
        if (!this.graphService.isConnectionSelected(connectionId)) {
          this.graphService.selectConnection(connectionId);
        }
        const hit = document.querySelector<SVGPathElement>(
          `path.connection-hit[data-connection-id="${connectionId}"]`,
        );
        if (hit) this.dispatchContextMenu(hit);
        return;
      }
    }

    // A Selection exists: open on its selected Node, else its Connection
    const selectedNodeId = this.graphService.selectedNodeId();
    if (selectedNodeId) {
      const card = document.querySelector<HTMLElement>(`[data-node-id="${selectedNodeId}"]`);
      if (card) {
        this.dispatchContextMenu(card);
        return;
      }
    }
    const selectedConnectionId = this.graphService.selectedConnectionId();
    if (selectedConnectionId) {
      const hit = document.querySelector<SVGPathElement>(
        `path.connection-hit[data-connection-id="${selectedConnectionId}"]`,
      );
      if (hit) {
        this.dispatchContextMenu(hit);
        return;
      }
    }

    // Nothing selected: the empty-Canvas menu, centered
    const container = document.querySelector<HTMLElement>('.canvas-container');
    if (container) this.dispatchContextMenu(container);
  }

  private dispatchContextMenu(el: HTMLElement | SVGPathElement): void {
    const rect = el.getBoundingClientRect();
    el.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    }));
  }

  @HostListener('document:keyup', ['$event'])
  onDocumentKeyUp(event: KeyboardEvent): void {
    if (event.code === 'Space') {
      this.spaceHeld.set(false);
    }
  }

  // Right-click: select the target and prime the context menu with the
  // right-click point (in canvas coords). The CdkContextMenuTrigger on the
  // outer element opens the menu; inline text inputs stop propagation so the
  // native browser menu still works there.
  onContextMenu(event: MouseEvent): void {
    // Present Mode: the Context Menu is dead — stopPropagation keeps the
    // event from the CdkContextMenuTrigger on the outer element, and
    // preventDefault suppresses the native browser menu as usual
    if (this.presentationService.active()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const el = event.target as HTMLElement;
    const canvasPos = this.clientPointToCanvas(event.clientX, event.clientY) ?? { x: 0, y: 0 };

    const nodeEl = el.closest('[data-node-id]');
    if (nodeEl) {
      this.contextMenuService.openFor(
        { kind: 'node', nodeId: nodeEl.getAttribute('data-node-id')! },
        canvasPos.x, canvasPos.y,
      );
      return;
    }

    const connEl = el.closest('[data-connection-id]');
    if (connEl) {
      this.contextMenuService.openFor(
        { kind: 'connection', connectionId: connEl.getAttribute('data-connection-id')! },
        canvasPos.x, canvasPos.y,
      );
      return;
    }

    const pinEl = el.closest('[data-pin-id]');
    if (pinEl) {
      this.contextMenuService.openFor(
        { kind: 'pin', pinId: pinEl.getAttribute('data-pin-id')! },
        canvasPos.x, canvasPos.y,
      );
      return;
    }

    this.contextMenuService.openFor({ kind: 'canvas' }, canvasPos.x, canvasPos.y);
  }

  onContextMenuClosed(): void {
    this.contextMenuService.clear();
  }

  onWheel(event: WheelEvent): void {
    event.preventDefault();
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const centerX = event.clientX - rect.left;
    const centerY = event.clientY - rect.top;
    const delta = event.deltaY > 0 ? -0.1 : 0.1;
    this.graphService.zoomBy(delta, centerX, centerY);
  }

  // Node drag handling
  onNodeStartMove(event: { nodeId: string; event: MouseEvent }): void {
    // Space+drag pans even when the press lands on a node (ADR-0016)
    if (this.spaceHeld()) {
      this.startPan(event.event);
      return;
    }

    // Present Mode: no selection, no drag — only the pan branch above lives
    if (this.presentationService.active()) return;

    // Ctrl+click toggles Selection membership and never arms a drag
    if (event.event.ctrlKey && !event.event.altKey) {
      this.graphService.toggleNodeSelection(event.nodeId);
      return;
    }

    // Grabbing a member of a multi-Selection drags the whole set; releasing
    // without a drag collapses to the grabbed element (deferred collapse).
    // Anything else collapses immediately and drags alone.
    this.dragIsSelectionDrag = false;
    this.dragCollapseToId = null;
    let rootIds: readonly string[];
    if (this.graphService.isNodeSelected(event.nodeId) && this.graphService.selectionSize() > 1) {
      rootIds = this.graphService.selectedNodeIds();
      this.dragIsSelectionDrag = true;
      this.dragCollapseToId = event.nodeId;
    } else {
      this.graphService.selectNode(event.nodeId);
      rootIds = [event.nodeId];
    }

    // Alt at drag start spawns a Duplicate of the dragged set: the drag moves
    // the copies and the originals never move. Mid-drag Alt changes are
    // deliberately ignored.
    this.dragIsSpawnedDuplicate = false;
    if (event.event.altKey) {
      const spawn = this.clipboardService.spawnDuplicate(rootIds, event.nodeId);
      if (spawn) {
        rootIds = spawn.rootIds;
        this.dragIsSpawnedDuplicate = true;
        this.dragCollapseToId = null;
      }
    }

    this.isDraggingNode = true;
    this.dragStartX = event.event.clientX;
    this.dragStartY = event.event.clientY;
    const byId = new Map(this.graphService.nodes().map(n => [n.id, n]));
    this.dragRoots = rootIds
      .map(id => byId.get(id))
      .filter((n): n is GraphNode => n !== undefined)
      .map(n => ({ id: n.id, startX: n.x, startY: n.y, isGroup: n.kind === 'group' }));
    this.hasMoved = false;
    this.syncChainDragSuppression();
  }

  // Keyboard select (Enter on a focused card): mirror a plain click.
  onKeyboardSelect(event: { nodeId: string }): void {
    if (this.presentationService.active()) return;
    this.graphService.selectNode(event.nodeId);
  }

  // Keyboard nudge (arrow keys on a focused card): moving a member of a
  // multi-Selection shifts the whole set as one undoable CompoundCommand,
  // exactly like the drag commit — one nudge, one undo step.
  onKeyboardResize(event: { nodeId: string; rect: NodeRect; originalRect: NodeRect }): void {
    if (this.presentationService.active()) return;
    // Select-first so the resize reads as the current target, mirroring the
    // nudge path; one undoable ResizeNodeCommand per keystroke
    this.graphService.selectNode(event.nodeId);
    this.historyService.execute(new ResizeNodeCommand(
      this.graphService,
      event.nodeId,
      event.rect,
      event.originalRect,
    ));
  }

  onKeyboardMove(event: { nodeId: string; dx: number; dy: number }): void {
    if (this.presentationService.active()) return;
    const byId = new Map(this.graphService.nodes().map(n => [n.id, n]));
    const target = byId.get(event.nodeId);
    if (!target) return;

    if (this.graphService.isNodeSelected(event.nodeId) && this.graphService.selectionSize() > 1) {
      const parts = this.graphService.selectedNodeIds()
        .map(id => byId.get(id))
        .filter((n): n is GraphNode => n !== undefined)
        .map(n => n.kind === 'group'
          ? new MoveGroupCommand(this.graphService, n.id, n.x + event.dx, n.y + event.dy, n.x, n.y)
          : new MoveNodeCommand(this.graphService, n.id, n.x + event.dx, n.y + event.dy, n.x, n.y));
      if (parts.length > 0) {
        this.historyService.execute(new CompoundCommand('Move Selection', parts));
      }
      return;
    }

    // Single node: select it first so the nudge reads as the current target,
    // then move. MoveNodeCommand captures the original position itself;
    // MoveGroupCommand needs it explicit.
    this.graphService.selectNode(event.nodeId);
    if (target.kind === 'group') {
      this.historyService.execute(new MoveGroupCommand(
        this.graphService, target.id, target.x + event.dx, target.y + event.dy, target.x, target.y,
      ));
    } else {
      this.historyService.execute(new MoveNodeCommand(
        this.graphService, target.id, target.x + event.dx, target.y + event.dy,
      ));
    }
  }

  // Resize grip drag start
  onNodeStartResize(event: {
    nodeId: string; corner: GripCorner; minWidth: number; minHeight: number; event: MouseEvent;
  }): void {
    if (this.presentationService.active()) return;
    const node = this.graphService.nodes().find(n => n.id === event.nodeId);
    if (!node) return;
    this.isResizingNode = true;
    this.resizeNodeId = event.nodeId;
    this.resizeCorner = event.corner;
    this.resizeMinWidth = event.minWidth;
    this.resizeMinHeight = event.minHeight;
    this.resizeStartRect = { x: node.x, y: node.y, width: node.width, height: node.height };
    this.resizeStartClientX = event.event.clientX;
    this.resizeStartClientY = event.event.clientY;
    this.resizeMoved = false;
    // The opposite corner stays anchored during the drag
    this.resizeAnchorX = event.corner === 'nw' || event.corner === 'sw' ? node.x + node.width : node.x;
    this.resizeAnchorY = event.corner === 'nw' || event.corner === 'ne' ? node.y + node.height : node.y;
    this.syncChainDragSuppression();
  }

  // Handle drag start (connection creation)
  onHandleDragStart(event: { nodeId: string; handle: HandleSide; event: MouseEvent }): void {
    if (this.presentationService.active()) return;
    event.event.stopPropagation();
    this.isDraggingConnection = true;
    this.connectionSourceNodeId = event.nodeId;
    this.connectionSourceHandle = event.handle;
    this.connectionDragStartClientX = event.event.clientX;
    this.connectionDragStartClientY = event.event.clientY;
    this.connectionDragMoved = false;

    const layer = this.connectionLayer();
    if (layer) {
      layer.startConnectionDrag(event.nodeId, event.handle, event.event);
    }
    this.syncChainDragSuppression();
  }

  // Text card drag start — armed on mousedown; becomes a drag past 2px
  onConnectionTextDragStart(event: { connectionId: string; event: MouseEvent }): void {
    if (this.presentationService.active()) return;
    const conn = this.graphService.connections().find(c => c.id === event.connectionId);
    if (!conn) return;
    this.isDraggingConnectionText = true;
    this.textDragConnectionId = event.connectionId;
    this.textDragStartClientX = event.event.clientX;
    this.textDragStartClientY = event.event.clientY;
    this.textDragOriginalPosition = conn.textPosition ?? null;
    this.textDragMoved = false;
    this.syncChainDragSuppression();
  }

  onReroutePointAdd(event: { connectionId: string; clientX: number; clientY: number }): void {
    if (this.presentationService.active()) return;
    const canvasPos = this.clientPointToCanvas(event.clientX, event.clientY);
    const layer = this.connectionLayer();
    const conn = this.graphService.connections().find(c => c.id === event.connectionId);
    if (!canvasPos || !layer || !conn) return;

    const points = conn.reroutePoints ?? [];
    if (points.length >= MAX_REROUTE_POINTS) return;
    const projection = layer.projectReroutePoint(conn.id, canvasPos.x, canvasPos.y);
    if (!projection) return;

    const previous = points[projection.index - 1];
    const next = points[projection.index];
    if (sameCanvasPoint(previous, projection.point) || sameCanvasPoint(next, projection.point)) return;

    this.historyService.execute(new AddConnectionReroutePointCommand(
      this.graphService,
      conn.id,
      projection.point,
      projection.index,
    ));
  }

  onReroutePointDragStart(event: { connectionId: string; pointIndex: number; event: MouseEvent }): void {
    if (this.presentationService.active()) return;
    const conn = this.graphService.connections().find(c => c.id === event.connectionId);
    if (!conn?.reroutePoints || !conn.reroutePoints[event.pointIndex]) return;

    this.isDraggingReroutePoint = true;
    this.reroutePointConnectionId = event.connectionId;
    this.reroutePointIndex = event.pointIndex;
    this.reroutePointStartClientX = event.event.clientX;
    this.reroutePointStartClientY = event.event.clientY;
    this.reroutePointOriginalPoints = structuredClone(conn.reroutePoints);
    this.reroutePointMoved = false;
    this.connectionLayer()?.setReroutePointDragging(event.connectionId);
    this.syncChainDragSuppression();
  }

  onReroutePointRemove(event: { connectionId: string; pointIndex: number }): void {
    if (this.presentationService.active()) return;
    const conn = this.graphService.connections().find(c => c.id === event.connectionId);
    if (!conn?.reroutePoints?.[event.pointIndex]) return;
    this.historyService.execute(new RemoveConnectionReroutePointCommand(
      this.graphService,
      event.connectionId,
      event.pointIndex,
    ));
  }

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(event: MouseEvent): void {
    // Raw client coordinates only — the canvas-coordinate conversion happens
    // lazily when Ctrl+V actually pastes, keeping this hot path cheap
    this.clipboardService.setCursorPosition(event.clientX, event.clientY);

    if (this.isDraggingNode && this.dragRoots.length > 0) {
      const vp = this.graphService.viewportState();
      let dx = (event.clientX - this.dragStartX) / vp.zoom;
      let dy = (event.clientY - this.dragStartY) / vp.zoom;

      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
        this.hasMoved = true;
      }

      // Alignment Guides & snap (issue #22): only once the drag crosses the 2px
      // threshold, so a click with a small jiggle never snaps or shows guides.
      // Fold the snap offset into the delta so the whole moving set shifts as one.
      if (this.hasMoved) {
        const alignment = this.computeDragAlignment(dx, dy);
        dx += alignment.dx;
        dy += alignment.dy;
        this.alignmentGuides.set(alignment.guides);
      }

      // Rigid translate: every root shifts by the same delta, bypassing
      // History; Connections follow their endpoints
      for (const root of this.dragRoots) {
        const newX = root.startX + dx;
        const newY = root.startY + dy;
        if (root.isGroup) {
          this.graphService.moveGroup(root.id, newX, newY);
        } else {
          this.graphService.updateNodePosition(root.id, newX, newY);
        }
      }
      if (this.dragIsSpawnedDuplicate && this.hasMoved) {
        this.clipboardService.moveSpawnedDuplicate(dx, dy);
      }
    }

    // Marquee: past the 2px threshold the rect renders and the Selection
    // live-updates — replace, or union with the pre-drag set on Shift
    if (this.isMarqueeArmed) {
      const dx = event.clientX - this.marqueeStartClientX;
      const dy = event.clientY - this.marqueeStartClientY;
      if (!this.marqueeActive && (Math.abs(dx) > 2 || Math.abs(dy) > 2)) {
        this.marqueeActive = true;
        this.syncChainDragSuppression();
      }
      if (this.marqueeActive) {
        const start = this.clientPointToCanvas(this.marqueeStartClientX, this.marqueeStartClientY);
        const current = this.clientPointToCanvas(event.clientX, event.clientY);
        if (start && current) {
          const rect = normalizedRect(start, current);
          this.marqueeRect.set(rect);
          const hit = marqueeSelection(this.graphService.nodes(), this.graphService.connections(), rect);
          if (this.marqueeAdditive && this.marqueeBase) {
            this.graphService.setSelection(
              [...this.marqueeBase.nodeIds, ...hit.nodeIds],
              [...this.marqueeBase.connectionIds, ...hit.connectionIds],
            );
          } else {
            this.graphService.setSelection(hit.nodeIds, hit.connectionIds);
          }
        }
      }
    }

    if (this.isResizingNode && this.resizeNodeId && this.resizeCorner) {
      const cursor = this.clientPointToCanvas(event.clientX, event.clientY);
      if (cursor) {
        const vp = this.graphService.viewportState();
        if (
          Math.abs((event.clientX - this.resizeStartClientX) / vp.zoom) > 2 ||
          Math.abs((event.clientY - this.resizeStartClientY) / vp.zoom) > 2
        ) {
          this.resizeMoved = true;
        }

        const west = this.resizeCorner === 'nw' || this.resizeCorner === 'sw';
        const north = this.resizeCorner === 'nw' || this.resizeCorner === 'ne';

        // Alignment Snap for resize (issue #22): the two moving edges sit at
        // the cursor, so snapping the cursor point snaps the edges. Clamps
        // below still win — an overridden snap shows no guide. Each axis only
        // snaps while the cursor is on the grip corner's side of the anchor;
        // crossed over, the normalized rect's "moving" edge would be the anchor.
        let edgeX = cursor.x;
        let edgeY = cursor.y;
        const moving: MovingEdges = { vertical: west ? 'left' : 'right', horizontal: north ? 'top' : 'bottom' };
        const candidates = this.resizeMoved ? this.visibleRectsExcluding(new Set([this.resizeNodeId])) : [];
        if (this.resizeMoved) {
          const rawRect: Rect = {
            x: Math.min(cursor.x, this.resizeAnchorX),
            y: Math.min(cursor.y, this.resizeAnchorY),
            width: Math.abs(cursor.x - this.resizeAnchorX),
            height: Math.abs(cursor.y - this.resizeAnchorY),
          };
          const alignment = computeResizeAlignment(rawRect, moving, candidates, ALIGNMENT_SNAP_THRESHOLD / vp.zoom);
          const validX = west ? cursor.x < this.resizeAnchorX : cursor.x > this.resizeAnchorX;
          const validY = north ? cursor.y < this.resizeAnchorY : cursor.y > this.resizeAnchorY;
          if (validX) edgeX += alignment.dx;
          if (validY) edgeY += alignment.dy;
        }

        const width = Math.max(this.resizeMinWidth, Math.abs(edgeX - this.resizeAnchorX));
        const height = Math.max(this.resizeMinHeight, Math.abs(edgeY - this.resizeAnchorY));
        const rect: NodeRect = {
          x: west ? this.resizeAnchorX - width : this.resizeAnchorX,
          y: north ? this.resizeAnchorY - height : this.resizeAnchorY,
          width,
          height,
        };
        // Transient: the service clamps Groups around their children
        const applied = this.graphService.resizeNode(this.resizeNodeId, rect);
        // Guides from the APPLIED rect at threshold 0: only exact landings
        // survive the min-size and Group-padding clamps
        const guides = this.resizeMoved
          ? computeResizeAlignment(applied, moving, candidates, 0).guides
          : [];
        if (guides.length > 0 || this.alignmentGuides().length > 0) {
          this.alignmentGuides.set(guides);
        }
      }
    }

    if (this.isPanning) {
      const dx = event.clientX - this.panStartX;
      const dy = event.clientY - this.panStartY;
      this.graphService.setViewport({
        panX: this.panStartPanX + dx,
        panY: this.panStartPanY + dy,
      });
    }

    if (this.isDraggingConnection) {
      const vp = this.graphService.viewportState();
      const dx = (event.clientX - this.connectionDragStartClientX) / vp.zoom;
      const dy = (event.clientY - this.connectionDragStartClientY) / vp.zoom;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
        this.connectionDragMoved = true;
      }

      const canvasPos = this.clientPointToCanvas(event.clientX, event.clientY);
      if (!canvasPos) return;

      const layer = this.connectionLayer();
      if (layer) {
        layer.updateConnectionDrag(canvasPos.x, canvasPos.y);
      }
    }

    if (this.isDraggingConnectionText && this.textDragConnectionId) {
      const vp = this.graphService.viewportState();
      const dx = (event.clientX - this.textDragStartClientX) / vp.zoom;
      const dy = (event.clientY - this.textDragStartClientY) / vp.zoom;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
        this.textDragMoved = true;
      }
      if (this.textDragMoved) {
        const canvasPos = this.clientPointToCanvas(event.clientX, event.clientY);
        const layer = this.connectionLayer();
        if (canvasPos && layer) {
          const t = layer.textPositionAtPoint(this.textDragConnectionId, canvasPos.x, canvasPos.y);
          // Transient, bypassing History — the Command comes on mouseup
          if (t !== null) {
            this.graphService.setConnectionTextPosition(this.textDragConnectionId, t);
          }
        }
      }
    }

    if (this.isDraggingReroutePoint && this.reroutePointConnectionId) {
      const vp = this.graphService.viewportState();
      const dx = (event.clientX - this.reroutePointStartClientX) / vp.zoom;
      const dy = (event.clientY - this.reroutePointStartClientY) / vp.zoom;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
        this.reroutePointMoved = true;
      }
      if (this.reroutePointMoved) {
        const canvasPos = this.clientPointToCanvas(event.clientX, event.clientY);
        if (canvasPos) {
          const points = structuredClone(this.reroutePointOriginalPoints);
          points[this.reroutePointIndex] = canvasPos;
          // Transient, bypassing History — the move Command comes on mouseup.
          this.graphService.setConnectionReroutePoints(this.reroutePointConnectionId, points);
        }
      }
    }
  }

  @HostListener('document:mouseup', ['$event'])
  onMouseUp(event: MouseEvent): void {
    // Resolve a Marquee first: an active one already committed its Selection
    // live; below the threshold the press was a click — plain clears, Shift
    // leaves the Selection unchanged
    if (this.isMarqueeArmed) {
      if (!this.marqueeActive && !this.marqueeAdditive) {
        this.graphService.clearSelection();
      }
      this.isMarqueeArmed = false;
      this.marqueeActive = false;
      this.marqueeBase = null;
      this.marqueeRect.set(null);
    }

    // Finish an Alt+drag duplicate — the whole gesture is one undo step.
    // Without movement the spawn is aborted (mirroring the 2px move rule).
    if (this.isDraggingNode && this.dragIsSpawnedDuplicate) {
      if (!this.hasMoved) {
        this.clipboardService.cancelSpawnedDuplicate();
      } else {
        // Membership by drop position for a single spawned regular node only;
        // a spawned set keeps membership frozen like any multi-move
        if (this.dragRoots.length === 1 && !this.dragRoots[0].isGroup) {
          const node = this.graphService.nodes().find(n => n.id === this.dragRoots[0].id);
          if (node) {
            const targetGroup = this.graphService.findGroupAt(
              node.x + node.width / 2,
              node.y + node.height / 2,
              node.id,
            );
            this.graphService.setNodeParent(node.id, targetGroup?.id ?? null);
          }
        }
        this.clipboardService.commitSpawnedDuplicate();
      }
    } else if (this.isDraggingNode && this.hasMoved && this.dragRoots.length > 0) {
      const byId = new Map(this.graphService.nodes().map(n => [n.id, n]));
      // Alignment Snap can pull a nudged drag back to its exact origin; commit
      // nothing when nothing actually moved, so there's no dead undo step (#22)
      const movedAny = this.dragRoots.some(root => {
        const n = byId.get(root.id);
        // Epsilon, not exact equality: Alignment Snap's arithmetic can leave a
        // sub-ulp residue when it returns a root to its start (issue #22)
        return !!n && (Math.abs(n.x - root.startX) > 1e-6 || Math.abs(n.y - root.startY) > 1e-6);
      });
      if (movedAny && (this.dragRoots.length > 1 || this.dragIsSelectionDrag)) {
        // Multi-Selection drag: one compound undo step, membership frozen
        const parts = this.dragRoots
          .map(root => {
            const node = byId.get(root.id);
            if (!node) return null;
            return root.isGroup
              ? new MoveGroupCommand(this.graphService, root.id, node.x, node.y, root.startX, root.startY)
              : new MoveNodeCommand(this.graphService, root.id, node.x, node.y, root.startX, root.startY);
          })
          .filter((cmd): cmd is MoveGroupCommand | MoveNodeCommand => cmd !== null);
        if (parts.length > 0) {
          this.historyService.pushWithoutExecute(new CompoundCommand('Move Selection', parts));
        }
      } else if (movedAny) {
        const root = this.dragRoots[0];
        const node = byId.get(root.id);
        if (node && root.isGroup) {
          // A Group drag moved its children rigidly; one undo step for all of it
          const cmd = new MoveGroupCommand(
            this.graphService,
            root.id,
            node.x,
            node.y,
            root.startX,
            root.startY,
          );
          this.historyService.pushWithoutExecute(cmd);
        } else if (node) {
          // Node is already at the new position. Membership follows containment:
          // the topmost Group under the node's center claims it on drop.
          const targetGroup = this.graphService.findGroupAt(
            node.x + node.width / 2,
            node.y + node.height / 2,
            node.id,
          );
          const newParentId = targetGroup?.id ?? null;
          const oldParentId = node.parentId ?? null;

          const moveCmd = new MoveNodeCommand(
            this.graphService,
            root.id,
            node.x,
            node.y,
            root.startX,
            root.startY,
          );

          if (newParentId === oldParentId) {
            this.historyService.pushWithoutExecute(moveCmd);
          } else {
            // Entering a Group severs any Connections to it (sever-on-entry),
            // all one compound undo step with the move and the membership change
            const severCmds = newParentId === null ? [] : this.graphService.connections()
              .filter(c =>
                (c.sourceNodeId === node.id && c.targetNodeId === newParentId) ||
                (c.sourceNodeId === newParentId && c.targetNodeId === node.id)
              )
              .map(c => new DeleteConnectionCommand(this.graphService, c.id));
            const parentCmd = new ChangeParentCommand(this.graphService, node.id, newParentId);

            // The move already happened transiently; apply the remaining parts,
            // then push the compound without re-executing
            severCmds.forEach(c => c.execute());
            parentCmd.execute();
            this.historyService.pushWithoutExecute(
              new CompoundCommand('Move Node', [moveCmd, ...severCmds, parentCmd])
            );
          }
        }
      }
    } else if (this.isDraggingNode && !this.hasMoved && this.dragCollapseToId) {
      // Deferred collapse: a plain click on a Selection member — without a
      // drag — collapses the Selection to just that element
      this.graphService.selectNode(this.dragCollapseToId);
    }
    this.isDraggingNode = false;
    this.dragRoots = [];
    this.hasMoved = false;
    this.dragIsSelectionDrag = false;
    this.dragCollapseToId = null;
    this.dragIsSpawnedDuplicate = false;
    if (this.alignmentGuides().length > 0) this.alignmentGuides.set([]);

    // Finish resize drag — one undo step, only if the final rect actually changed
    if (this.isResizingNode && this.resizeNodeId) {
      const start = this.resizeStartRect;
      const node = this.graphService.nodes().find(n => n.id === this.resizeNodeId);
      if (start && node) {
        const changed =
          Math.abs(node.width - start.width) > 2 ||
          Math.abs(node.height - start.height) > 2 ||
          Math.abs(node.x - start.x) > 2 ||
          Math.abs(node.y - start.y) > 2;
        if (changed) {
          const cmd = new ResizeNodeCommand(
            this.graphService,
            this.resizeNodeId,
            { x: node.x, y: node.y, width: node.width, height: node.height },
            start,
          );
          this.historyService.pushWithoutExecute(cmd);
        }
      }
      this.isResizingNode = false;
      this.resizeNodeId = null;
      this.resizeCorner = null;
      this.resizeStartRect = null;
      this.resizeMoved = false;
    }

    if (this.isPanning) {
      this.isPanning = false;
    }

    // Finish connection drag — snapped drops create a Connection; un-snapped
    // drops past the 2px guard Quick-add a connected Node at the drop point
    if (this.isDraggingConnection) {
      this.isDraggingConnection = false;
      const layer = this.connectionLayer();
      if (layer) {
        // Always end the layer drag (clears the ghost), then decide the drop
        const result = layer.endConnectionDrag();
        if (this.connectionSourceNodeId && this.connectionSourceHandle) {
          if (result) {
            const cmd = new CreateConnectionCommand(
              this.graphService,
              this.connectionSourceNodeId,
              this.connectionSourceHandle,
              result.targetNodeId,
              result.targetHandle,
            );
            this.historyService.execute(cmd);
          } else if (this.connectionDragMoved) {
            const dropPos = this.clientPointToCanvas(event.clientX, event.clientY);
            if (dropPos) {
              const cmd = new QuickAddNodeCommand(
                this.graphService,
                this.connectionSourceNodeId,
                this.connectionSourceHandle,
                dropPos.x,
                dropPos.y,
              );
              this.historyService.execute(cmd);
              // Open the spawned Node's Text editor via the existing request
              // signal (UI-only: redo never reopens the editor)
              const nodeId = cmd.getNodeId();
              if (nodeId) {
                this.contextMenuService.editTextRequest.set(nodeId);
              }
            }
          }
        }
      }
      this.connectionSourceNodeId = null;
      this.connectionSourceHandle = null;
    }

    // Finish a Text card drag — one MoveConnectionTextCommand, only if the
    // 2px threshold was crossed and the stored position actually changed
    if (this.isDraggingConnectionText && this.textDragConnectionId) {
      if (this.textDragMoved) {
        const conn = this.graphService.connections().find(c => c.id === this.textDragConnectionId);
        const storedNow = conn?.textPosition ?? null;
        // conn.text guards Text removed mid-drag (e.g. Ctrl+Z while dragging):
        // a position command for a Text-less Connection would be a dead undo
        // step that still wipes the redo stack
        if (conn && conn.text && storedNow !== this.textDragOriginalPosition) {
          const cmd = new MoveConnectionTextCommand(
            this.graphService,
            this.textDragConnectionId,
            // A drag ending snapped at the midpoint stores nothing; redo
            // re-applies via the setter's own normalization
            storedNow ?? TEXT_POSITION_DEFAULT,
            this.textDragOriginalPosition,
          );
          this.historyService.pushWithoutExecute(cmd);
        }
      }
      this.isDraggingConnectionText = false;
      this.textDragConnectionId = null;
      this.textDragOriginalPosition = null;
      this.textDragMoved = false;
    }

    // Finish a Reroute Point drag — one MoveConnectionReroutePointCommand only
    // after the existing 2px threshold and only when the point really moved.
    if (this.isDraggingReroutePoint && this.reroutePointConnectionId) {
      const conn = this.graphService.connections().find(c => c.id === this.reroutePointConnectionId);
      const currentPoint = conn?.reroutePoints?.[this.reroutePointIndex];
      if (this.reroutePointMoved && currentPoint &&
          !sameCanvasPoint(currentPoint, this.reroutePointOriginalPoints[this.reroutePointIndex])) {
        this.historyService.pushWithoutExecute(new MoveConnectionReroutePointCommand(
          this.graphService,
          this.reroutePointConnectionId,
          this.reroutePointIndex,
          currentPoint,
          this.reroutePointOriginalPoints,
        ));
      }
      this.connectionLayer()?.setReroutePointDragging(null);
      this.isDraggingReroutePoint = false;
      this.reroutePointConnectionId = null;
      this.reroutePointIndex = -1;
      this.reroutePointOriginalPoints = [];
      this.reroutePointMoved = false;
    }
    this.syncChainDragSuppression();
  }

  // Group Label rename (Groups only)
  onNodeRename(event: { nodeId: string; newLabel: string }): void {
    const cmd = new RenameNodeCommand(this.graphService, event.nodeId, event.newLabel);
    this.historyService.execute(cmd);
  }

  // One Text edit session = one Command; the node already filtered empty/unchanged
  onNodeTextCommit(event: { nodeId: string; newText: Text }): void {
    const cmd = new SetNodeTextCommand(this.graphService, event.nodeId, event.newText);
    this.historyService.execute(cmd);
  }

  // Double-click on a Group's body creates a child node at the cursor
  onCreateChild(event: { parentId: string; clientX: number; clientY: number }): void {
    if (this.presentationService.active()) return;
    const canvasPos = this.clientPointToCanvas(event.clientX, event.clientY);
    if (!canvasPos) return;

    const cmd = new CreateNodeCommand(
      this.graphService, 'New Node', canvasPos.x - 60, canvasPos.y - 24, event.parentId,
    );
    this.historyService.execute(cmd);
  }

  // Plain click on a Connection collapses the Selection to it; Ctrl+click
  // toggles its membership (the layer already filtered to left-button)
  onConnectionSelect(event: { connectionId: string; additive: boolean }): void {
    if (this.presentationService.active()) return;
    if (event.additive) {
      this.graphService.toggleConnectionSelection(event.connectionId);
    } else {
      this.graphService.selectConnection(event.connectionId);
    }
  }

  onConnectionTextCommit(event: { connectionId: string; newText: Text | null }): void {
    const cmd = new SetConnectionTextCommand(this.graphService, event.connectionId, event.newText);
    this.historyService.execute(cmd);
  }

  onNodeSizeChanged(event: NodeSizeChangedEvent): void {
    if (event.preserveCenter) {
      this.historyService.recordAutoResize(event.nodeId, event.rect);
    }
    this.graphService.resizeNode(event.nodeId, event.rect);
  }
}

// The tight bounding rect of one or more rects — the reference an Alignment
// drag aligns by (a multi-Selection uses the union of its roots).
function unionRect(rects: Rect[]): Rect {
  const minX = Math.min(...rects.map(r => r.x));
  const minY = Math.min(...rects.map(r => r.y));
  const maxX = Math.max(...rects.map(r => r.x + r.width));
  const maxY = Math.max(...rects.map(r => r.y + r.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function sameCanvasPoint(a: ReroutePoint | undefined, b: ReroutePoint | undefined): boolean {
  return !!a && !!b && Math.abs(a.x - b.x) < 1e-3 && Math.abs(a.y - b.y) < 1e-3;
}
