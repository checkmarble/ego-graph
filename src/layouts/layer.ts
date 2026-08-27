import type { LayoutEdge, LayoutNode, LayoutOptions } from '../types';
import type { CloudThreshold } from './cloud';

/** How a parent places its children. `cloud` is next-layers only. */
export const FIRST_LAYER_NAMES = ['radial', 'dagre', 'bubble'] as const;
export type FirstLayerMode = (typeof FIRST_LAYER_NAMES)[number];

export const DISTRIBUTION_NAMES = [...FIRST_LAYER_NAMES, 'cloud'] as const;
export type DistributionName = (typeof DISTRIBUTION_NAMES)[number];

const OPEN_BAND = Number.POSITIVE_INFINITY;

export type FirstLayerSpec = { mode: FirstLayerMode };
export type CloudLayerSpec = { mode: 'cloud'; threshold?: CloudThreshold };
export type LayerSpec = FirstLayerSpec | CloudLayerSpec;

/**
 * A next-layer band: use this spec while a parent has at most `upTo` children.
 * Omit `upTo` on the last band to catch everything remaining.
 */
export type NextLayerBand = LayerSpec & { upTo?: number };

export type NextLayersSpec = LayerSpec | readonly NextLayerBand[];

export type CustomLayoutOptions<N extends LayoutNode = LayoutNode, E extends LayoutEdge = LayoutEdge> = LayoutOptions<
  N,
  E
> & {
  /** Root's children. Default: radial. Cannot be `cloud`. */
  firstLayer?: FirstLayerSpec;
  /**
   * Every deeper parent. A single spec applies to all child counts; an array of
   * bands picks a spec from the parent's direct-child count. Default: radial.
   */
  nextLayers?: NextLayersSpec;
};

export function isFirstLayerMode(mode: string): mode is FirstLayerMode {
  return mode === 'radial' || mode === 'dagre' || mode === 'bubble';
}

/** Root / island first layer: `cloud` is not a legal mode and becomes radial. */
export function resolveFirstLayer(spec: { mode: string } | undefined): FirstLayerSpec {
  const mode = spec?.mode;
  if (mode != null && isFirstLayerMode(mode)) return { mode };
  return { mode: 'radial' };
}

export function resolveLayerSpec(spec: LayerSpec | undefined, fallbackMode: FirstLayerMode = 'radial'): LayerSpec {
  if (spec == null) return { mode: fallbackMode };
  if (spec.mode === 'cloud') {
    return spec.threshold == null ? { mode: 'cloud' } : { mode: 'cloud', threshold: spec.threshold };
  }
  return { mode: spec.mode };
}

function ceilingOf(band: NextLayerBand): number {
  return band.upTo == null ? OPEN_BAND : Math.max(1, Math.floor(band.upTo));
}

function specFromBand(band: NextLayerBand): LayerSpec {
  if (band.mode === 'cloud') {
    return band.threshold == null ? { mode: 'cloud' } : { mode: 'cloud', threshold: band.threshold };
  }
  return { mode: band.mode };
}

/** Empty input falls back to `fallbackMode`. */
export function resolveNextLayers(
  spec: readonly NextLayerBand[] | undefined,
  fallbackMode: FirstLayerMode = 'radial',
): NextLayerBand[] {
  if (spec == null || spec.length === 0) return [{ mode: fallbackMode }];
  return [...spec];
}

function isBandList(spec: NextLayersSpec): spec is readonly NextLayerBand[] {
  return Array.isArray(spec);
}

/**
 * A single `LayerSpec` applies to every child count. An array of bands picks
 * the spec from `childCount`.
 */
export function pickNextLayerSpec(
  childCount: number,
  spec: NextLayersSpec | undefined,
  fallbackMode: FirstLayerMode = 'radial',
): LayerSpec {
  if (spec != null && isBandList(spec)) {
    const bands = [...resolveNextLayers(spec, fallbackMode)].sort((a, b) => ceilingOf(a) - ceilingOf(b));
    const match = bands.find((band) => childCount <= ceilingOf(band)) ?? bands[bands.length - 1]!;
    return specFromBand(match);
  }
  return resolveLayerSpec(spec, fallbackMode);
}
