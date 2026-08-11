export const CSS_PX_PER_MM = 2;

/** Map title bar height (mm) used when rendering a viewport. */
export const TITLE_BAR_MM = 7;

/** Rotated footprint (w,h) of a content box of w×h (90°-step rotation). */
export function footprintDims(rotation: number | undefined, contentW: number, contentH: number): { w: number; h: number } {
  return rotation === 90 || rotation === 270 ? { w: contentH, h: contentW } : { w: contentW, h: contentH };
}

/** Unrotated content dims for a given footprint box of w×h. */
export function contentDims(rotation: number | undefined, boxW: number, boxH: number): { w: number; h: number } {
  return rotation === 90 || rotation === 270 ? { w: boxH, h: boxW } : { w: boxW, h: boxH };
}
