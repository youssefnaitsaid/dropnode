import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import {
  ARROWHEAD_TYPES,
  ArrowheadEnd,
  ArrowheadType,
  MAX_REROUTE_POINTS,
  ROUTE_STYLES,
  RouteStyle,
  STROKE_PATTERNS,
  STROKE_WEIGHTS,
  StrokePattern,
  StrokeWeight,
} from '../models/connection';
import { AlignKind, DistributeAxis } from '../models/align-distribute';
import { DEFAULT_NODE_BACKGROUND, NODE_PALETTE, NODE_PALETTE_NAMES } from '../models/node';
import { NODE_SHAPES, NodeShape } from '../models/node-shape';
import { NODE_EMOJIS } from '../models/node-emoji';
import {
  PaletteCategory,
  PaletteEntry,
  searchPaletteEntries,
} from '../models/palette';
import {
  CreateGroupCommand,
  CreateNodeCommand,
  DeleteConnectionCommand,
  DeleteNodeCompoundCommand,
  buildAlignSelectionCommand,
  buildDeleteSelectionCommand,
  buildDistributeSelectionCommand,
  buildSetConnectionsArrowheadCommand,
  buildSetConnectionsColorCommand,
  buildSetConnectionsStrokePatternCommand,
  buildSetConnectionsStrokeWeightCommand,
  buildSetConnectionsRouteStyleCommand,
  buildSetNodesColorCommand,
  buildSetNodesShapeCommand,
  buildSetNodesEmojiCommand,
  buildTidyUpCommand,
} from './commands';
import { ClipboardService } from './clipboard.service';
import { CollectionService } from './collection.service';
import { CommandPaletteService } from './command-palette.service';
import { ContextMenuService } from './context-menu.service';
import { CanvasViewportService } from './canvas-viewport.service';
import { ExportDialogService } from './export-dialog.service';
import { ExportService } from './export.service';
import { GraphService } from './graph.service';
import { HistoryService } from './history.service';
import { MinimapService } from './minimap.service';
import { PinVisibilityService } from './pin-visibility.service';
import { ImportDialogService } from './import-dialog.service';
import { ConnectDialogService } from './connect-dialog.service';
import { PresentationService } from './presentation.service';
import { SidebarService } from './sidebar.service';
import { ResizeModeService } from './resize-mode.service';

// Names come from the model (NODE_PALETTE_NAMES) so every user-facing
// surface — swatch tooltips, Palette Entry labels — says the same thing.
const PALETTE_COLORS: readonly { name: string; value: string }[] = NODE_PALETTE.map(
  (value, index) => ({ value, name: NODE_PALETTE_NAMES[index] ?? value }),
);

const ALIGNMENTS: readonly { kind: AlignKind; label: string }[] = [
  { kind: 'left', label: 'Align selected Nodes left' },
  { kind: 'center', label: 'Align selected Nodes horizontal center' },
  { kind: 'right', label: 'Align selected Nodes right' },
  { kind: 'top', label: 'Align selected Nodes top' },
  { kind: 'middle', label: 'Align selected Nodes vertical middle' },
  { kind: 'bottom', label: 'Align selected Nodes bottom' },
];

const DISTRIBUTIONS: readonly { axis: DistributeAxis; label: string }[] = [
  { axis: 'horizontal', label: 'Distribute selected Nodes horizontally' },
  { axis: 'vertical', label: 'Distribute selected Nodes vertically' },
];

const SHORTCUTS = {
  undo: 'Ctrl+Z',
  redo: 'Ctrl+Shift+Z',
  selectAll: 'Ctrl+A',
  cut: 'Ctrl+X',
  copy: 'Ctrl+C',
  paste: 'Ctrl+V',
  duplicate: 'Ctrl+D',
  toggleSidebar: 'Ctrl+B',
  zoomToFit: 'Shift+1',
  zoomToSelection: 'Shift+2',
} as const;

// Leading glyphs reuse the Context Menu / toolbar vocabulary for the same
// intent so the same operation reads the same everywhere.
const SHAPE_ICONS: Record<NodeShape, string> = {
  rectangle: 'lucideSquare',
  pill: 'lucidePill',
  diamond: 'lucideDiamond',
  ellipse: 'lucideCircle',
};

const ALIGN_ICONS: Record<AlignKind, string> = {
  left: 'lucideAlignStartVertical',
  center: 'lucideAlignCenterVertical',
  right: 'lucideAlignEndVertical',
  top: 'lucideAlignStartHorizontal',
  middle: 'lucideAlignCenterHorizontal',
  bottom: 'lucideAlignEndHorizontal',
};

const ARROWHEAD_ICONS: Record<ArrowheadType, string> = {
  none: 'lucideMinus',
  arrow: 'lucideArrowRight',
  triangle: 'lucidePlay',
};

// Mirrors the toolbar's segmented previews so both show the stroke itself.
const PATTERN_PREVIEWS: Record<StrokePattern, { dash?: string; width?: number }> = {
  solid: {},
  dashed: { dash: '6 4' },
  dotted: { dash: '0.1 4' },
};

const WEIGHT_PREVIEWS: Record<StrokeWeight, { dash?: string; width?: number }> = {
  thin: { width: 1 },
  normal: { width: 2 },
  thick: { width: 3.5 },
};

// Connections category display order: Reset (0), colors (1), patterns (2),
// weights (3–5), then Arrowheads (start group before end), then Route Styles
// (12–13). Patterns and colors share one step; the label tiebreak orders them
// alphabetically.
const CONNECTION_WEIGHT_ORDER: Record<StrokeWeight, number> = {
  thin: 3,
  normal: 4,
  thick: 5,
};

const ROUTE_STYLE_ICONS: Record<RouteStyle, string> = {
  curve: 'lucideSpline',
  orthogonal: 'lucideRoute',
};

const ROUTE_STYLE_ORDER: Record<RouteStyle, number> = {
  curve: 12,
  orthogonal: 13,
};

type EntryOptions = {
  aliases?: readonly string[];
  shortcut?: string;
  swatch?: string;
  icon?: string;
  emoji?: string;
  linePreview?: { dash?: string; width?: number };
  sortOrder?: number;
};

/**
 * The shared user-intent catalog. Adapters such as the toolbar and global
 * shortcut directive call the same underlying services and Command factories.
 */
@Injectable({ providedIn: 'root' })
export class PaletteEntryRegistry {
  private readonly graphService = inject(GraphService);
  private readonly historyService = inject(HistoryService);
  private readonly clipboardService = inject(ClipboardService);
  private readonly contextMenuService = inject(ContextMenuService);
  private readonly canvasViewport = inject(CanvasViewportService);
  private readonly collectionService = inject(CollectionService);
  private readonly importDialogService = inject(ImportDialogService);
  private readonly exportDialogService = inject(ExportDialogService);
  private readonly connectDialogService = inject(ConnectDialogService);
  private readonly exportService = inject(ExportService);
  private readonly presentationService = inject(PresentationService);
  private readonly sidebarService = inject(SidebarService);
  private readonly minimapService = inject(MinimapService);
  private readonly pinVisibilityService = inject(PinVisibilityService);
  private readonly resizeMode = inject(ResizeModeService);
  private readonly paletteService = inject(CommandPaletteService);
  private readonly router = inject(Router);

  entries(): PaletteEntry[] {
    const selectedNodeIds = this.graphService.selectedNodeIds();
    const selectedConnectionIds = this.graphService.selectedConnectionIds();
    const nodes = this.graphService.nodes();
    const selectedRegularNodeIds = selectedNodeIds.filter(id =>
      nodes.some(node => node.id === id && node.kind !== 'group'),
    );
    const selectionSize = this.graphService.selectionSize();
    const currentProjectId = this.currentProjectId();
    const currentProject = currentProjectId
      ? this.collectionService.projects().find(project => project.id === currentProjectId)
      : undefined;
    const isScratch = !currentProjectId;
    const oneSelectedNode = selectedNodeIds.length === 1
      ? nodes.find(node => node.id === selectedNodeIds[0])
      : undefined;
    const selectedConnection = selectedConnectionIds.length === 1
      ? this.graphService.connections().find(conn => conn.id === selectedConnectionIds[0])
      : undefined;
    // A single selected Connection can take a new Reroute Point unless it is
    // already at the 32-point ceiling (the mouse add's silent guard)
    const canAddReroutePoint = !!selectedConnection &&
      (selectedConnection.reroutePoints?.length ?? 0) < MAX_REROUTE_POINTS;

    return [
      this.action('undo', 'Undo', 'History', () => this.historyService.undo(), {
        aliases: ['reverse', 'step back'], shortcut: SHORTCUTS.undo, icon: 'lucideUndo2',
        available: this.historyService.canUndo(), unavailableReason: 'Nothing to undo',
      }),
      this.action('redo', 'Redo', 'History', () => this.historyService.redo(), {
        aliases: ['repeat', 'step forward'], shortcut: SHORTCUTS.redo, icon: 'lucideRedo2',
        available: this.historyService.canRedo(), unavailableReason: 'Nothing to redo',
      }),

      this.action('select-all', 'Select All', 'Selection', () => this.graphService.selectAll(), {
        aliases: ['select everything'], shortcut: SHORTCUTS.selectAll, icon: 'lucideSquareCheckBig',
      }),
      this.action('clear-selection', 'Clear Selection', 'Selection', () => this.graphService.clearSelection(), {
        aliases: ['deselect', 'clear selected'], icon: 'lucideSquareX',
        available: selectionSize > 0, unavailableReason: 'Nothing is selected',
      }),
      this.action(
        'resize-mode',
        this.resizeMode.mode() ? 'Exit Resize Mode' : 'Resize Mode',
        'Selection',
        () => this.resizeMode.toggle(),
        {
          aliases: ['resize', 'resize node', 'arrow resize'], icon: 'lucideMoveDiagonal2',
          available: selectedNodeIds.length === 1,
          unavailableReason: 'Select one Node first',
        },
      ),
      this.action('cut', 'Cut', 'Selection', () => this.clipboardService.cut(selectedNodeIds, selectedConnectionIds), {
        aliases: ['remove to clipboard'], shortcut: SHORTCUTS.cut, icon: 'lucideScissors',
        available: selectedNodeIds.length > 0, unavailableReason: 'Select a Node or Group first',
      }),
      this.action('copy', 'Copy', 'Selection', () => this.clipboardService.copy(selectedNodeIds), {
        aliases: ['copy selected'], shortcut: SHORTCUTS.copy, icon: 'lucideCopy',
        available: selectedNodeIds.length > 0, unavailableReason: 'Select a Node or Group first',
      }),
      this.action('paste', 'Paste', 'Selection', () => {
        this.clipboardService.pasteAtCursor(this.canvasViewport.visibleCanvasCenter());
      }, {
        aliases: ['insert', 'paste from clipboard'], shortcut: SHORTCUTS.paste, icon: 'lucideClipboardPaste',
        available: this.clipboardService.canPaste(), unavailableReason: 'Clipboard is empty',
      }),
      this.action('duplicate', 'Duplicate', 'Selection', () => this.clipboardService.duplicate(selectedNodeIds), {
        aliases: ['clone', 'make a copy'], shortcut: SHORTCUTS.duplicate, icon: 'lucideCopyPlus',
        available: selectedNodeIds.length > 0, unavailableReason: 'Select a Node or Group first',
      }),
      this.action('delete', 'Delete', 'Selection', () => this.deleteSelection(), {
        aliases: ['remove', 'trash'], icon: 'lucideTrash2',
        available: selectionSize > 0, unavailableReason: 'Nothing is selected',
      }),
      ...ALIGNMENTS.map(({ kind, label }) => this.action(
        `align-${kind}`, label, 'Selection', () => {
          const command = buildAlignSelectionCommand(this.graphService, this.graphService.selectedNodeIds(), kind);
          if (command) this.historyService.execute(command);
        }, {
          aliases: ['align', `align ${kind}`],
          icon: ALIGN_ICONS[kind],
          available: selectedNodeIds.length >= 2,
          unavailableReason: 'Select at least two Nodes or Groups',
        },
      )),
      ...DISTRIBUTIONS.map(({ axis, label }) => this.action(
        `distribute-${axis}`, label, 'Selection', () => {
          const command = buildDistributeSelectionCommand(this.graphService, this.graphService.selectedNodeIds(), axis);
          if (command) this.historyService.execute(command);
        }, {
          aliases: ['distribute', `distribute ${axis}`],
          icon: axis === 'horizontal' ? 'lucideAlignHorizontalSpaceBetween' : 'lucideAlignVerticalSpaceBetween',
          available: selectedNodeIds.length >= 3,
          unavailableReason: 'Select at least three Nodes or Groups',
        },
      )),

      this.action('add-node', 'Add Node', 'Nodes & Groups', () => this.addNode(), {
        aliases: ['new node', 'create node'], icon: 'lucideSquarePlus',
      }),
      this.action('add-group', 'Add Group', 'Nodes & Groups', () => this.addGroup(), {
        aliases: ['new group', 'create group'], icon: 'lucideGroup',
      }),
      this.action('add-pin', 'Add pin', 'Nodes & Groups', () => this.addPin(), {
        // "Comment" is a hidden alias: the Figma lineage word users will type
        aliases: ['new pin', 'create pin', 'comment', 'add comment'], icon: 'lucideMessageCircle',
      }),
      this.action('connect-nodes', 'Connect Nodes…', 'Nodes & Groups', () => this.connectDialogService.requestOpen(), {
        aliases: ['connect', 'link nodes', 'add connection', 'connect two nodes'], icon: 'lucideLink',
        available: this.graphService.nodes().length >= 2,
        unavailableReason: 'Add at least two Nodes first',
      }),
      this.action('edit-text', 'Edit Text', 'Nodes & Groups', () => this.editText(), {
        aliases: ['edit label', 'rename text'], icon: 'lucidePencil',
        available: selectionSize === 1 &&
          ((!!oneSelectedNode && oneSelectedNode.kind !== 'group') || selectedConnectionIds.length === 1),
        unavailableReason: 'Select one Node or Connection',
      }),
      this.action('rename-group', 'Rename', 'Nodes & Groups', () => {
        if (oneSelectedNode?.kind === 'group') this.contextMenuService.requestRename(oneSelectedNode.id);
      }, {
        aliases: ['rename group', 'edit group label'], icon: 'lucidePencil',
        available: oneSelectedNode?.kind === 'group' && selectionSize === 1,
        unavailableReason: 'Select one Group',
      }),
      ...this.nodeColorEntries(selectedNodeIds),
      ...this.nodeShapeEntries(selectedRegularNodeIds),
      ...this.nodeEmojiEntries(selectedRegularNodeIds),

      this.action('add-reroute-point', 'Add Reroute Point', 'Connections', () => {
        const connectionId = this.graphService.selectedConnectionId();
        if (connectionId) this.contextMenuService.addReroutePointToConnection(connectionId);
      }, {
        aliases: ['reroute', 'add bend point', 'add route point'],
        icon: 'lucideMapPin',
        sortOrder: -1,
        available: canAddReroutePoint,
        unavailableReason: canAddReroutePoint
          ? undefined
          : selectedConnection ? 'Reroute Point limit reached' : 'Select a Connection first',
      }),

      ...this.connectionColorEntries(selectedConnectionIds),
      ...this.connectionArrowheadEntries(selectedConnectionIds),
      ...this.connectionStrokeEntries(selectedConnectionIds),
      ...this.connectionRouteStyleEntries(selectedConnectionIds),

      this.action('zoom-in', 'Zoom In', 'Viewport', () => this.canvasViewport.zoomByCentered(0.1), {
        aliases: ['magnify', 'increase zoom'], icon: 'lucideZoomIn',
      }),
      this.action('zoom-out', 'Zoom Out', 'Viewport', () => this.canvasViewport.zoomByCentered(-0.1), {
        aliases: ['shrink', 'decrease zoom'], icon: 'lucideZoomOut',
      }),
      this.action('zoom-to-fit', 'Zoom to Fit', 'Viewport', () => {
        const size = this.canvasViewport.visibleSize();
        this.graphService.zoomToFit(size.width, size.height);
      }, { aliases: ['frame canvas', 'fit graph'], shortcut: SHORTCUTS.zoomToFit, icon: 'lucideMaximize' }),
      this.action('zoom-to-selection', 'Zoom to Selection', 'Viewport', () => {
        const size = this.canvasViewport.visibleSize();
        this.graphService.zoomToSelection(size.width, size.height);
      }, {
        aliases: ['frame selection', 'fit selection'], shortcut: SHORTCUTS.zoomToSelection, icon: 'lucideFocus',
        available: selectionSize > 0, unavailableReason: 'Nothing is selected',
      }),
      this.action('tidy-up', 'Tidy up', 'Viewport', () => {
        const command = buildTidyUpCommand(this.graphService);
        if (!command) return;
        this.historyService.execute(command);
        const size = this.canvasViewport.visibleSize();
        this.graphService.zoomToFit(size.width, size.height);
      }, { aliases: ['auto layout', 'organize graph'], icon: 'lucideNetwork' }),
      this.action('present', 'Present', 'Viewport', () => {
        const size = this.canvasViewport.visibleSize();
        this.presentationService.enter(size.width, size.height);
      }, {
        aliases: ['presentation mode', 'start tour'], icon: 'lucidePresentation',
        available: this.presentationService.canPresent(),
        unavailableReason: 'Add a Group before presenting',
      }),

      this.action('import-graph', isScratch ? 'Import graph' : 'Import current Project graph', 'Project', () => {
        this.importDialogService.requestOpen();
      }, { aliases: ['import', 'load graph', 'open json'], icon: 'lucideUpload' }),
      this.action('export-png', isScratch ? 'Export graph as PNG' : 'Export current Project as PNG', 'Project', () => {
        this.exportDialogService.requestOpen(currentProjectId ?? undefined, undefined, 'png');
      }, { aliases: ['download png', 'image export'], icon: 'lucideImageDown' }),
      this.action('export-json', isScratch ? 'Export graph as JSON' : 'Export current Project as JSON', 'Project', () => {
        this.exportDialogService.requestOpen(currentProjectId ?? undefined, undefined, 'json');
      }, { aliases: ['download json', 'json export'], icon: 'lucideFileJson' }),
      this.action('export-as', isScratch ? 'Export graph as…' : 'Export current Project as…', 'Project', () => {
        this.exportDialogService.requestOpen(currentProjectId ?? undefined);
      }, { aliases: ['export', 'download'], icon: 'lucideDownload' }),
      this.action('export-selection-png', 'Export Selection as PNG', 'Project', () => {
        const rootIds = [...this.graphService.selectedNodeIds()];
        this.exportDialogService.requestOpen(undefined, {
          rootIds,
          isMultiSelection: rootIds.length > 1,
        }, 'png');
      }, {
        aliases: ['download selected image', 'selection png'], icon: 'lucideImageDown',
        available: selectedNodeIds.length > 0, unavailableReason: 'Select a Node or Group first',
      }),
      this.action('copy-json', isScratch ? 'Copy graph JSON' : 'Copy current Project JSON', 'Project', () => {
        void this.exportService.copyJson();
      }, { aliases: ['copy graph', 'copy data'], icon: 'lucideBraces' }),
      this.action('copy-link', isScratch ? 'Copy graph link' : 'Copy current Project link', 'Project', () => {
        void this.exportService.copyLink();
      }, { aliases: ['share link', 'copy url'], icon: 'lucideLink' }),
      this.action('save-as-project', 'Save as Project', 'Project', () => {
        this.paletteService.enterCollectionPicker();
      }, {
        aliases: ['save graph as project', 'create project from scratch'], icon: 'lucideSave',
        available: isScratch && this.collectionService.collections().length > 0,
        unavailableReason: isScratch ? 'Create a Collection first' : 'Only available on the Scratch Canvas',
      }),
      this.action('rename-current-project', 'Rename current Project', 'Project', () => {
        if (currentProjectId) this.sidebarService.requestProjectRename(currentProjectId);
      }, {
        aliases: ['rename project'], icon: 'lucidePencil',
        available: !!currentProject,
        unavailableReason: 'Open a Project first',
      }),
      this.action('delete-current-project', 'Delete current Project', 'Project', () => {
        if (currentProjectId) this.sidebarService.requestProjectDelete(currentProjectId);
      }, {
        aliases: ['remove project', 'delete project'], icon: 'lucideTrash2',
        available: !!currentProject,
        unavailableReason: 'Open a Project first',
      }),

      this.action('new-collection', 'New Collection', 'Application', () => {
        this.sidebarService.requestNewCollection();
      }, { aliases: ['create collection'], icon: 'lucideFolderPlus' }),
      this.action('import-collection', 'Import Collection', 'Application', () => this.openCollectionImport(), {
        aliases: ['load collection', 'open collection json'], icon: 'lucideUpload',
      }),
      this.action('toggle-sidebar', 'Toggle Sidebar', 'Application', () => this.sidebarService.toggle(), {
        aliases: ['show sidebar', 'hide sidebar'], shortcut: SHORTCUTS.toggleSidebar, icon: 'lucidePanelLeft',
      }),
      this.action('toggle-minimap', 'Toggle Minimap', 'Application', () => this.minimapService.toggle(), {
        aliases: ['show minimap', 'hide minimap'], icon: 'lucideMap',
      }),
      this.action('toggle-pins', 'Toggle Pins', 'Application', () => this.pinVisibilityService.toggle(), {
        aliases: ['show pins', 'hide pins', 'toggle comments'], icon: 'lucideMessageCircle',
      }),
    ];
  }

  search(query: string): PaletteEntry[] {
    return searchPaletteEntries(this.entries(), query);
  }

  execute(entryId: string): boolean {
    const entry = this.entries().find(item => item.id === entryId);
    if (!entry || !entry.available) return false;
    entry.execute();
    return true;
  }

  /** The nested Save as Project step delegates back through this registry. */
  saveScratchAsProject(collectionId: string): void {
    if (this.currentProjectId() || !this.collectionService.getCollection(collectionId)) return;
    const project = this.collectionService.saveScratchAsProject(
      collectionId,
      this.graphService.exportGraph(),
    );
    void this.router.navigate(['/p', project.id]);
  }

  private action(
    id: string,
    label: string,
    category: PaletteCategory,
    execute: () => void,
    options: EntryOptions & { available?: boolean; unavailableReason?: string } = {},
  ): PaletteEntry {
    const available = options.available ?? true;
    return {
      id,
      label,
      aliases: options.aliases ?? [],
      category,
      shortcut: options.shortcut,
      swatch: options.swatch,
      icon: options.icon,
      emoji: options.emoji,
      linePreview: options.linePreview,
      sortOrder: options.sortOrder,
      available,
      disabledReason: available ? undefined : options.unavailableReason,
      execute,
    };
  }

  private nodeColorEntries(nodeIds: readonly string[]): PaletteEntry[] {
    const available = nodeIds.length > 0;
    const unavailableReason = 'Select a Node or Group first';
    const entries = PALETTE_COLORS.map(color => this.action(
      `node-color-${color.name.toLocaleLowerCase()}`,
      `Set selected Nodes to ${color.name}`,
      'Nodes & Groups',
      () => {
        const command = buildSetNodesColorCommand(this.graphService, this.graphService.selectedNodeIds(), color.value);
        if (command) this.historyService.execute(command);
      },
      {
        aliases: [`node ${color.name}`, `color nodes ${color.name}`],
        swatch: color.value,
        sortOrder: 0,
        available,
        unavailableReason,
      },
    ));
    entries.push(this.action(
      'node-color-default',
      'Reset selected Nodes to Default',
      'Nodes & Groups',
      () => {
        const command = buildSetNodesColorCommand(this.graphService, this.graphService.selectedNodeIds(), null);
        if (command) this.historyService.execute(command);
      },
      {
        aliases: ['default node color', 'remove node color'],
        swatch: DEFAULT_NODE_BACKGROUND,
        sortOrder: 0,
        available,
        unavailableReason,
      },
    ));
    return entries;
  }

  private nodeShapeEntries(nodeIds: readonly string[]): PaletteEntry[] {
    const available = nodeIds.length > 0;
    const unavailableReason = 'Select a regular Node first';
    return NODE_SHAPES.map((shape: NodeShape) => {
      const name = this.titleCase(shape);
      return this.action(
        `node-shape-${shape}`,
        `Set selected Nodes to ${name} shape`,
        'Nodes & Groups',
        () => {
          const command = buildSetNodesShapeCommand(
            this.graphService,
            this.graphService.selectedNodeIds(),
            shape,
          );
          if (command) this.historyService.execute(command);
        },
        {
          aliases: shape === 'rectangle'
            ? ['rectangle nodes', 'default node shape', 'reset node shape']
            : [`${shape} nodes`, `node shape ${shape}`],
          icon: SHAPE_ICONS[shape],
          sortOrder: 1,
          available,
          unavailableReason,
        },
      );
    });
  }

  private nodeEmojiEntries(nodeIds: readonly string[]): PaletteEntry[] {
    const available = nodeIds.length > 0;
    const unavailableReason = 'Select a regular Node first';
    const entries = NODE_EMOJIS.map(entry => {
      const lowered = entry.name.toLocaleLowerCase();
      return this.action(
        `node-emoji-${lowered.replace(/\s+/g, '-')}`,
        `Set selected Nodes' Emoji to ${entry.name}`,
        'Nodes & Groups',
        () => {
          const command = buildSetNodesEmojiCommand(
            this.graphService,
            this.graphService.selectedNodeIds(),
            entry.emoji,
          );
          if (command) this.historyService.execute(command);
        },
        {
          aliases: [lowered, `emoji ${lowered}`],
          emoji: entry.emoji,
          sortOrder: 2,
          available,
          unavailableReason,
        },
      );
    });
    entries.push(this.action(
      'node-emoji-remove',
      'Remove Emoji',
      'Nodes & Groups',
      () => {
        const command = buildSetNodesEmojiCommand(
          this.graphService,
          this.graphService.selectedNodeIds(),
          null,
        );
        if (command) this.historyService.execute(command);
      },
      {
        aliases: ['remove emoji', 'clear emoji', 'emoji none'],
        icon: 'lucideEraser',
        sortOrder: 2,
        available,
        unavailableReason,
      },
    ));
    return entries;
  }

  private connectionColorEntries(connectionIds: readonly string[]): PaletteEntry[] {
    const available = connectionIds.length > 0;
    const unavailableReason = 'Select a Connection first';
    const entries = PALETTE_COLORS.map(color => this.action(
      `connection-color-${color.name.toLocaleLowerCase()}`,
      `Set selected Connections to ${color.name}`,
      'Connections',
      () => {
        const command = buildSetConnectionsColorCommand(this.graphService, this.graphService.selectedConnectionIds(), color.value);
        if (command) this.historyService.execute(command);
      },
      {
        aliases: [`connection ${color.name}`, `color connections ${color.name}`],
        swatch: color.value,
        sortOrder: 1,
        available,
        unavailableReason,
      },
    ));
    entries.push(this.action(
      'connection-color-default',
      'Reset selected Connections to Default',
      'Connections',
      () => {
        const command = buildSetConnectionsColorCommand(this.graphService, this.graphService.selectedConnectionIds(), null);
        if (command) this.historyService.execute(command);
      },
      { aliases: ['default connection color', 'remove connection color'], icon: 'lucideEraser', sortOrder: 0, available, unavailableReason },
    ));
    return entries;
  }

  private connectionArrowheadEntries(connectionIds: readonly string[]): PaletteEntry[] {
    const available = connectionIds.length > 0;
    const unavailableReason = 'Select a Connection first';
    const entries: PaletteEntry[] = [];
    for (const end of ['start', 'end'] as ArrowheadEnd[]) {
      for (const type of ARROWHEAD_TYPES) {
        const name = this.titleCase(type);
        entries.push(this.action(
          `connection-arrowhead-${end}-${type}`,
          `Set selected Connections' ${end} Arrowhead to ${name}`,
          'Connections',
          () => {
            const command = buildSetConnectionsArrowheadCommand(
              this.graphService,
              this.graphService.selectedConnectionIds(),
              end,
              type,
            );
            if (command) this.historyService.execute(command);
          },
          {
            aliases: [`${end} arrowhead ${type}`, `connection ${end} ${type}`],
            icon: ARROWHEAD_ICONS[type],
            sortOrder: (end === 'start' ? 6 : 9) + ARROWHEAD_TYPES.indexOf(type),
            available,
            unavailableReason,
          },
        ));
      }
    }
    return entries;
  }

  private connectionStrokeEntries(connectionIds: readonly string[]): PaletteEntry[] {
    const available = connectionIds.length > 0;
    const unavailableReason = 'Select a Connection first';
    return [
      ...STROKE_PATTERNS.map(pattern => this.action(
        `connection-pattern-${pattern}`,
        `Set selected Connections to ${this.titleCase(pattern)}`,
        'Connections',
        () => {
          const command = buildSetConnectionsStrokePatternCommand(
            this.graphService,
            this.graphService.selectedConnectionIds(),
            pattern,
          );
          if (command) this.historyService.execute(command);
        },
        {
          aliases: [`${pattern} connections`, `${pattern} stroke`],
          linePreview: PATTERN_PREVIEWS[pattern],
          sortOrder: 2,
          available,
          unavailableReason,
        },
      )),
      ...STROKE_WEIGHTS.map(weight => this.action(
        `connection-weight-${weight}`,
        `Set selected Connections to ${this.titleCase(weight)} weight`,
        'Connections',
        () => {
          const command = buildSetConnectionsStrokeWeightCommand(
            this.graphService,
            this.graphService.selectedConnectionIds(),
            weight,
          );
          if (command) this.historyService.execute(command);
        },
        {
          aliases: [`${weight} connections`, `${weight} stroke weight`],
          linePreview: WEIGHT_PREVIEWS[weight],
          sortOrder: CONNECTION_WEIGHT_ORDER[weight],
          available,
          unavailableReason,
        },
      )),
    ];
  }

  private connectionRouteStyleEntries(connectionIds: readonly string[]): PaletteEntry[] {
    const available = connectionIds.length > 0;
    const unavailableReason = 'Select a Connection first';
    return ROUTE_STYLES.map(style => this.action(
      `connection-route-${style}`,
      `Set selected Connections' Route Style to ${this.titleCase(style)}`,
      'Connections',
      () => {
        const command = buildSetConnectionsRouteStyleCommand(
          this.graphService,
          this.graphService.selectedConnectionIds(),
          style,
        );
        if (command) this.historyService.execute(command);
      },
      {
        aliases: [`${style} connections`, `${style} route style`],
        icon: ROUTE_STYLE_ICONS[style],
        sortOrder: ROUTE_STYLE_ORDER[style],
        available,
        unavailableReason,
      },
    ));
  }

  private addNode(): void {
    const center = this.canvasViewport.visibleCanvasCenter();
    const command = new CreateNodeCommand(this.graphService, 'New Node', center.x - 80, center.y - 24);
    this.historyService.execute(command);
    const node = command.getNode();
    if (node) this.contextMenuService.requestEditText(node.id);
  }

  private addGroup(): void {
    const center = this.canvasViewport.visibleCanvasCenter();
    const command = new CreateGroupCommand(this.graphService, 'New Group', center.x - 160, center.y - 100);
    this.historyService.execute(command);
    const group = command.getGroup();
    if (group) this.contextMenuService.requestRename(group.id);
  }

  // Ghost-pin (ADR-0025): anchors to the single selected Node at its
  // top-right corner, else drops Canvas-anchored at the Viewport center.
  // The popover opens; nothing enters Graph State until a non-empty commit.
  private addPin(): void {
    const selectedNodeIds = this.graphService.selectedNodeIds();
    if (selectedNodeIds.length === 1 && this.graphService.selectionSize() === 1) {
      const node = this.graphService.nodes().find(n => n.id === selectedNodeIds[0]);
      if (node) {
        this.contextMenuService.requestCreatePin({
          kind: 'node', nodeId: node.id, offsetX: node.width, offsetY: 0,
        });
        return;
      }
    }
    const center = this.canvasViewport.visibleCanvasCenter();
    this.contextMenuService.requestCreatePin({ kind: 'canvas', x: center.x, y: center.y });
  }

  private editText(): void {
    if (this.graphService.selectedNodeIds().length === 1) {
      const node = this.graphService.selectedNode();
      if (node && node.kind !== 'group') this.contextMenuService.requestEditText(node.id);
      return;
    }
    const connectionId = this.graphService.selectedConnectionId();
    if (connectionId) this.contextMenuService.requestConnectionText(connectionId);
  }

  private deleteSelection(): void {
    if (this.graphService.selectionSize() > 1) {
      const command = buildDeleteSelectionCommand(
        this.graphService,
        this.graphService.selectedNodeIds(),
        this.graphService.selectedConnectionIds(),
      );
      if (command) this.historyService.execute(command);
      return;
    }
    const connectionId = this.graphService.selectedConnectionId();
    if (connectionId) {
      this.historyService.execute(new DeleteConnectionCommand(this.graphService, connectionId));
      return;
    }
    const nodeId = this.graphService.selectedNodeId();
    if (nodeId) this.historyService.execute(new DeleteNodeCompoundCommand(this.graphService, nodeId));
  }

  private openCollectionImport(): void {
    const input = typeof document !== 'undefined'
      ? document.querySelector<HTMLInputElement>('[data-collection-import]')
      : null;
    input?.click();
  }

  private currentProjectId(): string | null {
    const match = /^\/p\/([^/?#]+)/.exec(this.router.url);
    if (!match) return null;
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return match[1];
    }
  }

  private titleCase(value: string): string {
    return value.charAt(0).toLocaleUpperCase() + value.slice(1);
  }

}
