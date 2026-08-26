import type { LayoutEdge, LayoutNode, LayoutOptions } from '../types';

/** How a parent places its children. */
export const DISTRIBUTION_NAMES = ['radial', 'dagre', 'cloud'] as const;

export type DistributionName = (typeof DISTRIBUTION_NAMES)[number];

const OPEN_BAND = Number.POSITIVE_INFINITY;

/**
 * How one depth of the spanning tree places its direct children.
 *
 * `radial` is polarPetal's ring / hemisphere.
 * `dagre` is a shallow Dagre pocket along the outbound ray.
 * `cloud` packs children into concentric rings so the group stays round.
 */
export type LayerSpec = {
  mode: DistributionName;
};

/**
 * A next-layer band: use `mode` while a parent has at most `upTo` children.
 * Omit `upTo` on the last band to catch everything remaining.
 */
export type NextLayerBand = {
  mode: DistributionName;
  upTo?: number;
};

export type NextLayersSpec = LayerSpec | readonly NextLayerBand[];

export type CustomLayoutOptions<N extends LayoutNode = LayoutNode, E extends LayoutEdge = LayoutEdge> = LayoutOptions<
  N,
  E
> & {
  /** Root's children. Default: radial. */
  firstLayer?: LayerSpec;
  /**
   * Every deeper parent. A single spec applies to all child counts; an array of
   * bands picks a mode from the parent's direct-child count. Default: radial.
   */
  nextLayers?: NextLayersSpec;
};

export function resolveLayerSpec(spec: LayerSpec | undefined, fallbackMode: DistributionName): LayerSpec {
  return { mode: spec?.mode ?? fallbackMode };
}

function ceilingOf(band: NextLayerBand): number {
  return band.upTo == null ? OPEN_BAND : Math.max(1, Math.floor(band.upTo));
}

/** Empty input falls back to `fallbackMode`. */
export function resolveNextLayers(
  spec: readonly NextLayerBand[] | undefined,
  fallbackMode: DistributionName = 'radial',
): NextLayerBand[] {
  if (spec == null || spec.length === 0) return [{ mode: fallbackMode }];
  return [...spec];
}

function isBandList(spec: NextLayersSpec): spec is readonly NextLayerBand[] {
  return Array.isArray(spec);
}

/**
 * A single `LayerSpec` applies to every child count. An array of bands picks
 * `mode` from `childCount`.
 */
export function pickNextLayerSpec(
  childCount: number,
  spec: NextLayersSpec | undefined,
  fallbackMode: DistributionName = 'radial',
): LayerSpec {
  if (spec != null && isBandList(spec)) {
    const bands = [...resolveNextLayers(spec, fallbackMode)].sort((a, b) => ceilingOf(a) - ceilingOf(b));
    const match = bands.find((band) => childCount <= ceilingOf(band)) ?? bands[bands.length - 1]!;
    return { mode: match.mode };
  }
  return resolveLayerSpec(spec, fallbackMode);
}
