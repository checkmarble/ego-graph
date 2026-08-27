import { rankdirFromAngle, sectorAngles } from '../geometry/angles';
import { computeArcRadius, computeRingRadius, lateralHalfExtent } from '../geometry/extents';
import { descendantCount, greedySlotOrder } from '../geometry/order';
import type { LayoutNode, Point, SpacingOptions } from '../types';
import { placeBubbleChildren } from './bubble';
import { placeCloudChildren } from './cloud';
import { layoutSubtreeLocal } from './dagre-subtree';
import type { DistributionName } from './layer';
import { placeRadialChildren } from './polar-subtree';
import { placeShallowPocket, shallowEdges } from './shallow-pocket';

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
};

/** One shallow Dagre pocket along the outbound ray (straight down at the root). */
export function placeDagreChildren(args: Omit<PlaceDirectChildrenArgs, 'mode'>): void {
  const kidIds = args.children.get(args.parentId) ?? [];
  if (kidIds.length === 0) return;
  placeShallowPocket({
    parentId: args.parentId,
    kidIds,
    theta: args.outboundTheta ?? Math.PI / 2,
    nodesById: args.nodesById,
    positionById: args.positionById,
    spacing: args.spacing,
  });
}

/** Children per Dagre pocket before sectoredDagre splits into sectors. */
export const DEFAULT_SECTOR_THRESHOLD = 5;

/**
 * Balanced / sectored: one Dagre pocket below `threshold` children, otherwise
 * `ceil(n / threshold)` radial sectors of shallow pockets.
 */
export function placeSectoredChildren(args: PlaceDirectChildrenArgs & { threshold: number }): void {
  const { parentId, outboundTheta, children, nodesById, positionById, spacing, weightOf, threshold } = args;
  const kidIds = children.get(parentId) ?? [];
  const n = kidIds.length;
  if (n === 0) return;

  if (n < threshold) {
    placeDagreChildren(args);
    return;
  }

  const sectorCount = Math.ceil(n / threshold);
  const ordered = greedySlotOrder(kidIds.map((id) => ({ id, weight: descendantCount(children, id, weightOf) })));
  const sectors: string[][] = Array.from({ length: sectorCount }, () => []);
  ordered.forEach((id, i) => {
    sectors[i % sectorCount]!.push(id);
  });

  const thetas = sectorAngles(sectorCount, outboundTheta);
  const closed = outboundTheta == null;

  const lateralHalves: number[] = [];
  for (let s = 0; s < sectorCount; s++) {
    const kids = sectors[s]!;
    const rankdir = rankdirFromAngle(thetas[s]!);
    const ids = [parentId, ...kids];
    const local = layoutSubtreeLocal(ids, shallowEdges(parentId, kids), nodesById, rankdir, spacing);
    lateralHalves.push(lateralHalfExtent(ids, local, nodesById, parentId, rankdir));
  }

  const radius = closed
    ? computeRingRadius(lateralHalves, spacing)
    : computeArcRadius(lateralHalves, Math.PI / sectorCount, false, spacing);

  for (let s = 0; s < sectorCount; s++) {
    placeShallowPocket({
      parentId,
      kidIds: sectors[s]!,
      theta: thetas[s]!,
      nodesById,
      positionById,
      spacing,
      ringRadius: radius,
    });
  }
}

export function placeDirectChildren(args: PlaceDirectChildrenArgs): void {
  switch (args.mode) {
    case 'radial':
      placeRadialChildren(args);
      return;
    case 'dagre':
      placeDagreChildren(args);
      return;
    case 'bubble':
      placeBubbleChildren(args);
      return;
    case 'cloud':
      placeCloudChildren(args);
      return;
  }
}
