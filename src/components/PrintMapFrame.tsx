'use client';

import { MapViewport, PrintLayout } from '@/types';
import { PrintMapMini } from './PrintMapMini';
import { GridOverlay } from './GridOverlay';
import { Trash2, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useMap } from '@/context/MapContext';
import { titleFontCss } from '@/lib/titleFonts';
import { CSS_PX_PER_MM, TITLE_BAR_MM } from '@/lib/units';
import { zoomViewport, insetViewports, viewportBounds } from '@/lib/mapStyle';
import { autoGridSpacing, spacingLabel, computeScaleBar, scaleBarDistanceLabel, nearestCartographicZoom, type ScaleBarResult } from '@/lib/grid';

interface PrintMapFrameProps {
  viewport: MapViewport;
  isActive: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onUpdate?: (updates: Partial<MapViewport>) => void;
  onDoubleClick?: () => void;
  /** Page-level layout used for fallback fonts / spot color when provided. */
  layout?: PrintLayout;
}

export function PrintMapFrame({ viewport, isActive, onSelect, onRemove, onUpdate, onDoubleClick, layout: layoutProp }: PrintMapFrameProps) {
  const { layout: contextLayout } = useMap();
  const layout = layoutProp ?? contextLayout;
  const spotColor = layout.spotColor;
  const cornerRadius = viewport.roundedCorners ? `${viewport.cornerRadius ?? 4}mm` : '0';
  const borderWidth = `${viewport.borderWidth ?? 0.1}mm`;
  const borderColor = viewport.borderColor || '#000000';
  const backgroundColor = viewport.backgroundColor || '#ffffff';
  const showTitle = viewport.showTitle !== false;
  const titleBackground = viewport.titleBackground !== false;
  const titleBgColor = viewport.titleBackgroundColor || layout.defaultTitleBackgroundColor || '#ffffff';
  const titleTextColor = viewport.titleTextColor || layout.defaultTitleTextColor || (titleBackground ? '#ffffff' : '#1a1a1a');
  const titleFontSize = Math.max(2, (viewport.titleFontSize ?? layout.titleFontSize ?? 3) * CSS_PX_PER_MM);
  const titleFontWeight = viewport.titleFontWeight ?? layout.titleFontWeight ?? 'bold';
  // The title bar height is user-adjustable per viewport; fall back to the
  // fixed print-height band (TITLE_BAR_MM), matching the export's frame body
  // so a bbox fit shows exactly the same extent in the layout tile and the PDF.
  const titleBarHeight = `${(viewport.titleBarHeight ?? TITLE_BAR_MM) * CSS_PX_PER_MM}px`;
  // Scale bar
  const showScaleBar = viewport.bbox && (viewport.showScaleBar ?? true);
  const scaleBar = showScaleBar
    ? computeScaleBar(viewport.center[1], viewport.zoom, 1)
    : null;

  // Grid indicator - only show when explicitly enabled
  const showGridIndicator = viewport.showGrid && viewport.showGridIndicator !== false && !!viewport.bbox;
  const gridIndicator = showGridIndicator
    ? `Grid: ${spacingLabel(viewport.gridSpacing ?? autoGridSpacing(viewport.bbox!))}`
    : null;

  const stopDrag = (e: React.SyntheticEvent) => e.stopPropagation();

  const frameStyle: React.CSSProperties = {
    borderRadius: cornerRadius,
    borderWidth: borderWidth,
    borderColor: borderColor,
    backgroundColor: backgroundColor,
    overflow: 'hidden',
  };

  const titleBarStyle: React.CSSProperties = {
    backgroundColor: titleBackground ? titleBgColor : '#fafafa',
    color: titleTextColor,
    borderBottom: titleBackground ? 'none' : `1px solid ${borderColor}`,
    fontFamily: titleFontCss(viewport.titleFontFamily ?? layout.titleFontFamily),
    fontSize: `${titleFontSize}px`,
    fontWeight: titleFontWeight,
    height: titleBarHeight,
  };

  return (
    <div
      className={cn(
        'absolute inset-0 group',
        isActive && 'ring-2 ring-blue-500',
        !showTitle && 'frame-drag-handle cursor-grab'
      )}
      style={frameStyle}
      onClick={onSelect}
      onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick?.(); }}
    >
      <div className="absolute top-1 right-1 flex gap-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button variant="ghost" size="icon" className="h-6 w-6 bg-white/80" onMouseDown={stopDrag} onClick={e => {
          e.stopPropagation();
          onSelect();
          const result = nearestCartographicZoom(viewport.zoom, viewport.center[1], 1);
          if (result) {
            const newBbox = viewportBounds({ ...viewport, zoom: result.zoom, bbox: undefined });
            onUpdate?.({ zoom: result.zoom, bbox: newBbox });
          } else {
            onUpdate?.(zoomViewport(viewport, 1));
          }
        }} title="Zoom to nearest cartographic scale">
          <ZoomIn className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-6 w-6 bg-white/80" onMouseDown={stopDrag} onClick={e => {
          e.stopPropagation();
          const result = nearestCartographicZoom(viewport.zoom, viewport.center[1], -1);
          if (result) {
            const newBbox = viewportBounds({ ...viewport, zoom: result.zoom, bbox: undefined });
            onUpdate?.({ zoom: result.zoom, bbox: newBbox });
          } else {
            onUpdate?.(zoomViewport(viewport, -1));
          }
        }} title="Zoom to nearest cartographic scale">
          <ZoomOut className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-6 w-6 bg-white/80" onMouseDown={stopDrag} onClick={e => { e.stopPropagation(); onRemove(); }} title="Remove">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="absolute inset-0 flex flex-col">
        {showTitle && (
          <div
            className="frame-drag-handle flex items-center justify-between gap-2 px-2.5 uppercase tracking-[0.12em] shrink-0 cursor-grab overflow-hidden"
            style={titleBarStyle}
          >
            <span className="truncate">{viewport.title}</span>
            <span className="flex-1" />
            {gridIndicator && (
              <span className="shrink-0 text-[0.72em] font-medium normal-case tracking-normal opacity-90" title="Grid cell size (real-world)">
                {gridIndicator}
              </span>
            )}
            {scaleBar && (
              <span className="shrink-0 text-[0.72em] font-medium normal-case tracking-normal opacity-90 flex items-center gap-1.5" title={`Scale ${scaleBar.scaleText}`}>
                <ScaleBarSVG result={scaleBar} color={titleTextColor} />
                {viewport.showScaleText !== false && (
                  <span>{scaleBar.scaleText}</span>
                )}
              </span>
            )}
          </div>
        )}

        <div className="relative flex-1 min-h-0">
          <PrintMapMini
            viewport={viewport}
            className="absolute inset-0"
            onUpdate={onUpdate}
            spotColor={spotColor}
            colorMode={layout.colorMode ?? 'spot'}
          />
          {viewport.showGrid && viewport.bbox && (
            <GridOverlay
              viewport={viewport}
              bbox={viewport.bbox}
              rotation={viewport.rotation ?? 0}
              insets={insetViewports(layout.viewports, viewport)
                .map((v) => ({ bbox: v.bbox!, title: v.title }))}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ScaleBarSVG({ result, color }: { result: ScaleBarResult; color: string }) {
  const { barMm, ticks } = result;
  const barWidth = Math.max(8, Math.min(80, barMm));
  const barHeight = 3;
  const tickHeight = 2;
  const labelOffset = 4;
  const totalHeight = labelOffset + tickHeight + 1;

  return (
    <svg
      width={barWidth + 6}
      height={totalHeight}
      viewBox={`0 0 ${barWidth + 6} ${totalHeight}`}
      className="inline-block"
      style={{ minWidth: barWidth + 6 }}
    >
      {/* Base line */}
      <line x1={1} y1={labelOffset} x2={1 + barWidth} y2={labelOffset} stroke={color} strokeWidth={0.3} />
      {ticks.map((tick, i) => {
        const x = 1 + (tick.mm / barMm) * barWidth;
        const h = tick.major ? tickHeight : tickHeight * 0.5;
        return (
          <g key={i}>
            <line
              x1={x}
              y1={labelOffset}
              x2={x}
              y2={labelOffset + h}
              stroke={color}
              strokeWidth={tick.major ? 0.5 : 0.3}
            />
            {tick.major && (
              <text
                x={x}
                y={labelOffset - 0.8}
                textAnchor="middle"
                fill={color}
                fontSize={2.2}
                fontFamily="Helvetica, Arial, sans-serif"
              >
                {tick.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
