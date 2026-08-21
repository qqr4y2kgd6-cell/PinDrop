'use client';

import { PrintLayout, TitleBlockConfig } from '@/types';
import { Trash2, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { titleFontCss } from '@/lib/titleFonts';
import { CSS_PX_PER_MM } from '@/lib/units';

interface TitleBlockFrameProps {
  layout: PrintLayout;
  config: TitleBlockConfig;
  boxPx: { w: number; h: number };
  contentPx: { w: number; h: number };
  isActive: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onRotate: () => void;
}

const weightCss = (w?: 'normal' | 'medium' | 'bold') => (w === 'bold' ? 700 : w === 'medium' ? 500 : 400);

export function TitleBlockFrame({ layout, config, contentPx, isActive, onSelect, onRemove, onRotate }: TitleBlockFrameProps) {
  const rotation = config.rotation ?? 0;
  const fontFamily = config.fontFamily ?? layout.titleFontFamily ?? 'Helvetica';
  const fontSize = Math.max(6, (config.fontSize ?? layout.titleFontSize ?? 5) * CSS_PX_PER_MM);
  const fontWeight = config.fontWeight ?? 'bold';
  const textColor = config.textColor ?? '#1a1a1a';
  const backgroundColor = config.backgroundColor ?? '#ffffff';
  const borderColor = config.borderColor ?? '#000000';
  const borderWidth = `${config.borderWidth ?? 0.1}mm`;
  const align = config.align ?? 'left';

  const frameStyle: React.CSSProperties = {
    width: contentPx.w,
    height: contentPx.h,
    borderWidth,
    borderColor,
    backgroundColor,
  };

  const rotTransform = rotation === 0 ? undefined : `rotate(${rotation === 270 ? -90 : rotation}deg)`;
  const justify = align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center';

  return (
    <div className="absolute inset-0 flex items-center justify-center" onClick={onSelect}>
      <div
        className={cn('frame-drag-handle relative border flex flex-col group cursor-grab shrink-0', isActive && 'ring-2 ring-blue-500')}
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
        <div
          className="absolute inset-0 flex flex-col justify-center px-3"
          style={{ alignItems: justify }}
        >
          <div
            className="uppercase leading-tight"
            style={{ fontFamily: titleFontCss(fontFamily), fontWeight: weightCss(fontWeight), fontSize: `${fontSize}px`, color: textColor, letterSpacing: '0.05em' }}
          >
            {config.title}
          </div>
          {config.subtitle ? (
            <div
              className="leading-tight"
              style={{ fontFamily: titleFontCss(fontFamily), fontWeight: 400, fontSize: `${Math.max(6, fontSize * 0.6)}px`, color: textColor, opacity: 0.8, letterSpacing: '0.08em' }}
            >
              {config.subtitle}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
