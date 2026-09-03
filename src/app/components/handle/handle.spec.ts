import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HandleComponent } from './handle';
import { GraphService } from '../../services/graph.service';
import { KeyboardConnectionService } from '../../services/keyboard-connection.service';
import { ToastService } from '../toast/toast';
import { PresentationService } from '../../services/presentation.service';
import { CanvasLockService } from '../../services/canvas-lock.service';

describe('HandleComponent keyboard Connection flow', () => {
  let fixture: ComponentFixture<HandleComponent>;
  let component: HandleComponent;
  let graphService: GraphService;
  let keyboardConnection: KeyboardConnectionService;
  let toastService: ToastService;
  let presentationService: PresentationService;
  let canvasLock: CanvasLockService;

  const handleEl = () => fixture.nativeElement.querySelector('.handle') as HTMLElement;

  function enter(el: HTMLElement): void {
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HandleComponent] });
    fixture = TestBed.createComponent(HandleComponent);
    component = fixture.componentInstance;
    graphService = TestBed.inject(GraphService);
    keyboardConnection = TestBed.inject(KeyboardConnectionService);
    toastService = TestBed.inject(ToastService);
    presentationService = TestBed.inject(PresentationService);
    canvasLock = TestBed.inject(CanvasLockService);
    fixture.componentRef.setInput('nodeId', 'n1');
    fixture.componentRef.setInput('side', 'right');
    fixture.detectChanges();
  });

  afterEach(() => {
    keyboardConnection.cancel();
    keyboardConnection.setFocusedHandle(null);
  });

  it('is a labeled, focusable button', () => {
    graphService.createNode('Source', 0, 0);
    fixture.componentRef.setInput('nodeId', graphService.nodes()[0].id);
    fixture.detectChanges();

    expect(handleEl().getAttribute('tabindex')).toBe('0');
    expect(handleEl().getAttribute('role')).toBe('button');
    expect(handleEl().getAttribute('aria-label')).toBe('Connect from Source');
    expect(handleEl().getAttribute('data-handle')).toBe(`${graphService.nodes()[0].id}:right`);
  });

  it('arms a pending Connection from Enter', () => {
    enter(handleEl());
    expect(keyboardConnection.pending()).toEqual({ sourceNodeId: 'n1', sourceHandle: 'right' });
  });

  it('commits the pending Connection from Enter on the target Handle', () => {
    const source = graphService.createNode('A', 0, 0);
    const target = graphService.createNode('B', 320, 0);
    fixture.componentRef.setInput('nodeId', source.id);
    fixture.detectChanges();
    enter(handleEl());

    fixture.componentRef.setInput('nodeId', target.id);
    fixture.componentRef.setInput('side', 'left');
    fixture.detectChanges();
    enter(handleEl());

    const connections = graphService.connections();
    expect(connections).toHaveLength(1);
    expect(connections[0].sourceNodeId).toBe(source.id);
    expect(connections[0].targetNodeId).toBe(target.id);
    expect(keyboardConnection.pending()).toBeNull();
  });

  it('rejects a self-Connection with a toast and stays armed', () => {
    const node = graphService.createNode('A', 0, 0);
    fixture.componentRef.setInput('nodeId', node.id);
    fixture.detectChanges();
    enter(handleEl());
    enter(handleEl());

    expect(graphService.connections()).toHaveLength(0);
    expect(toastService.message()).toContain('itself');
    expect(keyboardConnection.pending()).not.toBeNull();
  });

  it('cancels the pending Connection from Escape', () => {
    enter(handleEl());
    expect(keyboardConnection.pending()).not.toBeNull();

    handleEl().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(keyboardConnection.pending()).toBeNull();
  });

  it('tracks focus for the ghost endpoint', () => {
    const node = graphService.createNode('A', 0, 0);
    fixture.componentRef.setInput('nodeId', node.id);
    fixture.detectChanges();

    handleEl().focus();
    expect(keyboardConnection.focusedHandle()).toEqual({ nodeId: node.id, handle: 'right' });

    handleEl().blur();
    expect(keyboardConnection.focusedHandle()).toBeNull();
  });

  it('does nothing in Present Mode', () => {
    const node = graphService.createNode('A', 0, 0);
    fixture.componentRef.setInput('nodeId', node.id);
    fixture.detectChanges();

    presentationService.active.set(true);
    enter(handleEl());
    expect(keyboardConnection.pending()).toBeNull();
    presentationService.active.set(false);
  });

  it('does nothing while Canvas Lock is active', () => {
    const node = graphService.createNode('A', 0, 0);
    fixture.componentRef.setInput('nodeId', node.id);
    fixture.detectChanges();

    canvasLock.lock();
    enter(handleEl());
    expect(keyboardConnection.pending()).toBeNull();
    canvasLock.unlock({ silent: true });
  });

  it('drops out of the tab order while Canvas Lock is active', () => {
    canvasLock.lock();
    fixture.detectChanges();
    expect(handleEl().getAttribute('tabindex')).toBeNull();
    canvasLock.unlock({ silent: true });
  });
});
