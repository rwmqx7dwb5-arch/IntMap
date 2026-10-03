/* ============================================================================
 *  IntMap · Atlas — THE BRIEFING, AS DATA   (atlas-briefing)            js/atlas-briefing-codec.js
 * ----------------------------------------------------------------------------
 *  「Atlas を、質問に答える窓から、次の段の商品へ。」
 *
 *  An Atlas investigation could be kept (the notebook, js/atlas-notebook.js), replayed and compared with
 *  today — but only by the person who asked. Handing it on meant a Markdown file (the answer without the
 *  map) or a notebook file (which the other person has to download, find and import). Neither is a thing
 *  you paste into a chat and the other person simply OPENS.
 *
 *  A BRIEFING is one or more notebook entries — the question, Atlas's answer, the view it ended in, the
 *  calls that drew the map, the rows its queries found and the sources it cited — packed INTO A LINK.
 *  Whoever opens the link gets the map rebuilt and the answer beside its evidence, with no account, no
 *  AI call and no server: the briefing travels in the address's FRAGMENT (`#…&b=…`), which a browser
 *  never sends to the host (RFC 3986 §3.5), so IntMap's servers do not receive what was shared.
 *
 *  This module is the data and nothing else — no DOM, no map, no network:
 *    · buildBriefing  — notebook entries → the briefing object (only what the recipient needs)
 *    · packBriefing / unpackBriefing — the object ⇄ the link's `b` value (deflate-raw + base64url)
 *    · readBriefing   — a decoded object → validated sections, through the NOTEBOOK'S OWN `normalize`
 *                       (a link is somebody else's data, exactly as an imported notebook file is)
 *    · briefingLink   — the link itself, written by the map-state codec (js/map-state.js `encode`)
 *  js/atlas-briefing.js is the page side; js/atlas-cap-briefing.js is what Atlas can do with it.
 * ==========================================================================*/

import { normalize } from './atlas-notebook-store.js';
import { encode, captionText } from './map-state.js';

export const BRIEFING_FORMAT = 'intmap-briefing';
const BRIEFING_VERSION = 1;
/* the first character of a packed value names how the rest is packed: 'z' = deflate-raw, base64url. A later
   packing gets a new letter, so a link written today is never misread by a build that packs differently. */
const PACKING = 'z';
export const TITLE_MAX = 140;   /* the notebook's own title length (js/atlas-notebook-store.js entryFromTurn) — one title rule for both */

/* ══ HOW BIG A LINK MAY INFLATE TO ══════════════════════════════════════════════════════════════════
   ⚠ ESTIMATE, stated as one: 8 MiB = eight entries at the per-entry ceiling the account copy of the
   notebook enforces (1 MiB of payload, supabase/migrations/20261003170000_atlas_notebook.sql). A link is
   somebody else's bytes, and deflate can expand a few kilobytes a thousandfold — so the decoder stops
   READING at this size and refuses the link by name ('too-large'); it never truncates a briefing into a
   different one. Expire when that ceiling moves (it is the notebook's estimate too). */
export const MAX_INFLATED = 8 * 1048576;

/* ══ HOW LONG A LINK A BROWSER KEEPS ═══════════════════════════════════════════════════════════════
   MEASURED in Chromium 153.0.8010.12 (Playwright's bundled build, 2026-10-03; the measurement is in
   dev-notes/2026-10-03-atlas-briefing.md): an address of 2,097,152 characters loads with its fragment
   intact, and 2,097,153 is refused (net::ERR_ABORTED). That is Chromium's own URL ceiling
   (url/url_constants.h kMaxURLChars). It is the ONLY browser measured here — Firefox and
   Safari were not, and the composer says so instead of claiming a limit for them. A briefing whose link
   is longer is not offered as a link: the composer hands on the notebook file instead (the same entries,
   in full). Expire when Chromium changes kMaxURLChars. */
export const LINK_LIMIT_MEASURED = 2097152;

/* ══ ENTRIES → BRIEFING ════════════════════════════════════════════════════════════════════════════
   Only what the recipient needs. A step that a replay will not run (a look-up, a setting, the notebook's
   own calls) keeps its capability id and status — what Atlas DID — but not its arguments, which are only
   ever read to run it again. The reader's private note goes along only when they say so (`withNotes`). */
export function sectionFromEntry(e, withNotes) {
  const n = normalize(e); if (!n) return null;
  return {
    id: n.id, at: n.at, question: n.question, answer: n.answer, lang: n.lang, status: n.status, view: n.view,
    steps: n.steps.map((s) => s.replay ? { cap: s.cap, args: s.args, status: s.status, replay: true } : { cap: s.cap, status: s.status }),
    results: n.results, sources: n.sources, note: withNotes ? n.note : '',
  };
}
export function buildBriefing(entries, opts) {
  const o = opts || {};
  const sections = (entries || []).map((e) => sectionFromEntry(e, !!o.withNotes)).filter(Boolean);
  const title = captionText(o.title || (sections[0] ? sections[0].question : ''), TITLE_MAX);
  return { f: BRIEFING_FORMAT, v: BRIEFING_VERSION, title, lang: String(o.lang || '').slice(0, 12), at: +o.now || Date.now(), sections };
}

/* ══ READING ONE ═══════════════════════════════════════════════════════════════════════════════════
   ⚠ EVERY SECTION PASSES THROUGH THE NOTEBOOK'S normalize — the rule that already decides what an imported
   file may carry (a field of the wrong type is dropped to its empty value; a source that is not http(s) is
   dropped; an entry with no question is not an entry). A second, looser reader here would be the
   [[intmap-two-readers-one-field-list]] shape. Throws only when it is not a briefing at all. */
export function readBriefing(obj) {
  if (!obj || typeof obj !== 'object' || obj.f !== BRIEFING_FORMAT) throw new Error('not-a-briefing');
  if (!(+obj.v >= 1)) throw new Error('not-a-briefing');
  if (+obj.v > BRIEFING_VERSION) throw new Error('newer-version');
  const all = Array.isArray(obj.sections) ? obj.sections : [];
  const sections = [];
  all.forEach((s) => {
    const n = normalize(Object.assign({}, s, { syncedAt: 0, pinned: false, followOf: null }));
    if (n) sections.push(sectionFromEntry(Object.assign({}, n, { note: n.note }), true));
  });
  if (!sections.length) throw new Error('empty-briefing');
  return { f: BRIEFING_FORMAT, v: BRIEFING_VERSION, title: captionText(obj.title || sections[0].question, TITLE_MAX),
    lang: String(obj.lang || '').slice(0, 12), at: +obj.at || 0, sections, rejected: all.length - sections.length };
}

/* ══ PACKING ═══════════════════════════════════════════════════════════════════════════════════════ */
const b64url = (bytes) => {
  let s = ''; const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const unb64url = (s) => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
};
async function pipe(bytes, stream, cap) {
  const w = stream.writable.getWriter();
  w.write(bytes).catch(() => { }); w.close().catch(() => { });
  const r = stream.readable.getReader(), parts = []; let n = 0;
  for (;;) {
    const { value, done } = await r.read();
    if (done) break;
    n += value.length;
    if (cap && n > cap) { try { await r.cancel(); } catch (_) { } throw new Error('too-large'); }
    parts.push(value);
  }
  const out = new Uint8Array(n); let k = 0; parts.forEach((p) => { out.set(p, k); k += p.length; });
  return out;
}
/** the briefing object → the link's `b` value */
export async function packBriefing(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  return PACKING + b64url(await pipe(bytes, new CompressionStream('deflate-raw'), 0));
}
/** a link's `b` value → the validated briefing (readBriefing). Throws a named Error: 'not-a-briefing' |
    'unknown-packing' | 'corrupt' | 'too-large' | 'newer-version' | 'empty-briefing' */
export async function unpackBriefing(packed) {
  const p = String(packed || '');
  if (!/^[A-Za-z0-9_-]+$/.test(p)) throw new Error('not-a-briefing');
  if (p.charAt(0) !== PACKING) throw new Error('unknown-packing');
  let bytes; try { bytes = unb64url(p.slice(1)); } catch (_) { throw new Error('corrupt'); }
  let raw;
  try { raw = await pipe(bytes, new DecompressionStream('deflate-raw'), MAX_INFLATED); }
  catch (e) { throw new Error(e && e.message === 'too-large' ? 'too-large' : 'corrupt'); }
  let obj; try { obj = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)); } catch (_) { throw new Error('corrupt'); }
  return readBriefing(obj);
}

/* ══ THE LINK ══════════════════════════════════════════════════════════════════════════════════════
   The camera of the FIRST section is the link's `v` (with its base map and terrain) — so the link is a
   map link before it is anything else, and a build that does not know `b` still opens on the right place.
   The rest of that view (the clock and the layers) is put back by the briefing itself, through the same
   restorers the notebook and undo use: absent from the link, the map-state restore first states «now, no
   data layers», and the briefing then applies its own once that restore has settled. */
function viewOfSection(s) {
  const c = s && s.view && s.view.camera;
  if (!c || !isFinite(+c.lng) || !isFinite(+c.lat) || !isFinite(+c.zoom)) return null;
  return {
    view: { lng: +c.lng, lat: +c.lat, zoom: +c.zoom, bearing: +c.bearing || 0, pitch: +c.pitch || 0, proj: c.projection === 'flat' ? 'flat' : 'globe' },
    base: c.base === 'satellite' ? 'sat' : 'map', terrain: c.projection === '3d-terrain',
  };
}
/** `page` is the app's address without query or fragment (location.origin + location.pathname); `here` is the
    composer's own map ({ view, base, terrain } as js/map-state.js reads them), used only when no section kept a
    camera — a link needs a `v` to be a map link at all. '' when neither has one. */
export function briefingLink(page, briefing, packed, here) {
  const secs = (briefing && briefing.sections) || [];
  let st = null; for (const s of secs) { st = viewOfSection(s); if (st) break; }
  if (!st && here && here.view) st = { view: here.view, base: here.base === 'sat' ? 'sat' : 'map', terrain: !!here.terrain };
  if (!st) return '';
  return String(page || '') + encode(Object.assign({}, st, { brief: packed }));
}
