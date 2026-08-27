import { slotAngle } from '../geometry/angles';
import { aabbHalfPerp, aabbHalfRadial, centerOf, topLeftFromCenter } from '../geometry/box';
import { computeRingRadius } from '../geometry/extents';
import { descendantCount, greedySlotOrder } from '../geometry/order';
import type { LayoutNode, Point, SpacingOptions } from '../types';

export type PlaceBubbleArgs = {
  parentId: string;
  outboundTheta: number | null;
  children: Map<string, string[]>;
  nodesById: Map<string, LayoutNode>;
  positionById: Map<string, Point>;
  spacing: Required<SpacingOptions>;
  weightOf: (id: string) => number;
};

/** Split `n` nodes into rings whose capacities grow  T, 2T, 3T, … so the envelope stays round. */
export function bubbleRingCounts(n: number, threshold: number): number[] {
  const t = Math.max(1, Math.floor(threshold));
  const rings: number[] = [];
  let left = n;
  let k = 0;
  while (left > 0) {
    const cap = t * (k + 1);
    const take = Math.min(cap, left);
    rings.push(take);
    left -= take;
    k++;
  }
  return rings;
}

function splitRings(ordered: string[], threshold: number): string[][] {
  const counts = bubbleRingCounts(ordered.length, threshold);
  const rings: string[][] = [];
  let offset = 0;
  for (const count of counts) {
    rings.push(ordered.slice(offset, offset + count));
    offset += count;
  }
  return rings;
}

/**
 * Pack direct children into concentric rings around a local origin, then sit
 * that disk on the parent (root) or in front of it along the outbound ray.
 */
export function placeBubbleChildren(args: PlaceBubbleArgs): void {
  const { parentId, outboundTheta, children, nodesById, positionById, spacing, weightOf } = args;
  const kidIds = children.get(parentId) ?? [];
  if (kidIds.length === 0) return;

  const parentPos = positionById.get(parentId);
  const parentNode = nodesById.get(parentId);
  if (!parentPos || !parentNode) return;

  const parentCenter = centerOf(parentNode, parentPos);
  const ordered = greedySlotOrder(kidIds.map((id) => ({ id, weight: descendantCount(children, id, weightOf) })));
  const rings = splitRings(ordered, spacing.innerRingCapacity);

  const local = new Map<string, Point>();
  let occupied = 0;

  for (let r = 0; r < rings.length; r++) {
    const ring = rings[r]!;
    const thetas = ring.map((_, i) => slotAngle(i, ring.length));
    const lateralHalves = ring.map((id, i) => {
      const kidNode = nodesById.get(id)!;
      return aabbHalfPerp(kidNode.width, kidNode.height, thetas[i]!);
    });
    const siblingRadius = computeRingRadius(lateralHalves, spacing);
    let maxHalfRadial = 0;
    for (let i = 0; i < ring.length; i++) {
      const kidNode = nodesById.get(ring[i]!)!;
      maxHalfRadial = Math.max(maxHalfRadial, aabbHalfRadial(kidNode.width, kidNode.height, thetas[i]!));
    }

    const ringGap = r === 0 ? 0 : spacing.rankSep;
    const rNeeded = Math.max(siblingRadius, occupied + maxHalfRadial + ringGap);

    for (let i = 0; i < ring.length; i++) {
      const kidId = ring[i]!;
      const kidNode = nodesById.get(kidId)!;
      const theta = thetas[i]!;
      const cx = rNeeded * Math.cos(theta);
      const cy = rNeeded * Math.sin(theta);
      local.set(kidId, topLeftFromCenter({ x: cx, y: cy }, kidNode.width, kidNode.height));
    }

    occupied = rNeeded + maxHalfRadial;
  }

  let origin = parentCenter;
  if (outboundTheta != null) {
    let bubbleRadius = 0;
    for (const kidId of ordered) {
      const pos = local.get(kidId);
      const kidNode = nodesById.get(kidId);
      if (!pos || !kidNode) continue;
      const c = centerOf(kidNode, pos);
      bubbleRadius = Math.max(bubbleRadius, Math.hypot(c.x, c.y) + Math.hypot(kidNode.width / 2, kidNode.height / 2));
    }
    const parentClear =
      aabbHalfRadial(parentNode.width, parentNode.height, outboundTheta) + spacing.ringPadding + bubbleRadius;
    origin = {
      x: parentCenter.x + parentClear * Math.cos(outboundTheta),
      y: parentCenter.y + parentClear * Math.sin(outboundTheta),
    };
  }

  for (const kidId of ordered) {
    const pos = local.get(kidId);
    if (!pos) continue;
    positionById.set(kidId, { x: pos.x + origin.x, y: pos.y + origin.y });
  }
}
