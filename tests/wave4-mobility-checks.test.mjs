/* ============================================================================
 *  wave4-mobility — 「世界とのつながり」World flows: who a country is connected to, by people, data, flights (and goods)
 *  (scripts/build-world-flows.mjs → data/world-flows.json → js/world-flows-core.js · js/world-flows.js; Atlas `data.worldFlows`)
 * ----------------------------------------------------------------------------
 *    ① THE BUNDLE IS WHOLE: every migration pair names two places of the table; DESA's stated totals are never smaller than
 *       the partners it names; the places carry the anchors the map draws them at;
 *    ② NOTHING IS INVENTED: a missing DESA estimate is null, not 0; a code Natural Earth cannot anchor stays in the table
 *       under DESA's own name with no anchor; the bundle states the builder's provenance, and its credit row exists;
 *    ③ THE INSTANT: the latest stated year at or before the clock; before the record → no answer and the first year;
 *    ④ THE READINGS: the two directions are the two sides of the same cell; cables count systems in service by the year
 *       (never fewer later); flights are the 2014 table's row; GOODS are not a second implementation — the card opens the
 *       Trade flows layer through its own door;
 *    ⑤ THE MAP: arcs point the way the flow runs, never jump across the world at the antimeridian, and the map draws the
 *       same partners in the same order as the list;
 *    ⑥ ATLAS `data.worldFlows`: the card's facts, `before-record` instead of a substituted year, NOT_FOUND for an unknown
 *       name, goods named as the Trade flows layer — and nothing moves unless asked; the link round-trips;
 *    ⑦ the doors (Tools, the place card, the link, Atlas).
 *  Offline: every read is a file of this repository.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { importModule } from '../scripts/lib/import-module.mjs';
import * as C from '../js/world-flows-core.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
const json = (p) => JSON.parse(rd(p));
const IDX = json('data/world-flows.json');
const MIG = IDX.migration;
const P = C.placeIndex(IDX);
const at = (code) => { const i = P.byCode.get(code); assert.ok(i != null, code + ' is a place of the table'); return i; };

test('① the bundle is whole: pairs name places, stated totals cover the named partners, places carry anchors', () => {
  const n = IDX.places.length;
  for (const r of MIG.rows) { assert.ok(r[0] >= 0 && r[0] < n && r[1] >= 0 && r[1] < n && r[0] !== r[1], 'a migration pair names two places'); assert.equal(r.length, 2 + MIG.years.length); }
  for (let k = 1; k < MIG.years.length; k++) assert.ok(MIG.years[k] > MIG.years[k - 1], 'the years ascend');
  /* DESA's totals count every origin, «other» and «unknown» included — never fewer than the countries it names */
  for (const dir of ['in', 'out']) for (const key of Object.keys(dir === 'in' ? MIG.totalIn : MIG.totalOut)) {
    const i = +key;
    for (const y of MIG.years) {
      const named = C.migrationPartners(MIG, i, dir, y).reduce((s, x) => s + x.v, 0);
      const t = C.totalAt(IDX, 'migration', i, dir, y);
      if (t != null) assert.ok(t >= named, IDX.places[i].c + ' ' + dir + ' ' + y + ': the stated total (' + t + ') is not below the named partners (' + named + ')');
    }
  }
  const anchored = IDX.places.filter(C.onMap);
  assert.ok(anchored.length >= 230, 'the countries Natural Earth draws are anchored');
  for (const p of anchored) assert.ok(p.x >= -180 && p.x <= 180 && p.y >= -90 && p.y <= 90, p.c + ': an anchor on the globe');
});

test('② nothing invented: a missing estimate is null, an unanchored code keeps its own name, provenance is the builder\'s', async () => {
  assert.ok(MIG.rows.flatMap((r) => r.slice(2)).every((v) => v === null || (Number.isInteger(v) && v >= 0)), 'a DESA cell is a count or null');
  assert.ok(MIG.unplaced.length > 0, 'the codes Natural Earth does not draw are listed');
  for (const u of MIG.unplaced) {
    const p = IDX.places[P.byCode.get('N:' + u.m49)];
    assert.ok(p && !C.onMap(p) && p.en === u.name, u.m49 + ' (' + u.name + ') is a place with its upstream name and no anchor');
    assert.ok(!/\*$/.test(p.en), 'DESA\'s footnote mark is not part of a name');
    assert.ok(MIG.rows.some((r) => r[0] === P.byCode.get('N:' + u.m49) || r[1] === P.byCode.get('N:' + u.m49)), u.name + ' carries people in the table');
  }
  /* what each destination's estimate stands on travels with it, as DESA wrote it — the codes its notes sheet defines, and the note */
  const codes = new Set(Object.values(MIG.basis).flatMap((b) => b.type));
  assert.ok([...codes].every((k) => ['B', 'C', 'R', 'I'].includes(k)), 'only the type-of-data codes DESA defines');
  assert.ok(Object.values(MIG.basis).some((b) => b.type.includes('I')), 'imputed destinations are marked, not hidden');
  for (const b of Object.values(MIG.basis)) if (b.note != null) assert.ok(typeof MIG.notes[b.note] === 'string' && !/Ã[\u0080-¿]/.test(MIG.notes[b.note]), 'note ' + b.note + ' exists and reads as written (no mojibake)');
  const sdn = C.basisOf(MIG, at('SDN'));
  assert.match(sdn.noteText, /1990 to 2005 refer to Sudan and South Sudan/, 'Sudan’s early stocks include South Sudan, and the card can say so');
  const B = await import('../scripts/build-world-flows.mjs');
  const G = B.GOVERNANCE[B.OUT];
  assert.equal(B.OUT, 'data/world-flows.json');
  assert.deepEqual(IDX.gov.upstreams, G.upstreams, 'the bundle states the builder\'s upstreams');
  for (const u of G.upstreams.filter((x) => x.paidBy)) assert.ok(rd('js/reference-data.js').includes("n:'" + u.paidBy + "'"), 'the credit row the governance names exists: ' + u.paidBy);
  for (const u of G.upstreams) assert.ok(!/\bNC\b|non-?commercial/i.test(u.licence), u.publisher + ': a licence IntMap may use commercially');
});

test('③ the instant: the latest stated year at or before the clock; before the record, no answer', () => {
  const ys = [1990, 1995, 2000, 2024];
  assert.deepEqual(C.yearFor(ys, null), { year: 2024, exact: true, live: true });
  assert.deepEqual(C.yearFor(ys, 1997), { year: 1995, exact: false });
  assert.deepEqual(C.yearFor(ys, 2000), { year: 2000, exact: true });
  assert.deepEqual(C.yearFor(ys, 1989), { year: null, reason: 'before-record', first: 1990 });
});

test('④ the readings: one cell from both sides; cables never fewer later; flights are the table\'s row', () => {
  const my = MIG.years[MIG.years.length - 1], usa = at('USA'), mex = at('MEX'), jpn = at('JPN');
  const out = C.migrationPartners(MIG, mex, 'out', my), inn = C.migrationPartners(MIG, usa, 'in', my);
  for (let k = 1; k < out.length; k++) assert.ok(out[k - 1].v >= out[k].v, 'largest first');
  assert.equal(out[0].p, usa, 'people born in Mexico living abroad: the largest destination is the United States');
  assert.equal(inn.find((x) => x.p === mex).v, out[0].v, 'the same cell read from both sides');
  const meta = json('data/subcables-meta.json');
  let prev = -1;
  for (let y = 1990; y <= 2024; y++) { const c = C.cablePartners(meta, P, jpn, y); assert.ok(c.systems >= prev, 'cables in service never fall as the year advances (the record holds no retirements)'); prev = c.systems; }
  const now = C.cablePartners(meta, P, jpn, null);
  assert.ok(now.systems >= prev && now.partners.length > 0, 'today counts every listed system that is not planned');
  /* (review) ONE rule for a year and for today: a planned system is never in service — measured before the fix, the US read 90
     today and 97 for this year's bar, and a future year counted systems the record calls planned */
  const thisYear = new Date().getUTCFullYear();
  const planned = new Set(Object.values(meta.cables).filter((c) => c.isPlanned).map((c) => c.name));
  assert.ok(planned.size > 0 && Object.values(meta.cables).some((c) => c.isPlanned && c.rfsYear != null), 'the record holds planned systems with a year (the case the rule is about)');
  for (const i of [jpn, at('USA'), at('EGY'), at('GBR')]) {
    assert.equal(C.cablePartners(meta, P, i, thisYear).systems, C.cablePartners(meta, P, i, null).systems, P.rows[i].c + ': this year\'s count is today\'s');
    for (const y of [2000, thisYear, thisYear + 5]) for (const p of C.cablePartners(meta, P, i, y).partners) assert.ok(!p.names.some((n) => planned.has(n)), P.rows[i].c + ' ' + y + ': no planned system is counted in service');
  }
  const S = C.summarise(P, jpn, 'cables', 'link', null, now.partners, { base: now.systems });
  /* (review) a cable has no direction: its arcs carry `link`, and the arrowhead layer leaves them out */
  const cf = C.arcFeatures(P, S).filter((x) => x.properties.k === 'arc');
  assert.ok(cf.length && cf.every((x) => x.properties.link === 1), 'cable arcs are links');
  const mf = C.arcFeatures(P, C.summarise(P, jpn, 'migration', 'out', my, C.migrationPartners(MIG, jpn, 'out', my))).filter((x) => x.properties.k === 'arc');
  assert.ok(mf.length && mf.every((x) => x.properties.link === 0), 'a directed flow is not a link');
  assert.match(rd('js/world-flows.js'), /id: ARROW, type: 'symbol', source: SRC, filter: \['all', \['==', \['get', 'k'\], 'arc'\], \['!=', \['get', 'link'\], 1\]\]/, 'the arrowhead layer filters links out');
  assert.equal(S.total, now.systems, 'a cable share is of the country\'s systems');
  const mob = json('data/mobility.json');
  const fl = C.flightPartners(mob, P, jpn, 'out');
  assert.equal(fl.reduce((a, x) => a + x.v, 0), Object.entries(mob.pairs.JPN).filter(([b]) => b !== 'JPN' && P.byCode.has(b)).reduce((a, [, v]) => a + v, 0), 'the routes are the table\'s row');
  /* goods: one implementation, reached from two places — the card holds no trade reader of its own */
  const card = rd('js/world-flows.js');
  assert.ok(!/oec\.world|BACI_HS|trade-\d{4}/.test(card), 'the card fetches no trade data');
  assert.match(card, /const TRADE_ROW = 'wp-dl-trade';/);
  assert.match(rd('js/world-packs-rows.js'), /register\('world',[\s\S]{0,900}STATE\.tradeLoad\(v\.t\.i,\{dir:v\.t\.d/, 'the door the card uses is the layer family\'s own');
});

test('⑤ the map: arcs run the way the flow runs, stay continuous across the antimeridian, and match the list', () => {
  const line = C.arcLine([139.7, 35.7], [-122.4, 37.8]);
  for (let k = 1; k < line.length; k++) assert.ok(Math.abs(line[k][0] - line[k - 1][0]) < 20, 'no jump across the world between two points of Tokyo → San Francisco');
  assert.deepEqual(line[0], [139.7, 35.7]);
  const jpn = at('JPN'), y = MIG.years[MIG.years.length - 1];
  for (const dir of ['out', 'in']) {
    const sum = C.summarise(P, jpn, 'migration', dir, y, C.migrationPartners(MIG, jpn, dir, y));
    const f = C.arcFeatures(P, Object.assign({}, sum, { partners: sum.partners.slice(0, 15) }));
    const arcs = f.filter((x) => x.properties.k === 'arc');
    assert.deepEqual(arcs.map((x) => x.properties.code), sum.partners.slice(0, 15).filter((r) => r.onMap).map((r) => r.code), 'the map draws the list\'s partners, in its order');
    for (const a of arcs) assert.equal(sum.partners[a.properties.rank - 1].code, a.properties.code, 'the number on the map is the row number in the list');
    const home = [IDX.places[jpn].x, IDX.places[jpn].y];
    for (const a of arcs) {
      const c = a.geometry.coordinates, end = dir === 'in' ? c[c.length - 1] : c[0];
      assert.ok(Math.abs(((end[0] - home[0]) % 360 + 540) % 360 - 180) < 1e-3 && Math.abs(end[1] - home[1]) < 1e-3, dir + ': the arc ' + (dir === 'in' ? 'ends' : 'starts') + ' at Japan');
    }
  }
});

/* the card's module, with the browser's collaborators replaced at its import edges: files of this repository stand in for the network */
const clock = { y: null, sets: 0, on: () => () => {}, isLive() { return this.y == null; }, year() { return this.y; }, isPresentYear: (y) => y >= new Date().getFullYear(), setYear() { this.sets++; }, setNow() { this.sets++; } };
const W = await importModule('js/world-flows.js', {
  mocks: {
    'js/chronos.js': { IntMapTime: clock },
    'js/geo-engine.js': { IntMapGeoEngine: { hasRenderer: () => false, events: { on: () => {} } } },
    'js/fetch-deadline.js': { jsonWithin: async (p) => json(p) },
    'js/host-door.js': { whenHost: async () => ({ lang: 'en', imToast: () => {} }) },
  },
});
const K = (lang) => ({ R: (ok, html, extra) => Object.assign({ ok, html }, extra || {}), L: (en, jp) => (lang === 'jp' ? jp : en), warn: (s) => s, note: (s) => s, HOST: { lang } });

test('⑥ Atlas data.worldFlows: the card\'s facts; before-record, not a substituted year; unknown names; nothing moves', async () => {
  clock.y = null; clock.sets = 0;
  const r = await W.atlas({ country: 'Mexico', kind: 'migration', top: 5 }, K('en'));
  assert.equal(r.ok, true);
  const m = r.meta.worldFlows.readings[0], mex = at('MEX'), y = MIG.years[MIG.years.length - 1];
  assert.equal(m.year, y, 'the live clock reads the latest estimate');
  assert.deepEqual(m.partners.map((x) => x.value), C.migrationPartners(MIG, mex, 'out', y).slice(0, 5).map((x) => x.v), 'the facts are the bundle\'s');
  assert.equal(m.total, C.totalAt(IDX, 'migration', mex, 'out', y), 'the total is the one DESA states');
  const jp = await W.atlas({ country: '日本', kind: 'migration', direction: 'in' }, K('jp'));
  assert.equal(jp.ok, true, 'the Japanese name finds the country');
  assert.match(jp.html, /年央/);
  assert.deepEqual(jp.meta.worldFlows.readings[0].basis, C.basisOf(MIG, at('JPN')), 'the basis of the estimate travels with the facts');
  const imputed = Object.keys(MIG.basis).map(Number).find((i) => MIG.basis[i].type.includes('I'));
  const anyOrigin = MIG.rows.find((r) => r[0] === imputed);
  if (anyOrigin) {
    const o = await W.atlas({ country: IDX.places[anyOrigin[1]].c, kind: 'migration', top: 250 }, K('en'));
    const row = o.meta.worldFlows.readings[0].partners.find((x) => x.code === IDX.places[imputed].c);
    if (row) assert.equal(row.imputed, true, 'a destination DESA imputed is marked as imputed in the list');
  }
  const early = await W.atlas({ country: 'JPN', year: 1992 }, K('en'));
  const byKind = Object.fromEntries(early.meta.worldFlows.readings.map((x) => [x.kind, x]));
  assert.equal(byKind.migration.year, 1990, 'migration in 1992 reads the 1990 estimate');
  assert.deepEqual([byKind.flights.ok, byKind.flights.reason], [false, 'before-record'], 'a 2014 table says nothing about 1992');
  assert.equal(byKind.trade.door, 'wp-dl-trade', 'goods are named as the Trade flows layer');
  assert.equal(byKind.trade.opened, false, 'and not opened unless asked to show');
  const none = await W.atlas({ country: 'Zzzyzx' }, K('en'));
  assert.equal(none.ok, false); assert.equal(none.meta.code, 'NOT_FOUND');
  assert.equal(clock.sets, 0, 'reading moves no clock');
  assert.deepEqual(W.decodeLink('?' + W.encodeLink('JPN', 'migration', 'in')), { country: 'JPN', kind: 'migration', dir: 'in' });
  assert.deepEqual(W.decodeLink('wf=EGY.cables.link'), { country: 'EGY', kind: 'cables', dir: 'out' });
  assert.deepEqual(W.decodeLink('wf=MEX.nothing.out'), {}, 'an unknown flow is not a link');
  assert.match(W.headline(await W.read('migration', mex, 'out', null), 'Mexico', 'en'), /born in Mexico lived in other countries at mid-2024/);
  assert.match(m.caveat, /A stock, not a number of moves/, 'every reading says what its number is not');
  const eg = await W.atlas({ country: 'EG', kind: 'cables' }, K('en'));
  assert.match(eg.html, /The cable record lists [1-9]\d* systems? landing in Egypt/, 'the alpha-2 code finds the country; cables are counted as systems');
  assert.deepEqual(W.summary().open, false);
});

test('⑦ the doors and the registry row', () => {
  assert.match(rd('js/map-ui.js'), /id:'tool\.worldFlows'[\s\S]{0,900}import\('\.\/world-flows\.js'\)\.then\(m=>m\.openFlows\(\{\}\)\)/);
  assert.match(rd('js/place-dossier.js'), /k === 'flows'[\s\S]{0,300}import\('\.\/world-flows\.js'\)\.then\(\(m\) => m\.openFlows\(\{ country: c\.code \}\)\)/);
  assert.match(rd('src/main.js'), /\[\?&\]wf=[\s\S]{0,80}import\('\.\.\/js\/world-flows\.js'\)\.then\(\(m\) => m\.bootFromUrl\(\)\)/);
  assert.match(rd('js/atlas-capabilities.js'), /\["data\.worldFlows","worldFlows",[^\]]*"country",""\]/);
  assert.match(rd('js/atlas-cap-data.js'), /in: 'country', at: 600, text: '\{"type":"worldFlows"/);
});
