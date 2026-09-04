import { ComponentFixture, TestBed } from '@angular/core/testing';
import { GraphService } from '../../services/graph.service';
import { OutlineService } from '../../services/outline.service';
import { ContextMenuService } from '../../services/context-menu.service';
import { CanvasLockService } from '../../services/canvas-lock.service';
import { HistoryService } from '../../services/history.service';
import { OutlineComponent } from './outline';

describe('OutlineComponent', () => {
  let fixture: ComponentFixture<OutlineComponent>;
  let graph: GraphService;
  let outline: OutlineService;
  let contextMenu: ContextMenuService;
  let canvasLock: CanvasLockService;
  let history: HistoryService;

  function rows(): HTMLButtonElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('.outline-row'));
  }

  function rowIds(): (string | null)[] {
    return rows().map(row => row.getAttribute('data-node-id'));
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [OutlineComponent] });
    fixture = TestBed.createComponent(OutlineComponent);
    graph = TestBed.inject(GraphService);
    outline = TestBed.inject(OutlineService);
    contextMenu = TestBed.inject(ContextMenuService);
    canvasLock = TestBed.inject(CanvasLockService);
    history = TestBed.inject(HistoryService);
    canvasLock.unlock({ silent: true });
    fixture.detectChanges();
  });

  it('shows an empty state when the Canvas holds nothing', () => {
    expect(fixture.nativeElement.textContent).toContain('Nothing on the Canvas yet');
  });

  it('lists Groups with children first, then loose Nodes, then Text Blocks with a badge', () => {
    const group = graph.createGroup('Flow', 0, 0);
    graph.createNode('Loose', 500, 0);
    graph.createTextBlock('Notes', 700, 0);
    const child = graph.createNode('Step', 10, 10);
    graph.setNodeParent(child.id, group.id);
    fixture.detectChanges();

    expect(rowIds()).toEqual([group.id, child.id, graph.nodes()[1].id, graph.nodes()[2].id]);
    const badge = fixture.nativeElement.querySelector('[data-node-id="' + graph.nodes()[2].id + '"] .outline-badge');
    expect(badge?.textContent?.trim()).toBe('Text');
  });

  it('shows per-row in/out counts and a dash for Text Blocks', () => {
    const a = graph.createNode('A', 0, 0);
    const b = graph.createNode('B', 300, 0);
    graph.createTextBlock('Notes', 600, 0);
    graph.createConnection(a.id, 'right', b.id, 'left');
    fixture.detectChanges();

    const counts = rows().map(row => row.querySelector('.outline-counts')?.textContent?.trim());
    expect(counts).toEqual(['0→1', '1→0', '—']);
  });

  it('clicking a row replaces the Selection and frames it without touching History', () => {
    const node = graph.createNode('Todo', 0, 0);
    fixture.detectChanges();

    rows()[0].click();
    fixture.detectChanges();

    expect(graph.selectedNodeIds()).toEqual([node.id]);
    expect(graph.viewportState()).not.toEqual({ panX: 0, panY: 0, zoom: 1 });
    expect(history.canUndo()).toBe(false);
  });

  it('Ctrl+click toggles membership without reframing', () => {
    const a = graph.createNode('A', 0, 0);
    graph.createNode('B', 400, 0);
    fixture.detectChanges();

    const before = graph.viewportState();
    rows()[0].dispatchEvent(new MouseEvent('click', { ctrlKey: true, bubbles: true }));
    fixture.detectChanges();

    expect(graph.selectedNodeIds()).toEqual([a.id]);
    expect(graph.viewportState()).toEqual(before);
  });

  it('double-clicking a Node row opens its Text editor', () => {
    const node = graph.createNode('Todo', 0, 0);
    fixture.detectChanges();

    rows()[0].dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(graph.selectedNodeIds()).toEqual([node.id]);
    expect(contextMenu.editTextRequest()).toBe(node.id);
  });

  it('double-clicking a Group row opens its Label editor', () => {
    const group = graph.createGroup('Flow', 0, 0);
    fixture.detectChanges();

    rows()[0].dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(graph.selectedNodeIds()).toEqual([group.id]);
    expect(contextMenu.renameRequest()).toBe(group.id);
  });

  it('in Canvas Lock clicks move only the Viewport and double-clicks stay dead', () => {
    const node = graph.createNode('Todo', 0, 0);
    fixture.detectChanges();
    canvasLock.lock();

    rows()[0].click();
    fixture.detectChanges();
    expect(graph.selectedNodeIds()).toEqual([]);
    expect(graph.viewportState()).not.toEqual({ panX: 0, panY: 0, zoom: 1 });

    rows()[0].dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(contextMenu.editTextRequest()).toBeNull();
  });

  it('filters rows live and clears on Escape', () => {
    graph.createNode('Checkout redesign', 0, 0);
    graph.createNode('Elsewhere', 400, 0);
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('.outline-filter') as HTMLInputElement;

    input.value = 'checkout';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(rows()).toHaveLength(1);

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(rows()).toHaveLength(2);
    expect(outline.filter()).toBe('');
  });

  it('collapses Groups and reveals matches while filtering', () => {
    const group = graph.createGroup('Flow', 0, 0);
    const child = graph.createNode('Checkout step', 10, 10);
    graph.setNodeParent(child.id, group.id);
    fixture.detectChanges();

    const chevron = fixture.nativeElement.querySelector('.outline-chevron') as HTMLButtonElement;
    chevron.click();
    fixture.detectChanges();
    expect(rowIds()).toEqual([group.id]);

    outline.setFilter('checkout');
    fixture.detectChanges();
    expect(rowIds()).toEqual([group.id, child.id]);
    const forced = fixture.nativeElement.querySelector('.outline-chevron') as HTMLButtonElement;
    expect(forced.textContent?.trim()).toBe('▾');
    expect(forced.getAttribute('aria-expanded')).toBe('true');

    outline.setFilter('');
    fixture.detectChanges();
    expect(rowIds()).toEqual([group.id]);
  });

  it('frames the first visible hit on filter Enter', () => {
    graph.createNode('Checkout redesign', 0, 0);
    graph.createNode('Elsewhere', 400, 0);
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('.outline-filter') as HTMLInputElement;

    input.value = 'checkout';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    fixture.detectChanges();

    expect(graph.selectedNodeIds()).toEqual([graph.nodes()[0].id]);
    expect(graph.viewportState()).not.toEqual({ panX: 0, panY: 0, zoom: 1 });
  });

  it('keeps row identity stable across position-only drag writes', () => {
    const node = graph.createNode('Todo', 0, 0);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const before = component.visibleRows();

    graph.updateNodePosition(node.id, 37, -12);
    fixture.detectChanges();

    expect(component.visibleRows()).toBe(before);
  });
});
