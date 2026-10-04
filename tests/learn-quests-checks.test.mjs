/* ============================================================================
 *  learn-quests — the question engine, the challenge link, the hidden year, and the doors
 * ----------------------------------------------------------------------------
 *    ① the same (kind, seed, n) gives the same questions; another seed gives others — RUN over the shipped data
 *    ② `where` asks settlements only, climbs the population-rank bands, and scores monotonically in distance
 *       (measured with js/geodesy.js — the formula the great circle on the map is walked with)
 *    ③ `when` scores monotonically in |Δyear|, and no question it can ask prints a year
 *    ④ a 1 January border day (the record may date it by its year only) is never asked
 *    ⑤ the challenge link round-trips, refuses what is not a quest, and reproduces the set
 *    ⑥ js/quest-panel.js is not in the start-up bundle, and every door reaches it by import()
 *    ⑦ while a `when` question is open, the one class on <body> hides the elements that print the year
 *    ⑧ Atlas: learn.quest is a registry row, and its catalogue text names every kind the engine has
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { importModule } from './helpers/import-module.mjs';
import { parseSource } from './helpers/ast.mjs';
import { codeOnly } from '../scripts/code-only.mjs';
import { makeQuestEngine, QUEST_KIND_IDS, QUEST_DATA, QUEST_MAX, YEAR_IN_TEXT, whereRows, whenEvents, bandOf, bandEdges, rngFor, newSeed, questQuery, questFromSearch, kindTitle, kindNeeds } from '../js/quest-engine.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const rel = (abs) => relative(ROOT, abs).replace(/\\/g, '/');

/* the map's geodesy, evaluated as the classic script it is */
const W = {}; new Function('window', read('js/geodesy.js'))(W);
const G = W.IntMapGeodesy;
const engine = makeQuestEngine({ distanceKm: (a, b) => G._distKm(a, b), halfCircumferenceKm: G._HALF_CIRCUM });
const DATA = {
  gazetteer: JSON.parse(gunzipSync(readFileSync(join(ROOT, QUEST_DATA.gazetteer))).toString('utf8')),
  onThisDay: JSON.parse(read(QUEST_DATA.onThisDay)),
};
const strip = (qs) => JSON.stringify(qs);

test('learn-quests ① the same kind, seed and n give the same questions — another seed gives others', () => {
  assert.deepEqual([...QUEST_KIND_IDS].sort(), ['when', 'where']);
  for (const kind of QUEST_KIND_IDS) {
    const a = engine.generate(kind, 'class7b', 5, DATA), b = engine.generate(kind, 'class7b', 5, DATA), c = engine.generate(kind, 'class7c', 5, DATA);
    assert.equal(a.length, 5, kind + ': five questions');
    assert.equal(strip(a), strip(b), kind + ': the same seed must give the same list');
    assert.notEqual(strip(a), strip(c), kind + ': another seed must give another list');
    assert.equal(new Set(a.map((q) => q.kind === 'where' ? q.id : q.md + '/' + q.k)).size, 5, kind + ': no question twice in a set');
    for (const k of kindNeeds(kind)) assert.ok(k in QUEST_DATA, kind + ' needs «' + k + '», which QUEST_DATA does not name');
    assert.ok(kindTitle(kind, 'en') && kindTitle(kind, 'jp') && kindTitle(kind, 'en') !== kindTitle(kind, 'jp'), kind + ': a title in en and jp');
  }
  /* the generator itself: a fixed sequence for a fixed (kind, seed) */
  const r1 = rngFor('where', 's'), r2 = rngFor('where', 's');
  for (let i = 0; i < 50; i++) { const x = r1(); assert.equal(x, r2()); assert.ok(x >= 0 && x < 1); }
  assert.match(newSeed(123456789, 987654321), /^[a-z0-9]+$/);
});

test('learn-quests ② where: settlements only, bands by population rank, the score falls with the distance', () => {
  const rows = whereRows(DATA.gazetteer), kinds = DATA.gazetteer.placeKinds;
  assert.ok(rows.length > 9000, 'the gazetteer rows were read (' + rows.length + ')');
  const F = DATA.gazetteer.fields, fc = F.indexOf('fcode');
  const notSettlement = DATA.gazetteer.rows.filter((r) => !kinds[r[fc]] || kinds[r[fc]].kind !== 'settlement').length;
  assert.ok(notSettlement > 0 && rows.length === DATA.gazetteer.rows.length - notSettlement - DATA.gazetteer.rows.filter((r) => !r[0]).length, 'exactly the rows GeoNames calls a settlement');
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1].pop >= rows[i].pop, 'most populous first');
  const E = bandEdges(rows.length);
  assert.equal(E.length, 4); assert.equal(E[0], 0); assert.equal(E[3], rows.length);
  assert.ok(E[1] < E[2] && E[2] < E[3], 'three non-empty bands: ' + E.join(' / '));
  assert.deepEqual([0, 1, 2, 3, 4].map((i) => bandOf(i, 5)), [0, 0, 1, 1, 2], 'a set climbs from easy to hard');
  const qs = engine.generate('where', 'bands', 9, DATA);
  qs.forEach((q, i) => {
    assert.equal(q.band, bandOf(i, 9));
    const rank = rows.findIndex((r) => r.id === q.id);
    assert.ok(rank >= E[q.band] && rank < E[q.band + 1], q.name.en + ' (rank ' + rank + ') is not in band ' + q.band);
  });
  /* distance: monotone, a perfect tap is the maximum, the antipode is exactly 1 point, a skip is 0 */
  const q = qs[0], [lng, lat] = q.at;
  let last = Infinity;
  for (const d of [0, 0.01, 0.1, 0.5, 1, 3, 10, 30, 60, 90, 120, 179]) {
    const s = engine.score(q, { lng, lat: Math.max(-89, Math.min(89, lat - d)) });
    assert.ok(s.points <= last, 'the score must not rise with the distance (' + d + '°)'); last = s.points;
    assert.equal(s.max, QUEST_MAX);
  }
  assert.equal(engine.score(q, { lng, lat }).points, QUEST_MAX);
  assert.equal(engine.score(q, { lng: lng > 0 ? lng - 180 : lng + 180, lat: -lat }).points, 1);
  assert.equal(engine.score(q, null).points, 0);
  /* the kilometres are js/geodesy.js's — London → Paris on the mean radius is 343.5 km */
  assert.ok(Math.abs(G._distKm([-0.1278, 51.5074], [2.3522, 48.8566]) - 343.5) < 1);
  /* …and a distance that could not be measured is not scored as one */
  const blind = makeQuestEngine({});
  assert.deepEqual(blind.score(q, { lng: 0, lat: 0 }).detail, { unmeasured: true });
});

test('learn-quests ③ when: the score falls with |Δyear|, and no question prints a year', () => {
  const pool = whenEvents(DATA.onThisDay);
  assert.ok(pool.length > 500, 'the day index was read (' + pool.length + ' events)');
  for (const e of pool) {
    const words = [e.words.text.en, e.words.text.jp, e.words.record.en, e.words.record.jp, e.words.war ? e.words.war.en : '', e.words.war ? e.words.war.jp : ''];
    words.forEach((w) => assert.ok(!YEAR_IN_TEXT.test(w), 'a question would print a year: ' + w));
  }
  /* the rule is live: the index does hold events whose words carry a year, and they are the ones left out */
  const all = Object.values(DATA.onThisDay.days).flat();
  const withYear = all.filter((ev) => ev.src === 'wars' && ev.name && YEAR_IN_TEXT.test(ev.name.en + ' ' + ev.name.jp));
  assert.ok(withYear.length > 0, 'no event in the index names a year — the exclusion would be untested');
  assert.ok(withYear.every((ev) => !pool.some((p) => p.ev === ev)), 'an event that names a year is asked');
  for (const q of engine.generate('when', 'years', 40, DATA)) {
    for (const v of [q.text.en, q.text.jp, q.record.en, q.record.jp, q.war && q.war.en, q.war && q.war.jp]) if (v) assert.ok(!String(v).includes(String(q.year)), 'the question names its own year: ' + v);
    assert.ok(q.year >= q.span.from && q.year <= q.span.to);
    assert.ok(q.view && isFinite(q.view.lng) && isFinite(q.view.lat) && isFinite(q.view.zoom), 'the question has a map to be asked on');
  }
  const q = engine.generate('when', 'mono', 1, DATA)[0];
  let last = Infinity;
  for (const off of [0, 1, 2, 5, 10, 20, 40, 80, 133]) {
    const y = Math.max(q.span.from, Math.min(q.span.to, q.year + (q.year - q.span.from > q.span.to - q.year ? -off : off)));
    const s = engine.score(q, { year: y });
    assert.ok(s.points <= last, 'the score must not rise with the error (' + off + ' years)'); last = s.points;
  }
  assert.equal(engine.score(q, { year: q.year }).points, QUEST_MAX);
  const far = q.year - q.span.from > q.span.to - q.year ? q.span.from : q.span.to;
  assert.equal(engine.score(q, { year: far }).points, 1, 'the largest error the span allows is exactly 1 point');
  assert.equal(engine.score(q, null).points, 0);
});

test('learn-quests ④ a 1 January border day is never asked — the record may date it by its year only', () => {
  const all = Object.values(DATA.onThisDay.days).flat();
  const yearOnly = all.filter((ev) => ev.maybeYearOnly);
  assert.ok(yearOnly.length > 0, 'the index marks no 1 January day — the rule would be untested');
  assert.ok(yearOnly.every((ev) => ev.src === 'cshapes' && /-01-01$/.test(ev.d)));
  const pool = whenEvents(DATA.onThisDay);
  assert.ok(!pool.some((p) => p.ev.maybeYearOnly), 'a possibly-year-only day is in the pool');
  for (const seed of ['a', 'b', 'c', 'd']) assert.ok(!engine.generate('when', seed, 60, DATA).some((q) => DATA.onThisDay.days[q.md][q.k].maybeYearOnly));
});

test('learn-quests ⑤ the challenge link round-trips and reproduces the set', () => {
  for (const kind of QUEST_KIND_IDS) {
    const back = questFromSearch(questQuery(kind, 'Ab_9-z', 7));
    assert.deepEqual(back, { kind, seed: 'Ab_9-z', n: 7 });
    assert.equal(strip(engine.generate(back.kind, back.seed, back.n, DATA)), strip(engine.generate(kind, 'Ab_9-z', 7, DATA)));
  }
  assert.deepEqual(questFromSearch('?tour=europe&quest=where.x.3'), { kind: 'where', seed: 'x', n: 3 }, 'beside other page fields');
  for (const bad of ['', '?quest=', '?quest=nowhere.x.5', '?quest=where..5', '?quest=where.x.0', '?quest=where.x', '?quest=where.a b.5', '?quest=where.x.5.6'])
    assert.equal(questFromSearch(bad), null, 'accepted ' + JSON.stringify(bad));
  assert.match(questQuery('when', 's1', 5), /^\?quest=when\.s1\.5$/);
});

/* the entry's STATIC import closure, from the parsed source of every file it reaches (the method of
   tests/startup-lazy-layers-checks.test.mjs ①: a bundler puts a module in the entry chunk exactly when this reaches it) */
function staticClosure(entry) {
  const seen = new Set(); const stack = [resolve(ROOT, entry)];
  while (stack.length) {
    const f = stack.pop(); if (seen.has(f)) continue; seen.add(f);
    if (!/\.m?js$/.test(f) || !existsSync(f)) continue;
    const ast = parseSource(readFileSync(f, 'utf8'), { sourceType: 'module', orNull: true });
    if (!ast) continue;
    for (const n of ast.body) {
      const src = (n.type === 'ImportDeclaration' || ((n.type === 'ExportNamedDeclaration' || n.type === 'ExportAllDeclaration') && n.source)) ? n.source.value : null;
      if (src && /^\.\.?\//.test(src)) stack.push(resolve(dirname(f), src));
    }
  }
  return new Set([...seen].map(rel));
}

test('learn-quests ⑥ the panel and the engine are not in the start-up bundle; every door imports them on demand', () => {
  const eager = staticClosure('src/main.js');
  assert.ok(eager.has('js/app-body.js') && eager.size > 150, 'the entry graph was not read (' + eager.size + ')');
  for (const f of ['js/quest-panel.js', 'js/quest-engine.js', 'js/atlas-cap-learn.js']) assert.ok(!eager.has(f), f + ' is in the boot graph');
  assert.match(read('src/main.js'), /if \(\/\[\?&\]quest=\/\.test\(location\.search\)\) import\('\.\.\/js\/quest-panel\.js'\)\.then\(\(m\) => m\.bootFromUrl\(\)\)/, 'a challenge link starts the set');
  assert.match(read('js/analysis-edu.js'), /data-quest="where"[\s\S]*data-quest="when"[\s\S]*import\('\.\/quest-panel\.js'\)\.then\(m=>m\.startQuest\(\{kind\}\)\)/, 'the quiz menu offers both quests');
  assert.match(read('js/map-ui.js'), /id:'tool\.learnQuest'[\s\S]{0,700}run:\(\)=>import\('\.\/quest-panel\.js'\)\.then\(m=>m\.openQuest\(\)\)/, 'Layers ▸ Tools has the row');
  assert.match(read('js/atlas-cap-learn.js'), /await import\('\.\/quest-panel\.js'\)/, 'Atlas reaches the panel by import()');
  /* the engine is pure: no page objects in its code (comments aside) */
  assert.doesNotMatch(codeOnly(read('js/quest-engine.js')), /\b(window|document|localStorage|location|fetch)\b/, 'js/quest-engine.js reaches the page');
  /* and the panel publishes no global (check:surface) */
  assert.doesNotMatch(codeOnly(read('js/quest-panel.js')), /window\.[A-Za-z_$]+\s*=[^=]/, 'js/quest-panel.js assigns a window global');
});

/* the end of the element that opens at `start` in `html` — <div> depth counted */
function elementSpan(html, idAttr) {
  const at = html.indexOf(idAttr); assert.ok(at > 0, idAttr + ' is not in index.html');
  const open = html.lastIndexOf('<div', at); let depth = 0;
  const re = /<\/?div\b/g; re.lastIndex = open;
  for (let m; (m = re.exec(html));) { depth += m[0] === '<div' ? 1 : -1; if (depth === 0) return [open, m.index]; }
  return [open, html.length];
}

test('learn-quests ⑦ while a «which year?» question is open, one class on <body> hides every element that prints the year', () => {
  const src = read('js/quest-panel.js');
  const cls = /export const BLIND_CLASS = '([a-z-]+)'/.exec(src), list = /export const BLIND_SELECTORS = (\[[^\]]*\]);/.exec(src);
  assert.ok(cls && list, 'BLIND_CLASS / BLIND_SELECTORS are not declared where the check reads them');
  const sels = JSON.parse(list[1].replace(/'/g, '"'));
  /* the rule is built from the list, with the class, and it hides (visibility — nothing around them moves) */
  assert.match(src, /'body\.' \+ BLIND_CLASS \+ ' ' \+ BLIND_SELECTORS\.join\(', body\.' \+ BLIND_CLASS \+ ' '\) \+ '\{visibility:hidden !important;pointer-events:none !important;\}'/);
  assert.match(src, /if \(q\.kind === 'when'\) \{[^}]*blind\(true\); showDay\(q\); \}/, 'a when question turns the class on');
  assert.match(src, /else blind\(false\);\s+\/\* the answer is out/, 'the reveal turns it off');
  const html = read('index.html');
  /* #news-timeline is Chronos: every element js/news-timeline.js writes into (the shown year on the collapsed button,
     the large readout, the rail…) lies inside it */
  assert.ok(sels.includes('#news-timeline'));
  const [a, b] = elementSpan(html, 'id="news-timeline"');
  const ntlIds = [...new Set([...read('js/news-timeline.js').matchAll(/getElementById\('(ntl-[a-z-]+)'\)/g)].map((m) => m[1]))].filter((id) => html.includes('id="' + id + '"'));
  assert.ok(ntlIds.includes('ntl-open-t') && ntlIds.includes('ntl-bigval') && ntlIds.length > 10, 'the Chronos ids were read (' + ntlIds.length + ')');
  for (const id of ntlIds) { const at = html.indexOf('id="' + id + '"'); assert.ok(at > a && at < b, '#' + id + ' (written by js/news-timeline.js) is outside #news-timeline — the class would not hide it'); }
  /* the year really is printed there: the collapsed button's line is set from the clock's year/date */
  assert.match(read('js/news-timeline.js'), /ot\.textContent=\(mode==='year'\)\?yLabel\(e\.year\)/);
  /* every other selector hits an element that exists: an id in index.html, a class a module builds around the year field */
  for (const s of sels) {
    if (s.startsWith('#')) assert.ok(html.includes('id="' + s.slice(1) + '"'), s + ' is not in index.html');
    else if (s === '.dl-clockrow') assert.match(read('js/data-layers.js'), /row\.className='dl-clockrow'[\s\S]{0,1500}class="dl-clockyear"[\s\S]{0,3000}y=IntMapTime\.isLive\(\)\?null:IntMapTime\.year\(\)/, '.dl-clockrow is not the row that prints the clock\'s year');
    else assert.fail('a selector the check does not know how to hold to an element: ' + s);
  }
});

test('learn-quests ⑧ Atlas: learn.quest is registered, and its catalogue text names every kind', async () => {
  const { makeAtlasCapabilities } = await importModule('js/atlas-capabilities.js');
  const CAPS = makeAtlasCapabilities({ lang: 'en' });
  const cap = CAPS.resolve('learn.quest');
  assert.ok(cap, 'learn.quest is not registered');
  assert.equal(CAPS.resolve('quest').id, 'learn.quest', 'the dispatch spelling resolves');
  const { default: entries } = await import('../js/atlas-cap-learn.js');
  const doc = entries[0].doc.map((d) => String(d.text)).join(' ');
  for (const k of QUEST_KIND_IDS) assert.ok(doc.includes('"' + k + '"'), 'the catalogue text does not name the kind «' + k + '»');
  assert.match(doc, /学ぶクエスト/); assert.match(doc, /CHALLENGE LINK/);
  const props = entries[0].schema().properties;
  assert.deepEqual(Object.keys(props).sort(), ['action', 'kind', 'n', 'seed']);
});

test('learn-quests ⑨ while a «where is it?» question is open, the rows that write names are switched off — and only those are switched back', async () => {
  const M = await import('../js/layer-manifest.js');
  const names = M.nameItems();
  assert.ok(names.length > 0, 'some display row declares that it writes names (js/layers/<id>.js `names: true`)');
  const display = new Set(M.displayItems().map((l) => l.id));
  for (const id of names) assert.ok(display.has(id), id + ' writes names but is not a map display item');
  const src = readFileSync(new URL('../js/quest-panel.js', import.meta.url), 'utf8');
  const ask = src.slice(src.indexOf('function ask()'), src.indexOf('function answer('));
  assert.match(ask, /else \{[^}]*unnamed\(true\)/, 'a where question switches the names off');
  assert.match(ask, /'when'\) \{ unnamed\(false\)/, 'a when question shows the names');
  const ans = src.slice(src.indexOf('function answer('), src.indexOf('function next('));
  assert.match(ans, /'where'\) \{ unnamed\(false\)/, 'the answer brings the names back');
  assert.match(src, /function endSet\(\) \{[^}]*unnamed\(false\)/, 'closing brings the names back');
  /* the switch-back is exactly what was switched off: a row the reader had off stays off */
  const unn = src.slice(src.indexOf('let unnamedIds'), src.indexOf('return unnamedIds.slice();'));
  assert.match(unn, /flip\(id, false\)\) unnamedIds\.push\(id\)/, 'only a row this file actually turned off is remembered');
});
