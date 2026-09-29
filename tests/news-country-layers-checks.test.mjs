/* ============================================================================
 *  IntMap · the NATO / EU membership layers — palette and frame
 * ----------------------------------------------------------------------------
 *  加盟年別の色分け（js/data-layers.js _WAVEPAL）と、NATO レイヤーの視野（js/layer-home.js）。
 *
 *  ⚠ 主題単位へ統合した検査（旧ラウンド単位のファイルから、題名を保ったまま移した）。
 *    各節はブロックに包んであり、補助の名前は節ごとに閉じている（別ファイルだった頃と同じ隔離）。
 *    「綴りのまま:」の注記は、評価に置き換えられない検査がなぜそうなのかを 1 行で言う。
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { readLF } from '../scripts/eol.mjs';

/* ════════ #R290 — from tests/r290-checks.test.mjs (1 of its 16 tests) ════════ */
{
/* ============================================================================
 *  IntMap · #R290 source checks — the two silences, the weight, and the clocks
 * ----------------------------------------------------------------------------
 *  Fifteen instructions arrived in one message. The ones with a shape a source-level check can
 *  hold are here; the rest were measured in a real browser while the round was being written and
 *  the numbers are recorded in DEV-NOTES.md.
 *
 *  ⚠ SOURCES ARE READ THROUGH scripts/eol.mjs — line endings belong to the CHECKOUT, not to the
 *  file (#R283). A check that spelt a line break literally would be red on one platform and green
 *  on the other, for a reason that is not its subject.
 *  ⚠ COMMENTS ARE STRIPPED BEFORE ANY «X IS GONE» SEARCH. This round's own notes quote the exact
 *  shapes it removed — `openClock`, `unitsOf(c)?2:1`, `fillRect(0,0,S,S)`, `C.on(_followClock)` —
 *  so a check reading the raw file would fail on the sentence explaining the fix. That mistake has
 *  been made sixteen times in this project ([[intmap-recurring-lessons]]).
 * ==========================================================================*/
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (p) => readLF(resolve(ROOT, p));
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
const WP = () => codeOnly(read('js/world-packs.js'));
const WX = () => codeOnly(read('js/weather.js'));
const EC = () => codeOnly(read('js/wx-ecmwf.js'));

/* ── ⑮ 「加盟年別の色分けの色味が分かりにくい」 — MEASURE IT ──────────────────────────────────
   ΔE00 ≈ 2.3 is the just-noticeable difference for large flat areas. The eleven NATO waves were
   sampled out of a ten-anchor viridis ramp, which put the closest pair at 8.1 — across country
   fills at 55 % opacity over a basemap that is not a distinction anyone can hold. This test
   COMPUTES the separation rather than trusting a number in a comment.

   ⚠⚠ (#R293) THE CRITERION CHANGED, BECAUSE THE READER CHANGED IT: 「ランダムな色の分け方ではなく、
   古いのから新しいのまで、赤から紫に連続的に。」 #R290 maximised separation and got 26.1 by sweeping
   hue a full turn — which begins at dark blue, ends at lavender and passes red in the middle, i.e.
   it is far apart and it is not an ORDER. A ramp constrained to run red → purple cannot also be
   the furthest-apart set, so this test now asserts BOTH of the things that are actually required:
   the sweep is monotone from red to purple, and the separation is still far above the JND and far
   above what it replaced. MEASURED for the shipped ramp: closest pair 23.9 (CIE76), and it is
   always an ADJACENT pair — two waves that could be confused are neighbours in time. */
test('R290 ⑮ the accession palette is measurably easier to tell apart', () => {
  const dl = read('js/data-layers.js');
  const m = /const _WAVEPAL=(\[[^\]]*\]);/.exec(dl);
  assert.ok(m, 'the palette must be one array literal');
  const PAL = new Function(`return ${m[1]};`)();
  assert.equal(PAL.length, 11, 'eleven entries — NATO’s eleven waves');
  assert.ok(!/_VIRIDIS/.test(dl), 'the ramp it replaces is gone');
  /* yearColors takes an ENTRY per wave when there are no more waves than entries — sampling a
     gradient is what produced the 8.1 in the first place */
  assert.match(dl, /\(n<=P\)\?_WAVEPAL\[Math\.round\(i\*\(P-1\)\/\(n-1\)\)\]/);

  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const lab = (rgb) => {
    const [r, g, b] = rgb.map((v) => { v /= 255; return v > 0.04045 ? ((v + 0.055) / 1.055) ** 2.4 : v / 12.92; });
    const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    const x = f((r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047);
    const y = f(r * 0.2126 + g * 0.7152 + b * 0.0722);
    const z = f((r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883);
    return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
  };
  const de = (A, B) => {  /* CIE76 — a lower bound on ΔE00 for this comparison, and enough here */
    return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
  };
  const labs = PAL.map((c) => lab(hex(c)));
  let worst = Infinity, worstPair = [-1, -1];
  for (let i = 0; i < labs.length; i++) for (let j = i + 1; j < labs.length; j++) {
    const d = de(labs[i], labs[j]); if (d < worst) { worst = d; worstPair = [i, j]; } }
  /* CIE76: 23.9 for this ramp, 26.1 for #R290's hue-wheel set, 12.8 for the viridis sampling both
     of them replace. Ten times the 2.3 JND either way. */
  assert.ok(worst >= 20, `the closest pair in the whole set is ΔE ${worst.toFixed(1)} — it must stay far apart`);
  /* (#R293) …and the pair that is closest is a NEIGHBOUR. On a continuous ramp the only colours
     that come near each other are consecutive waves; two DISTANT waves resolving to nearly the
     same colour would be the 「ランダム」 the reader is objecting to, whatever the minimum is. */
  assert.equal(worstPair[1] - worstPair[0], 1,
    `the closest pair is ${worstPair.join('/')} — on a continuous ramp it has to be adjacent`);
  /* (#R293) 「赤から紫に連続的に」 — the hue sweeps ONE WAY, from red, all the way round to purple. */
  const hueOf = (l) => { const h = Math.atan2(l[2], l[1]) * 180 / Math.PI; return h < 0 ? h + 360 : h; };
  const hues = labs.map(hueOf);
  assert.ok(hues[0] < 60, `the oldest wave must be RED — its hue is ${hues[0].toFixed(0)}°`);
  let prev = -Infinity, span = 0;
  for (const x of hues) { let v = x; if (v < prev - 180) v += 360;
    assert.ok(v >= prev, `the hue sweep must be monotone — ${x.toFixed(0)}° follows ${prev.toFixed(0)}°`);
    prev = v; }
  span = prev - hues[0];
  assert.ok(span > 250 && span < 400, `the sweep must reach purple the long way round — it spans ${span.toFixed(0)}°`);
  /* the viridis sampling this replaces, computed the same way, for the comparison to be a fact */
  const VIR = ['#440154', '#482878', '#3e4a89', '#31688e', '#26828e', '#1f9e89', '#35b779', '#6ece58', '#b5de2b', '#fde725'];
  const mix = (a, b, t) => { const A = hex(a), B = hex(b); return A.map((v, i) => Math.round(v + (B[i] - v) * t)); };
  const old = [];
  for (let i = 0; i < 11; i++) { const x = (i / 10) * (VIR.length - 1), k = Math.min(VIR.length - 2, Math.floor(x)); old.push(mix(VIR[k], VIR[k + 1], x - k)); }
  const ol = old.map(lab);
  let oldWorst = Infinity;
  for (let i = 0; i < ol.length; i++) for (let j = i + 1; j < ol.length; j++) oldWorst = Math.min(oldWorst, de(ol[i], ol[j]));
  assert.ok(worst > oldWorst * 1.5, `it is at least half again as separable as the ramp it replaces (${worst.toFixed(1)} vs ${oldWorst.toFixed(1)})`);
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
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
const WP = () => codeOnly(read('js/world-packs.js'));
const WX = () => codeOnly(read('js/weather.js'));
const EC = () => codeOnly(read('js/wx-ecmwf.js'));
const TL = () => codeOnly(read('js/news-timeline.js'));
const DL = () => codeOnly(read('js/data-layers.js'));
const MT = () => codeOnly(read('js/map-tools.js'));

/* ── ⑭ 「NATO/EU は赤から紫に連続的に」 — the ramp is measured in tests/news-country-layers-checks.test.mjs #R290 ⑮; here it is the
   DIRECTION that is pinned: the oldest wave is red and the newest is purple. ─────────────────── */
test('R293 ⑭ the accession ramp runs oldest-red to newest-purple', () => {
  const d = DL();
  const m = /const _WAVEPAL=\[([^\]]*)\];/.exec(d);
  assert.ok(m, 'one array literal');
  const pal = [...m[1].matchAll(/'(#[0-9a-f]{6})'/g)].map((x) => x[1]);
  assert.equal(pal.length, 11);
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const hue = (c) => { const [r, g, b] = c.map((v) => v / 255);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), dd = mx - mn; if (!dd) return 0;
    let h = mx === r ? 60 * (((g - b) / dd) % 6) : mx === g ? 60 * ((b - r) / dd + 2) : 60 * ((r - g) / dd + 4);
    return h < 0 ? h + 360 : h; };
  const first = hue(hex(pal[0])), last = hue(hex(pal[pal.length - 1]));
  assert.ok(first < 30 || first > 340, `the oldest wave must be RED — hue ${first.toFixed(0)}`);
  assert.ok(last > 265 && last < 320, `the newest must be PURPLE — hue ${last.toFixed(0)}`);
  /* oldest-first is how yearColors indexes it, so the direction is a fact about the map */
  assert.match(d, /\(n<=P\)\?_WAVEPAL\[Math\.round\(i\*\(P-1\)\/\(n-1\)\)\]/);
});
}

/* ════════ #R337 — from tests/r337-checks.test.mjs (1 of its 9 tests) ════════ */
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
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, ' ');


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

/* ══════════════════════════════════════════════════════════════════════════
   ③ NATO joins the one table that is allowed to move the camera
   ═══════════════════════════════════════════════════════════════════════ */
/* 綴りのまま: 主張が配線・不在・一意性（どこが何を呼ぶか／無いこと／1 か所だけ）で、評価して取り出せる値が無い */
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
}
