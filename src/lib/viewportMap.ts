'use client';

import { Map } from 'maplibre-gl';
import type { ColorMode, MapViewport, POI } from '@/types';
import {
  createPrintStyle,
  addPoiLayer,
  applyLayerStyleOverrides,
  clampBbox,
  viewportActivePois,
  EDITOR_LABEL_SCALE,
} from './mapStyle';

export interface ViewportMapOptions {
  viewport: MapViewport;
  labelScale?: number;
  pixelRatio?: number;
  interactive?: boolean;
  /** Override for the style's glyphs URL (defaults to the same-origin proxy). */
  glyphsUrl?: string;
}

/**
 * Single source of truth for how a viewport map is constructed. Every consumer
 * (the layout mini tiles and the PDF exporter) builds its map here so the print
 * can never drift from what the layout shows. `labelScale` mirrors the roadmap
 * text-size multiplier used by the editor/layout previews.
 */
export function createViewportMap(container: HTMLElement, opts: ViewportMapOptions): Map {
  const { viewport, labelScale = EDITOR_LABEL_SCALE, pixelRatio, interactive = false, glyphsUrl } = opts;
  return new Map({
    container,
    style: createPrintStyle(labelScale, glyphsUrl),
    center: viewport.center,
    zoom: viewport.zoom,
    bearing: viewport.rotation ?? 0,
    attributionControl: false,
    interactive,
    canvasContextAttributes: { preserveDrawingBuffer: true, antialias: true },
    ...(pixelRatio ? { pixelRatio } : {}),
  });
}

export interface ViewportStyleOptions {
  viewport: MapViewport;
  pois: POI[];
  colorMode: ColorMode;
  spotColor: string;
  labelScale?: number;
}

/** Attaches the POI markers for a viewport. */
export function addViewportPois(map: Map, opts: Pick<ViewportStyleOptions, 'viewport' | 'pois' | 'colorMode' | 'spotColor'>) {
  const { viewport, pois, colorMode, spotColor } = opts;
  addPoiLayer(map, viewportActivePois(pois, viewport), colorMode, spotColor, viewport.spiderify !== false, viewport.poiMarkerScale ?? 1);
}

/** Fits a bbox viewport exactly, mirroring the layout tiles' framing. */
export function fitViewportBbox(map: Map, viewport: MapViewport) {
  if (!viewport.bbox) return;
  const c = map.getContainer();
  if (c && (c.clientWidth <= 0 || c.clientHeight <= 0)) return;
  const b = clampBbox(viewport.bbox);
  try {
    map.fitBounds(
      [
        [b[0], b[1]],
        [b[2], b[3]],
      ],
      { padding: 0, duration: 0, bearing: map.getBearing() }
    );
  } catch (err) {
    console.warn('fitToBbox failed', err);
  }
}

/**
 * Applies everything the layout tiles use — POIs, per-viewport layer overrides
 * and the bbox fit — so the export renders exactly what the layout previews.
 * Runs the same styling regardless of caller (layout tile or PDF render).
 */
export function applyViewportStyle(map: Map, opts: ViewportStyleOptions) {
  const { viewport, pois, colorMode, spotColor, labelScale = EDITOR_LABEL_SCALE } = opts;
  addViewportPois(map, { viewport, pois, colorMode, spotColor });
  applyLayerStyleOverrides(map, viewport.layers, labelScale);
  fitViewportBbox(map, viewport);
}