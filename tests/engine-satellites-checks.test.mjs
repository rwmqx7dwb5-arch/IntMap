/* Live satellites — the bundled TLE catalogue (data/tle/) and the SGP4 guard in js/satellites-live.js.
 *
 * Gathered from the satellites half of tests/r185-checks (the bundled catalogue is real, current and
 * parseable, and the build ships it) and tests/r185b-checks (SGP4 diverges on some element sets and says
 * nothing about it). Titles keep the round that wrote them.
 *
 * (#R185b) Found during production verification of #R185: the live satellite layer reported a maximum
 * altitude of 9,166,588 km. Propagating the shipped catalogue names the three objects outside a sane
 * band, and two of them are propagation blow-ups rather than deep-space orbits — ASTROCAST-0201 at
 * 9,244,632 km and MENUT at 238,361 km, both with a mean motion near 16 revolutions a day, which is a
 * ninety-minute orbit a few hundred kilometres up. The third, EXPLORER 50 (IMP-8), really is 270,956 km
 * out. So the discriminator cannot be an altitude threshold — it has to be the object's own orbit.
 *
 * RUN: the catalogue is parsed and propagated with the same satellite.js the layer imports, and the
 * layer's own propagateAll() is lifted out of js/satellites-live.js and run over it. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';
import * as SAT from 'satellite.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const R_EARTH = 6378.137;

/* ── #R185 THE BUNDLED CATALOGUE ─────────────────────────────────────────────────────────────── */

test('R185 satellites: the bundled catalogue is real, current and parseable', () => {
  const meta = JSON.parse(read('data/tle/catalogue.json'));
  const text = read('data/tle/catalogue.tle');
  assert.ok(meta.objects > 500, 'a fallback catalogue of a few dozen objects is not a fallback');
  assert.ok(meta.source, 'the snapshot has to say where it came from');
  const lines = text.split(/\r?\n/).filter(Boolean);
  assert.equal(lines.length % 3, 0, '3-line sets, the format CelesTrak serves as FORMAT=tle');
  assert.equal(lines.length / 3, meta.objects, 'the manifest counts what the file contains');
  /* every element line must be a real element line — the layer drops anything else, so a file full of
     near-misses would leave it empty while looking full */
  for (let i = 0; i < lines.length; i += 3) {
    assert.ok(lines[i + 1].startsWith('1 ') && lines[i + 1].length >= 69, 'line 1 at set ' + (i / 3));
    assert.ok(lines[i + 2].startsWith('2 ') && lines[i + 2].length >= 69, 'line 2 at set ' + (i / 3));
    assert.equal(lines[i + 1].slice(2, 7), lines[i + 2].slice(2, 7), 'the two lines name one object');
  }
  /* ⚠ THE EPOCH FIELD IS `YYDDD` AND DOES NOT SORT AS A NUMBER: 1975 (75042) compares greater than 2026
     (26212), and the first build of this file reported its newest elements as 1975-02-11 with every set
     in it from July 2026. Assert the converted instant, not the raw field. */
  const epochMs = (l1) => {
    const e = parseFloat(l1.slice(18, 32));
    const yy = Math.floor(e / 1000), year = yy < 57 ? 2000 + yy : 1900 + yy;
    return Date.UTC(year, 0, 1) + (e % 1000 - 1) * 86400000;
  };
  const newest = Math.max(...lines.filter((_, i) => i % 3 === 1).map(epochMs));
  assert.equal(new Date(newest).toISOString(), meta.newestEpoch);
  assert.ok(newest > Date.UTC(2020, 0, 1), 'these have to be modern element sets');
});

/* ⚠ READ, NOT RUN: the copy into dist/ happens inside a vite build; the paths are the layer's constants. */
test('R185 satellites: the layer can reach the bundled catalogue the build actually ships', () => {
  const src = read('js/satellites-live.js');
  const m = /const BUNDLED='([^']+)', BUNDLED_META='([^']+)'/.exec(src);
  assert.ok(m, 'the bundled paths are declared in one place');
  for (const rel of [m[1], m[2]]) {
    assert.ok(fs.existsSync(path.join(ROOT, rel)), rel + ' must exist in the repo');
    /* …and vite.config.js must be copying it into dist/, or it exists here and 404s in production */
    assert.ok(/'data',/.test(read('vite.config.js')), 'data/ must be in STATIC_ASSETS');
  }
  /* the default is every active object — the point of this round's satellite work */
  assert.match(src, /const DEFAULT_GROUP='active'/);
});

/* ── #R185b THE GUARD ────────────────────────────────────────────────────────────────────────── */

/* the catalogue as the layer ingests it: [{satrec, name, id}] */
function catalogue() {
  const lines = read('data/tle/catalogue.tle').split(/\r?\n/);
  const out = [];
  for (let i = 0; i + 2 < lines.length + 1; i += 3) {
    const name = (lines[i] || '').trim(), l1 = lines[i + 1], l2 = lines[i + 2];
    if (!l1 || !l2 || l1[0] !== '1') continue;
    let r; try { r = SAT.twoline2satrec(l1, l2); } catch (_) { continue; }
    if (!r || r.error) continue;
    out.push({ satrec: r, name, id: parseInt(l1.slice(2, 7), 10) });
  }
  return out;
}
const propagated = (sats, when) => {
  const gmst = SAT.gstime(when);
  const out = [];
  for (const s of sats) {
    const pv = SAT.propagate(s.satrec, when); if (!pv || !pv.position) continue;
    const gd = SAT.eciToGeodetic(pv.position, gmst);
    if (!isFinite(gd.height) || !isFinite(SAT.degreesLat(gd.latitude)) || !isFinite(SAT.degreesLong(gd.longitude))) continue;
    out.push({ id: s.id, name: s.name, altKm: gd.height, apoKm: s.satrec.a > 0 ? s.satrec.a * R_EARTH * (1 + (s.satrec.ecco || 0)) : 0 });
  }
  return out;
};
/* the guard, stated once — the physics the layer's guard is built on */
const keeps = (o) => o.altKm > 80 && !(o.apoKm > 0 && (R_EARTH + o.altKm) > o.apoKm * 1.5);

test('R185b: the guard drops divergences and keeps real deep-space orbits', () => {
  const all = propagated(catalogue(), new Date());
  assert.ok(all.length > 500, 'the catalogue propagates');
  const kept = all.filter(keeps), dropped = all.filter((o) => !keeps(o));
  /* nothing plausible is thrown away: at most a handful of the catalogue */
  assert.ok(dropped.length < all.length * 0.02,
    `dropped ${dropped.length} of ${all.length} — a guard that removes a fiftieth of the sky is the wrong guard`);
  /* and what survives is inside its own orbit */
  for (const o of kept) {
    assert.ok(o.altKm > 80, o.name + ' has re-entered');
    if (o.apoKm > 0) assert.ok(R_EARTH + o.altKm <= o.apoKm * 1.5, o.name + ' is outside its own apogee');
  }
  /* the discriminator is the orbit, not the altitude: a genuine high orbit is kept while a
     ninety-minute orbit reported at hundreds of thousands of km is not */
  const imp8 = all.find((o) => /IMP-8|EXPLORER 50/i.test(o.name));
  if (imp8) {
    assert.ok(imp8.altKm > 100000, 'IMP-8 really is far out — that is the point of the case');
    assert.ok(keeps(imp8), 'a real deep-space orbit must survive the guard');
  }
  const maxKept = kept.reduce((m, o) => Math.max(m, o.altKm), 0);
  assert.ok(maxKept < 500000, 'nothing kept is beyond the Moon');
});

test('R185b: the layer implements that guard and reports what it dropped', () => {
  /* RUN: propagateAll, lifted with the constants and the counter it closes over, over the real catalogue */
  const src = read('js/satellites-live.js');
  const want = ['D2R', 'R_EARTH', '_diverged', 'propagateAll'];
  const stmts = [];
  walk.full(acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module' }), (n) => {
    const hit = (n.type === 'FunctionDeclaration' && want.includes(n.id && n.id.name))
      || (n.type === 'VariableDeclaration' && n.declarations.some((x) => want.includes(x.id && x.id.name)));
    if (hit && !stmts.includes(n)) stmts.push(n);
  });
  const sats = catalogue();
  /* ⚠ AN INSTANT AT WHICH THERE IS SOMETHING TO DROP. The bundled catalogue is refreshed, and on the day
     it is built every set propagates cleanly — measured 2026-09-29: 0 dropped at the newest epoch, 9 at
     +60 d, and 48 re-entered + 43 outside their own apogee at +120 d. So the layer is asked about the
     instant 120 days past the newest element set (derived from the file, not a date typed here), and
     the test first proves both kinds of drop exist there, or it would be comparing two empty lists. */
  const newest = JSON.parse(read('data/tle/catalogue.json')).newestEpoch;
  const when = new Date(Date.parse(newest) + 120 * 86400000);
  const layer = new Function('SAT', 'sats', 'clockNow', 'sunAt',
    `${stmts.sort((a, b) => a.start - b.start).map((n) => src.slice(n.start, n.end)).join('\n')}
     return { propagateAll, diverged: () => _diverged };`)(SAT, sats, () => when, () => null);
  const drawn = layer.propagateAll(when);
  const reference = propagated(sats, when);
  assert.ok(reference.some((o) => !(o.altKm > 80)) && reference.some((o) => o.altKm > 80 && !keeps(o)),
    'at this instant the catalogue must contain both a re-entered object and one outside its own apogee');
  assert.deepEqual(drawn.map((o) => o.id).sort((a, b) => a - b), reference.filter(keeps).map((o) => o.id).sort((a, b) => a - b),
    'the layer draws exactly what the guard keeps — nothing re-entered, nothing outside its own apogee');
  /* silently dropping objects would be its own dishonesty — the count is kept */
  assert.equal(layer.diverged(), reference.filter((o) => !keeps(o)).length, 'and it counts what it dropped');
  /* ⚠ READ (this half): the count is published through the layer's state() to the booted panel */
  assert.match(src, /diverged:_diverged/);
});
