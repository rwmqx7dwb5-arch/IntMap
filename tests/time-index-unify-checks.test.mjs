/* ============================================================================
 *  time-index-unify — ONE INDEX OF DATED EVENTS (two cuts and an instant), and ONE FORECAST PLAYER
 * ----------------------------------------------------------------------------
 *  What is held here, by evaluating the shipped modules over the committed records:
 *    ① the index is one: js/time-index.js owns it (path, reader, records, cuts); «On this day» reads its calendar cut,
 *      the year book its year cut — and for a year the two name the SAME border days and the same war operations;
 *      the index builder reads the war record with the same function the year book does;
 *    ② every record of the index answers where it is from and to what precision its date is stated;
 *    ③ the Wikidata events: each is the snapshot's row, cites its item and the property that dated it, and a
 *      refusal of a statement history contradicts carries its reason; nothing hand-written is left in the view;
 *    ④ the «World events» view follows the master clock: what it lists is what had begun by the clock's instant;
 *    ⑤ named years read as history (.agents/rules/historical-verification.md §2-1);
 *    ⑥ the forecast has one player: the legend's Play and the Chronos transport are one js/time-lapse.js run, and a
 *      second run ends the first.
 * ========================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { importModule, fileUrl } from './helpers/import-module.mjs';
import { codeOnly } from '../scripts/code-only.mjs';

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const I = JSON.parse(read('data/on-this-day.json'));
const W = JSON.parse(read('data/wars.json'));
const SNAP = JSON.parse(read('scripts/time-index/wikidata-events.json'));
/* the shipped modules as the app links them — one instance each, so «the same reader» is a question of identity */
const TI = await import('../js/time-index.js');

test('① one index: «On this day» and the year book read the same records, cut two ways', async () => {
  const OTD = await import('../js/on-this-day.js');
  assert.equal(OTD.INDEX_PATH, TI.INDEX_PATH, 'two paths for one index');
  assert.equal(OTD.loadIndex, TI.loadIndex, '«On this day» reads the index through a reader of its own');
  assert.equal(OTD.eventsOn, TI.onDay, '«On this day»\'s day is not the index\'s calendar cut');
  for (const f of ['js/on-this-day.js', 'js/year-book.js', 'js/analysis-world-events.js']) assert.match(read(f), /from '\.\/time-index\.js'/, f + ' does not read the index');
  assert.match(codeOnly(read('js/year-book.js')), /index: loadIndex/, 'the year book\'s page does not hand it the index');
  assert.ok(!/INDEX_PATH = /.test(codeOnly(read('js/on-this-day.js'))), 'a second declaration of the index\'s path');
  /* the builder reads the war record with the function the year book uses */
  assert.match(codeOnly(read('scripts/build-on-this-day.mjs')), /TI\.warRecords\(W, \['en', 'jp'\]\)/);
  const inDays = TI.records(I).filter((r) => r.src === 'wars').map((r) => JSON.stringify(r)).sort();
  assert.deepEqual(inDays, TI.warRecords(W, ['en', 'jp']).map((r) => JSON.stringify(r)).sort(), 'the calendar cut\'s war events are not the war record\'s');
  /* a year, read by the year book, names the days the calendar names */
  const YB = await import('../js/year-book.js');
  const TB = { async collectionAt() { return { tier: 'cshapes', fc: { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] }, properties: { NAME: 'X' } }] } }; }, async changeDates() { return []; }, recordOf: () => ({ src: 'CShapes 2.0' }) };
  for (const y of [1914, 1945, 1960, 1990]) {
    const r = await YB.readYear(new Date(y, 5, 15, 12), { borders: TB, wars: async () => W, index: async () => I, lang: () => 'en' }, { maxDays: 400 });
    const want = TI.inYear(TI.records(I), y).filter((x) => x.src === 'cshapes');
    assert.equal(r.changes.stated, true, y + ': the year book did not read the index');
    assert.deepEqual(r.changes.days.map((d) => d.date), want.map((x) => x.d), y + ': the year book and the index name different days');
    for (const x of want) assert.ok(TI.onDay(I, x.d.slice(5)).includes(x), y + ': ' + x.d + ' is not in the calendar cut');
    const inForce = new Set((r.conflicts.wars || []).map((w) => w.id));
    assert.deepEqual(r.conflicts.events.map((e) => e.date), TI.inYear(TI.warRecords(W), y).filter((x) => inForce.has(x.war)).map((x) => x.d), y + ': the war operations differ');
  }
});

test('② every record says where it is from and how precisely it is dated', () => {
  const all = TI.records(I);
  assert.ok(all.length > 1000, all.length + ' records');
  for (const r of all) {
    const s = TI.sourceOf(r, I);
    assert.ok(s && typeof s.source === 'string' && s.source.length > 8, r.d + ' ' + r.src + ': no source');
    assert.ok(['day', 'month', 'year', 'day-or-year'].includes(s.precision), r.d + ': no precision');
    const sp = TI.spanOf(r);
    assert.ok(sp && sp[0] <= sp[1], r.d + ': no span');
  }
  /* the precision is the one the date is written to */
  for (const r of I.events) assert.match(r.d, { day: /^\d{4}-\d\d-\d\d$/, month: /^\d{4}-\d\d$/, year: /^\d{4}$/ }[r.prec], r.q + ' ' + r.d + ' is not written to its precision ' + r.prec);
  assert.ok(I.src.wikidata && /Wikidata/.test(I.src.wikidata) && /retrieved \d{4}-\d\d-\d\d/.test(I.src.wikidata), 'the index does not say when Wikidata was asked');
  assert.deepEqual(I.dayRecords, ['cshapes'], 'the index does not say which records it carries by the day');
});

test('③ the Wikidata events are the snapshot\'s, cite their item and property, and nothing hand-written is left', async () => {
  const F = await import(fileUrl('scripts/fetch-world-events.mjs'));
  assert.equal(I.events.length, SNAP.rows.length);
  SNAP.rows.forEach((s, i) => { const e = I.events[i]; assert.equal(e.q, s.q); assert.equal(e.d, s.d); assert.equal(e.prop, s.prop); assert.equal(e.src, 'wikidata'); });
  for (const e of I.events) {
    assert.match(e.q, /^Q\d+$/);
    assert.ok(F.DATE_PROPS.includes(e.prop), e.q + ': dated by ' + e.prop);
    assert.ok(e.name && e.name.en, e.q + ': no English name');
    if (e.at) assert.ok(Math.abs(e.at[0]) <= 180 && Math.abs(e.at[1]) <= 90, e.q + ': not a place');
  }
  /* every row of the seed is accounted for: carried, or dropped with a reason */
  assert.equal(SNAP.rows.length + SNAP.dropped.length, F.SEED.length, 'a seed row is neither carried nor dropped');
  for (const d of SNAP.dropped) assert.ok(d.reason && d.reason.length > 10, d.seed + ' dropped without a reason');
  for (const [title, , opt] of F.SEED) for (const r of (opt && opt.refuse) || []) assert.ok(r.p && r.v && r.why && r.why.length > 40, title + ': a refusal without its reason');
  assert.deepEqual(SNAP.stale, [], 'a refusal Wikidata no longer needs is still written — lift it');
  /* the date rule: P585 and P580 pooled, finest precision, then earliest (Wall Street crash: a bare year beside a day) */
  const claims = (o) => Object.fromEntries(Object.entries(o).map(([p, vs]) => [p, vs.map(([t, pr]) => ({ rank: 'normal', mainsnak: { snaktype: 'value', datavalue: { value: { time: t, precision: pr } } } }))]));
  assert.equal(F.dateOf(claims({ P585: [['+1929-00-00T00:00:00Z', 9]], P580: [['+1929-10-24T00:00:00Z', 11]] })).d, '1929-10-24');
  assert.equal(F.dateOf(claims({ P585: [['+1969-07-03T00:00:00Z', 11]], P580: [['+1969-06-28T00:00:00Z', 11]] })).d, '1969-06-28');
  assert.equal(F.dateOf(claims({ P580: [['+2009-08-02T00:00:00Z', 11]], P582: [['+1990-08-04T00:00:00Z', 11]] })), null, 'a start after the item\'s own end was taken as a date');
  assert.equal(F.dateOf(claims({ P571: [['+1680-00-00T00:00:00Z', 9]], P577: [['+1687-00-00T00:00:00Z', 9]] })).prop, 'P577', 'publication is asked before inception');
  /* the view holds no table of its own */
  const v = codeOnly(read('js/analysis-world-events.js'));
  assert.ok(!/EVENTS_DB|\bE\(1\d{3},/.test(v), 'a hand-written event row is back in the view');
});

test('④ the «World events» view lists what had begun by the master clock\'s instant', () => {
  const at = new Date(1945, 7, 16, 12);
  const list = TI.upTo(TI.records(I), at);
  assert.ok(list.length > 100);
  for (const r of list) assert.ok(TI.spanOf(r)[0] <= 19450816, r.d + ' is after the clock');
  for (let i = 1; i < list.length; i++) assert.ok(TI.spanOf(list[i - 1])[0] >= TI.spanOf(list[i])[0], 'not newest first');
  assert.ok(list.some((r) => r.d === '1945-08-15' && r.src === 'cshapes'), 'the day before the clock is missing');
  assert.ok(!list.some((r) => r.q === 'Q69163529'), 'the fall of the Berlin Wall is listed in 1945');
  const v = codeOnly(read('js/analysis-world-events.js'));
  assert.match(v, /const when=IntMapTime\.when\(\)/, 'the view does not stand at the clock');
  assert.match(v, /upTo\(records\(IX\),when\)/, 'the view does not cut the index at the clock');
  assert.match(v, /IntMapTime\.on\(/, 'a moved clock does not move the list');
  assert.ok(!/yMin|yMax|_evYear/.test(v), 'the view\'s own year range is back');
  assert.ok(!/eventsYear/.test(read('js/inline-actions.js')), 'the action for the removed year fields is still registered');
});

test('⑤ named years, read as history', () => {
  const ev = (q) => I.events.find((e) => e.q === q);
  const day = (d, src) => TI.onDay(I, d.slice(5)).filter((r) => r.d === d && r.src === src);
  /* 1914: Sarajevo is the war record's, on its day */
  assert.ok(day('1914-06-28', 'wars').some((r) => /Franz Ferdinand/.test(r.name.en)));
  /* 1945: Trinity on 16 July; the United Nations founded on 24 October (the Charter in force); Korea's zones on 15 August */
  assert.equal(ev('Q207342').d, '1945-07-16');
  assert.equal(ev('Q1065').d, '1945-10-24'); assert.equal(ev('Q1065').prop, 'P571');
  assert.ok(day('1945-08-15', 'cshapes')[0].appeared.some((p) => p.en === 'Korea (USA)'));
  /* 1989: the Wall opened on 9 November; 1990-10-03 the GDR is no longer drawn */
  assert.equal(ev('Q69163529').d, '1989-11-09');
  assert.ok(day('1990-10-03', 'cshapes')[0].ended.some((p) => p.en === 'East Germany'));
  /* the refused statements are not what the index says */
  assert.equal(ev('Q4735638').d, '2010-04-20', 'Deepwater Horizon: the blowout was 20 April 2010');
  assert.equal(ev('Q4916').d, '1999-01-01', 'the euro was introduced on 1 January 1999');
  assert.ok(!ev('Q1025404'), 'Lincoln\'s assassination is dated by the day of his death');
  assert.ok(!I.events.some((e) => e.q === 'Q856650'), 'the invasion of Kuwait is dated 2009 by a start after its own end');
  /* a Julian date says so */
  assert.equal(ev('Q160077').cal, 'julian');
});

test('⑥ the forecast has one player: the legend and the Chronos transport start the same run, and a second ends the first', async () => {
  const L = await importModule('js/time-lapse.js');
  const T = (await import(fileUrl('js/chronos.js'))).IntMapTime;
  const h0 = Math.ceil(Date.now() / 3600000) * 3600000 + 3600000;
  const A = [h0, h0 + 3600000, h0 + 3 * 3600000];
  let s = L.startLapse({ instants: A, owner: 'forecast:a', loop: false, fps: 4 });
  assert.equal(s.playing, true); assert.equal(s.owner, 'forecast:a'); assert.equal(s.instants, 3);
  assert.equal(T.when().getTime(), h0, 'the run did not start at its first instant (a forecast is ahead of now)');
  assert.equal(L.lapseOwner(), 'forecast:a');
  s = L.startLapse({ instants: A, owner: 'forecast:b', loop: false, fps: 4, at: A[1] });
  assert.equal(L.lapseOwner(), 'forecast:b', 'two forecast runs at once');
  assert.equal(T.when().getTime(), A[1], 'the run did not start where it was asked to');
  const until = async (fn, ms) => { const t0 = Date.now(); while (!fn() && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 20)); return fn(); };
  assert.ok(await until(() => !L.lapseState().playing, 5000), 'the run did not reach its last instant');
  assert.equal(T.when().getTime(), A[2], 'the run skipped or passed its listed instants');
  assert.equal(L.lapseOwner(), null);
  T.setNow({ source: 'ui' });
  /* both doors go through it, and neither keeps a timer of its own */
  const wx = codeOnly(read('js/wx-ecmwf.js')), tl = codeOnly(read('js/news-timeline.js'));
  assert.match(wx, /m\.startLapse\(o\)/); assert.match(wx, /instants: meta\.validTimes\.map\(tms\)/); assert.match(wx, /owner: PLAY_OWNER/);
  assert.ok(!/playTimer|setTimeout\(tick/.test(wx), 'the model still keeps a play timer of its own');
  assert.ok(!/everyTick\(/.test(tl), 'the Chronos transport still keeps a timer of its own');
  assert.match(tl, /function fcPlay\(\)\{[\s\S]{0,260}EC\(\)\.play\(\)/, 'the Chronos transport does not start the model\'s run');
  assert.match(tl, /const fcPlaying=\(\)=>\{ try\{ return !!\(EC\(\)&&EC\(\)\.isPlaying\(\)\)/, 'the transport asks a state of its own whether it plays');
});
