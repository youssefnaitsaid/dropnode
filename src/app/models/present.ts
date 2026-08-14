import { GraphNode } from './node';
import { ViewportState } from './viewport-state';

// One Step transition's duration. The tour's feel lives here, not in the
// rAF ticker that consumes it.
export const PRESENT_TRANSITION_MS = 500;

/**
 * The ordered Steps of a Present Mode tour: every Group (childless ones
 * included), in reading order of its top-left corner — y first, x as
 * tiebreak. Exact ties keep nodes-array order (sort is stable), matching the
 * Tidy-up determinism convention. Order is purely positional — reordering
 * Steps means moving Groups (ADR-0020). Loose Nodes are never Steps.
 */
export function presentSteps(nodes: readonly GraphNode[]): GraphNode[] {
  return nodes
    .filter(n => n.kind === 'group')
    .sort((a, b) => a.y - b.y || a.x - b.x);
}

/**
 * The camera position at progress `t` (clamped to [0,1]) of a Step
 * transition: pan and zoom eased together with a symmetric cubic
 * ease-in-out. Simultaneous easing is the accepted v1 camera path — a
 * van Wijk-style zoom-out-then-in upgrade would slot in here, behind the
 * same signature, without touching the ticker.
 */
export function interpolateViewport(
  from: ViewportState,
  to: ViewportState,
  t: number,
): ViewportState {
  const clamped = Math.min(Math.max(t, 0), 1);
  const e = easeInOutCubic(clamped);
  return {
    panX: from.panX + (to.panX - from.panX) * e,
    panY: from.panY + (to.panY - from.panY) * e,
    zoom: from.zoom + (to.zoom - from.zoom) * e,
  };
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(2 - 2 * t, 3) / 2;
}
