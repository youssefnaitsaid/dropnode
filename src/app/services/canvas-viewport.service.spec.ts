import { TestBed } from '@angular/core/testing';
import { CanvasViewportService } from './canvas-viewport.service';
import { GraphService } from './graph.service';

describe('CanvasViewportService', () => {
  let service: CanvasViewportService;
  let graphService: GraphService;
  let container: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(CanvasViewportService);
    graphService = TestBed.inject(GraphService);
    container = document.createElement('div');
    container.className = 'canvas-container';
    container.getBoundingClientRect = () => ({
      x: 0, y: 40, width: 1200, height: 800, top: 40, left: 0, right: 1200, bottom: 840,
      toJSON: () => ({}),
    }) as DOMRect;
    document.body.appendChild(container);
  });

  afterEach(() => container.remove());

  it('zoomByCentered anchors the zoom on the visible Canvas center, not the origin', () => {
    const zoomBy = vi.spyOn(graphService, 'zoomBy');

    service.zoomByCentered(0.1);

    expect(zoomBy).toHaveBeenCalledWith(0.1, 600, 400);
  });

  it('visibleCanvasCenter reports the world point under the visible center', () => {
    graphService.setViewport({ panX: -100, panY: 50, zoom: 2 });

    expect(service.visibleCanvasCenter()).toEqual({ x: 350, y: 175 });
  });
});
