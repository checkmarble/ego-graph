import { describe, expect, it } from 'vitest';
import { pickFirstLayerSpec, pickNextLayerSpec, resolveFirstLayers, resolveNextLayers } from './layer';

const BANDS = [{ upTo: 5, mode: 'dagre' }, { upTo: 20, mode: 'radial' }, { mode: 'bubble' }] as const;

describe('pickNextLayerSpec', () => {
  it('uses dagre through 5, radial through 20, then bubble', () => {
    expect(pickNextLayerSpec(1, BANDS)).toEqual({ mode: 'dagre' });
    expect(pickNextLayerSpec(5, BANDS)).toEqual({ mode: 'dagre' });
    expect(pickNextLayerSpec(6, BANDS)).toEqual({ mode: 'radial' });
    expect(pickNextLayerSpec(20, BANDS)).toEqual({ mode: 'radial' });
    expect(pickNextLayerSpec(21, BANDS)).toEqual({ mode: 'bubble' });
    expect(pickNextLayerSpec(100, BANDS)).toEqual({ mode: 'bubble' });
  });

  it('treats a single spec as a catch-all band', () => {
    expect(pickNextLayerSpec(3, { mode: 'bubble' })).toEqual({ mode: 'bubble' });
    expect(pickNextLayerSpec(40, { mode: 'bubble' })).toEqual({ mode: 'bubble' });
  });

  it('falls back to the last band when every ceiling is below the child count', () => {
    expect(
      pickNextLayerSpec(50, [
        { upTo: 5, mode: 'dagre' },
        { upTo: 20, mode: 'radial' },
      ]),
    ).toEqual({ mode: 'radial' });
  });

  it('defaults to radial when nextLayers is omitted', () => {
    expect(pickNextLayerSpec(8, undefined)).toEqual({ mode: 'radial' });
    expect(resolveNextLayers(undefined)).toEqual([{ mode: 'radial' }]);
  });

  it('keeps the cloud threshold from the matching band', () => {
    expect(
      pickNextLayerSpec(30, [
        { upTo: 5, mode: 'dagre' },
        { mode: 'cloud', threshold: 13 },
      ]),
    ).toEqual({ mode: 'cloud', threshold: 13 });
  });

  it('keeps sectorThreshold from the matching dagre band', () => {
    expect(pickNextLayerSpec(4, [{ upTo: 5, mode: 'dagre', sectorThreshold: 5 }, { mode: 'radial' }])).toEqual({
      mode: 'dagre',
      sectorThreshold: 5,
    });
  });
});

describe('resolveFirstLayers', () => {
  it('defaults to a radial catch-all when omitted or empty', () => {
    expect(resolveFirstLayers(undefined)).toEqual([{ mode: 'radial' }]);
    expect(resolveFirstLayers([])).toEqual([{ mode: 'radial' }]);
  });

  it('wraps a single spec as a catch-all band', () => {
    expect(resolveFirstLayers({ mode: 'radial' })).toEqual([{ mode: 'radial' }]);
    expect(resolveFirstLayers({ mode: 'dagre', sectorThreshold: 5 })).toEqual([
      { mode: 'dagre', sectorThreshold: 5 },
    ]);
  });

  it('throws when a band is cloud', () => {
    expect(() => resolveFirstLayers({ mode: 'cloud' } as never)).toThrow(/outbound ray/);
    expect(() => resolveFirstLayers([{ mode: 'cloud' } as never])).toThrow(/outbound ray/);
  });
});

describe('pickFirstLayerSpec', () => {
  it('uses dagre through 5, radial through 20, then bubble', () => {
    expect(pickFirstLayerSpec(1, BANDS)).toEqual({ mode: 'dagre' });
    expect(pickFirstLayerSpec(5, BANDS)).toEqual({ mode: 'dagre' });
    expect(pickFirstLayerSpec(6, BANDS)).toEqual({ mode: 'radial' });
    expect(pickFirstLayerSpec(20, BANDS)).toEqual({ mode: 'radial' });
    expect(pickFirstLayerSpec(21, BANDS)).toEqual({ mode: 'bubble' });
  });

  it('treats a single spec as a catch-all band', () => {
    expect(pickFirstLayerSpec(3, { mode: 'bubble' })).toEqual({ mode: 'bubble' });
    expect(pickFirstLayerSpec(40, { mode: 'bubble' })).toEqual({ mode: 'bubble' });
  });

  it('preserves sectorThreshold on a matching dagre band', () => {
    expect(pickFirstLayerSpec(3, [{ upTo: 5, mode: 'dagre', sectorThreshold: 5 }, { mode: 'bubble' }])).toEqual({
      mode: 'dagre',
      sectorThreshold: 5,
    });
  });
});
