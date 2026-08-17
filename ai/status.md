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
- Place names: per-viewport master toggle plus 8 styleable tiers — Country, City, Town, Village, Suburb, Island, Water names, Road names (all off by default). Each tier: visibility, color, text size (mm, country/city/town scaled by OpenMapTiles `rank`), bold, italic (island/water), uppercase (country), halo color + width. Applied to the MapLibre editor style (8 symbol layers inserted below the POI layers) AND to the PDF (same MapLibre render, WYSIWYG).
- On-screen readability fix: the editor/layout preview renders at half physical scale (`mm × 2` CSS px), which made print-sized labels invisible in the editor — Tokyo wards are `place`/`city` features with rank 11–13 that clamped to the 3.9 px minimum. `createPrintStyle`/`applyLayerStyleOverrides` now take a `labelScale`; the editor + layout mini tiles pass `EDITOR_LABEL_SCALE = 2` (doubling on-screen text while preserving the tier hierarchy). The PDF now renders through the layout at `EDITOR_LABEL_SCALE` too (WYSIWYG — labels print ~2× their mm value, accepted tradeoff). All 8 label layers also set `symbol-sort-key` so settlements (country/city/town/…) win collision placement over island/water/road instead of the reverse (water previously placed first).
- Road names fixed: OMT publishes road names on the separate `transportation_name` source-layer (minzoom 6), not `transportation`, which has no `name` fields — the style `road-name` symbol layer reads `transportation_name`. Street (residential) names included by adding the `minor` class to `ROAD_NAME_CLASSES`; at high zoom the fine-grained classes are also labeled: `service` (alleys/service roads), `path` (pedestrian streets, arcades, footways) and `track` (unpaved tracks) — verified: `transportation_name` at the z14 data that a z17 viewport overzooms carries 375 named `path` + 13 named `service` + 166 named `minor` features around the Tokyo viewport, all now allowed through the style filter (57 unit checks). Per-tier size now shown inline in each `PlaceTierRow` (previously only under the "more options" chevron).
- Local vs English names: new `PlaceNamesConfig.lang` (`'local'` = `name`, `'english'` = `name:en` → `name_en` → `name:latin` → `name` fallback chain). Applies to editor/export styles via the `text-field` expression set by `applyLayerStyleOverrides` (maplibre re-layouts symbols on `text-field` change) and to the vector extraction via `nameOf` — verified on real tiles: 189/202 Tokyo + 192/201 Kyoto road features romanize. Roads without a translation (e.g. some trunk streets) stay in local script. UI: "Language" select in the Place names card.
- UI: the map-editor inspector card is pinned (`top-4 bottom-4`) with `CardContent` as the scroll area (`min-h-0 overflow-y-auto`) so the full layer/place-name control list stays reachable — previously it overflowed the viewport with no scrollbar.
- Grid toggle, grid width/opacity presets; zoom in/out; fit to POIs.
- All styling is per-viewport (`layers` override map) and is applied to the editor, the layout mini tiles AND the PDF export so everything stays in sync.

### POI Management (Sidebar)
- Import file: GeoJSON / JSON and CSV (parsed via custom parsers); numbering continues from the highest existing number.
- Paste JSON/CSV bulk import.
- NOTE: the file picker advertises `.kml` but no KML parser is wired up yet (`@tmcw/togeojson` is installed but unused).
- Search, filter by region/city, category and recommender; sort by number/name/category/region.
- Renumber POIs (sequential 1..N), add POI dialog, edit POI dialog (number, name, category, city/region, lat/lng, recommender, notes, active), per-POI visibility checkbox, category icons in the list.

### Export Engine (ExportDialog + exportPdf.ts + viewportMap.ts)
- jsPDF export of all pages at exact physical sizes (mm), 300 DPI target.
- **WYSIWYG**: every map frame is an offscreen MapLibre render that reuses exactly the layout tiles' setup — `createViewportMap` (shared helper in `src/lib/viewportMap.ts`) builds the map, style, bearing, POI layer and bbox fit for BOTH the layout `PrintMapMini` previews and the PDF render, so the print can no longer drift from what the layout shows.
- Render is at `EDITOR_LABEL_SCALE` (2×), the same on-screen label size the layout tiles use, captured at 300 DPI (`pixelRatio = EXPORT_DPI / (CSS_PX_PER_MM · 25.4)` ≈ 5.9 on a 2px/mm container) then embedded in the PDF at the frame's mm size. POI badges are baked into the raster (same `addPoiLayer` as the preview). Labels/roads in the printed PDF therefore look exactly like the Design tab (~2× the physical mm value) — a deliberate WYSIWYG tradeoff.
- **The vector renderer is gone.** The old separate path (`fetchViewportMap` / `buildVectorMapRenderData` / `drawVectorMapPdf` / `drawPoiBadgesPdf` / `renderMapThumbnail`) was removed from the export flow and the Vector/Raster dialog toggle deleted. `exportLayout` always renders through the shared viewport map; there is one render path, so a "doesn't match the layout" mismatch can't recur.
- Frame clipping: each map frame is clipped via `rect(..., null)` + `clip()` + `discardPath()` which emits `re W n` in the content stream. (jsPDF `rect` with an undefined style emits `re S`, which consumes the path and leaves `clip()` drawing on an empty path — the fix passes `null` and discards the path afterwards.)
- POI badges come from the same `addPoiLayer` the layout tiles use, so the printed markers (including spiderified clusters via the shared `spiderify.ts` algorithm — ring spread + leader lines with a guaranteed inter-badge gap) match the preview exactly. Badges are drawn by MapLibre into the frame raster.
- Raster timeout robustness: MapLibre's `idle` is rAF-driven, so a throttled/background tab can stall the render. On the 25 s timeout the code captures the canvas before teardown (previously `cleanup()` removed the canvas first, so the capture always came back empty), paints a last-chance synchronous `map.redraw()`, and only uses the capture when `map.isStyleLoaded()` — otherwise it rejects (the dialog shows a clear error; there is no divergent fallback anymore). Verified: a render in a hidden tab yields the same full map as a visible tab instead of a blank page.
- Grid lines, cartographic border (ticks, coordinate labels, alternating frame, grid refs), inset outlines, index lists and title blocks are drawn as true vector geometry/text in the PDF.
- Crop marks and paper color per page; multi-page PDF.
- Export Preview modal with mm-accurate page previews (rendered from the same `images` the PDF embeds), Fit / 50% / 100% zoom (fit respects both width and height via ResizeObserver), "Rendering N map frames…" progress and a Download PDF button (auto-download when invoked from the Export PDF toolbar button).
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
| mapStyle.ts | Print vector style, POI badge layers, place-name label layers (8 tiers, rank-scaled sizes), layer-style overrides, bbox helpers, grid ref computation |
| grid.ts | Real-world unit grid geometry, cartographic border, alternating frame segments, inset rects, grid-ref labels |
| indexStyle.ts | Index config resolution, grouping, column distribution, scoping |
| exportPdf.ts | 300-DPI WYSIWYG PDF composition: every frame rendered through the shared viewport-map setup at EDITOR_LABEL_SCALE, plus vector grid/index/title drawing |
| vectorMap.ts | Legacy vector-tile renderer — removed from the export flow; only `hexToRgb` is still imported by exportPdf |
| viewportMap.ts | Shared viewport-map construction (style, bearing, POIs, layer overrides, bbox fit) used by both the layout tiles and the PDF render so the print can't drift from the layout |
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
- ✅ PDF export (300 DPI, exact mm, multi-page) with WYSIWYG map frames (same `createViewportMap` setup as the layout tiles, EDITOR_LABEL_SCALE labels) + vector grid/index/title + preview modal
- ✅ Map frames clipped correctly (`re W n` clip sequences verified in the PDF content stream); map frames verified north-up with correct land/sea by geographic spot-checks
- ✅ Rotated (90/180/270°) map frames, index tiles and title blocks render correctly in the layout view, the export preview and the PDF (footprint-based sizing + `shrink-0` on tile frames; single rotation `cm` transform verified in the PDF stream). The PDF rotation direction now matches the preview's clockwise `rotate()`: `withRotation` builds the matrix as `[c, -sinθ, sinθ, c]` (jsPDF flips API y-down coords on output) with e/f recomputed for that sign — verified by the rotated index text reading top-to-bottom (`dir = (0,1)`) and by pixel correlation of the index tile (0.48 at 0°, -0.04 flipped) between the PDF render and the browser layout.
- ✅ Rounded index-tile corners clip the body content in the PDF: the full-tile rounded-rect path (`c` corner arcs + `h` close) + `W n` clip wraps all body content (icons, categories, rows, dotted leaders) before the matching `Q` restore — verified in the PDF content stream
- ✅ Rounded map-frame corners clip the map content in the PDF: the map body (and the rotated grid/insets overlay) is wrapped in a `clipToMapBody` rounded-bottom path (`c` corner arcs + `W n`), while the frame border/background keep `roundedRect` on all four corners — verified pixel-wise (rounded frame cuts the corner, square frame keeps the border through the corner, no tile content pokes past the radius)
- ✅ Title-block PDF text is now stacked with mm-based line heights (title `fsMm × 1.2`, subtitle `0.6 ×` at 0.6× size, group vertically centered) instead of the old pt/`0.55`-factor mix that crammed the two lines together; subtitle no longer uppercased
- ✅ Place names: 8 styleable tiers (country/city/town/village/suburb/island/water/road) with master toggle, off by default; rank-scaled sizes for country/city/town, bold/italic/uppercase per tier, halos; rendered in the MapLibre editor (8 symbol layers), the layout preview, the raster export and the vector PDF (halo via `fillThenStroke`, road names rotated along their segment, greedy collision placement shared by PDF + thumbnails); on-screen labels doubled via `EDITOR_LABEL_SCALE` (export stays physical) and `symbol-sort-key` biases collision placement toward settlements — verified by `validateStyleMin`, unit tests (style/layout/extraction/PDF text/scale/sort-key/rank-clamp) and clean tsc/eslint. Road names read from the `transportation_name` source-layer (transportation has no `name`), street names via the `minor` road class, and a `lang: 'local' | 'english'` toggle switches label text to `name:en`/`name_en`/`name:latin` with `name` fallback — 53 unit checks incl. `transportation_name` targeting, `minor` extraction, english/local road names and no-road-labels-from-transportation; tsc clean, eslint 0 errors; real-tile extraction confirms Tokyo roads romanize (Basha-dori, Route 1 Ueno Line, …)
- ✅ POI badges limited to each viewport's extent (Tokyo/Kyoto detail maps draw only their own POIs)
- ✅ Spiderification of overlapping POI badges (ring spread + leader lines, guaranteed min badge gap via ring clearance + rigid-cluster separation) in the MapLibre editor/preview and the PDF render; per-viewport toggle; verified in the PDF content stream (gray `0.4 G` legs at 0.2 mm + ring positions) and via unit tests (0 bad pairs across dense/mixed cluster scenarios)
- ✅ WYSIWYG export: single render path through the shared `createViewportMap` at EDITOR_LABEL_SCALE / 300 DPI, so the PDF matches the Design tab (labels ~2× their mm value); background-tab renders capture partial maps after the 25 s timeout instead of producing blanks; the Vector/Raster dialog toggle and the old vector renderer are removed
- ✅ localStorage persistence with legacy-state migration

## Current Gaps / Next Development Areas
- KML import: file picker accepts `.kml` but no parser is wired (`@tmcw/togeojson` is installed, unused).
- Map export fetches tiles from the OpenFreeMap network at render time (needs connectivity); there is no offline fallback since the vector tile renderer was removed.
- The basemap is minimal stylistically (no terrain, hillshading or pattern fills), drawn at 300 DPI via MapLibre rather than vector geometry.
- No print-scale indicator / exact DPI readout in the export dialog yet (mm preview exists; the frame title-bar grid indicator covers map scale).
- Rotating a tile that is wider (unrotated) than the page is tall (e.g. a 285 mm-wide index band rotated 90° on A4 landscape, 210 mm tall) produces a portrait tile taller than the page; it is faithfully rendered (centered on the rotated footprint center) and therefore overflows the bottom edge in both the layout editor and the PDF export. Kept as-is by decision — no clamping/scaling.
- In the layout editor only (not the PDF), a title block that overlaps a map frame can paint underneath it: react-grid-layout paints later grid items on top, but the map frame's own stacking context can still win, so the map (e.g. a red title bar) shows over the title block. The PDF export draws title blocks after viewports and renders correctly; this is a preview-only z-order cosmetic quirk.
