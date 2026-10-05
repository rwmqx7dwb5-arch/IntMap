/* ============================================================================
 *  timelapse-hold-frame — EVERY FRAME OF A LAPSE IS IN THE FILE, AT THE TIME WE GAVE IT
 * ----------------------------------------------------------------------------
 *  The smoke test timelapse-video-export ② failed intermittently with 2 decoded frames for 2 instants + the hold.
 *  Measured 2026-10-05: MediaRecorder drops a frame its encoder has not finished when pause() comes (any frame — the
 *  first, a middle one, the hold), and nothing in it says when a frame is encoded. js/map-recorder.js now encodes with
 *  WebCodecs, stamps frame k at k/fps itself and writes the container itself (js/video-mux.js). What is held here, by
 *  EVALUATING the shipped modules (#R505) and reading back the bytes they write:
 *    ① the WebM holds one block per frame, at k/fps, key frames flagged, a cluster at each key frame, the track's
 *      frame length and the file's duration = frames/fps — the hold included;
 *    ② the MP4 holds one sample per frame, sized as encoded, at the offset the index names, the lengths adding up to
 *      frames/fps, the key frames in its sync table, the encoder's avcC in its sample entry;
 *    ③ neither container takes frames out of order or a stream that does not start on a key frame;
 *    ④ the WebCodecs writer gives the encoder frame k at k/fps for 1/fps, and refuses to write a file when the encoder
 *      returned fewer frames than it was given — a short file never looks complete;
 *    ⑤ the codecs are tried in the containers' order: MP4 first, WebM where MP4 cannot be written.
 *  The browser half — a real file through Chromium's encoder, decoded back — is timelapse-video-export in tests/smoke.spec.js.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const X = await import('../js/video-mux.js');
const M = await import('../js/map-recorder.js');

const FPS = 4, US = 1e6 / FPS;
const lapse = (n, keyEvery = 4) => Array.from({ length: n }, (_, k) => ({
  data: Uint8Array.from({ length: 10 + k }, (_, i) => (k * 31 + i) & 255), ts: Math.round(k * US), dur: Math.round(US), key: k % keyEvery === 0,
}));

/* ── a reader of EBML, enough to walk what muxWebM writes ── */
function vintAt(b, p, keepMarker) {
  let len = 1; while (len <= 8 && !(b[p] & (0x80 >> (len - 1)))) len++;
  let v = keepMarker ? b[p] : b[p] & (0xFF >> len);
  for (let i = 1; i < len; i++) v = v * 256 + b[p + i];
  return { v, len };
}
function ebml(b, p = 0, end = b.length) {
  const out = [];
  while (p < end) {
    const id = vintAt(b, p, true); const sz = vintAt(b, p + id.len, false); const at = p + id.len + sz.len;
    out.push({ id: id.v, at, size: sz.v, b }); p = at + sz.v;
  }
  return out;
}
const kids = (e) => ebml(e.b, e.at, e.at + e.size);
const one = (list, id) => list.find((e) => e.id === id);
const uint = (e) => { let v = 0; for (let i = 0; i < e.size; i++) v = v * 256 + e.b[e.at + i]; return v; };

test('① the WebM: one block per frame at k/fps, the hold included, and the duration is every frame\'s', () => {
  const chunks = lapse(9);   /* 8 instants + the hold */
  const file = X.muxWebM({ codec: 'vp9', width: 1080, height: 1920, chunks });
  const [head, seg] = ebml(file);
  assert.equal(head.id, 0x1A45DFA3); assert.equal(seg.id, 0x18538067);
  assert.equal(seg.at + seg.size, file.length, 'the segment states its own size');
  const S = kids(seg), info = kids(one(S, 0x1549A966)), entry = kids(one(kids(one(S, 0x1654AE6B)), 0xAE));
  assert.equal(uint(one(info, 0x2AD7B1)), 1e6, 'milliseconds');
  assert.equal(new DataView(file.buffer, one(info, 0x4489).at, 8).getFloat64(0), 9 * 1000 / FPS, 'duration = frames / fps');
  assert.equal(new TextDecoder().decode(file.subarray(one(entry, 0x86).at, one(entry, 0x86).at + one(entry, 0x86).size)), 'V_VP9');
  assert.equal(uint(one(entry, 0x23E383)), 1e9 / FPS, 'each frame lasts 1/fps — the last one too');
  const video = kids(one(entry, 0xE0));
  assert.deepEqual([uint(one(video, 0xB0)), uint(one(video, 0xBA))], [1080, 1920]);
  const clusters = S.filter((e) => e.id === 0x1F43B675);
  assert.equal(clusters.length, 3, 'a cluster at each key frame (0, 4, 8)');
  const blocks = [];
  for (const c of clusters) {
    const K = kids(c), base = uint(one(K, 0xE7));
    for (const sb of K.filter((e) => e.id === 0xA3)) {
      const rel = (file[sb.at + 1] << 8 | file[sb.at + 2]) << 16 >> 16;
      blocks.push({ t: base + rel, key: !!(file[sb.at + 3] & 0x80), track: file[sb.at] & 0x7F, data: Array.from(file.subarray(sb.at + 4, sb.at + sb.size)) });
    }
  }
  assert.deepEqual(blocks.map((x) => x.t), chunks.map((_, k) => k * 1000 / FPS), 'every frame, at the time it was given');
  assert.deepEqual(blocks.map((x) => x.key), chunks.map((c) => c.key));
  assert.deepEqual(blocks.map((x) => x.data), chunks.map((c) => Array.from(c.data)), 'the bytes as encoded');
  assert.ok(blocks.every((x) => x.track === 1));
  assert.equal(new TextDecoder().decode(file.subarray(one(entry, 0x86).at, one(entry, 0x86).at + 5)), 'V_VP9');
  const v8 = kids(one(kids(one(kids(ebml(X.muxWebM({ codec: 'vp8', width: 2, height: 2, chunks: lapse(1) }))[1]), 0x1654AE6B)), 0xAE));
  assert.equal(new TextDecoder().decode(v8.find((e) => e.id === 0x86).b.subarray(one(v8, 0x86).at, one(v8, 0x86).at + one(v8, 0x86).size)), 'V_VP8');
});

/* ── a reader of ISO boxes ── */
function boxes(b, p = 0, end = b.length) {
  const out = []; const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  while (p < end) { const size = dv.getUint32(p); assert.ok(size >= 8 && p + size <= end, 'a box of ' + size + ' bytes at ' + p); out.push({ type: new TextDecoder().decode(b.subarray(p + 4, p + 8)), at: p + 8, end: p + size, b, dv }); p += size; }
  return out;
}
const sub = (bx, skip = 0) => boxes(bx.b, bx.at + skip, bx.end);
const find = (list, path) => { let cur = list, bx = null; for (const t of path.split('/')) { if (bx) cur = sub(bx); bx = cur.find((x) => x.type === t); assert.ok(bx, 'no ' + t); } return bx; };

test('② the MP4: one sample per frame, at the offset the index names, lengths adding up to frames / fps', () => {
  const chunks = lapse(5), avcC = Uint8Array.of(1, 0x64, 0, 0x28, 0xFF, 0xE1, 0, 2, 0x67, 0x64, 1, 0, 2, 0x68, 0xEE);
  const file = X.muxMP4({ width: 1080, height: 1080, chunks, avcC });
  const top = boxes(file);
  assert.deepEqual(top.map((x) => x.type), ['ftyp', 'moov', 'mdat'], 'the index before the frames');
  assert.equal(top[2].end, file.length);
  const stbl = sub(find(top, 'moov/trak/mdia/minf/stbl'));
  const u = (bx, i) => bx.dv.getUint32(bx.at + i * 4);
  const mvhd = find(top, 'moov/mvhd'), mdhd = find(top, 'moov/trak/mdia/mdhd');
  assert.equal(u(mvhd, 4) / u(mvhd, 3), 5 / FPS, 'the movie lasts frames / fps — the hold has its time');
  assert.equal(u(mdhd, 4) / u(mdhd, 3), 5 / FPS);
  const stts = stbl.find((x) => x.type === 'stts'), stsz = stbl.find((x) => x.type === 'stsz'), stco = stbl.find((x) => x.type === 'stco'), stss = stbl.find((x) => x.type === 'stss');
  let total = 0, count = 0; for (let i = 0; i < u(stts, 1); i++) { count += u(stts, 2 + i * 2); total += u(stts, 2 + i * 2) * u(stts, 3 + i * 2); }
  assert.equal(count, 5); assert.equal(total, u(mdhd, 4), 'the sample lengths add up to the track');
  assert.equal(u(stsz, 2), 5);
  const sizes = Array.from({ length: 5 }, (_, i) => u(stsz, 3 + i));
  assert.deepEqual(sizes, chunks.map((c) => c.data.length));
  const off = u(stco, 2);
  assert.equal(off, top[2].at, 'the chunk offset is where the frames start');
  let p = off; chunks.forEach((c, i) => { assert.deepEqual(Array.from(file.subarray(p, p + sizes[i])), Array.from(c.data), 'frame ' + i); p += sizes[i]; });
  assert.deepEqual(Array.from({ length: u(stss, 1) }, (_, i) => u(stss, 2 + i)), [1, 5], 'key frames 0 and 4, numbered from 1');
  const stsd = stbl.find((x) => x.type === 'stsd'), avc1 = sub(stsd, 8)[0];
  assert.equal(avc1.type, 'avc1');
  assert.deepEqual([avc1.dv.getUint16(avc1.at + 24), avc1.dv.getUint16(avc1.at + 26)], [1080, 1080]);
  const box = sub(avc1, 78)[0];
  assert.equal(box.type, 'avcC'); assert.deepEqual(Array.from(file.subarray(box.at, box.end)), Array.from(avcC));
  const tkhd = find(top, 'moov/trak/tkhd');
  assert.deepEqual([u(tkhd, 19) / 65536, u(tkhd, 20) / 65536], [1080, 1080]);
});

test('③ neither container takes frames out of order, or a stream that does not start on a key frame', () => {
  const c = lapse(3); [c[1], c[2]] = [c[2], c[1]];
  assert.throws(() => X.muxWebM({ codec: 'vp9', width: 2, height: 2, chunks: c }), /not after/);
  assert.throws(() => X.muxMP4({ width: 2, height: 2, chunks: c, avcC: Uint8Array.of(1) }), /not after/);
  const d = lapse(2); d[0].key = false;
  assert.throws(() => X.muxWebM({ codec: 'vp9', width: 2, height: 2, chunks: d }), /key frame/);
  assert.throws(() => X.muxMP4({ width: 2, height: 2, chunks: lapse(2), avcC: new Uint8Array(0) }), /avcC/);
});

/* a VideoEncoder that does what it is told — or loses the frame numbered `drop` */
function fakeCodecs(drop) {
  const given = [];
  class VideoFrame { constructor(src, o) { this.timestamp = o.timestamp; this.duration = o.duration; } close() { this.closed = true; } }
  class VideoEncoder {
    constructor(o) { this.o = o; this.encodeQueueSize = 0; this.pending = []; }
    configure(c) { this.config = c; }
    encode(f, opt) {
      given.push({ ts: f.timestamp, dur: f.duration, key: opt.keyFrame });
      if (given.length - 1 === drop) return;
      const first = given.length === 1, data = Uint8Array.of(given.length, 1, 2, 3);
      this.pending.push(() => this.o.output({ byteLength: data.length, copyTo: (d) => d.set(data), timestamp: f.timestamp, duration: f.duration, type: opt.keyFrame ? 'key' : 'delta' },
        first ? { decoderConfig: { description: Uint8Array.of(1, 0x64, 0, 0x28) } } : undefined));
    }
    async flush() { this.pending.splice(0).forEach((f) => f()); }
    close() { this.closed = true; }
  }
  return { VideoFrame, VideoEncoder, given };
}

test('④ the writer stamps frame k at k/fps for 1/fps, and refuses a file the encoder returned short', async () => {
  const saved = { VideoFrame: globalThis.VideoFrame, VideoEncoder: globalThis.VideoEncoder };
  try {
    for (const [ext, codec] of [['webm', 'vp09.00.40.08'], ['mp4', 'avc1.640028']]) {
      const F = fakeCodecs(-1); Object.assign(globalThis, { VideoFrame: F.VideoFrame, VideoEncoder: F.VideoEncoder });
      const w = M.codecWriter({ ext, type: 'video/' + ext, codec }, {}, { w: 1080, h: 1920 }, FPS);
      assert.equal(w.via, 'webcodecs');
      for (let k = 0; k < 3; k++) await w.put();
      const blob = await w.finish();
      assert.equal(blob.type, 'video/' + ext);
      assert.deepEqual(F.given.map((g) => [g.ts, g.dur]), [[0, US], [US, US], [2 * US, US]], 'frame k at k/fps, for 1/fps');
      assert.equal(F.given[0].key, true, 'the file starts on a key frame');
    }
    const F = fakeCodecs(2); Object.assign(globalThis, { VideoFrame: F.VideoFrame, VideoEncoder: F.VideoEncoder });
    const w = M.codecWriter({ ext: 'webm', type: 'video/webm', codec: 'vp09.00.40.08' }, {}, { w: 1080, h: 1920 }, FPS);
    for (let k = 0; k < 3; k++) await w.put();
    await assert.rejects(() => w.finish(), /returned 2 frames for 3/, 'a lost hold frame must fail the recording, not shorten it');
  } finally { Object.assign(globalThis, saved); }
});

test('⑤ the codecs are tried in the containers\' order: MP4 first, WebM where MP4 cannot be written', async () => {
  assert.deepEqual(await M.pickCodec(undefined, async () => true), { ext: 'mp4', type: 'video/mp4;codecs=avc1.640028', codec: 'avc1.640028' });
  assert.equal((await M.pickCodec(undefined, async (c) => !c.startsWith('avc1'))).codec, 'vp09.00.40.08');
  assert.equal((await M.pickCodec('webm', async (c) => c === 'vp8')).codec, 'vp8');
  assert.equal(await M.pickCodec('mp4', async (c) => !c.startsWith('avc1')), null);
  assert.equal(await M.pickCodec(undefined, async () => { throw new Error('no'); }), null);
});
