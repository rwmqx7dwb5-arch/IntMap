/* ============================================================================
 *  IntMap · WHAT THE READER SENDS TO IntMap — the share sheet, a photo, a link   (mobile-next)
 * ----------------------------------------------------------------------------
 *  The phone's share sheet is how a person moves a thing between apps. Before this file IntMap was only on the
 *  SENDING side of it (js/map-ui.js IntMapShare, the postcard). Now an installed IntMap is a destination:
 *
 *    · a PHOTO       the camera's own record of where and when (EXIF GPS + DateTimeOriginal, read on the device by
 *                    js/photo-geo-exif.js) → a pin there, «Here, now» for that point, and the map of the day it was
 *                    taken. A photo with no position is not guessed at: it is offered to the photo-geolocation panel
 *                    (js/photo-geo.js — the skyline match), which is an estimate and says so.
 *    · a MAP LINK    Google Maps / Apple Maps / OpenStreetMap / a `geo:` URI / bare coordinates → the point itself.
 *                    A link that carries no coordinates (a short link the browser cannot expand, a place URL with
 *                    only a name) is searched by the name it does carry — and the card says which it was.
 *    · an IntMap LINK → opened as itself (the share link restores the view, date and layers).
 *    · any TEXT      → the place search, as if typed.
 *
 *  Three doors reach `openShared`: the share sheet (sw.js puts the parts in a page cache and redirects to
 *  `?share=<id>`; src/main.js imports this on that query), the «Photo's place» row under the empty search field
 *  (js/here-entry.js), and Atlas (`view.openShared` reads a link or text; js/atlas-cap-view.js).
 *  ⚠ NOTHING HERE SENDS THE PHOTO ANYWHERE. Its bytes are read in this page; only the point it names is used —
 *  the same as a tap on the map.
 *  ⚠ THE CAMERA'S RECORD IS NAMED AS SUCH. The card says «recorded by the camera», never «IntMap found».
 * ==========================================================================*/
import { IntMapLang } from './lang-registry.js';
import { IntMapTime } from './chronos.js';
import { IntMapGeoEngine } from './geo-engine.js';
import { whenHost } from './host-door.js';
import { MapState } from './map-state.js';
import { whenMapReady, openHereNow } from './here-now.js';
import './photo-geo-exif.js';   /* publishes globalThis.IntMapPhotoExif */

const finite = (v) => typeof v === 'number' && isFinite(v);
const okLL = (lat, lng) => finite(lat) && finite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);

/* ══ READING A SHARED LINK OR TEXT ═════════════════════════════════════════════════════════════════════
   Each map service writes the point in its own place; these are the forms the services document or emit, read in
   the order a URL can carry more than one of them (a Google place URL has both `@lat,lng` — the camera — and
   `!3d…!4d…` — the place; the place wins). Nothing here is a list of places: only of how a point is spelled. */
const NUM = '(-?\\d{1,3}(?:\\.\\d+)?)';
const PAIR = new RegExp('^\\s*' + NUM + '\\s*,\\s*' + NUM + '\\s*$');
function pair(s) { const m = PAIR.exec(String(s || '')); if (!m) return null; const lat = +m[1], lng = +m[2]; return okLL(lat, lng) ? { lat, lng } : null; }

/**
 * readLocationText(text) → { kind, lat?, lng?, zoom?, query?, url?, via } — never throws.
 *   kind: 'point' (coordinates found) · 'intmap' (an IntMap link: open it) · 'query' (a name to search) ·
 *         'unexpandable' (a short link whose target the browser cannot read; `query` is what else was shared) · 'none'
 */
export function readLocationText(input, opts) {
  const o = opts || {};
  const text = String(input || '').trim();
  if (!text) return { kind: 'none', via: 'empty' };
  /* geo: URI (RFC 5870; Android's maps intent adds ?q=lat,lng(label) or ?q=address) */
  const geo = /\bgeo:([^\s]+)/i.exec(text);
  if (geo) {
    const [head, qs] = geo[1].split('?');
    const q = qs ? decodeURIComponent((/(?:^|&)q=([^&]*)/.exec(qs) || [])[1] || '').replace(/\+/g, ' ') : '';
    const qp = pair(q.replace(/\(.*\)$/, ''));
    if (qp) return { kind: 'point', ...qp, via: 'geo-uri-q', label: (/\(([^)]*)\)$/.exec(q) || [])[1] || null };
    const hp = pair(head.split(';')[0]);
    if (hp) return { kind: 'point', ...hp, via: 'geo-uri' };
    if (q) return { kind: 'query', query: q, via: 'geo-uri-address' };
  }
  const urlM = /\bhttps?:\/\/[^\s<>"]+/i.exec(text);
  if (urlM) {
    let u = null; try { u = new URL(urlM[0]); } catch (_) { u = null; }
    if (u) {
      const host = u.hostname.toLowerCase(), path = decodeURIComponent(u.pathname), sp = u.searchParams;
      const base = o.base ? new URL(o.base) : null;
      const dir = base ? base.pathname.replace(/[^/]*$/, '') : null;   /* the app's own document: <dir> or <dir>index.html */
      if (base && u.origin === base.origin && (u.pathname === dir || u.pathname === dir + 'index.html')) return { kind: 'intmap', url: u.href, via: 'intmap-link' };
      /* Google: the place (!3d lat !4d lng) before the camera (@lat,lng,z) */
      const g3 = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/.exec(path + u.search);
      if (g3 && okLL(+g3[1], +g3[2])) return { kind: 'point', lat: +g3[1], lng: +g3[2], via: 'google-place' };
      const at = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,(\d+(?:\.\d+)?)z)?/.exec(path);
      if (at && okLL(+at[1], +at[2])) return { kind: 'point', lat: +at[1], lng: +at[2], zoom: at[3] ? +at[3] : null, via: 'map-camera' };
      /* OpenStreetMap: #map=z/lat/lng, or mlat/mlon (a marker) */
      const om = /map=(\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/.exec(u.hash);
      if (sp.get('mlat') && sp.get('mlon') && okLL(+sp.get('mlat'), +sp.get('mlon'))) return { kind: 'point', lat: +sp.get('mlat'), lng: +sp.get('mlon'), zoom: om ? +om[1] : null, via: 'osm-marker' };
      if (om && okLL(+om[2], +om[3])) return { kind: 'point', lat: +om[2], lng: +om[3], zoom: +om[1], via: 'osm-view' };
      /* the query parameters the services use for a point: q / query / ll / sll / daddr / destination / center */
      for (const k of ['q', 'query', 'll', 'sll', 'daddr', 'destination', 'center', 'coordinate']) { const p = pair(sp.get(k)); if (p) return { kind: 'point', ...p, via: 'param:' + k }; }
      if (sp.get('lat') && (sp.get('lon') || sp.get('lng')) && okLL(+sp.get('lat'), +(sp.get('lon') || sp.get('lng')))) return { kind: 'point', lat: +sp.get('lat'), lng: +(sp.get('lon') || sp.get('lng')), via: 'param:lat/lon' };
      /* a name the link carries: ?q=Eiffel+Tower, /maps/place/<name>/, /search/<name> */
      const named = sp.get('q') || sp.get('query') || sp.get('address') || sp.get('daddr') || ((/\/(?:place|search)\/([^/@]+)/.exec(path) || [])[1] || '').replace(/\+/g, ' ');
      if (named && named.trim()) return { kind: 'query', query: named.trim().slice(0, 160), via: 'link-name', url: u.href };
      /* a short link: its target is behind a redirect the browser will not let a page read (no CORS) */
      const rest = text.replace(urlM[0], '').trim();
      if (/^(maps\.app\.goo\.gl|goo\.gl|g\.co|maps\.apple(\.com)?|osm\.org|go\.osm\.org)$/.test(host) || /(^|\.)maps\.(google|apple)\./.test(host))
        return { kind: 'unexpandable', url: u.href, query: (o.title || rest || '').trim().slice(0, 160) || null, via: 'short-link' };
      /* any other page: its title (or the text around the link) is what it is about */
      const t = (o.title || rest || '').trim();
      return t ? { kind: 'query', query: t.slice(0, 160), via: 'page-title', url: u.href } : { kind: 'none', url: u.href, via: 'page-without-place' };
    }
  }
  /* bare coordinates in text: «35.6812, 139.7671» */
  const bare = /(-?\d{1,2}\.\d{2,})\s*[,\s]\s*(-?\d{1,3}\.\d{2,})/.exec(text);
  if (bare && okLL(+bare[1], +bare[2])) return { kind: 'point', lat: +bare[1], lng: +bare[2], via: 'coordinates' };
  return { kind: 'query', query: text.split(/\n/)[0].trim().slice(0, 160), via: 'text' };
}

/* ══ A PHOTO ═══════════════════════════════════════════════════════════════════════════════════════════ */
/** readPhoto(Blob|File) → { ok, lat?, lng?, altitudeM?, takenAt?, why?, exifPresent } — on the device */
export async function readPhoto(file) {
  if (!file || typeof file.arrayBuffer !== 'function') return { ok: false, why: 'no-file', exifPresent: false };
  let buf; try { buf = await file.arrayBuffer(); } catch (_) { return { ok: false, why: 'unreadable', exifPresent: false }; }
  const ex = globalThis.IntMapPhotoExif ? globalThis.IntMapPhotoExif.parse(buf) : { present: false };
  const takenAt = ex.takenAt || null;
  if (ex.gps && okLL(ex.gps.lat, ex.gps.lon)) return { ok: true, lat: ex.gps.lat, lng: ex.gps.lon, altitudeM: finite(ex.gps.altitudeM) ? ex.gps.altitudeM : null, takenAt, exifPresent: true, camera: [ex.make, ex.model].filter(Boolean).join(' ') || null };
  return { ok: false, why: ex.present ? 'no-position-recorded' : 'no-exif', takenAt, exifPresent: !!ex.present };
}
/** the instant the camera's wall clock names — exact when the file states its offset, else that day at noon UTC
    (the map's date, not a moment: a photo without an offset is not given one) */
export function takenInstant(t) {
  if (!t || !t.local) return null;
  if (t.offset) { const d = new Date(t.local + t.offset); return isFinite(d.getTime()) ? { date: d, exact: true } : null; }
  const d = new Date(t.local.slice(0, 10) + 'T12:00:00Z'); return isFinite(d.getTime()) ? { date: d, exact: false } : null;
}

/* ══ OPENING WHAT WAS SHARED ═══════════════════════════════════════════════════════════════════════════ */
function fly(lng, lat, zoom) { try { const E = IntMapGeoEngine; E.camera.flyTo({ center: [lng, lat], zoom: zoom || 13, duration: 1200 }); } catch (_) { /* no renderer */ } }
function toast(HOST, msg) { try { HOST.imToast(msg); } catch (_) { /* a page with no toast still has the card */ } }
function searchFor(q) {
  const inp = /** @type {HTMLInputElement} */ (document.getElementById('ms-input')), btn = document.getElementById('ms-btn');
  if (!inp || !q) return false;
  inp.value = q; try { inp.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) { /* the click below searches */ }
  if (btn) btn.click();
  return true;
}
function hereAt(HOST, pt, lead) { return openHereNow(HOST, { point: pt, lead }); }

/**
 * openShared(HOST, { title?, text?, url?, file? }) → { ok, kind, … } — what was done, for the page and for Atlas
 */
export async function openShared(HOST, sh) {
  sh = sh || {};
  const L = IntMapLang.pick(() => { try { return HOST.lang; } catch (_) { return 'en'; } });
  if (sh.file) {
    const ph = await readPhoto(sh.file);
    if (ph.ok) {
      const when = takenInstant(ph.takenAt);
      let pinId = null; try { pinId = HOST.addPin(ph.lng, ph.lat, { title: sh.file.name || L('Shared photo', '共有された写真'), description: L('Position recorded by the camera', 'カメラが記録した撮影位置'), when: when ? when.date.toISOString() : undefined, source: 'EXIF' }); } catch (_) { pinId = null; }
      fly(ph.lng, ph.lat, 13);
      const dayText = ph.takenAt ? ph.takenAt.local.replace('T', ' ').slice(0, 16) + (ph.takenAt.offset ? ' (UTC' + ph.takenAt.offset + ')' : '') : null;
      const lead = { text: L('Photo taken here', 'この写真の撮影地点') + (dayText ? L(' on ', '・') + dayText : '') + L(' — recorded by the camera.', '（カメラの記録）'),
        actions: when ? [{ label: L('Map of the day it was taken', '撮影日の地図にする'), run: () => { try { IntMapTime.set(when.date, { source: 'share' }); } catch (_) { /* the clock refuses an instant it cannot reach */ } } }] : [] };
      hereAt(HOST, { lng: ph.lng, lat: ph.lat, name: sh.file.name || null }, lead).catch(() => {});
      return { ok: true, kind: 'photo', lat: ph.lat, lng: ph.lng, takenAt: ph.takenAt, pin: pinId, from: 'exif' };
    }
    /* no position in the file: say so, and offer the estimate that does not need one */
    const why = ph.why === 'no-exif' ? L('This photo carries no camera data (many apps remove it when sharing).', 'この写真にはカメラの記録がありません（共有時に消すアプリが多くあります）。')
      : ph.why === 'no-position-recorded' ? L('The camera did not record where this photo was taken.', 'この写真には撮影位置が記録されていません。')
        : L('The photo could not be read.', '写真を読めませんでした。');
    toast(HOST, why + ' ' + L('Opening the skyline match to estimate it.', '稜線の照合で撮影地を推定します。'));
    try { await window.IntMapLazy.need('photoGeo'); await window.IntMapPhotoGeo.open({ file: sh.file }); } catch (_) { /* the toast said what is known */ }
    return { ok: false, kind: 'photo', reason: ph.why, estimateOffered: true, takenAt: ph.takenAt || null };
  }
  const r = readLocationText([sh.text, sh.url].filter(Boolean).join('\n'), { title: sh.title, base: (typeof document !== 'undefined' && document.baseURI) || null });
  if (r.kind === 'point') {
    try { HOST.addPin(r.lng, r.lat, { title: (r.label || sh.title || L('Shared place', '共有された場所')).slice(0, 80), source: r.via }); } catch (_) { /* the card is the answer */ }
    fly(r.lng, r.lat, r.zoom || 13);
    hereAt(HOST, { lng: r.lng, lat: r.lat, name: r.label || sh.title || null }, null).catch(() => {});
    return { ok: true, kind: 'point', lat: r.lat, lng: r.lng, via: r.via };
  }
  if (r.kind === 'intmap') { try { location.assign(r.url); } catch (_) { /* nothing to open */ } return { ok: true, kind: 'intmap', url: r.url }; }
  if (r.kind === 'unexpandable') {
    toast(HOST, L('This short link hides its place from other apps — searching for what came with it.', 'この短縮リンクは場所を他のアプリから読めません。一緒に送られた名前で検索します。'));
    if (r.query) searchFor(r.query);
    return { ok: !!r.query, kind: 'unexpandable', url: r.url, query: r.query || null };
  }
  if (r.kind === 'query') { searchFor(r.query); return { ok: true, kind: 'query', query: r.query, via: r.via }; }
  toast(HOST, L('Nothing in what was shared names a place.', '共有された内容に場所が含まれていませんでした。'));
  return { ok: false, kind: 'none', reason: r.via };
}

/* ══ THE SHARE SHEET'S DOOR: `?share=<id>` (sw.js wrote the parts) ═══════════════════════════════════════ */
const INBOX = 'intmap-page-share-inbox';   /* sw.js SHARE_INBOX — PAGE_CACHE_PREFIX + 'share-inbox' */
const SHARE_TTL_MS = 60 * 60 * 1000;        /* a share not opened within the hour is dropped (sw.js header) */
async function readInbox(id) {
  if (!('caches' in window)) return null;
  const c = await caches.open(INBOX), keys = await c.keys();
  let meta = null;
  for (const k of keys) {
    const m = /__share\/([a-z0-9]+)\/meta$/.exec(k.url); if (!m) continue;
    if (m[1] === id) { try { meta = await (await c.match(k)).json(); } catch (_) { meta = null; } continue; }
    const age = Date.now() - parseInt(m[1].slice(0, -6), 36);
    if (!(age < SHARE_TTL_MS)) for (const k2 of keys) if (k2.url.indexOf('__share/' + m[1] + '/') >= 0) await c.delete(k2);
  }
  if (!meta) return null;
  let file = null;
  if (meta.files && meta.files[0]) { const r = await c.match(meta.files[0].key); if (r) { const b = await r.blob(); try { file = new File([b], meta.files[0].name || 'photo', { type: meta.files[0].type || b.type }); } catch (_) { file = b; } } }
  for (const k of keys) if (k.url.indexOf('__share/' + id + '/') >= 0) await c.delete(k);   /* read once */
  return { title: meta.title, text: meta.text, url: meta.url, file, dropped: meta.dropped || 0 };
}
export async function bootFromUrl() {
  let id = null; try { id = new URLSearchParams(location.search).get('share'); } catch (_) { id = null; }
  if (!id) return null;
  /* the query is spent: a reload must not open the share again */
  try { const q = new URLSearchParams(location.search); q.delete('share'); MapState.address(q.toString()); } catch (_) { /* cosmetic */ }   /* the address bar's one door (js/map-state.js) */
  const HOST = await whenHost();
  await new Promise((r) => { if (document.readyState !== 'loading') r(); else document.addEventListener('DOMContentLoaded', r, { once: true }); });
  await whenMapReady();
  const L = IntMapLang.pick(() => { try { return HOST.lang; } catch (_) { return 'en'; } });
  if (id === 'failed') { toast(HOST, L('IntMap could not read what was shared.', '共有された内容を IntMap が読めませんでした。')); return { ok: false, reason: 'worker-could-not-read' }; }
  let sh = null; try { sh = await readInbox(id); } catch (_) { sh = null; }
  if (!sh) { toast(HOST, L('What was shared is no longer here (it is kept for an hour).', '共有された内容はもうありません（保管は 1 時間です）。')); return { ok: false, reason: 'expired' }; }
  if (sh.dropped) toast(HOST, L('Only the first photo is opened.', '最初の 1 枚だけを開きます。'));
  return openShared(HOST, sh);
}
