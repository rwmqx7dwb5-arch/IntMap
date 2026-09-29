/* ============================================================================
 *  Atlas · the weather layers as Atlas drives them — the model switch (js/weather.js,
 *  js/map-readout.js, js/wx-ecmwf.js, the wxModel observer) and the particle defaults
 * ----------------------------------------------------------------------------
 *  (tests-by-topic) Gathered from two round files; every test keeps the title it had there:
 *    · tests/r376-checks.test.mjs     — the four things production verification found
 *    · tests/r455-checks.test.mjs ②   — the particle default is per layer, and the fourth layer can ask
 * ==========================================================================*/
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
import { entryText } from '../scripts/dev-notes.mjs';
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
  /* kept as a spelling: js/weather.js, js/map-readout.js and js/wx-ecmwf.js are built with the page (map, legend DOM, tile protocol); the catalogue text is what the planner is shown */
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
test('R376 ①b the new observer is declared in the audit’s own tables', async () => {
  const a = AUDIT();
  assert.match(a, /wxModel: \['map', 'explanation'\]/, 'OBSERVABLE says what it can witness');
  /* ⚠ (#R495) MEMBERSHIP, NOT POSITION. This read `[^\]]*'wxModel'\]` — which also required
     `wxModel` to be the LAST entry, so adding a second map observer (`queryRows`) failed a test
     whose subject is whether `wxModel` is in the list at all. The rule is unchanged; what is gone
     is an incidental fact about where in the array it sits.
     ⚠⚠ (#R551) …AND NOT A LITERAL AT ALL ANY MORE. The second assert then read
     `/const MAP_OBS = \[[^\]]*'wxModel'[^\]]*\]/` — a hand-written ARRAY — and #R551 removed that
     array: `MAP_OBS` and `OBSERVABLE` were two lists of one fact, so a new observer had to be added
     to both or the audit contradicted itself, and `MAP_OBS` is now DERIVED from the table asserted
     above. The check went red on a change that made the thing it guards structurally true, which is
     the #R488 / #R529 / #R546 shape. So it stops reading the source and RUNS THE AUDIT: the question
     was never 「その配列にこう書いてあるか」 but 「監査は wxModel を地図の観測器として扱うか」. */
  const { audit } = await import('../scripts/atlas-capability-audit.mjs');
  const rep = await audit();
  const mv = rep.checks.find((c) => c.id === 'map-verified');
  assert.ok(mv, 'the audit still runs the map-verified check');
  const wx = rep.caps.toJSON().capabilities.filter((c) => c.observerKind === 'wxModel' && c.produces.includes('map'));
  assert.ok(wx.length, 'there is a live capability that promises the map and is watched by wxModel');
  wx.forEach((c) => assert.ok(!mv.failures.some((f) => String(f).startsWith(c.id + ':')),
    c.id + ' is counted as map-verified — wxModel is a map observer, however MAP_OBS is spelled'));
});

/* ── ② a waiter is only woken by the commit it is waiting for ─────────────────────────────────*/
test('R376 ② an in-flight model switch is not resolved by a different model’s commit', () => {
  /* kept as a spelling: js/weather.js, js/map-readout.js and js/wx-ecmwf.js are built with the page (map, legend DOM, tile protocol); the catalogue text is what the planner is shown */
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
  /* kept as a spelling: js/weather.js, js/map-readout.js and js/wx-ecmwf.js are built with the page (map, legend DOM, tile protocol); the catalogue text is what the planner is shown */
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
  /* kept as a spelling: js/weather.js, js/map-readout.js and js/wx-ecmwf.js are built with the page (map, legend DOM, tile protocol); the catalogue text is what the planner is shown */
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
  /* (2026-09-25) one file per entry now (scripts/dev-notes.mjs) — the round's own file is the record */
  const d = entryText(376, ROOT);
  assert.ok(d, 'the round is written down');
  const body = d.slice(0, 9000);
  for (const n of ['not_rendered', 'not_painted_yet', 'engineFor', 'peek'])
    assert.ok(body.includes(n), 'the record names the mechanism: ' + n);
  assert.ok(/2,?236/.test(body), 'and the number of node checks that passed anyway');
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   #R455 ② — 「海面気圧と最大瞬間風速レイヤーはデフォルトでパーティクルをオンに。降水量（予報）レイヤーも
   パーティクルをオンできるように。(これもデフォルトでオン)。」 (formerly tests/r455-checks.test.mjs)
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
const WXS = read('js/weather.js');      /* (#R455 read it as a string; #R376's WX() reads it per call) */
const ACS = read('js/atlas-console.js');
const rd = read;
test('R455 ②a four layers can ask for the streaks, and ec-precip is one of them', () => {
  /* kept as a spelling: js/weather.js, js/map-readout.js and js/wx-ecmwf.js are built with the page (map, legend DOM, tile protocol); the catalogue text is what the planner is shown */
  assert.match(WXS, /const PARTS_KEYS=\{'ec-temp':'intmap_wx_temp_parts','ec-gust':'intmap_wx_gust_parts','ec-slp':'intmap_wx_slp_parts','ec-precip':'intmap_wx_precip_parts'\};/,
    'the table that decides which layers can ask');
  /* the box, the OR, the share link and the door all read PARTS_KEYS, so nothing else needs adding */
  assert.match(WXS, /function windPartsRow\(cfg\)\{\s*if\(!\(cfg\.id in PARTS_KEYS\)\) return '';/);
});

test('R455 ②b gusts, pressure and forecast precipitation start ON; temperature stays OFF', () => {
  /* kept as a spelling: js/weather.js, js/map-readout.js and js/wx-ecmwf.js are built with the page (map, legend DOM, tile protocol); the catalogue text is what the planner is shown */
  assert.match(WXS, /const PARTS_DEFAULT=\{'ec-temp':false,'ec-gust':true,'ec-slp':true,'ec-precip':true\};/,
    'the default is per layer, in one place');
});

test('R455 ②c a stored answer still wins both ways — the default only decides an ABSENT key', () => {
  /* kept as a spelling: js/weather.js, js/map-readout.js and js/wx-ecmwf.js are built with the page (map, legend DOM, tile protocol); the catalogue text is what the planner is shown */
  /* ⚠ a reader who UNTICKED a box must stay unticked. `!== '0'`-style reads treat 「never asked」 and
     「said no」 the same; this one does not. */
  assert.match(WXS, /let v=!!PARTS_DEFAULT\[id\];[\s\S]{0,140}?const s=localStorage\.getItem\(PARTS_KEYS\[id\]\); if\(s!=null\) v=\(s==='1'\);/,
    'missing → default, «1» → on, «0» → off');
});

test('R455 ②d Atlas can be asked for the streaks over the precipitation layer', () => {
  /* kept as a spelling: js/weather.js, js/map-readout.js and js/wx-ecmwf.js are built with the page (map, legend DOM, tile protocol); the catalogue text is what the planner is shown */
  assert.match(ACS, /\['ec-precip',\/precip\|降水/, 'the OVER table resolves 「降水量の上に」');
  assert.ok(ACS.includes('precipWindParticles:'), 'and the reply carries an inline toggle for it');
  assert.match(ACS, /window\._imWxParts\('ec-precip'\)/, 'which reads through the one door');
  /* ⚠ ORDER MATTERS: `ec-slp`'s pattern is tested first and 「precipitation」 must not fall into it */
  assert.ok(ACS.indexOf("['ec-slp',") < ACS.indexOf("['ec-precip',"), 'pressure is tested before precipitation');
});

test('R455 ②e the model’s own catalogue no longer says all three are off', () => {
  /* kept as a spelling: js/weather.js, js/map-readout.js and js/wx-ecmwf.js are built with the page (map, legend DOM, tile protocol); the catalogue text is what the planner is shown */
  const CT = rd('js/atlas-catalog-text.js');
  assert.ok(!CT.includes('all three are OFF by default'), 'the stale claim is gone');
  assert.ok(CT.includes('"over":"temperature" | "gusts" | "pressure" | "precipitation"'),
    'the fourth value is offered to the model');
  assert.match(CT, /ON by default/, 'and the defaults it states are the ones that ship');
});
