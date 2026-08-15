import {
  NODE_BASELINE_MIN_HEIGHT,
  NODE_BASELINE_MIN_WIDTH,
  NODE_SHAPES,
  NodeRect,
  NodeShape,
  effectiveNodeShape,
  fitNodeShapeRect,
  isNodeShape,
  shapeMinimumSize,
  storedNodeShape,
} from './node-shape';

describe('node shapes', () => {
  it('uses rectangle as the effective shape when the stored value is absent', () => {
    expect(effectiveNodeShape()).toBe('rectangle');
    expect(effectiveNodeShape('rectangle')).toBe('rectangle');
    expect(effectiveNodeShape('diamond')).toBe('diamond');
  });

  it('exposes a closed shape vocabulary and canonicalizes the default', () => {
    expect(NODE_SHAPES).toEqual(['rectangle', 'pill', 'diamond', 'ellipse']);
    expect(storedNodeShape('rectangle')).toBeUndefined();
    expect(storedNodeShape('pill')).toBe('pill');
    expect(isNodeShape('ellipse')).toBe(true);
    expect(isNodeShape('circle')).toBe(false);
  });

  it('keeps the baseline minimum for a rectangle', () => {
    expect(shapeMinimumSize('rectangle', 80, 20)).toEqual({
      width: NODE_BASELINE_MIN_WIDTH,
      height: NODE_BASELINE_MIN_HEIGHT,
    });
  });

  it('derives a pill minimum that leaves room for its rounded ends', () => {
    expect(shapeMinimumSize('pill', 100, 20)).toEqual({ width: 148, height: 48 });
  });

  it('derives a diamond minimum from the centered rectangle safety rule', () => {
    expect(shapeMinimumSize('diamond', 100, 20)).toEqual({ width: 172, height: 48 });
  });

  it('derives an ellipse minimum from its centered rectangle safety rule', () => {
    expect(shapeMinimumSize('ellipse', 100, 20)).toEqual({ width: 120, height: 48 });
  });

  it('grows an undersized shape around its center without shrinking a larger one', () => {
    const rect: NodeRect = { x: 100, y: 80, width: 120, height: 48 };

    expect(fitNodeShapeRect(rect, 'diamond', 100, 20)).toEqual({
      x: 74, y: 80, width: 172, height: 48,
    });
    expect(fitNodeShapeRect({ ...rect, width: 260 }, 'diamond', 100, 20)).toEqual({
      x: 100, y: 80, width: 260, height: 48,
    });
  });

  it('accepts only finite content dimensions when deriving minimums', () => {
    expect(shapeMinimumSize('ellipse', Number.NaN, Number.POSITIVE_INFINITY)).toEqual({
      width: NODE_BASELINE_MIN_WIDTH,
      height: NODE_BASELINE_MIN_HEIGHT,
    });
  });

  it('keeps the public shape type assignable to every supported value', () => {
    const shapes: NodeShape[] = [...NODE_SHAPES];
    expect(shapes).toHaveLength(4);
  });
});
