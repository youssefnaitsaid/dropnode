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
  lucideCheck,
} from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmSeparator } from '@spartan-ng/helm/separator';
import {
  HlmDropdownMenu,
  HlmDropdownMenuTrigger,
  HlmDropdownMenuItem,
  HlmDropdownMenuLabel,
  HlmDropdownMenuSeparator,
} from '@spartan-ng/helm/dropdown-menu';
import { GraphService } from '../../services/graph.service';
import { HistoryService } from '../../services/history.service';
import { ExportService } from '../../services/export.service';
import { CollectionService } from '../../services/collection.service';
import { ImportDialogService } from '../../services/import-dialog.service';
import { ExportDialogService } from '../../services/export-dialog.service';
import { PresentationService } from '../../services/presentation.service';
import { CommandPaletteService } from '../../services/command-palette.service';
import { CanvasViewportService } from '../../services/canvas-viewport.service';
import {
  buildSetNodesColorCommand,
  buildSetNodesShapeCommand,
  buildSetNodesEmojiCommand,
  buildSetConnectionsColorCommand,
  buildSetConnectionsArrowheadCommand,
  buildSetConnectionsStrokePatternCommand,
  buildSetConnectionsStrokeWeightCommand,
  buildAlignSelectionCommand,
  buildDistributeSelectionCommand,
  buildTidyUpCommand,
} from '../../services/commands';
import { AlignKind, DistributeAxis } from '../../models/align-distribute';
import { NODE_PALETTE, NODE_PALETTE_NAMES } from '../../models/node';
import { NODE_EMOJIS } from '../../models/node-emoji';
import { NodeShape, effectiveNodeShape } from '../../models/node-shape';
import { ArrowheadType, ArrowheadEnd, effectiveArrowhead, StrokePattern, StrokeWeight, effectiveStrokePattern, effectiveStrokeWeight } from '../../models/connection';

@Component({
  selector: 'app-toolbar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIcon, HlmButton, HlmSeparator, HlmDropdownMenu, HlmDropdownMenuTrigger, HlmDropdownMenuItem, HlmDropdownMenuLabel, HlmDropdownMenuSeparator],
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
      lucideCheck,
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
          <!-- Node styling: one trigger previewing the shared color and Shape
               (ADR-0028); the details live in the dropdown so a Node selection
               reads as one decision instead of thirteen buttons. -->
          <hlm-separator orientation="vertical" class="mx-1" />
          <button
            hlmBtn
            variant="ghost"
            size="icon"
            [hlmDropdownMenuTrigger]="nodeMenu"
            title="Node — color, shape, and emoji"
            aria-label="Node styling"
          >
            <svg viewBox="0 0 20 20" class="size-4" aria-hidden="true">
              <g [attr.fill]="nodePreviewFill()" stroke="currentColor" stroke-width="1.5">
                @switch (nodePreviewShape()) {
                  @case ('rectangle') {
                    <rect x="3" y="5" width="14" height="10" rx="2" />
                  }
                  @case ('pill') {
                    <rect x="2" y="6" width="16" height="8" rx="4" />
                  }
                  @case ('diamond') {
                    <polygon points="10,2 18,10 10,18 2,10" />
                  }
                  @default {
                    <ellipse cx="10" cy="10" rx="7" ry="5" />
                  }
                }
              </g>
            </svg>
          </button>
        }
        @if (graphService.selectedNodes().length >= 2) {
          <!-- Arrange: Align and Distribute are actions, not a value, so the
               trigger is a fixed glyph with no preview (ADR-0028). -->
          <hlm-separator orientation="vertical" class="mx-1" />
          <button
            hlmBtn
            variant="ghost"
            size="icon"
            [hlmDropdownMenuTrigger]="alignMenu"
            title="Align and distribute"
            aria-label="Align and distribute"
          >
            <ng-icon name="lucideAlignStartVertical" />
          </button>
        }
        @if (graphService.selectedConnections().length > 0) {
          <!-- Connection styling: one trigger previewing the shared color,
               pattern, and weight; the details live in the dropdown so a
               Connection selection reads as one decision instead of twenty-two
               buttons (ADR-0028). -->
          <hlm-separator orientation="vertical" class="mx-1" />
          <button
            hlmBtn
            variant="ghost"
            size="icon"
            [hlmDropdownMenuTrigger]="connectionMenu"
            title="Connection — color, arrowheads, pattern, weight"
            aria-label="Connection styling"
          >
            <svg viewBox="0 0 20 20" class="size-4" aria-hidden="true">
              <path
                d="M2 10 H18"
                fill="none"
                [attr.stroke]="connectionPreviewColor()"
                [attr.stroke-width]="sharedStrokePreviewWeight()"
                stroke-linecap="round"
                [attr.stroke-dasharray]="sharedStrokePreviewDash()"
              />
            </svg>
          </button>
        }
      </div>

      <ng-template #nodeMenu>
        <div hlmDropdownMenu class="w-56">
          <div hlmDropdownMenuLabel>Color</div>
          <button hlmDropdownMenuItem (triggered)="setColor(null)">
            <span class="menu-swatch menu-swatch-default" aria-hidden="true"></span>
            <span>Default</span>
            @if (sharedNodeColor() === null) {
              <ng-icon name="lucideCheck" class="ml-auto" />
            }
          </button>
          @for (entry of paletteEntries; track entry.value) {
            <button hlmDropdownMenuItem (triggered)="setColor(entry.value)">
              <span class="menu-swatch" [style.background]="entry.value" aria-hidden="true"></span>
              <span>{{ entry.name }}</span>
              @if (sharedNodeColor() === entry.value) {
                <ng-icon name="lucideCheck" class="ml-auto" />
              }
            </button>
          }
          <hlm-dropdown-menu-separator />
          <!-- Groups carry no Shape (ADR-0023); the section stays visible but
               disabled so the state is explained (ADR-0028) -->
          <div hlmDropdownMenuLabel>
            {{ selectedRegularNodes().length === 0 ? 'Shape — select a regular Node first' : 'Shape' }}
          </div>
          @for (option of shapeOptions; track option.shape) {
            <button
              hlmDropdownMenuItem
              [disabled]="selectedRegularNodes().length === 0"
              (triggered)="setShape(option.shape)"
            >
              <svg viewBox="0 0 20 20" class="size-4" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
                @switch (option.shape) {
                  @case ('rectangle') {
                    <rect x="3" y="5" width="14" height="10" rx="2" />
                  }
                  @case ('pill') {
                    <rect x="2" y="6" width="16" height="8" rx="4" />
                  }
                  @case ('diamond') {
                    <polygon points="10,2 18,10 10,18 2,10" />
                  }
                  @default {
                    <ellipse cx="10" cy="10" rx="7" ry="5" />
                  }
                }
              </svg>
              <span>{{ option.label }}</span>
              @if (sharedNodeShape() === option.shape) {
                <ng-icon name="lucideCheck" class="ml-auto" />
              }
            </button>
          }
          <hlm-dropdown-menu-separator />
          <!-- Regular Nodes only, like Shape (ADR-0030); the section stays
               visible but disabled so the state is explained (ADR-0028) -->
          <div hlmDropdownMenuLabel>
            {{ selectedRegularNodes().length === 0 ? 'Emoji — select a regular Node first' : 'Emoji' }}
          </div>
          <button
            hlmDropdownMenuItem
            [disabled]="selectedRegularNodes().length === 0"
            (triggered)="setEmoji(null)"
          >
            <span class="menu-swatch menu-swatch-default" aria-hidden="true"></span>
            <span>None</span>
            @if (sharedNodeEmoji() === null) {
              <ng-icon name="lucideCheck" class="ml-auto" />
            }
          </button>
          <div class="emoji-grid" role="group" aria-label="Emoji choices">
            @for (entry of emojiEntries; track entry.emoji) {
              <button
                hlmDropdownMenuItem
                class="emoji-cell"
                [disabled]="selectedRegularNodes().length === 0"
                (triggered)="setEmoji(entry.emoji)"
                [title]="entry.name"
                [attr.aria-label]="entry.name"
                [attr.aria-pressed]="sharedNodeEmoji() === entry.emoji"
              >
                <span class="emoji-glyph" aria-hidden="true">{{ entry.emoji }}</span>
                @if (sharedNodeEmoji() === entry.emoji) {
                  <ng-icon name="lucideCheck" class="emoji-check" />
                }
              </button>
            }
          </div>
        </div>
      </ng-template>

      <ng-template #alignMenu>
        <div hlmDropdownMenu class="w-56">
          <div hlmDropdownMenuLabel>Align</div>
          @for (option of alignOptions; track option.kind) {
            <button hlmDropdownMenuItem (triggered)="align(option.kind)">
              <ng-icon [name]="option.icon" />
              <span>{{ option.label }}</span>
            </button>
          }
          <hlm-dropdown-menu-separator />
          <div hlmDropdownMenuLabel>Distribute</div>
          @for (option of distributeOptions; track option.axis) {
            <button
              hlmDropdownMenuItem
              [disabled]="graphService.selectedNodes().length < 3"
              (triggered)="distribute(option.axis)"
            >
              <ng-icon [name]="option.icon" />
              <span>{{ option.label }}</span>
            </button>
          }
        </div>
      </ng-template>

      <ng-template #connectionMenu>
        <div hlmDropdownMenu class="w-64">
          <div hlmDropdownMenuLabel>Color</div>
          <button hlmDropdownMenuItem (triggered)="setConnectionColor(null)">
            <span class="menu-swatch menu-swatch-default" aria-hidden="true"></span>
            <span>Default</span>
            @if (sharedConnectionColor() === null) {
              <ng-icon name="lucideCheck" class="ml-auto" />
            }
          </button>
          @for (entry of paletteEntries; track entry.value) {
            <button hlmDropdownMenuItem (triggered)="setConnectionColor(entry.value)">
              <span class="menu-swatch" [style.background]="entry.value" aria-hidden="true"></span>
              <span>{{ entry.name }}</span>
              @if (sharedConnectionColor() === entry.value) {
                <ng-icon name="lucideCheck" class="ml-auto" />
              }
            </button>
          }
          <hlm-dropdown-menu-separator />
          <div hlmDropdownMenuLabel>Start arrowhead</div>
          @for (opt of arrowheadOptions; track opt.type) {
            <button hlmDropdownMenuItem (triggered)="setArrowhead('start', opt.type)">
              <ng-icon [name]="opt.icon" class="flip-x" />
              <span>{{ opt.label }}</span>
              @if (sharedArrowhead('start') === opt.type) {
                <ng-icon name="lucideCheck" class="ml-auto" />
              }
            </button>
          }
          <hlm-dropdown-menu-separator />
          <div hlmDropdownMenuLabel>End arrowhead</div>
          @for (opt of arrowheadOptions; track opt.type) {
            <button hlmDropdownMenuItem (triggered)="setArrowhead('end', opt.type)">
              <ng-icon [name]="opt.icon" />
              <span>{{ opt.label }}</span>
              @if (sharedArrowhead('end') === opt.type) {
                <ng-icon name="lucideCheck" class="ml-auto" />
              }
            </button>
          }
          <hlm-dropdown-menu-separator />
          <div hlmDropdownMenuLabel>Pattern</div>
          @for (opt of strokePatternOptions; track opt.pattern) {
            <button hlmDropdownMenuItem (triggered)="setStrokePattern(opt.pattern)">
              <svg viewBox="0 0 20 20" class="size-4" aria-hidden="true">
                <path d="M2 10 H18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" [attr.stroke-dasharray]="opt.dash" />
              </svg>
              <span>{{ opt.label }}</span>
              @if (sharedStrokePattern() === opt.pattern) {
                <ng-icon name="lucideCheck" class="ml-auto" />
              }
            </button>
          }
          <hlm-dropdown-menu-separator />
          <div hlmDropdownMenuLabel>Weight</div>
          @for (opt of strokeWeightOptions; track opt.weight) {
            <button hlmDropdownMenuItem (triggered)="setStrokeWeight(opt.weight)">
              <svg viewBox="0 0 20 20" class="size-4" aria-hidden="true">
                <path d="M2 10 H18" fill="none" stroke="currentColor" [attr.stroke-width]="opt.previewWidth" stroke-linecap="round" />
              </svg>
              <span>{{ opt.label }}</span>
              @if (sharedStrokeWeight() === opt.weight) {
                <ng-icon name="lucideCheck" class="ml-auto" />
              }
            </button>
          }
        </div>
      </ng-template>

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
        <span class="min-w-10 text-center text-sm font-medium text-sidebar-foreground">{{ zoomPercent() }}%</span>
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
    /* Menu swatches: the Palette color items inside the styling triggers
       (ADR-0028); the dashed inner ring marks the Default swatch */
    .menu-swatch {
      width: 16px;
      height: 16px;
      flex: 0 0 auto;
      border-radius: 50%;
      border: 2px solid var(--border);
    }
    .menu-swatch-default {
      position: relative;
      background: var(--dn-paper);
    }
    .menu-swatch-default::after {
      content: '';
      position: absolute;
      inset: 2px;
      border-radius: 50%;
      border: 1px dashed var(--muted-foreground);
    }
    /* Emoji picker (ADR-0030): the 48 curated glyphs as a compact grid with
       name tooltips, inside the Node styling trigger beside Color/Shape */
    .emoji-grid {
      display: grid;
      grid-template-columns: repeat(8, minmax(0, 1fr));
      gap: 2px;
      padding: 4px 8px 8px;
    }
    .emoji-cell {
      position: relative;
      justify-content: center;
      padding: 4px 0;
      font-size: 16px;
      line-height: 1;
    }
    .emoji-glyph {
      line-height: 1;
    }
    .emoji-check {
      position: absolute;
      right: 0;
      bottom: 0;
      font-size: 10px;
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
  private canvasViewport = inject(CanvasViewportService);
  private router = inject(Router);
  private commandPaletteService = inject(CommandPaletteService);

  /** True on `/` — Import/Export/Save-as-project only exist for the Scratch Canvas. */
  scratchMode = input<boolean>(false);

  openPalette(event: Event): void {
    const target = event.currentTarget;
    this.commandPaletteService.open(target instanceof HTMLElement ? target : null);
  }

  // The Palette with its canonical names (CONTEXT.md): user-facing controls
  // show the name, never the raw hex
  readonly paletteEntries: readonly { name: string; value: string }[] = NODE_PALETTE.map(
    (value, index) => ({ value, name: NODE_PALETTE_NAMES[index] ?? value }),
  );
  selectedRegularNodes = computed(() =>
    this.graphService.selectedNodes().filter(node => node.kind !== 'group')
  );
  shapeOptions: { shape: NodeShape; label: string }[] = [
    { shape: 'rectangle', label: 'Rectangle' },
    { shape: 'pill', label: 'Pill' },
    { shape: 'diamond', label: 'Diamond' },
    { shape: 'ellipse', label: 'Ellipse' },
  ];
  // The curated Emoji set in picker order (ADR-0030): tooltips and aria
  // labels use the stable names, never the raw glyph.
  readonly emojiEntries = NODE_EMOJIS;

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

  // Null means every selected regular Node lacks an Emoji; undefined means a
  // mixed set (or no regular Node) — nothing highlights.
  sharedNodeEmoji = (): string | null | undefined => {
    const nodes = this.selectedRegularNodes();
    if (nodes.length === 0) return undefined;
    const first = nodes[0].emoji ?? null;
    return nodes.every(n => (n.emoji ?? null) === first) ? first : undefined;
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

  // Live preview on the Connection trigger: the shared pattern's dash and the
  // shared weight's width, falling back to the defaults when nothing shares.
  sharedStrokePreviewDash = (): string | null => {
    const pattern = this.sharedStrokePattern();
    return this.strokePatternOptions.find(o => o.pattern === pattern)?.dash ?? null;
  };

  sharedStrokePreviewWeight = (): number => {
    const weight = this.sharedStrokeWeight();
    return this.strokeWeightOptions.find(o => o.weight === weight)?.previewWidth ?? 2;
  };

  // Live preview on the Connection trigger: the shared color joins the stroke
  // preview; absent or mixed falls back to the default Connection stroke.
  connectionPreviewColor = (): string => this.sharedConnectionColor() ?? 'var(--dn-accent)';

  // Live preview on the Node trigger: the shared Shape's silhouette filled
  // with the shared color; mixed or absent values fall back to the defaults
  // (rectangle silhouette, paper fill), mirroring the stroke preview rule.
  nodePreviewShape = (): NodeShape => this.sharedNodeShape() ?? 'rectangle';
  nodePreviewFill = (): string => this.sharedNodeColor() ?? 'var(--dn-paper)';

  // Align/Distribute menu options (ADR-0028): actions under their section
  // labels, so items carry short names — the label carries the intent.
  alignOptions: { kind: AlignKind; icon: string; label: string }[] = [
    { kind: 'left', icon: 'lucideAlignStartVertical', label: 'Left' },
    { kind: 'center', icon: 'lucideAlignCenterVertical', label: 'Horizontal center' },
    { kind: 'right', icon: 'lucideAlignEndVertical', label: 'Right' },
    { kind: 'top', icon: 'lucideAlignStartHorizontal', label: 'Top' },
    { kind: 'middle', icon: 'lucideAlignCenterHorizontal', label: 'Vertical middle' },
    { kind: 'bottom', icon: 'lucideAlignEndHorizontal', label: 'Bottom' },
  ];

  distributeOptions: { axis: DistributeAxis; icon: string; label: string }[] = [
    { axis: 'horizontal', icon: 'lucideAlignHorizontalSpaceBetween', label: 'Horizontally' },
    { axis: 'vertical', icon: 'lucideAlignVerticalSpaceBetween', label: 'Vertically' },
  ];

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

  setEmoji(emoji: string | null): void {
    const cmd = buildSetNodesEmojiCommand(
      this.graphService, this.graphService.selectedNodeIds(), emoji,
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
