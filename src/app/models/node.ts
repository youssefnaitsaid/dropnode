import { Text } from './text';
import { StoredNodeShape } from './node-shape';
import { DN_TOKENS } from '../design-tokens';

export type HandleSide = 'top' | 'right' | 'bottom' | 'left';

// The Handle directly across a node from the given one. Both the connection
// drag's ghost bezier and a Quick-add's committed Connection attach opposite
// the source Handle, so they must share this map.
export function oppositeHandle(handle: HandleSide): HandleSide {
  switch (handle) {
    case 'top': return 'bottom';
    case 'right': return 'left';
    case 'bottom': return 'top';
    case 'left': return 'right';
  }
}

// Curated background palette, retuned for the refined-dark canvas: light,
// vivid pastels that stay legible with dark node text and pop on near-black.
// An absent color means the default node background. The Palette is domain
// data — its hexes are stored in Graph State and documented in DESIGN.md.
export const DEFAULT_NODE_BACKGROUND = DN_TOKENS.paper;
export const NODE_PALETTE: readonly string[] = [
  '#B3EBF2', '#FF746C', '#D3D3D3', '#EDE8D0',
  '#50C878', '#D3D3FF', '#F2A3E8', '#FFDBBB',
];

// The stable human-readable name of each Palette color (CONTEXT.md: Palette).
// User-facing controls — swatch tooltips, aria-labels, Palette Entry labels —
// use these names, never the raw hex. Order matches NODE_PALETTE exactly.
export const NODE_PALETTE_NAMES: readonly string[] = [
  'PastelBlue', 'PastelRed', 'LightGray', 'Beige',
  'Emerald', 'Lavender', 'Pink', 'LightOrange',
];

export interface GraphNode {
  id: string;
  // Text carried by a regular node or Text Block (required for both; never on Groups)
  text?: Text;
  // Plain Label of a Group (required for Groups; never on regular nodes or Text Blocks)
  label?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  // 'group' marks a Group, 'annotation' marks a Text Block; absent means a regular node
  kind?: 'group' | 'annotation';
  // Id of the Group this node belongs to; Groups themselves never have one
  parentId?: string;
  // Background color from NODE_PALETTE; absent means default
  color?: string;
  // Shape of a regular Node or Text Block; absent means the existing rectangle. Groups never carry Shape.
  shape?: StoredNodeShape;
  // Emoji of a regular Node or Text Block — the exact glyph from the curated set; absent means none.
  // Groups never carry Emoji. Beside Text, never inside it (ADR-0030).
  emoji?: string;
}

/** A Text Block owns zero Handles and can never be connected (ADR-0035). */
export function isTextBlock(node: GraphNode): boolean {
  return node.kind === 'annotation';
}
