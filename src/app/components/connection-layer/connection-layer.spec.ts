import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ConnectionLayerComponent } from './connection-layer';
import { GraphService } from '../../services/graph.service';
import { HistoryService } from '../../services/history.service';
import { PresentationService } from '../../services/presentation.service';
import { KeyboardConnectionService } from '../../services/keyboard-connection.service';
import { textFromString } from '../../models/text';

describe('ConnectionLayerComponent reroute interactions', () => {
  let fixture: ComponentFixture<ConnectionLayerComponent>;
  let component: ConnectionLayerComponent;
  let graphService: GraphService;
  let presentationService: PresentationService;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ConnectionLayerComponent] });
    fixture = TestBed.createComponent(ConnectionLayerComponent);
    component = fixture.componentInstance;
    graphService = TestBed.inject(GraphService);
    presentationService = TestBed.inject(PresentationService);
    fixture.detectChanges();
  });

  function makeConnection(withText = false) {
    const source = graphService.createNode('Source', 0, 0);
    const target = graphService.createNode('Target', 320, 0);
    const connection = graphService.createConnection(source.id, 'right', target.id, 'left')!;
    if (withText) graphService.setConnectionText(connection.id, textFromString('route label'));
    graphService.setConnectionReroutePoints(connection.id, [{ x: 160, y: 100 }]);
    fixture.detectChanges();
    return graphService.connections()[0];
  }

  it('shows Reroute Point markers only for a selected Connection', () => {
    const connection = makeConnection();

    expect(fixture.nativeElement.querySelectorAll('.reroute-point')).toHaveLength(0);

    graphService.selectConnection(connection.id);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.reroute-point')).toHaveLength(1);

    graphService.clearSelection();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.reroute-point')).toHaveLength(0);

    presentationService.active.set(true);
    graphService.selectConnection(connection.id);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.reroute-point')).toHaveLength(0);
  });

  it('adds a point from a curve double-click and removes a marker from a marker double-click', () => {
    const connection = makeConnection();
    const add = vi.fn();
    const remove = vi.fn();
    component.reroutePointAdd.subscribe(add);
    component.reroutePointRemove.subscribe(remove);

    component.onConnectionCurveDoubleClick(
      connection,
      new MouseEvent('dblclick', { clientX: 210, clientY: 120 }),
    );
    component.onReroutePointDoubleClick(
      connection,
      0,
      new MouseEvent('dblclick', { clientX: 160, clientY: 100 }),
    );

    expect(add).toHaveBeenCalledWith({ connectionId: connection.id, clientX: 210, clientY: 120 });
    expect(remove).toHaveBeenCalledWith({ connectionId: connection.id, pointIndex: 0 });
  });

  it('selects the parent Connection and starts a plain marker drag, while Ctrl+click only toggles', () => {
    const connection = makeConnection();
    const select = vi.fn();
    const dragStart = vi.fn();
    component.connectionSelect.subscribe(select);
    component.reroutePointDragStart.subscribe(dragStart);

    component.onReroutePointMouseDown(
      connection,
      0,
      new MouseEvent('mousedown', { button: 0, clientX: 160, clientY: 100 }),
    );
    component.onReroutePointMouseDown(
      connection,
      0,
      new MouseEvent('mousedown', { button: 0, ctrlKey: true, clientX: 160, clientY: 100 }),
    );

    expect(select).toHaveBeenNthCalledWith(1, { connectionId: connection.id, additive: false });
    expect(select).toHaveBeenNthCalledWith(2, { connectionId: connection.id, additive: true });
    expect(dragStart).toHaveBeenCalledTimes(1);
  });

  it('keeps Text-card double-click editing distinct from curve double-click insertion', () => {
    const connection = makeConnection(true);
    const card = fixture.nativeElement.querySelector('.connection-text-card') as HTMLElement;

    card.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    fixture.detectChanges();

    expect(component.editingConnectionId()).toBe(connection.id);
    expect(fixture.nativeElement.querySelector('.connection-text-card.editing')).not.toBeNull();
  });
});

describe('ConnectionLayerComponent keyboard Connection flow', () => {
  let fixture: ComponentFixture<ConnectionLayerComponent>;
  let component: ConnectionLayerComponent;
  let graphService: GraphService;
  let keyboardConnection: KeyboardConnectionService;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ConnectionLayerComponent] });
    fixture = TestBed.createComponent(ConnectionLayerComponent);
    component = fixture.componentInstance;
    graphService = TestBed.inject(GraphService);
    keyboardConnection = TestBed.inject(KeyboardConnectionService);
    fixture.detectChanges();
  });

  afterEach(() => {
    keyboardConnection.cancel();
    keyboardConnection.setFocusedHandle(null);
  });

  function makeConnection() {
    const source = graphService.createNode('Source', 0, 0);
    const target = graphService.createNode('Target', 320, 0);
    const connection = graphService.createConnection(source.id, 'right', target.id, 'left')!;
    fixture.detectChanges();
    return connection;
  }

  it('renders a focusable, labeled Connection hit path', () => {
    const connection = makeConnection();
    const hit = fixture.nativeElement.querySelector('.connection-hit') as SVGPathElement;

    expect(hit.getAttribute('tabindex')).toBe('0');
    expect(hit.getAttribute('role')).toBe('button');
    expect(hit.getAttribute('aria-label')).toBe('Connection from Source to Target');
    expect(hit.getAttribute('data-connection-id')).toBe(connection.id);
  });

  it('selects from Enter and toggles from Shift+Enter', () => {
    const connection = makeConnection();
    const select = vi.fn();
    component.connectionSelect.subscribe(select);

    component.onConnectionKeydown(connection, new KeyboardEvent('keydown', { key: 'Enter' }));
    component.onConnectionKeydown(connection, new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true }));

    expect(select).toHaveBeenNthCalledWith(1, { connectionId: connection.id, additive: false });
    expect(select).toHaveBeenNthCalledWith(2, { connectionId: connection.id, additive: true });
  });

  it('draws the ghost from the armed Handle to the focused Handle', () => {
    const source = graphService.createNode('A', 0, 0);
    const target = graphService.createNode('B', 320, 0);
    fixture.detectChanges();

    keyboardConnection.arm(source.id, 'right');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.connection-ghost')).not.toBeNull();

    keyboardConnection.setFocusedHandle({ nodeId: target.id, handle: 'left' });
    const ghost = component.getGhostPath();
    // The ghost must reach the target Handle's anchor (0,0 node at 320,0)
    expect(ghost).toContain('320');
  });

  it('collapses the ghost at the source when nothing is focused yet', () => {
    const source = graphService.createNode('A', 0, 0);
    fixture.detectChanges();

    keyboardConnection.arm(source.id, 'right');
    const ghost = component.getGhostPath();
    expect(ghost).not.toContain('320');
  });

  it('renders a focusable, labeled Reroute Point', () => {
    const connection = makeConnection();
    graphService.setConnectionReroutePoints(connection.id, [{ x: 160, y: 100 }]);
    graphService.selectConnection(connection.id);
    fixture.detectChanges();

    const point = fixture.nativeElement.querySelector('.reroute-point') as SVGCircleElement;
    expect(point.getAttribute('tabindex')).toBe('0');
    expect(point.getAttribute('role')).toBe('button');
    expect(point.getAttribute('aria-label')).toBe('Reroute point 1 of 1');
  });

  it('moves a Reroute Point from arrows as an undoable Command', () => {
    const connection = makeConnection();
    graphService.setConnectionReroutePoints(connection.id, [{ x: 160, y: 100 }]);
    graphService.selectConnection(connection.id);
    fixture.detectChanges();
    const history = TestBed.inject(HistoryService);

    // Re-read the live Connection — setConnectionReroutePoints replaces the
    // object in the array, so the captured snapshot has no points
    const live = graphService.connections()[0];

    component.onReroutePointKeydown(live, 0, new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(graphService.connections()[0].reroutePoints![0].x).toBe(170);

    history.undo();
    expect(graphService.connections()[0].reroutePoints![0].x).toBe(160);
  });
});
