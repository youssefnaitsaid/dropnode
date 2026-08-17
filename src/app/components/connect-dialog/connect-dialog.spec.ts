import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ConnectDialogComponent } from './connect-dialog';
import { GraphService } from '../../services/graph.service';
import { HistoryService } from '../../services/history.service';

describe('ConnectDialogComponent', () => {
  let fixture: ComponentFixture<ConnectDialogComponent>;
  let component: ConnectDialogComponent;
  let graphService: GraphService;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ConnectDialogComponent] });
    fixture = TestBed.createComponent(ConnectDialogComponent);
    component = fixture.componentInstance;
    graphService = TestBed.inject(GraphService);
    fixture.detectChanges();
  });

  function twoNodes() {
    const a = graphService.createNode('A', 0, 0);
    const b = graphService.createNode('B', 320, 0);
    return { a, b };
  }

  it('stays closed when fewer than two Nodes exist', () => {
    graphService.createNode('A', 0, 0);
    component.open();
    expect(component.isOpen()).toBe(false);
  });

  it('opens with the first Node as source and a different Node as target', () => {
    const { a, b } = twoNodes();
    component.open();
    expect(component.isOpen()).toBe(true);
    expect(component.sourceNodeId()).toBe(a.id);
    expect(component.targetNodeId()).toBe(b.id);
  });

  it('flags a self-Connection', () => {
    const { a } = twoNodes();
    component.open();
    component.sourceNodeId.set(a.id);
    component.targetNodeId.set(a.id);
    expect(component.error()).toContain('two different');
  });

  it('flags an existing duplicate inline', () => {
    const { a, b } = twoNodes();
    graphService.createConnection(a.id, 'right', b.id, 'left');
    component.open();
    expect(component.error()).toBe('That Connection already exists');
  });

  it('connects, closes, and commits an undoable Command', () => {
    const { a, b } = twoNodes();
    component.open();
    component.connect();

    expect(graphService.connections()).toHaveLength(1);
    expect(component.isOpen()).toBe(false);

    TestBed.inject(HistoryService).undo();
    expect(graphService.connections()).toHaveLength(0);
  });

  it('refuses to connect while an error is showing', () => {
    const { a, b } = twoNodes();
    graphService.createConnection(a.id, 'right', b.id, 'left');
    component.open();
    component.connect();

    expect(graphService.connections()).toHaveLength(1);
    expect(component.isOpen()).toBe(true);
  });
});
