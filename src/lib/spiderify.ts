export interface SpiderPoint {
  x: number;
  y: number;
}

export interface SpiderResult {
  /** Offset badge center (same coordinate space as the input). */
  x: number;
  y: number;
  /** True if the badge was moved off its true position. */
  spidered: boolean;
  /** Origin of the leader line (cluster anchor) for spidered badges. */
  legFrom?: SpiderPoint;
}

/**
 * Spreads overlapping points (POI badges) apart, spider style, so each marker
 * stays legible. Points whose centers are closer than `minDist` form a cluster;
 * members are re-positioned on a ring around the cluster centroid (a second,
 * larger ring for big clusters) and connected to the centroid with a leader
 * line. After the ring layout, clusters are treated as rigid bodies and pushed
 * apart so badges of *different* clusters also never overlap. Unclustered
 * points are returned untouched.
 *
 * Deterministic: given the same input order/`minDist`, the same cluster layout
 * is produced regardless of coordinate scale (mm, CSS px or device px), so the
 * PDF, the preview thumbnails and the MapLibre preview all agree.
 */
export function spiderify(points: readonly SpiderPoint[], minDist: number, ids?: readonly (string | number)[]): SpiderResult[] {
  const n = points.length;
  if (n === 0) return [];

  const group = new Array<number>(n).fill(-1);
  let g = 0;
  for (let i = 0; i < n; i++) {
    if (group[i] !== -1) continue;
    const stack = [i];
    group[i] = g;
    while (stack.length) {
      const k = stack.pop()!;
      for (let j = 0; j < n; j++) {
        if (group[j] !== -1) continue;
        const dx = points[k].x - points[j].x;
        const dy = points[k].y - points[j].y;
        if (dx * dx + dy * dy <= minDist * minDist) {
          group[j] = g;
          stack.push(j);
        }
      }
    }
    g++;
  }

  const MAX_PER_RING = 8;

  // Per-cluster ring layout (offsets are relative to the cluster centroid) +
  // a conservative disc radius so two separated discs can never bring a pair
  // of badge centers closer than minDist.
  const offsets: Array<{ x: number; y: number }> = new Array(n);
  const centroid: Array<{ x: number; y: number }> = new Array(g);
  const radius = new Array<number>(g).fill(0);

  for (let gi = 0; gi < g; gi++) {
    const members: number[] = [];
    for (let i = 0; i < n; i++) if (group[i] === gi) members.push(i);

    let cx = 0;
    let cy = 0;
    for (const k of members) {
      cx += points[k].x;
      cy += points[k].y;
    }
    cx /= members.length;
    cy /= members.length;
    centroid[gi] = { x: cx, y: cy };

    if (members.length <= 1) {
      offsets[members[0]] = { x: 0, y: 0 };
      radius[gi] = minDist / 2;
      continue;
    }

    if (ids) {
      members.sort((a, b) => String(ids[a]).localeCompare(String(ids[b]), undefined, { numeric: true }));
    }

    const rings: number[][] = [];
    for (let r = 0; r < members.length; r += MAX_PER_RING) rings.push(members.slice(r, r + MAX_PER_RING));

    let maxDist = 0;
    let prevR = 0;
    rings.forEach((ring) => {
      const count = ring.length;
      const chord = count > 1 ? Math.sin(Math.PI / count) : 1;
      // Big enough that adjacent members of this ring are >= minDist apart,
      // and (for outer rings) that it clears the previous ring by >= minDist so
      // a member can never sit right behind one on the ring inside it.
      const ringR = Math.max(minDist / (2 * chord), prevR + minDist);
      prevR = ringR;
      ring.forEach((k, pos) => {
        const a = (pos / count) * Math.PI * 2 - Math.PI / 2;
        offsets[k] = { x: Math.cos(a) * ringR, y: Math.sin(a) * ringR };
        maxDist = Math.max(maxDist, Math.hypot(offsets[k].x, offsets[k].y));
      });
    });
    radius[gi] = maxDist + minDist / 2;
  }

  // Rigid-body separation: push overlapping cluster discs apart, iteratively,
  // until every pair of badge centers is at least minDist apart. Deterministic
  // direction when two centroids coincide.
  const c = centroid;
  for (let iter = 0; iter < 40; iter++) {
    let moved = false;
    for (let i = 0; i < g; i++) {
      for (let j = i + 1; j < g; j++) {
        const dx = c[j].x - c[i].x;
        const dy = c[j].y - c[i].y;
        const dist = Math.hypot(dx, dy);
        const need = radius[i] + radius[j];
        if (dist >= need) continue;
        const push = (need - dist) / 2;
        const angle = dist > 1e-9 ? Math.atan2(dy, dx) : (i * 2.399963 + j) * 1.7;
        c[i].x -= Math.cos(angle) * push;
        c[i].y -= Math.sin(angle) * push;
        c[j].x += Math.cos(angle) * push;
        c[j].y += Math.sin(angle) * push;
        moved = true;
      }
    }
    if (!moved) break;
  }

  const result: SpiderResult[] = points.map((p) => ({ x: p.x, y: p.y, spidered: false }));

  for (let i = 0; i < n; i++) {
    const gi = group[i];
    if (offsets[i].x === 0 && offsets[i].y === 0) {
      result[i] = { x: c[gi].x, y: c[gi].y, spidered: false };
      continue;
    }
    result[i] = {
      x: c[gi].x + offsets[i].x,
      y: c[gi].y + offsets[i].y,
      spidered: true,
      legFrom: { x: c[gi].x, y: c[gi].y },
    };
  }

  return result;
}
