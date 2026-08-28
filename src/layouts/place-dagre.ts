import { rankdirFromAngle, sectorAngles } from '../geometry/angles';
import { centerOf } from '../geometry/box';
import { computeArcRadius, computeRingRadius, lateralHalfExtent } from '../geometry/extents';
import { descendantCount, greedySlotOrder } from '../geometry/order';
import { collectSubtreeIds } from '../tree';
import type { LayoutEdge } from '../types';
import { layoutSubtreeLocal } from './dagre-subtree';
import { type PlaceDirectChildrenArgs, placeLightChildren } from './place-children';
import { placeSubtreeAt } from './place';
import { placeShallowPocket, shallowEdges } from './shallow-pocket';

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

/** Remaining descendants as one Dagre tree, translated so the parent stays put. */
export function placeDagreSubtreeChildren(args: Omit<PlaceDirectChildrenArgs, 'mode'>): void {
  const kidIds = args.children.get(args.parentId) ?? [];
  if (kidIds.length === 0) return;
  const parentPos = args.positionById.get(args.parentId);
  const parentNode = args.nodesById.get(args.parentId);
  if (!parentPos || !parentNode) return;

  const theta = args.outboundTheta ?? Math.PI / 2;
  const rankdir = rankdirFromAngle(theta);
  const subtreeIds = collectSubtreeIds(args.children, args.parentId);
  const treeEdges: LayoutEdge[] = [];
  for (const [source, targets] of args.children) {
    for (const target of targets) {
      treeEdges.push({ source, target });
    }
  }
  const local = layoutSubtreeLocal(subtreeIds, treeEdges, args.nodesById, rankdir, args.spacing);
  placeSubtreeAt(subtreeIds, local, args.nodesById, args.parentId, centerOf(parentNode, parentPos), args.positionById);
}

function resolvedSectorThreshold(value: number | undefined): number | undefined {
  if (value == null || !Number.isFinite(value) || value < 1) return undefined;
  return Math.floor(value);
}

/** All layer modes, including Dagre. */
export function placeFullChildren(args: PlaceDirectChildrenArgs): void {
  switch (args.mode) {
    case 'dagre': {
      const threshold = resolvedSectorThreshold(args.sectorThreshold);
      if (threshold != null) {
        placeSectoredChildren({ ...args, threshold });
      } else {
        placeDagreChildren(args);
      }
      return;
    }
    case 'dagreSubtree':
      placeDagreSubtreeChildren(args);
      return;
    default:
      placeLightChildren(args);
  }
}
