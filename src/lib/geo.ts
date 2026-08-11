/** Bounding box: [minLng, minLat, maxLng, maxLat] */
export type BBox = [number, number, number, number];

/** Approximate meters per degree of latitude (WGS84). */
export const M_PER_DEG_LAT = 111320;

/** Approximate meters per degree of longitude at a given latitude. */
export function metersPerDegLng(lat: number) {
  return M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
}
