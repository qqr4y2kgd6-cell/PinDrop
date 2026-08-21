'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { Map } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapViewport, ColorMode } from '@/types';
import { useMap } from '@/context/MapContext';
import { applyLayerStyleOverrides, applyEnhancedLayerStyle, DEFAULT_LAYER_STYLE } from '@/lib/mapStyle';
import { CSS_PX_PER_MM } from '@/lib/units';
import { createViewportMap, addViewportPois, applyViewportStyle, fitViewportBbox } from '@/lib/viewportMap';
import { ensureGoogleFonts } from '@/lib/placeNameFonts';
import { ensureMapWorker } from '@/lib/maplibreWorker';

ensureMapWorker();

/** Approximate editor canvas width in CSS px. */
const EDITOR_APPROX_WIDTH = 1000;

interface PrintMapMiniProps {
  viewport: MapViewport;
  className?: string;
  onLoad?: (map: Map) => void;
  onUpdate?: (updates: Partial<MapViewport>) => void;
  spotColor?: string;
  colorMode?: ColorMode;
}

/**
 * Non-interactive preview map for a frame. When the viewport carries a `bbox`
 * the map is fitted to it exactly (matching the export renderer), so the
 * vector `GridOverlay` drawn over the frame aligns with the basemap.
 *
 * The map is rendered inside an oversized inner div (matching the editor's
 * pixel width) and CSS-scaled down.  This forces MapLibre's fitBounds to
 * compute the same zoom level as the editor, so the same detailed vector
 * tiles (small roads, buildings, etc.) are fetched and rendered.
 */
export function PrintMapMini({ viewport, className, onLoad, onUpdate, spotColor: spotColorProp, colorMode: colorModeProp }: PrintMapMiniProps) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const onUpdateRef = useRef(onUpdate);
  const viewportRef = useRef(viewport);
  const [outerSize, setOuterSize] = useState<{ w: number; h: number }>({ w: EDITOR_APPROX_WIDTH, h: EDITOR_APPROX_WIDTH });

  useEffect(() => {
    onUpdateRef.current = onUpdate;
    viewportRef.current = viewport;
  }, [onUpdate, viewport]);

  const { pois, layout } = useMap();
  const colorMode = colorModeProp ?? layout.colorMode ?? 'spot';
  const spotColor = spotColorProp ?? layout.spotColor;

  const fitToBbox = useCallback((map: Map) => {
    fitViewportBbox(map, viewportRef.current);
  }, []);

  const scale = Math.min(outerSize.w / EDITOR_APPROX_WIDTH, 1);
  const innerHeight = Math.round(outerSize.h * (EDITOR_APPROX_WIDTH / outerSize.w));

  // Measure the outer (actual) container.
  useEffect(() => {
    const outer = outerRef.current;
    if (!outer) return;
    const measure = () => {
      const aw = outer.clientWidth || 1;
      const ah = outer.clientHeight || 1;
      setOuterSize((prev) => (prev.w === aw && prev.h === ah ? prev : { w: aw, h: ah }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(outer);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const inner = innerRef.current;
    if (!inner || mapRef.current) return;

    let cancelled = false;

    (async () => {
      await ensureGoogleFonts();
      if (cancelled || !innerRef.current || mapRef.current) return;

    const printWidthPx = viewport.positionOnPage.width * CSS_PX_PER_MM;
    const tileLabelScale = Math.max(0.5, EDITOR_APPROX_WIDTH / printWidthPx);

    const map = createViewportMap(innerRef.current, {
      viewport,
      labelScale: tileLabelScale,
      interactive: false,
    });

    mapRef.current = map;

    const onStyleLoad = () => {
      const pw = viewport.positionOnPage.width * CSS_PX_PER_MM;
      const ls = Math.max(0.5, EDITOR_APPROX_WIDTH / pw);
      applyViewportStyle(map, { viewport, pois, colorMode, spotColor, labelScale: ls });
      if (onLoad) onLoad(map);
    };

    if (map.isStyleLoaded()) {
      onStyleLoad();
    } else {
      map.once('style.load', onStyleLoad);
    }

    map.on('moveend', () => {
      const onUpdate = onUpdateRef.current;
      if (!onUpdate) return;
      const cur = viewportRef.current;
      if (cur.bbox) return;
      const center = map.getCenter();
      const updates: Partial<MapViewport> = {};
      if (Math.abs(center.lng - cur.center[0]) + Math.abs(center.lat - cur.center[1]) > 0.00001) {
        updates.center = [center.lng, center.lat];
      }
      const z = map.getZoom();
      if (Math.abs(z - cur.zoom) > 0.001) {
        updates.zoom = z;
      }
      if (updates.center || updates.zoom) onUpdate(updates);
    });

    const ro = new ResizeObserver(() => {
      if (mapRef.current) {
        mapRef.current.resize();
        fitToBbox(mapRef.current);
      }
    });
    ro.observe(inner);

    return () => {
      cancelled = true;
      ro.disconnect();
      map.off('style.load', onStyleLoad);
      map.remove();
      mapRef.current = null;
    };
    })(); // async IIFE – ensureGoogleFonts
  }, [viewport.id]);

  // Keep center/zoom in sync when edited externally (frame zoom buttons, props)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !viewport) return;
    if (viewport.bbox) {
      fitToBbox(map);
      return;
    }
    const c = map.getCenter();
    const diff = Math.abs(c.lng - viewport.center[0]) + Math.abs(c.lat - viewport.center[1]);
    if (diff > 0.00001) map.setCenter(viewport.center);
    const z = map.getZoom();
    if (Math.abs(z - viewport.zoom) > 0.001) map.setZoom(viewport.zoom);
  }, [viewport.center, viewport.zoom, viewport.bbox, fitToBbox]);

  // Keep bearing in sync when rotation is edited
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !viewport) return;
    const target = viewport.rotation ?? 0;
    if (Math.abs(map.getBearing() - target) > 0.001) {
      map.setBearing(target);
      fitToBbox(map);
    }
  }, [viewport.rotation, viewport.bbox, fitToBbox]);

  // Refresh markers when POIs, color mode or spot color change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const update = () => addViewportPois(map, { viewport, pois, colorMode, spotColor });
    if (map.isStyleLoaded()) {
      update();
    } else {
      map.once('style.load', update);
    }
  }, [pois, colorMode, spotColor, viewport.visiblePoiIds, viewport.spiderify, viewport.poiMarkerScale]);

  // Apply the viewport's layer toggles/colors so the tile matches the editor
  // and the print. Also run once when the style first loads (the style.load
  // listeners above may run before this effect's map.isStyleLoaded() check).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const pw = viewport.positionOnPage.width * CSS_PX_PER_MM;
      const ls = Math.max(0.5, EDITOR_APPROX_WIDTH / pw);
      applyLayerStyleOverrides(map, viewport.layers, ls);
      applyEnhancedLayerStyle(map, { ...DEFAULT_LAYER_STYLE, ...viewport.layers });
    };
    if (map.isStyleLoaded()) {
      apply();
    } else {
      map.once('style.load', apply);
    }
  }, [viewport.layers]);

  return (
    <div ref={outerRef} className={className} style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
      <div
        ref={innerRef}
        style={{
          width: `${EDITOR_APPROX_WIDTH}px`,
          height: `${innerHeight}px`,
          transform: `scale(${scale})`,
          transformOrigin: '0 0',
        }}
      />
    </div>
  );
}
