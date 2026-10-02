/* ============================================================================
 *  shell-test-infra-checks — the test bill itself — tiers, budgets, seeds, fixtures, how checks read files
 * ----------------------------------------------------------------------------
 *  One subject, gathered from the round-numbered files that each held a piece of it:
 *  tests/r206-checks.test.mjs
 *  tests/r203-checks.test.mjs
 *  tests/r207-checks.test.mjs
 *  tests/r210-checks.test.mjs
 *  tests/r225-checks.test.mjs
 *  tests/r700-stale-fixture-checks.test.mjs
 *  tests/r283-checks.test.mjs
 *  tests/r196-checks.test.mjs
 *  Every test keeps its original title (led by the round that wrote it), and every round's own
 *  account of WHY its checks exist is kept above them. Each round's checks sit in their own block
 *  so the helpers it wrote for itself stay its own; the file root and the plain text reader are
 *  shared below.
 * ==========================================================================*/
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { dirname, join, relative, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import * as LM from '../js/layer-manifest.js';
import { lf, readLF, sameText } from '../scripts/eol.mjs';
import { allSpecs, CORE_ALWAYS, coreNames, fixedCoreNames, isDeep, tierSpecs } from '../scripts/tiers.mjs';
import { publishedList } from './helpers/layer-groups.mjs';
import { codeOnly } from '../scripts/code-only.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ═══════════════════════ #R206 · from r206-checks.test.mjs ═══════════════════════ */
/* ============================================================================
 *  R206 — source-level invariants  (#R206)
 * ----------------------------------------------------------------------------
 *  ⚠ THESE ASSERT INVARIANTS, NOT SHAPES. #R205 lost five pins in one round, and this round lost a
 *  sixth (tests/r196-checks ⑤ pinned `picking=false; epi=[…]` byte for byte and went red when the
 *  same behaviour was routed through a setter). So every assertion below names a PROPERTY that has to
 *  stay true — "the warmer asks for the level the renderer asks for", "the syntax check is not one
 *  process per file" — rather than the spelling that happens to make it true today.
 * ==========================================================================*/
{
const rd = read;

/* ── ④ 「毎回毎回、テストに時間がかかりすぎ」 ─────────────────────────────────────
   MEASURED on the shipped script: 25.4 s, of which 22.9 s (90.1 %) was `spawnSync` — 501 sequential
   `node --check` launches. Same check, not one at a time; and never into another session's worktree
   (standing rule 8), which was 310 of the 708 files it walked. */
test('R206 ④ the static gate does not launch one process per file, and stays inside this checkout', () => {
  const s = rd('scripts/static-checks.mjs');
  assert.ok(!/spawnSync\(process\.execPath, \['--check'/.test(s),
    'the per-file syntax check must not be a synchronous spawn in a loop');
  assert.match(s, /execFile\(process\.execPath, \['--check', f\.abs\]/, 'it still really runs `node --check`');
  assert.match(s, /Promise\.all\(Array\.from\(\{ length: LANES \}, lane\)\)/, 'and runs them concurrently');
  assert.match(s, /const isOtherWorktree = \(abs\) => abs !== ROOT && existsSync\(join\(abs, '\.git'\)\)/,
    'a directory with its own .git is a different checkout');
  assert.match(s, /if \(s\.isDirectory\(\)\) \{ if \(!isOtherWorktree\(abs\)\) walk\(abs, out\); \}/,
    'and the walk does not enter it');
});

/* ── ⑤ the gate got cheaper and nothing was deleted to do it ─────────────────── */
/* spelling kept: the claim is about the text of scripts/test-budget.mjs itself. */
test('R206 ⑤ the test ceilings only went down, and every spec still exists', () => {
  const b = rd('scripts/test-budget.mjs');
  const core = +/const BUDGET_S = (\d+);/.exec(b)[1];
  const total = +/const TOTAL_BUDGET_S = (\d+);/.exec(b)[1];
  assert.ok(core <= 96, `the core ceiling may only go down (#R205 left it at 96, now ${core})`);
  assert.ok(total <= 5250, `the total ceiling may only go down (#R205 left it at 5250, now ${total})`);
  const specs = fs.readdirSync(path.join(ROOT, 'tests')).filter((f) => f.endsWith('.spec.js'));
  assert.ok(specs.length >= 60, `no spec file was deleted to make the suite cheaper (${specs.length} present)`);
  assert.ok(specs.includes('r206.spec.js'), 'this round has its own browser regression');
});
}

/* ═══════════════════════ #R203 · from r203-checks.test.mjs ═══════════════════════ */
/* (#R203 — the round's own account of why these checks exist heads its other half, in tests/shell-launch-defaults-checks.test.mjs) */
{
const rd = read;

/* ── ② THE TIERS ───────────────────────────────────────────────────────────────────────────── */
test('R203 ② every spec belongs to exactly one tier, and the core list names real files', () => {
  const all = allSpecs();
  assert.ok(all.length > 40, 'the suite still has its specs');
  /* the FIXED gate and the nightly partition the suite; a change's own specs are ADDED to the gate
     for its PR (below) without being taken away from the nightly */
  const core = tierSpecs('core', { fixed: true }), deep = tierSpecs('deep');
  assert.equal(core.length + deep.length, all.length, 'core ∪ deep = every spec');
  assert.equal(core.filter((f) => deep.includes(f)).length, 0, 'and the two do not overlap');
  for (const n of fixedCoreNames()) {
    assert.ok(fs.existsSync(path.join(ROOT, 'tests', n + '.spec.js')), `core names ${n}, which does not exist`);
  }
  /* ⚠ (#R204) THE GATE'S CONTENTS ARE PINNED AS A RELATION, NOT AS FILE NAMES. This test used to
     name `tests/r203.spec.js`, which is exactly the mistake #R203's own notes were written about:
     the round after pushes that file out of the gate on price, and the test asserting the OLD
     round's membership goes red for doing the right thing. What a gate must contain is the four
     always-on suites and WHICHEVER spec the change in front of it touched — both derived by
     scripts/tiers.mjs (the second from the diff since the round numbers went away; the old
     «highest-numbered rNNN» had matched nothing newer than r668). */
  for (const must of CORE_ALWAYS.map((n) => 'tests/' + n + '.spec.js')) {
    assert.ok(core.includes(must), `${must} must be in the tier that runs every time`);
    assert.ok(!isDeep(must), `${must} must not be deep`);
  }
  const touched = deep[0];
  assert.ok(touched, 'the suite has a deep spec to stand in for a touched one');
  const withDiff = coreNames({ IM_CHANGED_SPECS: touched });
  assert.ok(withDiff.includes(path.basename(touched, '.spec.js')), `${touched}, touched by the change, is not in front of its PR`);
});

test('R203 ②b the core tier is under a tenth of what the whole suite used to cost', () => {
  const dur = JSON.parse(rd('tests/durations.json'));
  const times = Object.entries(dur).filter(([, v]) => typeof v === 'number');
  const sorted = times.map(([, v]) => v).sort((a, b) => a - b);
  const p75 = sorted[Math.floor(sorted.length * 0.75)];
  const cost = (f) => (typeof dur[f] === 'number' ? dur[f] : p75);
  const core = tierSpecs('core', { fixed: true }).reduce((a, f) => a + cost(f), 0);
  const whole = allSpecs().reduce((a, f) => a + cost(f), 0);
  /* 「今の時間の1/10以下の時間で全テスト工程を終わらせろ」 — measured whole was 5,123 s */
  assert.ok(core <= whole / 10, `the core tier is ${core}s against a whole suite of ${whole}s`);
  /* …and the ceiling in scripts/test-budget.mjs must be the thing that keeps it there */
  const budget = rd('scripts/test-budget.mjs');
  const m = /const BUDGET_S = (\d+);/.exec(budget);
  assert.ok(m && Number(m[1]) <= 512, `the core ceiling is ${m && m[1]}s; a tenth of 5,123 s is 512 s`);
});
}

/* ═══════════════════════ #R207 · from r207-checks.test.mjs ═══════════════════════ */
/* (#R207 — the round's own account of why these checks exist heads its other half, in tests/shell-panels-tools-checks.test.mjs) */
{
/* ── ⑫ the test bill itself ────────────────────────────────────────────────────────────────────── */
/* spelling kept: workflow configuration (.github/workflows/ci.yml) — the claim is the text the runner reads. */
test('R207 ⑫ the deep tier no longer stands between a merge and the next one', () => {
  const y = read('.github/workflows/ci.yml');
  const deep = y.slice(y.indexOf('browser-deep:'));
  const cond = /if: \$\{\{ ([^}]*) \}\}/.exec(deep);
  assert.ok(cond, 'the deep job is conditional');
  assert.ok(/schedule/.test(cond[1]) && /workflow_dispatch/.test(cond[1]),
    'it runs nightly and on demand');
  assert.ok(!/push/.test(cond[1]), 'and not on a push');
  const cfg = read('playwright.config.js');
  assert.ok(/retries: isCI \? 1 : 0/.test(cfg), 'one retry clears a blip; the third attempt only ever cost time');
});
}

/* ═══════════════════════ #R210 · from r210-checks.test.mjs ═══════════════════════ */
/* (#R210 — the round's own account of why these checks exist heads its other half, in tests/shell-data-layers-checks.test.mjs) */
{
const rd = read;

/* spelling kept: browser script (js/map-ui.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R210 ⑥: the test seat opts out of the first-visit panel on purpose', () => {
  /* If this ever reverts, ~350 tests silently start measuring a narrower canvas — and they will
     not fail loudly, they will fail as a scatter of pixel and camera assertions (#R207's shape). */
  const seed = rd('tests/helpers/session-seed.js');
  assert.match(seed, /"lsrOpen":false/, 'the seeded session answers the layer-panel question');
  const ui = rd('js/map-ui.js');
  assert.match(ui, /typeof ui\.right!=='boolean'/, 'and the app is what distinguishes "no answer" from an answer');
  /* WARN (#R210 follow-up) …and the first-visit open must not race the boot: open() builds the
     whole tile grid synchronously the first time, so on an unanswered session it waits for idle.
     A RESTORED session still opens immediately (its grid was pre-built by the idle callback). */
  assert.match(ui, /if\(unanswered&&'requestIdleCallback' in window\) requestIdleCallback/,
    'a first visit opens the panel on idle, with a timeout so it always appears');
});
}

/* ═══════════════════════ #R225 · from r225-checks.test.mjs ═══════════════════════ */
/* (#R225 — the round's own account of why these checks exist heads its other half, in tests/shell-tiles-perf-checks.test.mjs) */
{
const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

/* ── ⑦ THE SEED IS IN ONE PLACE ────────────────────────────────────────────────────────────────────
   ⚠ #R225 changed what an ABSENT id means, and the suite's seed said `"layers":[]` — so «no thematic
   layer» silently became «switch every base toggle off» and tests/r211.spec.js ③ went red in CI. The
   seed now states what it always meant. It was ALSO inlined verbatim in two specs, which is how a
   value drifts (#R220): they import it. */
test('R225 ⑦ the seeded session lives in exactly one place, and it states the base toggles', () => {
  const seed = read('tests/helpers/session-seed.js');
  assert.match(seed, /export const SESSION_VALUE = '\{"v":2,"defv":191,"layers":\["cb-names","cb-geolabels","cb-poi","cb-borders","cb-admin1","cb-roads","cb-rail2"\],"lsrOpen":false\}';/);
  const files = readdirSync(new URL('tests/', root)).filter((f) => f.endsWith('.spec.js'));
  for (const f of files) {
    const src = read('tests/' + f);
    assert.ok(!/'\{"v":2,"defv":\d+,"layers"/.test(src),
      `tests/${f} inlines its own session seed — import SESSION_VALUE instead`);
  }
  /* the seed's base half must be exactly the base half of the app's own list */
  /* (layer-manifest) the markup half of window.IntMapDefaultOn — the manifest's \`on\` rows it writes itself */
  const appBase = LM.LAYERS.filter((l) => l.html && l.on).map((l) => l.id);
  assert.ok(appBase.length > 0 && appBase.every((id) => publishedList('IntMapDefaultOn').includes(id)), 'IntMapDefaultOn is declared');
  for (const id of appBase) assert.ok(seed.includes('"' + id + '"'), `the seed is missing ${id}`);
});
}

/* ═══════════════════════ #R700 · from r700-stale-fixture-checks.test.mjs ═══════════════════════ */
/* ============================================================================
 *  IntMap · #R700 — 時限式の fixture: 5 本の spec が同じ日に同じ形で落ちた
 * ----------------------------------------------------------------------------
 *  nightly の deep tier が 1 日で 5 本（#R402/#R405/#R416/#R435/#R455）を落とした。5 件の
 *  事故ではない。5 本とも route で差し替えたニュースの行に **`2026-08-24` という絶対時刻**を
 *  書いており、js/app-body.js の `computeFilteredNews()` は `NEWS_MAX_AGE_MS`（72 時間）より
 *  古い項目を一覧から落とす——つまり **fixture は書かれた日から 3 日で期限切れになる**。
 *  実測は「読み込みは成功していて、落としているのは鮮度フィルタ」だった
 *  （`IntMapNewsEvents.state()` が `loadedEventCount:1 / visibleEventCount:0`）。
 *
 *  ⚠⚠⚠ **日付を新しい日付へ書き換えるのは、同じ時限装置を巻き直すだけである。** 直したのは
 *  時刻の作り方——`AGO(mins) = new Date(Date.now() - mins*60e3)`——で、5 本とも並びは元のまま。
 *
 *  ここはその**構造**を見る。2 つのことをする。
 *
 *   ② 門: **ニュースの経路を route で差し替え、その結果として画面に出る一覧（`.news-item`）を
 *      測っている spec は、時刻を実行時の時計から作る。** ⚠ 母集合は走査して発見する（手で
 *      並べた一覧は次に足された spec を黙って落とす）。⚠ **一覧に出ない絶対日付を門にしない**
 *      ——歴史の年・上流の版・固定した時計とセットの時刻は正当であり（実測 409 件のうち大半が
 *      それ）、「見つけたものを 1 件ずつ許す表」を書かない代わりに、**鮮度で切られる経路に
 *      渡っているか**——ニュースの route stub があり、かつ切られた後の一覧を見ているか——を
 *      条件にしている。
 *   ③ 観測: 門にできないものは**印字する**。「いつ走らせるかで意味が変わる絶対時刻」を
 *      持つ test ファイルを全部数え、そのうち**製品自身の鮮度窓**（`js/app-body.js` から読む。
 *      72 という数はここに書かない）より古くなっているものを名指しで出す。⚠ これは門ではない
 *      ——その日付が切られる経路に渡っているかは静的には決められないので、決められないことを
 *      決めたふりをするより、次に読む人に見せる（#R242: 誰も 1 ラウンドで到達できない門は、
 *      次のラウンドで消される）。
 * ==========================================================================*/
{
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const read = (p) => readFileSync(p, 'utf8');

/* ── the test corpus, WALKED rather than listed ───────────────────────────────────────────── */
function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p, out); }
    else if (/\.spec\.js$/.test(e.name) || /\.test\.mjs$/.test(e.name)) out.push(p);
  }
  return out;
}

/* ⚠ COMMENTS ARE NOT FIXTURES. Every one of these files explains itself at length, and the
   explanations quote the very dates they are about — including this file. A scanner that reads
   the prose measures the prose. Strings are KEPT: a fixture date is a string. */
function codeOf(src) { return codeOnly(src, { offsets: true }); }

const ISO_DT = /(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/g;
      /* a moment, not a year */
const lineOf = (code, idx) => code.slice(0, idx).split('\n').length;

const FILES = walk(resolve(ROOT, 'tests')).map((p) => {
  const src = read(p), code = codeOf(src);
  const dates = [...code.matchAll(ISO_DT)].map((m) => ({ s: m[0], line: lineOf(code, m.index) }));
  return { path: p, rel: relative(ROOT, p).replace(/\\/g, '/'), src, code, dates };
});

/* ── ① THE ANCHOR THIS GATE HANGS ON HAS TO BE ALIVE ───────────────────────────────────────
   ② below decides which specs it judges by asking whether they look at `.news-item` — the row
   the live feed renders. #R488's lesson is that a check pinned to a SPELLING goes on passing
   after the spelling dies, and a dead selector here would silently empty ②'s population and
   turn it green for ever. So the class is asked of the product first. */
const FEED_ITEM_CLASS = 'news-item';
/* spelling kept: the source text is the subject (what a file carries, or that a copy is absent). */
test('#R700 ① the feed row this gate is defined against is a thing the product still renders', () => {
  const shipped = ['js', 'css'].flatMap((d) => walk2(resolve(ROOT, d)))
    .filter((p) => read(p).includes(FEED_ITEM_CLASS));
  assert.ok(shipped.length > 0,
    `nothing under js/ or css/ mentions "${FEED_ITEM_CLASS}" any more — ② is judging nobody`);
});
function walk2(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk2(p, out); else if (/\.(js|css)$/.test(e.name)) out.push(p);
  }
  return out;
}

/* ── ② THE GATE: a fixture the freshness cut will judge states its age RELATIVE TO THE RUN ──
   母集合の条件は 2 つとも**測っている**:
     · ニュースの経路を route で差し替えている（`.route(… news_ …)`。`news_events` /
       `news_sources` / `news_event_i18n` は製品自身の表の名前）
     · 切られた**あと**の一覧を見ている（`.news-item` を測っている）
   この 2 つが揃った spec だけが、`NEWS_MAX_AGE_MS` の判断を自分の結果に取り込む。 */
const STUBS_NEWS = (f) => /\.route\(\s*\/[^\n]*news_/.test(f.code) || /\.route\([^\n]*news_/.test(f.code);
const READS_FEED = (f) => f.code.includes(FEED_ITEM_CLASS);
const JUDGED = FILES.filter((f) => STUBS_NEWS(f) && READS_FEED(f));

/* spelling kept: the source text is the subject (what a file carries, or that a copy is absent). */
test('#R700 ② a stubbed news fixture is dated from the run’s own clock, not from a calendar', () => {
  /* ⚠ 空の母集合は緑ではない（#R429）。走査が壊れたら、この門は何も見ずに通る。 */
  assert.ok(FILES.length > 50, `the test corpus did not walk (saw ${FILES.length} files)`);
  assert.ok(JUDGED.length > 0, 'no spec was found that stubs the news feed and reads the rendered list');

  const bad = [];
  for (const f of JUDGED) {
    if (f.dates.length) bad.push(`${f.rel}: ${f.dates.slice(0, 3).map((d) => d.line + ':' + d.s).join(', ')}`
      + (f.dates.length > 3 ? ` (+${f.dates.length - 3} more)` : ''));
    else if (!/Date\.now\s*\(/.test(f.code))
      bad.push(`${f.rel}: no absolute dates, but nothing derives the fixture's age from the clock either`);
  }
  assert.deepEqual(bad, [],
    'these specs stub the news feed AND measure the list the freshness cut filters, so an absolute\n'
    + 'date in them expires on its own (js/app-body.js computeFilteredNews → NEWS_MAX_AGE_MS).\n'
    + 'Build the timestamps from the clock instead — e.g.\n'
    + "    const AGO = (mins) => new Date(Date.now() - mins * 60e3).toISOString();\n"
    + 'and replace each literal with AGO(<minutes ago>), keeping the original ordering:\n  '
    + bad.join('\n  '));
});

/* ── ③ THE OBSERVATION: everything else that depends on when you run it ─────────────────────
   ⚠ NOT A GATE. Whether one of these dates reaches a path that is cut by the wall clock cannot
   be decided by reading the file — #R386 carries the same 18-day-old news fixture and passes,
   because nothing it asserts on is decided by the cut. Printing is what an undecidable question
   is worth; deciding it by guess would be the 「1 件ずつ許す表」 this round exists to avoid. */
/* spelling kept: browser script (js/app-body.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('#R700 ③ 観測: which test fixtures are already older than the product’s own news window', () => {
  /* the window is READ from the product, never copied — the number is js/app-body.js's to change */
  const m = /const\s+NEWS_MAX_AGE_MS\s*=\s*([^;]+);/.exec(read(resolve(ROOT, 'js/app-body.js')));
  assert.ok(m, 'js/app-body.js no longer states NEWS_MAX_AGE_MS — the freshness cut moved');
  const windowMs = Function('return (' + m[1] + ')')();
  assert.ok(windowMs > 0, 'the freshness window read from the product is not a positive duration');

  const now = Date.now(), cut = now - windowMs;
  const rows = [];
  for (const f of FILES) {
    if (!f.dates.length) continue;
    const stale = f.dates.filter((d) => { const t = Date.parse(d.s + ':00Z'); return t < cut && t > now - 315576e6; });
    if (stale.length) rows.push({ rel: f.rel, stale: stale.length, all: f.dates.length,
      stubs: STUBS_NEWS(f), feed: READS_FEED(f), first: stale[0].line + ':' + stale[0].s });
  }
  rows.sort((a, b) => b.stale - a.stale);
  console.log(`\n  [#R700 observation] the product's news window is ${Math.round(windowMs / 3600e3)} h.`);
  console.log(`  ${rows.length} test files carry a date-time already outside it `
    + `(of ${FILES.filter((f) => f.dates.length).length} with any absolute moment, in ${FILES.length} files):`);
  for (const r of rows) console.log(`    ${r.stale}/${r.all}  ${r.rel}  ${r.first}`
    + (r.stubs ? '  [stubs the news feed]' : '') + (r.feed ? '  [reads the rendered list]' : ''));
  console.log('  ⚠ most of these are legitimate — a pinned clock, a historical instant, an upstream'
    + '\n    version. The ones marked [stubs the news feed] are the shape #R700 repaired.\n');
});
}

/* ═══════════════════════ #R283 · from r283-checks.test.mjs ═══════════════════════ */
/* ============================================================================
 *  IntMap · #R283 source checks — a check is about content, not about bytes
 * ----------------------------------------------------------------------------
 *  「two node check files fail locally on Windows purely because of line endings,
 *    while CI is green. This has been re-diagnosed by hand in many rounds, which
 *    wastes time and trains people to ignore red.」
 *
 *  Two source-level checks were written against the bytes the checkout produced:
 *  tests/r261-checks ③ required a line break with nothing in front of it, and
 *  scripts/i18n-langs.mjs --check compared a generated file with the rendered text
 *  character for character. `core.autocrlf` is true here, so both were red on every
 *  local run and green in CI — and #R274, #R279 and #R282 each measured that by hand
 *  and wrote it down again. See scripts/eol.mjs for the finding and the fix.
 *
 *  ⚠ THE INTERESTING HALF OF THIS FILE IS THE ONE THAT GOES RED IN CI TOO. Fixing
 *  the two files makes Windows green, but Windows is the only place the defect was
 *  ever visible, so nothing would stop it coming back the next time somebody writes
 *  a newline into a pattern. § ① and § ③ therefore SYNTHESISE the CRLF text rather
 *  than reading it off the disk, and assert both directions — the claim must fail on
 *  the raw bytes, hold on the content, and STILL FAIL when the line break it demands
 *  is genuinely absent. A normaliser that answered «the same» to everything would
 *  pass § ① and § ③'s first halves and fail their last, which is the point.
 *
 *  ⚠ COMMENTS ARE STRIPPED BEFORE EVERY SEARCH OF ANOTHER FILE. The notes those
 *  files now carry quote the very expressions § ② and § ③ require to be gone
 *  (「自分の検査が自分のコメントに当たる」 — fifteen rounds have paid for this one).
 * ==========================================================================*/
{
/* ⚠ DELIBERATELY NOT NORMALISED: this file is the one that has to be able to tell the two apart. */
const raw = read;

/* ── ① the defect, the fix, and the line that is still required ─────────────────────────────────
   A miniature of tests/r261-checks ③, built here rather than read from js/terrain-water.js so that
   it says the same thing on Linux. Pinning ③'s own pattern would freeze somebody else's assertion,
   which is the failure this project has now made fourteen rounds in a row; what is asserted is the
   PROPERTY the pattern depends on. */
test('R283 ①: CRLF bytes defeat a newline-anchored pattern, and the content does not', () => {
  const pattern = /sc=>\{\n\s*const left=owed\(sc\);/;
  const crlf = 'sources.forEach(sc=>{\r\n      const left=owed(sc);';

  assert.ok(!pattern.test(crlf),
    'THE DEFECT: a carriage return sits where the pattern demands a line break');
  assert.ok(pattern.test(lf(crlf)),
    'THE FIX: the same claim, asked of the content instead of the checkout, holds');
  assert.ok(pattern.test('sources.forEach(sc=>{\n      const left=owed(sc);'),
    '…and it was always true of an LF checkout, which is why CI never saw this');

  /* ⚠ AND IT IS NOT WEAKER. Normalising drops a carriage return; it does not drop the line break. */
  assert.ok(!pattern.test(lf('sources.forEach(sc=>{ const left=owed(sc);')),
    'a pattern that demands a line break must still refuse a single line');
  assert.equal(lf('a\r\nb'), 'a\nb');
  assert.equal(lf('a\nb'), 'a\nb', 'an LF text is returned unchanged');
  assert.equal(lf('ab'), 'ab', 'and nothing is inserted');
});

/* ── ② the source-level checks that were red on Windows read content ──────────────────────────
 *  ⚠ THIS IS A LIST, AND A LIST IS ONLY AS GOOD AS ITS LAST ENTRY. #R313 ⑤ lifted bboxOfFC out
 *  of js/layer-home.js with `/function bboxOfFC[\s\S]*?\n  \}\n/`
 *  — a pattern that demands a BARE line break after the brace — and read the file with a bare
 *  readFileSync — the same defect this round diagnosed, written fresh thirty rounds later, red
 *  on every Windows run and green in CI from the day it was committed. Adding a file here is
 *  what stops it being un-fixed again; it is NOT what finds the next one. */
/* spelling kept: the claim is about the text of the test files that carry #R261, #R232 and #R313 themselves. */
test('R283 ②: the source-level checks that broke read their files as content', () => {
  /* FOUND BY WHAT THEY CONTAIN, NOT BY NAME: #R261's, #R232's and #R313's checks left their
     tests/r<N>-checks.test.mjs files when the suite was regrouped by topic (2026-09-29); every test
     file that now declares one of their tests is held to the same reader. */
  const carrying = (round) => readdirSync(join(ROOT, 'tests')).filter((f) => f.endsWith('.test.mjs'))
    .filter((f) => new RegExp("\\btest\\(\\s*['`]#?" + round + '\\b').test(raw('tests/' + f)))
    .map((f) => 'tests/' + f);
  const files = [];
  for (const round of ['R261', 'R232', 'R313']) {
    const got = carrying(round);
    assert.ok(got.length >= 1, `no test file carries a ${round} test any more — this check is reading nothing`);
    files.push(...got);
  }
  for (const f of new Set(files)) {
    const src = codeOnly(raw(f));
    assert.match(src, /import \{ readLF \} from '\.\.\/scripts\/eol\.mjs';/,
      f + ': the reader comes from the one place that knows about line endings');
    assert.match(src, /const read = \(p\) => readLF\(/,
      f + ": the file's only reader goes through it");
    assert.doesNotMatch(src, /readFileSync\([^)]*utf8/,
      f + ': an assertion is reading raw bytes again — if the BYTES are genuinely the subject, read '
      + 'them under a name that says so rather than through `read`');
  }
});

/* ── ③ the generated language list is compared by content, and staleness still fails ────────────
   scripts/i18n-langs.mjs is the other half of the report: tests/r232-checks ① runs its `--check`
   for real (on this machine against a CRLF checkout, in CI against an LF one), and what is added
   here is the direction that run cannot show — that the comparison still says NO. */
test('R283 ③: the _langs.js staleness gate compares content, and a different list still fails', () => {
  const src = codeOnly(raw('scripts/i18n-langs.mjs'));
  assert.match(src, /import \{ sameText \} from '\.\/eol\.mjs';/, 'it uses the shared comparison');
  assert.match(src, /if \(!sameText\(current, text\)\)/, 'the --check branch asks about the content');
  assert.doesNotMatch(src, /current !== text/, 'the byte comparison is gone from both branches');

  const current = raw('js/locales/_langs.js');
  const asCrlf = lf(current).split('\n').join('\r\n');
  assert.ok(sameText(current, asCrlf), 'a CRLF checkout of the current file is not stale');
  assert.ok(sameText(current, lf(current)), '…and neither is an LF one');

  const NEEDLE = 'window.IntMapLangCodes';
  assert.ok(current.includes(NEEDLE), 'the generated file still declares the code list');
  assert.ok(!sameText(current, current.replace(NEEDLE, NEEDLE + 'Stale')),
    'but a file that says something DIFFERENT is still stale — the gate was not softened');
});

/* ── ④ the reader is exercised through the filesystem, not only as a string helper ────────────── */
/* spelling kept: the source text is the subject (what a file carries, or that a copy is absent). */
test('R283 ④: readLF hands back the content of a file written with CRLF', () => {
  const dir = mkdtempSync(join(tmpdir(), 'im-eol-'));
  try {
    const p = join(dir, 'sample.js');
    writeFileSync(p, 'a=1;\r\nb=2;\r\n');
    assert.notEqual(readFileSync(p, 'utf8'), 'a=1;\nb=2;\n', 'the file on disk really is CRLF');
    assert.equal(readLF(p), 'a=1;\nb=2;\n', '…and readLF answers with the content');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
}

/* ═══════════════════════ #R196 · from r196-checks.test.mjs ═══════════════════════ */
/* (#R196 — the round's own account of why these checks exist heads its other half, in tests/shell-panels-tools-checks.test.mjs) */
{
const rd = read;

/* ── ⑦ THE LOCAL RUN IS PLANNED ────────────────────────────────────────────────────────────── */
test('R196 ⑦ npm test runs the browser suite through the measured plan', () => {
  const pkg = JSON.parse(rd('package.json'));
  /* ⚠ (#R205) THE PIN WAS "`npm test` ENDS WITH run-tests.mjs", WHICH IS A SHAPE, NOT THE PROPERTY.
     `npm test` now delegates to scripts/test-parallel.mjs so the source half and the browser half run
     at the same time. What #R196 established is that the BROWSER HALF GOES THROUGH THE PLANNER rather
     than being handed the whole directory in readdir order — so that is what is asserted, wherever
     `npm test` happens to reach it from. */
  const entry = pkg.scripts.test;
  const reachesRunner = /run-tests\.mjs/.test(entry)
    || (/test-parallel\.mjs/.test(entry) && /run-tests\.mjs/.test(rd('scripts/test-parallel.mjs')));
  assert.ok(reachesRunner, 'the browser half goes through the runner');
  const r = rd('scripts/run-tests.mjs');
  assert.match(r, /poolFiles\('rest'\)/);
  assert.match(r, /run\(solo, 1,/, 'the solo pool gets one worker, as CI gives it one machine');
  assert.match(r, /running the whole directory instead/, 'it degrades to the old behaviour rather than to a subset');
});
}
