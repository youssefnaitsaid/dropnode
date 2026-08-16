import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { GraphService } from '../../services/graph.service';
import { HistoryService } from '../../services/history.service';
import { ToolbarComponent } from './toolbar';

describe('ToolbarComponent Node Shapes', () => {
  let fixture: ComponentFixture<ToolbarComponent>;
  let graphService: GraphService;
  let historyService: HistoryService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ToolbarComponent],
      providers: [provideRouter([])],
    });
    fixture = TestBed.createComponent(ToolbarComponent);
    graphService = TestBed.inject(GraphService);
    historyService = TestBed.inject(HistoryService);
    fixture.detectChanges();
  });

  it('shows four Shape controls for regular Nodes, ignores selected Groups, and undoes as one command', () => {
    const node = graphService.createNode('Node', 0, 0);
    const group = graphService.createGroup('Group', 400, 0);
    graphService.setSelection([node.id, group.id], []);
    fixture.detectChanges();

    const buttons = fixture.nativeElement.querySelectorAll('button.shape-btn');
    expect(buttons).toHaveLength(4);

    const pill = Array.from(buttons).find(
      button => (button as HTMLButtonElement).getAttribute('aria-label') === 'Pill',
    ) as HTMLButtonElement;
    pill.click();
    fixture.detectChanges();

    expect(graphService.nodes().find(item => item.id === node.id)?.shape).toBe('pill');
    expect(graphService.nodes().find(item => item.id === group.id)?.shape).toBeUndefined();
    expect(historyService.canUndo()).toBe(true);

    historyService.undo();
    expect(graphService.nodes().find(item => item.id === node.id)?.shape).toBeUndefined();
  });

  it('leaves every Shape button inactive for a mixed regular selection and hides them for Group-only selection', () => {
    const first = graphService.createNode('First', 0, 0);
    const second = graphService.createNode('Second', 300, 0);
    graphService.setNodeShape(second.id, 'ellipse');
    graphService.setSelection([first.id, second.id], []);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('button.shape-btn.active')).toHaveLength(0);

    graphService.selectNode(graphService.createGroup('Only Group', 600, 0).id);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('button.shape-btn')).toHaveLength(0);
  });
});
