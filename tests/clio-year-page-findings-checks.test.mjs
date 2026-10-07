/* ============================================================================
 *  (clio-year-page-findings) four claims the historical map made, found by reading the year pages against history
 *  (.agents/rules/historical-verification.md §2-1/§2-2) and judged in scripts/histclio/review.json:
 *    1. Greenland in 1945 was drawn as «United States of America» (Cliopatria 1941–1945). The 1941 defence agreement
 *       recognised Danish sovereignty; the ground is Denmark's — `ground.rows` with `e` (between two of its own rows).
 *    2. «Commonwealth of England» was named from 1645 (declared 1649) and to 1661 (Restoration 1660).
 *    3. «Kingdom of Poland» from 962 — refuted (name-not-claim) by the earlier review; unchanged.
 *    4. «French Fourth Republic» was named in 1945 (constitution of October 1946).
 *  and two notes: «Kingdom of Hungary» in 1000 (refuted, date-disputed at whole-year resolution) and the CShapes name
 *  «Egypt (UK)» from 1886 (the rule stands: Britain governed Egypt from 1882).
 *  Asked of the SHIPPED bundle and of the page's own module, never of the source text.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { heldFindingsOf, groundJudged, judgedKeys } from '../scripts/build-hist-clio.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = (rel, g) => { const w = {}; new Function('window', readFileSync(join(ROOT, rel), 'utf8'))(w); return w[g]; };
const ymd = (y, m, d) => y * 10000 + m * 100 + d;
const inForce = (f, t) => ymd(f[2], f[3], f[4]) <= t && t < ymd(f[5], f[6], f[7]);
const inRing = (x, y, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
const review = JSON.parse(readFileSync(join(ROOT, 'scripts', 'histclio', 'review.json'), 'utf8'));
const d = load('data/hist-clio.js', '__HISTCLIO');
const at = (lng, lat, t) => d.feats.filter((f) => inForce(f, t) && f[8].some((p) => inRing(lng, lat, d.rings[p[0]]) && !p.slice(1).some((h) => inRing(lng, lat, d.rings[h]))));
const names = (fs) => fs.map((f) => f[0].en || '(withheld ' + f[9].wn + ' ' + f[9].ws + ' ' + f[9].wy + ')');
const PLACES = { Greenland: [-42, 72], Nuuk: [-51.5, 64.4], London: [-0.12, 51.5], Kerguelen: [69.5, -49.3], Esztergom: [18.74, 47.79], Gniezno: [17.6, 52.53] };

test('① Greenland 1941–1945 is Denmark\'s, not «United States of America» — and says it is drawn back', () => {
  for (const y of [1941, 1943, 1945]) for (const p of ['Greenland', 'Nuuk']) {
    const fs = at(...PLACES[p], ymd(y, 7, 1)), n = names(fs);
    assert.ok(!n.includes('United States of America'), p + ' in ' + y + ' is still drawn as the United States: ' + n.join(', '));
    const dk = fs.find((f) => f[0].en === 'Denmark');
    assert.ok(dk, p + ' in ' + y + ' is not Denmark: ' + n.join(', '));
    assert.deepEqual([dk[1], dk[9].hs, dk[9].he, dk[9].hy, dk[9].ho], ['Q35', 1941, 1945, 1946, 'United States of America'], p + ' ' + y + ': the row does not say which years and whose outline');
  }
  /* no Cliopatria row anywhere carries the name on Greenland in those years */
  const us = d.feats.filter((f) => f[0].en === 'United States of America' && f[2] >= 1941 && f[2] <= 1945);
  assert.deepEqual(us.map((f) => f.slice(2, 8).join('-')), [], 'a United States row is still shipped for 1941–1945');
  /* the bounds: Cliopatria's own «Greenland» before 1941, its own «Denmark» from 1946 */
  assert.ok(names(at(...PLACES.Greenland, ymd(1940, 7, 1))).includes('Greenland'), 'Greenland in 1940 is no longer Cliopatria\'s «Greenland»');
  const own = at(...PLACES.Greenland, ymd(1946, 7, 1)).find((f) => f[0].en === 'Denmark');
  assert.ok(own && own[9].hy == null, 'Denmark in 1946 is not Cliopatria\'s own row');
  const R = review.ground.rows.find((r) => r.name === 'Denmark');
  assert.deepEqual([R.s, R.e, R.over, R.wd], [1941, 1945, ['United States of America'], 'Q35']);
  assert.match(R.history, /fully recognizing the sovereignty of the Kingdom of Denmark over Greenland/);
});

test('①b the gate\'s own finder still sees every ground finding listed', () => {
  const facts = JSON.parse(readFileSync(join(ROOT, 'scripts', 'histclio', 'wikidata.json'), 'utf8')).facts;
  const found = heldFindingsOf(d.feats, d.rings, facts, d.ids), listed = groundJudged(review.ground);
  for (const p of review.ground.pending) listed.add(p.name + '|' + p.over);
  assert.deepEqual(found.filter((x) => !listed.has(x.name + '|' + x.over)), []);
});

test('② «Commonwealth of England» is named 1649–1660 only; the shape stays, withheld, on either side', () => {
  const R = review.rows.find((r) => r.name === 'Commonwealth of England');
  assert.deepEqual([R.s, R.e, R.wd], [1649, 1660, 'Q330362']);
  const named = d.feats.filter((f) => f[0].en === 'Commonwealth of England');
  assert.ok(named.length && named.every((f) => f[2] >= 1649 && f[5] - 1 <= 1660), 'named outside 1649–1660: ' + named.map((f) => f[2] + '–' + f[5]).join(', '));
  assert.ok(names(at(...PLACES.London, ymd(1650, 7, 1))).includes('Commonwealth of England'), 'London in 1650 is not the Commonwealth');
  for (const [y, side, wy] of [[1645, 'start', 1649], [1648, 'start', 1649], [1661, 'end', 1660]]) {
    const n = names(at(...PLACES.London, ymd(y, 7, 1)));
    assert.ok(!n.includes('Commonwealth of England'), 'London in ' + y + ' is still named the Commonwealth');
    assert.ok(n.includes('(withheld Commonwealth of England ' + side + ' ' + wy + ')'), 'London in ' + y + ' does not carry the withheld shape: ' + n.join(', '));
  }
});

test('③ «Kingdom of Poland» before 1025 stays refuted as a title of the continuing Piast state', () => {
  const r = review.refuted.find((x) => x.name === 'Kingdom of Poland' && x.side === 'start');
  assert.equal(r && r.why, 'name-not-claim');
  assert.ok(names(at(...PLACES.Gniezno, ymd(1000, 7, 1))).includes('Kingdom of Poland'), 'Gniezno in 1000 lost the name the review keeps');
});

test('④ «French Fourth Republic» is not named before 1946; Kerguelen in 1945 is withheld', () => {
  const R = review.rows.find((r) => r.name === 'French Fourth Republic');
  assert.deepEqual([R.s, R.e, R.wd], [1946, undefined, 'Q69829']);
  assert.ok(!d.feats.some((f) => f[0].en === 'French Fourth Republic' && f[2] < 1946), 'the Fourth Republic is still named before 1946');
  const n45 = names(at(...PLACES.Kerguelen, ymd(1945, 7, 1)));
  assert.ok(n45.includes('(withheld French Fourth Republic start 1946)') && !n45.includes('French Fourth Republic'), 'Kerguelen in 1945: ' + n45.join(', '));
  assert.ok(names(at(...PLACES.Kerguelen, ymd(1947, 7, 1))).includes('French Fourth Republic'), 'Kerguelen in 1947 lost the name');
});

test('⑤ the notes: Hungary in 1000 is judged (date-disputed) and keeps its name; every judgement is one name/side', () => {
  const h = review.refuted.find((x) => x.name === 'Kingdom of Hungary');
  assert.deepEqual([h.side, h.why], ['start', 'date-disputed']);
  assert.match(h.history, /25 December 1000.*1 January 1001/);
  assert.ok(names(at(...PLACES.Esztergom, ymd(1000, 7, 1))).includes('Kingdom of Hungary'));
  const keys = [...review.rows, ...review.refuted].length;
  assert.ok(judgedKeys(review).size >= keys, 'a name/side is judged twice');
});

test('⑥ the page: «Egypt (UK)» from 1886 to the record\'s 1922 boundary, and the card for a ground held between two rows (en + jp)', async () => {
  const { timeBorders } = await import('../scripts/histeras/time-borders.mjs');
  const { api } = await timeBorders({ lang: 'en' });
  assert.equal(api.csName('Egypt', 651, 1900, 7, 1, null), 'Egypt (UK)');
  assert.equal(api.csName('Egypt', 651, 1915, 7, 1, null), 'Egypt (UK)');
  assert.equal(api.csName('Egypt', 651, 1923, 7, 1, null), 'Egypt');
  const f = { properties: { NAME: 'Denmark', _heldFrom: 1941, _heldTo: 1945, _heldShape: 1946, _heldOver: 'United States of America' } };
  for (const [lang, re] of [['en', /from 1941 to 1945.*«United States of America».*of 1946 is drawn here/], ['jp', /1941.*から.*1945.*までこの土地をこの政体のもの.*「United States of America」.*1946.*輪郭/]]) {
    const { api: a } = await timeBorders({ lang });
    assert.match(a.typeNote(f), re, lang + ': the card does not say the ground is held between two rows');
  }
  /* the first-row form is unchanged */
  const g = { properties: { NAME: 'Mahdist State', _heldFrom: 1885, _heldShape: 1890, _heldOver: 'British Africa' } };
  assert.match(api.typeNote(g), /from 1885.*of 1890.*drawn back to 1885/);
});

/* ══ (clio-year-page-findings, second set) five findings from the place-sovereignty timelines ══════════════════════ */
const P2 = { Kyoto: [135.76, 35.01], Changan: [108.94, 34.26], Cairo: [31.24, 30.04], Jerusalem: [35.23, 31.78], Nanjing: [118.8, 32.06] };

test('⑦ the Kenmu Restoration ends in 1336; the Xin is named 9–23 only', () => {
  assert.ok(names(at(...P2.Kyoto, ymd(1334, 7, 1))).includes('Kenmu Restoration'), 'Kyoto in 1334 lost the restoration');
  for (const y of [1337, 1340, 1343]) {
    const n = names(at(...P2.Kyoto, ymd(y, 7, 1)));
    assert.ok(!n.includes('Kenmu Restoration') && n.includes('(withheld Kenmu Restoration end 1336)'), 'Kyoto in ' + y + ': ' + n.join(', '));
  }
  for (const [y, want] of [[7, '(withheld Xin Dynasty start 9)'], [15, 'Xin Dynasty'], [26, '(withheld Xin Dynasty end 23)']]) {
    const n = names(at(...P2.Changan, ymd(y, 7, 1)));
    assert.ok(n.includes(want), 'Chang\'an in ' + y + ' is not ' + want + ': ' + n.join(', '));
  }
});

test('⑧ Cairo and Jerusalem are Ottoman from 1517, carried from the 1519 outline; Nanjing is Ming from 1368', () => {
  assert.ok(names(at(...P2.Cairo, ymd(1516, 7, 1))).includes('Mamluk Sultanate'), 'Cairo in 1516 is no longer Mamluk');
  for (const [p, y] of [['Cairo', 1517], ['Cairo', 1518], ['Jerusalem', 1517], ['Jerusalem', 1518]]) {
    const fs = at(...P2[p], ymd(y, 7, 1)), n = names(fs);
    assert.ok(!n.includes('Mamluk Sultanate'), p + ' in ' + y + ' is still Mamluk');
    const o = fs.find((f) => f[0].en === 'Ottoman Empire');
    assert.ok(o, p + ' in ' + y + ' is not Ottoman: ' + n.join(', '));
    assert.deepEqual([o[9].hs, o[9].he, o[9].hy, o[9].ho], [1517, 1518, 1519, 'Mamluk Sultanate']);
  }
  assert.ok(names(at(...P2.Nanjing, ymd(1367, 7, 1))).includes('Yuan Dynasty'), 'Nanjing in 1367 is no longer drawn as Cliopatria states');
  for (const y of [1368, 1370, 1374]) {
    const m = at(...P2.Nanjing, ymd(y, 7, 1)).find((f) => f[0].en === 'Ming Dynasty');
    assert.ok(m && m[9].hs === 1368 && m[9].hy === 1375 && m[9].he == null && m[9].ho === 'Yuan Dynasty', 'Nanjing in ' + y + ' is not the Ming drawn back to 1368');
  }
  const sm = review.refuted.find((x) => x.name === 'Southern Ming');
  assert.deepEqual([sm.side, sm.why], ['end', 'date-disputed']);
});

/* ══ (clio-year-page-findings) a narrow piece that is land is ground — when the record it belongs to draws the shore more finely ══ */
test('⑨ the rule: a narrow land piece of the finer shore is ground; sea, a coarser record\'s fringe, and the builder\'s own hairlines are not', async () => {
  const { isGround, finerShore, landShare } = await import('../scripts/build-hist-clio.mjs');
  const sq = (x, y, w, h) => [[[x, y], [x + w, y], [x + w, y + h], [x, y + h]]];
  /* who is believed is the measured coastal registration of each record (scripts/build-border-coast.mjs inlandKmFor) */
  assert.equal(finerShore('__HISTERASREST', [{ rec: '__HISTCLIO' }]), true, 'a sheet (6 km) cut by Cliopatria (10 km) is the finer shore');
  assert.equal(finerShore('__HISTCLIO', [{}]), false, 'Cliopatria cut by OpenHistoricalMap/CShapes is the coarser shore');
  assert.equal(finerShore('__HISTERASREST', [{ rec: '__HISTCLIO' }, {}]), false, 'every cutter must be coarser');
  const anatolia = sq(33, 39, 0.05, 0.5), blackSea = sq(34, 43, 0.05, 0.5), hair = sq(33, 39, 0.002, 0.5);
  assert.equal(landShare(anatolia), 1); assert.equal(landShare(blackSea), 0);
  assert.equal(isGround(anatolia, true), true);
  assert.equal(isGround(anatolia, false), false, 'a coarser record\'s narrow land fringe came back');
  assert.equal(isGround(blackSea, true), false, 'a strip of sea is kept');
  assert.equal(isGround(hair, true), false, 'a gap narrower than this builder\'s own simplification is kept');
  /* a strip that is land in one place and sea in the next is judged where it lies (the SLIVER_W grid) */
  const { groundOf } = await import('../scripts/build-hist-clio.mjs');
  const shore = [[[34, 41.6], [34.05, 41.6], [34.05, 42.6], [34, 42.6]]];   /* Anatolia's north coast into the Black Sea */
  assert.ok(landShare(shore) < 0.5, 'the fixture is no longer mostly sea as a whole');
  const parts = groundOf(shore, true);
  assert.ok(parts.length > 0 && parts.every((p) => landShare(p) >= 0.5), 'the land part of a half-sea strip is dropped with it');
  assert.deepEqual(groundOf(shore, false), [], 'a coarser record\'s strip is kept');
});

test('⑩ the old city of Istanbul is drawn from the sheets 400 BC–1689 (it was blank)', () => {
  const R = load('data/hist-eras-rest.js', '__HISTERASREST');
  const [x, y] = [28.97, 41.01];
  const inP = (p) => inRing(x, y, R.rings[p[0]]) && !p.slice(1).some((h) => inRing(x, y, R.rings[h]));
  for (const [key, want] of [['300', null], ['1000', 'Byzantine Empire'], ['1500', 'Ottoman Empire'], ['1650', 'Ottoman Empire']]) {
    const sn = R.snaps.find((s) => s.key === key);
    const hit = sn.feats.filter((f) => f[2].some(inP)).map((f) => f[0].en);
    assert.ok(hit.length > 0, 'Istanbul on the ' + key + ' sheet is still blank');
    if (want) assert.ok(hit.includes(want), 'Istanbul on the ' + key + ' sheet is ' + hit.join(', '));
  }
});
