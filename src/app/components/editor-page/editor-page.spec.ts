import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { EditorPageComponent } from './editor-page';
import { GraphService } from '../../services/graph.service';
import { CollectionService } from '../../services/collection.service';
import { CanvasLockService } from '../../services/canvas-lock.service';
import { HistoryService } from '../../services/history.service';
import { OutlineService } from '../../services/outline.service';
import { ToastService } from '../toast/toast';

describe('EditorPageComponent', () => {
  let fixture: ComponentFixture<EditorPageComponent>;
  let graphService: GraphService;
  let collectionService: CollectionService;
  let zoomToFit: ReturnType<typeof vi.spyOn>;
  let setViewport: ReturnType<typeof vi.spyOn>;

  const storedGraph = () => ({
    nodes: [{ id: 'node_1', label: 'Stored', x: 2400, y: 1800, width: 160, height: 48 }],
    connections: [],
  });

  /** Lets the async ?data load land, then the deferred frame run. */
  const flushLoadAndFrame = async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
    await new Promise(requestAnimationFrame);
  };

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [EditorPageComponent],
      providers: [provideRouter([])],
    });
    graphService = TestBed.inject(GraphService);
    collectionService = TestBed.inject(CollectionService);
    zoomToFit = vi.spyOn(graphService, 'zoomToFit').mockImplementation(() => {});
    setViewport = vi.spyOn(graphService, 'setViewport');
  });

  afterEach(() => {
    fixture?.destroy();
  });

  it('opens a loaded Project framed with Zoom to Fit instead of its remembered Viewport', async () => {
    const col = collectionService.createCollection('C');
    const proj = collectionService.createProject(col.id, 'P', storedGraph());

    fixture = TestBed.createComponent(EditorPageComponent);
    fixture.componentRef.setInput('projectId', proj.id);
    fixture.detectChanges();
    await flushLoadAndFrame();

    expect(graphService.nodes().length).toBe(1);
    expect(zoomToFit).toHaveBeenCalledTimes(1);
    expect(setViewport).not.toHaveBeenCalled();
  });

  it('re-frames when switching Projects on the same route', async () => {
    const col = collectionService.createCollection('C');
    const proj1 = collectionService.createProject(col.id, 'P1', storedGraph());
    const proj2 = collectionService.createProject(col.id, 'P2', storedGraph());

    fixture = TestBed.createComponent(EditorPageComponent);
    fixture.componentRef.setInput('projectId', proj1.id);
    fixture.detectChanges();
    await flushLoadAndFrame();
    fixture.componentRef.setInput('projectId', proj2.id);
    fixture.detectChanges();
    await flushLoadAndFrame();

    expect(zoomToFit).toHaveBeenCalledTimes(2);
  });

  it('opens the stashed Scratch snapshot framed, not at its remembered Viewport', async () => {
    collectionService.stashScratch(storedGraph(), { panX: -2000, panY: -2000, zoom: 2 });

    fixture = TestBed.createComponent(EditorPageComponent);
    fixture.detectChanges();
    await flushLoadAndFrame();

    expect(graphService.nodes().length).toBe(1);
    expect(zoomToFit).toHaveBeenCalledTimes(1);
    expect(setViewport).not.toHaveBeenCalled();
  });

  it('leaves an empty Scratch Canvas at the default Viewport without framing', async () => {
    const resetViewport = vi.spyOn(graphService, 'resetViewport');

    fixture = TestBed.createComponent(EditorPageComponent);
    fixture.detectChanges();
    await flushLoadAndFrame();

    expect(zoomToFit).not.toHaveBeenCalled();
    expect(resetViewport).toHaveBeenCalled();
  });

  it('lands unlocked (silently) when switching Projects', async () => {
    const col = collectionService.createCollection('C');
    const proj1 = collectionService.createProject(col.id, 'P1', storedGraph());
    const proj2 = collectionService.createProject(col.id, 'P2', storedGraph());
    const canvasLock = TestBed.inject(CanvasLockService);
    const toast = TestBed.inject(ToastService);

    fixture = TestBed.createComponent(EditorPageComponent);
    fixture.componentRef.setInput('projectId', proj1.id);
    fixture.detectChanges();
    await flushLoadAndFrame();

    canvasLock.lock();
    toast.dismiss();
    fixture.componentRef.setInput('projectId', proj2.id);
    fixture.detectChanges();
    await flushLoadAndFrame();

    expect(canvasLock.locked()).toBe(false);
    expect(toast.message()).toBeNull();
  });

  it('mounts the Outline once the graph is non-empty and unmounts it on toggle', async () => {
    fixture = TestBed.createComponent(EditorPageComponent);
    fixture.detectChanges();
    await flushLoadAndFrame();
    expect(fixture.nativeElement.querySelector('app-outline')).toBeNull();

    graphService.createNode('Todo', 0, 0);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-outline')).not.toBeNull();

    TestBed.inject(OutlineService).toggle();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-outline')).toBeNull();
  });

  it('mounts the History Panel once History exists and hides it when empty', async () => {
    fixture = TestBed.createComponent(EditorPageComponent);
    fixture.detectChanges();
    await flushLoadAndFrame();
    expect(fixture.nativeElement.querySelector('app-history-panel')).toBeNull();

    TestBed.inject(HistoryService).execute({ description: 'Do', execute: () => {}, undo: () => {} });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-history-panel')).not.toBeNull();
  });
});
