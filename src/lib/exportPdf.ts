'use client';

import { jsPDF, GState } from 'jspdf';
import { PrintLayout, PrintPage, POI, MapViewport, ColorMode, IndexListConfig, TitleBlockConfig, Rect, MapLayerStyle } from '@/types';
import { computeGridRefs, insetViewports, EDITOR_LABEL_SCALE } from './mapStyle';
import { createViewportMap, applyViewportStyle } from './viewportMap';
import { ensureMapWorker } from './maplibreWorker';
import { titleFontPdf } from './titleFonts';
import { preloadLayoutFonts } from './placeNameFonts';
import { resolveIndexConfig, buildIndexGroups, distributeGroups, scopePois } from './indexStyle';
import { indexIconFor, drawIndexIcon } from './indexIcons';
import { footprintDims, TITLE_BAR_MM } from './units';
import { autoGridSpacing, spacingLabel, buildGridGeometry, buildBorder, bboxToFrameRect, buildBorderFrameSegments, buildGridRefLabels, buildInsetRect } from './grid';
import { hexToRgb, drawPoiLabelsPdf } from './vectorMap';

ensureMapWorker();

const CSS_PX_PER_MM = 2;
const EXPORT_DPI = 300;

export interface ExportResult {
  pdfDataUrl: string;
  images: Record<string, string>;
  pages: PrintPage[];
}

export function pageSizeMm(layout: PrintLayout) {
  if (layout.pageSize === 'Custom') {
    return [Math.max(50, layout.customPageSize?.width ?? 210), Math.max(50, layout.customPageSize?.height ?? 297)];
  }
  const sizes = {
    A4: [210, 297],
    A3: [297, 420],
    A2: [420, 594],
  } as const;
  const [w, h] = sizes[layout.pageSize] ?? sizes.A4;
  return layout.orientation === 'landscape' ? [h, w] : [w, h];
}

/**
 * The map-body box (mm) inside a frame, shared by the layout tile, the export
 * preview and the PDF so the map is inset by the frame border exactly like the
 * on-screen layout. The layout renders the mini tile inside the frame's content
 * box (border-box, so the border is `bw` on each side) and below the title bar;
 * the export must place the raster at that same inset box or the rounded
 * corners / edges will not match the layout.
 */
function mapBodyBox(vp: MapViewport, itemSpacing = 0) {
  const border = vp.borderWidth ?? 0.1;
  const title = vp.showTitle !== false ? (vp.titleBarHeight ?? TITLE_BAR_MM) : 0;
  const fp = footprintDims(vp.rotation, vp.positionOnPage.width, vp.positionOnPage.height);
  const pad = itemSpacing / 2;
  const bw = Math.max(1, fp.w - pad * 2);
  const bh = Math.max(1, fp.h - pad * 2);
  return {
    x: border,
    y: (title ? border + title : border),
    w: Math.max(1, bw - border * 2),
    h: Math.max(1, bh - title - border * 2),
  };
}

/** Size of the map-body box used as the offscreen render canvas. */
function mapAreaSize(vp: MapViewport, itemSpacing = 0) {
  const b = mapBodyBox(vp, itemSpacing);
  return { w: b.w, h: b.h };
}

/**
 * Path data for a rect whose two bottom corners are rounded by `r` (top corners
 * stay square). Consumed by jsPDF's `doc.path()`, then clipped with `clip()`.
 */
function roundedBottomPath(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(Math.max(0, r), w / 2, h);
  if (rr <= 0) {
    return [
      { op: 'm', c: [x, y] },
      { op: 'l', c: [x + w, y] },
      { op: 'l', c: [x + w, y + h] },
      { op: 'l', c: [x, y + h] },
      { op: 'h', c: [] },
    ];
  }
  const k = 0.5523 * rr;
  return [
    { op: 'm', c: [x, y] },
    { op: 'l', c: [x + w, y] },
    { op: 'l', c: [x + w, y + h - rr] },
    { op: 'c', c: [x + w, y + h - rr + k, x + w - rr + k, y + h, x + w - rr, y + h] },
    { op: 'l', c: [x + rr, y + h] },
    { op: 'c', c: [x + rr - k, y + h, x, y + h - rr + k, x, y + h - rr] },
    { op: 'l', c: [x, y] },
    { op: 'h', c: [] },
  ];
}

/**
 * Path data for a rect whose two top corners are rounded by `r` (bottom corners
 * stay square). Used to fill the (border-inset) title bar with corners that
 * match the frame's outer radius.
 */
function roundedTopPath(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(Math.max(0, r), w / 2, h);
  if (rr <= 0) {
    return [
      { op: 'm', c: [x, y + h] },
      { op: 'l', c: [x, y] },
      { op: 'l', c: [x + w, y] },
      { op: 'l', c: [x + w, y + h] },
      { op: 'h', c: [] },
    ];
  }
  const k = 0.5523 * rr;
  return [
    { op: 'm', c: [x, y + h] },
    { op: 'l', c: [x, y + rr] },
    { op: 'c', c: [x, y + rr - k, x + rr - k, y, x + rr, y] },
    { op: 'l', c: [x + w - rr, y] },
    { op: 'c', c: [x + w - rr + k, y, x + w, y + rr - k, x + w, y + rr] },
    { op: 'l', c: [x + w, y + h] },
    { op: 'h', c: [] },
  ];
}

/** Clips the current graphics state to the map body area, rounding the bottom corners when `radius > 0`. */
function clipToMapBody(doc: jsPDF, x: number, y: number, w: number, h: number, radius: number) {
  doc.saveGraphicsState();
  if (radius > 0) {
    doc.path(roundedBottomPath(x, y, w, h, radius));
  } else {
    doc.rect(x, y, w, h, null);
  }
  doc.clip();
  doc.discardPath();
}

/**
 * Applies a 90°-step rotation around (cx, cy) in mm for the duration of `draw`.
 *
 * Positive angles rotate clockwise on screen (matching CSS `rotate()` and the
 * layout/preview). The transform is built in PDF y-up space: jsPDF flips API
 * y-down coordinates when writing them, so the clockwise rotation about a point
 * maps to the matrix [c, -sinθ, sinθ, c] with translation
 * e = px - c·px - sinθ·py, f = py + sinθ·px - c·py.
 */
function withRotation(doc: jsPDF, angle: number | undefined, cx: number, cy: number, draw: () => void) {
  if (!angle || angle % 360 === 0) {
    draw();
    return;
  }
  const s = doc.internal.scaleFactor;
  const H = doc.internal.pageSize.getHeight();
  const px = cx * s;
  const py = (H - cy) * s;
  const rad = (angle * Math.PI) / 180;
  const c = Math.cos(rad);
  const sn = Math.sin(rad);
  doc.saveGraphicsState();
  doc.setCurrentTransformationMatrix(doc.Matrix(c, -sn, sn, c, px - c * px - sn * py, py + sn * px - c * py));
  draw();
  doc.restoreGraphicsState();
}

function renderViewportImage(
  vp: MapViewport,
  pois: POI[],
  colorMode: ColorMode,
  spotColor: string,
  itemSpacing = 0,
  glyphsUrl?: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const { w: mmW, h: mmH } = mapAreaSize(vp, itemSpacing);
    const targetPixelRatio = EXPORT_DPI / (CSS_PX_PER_MM * 25.4);

    // Create the off-screen container at the editor's approximate pixel width
    // so that fitBounds computes the same zoom level as the on-screen editor.
    // This ensures the same detailed vector tiles (small roads, buildings,
    // etc.) are fetched.  The captured canvas is then drawn into the PDF at
    // the correct print dimensions, with jsPDF scaling the image.
    const EDITOR_APPROX_WIDTH = 1000;
    const aspect = mmW / Math.max(0.1, mmH);
    const cssW = EDITOR_APPROX_WIDTH;
    const cssH = Math.max(2, Math.round(EDITOR_APPROX_WIDTH / aspect));

    const container = document.createElement('div');
    container.style.cssText = `position:fixed;left:-10000px;top:0;width:${cssW}px;height:${cssH}px;`;
    document.body.appendChild(container);

    const map = createViewportMap(container, { viewport: vp, labelScale: EDITOR_LABEL_SCALE, pixelRatio: targetPixelRatio, glyphsUrl });

    const timeout = window.setTimeout(() => {
      // 'idle' is rAF-driven, so in a throttled/background tab it may never fire.
      // If the style loaded, redraw() paints whatever tiles are ready synchronously
      // so we can capture a partial map instead of waiting forever. If the style
      // never loaded (e.g. throttled tab), the canvas is empty/black — reject.
      let url = '';
      if (map.isStyleLoaded()) {
        const canvas = container.querySelector('canvas');
        if (canvas) {
          try {
            map.redraw();
          } catch {
            // ignore
          }
          // Capture before cleanup() — cleanup() removes the canvas from the DOM.
          url = canvas.toDataURL('image/png');
        }
      }
      cleanup();
      if (url) {
        resolve(url);
      } else {
        reject(new Error('map style not ready after timeout'));
      }
    }, 25000);

    function cleanup() {
      window.clearTimeout(timeout);
      try {
        map.remove();
      } catch {
        // ignore
      }
      container.remove();
    }

    const finish = () => {
      window.setTimeout(() => {
        const canvas = container.querySelector('canvas');
        if (!canvas) {
          cleanup();
          reject(new Error('no canvas'));
          return;
        }
        const url = canvas.toDataURL('image/png');
        cleanup();
        resolve(url);
      }, 500);
    };

    map.on('error', (e) => {
      // Tile errors are non-fatal; keep waiting for other tiles.
      void e;
    });

    // Apply POIs, layer overrides and the bbox fit once the style is applied,
    // then capture after the map reaches idle (first full render).
    const ready = () => {
      applyViewportStyle(map, { viewport: vp, pois, colorMode, spotColor, labelScale: EDITOR_LABEL_SCALE });
      map.once('idle', finish);
    };
    if (map.isStyleLoaded()) {
      ready();
    } else {
      map.once('style.load', ready);
    }
  });
}

interface IndexColumn {
  category: string;
  items: POI[];
  continued?: boolean;
}

function titleFontForPage(page: PrintLayout, override?: { family?: string; size?: number; weight?: PrintLayout['titleFontWeight'] }) {
  const family = override?.family ?? page.titleFontFamily;
  const size = override?.size ?? page.titleFontSize ?? 3;
  const weight = override?.weight ?? page.titleFontWeight ?? 'bold';
  const t = titleFontPdf(family);
  return { family: t.family, style: weight === 'normal' ? ('normal' as const) : ('bold' as const), sizeMm: size };
}

const MM_TO_PT = 2.83465;

function drawIndexPdf(doc: jsPDF, page: PrintLayout, pois: POI[], config: IndexListConfig) {
  const pos = config.position;
  const fp = footprintDims(config.rotation, pos.width, pos.height);
  const cx = pos.x + fp.w / 2;
  const cy = pos.y + fp.h / 2;
  const pad = (page.itemSpacing ?? 0) / 2;
  const insetPos = { ...pos, width: Math.max(1, pos.width - pad * 2), height: Math.max(1, pos.height - pad * 2) };
  const shifted = { ...insetPos, x: cx - insetPos.width / 2, y: cy - insetPos.height / 2 };
  withRotation(doc, config.rotation, cx, cy, () => {
    drawIndexContentPdf(doc, page, pois, { ...config, position: shifted });
  });
}

function drawIndexContentPdf(doc: jsPDF, page: PrintLayout, pois: POI[], config: IndexListConfig) {
  const pos = config.position;
  const resolved = resolveIndexConfig(config, page);
  const scoped = scopePois(pois, resolved, page.viewports);
  const groups = buildIndexGroups(scoped, resolved, page.viewports);
  const columnsData = distributeGroups(groups, resolved.columns);
  const columns: IndexColumn[][] = columnsData.map((col) => col.map((g) => ({ category: g.category, items: g.items, continued: g.continued })));

  const [r, g, b] = hexToRgb(page.spotColor);
  const refs = computeGridRefs(scoped, page.viewports);

  // Legend body + category typography
  const bodyFontFamily = titleFontPdf(resolved.bodyFontFamily).family;
  const bodyFontStyle = resolved.bodyFontWeight === 'bold' ? 'bold' : 'normal';
  const bodyFontSize = resolved.bodyFontSize * MM_TO_PT;
  const [bodyCr, bodyCg, bodyCb] = hexToRgb(resolved.bodyTextColor);
  const catFontFamily = titleFontPdf(resolved.categoryFontFamily).family;
  const catFontStyle = resolved.categoryFontWeight === 'normal' ? 'normal' : 'bold';
  const catFontSize = resolved.categoryFontSize * MM_TO_PT;
  const [catCr, catCg, catCb] = hexToRgb(resolved.categoryColor);
  const numFontFamily = titleFontPdf(resolved.numberFontFamily).family;
  const numFontSize = resolved.numberFontSize * MM_TO_PT;
  const [numCr, numCg, numCb] = (() => { const [cr, cg, cb] = hexToRgb(page.spotColor); return [cr, cg, cb]; })();

  const showTitle = resolved.showTitle;
  const title = resolved.title;
  const titleH = showTitle ? TITLE_BAR_MM : 0;
  const borderColor = resolved.borderColor;
  const radius = resolved.roundedCorners ? resolved.cornerRadius : 0;
  const bgColor = resolved.backgroundColor;

  // Spacing: inner padding + vertical pitch, both user-controlled
  const padTop = Math.max(0, resolved.paddingTop);
  const padRight = Math.max(0, resolved.paddingRight);
  const padBottom = Math.max(0, resolved.paddingBottom);
  const padLeft = Math.max(0, resolved.paddingLeft);
  const lineH = Math.max(1.2, resolved.lineHeight);
  const colGap = resolved.columnGap; // mm

  // Tile background + border
  const [bgr, bgg, bgb] = hexToRgb(bgColor);
  doc.setFillColor(bgr, bgg, bgb);
  const [br, bg, bb] = hexToRgb(borderColor);
  doc.setDrawColor(br, bg, bb);
  doc.setLineWidth(resolved.borderWidth / 3);
  doc.roundedRect(pos.x, pos.y, pos.width, pos.height, radius, radius, 'FD');

  // Title bar
  if (showTitle) {
    const tbg = resolved.titleBackgroundColor;
    const [tr, tg, tb] = hexToRgb(tbg);
    doc.setFillColor(tr, tg, tb);
    if (radius > 0) {
      doc.roundedRect(pos.x, pos.y, pos.width, titleH, radius, radius, 'F');
      doc.rect(pos.x, pos.y + titleH / 2, pos.width, titleH / 2, 'F');
    } else {
      doc.rect(pos.x, pos.y, pos.width, titleH, 'F');
    }
    const tf = titleFontForPage(page, {
      family: resolved.titleFontFamily,
      size: resolved.titleFontSize,
      weight: resolved.titleFontWeight,
    });
    const titlePad = resolved.titlePadding;
    const [ttr, ttg, ttb] = hexToRgb(resolved.titleTextColor);
    doc.setTextColor(ttr, ttg, ttb);
    doc.setFont(tf.family, tf.style);
    doc.setFontSize(tf.sizeMm * MM_TO_PT);
    doc.text(title.toUpperCase(), pos.x + titlePad, pos.y + titleH - 1.8);
  }

  const bodyX = pos.x + padLeft;
  const bodyW = pos.width - padLeft - padRight;
  const bodyTop = pos.y + titleH + padTop;
  const bodyBottom = pos.y + pos.height - padBottom;

  // Column widths: use relative weights if provided, otherwise equal distribution
  const colWeights = columns.length > 0 && resolved.columnWidths.length >= columns.length
    ? resolved.columnWidths.slice(0, columns.length)
    : columns.map(() => 1);
  const totalWeight = colWeights.reduce((s, w) => s + w, 0) || 1;
  const colWidths = colWeights.map((w) => (w / totalWeight) * bodyW);

  // Clip to the tile so long names / many rows can never spill out. When the
  // tile has rounded corners, clip to the rounded-rect path (the bottom corners
  // would otherwise let body content poke out past the curve).
  doc.saveGraphicsState();
  if (radius > 0) {
    doc.roundedRect(pos.x, pos.y, pos.width, pos.height, radius, radius, null);
  } else {
    doc.rect(pos.x, bodyTop, pos.width, Math.max(0, bodyBottom - bodyTop), null);
  }
  doc.clip();
  doc.discardPath();

  columns.forEach((col, ci) => {
    const x0 = bodyX + colWidths.slice(0, ci).reduce((s, w) => s + w, 0) + ci * colGap;
    const colRight = x0 + colWidths[ci];
    let y = bodyTop;

    for (const group of col) {
      if (group.category) {
        const catText = group.category.toUpperCase() + (group.continued ? ' (cont.)' : '');
        const iconSize = resolved.categoryFontSize * 1.5;
        const iconGap = resolved.showIcons ? iconSize + 0.8 : 0;
        if (resolved.showIcons) {
          const iconColor = resolved.categorySeparatorStyle !== 'none'
            ? hexToRgb(resolved.categorySeparatorColor)
            : [r, g, b] as [number, number, number];
          drawIndexIcon(doc, indexIconFor(group.category), x0, y - iconSize + resolved.categoryFontSize * 0.8, iconSize, iconColor);
        }
        doc.setFont(catFontFamily, catFontStyle);
        doc.setFontSize(catFontSize);
        doc.setTextColor(catCr, catCg, catCb);
        doc.text(catText, x0 + iconGap, y);
        y += lineH * 0.35;
        if (resolved.categorySeparatorStyle === 'underline' || resolved.categorySeparatorStyle === 'line') {
          const [sr, sg, sb] = hexToRgb(resolved.categorySeparatorColor);
          doc.setDrawColor(sr, sg, sb);
          doc.setLineWidth(resolved.categorySeparatorWidth / 3);
          doc.line(x0, y, colRight, y);
        }
        y += lineH * 0.5;
      }

      for (const poi of group.items) {
        const numText = resolved.numberFormat === 'paren'
          ? `(${poi.customNumber}).`
          : resolved.numberFormat === 'dot'
            ? `${poi.customNumber}.`
            : resolved.numberFormat === 'dash'
              ? `- ${poi.customNumber}.`
              : `${poi.customNumber}.`;

        doc.setFont(numFontFamily, 'bold');
        doc.setFontSize(numFontSize);
        doc.setTextColor(numCr, numCg, numCb);
        doc.text(numText, x0, y);
        const numW = doc.getTextWidth(numText);

        const ref = resolved.showGridRefs ? (refs[poi.id] ?? null) : null;
        let refW = 0;
        if (ref) {
          doc.setFont(bodyFontFamily, 'normal');
          doc.setFontSize(bodyFontSize * 0.85);
          refW = doc.getTextWidth(ref);
        }

        const gap = 1;
        const nameX = x0 + numW + gap;
        const nameMaxW = Math.max(3, colWidths[ci] - (numW + gap) - (ref ? refW + 2 : 0));

        doc.setFont(bodyFontFamily, bodyFontStyle);
        doc.setFontSize(bodyFontSize);
        doc.setTextColor(bodyCr, bodyCg, bodyCb);
        const nameLines = doc.splitTextToSize(poi.name, nameMaxW);
        const firstLine = (nameLines[0] ?? poi.name) as string;
        const firstLineW = doc.getTextWidth(firstLine);
        doc.text(firstLine, nameX, y);

        if (ref) {
          const refX = colRight - refW;
          doc.setFont(bodyFontFamily, 'normal');
          doc.setFontSize(bodyFontSize * 0.85);
          doc.setTextColor(120, 120, 120);
          doc.text(ref, refX, y);
          const dotStart = nameX + firstLineW + 0.8;
          const dotEnd = refX - 1.2;
          if (dotEnd > dotStart) {
            doc.setDrawColor(180, 180, 180);
            doc.setLineWidth(0.15);
            doc.setLineDashPattern([0.4, 0.9], 0);
            doc.line(dotStart, y - 0.3, dotEnd, y - 0.3);
            doc.setLineDashPattern([], 0);
          }
        }

        y += lineH;
        for (let li = 1; li < nameLines.length; li++) {
          doc.setFont(bodyFontFamily, bodyFontStyle);
          doc.setFontSize(bodyFontSize);
          doc.setTextColor(bodyCr, bodyCg, bodyCb);
          doc.text(nameLines[li] as string, nameX, y);
          y += lineH;
        }
      }
      y += lineH * 0.4;
    }
  });

  doc.restoreGraphicsState();
}

function drawTitleBlockPdf(doc: jsPDF, page: PrintLayout, config: TitleBlockConfig) {
  const pos = config.position;
  const fp = footprintDims(config.rotation, pos.width, pos.height);
  const cx = pos.x + fp.w / 2;
  const cy = pos.y + fp.h / 2;
  const pad = (page.itemSpacing ?? 0) / 2;
  const insetPos = { ...pos, width: Math.max(1, pos.width - pad * 2), height: Math.max(1, pos.height - pad * 2) };
  const shifted = { ...insetPos, x: cx - insetPos.width / 2, y: cy - insetPos.height / 2 };
  withRotation(doc, config.rotation, cx, cy, () => {
    drawTitleBlockContentPdf(doc, page, config, shifted);
  });
}

function drawTitleBlockContentPdf(doc: jsPDF, page: PrintLayout, config: TitleBlockConfig, posOverride?: Rect) {
  const pos = posOverride ?? config.position;
  const fontFamily = titleFontPdf(config.fontFamily ?? page.titleFontFamily ?? 'Helvetica').family;
  const fontWeight = config.fontWeight ?? 'bold';
  const style = fontWeight === 'normal' ? 'normal' : 'bold';
  const [tr, tg, tb] = hexToRgb(config.textColor ?? '#1a1a1a');
  const [bgr, bgg, bgb] = hexToRgb(config.backgroundColor ?? '#ffffff');
  const [br, bg, bb] = hexToRgb(config.borderColor ?? page.spotColor);

  doc.setFillColor(bgr, bgg, bgb);
  doc.setDrawColor(br, bg, bb);
  doc.setLineWidth((config.borderWidth ?? 0) / 3);
  doc.rect(pos.x, pos.y, pos.width, pos.height, 'FD');

  const align = config.align ?? 'left';
  const pad = 2.5;
  const titleX =
    align === 'left' ? pos.x + pad : align === 'right' ? pos.x + pos.width - pad : pos.x + pos.width / 2;
  const textAlign: 'left' | 'center' | 'right' = align === 'left' ? 'left' : align === 'right' ? 'right' : 'center';

  const title = config.title;
  const subtitle = config.subtitle;

  const fsMm = config.fontSize ?? page.titleFontSize ?? 5;
  const titleSizePt = fsMm * MM_TO_PT;
  const subSizePt = fsMm * 0.6 * MM_TO_PT;
  const titleLH = fsMm * 1.2;
  const subLH = fsMm * 0.6 * 1.2;
  const groupH = titleLH + (subtitle ? subLH : 0);
  const groupTop = pos.y + Math.max(0, (pos.height - groupH) / 2);

  doc.setFont(fontFamily, style);
  doc.setFontSize(titleSizePt);
  doc.setTextColor(tr, tg, tb);
  doc.text(title.toUpperCase(), titleX, groupTop + titleLH * 0.78, { align: textAlign });

  if (subtitle) {
    doc.setFont(fontFamily, 'normal');
    doc.setFontSize(subSizePt);
    doc.text(subtitle, titleX, groupTop + titleLH + subLH * 0.78, { align: textAlign });
  }
}

/** Vector grid lines + cartographic border (ticks & labels) drawn in PDF space. */
function drawGridPdf(doc: jsPDF, vp: MapViewport, rect: { x: number; y: number; width: number; height: number }) {
  if (!vp.bbox || !vp.showGrid) return;
  const spacingM = vp.gridSpacing ?? autoGridSpacing(vp.bbox);
  const proj = bboxToFrameRect(vp.bbox, rect);
  const extent: [number, number, number, number] = [proj.lngMin, proj.latMin, proj.lngMax, proj.latMax];
  const geo = buildGridGeometry(extent, spacingM);
  const border = buildBorder(extent, spacingM);
  const { x, y, width, height } = proj;

  const lineW = vp.gridLineWidth ?? 0.15;
  const opacity = Math.min(1, Math.max(0, vp.gridOpacity ?? 0.5));

  // Grid lines
  const [gr, gg, gb] = hexToRgb(vp.gridColor || '#8a8a8a');
  doc.setDrawColor(gr, gg, gb);
  doc.setLineWidth(lineW);
  doc.setGState(new GState({ opacity }));
  for (const lng of geo.lngLines) {
    const lx = proj.lngToX(lng);
    doc.line(lx, y, lx, y + height);
  }
  for (const lat of geo.latLines) {
    const ly = proj.latToY(lat);
    doc.line(x, ly, x + width, ly);
  }
  doc.setGState(new GState({ opacity: 1 }));

  // Border ticks
  const showBorder = vp.showBorder !== false;
  const showRefs = vp.showGridRefs === true;
  const [br, bg, bb] = hexToRgb(vp.borderColor || '#000000');
  const borderW = vp.gridBorderWidth ?? 0.5;
  doc.setDrawColor(br, bg, bb);
  doc.setLineWidth(borderW);
  if (showBorder) {
    // Frame: solid rect, or alternating two-color segments
    if (vp.borderAlternating) {
      const alternateColor = vp.borderAlternateColor || '#ffffff';
      const [ar, ag, ab] = hexToRgb(alternateColor);
      buildBorderFrameSegments(geo, proj, borderW).forEach((s, i) => {
        if (i % 2 === 0) doc.setFillColor(br, bg, bb);
        else doc.setFillColor(ar, ag, ab);
        doc.rect(s.x, s.y, s.width, s.height, 'F');
      });
      const cornerOutline = vp.borderAlternatingOutline !== false;
      const [cr, cg, cb] = hexToRgb(vp.borderAlternatingCornerColor || vp.borderColor || '#000000');
      doc.setFillColor(cr, cg, cb);
      if (cornerOutline) {
        doc.setDrawColor(br, bg, bb);
        doc.setLineWidth(vp.borderAlternatingOutlineWidth ?? 0.2);
      }
      const cornerMode = cornerOutline ? 'FD' : 'F';
      doc.rect(x, y, borderW, borderW, cornerMode);
      doc.rect(x + width - borderW, y, borderW, borderW, cornerMode);
      doc.rect(x, y + height - borderW, borderW, borderW, cornerMode);
      doc.rect(x + width - borderW, y + height - borderW, borderW, borderW, cornerMode);
      if (cornerOutline) {
        doc.setDrawColor(br, bg, bb);
        doc.setLineWidth(vp.borderAlternatingOutlineWidth ?? 0.2);
        doc.rect(x, y, width, height);
        doc.rect(x + borderW, y + borderW, width - 2 * borderW, height - 2 * borderW);
      }
      doc.setDrawColor(br, bg, bb);
    } else {
      doc.rect(x, y, width, height);
    }

    const tickLen = 1.6;
    if (vp.showBorderTicks !== false) {
      for (const t of border.ticks) {
        if (t.edge === 'top') {
          const tx = proj.lngToX(t.lng!);
          doc.line(tx, y, tx, y + tickLen);
        } else if (t.edge === 'bottom') {
          const tx = proj.lngToX(t.lng!);
          doc.line(tx, y + height, tx, y + height - tickLen);
        } else if (t.edge === 'left') {
          const ty = proj.latToY(t.lat!);
          doc.line(x, ty, x + tickLen, ty);
        } else {
          const ty = proj.latToY(t.lat!);
          doc.line(x + width, ty, x + width - tickLen, ty);
        }
      }
    }

    // Coordinate labels on major ticks (hidden when grid refs are shown)
    if (vp.showBorderTicks !== false && !showRefs) {
      const labelFamily = titleFontPdf('Helvetica').family;
      doc.setFont(labelFamily, 'normal');
      doc.setFontSize(5);
      doc.setTextColor(60, 60, 60);
      const pad = 1.1;
      for (const t of border.ticks) {
        if (!t.label) continue;
        if (t.edge === 'top') {
          doc.text(t.label, proj.lngToX(t.lng!), y - pad, { align: 'center' });
        } else if (t.edge === 'bottom') {
          doc.text(t.label, proj.lngToX(t.lng!), y + height + pad, { align: 'center' });
        } else if (t.edge === 'left') {
          doc.text(t.label, x - pad, proj.latToY(t.lat!), { align: 'right' });
        } else {
          doc.text(t.label, x + width + pad, proj.latToY(t.lat!), { align: 'left' });
        }
      }
    }
  }

  // Grid reference letters / numbers just inside the map edge
  if (showRefs) {
    const refFamily = titleFontPdf(vp.gridRefFontFamily ?? 'Helvetica').family;
    const refStyle = vp.gridRefFontWeight === 'bold' ? ('bold' as const) : ('normal' as const);
    const refSizeMm = vp.gridRefFontSize ?? 2.8;
    const [rr, rgr, rgb] = hexToRgb(vp.gridRefFontColor || '#3c3c3c');
    doc.setFont(refFamily, refStyle);
    doc.setFontSize(refSizeMm * MM_TO_PT);
    doc.setTextColor(rr, rgr, rgb);
    const pad = 1.2;
    for (const l of buildGridRefLabels(geo, proj, pad)) {
      if (l.edge === 'top') {
        doc.text(l.text, l.x, l.y + refSizeMm, { align: 'center' });
      } else if (l.edge === 'bottom') {
        doc.text(l.text, l.x, l.y, { align: 'center' });
      } else if (l.edge === 'left') {
        doc.text(l.text, l.x, l.y, { align: 'left' });
      } else {
        doc.text(l.text, l.x, l.y, { align: 'right' });
      }
    }
  }
}

function drawInsetsPdf(doc: jsPDF, page: PrintLayout, vp: MapViewport, area: { x: number; y: number; width: number; height: number }) {
  if (!vp.bbox) return;
  const proj = bboxToFrameRect(vp.bbox, area);
  const [ir, ig, ib] = hexToRgb(vp.insetColor || '#e0563d');
  const labelFamily = titleFontPdf('Helvetica').family;
  for (const child of insetViewports(page.viewports, vp)) {
    const rect = buildInsetRect(proj, child.bbox!, child.title);
    if (!rect) continue;
    doc.setDrawColor(ir, ig, ib);
    doc.setLineWidth(vp.insetLineWidth ?? 0.3);
    doc.setLineDashPattern([1.6, 1], 0);
    doc.rect(rect.x, rect.y, rect.width, rect.height);
    doc.setLineDashPattern([], 0);
    if (vp.showInsetLabels !== false) {
      doc.setFont(labelFamily, 'bold');
      doc.setFontSize(4);
      doc.setTextColor(ir, ig, ib);
      doc.text(child.title, rect.x + 0.8, Math.max(rect.y - 0.8, area.y + 1.6));
    }
  }
}

function drawViewportPdf(doc: jsPDF, page: PrintLayout, vp: MapViewport, img?: string, pois: POI[] = [], layers?: MapLayerStyle) {
  const p = vp.positionOnPage;
  const fp = footprintDims(vp.rotation, p.width, p.height);
  // itemSpacing is symmetric padding: inset the whole frame so the fold lines
  // fall in the blank gutter between neighbouring maps.
  const pad = (page.itemSpacing ?? 0) / 2;
  const bx = p.x + pad;
  const by = p.y + pad;
  const bw = Math.max(1, fp.w - pad * 2);
  const bh = Math.max(1, fp.h - pad * 2);
  const title = vp.showTitle !== false;
  const titleH = title ? (vp.titleBarHeight ?? TITLE_BAR_MM) : 0;
  const radius = vp.roundedCorners ? (vp.cornerRadius ?? 4) : 0;
  // The map body is inset by the frame border on all sides, exactly like the
  // layout tile inside the frame's border-box → the map edges + rounded corners
  // match the on-screen layout. Title bar is inset by the border too.
  const border = vp.borderWidth ?? 0.1;
  const body = mapBodyBox(vp, page.itemSpacing ?? 0);
  const tx = bx + border;
  const ty = by + border;
  const tw = bw - border * 2;
  // Content is clipped to the frame's *inner* radius (CSS clips the padding box
  // at border-radius − border-width), so the corners match the layout tile.
  const innerRadius = Math.max(0, radius - border);

  // Map background
  const [fbr, fbg, fbb] = hexToRgb(vp.backgroundColor || '#ffffff');
  doc.setFillColor(fbr, fbg, fbb);
  doc.roundedRect(bx, by, bw, bh, radius, radius, 'F');

  // Title bar (stays horizontal; the map content rotates beneath it via bearing)
  if (title) {
    const withBg = vp.titleBackground !== false;
    const tbg = withBg ? (vp.titleBackgroundColor || page.defaultTitleBackgroundColor || '#ffffff') : '#fafafa';
    const [tr, tg, tb] = hexToRgb(tbg);
    doc.setFillColor(tr, tg, tb);
    if (radius > 0) {
      doc.path(roundedTopPath(tx, ty, tw, titleH, innerRadius));
      doc.fill();
      doc.discardPath();
    } else {
      doc.rect(tx, ty, tw, titleH, 'F');
    }
    if (!withBg) {
      doc.setDrawColor(26, 26, 26);
      doc.setLineWidth(0.2);
      doc.line(tx, ty + titleH, tx + tw, ty + titleH);
    }
    const titleTextColor = vp.titleTextColor || page.defaultTitleTextColor || (withBg ? '#ffffff' : '#1a1a1a');
    const [ttr, ttg, ttb] = hexToRgb(titleTextColor);
    doc.setTextColor(ttr, ttg, ttb);
    const tf = titleFontForPage(page, {
      family: vp.titleFontFamily,
      size: vp.titleFontSize,
      weight: vp.titleFontWeight,
    });
    doc.setFont(tf.family, tf.style);
    doc.setFontSize(tf.sizeMm * MM_TO_PT);
    doc.text(vp.title.toUpperCase(), tx + 2.5, ty + titleH - 1.8);
    // Real-world grid size indicator (right-aligned), matching the editor title bar.
    if (vp.showGrid && vp.showGridIndicator !== false && vp.bbox) {
      const spacing = vp.gridSpacing ?? autoGridSpacing(vp.bbox);
      const indicator = `Grid = ${spacingLabel(spacing)} × ${spacingLabel(spacing)}`;
      doc.setFontSize(Math.max(1.2, tf.sizeMm * 0.6) * MM_TO_PT);
      doc.text(indicator, tx + tw - 2.5, ty + titleH - 1.8, { align: 'right' });
    }
  }

  // Map content: the 300-DPI MapLibre render, clipped to the frame body. The
  // render uses the exact layout-tile setup (EDITOR_LABEL_SCALE), so the print
  // matches the on-screen layout WYSIWYG. POI badges are baked into the raster.
  if (img) {
    clipToMapBody(doc, bx + body.x, by + body.y, body.w, body.h, innerRadius);
    doc.addImage(img, 'PNG', bx + body.x, by + body.y, body.w, body.h);
    doc.restoreGraphicsState();
  }

  // POI labels overlay (drawn on top of the map raster)
  if (layers?.showPoiLabels && vp.bbox && pois.length > 0) {
    const mapRect = { x: bx + body.x, y: by + body.y, width: body.w, height: body.h };
    const proj = bboxToFrameRect(vp.bbox, mapRect);
    const activePois = pois.filter((p) => p.active);
    if (activePois.length > 0) {
      drawPoiLabelsPdf(doc, proj, activePois, {
        bgColor: layers.poiLabelBgColor ?? '#ffffff',
        textColor: layers.poiLabelTextColor ?? '#1a1a1a',
        fontSize: layers.poiLabelFontSize ?? 12,
        padding: layers.poiLabelPadding ?? 4,
        borderRadius: layers.poiLabelBorderRadius ?? 4,
        showShadow: layers.poiLabelShadow ?? true,
      });
    }
  }

  // Vector grid + cartographic border, rotated to overlay the bearing-rotated raster
  if (vp.bbox && (vp.showGrid || vp.showInsets)) {
    const area = { x: bx + body.x, y: by + body.y, width: body.w, height: body.h };
    clipToMapBody(doc, area.x, area.y, area.width, area.height, innerRadius);
    withRotation(doc, vp.rotation, area.x + area.width / 2, area.y + area.height / 2, () => {
      if (vp.showGrid) drawGridPdf(doc, vp, area);
      drawInsetsPdf(doc, page, vp, area);
    });
    doc.restoreGraphicsState();
  }

  // Frame border
  const [br, bg, bb] = hexToRgb(vp.borderColor || '#000000');
  doc.setDrawColor(br, bg, bb);
  doc.setLineWidth((vp.borderWidth ?? 0.1) / 3);
  doc.roundedRect(bx, by, bw, bh, radius, radius, 'S');
}

function drawPage(doc: jsPDF, page: PrintLayout, pois: POI[], images: Record<string, string>) {
  const [pw, ph] = pageSizeMm(page);

  const [paperR, paperG, paperB] = hexToRgb(page.paperColor || '#ffffff');
  doc.setFillColor(paperR, paperG, paperB);
  doc.rect(0, 0, pw, ph, 'F');

  // Crop marks
  doc.setDrawColor(120, 120, 120);
  doc.setLineWidth(0.2);
  const mark = 4;
  doc.line(0, 0, mark, 0); doc.line(0, 0, 0, mark);
  doc.line(pw, 0, pw - mark, 0); doc.line(pw, 0, pw, mark);
  doc.line(0, ph, mark, ph); doc.line(0, ph, 0, ph - mark);
  doc.line(pw, ph, pw - mark, ph); doc.line(pw, ph, pw, ph - mark);

  // Draw each map frame
  for (const vp of page.viewports) {
    drawViewportPdf(doc, page, vp, images[`${page.id}:${vp.id}`], pois, vp.layers);
  }

  for (const config of page.indexLists) {
    drawIndexPdf(doc, page, pois, config);
  }

  for (const config of page.titleBlocks) {
    drawTitleBlockPdf(doc, page, config);
  }
}

export async function exportLayout(pages: PrintPage[], pois: POI[]): Promise<ExportResult> {
  const images: Record<string, string> = {};

  const tasks: Array<{ page: PrintPage; vp: MapViewport }> = [];
  for (const page of pages) {
    for (const vp of page.viewports) {
      tasks.push({ page, vp });
    }
  }

  const colorModes = new Map(pages.map((p) => [p.id, p.colorMode ?? 'spot']));
  const spotColors = new Map(pages.map((p) => [p.id, p.spotColor]));

  // Pre-load all Google Fonts used by place-name tiers so the map renderers
  // don't have to wait for fire-and-forget loads triggered by the style.
  await Promise.allSettled(pages.flatMap((p) => p.viewports.map((vp) => preloadLayoutFonts(vp.layers?.placeNames))));

  await Promise.all(
    tasks.map(async ({ page, vp }) => {
      const key = `${page.id}:${vp.id}`;
      const colorMode = colorModes.get(page.id) ?? 'spot';
      const spotColor = spotColors.get(page.id) ?? '#e0563d';
      try {
        images[key] = await renderViewportImage(vp, pois, colorMode, spotColor, page.itemSpacing ?? 0, page.glyphsUrl);
      } catch (e) {
        console.warn(`Map render failed for "${vp.title}" — the frame is omitted from the PDF.`, e);
        throw e;
      }
    })
  );

  const first = pages[0];
  const [pw, ph] = pageSizeMm(first);
  const doc = new jsPDF({ orientation: pw >= ph ? 'landscape' : 'portrait', unit: 'mm', format: [pw, ph] });

  pages.forEach((page, i) => {
    if (i > 0) {
      const [w, h] = pageSizeMm(page);
      const orient = w >= h ? 'landscape' : 'portrait';
      doc.addPage([w, h], orient);
    }
    drawPage(doc, page, pois, images);
  });

  const pdfDataUrl = doc.output('datauristring');
  return { pdfDataUrl, images, pages };
}
