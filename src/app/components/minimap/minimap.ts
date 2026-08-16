import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  effect,
  inject,
  viewChild,
} from '@angular/core';
import { GraphService } from '../../services/graph.service';
import { CanvasViewportService } from '../../services/canvas-viewport.service';
import { graphBounds } from '../../models/bounds';
import { connectionRoute, handlePoint } from '../../models/curve';
import {
  MinimapProjection,
  minimapProjection,
  minimapToWorld,
  recenterViewport,
  viewportRect,
  worldToMinimap,
} from '../../models/minimap';

// The Minimap's fixed on-screen footprint, per the spec (~200x150).
const MINIMAP_WIDTH = 200;
const MINIMAP_HEIGHT = 150;

// Refined-dark canvas tones (ADR-0001's palette, flattened for map scale).
const GROUP_FILL = 'rgba(240, 240, 245, 0.25)';
const NODE_FILL = 'rgba(240, 240, 245, 0.8)';
const CONNECTION_STROKE = 'rgba(232, 232, 238, 0.35)';
const ACCENT = '#86dced';
const VIEWPORT_STROKE = 'rgba(232, 232, 238, 0.9)';

/**
 * The Minimap: a canvas-rendered corner map of the whole graph (ADR-0024).
 * A thin shell — all geometry lives in models/minimap.ts and all state in
 * GraphService; this component only projects Graph State and Viewport onto
 * a small canvas and turns pointer presses into Viewport recentering.
 * Redraws coalesce to one per animation frame so pan/zoom/drag stays inside
 * the ADR-0003 budget.
 */
@Component({
  selector: 'app-minimap',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<canvas #map
    (pointerdown)="onPointerDown($event)"
    (pointermove)="onPointerMove($event)"
    (pointerup)="onPointerUp($event)"
  ></canvas>`,
  styles: [`
    :host {
      position: absolute;
      right: 16px;
      bottom: 16px;
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid rgba(232, 232, 238, 0.15);
      background: rgba(14, 14, 17, 0.75);
      cursor: pointer;
      touch-action: none;
      user-select: none;
      z-index: 20;
    }
    canvas {
      display: block;
      width: 200px;
      height: 150px;
    }
  `],
})
export class MinimapComponent implements AfterViewInit, OnDestroy {
  private readonly graphService = inject(GraphService);
  private readonly viewportService = inject(CanvasViewportService);
  private readonly zone = inject(NgZone);

  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('map');

  private dragging = false;
  private frameRequest = 0;

  constructor() {
    // Every Graph State / Selection / Viewport change schedules one redraw
    // on the next animation frame; intermediate frames coalesce.
    effect(() => {
      this.graphService.nodes();
      this.graphService.connections();
      this.graphService.selectedNodeIds();
      this.graphService.selectedConnectionIds();
      this.graphService.viewportState();
      this.scheduleDraw();
    });
  }

  ngAfterViewInit(): void {
    this.applyDevicePixelRatio();
    this.scheduleDraw();
  }

  ngOnDestroy(): void {
    if (this.frameRequest) cancelAnimationFrame(this.frameRequest);
  }

  onPointerDown(event: PointerEvent): void {
    this.dragging = true;
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    this.recenter(event);
  }

  onPointerMove(event: PointerEvent): void {
    if (this.dragging) this.recenter(event);
  }

  onPointerUp(event: PointerEvent): void {
    this.dragging = false;
    (event.target as HTMLElement).releasePointerCapture?.(event.pointerId);
  }

  /** Press or drag: the Viewport recenters on the pressed world point. */
  private recenter(event: PointerEvent): void {
    const projection = this.currentProjection();
    if (!projection) return;
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const world = minimapToWorld(
      { x: event.clientX - rect.left, y: event.clientY - rect.top },
      projection,
    );
    const { width, height } = this.viewportService.visibleSize();
    this.graphService.setViewport(
      recenterViewport(world, this.graphService.viewportState(), width, height),
    );
  }

  private currentProjection(): MinimapProjection | null {
    const bounds = graphBounds(this.graphService.nodes());
    if (!bounds) return null;
    return minimapProjection(bounds, MINIMAP_WIDTH, MINIMAP_HEIGHT);
  }

  private scheduleDraw(): void {
    if (this.frameRequest) return;
    this.zone.runOutsideAngular(() => {
      this.frameRequest = requestAnimationFrame(() => {
        this.frameRequest = 0;
        this.draw();
      });
    });
  }

  private applyDevicePixelRatio(): void {
    const canvas = this.canvasRef().nativeElement;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = MINIMAP_WIDTH * dpr;
    canvas.height = MINIMAP_HEIGHT * dpr;
    const ctx = canvas.getContext('2d');
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private draw(): void {
    const canvas = this.canvasRef ? this.canvasRef() : null;
    if (!canvas) return; // no view yet (tests, teardown)
    const ctx = canvas.nativeElement.getContext('2d');
    if (!ctx) return;
    const projection = this.currentProjection();
    if (!projection) return;

    const { nodes, connections } = this.graphService;
    const nodeSnapshot = nodes();
    const selectedNodes = new Set(this.graphService.selectedNodeIds());
    const selectedConnections = new Set(this.graphService.selectedConnectionIds());
    const nodeById = new Map(nodeSnapshot.map(n => [n.id, n]));

    ctx.clearRect(0, 0, MINIMAP_WIDTH, MINIMAP_HEIGHT);

    // Connections first, under the Nodes: hairline curves along each route's
    // segments (which bend through its Reroute Points).
    ctx.lineWidth = 1;
    for (const conn of connections()) {
      const source = nodeById.get(conn.sourceNodeId);
      const target = nodeById.get(conn.targetNodeId);
      if (!source || !target) continue;
      const route = connectionRoute(
        handlePoint(source, conn.sourceHandle),
        handlePoint(target, conn.targetHandle),
        conn.sourceHandle,
        conn.targetHandle,
        conn.reroutePoints,
      );
      ctx.strokeStyle = selectedConnections.has(conn.id) ? ACCENT : CONNECTION_STROKE;
      ctx.beginPath();
      route.segments.forEach((segment, index) => {
        const start = worldToMinimap(segment.start, projection);
        if (index === 0) ctx.moveTo(start.x, start.y);
        const cp1 = worldToMinimap(segment.cp1, projection);
        const cp2 = worldToMinimap(segment.cp2, projection);
        const end = worldToMinimap(segment.end, projection);
        ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, end.x, end.y);
      });
      ctx.stroke();
    }

    // Groups (lighter) under regular Nodes; Selection in the accent color.
    for (const node of nodeSnapshot) {
      const selected = selectedNodes.has(node.id);
      ctx.fillStyle = selected
        ? ACCENT
        : node.kind === 'group' ? GROUP_FILL : NODE_FILL;
      const topLeft = worldToMinimap(node, projection);
      ctx.fillRect(topLeft.x, topLeft.y, node.width * projection.scale, node.height * projection.scale);
    }

    // The Viewport rectangle on top; the canvas clips it when the Viewport
    // covers empty Canvas beyond all content.
    const { width, height } = this.viewportService.visibleSize();
    const rect = viewportRect(this.graphService.viewportState(), width, height, projection);
    ctx.strokeStyle = VIEWPORT_STROKE;
    ctx.lineWidth = 1;
    ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.width, rect.height);
  }
}
