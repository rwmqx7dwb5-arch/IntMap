/* ============================================================================
 *  atlas-table-to-countries — a table read from a source reaches the map in ONE highlight call (node --test)
 * ----------------------------------------------------------------------------
 *  Measured on production 2026-11-21 (GPT 6.2 Sol, 「2026年W杯の最終順位をもとに48か国を結果別に色分け」): the
 *  turn ended `step_budget` with nothing drawn; three of the first six model calls were replies made of
 *  `plan` calls alone, and `highlight` offered `groups` as an untyped array whose one-line description
 *  never said a category colouring was possible. This holds the two things changed:
 *    ① `highlight`'s `groups` carries its shape and the tool says what it is for;
 *    ② a reply made only of plan calls is told so (a fact; nothing is refused, no ceiling moves).
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { importModule, swappable } from './helpers/import-module.mjs';

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const { makeAtlasAgent } = await import('../js/atlas-agent.js');
const { makeAtlasToolSurface } = await import('../js/atlas-toolsurface.js');
const engineSeat = swappable();
const { makeAtlasCapabilities } = await importModule('js/atlas-capabilities.js', { mocks: { 'js/geo-engine.js': { IntMapGeoEngine: engineSeat.value } } });
const { makeAtlasSchemas } = await import('../js/atlas-schemas.js');
const { makeAtlasPlan } = await import('../js/atlas-plan.js');

const AGENT = makeAtlasAgent();
const CAPS = makeAtlasCapabilities({});
const SCHEMAS = makeAtlasSchemas();
const surface = makeAtlasToolSurface({ capabilities: CAPS, schemas: SCHEMAS, runAction: async () => ({ ok: true, html: '<div>ok</div>', meta: { status: 'completed', produced: ['map'] } }) });

test('atlas-table-to-countries ① highlight names its category form: groups carry label + targets, and the tool says what groups are for', () => {
  const tools = surface.baseTools();
  const hl = tools.highlight;
  assert.match(hl.description, /groups/, 'the description names the form');
  assert.match(hl.description, /CATEGORY|category/);
  const g = hl.parameters.properties.groups;
  assert.equal(g.type, 'array');
  assert.ok(g.items && g.items.properties && g.items.properties.label && g.items.properties.targets, 'groups items declare label and targets');
});

test('atlas-table-to-countries ① a five-category, many-country call is one valid highlight call', () => {
  const groups = ['優勝', '準優勝', 'ベスト4', 'ベスト8', 'その他'].map((label, i) => ({
    label, targets: [{ name: 'Country ' + i, iso3: 'AR' + String.fromCharCode(65 + i) }, 'FRA'] }));
  const schema = SCHEMAS.schemaFor('map.highlight');
  const r = SCHEMAS.validate ? SCHEMAS.validate('map.highlight', { groups }) : null;
  if (r) assert.ok(r.ok !== false, JSON.stringify(r));
  assert.ok(schema.properties.groups.items);
});

test('atlas-table-to-countries ② a reply made only of plan calls is told nothing was done; a reply with real calls is not', async () => {
  const run = async (script) => {
    const PLAN = makeAtlasPlan();
    const tools = surface.baseTools();
    let i = 0;
    const seen = [];
    const model = async (req) => { seen.push(req.messages); const r = script[Math.min(i, script.length - 1)]; i++; return r; };
    const out = await AGENT.runTurn({ model, tools, execute: surface.makeExecute(tools, AGENT), footprint: (c) => surface.footprintOf(c, tools),
      promote: surface.promotionsOf, plan: PLAN, system: 'sys', messages: [{ role: 'user', content: 'q' }] });
    return { out, seen };
  };
  const planOnly = { text: '', turnState: 'continuing', toolCalls: [{ id: 'p1', name: 'plan', arguments: { goal: 'g', steps: ['a', 'b'], current: 1 } }] };
  const done = { text: 'done', turnState: 'final', toolCalls: [] };
  const a = await run([planOnly, done]);
  assert.ok(/only plan calls/.test(JSON.stringify(a.seen[1])), 'plan-only reply: the next model call is shown that fact');
  const withWork = { text: '', turnState: 'continuing', toolCalls: [
    { id: 'p2', name: 'plan', arguments: { goal: 'g', steps: ['a'], current: 1 } },
    { id: 'h1', name: 'highlight', arguments: { groups: [{ label: 'x', targets: [{ name: 'France', iso3: 'FRA' }] }] } }] };
  const b = await run([withWork, done]);
  assert.ok(!/only plan calls/.test(JSON.stringify(b.seen[1])), 'plan beside real calls: no note');
});
