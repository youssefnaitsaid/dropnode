import { findConnectionJumps, jumpGapRadius } from './connection-jumps';
import { connectionRoute, sampleRoute } from './curve';

describe('findConnectionJumps', () => {
  it('returns no gaps for an empty graph and a lone Connection', () => {
    expect(findConnectionJumps([])).toEqual({ gaps: new Map(), capped: false });
    const lone = findConnectionJumps([
      { id: 'a', points: [{ x: -100, y: 0 }, { x: 100, y: 0 }], width: 2.5 },
    ]);
    expect(lone.capped).toBe(false);
    expect(lone.gaps.size).toBe(0);
  });

  it('breaks the lower-painted Connection at a proper crossing', () => {
    const result = findConnectionJumps([
      { id: 'lower', points: [{ x: -100, y: 0 }, { x: 100, y: 0 }], width: 2.5 },
      { id: 'upper', points: [{ x: 0, y: -100 }, { x: 0, y: 100 }], width: 2.5 },
    ]);
    expect(result.capped).toBe(false);
    expect([...result.gaps.keys()]).toEqual(['lower']);
    const gaps = result.gaps.get('lower')!;
    expect(gaps).toHaveLength(1);
    expect(gaps[0].x).toBeCloseTo(0, 5);
    expect(gaps[0].y).toBeCloseTo(0, 5);
  });

  it('leaves parallel Connections unbroken', () => {
    const result = findConnectionJumps([
      { id: 'a', points: [{ x: -100, y: -20 }, { x: 100, y: -20 }], width: 2.5 },
      { id: 'b', points: [{ x: -100, y: 20 }, { x: 100, y: 20 }], width: 2.5 },
    ]);
    expect(result.gaps.size).toBe(0);
  });

  it('ignores touches at shared endpoints and inside Arrowhead zones', () => {
    const result = findConnectionJumps([
      { id: 'a', points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], width: 2.5 },
      { id: 'b', points: [{ x: 0, y: 0 }, { x: 0, y: 100 }], width: 2.5 },
    ]);
    expect(result.gaps.size).toBe(0);
  });

  it('keeps crossings far from every endpoint', () => {
    const result = findConnectionJumps([
      { id: 'a', points: [{ x: -100, y: 0 }, { x: 100, y: 0 }], width: 2.5 },
      { id: 'b', points: [{ x: 50, y: -100 }, { x: 50, y: -50 }, { x: 50, y: 100 }], width: 2.5 },
    ]);
    expect(result.gaps.get('a')).toHaveLength(1);
    expect(result.gaps.get('a')![0].x).toBeCloseTo(50, 5);
  });

  it('always breaks the earlier paint index, whatever the geometry', () => {
    const vertical = { id: 'v', points: [{ x: 0, y: -100 }, { x: 0, y: 100 }], width: 2.5 };
    const horizontal = { id: 'h', points: [{ x: -100, y: 0 }, { x: 100, y: 0 }], width: 2.5 };
    expect([...findConnectionJumps([vertical, horizontal]).gaps.keys()]).toEqual(['v']);
    expect([...findConnectionJumps([horizontal, vertical]).gaps.keys()]).toEqual(['h']);
  });

  it('reports one gap for a crossing exactly on a polyline vertex', () => {
    const result = findConnectionJumps([
      { id: 'a', points: [{ x: -100, y: 0 }, { x: 0, y: 0 }, { x: 100, y: 0 }], width: 2.5 },
      { id: 'b', points: [{ x: 0, y: -100 }, { x: 0, y: 100 }], width: 2.5 },
    ]);
    expect(result.gaps.get('a')).toHaveLength(1);
  });

  it('drops coincident pairs instead of gapping the whole overlap', () => {
    const forward = { id: 'f', points: [{ x: -100, y: 0 }, { x: 100, y: 0 }], width: 2.5 };
    const reverse = { id: 'r', points: [{ x: 100, y: 0 }, { x: 50, y: 0 }, { x: 0, y: 0 }, { x: -50, y: 0 }, { x: -100, y: 0 }], width: 2.5 };
    const result = findConnectionJumps([forward, reverse]);
    expect(result.gaps.size).toBe(0);
    expect(result.capped).toBe(false);
  });

  it('hides every jump past the intersection cap', () => {
    const routes = [];
    for (let i = 0; i < 30; i++) {
      routes.push({
        id: `h${i}`,
        points: [{ x: -300, y: i * 10 }, { x: 300, y: i * 10 }],
        width: 2.5,
      });
      routes.push({
        id: `v${i}`,
        points: [{ x: i * 10, y: -300 }, { x: i * 10, y: 300 }],
        width: 2.5,
      });
    }
    const result = findConnectionJumps(routes);
    expect(result.capped).toBe(true);
    expect(result.gaps.size).toBe(0);
  });

  it('finds crossings on sampled orthogonal routes', () => {
    const horizontal = connectionRoute({ x: 0, y: 0 }, { x: 300, y: 0 }, 'right', 'left', [], 'orthogonal');
    const vertical = connectionRoute({ x: 150, y: -150 }, { x: 150, y: 150 }, 'bottom', 'top', [], 'orthogonal');
    const result = findConnectionJumps([
      { id: 'h', points: sampleRoute(horizontal, 16), width: 2.5 },
      { id: 'v', points: sampleRoute(vertical, 16), width: 2.5 },
    ]);
    expect(result.capped).toBe(false);
    expect(result.gaps.get('h')).toHaveLength(1);
  });

  it('finds crossings on sampled routed curves with Reroute Points', () => {
    const upper = connectionRoute({ x: 0, y: 0 }, { x: 300, y: 0 }, 'right', 'left', [{ x: 150, y: -120 }]);
    const straight = connectionRoute({ x: 0, y: -60 }, { x: 300, y: -60 }, 'right', 'left');
    const result = findConnectionJumps([
      { id: 'curve', points: sampleRoute(upper, 16), width: 2.5 },
      { id: 'plain', points: sampleRoute(straight, 16), width: 2.5 },
    ]);
    expect(result.capped).toBe(false);
    expect((result.gaps.get('curve') ?? []).length).toBeGreaterThan(0);
  });

  it('keeps every gap of a genuinely woven pair below the pair cap', () => {
    const zigzag = [];
    for (let x = -100; x <= 100; x += 10) {
      zigzag.push({ x, y: (x / 10) % 2 === 0 ? -10 : 10 });
    }
    const result = findConnectionJumps([
      { id: 'line', points: [{ x: -100, y: 0 }, { x: 100, y: 0 }], width: 2.5 },
      { id: 'zigzag', points: zigzag, width: 2.5 },
    ]);
    expect(result.capped).toBe(false);
    expect(result.gaps.get('line')!.length).toBeGreaterThan(10);
  });
});

describe('jumpGapRadius', () => {
  it('scales with Stroke Weight from spec literals', () => {
    expect(jumpGapRadius(1.5)).toBeCloseTo(4.25, 5);
    expect(jumpGapRadius(2.5)).toBeCloseTo(5.75, 5);
    expect(jumpGapRadius(4.5)).toBeCloseTo(8.75, 5);
  });
});
