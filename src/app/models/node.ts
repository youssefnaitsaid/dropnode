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
  '#ff8fa3', '#ffb37a', '#ffe08a', '#9fe0a3',
  '#86dced', '#9fb4ff', '#c3a3ff', '#f2a3e8',
];

export interface GraphNode {
  id: string;
  // Text carried by a regular node (required for regular nodes; never on Groups)
  text?: Text;
  // Plain Label of a Group (required for Groups; never on regular nodes)
  label?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  // 'group' marks a Group; absent means a regular node
  kind?: 'group';
  // Id of the Group this node belongs to; Groups themselves never have one
  parentId?: string;
  // Background color from NODE_PALETTE; absent means default
  color?: string;
  // Shape of a regular Node; absent means the existing rectangle. Groups never carry Shape.
  shape?: StoredNodeShape;
}
