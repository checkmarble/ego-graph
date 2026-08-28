import { centerOf, topLeftFromCenter } from '../geometry/box';
import { lateralHalfExtentAtAngle } from '../geometry/extents';
import { resolveOptions } from '../options';
import { buildChildrenMap, buildSpanningTree } from '../tree';
import type { EgoGraph, LayoutEdge, LayoutNode, Point, Positions, SpacingOptions } from '../types';
import type { CustomLayoutOptions, FirstLayersSpec, LayerSpec, NextLayersSpec } from './layer';
import { DAGRE_ENTRY_HINT, optionsNeedDagre, pickFirstLayerSpec, pickNextLayerSpec, resolveFirstLayers } from './layer';
import { type PlaceDirectChildrenArgs, placeLightChildren } from './place-children';
import type { PocketStrategy } from './pocket-strategy';
import { layoutSatellitePockets } from './pockets';

type WalkArgs = {
  nodeId: string;
  outboundTheta: number | null;
  isRoot: boolean;
  children: Map<string, string[]>;
  nodesById: Map<string, LayoutNode>;
  positionById: Map<string, Point>;
  ringThetas: number[];
  spacing: Required<SpacingOptions>;
  weightOf: (id: string) => number;
  firstLayer: FirstLayersSpec;
  nextLayers: NextLayersSpec | undefined;
  place: (args: PlaceDirectChildrenArgs) => void;
};

function placeArgs(spec: LayerSpec, args: WalkArgs): PlaceDirectChildrenArgs {
  return {
    parentId: args.nodeId,
    outboundTheta: args.outboundTheta,
    children: args.children,
    nodesById: args.nodesById,
    positionById: args.positionById,
    spacing: args.spacing,
    weightOf: args.weightOf,
    mode: spec.mode,
    cloudThreshold: spec.mode === 'cloud' ? spec.threshold : undefined,
    sectorThreshold: spec.mode === 'dagre' ? spec.sectorThreshold : undefined,
  };
}

function walk(args: WalkArgs): void {
  const kidCount = args.children.get(args.nodeId)?.length ?? 0;
  const spec = args.isRoot
    ? pickFirstLayerSpec(kidCount, args.firstLayer)
    : pickNextLayerSpec(kidCount, args.nextLayers);
  args.place(placeArgs(spec, args));

  const parentPos = args.positionById.get(args.nodeId);
  const parentNode = args.nodesById.get(args.nodeId);
  if (!parentPos || !parentNode) return;
  const parentCenter = centerOf(parentNode, parentPos);

  const kidIds = args.children.get(args.nodeId) ?? [];
  if (spec.mode === 'dagreSubtree') {
    if (args.isRoot) {
      for (const kidId of kidIds) {
        const kidPos = args.positionById.get(kidId);
        const kidNode = args.nodesById.get(kidId);
        if (!kidPos || !kidNode) continue;
        const kidCenter = centerOf(kidNode, kidPos);
        args.ringThetas.push(Math.atan2(kidCenter.y - parentCenter.y, kidCenter.x - parentCenter.x));
      }
    }
    return;
  }

  for (const kidId of kidIds) {
    const kidPos = args.positionById.get(kidId);
    const kidNode = args.nodesById.get(kidId);
    if (!kidPos || !kidNode) continue;
    const kidCenter = centerOf(kidNode, kidPos);
    const kidTheta = Math.atan2(kidCenter.y - parentCenter.y, kidCenter.x - parentCenter.x);
    if (args.isRoot) args.ringThetas.push(kidTheta);
    walk({ ...args, nodeId: kidId, outboundTheta: kidTheta, isRoot: false });
  }
}

function composedPocketStrategy(nextLayers: NextLayersSpec | undefined, place: WalkArgs['place']): PocketStrategy {
  const layoutIsland = (
    rootId: string,
    treeEdges: LayoutEdge[],
    nodesById: Map<string, LayoutNode>,
    positionById: Map<string, Point>,
    theta: number,
    spacing: WalkArgs['spacing'],
    weightOf: (id: string) => number,
  ) => {
    walk({
      nodeId: rootId,
      outboundTheta: theta,
      isRoot: false,
      children: buildChildrenMap([...treeEdges]),
      nodesById,
      positionById,
      ringThetas: [],
      spacing,
      weightOf,
      firstLayer: [{ mode: 'radial' }],
      nextLayers,
      place,
    });
  };

  return {
    measureLateralHalf({ islandIds, treeEdges, rootId, preferredTheta, nodesById, spacing, weightOf }) {
      const scratch = new Map<string, Point>();
      const rootNode = nodesById.get(rootId);
      if (!rootNode) return 0;
      scratch.set(rootId, topLeftFromCenter({ x: 0, y: 0 }, rootNode.width, rootNode.height));
      if (islandIds.length > 1) {
        layoutIsland(rootId, treeEdges, nodesById, scratch, preferredTheta, spacing, weightOf);
      }
      return lateralHalfExtentAtAngle(islandIds, scratch, nodesById, rootId, preferredTheta);
    },
    place({ islandIds, treeEdges, rootId, targetCenter, theta, nodesById, positionById, spacing, weightOf }) {
      const rootNode = nodesById.get(rootId);
      if (!rootNode) return;
      positionById.set(rootId, topLeftFromCenter(targetCenter, rootNode.width, rootNode.height));
      if (islandIds.length <= 1) return;
      layoutIsland(rootId, treeEdges, nodesById, positionById, theta, spacing, weightOf);
    },
  };
}

/**
 * Compose a layout from first-layer bands and next-layer bands. Radial, bubble,
 * and cloud only — Dagre modes need `ego-graph/dagre`.
 */
export function customLayout<N extends LayoutNode = LayoutNode, E extends LayoutEdge = LayoutEdge>(
  graph: EgoGraph<N, E>,
  options: CustomLayoutOptions<N, E> = {},
): Positions {
  if (optionsNeedDagre(options)) throw new Error(DAGRE_ENTRY_HINT);
  return runLayout(graph, options, placeLightChildren);
}

/** Shared walk used by the Dagre-free and Dagre-capable `customLayout` entries. */
export function runLayout<N extends LayoutNode = LayoutNode, E extends LayoutEdge = LayoutEdge>(
  graph: EgoGraph<N, E>,
  options: CustomLayoutOptions<N, E>,
  place: (args: PlaceDirectChildrenArgs) => void,
): Positions {
  const positionById: Positions = new Map();
  if (graph.nodes.length === 0) return positionById;

  const resolved = resolveOptions(options);
  const firstLayer = resolveFirstLayers(options.firstLayer);
  const nextLayers = options.nextLayers;
  const nodesById = new Map(graph.nodes.map((n) => [n.id, n]));
  const tree = buildSpanningTree(graph, resolved);
  if (!tree.root) return positionById;

  const weightOf = (id: string): number => {
    const node = nodesById.get(id);
    return node ? resolved.getWeight(node) : 1;
  };

  const rootNode = nodesById.get(tree.root)!;
  const rootCenter = { x: 0, y: 0 };
  positionById.set(tree.root, topLeftFromCenter(rootCenter, rootNode.width, rootNode.height));

  const ringThetas: number[] = [];
  walk({
    nodeId: tree.root,
    outboundTheta: null,
    isRoot: true,
    children: tree.children,
    nodesById,
    positionById,
    ringThetas,
    spacing: resolved,
    weightOf,
    firstLayer,
    nextLayers,
    place,
  });

  layoutSatellitePockets({
    graph,
    tree,
    nodesById,
    positionById,
    rootCenter,
    ringThetas,
    strategy: composedPocketStrategy(nextLayers, place),
    options: resolved,
  });

  return positionById;
}
