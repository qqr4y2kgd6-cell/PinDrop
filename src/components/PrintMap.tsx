'use client';

import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { Map, LngLatBounds } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapViewport, MapLayerStyle, PlaceNameTierStyle, PlaceNamesConfig, PlaceNameLang } from '@/types';
import { useMap } from '@/context/MapContext';
import { createPrintStyle, addPoiLayer, clampBbox, applyLayerStyleOverrides, applyEnhancedLayerStyle, viewportBounds, DEFAULT_LAYER_STYLE, EDITOR_LABEL_SCALE, viewportActivePois, insetViewports, resolvePlaceNames, type PlaceNameTierKey } from '@/lib/mapStyle';
import { nearestCartographicZoom } from '@/lib/grid';
import { TITLE_BAR_MM } from '@/lib/units';
import { PLACE_NAME_FONTS, ensureGoogleFonts, CJK_IDEOGRAPH_FONT } from '@/lib/placeNameFonts';
import { GridOverlay } from './GridOverlay';
import { PoiLabelOverlay } from './PoiLabelOverlay';
import { Button } from '@/components/ui/button';
import { Target, Grid, ZoomIn, ZoomOut, Road, Building, Waves, TreePine, MapPin, Landmark, Building2, Home, Map as MapIcon, Anchor, ChevronDown, ChevronRight, Mountain, Satellite, Train, Footprints, Flag, type LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ColorPicker } from './ColorPicker';
import { ensureMapWorker } from '@/lib/maplibreWorker';

ensureMapWorker();

interface PrintMapProps {
  viewport: MapViewport | undefined;
  onViewportChange: (id: string, updates: Partial<MapViewport>) => void;
}

const PLACE_NAME_SIZES = [1.2, 1.5, 1.8, 2, 2.2, 2.5, 2.8, 3, 3.5, 4];
const PLACE_NAME_HALOS = [0, 0.2, 0.3, 0.5, 0.8];

const PLACE_TIER_ROWS: { key: PlaceNameTierKey; icon: LucideIcon; label: string; allowItalic?: boolean; allowUppercase?: boolean }[] = [
  { key: 'country', icon: Landmark, label: 'Country / Region', allowUppercase: true },
  { key: 'city', icon: Building2, label: 'Cities' },
  { key: 'town', icon: Home, label: 'Towns' },
  { key: 'village', icon: MapPin, label: 'Villages / Hamlets' },
  { key: 'suburb', icon: MapIcon, label: 'Suburbs / Quarters' },
  { key: 'island', icon: Anchor, label: 'Islands', allowItalic: true },
  { key: 'water', icon: Waves, label: 'Water (seas, lakes, rivers)', allowItalic: true },
  { key: 'road', icon: Road, label: 'Road names' },
];

interface PlaceTierRowProps {
  icon: LucideIcon;
  label: string;
  style: Required<PlaceNameTierStyle>;
  allowItalic?: boolean;
  allowUppercase?: boolean;
  onChange: (changes: Partial<PlaceNameTierStyle>) => void;
}

function PlaceTierRow({ icon: Icon, label, style, allowItalic, allowUppercase, onChange }: PlaceTierRowProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-1">
        <Label className="flex items-center gap-1.5 cursor-pointer">
          <Switch checked={style.show} onCheckedChange={(c) => onChange({ show: c })} />
          <Icon className="h-3.5 w-3.5" />
          <span>{label}</span>
        </Label>
        <div className="flex items-center gap-1">
          <Select value={String(style.sizeMm)} onValueChange={(v) => v && onChange({ sizeMm: parseFloat(v) })}>
            <SelectTrigger className="text-xs h-6 w-16 px-2" title="Size">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PLACE_NAME_SIZES.map((s) => (
                <SelectItem key={s} value={String(s)}>
                  {s.toFixed(1)} mm
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="sm"
            className={`h-6 w-6 p-0 text-xs font-bold ${style.bold ? 'bg-zinc-200 dark:bg-zinc-700' : ''}`}
            onClick={() => onChange({ bold: !style.bold })}
            title="Bold"
          >
            B
          </Button>
          <ColorPicker color={style.color} onChange={(c) => onChange({ color: c })} />
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setOpen(!open)} title="More options">
            {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>
      {open && (
        <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 pl-5">
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-zinc-500">Font</Label>
            <Select value={style.fontFamily || 'Noto Sans'} onValueChange={(v) => onChange({ fontFamily: v ?? undefined })}>
              <SelectTrigger className="text-xs h-7 px-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLACE_NAME_FONTS.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-zinc-500">Halo</Label>
            <div className="flex items-center gap-1.5">
              <ColorPicker color={style.haloColor} onChange={(c) => onChange({ haloColor: c })} />
              <Select value={String(style.haloWidthMm)} onValueChange={(v) => v && onChange({ haloWidthMm: parseFloat(v) })}>
                <SelectTrigger className="text-xs h-7 w-16 px-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLACE_NAME_HALOS.map((w) => (
                    <SelectItem key={w} value={String(w)}>
                      {w === 0 ? 'None' : String(w)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {allowItalic && (
            <Label className="flex items-center gap-1.5 cursor-pointer">
              <Switch checked={style.italic} onCheckedChange={(c) => onChange({ italic: c })} /> Italic
            </Label>
          )}
          {allowUppercase && (
            <Label className="flex items-center gap-1.5 cursor-pointer">
              <Switch checked={style.uppercase} onCheckedChange={(c) => onChange({ uppercase: c })} /> Uppercase
            </Label>
          )}
        </div>
      )}
    </div>
  );
}

export function PrintMap({ viewport, onViewportChange }: PrintMapProps) {
  const { pois, layout, addPoi, setEditingPoiId, themes, activeThemeId, applyTheme, saveTheme } = useMap();
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const viewportRef = useRef(viewport);
  const onViewportChangeRef = useRef(onViewportChange);
  onViewportChangeRef.current = onViewportChange;
  const [dropPinMode, setDropPinMode] = useState(false);
  const dropPinModeRef = useRef(false);
  useEffect(() => {
    dropPinModeRef.current = dropPinMode;
    const map = mapRef.current;
    if (!map) return;
    map.getCanvas().style.cursor = dropPinMode ? 'crosshair' : '';
  }, [dropPinMode]);
  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);
  const colorMode = layout.colorMode ?? 'spot';
  const spotColor = layout.spotColor;

  const layers = useMemo(() => viewport?.layers ?? {}, [viewport?.layers]);
  const updateLayers = (changes: Partial<MapLayerStyle>) => {
    if (!viewport) return;
    onViewportChange(viewport.id, { layers: { ...viewport.layers, ...changes } });
  };
  const layer = <K extends keyof Required<MapLayerStyle>>(key: K): Required<MapLayerStyle>[K] =>
    (layers[key] ?? DEFAULT_LAYER_STYLE[key]) as Required<MapLayerStyle>[K];

  const placeNames = useMemo(() => resolvePlaceNames(viewport?.layers?.placeNames), [viewport?.layers?.placeNames]);
  const updatePlaceNames = (changes: Partial<PlaceNamesConfig>) => {
    if (!viewport) return;
    onViewportChange(viewport.id, { layers: { ...viewport.layers, placeNames: { ...viewport.layers?.placeNames, ...changes } } });
  };
  const updateTier = (t: PlaceNameTierKey, changes: Partial<PlaceNameTierStyle>) => {
    if (!viewport) return;
    const base = viewport.layers?.placeNames ?? {};
    onViewportChange(viewport.id, { layers: { ...viewport.layers, placeNames: { ...base, [t]: { ...base[t], ...changes } } } });
  };

  const contentW = Math.max(1, (viewport?.positionOnPage.width ?? 1) - (layout.itemSpacing ?? 0));
  const contentH = Math.max(1, (viewport?.positionOnPage.height ?? 1) - (viewport?.showTitle !== false ? (viewport?.titleBarHeight ?? TITLE_BAR_MM) : 0) - (layout.itemSpacing ?? 0));
  const areaRef = useRef<HTMLDivElement>(null);
  const [boxSize, setBoxSize] = useState<{ w: number; h: number } | null>(null);
  const [containerReady, setContainerReady] = useState(false);

  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const update = () => {
      const aw = el.clientWidth;
      const ah = el.clientHeight;
      if (aw <= 0 || ah <= 0) return;
      const ratio = contentW / contentH;
      let w = aw;
      let h = aw / ratio;
      if (h > ah) {
        h = ah;
        w = ah * ratio;
      }
      setBoxSize({ w, h });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [contentW, contentH]);

  useEffect(() => {
    if (boxSize && boxSize.w > 0 && boxSize.h > 0) setContainerReady(true);
  }, [boxSize]);

  // Programmatic fits (initial fit, container resize) must not overwrite the
  // print bbox: the editor letterboxes the bbox to its own canvas aspect, so a
  // recompute at the print aspect would drift the framing. Suppress bbox writes
  // around these fits; user pans/zooms are free to write it.
  // Programmatic fits (initial, bbox refit, container resize) must not rewrite
  // the stored framing, so `fitToBbox` flags them and the moveend handler
  // ignores those moveends. fitBounds can emit a second, trailing moveend as the
  // map settles (style load, container resize during layout), so the flag stays
  // set until the camera has been quiet for a beat.
  const pendingFitRef = useRef(false);
  const fitTimerRef = useRef<number | null>(null);

  const fitToBbox = useCallback((map: Map, bbox?: MapViewport['bbox']) => {
    if (!bbox) return;
    const b = clampBbox(bbox);
    const c = map.getContainer() as HTMLDivElement;
    if (c && (c.clientWidth <= 0 || c.clientHeight <= 0)) return;
    pendingFitRef.current = true;
    try {
      map.fitBounds(
        [
          [b[0], b[1]],
          [b[2], b[3]],
        ],
        { padding: 0, duration: 0 }
      );
    } catch (err) {
      console.warn('fitToBbox failed', err);
    }
    if (fitTimerRef.current !== null) window.clearTimeout(fitTimerRef.current);
    fitTimerRef.current = window.setTimeout(() => {
      pendingFitRef.current = false;
      fitTimerRef.current = null;
    }, 400);
  }, []);

  // The map settles at the stored center/zoom before the style loads and the
  // bbox fit runs. Don't let that initial settle overwrite the print bbox:
  // only write `bbox` after the initial fit has actually completed.
  const fittedRef = useRef({ done: false });

  // The external vector style can emit `style.load` long before `isStyleLoaded()`
  // reports true (that getter also waits for every tile to render, which can
  // take many seconds). Gating the fit on `isStyleLoaded()` used to leave the
  // bbox write disabled forever, freezing the GridOverlay and mini tiles. Run
  // the fit as soon as the style JSON is applied (`style.load`); addPoiLayer and
  // fitBounds only need that, not the tiles. A fallback poll + `load` event
  // cover the cached-style / attach-after-load race.
  const ensureStyleReady = useCallback((map: Map, cb: () => void) => {
    let timer: number | null = null;
    let ran = false;
    const run = () => {
      if (ran) return;
      ran = true;
      if (timer !== null) window.clearInterval(timer);
      cb();
    };
    if (map.isStyleLoaded()) {
      run();
      return () => undefined;
    }
    map.once('style.load', run);
    map.once('load', run);
    let tries = 0;
    timer = window.setInterval(() => {
      tries += 1;
      if (map.isStyleLoaded()) {
        run();
      } else if (tries > 200) {
        run();
      }
    }, 100);
    return () => {
      if (timer !== null) window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current || !viewport || !containerReady) return;

    let cancelled = false;

    (async () => {
      // Ensure Google Fonts are loaded (used by the canvas/SVG vector label
      // renderer) before the map is created. The map's place-name glyphs come
      // from the same-origin glyph proxy, independent of these web fonts.
      await ensureGoogleFonts();
      if (cancelled || !mapContainer.current || mapRef.current) return;

    fittedRef.current.done = false;

    const map = new Map({
      container: mapContainer.current,
      style: createPrintStyle(EDITOR_LABEL_SCALE),
      center: viewport.center,
      zoom: viewport.zoom,
      attributionControl: false,
      localIdeographFontFamily: CJK_IDEOGRAPH_FONT,
    });

    mapRef.current = map;

    const onStyleReady = () => {
      addPoiLayer(map, viewportActivePois(pois, viewport), colorMode, spotColor, viewport.spiderify !== false, viewport.poiMarkerScale ?? 1, viewport.layers?.showPoiMarkers ?? true);
      applyLayerStyleOverrides(map, viewport?.layers, EDITOR_LABEL_SCALE);
      if (viewport?.layers) {
        const l = { ...DEFAULT_LAYER_STYLE, ...viewport.layers };
        applyEnhancedLayerStyle(map, l);
      } else {
        applyEnhancedLayerStyle(map, { ...DEFAULT_LAYER_STYLE });
      }
      if (viewport.bbox) {
        fitToBbox(map, viewport.bbox);
      }
      fittedRef.current.done = true;
    };

    const cleanupStyleReady = ensureStyleReady(map, onStyleReady);

    map.on('moveend', () => {
      const center = map.getCenter();
      const vp = viewportRef.current;
      if (!vp) return;
      // A programmatic fit (initial, bbox refit, container resize) must not
      // rewrite the stored framing: the editor canvas is a scaled-up print-aspect
      // rectangle, so the fitted camera is canvas-specific and the stored bbox is
      // already the exact fit target.
      if (pendingFitRef.current) return;
      const updates: Partial<MapViewport> = { center: [center.lng, center.lat], zoom: map.getZoom() };
      // Always maintain the bbox framing (grid or not): it is what the mini
      // tiles, index grid refs and the PDF exporter use. The editor canvas has
      // the print-frame aspect, so the current visible extent IS the print bbox.
      // Capturing getBounds() (rather than re-deriving from center/zoom) keeps
      // it independent of the editor's canvas scale, and it is idempotent for
      // programmatic fits, so a trailing settle moveend can't drift it.
      if (fittedRef.current.done) {
        const b = map.getBounds();
        updates.bbox = clampBbox([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
      }
      onViewportChangeRef.current(vp.id, updates);
    });

    map.on('click', (e) => {
      if (!dropPinModeRef.current) return;
      const { lat, lng } = e.lngLat;
      const newId = `poi-${Date.now()}`;
      addPoi({
        name: 'New Pin',
        category: 'Food',
        cityRegion: '',
        lat,
        lng,
        active: true,
        customNumber: 0,
        id: newId,
      });
      setDropPinMode(false);
      setEditingPoiId(newId);
    });

    const ro = new ResizeObserver(() => {
      const m = mapRef.current;
      if (!m) return;
      m.resize();
      const vp = viewportRef.current;
      if (vp?.bbox) fitToBbox(m, vp.bbox);
    });
    if (mapContainer.current) ro.observe(mapContainer.current);

    return () => {
      cancelled = true;
      ro.disconnect();
      cleanupStyleReady();
      if (fitTimerRef.current !== null) {
        window.clearTimeout(fitTimerRef.current);
        fitTimerRef.current = null;
      }
      map.remove();
      mapRef.current = null;
      fittedRef.current.done = false;
    };
    })(); // async IIFE – ensureGoogleFonts
  }, [viewport?.id, fitToBbox, ensureStyleReady, containerReady]);

  // Sync external center/zoom edits. When the viewport carries a `bbox`, that
  // is the authoritative framing (it drives the mini tiles and the export) and
  // the editor is fitted to it — reacting to stray center/zoom writes here (e.g.
  // from a tile fitting its own canvas) used to emit a non-programmatic moveend
  // that recomputed an ever-expanding bbox, zooming the viewport out on every
  // layout↔editor tab switch.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !viewport || viewport.bbox) return;
    const c = map.getCenter();
    const diff = Math.abs(c.lng - viewport.center[0]) + Math.abs(c.lat - viewport.center[1]);
    if (diff > 0.0001) map.setCenter(viewport.center);
    if (Math.abs(map.getZoom() - viewport.zoom) > 0.01) map.setZoom(viewport.zoom);
  }, [viewport?.center, viewport?.zoom, viewport?.bbox]);

  // Refit the editor when the print bbox changes elsewhere (e.g. the layout
  // frame's zoom buttons or another map). Suppressed inside fitToBbox so this
  // never rewrites the stored framing.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !viewport?.bbox) return;
    fitToBbox(map, viewport.bbox);
  }, [viewport?.bbox, fitToBbox]);

  // Markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !viewport) return;
    const vpPois = viewportActivePois(pois, viewport);
    if (map.isStyleLoaded()) {
      addPoiLayer(map, vpPois, colorMode, spotColor, viewport.spiderify !== false, viewport.poiMarkerScale ?? 1, viewport.layers?.showPoiMarkers ?? true);
    } else {
      map.once('style.load', () => addPoiLayer(map, vpPois, colorMode, spotColor, viewport.spiderify !== false, viewport.poiMarkerScale ?? 1, viewport.layers?.showPoiMarkers ?? true));
    }
  }, [pois, colorMode, spotColor, viewport?.id, viewport?.visiblePoiIds, viewport?.spiderify, viewport?.poiMarkerScale, viewport?.layers?.showPoiMarkers]);

  // Layer styling overrides
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      applyLayerStyleOverrides(map, viewport?.layers, EDITOR_LABEL_SCALE);
      applyEnhancedLayerStyle(map, { ...DEFAULT_LAYER_STYLE, ...viewport?.layers });
    };
    if (map.isStyleLoaded()) {
      apply();
    } else {
      map.once('style.load', apply);
    }
  }, [viewport?.layers, viewport?.id]);

  const fitToPOIs = useCallback(() => {
    if (!mapRef.current) return;
    const activePois = pois.filter((p) => p.active);
    if (activePois.length === 0) return;
    const bounds = new LngLatBounds();
    activePois.forEach((p) => bounds.extend([p.lng, p.lat]));
    mapRef.current.fitBounds(bounds, { padding: 50, maxZoom: 15 });
  }, [pois]);

  const toggleGrid = () => {
    if (!mapRef.current || !viewport) return;
    if (!viewport.showGrid) {
      const b = mapRef.current.getBounds();
      const bbox: [number, number, number, number] = clampBbox([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
      onViewportChange(viewport.id, { showGrid: true, bbox });
      mapRef.current.fitBounds(b, { padding: 0, duration: 0 });
    } else {
      onViewportChange(viewport.id, { showGrid: false });
    }
  };

  if (!viewport) {
    return (
      <div className="flex-1 flex items-center justify-center bg-zinc-100 dark:bg-zinc-800">
        <p className="text-zinc-500 dark:text-zinc-400">Select a viewport to edit</p>
      </div>
    );
  }

  const controlRow = (label: string, color: string, setColor: (c: string) => void, opacity: number, setOpacity: (n: number) => void, options = ['0.5', '0.8', '1']) => (
    <div className="flex items-center justify-between">
      <span className="text-xs text-zinc-500 dark:text-zinc-400">{label}</span>
      <div className="flex items-center gap-1.5">
        <ColorPicker color={color} onChange={setColor} />
        <Select value={String(opacity)} onValueChange={(v) => v && setOpacity(parseFloat(v))}>
          <SelectTrigger className="text-xs h-7 w-16 px-2">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o} value={o}>{o}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  return (
    <div className="flex-1 flex flex-col relative">
      <div ref={areaRef} className="relative flex-1 min-h-0 grid place-items-center">
        {boxSize && (
          <div className="relative" style={{ width: boxSize.w, height: boxSize.h }}>
            <div ref={mapContainer} className="h-full w-full" />
            {layer('showPoiLabels') && (
              <PoiLabelOverlay
                map={mapRef.current}
                pois={pois}
                style={{
                  bgColor: layer('poiLabelBgColor'),
                  textColor: layer('poiLabelTextColor'),
                  fontSize: layer('poiLabelFontSize'),
                  padding: layer('poiLabelPadding'),
                  borderRadius: layer('poiLabelBorderRadius'),
                  showShadow: layer('poiLabelShadow'),
                }}
              />
            )}
            {viewport.showGrid && viewport.bbox && (
              <GridOverlay
                viewport={viewport}
                bbox={viewport.bbox}
                insets={insetViewports(layout.viewports, viewport)
                  .map((v) => ({ bbox: v.bbox!, title: v.title }))}
              />
            )}
          </div>
        )}
      </div>

      <div className="absolute top-4 bottom-4 right-4 w-72 flex flex-col">
        <Card className="shadow-lg flex-1 flex flex-col min-h-0">
          <CardContent className="p-3 flex flex-col gap-2.5 min-h-0 overflow-y-auto">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">{viewport.title}</Label>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                  const map = mapRef.current;
                  if (!map) return;
                  const result = nearestCartographicZoom(viewport.zoom, viewport.center[1], 1);
                  if (result) {
                    const newBbox = viewportBounds({ center: viewport.center, zoom: result.zoom, positionOnPage: viewport.positionOnPage, showTitle: viewport.showTitle });
                    onViewportChange(viewport.id, { zoom: result.zoom, bbox: newBbox });
                  } else {
                    map.zoomIn();
                  }
                }} title="Zoom to nearest cartographic scale">
                  <ZoomIn className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                  const map = mapRef.current;
                  if (!map) return;
                  const result = nearestCartographicZoom(viewport.zoom, viewport.center[1], -1);
                  if (result) {
                    const newBbox = viewportBounds({ center: viewport.center, zoom: result.zoom, positionOnPage: viewport.positionOnPage, showTitle: viewport.showTitle });
                    onViewportChange(viewport.id, { zoom: result.zoom, bbox: newBbox });
                  } else {
                    map.zoomOut();
                  }
                }} title="Zoom to nearest cartographic scale">
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={fitToPOIs} title="Fit to POIs">
                  <Target className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-zinc-500">Theme</Label>
                <Select value={activeThemeId ?? ''} onValueChange={(v) => { if (v) applyTheme(v); }}>
                  <SelectTrigger className="text-xs h-7">
                    <SelectValue placeholder="Custom" />
                  </SelectTrigger>
                  <SelectContent>
                    {themes.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-zinc-500">Grid</Label>
                <Button variant="outline" size="sm" className="h-7 text-xs justify-start gap-1.5" onClick={toggleGrid}>
                  <Grid className="h-3.5 w-3.5" />
                  {viewport.showGrid ? 'On' : 'Off'}
                </Button>
              </div>
            </div>

            <div className="flex gap-2 text-xs">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs flex-1"
                onClick={() => {
                  const name = prompt('Theme name:');
                  if (name?.trim()) saveTheme(name.trim());
                }}
              >
                Save as Theme
              </Button>
            </div>

            <Button
              variant={dropPinMode ? 'default' : 'outline'}
              size="sm"
              className="w-full h-7 text-xs justify-start gap-1.5"
              onClick={() => setDropPinMode(!dropPinMode)}
            >
              <MapPin className="h-3.5 w-3.5" />
              {dropPinMode ? 'Drop Pin (Click Map)' : 'Drop Pin'}
            </Button>

            {viewport.showGrid && (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex flex-col gap-1">
                  <Label className="text-xs text-zinc-500">Grid Width</Label>
                  <Select
                    value={String(viewport.gridLineWidth ?? 0.15)}
                    onValueChange={(v) => v && onViewportChange(viewport.id, { gridLineWidth: parseFloat(v) })}
                  >
                    <SelectTrigger className="text-xs h-7">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0.1">Thin</SelectItem>
                      <SelectItem value="0.15">Normal</SelectItem>
                      <SelectItem value="0.3">Thick</SelectItem>
                      <SelectItem value="0.5">Heavy</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs text-zinc-500">Grid Opacity</Label>
                  <Select
                    value={String(viewport.gridOpacity ?? 0.5)}
                    onValueChange={(v) => v && onViewportChange(viewport.id, { gridOpacity: parseFloat(v) })}
                  >
                    <SelectTrigger className="text-xs h-7">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0.2">Light</SelectItem>
                      <SelectItem value="0.5">Normal</SelectItem>
                      <SelectItem value="0.8">Dark</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <Separator />

            {/* Base map */}
            <div className="flex flex-col gap-3">
              <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Base map</div>
              <div className="flex flex-col gap-2.5">
                {/* Roads */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-1.5 cursor-pointer">
                      <Switch checked={layer('showRoads')} onCheckedChange={(c) => updateLayers({ showRoads: c })} />
                      <Road className="h-3.5 w-3.5" /> Roads
                    </Label>
                  </div>
                  {layer('showRoads') && (
                    <div className="flex flex-col gap-1.5 pl-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">Color</span>
                        <ColorPicker color={layer('roadColor')} onChange={(c) => updateLayers({ roadColor: c })} />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">Width</span>
                        <Select value={String(layer('roadWidth'))} onValueChange={(v) => v && updateLayers({ roadWidth: parseFloat(v) })}>
                          <SelectTrigger className="text-xs h-7 w-20 px-2">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="0.5">Thin</SelectItem>
                            <SelectItem value="1">Normal</SelectItem>
                            <SelectItem value="1.5">Thick</SelectItem>
                            <SelectItem value="2">Heavy</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">Opacity</span>
                        <Select value={String(layer('roadOpacity'))} onValueChange={(v) => v && updateLayers({ roadOpacity: parseFloat(v) })}>
                          <SelectTrigger className="text-xs h-7 w-16 px-2">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="0.5">0.5</SelectItem>
                            <SelectItem value="0.7">0.7</SelectItem>
                            <SelectItem value="1">1</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </div>

                {/* Buildings */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-1.5 cursor-pointer">
                      <Switch checked={layer('showBuildings')} onCheckedChange={(c) => updateLayers({ showBuildings: c })} />
                      <Building className="h-3.5 w-3.5" /> Buildings
                    </Label>
                  </div>
                  {layer('showBuildings') && (
                    <div className="flex flex-col gap-1.5 pl-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">Color</span>
                        <div className="flex items-center gap-1.5">
                          <ColorPicker color={layer('buildingColor')} onChange={(c) => updateLayers({ buildingColor: c })} />
                          <ColorPicker color={layer('buildingOutlineColor')} onChange={(c) => updateLayers({ buildingOutlineColor: c })} />
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">Opacity</span>
                        <Select value={String(layer('buildingOpacity'))} onValueChange={(v) => v && updateLayers({ buildingOpacity: parseFloat(v) })}>
                          <SelectTrigger className="text-xs h-7 w-16 px-2">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="0.3">0.3</SelectItem>
                            <SelectItem value="0.6">0.6</SelectItem>
                            <SelectItem value="1">1</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </div>

                {/* Water */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-1.5 cursor-pointer">
                      <Switch checked={layer('showWater')} onCheckedChange={(c) => updateLayers({ showWater: c })} />
                      <Waves className="h-3.5 w-3.5" /> Water
                    </Label>
                  </div>
                  {layer('showWater') && (
                    <div className="flex flex-col gap-1.5 pl-1">
                      {controlRow('Color', layer('waterColor'), (c) => updateLayers({ waterColor: c }), layer('waterOpacity'), (n) => updateLayers({ waterOpacity: n }))}
                    </div>
                  )}
                </div>

                {/* Parks */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-1.5 cursor-pointer">
                      <Switch checked={layer('showParks')} onCheckedChange={(c) => updateLayers({ showParks: c })} />
                      <TreePine className="h-3.5 w-3.5" /> Parks
                    </Label>
                  </div>
                  {layer('showParks') && (
                    <div className="flex flex-col gap-1.5 pl-1">
                      {controlRow('Color', layer('parkColor'), (c) => updateLayers({ parkColor: c }), layer('parkOpacity'), (n) => updateLayers({ parkOpacity: n }))}
                    </div>
                  )}
                </div>

                {/* Land */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Land</span>
                    <ColorPicker color={layer('landColor')} onChange={(c) => updateLayers({ landColor: c })} />
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            {/* Overlays */}
            <div className="flex flex-col gap-3">
              <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Overlays</div>
              <div className="flex flex-col gap-2.5">
                {/* Terrain */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-1.5 cursor-pointer">
                      <Switch checked={layer('showTerrain')} onCheckedChange={(c) => updateLayers({ showTerrain: c })} />
                      <Mountain className="h-3.5 w-3.5" /> Terrain
                    </Label>
                  </div>
                  {layer('showTerrain') && (
                    <div className="flex flex-col gap-1.5 pl-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">Opacity</span>
                        <Select value={String(layer('terrainOpacity'))} onValueChange={(v) => v && updateLayers({ terrainOpacity: parseFloat(v) })}>
                          <SelectTrigger className="text-xs h-7 w-16 px-2">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="0.2">0.2</SelectItem>
                            <SelectItem value="0.5">0.5</SelectItem>
                            <SelectItem value="0.8">0.8</SelectItem>
                            <SelectItem value="1">1</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </div>

                {/* Contours */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-1.5 cursor-pointer">
                      <Switch checked={layer('showContourLines')} onCheckedChange={(c) => updateLayers({ showContourLines: c })} />
                      <Mountain className="h-3.5 w-3.5" /> Contours
                    </Label>
                  </div>
                  {layer('showContourLines') && (
                    <div className="flex flex-col gap-1.5 pl-1">
                      {controlRow('Contour color', layer('contourLineColor'), (c) => updateLayers({ contourLineColor: c }), 0.6, () => {}, ['0.3', '0.6', '1'])}
                      {controlRow('Index color', layer('contourIndexColor'), (c) => updateLayers({ contourIndexColor: c }), 0.9, () => {}, ['0.3', '0.6', '1'])}
                    </div>
                  )}
                </div>

                {/* Satellite */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-1.5 cursor-pointer">
                      <Switch checked={layer('showSatellite')} onCheckedChange={(c) => updateLayers({ showSatellite: c })} />
                      <Satellite className="h-3.5 w-3.5" /> Satellite
                    </Label>
                  </div>
                  {layer('showSatellite') && (
                    <div className="flex flex-col gap-1.5 pl-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">Opacity</span>
                        <Select value={String(layer('satelliteOpacity'))} onValueChange={(v) => v && updateLayers({ satelliteOpacity: parseFloat(v) })}>
                          <SelectTrigger className="text-xs h-7 w-16 px-2">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="0.2">0.2</SelectItem>
                            <SelectItem value="0.5">0.5</SelectItem>
                            <SelectItem value="0.8">0.8</SelectItem>
                            <SelectItem value="1">1</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </div>

                {/* Trails */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-1.5 cursor-pointer">
                      <Switch checked={layer('showTrails')} onCheckedChange={(c) => updateLayers({ showTrails: c })} />
                      <Footprints className="h-3.5 w-3.5" /> Trails
                    </Label>
                  </div>
                  {layer('showTrails') && (
                    <div className="flex flex-col gap-1.5 pl-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">Color</span>
                        <ColorPicker color={layer('trailColor')} onChange={(c) => updateLayers({ trailColor: c })} />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">Width</span>
                        <Select value={String(layer('trailWidth'))} onValueChange={(v) => v && updateLayers({ trailWidth: parseFloat(v) })}>
                          <SelectTrigger className="text-xs h-7 w-20 px-2">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="0.5">Thin</SelectItem>
                            <SelectItem value="1.5">Normal</SelectItem>
                            <SelectItem value="3">Thick</SelectItem>
                            <SelectItem value="5">Heavy</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </div>

                {/* Admin borders */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-1.5 cursor-pointer">
                      <Switch checked={layer('showAdminBoundaries')} onCheckedChange={(c) => updateLayers({ showAdminBoundaries: c })} />
                      <Landmark className="h-3.5 w-3.5" /> Administrative borders
                    </Label>
                  </div>
                  {layer('showAdminBoundaries') && (
                    <div className="flex flex-col gap-1.5 pl-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">Color</span>
                        <ColorPicker color={layer('adminBoundaryColor')} onChange={(c) => updateLayers({ adminBoundaryColor: c })} />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">Width</span>
                        <Select value={String(layer('adminBoundaryWidth'))} onValueChange={(v) => v && updateLayers({ adminBoundaryWidth: parseFloat(v) })}>
                          <SelectTrigger className="text-xs h-7 w-20 px-2">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="0.2">Thin</SelectItem>
                            <SelectItem value="0.4">Normal</SelectItem>
                            <SelectItem value="0.8">Thick</SelectItem>
                            <SelectItem value="1.2">Heavy</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <Separator />

            {/* Labels */}
            <div className="flex flex-col gap-3">
              <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Labels</div>
              <div className="flex flex-col gap-2.5">
                {/* Place names */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-1.5 cursor-pointer">
                      <Switch checked={placeNames.show} onCheckedChange={(c) => updatePlaceNames({ show: c })} />
                      <MapPin className="h-3.5 w-3.5" /> Place names
                    </Label>
                  </div>
                  {placeNames.show && (
                    <div className="flex flex-col gap-1.5 pl-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium">Language</span>
                        <Select
                          value={placeNames.lang}
                          onValueChange={(v) => v && updatePlaceNames({ lang: v as PlaceNameLang })}
                        >
                          <SelectTrigger className="text-xs h-7 w-28 px-2">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="local">Local names</SelectItem>
                            <SelectItem value="english">English names</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {PLACE_TIER_ROWS.map(({ key, icon, label, allowItalic, allowUppercase }) => (
                        <PlaceTierRow
                          key={key}
                          icon={icon}
                          label={label}
                          allowItalic={allowItalic}
                          allowUppercase={allowUppercase}
                          style={placeNames[key]}
                          onChange={(c) => updateTier(key, c)}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* Transit */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-1.5 cursor-pointer">
                      <Switch checked={layer('showTransitStops')} onCheckedChange={(c) => updateLayers({ showTransitStops: c })} />
                      <Train className="h-3.5 w-3.5" /> Transit
                    </Label>
                  </div>
                  {layer('showTransitStops') && (
                    <div className="flex flex-col gap-1.5 pl-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">Color</span>
                        <ColorPicker color={layer('transitStopColor')} onChange={(c) => updateLayers({ transitStopColor: c })} />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">Size</span>
                        <Select value={String(layer('transitStopSize'))} onValueChange={(v) => v && updateLayers({ transitStopSize: parseFloat(v) })}>
                          <SelectTrigger className="text-xs h-7 w-20 px-2">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="2">Small</SelectItem>
                            <SelectItem value="3">Normal</SelectItem>
                            <SelectItem value="5">Large</SelectItem>
                            <SelectItem value="8">Extra large</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </div>

                {/* POI labels */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-1.5 cursor-pointer">
                      <Switch checked={layer('showPoiLabels')} onCheckedChange={(c) => updateLayers({ showPoiLabels: c })} />
                      <Flag className="h-3.5 w-3.5" /> POI labels
                    </Label>
                  </div>
                  {layer('showPoiLabels') && (
                    <div className="flex flex-col gap-1.5 pl-1">
                      {controlRow('Background', layer('poiLabelBgColor'), (c) => updateLayers({ poiLabelBgColor: c }), 1, () => {}, ['1'])}
                      {controlRow('Text', layer('poiLabelTextColor'), (c) => updateLayers({ poiLabelTextColor: c }), 1, () => {}, ['1'])}
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">Font size</span>
                        <Input
                          type="number"
                          value={String(layer('poiLabelFontSize'))}
                          onChange={(e) => updateLayers({ poiLabelFontSize: parseFloat(e.target.value) || 0 })}
                          onBlur={(e) => updateLayers({ poiLabelFontSize: parseFloat(e.target.value) || 0 })}
                          min={1}
                          max={20}
                          step={0.5}
                          className="text-xs h-7 w-20 px-2"
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">Padding</span>
                        <Input
                          type="number"
                          value={String(layer('poiLabelPadding'))}
                          onChange={(e) => updateLayers({ poiLabelPadding: parseFloat(e.target.value) || 0 })}
                          onBlur={(e) => updateLayers({ poiLabelPadding: parseFloat(e.target.value) || 0 })}
                          min={0}
                          max={10}
                          step={0.5}
                          className="text-xs h-7 w-20 px-2"
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">Radius</span>
                        <Input
                          type="number"
                          value={String(layer('poiLabelBorderRadius'))}
                          onChange={(e) => updateLayers({ poiLabelBorderRadius: parseFloat(e.target.value) || 0 })}
                          onBlur={(e) => updateLayers({ poiLabelBorderRadius: parseFloat(e.target.value) || 0 })}
                          min={0}
                          max={10}
                          step={0.5}
                          className="text-xs h-7 w-20 px-2"
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">Shadow</span>
                        <Switch checked={layer('poiLabelShadow')} onCheckedChange={(c) => updateLayers({ poiLabelShadow: c })} />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">Show markers</span>
                        <Switch checked={layer('showPoiMarkers')} onCheckedChange={(c) => updateLayers({ showPoiMarkers: c })} />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
