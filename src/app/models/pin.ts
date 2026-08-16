// A Pin (ADR-0025): a single-user plain-string marker anchored to a Canvas
// point or a Node. The anchor is a discriminated union — a Canvas anchor is
// absolute and moves with nothing; a Node anchor stores an offset from the
// Node's top-left, so the Pin follows the Node (drags, Group moves, Tidy up)
// without any special handling. Connections are deliberately not anchorable.

export type PinAnchor =
  | { kind: 'canvas'; x: number; y: number }
  | { kind: 'node'; nodeId: string; offsetX: number; offsetY: number };

export interface Pin {
  id: string;
  anchor: PinAnchor;
  // One plain string — never Text, never a Label. Always non-empty.
  message: string;
}

/** Where one Pin renders: its stored point, or its Node's top-left plus
 *  offset. Null when a Node-anchored Pin lost its Node. */
export function pinAnchorPoint(
  anchor: PinAnchor,
  nodes: readonly { id: string; x: number; y: number }[],
): { x: number; y: number } | null {
  if (anchor.kind === 'canvas') return { x: anchor.x, y: anchor.y };
  const node = nodes.find(n => n.id === anchor.nodeId);
  return node ? { x: node.x + anchor.offsetX, y: node.y + anchor.offsetY } : null;
}

/** Resolve where several Pins render; a Pin whose anchor Node is missing
 *  resolves to nothing. */
export function pinPoints(pins: readonly Pin[], nodes: readonly { id: string; x: number; y: number }[]): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  for (const p of pins) {
    const point = pinAnchorPoint(p.anchor, nodes);
    if (point) points.push(point);
  }
  return points;
}
