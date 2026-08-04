/* (#R185) Node-side checks for this round's changes that do not need a browser.
 *
 * Everything here pins a decision that was made from a MEASUREMENT, so the test states the
 * measurement rather than the code: what the framing ladder answers for a place, what the bundled
 * catalogue has to contain to be usable at all, and that the renderer changes kept the contracts
 * the earlier rounds' tests depend on. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = process.cwd();
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* js/place-framing.js publishes window.IntMapPlaceFraming and touches nothing else, which is what
   makes it testable without a browser — see its own header. */
const framing = (() => {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(read('js/place-framing.js'), ctx);
  return ctx.window.IntMapPlaceFraming;
})();

test('R185 framing: a compact country keeps its own footprint', () => {
  /* MEASURED from Nominatim: Monaco's administrative extent is 0.124° x 0.235° and its point sits
     at fy = 0.92 — near the north edge. #R183's "the point must be in the middle 60 %" rule threw
     that box away and fell back to the flat `country` zoom of 4.4, i.e. the whole Mediterranean in
     answer to "Monaco". The rule is looking for an OUTLYING TERRITORY, and an outlier is a
     DISTANCE: Tokyo's point is 6.3° from the centre of its extent, Monaco's is 0.10°. */
  const monaco = { class: 'boundary', type: 'administrative', addresstype: 'country',
    boundingbox: ['43.7247', '43.7519', '7.4090', '7.5333'], lat: '43.7495', lon: '7.4128' };
  const fr = framing.framingFor(monaco, null);
  assert.equal(fr.cls, 'country');
  assert.ok(fr.bounds && !fr.bounds.huge, 'Monaco must be framed by its own extent, not by the country zoom');
});

test('R185 framing: an outlying territory still throws the extent away', () => {
  /* Tokyo Metropolis reaches 1,000 km south to Ogasawara; framing that real extent centres the map
     in open ocean with the city a speck at the top (#R183). The absolute-distance gate must not
     have let this one back in. */
  const tokyo = { class: 'boundary', type: 'administrative', addresstype: 'province',
    boundingbox: ['20.2531', '35.8984', '135.8548', '153.9868'], lat: '35.6764', lon: '139.6500' };
  const fr = framing.framingFor(tokyo, null);
  assert.equal(fr.bounds, null, 'an extent driven by an outlying territory is not a frame');
});

test('R185 framing: the classes that fell through to the town-sized default', () => {
  /* MEASURED: both are mapped in OSM as single NODES, so there is no extent and the class IS the
     answer — and neither class existed, so a 2,300 km reef and a 446 km canyon were both framed at
     the 12.2 default, an 8 km window. */
  const reef = framing.placeClass({ class: 'natural', type: 'reef' }, null);
  const canyon = framing.placeClass({ class: 'natural', type: 'valley' }, null);
  assert.equal(reef, 'reef');
  assert.equal(canyon, 'valley');
  const z = framing.zoomTable();
  assert.ok(z.reef < 10 && z.valley < 11, 'a reef and a canyon are not town-sized');
  /* …and an unnamed natural feature is still a natural feature, not a default-sized one */
  assert.equal(framing.placeClass({ class: 'natural', type: 'moraine' }, null), 'natural');
  assert.ok(z.natural < framing.defaultZoom());
});

test('R185 framing: a protected area is not just "a boundary"', () => {
  assert.equal(framing.placeClass({ class: 'boundary', type: 'protected_area' }, null), 'reserve');
  assert.equal(framing.placeClass({ class: 'leisure', type: 'nature_reserve' }, null), 'reserve');
  /* the generic boundary answer is unchanged for everything else */
  assert.equal(framing.placeClass({ class: 'boundary', type: 'administrative' }, null), 'region');
});

test('R185 satellites: the bundled catalogue is real, current and parseable', () => {
  const meta = JSON.parse(read('data/tle/catalogue.json'));
  const text = read('data/tle/catalogue.tle');
  assert.ok(meta.objects > 500, 'a fallback catalogue of a few dozen objects is not a fallback');
  assert.ok(meta.source, 'the snapshot has to say where it came from');
  const lines = text.split(/\r?\n/).filter(Boolean);
  assert.equal(lines.length % 3, 0, '3-line sets, the format CelesTrak serves as FORMAT=tle');
  assert.equal(lines.length / 3, meta.objects, 'the manifest counts what the file contains');
  /* every element line must be a real element line — the layer drops anything else, so a file full
     of near-misses would leave it empty while looking full */
  for (let i = 0; i < lines.length; i += 3) {
    assert.ok(lines[i + 1].startsWith('1 ') && lines[i + 1].length >= 69, 'line 1 at set ' + (i / 3));
    assert.ok(lines[i + 2].startsWith('2 ') && lines[i + 2].length >= 69, 'line 2 at set ' + (i / 3));
    assert.equal(lines[i + 1].slice(2, 7), lines[i + 2].slice(2, 7), 'the two lines name one object');
  }
  /* ⚠ THE EPOCH FIELD IS `YYDDD` AND DOES NOT SORT AS A NUMBER: 1975 (75042) compares greater than
     2026 (26212), and the first build of this file reported its newest elements as 1975-02-11 with
     every set in it from July 2026. Assert the converted instant, not the raw field. */
  const epochMs = (l1) => {
    const e = parseFloat(l1.slice(18, 32));
    const yy = Math.floor(e / 1000), year = yy < 57 ? 2000 + yy : 1900 + yy;
    return Date.UTC(year, 0, 1) + (e % 1000 - 1) * 86400000;
  };
  const newest = Math.max(...lines.filter((_, i) => i % 3 === 1).map(epochMs));
  assert.equal(new Date(newest).toISOString(), meta.newestEpoch);
  assert.ok(newest > Date.UTC(2020, 0, 1), 'these have to be modern element sets');
});

test('R185 satellites: the layer can reach the bundled catalogue the build actually ships', () => {
  const src = read('js/satellites-live.js');
  const m = /const BUNDLED='([^']+)', BUNDLED_META='([^']+)'/.exec(src);
  assert.ok(m, 'the bundled paths are declared in one place');
  for (const rel of [m[1], m[2]]) {
    assert.ok(fs.existsSync(path.join(ROOT, rel)), rel + ' must exist in the repo');
    /* …and vite.config.js must be copying it into dist/, or it exists here and 404s in production */
    const vite = read('vite.config.js');
    assert.ok(/'data',/.test(vite), 'data/ must be in STATIC_ASSETS');
  }
  /* the default is every active object — the point of this round's satellite work */
  assert.match(src, /const DEFAULT_GROUP='active'/);
});

test('R185 aircraft: the altitude readers do not read a part base', () => {
  /* The outline plates sit BELOW the aircraft and the fuselage now sits on them, so `alt` on a
     feature is a part's base and no longer the aeroplane's altitude. Three earlier rounds' tests
     assert the reported altitude IS the reported altitude, so the stats must read `acAlt`. */
  const src = read('js/data-layers.js');
  assert.match(src, /acAlt:alt/, 'every part carries the aircraft’s own altitude');
  assert.match(src, /lifted:bodies\.filter\(f=>\(\+f\.properties\.acAlt\|\|0\)>0\)/);
  assert.match(src, /maxAlt:Math\.round\(bodies\.reduce\(\(m2,f\)=>Math\.max\(m2,\+f\.properties\.acAlt\|\|0\),0\)\)/);
  /* and the aircraft count is still one feature per aeroplane. (#R190 withdrew the multi-part body,
     so 'body' is the only name left — but `acAlt` and the named lookup both stay, because they are
     what stopped the counters reading a part's base as the aeroplane's altitude.) */
  assert.match(src, /f\.properties\.part==='body'/);
});

test('R185 cesium: the redraw gate asks what the layers actually depend on', () => {
  const src = read('js/cesium-engine.js');
  /* the tile cover, per source, compared by signature */
  assert.match(src, /rec\.vt\.want\(b,z\)/);
  assert.match(src, /moved\.set\(id,sig!==rec\.coverSig\)/);
  /* zoom only dirties layers whose own document reads the zoom, or whose window the zoom crossed */
  assert.match(src, /_zoomSensitive\(l\)/);
  assert.match(src, /_inZoomWindow\(l\.def,prev\)!==this\._inZoomWindow\(l\.def,z\)/);
  /* the styling zoom is the one that was ASKED for while the camera is where setCamera left it */
  assert.match(src, /_styleZoom\(\)/);
  assert.match(src, /_noteCommanded\(zoom\)/);
  /* and the per-frame camera readback is memoised on the pose plus the frame */
  assert.match(src, /_poseUnchanged\(\)/);
});

test('R185 cesium: the imagery level is stated as a policy, not a constant', () => {
  const src = read('js/cesium-layers.js');
  assert.match(src, /const sse=\(cfg\.screenSpaceError>0\?cfg\.screenSpaceError:2\)/);
  assert.match(src, /declaredWidth=\(cfg\.fullResolution===false\)\?tileSize:Math\.max\(1,Math\.round\(tileSize\/sse\)\)/);
  assert.match(src, /this\.tileWidth=declaredWidth/);
  /* the engine passes both, so the policy follows a changed screen-space error */
  const eng = read('js/cesium-engine.js');
  assert.match(eng, /screenSpaceError:this\._globe\?this\._globe\.maximumScreenSpaceError:2/);
  assert.match(eng, /fullResolution:!\/Mobi\|Android\|iPhone\|iPad\//);
});
