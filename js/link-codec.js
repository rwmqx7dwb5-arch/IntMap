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
 *    · canCompress                 — whether the platform has both streams
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
export const canCompress = () => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

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
