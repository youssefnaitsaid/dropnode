import { Injectable, inject, signal } from '@angular/core';
import { HandleSide } from '../models/node';
import { GraphService } from './graph.service';
import { HistoryService } from './history.service';
import { ToastService } from '../components/toast/toast';
import { CreateConnectionCommand } from './commands';

/**
 * The keyboard Connection flow (WCAG 2.1.1): an armed Handle (Enter) starts a
 * pending Connection — the keyboard twin of the Handle→Handle drag. While
 * pending, Tab cycles between Handles and the ghost follows focus; Enter on
 * the focused Handle commits the same CreateConnectionCommand the drag path
 * uses, so History and validation stay identical. Also owns the `[`/`]`
 * Connection cycle (selection on a dense Canvas without wading the tab order).
 */
@Injectable({ providedIn: 'root' })
export class KeyboardConnectionService {
  private readonly graphService = inject(GraphService);
  private readonly historyService = inject(HistoryService);
  private readonly toastService = inject(ToastService);

  /** The armed source Handle, or null when no Connection is being composed. */
  readonly pending = signal<{ sourceNodeId: string; sourceHandle: HandleSide } | null>(null);

  /** The Handle currently focused by the keyboard; the ghost follows it. */
  readonly focusedHandle = signal<{ nodeId: string; handle: HandleSide } | null>(null);

  arm(nodeId: string, handle: HandleSide): void {
    this.pending.set({ sourceNodeId: nodeId, sourceHandle: handle });
  }

  cancel(): void {
    this.pending.set(null);
  }

  setFocusedHandle(focused: { nodeId: string; handle: HandleSide } | null): void {
    this.focusedHandle.set(focused);
  }

  /**
   * Tab between Handles in document order while a Connection is pending.
   * Focus drives the ghost endpoint, so no pointer math is needed — the
   * browser's own focus (and the focusin/blur tracking) is the cursor.
   */
  cycleHandleFocus(direction: 1 | -1): void {
    const handles = Array.from(document.querySelectorAll<HTMLElement>('[data-handle]'));
    if (handles.length === 0) return;
    const active = document.activeElement;
    const index = active instanceof HTMLElement ? handles.indexOf(active) : -1;
    const next = (index + direction + handles.length) % handles.length;
    handles[next].focus();
  }

  /** `[`/`]`: cycle the focusable Connection hit paths; Shift extends Selection. */
  cycleConnections(direction: 1 | -1, extend: boolean): void {
    const hits = Array.from(document.querySelectorAll<SVGPathElement>('path.connection-hit'));
    if (hits.length === 0) return;
    const active = document.activeElement;
    // SVGPathElement isn't a defined global in every environment (jsdom), so
    // membership is checked by shape, not instanceof
    const activeIsHit = active instanceof Element && active.getAttribute('data-connection-id') !== null;
    const index = activeIsHit ? hits.indexOf(active as SVGPathElement) : -1;
    const next = (index + direction + hits.length) % hits.length;
    const connectionId = hits[next].getAttribute('data-connection-id');
    if (!connectionId) return;
    if (extend) {
      this.graphService.toggleConnectionSelection(connectionId);
    } else {
      this.graphService.selectConnection(connectionId);
    }
    hits[next].focus();
  }

  /**
   * Tab while a Reroute Point is focused: cycle the visible points. Only the
   * selected Connection's points are in the DOM, so cycling naturally walks
   * the points of the Connection under keyboard control.
   */
  cycleReroutePoints(direction: 1 | -1): void {
    const points = Array.from(document.querySelectorAll<SVGCircleElement>('.reroute-point'));
    if (points.length === 0) return;
    const active = document.activeElement;
    const activeIsPoint = active instanceof Element && active.classList.contains('reroute-point');
    const index = activeIsPoint ? points.indexOf(active as SVGCircleElement) : -1;
    const next = (index + direction + points.length) % points.length;
    points[next].focus();
  }

  /**
   * Enter on a Handle while pending: commit the Connection if valid. The
   * validation mirrors graph.service's createConnection guards (self-link,
   * Group↔own-child, duplicate) so the rejection is surfaced with a reason
   * instead of a silent no-op; the success path runs the same undoable
   * Command as the mouse drag.
   */
  commitTarget(nodeId: string, handle: HandleSide): void {
    const source = this.pending();
    if (!source) return;
    const reason = this.invalidConnectionReason(source, { nodeId, handle });
    if (reason) {
      this.toastService.show(reason, 'error');
      return;
    }
    const command = new CreateConnectionCommand(
      this.graphService,
      source.sourceNodeId,
      source.sourceHandle,
      nodeId,
      handle,
    );
    this.historyService.execute(command);
    this.pending.set(null);
  }

  /** Public for the Connect dialog, which shows the same reasons inline. */
  invalidConnectionReason(
    source: { sourceNodeId: string; sourceHandle: HandleSide },
    target: { nodeId: string; handle: HandleSide },
  ): string | null {
    const violation = this.graphService.connectionViolation(
      source.sourceNodeId,
      source.sourceHandle,
      target.nodeId,
      target.handle,
    );
    return violation ? KeyboardConnectionService.VIOLATION_MESSAGES[violation] : null;
  }

  private static readonly VIOLATION_MESSAGES: Record<'self' | 'group-child' | 'duplicate' | 'text-block', string> = {
    self: "Can't connect a Node to itself",
    'group-child': "Can't connect a Group to one of its children",
    duplicate: 'That Connection already exists',
    'text-block': "Can't connect a Text Block — it has no Handles",
  };
}
