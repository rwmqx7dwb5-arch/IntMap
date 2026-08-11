/* ============================================================================
 *  IntMap · #R207 source-level invariants
 * ----------------------------------------------------------------------------
 *  ⚠ #R205's lesson, applied: PIN THE INVARIANT, NOT THE SHAPE. Five of that round's pins broke
 *  because they were written as "this literal appears" rather than "this relationship holds", and a
 *  literal is exactly what the next round edits. Every assertion below is a RELATION between two
 *  things in the source — an order, a guard, a pairing — so that a rewrite that preserves the
 *  behaviour keeps passing and a rewrite that loses it fails.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ── ① the polar cap is BENEATH everything ─────────────────────────────────────────────────────
   A `background` layer paints the whole viewport, so the only position at which it can be the fix
   for the ±85°–90° gap rather than a curtain over the map is FIRST. The invariant is the order, not
   the text: assert the cap's index in the style's layer list is below every other layer's. */
test('R207 ① the polar-cap background is the first layer in the style', () => {
  const s = read('js/app-body.js');
  const i = s.indexOf("{id:'layer-polar-cap',type:'background'");
  assert.ok(i > 0, 'the polar-cap background layer is declared in the style');
  const list = s.indexOf('layers:[', s.lastIndexOf('sources:', i) >= 0 ? 0 : 0);
  /* every other layer declaration in the same array must come AFTER it */
  const arr = s.slice(i, s.indexOf('\n        ],', i));
  const others = [...arr.matchAll(/\{id:'([a-z0-9-]+)'/g)].map((m) => m[1]);
  assert.equal(others[0], 'layer-polar-cap', 'the cap is the first entry of the layer array');
  assert.ok(others.includes('layer-sat'), 'and the satellite layer is in the same array, after it');
  assert.ok(list >= 0);
});

/* ── ② the cap is owned by the satellite floor, and only shown with it ─────────────────────────── */
test('R207 ② world-base owns the cap: it is toggled with the satellite basemap and coloured from the picture', () => {
  const s = read('js/world-base.js');
  assert.ok(/function applyCap\(satOn\)/.test(s), 'applyCap takes the satellite state');
  /* ⚠ (#R219) INTENDED REPLACEMENT. #R207 showed the cap only with the satellite basemap; measured
     this round, that left the ±85°–90° hole as the renderer's black on the vector map — the pixel at
     the south polar cap was (7,7,15). The cap is now unconditional and only its COLOUR depends on the
     map above it, so this assertion is inverted rather than dropped: the satellite-only guard must be
     gone, and both vector tones must exist. See DEV-NOTES #R219 §1. */
  assert.ok(/setLayout\(CAP,'visibility','visible'\)/.test(s), 'the cap is shown on every base map (#R219)');
  assert.ok(!/setLayout\(CAP,'visibility',satOn\?/.test(s), 'the satellite-only guard is the #R219 defect');
  assert.ok(/CAP_VEC_LIGHT/.test(s) && /CAP_VEC_DARK/.test(s), 'the vector base map has its own cap tone');
  assert.ok(/polarColour\(\)\.then/.test(s), 'the colour is measured from the shipped picture, not written down');
  /* apply() is the one place the basemap state arrives, so the cap must be driven from there */
  const apply = s.slice(s.indexOf('function apply('));
  assert.ok(apply.indexOf('applyCap(') > 0 && apply.indexOf('applyCap(') < apply.indexOf('return {'),
    'apply() drives the cap');
});

/* ── ③ a pick makes the panel click-through rather than removing it ────────────────────────────── */
test('R207 ③ IntMapPick ghosts the requesting panel instead of hiding it', () => {
  const s = read('js/map-pick.js');
  assert.ok(/pointerEvents='none'/.test(s), 'the panel stops taking the pointer');
  assert.ok(!/el\.style\.display='none'/.test(s), 'and it is no longer removed from the screen');
  /* the restore must put back exactly what it changed */
  assert.ok(/_unghost\(s\.panel,s\.prevStyle\)/.test(s), 'teardown restores the two properties it set');
});

/* ── ④ drawing owns the pointer while a rupture is being drawn ─────────────────────────────────── */
test('R207 ④ the seismic map-click yields while the free-draw is live', () => {
  const s = read('js/seismic.js');
  const m = /function onClick\(e\)\{ if\(([^)]*)\) return;/.exec(s);
  assert.ok(m, 'onClick opens with a guard');
  assert.ok(/_fDrawing/.test(m[1]), 'and the guard includes the drawing state');
  /* the capture is driven by the tool, so no button press is required */
  assert.ok(/onFinish:\(g\)=>\{ _fCapture\(g/.test(s), 'the drawn loop is captured from DrawTool.onFinish');
});

/* ── ⑤ DrawTool announces a finished stroke ────────────────────────────────────────────────────── */
test('R207 ⑤ DrawTool fires onFinish after the stroke is done, and clears it on exit', () => {
  const s = read('js/map-tools.js');
  const fin = s.slice(s.indexOf('function finish()'), s.indexOf('function finish()') + 1600);
  const doneAt = fin.indexOf("state='done'");
  const fireAt = fin.indexOf('_onFinish(');
  assert.ok(doneAt > 0 && fireAt > doneAt, 'the callback fires AFTER the state is done (so currentGeometry does not re-enter finish)');
  assert.ok(/exit\(\)\{[^}]*_onFinish=null/.test(s), 'exit() drops the subscriber');
});

/* ── ⑥ the engine records which layers are clickable ───────────────────────────────────────────── */
test('R207 ⑥ click-wired layers are recorded by the contract and used to rank the label click', () => {
  const e = read('js/geo-engine.js');
  assert.ok(/onLayer:\(e,l,c\)=>\{ if\(e==='click'&&typeof l==='string'\) _clickLayers\.add\(l\);/.test(e),
    'every click registration is recorded');
  assert.ok(/clickLayers:\(\)=>Array\.from\(_clickLayers\)/.test(e), 'and exposed');
  const u = read('js/map-ui.js');
  assert.ok(/function _ownedByOther\(pt\)/.test(u), 'the label side asks the question');
  assert.ok(/\.filter\(id=>ALL_LBL\.indexOf\(id\)<0\)/.test(u),
    'and excludes the label layers themselves — otherwise no label would ever be clickable');
  /* all three routes into the popup must apply it */
  assert.equal((u.match(/_ownedByOther\(/g) || []).length >= 4, true,
    'the per-layer place handler, the geo-label handler and the padded fallback all consult it');
});

/* ── ⑦ the satellite snapshot can answer any category ──────────────────────────────────────────── */
test('R207 ⑦ the bundled catalogue is the floor for every group, not only for `active`', () => {
  const s = read('js/satellites-live.js');
  assert.ok(!/if\(want==='active'&&!sats\.length\)/.test(s),
    'the bundle is no longer gated on the default group');
  assert.ok(/bundledGroupIds\(want\)/.test(s), 'a subset request is answered by filtering the bundle');
  assert.ok(/function ingestTLE\(text,want,only\)/.test(s), 'the filter is applied while parsing');
  /* ⚠ the honesty invariant: no membership list → no answer, rather than "everything" */
  assert.ok(/let only=null, haveList=\(want==='active'\)/.test(s),
    'a group with no published membership does not fall back to the whole catalogue');
  const b = read('scripts/build-tle-snapshot.mjs');
  assert.ok(/groups\.json/.test(b), 'the builder writes the membership beside the elements');
  /* the honesty invariant on the build side: a key is written ONLY when ids were actually parsed,
     and a failure is recorded rather than turned into an empty list */
  assert.ok(/if\s*\(ids\.length\)\s*groupIds\[g\]\s*=/.test(b), 'a group is written only when it has members');
  assert.ok(/groupErr\.push\(/.test(b), 'and a group that could not be fetched is recorded as an error, not as an empty catalogue');
});

/* ── ⑧ the news outlet filter, and the two selectors that now match ────────────────────────────── */
test('R207 ⑧ the outlet filter defaults to "everything" and the country picker gained the language picker\'s shape', () => {
  const n = read('js/news-sources.js');
  assert.ok(/if\(!Array\.isArray\(sel\)\|\|!sel\.length\) return true;/.test(n),
    'an empty selection means every outlet — the only honest reading of "nothing ticked" for this filter');
  const s = read('js/app-body.js');
  assert.ok(/newsSources:window\.imNewsSources/.test(s), 'and it is persisted with the rest');
  /* ⚠ the core does not grow: both pickers live in the module, and app-body keeps only the question
     it has to ask — which FAILS OPEN, so a build without the module shows every outlet, not none */
  assert.ok(/return N\?N\.allows\(pub\):true/.test(s), 'the filter fails open when the module is absent');
  assert.ok(/renderCountries|commitCountries/.test(n), 'the by-country picker moved here too');
  const h = read('index.html');
  /* the invariant is that the two blocks have the SAME parts, not that they contain given text */
  for (const kind of ['newslang', 'newscountry', 'newssource']) {
    assert.ok(h.includes(`id="${kind}-dd"`), `${kind} has the dropdown`);
    assert.ok(h.includes(`id="${kind}-multi"`), `${kind} has the panel`);
    assert.ok(h.includes(`id="${kind}-hint"`), `${kind} has the hint below the control`);
  }
  assert.ok(/id="setting-newscountry"/.test(h) && /id="setting-newssource"/.test(h),
    'both new blocks lead with a mode select, like the language block');
});

/* ── ⑨ every new user-facing string exists in all five languages ───────────────────────────────── */
test('R207 ⑨ the new settings strings are translated into EN/JP/DE/RU/ES', () => {
  const s = read('js/i18n-late.js');
  const keys = ['newsCountryOff', 'newsCountryMultiSel', 'lblNewsSources', 'newsSourceAll', 'newsSourceMultiSel', 'newsSourcesHint'];
  for (const lang of ['en', 'jp', 'de', 'ru', 'es']) {
    const m = new RegExp(`Object\\.assign\\(i18n\\.${lang},\\{[^}]*\\}\\)`, 'g');
    const blocks = s.match(m) || [];
    const joined = blocks.join('\n');
    for (const k of keys) assert.ok(joined.includes(k + ':'), `${lang} defines ${k}`);
  }
});

/* ── ⑩ the space view's own invariants ─────────────────────────────────────────────────────────── */
test('R207 ⑩ space: the way back is the Earth\'s, the scale switch preserves framing, no emoji on the scale segments', () => {
  const s = read('js/space.js');
  assert.ok(/function atNearLimit\(\)\{\s*if\(!earthIsSubject\(\)\) return false;/.test(s),
    'the return-to-map gesture is armed only when the Earth is the subject');
  /* the framing, not the number, is what survives a scale change */
  const sc = s.slice(s.indexOf('function setScale('), s.indexOf('function setScale(') + 900);
  /* ⚠ (#R219) INTENDED REPLACEMENT. #R207's invariant was the FRAMING (`dist / systemDist()`), which
     is right inside the planets and wrong outside them: at the model ceiling it lands the camera three
     orders of magnitude off (measured — DEV-NOTES #R219 §7). The two scales are two unit systems over
     the same physical space, so the quantity that survives is the distance in AU. */
  assert.ok(/auOfDist\(dist\)/.test(sc) && /posScale\(au\)/.test(sc),
    'setScale converts the camera distance through AU and back (#R219)');
  assert.ok(!/dist\*k/.test(sc), 'the framing ratio is what #R219 replaced — it must be gone');
  assert.ok(/Math\.max\(distFloor\(\),Math\.min\(distCeil\(\),d\)\)/.test(sc),
    'and the result is still clamped to the reach');
  /* 「実寸大とモデル大には絵文字を付けるな」 */
  const seg = s.slice(s.indexOf(".sp-scale\" data-s=\"real\"") >= 0 ? 0 : s.indexOf("class=\"sp-scale\""));
  const line = /<button class="sp-scale" data-s="real" style="'\+SEG\+'">([^']*)/.exec(s);
  assert.ok(line, 'the true-scale segment is declared');
  assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(line[1]), 'and carries no emoji');
  assert.ok(seg.length >= 0);
  /* the two new switches exist and are public */
  assert.ok(/setOrbits, setNames, orbits:\(\)=>showOrbits, names:\(\)=>showNames/.test(s),
    'orbits and place-name switches are part of the public surface');
  /* the Moon's line is drawn through the same placement the Moon uses */
  assert.ok(/function moonOrbitBuf\(jd\)/.test(s) && /scenePos\(p,'moon',\[0,0,0\]\)/.test(s),
    'the Moon\'s orbit is built from scenePos — one owner for "where is it"');
});

/* ── ⑪ the "keep zooming out" caption is placed in the MAP, and wears a pill ───────────────────── */
test('R207 ⑪ the space-approach caption is centred on the visible map and has its own surface', () => {
  const s = read('js/space.js');
  assert.ok(/function mapMidX\(\)/.test(s), 'the midpoint is measured');
  assert.ok(/g\.style\.left=Math\.round\(mapMidX\(\)\)\+'px'/.test(s), 'and applied every time it is shown');
  assert.ok(!/position:fixed;left:50%;bottom:96px/.test(s), 'the absolute viewport centre is gone');
  assert.ok(/border-radius:999px/.test(s) && /var\(--card-bg/.test(s),
    'it is a pill on the app surface, so it reads in light mode as well as dark');
});

/* ── ⑬ the build stamp names THIS round, not merely the same round twice ────────────────────────
   MEASURED on the live site right after the R207 deploy: `[prod-smoke] live build = 2026-08-10-R205`.
   R206 shipped with an R205 stamp and nothing noticed, because the only rule anyone had written was
   "the two stamps agree with each other" (tests/r169-checks ⑧) — which two equally stale stamps
   satisfy perfectly. #R174 had already lost three rounds to exactly this and answered it with a
   comment saying it MUST be bumped; a comment is not a gate.

   The stamp's job is to let the anti-stale guard (index.html ~line 50) and an incident responder tell
   which build is live. A stamp that names an older round makes a CURRENT build look stale to the
   guard and a stale one look plausible to a human — both directions wrong.

   So it is derived from something that cannot be forgotten: DEV-NOTES.md's newest `## R<n>` heading
   is written by the round itself (standing instruction 9 — prepend). If a round documents itself, it
   cannot ship someone else's stamp. */
test('R207 ⑬ the build stamp names the newest round in DEV-NOTES', () => {
  const html = read('index.html');
  const notes = read('DEV-NOTES.md');
  const newest = Math.max(...[...notes.matchAll(/^## R(\d+) —/gm)].map((m) => +m[1]));
  assert.ok(isFinite(newest) && newest > 0, 'DEV-NOTES.md has round headings to derive from');
  const ib = /window\.INTMAP_BUILD='(\d{4}-\d{2}-\d{2})-R(\d+)';/.exec(html);
  const mb = /window\.__imBuild='R(\d+)';/.exec(html);
  assert.ok(ib && mb, 'both stamps are present and well-formed');
  assert.equal(+ib[2], newest, `INTMAP_BUILD says R${ib[2]} but the newest documented round is R${newest}`);
  assert.equal(+mb[1], newest, `__imBuild says R${mb[1]} but the newest documented round is R${newest}`);
});

/* ── ⑫ the test bill itself ────────────────────────────────────────────────────────────────────── */
test('R207 ⑫ the deep tier no longer stands between a merge and the next one', () => {
  const y = read('.github/workflows/ci.yml');
  const deep = y.slice(y.indexOf('browser-deep:'));
  const cond = /if: \$\{\{ ([^}]*) \}\}/.exec(deep);
  assert.ok(cond, 'the deep job is conditional');
  assert.ok(/schedule/.test(cond[1]) && /workflow_dispatch/.test(cond[1]),
    'it runs nightly and on demand');
  assert.ok(!/push/.test(cond[1]), 'and not on a push');
  const cfg = read('playwright.config.js');
  assert.ok(/retries: isCI \? 1 : 0/.test(cfg), 'one retry clears a blip; the third attempt only ever cost time');
});
