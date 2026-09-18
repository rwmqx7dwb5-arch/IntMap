/* ============================================================================
 *  R775 — 55 QUESTIONS PUT TO ATLAS ON PRODUCTION, AND THE FOUR DEFECTS THAT SURVIVED EVERY GATE
 * ----------------------------------------------------------------------------
 *  Measured on https://rwmqx7dwb5-arch.github.io/IntMap/ , logged in, build 2026-09-17-R769.
 *  `npm test` was green, CI was green, and the reader was still being handed these:
 *
 *  ① 「GDP上位10か国を…1人あたりGDPと比べて」 — `data.rank {metric:"gdp_per_capita"}` answered with
 *     **Antarctica $200,000 in FIRST place**, ahead of Monaco, and 「下位」 came back as five rows all
 *     reading 0 /km². Nothing hardcodes $200,000: it is Natural Earth's own GDP_MD/POP_EST for a
 *     continent whose 「population」 is research-station staff (js/countries-ui.js:399). The Countries
 *     tab does not show Antarctica and neither does `map.highlight` — both ask `sov!==false`. Six
 *     Atlas paths never asked at all. ONE PREDICATE, asked everywhere (js/atlas-metrics.js).
 *
 *  ② The same turn sent `metric:"名目GDP（現在価格米ドル）"` → refused, `"gdp"` → ok, then
 *     `"名目GDP"` → **refused again, inside the same turn**. `gdp` prints itself 「GDP（名目）」: the
 *     query was the same two tokens in the other order, and #R741's partial match only ever asked
 *     「is the query part of a name」. It asks both directions now, still uniquely (#R741's rule is
 *     what keeps that safe). #R740/#R741/#R760 each fixed this file; the shape that got through them
 *     is ORDER, and the one that got through with it is a name plus a qualification.
 *
 *  ③ The refusal the reader saw was 「有効: pop, density, area, gdp, gdppc, hdi, dem, milSpend,
 *     milSpendGDP, tfr, lifeExp, internet」 — twelve internal identifiers and nothing saying what any
 *     of them means. The planner needs the key; the reader needs the name; one string can carry both.
 *
 *  ④ Atlas cleared or switched off work it had just produced, four times in one session:
 *     1900 borders drawn then both border layers switched OFF as the last two operations; a GDP
 *     choropleth painted then wiped by its own `map.clearAll` mid-turn; ten head offices never
 *     plotted because four of seven operations went on tidying an ALREADY EMPTY map; 22 Mediterranean
 *     countries highlighted, then cleared and redrawn three times, ending empty. #R742 gave LAYERS an
 *     origin mark for exactly this reason and stopped there — every DRAWING was still a bare count,
 *     so 「a layer you turned on for an EARLIER question」 was an instruction Atlas had no way to obey.
 *
 *  ⑤ And the chat did not scroll to the answer: with a 3,075px reply the reply began at 7,900 while
 *     `scrollTop` sat at 7,050 — 745px above the reader's OWN question. #R79g's intent is right; it
 *     anchored to a pixel while the content above it kept changing height.
 *
 *  ⚠ WHAT THESE HOLD THE ROUND TO: one predicate rather than six edited loops, a resolver that is
 *  still refused when the answer would be a guess, and marks that state an observation and command
 *  nothing — nothing Atlas could do before is refused now (CONSTITUTION.md §5).
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const NL = String.fromCharCode(10);

/* the module under test is an ES module with no DOM in it — import it for real rather than
   reading its source, because #R505's finding is that source-reading checks cannot see order */
const METRICS_MOD = await import('file://' + join(ROOT, 'js', 'atlas-metrics.js').split('\\').join('/'));

/* the factory needs five helpers out of the kernel's closure; these are the same shapes, no more */
function makeMetrics(lang) {
  const pick = (tuple) => (Array.isArray(tuple) ? (lang === 'jp' ? tuple[1] : tuple[0]) : tuple);
  return METRICS_MOD.makeAtlasMetrics({}, {
    LA: (...a) => a,
    lx: pick,
    L: (...a) => pick(a),
    esc: (x) => String(x == null ? '' : x),
    warn: (h) => String(h),
    R: (ok, html, extra) => Object.assign({ ok: !!ok, html: html || '' }, extra || null),
  });
}

/* ── ① ONE PREDICATE FOR 「WHICH ROW IS A COUNTRY」 ─────────────────────────────────────────── */

test('R775 ① the predicate answers the measured rows, and narrows nothing else', () => {
  /* ⚠ it is a FACTORY member, not a module export — tests/r199 ① wants one binding on the import
     line and tests/r175 ③ wants every export imported by name; inside the factory both hold, and it
     is still ONE definition (js/atlas-metrics.js says why). */
  const ok = makeMetrics('en').isRankableCountry;
  assert.equal(typeof ok, 'function', 'makeAtlasMetrics must return isRankableCountry');
  /* Antarctica is the row the Countries tab already declines to show (sov===false, measured) */
  assert.equal(ok({ sov: false, nameEn: 'Antarctica' }), false);
  /* …and the dependencies the product DOES show stay — measured in the same screenshot,
     Bermuda 4th and the French Southern and Antarctic Lands 5th by GDP per capita */
  assert.equal(ok({ sov: true, nameEn: 'Bermuda' }), true);
  assert.equal(ok({ sov: true, nameEn: 'French Southern and Antarctic Lands' }), true);
  /* no record of sovereignty is not a claim that it is not one (#R742's rule, #R699's shape) */
  assert.equal(ok({ nameEn: 'Japan' }), true);
  /* a row with no name cannot be ranked by name */
  assert.equal(ok({ sov: true }), false);
  assert.equal(ok(null), false);
});

test('R775 ① every Atlas path that RANKS countryStats asks the predicate', () => {
  const src = read('js/atlas-console.js');
  /* the母集合 is discovered, not listed: every enumeration of countryStats in the kernel.
     ⚠ THE RULE IS ATTACHED TO THE FACT, NOT TO A FUNCTION NAME (#R429): a loop that reads a METRIC
     off the row is producing a ranking, a shading or a score, and every one of those must ask who
     is a country. A loop that reads a NAME (the office-question matcher) or COUNTS coverage
     (`_fillMetric`) is not ranking anything, and is not asked to. */
  const loops = [];
  const needle = 'in countryStats){';
  for (let i = src.indexOf(needle); i >= 0; i = src.indexOf(needle, i + 1)) loops.push(src.slice(i, i + 220));
  assert.ok(loops.length >= 8, `expected the kernel to still enumerate countryStats; found ${loops.length}`);
  const ranking = loops.filter((L) => /\.m\.get\(|\bm\.get\(|sw=0,sv=0/.test(L));
  assert.ok(ranking.length >= 6, `expected at least 6 ranking loops, found ${ranking.length}`);
  ranking.forEach((L) => {
    assert.ok(/isRankableCountry|sov===false/.test(L),
      'a loop that ranks countryStats without asking who is a country:' + NL + L.slice(0, 200));
  });
});

/* ── ② THE RESOLVER READS CONTAINMENT IN BOTH DIRECTIONS ───────────────────────────────────── */

test('R775 ② the metric names measured on production resolve', () => {
  for (const lang of ['jp', 'en']) {
    const M = makeMetrics(lang);
    /* the two spellings that were refused in one production turn */
    assert.equal(M.metSpec('\u540d\u76eeGDP') && M.metSpec('\u540d\u76eeGDP').key, 'gdp', lang);
    assert.equal(M.metSpec('\u540d\u76eeGDP\uff08\u73fe\u5728\u4fa1\u683c\u7c73\u30c9\u30eb\uff09') && M.metSpec('\u540d\u76eeGDP\uff08\u73fe\u5728\u4fa1\u683c\u7c73\u30c9\u30eb\uff09').key, 'gdp', lang);
    /* the English form of the same shape: a name plus a qualification */
    assert.equal(M.metSpec('nominal GDP (current US$)').key, 'gdp', lang);
    /* the one Atlas actually sent and which already worked — unchanged */
    assert.equal(M.metSpec('gdp').key, 'gdp', lang);
    assert.equal(M.metSpec('gdp_per_capita').key, 'gdppc', lang);
    /* #R741's case must still work: a unique PART of a name is that name */
    assert.equal(M.metSpec('life').key, 'lifeExp', lang);
    /* #R740's: the right key, whichever set the metric lives in */
    assert.equal(M.metSpec('lifeExp').key, 'lifeExp', lang);
    assert.equal(M.metSpec('internet').key, 'internet', lang);
  }
});

test('R775 ② a guess is still worse than a refusal', () => {
  const M = makeMetrics('en');
  /* #R741's warning, held: `pop` is inside `pop` AND `popdensity`, so the exact hit wins and the
     fuzzy pass is never allowed to choose between them */
  assert.equal(M.metSpec('pop').key, 'pop');
  assert.equal(M.metSpec('density').key, 'density');
  /* nothing IntMap holds — still refused, and still refused permanently */
  assert.equal(M.metSpec('CO2 emissions per capita'), null);
  assert.equal(M.metSpec('corruption perceptions index'), null);
  assert.equal(M.metSpec(''), null);
  assert.equal(M.metSpec(null), null);
  /* ⚠ THE FIRST VERSION OF ②'s FIX FAILED THIS ONE: `dem` lives inside `demographics`, and asking
     only for containment made 「tell me about the demographics of the world」 the Democracy Index.
     A name counts only where it is a whole word in the ORIGINAL text. */
  assert.equal(M.metSpec('tell me about the demographics of the world'), null);
  assert.equal(M.metSpec('which country is the most democratic'), null, '`dem` inside `democratic` is not a name');
  assert.equal(M.metSpec('a map of popular music'), null, '`pop` inside `popular` is not a name');
  /* longest wins, so a qualified name resolves to the metric it names and not to its first token */
  assert.equal(M.metSpec('GDP per capita, current US$').key, 'gdppc');
  assert.equal(M.metSpec('population density by country').key, 'density');
  const r = M.unknownMetric('CO2 emissions per capita');
  assert.equal(r.ok, false);
  assert.equal(r.meta && r.meta.code, 'unknown_metric');
  assert.equal(r.meta && r.meta.permanent, true, '#R760: this KIND of request is not available, and another spelling cannot help');
});

/* ── ③ THE REFUSAL HAS TWO READERS AND ONE STRING ──────────────────────────────────────────── */

test('R775 ③ the refusal the READER sees names the metrics, not just their identifiers', () => {
  const M = makeMetrics('jp');
  const html = M.unknownMetric('\u540d\u76ee\u306e\u4f55\u304b').html;
  /* the planner still gets every key it must send back */
  M.metKeys().forEach((k) => assert.ok(html.includes(k), 'key missing from the refusal: ' + k));
  /* …and the reader is told what they are, in the language they are reading */
  assert.ok(html.includes('gdp (GDP\uff08\u540d\u76ee\uff09)'), 'the jp label is not beside the key:' + NL + html);
  assert.ok(html.includes('\u4eba\u53e3'), 'population is not named in Japanese:' + NL + html);
  const en = makeMetrics('en').unknownMetric('x').html;
  assert.ok(en.includes('gdp (GDP (nominal))'), 'the en label is not beside the key:' + NL + en);
  assert.ok(en.includes('lifeExp (Life expectancy)'), en);
});

/* ── ④ WHAT ATLAS DREW, AND WHEN ───────────────────────────────────────────────────────────── */

test('R775 ④ the drawing ledger is discovered from the snapshot, not from a list of capabilities', () => {
  const st = read('js/atlas-state.js');
  assert.ok(/var paintOrigin = Object\.create\(null\)/.test(st), 'no drawing-origin ledger');
  /* #R742's rule, held: the keys come off the published `atlas` section, so a drawing added later
     is marked without anybody writing its name here */
  assert.ok(/function paintKeysNow\s*\(\)\s*{[\s\S]{0,400}providers\['atlas'\]/.test(st),
    'paintKeysNow must read the published snapshot section, not a hand-written list');
  assert.ok(!/paintKinds\s*=\s*\[/.test(st), 'a hand-written list of drawing kinds is exactly what #R742 refused to write');
  /* recorded at the same two moments layers are, and nowhere else */
  assert.ok(/observeLayers\(_by\); observePaints\(_by\);/.test(st), 'paints must be observed where operations land');
  assert.ok(/observePaints\(null\)/.test(st), 'paints must be baselined at the turn boundary, attributed to no one');
  /* the reader's own pins are never claimed */
  assert.ok(!/paintMark\('userPins'\)/.test(st), 'userPins are the reader\u2019s — a ledger may not claim an author it lacks');
});

test('R775 ④ the prompt says WHEN a drawing appeared, and says when there is nothing', () => {
  const st = read('js/atlas-state.js');
  assert.ok(st.includes('YOU drew this'), 'the mark is not in the state block');
  assert.ok(st.includes('THIS turn'), 'the load-bearing word is missing');
  /* every drawing the block reports carries the mark — the four measured failures were a highlight,
     a choropleth, a layer pair and a pin set, and naming only some of them would leave the next one */
  ['highlightCountries', 'highlight', 'choropleth', 'customScore', 'pins', 'polygons', 'lines', 'measure', 'radius']
    .forEach((k) => assert.ok(st.includes("paintMark('" + k + "')"), 'drawing not marked: ' + k));
  /* …and the empty map is STATED, because absence of a line is not a statement */
  assert.ok(/NO Atlas drawing right now/.test(st), 'an empty map must say so — four clears were spent finding out');
  /* ⚠ it must remain an observation: nothing here switches anything off or keeps anything alive */
  assert.ok(!/clearAll\(|\.remove\(|setVisible\(/.test(st.slice(st.indexOf('var paintOrigin'), st.indexOf('var paintOrigin') + 3000)),
    'the ledger must record, never act');
});

/* ── ⑤ THE CHAT SCROLLS TO THE ANSWER ──────────────────────────────────────────────────────── */

test('R775 ⑤ the auto-scroll anchors to the reader\u2019s question, not to a pixel', () => {
  const src = read('js/atlas-console.js');
  const i = src.indexOf('(#R79g) auto-scroll');
  assert.ok(i > 0, '#R79g\u2019s auto-scroll is gone');
  const block = src.slice(i, i + 2600);
  assert.ok(/\.atl-b\.u/.test(block), 'the anchor must be the last USER bubble');
  assert.ok(/offsetTop/.test(block), 'anchoring to an element means reading its offset, not the scroll height');
  /* #R79g's own half is untouched: near the bottom, a short reply still drops fully into view */
  assert.ok(/scrollHeight-chatEl\.scrollTop-chatEl\.clientHeight<150/.test(block), '#R79g\u2019s near-bottom test was removed');
  assert.ok(/chatEl\.scrollTop=chatEl\.scrollHeight/.test(block), '#R79g\u2019s short-reply behaviour was removed');
  /* …and a reader who scrolled away by hand is never yanked back */
  assert.ok(/clientHeight\*3/.test(block), 'nothing stops the anchor from yanking a reader who scrolled away');
});

/* ── ⑥ A TURN THAT DIED WITH NOTHING DONE KEEPS THE QUESTION ───────────────────────────────── */

test('R775 ⑥ a turn that filed no operation puts the question back in the composer', () => {
  const src = read('js/atlas-console.js');
  const i = src.indexOf('A TURN THAT DIED WITH NOTHING DONE');
  assert.ok(i > 0, 'the login-loss path does not restore the question');
  const block = src.slice(i - 900, i);
  /* it belongs to the turn's own catch, beside the red bubble the reader is shown */
  assert.ok(/inEl\.value=q/.test(block), 'the composer is not refilled');
  /* ⚠ ONLY when nothing ran — a half-finished turn must never be re-offered whole */
  assert.ok(/_t&&_t\.operations&&_t\.operations\.length/.test(block), 'the "nothing was done" condition is missing');
  /* ⚠ ONLY when the composer is empty — what the reader typed is theirs */
  assert.ok(/!String\(inEl\.value\|\|''\)\.trim\(\)/.test(block), 'it would overwrite what the reader has typed');
  /* ⚠ and it never sends by itself */
  assert.ok(!/fire\(\)/.test(block), 'restoring a question must not re-send it');
});

/* ── ⑦ A REFUSAL ABOUT THE KIND OF REQUEST SAYS SO, IN THE PANDEMIC ENGINE TOO ─────────────── */

test('R775 ⑦ sim.pandemicRun declares which refusals rewording cannot fix', async () => {
  const src = read('js/pandemic-atlas.js');
  /* the vocabulary was already in the refusal; what was missing is #R760's `permanent` */
  assert.ok(/function fail\(msg, code, permanent\)/.test(src), 'fail() cannot carry the fact');
  assert.ok(/permanent: permanent \? true : undefined/.test(src), 'the flag never reaches meta');
  /* ⚠ ONLY the unknown-key case — a value out of range is a different request that can succeed */
  assert.ok(/bad\.some\(\(b\) => b\.why === 'unknown'\)/.test(src),
    'params-rejected must be permanent only when the KEY is one this engine does not have');
  assert.ok(/'preset-unknown', true\)/.test(src), 'preset-unknown enumerates every preset — rewording cannot help');
  /* the model side of the contract is unchanged and still reads it */
  const surface = read('js/atlas-toolsurface.js');
  assert.ok(/permanentFailure: meta\.permanent \? true : undefined/.test(surface), '#R760’s reader moved or went away');
  /* …and the engine still enumerates what it DOES accept (that half was already right) */
  const model = read('js/pandemic-model.js');
  assert.ok(/accepts: Object\.keys\(PANDEMIC_PARAMS\)/.test(model), 'the refusal stopped carrying the vocabulary');
});

/* ── the kernel may not grow to pay for any of this ────────────────────────────────────────── */

test('R775 js/atlas-console.js stayed under its shrink-only ceiling', () => {
  /* (#R786) the line ceiling that stood here is retired: LINES measured the file's length, not what it costs or reaches. `npm run check:perf` ratchets the eager bundle and `npm run check:surface` ratchets IM_HOST / window.* — see tests/r168 #8. */
  assert.ok(read('js/atlas-console.js').length > 0);
});
