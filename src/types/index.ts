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
  /** Grid-reference font family (id from LAYOUT_FONTS). Defaults to Helvetica. */
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
  /** Scale factor for POI marker size (1 = default). */
  poiMarkerScale?: number;
  // Rotation of the whole tile, in 90° steps.
  rotation?: 0 | 90 | 180 | 270;
  // Layout appearance
  showTitle?: boolean;
  showScaleBar?: boolean;
  showScaleText?: boolean;
  titleBackground?: boolean;
  titleBackgroundColor?: string;
  titleTextColor?: string;
  roundedCorners?: boolean;
  cornerRadius?: number; // mm
  borderWidth?: number; // mm
  borderColor?: string;
  backgroundColor?: string;
  // Per-tile title font override (falls back to the page-level title font)
  titleFontFamily?: string; // id from LAYOUT_FONTS
  titleFontSize?: number; // mm
  titleFontWeight?: 'normal' | 'medium' | 'bold';
  /** Map layer toggles + colors (roads/buildings/water/parks/land). */
  layers?: MapLayerStyle;
  /** Stacking order for overlapping tiles (higher = on top). Default 0. */
  stackOrder?: number;
  /** Title bar height in mm (default TITLE_BAR_MM = 7). */
  titleBarHeight?: number;
}

export type ColorMode = 'bw' | 'grayscale' | 'spot';

/**
 * A visual theme bundles a spot color, color mode, and layer style overrides
 * into a single reusable preset.
 */
export interface Theme {
  id: string;
  name: string;
  spotColor: string;
  colorMode: ColorMode;
  layers?: Partial<MapLayerStyle>;
}

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
  // Contour lines (from DEM tiles)
  showContourLines?: boolean;
  contourLineColor?: string;
  contourLineWidth?: number;
  contourIndexColor?: string;
  contourLabelColor?: string;
  contourLabelSize?: number;
  // Terrain hillshade
  showTerrain?: boolean;
  terrainOpacity?: number;
  // Satellite overlay
  showSatellite?: boolean;
  satelliteOpacity?: number;
  // Transit stops (bus, rail, tram, subway)
  showTransitStops?: boolean;
  transitStopColor?: string;
  transitStopSize?: number;
  // Trails / hiking paths
  showTrails?: boolean;
  trailColor?: string;
  trailWidth?: number;
  // Administrative boundaries (enhanced)
  showAdminBoundaries?: boolean;
  adminBoundaryColor?: string;
  adminBoundaryWidth?: number;
  showAdminLabels?: boolean;
  // POI labels overlay
  showPoiLabels?: boolean;
  poiLabelBgColor?: string;
  poiLabelTextColor?: string;
  poiLabelFontSize?: number;
  poiLabelPadding?: number;
  poiLabelBorderRadius?: number;
  poiLabelShadow?: boolean;
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
  /** Font family id (from PLACE_NAME_FONTS). Falls back to 'Noto Sans'. */
  fontFamily?: string;
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
  /** Stacking order for overlapping tiles (higher = on top). Default 0. */
  stackOrder?: number;
  // Layout
  textAlign?: 'left' | 'center' | 'right';
  columnGap?: number; // mm
  /** Relative widths for each column (e.g. [2, 1] makes the first column twice as wide). */
  columnWidths?: number[];
  /** Maximum tile height in mm (0 = unlimited). */
  maxHeight?: number;
  overflow?: 'clip' | 'ellipsis' | 'page';
  /** Show grid reference labels (C1, B2, etc.) next to POI entries. */
  showGridRefs?: boolean;
  // Style overrides (fall back to page-level indexList* fields)
  /** Inner padding of the index body, in mm. Falls back to the page default. */
  padding?: number;
  /** Per-side inner padding (mm). Override the uniform `padding` for individual sides. */
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  /** Vertical pitch between index rows, in mm. Falls back to the page default. */
  lineHeight?: number;
  showTitle?: boolean;
  showIcons?: boolean;
  iconSize?: number; // mm
  titlePadding?: number; // mm, padding inside title bar
  // Category header styling
  categorySeparatorStyle?: 'none' | 'underline' | 'line';
  categorySeparatorColor?: string;
  categorySeparatorWidth?: number; // mm
  /** @deprecated Use categorySeparatorStyle instead. Migrated automatically. */
  showCategoryUnderline?: boolean;
  // Number formatting
  numberFormat?: 'number' | 'paren' | 'dot' | 'dash';
  // Number-specific font (falls back to body font)
  numberFontFamily?: string;
  numberFontSize?: number;
  numberFontWeight?: 'normal' | 'medium' | 'bold';
  // Frame
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
  /** Show a border below the title bar header. Default false. */
  showTitleBorder?: boolean;
  /** Border width for the title bar header, in mm. Default 0.1. */
  titleBorderWidth?: number;
  /** Border color for the title bar header. Default inherits frame borderColor. */
  titleBorderColor?: string;
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
  /** Stacking order for overlapping tiles (higher = on top). Default 0. */
  stackOrder?: number;
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
  titleFontFamily?: string; // id from LAYOUT_FONTS (e.g. "Helvetica")
  titleFontSize?: number; // mm
  titleFontWeight?: 'normal' | 'medium' | 'bold';
  colorMode?: ColorMode;
  /** URL template for MapLibre glyph PBFs. Defaults to OpenFreeMap.
   *  Example: 'https://tiles.openstreetmap.us/fonts/{fontstack}/{range}.pbf' */
  glyphsUrl?: string;
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
  indexListBodyFontFamily?: string; // id from LAYOUT_FONTS
  indexListBodyFontSize?: number; // mm (baseline 2.8mm ≈ 8pt)
  indexListBodyFontWeight?: 'normal' | 'medium' | 'bold';
  indexListBodyTextColor?: string; // hex
  indexListCategoryFontFamily?: string; // falls back to body family
  indexListCategoryFontSize?: number; // mm (baseline 2.8mm ≈ 8pt)
  indexListCategoryFontWeight?: 'normal' | 'medium' | 'bold';
  indexListCategoryColor?: string; // hex
  /** Index list body inner padding, in mm. */
  indexListPadding?: number;
  /** Per-side index list padding (mm). Override the uniform padding. */
  indexListPaddingTop?: number;
  indexListPaddingRight?: number;
  indexListPaddingBottom?: number;
  indexListPaddingLeft?: number;
  /** Index list row pitch, in mm. */
  indexListLineHeight?: number;
  // Index list layout
  indexListTextAlign?: 'left' | 'center' | 'right';
  indexListColumnGap?: number; // mm
  indexListMaxHeight?: number; // mm, 0 = unlimited
  indexListOverflow?: 'clip' | 'ellipsis' | 'page';
  indexListShowGridRefs?: boolean;
  // Index list category separator
  indexListCategorySeparatorStyle?: 'none' | 'underline' | 'line';
  indexListCategorySeparatorColor?: string;
  indexListCategorySeparatorWidth?: number; // mm
  // Index list number formatting
  indexListNumberFormat?: 'number' | 'paren' | 'dot' | 'dash';
  indexListNumberFontFamily?: string;
  indexListNumberFontSize?: number;
  indexListNumberFontWeight?: 'normal' | 'medium' | 'bold';
  // Index list icon and title padding
  indexListIconSize?: number; // mm
  indexListTitlePadding?: number; // mm
}

export type PrintPage = PrintLayout & { id: string; name: string };
