import { describe, expect, it } from 'vitest';
import { normalizeAngle } from '../geometry/angles';
import { centerOf, classify, distance, graph, link, node } from '../test-support';
import { cloudLayerCounts, resolveCloudThreshold } from './cloud';
import { customLayout } from './custom';

describe('resolveCloudThreshold', () => {
  it('defaults to 8 and snaps to the nearest allowed value', () => {
    expect(resolveCloudThreshold(undefined)).toBe(8);
    expect(resolveCloudThreshold(Number.NaN)).toBe(8);
    expect(resolveCloudThreshold(6)).toBe(5);
    expect(resolveCloudThreshold(10)).toBe(8);
    expect(resolveCloudThreshold(21.7)).toBe(21);
    expect(resolveCloudThreshold(17)).toBe(13);
    expect(resolveCloudThreshold(0)).toBe(3);
    expect(resolveCloudThreshold(100)).toBe(21);
  });
});

describe('cloudLayerCounts', () => {
  it('matches the T=8 packing table', () => {
    const T = 8;
    expect(cloudLayerCounts(1, T)).toEqual([1]);
    expect(cloudLayerCounts(2, T)).toEqual([1, 1]);
    expect(cloudLayerCounts(3, T)).toEqual([1, 2]);
    expect(cloudLayerCounts(4, T)).toEqual([1, 2, 1]);
    expect(cloudLayerCounts(5, T)).toEqual([1, 2, 1, 1]);
    expect(cloudLayerCounts(7, T)).toEqual([1, 2, 3, 1]);
    expect(cloudLayerCounts(8, T)).toEqual([1, 2, 4, 1]);
    expect(cloudLayerCounts(9, T)).toEqual([1, 2, 3, 2, 1]);
    expect(cloudLayerCounts(10, T)).toEqual([1, 2, 3, 2, 1, 1]);
    expect(cloudLayerCounts(17, T)).toEqual([1, 2, 3, 5, 3, 2, 1]);
    expect(cloudLayerCounts(21, T)).toEqual([1, 2, 3, 5, 4, 3, 2, 1]);
    expect(cloudLayerCounts(26, T)).toEqual([1, 2, 3, 5, 8, 3, 2, 1, 1]);
    expect(cloudLayerCounts(30, T)).toEqual([1, 2, 3, 5, 8, 5, 3, 2, 1]);
    expect(cloudLayerCounts(40, T)).toEqual([1, 2, 3, 5, 8, 8, 5, 3, 2, 2, 1]);
  });

  it('sums to n and never exceeds T', () => {
    for (const T of [3, 5, 8, 13, 21]) {
      for (let n = 1; n <= 80; n++) {
        const layers = cloudLayerCounts(n, T);
        expect(layers.reduce((a, b) => a + b, 0)).toBe(n);
        expect(Math.max(...layers)).toBeLessThanOrEqual(T);
      }
    }
  });
});

describe('placeCloudChildren', () => {
  it('fans along the outbound ray instead of surrounding the parent', () => {
    const kids = Array.from({ length: 24 }, (_, i) => node(`k${i}`));
    const nodes = [node('root'), node('a'), ...kids];
    const edges = [link('root', 'a'), ...kids.map((kid) => link('a', kid.id))];
    const positions = customLayout(graph(nodes, edges, 'root'), {
      ...classify,
      firstLayer: [{ mode: 'radial' }],
      nextLayers: { mode: 'cloud', threshold: 8 },
    });

    expect(positions.size).toBe(nodes.length);
    const a = centerOf(positions, nodes, 'a');
    const ray = Math.atan2(a.y, a.x);
    for (const kid of kids) {
      const c = centerOf(positions, nodes, kid.id);
      const theta = Math.atan2(c.y - a.y, c.x - a.x);
      expect(Math.abs(normalizeAngle(theta - ray))).toBeLessThan(Math.PI / 2 + 1e-6);
    }
  });

  it('puts the heaviest child on the first layer, on the ray', () => {
    const kids = Array.from({ length: 24 }, (_, i) => node(`k${i}`));
    const grand = node('g0');
    const nodes = [node('root'), node('a'), ...kids, grand];
    const edges = [link('root', 'a'), ...kids.map((kid) => link('a', kid.id)), link('k0', 'g0')];
    const positions = customLayout(graph(nodes, edges, 'root'), {
      ...classify,
      firstLayer: [{ mode: 'radial' }],
      nextLayers: { mode: 'cloud', threshold: 8 },
    });

    const a = centerOf(positions, nodes, 'a');
    const k0 = centerOf(positions, nodes, 'k0');
    const ray = Math.atan2(a.y, a.x);
    const k0Theta = Math.atan2(k0.y - a.y, k0.x - a.x);
    expect(Math.abs(normalizeAngle(k0Theta - ray))).toBeLessThan(0.05);

    const k0Dist = distance(k0, a);
    for (const kid of kids) {
      if (kid.id === 'k0') continue;
      expect(distance(centerOf(positions, nodes, kid.id), a)).toBeGreaterThan(k0Dist - 1e-6);
    }
  });
});
