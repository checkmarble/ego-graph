/**
 * The three layouts this package ships, in the order the README introduces them.
 * Kept as strings so a consumer can name a mode without pulling the implementations
 * — and without pulling `@dagrejs/dagre`.
 */
export const LAYOUT_NAMES = ['radialDagre', 'sectoredDagre', 'polarPetal'] as const;

export type LayoutName = (typeof LAYOUT_NAMES)[number];
