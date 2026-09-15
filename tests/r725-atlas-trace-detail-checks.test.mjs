/* ============================================================================
 *  R725 — 本番で実測: Atlas の作業一覧の「引数」欄が、実際のターンで全行空だった
 * ----------------------------------------------------------------------------
 *  ⚠ THE DEFECT, RESTATED. #R723 shipped a work trace whose detail column read
 *
 *      a.name || a.place || a.country || a.metric || a.query || a.topic || a.mode || …
 *
 *  — ELEVEN KEY NAMES, copied from js/atlas-turn-continuity.js. Production measured what that
 *  costs: on a real turn every row's detail was the empty string, because the capability that ran
 *  (`map.compose`) carries its subject under `title`, a twelfth spelling nobody had thought of.
 *  Adding `title` would have fixed that one turn and left the next capability blank
 *  (.agents/rules/no-ad-hoc-hardcoding.md §1: 「報告された 1 件のための記述」).
 *
 *  The capability already declares the answer. js/atlas-schemas.js says, per capability and in the
 *  capability's own order, which arguments are free text (a SUBJECT) and which come from a declared
 *  vocabulary (a SETTING: `enum`, `boolean`, `number`). The rule is stated over that distinction.
 *
 *  ⚠ EVALUATED, NOT READ (#R505). These load the real schema module and the real registry; a check
 *  that greps js/atlas-progress.js for key names would be the very list being removed.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;

const progress = async () => (await import('../js/atlas-progress.js'));
const schemas = async () => (await import('../js/atlas-schemas.js')).makeAtlasSchemas();
const registry = async () => (await import('../js/atlas-capabilities.js')).makeAtlasCapabilities({});

async function mount() {
  const mod = await progress();
  const S = await schemas();
  const caps = await registry();
  const P = mod.makeAtlasProgress({}, {
    L: (en) => en, esc: (s) => String(s == null ? '' : s),
    capabilities: () => caps, schemas: () => S
  });
  return { P, S, caps };
}

/* ══ ① THE REPORTED TURN, ARGUMENT BY ARGUMENT ══════════════════════════════════════════════════
   These four capabilities and these four argument objects are what production actually executed
   (captured from IntMapAtlasExec.execute during the reported turn). Every row's detail was empty. */
test('R725 ① the capabilities of the reported turn each name their own subject', async () => {
  const { P } = await mount();
  const observed = [
    ['data.weather', { type: 'weather', place: '大阪市, 日本' }, '大阪市, 日本'],
    ['data.weather', { type: 'weather', place: '札幌市, 日本' }, '札幌市, 日本'],
    /* ⚠ THE ONE THAT WAS BLANK. `title` is the subject; `camera` is a setting with two enum values,
       and it comes FIRST in the argument object — so a rule that took "the first string" would
       have shown 「fit」, which tells the reader nothing about what Atlas did. */
    ['map.compose', { type: 'compose', camera: 'fit', title: '大阪市と札幌市の現在の気温', items: [{ name: 'a' }] },
      '大阪市と札幌市の現在の気温'],
    ['layers.toggle', { type: 'layer', name: 'Wind', on: true }, 'Wind']
  ];
  for (const [id, args, want] of observed) {
    assert.equal(P.detailFor(id, args), want, id + ' shows its subject');
  }
});

/* ══ ② THE RULE IS OVER THE SCHEMA, NOT OVER A LIST OF NAMES ════════════════════════════════════
   Asked of EVERY capability that has a schema: whatever the detail picks, it is a free-text
   argument that capability declares — never one drawn from a declared vocabulary. */
test('R725 ② across the whole registry, the detail is never a setting', async () => {
  const { P, S, caps } = await mount();
  const ids = caps.all().map((c) => c && c.id).filter(Boolean);
  assert.ok(ids.length >= 130, ids.length + ' capabilities');

  let asked = 0, enumShown = 0, subjectShown = 0;
  const leaked = [];
  for (const id of ids) {
    const sc = S.schemaFor(id);
    const props = (sc && sc.properties) || null;
    if (!props) continue;
    /* give EVERY declared argument a value, so nothing is picked merely by being the only one set */
    const args = { type: 'x' };
    Object.keys(props).forEach((k) => {
      const p = props[k] || {};
      if (p.enum && p.enum.length) args[k] = String(p.enum[0]);
      else if (p.type === 'string') args[k] = 'SUBJECT-' + k;
      /* ⚠ A NUMBER THE MODEL SENT AS TEXT IS STILL A NUMBER. The envelope is JSON the model writes,
         and it writes `zoom: "10"` often enough that a rule reading only `typeof value === 'string'`
         would offer 「10」 to the reader as the subject of the step. What the argument IS, is what the
         capability declared it to be — so these arrive here in the sloppy shape on purpose. */
      else if (p.type === 'number') args[k] = '10';
      else if (p.type === 'boolean') args[k] = 'true';
      else if (p.type === 'array') args[k] = [];
    });
    asked++;
    const got = P.detailFor(id, args);
    if (!got) continue;
    subjectShown++;
    if (!/^SUBJECT-/.test(got)) { enumShown++; leaked.push(id + ' -> ' + got); continue; }
    const key = got.replace(/^SUBJECT-/, '');
    const p = props[key] || {};
    if (!(p.type === 'string' && !(p.enum && p.enum.length))) { enumShown++; leaked.push(id + ' -> ' + got); }
  }
  assert.ok(asked >= 100, 'the sweep reached ' + asked + ' capabilities with a schema');
  assert.ok(subjectShown >= 80, 'and ' + subjectShown + ' of them have a subject to show');
  assert.deepEqual(leaked, [], enumShown + ' capabilit(ies) would show a setting as the subject');
});

/* ══ ③ NOTHING IS INVENTED ══════════════════════════════════════════════════════════════════════
   An empty column says 「this step had no subject worth naming」, which is true. A guess would say
   something false about what Atlas did, and the reader cannot tell the two apart. */
test('R725 ③ a capability with nothing to name shows nothing, not a guess', async () => {
  const { P } = await mount();
  assert.equal(P.detailFor('map.clearHighlights', { type: 'reset' }), '', 'no arguments, no detail');
  assert.equal(P.detailFor('not.a.capability', { type: 'x', place: 'Osaka' }), '',
    'an id this build has no schema for is not guessed at from its argument names');
  assert.equal(P.detailFor('data.weather', {}), '', 'a declared argument that was not passed shows nothing');
  assert.equal(P.detailFor('data.weather', { type: 'weather', place: '   ' }), '', 'whitespace is not a subject');
  /* the internals the console stamps on an action are not arguments */
  assert.equal(P.detailFor('data.weather', { type: 'weather', __paintRun: 'run7', __meta: {} }), '',
    'the bookkeeping fields the dispatch adds are never shown');
});

/* ══ ④ THE CAPABILITY'S OWN ORDER IS THE ONLY TIE-BREAK ══════════════════════════════
   A 「required arguments first」 tie-break was written here first and MEASURED WRONG: `chart.compose`
   declares free text as [title, source] and requires [kind, source], so required-first showed the
   reader a data SOURCE where the chart has a TITLE. It is the one capability in the registry where
   the two rules disagree, which is why the disagreement is the check. */
test('R725 ④ where declaration order and requiredness disagree, the capability’s order wins', async () => {
  const { P, S } = await mount();
  const sc = S.schemaFor('chart.compose');
  const props = Object.keys(sc.properties || {});
  const req = sc.required || [];
  /* the premise, asserted rather than remembered */
  assert.ok(props.indexOf('title') < props.indexOf('source'), 'chart.compose declares title before source');
  assert.ok(!req.includes('title') && req.includes('source'), 'and requires source but not title');
  assert.equal(P.detailFor('chart.compose', { type: 'chart', title: 'GDP per head', source: 'World Bank', kind: 'line' }),
    'GDP per head', 'the reader is shown the chart, not where its numbers came from');
});

/* ══ ⑤ AN ACTION'S OWN `type` IS NEVER MISTAKEN FOR ITS SUBJECT ════════════════════════
   Twenty-one schemas declare a property literally named `type`, and a legacy action object carries
   its own `type` (the action name, e.g. 'weather'). Today every one of those twenty-one is an enum,
   so the free-text rule already refuses them and no second guard is needed. This states the
   INVARIANT rather than the mechanism: the day a schema declares `type` as free text, this fails
   and someone decides — instead of the trace quietly showing the reader the name of an action. */
test('R725 ⑤ no capability would show the action name as its subject', async () => {
  const { P, S, caps } = await mount();
  let withTypeProp = 0, checked = 0;
  const leaked = [];
  for (const c of caps.all()) {
    const id = c && c.id; if (!id) continue;
    const sc = S.schemaFor(id); const props = (sc && sc.properties) || null; if (!props) continue;
    if (props.type) withTypeProp++;
    const args = { type: 'LEGACY-ACTION-NAME' };
    Object.keys(props).forEach((k) => {
      const p = props[k] || {};
      if (k === 'type') return;                      /* leave the action's own value in place */
      if (p.enum && p.enum.length) args[k] = String(p.enum[0]);
      else if (p.type === 'string') args[k] = 'SUBJECT-' + k;
    });
    checked++;
    if (P.detailFor(id, args) === 'LEGACY-ACTION-NAME') leaked.push(id);
  }
  assert.ok(withTypeProp >= 1, withTypeProp + ' schemas declare a property named `type` (the premise)');
  assert.ok(checked >= 100, 'asked of ' + checked + ' capabilities');
  assert.deepEqual(leaked, [], 'these would show the action name: ' + leaked.join(', '));
});
