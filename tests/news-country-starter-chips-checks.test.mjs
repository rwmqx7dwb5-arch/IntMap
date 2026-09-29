/* ============================================================================
 *  IntMap · the Atlas starter chips a country earns — measured on the output
 * ----------------------------------------------------------------------------
 *  js/atlas-examples.js が国ごとに差し出す 4 つの問い。出力の集合について測る（文面は固定しない）。
 *
 *  ⚠ 主題単位へ統合した検査（旧ラウンド単位のファイルから、題名を保ったまま移した）。
 *    各節はブロックに包んであり、補助の名前は節ごとに閉じている（別ファイルだった頃と同じ隔離）。
 *    「綴りのまま:」の注記は、評価に置き換えられない検査がなぜそうなのかを 1 行で言う。
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly } from '../scripts/code-only.mjs';

/* ════════ #R337 — from tests/r337-checks.test.mjs (5 of its 9 tests) ════════ */
{
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
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readLF(resolve(ROOT, p));
/* comments in this project QUOTE the spellings they replaced, so a check that greps the raw file
   proves nothing — every source assertion reads the code with the comments taken out (#R313) */
const code = (p) => codeOnly(read(p));


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
  /* ⚠ (#R426) THE FOUR GEO CLAIMS BELOW READ `bboxAll`, NOT `bbox`. A country row now
     publishes two boxes (js/country-extent.js): `bbox` is the FRAME — where the country is,
     with remote territory trimmed off — and `bboxAll` is the union of everything it owns.
     Every claim this file pins is about the WHOLE TERRITORY (`spread` IS the measurement of
     outlying territory; `arctic` is answered for the United States by Alaska), so they read
     the union. The fixture mirrors what `_mkStat` writes, so a case that names one box gets
     both — which is what a real row looks like. */
  const put = (c, o) => { const r = Object.assign({
    code: c, nameEn: c, sov: true, subregion: 'Western Europe', capital: 'Cap',
    currency: 'XXX', languages: 'One', bbox: [10, 30, 11, 31], latlng: [30.5, 10.5]
  }, FILLER(0.5), { milSpend: FILLER(0.5).gdp * 0.05 }, o);
    if (r.bboxAll === undefined) r.bboxAll = r.bbox;
    S[c] = r; };
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
  /* ⚠⚠⚠ (#R337 追記) NORWAY, AS THE TABLES ACTUALLY HOLD IT. Bouvet Island is Norwegian, so the
     country's EXTENT reaches −54.4° — a box that spans the equator, and a box whose middle is
     8.4°N. Production shipped 「The equator runs through Norway」 and did NOT ship the short-winter
     question, both from the same mistake: an extent is not a location. */
  put('REMOTEISLE', { bbox: [4.6, -54.4, 31.1, 71.2], latlng: [64.0, 10.0] });
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
      /* ⚠ (#R392) THE CAMERA SITS OVER THE FIXTURE'S OWN COUNTRIES, which it did not have to before.
         This harness pinned the centre at (0°, 0°) — an accidental detail while the pool could only
         read the country the centre pixel fell in. #R392 added candidates gated on the VIEW, and one
         of them asks whether the equator crosses the frame; at (0, 0) it crosses every frame, so
         every fixture country was handed the same view chip and this file's 「one fact changes the
         row」 property broke for a reason that had nothing to do with the fact being varied.
         `world()` puts every shape in bbox [10, 30, 11, 31], so the camera is put there too and the
         view contributes nothing — which is what lets this test go on measuring the country pool. */
      GE: () => ({ camera: { getCenter: () => ({ lng: 10.5, lat: 30.5 }),
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

test('R337 追記 ②: a country whose EXTENT spans the equator is not told the equator runs through it', () => {
  const S = world();
  const TAIL = new Set([...qs(S, { code: 'PLAIN' }), ...qs(S, { code: 'PLAIN0' })]);
  const own = (code) => qs(S, { code }).filter((x) => !TAIL.has(x));

  /* the country that really is on the equator keeps its question */
  const equator = own('EQUATOR');
  assert.ok(equator.length >= 1, 'a country on the equator is still asked about it');

  /* ⚠ MEASURED ON PRODUCTION: Norway was told 「The equator runs through Norway」 because Bouvet
     Island drags its extent to −54.4°. The box spans the equator; the country does not sit on it. */
  const remote = own('REMOTEISLE');
  const shared = remote.filter((x) => equator.includes(x));
  assert.equal(shared.length, 0,
    'a northern country with one remote southern dependency is asked none of the equator questions: '
    + JSON.stringify(shared));

  /* …and the same box made its MIDPOINT 8.4°N, which is why the short-winter question did not
     fire for the country it was written for. The label point puts it back. */
  assert.ok(remote.length >= 1,
    'and it IS asked the question its own latitude earns — the label point, not the box middle');
  const north = own('REMOTEISLE');
  assert.ok(north.some((x) => !own('TROPICS').includes(x)),
    'the question it gets is not one a tropical country would get');
});
}
