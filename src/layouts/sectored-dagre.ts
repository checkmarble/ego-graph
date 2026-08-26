import type { EgoGraph, LayoutEdge, LayoutNode, LayoutOptions, Positions } from '../types';
import { runLayout } from './custom';
import { DEFAULT_SECTOR_THRESHOLD, placeSectoredChildren } from './place-children';

/**
 * Recursive sectors of shallow Dagre pockets. Every node lays its own children
 * out, splitting them across sectors once there are enough to be unwieldy.
 * Requires `@dagrejs/dagre`.
 */
export function sectoredDagre<N extends LayoutNode = LayoutNode, E extends LayoutEdge = LayoutEdge>(
  graph: EgoGraph<N, E>,
  options: LayoutOptions<N, E> = {},
): Positions {
  return runLayout(graph, options, (args) => {
    placeSectoredChildren({ ...args, threshold: DEFAULT_SECTOR_THRESHOLD });
  });
}
