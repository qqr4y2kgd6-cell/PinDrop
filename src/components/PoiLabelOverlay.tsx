'use client';

import { useEffect, useState } from 'react';
import { Map } from 'maplibre-gl';
import { CSS_PX_PER_MM } from '@/lib/units';

const MM_TO_PX = CSS_PX_PER_MM;

export interface PoiLabelStyle {
  bgColor: string;
  textColor: string;
  fontSize: number; // mm
  padding: number; // mm
  borderRadius: number; // mm
  showShadow: boolean;
}

export interface PoiLabelOverlayProps {
  map: Map | null;
  pois: Array<{ id: string; name: string; lat: number; lng: number; active: boolean }>;
  style: PoiLabelStyle;
  scale?: number; // for PrintMapMini scaled containers
}

export function PoiLabelOverlay({ map, pois, style, scale = 1 }: PoiLabelOverlayProps) {
  const [positions, setPositions] = useState<Array<{ id: string; name: string; x: number; y: number }>>([]);

  useEffect(() => {
    if (!map) return;

    const update = () => {
      const active = pois.filter((p) => p.active);
      const projected = active.map((p) => {
        const pt = map.project([p.lng, p.lat]);
        return {
          id: p.id,
          name: p.name,
          x: pt.x * scale,
          y: pt.y * scale,
        };
      });
      setPositions(projected);
    };

    update();

    const onMove = () => update();
    map.on('move', onMove);
    map.on('zoom', onMove);
    map.on('resize', onMove);
    map.on('pitch', onMove);

    return () => {
      map.off('move', onMove);
      map.off('zoom', onMove);
      map.off('resize', onMove);
      map.off('pitch', onMove);
    };
  }, [map, pois, scale]);

  if (!map || positions.length === 0) return null;

  const fontSizePx = style.fontSize * MM_TO_PX * scale;
  const borderRadiusPx = style.borderRadius * MM_TO_PX * scale;
  const arrowSize = Math.max(3, 5 * scale);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {positions.map((p) => (
        <div
          key={p.id}
          className="pointer-events-auto absolute whitespace-nowrap"
          style={{
            left: p.x,
            top: p.y,
            transform: 'translate(-50%, -100%) translateY(-8px)',
          }}
        >
          <div
            style={{
              backgroundColor: style.bgColor,
              color: style.textColor,
              fontSize: fontSizePx,
              padding: `${style.padding * MM_TO_PX * scale}px ${style.padding * 1.5 * MM_TO_PX * scale}px`,
              borderRadius: borderRadiusPx,
              boxShadow: style.showShadow ? '0 1px 3px rgba(0,0,0,0.2)' : 'none',
              fontFamily: 'system-ui, sans-serif',
              lineHeight: '1.2',
              whiteSpace: 'nowrap',
            }}
          >
            {p.name}
          </div>
          <div
            style={{
              width: 0,
              height: 0,
              borderLeft: `${arrowSize}px solid transparent`,
              borderRight: `${arrowSize}px solid transparent`,
              borderTop: `${arrowSize}px solid ${style.bgColor}`,
              margin: '0 auto',
            }}
          />
        </div>
      ))}
    </div>
  );
}
