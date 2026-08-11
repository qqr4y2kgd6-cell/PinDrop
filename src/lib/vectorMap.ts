import type { ColorMode, MapLayerStyle, MapViewport, POI } from '@/types';
import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';
import type { jsPDF } from 'jspdf';
import { GState } from 'jspdf';
import { bboxToFrameRect, inverseMercatorY, mercatorY, type FrameProjection } from './grid';
import { spiderify as spiderifyPois } from './spiderify';
import { DEFAULT_LAYER_STYLE, clampBbox } from './mapStyle';

const CSS_PX_PER_MM = 2;
const TILEJSON_URL = 'https://tiles.openfreemap.org/planet';
const MAX_TILES = 128;
const MM_TO_PT = 2.83465;

export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function badgeColors(mode: ColorMode | undefined, spotColor: string) {
  if (mode === 'spot') return { fill: spotColor, text: '#ffffff' };
  if (mode === 'grayscale') return { fill: '#4a4a4a', text: '#ffffff' };
  return { fill: '#111111', text: '#ffffff' };
}

/** Layers that are drawn as filled polygons (fills) and line layers, in draw order. */
const PARK_CLASSES = ['park', 'forest', 'grass', 'garden', 'cemetery', 'meadow', 'heath', 'wood'];
const LANDCOVER_CLASSES = ['grass', 'wood', 'forest', 'scrub'];
const ROAD_SPECS = [
  { key: 'road-major', classes: ['motorway', 'trunk'], w: 1.4, o: 1 },
  { key: 'road-primary', classes: ['primary'], w: 1, o: 0.85 },
  { key: 'road-secondary', classes: ['secondary', 'tertiary'], w: 0.7, o: 0.7 },
  { key: 'road-minor', classes: ['minor', 'service'], w: 0.5, o: 0.55 },
  { key: 'road-path', classes: ['path', 'track'], w: 0.35, o: 0.4 },
];

/** A single viewport's decoded vector tiles + the geographic extent they cover. */
export interface VectorMapData {
  kind: 'vector';
  extent: [number, number, number, number];
  zoom: number;
  tiles: { z: number; x: number; y: number; tile: VectorTile }[];
}

export interface VectorFill {
  color: string;
  opacity: number;
  /** polygons; each polygon = rings; each ring = [x,y] points (mm or px, projection units). */
  polys: number[][][][];
}

export interface VectorLine {
  color: string;
  width: number;
  opacity: number;
  dash: number[] | null;
  paths: number[][][];
}

/** Projected geometry + resolved colors/widths, ready to be drawn by any renderer. */
export interface VectorMapRenderData {
  background: string;
  fills: VectorFill[];
  lines: VectorLine[];
}

function clampZoom(z: number) {
  return Math.min(24, Math.max(0, z));
}

/**
 * The geographic extent MapLibre actually shows for a viewport at `vp.zoom` /
 * `fitBounds(vp.bbox)` with `vp.rotation`. For rotated viewports the map content
 * covers a larger region than the frame itself (the canvas is the rotated map's
 * axis-aligned bounding box), so the extent is computed over that expanded box
 * to avoid blank corner triangles.
 */
export function viewportMapExtent(
  vp: MapViewport,
  areaMm: { w: number; h: number }
): { extent: [number, number, number, number]; zoom: number; box: { w: number; h: number } } {
  const rad = ((vp.rotation ?? 0) * Math.PI) / 180;
  const c = Math.abs(Math.cos(rad));
  const s = Math.abs(Math.sin(rad));
  const hw = (areaMm.w * c + areaMm.h * s) / 2;
  const hh = (areaMm.w * s + areaMm.h * c) / 2;
  const box = { w: hw * 2, h: hh * 2 };

  if (vp.bbox) {
    const bbox = clampBbox(vp.bbox);
    const proj = bboxToFrameRect(bbox, { x: 0, y: 0, width: box.w * CSS_PX_PER_MM, height: box.h * CSS_PX_PER_MM });
    const zoom = fitBoundsZoom(bbox, areaMm.w * CSS_PX_PER_MM, areaMm.h * CSS_PX_PER_MM, vp.rotation ?? 0);
    return { extent: [proj.lngMin, proj.latMin, proj.lngMax, proj.latMax], zoom, box };
  }

  const zoom = clampZoom(vp.zoom);
  const extent = mercatorExtentFromCenter(vp.center, zoom, box.w * CSS_PX_PER_MM, box.h * CSS_PX_PER_MM);
  return { extent, zoom, box };
}

/** MapLibre's `fitBounds` zoom for a bbox fitted into a `w×h` CSS-pixel canvas at `bearing`. */
function fitBoundsZoom(bbox: [number, number, number, number], wPx: number, hPx: number, bearing: number): number {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  const rad = ((-bearing * Math.PI) / 180);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const corners = [
    [minLng, maxLat],
    [maxLng, maxLat],
    [minLng, minLat],
    [maxLng, minLat],
  ].map(([lng, lat]) => {
    const x = ((lng + 180) / 360) * 512;
    const y = mercatorY(lat) * 512;
    return { x: x * cos - y * sin, y: x * sin + y * cos };
  });
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const sizeX = Math.max(Math.max(...xs) - Math.min(...xs), 1e-12);
  const sizeY = Math.max(Math.max(...ys) - Math.min(...ys), 1e-12);
  return Math.min(24, Math.max(0, Math.log2(Math.min(wPx / sizeX, hPx / sizeY))));
}

/** Mercator-consistent visible extent for a center/zoom camera (fills the frame exactly). */
function mercatorExtentFromCenter(
  center: [number, number],
  zoom: number,
  wPx: number,
  hPx: number
): [number, number, number, number] {
  const [lng, lat] = center;
  const world = 512 * Math.pow(2, zoom);
  const xC = (lng + 180) / 360;
  const yC = mercatorY(lat);
  const hw = wPx / world / 2;
  const hh = hPx / world / 2;
  const x0 = Math.max(0, Math.min(1, xC - hw));
  const x1 = Math.max(0, Math.min(1, xC + hw));
  const y0 = Math.max(0, Math.min(1, yC - hh));
  const y1 = Math.max(0, Math.min(1, yC + hh));
  return [x0 * 360 - 180, inverseMercatorY(y1), x1 * 360 - 180, inverseMercatorY(y0)];
}

function tileRange(extent: [number, number, number, number], z: number) {
  const n = 2 ** z;
  const clamp = (v: number) => Math.max(0, Math.min(n - 1, Math.round(v)));
  const x0 = clamp(Math.floor(((extent[0] + 180) / 360) * n));
  const x1 = clamp(Math.ceil(((extent[2] + 180) / 360) * n) - 1);
  const y0 = clamp(Math.floor(mercatorY(extent[3]) * n));
  const y1 = clamp(Math.ceil(mercatorY(extent[1]) * n) - 1);
  return { x0, x1, y0, y1, count: Math.max(0, x1 - x0 + 1) * Math.max(0, y1 - y0 + 1) };
}

let tileTemplate: string | null = null;

async function resolveTileTemplate(): Promise<string> {
  if (tileTemplate) return tileTemplate;
  const res = await fetch(TILEJSON_URL);
  if (!res.ok) throw new Error(`tilejson ${res.status}`);
  const tj = await res.json();
  const template = tj?.tiles?.[0];
  if (!template) throw new Error('no tile template');
  tileTemplate = template;
  return template;
}

const tileCache = new Map<string, Promise<VectorTile | null>>();

async function fetchTile(url: string): Promise<VectorTile | null> {
  let p = tileCache.get(url);
  if (!p) {
    p = (async () => {
      const res = await fetch(url);
      if (!res.ok) return null;
      const buf = new Uint8Array(await res.arrayBuffer());
      return new VectorTile(new PbfReader(buf));
    })();
    if (tileCache.size > 600) tileCache.clear();
    tileCache.set(url, p);
  }
  return p;
}

async function mapLimit<T>(items: T[], limit: number, fn: (t: T) => Promise<unknown>): Promise<void> {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx]);
    }
  });
  await Promise.all(workers);
}

/**
 * Fetches + decodes the vector tiles covering a viewport's visible extent at the
 * zoom MapLibre would render (fitBounds zoom for bbox viewports, `vp.zoom`
 * otherwise). Throws when the tile source is unreachable so callers can fall
 * back to the raster path.
 */
export async function fetchViewportMap(vp: MapViewport, areaMm: { w: number; h: number }): Promise<VectorMapData> {
  const { extent, zoom, box } = viewportMapExtent(vp, areaMm);
  let z = Math.max(0, Math.floor(zoom));
  let range = tileRange(extent, z);
  while (range.count > MAX_TILES && z > 0) {
    z -= 1;
    range = tileRange(extent, z);
  }
  if (range.count <= 0) throw new Error('no tiles in range');

  const template = await resolveTileTemplate();
  const coords: Array<{ x: number; y: number }> = [];
  for (let x = range.x0; x <= range.x1; x++) {
    for (let y = range.y0; y <= range.y1; y++) coords.push({ x, y });
  }

  const tiles: VectorMapData['tiles'] = [];
  await mapLimit(coords, 8, async ({ x, y }) => {
    const url = template.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
    const tile = await fetchTile(url);
    if (tile && tile.layers) tiles.push({ z, x, y, tile });
  });

  if (tiles.length === 0) throw new Error('no tiles decoded');
  void box;
  return { kind: 'vector', extent, zoom: z, tiles };
}

function ringPoints(ring: { x: number; y: number }[], projPt: (u: number, v: number) => [number, number]): number[][] {
  return ring.map((p) => projPt(p.x, p.y));
}

/**
 * Converts decoded tiles + the per-viewport layer style into projected draw
 * buckets, using the same layer set/order/colors as `createPrintStyle` +
 * `applyLayerStyleOverrides`. Road widths are MapLibre style pixels scaled to
 * mm (1 CSS px = 0.5 mm at the 300-DPI export).
 */
export function buildVectorMapRenderData(
  data: VectorMapData,
  proj: FrameProjection,
  layers?: MapLayerStyle
): VectorMapRenderData {
  const l = { ...DEFAULT_LAYER_STYLE, ...layers };

  const fills = new Map<string, VectorFill>();
  const lines = new Map<string, VectorLine>();

  const getLine = (key: string, color: string, width: number, opacity: number, dash: number[] | null = null): VectorLine => {
    let ln = lines.get(key);
    if (!ln) {
      ln = { color, width, opacity, dash, paths: [] };
      lines.set(key, ln);
    }
    return ln;
  };

  for (const td of data.tiles) {
    const n = 2 ** td.z;
    // Bucket fill geometry per tile: each tile's polygons are filled in their
    // own `fillEvenOdd()` call. MVT tiles carry a 64/4096 buffer, so adjacent
    // tiles duplicate the same polygon at their shared edge; merging every tile
    // into one bucket made those overlapping copies cancel out (even winding),
    // which showed up as regular banding along tile seams.
    const tileKey = `${td.z}/${td.x}/${td.y}`;
    const getFill = (key: string, color: string, opacity: number): VectorFill => {
      const k = `${tileKey}/${key}`;
      let f = fills.get(k);
      if (!f) {
        f = { color, opacity, polys: [] };
        fills.set(k, f);
      }
      return f;
    };

    for (const layerName of Object.keys(td.tile.layers)) {
      const layer = td.tile.layers[layerName];
      const ext = layer.extent || 4096;
      const projPt = (u: number, v: number): [number, number] => {
        const lng = ((td.x + u / ext) / n) * 360 - 180;
        const lat = inverseMercatorY((td.y + v / ext) / n);
        return [proj.lngToX(lng), proj.latToY(lat)];
      };
      const pushPolygon = (bucket: VectorFill, f: { loadGeometry(): { x: number; y: number }[][] }) => {
        bucket.polys.push(f.loadGeometry().map((ring) => ringPoints(ring, projPt)));
      };
      const pushLines = (bucket: VectorLine, f: { loadGeometry(): { x: number; y: number }[][] }) => {
        for (const ring of f.loadGeometry()) {
          const path = ringPoints(ring, projPt);
          if (path.length > 1) bucket.paths.push(path);
        }
      };

      if (layerName === 'landuse' && l.showParks) {
        const bucket = getFill('park', l.parkColor, l.parkOpacity);
        for (let i = 0; i < layer.length; i++) {
          const f = layer.feature(i);
          if (typeof f.properties.class === 'string' && PARK_CLASSES.includes(f.properties.class)) pushPolygon(bucket, f);
        }
      } else if (layerName === 'landcover' && l.showParks) {
        const bucket = getFill('park', l.parkColor, l.parkOpacity);
        for (let i = 0; i < layer.length; i++) {
          const f = layer.feature(i);
          if (typeof f.properties.class === 'string' && LANDCOVER_CLASSES.includes(f.properties.class)) pushPolygon(bucket, f);
        }
      } else if (layerName === 'water' && l.showWater) {
        const bucket = getFill('water', l.waterColor, l.waterOpacity);
        for (let i = 0; i < layer.length; i++) pushPolygon(bucket, layer.feature(i));
      } else if (layerName === 'waterway' && l.showWater) {
        const bucket = getLine('waterway', l.waterColor, 0.25, l.waterOpacity);
        for (let i = 0; i < layer.length; i++) pushLines(bucket, layer.feature(i));
      } else if (layerName === 'building' && l.showBuildings) {
        const fillBucket = getFill('building', l.buildingColor, l.buildingOpacity);
        const outlineBucket = getLine('building-outline', l.buildingOutlineColor, 0.1, l.buildingOpacity);
        for (let i = 0; i < layer.length; i++) {
          const f = layer.feature(i);
          pushPolygon(fillBucket, f);
          pushLines(outlineBucket, f);
        }
      } else if (layerName === 'transportation' && l.showRoads) {
        for (let i = 0; i < layer.length; i++) {
          const f = layer.feature(i);
          const cls = typeof f.properties.class === 'string' ? f.properties.class : '';
          const spec = ROAD_SPECS.find((r) => r.classes.includes(cls));
          if (!spec) continue;
          const bucket = getLine(spec.key, l.roadColor, l.roadWidth * spec.w * 0.5, l.roadOpacity * spec.o);
          pushLines(bucket, f);
        }
      } else if (layerName === 'boundary') {
        const bucket = getLine('boundary', '#9a9a9a', 0.2, 1, [1, 1]);
        for (let i = 0; i < layer.length; i++) {
          const f = layer.feature(i);
          const level = String(f.properties.admin_level ?? '');
          if (level === '2' || level === '3' || level === '4') pushLines(bucket, f);
        }
      }
    }
  }

  return {
    background: l.landColor,
    fills: [...fills.values()],
    lines: ['waterway', 'building-outline', 'road-major', 'road-primary', 'road-secondary', 'road-minor', 'road-path', 'boundary']
      .map((k) => lines.get(k))
      .filter((ln): ln is VectorLine => !!ln),
  };
}

/** Draws the vector map geometry into a jsPDF document (mm units). */
export function drawVectorMapPdf(doc: jsPDF, render: VectorMapRenderData, area?: { x: number; y: number; width: number; height: number }) {
  // Land/paper base color first, matching the thumbnail and the editor basemap.
  if (area) {
    const [r, g, b] = hexToRgb(render.background);
    doc.setFillColor(r, g, b);
    doc.rect(area.x, area.y, area.width, area.height, 'F');
  }
  for (const fill of render.fills) {
    const [r, g, b] = hexToRgb(fill.color);
    doc.setFillColor(r, g, b);
    doc.setGState(new GState({ opacity: fill.opacity }));
    for (const poly of fill.polys) {
      for (const ring of poly) {
        ring.forEach(([x, y], i) => {
          if (i === 0) doc.moveTo(x, y);
          else doc.lineTo(x, y);
        });
        doc.close();
      }
    }
    doc.fillEvenOdd();
  }
  doc.setGState(new GState({ opacity: 1 }));

  doc.setLineCap('round');
  doc.setLineJoin('round');
  for (const line of render.lines) {
    const [r, g, b] = hexToRgb(line.color);
    doc.setDrawColor(r, g, b);
    doc.setLineWidth(line.width);
    doc.setGState(new GState({ opacity: line.opacity }));
    if (line.dash) doc.setLineDashPattern(line.dash, 0);
    for (const path of line.paths) {
      path.forEach(([x, y], i) => {
        if (i === 0) doc.moveTo(x, y);
        else doc.lineTo(x, y);
      });
    }
    doc.stroke();
    if (line.dash) doc.setLineDashPattern([], 0);
  }
  doc.setGState(new GState({ opacity: 1 }));
}

/** Numbered POI badge circles + white index numbers, matching `addPoiLayer`. */
export function drawPoiBadgesPdf(doc: jsPDF, proj: FrameProjection, pois: POI[], colorMode: ColorMode | undefined, spotColor: string, spiderify = true) {
  const colors = badgeColors(colorMode, spotColor);
  const [fr, fg, fb] = hexToRgb(colors.fill);
  const [wr, wg, wb] = hexToRgb('#ffffff');
  const [tr, tg, tb] = hexToRgb(colors.text);
  const pts = pois.map((p) => ({ x: proj.lngToX(p.lng), y: proj.latToY(p.lat) }));
  const laid = spiderify
    ? spiderifyPois(pts, 9, pois.map((p) => p.customNumber ?? p.id))
    : pts.map((p) => ({ x: p.x, y: p.y, spidered: false, legFrom: undefined }));

  doc.setDrawColor(0x66, 0x66, 0x66);
  doc.setLineWidth(0.2);
  for (const r of laid) {
    if (r.spidered && r.legFrom) doc.line(r.legFrom.x, r.legFrom.y, r.x, r.y);
  }

  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(4.5 * MM_TO_PT);
  for (let i = 0; i < pois.length; i++) {
    const p = pois[i];
    const r = laid[i];
    doc.setFillColor(fr, fg, fb);
    doc.setDrawColor(wr, wg, wb);
    doc.setLineWidth(1);
    doc.circle(r.x, r.y, 4, 'FD');
    doc.setTextColor(tr, tg, tb);
    doc.text(String(p.customNumber ?? 0), r.x, r.y, { align: 'center', baseline: 'middle' });
  }
}

/**
 * Renders the same vector map to a small PNG (5 px/mm) for the export-dialog
 * thumbnail. Reuses the decoded tiles + projection, so no extra MapLibre
 * instance or network work is needed.
 */
export function renderMapThumbnail(
  data: VectorMapData,
  areaMm: { w: number; h: number },
  pois: POI[],
  layers: MapLayerStyle | undefined,
  colorMode: ColorMode | undefined,
  spotColor: string,
  spiderify = true
): string {
  const scale = 5;
  const w = Math.max(2, Math.round(areaMm.w * scale));
  const h = Math.max(2, Math.round(areaMm.h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const proj = bboxToFrameRect(data.extent, { x: 0, y: 0, width: w, height: h });
  const render = buildVectorMapRenderData(data, proj, layers);

  ctx.fillStyle = render.background;
  ctx.fillRect(0, 0, w, h);

  for (const fill of render.fills) {
    ctx.globalAlpha = fill.opacity;
    ctx.fillStyle = fill.color;
    ctx.beginPath();
    for (const poly of fill.polys) {
      for (const ring of poly) {
        ring.forEach(([x, y], i) => {
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.closePath();
      }
    }
    ctx.fill('evenodd');
  }
  ctx.globalAlpha = 1;

  for (const line of render.lines) {
    ctx.globalAlpha = line.opacity;
    ctx.strokeStyle = line.color;
    ctx.lineWidth = Math.max(0.5, line.width * scale);
    if (line.dash) ctx.setLineDash(line.dash.map((d) => d * scale));
    ctx.beginPath();
    for (const path of line.paths) {
      path.forEach(([x, y], i) => {
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.globalAlpha = 1;

  const colors = badgeColors(colorMode, spotColor);
  const pts = pois.map((p) => ({ x: proj.lngToX(p.lng), y: proj.latToY(p.lat) }));
  const laid = spiderify
    ? spiderifyPois(pts, 9 * scale, pois.map((p) => p.customNumber ?? p.id))
    : pts.map((p) => ({ x: p.x, y: p.y, spidered: false, legFrom: undefined }));

  ctx.strokeStyle = '#666666';
  ctx.lineWidth = Math.max(0.5, 0.6 * scale);
  for (const r of laid) {
    if (r.spidered && r.legFrom) {
      ctx.beginPath();
      ctx.moveTo(r.legFrom.x, r.legFrom.y);
      ctx.lineTo(r.x, r.y);
      ctx.stroke();
    }
  }

  ctx.font = `bold ${Math.max(8, 4.5 * scale)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < pois.length; i++) {
    const p = pois[i];
    const r = laid[i];
    ctx.beginPath();
    ctx.arc(r.x, r.y, 4 * scale, 0, Math.PI * 2);
    ctx.fillStyle = colors.fill;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1 * scale;
    ctx.stroke();
    ctx.fillStyle = colors.text;
    ctx.fillText(String(p.customNumber ?? 0), r.x, r.y);
  }

  return canvas.toDataURL('image/png');
}
