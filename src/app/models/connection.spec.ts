import { describe, it, expect } from 'vitest';
import {
  Connection,
  DEFAULT_ROUTE_STYLE,
  DEFAULT_STROKE_PATTERN,
  DEFAULT_STROKE_WEIGHT,
  effectiveRouteStyle,
  effectiveStrokePattern,
  effectiveStrokeWeight,
  strokeWidthPx,
  strokeDasharray,
} from './connection';

// A minimal Connection carrying no optional styling
function makeConn(extra: Partial<Connection> = {}): Connection {
  return {
    id: 'c1',
    sourceNodeId: 'n1',
    sourceHandle: 'right',
    targetNodeId: 'n2',
    targetHandle: 'left',
    ...extra,
  };
}

describe('effectiveStrokePattern', () => {
  it('falls back to solid when no pattern is stored', () => {
    expect(DEFAULT_STROKE_PATTERN).toBe('solid');
    expect(effectiveStrokePattern(makeConn())).toBe('solid');
  });

  it('returns the stored pattern', () => {
    expect(effectiveStrokePattern(makeConn({ strokePattern: 'dashed' }))).toBe('dashed');
    expect(effectiveStrokePattern(makeConn({ strokePattern: 'dotted' }))).toBe('dotted');
  });
});

describe('effectiveStrokeWeight', () => {
  it('falls back to normal when no weight is stored', () => {
    expect(DEFAULT_STROKE_WEIGHT).toBe('normal');
    expect(effectiveStrokeWeight(makeConn())).toBe('normal');
  });

  it('returns the stored weight', () => {
    expect(effectiveStrokeWeight(makeConn({ strokeWeight: 'thin' }))).toBe('thin');
    expect(effectiveStrokeWeight(makeConn({ strokeWeight: 'thick' }))).toBe('thick');
  });
});

describe('effectiveRouteStyle', () => {
  it('falls back to curve when no style is stored', () => {
    expect(DEFAULT_ROUTE_STYLE).toBe('curve');
    expect(effectiveRouteStyle(makeConn())).toBe('curve');
  });

  it('returns the stored style', () => {
    expect(effectiveRouteStyle(makeConn({ routeStyle: 'orthogonal' }))).toBe('orthogonal');
    expect(effectiveRouteStyle(makeConn({ routeStyle: 'curve' }))).toBe('curve');
  });
});

describe('strokeWidthPx', () => {
  it('normal matches the pre-feature widths exactly (2.5 / 3.5 hover / 4 selected)', () => {
    expect(strokeWidthPx('normal', 'base')).toBe(2.5);
    expect(strokeWidthPx('normal', 'hover')).toBe(3.5);
    expect(strokeWidthPx('normal', 'selected')).toBe(4);
  });

  it('thin and thick are fixed presets around the normal base', () => {
    expect(strokeWidthPx('thin', 'base')).toBe(1.5);
    expect(strokeWidthPx('thick', 'base')).toBe(4.5);
  });

  it('selection and hover thicken relatively — a fixed increment on top of every weight (ADR-0020)', () => {
    expect(strokeWidthPx('thin', 'hover')).toBe(2.5);
    expect(strokeWidthPx('thin', 'selected')).toBe(3);
    expect(strokeWidthPx('thick', 'hover')).toBe(5.5);
    expect(strokeWidthPx('thick', 'selected')).toBe(6);
  });
});

describe('strokeDasharray', () => {
  it('solid draws without a dasharray at any width', () => {
    expect(strokeDasharray('solid', 2.5)).toBeNull();
    expect(strokeDasharray('solid', 4.5)).toBeNull();
  });

  it('dashed rhythm is 3x width dash with a 2x width gap', () => {
    expect(strokeDasharray('dashed', 2.5)).toBe('7.5 5');
  });

  it('dotted rhythm is a dot with a 2x width gap', () => {
    expect(strokeDasharray('dotted', 2.5)).toBe('0.1 5');
  });

  it('rhythms scale proportionally with the stroke width (ADR-0020)', () => {
    expect(strokeDasharray('dashed', 4.5)).toBe('13.5 9');
    expect(strokeDasharray('dotted', 1.5)).toBe('0.1 3');
  });
});
