/**
 * Available font families for place-name labels.
 *
 * The map's glyphs are served by the same-origin glyph route
 * (`/api/glyphs/...`, see src/app/api/glyphs) which reads glyph PBFs generated
 * at build time from the actual Google Font TTFs (scripts/build-glyphs.mjs)
 * and falls back to the public OSM.us font server.  Every offered font covers
 * the Latin / Nordic glyphs (æ, ø, å, …).  Japanese / Chinese / Korean are not
 * in these Latin fonts; they are rendered locally by MapLibre via
 * `localIdeographFontFamily` (see CJK_IDEOGRAPH_FONT) using a CJK-capable
 * browser font loaded below.
 *
 * `glyphFontstack` produces the MapLibre fontstack name (e.g. "Inter Regular").
 * Google Fonts are also loaded via <link> tags for any canvas / SVG use.
 */

export interface PlaceNameFont {
  /** Config id stored in PlaceNameTierStyle.fontFamily + MapLibre fontstack base */
  id: string;
  /** Human-readable label shown in the UI */
  label: string;
  /** Google Fonts CSS2 family query value (for <link> tag loading) */
  googleFamily: string;
  /** CSS fallback for DOM / SVG rendering */
  css: string;
}

/** Curated place-name fonts (Latin / Nordic coverage). */
export const PLACE_NAME_FONTS: PlaceNameFont[] = [
  // Sans-serif
  { id: 'Inter', label: 'Inter', googleFamily: 'Inter:ital,wght@0,400;0,700;1,400;1,700', css: "'Inter', system-ui, sans-serif" },
  { id: 'Roboto', label: 'Roboto', googleFamily: 'Roboto:ital,wght@0,400;0,500;0,700;1,400;1,700', css: "'Roboto', system-ui, sans-serif" },
  { id: 'Open Sans', label: 'Open Sans', googleFamily: 'Open+Sans:ital,wght@0,400;0,600;0,700;1,400;1,700', css: "'Open Sans', system-ui, sans-serif" },
  { id: 'Noto Sans', label: 'Noto Sans', googleFamily: 'Noto+Sans:ital,wght@0,400;0,700;1,400;1,700', css: "'Noto Sans', system-ui, sans-serif" },
  { id: 'Lato', label: 'Lato', googleFamily: 'Lato:ital,wght@0,400;0,700;1,400;1,700', css: "'Lato', system-ui, sans-serif" },
  { id: 'Montserrat', label: 'Montserrat', googleFamily: 'Montserrat:ital,wght@0,400;0,600;0,700;1,400;1,700', css: "'Montserrat', system-ui, sans-serif" },
  { id: 'Poppins', label: 'Poppins', googleFamily: 'Poppins:ital,wght@0,400;0,500;0,600;0,700;1,400;1,700', css: "'Poppins', system-ui, sans-serif" },
  { id: 'Work Sans', label: 'Work Sans', googleFamily: 'Work+Sans:ital,wght@0,400;0,600;0,700;1,400;1,700', css: "'Work Sans', system-ui, sans-serif" },
  // Serif
  { id: 'Noto Serif', label: 'Noto Serif', googleFamily: 'Noto+Serif:ital,wght@0,400;0,700;1,400;1,700', css: "'Noto Serif', Georgia, serif" },
  { id: 'Merriweather', label: 'Merriweather', googleFamily: 'Merriweather:ital,wght@0,400;0,700;1,400;1,700', css: "'Merriweather', Georgia, serif" },
  { id: 'Lora', label: 'Lora', googleFamily: 'Lora:ital,wght@0,400;0,500;0,600;0,700;1,400;1,700', css: "'Lora', Georgia, serif" },
  { id: 'Playfair Display', label: 'Playfair Display', googleFamily: 'Playfair+Display:ital,wght@0,400;0,700;1,400;1,700', css: "'Playfair Display', Georgia, serif" },
  { id: 'PT Serif', label: 'PT Serif', googleFamily: 'PT+Serif:ital,wght@0,400;0,700;1,400;1,700', css: "'PT Serif', Georgia, serif" },
  { id: 'Source Serif 4', label: 'Source Serif 4', googleFamily: 'Source+Serif+4:ital,wght@0,400;0,600;0,700;1,400;1,700', css: "'Source Serif 4', Georgia, serif" },
  { id: 'Spectral', label: 'Spectral', googleFamily: 'Spectral:ital,wght@0,400;0,600;0,700;1,400;1,700', css: "'Spectral', Georgia, serif" },
  { id: 'EB Garamond', label: 'EB Garamond', googleFamily: 'EB+Garamond:ital,wght@0,400;0,500;0,700;1,400;1,700', css: "'EB Garamond', Georgia, serif" },
  // Monospace
  { id: 'Roboto Mono', label: 'Roboto Mono', googleFamily: 'Roboto+Mono:ital,wght@0,400;0,700;1,400;1,700', css: "'Roboto Mono', ui-monospace, monospace" },
  { id: 'Space Mono', label: 'Space Mono', googleFamily: 'Space+Mono:ital,wght@0,400;0,700;1,400;1,700', css: "'Space Mono', ui-monospace, monospace" },
];

/**
 * CJK fonts used by MapLibre's `localIdeographFontFamily`. They are loaded via
 * Google Fonts (below) and render Japanese / Chinese / Korean place names
 * locally (the Latin glyph PBFs don't contain those codepoints). The browser
 * resolves each character against the stack in priority order.
 */
export const CJK_IDEOGRAPH_FONT = 'Noto Sans JP, Noto Sans SC, Noto Sans TC, Noto Sans KR';

const CJK_GOOGLE_FAMILIES = [
  'Noto+Sans+JP:wght@400;700',
  'Noto+Sans+SC:wght@400;700',
  'Noto+Sans+TC:wght@400;700',
  'Noto+Sans+KR:wght@400;700',
];

/**
 * MapLibre text-font entry for a given font id.  Returns a single fontstack
 * name (e.g. "Inter Regular", "Inter Bold Italic"); the glyph route serves the
 * generated PBF, falling back to the public font server if a stack is missing.
 */
export function glyphFontstack(
  fontFamily: string | undefined,
  bold: boolean | undefined,
  italic: boolean | undefined,
): string[] {
  const suffix = bold && italic ? ' Bold Italic' : bold ? ' Bold' : italic ? ' Italic' : ' Regular';
  const id = fontFamily ?? 'Noto Sans';
  return [`${id}${suffix}`];
}

/** CSS font-family string for a given font id. */
export function placeNameFontCss(fontFamily?: string): string {
  return PLACE_NAME_FONTS.find((f) => f.id === fontFamily)?.css ?? PLACE_NAME_FONTS[0].css;
}

/* ------------------------------------------------------------------ */
/*  Google Fonts preloading via <link> tags                             */
/* ------------------------------------------------------------------ */

let fontsReady: Promise<void> | null = null;

/**
 * Inject <link rel="stylesheet"> tags for every Google Font used by the app
 * (place-name fonts + CJK ideograph fonts) so they are available for canvas /
 * DOM rendering and for MapLibre's local ideograph renderer.
 *
 * Returns a promise that resolves once all fonts are loaded.  Deduplicated.
 */
export function ensureGoogleFonts(): Promise<void> {
  if (fontsReady) return fontsReady;

  fontsReady = (async () => {
    if (typeof document === 'undefined') return; // SSR guard

    const families = [...PLACE_NAME_FONTS.map((f) => f.googleFamily), ...CJK_GOOGLE_FAMILIES];
    const unique = [...new Set(families)];

    const params = unique.map((f) => `family=${f}`).join('&');
    const href = `https://fonts.googleapis.com/css2?${params}&display=swap`;

    if (!document.querySelector(`link[href="${href}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      document.head.appendChild(link);
    }

    await document.fonts.ready;
  })();

  return fontsReady;
}

/* ------------------------------------------------------------------ */
/*  Batch pre-loading for PDF export                                   */
/* ------------------------------------------------------------------ */

import type { PlaceNamesConfig } from '@/types';

/**
 * Ensure every Google Font referenced by a layout's place-names config is
 * loaded before the PDF exporter captures the map.
 */
export async function preloadLayoutFonts(placeNames?: PlaceNamesConfig): Promise<void> {
  if (!placeNames?.show) return;
  await ensureGoogleFonts();
}
