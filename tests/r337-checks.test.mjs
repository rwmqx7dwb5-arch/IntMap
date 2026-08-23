/* ============================================================================
 *  IntMap · #R337 — source-level and behavioural checks
 * ----------------------------------------------------------------------------
 *  Four reports in one message:
 *    ①「気温レイヤーでも、風レイヤーのパーティクルをオンオフできるトグルを付けて。」
 *    ②「Atlasにはプリセットの送信文が…今地図で見ている地域に応じて用意して変えるようにして。
 *        （追記：まだほぼ定型文みたいなものしかない。もっとその場所にあったものに。）」
 *    ③「NATO membersレイヤーをオンにしたら、自動的にNATOに行くように。」
 *    ④「ChronosのTimeのタイムスライダーは、目盛りを付けるように。」
 *
 *  ⚠ ② IS NOT A SOURCE CHECK. #R313 answered the first half of the same report and its gate asked
 *  the FILE 「are there more than twenty candidates」 — a question the mail merge would also have
 *  passed once it had twenty sentences in it. What the reader is complaining about is a property of
 *  the OUTPUT: 「two different places must not be handed the same four questions」. So ② imports the
 *  shipped chooser and runs it over a synthetic world, and every assertion is about the SET of four
 *  it returns. No wording is pinned anywhere in this file — the 「generic tail」 is DERIVED by asking
 *  the module itself what a country with no distinguishing facts gets.
 *
 *  ⚠ AND EVERY SOURCE READ GOES THROUGH `readLF()` (#R283, scripts/eol.mjs). Line endings belong
 *  to the CHECKOUT: this repository's js/ and css/ are `i/lf w/crlf`, so a pattern that spans a
 *  line break is green in CI and red on Windows for a reason that has nothing to do with the
 *  property being asserted. #R317 found a check that had never once run for exactly that.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readLF } from '../scripts/eol.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readLF(resolve(ROOT, p));
/* comments in this project QUOTE the spellings they replaced, so a check that greps the raw file
   proves nothing — every source assertion reads the code with the comments taken out (#R313) */
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, ' ');

/* ══════════════════════════════════════════════════════════════════════════
   ① the wind's streaks can be asked for by a layer that is not the wind layer
   ═══════════════════════════════════════════════════════════════════════ */
test('R337 ① the temperature legend switches the wind particles on, and the field follows "someone wants it" rather than "the wind layer is on"', () => {
  const wx = code('js/weather.js');

  /* the wind module has a SECOND door beside #R313's `setParticles`, and it is published */
  assert.match(wx, /function setSolo\(/, 'the wind module has a solo switch');
  assert.match(wx, /setSolo,/, '…and it is on the object the rest of the app talks to');
  assert.match(wx, /solo:\s*soloAreOn/, '…which can also be read back');

  /* ⚠ THE POINT OF THE ROUND: the field, the frame loop and the canvas must NOT be gated on `on`
     any more. A second switch that does nothing unless the first one is on is a switch that does
     nothing. `live()` is that predicate, and it has to be what those places ask. */
  assert.match(wx, /const live\s*=\s*\(\)\s*=>\s*on\s*\|\|\s*soloOn/, 'live() is "the field is wanted"');
  assert.match(wx, /function step\(ts\)\{\s*if\(!live\(\)\)/, 'the frame loop follows live()');
  assert.match(wx, /function streaksWanted\(\)\{[^}]*soloOn/, 'and the canvas follows one predicate');
  assert.match(wx, /if\(streaksWanted\(\)\)\{ ensureRenderer\(\)/, '…which _applyParts is the only reader of');

  /* …and the COLOUR RASTER stays gated on the wind layer: a reader who asked for streaks over the
     temperature field did not ask for the wind's colours on top of it */
  assert.match(wx, /if\(on&&key&&key!==liveKey\) ensureField\(key\)/,
    'the colour raster is still the wind LAYER’s alone');

  /* switching the wind layer off must not stop an overlay another legend turned on */
  assert.match(wx, /function stop\(\)\{[\s\S]{0,400}?if\(!soloOn\) _quiesce\(\)/,
    'stop() only tears down when nothing else wants the field');
  assert.match(wx, /function disposeWind\(\)\{[\s\S]{0,300}?if\(soloOn\) return;/,
    'and the GL objects are not handed back while they are still being drawn with');
});

test('R337 ① the preference lives in the temperature legend, has one door, and Atlas comes through it', () => {
  const wx = code('js/weather.js');

  /* the temperature legend owns the PREFERENCE and pushes an effective value — one writer */
  assert.match(wx, /TPARTS_KEY\s*=\s*'intmap_wx_temp_parts'/, 'the preference has its own key');
  assert.match(wx, /let tempParts=false/, '…and is OFF by default (the streaks cost a forecast read)');
  assert.match(wx, /W\.setSolo\(!!\(tempParts&&state\['ec-temp'\]&&state\['ec-temp'\]\.on\)\)/,
    'what crosses between the two modules is the box AND the layer, resolved once');
  assert.match(wx, /function syncLegend\(\)\{[\s\S]{0,200}?pushWindSolo\(\)/,
    'and it is pushed from the one place every on/off path already goes through');

  /* the row is in the LEGEND (#R16 / docs/MAP-LAYERS.md §7.10), on the layer that was asked about */
  assert.match(wx, /function windPartsRow\(cfg\)\{\s*if\(cfg\.id!=='ec-temp'\) return ''/,
    'the row belongs to the temperature legend and to no other');
  assert.match(wx, /\+opRow\(cfg\)\+windPartsRow\(cfg\)\+/, '…and is rendered inside that legend body');

  /* ⚠ ONE STATE, ONE DOOR: the legend box, Atlas's dispatch and Atlas's inline toggle must all
     reach the same function, or two of them can hold different ideas of the answer (#R313 ①) */
  assert.match(wx, /window\._imWxTempParts=\(v\)=>/, 'the preference has exactly one published door');
  const ac = code('js/atlas-console.js');
  assert.match(ac, /window\._imWxTempParts\(want\)/, 'Atlas dispatch goes through it');
  assert.match(ac, /tempWindParticles:\{[\s\S]{0,500}?window\._imWxTempParts/,
    'and so does the inline toggle a reply carries');
  assert.match(ac, /_featTogHtml\('tempWindParticles'\)/, '…which the dispatch actually emits');
  assert.match(read('js/atlas-catalog-text.js'), /"over":"temperature"/,
    'the SYS catalogue documents the argument, or the planner can never emit it');

  /* the two variables the streaks read are warmed on a time step in BOTH cases */
  assert.match(wx, /W\.solo&&W\.solo\(\)[^;]*vars\.push\('wind_u_component_10m'/,
    'a time step warms u and v when the streaks are up without the wind layer');
});


/* ══════════════════════════════════════════════════════════════════════════
   ② the starter chips: measured on the OUTPUT, and with the NAME TAKEN BACK OUT
   ═══════════════════════════════════════════════════════════════════════ */
const { makeAtlasExamples } = await import('../js/atlas-examples.js');

/* ⚠⚠⚠ THE FIRST VERSION OF THIS CHECK PASSED FOR THE WRONG REASON, AND THE REASON IS THE REPORT
   ITSELF. Comparing the chips as they are RENDERED found zero overlap between every pair of
   countries — because each chip carries the country's own name, so two mail-merged copies of one
   sentence are never the same string. That is precisely the illusion 「まだほぼ定型文」 is about.
   Every comparison below is therefore made with the name masked back out, so what is compared is
   the QUESTION and not the substitution. */
const mask = (name, list) => list.map((s) => s.split(name).join('{}'));

/* a synthetic world of about the size of the real one — the bands the pool uses are 「top 25」 and
   「bottom 90」, which mean something quite different in a table of 70 rows than in one of 195, and
   a fixture that gets that wrong tests a pool nobody ships. PLAIN sits at the median of every
   distribution, so nothing but the always-eligible tail can be true of it. */
/* ⚠ A SYNTHETIC WORLD THE SIZE OF THE REAL ONE. The pool's bands are 「top 25」 and 「bottom 90」,
   which mean something quite different in a table of 70 rows than in one of 200 — a fixture that
   gets that wrong tests a pool nobody ships. 240 filler states spread LINEARLY across every
   distribution, and each shape's one distinguishing value is taken from a PERCENTILE of that same
   spread rather than typed, so the fixture cannot drift out of step with the thresholds it feeds. */
const FILLER = (t) => ({
  pop: 2e5 + t * 9e7, area: 300 + t * 2e6, density: 3 + t * 700,
  gdp: 2 + t * 26000, gdppc: 400 + t * 110000, lifeExp: 52 + t * 33,
  internet: 8 + t * 91, hdi: 0.38 + t * 0.58, dem: 1.2 + t * 8
});
const at = (p) => FILLER(p);

function world() {
  const S = {};
  const put = (c, o) => { S[c] = Object.assign({
    code: c, nameEn: c, sov: true, subregion: 'Western Europe', capital: 'Cap',
    currency: 'XXX', languages: 'One', bbox: [10, 30, 11, 31], latlng: [30.5, 10.5]
  }, FILLER(0.5), { milSpend: FILLER(0.5).gdp * 0.05 }, o); };
  const N = 240;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1), v = FILLER(t);
    put('FIL' + String(i).padStart(3, '0'), Object.assign({}, v, {
      milSpend: v.gdp * (0.005 + t * 0.09), bbox: [10 + i * 0.02, 30, 11 + i * 0.02, 31] }));
  }
  put('PLAIN', {});    /* the median filler exactly — no band and no threshold can be true of it */
  put('PLAIN0', { capital: '', subregion: '', currency: '', languages: '', bbox: null,
                  gdp: null, gdppc: null, hdi: null, dem: null, lifeExp: null,
                  internet: null, milSpend: null });
  /* ⚠ each shape differs from PLAIN in exactly ONE fact, so what is measured is 「is one fact
     enough to change the row」. The boxes are kept apart deliberately: EQUATOR is under the tropics
     chip's area floor, TROPICS is off the equator, and TINYPOP gets a tiny BOX as well as a tiny
     area — otherwise the spread ratio would make it far-flung too and the shape would be two facts. */
  put('EQUATOR', { bbox: [10, -0.5, 10.9, 0.5], area: 40000, latlng: [0, 10.4] });
  put('ARCTIC', { bbox: [10, 58, 18, 71], latlng: [65, 14] });
  put('TROPICS', { bbox: [10, 5, 20, 20], area: 900000, latlng: [12, 15] });
  put('FARFLUNG', { bbox: [-60, 25, 56, 51], area: 400000, latlng: [38, 0] });
  put('POLYGLOT', { languages: 'One, Two, Three' });
  put('EUROZONE', { currency: 'EUR' });
  put('DOLLARISED', { currency: 'PAB / USD' });
  put('RICHCLOSED', { gdppc: at(0.97).gdppc, dem: 2.6 });
  put('BIGPOOR', { gdp: at(0.97).gdp, gdppc: at(0.20).gdppc });
  put('LONGLIFE', { lifeExp: at(0.95).lifeExp, gdppc: at(0.20).gdppc });
  put('TINYPOP', { pop: at(0.02).pop, area: 400, bbox: [10, 30, 10.06, 30.06] });
  put('POOREST', { gdppc: at(0.03).gdppc });
  put('SHORTLIFE', { lifeExp: at(0.03).lifeExp });
  put('WIRED', { internet: at(0.97).internet });
  put('MILOW', { milSpend: FILLER(0.5).gdp * 0.0005 });
  put('POPBIG', { pop: 3e8 });
  /* a country the pool knows FOUR things about — the fallback ordering has to leave it no tail */
  put('MULTI', { bbox: [-60, -22, 56, 51], area: 400000, latlng: [15, 0],
                 languages: 'One, Two, Three', currency: 'USD' });
  /* the antimeridian pair — same land area, one written as a ring that crosses ±180 */
  put('SCATTER', { area: 100, bbox: [0, 0.5, 1, 1.5], latlng: [1, 0.5] });
  put('SCATTERWRAP', { area: 100, bbox: [-180, 0.5, 180, 1.5], latlng: [1, 0.5] });
  return S;
}
const SHAPES = ['EQUATOR', 'ARCTIC', 'TROPICS', 'FARFLUNG', 'POLYGLOT', 'EUROZONE', 'DOLLARISED',
                'RICHCLOSED', 'BIGPOOR', 'LONGLIFE', 'TINYPOP', 'POOREST', 'SHORTLIFE', 'WIRED',
                'MILOW', 'POPBIG'];

/* the SHIPPED chooser, with the things it reads standing in for the browser's */
function raw(stats, opts) {
  const o = opts || {};
  const layers = o.layers || [];
  const pd = globalThis.document, pw = globalThis.window;
  globalThis.document = {
    getElementById: (id) => (id === 'layer-dropdown' ? {
      querySelectorAll: () => layers.map((l) => ({
        checked: true, id: l, type: 'checkbox', closest: () => null, parentElement: null }))
    } : null)
  };
  globalThis.window = { IntMapTime: { state: () => ({ isLive: o.year == null, year: o.year || null }) } };
  try {
    return makeAtlasExamples({ lang: 'en' }, {
      L: (en) => en,
      GE: () => ({ camera: { getCenter: () => ({ lng: 0, lat: 0 }),
                             getZoom: () => (o.zoom == null ? 6 : o.zoom) } }),
      codeAtPoint: () => o.code || '',
      countryStats: stats,
      cName: (st) => st.nameEn,
      loadCountryData: () => Promise.resolve(),
      panelEl: () => null,
      pick: () => {}
    }).examples();
  } finally { globalThis.document = pd; globalThis.window = pw; }
}
/* …and the same four with the country's own name taken back out, which is what may be compared */
const qs = (stats, opts) => mask((opts && opts.code) || '@none@', raw(stats, opts));

test('R337 ② one fact about a place is enough to change what the reader is asked', () => {
  const S = world();

  /* the module itself tells us what 「a country with nothing distinctive」 gets — the generic tail,
     DERIVED rather than typed, so rewording one of those sentences does not break this file */
  const TAIL = new Set([...qs(S, { code: 'PLAIN' }), ...qs(S, { code: 'PLAIN0' })]);
  assert.ok(TAIL.size >= 5 && TAIL.size <= 8,
    'the tail is the handful of always-eligible questions (' + TAIL.size + ')');

  /* it still fills four slots for a country the tables know nothing about — that is its job */
  const bare = raw(S, { code: 'PLAIN0' });
  assert.equal(bare.length, 4, 'a country with no data still gets four chips');
  for (const c of bare) assert.ok(c && !/[{}]/.test(c), 'no unfilled placeholder ships: ' + c);

  /* ⚠⚠⚠ THE STRUCTURAL CLAIM. A country the pool knows several things about must be asked about
     THOSE THINGS and about nothing generic — the tail may not outrank a fact, whatever the
     weights say. Before this round it could and did: its six sentences carry weights 2–5, which
     beat an ordinary attribute. */
  const multi = qs(S, { code: 'MULTI' });
  assert.equal(multi.filter((x) => TAIL.has(x)).length, 0,
    'a country with four or more real facts is asked no generic question at all');

  /* ⚠ AND ONE FACT IS ENOUGH. Each shape differs from the median country in exactly one value. */
  const picked = {}, own = {};
  for (const k of SHAPES) {
    const c = qs(S, { code: k });
    picked[k] = c;
    own[k] = c.filter((x) => !TAIL.has(x));
    assert.equal(c.length, 4, k + ' gets four chips');
    for (const x of raw(S, { code: k })) assert.ok(x && !/[{}]/.test(x), k + ' fills every slot: ' + x);
    assert.ok(own[k].length >= 1,
      k + ' is asked about the one thing that makes it different from the median country');
  }

  /* ── and no two shapes are asked the SAME specific question: each fact has its own ── */
  for (let i = 0; i < SHAPES.length; i++) {
    for (let j = i + 1; j < SHAPES.length; j++) {
      const b = new Set(own[SHAPES[j]]);
      const shared = own[SHAPES[i]].filter((x) => b.has(x));
      assert.equal(shared.length, 0,
        SHAPES[i] + ' and ' + SHAPES[j] + ' share a specific question: ' + shared.join(' | '));
    }
  }
});

test('R337 ② the value a chip substitutes is a number, not a word that exists only in English', () => {
  const S = world();
  /* #R313 追記 shipped 「Ulaanbaatarで起きていること…」 — a fully translated sentence with an
     untranslated value dropped into it, which `npm run check:i18n` cannot see because the TEMPLATE
     is complete. A count reads the same in all nine languages. */
  const poly = raw(S, { code: 'POLYGLOT' });
  assert.ok(poly.some((c) => /\b3\b/.test(c)), 'the language count is substituted, and it is a number');
  for (const c of poly) assert.ok(!/\{n\}/.test(c), 'and no chip ships the token itself');
});

test('R337 ② a ring that crosses the antimeridian is refused a longitudinal claim, not guessed at', () => {
  const S = world();
  const near = qs(S, { code: 'SCATTER' });
  const wrap = qs(S, { code: 'SCATTERWRAP' });
  const only = near.filter((c) => !wrap.includes(c));
  assert.equal(only.length, 1,
    'the two differ by exactly one chip — the one gated on how far the territory spreads');
  assert.equal(wrap.length, 4, 'and the country written across ±180 still gets four');
});

test('R337 ② the layer under the reader’s cursor reaches the chips', () => {
  const S = world();
  const plain = qs(S, { code: 'PLAIN' });
  for (const [layer, what] of [['dl-radar', 'what is falling now'], ['dl-sealevel', 'sea level'],
                               ['eco-dl-plates', 'plate boundaries'], ['dl-sats', 'satellites'],
                               ['beta-dl-dc', 'data centres'], ['dl-eez', 'maritime claims'],
                               ['dl-climate', 'climate zones'], ['dl-nightsat', 'night lights']]) {
    const withIt = qs(S, { code: 'PLAIN', layers: [layer] });
    assert.ok(withIt.some((c) => !plain.includes(c)),
      'switching ' + layer + ' on puts a question about ' + what + ' in front of the reader');
  }
  /* …and so does the world pool, for a reader looking at no country in particular */
  const none = qs(S, { zoom: 1.5 });
  assert.equal(none.length, 4, 'a hemisphere view still gets four chips');
  assert.ok(qs(S, { zoom: 1.5, layers: ['dl-sealevel'] }).some((c) => !none.includes(c)),
    'and they follow the layers too');
});

/* ══════════════════════════════════════════════════════════════════════════
   ③ NATO joins the one table that is allowed to move the camera
   ═══════════════════════════════════════════════════════════════════════ */
test('R337 ③ the NATO layer frames the members it actually paints, through the one table', () => {
  const home = code('js/layer-home.js');
  const dl = code('js/data-layers.js');

  assert.match(home, /HOMES\['dl-nato'\]/, 'NATO is in the table');
  assert.match(home, /IntMapNatoFC/, '…and is framed from the collection the layer paints');
  assert.match(dl, /window\.IntMapNatoFC\s*=/, 'which js/data-layers.js publishes');
  assert.match(dl, /IntMapLayerHome\.arrive\('dl-nato'\)/,
    'and the nato branch asks the table rather than flying itself');

  /* ⚠ NOT ITS OWN fitBounds. That is the copy #R313 removed from js/us-elections.js, and a fourth
     layer with its own box would be a fifth idea of 「once」 and of 「the reader asked」. */
  assert.ok(!/camera\.fitBounds\(/.test(dl), 'js/data-layers.js still has no frame of its own');
  assert.match(read('CONSTITUTION.md'), /NATO members/,
    'CONSTITUTION §3 enumerates the exception, so it has to name this layer too');

  /* ⚠ MEASURED, not asserted about: the SHIPPED `bboxOfFC` run over the shape the NATO layer really
     produces — one feature per member, grouped by code, biggest landmass kept. #R313 got the EU
     frame wrong the first time because Clipperton Island arrives as its own FEATURE under France's
     code; NATO has the same hazard (the Aleutians sit on the far side of ±180 under 'USA'), and the
     answer has to be the treaty area rather than the eastern Pacific. */
  const fnSrc = /function bboxOfFC[\s\S]*?\r?\n {2}\}\r?\n/.exec(read('js/layer-home.js'));
  assert.ok(fnSrc, 'bboxOfFC is a named function this test can lift out');
  const bboxOfFC = new Function('return (' + fnSrc[0].replace('function bboxOfFC', 'function') + ')')();
  const ring = (w, s, e, n) => [[[w, s], [e, s], [e, n], [w, n], [w, s]]];
  const fc = { type: 'FeatureCollection', features: [
    { properties: { __code: 'USA' }, geometry: { type: 'MultiPolygon', coordinates: [
      ring(-125, 24.5, -66.9, 49.4)[0], ring(-168, 54.5, -141, 71.4)[0], ring(172.4, 52.7, 179.8, 53.0)[0]
    ].map((r) => [r]) } },
    { properties: { __code: 'CAN' }, geometry: { type: 'Polygon', coordinates: ring(-141, 41.7, -52.6, 70.0) } },
    { properties: { __code: 'ISL' }, geometry: { type: 'Polygon', coordinates: ring(-24.5, 63.4, -13.5, 66.5) } },
    { properties: { __code: 'TUR' }, geometry: { type: 'Polygon', coordinates: ring(26.0, 35.8, 44.8, 42.1) } },
    { properties: { __code: 'NOR' }, geometry: { type: 'Polygon', coordinates: ring(4.6, 57.9, 31.1, 71.2) } }
  ] };
  const box = bboxOfFC(fc, true);
  assert.ok(box, 'the collection frames');
  const w = box[0][0], s = box[0][1], e = box[1][0], n = box[1][1];
  assert.ok(w > -145 && w < -120,
    'the west edge is North America, not an Aleutian island beyond the date line (' + w + ')');
  assert.ok(e > 40 && e < 50, 'the east edge is Turkey (' + e + ')');
  assert.ok(s > 20 && s < 40, 'the south edge is inside the treaty area (' + s + ')');
  assert.ok(n > 65 && n < 85, 'the north edge is the Arctic (' + n + ')');
});

/* ══════════════════════════════════════════════════════════════════════════
   ④ the Chronos Time slider has a ruler, and it is under the slider
   ═══════════════════════════════════════════════════════════════════════ */
test('R337 ④ the Time tab has real graduations, positioned from the value rather than spaced by flexbox', () => {
  const html = read('index.html');
  const js = code('js/news-timeline.js');
  const css = read('css/intmap.css');

  /* ⚠ IT IS DIRECTLY UNDER THE SLIDER. `.ntl-scale` sits on the far side of `.ntl-player`, so a
     ruler built into it would be separated from its own axis by a row of transport buttons. */
  const iSlider = html.indexOf('id="ntl-slider"');
  const iTicks = html.indexOf('id="ntl-ticks"');
  const iPlayer = html.indexOf('id="ntl-player"');
  assert.ok(iSlider > 0 && iTicks > iSlider, 'the ruler element exists and follows the slider');
  assert.ok(iTicks < iPlayer, '…and comes BEFORE the forecast transport, not after it');

  assert.match(js, /function buildTicks\(\)/, 'the ruler is built by its own function');
  assert.match(js, /for\(let hr=0;hr<=24;hr\+\+\)/, 'one mark per hour');
  assert.match(js, /hr%6===0/, 'every sixth one carries a label');
  assert.match(js, /p=\(mx>0\)\?\(v\/mx\):0/,
    'each mark is placed at its own value on the axis, not at an even share of the row');
  /* ⚠ THE RANGE IS ASKED FOR, NOT TYPED. #R210 made `_timeMaxMins` the one place the axis is
     stated; a ruler with 1440 written into it would keep its marks after that changes. */
  assert.match(js, /const mx=_timeMaxMins\(\)/, 'the end of the ruler comes from the axis');
  assert.ok(!/1440/.test(js), 'and nothing in this file types a day length of its own');

  /* it belongs to the Time tab only — Year and Date were not part of the report */
  assert.match(js, /if\(mode!=='time'\)\{ ticks\.innerHTML=''/, 'the other two tabs keep the row they had');
  assert.match(js, /buildTicks\(\); \}/, 'and buildScale drives it, so a tab change rebuilds it');

  /* ⚠ THE RAIL IS INSET BY HALF A THUMB, or every mark drifts from the value it names at the ends */
  assert.match(css, /\.ntl-ticks\{[^}]*--tk-half/, 'the ruler knows how wide half a thumb is');
  assert.match(css, /left:calc\(var\(--tk-half\) \+ \(100% - var\(--tk-half\) \* 2\) \* var\(--p,0\)\)/,
    'and every mark is placed inside that inset');
  assert.match(css, /\.ntl-ticks \.ntl-tk\.maj i\{/, 'the labelled marks are drawn taller than the rest');
  assert.match(css, /\.ntl-ticks \.ntl-tk\.last b\{ transform:translateX\(-100%\)/,
    'and the end labels are pulled inside the panel rather than hanging off it');
});
