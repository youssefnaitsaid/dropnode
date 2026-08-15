import { describe, it, expect } from 'vitest';
import {
  exportBounds, EXPORT_PADDING, EXPORT_SCALE,
  EXPORT_THEMES, themedNodeBackground, expandExportScope,
} from './export-image';
import { GraphNode } from './node';
import { Connection } from './connection';
import { NODE_PALETTE } from './node';

const node = (id: string, x: number, y: number, width: number, height: number): GraphNode => ({
  id, x, y, width, height,
});

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
      rootIds: [], roots: [], nodes: [], connections: [],
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
    expect(EXPORT_THEMES.dark).toEqual({
      background: '#0e0e11',
      nodeBackground: '#f0f0f5',
      nodeText: '#1a1a2e',
      groupBorder: 'rgba(255, 255, 255, 0.22)',
      groupLabel: '#f0f0f5',
      connectionTextBackground: '#1c1c22',
      connectionTextColor: '#e8e8ee',
    });
  });

  it('light swaps the background and dark-only defaults for light-legible ones', () => {
    expect(EXPORT_THEMES.light).toEqual({
      background: '#ffffff',
      nodeBackground: '#f0f0f5',
      nodeText: '#1a1a2e',
      groupBorder: 'rgba(15, 15, 18, 0.3)',
      groupLabel: '#1a1a2e',
      connectionTextBackground: '#ffffff',
      connectionTextColor: '#1a1a2e',
    });
  });

  it('a node without a Palette color takes the theme default background', () => {
    expect(themedNodeBackground(undefined, EXPORT_THEMES.light)).toBe('#f0f0f5');
    expect(themedNodeBackground(undefined, EXPORT_THEMES.dark)).toBe('#f0f0f5');
  });

  it('an applied Palette color passes through untouched in both themes', () => {
    for (const color of NODE_PALETTE) {
      expect(themedNodeBackground(color, EXPORT_THEMES.dark)).toBe(color);
      expect(themedNodeBackground(color, EXPORT_THEMES.light)).toBe(color);
    }
  });
});
