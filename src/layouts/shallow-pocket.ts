import { rankdirAxisAngle, rankdirFromAngle, rotateOffset } from '../geometry/angles';
import { centerOf, topLeftFromCenter } from '../geometry/box';
import { lateralHalfExtent } from '../geometry/extents';
import type { LayoutEdge, LayoutNode, Point, SpacingOptions } from '../types';
import { layoutSubtreeLocal } from './dagre-subtree';

export function shallowEdges(parentId: string, kidIds: string[]): LayoutEdge[] {
  return kidIds.map((target) => ({ source: parentId, target }));
}

export type ShallowPocketArgs = {
  parentId: string;
  kidIds: string[];
  theta: number;
  nodesById: Map<string, LayoutNode>;
  positionById: Map<string, Point>;
  spacing: Required<SpacingOptions>;
  /** Push the pocket out so the innermost child clears this radius from the parent. */
  ringRadius?: number;
};

/**
 * Place direct children with a shallow Dagre pocket, rotated so the rank axis
 * aligns with `theta`. Returns the pocket's lateral half-extent.
 */
export function placeShallowPocket(args: ShallowPocketArgs): number {
  const { parentId, kidIds, theta, nodesById, positionById, spacing, ringRadius } = args;
  if (kidIds.length === 0) return 0;

  const parentPos = positionById.get(parentId);
  const parentNode = nodesById.get(parentId);
  if (!parentPos || !parentNode) return 0;

  const parentCenter = centerOf(parentNode, parentPos);

  const rankdir = rankdirFromAngle(theta);
  const ids = [parentId, ...kidIds];
  const local = layoutSubtreeLocal(ids, shallowEdges(parentId, kidIds), nodesById, rankdir, spacing);
  const lateralHalf = lateralHalfExtent(ids, local, nodesById, parentId, rankdir);

  const localParent = local.get(parentId);
  if (!localParent) return lateralHalf;
  const localParentCenter = {
    x: localParent.x + parentNode.width / 2,
    y: localParent.y + parentNode.height / 2,
  };

  const delta = theta - rankdirAxisAngle(rankdir);
  const unit = { x: Math.cos(theta), y: Math.sin(theta) };

  const placements: Array<{ id: string; offset: Point }> = [];
  let minProj = Infinity;

  for (const kidId of kidIds) {
    const localKid = local.get(kidId);
    const kidNode = nodesById.get(kidId);
    if (!localKid || !kidNode) continue;
    const localKidCenter = {
      x: localKid.x + kidNode.width / 2,
      y: localKid.y + kidNode.height / 2,
    };
    const rotated = rotateOffset(localKidCenter.x - localParentCenter.x, localKidCenter.y - localParentCenter.y, delta);
    minProj = Math.min(minProj, rotated.x * unit.x + rotated.y * unit.y);
    placements.push({ id: kidId, offset: rotated });
  }

  const push = ringRadius != null && Number.isFinite(minProj) ? Math.max(0, ringRadius - minProj) : 0;

  for (const { id, offset } of placements) {
    const kidNode = nodesById.get(id)!;
    const cx = parentCenter.x + offset.x + push * unit.x;
    const cy = parentCenter.y + offset.y + push * unit.y;
    positionById.set(id, topLeftFromCenter({ x: cx, y: cy }, kidNode.width, kidNode.height));
  }

  return lateralHalf;
}
