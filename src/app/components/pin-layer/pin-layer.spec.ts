import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PinLayerComponent } from './pin-layer';
import { GraphService } from '../../services/graph.service';
import { HistoryService } from '../../services/history.service';
import { ContextMenuService } from '../../services/context-menu.service';

describe('PinLayerComponent keyboard operation', () => {
  let fixture: ComponentFixture<PinLayerComponent>;
  let graphService: GraphService;
  let historyService: HistoryService;
  let contextMenuService: ContextMenuService;

  const pinEl = () => fixture.nativeElement.querySelector('.pin') as HTMLElement;

  function key(keyName: string, init: KeyboardEventInit = {}): void {
    pinEl().dispatchEvent(new KeyboardEvent('keydown', { key: keyName, bubbles: true, cancelable: true, ...init }));
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [PinLayerComponent] });
    fixture = TestBed.createComponent(PinLayerComponent);
    graphService = TestBed.inject(GraphService);
    historyService = TestBed.inject(HistoryService);
    contextMenuService = TestBed.inject(ContextMenuService);
    fixture.detectChanges();
  });

  it('renders a focusable, labeled Pin', () => {
    const pin = graphService.createPin({ kind: 'canvas', x: 100, y: 50 }, 'Remember this')!;
    fixture.detectChanges();

    expect(pinEl().getAttribute('tabindex')).toBe('0');
    expect(pinEl().getAttribute('role')).toBe('button');
    expect(pinEl().getAttribute('aria-label')).toBe('Pin: Remember this');
    expect(pinEl().getAttribute('data-pin-id')).toBe(pin.id);
  });

  it('moves a Canvas-anchored Pin from arrows as an undoable Command', () => {
    const pin = graphService.createPin({ kind: 'canvas', x: 100, y: 50 }, 'm')!;
    fixture.detectChanges();

    key('ArrowRight');
    key('ArrowDown');

    expect(graphService.pinPoint(pin.id)).toEqual({ x: 110, y: 60 });

    historyService.undo();
    historyService.undo();
    expect(graphService.pinPoint(pin.id)).toEqual({ x: 100, y: 50 });
  });

  it('moves a Node-anchored Pin by shifting its offset', () => {
    const node = graphService.createNode('A', 0, 0);
    const pin = graphService.createPin({ kind: 'node', nodeId: node.id, offsetX: 20, offsetY: 30 }, 'm')!;
    fixture.detectChanges();

    key('ArrowRight');

    expect(graphService.pinPoint(pin.id)).toEqual({ x: 30, y: 30 });
  });

  it('opens the edit popover from Enter', () => {
    const pin = graphService.createPin({ kind: 'canvas', x: 100, y: 50 }, 'm')!;
    fixture.detectChanges();

    key('Enter');

    expect(contextMenuService.pinEditRequest()).toBe(pin.id);
  });
});
