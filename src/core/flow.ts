// Cover Flow geometry: where a cover sits for a given distance from the
// centre. Distances are fractional while the flow moves, so covers turn and
// slide continuously.

export interface FlowPlacement {
  x: number;
  z: number;
  rotate: number;
  zIndex: number;
}

/** Side covers turn this far (degrees). */
export const FLOW_ANGLE = 65;

/**
 * `d`: distance from the centre in covers (negative: left of it).
 * `size`: cover width in px.
 */
export function flowTransform(d: number, size: number): FlowPlacement {
  const a = Math.abs(d);
  const s = Math.sign(d);
  const t = Math.min(a, 1);
  // First step: from the centre to the stack, then the stacked covers overlap.
  const gap = size * 0.62;
  const spacing = size * 0.24;
  const depth = size * 0.55;
  return {
    x: s * (t * gap + Math.max(0, a - 1) * spacing),
    z: -t * depth,
    rotate: -s * t * FLOW_ANGLE,
    zIndex: 1000 - Math.round(a * 10),
  };
}

/** Cover width for a stage of this size. */
export function flowCoverSize(width: number, height: number): number {
  return Math.round(Math.max(120, Math.min(height * 0.42, width * 0.3, 340)));
}
