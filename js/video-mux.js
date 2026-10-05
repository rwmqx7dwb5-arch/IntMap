// @ts-check
/* ============================================================================
 *  IntMap · js/video-mux.js — ENCODED FRAMES INTO A FILE: WebM and MP4  (timelapse-hold-frame)
 * ----------------------------------------------------------------------------
 *  js/map-recorder.js encodes a time-lapse with WebCodecs (`VideoEncoder`): it decides every frame's timestamp and
 *  length itself and waits for the encoder to hand back every frame (`flush`). What that leaves is putting the
 *  encoded frames into a container a player opens — this file, and nothing else: no encoding, no DOM, no clock.
 *
 *  ⚠ WHY NOT MediaRecorder. MediaRecorder stamps a frame with the wall clock and is told to leave the map's waits out
 *    by pause()/resume(); a frame the encoder has not finished when pause() comes is dropped. Measured 2026-10-05 in the
 *    smoke suite's shared page (8 runs, 2 instants + the hold, VP9 1080×1920): 5 files had 2 frames of 3, and holding the
 *    pause until the frame had been SEEN on the canvas track made it no better (6 of 10) — the frame had reached the
 *    track and was still in the encoder. Nothing in MediaRecorder says a frame was encoded (its MP4 output arrives only
 *    at stop; a canvas track's `stats` is null), so it cannot be waited for. Here the count and the times are ours.
 *
 *  A chunk is `{ data, ts, dur, key }` — the encoded bytes, its presentation time and length in microseconds, and
 *  whether it is a key frame — in decode order, which for these streams is presentation order (`assertOrdered`).
 *  Every frame of a lapse lasts the same 1/fps, so the WebM track declares it (DefaultDuration) and the last frame —
 *  the hold — keeps its own time on screen, as the MP4's sample table states each frame's length.
 * ==========================================================================*/

/** @typedef {{ data: Uint8Array, ts: number, dur: number, key: boolean }} Chunk */

const te = new TextEncoder();
/** @param {Uint8Array[]} parts */
function concat(parts) {
  let n = 0; for (const p of parts) n += p.length;
  const o = new Uint8Array(n); let i = 0;
  for (const p of parts) { o.set(p, i); i += p.length; }
  return o;
}
/** an unsigned integer, big-endian, in as few bytes as it needs (≥ 1) */
function uintBE(v) {
  const b = []; let x = Math.floor(v);
  do { b.unshift(x % 256); x = Math.floor(x / 256); } while (x > 0);
  return Uint8Array.from(b);
}
/** chunks in decode order whose presentation times only go forward — what both containers below assume */
function assertOrdered(/** @type {Chunk[]} */ chunks) {
  for (let i = 1; i < chunks.length; i++) {
    if (!(chunks[i].ts > chunks[i - 1].ts)) throw new Error('video-mux: frame ' + i + ' is not after frame ' + (i - 1) + ' (' + chunks[i - 1].ts + ' → ' + chunks[i].ts + ' µs)');
  }
  if (chunks.length && !chunks[0].key) throw new Error('video-mux: the first frame is not a key frame');
}

/* ══ WebM (Matroska / EBML) ═══════════════════════════════════════════════════════════════════════════════
   The element ids are the Matroska specification's (RFC 9559); the clock is milliseconds (TimecodeScale 1 000 000 ns).
   A cluster starts at each key frame, and where a block's time would not fit its signed 16-bit offset. */
/** an element's size as an EBML variable-length integer, in the fewest bytes */
function vint(n) {
  for (let len = 1; len <= 8; len++) {
    if (n < 2 ** (7 * len) - 1) {
      const o = new Uint8Array(len); let v = n;
      for (let i = len - 1; i >= 0; i--) { o[i] = v % 256; v = Math.floor(v / 256); }
      o[0] |= 0x80 >> (len - 1);
      return o;
    }
  }
  throw new Error('video-mux: an element of ' + n + ' bytes');
}
const ebml = (/** @type {number} */ id, /** @type {Uint8Array[]} */ ...body) => { const b = concat(body); return concat([uintBE(id), vint(b.length), b]); };
const eU = (/** @type {number} */ id, /** @type {number} */ v) => ebml(id, uintBE(v));
const eS = (/** @type {number} */ id, /** @type {string} */ s) => ebml(id, te.encode(s));
const eF = (/** @type {number} */ id, /** @type {number} */ v) => { const b = new Uint8Array(8); new DataView(b.buffer).setFloat64(0, v); return ebml(id, b); };

/**
 * muxWebM({ codec: 'vp9'|'vp8', width, height, chunks, app? }) → Uint8Array
 * @param {{ codec: string, width: number, height: number, chunks: Chunk[], app?: string }} o
 */
export function muxWebM(o) {
  const chunks = o.chunks; assertOrdered(chunks);
  const id = o.codec === 'vp8' ? 'V_VP8' : 'V_VP9';
  const frameNs = chunks.length ? Math.round(chunks[0].dur * 1000) : 0;
  const last = chunks[chunks.length - 1];
  const durMs = last ? (last.ts + last.dur) / 1000 : 0;
  const app = o.app || 'IntMap';
  const head = ebml(0x1A45DFA3, eU(0x4286, 1), eU(0x42F7, 1), eU(0x42F2, 4), eU(0x42F3, 8), eS(0x4282, 'webm'), eU(0x4287, 4), eU(0x4285, 2));
  const info = ebml(0x1549A966, eU(0x2AD7B1, 1000000), eS(0x4D80, app), eS(0x5741, app), eF(0x4489, durMs));
  const track = ebml(0xAE, eU(0xD7, 1), eU(0x73C5, 1), eU(0x83, 1), eS(0x86, id), eU(0x9C, 0),
    ...(frameNs ? [eU(0x23E383, frameNs)] : []), ebml(0xE0, eU(0xB0, o.width), eU(0xBA, o.height)));
  const tracks = ebml(0x1654AE6B, track);
  /** @type {Uint8Array[]} */ const clusters = [];
  /** @type {Uint8Array[]} */ let blocks = []; let base = -1;
  const close = () => { if (base >= 0) clusters.push(ebml(0x1F43B675, eU(0xE7, base), ...blocks)); blocks = []; };
  for (const c of chunks) {
    const t = Math.round(c.ts / 1000);
    if (base < 0 || c.key || t - base > 32767) { close(); base = t; }
    const rel = t - base, h = new Uint8Array(4);
    h[0] = 0x81; h[1] = (rel >> 8) & 0xFF; h[2] = rel & 0xFF; h[3] = c.key ? 0x80 : 0x00;
    blocks.push(ebml(0xA3, h, c.data));
  }
  close();
  return concat([head, ebml(0x18538067, info, tracks, ...clusters)]);
}

/* ══ MP4 (ISO/IEC 14496-12 and -15) ═══════════════════════════════════════════════════════════════════════
   H.264 in the AVC form the encoder was asked for (length-prefixed NAL units; the `avcC` record is the encoder's
   decoderConfig.description). The movie index (`moov`) is written before the frames, so a player starts at once.
   The clock is 90 000 ticks a second (the customary video timescale: whole ticks for every rate a lapse plays at —
   js/time-lapse.js LAPSE_RATES, 0.5 to 4 frames a second — and 13 hours before a 32-bit duration overflows; another
   rate is rounded at each frame's boundary, so the lengths still add up to the whole). One chunk holds every frame. */
const TS = 90000;
const u32 = (/** @type {number} */ v) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v >>> 0); return b; };
const u16 = (/** @type {number} */ v) => Uint8Array.of((v >> 8) & 0xFF, v & 0xFF);
const zeros = (/** @type {number} */ n) => new Uint8Array(n);
const box = (/** @type {string} */ type, /** @type {Uint8Array[]} */ ...body) => { const b = concat(body); return concat([u32(8 + b.length), te.encode(type), b]); };
const fullBox = (/** @type {string} */ type, /** @type {number} */ flags, /** @type {Uint8Array[]} */ ...body) => box(type, u32(flags & 0xFFFFFF), ...body);
const MATRIX = concat([0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000].map(u32));

/**
 * muxMP4({ width, height, chunks, avcC }) → Uint8Array
 * @param {{ width: number, height: number, chunks: Chunk[], avcC: Uint8Array }} o
 */
export function muxMP4(o) {
  const chunks = o.chunks; assertOrdered(chunks);
  if (!o.avcC || !o.avcC.length) throw new Error('video-mux: no avcC record from the encoder');
  const ticks = (/** @type {number} */ us) => Math.round(us * TS / 1e6);
  /* each sample's length in ticks, from rounded boundaries so the lengths add up to the whole */
  const deltas = chunks.map((c) => ticks(c.ts + c.dur) - ticks(c.ts));
  const duration = chunks.length ? ticks(chunks[chunks.length - 1].ts + chunks[chunks.length - 1].dur) - ticks(chunks[0].ts) : 0;
  /** @type {[number, number][]} */ const runs = [];
  for (const d of deltas) { const r = runs[runs.length - 1]; if (r && r[1] === d) r[0]++; else runs.push([1, d]); }
  const keys = chunks.map((c, i) => (c.key ? i + 1 : 0)).filter(Boolean);
  const W = o.width, H = o.height;
  const moov = (/** @type {number} */ offset) => box('moov',
    fullBox('mvhd', 0, u32(0), u32(0), u32(TS), u32(duration), u32(0x00010000), u16(0x0100), zeros(10), MATRIX, zeros(24), u32(2)),
    box('trak',
      fullBox('tkhd', 3, u32(0), u32(0), u32(1), u32(0), u32(duration), zeros(8), u16(0), u16(0), u16(0), u16(0), MATRIX, u32(W * 65536), u32(H * 65536)),
      box('mdia',
        fullBox('mdhd', 0, u32(0), u32(0), u32(TS), u32(duration), u16(0x55C4), u16(0)),
        fullBox('hdlr', 0, u32(0), te.encode('vide'), zeros(12), te.encode('VideoHandler'), zeros(1)),
        box('minf',
          fullBox('vmhd', 1, u16(0), zeros(6)),
          box('dinf', fullBox('dref', 0, u32(1), fullBox('url ', 1))),
          box('stbl',
            fullBox('stsd', 0, u32(1), box('avc1', zeros(6), u16(1), zeros(16), u16(W), u16(H), u32(0x00480000), u32(0x00480000), u32(0), u16(1), zeros(32), u16(0x0018), u16(0xFFFF), box('avcC', o.avcC))),
            fullBox('stts', 0, u32(runs.length), ...runs.map(([n, d]) => concat([u32(n), u32(d)]))),
            fullBox('stss', 0, u32(keys.length), ...keys.map(u32)),
            fullBox('stsc', 0, u32(1), u32(1), u32(chunks.length), u32(1)),
            fullBox('stsz', 0, u32(0), u32(chunks.length), ...chunks.map((c) => u32(c.data.length))),
            fullBox('stco', 0, u32(1), u32(offset)))))));
  const ftyp = box('ftyp', te.encode('isom'), u32(512), te.encode('isom'), te.encode('iso2'), te.encode('avc1'), te.encode('mp41'));
  const size = moov(0).length;   /* the offset is a fixed-width field: the index is as long whatever it holds */
  const data = concat(chunks.map((c) => c.data));
  return concat([ftyp, moov(ftyp.length + size + 8), u32(8 + data.length), te.encode('mdat'), data]);
}
