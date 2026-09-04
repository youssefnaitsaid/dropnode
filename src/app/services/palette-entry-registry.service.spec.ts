import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { PaletteEntryRegistry } from './palette-entry-registry.service';
import { GraphService } from './graph.service';
import { HistoryService } from './history.service';
import { ContextMenuService } from './context-menu.service';
import { ExportDialogService } from './export-dialog.service';
import { PinVisibilityService } from './pin-visibility.service';
import { HistoryPanelService } from './history-panel.service';
import { OutlineService } from './outline.service';
import { ConnectionJumpsService } from './connection-jumps.service';
import { CanvasLockService } from './canvas-lock.service';
import { CanvasSearchService } from './canvas-search.service';
import { PresentationService } from './presentation.service';
import { CollectionService } from './collection.service';

@Component({ standalone: true, template: '' })
class TestRoute {}

describe('PaletteEntryRegistry', () => {
  let registry: PaletteEntryRegistry;
  let graphService: GraphService;
  let historyService: HistoryService;
  let contextMenuService: ContextMenuService;
  let exportDialogService: ExportDialogService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([{ path: 'p/:projectId', component: TestRoute }])] });
    registry = TestBed.inject(PaletteEntryRegistry);
    graphService = TestBed.inject(GraphService);
    historyService = TestBed.inject(HistoryService);
    contextMenuService = TestBed.inject(ContextMenuService);
    exportDialogService = TestBed.inject(ExportDialogService);
  });

  function find(id: string) {
    return registry.entries().find(entry => entry.id === id)!;
  }

  it('exposes canonical intent-level entries with aliases and categories', () => {
    const fit = find('zoom-to-fit');
    const pastelblue = find('node-color-pastelblue');
    const defaultColor = find('node-color-default');
    const diamond = find('node-shape-diamond');
    const toggleMinimap = find('toggle-minimap');

    expect(fit.label).toBe('Zoom to Fit');
    expect(fit.category).toBe('Viewport');
    expect(fit.aliases).toContain('frame canvas');
    expect(fit.shortcut).toBe('Shift+1');
    expect(pastelblue.label).toBe('Set selected Nodes to PastelBlue');
    expect(pastelblue.swatch).toBe('#B3EBF2');
    expect(defaultColor.swatch).toBe('#f0f0f5');
    expect(diamond.label).toBe('Set selected Nodes to Diamond shape');
    expect(diamond.category).toBe('Nodes & Groups');
    expect(diamond.aliases).toContain('node shape diamond');
    expect(toggleMinimap.label).toBe('Toggle Minimap');
    expect(toggleMinimap.category).toBe('Application');
    expect(toggleMinimap.aliases).toContain('hide minimap');
    expect(['rectangle', 'pill', 'diamond', 'ellipse'].map(shape => find(`node-shape-${shape}`).id))
      .toEqual(['node-shape-rectangle', 'node-shape-pill', 'node-shape-diamond', 'node-shape-ellipse']);

    const styleIds = registry.search('').filter(entry =>
      entry.id.startsWith('node-color-') || entry.id.startsWith('node-shape-') || entry.id.startsWith('node-emoji-'),
    ).map(entry => entry.id);
    expect(styleIds.slice(0, 9).every(id => id.startsWith('node-color-'))).toBe(true);
    expect(styleIds.slice(9, 13).every(id => id.startsWith('node-shape-'))).toBe(true);
    expect(styleIds.slice(13).every(id => id.startsWith('node-emoji-'))).toBe(true);
    expect(styleIds.filter(id => id.startsWith('node-emoji-'))).toHaveLength(49);
  });

  it('exposes Canvas Search as a Viewport entry that requests the overlay', () => {
    const entry = find('search-canvas-text');

    expect(entry.label).toBe('Search Canvas Text…');
    expect(entry.category).toBe('Viewport');
    expect(entry.aliases).toEqual(expect.arrayContaining(['find', 'find text', 'search text']));
    expect(entry.shortcut).toBe('Ctrl+F');
    expect(entry.available).toBe(true);

    entry.execute();
    // Deferred like every dialog-opening entry: the Palette is still mounted
    // here, so the overlay opens once it closes instead of this tick.
    const search = TestBed.inject(CanvasSearchService);
    expect(search.openRequests()).toBe(1);
    expect(search.isOpen()).toBe(false);
  });

  it('marks Canvas Search unavailable in Present Mode', () => {
    TestBed.inject(GraphService).createGroup('Tour', 0, 0);
    const presentation = TestBed.inject(PresentationService);
    presentation.enter(800, 600, 'reading');

    const entry = find('search-canvas-text');
    expect(entry.available).toBe(false);
    expect(entry.disabledReason).toBe('Not available in Present Mode');
    presentation.exit();
  });

  it('gives every entry exactly one leading visual (swatch, emoji, icon, or line preview)', () => {
    const offenders = registry.entries()
      .filter(entry => [entry.swatch, entry.emoji, entry.icon, entry.linePreview].filter(Boolean).length !== 1)
      .map(entry => entry.id);
    expect(offenders).toEqual([]);

    expect(find('undo').icon).toBe('lucideUndo2');
    expect(find('connection-color-default').icon).toBe('lucideEraser');
    expect(find('connection-pattern-dashed').linePreview).toEqual({ dash: '6 4' });
    expect(find('connection-weight-thick').linePreview).toEqual({ width: 3.5 });
    expect(find('connection-route-curve').icon).toBe('lucideSpline');
    expect(find('connection-route-orthogonal').icon).toBe('lucideRoute');
  });

  it('orders Connection entries Add Reroute Point first, then Reset → colors → patterns → weights → arrowheads', () => {
    const ids = registry.search('')
      .filter(entry => entry.category === 'Connections')
      .map(entry => entry.id);

    expect(ids).toEqual([
      'add-reroute-point',
      'connection-color-default',
      'connection-color-beige',
      'connection-color-emerald',
      'connection-color-lavender',
      'connection-color-lightgray',
      'connection-color-lightorange',
      'connection-color-pastelblue',
      'connection-color-pastelred',
      'connection-color-pink',
      'connection-pattern-dashed',
      'connection-pattern-dotted',
      'connection-pattern-solid',
      'connection-weight-thin',
      'connection-weight-normal',
      'connection-weight-thick',
      'connection-arrowhead-start-none',
      'connection-arrowhead-start-arrow',
      'connection-arrowhead-start-triangle',
      'connection-arrowhead-end-none',
      'connection-arrowhead-end-arrow',
      'connection-arrowhead-end-triangle',
      'connection-route-curve',
      'connection-route-orthogonal',
    ]);
  });

  it('keeps prerequisite-dependent entries visible but unavailable', () => {
    const clear = find('clear-selection');
    const paste = find('paste');
    const align = find('align-left');

    expect(clear.available).toBe(false);
    expect(clear.disabledReason).toBe('Nothing is selected');
    expect(paste.available).toBe(false);
    expect(paste.disabledReason).toBe('Clipboard is empty');
    expect(align.available).toBe(false);
    expect(registry.execute('clear-selection')).toBe(false);
    expect(historyService.canUndo()).toBe(false);
  });

  it('offers both Present orders behind one availability gate', () => {
    expect(find('present-reading-order').label).toBe('Present in reading order');
    expect(find('present-following-connections').label).toBe('Present following Connections');
    expect(find('present-reading-order').available).toBe(false);
    expect(find('present-following-connections').available).toBe(false);
    graphService.createGroup('G', 0, 0);
    // Registry snapshots availability at build time; rebuild by re-reading entries
    const rebuilt = registry.entries();
    expect(rebuilt.find(e => e.id === 'present-reading-order')!.available).toBe(true);
    expect(rebuilt.find(e => e.id === 'present-following-connections')!.available).toBe(true);
  });

  it('keeps Shape entries unavailable until a regular Node is selected', () => {
    const group = graphService.createGroup('G', 0, 0, 240, 160);
    const shape = find('node-shape-pill');

    expect(shape.available).toBe(false);
    expect(shape.disabledReason).toBe('Select a regular Node first');

    graphService.selectNode(group.id);
    expect(find('node-shape-pill').available).toBe(false);
    expect(registry.execute('node-shape-pill')).toBe(false);

    const node = graphService.createNode('A', 0, 0);
    graphService.toggleNodeSelection(node.id);
    expect(find('node-shape-pill').available).toBe(true);
  });

  it('toggles Connection Jumps without touching History', () => {
    const entry = find('toggle-connection-jumps');
    const jumps = TestBed.inject(ConnectionJumpsService);

    expect(entry.label).toBe('Toggle Connection Jumps');
    expect(entry.category).toBe('Application');
    expect(entry.aliases).toContain('show connection jumps');
    expect(entry.aliases).toContain('hide connection jumps');
    expect(entry.icon).toBe('lucideWaypoints');
    expect(entry.available).toBe(true);

    expect(jumps.enabled()).toBe(false);
    expect(registry.execute('toggle-connection-jumps')).toBe(true);
    expect(jumps.enabled()).toBe(true);
    expect(historyService.canUndo()).toBe(false);
  });

  it('executes Add Node through History and requests the existing Text editor', () => {
    expect(registry.execute('add-node')).toBe(true);

    expect(graphService.nodes()).toHaveLength(1);
    expect(graphService.nodes()[0].text?.[0]?.runs[0]?.text).toBe('New Node');
    expect(historyService.canUndo()).toBe(true);
    expect(contextMenuService.editTextRequest()).toBe(graphService.nodes()[0].id);
  });

  it('executes styling through the existing Command factories', () => {
    const node = graphService.createNode('A', 0, 0);
    graphService.selectNode(node.id);

    expect(registry.execute('node-color-pastelblue')).toBe(true);
    expect(graphService.nodes()[0].color).toBe('#B3EBF2');
    expect(historyService.canUndo()).toBe(true);
  });

  it('executes Route Style entries through the bulk Route Style Command', () => {
    const orthogonal = find('connection-route-orthogonal');
    expect(orthogonal.label).toBe("Set selected Connections' Route Style to Orthogonal");
    expect(orthogonal.category).toBe('Connections');
    expect(orthogonal.aliases).toContain('orthogonal route style');
    expect(orthogonal.available).toBe(false);

    const a = graphService.createNode('A', 0, 0);
    const b = graphService.createNode('B', 300, 0);
    const conn = graphService.createConnection(a.id, 'right', b.id, 'left')!;
    graphService.selectConnection(conn.id);

    expect(find('connection-route-orthogonal').available).toBe(true);
    expect(registry.execute('connection-route-orthogonal')).toBe(true);
    expect(graphService.connections()[0].routeStyle).toBe('orthogonal');
    expect(historyService.canUndo()).toBe(true);
    historyService.undo();
    expect('routeStyle' in graphService.connections()[0]).toBe(false);
  });

  it('executes a Shape entry through the bulk Shape Command', () => {
    const group = graphService.createGroup('G', 0, 0, 240, 160);
    const node = graphService.createNode('A', 0, 0);
    graphService.selectNode(group.id);
    graphService.toggleNodeSelection(node.id);

    expect(registry.execute('node-shape-pill')).toBe(true);
    expect(graphService.nodes().find(item => item.id === node.id)?.shape).toBe('pill');
    expect(graphService.nodes().find(item => item.id === group.id)?.shape).toBeUndefined();
    expect(historyService.canUndo()).toBe(true);

    historyService.undo();
    expect(graphService.nodes().find(item => item.id === node.id)?.shape).toBeUndefined();
  });

  it('exposes one Emoji entry per curated value plus Remove Emoji', () => {
    const idea = find('node-emoji-idea');
    const blocked = find('node-emoji-blocked');
    const remove = find('node-emoji-remove');

    expect(idea.label).toBe("Set selected Nodes' Emoji to Idea");
    expect(idea.category).toBe('Nodes & Groups');
    expect(idea.emoji).toBe('💡');
    expect(idea.aliases).toContain('idea');
    expect(blocked.label).toBe("Set selected Nodes' Emoji to Blocked");
    expect(blocked.aliases).toContain('blocked');
    expect(remove.label).toBe('Remove Emoji');
    expect(remove.aliases).toContain('remove emoji');
  });

  it('keeps Emoji entries unavailable until a regular Node is selected', () => {
    const group = graphService.createGroup('G', 0, 0, 240, 160);
    const idea = find('node-emoji-idea');

    expect(idea.available).toBe(false);
    expect(idea.disabledReason).toBe('Select a regular Node first');

    graphService.selectNode(group.id);
    expect(find('node-emoji-idea').available).toBe(false);
    expect(registry.execute('node-emoji-idea')).toBe(false);

    const node = graphService.createNode('A', 0, 0);
    graphService.toggleNodeSelection(node.id);
    expect(find('node-emoji-idea').available).toBe(true);
  });

  it('executes Emoji entries through the bulk Emoji Command, skipping Groups', () => {
    const group = graphService.createGroup('G', 0, 0, 240, 160);
    const node = graphService.createNode('A', 0, 0);
    graphService.selectNode(group.id);
    graphService.toggleNodeSelection(node.id);

    expect(registry.execute('node-emoji-idea')).toBe(true);
    expect(graphService.nodes().find(item => item.id === node.id)?.emoji).toBe('💡');
    expect(graphService.nodes().find(item => item.id === group.id)?.emoji).toBeUndefined();
    expect(historyService.canUndo()).toBe(true);

    historyService.undo();
    expect(graphService.nodes().find(item => item.id === node.id)?.emoji).toBeUndefined();

    registry.execute('node-emoji-idea');
    expect(registry.execute('node-emoji-remove')).toBe(true);
    expect(graphService.nodes().find(item => item.id === node.id)?.emoji).toBeUndefined();
  });

  it('finds Emoji entries by their curated names', () => {
    const node = graphService.createNode('A', 0, 0);
    graphService.selectNode(node.id);

    expect(registry.search('idea').map(entry => entry.id)).toContain('node-emoji-idea');
    expect(registry.search('blocked').map(entry => entry.id)).toContain('node-emoji-blocked');
  });

  it('re-checks live selection at execution time', () => {
    const node = graphService.createNode('A', 0, 0);
    const entry = find('delete');
    expect(entry.available).toBe(false);

    graphService.selectNode(node.id);
    expect(registry.execute(entry.id)).toBe(true);
    expect(graphService.nodes()).toHaveLength(0);
  });

  it('opens direct export entries through the existing dialog with a format', () => {
    expect(registry.execute('export-json')).toBe(true);
    expect(exportDialogService.format()).toBe('json');
    expect(exportDialogService.openRequests()).toBe(1);
  });

  it('uses route-aware current Project labels', async () => {
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/p/project-1');
    expect(find('export-json').label).toBe('Export current Project as JSON');
    expect(find('save-as-project').available).toBe(false);
  });

  it('Add Reroute Point is a Connections entry enabled on a single selected Connection', () => {
    const entry = find('add-reroute-point');
    expect(entry.label).toBe('Add Reroute Point');
    expect(entry.category).toBe('Connections');
    expect(entry.icon).toBe('lucideMapPin');
    expect(entry.available).toBe(false);
    expect(entry.disabledReason).toBe('Select a Connection first');

    const a = graphService.createNode('A', 0, 0);
    const b = graphService.createNode('B', 320, 0);
    const conn = graphService.createConnection(a.id, 'right', b.id, 'left')!;
    graphService.selectConnection(conn.id);

    expect(find('add-reroute-point').available).toBe(true);
    expect(registry.execute('add-reroute-point')).toBe(true);
    expect(graphService.connections()[0].reroutePoints).toHaveLength(1);
    expect(historyService.canUndo()).toBe(true);

    historyService.undo();
    expect(graphService.connections()[0].reroutePoints).toBeUndefined();
  });

  it('Add Reroute Point is unavailable once the Connection holds 32 Reroute Points', () => {
    const a = graphService.createNode('A', 0, 0);
    const b = graphService.createNode('B', 320, 0);
    const conn = graphService.createConnection(a.id, 'right', b.id, 'left')!;
    graphService.setConnectionReroutePoints(
      conn.id,
      Array.from({ length: 32 }, (_, i) => ({ x: 10 + i, y: 20 })),
    );
    graphService.selectConnection(conn.id);

    const entry = find('add-reroute-point');
    expect(entry.available).toBe(false);
    expect(entry.disabledReason).toBe('Reroute Point limit reached');
    expect(registry.execute('add-reroute-point')).toBe(false);
  });

  it('exposes Add pin with comment as a hidden search alias', () => {
    const addPin = find('add-pin');
    expect(addPin.label).toBe('Add pin');
    expect(addPin.category).toBe('Nodes & Groups');
    expect(addPin.aliases).toContain('comment');
    expect(addPin.available).toBe(true);
  });

  it('Add pin anchors to the single selected Node at its top-right corner', () => {
    const node = graphService.createNode('A', 100, 200);
    graphService.selectNode(node.id);

    registry.execute('add-pin');

    expect(contextMenuService.pinCreateRequest()).toEqual({
      kind: 'node', nodeId: node.id, offsetX: node.width, offsetY: 0,
    });
  });

  it('Add pin with no single Node selected drops a Canvas anchor at the Viewport center', () => {
    registry.execute('add-pin');

    const request = contextMenuService.pinCreateRequest();
    expect(request?.kind).toBe('canvas');
    expect(typeof request?.kind === 'canvas' ? request.x : 0).toBeTypeOf('number');
    expect(contextMenuService.pinCreateRequest()).not.toBeNull();
    // Ghost-pin: nothing entered Graph State or History
    expect(graphService.pins().length).toBe(0);
    expect(historyService.canUndo()).toBe(false);
  });

  it('exposes Toggle Pins in Application and it flips the visibility', () => {
    const togglePins = find('toggle-pins');
    const pinVisibility = TestBed.inject(PinVisibilityService);

    expect(togglePins.label).toBe('Toggle Pins');
    expect(togglePins.category).toBe('Application');
    expect(togglePins.aliases).toContain('hide pins');

    expect(pinVisibility.hidden()).toBe(false);
    registry.execute('toggle-pins');
    expect(pinVisibility.hidden()).toBe(true);
    registry.execute('toggle-pins');
    expect(pinVisibility.hidden()).toBe(false);
  });

  it('exposes Toggle History in History with no shortcut and it flips the panel', () => {
    const toggleHistory = find('toggle-history');
    const historyPanel = TestBed.inject(HistoryPanelService);

    expect(toggleHistory.label).toBe('Toggle History');
    expect(toggleHistory.category).toBe('History');
    expect(toggleHistory.aliases).toContain('hide history');
    expect(toggleHistory.shortcut).toBeUndefined();

    registry.execute('toggle-history');
    expect(historyPanel.hidden()).toBe(true);
    registry.execute('toggle-history');
    expect(historyPanel.hidden()).toBe(false);
  });

  it('exposes Toggle Outline in Application with no shortcut and it flips the panel', () => {
    const toggleOutline = find('toggle-outline');
    const outline = TestBed.inject(OutlineService);

    expect(toggleOutline.label).toBe('Toggle Outline');
    expect(toggleOutline.category).toBe('Application');
    expect(toggleOutline.aliases).toContain('hide outline');
    expect(toggleOutline.shortcut).toBeUndefined();

    registry.execute('toggle-outline');
    expect(outline.hidden()).toBe(true);
    registry.execute('toggle-outline');
    expect(outline.hidden()).toBe(false);
  });

  it('exposes Add Text Block beside Add Node and Add Group', () => {
    const entry = find('add-text-block');
    expect(entry.label).toBe('Add Text Block');
    expect(entry.category).toBe('Nodes & Groups');
    expect(entry.available).toBe(true);
  });

  it('Add Text Block creates an annotation Text Block with its editor requested', () => {
    registry.execute('add-text-block');

    expect(graphService.nodes().length).toBe(1);
    const block = graphService.nodes()[0];
    expect(block.kind).toBe('annotation');
    expect(contextMenuService.editTextRequest()).toBe(block.id);
    expect(historyService.canUndo()).toBe(true);
  });

  it('Connect Nodes stays unavailable while fewer than two connectable Nodes exist', () => {
    expect(find('connect-nodes').available).toBe(false);

    graphService.createTextBlock('Doc', 0, 0);
    graphService.createNode('A', 300, 0);
    expect(find('connect-nodes').available).toBe(false);

    graphService.createNode('B', 600, 0);
    expect(find('connect-nodes').available).toBe(true);
  });
});

describe('PaletteEntryRegistry Canvas Lock', () => {
  let registry: PaletteEntryRegistry;
  let historyService: HistoryService;
  let canvasLock: CanvasLockService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([{ path: 'p/:projectId', component: TestRoute }])] });
    registry = TestBed.inject(PaletteEntryRegistry);
    historyService = TestBed.inject(HistoryService);
    canvasLock = TestBed.inject(CanvasLockService);
  });

  afterEach(() => {
    canvasLock.unlock({ silent: true });
  });

  function find(id: string) {
    return registry.entries().find(entry => entry.id === id)!;
  }

  it('exposes a Lock Canvas entry that toggles the lock', () => {
    expect(find('lock-canvas').label).toBe('Lock Canvas');
    expect(find('lock-canvas').category).toBe('Viewport');
    expect(find('lock-canvas').available).toBe(true);

    registry.execute('lock-canvas');
    expect(canvasLock.locked()).toBe(true);
    expect(find('unlock-canvas').label).toBe('Unlock Canvas');
    expect(find('unlock-canvas').available).toBe(true);

    registry.execute('unlock-canvas');
    expect(canvasLock.locked()).toBe(false);
  });

  it('gates mutating entries with a locked reason while locked, keeping view entries live', () => {
    const graph = TestBed.inject(GraphService);
    graph.createGroup('Tour', 0, 0);
    TestBed.inject(CollectionService).createCollection('C');
    canvasLock.lock();

    for (const id of ['undo', 'add-node', 'add-group', 'add-text-block', 'add-pin', 'connect-nodes', 'delete',
      'cut', 'copy', 'paste', 'duplicate', 'select-all', 'tidy-up', 'import-graph',
      'zoom-to-selection', 'export-selection-png', 'edit-text', 'add-reroute-point']) {
      const entry = find(id);
      expect(entry.available).toBe(false);
      expect(entry.disabledReason).toBe('Unlock the Canvas to edit');
    }

    for (const id of ['zoom-in', 'zoom-out', 'zoom-to-fit', 'present-reading-order', 'present-following-connections', 'export-png',
      'export-json', 'export-as', 'copy-json', 'copy-link', 'toggle-minimap', 'toggle-outline',
      'toggle-connection-jumps', 'toggle-pins', 'toggle-sidebar', 'save-as-project',
      'new-collection', 'import-collection', 'unlock-canvas']) {
      expect(find(id).available).toBe(true);
    }
  });

  it('refuses to execute a gated entry while locked', () => {
    const graph = TestBed.inject(GraphService);
    const node = graph.createNode('A', 0, 0);
    graph.selectNode(node.id);
    expect(registry.execute('delete')).toBe(true);

    const survivor = graph.createNode('B', 0, 0);
    graph.selectNode(survivor.id);
    canvasLock.lock();
    expect(registry.execute('delete')).toBe(false);
    expect(graph.nodes().some(n => n.id === survivor.id)).toBe(true);
    expect(historyService.canUndo()).toBe(true);
  });
});
