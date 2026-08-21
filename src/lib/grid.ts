import { BBox, metersPerDegLng, M_PER_DEG_LAT } from './geo';

/** Real-world grid spacing presets, from ~100 m to ~1000 km. */
export interface GridSpacingOption {
  meters: number;
  label: string;
}

export const GRID_SPACING_OPTIONS: GridSpacingOption[] = [
  { meters: 100, label: '100 m' },
  { meters: 200, label: '200 m' },
  { meters: 500, label: '500 m' },
  { meters: 1000, label: '1 km' },
  { meters: 2000, label: '2 km' },
  { meters: 5000, label: '5 km' },
  { meters: 10000, label: '10 km' },
  { meters: 20000, label: '20 km' },
  { meters: 50000, label: '50 km' },
  { meters: 100000, label: '100 km' },
  { meters: 200000, label: '200 km' },
  { meters: 500000, label: '500 km' },
  { meters: 1000000, label: '1000 km' },
];

export function spacingLabel(meters: number): string {
  if (meters >= 1000) {
    const km = meters / 1000;
    return `${km % 1 === 0 ? km : km.toFixed(1)} km`;
  }
  return `${meters} m`;
}

export function bboxMeters(bbox: BBox): { widthM: number; heightM: number; midLat: number } {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  const midLat = (minLat + maxLat) / 2;
  const mPerDegLng = metersPerDegLng(midLat);
  return {
    widthM: (maxLng - minLng) * mPerDegLng,
    heightM: (maxLat - minLat) * M_PER_DEG_LAT,
    midLat,
  };
}

/**
 * Picks the smallest preset spacing that yields at most `targetCells` cells
 * across the bbox's longest dimension (so the grid never looks too dense).
 */
export function autoGridSpacing(bbox: BBox, targetCells = 6): number {
  const { widthM, heightM } = bboxMeters(bbox);
  const spanM = Math.max(widthM, heightM);
  const cellTarget = spanM / targetCells;
  for (const opt of GRID_SPACING_OPTIONS) {
    if (opt.meters >= cellTarget) return opt.meters;
  }
  return GRID_SPACING_OPTIONS[GRID_SPACING_OPTIONS.length - 1].meters;
}

export interface GridGeometry {
  spacingM: number;
  lngStep: number;
  latStep: number;
  lngLines: number[]; // longitudes of vertical lines
  latLines: number[]; // latitudes of horizontal lines
}

/** Grid lines at constant-lng/lat aligned to multiples of the step. */
export function buildGridGeometry(bbox: BBox, spacingM: number): GridGeometry {
  const { midLat } = bboxMeters(bbox);
  const mPerDegLng = metersPerDegLng(midLat);
  const lngStep = spacingM / mPerDegLng;
  const latStep = spacingM / M_PER_DEG_LAT;
  const [minLng, minLat, maxLng, maxLat] = bbox;

  const lngLines: number[] = [];
  let lng = Math.ceil(minLng / lngStep) * lngStep;
  while (lng <= maxLng + 1e-9) {
    lngLines.push(lng);
    lng += lngStep;
  }

  const latLines: number[] = [];
  let lat = Math.ceil(minLat / latStep) * latStep;
  while (lat <= maxLat + 1e-9) {
    latLines.push(lat);
    lat += latStep;
  }

  return { spacingM, lngStep, latStep, lngLines, latLines };
}

/** Adaptive decimal precision for a coordinate label given the step size. */
function coordDecimals(step: number): number {
  if (step >= 1) return 0;
  return Math.min(4, Math.max(1, Math.ceil(-Math.log10(step))));
}

export function coordLabel(value: number, step: number): string {
  const d = coordDecimals(step);
  return `${value.toFixed(d)}°`;
}

export interface CartoTick {
  edge: 'top' | 'bottom' | 'left' | 'right';
  /** Longitude of the tick (top/bottom edges). */
  lng: number | null;
  /** Latitude of the tick (left/right edges). */
  lat: number | null;
  /** Formatted coordinate label, or null for minor ticks. */
  label: string | null;
  value: number;
  index: number;
}

export interface CartographicBorder {
  spacingM: number;
  ticks: CartoTick[];
}

/**
 * Border ticks/segments along all four edges, one per grid line. Labels are
 * attached to a subset of ticks (every ~2-4th line) so they don't collide.
 */
export function buildBorder(bbox: BBox, spacingM: number): CartographicBorder {
  const geo = buildGridGeometry(bbox, spacingM);
  const [minLng, minLat, maxLng, maxLat] = bbox;

  const nLines = Math.max(geo.lngLines.length, geo.latLines.length);
  const majorEvery = Math.max(1, Math.ceil(nLines / 6));

  const ticks: CartoTick[] = [];

  geo.lngLines.forEach((lng, i) => {
    const label = i % majorEvery === 0 ? coordLabel(lng, geo.lngStep) : null;
    ticks.push({ edge: 'top', lng, lat: null, label, value: lng, index: i });
    ticks.push({ edge: 'bottom', lng, lat: null, label, value: lng, index: i });
  });

  geo.latLines.forEach((lat, i) => {
    const label = i % majorEvery === 0 ? coordLabel(lat, geo.latStep) : null;
    ticks.push({ edge: 'left', lng: null, lat, label, value: lat, index: i });
    ticks.push({ edge: 'right', lng: null, lat, label, value: lat, index: i });
  });

  void minLng;
  void minLat;
  void maxLng;
  void maxLat;
  return { spacingM, ticks };
}

/** Maps a lng/lat coordinate onto a rect (in mm or px) via linear interpolation. */
export interface BBoxRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function bboxToRect(bbox: BBox, rect: BBoxRect) {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  const spanLng = maxLng - minLng || 1e-9;
  const spanLat = maxLat - minLat || 1e-9;
  return {
    lngToX: (lng: number) => rect.x + ((lng - minLng) / spanLng) * rect.width,
    latToY: (lat: number) => rect.y + (1 - (lat - minLat) / spanLat) * rect.height,
  };
}

/** Web-Mercator normalized y (0..1) for a latitude (maplibre's fitBounds space). */
export function mercatorY(lat: number): number {
  const r = (lat * Math.PI) / 180;
  return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2;
}

/** Inverse of `mercatorY`: latitude for a normalized Web-Mercator y (0..1). */
export function inverseMercatorY(y: number): number {
  const a = Math.exp((1 - 2 * y) * Math.PI);
  const tan = (a * a - 1) / (2 * a);
  return (Math.atan(tan) * 180) / Math.PI;
}

/**
 * Projects a bbox onto a rect exactly like maplibre `fitBounds`: Web-Mercator
 * y positions and aspect preserved (letterboxed). Returns the fitted sub-rect
 * (the area the map content actually occupies on screen) plus lng/lat → rect
 * projection functions. Used so vector grid overlays align with the raster.
 */
export function bboxToFitRect(bbox: BBox, rect: BBoxRect) {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  const yTop = mercatorY(maxLat);
  const yBot = mercatorY(minLat);
  const bh = Math.max(yBot - yTop, 1e-9);
  const bw = Math.max((maxLng - minLng) / 360, 1e-9);
  const aspect = bw / bh;
  const canvasAspect = rect.width / rect.height;
  let width: number;
  let height: number;
  if (canvasAspect >= aspect) {
    height = rect.height;
    width = height * aspect;
  } else {
    width = rect.width;
    height = width / aspect;
  }
  const x = rect.x + (rect.width - width) / 2;
  const y = rect.y + (rect.height - height) / 2;
  return {
    x,
    y,
    width,
    height,
    lngToX: (lng: number) => x + ((lng - minLng) / (maxLng - minLng)) * width,
    latToY: (lat: number) => y + ((mercatorY(lat) - yTop) / bh) * height,
  };
}

export interface FrameProjection extends BBoxRect {
  lngToX: (lng: number) => number;
  latToY: (lat: number) => number;
  /** Visible longitude/latitude range covered by the full rect (extends beyond the bbox where the map overscans). */
  lngMin: number;
  lngMax: number;
  latMin: number;
  latMax: number;
  /** The letterboxed sub-rect the bbox itself occupies (maplibre fitBounds). */
  fit: BBoxRect;
}

/**
 * Projection for the FULL `rect` (the whole map area), extending the bbox's
 * fitBounds projection beyond the letterboxed bbox region. The map raster fills
 * the whole rect (fitBounds overscans), so grid lines drawn across the whole
 * rect at constant lng/lat land on the same geographic positions as the raster.
 * `lngMin/lngMax/latMin/latMax` are the geographic extent actually visible in
 * `rect`, so geometry built over them spans the full frame.
 */
export function bboxToFrameRect(bbox: BBox, rect: BBoxRect): FrameProjection {
  const fit = bboxToFitRect(bbox, rect);
  const [minLng, minLat, maxLng, maxLat] = bbox;
  const lngSpan = maxLng - minLng || 1e-9;
  const yTop = mercatorY(maxLat);
  const yBot = mercatorY(minLat);
  const bh = Math.max(yBot - yTop, 1e-9);
  const lngMin = minLng + ((rect.x - fit.x) / fit.width) * lngSpan;
  const lngMax = minLng + ((rect.x + rect.width - fit.x) / fit.width) * lngSpan;
  const latMax = inverseMercatorY(yTop + ((rect.y - fit.y) / fit.height) * bh);
  const latMin = inverseMercatorY(yTop + ((rect.y + rect.height - fit.y) / fit.height) * bh);
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    lngToX: fit.lngToX,
    latToY: fit.latToY,
    lngMin,
    lngMax,
    latMin,
    latMax,
    fit,
  };
}

/** Column/row reference letters for the edge labels (A = top row). */
export const GRID_REF_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export interface GridRefLabel {
  text: string;
  x: number;
  y: number;
  /** SVG text-anchor / PDF align behaviour for each edge. */
  edge: 'top' | 'bottom' | 'left' | 'right';
}

/**
 * Grid reference labels placed just inside the map frame: column numbers along
 * the top/bottom, row letters along the left/right, each centered on the actual
 * drawn cell (the midpoint between its two grid lines). `pad` is the inset from
 * the frame edge (top/bottom labels keep their baseline at `y + pad` / `y +
 * height - pad` — renderers add the font height for the top baseline; the
 * left/right x is the anchor at `x + pad` / `x + width - pad`). Letter = row
 * from the top (A = top row), number = column from the left, mirroring
 * `gridRefForPoi`.
 */
export function buildGridRefLabels(geo: GridGeometry, proj: FrameProjection, pad: number): GridRefLabel[] {
  const labels: GridRefLabel[] = [];
  const { x, y, width, height } = proj;
  const maxRow = Math.max(0, geo.latLines.length - 2);
  for (let i = 0; i + 1 < geo.lngLines.length; i++) {
    const cx = proj.lngToX((geo.lngLines[i] + geo.lngLines[i + 1]) / 2);
    labels.push({ text: String(i + 1), x: cx, y: y + pad, edge: 'top' });
    labels.push({ text: String(i + 1), x: cx, y: y + height - pad, edge: 'bottom' });
  }
  for (let j = 0; j + 1 < geo.latLines.length; j++) {
    const cy = proj.latToY((geo.latLines[j] + geo.latLines[j + 1]) / 2);
    const letter = GRID_REF_LETTERS[(maxRow - j) % GRID_REF_LETTERS.length];
    labels.push({ text: letter, x: x + pad, y: cy, edge: 'left' });
    labels.push({ text: letter, x: x + width - pad, y: cy, edge: 'right' });
  }
  return labels;
}

export interface BorderBandSegment {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The grid-border frame split into alternating-color band blocks between
 * consecutive grid lines, ordered clockwise around the rect. Callers alternate
 * a fill color per segment so the border renders as alternating two-color
 * blocks (classic cartographic frame). `band` is the block thickness, so the
 * blocks span from the outer edge inward, ready to be sandwiched between inner
 * and outer outline lines.
 */
export function buildBorderFrameSegments(geo: GridGeometry, proj: FrameProjection, band: number): BorderBandSegment[] {
  const { x, y, width, height } = proj;

  const xs = [x, ...geo.lngLines.map(proj.lngToX), x + width].filter((v) => v >= x && v <= x + width).sort((a, b) => a - b);
  const ys = [y, ...geo.latLines.map(proj.latToY), y + height].filter((v) => v >= y && v <= y + height).sort((a, b) => a - b);

  const top: BorderBandSegment[] = [];
  for (let i = 0; i < xs.length - 1; i++) top.push({ x: xs[i], y, width: xs[i + 1] - xs[i], height: band });

  const right: BorderBandSegment[] = [];
  for (let i = 0; i < ys.length - 1; i++) right.push({ x: x + width - band, y: ys[i], width: band, height: ys[i + 1] - ys[i] });

  const bottom = top
    .slice()
    .reverse()
    .map((s) => ({ x: s.x, y: y + height - band, width: s.width, height: band }));
  const left = right
    .slice()
    .reverse()
    .map((s) => ({ x, y: s.y, width: band, height: s.height }));

  return [...top, ...right, ...bottom, ...left];
}

export interface InsetRect {
  x: number;
  y: number;
  width: number;
  height: number;
  title: string;
}

/**
 * Projects a child map's bbox onto a parent map's FrameProjection and returns
 * the rectangle to draw as an inset outline (clipped to the parent frame).
 * Returns null when the child's center lies outside the parent's visible
 * extent, so only maps that are actually inside the overview are outlined.
 */
export function buildInsetRect(proj: FrameProjection, childBbox: BBox, title: string): InsetRect | null {
  const [minLng, minLat, maxLng, maxLat] = childBbox;
  const cx = (minLng + maxLng) / 2;
  const cy = (minLat + maxLat) / 2;
  if (cx < proj.lngMin || cx > proj.lngMax || cy < proj.latMin || cy > proj.latMax) return null;

  const x1 = proj.lngToX(minLng);
  const x2 = proj.lngToX(maxLng);
  const y1 = proj.latToY(maxLat);
  const y2 = proj.latToY(minLat);

  const rx1 = Math.max(proj.x, Math.min(x1, x2));
  const rx2 = Math.min(proj.x + proj.width, Math.max(x1, x2));
  const ry1 = Math.max(proj.y, Math.min(y1, y2));
  const ry2 = Math.min(proj.y + proj.height, Math.max(y1, y2));
  if (rx2 - rx1 < 0.5 || ry2 - ry1 < 0.5) return null;
  return { x: rx1, y: ry1, width: rx2 - rx1, height: ry2 - ry1, title };
}

/* ------------------------------ GeoJSON (maplibre) ------------------------------ */

export type GridFeatureKind = 'line' | 'tick' | 'label' | 'frame';

export function buildGridGeoJSON(
  bbox: BBox,
  spacingM: number,
  opts: { tickLenDeg?: number; majorEveryOverride?: number } = {}
): GeoJSON.FeatureCollection {
  const geo = buildGridGeometry(bbox, spacingM);
  const [minLng, minLat, maxLng, maxLat] = bbox;
  const tickLenDeg = opts.tickLenDeg ?? 0.0009;
  const border = buildBorder(bbox, spacingM);

  const features: GeoJSON.Feature[] = [];

  features.push({
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: [[minLng, minLat], [maxLng, minLat], [maxLng, maxLat], [minLng, maxLat], [minLng, minLat]],
    },
    properties: { kind: 'frame' as GridFeatureKind },
  });

  for (const lng of geo.lngLines) {
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [[lng, minLat], [lng, maxLat]] },
      properties: { kind: 'line' as GridFeatureKind },
    });
  }
  for (const lat of geo.latLines) {
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [[minLng, lat], [maxLng, lat]] },
      properties: { kind: 'line' as GridFeatureKind },
    });
  }

  for (const t of border.ticks) {
    let geometry: GeoJSON.LineString | GeoJSON.Point;
    if (t.edge === 'top') {
      geometry = { type: 'LineString', coordinates: [[t.lng!, maxLat - tickLenDeg], [t.lng!, maxLat]] };
    } else if (t.edge === 'bottom') {
      geometry = { type: 'LineString', coordinates: [[t.lng!, minLat], [t.lng!, minLat + tickLenDeg]] };
    } else if (t.edge === 'left') {
      geometry = { type: 'LineString', coordinates: [[minLng, t.lat!], [minLng + tickLenDeg, t.lat!]] };
    } else {
      geometry = { type: 'LineString', coordinates: [[maxLng, t.lat!], [maxLng - tickLenDeg, t.lat!]] };
    }
    features.push({
      type: 'Feature',
      geometry,
      properties: { kind: 'tick' as GridFeatureKind, major: t.label != null },
    });
  }

  for (const t of border.ticks) {
    if (!t.label) continue;
    let geometry: GeoJSON.Point;
    let rot = 0;
    if (t.edge === 'top') {
      geometry = { type: 'Point', coordinates: [t.lng!, maxLat - tickLenDeg * 1.8] };
    } else if (t.edge === 'bottom') {
      geometry = { type: 'Point', coordinates: [t.lng!, minLat + tickLenDeg * 1.8] };
    } else if (t.edge === 'left') {
      geometry = { type: 'Point', coordinates: [minLng + tickLenDeg * 1.8, t.lat!] };
      rot = 90;
    } else {
      geometry = { type: 'Point', coordinates: [maxLng - tickLenDeg * 1.8, t.lat!] };
      rot = 90;
    }
    features.push({
      type: 'Feature',
      geometry,
      properties: { kind: 'label' as GridFeatureKind, label: t.label, rot },
    });
  }

  return { type: 'FeatureCollection', features };
}

// --- Scale bar ---

/** Nice round distances for scale bars, in meters. */
const SCALE_BAR_NICE = [
  1, 2, 5, 10, 20, 50, 100, 200, 500,
  1000, 2000, 5000, 10000, 20000, 50000,
  100000, 200000, 500000, 1000000,
];

export interface ScaleBarTick {
  /** Position along the bar in mm (0 = left edge). */
  mm: number;
  /** Label text (e.g. "0", "50", "100"). */
  label: string;
  /** Whether to draw a full-height tick (major) or half-height (minor). */
  major: boolean;
}

export interface ScaleBarResult {
  /** Total bar width in mm. */
  barMm: number;
  /** The total distance the bar covers, in meters. */
  distanceM: number;
  /** Scale denominator text, e.g. "1:25 000". */
  scaleText: string;
  /** Ticks to render along the bar. */
  ticks: ScaleBarTick[];
}

/**
 * Computes a tick-style scale bar for a viewport.
 *
 * The bar is split into segments (typically 2–5), each labeled with its
 * cumulative distance. The left edge is always "0". Total bar width targets
 * ~25 mm on the printed page.
 */
export function computeScaleBar(
  latitude: number,
  zoom: number,
  labelScale = 1,
): ScaleBarResult {
  const mpp = (156543.03392 * Math.cos((latitude * Math.PI) / 180)) / Math.pow(2, zoom);
  // Target ~25 mm on the printed page (CSS_PX_PER_MM = 2 → 50 px at 1:1)
  const targetBarPx = 50 * labelScale;
  const targetBarM = targetBarPx * mpp;

  // Pick the nicest total distance ≤ target
  let totalM = SCALE_BAR_NICE[0];
  for (const n of SCALE_BAR_NICE) {
    if (n <= targetBarM) totalM = n;
  }

  const barPx = totalM / mpp;
  const barMm = barPx / (2 * labelScale); // CSS_PX_PER_MM = 2

  // Number of segments: prefer 2 or 5
  const numSegments = totalM >= 500 || (totalM / 5) * 5 === totalM ? 5 : 2;
  const segM = totalM / numSegments;

  const ticks: ScaleBarTick[] = [];
  for (let i = 0; i <= numSegments; i++) {
    const dist = segM * i;
    const mmPos = (barMm / numSegments) * i;
    const isMajor = i === 0 || i === numSegments || (numSegments === 5 && i === 2);
    ticks.push({
      mm: mmPos,
      label: formatScaleBarDistance(dist),
      major: isMajor,
    });
  }

  // Scale denominator
  const scaleDenom = Math.round(mpp * (96 / 0.0254));
  const scaleText = `1:${scaleDenom.toLocaleString()}`;

  return { barMm, distanceM: totalM, scaleText, ticks };
}

/** Format a distance for a scale bar tick (e.g. 0, 50, 100, 1.5 km). */
function formatScaleBarDistance(meters: number): string {
  if (meters === 0) return '0';
  if (meters >= 1000) {
    const km = meters / 1000;
    return `${km % 1 === 0 ? km : km.toFixed(1)} km`;
  }
  return `${meters}`;
}

/** Human-readable label for a scale bar distance. */
export function scaleBarDistanceLabel(meters: number): string {
  if (meters >= 1000) {
    const km = meters / 1000;
    return `${km % 1 === 0 ? km : km.toFixed(1)} km`;
  }
  return `${meters} m`;
}

// --- Cartographic zoom levels ---

/**
 * Standard cartographic scale denominators. These are the "round" scales
 * used on topographic maps worldwide.
 */
export const CARTOGRAPHIC_SCALES = [
  { denom: 1000, label: '1:1 000' },
  { denom: 2500, label: '1:2 500' },
  { denom: 5000, label: '1:5 000' },
  { denom: 10000, label: '1:10 000' },
  { denom: 15000, label: '1:15 000' },
  { denom: 20000, label: '1:20 000' },
  { denom: 25000, label: '1:25 000' },
  { denom: 30000, label: '1:30 000' },
  { denom: 40000, label: '1:40 000' },
  { denom: 50000, label: '1:50 000' },
  { denom: 75000, label: '1:75 000' },
  { denom: 100000, label: '1:100 000' },
  { denom: 200000, label: '1:200 000' },
  { denom: 250000, label: '1:250 000' },
  { denom: 500000, label: '1:500 000' },
  { denom: 1000000, label: '1:1 000 000' },
];

/**
 * Returns the zoom level that gives the closest match to a cartographic
 * scale denominator at a given latitude.
 */
export function zoomForScale(denom: number, latitude: number): number {
  // meters per pixel = denom / (96 / 0.0254)  (96 DPI, meters per px)
  const targetMpp = denom / (96 / 0.0254);
  // mpp = 156543.03392 * cos(lat) / 2^zoom
  // zoom = log2(156543.03392 * cos(lat) / targetMpp)
  const cosLat = Math.cos((latitude * Math.PI) / 180);
  return Math.log2((156543.03392 * cosLat) / targetMpp);
}

/**
 * Given current zoom and latitude, returns the nearest cartographic zoom
 * level. `dir` is +1 (zoom in) or -1 (zoom out).
 */
export function nearestCartographicZoom(
  currentZoom: number,
  latitude: number,
  dir: 1 | -1,
): { zoom: number; scale: typeof CARTOGRAPHIC_SCALES[number] } | null {
  const cosLat = Math.cos((latitude * Math.PI) / 180);
  const currentMpp = (156543.03392 * cosLat) / Math.pow(2, currentZoom);

  let best: { zoom: number; scale: typeof CARTOGRAPHIC_SCALES[number]; diff: number } | null = null;

  for (const s of CARTOGRAPHIC_SCALES) {
    const z = zoomForScale(s.denom, latitude);
    const diff = z - currentZoom;

    // Must be strictly in the requested direction (skip if at or beyond the current zoom)
    if (dir === 1 && diff <= 0.01) continue; // zoom in → need z > current + margin
    if (dir === -1 && diff >= -0.01) continue; // zoom out → need z < current - margin

    const absDiff = Math.abs(diff);
    if (!best || absDiff < best.diff) {
      best = { zoom: z, scale: s, diff: absDiff };
    }
  }

  if (!best) return null;
  return { zoom: best.zoom, scale: best.scale };
}
