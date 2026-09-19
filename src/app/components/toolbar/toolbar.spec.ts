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

  it('shows an Emoji section and applies the pick to regular Nodes only, undoing as one command', async () => {
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

    const cells = Array.from(document.body.querySelectorAll('.emoji-cell')) as HTMLButtonElement[];
    expect(cells).toHaveLength(48);
    const idea = cells.find(button => button.getAttribute('aria-label') === 'Idea')!;
    expect(idea.getAttribute('title')).toBe('Idea');
    idea.click();
    fixture.detectChanges();

    expect(graphService.nodes().find(item => item.id === node.id)?.emoji).toBe('💡');
    expect(graphService.nodes().find(item => item.id === group.id)?.emoji).toBeUndefined();
    expect(historyService.canUndo()).toBe(true);

    historyService.undo();
    expect(graphService.nodes().find(item => item.id === node.id)?.emoji).toBeUndefined();
  });

  it('shows no Emoji check for a mixed regular selection and disables Emoji items for a Group-only selection', async () => {
    const first = graphService.createNode('First', 0, 0);
    const second = graphService.createNode('Second', 300, 0);
    graphService.setNodeEmoji(second.id, '💡');
    graphService.setSelection([first.id, second.id], []);
    fixture.detectChanges();

    // Mixed regular selection: no shared Emoji, so no item can read active
    expect(fixture.componentInstance.sharedNodeEmoji()).toBeUndefined();

    // Group-only selection: the trigger stays (Groups take color), but the
    // Emoji section is disabled with a hint and clicking does nothing
    graphService.selectNode(graphService.createGroup('Only Group', 600, 0).id);
    fixture.detectChanges();
    expect(fixture.componentInstance.sharedNodeEmoji()).toBeUndefined();

    const trigger = Array.from(fixture.nativeElement.querySelectorAll('button')).find(
      button => button.getAttribute('aria-label') === 'Node styling',
    ) as HTMLButtonElement;
    expect(trigger).toBeTruthy();

    trigger.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const label = Array.from(document.body.querySelectorAll('*')).find(
      el => el.textContent?.trim() === 'Emoji — select a regular Node first',
    );
    expect(label).toBeTruthy();
    const idea = Array.from(document.body.querySelectorAll('.emoji-cell')).find(
      button => button.getAttribute('aria-label') === 'Idea',
    ) as HTMLButtonElement;
    expect(idea.hasAttribute('disabled')).toBe(true);

    idea.click();
    fixture.detectChanges();
    expect(historyService.canUndo()).toBe(false);
  });

  it('shows a Route Style section and applies orthogonal to selected Connections, undoing as one command', async () => {
    const a = graphService.createNode('A', 0, 0);
    const b = graphService.createNode('B', 300, 0);
    const conn = graphService.createConnection(a.id, 'right', b.id, 'left')!;
    graphService.selectConnection(conn.id);
    fixture.detectChanges();

    const trigger = Array.from(fixture.nativeElement.querySelectorAll('button')).find(
      button => button.getAttribute('aria-label') === 'Connection styling',
    ) as HTMLButtonElement;
    expect(trigger).toBeTruthy();

    trigger.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const orthogonal = Array.from(document.body.querySelectorAll('button')).find(
      button => button.textContent?.trim() === 'Orthogonal',
    ) as HTMLButtonElement;
    expect(orthogonal).toBeTruthy();
    orthogonal.click();
    fixture.detectChanges();

    expect(graphService.connections()[0].routeStyle).toBe('orthogonal');
    expect(fixture.componentInstance.sharedRouteStyle()).toBe('orthogonal');
    expect(historyService.canUndo()).toBe(true);

    historyService.undo();
    expect('routeStyle' in graphService.connections()[0]).toBe(false);
  });

  it('shows a Custom section with Project hues and applies one to selected Nodes as one undo step', async () => {
    const node = graphService.createNode('Node', 0, 0);
    graphService.addCustomPaletteColor('#A1B2C3');
    graphService.setSelection([node.id], []);
    fixture.detectChanges();

    const trigger = Array.from(fixture.nativeElement.querySelectorAll('button')).find(
      button => button.getAttribute('aria-label') === 'Node styling',
    ) as HTMLButtonElement;
    trigger.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const apply = Array.from(document.body.querySelectorAll('button')).find(
      button => button.getAttribute('aria-label') === 'Apply custom hue #A1B2C3',
    ) as HTMLButtonElement;
    expect(apply).toBeTruthy();
    apply.click();
    fixture.detectChanges();

    expect(graphService.nodes().find(item => item.id === node.id)?.color).toBe('#A1B2C3');
    expect(fixture.componentInstance.sharedNodeColor()).toBe('#A1B2C3');
    expect(historyService.canUndo()).toBe(true);

    historyService.undo();
    expect(graphService.nodes().find(item => item.id === node.id)?.color).toBeUndefined();
  });

  it('adds a custom hue from the menu hex input and deletes it resetting uses to default as one undo step', async () => {
    const node = graphService.createNode('Node', 0, 0);
    graphService.setSelection([node.id], []);
    fixture.detectChanges();

    const trigger = Array.from(fixture.nativeElement.querySelectorAll('button')).find(
      button => button.getAttribute('aria-label') === 'Node styling',
    ) as HTMLButtonElement;
    trigger.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const hexInput = document.body.querySelector('input[aria-label="New custom hue hex"]') as HTMLInputElement;
    expect(hexInput).toBeTruthy();
    hexInput.value = '#a1b2c3';
    hexInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const add = Array.from(document.body.querySelectorAll('button')).find(
      button => button.getAttribute('aria-label') === 'Add custom hue',
    ) as HTMLButtonElement;
    add.click();
    fixture.detectChanges();

    expect(graphService.customPalette()).toEqual(['#A1B2C3']);

    const apply = Array.from(document.body.querySelectorAll('button')).find(
      button => button.getAttribute('aria-label') === 'Apply custom hue #A1B2C3',
    ) as HTMLButtonElement;
    apply.click();
    fixture.detectChanges();
    expect(graphService.nodes().find(item => item.id === node.id)?.color).toBe('#A1B2C3');

    // Applying closes the menu like any curated pick — reopen to manage.
    trigger.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const remove = Array.from(document.body.querySelectorAll('button')).find(
      button => button.getAttribute('aria-label') === 'Remove custom hue #A1B2C3',
    ) as HTMLButtonElement;
    expect(remove).toBeTruthy();
    remove.click();
    fixture.detectChanges();

    expect(graphService.customPalette()).toEqual([]);
    expect(graphService.nodes().find(item => item.id === node.id)?.color).toBeUndefined();
    expect(fixture.componentInstance.sharedNodeColor()).toBeNull();
    expect(historyService.canUndo()).toBe(true);

    historyService.undo();
    // Undo restores the hues but not the roster entry — re-adding re-links.
    expect(graphService.nodes().find(item => item.id === node.id)?.color).toBe('#A1B2C3');
    expect(graphService.customPalette()).toEqual([]);
  });

  it('explains invalid hex input instead of storing it', async () => {
    const node = graphService.createNode('Node', 0, 0);
    graphService.setSelection([node.id], []);
    fixture.detectChanges();

    const trigger = Array.from(fixture.nativeElement.querySelectorAll('button')).find(
      button => button.getAttribute('aria-label') === 'Node styling',
    ) as HTMLButtonElement;
    trigger.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const hexInput = document.body.querySelector('input[aria-label="New custom hue hex"]') as HTMLInputElement;
    hexInput.value = 'red';
    hexInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const add = Array.from(document.body.querySelectorAll('button')).find(
      button => button.getAttribute('aria-label') === 'Add custom hue',
    ) as HTMLButtonElement;
    add.click();
    fixture.detectChanges();

    expect(graphService.customPalette()).toEqual([]);
    const error = Array.from(document.body.querySelectorAll('*')).find(
      el => el.textContent?.trim() === 'Enter a #RRGGBB hex not already in the palette (16 max).',
    );
    expect(error).toBeTruthy();
  });

  it('shows customs in the Connection menu and applies with the shared check', async () => {
    const a = graphService.createNode('A', 0, 0);
    const b = graphService.createNode('B', 300, 0);
    const conn = graphService.createConnection(a.id, 'right', b.id, 'left')!;
    graphService.addCustomPaletteColor('#A1B2C3');
    graphService.selectConnection(conn.id);
    fixture.detectChanges();

    const trigger = Array.from(fixture.nativeElement.querySelectorAll('button')).find(
      button => button.getAttribute('aria-label') === 'Connection styling',
    ) as HTMLButtonElement;
    trigger.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const apply = Array.from(document.body.querySelectorAll('button')).find(
      button => button.getAttribute('aria-label') === 'Apply custom hue #A1B2C3',
    ) as HTMLButtonElement;
    expect(apply).toBeTruthy();
    apply.click();
    fixture.detectChanges();

    expect(graphService.connections()[0].color).toBe('#A1B2C3');
    expect(fixture.componentInstance.sharedConnectionColor()).toBe('#A1B2C3');
    expect(historyService.canUndo()).toBe(true);
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
