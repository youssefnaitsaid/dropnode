import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { FloatingToolbarComponent } from './floating-toolbar';
import { GraphService } from '../../services/graph.service';
import { HistoryService } from '../../services/history.service';
import { CanvasToolService } from '../../services/canvas-tool.service';
import { CanvasLockService } from '../../services/canvas-lock.service';

describe('FloatingToolbarComponent', () => {
  let fixture: ComponentFixture<FloatingToolbarComponent>;
  let graph: GraphService;
  let history: HistoryService;
  let tool: CanvasToolService;

  const button = (label: string): HTMLButtonElement => {
    const found = Array.from(fixture.nativeElement.querySelectorAll('button')).find(
      (el: unknown) => (el as HTMLElement).getAttribute('aria-label') === label,
    ) as HTMLButtonElement;
    expect(found, `button ${label}`).toBeTruthy();
    return found;
  };

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [FloatingToolbarComponent] });
    fixture = TestBed.createComponent(FloatingToolbarComponent);
    graph = TestBed.inject(GraphService);
    history = TestBed.inject(HistoryService);
    tool = TestBed.inject(CanvasToolService);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture?.destroy();
  });

  it('renders all six tools with Select active by default', () => {
    for (const label of ['Select', 'Pan', 'Add Node', 'Add Group', 'Add Text Block', 'Add Pin']) {
      expect(button(label)).toBeTruthy();
    }
    expect(button('Select').getAttribute('aria-pressed')).toBe('true');
    expect(button('Pan').getAttribute('aria-pressed')).toBe('false');
  });

  it('switches Select and Pan as persistent modes', () => {
    button('Pan').click();
    fixture.detectChanges();
    expect(tool.tool()).toBe('pan');
    expect(button('Pan').getAttribute('aria-pressed')).toBe('true');
    button('Select').click();
    fixture.detectChanges();
    expect(tool.tool()).toBe('select');
  });

  it('arms Node placement on click and cancels on second click', () => {
    button('Add Node').click();
    fixture.detectChanges();
    expect(tool.tool()).toBe('node');
    expect(button('Add Node').getAttribute('aria-pressed')).toBe('true');
    expect(graph.nodes().length).toBe(0);
    expect(history.canUndo()).toBe(false);
    button('Add Node').click();
    fixture.detectChanges();
    expect(tool.tool()).toBe('select');
  });

  it('arms Group placement on click and cancels on second click', () => {
    button('Add Group').click();
    fixture.detectChanges();
    expect(tool.tool()).toBe('group');
    expect(button('Add Group').getAttribute('aria-pressed')).toBe('true');
    expect(graph.nodes().length).toBe(0);
    button('Add Group').click();
    fixture.detectChanges();
    expect(tool.tool()).toBe('select');
  });

  it('arms Text Block placement on click and cancels on second click', () => {
    button('Add Text Block').click();
    fixture.detectChanges();
    expect(tool.tool()).toBe('text-block');
    expect(button('Add Text Block').getAttribute('aria-pressed')).toBe('true');
    expect(graph.nodes().length).toBe(0);
    button('Add Text Block').click();
    fixture.detectChanges();
    expect(tool.tool()).toBe('select');
  });

  it('switching tools cancels an armed placement', () => {
    button('Add Node').click();
    fixture.detectChanges();
    expect(tool.tool()).toBe('node');
    button('Pan').click();
    fixture.detectChanges();
    expect(tool.tool()).toBe('pan');
    expect(button('Add Node').getAttribute('aria-pressed')).toBe('false');
  });

  it('arms Pin on first click and cancels on second', () => {
    button('Add Pin').click();
    fixture.detectChanges();
    expect(tool.tool()).toBe('pin');
    expect(button('Add Pin').getAttribute('aria-pressed')).toBe('true');
    button('Add Pin').click();
    fixture.detectChanges();
    expect(tool.tool()).toBe('select');
  });

  it('disables adds and Pin while the Canvas is locked', () => {
    TestBed.inject(CanvasLockService).lock();
    fixture.detectChanges();
    for (const label of ['Add Node', 'Add Group', 'Add Text Block', 'Add Pin']) {
      expect(button(label).disabled).toBe(true);
    }
  });

  it('clears the Selection when any tool button is clicked', () => {
    const node = graph.createNode('N', 0, 0);
    for (const label of ['Select', 'Pan', 'Add Node', 'Add Group', 'Add Text Block', 'Add Pin']) {
      graph.selectNode(node.id);
      fixture.detectChanges();
      button(label).click();
      fixture.detectChanges();
      expect(graph.selectedNodeIds()).toEqual([]);
    }
    tool.select();
  });
});
