'use client';

import { useEffect, useRef, useState } from 'react';
import { MapViewport } from '@/types';
import type { BBox } from '@/lib/mapStyle';
import {
  autoGridSpacing,
  buildGridGeometry,
  buildBorder,
  buildBorderFrameSegments,
  bboxToFrameRect,
  buildGridRefLabels,
  buildInsetRect,
  InsetRect,
} from '@/lib/grid';
import { titleFontCss } from '@/lib/titleFonts';

const PX_PER_MM = 2;

/**
 * Vector grid + cartographic border overlay rendered in layout space (SVG),
 * matching the vector grid the PDF exporter draws. Position it absolutely over
 * the map area of a frame; it measures itself and projects the viewport bbox
 * onto its own box (extended to the full box, since the map raster overscans
 * the letterboxed bbox region). When the map is bearing-rotated, pass the same
 * rotation so the overlay rotates in sync.
 */
export function GridOverlay({
  viewport,
  bbox,
  rotation = 0,
  className,
  insets = [],
}: {
  viewport: MapViewport;
  bbox: BBox;
  rotation?: number;
  className?: string;
  /** Other maps (with their bboxes) to outline when they fall inside this map. */
  insets?: { bbox: BBox; title: string }[];
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const update = () => {
      // Use the layout box, not getBoundingClientRect: the ExportDialog preview
      // wraps the page in transform: scale(...), which shrinks the visual rect
      // and would squeeze the grid into the upper-left corner. clientWidth/Height
      // report the untransformed layout size, so the overlay matches the map.
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w > 0 && h > 0) setSize({ w, h });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (size.w === 0 || size.h === 0) {
    return <svg ref={svgRef} className={className} width="100%" height="100%" />;
  }

  const spacingM = viewport.gridSpacing ?? autoGridSpacing(bbox);
  const proj = bboxToFrameRect(bbox, { x: 0, y: 0, width: size.w, height: size.h });
  const extent: BBox = [proj.lngMin, proj.latMin, proj.lngMax, proj.latMax];
  const geo = buildGridGeometry(extent, spacingM);
  const border = buildBorder(extent, spacingM);

  const { x, y, width, height } = proj;

  const gridColor = viewport.gridColor || '#8a8a8a';
  const gridLineWidth = (viewport.gridLineWidth ?? 0.15) * PX_PER_MM;
  const gridOpacity = Math.min(1, Math.max(0, viewport.gridOpacity ?? 0.5));
  const borderColor = viewport.borderColor || '#000000';
  const borderWidth = Math.max(0.5, (viewport.gridBorderWidth ?? 0.5) * PX_PER_MM);
  const alternateColor = viewport.borderAlternateColor || '#ffffff';
  const outlineWidth = Math.max(0.2, (viewport.borderAlternatingOutlineWidth ?? 0.2) * PX_PER_MM);
  const cornerColor = viewport.borderAlternatingCornerColor || borderColor;
  const showBorder = viewport.showBorder !== false;
  const tickLen = 1.6 * PX_PER_MM;
  const labelPad = 2.6;
  const showRefs = viewport.showGridRefs === true;
  const refFontSize = (viewport.gridRefFontSize ?? 2.8) * PX_PER_MM;
  const refLabels = showRefs ? buildGridRefLabels(geo, proj, 2.4) : [];
  const insetRects: InsetRect[] = insets.map((c) => buildInsetRect(proj, c.bbox, c.title)).filter((r): r is InsetRect => r !== null);
  const insetColor = viewport.insetColor || '#e0563d';
  const insetWidth = (viewport.insetLineWidth ?? 0.3) * PX_PER_MM;

  const cx = x + width / 2;
  const cy = y + height / 2;

  return (
    <svg
      ref={svgRef}
      className={className}
      width="100%"
      height="100%"
      style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none' }}
    >
      <g transform={rotation ? `rotate(${rotation} ${cx} ${cy})` : undefined}>
        {/* Grid lines */}
        <g stroke={gridColor} strokeWidth={gridLineWidth} opacity={gridOpacity}>
          {geo.lngLines.map((lng) => (
            <line key={`lng-${lng}`} x1={proj.lngToX(lng)} y1={y} x2={proj.lngToX(lng)} y2={y + height} />
          ))}
          {geo.latLines.map((lat) => (
            <line key={`lat-${lat}`} x1={x} y1={proj.latToY(lat)} x2={x + width} y2={proj.latToY(lat)} />
          ))}
        </g>

        {/* Cartographic border */}
        {showBorder && (
          <g>
            {viewport.borderAlternating ? (
              <>
                <g fill="none">
                  {buildBorderFrameSegments(geo, proj, borderWidth).map((s, i) => (
                    <rect key={i} x={s.x} y={s.y} width={s.width} height={s.height} fill={i % 2 === 0 ? borderColor : alternateColor} />
                  ))}
                </g>
                {viewport.borderAlternatingOutline !== false ? (
                  <>
                    <rect x={x} y={y} width={borderWidth} height={borderWidth} fill={cornerColor} stroke={borderColor} strokeWidth={outlineWidth} />
                    <rect x={x + width - borderWidth} y={y} width={borderWidth} height={borderWidth} fill={cornerColor} stroke={borderColor} strokeWidth={outlineWidth} />
                    <rect x={x} y={y + height - borderWidth} width={borderWidth} height={borderWidth} fill={cornerColor} stroke={borderColor} strokeWidth={outlineWidth} />
                    <rect x={x + width - borderWidth} y={y + height - borderWidth} width={borderWidth} height={borderWidth} fill={cornerColor} stroke={borderColor} strokeWidth={outlineWidth} />
                    <g stroke={borderColor} strokeWidth={outlineWidth} fill="none">
                      <rect x={x} y={y} width={width} height={height} />
                      <rect x={x + borderWidth} y={y + borderWidth} width={width - 2 * borderWidth} height={height - 2 * borderWidth} />
                    </g>
                  </>
                ) : (
                  <>
                    <rect x={x} y={y} width={borderWidth} height={borderWidth} fill={cornerColor} />
                    <rect x={x + width - borderWidth} y={y} width={borderWidth} height={borderWidth} fill={cornerColor} />
                    <rect x={x} y={y + height - borderWidth} width={borderWidth} height={borderWidth} fill={cornerColor} />
                    <rect x={x + width - borderWidth} y={y + height - borderWidth} width={borderWidth} height={borderWidth} fill={cornerColor} />
                  </>
                )}
              </>
            ) : (
              <rect
                x={x}
                y={y}
                width={width}
                height={height}
                fill="none"
                stroke={borderColor}
                strokeWidth={borderWidth}
              />
            )}

            {/* Ticks */}
            {viewport.showBorderTicks !== false && (
              <g stroke={borderColor} strokeWidth={borderWidth}>
                {border.ticks.map((t, i) => {
                  if (t.edge === 'top') {
                    const tx = proj.lngToX(t.lng!);
                    return <line key={`t-${i}`} x1={tx} y1={y} x2={tx} y2={y + tickLen} />;
                  }
                  if (t.edge === 'bottom') {
                    const tx = proj.lngToX(t.lng!);
                    return <line key={`t-${i}`} x1={tx} y1={y + height} x2={tx} y2={y + height - tickLen} />;
                  }
                  if (t.edge === 'left') {
                    const ty = proj.latToY(t.lat!);
                    return <line key={`t-${i}`} x1={x} y1={ty} x2={x + tickLen} y2={ty} />;
                  }
                  const ty = proj.latToY(t.lat!);
                  return <line key={`t-${i}`} x1={x + width} y1={ty} x2={x + width - tickLen} y2={ty} />;
                })}
              </g>
            )}

            {/* Coordinate labels on major ticks (hidden when grid refs are shown) */}
            {viewport.showBorderTicks !== false && !showRefs && (
              <g fill="#3c3c3c" fontFamily={titleFontCss('Helvetica')} fontSize={10}>
                {border.ticks.map((t, i) => {
                  if (!t.label) return null;
                  if (t.edge === 'top') {
                    return (
                      <text key={`l-${i}`} x={proj.lngToX(t.lng!)} y={y - labelPad} textAnchor="middle">
                        {t.label}
                      </text>
                    );
                  }
                  if (t.edge === 'bottom') {
                    return (
                      <text key={`l-${i}`} x={proj.lngToX(t.lng!)} y={y + height + labelPad + 9} textAnchor="middle">
                        {t.label}
                      </text>
                    );
                  }
                  if (t.edge === 'left') {
                    return (
                      <text key={`l-${i}`} x={x - labelPad} y={proj.latToY(t.lat!) + 3} textAnchor="end">
                        {t.label}
                      </text>
                    );
                  }
                  return (
                    <text key={`l-${i}`} x={x + width + labelPad} y={proj.latToY(t.lat!) + 3} textAnchor="start">
                      {t.label}
                    </text>
                  );
                })}
              </g>
            )}
          </g>
        )}

        {/* Grid reference letters / numbers just inside the map edge */}
        {refLabels.length > 0 && (
          <g
            fill={viewport.gridRefFontColor || '#3c3c3c'}
            fontFamily={titleFontCss(viewport.gridRefFontFamily ?? 'Helvetica')}
            fontSize={refFontSize}
            fontWeight={viewport.gridRefFontWeight === 'bold' ? 700 : viewport.gridRefFontWeight === 'medium' ? 500 : 400}
          >
            {refLabels.map((l, i) => {
              if (l.edge === 'top') {
                return (
                  <text key={`r-${i}`} x={l.x} y={l.y + refFontSize} textAnchor="middle">
                    {l.text}
                  </text>
                );
              }
              if (l.edge === 'bottom') {
                return (
                  <text key={`r-${i}`} x={l.x} y={l.y} textAnchor="middle">
                    {l.text}
                  </text>
                );
              }
              if (l.edge === 'left') {
                return (
                  <text key={`r-${i}`} x={l.x} y={l.y + refFontSize * 0.4} textAnchor="start">
                    {l.text}
                  </text>
                );
              }
              return (
                <text key={`r-${i}`} x={l.x} y={l.y + refFontSize * 0.4} textAnchor="end">
                  {l.text}
                </text>
              );
            })}
          </g>
        )}

        {/* Inset outlines: smaller maps inside this map */}
        {insetRects.length > 0 && (
          <g stroke={insetColor} strokeWidth={insetWidth} fill="none">
            {insetRects.map((r, i) => (
              <g key={`inset-${i}`}>
                <rect x={r.x} y={r.y} width={r.width} height={r.height} strokeDasharray="5 3" opacity={0.95} />
                {viewport.showInsetLabels !== false && (
                  <text
                    x={r.x + 2}
                    y={Math.max(r.y - 2, y + 4)}
                    fill={insetColor}
                    stroke="none"
                    fontSize={9}
                    fontFamily={titleFontCss('Helvetica')}
                    fontWeight={600}
                    opacity={0.95}
                  >
                    {r.title}
                  </text>
                )}
              </g>
            ))}
          </g>
        )}
      </g>
    </svg>
  );
}
