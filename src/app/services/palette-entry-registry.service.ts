import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import {
  ARROWHEAD_TYPES,
  ArrowheadEnd,
  STROKE_PATTERNS,
  STROKE_WEIGHTS,
} from '../models/connection';
import { AlignKind, DistributeAxis } from '../models/align-distribute';
import { DEFAULT_NODE_BACKGROUND, NODE_PALETTE } from '../models/node';
import { NODE_SHAPES, NodeShape } from '../models/node-shape';
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
  buildSetNodesColorCommand,
  buildSetNodesShapeCommand,
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
import { PresentationService } from './presentation.service';
import { SidebarService } from './sidebar.service';

const PALETTE_COLORS = [
  { name: 'Rose', value: NODE_PALETTE[0] },
  { name: 'Peach', value: NODE_PALETTE[1] },
  { name: 'Yellow', value: NODE_PALETTE[2] },
  { name: 'Green', value: NODE_PALETTE[3] },
  { name: 'Cyan', value: NODE_PALETTE[4] },
  { name: 'Periwinkle', value: NODE_PALETTE[5] },
  { name: 'Lavender', value: NODE_PALETTE[6] },
  { name: 'Pink', value: NODE_PALETTE[7] },
] as const;

const ALIGNMENTS: readonly { kind: AlignKind; label: string }[] = [
  { kind: 'left', label: 'Align selected Nodes left' },
  { kind: 'center', label: 'Align selected Nodes center' },
  { kind: 'right', label: 'Align selected Nodes right' },
  { kind: 'top', label: 'Align selected Nodes top' },
  { kind: 'middle', label: 'Align selected Nodes middle' },
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

type EntryOptions = {
  aliases?: readonly string[];
  shortcut?: string;
  swatch?: string;
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
  private readonly exportService = inject(ExportService);
  private readonly presentationService = inject(PresentationService);
  private readonly sidebarService = inject(SidebarService);
  private readonly minimapService = inject(MinimapService);
  private readonly pinVisibilityService = inject(PinVisibilityService);
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

    return [
      this.action('undo', 'Undo', 'History', () => this.historyService.undo(), {
        aliases: ['reverse', 'step back'], shortcut: SHORTCUTS.undo,
        available: this.historyService.canUndo(), unavailableReason: 'Nothing to undo',
      }),
      this.action('redo', 'Redo', 'History', () => this.historyService.redo(), {
        aliases: ['repeat', 'step forward'], shortcut: SHORTCUTS.redo,
        available: this.historyService.canRedo(), unavailableReason: 'Nothing to redo',
      }),

      this.action('select-all', 'Select All', 'Selection', () => this.graphService.selectAll(), {
        aliases: ['select everything'], shortcut: SHORTCUTS.selectAll,
      }),
      this.action('clear-selection', 'Clear Selection', 'Selection', () => this.graphService.clearSelection(), {
        aliases: ['deselect', 'clear selected'],
        available: selectionSize > 0, unavailableReason: 'Nothing is selected',
      }),
      this.action('cut', 'Cut', 'Selection', () => this.clipboardService.cut(selectedNodeIds, selectedConnectionIds), {
        aliases: ['remove to clipboard'], shortcut: SHORTCUTS.cut,
        available: selectedNodeIds.length > 0, unavailableReason: 'Select a Node or Group first',
      }),
      this.action('copy', 'Copy', 'Selection', () => this.clipboardService.copy(selectedNodeIds), {
        aliases: ['copy selected'], shortcut: SHORTCUTS.copy,
        available: selectedNodeIds.length > 0, unavailableReason: 'Select a Node or Group first',
      }),
      this.action('paste', 'Paste', 'Selection', () => {
        this.clipboardService.pasteAtCursor(this.canvasViewport.visibleCanvasCenter());
      }, {
        aliases: ['insert', 'paste from clipboard'], shortcut: SHORTCUTS.paste,
        available: this.clipboardService.canPaste(), unavailableReason: 'Clipboard is empty',
      }),
      this.action('duplicate', 'Duplicate', 'Selection', () => this.clipboardService.duplicate(selectedNodeIds), {
        aliases: ['clone', 'make a copy'], shortcut: SHORTCUTS.duplicate,
        available: selectedNodeIds.length > 0, unavailableReason: 'Select a Node or Group first',
      }),
      this.action('delete', 'Delete', 'Selection', () => this.deleteSelection(), {
        aliases: ['remove', 'trash'],
        available: selectionSize > 0, unavailableReason: 'Nothing is selected',
      }),
      ...ALIGNMENTS.map(({ kind, label }) => this.action(
        `align-${kind}`, label, 'Selection', () => {
          const command = buildAlignSelectionCommand(this.graphService, this.graphService.selectedNodeIds(), kind);
          if (command) this.historyService.execute(command);
        }, {
          aliases: ['align', `align ${kind}`],
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
          available: selectedNodeIds.length >= 3,
          unavailableReason: 'Select at least three Nodes or Groups',
        },
      )),

      this.action('add-node', 'Add Node', 'Nodes & Groups', () => this.addNode(), {
        aliases: ['new node', 'create node'],
      }),
      this.action('add-group', 'Add Group', 'Nodes & Groups', () => this.addGroup(), {
        aliases: ['new group', 'create group'],
      }),
      this.action('add-pin', 'Add pin', 'Nodes & Groups', () => this.addPin(), {
        // "Comment" is a hidden alias: the Figma lineage word users will type
        aliases: ['new pin', 'create pin', 'comment', 'add comment'],
      }),
      this.action('edit-text', 'Edit Text', 'Nodes & Groups', () => this.editText(), {
        aliases: ['edit label', 'rename text'],
        available: selectionSize === 1 &&
          ((!!oneSelectedNode && oneSelectedNode.kind !== 'group') || selectedConnectionIds.length === 1),
        unavailableReason: 'Select one Node or Connection',
      }),
      this.action('rename-group', 'Rename', 'Nodes & Groups', () => {
        if (oneSelectedNode?.kind === 'group') this.contextMenuService.requestRename(oneSelectedNode.id);
      }, {
        aliases: ['rename group', 'edit group label'],
        available: oneSelectedNode?.kind === 'group' && selectionSize === 1,
        unavailableReason: 'Select one Group',
      }),
      ...this.nodeColorEntries(selectedNodeIds),
      ...this.nodeShapeEntries(selectedRegularNodeIds),

      ...this.connectionColorEntries(selectedConnectionIds),
      ...this.connectionArrowheadEntries(selectedConnectionIds),
      ...this.connectionStrokeEntries(selectedConnectionIds),

      this.action('zoom-in', 'Zoom In', 'Viewport', () => this.graphService.zoomBy(0.1, 0, 0), {
        aliases: ['magnify', 'increase zoom'],
      }),
      this.action('zoom-out', 'Zoom Out', 'Viewport', () => this.graphService.zoomBy(-0.1, 0, 0), {
        aliases: ['shrink', 'decrease zoom'],
      }),
      this.action('zoom-to-fit', 'Zoom to Fit', 'Viewport', () => {
        const size = this.canvasViewport.visibleSize();
        this.graphService.zoomToFit(size.width, size.height);
      }, { aliases: ['frame canvas', 'fit graph'], shortcut: SHORTCUTS.zoomToFit }),
      this.action('zoom-to-selection', 'Zoom to Selection', 'Viewport', () => {
        const size = this.canvasViewport.visibleSize();
        this.graphService.zoomToSelection(size.width, size.height);
      }, {
        aliases: ['frame selection', 'fit selection'], shortcut: SHORTCUTS.zoomToSelection,
        available: selectionSize > 0, unavailableReason: 'Nothing is selected',
      }),
      this.action('tidy-up', 'Tidy up', 'Viewport', () => {
        const command = buildTidyUpCommand(this.graphService);
        if (!command) return;
        this.historyService.execute(command);
        const size = this.canvasViewport.visibleSize();
        this.graphService.zoomToFit(size.width, size.height);
      }, { aliases: ['auto layout', 'organize graph'] }),
      this.action('present', 'Present', 'Viewport', () => {
        const size = this.canvasViewport.visibleSize();
        this.presentationService.enter(size.width, size.height);
      }, {
        aliases: ['presentation mode', 'start tour'],
        available: this.presentationService.canPresent(),
        unavailableReason: 'Add a Group before presenting',
      }),

      this.action('import-graph', isScratch ? 'Import graph' : 'Import current Project graph', 'Project', () => {
        this.importDialogService.requestOpen();
      }, { aliases: ['import', 'load graph', 'open json'] }),
      this.action('export-png', isScratch ? 'Export graph as PNG' : 'Export current Project as PNG', 'Project', () => {
        this.exportDialogService.requestOpen(currentProjectId ?? undefined, undefined, 'png');
      }, { aliases: ['download png', 'image export'] }),
      this.action('export-json', isScratch ? 'Export graph as JSON' : 'Export current Project as JSON', 'Project', () => {
        this.exportDialogService.requestOpen(currentProjectId ?? undefined, undefined, 'json');
      }, { aliases: ['download json', 'json export'] }),
      this.action('export-as', isScratch ? 'Export graph as…' : 'Export current Project as…', 'Project', () => {
        this.exportDialogService.requestOpen(currentProjectId ?? undefined);
      }, { aliases: ['export', 'download'] }),
      this.action('export-selection-png', 'Export Selection as PNG', 'Project', () => {
        const rootIds = [...this.graphService.selectedNodeIds()];
        this.exportDialogService.requestOpen(undefined, {
          rootIds,
          isMultiSelection: rootIds.length > 1,
        }, 'png');
      }, {
        aliases: ['download selected image', 'selection png'],
        available: selectedNodeIds.length > 0, unavailableReason: 'Select a Node or Group first',
      }),
      this.action('copy-json', isScratch ? 'Copy graph JSON' : 'Copy current Project JSON', 'Project', () => {
        void this.exportService.copyJson();
      }, { aliases: ['copy graph', 'copy data'] }),
      this.action('copy-link', isScratch ? 'Copy graph link' : 'Copy current Project link', 'Project', () => {
        void this.exportService.copyLink();
      }, { aliases: ['share link', 'copy url'] }),
      this.action('save-as-project', 'Save as Project', 'Project', () => {
        this.paletteService.enterCollectionPicker();
      }, {
        aliases: ['save graph as project', 'create project from scratch'],
        available: isScratch && this.collectionService.collections().length > 0,
        unavailableReason: isScratch ? 'Create a Collection first' : 'Only available on the Scratch Canvas',
      }),
      this.action('rename-current-project', 'Rename current Project', 'Project', () => {
        if (currentProjectId) this.sidebarService.requestProjectRename(currentProjectId);
      }, {
        aliases: ['rename project'],
        available: !!currentProject,
        unavailableReason: 'Open a Project first',
      }),
      this.action('delete-current-project', 'Delete current Project', 'Project', () => {
        if (currentProjectId) this.sidebarService.requestProjectDelete(currentProjectId);
      }, {
        aliases: ['remove project', 'delete project'],
        available: !!currentProject,
        unavailableReason: 'Open a Project first',
      }),

      this.action('new-collection', 'New Collection', 'Application', () => {
        this.sidebarService.requestNewCollection();
      }, { aliases: ['create collection'] }),
      this.action('import-collection', 'Import Collection', 'Application', () => this.openCollectionImport(), {
        aliases: ['load collection', 'open collection json'],
      }),
      this.action('toggle-sidebar', 'Toggle Sidebar', 'Application', () => this.sidebarService.toggle(), {
        aliases: ['show sidebar', 'hide sidebar'], shortcut: SHORTCUTS.toggleSidebar,
      }),
      this.action('toggle-minimap', 'Toggle Minimap', 'Application', () => this.minimapService.toggle(), {
        aliases: ['show minimap', 'hide minimap'],
      }),
      this.action('toggle-pins', 'Toggle Pins', 'Application', () => this.pinVisibilityService.toggle(), {
        aliases: ['show pins', 'hide pins', 'toggle comments'],
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
          sortOrder: 1,
          available,
          unavailableReason,
        },
      );
    });
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
      { aliases: ['default connection color', 'remove connection color'], available, unavailableReason },
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
          available,
          unavailableReason,
        },
      )),
    ];
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
