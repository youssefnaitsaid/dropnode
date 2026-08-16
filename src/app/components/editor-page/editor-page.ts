import {
  Component,
  ChangeDetectionStrategy,
  OnDestroy,
  effect,
  inject,
  input,
  untracked,
} from '@angular/core';
import { CanvasComponent } from '../canvas/canvas';
import { MinimapComponent } from '../minimap/minimap';
import { MinimapService } from '../../services/minimap.service';
import { ToolbarComponent } from '../toolbar/toolbar';
import { GraphService } from '../../services/graph.service';
import { HistoryService } from '../../services/history.service';
import { CollectionService } from '../../services/collection.service';
import { UrlLoaderService } from '../../services/url-loader.service';
import { PresentationService } from '../../services/presentation.service';

/**
 * The editor page behind both routes: `/` (Scratch Canvas) and
 * `/p/:projectId` (a Project). All decisions live in CollectionService;
 * this component only wires route params, Graph State loading, History
 * clearing, and the auto-save loop together.
 */
@Component({
  selector: 'app-editor-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CanvasComponent, ToolbarComponent, MinimapComponent],
  template: `
    @if (!presentationService.active()) {
      <app-toolbar [scratchMode]="!projectId()" />
    }
    <app-canvas />
    <!-- Hidden when empty (nothing to map), when the user toggled it off,
         and in Present Mode (it's chrome). -->
    @if (!presentationService.active() && !minimapService.hidden() && graphService.nodes().length > 0) {
      <app-minimap />
    }
    <!-- Present Mode's only overlay: a non-interactive Step counter -->
    @if (presentationService.active()) {
      <div class="step-counter">
        {{ presentationService.stepIndex() + 1 }} / {{ presentationService.stepCount() }}
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
      bottom: 16px;
      left: 50%;
      transform: translateX(-50%);
      padding: 4px 12px;
      border-radius: 9999px;
      background: rgba(14, 14, 17, 0.75);
      border: 1px solid rgba(232, 232, 238, 0.15);
      color: #e8e8ee;
      font-size: 12px;
      font-weight: 500;
      pointer-events: none;
      user-select: none;
    }
  `],
})
export class EditorPageComponent implements OnDestroy {
  graphService = inject(GraphService);
  private historyService = inject(HistoryService);
  private collectionService = inject(CollectionService);
  private urlLoader = inject(UrlLoaderService);
  protected presentationService = inject(PresentationService);
  protected minimapService = inject(MinimapService);

  /** Bound from the route param; undefined on the Scratch Canvas route. */
  projectId = input<string | undefined>(undefined);

  private currentProjectId: string | null = null;

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
      this.graphService.setViewport(
        this.collectionService.getProjectViewport(projectId) ?? { panX: 0, panY: 0, zoom: 1 },
      );
      this.collectionService.markOpened(projectId);
      return;
    }

    this.currentProjectId = null;
    const loadedFromUrl = this.urlLoader.load();
    const snapshot = this.collectionService.takeScratchSnapshot();
    if (loadedFromUrl) return;
    if (snapshot) {
      this.graphService.importGraph(snapshot.graph);
      this.graphService.setViewport(snapshot.viewport);
    } else {
      this.graphService.clearGraph();
      this.graphService.resetViewport();
    }
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
  }
}
