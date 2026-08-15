#!/usr/bin/env node
/* ============================================================================
 *  IntMap · THE MAP'S OWN LETTERS — Inter, as SDF glyph atlases   (#R242)
 * ----------------------------------------------------------------------------
 *  「IntMap内のすべての文字は以下にしろ。…地名ラベルも例外ではない。（恒久的に）
 *     Latin / Cyrillic → Inter」
 *
 *  ══ WHY THIS FILE HAS TO EXIST ══════════════════════════════════════════════════════════════
 *  A MapLibre symbol layer does not read CSS. It asks a glyph server for `{fontstack}/{range}.pbf`
 *  — signed-distance-field bitmaps, 256 codepoints at a time — and the app has always asked
 *  tiles.openfreemap.org, whose only Latin face is Noto Sans (measured: `Inter Regular/0-255.pbf`
 *  is a 404 there, and fonts.openmaptiles.org publishes Metropolis / Open Sans / Noto only). No
 *  public server serves Inter, and MapLibre's one escape hatch — `localIdeographFontFamily` — covers
 *  CJK and Hangul ONLY. So for the Latin and Cyrillic half of the instruction there is exactly one
 *  way to keep it: generate the atlases from the bundled Inter and serve them from this origin.
 *
 *  ══ WHAT IT PRODUCES ════════════════════════════════════════════════════════════════════════
 *      fonts/Inter Regular/{range}.pbf     for the ranges listed in RANGES below
 *  which is what js/app-body.js's `transformRequest` points the renderer at. Anything outside those
 *  ranges (Arabic, Thai, Devanagari, Hebrew, …) still goes to openfreemap's Noto Sans, because the
 *  alternative is a map with holes in it.
 *
 *  ⚠ AND THE ATLAS IS A MERGE, NOT A REPLACEMENT. Inter does not cover every codepoint in these
 *  ranges (large parts of Latin-Ext-B, the IPA block, some Cyrillic supplements). A glyph that is
 *  missing from a stack is drawn as NOTHING, so shipping Inter alone would silently delete
 *  characters that are on the map today. Every range is therefore built as «Inter where Inter has
 *  it, the current Noto Sans glyph where it does not», with the Noto side downloaded once from the
 *  same server the app already uses. The output is a strict superset of what the reader sees now.
 *
 *  ══ THE FORMAT ══════════════════════════════════════════════════════════════════════════════
 *  glyphs.proto (Mapbox/MapLibre): glyphs{ stacks[1]: fontstack{ name[1], range[2], glyphs[3]:
 *  glyph{ id[1], bitmap[2], width[3], height[4], left[5], top[6], advance[7] } } }. `width`/`height`
 *  are the glyph box WITHOUT the 3 px buffer; the bitmap is (width+6)×(height+6) bytes of SDF, one
 *  byte a pixel, row-major. The SDF convention is Mapbox's: rendered at 24 px, radius 8, cutoff
 *  0.25, so 255−255·(d/8+0.25) with d in pixels, positive outside.
 *
 *      node scripts/build-glyphs.mjs            # rebuild every range
 *      node scripts/build-glyphs.mjs --check    # verify the committed output matches the font
 * ==========================================================================*/
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import opentype from 'opentype.js';
import Pbf from 'pbf';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC_TTF = join(ROOT, 'fonts', 'src', 'Inter.ttf');
const OUT_DIR = join(ROOT, 'fonts', 'Inter Regular');
const FALLBACK = 'https://tiles.openfreemap.org/fonts/Noto%20Sans%20Regular/';
const STACK = 'Inter Regular';

/* The ranges the app redirects. Latin, Latin-Ext, IPA, Greek, Cyrillic and the punctuation /
   symbol blocks a place name or a legend actually uses. Keep in step with GLYPH_RANGES in
   js/app-body.js — tests/r242-checks asserts the two lists are identical. */
export const RANGES = [0, 256, 512, 768, 1024, 1280, 7680, 8192, 8448, 8704];

const SIZE = 24, BUFFER = 3, RADIUS = 8, CUTOFF = 0.25;
/* (#R247) how far above the alphabetic baseline the `top` origin sits in a SERVER font. MapLibre
   calls the same number `topAdjustment = 27.5` where it converts TinySDF metrics into this
   convention; measured against tiles.openfreemap.org's own Noto Sans Regular it is exactly 27 for
   every glyph compared. See the note by `top:` in buildRange for what it cost to have it wrong. */
const TOP_ORIGIN = 27;

/* ── a scanline rasteriser over the flattened outline, 4× supersampled ────────────────────────── */
function flatten(path) {
  const polys = []; let cur = null, x = 0, y = 0, sx = 0, sy = 0;
  const pt = (px, py) => { if (cur) cur.push(px, py); };
  const bez = (x0, y0, cps, x1, y1) => {
    /* enough segments that a 24 px glyph never shows a facet */
    const n = 12;
    for (let i = 1; i <= n; i++) {
      const t = i / n, u = 1 - t;
      let px, py;
      if (cps.length === 2) { px = u * u * x0 + 2 * u * t * cps[0] + t * t * x1; py = u * u * y0 + 2 * u * t * cps[1] + t * t * y1; }
      else { px = u * u * u * x0 + 3 * u * u * t * cps[0] + 3 * u * t * t * cps[2] + t * t * t * x1;
             py = u * u * u * y0 + 3 * u * u * t * cps[1] + 3 * u * t * t * cps[3] + t * t * t * y1; }
      pt(px, py);
    }
  };
  for (const c of path.commands) {
    if (c.type === 'M') { if (cur && cur.length >= 6) polys.push(cur); cur = [c.x, c.y]; x = sx = c.x; y = sy = c.y; }
    else if (c.type === 'L') { pt(c.x, c.y); x = c.x; y = c.y; }
    else if (c.type === 'Q') { bez(x, y, [c.x1, c.y1], c.x, c.y); x = c.x; y = c.y; }
    else if (c.type === 'C') { bez(x, y, [c.x1, c.y1, c.x2, c.y2], c.x, c.y); x = c.x; y = c.y; }
    else if (c.type === 'Z') { if (cur && cur.length >= 6) polys.push(cur); cur = null; x = sx; y = sy; }
  }
  if (cur && cur.length >= 6) polys.push(cur);
  return polys;
}

/* coverage in [0,1] per pixel, non-zero winding, 4×4 samples */
function rasterise(polys, w, h, ox, oy) {
  const SS = 4, cov = new Float64Array(w * h);
  const edges = [];
  for (const p of polys) for (let i = 0; i < p.length; i += 2) {
    const x0 = p[i] - ox, y0 = p[i + 1] - oy;
    const j = (i + 2) % p.length, x1 = p[j] - ox, y1 = p[j + 1] - oy;
    if (y0 !== y1) edges.push(x0, y0, x1, y1);
  }
  const xs = [], dir = [];
  for (let sy = 0; sy < h * SS; sy++) {
    const yy = (sy + 0.5) / SS;
    xs.length = 0; dir.length = 0;
    for (let e = 0; e < edges.length; e += 4) {
      const y0 = edges[e + 1], y1 = edges[e + 3];
      if ((yy >= y0 && yy < y1) || (yy >= y1 && yy < y0)) {
        const x0 = edges[e], x1 = edges[e + 2];
        xs.push(x0 + (x1 - x0) * ((yy - y0) / (y1 - y0)));
        dir.push(y1 > y0 ? 1 : -1);
      }
    }
    if (!xs.length) continue;
    const ord = xs.map((v, k) => k).sort((a, b) => xs[a] - xs[b]);
    let wind = 0;
    const row = (sy / SS) | 0;
    for (let k = 0; k < ord.length - 1; k++) {
      wind += dir[ord[k]];
      if (wind === 0) continue;
      const a = xs[ord[k]], b = xs[ord[k + 1]];
      const pa = Math.max(0, Math.floor(a * SS)), pb = Math.min(w * SS - 1, Math.ceil(b * SS));
      for (let sx = pa; sx <= pb; sx++) {
        const xx = (sx + 0.5) / SS;
        if (xx < a || xx >= b) continue;
        const col = (sx / SS) | 0;
        if (col >= 0 && col < w && row >= 0 && row < h) cov[row * w + col] += 1 / (SS * SS);
      }
    }
  }
  for (let i = 0; i < cov.length; i++) if (cov[i] > 1) cov[i] = 1;
  return cov;
}

/* ── Felzenszwalb & Huttenlocher's separable EDT on squared distances ─────────────────────────── */
const INF = 1e20;
function edt1d(f, d, v, z, n) {
  v[0] = 0; z[0] = -INF; z[1] = INF;
  for (let q = 1, k = 0; q < n; q++) {
    let s;
    do { s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); } while (s <= z[k] && --k > -1);
    k++; v[k] = q; z[k] = s; z[k + 1] = INF;
  }
  for (let q = 0, k = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const dq = q - v[k];
    d[q] = dq * dq + f[v[k]];
  }
}
function edt(data, w, h, f, d, v, z) {
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = data[y * w + x];
    edt1d(f, d, v, z, h);
    for (let y = 0; y < h; y++) data[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = data[y * w + x];
    edt1d(f, d, v, z, w);
    for (let x = 0; x < w; x++) data[y * w + x] = Math.sqrt(d[x]);
  }
}

/* coverage → one byte a pixel, the SDF the renderer expects */
function sdf(cov, w, h) {
  const n = w * h, outer = new Float64Array(n), inner = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = cov[i];
    outer[i] = a === 1 ? 0 : a === 0 ? INF : Math.pow(Math.max(0, 0.5 - a), 2);
    inner[i] = a === 1 ? INF : a === 0 ? 0 : Math.pow(Math.max(0, a - 0.5), 2);
  }
  const m = Math.max(w, h), f = new Float64Array(m), d = new Float64Array(m);
  const v = new Int32Array(m), z = new Float64Array(m + 1);
  edt(outer, w, h, f, d, v, z);
  edt(inner, w, h, f, d, v, z);
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const dist = outer[i] - inner[i];
    out[i] = Math.max(0, Math.min(255, Math.round(255 - 255 * (dist / RADIUS + CUTOFF))));
  }
  return out;
}

/* ── the protobuf, both ways ──────────────────────────────────────────────────────────────────── */
function writeGlyph(g, pbf) {
  pbf.writeVarintField(1, g.id);
  if (g.bitmap && g.bitmap.length) pbf.writeBytesField(2, g.bitmap);
  pbf.writeVarintField(3, g.width);
  pbf.writeVarintField(4, g.height);
  pbf.writeSVarintField(5, g.left);
  pbf.writeSVarintField(6, g.top);
  pbf.writeVarintField(7, g.advance);
}
function encode(name, range, glyphs) {
  const pbf = new Pbf();
  pbf.writeMessage(1, (_, p) => {
    p.writeStringField(1, name);
    p.writeStringField(2, range);
    for (const g of glyphs) p.writeMessage(3, writeGlyph, g);
  }, null);
  return Buffer.from(pbf.finish());
}
function readGlyph(tag, g, pbf) {
  if (tag === 1) g.id = pbf.readVarint();
  else if (tag === 2) g.bitmap = pbf.readBytes();
  else if (tag === 3) g.width = pbf.readVarint();
  else if (tag === 4) g.height = pbf.readVarint();
  else if (tag === 5) g.left = pbf.readSVarint();
  else if (tag === 6) g.top = pbf.readSVarint();
  else if (tag === 7) g.advance = pbf.readVarint();
}
function decode(buf) {
  const out = [];
  new Pbf(buf).readFields((tag, _, pbf) => {
    if (tag !== 1) return;
    /* ⚠ no explicit skip: Pbf.readFields skips any field the callback did not consume, and calling
       `skip` with a TAG rather than the tag-and-wire-type byte corrupts the stream (measured: every
       fallback range decoded to zero glyphs). */
    pbf.readMessage((t2, __, p2) => { if (t2 === 3) out.push(p2.readMessage(readGlyph, {})); }, null);
  }, null);
  return out;
}

/* ── one range ────────────────────────────────────────────────────────────────────────────────── */
function buildRange(font, start, fallback) {
  const scale = SIZE / font.unitsPerEm;
  const have = new Set(), glyphs = [];
  for (let cp = start; cp < start + 256; cp++) {
    const g = font.charToGlyph(String.fromCodePoint(cp));
    if (!g || g.index === 0) continue;                       /* .notdef — Inter has no such glyph */
    const advance = Math.round((g.advanceWidth || 0) * scale);
    const path = g.getPath(0, 0, SIZE);                       /* y grows DOWN in opentype's paths */
    const bb = path.getBoundingBox();
    if (!isFinite(bb.x1) || bb.x2 - bb.x1 <= 0 || bb.y2 - bb.y1 <= 0) {
      glyphs.push({ id: cp, bitmap: new Uint8Array(0), width: 0, height: 0, left: 0, top: 0, advance });
      have.add(cp); continue;                                 /* a space: metrics only */
    }
    const x0 = Math.floor(bb.x1), y0 = Math.floor(bb.y1);
    const w = Math.ceil(bb.x2) - x0, h = Math.ceil(bb.y2) - y0;
    const bw = w + 2 * BUFFER, bh = h + 2 * BUFFER;
    const cov = rasterise(flatten(path), bw, bh, x0 - BUFFER, y0 - BUFFER);
    /* ══ ⚠⚠⚠ (#R243) `top` IS THE TOP OF THE BOX, AND #R242 WROTE THE BOTTOM ═══════════════════════
       「キリル文字、ラテン文字の地名ラベルの文字がガタガタになっている」 — and this one line is the
       whole of it. MapLibre places a glyph quad at `y1 = (−metrics.top − border)·scale`
       (maplibre-gl-dev.js, getGlyphQuads), so `top` MUST be the distance from the baseline UP to the
       top edge of the bitmap. `-y0 - h` is `-ceil(bb.y2)` — the distance to the BOTTOM edge — so
       every glyph was drawn its OWN HEIGHT too low, and «its own height» is different for every
       letter. MEASURED at 24 px: H and L got top 0 instead of 18, x got 0 instead of 14, the hyphen
       got 6 instead of 9. A cap therefore sank 18 px, an x-height letter 14 and a hyphen 3 — which
       on screen is a line of type where the capitals sit low and the hyphens float. Exactly 「ガタガタ」.
       ⚠ tests/r243-checks asserts this against the font, so the metric cannot silently drift again. */
    /* ══ ⚠⚠⚠ (#R247) …AND `top` IS NOT MEASURED FROM THE BASELINE — IT IS 27 UNITS ABOVE IT ═════════
       「ニュースピンの帯から文字位置がずれてはみ出ている。」

       #R243 got the SIGN and the EDGE right and the ORIGIN wrong, and the difference is invisible on
       a place label and unmissable inside a box. MapLibre says it in its own source
       (src/render/glyph_manager.ts, the TinySDF branch):

           «TinySDF's "top" is the distance from the alphabetic baseline to the top of the glyph.
            SERVER-GENERATED FONTS SPECIFY "top" RELATIVE TO AN ORIGIN ABOVE THE EM BOX … To
            approximately align TinySDF glyphs with server-provided glyphs we use this baseline
            adjustment factor»   const topAdjustment = 27.5;

       This atlas IS a server font — `glyphRewrite` serves it where «Noto Sans Regular» was asked for
       (js/map-typography.js) — so it has to speak the server convention. MEASURED against the very
       font it replaces (tiles.openfreemap.org/fonts/Noto Sans Regular/0-255.pbf), our `top` was
       exactly 27 units high on every glyph checked: H 18 vs −9, x 14 vs −13, g 14 vs −13, A 18 vs
       −9, o 14 vs −13. 27 units of a 24-unit em is 1.125 em, and the two places it showed are the
       two places something else is on the same line:
         · the news band — the pill is fitted to the SHAPING box, which is metric-independent, so the
           type floated up out of a pill that stayed put («帯から文字位置がずれてはみ出ている»);
         · any line mixing Latin with CJK, because CJK comes from the browser through TinySDF, which
           applies the −27.5 above. The two scripts sat 1.1 em apart.
       A line that is ALL atlas simply shifts as a whole, which is why 「ガタガタ」 was fixed by #R243
       and this was not: a uniform shift has nothing to be ragged against. */
    glyphs.push({ id: cp, bitmap: sdf(cov, bw, bh), width: w, height: h,
      left: x0, top: -y0 - TOP_ORIGIN, advance });            /* the box top, from the server origin */
    have.add(cp);
  }
  let filled = 0;
  for (const g of fallback) if (!have.has(g.id)) { glyphs.push(g); filled++; }
  glyphs.sort((a, b) => a.id - b.id);
  return { glyphs, filled };
}

async function fetchFallback(start) {
  const url = FALLBACK + start + '-' + (start + 255) + '.pbf';
  try {
    const r = await fetch(url);
    if (!r.ok) return [];
    return decode(Buffer.from(await r.arrayBuffer()));
  } catch (_) { return []; }
}

const CHECK = process.argv.includes('--check');
if (!existsSync(SRC_TTF)) {
  console.error('scripts/build-glyphs.mjs: fonts/src/Inter.ttf is missing — it is the source of the atlases.');
  process.exit(1);
}
const font = opentype.parse(readFileSync(SRC_TTF).buffer.slice(0));
mkdirSync(OUT_DIR, { recursive: true });
let bad = 0, total = 0;
for (const start of RANGES) {
  const name = start + '-' + (start + 255);
  const fb = CHECK ? [] : await fetchFallback(start);
  const { glyphs, filled } = buildRange(font, start, fb);
  const buf = encode(STACK, name, glyphs);
  const out = join(OUT_DIR, name + '.pbf');
  total += glyphs.length;
  if (CHECK) {
    if (!existsSync(out)) { console.error('  ✗ missing ' + name + '.pbf'); bad++; continue; }
    const got = decode(readFileSync(out));
    const byId = new Map(got.map((g) => [g.id, g]));
    const missing = glyphs.filter((g) => !byId.has(g.id));
    /* ⚠ (#R243) …AND THE METRICS, NOT ONLY THE CODEPOINTS. #R242's check asked «is this character in
       the file», which a committed atlas with every glyph placed at the wrong `top` passes without a
       word. The four numbers that POSITION a glyph are what a reader sees, so they are what is
       compared. (The SDF bytes are not: they are re-derived here and a rounding difference between
       two Node versions would make this fail for no reader-visible reason.) */
    const wrong = glyphs.filter((g) => { const o = byId.get(g.id); return o &&
      (o.width !== g.width || o.height !== g.height || (o.left | 0) !== g.left || (o.top | 0) !== g.top || o.advance !== g.advance); });
    if (missing.length) { console.error('  ✗ ' + name + ': ' + missing.length + ' codepoint(s) not in the committed atlas'); bad++; }
    else if (wrong.length) { console.error('  ✗ ' + name + ': ' + wrong.length + ' glyph(s) with different metrics — e.g. U+'
      + wrong[0].id.toString(16).toUpperCase() + ' committed top ' + byId.get(wrong[0].id).top + ', font says ' + wrong[0].top); bad++; }
    else console.log('  ✓ ' + name + ' — ' + got.length + ' glyphs');
  } else {
    writeFileSync(out, buf);
    console.log('  ' + name + '.pbf — ' + glyphs.length + ' glyphs (' + filled + ' from Noto Sans), ' + Math.round(buf.length / 1024) + ' KB');
  }
}
if (CHECK && bad) process.exit(1);
console.log(CHECK ? '\n✓ glyph atlases check out' : '\n✓ ' + total + ' glyphs in ' + RANGES.length + ' ranges → fonts/Inter Regular/');
