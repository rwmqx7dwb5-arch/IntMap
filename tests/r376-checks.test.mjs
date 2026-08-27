/* ============================================================================
 *  IntMap · #R376 source checks — the four things production verification found
 * ----------------------------------------------------------------------------
 *  #R356 shipped the multi-model weather platform and every gate was green: 2,236 node checks,
 *  48 browser assertions, CI, CodeQL. Production verification then found FOUR defects, and every
 *  one of them was invisible to a check that reads this repository against itself.
 *
 *    ① Atlas reported a SUCCESSFUL model switch as a failure. `data.wxModel` was declared with the
 *       `paint` observer, which counts drawn FEATURES; a raster source swap draws exactly as many
 *       as it drew before. MEASURED on production, three models, three times:
 *       `status:"partial" code:"not_rendered" ok:false` while the legend, the picker, `modelOf()`
 *       and the style's source url had all become DWD ICON.
 *    ② Two switches in a row made the first one report `not_painted_yet`. The waiter queue woke
 *       EVERY waiter on the next commit, so the in-flight switch was resolved with somebody else's
 *       provenance.
 *    ③ The cursor readout kept sampling `window.IntMapECMWF` — the DEFAULT model. A layer switched
 *       to ICON drew ICON tiles while the readout printed ECMWF's number and ECMWF's valid time.
 *       ⚠ Nothing looked broken: a plausible temperature is not a visibly wrong one.
 *    ④ Every offered model was instantiated at boot, because the legend picker asked each of them
 *       「can you draw this layer?」 through `model()`, which BUILDS. No network followed, so the
 *       cost was objects — but js/wx-ecmwf.js's own comment claimed a session that never switches
 *       builds exactly one, and that had stopped being true.
 *
 *  ⚠ THE COMMON SHAPE: each defect is a disagreement between two things this repository holds, and
 *  in all four cases BOTH halves were self-consistent. That is why the checks below assert the
 *  RELATION between the halves rather than the content of either.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readLF(resolve(ROOT, p));
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
const CAPS = () => read('js/atlas-capabilities.js');
const WX = () => read('js/weather.js');
const RO = () => read('js/map-readout.js');
const EC = () => read('js/wx-ecmwf.js');
const AUDIT = () => read('scripts/atlas-capability-audit.mjs');

/* ── ① the capability is observed by something that can SEE what it changes ───────────────────*/
test('R376 ① a raster-source capability is not verified by counting features', () => {
  const caps = codeOnly(CAPS());
  /* the row names the observer that reads the displayed model */
  assert.match(caps, /\['data\.wxModel',\s*'wxModel',[^\]]*'wxModel',/,
    'data.wxModel is observed by the wxModel observer, not by paint');
  assert.ok(!/\['data\.wxModel',[^\]]*'paint',/.test(caps),
    'and NOT by paint — paintNow() counts features, and a raster swap changes none');

  /* the observer exists, and it reads the DISPLAYED model rather than the requested one */
  const obs = caps.slice(caps.indexOf('wxModel: {'), caps.indexOf('wxModel: {') + 1600);
  assert.ok(obs.length > 200, 'the observer is where it is expected');
  assert.match(obs, /W\.modelOf\(l\.id\)/, 'it asks the module which model each layer is DISPLAYING');
  assert.ok(!/state\[[^\]]*\]\.model\b/.test(obs), '…never the requested one');
  assert.match(obs, /if \(want && got === want\) return \{ status: 'completed'/,
    'the layer this call named is displaying the model this call asked for');
  assert.match(obs, /code: 'not_displayed'/,
    '…and 「not displayed yet」 has its own code, because not_rendered would be a claim about painting');
  /* ⚠ and it must not be a verifier that only re-reads what the dispatch case said */
  assert.match(obs, /raw && raw\.ok === false/, 'a self-reported failure is still honoured…');
  assert.ok(/observe: function/.test(obs), '…but the evidence for success is an OBSERVATION');
});

/* ── ① b the audit knows what the new observer can witness ────────────────────────────────────
   An observer kind that is not in these two tables makes ⑦ and ⑱ fail — which is the mechanism
   that stopped #R376 from declaring `produces:'map'` against something that cannot see a map. */
test('R376 ①b the new observer is declared in the audit’s own tables', () => {
  const a = AUDIT();
  assert.match(a, /wxModel: \['map', 'explanation'\]/, 'OBSERVABLE says what it can witness');
  /* ⚠ (#R495) MEMBERSHIP, NOT POSITION. This read `[^\]]*'wxModel'\]` — which also required
     `wxModel` to be the LAST entry, so adding a second map observer (`queryRows`) failed a test
     whose subject is whether `wxModel` is in the list at all. The rule is unchanged; what is gone
     is an incidental fact about where in the array it sits. */
  assert.match(a, /const MAP_OBS = \[[^\]]*'wxModel'[^\]]*\]/, 'and MAP_OBS counts it as a map observer');
});

/* ── ② a waiter is only woken by the commit it is waiting for ─────────────────────────────────*/
test('R376 ② an in-flight model switch is not resolved by a different model’s commit', () => {
  const wx = codeOnly(WX());
  assert.match(wx, /function whenCommitted\(cfg,wantModelId,ms\)\{/,
    'the waiter knows which model it is waiting for');
  assert.match(wx, /if\(wantModelId&&\(!p\|\|p\.modelId!==wantModelId\)\) return false;/,
    '…and a commit for another model is DECLINED rather than accepted');
  /* the drain must respect that answer — the first version spliced every waiter out unconditionally */
  assert.match(wx, /w\.slice\(\)\.forEach\(f=>\{ let done=false; try\{ done=f\(prov\); \}/,
    'commit() asks each waiter whether the commit was its own…');
  assert.match(wx, /if\(done\)\{ const i=w\.indexOf\(f\); if\(i>=0\) w\.splice\(i,1\); \}/,
    '…and only removes the ones that said yes');
  assert.ok(!/w\.splice\(0\)\.forEach/.test(wx), 'the unconditional drain is gone');
  assert.match(wx, /return whenCommitted\(cfg,modelId\)/, 'setModel waits for ITS model');
});

/* ── ③ the point value comes from the model the layer is showing ──────────────────────────────*/
test('R376 ③ the cursor readout samples the layer’s own model, not the default', () => {
  const ro = codeOnly(RO());
  assert.match(ro, /function ecFor\(cfg\)\{/, 'the readout resolves an instance per layer');
  assert.match(ro, /W\.engineFor\(cfg\.id\)/, '…by asking the weather module which one this layer reads');
  assert.match(ro, /return window\.IntMapECMWF;\s*\}/,
    '…and falls back to the default rather than to nothing');
  /* the two places that sample must both go through it */
  assert.match(ro, /function askEcField\(cfg\)\{[\s\S]{0,200}?const EC=ecFor\(cfg\);/,
    'the field request uses it');
  assert.match(ro, /const cfg=W\.activeVariable\(\); if\(!cfg\) return null;\s*const EC=ecFor\(cfg\);/,
    'and so does the value that is printed');
  /* ⚠ the default instance must not be sampled directly any more */
  const direct = (ro.match(/window\.IntMapECMWF/g) || []).length;
  assert.equal(direct, 1, 'window.IntMapECMWF appears once — as the fallback inside ecFor (found ' + direct + ')');

  /* and the module offers the accessor the readout needs */
  assert.match(codeOnly(WX()), /engineFor:\(id\)=>\{ const c=LAYERS\.find\(l=>l\.id===id\); return c\?EC\(c\):EC\(\); \}/,
    'js/weather.js publishes engineFor');
});

/* ── ④ asking about a model does not open it ──────────────────────────────────────────────────*/
test('R376 ④ the legend’s picker peeks; it does not instantiate every offered model', () => {
  const ec = codeOnly(EC());
  assert.match(ec, /peek: function \(id\) \{ return instances\[id\] \|\| null; \}/,
    'the engine offers a non-constructing lookup');

  const wx = codeOnly(WX());
  assert.match(wx, /function availFor\(cfg,modelId\)\{[\s\S]{0,260}?ENG\(\)\.peek\?ENG\(\)\.peek\(modelId\):ENG\(\)\.model\(modelId\)/,
    'availFor peeks rather than builds');
  assert.match(wx, /metas\.push\(i\)/, 'pruneMissing collects the models that HAVE answered…');
  assert.match(wx, /ENG\(\)\.peek\?ENG\(\)\.peek\(m\.id\):ENG\(\)\.model\(m\.id\), md=i&&i\.metaSync\(\)/,
    '…and it peeks too, so a row is never deleted on the evidence of a model nobody read');

  /* ⚠ …and the picker must still be able to say 「この変数は無い」. Peeking alone would leave every
     option enabled until something else happened to read that model, which is what production
     measured BEFORE this round: the GFS option on the pressure legend was only disabled because a
     probe had already fetched GFS metadata. So a legend that opens warms the offered models once. */
  assert.match(wx, /let metaWarmed=false;/, 'the warm-up happens at most once per session');
  assert.match(wx, /function warmModelMeta\(\)\{[\s\S]{0,400}?inst\.meta\(\)\.then\(\(\)=>\{ if\(anyOn\(\)\) renderLegend\(\); \}\)/,
    '…and re-renders the legend when a model answers, so the disabled state becomes real');
  assert.match(wx, /function renderLegend\(\)\{\s*warmModelMeta\(\);/,
    'and it is triggered by a legend actually being rendered — never at boot');
});

/* ── ⑤ what production measured, kept as numbers rather than as a memory ──────────────────────
   Not a source check: a record that the four defects above were found by asking the LIVE site, and
   that the repository was self-consistent and green the whole time. If a later round wonders
   whether production verification earns its cost, this is the answer. */
test('R376 ⑤ the round records that every repository gate was green while all four were live', () => {
  const d = read('DEV-NOTES.md');
  const at = d.indexOf('## R376');
  assert.ok(at > 0, 'the round is written down');
  const body = d.slice(at, at + 9000);
  for (const n of ['not_rendered', 'not_painted_yet', 'engineFor', 'peek'])
    assert.ok(body.includes(n), 'the record names the mechanism: ' + n);
  assert.ok(/2,?236/.test(body), 'and the number of node checks that passed anyway');
});
