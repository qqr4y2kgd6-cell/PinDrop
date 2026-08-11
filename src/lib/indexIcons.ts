'use client';

import type { jsPDF } from 'jspdf';

/**
 * Category symbols drawn as real vector shapes in the exported PDF. The path
 * data is the same lucide icon source used by the editor's `IndexListBody`
 * (Utensils, Landmark, Building2, TreePine, Hotel, MapPin), so the printed
 * index matches the layout preview. Lucide icons are stroke-based, so the PDF
 * strokes the parsed paths instead of filling them.
 */

export interface IndexIconShape {
  paths: string[];
  circles: Array<{ cx: number; cy: number; r: number }>;
  rects: Array<{ x: number; y: number; width: number; height: number; rx: number }>;
}

const L = (d: string): IndexIconShape => ({ paths: [d], circles: [], rects: [] });

const ICONS: Record<string, IndexIconShape> = {
  Food: L('M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2M7 2v20M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7'),
  'Shrine/Temple': L(
    'M10 18v-7M11.119 2.205a2 2 0 0 1 1.762 0l7.84 3.846A.5.5 0 0 1 20.5 7h-17a.5.5 0 0 1-.22-.949zM14 18v-7M18 18v-7M3 22h18M6 18v-7'
  ),
  Architecture: L(
    'M10 12h4M10 8h4M14 21v-3a2 2 0 0 0-4 0v3M6 10H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16'
  ),
  Park: L(
    'm17 14 3 3.3a1 1 0 0 1-.7 1.7H4.7a1 1 0 0 1-.7-1.7L7 14h-.3a1 1 0 0 1-.7-1.7L9 9h-.2A1 1 0 0 1 8 7.3L12 3l4 4.3a1 1 0 0 1-.8 1.7H15l3 3.3a1 1 0 0 1-.7 1.7H17ZM12 22v-3'
  ),
  Hotel: {
    paths: [
      'M10 22v-6.57M12 11h.01M12 7h.01M14 15.43V22M15 16a5 5 0 0 0-6 0M16 11h.01M16 7h.01M8 11h.01M8 7h.01',
    ],
    circles: [],
    rects: [{ x: 4, y: 2, width: 16, height: 20, rx: 2 }],
  },
};

const FALLBACK: IndexIconShape = {
  paths: ['M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0'],
  circles: [{ cx: 12, cy: 10, r: 3 }],
  rects: [],
};

/** The symbol to draw next to a category header. */
export function indexIconFor(category: string): IndexIconShape {
  return ICONS[category] ?? FALLBACK;
}

type Op = { op: 'm' | 'l' | 'c' | 'h'; c: number[] };

function tokenize(d: string): Array<string | number> {
  const re = /[a-zA-Z]|-?(?:\d*\.?\d+)(?:[eE][+-]?\d+)?/g;
  const out: Array<string | number> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(d))) out.push(/[a-zA-Z]/.test(m[0]) ? m[0] : Number(m[0]));
  return out;
}

function arcToCubics(
  x1: number, y1: number, rx: number, ry: number, phiDeg: number, largeArc: boolean, sweep: boolean, x2: number, y2: number
): number[][] {
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  const phi = (phiDeg * Math.PI) / 180;
  const cosP = Math.cos(phi);
  const sinP = Math.sin(phi);
  const dx2 = (x1 - x2) / 2;
  const dy2 = (y1 - y2) / 2;
  const x1p = cosP * dx2 + sinP * dy2;
  const y1p = -sinP * dx2 + cosP * dy2;
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const rx2 = rx * rx;
  const ry2 = ry * ry;
  const x1p2 = x1p * x1p;
  const y1p2 = y1p * y1p;
  const den = rx2 * y1p2 + ry2 * x1p2;
  const coeff = (largeArc !== sweep ? 1 : -1) * Math.sqrt(Math.max(0, (rx2 * ry2 - rx2 * y1p2 - ry2 * x1p2) / (den || 1e-12)));
  const cxp = coeff * ((rx * y1p) / ry);
  const cyp = coeff * (-(ry * x1p) / rx);
  const cx = cosP * cxp - sinP * cyp + (x1 + x2) / 2;
  const cy = sinP * cxp + cosP * cyp + (y1 + y2) / 2;

  const angle = (ux: number, uy: number, vx: number, vy: number) => {
    const d = ux * vx + uy * vy;
    const cross = ux * vy - uy * vx;
    const a = Math.acos(Math.min(1, Math.max(-1, d / (Math.hypot(ux, uy) * Math.hypot(vx, vy)))));
    return cross < 0 ? -a : a;
  };
  const theta1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let delta = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  if (sweep && delta < 0) delta += 2 * Math.PI;

  const segs = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2)));
  const dTheta = delta / segs;
  const alpha = (4 / 3) * Math.tan(dTheta / 4);
  const out: number[][] = [];
  let t1 = theta1;
  for (let k = 0; k < segs; k++) {
    const t2 = t1 + dTheta;
    const cos1 = Math.cos(t1);
    const sin1 = Math.sin(t1);
    const cos2 = Math.cos(t2);
    const sin2 = Math.sin(t2);
    const p1x = cx + cos1 * rx * cosP - sin1 * ry * sinP + alpha * (-sin1 * rx * cosP - cos1 * ry * sinP);
    const p1y = cy + cos1 * rx * sinP + sin1 * ry * cosP + alpha * (-sin1 * rx * sinP + cos1 * ry * cosP);
    const p2x = cx + cos2 * rx * cosP - sin2 * ry * sinP - alpha * (-sin2 * rx * cosP - cos2 * ry * sinP);
    const p2y = cy + cos2 * rx * sinP + sin2 * ry * cosP - alpha * (-sin2 * rx * sinP + cos2 * ry * cosP);
    out.push([p1x, p1y, p2x, p2y, cx + cos2 * rx * cosP - sin2 * ry * sinP, cy + cos2 * rx * sinP + sin2 * ry * cosP]);
    t1 = t2;
  }
  return out;
}

/** Parses an SVG `d` attribute into jsPDF-compatible path ops (absolute coords). */
export function parseSvgPath(d: string): Op[] {
  const tokens = tokenize(d);
  const ops: Op[] = [];
  let i = 0;
  let cmd = 'M';
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;

  const isNum = (j: number) => typeof tokens[j] === 'number';
  const read = (): number => {
    const v = tokens[i];
    i += typeof v === 'number' ? 1 : 0;
    return typeof v === 'number' ? v : 0;
  };
  const pushCurve = (c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number) => {
    ops.push({ op: 'c', c: [c1x, c1y, c2x, c2y, x, y] });
    cx = x;
    cy = y;
  };

  while (i < tokens.length) {
    const t = tokens[i];
    if (typeof t === 'string') {
      cmd = t;
      i++;
    }
    const C = cmd.toUpperCase();
    const rel = cmd !== C;
    if (C === 'Z') {
      ops.push({ op: 'h', c: [] });
      cx = sx;
      cy = sy;
      cmd = 'L';
      continue;
    }
    if (!isNum(i)) continue;

    if (C === 'M' || C === 'L') {
      let firstM = C === 'M';
      while (isNum(i)) {
        const x = read();
        const y = read();
        const ax = rel ? cx + x : x;
        const ay = rel ? cy + y : y;
        if (firstM) {
          ops.push({ op: 'm', c: [ax, ay] });
          sx = ax;
          sy = ay;
          firstM = false;
          if (isNum(i)) cmd = rel ? 'l' : 'L';
        } else {
          ops.push({ op: 'l', c: [ax, ay] });
        }
        cx = ax;
        cy = ay;
      }
    } else if (C === 'H') {
      while (isNum(i)) {
        const x = read();
        cx = rel ? cx + x : x;
        ops.push({ op: 'l', c: [cx, cy] });
      }
    } else if (C === 'V') {
      while (isNum(i)) {
        const y = read();
        cy = rel ? cy + y : y;
        ops.push({ op: 'l', c: [cx, cy] });
      }
    } else if (C === 'C') {
      while (isNum(i)) {
        const x1 = read();
        const y1 = read();
        const x2 = read();
        const y2 = read();
        const x = read();
        const y = read();
        pushCurve(rel ? cx + x1 : x1, rel ? cy + y1 : y1, rel ? cx + x2 : x2, rel ? cy + y2 : y2, rel ? cx + x : x, rel ? cy + y : y);
      }
    } else if (C === 'A') {
      while (isNum(i)) {
        const rx = read();
        const ry = read();
        const phi = read();
        const large = read() !== 0;
        const sweep = read() !== 0;
        const x = read();
        const y = read();
        const ax = rel ? cx + x : x;
        const ay = rel ? cy + y : y;
        for (const seg of arcToCubics(cx, cy, rx, ry, phi, large, sweep, ax, ay)) {
          pushCurve(seg[0], seg[1], seg[2], seg[3], seg[4], seg[5]);
        }
      }
    }
  }
  return ops;
}

/**
 * Strokes a category symbol centered at (x, y) with its top-left at (x, y),
 * scaled to `sizeMm` (the icon is a 24-unit viewBox). `rgb` is the spot color.
 */
export function drawIndexIcon(doc: jsPDF, icon: IndexIconShape, x: number, y: number, sizeMm: number, rgb: [number, number, number]) {
  const s = sizeMm / 24;
  const px = (v: number) => x + v * s;
  const py = (v: number) => y + v * s;
  doc.saveGraphicsState();
  doc.setLineCap('round');
  doc.setLineJoin('round');
  doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
  doc.setLineWidth(Math.max(0.12, 2 * s));
  for (const c of icon.circles) doc.circle(px(c.cx), py(c.cy), c.r * s, 'S');
  for (const r of icon.rects) {
    if (r.rx > 0) doc.roundedRect(px(r.x), py(r.y), r.width * s, r.height * s, r.rx * s, r.rx * s, 'S');
    else doc.rect(px(r.x), py(r.y), r.width * s, r.height * s, 'S');
  }
  for (const d of icon.paths) {
    for (const op of parseSvgPath(d)) {
      const c = op.c;
      if (op.op === 'm') doc.moveTo(px(c[0]), py(c[1]));
      else if (op.op === 'l') doc.lineTo(px(c[0]), py(c[1]));
      else if (op.op === 'c') doc.curveTo(px(c[0]), py(c[1]), px(c[2]), py(c[3]), px(c[4]), py(c[5]));
      else doc.close();
    }
    doc.stroke();
  }
  doc.restoreGraphicsState();
}
