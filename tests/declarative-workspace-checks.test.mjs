/* ============================================================================
 *  declarative-workspace — a view Atlas declares (ui.compose), checked whole and drawn with IntMap's own parts
 * ----------------------------------------------------------------------------
 *  What is held here, by EVALUATING the shipped modules (#R505), never by reading how they are spelled:
 *    ① a spec that uses every block kind passes, and the kinds the schema offers are the kinds the checker knows;
 *    ② a bad spec is refused with EVERY problem at once, each with its path and a reason (no silent drop):
 *       unknown kind / unknown field / oversized list / a URL / markup / a table row of the wrong width / too large;
 *    ③ the capability is in the registry as a session-scoped, confirm-free row whose schema IS the spec module's,
 *       and the agent's own argument validator reads that schema;
 *    ④ the run draws only IntMap's parts: hostile text arrives escaped, a chart block goes through the chart
 *       capability's own dispatch, a controls block through the one control renderer; a block a part refuses
 *       (a chart without a source, a layer the map does not have) refuses the whole view with that reason;
 *    ⑤ ui.inlineControls still draws what it can and leaves out what it cannot (its behaviour before the
 *       renderer was shared);
 *    ⑥ the notebook keeps the spec as the step's arguments and a replay may draw it again.
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { test } from 'node:test';

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
await import('../js/safe-html.js');
const esc = (s) => globalThis.IntMapSafe.html(s);
const L = (en) => en;
const SPEC = await import('../js/atlas-ui-spec.js');
const UI = (await import('../js/atlas-cap-ui.js')).default;
const { makeAtlasCapabilities } = await import('../js/atlas-capabilities.js');
const { makeAtlasSchemas } = await import('../js/atlas-schemas.js');
const { makeAtlasAgent } = await import('../js/atlas-agent.js');
const { atlasChart } = await import('../js/atlas-chart.js');
const NB = await import('../js/atlas-notebook-store.js');

const entry = (id) => UI.find((e) => e.row[0] === id);
const CAPS = makeAtlasCapabilities({}, { publish: false });
const CHART = atlasChart(null, { L, esc });

const GOOD = {
  type: 'dashboard', title: 'Japan & Korea — population',
  blocks: [
    { kind: 'metrics', title: 'Headline', items: [{ label: 'Japan', value: 123.3, unit: 'M', delta: -0.5 }, { label: 'Korea', value: '51.7', unit: 'M' }], source: 'World Bank WDI 2024' },
    { kind: 'table', columns: ['Country', 'Population (M)'], rows: [['Japan', 123.3], ['Korea | ROK', 51.7]], source: 'World Bank WDI 2024', caption: 'Mid-year' },
    { kind: 'chart', chart: { kind: 'bar', source: 'World Bank WDI 2024', series: [{ points: [{ x: 0, y: 123.3, label: 'Japan' }, { x: 1, y: 51.7, label: 'Korea' }] }] } },
    { kind: 'board', board: { source: 'World Bank WDI 2024', data: { rows: [{ country: 'Japan', pop: 123.3 }] }, widgets: [{ kind: 'table' }] } },
    { kind: 'controls', items: [{ kind: 'layerToggle', layer: 'Population' }, { kind: 'button', label: 'Add China', run: 'add China to the comparison' }] },
    { kind: 'places', items: [{ label: 'Tokyo', place: 'Tokyo' }, { label: 'Seoul', lat: 37.57, lng: 126.98, zoom: 9 }] },
    { kind: 'text', md: '**Both** are shrinking; growth < 0 & falling > 0.5%/yr.' },
  ],
};

/* a kernel stand-in with exactly the K members the run reads: the real chart renderer behind `dispatch`, one layer */
function fakeK(over) {
  const calls = [];
  const layer = { label: 'Population', cb: { id: 'lyr-pop', checked: false } };
  const K = {
    R: (ok, html, extra) => Object.assign({ ok: !!ok, html: html || '' }, extra || null),
    warn: (s) => '<div class="w">' + s + '</div>', L, esc,
    mdMini: (s) => '<p>' + esc(s) + '</p>',
    CAPS, HOST: { lang: 'en' },
    resolveLayer: (n) => (/^population$/i.test(n) ? layer : null),
    layerOpacityControl: () => ({ value: '0.8' }),
    dispatch: async (a) => { calls.push(a); if (a.type === 'board') return K.R(true, '<div class="atl-note">opened</div>'); if (a.type !== 'chart') return K.R(false, ''); const r = CHART.render(a); return r.ok ? K.R(true, r.html, { meta: { chart: { kind: r.kind, plotted: r.plotted } } }) : K.R(false, K.warn(esc(r.detail)), { meta: { code: r.reason } }); },
  };
  return Object.assign(K, over || {}, { calls });
}

test('① a spec using every kind passes, and the schema offers exactly the kinds the checker knows', () => {
  const r = SPEC.checkView(GOOD, L);
  assert.deepEqual(r.problems, []);
  assert.equal(r.ok, true);
  assert.deepEqual(new Set(GOOD.blocks.map((b) => b.kind)), new Set(SPEC.KINDS), 'the fixture covers every kind');
  const s = SPEC.viewSchema();
  assert.deepEqual(s.properties.blocks.items.properties.kind.enum, SPEC.KINDS.slice());
  for (const k of SPEC.KINDS) for (const f of Object.keys(SPEC.BLOCKS[k].fields)) assert.ok(s.properties.blocks.items.properties[f], k + '.' + f + ' is in the schema');
  for (const k of SPEC.KINDS) assert.ok(SPEC.blockShapes().indexOf('"kind":"' + k + '"') >= 0, 'the catalogue names ' + k);
});

test('② a bad spec is refused with every problem, each with its path and reason', () => {
  const bad = {
    title: 'x', extra: 1,
    blocks: [
      { kind: 'iframe', src: 'x' },
      { kind: 'metrics', items: Array.from({ length: 13 }, (_, i) => ({ label: 'm' + i, value: i })), source: '' },
      { kind: 'text', md: 'see https://evil.example/' },
      { kind: 'text', md: '<img src=x onerror=alert(1)>' },
      { kind: 'table', columns: ['a', 'b'], rows: [['1']], source: 's' },
      { kind: 'places', items: [{ label: 'nowhere' }], color: 'red' },
      { kind: 'chart', chart: { kind: 'line', source: 'javascript:alert(1)' } },
    ],
  };
  const r = SPEC.checkView(bad, L);
  assert.equal(r.ok, false);
  const has = (at, code) => assert.ok(r.problems.some((p) => p.at === at && p.code === code), 'expected ' + code + ' at ' + at + ' in ' + JSON.stringify(r.problems.map((p) => p.at + ':' + p.code)));
  has('extra', 'unknown_field');
  has('blocks[0].kind', 'unknown_kind');
  has('blocks[1].items', 'too_many');
  has('blocks[1].source', 'missing');
  has('blocks[2].md', 'url');
  has('blocks[3].md', 'markup');
  has('blocks[4].rows[0]', 'shape');
  has('blocks[5].color', 'unknown_field');
  has('blocks[5].items[0]', 'missing');
  has('blocks[6].chart.source', 'url');
  for (const p of r.problems) assert.ok(typeof p.why === 'string' && p.why.length > 5, 'a reason for ' + p.at);
  const big = { blocks: [{ kind: 'text', md: 'a'.repeat(3000) }, ...Array.from({ length: 11 }, () => ({ kind: 'text', md: 'b'.repeat(3000) }))] };
  assert.ok(SPEC.checkView(big, L).problems.some((p) => p.code === 'too_large'));
  assert.ok(SPEC.checkView({ blocks: [] }, L).problems.some((p) => p.at === 'blocks'));
  assert.ok(SPEC.checkView(null, L).problems.length);
});

test('③ ui.compose is one session-scoped, confirm-free row, its schema is the spec module\'s, and the agent validates against it', () => {
  const c = CAPS.resolve('ui.compose');
  assert.ok(c, 'in the registry');
  assert.equal(CAPS.ofSpelling('dashboard'), c);
  assert.equal(c.risk, 'reversible-session');
  assert.equal(c.confirmation, 'none');
  const S = makeAtlasSchemas().schemaFor('ui.compose');
  assert.deepEqual(S, SPEC.viewSchema());
  const agent = makeAtlasAgent({});
  const errs = []; agent.validateAgainst(S, { blocks: [{ kind: 'nope' }] }, 'ui.compose', errs);
  assert.ok(errs.length, 'an unknown kind fails the agent\'s own argument check');
  const ok = []; agent.validateAgainst(S, GOOD, 'ui.compose', ok);
  assert.deepEqual(ok, []);
});

test('④ the run draws only IntMap parts, delegates chart and controls, and refuses a block a part refuses', async () => {
  const K = fakeK();
  const r = await entry('ui.compose').run(JSON.parse(JSON.stringify(GOOD)), {}, K);
  assert.equal(r.ok, true, r.html);
  assert.match(r.html, /^<section class="atl-ui" aria-label="Japan &amp; Korea — population">/);
  assert.ok(r.html.indexOf('growth &lt; 0 &amp; falling &gt; 0.5%') >= 0, 'a comparison sign is prose, escaped by the reply renderer, not refused as markup');
  assert.ok(!/<script|onerror|javascript:/i.test(r.html));
  assert.ok(K.calls.some((a) => a.type === 'chart' && a.kind === 'bar'), 'the chart block ran the chart capability');
  assert.ok(K.calls.some((a) => a.type === 'board' && a.source === 'World Bank WDI 2024'), 'the board block ran board.compose through the same dispatch');
  assert.equal((r.html.match(/data-mark="1"/g) || []).length, 2, 'the chart renderer drew both bars');
  assert.ok(r.html.indexOf('class="atl-ctl-toggle"') >= 0 && r.html.indexOf('data-cb="lyr-pop"') >= 0, 'the controls block is the control renderer\'s row');
  assert.ok(r.html.indexOf('data-place="Tokyo"') >= 0 && r.html.indexOf('data-lat="37.57"') >= 0 && r.html.indexOf('data-zoom="9"') >= 0);
  assert.ok(r.html.indexOf('Korea \\| ROK') >= 0, 'a pipe in a cell is escaped for the table renderer');
  assert.ok(r.html.indexOf('−0.5 M') >= 0, 'a negative change prints its sign');
  assert.deepEqual(r.meta.view.kinds, GOOD.blocks.map((b) => b.kind));

  const bad = JSON.parse(JSON.stringify(GOOD));
  bad.blocks[2].chart.source = '';
  bad.blocks[4].items[0].layer = 'No such layer';
  const K2 = fakeK();
  const r2 = await entry('ui.compose').run(bad, {}, K2);
  assert.equal(r2.ok, false);
  assert.equal(r2.meta.code, 'invalid_view');
  assert.deepEqual(r2.meta.problems.map((p) => p.at).sort(), ['blocks[2].chart', 'blocks[4].items[0]']);
  assert.ok(!/class="atl-ui"/.test(r2.html), 'nothing is drawn when any block is refused');
  assert.ok(/blocks\[4\]\.items\[0\]/.test(r2.html), 'the reader and the model see the path');

  const r3 = await entry('ui.compose').run({ blocks: [{ kind: 'text', md: '<b>x</b>' }] }, {}, fakeK());
  assert.equal(r3.ok, false);
  assert.equal(r3.meta.problems[0].code, 'markup');
});

test('⑤ ui.inlineControls draws what it can and leaves out what it cannot, as before', async () => {
  const r = await entry('ui.inlineControls').run({ items: [{ kind: 'layerToggle', layer: 'Nope' }, { kind: 'opacity', layer: 'population' }, { kind: 'button', label: 'Go', run: 'go' }] }, {}, fakeK());
  assert.equal(r.ok, true);
  assert.ok(r.html.indexOf('atl-ctl-op') >= 0 && r.html.indexOf('atl-ctl-btn') >= 0);
  assert.ok(r.html.indexOf('Nope') < 0);
  const none = await entry('ui.inlineControls').run({ items: [{ kind: 'layerToggle', layer: 'Nope' }] }, {}, fakeK());
  assert.equal(none.ok, false);
});

test('⑥ the notebook keeps the spec as the step\'s arguments, and a replay may draw the view again', () => {
  const resolve = (id) => CAPS.resolve(id);
  assert.equal(NB.replayable('ui.compose', 'completed', resolve), true);
  const e = NB.entryFromTurn({ question: 'dashboard of Japan and Korea', reply: 'Here.', operations: [{ capabilityId: 'ui.compose', args: Object.assign({ __paintRun: 'run1' }, GOOD), status: 'completed' }] }, { resolve, now: 1 });
  const s = e.steps[0];
  assert.equal(s.cap, 'ui.compose');
  assert.equal(s.args.__paintRun, undefined, 'the executor\'s stamp is not kept');
  assert.deepEqual(s.args.blocks, GOOD.blocks);
  assert.deepEqual(NB.replayCalls(e, resolve)[0].blocks, GOOD.blocks);
  assert.deepEqual(NB.normalize(JSON.parse(JSON.stringify(e))).steps[0].args, s.args, 'it survives being stored and read back');
});
