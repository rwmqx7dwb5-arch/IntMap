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
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
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
