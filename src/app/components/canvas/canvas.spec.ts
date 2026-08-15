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
