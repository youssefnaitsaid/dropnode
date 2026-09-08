import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { FloatingToolbarComponent } from './floating-toolbar';
import { GraphService } from '../../services/graph.service';
import { HistoryService } from '../../services/history.service';
import { CanvasToolService } from '../../services/canvas-tool.service';
import { ContextMenuService } from '../../services/context-menu.service';
import { CanvasViewportService } from '../../services/canvas-viewport.service';
import { CanvasLockService } from '../../services/canvas-lock.service';

describe('FloatingToolbarComponent', () => {
  let fixture: ComponentFixture<FloatingToolbarComponent>;
  let graph: GraphService;
  let history: HistoryService;
  let tool: CanvasToolService;
  let menus: ContextMenuService;
  let viewport: CanvasViewportService;

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
    menus = TestBed.inject(ContextMenuService);
    viewport = TestBed.inject(CanvasViewportService);
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

  it('adds a Node centered like the palette path with its Text editor requested', () => {
    const center = viewport.visibleCanvasCenter();
    button('Add Node').click();
    fixture.detectChanges();
    expect(graph.nodes().length).toBe(1);
    const node = graph.nodes()[0];
    expect(node.x).toBe(center.x - 80);
    expect(node.y).toBe(center.y - 24);
    expect(node.width).toBe(160);
    expect(node.height).toBe(48);
    expect(history.canUndo()).toBe(true);
    expect(menus.editTextRequest()).toBe(node.id);
  });

  it('adds a Group centered with its Label editor requested', () => {
    const center = viewport.visibleCanvasCenter();
    button('Add Group').click();
    fixture.detectChanges();
    expect(graph.nodes().length).toBe(1);
    const group = graph.nodes()[0];
    expect(group.kind).toBe('group');
    expect(group.x).toBe(center.x - 160);
    expect(group.y).toBe(center.y - 100);
    expect(menus.renameRequest()).toBe(group.id);
    expect(history.canUndo()).toBe(true);
  });

  it('adds a Text Block with zero-handle kind and its Text editor requested', () => {
    button('Add Text Block').click();
    fixture.detectChanges();
    expect(graph.nodes().length).toBe(1);
    const block = graph.nodes()[0];
    expect(block.kind).toBe('annotation');
    expect(menus.editTextRequest()).toBe(block.id);
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
});
