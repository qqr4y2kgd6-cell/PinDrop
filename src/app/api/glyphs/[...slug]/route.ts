import { type NextRequest } from 'next/server';

/**
 * Same-origin proxy for MapLibre glyph (SDF font) PBFs.
 *
 * MapLibre requests glyphs from a `glyphs` URL template. The Public glyph
 * server we rely on (tiles.openstreetmap.us) does NOT send CORS headers, so a
 * browser fetch from the app origin would be blocked. Routing the request
 * through this same-origin endpoint removes the CORS problem entirely.
 *
 * MapLibre collapses a `text-font` array into a single comma-joined "fontstack"
 * name (e.g. "Open Sans Regular,Noto Sans Regular") and asks the server for
 * that exact stack. Those combined stacks are never hosted, so we split on the
 * comma and return the first font that actually exists. This gives two things
 * for free:
 *   - font variety (each tier's chosen font is tried first), and
 *   - graceful fallback when a variant is missing on the server (e.g.
 *     "Metropolis Italic" 404s → "Noto Sans Italic" is used instead).
 * Every font we offer already contains the Norwegian glyphs (æ, ø, å, …),
 * so localized place names render correctly.
 */

const UPSTREAM = 'https://tiles.openstreetmap.us/fonts';

export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await ctx.params;
  if (!slug || slug.length < 2) {
    return new Response('Bad request', { status: 400 });
  }

  const rangePart = slug[slug.length - 1].replace(/\.pbf$/, '');
  const fontstackRaw = slug.slice(0, -1).join('/');
  const fontstack = safeDecode(fontstackRaw);
  const range = safeDecode(rangePart).replace(/\.pbf$/, '');

  const names = fontstack
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  for (const name of names) {
    const url = `${UPSTREAM}/${encodeURIComponent(name)}/${range}.pbf`;
    try {
      const res = await fetch(url, { cache: 'force-cache' });
      if (res.status === 200) {
        const buf = await res.arrayBuffer();
        return new Response(buf, {
          status: 200,
          headers: {
            'Content-Type': 'application/x-protobuf',
            'Cache-Control': 'public, max-age=31536000, immutable',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
    } catch {
      // Network error – try the next fallback font.
    }
  }

  return new Response('Glyph range not found', { status: 404 });
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
