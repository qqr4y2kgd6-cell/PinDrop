import type { StyleSpecification, GeoJSONSource, Map as MapLibreMap, FilterSpecification, SymbolLayerSpecification } from 'maplibre-gl';
import type { POI, ColorMode, MapViewport, MapLayerStyle, PlaceNameTierStyle, PlaceNamesConfig, PlaceNameLang } from '@/types';
import { autoGridSpacing, buildGridGeometry, bboxToFrameRect, GRID_REF_LETTERS } from './grid';
import { spiderify as spiderifyPois } from './spiderify';
import { CSS_PX_PER_MM, TITLE_BAR_MM } from './units';

export type { ColorMode };

const GLYPHS_URL = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';

const SOURCE = {
  type: 'vector' as const,
  url: 'https://tiles.openfreemap.org/planet',
  attribution: '© OpenMapTiles © OpenStreetMap contributors',
};

interface RoadSpec {
  id: string;
  classes: string[];
  color: string;
  width: number;
}

const ROADS: RoadSpec[] = [
  { id: 'road-major', classes: ['motorway', 'trunk'], color: '#2b2b2b', width: 1.3 },
  { id: 'road-primary', classes: ['primary'], color: '#565656', width: 0.9 },
  { id: 'road-secondary', classes: ['secondary', 'tertiary'], color: '#8c8c8c', width: 0.65 },
  { id: 'road-minor', classes: ['minor', 'service'], color: '#b7b7b7', width: 0.45 },
  { id: 'road-path', classes: ['path', 'track'], color: '#d5d5d5', width: 0.35 },
];

const PARK_CLASSES = ['park', 'forest', 'grass', 'garden', 'cemetery', 'meadow', 'heath', 'wood'];

/** Settlement/admin place tiers (subset of `ResolvedPlaceNames` without water/road). */
export type PlaceTier = 'country' | 'city' | 'town' | 'village' | 'suburb' | 'island';

/** All stylable place-name tiers (every `ResolvedPlaceNames` key except the master `show`/`lang`). */
export type PlaceNameTierKey = keyof Omit<ResolvedPlaceNames, 'show' | 'lang'>;

/** `place` layer classes bucketed into each settlement/admin tier. */
export const PLACE_TIER_CLASSES: Record<PlaceTier, string[]> = {
  country: ['continent', 'country', 'state', 'province'],
  city: ['city'],
  town: ['town'],
  village: ['village', 'hamlet', 'borough', 'isolated_dwelling'],
  suburb: ['suburb', 'quarter', 'neighbourhood'],
  island: ['island'],
};

/** Collision/draw priority per tier: lower = placed first = wins overlaps. */
export const PLACE_TIER_SORT_KEY: Record<PlaceNameTierKey, number> = {
  country: 0,
  city: 1,
  town: 2,
  village: 3,
  suburb: 4,
  island: 5,
  water: 6,
  road: 7,
};

/** `water_name` layer classes (oceans, seas, lakes, rivers, bays, …). */
export const WATER_NAME_CLASSES = ['ocean', 'sea', 'lake', 'river', 'canal', 'reservoir', 'bay', 'fjord', 'strait', 'lagoon', 'oxbow', 'water'];

/** Road classes that get name labels (`minor` = residential/living streets; `service` = alleys/service roads; `path` = pedestrian streets/walkways; `track` = unpaved tracks). */
export const ROAD_NAME_CLASSES = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service', 'path', 'track'];

/** Fully-resolved place-name style with every field on every tier filled in. */
export interface ResolvedPlaceNames {
  show: boolean;
  lang: PlaceNameLang;
  country: Required<PlaceNameTierStyle>;
  city: Required<PlaceNameTierStyle>;
  town: Required<PlaceNameTierStyle>;
  village: Required<PlaceNameTierStyle>;
  suburb: Required<PlaceNameTierStyle>;
  island: Required<PlaceNameTierStyle>;
  water: Required<PlaceNameTierStyle>;
  road: Required<PlaceNameTierStyle>;
}

function defaultTier(color: string, sizeMm: number, bold = false, italic = false, uppercase = false): Required<PlaceNameTierStyle> {
  return { show: false, color, sizeMm, bold, italic, uppercase, haloColor: '#ffffff', haloWidthMm: 0.3 };
}

export const DEFAULT_PLACE_NAMES: ResolvedPlaceNames = {
  show: false,
  lang: 'local',
  country: defaultTier('#2f2f2f', 3.5, true, false, true),
  city: defaultTier('#3f3f3f', 2.8, true),
  town: defaultTier('#4a4a4a', 2.2, false),
  village: defaultTier('#5a5a5a', 1.8, false),
  suburb: defaultTier('#6a6a6a', 1.5, false),
  island: defaultTier('#5a5a5a', 1.8, false, true),
  water: defaultTier('#2b6cb0', 2, false, true),
  road: defaultTier('#555555', 1.6, false),
};

/** Merges a partial `placeNames` config over the print defaults (all tiers off). */
export function resolvePlaceNames(cfg?: PlaceNamesConfig): ResolvedPlaceNames {
  return {
    show: cfg?.show ?? DEFAULT_PLACE_NAMES.show,
    lang: cfg?.lang ?? DEFAULT_PLACE_NAMES.lang,
    country: { ...DEFAULT_PLACE_NAMES.country, ...cfg?.country },
    city: { ...DEFAULT_PLACE_NAMES.city, ...cfg?.city },
    town: { ...DEFAULT_PLACE_NAMES.town, ...cfg?.town },
    village: { ...DEFAULT_PLACE_NAMES.village, ...cfg?.village },
    suburb: { ...DEFAULT_PLACE_NAMES.suburb, ...cfg?.suburb },
    island: { ...DEFAULT_PLACE_NAMES.island, ...cfg?.island },
    water: { ...DEFAULT_PLACE_NAMES.water, ...cfg?.water },
    road: { ...DEFAULT_PLACE_NAMES.road, ...cfg?.road },
  };
}

/**
 * Text-size expression, scaled by `rank` (lower = more important) the way real
 * maps emphasize bigger places. `rank` only exists on country/state/city/town
 * features; other classes fall back to the top end of the range.
 */
function rankTextSizeExpr(sizeMm: number, maxRank: number, maxScale: number, minScale: number, pxPerMm: number) {
  return [
    'interpolate',
    ['linear'],
    ['coalesce', ['get', 'rank'], maxRank],
    1,
    sizeMm * maxScale * pxPerMm,
    maxRank,
    sizeMm * minScale * pxPerMm,
  ] as unknown as number;
}

function placeNameLayer(
  id: string,
  sourceLayer: string,
  filter: FilterSpecification,
  layout: SymbolLayerSpecification['layout'],
  paint: SymbolLayerSpecification['paint']
): SymbolLayerSpecification {
  return {
    id,
    type: 'symbol',
    source: 'openmaptiles',
    'source-layer': sourceLayer,
    filter,
    layout: { visibility: 'none', 'text-field': ['get', 'name'], ...layout },
    paint,
  };
}

/**
 * Label symbol layers for the place-name hierarchy (added above roads, below POIs).
 *
 * `labelScale` is an extra CSS-px multiplier for on-screen previews (editor +
 * layout tiles) only — the raster export and vector renderer use `1` so the
 * printed mm sizes stay physically exact. The editor renders everything at half
 * physical scale (`CSS_PX_PER_MM = 2` CSS px/mm), which makes small print sizes
 * unreadable on screen; the editor passes `EDITOR_LABEL_SCALE` (2) to double
 * the on-screen text while preserving the tier hierarchy.
 *
 * `symbol-sort-key` makes more important tiers win collision placement: features
 * are placed in ascending sort-key order, so the first placed symbol keeps its
 * spot. country/city/town … beat island/water/road, and water no longer hides
 * settlement names.
 */
function placeNameStyleLayers(labelScale = 1): StyleSpecification['layers'] {
  const n = DEFAULT_PLACE_NAMES;
  const pxPerMm = CSS_PX_PER_MM * labelScale;
  const textSize = (sizeMm: number) => sizeMm * pxPerMm;
  const font = (tier: Required<PlaceNameTierStyle>) => (tier.bold ? 'Noto Sans Bold' : tier.italic ? 'Noto Sans Italic' : 'Noto Sans Regular');
  const halo = (tier: Required<PlaceNameTierStyle>) => ({
    'text-color': tier.color,
    'text-halo-color': tier.haloColor,
    'text-halo-width': tier.haloWidthMm * pxPerMm,
  });

  const placeLayer = (tier: PlaceTier, rankExpr?: number, transform?: 'uppercase' | 'none' | 'lowercase') => {
    const t = n[tier];
    const caseTransform: 'uppercase' | 'none' | 'lowercase' = transform ?? (t.uppercase ? 'uppercase' : 'none');
    return placeNameLayer(
      `place-${tier}`,
      'place',
      ['in', 'class', ...PLACE_TIER_CLASSES[tier]] as FilterSpecification,
      {
        'text-font': [font(t)],
        'text-size': rankExpr ?? textSize(t.sizeMm),
        'symbol-sort-key': PLACE_TIER_SORT_KEY[tier],
        ...(t.uppercase || transform ? { 'text-transform': caseTransform } : {}),
      },
      halo(t)
    );
  };

  return [
    placeNameLayer(
      'water-name',
      'water_name',
      ['all', ['in', 'class', ...WATER_NAME_CLASSES], ['has', 'name']] as FilterSpecification,
      { 'text-font': [font(n.water)], 'text-size': textSize(n.water.sizeMm), 'symbol-sort-key': PLACE_TIER_SORT_KEY.water },
      halo(n.water)
    ),
    placeLayer('island'),
    placeLayer('country', rankTextSizeExpr(n.country.sizeMm, 6, 1.15, 0.8, pxPerMm)),
    placeLayer('city', rankTextSizeExpr(n.city.sizeMm, 10, 1.25, 0.7, pxPerMm)),
    placeLayer('town', rankTextSizeExpr(n.town.sizeMm, 10, 1.2, 0.8, pxPerMm)),
    placeLayer('village'),
    placeLayer('suburb'),
    placeNameLayer(
      'road-name',
      'transportation_name',
      ['all', ['in', 'class', ...ROAD_NAME_CLASSES], ['has', 'name']] as FilterSpecification,
      { 'symbol-placement': 'line', 'symbol-spacing': Math.round(300 * labelScale), 'symbol-sort-key': PLACE_TIER_SORT_KEY.road, 'text-font': [font(n.road)], 'text-size': textSize(n.road.sizeMm), 'text-letter-spacing': 0.05 },
      halo(n.road)
    ),
  ];
}

/**
 * A minimalist, print-optimized vector map style built on OpenFreeMap tiles.
 * High contrast, thin crisp roads, flat fills and no label clutter.
 */
export function createPrintStyle(labelScale = 1): StyleSpecification {
  const layers: StyleSpecification['layers'] = [
    {
      id: 'background',
      type: 'background',
      paint: { 'background-color': '#ffffff' },
    },
    {
      id: 'park',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'landuse',
      filter: ['in', 'class', ...PARK_CLASSES] as FilterSpecification,
      paint: { 'fill-color': '#eaeaea', 'fill-opacity': 1 },
    },
    {
      id: 'park-landcover',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'landcover',
      filter: ['in', 'class', 'grass', 'wood', 'forest', 'scrub'] as FilterSpecification,
      paint: { 'fill-color': '#eaeaea', 'fill-opacity': 1 },
    },
    {
      id: 'water',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'water',
      paint: { 'fill-color': '#dfe6ec', 'fill-opacity': 1 },
    },
    {
      id: 'waterway',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'waterway',
      paint: {
        'line-color': '#c2ccd6',
        'line-width': 0.5,
        'line-opacity': 1,
      },
    },
    {
      id: 'building',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'building',
      paint: { 'fill-color': '#f0f0f0', 'fill-opacity': 1 },
    },
    {
      id: 'building-outline',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'building',
      paint: { 'line-color': '#d8d8d8', 'line-width': 0.2 },
    },
    ...ROADS.map((r) => ({
      id: r.id,
      type: 'line' as const,
      source: 'openmaptiles',
      'source-layer': 'transportation',
      filter: ['in', 'class', ...r.classes] as FilterSpecification,
      paint: {
        'line-color': r.color,
        'line-width': r.width,
        'line-opacity': 1,
      },
    })),
    {
      id: 'boundary',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'boundary',
      filter: ['match', ['get', 'admin_level'], ['2', '3', '4'], true, false] as FilterSpecification,
      paint: {
        'line-color': '#9a9a9a',
        'line-width': 0.4,
        'line-dasharray': [2, 2],
      },
    },
    ...placeNameStyleLayers(labelScale),
  ];

  return {
    version: 8,
    sources: { openmaptiles: SOURCE },
    glyphs: GLYPHS_URL,
    layers,
  };
}

/** On-screen multiplier for place-name text (editor + layout preview only). */
export const EDITOR_LABEL_SCALE = 2;

export const ROAD_LAYER_IDS = ROADS.map((r) => r.id);

export function createPoiGeoJSON(pois: POI[], activeOnly = true) {
  const activePois = activeOnly ? pois.filter((p) => p.active) : pois;
  return {
    type: 'FeatureCollection' as const,
    features: activePois.map((poi) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [poi.lng, poi.lat] },
      properties: {
        id: poi.id,
        number: poi.customNumber ?? 0,
        name: poi.name,
      },
    })),
  };
}

function badgeColors(mode: ColorMode, spotColor: string) {
  if (mode === 'spot') return { fill: spotColor, text: '#ffffff' };
  if (mode === 'grayscale') return { fill: '#4a4a4a', text: '#ffffff' };
  return { fill: '#111111', text: '#ffffff' };
}

export const POI_SOURCE = 'pois';
export const POI_LEG_SOURCE = 'poi-legs';

/** Min badge center-to-center distance (CSS px) before spiderification kicks in. */
const POI_SPIDER_MIN_DIST_PX = 18;

function poiSpiderData(map: MapLibreMap, pois: POI[], spiderify = true, scale = 1) {
  const active = pois.filter((p) => p.active);
  const pts = active.map((p) => map.project([p.lng, p.lat]));
  const laid = spiderify ? spiderifyPois(pts, POI_SPIDER_MIN_DIST_PX * scale, active.map((p) => p.customNumber ?? p.id)) : pts.map((p) => ({ x: p.x, y: p.y, spidered: false, legFrom: undefined }));
  const badgeFeatures: Array<GeoJSON.Feature> = [];
  const legFeatures: Array<GeoJSON.Feature> = [];
  for (let i = 0; i < active.length; i++) {
    const r = laid[i];
    const pos = r.spidered ? map.unproject([r.x, r.y]) : { lng: active[i].lng, lat: active[i].lat };
    const coords = [pos.lng, pos.lat] as [number, number];
    badgeFeatures.push({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: coords },
      properties: { id: active[i].id, number: active[i].customNumber ?? 0, name: active[i].name },
    });
    if (r.spidered && r.legFrom) {
      const from = map.unproject([r.legFrom.x, r.legFrom.y]);
      legFeatures.push({
        type: 'Feature' as const,
        geometry: { type: 'LineString' as const, coordinates: [[from.lng, from.lat] as [number, number], coords] },
        properties: {},
      });
    }
  }
  return {
    badges: { type: 'FeatureCollection' as const, features: badgeFeatures },
    legs: { type: 'FeatureCollection' as const, features: legFeatures },
  };
}

/** Re-computes spiderified POI badge positions for the current camera and updates both sources. */
export function repositionPoiLayer(map: MapLibreMap, pois: POI[], spiderify = true, scale = 1) {
  const data = poiSpiderData(map, pois, spiderify, scale);
  const badgeSrc = map.getSource(POI_SOURCE) as GeoJSONSource | undefined;
  const legSrc = map.getSource(POI_LEG_SOURCE) as GeoJSONSource | undefined;
  if (badgeSrc) badgeSrc.setData(data.badges);
  if (legSrc) legSrc.setData(data.legs);
}

/**
 * Adds (or updates) the numbered marker badge layers for all active POIs.
 * A filled circle badge with the POI's index number rendered in white.
 * Overlapping badges are spiderified apart with leader lines; positions are
 * recomputed whenever the camera moves.
 */
export function addPoiLayer(map: MapLibreMap, pois: POI[], mode: ColorMode, spotColor: string, spiderify = true, scale = 1) {
  const data = createPoiGeoJSON(pois);
  const colors = badgeColors(mode, spotColor);

  if (!map.getSource(POI_SOURCE)) {
    map.addSource(POI_SOURCE, { type: 'geojson', data });
  } else {
    (map.getSource(POI_SOURCE) as GeoJSONSource).setData(data);
  }

  if (!map.getSource(POI_LEG_SOURCE)) {
    map.addSource(POI_LEG_SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  }

  if (!map.getLayer('poi-legs')) {
    map.addLayer({
      id: 'poi-legs',
      type: 'line',
      source: POI_LEG_SOURCE,
      layout: { 'line-cap': 'round' },
      paint: { 'line-color': '#666666', 'line-width': 1.2, 'line-opacity': 0.55 },
    });
  }

  if (!map.getLayer('poi-badges')) {
    map.addLayer({
      id: 'poi-badges',
      type: 'circle',
      source: POI_SOURCE,
      paint: {
        'circle-radius': 8 * scale,
        'circle-color': colors.fill,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2 * scale,
      },
    });
    map.addLayer({
      id: 'poi-numbers',
      type: 'symbol',
      source: POI_SOURCE,
      layout: {
        'text-field': ['get', 'number'],
        'text-font': ['Noto Sans Bold'],
        'text-size': 9 * scale,
        'text-allow-overlap': true,
      },
      paint: {
        'text-color': colors.text,
        'text-halo-color': colors.fill,
        'text-halo-width': 0.5,
      },
    });
  } else {
    map.setPaintProperty('poi-badges', 'circle-radius', 8 * scale);
    map.setPaintProperty('poi-badges', 'circle-color', colors.fill);
    map.setPaintProperty('poi-badges', 'circle-stroke-width', 2 * scale);
    map.setLayoutProperty('poi-numbers', 'text-size', 9 * scale);
    map.setPaintProperty('poi-numbers', 'text-color', colors.text);
    map.setPaintProperty('poi-numbers', 'text-halo-color', colors.fill);
  }

  const onReposition = () => repositionPoiLayer(map, pois, spiderify, scale);
  map.off('moveend', onReposition);
  map.off('zoomend', onReposition);
  map.off('pitchend', onReposition);
  map.on('moveend', onReposition);
  map.on('zoomend', onReposition);
  map.on('pitchend', onReposition);
  requestAnimationFrame(onReposition);
}

export function removePoiLayer(map: MapLibreMap) {
  if (map.getLayer('poi-numbers')) map.removeLayer('poi-numbers');
  if (map.getLayer('poi-badges')) map.removeLayer('poi-badges');
  if (map.getLayer('poi-legs')) map.removeLayer('poi-legs');
  if (map.getSource(POI_SOURCE)) map.removeSource(POI_SOURCE);
  if (map.getSource(POI_LEG_SOURCE)) map.removeSource(POI_LEG_SOURCE);
}

/** Per-road-class width/opacity multipliers, applied on top of `roadWidth`/`roadOpacity`. */
const ROAD_SPECS = [
  { id: 'road-major', w: 1.4, o: 1 },
  { id: 'road-primary', w: 1, o: 0.85 },
  { id: 'road-secondary', w: 0.7, o: 0.7 },
  { id: 'road-minor', w: 0.5, o: 0.55 },
  { id: 'road-path', w: 0.35, o: 0.4 },
];

export const DEFAULT_LAYER_STYLE: Required<MapLayerStyle> = {
  showRoads: true,
  roadColor: '#444444',
  roadWidth: 1,
  roadOpacity: 1,
  showBuildings: true,
  buildingColor: '#f0f0f0',
  buildingOutlineColor: '#d0d0d0',
  buildingOpacity: 1,
  showWater: true,
  waterColor: '#dfe6ec',
  waterOpacity: 1,
  showParks: true,
  parkColor: '#eaeaea',
  parkOpacity: 1,
  landColor: '#ffffff',
  placeNames: DEFAULT_PLACE_NAMES,
};

function setLayerVisibility(map: MapLibreMap, ids: string[], visible: boolean) {
  ids.forEach((id) => {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
  });
}

/**
 * Applies the per-viewport layer toggles and colors to a map. Used by the
 * editor, the layout mini tiles and the PDF export so a viewport renders the
 * same everywhere. Missing fields fall back to the print defaults.
 *
 * This must be safe to call from a `style.load` listener: maplibre emits
 * `style.load` as soon as the style JSON is applied, but `isStyleLoaded()`
 * stays false until every tile/font/glyph is in, so it can NOT be used as a
 * gate here. Each layer op is guarded with `getLayer` instead, which only
 * succeeds once the style JSON is applied.
 */
export function applyLayerStyleOverrides(map: MapLibreMap, layers?: MapLayerStyle, labelScale = 1) {
  const l = { ...DEFAULT_LAYER_STYLE, ...layers };
  const pxPerMm = CSS_PX_PER_MM * labelScale;

  if (l.showRoads) {
    ROAD_SPECS.forEach(({ id, w, o }) => {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, 'visibility', 'visible');
        map.setPaintProperty(id, 'line-color', l.roadColor);
        map.setPaintProperty(id, 'line-width', l.roadWidth * w);
        map.setPaintProperty(id, 'line-opacity', l.roadOpacity * o);
      }
    });
  } else {
    setLayerVisibility(map, ROAD_LAYER_IDS, false);
  }

  if (l.showBuildings) {
    if (map.getLayer('building')) {
      map.setLayoutProperty('building', 'visibility', 'visible');
      map.setPaintProperty('building', 'fill-color', l.buildingColor);
      map.setPaintProperty('building', 'fill-opacity', l.buildingOpacity);
    }
    if (map.getLayer('building-outline')) {
      map.setLayoutProperty('building-outline', 'visibility', 'visible');
      map.setPaintProperty('building-outline', 'line-color', l.buildingOutlineColor);
    }
  } else {
    setLayerVisibility(map, ['building', 'building-outline'], false);
  }

  if (l.showWater) {
    ['water', 'waterway'].forEach((id) => {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, 'visibility', 'visible');
        map.setPaintProperty(id, id === 'water' ? 'fill-color' : 'line-color', l.waterColor);
        map.setPaintProperty(id, id === 'water' ? 'fill-opacity' : 'line-opacity', l.waterOpacity);
      }
    });
  } else {
    setLayerVisibility(map, ['water', 'waterway'], false);
  }

  if (l.showParks) {
    ['park', 'park-landcover'].forEach((id) => {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, 'visibility', 'visible');
        map.setPaintProperty(id, 'fill-color', l.parkColor);
        map.setPaintProperty(id, 'fill-opacity', l.parkOpacity);
      }
    });
  } else {
    setLayerVisibility(map, ['park', 'park-landcover'], false);
  }

  if (map.getLayer('background')) {
    map.setPaintProperty('background', 'background-color', l.landColor);
  }

  const pn = resolvePlaceNames(l.placeNames);
  const englishText = pn.lang === 'english';
  const setTier = (id: string, tier: Required<PlaceNameTierStyle>, opts: { font: string; size: number; uppercase?: boolean; letterSpacing?: number }) => {
    if (!map.getLayer(id)) return;
    const visible = pn.show && tier.show;
    map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
    if (!visible) return;
    map.setLayoutProperty(id, 'text-field', englishText ? ['coalesce', ['get', 'name:en'], ['get', 'name_en'], ['get', 'name:latin'], ['get', 'name']] : ['get', 'name']);
    map.setLayoutProperty(id, 'text-font', [opts.font]);
    map.setLayoutProperty(id, 'text-size', opts.size);
    if (opts.uppercase !== undefined) map.setLayoutProperty(id, 'text-transform', opts.uppercase ? 'uppercase' : 'none');
    if (opts.letterSpacing !== undefined) map.setLayoutProperty(id, 'text-letter-spacing', opts.letterSpacing);
    map.setPaintProperty(id, 'text-color', tier.color);
    map.setPaintProperty(id, 'text-halo-color', tier.haloColor);
    map.setPaintProperty(id, 'text-halo-width', tier.haloWidthMm * pxPerMm);
  };

  setTier('water-name', pn.water, { font: pn.water.italic ? 'Noto Sans Italic' : 'Noto Sans Regular', size: pn.water.sizeMm * pxPerMm });
  setTier('place-island', pn.island, { font: pn.island.italic ? 'Noto Sans Italic' : 'Noto Sans Regular', size: pn.island.sizeMm * pxPerMm });
  setTier('place-country', pn.country, { font: 'Noto Sans Bold', size: rankTextSizeExpr(pn.country.sizeMm, 6, 1.15, 0.8, pxPerMm), uppercase: true });
  setTier('place-city', pn.city, { font: 'Noto Sans Bold', size: rankTextSizeExpr(pn.city.sizeMm, 10, 1.25, 0.7, pxPerMm) });
  setTier('place-town', pn.town, { font: pn.town.bold ? 'Noto Sans Bold' : 'Noto Sans Regular', size: rankTextSizeExpr(pn.town.sizeMm, 10, 1.2, 0.8, pxPerMm) });
  setTier('place-village', pn.village, { font: pn.village.bold ? 'Noto Sans Bold' : 'Noto Sans Regular', size: pn.village.sizeMm * pxPerMm });
  setTier('place-suburb', pn.suburb, { font: pn.suburb.bold ? 'Noto Sans Bold' : 'Noto Sans Regular', size: pn.suburb.sizeMm * pxPerMm });
  setTier('road-name', pn.road, { font: pn.road.bold ? 'Noto Sans Bold' : 'Noto Sans Regular', size: pn.road.sizeMm * pxPerMm, letterSpacing: 0.05 });
}

/** Bounding box: [minLng, minLat, maxLng, maxLat] */
export type BBox = [number, number, number, number];

/** Web-Mercator latitude limit (beyond it no Mercator y exists). */
export const MERCATOR_MAX_LAT = 85.051129;

/**
 * Clamps a bbox to valid Web-Mercator coordinates. At low zoom a map area can
 * span more than the whole world, and a bbox derived from center+zoom then
 * exceeds ±90° latitude — maplibre's `fitBounds` throws on that. Clamping to
 * the Mercator range keeps the bbox renderable and matches maplibre's own
 * world-limiting behavior.
 */
export function clampBbox(bbox: BBox): BBox {
  const [w, s, e, n] = bbox;
  return [
    Math.max(-180, Math.min(180, w)),
    Math.max(-MERCATOR_MAX_LAT, Math.min(MERCATOR_MAX_LAT, s)),
    Math.max(-180, Math.min(180, e)),
    Math.max(-MERCATOR_MAX_LAT, Math.min(MERCATOR_MAX_LAT, n)),
  ];
}

/** Approximate meters per degree of latitude (WGS84). */
export const M_PER_DEG_LAT = 111320;

/** Approximate meters per degree of longitude at a given latitude. */
export function metersPerDegLng(lat: number) {
  return M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
}

/** Web-Mercator meters-per-pixel at a given latitude and zoom level (tile scale). */
export function metersPerPixel(lat: number, zoom: number) {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
}

/**
 * The geographic bounds covered by a viewport. Uses the stored `bbox` when
 * present, otherwise derives a bbox from center + zoom + the map-area aspect
 * (the content box below the title bar, so the derived bbox matches the grid
 * that is drawn over that area).
 */
export function viewportBounds(vp: {
  center: [number, number];
  zoom: number;
  positionOnPage: { width: number; height: number };
  showTitle?: boolean;
  itemSpacing?: number;
  bbox?: BBox;
}): BBox {
  if (vp.bbox) return vp.bbox;
  const [lng, lat] = vp.center;
  const titleBar = (vp.showTitle !== false ? TITLE_BAR_MM : 0) * CSS_PX_PER_MM;
  const spacing = (vp.itemSpacing ?? 0) * CSS_PX_PER_MM;
  const wPx = Math.max(1, vp.positionOnPage.width * CSS_PX_PER_MM - spacing);
  const hPx = Math.max(1, vp.positionOnPage.height * CSS_PX_PER_MM - titleBar - spacing);
  const mpp = metersPerPixel(lat, vp.zoom);
  const wM = wPx * mpp;
  const hM = hPx * mpp;
  return clampBbox([
    lng - wM / 2 / metersPerDegLng(lat),
    lat - hM / 2 / M_PER_DEG_LAT,
    lng + wM / 2 / metersPerDegLng(lat),
    lat + hM / 2 / M_PER_DEG_LAT,
  ]);
}

const clampZoom = (z: number) => Math.min(20, Math.max(1, z));

/**
 * Returns the viewport updates that zoom the frame by `dir` steps (±1), so the
 * tile zoom buttons work whether the viewport is driven by a `bbox` or by
 * center/zoom. With a bbox the geographic span is scaled around its center
 * (keeping the frame aspect), which the bbox-fitted map renderers honor.
 */
export function zoomViewport(vp: {
  bbox?: BBox;
  center: [number, number];
  zoom: number;
}, dir: 1 | -1): Partial<MapViewport> {
  if (vp.bbox) {
    const factor = Math.pow(2, -0.5 * dir);
    const cx = (vp.bbox[0] + vp.bbox[2]) / 2;
    const cy = (vp.bbox[1] + vp.bbox[3]) / 2;
    const halfW = ((vp.bbox[2] - vp.bbox[0]) * factor) / 2;
    const halfH = ((vp.bbox[3] - vp.bbox[1]) * factor) / 2;
    return {
      bbox: clampBbox([cx - halfW, cy - halfH, cx + halfW, cy + halfH]),
      zoom: clampZoom(vp.zoom + 0.5 * dir),
    };
  }
  return { zoom: clampZoom(vp.zoom + dir) };
}

/**
 * The geographic extent actually visible in a viewport's map area, derived by
 * extending the bbox's fitBounds projection to the whole frame (the map raster
 * overscans the letterboxed bbox). Grid lines built over this extent span the
 * full map frame, matching the grid drawn in the editor/PDF.
 */
export function viewportGridExtent(vp: {
  bbox?: BBox;
  positionOnPage?: { width: number; height: number };
  showTitle?: boolean;
  itemSpacing?: number;
}): BBox | null {
  if (!vp.bbox || !vp.positionOnPage) return null;
  const titleBar = (vp.showTitle !== false ? TITLE_BAR_MM : 0) * CSS_PX_PER_MM;
  const spacing = (vp.itemSpacing ?? 0) * CSS_PX_PER_MM;
  const width = Math.max(1, vp.positionOnPage.width * CSS_PX_PER_MM - spacing);
  const height = Math.max(1, vp.positionOnPage.height * CSS_PX_PER_MM - titleBar - spacing);
  const proj = bboxToFrameRect(vp.bbox, { x: 0, y: 0, width, height });
  return [proj.lngMin, proj.latMin, proj.lngMax, proj.latMax];
}

/**
 * Returns the grid reference (e.g. "B3") for a coordinate inside an extent.
 * Uses the same real-world unit grid that is drawn on the map (auto spacing
 * when no explicit spacing is set), so the reference always matches an actual
 * drawn cell. Returns null if the coordinate falls outside the extent.
 */
export function gridRefForPoi(lng: number, lat: number, extent: BBox, spacingM?: number): string | null {
  const [minLng, minLat, maxLng, maxLat] = extent;
  if (lng < minLng || lng > maxLng || lat < minLat || lat > maxLat) return null;

  const spacing = spacingM && spacingM > 0 ? spacingM : autoGridSpacing(extent);
  const geo = buildGridGeometry(extent, spacing);
  const { lngLines, latLines } = geo;

  const maxCol = Math.max(0, lngLines.length - 2);
  const maxRow = Math.max(0, latLines.length - 2);

  let col = -1;
  for (let i = 0; i <= maxCol; i++) {
    if (lng >= lngLines[i] - 1e-9 && lng <= lngLines[i + 1] + 1e-9) {
      col = i;
      break;
    }
  }
  if (col === -1) col = maxCol;
  col = Math.min(col, maxCol);

  let row = -1;
  for (let i = 0; i <= maxRow; i++) {
    if (lat >= latLines[i] - 1e-9 && lat <= latLines[i + 1] + 1e-9) {
      row = i;
      break;
    }
  }
  if (row === -1) row = maxRow;
  row = Math.min(row, maxRow);

  const rowFromTop = maxRow - row;
  return `${GRID_REF_LETTERS[rowFromTop % GRID_REF_LETTERS.length]}${col + 1}`;
}

/**
 * Computes grid references for every active POI against a viewport's visible
 * map grid (see `viewportGridExtent`). Prefers detail maps: among viewports
 * that carry a grid and contain the POI, the highest-zoom one wins.
 */
export function computeGridRefs(
  pois: POI[],
  viewports: {
    id: string;
    showGrid?: boolean;
    bbox?: BBox;
    zoom?: number;
    gridSpacing?: number;
    positionOnPage?: { width: number; height: number };
    showTitle?: boolean;
  }[]
) {
  const assignments: Record<string, string> = {};
  const gridViewports = viewports.filter((v) => v.showGrid && v.bbox && v.positionOnPage);

  for (const poi of pois) {
    let best: { ref: string; zoom: number } | null = null;
    for (const vp of gridViewports) {
      const extent = viewportGridExtent(vp);
      if (!extent) continue;
      const ref = gridRefForPoi(poi.lng, poi.lat, extent, vp.gridSpacing);
      if (!ref) continue;
      const zoom = vp.zoom ?? 0;
      if (!best || zoom > best.zoom) best = { ref, zoom };
    }
    if (best) assignments[poi.id] = best.ref;
  }
  return assignments;
}

/**
 * The active POIs to render on a viewport: every globally-active POI unless the
 * viewport pins an explicit list via `visiblePoiIds` (empty list = none).
 */
export function viewportActivePois(pois: POI[], vp: { visiblePoiIds?: string[] }): POI[] {
  const active = pois.filter((p) => p.active);
  if (!vp.visiblePoiIds) return active;
  const set = new Set(vp.visiblePoiIds);
  return active.filter((p) => set.has(p.id));
}

/**
 * The maps to outline as insets inside `vp`, in page order. Opt-in: only maps
 * explicitly listed in `insetViewportIds`. Legacy layouts that only have
 * `showInsets === true` fall back to every sibling map.
 */
export function insetViewports(viewports: MapViewport[], vp: MapViewport): MapViewport[] {
  const candidates = viewports.filter((v) => v.id !== vp.id && v.bbox);
  if (vp.insetViewportIds) {
    const set = new Set(vp.insetViewportIds);
    return candidates.filter((v) => set.has(v.id));
  }
  if (vp.showInsets === true) return candidates;
  return [];
}
