import { describe, expect, it } from 'vitest';
import {
  centerOf,
  classify,
  distance,
  graph,
  link,
  match,
  node,
  NODE_SIZE,
  satellite,
  type TestNode,
} from '../test-support';
import { bubbleRingCounts } from './bubble';
import { customLayout } from './custom';
import { customLayout as dagreLayout } from './custom-dagre';
import { DAGRE_ENTRY_HINT, type FirstLayerBand, type NextLayerBand } from './layer';

function expectNoOverlaps(nodes: TestNode[], positions: Map<string, { x: number; y: number }>): void {
  const placed = nodes.map((n) => ({ id: n.id, pos: positions.get(n.id)!, node: n })).filter((p) => p.pos);

  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i]!;
      const b = placed[j]!;
      const overlapX = Math.abs(a.pos.x - b.pos.x) < NODE_SIZE.width;
      const overlapY = Math.abs(a.pos.y - b.pos.y) < NODE_SIZE.height;
      if (overlapX && overlapY) {
        throw new Error(`${a.id} and ${b.id} overlap at ${JSON.stringify(a.pos)} / ${JSON.stringify(b.pos)}`);
      }
    }
  }
}

function positionsClose(
  a: Map<string, { x: number; y: number }>,
  b: Map<string, { x: number; y: number }>,
  ids: string[],
): void {
  expect(a.size).toBe(b.size);
  for (const id of ids) {
    const pa = a.get(id);
    const pb = b.get(id);
    expect(pa, id).toBeDefined();
    expect(pb, id).toBeDefined();
    expect(pa!.x, id).toBeCloseTo(pb!.x, 8);
    expect(pa!.y, id).toBeCloseTo(pb!.y, 8);
  }
}

describe('bubbleRingCounts', () => {
  it('grows T, 2T, 3T until n is filled', () => {
    expect(bubbleRingCounts(4, 6)).toEqual([4]);
    expect(bubbleRingCounts(6, 6)).toEqual([6]);
    expect(bubbleRingCounts(7, 6)).toEqual([6, 1]);
    expect(bubbleRingCounts(12, 4)).toEqual([4, 8]);
    expect(bubbleRingCounts(20, 4)).toEqual([4, 8, 8]);
  });
});

describe('customLayout', () => {
  it('places a radial-then-radial graph with a satellite', () => {
    const nodes = [node('root'), node('a'), node('b'), node('c'), node('d'), satellite('sat')];
    const edges = [link('root', 'a'), link('root', 'b'), link('a', 'c'), link('b', 'd'), match('sat', 'c')];
    const positions = customLayout(graph(nodes, edges, 'root'), {
      ...classify,
      firstLayer: [{ mode: 'radial' }],
      nextLayers: { mode: 'radial' },
    });
    expect(positions.size).toBe(nodes.length);
    expectNoOverlaps(nodes, positions);
    expect(distance(centerOf(positions, nodes, 'root'))).toBeLessThan(1e-6);
  });

  it('throws when a Dagre mode is used without the dagre entry', () => {
    const nodes = [node('root'), node('a')];
    const g = graph(nodes, [link('root', 'a')], 'root');
    expect(() => customLayout(g, { ...classify, firstLayer: [{ mode: 'dagre' }] })).toThrow(DAGRE_ENTRY_HINT);
    expect(() => customLayout(g, { ...classify, nextLayers: { mode: 'dagreSubtree' } })).toThrow(DAGRE_ENTRY_HINT);
  });

  it('packs a bubble of first-ring nodes into a round envelope with more than one ring', () => {
    const kids = Array.from({ length: 12 }, (_, i) => node(`k${i}`));
    const nodes = [node('root'), ...kids];
    const edges = kids.map((k) => link('root', k.id));
    const positions = customLayout(graph(nodes, edges, 'root'), {
      ...classify,
      firstLayer: [{ mode: 'bubble' }],
      nextLayers: { mode: 'radial' },
    });

    expect(positions.size).toBe(nodes.length);
    expectNoOverlaps(nodes, positions);
    expect(distance(centerOf(positions, nodes, 'root'))).toBeLessThan(1e-6);

    const radii = kids.map((k) => distance(centerOf(positions, nodes, k.id)));
    const minR = Math.min(...radii);
    const maxR = Math.max(...radii);
    expect(maxR).toBeGreaterThan(minR * 1.15);

    const xs = kids.map((k) => centerOf(positions, nodes, k.id).x);
    const ys = kids.map((k) => centerOf(positions, nodes, k.id).y);
    const width = Math.max(...xs) - Math.min(...xs);
    const height = Math.max(...ys) - Math.min(...ys);
    expect(width / height).toBeGreaterThan(0.65);
    expect(width / height).toBeLessThan(1.55);
  });

  it('spreads a bubble over more rings when innerRingCapacity is smaller', () => {
    const kids = Array.from({ length: 12 }, (_, i) => node(`k${i}`));
    const nodes = [node('root'), ...kids];
    const edges = kids.map((k) => link('root', k.id));
    const g = graph(nodes, edges, 'root');
    const radiusSpread = (innerRingCapacity: number) => {
      const positions = customLayout(g, { ...classify, firstLayer: [{ mode: 'bubble' }], innerRingCapacity });
      const radii = kids.map((k) => distance(centerOf(positions, nodes, k.id)));
      return Math.max(...radii) - Math.min(...radii);
    };
    expect(radiusSpread(4)).toBeGreaterThan(radiusSpread(12));
  });

  it('uses different distributions on the first ring and deeper layers', () => {
    const nodes = [node('root'), node('a'), node('b'), node('c'), node('a1'), node('a2'), node('a3')];
    const edges = [
      link('root', 'a'),
      link('root', 'b'),
      link('root', 'c'),
      link('a', 'a1'),
      link('a', 'a2'),
      link('a', 'a3'),
    ];
    const g = graph(nodes, edges, 'root');

    const bothRadial = customLayout(g, {
      ...classify,
      firstLayer: [{ mode: 'radial' }],
      nextLayers: { mode: 'radial' },
    });
    const bubbleDeeper = customLayout(g, {
      ...classify,
      firstLayer: [{ mode: 'radial' }],
      nextLayers: { mode: 'bubble' },
    });

    const a1Radial = centerOf(bothRadial, nodes, 'a1');
    const a1Bubble = centerOf(bubbleDeeper, nodes, 'a1');
    expect(distance(a1Radial, a1Bubble)).toBeGreaterThan(1);

    const rootKids = ['a', 'b', 'c'].map((id) => centerOf(bothRadial, nodes, id));
    const rootKidsBubble = ['a', 'b', 'c'].map((id) => centerOf(bubbleDeeper, nodes, id));
    for (let i = 0; i < 3; i++) {
      expect(rootKids[i]!.x).toBeCloseTo(rootKidsBubble[i]!.x, 5);
      expect(rootKids[i]!.y).toBeCloseTo(rootKidsBubble[i]!.y, 5);
    }
  });

  it('places every node once for dagre-then-bubble without overlaps', () => {
    const nodes = [node('root'), node('a'), node('b'), node('c'), node('d'), node('e'), satellite('sat')];
    const edges = [
      link('root', 'a'),
      link('root', 'b'),
      link('a', 'c'),
      link('a', 'd'),
      link('b', 'e'),
      match('sat', 'd'),
    ];
    const positions = dagreLayout(graph(nodes, edges, 'root'), {
      ...classify,
      firstLayer: [{ mode: 'dagre' }],
      nextLayers: { mode: 'bubble' },
    });
    expect(positions.size).toBe(nodes.length);
    expectNoOverlaps(nodes, positions);
  });

  it('picks the next-layer distribution from child-count bands', () => {
    const bands: NextLayerBand[] = [{ upTo: 5, mode: 'dagre' }, { upTo: 20, mode: 'radial' }, { mode: 'bubble' }];

    const graphWithKids = (n: number) => {
      const kids = Array.from({ length: n }, (_, i) => node(`k${i}`));
      const nodes = [node('root'), node('a'), ...kids];
      const edges = [link('root', 'a'), ...kids.map((kid) => link('a', kid.id))];
      return graph(nodes, edges, 'root');
    };

    const assertMatches = (n: number, mode: 'dagre' | 'radial' | 'bubble') => {
      const g = graphWithKids(n);
      const banded = dagreLayout(g, { ...classify, firstLayer: [{ mode: 'radial' }], nextLayers: bands });
      const expected = dagreLayout(g, { ...classify, firstLayer: [{ mode: 'radial' }], nextLayers: { mode } });
      positionsClose(
        banded,
        expected,
        g.nodes.map((n) => n.id),
      );
    };

    assertMatches(3, 'dagre');
    assertMatches(12, 'radial');
    assertMatches(24, 'bubble');
  });

  it('picks the first-layer distribution from child-count bands', () => {
    const bands: FirstLayerBand[] = [{ upTo: 5, mode: 'dagre' }, { upTo: 20, mode: 'radial' }, { mode: 'bubble' }];

    const graphWithKids = (n: number) => {
      const kids = Array.from({ length: n }, (_, i) => node(`k${i}`));
      const nodes = [node('root'), ...kids];
      const edges = kids.map((kid) => link('root', kid.id));
      return graph(nodes, edges, 'root');
    };

    const assertMatches = (n: number, mode: 'dagre' | 'radial' | 'bubble') => {
      const g = graphWithKids(n);
      const banded = dagreLayout(g, { ...classify, firstLayer: bands });
      const expected = dagreLayout(g, { ...classify, firstLayer: { mode } });
      positionsClose(
        banded,
        expected,
        g.nodes.map((n) => n.id),
      );
    };

    assertMatches(3, 'dagre');
    assertMatches(12, 'radial');
    assertMatches(24, 'bubble');
  });
});
