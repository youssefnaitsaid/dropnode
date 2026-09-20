import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { GraphService } from '../../services/graph.service';
import { HistoryService } from '../../services/history.service';
import { CanvasLockService } from '../../services/canvas-lock.service';
import { CreateNodeCommand } from '../../services/commands';
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
    document.body.innerHTML = '';
  });

  it('keeps Node styling out of the top row — it lives in the Selection Toolbar', () => {
    const node = graphService.createNode('Node', 0, 0);
    graphService.setSelection([node.id], []);
    fixture.detectChanges();

    const trigger = Array.from(fixture.nativeElement.querySelectorAll('button')).find(
      button => button.getAttribute('aria-label') === 'Node styling',
    );
    expect(trigger).toBeUndefined();
  });

  it('keeps Connection styling out of the top row — it lives in the Selection Toolbar', () => {
    const a = graphService.createNode('A', 0, 0);
    const b = graphService.createNode('B', 300, 0);
    const conn = graphService.createConnection(a.id, 'right', b.id, 'left')!;
    graphService.selectConnection(conn.id);
    fixture.detectChanges();

    const trigger = Array.from(fixture.nativeElement.querySelectorAll('button')).find(
      button => button.getAttribute('aria-label') === 'Connection styling',
    );
    expect(trigger).toBeUndefined();
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

describe('ToolbarComponent Canvas Lock', () => {
  let fixture: ComponentFixture<ToolbarComponent>;
  let graphService: GraphService;
  let historyService: HistoryService;
  let canvasLock: CanvasLockService;

  const button = (label: string) =>
    Array.from(fixture.nativeElement.querySelectorAll('button')).find(
      (item: unknown) => (item as HTMLButtonElement).getAttribute('aria-label') === label,
    ) as HTMLButtonElement;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ToolbarComponent],
      providers: [provideRouter([])],
    });
    fixture = TestBed.createComponent(ToolbarComponent);
    fixture.componentRef.setInput('scratchMode', true);
    graphService = TestBed.inject(GraphService);
    historyService = TestBed.inject(HistoryService);
    canvasLock = TestBed.inject(CanvasLockService);
    fixture.detectChanges();
  });

  afterEach(() => {
    canvasLock.unlock({ silent: true });
    document.body.innerHTML = '';
  });

  it('toggles Canvas Lock from the right-cluster button with pressed state', () => {
    const toggle = button('Lock canvas');
    expect(toggle).toBeTruthy();
    expect(toggle.getAttribute('aria-pressed')).toBe('false');

    toggle.click();
    fixture.detectChanges();
    expect(canvasLock.locked()).toBe(true);

    const unlock = button('Unlock canvas');
    expect(unlock.getAttribute('aria-pressed')).toBe('true');
    unlock.click();
    fixture.detectChanges();
    expect(canvasLock.locked()).toBe(false);
  });

  it('disables Tidy up and Import while locked (Undo/Redo live in the floating bar)', () => {
    historyService.execute(new CreateNodeCommand(graphService, 'N', 0, 0));
    fixture.detectChanges();
    // Undo/Redo left the top row for the floating Selection Actions Bar.
    expect(button('Undo')).toBeUndefined();
    expect(button('Redo')).toBeUndefined();

    canvasLock.lock();
    fixture.detectChanges();

    expect(button('Tidy up').disabled).toBe(true);
    expect(button('Tidy up').title).toContain('Unlock');
    expect(button('Import').disabled).toBe(true);

    canvasLock.unlock();
    fixture.detectChanges();
    expect(button('Tidy up').disabled).toBe(false);
    expect(button('Import').disabled).toBe(false);
  });

  it('keeps zoom controls and Present live while locked', () => {
    graphService.createGroup('Tour', 0, 0);
    canvasLock.lock();
    fixture.detectChanges();

    expect(button('Zoom in').disabled).toBe(false);
    expect(button('Zoom to fit').disabled).toBe(false);
    expect(button('Present').disabled).toBe(false);
  });

  it('offers both Present orders from one control behind the same gate', async () => {
    expect(button('Present').disabled).toBe(true);
    expect(button('Present').title).toContain('Group nodes');

    graphService.createGroup('Tour', 0, 0);
    fixture.detectChanges();
    const trigger = button('Present');
    expect(trigger.disabled).toBe(false);

    trigger.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const menuButtons = Array.from(document.body.querySelectorAll('button')).map(
      item => (item as HTMLButtonElement).textContent?.trim(),
    );
    expect(menuButtons).toContain('Present in reading order');
    expect(menuButtons).toContain('Present following Connections');
  });
});
