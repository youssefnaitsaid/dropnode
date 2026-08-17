import { ComponentFixture, TestBed } from '@angular/core/testing';
import { GraphNode } from '../../models/node';
import { textFromString } from '../../models/text';
import { NodeComponent } from './node';
import { ResizeModeService } from '../../services/resize-mode.service';
import { shapeMinimumSize } from '../../models/node-shape';

describe('NodeComponent shapes', () => {
  let fixture: ComponentFixture<NodeComponent>;
  let component: NodeComponent;

  function render(node: GraphNode): void {
    fixture = TestBed.createComponent(NodeComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('node', node);
    fixture.detectChanges();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [NodeComponent] });
  });

  it('renders the selected regular Node shape on its surface while keeping all four Handles outside it', () => {
    render({
      id: 'diamond-node',
      text: textFromString('Decision'),
      x: 100,
      y: 80,
      width: 200,
      height: 96,
      shape: 'diamond',
    });

    const card = fixture.nativeElement.querySelector('.node-card') as HTMLElement;
    const surface = fixture.nativeElement.querySelector('.node-surface') as HTMLElement;

    expect(card.dataset.shape).toBe('diamond');
    expect(surface.classList.contains('shape-diamond')).toBe(true);
    expect(surface.classList.contains('shape-pill')).toBe(false);
    expect(fixture.nativeElement.querySelectorAll('app-handle')).toHaveLength(4);
    expect(fixture.nativeElement.querySelectorAll('.grip')).toHaveLength(0);
  });

  it('uses the rectangle default and never gives a Group a shape surface', () => {
    render({
      id: 'group',
      kind: 'group',
      label: 'Group',
      x: 0,
      y: 0,
      width: 320,
      height: 200,
      shape: 'pill',
    } as GraphNode);

    const card = fixture.nativeElement.querySelector('.node-card') as HTMLElement;
    const surface = fixture.nativeElement.querySelector('.node-surface') as HTMLElement;

    expect(card.dataset.shape).toBeUndefined();
    expect(surface.classList.contains('shape-pill')).toBe(false);
    expect(surface.classList.contains('group-card')).toBe(true);
  });
});

describe('NodeComponent keyboard operation', () => {
  let fixture: ComponentFixture<NodeComponent>;
  let component: NodeComponent;

  function render(node: GraphNode): void {
    fixture = TestBed.createComponent(NodeComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('node', node);
    fixture.detectChanges();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [NodeComponent] });
  });

  describe('keyboard resize', () => {
    let resizeMode: ResizeModeService;
    let emitted: { nodeId: string; rect: { x: number; y: number; width: number; height: number }; originalRect: { x: number; y: number; width: number; height: number } }[];

    const cardEl = () => fixture.nativeElement.querySelector('.node-card') as HTMLElement;

    function key(keyName: string, init: KeyboardEventInit = {}): void {
      cardEl().dispatchEvent(new KeyboardEvent('keydown', { key: keyName, bubbles: true, cancelable: true, ...init }));
    }

    function renderAndCapture(node: GraphNode): void {
      render(node);
      emitted = [];
      component.keyboardResize.subscribe(e => emitted.push(e));
    }

    beforeEach(() => {
      resizeMode = TestBed.inject(ResizeModeService);
      resizeMode.exit();
    });

    afterEach(() => resizeMode.exit());

    it('resizes with arrows while Resize mode is armed', () => {
      renderAndCapture({ id: 'n', text: textFromString('Hi'), x: 10, y: 20, width: 200, height: 96 });
      resizeMode.toggle();

      key('ArrowRight');
      key('ArrowDown');

      expect(emitted).toHaveLength(2);
      expect(emitted[0].rect.width).toBe(210);
      expect(emitted[0].rect.x).toBe(10);
      expect(emitted[1].rect.height).toBe(106);
      expect(emitted[1].rect.y).toBe(20);
    });

    it('resizes with Ctrl+arrows without a mode, anchoring the opposite edge', () => {
      renderAndCapture({ id: 'n', text: textFromString('Hi'), x: 10, y: 20, width: 200, height: 96 });

      key('ArrowLeft', { ctrlKey: true });

      expect(emitted).toHaveLength(1);
      // The right edge stays put: x + width is constant
      expect(emitted[0].rect.width).toBe(190);
      expect(emitted[0].rect.x).toBe(20);
    });

    it('clamps at the shape minimum and emits nothing', () => {
      const min = shapeMinimumSize('rectangle', 0, 0);
      renderAndCapture({ id: 'n', text: textFromString('Hi'), x: 10, y: 20, width: min.width, height: min.height });
      resizeMode.toggle();

      key('ArrowLeft');
      key('ArrowUp');

      expect(emitted).toHaveLength(0);
    });
  });

  it('is focusable and screen-reader named from its Text', () => {
    render({ id: 'n1', text: textFromString('Decision'), x: 0, y: 0, width: 160, height: 48 });
    const card = fixture.nativeElement.querySelector('.node-card') as HTMLElement;

    expect(card.getAttribute('tabindex')).toBe('0');
    expect(card.getAttribute('role')).toBe('button');
    expect(card.getAttribute('aria-label')).toBe('Decision');
    expect(card.getAttribute('aria-pressed')).toBe('false');
  });

  it('names a Group from its label', () => {
    render({
      id: 'g1',
      kind: 'group',
      label: 'System',
      x: 0, y: 0, width: 320, height: 200,
    } as GraphNode);
    const card = fixture.nativeElement.querySelector('.node-card') as HTMLElement;
    expect(card.getAttribute('aria-label')).toBe('Group, System');
  });

  it('drops out of the tab order in Present Mode', () => {
    render({ id: 'n1', text: textFromString('X'), x: 0, y: 0, width: 160, height: 48 });
    const card = fixture.nativeElement.querySelector('.node-card') as HTMLElement;
    component['presentationService'].active.set(true);
    fixture.detectChanges();
    expect(card.getAttribute('tabindex')).toBeNull();
  });

  it('emits select on Enter', () => {
    render({ id: 'n1', text: textFromString('X'), x: 0, y: 0, width: 160, height: 48 });
    let selected: { nodeId: string } | null = null;
    component.keyboardSelect.subscribe(e => (selected = e));
    const card = fixture.nativeElement.querySelector('.node-card') as HTMLElement;

    card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(selected).toEqual({ nodeId: 'n1' });
  });

  it('emits a 10px move on arrows and 1px with Shift', () => {
    render({ id: 'n1', text: textFromString('X'), x: 0, y: 0, width: 160, height: 48 });
    const moves: { nodeId: string; dx: number; dy: number }[] = [];
    component.keyboardMove.subscribe(e => moves.push(e));
    const card = fixture.nativeElement.querySelector('.node-card') as HTMLElement;

    card.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    card.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', shiftKey: true, bubbles: true }));
    expect(moves).toEqual([
      { nodeId: 'n1', dx: 10, dy: 0 },
      { nodeId: 'n1', dx: 0, dy: -1 },
    ]);
  });

  it('ignores keys while editing a Group label input', () => {
    render({
      id: 'g1',
      kind: 'group',
      label: 'System',
      x: 0, y: 0, width: 320, height: 200,
    } as GraphNode);
    component.isEditing.set(true);
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('.node-label-input') as HTMLInputElement;
    let selected: { nodeId: string } | null = null;
    component.keyboardSelect.subscribe(e => (selected = e));

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(selected).toBeNull();
  });
});
