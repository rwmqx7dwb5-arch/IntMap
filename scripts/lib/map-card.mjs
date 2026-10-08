/* ============================================================================
 *  IntMap · scripts/lib/map-card.mjs — a link card (1200×630 PNG) drawn from a border record, with no browser   (marketing-next)
 * ----------------------------------------------------------------------------
 *  A post about «3 October» is read by its picture first, and a picture that is one generic screenshot for every
 *  day says nothing about the day. Each «on this day» page (scripts/on-this-day-pages.mjs) gets a card of its own:
 *  the outlines the border record draws on the day's headline date, the polities it begins drawing / redraws filled,
 *  the ones it stops drawing traced, a war event's place marked — and the date in figures, so the one picture serves
 *  every language (the words are the page's og:title, in the reader's language).
 *
 *  ⚠ WHY NOT A SCREENSHOT OF THE APP: that needs the app served and a browser for each of ~300 days on every build
 *  (scripts/showcase-capture.mjs takes ~10 s a picture). This draws the SAME RECORD the map draws (data/cshapes.js,
 *  the rows in force on the day, as js/time-borders.js csFC selects them) with a scanline filler, and writes the PNG
 *  with node:zlib — no dependency the repository does not already have (opentype.js reads the app's own Inter for
 *  the figures).
 *  ⚠ THE PICTURE STATES NOTHING THE PAGE DOES NOT: it is the record's outlines on the date the page names, and the
 *  polities the index lists for that event (by their state-system codes) — nothing is drawn that the record does not
 *  hold for that day.
 * ==========================================================================*/
import { readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const CARD = { width: 1200, height: 630 };   /* the 1.91:1 card Open Graph and X's large card both take whole */
const SS = 3;                                          /* supersampling per axis: edges are anti-aliased by averaging 3×3 */

/* the palette — the app's dark map (css/intmap.css) and iOS's system colours in dark mode, for what changes */
const C = {
  sea: [9, 17, 31], ground: [27, 37, 54], land: [52, 70, 98], edge: [104, 126, 160],
  appeared: [48, 209, 88], redrawn: [255, 214, 10], ended: [255, 69, 58], war: [10, 132, 255],
  text: [255, 255, 255], shade: [0, 0, 0],
};

/* ── the record ─────────────────────────────────────────────────────────────────────────────── */
let _cs = null;
function cshapes() {
  if (!_cs) { const t = readFileSync(join(ROOT, 'data/cshapes.js'), 'utf8'); _cs = JSON.parse(t.slice(t.indexOf('=') + 1).replace(/;\s*$/, '')); }
  return _cs;
}
const ymd = (y, m, d) => y * 10000 + m * 100 + d;
/** the record's rows in force on an ISO date (start ≤ day ≤ end, both inclusive — js/time-borders.js csFC) */
export function rowsOn(iso) {
  const [y, m, d] = iso.split('-').map(Number), t = ymd(y, m, d);
  return cshapes().feats.filter((f) => ymd(f[2], f[3], f[4]) <= t && t <= ymd(f[5], f[6], f[7]));
}
/* ⚠ THE RECORD IS NOT THE LAND. CShapes draws states and colonies; ground no polity of its record holds (the interior of
   Arabia in 1915, Antarctica) has no outline there, and painted as sea it would read as water. So the land itself is laid
   first, in a colour of its own (`ground`), from Natural Earth's 1:50m countries — today's land, which is the shape the
   coast had on every date this record covers — and the record's polities over it. */
let _land = null;
async function land() {
  if (!_land) {
    const NE = await import('../../js/ne-countries.js');
    const { gunzipSync } = await import('node:zlib');
    const fc = NE.decodeNECountries(JSON.parse(gunzipSync(readFileSync(join(ROOT, NE.neCountriesPath('50m')))).toString('utf8')));
    _land = fc.features.flatMap((f) => (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : []));
  }
  return _land;
}
/** a row's polygons as arrays of rings ([[lon,lat],…]) */
const polysOf = (f) => f[8].map((part) => part.map((ri) => cshapes().rings[ri]));

/* ── the frame: a Mercator box around what the card is about, at the card's aspect ─────────────── */
const RAD = Math.PI / 180;
const mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + Math.max(-85, Math.min(85, lat)) * RAD / 2));
const invMercY = (y) => (2 * Math.atan(Math.exp(y)) - Math.PI / 2) / RAD;
/* the narrowest frame, in degrees of longitude: a card about a small state still shows the land around it */
const MIN_SPAN = 34;
/** box [w,s,e,n] → the frame { w, e, yN, yS } (Mercator y) at the card's aspect, the box in its middle third */
export function frameFor(box) {
  let [w, s, e, n] = box || [-180, -58, 180, 80];
  let span = Math.max(MIN_SPAN, (e - w) * 3);
  if (span >= 360 || !box) return world();
  const cx = (w + e) / 2, cy = (mercY(s) + mercY(n)) / 2;
  const ySpan = Math.max((mercY(n) - mercY(s)) * 3, span * RAD * CARD.height / CARD.width);
  span = Math.max(span, ySpan / RAD * CARD.width / CARD.height);
  if (span >= 360) return world();
  const half = span * RAD * CARD.height / CARD.width / 2;
  let yN = cy + half, yS = cy - half;
  const top = mercY(84), bot = mercY(-84);
  if (yN > top) { yS -= yN - top; yN = top; }
  if (yS < bot) { yN += bot - yS; yS = bot; }
  return { w: cx - span / 2, e: cx + span / 2, yN, yS };
  function world() {
    /* the whole world, cut to the card's aspect around the latitudes people live in */
    const yN0 = mercY(80), h = 360 * RAD * CARD.height / CARD.width;
    return { w: -180, e: 180, yN: yN0, yS: yN0 - h };
  }
}

/* ── the raster: RGB, supersampled ─────────────────────────────────────────────────────────── */
function canvas(w, h, bg) { const px = new Uint8Array(w * h * 3); for (let i = 0; i < w * h; i++) { px[i * 3] = bg[0]; px[i * 3 + 1] = bg[1]; px[i * 3 + 2] = bg[2]; } return { w, h, px }; }
function blend(cv, i, col, a) { const p = cv.px, k = i * 3; p[k] += (col[0] - p[k]) * a; p[k + 1] += (col[1] - p[k + 1]) * a; p[k + 2] += (col[2] - p[k + 2]) * a; }
/** fill rings (pixel coordinates) by the non-zero winding rule — the rule both TrueType outlines and polygon-with-holes need —
 *  or, with `evenOdd`, by the even-odd rule the year pages' SVG uses (scripts/lib/world-svg.mjs `fill-rule:evenodd`), so a card
 *  fills exactly what the page's picture fills whatever the orientation of a record's rings */
function fill(cv, rings, col, alpha, evenOdd) {
  const a = alpha == null ? 1 : alpha;
  const edges = [];
  let y0 = Infinity, y1 = -Infinity;
  for (const r of rings) {
    for (let i = 0, n = r.length; i < n; i++) {
      const p = r[i], q = r[(i + 1) % n];
      if (p[1] === q[1]) continue;
      const up = p[1] < q[1];
      const lo = up ? p : q, hi = up ? q : p;
      edges.push({ ylo: lo[1], yhi: hi[1], x: lo[0], k: (hi[0] - lo[0]) / (hi[1] - lo[1]), dir: up ? 1 : -1 });
      if (lo[1] < y0) y0 = lo[1]; if (hi[1] > y1) y1 = hi[1];
    }
  }
  if (!edges.length) return;
  edges.sort((e1, e2) => e1.ylo - e2.ylo);
  const rowFrom = Math.max(0, Math.floor(y0)), rowTo = Math.min(cv.h - 1, Math.ceil(y1));
  let next = 0; const active = [];
  const xs = [];
  for (let row = rowFrom; row <= rowTo; row++) {
    const yc = row + 0.5;
    while (next < edges.length && edges[next].ylo <= yc) active.push(edges[next++]);
    xs.length = 0;
    for (let i = active.length - 1; i >= 0; i--) {
      const e = active[i];
      if (e.yhi <= yc) { active.splice(i, 1); continue; }
      if (e.ylo <= yc) xs.push([e.x + (yc - e.ylo) * e.k, e.dir]);
    }
    if (xs.length < 2) continue;
    xs.sort((p, q) => p[0] - q[0]);
    let wind = 0;
    for (let i = 0; i < xs.length - 1; i++) {
      wind = evenOdd ? wind ^ 1 : wind + xs[i][1];
      if (!wind) continue;
      const xa = Math.max(0, Math.ceil(xs[i][0] - 0.5)), xb = Math.min(cv.w, Math.ceil(xs[i + 1][0] - 0.5));
      const base = row * cv.w;
      if (a >= 1) { const p = cv.px; for (let x = xa; x < xb; x++) { const k = (base + x) * 3; p[k] = col[0]; p[k + 1] = col[1]; p[k + 2] = col[2]; } }
      else for (let x = xa; x < xb; x++) blend(cv, base + x, col, a);
    }
  }
}
/** a polyline `width` pixels wide, plotted as squares along it — the outlines, at the supersampled scale */
function stroke(cv, ring, col, width) {
  const r = Math.max(0, Math.floor(width / 2));
  const dot = (x, y) => { for (let yy = y - r; yy <= y + r; yy++) { if (yy < 0 || yy >= cv.h) continue; for (let xx = x - r; xx <= x + r; xx++) { if (xx < 0 || xx >= cv.w) continue; const k = (yy * cv.w + xx) * 3; cv.px[k] = col[0]; cv.px[k + 1] = col[1]; cv.px[k + 2] = col[2]; } } };
  for (let i = 0; i < ring.length - 1; i++) {
    const [ax, ay] = ring[i], [bx, by] = ring[i + 1];
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay))));
    if (Math.max(ax, bx) < -r || Math.min(ax, bx) > cv.w + r || Math.max(ay, by) < -r || Math.min(ay, by) > cv.h + r) continue;
    for (let s = 0; s <= n; s++) dot(Math.round(ax + (bx - ax) * s / n), Math.round(ay + (by - ay) * s / n));
  }
}
function downsample(cv, f) {
  const w = cv.w / f, h = cv.h / f, out = new Uint8Array(w * h * 3), n = f * f;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0;
    for (let dy = 0; dy < f; dy++) { const base = ((y * f + dy) * cv.w + x * f) * 3; for (let dx = 0; dx < f; dx++) { r += cv.px[base + dx * 3]; g += cv.px[base + dx * 3 + 1]; b += cv.px[base + dx * 3 + 2]; } }
    const k = (y * w + x) * 3; out[k] = Math.round(r / n); out[k + 1] = Math.round(g / n); out[k + 2] = Math.round(b / n);
  }
  return { w, h, px: out };
}

/* ── PNG (8-bit RGB, the Sub filter on every row — flat map colours compress to almost nothing) ─────── */
const CRC = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
function crc32(buf) { let c = -1; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
export function png(cv) {
  /* a card is a few flat colours and the 3×3 averages of their edges — measured 2026-10-03: 113 distinct colours on the
     1945-08-15 card — so it fits a palette exactly, and a palette PNG is lossless and about a third of the size. A card
     that ever holds more than 256 is written as RGB, unchanged in content. */
  const n = cv.w * cv.h, index = new Map(), idx = new Uint8Array(n);
  for (let i = 0; i < n && index.size <= 256; i++) {
    const c = (cv.px[i * 3] << 16) | (cv.px[i * 3 + 1] << 8) | cv.px[i * 3 + 2];
    let k = index.get(c); if (k == null) { k = index.size; index.set(c, k); }
    idx[i] = k;
  }
  if (index.size <= 256) {
    const raw = Buffer.alloc((cv.w + 1) * cv.h);
    for (let y = 0; y < cv.h; y++) { raw[y * (cv.w + 1)] = 0; raw.set(idx.subarray(y * cv.w, (y + 1) * cv.w), y * (cv.w + 1) + 1); }
    const plte = Buffer.alloc(index.size * 3);
    for (const [c, k] of index) { plte[k * 3] = c >> 16; plte[k * 3 + 1] = (c >> 8) & 0xff; plte[k * 3 + 2] = c & 0xff; }
    const ih = Buffer.alloc(13); ih.writeUInt32BE(cv.w, 0); ih.writeUInt32BE(cv.h, 4); ih[8] = 8; ih[9] = 3;
    return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ih), chunk('PLTE', plte), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
  }
  const stride = cv.w * 3, raw = Buffer.alloc((stride + 1) * cv.h);
  for (let y = 0; y < cv.h; y++) {
    raw[y * (stride + 1)] = 1;   /* Sub */
    for (let x = 0; x < stride; x++) { const cur = cv.px[y * stride + x], left = x >= 3 ? cv.px[y * stride + x - 3] : 0; raw[y * (stride + 1) + 1 + x] = (cur - left) & 0xff; }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(cv.w, 0); ihdr.writeUInt32BE(cv.h, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/* ── the figures: the app's own Inter (fonts/src/Inter.ttf, the source of its glyph atlases) ─────────── */
let _font = null;
async function font() {
  if (!_font) { const ot = (await import('opentype.js')).default; _font = ot.parse(readFileSync(join(ROOT, 'fonts/src/Inter.ttf')).buffer.slice(0)); }
  return _font;
}
/** the outline of a run of text as rings in pixel space, glyph by glyph (no shaping: figures, a hyphen and a Latin wordmark need none) */
function textRings(f, text, x, y, size) {
  const rings = []; let pen = x; const scale = size / f.unitsPerEm;
  for (const ch of text) {
    const g = f.charToGlyph(ch);
    let cur = null, last = null;
    for (const c of g.getPath(pen, y, size).commands) {
      if (c.type === 'M') { if (cur && cur.length > 2) rings.push(cur); cur = [[c.x, c.y]]; last = [c.x, c.y]; }
      else if (c.type === 'L') { cur.push([c.x, c.y]); last = [c.x, c.y]; }
      else if (c.type === 'Q') { for (let i = 1; i <= 8; i++) { const t = i / 8, u = 1 - t; cur.push([u * u * last[0] + 2 * u * t * c.x1 + t * t * c.x, u * u * last[1] + 2 * u * t * c.y1 + t * t * c.y]); } last = [c.x, c.y]; }
      else if (c.type === 'C') { for (let i = 1; i <= 10; i++) { const t = i / 10, u = 1 - t; cur.push([u * u * u * last[0] + 3 * u * u * t * c.x1 + 3 * u * t * t * c.x2 + t * t * t * c.x, u * u * u * last[1] + 3 * u * u * t * c.y1 + 3 * u * t * t * c.y2 + t * t * t * c.y]); } last = [c.x, c.y]; }
      else if (c.type === 'Z') { if (cur && cur.length > 2) rings.push(cur); cur = null; }
    }
    if (cur && cur.length > 2) rings.push(cur);
    pen += g.advanceWidth * scale;
  }
  return { rings, width: pen - x };
}

/**
 * Draw one card.
 * @param {{ date: string, box?: number[]|null, appeared?: number[], redrawn?: number[], ended?: number[], point?: number[]|null, label: string }} o
 *   `date` the ISO day the record is drawn at; `appeared` / `redrawn` the state-system codes filled, `ended` the codes traced
 *   from the day before; `point` a war event's [lon, lat]; `label` the figures written on the card (the date)
 * @returns {Promise<Buffer>} the PNG
 */
export async function drawCard(o) {
  const W = CARD.width * SS, Hh = CARD.height * SS;
  const cv = canvas(W, Hh, C.sea);
  const F = frameFor(o.box || null);
  const P = mercatorPainter(cv, F);
  const { sx, sy, shifts } = P;
  const fillRows = (rows, col, alpha) => P.fillPolys(rows.map(polysOf), col, alpha);
  const strokeRows = (rows, col, width) => P.strokePolys(rows.map(polysOf), col, width);

  const rows = rowsOn(o.date);
  const has = (list, f) => (list || []).includes(f[1]);
  for (const dx of shifts) for (const poly of await land()) if (P.meets([poly], dx)) fill(cv, poly.map((r) => P.project(r, dx)), C.ground);
  fillRows(rows, C.land);
  fillRows(rows.filter((f) => has(o.redrawn, f)), C.redrawn, 0.85);
  fillRows(rows.filter((f) => has(o.appeared, f)), C.appeared, 0.9);
  strokeRows(rows, C.edge, SS);
  if (o.ended && o.ended.length) {
    const [y, m, d] = o.date.split('-').map(Number);
    const prev = new Date(Date.UTC(2000, m - 1, d - 1)); prev.setUTCFullYear(y, m - 1, d - 1);
    const iso = prev.toISOString().slice(0, 10);
    strokeRows(rowsOn(iso).filter((f) => has(o.ended, f)), C.ended, SS * 2 + 1);
  }
  if (o.point) {
    const cx = (o.point[0] - F.w) * sx, cy = (F.yN - mercY(o.point[1])) * sy;
    const circle = (r) => { const pts = []; for (let i = 0; i < 48; i++) { const t = i / 48 * Math.PI * 2; pts.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]); } return pts; };
    fill(cv, [circle(18 * SS)], C.war, 0.25);
    fill(cv, [circle(9 * SS)], C.text);
    fill(cv, [circle(6.5 * SS)], C.war);
  }
  await stamp(cv, o.label);
  return png(downsample(cv, SS));
}

/* ══ (marketing-growth) THE PIECES, SHARED — the year and country pages draw their cards with the same raster ═══════════
   scripts/lib/page-card.mjs draws the cards of the year pages and the country pages. It does not copy the filler, the
   projection of a Mercator frame, the figures or the PNG writer: it takes them from here, so a fix to one is a fix to all. */

/** a Mercator painter over a supersampled canvas and a frame (frameFor): project a ring, cull a polygon set by its box,
 *  fill and stroke lists of polygon sets — each drawn once per copy of the world the frame crosses */
export function mercatorPainter(cv, F) {
  const sx = cv.w / (F.e - F.w), sy = cv.h / (F.yN - F.yS);
  /* a shape is drawn once per copy of the world the frame crosses, so a frame across 180° is whole */
  const shifts = [0]; if (F.w < -180) shifts.push(-360); if (F.e > 180) shifts.push(360);
  const minStep = SS * 0.6;   /* drop a vertex closer than ~0.6 output pixels to the last one kept: invisible, and the bulk of the work */
  const project = (ring, dx) => {
    const out = []; let lx = Infinity, ly = Infinity;
    for (const [lon, lat] of ring) {
      const x = (lon + dx - F.w) * sx, y = (F.yN - mercY(lat)) * sy;
      if (Math.abs(x - lx) + Math.abs(y - ly) < minStep) continue;
      out.push([x, y]); lx = x; ly = y;
    }
    return out;
  };
  /* a part whose box misses the frame is not drawn at all */
  const meets = (polys, dx) => { for (const poly of polys) { let a = 180, b = 90, c = -180, d = -90; for (const [lon, lat] of poly[0]) { if (lon < a) a = lon; if (lon > c) c = lon; if (lat < b) b = lat; if (lat > d) d = lat; } if (c + dx >= F.w && a + dx <= F.e && mercY(d) >= F.yS && mercY(b) <= F.yN) return true; } return false; };
  const fillPolys = (list, col, alpha) => { for (const polys of list) for (const dx of shifts) { if (!meets(polys, dx)) continue; for (const poly of polys) fill(cv, poly.map((r) => project(r, dx)), col, alpha); } };
  const strokePolys = (list, col, width) => { for (const polys of list) for (const dx of shifts) { if (!meets(polys, dx)) continue; for (const poly of polys) for (const r of poly) { const pr = project(r, dx); if (pr.length > 1) stroke(cv, pr.concat([pr[0]]), col, width); } } };
  return { sx, sy, shifts, project, meets, fillPolys, strokePolys };
}

/** the figures (on a shade, so they read over any map) and the wordmark — every card carries the same two;
 *  a card with no figures (`label` empty) carries the wordmark alone. The shade runs the card's width (`band: 'full'`, the
 *  «on this day» cards) or sits behind the figures only (`band: 'box'`, a whole-world card whose north is part of the picture) */
export async function stamp(cv, label, opt = {}) {
  const ft = await font();
  const W = cv.w, Hh = cv.h;
  if (label) {
    const big = textRings(ft, label, 56 * SS, 120 * SS, 76 * SS);
    if (opt.band === 'box') {
      const x1 = 56 * SS + big.width + 28 * SS;
      fill(cv, [[[28 * SS, 34 * SS], [x1, 34 * SS], [x1, 148 * SS], [28 * SS, 148 * SS]]], C.shade, 0.55);
    } else fill(cv, [[[0, 0], [W, 0], [W, 170 * SS], [0, 170 * SS]]], C.shade, 0.35);
    fill(cv, big.rings, C.text);
  }
  const mark = textRings(ft, 'IntMap', 0, 0, 34 * SS);
  const mx = W - mark.width - 48 * SS, my = Hh - 44 * SS;
  fill(cv, textRings(ft, 'IntMap', mx, my, 34 * SS).rings, C.text, 0.92);
}

export { canvas, fill as fillRings, stroke as strokeRing, downsample, mercY, C as CARD_COLOURS, SS as CARD_SUPERSAMPLE, land as todayLand };
