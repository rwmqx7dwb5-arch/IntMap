/* ============================================================================
 *  IntMap · #R455 — source-level and behavioural checks
 * ----------------------------------------------------------------------------
 *  Four reports in one message:
 *    ①「Atlasにはプリセットの送信文が…今地図で見ている地域に応じて用意して変えるようにして。
 *        （追記：まだほぼ定型文みたいなものしかない。もっとその場所にあったものに。）」  ← FIFTH TIME
 *    ②「海面気圧と最大瞬間風速レイヤーはデフォルトでパーティクルをオンに。降水量（予報）レイヤーも
 *        パーティクルをオンできるように。(これもデフォルトでオン)。」
 *    ③「レイヤーサムネイルフォルダに７つ追加したから、それも反映させといて。」
 *    ④「ニュースの詳細開くのに、○sourcesの部分をクリックするのはUIとして不自然。ボタンの名前を変えて。」
 *
 *  ⚠ ① IS NOT A WORDING CHECK, AND IT IS NOT A COUNT-THE-CANDIDATES CHECK. #R313's gate asked the
 *  file 「are there more than twenty candidates」 and #R337's asked 「do two different countries get
 *  different rows」 — the pool passed both while the defect stayed, because both questions can be
 *  satisfied by a mail merge with enough templates in it. What was MEASURED this round, by driving
 *  the shipped chooser over fifteen real views in real Chromium, is narrower and worse:
 *
 *      60 chips shown. 「Which submarine cables land in {place}, and what happens if one is cut?」
 *      took TEN of them — one chip in six — including 「…land in Switzerland」, which is landlocked,
 *      and 「…land in Algeria」 over the middle of the Sahara. 「Which climate zones does {place}
 *      span」 took another six, over one Alpine valley and over Manhattan at z=13.
 *
 *  Both are gated on `f.has('<checkbox id>')`, which asks the LAYERS PANEL, not the map — and both
 *  of those layers are ON BY DEFAULT (`window.IntMapDefaultLayers`). So the chips fired on every
 *  view on Earth and the only thing that varied was the name pasted in. That is the whole report,
 *  with a number on it.
 *
 *  ⇒ ① asserts the PROPERTY that removes it: a chip may not claim content the app has not seen in
 *  the box. The behavioural half runs the real chooser over two views that differ ONLY in what is
 *  inside them and asserts the cable question appears for one and not for the other.
 *
 *  ⚠ EVERY SOURCE READ GOES THROUGH `readLF()` (#R283, scripts/eol.mjs) — line endings belong to
 *  the checkout, and a pattern that spans a line break is otherwise green in CI and red on Windows.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly } from '../scripts/code-only.mjs';
import { makeAtlasExamples } from '../js/atlas-examples.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readLF(resolve(ROOT, p));
/* ⚠ COMMENTS ARE STRIPPED BEFORE ANY 「this spelling is absent」 ASSERTION. #R345's shape, and this
   file walked into it on its first run: ①f asserts that js/atlas-view-subject.js reads no upstream
   proper noun, and the ⚠ box explaining WHY it does not quotes the very property names it forbids.
   The check read its own note and went red. A negative claim about code has to be asked of code. */
const code = (p) => codeOnly(rd(p));

const EX = rd('js/atlas-examples.js');
const VS = rd('js/atlas-view-subject.js');
const WX = rd('js/weather.js');
const AC = rd('js/atlas-console.js');
const LP = rd('js/layer-previews.js');
const NE = rd('js/news-events.js');

/* ══════════════════════════════════════════════════════════════════════════
   ① a chip may not claim content the app has not seen in the box
   ═══════════════════════════════════════════════════════════════════════ */

test('R455 ①a the five countable layer chips no longer fire on the checkbox alone', () => {
  /* each of these used to read `on:(f)=>f.st&&f.has('<id>')` and nothing else. The layer being
     ticked is a fact about the PANEL; it is not evidence that the thing is here. */
  const need = [
    ["k:'cables'", "f.inView('cables')===null"],
    ["k:'volc'", "f.inView('volcanoes')===null"],
    ["k:'quake'", "f.inView('earthquakes')===null"],
    ["k:'planes'", "f.inView('aircraft')===null"],
    ["k:'ships'", "f.inView('ships')===null"]
  ];
  for (const [key, guard] of need) {
    const i = EX.indexOf(key);
    assert.ok(i >= 0, key + ' is shipped');
    const line = EX.slice(i, EX.indexOf('\n', i));
    assert.ok(line.includes(guard),
      key + ' defers to the counted chip whenever the app CAN count: expected ' + guard + ' in «' + line.trim() + '»');
  }
});

test('R455 ①b `null` and `0` are different answers, and the pool is written to tell them apart', () => {
  /* ⚠ THIS IS THE WHOLE DESIGN. `null` = 「the app cannot count this」 (the layer is on but its
     source has not been built), `0` = 「there is none here」. Collapsing them would either delete a
     working chip during the first second of a layer or let it claim content again. */
  assert.match(VS, /out\[id\] = f \? f\.length : null;/, 'an uncountable layer yields null, not 0');
  assert.match(VS, /out\.cables = cab \? cab\.length : null;/, '…and so do the cable landings');
  assert.match(VS, /nIn: \(id\) => \{ const v = content\[id\]; return \(typeof v === 'number'\) \? v : null; \}/,
    'the accessor preserves the distinction rather than defaulting to 0');
});

test('R455 ①c the counted chips are gated on a COUNT, and every one has a singular', () => {
  /* 「1 submarine cable landings」 shipped for exactly one measurement pass of this round. `L()` has
     no plural machinery — nine languages, nine rules — so a counted noun carries two candidates
     whose predicates cannot both be true. */
  const pairs = [
    ["k:'vcable'", "k:'vcable1'", 'cables'],
    ["k:'vvolc'", "k:'vvolc1'", 'volcanoes'],
    ["k:'vquake'", "k:'vquake1'", 'earthquakes']
  ];
  for (const [many, one, id] of pairs) {
    const lm = EX.slice(EX.indexOf(many), EX.indexOf('\n', EX.indexOf(many)));
    const lo = EX.slice(EX.indexOf(one), EX.indexOf('\n', EX.indexOf(one)));
    assert.ok(lm.includes("f.inView('" + id + "')>=2"), many + ' is the plural half (>=2): ' + lm.trim());
    assert.ok(lo.includes("f.inView('" + id + "')===1"), one + ' is the singular half (===1): ' + lo.trim());
  }
});

test('R455 ①d a count over the whole planet is a fact about the network, not about a place', () => {
  /* MEASURED before this gate: 「501 submarine cable landings sit inside this view」 at world zoom. */
  const l = EX.slice(EX.indexOf("k:'vcable'"), EX.indexOf('\n', EX.indexOf("k:'vcable'")));
  assert.ok(/\(continent\|country\|region\|city\|street\)\$\/\.test\(f\.scale\)/.test(l),
    'vcable refuses at world scale: ' + l.trim());
  /* and the raster layer that cannot be counted is asked at the register it is about */
  const c = EX.slice(EX.indexOf("k:'climate'"), EX.indexOf('\n', EX.indexOf("k:'climate'")));
  assert.ok(/\(world\|continent\|country\)\$\/\.test\(f\.scale\)/.test(c),
    'a whole-country climate claim is not made over one valley: ' + c.trim());
});

test('R455 ①e the Arctic claim reads the VIEW’s latitude, not the country’s extent', () => {
  /* MEASURED on this build: 「Part of United States of America lies inside the Arctic Circle」 while
     the reader was looking at Manhattan, because Alaska is in the same country. #R337 追記 fixed
     the equator with the same argument — an extent is not a location, and it is not a view. */
  const l = EX.slice(EX.indexOf("k:'arctic'"), EX.indexOf('\n', EX.indexOf("k:'arctic'")));
  assert.ok(l.includes('f.viewN!=null&&f.viewN>=60'), 'the view has to be up there too: ' + l.trim());
  assert.match(EX, /viewN:\(vw&&vw\.box&&isFinite\(vw\.box\.n\)\)\?vw\.box\.n:null/,
    'and `viewN` is the box’s own north edge');
});

test('R455 ①f the new measurement fetches nothing and names nothing', () => {
  /* #R392's rule for this module, kept: every source is already in memory or already on the GPU. */
  const i = VS.indexOf('function contentInView');
  const j = VS.indexOf('function subject(', i);
  assert.ok(i > 0 && j > i, 'contentInView is shipped');
  const body = VS.slice(VS.indexOf('const COUNTABLE'), j);
  for (const bad of ['fetch(', 'XMLHttpRequest', 'import(']) {
    assert.ok(!body.includes(bad), 'contentInView must not ' + bad);
  }
  /* ⚠ and no proper noun is lifted out of a feature — `tests/r392 ③` forbids that spelling in this
     module for #R313 追記's reason, and the first draft of this round broke it.
     ⚠ ASKED OF THE CODE, NOT OF THE FILE. The ⚠ box in the module that explains why the noun is
     NOT read has to quote the property names it is refusing, so a raw-text search finds its own
     note and goes red — #R345's shape, and this check walked into it on its first run. */
  const VSC = code('js/atlas-view-subject.js');
  assert.ok(!/\.title\b/.test(VSC), 'no two-language title is read');
  assert.ok(!/properties\.name/.test(VSC), 'no upstream noun is interpolated into a translated sentence');
});

test('R455 ①g the redraw guard sees the content — presence for the live feeds, counts for the static ones', () => {
  /* an aircraft count changes under a motionless camera; a cable landing does not. Putting the live
     counts in the key would rebuild the whole row every few seconds for no reader-visible reason. */
  assert.match(VS, /const bit = \(v\) => \(v == null \? '\?' : \(v > 0 \? '1' : '0'\)\);/);
  assert.match(VS, /bit\(c\.aircraft\)/, 'the live feeds contribute presence');
  assert.match(VS, /\(c\.cables == null \? '\?' : c\.cables\)/, 'the static catalogues contribute their count');
  assert.match(VS, /'\|' \+ cont;/, 'and the content is part of the key');
});

/* ── the behavioural half: the shipped chooser, over two views that differ only in content ──── */

/* the same harness shape tests/r337-checks uses, plus the layer registry this round reads */
function chips(opts) {
  const o = opts || {};
  const layers = o.layers || [];
  const counts = o.counts || {};
  const pd = globalThis.document, pw = globalThis.window;
  globalThis.document = {
    getElementById: (id) => (id === 'layer-dropdown' ? {
      querySelectorAll: () => layers.map((l) => ({
        checked: true, id: l, type: 'checkbox', closest: () => null, parentElement: null }))
    } : null)
  };
  globalThis.window = {
    IntMapTime: { state: () => ({ isLive: true, year: null }) },
    /* the registry the measurement reads. `undefined` for an id means 「no source」 → null → the
       app cannot count, which is the third state ①b is about. */
    IntMapLayers: {
      featuresIn: (id) => (counts[id] === undefined ? null
        : new Array(counts[id]).fill(0).map(() => ({ properties: {}, geometry: { type: 'Point', coordinates: [10.5, 30.5] } })))
    }
  };
  try {
    return makeAtlasExamples({ lang: 'en' }, {
      L: (en) => en,
      GE: () => ({
        camera: { getCenter: () => ({ lng: 10.5, lat: 30.5 }), getZoom: () => (o.zoom == null ? 8 : o.zoom) },
        /* the cable landings have no registry row — they are a plain point source */
        layers: { sourceData: (sid) => (sid === 'src-subcables-lp' && o.cables != null)
          ? { features: new Array(o.cables).fill(0).map(() => ({ geometry: { type: 'Point', coordinates: [10.5, 30.5] } })) }
          : null }
      }),
      codeAtPoint: () => o.code || 'AAA',
      countryStats: o.stats || { AAA: { nameEn: 'Atlantis', area: 100000, bboxAll: [10, 30, 11, 31], latlng: [30.5, 10.5] } },
      cName: (st) => st.nameEn,
      loadCountryData: () => Promise.resolve(),
      panelEl: () => null,
      pick: () => {}
    }).examples();
  } finally { globalThis.document = pd; globalThis.window = pw; }
}

test('R455 ①h THE REPORT: the cable question appears where cables are and is silent where they are not', () => {
  const cable = /submarine cable/i;
  /* same country, same camera, same ticked layer — the ONLY difference is what is in the box */
  const withCables = chips({ layers: ['dl-subcables'], cables: 5 });
  const without = chips({ layers: ['dl-subcables'], cables: 0 });
  assert.ok(withCables.some((c) => cable.test(c)),
    'five landings in the box → the question is asked: ' + JSON.stringify(withCables));
  assert.ok(!without.some((c) => cable.test(c)),
    'NO landings in the box → nothing claims any (this is the Switzerland case): ' + JSON.stringify(without));
  /* and the counted one carries the real number rather than a template's name */
  assert.ok(withCables.some((c) => /\b5\b/.test(c) && cable.test(c)),
    'the chip states how many it actually saw: ' + JSON.stringify(withCables));
});

test('R455 ①i a view the app cannot count keeps the question it always had', () => {
  /* the layer is on and its source has not been built — `null`, not 0. Deleting the chip here would
     be a regression the reader would see during the first second of every layer. */
  const boot = chips({ layers: ['dl-subcables'] });   /* no `cables` key at all → sourceData null */
  assert.ok(boot.some((c) => /submarine cables land in/i.test(c)),
    'the original country-scoped question survives the uncountable case: ' + JSON.stringify(boot));
});

test('R455 ①j the singular is a real sentence', () => {
  const one = chips({ layers: ['dl-subcables'], cables: 1 });
  assert.ok(one.some((c) => /One submarine cable lands inside this view/.test(c)),
    'one landing reads as one: ' + JSON.stringify(one));
  assert.ok(!one.some((c) => /1 submarine cable landings/.test(c)), 'and never as «1 … landings»');
});

test('R455 ①k every new candidate is a literal L(), so all nine languages stay reachable', () => {
  /* #R309 ③'s rule: `scripts/i18n-audit.mjs` walks the CALL SITES, so a sentence built any other
     way is invisible to `npm run check:i18n` and ships in English for fr/ko/zh-Hant/zh-Hans. */
  for (const k of ['vcable', 'vcable1', 'vvolc', 'vvolc1', 'vquake', 'vquake1', 'vnews', 'vplanes', 'vships', 'vsats', 'vdc']) {
    const i = EX.indexOf("k:'" + k + "'");
    assert.ok(i >= 0, k + ' is shipped');
    const body = EX.slice(i, i + 1400);
    assert.match(body, /t:\(\)=>L\('/, k + ' is a literal L()');
  }
});

/* ══════════════════════════════════════════════════════════════════════════
   ② the particle default is per layer, and the fourth layer can ask
   ═══════════════════════════════════════════════════════════════════════ */

test('R455 ②a four layers can ask for the streaks, and ec-precip is one of them', () => {
  assert.match(WX, /const PARTS_KEYS=\{'ec-temp':'intmap_wx_temp_parts','ec-gust':'intmap_wx_gust_parts','ec-slp':'intmap_wx_slp_parts','ec-precip':'intmap_wx_precip_parts'\};/,
    'the table that decides which layers can ask');
  /* the box, the OR, the share link and the door all read PARTS_KEYS, so nothing else needs adding */
  assert.match(WX, /function windPartsRow\(cfg\)\{\s*if\(!\(cfg\.id in PARTS_KEYS\)\) return '';/);
});

test('R455 ②b gusts, pressure and forecast precipitation start ON; temperature stays OFF', () => {
  assert.match(WX, /const PARTS_DEFAULT=\{'ec-temp':false,'ec-gust':true,'ec-slp':true,'ec-precip':true\};/,
    'the default is per layer, in one place');
});

test('R455 ②c a stored answer still wins both ways — the default only decides an ABSENT key', () => {
  /* ⚠ a reader who UNTICKED a box must stay unticked. `!== '0'`-style reads treat 「never asked」 and
     「said no」 the same; this one does not. */
  assert.match(WX, /let v=!!PARTS_DEFAULT\[id\];[\s\S]{0,140}?const s=localStorage\.getItem\(PARTS_KEYS\[id\]\); if\(s!=null\) v=\(s==='1'\);/,
    'missing → default, «1» → on, «0» → off');
});

test('R455 ②d Atlas can be asked for the streaks over the precipitation layer', () => {
  assert.match(AC, /\['ec-precip',\/precip\|降水/, 'the OVER table resolves 「降水量の上に」');
  assert.ok(AC.includes('precipWindParticles:'), 'and the reply carries an inline toggle for it');
  assert.match(AC, /window\._imWxParts\('ec-precip'\)/, 'which reads through the one door');
  /* ⚠ ORDER MATTERS: `ec-slp`'s pattern is tested first and 「precipitation」 must not fall into it */
  assert.ok(AC.indexOf("['ec-slp',") < AC.indexOf("['ec-precip',"), 'pressure is tested before precipitation');
});

test('R455 ②e the model’s own catalogue no longer says all three are off', () => {
  const CT = rd('js/atlas-catalog-text.js');
  assert.ok(!CT.includes('all three are OFF by default'), 'the stale claim is gone');
  assert.ok(CT.includes('"over":"temperature" | "gusts" | "pressure" | "precipitation"'),
    'the fourth value is offered to the model');
  assert.match(CT, /ON by default/, 'and the defaults it states are the ones that ship');
});

/* ══════════════════════════════════════════════════════════════════════════
   ③ seven more captures, wired and weighed
   ═══════════════════════════════════════════════════════════════════════ */

test('R455 ③a the seven new captures are committed, referenced, and the tile’s own shape', () => {
  const added = ['preview_planes.png', 'preview_satellites.png', 'preview_radar.png',
                 'preview_precipfc.png', 'preview_slp.png', 'preview_gusts.png', 'preview_railways.png'];
  const m = /const W=(\d+),H=(\d+)/.exec(LP);
  assert.ok(m, 'the tile declares its own geometry');
  const want = Number(m[1]) / Number(m[2]);
  for (const f of added) {
    assert.ok(existsSync(join(ROOT, f)), f + ' is committed');
    assert.ok(LP.includes("'" + f + "'"), f + ' is named by the IMG table');
    const b = readFileSync(join(ROOT, f));
    const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
    assert.ok(Math.abs(w / h - want) / want < 0.02, f + ' is the tile aspect ratio (' + w + 'x' + h + ')');
    assert.ok(w >= 2 * Number(m[1]), f + ' is at least 2x the tile width (' + w + ')');
  }
});

test('R455 ③b the seven are wired to the layers they are pictures of', () => {
  for (const [cb, png] of [['dl-planes', 'preview_planes.png'], ['dl-sats', 'preview_satellites.png'],
                           ['dl-radar', 'preview_radar.png'], ['dl-ec-precip', 'preview_precipfc.png'],
                           ['dl-ec-slp', 'preview_slp.png'], ['dl-ec-gust', 'preview_gusts.png'],
                           ['beta-dl-rail', 'preview_railways.png']]) {
    assert.ok(LP.includes("'" + cb + "':'" + png + "'"), cb + ' names ' + png);
  }
});

test('R455 ③c no IMG key is written twice — the last one would silently win', () => {
  /* `beta-dl-rail` had an upstream OpenRailwayMap tile; the capture REPLACES it rather than being
     appended beside it. A duplicate key is valid JavaScript and invisible until someone reorders. */
  const a = LP.indexOf('const IMG={'), b = LP.indexOf('\n    };', a);
  const rows = [...LP.slice(a, b).matchAll(/^\s*'([a-z0-9-]+)':/gm)].map((x) => x[1]);
  const dup = rows.filter((k, i) => rows.indexOf(k) !== i);
  assert.deepEqual(dup, [], 'duplicate IMG keys: ' + dup.join(', '));
  /* the two OTHER rail layers are different layers and keep their upstream tile */
  assert.ok(LP.includes("'cb-rail2':'https://a.tiles.openrailwaymap.org"), 'cb-rail2 is untouched');
  assert.ok(LP.includes("'ox-oxrail':'https://a.tiles.openrailwaymap.org"), 'ox-oxrail is untouched');
});

/* ══════════════════════════════════════════════════════════════════════════
   ④ the button is named for what it does
   ═══════════════════════════════════════════════════════════════════════ */

test('R455 ④a the button leads with the action and keeps the source count', () => {
  assert.match(NE, /L\('Details \(1 source\)', '詳細（1媒体）'/, 'the singular');
  assert.match(NE, /L\('Details \(\{n\} sources\)', '詳細（\{n\}媒体）'/, 'the plural');
  assert.ok(!/L\('1 source', '1媒体'/.test(NE), 'the bare count is no longer the button’s name');
});

test('R455 ④b it is still the same button, doing the same thing', () => {
  /* renaming a control must not move it, restyle it, or change what it opens */
  const i = NE.indexOf("btn.className = 'ev-sources'");
  assert.ok(i > 0, 'the class is unchanged, so every spec and CSS rule still finds it');
  const after = NE.slice(i, i + 400);
  assert.match(after, /btn\.title = ev\.outlets\.join\(' · '\)/, 'the outlet list is still the tooltip');
  assert.match(after, /btn\.onclick = \(e\) => \{ e\.stopPropagation\(\); openDetail\(item\); \}/,
    'and it still opens the event detail');
});

test('R455 ④c the map tooltip is NOT the button, and is deliberately left alone', () => {
  /* js/news-ui.js `_srcCountLabel()` produces the byte-identical string for the hover tooltip and
     the phone popup. Those are descriptive text nobody clicks, so 「3 sources」 is right there — and
     the two strings part company this round on purpose. A future reader who greps 「{n} sources」
     and finds one hit must not conclude the button was missed. */
  const NU = rd('js/news-ui.js');
  assert.match(NU, /IntMapLang\.t\(HOST\.lang,'\{n\} sources','\{n\}媒体'/, 'the tooltip keeps the plain count');
  assert.ok(!NU.includes('Details ({n} sources)'), 'and does not take the button’s name');
});

/* ══════════════════════════════════════════════════════════════════════════
   the round’s own bookkeeping
   ═══════════════════════════════════════════════════════════════════════ */

test('R455 ⑤ this file is in the checks list, or it is green for ever', () => {
  /* #R260 ⑥ caught exactly this: a check nobody runs. */
  const pkg = JSON.parse(rd('package.json'));
  assert.ok(String(pkg.scripts['test:checks']).includes('r455-checks.test.mjs'),
    'package.json test:checks names this file');
});

test('R455 ⑥ the preview count and byte total match what is on disk', () => {
  /* the same equality #R408 ①d asserts, restated here because this round changed both sides of it */
  const imgs = readdirSync(ROOT).filter((f) => /^preview_.*\.png$/.test(f));
  assert.equal(imgs.length, 35, 'preview_*.png on disk');
  assert.equal(imgs.reduce((n, f) => n + statSync(join(ROOT, f)).size, 0), 4572977, 'total bytes');
});
