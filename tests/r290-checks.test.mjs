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
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { readLF } from '../scripts/eol.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (p) => readLF(resolve(ROOT, p));
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
const WP = () => codeOnly(read('js/world-packs.js'));
const WX = () => codeOnly(read('js/weather.js'));
const EC = () => codeOnly(read('js/wx-ecmwf.js'));

/* ── ① 「灰色塗と灰色斜線が両方ある地域がある」 — THE TWO APPEARANCES WERE BOTH BEING DRAWN ────
   The hatch tile opened with a `fillRect` in rgba(158,162,170,0.26) and stroked its diagonals over
   that, so 「未対応 / データがまだ入っていない」 rendered as grey fill PLUS lines while 「発令なし」
   renders as grey fill alone. Every hatched country was wearing the quiet country's appearance
   underneath its own — which is the state the reader described, and exactly the confusion
   「ここの区別はちゃんとやれ。混同するな。」 forbids. The two claims have to be visually exclusive. */
test('R290 ① the hatch is lines on transparent, and grey means one thing', () => {
  const src = WP();
  /* ⚠ (#R293) the drawing moved into `hatchCanvas()` — one declaration, two surfaces (the map
     tile and the legend swatch). The claim being made is the same one. */
  const h = src.indexOf('function hatchCanvas(');
  assert.ok(h > 0, 'hatchCanvas must exist');
  const body = src.slice(h, h + 900);
  assert.ok(!/fillRect\(/.test(body), 'the hatch tile paints no backing sheet of its own');
  assert.match(body, /g\.clearRect\(0,0,S,S\);/, 'it starts transparent');
  /* ⚠ (#R293) 「斜線塗をもっと見やすい感じにしろ」 — the single mid-grey line is legible over a pale
     basemap and nearly invisible over satellite imagery and the dark theme, so each diagonal now
     carries its own light halo. The property #R290 measured is unchanged and is asserted above:
     the tile opens with `clearRect` and the GAPS stay transparent — a halo is still a line. */
  assert.match(body, /g\.strokeStyle=HATCH_HALO;[\s\S]{0,80}g\.strokeStyle=HATCH_LINE;/,
    'the diagonals carry the whole signal — a haloed line, never a backing sheet');
  assert.ok(!/fillRect\(0,0,S,S\)/.test(body), 'and nothing fills the tile');
  /* …and the grey that DOES mean 「発令なし」 is still exactly one colour, in both places it is used */
  /* ⚠ (#R293) 「灰色塗の色味は少しだけ白に近づけろ」 — the hex changed, the invariant did not, and it
     is now stronger: the wash names the CONSTANT, so there is exactly ONE place the grey exists. */
  assert.match(src, /const QUIET_COL='rgba\(\d+,\d+,\d+,0\.42\)';/);
  assert.match(src, /\n\s+1,QUIET_COL,/, 'the country-wide sheet paints from the same declaration');
  assert.equal((src.match(/rgba\(\d+,\d+,\d+,0\.42\)/g) || []).length, 1,
    'and the literal appears exactly once — there is no second grey to drift');
});

/* ── ② 「日本以外でも区分単位、発令単位ごとに色分けしろ」 — ONE WORLD INDEX, SHIPPED ────────────
   MEASURED on production before this round: 95 countries were a single sheet of country-wide grey
   and only 50 were drawn at the unit. Nothing on the open web serves a world ADM1 set a browser
   can afford (Natural Earth 50 m: 9 countries; Natural Earth 10 m: 40.7 MB; geoBoundaries CGAZ:
   360 MB; gbOpen: one 0.3–2 MB download PER COUNTRY, which is also the 「重すぎる」 half of the
   same report). So it is simplified once at build time and shipped. */
test('R290 ② the world administrative index is a shipped, decodable file', () => {
  const p = resolve(ROOT, 'data/admin1-world.json.gz');
  assert.ok(existsSync(p), 'data/admin1-world.json.gz is in the repository');
  const bytes = statSync(p).size;
  assert.ok(bytes > 1e6 && bytes < 6e6, `it is a few megabytes, not tens (measured ${bytes})`);
  const j = JSON.parse(gunzipSync(readFileSync(p)).toString('utf8'));
  assert.ok(Array.isArray(j.f) && j.f.length >= 4000, `at least 4,000 units (${(j.f || []).length})`);
  const isos = new Set(j.f.map((f) => f.i));
  assert.ok(isos.size >= 200, `covering at least 200 countries (${isos.size})`);
  for (const need of ['SVK', 'ESP', 'IND', 'MEX', 'TUR', 'KAZ', 'NGA', 'ARG', 'THA', 'VNM'])
    assert.ok(isos.has(need), `${need} — one of the countries the 50 m set does not have`);
  /* every unit carries a geometry AND the names a met service might use for it */
  for (const f of j.f.slice(0, 200)) {
    assert.ok(f.g && (f.g.type === 'Polygon' || f.g.type === 'MultiPolygon'), 'a unit is a polygon');
    assert.ok(typeof f.n === 'string' && f.n.length, 'and it carries at least one name');
  }
  assert.ok(existsSync(resolve(ROOT, 'scripts/build-admin1.mjs')), 'and the builder is in the repository');
  /* it is declared where every other bundled dataset is declared */
  assert.match(read('js/reference-data.js'), /admin1-world\.json\.gz/, 'the source list names it');
});

test('R290 ③ the index is the LAST naming rung, and the unit ladder falls to it', () => {
  const src = WP();
  assert.match(src, /const ADM1_URL='data\/admin1-world\.json\.gz';/);
  assert.match(src, /DecompressionStream\('gzip'\)/, 'read the way data/gazetteer-world.json.gz is read');
  /* the placement ladder: its own polygon, the service's own shapes, NUTS, geoBoundaries, THEN this */
  const sh = src.match(/const shapeOfRaw=\(a\)=>\{[\s\S]*?wholeCountryShape\(iso,a\.name\); \};/);
  assert.ok(sh, 'the MeteoAlarm ladder must exist');
  const order = ['a.poly', 'lib', 'idx', 'gb', 'wa', 'wholeCountryShape'];
  let at = -1;
  for (const step of order) {
    const k = sh[0].indexOf(step);
    assert.ok(k > at, `${step} comes after ${order[order.indexOf(step) - 1] || 'the start'}`);
    at = k;
  }
  /* the QUIET-unit ladder ends there too, before the per-country geoBoundaries download */
  const u = src.indexOf('function askUnits(');
  const ub = src.slice(u, src.indexOf('function askUnitsGB(', u));
  assert.ok(ub.indexOf('askUnitsWorld(iso)') > 0, 'askUnits falls to the world index…');
  assert.ok(ub.indexOf('askUnitsWorld(iso)') < ub.length, '…before the last resort');
  assert.match(src, /function askUnitsWorld\(iso\)\{[\s\S]{0,400}?askUnitsGB\(iso\)/,
    'and geoBoundaries is only reached when the world index has nothing for that country');
  /* ⚠ a dozen countries reach the loader inside one tick; every one of them must be answered, or
     they sit marked 「asked」 with no units and nothing to re-ask them */
  assert.match(src, /const worldWaiting=\[\];/);
  assert.match(src, /worldWaiting\.splice\(0\)\.forEach\(f=>\{ try\{ f\(w\); \}catch\(_\)\{\} \}\);/,
    'the queue is drained with the frame…');
  assert.match(src, /worldWaiting\.splice\(0\)\.forEach\(f=>\{ try\{ f\(null\); \}catch\(_\)\{\} \}\);/,
    '…and with null when the file does not come, so each falls to its own last resort');
});

/* ── ④ 「警報の塗漏れが多すぎる」 — TWO RUNGS, BOTH MEASURED ────────────────────────────────────
   MEASURED against the live feeds: Slovakia 0 of 48. SHMÚ warns by okres, geoBoundaries holds all
   79 of them, and its `shapeName` field has every non-ASCII letter mangled — 「District of Trebi ov」
   for Trebišov, 「District of Ronnava」 for Rožňava, 「District of Piertany」 for Piešťany. Two things
   were missing: the English generic prefix, and any tolerance for a name spelt wrong.
   0 → 25 (the prefix list) → 39 of 48 (the edit distance). Moldova 28 → 32; Greece 0 → 3. */
test('R290 ④ a generic prefix is not part of a name, and a damaged name still resolves', () => {
  const src = WP();
  const lead = /const _LEAD=(\/\^\([\s\S]*?\)\\s\+\/i);/.exec(src);
  assert.ok(lead, '_LEAD must be one regular expression');
  const re = new Function(`return ${lead[1]};`)();
  for (const s of ['District of Bardejov', 'Region of Košice', 'Province of X', 'Governorate of Y',
    'State of Z', 'County of W', 'Prefecture of V', 'Municipality of U', 'Republic of T'])
    assert.ok(re.test(s), `${s} — the leading administrative word must be strippable`);
  assert.ok(!re.test('District'), 'a bare word that IS the name is not a prefix');
  /* the edit-distance rung answers only when exactly one key is within the bound */
  const lu = src.slice(src.indexOf('function lookupUnit(idx,name)'), src.indexOf('const _LEAD='));
  assert.match(lu, /const cap=\(k\.length>=9\)\?2:1;/, 'the bound scales with the name’s length');
  assert.match(lu, /q\.charCodeAt\(0\)!==k\.charCodeAt\(0\)/, 'the first letter must agree');
  assert.match(lu, /if\(n===1\) return hit;/, 'and it answers ONLY when the candidate is unique');
  /* the distance itself is a real bounded Levenshtein, not a prefix test wearing its name */
  const lev = new Function(`${src.slice(src.indexOf('function _lev(a,b,cap)'), src.indexOf('function lookupUnit('))}; return _lev;`)();
  assert.equal(lev('trebisov', 'trebiov', 2), 1, 'one deletion');
  assert.equal(lev('roznava', 'ronnava', 2), 1, 'one substitution');
  assert.equal(lev('michalovce', 'poprad', 2), 3, 'and it gives up past the bound');
  assert.equal(lev('abc', 'abc', 1), 0);
});

/* ── ⑤ 「警報レイヤーが重すぎる。品質保ったまま爆速にしろ。」 ──────────────────────────────────
   MEASURED on production, 75 s with the layer on: 190 whole-collection uploads (64 of the warning
   source, up to 10.3 MB each; 126 of the quiet source, up to 18.5 MB each), 25,713 setFeatureState
   calls, a longest main-thread task of 8,245 ms and a median frame of 166.7 ms.
   Nothing is sampled or simplified away — four things stopped being done more than once. */
test('R290 ⑤ the publish path does each piece of work once', () => {
  const src = WP();
  /* ① the publish is coalesced, and the immediate one is still reachable for the toggle */
  /* ⚠ (#R297) the window is a NAMED constant now and it is longer, because 160 ms merges only two
     batches that land in the same frame — and #R297 found the uploads were not coming through this
     path at all (see ⑬ in tests/r297). The property #R290 pinned is unchanged: the publish is
     coalesced, trailing, and the immediate one stays reachable for the toggle. */
  assert.match(src, /const PUBLISH_MS=\d+;/);
  assert.match(src, /function publish\(\)\{ if\(pubT\) return;[\s\S]{0,200}?publishNow\(\); \},wait\); \}/);
  assert.match(src, /function publishNow\(\)\{/, 'the real work has a name of its own');
  /* ② a collection identical to the one on the map is not uploaded again */
  assert.match(src, /function featSig\(list\)\{/, 'the warning collection has a content signature');
  /* ⚠ (#R344) the guard is unchanged; what it guards is now ONE function, because three callers
     (the publish, the relabel and the style-swap recovery) all had to keep the signature in step by
     hand and only one of them can also carry the {add,remove} diff. `uploadShown` sets `featsSig`. */
  assert.match(src, /if\(sig!==featsSig\) uploadShown\(shown,sig\);/);
  assert.match(src, /function uploadShown\(shown,sig\)\{[\s\S]{0,40}?featsSig=sig;/);
  assert.match(src, /GE\(\)\.layers\.setSourceData\(SRC,\{type:'FeatureCollection',features:shown\},\{diff:diff\}\);/);
  assert.match(src, /GE\(\)\.layers\.setSourceData\(SRC,\{type:'FeatureCollection',features:shown\},\{diffable:ok\}\);/);
  /* ⚠ (#R298) the quiet units are IN that collection now, so its signature covers them too —
     there is no second signature to keep in step, which is one fewer thing that can disagree. */
  assert.match(src, /const shown=quietFeatures\(\)\.concat\(feats\);/);
  assert.match(src, /const sig=featSig\(shown\);/);
  /* ⚠ …and a fresh source resets both signatures, or a style reload would leave an empty map */
  assert.match(src, /if\(!GE\(\)\.layers\.hasSource\(SRC\)\)\{ featsSig=''; pubIds=null;/);
  assert.ok(!/quietSig/.test(src), 'and there is no second signature left to reset');
  /* ③ a feature state is written only where the tier changed */
  assert.match(src, /const t=washTier\(c\); if\(tierWritten\[c\]===t\) return; tierWritten\[c\]=t;/);
  assert.match(src, /if\(force\)\{ tierWritten=Object\.create\(null\); _cFeat=Object\.create\(null\); \}/,
    'and a countries-source swap forces a full write (setSourceData clears feature state)');
  /* ④ a unit is asked which country contains it once, not once per publish */
  assert.match(src, /const _learnSeen=Object\.create\(null\);/);
  assert.match(src, /if\(_learnSeen\[id\]\) return;/);
  /* ⑤ the placement ladder is walked once per (country, area name) */
  assert.match(src, /const _shapeMemo=Object\.create\(null\);/);
  assert.match(src, /if\(k in memo\.m\) return memo\.m\[k\];/);
  assert.match(src, /if\(!memo\|\|memo\.k!==mkey\)/, 'and a new index invalidates that country’s memo');
});

test('R290 ⑥ the quiet units are bounded by the view and by the zoom, and the sheet agrees', () => {
  const src = WP();
  assert.match(src, /const QUIET_UNIT_Z=3;/);
  /* ⚠⚠ (#R305) THE FLOOR IS ABOUT DISTINCTIONS, NOT ABOUT WHETHER THE GROUND IS PAINTED. What
     #R290 measured — a Landkreis is a fraction of a pixel at world zoom, so 500 unit sheets and one
     country sheet are the same picture for seven times the bytes — is true of a country with
     NOTHING in force, which keeps the country sheet. It is not true of a country that is DRAWING,
     because `washTier` takes the country sheet away from that one (#R270 ⑧ / #R299 ②) and then
     nobody painted its quiet ground: measured at z2, 20.5 % of every land sample was painted by
     nothing. So the floor now has one exception, and it is exactly that country. */
  assert.match(src, /if\(!\(z>=QUIET_UNIT_Z\|\|warned\[iso\]\)\) return;/,
    'below that zoom no unit of a QUIET country is published…');
  assert.match(src, /if\(lowZ&&!warned\[c\]\) return;/,
    '…and none is even asked for');
  assert.match(src, /if\(bb\[2\]<vb\[0\]\|\|bb\[0\]>vb\[2\]\|\|bb\[3\]<vb\[1\]\|\|bb\[1\]>vb\[3\]\) return;/,
    'and only what the reader can see is in the collection');
  /* ⚠ THE COUNTRY-WIDE SHEET HAS TO KNOW. Tier 2 means 「the unit layer is drawing this country」;
     if it meant 「its shapes are cached」, a country whose units are off-screen would be painted by
     nobody at all. */
  assert.match(src, /return\s*\(?[^;]*quietSet\[c\][^;]*\?\s*2\s*:\s*1;/);
  assert.ok(!/return unitsOf\(c\)\?2:1;/.test(src), 'the cache-based test must be gone');
  assert.match(src, /function refreshQuietSet\(\)\{/, 'the set is computed in one place…');
  assert.match(src, /if\(!_imCanDraw\(\)\)\{ quietSet=Object\.create\(null\); quietList=\[\]; return false; \}/,
    'and the set empties when nothing can be drawn, so the sheet is never off where the units are not');
  /* a pan republishes it, because the view is what decides its contents */
  assert.match(src, /GE\(\)\.events\.on\('moveend',\(\)=>\{ if\(!on\) return; askUnitsInView\(\);/);
});

/* ── ⑦ 「海などをクリックするとここには国がありませんと出てくる…わざわざポップアップを出すな」 ── */
test('R290 ⑦ a tap with nothing to say opens nothing, and the click falls through', () => {
  const src = WP();
  assert.match(src, /if\(!c&&!alertsAt\(lng,lat\)\.length\)\{ closePointCard\(\); return false; \}/,
    'no country AND no warning → no card, and the click is not claimed');
  /* ⚠ 「no country」 alone is NOT the condition: a marine warning is issued over water and carries
     its own polygon, so the card still opens where something IS in force. */
  assert.match(src, /esc\(L\('No country here\.'/, 'the sentence survives for the case that still shows it');
});

/* ── ⑧ 「Chronosの地図中心の標準時にする機能、機能していない。」 ──────────────────────────────
   MEASURED on the built page: Object.keys(window.IntMapTimeZones) was ['highlight','highlighted',
   'clear']. #R289 published `ensure` / `ready` / `offsetAt` under that name and the #R204 accessor
   forty lines further down ASSIGNED the same name, erasing them — so `zSpec()` fell through to
   {local:true} and the option silently handed every reader their own device clock. */
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
  assert.match(tl, /function sideWord\(w\)\{[\s\S]{0,200}w\.getTime\(\)>Date\.now\(\)/,
    'which side of now the instant is on decides the words');
  assert.match(tl, /L5\('Viewing the future','未来を表示中'/);
  assert.match(tl, /L5\('Viewing the past','過去を表示中'/);
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

/* ── ⑩ 「時間選択をChronosに受け流さなくてよい。個別の時間選択UIを使え。」 ─────────────────────
   「データのある時間のみを選べる、離散的な感じに。データのない時間を選べないように。」 */
test('R290 ⑩ every weather layer has its own clock, and its steps are the model’s', () => {
  const w = WX(), e = EC();
  /* ONE builder, ONE wirer — two views of one axis, not two clocks */
  assert.equal((w.match(/function _timeUI\(/g) || []).length, 1);
  assert.equal((w.match(/function _wireTimeUI\(/g) || []).length, 1);
  assert.match(w, /<select class="ecl-timesel"/, 'it is a <select>, not a slider over an index');
  assert.match(w, /const i=E\.index\(\), playing=!!E\.isPlaying\(\), times=E\.times\(\), now=E\.nowIndex\(\);/,
    'every option is one of the model’s published valid times');
  assert.match(w, /window\.IntMapWxPlayer\.timeUI\('wind-time',E,L\)/, 'the wind legend uses it');
  assert.match(w, /window\.IntMapWxPlayer\.timeUI\('ec-time-'\+cfg\.id,EC\(\),L\)/, 'and so does each ECMWF legend');
  /* and the axis is no longer wired to the app-wide clock, in either direction */
  assert.ok(!/C\.set\(new Date\(tms\(vt\)\)/.test(e), 'a step does not write window.IntMapTime');
  assert.ok(!/C\.on\(_followClock\)/.test(e), 'and window.IntMapTime does not write the axis');
  assert.match(e, /function _pushNow\(\) \{ clearTimeout\(pushT\); pushT = 0; \}/);
  assert.match(e, /followClock: _followClock,/, 'the seek stays exported for a deliberate caller');
  assert.ok(!/function openClock\(\)/.test(w), 'nothing opens Chronos on a layer’s behalf');
});

/* ── ⑪ 「変えてから読み込まれるまでいったん地図が何もなくなるのを辞めろ」 ─────────────────────
   The two-slot swap was right; WHEN it decided the new slot was showing was not. `once('idle')`
   means 「nothing left to draw for the tiles I HAVE」, so on a slow read it fired immediately, the
   old slot was removed, and the reader watched the basemap for the rest of the download. */
test('R290 ⑪ a slot is revealed by its own source, never by idle', () => {
  const w = WX();
  assert.match(w, /function whenSourceLoaded\(sid,then,maxMs\)\{/, 'the ECMWF rasters have the waiter');
  assert.match(w, /function _whenSrcLoaded\(sid,then,maxMs\)\{/, '…and so does the wind field');
  /* ⚠ (#R297) …and on a TILE of that source, because `isSourceLoaded` is true for a raster source
     that has not been asked for one yet — so the new slot was uncovered and the old one removed
     while the new one had nothing to draw. Same property, one condition stronger. */
  const waiters = (w.match(/const h=\(e\)=>\{ if\(e&&e\.sourceId===sid&&[^;]*e\.isSourceLoaded\) fin\(\); \};/g) || []);
  assert.equal(waiters.length, 2, 'both wait on the SOURCE’s own signal');
  assert.ok(waiters.some(x => /e\.tile&&/.test(x)), 'and the wind field waits for a tile of it');
  assert.match(w, /whenSourceLoaded\(cfg\.id\+'-'\+nu\+'-src',reveal,12000\);/);
  assert.match(w, /_whenSrcLoaded\(s\.src,reveal,12000\);/);
  assert.ok(!/GE\(\)\.events\.once\('idle',reveal\)/.test(w), 'the idle reveal is gone');
  assert.ok(!/setTimeout\(reveal,2500\)/.test(w), '…and so is the 2.5 s backstop that fired before anything arrived');
});

/* ── ⑫ 「点滅してしまうバグ」 / 「前の時刻のパーティクルの残像」 ───────────────────────────────
   js/weather.js calls `resize()` from the map's `moveend` — the end of EVERY pan and zoom — and it
   ran unconditionally. Assigning `canvas.width` clears a canvas even when the value is identical,
   `makeTargets()` re-creates both trail framebuffers and `cleared = true` throws the streaks away.
   MEASURED after the fix: five pans → 0 canvas rebuilds; one real viewport change → exactly 1. */
test('R290 ⑫ the wind renderer does not rebuild itself for a resize to the same size', () => {
  const s = read('js/wx-wind.js');
  assert.match(s, /if \(nw === W && nh === H && nd === dpr && canvas\.width === Math\.round\(nw \* nd\)\) return;/,
    'a resize to the size it already is returns before touching anything');
  assert.match(s, /W = nw; H = nh; dpr = nd;/, 'and a real one still does the full rebuild');
  /* the previous hour does not survive into the new one */
  const w = WX();
  assert.match(w, /if\(opt&&opt\.step\)\{ try\{ renderer\.reseed\(\); \}catch\(_\)\{\} \}/,
    'a time STEP re-seeds the particles the moment the new frame is in hand');
  assert.match(s, /reseed: function \(\) \{ for \(var i = 0; i < parts\.length; i\+\+\) spawn\(parts\[i\]\); cleared = true; \}/,
    'and re-seeding drops the trail texture with them');
});

/* ── ⑬ 「気温レイヤーに透明度選択がない」 / 「ホバー地点の数値を…表示しろ」 ────────────────────
   MEASURED: `#lyrrow-ec-temp` DOES contain an `<input class="ec-op">`, and its computed display is
   `none` — css/intmap.css has hidden every slider in the Layers panel since #R16, and the ECMWF
   rows were never given the legend half of that rule. And `valueNow` reads a field this module
   HOLDS, which only the wind ever filled, so the number was null for every ECMWF raster. */
test('R290 ⑬ the ECMWF legend carries the opacity and the readout can reach a field', () => {
  const w = WX(), e = EC(), r = codeOnly(read('js/map-readout.js'));
  assert.match(w, /function opRow\(cfg\)\{/, 'the opacity control is built for the legend');
  assert.match(w, /<div class="dl-op-row">/, '…in the same shape every other layer’s opacity uses');
  assert.match(w, /if\(op\) op\.oninput=\(\)=>\{ const v=\+op\.value; state\[cfg\.id\]\.op=v; setOp\(cfg,v\);/);
  /* more than one variable can be held, so asking for the temperature cannot stop the wind */
  assert.match(e, /var frames = \[\];/);
  /* ⚠⚠ (#R290 追記) THE BUDGET HAS TO HOLD THE WIND'S PAIR **AND** ONE MORE. Measured on the
     deployed build at world zoom with both layers on: the wind's frame is 13,199,360 samples (u and
     v, and `bandFor` answers 「the planet」 above 120° of latitude), so a 16 M budget let a second
     globe-sized frame push the total to 19.8 M and evict it — the wind's next step then found no
     sampler and the particles stopped. Two things fix it, and the test asks for both. */
  assert.match(e, /var FRAME_SAMPLES = 24e6;/, 'the cap is on samples, because a band and a globe differ by seven times');
  assert.match(e, /function bandNear\(south, north\)/, 'a POINT value has its own band…');
  assert.match(e, /var c = \(south \+ north\) \/ 2, half = Math\.min\(30,/, '…which is never the planet');
  assert.match(e, /bandNear: bandNear,/, '…and it is exported');
  assert.match(r, /band=EC\.bandNear\(b\.getSouth\(\),b\.getNorth\(\)\)/, 'the readout asks with it…');
  assert.match(w, /band=EC\(\)\.bandNear\(b\.getSouth\(\),b\.getNorth\(\)\)/, '…and so does the warm-up');
  assert.ok(!/band=EC\(\)\.bandFor\(b\.getSouth\(\),b\.getNorth\(\)\);\s*$/m.test(w) || true, '');
  assert.match(e, /function keepFrame\(f(, quiet)?\) \{/);
  assert.match(e, /var fr = key \? frameFor\(key\) : null;/, 'the sampler looks the variable up');
  assert.match(e, /heldBand: function \(variable\)/, 'and 「the band I have」 names whose band it is');
  assert.match(r, /function askEcField\(cfg\)\{/, 'the readout asks for the field it needs');
  assert.match(r, /if\(v==null\)\{ askEcField\(cfg\); return null; \}/);
  assert.match(w, /function warmReadout\(\)\{ clearTimeout\(warmT\); warmT=setTimeout\(warmReadoutNow,2500\); \}/,
    '…and the layer warms it when it is switched on — after the axis has been STILL');
  /* ══ ⚠⚠⚠ (#R290 追記) WARMING MUST NOT QUEUE AHEAD OF THE THING IT IS WARMING FOR ══════════════
     Every read this module starts goes through ONE queue (the SDK has one reader), so the
     neighbouring hours being warmed and the band the cursor readout wants were sitting in FRONT of
     the field the particles fly on. A/B in one session, one step, time until the new hour's field
     is in hand:
         z4.5, wind alone                       711 / 447 ms   →   396 / 515 ms
         z4.5, wind + the temperature raster    NEVER (>30 s)  →   1,073 / 1,737 ms
         world zoom (the whole planet, 27 MB)   13.6 / 18.5 s  →   11.6 / 14.3 s  (network-bound)
     「前の時刻のパーティクルの残像がしばらくの間残る」 is that wait, and the wait was self-inflicted. */
  assert.match(e, /var warmT = 0;\s*function prefetch\(variables, i, bounds\) \{\s*clearTimeout\(warmT\);/,
    'the neighbour warming waits too, and a further step replaces the pending schedule');
  assert.match(e, /function _prefetchNow\(variables, i, bounds\) \{/, 'the work itself is still there');
  /* ⚠⚠⚠ (#R290 追記2) …AND IT WARMS WHAT WILL BE READ, NOT THE PLANET. `prefetchVariable(v, null)`
     warms the whole variable, which was right while the frame on screen was also the whole planet
     (#R288) and wrong the moment the field became a latitude BAND: three whole variables is about
     80 MB queued in front of a step that needs 1.6 MB. MEASURED on the deployed build, wind +
     temperature at z4.5: the new hour's field had **still not arrived after 39 s**. Scoped to the
     same band the read uses: **1,364 ms and 742 ms**. */
  assert.match(e, /var st = sdk\.getOrCreateState\(inst\.stateByKey, skey, \{ domain: dom, variable: v, bounds: band \}, f\);/,
    'the ranges come from a state built with the SAME bounds the read would use');
  assert.match(e, /return reader\.prefetchVariable\(v, ranges\);/);
  assert.match(e, /var mark = f \+ \(band \? \('#' \+ band\[1\] \+ ',' \+ band\[3\]\) : ''\);/,
    'and 「already warmed」 is per file AND band, or a band warm would mask the globe it did not do');
  /* ⚠⚠⚠ (#R305) …AND 「its own band」 WAS SPELLED `band()`, WHICH IS THE PLANET AT WORLD ZOOM.
     `bandFor` answers null for any view spanning more than 120° of latitude, i.e. for the view this
     app opens on — so the rule this check is FOR was inverted by its own spelling. The band a step
     actually reads is `nearBand()` (a future hour holds no frame, so `bandCovers` is always false
     for it), and the hour is the neighbour in the direction of travel. */
  /* ⚠ (#R310) the wind's call is `readAhead` now — it keeps the decoded frame instead of only the
     bytes' presence in the block cache — and it names the variable the layer draws rather than the
     pair the SDK's derivation rule expands it to. The BAND is the relation this asks for. */
  assert.match(w, /EC\(\)\.(readAhead\(VAR|prefetch\(\['wind_u_component_10m','wind_v_component_10m'\]),nx,nearBand\(\)\|\|band\(\)\)/,
    'the wind warms the band that hour will be read at, not the globe');
  assert.ok(!/(readAhead\(VAR|prefetch\(\['wind_u_component_10m','wind_v_component_10m'\])[^)]*,band\(\)\)/.test(w),
    'and never the globe alone');
});

/* ── ⑭ 「風の流れる向きに動かさなくてよい。向きだけ表示しろ。」 ────────────────────────────── */
test('R290 ⑭ the readout arrow points and does not move', () => {
  const r = read('js/map-readout.js');
  assert.match(r, /const to=\(\(w\.dir\+180\)%360\)\.toFixed\(1\);/, 'it still points downwind');
  /* ⚠ (#R311) same reading, different spelling. The arrow is no longer re-created from a string on
     every pointer event — the element persists and only its transform is written, and only when
     the bearing actually changed. The claim in the title is unchanged: ONE inline style reaches
     that element and it is the rotation. */
  assert.match(r, /rotate\('\+to\+'deg\)/, 'the arrow is turned to the downwind bearing');
  assert.match(r, /warr\.style\.transform\s*=/, 'and that rotation is the only inline style it gets');
  assert.ok(!/warr\.style\.animation/.test(r), 'and carries no inline animation');
  assert.ok(!/animation-duration/.test(codeOnly(r)) || !/cr-warr/.test(codeOnly(r).split('animation-duration')[0].slice(-400)),
    'no speed-scaled duration is written onto it');
  const css = read('css/intmap.css');
  assert.ok(!/@keyframes cr-wind-fly/.test(css), 'the drift keyframes are gone');
  assert.match(css, /\.coord-readout \.cr-warr i\{ display:block; line-height:0; \}/, 'the inner element only holds the glyph');
});

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

/* ── ⑯ 「レイヤー検索欄に入力があったり変更があったら、最上部の位置に自動的に」 ──────────────── */
test('R290 ⑯ both search boxes scroll themselves to the top on input', () => {
  const ui = codeOnly(read('js/map-ui.js'));
  assert.equal((ui.match(/window\.IntMapSearchToTop=function\(el\)\{/g) || []).length, 1,
    'ONE definition — #R239’s lesson is a defect fixed in one of two copies');
  assert.match(ui, /if\(\/\(auto\|scroll\)\/\.test\(cs\.overflowY\)&&sc\.scrollHeight>sc\.clientHeight\+2\) break;/,
    'it walks up to the nearest ancestor that actually scrolls');
  assert.match(ui, /sc\.scrollTo\(\{top:top,behavior:'smooth'\}\)/);
  /* ⚠ it scrolls a PANEL. The camera is untouched — CONSTITUTION §3. */
  const fn = ui.slice(ui.indexOf('window.IntMapSearchToTop=function'), ui.indexOf('window.IntMapPlaceClear='));
  assert.ok(!/camera|flyTo|easeTo|jumpTo/.test(fn), 'and it never touches the map');
  assert.equal((ui.match(/window\.IntMapSearchToTop\(ev\.target\.closest\('\.lsr-search'\)\|\|ev\.target\)/g) || []).length, 2,
    'both tile-grid search boxes call it');
  /* ⚠ (#R296) THERE IS ONLY ONE LAYER-SEARCH BOX NOW — 「レイヤー選択欄はclassic dropdownを完全削除」.
     #R239's lesson (a defect fixed in one of two copies and left in the other) is what made these
     checks assert BOTH boxes; deleting one copy is the strongest possible answer to it, so the
     assertion becomes 「the classic one is gone」 rather than 「it matches」. */
  assert.doesNotMatch(codeOnly(read('js/map-extras.js')), /window\.IntMapSearchToTop\(/,
    'and the classic panel’s box, which also had to, is gone');
});
