import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { AlignPopoverComponent } from './align-popover';
import { GraphService } from '../../services/graph.service';
import { HistoryService } from '../../services/history.service';

describe('AlignPopoverComponent', () => {
  let fixture: ComponentFixture<AlignPopoverComponent>;
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
    TestBed.configureTestingModule({ imports: [AlignPopoverComponent] });
    fixture = TestBed.createComponent(AlignPopoverComponent);
    graph = TestBed.inject(GraphService);
    history = TestBed.inject(HistoryService);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture?.destroy();
  });

  it('renders all eight arrangement actions in one grid', () => {
    for (const label of [
      'Align Left', 'Align Horizontal Center', 'Align Right',
      'Align Top', 'Align Vertical Middle', 'Align Bottom',
      'Distribute Horizontally', 'Distribute Vertically',
    ]) {
      expect(button(label)).toBeTruthy();
    }
  });

  it('disables both Distribute items below three node roots', () => {
    const a = graph.createNode('A', 0, 0);
    const b = graph.createNode('B', 300, 0);
    graph.setSelection([a.id, b.id], []);
    fixture.detectChanges();
    expect(button('Distribute Horizontally').disabled).toBe(true);
    expect(button('Distribute Vertically').disabled).toBe(true);

    const c = graph.createNode('C', 600, 0);
    graph.setSelection([a.id, b.id, c.id], []);
    fixture.detectChanges();
    expect(button('Distribute Horizontally').disabled).toBe(false);
  });

  it('aligns left as one undo step', () => {
    const a = graph.createNode('A', 0, 0);
    const b = graph.createNode('B', 300, 50);
    graph.setSelection([a.id, b.id], []);
    fixture.detectChanges();

    button('Align Left').click();
    fixture.detectChanges();
    const moved = graph.nodes().find(n => n.id === b.id)!;
    expect(moved.x).toBe(0);
    expect(moved.y).toBe(50);
    expect(history.canUndo()).toBe(true);
    history.undo();
    expect(graph.nodes().find(n => n.id === b.id)!.x).toBe(300);
  });

  it('distributes horizontally with the outer roots anchored', () => {
    const a = graph.createNode('A', 0, 0);
    const b = graph.createNode('B', 200, 0);
    const c = graph.createNode('C', 600, 0);
    graph.setSelection([a.id, b.id, c.id], []);
    fixture.detectChanges();

    button('Distribute Horizontally').click();
    fixture.detectChanges();
    const middle = graph.nodes().find(n => n.id === b.id)!;
    // A [0,160], B [200,360], C [600,760]: span 760, widths 480, two gaps of
    // 140 — B lands at 160+140 = 300 with C anchored.
    expect(middle.x).toBe(300);
  });
});
