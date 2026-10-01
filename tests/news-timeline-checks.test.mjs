/* ============================================================================
 *  IntMap · Chronos — the one clock panel
 * ----------------------------------------------------------------------------
 *  js/news-timeline.js（Chronos パネル）と、その時計が動かすもの（歴史国境の日単位の選択を含む）。
 *
 *  ⚠ 主題単位へ統合した検査（旧ラウンド単位のファイルから、題名を保ったまま移した）。
 *    各節はブロックに包んであり、補助の名前は節ごとに閉じている（別ファイルだった頃と同じ隔離）。
 *    「綴りのまま:」の注記は、評価に置き換えられない検査がなぜそうなのかを 1 行で言う。
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs, { readFileSync, existsSync, statSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import path, { resolve, dirname } from 'node:path';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly } from '../scripts/code-only.mjs';

/* ════════ #R290 — from tests/r290-checks.test.mjs (2 of its 16 tests) ════════ */
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
const WP = () => codeOnly(read('js/world-packs.js'));
const WX = () => codeOnly(read('js/weather.js'));
const EC = () => codeOnly(read('js/wx-ecmwf.js'));

/* ── ⑧ 「Chronosの地図中心の標準時にする機能、機能していない。」 ──────────────────────────────
   MEASURED on the built page: Object.keys(window.IntMapTimeZones) was ['highlight','highlighted',
   'clear']. #R289 published `ensure` / `ready` / `offsetAt` under that name and the #R204 accessor
   forty lines further down ASSIGNED the same name, erasing them — so `zSpec()` fell through to
   {local:true} and the option silently handed every reader their own device clock. */
/* 綴りのまま: 主張が配線・不在・一意性（どこが何を呼ぶか／無いこと／1 か所だけ）で、評価して取り出せる値が無い */
test('R290 ⑧ window.IntMapTimeZones is one object, and every publisher extends it', () => {
  const lp = codeOnly(read('js/layer-packs.js'));
  const assigns = lp.match(/window\.IntMapTimeZones\s*=/g) || [];
  assert.equal(assigns.length, 2, 'there are two publishers in this file');
  assert.equal((lp.match(/window\.IntMapTimeZones=Object\.assign\(window\.IntMapTimeZones\|\|\{\},/g) || []).length, 2,
    'and BOTH of them extend rather than replace');
  assert.ok(!/window\.IntMapTimeZones=\{/.test(lp), 'nothing assigns the name outright');
  for (const m of ['ensure:', 'ready:', 'offsetAt:', 'highlight:', 'highlighted:', 'clear:'])
    assert.ok(lp.includes(m), `the one object carries ${m}`);
  /* the caller has not changed — it is the accessor that was missing */
  const tl = codeOnly(read('js/news-timeline.js'));
  assert.match(tl, /h=window\.IntMapTimeZones\.offsetAt\(c\.lng,c\.lat\)/);
});

/* ── ⑨ 「未来を見てるときに『過去を表示中・タップ』と出てくる」 / 「反映内容…はいらない」 ─────── */
test('R290 ⑨ the collapsed Chronos button reads the instant, and the Applied block is gone', () => {
  const tl = read('js/news-timeline.js');
  /* ⚠⚠⚠ (#R293) THE SAME CLAIM WAS BEING MADE BY TWO ELEMENTS AND ONLY ONE OF THEM WAS FIXED.
     「Chronosポップアップの『過去表示中』は未来でもその表示。」 #R290 taught the COLLAPSED button's
     subtitle to read the instant; `#ntl-badge` — the one inside the open panel, which is the one
     the reader named — was still written from the localiser with the word hard-coded. MEASURED on
     production with the clock two days ahead: `#ntl-open-s` 「Viewing the future」 and `#ntl-badge`
     「Viewing the past」 in the same frame.
     → one function decides the word, and this test now requires that BOTH readers call it. */
  /* ⚠ (tests-by-topic) EVALUATED: the three spellings that stood here (`function sideWord(w){…
     w.getTime()>Date.now()` and the two `L5('Viewing …')` calls) are replaced by RUNNING the shipped
     `sideWord` — one hour ahead of now and one hour behind — with the localiser it closes over
     answering in the language asked for. What they meant is 「which side of now the instant is on
     decides the words」, and that is a statement about its output. */
  const swSrc = (() => {
    const i = tl.indexOf('function sideWord(w)');
    assert.ok(i >= 0, 'sideWord is still the one function that decides the word');
    let d = 0;
    for (let k = tl.indexOf('{', i); k < tl.length; k++) {
      if (tl[k] === '{') d++;
      else if (tl[k] === '}' && !--d) return tl.slice(i, k + 1);
    }
    return '';
  })();
  for (const [lang, fut, past] of [[0, 'Viewing the future', 'Viewing the past'], [1, '未来を表示中', '過去を表示中']]) {
    const sideWord = new Function('L5', swSrc + '\nreturn sideWord;')((...a) => a[lang]);
    assert.equal(sideWord(new Date(Date.now() + 3600e3)), fut, 'an instant after now reads as the future');
    assert.equal(sideWord(new Date(Date.now() - 3600e3)), past, 'an instant before now reads as the past');
  }
  /* 綴りのまま: 以下は「どこが呼ぶか」「何が消えたか」という配線と不在の主張で、評価する値が無い */
  assert.equal((codeOnly(tl).match(/sideWord\(/g) || []).length, 4,
    'one declaration and three callers — the badge twice (localise + refresh) and the subtitle');
  assert.match(tl, /if\(badge&&!e\.isLive\) badge\.textContent=sideWord\(e\.when\);/,
    'the badge is written where the instant arrives, not once from the localiser');
  assert.match(tl, /os\.textContent=sideWord\(e\.when\);/, '…and so is the collapsed subtitle');
  assert.ok(!/Viewing the past · tap/.test(codeOnly(tl)), '「タップ」 is gone — the element is a button already');
  /* the 「反映内容」 block and everything that existed only to fill it */
  const code = codeOnly(tl);
  assert.ok(!/function buildSynced\(/.test(code), 'the builder is gone');
  assert.ok(!/ntl-synced/.test(code), '…and so is the element it wrote into');
  assert.ok(!/function kEra\(/.test(code) && !/function hbAt\(/.test(code),
    '…and the helpers that only fed it');
  assert.match(code, /window\._imTimeSyncedRefresh=\(\)=>\{\};/,
    'the hook other modules poke stays declared, so a stale caller is not a TypeError');
  assert.ok(!/id="ntl-synced"/.test(read('index.html')), 'the markup is gone too');
  /* every language the app ships has the new word */
  const LOC = { en: 'ui.en.js', jp: 'ui.jp.js', de: 'ui.de.js', ru: 'ui.ru.js', es: 'ui.es.js',
    fr: 'ui.fr.js', ko: 'ui.ko.js', zh: 'ui.zh.js', 'zh-hans': 'ui.zh-hans.js' };
  for (const [code2, f] of Object.entries(LOC)) {
    if (code2 === 'en' || code2 === 'jp' || code2 === 'de' || code2 === 'ru' || code2 === 'es') continue;
    assert.match(read('js/locales/' + f), /Viewing the future/, `${code2} declares it`);
  }
});
}

/* ════════ #R293 — from tests/r293-checks.test.mjs (2 of its 16 tests) ════════ */
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

/* ── ⑦ 「Chronosの地図中心の標準時にする機能、機能していない」 — the third cause ─────────────── */
/* 綴りのまま: 対象は DOM・地図（MapLibre / WebGL）に触れる closure の中で、ブラウザの外では走らない（実ブラウザ側は spec が持つ） */
test('R293 ⑦ the map-centre clock asks for its data from BOTH doors, and follows the camera', () => {
  const t = TL();
  assert.match(t, /function zoneEnsure\(n\)\{ if\(zone!=='map'\) return;/, 'asking is a function');
  /* ⚠⚠⚠ (#R293 追記) …AND IT WAITS FOR ITS OWNER. js/app-body.js calls this module at line 3041 and
     publishes the accessor at 4296, so at init `window.IntMapTimeZones` does not exist yet — the
     first version of this fix guarded with `TZ&&TZ.ensure` and thereby became a SECOND silent
     fallback in the same place as the first (measured on the deployed build: ready() false, the
     device clock shown for a map centred on New York). */
  assert.match(t, /if\(!TZ\|\|!TZ\.ensure\)\{ if\(\(n\|0\)<60\) setTimeout\(\(\)=>zoneEnsure\(\(n\|0\)\+1\),200\); return; \}/,
    'and it polls for the owner rather than giving up silently');
  assert.match(t, /TZ\.ensure\(\)\.then\(\(\)=>\{ try\{ refreshUI/, '…and it re-renders when the data lands');
  /* the two doors: the reader choosing it, and a preference restored from localStorage */
  /* the change handler and boot both call it; the retry ladder calls itself with a counter */
  assert.equal((t.match(/zoneEnsure\(\)/g) || []).length, 2,
    'TWO callers — the change handler and boot');
  assert.equal((t.match(/zoneEnsure\(/g) || []).length, 4,
    '…one declaration, two callers, and the retry');
  assert.match(t, /tl\.classList\.add\('collapsed'\); localizeChrome\(\); applyMode\('year'\);\s*zoneEnsure\(\);/,
    'a restored preference fires no change event, so boot has to ask');
  /* 「地図中心の」 is a claim about where the camera IS */
  assert.match(t, /E\.events\.on\('moveend',\(\)=>\{ try\{ if\(zone==='map'/,
    'and the answer follows the camera');
});

/* ── ⑧ 「時刻と予報タブを分けるな」/「Chronosで時間を変更したら…すべての要素を合わせる」 ────── */
/* 綴りのまま: 対象は DOM・地図（MapLibre / WebGL）に触れる closure の中で、ブラウザの外では走らない（実ブラウザ側は spec が持つ） */
test('R293 ⑧ Chronos has one time tab, and the clock drives the weather', () => {
  const t = TL();
  assert.ok(!/ntl-mode-fc/.test(t), 'no fourth tab');
  assert.ok(!/mode==='forecast'/.test(t), '…and no fourth mode');
  assert.ok(!/id="ntl-mode-fc"/.test(read('index.html')), '…nor its markup');
  assert.match(t, /if\(mode!=='time'\|\|!fcReady\(\)\)\{ fcStop\(\); playerEl\.style\.display='none'/,
    'the transport lives inside the Time tab');
  /* the transport moves the CLOCK — that is what makes it one control rather than two */
  /* (module-graph) js/news-timeline.js imports IntMapTime from js/chronos.js and writes the bare binding */
  assert.match(t, /function fcGo\(i\)\{[\s\S]{0,220}IntMapTime\.set\(new Date\(t\),\{allowFuture:true,source:'ui'\}\);/);
  assert.ok(!/E2\.setIndex\(/.test(t), 'and it never writes the model’s index behind the clock’s back');
  /* the date picker can reach where the clock can now go */
  assert.match(t, /function fcMaxISO\(\)\{/);
  assert.match(t, /datePicker\.max=fcMaxISO\(\);/);

  /* the pull is wired; the push is still cut (#R290's half of the instruction stands) */
  const e = EC();
  assert.match(e, /C\.on\(function\(e\)\{ try\{ _followClock\(e\); \}/, 'the master clock drives the axis');
  assert.match(e, /function _pushClock\(\) \{\}/, 'a forecast step still writes nothing back');
  assert.match(e, /if \(!covers\(ms\)\) return;/, 'travelling to 1972 is not a request for a forecast');
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

/* ══════════════════════════════════════════════════════════════════════════
   ④ the Chronos Time slider has a ruler, and it is under the slider
   ═══════════════════════════════════════════════════════════════════════ */
/* 綴りのまま: 対象は DOM・地図（MapLibre / WebGL）に触れる closure の中で、ブラウザの外では走らない（実ブラウザ側は spec が持つ） */
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
}

/* ════════ #R378 — from tests/r378-checks.test.mjs ════════ */
{
/* ============================================================================
 *  IntMap · #R378 — source-level checks
 * ----------------------------------------------------------------------------
 *  「Chronosポップアップに、年/日付/時刻の下に置くのではなく外に、直接年月日時選ぶとこ作って。
 *    （よくあるUI。独自UIを作らなくてよい。）」
 *
 *  ⚠ THE PROPERTY IS 「OUTSIDE」, AND «THE ELEMENT EXISTS» IS NOT IT. A datetime field added as a
 *  fourth mode, or shown only in one tab, would satisfy every check that merely finds it in the
 *  markup — and it is exactly the shape the instruction rules out. So the assertions here are about
 *  where the control is NOT: not inside `#ntl-modes`, never named by `applyMode`, and written on the
 *  common path of `refreshUI` rather than inside one of its three branches.
 *
 *  ⚠ AND «IT IS THE BROWSER'S OWN CONTROL» IS ASSERTED AS A TYPE, NOT AS A LOOK. 「独自UIを作らなく
 *  てよい」 — `type="datetime-local"` is the whole of it; a hand-rolled set of <select>s would pass a
 *  check that only looked for three number fields.
 *
 *  ⚠ EVERY SOURCE READ GOES THROUGH `readLF()` (#R283) and every code assertion through `codeOnly()`
 *  (#R345, scripts/code-only.mjs): this project's comments QUOTE the spellings they discuss, so a
 *  check that greps the raw file can be answered by the prose above rather than by the code — which
 *  has now happened eleven times.
 * ==========================================================================*/
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readLF(resolve(ROOT, p));
const code = (p) => codeOnly(read(p));

/* the body of a named function declaration, brace-counted — so «applyMode never mentions it» is a
   statement about that function and not about whatever happens to follow it in the file */
function fnBody(src, name) {
  const i = src.indexOf('function ' + name + '(');
  assert.ok(i >= 0, `function ${name} not found`);
  let d = 0, j = src.indexOf('{', i);
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(j, k + 1); }
  }
  throw new Error(`unbalanced braces in ${name}`);
}

/* ══════════════════════════════════════════════════════════════════════════
   ① the control exists, it is the platform's own, and it is NOT one of the tabs
   ═══════════════════════════════════════════════════════════════════════ */
/* 綴りのまま: 主張が CSS / HTML の規則・markup の存在で、それが当たるか（計算済みスタイル）はブラウザにしか無い */
test('R378 ① the direct picker is a native datetime-local, outside the Year/Date/Time tab strip', () => {
  const html = read('index.html');

  assert.match(html, /<input type="datetime-local" id="ntl-jump"/,
    '「独自UIを作らなくてよい」 — the year/month/day/hour picker is not the browser’s own control');
  assert.match(html, /<label class="ntl-jumprow" for="ntl-jump">/,
    'the row is a <label for>, so the text beside the field focuses it without a second aria string');

  /* ⚠ NOT INSIDE THE TAB STRIP. `#ntl-modes` is the three buttons; a fourth control in there would
     be 「年/日付/時刻の下」 in the most literal sense available. */
  const modes = /<div class="ntl-modes"[\s\S]*?<\/div>/.exec(html);
  assert.ok(modes && !/ntl-jump/.test(modes[0]), 'the picker is inside the tab strip');

  /* …and it stands in the panel's ALWAYS-VISIBLE band — above `#ntl-date` and `#ntl-time`, the two
     inputs that really are owned by a tab */
  const at = (s) => html.indexOf(s);
  assert.ok(at('id="ntl-jump"') > at('id="ntl-zone"'), 'the picker does not sit with the other panel-wide row');
  assert.ok(at('id="ntl-jump"') < at('id="ntl-date"'), 'the picker sits below the tab-scoped inputs');

  /* ⚠ AND THE TAB-SCOPED INPUTS ARE STILL TAB-SCOPED. 「外に」 is answered by adding a row that no
     tab owns, NOT by making every row always-visible — that would be a different panel. */
  const js = code('js/news-timeline.js');
  const am = fnBody(js, 'applyMode');
  assert.match(am, /datePicker\.style\.display=\(m==='date'\)/, 'the Date tab stopped owning its own picker');
  assert.match(am, /timePicker\.style\.display=\(m==='time'\)/, 'the Time tab stopped owning its own picker');
});

/* ══════════════════════════════════════════════════════════════════════════
   ② no mode decides whether it is there, and no branch decides whether it is current
   ═══════════════════════════════════════════════════════════════════════ */
/* 綴りのまま: 対象は DOM・地図（MapLibre / WebGL）に触れる closure の中で、ブラウザの外では走らない（実ブラウザ側は spec が持つ） */
test('R378 ② applyMode never names the picker, and refreshUI writes it on the path every mode takes', () => {
  const js = code('js/news-timeline.js');

  /* ⚠ THE STRUCTURAL FORM OF 「タブの下ではなく外に」: the function that switches tabs cannot so
     much as mention this control. If it ever does, the row has acquired an owner. */
  assert.ok(!/jumpEl/.test(fnBody(js, 'applyMode')),
    'applyMode names the direct picker — it has become a tab-scoped control');

  /* refreshUI has three branches (time / live / a chosen past instant). The picker is written after
     them, beside buildZones(), which is the only place that runs whatever the mode is. */
  const ru = fnBody(js, 'refreshUI');
  assert.match(ru, /buildZones\(\);\s*if\(jumpEl\)\{ const lo=/,
    'the picker is not written on the common path — some mode decides whether it is current');
  assert.equal((ru.match(/jumpEl\.value=/g) || []).length, 1, 'more than one place writes the field');

  /* the reader typing a year walks the value through instants the kernel clamps; a control reset
     under the caret cannot be typed into at all */
  assert.match(ru, /document\.activeElement!==jumpEl/, 'the field is rewritten while it has focus');
});

/* ══════════════════════════════════════════════════════════════════════════
   ③ the two halves a native control cannot know: which zone, and which instants
   ═══════════════════════════════════════════════════════════════════════ */
/* 綴りのまま: 対象は DOM・地図（MapLibre / WebGL）に触れる closure の中で、ブラウザの外では走らない（実ブラウザ側は spec が持つ） */
test('R378 ③ the wall clock it shows is the zone the reader chose, and its bounds are the kernel’s and the model’s', () => {
  const js = code('js/news-timeline.js');

  /* ⚠ `datetime-local` carries NO zone. #R289's whole point is that this panel prints and reads an
     instant in the zone the reader picked, so both directions go through that pair — a bare
     `new Date(value)` here would mean 「the device's 14:30」 whatever the selector says. */
  assert.match(js, /function jumpValue\(d\)\{ const f=zFields\(d\);/, 'the field is printed without the chosen zone');
  assert.match(js, /function jumpParse\([\s\S]*?zInstant\(\{Y:Y,/, 'the field is read back without the chosen zone');
  assert.ok(!/new Date\(jumpEl\.value/.test(js), 'the value is parsed as a device-local string');

  /* the floor is the kernel's and is read live — #R349 removed four copies of `1900` from this file
     for exactly this reason, and a fifth copy would be the same defect.
     WARNING (#R604) THIS NAMED THE IMPLEMENTATION AND THE IMPLEMENTATION WAS WRONG. It asserted the
     exact text `const floorMs=()=>Date.UTC(YMIN(),0,1)` — and `Date.UTC(1,0,1)` is 1901, so once the
     kernel floor came down to year 1 this check REQUIRED the bug: the panel advertised a floor
     nineteen centuries above the one it claimed to read, and this line went green over it. Two
     properties are what R378 actually meant, and neither of them is a spelling:
       - the floor is read from the kernel at call time, never held here (#R349);
       - it is not built through `Date.UTC`, which silently rewrites any year under 100.
     The instant it produces is asserted end-to-end by tests/smoke.spec.js R378 ①, which reads the
     `min` attribute the control ends up with — the only place the two-digit-year rule was visible. */
  const floor = /const floorMs\s*=\s*\(\)\s*=>\s*([\s\S]*?);\n/.exec(js);
  assert.ok(floor, 'floorMs is gone or was renamed — this check has to follow it');
  assert.match(floor[1], /YMIN\(\)/, 'the floor is not the kernel’s — it must be read live, not held here');
  /* (#R679) …and the control's own floor is derived from the kernel's, never typed. */
  assert.match(js, /const jumpMinYear=\(\)=>Math\.max\(1,YMIN\(\)\)/,
    'the jump control must derive its floor from the kernel, not name a year');
  assert.ok(!/Date\.UTC\s*\(\s*YMIN\(\)/.test(floor[1]),
    'the floor is built with Date.UTC, which turns a year under 100 into that year plus 1900 (#R604)');
  /* ⚠ (#R679) THIS PINNED THE SPELLING OF THE CLAMP AND THE CLAMP CHANGED FOR A REAL REASON.
     HTML's date grammar has no sign, so `datetime-local` cannot name a year before 1 at all;
     with the kernel's floor below zero, sending a half-typed «0001» to the KERNEL's floor puts
     the reader in 123,000 BC. The control now clamps to the lowest year IT can express. What
     #R378 asserts is unchanged — a half-typed year becomes a floor rather than a real wrong
     instant — so the check reads that property, and neither floor may be a literal here. */
  assert.match(js, /if\(Y<jumpMinYear\(\)\) return new Date\(jumpFloorMs\(\)\)/,
    'a year still being typed ("0019") is not clamped — `new Date(19,…)` is 1919, a real wrong instant');

  /* ⚠ ONE STATEMENT OF THE FORWARD REACH. The date picker names days and this one names hours; if
     each computed its own ceiling the panel could offer two different futures. */
  assert.match(js, /function fcMaxMs\(\)\{/, 'the reach is not stated as an instant');
  assert.match(js, /function fcMaxISO\(\)\{ return ymdISO\(new Date\(fcMaxMs\(\)\)\); \}/,
    'the day form of the reach is a second statement of it rather than a derivation');
  assert.equal((js.match(/fcMs\(n-1\)/g) || []).length, 1, '「the model’s last valid time」 is computed in more than one place');
});

/* ══════════════════════════════════════════════════════════════════════════
   ④ what it does to the clock: one write per burst, and it may name a future instant
   ═══════════════════════════════════════════════════════════════════════ */
/* 綴りのまま: 対象は DOM・地図（MapLibre / WebGL）に触れる closure の中で、ブラウザの外では走らない（実ブラウザ側は spec が持つ） */
test('R378 ④ the picker writes the master clock, debounced, and is allowed to reach the future its own max offers', () => {
  const js = code('js/news-timeline.js');

  /* it writes the ONE clock, like every other input in this panel — no second time state */
  assert.match(js, /function jumpCommit\(\)\{[\s\S]*?IntMapTime\.set\(/, 'the picker does not write the master clock');
  assert.match(js, /Math\.min\(d\.getTime\(\),fcMaxMs\(\)\)/, 'the picker is not clamped to the reach it advertises');

  /* ⚠ WITHOUT `allowFuture` THE KERNEL TURNS ANY FUTURE INSTANT INTO LIVE (js/chronos.js), so a
     control whose `max` reaches the model's last hour would answer 「now」 for every hour past this
     one — silently, which is the shape #R268 and #R290 each had to remove. */
  assert.match(js, /IntMapTime\.set\(new Date\(Math\.min\(d\.getTime\(\),fcMaxMs\(\)\)\),\{allowFuture:true,source:'ui'\}\)/,
    'the picker cannot reach the future its own max offers');

  /* a native date field edited from the keyboard emits a COMPLETE value per keystroke, so 1990
     arrives as 0001 / 0019 / 0199 / 1990 — one write per burst, not four */
  assert.match(js, /jumpTimer=setTimeout\(jumpCommit,320\)/, 'the write is not debounced');
  assert.match(js, /jumpEl\.addEventListener\('input',jumpQueue\)/, 'keyboard edits do not reach the clock');
  assert.match(js, /jumpEl\.addEventListener\('change',jumpQueue\)/, 'picker choices do not reach the clock');
  assert.match(js, /jumpEl\.addEventListener\('blur'/, 'leaving the field never reconciles it with the clock');
  assert.match(js, /if\(!jumpEl\.value\)\{ IntMapTime\.setNow/, 'clearing the field does not return to live');
});

/* ══════════════════════════════════════════════════════════════════════════
   ⑤ the row's one word is in all nine languages, and the native calendar follows the theme
   ═══════════════════════════════════════════════════════════════════════ */
/* 綴りのまま: 主張が配線・不在・一意性（どこが何を呼ぶか／無いこと／1 か所だけ）で、評価して取り出せる値が無い */
test('R378 ⑤ the label is a nine-language string and the field is styled for both themes', () => {
  const js = code('js/news-timeline.js');
  assert.match(js, /jumpLbl\.textContent=L5\('Date & time','日時','Datum & Zeit','Дата и время','Fecha y hora'\)/,
    'the label is not a five-argument L5 call — the other four languages resolve through the inline tables');
  for (const f of ['fr', 'ko', 'zh', 'zh-hans']) {
    assert.match(read(`js/locales/ui.${f}.js`), /"Date & time":\s*"[^"]+"/, `ui.${f}.js does not carry the label`);
  }

  const css = read('css/intmap.css');
  assert.match(css, /\.ntl-jumprow\{/, 'the row is not styled');
  assert.match(css, /\.ntl-jump\{/, 'the field is not styled');
  /* ⚠ THE CALENDAR IS THE BROWSER'S, AND IT PAINTS ITSELF FROM `color-scheme`. Without this the
     native popup is a white sheet hanging off a dark panel — the same rule .ntl-date already has. */
  assert.match(css, /\[data-theme="dark"\] \.ntl-jump\{ color-scheme:dark; \}/,
    'the native calendar does not follow the dark theme');
  assert.match(css, /@media\(max-width:768px\)[\s\S]*?\.ntl-jump\{ font-size:11px/,
    'the compact body has no size for the field');
});
}

/* ════════ #R421 — from tests/r421-checks.test.mjs ════════ */
{
// R421 source-level regression checks — DAY-EXACT historical borders.
//
// 「歴史国境の更新ペースをさらに細かくして。理想は月日単位。特に20s前半が荒い。」
//
// The shipped CShapes bundle has ALWAYS carried per-record validity dates (sy,sm,sd → ey,em,ed).
// js/time-borders.js threw the month and the day away at the last step and asked one question per
// calendar year — "was this feature alive on JULY 1?" — so 710 records spanning 365 distinct
// transition dates were sampled at 104 instants. Every assertion below is measured against the
// bundle that actually ships, not against a fixture, because the whole defect was a selector that
// disagreed with the data sitting beside it.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const TB = read('js/time-borders.js');

/* The bundle is 5.6 MB of literal assigned to window.__CSHAPES; load it the way the browser does. */
let CS = null;
function cshapes() {
  if (CS) return CS;
  const src = read('data/cshapes.js');
  const g = { window: {} };
  new Function('window', src)(g.window);
  CS = g.window.__CSHAPES;
  return CS;
}

/* The selector, restated here exactly as js/time-borders.js states it, so this file measures the
   RULE rather than re-reading the implementation's own arithmetic back to itself. */
const ymd = (y, m, d) => y * 10000 + m * 100 + d;
const liveOn = (f, t) => !(ymd(f[2], f[3], f[4]) > t || ymd(f[5], f[6], f[7]) < t);
const worldOn = (d, y, m, dd) => {
  const t = ymd(y, m, dd);
  return d.feats.filter((f) => liveOn(f, t)).map((f) => f[0]).sort();
};
/* the OLD rule, kept so the parity assertion below is a real comparison and not a tautology */
const worldJul1Old = (d, year) =>
  d.feats
    .filter((f) => {
      const [, , sy, sm, sd, ey, em, ed] = [0, 0, f[2], f[3], f[4], f[5], f[6], f[7]];
      const started = sy < year || (sy === year && (sm < 7 || (sm === 7 && sd <= 1)));
      const ends = ey > year || (ey === year && (em > 7 || (em === 7 && ed >= 1)));
      return started && ends;
    })
    .map((f) => f[0])
    .sort();

/* ⚠ (tests-by-topic) THE SHIPPED SELECTOR, RUN. #1 and #8 used to read js/time-borders.js for the
   absence of two spellings (`sm<7||(sm===7&&sd<=1)`, `em>7||(em===7&&ed>=1)`) and the presence of
   `key='cs'+csEpoch(…)`. A selector that rounded to July 1 some OTHER way would have passed. So the
   region that decides 「which records are alive on this day」 — `csFC` with `_ymd`, and the epoch
   index `csBounds` / `_epochIn` / `csEpoch` — is lifted out and evaluated against the bundle that
   ships. Only what `csFC` does NOT decide is stubbed: the display name (`_csName` → the record's own
   name), the translation table, and the geometry/line pools (null).
   ⚠ (hist-bundles-off-main) THE RECORDS IN FORCE AND THE EPOCH EDGES ARE ASKED OF THE DOOR NOW, so
   `csLoad` is lifted too and the door is the REAL js/hist-bundles.js holding the shipped bundle (published
   on a `window` the way a harness publishes it — the door then answers on this thread with the same job
   the Worker runs). Nothing about which day is selected is restated here. */
async function liftSelector() {
  const a = TB.indexOf('const CS_MIN=');
  const b = TB.indexOf('let _csD=', a);
  assert.ok(a > 0 && b > a, 'the day-exact epoch index is one region of js/time-borders.js');
  const i = TB.indexOf('function csFC(d,year,mon,day)');
  assert.ok(i > 0, 'csFC takes the month and the day');
  assert.ok(TB.slice(i - 6, i) === 'async ', 'csFC asks the door, so it answers asynchronously');
  let depth = 0, j = -1;
  for (let k = TB.indexOf('{', i); k < TB.length; k++) {
    if (TB[k] === '{') depth++;
    else if (TB[k] === '}' && !--depth) { j = k; break; }
  }
  // eslint-disable-next-line no-new-func
  const l = TB.indexOf('function csLoad(){');
  assert.ok(l > 0, 'csLoad is where the record is opened');
  let dl = 0, e = -1;
  for (let k = TB.indexOf('{', l); k < TB.length; k++) {
    if (TB[k] === '{') dl++;
    else if (TB[k] === '}' && !--dl) { e = k; break; }
  }
  const win = { __CSHAPES: cshapes() };
  vm.runInNewContext(read('js/hist-bundles.js'), { window: win });
  const S = new Function('_csName', 'hnFor', '_csGeomOf', '_csLineOf', '_lnOf', '_lineFeat', 'window',
    TB.slice(a, b) + '\nlet _csD=null,_csP=null,_csH=null;\n' + TB.slice(l, e + 1) + '\nasync ' + TB.slice(i, j + 1) + '\nreturn { csFC, csEpoch, csLoad, csBounds };')(
    (name) => name, () => null, () => null, () => null, new Map(), (x) => x, win);
  assert.ok(await S.csLoad(), 'the door opened the shipped CShapes bundle');
  return S;
}
const namesOf = (fc) => fc.features.map((f) => f.properties.NAME).sort();

test('R421 #1 the July-1 rounding is GONE from the selector', async () => {
  const S = await liftSelector();
  const d = cshapes();
  /* the shipped selector answers exactly the day-exact rule, on days that are not July 1 */
  for (const [y, m, dd] of [[1920, 10, 28], [1920, 1, 12], [1990, 10, 2], [1990, 10, 4], [1945, 8, 15]]) {
    assert.deepEqual(namesOf(await S.csFC(d, y, m, dd)), worldOn(d, y, m, dd), `${y}-${m}-${dd} is selected by its own day`);
  }
  /* …which is NOT what the July-1 sample of that year would have drawn — the rounding is gone */
  assert.notDeepEqual(namesOf(await S.csFC(d, 1990, 10, 4)), worldJul1Old(d, 1990),
    'the reunified Germany of 1990-10-04 is drawn, not the July-1 world of 1990');
  /* and a caller that gives only a year still gets a defined instant — the old July-1 sample */
  assert.deepEqual(namesOf(await S.csFC(d, 1990)), worldJul1Old(d, 1990), 'a year-only caller is answered at July 1');
});

/* 綴りのまま: 対象は DOM・地図（MapLibre / WebGL）に触れる closure の中で、ブラウザの外では走らない（実ブラウザ側は spec が持つ） */
test('R421 #2 the clock hands `go` the INSTANT, not the year', () => {
  // `go(e.year)` was the rounding: the kernel broadcasts a full Date and the module read one field.
  assert.ok(
    !/go\._t=setTimeout\(\(\)=>\{ try\{ go\(e\.year\)/.test(TB),
    'the subscriber must not pass e.year — that IS the July-1 rounding, one level up',
  );
  assert.match(TB, /const w=e\.when;/, 'the subscriber captures the whole instant');
  assert.match(TB, /async function go\(when\)/, 'go() is named for an instant');
  // and it must still accept a bare year, or every pre-R421 caller changes meaning silently
  assert.match(TB, /when instanceof Date/, 'go() still distinguishes a Date from a bare year');
});

/* 綴りのまま: 対象は DOM・地図（MapLibre / WebGL）に触れる closure の中で、ブラウザの外では走らない（実ブラウザ側は spec が持つ） */
test('R421 #3 the LOCAL getters are used, not e.iso — a picked day must not shift a day', () => {
  // chronos.js `ymdISO` is toISOString() = UTC. #ntl-date writes LOCAL midnight, so reading the day
  // back in UTC would answer 1920-10-28 with 1920-10-27 for every reader east of Greenwich.
  assert.match(TB, /when\.getFullYear\(\)/, 'the year comes from the local getter');
  assert.match(TB, /when\.getMonth\(\)\+1/, 'the month comes from the local getter');
  assert.match(TB, /when\.getDate\(\)/, 'the day comes from the local getter');
  assert.ok(!/go\(e\.iso\)|csFC\([^)]*\.iso/.test(TB), 'the UTC ISO string must not drive the selector');
});

test('R421 #4 PARITY: at July 1 the new selector reproduces the old one for every year', () => {
  // The load-bearing safety assertion. This round may only ADD reachable instants; if a single
  // year's canonical July-1 world changed, something other than the granularity moved.
  const d = cshapes();
  const mismatches = [];
  for (let y = 1886; y <= 2019; y++) {
    const now = worldOn(d, y, 7, 1);
    const old = worldJul1Old(d, y);
    if (now.length !== old.length || now.join('|') !== old.join('|')) mismatches.push(y);
  }
  assert.deepEqual(mismatches, [], 'no year may change its July-1 world');
});

test('R421 #5 the early 1920s really do get finer — and no epoch empties the map', () => {
  const d = cshapes();
  // the reported symptom, measured: 1920 is the densest year in the file
  const dates1920 = [
    [1, 12], [2, 2], [2, 10], [2, 11], [3, 17], [4, 26], [6, 4],
    [6, 28], [7, 23], [9, 2], [10, 7], [10, 28], [12, 17], [12, 24],
  ];
  const worlds = new Set(dates1920.map(([m, dd]) => worldOn(d, 1920, m, dd).join('|')));
  assert.ok(
    worlds.size >= 5,
    `1920 must expose at least 5 distinct worlds through its own transition dates; got ${worlds.size}`,
  );
  // the July-1 sample saw exactly one of them
  assert.equal(
    new Set([worldJul1Old(d, 1920).join('|')]).size, 1,
    'sanity: the old rule had exactly one world for 1920',
  );
  // ⚠ and every reachable instant must still be a WORLD. An off-by-one in the inclusive end test
  // would empty the map on the changeover days rather than fail loudly.
  for (const [m, dd] of dates1920) {
    const n = worldOn(d, 1920, m, dd).length;
    assert.ok(n > 100, `1920-${m}-${dd} drew ${n} entities — an epoch must never empty the map`);
  }
});

test('R421 #6 day-exactness is real at events whose date is not July', () => {
  const d = cshapes();
  const has = (y, m, dd, name) => worldOn(d, y, m, dd).includes(name);
  // German reunification took effect 1990-10-03. A yearly selector cannot express this at all.
  assert.ok(has(1990, 10, 2, 'German Democratic Republic'), 'the GDR exists on 1990-10-02');
  assert.ok(!has(1990, 10, 4, 'German Democratic Republic'), 'the GDR is gone on 1990-10-04');
});

/* 綴りのまま: 主張が配線・不在・一意性（どこが何を呼ぶか／無いこと／1 か所だけ）で、評価して取り出せる値が無い */
test('R421 #7 the transition index is built from the SAME records as the polygons', async () => {
  // A second, hand-kept list of dates would drift out of step with the geometry the moment either
  // was edited. The index is derived — both edges of every record — and filtered to the CShapes range.
  /* ⚠ (hist-bundles-off-main) EVALUATED (was: three spellings of the loop). The index is computed by
     the door's job over every record and handed to js/time-borders.js by csLoad; what the module
     answers is compared with the rule restated below, over the shipped bundle. */
  const S = await liftSelector();
  const d = cshapes();
  const set = new Set();
  for (const f of d.feats) {
    set.add(ymd(f[2], f[3], f[4]));
    const t = new Date(Date.UTC(f[5], f[6] - 1, f[7]));
    t.setUTCDate(t.getUTCDate() + 1);
    set.add(ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()));
  }
  const inRange = [...set].filter((k) => k >= ymd(1886, 1, 1) && k <= ymd(2019, 12, 31));
  assert.deepEqual([...S.csBounds()], inRange.slice().sort((x, y) => x - y),
    'the index the module holds is every start and every day-after-an-end of the records, in range');
  assert.ok(
    inRange.length > 300,
    `the shipped bundle must expose 300+ border-change days; got ${inRange.length}`,
  );
  // and the point of the whole round: far more instants than years
  assert.ok(inRange.length > 134 * 2, 'there must be far more transition days than calendar years');
});

test('R421 #8 the cache is keyed by EPOCH, so a quiet decade re-renders nothing', async () => {
  // Keying by the requested date would build a FeatureCollection per day scrubbed and defeat the
  // "did anything change?" short-circuit that makes dragging the slider cheap.
  /* (tests-by-topic) the epoch resolver is RUN: two days inside one epoch resolve to the same key,
     and the day before that epoch began resolves to another */
  const S = await liftSelector();
  const d = cshapes();
  assert.equal(S.csEpoch(d, 1920, 11, 5), S.csEpoch(d, 1920, 10, 28), '1920-11-05 is inside the epoch that began 1920-10-28');
  assert.equal(S.csEpoch(d, 1920, 10, 28), 19201028, '…and that epoch is named by the day it began');
  assert.notEqual(S.csEpoch(d, 1920, 10, 27), S.csEpoch(d, 1920, 10, 28), 'the day before it is a different epoch');
  /* 綴りのまま: 「キャッシュの鍵がどの値か」は csFC の呼び出し元（DOM と地図に繋がった go()）の中の配線で、ここでは走らない */
  assert.match(TB, /key='cs'\+csEpoch\(d,year,mon,day\)/, 'the cache key is the epoch, not the date');
  // two dates inside one epoch must produce the same world (this is what the key asserts)
  assert.equal(
    worldOn(d, 1920, 10, 28).join('|'),
    worldOn(d, 1920, 11, 5).join('|'),
    '1920-11-05 is inside the epoch that began 1920-10-28',
  );
});

/* 綴りのまま: 主張が配線・不在・一意性（どこが何を呼ぶか／無いこと／1 か所だけ）で、評価して取り出せる値が無い */
test('R421 #9 the stepper is wired to the module that owns the dates', () => {
  const NT = read('js/news-timeline.js');
  const HTML = read('index.html');
  const CSS = read('css/intmap.css');
  // markup, style and wiring all present — a control missing any one of them is invisible or inert
  assert.match(HTML, /id="ntl-bstep-prev"/, 'the previous-change button exists');
  assert.match(HTML, /id="ntl-bstep-next"/, 'the next-change button exists');
  assert.match(HTML, /id="ntl-bstep-lbl"/, 'the readout exists');
  assert.match(CSS, /\.ntl-bstep\{/, 'the row is styled');
  assert.match(NT, /bStepPrev\.onclick=\(\)=>_bsStep\(-1\)/, 'previous is wired');
  assert.match(NT, /bStepNext\.onclick=\(\)=>_bsStep\(1\)/, 'next is wired');
  // ⚠ it must ask IntMapTimeBorders, never carry its own copy of the dates
  assert.match(NT, /TB\.changeBefore\(st\.when\)/, 'previous asks the border module');
  assert.match(NT, /TB\.changeAfter\(st\.when\)/, 'next asks the border module');
  // ⚠ DATA, not prose — a comment may name a date as an example; a second LIST of them is the drift
  // this forbids. A copied index would show up as YYYYMMDD literals or as a reach into the bundle.
  assert.ok(
    !/\b(?:18|19|20)\d{6}\b/.test(codeOnly(NT)),
    'the timeline must not hold border dates of its own (no YYYYMMDD literals outside comments)',
  );
  assert.ok(!/__CSHAPES|csBounds/.test(NT), 'and it must not reach into the bundle directly');
  // and the API it calls must actually be exported
  for (const fn of ['changeAfter', 'changeBefore', 'changeAt', 'changeDates']) {
    assert.ok(new RegExp(`\\b${fn}\\b`).test(TB), `IntMapTimeBorders must export ${fn}`);
  }
  assert.match(TB, /changeAfter, changeBefore, changeAt, changeDates, range:/, 'exported on the public surface');
});

/* 綴りのまま: 主張が配線・不在・一意性（どこが何を呼ぶか／無いこと／1 か所だけ）で、評価して取り出せる値が無い */
test('R421 #10 the stepper writes the MASTER clock, like every other input in the panel', () => {
  const NT = read('js/news-timeline.js');
  // Setting the borders directly would desynchronise them from news, statistics and the climate era.
  assert.match(NT, /IntMapTime\.set\(d,\{source:'ui'\}\)/, 'it writes IntMapTime');
  assert.ok(
    !/IntMapTimeBorders\.(_go|_clear)\s*\(/.test(NT),
    'the panel must not drive the border renderer behind the clock’s back',
  );
});

/* 綴りのまま: 主張が配線・不在・一意性（どこが何を呼ぶか／無いこと／1 か所だけ）で、評価して取り出せる値が無い */
test('R421 #11 the stepper says its words in all nine languages', () => {
  const NT = read('js/news-timeline.js');
  // the five positional slots
  assert.match(NT, /L5\('Previous border change','前の国境変更'/, 'previous has its five');
  assert.match(NT, /L5\('Next border change','次の国境変更'/, 'next has its five');
  // and the four that live in the inline tables
  for (const lg of ['fr', 'ko', 'zh', 'zh-hans']) {
    const t = read(`js/locales/ui.${lg}.js`);
    for (const k of ['Next border change', 'Previous border change']) {
      const m = t.match(new RegExp(`['"]${k}['"]:\\s*["']([^"']+)["']`));
      assert.ok(m, `${lg} must carry "${k}"`);
      assert.notEqual(m[1], k, `${lg}'s "${k}" must not still be the English string`);
    }
  }
});

/* 綴りのまま: 主張が配線・不在・一意性（どこが何を呼ぶか／無いこと／1 か所だけ）で、評価して取り出せる値が無い */
test('R421 #13 whenStyleReady() is DEFINED in the file that calls it', () => {
  // ⚠ It was called four times and defined nowhere. It lives in js/data-layers.js as a module-local
  // function; #R163 moved this file out of the index.html closure where that name used to resolve, so
  // every call site threw ReferenceError — measured at 6 uncaught rejections per boot. Three of the
  // four sites sit inside try{}catch(_){}, which is precisely why nobody saw it: the catch swallowed
  // the ReferenceError and the missing repaint looked like "no retry was needed".
  // This is #R140's fix for 「歴史的国境が表示されない・再読み込みで治る」, so its absence is not a smaller
  // safety net — it is none, and the day-exact borders of this round depend on the same retry.
  assert.match(TB, /function whenStyleReady\(\)/, 'the function must be defined in js/time-borders.js');
  const calls = (TB.match(/whenStyleReady\(\)/g) || []).length;
  assert.ok(calls >= 4, `all call sites must remain; found ${calls}`);
  // it must resolve on the app's ONE notion of "can I draw" — a second notion is how they drift.
  // (restored-layer-before-style) That notion is the engine's wait now, shared with js/data-layers.js
  // and js/time-admin1.js. ⚠ It no longer hard-resolves after ~6 s: that deadline answered «ready»
  // to a style that was not, and the add it released threw «Style is not done loading.» with nothing
  // left to retry. It does not hang on a busy map either — it polls canDraw(), not idle — and that
  // is asserted by evaluation in tests/restored-layer-before-style-checks.test.mjs ①.
  assert.match(TB, /function whenStyleReady\(\)\{ return GE\(\)\.whenCanDraw\(\); \}/, 'it must be the engine\'s wait');
});

/* 綴りのまま: 主張が配線・不在・一意性（どこが何を呼ぶか／無いこと／1 か所だけ）で、評価して取り出せる値が無い */
test('R421 #14 the Atlas catalogue no longer tells the planner to round to a year', () => {
  // #R115/#R231: what the catalogue does not describe does not exist for the planner. The behaviour
  // changed, so the description had to. Without this the planner keeps emitting bare years and the
  // day-exact borders are unreachable through Atlas for anyone who asks in words.
  const CAT = read('js/atlas-catalog-text.js');
  assert.match(CAT, /HISTORICAL BORDERS ARE DAY-EXACT/, 'the catalogue states the precision');
  assert.match(CAT, /"date":"1920-10-28"/, 'and shows the planner a worked example');
});
}
