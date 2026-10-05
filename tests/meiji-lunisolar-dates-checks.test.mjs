/* ============================================================================
 *  meiji-lunisolar-dates — a lunisolar date written as if it were Gregorian
 *  (scripts/histadmin/calendar.mjs · data/hist-admin-edges.json `calendar` · js/hist-scale.js)
 * ----------------------------------------------------------------------------
 *  OpenHistoricalMap draws 滋賀県 from 1872-09-28; 犬上県 was merged into it on 明治5年9月28日 = 1872-10-30.
 *  The correction goes through the reviewed ledger and must reach BOTH readers: the bundle's row and the
 *  vector-tile line (.agents/rules/historical-verification.md §2b). The tile rule is evaluated with
 *  MapLibre's own filter compiler, not re-implemented.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { featureFilter } from '@maplibre/maplibre-gl-style-spec';
import { conversionProblem, parseWareki, rowDay, statements, groundIndex, linesFor, applyCalendar, calendarProblems } from '../scripts/histadmin/calendar.mjs';
import { historyNames } from '../scripts/hist-fidelity.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const ledger = JSON.parse(read('data/hist-admin-edges.json'));
const cal = ledger.calendar;
function evalGlobal(file) {
  const ctx = { window: {}, console };
  ctx.window.window = ctx.window;
  vm.createContext(ctx);
  vm.runInContext(read(file), ctx, { filename: file });
  return ctx.window;
}
const HS = evalGlobal('js/hist-scale.js').IntMapHistScale;
function tier(file) { const w = {}; new Function('window', read(file))(w); return Object.values(w)[0]; }

test('① the Japanese date is read with its era, 元年 and 閏', () => {
  assert.deepEqual(parseWareki('明治5年9月28日'), { year: 1872, month: 9, leap: false, day: 28 });
  assert.deepEqual(parseWareki('明治元年閏4月'), { year: 1868, month: 4, leap: true, day: null });
  assert.equal(parseWareki('令和5年1月1日'), null, 'an era outside the lunisolar years is not guessed at');
});

test('② the conversion is checked against the Chinese calendar — the reviewed days pass, upstream\'s digits do not', () => {
  for (const r of cal.reviewed) {
    assert.equal(conversionProblem(r.wareki, r.at), null, `${r.id} ${r.edge}: ${r.wareki} → ${r.at}`);
    /* the error being corrected: the lunisolar digits as an ISO date are a month away, and the check says so */
    if (!r.at.includes('/')) assert.notEqual(conversionProblem(r.wareki, r.raw), null, `${r.raw} must not pass as ${r.wareki}`);
  }
  assert.notEqual(conversionProblem('明治3年11月', '1870-11-01/1870-11-30'), null, 'the Gregorian November 1870 is not 明治3年11月');
  for (const x of cal.refuted) assert.equal(conversionProblem(x.wareki, x.raw), null, `${x.raw} is the Gregorian day of ${x.wareki}`);
  /* 明治5年12月2日 is the last lunisolar day; the Tenpō months begin up to a day apart from the Chinese ones */
  assert.equal(conversionProblem('明治5年12月2日', '1872-12-31'), null);
  assert.equal(conversionProblem('明治5年9月1日', '1872-10-03'), null);
});

test('③ 滋賀県 is drawn from the reviewed day in the bundle, with upstream\'s words kept beside it', () => {
  const d = tier('data/hist-admin1.js');
  const f = d.feats.find((x) => x[10] === 2796629);
  assert.deepEqual(f.slice(2, 5), [1872, 10, 30]);
  assert.equal(d.dates[2796629].start.raw, '1872-09-28', 'the source\'s own date is not overwritten');
  assert.equal(d.dates[2796629].start.corrected.wareki, '明治5年9月28日');
  const r = d.feats.find((x) => x[10] === 2890077);
  assert.deepEqual(r.slice(2, 5), [1872, 10, 16], '琉球藩 from 明治5年9月14日');
  /* a lunisolar MONTH is its Gregorian span: from its first day, and ending (exclusive) the day after its last */
  const v = tier('data/hist-admin3.js');
  assert.deepEqual(v.feats.find((x) => x[10] === 2826437).slice(2, 5), [1870, 12, 22]);
  assert.deepEqual(v.feats.find((x) => x[10] === 2826436).slice(5, 8), [1871, 1, 21]);
  assert.deepEqual(rowDay('1870-12-22/1871-01-20', 'end'), [1871, 1, 21]);
});

test('④ the tile line of the same relation reads the same day — expression (MapLibre) and predicate agree', () => {
  const d = tier('data/hist-admin1.js');
  const shiga = d.lines.find((l) => l.id === 2796629 && l.edge === 'start');
  const omi = d.lines.find((l) => l.id === 2796631 && l.edge === 'end');
  assert.ok(shiga && omi, 'the level-3/4 tier carries 滋賀県\'s start and 近江国\'s end for its tiles');
  const way = shiga.ways[0];
  const line = { type: 'administrative', admin_level: 4, osm_id: way, start_date: '1872-09-28', start_decdate: 1872.7418 };
  const shared = { ...line, osm_id: 1 };                                   /* another way with the same string */
  const other = { type: 'administrative', admin_level: 4, osm_id: way, start_date: '1600-10-21', start_decdate: 1600.80464 };
  const ending = { type: 'administrative', admin_level: 4, osm_id: omi.ways[0], end_date: '1872-09-27', end_decdate: 1872.73907, start_date: '0701' };
  const at = (y, m, dd) => HS.decYear(y, m, dd);
  const draws = (p, t, rev) => featureFilter(HS.ohmFilter(3, 4, t, rev), 'layers[imta-vt-line].filter').filter({ zoom: 6 }, { type: 2, properties: p });
  for (const [p, t, want] of [
    [line, at(1872, 10, 15), false], [line, at(1872, 10, 30), true],      /* drawn from 明治5年9月28日 = 1872-10-30 */
    [shared, at(1872, 10, 15), true],                                     /* not one of the relation's ways: as upstream says */
    [other, at(1872, 10, 15), true],
    [ending, at(1872, 10, 15), true], [ending, at(1872, 10, 29), false],  /* 近江国 until the day before */
  ]) {
    assert.equal(draws(p, t, d.lines), want, `expression at ${t} on ${JSON.stringify(p)}`);
    assert.equal(HS.inForce(p, 3, 4, t, d.lines), want, `predicate at ${t} on ${JSON.stringify(p)}`);
  }
  /* without revisions the rule is what it was: upstream's day */
  assert.equal(draws(line, at(1872, 10, 15)), true);
  assert.equal(HS.inForce(line, 3, 4, at(1872, 10, 15)), true);
});

test('⑤ the gate finds the error when the correction is missing, and passes the shipped state', () => {
  const bs = ['data/hist-admin1.js', 'data/hist-admin3.js'].map((file) => ({ file, b: tier(file) }));
  assert.deepEqual(calendarProblems(bs, ledger, historyNames), []);
  /* a statement nobody judged */
  const extra = { ...ledger, calendar: { ...cal, found: [...cal.found, { id: 1, edge: 'start', raw: '1869-09-20', name: 'x', level: 4, ways: [] }] } };
  assert.ok(calendarProblems(bs, extra, historyNames).some(([t]) => t === 'calendar-unjudged'));
  /* a row that still carries upstream's digits */
  const stale = bs.map(({ file, b }) => ({ file, b: { ...b, feats: b.feats.map((f) => (f[10] === 2796629 ? [f[0], f[1], 1872, 9, 28, ...f.slice(5)] : f)) } }));
  assert.ok(calendarProblems(stale, ledger, historyNames).some(([t]) => t === 'calendar-not-applied'));
  /* a tier whose tile lines were not written */
  const bare = bs.map(({ file, b }) => ({ file, b: { ...b, lines: undefined } }));
  assert.ok(calendarProblems(bare, ledger, historyNames).some(([t]) => t === 'calendar-lines'));
  /* applying is idempotent on the shipped state */
  const copy = bs.map(({ file, b }) => ({ file, data: JSON.parse(JSON.stringify(b)) }));
  assert.deepEqual(applyCalendar(copy, ledger), []);
  assert.deepEqual(linesFor([7], cal), [], 'the month statements draw no tile line of their own');
});

test('⑥ a relation belongs to the country holding most of its vertices — 琉球藩 (mostly sea) is Japan\'s, 済州 is not', () => {
  const sq = (x, y, d = 1) => ({ type: 'Polygon', coordinates: [[[x, y], [x + d, y], [x + d, y + d], [x, y + d], [x, y]]] });
  const at = groundIndex([{ i: 'JPN', g: sq(127, 26) }, { i: 'KOR', g: sq(126, 33) }], [120, 20, 140, 40]);
  const rel = (id, pts, tags) => ({ id, tags: { admin_level: '4', ...tags }, ways: [{ id: id * 10, pts }] });
  const sea = [[124, 24], [124.5, 24], [125, 24]];
  const found = statements([
    rel(1, [[127.5, 26.5], [127.2, 26.2], ...sea], { start_date: '1872-09-14' }),   /* 2 of 5 on land, all of it Japan */
    rel(2, [[126.5, 33.5], [126.2, 33.2]], { start_date: '1295-05-31' }),
    rel(3, [[127.5, 26.5]], { start_date: '1873-01-01' }),                         /* the first Gregorian day */
    rel(4, [[127.5, 26.5]], { start_date: '1872' }),                               /* a year names no day */
  ], at);
  assert.deepEqual(found.map((f) => f.id), [1]);
});
