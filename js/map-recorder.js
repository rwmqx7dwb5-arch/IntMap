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
 *  Loaded only when the reader opens the export row of the time-lapse (js/time-lapse.js `openRecorder`) or Atlas asks
 *  for a recording (js/atlas-cap-time.js): nothing here is in the start-up bundle.
 * ==========================================================================*/
import { IntMapGeoEngine } from './geo-engine.js';
import { IntMapLang } from './lang-registry.js';
import { IntMapTime } from './chronos.js';
import { makeViewCapture } from './atlas-view-capture.js';
import { startLapse, stopLapse, lapseState } from './time-lapse.js';

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
  const brand = { name: { text: o.brand.name, font: bfont, x: pad, y: band.y + vpad, w: nameW, h: bpx },
    link: { text: o.brand.link, font: lfont, x: pad + nameW + Math.round(16 * u), y: band.y + vpad + Math.round((bpx - lpx) * 0.7), w: measure(o.brand.link, lfont), h: lpx } };
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
  return { w: W, h: H, u, pad, panes, band, brand, credit, divider: n === 2 ? Math.max(2, Math.round(4 * u)) : 0, tall };
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
/** paint one frame into `ctx` (a canvas of o.w × o.h): images[i] fills pane i. Returns the layout used. */
function paint(ctx, o, images) {
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
