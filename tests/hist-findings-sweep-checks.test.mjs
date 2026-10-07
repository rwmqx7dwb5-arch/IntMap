/* ============================================================================
 *  (hist-findings-sweep) the findings the two 2026-10-07 reviews left open, judged by history and asked of the
 *  SHIPPED bundles and the modules that read them — never of the ledgers' own words:
 *    1. the Faroe Islands 1941–1944 were Danish under British occupation, not «Kingdom of Great Britain» (and Danish, not
 *       nameless, from the Treaty of Kiel to 1940);
 *    2. Kerguelen and Réunion were never «French Indochina»; Kerguelen 1943 was not Vichy's (review.json `places`);
 *    3. East Greenland 1932–1935 was Danish (PCIJ, 5 April 1933), not «Kingdom of Norway»;
 *    4. OpenHistoricalMap's «US occupation of Greenland» was no unit of government (hist-admin-edges `withdrawn`);
 *    5. «Southern Ming» 1673–1682 on the mainland was the Revolt of the Three Feudatories; Taiwan keeps the name;
 *    6. no «Okinawa» prefecture 1946-01-29 – 1972-05-14 (a subdivision lies in its own country); the Kurils from Urup to
 *       Shumshu are inside 北海道庁 in 1891–1943;
 *    7. CShapes' signing days: the finder (scripts/cshapes/effective.mjs) and the four changes moved to the day the
 *       ground changed hands (Taiwan 1895-06-02, Hawaii 1898-08-12, Ireland 1922-12-06);
 *    A. a narrow land piece is never lost where a record states it: the composition covers the land of port cities as
 *       well as the records it was cut from (a grid of land points, not one point);
 *    B. Istanbul is «Constantinople» to an English reader for 1453–1923 (the record states both of its spans' starts);
 *    C. the era sheets' misspellings «Scottalnd», «Scottland», «Boethuk», «Prot-Altaic …» are corrected to the corpus.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { changeDays, candidatesOf, effectiveProblems, NEAR } from '../scripts/cshapes/effective.mjs';
import { applyReview as csApply } from '../scripts/build-cshapes.mjs';
import { applyPlaces } from '../scripts/build-hist-clio.mjs';
import { edgeProblems, applyWithdrawn } from '../scripts/histadmin/edges.mjs';
import { applySpelling, spellingProblems } from '../scripts/histeras/spelling.mjs';
import { water } from '../scripts/build-border-coast.mjs';
import { asClassicScript } from './app-source.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
const load = (rel, g) => { const w = {}; new Function('window', rd(rel))(w); return w[g]; };
const json = (rel) => JSON.parse(rd(rel));
const ymd = (y, m, d) => y * 10000 + m * 100 + d;
const k0 = (f) => ymd(f[2], f[3], f[4]), k1 = (f) => ymd(f[5], f[6], f[7]);
const inRing = (x, y, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
const inPoly = (x, y, rings, p) => inRing(x, y, rings[p[0]]) && !p.slice(1).some((h) => inRing(x, y, rings[h]));
/* rows in force at t containing the point; `excl` = exclusive end (the composed bundles), else inclusive (CShapes) */
const at = (d, x, y, t, excl = true) => d.feats.filter((f) => k0(f) <= t && (excl ? t < k1(f) : t <= k1(f)) && f[8].some((p) => inPoly(x, y, d.rings, p)));
const nm = (f) => (f[0] && (typeof f[0] === 'string' ? f[0] : f[0].en)) || '';

const clio = load('data/hist-clio.js', '__HISTCLIO');
const review = json('scripts/histclio/review.json');
const P = { torshavn: [-6.77, 62.01], kerguelen: [69.5, -49.3], reunion: [55.5, -21.1], myggbukta: [-22, 73.5], nuuk: [-51.7, 64.18],
  guangzhou: [113.26, 23.13], kunming: [102.7, 25.04], tainan: [120.2, 23.0], naha: [127.68, 26.21], amami: [129.5, 28.35], kagoshima: [130.55, 31.6],
  paramushir: [155.9, 50.3], urup: [150.0, 45.9], shumshu: [156.35, 50.75] };

test('1. the Faroe Islands 1941–1944 are Denmark\'s, drawn back from its own 1945 outline; no British row holds them', () => {
  for (const y of [1941, 1942, 1944]) {
    const fs = at(clio, ...P.torshavn, ymd(y, 7, 1)), n = fs.map(nm);
    assert.ok(!n.includes('Kingdom of Great Britain') && !n.includes('British Empire'), 'Tórshavn ' + y + ' is still British: ' + n.join(', '));
    const dk = fs.find((f) => nm(f) === 'Denmark');
    assert.ok(dk, 'Tórshavn ' + y + ' is not Denmark: ' + n.join(', '));
    assert.deepEqual([dk[9].hs, dk[9].he, dk[9].hy, dk[9].ho], [1941, 1944, 1945, 'Kingdom of Great Britain']);
  }
  /* the earlier judgement of the same polity (Greenland 1941–1945) still stands beside it */
  const g = at(clio, ...P.nuuk, ymd(1943, 7, 1)).find((f) => nm(f) === 'Denmark');
  assert.deepEqual(g && [g[9].hs, g[9].he, g[9].hy], [1941, 1945, 1946], 'the Greenland judgement was disturbed by the second Denmark row');
  /* …and before the occupation: the Faroes stayed Danish at Kiel (1814); the withheld «Denmark-Norway» left them nameless */
  for (const y of [1925, 1930, 1937, 1940]) {
    const dk = at(clio, ...P.torshavn, ymd(y, 7, 1)).find((f) => nm(f) === 'Denmark');
    assert.deepEqual(dk && [dk[9].hs, dk[9].he, dk[9].hy, dk[9].ho], [1815, 1940, 1945, 'Denmark-Norway'], 'Tórshavn ' + y + ' is not Denmark');
  }
  /* before 1924 OpenHistoricalMap answers above Cliopatria, and says Denmark */
  assert.ok(at(load('data/hist-borders.js', '__HISTB'), ...P.torshavn, ymd(1820, 7, 1)).some((f) => nm(f) === 'Denmark'));
  assert.ok(at(load('data/hist-borders-late.js', '__HISTBLATE'), ...P.torshavn, ymd(1900, 7, 1)).some((f) => nm(f) === 'Denmark'));
  const R = review.ground.rows.filter((r) => r.name === 'Denmark').map((r) => [r.s, r.e, r.over.join()]);
  assert.deepEqual(R, [[1941, 1945, 'United States of America'], [1941, 1944, 'Kingdom of Great Britain'], [1815, 1940, 'Denmark-Norway']]);
});

test('2. Kerguelen and Réunion are never named «French Indochina»; Kerguelen 1943 is not named «Vichy France»; the realm keeps France', () => {
  const fi = review.places.findIndex((p) => p.name === 'French Indochina'), vf = review.places.findIndex((p) => p.name === 'Vichy France');
  for (const [p, y, m] of [['kerguelen', 1900, 7], ['kerguelen', 1927, 7], ['kerguelen', 1943, 7], ['kerguelen', 1945, 10], ['kerguelen', 1946, 7], ['reunion', 1947, 7]]) {
    const fs = at(clio, ...P[p], ymd(y, m, 1)), n = fs.map(nm);
    assert.ok(!n.includes('French Indochina'), p + ' ' + y + ' is still French Indochina');
    assert.ok(fs.some((f) => f[9] && f[9].ws === 'place' && f[9].wn === 'French Indochina' && f[9].wp === fi), p + ' ' + y + ' does not carry the withheld piece');
  }
  assert.ok(at(clio, ...P.kerguelen, ymd(1927, 7, 1)).some((f) => nm(f) === 'French Third Republic'), 'the realm no longer covers Kerguelen in 1927');
  assert.ok(!at(clio, ...P.kerguelen, ymd(1943, 7, 1)).some((f) => nm(f) === 'Vichy France'), 'Kerguelen 1943 is still Vichy France');
  assert.ok(at(clio, ...P.kerguelen, ymd(1941, 7, 1)).some((f) => nm(f) === 'Vichy France'), 'Kerguelen 1941 (Madagascar still Vichy) lost the realm');
  assert.ok(clio.feats.some((f) => f[9] && f[9].ws === 'place' && f[9].wp === vf), 'the Vichy judgement withholds nothing');
  /* no shipped piece of «French Indochina» is named anywhere — every one of them was the two islands */
  assert.deepEqual(clio.feats.filter((f) => nm(f) === 'French Indochina').map((f) => f.slice(2, 5).join('-')), []);
  /* the card's sentence is the reviewed one, carried in the bundle */
  assert.equal(clio.places[fi].en, review.places[fi].note.en); assert.equal(clio.places[fi].jp, review.places[fi].note.jp);
});

test('2b. the page: the card on a piece withheld by place says whose ground it was, in en and jp', async () => {
  const { timeBorders } = await import('../scripts/histeras/time-borders.mjs');
  const R = review.places.find((p) => p.name === 'French Indochina');
  const f = { properties: { NAME: '', _rec: 'clio', _wName: 'French Indochina', _wSide: 'place', _wYear: undefined, _wQ: 'Q185682', _wBy: 'history', _wNoteEn: R.note.en, _wNoteJp: R.note.jp } };
  for (const [lang, title, line] of [['en', /names this shape «French Indochina», but this ground was not that polity/, /Madagascar/], ['jp', /「French Indochina」と呼ぶが、.*この土地はその政体のものではなかった/, /マダガスカル/]]) {
    const { api } = await timeBorders({ lang });
    const card = api.blankNote(f);
    assert.match(String(card.title), title, lang + ': the card title');
    assert.ok(card.lines.some((l) => line.test(String(l))), lang + ': the card does not carry the reviewed sentence: ' + card.lines.join(' / '));
  }
});

test('3. East Greenland 1932–1935 is Greenland\'s (Denmark), not «Kingdom of Norway»', () => {
  for (const y of [1932, 1933, 1935]) {
    const fs = at(clio, ...P.myggbukta, ymd(y, 7, 1));
    assert.ok(!fs.some((f) => nm(f) === 'Kingdom of Norway'), y + ': still Norway');
    const g = fs.find((f) => nm(f) === 'Greenland');
    assert.deepEqual(g && [g[9].hs, g[9].he, g[9].hy, g[9].ho], [1932, 1935, 1936, 'Kingdom of Norway'], y + ': not drawn back as Greenland');
  }
  assert.match(review.ground.rows.find((r) => r.name === 'Greenland').history, /5 April 1933/);
});

test('4. «US occupation of Greenland» is not shipped as a subdivision; the Inspectorates hold the island; the gate agrees', () => {
  const tiers = [1, 2, 3].map((n) => ({ file: 'data/hist-admin' + n + '.js', b: load('data/hist-admin' + n + '.js', '__HISTADM' + n) }));
  assert.ok(!tiers.some((t) => t.b.feats.some((f) => f[10] === 2870662)), 'relation 2870662 is still shipped');
  const a1 = tiers[0].b, insp = at(a1, ...P.nuuk, ymd(1943, 7, 1)).map(nm);
  assert.ok(insp.includes('Sydgrønlands Inspektorat'), 'Nuuk in 1943 lost its Danish administration: ' + insp.join(', '));
  const L = json('data/hist-admin-edges.json');
  assert.deepEqual(L.withdrawn.map((x) => x.id), [2870662]);
  assert.match(L.withdrawn[0].history, /fully recognizing the sovereignty of the Kingdom of Denmark over Greenland/);
  assert.deepEqual(edgeProblems(tiers, L, () => true).filter(([k]) => /^unit-withdrawn/.test(k)), []);
  /* applied again, nothing changes (idempotent) */
  assert.deepEqual(applyWithdrawn(tiers.map((t) => ({ file: t.file, data: { ...t.b, feats: t.b.feats.slice() } })), L), []);
});

test('5. «Southern Ming» 1673–1682 is withheld on the mainland and kept on Taiwan (the Zheng realm)', () => {
  const sm = review.places.findIndex((p) => p.name === 'Southern Ming');
  for (const y of [1673, 1676, 1680, 1682]) for (const p of ['guangzhou', 'kunming']) {
    const fs = at(clio, ...P[p], ymd(y, 7, 1));
    assert.ok(!fs.some((f) => nm(f) === 'Southern Ming'), p + ' ' + y + ' is still Southern Ming');
    assert.ok(fs.some((f) => f[9] && f[9].ws === 'place' && f[9].wp === sm), p + ' ' + y + ' does not carry the withheld piece');
  }
  for (const y of [1675, 1682]) assert.ok(at(clio, ...P.tainan, ymd(y, 7, 1)).some((f) => nm(f) === 'Southern Ming'), 'Taiwan ' + y + ' lost the Southern Ming name');
  /* the selector is a selector: applied to a polygon partly inside it, the build refuses rather than cut land */
  const R = { places: [{ name: 'X', s: 1, e: 2, within: [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]] }] };
  assert.throws(() => applyPlaces([{ name: 'X', s: ymd(1, 1, 1), e: ymd(3, 1, 1), meta: {}, polys: [[[[0.5, 0.5], [2, 0.5], [2, 0.8], [0.5, 0.8], [0.5, 0.5]]]] }], R), /partly inside/);
});

test('6a. no «Okinawa» prefecture while the Nansei Islands were under United States administration; Japan stays whole', () => {
  const fill = load('data/hist-admin-fill.js', '__HISTADMFILL');
  const oki = (y, m = 7, d = 1, p = 'naha') => at(fill, ...P[p], ymd(y, m, d)).filter((f) => f[10] === 'JP-47');
  for (const y of [1946, 1950, 1953, 1960, 1971]) { assert.equal(oki(y).length, 0, 'Okinawa drawn at Naha in ' + y); assert.equal(oki(y, 7, 1, 'amami').length, 0, 'Okinawa drawn over Amami in ' + y); }
  assert.equal(oki(1972, 5, 14).length, 0, 'Okinawa drawn on the last day of US administration');
  assert.equal(oki(1972, 5, 15).length, 1, 'Okinawa not drawn on the reversion day');
  assert.equal(oki(1990).length, 1, 'Okinawa not drawn in 1990');
  /* the rest of Japan is still answered through those years (the unit abroad is not a hole in the country) */
  assert.ok(at(fill, ...P.kagoshima, ymd(1960, 7, 1)).some((f) => f[10] === 'JP-46'), 'Kagoshima vanished in 1960 — Japan was emptied');
});

test('6b. the Kurils from Urup to Shumshu are inside 北海道庁 in 1891–1943', () => {
  const rc = load('data/hist-admin-recon.js', '__HISTADMRECON');
  for (const y of [1891, 1900, 1930, 1943]) for (const p of ['paramushir', 'shumshu', 'urup']) {
    const n = at(rc, ...P[p], ymd(y, 6, 1)).map((f) => f[9] && f[9].ja);
    assert.ok(n.includes('北海道庁'), p + ' ' + y + ' is in no first-level unit: ' + n.join(', '));
  }
  assert.ok(!at(rc, ...P.paramushir, ymd(1944, 7, 1)).some((f) => f[9] && f[9].ja === '北海道庁'), 'the reconstruction now claims 1944, outside its scope');
});

test('7. CShapes: the finder lists the signing-day candidates, every one is judged, and the moved changes are on their day', () => {
  const cs = load('data/cshapes.js', '__CSHAPES'), rv = json('scripts/cshapes/review.json'), photo = json('scripts/cshapes/effective.json');
  assert.deepEqual(effectiveProblems(photo, rv), []);
  /* the finder is evaluated, not trusted: a synthetic record and query rows */
  const d = { feats: [['A', 1, 1886, 1, 1, 1900, 4, 16, []], ['A', 1, 1900, 4, 17, 2019, 12, 31, []], ['B', 2, 1900, 4, 17, 2019, 12, 31, []]] };
  const days = changeDays(d);
  assert.deepEqual(days.map((x) => x.day), ['1900-04-17']);
  const b = (q, s, e) => ({ item: { value: 'http://www.wikidata.org/entity/' + q }, itemLabel: { value: q }, sig: { value: s + 'T00:00:00Z' }, eff: { value: e + 'T00:00:00Z' } });
  const c = candidatesOf([b('Q1', '1900-04-15', '1900-06-01'), b('Q2', '1950-01-01', '1951-01-01')], days);
  assert.deepEqual(c.map((x) => [x.wd, x.changes.map((y) => y.day).join()]), [['Q1', '1900-04-17']]);
  assert.ok(NEAR >= 2, 'the window must reach the day after a signing (Korea: signed 22, coded 23 August 1910)');
  const rows = (gw) => cs.feats.filter((f) => f[1] === gw).sort((x, y) => k0(x) - k0(y));
  assert.equal(k0(rows(713)[0]), ymd(1895, 6, 2), 'Taiwan (Japan) does not begin on the day of transfer');
  assert.ok(at(cs, 121, 23.7, ymd(1895, 5, 20), false).some((f) => f[1] === 710), 'Taiwan is not drawn in China before the transfer');
  assert.equal(k0(rows(4)[0]), ymd(1898, 8, 12), 'Hawaii (USA) does not begin on the transfer of sovereignty');
  assert.equal(k0(rows(205)[0]), ymd(1922, 12, 6), 'Ireland does not begin with the Irish Free State');
  assert.ok(at(cs, -8.0, 53.0, ymd(1922, 6, 1), false).some((f) => f[1] === 200), 'Southern Ireland in 1922 is not in the United Kingdom');
  /* the ledger is the bundle: re-applying it changes nothing */
  assert.equal(JSON.stringify(csApply(cs, rv).data), JSON.stringify(cs));
});

test('A. narrow land pieces: the composition covers port cities\' land as well as the records it was cut from', () => {
  const rest = load('data/hist-eras-rest.js', '__HISTERASREST'), raw = load('data/hist-eras.js', '__HISTERAS'), W = water();
  const sheet = (d, Y) => { let s = null; for (const x of d.snaps) if (x.y <= Y) s = x; return s; };
  const covered = (x, y, Y, sheets) => { const t = ymd(Y, 7, 1), s = sheet(sheets, Y);
    return clio.feats.some((f) => !(f[9] && f[9].r) && k0(f) <= t && t < k1(f) && f[8].some((p) => inPoly(x, y, clio.rings, p))) || (s && s.feats.some((f) => f[2].some((p) => inPoly(x, y, sheets.rings, p)))); };
  const PORTS = { Istanbul: [28.90, 40.98, 29.06, 41.08], Venice: [12.28, 45.40, 12.40, 45.47], Alexandria: [29.85, 31.15, 30.05, 31.30], Naples: [14.20, 40.80, 14.32, 40.88], Marseille: [5.33, 43.27, 5.42, 43.33] };
  const STEP = 0.005;
  for (const [city, [w, s, e, n]] of Object.entries(PORTS)) for (const Y of [300, 1000, 1500, 1650]) {
    let land = 0, mine = 0, theirs = 0;
    for (let x = w; x <= e; x += STEP) for (let y = s; y <= n; y += STEP) {
      if (!W.onLand(x, y)) continue; land++;
      if (covered(x, y, Y, rest)) mine++;
      if (covered(x, y, Y, raw)) theirs++;
    }
    assert.ok(land > 20, city + ': the grid holds too little land to measure');
    /* ≥ the records it was cut from, to one grid point of the builder's own rounding */
    assert.ok(mine >= theirs - 1, city + ' ' + Y + ': the composition covers ' + mine + ' of ' + land + ' land points, the records it was cut from ' + theirs);
  }
});

test('B. Istanbul reads «Constantinople» to an English reader for 1453–1923, through the label module and the search\'s reader', async () => {
  const DATA = json('data/hist-cities.json');
  const ist = DATA.cities.find((c) => c.id === 'istanbul');
  assert.ok(!ist.e.some((e) => Object.values(e.n).includes('Цариград')), 'the Bulgarian name is still a span of Istanbul');
  const ctx = vm.createContext({ console, setTimeout, clearTimeout, Promise, URL, JSON, Array, Object, String, Map, Set, Math, Number });
  ctx.window = ctx; ctx.document = { baseURI: 'https://example.invalid/' };
  ctx.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve(DATA) });
  const clock = { now: new Date('1500-07-01T12:00:00Z') };
  ctx.IntMapTime = { isLive: () => false, when: () => new Date(clock.now), on: () => {} };
  vm.runInContext(asClassicScript(rd('js/hist-cities.js')), ctx);
  const HC = ctx.window.IntMapHistCities; await HC.ensure();
  const first = (spans, d) => { for (const s of spans) if ((!s.f || d >= s.f) && (!s.t || d <= s.t)) return s.name; return null; };
  for (const [iso, en, ja] of [['1500-07-01', 'Constantinople', 'コンスタンティノープル'], ['1900-07-01', 'Constantinople', 'コンスタンティノープル'], ['0400-07-01', 'Constantinople', 'コンスタンティノープル'], ['-0300-07-01', 'Byzantium', 'ビュザンティオン']]) {
    const d = new Date(0); const [Y, M, D] = iso.replace(/^-/, 'm').split('-'); d.setUTCHours(12); d.setUTCFullYear((Y[0] === 'm' ? -1 : 1) * +Y.replace('m', ''), +M - 1, +D);
    clock.now = d;
    assert.equal(HC.at('Istanbul', 28.9784, 41.0082, 'en'), en, 'map label ' + iso);
    assert.equal(HC.at('Istanbul', 28.9784, 41.0082, 'jp'), ja, 'map label (jp) ' + iso);
    const dn = d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
    assert.equal(first(HC.near(28.9784, 41.0082, 'en')[0].spans, dn), en, 'the search\'s era name (js/where-when.js eraNameAt reads near()) ' + iso);
  }
});

test('C. the era sheets\' misspellings are corrected to the corpus\'s own spelling, and upstream\'s word is kept', () => {
  const raw = load('data/hist-eras.js', '__HISTERAS'), L = json('scripts/histeras/spelling.json');
  assert.deepEqual(spellingProblems(raw.snaps, L), []);
  const names = (key) => raw.snaps.find((s) => s.key === key).feats.map((f) => f[0].en);
  assert.ok(names('1650').includes('Scotland') && !names('1650').includes('Scottalnd'), '1650 still says Scottalnd');
  const f = raw.snaps.find((s) => s.key === '1650').feats.find((x) => x[0].en === 'Scotland');
  assert.equal(f[1].u, 'Scottalnd', 'upstream\'s own spelling is not kept beside the correction');
  /* the composition's sheets carry the corrected name too (data/hist-eras-rest.js is cut from data/hist-eras.js) */
  const rest = load('data/hist-eras-rest.js', '__HISTERASREST');
  assert.ok(!JSON.stringify(rest.snaps.map((s) => s.feats.map((x) => x[0].en))).includes('Scottalnd'), 'data/hist-eras-rest.js still says Scottalnd');
  /* the rule is evaluated: a correction applies to the name and to SUBJECTO/PARTOF, once */
  const snaps = [{ key: 'k', feats: [[{ en: 'Foo' }, { p: 'Foo' }, []], [{ en: 'Bar' }, {}, []]] }];
  assert.equal(applySpelling(snaps, { corrections: [{ from: 'Foo', to: 'Bar' }] }), 1);
  assert.deepEqual(snaps[0].feats[0].slice(0, 2), [{ en: 'Bar' }, { p: 'Bar', u: 'Foo' }]);
  assert.equal(applySpelling(snaps, { corrections: [{ from: 'Foo', to: 'Bar' }] }), 0);
});
