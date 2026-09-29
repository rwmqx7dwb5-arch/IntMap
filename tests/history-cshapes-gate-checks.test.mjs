/* ============================================================================
 *  IntMap · data/cshapes.js — its gate, its licence, and the allowances that must equal the bytes
 *  (consolidated from tests/r700-cshapes-checks and r716-hist-coverage ②③④; each test keeps its tag)
 * ----------------------------------------------------------------------------
 *  #R700 — data/cshapes.js is the 5.6 MB the time machine answers the whole of 1886–2019 with, and it
 *  was the only one of the six historical bundles with no build script and no `--check`. Nothing said
 *  what shipping it costs: the upstream is CC BY-NC-SA 4.0, attribution is a CONDITION of
 *  redistribution, and the js/reference-data.js row that named the publisher carried no licence.
 *  ⚠ THIS FILE DOES NOT RESTATE WHAT THE GATE ASSERTS (#R488). Every case BREAKS one thing on a
 *  SYNTHETIC ROOT (the gate derives its ROOT from its own path, so a temp directory holding the script
 *  and four tiny bundles IS a root) and asks whether the gate notices.
 *
 *  #R716 — ⚠⚠⚠ EACH TEST STATES THE DEFECT IT WAS WRITTEN FOR, NOT THE ANSWER THAT WAS REACHED
 *  (memory: intmap-restate-the-defect-not-the-fix): a ratchet that stopped touching the metal, a
 *  `--check` no declared gate reaches, and prose inside a build script that nothing read.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync, readFileSync, readdirSync } from 'node:fs';
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

  /* ⚠ (#R717) THE LICENCE IS PART OF A HEALTHY ROOT NOW. data/cshapes.js states its own terms
     (CC BY-NC-SA 4.0 makes attribution a CONDITION of redistribution) and the gate asks for it, so a
     fixture without it fails on THAT rather than on the mutation under test — which is worse than a
     red test, because ⑮ mutations then all report the same unrelated reason and check nothing. */
  const cs = { v: 2, src: 'CShapes 2.0 (Schvitz et al. 2022, icr.ethz.ch/data/cshapes) · CC BY-NC-SA 4.0',
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
/* ⚠ (#R716) THIS TEST USED TO SAY 「today's bytes carry six」 AND LET ONE MORE RING THROUGH. That
   sentence was a number written inside a check rather than read off the file, and it outlived the
   thing it described: #R711/#R712 re-pooled the bundle and carried those six rings away, leaving
   ORPHAN_POINTS offering 1,569 points of slack to a file with none. The check stayed green either
   way, because it only ever asserted that the headroom it had been told about still existed.
   ⇒ RESTATED AGAINST THE DEFECT: the allowance is whatever the committed bundle actually holds
   (#R716 ② below asserts that equality), so ONE more unreferenced ring is
   always over it — no matter what that measured value happens to be this round. */
test('#R700 ⑪ the orphan allowance carries no slack — one more unreferenced ring is over it', () => {
  const r = fires(({ cs }) => { cs.rings.push(sq(40, 40, 1)); });
  assert.equal(r.failed, true, r.out);
  assert.match(r.out, /rings nothing references/);
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

const rd = (f) => readFileSync(join(ROOT, f), 'utf8');
const load = (f, g) => { const w = {}; new Function('window', rd(f))(w); return w[g]; };

/* ══ ② A RATCHET THAT STOPPED TOUCHING THE METAL IS NOT A RATCHET ═══════════════════════════
   THE DEFECT: #R700 wrote `ORPHAN_POINTS = 1569` for unreferenced rings in data/cshapes.js and said
   in the same comment that it expires the moment the bundle is re-pooled — re-measure, do not
   raise. #R711/#R712's precision work re-pooled it and carried those rings away. Nobody
   re-measured, so the constant went on offering 1,569 points of slack to a file that had none:
   green, and asserting nothing. Slack is invisible precisely because it never fails. These assert
   the allowances EQUAL what the bundles hold, so a legitimate change must re-measure rather than
   coast on someone else's headroom. */
test('#R716 ② the cshapes orphan allowance equals what the bundle actually holds', () => {
  /* ⚠ SPELLING, ON PURPOSE: ORPHAN_POINTS is a module-private constant of the build script (not
     exported, and the script is out of this file's reach), and the claim is about its DECLARED VALUE
     against the committed bytes. What the allowance DOES is measured on a synthetic root by #R700 ⑪. */
  const declared = Number(/const ORPHAN_POINTS = (\d+);/.exec(rd('scripts/build-cshapes.mjs'))?.[1]);
  assert.ok(Number.isInteger(declared), 'scripts/build-cshapes.mjs no longer declares ORPHAN_POINTS');
  const d = load('data/cshapes.js', '__CSHAPES');
  const used = new Set();
  for (const f of d.feats) for (const poly of f[8]) for (const ri of poly) used.add(ri);
  let pts = 0;
  for (let i = 0; i < d.rings.length; i++) if (!used.has(i)) pts += d.rings[i].length;
  assert.equal(declared, pts,
    `ORPHAN_POINTS is ${declared} and data/cshapes.js holds ${pts} — the allowance has stopped touching the metal; re-measure it rather than leave the slack`);
});

test('#R716 ② the era named/blank ratchets equal what the bundle actually holds', () => {
  /* ⚠ SPELLING, ON PURPOSE: the same shape as the orphan allowance — module-private declared values */
  const src = rd('scripts/build-hist-eras.mjs');
  const named = Number(/const NAMED_MIN = (\d+);/.exec(src)?.[1]);
  const blank = Number(/const BLANK_MAX = (\d+);/.exec(src)?.[1]);
  assert.ok(Number.isInteger(named) && Number.isInteger(blank),
    'scripts/build-hist-eras.mjs no longer declares NAMED_MIN / BLANK_MAX');
  const d = load('data/hist-eras.js', '__HISTERAS');
  const f = d.snaps.reduce((n, s) => n + s.feats.length, 0);
  const b = d.snaps.reduce((n, s) => n + s.blank.length, 0);
  assert.equal(named, f, `NAMED_MIN is ${named} and the bundle names ${f}`);
  assert.equal(blank, b, `BLANK_MAX is ${blank} and the bundle carries ${b} unnamed polygons`);
});

/* ══ ③ A `--check` IS NOT A GATE UNTIL A DECLARED check:* REACHES IT ════════════════════════
   THE DEFECT: the three rules that hunt for gates nothing calls (gate-callers, gate-lists,
   ci-gates in scripts/doc-facts.mjs) all take package.json's DECLARED check:* scripts as their
   universe. A generator that implements `--check` and keeps it to itself is therefore invisible to
   the very rules written to find it (memory: intmap-gate-universe-is-declared-gates).
   data/border-detail/ (409 MB) and data/hist-places.json both sat outside for that reason, and the
   second was never run against its shipped bytes at all — two node tests exercised the builder's
   selection rule on fixtures, which is a different question from what ships.
   ⚠ THE UNIVERSE IS DISCOVERED, NOT LISTED. A hand-written roster of historical generators drops
   the next one silently, which is the failure this whole round keeps meeting.
   ⚠ AND SO IS THE EXEMPTION. One historical generator legitimately is not a gate:
   build-histcities-homonyms.mjs downloads 13.6 MB from GeoNames to build the EVIDENCE
   check:histcities judges against, and a CI runner has no cache for it. That exemption is not
   written here — it is read from package.json, which must carry the `build:*` script AND the `//`
   companion stating why. An exception a test keeps to itself is a hand list wearing a disguise
   (.agents/rules/no-ad-hoc-hardcoding.md §6: name it, and say what would let it go). */
test('#R716 ③ every historical generator that writes a shipped bundle and implements --check is a declared gate, or says why not', () => {
  const scripts = JSON.parse(rd('package.json')).scripts;
  const declared = Object.entries(scripts)
    .filter(([k]) => k.startsWith('check:')).map(([, v]) => v).join(' ');
  /* exempt ONLY where the repository itself states the exemption: a declared build:* script whose
     `//` companion explains it. Silence is never an exemption. */
  const excused = Object.entries(scripts)
    .filter(([k]) => k.startsWith('build:') && String(scripts['//' + k] || '').trim().length > 40)
    .map(([, v]) => v).join(' ');
  const found = readdirSync(join(ROOT, 'scripts'))
    .filter((f) => f.endsWith('.mjs') && /^build-(hist|cshapes|border)/.test(f))
    .filter((f) => {
      const s = rd('scripts/' + f);
      return /--check(?![a-z-])/.test(s) && /writeFileSync|createWriteStream/.test(s);
    });
  assert.ok(found.length >= 8,
    `only ${found.length} historical generators were discovered — the discovery rule is no longer finding them and this test needs rewriting`);
  const orphans = found.filter((f) => !declared.includes('scripts/' + f) && !excused.includes('scripts/' + f));
  assert.deepEqual(orphans, [],
    `these historical generators implement --check, no declared check:* reaches them, and package.json states no reason why not — so the rules written to find uncalled gates cannot see them: ${orphans.join(', ')}`);
});

/* ══ ④ PROSE INSIDE A SCRIPT STATES FACTS ABOUT SHIPPED BUNDLES, AND NOTHING READ IT ═══════
   THE DEFECT: scripts/doc-facts.mjs discovers its universe from git — but only tracked `*.md`.
   That is deliberate and it is written down. What is NOT written down is the consequence: the
   explanatory prose inside the BUILD SCRIPTS makes the same kind of claim about the same shipped
   bytes, and no rule in the repository has ever read one word of it. Measured this round:
   scripts/asset-report.mjs described data/hist-eras.js as 「the era snapshots, 53 of them」 — the
   bundle has carried 54 since #R707 restored the sheet that had been dropped, and the row that
   exists to tell a reader what they are paying for had been wrong ever since.
   ⚠ The number is re-derived from the bundle, never restated here, and the rule fails if it finds
   no claim at all — a needle that matches nothing reports green (#R699). */
test('#R716 ④ the asset ledger states the era snapshot count the bundle actually carries', () => {
  const src = rd('scripts/asset-report.mjs');
  const at = src.indexOf('hist-eras\\.js$/');
  assert.ok(at > 0, 'scripts/asset-report.mjs no longer carries a row for data/hist-eras.js');
  const row = /why:\s*'([^']*)'/.exec(src.slice(at));
  assert.ok(row, 'the data/hist-eras.js asset row no longer explains what ships');
  const stated = /([0-9][0-9,]*)\s+of them/.exec(row[1]);
  assert.ok(stated, 'the data/hist-eras.js asset row no longer says how many snapshots ship — this rule would pass while measuring nothing');
  const snaps = load('data/hist-eras.js', '__HISTERAS').snaps.length;
  assert.equal(Number(stated[1].replace(/,/g, '')), snaps,
    `scripts/asset-report.mjs says ${stated[1]} era snapshots; data/hist-eras.js carries ${snaps}`);
});
