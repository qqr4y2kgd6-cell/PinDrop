/**
 * Build script: generate MapLibre glyph (SDF) PBFs for the curated Google
 * Fonts so they render on the map and in the PDF export.
 *
 * For each font we download the real TTFs from Google Fonts (per weight/style),
 * then use `fontnik` to rasterise every codepoint range into the protobuf
 * format MapLibre expects. Output lands in `public/glyphs/<FontStack>/<range>.pbf`
 * and is served by the same-origin `/api/glyphs` route.
 *
 * CJK (Japanese / Chinese / Korean) is intentionally NOT generated here — it is
 * rendered locally by MapLibre via `localIdeographFontFamily` (see
 * src/lib/placeNameFonts.ts). Ranges above 0x2FFF are skipped; those are
 * CJK / Hangul / fullwidth forms that Latin fonts don't contain anyway.
 *
 * Run: node scripts/build-glyphs.mjs   (also wired as `npm run build-glyphs`)
 */
import { createRequire } from 'module';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const fontnik = require('fontnik');
const { PbfReader } = require('pbf');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'public', 'glyphs');
const TTF_CACHE = path.join(ROOT, '.glyphcache', 'ttf');

const FONT_IDS = [
  'Inter', 'Roboto', 'Open Sans', 'Noto Sans', 'Lato', 'Montserrat', 'Poppins', 'Work Sans',
  'Noto Serif', 'Merriweather', 'Lora', 'Playfair Display', 'PT Serif', 'Source Serif 4', 'Spectral', 'EB Garamond',
  'Roboto Mono', 'Space Mono',
];

const VARIANTS = [
  { weight: 400, style: 'normal', stack: 'Regular' },
  { weight: 700, style: 'normal', stack: 'Bold' },
  { weight: 400, style: 'italic', stack: 'Italic' },
  { weight: 700, style: 'italic', stack: 'Bold Italic' },
];

const MAX_RANGE_START = 0x2fff; // skip CJK / Hangul / fullwidth

function stackName(id, v) {
  return `${id} ${v.stack}`;
}

function countGlyphs(pbf) {
  let n = 0;
  const walkGlyph = (g) => {
    while (g.pos < g.length) {
      const tag = g.readVarint();
      const f = tag >> 3;
      const wt = tag & 7;
      if (f === 1 && wt === 0) {
        g.readVarint();
        n++;
      } else if (wt === 0) g.readVarint();
      else if (wt === 2) { const l = g.readVarint(); g.pos += l; }
      else if (wt === 5) g.pos += 4;
      else if (wt === 1) g.pos += 8;
      else break;
    }
  };
  // Top level: a single field-1 submessage (the "Glyphs" container).
  const p = new PbfReader(pbf);
  while (p.pos < p.length) {
    const tag = p.readVarint();
    const f = tag >> 3;
    const wt = tag & 7;
    if (wt === 2) {
      const l = p.readVarint();
      const end = p.pos + l;
      if (f === 1) {
        // container: field 1 = fontstack (string), 2 = range (string),
        // 3 = repeated glyph messages.  Recurse into each glyph only.
        const c = new PbfReader(p.buf.subarray(p.pos, end));
        while (c.pos < c.length) {
          const ct = c.readVarint();
          const cf = ct >> 3;
          const cwt = ct & 7;
          if (cwt === 2) {
            const cl = c.readVarint();
            const ce = c.pos + cl;
            if (cf === 3) walkGlyph(new PbfReader(c.buf.subarray(c.pos, ce)));
            c.pos = ce;
          } else if (cwt === 0) c.readVarint();
          else if (cwt === 5) c.pos += 4;
          else if (cwt === 1) c.pos += 8;
          else break;
        }
      }
      p.pos = end;
    } else if (wt === 0) p.readVarint();
    else if (wt === 5) p.pos += 4;
    else if (wt === 1) p.pos += 8;
    else break;
  }
  return n;
}

async function fetchFaces(id) {
  const url = `https://fonts.googleapis.com/css?family=${encodeURIComponent(id)}:400,700,400italic,700italic`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/4.0' } });
  if (!res.ok) throw new Error(`CSS ${res.status} for ${id}`);
  const css = await res.text();
  const blocks = css.split('@font-face').slice(1);
  const faces = [];
  for (const b of blocks) {
    const w = (b.match(/font-weight:\s*(\d+)/) || [])[1];
    const st = (b.match(/font-style:\s*(\w+)/) || [])[1] || 'normal';
    const src = (b.match(/src:\s*url\(([^)]+)\)/) || [])[1];
    if (w && src) faces.push({ weight: Number(w), style: st, url: src });
  }
  return faces;
}

async function getTtf(id, v) {
  const key = `${id}_${v.weight}_${v.style}.ttf`;
  const file = path.join(TTF_CACHE, key);
  try {
    return await fs.readFile(file);
  } catch {
    /* not cached */
  }
  const faces = await fetchFaces(id);
  const face = faces.find((f) => f.weight === v.weight && f.style === v.style) || faces.find((f) => f.weight === v.weight);
  if (!face) {
    console.warn(`  ! no TTF for ${stackName(id, v)}`);
    return null;
  }
  const res = await fetch(face.url);
  if (!res.ok) throw new Error(`TTF ${res.status} for ${stackName(id, v)}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.mkdir(TTF_CACHE, { recursive: true });
  await fs.writeFile(file, buf);
  return buf;
}

function rangePbf(font, start, end) {
  return new Promise((resolve, reject) => {
    fontnik.range({ font, start, end }, (err, pbf) => (err ? reject(err) : resolve(pbf)));
  });
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  let total = 0;
  for (const id of FONT_IDS) {
    for (const v of VARIANTS) {
      const stack = stackName(id, v);
      let ttf;
      try {
        ttf = await getTtf(id, v);
      } catch (e) {
        console.warn(`  ! ${stack}: ${e.message}`);
        continue;
      }
      if (!ttf) continue;
      let written = 0;
      for (let start = 0; start <= MAX_RANGE_START; start += 256) {
        const end = start + 255;
        let pbf;
        try {
          pbf = await rangePbf(ttf, start, end);
        } catch (e) {
          console.warn(`  ! ${stack} range ${start}-${end}: ${e.message}`);
          continue;
        }
        if (countGlyphs(pbf) === 0) continue;
        const dir = path.join(OUT_DIR, stack);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(path.join(dir, `${start}-${end}.pbf`), pbf);
        written++;
      }
      if (written) {
        total += written;
        console.log(`  ✓ ${stack}: ${written} ranges`);
      }
    }
  }
  console.log(`Done. ${total} glyph PBF files written to public/glyphs/`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
