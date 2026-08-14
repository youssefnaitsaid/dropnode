import { Injectable, computed, inject, signal } from '@angular/core';
import { GraphService } from './graph.service';
import { ViewportState } from '../models/viewport-state';
import { Bounds, unionBounds, frameViewport } from '../models/bounds';
import { presentSteps, interpolateViewport, PRESENT_TRANSITION_MS } from '../models/present';

/**
 * Owns Present Mode — the read-only, chrome-free Viewport tour of Groups
 * (ADR-0020). Every Group is a Step, visited in positional reading order;
 * each Step frames its Group unioned with its children under the
 * Zoom-to-selection contract (90% fill, 2x cap, no bezier union). Transient
 * UI state: never Graph State, never History, never serialized. `active`
 * doubles as the gate the editor page uses to suspend Viewport auto-save
 * and the canvas uses to deaden interactions.
 */
@Injectable({ providedIn: 'root' })
export class PresentationService {
  private graphService = inject(GraphService);

  readonly active = signal(false);
  /** Zero-based; the overlay renders it as "index+1 / count". */
  readonly stepIndex = signal(0);
  /** Destination of the current Step's transition; null while inactive. */
  readonly targetViewport = signal<ViewportState | null>(null);

  readonly steps = computed(() => presentSteps(this.graphService.nodes()));
  readonly stepCount = computed(() => this.steps().length);
  readonly canPresent = computed(() => this.stepCount() > 0);

  // The pre-Present Viewport, restored exactly on exit — presenting never
  // relocates the working view.
  private savedViewport: ViewportState | null = null;
  private viewWidth = 0;
  private viewHeight = 0;
  private animationFrame: number | null = null;

  /** Start the tour at Step 1. No Groups or already presenting: silent no-op. */
  enter(viewWidth: number, viewHeight: number): void {
    if (this.active() || !this.canPresent()) return;
    this.viewWidth = viewWidth;
    this.viewHeight = viewHeight;
    this.savedViewport = this.graphService.viewportState();
    this.graphService.clearSelection();
    this.active.set(true);
    this.stepIndex.set(0);
    this.goToStep(0);
  }

  /** Escape: restore the exact pre-Present Viewport instantly and leave. */
  exit(): void {
    if (!this.active()) return;
    this.cancelTransition();
    if (this.savedViewport) this.graphService.setViewport(this.savedViewport);
    this.savedViewport = null;
    this.targetViewport.set(null);
    this.active.set(false);
  }

  /** Advance one Step; a hard no-op at the last Step — Escape is the only exit. */
  next(): void {
    if (!this.active()) return;
    const index = this.stepIndex() + 1;
    if (index >= this.stepCount()) return;
    this.stepIndex.set(index);
    this.goToStep(index);
  }

  /** Go back one Step; a hard no-op at the first. */
  previous(): void {
    if (!this.active()) return;
    const index = this.stepIndex() - 1;
    if (index < 0) return;
    this.stepIndex.set(index);
    this.goToStep(index);
  }

  private goToStep(index: number): void {
    const group = this.steps()[index];
    if (!group) return;
    const target = frameViewport(
      this.stepBounds(group.id),
      this.viewWidth,
      this.viewHeight,
      GraphService.SELECTION_MAX_ZOOM,
    );
    this.targetViewport.set(target);
    this.transitionTo(target);
  }

  // A Step's frame: the Group's rect unioned with its children's rects (a
  // child's edge may overhang, ADR-0018) — the Zoom-to-selection contract,
  // deliberately without internal Connections' bezier bounds.
  private stepBounds(groupId: string): Bounds {
    const nodes = this.graphService.nodes();
    const parts = nodes
      .filter(n => n.id === groupId || n.parentId === groupId)
      .map(n => ({ x: n.x, y: n.y, width: n.width, height: n.height }));
    return unionBounds(parts)!;
  }

  // The rAF ticker — a thin shell feeding progress into the pure
  // interpolateViewport. Starts from wherever the Viewport is right now, so
  // a mid-flight keypress (or free-roam wandering) retargets gliding, never
  // snapping. Reduced motion (or no rAF, as in jsdom) jumps instantly.
  private transitionTo(target: ViewportState): void {
    this.cancelTransition();
    if (this.prefersReducedMotion() || typeof requestAnimationFrame !== 'function') {
      this.graphService.setViewport(target);
      return;
    }
    const from = this.graphService.viewportState();
    const start = performance.now();
    const tick = (now: number): void => {
      const t = (now - start) / PRESENT_TRANSITION_MS;
      this.graphService.setViewport(interpolateViewport(from, target, t));
      this.animationFrame = t < 1 ? requestAnimationFrame(tick) : null;
    };
    this.animationFrame = requestAnimationFrame(tick);
  }

  private cancelTransition(): void {
    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }

  private prefersReducedMotion(): boolean {
    return (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }
}
