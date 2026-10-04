// @ts-check
/* ============================================================================
 *  IntMap · LINK CODEC — bytes ⇄ DEFLATE ⇄ base64url, the one packing a link carries   (map-document-unify)
 * ----------------------------------------------------------------------------
 *  Two things put a document into a link: a reader's own tour (`?tour=custom&t=…`, js/tours.js) and an Atlas
 *  briefing (`#…&b=…`, js/atlas-briefing-codec.js). Each had written its own base64url, its own pipe through
 *  the platform's CompressionStream, and — only the briefing's — a ceiling on how much a link may inflate to.
 *  Two copies of the same packing are two places a fix lands in one and not the other (the tour's reader had
 *  no inflate ceiling: a few kilobytes of somebody else's link could expand a thousandfold in the page).
 *  This file is that packing, once:
 *    · toBase64url / fromBase64url — bytes ⇄ the URL-safe alphabet (RFC 4648 §5), no padding
 *    · deflateRaw / inflateRaw     — bytes ⇄ raw DEFLATE (RFC 1951) through CompressionStream /
 *                                    DecompressionStream; `inflateRaw` stops READING at the ceiling it is
 *                                    handed and throws Error('too-large') — it never truncates
 *    · canCompress (private)       — whether the platform has both streams (packText / unpackText ask it)
 *  ⚠ BYTE-FOR-BYTE WHAT THE TWO WRITERS WROTE BEFORE. A link already sent is somebody's lesson: the tour's `t`
 *  and the briefing's `b` are the same bytes after this file as before it (tests/map-document-unify-checks
 *  holds a tour written by the old code, as text, against the new). The stream is fed the whole input in one
 *  write and then closed — DEFLATE's output depends on the bytes and on where it is flushed, and a
 *  CompressionStream flushes only at its close, so how the input was cut into chunks does not change it.
 *  ⚠ PURE: no DOM, no `window` — node (≥ 18) and every browser IntMap supports have both streams, `btoa`, `atob`.
 * ==========================================================================*/

/** bytes → base64url (no padding)
    @param {Uint8Array} bytes @returns {string} */
export function toBase64url(bytes) {
  let s = ''; const CH = 0x8000;   /* String.fromCharCode takes its arguments on the stack: 32 k at a time */
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, /** @type {any} */ (Array.from(bytes.subarray(i, i + CH))));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** base64url → bytes. Throws when the text is not base64 (atob's own refusal).
    @param {string} s @returns {Uint8Array} */
export function fromBase64url(s) {
  const b = atob(String(s).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

/** does this platform have both DEFLATE streams? */
const canCompress = () => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

/** run `bytes` through a transform stream; with `cap` > 0, stop reading past `cap` bytes and throw Error('too-large')
    @param {Uint8Array} bytes @param {{ writable: WritableStream, readable: ReadableStream }} stream @param {number} cap
    @returns {Promise<Uint8Array>} */
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

/** bytes → raw DEFLATE @param {Uint8Array} bytes @returns {Promise<Uint8Array>} */
export function deflateRaw(bytes) { return pipe(bytes, new CompressionStream('deflate-raw'), 0); }

/** raw DEFLATE → bytes, reading at most `cap` bytes of output (0 = no ceiling). Throws Error('too-large') past the
    ceiling, and the platform's own error when the bytes are not DEFLATE.
    @param {Uint8Array} bytes @param {number} cap @returns {Promise<Uint8Array>} */
export function inflateRaw(bytes, cap) { return pipe(bytes, new DecompressionStream('deflate-raw'), +cap || 0); }

/* ══ (data-studio) THE LETTER — a JSON document in a link ═══════════════════════════════════════════════
   'z' + base64url(deflate-raw(utf-8)) where the platform can compress, 'j' + base64url(utf-8) where it cannot. The
   classroom tour's `t` (js/tours.js) and the data studio's `ds` (js/data-studio.js) carry this; the tour's bytes are
   the ones it always wrote (tests/map-document-unify-checks holds an old tour against this). The reader takes the
   caller's ceiling — a link is somebody else's bytes. */
/** a JSON text → its link form ('z…' or 'j…') @param {string} json @returns {Promise<string>} */
export async function packText(json) {
  const bytes = new TextEncoder().encode(String(json));
  if (canCompress()) return 'z' + toBase64url(await deflateRaw(bytes));
  return 'j' + toBase64url(bytes);
}
/** a link form → the JSON text it carries, or null when it is not one (or inflates past `cap` bytes).
    @param {string} s @param {number} [cap] the most bytes the text may inflate to (0 / absent: no cap)
    @returns {Promise<string|null>} */
export async function unpackText(s, cap) {
  const t = String(s || ''); if (t.length < 2) return null;
  try {
    const bytes = fromBase64url(t.slice(1));
    if (t[0] === 'z') { if (!canCompress()) return null; return new TextDecoder().decode(await inflateRaw(bytes, +cap || 0)); }
    if (t[0] === 'j') { if (cap > 0 && bytes.length > cap) return null; return new TextDecoder().decode(bytes); }
    return null;
  } catch (_) { return null; }
}

/* ══ HOW LONG AN ADDRESS A BROWSER KEEPS ═══════════════════════════════════════════════════════════
   MEASURED in Chromium 153.0.8010.12 (Playwright's bundled build, 2026-10-03; the measurement is in
   dev-notes/2026-10-03-atlas-briefing.md): an address of 2,097,152 characters loads with its fragment
   intact, and 2,097,153 is refused (net::ERR_ABORTED) — Chromium's own URL ceiling (url/url_constants.h
   kMaxURLChars). It is the ONLY browser measured — Firefox and Safari were not, and a reader of this
   number says so instead of claiming a limit for them. It bounds a value carried in the FRAGMENT: the
   fragment is never sent to the server (RFC 3986 §3.5), so the host's 8,192-byte request limit
   (js/tours.js TOUR_REQUEST_LIMIT) does not apply to it. Expire when Chromium changes kMaxURLChars.
   正本: here. js/atlas-briefing-codec.js re-exports it under the same name. */
export const LINK_LIMIT_MEASURED = 2097152;
