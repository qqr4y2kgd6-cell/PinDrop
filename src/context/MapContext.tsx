'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react';
import { POI, PrintLayout, PrintPage, MapViewport, IndexListConfig, TitleBlockConfig } from '@/types';
import { mockPois, initialLayout } from '@/data/mockPois';
import { viewportBounds, clampBbox } from '@/lib/mapStyle';

const STORAGE_KEY = 'kart-eksporter-state';

interface StoredState {
  pois: POI[];
  pages: PrintPage[];
  activePageId: string;
}

function toPage(layout: PrintLayout, index: number): PrintPage {
  return {
    ...layout,
    id: layout.id || `page-${index + 1}`,
    name: layout.name || `Page ${index + 1}`,
  };
}

/** Legacy single-index fields carried by pre-multi-index pages. */
type LegacyIndexFields = {
  showIndexList?: boolean;
  indexListPosition?: { x: number; y: number; width: number; height: number };
};

/**
 * Ensures a viewport with the grid enabled always has a bbox to draw: derives
 * one from the current map view when `showGrid` is on but no bbox is stored.
 */
function ensureGridBbox(vp: MapViewport): MapViewport {
  if (vp.showGrid && !vp.bbox) {
    return { ...vp, bbox: viewportBounds(vp) };
  }
  return vp;
}

/**
 * Migrates/normalizes a single viewport: the legacy `showBorder` switch was
 * labeled "Border ticks" but hid the whole border, so a stored `false` is
 * reinterpreted as ticks off while keeping the frame. Also ensures the grid
 * has a bbox.
 */
function normalizeViewport(vp: MapViewport): MapViewport {
  let next = vp;
  if (next.showBorder === false && next.showBorderTicks === undefined) {
    next = { ...next, showBorder: true, showBorderTicks: false };
  }
  if (next.bbox) {
    next = { ...next, bbox: clampBbox(next.bbox) };
  }
  return ensureGridBbox(next);
}

/** Migrates a legacy page (single `showIndexList`) to the multi-index model. */
function normalizePage(page: PrintLayout): PrintPage {
  const legacy = page as PrintLayout & LegacyIndexFields;
  const indexLists: IndexListConfig[] = Array.isArray(page.indexLists)
    ? page.indexLists
    : legacy.showIndexList === true
      ? [
          {
            id: 'index-1',
            position: legacy.indexListPosition ?? { x: 10, y: 10, width: 100, height: 45 },
            scope: 'all',
            sortBy: 'number',
            sortDirection: 'asc',
            groupBy: 'category',
            columns: page.indexColumns || 2,
          },
        ]
      : [];
  const titleBlocks: TitleBlockConfig[] = Array.isArray(page.titleBlocks) ? page.titleBlocks : [];
  const page2 = { ...page, indexLists, titleBlocks } as PrintPage;
  return { ...page2, viewports: page2.viewports.map(normalizeViewport) } as PrintPage;
}

/** Deep-clones the per-page item arrays so pages share no mutable state. */
function clonePageItems(page: PrintPage): PrintPage {
  return {
    ...page,
    viewports: page.viewports.map((v) => ({ ...v, positionOnPage: { ...v.positionOnPage } })),
    indexLists: page.indexLists.map((c) => ({ ...c, position: { ...c.position } })),
    titleBlocks: page.titleBlocks.map((c) => ({ ...c, position: { ...c.position } })),
  };
}

function loadFromStorage(): StoredState | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    const raw = JSON.parse(stored);
    if (raw.pages && Array.isArray(raw.pages) && raw.pages.length > 0) {
      return {
        pois: raw.pois ?? [],
        pages: raw.pages.map(normalizePage),
        activePageId: raw.activePageId ?? raw.pages[0].id,
      };
    }
    if (raw.layout) {
      const page = normalizePage(toPage(raw.layout, 0));
      return { pois: raw.pois ?? [], pages: [page], activePageId: page.id };
    }
  } catch (e) {
    console.error('Failed to load from localStorage:', e);
  }
  return null;
}

function getInitialState(): StoredState {
  const defaults = (): StoredState => {
    const page = normalizePage(toPage(initialLayout, 0));
    return { pois: mockPois, pages: [page], activePageId: page.id };
  };
  if (typeof window === 'undefined') return defaults();
  return loadFromStorage() ?? defaults();
}

interface MapContextType {
  pois: POI[];
  layout: PrintLayout;
  pages: PrintPage[];
  activePageId: string;
  activeViewportId: string | null;
  setPois: (pois: POI[]) => void;
  updatePoi: (id: string, updates: Partial<POI>) => void;
  togglePoiActive: (id: string) => void;
  addPoi: (poi: Omit<POI, 'id'>) => void;
  removePoi: (id: string) => void;
  updateLayout: (updates: Partial<PrintLayout>) => void;
  updateViewport: (id: string, updates: Partial<MapViewport>) => void;
  setActiveViewportId: (id: string | null) => void;
  addViewport: (viewport: MapViewport) => void;
  removeViewport: (id: string) => void;
  // Page management
  setActivePageId: (id: string) => void;
  addPage: () => void;
  removePage: (id: string) => void;
  renamePage: (id: string, name: string) => void;
  // Page-scoped mutations (used by the multi-page canvas)
  updatePage: (pageId: string, updates: Partial<PrintLayout>) => void;
  updatePageViewport: (pageId: string, viewportId: string, updates: Partial<MapViewport>) => void;
  addPageViewport: (pageId: string, viewport: MapViewport) => void;
  removePageViewport: (pageId: string, viewportId: string) => void;
  // Page-scoped index lists (multiple per page)
  addPageIndexList: (pageId: string, config: IndexListConfig) => void;
  updatePageIndexList: (pageId: string, indexId: string, updates: Partial<IndexListConfig>) => void;
  removePageIndexList: (pageId: string, indexId: string) => void;
  // Page-scoped title blocks
  addPageTitleBlock: (pageId: string, config: TitleBlockConfig) => void;
  updatePageTitleBlock: (pageId: string, blockId: string, updates: Partial<TitleBlockConfig>) => void;
  removePageTitleBlock: (pageId: string, blockId: string) => void;
}

const MapContext = createContext<MapContextType | undefined>(undefined);

export function MapProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StoredState>(getInitialState);
  const [activeViewportId, setActiveViewportId] = useState<string | null>(() => {
    const s = getInitialState();
    return s.pages.find((p) => p.id === s.activePageId)?.viewports[0]?.id ?? null;
  });

  const activePageIdRef = useRef<string>(getInitialState().activePageId);

  const { pois, pages, activePageId } = state;
  const layout = pages.find((p) => p.id === activePageId) ?? pages[0];

  useEffect(() => {
    activePageIdRef.current = activePageId;
  }, [activePageId]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ pois, pages, activePageId }));
  }, [pois, pages, activePageId]);

  const updatePage = useCallback((pageId: string, updates: Partial<PrintLayout>) => {
    setState((prev) => ({
      ...prev,
      pages: prev.pages.map((p) => (p.id === pageId ? { ...p, ...updates } : p)),
    }));
  }, []);

  const updatePoi = useCallback((id: string, updates: Partial<POI>) => {
    setState((prev) => ({ ...prev, pois: prev.pois.map((p) => (p.id === id ? { ...p, ...updates } : p)) }));
  }, []);

  const togglePoiActive = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      pois: prev.pois.map((p) => (p.id === id ? { ...p, active: !p.active } : p)),
    }));
  }, []);

  const addPoi = useCallback((poi: Omit<POI, 'id'>) => {
    setState((prev) => {
      const maxNum = Math.max(0, ...prev.pois.map((p) => p.customNumber || 0));
      const newPoi: POI = { ...poi, id: `poi-${Date.now()}`, customNumber: maxNum + 1 };
      return { ...prev, pois: [...prev.pois, newPoi] };
    });
  }, []);

  const removePoi = useCallback((id: string) => {
    setState((prev) => ({ ...prev, pois: prev.pois.filter((p) => p.id !== id) }));
  }, []);

  const setPois = useCallback((next: POI[]) => {
    setState((prev) => ({ ...prev, pois: next }));
  }, []);

  const updateLayout = useCallback(
    (updates: Partial<PrintLayout>) => updatePage(activePageId, updates),
    [activePageId, updatePage]
  );

  const updateViewport = useCallback(
    (id: string, updates: Partial<MapViewport>) => {
      updatePage(activePageId, {
        viewports: layout.viewports.map((vp) => (vp.id === id ? ensureGridBbox({ ...vp, ...updates }) : vp)),
      });
    },
    [activePageId, layout.viewports, updatePage]
  );
  const addViewport = useCallback(
    (viewport: MapViewport) => {
      updatePage(activePageId, { viewports: [...layout.viewports, ensureGridBbox(viewport)] });
    },
    [activePageId, layout.viewports, updatePage]
  );

  const removeViewport = useCallback(
    (id: string) => {
      updatePage(activePageId, { viewports: layout.viewports.filter((vp) => vp.id !== id) });
    },
    [activePageId, layout.viewports, updatePage]
  );

  const updatePageViewport = useCallback(
    (pageId: string, viewportId: string, updates: Partial<MapViewport>) => {
      setState((prev) => ({
        ...prev,
        pages: prev.pages.map((p) =>
          p.id === pageId
            ? { ...p, viewports: p.viewports.map((vp) => (vp.id === viewportId ? ensureGridBbox({ ...vp, ...updates }) : vp)) }
            : p
        ),
      }));
    },
    []
  );

  const addPageViewport = useCallback((pageId: string, viewport: MapViewport) => {
    setState((prev) => ({
      ...prev,
      pages: prev.pages.map((p) => (p.id === pageId ? { ...p, viewports: [...p.viewports, ensureGridBbox(viewport)] } : p)),
    }));
  }, []);

  const removePageViewport = useCallback((pageId: string, viewportId: string) => {
    setState((prev) => ({
      ...prev,
      pages: prev.pages.map((p) =>
        p.id === pageId ? { ...p, viewports: p.viewports.filter((vp) => vp.id !== viewportId) } : p
      ),
    }));
  }, []);

  const addPageIndexList = useCallback((pageId: string, config: IndexListConfig) => {
    setState((prev) => ({
      ...prev,
      pages: prev.pages.map((p) => (p.id === pageId ? { ...p, indexLists: [...p.indexLists, config] } : p)),
    }));
  }, []);

  const updatePageIndexList = useCallback((pageId: string, indexId: string, updates: Partial<IndexListConfig>) => {
    setState((prev) => ({
      ...prev,
      pages: prev.pages.map((p) =>
        p.id === pageId ? { ...p, indexLists: p.indexLists.map((c) => (c.id === indexId ? { ...c, ...updates } : c)) } : p
      ),
    }));
  }, []);

  const removePageIndexList = useCallback((pageId: string, indexId: string) => {
    setState((prev) => ({
      ...prev,
      pages: prev.pages.map((p) => (p.id === pageId ? { ...p, indexLists: p.indexLists.filter((c) => c.id !== indexId) } : p)),
    }));
  }, []);

  const addPageTitleBlock = useCallback((pageId: string, config: TitleBlockConfig) => {
    setState((prev) => ({
      ...prev,
      pages: prev.pages.map((p) => (p.id === pageId ? { ...p, titleBlocks: [...p.titleBlocks, config] } : p)),
    }));
  }, []);

  const updatePageTitleBlock = useCallback((pageId: string, blockId: string, updates: Partial<TitleBlockConfig>) => {
    setState((prev) => ({
      ...prev,
      pages: prev.pages.map((p) =>
        p.id === pageId ? { ...p, titleBlocks: p.titleBlocks.map((c) => (c.id === blockId ? { ...c, ...updates } : c)) } : p
      ),
    }));
  }, []);

  const removePageTitleBlock = useCallback((pageId: string, blockId: string) => {
    setState((prev) => ({
      ...prev,
      pages: prev.pages.map((p) => (p.id === pageId ? { ...p, titleBlocks: p.titleBlocks.filter((c) => c.id !== blockId) } : p)),
    }));
  }, []);

  const setActivePageId = useCallback((id: string) => {
    setState((prev) => (prev.activePageId === id ? prev : { ...prev, activePageId: id }));
    if (activePageIdRef.current !== id) setActiveViewportId(null);
  }, []);

  const addPage = useCallback(() => {
    setState((prev) => {
      const source = prev.pages.find((p) => p.id === prev.activePageId) ?? prev.pages[0];
      const newPage: PrintPage = {
        ...clonePageItems(source),
        id: `page-${Date.now()}`,
        name: `Page ${prev.pages.length + 1}`,
      };
      return { ...prev, pages: [...prev.pages, newPage], activePageId: newPage.id };
    });
    setActiveViewportId(null);
  }, []);

  const removePage = useCallback(
    (id: string) => {
      setState((prev) => {
        if (prev.pages.length <= 1) return prev;
        const remaining = prev.pages.filter((p) => p.id !== id);
        const nextActive = prev.activePageId === id ? remaining[0].id : prev.activePageId;
        return { ...prev, pages: remaining, activePageId: nextActive };
      });
    },
    []
  );

  const renamePage = useCallback(
    (id: string, name: string) => updatePage(id, { name }),
    [updatePage]
  );

  return (
    <MapContext.Provider
      value={{
        pois,
        layout,
        pages,
        activePageId,
        activeViewportId,
        setPois,
        updatePoi,
        togglePoiActive,
        addPoi,
        removePoi,
        updateLayout,
        updateViewport,
        setActiveViewportId,
        addViewport,
        removeViewport,
        setActivePageId,
        addPage,
        removePage,
        renamePage,
        updatePage,
        updatePageViewport,
        addPageViewport,
        removePageViewport,
        addPageIndexList,
        updatePageIndexList,
        removePageIndexList,
        addPageTitleBlock,
        updatePageTitleBlock,
        removePageTitleBlock,
      }}
    >
      {children}
    </MapContext.Provider>
  );
}

export function useMap() {
  const context = useContext(MapContext);
  if (context === undefined) {
    throw new Error('useMap must be used within a MapProvider');
  }
  return context;
}
