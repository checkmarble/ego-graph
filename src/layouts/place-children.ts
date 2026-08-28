import type { LayoutNode, Point, SpacingOptions } from '../types';
import { placeBubbleChildren } from './bubble';
import { placeCloudChildren } from './cloud';
import { DAGRE_ENTRY_HINT, type DistributionName } from './layer';
import { placeRadialChildren } from './polar-subtree';

export type PlaceDirectChildrenArgs = {
  parentId: string;
  outboundTheta: number | null;
  children: Map<string, string[]>;
  nodesById: Map<string, LayoutNode>;
  positionById: Map<string, Point>;
  spacing: Required<SpacingOptions>;
  weightOf: (id: string) => number;
  mode: DistributionName;
  cloudThreshold?: number;
  sectorThreshold?: number;
};

/** Radial, bubble, and cloud. Dagre modes throw so this module never imports Dagre. */
export function placeLightChildren(args: PlaceDirectChildrenArgs): void {
  switch (args.mode) {
    case 'radial':
      placeRadialChildren(args);
      return;
    case 'bubble':
      placeBubbleChildren(args);
      return;
    case 'cloud':
      placeCloudChildren(args);
      return;
    default:
      throw new Error(DAGRE_ENTRY_HINT);
  }
}
