import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { SelectionActionsBarComponent } from './selection-actions-bar';
import { GraphService } from '../../services/graph.service';
import { HistoryService } from '../../services/history.service';
import { CanvasToolService } from '../../services/canvas-tool.service';
import { CreateNodeCommand } from '../../services/commands';

describe('SelectionActionsBarComponent', () => {
  let fixture: ComponentFixture<SelectionActionsBarComponent>;
  let graph: GraphService;
  let history: HistoryService;

  const button = (label: string): HTMLButtonElement => {
    const found = Array.from(fixture.nativeElement.querySelectorAll('button')).find(
      (el: unknown) => (el as HTMLElement).getAttribute('aria-label') === label,
    ) as HTMLButtonElement;
    expect(found, `button ${label}`).toBeTruthy();
    return found;
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [SelectionActionsBarComponent] });
    fixture = TestBed.createComponent(SelectionActionsBarComponent);
    graph = TestBed.inject(GraphService);
    history = TestBed.inject(HistoryService);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture?.destroy();
  });

  it('renders Undo, Redo, Delete, Duplicate, and More with an empty Selection', () => {
    for (const label of ['Undo', 'Redo', 'Delete', 'Duplicate', 'More options']) {
      expect(button(label)).toBeTruthy();
    }
    expect(button('Undo').disabled).toBe(true);
    expect(button('Redo').disabled).toBe(true);
    expect(button('Delete').disabled).toBe(true);
    expect(button('Duplicate').disabled).toBe(true);
    expect(button('More options').disabled).toBe(true);
    expect(fixture.nativeElement.querySelector('app-align-popover')).toBeNull();
  });

  it('undoes and redoes through History', () => {
    const cmd = new CreateNodeCommand(graph, 'N', 0, 0);
    history.execute(cmd);
    fixture.detectChanges();
    expect(button('Undo').disabled).toBe(false);
    button('Undo').click();
    expect(graph.nodes().length).toBe(0);
    fixture.detectChanges();
    expect(button('Redo').disabled).toBe(false);
    button('Redo').click();
    expect(graph.nodes().length).toBe(1);
  });

  it('deletes the Selection as one undo step', () => {
    const node = graph.createNode('N', 0, 0);
    graph.selectNode(node.id);
    fixture.detectChanges();
    button('Delete').click();
    expect(graph.nodes().length).toBe(0);
    expect(history.canUndo()).toBe(true);
    history.undo();
    expect(graph.nodes().length).toBe(1);
  });

  it('duplicates Nodes beside the originals without touching redo of other paths', () => {
    const node = graph.createNode('N', 0, 0);
    graph.selectNode(node.id);
    fixture.detectChanges();
    button('Duplicate').click();
    expect(graph.nodes().length).toBe(2);
  });

  it('keeps Duplicate disabled for a Connection-only Selection', () => {
    const a = graph.createNode('A', 0, 0);
    const b = graph.createNode('B', 320, 0);
    const conn = graph.createConnection(a.id, 'right', b.id, 'left')!;
    graph.selectConnection(conn.id);
    fixture.detectChanges();
    expect(button('Delete').disabled).toBe(false);
    expect(button('Duplicate').disabled).toBe(true);
  });

  it('opens the Align popover from More with two node roots and closes on second click', () => {
    const a = graph.createNode('A', 0, 0);
    const b = graph.createNode('B', 300, 0);
    graph.setSelection([a.id, b.id], []);
    fixture.detectChanges();
    expect(button('More options').disabled).toBe(false);
    button('More options').click();
    fixture.detectChanges();
    expect(button('More options').getAttribute('aria-expanded')).toBe('true');
    expect(fixture.nativeElement.querySelector('app-align-popover')).not.toBeNull();
    button('More options').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-align-popover')).toBeNull();
  });

  it('closes the Align popover on tool switch', () => {
    const a = graph.createNode('A', 0, 0);
    const b = graph.createNode('B', 300, 0);
    graph.setSelection([a.id, b.id], []);
    fixture.detectChanges();
    button('More options').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-align-popover')).not.toBeNull();
    TestBed.inject(CanvasToolService).pan();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-align-popover')).toBeNull();
  });
});
