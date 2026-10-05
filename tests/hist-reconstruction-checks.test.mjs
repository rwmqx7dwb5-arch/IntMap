/* tests/hist-reconstruction-checks.test.mjs — IntMap's own reconstruction of historical first-level divisions
   (scripts/build-hist-admin-recon.mjs, scripts/histrecon/, docs/HIST-RECONSTRUCTION.md).

   The machine half of the review must REFUSE what the method forbids — a gap, a double claim, a count the
   sources contradict, a span without a source — and the shipped record must yield and be yielded to in the
   stated order. Each refusal is exercised by mutating a dossier that passes. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkDossier, norm } from '../scripts/histrecon/dossier-check.mjs';
import { HIST_ADMIN_GAPS } from '../js/border-coast.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = [{ url: 'https://example.org/law', says: 'the law creates the units', accessed: '2026-10-05' }];
const CAT = { XXA: [{ id: 'A1', name: 'a1' }, { id: 'A2', name: 'a2' }, { id: 'A3', name: 'a3' }] };
/* a passing dossier: A3 split from A2 on 2000-01-01; before it, the parent is A2 ∪ A3 */
const good = () => ({
  country: 'XXA', atomSet: 'test', scope: { from: '1990-01-01', to: '2019-12-31' },
  units: [
    { id: 'u1', names: { en: 'One', ja: '一' }, spans: [{ from: '1990-01-01', precision: 'day', to: null, atoms: ['A1'], sources: src }] },
    { id: 'u2', names: { en: 'Two', ja: '二' }, spans: [
      { from: '1990-01-01', precision: 'day', to: '2000-01-01', atoms: ['A2', 'A3'], sources: src },
      { from: '2000-01-01', precision: 'day', to: null, atoms: ['A2'], sources: src }] },
    { id: 'u3', names: { en: 'Three', ja: '三' }, spans: [{ from: '2000-01-01', precision: 'day', to: null, atoms: ['A3'], sources: src }] },
  ],
  counts: [{ date: '1995-06-01', n: 2, sources: src }, { date: '2005-06-01', n: 3, sources: src }],
});

test('① a dossier that states a partition, its counts and a source per span passes', () => {
  const r = checkDossier(good(), CAT);
  assert.deepEqual(r.err, []);
});

test('② ③ ④ every forbidden shape is refused — gap, double claim, contradicted count, missing source, overlap, unknown atom', () => {
  const cases = {
    gap: (d) => { d.units[2].spans[0].from = '2001-01-01'; d.units[2].spans[0].precision = 'day'; },
    double: (d) => { d.units[0].spans[0].atoms.push('A3'); },
    count: (d) => { d.counts[1].n = 4; },
    source: (d) => { d.units[1].spans[1].sources = []; },
    overlap: (d) => { d.units[1].spans[0].to = '2001-01-01'; },
    unknown: (d) => { d.units[0].spans[0].atoms = ['A9']; },
    precision: (d) => { d.units[0].spans[0].from = '1990'; d.units[0].spans[0].precision = 'day'; },
  };
  for (const [name, mutate] of Object.entries(cases)) {
    const d = good(); mutate(d);
    assert.ok(checkDossier(d, CAT).err.length > 0, name + ' must be refused');
  }
});

test('③ an atom withheld for a window is accepted only when an unresolved entry names it, the window and what was checked', () => {
  const d = good();
  d.units[2].spans[0].from = '2001-01-01';
  d.unresolved = [{ what: 'A3 2000', atoms: ['A3'], from: '2000-01-01', to: '2001-01-01', why: 'the day of the split is not settled', checked: ['the law', 'the gazette'] }];
  d.counts[1].date = '2005-06-01';
  assert.deepEqual(checkDossier(d, CAT).err, []);
  delete d.unresolved[0].checked;
  assert.ok(checkDossier(d, CAT).err.some((m) => /checked/.test(m)));
});

test('dates: a year-precision date means its first day and never a day nobody stated', () => {
  assert.equal(norm('1984'), '1984-01-01');
  assert.equal(norm('1984-02'), '1984-02-01');
  assert.throws(() => norm('1984-2-4'));
});

test('precedence: the reconstruction is derived, is yielded to by the present-day carry-back, and yields to every record that is not derived', async () => {
  const g = HIST_ADMIN_GAPS.find((x) => x.reconstructed);
  assert.ok(g && g.derived === true && g.file === 'data/hist-admin-recon.js');
  const fill = fs.readFileSync(path.join(ROOT, 'scripts', 'build-hist-admin-fill.mjs'), 'utf8');
  assert.match(fill, /g\.derived === false \|\| g\.reconstructed/, 'recordFiles() must hand the reconstruction to the fill as a record it yields to');
  const recon = fs.readFileSync(path.join(ROOT, 'scripts', 'build-hist-admin-recon.mjs'), 'utf8');
  assert.match(recon, /recordFiles\(\)\.filter\(\(f\) => f !== G\.file\)/, 'the reconstruction must never yield to its own previous build');
});

test('the committed dossiers pass and every shipped row lies inside a span its dossier states (check:histrecon)', () => {
  const out = execFileSync(process.execPath, ['scripts/build-hist-admin-recon.mjs', '--check'], { cwd: ROOT, encoding: 'utf8' });
  assert.match(out, /✓ check:histrecon/);
});

test('the shipped rows carry a date record, an English name and a dossier source; a year is never written as a day', () => {
  const file = path.join(ROOT, 'data', 'hist-admin-recon.js');
  if (!fs.existsSync(file)) return;
  const w = {}; vm.runInNewContext(fs.readFileSync(file, 'utf8'), { window: w });
  const d = w.__HISTADMRECON;
  assert.equal(d.reconstructed, true);
  /* the first build shipped every coordinate as null (a guessed precision of −Infinity) and passed every other test */
  for (const [k, r] of d.rings.entries()) { assert.ok(r.length >= 4, 'ring ' + k + ' has at least 4 points'); for (const c of r) assert.ok(Number.isFinite(c[0]) && Number.isFinite(c[1]) && Math.abs(c[0]) <= 360 && Math.abs(c[1]) <= 90, 'ring ' + k + ' carries a finite, on-earth coordinate'); }
  d.feats.forEach((f, i) => {
    assert.ok(f[9] && f[9].en, 'row ' + i + ' has an English name');
    assert.ok(d.sources[f[10]] && /^https:\/\//.test(d.sources[f[10]].url), 'row ' + i + ' names a dossier source');
    const s = d.dates[i].start;
    assert.ok(s && s.raw && s.precision, 'row ' + i + ' has a start');
    if (!s.derived) assert.equal(String(s.raw).length, s.precision === 'year' ? 4 : s.precision === 'month' ? 7 : 10, 'row ' + i + ' writes its start at the precision it was stated');
  });
});
