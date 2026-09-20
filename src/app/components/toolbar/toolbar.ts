import { Component, inject, ChangeDetectionStrategy, input } from '@angular/core';
import { Router } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCommand,
  lucideZoomIn,
  lucideZoomOut,
  lucideMaximize,
  lucideUpload,
  lucideDownload,
  lucideFileDown,
  lucideCopy,
  lucideLink,
  lucideCloud,
  lucideFolderPlus,
  lucideNetwork,
  lucidePresentation,
  lucideLock,
  lucideLockOpen,
} from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmSeparator } from '@spartan-ng/helm/separator';
import {
  HlmDropdownMenu,
  HlmDropdownMenuTrigger,
  HlmDropdownMenuItem,
  HlmDropdownMenuLabel,
} from '@spartan-ng/helm/dropdown-menu';
import { GraphService } from '../../services/graph.service';
import { HistoryService } from '../../services/history.service';
import { ExportService } from '../../services/export.service';
import { CollectionService } from '../../services/collection.service';
import { ImportDialogService } from '../../services/import-dialog.service';
import { ExportDialogService } from '../../services/export-dialog.service';
import { PresentationService } from '../../services/presentation.service';
import { CanvasLockService } from '../../services/canvas-lock.service';
import { CommandPaletteService } from '../../services/command-palette.service';
import { CanvasViewportService } from '../../services/canvas-viewport.service';
import {
  buildTidyUpCommand,
} from '../../services/commands';

@Component({
  selector: 'app-toolbar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIcon, HlmButton, HlmSeparator, HlmDropdownMenu, HlmDropdownMenuTrigger, HlmDropdownMenuItem, HlmDropdownMenuLabel],
  providers: [
    provideIcons({
      lucideCommand,
      lucideZoomIn,
      lucideZoomOut,
      lucideMaximize,
      lucideUpload,
      lucideDownload,
      lucideFileDown,
      lucideCopy,
      lucideLink,
      lucideCloud,
      lucideFolderPlus,
      lucideNetwork,
      lucidePresentation,
      lucideLock,
      lucideLockOpen,
    }),
  ],
  template: `
    <!-- The Toolbar shares the Sidebar's surface and ink (user-mandated
         2026-08): bg-sidebar with pure white text and icons, so the top
         band reads as one block with the Sidebar column. -->
    <div class="toolbar-row flex items-center justify-between gap-2 px-4 py-1.5 bg-sidebar text-sidebar-foreground border-b border-border">
      <div class="flex shrink-0 items-center gap-2">
        <span class="text-sm font-medium text-sidebar-foreground">{{ graphService.nodeCount() }} {{ graphService.nodeCount() === 1 ? 'node' : 'nodes' }}</span>
      </div>

      <div class="flex min-w-0 shrink-0 items-center gap-1">
        <!-- Undo/Redo live in the floating Selection Actions Bar and Align in
             the floating Align Popover (spec #68, deliberately moved out of
             the ADR-0028 top-row triggers); Node and Connection styling live
             in the Selection Toolbar near the Selection — the top row keeps
             Commands and view controls. -->
        <button
          hlmBtn
          variant="outline"
          size="sm"
          class="command-trigger ml-1 gap-1.5"
          (click)="openPalette($event)"
          [disabled]="presentationService.active()"
          title="Commands (Ctrl+K)"
          aria-label="Open Commands (Ctrl+K)"
          aria-haspopup="dialog"
        >
          <ng-icon name="lucideCommand" />
          <span>Commands</span>
          <kbd>Ctrl K</kbd>
        </button>
        <!-- Align lives in the floating Align Popover behind More (spec #68). -->
      </div>

      <div class="flex shrink-0 items-center gap-1">
        <button hlmBtn variant="ghost" size="icon" (click)="zoomIn()" title="Zoom in" aria-label="Zoom in">
          <ng-icon name="lucideZoomIn" />
        </button>
        <button hlmBtn variant="ghost" size="icon" (click)="zoomOut()" title="Zoom out" aria-label="Zoom out">
          <ng-icon name="lucideZoomOut" />
        </button>
        <button hlmBtn variant="ghost" size="icon" (click)="zoomToFit()" title="Zoom to fit" aria-label="Zoom to fit">
          <ng-icon name="lucideMaximize" />
        </button>
        <button hlmBtn variant="ghost" size="icon" (click)="tidyUp()" [disabled]="canvasLock.locked()" [title]="canvasLock.locked() ? 'Unlock the Canvas to tidy up' : 'Tidy up'" aria-label="Tidy up">
          <ng-icon name="lucideNetwork" />
        </button>
        <button
          hlmBtn
          variant="ghost"
          size="icon"
          [hlmDropdownMenuTrigger]="presentMenu"
          [disabled]="!presentationService.canPresent()"
          [title]="presentationService.canPresent() ? 'Present' : 'Group nodes to present them'"
          aria-label="Present"
        >
          <ng-icon name="lucidePresentation" />
        </button>
        <button
          hlmBtn
          variant="ghost"
          size="icon"
          (click)="toggleLock()"
          [attr.aria-pressed]="canvasLock.locked()"
          [title]="canvasLock.locked() ? 'Unlock canvas' : 'Lock canvas'"
          [attr.aria-label]="canvasLock.locked() ? 'Unlock canvas' : 'Lock canvas'"
        >
          <ng-icon [name]="canvasLock.locked() ? 'lucideLockOpen' : 'lucideLock'" />
        </button>
        <span class="min-w-10 text-center text-sm font-medium text-sidebar-foreground">{{ zoomPercent() }}%</span>
        @if (scratchMode()) {
          <hlm-separator orientation="vertical" class="mx-1" />
          <button hlmBtn variant="ghost" size="icon" (click)="openImport()" [disabled]="canvasLock.locked()" [title]="canvasLock.locked() ? 'Unlock the Canvas to import' : 'Import'" aria-label="Import">
            <ng-icon name="lucideUpload" />
          </button>
          <button hlmBtn variant="ghost" size="icon" [hlmDropdownMenuTrigger]="exportMenu" title="Export" aria-label="Export">
            <ng-icon name="lucideDownload" />
          </button>
          <button
            hlmBtn
            variant="ghost"
            size="icon"
            [hlmDropdownMenuTrigger]="saveAsProjectMenu"
            [disabled]="collectionService.collections().length === 0"
            [title]="collectionService.collections().length === 0 ? 'Create a collection first' : 'Save as project'"
            aria-label="Save as project"
          >
            <ng-icon name="lucideFolderPlus" />
          </button>
        }
      </div>
    </div>

    <ng-template #presentMenu>
      <div hlmDropdownMenu class="w-64">
        <button hlmDropdownMenuItem (triggered)="presentReading()">
          <ng-icon name="lucidePresentation" />
          <span>Present in reading order</span>
        </button>
        <button hlmDropdownMenuItem (triggered)="presentFollowing()">
          <ng-icon name="lucidePresentation" />
          <span>Present following Connections</span>
        </button>
      </div>
    </ng-template>

    <ng-template #exportMenu>
      <div hlmDropdownMenu class="w-56">
        <button hlmDropdownMenuItem (triggered)="openExportDialog()">
          <ng-icon name="lucideFileDown" />
          <span>Export as…</span>
        </button>
        <button hlmDropdownMenuItem (triggered)="copyJson()">
          <ng-icon name="lucideCopy" />
          <span>Copy JSON</span>
        </button>
        <button hlmDropdownMenuItem (triggered)="copyMermaid()">
          <ng-icon name="lucideCopy" />
          <span>Copy Mermaid</span>
        </button>
        <button hlmDropdownMenuItem (triggered)="copyLink()">
          <ng-icon name="lucideLink" />
          <span>Copy link</span>
        </button>
        <button hlmDropdownMenuItem disabled>
          <ng-icon name="lucideCloud" />
          <span class="flex flex-col">
            <span>Export to Drive</span>
            <span class="text-xs text-muted-foreground">Sign in required — coming soon</span>
          </span>
        </button>
      </div>
    </ng-template>

    <ng-template #saveAsProjectMenu>
      <div hlmDropdownMenu class="w-56">
        <div hlmDropdownMenuLabel>Save to collection</div>
        @for (collection of collectionService.collections(); track collection.id) {
          <button hlmDropdownMenuItem (triggered)="saveAsProject(collection.id)">
            <span class="truncate">{{ collection.name }}</span>
          </button>
        }
      </div>
    </ng-template>
  `,
  styles: [`
    :host {
      display: block;
    }
    /* Narrow viewports: the selection clusters can outgrow the row — scroll
       the overflow instead of bursting the layout (clusters stay unshrunk) */
    .toolbar-row {
      overflow-x: auto;
      scrollbar-width: thin;
    }
    .command-trigger kbd {
      border: 1px solid var(--border);
      border-radius: 4px;
      background: var(--muted);
      color: var(--sidebar-foreground);
      font-family: inherit;
      font-size: 10px;
      line-height: 1;
      padding: 3px 4px;
    }
    /* Toolbar ink is pure white like the Sidebar (DESIGN.md flag log
       2026-08): ghost and outline buttons keep white through their own
       hover instead of dropping to the global --foreground. */
    .toolbar-row button:hover {
      color: var(--sidebar-foreground) !important;
    }
  `],
})
export class ToolbarComponent {
  graphService = inject(GraphService);
  historyService = inject(HistoryService);
  collectionService = inject(CollectionService);
  presentationService = inject(PresentationService);
  canvasLock = inject(CanvasLockService);
  private exportService = inject(ExportService);
  private importDialogService = inject(ImportDialogService);
  private exportDialogService = inject(ExportDialogService);
  private canvasViewport = inject(CanvasViewportService);
  private router = inject(Router);
  private commandPaletteService = inject(CommandPaletteService);

  /** True on `/` — Import/Export/Save-as-project only exist for the Scratch Canvas. */
  scratchMode = input<boolean>(false);

  openPalette(event: Event): void {
    const target = event.currentTarget;
    this.commandPaletteService.open(target instanceof HTMLElement ? target : null);
  }

  zoomPercent = () => Math.round(this.graphService.viewportState().zoom * 100);

  zoomIn(): void {
    this.canvasViewport.zoomByCentered(0.1);
  }

  zoomOut(): void {
    this.canvasViewport.zoomByCentered(-0.1);
  }

  // Frame the whole graph. Measures the visible canvas region from the canvas
  // container (the toolbar overlaps the window top, so the window is wrong).
  zoomToFit(): void {
    const rect = document.querySelector('.canvas-container')?.getBoundingClientRect();
    if (!rect) return;
    this.graphService.zoomToFit(rect.width, rect.height);
  }

  // Tidy up (spec #26, ADR-0019): one undo step, then the standard Zoom to
  // fit reveal (viewport-only, no History entry). Empty or already-tidy
  // graphs build no Command and touch nothing.
  tidyUp(): void {
    const cmd = buildTidyUpCommand(this.graphService);
    if (!cmd) return;
    this.historyService.execute(cmd);
    this.zoomToFit();
  }

  // Present Mode (spec #31, ADR-0020): entering hides all chrome (Sidebar
  // and toolbar), so the canvas is about to fill the window — Steps must
  // frame against that destination region, not the pre-hide canvas rect
  // (which is still shrunk by the chrome at click time).
  presentReading(): void {
    this.presentationService.enter(window.innerWidth, window.innerHeight, 'reading');
  }

  presentFollowing(): void {
    this.presentationService.enter(window.innerWidth, window.innerHeight, 'connection-following');
  }

  toggleLock(): void {
    this.canvasLock.toggle();
  }

  openImport(): void {
    this.importDialogService.requestOpen();
  }

  /** Keep the scratch graph as a Project in the chosen Collection. */
  saveAsProject(collectionId: string): void {
    const project = this.collectionService.saveScratchAsProject(
      collectionId,
      this.graphService.exportGraph(),
    );
    this.router.navigate(['/p', project.id]);
  }

  /** File downloads (JSON and PNG) go through the "Export as…" dialog. */
  openExportDialog(): void {
    this.exportDialogService.requestOpen();
  }

  copyJson(): void {
    this.exportService.copyJson();
  }

  copyMermaid(): void {
    this.exportService.copyMermaid();
  }

  copyLink(): void {
    this.exportService.copyLink();
  }
}
