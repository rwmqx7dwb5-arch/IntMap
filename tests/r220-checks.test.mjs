/* ============================================================================
 *  #R220 — source-level gates for the round's fixes.  `node --test`
 * ----------------------------------------------------------------------------
 *  One test per thing that was WRONG, written so it fails if the mechanism comes
 *  back rather than if a number moves (#R218's lesson: a test pinned to this
 *  round's own value fails in the next one).
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');

const NIGHT = rd('js/night-side.js');
const OCEAN = rd('js/ocean-currents.js');
const SEIS = rd('js/seismic.js');
const WORLD = rd('js/world-packs.js');
const SPACE = rd('js/space.js');
const FLIGHT = rd('js/flight-sim.js');
const CSS = rd('css/intmap.css');

/* ══ ① THE NIGHT SIDE BELONGS TO THE SATELLITE VIEW ═══════════════════════════════════════════ */

test('r220 ①a the day/night effect asks which basemap is up, and leaves when it is not satellite', () => {
  assert.match(NIGHT, /function satelliteUp\(\)/, 'there is a basemap test');
  assert.match(NIGHT, /getLayout\('layer-sat','visibility'\)==='visible'/,
    'and it is the same one js/app-body.js uses for the same question');
  const consider = NIGHT.slice(NIGHT.indexOf('function consider()'), NIGHT.indexOf('function wire()'));
  assert.match(consider, /if\(!satelliteUp\(\)\)\{\s*if\(built\)\s*destroy\(\);\s*return;\s*\}/,
    'leaving the satellite basemap REMOVES the layers rather than leaving them behind');
  assert.match(NIGHT, /events\.on\('styledata'/, 'and a basemap swap is a restyle, so it is subscribed to');
});

test('r220 ①b a build that cannot make the image unmakes itself', () => {
  const build = NIGHT.slice(NIGHT.indexOf('function build()'), NIGHT.indexOf('built=true;'));
  assert.match(build, /hasDynamicImage\(DYN\)\)\{[^}]*destroy\(\);\s*return false;/,
    'the polar cap is never left on the map without the gradient it continues');
});

/* ══ ② THE POLAR CAP — the black disc on the pole ════════════════════════════════════════════ */

test('r220 ②a the cap takes its nightness at the JOIN, so it starts where the image ends', () => {
  assert.match(NIGHT, /const CAP_JOIN=([\d.]+);/, 'the join latitude is stated');
  const join = Number(NIGHT.match(/const CAP_JOIN=([\d.]+);/)[1]);
  const lim = Number(NIGHT.match(/const LIM=([\d.]+);/)[1]);
  assert.ok(Math.abs(join - lim) < 0.05, `the cap samples the image's own edge (${join} vs ${lim})`);
  assert.match(NIGHT, /function joinLat\(sgn\)/, 'and it asks the renderer where the last image row is');
  assert.match(NIGHT, /nightAt\(S,\(l0\+l1\)\/2,sgn\*jl\)/,
    'the wedge takes the value AT THAT LATITUDE — a mid-cap sample is what drew a step onto a lit ice sheet');
});

test('r220 ②b the cap is painted in the image\'s own colour, not in a constant', () => {
  assert.match(NIGHT, /function capRGBHex\(sgn\)/, 'the cap reads the mosaic');
  assert.match(NIGHT, /'fill-color':\['to-color',\['get','c'\],UNLIT_HEX\]/,
    'the layer takes that colour per feature, falling back to UNLIT before the mosaic lands');
});

test('r220 ②c neighbouring wedges that agree are ONE polygon (a shared edge is drawn twice)', () => {
  assert.match(NIGHT, /const CAP_STEP=\d+;/, 'the nightness is quantised so runs can be found');
  assert.match(NIGHT, /while\(j\+1<CAP_WEDGES&&a\[j\+1\]===a\[k\]\)\s*j\+\+;/, 'and equal neighbours merge');
});

/* ══ ③ THE OCEAN-CURRENT PLATE — every mark is outlined ══════════════════════════════════════ */

test('r220 ③ every mark on the current plate has a casing under it', () => {
  for (const id of ["GLOW='oc-glow'", "CASE='oc-case'", "HEADC='oc-head-case'", "FLOWC='oc-flow-case'"])
    assert.ok(OCEAN.includes(id), `${id} exists`);
  assert.match(OCEAN, /const COL_CASE='rgba\(/, 'and they share one casing colour');
  /* the casing must not take part in collision, or it wins slots its own arrow loses */
  const flowc = OCEAN.slice(OCEAN.indexOf('layers.add({id:FLOWC'), OCEAN.indexOf('layers.add({id:FLOW,'));
  assert.match(flowc, /'icon-allow-overlap':true,'icon-ignore-placement':true/, 'the field casing ignores placement');
  /* ⚠ ONE list, read by the panel AND by every setVis — the first version of this round updated the
     panel and left `setVis([FLOW,LINE,HEAD,LBL])` behind, so every casing was built and never shown. */
  assert.match(OCEAN, /const ALL=\[FLOWC,FLOW,GLOW,CASE,LINE,HEADC,HEAD,LBL\];/, 'there is one list');
  assert.ok(OCEAN.includes('layers:()=>ALL.slice()'), 'the panel reads it');
  /* (#R222) a third `setVis(ALL, on)` lives in `drawFlow`, which is what re-shows the plate after the
     field is re-strided for a new view. The invariant is unchanged: every setVis names ALL. */
  assert.ok((OCEAN.match(/setVis\(ALL,/g) || []).length >= 2, 'and so does every setVis');
  assert.ok(!/setVis\(\[/.test(OCEAN.replace(/`setVis\(\[[^`]*`/g, '')), 'no setVis carries its own hand-written list');
  assert.ok(!/setVis\(\[FLOW,LINE,HEAD,LBL\]/.test(OCEAN.replace(/\/\*[\s\S]*?\*\//g, '')),
    'no partial list survives in the program (the note that records it may name it)');
});

/* ══ ④ WORDS ════════════════════════════════════════════════════════════════════════════════ */

test('r220 ④a the seismic idle hint is a label, not a state report', () => {
  /* the old sentences survive in the NOTE that records why they went; what must be gone is the
     string the panel prints — i.e. the one inside the L(...) call. */
  assert.ok(!SEIS.includes("','地図のクリックは通常どおりです"), 'the #R219 sentence is no longer printed');
  assert.ok(!SEIS.includes("','どちらも選択されていません"), '…and neither is the #R218 one');
  assert.match(SEIS, /'◎ で震源を配置、◇ で地点を追加します。'/, 'the Japanese says what the buttons do');
  /* all five languages, and none of them longer than a hint */
  const m = SEIS.match(/L\('◎ places the epicenter[^)]*\)/);
  assert.ok(m, 'the hint is one L(...) call');
  const parts = m[0].slice(3, -2).split("','");
  assert.equal(parts.length, 5, `five languages, got ${parts.length}`);
  for (const p of parts) assert.ok(p.length < 60, `short enough to be a hint (${p.length}): ${p}`);
});

test('r220 ④b the crop layer no longer announces the fetch', () => {
  /* the STRING may still appear in the note that records why it went; what must be gone is the CALL */
  assert.ok(!WORLD.includes("stat(L('Reading the FAO grid"), 'the status line is not printed any more');
  assert.ok(WORLD.includes('(#R220)'), 'and the round records where it was');
  assert.match(WORLD, /この作物・指標を GAEZ から取得できませんでした/, 'the FAILURE line stays — that is an answer');
});

/* ══ ⑤ THE TIDE LAYER SAYS WHICH POINT WAS CHOSEN ═══════════════════════════════════════════ */

test('r220 ⑤ the tapped tide point is a ring and a label, not another dot', () => {
  assert.ok(WORLD.includes("SEL='wp-tide-sel'") && WORLD.includes("SELLBL='wp-tide-sel-lbl'"), 'the two layers exist');
  const sel = WORLD.slice(WORLD.indexOf('layers.add({id:SEL,'), WORLD.indexOf('layers.add({id:LBL,'));
  assert.match(sel, /filter:\['==',\['get','kind'\],'probe'\]/, 'and they draw the PROBE, not the scan');
  assert.match(sel, /'circle-stroke-width':2\.4/, 'the ring has a stroke the eye can find');
  assert.match(WORLD, /function selLabel\(\)/, 'the label names the point');
  assert.match(WORLD, /setVis\(\[PT,SEL,LBL,SELLBL\],on\)/, 'and all four follow the layer switch');
  assert.match(WORLD, /at=\[lng,lat\]; busy=true;\s*\n\s*\/\*[\s\S]{0,240}?\*\/\s*\n\s*try\{ drawStations\(\); \}/,
    'the mark goes down on the tap, before the model answers');
});

/* ══ ⑥ THE SPACE VIEW ═══════════════════════════════════════════════════════════════════════ */

test('r220 ⑥a the distance ladder is a scale, and draws no circle', () => {
  const fn = SPACE.slice(SPACE.indexOf('function drawCosmos('), SPACE.indexOf('function drawBody('));
  assert.ok(!/C\.ring\(/.test(fn), 'no ring is built for a rung — a radius is not a path');
  assert.match(fn, /new Float32Array\(\[R,0,-t, R,0,t\]\)/, 'each rung is a tick across its own radius');
  assert.match(fn, /out\.push\(\{ name:C\.label/, 'and it still carries its published value');
});

test('r220 ⑥b the scene centres on whatever is selected, planet or not', () => {
  assert.match(SPACE, /function sceneCentre\(jd,pos\)/, 'there is one centre function');
  assert.equal((SPACE.match(/const centre=sceneCentre\(jd,pos\);/g) || []).length, 2,
    'and BOTH the draw path and the click hit-test use it');
  assert.match(SPACE, /function selScenePos\(jd\)/, 'a spacecraft/small body can be the centre');
  assert.match(SPACE, /if\(craftSel\|\|smallSel\) visitSel\(\);/, 'and selecting one goes there');
});

/* ══ ⑦ THE SKY — multiple scattering ═══════════════════════════════════════════════════════ */

test('r220 ⑦ the sky model adds multiple scattering, and it brightens twilight', async () => {
  const mod = await import('../js/sky-model.js');
  const { skyColour } = mod;
  const noon = skyColour(60, 0);
  const dusk = skyColour(-6, 0);
  assert.ok(Array.isArray(noon.rgb) && noon.rgb.every((v) => v >= 0 && v <= 255), 'a colour comes back');
  assert.ok(skyColour._ms, 'the multiple-scattering table was built and cached on the export');
  assert.equal(skyColour._ms.length, 16, 'one row per tabulated height');
  /* the blue hour is BLUE: after ozone (#R218) and multiple scattering, blue must lead at −6° */
  assert.ok(dusk.rgb[2] > dusk.rgb[0], `blue leads red at −6° (${dusk.rgb})`);
  assert.ok(dusk.rgb[2] > dusk.rgb[1], `…and green (${dusk.rgb})`);
  /* and the night side is not pure black — an isotropic floor is exactly what the term supplies */
  const night = skyColour(-14, 0);
  assert.ok(night.linear[2] > 0, `there is light after the Sun is well down (${night.linear})`);
  assert.ok(noon.rgb[2] > dusk.rgb[2], 'noon is still brighter than dusk');
});

/* ══ ⑧ THE FLIGHT DECK ON A PHONE ══════════════════════════════════════════════════════════ */

test('r220 ⑧ the action deck is behind one key on a phone, and that key can be seen', () => {
  assert.match(FLIGHT, /class="fs-deck-t"/, 'the key exists in the HUD');
  const base = FLIGHT.indexOf(".fs-deck-t{position:absolute;display:none");
  const on = FLIGHT.indexOf("#fs-hud .fs-deck-t{display:flex;}");
  assert.ok(base > 0 && on > 0, 'both rules exist');
  assert.ok(base < on, 'and the base rule comes FIRST — equal specificity is decided by order');
  assert.match(FLIGHT, /hud\.dataset\.deck=\(hud\.dataset\.deck==='1'\)\?'0':'1'/, 'the key toggles one piece of state');
  assert.match(FLIGHT, /fsAction\(b\.getAttribute\('data-act'\)\); hud\.dataset\.deck='0';/, 'and acting closes the sheet');
  /* nothing was removed: the same eight actions are still in the deck */
  const deck = FLIGHT.slice(FLIGHT.indexOf('<div class="fs-deck">'), FLIGHT.indexOf('<div class="fs-minimap">'));
  assert.equal((deck.match(/<button class="fs-act/g) || []).length, 8, 'eight buttons, as before');
});

/* ══ ⑨ THE SPACE VIEW ON A PHONE ═══════════════════════════════════════════════════════════ */

test('r220 ⑨ the phone\'s detail sheet is a handle, and hides nothing permanently', () => {
  assert.match(SPACE, /class="sp-sheet-t"/, 'the handle is in the HUD');
  assert.match(SPACE, /col\.classList\.add\('sp-min'\)/, 'and it starts collapsed on a phone');
  assert.match(CSS, /#space-view \.sp-sheet-t\{ display:none; \}/, 'a pointer machine never sees it');
  assert.match(CSS, /#space-view \.sp-col\.sp-min \.sp-info,\s*\n\s*#space-view \.sp-col\.sp-min \.sp-events\{ display:none !important; \}/,
    'collapsed hides the two panels and nothing else');
});
