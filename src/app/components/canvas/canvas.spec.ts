import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CanvasComponent } from './canvas';
import { GraphService } from '../../services/graph.service';
import { HistoryService } from '../../services/history.service';
import { ContextMenuService } from '../../services/context-menu.service';

describe('CanvasComponent reroute interactions', () => {
  let fixture: ComponentFixture<CanvasComponent>;
  let component: CanvasComponent;
  let graphService: GraphService;
  let historyService: HistoryService;
  let contextMenuService: ContextMenuService;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [CanvasComponent] });
    fixture = TestBed.createComponent(CanvasComponent);
    component = fixture.componentInstance;
    graphService = TestBed.inject(GraphService);
    historyService = TestBed.inject(HistoryService);
    contextMenuService = TestBed.inject(ContextMenuService);
    fixture.detectChanges();
  });

  function makeConnection() {
    const source = graphService.createNode('Source', 0, 0);
    const target = graphService.createNode('Target', 320, 0);
    const connection = graphService.createConnection(source.id, 'right', target.id, 'left')!;
    graphService.setConnectionReroutePoints(connection.id, [{ x: 160, y: 100 }]);
    graphService.selectConnection(connection.id);
    fixture.detectChanges();
    return graphService.connections()[0];
  }

  it('inserts a projected point and records marker removal as one undoable command', () => {
    const connection = makeConnection();

    component.onReroutePointAdd({ connectionId: connection.id, clientX: 240, clientY: 80 });
    const afterAdd = graphService.connections()[0].reroutePoints!;
    expect(afterAdd).toHaveLength(2);

    component.onReroutePointRemove({ connectionId: connection.id, pointIndex: 0 });
    expect(graphService.connections()[0].reroutePoints).toEqual([afterAdd[1]]);

    historyService.undo();
    expect(graphService.connections()[0].reroutePoints).toEqual(afterAdd);
    historyService.redo();
    expect(graphService.connections()[0].reroutePoints).toEqual([afterAdd[1]]);
  });

  it('uses the existing 2px threshold for transient point dragging and one final undo step', () => {
    const connection = makeConnection();
    const original = [{ x: 160, y: 100 }];

    component.onReroutePointDragStart({
      connectionId: connection.id,
      pointIndex: 0,
      event: new MouseEvent('mousedown', { button: 0, clientX: 160, clientY: 100 }),
    });
    component.onMouseMove(new MouseEvent('mousemove', { clientX: 161, clientY: 101 }));
    expect(graphService.connections()[0].reroutePoints).toEqual(original);
    expect(historyService.canUndo()).toBe(false);

    component.onMouseMove(new MouseEvent('mousemove', { clientX: 180, clientY: 130 }));
    expect(graphService.connections()[0].reroutePoints).toEqual([{ x: 180, y: 130 }]);
    expect(historyService.canUndo()).toBe(false);

    component.onMouseUp(new MouseEvent('mouseup', { clientX: 180, clientY: 130 }));
    expect(historyService.canUndo()).toBe(true);
    historyService.undo();
    expect(graphService.connections()[0].reroutePoints).toEqual(original);
    historyService.redo();
    expect(graphService.connections()[0].reroutePoints).toEqual([{ x: 180, y: 130 }]);
  });

  it('bubbles a marker context menu to the parent Connection target', () => {
    const connection = makeConnection();
    const marker = fixture.nativeElement.querySelector('.reroute-point') as SVGCircleElement;

    marker.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        clientX: 160,
        clientY: 100,
      }),
    );

    expect(contextMenuService.menuKind()).toBe('connection');
    expect(graphService.selectedConnectionId()).toBe(connection.id);
  });

  it('routes plain and Ctrl Connection selection through the parent selection rules', () => {
    const connection = makeConnection();

    component.onConnectionSelect({ connectionId: connection.id, additive: false });
    expect(graphService.selectedConnectionId()).toBe(connection.id);

    component.onConnectionSelect({ connectionId: connection.id, additive: true });
    expect(graphService.selectedConnectionId()).toBeNull();
  });
});

describe('CanvasComponent keyboard node moves', () => {
  let fixture: ComponentFixture<CanvasComponent>;
  let component: CanvasComponent;
  let graphService: GraphService;
  let historyService: HistoryService;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [CanvasComponent] });
    fixture = TestBed.createComponent(CanvasComponent);
    component = fixture.componentInstance;
    graphService = TestBed.inject(GraphService);
    historyService = TestBed.inject(HistoryService);
    fixture.detectChanges();
  });

  it('selects and nudges a single Node as one undoable command', () => {
    const node = graphService.createNode('N', 100, 100);
    component.onKeyboardSelect({ nodeId: node.id });
    expect(graphService.selectedNodeId()).toBe(node.id);

    component.onKeyboardMove({ nodeId: node.id, dx: 10, dy: -10 });
    expect(graphService.nodes()[0].x).toBe(110);
    expect(graphService.nodes()[0].y).toBe(90);
    expect(historyService.canUndo()).toBe(true);

    historyService.undo();
    expect(graphService.nodes()[0].x).toBe(100);
    expect(graphService.nodes()[0].y).toBe(100);
  });

  it('moves a whole multi-Selection rigidly as one compound undo step', () => {
    const a = graphService.createNode('A', 0, 0);
    const b = graphService.createNode('B', 320, 0);
    graphService.setSelection([a.id, b.id], []);

    component.onKeyboardMove({ nodeId: a.id, dx: 10, dy: 5 });
    const moved = graphService.nodes();
    expect(moved.find(n => n.id === a.id)!.x).toBe(10);
    expect(moved.find(n => n.id === a.id)!.y).toBe(5);
    expect(moved.find(n => n.id === b.id)!.x).toBe(330);
    expect(moved.find(n => n.id === b.id)!.y).toBe(5);

    historyService.undo();
    const restored = graphService.nodes();
    expect(restored.find(n => n.id === a.id)!.x).toBe(0);
    expect(restored.find(n => n.id === b.id)!.x).toBe(320);
  });

  it('nudges a Group as a single Move command with its children following', () => {
    const group = graphService.createGroup('System', 100, 100, 320, 200);
    const child = graphService.createNode('Child', 120, 120);
    graphService.setNodeParent(child.id, group.id);
    graphService.selectNode(group.id);

    component.onKeyboardMove({ nodeId: group.id, dx: 10, dy: 0 });
    const after = graphService.nodes();
    const movedGroup = after.find(n => n.id === group.id)!;
    const movedChild = after.find(n => n.id === child.id)!;
    expect(movedGroup.x).toBe(110);
    expect(movedChild.x).toBe(130);

    historyService.undo();
    const restored = graphService.nodes();
    expect(restored.find(n => n.id === group.id)!.x).toBe(100);
    expect(restored.find(n => n.id === child.id)!.x).toBe(120);
  });
});

describe('CanvasComponent touch gestures', () => {
  let fixture: ComponentFixture<CanvasComponent>;
  let component: CanvasComponent;
  let graphService: GraphService;

  function touch(container: HTMLElement, type: string, pointerId: number, x: number, y: number): void {
    container.dispatchEvent(new PointerEvent(type, {
      pointerId,
      pointerType: 'touch',
      clientX: x,
      clientY: y,
      bubbles: true,
    }));
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [CanvasComponent] });
    fixture = TestBed.createComponent(CanvasComponent);
    component = fixture.componentInstance;
    graphService = TestBed.inject(GraphService);
    fixture.detectChanges();
  });

  it('pans with one finger on empty Canvas and never arms a Marquee', () => {
    const node = graphService.createNode('N', 0, 0);
    graphService.selectNode(node.id);
    const container = fixture.nativeElement.querySelector('.canvas-container') as HTMLElement;

    touch(container, 'pointerdown', 1, 100, 100);
    expect(component['isPanning']).toBe(true);

    // The compatibility mousedown that follows a touch press must be inert,
    // and the compat mousemove must drive the pan (touch has no Space/middle
    // button, so this is the only one-finger pan path).
    component.onCanvasMouseDown(new MouseEvent('mousedown', { button: 0, clientX: 100, clientY: 100 }));
    component.onMouseMove(new MouseEvent('mousemove', { clientX: 130, clientY: 120 }));
    expect(graphService.viewportState().panX).toBe(30);
    expect(graphService.viewportState().panY).toBe(20);

    component.onMouseUp(new MouseEvent('mouseup', { clientX: 130, clientY: 120 }));
    expect(component['isPanning']).toBe(false);
    // The press was a pan, not a Marquee click — the Selection survives
    expect(graphService.selectedNodeId()).toBe(node.id);
  });

  it('pinch-zooms around the two fingers\' midpoint', () => {
    const container = fixture.nativeElement.querySelector('.canvas-container') as HTMLElement;
    expect(graphService.viewportState().zoom).toBe(1);

    touch(container, 'pointerdown', 1, 100, 100);
    touch(container, 'pointerdown', 2, 200, 100); // start: dist 100, zoom 1
    touch(container, 'pointermove', 1, 50, 100);  // dist 150 → ratio 1.5

    const vp = graphService.viewportState();
    expect(vp.zoom).toBeCloseTo(1.5);
    // The screen-space midpoint (125, 100) stays anchored: a canvas point at
    // 125 pre-zoom maps to the same screen point post-zoom.
    expect(vp.panX).toBeCloseTo(125 - (125 - 0) * 1.5);

    touch(container, 'pointerup', 1, 50, 100);
    touch(container, 'pointerup', 2, 200, 100);
    expect(component['touchPointers'].size).toBe(0);
    expect(component['touchPanPointerId']).toBeNull();
  });

  it('leaves a press on a Node to its own drag instead of starting a pan', () => {
    graphService.createNode('N', 0, 0);
    fixture.detectChanges();
    const card = fixture.nativeElement.querySelector('[data-node-id]') as HTMLElement;

    touch(card, 'pointerdown', 1, 5, 5);
    expect(component['isPanning']).toBe(false);
    expect(component['touchPointers'].size).toBe(0);
  });
});

describe('CanvasComponent keyboard context menu', () => {
  let fixture: ComponentFixture<CanvasComponent>;
  let component: CanvasComponent;
  let graphService: GraphService;
  let contextMenuService: ContextMenuService;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [CanvasComponent] });
    fixture = TestBed.createComponent(CanvasComponent);
    component = fixture.componentInstance;
    graphService = TestBed.inject(GraphService);
    contextMenuService = TestBed.inject(ContextMenuService);
    fixture.detectChanges();
  });

  it('opens the empty-Canvas menu from Shift+F10 with nothing focused or selected', () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true }));
    expect(contextMenuService.menuKind()).toBe('canvas');
  });

  it('opens the Node menu from Shift+F10 when a Node card is focused', () => {
    const node = graphService.createNode('N', 0, 0);
    fixture.detectChanges();
    const card = fixture.nativeElement.querySelector('[data-node-id]') as HTMLElement;
    card.focus();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true }));
    expect(contextMenuService.menuKind()).toBe('node');
  });

  it('opens the Connection menu from Shift+F10 when a Connection is focused', () => {
    const source = graphService.createNode('A', 0, 0);
    const target = graphService.createNode('B', 320, 0);
    const connection = graphService.createConnection(source.id, 'right', target.id, 'left')!;
    fixture.detectChanges();
    const hit = fixture.nativeElement.querySelector('.connection-hit') as SVGPathElement;
    hit.focus();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true }));

    expect(contextMenuService.menuKind()).toBe('connection');
    expect(graphService.isConnectionSelected(connection.id)).toBe(true);
  });

  it('opens the Connection menu from Shift+F10 when a Reroute Point is focused', () => {
    const source = graphService.createNode('A', 0, 0);
    const target = graphService.createNode('B', 320, 0);
    const connection = graphService.createConnection(source.id, 'right', target.id, 'left')!;
    graphService.setConnectionReroutePoints(connection.id, [{ x: 160, y: 100 }]);
    graphService.selectConnection(connection.id);
    fixture.detectChanges();
    const point = fixture.nativeElement.querySelector('.reroute-point') as SVGCircleElement;
    point.focus();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true }));

    expect(contextMenuService.menuKind()).toBe('connection');
  });

  it('ignores Shift+F10 while focus is in an input', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    // Dispatch on the input so the keydown bubbles to document with the real
    // event.target, mirroring how a typed key actually reaches the listener.
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true }));
    expect(contextMenuService.menuKind()).toBeNull();

    input.remove();
  });
});
