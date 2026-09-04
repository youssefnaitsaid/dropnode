import { Injectable, inject, signal, computed } from '@angular/core';
import { GraphService } from './graph.service';
import { CanvasViewportService } from './canvas-viewport.service';
import { ContextMenuService } from './context-menu.service';
import { PresentationService } from './presentation.service';
import { CanvasLockService } from './canvas-lock.service';
import { KeyboardScopeService } from './keyboard-scope.service';
import { PinVisibilityService } from './pin-visibility.service';
import { recenterViewport } from '../models/minimap';
import { CanvasSearchHit, searchCanvas } from '../models/canvas-search';

/** Rendered-row cap: the service reports every hit, the overlay shows this many. */
export const CANVAS_SEARCH_MAX_ROWS = 50;

/**
 * Canvas Search (grilled spec): transient overlay state over the whole Canvas.
 * Thin glue by convention — matching lives in models/canvas-search, framing
 * in GraphService, visibility in PinVisibilityService. Opening, searching,
 * and dismissing never touch Graph State or History.
 */
@Injectable({ providedIn: 'root' })
export class CanvasSearchService {
  private readonly graphService = inject(GraphService);
  private readonly viewport = inject(CanvasViewportService);
  private readonly contextMenu = inject(ContextMenuService);
  private readonly presentation = inject(PresentationService);
  private readonly canvasLock = inject(CanvasLockService);
  private readonly keyboardScope = inject(KeyboardScopeService);
  private readonly pinVisibility = inject(PinVisibilityService);

  readonly isOpen = signal(false);
  readonly query = signal('');
  readonly activeIndex = signal(0);

  private opener: HTMLElement | null = null;

  /**
   * Monotonic open requests (the Import/Connect dialog pattern): the Palette
   * Entry requests instead of opening synchronously, because the Palette's
   * own dialog still owns the keyboard when an entry runs. The overlay
   * component consumes each request once the guard clears.
   */
  private readonly _openRequests = signal(0);
  readonly openRequests = this._openRequests.asReadonly();

  requestOpen(): void {
    this._openRequests.update(n => n + 1);
  }

  readonly results = computed<CanvasSearchHit[]>(() =>
    searchCanvas(this.query(), {
      nodes: this.graphService.nodes(),
      connections: this.graphService.connections(),
      pins: this.graphService.pins(),
      pinsHidden: this.pinVisibility.hidden() || this.presentation.active(),
    }),
  );

  readonly totalCount = computed(() => this.results().length);
  readonly visibleResults = computed(() => this.results().slice(0, CANVAS_SEARCH_MAX_ROWS));
  readonly hasMore = computed(() => this.results().length > CANVAS_SEARCH_MAX_ROWS);
  readonly activeHit = computed<CanvasSearchHit | null>(() => {
    const visible = this.visibleResults();
    if (visible.length === 0) return null;
    return visible[this.activeIndex() % visible.length] ?? null;
  });

  open(opener?: HTMLElement | null): void {
    if (this.isOpen()) return;
    if (this.presentation.active()) return;
    // Never steal a Text editor (Palette-Entry path included): browser find
    // and the editor keep the keyboard while typing.
    if (typeof document !== 'undefined' && this.keyboardScope.isTypingTarget(document.activeElement)) return;
    if (!this.keyboardScope.canOpenPalette()) return;
    this.openNow(opener);
  }

  /**
   * Palette-Entry path, consumed by the overlay once the Palette closes.
   * Skips the DOM modal guard and the typing guard: the request can only run
   * while the Palette is the topmost modal, the Palette closes itself right
   * after entries run — but its dialog detaches asynchronously and keeps
   * focus until then, so both guards would still see the closing Palette and
   * refuse. Every other dialog-opening entry behaves the same (no guards at
   * all). The Present guard stays: search is never part of the tour.
   */
  openFromRequest(): void {
    if (this.isOpen()) return;
    if (this.presentation.active()) return;
    this.openNow(null);
  }

  private openNow(opener?: HTMLElement | null): void {
    this.opener = opener ?? this.activeElement();
    this.query.set('');
    this.activeIndex.set(0);
    this.isOpen.set(true);
  }

  close(restoreFocus = true): void {
    if (!this.isOpen()) return;
    const opener = this.opener;
    this.opener = null;
    this.isOpen.set(false);
    if (restoreFocus && opener && typeof opener.focus === 'function') {
      queueMicrotask(() => opener.focus());
    }
  }

  setQuery(value: string): void {
    this.query.set(value);
    this.activeIndex.set(0);
  }

  /** Step the highlight, wrapping at both ends (Palette convention). */
  moveActive(delta: number): void {
    const count = this.visibleResults().length;
    if (count === 0) return;
    this.activeIndex.update(index => (index + delta + count) % count);
  }

  activateCurrent(): void {
    const hit = this.activeHit();
    if (hit) this.activate(hit);
  }

  /**
   * Jump to a hit: Nodes, Text Blocks, Groups, and Connections replace the
   * Selection and frame via Zoom to Selection; Pins center at the current
   * zoom and open their popover without a Selection member. In Canvas Lock
   * the same Viewport motion runs with Selection writes suppressed.
   */
  activate(hit: CanvasSearchHit): void {
    const locked = this.canvasLock.locked();
    const size = this.viewport.visibleSize();
    if (hit.kind === 'pin') {
      const point = this.graphService.pinPoint(hit.id);
      if (!point) return;
      // No focus restore: the Pin popover takes focus on open.
      this.close(false);
      if (!locked) this.graphService.clearSelection();
      this.graphService.setViewport(
        recenterViewport(point, this.graphService.viewportState(), size.width, size.height),
      );
      this.contextMenu.requestEditPin(hit.id);
      return;
    }
    if (!locked) {
      if (hit.kind === 'connection') {
        this.graphService.setSelection([], [hit.id]);
      } else {
        this.graphService.setSelection([hit.id], []);
      }
      this.graphService.zoomToSelection(size.width, size.height);
    } else {
      if (hit.kind === 'connection') {
        this.graphService.zoomToElements([], [hit.id], size.width, size.height);
      } else {
        this.graphService.zoomToElements([hit.id], [], size.width, size.height);
      }
    }
    this.close();
  }

  private activeElement(): HTMLElement | null {
    return typeof document !== 'undefined' && typeof HTMLElement !== 'undefined' && document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  }
}
