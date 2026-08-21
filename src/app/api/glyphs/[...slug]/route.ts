import { type NextRequest } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * Same-origin glyph (SDF font) PBF endpoint.
 *
 * Two sources, in order:
 *   1. Locally generated PBFs in `public/glyphs/<fontstack>/<range>.pbf`
 *      (built by scripts/build-glyphs.mjs from the real Google Font TTFs).
 *      This is what makes the curated Google Fonts render on the map and in
 *      the PDF export, including the Nordic glyphs (æ, ø, å).
 *   2. Fallback to the public OSM.us font server for any stack we didn't
 *      generate (e.g. legacy "Noto Sans" usages).  The upstream server sends
 *      no CORS headers, but this is a server-to-server fetch so it's fine.
 *
 * MapLibre collapses a `text-font` array into a single comma-joined fontstack
 * name; we split on the comma and return the first stack that exists, which
 * also gives graceful fallback when a variant is missing upstream.
 */

const UPSTREAM = 'https://tiles.openstreetmap.us/fonts';

export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await ctx.params;
  if (!slug || slug.length < 2) {
    return new Response('Bad request', { status: 400 });
  }

  const rangePart = slug[slug.length - 1].replace(/\.pbf$/, '');
  const fontstack = safeDecode(slug.slice(0, -1).join('/'));
  const range = safeDecode(rangePart).replace(/\.pbf$/, '');

  // 1) Locally generated PBF.
  const localPath = path.join(process.cwd(), 'public', 'glyphs', fontstack, `${range}.pbf`);
  try {
    const buf = await fs.readFile(localPath);
    return new Response(buf, {
      status: 200,
      headers: {
        'Content-Type': 'application/x-protobuf',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch {
    // Not generated locally – fall through to upstream.
  }

  // 2) Upstream fallback (split comma-joined stack).
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
      // try next
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
