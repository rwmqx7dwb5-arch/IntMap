/* ============================================================================
 *  IntMap · #R289 source checks — Chronos, the coastline, the merges, the compass
 * ----------------------------------------------------------------------------
 *  Ten instructions arrived in one message. The ones with a shape a source-level check can hold
 *  are here; the rest are measured by the browser smoke (tests/smoke.spec.js) or by the build
 *  (scripts/build-us-elections.mjs validates every one of its 2,342 state results as it writes them).
 *
 *  ⚠ SOURCES ARE READ THROUGH scripts/eol.mjs. Line endings belong to the CHECKOUT, not the file
 *  (#R283): `.gitattributes` pins only the extensions Linux executes, so js/ and *.html come back
 *  with a carriage return on this machine and without one in CI. A check that spelt a line break
 *  literally would be red on one platform and green on the other, for a reason that is not its
 *  subject — which is how #R274, #R279 and #R282 each spent a round re-diagnosing one defect.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { readLF } from '../scripts/eol.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (p) => readLF(resolve(ROOT, p));
const json = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
/* ⚠ THE CHECK MUST NOT BE ABLE TO CATCH THE NOTE THAT EXPLAINS IT — [[intmap-recurring-lessons]]
   records that shape eight times. Every «X is gone» assertion below names the CODE SHAPE X had. */

/* ── ① THE COMPASS HAS ONE OWNER, AND IT SPEAKS NINE LANGUAGES ──────────────────────────────
   「日本語設定でも座標標高常時表示欄にNEと表示されますが、ちゃんと北東と書くように。（ほかの言語でも。）」
   The sixteen English abbreviations were written out in SIX files. Fixing the readout alone would
   have left the other five saying 「NE」 in Japanese — the same defect with a smaller blast radius. */
test('R289 ① the sixteen compass points are one table, and every reader goes through it', () => {
  const src = read('js/compass.js');
  const m = /var P=\{([\s\S]*?)\n  \};/.exec(src);
  assert.ok(m, 'js/compass.js must declare the table as one object literal');
  const table = new Function(`return {${m[1]}};`)();
  const LANGS = ['en', 'jp', 'de', 'ru', 'es', 'zh', 'zh-hans', 'fr', 'ko'];
  assert.deepEqual(Object.keys(table).sort(), LANGS.slice().sort(),
    'every language the app ships must have a compass, and no others');
  for (const [code, arr] of Object.entries(table)) {
    assert.equal(arr.length, 16, `${code}: a compass has sixteen points`);
    assert.equal(new Set(arr).size, 16, `${code}: two points share a name — that is not a compass`);
    arr.forEach((v) => assert.ok(v && v.trim(), `${code}: an empty point`));
  }
  /* the eight-point set is every OTHER one of the sixteen — the property `table(lang, 8)` rests on */
  assert.match(src, /n===8\?t\.filter\(function\(_,i\)\{ return i%2===0; \}\):t\.slice\(\)/,
    'the 8-point set must be derived from the 16, not written down twice');
  /* the four that are the report's own subject, in the language it named */
  assert.equal(table.jp[2], '北東', 'NE must be 北東 in Japanese');
  assert.equal(table.jp[10], '南西');
  assert.equal(table.zh[2], '東北', 'Chinese orders it the other way round — 東北, not 北東');
  assert.equal(table.ko[2], '북동');
  assert.equal(table.de[4], 'O', 'German east is O');
  assert.equal(table.fr[12], 'O', 'French west is O');
  assert.equal(table.ru[0], 'С');
  /* ⚠ AND NOBODY KEEPS A SEVENTH COPY. The shape is the array literal, not the word — a comment
     may name 'NNE' while explaining why this file exists. */
  for (const f of ['js/map-readout.js', 'js/weather.js', 'js/app-body.js', 'js/night-sky.js',
    'js/sims.js', 'js/street-view.js']) {
    const s = read(f);
    assert.ok(!/\['N','NNE','NE'|\['N','NE','E','SE'|\['N', 'NNE', 'NE'/.test(s),
      `${f} still carries its own copy of the compass`);
    assert.match(s, /IntMapCompass\.point\(/, `${f} must read the one table`);
  }
});

/* ── ② THE WIND CHIP: A LOCALISED WORD AND AN ARROW WHOSE PHASE SURVIVES A REBUILD ──────────
   「風向きも、矢印を動的に動くように表示してください。」 The readout is rebuilt with innerHTML on every
   mousemove, so a CSS animation on a freshly created node is re-seeded at t=0 sixty times a second —
   an arrow that is only "dynamic" while nobody is touching the map. */
test('R289 ② the wind arrow points downwind and carries its animation phase across rebuilds', () => {
  const s = read('js/map-readout.js');
  assert.match(s, /const card=window\.IntMapCompass\.point\(w\.dir,HOST\.lang,8\);/,
    'the direction is a word from the one table');
  assert.match(s, /const to=\(\(w\.dir\+180\)%360\)\.toFixed\(1\);/,
    'the arrow points DOWNWIND — `dir` is the meteorological FROM bearing');
  /* ⚠ (#R290) THE DRIFT IS GONE, BY REQUEST — 「風の流れる向きに動かさなくてよい。向きだけ表示しろ。」
     What #R289 built here was the motion and the machinery that kept its phase continuous across
     the readout's `innerHTML` rebuild. Both are removed; the ROTATION, which is the direction and
     is what the reader kept, is asserted above and again below. The removal is asserted too, so a
     later round cannot quietly put the animation back. */
  assert.ok(!/animation-duration:'\+dur/.test(s), 'no speed-scaled drift duration');
  assert.ok(!/animation-delay:-'\+ph/.test(s), 'no phase carry — there is no animation to carry');
  const css = read('css/intmap.css');
  assert.ok(!/@keyframes cr-wind-fly\{/.test(css), 'the drift keyframes are gone with it');
  assert.ok(!/\.coord-readout \.cr-warr i\{[^}]*animation-name/.test(css), 'and the inner element does not animate');
  /* (#R290) the reduced-motion escape hatch went with the motion — there is nothing left to
     suppress, and a rule for an animation that does not exist is a rule that will outlive its
     subject. Every reader now gets what 「prefers-reduced-motion」 asked for. */
  assert.ok(!/prefers-reduced-motion:reduce\)\{ \.coord-readout \.cr-warr/.test(css),
    'and the reduced-motion escape hatch is gone with it — nothing moves for anybody');
});

/* ── ③ THE COASTLINE IS THE BORDER LINE, DRAWN ROUND THE WATER ──────────────────────────────
   「海岸線も国境線が全く同じ手法で描かれるようにしてください。」 「全く同じ手法で」 is the assertion:
   the same source, the same colour, the same two width ladders, the same casing pair. */
test('R289 ③ the coastline uses the border line’s own source, colour and widths', () => {
  const s = read('js/coast-line.js');
  const body = read('js/app-body.js');
  for (const need of [/source: 'ofm'/, /'source-layer': 'water'/, /'line-color': BORDER_COLOR/,
    /'line-width': BORDER_WIDTH/, /'line-width': BORDER_CASING/, /id: 'coast-only-line'/, /id: 'coast-only-casing'/]) {
    assert.match(s, need, `the coastline must be drawn with ${need}`);
  }
  /* the casing goes UNDER the line, exactly as the border's does */
  assert.match(s, /BORDER_CASING \} \}, 'coast-only-line'\);/, 'the casing is inserted below the line');
  /* a hotel pool is not a coast; a dock basin is */
  assert.match(s, /\['!', \['==', \['get', 'class'\], 'swimming_pool'\]\]/, 'swimming pools are excluded');
  /* the shell wires it in two lines and keeps no second copy of the layer */
  assert.match(body, /import \{ makeCoastLine \} from '\.\/coast-line\.js';/, 'app-body imports it by name');
  assert.match(body, /makeCoastLine\(\{ GE, canDraw, ensurePlaceLabels, BORDER_COLOR, BORDER_WIDTH, BORDER_CASING \}\);/);
  assert.ok(!/coast-only-line',type:'line'/.test(body), 'the shell must not build the layer as well');
  /* the row exists, ships ON (#R476), and is filed with the other base displays rather than as a
     data layer. ⚠ THIS ASSERTION USED TO READ «ships unchecked / NOT in the default-on list». That was
     #R289's own choice, not a property of the coastline, and 「Coastlines & shoresはデフォルトでオンに
     して」 reversed it — so the statement is reversed here rather than deleted, because what the check
     is for is that the two halves of the default agree, whichever way they point (tests/r476-checks ①). */
  const html = read('index.html');
  assert.match(html, /<input type="checkbox" id="cb-coast" checked>/, 'the row ships checked');
  const dl = read('js/data-layers.js');
  assert.match(dl, /'cb-names','cb-geolabels','cb-poi','cb-borders','cb-coast','cb-admin1'/,
    'it sits with the base displays in the panel order');
  assert.match(dl, /IntMapDefaultOn=\[[^\]]*'cb-coast'/, 'and it IS in the default-on list');
  /* ⚠ 「風レイヤーオン時はデフォルトでオン」 IS A DEFAULT, NOT A COUPLING. The latch is what makes it
     one: a reader who switches the coast off while the wind is up must not be overruled (#R85). */
  assert.match(dl, /window\._imCoastAuto&&window\._imCoastAuto\(\);/, 'switching the wind on offers the coastline');
  assert.match(s, /if \(!c \|\| c\.__windAuto\) return false;/, 'and it only ever does so once');
});

/* ── ④ THE TWO MERGES ────────────────────────────────────────────────────────────────────────
   「1人当たりCO₂排出レイヤーとCO₂排出量（百万t）レイヤーは一つに統合し…他のものも」. Two rows became
   one row with a switch, twice. The QUANTITY must still be reachable — a merge is not a deletion. */
test('R289 ④ CO₂ and defence spending are one row each, with both views still reachable', () => {
  const wb = read('js/wb-layers.js');
  assert.ok(!/\{id:'wbco2t'/.test(wb), 'the separate total-CO₂ row is gone');
  assert.match(wb, /\{id:'wbco2', modes:\[/, 'and the survivor is modal');
  for (const code of ['EN.GHG.CO2.MT.CE.AR5', 'EN.GHG.CO2.PC.CE.AR5']) {
    assert.equal(wb.split(`code:'${code}'`).length - 1, 1, `${code} must be declared exactly once`);
  }
  /* the FIRST mode is the default, and it is the total — the name the row always had */
  const block = wb.slice(wb.indexOf("{id:'wbco2', modes:["));
  assert.ok(block.indexOf('EN.GHG.CO2.MT.CE.AR5') < block.indexOf('EN.GHG.CO2.PC.CE.AR5'),
    'the total is the first mode, and the first mode is the default');
  /* ⚠ THE RAMP IS RE-ASSERTED ON EVERY REPAINT. The addLayer branch runs once; a mode change after
     it would otherwise paint megatonnes through the per-capita ramp. */
  assert.match(wb, /GE\(\)\.layers\.setPaint\(fill,'fill-color',\['case',\['has','v'\],\['interpolate',\['linear'\],\['get','v'\]\]\.concat\(L\.ramp\),'#9aa0a6'\]\)/,
    'the fill colour must be re-asserted, not only set at creation');
  /* ⚠ THE ROW'S NAME IS THE MODE'S NAME, and a shallow copy that drops `modes` makes it EMPTY —
     measured in the browser before this line existed: the CO₂ row rendered with a blank label and
     every other thing about it was correct. */
  assert.match(wb, /const ALL=WB\.map\(L=>\(\{id:L\.id,n:L\.n,modes:L\.modes,/,
    'the row list must carry `modes`, or a modal row has no name at all');
  /* the thumbnail's pre-load copy and the layer cannot disagree about which series is on */
  assert.match(wb, /codeOf:\(id\)=>\{ const L=WB\.find\(x=>x\.id===id\); return L\?V\(L\)\.code:null; \}/,
    'the active indicator is published for the thumbnail to read');
  assert.match(read('js/layer-previews.js'), /function wbCode\(id,spec\)\{/, 'and the thumbnail reads it');
  /* defence spending: one row, two fills, and the switch lives in BOTH legends because the reader
     is looking at the one for the mode that is on */
  const dl = read('js/data-layers.js');
  assert.ok(!/\['milSpendGDP','lyrMilSpendGDP'\]/.test(dl), 'the second defence row is gone from the panel');
  assert.match(dl, /\['milSpend','lyrMilSpend'\],\['nato','lyrNATO'\]/, 'one defence row remains');
  assert.match(dl, /function applyMilMode\(\)\{/, 'and a mode decides which of the two is showing');
  assert.match(dl, /milModeRow\(lgdMil\); milModeRow\(lgdMilGDP\);/, 'the switch is in both legends');
  assert.match(dl, /addChoro\('milSpendGDP'\); applyChoro\('milSpendGDP',s=>\(s\.milSpend!=null&&s\.gdp\)\?s\.milSpend\/s\.gdp\*100:null\)/,
    'the % of GDP picture is the one that was already there');
  /* a saved session that had either retired row on lands on the row that stayed */
  const st = read('js/session-tabs.js');
  assert.match(st, /'bx-wbco2t':'bx-wbco2', 'dl-milSpendGDP':'dl-milSpend'/,
    'both retired ids must be translated on the way in, not silently dropped');
});

/* ── ⑤ NATO / EU: A SECOND COLOURING, AND A LEGEND THAT DOES NOT CONTRADICT IT ───────────────
   「加盟年ごとに色分けされたバージョンも用意して」. #R270's defect was a legend whose gradient
   disagreed with the map; a flat blue bar over a year-coloured map is the same statement. */
test('R289 ⑤ NATO and the EU can be coloured by accession year, and the bar goes away with it', () => {
  const dl = read('js/data-layers.js');
  assert.match(dl, /function yearColors\(years\)\{/, 'one palette builder');
  assert.match(dl, /function yearFillExpr\(years,colors,fallback\)\{/, 'one fill-expression builder');
  assert.match(dl, /function styleModeRow\(el,cls,get,set\)\{/, 'one switch builder — not two');
  for (const who of ['nato', 'eu']) {
    assert.match(dl, new RegExp(`function ${who}FillColor\\(\\)\\{ return \\(_${who}Style==='byYear'\\)`),
      `${who} must decide its fill from the mode`);
    assert.match(dl, new RegExp(`GE\\(\\)\\.layers\\.setPaint\\('${who}-fill','fill-color',${who}FillColor\\(\\)\\)`),
      `${who} must re-assert the colouring on every repaint, not only at creation`);
    assert.match(dl, new RegExp(`styleModeRow\\(el2,'${who}-style-row'`), `${who}'s legend carries the switch`);
  }
  /* the accession year travels WITH the feature — otherwise the expression has nothing to match on */
  assert.match(dl, /properties:\{__code:code,__y:\(jy\|\|0\)\}/, 'NATO features carry their accession year');
  assert.match(dl, /properties:\{__code:code,__y:\(EU_JOIN\[code\]\|\|0\)\}/, 'and so do the EU’s');
  /* ⚠ THE GRADIENT BAR DESCRIBES THE UNIFORM COLOURING ONLY */
  assert.match(dl, /\['\.dl-bar','\.dl-scale'\]\.forEach\(sel=>\{ const e2=el\.querySelector\(sel\); if\(e2\) e2\.style\.display=byYear\?'none':''; \}\);/,
    'the flat bar must be hidden while the map is coloured by year');
  /* ⚠ AND THE «BUILT ONCE» GUARD IS A BRANCH, NOT A RETURN — a control whose selected state changes
     while the legend stays up cannot be built behind an early return. */
  for (const who of ['nato', 'eu']) {
    assert.ok(!new RegExp(`querySelector\\('\\.${who}-year-row'\\)\\)[^\\n]*return;`).test(dl),
      `${who}Legend must not return before the colouring switch is (re)drawn`);
  }
  /* the EU key is built from the years countries actually acceded in — 2020 and 2024 are slider
     stops (Brexit, and «today»), and spending two of eight ramp steps on empty waves is a lie */
  assert.match(dl, /const EU_JOIN_YEARS=\[\.\.\.new Set\(Object\.values\(EU_JOIN\)\)\]\.sort\(\(a,b\)=>a-b\);/);
  assert.match(dl, /yearKeyHTML\(EU_JOIN_YEARS,yearColors\(EU_JOIN_YEARS\),EU_JOIN,_euYear,EU_LEFT\)/,
    'a member who has LEFT by the selected year must not be counted in its wave');
});

/* ── ⑥ THE U.S. ELECTIONS: A STATE'S OWN RESULT ─────────────────────────────────────────────
   「クリックした州内での票のグラフを表示して。選挙人の数も記載。」 */
test('R289 ⑥ every election carries per-state results, and they agree with the map’s own colours', () => {
  const d = json('data/us-elections.json');
  assert.equal(d.elections.length, 60, 'all sixty elections');
  let rows = 0, withVotes = 0, withEv = 0;
  for (const e of d.elections) {
    assert.ok(e.sv && Object.keys(e.sv).length, `${e.y} has no per-state result at all`);
    for (const [st, o] of Object.entries(e.sv)) {
      rows++;
      if (o.v) { withVotes++; assert.equal(o.v.length, e.c.length, `${e.y} ${st}: one vote entry per candidate`); }
      if (o.e) { withEv++; assert.equal(o.e.length, e.c.length, `${e.y} ${st}: one elector entry per candidate`); }
      assert.ok(o.v || o.e, `${e.y} ${st}: an empty result is not a result`);
      if (o.t) assert.ok(o.t > 0, `${e.y} ${st}: a total of ${o.t}`);
      /* ⚠ THE CHART MUST NOT CONTRADICT THE FILL. The state matrix `s` decides the colour; the
         candidate with the most electors decides the chart. A TIE is a state that split its
         electors (1892 North Dakota gave one each to three men) and is not a contradiction. */
      if (o.e && e.s[st] != null) {
        const max = Math.max.apply(null, o.e);
        const tied = o.e.filter((x) => x === max).length > 1;
        if (max > 0 && !tied) {
          assert.equal(o.e.indexOf(max), e.s[st],
            `${e.y} ${st}: the chart gives the electors to ${e.c[o.e.indexOf(max)].n} and the map colours it for ${e.c[e.s[st]].n}`);
        }
      }
    }
  }
  assert.ok(rows > 2_000, `only ${rows} state results — the record has more than that`);
  assert.ok(withVotes > 1_800, `only ${withVotes} states carry a popular vote`);
  assert.ok(withEv > 1_800, `only ${withEv} states carry an elector count`);
  /* the two years past the compilation are complete, and their electors sum to 538 */
  for (const y of [2020, 2024]) {
    const e = d.elections.find((x) => x.y === y);
    assert.equal(Object.keys(e.sv).length, 51, `${y}: fifty states and the District of Columbia`);
    const tot = Object.values(e.sv).reduce((a, o) => a + o.e.reduce((x, z) => x + z, 0), 0);
    assert.equal(tot, 538, `${y}: the electors must sum to 538, not ${tot}`);
    e.c.forEach((c, i) => {
      const got = Object.values(e.sv).reduce((a, o) => a + (o.e[i] || 0), 0);
      assert.equal(got, c.ev, `${y}: the per-state electors give ${c.n} ${got}, the record says ${c.ev}`);
    });
  }
  /* the two OVERRIDE cells the per-state returns corrected */
  const e1832 = d.elections.find((x) => x.y === 1832);
  assert.equal(e1832.c[e1832.s.VT].n, 'William Wirt', 'Vermont 1832 went to Wirt, the only state he carried');
  const e1892 = d.elections.find((x) => x.y === 1892);
  assert.equal(e1892.c[e1892.s.WY].n, 'Benjamin Harrison', 'Wyoming 1892 went to Harrison');
  /* the panel: the state chart exists and the year stepper is big enough to hit */
  const ue = read('js/us-elections.js');
  assert.match(ue, /function stateHtml\(e,st,name\)\{/, 'a click must be able to draw the state’s own result');
  assert.match(ue, /Electoral votes','選挙人票'/, 'and it names the elector count');
  assert.match(ue, /'\.usel-step\{flex:0 0 auto;width:38px;height:38px/, 'the ‹ › box is 38 px, not 30');
  assert.match(ue, /font-size:22px/, 'and the chevron itself is 22 px, not 13');
  assert.match(ue, /@media\(max-width:768px\)\{\.usel-step\{width:44px;height:44px/, 'a finger gets 44 px');
});

/* ── ⑦ CHRONOS ──────────────────────────────────────────────────────────────────────────────
   「IntMap統一時間機能を、これよりChronosという名称に。…⌛絵文字は削除です。」 */
test('R289 ⑦ the master clock is named Chronos, has its own file, and lost the hourglass', () => {
  assert.ok(existsSync(join(ROOT, 'js/chronos.js')), 'the clock has its own file');
  const clock = read('js/chronos.js');
  assert.match(clock, /window\.IntMapTime=\(function\(\)\{/, 'and it is still the same one IIFE');
  assert.ok(!/newsDate *=/.test(clock), 'the clock must not assign a variable that lives in another file');
  assert.match(read('js/app-body.js'), /window\.IntMapTime\.on\(e=>\{ try\{ newsDate = e\.isLive \? null : new Date\(e\.when\); \}catch\(_\)\{\} \}\);/,
    'app-body keeps newsDate in lock-step through an ordinary subscriber');
  assert.match(read('src/main.js'), /import '\.\.\/js\/chronos\.js';/, 'and the clock is published at import time');
  /* the words the reader sees */
  const ntl = read('js/news-timeline.js');
  assert.match(ntl, /if\(title\) title\.textContent='Chronos';/, 'the panel is named Chronos');
  assert.match(ntl, /if\(ot\) ot\.textContent='Chronos';/, 'so is the collapsed button');
  assert.match(ntl, /Control the map’s time','地図の時間を操作'/, '「Chronos／地図の時間を操作」');
  assert.match(ntl, /Control IntMap’s unified time','IntMapの統一時間を操作'/, '「Chronos／IntMapの統一時間を操作」');
  /* ⚠ THE CODE SHAPE, NOT THE WORDS — this round's own note quotes 「過去の世界を見る」 to explain
     what the button used to say, and a bare search would catch the explanation. That is the
     fifteenth time this project has written a check that fires on its own comment. */
  assert.ok(!/L5\('See the past world'/.test(ntl), 'the old button label is gone');
  for (const c of ['en', 'jp', 'de', 'ru', 'es', 'fr', 'ko', 'zh', 'zh-hans']) {
    const s = read(`js/locales/ui.${c}.js`);
    assert.match(s, /"?tlMachine"?:"Chronos"/, `ui.${c}.js must call it Chronos`);
  }
  /* ⚠ 「⌛絵文字は削除です。」 — and it was a CSS ::before, not a character in the markup */
  assert.ok(!/\.ntl-title::before\{ content:"⏳"/.test(read('css/intmap.css')), 'the hourglass is gone');
});

/* ── ⑧ THE CLOCK SELECTOR ────────────────────────────────────────────────────────────────────
   「どこの時刻を採用するかのプルダウンを付けて。デフォルトはユーザーが設定した時刻だが、UTCも選ぶことが」
   ⚠ The read-back is the half that can be wrong: `setHours` writes DEVICE local time, so with UTC
   selected the slider would have said 14:30 and set the device's 14:30. */
test('R289 ⑧ Chronos reads and writes wall-clock time in the zone the reader picked', () => {
  const s = read('js/news-timeline.js');
  assert.match(s, /let zone='user';/, 'the default is the reader’s own setting');
  assert.match(s, /if\(zone==='UTC'\) return \{tz:'UTC'\};/, 'UTC is selectable');
  assert.match(s, /const ZONES=\['Pacific\/Auckland'/, 'and so are the major zones');
  assert.match(s, /if\(zone==='map'\)\{ let h=null;/, 'and the standard time where the map is centred');
  assert.match(s, /function zFields\(d\)\{/, 'an instant → its fields in that zone');
  assert.match(s, /function zInstant\(F\)\{/, 'and the fields back to an instant');
  /* ⚠ the inverse needs the offset AT THAT INSTANT, and one correction pass for the DST boundary */
  assert.match(s, /t=naive-tzOffMs\(new Date\(naive\),sp\.tz\);\r?\n\s+t=naive-tzOffMs\(new Date\(t\),sp\.tz\);/,
    'the zone inverse must be corrected once — a zone’s offset depends on the instant');
  assert.match(s, /const f=zFields\(base\); f\.h=Math\.floor\(mins\/60\); f\.m=mins%60;\r?\n\s+window\.IntMapTime\.set\(zInstant\(f\)/,
    'the time-of-day slider must be read back in the chosen zone, not with setHours');
  assert.ok(!/base\.setHours\(Math\.floor\(mins\/60\)/.test(s), 'the device-local read-back is gone');
  /* the boundaries the «map centre» option needs have ONE owner, and asking never fetches */
  const lp = read('js/layer-packs.js');
  /* ⚠⚠ (#R290) AND IT IS THE ONLY OBJECT UNDER THAT NAME. MEASURED on the built page before this
     round: `Object.keys(window.IntMapTimeZones)` was ['highlight','highlighted','clear'] — the
     #R204 accessor further down the same file assigned the name outright and erased this one, so
     `ensure` / `ready` / `offsetAt` never existed and Chronos's 「地図の中心の標準時」 fell back to
     the device for everybody. Every assignment must EXTEND. */
  assert.match(lp, /window\.IntMapTimeZones=Object\.assign\(window\.IntMapTimeZones\|\|\{\},\{/,
    'the tz layer publishes the accessor by extending the name');
  assert.ok(!/window\.IntMapTimeZones=\{/.test(lp), 'and nothing replaces it');
  assert.equal((lp.match(/window\.IntMapTimeZones=/g) || []).length, 2,
    'the two publishers are both extenders — a third assignment is what this is guarding against');
  for (const m of ['ensure:', 'ready:', 'offsetAt:', 'highlight:', 'highlighted:', 'clear:'])
    assert.ok(lp.includes(m), `the one object carries ${m}`);
  assert.match(lp, /offsetAt:function\(lng,lat\)\{ if\(!geo\|\|!geo\.features\|\|!window\._imPipGeo\) return null;/,
    'offsetAt must answer null rather than start a fetch');
});

/* ── ⑨ WHAT ELSE FOLLOWS THE CLOCK ───────────────────────────────────────────────────────────
   「時間で変わるものは、IntMapの統一時間にすべて合わせること。（タイムマシンで変更された瞬間に）」 */
test('R289 ⑨ the satellites move with the clock, and the forecast axis still declines what it cannot show', () => {
  const sat = read('js/satellites-live.js');
  assert.match(sat, /function clockNow\(\)\{ try\{ const T=window\.IntMapTime; if\(T&&T\.when\) return T\.when\(\); \}catch\(_\)\{\} return new Date\(\); \}/,
    'SGP4 must be given the master instant, falling back to the wall clock');
  assert.match(sat, /const t=when\|\|clockNow\(\);/, 'and propagateAll must use it');
  assert.ok(!/const t=when\|\|new Date\(\);/.test(sat), 'the wall-clock default is gone');
  assert.match(sat, /return isFinite\(e\)\?\(clockNow\(\)\.getTime\(\)-e\)\/3600000:null;/,
    'the element age must be measured against the frame’s own instant, or it stops being honest');
  assert.match(sat, /refresh\(\)\{ if\(on\) paint\(\); return on; \},/, 'and the layer can be told to re-propagate');
  /* ⚠ THE WEATHER HALF SHIPPED IN #R288, WHICH LANDED WHILE THIS ROUND WAS BEING WRITTEN — its
     `_followClock` seeks the forecast axis to the master instant and DECLINES when the instant is
     outside the model's window, which is what this round set out to build. So this round did not
     build it twice; what it checks is that the property still holds, and that the poll #R288 wrote
     for an import order that no longer exists still lands. */
  const ec = read('js/wx-ecmwf.js');
  assert.match(ec, /function _followClock\(e\) \{/, 'the forecast axis follows the master clock');
  assert.match(ec, /if \(!covers\(ms\)\) return;/,
    'an instant OUTSIDE the forecast window is declined, never snapped onto today');
  /* ⚠⚠ (#R290) IT NO LONGER SUBSCRIBES, BY REQUEST — 「ECMWF系レイヤーで、時間選択をChronosに受け
     流さなくてよい。個別の時間選択UIを使え。」 Both directions of #R288's coupling are removed: a
     forecast step no longer writes the app-wide instant (which used to drag the news, the borders
     and the terminator with it), and an app-wide move no longer overwrites the hour the reader
     chose in the weather legend. `_followClock` stays DECLARED and exported, because asking for
     the weather at a named instant is a deliberate action Atlas can take. */
  assert.ok(!/C\.on\(_followClock\)/.test(ec), 'nothing subscribes the axis to the master clock');
  assert.match(ec, /function _pushNow\(\) \{ clearTimeout\(pushT\); pushT = 0; \}/,
    'and a step no longer pushes the master clock');
  assert.match(ec, /followClock: _followClock,/, 'it is still reachable by name');
  /* 「変更された瞬間に」 — on the broadcast, not on whatever redraws next */
  const body = read('js/app-body.js');
  assert.match(body, /window\.IntMapSatellites&&window\.IntMapSatellites\.refresh\) window\.IntMapSatellites\.refresh\(\);/,
    'the satellites re-propagate on the broadcast itself');
  assert.ok(!/IntMapECMWF/.test(body),
    'and the shell must not wire the weather a second time — js/wx-ecmwf.js owns that since #R288');
});

/* ── ⑩ THE FLAT MAP DOES NOT LEAD TO SPACE ──────────────────────────────────────────────────
   「Flat地図では、ズームし続ければ宇宙へ行く機能を無効に。」 The crossing hands the space camera the
   size and the FACE the Earth had on screen, which is a statement about a sphere. */
test('R289 ⑩ the zoom-out crossing is refused on the flat projection, gauge and all', () => {
  const s = read('js/space.js');
  assert.match(s, /function flatProj\(\)\{ try\{ return HOST\.proj!=='globe'; \}catch\(_\)\{ return false; \} \}/,
    'the projection is asked through the host, and an error is not "flat"');
  assert.match(s, /function pushOut\(dz\)\{\r?\n\s+if\(flatProj\(\)\)\{ if\(over\)\{ over=0; paintGauge\(0\); \} return; \}/,
    'the refusal must be the FIRST thing pushOut does, and it must clear the gauge with it');
  /* ⚠ the way BACK is untouched: a session already in space that switches to flat can still leave */
  assert.ok(!/function pushIn\(dz\)\{\r?\n\s+if\(flatProj\(\)\)/.test(s), 'pushIn must not be gated — that would trap the reader');
});

/* ── ⑪ THE THREE DELETED LAYERS ARE GONE FROM EVERY SURFACE ─────────────────────────────────
   「以下の３レイヤーは削除して。紫外線エアロゾル指数／一酸化炭素 (CO)／雲・赤外（実時間）」
   ⚠ Named by the CODE SHAPE, so this round's own notes — which quote the ids to explain why they
   went — cannot make the check pass or fail by accident. */
test('R289 ⑪ the UV aerosol index, CO and the IR clouds layer left every surface', () => {
  for (const [f, shapes] of [
    ['js/layer-packs.js', ["{id:'gxaero'", "{id:'gxco'", 'gxaero:{lo:', 'gxco:{loK:']],
    ['js/layer-previews.js', ["'gx-gxaero':G(", "'gx-gxco':G("]],
    ['js/atlas-console.js', ["'co':'gx-gxco'"]],
    ['scripts/probe-gibs-range.mjs', ["id: 'gxaero'", "id: 'gxco'"]],
    ['js/data-layers.js', ['const IR_SATS=[', 'function cloudsLegendHint(', 'function setCloudsVis(',
      "['clouds','lyrClouds']", "clouds:0.75", "id==='clouds'"]],
  ]) {
    const s = read(f);
    for (const sh of shapes) assert.ok(!s.includes(sh), `${f} still carries ${sh}`);
  }
  /* the measured extents went with them, and the five that were NOT named are still there */
  const r = json('data/gibs-range.json');
  assert.ok(!r.layers.gxaero && !r.layers.gxco, 'data/gibs-range.json still measures a deleted layer');
  for (const id of ['gxndvi', 'gxseaice', 'gxsstanom', 'gxsoil']) {
    assert.ok(r.layers[id], `${id} was deleted and nobody asked for that`);
  }
  /* the dead i18n key went too — a key no surface asks for is a key that will be translated for ever */
  for (const c of ['en', 'jp', 'de', 'ru', 'es', 'fr', 'ko', 'zh', 'zh-hans']) {
    assert.ok(!/"?lyrClouds"?:/.test(read(`js/locales/ui.${c}.js`)), `ui.${c}.js still declares lyrClouds`);
  }
  /* ⚠ AND THE ECMWF CLOUD LAYER IS A DIFFERENT LAYER AND STAYS */
  assert.match(read('js/data-layers.js'), /'ec-cloud'/, 'the ECMWF cloud-cover layer was not named and must remain');
});
