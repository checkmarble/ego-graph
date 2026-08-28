import { describe, expect, it } from 'vitest';
import { normalizeAngle, slotAngle } from '../geometry/angles';
import {
  centerOf,
  classify,
  distance,
  graph,
  link,
  match,
  NODE_SIZE,
  node,
  satellite,
  type TestNode,
} from '../test-support';
import { customLayout } from './custom';
import { customLayout as dagreLayout } from './custom-dagre';
import type { CustomLayoutOptions } from './layer';

const RADIAL_RADIAL: CustomLayoutOptions = {
  ...classify,
  firstLayer: [{ mode: 'radial' }],
  nextLayers: { mode: 'radial' },
};

const SECTORED: CustomLayoutOptions = {
  ...classify,
  firstLayer: [{ mode: 'dagre', sectorThreshold: 5 }],
  nextLayers: { mode: 'dagre', sectorThreshold: 5 },
};

const RADIAL_SUBTREE: CustomLayoutOptions = {
  ...classify,
  firstLayer: [{ mode: 'radial' }],
  nextLayers: { mode: 'dagreSubtree' },
};

const LAYOUTS = [
  {
    name: 'radial then radial',
    run: (g: Parameters<typeof customLayout>[0], o?: CustomLayoutOptions) =>
      customLayout(g, { ...RADIAL_RADIAL, ...o }),
  },
  {
    name: 'sectored dagre',
    run: (g: Parameters<typeof dagreLayout>[0], o?: CustomLayoutOptions) => dagreLayout(g, { ...SECTORED, ...o }),
  },
  {
    name: 'radial then dagreSubtree',
    run: (g: Parameters<typeof dagreLayout>[0], o?: CustomLayoutOptions) => dagreLayout(g, { ...RADIAL_SUBTREE, ...o }),
  },
] as const;

describe('radial then dagreSubtree', () => {
  it('keeps a satellite out of the structural spanning tree', () => {
    const nodes = [node('start'), node('chiara'), node('other'), node('company'), satellite('same_ip:1')];
    const edges = [
      link('start', 'chiara'),
      link('start', 'other'),
      link('start', 'company'),
      match('same_ip:1', 'chiara'),
      match('same_ip:1', 'company'),
    ];

    const positions = dagreLayout(graph(nodes, edges, 'start'), RADIAL_SUBTREE);
    const start = centerOf(positions, nodes, 'start');
    const sat = centerOf(positions, nodes, 'same_ip:1');
    const chiara = centerOf(positions, nodes, 'chiara');

    expect(start.x).toBeCloseTo(0, 0);
    expect(start.y).toBeCloseTo(0, 0);

    expect(distance(sat, start)).toBeGreaterThan(distance(chiara, start));
    expect(Math.abs(sat.x)).toBeGreaterThan(40);
  });

  it('places an associative-only chain as an island under the claiming satellite', () => {
    const nodes = [node('start'), node('anchor'), node('orphan_a'), node('orphan_b'), satellite('ip')];
    const edges = [
      link('start', 'anchor'),
      match('ip', 'anchor'),
      match('ip', 'orphan_a'),
      link('orphan_a', 'orphan_b'),
    ];

    const positions = dagreLayout(graph(nodes, edges, 'start'), RADIAL_SUBTREE);
    for (const id of ['orphan_a', 'orphan_b', 'ip']) {
      expect(positions.get(id)).toBeDefined();
    }

    const ip = centerOf(positions, nodes, 'ip');
    const orphanA = centerOf(positions, nodes, 'orphan_a');
    expect(distance(orphanA, ip)).toBeLessThan(distance(orphanA));
  });

  it('fans two satellites that want the same side', () => {
    const nodes = [node('start'), node('east'), satellite('ip_a'), satellite('ip_b')];
    const edges = [link('start', 'east'), match('ip_a', 'east'), match('ip_b', 'east')];

    const positions = dagreLayout(graph(nodes, edges, 'start'), RADIAL_SUBTREE);
    const a = centerOf(positions, nodes, 'ip_a');
    const b = centerOf(positions, nodes, 'ip_b');

    expect(Math.abs(normalizeAngle(Math.atan2(a.y, a.x) - Math.atan2(b.y, b.x)))).toBeGreaterThan(0.05);
  });

  it('aims a satellite pocket at the centroid of its placed neighbours', () => {
    const nodes = [
      node('user_0001'),
      node('user_0002'),
      node('user_0003'),
      node('user_0004'),
      node('user_0012'),
      node('comp_0001'),
      satellite('same_ip'),
    ];
    const edges = [
      link('user_0001', 'user_0002'),
      link('user_0001', 'user_0003'),
      link('user_0001', 'user_0012'),
      link('user_0001', 'comp_0001'),
      link('user_0004', 'comp_0001'),
      match('same_ip', 'user_0003'),
      match('same_ip', 'comp_0001'),
      match('same_ip', 'user_0004'),
    ];

    const positions = dagreLayout(graph(nodes, edges, 'user_0001'), RADIAL_SUBTREE);
    const sat = centerOf(positions, nodes, 'same_ip');
    const chiara = centerOf(positions, nodes, 'user_0003');
    const company = centerOf(positions, nodes, 'comp_0001');
    const fourth = centerOf(positions, nodes, 'user_0004');

    expect(distance(centerOf(positions, nodes, 'user_0001'))).toBeLessThan(1);
    expect(distance(sat)).toBeGreaterThan(distance(chiara));

    const centroid = {
      x: (chiara.x + company.x + fourth.x) / 3,
      y: (chiara.y + company.y + fourth.y) / 3,
    };
    const preferred = Math.atan2(centroid.y, centroid.x);
    const actual = Math.atan2(sat.y, sat.x);
    expect(Math.abs(normalizeAngle(actual - preferred))).toBeLessThan(Math.PI / 2);
  });

  it('uses the largest free ring gap when a satellite has no placed anchors', () => {
    const nodes = [node('start'), node('n1'), node('n2'), node('n3'), satellite('orphan_ip')];
    const edges = [link('start', 'n1'), link('start', 'n2'), link('start', 'n3')];

    const positions = dagreLayout(graph(nodes, edges, 'start'), RADIAL_SUBTREE);
    const c = centerOf(positions, nodes, 'orphan_ip');

    expect(distance(c)).toBeGreaterThan(100);

    const satAngle = Math.atan2(c.y, c.x);
    for (const i of [0, 1, 2]) {
      expect(Math.abs(normalizeAngle(satAngle - slotAngle(i, 3)))).toBeGreaterThan(0.2);
    }
  });
});

describe.each(LAYOUTS)('$name', ({ run }) => {
  it('returns nothing for an empty graph', () => {
    expect(run(graph([], [], 'nope')).size).toBe(0);
  });

  it('centres the root at the origin', () => {
    const nodes = [node('root'), node('a'), node('b')];
    const positions = run(graph(nodes, [link('root', 'a'), link('root', 'b')], 'root'));
    expect(distance(centerOf(positions, nodes, 'root'))).toBeLessThan(1e-6);
  });

  it('falls back to the first node when the requested root is absent', () => {
    const nodes = [node('a'), node('b')];
    const positions = run(graph(nodes, [link('a', 'b')], 'ghost'));
    expect(distance(centerOf(positions, nodes, 'a'))).toBeLessThan(1e-6);
  });

  it('places every node exactly once, with no two overlapping', () => {
    const nodes = [node('root'), node('a'), node('b'), node('c'), node('d'), node('e'), satellite('sat')];
    const edges = [
      link('root', 'a'),
      link('root', 'b'),
      link('root', 'c'),
      link('a', 'd'),
      link('b', 'e'),
      match('sat', 'd'),
    ];

    const positions = run(graph(nodes, edges, 'root'));
    expect(positions.size).toBe(nodes.length);
    expectNoOverlaps(nodes, positions);
  });

  it('gives an orphan component a pocket even with no satellite to claim it', () => {
    const nodes = [node('root'), node('a'), node('far_a'), node('far_b')];
    const edges = [link('root', 'a'), match('root', 'far_a'), link('far_a', 'far_b')];

    const positions = run(graph(nodes, edges, 'root'));
    expect(positions.size).toBe(nodes.length);

    expect(distance(centerOf(positions, nodes, 'far_a'))).toBeGreaterThan(100);
    expect(distance(centerOf(positions, nodes, 'far_b'))).toBeGreaterThan(100);
    expectNoOverlaps(nodes, positions);
  });

  it('honours a getWeight override when ordering ring slots', () => {
    const kids = ['alpha', 'beta', 'delta', 'epsilon', 'gamma', 'zeta'];
    const nodes = [node('root'), ...kids.map((id) => node(id))];
    const edges = kids.map((id) => link('root', id));

    const base = run(graph(nodes, edges, 'root'));
    const weighted = run(graph(nodes, edges, 'root'), {
      getWeight: (n: TestNode) => (n.id === 'zeta' ? 20 : 1),
    });

    const before = centerOf(base, nodes, 'zeta');
    const after = centerOf(weighted, nodes, 'zeta');
    expect(distance(before, after)).toBeGreaterThan(1);
  });

  it('treats every edge as structural and every node as ordinary by default', () => {
    const nodes = [node('root'), node('a'), node('b')];
    const positions = run(graph(nodes, [match('root', 'a'), match('a', 'b')], 'root'), {
      isStructural: () => true,
      isSatellite: () => false,
    });
    expect(positions.size).toBe(3);
    expect(distance(centerOf(positions, nodes, 'b'))).toBeGreaterThan(0);
  });
});

describe('radial-then-radial pocket sizing', () => {
  it('keeps multi-level islands from overlapping', () => {
    const nodes = [
      node('root'),
      node('east'),
      satellite('s1'),
      satellite('s2'),
      node('a1'),
      node('a2'),
      node('a3'),
      node('b1'),
      node('b2'),
      node('b3'),
    ];
    const edges = [
      link('root', 'east'),
      match('s1', 'east'),
      match('s2', 'east'),
      match('s1', 'a1'),
      link('a1', 'a2'),
      link('a1', 'a3'),
      match('s2', 'b1'),
      link('b1', 'b2'),
      link('b1', 'b3'),
    ];

    const positions = customLayout(graph(nodes, edges, 'root'), RADIAL_RADIAL);
    expect(positions.size).toBe(nodes.length);
    expectNoOverlaps(nodes, positions);
  });
});

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
