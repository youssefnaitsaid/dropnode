import { Injectable, inject } from '@angular/core';
import { GraphService } from './graph.service';

/** DOM bridge for operations that need the visible Canvas' dimensions/center. */
@Injectable({ providedIn: 'root' })
export class CanvasViewportService {
  private readonly graphService = inject(GraphService);

  visibleSize(): { width: number; height: number } {
    const element = typeof document !== 'undefined'
      ? document.querySelector<HTMLElement>('.canvas-container')
      : null;
    const rect = element?.getBoundingClientRect();
    return {
      width: rect?.width || (typeof window !== 'undefined' ? window.innerWidth : 0),
      height: rect?.height || (typeof window !== 'undefined' ? window.innerHeight : 0),
    };
  }

  visibleCanvasCenter(): { x: number; y: number } {
    const { width, height } = this.visibleSize();
    const viewport = this.graphService.viewportState();
    return {
      x: (width / 2 - viewport.panX) / viewport.zoom,
      y: (height / 2 - viewport.panY) / viewport.zoom,
    };
  }

  /** Button/palette zoom: step the zoom while keeping the visible Canvas' center fixed. */
  zoomByCentered(delta: number): void {
    const { width, height } = this.visibleSize();
    this.graphService.zoomBy(delta, width / 2, height / 2);
  }
}
