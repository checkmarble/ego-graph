import { aabbHalfPerp, aabbHalfRadial, centerOf, topLeftFromCenter } from '../geometry/box';
import { descendantCount } from '../geometry/order';
import type { LayoutNode, Point, SpacingOptions } from '../types';

export const CLOUD_THRESHOLDS = [3, 5, 8, 13, 21] as const;
export type CloudThreshold = (typeof CLOUD_THRESHOLDS)[number];
export const DEFAULT_CLOUD_THRESHOLD: CloudThreshold = 8;

const HEMISPHERE = Math.PI;

export type PlaceCloudArgs = {
  parentId: string;
  outboundTheta: number | null;
  children: Map<string, string[]>;
  nodesById: Map<string, LayoutNode>;
  positionById: Map<string, Point>;
  spacing: Required<SpacingOptions>;
  weightOf: (id: string) => number;
  cloudThreshold?: number;
};

/** Snap to the nearest allowed cloud threshold. Ties pick the smaller value. */
export function resolveCloudThreshold(value: number | undefined): CloudThreshold {
  if (value == null || !Number.isFinite(value)) return DEFAULT_CLOUD_THRESHOLD;
  let best: CloudThreshold = DEFAULT_CLOUD_THRESHOLD;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const candidate of CLOUD_THRESHOLDS) {
    const dist = Math.abs(candidate - value);
    if (dist < bestDist || (dist === bestDist && candidate < best)) {
      best = candidate;
      bestDist = dist;
    }
  }
  return best;
}

function fibonacciUpTo(peak: number): number[] {
  if (peak < 2) return [1];
  const seq = [1, 2];
  while (seq[seq.length - 1]! < peak) {
    const next = seq[seq.length - 1]! + seq[seq.length - 2]!;
    if (next > peak) break;
    seq.push(next);
  }
  return seq;
}

function diamond(peak: number): number[] {
  const climb = fibonacciUpTo(peak);
  const descent = climb.slice(0, -1).reverse();
  return [...climb, ...descent];
}

function sum(values: number[]): number {
  let total = 0;
  for (const value of values) total += value;
  return total;
}

/** Insert `r` into the descending run after the first peak, keeping the run descending. */
function spliceRemainder(layers: number[], r: number): number[] {
  const peakValue = Math.max(...layers);
  const peakIndex = layers.indexOf(peakValue);
  const head = layers.slice(0, peakIndex + 1);
  const suffix = layers.slice(peakIndex + 1);

  let lastGreater = -1;
  for (let i = 0; i < suffix.length; i++) {
    if (suffix[i]! > r) lastGreater = i;
  }
  let insertAt = lastGreater + 1;
  while (insertAt < suffix.length && suffix[insertAt] === r) insertAt++;
  return [...head, ...suffix.slice(0, insertAt), r, ...suffix.slice(insertAt)];
}

/**
 * Layer sizes for `n` children at threshold `T`: largest Fibonacci diamond that
 * fits, extra `T` plateaus, then one remainder spliced into the descent.
 */
export function cloudLayerCounts(n: number, threshold: number = DEFAULT_CLOUD_THRESHOLD): number[] {
  if (n <= 0) return [];
  const T = resolveCloudThreshold(threshold);

  let layers = diamond(1);
  for (const peak of fibonacciUpTo(T)) {
    const candidate = diamond(peak);
    if (sum(candidate) <= n) layers = candidate;
    else break;
  }

  let leftover = n - sum(layers);
  const peakValue = Math.max(...layers);
  const peakIndex = layers.indexOf(peakValue);
  const extraT = Math.floor(leftover / T);
  leftover %= T;
  if (extraT > 0) {
    const extra = Array.from({ length: extraT }, () => T);
    layers = [...layers.slice(0, peakIndex + 1), ...extra, ...layers.slice(peakIndex + 1)];
  }
  if (leftover > 0) layers = spliceRemainder(layers, leftover);
  return layers;
}

function heaviestFirst(kidIds: string[], children: Map<string, string[]>, weightOf: (id: string) => number): string[] {
  return [...kidIds].sort((a, b) => {
    const byWeight = descendantCount(children, b, weightOf) - descendantCount(children, a, weightOf);
    return byWeight !== 0 ? byWeight : a.localeCompare(b);
  });
}

function splitLayers(ordered: string[], counts: number[]): string[][] {
  const layers: string[][] = [];
  let offset = 0;
  for (const count of counts) {
    layers.push(ordered.slice(offset, offset + count));
    offset += count;
  }
  return layers;
}

/** Heaviest at the center (on-ray); next fill left, then right, repeating. */
function arcOrder(heaviestFirstIds: string[]): string[] {
  const n = heaviestFirstIds.length;
  if (n <= 1) return [...heaviestFirstIds];

  const slots: Array<string | undefined> = Array.from({ length: n });
  const remaining = [...heaviestFirstIds];
  let left: number;
  let right: number;
  if (n % 2 === 1) {
    const mid = (n - 1) / 2;
    slots[mid] = remaining.shift();
    left = mid - 1;
    right = mid + 1;
  } else {
    left = n / 2 - 1;
    right = n / 2;
    slots[left] = remaining.shift();
    slots[right] = remaining.shift();
    left -= 1;
    right += 1;
  }
  while (remaining.length > 0) {
    if (left >= 0) slots[left--] = remaining.shift();
    if (remaining.length > 0 && right < n) slots[right++] = remaining.shift();
  }
  return slots.filter((id): id is string => id != null);
}

function pairGap(leftHalf: number, rightHalf: number, radius: number, padding: number): number {
  const need = (leftHalf + rightHalf + padding) / (2 * radius);
  if (need >= 1) return HEMISPHERE;
  return 2 * Math.asin(need);
}

function layerThetas(
  spatial: string[],
  nodesById: Map<string, LayoutNode>,
  outboundTheta: number,
  radius: number,
  padding: number,
): { thetas: number[]; span: number } {
  const n = spatial.length;
  if (n === 0) return { thetas: [], span: 0 };
  if (n === 1) return { thetas: [outboundTheta], span: 0 };

  const halves = spatial.map((id) => {
    const node = nodesById.get(id)!;
    return aabbHalfPerp(node.width, node.height, outboundTheta);
  });
  const gaps: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    gaps.push(pairGap(halves[i]!, halves[i + 1]!, radius, padding));
  }
  const span = sum(gaps);
  const start = outboundTheta - span / 2;
  const thetas = [start];
  for (const gap of gaps) thetas.push(thetas[thetas.length - 1]! + gap);
  return { thetas, span };
}

function fitLayerRadius(
  spatial: string[],
  nodesById: Map<string, LayoutNode>,
  outboundTheta: number,
  rMin: number,
  padding: number,
): { radius: number; thetas: number[] } {
  if (spatial.length <= 1) {
    return { radius: rMin, thetas: [outboundTheta] };
  }

  let radius = Math.max(rMin, 1);
  for (let iter = 0; iter < 12; iter++) {
    const { thetas, span } = layerThetas(spatial, nodesById, outboundTheta, radius, padding);
    if (span <= HEMISPHERE + 1e-9) return { radius, thetas };
    radius *= span / HEMISPHERE;
  }
  const fitted = layerThetas(spatial, nodesById, outboundTheta, radius, padding);
  return { radius, thetas: fitted.thetas };
}

/**
 * Pack direct children into Fibonacci-sized arcs along the outbound ray.
 * Not valid at the root (no grandparent, no ray).
 */
export function placeCloudChildren(args: PlaceCloudArgs): void {
  const { parentId, children, nodesById, positionById, spacing, weightOf } = args;
  const kidIds = children.get(parentId) ?? [];
  if (kidIds.length === 0) return;

  const parentPos = positionById.get(parentId);
  const parentNode = nodesById.get(parentId);
  if (!parentPos || !parentNode) return;

  const parentCenter = centerOf(parentNode, parentPos);
  const outboundTheta = args.outboundTheta ?? Math.PI / 2;
  const ordered = heaviestFirst(kidIds, children, weightOf);
  const layers = splitLayers(ordered, cloudLayerCounts(ordered.length, args.cloudThreshold));

  let occupied = 0;
  for (let layerIndex = 0; layerIndex < layers.length; layerIndex++) {
    const layer = layers[layerIndex]!;
    if (layer.length === 0) continue;
    const spatial = arcOrder(layer);

    let maxHalfRadial = 0;
    for (const id of spatial) {
      const node = nodesById.get(id)!;
      maxHalfRadial = Math.max(maxHalfRadial, aabbHalfRadial(node.width, node.height, outboundTheta));
    }

    const parentClear =
      aabbHalfRadial(parentNode.width, parentNode.height, outboundTheta) + maxHalfRadial + spacing.ringPadding;
    const ringGap = layerIndex === 0 ? 0 : spacing.rankSep;
    const rMin = layerIndex === 0 ? parentClear : occupied + maxHalfRadial + ringGap;

    const { radius, thetas } = fitLayerRadius(spatial, nodesById, outboundTheta, rMin, spacing.ringPadding);

    for (let i = 0; i < spatial.length; i++) {
      const kidId = spatial[i]!;
      const kidNode = nodesById.get(kidId)!;
      const theta = thetas[i]!;
      const cx = parentCenter.x + radius * Math.cos(theta);
      const cy = parentCenter.y + radius * Math.sin(theta);
      positionById.set(kidId, topLeftFromCenter({ x: cx, y: cy }, kidNode.width, kidNode.height));
    }

    occupied = radius + maxHalfRadial;
  }
}
