/* ============================================================================
 *  IntMap · the forecast engine (js/wx-ecmwf.js) — the axis, the palettes, and a read that succeeded
 * ----------------------------------------------------------------------------
 *  予報の時間軸、配色表、帯域読み出し、読みの取り替え（supersession）。
 *
 *  ⚠ 主題単位へ統合した検査（旧ラウンド単位のファイルから、題名を保ったまま移した）。
 *    各節はブロックに包んであり、補助の名前は節ごとに閉じている（別ファイルだった頃と同じ隔離）。
 *    「綴りのまま:」の注記は、評価に置き換えられない検査がなぜそうなのかを 1 行で言う。
 * ==========================================================================*/
import test from 'node:test';
import { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { coldWxModel, until } from './helpers/wx-ecmwf-page.mjs';
import { assertUnreadIsTheHatch } from './wash-tier.mjs';
import { codeOnly } from '../scripts/code-only.mjs';

/* ⚠ (tests-by-topic) THE AXIS AND THE URLS, RUN. ① and ② below used to read js/wx-ecmwf.js for the
   spelling of `fileUrl`, `omUrl`, `validTimes: j.valid_times.slice()` and `nowIndex`. The shipped
   module is now built on the cold page (tests/helpers/wx-ecmwf-page.mjs — a stubbed browser and SDK,
   nothing else) and ASKED: which file does step i name, what does the om:// url carry, how many of the
   published steps can be reached. The page's globals are put back afterwards, so the order of the
   tests in this file does not matter. */
async function builtModel() {
  const saved = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch };
  const { ENG } = await coldWxModel({ sdkMs: 0, readMs: 0 });
  const M = ENG.model('ecmwf_wam025');
  await M.meta();
  const restore = () => { for (const k of Object.keys(saved)) { if (saved[k] === undefined) delete globalThis[k]; else globalThis[k] = saved[k]; } };
  return { M, restore };
}

/* (tests-by-topic) tests/helpers/wx-ecmwf-page.mjs `coldWxModel` installs a page as globalThis.window /
   document / fetch and leaves it there. When each round was its own file that ended with the process;
   here several rounds share one, so every test starts from the globals the file started with. */
const GLOBALS_AT_START = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch };
afterEach(() => {
  for (const [k, v] of Object.entries(GLOBALS_AT_START)) { if (v === undefined) delete globalThis[k]; else globalThis[k] = v; }
});

/* ════════ #R276 — from tests/r276-checks.test.mjs ════════ */
{
/* ============================================================================
 *  IntMap · #R276 source checks
 * ----------------------------------------------------------------------------
 *  「CAPE 不安定度（ECMWF）レイヤーの凡例名がECMWF気象になっている。また、凡例がない。説明もない。」
 *  「Wind(animated)はこんな感じで。色味も同一に合わせて。」
 *  「IntMapの気象レイヤーを抜本改善してください。」（12項目）
 *
 *  ⚠ EVERY ASSERTION HERE IS ABOUT A PROPERTY, NOT ABOUT A NUMBER OR A CALL SITE. Thirteen
 *  consecutive rounds have had a previous round's test pin a literal and turn a correct change into
 *  a false regression; this round fixed two more of them (tests/r154 #10, tests/r212 ⑬). So: the
 *  forecast axis is checked as «the valid time is in the file name», not as «109 steps»; the palette
 *  as «one table feeds both the tiles and the legend», not as a list of RGB triples.
 * ==========================================================================*/
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');
/* comments are prose ABOUT the code and must never satisfy an assertion about the code — the
   「自分の検査が自分のコメントに当たる」 shape this project has paid for thirteen times (#R274). */
const EC = () => codeOnly(read('js/wx-ecmwf.js'));
const WIND = () => codeOnly(read('js/wx-wind.js'));
const WX = () => codeOnly(read('js/weather.js'));
const DL = () => codeOnly(read('js/data-layers.js'));
const RO = () => codeOnly(read('js/map-readout.js'));

/* ══ ⚠⚠⚠ (#R664) THE TICKET MOVED, SO THIS CHECK STOPPED READING THE SOURCE ═══════════════════════
   Until #R664 the supersession rule below was asserted as a SPELLING — `var mine = ++seq`, `if
   (seq === mine)`. That round found the defect those spellings hid: the ticket was taken IN THE
   CALL while the join was made later, in the `ready()` continuation, so a second call for the SAME
   read superseded the read it was about to join and both callers were answered null (production:
   the first switch-on of the first weather layer of a page failed, three times out of three). The
   fix issues the ticket where the read is IDENTIFIED, and every one of those spellings changed
   while the property this check was written for did not. A check that pins a spelling can only
   prove that an implementation is still the one it was written against (#R488), so the property is
   MEASURED against the shipped module from here on.
   ⚠ The page it is measured on is tests/helpers/wx-ecmwf-page.mjs — ONE page, shared by the six
   files that need it, because six copies of one judgement is the shape
   .agents/rules/no-ad-hoc-hardcoding.md §2-3 forbids. The browser and the Open-Meteo SDK are
   stubbed there; nothing else is — the rule under test is the one that ships. */


/* ── ① the forecast hour is in the FILE NAME, because nothing else carries it ──────────────────
   MEASURED before the fix, in the browser, against the shipped SDK:
     normalizeUrl('…latest.json?variable=temperature_2m&time=2026-08-21T00:00Z')
       → '…/2026/08/20/0600Z/2026-08-20T0600.om?variable=temperature_2m'
   `time=` is ignored, and `DATA_RELEVANT_PARAMS` (the SDK's cache key) is ['variable'] — so two
   different hours share one cached state even if the URL differs. Building the .om path here is
   the only thing that makes a forecast hour real. */
test('R276 ① the ECMWF tile URL names the valid time, and no layer hands the SDK a .json', async () => {
  const { M, restore } = await builtModel();
  try {
    const run = new Date(M.referenceTime() + (/Z$/.test(M.referenceTime()) ? '' : 'Z'));
    const p2 = (n) => String(n).padStart(2, '0');
    const runDir = run.getUTCFullYear() + '/' + p2(run.getUTCMonth() + 1) + '/' + p2(run.getUTCDate()) + '/' + p2(run.getUTCHours()) + '00Z/';
    assert.ok(M.count() >= 3, 'the page publishes an axis to walk');
    for (let i = 0; i < M.count(); i++) {
      const t = new Date(M.validTime(i) + 'Z');
      const want = runDir + t.getUTCFullYear() + '-' + p2(t.getUTCMonth() + 1) + '-' + p2(t.getUTCDate()) + 'T' + p2(t.getUTCHours()) + '00.om';
      assert.ok(M.fileUrl(i).endsWith('/' + want),
        `step ${i} names its own file — under the model run hour, named for the valid hour: ${M.fileUrl(i)}`);
    }
    assert.notEqual(M.fileUrl(0), M.fileUrl(M.count() - 1), 'two steps are two files — the file name is what carries the hour');
    M.setIndex(1, { quiet: true, now: true });
    assert.equal(M.omUrl('wave_height'), 'om://' + M.fileUrl(1) + '?variable=wave_height',
      'every om:// URL starts from the file of the CHOSEN step');
    for (const u of [M.omUrl('wave_height'), M.omRasterUrl('wave_height')]) {
      assert.ok(!/latest\.json/.test(u), 'no om:// URL may contain latest.json');
      assert.ok(!/[&?]time=/.test(u), 'and nothing passes the ignored &time=');
    }
  } finally { restore(); }
  /* 綴りのまま: js/weather.js の側は地図とDOMの中で url を組むので、ここでは不在だけを確かめる */
  assert.ok(!/om:\/\/[^'"`]*latest\.json/.test(WX()), 'no om:// URL in the weather layers may contain latest.json');
  assert.ok(!/[&?]time=/.test(WX().replace(/validTime/g, '')), 'and nothing passes the ignored &time=');
});

/* ── ② nothing filters the future out of the axis ─────────────────────────────────────────────
   MEASURED before the fix: the slider offered 8 steps of the 109 the feed publishes, because
   fetchMeta cut valid_times at now + 1 h. */
test('R276 ② every published forecast step is reachable, and the axis is a player', async () => {
  const { M, restore } = await builtModel();
  try {
    const times = M.times();
    assert.equal(times.length, M.count(), 'the axis is the feed\'s own list');
    assert.equal(times.length, 4, 'all four steps the page published are reachable — nothing filtered them');
    assert.ok(Date.parse(times[times.length - 1] + 'Z') > Date.now(), 'including the ones after now');
    for (const fn of ['play', 'pause', 'step', 'setIndex']) assert.equal(typeof M[fn], 'function', 'the axis carries ' + fn);
    const near = (ms) => times.reduce((b, t, i) => (Math.abs(Date.parse(t + 'Z') - ms) < Math.abs(Date.parse(times[b] + 'Z') - ms) ? i : b), 0);
    assert.equal(M.nowIndex(), near(Date.now()), 'and knows where "now" is');
    M.setIndex(3, { quiet: true, now: true });
    assert.equal(M.index(), 3, 'a future step can be stood on');
  } finally { restore(); }
  /* a new model run must not move the reader by the same INDEX — index 6 of 06Z and of 12Z are six
     hours apart. The instant is what is preserved.
     綴りのまま: 新しい run の到着は 2 回目の latest.json を要し、この頁の stub は 1 回分しか持たない */
  assert.match(EC(), /idx = _prevValid \? nearestTo\(tms\(_prevValid\)\) : nowIndex\(\)/,
    'a new run keeps the same wall-clock instant, not the same index');
});

/* ── ③ the colour surface, the particles and the point value are ONE array ────────────────────
   MEASURED before the fix: the animated wind was 2,232 Open-Meteo point requests in five chunks,
   with an 8° / 855-point fallback that usually won. */
/* 綴りのまま: 対象は js/weather.js の closure（凡例の DOM と地図の source / layer）の中で、ブラウザの外では走らない */
test('R276 ③ the wind field is the model\'s own data, sampled directly', () => {
  const w = WX();
  assert.match(w, /const VAR='wind_u_component_10m';/, 'the layer names a MODEL VARIABLE…');
  /* ⚠ (#R288) …and it names the LATITUDE BAND it is drawn in. Same variable, same model, same
     samples; what the third argument removes is the part of the planet that is not on the screen
     (measured: 6,599,680 samples / 17.96 MB global against 935,400 / 1.64 MB for a 21° band). */
  /* ⚠ (#R297) the band is CHOSEN before the read: the first read is the band around the view
     (`bandNear`) and the full band the view covers is read behind it and replaces it — `bandFor`
     answers 「the planet」 at the opening view, and that was 14.5 s before anything moved.
     What #R276 pinned is unchanged — ONE variable, ONE read, for a BAND rather than a lattice. */
  assert.match(w, /return EC\(\)\.load\(VAR,null,b\);/, '…loads it once, for a band…');
  assert.match(w, /if\(!EC\(\)\.bandCovers\(EC\(\)\.heldBand\(VAR\),b\)\) b=nearBand\(\)\|\|b;/,
    '…the band around the view first…');
  /* ⚠ (#R305) the widening read carries a fourth argument now — it is the SAME read down the SAME
     one reader, marked as 「this module started it, not the reader」 so it yields its place in the
     queue. What #R276 pinned — 「the whole view is read behind the band」 — is the relation. */
  assert.match(w, /EC\(\)\.load\(VAR,null,want(,true)?\)/, '…and the whole view behind it');
  /* ⚠ (#R293) the sampler is named on its own line now, because the READOUT keeps the last one that
     answered (`sampler()` is null between a step and the new hour — measured 0 → 2,144 ms). What
     #R276 pinned is unchanged: the particles are handed the sampler of the SAME variable this
     module loaded, not a second source of numbers. */
  assert.match(w, /const sf=EC\(\)\.sampler\(VAR\);[\s\S]{0,120}renderer\.setField\(sf\);/,
    '…and hands THAT to the particles');
  /* ⚠ (#R325) THE RULE IS 「the same variable」, NOT the name of the function that spells the url.
     The raster sources now ask for `omRasterUrl`, which is `omUrl` plus `tile_size` — the vector
     sources (isobars, wind arrows) still use `omUrl`, because for an MVT that parameter is the
     layer extent rather than a pixel count. Both carry `VAR`, which is what #R276 pinned. */
  assert.match(w, /url=EC\(\)\.omR?a?s?t?e?r?Url\(VAR\)/, 'while the colour raster is the same variable');
  /* the sampler reads the decoded field itself — no lattice, no resample, no point API */
  const s = EC();
  assert.match(s, /uv: function \(lat, lon, out\)/, 'the sampler answers u,v …');
  assert.match(s, /var sp = _lin\(g, d\.values, lat, lon\);/, '…from the field\'s own speed…');
  assert.match(s, /var dir = _near\(g, d\.directions, lat, lon\)/, '…and its own bearing');
  /* ⚠ a bearing is an angle: linear interpolation across the 0/360 seam blows the wind backwards */
  assert.ok(!/_lin\(g, d\.directions/.test(s), 'the bearing must not be linearly interpolated');
});

/* ── ④ one alpha, and the weather is not under the terminator ─────────────────────────────────
   MEASURED before the fix, flat, z3, 150°E 20°N at 23:00 local: the LUT asks for rgb(40,130,180)
   and the pixel was rgb(15,43,64) — 0.36×. Two of the three multipliers were the ones the report
   names; the third was `im-night-shade`, which sat ABOVE the field because `firstSymbolId()`
   returns the first symbol layer in the style and that is a GRATICULE LABEL. */
/* 綴りのまま: 対象は js/weather.js の closure（凡例の DOM と地図の source / layer）の中で、ブラウザの外では走らない */
test('R276 ④ the weather sits above the day/night shading, and one slider is the only multiplier', () => {
  const s = EC();
  assert.match(s, /function before\(\) \{[\s\S]{0,400}?indexOf\('im-night'\) === 0\) last = i;/,
    'the anchor is the layer after the night stack');
  assert.match(s, /function lift\(layerId\) \{[\s\S]{0,500}?layers\.move\(layerId, before\(\)\)/,
    'and it is re-asserted, because js/night-side.js re-adds its own layers on a timer');
  const w = WX();
  assert.match(w, /GE\(\)\.events\.on\('idle',\(\)=>\{ if\(!on\) return; SLOT\.forEach\(s=>\{ try\{ EC\(\)\.lift\(s\.lyr\)/,
    'the wind field re-asserts its place every idle');
  /* (#R284) the ids are a layer's CURRENT slot now (two slots per layer, so a forecast step never
     shows an empty map) — `curIds(cfg)` is the same set of layers, named through the swap. */
  /* ⚠ (#R439) the return value is READ now — a `lift` that actually moved something is the only
     thing that may trigger the sub-layer re-stack, because moving a layer makes the map draw and a
     draw ends in another `idle`. The claim here is unchanged: every ECMWF layer re-asserts its
     place above the shading on every idle. */
  assert.match(w, /activeLayers\(\)\.forEach\(cfg=>curIds\(cfg\)\.forEach\(l=>\{ try\{ if\(EC\(cfg\)\.lift\(l\)\)/,
    '…and so does every ECMWF raster');
  /* the slider is applied ONCE, and its default is 1 */
  assert.match(DL(), /else if\(id==='wind'\)\{ try\{ window\.Wind&&window\.Wind\.setOpacity&&window\.Wind\.setOpacity\(v\); \}catch\(_\)\{\} \}/,
    'the wind opacity slider passes the reader\'s number through unmultiplied');
  assert.match(DL(), /wind:1,/, 'and its default is fully opaque');
});

/* ── ⑤ the legend is built from the renderer's own table ──────────────────────────────────────
   「凡例がない。説明もない。」 and 「凡例の最大値と実際のLUTも一致させる」: the wind legend said
   40 m/s beside a ramp that runs to 60. A legend that is DERIVED cannot disagree. */
/* 綴りのまま: 対象は js/weather.js の closure（凡例の DOM と地図の source / layer）の中で、ブラウザの外では走らない */
test('R276 ⑤ every ECMWF legend reads the colour scale the tiles were drawn with', () => {
  const s = EC();
  /* ⚠⚠ (#R398) THE SPELLING MOVED AND THE REQUIREMENT DID NOT — the same shape ⑥ below records for
     the model name. `scale()` used to resolve against `settings.colorScales`, which was at once the
     reader's ramp and the renderer's. There are two views of one ramp now, because `pressure_msl`
     arrives in PASCALS while its ramp is written in hPa (js/wx-ecmwf.js `FIELD_UNITS`): the
     renderer is handed the ramp in the FIELD's numbers — that is what makes the raster a pressure
     field instead of a flat sheet, and what puts the isobar levels where the isobars are — and the
     key keeps the reader's. So this asks for the reader's view BY NAME, and then asks the thing
     that keeps the bar where ⑤ put it: the two views are THE SAME OBJECT everywhere the
     declaration does not name a variable. A legend can still not disagree with its own picture;
     what it may now do is say the same thing in the unit the reader was promised. */
  assert.match(s, /sdk\.getColorScale\(variable, !!dark, displayScales\)/,
    'the scale comes from the SDK, through the settings the protocol was registered with');
  assert.match(s, /displayScales = scales;\s*var painted = Object\.assign\(\{\}, scales\);\s*Object\.keys\(FIELD_UNITS\)\.forEach\(function \(v\) \{ var s = inFieldUnits\(v, scales\); if \(s\) painted\[v\] = s; \}\);/,
    '…and the renderer\'s copy of it diverges ONLY for the variables the declaration names');
  assert.match(s, /function legend\(variable, dark\) \{[\s\S]{0,900}?stops\.push\(\{ v: bp\[i\]/,
    'the legend is the scale, turned into stops');
  const w = WX();
  assert.match(w, /const lg=EC\(cfg\)\.legend\(cfg\.variable,dark\);/, 'each layer bar reads its own variable');
  assert.match(w, /const ticks=\[0,0\.25,0\.5,0\.75,1\]\.map/, 'with numeric ticks…');
  assert.match(w, /const u=unitOf\(cfg\.kind,lg\.unit\);/, '…and the scale\'s own unit');
  assert.match(w, /\bdesc:LA\(/, 'and every layer carries a description');
  /* the layer's own NAME, not the panel's — 「凡例名がECMWF気象になっている」
     ⚠ (#R284) …and the name is now the BOX's `<h4>`, because the panel that carried the family name
     is gone: every ECMWF layer has its own legend box. Titling a bar inside a shared box was the
     half-answer; this is the whole one. */
  assert.match(w, /function renderOne\(cfg\)\{[\s\S]{0,400}?<h4>'\+ecLbl\(cfg\)\+'<\/h4>/,
    'the legend is titled with the layer, not with the panel');
  assert.ok(!/data-legend-ecmwf/.test(w), 'and there is no one box holding all of them');
  assert.ok(!/40\*window\.windUnitFactor/.test(DL()), 'the hand-written 40 m/s maximum is gone');
});

/* ── ⑥ the model is named correctly, everywhere ───────────────────────────────────────────────*/
/* 綴りのまま: 主張が配線・不在・一意性（どこが何を呼ぶか／無いこと／1 か所だけ）で、評価して取り出せる値が無い */
test('R276 ⑥ nothing calls this GFS, and an unspecified model is Best match', () => {
  const all = WX() + DL() + EC();
  assert.ok(!/Open-Meteo GFS/.test(all), 'the "Open-Meteo GFS" label is gone');
  assert.ok(!/GFS/.test(EC() + WIND()), 'and the model modules do not mention GFS at all');
  /* ⚠ (#R356) THE NAME MOVED, THE REQUIREMENT DID NOT. This used to read `MODEL: 'ECMWF IFS HRES'`
     out of js/wx-ecmwf.js, because that file WAS the model. It is the multi-model engine now and
     takes the name from the row js/wx-models.js holds — so the check follows the answer rather
     than lowering the bar: the registry must still name this model, and the engine must still take
     the name from there rather than carrying a second copy of it.
     ⚠ AND «nothing calls this GFS» IS NOW A SHARPER CLAIM, not a weaker one. GFS is a real model
     the reader can choose (`ncep_gfs013`); what must never happen is the ECMWF field wearing its
     label. That is guaranteed by the name being one field of the row the instance was built from. */
  const MDL = read('js/wx-models.js');
  assert.match(MDL, /id: 'ecmwf_ifs',\s*nameKey: 'ECMWF IFS HRES'/, 'the registry names this model');
  assert.match(EC(), /MODEL: cfg\.nameKey/, 'and the instance reports the name its own row carries');
  assert.ok(!/'ECMWF IFS HRES'/.test(codeOnly(EC())),
    'js/wx-ecmwf.js does not hold a second copy of the name');
  assert.match(WX(), /'Open-Meteo · '\+\(\(!m\|\|m==='best_match'\)\?'Best match':m\)/,
    'an unspecified Open-Meteo model is reported as Best match');
  assert.match(codeOnly(read('js/wx-source.js')), /if \(!j\.model\) j\.model = 'best_match';/,
    'and the client stamps which model answered');
});

/* ── ⑦ layers are declared against the variables the feed really publishes ────────────────────
   MEASURED: `latest.json`'s variables list (35 names) has no sea_surface_temperature, so ec-sst
   asked the reader for a child that does not exist and drew nothing for nine rounds. */
/* 綴りのまま: 対象は js/weather.js の closure（凡例の DOM と地図の source / layer）の中で、ブラウザの外では走らない */
test('R276 ⑦ a variable the feed does not publish cannot leave a dead row behind', () => {
  const w = WX();
  assert.ok(!/sea_surface_temperature/.test(w), 'the layer that asked for a missing variable is gone');
  assert.match(w, /\{id:'ec-gust',\s*variable:'wind_gusts_10m'/, 'and its row went to one that exists');
  /* ⚠⚠ (#R356) 「THE FEED」 IS MORE THAN ONE FEED NOW, AND THE CLAIM GOT BIGGER RATHER THAN SMALLER.
     This read 「if the ONE model does not publish it, delete the row」. With a model per layer that
     rule would delete a row the reader can still draw: a field ECMWF drops but ICON still publishes
     is a choice, not a dead row, and removing it would take the choice away without saying so.
     ⚠ THE DEFECT THIS TEST EXISTS FOR IS UNCHANGED AND STILL CAUGHT. `sea_surface_temperature` is
     in NONE of the offered models, so it still meets the deletion condition. What is new is that
     「dead」 now means 「no model on offer has it」 — and because a row can survive that a given model
     cannot draw, the OTHER half has to be asserted too, or a reader could pick a model and get an
     empty map. Both halves, on their own lines: */
  assert.match(w, /function pruneMissing\(\)\{[\s\S]{0,600}?if\(metas\.some\(i=>i\.has\(l\.variable\)\)\) return;/,
    'rows are checked against every model that has answered…');
  assert.match(w, /if\(!metas\.length\) metas\.push\(E\);/,
    '…and a model that has NOT answered is not evidence of absence, so it never causes a deletion');
  assert.match(w, /const row=document\.getElementById\('lyrrow-'\+l\.id\); if\(row\) row\.remove\(\);/,
    '…and a variable that disappears from all of them takes its row with it');
  /* the second half: the row survives, but the model that cannot draw it is refused — twice, in the
     picker (so it cannot be chosen) and in setModel (so it cannot be restored from a link either) */
  assert.match(w, /const a=availFor\(cfg,m\.id\), off=\(a\.ok===false&&a\.code!=='no_metadata'\);/,
    'the picker disables a model that cannot draw this layer…');
  assert.match(w, /\+\(off\?' disabled':''\)/, '…in the option itself…');
  /* ⚠⚠ (#R356) THIS ASSERTION PINNED ITS OWN ROUND'S DRAFT AND WAS WRONG BY ONE `return`. It was
     written while `setModel` returned a boolean, and the shipped `setModel` returns a PROMISE that
     resolves with `{ok, code}` — because Atlas must not report a model change until the map has
     actually painted it. So the literal ended `return; }` and the code ends `return {ok:false,…}`.
     The eleventh time this project has had a check hit its own code; the answer is the same one it
     always is — assert the RELATION, not the punctuation. */
  assert.match(w, /if\(!a\.ok\)\{ back\(\);[\s\S]{0,200}?satToast\(name\+' — '\+whyNot\(a\.code\)\);/,
    '…and setModel refuses it with the reason, rather than switching to an empty map');
  assert.match(w, /return \{ok:false,code:a\.code,/,
    '…and says WHICH reason, so a caller can repeat it instead of inventing one');
});

/* ── ⑧ one time control per view, and no duplicate ids ────────────────────────────────────────
   MEASURED before the fix: opening the ECMWF panel put a SECOND #ec-time and #ec-validtime in the
   document (2 and 2). */
/* 綴りのまま: 対象は js/weather.js の closure（凡例の DOM と地図の source / layer）の中で、ブラウザの外では走らない */
test('R276 ⑧ the two forecast players are two views of one state, with different ids', () => {
  const w = WX();
  /* ⚠ (#R290) THE IDS ARE BUILT, NOT WRITTEN. Every weather legend has its own discrete time
     control again (「個別の時間選択UIを使え」), and the ECMWF ones are named after their layer —
     `ec-time-ec-temp`, `ec-time-ec-cape`, … — so counting literal ids cannot be the instrument any
     more. The PROPERTY it protects is stated directly instead: there is exactly ONE builder for
     that control and exactly one wirer, so two views of one clock cannot become two clocks. */
  const ids = (w.match(/id="(ec-time|ec-validtime|wind-time|wind-validtime)"/g) || []).sort();
  assert.deepEqual(ids, ['id="wind-validtime"'], 'no control id is written twice as a literal');
  assert.equal((w.match(/function _timeUI\(/g) || []).length, 1, 'ONE builder for the time control');
  assert.equal((w.match(/function _wireTimeUI\(/g) || []).length, 1, 'ONE wirer for it');
  assert.match(w, /window\.IntMapWxPlayer\.timeUI\('wind-time',E,L\)/, 'the wind legend uses it');
  assert.match(w, /window\.IntMapWxPlayer\.timeUI\('ec-time-'\+cfg\.id,EC\(cfg\),L\)/,
    'and so does every ECMWF legend, under its own layer id');
  assert.match(w, /<select class="ecl-timesel"/,
    'and it is a <select>, so only a time the model publishes can be chosen');
  /* ⚠ (#R293) 「また、タイムスライダーをつけろ」 — and the range does not weaken that claim: it steps
     over the model's own INDEX with step=1, so every position it can occupy is a published valid
     time, and the <select> beside it names the one it is standing on. */
  assert.match(w, /<input type="range" class="ecl-timerange"[\s\S]{0,120}step="1"/,
    'the slider steps over the index, so no reachable position lacks data');
  assert.match(w, /min="0" max="'\+Math\.max\(0,n-1\)\+'"/, '…over exactly the published steps');
  assert.ok(!/function buildPanel\(\)|panel\.className='tool-panel'/.test(w),
    'the second ECMWF panel — the one that duplicated them — is gone');
  /* ⚠ (#R439) `legendLayers()`, NOT `activeLayers()`. 「等圧線レイヤーを取り込み」 made the isobars a
     SUB-LAYER: still in `activeLayers` — the two-slot swap, applyTime and commit all still run on
     it — but with no legend box of its own, because its switch lives inside the pressure legend.
     What this line is about is unchanged: open() SHOWS the one legend rather than building a rival. */
  assert.match(w, /return \{ open\(\)\{ if\(!anyOn\(\)\) return; legendLayers\(\)\.forEach\(l=>\{ boxFor\(l\)\.style\.display='block'; \}\); renderLegend\(\); \}/,
    'open() shows the one legend instead of building a rival');
  /* both players drive the SAME module */
  assert.match(w, /if\(sel\) sel\.onchange=\(\)=>\{ E\.pause\(\); E\.setIndex\(\+sel\.value,\{now:true\}\);/,
    'the one control writes the axis…');   /* (#R293) …and keeps the slider beside it in step */
  /* ⚠ (#R293) …and the other view no longer writes the MODEL's index at all. 「時刻と予報タブを
     分けるな」 merged the forecast tab into 「時刻」, and both halves of that tab now write the ONE
     thing — the master clock — which js/wx-ecmwf.js follows. Two views of one state, still. */
  assert.match(codeOnly(read('js/news-timeline.js')),
    /function fcGo\(i\)\{[\s\S]{0,200}window\.IntMapTime\.set\(new Date\(t\),\{allowFuture:true,source:'ui'\}\);/,
    '…and the shared one moves the clock, which the model follows');
});

/* ── ⑨ the number under the cursor belongs to the picture under the cursor ────────────────────
   MEASURED before the fix: with the NASA `temp` layer on (MERRA-2 monthly mean, for a date the
   reader chooses) the readout fetched api.open-meteo.com's CURRENT temperature and printed that. */
/* 綴りのまま: 対象は DOM・地図（MapLibre / WebGL）に触れる closure の中で、ブラウザの外では走らない（実ブラウザ側は spec が持つ） */
test('R276 ⑨ the readout answers from the displayed layer, or says which dataset it cannot answer for', () => {
  const s = RO();
  assert.match(s, /const v=EC\.valueNow\(cfg\.variable,lat,lng\);/,
    'an ECMWF raster answers from its own decoded field');
  assert.match(s, /\{ const ec=ecmwfReadout\(lng,lat\); if\(ec\)\{ HOST\.lastLayerVal=ec; return; \} \}/,
    '…and it is asked first');
  assert.match(s, /out\+' · '\+EC\.fmt\(EC\.validTime\(\)/, 'the valid time travels with the number');
  /* the prohibition, checked as an absence */
  assert.ok(!/api\.open-meteo\.com\/v1\/forecast/.test(s), 'the readout opens no live weather request at all');
  assert.ok(!/marine-api\.open-meteo\.com/.test(s), '…including the marine one');
  /* the elevation lookup it DOES make is a different question, and it goes through the guard */
  assert.match(s, /window\.IntMapWx\.guardedJSON\(`https:\/\/api\.open-meteo\.com\/v1\/elevation/,
    'the elevation reading is guarded, cached and de-duplicated like everything else');
  assert.match(s, /const name=_GIBS_WHEN\[lyr\]\?_GIBS_WHEN\[lyr\]\(\):lyr;/,
    'a GIBS raster names its dataset…');
  assert.match(s, /HOST\.lastLayerVal=name\+\(when\?\(' · '\+when\):''\);/, '…and the date it is showing');
});

/* ── ⑩ the radar is a loop and the dead half of RainViewer is gone ────────────────────────────
   MEASURED live: radar.past = 13 frames (10 min apart, two hours); satellite.infrared = 0 frames;
   colour schemes 0/2/3/6/7/8 and 1/4/5/9 return byte-identical tiles. */
/* 綴りのまま: 対象は DOM・地図（MapLibre / WebGL）に触れる closure の中で、ブラウザの外では走らない（実ブラウザ側は spec が持つ） */
test('R276 ⑩ RainViewer animates its past frames, and its retired satellite product is not used', () => {
  const s = DL();
  assert.match(s, /_rvFrames=\(r\.past\|\|\[\]\)\.concat\(r\.nowcast\|\|\[\]\)/, 'every available frame is a frame');
  assert.ok(!/satellite&&_rvData\.satellite\.infrared|satellite\.infrared/.test(s),
    'nothing reads the retired satellite.infrared');
  assert.match(s, /window\._rvPlayer=\{ show:rvShow, step:rvStep, play:rvSetPlay/, 'the loop has a player');
  assert.match(s, /const mins=Math\.round\(\(Date\.now\(\)-tt\)\/60000\);/, 'the frame states its age…');
  assert.match(s, /cap\.textContent=clock\+' · '\+rel\+' · '\+\(_rvIdx\+1\)\+'\/'\+n;/, '…its clock and its place in the loop');
  /* stepping re-points the tiles instead of rebuilding the source, so a step cross-fades */
  assert.match(s, /GE\(\)\.layers\.setSourceTiles\('src-radar',tiles\)/, 'a step re-points the source');
  /* the scheme number is named for what the free tier actually returns */
  assert.match(s, /const RV_SCHEME=4;/, 'the palette is a named constant, not a magic number in a URL');
  /* ⚠ (#R289) THE THREE CLOUD ASSERTIONS ARE GONE BECAUSE THE LAYER IS — 「雲・赤外（実時間）」 was
     deleted by name this round, so IR_SATS, the row and cloudsLegendHint no longer exist and a check
     for them would call a requested deletion a regression. What #R276 was really measuring here — the
     RainViewer player above — is untouched, and js/data-layers.js must now name none of it. */
  assert.ok(!/IR_SATS|cloudsLegendHint|setCloudsVis|_setCloudsOpacity/.test(s), 'the deleted IR-clouds layer left something behind');
});

/* ── ⑪ nothing bypasses the one guarded weather client ────────────────────────────────────────*/
/* 綴りのまま: 主張が配線・不在・一意性（どこが何を呼ぶか／無いこと／1 か所だけ）で、評価して取り出せる値が無い */
test('R276 ⑪ every Open-Meteo request goes through IntMapWx', () => {
  const files = ['js/weather.js', 'js/wx-ecmwf.js', 'js/wx-wind.js', 'js/map-ui.js', 'js/map-readout.js',
    'js/app-body.js', 'js/widgets.js', 'js/layer-previews.js', 'js/sims.js', 'js/flight-sim.js',
    'js/world-packs.js', 'js/search-geocode.js', 'js/drone-ops.js', 'js/atlas-console.js',
    /* (#R452) Atlas's shared loader moved out of the console (that file is under a shrink-only line
       ceiling), so the file this rule has to read moved with it. */
    'js/atlas-deadlines.js'];
  const bad = [];
  for (const f of files) {
    const s = codeOnly(read(f));
    /* a raw fetch of an Open-Meteo DATA host (geocoding is a different product and a different
       quota, and its call sites carry an AbortController the guarded client does not model) */
    const re = /fetch\(\s*[`'"]https:\/\/(api|marine-api|air-quality-api|archive-api)\.open-meteo\.com/g;
    if (re.test(s)) bad.push(f);
  }
  assert.deepEqual(bad, [], 'these files still fetch Open-Meteo directly');
  assert.match(codeOnly(read('js/wx-source.js')), /isOpenMeteo: isOpenMeteo,/,
    'the guard publishes the host test so callers can route by it');
  /* ⚠ (#R452) THE PROPERTY IS 「ATLAS'S SHARED LOADER ROUTES OPEN-METEO THROUGH THE GUARD」, and the
     file that holds that loader is not the property. `_fetchJSON` moved to js/atlas-deadlines.js
     this round; pinning js/atlas-console.js would have gone red on a move that changed nothing
     about what the rule protects — the #R429 shape, one round later. */
  for (const f of ['js/sims.js', 'js/atlas-deadlines.js'])
    assert.match(codeOnly(read(f)), /window\.IntMapWx\.isOpenMeteo\(url\)\) return await window\.IntMapWx\.guardedJSON\(url,\s*\d+(?:,\s*\{[^}]*\})?\)/,   /* (fetch-deadline-layer) a third argument — the turn signal and the note — may follow */
      f + ' routes its shared loader through the guard');
});

/* ── ⑫ the share link carries the hour and the opacities ──────────────────────────────────────*/
/* 綴りのまま: 対象は js/weather.js の closure（凡例の DOM と地図の source / layer）の中で、ブラウザの外では走らない */
test('R276 ⑫ a shared weather view reproduces the same hour, not the same index', () => {
  const w = WX();
  assert.match(w, /window\.IntMapShareState\.register\('weatherEC',io\)/, 'the weather registers its state');
  assert.match(w, /const vt=EC\(\)\.validTime\(\); if\(vt&&EC\(\)\.index\(\)!==EC\(\)\.nowIndex\(\)\) o\.t=vt;/,
    'the valid time travels as an INSTANT, and only when it is not simply "now"');
  assert.match(w, /if\(v\.t\)\{ const ms=Date\.parse\([\s\S]{0,80}?EC\(\)\.setIndex\(EC\(\)\.nearestTo\(ms\)\)/,
    'and is restored to the nearest step of whatever run the reader has');
  assert.match(w, /LAYERS\.forEach\(l=>\{ if\(state\[l\.id\]\.on&&state\[l\.id\]\.op!==l\.op\) ops\[l\.id\]=/,
    'a changed opacity travels too');
});

/* ── ⑬ the particle renderer counts in SECONDS ────────────────────────────────────────────────
   The old loop counted in frames: p.age++, dt = 0.05·mPerPx, fillRect(α=0.08). On a 144 Hz screen
   the wind blew 2.4× faster and the streaks were 2.4× shorter than on a 60 Hz one. */
/* 綴りのまま: 対象は DOM・地図（MapLibre / WebGL）に触れる closure の中で、ブラウザの外では走らない（実ブラウザ側は spec が持つ） */
test('R276 ⑬ movement, lifetime and trail are all real elapsed time, and the draw is batched', () => {
  const s = WIND();
  assert.match(s, /var dt = last \? Math\.min\(DT_MAX, Math\.max\(0, \(nowMs - last\) \/ 1000\)\) : 1 \/ 60;/,
    'dt is the measured interval in seconds');
  assert.match(s, /var metres = GAIN \* dt \* mPerPx;/, 'displacement is per second');
  assert.match(s, /p\.age \+= dt;/, 'age is in seconds');
  assert.match(s, /var keep = moving \? 0 : Math\.exp\(-dt \/ TRAIL_TAU\);/, 'the trail decays on a time constant');
  assert.ok(!/p\.age\+\+/.test(s), 'nothing counts frames any more');
  /* ONE draw call for every segment, and a real width (gl.lineWidth is clamped to 1 everywhere) */
  const draws = (s.match(/gl\.drawArrays\(gl\.TRIANGLES, 0, vcount\)/g) || []).length;
  assert.equal(draws, 1, 'the whole field is one drawArrays');
  assert.ok(!/gl\.lineWidth/.test(s), 'and width comes from geometry, not from the clamped lineWidth');
  assert.match(s, /function draw2D\(dt, moving\)/, 'a browser without WebGL still gets a picture…');
  assert.match(s, /for \(var b = 0; b < BUCKETS; b\+\+\)/, '…drawn in a handful of batched strokes');
  /* the budget follows the measured cost rather than a guess about the machine */
  /* (#R290) …with hysteresis. The thresholds were 9 ms / 4.5 ms decided every 30 frames, so a
     machine sitting near either of them cut 18 % of its particles and put 12 % back for ever — a
     density that pulses twice a second, which is 「点滅」 from the other side. */
  assert.match(s, /function govern\(\) \{[\s\S]{0,300}?frameMs > 11/, 'the particle count follows the frame time');
  assert.match(s, /want !== _verdict\) \{ _verdict = want; return; \}/, 'and it never acts on one noisy window');
});

/* ── ⑭ the palette is ONE table, and it is the one the reader asked for ───────────────────────*/
/* 綴りのまま: 主張が配線・不在・一意性（どこが何を呼ぶか／無いこと／1 か所だけ）で、評価して取り出せる値が無い */
test('R276 ⑭ the wind palette feeds the tiles and the legend from the same declaration', () => {
  const s = EC();
  /* ⚠ (#R284) the anchors are declared once and RESAMPLED, because the SDK's colour tables do not
     interpolate — a 17-entry table paints 17 flat bands. The declaration is still one. */
  assert.match(s, /var WIND_ANCHORS = \{[\s\S]{0,120}?unit: 'm\/s'/, 'the palette is declared once');
  assert.match(s, /var WINDY_WIND = rampFrom\(WIND_ANCHORS, [0-9.]+\);/, '…and the table is built from it');
  /* ⚠ (#R288) …beside the temperature family, which got the same treatment. ONE object, so the
     tiles and every legend still read one declaration. */
  /* ⚠ (#R439) FIVE FAMILIES NOW — pressure, precipitation and dew point were fitted to windy.com's
     own paint function too. What is asserted is unchanged: the wind family is replaced IN THE ONE
     object the protocol is built with, so the tiles and every legend still read one declaration. */
  assert.match(s, /Object\.assign\(\{\}, sdk\.COLOR_SCALES_WITH_ALIASES \|\| base\.colorScales,\s*\{ wind: WINDY_WIND, temperature: WINDY_TEMP[,}]/,
    'and replaces the SDK\'s wind family in the protocol settings');
  assert.match(s, /sdk\.omProtocol\(params, ctl, st\)/, 'the tiles are rendered with those settings…');
  assert.match(s, /sdk\.getColorScale\(variable, !!dark, displayScales\)/, '…and the legend reads them');
  /* ⚠⚠ (#R398) …AND FOR THESE TWO FAMILIES THE TWO VIEWS ARE LITERALLY ONE OBJECT. The renderer's
     copy replaces only the keys `FIELD_UNITS` names (see ⑤), so 「one declaration feeds the tiles
     and the legend」 is unconditional here — provided neither family is ever declared as needing a
     conversion. That is the whole content of the guarantee, so it is what is asked. */
  const decl = s.slice(s.indexOf('var FIELD_UNITS = {'), s.indexOf('function fieldUnit('));
  assert.ok(decl.length > 0, 'the field-unit declaration is readable');
  for (const fam of ['wind', 'temperature', 'wind_u_component_10m', 'wind_gusts_10m', 'temperature_2m'])
    assert.ok(!new RegExp('(^|[^_a-zA-Z])' + fam + '\\s*:').test(decl),
      `${fam} is not declared as arriving in a unit other than its ramp's, so its two views cannot diverge`);
  /* opaque: the reader's reference picture has no holes where the air is still */
  const raw = read('js/wx-ecmwf.js');
  const block = /breakpoints: \[([^\]]*)\][\s\S]*?colors: \[([\s\S]*?)\n    \]/.exec(raw.slice(raw.indexOf('var WIND_ANCHORS')));
  assert.ok(block, 'the palette is readable as data');
  const alphas = (block[2].match(/,\s*([0-9.]+)\]/g) || []).map((x) => parseFloat(x.replace(/[,\s\]]/g, '')));
  assert.ok(alphas.length >= 12, 'every stop declares an alpha');
  assert.deepEqual([...new Set(alphas)], [1], 'and every one of them is opaque');
});

/* ── ⑯ a layer that cannot be added YET keeps asking ──────────────────────────────────────────
   ⚠ CAUGHT BY THIS ROUND'S OWN PRODUCTION TEST, four attempts of 75 s each on the CI runner: the
   wind data arrived and the raster never appeared. `addField`/`addLayer` refuse while the style
   cannot accept a layer, and the rewrite called each of them ONCE — so on a machine where the style
   settles after the data does, the wind had particles and no colour for ever. #R85 answered exactly
   this report with a retry ladder; this asserts the ladder exists rather than the number in it. */
/* 綴りのまま: 対象は js/weather.js の closure（凡例の DOM と地図の source / layer）の中で、ブラウザの外では走らない */
test('R276 ⑯ a weather layer that is refused keeps trying, and stops when it lands', () => {
  const w = WX();
  assert.match(w, /function ensureField\(key\)\{[\s\S]{0,400}?if\(n\+\+<\d+\) setTimeout\(again,\d+\);/,
    'the wind field retries on a timer…');
  assert.match(w, /GE\(\)\.events\.once\('idle',\(\)=>\{ if\(on&&liveKey!==key\) addField\(key\); \}\)/,
    '…and on the map\'s next idle');
  assert.match(w, /const again=\(\)=>\{ if\(!on\|\|liveKey===key\) return;/,
    'and it stops as soon as the slot is live, or the layer is off');
  /* (#R337) the guard gained `on&&`: the COLOUR RASTER is the wind layer's alone now that the
     streaks can be up for the temperature legend. The ladder itself is unchanged. */
  assert.match(w, /if\(on&&key&&key!==liveKey\) ensureField\(key\);/, 'load() goes through the ladder');
  /* the ECMWF rasters have the same shape and the same ladder */
  assert.match(w, /const go=\(\)=>\{ if\(!state\[id\]\.on\) return;\s*\n\s*if\(_imCanDraw\(\)&&addLayer\(cfg\)\)/,
    'an ECMWF layer retries too');
  assert.match(w, /if\(n\+\+<\d+\) setTimeout\(go,\d+\);/, '…on a bounded ladder');
  /* and a rebuild for a new hour cannot leave the map with nothing
     ⚠ (#R284) it no longer removes the old layer first AT ALL — the new hour is built in the free
     slot at zero opacity and the old one is dropped once the map has settled. The retry ladder is
     still there, because `addSlot` can still be refused; what is gone is the hole it was covering. */
  assert.match(w, /const old=cfg\._s\|0, nu=1-old;[\s\S]{0,300}?if\(!\(_imCanDraw\(\)&&addSlot\(cfg,nu\)\)\)\{ if\(n\+\+<\d+\) setTimeout\(go,\d+\); return; \}/,
    'a time step retries its rebuild');
  assert.match(w, /setOpSlot\(cfg,nu,0\);[\s\S]{0,300}?dropSlot\(cfg,old\);/,
    '…and the old picture is only dropped once the new one has painted');
});

/* ── ⑰ the next hour is warmed when the reader moves, not on first sight ──────────────────────
   「時刻変更時は隣接フレームを先読みし」 — the instruction's own words. Warming a frame costs the
   same ranged reads as the one on screen, so doing it for a reader who has not touched the player
   spends their bandwidth on a picture they may never ask for, and competes with the one they did. */
/* 綴りのまま: 対象は js/weather.js の closure（凡例の DOM と地図の source / layer）の中で、ブラウザの外では走らない */
test('R276 ⑰ the prefetch is on the time change, not on the first load', () => {
  const w = WX();
  /* ⚠ (#R305) …and the ARGUMENTS moved again, for the same reason #R302 wrote below: the hour is
     the neighbour in the DIRECTION OF TRAVEL and the band is the one that hour will actually be
     read at. The relation is 「warmed from the time change, and only from it」. */
  /* ⚠ (#R310) …AND THE CALL IS A READ NOW, NOT A WARM-UP. `prefetch` kept only the bytes' presence
     in the block cache, so the step still paid the open, the index walk and the decode (MEASURED:
     2,107 / 2,168 / 2,204 ms a step, against 45 ms for an hour in hand). `readAhead` reads the same
     bytes of the same band for the same neighbour and HOLDS the frame. The relation this check is
     for — 「the wind asks for another hour only when the axis moved」 — is what is asserted. */
  assert.match(w, /if\(opt&&opt\.step\)\{[\s\S]{0,200}?EC\(\)\.(readAhead|prefetch)\(/,
    'the wind asks for the next hour only when the axis moved');
  assert.match(w, /load\(\{step:ev\.type==='time'\}\)/, 'and that is what a time event passes');
  /* ⚠ (#R302) THIS PINNED THE CLOSING PARENTHESES. It required
       `EC().prefetch(vars,Math.min(n-1,i+1))` — the exact arity of the day — so passing the VIEW as
     the third argument read as a regression, when it is the fix: without it `prefetch` fell through
     to `band=null` and warmed the variable over the WHOLE GLOBE (13.2 M samples) for a reader
     looking at one country. The relation the check is for is 「warmed from the time change」. */
  /* ⚠ (#R356) …AND IT PINNED THE INSTANCE. `EC().prefetch(vars, …)` was one call because there was
     one model. With a model per layer it is one call PER MODEL, over that model's own variables:
     asking the ECMWF instance for a field a GFS layer is drawing is a read of the right name
     against the wrong axis — it decodes cleanly and warms nothing the reader is about to see. The
     three relations this check has always been for are each asserted on their own line below, so a
     later change to the loop cannot satisfy them by accident. */
  const at = w.indexOf('function applyTime(only)');
  assert.ok(at > 0, 'applyTime is where it is expected');
  const body = w.slice(at, at + 2600);
  assert.match(body, /\.prefetch\(byModel\[m\],Math\.min\(n-1,i\+1\),pb\)/,
    'the ECMWF rasters warm theirs from the time change too…');
  assert.match(body, /const inst=ENG\(\)&&ENG\(\)\.model\(m\); if\(!inst\) return;/,
    '…each from the model that will actually be asked for them…');
  assert.match(body, /const i=inst\.index\(\), n=inst\.count\(\);/,
    '…on that model’s OWN axis, because +1 step is one hour on one and three on another…');
  assert.match(body, /pb=inst\.bandFor\(pbS,pbN\)/,
    '…and they warm the VIEW, not the globe — no third argument means band=null means everything');
});

/* ── ⑱ one layer's teardown is not a global "forget everything" ───────────────────────────────
   MEASURED: switching the wind OFF called `release()` unqualified, clearing `held` AND `loadingKey`,
   so a load of a DIFFERENT variable that was in flight resolved, found `loadingKey` no longer its
   own, and returned null — an ECMWF layer whose point value went blank for no visible reason. And it
   is not a contrived race: js/map-ui.js re-applies the saved layer set at 700 / 1,800 / 3,200 ms
   after boot, switching OFF anything not in the share hash. */
test('R276 ⑱ a layer releases its own frame, never somebody else\'s', async () => {
  const s = EC();
  /* (#R290) …and «the held frame» is now «the frames it holds»: more than one variable can be in
     hand (the wind's, and whichever raster the cursor is over — see the note on `frames`), so a
     release drops that variable's frames and refuses when it holds none of them. */
  assert.match(s, /function release\(variable\) \{[\s\S]{0,900}?if \(!had && !mineLoading\) return false;/,
    "release takes the variable it belongs to and refuses when it holds none of that variable's frames");
  assert.match(s, /frames = frames\.filter\(function \(f\) \{ return f\.variable !== variable; \}\);/,
    'and it drops only that variable…');
  assert.match(s, /loadingKey\.indexOf\('variable=' \+ encodeURIComponent\(variable\)\) >= 0/,
    '…and when nothing is held, the load in flight does');
  assert.match(WX(), /EC\(\)\.release\(VAR\)/, 'the wind layer names itself when it lets go');
  /* ⚠⚠ (#R288) THE TIME STEP'S OWN DROP IS GONE ENTIRELY. #R287 had already narrowed it — the
     unconditional `release()` was cancelling the load of the very hour it was announcing — and this
     round removed the drop itself: a load that SUCCEEDED still resolved as a failure whenever any
     later request superseded it (measured: 8.3 s, data present, result null), because the handler
     returned the module slot rather than the frame it had decoded. What survives is the rule this
     test was written for — a release NAMES its variable — plus a monotonic `seq` that makes
     「which frame is current」 explicit instead of leaving it to a slot anything could clear. */
  /* ⚠⚠ (#R288) THE UNCONDITIONAL RELEASE ON A TIME CHANGE IS GONE, and #R276's own reasoning is
     why: it invalidated the read that was already running for the hour the reader had just
     chosen, so a load that SUCCEEDED resolved as a failure and js/weather.js raised
     「風データを取得できませんでした」 (measured: 8.3 s, data present, result null). The new frame
     replaces the old one when it lands. What survives is the rule this test was written for — a
     release NAMES its variable — plus a monotonic `seq` that makes 「which frame is current」
     explicit instead of leaving it to a slot that anything could clear. */
  const ft = s.slice(s.indexOf('function fireTime()'), s.indexOf('function _clock()'));
  assert.ok(!/release\(\)/.test(ft), 'a time change no longer throws the current frame away');
  /* ⚠⚠⚠ (#R664) THOSE TWO LINES WERE SPELLINGS (`var mine = ++seq`, `if (seq === mine)`) AND THE
     SPELLING MOVED — see the header of tests/helpers/wx-ecmwf-page.mjs. What they were here for is a pair of facts about
     a read that a teardown lands on top of, and both are now measured against the shipped module:
     somebody else's release must not touch it, and its own release must not turn a read that
     SUCCEEDED into a failure (MEASURED in #R288 on the deployed build: 8.3 s, data present, result
     null, and js/weather.js raised 「風データを取得できませんでした」). */
  const other = await coldWxModel({ sdkMs: 80, readMs: 300 });
  const M = other.ENG.model('ecmwf_wam025');
  const p = M.load('wave_height', null, null);
  /* ⚠ the arrangement is 「the read is past `ready()` and holds a ticket」, so it is WAITED FOR and
     not timed: `await wxDelay(160)` for a fact that becomes true at 109–125 ms left 35–50 ms of
     margin, and a 130 ms stall of the event loop reached the assertion below with 0 reads started
     (see the header of tests/helpers/wx-ecmwf-page.mjs). The assertion itself is unchanged. */
  await until(() => other.calls.ensureData === 1, 'the read to reach the data',
    { observe: () => other.calls });
  assert.equal(other.calls.ensureData, 1, 'the read must be under way, or this proves nothing');
  assert.equal(M.release('temperature_2m'), false,
    'a release of a variable this model holds no frame of, and has no read in flight for, does nothing');
  const fr = await p;
  assert.ok(fr && fr.data && fr.data.values.length,
    "another layer's teardown cancelled this read — the defect this check was written for");
  assert.equal(M._state().frames, 1, '…and the frame it decoded was installed…');
  assert.equal(M._state().variable, 'wave_height', '…as the current one');

  const own = await coldWxModel({ sdkMs: 80, readMs: 300 });
  const M2 = own.ENG.model('ecmwf_wam025');
  const p2 = M2.load('wave_height', null, null);
  await until(() => own.calls.ensureData === 1, 'the read to reach the data', { observe: () => own.calls });
  assert.equal(M2.release('wave_height'), true, 'its OWN release does find the read in flight…');
  const fr2 = await p2;
  assert.ok(fr2 && fr2.data && fr2.data.values.length,
    '…and a superseded read still resolves to its caller, with the frame it decoded');
  assert.equal(M2._state().frames, 0,
    '…while which frame is current stays explicit: a superseded read does not install itself');
});

/* ── ⑲ one reader, therefore one queue ────────────────────────────────────────────────────────
   `ensureData` re-points the SDK's single `omFileReader` at its own file every time it runs, so two
   reads of different files that overlap corrupt each other. Every read this module starts is queued
   behind the last, so it can never be the second party to that collision. */
/* 綴りのまま: 対象は js/wx-ecmwf.js の読み取りの内側（SDK の状態・reader・キュー）の配線で、stub の SDK からは観測できない */
test('R276 ⑲ every read this module starts is serialised', () => {
  const s = EC();
  /* ⚠ (#R305) THE CHAIN BECAME A PUMP WITH TWO LANES. Which LANE a job is in is #R305 ⑦'s
     business, not this one's; this one is about every read leaving through ONE door.
     ⚠⚠⚠ (#R310) AND 「one at a time」 IS NO LONGER PART OF IT. That rule existed because the SDK
     keeps a SINGLE `omFileReader` and `ensureData` re-points it at the state's file on every call,
     so two reads of different files disposed the reader out from under each other (#R288 caught it
     in production: `valueNow` came back null after a step). #R310 gives every FILE its own reader —
     `WeatherMapLayerFileReader` is exported and `ensureData` takes the reader as an argument — so
     the collision is gone at its source, and the queue is left holding a decision about BANDWIDTH:
     the picture on screen does not share the connection with a picture nobody has asked for.
     What this check asks for is therefore what it always meant: the reads go through the queue. */
  assert.match(s, /function serial\(fn, bg\) \{[\s\S]{0,240}?\(bg \? qLo : qHi\)\.push/,
    'there is one queue…');
  assert.match(s, /while \(runHi < HI_MAX && qHi\.length\)/,
    "…the reader's own reads are drained first…");
  assert.match(s, /while \(runLo < LO_MAX && !qHi\.length && runHi === 0 && qLo\.length\)/,
    '…and a background read starts only when nothing the reader is waiting for is running');
  /* (#R288) …with the band's warm-up inside the SAME queued body, so a warm-up cannot start beside
     the read it is warming for. (#R310) The reader it points at is this FILE'S, not the singleton. */
  assert.match(s, /serial\(function \(\) \{[\s\S]{0,1800}?sdk\.ensureData\(st, \w+/,
    '…the field load goes through it…');
  assert.match(s, /serial\(function \(\) \{[\s\S]{0,900}?setToOmFile\(f\)/,
    '…and so does the prefetch, which is the call that opens a file');
  assert.match(s, /function readerFor\(url\)/, '(#R310) …and the reader is per file, which is why');
});

/* ── ⑮ the point-weather panel says what the numbers are and when they are for ────────────────*/
/* 綴りのまま: 対象は js/weather.js の closure（凡例の DOM と地図の source / layer）の中で、ブラウザの外では走らない */
test('R276 ⑮ the popup shows gusts, MSL pressure, the data\'s own valid time, and a refresh that refreshes', () => {
  const w = WX();
  assert.match(w, /L\('Gusts','突風'/, 'gusts are shown');
  assert.match(w, /L\('Pressure \(MSL\)','海面気圧'/, 'and the sea-level pressure…');
  assert.match(w, /const mslp=\(c\.pressure_msl!=null\)\?c\.pressure_msl:\(c\.surface_pressure!=null\?c\.surface_pressure:null\);/,
    '…from the field that means sea level, falling back only when it is absent');
  assert.match(w, /const upd=c\.time\?fmtInstant\(c\.time\):'—';/, 'the time shown is the DATA\'s time');
  assert.ok(!/const upd=new Date\(\)\.toLocaleTimeString/.test(w), 'not the browser\'s clock');
  assert.match(w, /rf\.onclick=\(\)=>open\(_lastLL\|\|lngLat,\{fresh:true\}\)/, 'the refresh button asks for fresh…');
  assert.match(w, /ttl:\(opt&&opt\.fresh\)\?0:300000/, '…and that reaches the client as a zero TTL');
  assert.match(codeOnly(read('js/wx-source.js')), /return metNo\(\+lat, \+lng, ttl\)/,
    'which reaches BOTH ladders, or the button still returns the cached answer');
  /* the map's own unit choice, not a private one */
  assert.match(w, /if\(window\.fmtWindSpeed\) return window\.fmtWindSpeed\(kmh\/3\.6\);/, 'wind follows the map\'s unit');
});
}

/* ════════ #R288 — from tests/r288-checks.test.mjs (8 of its 13 tests) ════════ */
{
/* ============================================================================
 *  IntMap · #R288 source checks
 * ----------------------------------------------------------------------------
 *  「気象警報はまだ対応していない、もしくはデータがまだ入っていないところは灰色斜線で、
 *    発令されていないだけの地域は灰色に。個々の区別はちゃんとやれ。」
 *  「警報レイヤー、日本以外でも区分単位、発令単位ごとに色分けしろ。…あと、警報の塗漏れが多すぎる。
 *    また、対応国も増やせ。更新が遅すぎる。リアルタイムにと言っている。対応地域まで斜線で塗るのを辞めろ。」
 *  「ECMWF系レイヤーを開くと勝手にECMWFの時間ポップアップが出るのを辞めろ。わざわざ分けるな。」
 *  「Wind(animated)は…点滅してしまうバグが発生する。未来に変えたとき、風データを取得できませんでした
 *    となる。あと、重すぎるから、品質は一切落とさずに爆速にしろ。」
 *  「気温 2m（ECMWF）レイヤーも色を添付画像と同じ色＋グラデーションに。また、名前は単に気温に。
 *    気温（2m・再解析）レイヤーも統合し、一つのレイヤー、同じ色分け、グラフィックに。
 *    ソースだけ切り替えられる仕様に。」
 *
 *  ⚠ COMMENTS ARE STRIPPED BEFORE ANY SEARCH (the sixteenth time this has mattered): this round's
 *  own comments quote the very strings it removed — `data-legend-ec-time`, `return -1`,
 *  `setVis(LYR` — so a check that read the raw file would fail on the sentence explaining the fix.
 *  ⚠ EVERY DELETION CHECK ALSO COUNTS WHAT MUST SURVIVE, so a fix that went too far is red too.
 *  ⚠ Nothing here matches a bare "\n": the working copy is CRLF on Windows and LF on CI (#R283).
 * ==========================================================================*/
/* (#R308 追記2) 5本が同じ1行を逐語で固定していたので、規則ごとに1つの読み手へ — tests/wash-tier.mjs */


const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');

const WP = () => codeOnly(read('js/world-packs.js'));
const WX = () => codeOnly(read('js/weather.js'));
const EC = () => codeOnly(read('js/wx-ecmwf.js'));
/* (#R293) js/wx-reanalysis.js is gone — see ⑩ and ⑪ */
const DL = () => codeOnly(read('js/data-layers.js'));
const TL = () => codeOnly(read('js/news-timeline.js'));

/* ── ⑥ the temperature ramp is the reference picture’s, measured ────────────────────────────── */
/* 綴りのまま: 主張が配線・不在・一意性（どこが何を呼ぶか／無いこと／1 か所だけ）で、評価して取り出せる値が無い */
test('#R288 ⑥ the temperature ramp is 23 measured stops in °C, on the SDK’s temperature family', () => {
  const src = EC();
  const i = src.indexOf('var TEMP_ANCHORS');
  assert.ok(i > 0, 'TEMP_ANCHORS must exist');
  const body = src.slice(i, src.indexOf('var WINDY_TEMP', i));
  assert.match(body, /unit:\s*'°C'/, 'stated in the unit the feed publishes');
  const bp = /breakpoints:\s*\[([^\]]+)\]/.exec(body);
  assert.ok(bp, 'breakpoints must be a literal');
  const nums = bp[1].split(',').map(x => parseFloat(x.trim()));
  assert.equal(nums.length, 23, '23 stops reproduce windy.com’s own gradient to 3/255');
  assert.equal(nums[0], -70.15);
  assert.equal(nums[nums.length - 1], 46.85);
  for (let k = 1; k < nums.length; k++) assert.ok(nums[k] > nums[k - 1], 'breakpoints must increase');
  /* the freezing isotherm is emphasised — four stops inside one degree */
  assert.equal(nums.filter(v => v >= 0 && v <= 0.85).length, 5,
    'five stops inside one degree — dropping 0.40 takes the worst error from 3/255 to 7/255');
  assert.match(body, /\[115,\s*70,\s*105,\s*1\]/, 'the coldest colour is the reference’s');
  assert.match(body, /\[71,\s*14,\s*0,\s*1\]/, 'and the hottest');
  assert.match(src, /var WINDY_TEMP = rampFrom\(TEMP_ANCHORS, 0\.05\);/);
  /* ⚠ (#R439) the literal carries more families after this one (pressure, precipitation, dew
     point). What is pinned is that the temperature ramp is registered on the SDK's FAMILY name,
     beside the wind's — not that those two are the only entries. ⚠ AND `dew_point` IS NO LONGER
     「a different family we leave alone」: it has its own measured table now, so the note above that
     said the dew-point layer was untouched describes a state that ended in #R439. */
  assert.match(src, /\{ wind: WINDY_WIND, temperature: WINDY_TEMP[,}]/,
    'registered on the SDK’s FAMILY name, so every temperature variable moves together');
  /* …and the wind ramp is built the same way, from its own anchors. ⚠ (#R293) it is no longer the
     seventeen #R284 measured: 「Windyと完全に同じ風速と色の対応に」 replaced them with windy.com's own
     table, sampled through `RGBA()`. What this line pins is that the two ramps are built by the
     SAME routine at their own steps — not what either table happens to contain. */
  assert.match(src, /var WINDY_WIND = rampFrom\(WIND_ANCHORS, 0\.1\);/);
});

/* the ramp is not asserted only as text: build it and check it reproduces the anchors exactly and
   moves smoothly between them, which is what 「色はそのまま／グラデーションに」 means. */
test('#R288 ⑥b the resampled ramp lands on its anchors and never steps visibly', () => {
  const src = read('js/wx-ecmwf.js');
  const i = src.indexOf('var TEMP_ANCHORS');
  const j = src.indexOf('var WINDY_TEMP', i);
  assert.ok(i > 0 && j > i, 'TEMP_ANCHORS literal');
  const lit = src.slice(i, j);
  const bp = JSON.parse('[' + /breakpoints:\s*\[([\s\S]*?)\]/.exec(lit)[1] + ']');
  /* the colours are [r,g,b,a] rows — read each row, keep the three channels */
  const cols = (lit.slice(lit.indexOf('colors:')).match(/\[\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*1\s*\]/g) || [])
    .map(r => JSON.parse(r).slice(0, 3));
  assert.equal(bp.length, cols.length, 'one colour per breakpoint');
  const rampFrom = (a, step) => {
    const lo = a.bp[0], hi = a.bp[a.bp.length - 1];
    const out = { breakpoints: [], colors: [] };
    const n = Math.round((hi - lo) / step); let seg = 0;
    for (let k = 0; k <= n; k++) {
      const v = lo + k * step;
      while (seg < a.bp.length - 2 && v >= a.bp[seg + 1]) seg++;
      const span = (a.bp[seg + 1] - a.bp[seg]) || 1;
      let f = (v - a.bp[seg]) / span; if (f < 0) f = 0; if (f > 1) f = 1;
      const c0 = a.cols[seg], c1 = a.cols[Math.min(seg + 1, a.cols.length - 1)];
      out.breakpoints.push(Math.round(v * 1000) / 1000);
      out.colors.push([0, 1, 2].map(j => Math.round(c0[j] + (c1[j] - c0[j]) * f)));
    }
    return out;
  };
  const r = rampFrom({ bp, cols }, 0.05);
  assert.equal(r.breakpoints.length, 2341, '−70.15 … 46.85 °C at 0.05 °C');
  /* every anchor value lands on its own colour — 「色はそのまま」 is literal, not approximate */
  bp.forEach((v, k) => {
    let lo = 0, hi = r.breakpoints.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (r.breakpoints[m] <= v + 1e-9) lo = m; else hi = m; }
    const got = r.colors[lo];
    const want = cols[k];
    const err = Math.max(Math.abs(got[0] - want[0]), Math.abs(got[1] - want[1]), Math.abs(got[2] - want[2]));
    assert.ok(err <= 4, 'anchor ' + v + ' °C should land on its own colour (off by ' + err + ')');
  });
  /* and no step between neighbours is visible */
  let worst = 0;
  for (let k = 1; k < r.colors.length; k++) {
    const a = r.colors[k - 1], b = r.colors[k];
    worst = Math.max(worst, Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
  }
  assert.ok(worst <= 24, 'the steepest neighbour step is the 0 °C isotherm; anything larger is a band (got ' + worst + ')');
});

/* ── ⑦ a read that succeeded is not reported as a failure ───────────────────────────────────── */
test('#R288 ⑦ load() returns its own frame, and a time change no longer drops the held one', async () => {
  const src = EC();
  /* (#R305) …and a fourth argument that says whether the READER is waiting for this read */
  const i = src.indexOf('function load(variable, i, bounds');
  assert.ok(i > 0, 'load must take the band');
  const body = src.slice(i, src.indexOf('function bandFor(', i));
  assert.match(body, /var frame = \{ key: key2, variable: variable, file: f, data: data, grid: g, band: band \};/);
  assert.match(body, /return frame;/, 'the handler returns what IT decoded');
  assert.ok(!/\breturn held;\s*\}\);/.test(body), 'never the module-level slot');
  /* ⚠⚠⚠ (#R664) `if (seq === mine)` WAS THE SPELLING OF THIS RULE AND THE SPELLING MOVED (see the
     header of tests/helpers/wx-ecmwf-page.mjs), so the rule is measured — and measured on the case the two defects ① and
     ② above are about: ANOTHER variable's frame is in hand when the read is superseded, and the
     handler must still answer with the one IT decoded rather than with the module-level slot. */
  const { calls, ENG } = await coldWxModel({ sdkMs: 80, readMs: 300 });
  const M = ENG.model('ecmwf_wam025');
  await M.load('temperature_2m', null, null);
  assert.equal(M._state().variable, 'temperature_2m', 'a frame of ANOTHER variable is in hand');
  const p = M.load('wave_height', null, null);
  /* the wave read is running — the fact, waited for, rather than a duration that usually contains
     it (see the header of tests/helpers/wx-ecmwf-page.mjs) */
  await until(() => calls.ensureData === 2, 'the wave read to reach the data', { observe: () => calls });
  M.release();                          /* …and is superseded before its bytes land */
  const fr = await p;
  assert.equal(fr && fr.variable, 'wave_height',
    'the handler answered with something other than the frame it decoded');
  assert.ok(fr.data && fr.data.values.length, '…and it is a frame, not a failure');
  assert.equal(M._state().frames, 0, 'a superseded read still resolves, it just does not install');
  const ft = src.indexOf('function fireTime()');
  const ftBody = src.slice(ft, src.indexOf('function _clock()', ft));
  assert.ok(!/release\(\)/.test(ftBody), 'a time change must not throw the current frame away');
  assert.match(src, /function release\(variable\) \{[\s\S]*?seq\+\+;/, 'a deliberate drop supersedes what is in flight');
});

/* ── ⑧ 品質は一切落とさずに爆速に — the latitude band ───────────────────────────────────────── */
test('#R288 ⑧ the field is read as the latitude band in view, warmed before it is read', async () => {
  const src = EC();
  /* ⚠ (tests-by-topic) `bandFor` / `bandCovers` are ASKED on the built module (see `builtModel` at the top of this file) instead of being read for `if (have === null …) return true;` and
     `if (n2 - s2 >= 120) return null;`. */
  const { M, restore } = await builtModel();
  try {
    assert.equal(M.bandFor(-80, 80), null, 'a view of most of the planet reads the planet');
    const b = M.bandFor(30, 40);
    assert.ok(Array.isArray(b) && b[0] === -180 && b[2] === 180 && b[1] <= 30 && b[3] >= 40,
      'a view of ten degrees reads a band around it, all the way round: ' + JSON.stringify(b));
    assert.ok(b[3] - b[1] < 120, '…and not the planet');
    assert.equal(M.bandCovers(null, b), true, 'the globe covers everything');
    assert.equal(M.bandCovers(undefined, b), true);
    assert.equal(M.bandCovers(false, b), false, '«nothing held» is not «the globe» (#R298)');
    assert.equal(M.bandCovers(b, null), false, 'a band does not cover the globe');
    assert.equal(M.bandCovers(b, M.bandFor(32, 38)), true, 'a band covers a narrower band inside it');
    assert.equal(M.bandCovers(M.bandFor(32, 38), b), false, '…and not a wider one');
  } finally { restore(); }
  /* 綴りのまま: 以下は読み取りの内側（SDK の状態・reader・キュー）の配線で、stub の SDK はその呼び出しを観測しない */
  /* ⚠ (#R310) the receiver is this FILE'S reader now (`readerFor`), not the shared singleton —
     the relation is that the band's ranges are warmed at the SDK's own concurrency before the read. */
  assert.match(src, /\w+\.prefetchVariable\(variable, st\.ranges\)/,
    'the band is latency-bound, so it is warmed at the SDK’s own concurrency first');
  assert.match(src, /bounds: band \|\| undefined/);
  assert.match(src, /var skey = key2 \+ \(band \? \('#'/, 'two bands must not share one state key');
  /* the wind asks for its own band and re-reads only when the view has left it */
  const w = WX();
  assert.match(w, /return EC\(\)\.bandFor\(b\.getSouth\(\),b\.getNorth\(\)\);/);
  /* ⚠ (#R297) the read is still ONE band-limited read of ONE variable; which band is decided
     first — the band around the view, then the whole view behind it (`bandFor` answers 「the
     planet」 at the opening view, which was 14.5 s before a particle moved). */
  assert.match(w, /return EC\(\)\.load\(VAR,null,b\);/);
  /* ⚠ (#R305) the wide read is marked 「this module started it」 so it yields its queue place to a
     read the reader is waiting for — the read itself, and the fact that it follows, are unchanged. */
  assert.match(w, /EC\(\)\.load\(VAR,null,want(,true)?\)/, 'and the wide band follows');
  /* (#R290) …of ITS OWN variable: more than one frame can be held now, so 「the band I have」 has to
     name whose band it is or the wind would read the temperature's. */
  assert.match(w, /if\(!EC\(\)\.bandCovers\(EC\(\)\.heldBand\(VAR\),band\(\)\)\) load\(\);/);
});

/* ── ⑨ わざわざ分けるな — there is no ECMWF clock ──────────────────────────────────────────── */
/* 綴りのまま: 対象は js/weather.js の closure（凡例の DOM と地図の source / layer）の中で、ブラウザの外では走らない */
test('#R288 ⑨ the forecast axis is the app clock, and the separate box is gone', () => {
  const w = WX();
  assert.ok(!/'ec-time'/.test(w), 'the 「ECMWF 予報時刻」 box must not be created');
  assert.ok(!/ec-validtime/.test(w), '…nor its readout');
  assert.ok(!/function ensureLegend\(/.test(w), '…nor the function that made it');
  assert.match(w, /class="ecl-when"/, 'each legend states WHICH INSTANT its picture is of');
  /* ══ ⚠⚠⚠ (#R290) …AND IT NO LONGER PASSES THAT INSTANT TO THE APP CLOCK ════════════════════
     「ECMWF系レイヤーで、時間選択をChronosに受け流さなくてよい。個別の時間選択UIを使え。」
     The half of #R288 that stays is the one it was asked for: no floating box appears by itself.
     The half the reader has now reversed is the coupling — a forecast step used to write
     window.IntMapTime, which dragged the news feed, the historical borders, the terminator and the
     country statistics to that hour, and a master-clock move used to overwrite the hour the reader
     had chosen. Neither direction exists; the hour is chosen in the layer's own legend. */
  assert.ok(!/function openClock\(\)/.test(w), 'nothing opens Chronos on a layer’s behalf');
  assert.match(w, /window\.IntMapWxPlayer\.timeUI\('ec-time-'\+cfg\.id,EC\(cfg\),L\)/,
    '…and the hour is chosen in that legend');
  /* the wind legend keeps its player — this is a consolidation, not a removal */
  assert.match(w, /window\.IntMapWxPlayer\.timeUI\('wind-time',E,L\)/, 'the wind legend’s own view of the clock survives');
  const e = EC();
  assert.ok(!/C\.set\(new Date\(tms\(vt\)\), \{ allowFuture: true, source: 'ecmwf' \}\)/.test(e),
    'a step does not write the master clock');
  /* ══ ⚠⚠⚠ (#R293) THE PULL IS BACK, AND ONLY THE PULL ══════════════════════════════════════
     「Chronosで時間を変更したら、IntMap内の対応するすべての要素をChronosの時間に合わせるように。」
     #R290 cut both wires because #R288 had wired both; the one that hurt was the PUSH, and it is
     still cut (the assertion above). The reader is now asking for the other direction, which is
     the opposite trade — Chronos is the app's one clock, so an instant chosen there has to be the
     instant the weather is showing. `covers()` keeps it honest: travelling to 1972 is not a
     request for a forecast. */
  assert.match(e, /function _followClock\(e\)/, 'the seek stays declared — Atlas can ask for it by name');
  assert.match(e, /followClock: _followClock,/, '…and it is exported');
  assert.match(e, /C\.on\(function\(e\)\{ try\{ _followClock\(e\); \}/,
    '…and the master clock DOES drive the axis again (#R293)');
  assert.match(e, /function _pushClock\(\) \{\}/, 'but a forecast step still writes nothing back');
  /* (#R293) 「時刻と予報タブを分けるな」 — the fourth tab is gone and its transport moved into 「時刻」 */
  const t = TL();
  assert.ok(!/ntl-mode-fc/.test(t), 'the separate forecast tab is gone');
  assert.match(t, /const fcReady=\(\)=>/, 'the transport is present only when the model published an axis');
  assert.match(t, /if\(mode!=='time'\|\|!fcReady\(\)\)\{ fcStop\(\); playerEl\.style\.display='none'/,
    '…and it lives inside the Time tab');
  assert.match(t, /window\._imTimeMachineForecast=/);
  assert.ok(!/id="ntl-mode-fc"/.test(read('index.html')), 'the fourth tab is gone from the markup too');
  assert.match(read('index.html'), /id="ntl-player"/, '…and its transport is not');
});

/* ── ⑩ 一つのレイヤー、同じ色分け、ソースだけ切り替え ─────────────────────────────────────── */
/* ⚠⚠ (#R293) 「気温レイヤーで、MERRA-2 再解析は削除。」 — the second source is gone, and so is
   everything that only served it. What #R288 was really pinning is that air temperature is ONE row
   with ONE ramp and no duplicate in js/data-layers.js; that half is unchanged and is what this
   test asserts now. The removal is asserted too, because an unreachable branch that still looks
   like a feature is exactly what this project forbids. */
/* 綴りのまま: 対象は js/weather.js の closure（凡例の DOM と地図の source / layer）の中で、ブラウザの外では走らない */
test('#R288 ⑩ air temperature is one layer with one ramp, and the reanalysis is gone', () => {
  const w = WX();
  assert.match(w, /id:'ec-temp',\s*variable:'temperature_2m'/);
  assert.match(w, /label:LA\('Temperature','気温'/, '「名前は単に気温に」');
  assert.ok(!/Temperature 2 m \(ECMWF\)/.test(w), 'the old name must be gone');
  /* (#R293) the source picker, the month clock and the reanalysis module went together */
  assert.ok(!/merra2/.test(w), 'no branch of the weather module mentions the reanalysis');
  assert.ok(!/class="ec-srcsel"/.test(w), '…the source picker is gone');
  assert.ok(!/function setSource\(id,src\)\{/.test(w), '…and the switch behind it');
  assert.ok(!/function applyMonth\(iso\)\{/.test(w), '…and the month clock that only it used');
  assert.ok(!/IntMapReanalysis/.test(w), '…and the module reference');
  assert.ok(!/wx-reanalysis/.test(codeOnly(read('src/main.js'))), 'the file is not imported');   /* (#R293) comments stripped — see ⑪ */
  /* the second row is gone from the panel, and a saved session is translated rather than dropped */
  const d = DL();
  assert.ok(!/\['temp','lyrTemp'\]/.test(d), 'the duplicate row must not be declared');
  assert.ok(!/lgdTemp/.test(d), '…nor its legend');
  assert.ok(!/MERRA2_2m_Air_Temperature_Monthly/.test(d), '…nor its tiles');
  /* what must SURVIVE: the other dated GIBS layers still have their date control */
  assert.match(d, /const layerDates=\{precip:PRECIP_DATE,sst:GIBS_DATE,snow:GIBS_DATE,aod:GIBS_DATE\};/);
  assert.match(d, /const isDated=layerDates\.hasOwnProperty\(id\);/);
  assert.match(codeOnly(read('js/session-tabs.js')), /'dl-temp':'dl-ec-temp'/, 'a saved session is migrated');
});

/* ── ⑪ the reanalysis is GONE, and nothing is left half-wired ────────────────────────────────
   ⚠⚠ (#R293) 「気温レイヤーで、MERRA-2 再解析は削除。」 #R288 ⑪ asserted that the reanalysis tile was
   inverted through NASA's own published colormap rather than a transcribed copy of it. There is no
   longer a reanalysis tile. What this test protects now is the OTHER half of a removal — that it
   went all the way: no module, no import, no protocol, and no caller left pointing at any of them.
   A half-removed feature is the shape this project keeps paying for. */
/* 綴りのまま: 主張が配線・不在・一意性（どこが何を呼ぶか／無いこと／1 か所だけ）で、評価して取り出せる値が無い */
test('#R288 ⑪ the reanalysis is removed end to end, with nothing left pointing at it', () => {
  assert.ok(!existsSync(resolve(ROOT, 'js/wx-reanalysis.js')), 'the module is deleted');
  /* ⚠ (#R293) COMMENTS ARE STRIPPED FIRST. The removal is explained in a comment that names the
     file it removed — and an earlier draft of this very test matched its own explanation. That is
     the nineteenth time this project has hit that shape; `codeOnly` is the standing answer. */
  const all = ['src/main.js', 'js/weather.js', 'js/wx-ecmwf.js', 'js/data-layers.js'];
  for (const f of all) {
    const s = codeOnly(read(f));
    assert.ok(!/wx-reanalysis/.test(s), f + ' does not import it');
    assert.ok(!/IntMapReanalysis/.test(s), f + ' does not reach for the global');
    assert.ok(!/imwxre:/.test(s), f + ' does not use its protocol');
  }
  assert.ok(!/MERRA2_2m_Air_Temperature_Monthly/.test(read('js/data-layers.js')), '…nor its tiles');
  /* the documents say so too — a removal the ledger still lists is a document that has gone stale */
  assert.ok(!/^wx-reanalysis\.js/m.test(read('docs/FILES.md')), 'the file ledger no longer lists it');
});

/* ── ⑫ an `om://` url is never handed to MapLibre without the protocol behind it ────────────── */
/* 綴りのまま: 対象は js/wx-ecmwf.js の読み取りの内側（SDK の状態・reader・キュー）の配線で、stub の SDK からは観測できない */
test('#R288 ⑫ the om protocol flag only goes up when the registration happened', () => {
  const src = EC();
  const i = src.indexOf('function registerProtocol()');
  const body = src.slice(i, src.indexOf('function ready()', i));
  assert.match(body, /ok = !!window\.IntMapGeoEngine\.scene\.addProtocol\('om'/, 'addProtocol already returns a boolean');
  assert.match(body, /protoReg = ok;/);
  assert.ok(!/protoReg = true;\s*return true;/.test(body), 'the flag must not latch outside the try');
  const w = WX();
  assert.match(w, /if\(!EC\(cfg\)\.registerProtocol\(\)\) return false;\s*const url=omUrl\(cfg/,
    'a raster layer refuses to be built before the protocol exists');
  /* ⚠ (#R325) the raster sources ask for `omRasterUrl` (= `omUrl` plus `tile_size`); the vector
     ones still ask for `omUrl`. What ⑫ pins is the ORDER — no `om://` url is spelled before
     `registerProtocol()` has answered true — and that is unchanged either way. */
  assert.match(w, /if\(!EC\(\)\.registerProtocol\(\)\) return false;\s*const s=SLOT\[slot\], url=EC\(\)\.omR?a?s?t?e?r?Url\(VAR\);/,
    '…and so does the animated field');
});
}

/* ════════ #R293 — from tests/r293-checks.test.mjs (1 of its 16 tests) ════════ */
{
/* ============================================================================
 *  IntMap · #R293 — source-level checks
 * ----------------------------------------------------------------------------
 *  The round's report, in one paragraph, so a reader of this file knows what it is guarding:
 *
 *    Six of the sentences this round answers had been answered before, and every one of them
 *    turned out to be a DIFFERENT SURFACE of the same complaint — the shape [[intmap-recurring-
 *    lessons]] calls 「再送は『自分の診断が違った』から始めろ」. So nothing here was written from the
 *    text of the request; every test below pins something that was MEASURED on production first:
 *
 *      · 「警報レイヤーが重すぎる」 — the steady state was already 60 fps (frame p50 16.7 ms, the same
 *        as with the layer off). The page froze for 7,597 ms while it parsed boundary sets it was
 *        downloading TWICE: 23.07 MB of per-country geoBoundaries beside the 2.27 MB world index
 *        #R290 shipped to make those unnecessary. → ADM2 only after ADM1 leaves something unplaced,
 *        one concurrency gate, and Cache Storage. Longest task 1,240 ms; second visit pays nothing.
 *      · 「Chronosポップアップの『過去表示中』」 — #R290 taught the COLLAPSED button to read the
 *        instant. The badge INSIDE the panel is a different element and still said 「過去」 for a
 *        future instant. Measured: both in the same frame, disagreeing.
 *      · 「地図中心の標準時、機能していない」 — third round, third cause. The accessor works; the only
 *        caller of `ensure()` was the <select>'s change handler, so a preference RESTORED from
 *        localStorage never fetched the data and fell silently to the device clock.
 *      · 「透明度100%は全然100%ではない」 — measured, both weather layers ARE fully opaque at 100 %
 *        (identical pixels over a light and a dark basemap). What was false was the WORD: the same
 *        control is 「Opacity」 in en/de/es/fr/ko/zh and was 「透明度」 / 「Прозрачность」 — the
 *        opposite quantity — in ja and ru.
 *      · 「Windyと完全に同じ風速と色の対応に」 — the shipped table borrowed Windy's breakpoints and
 *        invented the colours; measured divergence up to 133/255. And windy.com's own `RGBA()` does
 *        not equal a linear interpolation of its declared gradient (#R288's finding, again).
 *      · 「日本の特別警報の凡例だけ図形の形が違う」 — nothing chose a different shape. Every swatch
 *        carried a border, and a border's contrast is against the FILL: the JMA's #0c000c is the
 *        only chip darker than that grey, so it alone read as a ring. (And the panel held three
 *        swatch sizes for one idea.)
 * ==========================================================================*/
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');
/* ⚠ comments are stripped before every claim about code — this project has now written a test
   that matched its own explanation nineteen times (see #R288 ⑪ this round for the twentieth). */
const WP = () => codeOnly(read('js/world-packs.js'));
const WX = () => codeOnly(read('js/weather.js'));
const EC = () => codeOnly(read('js/wx-ecmwf.js'));
const TL = () => codeOnly(read('js/news-timeline.js'));
const DL = () => codeOnly(read('js/data-layers.js'));
const MT = () => codeOnly(read('js/map-tools.js'));

/* ── ⑩ 「Windyと完全に同じ風速と色の対応に…高風速帯でも同じになるように」 ──────────────────
   The table below is windy.com's own paint function, sampled every 0.1 m/s through `RGBA()` and
   fitted to the smallest set of stops that reproduces it — 27 stops, worst channel error 3/255.
   The four rows are readings taken from windy.com the day this was written; they are what makes
   this a comparison rather than a restatement of the file.                                       */
test('R293 ⑩ the wind ramp reproduces windy.com’s own, high speeds included', () => {
  const s = EC();
  const a = s.indexOf('var WIND_ANCHORS'), b = s.indexOf('var WINDY_WIND');
  assert.ok(a > 0 && b > a);
  const block = s.slice(a, b);
  const bp = JSON.parse(block.match(/breakpoints:\s*(\[[^\]]*\])/)[1]);
  const cols = [...block.matchAll(/\[\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*1\s*\]/g)]
    .map((m) => [+m[1], +m[2], +m[3]]);
  assert.equal(bp.length, cols.length, 'one colour per breakpoint');
  assert.equal(bp[0], 0);
  assert.equal(bp[bp.length - 1], 104, 'windy.com’s table ends at 104 m/s, and so does this one');
  for (let i = 1; i < bp.length; i++) assert.ok(bp[i] > bp[i - 1], 'breakpoints increase');

  const at = (v) => {
    if (v <= bp[0]) return cols[0];
    if (v >= bp[bp.length - 1]) return cols[cols.length - 1];
    for (let i = 0; i < bp.length - 1; i++) if (v >= bp[i] && v <= bp[i + 1]) {
      const f = (v - bp[i]) / (bp[i + 1] - bp[i]);
      return [0, 1, 2].map((k) => Math.round(cols[i][k] + (cols[i + 1][k] - cols[i][k]) * f));
    }
    return cols[cols.length - 1];
  };
  /* READINGS FROM windy.com — `W.colors.wind.RGBA(v)`, the function its map is painted through */
  const WINDY = [[0, [98, 113, 184]], [5, [77, 142, 124]], [15, [162, 109, 92]],
    [25, [95, 100, 160]], [60, [215, 209, 128]], [104, [129, 129, 129]]];
  for (const [v, want] of WINDY) {
    const got = at(v);
    const d = Math.max(...[0, 1, 2].map((k) => Math.abs(got[k] - want[k])));
    assert.ok(d <= 3, `${v} m/s: ${got} against windy.com’s ${want} — ${d}/255 apart`);
  }
  /* the high band is the half that was furthest off, so it is asserted as a DIFFERENCE from what
     was there before: [214,202,60] at 15 m/s and [240,220,245] at the top */
  assert.ok(Math.max(...[0, 1, 2].map((k) => Math.abs(at(15)[k] - [214, 202, 60][k]))) > 50,
    '15 m/s is no longer the yellow it was');
  assert.ok(!block.includes('[240, 220, 245, 1]'), 'and the scale no longer saturates to near-white');
  /* it is still a gradient rather than a staircase (#R284) */
  assert.match(s, /var WINDY_WIND = rampFrom\(WIND_ANCHORS, 0\.1\);/);
  /* …and OPAQUE: measured on windy.com, alpha is 255 at every speed — there is no calm-air hole */
  assert.ok(cols.length && !/,\s*0(\.\d+)?\s*\]/.test(block), 'every entry is fully opaque');
});
}

/* ════════ #R308 — from tests/r308-checks.test.mjs (4 of its 10 tests) ════════ */
{
/* ============================================================================
 *  IntMap · #R308 — source-level checks
 * ----------------------------------------------------------------------------
 *  Two reports:
 *    ①「警報レイヤー、発令されている・されてない地域にまで斜線かけるな。」
 *       ——「情報あるのに、そこに斜線が上塗りされてるところ」。斜線は「この地図はここについて何も
 *       述べていない」という主張なので、この層が何かを述べている地面の上に描かれてはならない。
 *    ②「風レイヤーは品質保ったまま、起動から日時変更からすべてに至るまで、爆速にしろ。」   (4回目)
 *
 *  ⚠ THE ASSERTIONS BELOW ARE RELATIONS, NOT SPELLINGS. Twenty-five rounds running, this project has
 *  had legitimate changes turned red by a check that pinned a literal — a byte count, a build stamp,
 *  a sentence that the next round was told to rewrite. Every question here is asked of a FUNCTION
 *  BODY (brace-matched, so a comment or a line ending cannot move the window) and every number is
 *  asked as an INEQUALITY against the thing it has to be big or small enough for.
 * ==========================================================================*/
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');

/* the body of a named function declaration, by brace matching — #R306's lesson: a window written in
   characters is a window that CRLF moves. */
function fnBody(src, name, from) {
  const start = src.indexOf('function ' + name + '(', from || 0);
  assert.notEqual(start, -1, 'function ' + name + ' exists');
  const open = src.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (!depth) return src.slice(open, i + 1); }
  }
  throw new Error('unbalanced braces in ' + name);
}
/* the value of a `var`/`const`/`let` declaration of a plain number or string, wherever it is written */
function numConst(src, name) {
  const m = new RegExp('(?:var|const|let)\\s+[^;]*?\\b' + name + '\\s*=\\s*([0-9][0-9*\\s]*)').exec(src);
  assert.ok(m, name + ' is declared');
  // eslint-disable-next-line no-new-func
  return Function('return (' + m[1] + ')')();
}

const WX = read('js/wx-ecmwf.js');
const WP = read('js/world-packs.js');
/* ⚠ `world-packs.js` holds every world pack, and more than one of them has an `ensureChoro`.
   Everything below is asked of the ALERTS pack, so the search starts where it declares its layers. */
const ALERTS = (() => { const i = WP.indexOf("const CHORO='wp-alert-choro'");
  assert.notEqual(i, -1, 'the alerts pack declares its country-wide layers'); return i; })();

/* ── ① 風: the stage-in is a REQUEST, not a download ─────────────────────────────────────────────
   #R307 found that the wait for a never-visited forecast hour is one range request against an object
   the CDN has not staged, and asked for the 64 kB block the reader would want anyway. MEASURED this
   round on production: a ONE-BYTE suffix range stages the object exactly as the 64 kB one does
   (a real 64 kB tail read afterwards costs 27–50 ms against 4,483–5,195 ms unstaged). So the request
   the stage-in makes must be small enough that it is the REQUEST being paid for and not the bytes. */
/* 綴りのまま: 対象は js/wx-ecmwf.js の読み取りの内側（SDK の状態・reader・キュー）の配線で、stub の SDK からは観測できない */
test('r308 ① the wind stage-in asks for at most a kilobyte, so the window can be wide', () => {
  const body = fnBody(WX, 'touch');
  assert.match(body, /Range/, 'the stage-in is a ranged request');
  const src = body + '\n' + WX.slice(0, WX.indexOf('function touch('));
  const m = /['"]bytes=-\s*['"]?\s*\+?\s*([A-Za-z_$][\w$]*)?/.exec(body) || [];
  let bytes = null;
  if (m[1]) bytes = numConst(WX, m[1]);
  else {
    const lit = /bytes=-(\d+)/.exec(body) || /bytes=-(\d+)/.exec(src);
    assert.ok(lit, 'the suffix length is readable');
    bytes = Number(lit[1]);
  }
  assert.ok(bytes > 0 && bytes <= 1024,
    'the stage-in asks for ' + bytes + ' bytes; it only has to make the request, not carry a block');
});

/* ── ② 風: the window is wider than the four hours #R307 could afford ────────────────────────────
   MEASURED: twelve cold objects staged in parallel took 5,329 ms together — the same wall clock as
   ONE of them — so the number of hours staged is chosen by what the reader can reach next, not by
   what the bytes cost. It reaches further in the direction the reader is going than behind them. */
/* 綴りのまま: 対象は js/wx-ecmwf.js の読み取りの内側（SDK の状態・reader・キュー）の配線で、stub の SDK からは観測できない */
test('r308 ② the stage-in window is wider than #R307 four hours and reaches further ahead', () => {
  const ahead = numConst(WX, 'TOUCH_AHEAD');
  const back = numConst(WX, 'TOUCH_BACK');
  assert.ok(ahead > back, 'ahead (' + ahead + ') reaches further than behind (' + back + ')');
  assert.ok(1 + ahead + back > 4, 'the window covers ' + (1 + ahead + back) + ' hours, more than #R307 four');
  const body = fnBody(WX, 'touchAround');
  assert.match(body, /for\s*\(/, 'the window is a loop over the window, not a hand-written list');
});

/* ── ③ 風「起動から」: the opening hour is staged while the page is still loading ─────────────────
   #R307 deliberately kept the stage-in behind `ready()`, i.e. behind a reader who has actually asked
   for weather, because four 64 kB requests on every boot would be bytes nobody asked for. At one
   byte that reason is gone, and the metadata handler is the earliest moment the file name exists. */
/* 綴りのまま: 対象は js/wx-ecmwf.js の読み取りの内側（SDK の状態・reader・キュー）の配線で、stub の SDK からは観測できない */
test('r308 ③ the opening forecast hour is staged from the metadata handler', () => {
  const body = fnBody(WX, 'fetchMeta');
  assert.match(body, /touch\s*\(/, 'fetchMeta stages the hour the app will open on');
});

/* ── ④ 風: playback stages further ahead than a single step does ─────────────────────────────────
   The player asks for every hour in turn at `playMs`; a window that only reaches the step window is
   overtaken within seconds. */
/* 綴りのまま: 対象は js/wx-ecmwf.js の読み取りの内側（SDK の状態・reader・キュー）の配線で、stub の SDK からは観測できない */
test('r308 ④ playback stages further ahead than a step does', () => {
  const play = numConst(WX, 'TOUCH_PLAY_AHEAD');
  const ahead = numConst(WX, 'TOUCH_AHEAD');
  assert.ok(play > ahead, 'playback reaches ' + play + ' hours ahead, more than a step (' + ahead + ')');
  const body = fnBody(WX, 'setIndex');
  assert.match(body, /playing\s*\?/, 'the index change chooses its window by whether the player is running');
});
}
