#!/usr/bin/env node
/* ============================================================================
 *  IntMap · scripts/build-app-manifest.mjs — the Web App Manifest and its icons   (installable-app)
 * ----------------------------------------------------------------------------
 *  PRODUCT.md §1 said 「PWA としても入る」 and the repository held no manifest, no theme-color, no
 *  apple-touch-icon and no install entry — the claim had nothing under it. This writes the manifest
 *  and the icons it names, and every value in them is READ from something that already states it:
 *
 *    name / short_name   the wordmark of index.html's <title> (the part before « — »). ⚠ «IntMap» is a
 *                        wordmark, not a phrase: it is never translated (memory: product name is a
 *                        wordmark) — the title is the one place the app already spells it.
 *    description         index.html's <meta name="description">
 *    lang                index.html's <html lang>, the language those two are written in
 *    background_color    css/intmap.css's dark --bg-color — the field the icon is flattened onto
 *    theme_color         …the same, because the launch screen an installed app opens on is that icon
 *                        on that field (scripts/boot-icon-flatten.mjs makes the icon's border exactly
 *                        this colour; the check below re-measures it, so the two cannot part)
 *    icons               IntMap.Icon.png, resampled — 192 and 512 (the two sizes Chromium's install
 *                        criteria name), a maskable 512 whose mark sits inside the safe zone, and the
 *                        180 px apple-touch-icon iOS asks for
 *
 *  index.html carries the same facts a second time where a browser reads them from markup
 *  (theme-color per colour scheme, apple-mobile-web-app-title). `--check` re-derives everything
 *  here AND compares those tags with it, so the markup cannot drift from the tokens.
 *
 *  ⚠ THE 512 px ICONS ARE UPSCALED. The dark mark exists in the repository only at 384 px
 *    (IntMap.Icon.png); IntMap.Icon_BW-inverted.png is 1254 px but it is the LIGHT mark, a different
 *    picture. Bicubic from 384 is the honest best this source allows; a larger master of the dark
 *    mark replaces it with no code change (the sizes are derived from the output, not the input).
 *
 *      node scripts/build-app-manifest.mjs           write manifest.webmanifest and icons/
 *      node scripts/build-app-manifest.mjs --check   re-derive and compare; exit 1 on any difference
 * ==========================================================================*/
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pngDecode } from './subcables/png.mjs';
import { deltaE00 } from '../tests/helpers/colour-difference.js';   /* the repository's ONE perceptual difference (memory: perceptual claims need ΔE00) */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_ICON = 'IntMap.Icon.png';
export const MANIFEST_FILE = 'manifest.webmanifest';
export const ICON_DIR = 'icons';

/* The icons and why each exists. `purpose` is the manifest's own vocabulary; `maskable` is the one an
   Android launcher crops to its own shape, so its mark is fitted into the W3C safe zone below. */
export const ICONS = [
  { file: 'icon-192.png', size: 192, purpose: 'any' },          /* Chromium installability: ≥ 192 */
  { file: 'icon-512.png', size: 512, purpose: 'any' },          /* Chromium installability: ≥ 512 (splash) */
  { file: 'icon-maskable-512.png', size: 512, purpose: 'maskable' },
  { file: 'apple-touch-icon.png', size: 180, purpose: null },   /* iOS home screen; not in the manifest */
];
/* W3C Manifest «maskable» safe zone: a circle centred on the icon whose RADIUS is 40 % of its width.
   Anything outside it may be cropped by a launcher's mask. */
const SAFE_ZONE_RADIUS = 0.4;

/* ── reading what the app already states ─────────────────────────────────────────────────────── */
const rd = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const attr = (tag, name) => { const m = new RegExp('\\b' + name + '\\s*=\\s*"([^"]*)"', 'i').exec(tag); return m ? m[1] : null; };
/* one pass over the five entities, so "&amp;lt;" decodes to "&lt;" and not to "<" (decoding &amp; first would decode twice) */
const ENTITIES = { '&amp;': '&', '&quot;': '"', '&#39;': "'", '&lt;': '<', '&gt;': '>' };
function decodeEntities(s) { return s.replace(/&(?:amp|quot|#39|lt|gt);/g, (e) => ENTITIES[e]); }

export function readDocument(html = rd('index.html')) {
  const title = /<title>([^<]*)<\/title>/i.exec(html);
  if (!title) throw new Error('index.html has no <title> — the product name is read from it');
  const wordmark = decodeEntities(title[1]).split(/\s+[—–]\s+/)[0].trim();
  if (!wordmark) throw new Error('index.html <title> has no wordmark before « — »');
  const metas = html.match(/<meta\b[^>]*>/gi) || [];
  const desc = metas.find((t) => attr(t, 'name') === 'description');
  if (!desc) throw new Error('index.html has no <meta name="description">');
  const lang = attr((/<html\b[^>]*>/i.exec(html) || [''])[0], 'lang');
  if (!lang) throw new Error('index.html <html> has no lang');
  return { name: wordmark, description: decodeEntities(attr(desc, 'content')).trim(), lang, metas };
}

/* the two --bg-color tokens: the light one on the bare `:root{…}` rule, the dark one on
   `[data-theme="dark"]{…}` — the same two css/intmap.css paints the launch screen with */
export function readThemeTokens(css = rd('css/intmap.css')) {
  const tok = (selRe) => {
    const re = new RegExp(selRe + '\\s*\\{([^}]*)\\}', 'g');
    let m;
    while ((m = re.exec(css))) { const v = /--bg-color\s*:\s*(#[0-9a-fA-F]{3,8})\b/.exec(m[1]); if (v) return v[1].toLowerCase(); }
    return null;
  };
  const light = tok('(?:^|\\n)\\s*:root'), dark = tok('(?:^|\\n)\\s*\\[data-theme="dark"\\]');
  if (!light || !dark) throw new Error('css/intmap.css: could not read --bg-color for both themes (light ' + light + ', dark ' + dark + ')');
  return { light, dark };
}

const hex = (rgb) => '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('');

/* ── pixels ────────────────────────────────────────────────────────────────────────────────── */
function toRGB(im) {
  if (im.bpp === 3) return im.data;
  const out = Buffer.alloc(im.w * im.h * 3);
  for (let i = 0, j = 0; i < im.data.length; i += 4, j += 3) { out[j] = im.data[i]; out[j + 1] = im.data[i + 1]; out[j + 2] = im.data[i + 2]; }
  return out;
}
/* the flat colour the mark sits on — measured the way scripts/boot-icon-flatten.mjs measures it (its
   `fieldColour`): the per-channel median of a 3 px border ring */
function fieldOf(rgb, w, h, ring = 3) {
  const ch = [[], [], []];
  const push = (x, y) => { const o = (y * w + x) * 3; for (let c = 0; c < 3; c++) ch[c].push(rgb[o + c]); };
  for (let y = 0; y < ring; y++) for (let x = 0; x < w; x++) { push(x, y); push(x, h - 1 - y); }
  for (let x = 0; x < ring; x++) for (let y = ring; y < h - ring; y++) { push(x, y); push(w - 1 - x, y); }
  ch.forEach((v) => v.sort((p, q) => p - q));
  return ch.map((v) => v[v.length >> 1]);
}
/* the farthest pixel that is MARK, from the image centre, in source pixels. «Mark» is what a reader can
   see against the field — ΔE00 ≥ 1, one just-noticeable difference (tests/helpers/colour-difference.js
   states the scale). MEASURED on IntMap.Icon.png: the flattened field still carries stray (0,1,2)
   pixels in its corners, and a «not exactly the field colour» rule read those as mark 270 px out and
   shrank the maskable picture to half its size for pixels nobody can see. */
const PERCEPTIBLE = 1;
function markRadius(rgb, w, h, F) {
  const cx = (w - 1) / 2, cy = (h - 1) / 2;
  let r = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 3;
    const d = Math.hypot(x - cx, y - cy);
    if (d <= r) continue;
    if (deltaE00([rgb[i], rgb[i + 1], rgb[i + 2]], F) < PERCEPTIBLE) continue;
    r = d;
  }
  return r;
}

/* Catmull-Rom weight — the cubic that passes through its samples, so a flat field stays flat */
function cubic(t) {
  const a = Math.abs(t);
  if (a < 1) return 1.5 * a * a * a - 2.5 * a * a + 1;
  if (a < 2) return -0.5 * a * a * a + 2.5 * a * a - 4 * a + 2;
  return 0;
}
/**
 * Resample `src` (w×h RGB) into an S×S image where one source pixel spans `k` output pixels and the
 * source centre lands on the output centre; outside the source the field colour F is drawn.
 * k < 1 averages every source pixel the output pixel covers (a box filter — no aliasing on the way
 * down); k ≥ 1 interpolates bicubically.
 */
export function resample(src, w, h, S, k, F) {
  const out = Buffer.alloc(S * S * 3);
  const cxS = w / 2, cyS = h / 2, cxD = S / 2, cyD = S / 2;
  const sample = (x, y, c) => (x < 0 || y < 0 || x >= w || y >= h) ? F[c] : src[(y * w + x) * 3 + c];
  for (let Y = 0; Y < S; Y++) for (let X = 0; X < S; X++) {
    const o = (Y * S + X) * 3;
    if (k < 1) {
      /* the output pixel's footprint in source coordinates */
      const x0 = (X - cxD) / k + cxS, x1 = (X + 1 - cxD) / k + cxS;
      const y0 = (Y - cyD) / k + cyS, y1 = (Y + 1 - cyD) / k + cyS;
      const acc = [0, 0, 0]; let wsum = 0;
      for (let y = Math.floor(y0); y < Math.ceil(y1); y++) {
        const wy = Math.min(y + 1, y1) - Math.max(y, y0); if (wy <= 0) continue;
        for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
          const wx = Math.min(x + 1, x1) - Math.max(x, x0); if (wx <= 0) continue;
          const wgt = wx * wy; wsum += wgt;
          for (let c = 0; c < 3; c++) acc[c] += wgt * sample(x, y, c);
        }
      }
      for (let c = 0; c < 3; c++) out[o + c] = Math.max(0, Math.min(255, Math.round(acc[c] / wsum)));
    } else {
      /* the output pixel's centre in source coordinates, as a position between source pixel centres */
      const sx = (X + 0.5 - cxD) / k + cxS - 0.5, sy = (Y + 0.5 - cyD) / k + cyS - 0.5;
      const ix = Math.floor(sx), iy = Math.floor(sy);
      const acc = [0, 0, 0]; let wsum = 0;
      for (let m = -1; m <= 2; m++) { const wy = cubic(sy - (iy + m));
        for (let n = -1; n <= 2; n++) { const wgt = wy * cubic(sx - (ix + n)); if (!wgt) continue; wsum += wgt;
          for (let c = 0; c < 3; c++) acc[c] += wgt * sample(ix + n, iy + m, c); } }
      for (let c = 0; c < 3; c++) out[o + c] = Math.max(0, Math.min(255, Math.round(acc[c] / wsum)));
    }
  }
  return out;
}

/* ── PNG out: 8-bit RGB, each row filtered with whichever of the five filters is smallest ──── */
const CRC_T = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c; } return t; })();
function crc32(b) { let c = -1; for (let i = 0; i < b.length; i++) c = CRC_T[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
export function pngEncodeRGB(px, w, h) {
  const stride = w * 3, bpp = 3;
  const raw = Buffer.alloc(h * (stride + 1));
  const paeth = (a, b, c) => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); };
  const cand = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const cur = px.subarray(y * stride, (y + 1) * stride), prev = y ? px.subarray((y - 1) * stride, y * stride) : null;
    let best = 0, bestSum = Infinity, bestRow = null;
    for (let f = 0; f < 5; f++) {
      let sum = 0;
      for (let x = 0; x < stride; x++) {
        const a = x >= bpp ? cur[x - bpp] : 0, b = prev ? prev[x] : 0, c = (prev && x >= bpp) ? prev[x - bpp] : 0;
        const v = (cur[x] - (f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? ((a + b) >> 1) : paeth(a, b, c))) & 0xFF;
        cand[x] = v; sum += v < 128 ? v : 256 - v;
      }
      if (sum < bestSum) { bestSum = sum; best = f; bestRow = Buffer.from(cand); }
    }
    raw[y * (stride + 1)] = best; bestRow.copy(raw, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/* ── the derivation ─────────────────────────────────────────────────────────────────────────── */
export function derive() {
  const doc = readDocument();
  const tokens = readThemeTokens();
  const im = pngDecode(fs.readFileSync(path.join(ROOT, SOURCE_ICON)));
  if (im.w !== im.h) throw new Error(SOURCE_ICON + ' is not square');
  const rgb = toRGB(im);
  const F = fieldOf(rgb, im.w, im.h);
  if (hex(F) !== tokens.dark) throw new Error(SOURCE_ICON + ' field ' + hex(F) + ' is not the dark --bg-color ' + tokens.dark + ' — run scripts/boot-icon-flatten.mjs');
  const rMark = markRadius(rgb, im.w, im.h, F);
  const icons = ICONS.map((ic) => {
    /* `any`: the whole picture, edge to edge. `maskable`: scaled so the mark's farthest pixel is
       inside the safe-zone circle — and never larger than edge to edge. */
    const k = ic.purpose === 'maskable'
      ? Math.min(ic.size / im.w, (SAFE_ZONE_RADIUS * ic.size) / rMark)
      : ic.size / im.w;
    return { ...ic, purposes: ic.purpose ? [ic.purpose] : [], px: resample(rgb, im.w, im.h, ic.size, k, F) };
  }).reduce((kept, ic) => {
    /* ⚠ ONE PICTURE, ONE FILE. When the mark already sits inside the safe zone edge to edge, the
       maskable rendering IS the `any` one, pixel for pixel — and a second copy would be a payload
       shipped twice (scripts/asset-report.mjs refuses those). The file then says both purposes. */
    const same = kept.find((k) => k.size === ic.size && k.purposes.length && ic.purposes.length && k.px.equals(ic.px));
    if (same) same.purposes.push(...ic.purposes); else kept.push(ic);
    return kept;
  }, []);
  const manifest = {
    id: './',
    name: doc.name,
    short_name: doc.name,
    description: doc.description,
    lang: doc.lang,
    dir: 'ltr',
    start_url: './',
    scope: './',
    display: 'standalone',
    background_color: tokens.dark,
    theme_color: tokens.dark,
    icons: icons.filter((ic) => ic.purposes.length).map((ic) => ({ src: ICON_DIR + '/' + ic.file, sizes: ic.size + 'x' + ic.size, type: 'image/png', purpose: ic.purposes.join(' ') })),
  };
  return { doc, tokens, manifest, icons, text: JSON.stringify(manifest, null, 2) + '\n' };
}

/* what index.html must say for the facts it repeats in markup */
export function expectedHead(d) {
  return [
    { what: 'theme-color for the light scheme', match: (t) => attr(t, 'name') === 'theme-color' && /prefers-color-scheme:\s*light/.test(attr(t, 'media') || ''), content: d.tokens.light },
    { what: 'theme-color for the dark scheme', match: (t) => attr(t, 'name') === 'theme-color' && /prefers-color-scheme:\s*dark/.test(attr(t, 'media') || ''), content: d.tokens.dark },
    { what: 'apple-mobile-web-app-title', match: (t) => attr(t, 'name') === 'apple-mobile-web-app-title', content: d.manifest.short_name },
  ];
}

export function check() {
  const d = derive();
  const problems = [];
  const mf = path.join(ROOT, MANIFEST_FILE);
  if (!fs.existsSync(mf)) problems.push(MANIFEST_FILE + ' is missing');
  else if (fs.readFileSync(mf, 'utf8').replace(/\r\n/g, '\n') !== d.text) problems.push(MANIFEST_FILE + ' differs from what index.html, css/intmap.css and the icon state — re-run node scripts/build-app-manifest.mjs');
  if (fs.existsSync(path.join(ROOT, ICON_DIR))) for (const old of fs.readdirSync(path.join(ROOT, ICON_DIR)))
    if (!d.icons.some((ic) => ic.file === old)) problems.push(ICON_DIR + '/' + old + ' is not derived by this script any more — re-run it');
  for (const ic of d.icons) {
    const f = path.join(ROOT, ICON_DIR, ic.file);
    if (!fs.existsSync(f)) { problems.push(ICON_DIR + '/' + ic.file + ' is missing'); continue; }
    /* compared as PIXELS, not bytes: the bytes depend on the zlib build, the picture does not */
    const got = pngDecode(fs.readFileSync(f));
    if (got.w !== ic.size || got.h !== ic.size) { problems.push(ICON_DIR + '/' + ic.file + ' is ' + got.w + '×' + got.h + ', not ' + ic.size); continue; }
    if (!toRGB(got).equals(ic.px)) problems.push(ICON_DIR + '/' + ic.file + ' is not ' + SOURCE_ICON + ' resampled — re-run node scripts/build-app-manifest.mjs');
  }
  for (const e of expectedHead(d)) {
    const tags = d.doc.metas.filter(e.match);
    if (tags.length !== 1) problems.push('index.html: expected one <meta> for ' + e.what + ', found ' + tags.length);
    else if ((attr(tags[0], 'content') || '').toLowerCase() !== e.content.toLowerCase()) problems.push('index.html: ' + e.what + ' says ' + attr(tags[0], 'content') + ', the source says ' + e.content);
  }
  return problems;
}

function write() {
  const d = derive();
  fs.writeFileSync(path.join(ROOT, MANIFEST_FILE), d.text);
  fs.mkdirSync(path.join(ROOT, ICON_DIR), { recursive: true });
  /* the directory is this script's output and nothing else's: a file it no longer derives goes */
  for (const old of fs.readdirSync(path.join(ROOT, ICON_DIR))) if (!d.icons.some((ic) => ic.file === old)) fs.rmSync(path.join(ROOT, ICON_DIR, old));
  for (const ic of d.icons) fs.writeFileSync(path.join(ROOT, ICON_DIR, ic.file), pngEncodeRGB(ic.px, ic.size, ic.size));
  console.log('✓ wrote ' + MANIFEST_FILE + ' and ' + d.icons.length + ' icons under ' + ICON_DIR + '/ (name «' + d.manifest.name + '», theme ' + d.tokens.dark + ')');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--check')) {
    const p = check();
    if (p.length) { for (const x of p) console.error('✗ ' + x); process.exit(1); }
    console.log('✓ ' + MANIFEST_FILE + ', its icons and the head tags of index.html agree with their sources');
  } else write();
}
