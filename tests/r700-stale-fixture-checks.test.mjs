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
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
function codeOf(src) {
  let out = '', i = 0, mode = null, q = null;
  while (i < src.length) {
    const c = src[i], d = src[i + 1];
    if (mode === 'line') { if (c === '\n') { mode = null; out += c; } else out += ' '; i++; continue; }
    if (mode === 'block') { if (c === '*' && d === '/') { mode = null; out += '  '; i += 2; continue; }
      out += (c === '\n' ? '\n' : ' '); i++; continue; }
    if (q) { out += c; if (c === '\\') { out += src[i + 1] || ''; i += 2; continue; } if (c === q) q = null; i++; continue; }
    if (c === '/' && d === '/') { mode = 'line'; out += '  '; i += 2; continue; }
    if (c === '/' && d === '*') { mode = 'block'; out += '  '; i += 2; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; out += c; i++; continue; }
    out += c; i++;
  }
  return out;
}

const ISO_DT = /(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/g;      /* a moment, not a year */
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
test('① the feed row this gate is defined against is a thing the product still renders', () => {
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

test('② a stubbed news fixture is dated from the run’s own clock, not from a calendar', () => {
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
test('③ 観測: which test fixtures are already older than the product’s own news window', () => {
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
