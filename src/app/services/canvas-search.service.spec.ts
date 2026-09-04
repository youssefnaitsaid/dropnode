import { TestBed } from '@angular/core/testing';
import { CanvasSearchService, CANVAS_SEARCH_MAX_ROWS } from './canvas-search.service';
import { GraphService } from './graph.service';
import { PresentationService } from './presentation.service';
import { CanvasLockService } from './canvas-lock.service';
import { CommandPaletteService } from './command-palette.service';
import { ContextMenuService } from './context-menu.service';
import { PinVisibilityService } from './pin-visibility.service';
import { HistoryService } from './history.service';
import { textFromString } from '../models/text';

describe('CanvasSearchService', () => {
  let search: CanvasSearchService;
  let graph: GraphService;
  let presentation: PresentationService;
  let canvasLock: CanvasLockService;
  let palette: CommandPaletteService;
  let contextMenu: ContextMenuService;
  let pinVisibility: PinVisibilityService;
  let history: HistoryService;

  beforeEach(() => {
    document.body.innerHTML = '';
    TestBed.configureTestingModule({});
    search = TestBed.inject(CanvasSearchService);
    graph = TestBed.inject(GraphService);
    presentation = TestBed.inject(PresentationService);
    canvasLock = TestBed.inject(CanvasLockService);
    palette = TestBed.inject(CommandPaletteService);
    contextMenu = TestBed.inject(ContextMenuService);
    pinVisibility = TestBed.inject(PinVisibilityService);
    history = TestBed.inject(HistoryService);
    canvasLock.unlock({ silent: true });
  });

  afterEach(() => {
    search.close(false);
    palette.close(false);
    document.body.innerHTML = '';
  });

  it('starts closed with an empty query and no results', () => {
    expect(search.isOpen()).toBe(false);
    expect(search.query()).toBe('');
    expect(search.results()).toEqual([]);
  });

  it('opens and closes, resetting the query each time it opens', () => {
    search.setQuery('stale');
    search.open(null);
    expect(search.isOpen()).toBe(true);
    expect(search.query()).toBe('');

    search.setQuery('todo');
    search.close(false);
    expect(search.isOpen()).toBe(false);
    search.open(null);
    expect(search.query()).toBe('');
  });

  it('refuses to open in Present Mode', () => {
    graph.createGroup('Tour', 0, 0, 400, 300);
    presentation.enter(800, 600, 'reading');
    expect(presentation.active()).toBe(true);

    search.open(null);

    expect(search.isOpen()).toBe(false);
    presentation.exit();
  });

  it('refuses to open while editing Text', () => {
    const editor = document.createElement('textarea');
    document.body.appendChild(editor);
    editor.focus();

    search.open(null);

    expect(search.isOpen()).toBe(false);
  });

  it('refuses to open while another modal owns the keyboard', () => {
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    document.body.appendChild(dialog);

    search.open(null);

    expect(search.isOpen()).toBe(false);
  });

  it('filters Nodes live as the query changes and resets the highlight', () => {
    graph.createNode('Checkout redesign', 0, 0);
    graph.createNode('Other', 500, 0);
    search.open(null);

    search.setQuery('checkout');

    expect(search.results().map(h => h.kind)).toEqual(['node']);
    expect(search.totalCount()).toBe(1);
    expect(search.activeIndex()).toBe(0);
  });

  it('excludes hidden Pins from results', () => {
    graph.createPin({ kind: 'canvas', x: 10, y: 10 }, 'Fix me');
    search.open(null);
    search.setQuery('fix');
    expect(search.totalCount()).toBe(1);

    pinVisibility.toggle();

    expect(search.totalCount()).toBe(0);
    pinVisibility.toggle();
  });

  it('caps the rendered rows and reports the overflow', () => {
    for (let i = 0; i < CANVAS_SEARCH_MAX_ROWS + 5; i++) {
      graph.createNode(`alpha ${i}`, i * 200, 0);
    }
    search.open(null);
    search.setQuery('alpha');

    expect(search.totalCount()).toBe(CANVAS_SEARCH_MAX_ROWS + 5);
    expect(search.visibleResults()).toHaveLength(CANVAS_SEARCH_MAX_ROWS);
    expect(search.hasMore()).toBe(true);
  });

  it('wraps the highlight at both ends', () => {
    graph.createNode('alpha one', 0, 0);
    graph.createNode('alpha two', 500, 0);
    search.open(null);
    search.setQuery('alpha');

    search.moveActive(-1);
    expect(search.activeIndex()).toBe(1);
    search.moveActive(1);
    expect(search.activeIndex()).toBe(0);
  });

  it('activating a Node selects it, frames it, and leaves History untouched', () => {
    const node = graph.createNode('Checkout', 0, 0, 100, 100);
    graph.createNode('Other', 900, 900, 100, 100);
    search.open(null);
    search.setQuery('checkout');
    const [hit] = search.results();

    search.activate(hit);

    expect(graph.selectedNodeIds()).toEqual([node.id]);
    expect(graph.viewportState().zoom).toBe(2);
    expect(history.canUndo()).toBe(false);
    expect(search.isOpen()).toBe(false);
  });

  it('activating a Connection selects the Connection, not a Node', () => {
    const a = graph.createNode('Cart', 0, 0);
    const b = graph.createNode('Shop', 500, 0);
    const conn = graph.createConnection(a.id, 'right', b.id, 'left')!;
    graph.setConnectionText(conn.id, textFromString('depends on'));
    search.open(null);
    search.setQuery('depends');

    search.activate(search.results()[0]);

    expect(graph.selectedConnectionIds()).toEqual([conn.id]);
    expect(graph.selectedNodeIds()).toEqual([]);
    expect(search.isOpen()).toBe(false);
  });

  it('activating a Pin clears the Selection, centers it, and opens its popover', () => {
    const node = graph.createNode('Checkout', 0, 0, 100, 100);
    graph.setSelection([node.id], []);
    const pin = graph.createPin({ kind: 'canvas', x: 600, y: 400 }, 'Fix me')!;
    const before = graph.viewportState();
    search.open(null);
    search.setQuery('fix');

    search.activate(search.results()[0]);

    expect(graph.selectedNodeIds()).toEqual([]);
    expect(graph.viewportState().zoom).toBe(before.zoom);
    expect(graph.viewportState()).not.toEqual(before);
    expect(contextMenu.pinEditRequest()).toBe(pin.id);
    expect(search.isOpen()).toBe(false);
  });

  it('in Canvas Lock activation jumps the Viewport without touching the Selection', () => {
    const node = graph.createNode('Checkout', 0, 0, 100, 100);
    canvasLock.lock();
    search.open(null);
    search.setQuery('checkout');

    search.activate(search.results()[0]);

    expect(graph.selectedNodeIds()).toEqual([]);
    expect(graph.viewportState().zoom).toBe(2);
    expect(search.isOpen()).toBe(false);
  });
});
