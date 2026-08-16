import {
  Component, inject, signal, computed, ChangeDetectionStrategy, HostListener,
  ElementRef, viewChild, effect,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideMessageCircle } from '@ng-icons/lucide';
import { GraphService } from '../../services/graph.service';
import { HistoryService } from '../../services/history.service';
import { ContextMenuService } from '../../services/context-menu.service';
import { PresentationService } from '../../services/presentation.service';
import { PinVisibilityService } from '../../services/pin-visibility.service';
import {
  CreatePinCommand, EditPinCommand, MovePinCommand, DeletePinCommand,
} from '../../services/commands';
import { Pin, PinAnchor, pinAnchorPoint } from '../../models/pin';

interface PositionedPin {
  pin: Pin;
  x: number;
  y: number;
}

type PopoverState =
  | { mode: 'edit'; pinId: string; x: number; y: number; original: string }
  | { mode: 'ghost'; anchor: PinAnchor; x: number; y: number };

/**
 * The Pin layer (ADR-0025): renders one bubble per Pin at its anchor point,
 * hosts the ghost-pin creation popover and the editing popover, and drives
 * Pin drags. Thin glue by convention — every decision lives in the tested
 * services and Commands. Bubbles hide behind the global visibility toggle
 * and in Present Mode; an open popover stays usable either way.
 */
@Component({
  selector: 'app-pin-layer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIcon],
  providers: [provideIcons({ lucideMessageCircle })],
  template: `
    <div class="pin-layer" [class.pin-layer-hidden]="bubblesHidden()">
      @for (item of positionedPins(); track item.pin.id) {
        <div
          class="pin"
          [attr.data-pin-id]="item.pin.id"
          [attr.data-pin-kind]="item.pin.anchor.kind"
          [attr.data-pin-node-id]="item.pin.anchor.kind === 'node' ? item.pin.anchor.nodeId : null"
          [style.left.px]="item.x"
          [style.top.px]="item.y"
          [class.dragging]="dragPinId() === item.pin.id"
          (mousedown)="onPinMouseDown($event, item.pin)"
        >
          <ng-icon name="lucideMessageCircle" />
        </div>
      }

      @if (popover(); as pop) {
        <div
          class="pin-popover"
          [style.left.px]="pop.x"
          [style.top.px]="pop.y"
          (mousedown)="$event.stopPropagation()"
          (contextmenu)="$event.stopPropagation()"
        >
          <textarea
            #editor
            rows="4"
            [value]="draft()"
            (input)="draft.set($any($event.target).value)"
            (keydown)="onEditorKeyDown($event)"
            (blur)="commit()"
            placeholder="Write a message…"
          ></textarea>
          <p class="pin-popover-hint">Ctrl+Enter to save · Escape to cancel · empty deletes</p>
        </div>
      }
    </div>
  `,
  styles: [`
    .pin-layer {
      position: absolute;
      top: 0;
      left: 0;
      z-index: var(--dn-z-pin);
    }
    /* Hidden via a class, not by removing elements, so a PNG Export that
       includes Pins can reveal them in its snapshot regardless of the
       on-screen toggle */
    .pin-layer-hidden {
      display: none;
    }
    .pin {
      position: absolute;
      width: 28px;
      height: 28px;
      margin: -14px 0 0 -14px;
      border-radius: 9999px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--dn-accent);
      color: var(--dn-accent-ink);
      border: 2px solid rgba(255, 255, 255, 0.85);
      box-shadow: var(--dn-shadow-pin);
      cursor: grab;
      user-select: none;
    }
    .pin:hover {
      transform: scale(1.08);
    }
    .pin.dragging {
      cursor: grabbing;
    }
    .pin-popover {
      position: absolute;
      width: 300px;
      margin: 10px 0 0 -14px;
      border-radius: 0.5rem;
      border: 1px solid color-mix(in srgb, var(--dn-chip-ink) 16%, transparent);
      background: var(--dn-chip);
      box-shadow: var(--dn-shadow-pop);
      padding: 0.625rem;
    }
    .pin-popover textarea {
      width: 100%;
      box-sizing: border-box;
      resize: vertical;
      min-height: 88px;
      border-radius: 0.375rem;
      border: 1px solid color-mix(in srgb, var(--dn-chip-ink) 14%, transparent);
      background: color-mix(in srgb, var(--dn-chip-ink) 4%, transparent);
      color: var(--dn-chip-ink);
      padding: 0.5rem 0.625rem;
      font-size: 13px;
      line-height: 1.45;
      outline: none;
    }
    .pin-popover textarea:focus {
      border-color: var(--dn-accent);
    }
    .pin-popover-hint {
      margin: 0.5rem 0.125rem 0.125rem;
      font-size: 11px;
      color: color-mix(in srgb, var(--dn-chip-ink) 50%, transparent);
    }
  `],
})
export class PinLayerComponent {
  private graphService = inject(GraphService);
  private historyService = inject(HistoryService);
  private contextMenuService = inject(ContextMenuService);
  private presentationService = inject(PresentationService);
  private pinVisibility = inject(PinVisibilityService);

  readonly draft = signal('');
  readonly popover = signal<PopoverState | null>(null);
  readonly dragPinId = signal<string | null>(null);

  private editor = viewChild<ElementRef<HTMLTextAreaElement>>('editor');

  // The same 2px click/drag split as every other canvas drag
  private armedPin: Pin | null = null;
  private dragStartClientX = 0;
  private dragStartClientY = 0;
  private dragStartPoint = { x: 0, y: 0 };
  private dragOriginalAnchor: PinAnchor | null = null;
  private dragMoved = false;
  // Escape cancelled this session — the removal blur must not commit
  private suppressCommit = false;

  constructor() {
    // Consume ghost-pin creation requests (Context Menu, Palette Entry)
    effect(() => {
      const request = this.contextMenuService.pinCreateRequest();
      if (!request) return;
      this.contextMenuService.clearPinCreateRequest();
      const point = this.anchorPoint(request);
      this.openPopover({ mode: 'ghost', anchor: request, x: point?.x ?? 0, y: point?.y ?? 0 }, '');
    });

    // Consume edit requests (Context Menu "Edit pin")
    effect(() => {
      const pinId = this.contextMenuService.pinEditRequest();
      if (!pinId) return;
      this.contextMenuService.clearPinEditRequest();
      const pin = this.graphService.pins().find(p => p.id === pinId);
      if (!pin) return;
      const point = this.graphService.pinPoint(pin.id);
      this.openPopover(
        { mode: 'edit', pinId, x: point?.x ?? 0, y: point?.y ?? 0, original: pin.message },
        pin.message,
      );
    });

    // Focus and select the editor whenever a popover appears
    effect(() => {
      if (!this.popover()) return;
      const editor = this.editor()?.nativeElement;
      if (editor) {
        editor.focus();
        editor.select();
      }
    });
  }

  // Bubbles hide behind the toggle and in Present Mode; the popover does not
  readonly bubblesHidden = computed(() =>
    this.pinVisibility.hidden() || this.presentationService.active(),
  );

  readonly positionedPins = computed<PositionedPin[]>(() => {
    const pins = this.graphService.pins();
    const positioned: PositionedPin[] = [];
    for (const pin of pins) {
      const point = this.graphService.pinPoint(pin.id);
      if (point) positioned.push({ pin, x: point.x, y: point.y });
    }
    return positioned;
  });

  onPinMouseDown(event: MouseEvent, pin: Pin): void {
    if (this.presentationService.active()) return;
    if (event.button !== 0) return;
    event.stopPropagation();
    const point = this.graphService.pinPoint(pin.id);
    if (!point) return;

    this.armedPin = pin;
    this.dragStartClientX = event.clientX;
    this.dragStartClientY = event.clientY;
    this.dragStartPoint = point;
    this.dragOriginalAnchor = structuredClone(pin.anchor);
    this.dragMoved = false;
    this.dragPinId.set(pin.id);
  }

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(event: MouseEvent): void {
    if (!this.armedPin || !this.dragOriginalAnchor) return;
    const pinId = this.armedPin.id;
    const original = this.dragOriginalAnchor;
    const vp = this.graphService.viewportState();
    const dx = (event.clientX - this.dragStartClientX) / vp.zoom;
    const dy = (event.clientY - this.dragStartClientY) / vp.zoom;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
      this.dragMoved = true;
    }
    if (!this.dragMoved) return;

    // Transient anchor move within the Pin's own kind — no re-anchoring
    const x = this.dragStartPoint.x + dx;
    const y = this.dragStartPoint.y + dy;
    if (original.kind === 'canvas') {
      this.graphService.setPinAnchor(pinId, { kind: 'canvas', x, y });
    } else {
      const node = this.graphService.nodes().find(n => n.id === original.nodeId);
      if (!node) return;
      this.graphService.setPinAnchor(pinId, {
        kind: 'node', nodeId: node.id,
        offsetX: x - node.x, offsetY: y - node.y,
      });
    }
  }

  @HostListener('document:mouseup')
  onMouseUp(): void {
    if (!this.armedPin || !this.dragOriginalAnchor) return;
    const pin = this.armedPin;
    const original = this.dragOriginalAnchor;
    if (this.dragMoved) {
      const current = this.graphService.pins().find(p => p.id === pin.id);
      if (current && !sameAnchor(current.anchor, original)) {
        this.historyService.pushWithoutExecute(
          new MovePinCommand(this.graphService, pin.id, structuredClone(current.anchor), original),
        );
      }
    } else {
      // A click opens the editor — the deferred open mirrors node clicks
      const point = this.graphService.pinPoint(pin.id);
      if (point) {
        this.openPopover(
          { mode: 'edit', pinId: pin.id, x: point.x, y: point.y, original: pin.message },
          pin.message,
        );
      }
    }
    this.armedPin = null;
    this.dragOriginalAnchor = null;
    this.dragMoved = false;
    this.dragPinId.set(null);
  }

  onEditorKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.cancel();
      return;
    }
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      this.commit();
    }
    // Plain Enter inserts a newline — the textarea default (Text editor contract)
  }

  /** Blur or Ctrl+Enter: unchanged pushes nothing, empty removes, else one Command. */
  commit(): void {
    const pop = this.popover();
    if (!pop || this.suppressCommit) return;
    const value = this.draft();

    if (pop.mode === 'ghost') {
      if (value.trim() !== '') {
        this.historyService.execute(new CreatePinCommand(this.graphService, pop.anchor, value));
      }
    } else if (value.trim() === '') {
      this.historyService.execute(new DeletePinCommand(this.graphService, pop.pinId));
    } else if (value !== pop.original) {
      this.historyService.execute(new EditPinCommand(this.graphService, pop.pinId, value));
    }

    this.popover.set(null);
    this.draft.set('');
  }

  private cancel(): void {
    this.suppressCommit = true;
    this.popover.set(null);
    this.draft.set('');
    // The blur that DOM removal fires must find the flag still set
    setTimeout(() => { this.suppressCommit = false; });
  }

  private openPopover(state: PopoverState, initialDraft: string): void {
    this.suppressCommit = false;
    this.popover.set(state);
    this.draft.set(initialDraft);
  }

  private anchorPoint(anchor: PinAnchor): { x: number; y: number } | null {
    return pinAnchorPoint(anchor, this.graphService.nodes());
  }
}

function sameAnchor(a: PinAnchor, b: PinAnchor): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'canvas' && b.kind === 'canvas') {
    return Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6;
  }
  if (a.kind === 'node' && b.kind === 'node') {
    return a.nodeId === b.nodeId &&
      Math.abs(a.offsetX - b.offsetX) < 1e-6 &&
      Math.abs(a.offsetY - b.offsetY) < 1e-6;
  }
  return false;
}
