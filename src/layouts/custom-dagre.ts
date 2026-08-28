import type { EgoGraph, LayoutEdge, LayoutNode, Positions } from '../types';
import { runLayout } from './custom';
import type { CustomLayoutOptions } from './layer';
import { placeFullChildren } from './place-dagre';

/** `customLayout` with Dagre modes (`dagre`, `dagreSubtree`, `sectorThreshold`). */
export function customLayout<N extends LayoutNode = LayoutNode, E extends LayoutEdge = LayoutEdge>(
  graph: EgoGraph<N, E>,
  options: CustomLayoutOptions<N, E> = {},
): Positions {
  return runLayout(graph, options, placeFullChildren);
}
