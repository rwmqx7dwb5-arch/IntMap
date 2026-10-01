/* world-at-time — the map at instant T is drawn only where a source states T.
 *
 * MEASURED (2026-10-01): the live-satellite layer drew 5,234 objects on a 1914 map, 2026 elements
 * propagated 112 years back — and it was not alone. With Chronos at 1914, the 61 World Bank rows
 * painted their own default year (2023), the NASA GIBS rows their own day (2026), every live feed
 * today's observations, and every modern snapshot (OpenStreetMap facilities, submarine cables,
 * World Heritage sites) today's map. The record is dev-notes/2026-10-01-world-at-time.md.
 *
 * What is held here:
 *   ① THE GATE — every layer of js/layer-manifest.js declares what time its source can state
 *     (js/layer-time-decl.js), the rule accepts every declaration, every cited file and symbol
 *     exists, and nothing of today is held back on the live clock (scripts/world-at-time.mjs --check).
 *   ② THE RULE — js/layer-time.js's verdict, kind by kind, on instants whose answer is a fact.
 *   ③ THE HISTORY — historical-verification §2: at the key years, institutions are not drawn before
 *     they existed (NATO, the EEC, the wars, the World Heritage List, the satellites).
 *   ④ THE SECOND CLOCKS — the World Bank rows and the GIBS rows paint the clock's year / day.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { check, enumerate, KEY_YEARS } from '../scripts/world-at-time.mjs';
import { verdict, validate, toMs, toEndMs, resolve, explain, withholds, isoDay, isPointer, pointerFiles, periodMs, entersOnTick } from '../js/layer-time.js';
import { TIME } from '../js/layer-time-decl.js';
import { LAYERS } from '../js/layer-manifest.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const NOW = '2026-10-01';
const at = (when) => ({ when: toMs(when), live: false, now: toMs(NOW) });
const LIVE = { when: toMs(NOW), live: true, now: toMs(NOW) };

test('① every layer declares what time its source states, and every declaration holds', async () => {
  const r = await check();
  assert.deepEqual(r.problems, []);
  assert.equal(r.declared, LAYERS.length);
  assert.equal(r.layers, LAYERS.length);
});

test('① the gate refuses what it is for: an undeclared layer, a bound with no author, a kind outside the vocabulary', () => {
  assert.deepEqual(validate('x', { kind: 'snapshot', asOf: 2020, says: { en: 'a', jp: 'あ' } }).length > 0, true, 'a literal date with no `by`');
  assert.ok(validate('x', { kind: 'timeless', says: { en: 'a', jp: 'あ' } }).some((p) => /kind/.test(p)));
  assert.ok(validate('x', { kind: 'live', says: { en: 'a' } }).some((p) => /en \+ jp/.test(p)));
  assert.ok(validate('x', { kind: 'enduring', says: { en: 'a', jp: 'あ' } }).some((p) => /why/.test(p)));
  assert.ok(validate('x', { kind: 'record', from: 2000, by: 'js/x.js', says: { en: 'a', jp: 'あ' } }).some((p) => /ownDate|follows/.test(p)), 'a record that neither follows the clock nor names its own date');
  assert.ok(validate('x', null).length);
});

test('② the instant is built with setUTCFullYear — year 50 is not 1950, and BC years exist', () => {
  assert.equal(new Date(toMs(50)).getUTCFullYear(), 50);
  assert.equal(new Date(toMs(-200)).getUTCFullYear(), -200);
  assert.equal(isoDay(toMs('-0200-03-01')), '-000200-03-01');
  /* a bare year as an upper bound is the WHOLE year */
  assert.equal(isoDay(toEndMs(2022)), '2022-12-31');
  /* a model's valid time keeps its hour */
  assert.equal(new Date(toMs('2026-10-01T06:00:00Z')).getUTCHours(), 6);
});

test('② verdicts, kind by kind', () => {
  const says = { en: 's', jp: 's' };
  /* a modern snapshot fetched as the present (an OSM day) */
  const osm = { kind: 'snapshot', asOf: 'fetch', period: 'P1D', by: 'x', says };
  assert.equal(verdict(osm, LIVE).status, 'stated');
  assert.equal(verdict(osm, at('2026-09-30T12:00:00Z')).status, 'stated', 'within the edition');
  assert.equal(verdict(osm, at('2026-09-20')).status, 'unstated');
  assert.equal(verdict(osm, at(1914)).status, 'unstated');
  /* a dated snapshot: carried after its date, unstated before its edition */
  const dem = { kind: 'snapshot', asOf: 2023, period: 'P1Y', by: 'x', says };
  assert.equal(verdict(dem, at('2025-06-01')).status, 'carried');
  assert.equal(verdict(dem, at('2023-03-01')).status, 'stated');
  assert.equal(verdict(dem, at('2010-01-01')).status, 'unstated');
  /* a live feed: only the present, unless the module filters by time (lookback) */
  assert.equal(verdict({ kind: 'live', says }, LIVE).status, 'stated');
  assert.equal(verdict({ kind: 'live', says }, at('2026-09-30')).status, 'unstated');
  assert.equal(verdict({ kind: 'live', lookback: 'P7D', follows: 'js/x.js f', says }, at('2026-09-28')).status, 'stated');
  /* a record with carry: before → unstated, inside → stated, after → carried */
  const r = { kind: 'record', from: 2000, to: 2010, carry: 'last', by: 'x', follows: 'js/x.js f', says };
  assert.equal(verdict(r, at(1999)).status, 'unstated');
  assert.equal(verdict(r, at(2005)).status, 'stated');
  assert.equal(verdict(r, at(2015)).status, 'carried');
  assert.equal(verdict(r, at(2015)).shows, 2010);
  /* the same record keeping a date of its own: inside its range it shows ITS date, and says so */
  assert.equal(verdict(Object.assign({}, r, { follows: undefined, ownDate: 'js/x.js d' }), at(2005)).reason, 'own-date');
  /* a bound read at run time is not «stated» before it is read */
  const wb = TIME['bx-wbgini'];
  assert.equal(verdict(wb, at(1914)).status, 'unstated', 'fetched from 1990: 1914 is unstated before the series arrives');
  assert.equal(verdict(wb, at(2003)).status, 'unknown', 'inside the fetch, the last year is not read yet');
  assert.equal(verdict(wb, at(1914), { from: '1990', to: '2024' }).status, 'unstated');
  assert.equal(verdict(wb, at(2003), { from: '1990', to: '2024' }).status, 'stated');
  assert.equal(verdict(wb, at('2026-03-01'), { from: '1990', to: '2024' }).status, 'carried');
  /* withholds: only an unstated layer whose module does not answer for the instant itself */
  assert.equal(withholds(TIME['dl-sats'], verdict(TIME['dl-sats'], at(1914))), false, 'the satellites say it themselves');
  assert.equal(withholds(TIME['dl-planes'], verdict(TIME['dl-planes'], at(1914))), true);
});

test('② a bound that points into a file is read from that file; a cited bound is the value the file states', () => {
  const files = { 'data/gibs-range.json': JSON.parse(read('data/gibs-range.json')) };
  const sea = resolve(TIME['gx-gxseaice'], files);
  assert.equal(sea.from, files['data/gibs-range.json'].layers.gxseaice.from);
  assert.equal(sea.to, files['data/gibs-range.json'].layers.gxseaice.to);
  /* an unread file leaves the bound unread — never «stated» */
  assert.equal(resolve(TIME['gx-gxseaice'], {}).from, 'runtime');
  assert.equal(verdict(resolve(TIME['gx-gxseaice'], {}), at('2010-01-01')).status, 'unknown');
  /* a row found by its identity, not its position; and the written span is the one the file states */
  const wars = { 'data/wars.json': JSON.parse(read('data/wars.json')) };
  for (const id of ['ww1', 'ww2', 'korea', 'vietnam', 'mideast', 'yugoslavia']) {
    const d = TIME['dl-' + id];
    const w = wars['data/wars.json'].wars.find((x) => x.id === id);
    assert.deepEqual([d.from, d.to], w.span, id);
    assert.equal(resolve({ from: d.cite.from }, wars).from, w.span[0], id);
  }
  /* `$min(field)` / `$max(field)` over unordered rows */
  const el = { 'data/elections/index.json': JSON.parse(read('data/elections/index.json')) };
  const dates = el['data/elections/index.json'].elections.map((e) => e.date).sort();
  assert.equal(resolve({ from: TIME['dl-elect'].cite.from }, el).from, dates[0]);
  assert.equal(resolve({ to: TIME['dl-elect'].cite.to }, el).to, dates[dates.length - 1]);
});

test('② the vocabulary: cadences, pointers, the files a table points into, and which rows open on their record', () => {
  /* an edition's period is the upstream's cadence, in js/data-governance.js's spelling */
  assert.equal(periodMs('P1D'), 86400000);
  assert.equal(periodMs('PT1H'), 3600000);
  assert.equal(periodMs('weekly'), null);
  /* a bound that names its file is a pointer; a literal date is not */
  assert.equal(isPointer('data/gibs-range.json#layers.gxndvi.from'), true);
  assert.equal(isPointer('2002-06-01'), false);
  /* the kernel fetches only the small files a table points into — the large ones are CITED, not fetched */
  const files = new Set(Object.values(TIME).flatMap(pointerFiles));
  assert.deepEqual([...files].sort(), ['data/gibs-range.json']);
  /* only the war rows move the clock on the reader's tick */
  assert.deepEqual(Object.keys(TIME).filter((id) => entersOnTick(TIME[id])).sort(), ['dl-korea', 'dl-mideast', 'dl-vietnam', 'dl-ww1', 'dl-ww2', 'dl-yugoslavia']);
});

test('② every sentence is en + jp and names the instant', () => {
  for (const id of ['dl-planes', 'cb-roads', 'dl-nato', 'dl-dem']) {
    const v = verdict(TIME[id], at(1914));
    const m = explain(TIME[id], v, at(1914));
    assert.ok(m.en && m.jp, id);
    assert.match(m.en, /1914/, id);
    assert.match(m.jp, /1914/, id);
  }
});

test('③ historical-verification §2 — institutions are not drawn before they existed', async () => {
  const files = { 'data/wars.json': JSON.parse(read('data/wars.json')), 'data/hdi-series.json': JSON.parse(read('data/hdi-series.json')) };
  const v = (id, when) => verdict(resolve(TIME[id], files), at(when)).status;
  /* the North Atlantic Treaty entered into force on 24 August 1949 */
  assert.equal(v('dl-nato', '1949-08-23'), 'unstated');
  assert.equal(v('dl-nato', '1949-08-24'), 'stated');
  /* the Treaty of Rome on 1 January 1958 — before it there is no European Economic Community to colour */
  assert.equal(v('dl-eu', '1957-12-31'), 'unstated');
  assert.equal(v('dl-eu', '1958-01-01'), 'stated');
  /* the First World War layer is not drawn before its record's first day, nor after its last */
  assert.equal(v('dl-ww1', '1914-06-27'), 'unstated');
  assert.equal(v('dl-ww1', '1916-07-01'), 'stated');
  assert.equal(v('dl-ww1', '1939-09-01'), 'unstated');
  /* the World Heritage List (1978) and every modern snapshot are not on a 1914 map */
  for (const id of ['beta-dl-whs', 'dl-subcables', 'fac-dl-osmhealth', 'cb-roads', 'dl-tz', 'dl-eez']) assert.equal(v(id, 1914), 'unstated', id);
  /* the night lights begin with Suomi NPP (2012); the HDI series with 1990 */
  assert.equal(v('dl-nightsat', 2011), 'unstated');
  assert.equal(v('dl-hdi', 1989), 'unstated');
  assert.equal(v('dl-hdi', 1990), 'stated');
});

test('③ the enumeration at the key years: nothing of today is «stated» before today', async () => {
  for (const y of KEY_YEARS) {
    if (y === 'now') continue;
    const e = await enumerate(y, { now: NOW });
    for (const r of e.rows) {
      const d = TIME[r.id];
      if (r.status !== 'stated') continue;
      /* what may be stated in the past: computed instants, conventions, enduring subjects (from their bound),
         and dated records / series inside their range — never a live feed or a snapshot of the present */
      assert.ok(['instant', 'convention', 'enduring', 'record', 'series', 'forecast'].includes(d.kind), y + ' ' + r.id + ' ' + d.kind);
      if (y < 1800) assert.ok(!['series', 'forecast'].includes(d.kind) || d.self, y + ' ' + r.id);
    }
  }
});

test('④ the World Bank rows paint the clock\'s year, and report the years they hold', () => {
  const src = read('js/wb-layers.js');
  const body = (name) => { const i = src.indexOf('function ' + name + '('); assert.ok(i >= 0, name); let d = 0, j = src.indexOf('{', i); for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); } } return null; };
  const make = new Function('window', 'wbYear', body('clockYear') + '\n' + body('yearFor') + '\nreturn yearFor;');
  const S = { years: ['1990', '2000', '2022'], best: '2022' };
  const past = (y) => ({ IntMapTime: { isLive: () => false, year: () => y } });
  assert.equal(make(past(2000), {})({ id: 'wbgini' }, S), '2000');
  assert.equal(make(past(2025), {})({ id: 'wbgini' }, S), '2022', 'after the last year the last is carried');
  assert.equal(make({ IntMapTime: { isLive: () => true } }, {})({ id: 'wbgini' }, S), '2022', 'live: the series\' own default');
  assert.equal(make({ IntMapTime: { isLive: () => true } }, { wbgini: '' })({ id: 'wbgini' }, S), '', 'live: the reader\'s «latest per country»');
  assert.match(src, /LT\.range\('bx-'\+L\.id/);
});

test('④ the GIBS rows draw the clock\'s day; the picker moves the clock', () => {
  const src = read('js/layer-packs.js');
  assert.match(src, /function gxAt\(L\)\{[^}]*const ck=gxClock\(\); if\(ck\) return gxClamp\(L,ck\);/);
  assert.match(src, /'\.gx-date'\)\.addEventListener\('change',\(e\)=>\{ gxSetDay\(L,e\.target\.value\); \}\)/);
});

test('④ a module that waits before drawing asks again whether it is still on — the hold sends its «off» into that wait', () => {
  /* MEASURED in CI: the war rows were held for 1960 while data/wars.json loaded, then drew and moved the clock when it
     arrived. The same shape in a styledata timer kept the webcams and both election maps drawn while held. */
  const war = read('js/war-layer.js');
  const i = war.indexOf('const ok = await load();');
  assert.ok(i > 0);
  assert.ok(war.slice(i, i + 600).includes('if (!on) return false;'), 'the war layer draws after its wait without asking whether it is still on');
  assert.ok(read('js/cameras.js').includes('setTimeout(()=>{ if(on&&ensure()){'), 'the webcams re-show after a styledata timer without asking');
  assert.ok(read('js/elections.js').includes('setTimeout(() => { if (on && ensure()) {'), 'the election map re-shows after a styledata timer without asking');
  assert.ok(read('js/us-elections.js').includes('setTimeout(()=>{ if(on&&ensure()){'), 'the U.S. election map re-shows after a styledata timer without asking');
});

test('the kernel is not on the boot path: the declarations are fetched when they can matter', () => {
  const k = read('js/layer-time-kernel.js');
  assert.match(k, /import\('\.\/layer-time-decl\.js'\)/);
  assert.match(k, /import\('\.\/layer-time\.js'\)/);
  assert.doesNotMatch(k, /^import [^\n]*layer-time(-decl)?\.js/m);
  assert.match(read('src/main.js'), /import '\.\.\/js\/layer-time-kernel\.js';/);
  /* the reconciler does not «heal» a box the kernel is holding back */
  assert.match(read('js/data-layers.js'), /const timeHeld=cb=>/);
});
