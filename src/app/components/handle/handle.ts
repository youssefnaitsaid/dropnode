import { Component, input, output, computed, inject, ChangeDetectionStrategy } from '@angular/core';
import { HandleSide } from '../../models/node';
import { textToPlainString } from '../../models/text';
import { GraphService } from '../../services/graph.service';
import { PresentationService } from '../../services/presentation.service';
import { CanvasLockService } from '../../services/canvas-lock.service';
import { KeyboardConnectionService } from '../../services/keyboard-connection.service';

@Component({
  selector: 'app-handle',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="handle"
      [class.snap-highlight]="isHighlighted() || pendingTarget()"
      [class.side-top]="side() === 'top'"
      [class.side-right]="side() === 'right'"
      [class.side-bottom]="side() === 'bottom'"
      [class.side-left]="side() === 'left'"
      [attr.data-handle]="nodeId() + ':' + side()"
      [attr.tabindex]="presentationService.active() || canvasLock.locked() ? null : 0"
      role="button"
      [attr.aria-label]="handleLabel()"
      (mousedown)="$event.stopPropagation(); onStartDrag($event)"
      (focus)="onFocus()"
      (blur)="onBlur()"
      (keydown)="onKeydown($event)"
    ></div>
  `,
  styles: [`
    :host {
      position: absolute;
      z-index: var(--dn-z-handle);
    }
    .handle {
      position: relative;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: var(--dn-accent);
      border: 2px solid var(--dn-canvas);
      cursor: crosshair;
      transition: transform 0.15s ease, background 0.15s ease;
    }
    .handle::before {
      content: '';
      position: absolute;
      inset: -8px;
      border-radius: 50%;
    }
    .handle:hover, .handle.snap-highlight {
      background: var(--dn-danger);
      transform: scale(1.4);
    }
    /* Keyboard focus (WCAG 2.4.7): a visible ring on the anchor, same accent
       as the Node card ring so keyboard users see where they are */
    .handle:focus-visible {
      outline: 2px solid var(--dn-accent);
      outline-offset: 3px;
    }
    .side-top { }
    .side-right { }
    .side-bottom { }
    .side-left { }
  `],
})
export class HandleComponent {
  side = input.required<HandleSide>();
  nodeId = input.required<string>();
  isHighlighted = input(false);
  startDrag = output<{ nodeId: string; handle: HandleSide; event: MouseEvent }>();

  private graphService = inject(GraphService);
  protected presentationService = inject(PresentationService);
  protected canvasLock = inject(CanvasLockService);
  private keyboardConnection = inject(KeyboardConnectionService);

  // Screen-reader name: "Connect from <node name>" — the Handle's only job is
  // starting a Connection, so the label says exactly that.
  handleLabel = computed(() => {
    const node = this.graphService.nodes().find(n => n.id === this.nodeId());
    if (!node) return 'Connection Handle';
    const name = node.kind === 'group'
      ? (node.label?.trim() || 'Group')
      : (textToPlainString(node.text ?? []).trim() || 'Node');
    return `Connect from ${name}`;
  });

  // While a Connection is pending, the focused Handle is the commit target —
  // red (the snap language) tells the user Enter will attach here.
  pendingTarget = computed(() => {
    const pending = this.keyboardConnection.pending();
    const focused = this.keyboardConnection.focusedHandle();
    return (
      pending !== null &&
      focused !== null &&
      focused.nodeId === this.nodeId() &&
      focused.handle === this.side()
    );
  });

  onFocus(): void {
    this.keyboardConnection.setFocusedHandle({ nodeId: this.nodeId(), handle: this.side() });
  }

  onBlur(): void {
    this.keyboardConnection.setFocusedHandle(null);
  }

  onKeydown(event: KeyboardEvent): void {
    if (this.presentationService.active() || this.canvasLock.locked()) return;
    if (event.key === 'Enter') {
      // The Node card's Enter-select must not fire: a Handle's Enter belongs
      // to the Connection flow, not the card
      event.preventDefault();
      event.stopPropagation();
      if (this.keyboardConnection.pending()) {
        this.keyboardConnection.commitTarget(this.nodeId(), this.side());
      } else {
        this.keyboardConnection.arm(this.nodeId(), this.side());
      }
      return;
    }
    if (event.key === 'Escape') {
      if (this.keyboardConnection.pending()) {
        event.preventDefault();
        event.stopPropagation();
        this.keyboardConnection.cancel();
      }
      return;
    }
    // Tab bubbles to the global handler, which cycles Handles while pending
  }

  onStartDrag(event: MouseEvent): void {
    // Left button only — right-click is reserved for the context menu
    if (event.button !== 0) return;
    this.startDrag.emit({
      nodeId: this.nodeId(),
      handle: this.side(),
      event,
    });
  }
}
