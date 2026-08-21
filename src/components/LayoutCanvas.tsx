'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { GridLayout, LayoutItem } from 'react-grid-layout';
import { noOverlapCompactor, createScaledStrategy } from 'react-grid-layout/core';
import { MapViewport, PrintLayout, PrintPage, IndexListConfig, TitleBlockConfig } from '@/types';
import { PrintMapFrame } from './PrintMapFrame';
import { IndexListFrameWrapper } from './IndexListFrameWrapper';
import { TitleBlockFrame } from './TitleBlockFrame';
import { ColorPicker } from './ColorPicker';
import { Plus, List, Type, ZoomIn, ZoomOut, RotateCcw, Settings, FilePlus2, Trash2, Pencil, ChevronDown, ChevronRight, PanelRight, LayoutTemplate, FoldHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CSS_PX_PER_MM } from '@/lib/units';
import { TITLE_FONTS } from '@/lib/titleFonts';
import { cn } from '@/lib/utils';
import { useMap } from '@/context/MapContext';
import { resolveIndexConfig, scopePois } from '@/lib/indexStyle';
import { viewportBounds } from '@/lib/mapStyle';
import { GRID_SPACING_OPTIONS } from '@/lib/grid';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

type GridItemType = 'viewport' | 'indexList' | 'titleBlock';

interface GridItem extends LayoutItem {
  type: GridItemType;
}

const INDEX_PREFIX = 'index:';
const TB_PREFIX = 'titleBlock:';
const indexItemId = (id: string) => `${INDEX_PREFIX}${id}`;
const tbItemId = (id: string) => `${TB_PREFIX}${id}`;
const indexIdFromItem = (i: string) => (i.startsWith(INDEX_PREFIX) ? i.slice(INDEX_PREFIX.length) : null);
const tbIdFromItem = (i: string) => (i.startsWith(TB_PREFIX) ? i.slice(TB_PREFIX.length) : null);

const PAGE_SIZES_MM = {
  A4: { portrait: { w: 210, h: 297 }, landscape: { w: 297, h: 210 } },
  A3: { portrait: { w: 297, h: 420 }, landscape: { w: 420, h: 297 } },
  A2: { portrait: { w: 420, h: 594 }, landscape: { w: 594, h: 420 } },
} as const;

// RGL grid density: 16×16 cells per page keeps every 16th cell aligned with a
// 1/16 fold line, so fold-snapping is `snapToGrid(16, 16)`; the fine cells also
// give near-free placement when snapping is off (~1.1mm on A4 landscape).
const GRID_FINE = 256;
const FOLD_STEP = GRID_FINE / 16;
const MIN_PAPER_ZOOM = 0.25;
const MAX_PAPER_ZOOM = 4;
const MIN_CUSTOM_MM = 50;

/**
 * Tolerance-based guide snapping. `guides` is a sorted list of cell positions
 * (page edges, margin lines, fold lines). When an edge of the dragged/resized
 * item comes within `tol` cells of a guide it is snapped onto it; otherwise the
 * item rests freely. Both the leading and the trailing edge are considered.
 */
function snapCoordToGuides(value: number, guides: readonly number[], tol: number): number {
  let best = -Infinity;
  let bestDist = Infinity;
  for (const g of guides) {
    const d = Math.abs(g - value);
    if (d < bestDist) {
      bestDist = d;
      best = g;
    }
  }
  return bestDist <= tol ? best : value;
}

/** Snaps an edge (moving in direction `sign` of a resize handle) to the guides. */
function makeGuideSnapConstraint(guidesX: readonly number[], guidesY: readonly number[], tolX: number, tolY: number) {
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  return {
    name: 'guideSnap',
    constrainPosition: (item: LayoutItem, x: number, y: number) => {
      const xs = [snapCoordToGuides(x, guidesX, tolX), snapCoordToGuides(x + item.w, guidesX, tolX)];
      const ys = [snapCoordToGuides(y, guidesY, tolY), snapCoordToGuides(y + item.h, guidesY, tolY)];
      // Prefer snapping the edge that is closest to a guide.
      const pick = (lead: number, trail: number, edges: [number, number]) => {
        const [ls, ts] = edges;
        if (ls !== lead && ts !== trail) {
          return Math.abs(ls - lead) <= Math.abs(ts - trail) ? ls : ts - trail + lead;
        }
        if (ls !== lead) return ls;
        if (ts !== trail) return ts - trail + lead;
        return lead;
      };
      return {
        x: pick(x, x + item.w, [xs[0], xs[1]]),
        y: pick(y, y + item.h, [ys[0], ys[1]]),
      };
    },
    constrainSize: (item: LayoutItem, w: number, h: number, handle: string) => {
      let nw = w;
      let nh = h;
      if (handle.includes('e')) {
        nw = snapCoordToGuides(item.x + w, guidesX, tolX) - item.x;
      } else if (handle.includes('w')) {
        nw = item.x + item.w - snapCoordToGuides(item.x + item.w - w, guidesX, tolX);
      }
      if (handle.includes('s')) {
        nh = snapCoordToGuides(item.y + h, guidesY, tolY) - item.y;
      } else if (handle.includes('n')) {
        nh = item.y + item.h - snapCoordToGuides(item.y + item.h - h, guidesY, tolY);
      }
      const minW = item.minW ?? 1;
      const minH = item.minH ?? 1;
      return {
        w: clamp(nw, minW, Math.max(minW, GRID_FINE - item.x)),
        h: clamp(nh, minH, Math.max(minH, GRID_FINE - item.y)),
      };
    },
  } as const;
}

/** Rotated footprint (w,h) of a content box of w×h. */
function footprintDims(rotation: number | undefined, contentW: number, contentH: number): { w: number; h: number } {
  return rotation === 90 || rotation === 270 ? { w: contentH, h: contentW } : { w: contentW, h: contentH };
}
/** Unrotated content dims for a given footprint box of w×h. */
function contentDims(rotation: number | undefined, boxW: number, boxH: number): { w: number; h: number } {
  return rotation === 90 || rotation === 270 ? { w: boxH, h: boxW } : { w: boxW, h: boxH };
}

function pageSizeMmFor(page: PrintLayout): { w: number; h: number } {
  if (page.pageSize === 'Custom') {
    return {
      w: Math.max(MIN_CUSTOM_MM, page.customPageSize?.width ?? 210),
      h: Math.max(MIN_CUSTOM_MM, page.customPageSize?.height ?? 297),
    };
  }
  return PAGE_SIZES_MM[page.pageSize][page.orientation];
}

function getMargins(layout: PrintLayout) {
  return {
    top: layout.pageMargins?.top ?? 10,
    right: layout.pageMargins?.right ?? 10,
    bottom: layout.pageMargins?.bottom ?? 10,
    left: layout.pageMargins?.left ?? 10,
  };
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function defaultIndexConfig(page: PrintLayout, n: number): IndexListConfig {
  const ps = pageSizeMmFor(page);
  const margins = getMargins(page);
  return {
    id: `index-${Date.now()}-${n}`,
    position: {
      x: margins.left,
      y: ps.h - margins.bottom - 45,
      width: ps.w - margins.left - margins.right,
      height: 45,
    },
    scope: 'all',
    sortBy: 'number',
    sortDirection: 'asc',
    groupBy: 'category',
    columns: page.indexColumns || 2,
  };
}

function defaultTitleBlockConfig(page: PrintLayout, n: number): TitleBlockConfig {
  const margins = getMargins(page);
  const ps = pageSizeMmFor(page);
  return {
    id: `tb-${Date.now()}-${n}`,
    position: { x: margins.left, y: Math.max(margins.top, ps.h - margins.bottom - 24), width: 120, height: 24 },
    title: page.name || `Page ${n}`,
    subtitle: 'Japan Trip',
    align: 'left',
    fontFamily: page.titleFontFamily ?? 'Helvetica',
    fontSize: page.titleFontSize ?? 5,
    fontWeight: 'bold',
    textColor: '#1a1a1a',
    borderWidth: 0,
  };
}

const clampZoom = (v: number) => Math.min(MAX_PAPER_ZOOM, Math.max(MIN_PAPER_ZOOM, v));

interface LayoutCanvasProps {
  layout: PrintLayout;
  pages: PrintPage[];
  activePageId: string;
  activeViewportId: string | null;
  onViewportSelect: (id: string | null) => void;
  onSetActivePageId: (id: string) => void;
  onAddPage: () => void;
  onRemovePage: (id: string) => void;
  onRenamePage: (id: string, name: string) => void;
  onPageLayoutUpdate: (pageId: string, updates: Partial<PrintLayout>) => void;
  onPageViewportUpdate: (pageId: string, viewportId: string, updates: Partial<MapViewport>) => void;
  onPageViewportAdd: (pageId: string, viewport: MapViewport) => void;
  onPageViewportRemove: (pageId: string, viewportId: string) => void;
  onPageIndexAdd: (pageId: string, config: IndexListConfig) => void;
  onPageIndexUpdate: (pageId: string, indexId: string, updates: Partial<IndexListConfig>) => void;
  onPageIndexRemove: (pageId: string, indexId: string) => void;
  onPageTitleBlockAdd: (pageId: string, config: TitleBlockConfig) => void;
  onPageTitleBlockUpdate: (pageId: string, blockId: string, updates: Partial<TitleBlockConfig>) => void;
  onPageTitleBlockRemove: (pageId: string, blockId: string) => void;
  onOpenEditor?: (viewportId: string) => void;
}

export function LayoutCanvas({
  layout,
  pages,
  activePageId,
  activeViewportId,
  onViewportSelect,
  onSetActivePageId,
  onAddPage,
  onRemovePage,
  onRenamePage,
  onPageLayoutUpdate,
  onPageViewportUpdate,
  onPageViewportAdd,
  onPageViewportRemove,
  onPageIndexAdd,
  onPageIndexUpdate,
  onPageIndexRemove,
  onPageTitleBlockAdd,
  onPageTitleBlockUpdate,
  onPageTitleBlockRemove,
  onOpenEditor,
}: LayoutCanvasProps) {
  const [paperZoom, setPaperZoom] = useState(1);
  const [showPageSettings, setShowPageSettings] = useState(true);
  const [showInspector, setShowInspector] = useState(true);
  const [showFoldLines, setShowFoldLines] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [spacePressed, setSpacePressed] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const paperZoomRef = useRef(1);
  const zoomToRef = useRef<{ left: number; top: number } | null>(null);
  const panRef = useRef<{ x: number; y: number; sl: number; st: number; el: HTMLDivElement | null } | null>(null);
  const spaceRef = useRef(false);

  const activePage = layout;
  const pageSize = pageSizeMmFor(activePage);
  const sizeLabel =
    activePage.pageSize === 'Custom'
      ? `Custom — ${pageSize.w}×${pageSize.h}mm`
      : `${activePage.pageSize} ${activePage.orientation} — ${pageSize.w}×${pageSize.h}mm`;

  const setZoom = useCallback((v: number) => {
    const next = clampZoom(v);
    paperZoomRef.current = next;
    setPaperZoom(next);
  }, []);

  useEffect(() => {
    spaceRef.current = spacePressed;
  }, [spacePressed]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const next = clampZoom(paperZoomRef.current * factor);
      const cx = (el.scrollLeft + x) / paperZoomRef.current;
      const cy = (el.scrollTop + y) / paperZoomRef.current;
      zoomToRef.current = { left: cx * next - x, top: cy * next - y };
      paperZoomRef.current = next;
      setPaperZoom(next);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Native pointer listeners — React's synthetic pointer handlers don't
  // reliably follow setPointerCapture, so panning is handled natively.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onPointerDown = (e: PointerEvent) => {
      const middle = e.button === 1;
      if (e.button !== 0 && e.button !== 1) return;
      const target = e.target as HTMLElement;
      if (!middle && !spaceRef.current && target.closest?.('.react-grid-item')) return;
      if (target.closest?.('button, input, select, [role="button"]')) return;
      panRef.current = { x: e.clientX, y: e.clientY, sl: el.scrollLeft, st: el.scrollTop, el };
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      setIsPanning(true);
    };
    const onPointerMove = (e: PointerEvent) => {
      const p = panRef.current;
      if (!p || !p.el) return;
      p.el.scrollLeft = p.sl - (e.clientX - p.x);
      p.el.scrollTop = p.st - (e.clientY - p.y);
    };
    const onPointerUp = () => {
      panRef.current = null;
      setIsPanning(false);
    };
    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerUp);
    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointercancel', onPointerUp);
    };
  }, []);

  // Spacebar + drag pans anywhere (over tiles too); middle-drag pans anywhere.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      e.preventDefault();
      if (!spaceRef.current) setSpacePressed(true);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && spaceRef.current) setSpacePressed(false);
    };
    const onBlur = () => setSpacePressed(false);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    const z = zoomToRef.current;
    if (el && z) {
      el.scrollLeft = z.left;
      el.scrollTop = z.top;
      zoomToRef.current = null;
    }
  }, [paperZoom]);

  // Escape clears the current selection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onViewportSelect(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onViewportSelect]);

  const pageId = activePage.id ?? activePageId;

  const addMapFrame = () => {
    const margins = getMargins(activePage);
    const newViewport: MapViewport = {
      id: `vp-${Date.now()}`,
      title: `Map ${activePage.viewports.length + 1}`,
      center: [139.7967, 35.7148],
      zoom: 12,
      positionOnPage: { x: margins.left, y: margins.top, width: 120, height: 100 },
      showGrid: true,
      showTitle: true,
      titleBackground: true,
      backgroundColor: '#ffffff',
    };
    onPageViewportAdd(pageId, newViewport);
    onViewportSelect(newViewport.id);
  };

  const addIndexList = () => {
    const config = defaultIndexConfig(activePage, activePage.indexLists.length + 1);
    if (activeViewportId && !indexIdFromItem(activeViewportId) && !tbIdFromItem(activeViewportId)) {
      const sel = pages.flatMap((p) => p.viewports).find((v) => v.id === activeViewportId);
      if (sel) config.scope = [sel.id];
    }
    onPageIndexAdd(pageId, config);
    onViewportSelect(indexItemId(config.id));
  };

  const addTitleBlock = () => {
    const config = defaultTitleBlockConfig(activePage, activePage.titleBlocks.length + 1);
    onPageTitleBlockAdd(pageId, config);
    onViewportSelect(tbItemId(config.id));
  };

  const clearOnEmptyClick = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest('.react-grid-item') || t.closest('button, input, select, textarea, [role="button"]')) return;
    onViewportSelect(null);
  };

  const indexId = activeViewportId ? indexIdFromItem(activeViewportId) : null;
  const tbId = activeViewportId ? tbIdFromItem(activeViewportId) : null;
  const selectedVp =
    activeViewportId && !indexId && !tbId
      ? pages.flatMap((p) => p.viewports).find((v) => v.id === activeViewportId)
      : undefined;
  const selectedIndex = indexId ? activePage.indexLists.find((c) => c.id === indexId) : undefined;
  const selectedTitleBlock = tbId ? activePage.titleBlocks.find((c) => c.id === tbId) : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-zinc-100 dark:bg-zinc-800">
      {/* Top toolbar */}
      <div className="flex items-center justify-between gap-3 border-b border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center gap-3 min-w-0">
          <h3 className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{sizeLabel}</h3>
          <Separator orientation="vertical" className="h-6" />
          <Button variant="outline" size="sm" onClick={addMapFrame}>
            <Plus className="h-4 w-4 mr-1" />
            Add Map Frame
          </Button>
          <Button variant="outline" size="sm" onClick={addIndexList}>
            <List className="h-4 w-4 mr-1" />
            Add Index List
          </Button>
          <Button variant="outline" size="sm" onClick={addTitleBlock}>
            <Type className="h-4 w-4 mr-1" />
            Add Title Block
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-800">
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setZoom(paperZoom - 0.25)} title="Zoom Out">
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="w-10 text-center font-mono text-xs text-zinc-600 dark:text-zinc-400">{Math.round(paperZoom * 100)}%</span>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setZoom(paperZoom + 0.25)} title="Zoom In">
              <ZoomIn className="h-4 w-4" />
            </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setZoom(1)} title="Reset Zoom">
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowFoldLines((v) => !v)}
          title="Show dashed fold lines (half, quarter, eighth, sixteenth)"
          className={showFoldLines ? 'bg-blue-100 dark:bg-blue-900/30' : ''}
        >
          <FoldHorizontal className="h-4 w-4 mr-1" />
          Fold Lines
        </Button>
          <span className="hidden xl:inline text-[10px] leading-tight text-zinc-400 dark:text-zinc-500 max-w-52">
            Drag empty space to pan · ⌘/Ctrl+scroll to zoom · Space+drag pans anywhere
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setShowInspector(true);
              setShowPageSettings((v) => !v);
            }}
            className={showPageSettings ? 'bg-blue-100 dark:bg-blue-900/30' : ''}
          >
            <Settings className="h-4 w-4 mr-1" />
            Layout
          </Button>
        </div>
      </div>

      {/* Page strip */}
      <PageStrip
        pages={pages}
        activePageId={activePageId}
        onSetActivePageId={onSetActivePageId}
        onAddPage={onAddPage}
        onRemovePage={onRemovePage}
        onRenamePage={onRenamePage}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Pages canvas */}
        <div
          ref={scrollRef}
          onClick={clearOnEmptyClick}
          className={`flex-1 flex items-start gap-12 overflow-auto p-6 select-none ${isPanning ? 'cursor-grabbing' : spacePressed ? 'cursor-grab' : 'cursor-default'}`}
          style={{ background: '#4b5563', touchAction: 'pan-x pan-y' }}
        >
          {pages.map((page) => (
            <PageCanvas
              key={page.id}
              page={page}
              isActive={activePageId === page.id}
              showFoldLines={showFoldLines}
              zoom={paperZoom}
              activeViewportId={activeViewportId}
              onSelectPage={onSetActivePageId}
              onViewportSelect={onViewportSelect}
              onOpenEditor={onOpenEditor}
              onPageViewportUpdate={onPageViewportUpdate}
              onPageViewportRemove={onPageViewportRemove}
              onPageIndexUpdate={onPageIndexUpdate}
              onPageIndexRemove={onPageIndexRemove}
              onPageTitleBlockUpdate={onPageTitleBlockUpdate}
              onPageTitleBlockRemove={onPageTitleBlockRemove}
            />
          ))}
          {pages.length === 0 && (
            <div className="mt-24 flex flex-col items-center gap-3 text-zinc-300">
              <p className="text-sm">No pages yet</p>
              <Button variant="outline" size="sm" onClick={onAddPage}>
                <FilePlus2 className="h-4 w-4 mr-1" /> Add Page
              </Button>
            </div>
          )}
        </div>

        {/* Inspector */}
        {showInspector && (
          <aside className="
            flex min-h-0 w-80 shrink-0 flex-col border-l border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950
            fixed md:relative bottom-0 left-0 right-0 md:bottom-auto md:left-auto md:right-auto
            h-[50vh] md:h-auto max-h-[50vh] md:max-h-none
            border-t md:border-t-0 border-l-0 md:border-l z-30 md:z-auto
          ">
            <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                <PanelRight className="h-3.5 w-3.5" />
                Inspector
              </span>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowInspector(false)} title="Hide inspector">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <ScrollArea className="min-h-0 flex-1">
              <div className="space-y-3 p-3">
                {showPageSettings && (
                  <Section title="Page">
                    <PageSettings page={activePage} onUpdate={(u) => onPageLayoutUpdate(pageId, u)} />
                  </Section>
                )}

                {selectedIndex ? (
                  <Section title="Index List">
                    <IndexListProperties
                      page={activePage}
                      config={selectedIndex}
                      onUpdate={(updates) => onPageIndexUpdate(pageId, selectedIndex.id, updates)}
                    />
                    <Button variant="destructive" size="sm" className="h-8 w-full text-xs"
                      onClick={() => {
                        onPageIndexRemove(pageId, selectedIndex.id);
                        if (activeViewportId === indexItemId(selectedIndex.id)) onViewportSelect(null);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete Index List
                    </Button>
                  </Section>
                ) : selectedTitleBlock ? (
                  <Section title="Title Block">
                    <TitleBlockProperties
                      page={activePage}
                      config={selectedTitleBlock}
                      onUpdate={(updates) => onPageTitleBlockUpdate(pageId, selectedTitleBlock.id, updates)}
                    />
                    <Button variant="destructive" size="sm" className="h-8 w-full text-xs"
                      onClick={() => {
                        onPageTitleBlockRemove(pageId, selectedTitleBlock.id);
                        if (activeViewportId === tbItemId(selectedTitleBlock.id)) onViewportSelect(null);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete Title Block
                    </Button>
                  </Section>
                ) : selectedVp ? (
                  <Section title={selectedVp.title}>
                    <ViewportProperties
                      viewport={selectedVp}
                      page={pages.find((p) => p.viewports.some((v) => v.id === selectedVp.id)) ?? activePage}
                      onUpdate={(id, updates) => {
                        const owner = pages.find((p) => p.viewports.some((v) => v.id === id));
                        if (owner) onPageViewportUpdate(owner.id, id, updates);
                      }}
                    />
                  </Section>
                ) : (
                  <div className="rounded-xl border border-dashed border-zinc-300 p-4 text-center text-xs text-zinc-400 dark:border-zinc-700 dark:text-zinc-500">
                    Select a map frame, index list, or title block to edit its properties.
                  </div>
                )}
              </div>
            </ScrollArea>
          </aside>
        )}
      </div>
    </div>
  );
}

/* ------------------------------ PageCanvas ------------------------------ */

function PageCanvas({
  page,
  isActive,
  zoom,
  showFoldLines,
  activeViewportId,
  onSelectPage,
  onViewportSelect,
  onOpenEditor,
  onPageViewportUpdate,
  onPageViewportRemove,
  onPageIndexUpdate,
  onPageIndexRemove,
  onPageTitleBlockUpdate,
  onPageTitleBlockRemove,
}: {
  page: PrintPage;
  isActive: boolean;
  zoom: number;
  showFoldLines: boolean;
  activeViewportId: string | null;
  onSelectPage: (id: string) => void;
  onViewportSelect: (id: string | null) => void;
  onOpenEditor?: (viewportId: string) => void;
  onPageViewportUpdate: (pageId: string, viewportId: string, updates: Partial<MapViewport>) => void;
  onPageViewportRemove: (pageId: string, viewportId: string) => void;
  onPageIndexUpdate: (pageId: string, indexId: string, updates: Partial<IndexListConfig>) => void;
  onPageIndexRemove: (pageId: string, indexId: string) => void;
  onPageTitleBlockUpdate: (pageId: string, blockId: string, updates: Partial<TitleBlockConfig>) => void;
  onPageTitleBlockRemove: (pageId: string, blockId: string) => void;
}) {
  const pageSize = pageSizeMmFor(page);
  const margins = getMargins(page);
  const containerWidth = pageSize.w * CSS_PX_PER_MM;
  const containerHeight = pageSize.h * CSS_PX_PER_MM;
  // Uniform fine grid: every 16th cell edge aligns with a 1/16 page fold line,
  // so fold snapping is a multiple-of-FOLD_STEP constraint, while free mode can
  // place tiles at any of the 1/256 fine cells.
  const foldColMm = pageSize.w / GRID_FINE;
  const foldRowMm = pageSize.h / GRID_FINE;

  const mmToGrid = useCallback(
    (mm: number, ref: 'x' | 'y') => (ref === 'x' ? mm / foldColMm : mm / foldRowMm),
    [foldColMm, foldRowMm]
  );

  const gridToMm = useCallback(
    (g: number, ref: 'x' | 'y') => (ref === 'x' ? g * foldColMm : g * foldRowMm),
    [foldColMm, foldRowMm]
  );

  const mmToGridW = useCallback((wmm: number) => Math.max(1, wmm / foldColMm), [foldColMm]);
  const mmToGridH = useCallback((hmm: number) => Math.max(1, hmm / foldRowMm), [foldRowMm]);
  const gridWToMm = useCallback((w: number) => w * foldColMm, [foldColMm]);
  const gridHToMm = useCallback((h: number) => h * foldRowMm, [foldRowMm]);

  // Snap guides in grid-cell space: page edges (0 / GRID_FINE), the margin
  // lines, and — when fold snapping is on — every 1/16 fold line. Tolerance is
  // a fixed number of mm so it feels the same on every paper size.
  const SNAP_TOL_MM = 4;
  const guideConstraint = useMemo(() => {
    const mkGuides = (loMm: number, hiMm: number, cellMm: number) => {
      const guides = [0, GRID_FINE];
      const lo = loMm / cellMm;
      const hi = GRID_FINE - hiMm / cellMm;
      if (lo > 0) guides.push(lo);
      if (hi < GRID_FINE) guides.push(hi);
      if (page.snapToFold !== false) {
        for (let k = 1; k < 16; k++) guides.push(k * FOLD_STEP);
      }
      return [...new Set(guides)].sort((a, b) => a - b);
    };
    const gx = mkGuides(margins.left, margins.right, foldColMm);
    const gy = mkGuides(margins.top, margins.bottom, foldRowMm);
    const tolX = Math.max(1, SNAP_TOL_MM / foldColMm);
    const tolY = Math.max(1, SNAP_TOL_MM / foldRowMm);
    return makeGuideSnapConstraint(gx, gy, tolX, tolY);
  }, [margins, foldColMm, foldRowMm, page.snapToFold]);

  const scaledPositionStrategy = useMemo(() => {
    const base = createScaledStrategy(zoom);
    return {
      type: 'transform' as const,
      scale: zoom,
      calcStyle: base.calcStyle,
      // Intentionally omit calcDragPosition so react-grid-layout uses its
      // built-in non-strategy path which correctly computes the tile's position
      // as (clientRect.left - parentRect.left) / transformScale. The library's
      // own createScaledStrategy.calcDragPosition returns the absolute viewport
      // position instead of the position relative to the container.
    };
  }, [zoom]);

  // itemSpacing is symmetric padding around each tile: pad on each side, so a
  // gutter of itemSpacing separates neighbouring frames while tile boxes stay
  // on the fold grid (fold lines run through the blank gutter).
  const itemSpacing = page.itemSpacing ?? 0;
  const padMm = itemSpacing / 2;
  const padPx = padMm * CSS_PX_PER_MM;
  const insetBoxPx = useCallback(
    (item: Pick<GridItem, 'w' | 'h'>) => ({
      w: Math.max(1, gridWToMm(item.w) * CSS_PX_PER_MM - padPx * 2),
      h: Math.max(1, gridHToMm(item.h) * CSS_PX_PER_MM - padPx * 2),
    }),
    [gridWToMm, gridHToMm, padPx]
  );

  const viewportToItem = useCallback(
    (vp: MapViewport): GridItem => {
      const fp = footprintDims(vp.rotation, vp.positionOnPage.width, vp.positionOnPage.height);
      return {
        i: vp.id,
        type: 'viewport',
        x: Math.round(mmToGrid(vp.positionOnPage.x, 'x')),
        y: Math.round(mmToGrid(vp.positionOnPage.y, 'y')),
        w: Math.round(mmToGridW(fp.w)),
        h: Math.round(mmToGridH(fp.h)),
        minW: FOLD_STEP,
        minH: FOLD_STEP,
      };
    },
    [mmToGrid, mmToGridW, mmToGridH]
  );

  const indexToItem = useCallback(
    (c: IndexListConfig): GridItem => {
      const fp = footprintDims(c.rotation, c.position.width, c.position.height);
      return {
        i: indexItemId(c.id),
        type: 'indexList',
        x: Math.round(mmToGrid(c.position.x, 'x')),
        y: Math.round(mmToGrid(c.position.y, 'y')),
        w: Math.round(mmToGridW(fp.w)),
        h: Math.round(mmToGridH(fp.h)),
        minW: FOLD_STEP,
        minH: FOLD_STEP,
      };
    },
    [mmToGrid, mmToGridW, mmToGridH]
  );

  const tbToItem = useCallback(
    (c: TitleBlockConfig): GridItem => {
      const fp = footprintDims(c.rotation, c.position.width, c.position.height);
      return {
        i: tbItemId(c.id),
        type: 'titleBlock',
        x: Math.round(mmToGrid(c.position.x, 'x')),
        y: Math.round(mmToGrid(c.position.y, 'y')),
        w: Math.round(mmToGridW(fp.w)),
        h: Math.round(mmToGridH(fp.h)),
        minW: FOLD_STEP,
        minH: FOLD_STEP,
      };
    },
    [mmToGrid, mmToGridW, mmToGridH]
  );

  const [gridItems, setGridItems] = useState<GridItem[]>(() => {
    const items: GridItem[] = page.viewports.map(viewportToItem);
    items.push(...page.indexLists.map(indexToItem));
    items.push(...page.titleBlocks.map(tbToItem));
    return items;
  });

  const sig = JSON.stringify({
    conv: [pageSize.w, pageSize.h, margins],
    vps: page.viewports.map((v) => [v.id, v.positionOnPage, v.rotation]),
    indexes: page.indexLists.map((c) => [c.id, c.position, c.rotation]),
    tbs: page.titleBlocks.map((c) => [c.id, c.position, c.rotation]),
  });
  const prevSigRef = useRef<string>('');

  useEffect(() => {
    if (skipSyncRef.current) { skipSyncRef.current = false; return; }
    if (prevSigRef.current === sig) return;
    prevSigRef.current = sig;
    const items: GridItem[] = page.viewports.map(viewportToItem);
    items.push(...page.indexLists.map(indexToItem));
    items.push(...page.titleBlocks.map(tbToItem));
    setGridItems(items);
  }, [sig, page.viewports, page.indexLists, page.titleBlocks, viewportToItem, indexToItem, tbToItem]);

  const persistGridItem = useCallback(
    (item: { i: string; x: number; y: number; w: number; h: number }) => {
      const boxW = gridWToMm(item.w);
      const boxH = gridHToMm(item.h);
      const ix = indexIdFromItem(item.i);
      const tbx = tbIdFromItem(item.i);
      if (ix) {
        const config = page.indexLists.find((c) => c.id === ix);
        if (!config) return;
        const content = contentDims(config.rotation, boxW, boxH);
        const next = { x: gridToMm(item.x, 'x'), y: gridToMm(item.y, 'y'), width: content.w, height: content.h };
        const cur = config.position;
        if (cur.x === next.x && cur.y === next.y && cur.width === next.width && cur.height === next.height) return;
        onPageIndexUpdate(page.id, ix, { position: next });
        return;
      }
      if (tbx) {
        const config = page.titleBlocks.find((c) => c.id === tbx);
        if (!config) return;
        const content = contentDims(config.rotation, boxW, boxH);
        const next = { x: gridToMm(item.x, 'x'), y: gridToMm(item.y, 'y'), width: content.w, height: content.h };
        const cur = config.position;
        if (cur.x === next.x && cur.y === next.y && cur.width === next.width && cur.height === next.height) return;
        onPageTitleBlockUpdate(page.id, tbx, { position: next });
        return;
      }
      const vp = page.viewports.find((v) => v.id === item.i);
      if (vp) {
        const content = contentDims(vp.rotation, boxW, boxH);
        const next = {
          x: gridToMm(item.x, 'x'),
          y: gridToMm(item.y, 'y'),
          width: content.w,
          height: content.h,
        };
        const cur = vp.positionOnPage;
        if (cur.x === next.x && cur.y === next.y && cur.width === next.width && cur.height === next.height) return;
        onPageViewportUpdate(page.id, item.i, { positionOnPage: next });
      }
    },
    [page.id, page.indexLists, page.titleBlocks, page.viewports, onPageIndexUpdate, onPageTitleBlockUpdate, onPageViewportUpdate, gridToMm, gridWToMm, gridHToMm]
  );

  const skipSyncRef = useRef(false);

  const handleLayoutChange = useCallback(
    (newLayout: readonly LayoutItem[]) => {
      // Keep gridItems in sync with react-grid-layout's internal layout
      // (compaction, etc.) WITHOUT persisting to mm — that only happens on
      // drag/resize stop to avoid mm-roundtrip rounding drift.
      skipSyncRef.current = true;
      setGridItems((prev) => newLayout.map((l) => {
        const existing = prev.find((p) => p.i === l.i);
        return existing ? { ...existing, x: l.x, y: l.y, w: l.w, h: l.h } : l as GridItem;
      }));
    },
    []
  );

  const handleDragStop = useCallback(
    (layout: readonly LayoutItem[], _oldItem: LayoutItem | null, newItem: LayoutItem | null) => {
      if (newItem) {
        // Apply the final grid positions directly to avoid mm-roundtrip drift
        skipSyncRef.current = true;
        setGridItems((prev) => layout.map((l) => {
          const existing = prev.find((p) => p.i === l.i);
          return existing ? { ...existing, x: l.x, y: l.y, w: l.w, h: l.h } : l as GridItem;
        }));
        persistGridItem(newItem);
      }
    },
    [persistGridItem]
  );

  const handleResizeStop = useCallback(
    (layout: readonly LayoutItem[], _oldItem: LayoutItem | null, newItem: LayoutItem | null) => {
      if (newItem) {
        skipSyncRef.current = true;
        setGridItems((prev) => layout.map((l) => {
          const existing = prev.find((p) => p.i === l.i);
          return existing ? { ...existing, x: l.x, y: l.y, w: l.w, h: l.h } : l as GridItem;
        }));
        persistGridItem(newItem);
      }
    },
    [persistGridItem]
  );

  return (
    <div className="relative shrink-0" style={{ width: containerWidth * zoom, height: containerHeight * zoom }}>
      <div
        className={cn('relative', isActive && 'ring-2 ring-blue-500')}
        style={{
          width: containerWidth,
          height: containerHeight,
          backgroundColor: page.paperColor || '#ffffff',
          transform: `scale(${zoom})`,
          transformOrigin: 'top left',
          boxShadow: isActive ? '0 16px 48px rgba(0,0,0,0.4)' : '0 8px 24px rgba(0,0,0,0.28)',
        }}
        onClick={(e) => {
          const t = e.target as HTMLElement;
          if (t.closest?.('.react-grid-item')) return;
          onSelectPage(page.id);
        }}
      >
        {/* Page margins */}
        <div
          className="pointer-events-none absolute border border-dashed border-zinc-400"
          style={{
            top: margins.top * CSS_PX_PER_MM,
            right: margins.right * CSS_PX_PER_MM,
            bottom: margins.bottom * CSS_PX_PER_MM,
            left: margins.left * CSS_PX_PER_MM,
          }}
        />

        {/* Fold lines */}
        {showFoldLines && (
          <svg className="pointer-events-none absolute inset-0" width={containerWidth} height={containerHeight}>
            {Array.from({ length: 15 }, (_, i) => i + 1).map((n) => {
              const frac = n / 16;
              const level = n === 8 ? 0.7 : n % 4 === 0 ? 0.55 : n % 2 === 0 ? 0.4 : 0.25;
              return (
                <g key={n} stroke="#3b82f6" strokeWidth={n === 8 ? 1.5 : 1} strokeDasharray="5 4" opacity={level}>
                  <line x1={containerWidth * frac} y1={0} x2={containerWidth * frac} y2={containerHeight} />
                  <line x1={0} y1={containerHeight * frac} x2={containerWidth} y2={containerHeight * frac} />
                </g>
              );
            })}
          </svg>
        )}

        {/* Corner crop marks */}
        {(['tl', 'tr', 'bl', 'br'] as const).map((pos) => (
          <div
            key={pos}
            className="pointer-events-none absolute w-3 h-3"
            style={{
              top: pos.startsWith('t') ? -4 : undefined,
              bottom: pos.startsWith('b') ? -4 : undefined,
              left: pos.endsWith('l') ? -4 : undefined,
              right: pos.endsWith('r') ? -4 : undefined,
              borderColor: '#9ca3af',
              borderTop: pos.startsWith('t') ? '2px solid #9ca3af' : undefined,
              borderBottom: pos.startsWith('b') ? '2px solid #9ca3af' : undefined,
              borderLeft: pos.endsWith('l') ? '2px solid #9ca3af' : undefined,
              borderRight: pos.endsWith('r') ? '2px solid #9ca3af' : undefined,
            }}
          />
        ))}

        <GridLayout
          className="layout"
          layout={gridItems}
          width={containerWidth}
          positionStrategy={scaledPositionStrategy}
          gridConfig={{
            cols: GRID_FINE,
            rowHeight: (pageSize.h / GRID_FINE) * CSS_PX_PER_MM,
            margin: [0, 0],
            containerPadding: [0, 0],
          }}
          constraints={[guideConstraint]}
          compactor={noOverlapCompactor}
          resizeConfig={{ handles: ['se', 'sw', 'ne', 'nw'] }}
          dragConfig={{ handle: '.frame-drag-handle' }}
          onDragStop={handleDragStop}
          onResizeStop={handleResizeStop}
          onLayoutChange={handleLayoutChange}
        >
          {gridItems.map((item) => {
            const isActiveItem = activeViewportId === item.i;

            if (item.type === 'indexList') {
              const ix = indexIdFromItem(item.i)!;
              const config = page.indexLists.find((c) => c.id === ix);
              if (!config) return null;
              const boxPx = insetBoxPx(item);
              const contentPx = contentDims(config.rotation, boxPx.w, boxPx.h);
              return (
                <div key={item.i} className={cn('relative')} style={{ zIndex: isActiveItem ? 1000 + (config.stackOrder ?? 0) : 10 + (config.stackOrder ?? 0) }}>
                  <div className="relative h-full w-full">
                    <div className="absolute" style={{ top: padPx, left: padPx, right: padPx, bottom: padPx }}>
                      <IndexListFrameWrapper
                        layout={page}
                        config={config}
                        contentPx={contentPx}
                        isActive={isActiveItem}
                        onSelect={() => {
                          onSelectPage(page.id);
                          onViewportSelect(item.i);
                        }}
                        onRemove={() => {
                          onPageIndexRemove(page.id, config.id);
                          if (activeViewportId === item.i) onViewportSelect(null);
                        }}
                        onRotate={() => {
                          const next = ((config.rotation ?? 0) + 90) % 360 as 0 | 90 | 180 | 270;
                          onPageIndexUpdate(page.id, config.id, { rotation: next });
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            }

            if (item.type === 'titleBlock') {
              const tbx = tbIdFromItem(item.i)!;
              const config = page.titleBlocks.find((c) => c.id === tbx);
              if (!config) return null;
              const boxPx = insetBoxPx(item);
              const contentPx = contentDims(config.rotation, boxPx.w, boxPx.h);
              return (
                <div key={item.i} className={cn('relative')} style={{ zIndex: isActiveItem ? 1000 + (config.stackOrder ?? 0) : 10 + (config.stackOrder ?? 0) }}>
                  <div className="relative h-full w-full">
                    <div className="absolute" style={{ top: padPx, left: padPx, right: padPx, bottom: padPx }}>
                      <TitleBlockFrame
                        layout={page}
                        config={config}
                        boxPx={boxPx}
                        contentPx={contentPx}
                        isActive={isActiveItem}
                        onSelect={() => {
                          onSelectPage(page.id);
                          onViewportSelect(item.i);
                        }}
                        onRemove={() => {
                          onPageTitleBlockRemove(page.id, config.id);
                          if (activeViewportId === item.i) onViewportSelect(null);
                        }}
                        onRotate={() => {
                          const next = ((config.rotation ?? 0) + 90) % 360 as 0 | 90 | 180 | 270;
                          onPageTitleBlockUpdate(page.id, config.id, { rotation: next });
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            }

            const vp = page.viewports.find((v) => v.id === item.i);
            if (!vp) return null;
            return (
              <div
                key={item.i}
                className={cn('relative', isActiveItem && 'ring-2 ring-blue-500')}
                style={{ zIndex: isActiveItem ? 1000 + (vp.stackOrder ?? 0) : 10 + (vp.stackOrder ?? 0) }}
              >
                <div className="relative h-full w-full">
                  <div className="absolute" style={{ top: padPx, left: padPx, right: padPx, bottom: padPx }}>
                    <PrintMapFrame
                      viewport={vp}
                      layout={page}
                      isActive={isActiveItem}
                      onSelect={() => {
                        onSelectPage(page.id);
                        onViewportSelect(item.i);
                      }}
                      onRemove={() => {
                        onPageViewportRemove(page.id, item.i);
                        if (activeViewportId === item.i) onViewportSelect(null);
                      }}
                      onUpdate={(updates) => onPageViewportUpdate(page.id, item.i, updates)}
                      onDoubleClick={() => onOpenEditor?.(vp.id)}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </GridLayout>
      </div>
    </div>
  );
}

/* ------------------------------ PageStrip ------------------------------ */

function PageStrip({ pages, activePageId, onSetActivePageId, onAddPage, onRemovePage, onRenamePage }: {
  pages: PrintPage[];
  activePageId: string;
  onSetActivePageId: (id: string) => void;
  onAddPage: () => void;
  onRemovePage: (id: string) => void;
  onRenamePage: (id: string, name: string) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  return (
    <div className="flex items-center gap-3 overflow-x-auto border-b border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
      <Label className="flex shrink-0 items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
        <LayoutTemplate className="h-3.5 w-3.5" />
        Pages
      </Label>
      <div className="flex items-end gap-4">
        {pages.map((p) => {
          const active = p.id === activePageId;
          const ps = pageSizeMmFor(p);
          const thumbW = 64;
          const thumbH = Math.max(24, Math.round((thumbW * ps.h) / ps.w));
          return (
            <div key={p.id} className="group relative flex flex-col items-center gap-1">
              <button
                type="button"
                title={p.name}
                onClick={() => onSetActivePageId(p.id)}
                className={cn(
                  'relative cursor-pointer rounded-lg border bg-white p-0.5 transition-shadow',
                  active ? 'border-blue-500 ring-2 ring-blue-500' : 'border-zinc-300 hover:border-blue-400 dark:border-zinc-700'
                )}
                style={{ width: thumbW + 4, height: thumbH + 4 }}
              >
                <div className="relative w-full h-full overflow-hidden rounded-[3px] bg-white">
                  {p.viewports.map((vp) => {
                    const fp = footprintDims(vp.rotation, vp.positionOnPage.width, vp.positionOnPage.height);
                    return (
                      <div
                        key={vp.id}
                        className="absolute border border-zinc-300 bg-zinc-200"
                        style={{
                          left: `${(vp.positionOnPage.x / ps.w) * 100}%`,
                          top: `${(vp.positionOnPage.y / ps.h) * 100}%`,
                          width: `${(fp.w / ps.w) * 100}%`,
                          height: `${(fp.h / ps.h) * 100}%`,
                        }}
                      />
                    );
                  })}
                  {p.indexLists.map((c) => (
                    <div
                      key={c.id}
                      className="absolute border border-sky-300 bg-sky-100"
                      style={{
                        left: `${(c.position.x / ps.w) * 100}%`,
                        top: `${(c.position.y / ps.h) * 100}%`,
                        width: `${(c.position.width / ps.w) * 100}%`,
                        height: `${(c.position.height / ps.h) * 100}%`,
                      }}
                    />
                  ))}
                  {p.titleBlocks.map((c) => (
                    <div
                      key={c.id}
                      className="absolute border border-amber-300 bg-amber-100"
                      style={{
                        left: `${(c.position.x / ps.w) * 100}%`,
                        top: `${(c.position.y / ps.h) * 100}%`,
                        width: `${(c.position.width / ps.w) * 100}%`,
                        height: `${(c.position.height / ps.h) * 100}%`,
                      }}
                    />
                  ))}
                </div>
              </button>
              {editingId === p.id ? (
                <input
                  autoFocus
                  className="w-16 bg-transparent border-b border-zinc-400 text-center text-[10px] outline-none"
                  value={draft}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => {
                    onRenamePage(p.id, draft.trim() || p.name);
                    setEditingId(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      onRenamePage(p.id, draft.trim() || p.name);
                      setEditingId(null);
                    }
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                />
              ) : (
                <span className="max-w-20 truncate text-[10px] text-zinc-600 dark:text-zinc-400">{p.name}</span>
              )}
              <div className="absolute -top-1.5 right-0 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  type="button"
                  className="rounded bg-white p-0.5 text-zinc-500 shadow hover:text-zinc-900 dark:bg-zinc-800 dark:text-zinc-400"
                  title="Rename"
                  onClick={() => {
                    setEditingId(p.id);
                    setDraft(p.name);
                  }}
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  className="rounded bg-white p-0.5 text-zinc-500 shadow hover:text-red-600 dark:bg-zinc-800 dark:text-zinc-400"
                  title="Delete page"
                  onClick={() => onRemovePage(p.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <Button variant="outline" size="sm" className="h-7 shrink-0 px-2 text-xs" onClick={onAddPage} title="Add page">
        <FilePlus2 className="h-3.5 w-3.5 mr-1" />
        Add Page
      </Button>
    </div>
  );
}

/* ------------------------------ Inspector UI ------------------------------ */

function Section({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold text-zinc-700 dark:text-zinc-200"
      >
        <span>{title}</span>
        <ChevronDown className={cn('h-3.5 w-3.5 text-zinc-400 transition-transform', open && 'rotate-180')} />
      </button>
      {open && <div className="space-y-3 px-3 pb-3">{children}</div>}
    </div>
  );
}

function SubSection({ title, children, defaultOpen = false, badge }: { title: string; children: React.ReactNode; defaultOpen?: boolean; badge?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
      >
        <span className="flex items-center gap-1.5">
          <span>{title}</span>
          {badge && <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[9px] font-normal normal-case text-zinc-500 dark:bg-zinc-800">{badge}</span>}
        </span>
        <ChevronDown className={cn('h-3 w-3 text-zinc-400 transition-transform', open && 'rotate-180')} />
      </button>
      {open && <div className="space-y-2 px-2.5 pb-2.5 pt-0.5">{children}</div>}
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <Label className="text-[11px] text-zinc-500 dark:text-zinc-400">{label}</Label>
      {children}
    </div>
  );
}

function Num({ value, onChange, min, max, step = 1 }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  return (
    <Input
      type="number"
      value={Math.round(value * 100) / 100}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      min={min}
      max={max}
      step={step}
      className="h-8 text-sm"
    />
  );
}

function FontSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm"
    >
      {TITLE_FONTS.map((f) => (
        <option key={f.id} value={f.id}>{f.label}</option>
      ))}
    </select>
  );
}

function WeightSelect({ value, onChange }: { value: 'normal' | 'medium' | 'bold'; onChange: (v: 'normal' | 'medium' | 'bold') => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as 'normal' | 'medium' | 'bold')} className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm">
      <option value="normal">Normal</option>
      <option value="medium">Medium</option>
      <option value="bold">Bold</option>
    </select>
  );
}

function RotationSelect({ value, onChange }: { value: number | undefined; onChange: (v: 0 | 90 | 180 | 270) => void }) {
  return (
    <select value={value ?? 0} onChange={(e) => onChange(Number(e.target.value) as 0 | 90 | 180 | 270)} className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm">
      <option value={0}>0°</option>
      <option value={90}>90°</option>
      <option value={180}>180°</option>
      <option value={270}>270°</option>
    </select>
  );
}

function FontGroup({ family, size, weight, onFamily, onSize, onWeight, onReset, sizeMin = 1, sizeMax = 20, sizeStep = 0.5 }: {
  family: string;
  size: number;
  weight: 'normal' | 'medium' | 'bold';
  onFamily: (v: string) => void;
  onSize: (v: number) => void;
  onWeight: (v: 'normal' | 'medium' | 'bold') => void;
  onReset?: () => void;
  sizeMin?: number;
  sizeMax?: number;
  sizeStep?: number;
}) {
  return (
    <>
      <Field label="Font family">
        <FontSelect value={family} onChange={onFamily} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Size (mm)">
          <Num value={size} onChange={onSize} min={sizeMin} max={sizeMax} step={sizeStep} />
        </Field>
        <Field label="Weight">
          <WeightSelect value={weight} onChange={onWeight} />
        </Field>
      </div>
      {onReset && (
        <Button variant="ghost" size="sm" className="h-7 w-full text-xs" onClick={onReset}>
          Reset to page default
        </Button>
      )}
    </>
  );
}

function PositionFields({ pos, onChange }: { pos: Rect; onChange: (partial: Partial<Rect>) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Field label="X (mm)">
        <Num value={pos.x} onChange={(v) => onChange({ x: v })} />
      </Field>
      <Field label="Y (mm)">
        <Num value={pos.y} onChange={(v) => onChange({ y: v })} />
      </Field>
      <Field label="Width (mm)">
        <Num value={pos.width} onChange={(v) => onChange({ width: Math.max(5, v) })} min={5} step={5} />
      </Field>
      <Field label="Height (mm)">
        <Num value={pos.height} onChange={(v) => onChange({ height: Math.max(5, v) })} min={5} step={5} />
      </Field>
    </div>
  );
}

function PageSettings({ page, onUpdate }: { page: PrintLayout; onUpdate: (u: Partial<PrintLayout>) => void }) {
  const setMargin = (key: keyof NonNullable<PrintLayout['pageMargins']>, value: number) =>
    onUpdate({ pageMargins: { top: page.pageMargins?.top ?? 10, right: page.pageMargins?.right ?? 10, bottom: page.pageMargins?.bottom ?? 10, left: page.pageMargins?.left ?? 10, [key]: value } });

  return (
    <>
      <Field label="Paper color">
        <ColorPicker color={page.paperColor ?? '#ffffff'} onChange={(c) => onUpdate({ paperColor: c })} />
      </Field>
      <Field label="Spot color">
        <ColorPicker color={page.spotColor} onChange={(c) => onUpdate({ spotColor: c })} />
      </Field>
      <Field label="Margins (mm)">
        <div className="grid grid-cols-4 gap-1.5">
          {(['top', 'right', 'bottom', 'left'] as const).map((m) => (
            <Num key={m} value={page.pageMargins?.[m] ?? 10} onChange={(v) => setMargin(m, v)} min={0} max={60} />
          ))}
        </div>
      </Field>
      <Field label="Item spacing (mm)">
        <Num value={page.itemSpacing ?? 5} onChange={(v) => onUpdate({ itemSpacing: v })} min={0} max={20} />
      </Field>
      <Field label="Snap to fold grid">
        <Switch checked={page.snapToFold !== false} onCheckedChange={(c) => onUpdate({ snapToFold: c })} />
      </Field>
      <Separator />
      <FontGroup
        family={page.titleFontFamily ?? 'Helvetica'}
        size={page.titleFontSize ?? 3}
        weight={page.titleFontWeight ?? 'bold'}
        onFamily={(v) => onUpdate({ titleFontFamily: v })}
        onSize={(v) => onUpdate({ titleFontSize: v })}
        onWeight={(v) => onUpdate({ titleFontWeight: v })}
        onReset={() => onUpdate({ titleFontFamily: undefined, titleFontSize: undefined, titleFontWeight: undefined })}
      />
      <Field label="Default title background">
        <ColorPicker color={page.defaultTitleBackgroundColor ?? page.spotColor} onChange={(c) => onUpdate({ defaultTitleBackgroundColor: c })} />
      </Field>
      <Field label="Default title text color">
        <ColorPicker color={page.defaultTitleTextColor ?? '#ffffff'} onChange={(c) => onUpdate({ defaultTitleTextColor: c })} />
      </Field>
      <Separator />
      <p className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-200">Map settings</p>
      <Field label="Glyphs server URL">
        <Input
          value={page.glyphsUrl ?? ''}
          placeholder="Default (OpenFreeMap)"
          onChange={(e) => onUpdate({ glyphsUrl: e.target.value || undefined })}
          className="h-8 text-sm"
        />
      </Field>
      <p className="text-[10px] text-zinc-400 leading-tight">
        For more fonts, use: tiles.openstreetmap.us/fonts/{'{fontstack}'}/{'{range}'}.pbf
      </p>
      <Separator />
      <p className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-200">Index list defaults</p>
      <Field label="Default columns">
        <Num value={page.indexColumns ?? 2} onChange={(v) => onUpdate({ indexColumns: Math.max(1, Math.round(v) || 1) })} min={1} max={6} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Default border width (mm)">
          <Num value={page.indexListBorderWidth ?? 1} onChange={(v) => onUpdate({ indexListBorderWidth: v })} min={0} step={0.5} />
        </Field>
        <Field label="Default corner radius (mm)">
          <Num value={page.indexListCornerRadius ?? 4} onChange={(v) => onUpdate({ indexListCornerRadius: v })} min={0} />
        </Field>
        <Field label="Default border color">
          <ColorPicker color={page.indexListBorderColor ?? '#000000'} onChange={(c) => onUpdate({ indexListBorderColor: c })} />
        </Field>
        <Field label="Default background">
          <ColorPicker color={page.indexListBackgroundColor ?? '#ffffff'} onChange={(c) => onUpdate({ indexListBackgroundColor: c })} />
        </Field>
        <Field label="Default title background">
          <ColorPicker color={page.indexListTitleBackgroundColor ?? page.defaultTitleBackgroundColor ?? page.spotColor} onChange={(c) => onUpdate({ indexListTitleBackgroundColor: c })} />
        </Field>
        <Field label="Default title text color">
          <ColorPicker color={page.indexListTitleTextColor ?? '#ffffff'} onChange={(c) => onUpdate({ indexListTitleTextColor: c })} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Padding top (mm)">
          <Num value={page.indexListPaddingTop ?? page.indexListPadding ?? 1.5} onChange={(v) => onUpdate({ indexListPaddingTop: v })} min={0} max={20} step={0.5} />
        </Field>
        <Field label="Padding right (mm)">
          <Num value={page.indexListPaddingRight ?? page.indexListPadding ?? 1.5} onChange={(v) => onUpdate({ indexListPaddingRight: v })} min={0} max={20} step={0.5} />
        </Field>
        <Field label="Padding bottom (mm)">
          <Num value={page.indexListPaddingBottom ?? page.indexListPadding ?? 1.5} onChange={(v) => onUpdate({ indexListPaddingBottom: v })} min={0} max={20} step={0.5} />
        </Field>
        <Field label="Padding left (mm)">
          <Num value={page.indexListPaddingLeft ?? page.indexListPadding ?? 1.5} onChange={(v) => onUpdate({ indexListPaddingLeft: v })} min={0} max={20} step={0.5} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Default line height (mm)">
          <Num value={page.indexListLineHeight ?? 3.6} onChange={(v) => onUpdate({ indexListLineHeight: v })} min={1.2} max={12} step={0.2} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Label className="flex items-center gap-2 cursor-pointer text-xs">
          <Switch checked={page.indexListShowTitle !== false} onCheckedChange={(c) => onUpdate({ indexListShowTitle: c })} />
          Show title bar
        </Label>
        <Label className="flex items-center gap-2 cursor-pointer text-xs">
          <Switch checked={page.indexListRoundedCorners === true} onCheckedChange={(c) => onUpdate({ indexListRoundedCorners: c })} />
          Rounded corners
        </Label>
        <Label className="flex items-center gap-2 cursor-pointer text-xs">
          <Switch checked={page.indexListShowGridRefs !== false} onCheckedChange={(c) => onUpdate({ indexListShowGridRefs: c })} />
          Grid references
        </Label>
      </div>
    </>
  );
}

function ViewportProperties({ viewport, page, onUpdate }: {
  viewport: MapViewport;
  page: PrintLayout;
  onUpdate: (id: string, updates: Partial<MapViewport>) => void;
}) {
  const pos = viewport.positionOnPage;
  const updatePos = (partial: Partial<Rect>) => onUpdate(viewport.id, { positionOnPage: { ...pos, ...partial } });

  return (
    <>
      <Field label="Title">
        <Input value={viewport.title} onChange={(e) => onUpdate(viewport.id, { title: e.target.value })} className="h-8 text-sm" />
      </Field>

      <SubSection title="Position">
        <PositionFields pos={pos} onChange={updatePos} />
        <Field label="Rotation">
          <RotationSelect value={viewport.rotation} onChange={(v) => onUpdate(viewport.id, { rotation: v })} />
        </Field>
      </SubSection>

      <SubSection title="Frame">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Corner radius (mm)">
            <Num value={viewport.cornerRadius ?? 4} onChange={(v) => onUpdate(viewport.id, { cornerRadius: v })} min={0} />
          </Field>
          <Field label="Border width (mm)">
            <Num value={viewport.borderWidth ?? 0.1} onChange={(v) => onUpdate(viewport.id, { borderWidth: v })} min={0} step={0.1} />
          </Field>
          <Field label="Border color">
            <ColorPicker color={viewport.borderColor || '#000000'} onChange={(c) => onUpdate(viewport.id, { borderColor: c })} />
          </Field>
          <Field label="Background">
            <ColorPicker color={viewport.backgroundColor || '#ffffff'} onChange={(c) => onUpdate(viewport.id, { backgroundColor: c })} />
          </Field>
        </div>
        <Label className="flex items-center gap-2 cursor-pointer text-xs">
          <Switch checked={viewport.roundedCorners === true} onCheckedChange={(c) => onUpdate(viewport.id, { roundedCorners: c })} />
          Rounded corners
        </Label>
      </SubSection>

      <SubSection title="Title bar">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Background color">
            <ColorPicker color={viewport.titleBackgroundColor || '#ffffff'} onChange={(c) => onUpdate(viewport.id, { titleBackgroundColor: c })} />
          </Field>
          <Field label="Text color">
            <ColorPicker
              color={viewport.titleTextColor || page.defaultTitleTextColor || (viewport.titleBackground !== false ? '#ffffff' : '#1a1a1a')}
              onChange={(c) => onUpdate(viewport.id, { titleTextColor: c })}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Label className="flex items-center gap-2 cursor-pointer text-xs">
            <Switch checked={viewport.showTitle !== false} onCheckedChange={(c) => onUpdate(viewport.id, { showTitle: c })} />
            Show title
          </Label>
          <Label className="flex items-center gap-2 cursor-pointer text-xs">
            <Switch checked={viewport.titleBackground !== false} onCheckedChange={(c) => onUpdate(viewport.id, { titleBackground: c })} />
            Background
          </Label>
        </div>
        <Field label="Title bar height (mm)">
          <Num value={viewport.titleBarHeight ?? 7} onChange={(v) => onUpdate(viewport.id, { titleBarHeight: v })} min={1} max={20} step={0.5} />
        </Field>
        <FontGroup
          family={viewport.titleFontFamily ?? page.titleFontFamily ?? 'Helvetica'}
          size={viewport.titleFontSize ?? page.titleFontSize ?? 3}
          weight={viewport.titleFontWeight ?? page.titleFontWeight ?? 'bold'}
          onFamily={(v) => onUpdate(viewport.id, { titleFontFamily: v })}
          onSize={(v) => onUpdate(viewport.id, { titleFontSize: v })}
          onWeight={(v) => onUpdate(viewport.id, { titleFontWeight: v })}
          onReset={() => onUpdate(viewport.id, { titleFontFamily: undefined, titleFontSize: undefined, titleFontWeight: undefined })}
        />
      </SubSection>

      <SubSection title="Grid & border">
        <Label className="flex items-center gap-2 cursor-pointer text-xs">
          <Switch checked={viewport.showGrid} onCheckedChange={(c) => onUpdate(viewport.id, { showGrid: c })} />
          Show grid
        </Label>
        <Label className="flex items-center gap-2 cursor-pointer text-xs">
          <Switch checked={viewport.showGridIndicator !== false} onCheckedChange={(c) => onUpdate(viewport.id, { showGridIndicator: c })} />
          Grid size indicator
        </Label>
        <Label className="flex items-center gap-2 cursor-pointer text-xs">
          <Switch checked={viewport.showScaleBar ?? true} onCheckedChange={(c) => onUpdate(viewport.id, { showScaleBar: c })} />
          Scale bar
        </Label>
        <Label className="flex items-center gap-2 cursor-pointer text-xs">
          <Switch checked={viewport.showScaleText ?? true} onCheckedChange={(c) => onUpdate(viewport.id, { showScaleText: c })} />
          Scale text (1:N)
        </Label>
        <Field label="Spacing">
          <select
            value={viewport.gridSpacing ? String(viewport.gridSpacing) : 'auto'}
            onChange={(e) => onUpdate(viewport.id, { gridSpacing: e.target.value === 'auto' ? undefined : Number(e.target.value) })}
            className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm"
          >
            <option value="auto">Auto</option>
            {GRID_SPACING_OPTIONS.map((o) => (
              <option key={o.meters} value={o.meters}>{o.label}</option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Line width (mm)">
            <Num value={viewport.gridLineWidth ?? 0.15} onChange={(v) => onUpdate(viewport.id, { gridLineWidth: v })} min={0.05} step={0.05} />
          </Field>
          <Field label="Opacity">
            <Num value={viewport.gridOpacity ?? 0.5} onChange={(v) => onUpdate(viewport.id, { gridOpacity: v })} min={0} max={1} step={0.1} />
          </Field>
          <Field label="Grid color">
            <ColorPicker color={viewport.gridColor || '#8a8a8a'} onChange={(c) => onUpdate(viewport.id, { gridColor: c })} />
          </Field>
        </div>
        <Label className="flex items-center gap-2 cursor-pointer text-xs">
          <Switch checked={viewport.showBorder !== false} onCheckedChange={(c) => onUpdate(viewport.id, { showBorder: c })} />
          Border frame
        </Label>
        <Label className="flex items-center gap-2 cursor-pointer text-xs">
          <Switch checked={viewport.showBorderTicks !== false} onCheckedChange={(c) => onUpdate(viewport.id, { showBorderTicks: c })} />
          Border ticks
        </Label>
        <Label className="flex items-center gap-2 cursor-pointer text-xs">
          <Switch checked={viewport.showGridRefs === true} onCheckedChange={(c) => onUpdate(viewport.id, { showGridRefs: c })} />
          Grid references (A1)
        </Label>
        {viewport.showGridRefs === true && (
          <div className="grid grid-cols-2 gap-2">
            <Field label="Ref font" className="col-span-2">
              <FontSelect value={viewport.gridRefFontFamily ?? 'Helvetica'} onChange={(v) => onUpdate(viewport.id, { gridRefFontFamily: v })} />
            </Field>
            <Field label="Size (mm)">
              <Num value={viewport.gridRefFontSize ?? 2.8} onChange={(v) => onUpdate(viewport.id, { gridRefFontSize: v })} min={0.5} max={12} step={0.2} />
            </Field>
            <Field label="Weight">
              <WeightSelect value={viewport.gridRefFontWeight ?? 'normal'} onChange={(v) => onUpdate(viewport.id, { gridRefFontWeight: v })} />
            </Field>
            <Field label="Color" className="col-span-2">
              <ColorPicker color={viewport.gridRefFontColor || '#3c3c3c'} onChange={(c) => onUpdate(viewport.id, { gridRefFontColor: c })} />
            </Field>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Label className="flex items-center gap-2 cursor-pointer text-xs">
            <Switch checked={viewport.borderAlternating === true} onCheckedChange={(c) => onUpdate(viewport.id, { borderAlternating: c })} />
            Alternating frame
          </Label>
          <Field label="Frame thickness (mm)">
            <Num value={viewport.gridBorderWidth ?? 0.5} onChange={(v) => onUpdate(viewport.id, { gridBorderWidth: v })} min={0.1} step={0.1} />
          </Field>
        </div>
        {viewport.borderAlternating && (
          <div className="grid grid-cols-2 gap-2">
            <Field label="Frame color 1">
              <ColorPicker color={viewport.borderColor || '#000000'} onChange={(c) => onUpdate(viewport.id, { borderColor: c })} />
            </Field>
            <Field label="Frame color 2">
              <ColorPicker color={viewport.borderAlternateColor || '#ffffff'} onChange={(c) => onUpdate(viewport.id, { borderAlternateColor: c })} />
            </Field>
            <Field label="Corner color">
              <ColorPicker
                color={viewport.borderAlternatingCornerColor || viewport.borderColor || '#000000'}
                onChange={(c) => onUpdate(viewport.id, { borderAlternatingCornerColor: c })}
              />
            </Field>
          </div>
        )}
        <Label className="flex items-center gap-2 cursor-pointer text-xs">
          <Switch checked={viewport.borderAlternatingOutline !== false} onCheckedChange={(c) => onUpdate(viewport.id, { borderAlternatingOutline: c })} />
          Outline (inner + outer)
        </Label>
        {viewport.borderAlternating && viewport.borderAlternatingOutline !== false && (
          <Field label="Outline width (mm)">
            <Num value={viewport.borderAlternatingOutlineWidth ?? 0.2} onChange={(v) => onUpdate(viewport.id, { borderAlternatingOutlineWidth: v })} min={0.1} step={0.1} />
          </Field>
        )}
        <Button variant="outline" size="sm" className="h-7 w-full text-xs" onClick={() => onUpdate(viewport.id, { bbox: undefined, showGrid: false })}>
          Clear grid bounds
        </Button>
      </SubSection>

      <SubSection title="Insets">
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
          Choose which maps to outline inside this one. Only maps with a set grid area can be outlined.
        </p>
        {(() => {
          const otherMaps = page.viewports.filter((v) => v.id !== viewport.id && v.bbox);
          const insetSelected: Set<string> = viewport.insetViewportIds
            ? new Set(viewport.insetViewportIds)
            : viewport.showInsets === true
              ? new Set(otherMaps.map((v) => v.id))
              : new Set();
          const toggleInset = (id: string) => {
            const next = new Set(insetSelected);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            const list = Array.from(next);
            onUpdate(viewport.id, { insetViewportIds: list, showInsets: list.length > 0 });
          };
          return (
            <>
              <div className="flex flex-wrap gap-1">
                {otherMaps.length === 0 && (
                  <span className="text-[11px] text-zinc-400">No other maps with a set grid area.</span>
                )}
                {otherMaps.map((v) => {
                  const on = insetSelected.has(v.id);
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => toggleInset(v.id)}
                      className={cn(
                        'rounded-full border px-2 py-0.5 text-[11px]',
                        on ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-zinc-300 text-zinc-500'
                      )}
                      title={v.title}
                    >
                      {v.title}
                    </button>
                  );
                })}
              </div>
              {insetSelected.size > 0 && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Line color">
                      <ColorPicker color={viewport.insetColor || '#e0563d'} onChange={(c) => onUpdate(viewport.id, { insetColor: c })} />
                    </Field>
                    <Field label="Line width (mm)">
                      <Num value={viewport.insetLineWidth ?? 0.3} onChange={(v) => onUpdate(viewport.id, { insetLineWidth: v })} min={0.1} step={0.1} />
                    </Field>
                  </div>
                  <Label className="flex items-center gap-2 cursor-pointer text-xs">
                    <Switch checked={viewport.showInsetLabels !== false} onCheckedChange={(c) => onUpdate(viewport.id, { showInsetLabels: c })} />
                    Show labels
                  </Label>
                </>
              )}
            </>
          );
        })()}
      </SubSection>

      <PoiVisibilityEditor key={viewport.id} viewport={viewport} onUpdate={onUpdate} />

      <SubSection title="Map view">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Longitude">
            <Num value={viewport.center[0]} onChange={(v) => onUpdate(viewport.id, { center: [v, viewport.center[1]] })} step={0.0001} />
          </Field>
          <Field label="Latitude">
            <Num value={viewport.center[1]} onChange={(v) => onUpdate(viewport.id, { center: [viewport.center[0], v] })} step={0.0001} />
          </Field>
        </div>
        <Field label="Map zoom">
          <Num value={viewport.zoom} onChange={(v) => onUpdate(viewport.id, { zoom: v })} min={1} max={20} step={0.5} />
        </Field>
      </SubSection>
    </>
  );
}

function PoiVisibilityEditor({ viewport, onUpdate }: {
  viewport: MapViewport;
  onUpdate: (id: string, updates: Partial<MapViewport>) => void;
}) {
  const { pois } = useMap();
  const [q, setQ] = useState('');
  const active = pois.filter((p) => p.active);
  const allIds = active.map((p) => p.id);
  const shown = viewport.visiblePoiIds ? new Set(viewport.visiblePoiIds) : new Set(allIds);
  const filtered = active.filter(
    (p) =>
      !q ||
      p.name.toLowerCase().includes(q.toLowerCase()) ||
      p.cityRegion.toLowerCase().includes(q.toLowerCase()) ||
      String(p.customNumber ?? '').includes(q)
  );

  const setVisible = (ids: string[] | undefined) => onUpdate(viewport.id, { visiblePoiIds: ids });

  const toggle = (id: string) => {
    const next = new Set(shown);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    const list = Array.from(next);
    setVisible(list.length === allIds.length ? undefined : list);
  };

  return (
    <SubSection title="POIs on this map" badge={`${shown.size} shown`}>
      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
        Which POIs get markers on this map. Defaults to every active POI.
      </p>
      <Label className="flex items-center gap-2 cursor-pointer text-xs">
        <Switch
          checked={viewport.spiderify !== false}
          onCheckedChange={(c) => onUpdate(viewport.id, { spiderify: c })}
        />
        Spiderify overlapping markers
      </Label>
      <Field label={`Marker size (${(viewport.poiMarkerScale ?? 1).toFixed(1)}x)`}>
        <input
          type="range"
          min={0.5}
          max={3}
          step={0.1}
          value={viewport.poiMarkerScale ?? 1}
          onChange={(e) => onUpdate(viewport.id, { poiMarkerScale: parseFloat(e.target.value) })}
          className="w-full h-1.5 accent-current"
        />
      </Field>
      <div className="flex gap-1">
        <Button variant="outline" size="sm" className="h-7 flex-1 text-xs" onClick={() => setVisible(undefined)}>
          All
        </Button>
        <Button variant="outline" size="sm" className="h-7 flex-1 text-xs" onClick={() => setVisible([])}>
          None
        </Button>
      </div>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search POIs…" className="h-7 text-xs" />
      <div className="max-h-44 space-y-0.5 overflow-auto rounded-md border border-zinc-200 dark:border-zinc-800 p-1.5">
        {filtered.length === 0 && <p className="px-1 py-1 text-[11px] text-zinc-400">No matching POIs.</p>}
        {filtered.map((p) => (
          <label key={p.id} className="flex items-center gap-1.5 cursor-pointer text-xs">
            <input
              type="checkbox"
              checked={shown.has(p.id)}
              onChange={() => toggle(p.id)}
              className="h-3 w-3"
            />
            <span className="w-5 shrink-0 text-right font-mono text-[10px] text-zinc-400">{p.customNumber ?? ''}</span>
            <span className="truncate">{p.name}</span>
          </label>
        ))}
      </div>
    </SubSection>
  );
}

function IndexListProperties({ page, config, onUpdate }: {
  page: PrintLayout;
  config: IndexListConfig;
  onUpdate: (u: Partial<IndexListConfig>) => void;
}) {
  const { pois } = useMap();
  const resolved = resolveIndexConfig(config, page);
  const scope = config.scope ?? 'all';
  const updatePos = (partial: Partial<Rect>) =>
    onUpdate({ position: { x: config.position.x, y: config.position.y, width: config.position.width, height: config.position.height, ...partial } });

  const toggleVp = (id: string) => {
    const list = scope === 'all' ? [] : [...scope];
    if (list.includes(id)) onUpdate({ scope: list.filter((x) => x !== id) });
    else {
      list.push(id);
      onUpdate({ scope: list });
    }
  };

  const allCount = scopePois(pois, { ...resolved, scope: 'all' }, page.viewports).length;
  const scopedCount = scopePois(pois, resolved, page.viewports).length;
  const vpCounts = page.viewports.map((vp) => {
    const b = viewportBounds(vp);
    return pois.filter((p) => p.active && p.lng >= b[0] && p.lng <= b[2] && p.lat >= b[1] && p.lat <= b[3]).length;
  });

  const categories = Array.from(new Set(pois.map((p) => p.category)));
  const ordered = config.categoryOrder && config.categoryOrder.length > 0 ? config.categoryOrder : categories;
  const display = ordered.filter((c) => categories.includes(c)).concat(categories.filter((c) => !ordered.includes(c)));
  const moveCat = (cat: string, dir: -1 | 1) => {
    const list = [...display];
    const idx = list.indexOf(cat);
    const target = idx + dir;
    if (target < 0 || target >= list.length) return;
    [list[idx], list[target]] = [list[target], list[idx]];
    onUpdate({ categoryOrder: list });
  };

  return (
    <>
      <Field label="Title">
        <Input value={resolved.title} onChange={(e) => onUpdate({ title: e.target.value })} className="h-8 text-sm" />
      </Field>

      <SubSection title="Position">
        <PositionFields pos={config.position} onChange={updatePos} />
        <Field label="Rotation">
          <RotationSelect value={config.rotation} onChange={(v) => onUpdate({ rotation: v })} />
        </Field>
      </SubSection>

      <SubSection title="What it lists" badge={`${scopedCount} places`}>
        <Field label="Scope">
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => onUpdate({ scope: 'all' })}
            className={cn('rounded-full border px-2 py-0.5 text-[11px]', scope === 'all' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-zinc-300 text-zinc-500')}
          >
            All · {allCount}
          </button>
          {page.viewports.map((vp) => {
            const on = scope !== 'all' && scope.includes(vp.id);
            return (
              <button
                key={vp.id}
                type="button"
                onClick={() => toggleVp(vp.id)}
                className={cn('rounded-full border px-2 py-0.5 text-[11px]', on ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-zinc-300 text-zinc-500')}
                title={vp.title}
              >
                {vp.title} · {vpCounts[page.viewports.indexOf(vp)]}
              </button>
            );
          })}
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Sort by">
          <select value={config.sortBy ?? 'number'} onChange={(e) => onUpdate({ sortBy: e.target.value as IndexListConfig['sortBy'] })} className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm">
            <option value="number">Number</option>
            <option value="name">Name</option>
            <option value="category">Category</option>
            <option value="cityRegion">City / Region</option>
          </select>
        </Field>
        <Field label="Direction">
          <select value={config.sortDirection ?? 'asc'} onChange={(e) => onUpdate({ sortDirection: e.target.value as IndexListConfig['sortDirection'] })} className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm">
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
        </Field>
        <Field label="Columns">
          <Num value={resolved.columns} onChange={(v) => onUpdate({ columns: Math.max(1, Math.round(v) || 1) })} min={1} max={6} />
        </Field>
        <Field label="Group by">
          <select value={resolved.groupBy} onChange={(e) => onUpdate({ groupBy: e.target.value as IndexListConfig['groupBy'] })} className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm">
            <option value="none">None</option>
            <option value="category">Category</option>
            <option value="map">Map</option>
          </select>
        </Field>
      </div>

      {resolved.groupBy === 'category' && (
        <Field label="Category order (drag-free reorder)">
          <div className="flex flex-col gap-1">
            {display.map((cat) => (
              <div key={cat} className="flex items-center gap-1 rounded-md border border-zinc-200 px-2 py-1">
                <span className="flex-1 truncate text-xs">{cat}</span>
                <button type="button" className="rounded px-1 text-zinc-500 hover:bg-zinc-100" onClick={() => moveCat(cat, -1)} disabled={cat === display[0]}>
                  ▲
                </button>
                <button type="button" className="rounded px-1 text-zinc-500 hover:bg-zinc-100" onClick={() => moveCat(cat, 1)} disabled={cat === display[display.length - 1]}>
                  ▼
                </button>
              </div>
            ))}
          </div>
        </Field>
      )}

      </SubSection>

      <SubSection title="Layout">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Text align">
            <select value={resolved.textAlign} onChange={(e) => onUpdate({ textAlign: e.target.value as IndexListConfig['textAlign'] })} className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm">
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
            </select>
          </Field>
          <Field label="Column gap (mm)">
            <Num value={resolved.columnGap} onChange={(v) => onUpdate({ columnGap: v })} min={0} max={20} step={0.5} />
          </Field>
          <Field label="Max height (mm)">
            <Num value={resolved.maxHeight} onChange={(v) => onUpdate({ maxHeight: v })} min={0} max={500} step={1} />
          </Field>
          <Field label="Overflow">
            <select value={resolved.overflow} onChange={(e) => onUpdate({ overflow: e.target.value as IndexListConfig['overflow'] })} className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm">
              <option value="clip">Clip</option>
              <option value="ellipsis">Ellipsis</option>
              <option value="page">Page</option>
            </select>
          </Field>
        </div>
        {resolved.columns > 1 && (
          <Field label={`Column widths (${resolved.columns} cols)`}>
            <div className="flex gap-1">
              {Array.from({ length: resolved.columns }, (_, i) => (
                <Num
                  key={i}
                  value={resolved.columnWidths[i] ?? 1}
                  onChange={(v) => {
                    const widths = [...resolved.columnWidths];
                    while (widths.length <= i) widths.push(1);
                    widths[i] = v;
                    onUpdate({ columnWidths: widths });
                  }}
                  min={0.1}
                  max={10}
                  step={0.5}
                />
              ))}
            </div>
          </Field>
        )}
      </SubSection>

      <SubSection title="Style">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Corner radius (mm)">
          <Num value={resolved.cornerRadius} onChange={(v) => onUpdate({ cornerRadius: v })} min={0} />
        </Field>
        <Field label="Border width (mm)">
          <Num value={resolved.borderWidth} onChange={(v) => onUpdate({ borderWidth: v })} min={0} step={0.5} />
        </Field>
        <Field label="Border color">
          <ColorPicker color={resolved.borderColor} onChange={(c) => onUpdate({ borderColor: c })} />
        </Field>
        <Field label="Background">
          <ColorPicker color={resolved.backgroundColor} onChange={(c) => onUpdate({ backgroundColor: c })} />
        </Field>
        <Field label="Title background">
          <ColorPicker color={resolved.titleBackgroundColor} onChange={(c) => onUpdate({ titleBackgroundColor: c })} />
        </Field>
        <Field label="Title text">
          <ColorPicker color={resolved.titleTextColor} onChange={(c) => onUpdate({ titleTextColor: c })} />
        </Field>
        <Field label="Icon size (mm)">
          <Num value={resolved.iconSize} onChange={(v) => onUpdate({ iconSize: v })} min={1} max={10} step={0.5} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Label className="flex items-center gap-2 cursor-pointer text-xs col-span-2">
          <Switch checked={resolved.showTitleBorder} onCheckedChange={(c) => onUpdate({ showTitleBorder: c })} />
          Title bar border
        </Label>
        {resolved.showTitleBorder && (
          <>
            <Field label="Title border width (mm)">
              <Num value={resolved.titleBorderWidth} onChange={(v) => onUpdate({ titleBorderWidth: v })} min={0} step={0.1} />
            </Field>
            <Field label="Title border color">
              <ColorPicker color={resolved.titleBorderColor} onChange={(c) => onUpdate({ titleBorderColor: c })} />
            </Field>
          </>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Label className="flex items-center gap-2 cursor-pointer text-xs">
          <Switch checked={resolved.showTitle} onCheckedChange={(c) => onUpdate({ showTitle: c })} />
          Show title bar
        </Label>
        <Label className="flex items-center gap-2 cursor-pointer text-xs">
          <Switch checked={resolved.showIcons} onCheckedChange={(c) => onUpdate({ showIcons: c })} />
          Category symbols
        </Label>
        <Label className="flex items-center gap-2 cursor-pointer text-xs">
          <Switch checked={resolved.roundedCorners} onCheckedChange={(c) => onUpdate({ roundedCorners: c })} />
          Rounded corners
        </Label>
        <Label className="flex items-center gap-2 cursor-pointer text-xs">
          <Switch checked={resolved.showGridRefs} onCheckedChange={(c) => onUpdate({ showGridRefs: c })} />
          Grid references
        </Label>
      </div>
      </SubSection>

      <SubSection title="Title bar">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Text color">
            <ColorPicker color={resolved.titleTextColor} onChange={(c) => onUpdate({ titleTextColor: c })} />
          </Field>
          <Field label="Padding (mm)">
            <Num value={resolved.titlePadding} onChange={(v) => onUpdate({ titlePadding: v })} min={0} max={10} step={0.5} />
          </Field>
        </div>
        <FontGroup
          family={resolved.titleFontFamily}
          size={resolved.titleFontSize}
          weight={resolved.titleFontWeight}
          onFamily={(v) => onUpdate({ titleFontFamily: v })}
          onSize={(v) => onUpdate({ titleFontSize: v })}
          onWeight={(v) => onUpdate({ titleFontWeight: v })}
          onReset={() => onUpdate({ titleFontFamily: undefined, titleFontSize: undefined, titleFontWeight: undefined })}
        />
      </SubSection>

      <SubSection title="Body text">
        <Field label="Text color">
          <ColorPicker color={resolved.bodyTextColor} onChange={(c) => onUpdate({ bodyTextColor: c })} />
        </Field>
      <FontGroup
        family={resolved.bodyFontFamily}
        size={resolved.bodyFontSize}
        weight={resolved.bodyFontWeight}
        onFamily={(v) => onUpdate({ bodyFontFamily: v })}
        onSize={(v) => onUpdate({ bodyFontSize: v })}
        onWeight={(v) => onUpdate({ bodyFontWeight: v })}
        onReset={() => onUpdate({ bodyFontFamily: undefined, bodyFontSize: undefined, bodyFontWeight: undefined })}
        sizeMin={1}
        sizeMax={8}
        sizeStep={0.2}
      />
      <div className="grid grid-cols-2 gap-2">
        <Field label="Top (mm)">
          <Num value={resolved.paddingTop} onChange={(v) => onUpdate({ paddingTop: v })} min={0} max={20} step={0.5} />
        </Field>
        <Field label="Right (mm)">
          <Num value={resolved.paddingRight} onChange={(v) => onUpdate({ paddingRight: v })} min={0} max={20} step={0.5} />
        </Field>
        <Field label="Bottom (mm)">
          <Num value={resolved.paddingBottom} onChange={(v) => onUpdate({ paddingBottom: v })} min={0} max={20} step={0.5} />
        </Field>
        <Field label="Left (mm)">
          <Num value={resolved.paddingLeft} onChange={(v) => onUpdate({ paddingLeft: v })} min={0} max={20} step={0.5} />
        </Field>
      </div>
      <Field label="Line height (mm)">
        <Num value={resolved.lineHeight} onChange={(v) => onUpdate({ lineHeight: v })} min={1.2} max={12} step={0.2} />
      </Field>
      </SubSection>

      <SubSection title="Number format">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Format">
            <select value={resolved.numberFormat} onChange={(e) => onUpdate({ numberFormat: e.target.value as IndexListConfig['numberFormat'] })} className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm">
              <option value="number">1</option>
              <option value="paren">(1)</option>
              <option value="dot">1.</option>
              <option value="dash">- 1</option>
            </select>
          </Field>
        </div>
        <FontGroup
          family={resolved.numberFontFamily}
          size={resolved.numberFontSize}
          weight={resolved.numberFontWeight}
          onFamily={(v) => onUpdate({ numberFontFamily: v })}
          onSize={(v) => onUpdate({ numberFontSize: v })}
          onWeight={(v) => onUpdate({ numberFontWeight: v })}
          onReset={() => onUpdate({ numberFontFamily: undefined, numberFontSize: undefined, numberFontWeight: undefined })}
          sizeMin={1}
          sizeMax={8}
          sizeStep={0.2}
        />
      </SubSection>

      <SubSection title="Category headers">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Header color">
            <ColorPicker color={resolved.categoryColor} onChange={(c) => onUpdate({ categoryColor: c })} />
          </Field>
          <Field label="Separator style">
            <select value={resolved.categorySeparatorStyle} onChange={(e) => onUpdate({ categorySeparatorStyle: e.target.value as IndexListConfig['categorySeparatorStyle'] })} className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm">
              <option value="none">None</option>
              <option value="underline">Underline</option>
              <option value="line">Full line</option>
            </select>
          </Field>
          {resolved.categorySeparatorStyle !== 'none' && (
            <>
              <Field label="Separator color">
                <ColorPicker color={resolved.categorySeparatorColor} onChange={(c) => onUpdate({ categorySeparatorColor: c })} />
              </Field>
              <Field label="Separator width (mm)">
                <Num value={resolved.categorySeparatorWidth} onChange={(v) => onUpdate({ categorySeparatorWidth: v })} min={0.1} max={2} step={0.1} />
              </Field>
            </>
          )}
        </div>
      <FontGroup
        family={resolved.categoryFontFamily}
        size={resolved.categoryFontSize}
        weight={resolved.categoryFontWeight}
        onFamily={(v) => onUpdate({ categoryFontFamily: v })}
        onSize={(v) => onUpdate({ categoryFontSize: v })}
        onWeight={(v) => onUpdate({ categoryFontWeight: v })}
        onReset={() => onUpdate({ categoryFontFamily: undefined, categoryFontSize: undefined, categoryFontWeight: undefined })}
        sizeMin={1}
        sizeMax={8}
        sizeStep={0.2}
      />
      </SubSection>

      <SubSection title="Stacking">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onUpdate({ stackOrder: (config.stackOrder ?? 0) + 1 })}>
            Bring Forward
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onUpdate({ stackOrder: (config.stackOrder ?? 0) - 1 })}>
            Send Backward
          </Button>
          {(config.stackOrder ?? 0) !== 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onUpdate({ stackOrder: undefined })}>
              Reset
            </Button>
          )}
        </div>
      </SubSection>
    </>
  );
}

function TitleBlockProperties({ page, config, onUpdate }: {
  page: PrintLayout;
  config: TitleBlockConfig;
  onUpdate: (u: Partial<TitleBlockConfig>) => void;
}) {
  const updatePos = (partial: Partial<Rect>) =>
    onUpdate({ position: { x: config.position.x, y: config.position.y, width: config.position.width, height: config.position.height, ...partial } });

  return (
    <>
      <SubSection title="Title">
        <Field label="Title">
          <Input value={config.title} onChange={(e) => onUpdate({ title: e.target.value })} className="h-8 text-sm" />
        </Field>
        <Field label="Subtitle">
          <Input value={config.subtitle ?? ''} onChange={(e) => onUpdate({ subtitle: e.target.value })} className="h-8 text-sm" />
        </Field>
      </SubSection>

      <SubSection title="Position">
        <PositionFields pos={config.position} onChange={updatePos} />
        <div className="grid grid-cols-2 gap-2">
          <Field label="Rotation">
            <RotationSelect value={config.rotation} onChange={(v) => onUpdate({ rotation: v })} />
          </Field>
          <Field label="Alignment">
            <select value={config.align ?? 'left'} onChange={(e) => onUpdate({ align: e.target.value as TitleBlockConfig['align'] })} className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm">
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
            </select>
          </Field>
        </div>
      </SubSection>

      <SubSection title="Style">
        <FontGroup
          family={config.fontFamily ?? page.titleFontFamily ?? 'Helvetica'}
          size={config.fontSize ?? page.titleFontSize ?? 5}
          weight={config.fontWeight ?? 'bold'}
          onFamily={(v) => onUpdate({ fontFamily: v })}
          onSize={(v) => onUpdate({ fontSize: v })}
          onWeight={(v) => onUpdate({ fontWeight: v })}
        />
        <div className="grid grid-cols-2 gap-2">
          <Field label="Text color">
            <ColorPicker color={config.textColor ?? '#1a1a1a'} onChange={(c) => onUpdate({ textColor: c })} />
          </Field>
          <Field label="Background">
            <ColorPicker color={config.backgroundColor ?? '#ffffff'} onChange={(c) => onUpdate({ backgroundColor: c })} />
          </Field>
          <Field label="Border color">
            <ColorPicker color={config.borderColor ?? page.spotColor} onChange={(c) => onUpdate({ borderColor: c })} />
          </Field>
          <Field label="Border width (mm)">
            <Num value={config.borderWidth ?? 0.1} onChange={(v) => onUpdate({ borderWidth: v })} min={0} step={0.5} />
          </Field>
        </div>
      </SubSection>

      <SubSection title="Stacking">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onUpdate({ stackOrder: (config.stackOrder ?? 0) + 1 })}>
            Bring Forward
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onUpdate({ stackOrder: (config.stackOrder ?? 0) - 1 })}>
            Send Backward
          </Button>
          {(config.stackOrder ?? 0) !== 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onUpdate({ stackOrder: undefined })}>
              Reset
            </Button>
          )}
        </div>
      </SubSection>
    </>
  );
}
