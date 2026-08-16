import { Bounds } from './bounds';
import { ViewportState } from './viewport-state';

/** The world→Minimap mapping: what the Minimap frames and how it scales it. */
export interface MinimapProjection {
  /** The framed world region — fit-to-content bounds, padded on every side. */
  readonly bounds: Bounds;
  /** Minimap pixels per world unit. */
  readonly scale: number;
  /** Minimap-space offset of the framed region's top-left corner. */
  readonly offsetX: number;
  readonly offsetY: number;
}

// Content is padded by this fraction of its own size on every side, so Nodes
// at the edge of the graph aren't flush against the Minimap's border.
const CONTENT_PAD = 0.1;

/**
 * The Minimap's framing: the content bounds expanded by 10% per side,
 * contain-fitted and centered in a `width` x `height` box. A zero-size
 * content box (a lone Node shrunk to a point) still yields a finite scale —
 * a degenerate axis doesn't constrain the fit.
 */
export function minimapProjection(
  content: Bounds,
  width: number,
  height: number,
): MinimapProjection {
  const padX = content.width * CONTENT_PAD;
  const padY = content.height * CONTENT_PAD;
  const bounds: Bounds = {
    x: content.x - padX,
    y: content.y - padY,
    width: content.width + 2 * padX,
    height: content.height + 2 * padY,
  };
  // A zero-width or zero-height region doesn't constrain that axis (mirrors
  // frameViewport); if neither does — a lone point — nothing constrains the
  // fit, so keep unit scale.
  const fitX = bounds.width > 0 ? width / bounds.width : Infinity;
  const fitY = bounds.height > 0 ? height / bounds.height : Infinity;
  let scale = Math.min(fitX, fitY);
  if (!Number.isFinite(scale)) scale = 1;
  return {
    bounds,
    scale,
    offsetX: (width - bounds.width * scale) / 2,
    offsetY: (height - bounds.height * scale) / 2,
  };
}

/** A world point's position on the Minimap, in its pixel coordinates. */
export function worldToMinimap(
  point: { x: number; y: number },
  projection: MinimapProjection,
): { x: number; y: number } {
  return {
    x: projection.offsetX + (point.x - projection.bounds.x) * projection.scale,
    y: projection.offsetY + (point.y - projection.bounds.y) * projection.scale,
  };
}

/** A Minimap pixel position back into world coordinates. */
export function minimapToWorld(
  point: { x: number; y: number },
  projection: MinimapProjection,
): { x: number; y: number } {
  return {
    x: projection.bounds.x + (point.x - projection.offsetX) / projection.scale,
    y: projection.bounds.y + (point.y - projection.offsetY) / projection.scale,
  };
}

/**
 * The Viewport that centers `worldPoint` in a `viewWidth` x `viewHeight`
 * view, keeping the current zoom. Pure math half of the Minimap's drag: the
 * Viewport follows the cursor by recentering on its world point per frame.
 * A Viewport operation — never a Command, never in History.
 */
export function recenterViewport(
  worldPoint: { x: number; y: number },
  viewport: ViewportState,
  viewWidth: number,
  viewHeight: number,
): ViewportState {
  return {
    panX: viewWidth / 2 - worldPoint.x * viewport.zoom,
    panY: viewHeight / 2 - worldPoint.y * viewport.zoom,
    zoom: viewport.zoom,
  };
}

/** The visible world region of a Viewport, in Minimap pixel coordinates. */
export function viewportRect(
  viewport: ViewportState,
  viewWidth: number,
  viewHeight: number,
  projection: MinimapProjection,
): Bounds {
  const topLeft = worldToMinimap(
    { x: -viewport.panX / viewport.zoom, y: -viewport.panY / viewport.zoom },
    projection,
  );
  return {
    x: topLeft.x,
    y: topLeft.y,
    width: (viewWidth / viewport.zoom) * projection.scale,
    height: (viewHeight / viewport.zoom) * projection.scale,
  };
}
