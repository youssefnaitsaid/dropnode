import { GraphNode } from './node';
import { Connection } from './connection';
import { contentBounds } from './bounds';
import { Pin } from './pin';

// PNG Export capture rules (ADR-0014): full graph bounds plus fixed padding,
// rasterized at 2x so Text stays crisp when enlarged. Independent of the
// Viewport's pan/zoom.
export const EXPORT_PADDING = 40;
export const EXPORT_SCALE = 2;

export interface ExportBounds {
  // Capture region in canvas units
  x: number;
  y: number;
  width: number;
  height: number;
  // Pixel dimensions of the produced PNG (region x EXPORT_SCALE)
  outputWidth: number;
  outputHeight: number;
}

/**
 * The live members of a scoped PNG Export. Roots are kept separately so the
 * ExportService can apply the single-Group filename rule without rebuilding
 * the membership decision.
 */
export interface ExportScope {
  rootIds: string[];
  roots: GraphNode[];
  nodes: GraphNode[];
  connections: Connection[];
  /** Node-anchored Pins whose anchor Node is in scope (Canvas Pins never ride a Scope). */
  pins: Pin[];
}

/** Frozen scope metadata carried from a Context Menu into the Export dialog. */
export interface ExportScopeRequest {
  rootIds: readonly string[];
  isMultiSelection?: boolean;
}

export type ExportScopeInput = ExportScopeRequest | readonly string[];

/** Normalize the public array shorthand while preserving Selection provenance. */
export function normalizeExportScopeRequest(input: ExportScopeInput): Required<ExportScopeRequest> {
  if ('rootIds' in input) {
    return { rootIds: [...input.rootIds], isMultiSelection: input.isMultiSelection ?? false };
  }
  return { rootIds: [...input], isMultiSelection: false };
}

/**
 * Expand frozen root ids into the current Export Scope. Missing roots are
 * skipped; a surviving Group brings its current children, while Connections
 * only survive when both endpoint Nodes are in the resulting set.
 */
export function expandExportScope(
  rootIds: readonly string[],
  nodes: readonly GraphNode[],
  connections: readonly Connection[] = [],
  pins: readonly Pin[] = [],
): ExportScope {
  const nodesById = new Map(nodes.map(node => [node.id, node]));
  const candidates = [...new Set(rootIds)]
    .map(id => nodesById.get(id))
    .filter((node): node is GraphNode => node !== undefined);
  const candidateIds = new Set(candidates.map(node => node.id));
  const roots = candidates.filter(node => !node.parentId || !candidateIds.has(node.parentId));

  const includedIds = new Set(roots.map(node => node.id));
  for (const root of roots) {
    if (root.kind !== 'group') continue;
    for (const node of nodes) {
      if (node.parentId === root.id) includedIds.add(node.id);
    }
  }

  return {
    rootIds: roots.map(node => node.id),
    roots,
    nodes: nodes.filter(node => includedIds.has(node.id)),
    connections: connections.filter(
      connection => includedIds.has(connection.sourceNodeId) && includedIds.has(connection.targetNodeId),
    ),
    pins: pins.filter(
      pin => pin.anchor.kind === 'node' && includedIds.has(pin.anchor.nodeId),
    ),
  };
}

/** Capture box: all Nodes and every Connection's curve plus padding; an empty
 *  graph yields just the padded origin. Pin points, when given, join the box —
 *  bounds follow what renders (ADR-0020). */
export function exportBounds(
  nodes: readonly GraphNode[],
  connections: readonly Connection[] = [],
  pinPointList: readonly { x: number; y: number }[] = [],
): ExportBounds {
  let raw = contentBounds(nodes, connections);
  if (pinPointList.length > 0) {
    let minX = raw?.x ?? Infinity;
    let minY = raw?.y ?? Infinity;
    let maxX = raw ? raw.x + raw.width : -Infinity;
    let maxY = raw ? raw.y + raw.height : -Infinity;
    for (const point of pinPointList) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
    raw = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }
  if (!raw) {
    const side = EXPORT_PADDING * 2;
    return {
      x: 0, y: 0, width: side, height: side,
      outputWidth: side * EXPORT_SCALE,
      outputHeight: side * EXPORT_SCALE,
    };
  }
  const width = raw.width + EXPORT_PADDING * 2;
  const height = raw.height + EXPORT_PADDING * 2;
  return {
    x: raw.x - EXPORT_PADDING,
    y: raw.y - EXPORT_PADDING,
    width,
    height,
    outputWidth: width * EXPORT_SCALE,
    outputHeight: height * EXPORT_SCALE,
  };
}

// ── Export Theme ────────────────────────────────────────────────────
// Render-time-only appearance scheme (ADR-0014): background plus the default
// element colors, never stored in Graph State. Applied Palette colors pass
// through untouched in both values.

export type ExportTheme = 'dark' | 'light';

export interface ExportThemeColors {
  background: string;
  nodeBackground: string;
  nodeText: string;
  groupBorder: string;
  groupLabel: string;
  connectionTextBackground: string;
  connectionTextColor: string;
}

export const EXPORT_THEMES: Record<ExportTheme, ExportThemeColors> = {
  // Mirrors the on-screen editor: near-black Canvas, light Nodes,
  // translucent-white Group chrome, dark Connection Text chips.
  dark: {
    background: '#0e0e11',
    nodeBackground: '#f0f0f5',
    nodeText: '#1a1a2e',
    groupBorder: 'rgba(255, 255, 255, 0.22)',
    groupLabel: '#f0f0f5',
    connectionTextBackground: '#1c1c22',
    connectionTextColor: '#e8e8ee',
  },
  // White background; the dark-only defaults flip (Group chrome, Connection
  // Text chips) — default Node fills, Node Text, and the purple Connection
  // stroke stay legible on white as-is.
  light: {
    background: '#ffffff',
    nodeBackground: '#f0f0f5',
    nodeText: '#1a1a2e',
    groupBorder: 'rgba(15, 15, 18, 0.3)',
    groupLabel: '#1a1a2e',
    connectionTextBackground: '#ffffff',
    connectionTextColor: '#1a1a2e',
  },
};

/** A Node's exported fill: its applied Palette color, else the theme default. */
export function themedNodeBackground(color: string | undefined, theme: ExportThemeColors): string {
  return color ?? theme.nodeBackground;
}
