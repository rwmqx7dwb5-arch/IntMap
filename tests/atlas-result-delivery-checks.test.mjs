/* ============================================================================
 *  (atlas-result-delivery) WHAT A CALL RETURNED REACHES THE MODEL, AND «ALREADY DONE» IS TRUE
 * ----------------------------------------------------------------------------
 *  Every check RUNS the shipped code: the real loop (js/atlas-agent.js) over the real tool
 *  surface and registry, a scripted model, and a fake `runAction` standing in for the page.
 *  Nothing here matches on the user's words.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const { makeAtlasAgent } = await import('../js/atlas-agent.js');
const { makeAtlasToolSurface } = await import('../js/atlas-toolsurface.js');
const { makeAtlasCapabilities } = await import('../js/atlas-capabilities.js');
const { makeAtlasSchemas } = await import('../js/atlas-schemas.js');
const AGENT = makeAtlasAgent();
const CAPS = makeAtlasCapabilities({});
const SCHEMAS = makeAtlasSchemas();

/* one turn: `steps` are the model's replies; `reply(action)` is what the page answers */
async function run(steps, reply, opts = {}) {
  const ran = [];
  const surface = makeAtlasToolSurface({ capabilities: CAPS, schemas: SCHEMAS, runAction: async (a) => { ran.push(a); return reply(a, ran.length); } });
  const tools = surface.baseTools();
  let i = 0;
  const seen = [];
  const model = async (req) => { seen.push(req); const r = steps[Math.min(i, steps.length - 1)]; i++; return typeof r === 'function' ? r(req) : r; };
  const out = await AGENT.runTurn({
    model, tools, execute: surface.makeExecute(tools, AGENT),
    footprint: (c) => surface.footprintOf(c, tools), identify: opts.noIdentify ? undefined : (c) => surface.identityOf(c, tools),
    system: 's', messages: [{ role: 'user', content: 'x' }],
  });
  return { out, ran, seen, tools };
}
const call = (id, name, args) => ({ id, name, arguments: args });
const step = (...calls) => ({ text: '', toolCalls: calls });
const done = { text: 'done', toolCalls: [] };
const okRes = (extra) => ({ ok: true, html: '<div>ok</div>', meta: Object.assign({ status: 'completed', produced: ['map'] }, extra || {}) });

test('① A→B→A runs the third call: a write in between ends «already done»', async () => {
  const { ran } = await run([
    step(call('1', 'map_view', { place: 'Osaka' })),
    step(call('2', 'map_view', { place: 'Tokyo' })),
    step(call('3', 'map_view', { place: 'Osaka' })),
    done,
  ], () => okRes());
  assert.deepEqual(ran.map((a) => a.place), ['Osaka', 'Tokyo', 'Osaka'], 'the third call reached the app');
});

test('① the identical call with nothing written in between is still answered from the first', async () => {
  const { ran, out } = await run([
    step(call('1', 'map_view', { place: 'Osaka' })),
    step(call('2', 'map_view', { place: 'Osaka' })),
    done,
  ], () => okRes());
  assert.equal(ran.length, 1);
  assert.equal(out.trace.reused, 1);
});

test('① a layer toggled on, off, on, and a time travelled 1500, 1900, 1500, run every time', async () => {
  const { ran } = await run([
    step(call('1', 'set_layer', { name: 'quakes', on: true })),
    step(call('2', 'set_layer', { name: 'quakes', on: false })),
    step(call('3', 'set_layer', { name: 'quakes', on: true })),
    step(call('4', 'set_time', { year: 1500 })),
    step(call('5', 'set_time', { year: 1900 })),
    step(call('6', 'set_time', { year: 1500 })),
    done,
  ], () => okRes());
  assert.equal(ran.length, 6);
});

test('⑦ compose_map and run_capability{map.compose} are one call', async () => {
  const items = [{ name: 'Strait of Hormuz', country: 'Iran' }];
  const { ran } = await run([
    step(call('1', 'compose_map', { items })),
    step(call('2', 'run_capability', { id: 'map.compose', args: { items } })),
    done,
  ], () => okRes());
  assert.equal(ran.length, 1, 'the second spelling was answered from the first');
});

test('⑦ an alias and the canonical id are one call', async () => {
  const alias = CAPS.resolve('view.flyTo').legacy;
  assert.ok(alias && CAPS.resolve(alias).id === 'view.flyTo');
  const { ran } = await run([
    step(call('1', 'run_capability', { id: 'view.flyTo', args: { place: 'Kyoto' } })),
    step(call('2', 'run_capability', { id: alias, args: { place: 'Kyoto' } })),
    done,
  ], () => okRes());
  assert.equal(ran.length, 1);
});

test('⑥ a partial map result (ok:false, as toLegacy makes it) is not bounced as map_not_drawn', async () => {
  const { out, seen } = await run([
    step(call('1', 'compose_map', { items: [{ name: 'A' }, { name: 'B' }] })),
    { text: 'five of sixteen', toolCalls: [], answerMode: 'map' },
  ], () => ({ ok: false, html: '<div>5/16</div>', meta: { status: 'partial', produced: ['map'], unverified: true } }));
  assert.equal(out.trace.outputGate, 0, 'the markers that are on the map count');
  assert.equal(out.mapDrawn, true);
  assert.equal(seen.length, 2);
});

test('⑥ a failure that produced nothing is still bounced', async () => {
  const { out } = await run([
    step(call('1', 'compose_map', { items: [{ name: 'A' }] })),
    { text: 'x', toolCalls: [], answerMode: 'map' },
  ], () => ({ ok: false, html: '', meta: { status: 'failed', code: 'failed' } }));
  assert.ok(out.trace.outputGate >= 1);
});

test('⑧ an unobserved map call is not sent back to be drawn again, and the note does not say «never»', async () => {
  const { out, ran, seen } = await run([
    step(call('1', 'compose_map', { items: [{ name: 'A' }] })),
    step(call('2', 'compose_map', { items: [{ name: 'A' }] })),
    { text: 'drawn, unconfirmed', toolCalls: [], answerMode: 'map' },
  ], () => ({ ok: false, html: '<div>x</div>', meta: { status: 'unobserved', code: 'not_rendering', produced: [] } }));
  assert.equal(out.trace.outputGate, 0);
  assert.equal(ran.length, 1);
  const text = JSON.stringify(seen[seen.length - 1]);
  assert.match(text, /observes again|in front/);
  assert.doesNotMatch(text, /cannot be observed any better/);
});

test('② a long card reaches the model whole and read_result reaches its end', async () => {
  const tail = 'LAST-ROW-MARKER';
  const html = '<div>' + 'row '.repeat(3000) + tail + '</div>';
  const { seen } = await run([step(call('1', 'map_view', { place: 'Osaka' })), done], () => ({ ok: true, html, meta: { status: 'completed' } }));
  const input = JSON.stringify(seen[1]);
  assert.ok(input.includes(tail), 'the model was handed the end of the card, not a clipped copy');
});

test('③ a source URL, an alt and a title are in the text the model reads', async () => {
  const html = '<div>Source: <a href="https://example.org/data?a=1&amp;b=2">Eurostat</a><img src="x.png" alt="GDP chart"><span title="as of 2024">GDP</span><button data-id="42" data-payload=\'{"a":1}\'>go</button><script>evil()</script></div>';
  const { out } = await run([step(call('1', 'map_view', { place: 'Osaka' })), done], () => ({ ok: true, html, meta: { status: 'completed' } }));
  const surface = makeAtlasToolSurface({ capabilities: CAPS, schemas: SCHEMAS, runAction: async () => ({ ok: true, html, meta: { status: 'completed' } }) });
  const tools = surface.baseTools();
  const r = await surface.makeExecute(tools, AGENT)({ name: 'map_view', arguments: { place: 'Osaka' } });
  assert.match(r.text, /\[href: https:\/\/example\.org\/data\?a=1&b=2\]/);
  assert.match(r.text, /\[alt: GDP chart\]/);
  assert.match(r.text, /\[title: as of 2024\]/);
  assert.match(r.text, /\[data-id: 42\]/);
  assert.doesNotMatch(r.text, /payload|evil/, 'a script payload and a JSON data attribute are not content');
  assert.ok(out);
});

test('④ ⑤ structured meta, objectIds and unresolved reach the model without a name list', async () => {
  const surface = makeAtlasToolSurface({ capabilities: CAPS, schemas: SCHEMAS, runAction: async () => ({
    ok: true, html: '<div>t</div>', objectIds: ['obj-1', 'obj-2'], meta: { status: 'completed', unresolved: ['Atlantis'], gis: { op: 'table', count: 3 }, someFutureField: { n: 1 }, fn() {} } }) });
  const tools = surface.baseTools();
  const r = await surface.makeExecute(tools, AGENT)({ name: 'map_view', arguments: { place: 'Osaka' } });
  assert.deepEqual(r.objectIds, ['obj-1', 'obj-2']);
  assert.deepEqual(r.unresolved, ['Atlantis']);
  assert.deepEqual(r.details.gis, { op: 'table', count: 3 });
  assert.deepEqual(r.details.someFutureField, { n: 1 });
  assert.equal('fn' in r.details, false);
  assert.equal('status' in r.details, false, 'what mechanical already states is not said twice');
});

/* ══ what the READER is shown under an answer (atlas-result-delivery, from a production answer read in full) ═══════ */
const { makeAtlasAnswerSources } = await import('../js/atlas-answer-sources.js');
const { importModule } = await import('./helpers/import-module.mjs');

test('⑨ a source mark never splits a number from its unit: 全40か国, 11月11日, 1,463,865,525人, 40位', () => {
  const core = makeAtlasAnswerSources({ lang: () => 'jp', esc: (s) => String(s) });
  const items = core.collect([{ ok: true, meta: { provenance: [{ kind: 'number', what: ['Population', '人口'], source: 'World Bank', values: [40, 11, 1463865525, 38980376] }] } }], {});
  const out = core.linkNumbers('<p>表の1位から40位まで、全40か国の表は2026年11月11日更新で、1位はインドです。人口は1,463,865,525人です。</p>', items, 't');
  assert.doesNotMatch(out, /\d<sup/, 'no mark directly after a digit');
  assert.doesNotMatch(out, /40<sup[^>]*>.*?<\/sup>(位|か国)/, 'the unit stays with its number');
  const marks = out.match(/data-atl-srcn="1"/g) || [];
  assert.ok(marks.length >= 1 && marks.length <= 4, 'one mark per phrase, not one per digit: ' + marks.length);
  assert.doesNotMatch(out, /11月11日更新で<sup/, 'the publication date is not a population measurement');
  assert.match(out, /1,463,865,525人です<sup/, 'the measurement carries its source');
});

test('⑩ the table list says a note that several tables share once', async () => {
  const pick = () => { const f = (...a) => a[0]; f.arr = (a) => (Array.isArray(a) ? a[0] : String(a)); return f; };
  const { atlasQuery } = await importModule('js/atlas-query.js', {
    globals: { window: { IntMapGazetteer: { warm: async () => [], worldMeta: () => ({ count: 0, placeKinds: null }) } }, document: { baseURI: 'http://localhost/' } },
    mocks: { 'js/lang-registry.js': { IntMapLang: { pick, pickArgs: () => ((...a) => a) } } },
  });
  const API = atlasQuery({ lang: 'en', addPin: () => null });
  API.bind({ countryStats: () => ({}), countryName: (s) => s.nameEn });
  const out = await API.answer({ list: true }, { pin: false });
  assert.ok(out.ok && out.html);
  const notes = [...out.html.matchAll(/<span style="color:var\(--text-muted\);font-size:10\.5px;">([^<]*)<\/span>/g)].map((m) => m[1]).flatMap((x) => x.split(' · '));
  /* the attribution line (it ends in the file) is per table; the gap and completeness notes are per FILE */
  const dup = notes.filter((n, i) => n.length > 40 && !/\(data\/[^)]*\)$/.test(n) && notes.indexOf(n) !== i);
  assert.deepEqual(dup, [], 'no note appears twice in one list');
  assert.ok(out.result && Array.isArray(out.result.tables) && out.result.tables.every((t) => !('_notes' in t)), 'the structured list carries no card scratch');
});

test('⑪ a result that declares itself working material is filed under the results fold, in the console', async () => {
  /* read, not run: the console builds the reply inside a closure over the page (js/atlas-console.js), so the one place that reads the fact is matched */
  const { readFileSync } = await import('node:fs');
  const con = readFileSync(new URL('../js/atlas-console.js', import.meta.url), 'utf8');
  assert.match(con, /r\.meta&&r\.meta\.working===true\) return true/);
  for (const f of ['../js/atlas-cap-compute.js', '../js/atlas-cap-data.js']) {
    assert.match(readFileSync(new URL(f, import.meta.url), 'utf8'), /working\s*[:=]\s*true|\{working:true\}/, f + ' declares it');
  }
});

test('⑫ a row with no `name` is named by the first text it carries, not by «<title> 1», «<title> 2»', async () => {
  const { readFileSync } = await import('node:fs');
  const { codeOnly } = await import('../scripts/code-only.mjs');
  const { liftFunction } = await import('./helpers/lift-function.mjs');
  const src = codeOnly(readFileSync(new URL('../js/atlas-query.js', import.meta.url), 'utf8'));
  /* the shipped function, evaluated; what it reads from the module (the geometry measure, the table registry) is stood in for */
  const userRows = new Function('geomMeasure', 'TABLES', 'return (' + liftFunction(src, 'userRows') + ')')(() => null, {});
  const ds = { id: 'ds1', title: 'World Bank population · top40', provenance: {}, features: () => [
    { properties: { '順位': 1, '国名': 'インド', '人口（人）': 1463865525 } }, { properties: { '順位': 2, '国名': '中国', '人口（人）': 1406585000 } },
    { properties: { v: 3 } }, { properties: { name: 'Osaka', '国名': 'x' } }] };
  const out = userRows(ds);
  const rows = out.rows || out;
  assert.deepEqual(rows.map((r) => r.name), ['インド', '中国', 'World Bank population · top40 3', 'Osaka']);
});
