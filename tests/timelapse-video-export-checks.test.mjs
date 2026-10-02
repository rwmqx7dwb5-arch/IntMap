/* ============================================================================
 *  timelapse-video-export — THE TIME-LAPSE AS A FILE, THE COMPARISON AS ONE PICTURE
 * ----------------------------------------------------------------------------
 *  What is held here, by EVALUATING the shipped modules (#R505 — reading source cannot see behaviour):
 *    ① js/time-lapse.js hands every drawn frame — and only those — to a recording's sink, once per instant,
 *      without the screen dwell; the sink hears how the run ended (the end, a hand on the clock, a run replacing it),
 *      and a recording neither loops nor starts anywhere but at its start. `total` counts the instants the run holds.
 *    ② js/map-recorder.js `layoutFrame`: in each of the three frames, with one pane and with two, the instant label
 *      and every word of the credit are inside the frame, nothing overlaps, the credit is at least its floor size —
 *      and a credit too long for four lines grows the band instead of being cut.
 *    ③ `drawnCredits`: the credit of what is DRAWN (a hidden layer, one outside its zoom range, or an empty collection credits nothing),
 *      as text (markup and entities read), with a credit another one contains folded into it.
 *    ④ `pickMime` / `sizeKey`: MP4 first, WebM where MP4 cannot be recorded, nothing where neither can; the sizes a
 *      reader or Atlas names.
 *    ⑤ without MediaRecorder (Node, or a browser that cannot record) and without an open comparison window, the export
 *      refuses with the reason — and the lapse does not play for a recording that never started.
 *  The browser half — a recording that really decodes, with as many frames as instants plus the hold, the credit band
 *  in the decoded pixels, and the comparison picture — is the timelapse-video-export test in tests/smoke.spec.js.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { importModule, fileUrl } from './helpers/import-module.mjs';

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;

const L = await importModule('js/time-lapse.js');
const T = (await import(fileUrl('js/chronos.js'))).IntMapTime;
const M = await import('../js/map-recorder.js');

const until = async (fn, ms) => { const t0 = Date.now(); while (!fn() && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 20)); return fn(); };

test('① a recording is handed every drawn frame once, at its own pace, and hears how the run ended', async () => {
  const seen = [], ends = [];
  const sink = { async frame(s) { seen.push(T.when().getUTCFullYear()); assert.equal(s.recording, true); return true; }, end(r) { ends.push(r); } };
  T.setYear(1901, { source: 'ui' });   /* inside the range: a recording still starts at its start */
  const t0 = Date.now();
  let s = L.startLapse({ from: 1900, to: 1903, unit: 'year', fps: 0.5, loop: true, sink });
  assert.equal(s.error, undefined, JSON.stringify(s));
  assert.equal(s.total, 4, 'the run 1900→1903 holds four instants');
  assert.ok(await until(() => !L.lapseState().playing, 5000), 'the recording run did not reach its end');
  assert.deepEqual(seen, [1900, 1901, 1902, 1903], 'a frame was skipped, repeated, or the run looped');
  assert.deepEqual(ends, ['end']);
  /* at ½ frame a second the screen dwell is 2 s a frame — a sink replaces it, it is not added to it */
  assert.ok(Date.now() - t0 < 4000, 'the screen dwell was applied on top of the sink: ' + (Date.now() - t0) + ' ms');
  assert.equal(L.lapseState().recording, false, 'the sink outlived its run');
  /* a hand on the clock ends the recording, and it is told so */
  ends.length = 0;
  const slow = { frame: () => new Promise((r) => setTimeout(() => r(true), 200)), end: (r) => ends.push(r) };
  L.startLapse({ from: 1800, to: 1850, unit: 'year', fps: 4, sink: slow });
  await new Promise((r) => setTimeout(r, 60));
  T.setYear(1960, { source: 'ui' });
  assert.deepEqual(ends, ['clock-moved']);
  /* a run started over a recording ends the recording first */
  ends.length = 0;
  L.startLapse({ from: 1800, to: 1850, unit: 'year', fps: 4, sink: slow });
  L.startLapse({ from: 1700, to: 1710, unit: 'year', fps: 4 });
  assert.deepEqual(ends, ['replaced']);
  L.stopLapse('stopped');
  /* a sink that cannot film stops the run, with that reason */
  ends.length = 0;
  L.startLapse({ from: 1900, to: 1950, unit: 'year', fps: 4, sink: { frame: async () => false, end: (r) => ends.push(r) } });
  assert.ok(await until(() => !L.lapseState().playing, 3000));
  assert.deepEqual(ends, ['record-failed']);
  /* `total` for days and hours */
  assert.equal(L.startLapse({ from: '2001-03-01', to: '2001-03-31', unit: 'day', step: 10, fps: 4 }).total, 4);
  L.stopLapse('stopped');
  assert.equal(L.startLapse({ from: '2001-03-01T00:00:00Z', to: '2001-03-01T05:00:00Z', unit: 'hour', step: 1, fps: 4 }).total, 6);
  L.stopLapse('stopped');
  T.setNow({ source: 'ui' });
});

/* a stand-in for text width: 0.6 em a character — wide enough that a long credit really wraps */
const measure = (s, font) => String(s).length * 0.6 * +/(\d+(?:\.\d+)?)px/.exec(font)[1];
const inside = (b, W, H) => b.x >= 0 && b.y >= 0 && b.x + b.w <= W + 0.5 && b.y + b.h <= H + 0.5;
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

test('② every frame size: the instant and every word of the credit are inside, readable, and nothing overlaps', () => {
  const brand = { name: 'IntMap', link: 'example.org/IntMap' };
  const short = ['© CARTO © OpenStreetMap', 'CShapes 2.0 (Schvitz et al.) · OpenHistoricalMap (CC0)'];
  const long = Array.from({ length: 14 }, (_, i) => 'Source number ' + (i + 1) + ' © a publisher with a long name, CC BY 4.0');
  for (const key of Object.keys(M.SIZES)) {
    const { w, h } = M.SIZES[key];
    for (const panes of [[{ label: '1914' }], [{ label: '1914' }, { label: 'Today' }]]) {
      for (const credits of [short, long]) {
        const F = M.layoutFrame({ w, h, panes, credits, brand }, measure);
        const where = key + ' · ' + panes.length + ' pane(s) · ' + credits.length + ' credits';
        /* every word of every credit is on a line — nothing was cut */
        const words = credits.join(' · ').split(' ').filter(Boolean);
        assert.deepEqual(F.credit.lines.map((l) => l.text).join(' ').split(' ').filter(Boolean), words, where + ': the credit lost words');
        assert.ok(F.credit.px >= 20 * F.u, where + ': the credit is smaller than its floor (' + F.credit.px + ' px)');
        for (const l of F.credit.lines) assert.ok(inside(l, w, h) && l.w <= w - 2 * F.pad + 0.5, where + ': a credit line leaves the frame');
        assert.ok(inside(F.band, w, h) && inside(F.brand.name, w, h) && inside(F.brand.link, w, h), where + ': the band or the wordmark leaves the frame');
        assert.ok(F.brand.link.x >= F.brand.name.x + F.brand.name.w, where + ': the link overlaps the wordmark');
        F.panes.forEach((p, i) => {
          assert.equal(p.label.text, panes[i].label);
          assert.ok(inside(p.label.box, w, h), where + ': the instant leaves the frame');
          const r = p.rect;
          assert.ok(p.label.box.x + p.label.box.w <= r.x + r.w && p.label.box.y + p.label.box.h <= r.y + r.h, where + ': the instant leaves its pane');
          assert.ok(p.label.px >= 48 * F.u, where + ': the instant is too small to read (' + p.label.px + ' px)');
          assert.ok(!overlap(p.label.box, F.band), where + ': the instant is under the band');
        });
        if (credits === long) assert.ok(F.credit.lines.length > 4 && F.credit.px === Math.round(20 * F.u), where + ': a long credit must shrink to its floor and then grow the band');
      }
    }
  }
});

test('③ the credit is the credit of what is drawn, as text, folded', () => {
  const style = {
    sources: {
      base: { type: 'raster', attribution: '&copy; <a href="https://carto.com/attributions">CARTO</a>' },
      osm: { type: 'vector', attribution: '<a href="https://www.openstreetmap.org/copyright">&copy;&nbsp;OpenStreetMap</a> contributors' },
      borders: { type: 'geojson', attribution: 'CShapes 2.0 (Schvitz et al.)' },
      off: { type: 'geojson', attribution: 'A hidden layer' },
      far: { type: 'geojson', attribution: 'Only from zoom 9' },
      dem: { type: 'raster-dem', attribution: 'Terrain &amp; relief' },
      none: { type: 'geojson' },
      bare: { type: 'geojson', attribution: 'Nothing in it at this instant', data: { type: 'FeatureCollection', features: [] } },
      url: { type: 'geojson', attribution: 'Data held at a URL', data: 'https://example.org/x.geojson' },
    },
    layers: [
      { id: 'bg', type: 'background' },
      { id: 'b', type: 'raster', source: 'base' },
      { id: 'o', type: 'line', source: 'osm' },
      { id: 'o2', type: 'fill', source: 'osm' },
      { id: 'c', type: 'line', source: 'borders' },
      { id: 'h', type: 'fill', source: 'off', layout: { visibility: 'none' } },
      { id: 'z', type: 'fill', source: 'far', minzoom: 9 },
      { id: 'n', type: 'fill', source: 'none' },
      { id: 'e', type: 'fill', source: 'bare' },
      { id: 'u', type: 'fill', source: 'url' },
    ],
    terrain: { source: 'dem' },
  };
  const got = M.drawnCredits(style, 3, ['© CARTO © OpenStreetMap']);
  assert.deepEqual(got, ['© CARTO © OpenStreetMap', '© OpenStreetMap contributors', 'CShapes 2.0 (Schvitz et al.)', 'Data held at a URL', 'Terrain & relief'],
    'the credit names what is not drawn (a hidden layer, an empty collection), misses what is, keeps markup, or does not fold «© CARTO» into the page\'s base credit');
  assert.ok(M.drawnCredits(style, 10, []).includes('Only from zoom 9'), 'a layer inside its zoom range credits its source');
  assert.deepEqual(M.drawnCredits(null, 0, []), [], 'no style, nothing to credit');
  /* the credit is READ as text, not rewritten as markup: a script body is not text, a nested or unclosed tag leaves nothing
     behind, and a «<» that opens no tag is a character */
  assert.deepEqual(M.drawnCredits(null, 0, ['<script>alert(1)</script>© A', '<b onclick="x>y">B</b> &lt;C&gt; 1 < 2', '<a href=x>D<br>E', 'F <unclosed']),
    ['© A', 'B <C> 1 < 2', 'D E', 'F']);
  /* a split tag is read the way a browser reads it — «<scr<script>» is ONE tag named scr<script — so what is left is text
     that names no element */
  assert.deepEqual(M.drawnCredits(null, 0, ['<scr<script>ipt>x</script>© A']), ['ipt>x© A']);
});

test('④ the container: MP4 first, WebM where MP4 cannot be recorded; the sizes as a reader names them', () => {
  assert.equal(M.pickMime(undefined, () => true).ext, 'mp4');
  assert.equal(M.pickMime(undefined, (t) => t.startsWith('video/webm')).ext, 'webm');
  assert.equal(M.pickMime('webm', () => true).ext, 'webm');
  assert.equal(M.pickMime('mp4', (t) => t === 'video/mp4').type, 'video/mp4', 'a browser that names no MP4 codec (Safari) is offered the bare container');
  assert.equal(M.pickMime('mp4', (t) => t.startsWith('video/webm')), null);
  assert.equal(M.pickMime(undefined, () => false), null);
  assert.deepEqual(['16:9', 'landscape', '1920x1080', '9:16', 'vertical', '縦長', 'square', '', 'anything'].map(M.sizeKey),
    ['landscape', 'landscape', 'landscape', 'portrait', 'portrait', 'portrait', 'square', 'square', 'square']);
  assert.deepEqual(Object.values(M.SIZES).map((s) => [s.w, s.h]), [[1080, 1080], [1920, 1080], [1080, 1920]]);
});

test('⑤ without a recorder or a comparison window, the export says so instead of producing nothing', async () => {
  /* Node has no MediaRecorder — the state a browser that cannot record is in */
  const r = M.recordLapse({ from: 1900, to: 1903, unit: 'year' });
  assert.equal(r.error, 'unsupported'); assert.equal(r.phase, 'failed');
  assert.deepEqual([M.recorderState().phase, M.recorderState().error], ['failed', 'unsupported'], 'the panel reads a state that does not say why');
  assert.equal(L.lapseState().playing, false, 'a recording that could not start played the lapse anyway');
  assert.equal((await M.compareImage({ size: 'landscape' })).error, 'no-compare');
});
