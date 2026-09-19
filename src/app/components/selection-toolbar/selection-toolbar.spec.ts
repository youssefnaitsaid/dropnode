import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { SelectionToolbarComponent } from './selection-toolbar';
import { GraphService } from '../../services/graph.service';
import { HistoryService } from '../../services/history.service';
import { ContextMenuService } from '../../services/context-menu.service';
import { CanvasLockService } from '../../services/canvas-lock.service';
import { PresentationService } from '../../services/presentation.service';
import { ChainHighlightService } from '../../services/chain-highlight.service';
import { ClipboardService } from '../../services/clipboard.service';
import { ResizeModeService } from '../../services/resize-mode.service';
import { ExportDialogService } from '../../services/export-dialog.service';

describe('SelectionToolbarComponent', () => {
  let fixture: ComponentFixture<SelectionToolbarComponent>;
  let graph: GraphService;
  let history: HistoryService;

  const button = (label: string): HTMLButtonElement | null => {
    const found = Array.from(fixture.nativeElement.querySelectorAll('button')).find(
      (el: unknown) => (el as HTMLElement).getAttribute('aria-label') === label,
    ) as HTMLButtonElement | undefined;
    return found ?? null;
  };

  const toolbar = (): HTMLElement | null =>
    fixture.nativeElement.querySelector('[aria-label="Selection toolbar"]');

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [SelectionToolbarComponent] });
    fixture = TestBed.createComponent(SelectionToolbarComponent);
    graph = TestBed.inject(GraphService);
    history = TestBed.inject(HistoryService);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture?.destroy();
  });

  it('shows nothing for an empty Selection', () => {
    expect(toolbar()).toBeNull();
  });

  it('mirrors the Node Context Menu for a single regular Node', () => {
    const node = graph.createNode('N', 0, 0);
    graph.selectNode(node.id);
    fixture.detectChanges();
    expect(toolbar()).not.toBeNull();
    for (const label of ['Edit text', 'Cut', 'Copy', 'Duplicate', 'Delete']) {
      expect(button(label), `button ${label}`).not.toBeNull();
    }
  });

  it('deletes the Selection as one undo step and closes', () => {
    const node = graph.createNode('N', 0, 0);
    graph.selectNode(node.id);
    fixture.detectChanges();
    button('Delete')!.click();
    expect(graph.nodes().length).toBe(0);
    expect(history.canUndo()).toBe(true);
    fixture.detectChanges();
    expect(toolbar()).toBeNull();
    history.undo();
    expect(graph.nodes().length).toBe(1);
  });

  it('duplicates and re-anchors on the copies', () => {
    const node = graph.createNode('N', 0, 0);
    graph.selectNode(node.id);
    fixture.detectChanges();
    button('Duplicate')!.click();
    expect(graph.nodes().length).toBe(2);
    fixture.detectChanges();
    expect(toolbar()).not.toBeNull();
    expect(graph.selectedNodeIds()).toEqual(
      graph.nodes().map(n => n.id).filter(id => id !== node.id),
    );
  });

  it('requests the Text editor from Edit text', () => {
    const node = graph.createNode('N', 0, 0);
    graph.selectNode(node.id);
    fixture.detectChanges();
    button('Edit text')!.click();
    expect(TestBed.inject(ContextMenuService).editTextRequest()).toBe(node.id);
  });

  it('mirrors the Group Context Menu: Rename instead of Edit text, extras behind More', () => {
    const group = graph.createGroup('G', 0, 0);
    graph.selectNode(group.id);
    fixture.detectChanges();
    expect(toolbar()).not.toBeNull();
    expect(button('Rename')).not.toBeNull();
    expect(button('Edit text')).toBeNull();
    for (const label of ['Cut', 'Copy', 'Duplicate', 'Delete']) {
      expect(button(label), `button ${label}`).not.toBeNull();
    }
    expect(button('Add node')).toBeNull();
    button('More options')!.click();
    fixture.detectChanges();
    for (const label of ['Add node', 'Add text block', 'Resize mode', 'Add pin', 'Export as PNG']) {
      expect(button(label), `button ${label}`).not.toBeNull();
    }
  });

  it('renames a Group from the toolbar', () => {
    const group = graph.createGroup('G', 0, 0);
    graph.selectNode(group.id);
    fixture.detectChanges();
    button('Rename')!.click();
    expect(TestBed.inject(ContextMenuService).renameRequest()).toBe(group.id);
  });

  it('adds a child Node to the Group from More', () => {
    const group = graph.createGroup('G', 0, 0);
    graph.selectNode(group.id);
    fixture.detectChanges();
    button('More options')!.click();
    fixture.detectChanges();
    button('Add node')!.click();
    const children = graph.nodes().filter(n => n.parentId === group.id);
    expect(children.length).toBe(1);
    expect(history.canUndo()).toBe(true);
  });

  it('mirrors the Connection Context Menu for a single Connection', () => {
    const a = graph.createNode('A', 0, 0);
    const b = graph.createNode('B', 320, 0);
    const conn = graph.createConnection(a.id, 'right', b.id, 'left')!;
    graph.selectConnection(conn.id);
    fixture.detectChanges();
    expect(toolbar()).not.toBeNull();
    for (const label of ['Edit text', 'Add Reroute Point', 'Delete']) {
      expect(button(label), `button ${label}`).not.toBeNull();
    }
    expect(button('Duplicate')).toBeNull();
    expect(button('More options')).toBeNull();
  });

  it('adds a Reroute Point from the Connection toolbar', () => {
    const a = graph.createNode('A', 0, 0);
    const b = graph.createNode('B', 320, 0);
    const conn = graph.createConnection(a.id, 'right', b.id, 'left')!;
    graph.selectConnection(conn.id);
    fixture.detectChanges();
    button('Add Reroute Point')!.click();
    expect(graph.connections().find(c => c.id === conn.id)?.reroutePoints?.length).toBe(1);
    expect(history.canUndo()).toBe(true);
  });

  it('mirrors the multi Context Menu with an Align entry', () => {
    const a = graph.createNode('A', 0, 0);
    const b = graph.createNode('B', 300, 50);
    graph.setSelection([a.id, b.id], []);
    fixture.detectChanges();
    expect(toolbar()).not.toBeNull();
    for (const label of ['Cut', 'Copy', 'Duplicate', 'Align', 'Delete']) {
      expect(button(label), `button ${label}`).not.toBeNull();
    }
    expect(button('Edit text')).toBeNull();
  });

  it('opens the Align Popover from the toolbar Align entry and aligns', () => {
    const a = graph.createNode('A', 0, 0);
    const b = graph.createNode('B', 300, 50);
    graph.setSelection([a.id, b.id], []);
    fixture.detectChanges();
    button('Align')!.click();
    fixture.detectChanges();
    const popover = fixture.nativeElement.querySelector('app-align-popover');
    expect(popover).not.toBeNull();
    expect(button('Align Left')).not.toBeNull();
    button('Align Left')!.click();
    const xs = graph.nodes().map(n => n.x);
    expect(xs[0]).toBe(xs[1]);
    expect(history.canUndo()).toBe(true);
  });

  it('mirrors the Pin Context Menu anchored to the Pin', () => {
    const pin = graph.createPin({ kind: 'canvas', x: 100, y: 100 }, 'hello')!;
    TestBed.inject(ContextMenuService).openFor({ kind: 'pin', pinId: pin.id }, 100, 100);
    fixture.detectChanges();
    expect(toolbar()).not.toBeNull();
    expect(button('Edit pin')).not.toBeNull();
    expect(button('Delete pin')).not.toBeNull();
    expect(button('Delete')).toBeNull();
  });

  it('dismisses for the Pin edit session from the toolbar', () => {
    const pin = graph.createPin({ kind: 'canvas', x: 100, y: 100 }, 'hello')!;
    const menus = TestBed.inject(ContextMenuService);
    menus.openFor({ kind: 'pin', pinId: pin.id }, 100, 100);
    fixture.detectChanges();
    button('Edit pin')!.click();
    expect(menus.pinEditRequest()).toBe(pin.id);
    fixture.detectChanges();
    expect(toolbar()).toBeNull();
  });

  it('deletes a Pin from the toolbar and dismisses', () => {
    const pin = graph.createPin({ kind: 'canvas', x: 100, y: 100 }, 'hello')!;
    const menus = TestBed.inject(ContextMenuService);
    menus.openFor({ kind: 'pin', pinId: pin.id }, 100, 100);
    fixture.detectChanges();
    button('Delete pin')!.click();
    expect(graph.pins().length).toBe(0);
    expect(history.canUndo()).toBe(true);
    fixture.detectChanges();
    expect(toolbar()).toBeNull();
  });

  it('stays hidden under Canvas Lock even with a Selection', () => {
    const node = graph.createNode('N', 0, 0);
    TestBed.inject(CanvasLockService).lock();
    graph.selectNode(node.id);
    fixture.detectChanges();
    expect(toolbar()).toBeNull();
  });

  it('stays hidden in Present Mode even with a Selection', () => {
    graph.createGroup('G', 0, 0);
    const node = graph.createNode('N', 0, 0);
    TestBed.inject(PresentationService).enter(800, 600);
    graph.selectNode(node.id);
    fixture.detectChanges();
    expect(toolbar()).toBeNull();
  });

  it('hides for a Text edit session and returns on commit', () => {
    const node = graph.createNode('N', 0, 0);
    graph.selectNode(node.id);
    fixture.detectChanges();
    expect(toolbar()).not.toBeNull();
    const chain = TestBed.inject(ChainHighlightService);
    chain.setNodeEditingSuppressed(true);
    fixture.detectChanges();
    expect(toolbar()).toBeNull();
    chain.setNodeEditingSuppressed(false);
    fixture.detectChanges();
    expect(toolbar()).not.toBeNull();
  });

  describe('positioning', () => {
    let container: HTMLDivElement;

    const stubContainer = (rect: { left: number; top: number; width: number; height: number }): void => {
      container = document.createElement('div');
      container.className = 'canvas-container';
      container.getBoundingClientRect = () =>
        ({ left: rect.left, top: rect.top, width: rect.width, height: rect.height, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
      document.body.appendChild(container);
    };

    afterEach(() => {
      container?.remove();
    });

    const hostStyle = (): CSSStyleDeclaration =>
      (fixture.nativeElement as HTMLElement).style;

    it('anchors above the Selection top-center', () => {
      stubContainer({ left: 100, top: 80, width: 800, height: 600 });
      const node = graph.createNode('N', 0, 0);
      graph.selectNode(node.id);
      fixture.detectChanges();
      // Node center x=80 → client 100+80=180; top y=0 → client 80-10 gap=70.
      expect(hostStyle().left).toBe('180px');
      expect(hostStyle().top).toBe('70px');
    });

    it('flips below when clipped at the Viewport top', () => {
      stubContainer({ left: 0, top: 10, width: 800, height: 600 });
      const node = graph.createNode('N', 0, 0);
      graph.selectNode(node.id);
      fixture.detectChanges();
      // Above would be 10+0-10=0 — inside the flip margin, so below: 10+48+10=68.
      expect(hostStyle().top).toBe('68px');
      expect((fixture.nativeElement as HTMLElement).classList.contains('flipped')).toBe(true);
    });

    it('tracks pan and zoom live', () => {
      stubContainer({ left: 100, top: 80, width: 800, height: 600 });
      const node = graph.createNode('N', 0, 0);
      graph.selectNode(node.id);
      fixture.detectChanges();
      graph.setViewport({ panX: 20, panY: 0, zoom: 2 });
      fixture.detectChanges();
      // Center 80*2+20+100=280; top 0*2+80-10=70.
      expect(hostStyle().left).toBe('280px');
      expect(hostStyle().top).toBe('70px');
    });
  });

  it('cuts the Selection onto the Clipboard and closes', () => {
    const node = graph.createNode('N', 0, 0);
    graph.selectNode(node.id);
    fixture.detectChanges();
    button('Cut')!.click();
    expect(graph.nodes().length).toBe(0);
    expect(TestBed.inject(ClipboardService).canPaste()).toBe(true);
    fixture.detectChanges();
    expect(toolbar()).toBeNull();
  });

  it('copies without touching the graph or History', () => {
    const node = graph.createNode('N', 0, 0);
    graph.selectNode(node.id);
    fixture.detectChanges();
    button('Copy')!.click();
    expect(graph.nodes().length).toBe(1);
    expect(history.canUndo()).toBe(false);
    expect(TestBed.inject(ClipboardService).canPaste()).toBe(true);
    fixture.detectChanges();
    expect(toolbar()).not.toBeNull();
  });

  it('toggles Resize mode from More', () => {
    const node = graph.createNode('N', 0, 0);
    graph.selectNode(node.id);
    fixture.detectChanges();
    button('More options')!.click();
    fixture.detectChanges();
    const resize = TestBed.inject(ResizeModeService);
    expect(resize.mode()).toBe(false);
    button('Resize mode')!.click();
    expect(resize.mode()).toBe(true);
  });

  it('requests a Node-anchored Pin from More', () => {
    const node = graph.createNode('N', 0, 0);
    graph.selectNode(node.id);
    fixture.detectChanges();
    button('More options')!.click();
    fixture.detectChanges();
    button('Add pin')!.click();
    expect(TestBed.inject(ContextMenuService).pinCreateRequest()).toEqual({
      kind: 'node', nodeId: node.id, offsetX: 80, offsetY: 24,
    });
  });

  it('opens the Export dialog from More', () => {
    const node = graph.createNode('N', 0, 0);
    graph.selectNode(node.id);
    fixture.detectChanges();
    const exports = TestBed.inject(ExportDialogService);
    const before = exports.openRequests();
    button('More options')!.click();
    fixture.detectChanges();
    button('Export as PNG')!.click();
    expect(exports.openRequests()).toBe(before + 1);
    expect(exports.scopeRootIds()).toEqual([node.id]);
  });

  it('pastes into the Group from More when the Clipboard holds nodes', () => {
    const node = graph.createNode('N', 0, 0);
    const group = graph.createGroup('G', 500, 0);
    graph.selectNode(node.id);
    fixture.detectChanges();
    button('Copy')!.click();
    graph.selectNode(group.id);
    fixture.detectChanges();
    button('More options')!.click();
    fixture.detectChanges();
    button('Paste')!.click();
    expect(graph.nodes().filter(n => n.parentId === group.id).length).toBe(1);
  });

  it('closes More on Escape and on Selection change', () => {
    const a = graph.createNode('A', 0, 0);
    graph.selectNode(a.id);
    fixture.detectChanges();
    button('More options')!.click();
    fixture.detectChanges();
    expect(button('Export as PNG')).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(button('Export as PNG')).toBeNull();
    button('More options')!.click();
    fixture.detectChanges();
    expect(button('Export as PNG')).not.toBeNull();
    const b = graph.createNode('B', 300, 0);
    graph.selectNode(b.id);
    fixture.detectChanges();
    expect(button('Export as PNG')).toBeNull();
  });

  it('moves focus with arrow keys without leaving the toolbar', () => {
    const node = graph.createNode('N', 0, 0);
    graph.selectNode(node.id);
    fixture.detectChanges();
    const first = button('Edit text')!;
    first.focus();
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Cut');
    (document.activeElement as HTMLElement).dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }),
    );
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Edit text');
  });

  it('renders More with the shared dropdown-menu styling', () => {
    const node = graph.createNode('N', 0, 0);
    graph.selectNode(node.id);
    fixture.detectChanges();
    button('More options')!.click();
    fixture.detectChanges();
    const panel = fixture.nativeElement.querySelector('[aria-label="More selection actions"]');
    expect(panel?.getAttribute('data-slot')).toBe('dropdown-menu');
    expect(panel?.querySelector('[aria-label="Export as PNG"]')?.getAttribute('data-slot')).toBe(
      'dropdown-menu-item',
    );
  });
});
