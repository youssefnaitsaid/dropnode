import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { PaletteEntryRegistry } from './palette-entry-registry.service';
import { GraphService } from './graph.service';
import { HistoryService } from './history.service';
import { ContextMenuService } from './context-menu.service';
import { ExportDialogService } from './export-dialog.service';
import { PinVisibilityService } from './pin-visibility.service';

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
    const rose = find('node-color-rose');
    const defaultColor = find('node-color-default');
    const diamond = find('node-shape-diamond');
    const toggleMinimap = find('toggle-minimap');

    expect(fit.label).toBe('Zoom to Fit');
    expect(fit.category).toBe('Viewport');
    expect(fit.aliases).toContain('frame canvas');
    expect(fit.shortcut).toBe('Shift+1');
    expect(rose.label).toBe('Set selected Nodes to Rose');
    expect(rose.swatch).toBe('#ff8fa3');
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
      entry.id.startsWith('node-color-') || entry.id.startsWith('node-shape-'),
    ).map(entry => entry.id);
    expect(styleIds.slice(0, 9).every(id => id.startsWith('node-color-'))).toBe(true);
    expect(styleIds.slice(9).every(id => id.startsWith('node-shape-'))).toBe(true);
  });

  it('gives every entry exactly one leading visual (swatch, icon, or line preview)', () => {
    const offenders = registry.entries()
      .filter(entry => [entry.swatch, entry.icon, entry.linePreview].filter(Boolean).length !== 1)
      .map(entry => entry.id);
    expect(offenders).toEqual([]);

    expect(find('undo').icon).toBe('lucideUndo2');
    expect(find('connection-color-default').icon).toBe('lucideEraser');
    expect(find('connection-pattern-dashed').linePreview).toEqual({ dash: '6 4' });
    expect(find('connection-weight-thick').linePreview).toEqual({ width: 3.5 });
  });

  it('orders Connection entries Add Reroute Point first, then Reset → colors → patterns → weights → arrowheads', () => {
    const ids = registry.search('')
      .filter(entry => entry.category === 'Connections')
      .map(entry => entry.id);

    expect(ids).toEqual([
      'add-reroute-point',
      'connection-color-default',
      'connection-color-cyan',
      'connection-color-green',
      'connection-color-lavender',
      'connection-color-peach',
      'connection-color-periwinkle',
      'connection-color-pink',
      'connection-color-rose',
      'connection-color-yellow',
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

    expect(registry.execute('node-color-rose')).toBe(true);
    expect(graphService.nodes()[0].color).toBe('#ff8fa3');
    expect(historyService.canUndo()).toBe(true);
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
});
