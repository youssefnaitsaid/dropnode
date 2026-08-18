import {
  Component, input, output, signal, computed, effect,
  ChangeDetectionStrategy, AfterViewInit, viewChild, ElementRef, inject,
} from '@angular/core';
import { DEFAULT_NODE_BACKGROUND, GraphNode, HandleSide } from '../../models/node';
import {
  effectiveNodeShape,
  fitNodeShapeRect,
  NodeRect,
  NodeShape,
  shapeMinimumSize,
} from '../../models/node-shape';
import { Text, isTextEmpty, textToPlainString } from '../../models/text';
import { HandleComponent } from '../handle/handle';
import { TextViewComponent } from '../text-view/text-view';
import { TextEditorComponent } from '../text-editor/text-editor';
import { ContextMenuService } from '../../services/context-menu.service';
import { PresentationService } from '../../services/presentation.service';
import { ResizeModeService } from '../../services/resize-mode.service';

export type GripCorner = 'nw' | 'ne' | 'sw' | 'se';
export interface NodeSizeChangedEvent {
  nodeId: string;
  rect: NodeRect;
  preserveCenter: boolean;
}



@Component({
  selector: 'app-node',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HandleComponent, TextViewComponent, TextEditorComponent],
  template: `
    <div
      class="node-card"
      [class.group-card]="isGroup()"
      [class.selected]="isSelected()"
      [class.editing]="isEditing()"
      [class.presenting]="presentationService.active()"
      [attr.data-node-id]="node().id"
      [attr.data-shape]="isGroup() ? null : nodeShape()"
      [style.left.px]="node().x"
      [style.top.px]="node().y"
      [style.width.px]="node().width"
      [style.height.px]="node().height"
      [style.--selection-glow]="selectionGlow()"
      [attr.tabindex]="presentationService.active() ? null : 0"
      role="button"
      [attr.aria-label]="cardAriaLabel()"
      [attr.aria-pressed]="isSelected()"
      (mousedown)="onMouseDown($event)"
      (dblclick)="onDoubleClick($event)"
      (keydown)="onCardKeydown($event)"
    >
      <div
        class="node-surface"
        [class.group-card]="isGroup()"
        [class.selected]="isSelected()"
        [class.editing]="isEditing()"
        [class.presenting]="presentationService.active()"
        [class.shape-rectangle]="nodeShape() === 'rectangle'"
        [class.shape-pill]="nodeShape() === 'pill'"
        [class.shape-diamond]="nodeShape() === 'diamond'"
        [class.shape-ellipse]="nodeShape() === 'ellipse'"
        [attr.data-shape]="isGroup() ? null : nodeShape()"
        [style.background]="cardBackground()"
      >
        @if (isGroup()) {
          <div class="group-label-strip" (dblclick)="onLabelStripDoubleClick($event)">
            @if (isEditing()) {
              <input
                #editInput
                class="node-label-input group-label-input"
                [value]="node().label"
                (blur)="finishEdit($event)"
                (keydown.enter)="finishEdit($event)"
                (keydown.escape)="cancelEdit()"
                (mousedown)="$event.stopPropagation()"
                (contextmenu)="$event.stopPropagation()"
              />
            } @else {
              <span class="group-label">{{ node().label }}</span>
            }
          </div>
        } @else {
          @if (isEditing()) {
            <div class="node-text">
              @defer (when isEditing()) {
                <app-text-editor
                  [text]="nodeText()"
                  (commit)="onTextCommit($event)"
                  (cancelled)="onTextCancel()"
                />
              }
            </div>
          } @else {
            <div #textWrap class="node-text">
              <app-text-view [text]="nodeText()" />
            </div>
          }
        }
      </div>

      @for (side of handleSides; track side) {
        <app-handle
          [side]="side"
          [nodeId]="node().id"
          [isHighlighted]="isHandleSnapped(side)"
          [class.handle-top]="side === 'top'"
          [class.handle-right]="side === 'right'"
          [class.handle-bottom]="side === 'bottom'"
          [class.handle-left]="side === 'left'"
          (startDrag)="onHandleDragStart($event)"
        />
      }

      @if (soleSelected() && !isEditing()) {
        @for (corner of gripCorners; track corner) {
          <div
            class="grip"
            [class.grip-nw]="corner === 'nw'"
            [class.grip-ne]="corner === 'ne'"
            [class.grip-sw]="corner === 'sw'"
            [class.grip-se]="corner === 'se'"
            (mousedown)="onGripMouseDown(corner, $event)"
          ></div>
        }
      }
    </div>
  `,
  styles: [`
    :host {
      position: absolute;
    }
    .node-card {
      position: absolute;
      cursor: grab;
      user-select: none;
      box-sizing: border-box;
      overflow: visible;
    }
    .node-surface {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 0;
      min-height: 0;
      border: 1px solid var(--dn-node-edge);
      border-radius: 10px;
      padding: 8px 16px;
      box-sizing: border-box;
      overflow: visible;
      box-shadow: var(--dn-shadow-node);
      transition: border-color 0.15s ease, box-shadow 0.15s ease, filter 0.15s ease;
    }
    .node-card:hover .node-surface {
      box-shadow: var(--dn-shadow-node-hover);
    }
    /* Keyboard focus (WCAG 2.4.7): a visible ring around the card, distinct
       from the selection glow — the outline draws on the host, so diamond
       clip-paths can't swallow it */
    .node-card:focus-visible {
      outline: 2px solid var(--dn-accent);
      outline-offset: 2px;
      border-radius: 12px;
    }
    .node-surface.shape-pill {
      border-radius: 9999px;
    }
    .node-surface.shape-diamond {
      border-radius: 0;
      clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%);
    }
    .node-surface.shape-ellipse {
      border-radius: 50%;
    }
    /* clip-path clips every shadow the surface itself casts (box-shadow and
       same-element drop-shadow alike), so the diamond's resting, hover, and
       selection shadows are cast from the unclipped card instead */
    .node-card:has(.node-surface.shape-diamond) {
      filter: drop-shadow(0 2px 5px var(--dn-shadow-color));
      transition: filter 0.15s ease;
    }
    .node-card:has(.node-surface.shape-diamond):hover {
      filter: drop-shadow(0 6px 13px color-mix(in srgb, var(--dn-accent) 28%, transparent));
    }
    .node-card.presenting:has(.node-surface.shape-diamond):hover {
      filter: drop-shadow(0 2px 5px var(--dn-shadow-color));
    }
    /* Present Mode: the card is a picture, not a control — no drag cursor,
       no hover glow, no Handles. Text links keep their own pointer events
       so Ctrl+Click still follows them. */
    .node-card.presenting {
      cursor: default;
    }
    .node-card.presenting:hover .node-surface {
      box-shadow: var(--dn-shadow-node);
    }
    .node-card.presenting app-handle {
      display: none;
    }
    .node-card.selected .node-surface {
      box-shadow: 0 0 0px 1px var(--dn-sel-edge), 0 0 6px 2px var(--selection-glow, var(--dn-paper));
    }
    .node-card.selected .node-surface.shape-ellipse {
      box-shadow: none;
      filter: drop-shadow(0 0 1px var(--dn-sel-edge)) drop-shadow(0 0 6px var(--selection-glow, var(--dn-paper)));
    }
    /* after the diamond hover rule on purpose: a selected diamond keeps its
       selection glow while hovered, like the rectangle/pill cards */
    .node-card.selected:has(.node-surface.shape-diamond) {
      filter: drop-shadow(0 0 1px var(--dn-sel-edge)) drop-shadow(0 0 6px var(--selection-glow, var(--dn-paper)));
    }
    /* Lift a selected node (and its glow) above neighbouring cards,
       but NOT groups — they render below children by ADR-0008 stacking
       and a z-index lift would cover the children with the solid fill. */
    :host:has(.node-card.selected):not(:has(.group-card)) {
      z-index: var(--dn-z-selected);
    }
    /* While editing, the card hosts a text editor — not a drag target */
    .node-card.editing {
      cursor: text;
      user-select: text;
    }
    .group-card {
      padding: 0;
      align-items: flex-start;
      justify-content: flex-start;
      border-color: var(--dn-group-edge);
      box-shadow: none;
    }
    .group-label-strip {
      width: 100%;
      height: 28px;
      display: flex;
      align-items: center;
      padding: 0 12px;
      box-sizing: border-box;
      border-radius: 6px 6px 0 0;
      background: var(--dn-group-strip);
    }
    .group-label {
      /* Ink on the dark label strip: light, not the (now-dark) paper */
      color: var(--dn-group-ink);
      font-size: 12px;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .node-text {
      width: 100%;
      color: var(--dn-ink);
      font-size: 14px;
      font-weight: 500;
      text-align: center;
      --tv-size-s: 11px;
      --tv-size-l: 18px;
    }
    .node-label-input {
      background: transparent;
      border: none;
      border-bottom: 2px solid var(--dn-accent);
      color: var(--dn-ink);
      font-size: 14px;
      font-weight: 500;
      outline: none;
      width: 100%;
      min-width: 80px;
      text-align: center;
    }
    .group-label-input {
      color: var(--dn-group-ink);
      font-size: 12px;
      font-weight: 600;
      text-align: left;
    }
    .handle-top {
      position: absolute;
      top: -6px;
      left: 50%;
      transform: translateX(-50%);
    }
    .handle-right {
      position: absolute;
      right: -6px;
      top: 50%;
      transform: translateY(-50%);
    }
    .handle-bottom {
      position: absolute;
      bottom: -6px;
      left: 50%;
      transform: translateX(-50%);
    }
    .handle-left {
      position: absolute;
      left: -6px;
      top: 50%;
      transform: translateY(-50%);
    }
    .grip {
      position: absolute;
      width: 10px;
      height: 10px;
      border-radius: 2px;
      background: var(--dn-accent);
      border: 2px solid var(--dn-canvas);
      z-index: var(--dn-z-grip);
    }
    .grip::before {
      content: '';
      position: absolute;
      inset: -8px;
    }
    .grip-nw { top: -5px; left: -5px; cursor: nwse-resize; }
    .grip-ne { top: -5px; right: -5px; cursor: nesw-resize; }
    .grip-sw { bottom: -5px; left: -5px; cursor: nesw-resize; }
    .grip-se { bottom: -5px; right: -5px; cursor: nwse-resize; }
  `],
})
export class NodeComponent implements AfterViewInit {
  node = input.required<GraphNode>();
  isSelected = input(false);
  // True only when this node IS the entire Selection — Resize Grips are a
  // single-element affordance (ADR-0015)
  soleSelected = input(false);
  snapTarget = input<{ nodeId: string; handle: HandleSide } | null>(null);

  startMove = output<{ nodeId: string; event: MouseEvent }>();
  // Keyboard selection and movement (keyboard-first editing, WCAG 2.1.1):
  // Enter selects, arrow keys nudge. Movement goes upstream so the Canvas can
  // commit it as undoable Move Commands like a drag's mouseup.
  keyboardSelect = output<{ nodeId: string }>();
  keyboardMove = output<{ nodeId: string; dx: number; dy: number }>();
  keyboardResize = output<{ nodeId: string; rect: NodeRect; originalRect: NodeRect }>();
  // Group Label rename (Groups only)
  rename = output<{ nodeId: string; newLabel: string }>();
  // Regular node Text commit (one edit session = one Command upstream)
  textCommit = output<{ nodeId: string; newText: Text }>();
  handleDragStart = output<{ nodeId: string; handle: HandleSide; event: MouseEvent }>();
  startResize = output<{ nodeId: string; corner: GripCorner; minWidth: number; minHeight: number; event: MouseEvent }>();
  createChild = output<{ parentId: string; clientX: number; clientY: number }>();
  private textWrap = viewChild<ElementRef<HTMLDivElement>>('textWrap');
  sizeChanged = output<NodeSizeChangedEvent>();

  private editInput = viewChild<ElementRef<HTMLInputElement>>('editInput');
  private contextMenuService = inject(ContextMenuService);
  protected presentationService = inject(PresentationService);
  private resizeMode = inject(ResizeModeService);
  private viewReady = false;
  private measuredShape: NodeShape | null = null;

  constructor() {
    // autofocus doesn't fire for dynamically inserted inputs; focus and
    // select the Group Label text once the editor renders
    effect(() => {
      const input = this.editInput()?.nativeElement;
      if (input) {
        input.focus();
        input.select();
      }
    });

    // The context menu's "Rename" opens a Group's inline Label editor
    effect(() => {
      if (this.contextMenuService.renameRequest() === this.node().id) {
        this.isEditing.set(true);
        this.contextMenuService.clearRenameRequest();
      }
    });

    // The context menu's "Edit text" opens a regular node's Text editor
    effect(() => {
      if (this.contextMenuService.editTextRequest() === this.node().id) {
        this.isEditing.set(true);
        this.contextMenuService.clearEditTextRequest();
      }
    });

    // A shape change can require a larger safe bounding box. Wait for the
    // shaped surface to render, then grow around the existing center.
    effect(() => {
      const shape = this.nodeShape();
      if (!this.viewReady || !this.textWrap() || this.measuredShape === shape) return;
      this.measuredShape = shape;
      requestAnimationFrame(() => {
        if (this.nodeShape() === shape) this.measureAndEmitSize(true);
      });
    });
  }

  isEditing = signal(false);
  handleSides: HandleSide[] = ['top', 'right', 'bottom', 'left'];
  gripCorners: GripCorner[] = ['nw', 'ne', 'sw', 'se'];

  isGroup = computed(() => this.node().kind === 'group');

  nodeShape = computed<NodeShape>(() =>
    this.isGroup() ? 'rectangle' : effectiveNodeShape(this.node().shape)
  );

  nodeText = computed<Text>(() => this.node().text ?? []);

  // Screen-reader name for the card: a Group's label, or a regular Node's
  // Text flattened to plain text (falling back to "Node" when empty).
  cardAriaLabel = computed(() => {
    if (this.isGroup()) {
      const label = this.node().label?.trim();
      return label ? `Group, ${label}` : 'Group';
    }
    const plain = textToPlainString(this.nodeText()).trim();
    return plain ? plain : 'Node';
  });

  cardBackground = computed(() => this.node().color ?? DEFAULT_NODE_BACKGROUND);

  // The selection glow tracks the element's own color identity — the solid
  // base color, never a Group's translucent fill, so the glow stays visible
  selectionGlow = computed(() => this.node().color ?? DEFAULT_NODE_BACKGROUND);

  isHandleSnapped(side: HandleSide): boolean {
    const target = this.snapTarget();
    return target !== null && target.nodeId === this.node().id && target.handle === side;
  }

  onMouseDown(event: MouseEvent): void {
    if (this.isEditing()) return;
    // Present Mode: no select/drag — let the event bubble to the canvas so
    // Space+drag and middle-drag pans stay live over elements
    if (this.presentationService.active()) return;
    // Left button only — right-click is reserved for the context menu
    if (event.button !== 0) return;
    event.stopPropagation();
    this.startMove.emit({ nodeId: this.node().id, event });
  }

  // Keyboard operation of the card (WCAG 2.1.1): Enter selects like a click;
  // arrow keys nudge by 10px (1px with Shift). Ignored while editing, in
  // Present Mode, and while focus is in an input/contenteditable so typing
  // shortcuts keep working (keyboard-shortcuts guard parity).
  onCardKeydown(event: KeyboardEvent): void {
    if (this.isEditing() || this.presentationService.active()) return;
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

    if (event.key === 'Enter') {
      event.preventDefault();
      this.keyboardSelect.emit({ nodeId: this.node().id });
      return;
    }

    const dx = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
    const dy = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
    if (dx === 0 && dy === 0) return;
    event.preventDefault();

    // Resize mode (arrows) and Ctrl+arrows both resize: the pressed-side edge
    // moves, the opposite edge stays anchored, clamped to the shape/text
    // minimum the grips respect. The card computes (it owns the DOM min); the
    // Canvas owns the Command.
    if (this.resizeMode.mode() || event.ctrlKey) {
      this.emitKeyboardResize(dx, dy, event.shiftKey);
      return;
    }

    const step = event.shiftKey ? 1 : 10;
    this.keyboardMove.emit({ nodeId: this.node().id, dx: dx * step, dy: dy * step });
  }

  private emitKeyboardResize(dx: number, dy: number, fine: boolean): void {
    const node = this.node();
    const minimum = this.shapeMinimum();
    const delta = fine ? 1 : 10;
    let { x, y, width, height } = node;
    if (dx > 0) width = Math.max(minimum.width, width + delta);
    if (dx < 0) {
      const newWidth = Math.max(minimum.width, width - delta);
      x += width - newWidth;
      width = newWidth;
    }
    if (dy > 0) height = Math.max(minimum.height, height + delta);
    if (dy < 0) {
      const newHeight = Math.max(minimum.height, height - delta);
      y += height - newHeight;
      height = newHeight;
    }
    // Clamped at the minimum — a no-op, not an undo step
    if (width === node.width && height === node.height) return;
    this.keyboardResize.emit({
      nodeId: node.id,
      rect: { x, y, width, height },
      originalRect: { x: node.x, y: node.y, width: node.width, height: node.height },
    });
  }

  onDoubleClick(event: MouseEvent): void {
    if (this.presentationService.active()) return;
    event.stopPropagation();
    if (this.isEditing()) return;
    if (this.isGroup()) {
      // Group body: create a child node at the cursor (label strip edits instead)
      this.createChild.emit({
        parentId: this.node().id,
        clientX: event.clientX,
        clientY: event.clientY,
      });
      return;
    }
    this.isEditing.set(true);
  }

  onLabelStripDoubleClick(event: MouseEvent): void {
    if (this.presentationService.active()) return;
    event.stopPropagation();
    this.isEditing.set(true);
  }

  // Group Label commit: empty or unchanged labels are never committed
  finishEdit(event: Event): void {
    const input = event.target as HTMLInputElement;
    const newLabel = input.value.trim();
    if (newLabel && newLabel !== (this.node().label ?? '')) {
      this.rename.emit({ nodeId: this.node().id, newLabel });
    }
    this.isEditing.set(false);
  }

  cancelEdit(): void {
    this.isEditing.set(false);
  }

  // Text commit: committing empty reverts to the previous Text (nodes always
  // carry Text); the editor already guards unchanged content
  onTextCommit(newText: Text): void {
    if (!isTextEmpty(newText)) {
      this.textCommit.emit({ nodeId: this.node().id, newText });
    }
    this.isEditing.set(false);
    setTimeout(() => this.measureAndEmitSize(), 0);
  }

  onTextCancel(): void {
    this.isEditing.set(false);
  }

  onHandleDragStart(event: { nodeId: string; handle: HandleSide; event: MouseEvent }): void {
    this.handleDragStart.emit(event);
  }

  onGripMouseDown(corner: GripCorner, event: MouseEvent): void {
    // Left button only — right-click is reserved for the context menu
    if (event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    const minimum = this.shapeMinimum();
    this.startResize.emit({
      nodeId: this.node().id,
      corner,
      minWidth: minimum.width,
      minHeight: minimum.height,
      event,
    });
  }

  // The Text-derived safe rectangle acts as the minimum rect when resizing.
  private shapeMinimum(): { width: number; height: number } {
    return shapeMinimumSize(
      this.nodeShape(),
      this.measureMinContentWidth() ?? 0,
      this.measureContentHeight() ?? 0,
    );
  }

  private paddings(): { h: number; v: number } | null {
    const el = this.textWrap()?.nativeElement;
    const parent = el?.parentElement;
    if (!el || !parent) return null;
    const cs = getComputedStyle(parent);
    return {
      h: (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0) +
         (parseFloat(cs.borderLeftWidth) || 0) + (parseFloat(cs.borderRightWidth) || 0),
      v: (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0) +
         (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.borderBottomWidth) || 0),
    };
  }

  // Widest unbreakable line: measured with width:min-content, so wrapped
  // paragraphs don't inflate the floor
  private measureMinContentWidth(): number | null {
    const el = this.textWrap()?.nativeElement;
    const pad = this.paddings();
    if (!el || !pad) return null;
    const previous = el.style.width;
    el.style.width = 'min-content';
    const width = Math.ceil(el.getBoundingClientRect().width / this.zoomFactor());
    el.style.width = previous;
    return width + pad.h;
  }

  private measureContentHeight(): number | null {
    const el = this.textWrap()?.nativeElement;
    const pad = this.paddings();
    if (!el || !pad) return null;
    const height = Math.ceil(el.getBoundingClientRect().height / this.zoomFactor());
    return height + pad.v;
  }

  // getBoundingClientRect is scaled by the shared pan/zoom transform; divide
  // it back out to get canvas-unit sizes
  private zoomFactor(): number {
    const el = this.textWrap()?.nativeElement;
    if (!el) return 1;
    const reference = el.parentElement!;
    const layoutWidth = reference.offsetWidth;
    if (layoutWidth === 0) return 1;
    return reference.getBoundingClientRect().width / layoutWidth;
  }

  // Grow-only: wrapped Text raises the node's shape-safe floor, but never
  // shrinks a manually grown node. Shape changes preserve the Node center;
  // Text edits retain the existing top-left origin.
  private measureAndEmitSize(preserveCenter = false): void {
    if (this.isGroup()) return;
    const minWidth = this.measureMinContentWidth();
    const minHeight = this.measureContentHeight();
    if (minWidth === null || minHeight === null) return;
    const current = {
      x: this.node().x,
      y: this.node().y,
      width: this.node().width,
      height: this.node().height,
    };
    const fitted = preserveCenter
      ? fitNodeShapeRect(current, this.nodeShape(), minWidth, minHeight)
      : {
          ...current,
          width: Math.max(current.width, shapeMinimumSize(this.nodeShape(), minWidth, minHeight).width),
          height: Math.max(current.height, shapeMinimumSize(this.nodeShape(), minWidth, minHeight).height),
        };
    if (fitted.width > current.width + 1 || fitted.height > current.height + 1) {
      this.sizeChanged.emit({
        nodeId: this.node().id,
        rect: fitted,
        preserveCenter,
      });
    }
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    requestAnimationFrame(() => this.measureAndEmitSize());
  }
}
