import { describe, it, expect } from 'vitest';
import {
  exportBounds, EXPORT_PADDING, EXPORT_SCALE,
  EXPORT_THEMES, themedNodeBackground, expandExportScope,
} from './export-image';
import { GraphNode } from './node';
import { Connection } from './connection';
import { NODE_PALETTE } from './node';
import { Pin } from './pin';
import { pinPoints } from './pin';

const node = (id: string, x: number, y: number, width: number, height: number): GraphNode => ({
  id, x, y, width, height,
});

const pin = (id: string, anchor: Pin['anchor'], message = 'Note'): Pin => ({ id, anchor, message });

describe('exportBounds', () => {
  it('wraps a single node in fixed padding and reports 2x output dimensions', () => {
    const bounds = exportBounds([node('n1', 100, 200, 160, 48)]);

    expect(bounds).toEqual({
      x: 100 - EXPORT_PADDING,
      y: 200 - EXPORT_PADDING,
      width: 160 + EXPORT_PADDING * 2,
      height: 48 + EXPORT_PADDING * 2,
      outputWidth: (160 + EXPORT_PADDING * 2) * EXPORT_SCALE,
      outputHeight: (48 + EXPORT_PADDING * 2) * EXPORT_SCALE,
    });
  });

  it('spans the bounding box of all nodes, independent of order', () => {
    const bounds = exportBounds([
      node('n2', 300, -50, 200, 100),
      node('n1', -120, 400, 160, 48),
    ]);

    // bbox: x from -120 to 500, y from -50 to 448
    expect(bounds.x).toBe(-120 - EXPORT_PADDING);
    expect(bounds.y).toBe(-50 - EXPORT_PADDING);
    expect(bounds.width).toBe(620 + EXPORT_PADDING * 2);
    expect(bounds.height).toBe(498 + EXPORT_PADDING * 2);
    expect(bounds.outputWidth).toBe(bounds.width * EXPORT_SCALE);
    expect(bounds.outputHeight).toBe(bounds.height * EXPORT_SCALE);
  });

  it('an empty graph yields a padded background region at the origin', () => {
    const bounds = exportBounds([]);

    expect(bounds).toEqual({
      x: 0,
      y: 0,
      width: EXPORT_PADDING * 2,
      height: EXPORT_PADDING * 2,
      outputWidth: EXPORT_PADDING * 2 * EXPORT_SCALE,
      outputHeight: EXPORT_PADDING * 2 * EXPORT_SCALE,
    });
  });

  it('encloses Connection curves so a bowing curve is not cropped', () => {
    const nodes = [node('A', 0, 0, 100, 100), node('B', 900, 0, 100, 100)];
    const conns: Connection[] = [
      { id: 'c1', sourceNodeId: 'A', sourceHandle: 'top', targetNodeId: 'B', targetHandle: 'top' },
    ];

    const bounds = exportBounds(nodes, conns);

    // The A.top->B.top curve's apex is at y=-112.5, above the node box (y>=0),
    // so the capture must reach it plus the padding. Nodes-only would have
    // started at y=-40 with height 180.
    expect(bounds.y).toBeCloseTo(-112.5 - EXPORT_PADDING, 5);
    expect(bounds.height).toBeCloseTo(212.5 + EXPORT_PADDING * 2, 5);
  });

  it('encloses authored Reroute Points in the export bounds', () => {
    const nodes = [node('A', 0, 0, 100, 100), node('B', 900, 0, 100, 100)];
    const conns: Connection[] = [{
      id: 'c1', sourceNodeId: 'A', sourceHandle: 'right', targetNodeId: 'B', targetHandle: 'left',
      reroutePoints: [{ x: 500, y: 300 }],
    }];

    const bounds = exportBounds(nodes, conns);

    expect(bounds.y).toBeCloseTo(-EXPORT_PADDING, 5);
    expect(bounds.height).toBeCloseTo(300 + EXPORT_PADDING * 2, 5);
  });
});

describe('expandExportScope', () => {
  it('survives missing roots, expands Group children, and keeps only contained Connections', () => {
    const group: GraphNode = {
      id: 'group', kind: 'group', label: 'Cluster', x: 0, y: 0, width: 320, height: 200,
    };
    const childA = { ...node('child-a', 40, 60, 120, 48), parentId: group.id };
    const childB = { ...node('child-b', 220, 60, 120, 48), parentId: group.id };
    const outside = node('outside', 600, 0, 160, 48);
    const nodes = [group, childA, childB, outside];
    const inside: Connection = {
      id: 'inside', sourceNodeId: childA.id, sourceHandle: 'right',
      targetNodeId: childB.id, targetHandle: 'left',
    };
    const boundary: Connection = {
      id: 'boundary', sourceNodeId: childA.id, sourceHandle: 'right',
      targetNodeId: outside.id, targetHandle: 'left',
    };

    const scope = expandExportScope(['missing', group.id], nodes, [inside, boundary]);

    expect(scope.rootIds).toEqual([group.id]);
    expect(scope.nodes.map(n => n.id)).toEqual([group.id, childA.id, childB.id]);
    expect(scope.connections.map(c => c.id)).toEqual([inside.id]);
  });

  it('returns an empty scope when every frozen root has vanished', () => {
    const present = node('present', 0, 0, 160, 48);

    expect(expandExportScope(['gone'], [present], [])).toEqual({
      rootIds: [], roots: [], nodes: [], connections: [], pins: [],
    });
  });

  it('keeps an individually exported child without its parent Group', () => {
    const group: GraphNode = {
      id: 'group', kind: 'group', label: 'Cluster', x: 0, y: 0, width: 320, height: 200,
    };
    const child = { ...node('child', 40, 60, 120, 48), parentId: group.id };

    const scope = expandExportScope([child.id], [group, child], []);

    expect(scope.rootIds).toEqual([child.id]);
    expect(scope.nodes.map(n => n.id)).toEqual([child.id]);
  });
});

describe('Export Theme mapping', () => {
  it('dark mirrors the on-screen editor colors', () => {
    // Known-good literals from the live canvas/node/connection styling
    // (blurple-dark chrome with off-white Nodes, 2026-08 redesign)
    expect(EXPORT_THEMES.dark).toEqual({
      background: '#313338',
      nodeBackground: '#f0f0f5',
      nodeText: '#1a1a2e',
      groupBorder: 'rgba(255, 255, 255, 0.1)',
      groupLabel: '#ffffff',
      connectionTextBackground: '#2b2d31',
      connectionTextColor: '#ffffff',
    });
  });

  it('light is its own Discord-light palette, independent of the dark world', () => {
    expect(EXPORT_THEMES.light).toEqual({
      background: '#ffffff',
      nodeBackground: '#f2f3f5',
      nodeText: '#1e1f22',
      groupBorder: 'rgba(15, 15, 18, 0.3)',
      groupLabel: '#1e1f22',
      connectionTextBackground: '#ffffff',
      connectionTextColor: '#1e1f22',
    });
  });

  it('a node without a Palette color takes the theme default background', () => {
    expect(themedNodeBackground(undefined, EXPORT_THEMES.light)).toBe('#f2f3f5');
    expect(themedNodeBackground(undefined, EXPORT_THEMES.dark)).toBe('#f0f0f5');
  });

  it('an applied Palette color passes through untouched in both themes', () => {
    for (const color of NODE_PALETTE) {
      expect(themedNodeBackground(color, EXPORT_THEMES.dark)).toBe(color);
      expect(themedNodeBackground(color, EXPORT_THEMES.light)).toBe(color);
    }
  });
});

describe('Pins in export', () => {
  it('pinPoints resolves Canvas anchors to their point and Node anchors to node + offset', () => {
    const nodes = [node('n1', 100, 200, 160, 48)];
    const pins = [
      pin('p1', { kind: 'canvas', x: 12, y: 34 }),
      pin('p2', { kind: 'node', nodeId: 'n1', offsetX: 10, offsetY: 20 }),
      pin('p3', { kind: 'node', nodeId: 'gone', offsetX: 0, offsetY: 0 }),
    ];

    expect(pinPoints(pins, nodes)).toEqual([
      { x: 12, y: 34 },
      { x: 110, y: 220 },
    ]);
  });

  it('exportBounds unions the given pin points into the capture box', () => {
    const bounds = exportBounds(
      [node('n1', 0, 0, 100, 100)],
      [],
      [{ x: 500, y: -200 }],
    );

    expect(bounds.x).toBe(-EXPORT_PADDING);
    expect(bounds.y).toBe(-200 - EXPORT_PADDING);
    expect(bounds.width).toBe(500 + EXPORT_PADDING * 2);
    expect(bounds.height).toBe(300 + EXPORT_PADDING * 2);
  });

  it('exportBounds without pin points is unchanged', () => {
    const bounds = exportBounds([node('n1', 0, 0, 100, 100)]);
    expect(bounds.x).toBe(-EXPORT_PADDING);
    expect(bounds.width).toBe(100 + EXPORT_PADDING * 2);
  });

  it('expandExportScope includes only Pins anchored to in-scope Nodes; Canvas Pins never ride a Scope', () => {
    const group = { ...node('g1', 0, 0, 400, 300), kind: 'group' as const };
    const child = { ...node('c1', 10, 10, 100, 48), parentId: 'g1' };
    const outsider = node('n9', 1000, 1000, 100, 48);
    const pins = [
      pin('p1', { kind: 'node', nodeId: 'g1', offsetX: 0, offsetY: 0 }),
      pin('p2', { kind: 'node', nodeId: 'c1', offsetX: 0, offsetY: 0 }),
      pin('p3', { kind: 'node', nodeId: 'n9', offsetX: 0, offsetY: 0 }),
      pin('p4', { kind: 'canvas', x: 50, y: 50 }),
    ];

    const scope = expandExportScope(['g1'], [group, child, outsider], [], pins);

    expect(scope.pins.map(p => p.id)).toEqual(['p1', 'p2']);
  });
});
