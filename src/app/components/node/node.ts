import {
  Component, input, output, signal, computed, effect,
  ChangeDetectionStrategy, AfterViewInit, viewChild, ElementRef, inject,
} from '@angular/core';
import { GraphNode, HandleSide } from '../../models/node';
import { Text, isTextEmpty } from '../../models/text';
import { HandleComponent } from '../handle/handle';
import { TextViewComponent } from '../text-view/text-view';
import { TextEditorComponent } from '../text-editor/text-editor';
import { ContextMenuService } from '../../services/context-menu.service';
import { PresentationService } from '../../services/presentation.service';

export type GripCorner = 'nw' | 'ne' | 'sw' | 'se';

const DEFAULT_NODE_BACKGROUND = '#f0f0f5';
// 30% alpha suffix so Group fills stay see-through over children
const GROUP_FILL_ALPHA = '4D';

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
      [style.left.px]="node().x"
      [style.top.px]="node().y"
      [style.width.px]="node().width"
      [style.height.px]="node().height"
      [style.background]="cardBackground()"
      [style.--selection-glow]="selectionGlow()"
      (mousedown)="onMouseDown($event)"
      (dblclick)="onDoubleClick($event)"
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
            <app-text-editor
              [text]="nodeText()"
              (commit)="onTextCommit($event)"
              (cancelled)="onTextCancel()"
            />
          </div>
        } @else {
          <div #textWrap class="node-text">
            <app-text-view [text]="nodeText()" />
          </div>
        }
      }

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
      background: #f0f0f5;
      border: 1px solid rgba(15, 15, 18, 0.15);
      border-radius: 10px;
      padding: 8px 16px;
      cursor: grab;
      user-select: none;
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 120px;
      min-height: 48px;
      box-sizing: border-box;
      overflow: visible;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.45);
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }
    .node-card:hover {
      box-shadow: 0 6px 20px rgba(124, 92, 255, 0.28);
    }
    /* Present Mode: the card is a picture, not a control — no drag cursor,
       no hover glow, no Handles. Text links keep their own pointer events
       so Ctrl+Click still follows them. */
    .node-card.presenting {
      cursor: default;
    }
    .node-card.presenting:hover {
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.45);
    }
    .node-card.presenting app-handle {
      display: none;
    }
    .node-card.selected {
      box-shadow: 0 0 0px 1px grey, 0 0 6px 2px var(--selection-glow, #f0f0f5);
    }
    /* Lift a selected node (and its glow) above neighbouring cards */
    :host:has(.node-card.selected) {
      z-index: 5;
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
      border-style: dashed;
      border-width: 2px;
      border-color: rgba(255, 255, 255, 0.22);
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
      background: rgba(58, 58, 92, 0.35);
    }
    .group-label {
      color: #f0f0f5;
      font-size: 12px;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .node-text {
      width: 100%;
      color: #1a1a2e;
      font-size: 14px;
      font-weight: 500;
      text-align: center;
      --tv-size-s: 11px;
      --tv-size-l: 18px;
    }
    .node-label-input {
      background: transparent;
      border: none;
      border-bottom: 2px solid #7c5cff;
      color: #1a1a2e;
      font-size: 14px;
      font-weight: 500;
      outline: none;
      width: 100%;
      min-width: 80px;
      text-align: center;
    }
    .group-label-input {
      color: #f0f0f5;
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
      background: #7c5cff;
      border: 2px solid #0e0e11;
      z-index: 11;
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
  // Group Label rename (Groups only)
  rename = output<{ nodeId: string; newLabel: string }>();
  // Regular node Text commit (one edit session = one Command upstream)
  textCommit = output<{ nodeId: string; newText: Text }>();
  handleDragStart = output<{ nodeId: string; handle: HandleSide; event: MouseEvent }>();
  startResize = output<{ nodeId: string; corner: GripCorner; minWidth: number; minHeight: number; event: MouseEvent }>();
  createChild = output<{ parentId: string; clientX: number; clientY: number }>();
  private textWrap = viewChild<ElementRef<HTMLDivElement>>('textWrap');
  sizeChanged = output<{ nodeId: string; width: number; height: number }>();

  private editInput = viewChild<ElementRef<HTMLInputElement>>('editInput');
  private contextMenuService = inject(ContextMenuService);
  protected presentationService = inject(PresentationService);

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
  }

  isEditing = signal(false);
  handleSides: HandleSide[] = ['top', 'right', 'bottom', 'left'];
  gripCorners: GripCorner[] = ['nw', 'ne', 'sw', 'se'];

  isGroup = computed(() => this.node().kind === 'group');

  nodeText = computed<Text>(() => this.node().text ?? []);

  cardBackground = computed(() => {
    const base = this.node().color ?? DEFAULT_NODE_BACKGROUND;
    return this.isGroup() ? base + GROUP_FILL_ALPHA : base;
  });

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
    this.startResize.emit({
      nodeId: this.node().id,
      corner,
      minWidth: this.minLabelWidth(),
      minHeight: this.minTextHeight(),
      event,
    });
  }

  // The Text-derived auto-size acts as the minimum rect when resizing
  private minLabelWidth(): number {
    return Math.max(120, this.measureMinContentWidth() ?? 0);
  }

  private minTextHeight(): number {
    return Math.max(48, this.measureContentHeight() ?? 0);
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

  // Grow-only: wrapped Text raises the node's width floor (widest unbreakable
  // line) and height, but never shrinks a manually grown node
  private measureAndEmitSize(): void {
    if (this.isGroup()) return;
    const minWidth = this.measureMinContentWidth();
    const minHeight = this.measureContentHeight();
    if (minWidth === null || minHeight === null) return;
    const width = Math.max(120, minWidth, this.node().width);
    const height = Math.max(48, minHeight, this.node().height);
    if (width > this.node().width + 1 || height > this.node().height + 1) {
      this.sizeChanged.emit({ nodeId: this.node().id, width, height });
    }
  }

  ngAfterViewInit(): void {
    requestAnimationFrame(() => this.measureAndEmitSize());
  }
}
