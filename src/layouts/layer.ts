import type { LayoutEdge, LayoutNode, LayoutOptions } from '../types';
import type { CloudThreshold } from './cloud';

/** How a parent places its children. `cloud` is next-layers only. */
export const FIRST_LAYER_NAMES = ['radial', 'dagre', 'bubble', 'dagreSubtree'] as const;
export type FirstLayerMode = (typeof FIRST_LAYER_NAMES)[number];

export const DISTRIBUTION_NAMES = [...FIRST_LAYER_NAMES, 'cloud'] as const;
export type DistributionName = (typeof DISTRIBUTION_NAMES)[number];

/** Children per Dagre pocket before a `sectorThreshold` splits into sectors. */
export const DEFAULT_SECTOR_THRESHOLD = 5;

export const DAGRE_ENTRY_HINT = "Install `@dagrejs/dagre` and `import { customLayout } from 'ego-graph/dagre'`.";

const OPEN_BAND = Number.POSITIVE_INFINITY;

export type RadialLayerSpec = { mode: 'radial' };
export type BubbleLayerSpec = { mode: 'bubble' };
export type DagreLayerSpec = { mode: 'dagre'; sectorThreshold?: number };
export type DagreSubtreeSpec = { mode: 'dagreSubtree' };
export type FirstLayerSpec = RadialLayerSpec | BubbleLayerSpec | DagreLayerSpec | DagreSubtreeSpec;
export type CloudLayerSpec = { mode: 'cloud'; threshold?: CloudThreshold };
export type LayerSpec = FirstLayerSpec | CloudLayerSpec;

/**
 * A first-layer band: use this spec while the root has at most `upTo` children.
 * Omit `upTo` on the last band to catch everything remaining.
 */
export type FirstLayerBand = FirstLayerSpec & { upTo?: number };
export type FirstLayersSpec = readonly FirstLayerBand[];

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
  /** Root's children as count bands. Default: `[{ mode: 'radial' }]`. Cannot include `cloud`. */
  firstLayer?: FirstLayersSpec;
  /**
   * Every deeper parent. A single spec applies to all child counts; an array of
   * bands picks a spec from the parent's direct-child count. Default: radial.
   */
  nextLayers?: NextLayersSpec;
};

export function isFirstLayerMode(mode: string): mode is FirstLayerMode {
  return mode === 'radial' || mode === 'dagre' || mode === 'bubble' || mode === 'dagreSubtree';
}

function ceilingOf(band: { upTo?: number }): number {
  return band.upTo == null ? OPEN_BAND : Math.max(1, Math.floor(band.upTo));
}

function specFromBand(band: NextLayerBand): LayerSpec {
  if (band.mode === 'cloud') {
    return band.threshold == null ? { mode: 'cloud' } : { mode: 'cloud', threshold: band.threshold };
  }
  if (band.mode === 'dagre') {
    return band.sectorThreshold == null ? { mode: 'dagre' } : { mode: 'dagre', sectorThreshold: band.sectorThreshold };
  }
  return { mode: band.mode };
}

function pickFromBands(childCount: number, bands: readonly NextLayerBand[]): LayerSpec {
  const sorted = [...bands].sort((a, b) => ceilingOf(a) - ceilingOf(b));
  const match = sorted.find((band) => childCount <= ceilingOf(band)) ?? sorted[sorted.length - 1]!;
  return specFromBand(match);
}

function modeNeedsDagre(mode: string | undefined): boolean {
  return mode === 'dagre' || mode === 'dagreSubtree';
}

function specNeedsDagre(spec: { mode?: string; sectorThreshold?: number } | undefined): boolean {
  if (spec == null) return false;
  return modeNeedsDagre(spec.mode) || spec.sectorThreshold != null;
}

/** True when the options would reach `@dagrejs/dagre`. */
export function optionsNeedDagre<N extends LayoutNode, E extends LayoutEdge>(
  options: CustomLayoutOptions<N, E>,
): boolean {
  if (options.firstLayer != null && options.firstLayer.some(specNeedsDagre)) return true;
  const next = options.nextLayers;
  if (next == null) return false;
  if (isBandList(next)) return next.some(specNeedsDagre);
  return specNeedsDagre(next);
}

/**
 * `undefined` → `[{ mode: 'radial' }]`. Empty, a non-array, or any `cloud`
 * band throws.
 */
export function resolveFirstLayers(spec: FirstLayersSpec | undefined): FirstLayerBand[] {
  if (spec == null) return [{ mode: 'radial' }];
  if (!Array.isArray(spec) || spec.length === 0) {
    throw new Error('firstLayer must be a non-empty array of bands');
  }
  for (const band of spec) {
    if (band.mode === 'cloud') {
      throw new Error('cloud cannot be a first-layer mode: the root has no outbound ray');
    }
  }
  return [...spec];
}

export function resolveLayerSpec(spec: LayerSpec | undefined, fallbackMode: FirstLayerMode = 'radial'): LayerSpec {
  if (spec == null) return { mode: fallbackMode };
  return specFromBand(spec);
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
    return pickFromBands(childCount, resolveNextLayers(spec, fallbackMode));
  }
  return resolveLayerSpec(spec, fallbackMode);
}

/** Picks a first-layer spec from count bands. `cloud` is not a legal match. */
export function pickFirstLayerSpec(childCount: number, bands: FirstLayersSpec): FirstLayerSpec {
  const spec = pickFromBands(childCount, bands);
  if (spec.mode === 'cloud') {
    throw new Error('cloud cannot be a first-layer mode: the root has no outbound ray');
  }
  return spec;
}
