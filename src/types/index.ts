export interface POI {
  id: string;
  name: string;
  category: 'Food' | 'Architecture' | 'Shrine/Temple' | 'Park' | 'Hotel' | string;
  cityRegion: string;
  lat: number;
  lng: number;
  recommendedBy?: string;
  notes?: string;
  customNumber?: number; // Used for map markers and index list
  active: boolean;
  gridRef?: string; // e.g. "B3"
}

export interface MapViewport {
  id: string;
  title: string;
  center: [number, number]; // [lng, lat]
  zoom: number;
  bbox?: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]
  positionOnPage: {
    x: number; // mm or %
    y: number; // mm or %
    width: number;
    height: number;
  };
  showGrid: boolean;
  /** Show the "Grid = … × …" size label in the title bar / PDF. Default on. */
  showGridIndicator?: boolean;
  gridRef?: string; // e.g. "B3"
  // Real-world unit grid (replaces the fixed 4×4 overlay when enabled)
  gridSpacing?: number; // meters; undefined = auto-pick
  gridLineWidth?: number; // mm
  gridOpacity?: number; // 0..1
  gridColor?: string; // hex
  // Cartographic border (ticks + coordinate labels along the map edge)
  showBorder?: boolean;
  /** Toggle only the ticks + coordinate labels; the border frame stays. */
  showBorderTicks?: boolean;
  /** Render the grid-border frame as alternating two-color segments. */
  borderAlternating?: boolean;
  /** Second color for the alternating grid-border frame (default white). */
  borderAlternateColor?: string;
  /** Draw thin inner + outer outline lines around the alternating band. */
  borderAlternatingOutline?: boolean;
  /** Thickness of the alternating-frame outline lines, in mm. */
  borderAlternatingOutlineWidth?: number;
  /** Fill color of the corner squares where the frame sides meet. */
  borderAlternatingCornerColor?: string;
  /** Line thickness of the cartographic border frame and ticks, in mm. */
  gridBorderWidth?: number;
  /** Show the letter/number grid references (A, B, … / 1, 2, …) at the map edge. */
  showGridRefs?: boolean;
  /** Grid-reference font family (id from TITLE_FONTS). Defaults to Helvetica. */
  gridRefFontFamily?: string;
  /** Grid-reference font size in mm. Defaults to 2.8. */
  gridRefFontSize?: number;
  /** Grid-reference font weight. Defaults to normal. */
  gridRefFontWeight?: 'normal' | 'medium' | 'bold';
  /** Grid-reference text color. Defaults to a dark gray. */
  gridRefFontColor?: string;
  /** Outline the extents of smaller maps (insets) that fall inside this map. */
  showInsets?: boolean;
  /**
   * Explicit ids of maps to outline as insets. `undefined` = none (opt-in);
   * a defined array (possibly empty) is authoritative. For legacy layouts that
   * only set `showInsets === true`, an empty list falls back to all maps.
   */
  insetViewportIds?: string[];
  /** Line color for inset outlines. */
  insetColor?: string;
  /** Line thickness of inset outlines, in mm. */
  insetLineWidth?: number;
  /** Draw the inset map's title next to its outline. */
  showInsetLabels?: boolean;
  /**
   * Per-map POI visibility: ids of active POIs to render on this map.
   * `undefined` = show every globally-active POI. The list is authoritative
   * once set (possibly empty = no POIs).
   */
  visiblePoiIds?: string[];
  /**
   * Spread overlapping POI badges apart spider-style (with leader lines).
   * `undefined` = on. When off, badges render at their true positions.
   */
  spiderify?: boolean;
  // Rotation of the whole tile, in 90° steps.
  rotation?: 0 | 90 | 180 | 270;
  // Layout appearance
  showTitle?: boolean;
  titleBackground?: boolean;
  titleBackgroundColor?: string;
  titleTextColor?: string;
  roundedCorners?: boolean;
  cornerRadius?: number; // mm
  borderWidth?: number; // mm
  borderColor?: string;
  backgroundColor?: string;
  // Per-tile title font override (falls back to the page-level title font)
  titleFontFamily?: string; // id from TITLE_FONTS
  titleFontSize?: number; // mm
  titleFontWeight?: 'normal' | 'medium' | 'bold';
  /** Map layer toggles + colors (roads/buildings/water/parks/land). */
  layers?: MapLayerStyle;
}

export type ColorMode = 'bw' | 'grayscale' | 'spot';

/**
 * Per-viewport map layer styling. `undefined` fields fall back to the print
 * defaults, so a viewport only stores the overrides the user actually changed.
 * Applied to the editor map, the layout mini tiles and the PDF export so all
 * three stay in sync.
 */
export interface MapLayerStyle {
  showRoads?: boolean;
  roadColor?: string;
  roadWidth?: number;
  roadOpacity?: number;
  showBuildings?: boolean;
  buildingColor?: string;
  buildingOutlineColor?: string;
  buildingOpacity?: number;
  showWater?: boolean;
  waterColor?: string;
  waterOpacity?: number;
  showParks?: boolean;
  parkColor?: string;
  parkOpacity?: number;
  landColor?: string;
  /** Place-name labels (settlements, admin regions, islands, water, roads). */
  placeNames?: PlaceNamesConfig;
}

export interface PlaceNameTierStyle {
  show?: boolean;
  color?: string;
  sizeMm?: number;
  bold?: boolean;
  italic?: boolean;
  uppercase?: boolean;
  haloColor?: string;
  haloWidthMm?: number;
}

export type PlaceNameLang = 'local' | 'english';

export interface PlaceNamesConfig {
  show?: boolean;
  /** 'local' = native script (name); 'english' = name:en when available. */
  lang?: PlaceNameLang;
  country?: PlaceNameTierStyle;
  city?: PlaceNameTierStyle;
  town?: PlaceNameTierStyle;
  village?: PlaceNameTierStyle;
  suburb?: PlaceNameTierStyle;
  island?: PlaceNameTierStyle;
  water?: PlaceNameTierStyle;
  road?: PlaceNameTierStyle;
}

export interface Rect {
  x: number; // mm
  y: number; // mm
  width: number; // mm
  height: number; // mm
}

export type IndexSortBy = 'number' | 'name' | 'category' | 'cityRegion';
export type IndexSortDirection = 'asc' | 'desc';

/**
 * A single index (legend) tile. Styling fields fall back to the page-level
 * `indexList*` defaults via `resolveIndexConfig`.
 */
export interface IndexListConfig {
  id: string;
  position: Rect;
  title?: string;
  columns?: number;
  /** 'all' = every active POI; otherwise viewport ids the index is scoped to. */
  scope: 'all' | string[];
  sortBy: IndexSortBy;
  sortDirection: IndexSortDirection;
  /** How to group index rows: by POI category, by the map they appear on, or not at all. */
  groupBy: 'none' | 'category' | 'map';
  categoryOrder?: string[];
  rotation?: 0 | 90 | 180 | 270;
  // Style overrides (fall back to page-level indexList* fields)
  /** Inner padding of the index body, in mm. Falls back to the page default. */
  padding?: number;
  /** Vertical pitch between index rows, in mm. Falls back to the page default. */
  lineHeight?: number;
  showTitle?: boolean;
  showIcons?: boolean;
  /** Draw the line underneath category headers. */
  showCategoryUnderline?: boolean;
  roundedCorners?: boolean;
  cornerRadius?: number;
  borderWidth?: number;
  borderColor?: string;
  backgroundColor?: string;
  titleBackgroundColor?: string;
  titleTextColor?: string;
  titleFontFamily?: string;
  titleFontSize?: number;
  titleFontWeight?: 'normal' | 'medium' | 'bold';
  bodyFontFamily?: string;
  bodyFontSize?: number;
  bodyFontWeight?: 'normal' | 'medium' | 'bold';
  bodyTextColor?: string;
  categoryFontFamily?: string;
  categoryFontSize?: number;
  categoryFontWeight?: 'normal' | 'medium' | 'bold';
  categoryColor?: string;
}

/** A standalone title/subtitle block that can be moved, resized and rotated. */
export interface TitleBlockConfig {
  id: string;
  position: Rect;
  title: string;
  subtitle?: string;
  rotation?: 0 | 90 | 180 | 270;
  align?: 'left' | 'center' | 'right';
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: 'normal' | 'medium' | 'bold';
  textColor?: string;
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
}

export interface PrintLayout {
  id?: string;
  name?: string;
  pageSize: 'A4' | 'A3' | 'A2' | 'Custom';
  orientation: 'portrait' | 'landscape';
  customPageSize?: { width: number; height: number }; // mm, used when pageSize === 'Custom'
  spotColor: string; // hex code
  /** Background color of the paper (page). Defaults to white. */
  paperColor?: string;
  viewports: MapViewport[];
  indexLists: IndexListConfig[];
  titleBlocks: TitleBlockConfig[];
  indexColumns: number;
  // Page layout
  pageMargins?: { top: number; right: number; bottom: number; left: number }; // mm
  itemSpacing?: number; // mm between items
  /** When true, drag/resize snaps tiles to the 1/16 fold grid. */
  snapToFold?: boolean;
  defaultTitleBackgroundColor?: string;
  defaultTitleTextColor?: string;
  titleFontFamily?: string; // id from TITLE_FONTS (e.g. "Helvetica")
  titleFontSize?: number; // mm
  titleFontWeight?: 'normal' | 'medium' | 'bold';
  colorMode?: ColorMode;
  // Index list (legend) tile default appearance — per-tile configs inherit these.
  indexListTitle?: string;
  indexListShowTitle?: boolean;
  indexListTitleBackgroundColor?: string;
  indexListRoundedCorners?: boolean;
  indexListCornerRadius?: number; // mm
  indexListBorderWidth?: number; // mm
  indexListBorderColor?: string;
  indexListBackgroundColor?: string;
  indexListTitleTextColor?: string;
  indexListTitleFontFamily?: string;
  indexListTitleFontSize?: number; // mm
  indexListTitleFontWeight?: 'normal' | 'medium' | 'bold';
  // Index list (legend) body text — applied to category headers and entries
  indexListBodyFontFamily?: string; // id from TITLE_FONTS
  indexListBodyFontSize?: number; // mm (baseline 2.8mm ≈ 8pt)
  indexListBodyFontWeight?: 'normal' | 'medium' | 'bold';
  indexListBodyTextColor?: string; // hex
  indexListCategoryFontFamily?: string; // falls back to body family
  indexListCategoryFontSize?: number; // mm (baseline 2.8mm ≈ 8pt)
  indexListCategoryFontWeight?: 'normal' | 'medium' | 'bold';
  indexListCategoryColor?: string; // hex
  /** Index list body inner padding, in mm. */
  indexListPadding?: number;
  /** Index list row pitch, in mm. */
  indexListLineHeight?: number;
}

export type PrintPage = PrintLayout & { id: string; name: string };
