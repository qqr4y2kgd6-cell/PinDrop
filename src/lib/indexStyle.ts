import { IndexListConfig, PrintLayout, POI } from '@/types';
import { viewportBounds, BBox } from './mapStyle';

/** Resolved index settings: per-tile config merged over the page defaults. */
export interface ResolvedIndex {
  title: string;
  columns: number;
  scope: 'all' | string[];
  sortBy: IndexListConfig['sortBy'];
  sortDirection: IndexListConfig['sortDirection'];
  groupBy: 'none' | 'category' | 'map';
  categoryOrder: string[];
  showTitle: boolean;
  showIcons: boolean;
  showCategoryUnderline: boolean;
  roundedCorners: boolean;
  cornerRadius: number;
  borderWidth: number;
  borderColor: string;
  backgroundColor: string;
  titleBackgroundColor: string;
  titleTextColor: string;
  titleFontFamily: string;
  titleFontSize: number;
  titleFontWeight: 'normal' | 'medium' | 'bold';
  bodyFontFamily: string;
  bodyFontSize: number;
  bodyFontWeight: 'normal' | 'medium' | 'bold';
  bodyTextColor: string;
  categoryFontFamily: string;
  categoryFontSize: number;
  categoryFontWeight: 'normal' | 'medium' | 'bold';
  categoryColor: string;
  /** Inner padding of the index body, in mm. */
  padding: number;
  /** Vertical pitch between index rows, in mm. */
  lineHeight: number;
}

export function resolveIndexConfig(config: IndexListConfig, page: PrintLayout): ResolvedIndex {
  const bodyFontFamily = config.bodyFontFamily ?? page.indexListBodyFontFamily ?? 'Helvetica';
  const bodyFontSize = config.bodyFontSize ?? page.indexListBodyFontSize ?? 2.8;
  const rawGroupBy = config.groupBy as string | boolean;
  const groupBy: 'none' | 'category' | 'map' =
    rawGroupBy === 'map' ? 'map' : rawGroupBy === 'none' || rawGroupBy === false ? 'none' : 'category';
  return {
    title: config.title ?? page.indexListTitle ?? 'Index',
    columns: Math.max(1, Math.round(config.columns ?? page.indexColumns ?? 2) || 1),
    scope: config.scope ?? 'all',
    sortBy: config.sortBy ?? 'number',
    sortDirection: config.sortDirection ?? 'asc',
    groupBy,
    categoryOrder: config.categoryOrder ?? [],
    showTitle: config.showTitle ?? page.indexListShowTitle ?? true,
    showIcons: config.showIcons ?? true,
    showCategoryUnderline: config.showCategoryUnderline ?? true,
    roundedCorners: config.roundedCorners ?? page.indexListRoundedCorners ?? false,
    cornerRadius: config.cornerRadius ?? page.indexListCornerRadius ?? 4,
    borderWidth: config.borderWidth ?? page.indexListBorderWidth ?? 1,
    borderColor: config.borderColor ?? page.indexListBorderColor ?? '#000000',
    backgroundColor: config.backgroundColor ?? page.indexListBackgroundColor ?? '#ffffff',
    titleBackgroundColor:
      config.titleBackgroundColor ?? page.indexListTitleBackgroundColor ?? page.defaultTitleBackgroundColor ?? page.spotColor,
    titleTextColor:
      config.titleTextColor ?? page.indexListTitleTextColor ?? page.defaultTitleTextColor ?? '#ffffff',
    titleFontFamily: config.titleFontFamily ?? page.indexListTitleFontFamily ?? page.titleFontFamily ?? 'Helvetica',
    titleFontSize: config.titleFontSize ?? page.indexListTitleFontSize ?? page.titleFontSize ?? 3,
    titleFontWeight: config.titleFontWeight ?? page.indexListTitleFontWeight ?? page.titleFontWeight ?? 'bold',
    bodyFontFamily,
    bodyFontSize,
    bodyFontWeight: config.bodyFontWeight ?? page.indexListBodyFontWeight ?? 'normal',
    bodyTextColor: config.bodyTextColor ?? page.indexListBodyTextColor ?? '#262626',
    categoryFontFamily: config.categoryFontFamily ?? page.indexListCategoryFontFamily ?? bodyFontFamily,
    categoryFontSize: config.categoryFontSize ?? page.indexListCategoryFontSize ?? 2.8,
    categoryFontWeight: config.categoryFontWeight ?? page.indexListCategoryFontWeight ?? 'bold',
    categoryColor: config.categoryColor ?? page.indexListCategoryColor ?? '#1a1a1a',
    padding: config.padding ?? page.indexListPadding ?? 1.5,
    lineHeight: config.lineHeight ?? page.indexListLineHeight ?? Math.max(1.2, Math.round(bodyFontSize * 1.3 * 10) / 10),
  };
}

/**
 * Sorts a POI list per the index config, then groups it by category, by map
 * (the viewport the POI appears on; highest zoom wins), or not at all.
 * Returns groups in display order.
 */
export function buildIndexGroups(
  pois: POI[],
  resolved: ResolvedIndex,
  viewports: Array<{ id: string; title?: string; center?: [number, number]; zoom?: number; positionOnPage?: { width: number; height: number }; bbox?: BBox }> = []
): Array<{ category: string; items: POI[] }> {
  const { sortBy, sortDirection, groupBy, categoryOrder } = resolved;
  const dir = sortDirection === 'desc' ? -1 : 1;

  const sorted = pois.slice().sort((a, b) => {
    let cmp = 0;
    if (sortBy === 'number') cmp = (a.customNumber || 999) - (b.customNumber || 999);
    else if (sortBy === 'name') cmp = a.name.localeCompare(b.name);
    else if (sortBy === 'category') cmp = a.category.localeCompare(b.category);
    else cmp = a.cityRegion.localeCompare(b.cityRegion);
    if (cmp === 0 && sortBy !== 'number') cmp = (a.customNumber || 999) - (b.customNumber || 999);
    return cmp * dir;
  });

  if (groupBy === 'none') {
    const cols = Math.max(1, resolved.columns);
    const perColumn = Math.max(1, Math.ceil(sorted.length / cols));
    const chunks: Array<{ category: string; items: POI[] }> = [];
    for (let i = 0; i < sorted.length; i += perColumn) {
      chunks.push({ category: '', items: sorted.slice(i, i + perColumn) });
    }
    return chunks;
  }

  if (groupBy === 'map') {
    const boundsCache = new Map<string, BBox | null>();
    const boundsFor = (vp: (typeof viewports)[number]): BBox | null => {
      if (boundsCache.has(vp.id)) return boundsCache.get(vp.id)!;
      let b: BBox | null = null;
      if (vp.center && vp.zoom && vp.positionOnPage) b = viewportBounds(vp as never);
      else if (vp.bbox) b = vp.bbox;
      boundsCache.set(vp.id, b);
      return b;
    };

    const mapGroups = new Map<string, POI[]>();
    const groupTitles = new Map<string, string>();
    for (const p of sorted) {
      let best: { id: string; zoom: number } | null = null;
      for (const vp of viewports) {
        const b = boundsFor(vp);
        if (!b) continue;
        if (p.lng < b[0] || p.lng > b[2] || p.lat < b[1] || p.lat > b[3]) continue;
        const zoom = vp.zoom ?? 0;
        if (!best || zoom > best.zoom) best = { id: vp.id, zoom };
      }
      const key = best ? best.id : '';
      const title = best ? (viewports.find((v) => v.id === best!.id)?.title || best.id) : 'Other';
      if (!mapGroups.has(key)) mapGroups.set(key, []);
      mapGroups.get(key)!.push(p);
      groupTitles.set(key, title);
    }

    const ordered = [
      ...viewports.map((v) => v.id),
      ...(mapGroups.has('') ? [''] : []),
    ].filter((id) => mapGroups.has(id));
    return ordered.map((id) => ({ category: groupTitles.get(id) || '', items: mapGroups.get(id)! }));
  }

  const groups = new Map<string, POI[]>();
  for (const p of sorted) {
    const arr = groups.get(p.category) || [];
    arr.push(p);
    groups.set(p.category, arr);
  }
  const keys = [...groups.keys()].sort((a, b) => {
    let ia = categoryOrder.indexOf(a);
    let ib = categoryOrder.indexOf(b);
    if (ia === -1) ia = Infinity;
    if (ib === -1) ib = Infinity;
    if (ia === ib) return a.localeCompare(b);
    return ia - ib;
  });
  return keys.map((category) => ({ category, items: groups.get(category)! }));
}

/** A column cell: a (possibly truncated) group of POIs. */
export interface IndexCell {
  category: string;
  items: POI[];
  /** true when this cell is the tail of a group that started in an earlier column. */
  continued?: boolean;
}

/**
 * Distributes sorted groups across columns, balanced by item count. Items flow
 * into columns of equal height (ceil(total / columns)); a group that straddles
 * a column boundary is split and its heading repeats at the top of the next
 * column. This guarantees the index actually divides into `columns` columns,
 * even when a single group (e.g. one map owning all POIs) is bigger than a
 * column can hold.
 */
export function distributeGroups(
  groups: Array<{ category: string; items: POI[] }>,
  columns: number
): IndexCell[][] {
  if (columns <= 1) return [groups.map((g) => ({ category: g.category, items: g.items }))];
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  const perColumn = Math.max(1, Math.ceil(total / columns));
  const cols: IndexCell[][] = Array.from({ length: columns }, () => []);
  let ci = 0;
  let countInCol = 0;
  for (const g of groups) {
    let rest = g.items;
    let first = true;
    while (rest.length > 0) {
      const room = Math.max(0, perColumn - countInCol);
      if (room === 0 && ci < cols.length - 1) {
        ci += 1;
        countInCol = 0;
        continue;
      }
      const take = room === 0 ? rest.length : Math.min(room, rest.length);
      cols[ci].push({ category: g.category, items: rest.slice(0, take), continued: !first });
      rest = rest.slice(take);
      countInCol += take;
      first = false;
    }
  }
  while (cols.length > 1 && cols[cols.length - 1].length === 0) cols.pop();
  return cols;
}

/** POIs a scoped index should list (active + within scoped viewport bounds). */
export function scopePois(
  pois: POI[],
  resolved: ResolvedIndex,
  viewports: Array<{ id: string; center: [number, number]; zoom: number; positionOnPage: { width: number; height: number }; bbox?: BBox }>
): POI[] {
  const active = pois.filter((p) => p.active);
  if (resolved.scope === 'all') return active;
  const ids = new Set(resolved.scope);
  const vps = viewports.filter((v) => ids.has(v.id));
  if (vps.length === 0) return [];
  return active.filter((p) =>
    vps.some((v) => {
      const b = viewportBounds(v);
      return p.lng >= b[0] && p.lng <= b[2] && p.lat >= b[1] && p.lat <= b[3];
    })
  );
}

export type { BBox };
