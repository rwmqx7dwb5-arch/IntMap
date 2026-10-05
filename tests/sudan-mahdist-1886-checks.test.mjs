/* ============================================================================
 *  (sudan-mahdist-1886) a polity's ground drawn under a continuing row before Cliopatria's first row for it.
 *  Production, build 076f908: on 1 July 1886 the Sudan was drawn as «British Africa» (and its realm «British
 *  Empire») — Cliopatria's «British Africa» 1885–1889 carries Egypt and the Sudan, its «Mahdist State» begins in
 *  1890, and Khartoum fell to the Mahdi on 26 January 1885. scripts/build-hist-clio.mjs `heldFindingsOf` finds the
 *  shape, scripts/histclio/review.json `ground` judges it, and the build draws the polity back from history's year.
 *  Asked of the SHIPPED bundle and of the page's own module, never of the source text.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { heldFindingsOf, groundJudged } from '../scripts/build-hist-clio.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = (rel, g) => { const w = {}; new Function('window', readFileSync(join(ROOT, rel), 'utf8'))(w); return w[g]; };
const ymd = (y, m, d) => y * 10000 + m * 100 + d;
const inForce = (f, t) => ymd(f[2], f[3], f[4]) <= t && t < ymd(f[5], f[6], f[7]);
const inRing = (x, y, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
const review = JSON.parse(readFileSync(join(ROOT, 'scripts', 'histclio', 'review.json'), 'utf8'));
const d = load('data/hist-clio.js', '__HISTCLIO');
/* the Cliopatria rows (realms included — the page draws their outline and name) holding a point at an instant */
const at = (lng, lat, t) => d.feats.filter((f) => inForce(f, t) && f[8].some((p) => inRing(lng, lat, d.rings[p[0]]) && !p.slice(1).some((h) => inRing(lng, lat, d.rings[h]))));
const PLACES = { Khartoum: [32.53, 15.6], 'El Obeid': [30.2, 13.18], Omdurman: [32.48, 15.65] };

test('① the Sudan of 1885–1889 is the Mahdist State, not «British Africa» nor the British Empire', () => {
  for (const [y, m] of [[1885, 2], [1886, 7], [1888, 7], [1889, 12]]) for (const [nm, [x, yy]] of Object.entries(PLACES)) {
    const names = at(x, yy, ymd(y, m, 1)).map((f) => f[0].en || '(withheld ' + f[9].wn + ')');
    assert.ok(names.includes('Mahdist State'), nm + ' on ' + y + '-' + m + ' is not the Mahdist State: ' + names.join(', '));
    assert.ok(!names.some((n) => /British/.test(n)), nm + ' on ' + y + '-' + m + ' is still drawn as ' + names.join(', '));
  }
  /* the bounds: before 1885 the record stays as Cliopatria states it (the Khedivate held Khartoum until the siege
     ended), and from 1890 the Mahdist State is Cliopatria's own row */
  assert.ok(at(...PLACES.Khartoum, ymd(1884, 7, 1)).some((f) => f[0].en === 'Khedivate of Egypt'), 'Khartoum in 1884 is no longer the Khedivate');
  assert.ok(at(...PLACES.Khartoum, ymd(1891, 7, 1)).some((f) => f[0].en === 'Mahdist State' && !(f[9] && f[9].hy != null)), 'the Mahdist row of 1891 is not Cliopatria\'s own');
});

test('② the drawn-back rows say they are drawn back — from history\'s year, with whose outline, in place of what', () => {
  const R = review.ground.rows.find((r) => r.name === 'Mahdist State');
  assert.deepEqual([R.s, R.over, R.wd], [1885, ['British Africa'], 'Q3125368']);
  const back = d.feats.filter((f) => f[0].en === 'Mahdist State' && f[9] && f[9].hy != null);
  assert.ok(back.length, 'no Mahdist row is drawn back');
  assert.equal(Math.min(...back.map((f) => ymd(f[2], f[3], f[4]))), ymd(1885, 1, 1));
  assert.ok(back.every((f) => f[9].hy === 1890 && f[9].hs === 1885 && f[9].ho === 'British Africa' && f[1] === 'Q3125368' && ymd(f[5], f[6], f[7]) <= ymd(1890, 1, 1)), 'a drawn-back row does not carry hy 1890 / hs 1885 / ho «British Africa» and the verified QID');
  /* «British Africa» keeps the rest of its ground in those years (Egypt), only the Sudan is taken from it */
  assert.ok(at(31.24, 30.04, ymd(1885, 7, 1)).some((f) => f[0].en === 'British Africa'), 'Cairo in 1885 lost «British Africa» too');   /* CShapes states Egypt from 1886 */
});

test('②b the first row is upstream\'s, and the ground measured is the one left after the records above', () => {
  const facts = JSON.parse(readFileSync(join(ROOT, 'scripts', 'histclio', 'wikidata.json'), 'utf8')).facts;
  const found = heldFindingsOf(d.feats, d.rings, facts, d.ids);
  /* the Hotaki Dynasty begins in 1709 upstream, as history does; OHM states Kandahar until 1713 */
  assert.equal(d.ids['Hotaki Dynasty'][0], 1709);
  assert.ok(!found.some((x) => x.name === 'Hotaki Dynasty'), 'a row the records above answered for is read as a late start');
  /* the Talpur residue is the Baloch country, not Sindh — refuted, not carried back */
  const t = review.ground.refuted.find((r) => r.name === 'Talpur Dynasty');
  assert.equal(t && t.why, 'not-its-ground');
  assert.ok(found.some((x) => x.name === 'Talpur Dynasty' && x.over === 'Durrani Empire'), 'the Talpur finding is no longer raised — its refutation is dead');
  assert.ok(!d.feats.some((f) => f[0].en === 'Talpur Dynasty' && f[9] && f[9].hy != null), 'the Talpur residue is carried back');
});

test('③ the finding is a shape, not a name: a continuing row holding a later polity\'s first ground', () => {
  const sq = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const rings = [sq(0, 0, 4, 4), sq(-2, -2, 6, 6)];
  const row = (en, q, s, e, ring, meta = {}) => [{ en }, q, s, 1, 1, e, 1, 1, [[ring]], meta];
  const facts = { Q1: { s: [1885] }, Q2: { s: [1888] } };
  /* P (1890, Wikidata 1885) under X (1880–1900, continuing): found, with the years X held it */
  const found = heldFindingsOf([row('X', null, 1880, 1900, 1), row('P', 'Q1', 1890, 1899, 0)], rings, facts);
  assert.deepEqual(found.map((f) => [f.name, f.over, f.from, f.to, f.first, f.wd]), [['P', 'X', 1885, 1889, 1890, 1885]]);
  /* a predecessor that ends where P begins is a succession, not a claim kept */
  assert.equal(heldFindingsOf([row('X', null, 1880, 1890, 1), row('P', 'Q1', 1890, 1899, 0)], rings, facts).length, 0);
  /* inside HELD_YEARS the two records differ by a snapshot's rounding */
  assert.equal(heldFindingsOf([row('X', null, 1880, 1900, 1), row('P', 'Q2', 1890, 1899, 0)], rings, facts).length, 0);
  /* a realm is not a finding of its own (its members are) */
  assert.equal(heldFindingsOf([row('X', null, 1880, 1900, 1, { r: 1 }), row('P', 'Q1', 1890, 1899, 0)], rings, facts).length, 0);
});

test('④ every ground finding the shipped bundle raises is judged or counted; the line is «did the other state govern there»', () => {
  const facts = JSON.parse(readFileSync(join(ROOT, 'scripts', 'histclio', 'wikidata.json'), 'utf8')).facts;
  const found = heldFindingsOf(d.feats, d.rings, facts, d.ids), listed = groundJudged(review.ground);
  for (const p of review.ground.pending) listed.add(p.name + '|' + p.over);
  assert.deepEqual(found.filter((x) => !listed.has(x.name + '|' + x.over)), []);
  assert.ok(!found.some((x) => x.name === 'Mahdist State'), 'the Mahdist State is still raised after its judgement is applied');
  for (const r of review.ground.refuted) assert.ok(['ruled', 'not-its-ground', 'date-disputed', 'name-not-claim', 'other-identity'].includes(r.why) && r.note.length > 40, r.name + ': a refutation needs a reason and a sentence of history');
  for (const r of review.ground.rows) assert.ok(r.history.length > 40 && /^Q\d+$/.test(r.wd), r.name + ': an applied judgement needs history and the item');
  /* every finding whose first row is from 1700 on has a verdict — the years of the partition of Africa among them */
  assert.deepEqual(review.ground.pending.filter((p) => p.first >= 1700), []);
});

test('⑤ the card says the outline is carried back, in the reader\'s language (en + jp)', async () => {
  const { timeBorders } = await import('../scripts/histeras/time-borders.mjs');
  const f = { properties: { NAME: 'Mahdist State', _heldFrom: 1885, _heldShape: 1890, _heldOver: 'British Africa' } };
  for (const [lang, re] of [['en', /from 1885.*of 1890.*«British Africa».*drawn back to 1885/], ['jp', /1885.*から治めていた.*1890.*「British Africa」.*1885.*遡らせて/]]) {
    const { api } = await timeBorders({ lang });
    assert.match(api.typeNote(f), re, lang + ': the card does not say the outline is drawn back');
  }
});
