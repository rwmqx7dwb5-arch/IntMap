/* ============================================================================
 *  #R700 — the gate over data/cshapes.js, and the licence it ships under
 * ----------------------------------------------------------------------------
 *  data/cshapes.js is the 5.6 MB the time machine answers the whole of 1886–2019 with, and it was
 *  the only one of the six historical bundles with no build script and no `--check`. Nothing could
 *  say where its bytes came from, and — the reason the round opened — nothing said what shipping
 *  them costs: the upstream is CC BY-NC-SA 4.0, attribution is a CONDITION of redistribution, and
 *  the js/reference-data.js row that named the publisher carried no licence at all.
 *
 *  ⚠ THIS FILE DOES NOT RESTATE WHAT THE GATE ASSERTS. Fixing the spelling of a rule is the #R488
 *  shape: the rule dies and the check stays green. Every case below BREAKS one thing and asks
 *  whether the gate notices, so what is proved is that the assertion is REACHABLE — and each
 *  mutation is a defect that has actually happened to a bundle in this repository or that the
 *  reader would actually see.
 *  ⚠ THE MUTATIONS RUN AGAINST A SYNTHETIC ROOT. The gate derives its ROOT from its own path, so a
 *  temp directory holding the script and four tiny bundles IS a root as far as it is concerned —
 *  which is what makes «an unreferenced ring over budget fails» a thing this file can prove in
 *  milliseconds instead of a thing it can only assert about 5.6 MB it must not touch.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LICENCE, CITATION } from '../scripts/build-cshapes.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(ROOT, 'scripts', 'build-cshapes.mjs');

/* a closed, on-globe square of side `s` at (lon, lat) — area s² deg² */
const sq = (lon, lat, s) => [[lon, lat], [lon + s, lat], [lon + s, lat + s], [lon, lat + s], [lon, lat]];
/* a closed ring of `n` points, for the orphan ratchet — it has to be big enough to breach a budget
   measured on the real file, so it is generated rather than typed */
const circle = (n) => { const r = [];
  for (let i = 0; i < n - 1; i++) r.push([+(Math.cos(2 * Math.PI * i / (n - 1)) * 5).toFixed(3),
                                          +(Math.sin(2 * Math.PI * i / (n - 1)) * 5).toFixed(3)]);
  r.push(r[0].slice()); return r; };

/* ── a root the gate accepts, with exactly one thing broken by the caller ──────────────────────
   The synthetic world is arranged so that BOTH halves of the neighbour coupling are LIVE, which
   took measuring: CShapes draws 32 deg² in every year, so the bar it hands the neighbour is 32 and
   the neighbour (36 deg² from 1881, 40 from 1884) clears it from its declared floor of 1881; and the
   neighbour's own bar, 36 − (40 − 36) = 32, is exactly what CShapes draws. A fixture where the
   neighbour doubles would put its bar at ZERO and ⑯ below would pass for the wrong reason. */
function world(mutate) {
  const dir = mkdtempSync(join(tmpdir(), 'r700cs-'));
  /* ⚠ THE SCRIPT'S IMPORTS ARE COPIED BY FOLLOWING THEM, NOT BY LISTING THEM (#R695): a list goes
     stale on the next refactor and every mutation below then passes for ERR_MODULE_NOT_FOUND. */
  const copied = new Set();
  (function follow(abs, rel) {
    if (copied.has(rel)) return;
    copied.add(rel);
    const body = readFileSync(abs, 'utf8');
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    copyFileSync(abs, join(dir, rel));
    for (const m of body.matchAll(/^\s*(?:import|export)\b[^\r\n]*?from\s*['"](\.[^'"]+)['"]/gm)) {
      const child = resolve(dirname(abs), m[1]);
      follow(child, relative(ROOT, child).split(sep).join('/'));
    }
  })(SCRIPT, 'scripts/build-cshapes.mjs');

  const cs = { v: 2, src: 'CShapes 2.0 (Schvitz et al. 2022, icr.ethz.ch/data/cshapes)',
    rings: [sq(0, 0, 4), sq(10, 10, 4)],
    feats: [['Testland', 2, 1886, 1, 1, 2019, 12, 31, [[0]]],
            ['Otherland', 3, 1886, 1, 1, 2019, 12, 31, [[1]]]] };
  const hb = { v: 1, src: 'OpenHistoricalMap (openhistoricalmap.org) · CC0 1.0', window: [1881, 1885],
    rings: [sq(0, 0, 6), sq(20, 20, 2)],
    feats: [['Old', null, 1881, 1, 1, 1886, 1, 1, [[0]]],
            ['Newer', null, 1884, 1, 1, 1886, 1, 1, [[1]]]] };
  const src = { csMin: 1886, csMax: 2019 };
  const reg = { source: LICENCE.source, licence: LICENCE.licence, cite: CITATION };
  const extra = mutate ? mutate({ cs, hb, src, reg }) : null;

  mkdirSync(join(dir, 'data'), { recursive: true });
  mkdirSync(join(dir, 'js'), { recursive: true });
  writeFileSync(join(dir, 'data', 'cshapes.js'), 'window.__CSHAPES=' + JSON.stringify(cs) + ';\n');
  writeFileSync(join(dir, 'data', 'hist-borders.js'), 'window.__HISTB=' + JSON.stringify(hb) + ';\n');
  writeFileSync(join(dir, 'js', 'time-borders.js'),
    (src.csMin === null ? '  /* the constants are gone */\n' : `    const CS_MIN=${src.csMin}, CS_MAX=${src.csMax};\n`));
  writeFileSync(join(dir, 'js', 'reference-data.js'),
    '  const DATA_SOURCES=[\n'
    + (reg.source === null ? '' : `    {n:'${reg.source}',u:'https://icr.ethz.ch/data/cshapes/',\n`
       + (reg.licence === null ? '' : `     lic:'${reg.licence}',\n`)
       /* ⚠ single-quoted, exactly as js/reference-data.js writes it: JSON.stringify would escape the
          quotation marks inside the citation and the row would no longer CONTAIN the value. */
       + (reg.cite === null ? '' : `     cite:'${reg.cite}'`) + '},\n')
    + '  ];\n');
  if (extra) for (const [name, body] of Object.entries(extra)) writeFileSync(join(dir, name), body);
  return dir;
}

function run(dir) {
  const script = join(dir, 'scripts', 'build-cshapes.mjs');
  try {
    return { failed: false, out: execFileSync(process.execPath, [script, '--check'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) };
  } catch (e) { return { failed: true, out: String(e.stdout || '') + String(e.stderr || '') }; }
}
function fires(mutate) {
  const dir = world(mutate);
  try { return run(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

/* ── ① the gate exists, is declared, and passes on the bytes actually shipped ───────────────── */
test('#R700 ① check:cshapes is declared and passes on the committed bundle', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).scripts || {};
  assert.equal(pkg['check:cshapes'], 'node scripts/build-cshapes.mjs --check',
    'an undeclared gate is invisible to the gate-callers and gate-lists rules');
  const out = execFileSync(process.execPath, [SCRIPT, '--check'], { cwd: ROOT, encoding: 'utf8' });
  assert.match(out, /^cshapes ok/, out);
  /* it has to have said something about the licence, or it checked a file and not an obligation */
  assert.ok(out.includes(LICENCE.licence), out);
});

/* ── ② the harness is honest — an unbroken synthetic root passes ────────────────────────────── */
test('#R700 ② a well-formed synthetic root passes, so every failure below is the mutation', () => {
  const r = fires(null);
  assert.equal(r.failed, false, r.out);
});

/* ── ③ geometry: a ring that is not a ring ──────────────────────────────────────────────────── */
test('#R700 ③ a ring cut down to two points fails', () => {
  const r = fires(({ cs }) => { cs.rings[0] = cs.rings[0].slice(0, 2); });
  assert.equal(r.failed, true, r.out);
  assert.match(r.out, /ring 0 has 2 points/);
});

/* ⚠ THIS BUNDLE STORES CLOSED RINGS and data/hist-borders.js stores open ones — two records, two
   conventions (#R518). A ring that lost its closure draws a polygon with a seam. */
test('#R700 ④ a ring whose last point is not its first fails', () => {
  const r = fires(({ cs }) => { cs.rings[0].pop(); });
  assert.equal(r.failed, true, r.out);
  assert.match(r.out, /not closed/);
});

test('#R700 ⑤ a polygon pointing at a ring that does not exist fails', () => {
  const r = fires(({ cs }) => { cs.feats[0][8] = [[99]]; });
  assert.equal(r.failed, true, r.out);
  assert.match(r.out, /points at ring 99/);
});

/* ── ⑥ the window is the APP'S, read out of js/time-borders.js rather than restated ─────────── */
test('#R700 ⑥ a record outside the window js/time-borders.js asks for fails', () => {
  const r = fires(({ cs }) => { cs.feats[0][2] = 1885; });
  assert.equal(r.failed, true, r.out);
  assert.match(r.out, /outside the 1886-2019/);
});

test('#R700 ⑦ a gate that cannot read CS_MIN/CS_MAX fails instead of assuming them', () => {
  const r = fires(({ src }) => { src.csMin = null; });
  assert.equal(r.failed, true, r.out);
  assert.match(r.out, /CS_MIN/);
});

/* ── ⑧ one code is one polity, and one polity is in one place at a time ─────────────────────── */
test('#R700 ⑧ the same Gleditsch-Ward code drawn twice on one day fails', () => {
  const r = fires(({ cs }) => { cs.feats.push(['Testland', 2, 1900, 1, 1, 2019, 12, 31, [[1]]]); });
  assert.equal(r.failed, true, r.out);
  assert.match(r.out, /drawn twice/);
});

test('#R700 ⑨ two names on one code fails', () => {
  const r = fires(({ cs }) => { cs.feats[1][1] = 2; });
  assert.equal(r.failed, true, r.out);
  assert.match(r.out, /is both/);
});

/* ── ⑩ the orphan ratchet is reachable — dead weight that nothing counts is dead weight that
       grows. The budget is measured on the real file, so the breach has to be that big. */
test('#R700 ⑩ unreferenced rings over the ratchet fail', () => {
  const r = fires(({ cs }) => { cs.rings.push(circle(2000)); });
  assert.equal(r.failed, true, r.out);
  assert.match(r.out, /rings nothing references/);
});
test('#R700 ⑪ an unreferenced ring under the ratchet is allowed — today\'s bytes carry six', () => {
  const r = fires(({ cs }) => { cs.rings.push(sq(40, 40, 1)); });
  assert.equal(r.failed, false, r.out);
});

/* ── ⑫⑬⑭ the #R689 shape: the obligation, and a page that pays it ──────────────────────────── */
test('#R700 ⑫ a sources registry that never names this source fails', () => {
  const r = fires(({ reg }) => { reg.source = null; });
  assert.equal(r.failed, true, r.out);
  assert.match(r.out, /no DATA_SOURCES row/);
});
test('#R700 ⑬ a row that names the publisher and not the licence fails', () => {
  const r = fires(({ reg }) => { reg.licence = null; });
  assert.equal(r.failed, true, r.out);
  assert.ok(r.out.includes(LICENCE.licence), r.out);
});
test('#R700 ⑭ a row without the citation the publisher asks for fails', () => {
  const r = fires(({ reg }) => { reg.cite = null; });
  assert.equal(r.failed, true, r.out);
  assert.match(r.out, /citation/);
});

/* ── ⑮ the record next door is standing on this file ────────────────────────────────────────
   scripts/build-hist-borders.mjs derives its floor from THIS bundle's smallest and largest world.
   A CShapes that moves, or a neighbour that was not rebuilt with it, leaves two files disagreeing
   about which years each of them answers — with every structural invariant above still green. */
test('#R700 ⑮ a neighbour whose declared floor this file no longer derives fails', () => {
  const r = fires(({ hb }) => { hb.window[0] = 1880; });
  assert.equal(r.failed, true, r.out);
  assert.match(r.out, /floor/);
});
test('#R700 ⑯ a year that stopped being a world fails', () => {
  const r = fires(({ cs }) => { cs.feats[0][8] = [[1]];
    /* both records now draw one tiny ring where a world used to be */
    cs.rings[1] = sq(10, 10, 0.2); });
  assert.equal(r.failed, true, r.out);
  assert.match(r.out, /a world takes/);
});

/* ── ⑰ the src has to name its upstream, the way data/hist-borders.js's names OHM ───────────── */
test('#R700 ⑰ a bundle whose src no longer names the upstream fails', () => {
  const r = fires(({ cs }) => { cs.src = 'some borders from somewhere'; });
  assert.equal(r.failed, true, r.out);
  assert.match(r.out, /src must name/);
});

/* ── ⑱ THE LICENCE IS A VALUE, AND IT REACHES THE READER ────────────────────────────────────
   ⚠ EVALUATED, NOT READ (#R505). What is asserted is what the shipped resolver DECIDES: both
   readers of the registry — the in-app dialog and the Sources page — call `useText`, so if the
   licence and the citation come back from it, they are on the reader's screen. */
test('#R700 ⑱ the shipped registry hands the reader the licence and the citation', () => {
  const w = {};
  new Function('window', readFileSync(join(ROOT, 'js', 'reference-data.js'), 'utf8'))(w);
  const text = w.IntMapRefData.useText(LICENCE.source, 'en');
  assert.ok(text.includes(LICENCE.licence), 'the Sources entry never says it is ' + LICENCE.licence);
  assert.ok(text.includes(CITATION), 'the Sources entry does not carry the publisher\'s citation');
  /* and a source with no declared terms is left exactly as it was — this resolver is shared */
  const plain = w.IntMapRefData.dataSources.find((s) => !s.lic);
  assert.ok(plain, 'every row suddenly declares a licence — then this assertion proves nothing');
  assert.equal(w.IntMapRefData.useText(plain.n, 'en'), '');
  /* the declaration itself is a LIC() value: attribution is a boolean, not a hope (#R689) */
  assert.equal(LICENCE.attribution, true);
  assert.match(LICENCE.read, /^\d{4}-\d{2}-\d{2}$/);
});
