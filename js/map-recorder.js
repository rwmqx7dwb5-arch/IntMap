// @ts-check
/* ============================================================================
 *  IntMap · js/map-recorder.js — THE TIME-LAPSE AS A FILE, AND THE COMPARISON AS ONE PICTURE  (timelapse-video-export)
 * ----------------------------------------------------------------------------
 *  PRODUCT.md §2.4: the readers who spread IntMap are the ones who post it, and a time-lapse or a «1914 | today»
 *  comparison is the thing they post. Until this file the only way to take either away was a screen recorder,
 *  which records the panel, the cursor and every half-drawn tile in between. This writes the lapse to a video
 *  (MP4 where the browser can encode it, WebM otherwise) and the comparison window beside the main map to a PNG,
 *  both through ONE compositor: the map, the instant it shows, the credit, the wordmark and the link.
 *
 *  ⚠ A VIDEO FRAME IS A LAPSE FRAME, NOT A SLICE OF WALL-CLOCK TIME. js/time-lapse.js sets the next instant only
 *    when the map has drawn the current one (kernel judged · tiles in · border record on screen). The recorder is
 *    that player's frame SINK: it is handed each drawn frame, reads the renderer inside a render tick (the WebGL
 *    buffer is not preserved — js/atlas-view-capture.js, whose `captureCanvas` is the one reader of it), composes,
 *    and holds the frame for exactly 1/fps of RECORDED time. MediaRecorder's clock runs in real time, so the
 *    recorder is PAUSED while the map draws and resumed only for the frame's own dwell — measured 2026-10-02 in
 *    Chromium: seven frames with 200–800 ms random waits between them came out at block timestamps 0, 250, 501,
 *    785, 1014, 1268, 1519 ms, i.e. the waits are not in the file. So a slow tile makes the export slower and never
 *    puts a blank or a half-drawn instant on film.
 *  ⚠ THE LAST INSTANT GETS ITS TIME ON SCREEN. A recording ends at its last frame's timestamp (same measurement:
 *    duration 1519 ms for 7 frames at 4 per second), so the final instant — usually the one the lapse was about —
 *    would show for no time at all in a looping player. One more encoded frame of the SAME picture is written after
 *    it (`encoded` = `frames` + 1, and the state says so); it adds no instant.
 *  ⚠ THE CREDIT IS BURNED IN AND IS NEVER CUT. A video leaves the page and its credit with it — the band names
 *    every source a drawn layer reads (the attribution each source declares) plus the base credit the page shows
 *    (#map-credit). It wraps onto as many lines as it needs; it shrinks to a floor and then grows taller, never
 *    shorter (CONSTITUTION.md: the source is named; the display is honest).
 *  ⚠ The comparison picture is the window (js/compare.js, read through its published controller) beside the main
 *    map — each with its own instant — and one band that credits both.
 *
 *  (map-postcard) …and THE MAP AS ONE PICTURE TO POST (`postcard`, the share panel's Image tab `createPostcardTab`): the
 *  same compositor with the link's title and note and the legends on the map read off the page (`rasterLegend`).
 *
 *  Loaded only when the reader opens the export row of the time-lapse (js/time-lapse.js `openRecorder`), the share
 *  panel's Image tab (js/map-ui.js `share`), or Atlas asks for a recording (js/atlas-cap-time.js) or a postcard
 *  (js/atlas-cap-panel.js, through the panel): nothing here is in the start-up bundle.
 * ==========================================================================*/
import { IntMapGeoEngine } from './geo-engine.js';
import { IntMapLang } from './lang-registry.js';
import { IntMapTime } from './chronos.js';
import { makeViewCapture } from './atlas-view-capture.js';
import { startLapse, stopLapse, lapseState } from './time-lapse.js';
import { iconNode } from './icons.js';   /* (map-postcard) the one icon set — js/icons.js */

/* The three frames offered: square, landscape, portrait. 1080 is the short edge all three share, so the overlay's
   sizes are written once against it (`u` below) and are the same physical size in each. */
export const SIZES = Object.freeze({
  square: Object.freeze({ w: 1080, h: 1080 }),
  landscape: Object.freeze({ w: 1920, h: 1080 }),
  portrait: Object.freeze({ w: 1080, h: 1920 }),
});
/** a size named any way a reader or Atlas might name it → a key of SIZES (square when it says nothing we know) */
export function sizeKey(v) {
  const s = String(v == null ? '' : v).trim().toLowerCase().replace(/\s+/g, '');
  if (SIZES[s]) return s;
  if (/^(16:9|1920x1080|wide|horizontal|landscape|横)/.test(s) || s === '横長') return 'landscape';
  if (/^(9:16|1080x1920|vertical|tall|story|stories|reel|reels|縦)/.test(s) || s === '縦長') return 'portrait';
  return 'square';
}

/* (map-postcard) THE POSTCARD'S THREE SHAPES — the frames a still picture is posted in, which are not the video's:
     card      1200 × 630  — the link-preview image size Facebook / Open Graph and X's large card specify (1.91:1)
     square    1080 × 1080 — Instagram's square post, and what most feeds show uncropped
     portrait  1080 × 1350 — Instagram's tallest feed post (4:5)
   They are the platforms' published sizes, not thresholds of ours; they expire when the platforms change them. */
export const POSTCARD_SIZES = Object.freeze({
  card: Object.freeze({ w: 1200, h: 630 }),
  square: Object.freeze({ w: 1080, h: 1080 }),
  portrait: Object.freeze({ w: 1080, h: 1350 }),
});
/** a postcard shape named any way a reader or Atlas might name it → a key of POSTCARD_SIZES (the link card when it says nothing we know) */
export function postcardSizeKey(v) {
  const s = String(v == null ? '' : v).trim().toLowerCase().replace(/\s+/g, '');
  if (POSTCARD_SIZES[s]) return s;
  if (/^(1:1|1080x1080|square|instagram|正方形|正方)/.test(s)) return 'square';
  if (/^(4:5|1080x1350|portrait|vertical|tall|縦)/.test(s)) return 'portrait';
  return 'card';
}

/* The containers, best first, and the codecs inside them. MP4 first because it is what the places a reader posts
   to accept (WebM is not taken everywhere); H.264 at level 4.0, the level a 1920×1080 frame needs (3.0 stops at
   720×576), High → Main → Constrained Baseline, then the bare container for a browser (Safari) that names none. */
const MIMES = Object.freeze([
  { ext: 'mp4', type: 'video/mp4;codecs=avc1.640028' },
  { ext: 'mp4', type: 'video/mp4;codecs=avc1.4D0028' },
  { ext: 'mp4', type: 'video/mp4;codecs=avc1.42E028' },
  { ext: 'mp4', type: 'video/mp4' },
  { ext: 'webm', type: 'video/webm;codecs=vp9' },
  { ext: 'webm', type: 'video/webm;codecs=vp8' },
  { ext: 'webm', type: 'video/webm' },
]);
/** pickMime(format?, isSupported) → {ext, type} | null — the first container the browser can record, of the
    format asked for ('mp4' | 'webm'), or of any when none is asked */
export function pickMime(format, isSupported) {
  const want = format === 'mp4' || format === 'webm' ? format : null;
  for (const m of MIMES) {
    if (want && m.ext !== want) continue;
    try { if (isSupported(m.type)) return { ext: m.ext, type: m.type }; } catch (_) { /* not this one */ }
  }
  return null;
}

/* ══ THE CREDIT ═══════════════════════════════════════════════════════════════════════════════════════════
   An attribution is written by its source as markup (`<a href>©&nbsp;OpenStreetMap</a>`); on a frame it is TEXT, painted
   with `fillText`, which never parses anything. So this is not a sanitiser and does not rewrite markup into safer markup:
   it READS the string once, left to right, the way js/geo-engine.js `_creditParts` reads a credit for the page — what is
   outside a tag is text (its entities decoded), a tag contributes nothing (`<br>` a space), and the body of a
   script/style element is dropped. What it returns only ever reaches a canvas and the export row's `textContent`. */
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', reg: '®', middot: '·', ndash: '–', mdash: '—' };
const SKIP = { script: 1, style: 1, template: 1, noscript: 1, textarea: 1, title: 1 };
function decode(t) {
  return t.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (m, k) => {
    if (k[0] === '#') { const n = k[1] === 'x' || k[1] === 'X' ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10); try { return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m; } catch (_) { return m; } }
    const v = ENT[k.toLowerCase()]; return v != null ? v : m;
  });
}
function plain(src) {
  const str = String(src == null ? '' : src);
  let out = '', i = 0, skip = '';
  while (i < str.length) {
    const lt = str.indexOf('<', i);
    const chunk = lt < 0 ? str.slice(i) : str.slice(i, lt);
    if (!skip) out += decode(chunk);
    if (lt < 0) break;
    if (!/[a-z\/!?]/i.test(str[lt + 1] || '')) { if (!skip) out += '<'; i = lt + 1; continue; }   /* «a < b» is text */
    let j = lt + 1, q = '';
    for (; j < str.length; j++) { const c = str[j]; if (q) { if (c === q) q = ''; } else if (c === '"' || c === "'") q = c; else if (c === '>') break; }
    if (j >= str.length) break;                                     /* an unterminated tag ends the text */
    const m = /^(\/?)([a-z][a-z0-9-]*)/i.exec(str.slice(lt + 1, j));
    i = j + 1;
    if (!m) continue;                                               /* comments, doctypes */
    const name = m[2].toLowerCase();
    if (m[1]) { if (skip === name) skip = ''; continue; }
    if (skip) continue;
    if (SKIP[name]) { skip = name; continue; }
    if (name === 'br') out += ' ';
  }
  return out.replace(/\s+/g, ' ').trim();
}
/**
 * drawnCredits(style, zoom, extra?) → string[] — the credit of what is DRAWN: the attribution of each source a layer
 * that is visible at this zoom reads (and the terrain's), plus `extra` (the page's own base credit), as text, with a
 * credit that another one already contains folded into it.
 * ⚠ It reads the renderer's serialised style (`scene.getStyle()`), which BOTH engines answer — the Cesium adapter has
 * no live layer order to walk — so the same rule holds on the globe as on the flat map. It is the rule js/geo-engine.js
 * applies to the credit it paints on a secondary view (`_drawnAttributions`): drawn = not `visibility:none` and inside
 * the layer's zoom range.
 */
export function drawnCredits(style, zoom, extra) {
  const list = [];
  const push = (a) => { const t = plain(a); if (t && !list.some((x) => x.toLowerCase() === t.toLowerCase())) list.push(t); };
  [].concat(extra == null ? [] : extra).forEach((x) => { if (typeof x === 'string') push(x); });
  const srcs = (style && style.sources) || {};
  const seen = new Set();
  /* a GeoJSON source whose collection is EMPTY at this instant draws nothing, whatever its layers say — a historical
     layer whose records do not reach the year is the common case; data held as a URL cannot be inspected and is credited */
  const empty = (s) => s.type === 'geojson' && s.data && typeof s.data === 'object' && Array.isArray(s.data.features) && s.data.features.length === 0;
  const add = (id) => { if (id == null || seen.has(id)) return; seen.add(id); const s = srcs[id]; if (s && typeof s.attribution === 'string' && !empty(s)) push(s.attribution); };
  const z = +zoom || 0;
  for (const L of (style && style.layers) || []) {
    if (!L || !L.source) continue;
    if (L.layout && L.layout.visibility === 'none') continue;
    if (L.minzoom != null && z < L.minzoom) continue;
    if (L.maxzoom != null && z >= L.maxzoom) continue;
    add(L.source);
  }
  if (style && style.terrain && style.terrain.source) add(style.terrain.source);
  const byLen = list.slice().sort((a, b) => a.length - b.length);
  const folded = byLen.filter((a, i) => !byLen.slice(i + 1).some((b) => b.includes(a)));
  return list.filter((a) => folded.includes(a));   /* the page's base credit first, then the sources in draw order */
}

/* ══ THE LAYOUT — pure, so tests/timelapse-video-export-checks.test.mjs measures it with a stand-in for text width ═══ */
const CREDIT_PX = 24, CREDIT_MIN_PX = 20, CREDIT_LINES = 4;
/** wrap `text` to lines no wider than `max` (by word; a word wider than a line is broken by character) */
function wrap(text, font, max, measure) {
  const words = String(text).split(' ').filter(Boolean), lines = [];
  let cur = '';
  const fits = (s) => measure(s, font) <= max;
  for (let w of words) {
    const next = cur ? cur + ' ' + w : w;
    if (fits(next)) { cur = next; continue; }
    if (cur) { lines.push(cur); cur = ''; }
    while (!fits(w)) {   /* a CJK credit has no spaces: break it where it has to be broken */
      let k = w.length - 1; while (k > 1 && !fits(w.slice(0, k))) k--;
      lines.push(w.slice(0, k)); w = w.slice(k);
    }
    cur = w;
  }
  if (cur) lines.push(cur);
  return lines;
}
/**
 * layoutFrame({ w, h, panes:[{label}], credits:[...], brand:{name, link}, family? }, measure) → where everything goes.
 * measure(text, font) → width in px. One pane fills the frame; two sit side by side (top and bottom in a portrait frame).
 * Each pane's instant is at its top-left; the band at the bottom carries the wordmark and link, then the credit.
 * (map-postcard) Optional, one pane only: `caption:{title, note}` turns the instant label into a card that also carries
 * the title and the note (`card`); `legends:[{w,h}]` (CSS px) places the legend pictures down the right edge
 * (`legends`, `legendsOmitted`, `legendScale` frame px per CSS px); `brand.full` is the share link, used when it fits.
 */
export function layoutFrame(o, measure) {
  const W = o.w, H = o.h, fam = o.family || 'sans-serif';
  const u = Math.min(W, H) / 1080, pad = Math.round(32 * u);
  const n = o.panes.length, tall = H > W;
  const rects = n === 2
    ? (tall ? [{ x: 0, y: 0, w: W, h: Math.round(H / 2) }, { x: 0, y: Math.round(H / 2), w: W, h: H - Math.round(H / 2) }]
      : [{ x: 0, y: 0, w: Math.round(W / 2), h: H }, { x: Math.round(W / 2), y: 0, w: W - Math.round(W / 2), h: H }])
    : [{ x: 0, y: 0, w: W, h: H }];
  /* the band: wordmark + link on one line, the credit under it */
  const maxW = W - 2 * pad;
  let cpx = Math.round(CREDIT_PX * u);
  const cfont = (px) => '500 ' + px + 'px ' + fam;
  const text = (o.credits || []).join(' · ');
  let lines = text ? wrap(text, cfont(cpx), maxW, measure) : [];
  while (lines.length > CREDIT_LINES && cpx > Math.round(CREDIT_MIN_PX * u)) { cpx--; lines = wrap(text, cfont(cpx), maxW, measure); }
  const clh = Math.round(cpx * 1.35);
  const bpx = Math.round(30 * u), lpx = Math.round(24 * u), bfont = '700 ' + bpx + 'px ' + fam, lfont = '500 ' + lpx + 'px ' + fam;
  const vpad = Math.round(20 * u), gap = Math.round(10 * u);
  const blh = Math.round(bpx * 1.25);
  const bandH = vpad + blh + (lines.length ? gap + lines.length * clh : 0) + vpad;
  const band = { x: 0, y: H - bandH, w: W, h: bandH };
  const nameW = measure(o.brand.name, bfont);
  /* (map-postcard) the link beside the wordmark: the share link ITSELF (scheme dropped) when the whole of it fits on the
     line, otherwise the site's address. Never a cut link — a link with its end cut off opens a different map. */
  const linkX = pad + nameW + Math.round(16 * u), linkRoom = W - pad - linkX;
  const full = o.brand.full ? String(o.brand.full).replace(/^https?:\/\//, '') : '';
  const linkText = full && measure(full, lfont) <= linkRoom ? full : o.brand.link;
  const brand = { name: { text: o.brand.name, font: bfont, x: pad, y: band.y + vpad, w: nameW, h: bpx },
    link: { text: linkText, font: lfont, x: linkX, y: band.y + vpad + Math.round((bpx - lpx) * 0.7), w: measure(linkText, lfont), h: lpx, full: linkText === full && !!full } };
  const credit = { font: cfont(cpx), px: cpx, lines: lines.map((t, i) => ({ text: t, x: pad, y: band.y + vpad + blh + gap + i * clh, w: measure(t, cfont(cpx)), h: cpx })) };
  /* each pane's instant, as large as fits its pane */
  const panes = rects.map((r, i) => {
    const t = String((o.panes[i] && o.panes[i].label) || '');
    let px = Math.round((n === 2 ? 64 : 88) * u);
    const font = (p) => '700 ' + p + 'px ' + fam;
    const room = r.w - 2 * pad - Math.round(56 * u);
    while (px > Math.round(28 * u) && measure(t, font(px)) > room) px--;
    const tw = measure(t, font(px)), bx = Math.round(28 * u), by = Math.round(16 * u);
    return { rect: r, label: { text: t, font: font(px), px, x: r.x + pad + bx, y: r.y + pad + by, w: tw, h: px,
      box: { x: r.x + pad, y: r.y + pad, w: tw + 2 * bx, h: Math.round(px * 1.12) + 2 * by, r: Math.round(22 * u) } } };
  });
  /* (map-postcard) the legends and the caption — a single pane only (the postcard is the main map) */
  const legends = n === 1 ? layoutLegends(o.legends || [], { W, top: pad, bottom: band.y - pad, right: W - pad, u }) : { boxes: [], omitted: (o.legends || []).length, k: 0 };
  let card = null;
  const cap = o.caption || {};
  if (n === 1 && (cap.title || cap.note)) {
    const colX = legends.boxes.length ? Math.min.apply(null, legends.boxes.map((b) => b.x)) : W - pad;
    card = layoutCard({ instant: panes[0].label.text, title: cap.title || '', note: cap.note || '', x: pad, y: pad,
      maxW: Math.min(colX - 2 * pad + (legends.boxes.length ? 0 : pad), Math.round(W * 0.72)), maxH: band.y - 2 * pad, u, fam }, measure);
    panes[0].label = Object.assign({}, panes[0].label, { text: '' });   /* the instant is the card's first line now */
  }
  return { w: W, h: H, u, pad, panes, band, brand, credit, divider: n === 2 ? Math.max(2, Math.round(4 * u)) : 0, tall,
    legends: legends.boxes, legendsOmitted: legends.omitted, legendScale: legends.k, card };
}

/* ══ (map-postcard) THE LEGEND COLUMN AND THE CAPTION CARD — pure, like the rest of the layout ═══════════════════════
   The legends are pictures of the cards the reader sees (`rasterLegend` below), placed down the right edge of the map
   at one scale: as large as 1.5 frame pixels per CSS pixel (at the 1080 short edge — the size the card is read at on a
   phone, ESTIMATE), smaller when the column would be wider than 36 % of the frame or taller than the room above the
   band, and never below 0.9 — at which a 9.5 px legend label is still ~9 px in the frame. ⚠ A LEGEND THAT DOES NOT FIT
   AT THAT FLOOR IS LEFT OUT AND COUNTED (`omitted`), never shrunk into an unreadable stamp; the panel says how many.
   (The first one is always kept, scaled to the room, so a map with one tall legend still carries it.) */
export function layoutLegends(sizes, room) {
  const u = room.u, gap = Math.round(12 * u);
  const list = (sizes || []).filter((s) => s && s.w > 0 && s.h > 0);
  if (!list.length) return { boxes: [], omitted: 0, k: 0 };
  const availH = Math.max(0, room.bottom - room.top), colMax = Math.round(room.W * 0.36);
  const kMax = 1.5 * u, kMin = 0.9 * u;
  const widest = Math.max.apply(null, list.map((s) => s.w));
  const sumH = (arr) => arr.reduce((a, s) => a + s.h, 0);
  let take = list.length, k = Math.min(kMax, colMax / widest, (availH - gap * (take - 1)) / sumH(list));
  while (k < kMin && take > 1) { take--; const sub = list.slice(0, take); k = Math.min(kMax, colMax / Math.max.apply(null, sub.map((s) => s.w)), (availH - gap * (take - 1)) / sumH(sub)); }
  if (k <= 0) return { boxes: [], omitted: list.length, k: 0 };
  const boxes = []; let y = room.top;
  for (let i = 0; i < take; i++) {
    const w = Math.round(list[i].w * k), h = Math.round(list[i].h * k);
    boxes.push({ i, x: room.right - w, y, w, h }); y += h + gap;
  }
  return { boxes, omitted: list.length - take, k };
}
/** cut a line that is too wide to `max` and end it with an ellipsis (only the LAST line of a clamped block) */
function ellipsize(text, font, max, measure) {
  if (measure(text, font) <= max) return text;
  const a = Array.from(text); let k = a.length;
  while (k > 1 && measure(a.slice(0, k).join('').trimEnd() + '…', font) > max) k--;
  return a.slice(0, k).join('').trimEnd() + '…';
}
/** wrap to at most `maxLines` at the largest size between `big` and `small` that fits; the last line is ellipsized only
    when even the smallest size needs more lines (the whole text is always in the link the picture carries) */
function fitBlock(text, weight, big, small, maxLines, maxW, fam, measure) {
  if (!text) return { lines: [], font: '', px: 0 };
  let px = big, font = weight + ' ' + px + 'px ' + fam, lines = wrap(text, font, maxW, measure);
  while (lines.length > maxLines && px > small) { px--; font = weight + ' ' + px + 'px ' + fam; lines = wrap(text, font, maxW, measure); }
  if (lines.length > maxLines) { lines = lines.slice(0, maxLines); lines[maxLines - 1] = ellipsize(lines[maxLines - 1] + ' ' + '…', font, maxW, measure); }
  return { lines, font, px };
}
/**
 * layoutCard({ instant, title, note, x, y, maxW, maxH, u, fam }, measure) → the caption card at the map's top-left: the
 * instant the map shows (small), the title (large, ≤ 3 lines) and the note (≤ 4 lines), each as large as fits.
 */
export function layoutCard(c, measure) {
  const u = c.u, bx = Math.round(28 * u), by = Math.round(20 * u), gap = Math.round(8 * u);
  const inner = Math.max(40, c.maxW - 2 * bx);
  const ins = fitBlock(String(c.instant || ''), '600', Math.round(30 * u), Math.round(22 * u), 1, inner, c.fam, measure);
  const ttl = fitBlock(String(c.title || ''), '700', Math.round(56 * u), Math.round(34 * u), 3, inner, c.fam, measure);
  const nte = fitBlock(String(c.note || ''), '500', Math.round(30 * u), Math.round(22 * u), 4, inner, c.fam, measure);
  const lines = []; let y = c.y + by, widest = 0;
  const put = (blk, kind, lh) => {
    if (!blk.lines.length) return;
    if (lines.length) y += gap;
    blk.lines.forEach((t) => { const w = measure(t, blk.font); widest = Math.max(widest, w);
      lines.push({ kind, text: t, font: blk.font, x: c.x + bx, y, w, h: blk.px }); y += Math.round(blk.px * lh); });
  };
  put(ins, 'instant', 1.3); put(ttl, 'title', 1.16); put(nte, 'note', 1.36);
  const h = Math.min(c.maxH, y - c.y + by);
  return { box: { x: c.x, y: c.y, w: Math.round(widest + 2 * bx), h, r: Math.round(22 * u) }, lines };
}

/* ══ PAINTING ═════════════════════════════════════════════════════════════════════════════════════════════ */
const W_ = () => /** @type {any} */ (window);
function fontFamily() { try { const f = getComputedStyle(document.body).fontFamily; if (f) return f; } catch (_) { /* below */ } return 'sans-serif'; }
function measurer(ctx) { return (s, font) => { ctx.font = font; return ctx.measureText(String(s)).width; }; }
function box(ctx, b) {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(b.x, b.y, b.w, b.h, b.r || 0); else ctx.rect(b.x, b.y, b.w, b.h);
  ctx.fill();
}
/* the source picture scaled to COVER the pane, centred — the pane is filled, and what falls outside is what the
   frame's proportions leave out (the preview shows exactly this crop before anything is recorded) */
function cover(ctx, img, r) {
  if (!img || !img.width || !img.height) { ctx.fillStyle = '#0b0d12'; ctx.fillRect(r.x, r.y, r.w, r.h); return; }
  const s = Math.max(r.w / img.width, r.h / img.height), sw = r.w / s, sh = r.h / s;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, r.x, r.y, r.w, r.h);
}
/** paint one frame into `ctx` (a canvas of o.w × o.h): images[i] fills pane i, legendImages[i] (map-postcard) the i-th
    legend box. Returns the layout used. */
function paint(ctx, o, images, legendImages) {
  const L = layoutFrame(Object.assign({ family: fontFamily() }, o), measurer(ctx));
  ctx.save();
  ctx.fillStyle = '#0b0d12'; ctx.fillRect(0, 0, L.w, L.h);
  L.panes.forEach((p, i) => cover(ctx, images[i], p.rect));
  if (L.divider) {
    ctx.fillStyle = '#ffffff';
    const r = L.panes[1].rect;
    if (L.tall) ctx.fillRect(0, r.y - L.divider / 2, L.w, L.divider); else ctx.fillRect(r.x - L.divider / 2, 0, L.divider, L.h);
  }
  ctx.textBaseline = 'top';
  L.panes.forEach((p) => {
    if (!p.label.text) return;
    ctx.fillStyle = 'rgba(0,0,0,0.58)'; box(ctx, p.label.box);
    ctx.fillStyle = '#ffffff'; ctx.font = p.label.font; ctx.fillText(p.label.text, p.label.x, p.label.y);
  });
  /* (map-postcard) the legends, as the reader sees them, and the caption card */
  (L.legends || []).forEach((b) => { const im = legendImages && legendImages[b.i]; if (im && im.width && im.height) ctx.drawImage(im, b.x, b.y, b.w, b.h); });
  if (L.card) {
    ctx.fillStyle = 'rgba(0,0,0,0.62)'; box(ctx, L.card.box);
    ctx.save(); ctx.beginPath(); ctx.rect(L.card.box.x, L.card.box.y, L.card.box.w, L.card.box.h); ctx.clip();
    L.card.lines.forEach((l) => { ctx.fillStyle = l.kind === 'title' ? '#ffffff' : 'rgba(255,255,255,0.86)'; ctx.font = l.font; ctx.fillText(l.text, l.x, l.y); });
    ctx.restore();
  }
  ctx.fillStyle = 'rgba(10,12,16,0.82)'; ctx.fillRect(L.band.x, L.band.y, L.band.w, L.band.h);
  ctx.fillStyle = '#ffffff'; ctx.font = L.brand.name.font; ctx.fillText(L.brand.name.text, L.brand.name.x, L.brand.name.y);
  ctx.fillStyle = 'rgba(255,255,255,0.82)'; ctx.font = L.brand.link.font; ctx.fillText(L.brand.link.text, L.brand.link.x, L.brand.link.y);
  ctx.fillStyle = 'rgba(255,255,255,0.94)'; ctx.font = L.credit.font;
  L.credit.lines.forEach((l) => ctx.fillText(l.text, l.x, l.y));
  ctx.restore();
  return L;
}

/* the wordmark and the link: the app's own name (the title the installed app carries) and the site's address */
function brand() {
  let name = '';
  try { const m = document.querySelector('meta[name="apple-mobile-web-app-title"]'); name = (m && m.getAttribute('content')) || ''; } catch (_) { /* below */ }
  if (!name) name = String(document.title || '').split(/\s+[—–-]\s+/)[0];
  /* the address the build writes into the page's social card — scripts/site-url.mjs fills og:url from
     supabase/functions/_shared/site-origin.js, the one place it is written (importing that file from js/ would put a
     path outside js/ into the type-checked graph). A page that was not built carries the token instead, and then the
     address it is being read at is the honest answer. */
  let url = '';
  try { const og = document.querySelector('meta[property="og:url"]'); url = (og && og.getAttribute('content')) || ''; } catch (_) { url = ''; }
  if (!/^https?:\/\//.test(url)) url = location.origin + location.pathname.replace(/[^/]*$/, '');
  return { name, link: url.replace(/^https?:\/\//, '').replace(/\/$/, '') };
}

/* ══ READING THE MAPS ═════════════════════════════════════════════════════════════════════════════════════ */
let CAP = null;
const capturer = () => CAP || (CAP = makeViewCapture({ GE: () => IntMapGeoEngine }));
const frame = () => new Promise((r) => { try { requestAnimationFrame(() => r(true)); } catch (_) { setTimeout(() => r(true), 16); } });
const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
/** the main map's frame, read inside a render tick. `live:false` = the tick never came (a hidden tab) and the
    canvas holds nothing — that is «not observed», and it is never put on film */
async function grabMain() {
  try { return await capturer().captureCanvas({ GE: () => IntMapGeoEngine, include: 'map' }); } catch (_) { return { canvas: null, live: false }; }
}
/* the page's base credit and the credit of every drawn source of the main map */
function mainCredits() {
  const extra = [];
  try { const el = document.getElementById('map-credit'); const t = el && el.textContent && el.textContent.trim(); if (t) extra.push(t); } catch (_) { /* no credit bar */ }
  let style = null, z = 0;
  try { style = IntMapGeoEngine.scene.getStyle(); z = IntMapGeoEngine.camera.getZoom(); } catch (_) { style = null; }
  return drawnCredits(style, z, extra);
}
/* the comparison window — its published controller (js/compare.js `api`): reading it does not import js/compare.js
   into this lazy chunk, for the reason js/atlas-cap-time.js gives (a lazy chunk importing it split shared modules out
   of the boot chunk). Its view is a scoped engine with the same `render` face as the main one. */
const compareApi = () => { try { return W_().IntMapCompare || null; } catch (_) { return null; } };
function grabView(view) {
  return new Promise((res) => {
    const grab = (live) => {
      try {
        const c = view.render.canvas(); const g = document.createElement('canvas'); g.width = c.width; g.height = c.height;
        g.getContext('2d').drawImage(c, 0, 0); res({ canvas: g, live: !!live });
      } catch (_) { res({ canvas: null, live: false }); }
    };
    try { view.render.onNextFrame(1200, grab); } catch (_) { grab(false); }
  });
}
/** a label for the instant on the main clock, in the reader's language: the year alone for a lapse in years */
function instantLabel(unit, lang) {
  const H = W_().IntMapHistScale, tag = IntMapLang.locale(lang);
  const d = IntMapTime.isLive() ? new Date() : IntMapTime.when();
  const y = d.getUTCFullYear(), mo = d.getUTCMonth() + 1, day = d.getUTCDate();
  try {
    /* (map-postcard) 'auto' — the picture's instant at the precision the clock was SET to: a year set as a year is the
       clock's mid-June noon (js/chronos.js setYear — the reading js/compare.js `clockLabel` makes of the same instant),
       and is labelled as the year; anything else as its day. A live map is labelled with today's date, not «now»: a
       picture is read long after it was made. */
    if (unit === 'auto') { let byYear = false; try { byYear = !IntMapTime.isLive() && H.utcAt(y, 5, 15, 12, 0, 0).getTime() === d.getTime(); } catch (_) { byYear = false; }
      unit = byYear ? 'year' : 'day'; }
    if (unit === 'year') return H.yearText(y, tag, lang === 'jp' ? '年' : undefined);
    const ds = H.dateText(y, mo, day, tag);
    if (unit === 'day') return ds;
    return ds + ' ' + String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0') + ' UTC';
  } catch (_) { return IntMapTime.iso(); }
}

/* ══ THE RECORDER — one at a time ══════════════════════════════════════════════════════════════════════ */
const rs = {
  /** @type {'idle'|'recording'|'finishing'|'done'|'cancelled'|'failed'} */ phase: 'idle',
  /** @type {'video'|'image'|null} */ kind: null, size: 'square', w: 0, h: 0, ext: '', mime: '',
  frames: 0, encoded: 0, /** @type {number|null} */ total: null, /** @type {string|null} */ at: null, fps: 1,
  /** @type {string|null} */ reason: null, /** @type {string|null} */ error: null,
  bytes: 0, /** @type {string[]} */ credits: [], /** @type {string[]} */ instants: [],
  /** @type {string|null} */ url: null, /** @type {string|null} */ name: null,
  /** where the last frame's credit band and its lines are, in frame pixels — what a check of the decoded file looks at
      @type {{y:number,h:number,lines:{x:number,y:number,w:number,h:number}[]}|null} */ band: null,
};
/** @type {Blob|null} */ let blob = null;
let lang = 'en';
/** @type {Set<(s:any)=>void>} */ const subs = new Set();
/** what the recorder is doing — the panel, Atlas and the specs read this */
export function recorderState() { const s = Object.assign({}, rs); s.credits = rs.credits.slice(); s.instants = rs.instants.slice(); s.band = rs.band ? JSON.parse(JSON.stringify(rs.band)) : null; return s; }
const emit = () => { const s = recorderState(); subs.forEach((f) => { try { f(s); } catch (_) { /* a reader */ } }); };
function reset(kind) {
  if (rs.url) { try { URL.revokeObjectURL(rs.url); } catch (_) { /* gone */ } }
  blob = null;
  Object.assign(rs, { phase: 'idle', kind, frames: 0, encoded: 0, total: null, at: null, reason: null, error: null, bytes: 0, credits: [], instants: [], url: null, name: null, band: null });
}
const busy = () => rs.phase === 'recording' || rs.phase === 'finishing';
const slug = (s) => String(s || '').replace(/[^0-9A-Za-z-]+/g, '').slice(0, 24) || 'now';
function noteBand(L) { rs.band = { y: L.band.y, h: L.band.h, lines: L.credit.lines.map((l) => ({ x: l.x, y: l.y, w: Math.round(l.w), h: l.h })) }; }
function addCredits(list) { list.forEach((c) => { if (!rs.credits.includes(c)) rs.credits.push(c); }); }

/**
 * recordLapse({ from, to?, unit?, step?, fps?, size?, format? }) → recorderState() (with `error` when it could not start)
 * Plays the time-lapse (js/time-lapse.js `startLapse`) with this recorder as its frame sink and writes each drawn
 * frame to the video. The panel offers Save when it ends; a stop before the end discards the recording.
 */
export function recordLapse(o) {
  o = o || {};
  if (busy()) return Object.assign(recorderState(), { error: 'busy' });
  const MR = W_().MediaRecorder;
  const mime = MR && typeof MR.isTypeSupported === 'function' ? pickMime(o.format, (t) => MR.isTypeSupported(t)) : null;
  reset('video');
  const key = sizeKey(o.size), S = SIZES[key];
  Object.assign(rs, { size: key, w: S.w, h: S.h });
  const out = mime ? document.createElement('canvas') : null;
  if (out) { out.width = S.w; out.height = S.h; }
  if (!mime || !out || typeof out.captureStream !== 'function') { rs.phase = 'failed'; rs.error = 'unsupported'; emit(); return Object.assign(recorderState(), { error: 'unsupported' }); }
  Object.assign(rs, { ext: mime.ext, mime: mime.type });
  const ctx = /** @type {CanvasRenderingContext2D} */ (out.getContext('2d'));
  const stream = out.captureStream(0), track = /** @type {any} */ (stream.getVideoTracks()[0]);
  /* bits per second from the frame's area — at ≤ 4 frames a second that is ~0.3–1.3 MB a frame at 1080p, which keeps
     a coastline and a 24-px credit sharp */
  const rec = new MR(stream, { mimeType: mime.type, videoBitsPerSecond: Math.round(S.w * S.h * 2.5) });
  /** @type {Blob[]} */ const chunks = [];
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  let started = false, failed = false;
  rec.onerror = () => { failed = true; };
  const dwell = () => 1000 / (rs.fps || 1);
  /* one encoded frame of what is on `out` now, held for 1/fps of recorded time.
     ⚠ HOW MANY FRAMES A CALL MAKES DEPENDS ON HOW IT ASKS — measured 2026-10-02 in Chromium (4 instants + the hold,
     MP4 and WebM, with and without a busy main thread):
       · a canvas track takes its frame at the PAINT that follows `requestFrame`: a request on a canvas nobody painted
         since yields nothing (instants painted 300 ms before their request → 1 decoded frame of 4);
       · `start()` takes the canvas's current picture by itself when the canvas has been painted — `start()` plus a
         request made 6 frames of 5, and so did waiting for the 'start' event and then requesting;
       · `resume()` takes nothing by itself.
     So the FIRST frame is the picture `start()` takes (the caller paints it in the same task), and every later one is
     `resume()`, the picture drawn back onto itself (same pixels, a fresh paint) and a request, in one task: 5 of 5 in all
     eight runs. The first frame plays a little longer than 1/fps — the recorder's own start-up (0.28–0.62 s instead of
     0.25 s in those runs); the frames after it are within a few hundredths of 1/fps on an idle machine. */
  const put = async () => {
    if (!started) { started = true; rec.start(); }
    else { rec.resume(); ctx.drawImage(out, 0, 0); track.requestFrame(); }
    rs.encoded++;
    await sleep(dwell());
    rec.pause();
  };
  const sink = {
    async frame(/** @type {any} */ s) {
      if (failed) return false;
      /* the renderer is read inside a tick; a frame with no tick (hidden tab) is waited for, never filmed black */
      let g = await grabMain();
      while (!g.live && lapseState().playing) { await frame(); g = await grabMain(); }
      if (!g.live || !g.canvas) return lapseState().playing ? false : true;
      const credits = mainCredits(); addCredits(credits);
      const label = instantLabel(s.unit, lang);
      noteBand(paint(ctx, { w: S.w, h: S.h, panes: [{ label }], credits, brand: brand() }, [g.canvas]));
      await put();
      rs.frames++; rs.at = s.at; rs.instants.push(label); emit();
      return !failed;
    },
    end(/** @type {string} */ reason) { finish(reason); },
  };
  async function finish(reason) {
    rs.reason = reason;
    if (reason !== 'end' || !started || rs.frames === 0) {
      try { if (started) rec.stop(); } catch (_) { /* never started */ }
      try { track.stop(); } catch (_) { /* gone */ }
      rs.phase = reason === 'record-failed' ? 'failed' : 'cancelled'; if (reason === 'record-failed') rs.error = 'encoder';
      emit(); return;
    }
    rs.phase = 'finishing'; emit();
    /* the hold: the last instant's own time on screen (see the header). `put` paints the picture afresh, which is what
       makes a request on an unchanged picture a frame — measured, without it the hold was missing (4 decoded for 5). */
    await put();
    const stopped = new Promise((r) => { rec.onstop = r; });
    rec.stop(); await stopped;
    try { track.stop(); } catch (_) { /* gone */ }
    blob = new Blob(chunks, { type: mime.ext === 'mp4' ? 'video/mp4' : 'video/webm' });
    rs.bytes = blob.size;
    rs.url = URL.createObjectURL(blob);
    rs.name = 'intmap-timelapse-' + slug(rs.instants[0]) + '-' + slug(rs.instants[rs.instants.length - 1]) + '-' + S.w + 'x' + S.h + '.' + mime.ext;
    rs.phase = failed || !blob.size ? 'failed' : 'done'; if (rs.phase === 'failed') rs.error = 'encoder';
    emit();
  }
  const fps = o.fps != null && isFinite(+o.fps) && +o.fps > 0 ? +o.fps : lapseState().fps;
  rs.fps = fps;
  if (lapseState().playing) stopLapse('stopped');
  const s = startLapse({ from: o.from, to: o.to, unit: o.unit, step: o.step, fps, sink });
  if (s.error) { try { track.stop(); } catch (_) { /* gone */ } rs.phase = 'failed'; rs.error = s.error; emit(); return Object.assign(recorderState(), { error: s.error }); }
  rs.fps = s.fps; rs.total = s.total; rs.phase = 'recording';
  emit();
  return recorderState();
}
/* stop the recording; nothing is kept (the lapse's stop ends the sink — js/time-lapse.js) */
function cancelRecording() { if (rs.phase === 'recording' && lapseState().playing) stopLapse('stopped'); return recorderState(); }

/**
 * compareImage({ size? }) → Promise<recorderState()> — the comparison window beside the main map, each with its own
 * instant, as one PNG of the chosen size. `error:'no-compare'` when the window is not open.
 */
export async function compareImage(o) {
  o = o || {};
  if (busy()) return Object.assign(recorderState(), { error: 'busy' });
  const C = compareApi();
  const st = C && typeof C.timeState === 'function' ? C.timeState() : null;
  const view = C && typeof C._map === 'function' ? C._map() : null;
  if (!st || !st.open || !view) return Object.assign(recorderState(), { error: 'no-compare' });
  reset('image');
  const key = sizeKey(o.size), S = SIZES[key];
  Object.assign(rs, { size: key, w: S.w, h: S.h, ext: 'png', mime: 'image/png', phase: 'finishing' });
  emit();
  const [a, b] = await Promise.all([grabView(view), grabMain()]);
  if (!a.live || !b.live) { rs.phase = 'failed'; rs.error = 'not-drawn'; emit(); return Object.assign(recorderState(), { error: 'not-drawn' }); }
  /* the window's credit is the one its view paints (js/geo-engine.js, the drawn sources of that view) */
  let wc = [];
  try { const el = document.querySelector('#compare-map .map-credit-view'); const t = el && el.textContent && el.textContent.trim(); if (t) wc = [t]; } catch (_) { wc = []; }
  if (!wc.length) { try { wc = drawnCredits(view.scene.getStyle(), view.camera.getZoom(), []); } catch (_) { wc = []; } }
  const credits = drawnCredits(null, 0, wc.concat(mainCredits()));
  const out = document.createElement('canvas'); out.width = S.w; out.height = S.h;
  noteBand(paint(/** @type {CanvasRenderingContext2D} */ (out.getContext('2d')), { w: S.w, h: S.h, panes: [{ label: st.label }, { label: st.main.label }], credits, brand: brand() }, [a.canvas, b.canvas]));
  addCredits(credits);
  rs.instants = [st.label, st.main.label];
  blob = await new Promise((r) => out.toBlob(r, 'image/png'));
  if (!blob) { rs.phase = 'failed'; rs.error = 'encoder'; emit(); return Object.assign(recorderState(), { error: 'encoder' }); }
  rs.bytes = blob.size; rs.frames = 1; rs.encoded = 1;
  rs.url = URL.createObjectURL(blob);
  rs.name = 'intmap-compare-' + slug(st.iso || st.label) + '-' + slug(st.main.iso || st.main.label) + '-' + S.w + 'x' + S.h + '.png';
  rs.phase = 'done'; emit();
  return recorderState();
}

/* ══ (map-postcard) THE LEGENDS AS PICTURES ════════════════════════════════════════════════════════════════
   A legend is a DOM card (js/data-layers.js builds ~30 kinds: gradient bars, swatch grids, scales, notes), and a
   picture that leaves the page must carry it — a coloured map without its key says nothing. Rather than a second
   description of each kind (which the next legend would not be in), the card is READ AS THE PAGE LAID IT OUT: every
   box's background colour, gradient and borders, every run of text where the browser put it, every image it may
   draw — at its own place, clipped the way the page clips it. The reader's HANDLES on the card are left out: a field or
   a slider, a grip (what the page gives a grab / move / resize cursor), and a button that says nothing but a glyph (×,
   –, play). ⚠ A BUTTON IS NOT A HANDLE BY BEING A BUTTON: the Köppen card's rows are role="button" (click one to
   highlight that climate) and they ARE the key — measured, leaving every button out drew the card with its title and
   period and none of its thirty classes. So a button that carries words or a swatch is drawn. A <select> is drawn as
   the choice it shows.
   The population is the one the embed keeps (js/embed-mode.js EMBED_CSS): `.data-legend` / `.koppen-legend`, the
   classes js/data-layers.js discoverLegends() treats as «a legend». */
const LEGEND_SEL = '.data-legend, .koppen-legend';
const FIELD_SEL = 'input, textarea, [role="slider"]';
const BUTTON_SEL = 'button, [role="button"], [role="switch"], [role="checkbox"]';
/** is this element one of the reader's handles on the card (see above) — `cs` is its computed style */
function isHandle(e, cs) {
  if (e.matches(FIELD_SEL)) return true;
  /* anything that says something is drawn — a card's title is often its drag grip too (measured: the Köppen header) */
  if (/[\p{L}\p{N}]/u.test(e.textContent || '')) return false;
  if (/^(grab|grabbing|move|[nsew]{1,2}-resize|col-resize|row-resize)$/.test(cs.cursor)) return true;
  if (!e.matches(BUTTON_SEL)) return false;
  /* a swatch inside it (a box with a fill) is a key, not a glyph */
  return !Array.from(e.querySelectorAll('*')).some((d) => { try { const c = getComputedStyle(d); return alphaOf(c.backgroundColor) > 0 || /gradient/.test(c.backgroundImage); } catch (_) { return false; } });
}
/** the legends on the map now, in the order the page stacks them — a legend whose layer is off has no box
    (display:none). ⚠ On a phone the closed legend tray hides the cards with `visibility` and still lays them out
    (css/intmap.css, the legend tray): they are on the map, the tray only folds them away, so they are taken. */
export function shownLegends() {
  /** @type {HTMLElement[]} */ const out = [];
  try {
    document.querySelectorAll(LEGEND_SEL).forEach((el) => {
      const e = /** @type {HTMLElement} */ (el);
      if (out.some((o) => o.contains(e))) return;
      const cs = getComputedStyle(e); if (cs.display === 'none') return;
      const r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return;
      out.push(e);
    });
  } catch (_) { /* no document */ }
  return out.sort((a, b) => { const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect(); return (ra.left - rb.left) || (ra.top - rb.top); });
}
/** split a CSS value on the commas that are not inside parentheses */
function splitTop(s) { const out = []; let d = 0, cur = ''; for (const c of String(s)) { if (c === '(') d++; else if (c === ')') d--; if (c === ',' && d === 0) { out.push(cur.trim()); cur = ''; } else cur += c; } if (cur.trim()) out.push(cur.trim()); return out; }
/**
 * parseGradient(css) → { angle (deg, CSS: 0 = to top, 90 = to right), stops:[{color, at|null}] } | null — the first
 * `linear-gradient(…)` of a computed background-image. Pure; a `repeating-` or a radial gradient is null.
 */
export function parseGradient(css) {
  const s = String(css || ''); const i = s.indexOf('linear-gradient(');
  if (i < 0 || (i > 0 && /repeating-$/.test(s.slice(0, i)))) return null;
  let d = 0, j = i + 'linear-gradient('.length, start = j;
  for (; j < s.length; j++) { const c = s[j]; if (c === '(') d++; else if (c === ')') { if (d === 0) break; d--; } }
  const parts = splitTop(s.slice(start, j)); if (!parts.length) return null;
  let angle = 180;
  const SIDES = { top: 0, right: 90, bottom: 180, left: 270 };
  const first = parts[0].toLowerCase();
  const deg = /^(-?[\d.]+)(deg|turn|rad|grad)$/.exec(first);
  if (deg) { const n = +deg[1]; angle = deg[2] === 'deg' ? n : deg[2] === 'turn' ? n * 360 : deg[2] === 'rad' ? n * 180 / Math.PI : n * 0.9; parts.shift(); }
  else if (/^to\s/.test(first)) {
    const w = first.slice(3).trim().split(/\s+/);
    if (w.length === 1 && w[0] in SIDES) angle = SIDES[w[0]];
    else if (w.length === 2) { const v = w.includes('top') ? 0 : 180, h = w.includes('right') ? 90 : 270; angle = v === 0 ? (h === 90 ? 45 : 315) : (h === 90 ? 135 : 225); }
    parts.shift();
  }
  const stops = [];
  for (const p of parts) {
    /* a colour, then up to two positions; a bare position is a colour hint (interpolation midpoint), dropped */
    const m = /^(.*?\))\s*(.*)$/.exec(p) || /^(\S+)\s*(.*)$/.exec(p); if (!m) continue;
    const pos = m[2].trim().split(/\s+/).filter(Boolean);
    if (!/^(#|rgb|hsl|hwb|lab|lch|oklab|oklch|color|[a-z]+$)/i.test(m[1])) continue;
    const pct = (v) => (/%$/.test(v) ? +v.slice(0, -1) / 100 : null);
    if (!pos.length) stops.push({ color: m[1], at: null });
    else pos.slice(0, 2).forEach((v) => stops.push({ color: m[1], at: pct(v) }));
  }
  if (stops.length < 2) return null;
  /* positions left out are spread evenly between their neighbours, as CSS does */
  if (stops[0].at == null) stops[0].at = 0;
  if (stops[stops.length - 1].at == null) stops[stops.length - 1].at = 1;
  for (let a = 0; a < stops.length; a++) {
    if (stops[a].at != null) continue;
    let b = a; while (stops[b].at == null) b++;
    const from = stops[a - 1].at, to = stops[b].at;
    for (let k = a; k < b; k++) stops[k].at = from + (to - from) * (k - a + 1) / (b - a + 1);
    a = b;
  }
  for (let a = 1; a < stops.length; a++) if (stops[a].at < stops[a - 1].at) stops[a].at = stops[a - 1].at;
  return { angle, stops };
}
/** the CSS gradient line of a w × h box at `angle` → the canvas gradient's two ends (CSS Images 3 §3.1) */
function gradientLine(angle, x, y, w, h) {
  const r = (angle - 90) * Math.PI / 180, dx = Math.cos(r), dy = Math.sin(r);
  const len = Math.abs(w * Math.sin(angle * Math.PI / 180)) + Math.abs(h * Math.cos(angle * Math.PI / 180));
  const cx = x + w / 2, cy = y + h / 2;
  return [cx - dx * len / 2, cy - dy * len / 2, cx + dx * len / 2, cy + dy * len / 2];
}
const alphaOf = (c) => { const m = /rgba?\(([^)]+)\)/.exec(String(c)); if (!m) return String(c) === 'transparent' ? 0 : 1; const p = m[1].split(/[\s,\/]+/).filter(Boolean); return p.length > 3 ? (/%$/.test(p[3]) ? +p[3].slice(0, -1) / 100 : +p[3]) : 1; };
/** a translucent card background made nearly opaque: on the page it is frosted glass over the map, which a flat picture
    cannot be, so the colour the glass tints with is kept and the map under it is not let through */
const solidish = (c) => { const m = /rgba?\(([^)]+)\)/.exec(String(c)); if (!m) return c; const p = m[1].split(/[\s,\/]+/).filter(Boolean);
  return alphaOf(c) >= 0.92 ? c : 'rgba(' + p[0] + ',' + p[1] + ',' + p[2] + ',0.94)'; };
const px = (v) => parseFloat(v) || 0;
/** an <img> / <canvas> the picture may take without being tainted (a tainted canvas cannot be saved at all) */
function drawable(el) {
  try {
    if (el.tagName === 'CANVAS') { const c = /** @type {HTMLCanvasElement} */ (el); const g = c.getContext('2d'); if (!g) return false; g.getImageData(0, 0, 1, 1); return true; }
    if (el.tagName === 'IMG') { const im = /** @type {HTMLImageElement} */ (el); if (!im.complete || !im.naturalWidth) return false;
      const u = new URL(im.currentSrc || im.src, location.href);
      return u.origin === location.origin || u.protocol === 'data:' || u.protocol === 'blob:' || im.crossOrigin != null; }
  } catch (_) { return false; }
  return false;
}
/** an inline <svg> as an image, its `currentColor` resolved to the colour the page gives it */
function svgImage(svg) {
  return new Promise((res) => {
    try {
      const r = svg.getBoundingClientRect(), c = svg.cloneNode(true);
      /* the serializer writes the element's own namespace declaration (an inline <svg> is in the SVG namespace) */
      c.setAttribute('width', String(r.width)); c.setAttribute('height', String(r.height));
      const color = getComputedStyle(svg).color;
      const src = new XMLSerializer().serializeToString(c).replace(/currentColor/g, color);
      const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null);
      im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(src);
    } catch (_) { res(null); }
  });
}
/**
 * rasterLegend(el, k) → Promise<HTMLCanvasElement> — the legend card `el` as the page shows it, k canvas pixels per CSS
 * pixel. Coordinates are the page's own (getBoundingClientRect, Range#getClientRects), so wrapping, alignment and the
 * card's own layout are the browser's, not re-derived here.
 */
export async function rasterLegend(el, k) {
  const R0 = el.getBoundingClientRect();
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(R0.width * k)); cv.height = Math.max(1, Math.round(R0.height * k));
  const ctx = /** @type {CanvasRenderingContext2D} */ (cv.getContext('2d'));
  ctx.scale(k, k);
  const X = (r) => r.left - R0.left, Y = (r) => r.top - R0.top;
  const rootCs = getComputedStyle(el);
  const rootHidden = rootCs.visibility === 'hidden';   /* the phone's folded tray — see shownLegends */
  /* the card itself: its (made solid) fill, rounded as the page rounds it, and every later draw clipped to it */
  const rad = px(rootCs.borderTopLeftRadius);
  ctx.beginPath(); if (typeof ctx.roundRect === 'function') ctx.roundRect(0, 0, R0.width, R0.height, rad); else ctx.rect(0, 0, R0.width, R0.height);
  ctx.fillStyle = alphaOf(rootCs.backgroundColor) > 0 ? solidish(rootCs.backgroundColor) : 'rgba(255,255,255,0.94)';
  ctx.fill(); ctx.clip();
  /** the clip a node is drawn inside: the intersection of its ancestors' boxes that clip overflow, up to the card */
  const clips = new Map();
  const clipOf = (node) => {
    if (!node || node === el) return null;
    if (clips.has(node)) return clips.get(node);
    const up = clipOf(node.parentElement);
    let c = up;
    try { const cs = getComputedStyle(node); if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') { const r = node.getBoundingClientRect();
      const me = { x0: X(r), y0: Y(r), x1: X(r) + r.width, y1: Y(r) + r.height };
      c = up ? { x0: Math.max(up.x0, me.x0), y0: Math.max(up.y0, me.y0), x1: Math.min(up.x1, me.x1), y1: Math.min(up.y1, me.y1) } : me; } } catch (_) { /* keep up */ }
    clips.set(node, c); return c;
  };
  const withClip = (node, fn) => { const c = clipOf(node); ctx.save(); if (c) { ctx.beginPath(); ctx.rect(c.x0, c.y0, Math.max(0, c.x1 - c.x0), Math.max(0, c.y1 - c.y0)); ctx.clip(); } try { fn(); } catch (_) { /* one box */ } ctx.restore(); };
  const opacity = new Map([[el, 1]]);
  const later = [];
  const walk = (node) => {
    for (const ch of Array.from(node.childNodes)) {
      if (ch.nodeType === 3) { text(/** @type {Text} */ (ch), /** @type {HTMLElement} */ (node)); continue; }
      if (ch.nodeType !== 1) continue;
      const e = /** @type {HTMLElement} */ (ch);
      const cs = getComputedStyle(e);
      if (isHandle(e, cs)) continue;
      if (cs.display === 'none' || (!rootHidden && cs.visibility === 'hidden')) continue;
      const a = (opacity.get(node) || 1) * (+cs.opacity || 0); opacity.set(e, a);
      if (a <= 0.01) continue;
      const r = e.getBoundingClientRect();
      if (e.tagName === 'SELECT') {   /* the choice it shows, as text */
        const o = /** @type {HTMLSelectElement} */ (e).selectedOptions[0];
        if (o) withClip(e, () => { ctx.globalAlpha = a; ctx.fillStyle = cs.color; ctx.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily; ctx.textBaseline = 'middle';
          ctx.fillText(o.textContent || '', X(r) + px(cs.paddingLeft) + px(cs.borderLeftWidth), Y(r) + r.height / 2, Math.max(1, r.width)); });
        continue;
      }
      if (r.width > 0 && r.height > 0) withClip(e, () => {
        ctx.globalAlpha = a;
        const bx = X(r), by = Y(r), rr = px(cs.borderTopLeftRadius);
        const shape = () => { ctx.beginPath(); if (rr && typeof ctx.roundRect === 'function') ctx.roundRect(bx, by, r.width, r.height, Math.min(rr, r.width / 2, r.height / 2)); else ctx.rect(bx, by, r.width, r.height); };
        if (alphaOf(cs.backgroundColor) > 0) { ctx.fillStyle = cs.backgroundColor; shape(); ctx.fill(); }
        const g = /linear-gradient\(/.test(cs.backgroundImage) ? parseGradient(cs.backgroundImage) : null;
        if (g) { const L = gradientLine(g.angle, bx, by, r.width, r.height); const gr = ctx.createLinearGradient(L[0], L[1], L[2], L[3]);
          g.stops.forEach((s) => { try { gr.addColorStop(Math.max(0, Math.min(1, s.at)), s.color); } catch (_) { /* a colour the canvas cannot read */ } });
          ctx.fillStyle = gr; shape(); ctx.fill(); }
        /* the four borders, each as the page draws it (a divider is one side only) */
        [['Top', bx, by, r.width, px(cs.borderTopWidth)], ['Bottom', bx, by + r.height - px(cs.borderBottomWidth), r.width, px(cs.borderBottomWidth)],
          ['Left', bx, by, px(cs.borderLeftWidth), r.height], ['Right', bx + r.width - px(cs.borderRightWidth), by, px(cs.borderRightWidth), r.height]].forEach((b) => {
          const st = /** @type {any} */ (cs)['border' + b[0] + 'Style'], col = /** @type {any} */ (cs)['border' + b[0] + 'Color'];
          if (!(+b[3] > 0 && +b[4] > 0) || st === 'none' || st === 'hidden' || alphaOf(col) === 0) return;
          ctx.fillStyle = col; ctx.fillRect(+b[1], +b[2], +b[3], +b[4]);
        });
        if ((e.tagName === 'CANVAS' || e.tagName === 'IMG') && drawable(e)) ctx.drawImage(/** @type {any} */ (e), bx, by, r.width, r.height);
      });
      if (e.tagName === 'svg' || e.tagName === 'SVG') { const a2 = a; later.push(svgImage(e).then((im) => { if (im) withClip(e, () => { ctx.globalAlpha = a2; ctx.drawImage(im, X(r), Y(r), r.width, r.height); }); })); continue; }
      walk(e);
    }
  };
  /* text: the browser's own line boxes — one run per line of a text node, measured character by character */
  const text = (node, parent) => {
    const s = node.data; if (!s || !/\S/.test(s)) return;
    const cs = getComputedStyle(parent);
    if (cs.visibility === 'hidden' && !rootHidden) return;
    const a = opacity.get(parent) || 1;
    const tr = cs.textTransform === 'uppercase' ? (t) => t.toUpperCase() : cs.textTransform === 'lowercase' ? (t) => t.toLowerCase() : (t) => t;
    const range = document.createRange();
    /** @type {{t:string,l:number,r:number,top:number,b:number}|null} */ let run = null; const runs = [];
    for (let i = 0; i < s.length;) {
      const cp = s.codePointAt(i) || 0, n = cp > 0xffff ? 2 : 1, ch = s.slice(i, i + n);
      range.setStart(node, i); range.setEnd(node, i + n); i += n;
      const rs = range.getClientRects(); const q = rs.length ? rs[0] : null;
      if (!q || q.width <= 0) continue;
      const c = /\s/.test(ch) ? ' ' : ch;
      if (run && Math.abs(q.top - run.top) < 1 && q.left >= run.r - 1) { run.t += c; run.r = q.right; }
      else { if (run) runs.push(run); run = { t: c, l: q.left, r: q.right, top: q.top, b: q.bottom }; }
    }
    if (run) runs.push(run);
    try { range.detach(); } catch (_) { /* old engines */ }
    withClip(parent, () => {
      ctx.globalAlpha = a; ctx.fillStyle = cs.color; ctx.textBaseline = 'middle';
      ctx.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
      runs.forEach((u2) => { const t = tr(u2.t).trimEnd(); if (t) ctx.fillText(t, u2.l - R0.left, (u2.top + u2.b) / 2 - R0.top, Math.max(1, u2.r - u2.l + 1)); });
    });
  };
  walk(el);
  await Promise.all(later);
  return cv;
}

/* ══ (map-postcard) THE MAP AS ONE PICTURE TO POST ═════════════════════════════════════════════════════════
   「SNS で流通する単位は静止画」. The main map, read inside a render tick like every frame of a lapse, with the instant
   it shows, the link's title and note (the caption the share link carries — js/map-state.js `title` / `note`), the
   legends on the map, the credit of every drawn source, the wordmark and the link. Not a recording: it does not take the
   recorder's state (a lapse being recorded keeps its own), and only the last picture's object URL is held. */
/** @type {string|null} */ let lastCardUrl = null;
/**
 * postcard({ size?, title?, note?, link? }) → Promise<{ ok, error?, size, w, h, blob, url, name, credits, legends,
 * legendsOmitted, title, note, link, linkFull, instant }>. `error`: 'busy' (a lapse is being recorded — the map is
 * moving under it), 'not-drawn' (the renderer gave no frame: a hidden tab), 'encoder'.
 */
export async function postcard(o) {
  o = o || {};
  const key = postcardSizeKey(o.size), S = POSTCARD_SIZES[key];
  const title = String(o.title || ''), note = String(o.note || ''), link = String(o.link || '');
  const base = { ok: false, size: key, w: S.w, h: S.h, title, note, link };
  if (busy()) return Object.assign(base, { error: 'busy' });
  const g = await grabMain();
  if (!g.live || !g.canvas) return Object.assign(base, { error: 'not-drawn' });
  const credits = mainCredits(), instant = instantLabel('auto', o.lang || lang), els = shownLegends();
  const out = document.createElement('canvas'); out.width = S.w; out.height = S.h;
  const ctx = /** @type {CanvasRenderingContext2D} */ (out.getContext('2d'));
  const frameOpts = { w: S.w, h: S.h, panes: [{ label: instant }], credits, brand: Object.assign(brand(), { full: link }),
    caption: { title, note }, legends: els.map((e) => { const r = e.getBoundingClientRect(); return { w: r.width, h: r.height }; }) };
  /* the layout decides the legends' scale; each card is then drawn once, at exactly that scale */
  const plan = layoutFrame(Object.assign({ family: fontFamily() }, frameOpts), measurer(ctx));
  const pics = [];
  for (const b of plan.legends) { try { pics[b.i] = await rasterLegend(els[b.i], plan.legendScale); } catch (_) { pics[b.i] = null; } }
  const L = paint(ctx, frameOpts, [g.canvas], pics);
  /** @type {Blob|null} */ let blob = null;
  try { blob = await new Promise((r) => out.toBlob(r, 'image/png')); } catch (_) { blob = null; }   /* a tainted canvas throws */
  if (!blob) return Object.assign(base, { error: 'encoder' });
  if (lastCardUrl) { try { URL.revokeObjectURL(lastCardUrl); } catch (_) { /* gone */ } }
  const url = lastCardUrl = URL.createObjectURL(blob);
  const name = 'intmap-' + (slug(title) !== 'now' ? slug(title) : slug(instant)) + '-' + S.w + 'x' + S.h + '.png';
  return Object.assign(base, { ok: true, blob, url, name, credits, instant,
    legends: L.legends.length, legendsOmitted: L.legendsOmitted, linkFull: !!L.brand.link.full, linkShown: L.brand.link.text,
    band: { y: L.band.y, h: L.band.h, lines: L.credit.lines.map((l) => ({ x: l.x, y: l.y, w: Math.round(l.w), h: l.h })) },
    card: L.card ? L.card.box : null, legendBoxes: L.legends.map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h })) });
}

/* ══ (map-postcard) THE SHARE PANEL'S IMAGE TAB ════════════════════════════════════════════════════════════
   js/map-ui.js `share` owns the panel, the caption fields and the Link tab, and hands this its `link()` (the
   address-bar encoder), `caption()` (the title and note the link carries), its translator and its copy button — so the
   picture, the link it prints and the link it is shared with are one value. The tab's module is this lazy chunk: a
   session that never opens the tab does not download it. What the tab shows IS the file: the preview is the PNG that
   Save writes and Share hands over, remade when the shape, the caption or the map changes. */
const PC_CSS = [
  '#share-panel .sh-seg{display:flex;gap:2px;padding:2px;border-radius:10px;background:var(--input-bg);margin-top:12px;}',
  '#share-panel .sh-seg button{flex:1;min-height:34px;border:none;border-radius:8px;background:none;color:var(--text-muted);font-size:12px;font-weight:600;cursor:pointer;line-height:1.2;padding:3px 4px;}',
  '#share-panel .sh-seg button small{display:block;font-weight:500;font-size:10.5px;opacity:0.8;font-variant-numeric:tabular-nums;}',
  '#share-panel .sh-seg button[aria-pressed="true"]{background:var(--popup-bg);color:var(--text-main);box-shadow:0 1px 3px rgba(0,0,0,0.12);}',
  '#share-panel .sh-seg button:focus-visible{outline:2px solid var(--primary-color);outline-offset:1px;}',
  '#share-panel .sh-pc-pv{margin-top:12px;border-radius:12px;overflow:hidden;background:var(--input-bg);border:1px solid rgba(128,128,128,0.22);display:flex;align-items:center;justify-content:center;}',
  '#share-panel .sh-pc-pv img{display:block;width:100%;height:auto;max-height:46vh;object-fit:contain;}',
  '#share-panel .sh-pc-pv[data-busy="1"] img{opacity:0.55;transition:opacity .2s ease;}',
  '#share-panel a.sh-btn{text-decoration:none;}',
  '#share-panel .sh-btn[aria-disabled="true"]{opacity:0.5;pointer-events:none;}',
  '#share-panel .sh-pc-status{margin-top:8px;font-size:11.5px;color:var(--text-muted);min-height:1.2em;}',
].join('\n');
let pcStyled = false;
/**
 * createPostcardTab({ t, link, caption, lang }) → { render(host), refresh(), make(o), state() }
 *   t(key)     the panel's translator · link() the share link now · caption() → {title, note} · lang() the reader's language
 */
export function createPostcardTab(ctx) {
  const t = ctx.t;
  let size = 'card', host = null, gen = 0, last = /** @type {any} */ (null), file = /** @type {File|null} */ (null);
  const node = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const nav = /** @type {any} */ (navigator);
  const canShareFile = (f) => { try { return !!(f && nav.canShare && nav.share && nav.canShare({ files: [f] })); } catch (_) { return false; } };
  const LABEL = { card: 'postcardSizeCard', square: 'postcardSizeSquare', portrait: 'postcardSizePortrait' };
  /** make the picture of the map as it is now; a newer call wins (an older one's result is dropped) */
  async function make(o) {
    o = o || {};
    if (o.size) size = postcardSizeKey(o.size);
    const my = ++gen; const c = ctx.caption() || {};
    paintBusy(true);
    const r = await postcard({ size, title: c.title, note: c.note, link: ctx.link(), lang: ctx.lang() });
    if (my !== gen) return r;
    last = r; file = r.ok && typeof File === 'function' ? new File([r.blob], r.name, { type: 'image/png' }) : null;
    paint(); paintBusy(false);
    return r;
  }
  function paintBusy(b) { const pv = host && host.querySelector('.sh-pc-pv'); if (pv) pv.dataset.busy = b ? '1' : ''; if (b && host && !last) status(t('postcardMaking')); }
  function status(s) { const n = host && host.querySelector('.sh-pc-status'); if (n) n.textContent = s; }
  function paint() {
    if (!host || !last) return;
    const img = /** @type {HTMLImageElement} */ (host.querySelector('.sh-pc-pv img'));
    const save = /** @type {HTMLAnchorElement} */ (host.querySelector('.sh-pc-save')), go = /** @type {HTMLButtonElement} */ (host.querySelector('.sh-pc-go'));
    const cr = host.querySelector('.sh-pc-credits');
    if (!last.ok) {
      status(last.error === 'busy' ? t('postcardBusy') : last.error === 'not-drawn' ? t('postcardNotDrawn') : t('postcardFailed'));
      save.setAttribute('aria-disabled', 'true'); save.removeAttribute('href'); go.disabled = true; return;
    }
    img.src = last.url; img.width = last.w; img.height = last.h;
    save.href = last.url; save.download = last.name; save.removeAttribute('aria-disabled'); go.disabled = false;
    const share = canShareFile(file);
    go.dataset.mode = share ? 'share' : 'save-copy';
    go.replaceChildren(iconNode(share ? 'share' : 'clipboard'), ' ' + (share ? t('postcardShare') : t('postcardSaveCopy')));
    status(last.w + ' × ' + last.h + ' · PNG' + (last.legendsOmitted ? ' · ' + t('postcardLegendsOmitted').replace('{n}', String(last.legendsOmitted)) : ''));
    if (cr) cr.textContent = t('postcardCredits') + last.credits.join(' · ');
  }
  function render(h) {
    if (!pcStyled) { pcStyled = true; const st = document.createElement('style'); st.textContent = PC_CSS; document.head.appendChild(st); }
    host = h; h.replaceChildren();
    const desc = node('div', null, t('postcardDesc')); desc.style.cssText = 'font-size:11.5px;color:var(--text-muted);';
    const seg = node('div', 'sh-seg'); seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', t('postcardSize'));
    Object.keys(POSTCARD_SIZES).forEach((k) => {
      const b = /** @type {HTMLButtonElement} */ (node('button')); b.type = 'button'; b.dataset.size = k;
      b.append(t(LABEL[k]), node('small', null, POSTCARD_SIZES[k].w + ' × ' + POSTCARD_SIZES[k].h));
      b.setAttribute('aria-pressed', String(k === size));
      b.onclick = () => { size = k; seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); make(); };
      seg.appendChild(b);
    });
    const pv = node('div', 'sh-pc-pv'); const img = /** @type {HTMLImageElement} */ (node('img')); img.alt = t('postcardPreview'); pv.appendChild(img);
    const row = node('div', 'sh-row');
    const go = /** @type {HTMLButtonElement} */ (node('button', 'sh-btn sh-pc-go')); go.type = 'button'; go.style.flex = '1'; go.disabled = true;
    const save = /** @type {HTMLAnchorElement} */ (node('a', 'sh-btn sec sh-pc-save')); save.setAttribute('aria-disabled', 'true'); save.setAttribute('role', 'button');
    save.append(iconNode('save'), ' ' + t('postcardSave'));
    row.append(go, save);
    const st = node('div', 'sh-pc-status'); st.setAttribute('aria-live', 'polite');
    const inc = node('div', 'sh-inc sh-pc-credits');
    h.append(desc, seg, pv, row, st, inc);
    go.onclick = async () => {
      if (!last || !last.ok) return;
      if (go.dataset.mode === 'share' && file) {
        /* the picture, the link that opens the same map, and the caption — the phone's share sheet, where a post starts */
        const c = ctx.caption() || {};
        try { await nav.share({ files: [file], title: c.title || 'IntMap', text: c.note || undefined, url: last.link }); }
        catch (e) { if (!e || e.name !== 'AbortError') status(t('postcardFailed')); }
        return;
      }
      /* no file sharing here: the file is saved and the link copied, in one press */
      try { save.click(); } catch (_) { /* the Save button is still there */ }
      let ok = false; try { await navigator.clipboard.writeText(last.link); ok = true; } catch (_) { ok = false; }
      status(ok ? t('postcardSavedCopied') : t('postcardSavedNoCopy'));
    };
    if (last && last.ok) paint();
    return { refresh: () => make() };
  }
  return { render, make, refresh: () => make(), state: () => (last ? Object.assign({}, last, { blob: undefined }) : null), size: () => size };
}

/* ══ THE EXPORT ROW — mounted into index.html #ntl-rec, beside the time-lapse (js/time-lapse.js `openRecorder`) ═══ */
/**
 * @param {HTMLElement} el
 * @param {{ lang: () => string, settings: () => any }} host  the panel's language, and the lapse's range as the reader set it
 */
export function mountRecorder(el, host) {
  const d = document; if (!el) return null;
  const t = (en, jp) => IntMapLang.t(host.lang(), en, jp);
  lang = host.lang();
  const node = (tag, cls, text) => { const n = d.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const MR = W_().MediaRecorder;
  const can = (f) => !!(MR && typeof MR.isTypeSupported === 'function' && pickMime(f, (x) => MR.isTypeSupported(x)));
  const formats = ['mp4', 'webm'].filter(can);
  let size = rs.size || 'square', format = formats[0] || '';
  const SIZE_LABEL = { square: '1:1', landscape: '16:9', portrait: '9:16' };
  /** @type {HTMLCanvasElement|null} */ let preview = null;
  async function drawPreview() {
    if (!preview || busy()) return;
    const S = SIZES[size], g = await grabMain();
    if (!g.live || !g.canvas || !preview) return;
    preview.width = S.w; preview.height = S.h;
    paint(/** @type {CanvasRenderingContext2D} */ (preview.getContext('2d')), { w: S.w, h: S.h, panes: [{ label: instantLabel(lapseState().unit, host.lang()) }], credits: mainCredits(), brand: brand() }, [g.canvas]);
  }
  function build() {
    lang = host.lang();
    el.replaceChildren(); el.hidden = false;
    const head = node('div', 'ntl-lapse-head');
    head.append(node('span', 'ntl-lapse-title', t('Export', '書き出し')));
    const sizes = node('span', 'ntl-modes'); sizes.setAttribute('role', 'group'); sizes.setAttribute('aria-label', t('Frame size', '画面サイズ'));
    Object.keys(SIZES).forEach((k) => {
      const b = /** @type {HTMLButtonElement} */ (node('button', 'ntl-mode' + (k === size ? ' on' : ''), SIZE_LABEL[k]));
      b.type = 'button'; b.dataset.size = k; b.title = SIZES[k].w + ' × ' + SIZES[k].h;
      b.onclick = () => { if (busy()) return; size = k; sizes.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); drawPreview(); };
      sizes.appendChild(b);
    });
    head.appendChild(sizes);
    const row = node('div', 'ntl-lapse-row');
    if (formats.length > 1) {
      const fm = node('span', 'ntl-modes'); fm.setAttribute('role', 'group'); fm.setAttribute('aria-label', t('Video format', '動画の形式'));
      formats.forEach((f) => {
        const b = /** @type {HTMLButtonElement} */ (node('button', 'ntl-mode' + (f === format ? ' on' : ''), f.toUpperCase()));
        b.type = 'button'; b.dataset.format = f;
        b.onclick = () => { if (busy()) return; format = f; fm.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); };
        fm.appendChild(b);
      });
      row.append(node('span', 'ntl-lapse-k', t('Video', '動画')), fm);
    }
    preview = /** @type {HTMLCanvasElement} */ (node('canvas', 'ntl-rec-preview'));
    preview.setAttribute('role', 'img'); preview.setAttribute('aria-label', t('Preview of the frame', 'コマのプレビュー'));
    const acts = node('div', 'ntl-lapse-row');
    const rec = /** @type {HTMLButtonElement} */ (node('button', 'ntl-rec-btn ntl-rec-primary', t('Record the time-lapse', 'タイムラプスを録画')));
    rec.type = 'button'; rec.id = 'ntl-rec-video'; rec.disabled = !formats.length;
    if (!formats.length) rec.title = t('This browser cannot record video', 'このブラウザは動画を録画できません');
    const img = /** @type {HTMLButtonElement} */ (node('button', 'ntl-rec-btn', t('Save the comparison image', '比較画像を保存')));
    img.type = 'button'; img.id = 'ntl-rec-image';
    img.title = t('The comparison window beside the main map, each at its own time', '比較ウィンドウとメイン地図を、それぞれの時刻で 1 枚に');
    const cancel = /** @type {HTMLButtonElement} */ (node('button', 'ntl-rec-btn', t('Cancel', '中止')));
    cancel.type = 'button'; cancel.id = 'ntl-rec-cancel'; cancel.hidden = true;
    acts.append(rec, img, cancel);
    const prog = /** @type {HTMLProgressElement} */ (node('progress', 'ntl-rec-progress')); prog.id = 'ntl-rec-progress'; prog.hidden = true;
    const status = node('div', 'ntl-lapse-status'); status.id = 'ntl-rec-status'; status.setAttribute('aria-live', 'polite');
    const done = node('div', 'ntl-lapse-row ntl-rec-done'); done.id = 'ntl-rec-done'; done.hidden = true;
    el.append(head, row, preview, acts, prog, status, done,
      node('div', 'ntl-lapse-note', t('The year, the data credits and the IntMap link are part of every frame.', '年・データの出典・IntMap のリンクは、すべてのコマに入ります。')));
    rec.onclick = () => {
      const s = host.settings();
      if (!s || s.error === 'no-start') { paintStatus(t('Give the time-lapse a start', 'タイムラプスの開始を入れてください')); return; }
      const r = recordLapse(Object.assign({}, s, { size, format }));
      if (r.error === 'empty-range') paintStatus(t('The end is before the start', '終了が開始より前です'));
    };
    cancel.onclick = () => { cancelRecording(); };
    img.onclick = async () => {
      const r = await compareImage({ size });
      if (r.error === 'no-compare') paintStatus(t('Open the compare view and set its time first', '先に比較ビューを開いて時刻を設定してください'));
    };
    paint2(recorderState());
    drawPreview();
  }
  function paintStatus(s) { const n = el.querySelector('#ntl-rec-status'); if (n) n.textContent = s; }
  const mb = (n) => (n / 1048576).toFixed(n < 10485760 ? 1 : 0) + ' MB';
  function paint2(s) {
    const q = (sel) => /** @type {any} */ (el.querySelector(sel));
    const rec = q('#ntl-rec-video'), img = q('#ntl-rec-image'), cancel = q('#ntl-rec-cancel'), prog = q('#ntl-rec-progress'), done = q('#ntl-rec-done');
    if (!rec) return;
    const b = s.phase === 'recording' || s.phase === 'finishing';
    rec.hidden = b; img.hidden = b; cancel.hidden = !(b && s.kind === 'video');
    el.querySelectorAll('[data-size],[data-format]').forEach((x) => { /** @type {HTMLButtonElement} */ (x).disabled = b; });
    prog.hidden = !(b && s.kind === 'video');
    if (s.total) { prog.max = s.total; prog.value = s.frames; } else prog.removeAttribute('value');
    let line = '';
    if (s.phase === 'recording') line = t('Recording', '録画中') + ' ' + (s.instants[s.instants.length - 1] || '') + ' — ' + s.frames + (s.total ? ' / ' + s.total : '') + ' ' + t('frames', 'コマ');
    else if (s.phase === 'finishing') line = s.kind === 'image' ? t('Composing the image…', '画像を合成しています…') : t('Finishing the video…', '動画を仕上げています…');
    else if (s.phase === 'done' && s.kind === 'video') line = s.frames + ' ' + t('frames', 'コマ') + ' · ' + s.fps + ' ' + t('per second', 'コマ/秒') + ' · ' + mb(s.bytes) + ' · ' + s.ext.toUpperCase();
    else if (s.phase === 'done') line = s.w + ' × ' + s.h + ' · ' + mb(s.bytes) + ' · PNG';
    else if (s.phase === 'cancelled') line = s.reason === 'clock-moved' ? t('Recording stopped — the clock was moved. Nothing was saved.', '録画を止めました——時計が操作されたためです。保存されたものはありません。') : t('Recording cancelled. Nothing was saved.', '録画を中止しました。保存されたものはありません。');
    else if (s.phase === 'failed') line = s.error === 'unsupported' ? t('This browser cannot record video', 'このブラウザは動画を録画できません') : s.error === 'not-drawn' ? t('The map could not be read — keep this tab in front and try again', '地図を読み取れませんでした——このタブを前面にして、もう一度お試しください') : t('The recording failed', '録画に失敗しました');
    paintStatus(line);
    done.hidden = s.phase !== 'done';
    if (s.phase === 'done' && s.url && done.dataset.url !== s.url) {
      done.dataset.url = s.url; done.replaceChildren();
      const a = /** @type {HTMLAnchorElement} */ (node('a', 'ntl-rec-btn ntl-rec-primary', s.kind === 'image' ? t('Save image', '画像を保存') : t('Save video', '動画を保存')));
      a.href = s.url; a.download = s.name || ''; a.id = 'ntl-rec-save';
      done.appendChild(a);
      /* the phone's share sheet, where the browser can hand it a file — that is where a post starts */
      const nav = /** @type {any} */ (navigator);
      if (blob && nav.canShare && typeof File === 'function') {
        const file = new File([blob], s.name || ('intmap.' + s.ext), { type: blob.type });
        let ok = false; try { ok = nav.canShare({ files: [file] }); } catch (_) { ok = false; }
        if (ok) {
          const sh = /** @type {HTMLButtonElement} */ (node('button', 'ntl-rec-btn', t('Share', '共有'))); sh.type = 'button';
          sh.onclick = () => { nav.share({ files: [file] }).catch(() => { /* the reader closed the sheet */ }); };
          done.appendChild(sh);
        }
      }
      /* what the file credits, said where the reader saves it — the same strings that are in its pixels */
      const cr = node('div', 'ntl-lapse-note ntl-rec-credits', t('Credited in the file: ', 'ファイル内の出典: ') + s.credits.join(' · '));
      cr.id = 'ntl-rec-credits';
      done.appendChild(cr);
    }
    if (!b) drawPreview();
  }
  build();
  subs.add(paint2);
  return { relabel() { build(); } };
}
