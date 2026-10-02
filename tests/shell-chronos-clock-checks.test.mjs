/* ============================================================================
 *  shell-chronos-clock-checks — Chronos, the master clock, and what moves with it
 * ----------------------------------------------------------------------------
 *  One subject, gathered from the round-numbered files that each held a piece of it:
 *  tests/r231-checks.test.mjs
 *  tests/r504-checks.test.mjs
 *  tests/r200-checks.test.mjs
 *  tests/r289-checks.test.mjs
 *  Every test keeps its original title (led by the round that wrote it), and every round's own
 *  account of WHY its checks exist is kept above them. Each round's checks sit in their own block
 *  so the helpers it wrote for itself stay its own; the file root and the plain text reader are
 *  shared below.
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
/* (module-graph) readers IMPORT the clock and call the bare binding `IntMapTime.x(`; a bare name is the
   clock only in a file that imports it from js/chronos.js */
const importsClock = (src) => /^import \{[^}]*\bIntMapTime\b[^}]*\} from '\.\/chronos\.js';/m.test(src);

/* ═══════════════════════ #R231 · from r231-checks.test.mjs ═══════════════════════ */
/* (#R231 — the round's own account of why these checks exist heads its other half, in tests/shell-i18n-locales-checks.test.mjs) */
{
/* spelling kept: stylesheet rule (css/intmap.css) — Node has no cascade or layout to evaluate it in. */
test('R231 time machine: on a phone the clock is reached from the sheet, not a floating pill', () => {
  /* (mobile-shell, 2026-10-02) the owner asked for the phone screen to be REBUILT, not patched: the floating
     54 px pill this test used to pin is gone on a phone and the clock entry lives in the sheet's head
     (#m-clock), opening Chronos as one of the sheet's screens. What #R231 protected — the time machine is
     one tap away on a phone and the entry is a real button — is what this measures now. */
  const css = read('css/intmap.css');
  const html = read('index.html');
  assert.ok(/<button[^>]*\sid="m-clock"/.test(html), 'the sheet head carries the clock button');
  assert.ok(css.includes('.news-timeline.collapsed{ display:none !important; }'), 'the floating collapsed pill is not drawn on a phone');
  const at = css.indexOf('.news-timeline.collapsed{ display:none !important; }');
  assert.ok(css.lastIndexOf('@media(max-width:768px){', at) >= 0, 'that rule is inside a phone media block');
});
}

/* ═══════════════════════ #R504 · from r504-checks.test.mjs ═══════════════════════ */
/* (#R504 — the round's own account of why these checks exist heads its other half, in tests/shell-data-layers-checks.test.mjs) */
{
const rd = read;

/* spelling kept: page markup / inline script (index.html) — only a browser document runs it. */
test('R504 ⑫ the Chronos glyph is a clock, not a history arrow', () => {
  const html = rd('index.html');
  const m = /<span class="ntl-open-ico">([\s\S]*?)<\/span>/.exec(html);
  assert.ok(m, 'index.html carries the Chronos glyph');
  const svg = m[1];
  /* ⚠ WHAT IT MUST NOT BE. The old mark was rotate-ccw — a corner tick and a nearly-closed arc —
     with a pair of hands inside it, which at 23 px reads as 「戻す」 rather than as a clock. */
  assert.ok(!/M3 3v5h5/.test(svg), 'the undo arrow head is gone');
  assert.ok(!/A9 9 0|A 9 9 0/i.test(svg), 'and so is its open sweep arc');
  /* what it must be: a face, marks, two hands from the centre, a pivot */
  assert.equal((svg.match(/<circle /g) || []).length, 2, 'a face and a pivot');
  assert.match(svg, /<circle cx="12" cy="12" r="9\.?\d*"\/>/, 'the face is a full circle, centred');
  assert.match(svg, /M12 3\.6v1\.6M20\.4 12h-1\.6M12 20\.4v-1\.6M3\.6 12h1\.6/, 'twelve, three, six and nine are marked');
  assert.match(svg, /M12 6\.9V12l3\.7 2\.2/, 'and the hands leave the centre');
  assert.ok(!/\sid="/.test(svg), 'no id — the same trap as the compass roses (⑧)');
});
}

/* ═══════════════════════ #R200 · from r200-checks.test.mjs ═══════════════════════ */
/* (#R200 — the round's own account of why these checks exist heads its other half, in tests/shell-app-body-modules-checks.test.mjs) */
{
const CORE = read('js/app-body.js');

/* spelling kept: browser script (js/theme-sky.js, js/night-side.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R200 ⑥: the sky subscribes to the master clock at a moment when the clock EXISTS', () => {
  const sky = read('js/theme-sky.js');
  /* the defect: a factory-body statement guarded on something built ~2,200 lines later. What must be
     true now is (a) the subscription is inside a function, (b) something calls that function from a
     path that runs after boot, (c) it attaches once. */
  /* (module-graph) negative, so it matches BOTH spellings — the old global and the imported binding */
  assert.doesNotMatch(sky, /^\s*try\{ if\((?:window\.)?IntMapTime&&(?:window\.)?IntMapTime\.on\) (?:window\.)?IntMapTime\.on\(/m,
    'the subscription must not be a statement in the factory body — that runs before window.IntMapTime exists');
  assert.match(sky, /function _followClock\(\)\{/, 'it is a function…');
  assert.match(sky, /if\(_followClock\._on\) return false;/, '…that attaches at most once…');
  assert.match(sky, /function _applySkyAtmosphere\(sat\)\{[\s\S]{0,200}?_followClock\(\);/,
    '…and the sky applying itself is what calls it (first runs inside map-load, after the clock is built)');
  /* the same shape in js/night-side.js was already correct — its wire() is called from apply(), which
     app-body calls from map-load — and this is what says so, so a future move cannot break it quietly. */
  const ns = read('js/night-side.js');
  assert.ok(importsClock(ns), 'js/night-side.js imports the clock from js/chronos.js');
  assert.match(ns, /function wire\(\)\{[\s\S]{0,900}?(?<![\w.])IntMapTime&&IntMapTime\.on/,
    'the night side subscribes from wire(), not from module scope');
  assert.match(CORE, /window\.IntMapNightSide&&window\.IntMapNightSide\.apply\(\)/, 'and app-body calls apply() from map-load');
});

/* spelling kept: browser script (js/chronos.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R200 ⑥b: every window.IntMapTime.<method> a module calls is one the clock really has', () => {
  /* ⚠ THE SECOND HALF OF THE SAME BUG, and the one no amount of re-reading js/theme-sky.js would have
     shown: four files asked for `IntMapTime.now()`. There is no such method — the master clock's
     surface is get/when/iso/year/isLive/min/state/on/set/setYear/setDaysAgo/setNow, and `now` is a
     PRIVATE `const now=()=>new Date()` inside that IIFE. Written as `if(T&&T.now){…}` the mistake is
     invisible: the guard is simply false forever and every one of them silently used the wall clock,
     so the sky, the terminator, the city lights, the star field and Cesium's own solar lighting all
     ignored the time machine. The surface below is READ OUT of js/app-body.js, not written down. */
  /* ⚠ (#R289) THE CLOCK MOVED TO js/chronos.js AND THE QUESTION DID NOT. 「IntMap統一時間機能を、
     これよりChronosという名称に」 made it a subject and a subject gets its own file; a check that
     insisted on the old ADDRESS would call a rename a regression — the trap #R254 and #R282 both had
     to remove. What #R200 was really asserting — that the surface below is READ OUT of the clock's
     own source rather than written down here — is unchanged. */
  const CLOCK = read('js/chronos.js');
  /* (module-graph) the IIFE is now the module's exported binding: export const IntMapTime=(function(){…})(); */
  const iife = /export const IntMapTime=\(function\(\)\{[\s\S]*?\n\}\)\(\);/.exec(CLOCK);
  assert.ok(iife, 'the master clock is still one IIFE, wherever it lives');
  assert.ok(!/IntMapTime=\(function/.test(CORE), 'the clock must not be built in the shell as well');
  const api = new Set([...iife[0].matchAll(/\bOS\.(\w+)\s*=/g)].map((m) => m[1]));
  assert.ok(api.has('when') && api.has('on') && api.has('isLive'), `the clock exposes ${[...api].join('/')}`);
  const dir = join(ROOT, 'js');
  let clockReaders = 0;
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.js'))) {
    const src = readFileSync(join(dir, f), 'utf8');
    /* (module-graph) a reader is a file that still names the old global, OR imports the clock and uses the
       bare binding — after the migration 41 files are the second kind, and skipping them made this blind */
    const reads = /const T=window\.IntMapTime/.test(src) || /window\.IntMapTime\./.test(src)
      || (importsClock(src) && (/const T=IntMapTime\b/.test(src) || /(?<![\w.$])IntMapTime\./.test(src)));
    if (reads) clockReaders++;
    for (const m of src.matchAll(/(?:window\.IntMapTime|(?<![\w.$])IntMapTime|\bT)\.(\w+)\s*[({]/g)) {
      /* `T` is the local alias every one of these sites uses for the clock */
      if (!reads) continue;
      if (!api.has(m[1]) && /^(now|when|get|iso|year|isLive|state|set|setYear|setDaysAgo|setNow|on|min)$/.test(m[1]))
        assert.fail(`js/${f} calls IntMapTime.${m[1]}(), which the clock does not expose`);
    }
    assert.doesNotMatch(src, /IntMapTime[\s\S]{0,40}?\bT\.now\b/, `js/${f} must not ask for IntMapTime.now — it does not exist`);
  }
  /* the scan has to SEE the readers it is about — measured 2026-10-01: 41 js/ files import the clock and 35
     of them call it as IntMapTime.x( or T.x( (the other 6 alias it under another name, which this scan never read) */
  assert.ok(clockReaders >= 35, `only ${clockReaders} js/ files were recognised as clock readers — the scan went blind`);
});
}

/* ═══════════════════════ #R289 · from r289-checks.test.mjs ═══════════════════════ */
/* (#R289 — the round's own account of why these checks exist heads its other half, in tests/shell-data-layers-checks.test.mjs) */
{
const read = (p) => readLF(resolve(ROOT, p));

/* ── ⑦ CHRONOS ──────────────────────────────────────────────────────────────────────────────
   「IntMap統一時間機能を、これよりChronosという名称に。…⌛絵文字は削除です。」 */
/* spelling kept: stylesheet rule (css/intmap.css) — Node has no cascade or layout to evaluate it in. */
test('R289 ⑦ the master clock is named Chronos, has its own file, and lost the hourglass', () => {
  assert.ok(existsSync(join(ROOT, 'js/chronos.js')), 'the clock has its own file');
  const clock = read('js/chronos.js');
  assert.match(clock, /export const IntMapTime=\(function\(\)\{/, 'and it is still the same one IIFE (module-graph: now the exported binding)');
  assert.ok(!/newsDate *=/.test(clock), 'the clock must not assign a variable that lives in another file');
  assert.ok(importsClock(read('js/app-body.js')), 'app-body imports the clock (module-graph)');
  assert.match(read('js/app-body.js'), /(?<![\w.])IntMapTime\.on\(e=>\{ try\{ newsDate = e\.isLive \? null : new Date\(e\.when\); \}catch\(_\)\{\} \}\);/,
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
/* spelling kept: browser script (js/news-timeline.js, js/layer-packs.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
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
  assert.ok(importsClock(s), 'js/news-timeline.js imports the clock (module-graph)');
  assert.match(s, /const f=zFields\(base\); f\.h=Math\.floor\(mins\/60\); f\.m=mins%60;\r?\n\s+IntMapTime\.set\(zInstant\(f\)/,
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
/* spelling kept: browser script (js/satellites-live.js, js/wx-ecmwf.js, js/app-body.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R289 ⑨ the satellites move with the clock, and the forecast axis still declines what it cannot show', () => {
  const sat = read('js/satellites-live.js');
  assert.ok(importsClock(sat), 'js/satellites-live.js imports the clock (module-graph)');
  assert.match(sat, /function clockNow\(\)\{ try\{ const T=IntMapTime; if\(T&&T\.when\) return T\.when\(\); \}catch\(_\)\{\} return new Date\(\); \}/,
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
}
