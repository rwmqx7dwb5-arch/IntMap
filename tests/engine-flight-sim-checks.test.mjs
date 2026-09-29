// The flight simulator — js/flight-sim.js: the projection it asks for, what it borrows and gives back,
// its camera, its audio, its ocean caches and its phone HUD.
//
// Gathered from tests/r171-checks (the globe, the restore, silent by default), r172-checks (the
// projection that blanked the cockpit is gone; the tilt pivot is handed back), r173-checks (the cockpit
// camera, #R173's solve withdrawn in #R174), r377-checks (a cached answer must record the data it was
// computed from) and r222-checks ⑥ (the phone HUD is four zones). Titles keep the round that wrote them.
//
// The round's headline defects could not be seen in the source at all — MapLibre 5's `globe`
// projection IS mercator from about z12 up, so "the flight sim switches to globe" (#R170) was a no-op
// for a sim that flies at z≈15, and #R171's fix then drew a white void. Those are measured in
// tests/r171.spec.js and tests/r172.spec.js (curvature, and whether GROUND is drawn). What is pinned
// here is everything that would silently rot around them.
//
// ⚠ js/flight-sim.js is one browser module whose sim runs inside the booted app against a live
// renderer, so most of what follows READS it. What can be lifted out and run is: the audio module
// (a self-contained IIFE — evaluated with a localStorage and an AudioContext stub), and #R377's
// three claims, which carry their own negative controls.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly } from '../scripts/code-only.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const R = (f) => readFileSync(path.join(ROOT, f), 'utf8');
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

/* ─── the projection (#R171 → #R172) ─────────────────────────────────────────────────────────── */

/* (#R172) SUPERSEDED, and kept as the record of why. #R171 asserted that the sim asks for
   'globe-true'; it did, and the cockpit then rendered a white void with no world in it at all —
   MapLibre cannot draw at cockpit zoom under that projection with a DEM on. The requirement that
   survives is the one that was always the point: the sim must not name a renderer projection itself,
   and it must leave the app on its GLOBE. (#R171's own "the flight sim goes through the engine and
   lands on the app Globe, never on a raw projection spec" asserted the same three things with a
   narrower 'globe-true' pattern; it is folded in here.)
   ⚠ READ, NOT RUN: entry into the sim is start() inside the booted app with a live renderer. */
test('#R172 the sim asks for the app Globe and nothing else — the projection that blanks it is gone', () => {
  const src = stripComments(R('js/flight-sim.js'));
  assert.match(src, /IntMapOS\.exec\('view\.proj\.globe'/, 'entry forces the app Globe view');
  assert.ok(!/globe-true/.test(src), "'globe-true' renders an empty white cockpit — it must not come back");
  assert.ok(!/setProjection\(\s*\{\s*type\s*:/.test(src), 'the sim must never name a renderer projection spec');
});

/* ⚠ READ, NOT RUN: stop() restores app state through IntMapOS inside the booted app. */
test('#R171 leaving the sim restores the projection unconditionally', () => {
  const src = stripComments(R('js/flight-sim.js'));
  const stop = src.slice(src.indexOf('function stop()'), src.indexOf('function computeTrim()'));
  const line = stop.split('\n').find((l) => /view\.proj\.(globe|flat)/.test(l));
  assert.ok(line, 'stop() must put the projection back');
  assert.ok(!/pv\.proj\s*!==\s*HOST\.proj/.test(line),
    'the restore must NOT be conditional on the app-level projection changing: entry now sets a projection SPEC that no app state records, so a pilot who was already on the globe would be left on the all-zoom globe for good');
});

/* ⚠ READ, NOT RUN: as above — the tilt module and the ground clamp live in the booted app. */
test('#R172 the sim hands the tilt pivot back on the way out', () => {
  const src = stripComments(R('js/flight-sim.js'));
  assert.match(src, /setTiltPivot\('target'\)/, 'the sim takes the pivot for the flight (it drives the camera itself every frame)');
  assert.match(src, /window\.IntMapTilt\.apply\(\); window\.IntMapTilt\.wireTilt\(\);/,
    'stop() must give it back — the sim also re-pins the ground clamp, which would silently undo the unlimited-tilt setting');
});

/* ─── silent by default (#R171) ──────────────────────────────────────────────────────────────────
   RUN: the audio module is an IIFE bound to `fsAudio`; it is lifted out and evaluated with a
   localStorage and an AudioContext that counts how many times it is opened. */
function liftAudio(stored) {
  const src = R('js/flight-sim.js');
  let init = null;
  walk.full(acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module' }), (n) => {
    if (!init && n.type === 'VariableDeclarator' && n.id && n.id.name === 'fsAudio') init = n.init;
  });
  assert.ok(init, 'js/flight-sim.js no longer declares fsAudio');
  const store = new Map(stored == null ? [] : [['intmap_fs_sound', stored]]);
  const localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
  let opened = 0;
  const window = { AudioContext: class { constructor() { opened++; } close() {} } };   /* no graph methods: build() fails soft */
  const audio = new Function('localStorage', 'window', 'setTimeout', 'performance', `return ${src.slice(init.start, init.end)};`)(
    localStorage, window, () => 0, { now: () => 0 });
  return { audio, store, opened: () => opened };
}

test('#R171 flight audio is muted by default and remembers the choice', () => {
  assert.equal(liftAudio(null).audio.isMuted(), true, 'a first flight is silent');
  /* anything other than an explicit "on" means silence — that is what "default" means here */
  for (const v of ['off', '', 'true', '1']) assert.equal(liftAudio(v).audio.isMuted(), true, `a stored ${JSON.stringify(v)} is not "on"`);
  assert.equal(liftAudio('on').audio.isMuted(), false, 'the pilot\'s explicit choice is honoured');
  const a = liftAudio(null);
  assert.equal(a.audio.toggleMute(), false);
  assert.equal(a.store.get('intmap_fs_sound'), 'on', 'the toggle persists the choice');
  assert.equal(liftAudio(a.store.get('intmap_fs_sound')).audio.isMuted(), false, '…so the next flight starts with sound');
  assert.equal(a.audio.toggleMute(), true);
  assert.equal(a.store.get('intmap_fs_sound'), 'off');
  /* ⚠ READ (this half): the deck button is HUD markup built inside the running sim */
  const src = stripComments(R('js/flight-sim.js'));
  assert.ok(!/<button class="fs-act on" data-act="mute"/.test(src),
    'the HUD SOUND key must reflect the real state, not be hard-coded to "on"');
  assert.match(src, /fsAudio\.isMuted\(\)\?''\:' on'/, 'the deck button reads the audio state');
});

test('#R171 a muted flight builds no audio graph at all', () => {
  const muted = liftAudio(null);
  muted.audio.start();
  assert.equal(muted.opened(), 0, 'start() must only build the synth when sound is wanted — a zeroed gain still keeps an AudioContext running');
  muted.audio.toggleMute();
  assert.equal(muted.opened(), 1, 'un-muting mid-flight has to build the graph then (riding that click as the user gesture)');
  const loud = liftAudio('on');
  loud.audio.start();
  assert.equal(loud.opened(), 1, 'and a flight with sound on builds it at take-off');
});

/* ─── the cockpit camera (#R173, withdrawn in #R174) ─────────────────────────────────────────────
   (#R174) THE ROUND-EARTH COCKPIT WAS WITHDRAWN, and these tests were rewritten rather than deleted,
   because what replaced them is the point. #R173 aimed the map's view axis below the horizon (the
   only place MapLibre's spherical camera is representable) and put the pilot's real line of sight
   back with the projection's centre offset. MEASURED while pulling the nose up: the pilot's view went
   92° → 165° while the map's pitch stayed at 85.4° for every frame, and the padding compensating for
   it reached 1,077 px on a 720 px-tall window — c2c·tan(Δ) diverges, so no value works. The sim is
   back on the #R158/#R172 eye→target camera, whose pitch comes out of the geometry and passes 90°.
   ⚠ READ, NOT RUN: the camera is driven every frame through the engine contract of the booted app. */

test('#R173 the cockpit camera is the eye→target one, which can look up (#R173 solve withdrawn in #R174)', () => {
  const src = stripComments(R('js/flight-sim.js'));
  assert.doesNotMatch(src, /_cockpitCam|_AXIS_MARGIN/, 'the clamped-axis solve is gone');
  assert.match(src, /const _D_LOOK=1800/, 'the look-ahead is a fixed distance again');
  assert.match(src, /camera\.fromTo\(\{lng:cEyeLng,lat:cEyeLat\},cEyeAlt,\{lng:tLng,lat:tLat\},tAlt\)/   /* (#R178) the same call, asked of the contract; (#R189) via the intro-blend aliases whose steady state is eLng/eLat/camAlt */,
    'centre and zoom come from the eye→target pair, stable at every attitude');
  assert.match(src, /setMaxPitch\(179\)/, 'and the renderer is allowed past the vertical');
});

test('#R173 the simulator restores what it borrows — and no longer borrows the projection centre', () => {
  const src = stripComments(R('js/flight-sim.js'));
  assert.doesNotMatch(src, /getPadding|setPadding/, 'padding is never touched, so there is nothing to give back');
  assert.match(src, /camera\.setMaxPitch\(pv\.maxPitch\|\|60\)/   /* (#R178) …through the contract */, 'the tilt ceiling is still restored');
  assert.match(src, /scene\.setSky\(pv\.sky\|\|undefined\)/   /* (#R178) …through the contract */, '…and so is the pre-flight sky');
});

test('#R173 the sky belongs to the renderer — the sim paints none (#R174)', () => {
  const src = stripComments(R('js/flight-sim.js'));
  assert.doesNotMatch(src, /_fsSkyDraw|_fsSkyOn|_fsSkyOff|_skyTop/, '「空を勝手に描くな」');
  assert.match(src, /setSky\(\{'sky-color':'#3f78c2'/, 'the #R99 spec is what a cockpit sees');
  assert.match(src, /'atmosphere-blend':\['interpolate'/, 'atmosphere is a zoom ramp again, not switched off');
});

/* ─── #R377 — a cached answer must record the data it was computed from ─────────────────────────
   The defect was not "the ocean test is wrong". It answers exactly what it is asked, against
   `window.countryGeo` — and js/countries-ui.js REPLACES that object a few seconds after boot,
   swapping Natural Earth 110 m for 10 m. The simulator's two caches (`_fsOceanCache`, the per-cell
   land/sea answer, and `_fsBBox`, the per-feature bounding boxes) were built from whichever
   collection was current on the first physics frame and kept for the whole flight, with no record
   of which one that was. Over Suruga Bay the two disagree, so the simulator spent the flight over
   "land" and #R152's sea-surface floor never engaged. The BEHAVIOUR is proved in the browser
   (tests/r356.spec.js, with synthetic coastlines). What is proved here is the shape that makes it
   impossible to reintroduce:
     ㋐ the guard runs BEFORE the cache is read;
     ㋑ the guard empties EVERY cache declared beside it, derived from the declaration;
     ㋒ nothing else in the file reads `window.countryGeo`, so there is no third cache.
   ⚠ EACH CHECK CARRIES ITS OWN RED (#R345): every claim is also run against a deliberately broken
   copy of the same source and must reject it. ⚠ COMMENTS ARE STRIPPED FIRST (scripts/code-only.mjs).
   ⚠ READ, NOT RUN: the caches live inside the sim's physics closure, fed by the booted app's
   window.countryGeo — which is why each claim is proven discriminating by its broken copy instead. */
const SRC377 = codeOnly(readLF(path.join(ROOT, 'js/flight-sim.js')));

/** the body of `function <name>(…){ … }`, brace-matched */
function body(src, name) {
  const at = src.indexOf('function ' + name + '(');
  assert.ok(at >= 0, 'js/flight-sim.js no longer declares ' + name);
  const open = src.indexOf('{', src.indexOf(')', at));
  let depth = 0, i = open;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (!depth) break; }
  }
  return src.slice(open, i + 1);
}
/** the names declared by the `let` that introduces the ocean caches */
function cacheDecl(src) {
  const at = src.indexOf('let _fsOceanCache');
  assert.ok(at >= 0, 'js/flight-sim.js no longer declares _fsOceanCache');
  const line = src.slice(at, src.indexOf(';', at));
  return line.replace(/^let\s+/, '').split(',').map((s) => s.trim().split('=')[0].trim()).filter(Boolean);
}
const CLAIMS = {
  'R377 ㋐ the guard runs before the cache is read': (src) => {
    const b = body(src, '_isOpenOcean');
    const guard = b.indexOf('_fsGeoSame(');
    const read = b.indexOf('_fsOceanCache[');
    return guard >= 0 && read >= 0 && guard < read;
  },
  'R377 ㋑ the guard empties every cache declared beside it': (src) => {
    const g = body(src, '_fsGeoSame');
    const names = cacheDecl(src);
    /* the last name on that line is the RECORD of which collection the caches hold — it is
       assigned, not emptied, and the guard needs it to compare */
    const record = names[names.length - 1];
    if (!g.includes(record + '=cg')) return false;
    return names.slice(0, -1).every((n) => new RegExp('\\b' + n + '\\s*=').test(g));
  },
  'R377 ㋒ nothing else in the file reads window.countryGeo': (src) => {
    const hits = src.split('window.countryGeo').length - 1;
    if (hits !== 2) return false;
    return body(src, '_fsBBoxes').includes('window.countryGeo')
      && body(src, '_isOpenOcean').includes('window.countryGeo');
  },
};
/* one edit each that reintroduces the defect, and that every claim must reject */
const BREAKS = {
  'R377 ㋐ the guard runs before the cache is read':
    (src) => src.replace('_fsGeoSame(cg);', ''),
  'R377 ㋑ the guard empties every cache declared beside it':
    (src) => src.replace('_fsOceanCache=Object.create(null); _fsBBox=null;', '_fsBBox=null;'),
  'R377 ㋒ nothing else in the file reads window.countryGeo':
    (src) => src.replace('function _fsGeoSame(cg){', 'function _fsGeoSame(cg){ const _x=window.countryGeo;'),
};
for (const [name, holds] of Object.entries(CLAIMS)) {
  test(name, () => {
    assert.equal(holds(SRC377), true, name + ' — js/flight-sim.js does not satisfy it');
    const broken = BREAKS[name](SRC377);
    assert.notEqual(broken, SRC377, 'the negative control did not change the source — the check proves nothing');
    assert.equal(holds(broken), false, 'the check stayed green on a source that reintroduces the defect');
  });
}

/* ─── the phone HUD (#R222 ⑥) ────────────────────────────────────────────────────────────────────
   ⚠ READ, NOT RUN: the zones are a stylesheet the sim injects into a live document; overlap is a
   layout property that only a browser computes. */
test('#R222 ⑥ the flight HUD is four zones, and nothing is stretched between two edges', () => {
  const fs = R('js/flight-sim.js');
  assert.ok(/TOP BAND/.test(fs) && /THUMB RAILS/.test(fs), 'the zones are written down');
  /* the badge and the config chips are given a top by this round; both must clear their bottom */
  const zone = fs.slice(fs.indexOf('THE PHONE HUD IS FOUR ZONES'));
  const badge = zone.slice(zone.indexOf('.fs-acbadge{'), zone.indexOf('.fs-acbadge{') + 400);
  assert.ok(/bottom:auto/.test(badge), 'an element with top AND bottom is stretched between them');
  assert.ok(/aria-label="'\+LL\('Exit'/.test(fs), 'the icon-only exit keeps its accessible name');
  /* the landscape rails must not overlap: the deck key sits clear of the pad */
  assert.ok(/fs-deck-t\{right:calc\(158px/.test(zone.replace(/\s*\+'/g, '').replace(/'\s*/g, '')),
    'the deck key is beside the pad, not under it');
});
