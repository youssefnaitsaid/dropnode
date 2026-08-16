import { describe, it, expect } from 'vitest';
import { Bounds } from './bounds';
import {
  minimapProjection,
  worldToMinimap,
  minimapToWorld,
  recenterViewport,
  viewportRect,
} from './minimap';

// The Minimap frames the fit-to-content bounds: the content box expanded by
// 10% on every side, contain-fitted and centered in the Minimap's box.
// Worked example used throughout: content 100x100 at the origin, Minimap
// 200x150 → padded bounds (-10,-10,120,120), scale = min(200/120, 150/120)
// = 1.25, so the map fills its height and is centered horizontally with a
// 25px margin on each side.
const CONTENT: Bounds = { x: 0, y: 0, width: 100, height: 100 };
const PROJ = minimapProjection(CONTENT, 200, 150);

describe('minimapProjection', () => {
  it('pads content by 10% per side and contain-fits it centered', () => {
    expect(PROJ.bounds).toEqual({ x: -10, y: -10, width: 120, height: 120 });
    expect(PROJ.scale).toBeCloseTo(1.25);
    expect(PROJ.offsetX).toBeCloseTo(25);
    expect(PROJ.offsetY).toBeCloseTo(0);
  });

  it('fits wide content by width', () => {
    const wide = minimapProjection({ x: 0, y: 0, width: 400, height: 100 }, 200, 150);
    // padded 480x120 → scale = min(200/480, 150/120) = 200/480
    expect(wide.scale).toBeCloseTo(200 / 480);
  });

  it('degenerate zero-size content still projects (a lone Node shrunk to a point)', () => {
    const point = minimapProjection({ x: 5, y: 5, width: 0, height: 0 }, 200, 150);
    expect(point.scale).toBe(1);
    expect(Number.isFinite(point.scale)).toBe(true);
  });
});

describe('worldToMinimap / minimapToWorld', () => {
  it('round-trips a world point through minimap coordinates', () => {
    const world = { x: 37, y: 91 };
    const onMap = worldToMinimap(world, PROJ);
    expect(onMap).toEqual({
      x: 25 + (37 + 10) * 1.25,
      y: (91 + 10) * 1.25,
    });
    expect(minimapToWorld(onMap, PROJ)).toEqual({ x: 37, y: 91 });
  });
});

describe('recenterViewport', () => {
  it('pans so the given world point sits at the center, keeping zoom', () => {
    const next = recenterViewport({ x: 100, y: 50 }, { panX: 0, panY: 0, zoom: 2 }, 800, 600);
    expect(next).toEqual({ panX: 400 - 200, panY: 300 - 100, zoom: 2 });
  });
});

describe('viewportRect', () => {
  it('maps the visible world region into minimap coordinates, even partially outside', () => {
    // Viewport pan (200,200) at zoom 2 over an 800x600 view shows world
    // x∈[-100,300], y∈[-100,200].
    const rect = viewportRect({ panX: 200, panY: 200, zoom: 2 }, 800, 600, PROJ);
    expect(rect.x).toBeCloseTo((-100 + 10) * 1.25 + 25);
    expect(rect.y).toBeCloseTo((-100 + 10) * 1.25);
    expect(rect.width).toBeCloseTo(400 * 1.25);
    expect(rect.height).toBeCloseTo(300 * 1.25);
  });
});
