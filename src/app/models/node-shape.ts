export const NODE_SHAPES = ['rectangle', 'pill', 'diamond', 'ellipse'] as const;

export type NodeShape = (typeof NODE_SHAPES)[number];
export type StoredNodeShape = Exclude<NodeShape, 'rectangle'>;

export const NODE_BASELINE_MIN_WIDTH = 120;
export const NODE_BASELINE_MIN_HEIGHT = 48;

export interface NodeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface NodeSize {
  width: number;
  height: number;
}

/** An absent stored Shape is the existing subtly rounded rectangle. */
export function effectiveNodeShape(shape?: NodeShape): NodeShape {
  return shape ?? 'rectangle';
}

export function isNodeShape(value: unknown): value is NodeShape {
  return typeof value === 'string' && (NODE_SHAPES as readonly string[]).includes(value);
}

/** The default is represented by absence in Graph State. */
export function storedNodeShape(shape: NodeShape): StoredNodeShape | undefined {
  return shape === 'rectangle' ? undefined : shape;
}

/**
 * Minimum bounding-box size for a centered rectangular Text block.
 *
 * The non-rectangular rules reserve the central safe area of each silhouette:
 * a pill keeps a full-height straight corridor, a diamond keeps a centered
 * rectangle inside its four-sided boundary, and an ellipse keeps a rectangle
 * inside its equation.
 */
export function shapeMinimumSize(
  shape: NodeShape,
  contentWidth: number,
  contentHeight: number,
): NodeSize {
  const width = Math.max(NODE_BASELINE_MIN_WIDTH, Math.ceil(finiteDimension(contentWidth)));
  const height = Math.max(NODE_BASELINE_MIN_HEIGHT, Math.ceil(finiteDimension(contentHeight)));

  switch (shape) {
    case 'rectangle':
      return { width, height };
    case 'pill':
      return {
        width: Math.max(width, Math.ceil(finiteDimension(contentWidth) + height)),
        height,
      };
    case 'diamond':
      return diamondMinimumSize(width, height, contentWidth, contentHeight);
    case 'ellipse':
      return ellipseMinimumSize(width, height, contentWidth, contentHeight);
  }
}

/** Grow only, keeping the Node's center fixed whenever growth is required. */
export function fitNodeShapeRect(
  rect: NodeRect,
  shape: NodeShape,
  contentWidth: number,
  contentHeight: number,
): NodeRect {
  const minimum = shapeMinimumSize(shape, contentWidth, contentHeight);
  const width = Math.max(rect.width, minimum.width);
  const height = Math.max(rect.height, minimum.height);
  return {
    x: rect.x - (width - rect.width) / 2,
    y: rect.y - (height - rect.height) / 2,
    width,
    height,
  };
}

function finiteDimension(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * A centered rectangle w × h is inside a point-up diamond W × H when
 * w/W + h/H <= 1. Choose the minimum-area safe rectangle while respecting
 * the baseline floors. The unconstrained optimum is 2w × 2h; when one floor
 * is larger, solve the other dimension at the silhouette boundary.
 */
function diamondMinimumSize(
  widthFloor: number,
  heightFloor: number,
  contentWidth: number,
  contentHeight: number,
): NodeSize {
  const width = finiteDimension(contentWidth);
  const height = finiteDimension(contentHeight);
  const idealWidth = width * 2;
  const idealHeight = height * 2;

  if (widthFloor > idealWidth && heightFloor > idealHeight) {
    return { width: widthFloor, height: heightFloor };
  }
  if (widthFloor > idealWidth) {
    const safeHeight = height === 0 ? 0 : height / (1 - width / widthFloor);
    return { width: widthFloor, height: Math.max(heightFloor, Math.ceil(safeHeight)) };
  }
  if (heightFloor > idealHeight) {
    const safeWidth = width === 0 ? 0 : width / (1 - height / heightFloor);
    return { width: Math.max(widthFloor, Math.ceil(safeWidth)), height: heightFloor };
  }
  return {
    width: Math.max(widthFloor, Math.ceil(idealWidth)),
    height: Math.max(heightFloor, Math.ceil(idealHeight)),
  };
}

/**
 * A centered rectangle w × h is inside an ellipse W × H when
 * (w/W)^2 + (h/H)^2 <= 1. As above, use the minimum-area solution with
 * baseline floors instead of scaling both axes by a fixed multiplier.
 */
function ellipseMinimumSize(
  widthFloor: number,
  heightFloor: number,
  contentWidth: number,
  contentHeight: number,
): NodeSize {
  const width = finiteDimension(contentWidth);
  const height = finiteDimension(contentHeight);
  const idealWidth = width * Math.SQRT2;
  const idealHeight = height * Math.SQRT2;

  if (widthFloor > idealWidth && heightFloor > idealHeight) {
    return { width: widthFloor, height: heightFloor };
  }
  if (widthFloor > idealWidth) {
    const ratio = width / widthFloor;
    const safeHeight = height === 0 ? 0 : height / Math.sqrt(1 - ratio * ratio);
    return { width: widthFloor, height: Math.max(heightFloor, Math.ceil(safeHeight)) };
  }
  if (heightFloor > idealHeight) {
    const ratio = height / heightFloor;
    const safeWidth = width === 0 ? 0 : width / Math.sqrt(1 - ratio * ratio);
    return { width: Math.max(widthFloor, Math.ceil(safeWidth)), height: heightFloor };
  }
  return {
    width: Math.max(widthFloor, Math.ceil(idealWidth)),
    height: Math.max(heightFloor, Math.ceil(idealHeight)),
  };
}
