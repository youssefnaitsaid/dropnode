import { Component, inject, ChangeDetectionStrategy, input, computed } from '@angular/core';
import { Router } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideUndo2,
  lucideRedo2,
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
  lucideMinus,
  lucideArrowRight,
  lucidePlay,
  lucideAlignStartVertical,
  lucideAlignCenterVertical,
  lucideAlignEndVertical,
  lucideAlignStartHorizontal,
  lucideAlignCenterHorizontal,
  lucideAlignEndHorizontal,
  lucideAlignHorizontalSpaceBetween,
  lucideAlignVerticalSpaceBetween,
  lucideNetwork,
  lucidePresentation,
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
import { CommandPaletteService } from '../../services/command-palette.service';
import {
  buildSetNodesColorCommand,
  buildSetNodesShapeCommand,
  buildSetConnectionsColorCommand,
  buildSetConnectionsArrowheadCommand,
  buildSetConnectionsStrokePatternCommand,
  buildSetConnectionsStrokeWeightCommand,
  buildAlignSelectionCommand,
  buildDistributeSelectionCommand,
  buildTidyUpCommand,
} from '../../services/commands';
import { AlignKind, DistributeAxis } from '../../models/align-distribute';
import { NODE_PALETTE } from '../../models/node';
import { NodeShape, effectiveNodeShape } from '../../models/node-shape';
import { ArrowheadType, ArrowheadEnd, effectiveArrowhead, StrokePattern, StrokeWeight, effectiveStrokePattern, effectiveStrokeWeight } from '../../models/connection';

@Component({
  selector: 'app-toolbar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIcon, HlmButton, HlmSeparator, HlmDropdownMenu, HlmDropdownMenuTrigger, HlmDropdownMenuItem, HlmDropdownMenuLabel],
  providers: [
    provideIcons({
      lucideUndo2,
      lucideRedo2,
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
      lucideMinus,
      lucideArrowRight,
      lucidePlay,
      lucideAlignStartVertical,
      lucideAlignCenterVertical,
      lucideAlignEndVertical,
      lucideAlignStartHorizontal,
      lucideAlignCenterHorizontal,
      lucideAlignEndHorizontal,
      lucideAlignHorizontalSpaceBetween,
      lucideAlignVerticalSpaceBetween,
      lucideNetwork,
      lucidePresentation,
    }),
  ],
  template: `
    <div class="flex items-center justify-between gap-2 px-4 py-1.5 bg-card border-b border-border">
      <div class="flex items-center gap-2">
        <span class="text-sm font-medium text-muted-foreground">{{ graphService.nodeCount() }} nodes</span>
      </div>

      <div class="flex items-center gap-1">
        <button hlmBtn variant="ghost" size="icon" (click)="undo()" [disabled]="!historyService.canUndo()" title="Undo (Ctrl+Z)" aria-label="Undo">
          <ng-icon name="lucideUndo2" />
        </button>
        <button hlmBtn variant="ghost" size="icon" (click)="redo()" [disabled]="!historyService.canRedo()" title="Redo (Ctrl+Shift+Z)" aria-label="Redo">
          <ng-icon name="lucideRedo2" />
        </button>
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
        @if (graphService.selectedNodes().length > 0) {
          <hlm-separator orientation="vertical" class="mx-1" />
          <div class="flex items-center gap-1.5" title="Background color">
            <button
              class="swatch swatch-default"
              [class.active]="sharedNodeColor() === null"
              title="Default"
              aria-label="Default color"
              (click)="setColor(null)"
            ></button>
            @for (color of palette; track color) {
              <button
                class="swatch"
                [class.active]="sharedNodeColor() === color"
                [style.background]="color"
                [title]="color"
                [attr.aria-label]="color"
                (click)="setColor(color)"
              ></button>
            }
          </div>
        }
        @if (selectedRegularNodes().length > 0) {
          <hlm-separator orientation="vertical" class="mx-1" />
          <div class="flex items-center gap-0.5" title="Node shape" aria-label="Node shape">
            @for (option of shapeOptions; track option.shape) {
              <button
                type="button"
                class="ah-btn shape-btn"
                [class.active]="sharedNodeShape() === option.shape"
                [title]="option.label"
                [attr.aria-label]="option.label"
                (click)="setShape(option.shape)"
              >
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  @if (option.shape === 'rectangle') {
                    <rect x="3" y="5" width="14" height="10" rx="2" />
                  } @else if (option.shape === 'pill') {
                    <rect x="2" y="6" width="16" height="8" rx="4" />
                  } @else if (option.shape === 'diamond') {
                    <polygon points="10,2 18,10 10,18 2,10" />
                  } @else {
                    <ellipse cx="10" cy="10" rx="7" ry="5" />
                  }
                </svg>
              </button>
            }
          </div>
        }
        @if (graphService.selectedNodes().length >= 2) {
          <hlm-separator orientation="vertical" class="mx-1" />
          <div class="flex items-center gap-0.5">
            <button hlmBtn variant="ghost" size="icon" (click)="align('left')" title="Align left" aria-label="Align left">
              <ng-icon name="lucideAlignStartVertical" />
            </button>
            <button hlmBtn variant="ghost" size="icon" (click)="align('center')" title="Align center" aria-label="Align center">
              <ng-icon name="lucideAlignCenterVertical" />
            </button>
            <button hlmBtn variant="ghost" size="icon" (click)="align('right')" title="Align right" aria-label="Align right">
              <ng-icon name="lucideAlignEndVertical" />
            </button>
            <button hlmBtn variant="ghost" size="icon" (click)="align('top')" title="Align top" aria-label="Align top">
              <ng-icon name="lucideAlignStartHorizontal" />
            </button>
            <button hlmBtn variant="ghost" size="icon" (click)="align('middle')" title="Align middle" aria-label="Align middle">
              <ng-icon name="lucideAlignCenterHorizontal" />
            </button>
            <button hlmBtn variant="ghost" size="icon" (click)="align('bottom')" title="Align bottom" aria-label="Align bottom">
              <ng-icon name="lucideAlignEndHorizontal" />
            </button>
            <button hlmBtn variant="ghost" size="icon" (click)="distribute('horizontal')" [disabled]="graphService.selectedNodes().length < 3" title="Distribute horizontally" aria-label="Distribute horizontally">
              <ng-icon name="lucideAlignHorizontalSpaceBetween" />
            </button>
            <button hlmBtn variant="ghost" size="icon" (click)="distribute('vertical')" [disabled]="graphService.selectedNodes().length < 3" title="Distribute vertically" aria-label="Distribute vertically">
              <ng-icon name="lucideAlignVerticalSpaceBetween" />
            </button>
          </div>
        }
        @if (graphService.selectedConnections().length > 0) {
          <hlm-separator orientation="vertical" class="mx-1" />
          <div class="flex items-center gap-1.5" title="Connection color">
            <button
              class="swatch swatch-default"
              [class.active]="sharedConnectionColor() === null"
              title="Default"
              aria-label="Default color"
              (click)="setConnectionColor(null)"
            ></button>
            @for (color of palette; track color) {
              <button
                class="swatch"
                [class.active]="sharedConnectionColor() === color"
                [style.background]="color"
                [title]="color"
                [attr.aria-label]="color"
                (click)="setConnectionColor(color)"
              ></button>
            }
          </div>
          <hlm-separator orientation="vertical" class="mx-1" />
          <div class="flex items-center gap-0.5" title="Start arrowhead (source end)" aria-label="Start arrowhead">
            @for (opt of arrowheadOptions; track opt.type) {
              <button
                class="ah-btn"
                [class.active]="sharedArrowhead('start') === opt.type"
                [title]="opt.label"
                [attr.aria-label]="'Start ' + opt.label"
                (click)="setArrowhead('start', opt.type)"
              >
                <ng-icon [name]="opt.icon" class="flip-x" />
              </button>
            }
          </div>
          <div class="flex items-center gap-0.5" title="End arrowhead (target end)" aria-label="End arrowhead">
            @for (opt of arrowheadOptions; track opt.type) {
              <button
                class="ah-btn"
                [class.active]="sharedArrowhead('end') === opt.type"
                [title]="opt.label"
                [attr.aria-label]="'End ' + opt.label"
                (click)="setArrowhead('end', opt.type)"
              >
                <ng-icon [name]="opt.icon" />
              </button>
            }
          </div>
          <hlm-separator orientation="vertical" class="mx-1" />
          <div class="flex items-center gap-0.5" title="Stroke pattern" aria-label="Stroke pattern">
            @for (opt of strokePatternOptions; track opt.pattern) {
              <button
                class="ah-btn"
                [class.active]="sharedStrokePattern() === opt.pattern"
                [title]="opt.label"
                [attr.aria-label]="opt.label + ' stroke'"
                (click)="setStrokePattern(opt.pattern)"
              >
                <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
                  <path d="M2 10 H18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" [attr.stroke-dasharray]="opt.dash" />
                </svg>
              </button>
            }
          </div>
          <div class="flex items-center gap-0.5" title="Stroke weight" aria-label="Stroke weight">
            @for (opt of strokeWeightOptions; track opt.weight) {
              <button
                class="ah-btn"
                [class.active]="sharedStrokeWeight() === opt.weight"
                [title]="opt.label"
                [attr.aria-label]="opt.label + ' stroke'"
                (click)="setStrokeWeight(opt.weight)"
              >
                <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
                  <path d="M2 10 H18" fill="none" stroke="currentColor" [attr.stroke-width]="opt.previewWidth" stroke-linecap="round" />
                </svg>
              </button>
            }
          </div>
        }
      </div>

      <div class="flex items-center gap-1">
        <button hlmBtn variant="ghost" size="icon" (click)="zoomIn()" title="Zoom In" aria-label="Zoom in">
          <ng-icon name="lucideZoomIn" />
        </button>
        <button hlmBtn variant="ghost" size="icon" (click)="zoomOut()" title="Zoom Out" aria-label="Zoom out">
          <ng-icon name="lucideZoomOut" />
        </button>
        <button hlmBtn variant="ghost" size="icon" (click)="zoomToFit()" title="Zoom to Fit" aria-label="Zoom to fit">
          <ng-icon name="lucideMaximize" />
        </button>
        <button hlmBtn variant="ghost" size="icon" (click)="tidyUp()" title="Tidy up" aria-label="Tidy up">
          <ng-icon name="lucideNetwork" />
        </button>
        <button
          hlmBtn
          variant="ghost"
          size="icon"
          (click)="present()"
          [disabled]="!presentationService.canPresent()"
          [title]="presentationService.canPresent() ? 'Present' : 'Group nodes to present them'"
          aria-label="Present"
        >
          <ng-icon name="lucidePresentation" />
        </button>
        <span class="min-w-10 text-center text-sm font-medium text-muted-foreground">{{ zoomPercent() }}%</span>
        @if (scratchMode()) {
          <hlm-separator orientation="vertical" class="mx-1" />
          <button hlmBtn variant="ghost" size="icon" (click)="openImport()" title="Import" aria-label="Import">
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
    .command-trigger kbd {
      border: 1px solid var(--border);
      border-radius: 4px;
      background: var(--muted);
      color: var(--muted-foreground);
      font-family: inherit;
      font-size: 10px;
      line-height: 1;
      padding: 3px 4px;
    }
    .swatch {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      border: 2px solid var(--border);
      padding: 0;
      cursor: pointer;
      transition: transform 0.15s ease, border-color 0.15s ease;
    }
    .swatch:hover {
      transform: scale(1.2);
    }
    .swatch.active {
      border-color: var(--primary);
      box-shadow: 0 0 0 2px color-mix(in oklch, var(--primary) 30%, transparent);
    }
    .swatch-default {
      background: #f0f0f5;
      position: relative;
    }
    .swatch-default::after {
      content: '';
      position: absolute;
      inset: 3px;
      border-radius: 50%;
      border: 1px dashed var(--muted-foreground);
    }
    .ah-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 26px;
      height: 26px;
      border-radius: 6px;
      border: 1px solid transparent;
      background: transparent;
      color: var(--muted-foreground);
      cursor: pointer;
      transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
    }
    .ah-btn:hover {
      color: var(--foreground);
      background: var(--accent);
    }
    .ah-btn.active {
      color: var(--primary);
      border-color: var(--primary);
      background: color-mix(in oklch, var(--primary) 15%, transparent);
    }
    .shape-btn svg {
      width: 16px;
      height: 16px;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.5;
    }
    .flip-x {
      transform: scaleX(-1);
    }
  `],
})
export class ToolbarComponent {
  graphService = inject(GraphService);
  historyService = inject(HistoryService);
  collectionService = inject(CollectionService);
  presentationService = inject(PresentationService);
  private exportService = inject(ExportService);
  private importDialogService = inject(ImportDialogService);
  private exportDialogService = inject(ExportDialogService);
  private router = inject(Router);
  private commandPaletteService = inject(CommandPaletteService);

  /** True on `/` — Import/Export/Save-as-project only exist for the Scratch Canvas. */
  scratchMode = input<boolean>(false);

  openPalette(event: Event): void {
    const target = event.currentTarget;
    this.commandPaletteService.open(target instanceof HTMLElement ? target : null);
  }

  palette = NODE_PALETTE;
  selectedRegularNodes = computed(() =>
    this.graphService.selectedNodes().filter(node => node.kind !== 'group')
  );
  shapeOptions: { shape: NodeShape; label: string }[] = [
    { shape: 'rectangle', label: 'Rectangle' },
    { shape: 'pill', label: 'Pill' },
    { shape: 'diamond', label: 'Diamond' },
    { shape: 'ellipse', label: 'Ellipse' },
  ];

  // Start icons are the same glyphs flipped horizontally (see .flip-x) so they
  // point backward along the curve, teaching the source→target direction.
  arrowheadOptions: { type: ArrowheadType; icon: string; label: string }[] = [
    { type: 'none', icon: 'lucideMinus', label: 'None' },
    { type: 'arrow', icon: 'lucideArrowRight', label: 'Arrow' },
    { type: 'triangle', icon: 'lucidePlay', label: 'Triangle' },
  ];

  // Re-exposed for the template's active-state checks
  effectiveArrowhead = effectiveArrowhead;

  // Segmented options with inline preview glyphs drawn as the stroke itself
  strokePatternOptions: { pattern: StrokePattern; dash: string | null; label: string }[] = [
    { pattern: 'solid', dash: null, label: 'Solid' },
    { pattern: 'dashed', dash: '6 4', label: 'Dashed' },
    { pattern: 'dotted', dash: '0.1 4', label: 'Dotted' },
  ];

  strokeWeightOptions: { weight: StrokeWeight; previewWidth: number; label: string }[] = [
    { weight: 'thin', previewWidth: 1, label: 'Thin' },
    { weight: 'normal', previewWidth: 2, label: 'Normal' },
    { weight: 'thick', previewWidth: 3.5, label: 'Thick' },
  ];

  zoomPercent = () => Math.round(this.graphService.viewportState().zoom * 100);

  // A styling control reads as active only when ALL its targets share the
  // value (ADR-0015); undefined means a mixed set — nothing highlights.
  sharedNodeColor = (): string | null | undefined => {
    const nodes = this.graphService.selectedNodes();
    if (nodes.length === 0) return undefined;
    const first = nodes[0].color ?? null;
    return nodes.every(n => (n.color ?? null) === first) ? first : undefined;
  };

  sharedNodeShape = (): NodeShape | undefined => {
    const nodes = this.selectedRegularNodes();
    if (nodes.length === 0) return undefined;
    const first = effectiveNodeShape(nodes[0].shape);
    return nodes.every(n => effectiveNodeShape(n.shape) === first) ? first : undefined;
  };

  sharedConnectionColor = (): string | null | undefined => {
    const conns = this.graphService.selectedConnections();
    if (conns.length === 0) return undefined;
    const first = conns[0].color ?? null;
    return conns.every(c => (c.color ?? null) === first) ? first : undefined;
  };

  sharedArrowhead = (end: ArrowheadEnd): ArrowheadType | undefined => {
    const conns = this.graphService.selectedConnections();
    if (conns.length === 0) return undefined;
    const first = effectiveArrowhead(conns[0], end);
    return conns.every(c => effectiveArrowhead(c, end) === first) ? first : undefined;
  };

  sharedStrokePattern = (): StrokePattern | undefined => {
    const conns = this.graphService.selectedConnections();
    if (conns.length === 0) return undefined;
    const first = effectiveStrokePattern(conns[0]);
    return conns.every(c => effectiveStrokePattern(c) === first) ? first : undefined;
  };

  sharedStrokeWeight = (): StrokeWeight | undefined => {
    const conns = this.graphService.selectedConnections();
    if (conns.length === 0) return undefined;
    const first = effectiveStrokeWeight(conns[0]);
    return conns.every(c => effectiveStrokeWeight(c) === first) ? first : undefined;
  };

  // Bulk styling (ADR-0015): one compound Command over all selected targets;
  // the factories return null when nothing would change — no dead undo steps.
  setColor(color: string | null): void {
    const cmd = buildSetNodesColorCommand(
      this.graphService, this.graphService.selectedNodeIds(), color,
    );
    if (cmd) this.historyService.execute(cmd);
  }

  setShape(shape: NodeShape): void {
    const cmd = buildSetNodesShapeCommand(
      this.graphService, this.graphService.selectedNodeIds(), shape,
    );
    if (cmd) this.historyService.execute(cmd);
  }

  setConnectionColor(color: string | null): void {
    const cmd = buildSetConnectionsColorCommand(
      this.graphService, this.graphService.selectedConnectionIds(), color,
    );
    if (cmd) this.historyService.execute(cmd);
  }

  setArrowhead(end: ArrowheadEnd, type: ArrowheadType): void {
    const cmd = buildSetConnectionsArrowheadCommand(
      this.graphService, this.graphService.selectedConnectionIds(), end, type,
    );
    if (cmd) this.historyService.execute(cmd);
  }

  setStrokePattern(pattern: StrokePattern): void {
    const cmd = buildSetConnectionsStrokePatternCommand(
      this.graphService, this.graphService.selectedConnectionIds(), pattern,
    );
    if (cmd) this.historyService.execute(cmd);
  }

  setStrokeWeight(weight: StrokeWeight): void {
    const cmd = buildSetConnectionsStrokeWeightCommand(
      this.graphService, this.graphService.selectedConnectionIds(), weight,
    );
    if (cmd) this.historyService.execute(cmd);
  }

  // Align/Distribute (spec #25): one compound undo step over the Selection's
  // roots, a silent no-op when nothing would move
  align(kind: AlignKind): void {
    const cmd = buildAlignSelectionCommand(
      this.graphService, this.graphService.selectedNodeIds(), kind,
    );
    if (cmd) this.historyService.execute(cmd);
  }

  distribute(axis: DistributeAxis): void {
    const cmd = buildDistributeSelectionCommand(
      this.graphService, this.graphService.selectedNodeIds(), axis,
    );
    if (cmd) this.historyService.execute(cmd);
  }

  zoomIn(): void {
    this.graphService.zoomBy(0.1, 0, 0);
  }

  zoomOut(): void {
    this.graphService.zoomBy(-0.1, 0, 0);
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
  present(): void {
    this.presentationService.enter(window.innerWidth, window.innerHeight);
  }

  undo(): void {
    this.historyService.undo();
  }

  redo(): void {
    this.historyService.redo();
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

  copyLink(): void {
    this.exportService.copyLink();
  }
}
