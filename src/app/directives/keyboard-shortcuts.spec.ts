import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { KeyboardShortcuts } from './keyboard-shortcuts';
import { CommandPaletteService } from '../services/command-palette.service';
import { CanvasSearchService } from '../services/canvas-search.service';
import { GraphService } from '../services/graph.service';
import { HistoryService } from '../services/history.service';
import { PresentationService } from '../services/presentation.service';
import { CanvasLockService } from '../services/canvas-lock.service';
import { KeyboardConnectionService } from '../services/keyboard-connection.service';
import { ResizeModeService } from '../services/resize-mode.service';
import { CreateNodeCommand } from '../services/commands';

@Component({
  standalone: true,
  imports: [KeyboardShortcuts],
  template: '<div appKeyboardShortcuts></div>',
})
class KeyboardHost {}

describe('KeyboardShortcuts Command Palette scope', () => {
  let fixture: ComponentFixture<KeyboardHost>;
  let palette: CommandPaletteService;

  beforeEach(() => {
    document.body.innerHTML = '';
    TestBed.configureTestingModule({
      imports: [KeyboardHost],
      providers: [provideRouter([])],
    });
    fixture = TestBed.createComponent(KeyboardHost);
    palette = TestBed.inject(CommandPaletteService);
    fixture.detectChanges();
  });

  afterEach(() => {
    palette.close(false);
    document.body.innerHTML = '';
  });

  function ctrlK(target: EventTarget = document.body): void {
    target.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'k',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    }));
  }

  it('opens and toggles with Ctrl+K', () => {
    ctrlK();
    expect(palette.isOpen()).toBe(true);
    ctrlK();
    expect(palette.isOpen()).toBe(false);
  });

  it('ignores Ctrl+K from text inputs', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    ctrlK(input);
    expect(palette.isOpen()).toBe(false);
  });

  it('does not stack over an existing modal', () => {
    const modal = document.createElement('div');
    modal.setAttribute('role', 'dialog');
    document.body.appendChild(modal);
    ctrlK();
    expect(palette.isOpen()).toBe(false);
  });

  it('does not stack over an open menu or picker', () => {
    const menu = document.createElement('div');
    menu.setAttribute('role', 'menu');
    document.body.appendChild(menu);
    ctrlK();
    expect(palette.isOpen()).toBe(false);
  });

  it('does not open during Present Mode', () => {
    const graph = TestBed.inject(GraphService);
    const presentation = TestBed.inject(PresentationService);
    graph.createGroup('Tour', 0, 0);
    presentation.enter(800, 600);

    ctrlK();
    expect(palette.isOpen()).toBe(false);
    presentation.exit();
  });
});

describe('KeyboardShortcuts Canvas Search scope', () => {
  let fixture: ComponentFixture<KeyboardHost>;
  let search: CanvasSearchService;
  let palette: CommandPaletteService;

  beforeEach(() => {
    document.body.innerHTML = '';
    TestBed.configureTestingModule({
      imports: [KeyboardHost],
      providers: [provideRouter([])],
    });
    fixture = TestBed.createComponent(KeyboardHost);
    search = TestBed.inject(CanvasSearchService);
    palette = TestBed.inject(CommandPaletteService);
    fixture.detectChanges();
  });

  afterEach(() => {
    search.close(false);
    palette.close(false);
    document.body.innerHTML = '';
  });

  function ctrlF(target: EventTarget = document.body): void {
    target.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'f',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    }));
  }

  it('opens with Ctrl+F', () => {
    ctrlF();
    expect(search.isOpen()).toBe(true);
  });

  it('ignores Ctrl+F from text inputs (browser find stays)', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    ctrlF(input);
    expect(search.isOpen()).toBe(false);
  });

  it('does not open during Present Mode', () => {
    const graph = TestBed.inject(GraphService);
    const presentation = TestBed.inject(PresentationService);
    graph.createGroup('Tour', 0, 0);
    presentation.enter(800, 600);

    ctrlF();
    expect(search.isOpen()).toBe(false);
    presentation.exit();
  });

  it('stays available while Canvas Lock is active', () => {
    TestBed.inject(CanvasLockService).lock();

    ctrlF();
    expect(search.isOpen()).toBe(true);
  });

  it('does not stack over the open Command Palette', () => {
    palette.open(null);

    ctrlF();
    expect(search.isOpen()).toBe(false);
  });
});

describe('KeyboardShortcuts Connection cycle and pending flow', () => {
  let fixture: ComponentFixture<KeyboardHost>;
  let graphService: GraphService;
  let keyboardConnection: KeyboardConnectionService;

  beforeEach(() => {
    document.body.innerHTML = '';
    TestBed.configureTestingModule({
      imports: [KeyboardHost],
      providers: [provideRouter([])],
    });
    fixture = TestBed.createComponent(KeyboardHost);
    graphService = TestBed.inject(GraphService);
    keyboardConnection = TestBed.inject(KeyboardConnectionService);
    fixture.detectChanges();
  });

  afterEach(() => {
    keyboardConnection.cancel();
    document.body.innerHTML = '';
  });

  /** A real Connection in the graph plus its focusable hit path in the DOM. */
  function addConnection(): { connectionId: string; hit: SVGPathElement } {
    const a = graphService.createNode('A', 0, 0);
    const b = graphService.createNode('B', 320, 0);
    const connection = graphService.createConnection(a.id, 'right', b.id, 'left')!;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('class', 'connection-hit');
    path.setAttribute('data-connection-id', connection.id);
    path.setAttribute('tabindex', '0');
    document.body.appendChild(path);
    return { connectionId: connection.id, hit: path };
  }

  function addHandle(nodeId: string): HTMLElement {
    const div = document.createElement('div');
    div.setAttribute('data-handle', nodeId);
    div.setAttribute('tabindex', '0');
    document.body.appendChild(div);
    return div;
  }

  function key(keyName: string, init: KeyboardEventInit = {}): void {
    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: keyName,
      bubbles: true,
      cancelable: true,
      ...init,
    }));
  }

  it('selects and focuses a Connection from ] and cycles back with [', () => {
    const first = addConnection();
    const second = addConnection();

    key(']');
    expect(graphService.selectedConnectionIds()).toEqual([first.connectionId]);
    expect(document.activeElement).toBe(first.hit);

    key(']');
    expect(graphService.selectedConnectionIds()).toEqual([second.connectionId]);
    expect(document.activeElement).toBe(second.hit);

    key('[');
    expect(graphService.selectedConnectionIds()).toEqual([first.connectionId]);
    expect(document.activeElement).toBe(first.hit);
  });

  it('extends the Selection from Shift+]', () => {
    const first = addConnection();
    const second = addConnection();

    key(']');
    key(']', { shiftKey: true });

    expect(graphService.selectedConnectionIds()).toEqual([first.connectionId, second.connectionId]);
  });

  it('is dead while a Connection is pending', () => {
    const { hit } = addConnection();
    const node = graphService.createNode('A', 0, 0);
    keyboardConnection.arm(node.id, 'right');

    key(']');

    expect(graphService.selectedConnectionIds()).toEqual([]);
    expect(document.activeElement).not.toBe(hit);
  });

  it('cancels a pending Connection from Escape without clearing Selection', () => {
    const node = graphService.createNode('A', 0, 0);
    graphService.selectNode(node.id);
    keyboardConnection.arm(node.id, 'right');

    key('Escape');

    expect(keyboardConnection.pending()).toBeNull();
    expect(graphService.selectedNodeIds()).toEqual([node.id]);
  });

  it('cycles Handles with Tab while a Connection is pending', () => {
    const first = addHandle('n1');
    const second = addHandle('n2');
    keyboardConnection.arm('n1', 'right');
    first.focus();

    key('Tab');
    expect(document.activeElement).toBe(second);

    key('Tab', { shiftKey: true });
    expect(document.activeElement).toBe(first);
  });
});

describe('KeyboardShortcuts Resize mode and Reroute Point flow', () => {
  let fixture: ComponentFixture<KeyboardHost>;
  let graphService: GraphService;
  let resizeMode: ResizeModeService;

  beforeEach(() => {
    document.body.innerHTML = '';
    TestBed.configureTestingModule({
      imports: [KeyboardHost],
      providers: [provideRouter([])],
    });
    fixture = TestBed.createComponent(KeyboardHost);
    graphService = TestBed.inject(GraphService);
    resizeMode = TestBed.inject(ResizeModeService);
    resizeMode.exit();
    fixture.detectChanges();
  });

  afterEach(() => {
    resizeMode.exit();
    document.body.innerHTML = '';
  });

  function key(keyName: string, init: KeyboardEventInit = {}): void {
    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: keyName,
      bubbles: true,
      cancelable: true,
      ...init,
    }));
  }

  function addRerouteCircle(connectionId: string, index: number): SVGCircleElement {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('class', 'reroute-point');
    circle.setAttribute('data-connection-id', connectionId);
    circle.setAttribute('data-reroute-point-index', String(index));
    circle.setAttribute('tabindex', '0');
    document.body.appendChild(circle);
    return circle;
  }

  it('Escape exits Resize mode without clearing the Selection', () => {
    const node = graphService.createNode('A', 0, 0);
    graphService.selectNode(node.id);
    resizeMode.toggle();
    expect(resizeMode.mode()).toBe(true);

    key('Escape');

    expect(resizeMode.mode()).toBe(false);
    expect(graphService.selectedNodeIds()).toEqual([node.id]);
  });

  it('Tab cycles the selected Connection\'s Reroute Points', () => {
    const first = addRerouteCircle('conn_1', 0);
    const second = addRerouteCircle('conn_1', 1);
    first.focus();

    key('Tab');
    expect(document.activeElement).toBe(second);

    key('Tab', { shiftKey: true });
    expect(document.activeElement).toBe(first);
  });

  it('Delete removes the focused Reroute Point and refocuses its Connection', () => {
    const a = graphService.createNode('A', 0, 0);
    const b = graphService.createNode('B', 320, 0);
    const conn = graphService.createConnection(a.id, 'right', b.id, 'left')!;
    graphService.setConnectionReroutePoints(conn.id, [{ x: 100, y: 40 }, { x: 200, y: 60 }]);
    const hit = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    hit.setAttribute('class', 'connection-hit');
    hit.setAttribute('data-connection-id', conn.id);
    hit.setAttribute('tabindex', '0');
    document.body.appendChild(hit);
    const circle = addRerouteCircle(conn.id, 1);
    circle.focus();

    key('Delete');

    expect(graphService.connections()[0].reroutePoints).toHaveLength(1);
    expect(document.activeElement).toBe(hit);
  });

  it('pans the Viewport from arrows when nothing is focused, fine-panning with Shift', () => {
    graphService.createNode('A', 0, 0);
    document.body.focus();

    key('ArrowRight');
    key('ArrowDown');
    key('ArrowLeft', { shiftKey: true });

    const viewport = graphService.viewportState();
    expect(viewport.panX).toBe(40 - 10);
    expect(viewport.panY).toBe(40);
  });

  it('leaves arrows to the focused element when it is not the Canvas', () => {
    graphService.createNode('A', 0, 0);
    const card = document.createElement('div');
    card.setAttribute('data-node-id', 'n1');
    card.setAttribute('tabindex', '0');
    document.body.appendChild(card);
    card.focus();

    key('ArrowRight');

    expect(graphService.viewportState().panX).toBe(0);
    card.remove();
  });
});

describe('KeyboardShortcuts Canvas Lock scope', () => {
  let fixture: ComponentFixture<KeyboardHost>;
  let graphService: GraphService;
  let historyService: HistoryService;
  let lock: CanvasLockService;
  let palette: CommandPaletteService;

  beforeEach(() => {
    document.body.innerHTML = '';
    TestBed.configureTestingModule({
      imports: [KeyboardHost],
      providers: [provideRouter([])],
    });
    fixture = TestBed.createComponent(KeyboardHost);
    graphService = TestBed.inject(GraphService);
    historyService = TestBed.inject(HistoryService);
    lock = TestBed.inject(CanvasLockService);
    palette = TestBed.inject(CommandPaletteService);
    fixture.detectChanges();
  });

  afterEach(() => {
    lock.unlock({ silent: true });
    palette.close(false);
    document.body.innerHTML = '';
  });

  function key(keyName: string, init: KeyboardEventInit = {}): void {
    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: keyName,
      bubbles: true,
      cancelable: true,
      ...init,
    }));
  }

  it('opens the Palette with Ctrl+K while locked', () => {
    lock.lock();
    key('k', { ctrlKey: true });
    expect(palette.isOpen()).toBe(true);
  });

  it('leaves History untouched on Ctrl+Z while locked, resuming after unlock', () => {
    historyService.execute(new CreateNodeCommand(graphService, 'N', 0, 0));
    expect(graphService.nodes()).toHaveLength(1);
    lock.lock();

    key('z', { ctrlKey: true });
    expect(graphService.nodes()).toHaveLength(1);
    expect(historyService.canUndo()).toBe(true);

    lock.unlock();
    key('z', { ctrlKey: true });
    expect(graphService.nodes()).toHaveLength(0);
  });

  it('does not select all on Ctrl+A while locked', () => {
    graphService.createNode('A', 0, 0);
    lock.lock();
    key('a', { ctrlKey: true });
    expect(graphService.selectedNodeIds()).toEqual([]);
  });

  it('does not delete the Selection on Delete while locked', () => {
    const node = graphService.createNode('A', 0, 0);
    lock.lock();
    // Selection built programmatically (gestures cannot build one while
    // locked) still cannot be deleted from the keyboard
    graphService.setSelection([node.id], []);
    key('Delete');
    expect(graphService.nodes()).toHaveLength(1);
  });

  it('does not cycle Connections on ] while locked', () => {
    const a = graphService.createNode('A', 0, 0);
    const b = graphService.createNode('B', 320, 0);
    graphService.createConnection(a.id, 'right', b.id, 'left');
    lock.lock();
    key(']');
    expect(graphService.selectedConnectionIds()).toEqual([]);
  });

  it('keeps Escape from unlocking or clearing while locked', () => {
    const node = graphService.createNode('A', 0, 0);
    lock.lock();
    graphService.setSelection([node.id], []);
    key('Escape');
    expect(lock.locked()).toBe(true);
    expect(graphService.selectedNodeIds()).toEqual([node.id]);
  });

  it('still pans the Viewport from arrows while locked', () => {
    graphService.createNode('A', 0, 0);
    lock.lock();
    document.body.focus();
    key('ArrowRight');
    expect(graphService.viewportState().panX).toBe(40);
  });
});
