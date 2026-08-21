/**
 * Available font families for place-name labels.
 *
 * The map's glyphs are served by the same-origin glyph proxy
 * (`/api/glyphs/...`, see src/app/api/glyphs) which forwards to the public
 * OpenMapTiles/OSM.us font server.  That server hosts PostScript-style names
 * (e.g. "Open Sans Regular", "Noto Sans Bold") for every font below, including
 * the Norwegian glyphs (æ, ø, å).  `glyphFontstack` produces those names; an
 * array lets the proxy fall back to "Noto Sans" if a variant is missing.
 *
 * Google Fonts are loaded via <link> tags for the canvas/SVG vector label
 * renderer (used by the PDF exporter and DOM previews), which is independent
 * of the MapLibre glyph pipeline above.
 */

export interface PlaceNameFont {
  /** Config id stored in PlaceNameTierStyle.fontFamily */
  id: string;
  /** Human-readable label shown in the UI */
  label: string;
  /** Google Fonts CSS2 family query value (for <link> tag loading) */
  googleFamily: string;
  /** CSS fallback for DOM / SVG rendering */
  css: string;
}

export const PLACE_NAME_FONTS: PlaceNameFont[] = [
  // Sans-serif
  { id: 'Noto Sans', label: 'Noto Sans', googleFamily: 'Noto+Sans:wght@400;700', css: "'Noto Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif" },
  { id: 'Open Sans', label: 'Open Sans', googleFamily: 'Open+Sans:wght@400;700', css: "'Open Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif" },
  { id: 'Roboto', label: 'Roboto', googleFamily: 'Roboto:wght@400;700', css: "Roboto, 'Helvetica Neue', Helvetica, Arial, sans-serif" },
  { id: 'Metropolis', label: 'Metropolis', googleFamily: 'Metropolis:wght@400;700', css: "Metropolis, 'Helvetica Neue', Helvetica, Arial, sans-serif" },
  { id: 'Nunito Sans', label: 'Nunito Sans', googleFamily: 'Nunito+Sans:wght@400;700', css: "'Nunito Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif" },
  // Serif
  { id: 'Noto Sans Serif', label: 'Noto Sans Serif', googleFamily: 'Noto+Sans+Serif:wght@400;700', css: "'Noto Serif', Georgia, 'Times New Roman', serif" },
];

/**
 * MapLibre text-font entries for a given font id.
 *
 * The glyphs PBF server (tiles.openstreetmap.us) expects PostScript-style
 * names: "Open Sans Regular", "Open Sans Bold", "Noto Sans Regular", etc.
 * An array is used so MapLibre can fall back to the next font if the primary
 * doesn't have a glyph for a given Unicode code-point (e.g. localised
 * characters the primary font doesn't cover).
 */
export function glyphFontstack(
  fontFamily: string | undefined,
  bold: boolean | undefined,
  italic: boolean | undefined,
): string[] {
  const suffix = bold && italic ? ' Bold Italic' : bold ? ' Bold' : italic ? ' Italic' : ' Regular';
  const id = fontFamily ?? 'Noto Sans';
  const primary = `${id}${suffix}`;
  const fallback = `Noto Sans${suffix}`;
  if (id === 'Noto Sans') return [primary];
  return [primary, fallback];
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
 * Inject <link rel="stylesheet"> tags for every Google Font used by the app.
 * This makes fonts available for canvas rendering (used by MapLibre when a
 * glyphs PBF 404s locally or for DOM/SVG uses).
 *
 * Returns a promise that resolves once all fonts are loaded.  Safe to call
 * multiple times – the injection and the ready-promise are deduplicated.
 */
export function ensureGoogleFonts(): Promise<void> {
  if (fontsReady) return fontsReady;

  fontsReady = (async () => {
    if (typeof document === 'undefined') return; // SSR guard

    const families = PLACE_NAME_FONTS.map((f) => f.googleFamily);
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
