import { describe, expect, it } from 'vitest';
import { pickNextLayerSpec, resolveNextLayers } from './layer';

const BANDS = [
  { upTo: 5, mode: 'dagre' },
  { upTo: 20, mode: 'radial' },
  { mode: 'bubble' },
] as const;

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
});
