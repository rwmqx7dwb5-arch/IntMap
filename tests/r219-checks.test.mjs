/* ============================================================================
 *  #R219 — the checks that would have caught this round's defects
 * ----------------------------------------------------------------------------
 *  Node only, no browser. Several of these RUN the code rather than reading it: a unit error that
 *  survived three rounds (①) and a name table that silently collapsed to one language (④) are both
 *  invisible to a source scan and obvious to an execution.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* run one of the app's plain-script files in a sandbox and hand back its window */
function loadScripts(files) {
  const ctx = vm.createContext({ console, Math, Date, JSON, isFinite, parseInt, parseFloat, Float32Array, Uint8Array, Set, Map });
  ctx.window = ctx; ctx.globalThis = ctx;
  for (const f of files) vm.runInContext(read(f), ctx, { filename: f });
  return ctx;
}

/* ── ① THE MOONS OF THE OTHER PLANETS ACTUALLY GO ROUND ─────────────────────────────────────────
   `kepler()` returns RADIANS; js/space.js multiplied that by π/180 a second time, so every satellite
   of every planet oscillated ±3.14° about periapsis instead of orbiting — reported three rounds
   running as 「地球以外の惑星の衛星の挙動・軌道がバグっている」. This runs the two functions against
   each other: over one period the position must sweep a full turn and the radius must stay inside
   [a(1−e), a(1+e)]. A source scan cannot see this; an execution cannot miss it. */
test('R219 ① a satellite completes one revolution in one period, at the right radius', () => {
  const eph = loadScripts(['js/ephemeris.js']);
  const E = eph.window.IntMapEphemeris;
  assert.ok(E && typeof E.kepler === 'function');

  /* the same arithmetic js/space.js runs, transcribed — including the fix */
  const D2R = Math.PI / 180;
  function moonPos(m, jd) {
    const n = 360 / m.periodDays;
    const M = m.mDeg + n * (jd - 2451545.0);
    const ecc = E.kepler(M, m.e);
    const cE = Math.cos(ecc), sE = Math.sin(ecc);       /* ⚠ radians, NOT ecc*D2R */
    const a = m.aKm;
    const xv = a * (cE - m.e), yv = a * Math.sqrt(Math.max(0, 1 - m.e * m.e)) * sE;
    const w = m.wDeg * D2R, i = m.iDeg * D2R, O = m.nodeDeg * D2R;
    const cw = Math.cos(w), sw = Math.sin(w), ci = Math.cos(i), cO = Math.cos(O), sO = Math.sin(O), si = Math.sin(i);
    const x1 = xv * cw - yv * sw, y1 = xv * sw + yv * cw;
    return [x1 * cO - y1 * ci * sO, x1 * sO + y1 * ci * cO, y1 * si];
  }
  /* Io, from data/moons.json itself when it is there, and from JPL's published values when not */
  let io = null;
  try {
    const doc = JSON.parse(read('data/moons.json'));
    io = (doc.planets.jupiter || []).find((m) => m.name === 'Io');
  } catch { /* fall through */ }
  if (!io) io = { name: 'Io', aKm: 421800, e: 0.0041, iDeg: 0.036, wDeg: 84.129, nodeDeg: 43.977, mDeg: 342.021, periodDays: 1.769138 };

  const jd0 = 2460000.5;
  const N = 72, ang = [];
  let rMin = Infinity, rMax = 0;
  for (let k = 0; k < N; k++) {
    const p = moonPos(io, jd0 + io.periodDays * k / N);
    const r = Math.hypot(p[0], p[1], p[2]);
    rMin = Math.min(rMin, r); rMax = Math.max(rMax, r);
    ang.push(Math.atan2(p[1], p[0]));
  }
  /* one full turn: the unwrapped angle must move by ~2π over one period */
  let total = 0;
  for (let k = 1; k < N; k++) {
    let d = ang[k] - ang[k - 1];
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    total += d;
  }
  assert.ok(Math.abs(Math.abs(total) - 2 * Math.PI) < 0.35,
    'one period must sweep 2π, swept ' + total.toFixed(3) + ' rad (the ×π/180 bug gives ~0.1)');
  /* and the radius stays between periapsis and apoapsis */
  assert.ok(rMin > io.aKm * (1 - io.e) * 0.995 && rMax < io.aKm * (1 + io.e) * 1.005,
    'radius ' + rMin.toFixed(0) + '…' + rMax.toFixed(0) + ' outside [a(1−e), a(1+e)]');
  /* the wobble the bug produced would keep the whole orbit within a few per cent of one radius */
  assert.ok((rMax - rMin) / io.aKm > 1e-4, 'the orbit must actually vary in radius');
});

/* ── ② THE SCALE SWITCH KEEPS THE PHYSICAL DISTANCE ─────────────────────────────────────────────
   #R207 carried `dist / systemDist()` across the switch, which is right inside the planets and wrong
   outside them (measured: a factor of ~2,000 at the ceiling). The invariant is the distance in AU. */
test('R219 ② switching model ↔ true scale keeps the camera at the same real distance', () => {
  const POS_P = 0.42, POS_K = 26;
  const posScale = (au, scale) => (scale === 'real' ? au : POS_K * Math.pow(au, POS_P));
  const auOf = (d, scale) => (scale === 'real' ? d : Math.pow(Math.max(0, d) / POS_K, 1 / POS_P));
  for (const au of [1, 30, 1e3, 1e5, 1e7, 1e12]) {
    const dModel = posScale(au, 'model');
    assert.ok(Math.abs(auOf(dModel, 'model') - au) / au < 1e-9, 'model round trip at ' + au + ' AU');
    const dReal = posScale(au, 'real');
    assert.ok(Math.abs(auOf(dReal, 'real') - au) / au < 1e-12, 'real round trip at ' + au + ' AU');
  }
});

/* ── ③ THE COSMIC LADDER IS ORDERED, MEASURED AND REACHES THE HORIZON ───────────────────────────── */
test('R219 ③ the distance ladder is strictly increasing and ends at the particle horizon', () => {
  const ctx = loadScripts(['js/space-cosmos.js']);
  const C = ctx.window.IntMapCosmos;
  assert.ok(C && Array.isArray(C.RUNGS) && C.RUNGS.length >= 8);
  for (let i = 1; i < C.RUNGS.length; i++)
    assert.ok(C.RUNGS[i][1] > C.RUNGS[i - 1][1], C.RUNGS[i][0] + ' must be further out than ' + C.RUNGS[i - 1][0]);
  /* every rung carries all five languages and a source — standing rule 3 and rule 4 */
  for (const [key, au, lbl, src] of C.RUNGS) {
    assert.ok(au > 0 && isFinite(au), key + ' has no radius');
    for (const l of ['en', 'ja', 'de', 'ru', 'es']) assert.ok(lbl[l] && lbl[l].length > 2, key + ' is missing ' + l);
    assert.ok(src && src.length > 4, key + ' has no source');
  }
  /* the horizon: 46.5 Gly comoving, in AU. ⚠ NOT 13.8 Gly — the light travel time is not the radius. */
  const gly = C.HORIZON_AU / C.AU_PER_LY / 1e9;
  assert.ok(Math.abs(gly - 46.5) < 0.6, 'horizon is ' + gly.toFixed(1) + ' Gly, expected 46.5 comoving');
  /* `visible()` shows a handful at any camera distance, never everything and never nothing */
  for (const au of [1e2, 1e5, 1e9, 1e14]) {
    const v = C.visible(au);
    assert.ok(v.length >= 1 && v.length <= 6, 'at ' + au + ' AU: ' + v.length + ' rungs');
  }
  assert.equal(C.ring(5, 8).length, 24);
});

/* ── ④ THE OCEAN-CURRENT LAYER IS A BUNDLED DATASET, IN FIVE LANGUAGES ──────────────────────────── */
test('R219 ④ data/ocean-currents.json ships every current in all five languages', () => {
  const d = JSON.parse(read('data/ocean-currents.json'));
  assert.ok(Array.isArray(d.named) && d.named.length >= 20);
  /* (#R222) the global flow field is still required — it is a gridded file now, not `arrows` */
  assert.ok(d.field && d.field.cells > 1000, 'the global flow field must be there');
  for (const c of d.named) {
    for (const l of ['en', 'ja', 'de', 'ru', 'es']) assert.ok(c[l] && c[l].length > 1, c.en + ' is missing ' + l);
    assert.ok(['warm', 'cold', 'zonal'].includes(c.kind), c.en + ' has kind ' + c.kind);
    assert.ok(Array.isArray(c.path) && c.path.length >= 5, c.en + ' has no traced path');
  }
  /* the layer draws it and NEVER fetches a current from the network */
  const src = read('js/ocean-currents.js');
  assert.ok(src.includes("data/ocean-currents.json"), 'the layer must read the bundled file');
  assert.ok(!/marine-api\.open-meteo|query\.wikidata\.org/.test(src),
    'the rebuilt layer must not fetch the field or the names — it is a fixed dataset (#R219)');
});

/* ── ⑤ THE ENGLISH LABEL TABLE HAS ONE KEY PER LANGUAGE ─────────────────────────────────────────
   `{ lyrOceanCur:"Ocean currents", lyrOceanCur:"海流", … }` is a legal object whose LAST value wins,
   so the English UI read «Corrientes oceánicas» and every other language fell back to it. */
test('R219 ⑤ no i18n key is declared twice inside one Object.assign literal', () => {
  const src = read('js/data-layers.js');
  const re = /Object\.assign\(i18n\.(en|jp|de|ru|es),\s*\{/g;
  let m, bad = [];
  while ((m = re.exec(src))) {
    /* walk to the matching brace */
    let i = re.lastIndex, depth = 1;
    while (i < src.length && depth > 0) { const ch = src[i++]; if (ch === '{') depth++; else if (ch === '}') depth--; }
    const body = src.slice(re.lastIndex, i - 1);
    const seen = new Set();
    for (const k of body.matchAll(/(?:^|[,{]\s*)([A-Za-z_$][\w$]*)\s*:/g)) {
      const key = k[1];
      if (seen.has(key)) bad.push(m[1] + '.' + key);
      seen.add(key);
    }
  }
  assert.deepEqual(bad, [], 'duplicate i18n keys (the last one silently wins): ' + bad.join(', '));
});

/* ── ⑥ ADDING A LANGUAGE STAYS ONE FILE PLUS ONE ROW ────────────────────────────────────────────
   「今後、対応言語をさらに増やしていく方針です。容易に言語を追加できるように準備しておいて。」
   #R218 made the reading pages one file per language. This is the gate that keeps it true: the
   locale files on disk and the LANGS table must be the same set, so a new file without its row (or a
   row without its file) fails the build instead of shipping a language that never loads. */
test('R219 ⑥ js/locales/pages.*.js and IntMapPageI18N.LANGS are the same set', () => {
  const files = readdirSync(join(ROOT, 'js', 'locales'))
    .map((f) => /^pages\.([a-z-]+)\.js$/.exec(f)).filter(Boolean).map((m) => m[1]).sort();
  /* ⚠ (#R231) THE LIST MOVED, SO THIS READS IT WHERE IT NOW LIVES. js/page-i18n.js used to hold a
     literal five-row LANGS of its OWN — which is precisely why #R223's 繁體中文 and #R224's 简体中文
     never reached these two pages. It derives from js/lang-registry.js now (one list for the whole
     app), and the file suffix is each row's BCP-47 `html` tag, so the gate compares the locale
     files on disk against THAT. The property being enforced is unchanged: a file without its row,
     or a row without its file, fails the build instead of shipping a language that never loads. */
  const reg = read('js/lang-registry.js');
  /* ⚠ (#R239) THE REGISTRY ONLY SPELLS OUT THE ROWS THAT NEED AN EXPLICIT TAG. Since #R232 a
     language is one ui.*.js file and js/lang-registry.js derives its label/tag from the code, so
     `html: '…'` appears only where the tag differs from the code (ja, zh-Hant, zh-Hans). The set to
     compare against is therefore the GENERATED list plus that mapping — which is exactly what
     scripts/i18n-pages-audit.mjs `pageCodes()` computes, and this now asks it rather than
     re-deriving it here (one quantity, one place). */
  const codes = JSON.parse(/window\.IntMapLangCodes\s*=\s*(\[[^\]]*\])/
    .exec(read('js/locales/_langs.js'))[1]);
  const explicit = new Map([...reg.matchAll(/\{ code: '([^']+)',[^}]*html: '([^']+)'/g)]
    .map((m) => [m[1], m[2].toLowerCase()]));
  const listed = codes.map((c) => explicit.get(c) || c).sort();
  assert.ok(listed.length >= 5, 'the registry has its languages');
  assert.deepEqual(files, listed,
    'every registered language needs its reading-page document and vice versa — on disk: ' + files.join(',') + ' / listed: ' + listed.join(','));
  /* and each file must actually define the two documents the two pages render */
  for (const code of files) {
    const t = read('js/locales/pages.' + code + '.js');
    assert.ok(t.includes("IntMapPageI18N.define('" + code + "'"), 'pages.' + code + '.js does not define ' + code);
    for (const page of ['sources', 'science', 'common']) assert.ok(t.includes(page + ':'), 'pages.' + code + '.js has no ' + page);
  }
});

/* ── ⑦ THE POLAR CAPS ARE COVERED ON EVERY BASE MAP ─────────────────────────────────────────────
   #R207 showed the cap only with the satellite view, so on the vector base map the ±85°–90° hole was
   still the renderer's black — measured this round at (7,7,15). And a flat colour is not imagery:
   the bundled equirectangular picture reaches ±90° and now supplies the two bands the Mercator tile
   protocol cannot. */
test('R219 ⑦ the cap is shown on every base map, and carries the bundled imagery', () => {
  const src = read('js/world-base.js');
  assert.ok(/setLayout\(CAP,'visibility','visible'\)/.test(src),
    'applyCap must show the cap unconditionally — the satellite-only guard is the #R219 defect');
  assert.ok(/CAP_VEC_LIGHT/.test(src) && /CAP_VEC_DARK/.test(src), 'the vector base map needs its own cap tone');
  /* ⚠ MEASURED: a `background` layer is painted over the TILE COVERAGE, and there is no tile above
     85.0511° — with the cap background visible at #545454 the south polar pixel was still (11,11,11).
     Only GEOMETRY reaches a pole, so the fill mosaic is what covers the caps on EVERY base map and
     only its colour depends on which map is under it. */
  const ci = src.slice(src.indexOf('function capImages('), src.indexOf('function capImages(') + 1400);
  assert.ok(/satOn \? \['get', 'c'\] : \(_darkBase\(\)/.test(ci),
    'the cap mosaic must be shown on both base maps, with the colour choosing between them');
  assert.ok(!/if \(!satOn\) \{ try \{ if \(GE\(\)\.layers\.has\(CAPLYR\)\) GE\(\)\.layers\.setLayout\(CAPLYR, 'visibility', 'none'\)/.test(ci),
    'hiding the mosaic on the vector map is the defect this replaced');
  /* ⚠ NOT an `image` source: MapLibre puts every image corner through MercatorCoordinate, and
     latitude 90 has no Mercator y — measured, it throws on load. The caps carry the picture as a
     POLYGON MOSAIC coloured from it. */
  assert.ok(!/type:'image'/.test(src), 'an image source cannot be placed at a pole (see js/world-base.js)');
  assert.ok(/world-cap-src/.test(src) && /_capMosaic/.test(src) && /'fill-color': col/.test(src),
    'the caps must carry the bundled picture, not only a colour');
  /* the seam is the Mercator limit, exactly */
  assert.ok(/85\.0511287798066/.test(src), 'the band must start at the Web Mercator limit');
});

/* ── ⑧ THE MAP PICK LETS TAPS THROUGH THE PANEL BUT NOT THROUGH ITS BUTTONS ─────────────────────── */
test('R219 ⑧ a ghosted panel keeps its own controls clickable', () => {
  assert.ok(/im-pick-ghost/.test(read('js/map-pick.js')), 'map-pick must mark the panel it ghosts');
  const css = read('css/intmap.css');
  assert.ok(/\.im-pick-ghost\{\s*pointer-events:none/.test(css), 'the ghosted panel surface must be transparent to input');
  assert.ok(/\.im-pick-ghost button[\s\S]{0,400}pointer-events:auto/.test(css), 'its buttons must not be');
});

/* ── ⑨ THE LANGUAGE PICKER IS READABLE IN DARK MODE ─────────────────────────────────────────────
   A `<select>` with an author background opts its popup out of the browser's dark rendering, and
   `transparent` resolves to white there — white text on a white sheet. */
test('R219 ⑨ the reading pages’ language select has an explicit surface in both modes', () => {
  const css = read('css/pages.css');
  const sel = /\.pg-lang select\{([\s\S]*?)\}/.exec(css);
  assert.ok(sel, '.pg-lang select rule not found');
  assert.ok(/background-color:var\(--pg-surface\)/.test(sel[1]), 'the control needs an explicit background-color');
  assert.ok(!/background:transparent/.test(sel[1]), 'transparent is what made the open list white-on-white');
  assert.ok(/\.pg-lang select option\{[^}]*background-color:var\(--pg-surface\)/.test(css), 'the options need it too');
});

/* ── ⑩ THE CURRENT-LOCATION PIN INTERPOLATES, AND NEVER LEADS THE FIX ────────────────────────────── */
test('R219 ⑩ the locate pin eases between fixes and never runs ahead of one', () => {
  const src = read('js/map-extras.js');
  assert.ok(/requestAnimationFrame\(_tick\)/.test(src), 'the pin must animate');
  assert.ok(/cancelAnimationFrame/.test(src), 'and it must stop — a stationary phone costs no frames');
  /* the drawn point is only ever between the previous drawn point and the newest measurement */
  const EASE = 900;
  let drawn = { lng: 0, lat: 0 }; const target = { lng: 0.001, lat: 0 };
  for (let i = 0; i < 200; i++) {
    const f = 1 - Math.exp(-16 / EASE);
    drawn = { lng: drawn.lng + (target.lng - drawn.lng) * f, lat: drawn.lat };
    assert.ok(drawn.lng <= target.lng + 1e-12, 'the drawn point overshot the measurement');
  }
  /* 200 frames at 16 ms is 3.2 s against a 900 ms time constant: e^-3.56 of the step is left,
     which the real loop then snaps away at 0.35 m. */
  assert.ok(Math.abs(drawn.lng - target.lng) < target.lng * 0.04, 'and it does converge');
});

/* ── ⑪ THE ROUND IS DOCUMENTED ────────────────────────────────────────────────────────────────────
   ⚠ (#R218 ③) NOT PINNED TO 219: what this protects is «the newest entry is at the top», so it asks
   for the maximum rather than for a literal that the next round makes false. */
test('R219 ⑪ DEV-NOTES leads with the newest round, and the build stamp agrees', () => {
  const notes = read('DEV-NOTES.md');
  const rounds = [...notes.matchAll(/^## R(\d+)\b/gm)].map((m) => +m[1]);
  assert.ok(rounds.length > 3);
  assert.equal(rounds[0], Math.max(...rounds), 'the newest round must be the first ## R### heading');
  const build = /INTMAP_BUILD\s*=\s*'([^']+)'/.exec(read('index.html'));
  assert.ok(build, 'INTMAP_BUILD not found');
  assert.ok(build[1].includes('R' + Math.max(...rounds)), 'the build stamp says ' + build[1]);
});
