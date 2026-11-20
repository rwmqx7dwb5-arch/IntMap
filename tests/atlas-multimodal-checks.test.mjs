/* IntMap · atlas-multimodal — a clip as one picture, and hands-free voice (checks)
 *  The video extractor runs against a fake <video> that implements the real event contract (seek -> 'seeked');
 *  the voice loop runs against a fake recogniser that implements start/stop/onend/onerror/onresult. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frameTimes, sheetLayout, fmtTime, caption, extract, VIDEO } from '../js/atlas-video-frames.js';
import { makeVoiceLoop, mountVoiceLoop, VOICE } from '../js/atlas-voice.js';
import { ATL_FILE } from '../js/atlas-attach.js';

VIDEO.seekMs = 30;   /* the fake never answers a failed seek; do not wait the production 6 s per frame */
function fakeVideo(opts) {
  const ls = {}, v = {
    muted: false, preload: '', duration: opts.duration, videoWidth: opts.w ?? 1280, videoHeight: opts.h ?? 720, _t: 0, seeks: [],
    addEventListener(n, f) { (ls[n] = ls[n] || []).push(f); }, removeEventListener(n, f) { ls[n] = (ls[n] || []).filter(x => x !== f); },
    setAttribute() {}, removeAttribute() {}, load() {},
    set currentTime(t) { v.seeks.push(t); v._t = t; if (!opts.failSeek || !opts.failSeek(t)) setTimeout(() => (ls.seeked || []).slice().forEach(f => f()), 0); },
    get currentTime() { return v._t; },
    set src(_) { setTimeout(() => (ls[opts.broken ? 'error' : 'loadedmetadata'] || []).slice().forEach(f => f()), 0); },
  };
  return v;
}
function fakeDoc(video, log) {
  return { createElement(tag) {
    if (tag === 'video') return video;
    const calls = log || [];
    return { width: 0, height: 0, getContext() { return { fillRect() {}, drawImage(...a) { calls.push(['draw', a[1], a[2]]); }, measureText: () => ({ width: 30 }), fillText() {}, set font(_) {}, set fillStyle(_) {}, set textBaseline(_) {} }; }, toDataURL: () => 'data:image/jpeg;base64,/9j/AAA=' };
  } };
}
const U = { createObjectURL: () => 'blob:x', revokeObjectURL() {} };

test('frameTimes: centres of equal slices, never 0 and never the end', () => {
  assert.deepEqual(frameTimes(12, 6), [1, 3, 5, 7, 9, 11]);
  assert.ok(frameTimes(60, 9).every(t => t > 0 && t < 60));
  assert.equal(frameTimes(60, 99).length, VIDEO.maxFrames);
  assert.deepEqual(frameTimes(NaN, 6), [0]);
});
test('sheetLayout / fmtTime', () => {
  assert.deepEqual(sheetLayout(6, 640, 360), { cols: 3, rows: 2, w: 1920, h: 720 });
  assert.deepEqual(sheetLayout(2, 640, 360), { cols: 2, rows: 1, w: 1280, h: 360 });
  assert.equal(fmtTime(75.25), '1:15.3'.replace('15.3', '15.3'));
});
test('extract: seeks every sample, draws each into its own tile, returns the times that actually arrived', async () => {
  const log = [], v = fakeVideo({ duration: 12 });
  const r = await extract({}, { doc: fakeDoc(v, log), URLApi: U, n: 6 });
  assert.deepEqual(v.seeks, [1, 3, 5, 7, 9, 11]);
  assert.deepEqual(log.map(c => [c[1], c[2]]), [[0, 0], [640, 0], [1280, 0], [0, 360], [640, 360], [1280, 360]]);
  assert.equal(r.times.length, 6); assert.equal(r.w, 1920); assert.equal(r.h, 720);
  assert.match(r.dataUrl, /^data:image\/jpeg;base64,/);
});
test('extract: a frame that never arrives is not claimed; no frames at all is null, not a black sheet', async () => {
  const half = await extract({}, { doc: fakeDoc(fakeVideo({ duration: 12, failSeek: t => t === 3 }), []), URLApi: U, n: 6 });
  assert.deepEqual(half.times, [1, 5, 7, 9, 11]);
  const none = await extract({}, { doc: fakeDoc(fakeVideo({ duration: 12, failSeek: () => true }), []), URLApi: U, n: 2 });
  assert.equal(none, null);
});
test('extract: an undecodable clip (error / no video track) is null', async () => {
  assert.equal(await extract({}, { doc: fakeDoc(fakeVideo({ duration: 5, broken: true }), []), URLApi: U }), null);
  assert.equal(await extract({}, { doc: fakeDoc(fakeVideo({ duration: 5, w: 0, h: 0 }), []), URLApi: U }), null);
});
test('caption says what the picture is, its order, and that there is no sound', () => {
  const c = caption('walk.mp4', { duration: 12, times: [1, 3] });
  assert.match(c, /walk\.mp4/); assert.match(c, /left to right/); assert.match(c, /NOT provided/); assert.match(c, /0:01\.0, 0:03\.0/);
});

test('attach.read: a video is read as a frame sheet by the injected encoder; without one it is still refused as media', async () => {
  const file = { name: 'walk.mp4', type: 'video/mp4', size: 5e6, arrayBuffer: async () => { throw new Error('bytes must not be read'); } };
  const d = await ATL_FILE.read(file, { encodeVideo: async () => ({ dataUrl: 'data:image/jpeg;base64,/9j/AAA=', times: [1, 2], duration: 3 }) });
  assert.equal(d.kind, 'video'); assert.match(d.caption, /walk\.mp4/); assert.deepEqual(d.times, [1, 2]);
  assert.equal((await ATL_FILE.read(file, { encodeVideo: async () => null })).why, 'video-undecodable');
  assert.equal((await ATL_FILE.read(file, { encodeVideo: async () => { throw new Error('x'); } })).why, 'video-undecodable');
  assert.equal((await ATL_FILE.read({ ...file, size: VIDEO.maxClipBytes + 1 }, { encodeVideo: async () => ({}) })).why, 'too-big');
  assert.equal((await ATL_FILE.read({ ...file, arrayBuffer: async () => new ArrayBuffer(8) }, {})).why, 'media');
});

/* ── voice ─────────────────────────────────────────────────────────────────────────────────────── */
function fakeSR() {
  const made = [];
  class SR {
    constructor() { made.push(this); this.started = 0; this.stopped = 0; }
    start() { this.started++; if (SR.throwOnStart) throw new Error('already'); }
    stop() { this.stopped++; setTimeout(() => this.onend && this.onend(), 0); }
    say(text, final = true) { this.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: text }], { isFinal: final })] }); }
  }
  SR.made = made; return SR;
}
function loopWith(over = {}) {
  const SR = fakeSR(), sent = [], states = [], timers = [];
  let busy = false, t = 0;
  const loop = makeVoiceLoop({ SR, locale: () => 'ja-JP', send: s => sent.push(s), busy: () => busy, onState: (s, w) => states.push([s, w]), now: () => t, timer: (f) => timers.push(f), ...over });
  return { loop, SR, sent, states, timers, setBusy: b => { busy = b; }, tick: ms => { t += ms; } };
}
test('voice: every finished utterance is sent as its own message; interim results are not', () => {
  const h = loopWith(); h.loop.start();
  const r = SR0(h); assert.equal(r.lang, 'ja-JP'); assert.equal(r.continuous, true);
  r.say('東京へ', false); assert.deepEqual(h.sent, []);
  r.say('東京へ'); r.say('ズームイン');
  assert.deepEqual(h.sent, ['東京へ', 'ズームイン']);
});
const SR0 = h => h.SR.made[h.SR.made.length - 1];
test('voice: what is said while Atlas is working is held and sent when the turn ends (not cancelling it)', () => {
  const h = loopWith(); h.loop.start(); const r = SR0(h);
  h.setBusy(true); r.say('地震を重ねて'); r.say('もっと拡大');
  assert.deepEqual(h.sent, []); assert.equal(h.loop.held(), 2);
  h.setBusy(false); h.loop.idle();
  assert.deepEqual(h.sent, ['地震を重ねて もっと拡大']);
});
test('voice: the recogniser ending by itself (silence) starts it again', () => {
  const h = loopWith(); h.loop.start(); const r = SR0(h);
  r.onend(); assert.equal(h.timers.length, 1); h.timers.shift()();
  assert.equal(h.SR.made.length, 2); assert.ok(h.loop.isOn());
});
test('voice: a refused microphone stops the loop for good and says why — it is not restarted', () => {
  const h = loopWith(); h.loop.start(); const r = SR0(h);
  r.onerror({ error: 'not-allowed' }); r.onend();
  assert.equal(h.loop.isOn(), false); assert.deepEqual(h.states.at(-1), ['off', 'not-allowed']); assert.equal(h.timers.length, 0);
});
test('voice: an engine that keeps ending at once gives up instead of spinning', () => {
  const h = loopWith(); h.loop.start();
  for (let i = 0; i < VOICE.giveUpAfter + 2 && h.loop.isOn(); i++) { SR0(h).onend(); const f = h.timers.shift(); if (f) f(); }
  assert.equal(h.loop.isOn(), false); assert.equal(h.states.at(-1)[1], 'unstable');
});
test('voice: stop() ends it, drops what was held, and the late end event does not restart', () => {
  const h = loopWith(); h.loop.start(); const r = SR0(h);
  h.setBusy(true); r.say('x'); h.loop.stop();
  assert.equal(h.loop.held(), 0); assert.equal(r.stopped, 1); r.onend(); assert.equal(h.timers.length, 0);
  h.setBusy(false); h.loop.idle(); assert.deepEqual(h.sent, []);
});
test('voice: the button is hidden when there is no recogniser, and toggles the loop when there is', () => {
  const mk = () => ({ style: {}, cls: new Set(), attrs: {}, classList: { toggle(c, on) { on ? this.s.add(c) : this.s.delete(c); }, s: null }, setAttribute(k, v) { this.attrs[k] = v; } });
  const b0 = mk(); assert.equal(mountVoiceLoop(b0, { SR: null }), null); assert.equal(b0.style.display, 'none');
  const b = mk(); b.classList.s = new Set(); const SR = fakeSR();
  const loop = mountVoiceLoop(b, { SR, locale: () => 'en-US', send() {}, busy: () => false });
  b.onclick(); assert.equal(loop.isOn(), true); assert.ok(b.classList.s.has('rec')); assert.equal(b.attrs['aria-pressed'], 'true');
  b.onclick(); assert.equal(loop.isOn(), false); assert.equal(b.attrs['aria-pressed'], 'false');
});
