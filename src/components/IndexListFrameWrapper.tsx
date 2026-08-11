'use client';

import { PrintLayout, IndexListConfig } from '@/types';
import { IndexListFrame } from './IndexListFrame';
import { Trash2, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { scopePois, resolveIndexConfig } from '@/lib/indexStyle';
import { titleFontCss } from '@/lib/titleFonts';
import { CSS_PX_PER_MM } from '@/lib/units';
import { useMap } from '@/context/MapContext';

interface IndexListFrameWrapperProps {
  layout: PrintLayout;
  config: IndexListConfig;
  /** Unrotated content size in CSS px */
  contentPx: { w: number; h: number };
  isActive: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onRotate: () => void;
}

export function IndexListFrameWrapper({ layout, config, contentPx, isActive, onSelect, onRemove, onRotate }: IndexListFrameWrapperProps) {
  const { pois } = useMap();
  const resolved = resolveIndexConfig(config, layout);
  const rotation = config.rotation ?? 0;
  const showTitle = resolved.showTitle;
  const title = resolved.title;
  const titleBgColor = resolved.titleBackgroundColor;
  const titleFontSize = Math.max(6, resolved.titleFontSize * CSS_PX_PER_MM);
  const titleFontWeight = resolved.titleFontWeight;
  const radius = resolved.roundedCorners ? `${resolved.cornerRadius}mm` : '0';
  const borderWidth = `${resolved.borderWidth}mm`;
  const borderColor = resolved.borderColor;
  const backgroundColor = resolved.backgroundColor;
  const count = scopePois(pois, resolved, layout.viewports).length;

  const frameStyle: React.CSSProperties = {
    width: contentPx.w,
    height: contentPx.h,
    borderRadius: radius,
    borderWidth,
    borderColor,
    backgroundColor,
    overflow: 'hidden',
  };

  const rotTransform =
    rotation === 0 ? undefined : `rotate(${rotation === 270 ? -90 : rotation}deg)`;

  return (
    <div
      className="absolute inset-0 flex items-center justify-center"
      onClick={onSelect}
    >
      <div
        className={cn('relative border flex flex-col group shrink-0', !showTitle && 'frame-drag-handle cursor-grab', isActive && 'ring-2 ring-blue-500')}
        style={{ ...frameStyle, transform: rotTransform }}
      >
        <div className="absolute top-1 right-1 flex gap-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button variant="ghost" size="icon" className="h-6 w-6 bg-white/80" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onRotate(); }} title="Rotate 90°">
            <RotateCw className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6 bg-white/80" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onRemove(); }} title="Remove">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="absolute inset-0 flex flex-col">
          {showTitle && (
            <div
              className={cn('frame-drag-handle cursor-grab flex items-center justify-between px-2.5 py-1 uppercase tracking-[0.12em] shrink-0')}
              style={{
                backgroundColor: titleBgColor,
                color: resolved.titleTextColor,
                fontFamily: titleFontCss(resolved.titleFontFamily),
                fontSize: `${titleFontSize}px`,
                fontWeight: titleFontWeight,
              }}
            >
              <span className="truncate">{title}</span>
              <span className="text-[10px] font-normal normal-case tracking-normal" style={{ opacity: 0.8 }}>{count} places</span>
            </div>
          )}
          <IndexListFrame layout={layout} config={config} className="flex-1 min-h-0 overflow-hidden" />
        </div>
      </div>
    </div>
  );
}
