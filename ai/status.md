# Kart-eksporter - Implementation Status

## Summary of Completed Features

### Multi-Page Print Layout
- Multi-page canvas: add, rename, duplicate-from-current, and delete pages (page strip with live thumbnail previews). At least one page always remains.
- Pages are first-class: `PrintPage` extends `PrintLayout` with its own `id`/`name`; all viewports, index lists and title blocks are page-scoped.
- Page-level layout settings in the Inspector:
  * Paper color, page margins (top/right/bottom/left in mm), item spacing between frames (mm)
  * Snap-to-fold toggle: drag/resize snaps tiles to the 1/16 fold grid (fine 256-cell RGL grid underneath); snapping is tolerance-based (~4 mm) against page edges, the margin line and the fold lines, with free placement in between and overlapping frames allowed
  * Default title font (family/size/weight), default title background + text color
  * Index-list defaults: columns, border width/color, corner radius, background, title bar colors
- Custom page sizes (A4/A3/A2 + Custom with arbitrary mm dimensions, portrait/landscape).
- Paper view zoom controls (25%–400%), ⌘/Ctrl+scroll zoom-to-cursor, pan by dragging empty space, Space+drag pans anywhere, middle-drag pans.
- Toggleable dashed fold lines (half, quarter, eighth, sixteenth) and corner crop marks rendered on the canvas.
- Map frames stay inside the page margins: a custom margin/fold-aware RGL compactor clamps positions to the margin bounds, snap-aligned to the fold grid, and pushes colliding tiles straight down — fixing the old `verticalCompactor` bug that pulled the top-most frame to y=0 and shifted other frames on resize. Frames resize from all four corners (se/sw/ne/nw handles).
- Map frame title bars show a real-world grid-scale indicator (e.g. "Grid = 200 km × 200 km") whenever the grid is enabled, computed from the viewport spacing or the auto-spacing heuristic; the indicator can be hidden per-viewport ("Grid size indicator" toggle, editor + PDF).

### Map Frames (Viewports)
- Add Map Frame; each frame is independently draggable, resizable, rotatable (0/90/180/270°) and deletable (hover trash icon).
- Per-frame appearance: title on/off, title bar background fill + color, title text color, per-frame title font override, rounded corners + radius, border width/color, background color.
- Frame zoom in/out buttons on hover; "Map view" (center lng/lat + zoom) editable numerically; "Fit to POIs" in the Map Editor.
- Live non-interactive preview tiles (`PrintMapMini`) that fit exactly to the stored print bbox so the grid overlay aligns with the raster.

### Grid & Cartographic Border
- Real-world unit grid (replaces the old fixed 4×4 overlay): auto-spaced (target ≈6 cells across the longest dimension) or explicit spacing from 100 m to 100 km.
- Per-viewport grid color, line width (mm) and opacity.
- Cartographic border frame with:
  * Border frame on/off, border ticks on/off (ticks one per grid line)
  * Coordinate labels on major ticks (hidden when grid refs are shown)
  * Alternating two-color frame (cartographic band) with corner squares and optional inner+outer outline lines
  * Grid reference labels at the map edges (letters A… / numbers 1… along the frame)
- Grid reference computation: every POI inside a grid-enabled viewport gets a cell ref (e.g. "B3"), shown in index lists with dotted leader lines ("12. Fushimi Inari — B3"). Detail maps win over overview maps (highest zoom).
- Inset (mini-locator) support: an overview map can outline any smaller maps whose bboxes fall inside it, with optional dashed outline, color/width and labels.
- `GridOverlay` is a vector SVG overlay shared by the layout canvas, the Map Editor and the export preview, so all three stay consistent.

### Index Lists (Legends)
- Multiple independent index tiles per page, each draggable/resizable/rotatable/deletable.
- Per-tile scope: "All" POIs, or scoped to specific viewports (with live per-map POI counts).
- Sort by number / name / category / city / region, asc/desc; group by none / category / map (the viewport the POI appears on).
- Multi-column layout (1–6), category order reordering, category symbols (Lucide icons) on/off, category header underline.
- Full typography control per tile (with fallback to page defaults): title bar (bg/text color, font, size, weight), body text (family/size/weight/color), category headers (color, font, underline).

### Title Blocks
- Standalone title/subtitle blocks, draggable/resizable/rotatable, with alignment (left/center/right), font family/size/weight, text color, background and border.

### Map Editor (PrintMap.tsx)
- Tabs: Print Layout / Map Editor. Map Editor shows the active viewport's map.
- Color Modes: Pure B&W / Grayscale / Spot Color.
- Layer visibility toggles: Roads, Buildings, Water, Parks.
- Granular styling per layer: Roads (color, width, opacity), Buildings (fill, outline, opacity), Water (color, opacity), Parks (color, opacity), Land (color).
- Grid toggle, grid width/opacity presets; zoom in/out; fit to POIs.
- All styling is per-viewport (`layers` override map) and is applied to the editor, the layout mini tiles AND the PDF export so everything stays in sync.

### POI Management (Sidebar)
- Import file: GeoJSON / JSON and CSV (parsed via custom parsers); numbering continues from the highest existing number.
- Paste JSON/CSV bulk import.
- NOTE: the file picker advertises `.kml` but no KML parser is wired up yet (`@tmcw/togeojson` is installed but unused).
- Search, filter by region/city, category and recommender; sort by number/name/category/region.
- Renumber POIs (sequential 1..N), add POI dialog, edit POI dialog (number, name, category, city/region, lat/lng, recommender, notes, active), per-POI visibility checkbox, category icons in the list.

### Export Engine (ExportDialog + exportPdf.ts + vectorMap.ts)
- jsPDF export of all pages at exact physical sizes (mm), 300 DPI target.
- Map frames are exported as pure vector geometry: OpenFreeMap vector tiles are fetched at the MapLibre-effective zoom per viewport, decoded (PBF), and drawn directly into the PDF with jsPDF path/fill/stroke operators — no MapLibre render pass and no bitmaps. The renderer skips the MapLibre render pipeline entirely.
- Map extent fidelity matches MapLibre exactly: bbox viewports use MapLibre's `fitBounds` zoom formula and center/zoom viewports use `vp.zoom` at 512px world tiles; the extent covers the rotated-camera bounding box so rotated frames stay filled; tiles capped at 128 (`MAX_TILES`), zooming out until the count fits.
- Map renderer (`drawVectorMapPdf`) handles land/water/parks/building fills (even-odd, one `fillEvenOdd` per style bucket so adjacent tiles blend), road strokes with round caps/joins and MapLibre-style widths (CSS px → mm); layer colors/widths/opacity come from `MapLayerStyle` overrides with `DEFAULT_LAYER_STYLE` fallbacks; POI badges are drawn as white-ring/spot-color circles matching the editor layer.
- Frame clipping: each map frame is clipped via `rect(..., null)` + `clip()` + `discardPath()` which emits `re W n` in the content stream. (jsPDF `rect` with an undefined style emits `re S`, which consumes the path and leaves `clip()` drawing on an empty path — the fix passes `null` and discards the path afterwards.)
- POI badges are filtered to each viewport's visible geographic extent before drawing, so only POIs actually inside a map render badges (no far-out badges at large negative coordinates).
- Overlapping POI badges are spiderified apart (`spiderify.ts` shared algorithm): points closer than a min distance form connected clusters, members are spread on a ring around the cluster centroid (second ring for big clusters) with gray leader lines to the centroid. Ring spacing enforces a guaranteed inter-badge gap (inner/outer ring clearance) and clusters are separated as rigid discs so members never collide across clusters. Deterministic and scale-invariant, so the PDF, the canvas thumbnails and the MapLibre preview all produce the same layout. Spiderification can be disabled per-viewport ("Spiderify overlapping markers" toggle).
- If the tile fetch/decode fails for a viewport, it falls back to the raster path (`renderViewportImage` → 300-DPI PNG), so export never breaks. A render-mode toggle (Vector / Raster) in the export dialog lets users force the MapLibre 300-DPI raster pass instead.
- Raster timeout robustness: MapLibre's `idle` is rAF-driven, so a throttled/background tab can stall the raster pass. On the 25 s timeout the code now captures the canvas before teardown (previously `cleanup()` removed the canvas first, so the capture always came back empty), paints a last-chance synchronous `map.redraw()`, and only uses the capture when `map.isStyleLoaded()` — otherwise it rejects so the vector fallback produces a real map instead of a blank/black area. Verified: a raster export in a hidden tab now yields the same full vector-map PDF as the vector mode instead of a blank page.
- Grid lines, cartographic border (ticks, coordinate labels, alternating frame, grid refs), inset outlines, index lists and title blocks are drawn as true vector geometry/text in the PDF.
- Crop marks and paper color per page; multi-page PDF.
- Export Preview modal with mm-accurate page previews, vector map thumbnails (rendered from the same decoded tiles to canvas at 5 px/mm), Fit / 50% / 100% zoom (fit respects both width and height via ResizeObserver), "Rendering N map frames as vector/raster…" progress and a Download PDF button (auto-download when invoked from the Export PDF toolbar button).
- PDF download works in Safari and Chrome: the `data:` URL is decoded to a Blob directly in JS (`atob` → `Uint8Array`, no `fetch`, which Safari rejects on large data URLs) and exposed as a Blob URL on an anchor appended to the document before clicking.
- Preview grid overlay fixes: `GridOverlay` measures its layout box (`clientWidth`/`clientHeight`) instead of `getBoundingClientRect()`, so the grid/border/insets stay aligned with the map thumbnail even though the preview wraps the page in `transform: scale(...)` (the visual rect shrinks with the zoom and previously squeezed the overlay into the upper-left corner).

### Persistence
- All state (POIs, pages, active page, viewports, index lists, title blocks, layout settings) persists to localStorage (`kart-eksporter-state`), with migration of legacy single-page/single-index state.

## Core Architecture
- Framework: Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS v4.
- Global State: `MapContext.tsx` — localStorage-persisted state for POIs, pages, active page, viewports, index lists, title blocks.
- Types: `types/index.ts` — `POI`, `MapViewport`, `IndexListConfig`, `TitleBlockConfig`, `PrintLayout`, `PrintPage`, `MapLayerStyle`, etc.
- Mock Data: `data/mockPois.ts` — 20 Japan POIs with an initial A4-landscape 3-map layout.
- Map rendering: MapLibre GL JS with a custom monochrome print style over OpenFreeMap vector tiles (proper layer IDs for programmatic control), vendored worker in `public/`.

### Components
| Component | Purpose |
|---|---|
| Sidebar.tsx | POI import/paste, filters, sorting, renumber, add/edit dialogs, list with icons + numbers |
| Toolbar.tsx | Page size/orientation (incl. Custom), spot color, grid toggle, Preview + Export PDF |
| CanvasArea.tsx | Print Layout / Map Editor tabs |
| LayoutCanvas.tsx | Multi-page canvas, PageStrip, Inspector (Page/Viewport/IndexList/TitleBlock properties), fold lines, pan/zoom |
| PrintMapFrame.tsx / PrintMapMini.tsx | Layout frame chrome + non-interactive bbox-fitted preview tile |
| PrintMap.tsx | Full Map Editor with color mode, layer toggles, per-layer styling, grid controls |
| GridOverlay.tsx | Vector grid + cartographic border + grid refs + insets (SVG) |
| IndexList.tsx / IndexListFrame.tsx / IndexListFrameWrapper.tsx | Index tiles with grid refs, category groups, multi-column layout |
| TitleBlockFrame.tsx | Standalone title/subtitle block |
| ExportDialog.tsx | mm-accurate preview + PDF download |
| ColorPicker.tsx, ui/* | Shared controls |

### Lib
| File | Purpose |
|---|---|
| mapStyle.ts | Print vector style, POI badge layers, layer-style overrides, bbox helpers, grid ref computation |
| grid.ts | Real-world unit grid geometry, cartographic border, alternating frame segments, inset rects, grid-ref labels |
| indexStyle.ts | Index config resolution, grouping, column distribution, scoping |
| exportPdf.ts | 300-DPI PDF composition (vector maps + vector grid/index/title; raster fallback) |
| vectorMap.ts | Vector tile fetch/decode (PBF), MapLibre camera math (fitBounds zoom, mercator extent), tile batching (max 128), PDF vector map drawing, POI badge drawing + spiderification, canvas thumbnail render |
| spiderify.ts | Shared deterministic cluster → ring spread + leader-line algorithm for overlapping POI badges (used by PDF, thumbnails and MapLibre) |
| titleFonts.ts, units.ts, geo.ts, maplibreWorker.ts | Font mapping, mm/px conversions, geo math, worker setup |

## Build / Lint
- `npm run build` — passes (Next.js 16 / Turbopack).
- `npx tsc --noEmit` — passes with no errors.
- `npm run lint` — 0 errors, ~1085 warnings. Nearly all come from the vendored `public/maplibre-gl-shared.mjs` / `maplibre-gl-worker.mjs` bundles (pre-minified); the rest are a handful of `react-hooks/exhaustive-deps` and one `@next/next/no-img-element` in source.

## Key Features Working
- ✅ Multi-page documents (add/rename/duplicate/delete, page thumbnails)
- ✅ Drag / resize / rotate map frames, index lists and title blocks (tolerance-based snap to page edges / margin / fold grid with free overlap); frames clamp to page margins via the compactor and resize from all four corners
- ✅ Paper zoom (25–400%), pan, fold lines, crop marks
- ✅ Grid-scale indicator in map frame title bars (e.g. "Grid = 200 km × 200 km"), per-viewport toggle (editor + PDF)
- ✅ Real-world unit grid with auto/explicit spacing
- ✅ Cartographic border: ticks, coordinate labels, alternating two-color frame, outline
- ✅ Grid references (A1, B2…) at map edges + per-POI refs in index lists
- ✅ Inset outlines (mini-locator) on overview maps
- ✅ Layer toggles + per-layer styling applied consistently (editor / layout / export)
- ✅ Color modes: Pure B&W / Grayscale / Spot Color
- ✅ POI import (GeoJSON/CSV) + paste, filters, renumber, add/edit dialogs
- ✅ PDF export (300 DPI, exact mm, multi-page) with fully vector maps (OpenFreeMap tiles drawn directly as PDF paths) + vector grid/index/title + preview modal
- ✅ Map frames clipped correctly (`re W n` clip sequences verified in the PDF content stream); vector maps verified north-up with correct land/sea by geographic spot-checks
- ✅ POI badges limited to each viewport's extent (Tokyo/Kyoto detail maps draw only their own POIs)
- ✅ Spiderification of overlapping POI badges (ring spread + leader lines, guaranteed min badge gap via ring clearance + rigid-cluster separation) in the PDF, the preview thumbnails and the MapLibre editor; per-viewport toggle; verified in the PDF content stream (gray `0.4 G` legs at 0.2 mm + ring positions) and via unit tests (0 bad pairs across dense/mixed cluster scenarios)
- ✅ Raster render mode toggle: force the MapLibre 300-DPI image pass (3 embedded Image XObjects verified in a visible tab) instead of the vector renderer; background-tab raster exports fall back to vector instead of producing blank maps
- ✅ localStorage persistence with legacy-state migration

## Current Gaps / Next Development Areas
- KML import: file picker accepts `.kml` but no parser is wired (`@tmcw/togeojson` is installed, unused).
- Vector map export still fetches tiles from the OpenFreeMap network at export time (needs connectivity); per-viewport raster fallback covers fetch/decode failures, but a fully offline export is not implemented.
- The vector renderer is a simplified basemap (no terrain, hillshading, symbol labels or pattern fills).
- No print-scale indicator / exact DPI readout in the export dialog yet (mm preview exists; the frame title-bar grid indicator covers map scale).
