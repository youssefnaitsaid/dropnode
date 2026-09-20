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
    // The styling triggers open CDK overlay menus into the document body
    document.body.innerHTML = '';
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

    it('stays on top when it fits there even with more room below', () => {
      stubContainer({ left: 0, top: 100, width: 800, height: 600 });
      const node = graph.createNode('N', 0, 0);
      graph.selectNode(node.id);
      fixture.detectChanges();
      // Above fits (100-10-60 >= 8) while below holds far more space — top wins.
      expect(hostStyle().top).toBe('90px');
      expect((fixture.nativeElement as HTMLElement).classList.contains('flipped')).toBe(false);
    });

    it('picks the roomier side when neither side fits', () => {
      stubContainer({ left: 0, top: 0, width: 800, height: 600 });
      const node = graph.createNode('N', 0, 0);
      graph.selectNode(node.id);
      graph.setViewport({ zoom: 15 });
      fixture.detectChanges();
      // 48-unit node at 15x is 720 tall: above fails (0-10-60), below fails
      // (720+10+60 > 768), and below holds more room (48 > 0).
      expect(hostStyle().top).toBe('730px');
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

    it('pops More below the toolbar when the toolbar is above the Selection', () => {
      stubContainer({ left: 0, top: 80, width: 800, height: 600 });
      const node = graph.createNode('N', 0, 0);
      graph.selectNode(node.id);
      fixture.detectChanges();
      button('More options')!.click();
      fixture.detectChanges();
      // Not flipped: static position below the row, left edge aligned.
      const menu = fixture.nativeElement.querySelector(
        '[aria-label="More selection actions"]',
      ) as HTMLElement;
      const style = getComputedStyle(menu);
      expect(style.top).toBe('auto');
      expect(style.left).toBe('0px');
      expect(style.transform).not.toContain('translateY');
    });

    it('lifts More above the toolbar when the toolbar is below the Selection', () => {
      stubContainer({ left: 0, top: 10, width: 800, height: 600 });
      const node = graph.createNode('N', 0, 0);
      graph.selectNode(node.id);
      fixture.detectChanges();
      button('More options')!.click();
      fixture.detectChanges();
      // Toolbar flipped below the Selection (y=68): lifted by its own height.
      const menu = fixture.nativeElement.querySelector(
        '[aria-label="More selection actions"]',
      ) as HTMLElement;
      const style = getComputedStyle(menu);
      expect(style.top).toBe('auto');
      expect(style.transform).toContain('-100%');
    });

    it('keeps panels out of flow so opening them never moves the toolbar row', () => {
      stubContainer({ left: 0, top: 80, width: 800, height: 600 });
      const node = graph.createNode('N', 0, 0);
      graph.selectNode(node.id);
      fixture.detectChanges();
      button('More options')!.click();
      fixture.detectChanges();
      const menu = fixture.nativeElement.querySelector(
        '[aria-label="More selection actions"]',
      ) as HTMLElement;
      expect(getComputedStyle(menu).position).toBe('absolute');
    });

    it('docks More to the toolbar with no entry animation', () => {
      stubContainer({ left: 0, top: 80, width: 800, height: 600 });
      const node = graph.createNode('N', 0, 0);
      graph.selectNode(node.id);
      fixture.detectChanges();
      button('More options')!.click();
      fixture.detectChanges();
      // Static position below the row, left edge aligned, no lift.
      const menu = fixture.nativeElement.querySelector(
        '[aria-label="More selection actions"]',
      ) as HTMLElement;
      const style = getComputedStyle(menu);
      expect(style.top).toBe('auto');
      expect(style.left).toBe('0px');
      expect(style.transform).not.toContain('translateY');
      expect(style.animationName).toBe('none');
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
    // Node styling sits inline between Edit and the clipboard actions.
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Node styling');
    (document.activeElement as HTMLElement).dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
    );
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Cut');
    (document.activeElement as HTMLElement).dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }),
    );
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Node styling');
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

  it('shows one Node styling trigger and applies Shape to regular Nodes only, undoing as one command', async () => {
    const node = graph.createNode('Node', 0, 0);
    const group = graph.createGroup('Group', 400, 0);
    graph.setSelection([node.id, group.id], []);
    fixture.detectChanges();

    const trigger = button('Node styling');
    expect(trigger).not.toBeNull();

    trigger!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const pill = Array.from(document.body.querySelectorAll('button')).find(
      button => button.textContent?.trim() === 'Pill',
    ) as HTMLButtonElement;
    expect(pill).toBeTruthy();
    pill.click();
    fixture.detectChanges();

    expect(graph.nodes().find(item => item.id === node.id)?.shape).toBe('pill');
    expect(graph.nodes().find(item => item.id === group.id)?.shape).toBeUndefined();
    expect(history.canUndo()).toBe(true);

    history.undo();
    expect(graph.nodes().find(item => item.id === node.id)?.shape).toBeUndefined();
  });

  it('shows no Shape check for a mixed regular selection and disables Shape items for a Group-only selection', async () => {
    const first = graph.createNode('First', 0, 0);
    const second = graph.createNode('Second', 300, 0);
    graph.setNodeShape(second.id, 'ellipse');
    graph.setSelection([first.id, second.id], []);
    fixture.detectChanges();

    // Mixed regular selection: no shared Shape, so no item can read active
    expect(fixture.componentInstance.sharedNodeShape()).toBeUndefined();

    // Group-only selection: the trigger stays (Groups take color), but the
    // Shape section is disabled and clicking does nothing
    graph.selectNode(graph.createGroup('Only Group', 600, 0).id);
    fixture.detectChanges();

    const trigger = button('Node styling');
    expect(trigger).not.toBeNull();

    trigger!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const pill = Array.from(document.body.querySelectorAll('button')).find(
      button => button.textContent?.trim() === 'Pill',
    ) as HTMLButtonElement;
    expect(pill.hasAttribute('disabled')).toBe(true);

    pill.click();
    fixture.detectChanges();
    expect(history.canUndo()).toBe(false);
  });

  it('shows an Emoji section and applies the pick to regular Nodes only, undoing as one command', async () => {
    const node = graph.createNode('Node', 0, 0);
    const group = graph.createGroup('Group', 400, 0);
    graph.setSelection([node.id, group.id], []);
    fixture.detectChanges();

    const trigger = button('Node styling');
    expect(trigger).not.toBeNull();

    trigger!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const cells = Array.from(document.body.querySelectorAll('.emoji-cell')) as HTMLButtonElement[];
    expect(cells).toHaveLength(48);
    const idea = cells.find(button => button.getAttribute('aria-label') === 'Idea')!;
    expect(idea.getAttribute('title')).toBe('Idea');
    idea.click();
    fixture.detectChanges();

    expect(graph.nodes().find(item => item.id === node.id)?.emoji).toBe('💡');
    expect(graph.nodes().find(item => item.id === group.id)?.emoji).toBeUndefined();
    expect(history.canUndo()).toBe(true);

    history.undo();
    expect(graph.nodes().find(item => item.id === node.id)?.emoji).toBeUndefined();
  });

  it('shows no Emoji check for a mixed regular selection and disables Emoji items for a Group-only selection', async () => {
    const first = graph.createNode('First', 0, 0);
    const second = graph.createNode('Second', 300, 0);
    graph.setNodeEmoji(second.id, '💡');
    graph.setSelection([first.id, second.id], []);
    fixture.detectChanges();

    // Mixed regular selection: no shared Emoji, so no item can read active
    expect(fixture.componentInstance.sharedNodeEmoji()).toBeUndefined();

    // Group-only selection: the trigger stays (Groups take color), but the
    // Emoji section is disabled with a hint and clicking does nothing
    graph.selectNode(graph.createGroup('Only Group', 600, 0).id);
    fixture.detectChanges();
    expect(fixture.componentInstance.sharedNodeEmoji()).toBeUndefined();

    const trigger = button('Node styling');
    expect(trigger).not.toBeNull();

    trigger!.click();
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
    expect(history.canUndo()).toBe(false);
  });

  it('shows a Route Style section and applies orthogonal to selected Connections, undoing as one command', async () => {
    const a = graph.createNode('A', 0, 0);
    const b = graph.createNode('B', 300, 0);
    const conn = graph.createConnection(a.id, 'right', b.id, 'left')!;
    graph.selectConnection(conn.id);
    fixture.detectChanges();

    const trigger = button('Connection styling');
    expect(trigger).not.toBeNull();

    trigger!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const orthogonal = Array.from(document.body.querySelectorAll('button')).find(
      button => button.textContent?.trim() === 'Orthogonal',
    ) as HTMLButtonElement;
    expect(orthogonal).toBeTruthy();
    orthogonal.click();
    fixture.detectChanges();

    expect(graph.connections()[0].routeStyle).toBe('orthogonal');
    expect(fixture.componentInstance.sharedRouteStyle()).toBe('orthogonal');
    expect(history.canUndo()).toBe(true);

    history.undo();
    expect('routeStyle' in graph.connections()[0]).toBe(false);
  });

  it('shows a Custom section with Project hues and applies one to selected Nodes as one undo step', async () => {
    const node = graph.createNode('Node', 0, 0);
    graph.addCustomPaletteColor('#A1B2C3');
    graph.setSelection([node.id], []);
    fixture.detectChanges();

    const trigger = button('Node styling')!;
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

    expect(graph.nodes().find(item => item.id === node.id)?.color).toBe('#A1B2C3');
    expect(fixture.componentInstance.sharedNodeColor()).toBe('#A1B2C3');
    expect(history.canUndo()).toBe(true);

    history.undo();
    expect(graph.nodes().find(item => item.id === node.id)?.color).toBeUndefined();
  });

  it('adds a custom hue from the menu hex input and deletes it resetting uses to default as one undo step', async () => {
    const node = graph.createNode('Node', 0, 0);
    graph.setSelection([node.id], []);
    fixture.detectChanges();

    const trigger = button('Node styling')!;
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

    expect(graph.customPalette()).toEqual(['#A1B2C3']);

    const apply = Array.from(document.body.querySelectorAll('button')).find(
      button => button.getAttribute('aria-label') === 'Apply custom hue #A1B2C3',
    ) as HTMLButtonElement;
    apply.click();
    fixture.detectChanges();
    expect(graph.nodes().find(item => item.id === node.id)?.color).toBe('#A1B2C3');

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

    expect(graph.customPalette()).toEqual([]);
    expect(graph.nodes().find(item => item.id === node.id)?.color).toBeUndefined();
    expect(fixture.componentInstance.sharedNodeColor()).toBeNull();
    expect(history.canUndo()).toBe(true);

    history.undo();
    // Undo restores the hues but not the roster entry — re-adding re-links.
    expect(graph.nodes().find(item => item.id === node.id)?.color).toBe('#A1B2C3');
    expect(graph.customPalette()).toEqual([]);
  });

  it('explains invalid hex input instead of storing it', async () => {
    const node = graph.createNode('Node', 0, 0);
    graph.setSelection([node.id], []);
    fixture.detectChanges();

    const trigger = button('Node styling')!;
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

    expect(graph.customPalette()).toEqual([]);
    const error = Array.from(document.body.querySelectorAll('*')).find(
      el => el.textContent?.trim() === 'Enter a #RRGGBB hex not already in the palette (16 max).',
    );
    expect(error).toBeTruthy();
  });

  it('shows customs in the Connection menu and applies with the shared check', async () => {
    const a = graph.createNode('A', 0, 0);
    const b = graph.createNode('B', 300, 0);
    const conn = graph.createConnection(a.id, 'right', b.id, 'left')!;
    graph.addCustomPaletteColor('#A1B2C3');
    graph.selectConnection(conn.id);
    fixture.detectChanges();

    const trigger = button('Connection styling')!;
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

    expect(graph.connections()[0].color).toBe('#A1B2C3');
    expect(fixture.componentInstance.sharedConnectionColor()).toBe('#A1B2C3');
    expect(history.canUndo()).toBe(true);
  });

  it('shows both styling triggers for a mixed Node + Connection Selection', () => {
    const a = graph.createNode('A', 0, 0);
    const b = graph.createNode('B', 300, 0);
    const conn = graph.createConnection(a.id, 'right', b.id, 'left')!;
    graph.setSelection([a.id], [conn.id]);
    fixture.detectChanges();

    expect(toolbar()).not.toBeNull();
    expect(button('Node styling')).not.toBeNull();
    expect(button('Connection styling')).not.toBeNull();
  });

  it('hides both styling triggers for a Pin Selection', () => {
    const pin = graph.createPin({ kind: 'canvas', x: 100, y: 100 }, 'hello')!;
    TestBed.inject(ContextMenuService).openFor({ kind: 'pin', pinId: pin.id }, 100, 100);
    fixture.detectChanges();

    expect(toolbar()).not.toBeNull();
    expect(button('Node styling')).toBeNull();
    expect(button('Connection styling')).toBeNull();
  });
});
