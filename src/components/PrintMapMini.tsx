'use client';

import { useEffect, useRef, useCallback } from 'react';
import { Map } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapViewport, ColorMode } from '@/types';
import { useMap } from '@/context/MapContext';
import { applyLayerStyleOverrides, EDITOR_LABEL_SCALE } from '@/lib/mapStyle';
import { createViewportMap, addViewportPois, applyViewportStyle, fitViewportBbox } from '@/lib/viewportMap';
import { ensureMapWorker } from '@/lib/maplibreWorker';

ensureMapWorker();

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
 */
export function PrintMapMini({ viewport, className, onLoad, onUpdate, spotColor: spotColorProp, colorMode: colorModeProp }: PrintMapMiniProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const onUpdateRef = useRef(onUpdate);
  const viewportRef = useRef(viewport);

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

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = createViewportMap(containerRef.current, {
      viewport,
      labelScale: EDITOR_LABEL_SCALE,
      interactive: false,
    });

    mapRef.current = map;

    const onStyleLoad = () => {
      applyViewportStyle(map, { viewport, pois, colorMode, spotColor, labelScale: EDITOR_LABEL_SCALE });
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
      // A bbox-fitted tile must not write center/zoom: the fit defines the
      // framing for the tile's small canvas, which is not the print camera.
      // Writing it used to feed the editor's center/zoom sync, whose moveend
      // recomputed an expanding bbox on every tab switch.
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
    if (containerRef.current) ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      map.off('style.load', onStyleLoad);
      map.remove();
      mapRef.current = null;
    };
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
  }, [pois, colorMode, spotColor, viewport.visiblePoiIds, viewport.spiderify]);

  // Apply the viewport's layer toggles/colors so the tile matches the editor
  // and the print. Also run once when the style first loads (the style.load
  // listeners above may run before this effect's map.isStyleLoaded() check).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => applyLayerStyleOverrides(map, viewport.layers, EDITOR_LABEL_SCALE);
    if (map.isStyleLoaded()) {
      apply();
    } else {
      map.once('style.load', apply);
    }
  }, [viewport.layers]);

  return <div ref={containerRef} className={className} style={{ width: '100%', height: '100%' }} />;
}
