import {
  Component,
  ChangeDetectionStrategy,
  ElementRef,
  HostListener,
  effect,
  inject,
  signal,
  computed,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucidePencil,
  lucideScissors,
  lucideCopy,
  lucideCopyPlus,
  lucideTrash2,
  lucideEllipsis,
  lucideSquarePlus,
  lucideMoveDiagonal2,
  lucideMessageCircle,
  lucideClipboardPaste,
  lucideImageDown,
  lucideMapPin,
  lucideAlignStartVertical,
  lucideCheck,
  lucideX,
  lucideMinus,
  lucideArrowRight,
  lucidePlay,
} from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import {
  HlmDropdownMenu,
  HlmDropdownMenuTrigger,
  HlmDropdownMenuItem,
  HlmDropdownMenuLabel,
  HlmDropdownMenuSeparator,
} from '@spartan-ng/helm/dropdown-menu';
import {
  buildSetNodesColorCommand,
  buildResetCustomPaletteUsesCommand,
  buildSetNodesShapeCommand,
  buildSetNodesEmojiCommand,
  buildSetConnectionsColorCommand,
  buildSetConnectionsArrowheadCommand,
  buildSetConnectionsStrokePatternCommand,
  buildSetConnectionsStrokeWeightCommand,
  buildSetConnectionsRouteStyleCommand,
} from '../../services/commands';
import { DEFAULT_NODE_BACKGROUND, NODE_PALETTE, NODE_PALETTE_NAMES, MAX_CUSTOM_PALETTE_COLORS, isCustomPaletteHex } from '../../models/node';
import { NODE_EMOJIS } from '../../models/node-emoji';
import { NodeShape, effectiveNodeShape } from '../../models/node-shape';
import { ArrowheadType, ArrowheadEnd, effectiveArrowhead, StrokePattern, StrokeWeight, effectiveStrokePattern, effectiveStrokeWeight, RouteStyle, effectiveRouteStyle } from '../../models/connection';
import { AlignPopoverComponent } from '../align-popover/align-popover';
import { GraphService } from '../../services/graph.service';
import { HistoryService } from '../../services/history.service';
import { ContextMenuService } from '../../services/context-menu.service';
import { ClipboardService } from '../../services/clipboard.service';
import { ExportDialogService } from '../../services/export-dialog.service';
import { ResizeModeService } from '../../services/resize-mode.service';
import { CanvasLockService } from '../../services/canvas-lock.service';
import { PresentationService } from '../../services/presentation.service';
import { ChainHighlightService } from '../../services/chain-highlight.service';
import { CreateNodeCommand, CreateTextBlockCommand } from '../../services/commands';

/** Which mirror the toolbar shows: one per Selection shape. */
type ToolbarKind = 'single-node' | 'single-group' | 'single-connection' | 'multi' | 'pin';

export interface ToolbarAnchor {
  x: number;
  y: number;
  flipped: boolean;
}

// Gap between the Selection and the toolbar; flip margin and toolbar height
// estimate for the above/below decision (single row, measured heights vary).
const ANCHOR_GAP = 10;
const FLIP_MARGIN = 8;
const TOOLBAR_HEIGHT_ESTIMATE = 60;

/**
 * Pure anchor math: Selection bounds top-center in canvas coords to a fixed
 * Viewport point — centered above with a gap and clamped inside the
 * Viewport. Top is the default; the toolbar drops below only when the top
 * cannot fit it, choosing the side with more free area when neither fits.
 * Tested through the component spec.
 */
export function anchorToolbar(
  bounds: { x: number; y: number; width: number; height: number },
  viewport: { panX: number; panY: number; zoom: number },
  container: { left: number; top: number },
  windowSize: { width: number; height: number },
): ToolbarAnchor {
  const centerCanvasX = bounds.x + bounds.width / 2;
  const clientX = container.left + centerCanvasX * viewport.zoom + viewport.panX;
  const topClientY = container.top + bounds.y * viewport.zoom + viewport.panY;
  const bottomClientY = container.top + (bounds.y + bounds.height) * viewport.zoom + viewport.panY;
  const x = Math.min(Math.max(clientX, FLIP_MARGIN), windowSize.width - FLIP_MARGIN);
  const aboveY = topClientY - ANCHOR_GAP;
  const belowY = bottomClientY + ANCHOR_GAP;
  if (aboveY - TOOLBAR_HEIGHT_ESTIMATE >= FLIP_MARGIN) {
    return { x, y: aboveY, flipped: false };
  }
  if (belowY + TOOLBAR_HEIGHT_ESTIMATE <= windowSize.height - FLIP_MARGIN) {
    return { x, y: belowY, flipped: true };
  }
  // Neither side fits: take the side with more free area, top on a tie.
  const spaceAbove = topClientY;
  const spaceBelow = windowSize.height - bottomClientY;
  if (spaceBelow > spaceAbove) {
    return { x, y: belowY, flipped: true };
  }
  return { x, y: aboveY, flipped: false };
}

/**
 * The Selection Toolbar: the near-Selection mirror of the Context Menu
 * actions for the current Selection — same Commands, same undo behavior,
 * only the surface is new. Dismisses with the Selection; read-only like
 * the Outline, never a second Selection model.
 *
 * Primary actions sit inline; point-anchored adds (Add node, Add text
 * block, Add pin, Paste), Resize mode, and Export as PNG live behind the
 * More trigger — one row, never two. Point-dependent actions anchor to the
 * Selection bounds center (a Group's center for child adds), since the
 * toolbar has no right-click point.
 */
@Component({
  selector: 'app-selection-toolbar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIcon, HlmButton, HlmDropdownMenu, HlmDropdownMenuTrigger, HlmDropdownMenuItem, HlmDropdownMenuLabel, HlmDropdownMenuSeparator, AlignPopoverComponent],
  host: {
    '[style.left.px]': 'position().x',
    '[style.top.px]': 'position().y',
    '[class.flipped]': 'position().flipped',
  },
  providers: [
    provideIcons({
      lucidePencil,
      lucideScissors,
      lucideCopy,
      lucideCopyPlus,
      lucideTrash2,
      lucideEllipsis,
      lucideSquarePlus,
      lucideMoveDiagonal2,
      lucideMessageCircle,
      lucideClipboardPaste,
      lucideImageDown,
      lucideMapPin,
      lucideAlignStartVertical,
      lucideCheck,
      lucideX,
      lucideMinus,
      lucideArrowRight,
      lucidePlay,
    }),
  ],
  template: `
    @if (visible()) {
      <div class="toolbar-stack" (keydown)="onToolbarKeydown($event)">
        @if (alignOpen()) {
          <app-align-popover />
        }
        <div class="selection-toolbar" role="toolbar" aria-label="Selection toolbar">
          @if (kind() === 'single-node') {
            <button hlmBtn variant="ghost" size="icon" (click)="editText()" title="Edit text" aria-label="Edit text">
              <ng-icon name="lucidePencil" />
            </button>
          }
          @if (kind() === 'single-group') {
            <button hlmBtn variant="ghost" size="icon" (click)="rename()" title="Rename" aria-label="Rename">
              <ng-icon name="lucidePencil" />
            </button>
          }
          @if (kind() === 'single-connection') {
            <button hlmBtn variant="ghost" size="icon" (click)="editText()" title="Edit text" aria-label="Edit text">
              <ng-icon name="lucidePencil" />
            </button>
            <button hlmBtn variant="ghost" size="icon" (click)="addReroutePoint()" title="Add Reroute Point" aria-label="Add Reroute Point">
              <ng-icon name="lucideMapPin" />
            </button>
          }
          @if (graph.selectedNodes().length > 0) {
            <!-- Node styling: one trigger previewing the shared color and Shape
                 (ADR-0028); the details live in the dropdown so a Node selection
                 reads as one decision instead of thirteen buttons. -->
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
          @if (graph.selectedConnections().length > 0) {
            <!-- Connection styling: one trigger previewing the shared color,
                 pattern, and weight; the details live in the dropdown so a
                 Connection selection reads as one decision instead of twenty-two
                 buttons (ADR-0028). -->
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
          @if (hasNodeActions()) {
            <button hlmBtn variant="ghost" size="icon" (click)="cut()" title="Cut (Ctrl+X)" aria-label="Cut">
              <ng-icon name="lucideScissors" />
            </button>
            <button hlmBtn variant="ghost" size="icon" (click)="copy()" title="Copy (Ctrl+C)" aria-label="Copy">
              <ng-icon name="lucideCopy" />
            </button>
            <button hlmBtn variant="ghost" size="icon" (click)="duplicate()" title="Duplicate (Ctrl+D)" aria-label="Duplicate">
              <ng-icon name="lucideCopyPlus" />
            </button>
          }
          @if (hasNodeActions()) {
            <button
              hlmBtn variant="ghost" size="icon"
              (click)="toggleMore()"
              [attr.aria-expanded]="moreOpen()"
              title="More options" aria-label="More options"
            >
              <ng-icon name="lucideEllipsis" />
            </button>
          }
          @if (kind() === 'multi' && canAlign()) {
            <button
              hlmBtn variant="ghost" size="icon"
              (click)="toggleAlign()"
              [attr.aria-expanded]="alignOpen()"
              title="Align and distribute" aria-label="Align"
            >
              <ng-icon name="lucideAlignStartVertical" />
            </button>
          }
          @if (kind() === 'pin') {
            <button hlmBtn variant="ghost" size="icon" (click)="editPin()" title="Edit pin" aria-label="Edit pin">
              <ng-icon name="lucideMessageCircle" />
            </button>
            <button hlmBtn variant="ghost" size="icon" (click)="deletePin()" title="Delete pin" aria-label="Delete pin">
              <ng-icon name="lucideTrash2" />
            </button>
          }
          @if (hasNodeActions() || kind() === 'single-connection') {
            <button hlmBtn variant="ghost" size="icon" (click)="remove()" title="Delete" aria-label="Delete">
              <ng-icon name="lucideTrash2" />
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
            <!-- Custom Palette (ADR-0037): Project hues beside the curated row —
                 same apply rules, per-hue delete, inline add. -->
            <div hlmDropdownMenuLabel>Custom</div>
            @for (entry of customPaletteEntries(); track entry.value) {
              <div class="flex items-center gap-1 px-1">
                <button hlmDropdownMenuItem class="grow" (triggered)="setColor(entry.value)" [attr.aria-label]="'Apply custom hue ' + entry.value">
                  <span class="menu-swatch" [style.background]="entry.value" aria-hidden="true"></span>
                  <span>{{ entry.name }}</span>
                  @if (sharedNodeColor() === entry.value) {
                    <ng-icon name="lucideCheck" class="ml-auto" />
                  }
                </button>
                <button
                  hlmBtn
                  variant="ghost"
                  size="icon"
                  (click)="removeCustom(entry.value); $event.stopPropagation()"
                  [title]="'Remove custom hue ' + entry.value"
                  [attr.aria-label]="'Remove custom hue ' + entry.value"
                  [disabled]="lock.locked()"
                >
                  <ng-icon name="lucideX" />
                </button>
              </div>
            }
            <div class="flex items-center gap-1 px-2 py-1" (click)="$event.stopPropagation()" (keydown)="$event.stopPropagation()">
              <input
                type="color"
                [value]="customPickerValue()"
                (input)="customDraft.set($any($event.target).value)"
                aria-label="Pick a custom hue"
                [disabled]="lock.locked()"
              />
              <input
                type="text"
                [value]="customDraft()"
                (input)="customDraft.set($any($event.target).value)"
                placeholder="#RRGGBB"
                aria-label="New custom hue hex"
                [disabled]="lock.locked()"
              />
              <button
                hlmBtn
                variant="outline"
                size="sm"
                (click)="addCustomFromInput()"
                aria-label="Add custom hue"
                [disabled]="customPaletteFull() || lock.locked()"
              >
                Add
              </button>
            </div>
            @if (customError() !== null) {
              <div class="px-2 pb-1 text-xs" role="alert">{{ customError() }}</div>
            }
            @if (customPaletteFull()) {
              <div class="px-2 pb-1 text-xs">Custom palette full (16 hues).</div>
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
            <!-- Custom Palette (ADR-0037): same Project hues as the Node menu. -->
            <div hlmDropdownMenuLabel>Custom</div>
            @for (entry of customPaletteEntries(); track entry.value) {
              <div class="flex items-center gap-1 px-1">
                <button hlmDropdownMenuItem class="grow" (triggered)="setConnectionColor(entry.value)" [attr.aria-label]="'Apply custom hue ' + entry.value">
                  <span class="menu-swatch" [style.background]="entry.value" aria-hidden="true"></span>
                  <span>{{ entry.name }}</span>
                  @if (sharedConnectionColor() === entry.value) {
                    <ng-icon name="lucideCheck" class="ml-auto" />
                  }
                </button>
                <button
                  hlmBtn
                  variant="ghost"
                  size="icon"
                  (click)="removeCustom(entry.value); $event.stopPropagation()"
                  [title]="'Remove custom hue ' + entry.value"
                  [attr.aria-label]="'Remove custom hue ' + entry.value"
                  [disabled]="lock.locked()"
                >
                  <ng-icon name="lucideX" />
                </button>
              </div>
            }
            <div class="flex items-center gap-1 px-2 py-1" (click)="$event.stopPropagation()" (keydown)="$event.stopPropagation()">
              <input
                type="color"
                [value]="customPickerValue()"
                (input)="customDraft.set($any($event.target).value)"
                aria-label="Pick a custom hue"
                [disabled]="lock.locked()"
              />
              <input
                type="text"
                [value]="customDraft()"
                (input)="customDraft.set($any($event.target).value)"
                placeholder="#RRGGBB"
                aria-label="New custom hue hex"
                [disabled]="lock.locked()"
              />
              <button
                hlmBtn
                variant="outline"
                size="sm"
                (click)="addCustomFromInput()"
                aria-label="Add custom hue"
                [disabled]="customPaletteFull() || lock.locked()"
              >
                Add
              </button>
            </div>
            @if (customError() !== null) {
              <div class="px-2 pb-1 text-xs" role="alert">{{ customError() }}</div>
            }
            @if (customPaletteFull()) {
              <div class="px-2 pb-1 text-xs">Custom palette full (16 hues).</div>
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
            <hlm-dropdown-menu-separator />
            <div hlmDropdownMenuLabel>Route Style</div>
            @for (opt of routeStyleOptions; track opt.style) {
              <button hlmDropdownMenuItem (triggered)="setRouteStyle(opt.style)">
                <svg viewBox="0 0 20 20" class="size-4" aria-hidden="true">
                  <path [attr.d]="opt.path" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
                <span>{{ opt.label }}</span>
                @if (sharedRouteStyle() === opt.style) {
                  <ng-icon name="lucideCheck" class="ml-auto" />
                }
              </button>
            }
          </div>
        </ng-template>

        @if (moreOpen()) {
          <div hlmDropdownMenu class="w-44" role="menu" aria-label="More selection actions">
            @if (kind() === 'single-group') {
              <button hlmDropdownMenuItem (triggered)="addNode()" title="Add node" aria-label="Add node">
                <ng-icon name="lucideSquarePlus" /><span>Add node</span>
              </button>
              <button hlmDropdownMenuItem (triggered)="addTextBlock()" title="Add text block" aria-label="Add text block">
                <ng-icon name="lucideSquarePlus" /><span>Add text block</span>
              </button>
            }
            @if (kind() === 'single-node' || kind() === 'single-group') {
              <button hlmDropdownMenuItem (triggered)="toggleResize()" [attr.aria-pressed]="resizeMode.mode()" title="Resize mode" aria-label="Resize mode">
                <ng-icon name="lucideMoveDiagonal2" /><span>Resize mode</span>
              </button>
              <button hlmDropdownMenuItem (triggered)="addPin()" title="Add pin" aria-label="Add pin">
                <ng-icon name="lucideMessageCircle" /><span>Add pin</span>
              </button>
            }
            @if (kind() === 'single-group') {
              <button hlmDropdownMenuItem (triggered)="pasteHere()" [disabled]="!canPaste()" title="Paste" aria-label="Paste">
                <ng-icon name="lucideClipboardPaste" /><span>Paste</span>
              </button>
            }
            @if (hasNodeActions()) {
              <button hlmDropdownMenuItem (triggered)="exportPng()" title="Export as PNG" aria-label="Export as PNG">
                <ng-icon name="lucideImageDown" /><span>Export as PNG</span>
              </button>
            }
          </div>
        }
      </div>
    }
  `,
  styles: [`
    :host {
      display: block;
      position: fixed;
      z-index: var(--dn-z-overlay);
      pointer-events: auto;
    }
    .toolbar-stack {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
    }
    /* The toolbar row owns the anchor: it is the only in-flow child, so
       opening the Align or More panels never moves it. */
    .selection-toolbar {
      transform: translate(-50%, -100%);
    }
    :host(.flipped) .selection-toolbar {
      transform: translate(-50%, 0);
    }
    app-align-popover {
      position: absolute;
      left: 50%;
      transform: translateX(-50%);
      bottom: calc(100% + 8px);
    }
    /* More hangs off the toolbar row and never animates: static position
       below the row, left edge aligned, by default; lifted by its own
       height when the toolbar flipped underneath — the side offset flips
       sign with it. Either way it is out of flow, so the toolbar row
       stays fixed. */
    .toolbar-stack > [data-slot='dropdown-menu'] {
      position: absolute;
      left: 0;
      animation: none !important;
      transition: none !important;
      --side-offset: 1 !important;
    }
    :host(.flipped) .toolbar-stack > [data-slot='dropdown-menu'] {
      transform: translateY(-100%);
      --side-offset: -1 !important;
    }
    .selection-toolbar {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 6px 10px;
      max-width: calc(100vw - 32px);
      overflow-x: auto;
      background: var(--card);
      color: var(--card-foreground);
      border: 1px solid var(--border);
      border-radius: 8px;
      box-shadow: var(--dn-shadow-chip);
    }
    .selection-toolbar button:hover {
      color: var(--card-foreground) !important;
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
export class SelectionToolbarComponent {
  readonly graph = inject(GraphService);
  readonly history = inject(HistoryService);
  private readonly menus = inject(ContextMenuService);
  private readonly clipboard = inject(ClipboardService);
  private readonly exportDialog = inject(ExportDialogService);
  readonly resizeMode = inject(ResizeModeService);
  readonly lock = inject(CanvasLockService);
  private readonly presenting = inject(PresentationService);
  private readonly chain = inject(ChainHighlightService);
  private readonly host = inject(ElementRef);

  /** Secondary actions behind the More trigger. */
  readonly moreOpen = signal(false);
  /** The shared Align Popover, anchored above the toolbar like the bar. */
  readonly alignOpen = signal(false);
  /** Bumped on window resize so the anchor re-clamps. */
  private readonly resizeTick = signal(0);

  /** Canvas-coords anchor rect: the Selection bounds, or the Pin point. */
  private readonly anchorRect = computed(() => {
    const bounds = this.graph.selectionBounds();
    if (bounds) return bounds;
    const pinId = this.menus.activePinId();
    if (pinId) {
      const point = this.graph.pinPoint(pinId);
      if (point) return { x: point.x, y: point.y, width: 0, height: 0 };
    }
    return null;
  });

  /** Fixed Viewport point for the host: tracks Selection, pan, and zoom live. */
  readonly position = computed<ToolbarAnchor>(() => {
    this.resizeTick();
    const rect = this.anchorRect();
    const viewport = this.graph.viewportState();
    const container = document.querySelector('.canvas-container')?.getBoundingClientRect();
    if (!rect) return { x: FLIP_MARGIN, y: FLIP_MARGIN, flipped: false };
    return anchorToolbar(
      rect,
      viewport,
      { left: container?.left ?? 0, top: container?.top ?? 0 },
      { width: window.innerWidth, height: window.innerHeight },
    );
  });

  readonly canPaste = this.clipboard.canPaste;
  readonly canAlign = this.menus.canAlign;

  // The Palette with its canonical names (CONTEXT.md): user-facing controls
  // show the name, never the raw hex
  readonly paletteEntries: readonly { name: string; value: string }[] = NODE_PALETTE.map(
    (value, index) => ({ value, name: NODE_PALETTE_NAMES[index] ?? value }),
  );
  // Custom Palette entries (CONTEXT.md: Custom Palette): Project hues read
  // live from Graph State, announced under their own hex — no curated names.
  readonly customPaletteEntries = computed(() =>
    this.graph.customPalette().map(value => ({ value, name: value })),
  );
  readonly customPaletteFull = computed(
    () => this.graph.customPalette().length >= MAX_CUSTOM_PALETTE_COLORS,
  );
  // Draft hue for the inline add form, shared by both styling menus (only
  // one menu is ever open). The native picker needs a valid hex, so it
  // shows the default Node background while the text draft is incomplete.
  readonly customDraft = signal('');
  readonly customError = signal<string | null>(null);
  readonly customPickerValue = computed(() => {
    const draft = this.customDraft().trim();
    return isCustomPaletteHex(draft) ? draft : DEFAULT_NODE_BACKGROUND;
  });

  // Custom Palette membership is plain data (ADR-0037): adding validates
  // the draft and explains failures inline instead of storing them.
  addCustomFromInput(): void {
    const added = this.graph.addCustomPaletteColor(this.customDraft().trim());
    if (added === null) {
      this.customError.set('Enter a #RRGGBB hex not already in the palette (16 max).');
      return;
    }
    this.customDraft.set('');
    this.customError.set(null);
  }

  // Deleting a hue resets its uses to the default appearance as one undo
  // step (ADR-0038); the roster removal itself is permanent, like
  // Collection and Project deletion — undo restores hues, not the entry.
  removeCustom(value: string): void {
    const reset = buildResetCustomPaletteUsesCommand(this.graph, value);
    if (reset) this.history.execute(reset);
    this.graph.removeCustomPaletteColor(value);
  }

  selectedRegularNodes = computed(() =>
    this.graph.selectedNodes().filter(node => node.kind !== 'group')
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

  // Route Style options with inline previews drawn as the route itself: a
  // free curve beside a right-angle orthogonal route (ADR-0031)
  routeStyleOptions: { style: RouteStyle; path: string; label: string }[] = [
    { style: 'curve', path: 'M2 14 C 7 14, 13 6, 18 6', label: 'Curve' },
    { style: 'orthogonal', path: 'M2 14 H11 V6 H18', label: 'Orthogonal' },
  ];

  // A styling control reads as active only when ALL its targets share the
  // value (ADR-0015); undefined means a mixed set — nothing highlights.
  sharedNodeColor = (): string | null | undefined => {
    const nodes = this.graph.selectedNodes();
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
    const conns = this.graph.selectedConnections();
    if (conns.length === 0) return undefined;
    const first = conns[0].color ?? null;
    return conns.every(c => (c.color ?? null) === first) ? first : undefined;
  };

  sharedArrowhead = (end: ArrowheadEnd): ArrowheadType | undefined => {
    const conns = this.graph.selectedConnections();
    if (conns.length === 0) return undefined;
    const first = effectiveArrowhead(conns[0], end);
    return conns.every(c => effectiveArrowhead(c, end) === first) ? first : undefined;
  };

  sharedStrokePattern = (): StrokePattern | undefined => {
    const conns = this.graph.selectedConnections();
    if (conns.length === 0) return undefined;
    const first = effectiveStrokePattern(conns[0]);
    return conns.every(c => effectiveStrokePattern(c) === first) ? first : undefined;
  };

  sharedStrokeWeight = (): StrokeWeight | undefined => {
    const conns = this.graph.selectedConnections();
    if (conns.length === 0) return undefined;
    const first = effectiveStrokeWeight(conns[0]);
    return conns.every(c => effectiveStrokeWeight(c) === first) ? first : undefined;
  };

  sharedRouteStyle = (): RouteStyle | undefined => {
    const conns = this.graph.selectedConnections();
    if (conns.length === 0) return undefined;
    const first = effectiveRouteStyle(conns[0]);
    return conns.every(c => effectiveRouteStyle(c) === first) ? first : undefined;
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

  // Bulk styling (ADR-0015): one compound Command over all selected targets;
  // the factories return null when nothing would change — no dead undo steps.
  setColor(color: string | null): void {
    const cmd = buildSetNodesColorCommand(
      this.graph, this.graph.selectedNodeIds(), color,
    );
    if (cmd) this.history.execute(cmd);
  }

  setShape(shape: NodeShape): void {
    const cmd = buildSetNodesShapeCommand(
      this.graph, this.graph.selectedNodeIds(), shape,
    );
    if (cmd) this.history.execute(cmd);
  }

  setEmoji(emoji: string | null): void {
    const cmd = buildSetNodesEmojiCommand(
      this.graph, this.graph.selectedNodeIds(), emoji,
    );
    if (cmd) this.history.execute(cmd);
  }

  setConnectionColor(color: string | null): void {
    const cmd = buildSetConnectionsColorCommand(
      this.graph, this.graph.selectedConnectionIds(), color,
    );
    if (cmd) this.history.execute(cmd);
  }

  setArrowhead(end: ArrowheadEnd, type: ArrowheadType): void {
    const cmd = buildSetConnectionsArrowheadCommand(
      this.graph, this.graph.selectedConnectionIds(), end, type,
    );
    if (cmd) this.history.execute(cmd);
  }

  setStrokePattern(pattern: StrokePattern): void {
    const cmd = buildSetConnectionsStrokePatternCommand(
      this.graph, this.graph.selectedConnectionIds(), pattern,
    );
    if (cmd) this.history.execute(cmd);
  }

  setStrokeWeight(weight: StrokeWeight): void {
    const cmd = buildSetConnectionsStrokeWeightCommand(
      this.graph, this.graph.selectedConnectionIds(), weight,
    );
    if (cmd) this.history.execute(cmd);
  }

  setRouteStyle(style: RouteStyle): void {
    const cmd = buildSetConnectionsRouteStyleCommand(
      this.graph, this.graph.selectedConnectionIds(), style,
    );
    if (cmd) this.history.execute(cmd);
  }

  /** The single selected Node, when the Selection is exactly one Node. */
  private readonly singleNode = computed(() => {
    const node = this.graph.selectedNode();
    return node;
  });

  /** Kinds with Node clipboard actions and the More trigger. */
  readonly hasNodeActions = computed(() => {
    const kind = this.kind();
    return kind === 'single-node' || kind === 'single-group' || kind === 'multi';
  });

  readonly kind = computed<ToolbarKind | null>(() => {
    if (this.graph.selectionSize() > 1) return 'multi';
    const node = this.singleNode();
    if (node) return node.kind === 'group' ? 'single-group' : 'single-node';
    if (this.graph.selectedConnectionId()) return 'single-connection';
    if (this.menus.activePinId() && this.graph.selectionSize() === 0) return 'pin';
    return null;
  });

  /** Dead under Canvas Lock and in Present Mode, like the Context Menu. */
  private readonly chromeLive = computed(() => !this.lock.locked() && !this.presenting.active());

  /**
   * Shown for any non-empty Selection (plus the Pin case); hidden while a
   * Text or Label edit session runs — the Formatting Toolbar owns it, and
   * the toolbar re-anchors when the session commits. Positioned separately.
   */
  readonly visible = computed(
    () => this.kind() !== null && this.chromeLive() && !this.chain.textEditingActive(),
  );

  constructor() {
    // Both panels belong to the Selection that opened them: any membership
    // change (not just size) retires them.
    effect(() => {
      this.graph.selectedNodeIds();
      this.graph.selectedConnectionIds();
      this.moreOpen.set(false);
      this.alignOpen.set(false);
    });
  }

  toggleMore(): void {
    this.moreOpen.update(open => !open);
  }

  toggleAlign(): void {
    if (!this.canAlign()) return;
    this.alignOpen.update(open => !open);
  }

  editText(): void {
    const connId = this.graph.selectedConnectionId();
    if (connId) {
      this.menus.requestConnectionText(connId);
      return;
    }
    const node = this.singleNode();
    if (node) this.menus.requestEditText(node.id);
  }

  addReroutePoint(): void {
    const connId = this.graph.selectedConnectionId();
    if (connId) this.menus.addReroutePointToConnection(connId);
  }

  rename(): void {
    const node = this.singleNode();
    if (node) this.menus.requestRename(node.id);
  }

  toggleResize(): void {
    this.resizeMode.toggle();
  }

  addPin(): void {
    const node = this.singleNode();
    if (!node) return;
    this.moreOpen.set(false);
    this.menus.requestCreatePin({
      kind: 'node', nodeId: node.id,
      offsetX: node.width / 2, offsetY: node.height / 2,
    });
  }

  addNode(): void {
    this.addChildToGroup('node');
  }

  addTextBlock(): void {
    this.addChildToGroup('text-block');
  }

  /** Spawn a child at the Group's center — the toolbar has no click point. */
  private addChildToGroup(child: 'node' | 'text-block'): void {
    const node = this.singleNode();
    if (!node || node.kind !== 'group') return;
    this.moreOpen.set(false);
    const x = node.x + node.width / 2 - 80;
    const y = node.y + node.height / 2 - 24;
    this.history.execute(
      child === 'node'
        ? new CreateNodeCommand(this.graph, 'New Node', x, y, node.id)
        : new CreateTextBlockCommand(this.graph, 'New Text Block', x, y, node.id),
    );
  }

  pasteHere(): void {
    const node = this.singleNode();
    if (!node || node.kind !== 'group' || !this.canPaste()) return;
    this.moreOpen.set(false);
    this.clipboard.pasteAt(node.x + node.width / 2, node.y + node.height / 2, node.id);
  }

  exportPng(): void {
    this.moreOpen.set(false);
    const rootIds = [...this.graph.selectedNodeIds()];
    if (rootIds.length === 0) return;
    this.exportDialog.requestOpen(undefined, {
      rootIds, isMultiSelection: this.kind() === 'multi',
    });
  }

  cut(): void {
    this.menus.cutSelection();
  }

  editPin(): void {
    // Consumes the Pin context like the menu closing on action: the toolbar
    // dismisses and stays hidden for the edit session.
    this.menus.editPin();
    this.menus.clear();
  }

  deletePin(): void {
    this.menus.deletePin();
    this.menus.clear();
  }

  copy(): void {
    this.menus.copySelection();
  }

  duplicate(): void {
    this.menus.duplicateSelection();
  }

  remove(): void {
    this.menus.deleteSelection();
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    this.resizeTick.update(n => n + 1);
  }

  /**
   * Roving focus inside the toolbar row: arrows move between enabled buttons
   * (wrapping), Home and End jump. Stopped so global Canvas arrow gestures
   * never fire while the toolbar owns focus. Tab order stays native.
   * Events from the More dropdown menu are left to the CDK menu, which owns
   * arrow navigation there.
   */
  onToolbarKeydown(event: KeyboardEvent): void {
    if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    if ((event.target as HTMLElement | null)?.closest?.('[data-slot="dropdown-menu"]')) return;
    const buttons = Array.from(
      (this.host.nativeElement as HTMLElement).querySelectorAll('button:not([disabled])'),
    ) as HTMLButtonElement[];
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (current === -1 || buttons.length === 0) return;
    event.preventDefault();
    event.stopPropagation();
    let next = current;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (current + 1) % buttons.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (current - 1 + buttons.length) % buttons.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = buttons.length - 1;
    buttons[next]?.focus();
  }

  @HostListener('document:keydown', ['$event'])
  onDocumentKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    this.moreOpen.set(false);
    this.alignOpen.set(false);
  }

  @HostListener('document:mousedown', ['$event'])
  onDocumentMousedown(event: MouseEvent): void {
    if (!this.moreOpen() && !this.alignOpen()) return;
    const root = this.host.nativeElement as HTMLElement;
    const target = event.target as Node | null;
    if (target && !root.contains(target)) {
      this.moreOpen.set(false);
      this.alignOpen.set(false);
    }
  }
}
