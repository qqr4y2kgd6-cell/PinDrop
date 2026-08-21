'use client';

import { useMap } from '@/context/MapContext';
import { PrintLayout, POI, IndexListConfig } from '@/types';
import { computeGridRefs } from '@/lib/mapStyle';
import { cn } from '@/lib/utils';
import { Utensils, Landmark, Building2, TreePine, Hotel, MapPin } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { titleFontCss } from '@/lib/titleFonts';
import { resolveIndexConfig, buildIndexGroups, distributeGroups, scopePois } from '@/lib/indexStyle';
import { CSS_PX_PER_MM } from '@/lib/units';

const weightCss = (w?: 'normal' | 'medium' | 'bold') => (w === 'bold' ? 700 : w === 'medium' ? 500 : 400);
const scaleFont = (basePx: number, mm?: number, baselineMm = 2.8) => Math.max(6, basePx * ((mm ?? baselineMm) / baselineMm));

const categoryIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  Food: Utensils,
  'Shrine/Temple': Landmark,
  Architecture: Building2,
  Park: TreePine,
  Hotel: Hotel,
};

export function categoryIcon(category: string) {
  return categoryIcons[category] || MapPin;
}

function formatNumber(num: number, format: 'number' | 'paren' | 'dot' | 'dash'): string {
  switch (format) {
    case 'paren': return `(${num}).`;
    case 'dot': return `${num}.`;
    case 'dash': return `- ${num}.`;
    case 'number':
    default: return `${num}.`;
  }
}

export function IndexListBody({
  layout,
  config,
  pois,
  compact = false,
}: {
  layout: PrintLayout;
  config: IndexListConfig;
  pois: POI[];
  compact?: boolean;
}) {
  const spotColor = layout.spotColor;
  const resolved = resolveIndexConfig(config, layout);

  // Legend body typography
  const bodyFont = resolved.bodyFontFamily;
  const bodySize = resolved.bodyFontSize;
  const bodyWeight = weightCss(resolved.bodyFontWeight);
  const bodyColor = resolved.bodyTextColor;
  const bodyFamilyCss = titleFontCss(bodyFont);
  const catFont = resolved.categoryFontFamily;
  const catWeight = weightCss(resolved.categoryFontWeight);
  const catColor = resolved.categoryColor;
  const catFamilyCss = titleFontCss(catFont);
  const numFont = resolved.numberFontFamily;
  const numSize = resolved.numberFontSize;
  const numWeight = weightCss(resolved.numberFontWeight);
  const numFamilyCss = titleFontCss(numFont);
  const iconSizePx = resolved.iconSize * CSS_PX_PER_MM;

  const scopedPois = scopePois(pois, resolved, layout.viewports);
  const gridRefs = computeGridRefs(scopedPois, layout.viewports);
  const groups = buildIndexGroups(scopedPois, resolved, layout.viewports);
  const columnsData = distributeGroups(groups, resolved.columns);

  // Column widths: use relative weights if provided
  const colWeights = columnsData.length > 0 && resolved.columnWidths.length >= columnsData.length
    ? resolved.columnWidths.slice(0, columnsData.length)
    : columnsData.map(() => 1);
  const totalWeight = colWeights.reduce((s, w) => s + w, 0) || 1;

  const textAlign = resolved.textAlign;
  const sepStyle = resolved.categorySeparatorStyle;
  const sepColor = resolved.categorySeparatorColor;
  const sepWidth = resolved.categorySeparatorWidth;
  const numFmt = resolved.numberFormat;

  return (
    <div
      className="w-full"
      style={{
        display: 'grid',
        gridTemplateColumns: columnsData.map((_, i) => `${(colWeights[i] ?? 1) / totalWeight}fr`).join(' '),
        columnGap: `${resolved.columnGap * CSS_PX_PER_MM}px`,
        padding: `${resolved.paddingTop * CSS_PX_PER_MM}px ${resolved.paddingRight * CSS_PX_PER_MM}px ${resolved.paddingBottom * CSS_PX_PER_MM}px ${resolved.paddingLeft * CSS_PX_PER_MM}px`,
        textAlign,
      }}
    >
      {columnsData.map((col, ci) => (
        <div key={ci} className="min-w-0">
          {col.map(({ category, items, continued }, gi) => {
            const Icon = categoryIcon(category);
            return (
              <div key={`${ci}-${gi}`} className="" style={{ marginBottom: `${resolved.lineHeight * CSS_PX_PER_MM}px` }}>
                {category && (
                  <div
                    className="flex items-center gap-1 uppercase tracking-widest"
                    style={{
                      ...(sepStyle !== 'none' ? { borderBottom: `1px solid ${sepColor}` } : {}),
                      fontFamily: catFamilyCss,
                      fontWeight: catWeight,
                      fontSize: scaleFont(compact ? 8 : 9, resolved.categoryFontSize),
                      letterSpacing: '0.14em',
                      color: catColor,
                      paddingBottom: 2,
                      marginBottom: `${resolved.lineHeight * 0.6 * CSS_PX_PER_MM}px`,
                      justifyContent: textAlign === 'right' ? 'flex-end' : textAlign === 'center' ? 'center' : 'flex-start',
                      flexDirection: textAlign === 'right' ? 'row-reverse' : 'row',
                    }}
                  >
                    {resolved.showIcons && (
                      <span className="shrink-0" style={{ color: sepColor, width: iconSizePx, height: iconSizePx }}>
                        <Icon className="w-full h-full" />
                      </span>
                    )}
                    <span>{category}{continued ? ' (cont.)' : ''}</span>
                  </div>
                )}
                <ul>
                  {items.map((poi) => (
                    textAlign === 'right' ? (
                      <li key={poi.id} className="flex items-baseline gap-1" style={{ color: bodyColor, flexDirection: 'row-reverse' }}>
                        <span
                          className="tabular-nums shrink-0"
                          style={{
                            color: spotColor,
                            fontWeight: numWeight,
                            fontFamily: numFamilyCss,
                            fontSize: scaleFont(compact ? 9 : 10, numSize),
                          }}
                        >
                          {formatNumber(poi.customNumber ?? 0, numFmt)}
                        </span>
                        <span
                          className="min-w-0"
                          style={{
                            fontFamily: bodyFamilyCss,
                            fontWeight: bodyWeight,
                            fontSize: scaleFont(compact ? 10 : 11, bodySize),
                            lineHeight: `${resolved.lineHeight * CSS_PX_PER_MM}px`,
                            textAlign: 'right',
                          }}
                        >
                          {poi.name}
                        </span>
                        <span
                          className="flex-1 border-b border-dotted border-zinc-300"
                          style={{ margin: '0 3px', minWidth: 8 }}
                        />
                        {resolved.showGridRefs && gridRefs[poi.id] ? (
                          <span
                            className="shrink-0"
                            style={{ fontFamily: bodyFamilyCss, fontSize: scaleFont(compact ? 8 : 9, bodySize), opacity: 0.6 }}
                          >
                            {gridRefs[poi.id]}
                          </span>
                        ) : null}
                      </li>
                    ) : (
                      <li key={poi.id} className="flex items-baseline gap-1" style={{ color: bodyColor, justifyContent: textAlign === 'center' ? 'center' : 'flex-start' }}>
                        {textAlign !== 'center' && (
                          <span
                            className="tabular-nums shrink-0"
                            style={{
                              color: spotColor,
                              fontWeight: numWeight,
                              fontFamily: numFamilyCss,
                              fontSize: scaleFont(compact ? 9 : 10, numSize),
                            }}
                          >
                            {formatNumber(poi.customNumber ?? 0, numFmt)}
                          </span>
                        )}
                        <span
                          className={textAlign === 'center' ? '' : 'min-w-0'}
                          style={{
                            fontFamily: bodyFamilyCss,
                            fontWeight: bodyWeight,
                            fontSize: scaleFont(compact ? 10 : 11, bodySize),
                            lineHeight: `${resolved.lineHeight * CSS_PX_PER_MM}px`,
                          }}
                        >
                          {poi.name}
                        </span>
                        {textAlign !== 'center' && (
                          <>
                            <span
                              className="flex-1 border-b border-dotted border-zinc-300"
                              style={{ margin: '0 3px', minWidth: 8 }}
                            />
                            {resolved.showGridRefs && gridRefs[poi.id] ? (
                              <span
                                className="shrink-0"
                                style={{ fontFamily: bodyFamilyCss, fontSize: scaleFont(compact ? 8 : 9, bodySize), opacity: 0.6 }}
                              >
                                {gridRefs[poi.id]}
                              </span>
                            ) : null}
                          </>
                        )}
                      </li>
                    )
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function IndexListFrame({
  layout,
  config,
  className,
}: {
  layout: PrintLayout;
  config: IndexListConfig;
  className?: string;
}) {
  const { pois } = useMap();
  return (
    <Card className={cn('w-full border-0 shadow-none ring-0 bg-transparent', className)}>
      <CardContent className="p-0">
        <IndexListBody layout={layout} config={config} pois={pois} compact />
      </CardContent>
    </Card>
  );
}
