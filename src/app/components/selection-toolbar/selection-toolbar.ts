import {
  Component,
  ChangeDetectionStrategy,
  ElementRef,
  HostListener,
  effect,
  inject,
  signal,
  computed,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucidePencil,
  lucideScissors,
  lucideCopy,
  lucideCopyPlus,
  lucideTrash2,
  lucideEllipsis,
  lucideSquarePlus,
  lucideMoveDiagonal2,
  lucideMessageCircle,
  lucideClipboardPaste,
  lucideImageDown,
  lucideMapPin,
  lucideAlignStartVertical,
} from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import {
  HlmDropdownMenu,
  HlmDropdownMenuItem,
} from '@spartan-ng/helm/dropdown-menu';
import { AlignPopoverComponent } from '../align-popover/align-popover';
import { GraphService } from '../../services/graph.service';
import { HistoryService } from '../../services/history.service';
import { ContextMenuService } from '../../services/context-menu.service';
import { ClipboardService } from '../../services/clipboard.service';
import { ExportDialogService } from '../../services/export-dialog.service';
import { ResizeModeService } from '../../services/resize-mode.service';
import { CanvasLockService } from '../../services/canvas-lock.service';
import { PresentationService } from '../../services/presentation.service';
import { ChainHighlightService } from '../../services/chain-highlight.service';
import { CreateNodeCommand, CreateTextBlockCommand } from '../../services/commands';

/** Which mirror the toolbar shows: one per Selection shape. */
type ToolbarKind = 'single-node' | 'single-group' | 'single-connection' | 'multi' | 'pin';

export interface ToolbarAnchor {
  x: number;
  y: number;
  flipped: boolean;
}

// Gap between the Selection and the toolbar; flip margin and toolbar height
// estimate for the above/below decision (single row, measured heights vary).
const ANCHOR_GAP = 10;
const FLIP_MARGIN = 8;
const TOOLBAR_HEIGHT_ESTIMATE = 60;
// Row and More-panel height estimates for the More pop direction: the panel
// holds up to six items, so the estimate covers the tallest mirror.
const TOOLBAR_ROW_HEIGHT = 48;
const MORE_PANEL_HEIGHT = 230;

/**
 * Pure anchor math: Selection bounds top-center in canvas coords to a fixed
 * Viewport point — centered above with a gap and clamped inside the
 * Viewport. Top is the default; the toolbar drops below only when the top
 * cannot fit it, choosing the side with more free area when neither fits.
 * Tested through the component spec.
 */
export function anchorToolbar(
  bounds: { x: number; y: number; width: number; height: number },
  viewport: { panX: number; panY: number; zoom: number },
  container: { left: number; top: number },
  windowSize: { width: number; height: number },
): ToolbarAnchor {
  const centerCanvasX = bounds.x + bounds.width / 2;
  const clientX = container.left + centerCanvasX * viewport.zoom + viewport.panX;
  const topClientY = container.top + bounds.y * viewport.zoom + viewport.panY;
  const bottomClientY = container.top + (bounds.y + bounds.height) * viewport.zoom + viewport.panY;
  const x = Math.min(Math.max(clientX, FLIP_MARGIN), windowSize.width - FLIP_MARGIN);
  const aboveY = topClientY - ANCHOR_GAP;
  const belowY = bottomClientY + ANCHOR_GAP;
  if (aboveY - TOOLBAR_HEIGHT_ESTIMATE >= FLIP_MARGIN) {
    return { x, y: aboveY, flipped: false };
  }
  if (belowY + TOOLBAR_HEIGHT_ESTIMATE <= windowSize.height - FLIP_MARGIN) {
    return { x, y: belowY, flipped: true };
  }
  // Neither side fits: take the side with more free area, top on a tie.
  const spaceAbove = topClientY;
  const spaceBelow = windowSize.height - bottomClientY;
  if (spaceBelow > spaceAbove) {
    return { x, y: belowY, flipped: true };
  }
  return { x, y: aboveY, flipped: false };
}

/**
 * The Selection Toolbar: the near-Selection mirror of the Context Menu
 * actions for the current Selection — same Commands, same undo behavior,
 * only the surface is new. Dismisses with the Selection; read-only like
 * the Outline, never a second Selection model.
 *
 * Primary actions sit inline; point-anchored adds (Add node, Add text
 * block, Add pin, Paste), Resize mode, and Export as PNG live behind the
 * More trigger — one row, never two. Point-dependent actions anchor to the
 * Selection bounds center (a Group's center for child adds), since the
 * toolbar has no right-click point.
 */
@Component({
  selector: 'app-selection-toolbar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIcon, HlmButton, HlmDropdownMenu, HlmDropdownMenuItem, AlignPopoverComponent],
  host: {
    '[style.left.px]': 'position().x',
    '[style.top.px]': 'position().y',
    '[class.flipped]': 'position().flipped',
  },
  providers: [
    provideIcons({
      lucidePencil,
      lucideScissors,
      lucideCopy,
      lucideCopyPlus,
      lucideTrash2,
      lucideEllipsis,
      lucideSquarePlus,
      lucideMoveDiagonal2,
      lucideMessageCircle,
      lucideClipboardPaste,
      lucideImageDown,
      lucideMapPin,
      lucideAlignStartVertical,
    }),
  ],
  template: `
    @if (visible()) {
      <div class="toolbar-stack" [class.more-above]="!moreBelow()" (keydown)="onToolbarKeydown($event)">
        @if (alignOpen()) {
          <app-align-popover />
        }
        <div class="selection-toolbar" role="toolbar" aria-label="Selection toolbar">
          @if (kind() === 'single-node') {
            <button hlmBtn variant="ghost" size="icon" (click)="editText()" title="Edit text" aria-label="Edit text">
              <ng-icon name="lucidePencil" />
            </button>
          }
          @if (kind() === 'single-group') {
            <button hlmBtn variant="ghost" size="icon" (click)="rename()" title="Rename" aria-label="Rename">
              <ng-icon name="lucidePencil" />
            </button>
          }
          @if (kind() === 'single-connection') {
            <button hlmBtn variant="ghost" size="icon" (click)="editText()" title="Edit text" aria-label="Edit text">
              <ng-icon name="lucidePencil" />
            </button>
            <button hlmBtn variant="ghost" size="icon" (click)="addReroutePoint()" title="Add Reroute Point" aria-label="Add Reroute Point">
              <ng-icon name="lucideMapPin" />
            </button>
            <button hlmBtn variant="ghost" size="icon" (click)="remove()" title="Delete" aria-label="Delete">
              <ng-icon name="lucideTrash2" />
            </button>
          }
          @if (hasNodeActions()) {
            <button hlmBtn variant="ghost" size="icon" (click)="cut()" title="Cut (Ctrl+X)" aria-label="Cut">
              <ng-icon name="lucideScissors" />
            </button>
            <button hlmBtn variant="ghost" size="icon" (click)="copy()" title="Copy (Ctrl+C)" aria-label="Copy">
              <ng-icon name="lucideCopy" />
            </button>
            <button hlmBtn variant="ghost" size="icon" (click)="duplicate()" title="Duplicate (Ctrl+D)" aria-label="Duplicate">
              <ng-icon name="lucideCopyPlus" />
            </button>
          }
          @if (hasNodeActions()) {
            <button
              hlmBtn variant="ghost" size="icon"
              (click)="toggleMore()"
              [attr.aria-expanded]="moreOpen()"
              title="More options" aria-label="More options"
            >
              <ng-icon name="lucideEllipsis" />
            </button>
          }
          @if (kind() === 'multi' && canAlign()) {
            <button
              hlmBtn variant="ghost" size="icon"
              (click)="toggleAlign()"
              [attr.aria-expanded]="alignOpen()"
              title="Align and distribute" aria-label="Align"
            >
              <ng-icon name="lucideAlignStartVertical" />
            </button>
          }
          @if (kind() === 'pin') {
            <button hlmBtn variant="ghost" size="icon" (click)="editPin()" title="Edit pin" aria-label="Edit pin">
              <ng-icon name="lucideMessageCircle" />
            </button>
            <button hlmBtn variant="ghost" size="icon" (click)="deletePin()" title="Delete pin" aria-label="Delete pin">
              <ng-icon name="lucideTrash2" />
            </button>
          }
          @if (hasNodeActions()) {
            <button hlmBtn variant="ghost" size="icon" (click)="remove()" title="Delete" aria-label="Delete">
              <ng-icon name="lucideTrash2" />
            </button>
          }
        </div>
        @if (moreOpen()) {
          <div hlmDropdownMenu class="w-44" role="menu" aria-label="More selection actions">
            @if (kind() === 'single-group') {
              <button hlmDropdownMenuItem (triggered)="addNode()" title="Add node" aria-label="Add node">
                <ng-icon name="lucideSquarePlus" /><span>Add node</span>
              </button>
              <button hlmDropdownMenuItem (triggered)="addTextBlock()" title="Add text block" aria-label="Add text block">
                <ng-icon name="lucideSquarePlus" /><span>Add text block</span>
              </button>
            }
            @if (kind() === 'single-node' || kind() === 'single-group') {
              <button hlmDropdownMenuItem (triggered)="toggleResize()" [attr.aria-pressed]="resizeMode.mode()" title="Resize mode" aria-label="Resize mode">
                <ng-icon name="lucideMoveDiagonal2" /><span>Resize mode</span>
              </button>
              <button hlmDropdownMenuItem (triggered)="addPin()" title="Add pin" aria-label="Add pin">
                <ng-icon name="lucideMessageCircle" /><span>Add pin</span>
              </button>
            }
            @if (kind() === 'single-group') {
              <button hlmDropdownMenuItem (triggered)="pasteHere()" [disabled]="!canPaste()" title="Paste" aria-label="Paste">
                <ng-icon name="lucideClipboardPaste" /><span>Paste</span>
              </button>
            }
            @if (hasNodeActions()) {
              <button hlmDropdownMenuItem (triggered)="exportPng()" title="Export as PNG" aria-label="Export as PNG">
                <ng-icon name="lucideImageDown" /><span>Export as PNG</span>
              </button>
            }
          </div>
        }
      </div>
    }
  `,
  styles: [`
    :host {
      display: block;
      position: fixed;
      z-index: var(--dn-z-overlay);
      pointer-events: auto;
      transform: translate(-50%, -100%);
    }
    :host(.flipped) {
      transform: translate(-50%, 0);
    }
    .toolbar-stack {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
    }
    /* More pops below the toolbar by default; .more-above promotes it
       above the toolbar when the Viewport bottom cannot fit it. */
    .toolbar-stack.more-above > [data-slot='dropdown-menu'] {
      order: -1;
    }
    .selection-toolbar {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 6px 10px;
      max-width: calc(100vw - 32px);
      overflow-x: auto;
      background: var(--card);
      color: var(--card-foreground);
      border: 1px solid var(--border);
      border-radius: 8px;
      box-shadow: var(--dn-shadow-chip);
    }
    .selection-toolbar button:hover {
      color: var(--card-foreground) !important;
    }
  `],
})
export class SelectionToolbarComponent {
  private readonly graph = inject(GraphService);
  private readonly history = inject(HistoryService);
  private readonly menus = inject(ContextMenuService);
  private readonly clipboard = inject(ClipboardService);
  private readonly exportDialog = inject(ExportDialogService);
  readonly resizeMode = inject(ResizeModeService);
  private readonly lock = inject(CanvasLockService);
  private readonly presenting = inject(PresentationService);
  private readonly chain = inject(ChainHighlightService);
  private readonly host = inject(ElementRef);

  /** Secondary actions behind the More trigger. */
  readonly moreOpen = signal(false);
  /** The shared Align Popover, anchored above the toolbar like the bar. */
  readonly alignOpen = signal(false);
  /** Bumped on window resize so the anchor re-clamps. */
  private readonly resizeTick = signal(0);

  /** Canvas-coords anchor rect: the Selection bounds, or the Pin point. */
  private readonly anchorRect = computed(() => {
    const bounds = this.graph.selectionBounds();
    if (bounds) return bounds;
    const pinId = this.menus.activePinId();
    if (pinId) {
      const point = this.graph.pinPoint(pinId);
      if (point) return { x: point.x, y: point.y, width: 0, height: 0 };
    }
    return null;
  });

  /** Fixed Viewport point for the host: tracks Selection, pan, and zoom live. */
  readonly position = computed<ToolbarAnchor>(() => {
    this.resizeTick();
    const rect = this.anchorRect();
    const viewport = this.graph.viewportState();
    const container = document.querySelector('.canvas-container')?.getBoundingClientRect();
    if (!rect) return { x: FLIP_MARGIN, y: FLIP_MARGIN, flipped: false };
    return anchorToolbar(
      rect,
      viewport,
      { left: container?.left ?? 0, top: container?.top ?? 0 },
      { width: window.innerWidth, height: window.innerHeight },
    );
  });

  readonly canPaste = this.clipboard.canPaste;
  readonly canAlign = this.menus.canAlign;

  /**
   * More pops below the toolbar by default. It flips above only when the
   * Viewport bottom cannot fit the panel while the top can; when neither
   * fits, the roomier side wins with below on a tie. Reads position() so
   * pan, zoom, and resize re-evaluate it.
   */
  readonly moreBelow = computed(() => {
    const pos = this.position();
    const toolbarBottom = pos.y + (pos.flipped ? TOOLBAR_ROW_HEIGHT : 0);
    const toolbarTop = pos.y - (pos.flipped ? 0 : TOOLBAR_ROW_HEIGHT);
    const spaceBelow = window.innerHeight - toolbarBottom - ANCHOR_GAP;
    const spaceAbove = toolbarTop - ANCHOR_GAP;
    if (spaceBelow >= MORE_PANEL_HEIGHT) return true;
    if (spaceAbove >= MORE_PANEL_HEIGHT) return false;
    return spaceBelow >= spaceAbove;
  });

  /** The single selected Node, when the Selection is exactly one Node. */
  private readonly singleNode = computed(() => {
    const node = this.graph.selectedNode();
    return node;
  });

  /** Kinds with Node clipboard actions and the More trigger. */
  readonly hasNodeActions = computed(() => {
    const kind = this.kind();
    return kind === 'single-node' || kind === 'single-group' || kind === 'multi';
  });

  readonly kind = computed<ToolbarKind | null>(() => {
    if (this.graph.selectionSize() > 1) return 'multi';
    const node = this.singleNode();
    if (node) return node.kind === 'group' ? 'single-group' : 'single-node';
    if (this.graph.selectedConnectionId()) return 'single-connection';
    if (this.menus.activePinId() && this.graph.selectionSize() === 0) return 'pin';
    return null;
  });

  /** Dead under Canvas Lock and in Present Mode, like the Context Menu. */
  private readonly chromeLive = computed(() => !this.lock.locked() && !this.presenting.active());

  /**
   * Shown for any non-empty Selection (plus the Pin case); hidden while a
   * Text or Label edit session runs — the Formatting Toolbar owns it, and
   * the toolbar re-anchors when the session commits. Positioned separately.
   */
  readonly visible = computed(
    () => this.kind() !== null && this.chromeLive() && !this.chain.textEditingActive(),
  );

  constructor() {
    // Both panels belong to the Selection that opened them: any membership
    // change (not just size) retires them.
    effect(() => {
      this.graph.selectedNodeIds();
      this.graph.selectedConnectionIds();
      this.moreOpen.set(false);
      this.alignOpen.set(false);
    });
  }

  toggleMore(): void {
    this.moreOpen.update(open => !open);
  }

  toggleAlign(): void {
    if (!this.canAlign()) return;
    this.alignOpen.update(open => !open);
  }

  editText(): void {
    const connId = this.graph.selectedConnectionId();
    if (connId) {
      this.menus.requestConnectionText(connId);
      return;
    }
    const node = this.singleNode();
    if (node) this.menus.requestEditText(node.id);
  }

  addReroutePoint(): void {
    const connId = this.graph.selectedConnectionId();
    if (connId) this.menus.addReroutePointToConnection(connId);
  }

  rename(): void {
    const node = this.singleNode();
    if (node) this.menus.requestRename(node.id);
  }

  toggleResize(): void {
    this.resizeMode.toggle();
  }

  addPin(): void {
    const node = this.singleNode();
    if (!node) return;
    this.moreOpen.set(false);
    this.menus.requestCreatePin({
      kind: 'node', nodeId: node.id,
      offsetX: node.width / 2, offsetY: node.height / 2,
    });
  }

  addNode(): void {
    this.addChildToGroup('node');
  }

  addTextBlock(): void {
    this.addChildToGroup('text-block');
  }

  /** Spawn a child at the Group's center — the toolbar has no click point. */
  private addChildToGroup(child: 'node' | 'text-block'): void {
    const node = this.singleNode();
    if (!node || node.kind !== 'group') return;
    this.moreOpen.set(false);
    const x = node.x + node.width / 2 - 80;
    const y = node.y + node.height / 2 - 24;
    this.history.execute(
      child === 'node'
        ? new CreateNodeCommand(this.graph, 'New Node', x, y, node.id)
        : new CreateTextBlockCommand(this.graph, 'New Text Block', x, y, node.id),
    );
  }

  pasteHere(): void {
    const node = this.singleNode();
    if (!node || node.kind !== 'group' || !this.canPaste()) return;
    this.moreOpen.set(false);
    this.clipboard.pasteAt(node.x + node.width / 2, node.y + node.height / 2, node.id);
  }

  exportPng(): void {
    this.moreOpen.set(false);
    const rootIds = [...this.graph.selectedNodeIds()];
    if (rootIds.length === 0) return;
    this.exportDialog.requestOpen(undefined, {
      rootIds, isMultiSelection: this.kind() === 'multi',
    });
  }

  cut(): void {
    this.menus.cutSelection();
  }

  editPin(): void {
    // Consumes the Pin context like the menu closing on action: the toolbar
    // dismisses and stays hidden for the edit session.
    this.menus.editPin();
    this.menus.clear();
  }

  deletePin(): void {
    this.menus.deletePin();
    this.menus.clear();
  }

  copy(): void {
    this.menus.copySelection();
  }

  duplicate(): void {
    this.menus.duplicateSelection();
  }

  remove(): void {
    this.menus.deleteSelection();
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    this.resizeTick.update(n => n + 1);
  }

  /**
   * Roving focus inside the toolbar row: arrows move between enabled buttons
   * (wrapping), Home and End jump. Stopped so global Canvas arrow gestures
   * never fire while the toolbar owns focus. Tab order stays native.
   * Events from the More dropdown menu are left to the CDK menu, which owns
   * arrow navigation there.
   */
  onToolbarKeydown(event: KeyboardEvent): void {
    if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    if ((event.target as HTMLElement | null)?.closest?.('[data-slot="dropdown-menu"]')) return;
    const buttons = Array.from(
      (this.host.nativeElement as HTMLElement).querySelectorAll('button:not([disabled])'),
    ) as HTMLButtonElement[];
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (current === -1 || buttons.length === 0) return;
    event.preventDefault();
    event.stopPropagation();
    let next = current;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (current + 1) % buttons.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (current - 1 + buttons.length) % buttons.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = buttons.length - 1;
    buttons[next]?.focus();
  }

  @HostListener('document:keydown', ['$event'])
  onDocumentKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    this.moreOpen.set(false);
    this.alignOpen.set(false);
  }

  @HostListener('document:mousedown', ['$event'])
  onDocumentMousedown(event: MouseEvent): void {
    if (!this.moreOpen() && !this.alignOpen()) return;
    const root = this.host.nativeElement as HTMLElement;
    const target = event.target as Node | null;
    if (target && !root.contains(target)) {
      this.moreOpen.set(false);
      this.alignOpen.set(false);
    }
  }
}
