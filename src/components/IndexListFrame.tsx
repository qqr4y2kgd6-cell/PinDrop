'use client';

import { useMap } from '@/context/MapContext';
import { PrintLayout, POI, IndexListConfig } from '@/types';
import { computeGridRefs } from '@/lib/mapStyle';
import { cn } from '@/lib/utils';
import { Utensils, Landmark, Building2, TreePine, Hotel, MapPin } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { titleFontCss } from '@/lib/titleFonts';
import { resolveIndexConfig, buildIndexGroups, distributeGroups, scopePois } from '@/lib/indexStyle';

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

  const scopedPois = scopePois(pois, resolved, layout.viewports);
  const gridRefs = computeGridRefs(scopedPois, layout.viewports);
  const groups = buildIndexGroups(scopedPois, resolved, layout.viewports);
  const columnsData = distributeGroups(groups, resolved.columns);

  return (
    <div
      className="w-full"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columnsData.length}, minmax(0, 1fr))`,
        columnGap: compact ? 12 : 20,
        padding: `${resolved.padding * 2}px`,
      }}
    >
      {columnsData.map((col, ci) => (
        <div key={ci} className="min-w-0">
          {col.map(({ category, items, continued }) => {
            const Icon = categoryIcon(category);
            return (
              <div key={category} className="" style={{ marginBottom: `${resolved.lineHeight}px` }}>
                {category && (
                  <div
                    className="flex items-center gap-1 uppercase tracking-widest"
                    style={{
                      ...(resolved.showCategoryUnderline ? { borderBottom: `1px solid ${spotColor}` } : {}),
                      fontFamily: catFamilyCss,
                      fontWeight: catWeight,
                      fontSize: scaleFont(compact ? 8 : 9, resolved.categoryFontSize),
                      letterSpacing: '0.14em',
                      color: catColor,
                      paddingBottom: 2,
                      marginBottom: `${resolved.lineHeight * 0.6}px`,
                    }}
                  >
                    {resolved.showIcons && (
                      <span className="shrink-0" style={{ color: spotColor }}>
                        <Icon className="h-3 w-3" />
                      </span>
                    )}
                    <span>{category}{continued ? ' (cont.)' : ''}</span>
                  </div>
                )}
                <ul>
                  {items.map((poi) => (
                    <li key={poi.id} className="flex items-baseline gap-1" style={{ color: bodyColor }}>
                      <span
                        className="tabular-nums shrink-0"
                        style={{
                          color: spotColor,
                          fontWeight: 700,
                          fontFamily: bodyFamilyCss,
                          fontSize: scaleFont(compact ? 9 : 10, bodySize),
                        }}
                      >
                        {poi.customNumber}.
                      </span>
                      <span
                        className="min-w-0"
                        style={{
                          fontFamily: bodyFamilyCss,
                          fontWeight: bodyWeight,
                          fontSize: scaleFont(compact ? 10 : 11, bodySize),
                          lineHeight: `${resolved.lineHeight * 2}px`,
                        }}
                      >
                        {poi.name}
                      </span>
                      <span
                        className="flex-1 border-b border-dotted border-zinc-300"
                        style={{ margin: '0 3px', minWidth: 8 }}
                      />
                      {gridRefs[poi.id] ? (
                        <span
                          className="shrink-0"
                          style={{ fontFamily: bodyFamilyCss, fontSize: scaleFont(compact ? 8 : 9, bodySize), opacity: 0.6 }}
                        >
                          {gridRefs[poi.id]}
                        </span>
                      ) : null}
                    </li>
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
