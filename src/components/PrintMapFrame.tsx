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
import { zoomViewport, insetViewports } from '@/lib/mapStyle';
import { autoGridSpacing, spacingLabel } from '@/lib/grid';

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
  const borderWidth = `${viewport.borderWidth ?? 1}mm`;
  const borderColor = viewport.borderColor || '#000000';
  const backgroundColor = viewport.backgroundColor || '#ffffff';
  const showTitle = viewport.showTitle !== false;
  const titleBackground = viewport.titleBackground !== false;
  const titleBgColor = viewport.titleBackgroundColor || layout.defaultTitleBackgroundColor || spotColor;
  const titleTextColor = viewport.titleTextColor || layout.defaultTitleTextColor || (titleBackground ? '#ffffff' : '#1a1a1a');
  const titleFontSize = Math.max(6, (viewport.titleFontSize ?? layout.titleFontSize ?? 3) * CSS_PX_PER_MM);
  const titleFontWeight = viewport.titleFontWeight ?? layout.titleFontWeight ?? 'bold';
  // The title bar is a fixed print-height band (TITLE_BAR_MM), matching the
  // export's frame body so a bbox fit shows exactly the same extent in the
  // layout tile and the PDF.
  const titleBarHeight = `${TITLE_BAR_MM * CSS_PX_PER_MM}px`;
  const showGridIndicator = viewport.showGrid && viewport.showGridIndicator !== false && !!viewport.bbox;
  const gridIndicator = showGridIndicator
    ? `Grid = ${spacingLabel(viewport.gridSpacing ?? autoGridSpacing(viewport.bbox!))} × ${spacingLabel(viewport.gridSpacing ?? autoGridSpacing(viewport.bbox!))}`
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
        <Button variant="ghost" size="icon" className="h-6 w-6 bg-white/80" onMouseDown={stopDrag} onClick={e => { e.stopPropagation(); onSelect(); onUpdate?.(zoomViewport(viewport, 1)); }} title="Zoom In">
          <ZoomIn className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-6 w-6 bg-white/80" onMouseDown={stopDrag} onClick={e => { e.stopPropagation(); onUpdate?.(zoomViewport(viewport, -1)); }} title="Zoom Out">
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
            {gridIndicator && (
              <span className="shrink-0 text-[0.72em] font-medium normal-case tracking-normal opacity-90" title="Grid cell size (real-world)">
                {gridIndicator}
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
