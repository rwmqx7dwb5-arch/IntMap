/* ============================================================================
 *  js/atlas-agent.js — a repeated call, a repeated refusal, a repeated partial
 * ----------------------------------------------------------------------------
 *  The repeat guards of the loop (#R731, #R741, #R760) and the verdicts that stopped reading an
 *  identical repaint as a failure (#R760). Measured on production each time; the fix is never a lower
 *  ceiling (.agents/rules/one-pass-or-a-reason.md).
 *
 *  Consolidated from the round files named in each section banner below. Every test keeps the title
 *  it had there (untagged titles now carry the round they came from, #R<N>), and every section keeps
 *  its own history comment: why the check exists and what was measured. Each section is its own
 *  block, so its helpers stay its own; what every section shared (the repository root) is declared
 *  once below the imports.
 *
 *  Checks that used to READ a file for a spelling and can be RUN were rewritten to run the shipped
 *  code; the ones that still read say, in one line, why running is not possible (「read, not run: …」).
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly } from '../scripts/code-only.mjs';
import { readFileSync } from 'node:fs';

/* the repository root, shared by every section below (each used to derive its own) */
const ROOT = fileURLToPath(new URL('../', import.meta.url));

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  from tests/r731-atlas-repeat-checks.test.mjs
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
/* ============================================================================
 *  #R731 — the same call, made again after its own answer was handed back, is not progress
 * ----------------------------------------------------------------------------
 *  Measured on production (2026-09-15, 「ISSは今どこ？次に東京の上空を通るのはいつ？」, gpt-5.6-sol):
 *  the model was handed the full satellite result AND the note 「this turn has ALREADY made this
 *  exact call — use this result」, and replied with the identical call seven more times, each with
 *  turn:"continuing", until the step budget ran out; the forced final came back as a JSON turn too.
 *  The reader got result rows and no sentence, after 46 s.
 *
 *  Two consecutive steps made only of reused calls is the earliest moment the loop can KNOW that
 *  nothing new is coming: the turn then stops calling and goes to the answer (`stopped:
 *  'repeated_calls'`). A call that asks anything different is not counted — nothing is taken from
 *  Atlas (CONSTITUTION.md §5). And when even the forced final says nothing, the console writes one
 *  sentence of its own saying what happened.
 * ==========================================================================*/

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const { makeAtlasAgent } = await import('../js/atlas-agent.js');
const { makeAtlasToolSurface } = await import('../js/atlas-toolsurface.js');
const { makeAtlasCapabilities } = await import('../js/atlas-capabilities.js');
const { makeAtlasSchemas } = await import('../js/atlas-schemas.js');

const AGENT = makeAtlasAgent();
const CAPS = makeAtlasCapabilities({});
const SCHEMAS = makeAtlasSchemas();
const same = { text: '計算します。', toolCalls: [{ id: 'a', name: 'run_capability', arguments: { id: 'layers.satellites', args: { name: 'ISS', place: 'Tokyo' } } }], turnState: 'continuing' };

async function turn(script) {
  const ran = [];
  const surface = makeAtlasToolSurface({ capabilities: CAPS, schemas: SCHEMAS,
    runAction: async (action) => { ran.push(action); return { ok: true, html: '<div>✓ ISS — next pass 16:24, max 74°</div>', meta: { status: 'completed', produced: ['map'] } }; } });
  const tools = surface.baseTools();
  const seen = [];
  let i = 0;
  const model = async (req) => { seen.push(req); const r = script[Math.min(i, script.length - 1)]; i++; return typeof r === 'function' ? r(req) : r; };
  const out = await AGENT.runTurn({ model, tools, execute: surface.makeExecute(tools, AGENT), system: 'sys', messages: [{ role: 'user', content: 'ISSは今どこ？' }] });
  return { out, ran, seen };
}

test('R731 ① a turn that repeats its own answered call stops after two identical steps and goes to the answer', async () => {
  const { out, ran, seen } = await turn([same, same, same, same, same, same, same, same, { text: '', toolCalls: [], final_text: '' }]);
  assert.equal(out.stopped, 'repeated_calls');
  assert.equal(ran.length, 1, 'the tool ran once; the reuse answered the rest');
  const finals = seen.filter((r) => r && r.final);
  assert.equal(finals.length, 1, 'one forced final was asked for');
  assert.ok(seen.length <= 4, 'model calls: ' + seen.length + ' (was 9)');
});

test('R731 ② a step that asks something different resets the count — nothing is taken from a turn that moves', async () => {
  const other = { text: '', toolCalls: [{ id: 'b', name: 'run_capability', arguments: { id: 'layers.satellites', args: { name: 'HST', place: 'Tokyo' } } }], turnState: 'continuing' };
  const { out, ran } = await turn([same, same, other, { text: 'done', toolCalls: [] }]);
  assert.equal(out.stopped, 'answered');
  assert.equal(ran.length, 2, 'ISS once, HST once');
  assert.equal(out.text, 'done');
});

/* ⚠ (#R740) THIS USED TO PIN THE SPELLING OF THE EXPRESSION, AND THE NEXT CORRECT CHANGE FAILED IT.
   The assertion was a regex over `ai.__atlSay=out.text||((out.results&&out.results.length)?L('Atlas
   ran its tools…`, so #R740 — which inserted `String(out.stopped||'')!=='awaiting_user'&&` to stop the
   sentence appearing above a question Atlas had just asked the reader — was reported as a regression
   while doing exactly what this check exists to protect. #R488's shape: a rule fastened to a spelling
   measures the spelling. So the EXPRESSION IS EVALUATED instead, with the four turns that matter. */
test('R731 ③ the forced final that says nothing leaves the console one honest sentence, in the reader\'s language', () => {
  const con = codeOnly(readLF(join(ROOT, 'js/atlas-console.js')));
  /* the shipped right-hand side of `ai.__atlSay=`, taken to the end of its statement by matching
     brackets — not by a closing spelling (tests/helpers/lift-function.mjs exists for the same reason) */
  const L = (en) => en;   /* the reader's language is `pick()`'s job; here it is the English slot */
  const HEAD = 'ai.__atlSay=';
  const fns = [];
  for (let at = con.indexOf(HEAD); at >= 0; at = con.indexOf(HEAD, at + 1)) {
    let i = at + HEAD.length;
    if (con[i] === '=') continue;   /* `__atlSay==` is a comparison, not the assignment */
    let depth = 0, q = null, end = -1;
    for (; i < con.length; i++) {
      const c = con[i];
      if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
      if (c === '"' || c === "'" || c === '`') { q = c; continue; }
      if ('([{'.indexOf(c) >= 0) depth++;
      else if (')]}'.indexOf(c) >= 0) depth--;
      else if (c === ';' && !depth) { end = i; break; }
    }
    if (end < 0) continue;
    try { fns.push(new Function('out', 'L', 'return (' + con.slice(at + HEAD.length, end) + ');')); } catch (_) { /* not an expression on its own */ }
  }
  assert.ok(fns.length, 'the console assigns the turn\'s sentence somewhere');
  /* exactly one of those assignments is THE answer — the one that hands back what the model wrote */
  const cands = fns.filter((f) => { try { return f({ text: 'x', results: [{}], stopped: 'answered' }, L) === 'x'; } catch (_) { return false; } });
  assert.equal(cands.length, 1, 'exactly one assignment decides the turn\'s sentence');
  const say = cands[0];

  /* ① the model wrote an answer → that answer, untouched */
  assert.equal(say({ text: 'ここが震源です。', results: [{}], stopped: 'answered' }, L), 'ここが震源です。');
  /* ② tools ran, the forced final said nothing → ONE sentence of IntMap's own, saying what happened */
  const forced = say({ text: '', results: [{}, {}], stopped: 'repeated_calls' }, L);
  assert.match(String(forced), /did not write an answer/, 'a turn that ran tools and wrote nothing says so');
  /* ③ nothing ran and nothing was written → nothing is invented */
  assert.equal(say({ text: '', results: [], stopped: 'answered' }, L), '');
  /* ④ (#R740) the turn STOPPED TO ASK THE READER. The question is the turn's text, so the sentence
     above must not appear — measured in production: 「半径を指定してください」 with three options and
     their volumes, under a notice saying Atlas had failed to write an answer. */
  assert.equal(say({ text: '', results: [{}], stopped: 'awaiting_user' }, L), '',
    'a turn that asked the reader a question is not a turn that failed to write one');

  /* (consolidation) the limit is asked of the loop the browser builds, not read off its declaration */
  assert.equal(AGENT.LIMITS.maxRepeatSteps, 2);
});
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  from tests/r741-repeat-and-metric-names-checks.test.mjs
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
/* ══ R741 — #R740's own production verification, on #R740's own fix ═════════════════════════════
 *
 *  #R740 made the refusal enumerate. Deployed, signed in, 2026-09-16:
 *
 *    「世界を平均寿命で色分けして」
 *      mapMetric "life" [failed] ×7 · 8 steps · 40 s · stopped: step_budget · produced: -
 *
 *  The enumeration WAS there — every refusal carried 「有効: pop, density, area, gdp, gdppc, hdi,
 *  dem, milSpend, milSpendGDP, tfr, lifeExp, internet」 and the reader could see it. Two things it
 *  did not do:
 *
 *   ① `life` is a unique part of 「life expectancy」 and resolved to nothing. js/atlas-query.js's
 *      `byDeclaredName` was given the right rule in the SAME round — exact, then a partial match
 *      only if it is unique — and the two resolvers were left disagreeing about what a name is.
 *   ② the identical refused call could be made seven times. #R731 stops a turn that re-makes a call
 *      whose ANSWER it already has; a call whose REFUSAL it already has was explicitly allowed,
 *      because 「a failure is exactly the case where trying again is right」 — true of a different
 *      call, false of the same one with the same arguments.
 *
 *  Both are measured here by EVALUATING the shipped code (#R505).
 * ============================================================================================ */

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const { makeAtlasMetrics } = await import('../js/atlas-metrics.js');
const { makeAtlasAgent } = await import('../js/atlas-agent.js');

/* the metric module, instantiated the way js/atlas-console.js instantiates it */
const MET = makeAtlasMetrics({}, {
  LA: (...a) => a,
  lx: (arr) => (Array.isArray(arr) ? arr[0] : String(arr)),
  L: (en) => en,
  esc: (s) => String(s == null ? '' : s),
  warn: (h) => h,
  R: (ok, html) => ({ ok, html }),
});

test('R741 ① a unique part of a metric\'s name is that metric — "life" reaches lifeExp', () => {
  const got = MET.metSpec('life');
  assert.ok(got && got.key === 'lifeExp',
    `the production loop sent 「life」 seven times; it must resolve, got ${got && got.key}`);
  /* the other side of the same rule: a part shared by two metrics stays unresolved rather than guessed */
  assert.equal(MET.metSpec('p'), null, 'one letter is inside many names — a guess there is worse than the refusal');
  /* …while the whole names still answer, in every language the record declares */
  for (const k of MET.metKeys()) {
    assert.equal(MET.metSpec(k).key, k, `${k} resolves to itself`);
    for (const lbl of MET.metAll()[k].label) assert.equal(MET.metSpec(lbl).key, k, `${k}: ${lbl}`);
  }
  /* 「density」 is inside 「Pop. density」 only, and 「pop」 is inside both — so the first resolves by
     its unique part and the second by being an exact id. Neither may answer the other. */
  assert.equal(MET.metSpec('density').key, 'density');
  assert.equal(MET.metSpec('pop').key, 'pop');
});

test('R741 ② the refusal still names every valid key', () => {
  const r = MET.unknownMetric('wobble');
  assert.equal(r.ok, false);
  for (const k of MET.metKeys()) assert.ok(String(r.html).includes(k), `the refusal names ${k}`);
});

/* ── the turn loop, driven the way tests/r731 drives it, with a capability that always refuses ── */
const AGENT = makeAtlasAgent();
const { makeAtlasToolSurface } = await import('../js/atlas-toolsurface.js');
const { makeAtlasCapabilities } = await import('../js/atlas-capabilities.js');
const { makeAtlasSchemas } = await import('../js/atlas-schemas.js');
const CAPS = makeAtlasCapabilities({});
const SCHEMAS = makeAtlasSchemas();

/* the refusal the production loop actually got: a metric the map does not have, WITH the whole
   valid set in the message — the thing a second identical call cannot improve on */
const REFUSAL = '<div>⚠ Unknown metric: life — valid: pop, density, area, gdp, gdppc, hdi, dem, milSpend, milSpendGDP, tfr, lifeExp, internet</div>';
const callFor = (metric) => ({ text: '', turnState: 'continuing',
  toolCalls: [{ id: 'c', name: 'run_capability', arguments: { id: 'map.choropleth', args: { metric } } }] });

async function turn(script) {
  const ran = [];
  const surface = makeAtlasToolSurface({ capabilities: CAPS, schemas: SCHEMAS,
    runAction: async (action) => { ran.push(action); return { ok: false, html: REFUSAL, meta: { status: 'failed', code: 'failed' } }; } });
  const tools = surface.baseTools();
  let i = 0;
  const model = async () => { const r = script[Math.min(i, script.length - 1)]; i++; return r; };
  const out = await AGENT.runTurn({ model, tools, execute: surface.makeExecute(tools, AGENT), system: 'sys',
    messages: [{ role: 'user', content: '世界を平均寿命で色分けして' }] });
  return { out, ran };
}

test('R741 ③ a step made only of calls that were already refused counts as a repeat', async () => {
  const same = callFor('life');
  const { out, ran } = await turn([same, same, same, same, same, same, same, same, { text: 'done', toolCalls: [] }]);
  assert.equal(out.stopped, 'repeated_calls',
    `seven identical refusals is what production did; the turn must stop instead, got ${out.stopped}`);
  assert.ok(ran.length <= 3, `the call still RUNS (nothing is taken) but the turn stops early — ${ran.length} runs`);
  /* and Atlas is TOLD it is repeating itself, rather than the repeat being silently absorbed */
  const noted = (out.results || []).filter((r) => r && r.repeatedFailedCallThisTurn);
  assert.ok(noted.length >= 1, 'the repeat is named on the result Atlas reads');
  assert.match(String(noted[0].note || ''), /ALREADY made this exact call/);
});

test('R741 ④ a call that asks something DIFFERENT is never counted — nothing is taken from Atlas', async () => {
  const { out, ran } = await turn([callFor('life'), callFor('lifespan'), callFor('longevity'),
    callFor('life expectancy'), { text: 'done', toolCalls: [] }]);
  assert.notEqual(out.stopped, 'repeated_calls',
    'changing the arguments is progress, even when every attempt is refused');
  assert.ok(ran.length >= 4, `every distinct call still runs — ${ran.length}`);
});

test('R741 ⑤ the first refusal is not a repeat', async () => {
  const src = readFileSync(join(ROOT, 'js/atlas-agent.js'), 'utf8');
  assert.match(src, /failedCalls/, 'the turn remembers which calls were refused');
  const same = callFor('life');
  const { out } = await turn([same, same, same, same, { text: 'done', toolCalls: [] }]);
  const first = (out.results || [])[0];
  assert.ok(first && !first.repeatedFailedCallThisTurn, 'the first attempt is a real attempt');
});
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  from tests/r760-atlas-verdict-checks.test.mjs
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
/* ============================================================================
 *  #R760 — a redraw of what is already on the map is not a failure, and a call
 *  that keeps answering the same way is not progress
 * ----------------------------------------------------------------------------
 *  Measured on production 2026-09-16 (build R758, signed in, 56 questions):
 *
 *    「Colour every country by population density and give me the legend.」
 *        map.choropleth ok → not_rendered → not_rendered → not_rendered, 50 s,
 *        and the reader was told «the answer above may be incomplete» about a
 *        turn whose FIRST call had painted every country and printed the legend.
 *
 *    「Measure the great-circle distance from Reykjavik to Cape Town and draw
 *      the line.」
 *        map.drawLine ×5 (two not_rendered), 430 s, working limit — and the
 *        distance the reader asked for never reached the prose at all.
 *
 *  Two independent defects meet in those turns:
 *
 *  (1) The painter did not say what it had painted. `paint.verify` can already
 *      call an identical redraw `already_there` (#R742) but only against a
 *      declaration, and neither `drawChoro` nor `drawLine` made one — while
 *      #R747 made the line redraw IDEMPOTENT, which guarantees the count cannot
 *      move. `_hlLines` entries had no identity at all when unlabelled, because
 *      identity was read off the caption; a line's identity is its course.
 *
 *  (2) The agent's repeat guard knew two of the three statuses. #R731 named the
 *      repeat of an ANSWERED call, #R741 the repeat of a REFUSED one; a call
 *      that comes back `partial` with the same code was named by neither, so
 *      such a turn ran to its working limit every time.
 * ==========================================================================*/

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const { makeAtlasAgent } = await import('../js/atlas-agent.js');
const { makeAtlasToolSurface } = await import('../js/atlas-toolsurface.js');
const { makeAtlasCapabilities } = await import('../js/atlas-capabilities.js');
const { makeAtlasSchemas } = await import('../js/atlas-schemas.js');
const { makeEraHighlight } = await import('../js/atlas-era-highlight.js');

const AGENT = makeAtlasAgent();
const CAPS = makeAtlasCapabilities({});
const SCHEMAS = makeAtlasSchemas();

const COURSE = '-21.94000,64.14000 18.42000,-33.92000';

/* every surface must be supplied, or the reading is `null` — «unreadable is not zero» */
function suppliers(over) {
  return Object.assign({ countries: () => new Set(), era: () => [], polys: () => [],
    lines: () => [], choro: () => ({}), metric: () => '' }, over || {});
}

/* ── ① a shape with no caption still has an identity, and it is its course ──
   The nameless used to be dropped (js/atlas-era-highlight.js `identities`), so an
   unlabelled line declared nothing and could never be found on the map again. */
test('R760 ① an unlabelled line is identified by its course, not dropped as nameless', () => {
  const ERA = makeEraHighlight({});
  const line = { geo: { type: 'LineString', coordinates: [[-21.94, 64.14], [18.42, -33.92]] }, key: COURSE, name: '' };
  const ids = ERA.paintState(suppliers({ lines: () => [line] })).now().ids;
  assert.deepEqual(ids.lines, [COURSE], 'the course is the identity when there is no caption');
  /* a caption, when there is one, still wins — a reader who named it gets the name back */
  const named = ERA.paintState(suppliers({ lines: () => [Object.assign({}, line, { name: 'Reykjavik to Cape Town' })] }));
  assert.deepEqual(named.now().ids.lines, ['Reykjavik to Cape Town']);
});

test('R760 ② redrawing the same course states the same identity (a redraw is not a change)', () => {
  const ERA = makeEraHighlight({});
  const first = ERA.paintState(suppliers({ lines: () => [{ key: COURSE, name: '' }] })).now().ids.lines;
  /* #R747's `_lnSame` restyles the existing entry rather than pushing a second one; a
     different colour and width must not read as a different line. */
  const second = ERA.paintState(suppliers({ lines: () => [{ key: COURSE, name: '', color: '#f00', w: 8 }] })).now().ids.lines;
  assert.deepEqual(second, first, 'a restyled redraw of the same course is the same line');
});

/* ── ② the verdict: nothing moved, but what was asked for is on the map ── */
function verdict(raw, after) {
  return CAPS.OBSERVERS.paint.verify({}, {}, JSON.parse(JSON.stringify(after)), after, raw);
}
function surfaceState(ids) {
  return { poly: 0, line: 0, pins: 0, poi: 0, compose: 0, shakemap: 0, factions: 0,
    visible: 3, objects: 0, atlas: { ids: ids } };
}

test('R760 ③ an identical repaint of a declared surface is `already_there`, never `not_rendered`', () => {
  const v = verdict({ ok: true, html: '<div>line</div>', meta: { painted: { lines: [COURSE] } } },
    surfaceState({ lines: [COURSE] }));
  assert.equal(v.status, 'completed', 'a state the reader asked for, held, is completed');
  assert.equal(v.code, 'already_there');
});

test('R760 ④ a choropleth repaint of the same countries is `already_there`', () => {
  const codes = ['JPN', 'USA', 'DEU'];
  const v = verdict({ ok: true, html: '<div>legend</div>', meta: { painted: { choro: codes.slice() } } },
    surfaceState({ choro: codes.slice() }));
  assert.equal(v.code, 'already_there');
});

test('R760 ⑤ a declaration the map does NOT hold is still not_rendered', () => {
  /* the verdict is not weakened: this is what makes ③ and ④ a reading rather than a promise */
  const v = verdict({ ok: true, html: '', meta: { painted: { choro: ['JPN'] } } },
    surfaceState({ choro: [] }));
  assert.equal(v.status, 'partial');
  assert.equal(v.code, 'not_rendered');
});

/* ── ③ the painters declare. Read at the source, because the goal is that the
   DECLARATION exists beside the write — a live dispatch needs a map. ── */
test('R760 ⑥ the painters that hold a named surface declare what they painted', () => {
  const src = readLF(join(ROOT, 'js', 'atlas-console.js'));
  assert.ok(src.includes('meta:{painted:{choro:Object.keys(_choroState)}}'),
    'drawChoro states the countries it shaded');
  /* ⚠ (#732) the declaration is a MEMBER of `meta`, and `meta` may say more than one thing — #732 added
     `resultKey` beside it and the old spelling (`…]}}`, i.e. «painted is the last member») failed a change
     that kept the declaration intact. The fact is that the painter declares; that is what is read. */
  assert.match(src, /meta:\{painted:\{lines:\[_lnObj\.name\|\|_lnObj\.key\]\}[,}]/,
    'drawLine states the course it drew');
  assert.match(src, /meta:\{painted:\{polys:\[_pgObj\.name\|\|_pgObj\.key\]\}[,}]/,
    'drawPolygon states the ring it drew');
  /* and the course is put ON the object, or the declaration names something the reading cannot find */
  assert.ok(src.includes('_lnSame.key=_lnKey'), 'a restyled line keeps its course as its identity');
  assert.ok(src.includes('key:_lnKey'), 'a new line carries its course');
  assert.ok(src.includes('const _pgKey='), 'a polygon carries its ring');
  /* and the removers declare what is now EMPTY, which is the same contract pointed the other way
     (#R747). `reset` had it; `clearAll` did not, and clearing an already-clear map was
     `not_rendered` — measured on production 2026-09-16 in 「Actually, go back to the previous view」. */
  /* ⚠⚠⚠ (#R802) THE DEFECT THIS LINE IS ABOUT IS 「a remover did not declare what it removed」, and the
     line used to hold the SPELLING of one argument list. Measured this round: adding the `poi` surface
     turned it red although `clearAll` had been made MORE truthful, and the next surface would do the
     same — [[intmap-restate-the-defect-not-the-fix]]. So the expectation is DERIVED: the supplier
     bundle at `_ERA.paintState({...})` says which surface each painted variable answers for, the
     clearer of that variable is the function that assigns it an empty value, and every such clearer
     the `clearAll` case actually calls must have its surface named in the declaration. A surface added
     tomorrow is covered by existing; one removed stops being demanded. */
  const bundle = /_ERA\.paintState\(\{([\s\S]{0,600}?)\}\)/.exec(src);
  assert.ok(bundle, 'the supplier bundle is where the surfaces are named');
  const surfaceVar = {};
  for (const m of bundle[1].matchAll(/([A-Za-z0-9_]+)\s*:\s*\(\)\s*=>\s*(_[A-Za-z0-9_]+)/g)) surfaceVar[m[1]] = m[2];
  assert.ok(Object.keys(surfaceVar).length >= 5, 'the bundle names the painted surfaces');
  const clearerOf = {};
  for (const [surface, v] of Object.entries(surfaceVar)) {
    /* ⚠ String.raw, NOT a quoted string: in a plain JS string '\s' is the letter s, so the pattern
       would have matched nothing, `clearerOf` would have stayed empty, and the loop below would have
       asserted nothing while reporting green. CodeQL caught exactly that on the first push. */
    const fn = new RegExp(String.raw`function\s+([A-Za-z0-9_]+)\s*\([^)]*\)\s*\{[^\n]*?` + v + String.raw`\s*=\s*(?:\[\]|\{\}|new Set\(\))`).exec(src);
    if (fn) clearerOf[surface] = fn[1];
  }
  const caseLine = src.split('\n').find((l) => l.indexOf("case 'clearAll':") >= 0) || '';
  assert.ok(caseLine, 'the clearAll case is one line');
  const declared = /_CLEARED\(([^)]*)\)/.exec(caseLine);
  assert.ok(declared, 'map.clearAll declares the surfaces it empties');
  const named = declared[1].split(',').map((s2) => s2.trim().replace(/^'|'$/g, ''));
  for (const [surface, fn] of Object.entries(clearerOf)) {
    if (caseLine.indexOf(fn + '()') < 0) continue;              /* this case does not empty that surface */
    assert.ok(named.indexOf(surface) >= 0,
      'map.clearAll calls ' + fn + '() and must declare the «' + surface + '» surface empty');
  }
  assert.ok(src.includes("_CLEARED('outline')"), 'clearing the outline says the outline is now empty');
});

test('R760 ⓰ an emptied surface a remover declared is verified as empty, not as nothing happening', () => {
  const v = verdict({ ok: true, html: '', meta: { painted: { choro: [], lines: [], outline: [] } } },
    surfaceState({ choro: [], lines: [], outline: [] }));
  assert.equal(v.status, 'completed');
  assert.equal(v.code, 'already_there', 'a clear of a clean map is the state the reader asked for');
});

test('R760 ⓪ the place outline is a surface that can be declared and read back', () => {
  const ERA = makeEraHighlight({});
  const ids = ERA.paintState(suppliers({ outline: () => 'Amazon Basin' })).now().ids;
  assert.deepEqual(ids.outline, ['Amazon Basin'], 'what IntMapOutline holds is readable as a painted surface');
  assert.deepEqual(ERA.paintState(suppliers({ outline: () => null })).now().ids.outline, [],
    'nothing outlined is an EMPTY surface, not a missing one — a clear can be verified against it');
  /* and outlining the same place twice, which moves no count anywhere, is the state the reader asked for */
  const v = verdict({ ok: true, html: '', meta: { painted: { outline: ['Amazon Basin'] } } },
    surfaceState({ outline: ['Amazon Basin'] }));
  assert.equal(v.code, 'already_there');
});

test('R760 ⓫ a remark from the answer audit is not a report that nothing happened', async () => {
  /* `unverified` is #R142's flag for a map that never changed, and score()/_visFailed/fromLegacy all
     read it as failure. The audit note says of itself that it is NOT a verdict, so it must not ride it. */
  const { makeAtlasAnswerPipeline } = await import('../js/atlas-answer-pipeline.js');
  const PL = makeAtlasAnswerPipeline();
  const meta = PL.auditMeta({ audit: { errors: [{ code: 'evidence.primary_unsupported' }] } });
  assert.deepEqual(meta.auditFindings, ['evidence.primary_unsupported']);
  assert.match(String(meta.auditNote), /rendered in full/, 'Atlas is still told what the audit noticed');
  assert.equal(meta.unverified, undefined, 'and it is not told that the answer did not happen');
  const { makeAtlasTurnResults } = await import('../js/atlas-turn-results.js');
  const TRES = makeAtlasTurnResults();
  const audited = { ok: true, act: { type: 'analyze', question: 'q' }, meta: meta };
  const silent = { ok: true, act: { type: 'analyze', question: 'q' }, meta: {} };
  assert.equal(TRES.score(audited), TRES.score(silent),
    'an answer the audit remarked on no longer ranks below one it had nothing to say about');
});

test('R760 ⓱ a simulator whose deliverable is a window says so, and is not called not_rendered', () => {
  /* `sim` observes paintNow(), which counts map sources and knows nothing about windows. Measured on
     production 2026-09-16, 「Fly me through the Grand Canyon in the flight simulator」: seven
     `not_rendered` verdicts in 87 s while the chooser was on screen. */
  const still = surfaceState({});
  const v = CAPS.OBSERVERS.sim.verify({}, {}, JSON.parse(JSON.stringify(still)), still,
    { ok: true, html: '<div>pick your aircraft</div>', meta: { opened: 'flightSim' } });
  assert.equal(v.status, 'completed');
  assert.equal(v.observed.opened, 'flightSim', 'what it opened rides the verdict, so Atlas can name it');
  /* and a simulator that declares nothing, with nothing on the map, is still not_rendered */
  const v2 = CAPS.OBSERVERS.sim.verify({}, {}, JSON.parse(JSON.stringify(still)), still, { ok: true, html: '' });
  assert.equal(v2.code, 'not_rendered', 'the verdict is not weakened for anything that stays silent');
});

test('R760 ⓲ the flight simulator declares the window it opened', () => {
  /* read, not run: the opener is a case of the Atlas kernel's dispatch, which only a browser can build
     (the verdict half is run in ⓱). */
  const src = readLF(join(ROOT, 'js', 'atlas-console.js'));
  assert.ok(src.includes("ok?{meta:{opened:'flightSim'}}:null"), 'the opener states what it opened');
});

/* ── ④ the agent stops a partial treadmill ── */
function drawCall() {
  return { text: 'drawing.', turnState: 'continuing',
    toolCalls: [{ id: 'a', name: 'run_capability',
      arguments: { id: 'map.drawLine', args: { points: [[-21.94, 64.14], [18.42, -33.92]] } } }] };
}

test('R760 ⑦ a call that keeps coming back partial with the same code stops the turn', async () => {
  const ran = [];
  const surface = makeAtlasToolSurface({ capabilities: CAPS, schemas: SCHEMAS, runAction: async () => ({ ok: true }) });
  const tools = surface.baseTools();
  const execute = async (call) => { ran.push(call); return { ok: true, status: 'partial', code: 'not_rendered', html: '<div>line</div>' }; };
  const out = await AGENT.runTurn({ model: async () => drawCall(), tools,
    execute: execute, system: 'sys',
    messages: [{ role: 'user', content: 'draw the line' }] });
  assert.equal(out.stopped, 'repeated_calls',
    'the turn names the treadmill instead of running to its working limit');
  assert.ok(ran.length <= 4, 'the same unchanged call is not made five times — ran ' + ran.length);
  const marked = (out.results || []).filter((r) => r && r.repeatedPartialCallThisTurn);
  assert.ok(marked.length >= 1, 'the repeat is NAMED in the result Atlas reads, not silently counted');
  assert.match(String(marked[0].note || ''), /same verdict/,
    'and the note says what is actually true of it');
});

test('R760 ⑧ a partial that comes back with a DIFFERENT code is progress and is not counted', async () => {
  /* nothing is taken (CONSTITUTION.md §5): a call that is getting somewhere keeps its steps */
  let n = 0;
  const surface = makeAtlasToolSurface({ capabilities: CAPS, schemas: SCHEMAS, runAction: async () => ({ ok: true }) });
  const tools = surface.baseTools();
  const execute = async () => { n++; return { ok: true, status: 'partial', code: 'code-' + n, html: '<div>x</div>' }; };
  const out = await AGENT.runTurn({ model: async () => drawCall(), tools,
    execute: execute, system: 'sys',
    messages: [{ role: 'user', content: 'draw' }] });
  assert.notEqual(out.stopped, 'repeated_calls', 'a changing verdict is progress');
  assert.ok(n > 4, 'and the turn was allowed to keep working — ran ' + n);
});

test('R760 ⓬ the tool result says WHY it was partial, not only that it was', async () => {
  /* `error` carried `meta.code` for failures and nothing carried it otherwise, so a partial
     reached Atlas as the bare word «partial» — `not_rendered` and `already_there` looked alike. */
  const surface = makeAtlasToolSurface({ capabilities: CAPS, schemas: SCHEMAS,
    runAction: async () => ({ ok: true, html: '<div>x</div>',
      meta: { status: 'partial', code: 'partially_resolved', produced: ['map'] } }) });
  const tools = surface.baseTools();
  const out = await surface.makeExecute(tools, AGENT)({ name: 'run_capability',
    arguments: { id: 'map.highlight', args: { countries: ['JPN'] } } });
  assert.equal(out.status, 'partial');
  assert.equal(out.code, 'partially_resolved', 'the verdict already knew the word; the result must say it');
});

test('R760 ⓭ a refusal the capability calls permanent is refused for its KIND, not its wording', async () => {
  /* five differently-worded names for a metric IntMap does not hold read as five different
     requests, because the repeat ledger keys on the exact arguments. */
  const asked = [];
  const names = ['CO2 emissions per capita', 'co2_per_capita', 'carbon per person', 'CO2 intensity', 'emissions/cap'];
  let i = 0;
  const surface = makeAtlasToolSurface({ capabilities: CAPS, schemas: SCHEMAS, runAction: async () => ({ ok: true }) });
  const tools = surface.baseTools();
  const execute = async (call) => { asked.push(call); return { ok: false, error: 'unknown_metric', permanentFailure: true }; };
  const model = async () => ({ text: 'trying.', turnState: 'continuing',
    toolCalls: [{ id: 'a', name: 'run_capability',
      arguments: { id: 'data.ratio', args: { metricA: names[Math.min(i++, names.length - 1)], metricB: 'pop' } } }] });
  const out = await AGENT.runTurn({ model, tools, execute, system: 'sys',
    messages: [{ role: 'user', content: 'CO2 per capita choropleth' }] });
  assert.equal(out.stopped, 'repeated_calls', 'the turn stops instead of rewording an impossible request');
  assert.ok(asked.length <= 4, 'it is not asked five times — asked ' + asked.length);
  const marked = (out.results || []).filter((r) => r && r.repeatedFailedCallThisTurn);
  assert.ok(marked.length >= 1);
  assert.match(String(marked[0].note || ''), /not about how the request was worded/);
});

test('R760 ⓮ a capability that declares nothing keeps every one of its attempts', async () => {
  /* nothing is taken (CONSTITUTION.md §5): the class rule applies only where a capability opted in. */
  let n = 0;
  const surface = makeAtlasToolSurface({ capabilities: CAPS, schemas: SCHEMAS, runAction: async () => ({ ok: true }) });
  const tools = surface.baseTools();
  const execute = async () => { n++; return { ok: false, error: 'geocode_failed' }; };
  const model = async () => ({ text: 'trying.', turnState: 'continuing',
    toolCalls: [{ id: 'a', name: 'run_capability',
      arguments: { id: 'view.flyTo', args: { place: 'place-' + n } } }] });
  const out = await AGENT.runTurn({ model, tools, execute, system: 'sys',
    messages: [{ role: 'user', content: 'fly somewhere' }] });
  assert.notEqual(out.stopped, 'repeated_calls', 'an undeclared refusal is still worth another try');
  assert.ok(n > 4, 'and the turn kept working — ran ' + n);
});

test('R760 ⓯ the metric refusal declares itself permanent and still names the whole valid set', async () => {
  const { makeAtlasMetrics } = await import('../js/atlas-metrics.js');
  const M = makeAtlasMetrics({}, { LA: () => 'en', lx: (v) => v, L: (en) => en,
    esc: (s) => String(s), warn: (s) => String(s), R: (ok, html, extra) => Object.assign({ ok: ok, html: html }, extra || null) });
  const r = M.unknownMetric('CO2 emissions per capita');
  assert.equal(r.ok, false);
  assert.equal(r.meta.permanent, true, 'the comment above it has said since #R740 that this refusal cannot be retried');
  assert.equal(r.meta.code, 'unknown_metric');
  M.metKeys().forEach((k) => assert.ok(String(r.html).includes(k), 'the valid set is still named in full: ' + k));
});

/* ── ⑥ the turn ledger is closed ── */
test('R760 ⑨ every turn boundary closes the ledger entry it opened', () => {
  /* read, not run: the turn boundaries are the kernel's run() paths (success, error, two cancellations),
     which only a browser can drive; endTurn itself is run in ⑩. */
  const src = readLF(join(ROOT, 'js', 'atlas-console.js'));
  const calls = (src.match(/ASTATE\.endTurn\(turn,/g) || []).length;
  assert.ok(calls >= 4, 'success, error, and both cancellation paths close the turn — found ' + calls);
  assert.ok(src.includes("ASTATE.endTurn(turn,{status:'cancelled'})"), 'a superseded turn says so');
  assert.ok(src.includes("ASTATE.endTurn(turn,{status:'error'"), 'a thrown turn says so');
});

test('R760 ⑩ endTurn actually writes what it is handed', async () => {
  const { makeAtlasState } = await import('../js/atlas-state.js');
  const S = makeAtlasState({});
  S.beginTurn(1, 'q');
  assert.equal(S.lastTurn().status, 'running', 'the entry starts open');
  assert.equal(S.lastTurn().reply, '');
  S.endTurn(1, { reply: 'the answer', status: 'answered', aiCalls: 3 });
  assert.equal(S.lastTurn().status, 'answered');
  assert.equal(S.lastTurn().reply, 'the answer');
  assert.equal(S.lastTurn().aiCalls, 3);
});
}
