import {
  Component,
  ChangeDetectionStrategy,
  OnDestroy,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { CanvasComponent } from '../canvas/canvas';
import { MinimapComponent } from '../minimap/minimap';
import { MinimapService } from '../../services/minimap.service';
import { HistoryPanelComponent } from '../history-panel/history-panel';
import { HistoryPanelService } from '../../services/history-panel.service';
import { ToolbarComponent } from '../toolbar/toolbar';
import { GraphService } from '../../services/graph.service';
import { HistoryService } from '../../services/history.service';
import { CollectionService } from '../../services/collection.service';
import { UrlLoaderService } from '../../services/url-loader.service';
import { PresentationService } from '../../services/presentation.service';
import { CanvasLockService } from '../../services/canvas-lock.service';

/**
 * The editor page behind both routes: `/` (Scratch Canvas) and
 * `/p/:projectId` (a Project). All decisions live in CollectionService;
 * this component only wires route params, Graph State loading, the
 * load-time Zoom to Fit, History clearing, and the auto-save loop
 * together.
 */
@Component({
  selector: 'app-editor-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CanvasComponent, ToolbarComponent, MinimapComponent, HistoryPanelComponent],
  template: `
    <h1 class="sr-only">{{ projectTitle() }}</h1>
    @if (!presentationService.active()) {
      <app-toolbar [scratchMode]="!projectId()" />
    }
    <app-canvas />
    <!-- First-run affordance on an empty Canvas (never blocks interaction:
         pointer-events none, gone with the first Node). An empty graph can't
         enter Present Mode, so no Present guard is needed. -->
    @if (graphService.nodes().length === 0) {
      <div class="empty-canvas-hint">
        <span class="empty-canvas-hint-line">Double-click or double-tap the Canvas to add a Node</span>
        <span class="empty-canvas-hint-sub">Commands (Ctrl+K) opens the palette · Right-click for more actions</span>
      </div>
    }
    <!-- Hidden when empty (nothing to map), when the user toggled it off,
         and in Present Mode (it's chrome). -->
    @if (!presentationService.active() && !minimapService.hidden() && graphService.nodes().length > 0) {
      <app-minimap />
    }
    <!-- History Panel: hidden when toggled off and in Present Mode (chrome-free
         tour). Unlike the Minimap it stays mounted on an empty graph so the
         empty state keeps the toggle discoverable. Canvas Lock disables its
         rows in place rather than unmounting it. -->
    @if (!presentationService.active() && !historyPanelService.hidden()) {
      <app-history-panel />
    }
    <!-- Present Mode's only overlay: a non-interactive Step counter. Live so
         screen readers announce each Step change (WCAG 4.1.3). -->
    @if (presentationService.active()) {
      <div class="step-counter" role="status" aria-live="polite">
        {{ presentationService.stepIndex() + 1 }} / {{ presentationService.stepCount() }}
      </div>
    }
    <!-- Auto-save indicator: visible only on a Project route (the Scratch
         Canvas is never persisted, so there is nothing to report). Live so
         screen readers hear "Saved" land after the debounce settles. -->
    @if (projectId() && !presentationService.active()) {
      <div class="save-indicator" role="status" aria-live="polite">
        {{ saveState() === 'saving' ? 'Saving…' : 'Saved' }}
      </div>
    }
  `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      flex: 1 1 auto;
      min-width: 0;
      height: 100%;
      position: relative;
    }
    app-canvas {
      flex: 1 1 auto;
      min-height: 0;
    }
    .step-counter {
      position: absolute;
      bottom: max(16px, env(safe-area-inset-bottom));
      left: 50%;
      transform: translateX(-50%);
      padding: 4px 12px;
      border-radius: 9999px;
      background: color-mix(in srgb, var(--dn-canvas) 75%, transparent);
      border: 1px solid color-mix(in srgb, var(--dn-chip-ink) 15%, transparent);
      color: var(--dn-chip-ink);
      font-size: 12px;
      font-weight: 500;
      pointer-events: none;
      user-select: none;
    }
    /* Auto-save state, bottom-left (Minimap owns bottom-right, Step counter
       owns bottom-center). Deliberately quieter than the Step counter: it
       reports background persistence, never a primary action. */
    .save-indicator {
      position: absolute;
      bottom: max(16px, env(safe-area-inset-bottom));
      left: max(16px, env(safe-area-inset-left));
      padding: 4px 12px;
      border-radius: 8px;
      background: color-mix(in srgb, var(--dn-canvas) 75%, transparent);
      border: 1px solid color-mix(in srgb, var(--dn-chip-ink) 15%, transparent);
      color: var(--dn-chip-ink);
      font-size: 12px;
      font-weight: 500;
      pointer-events: none;
      user-select: none;
    }
    .empty-canvas-hint {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 6px;
      pointer-events: none;
      user-select: none;
      text-align: center;
      padding: 0 24px;
      /* Delayed fade: share-link/stash loads start empty, and the hint must
         not flash before their graph lands */
      animation: empty-hint-in 0.3s ease 0.5s both;
    }
    @keyframes empty-hint-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    .empty-canvas-hint-line {
      color: color-mix(in srgb, var(--dn-chip-ink) 72%, transparent);
      font-size: 14px;
      font-weight: 500;
    }
    .empty-canvas-hint-sub {
      color: color-mix(in srgb, var(--dn-chip-ink) 55%, transparent);
      font-size: 12px;
    }
    @media (prefers-reduced-motion: reduce) {
      .empty-canvas-hint {
        animation: none;
        opacity: 1;
      }
    }
  `],
})
export class EditorPageComponent implements OnDestroy {
  graphService = inject(GraphService);
  private historyService = inject(HistoryService);
  private collectionService = inject(CollectionService);
  private urlLoader = inject(UrlLoaderService);
  private canvasLock = inject(CanvasLockService);
  protected presentationService = inject(PresentationService);
  protected minimapService = inject(MinimapService);
  protected historyPanelService = inject(HistoryPanelService);

  /** Bound from the route param; undefined on the Scratch Canvas route. */
  projectId = input<string | undefined>(undefined);

  projectTitle = computed(() => {
    const id = this.projectId();
    if (!id) return 'Dropnode Scratch Canvas';
    return this.collectionService.getProject(id)?.name ?? 'Dropnode Project';
  });

  private currentProjectId: string | null = null;

  /** Auto-save state for the bottom-left indicator (Project routes only). */
  protected saveState = signal<'saving' | 'saved'>('saved');

  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingSave: (() => void) | null = null;

  constructor() {
    effect(() => {
      const id = this.projectId();
      untracked(() => this.activate(id));
    });

    // Auto-save: every Graph State or Viewport change persists the current
    // Project (debounced so per-mousemove drag frames coalesce). The Scratch
    // Canvas is never persisted — reload still clears it. A Present session
    // suspends persistence wholesale: the tour's Viewport writes must never
    // clobber the saved one, and the graph can't change while presenting.
    // Exit flips `active`, re-running the effect — the restored pre-Present
    // Viewport is what gets saved.
    effect(() => {
      const nodes = this.graphService.nodes();
      const connections = this.graphService.connections();
      const viewport = this.graphService.viewportState();
      const presenting = this.presentationService.active();
      const id = this.currentProjectId;
      if (!id || presenting) return;
      this.saveState.set('saving');
      this.scheduleSave(() => {
        this.collectionService.saveProjectGraph(id, { nodes, connections });
        this.collectionService.saveProjectViewport(id, viewport);
      });
    });
  }

  ngOnDestroy(): void {
    this.flushSave();
    if (!this.currentProjectId) {
      // Leaving the Scratch Canvas keeps its graph for the session.
      this.collectionService.stashScratch(
        this.graphService.exportGraph(),
        this.graphService.viewportState(),
      );
    }
  }

  /** Switching Projects (or entering scratch) — History never crosses over. */
  private activate(projectId: string | undefined): void {
    // Browser back/forward can switch Projects mid-tour (the Sidebar is
    // hidden, history navigation isn't): a Present session never crosses a
    // Project boundary. exit() is a no-op when not presenting.
    this.presentationService.exit();
    // Canvas Lock is transient UI state like the Selection: a switch lands
    // unlocked, silently (the lock toast belongs to the explicit toggle).
    this.canvasLock.unlock({ silent: true });
    this.flushSave();
    this.historyService.clear();

    if (projectId) {
      // Arm auto-save only after a successful load — otherwise the previous
      // project's canvas content would be saved into the wrong Project.
      this.currentProjectId = null;
      const graph = this.collectionService.getProjectGraph(projectId);
      const loaded = graph ? this.graphService.importGraph(graph).success : false;
      if (!loaded) {
        // Missing or corrupt stored graph (the guard only checks the Project
        // record) — show an empty canvas rather than another project's graph.
        this.graphService.clearGraph();
        this.graphService.resetViewport();
        return;
      }
      this.currentProjectId = projectId;
      this.frameLoadedGraph();
      this.collectionService.markOpened(projectId);
      return;
    }

    this.currentProjectId = null;
    const snapshot = this.collectionService.takeScratchSnapshot();
    // The compressed ?data payload decompresses asynchronously (ADR-0026),
    // so the fallbacks wait on the URL load rather than racing it onto the
    // Canvas.
    void this.urlLoader.load().then((loadedFromUrl) => {
      if (loadedFromUrl) {
        this.frameLoadedGraph();
        return;
      }
      if (snapshot) {
        this.graphService.importGraph(snapshot.graph);
        this.frameLoadedGraph();
      } else {
        this.graphService.clearGraph();
        this.graphService.resetViewport();
      }
    });
  }

  /**
   * A page load always opens framed: whichever graph activation lands — a
   * Project, a share link, or the stashed Scratch snapshot — gets Zoom to
   * Fit rather than its remembered Viewport. Deferred one frame so the
   * canvas container has its laid-out size to frame against; an empty
   * graph is Zoom to Fit's usual silent no-op.
   */
  private frameLoadedGraph(): void {
    requestAnimationFrame(() => {
      const rect = document.querySelector('.canvas-container')?.getBoundingClientRect();
      if (rect) this.graphService.zoomToFit(rect.width, rect.height);
    });
  }

  private scheduleSave(save: () => void): void {
    this.pendingSave = save;
    if (this.saveTimer !== null) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flushSave(), 300);
  }

  private flushSave(): void {
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    this.pendingSave?.();
    this.pendingSave = null;
    // The write landed (or nothing was pending) — the indicator settles.
    this.saveState.set('saved');
  }
}
