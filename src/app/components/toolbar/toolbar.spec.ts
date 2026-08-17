import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { GraphService } from '../../services/graph.service';
import { HistoryService } from '../../services/history.service';
import { ToolbarComponent } from './toolbar';

describe('ToolbarComponent', () => {
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

  afterEach(() => {
    // The styling triggers open CDK overlay menus into the document body
    document.body.innerHTML = '';
  });

  it('shows one Node styling trigger and applies Shape to regular Nodes only, undoing as one command', async () => {
    const node = graphService.createNode('Node', 0, 0);
    const group = graphService.createGroup('Group', 400, 0);
    graphService.setSelection([node.id, group.id], []);
    fixture.detectChanges();

    const trigger = Array.from(fixture.nativeElement.querySelectorAll('button')).find(
      button => button.getAttribute('aria-label') === 'Node styling',
    ) as HTMLButtonElement;
    expect(trigger).toBeTruthy();

    trigger.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const pill = Array.from(document.body.querySelectorAll('button')).find(
      button => button.textContent?.trim() === 'Pill',
    ) as HTMLButtonElement;
    expect(pill).toBeTruthy();
    pill.click();
    fixture.detectChanges();

    expect(graphService.nodes().find(item => item.id === node.id)?.shape).toBe('pill');
    expect(graphService.nodes().find(item => item.id === group.id)?.shape).toBeUndefined();
    expect(historyService.canUndo()).toBe(true);

    historyService.undo();
    expect(graphService.nodes().find(item => item.id === node.id)?.shape).toBeUndefined();
  });

  it('shows no Shape check for a mixed regular selection and disables Shape items for a Group-only selection', async () => {
    const first = graphService.createNode('First', 0, 0);
    const second = graphService.createNode('Second', 300, 0);
    graphService.setNodeShape(second.id, 'ellipse');
    graphService.setSelection([first.id, second.id], []);
    fixture.detectChanges();

    // Mixed regular selection: no shared Shape, so no item can read active
    expect(fixture.componentInstance.sharedNodeShape()).toBeUndefined();

    // Group-only selection: the trigger stays (Groups take color), but the
    // Shape section is disabled and clicking does nothing
    graphService.selectNode(graphService.createGroup('Only Group', 600, 0).id);
    fixture.detectChanges();

    const trigger = Array.from(fixture.nativeElement.querySelectorAll('button')).find(
      button => button.getAttribute('aria-label') === 'Node styling',
    ) as HTMLButtonElement;
    expect(trigger).toBeTruthy();

    trigger.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const pill = Array.from(document.body.querySelectorAll('button')).find(
      button => button.textContent?.trim() === 'Pill',
    ) as HTMLButtonElement;
    expect(pill.hasAttribute('disabled')).toBe(true);

    pill.click();
    fixture.detectChanges();
    expect(historyService.canUndo()).toBe(false);
  });

  it('zooms in and out anchored on the visible Canvas center', () => {
    // No .canvas-container in the test DOM, so the anchor falls back to the
    // window size — half of innerWidth/innerHeight.
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    const zoomInButton = Array.from(fixture.nativeElement.querySelectorAll('button')).find(
      button => button.getAttribute('aria-label') === 'Zoom in',
    ) as HTMLButtonElement;
    const zoomOutButton = Array.from(fixture.nativeElement.querySelectorAll('button')).find(
      button => button.getAttribute('aria-label') === 'Zoom out',
    ) as HTMLButtonElement;

    zoomInButton.click();
    fixture.detectChanges();

    // From zoom 1 to 1.1 with the screen center fixed: pan = center - center * 1.1.
    // An origin-anchored zoom would leave pan at (0, 0).
    const zoomed = graphService.viewportState();
    expect(zoomed.zoom).toBe(1.1);
    expect(zoomed.panX).toBeCloseTo(centerX - centerX * 1.1, 10);
    expect(zoomed.panY).toBeCloseTo(centerY - centerY * 1.1, 10);

    zoomOutButton.click();
    fixture.detectChanges();

    // Reversing the step returns the Viewport to where it started.
    const restored = graphService.viewportState();
    expect(restored.zoom).toBe(1);
    expect(restored.panX).toBeCloseTo(0, 10);
    expect(restored.panY).toBeCloseTo(0, 10);
  });
});
