/* ============================================================================
 *  IntMap · every Edge Function module evaluates, and every one is declared with its own verify_jwt
 * ----------------------------------------------------------------------------
 *  #R505: a temporal dead zone made one function answer 500 WORKER_ERROR to every request while
 *  every source-reading check was green — so the real module graph is imported (Node runs .ts), one
 *  child process per function. #R801: a [functions.*] block without verify_jwt takes the CLI
 *  default and puts a login in front of a public layer — so every block is enumerated.
 *
 *  Each block below was one round-numbered file until the tests were regrouped by subject. A block
 *  keeps that file's helpers private to it (a `{ … }` scope), so two rounds' `docFacts()` or
 *  `scenario()` cannot shadow each other; the helpers every block shared — ROOT, rd/read and the
 *  line-ending-tolerant anchor — are declared once above. Titles keep their round tag so a failure
 *  still names the round whose record explains it.
 *
 *  Was: tests/r505, r801 ①
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { load as loadYaml } from 'js-yaml';
import { entryText } from '../scripts/dev-notes.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
const read = rd;

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  #R505 — was tests/r505-checks.test.mjs
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
/* ============================================================================
 *  #R505 — 出荷した Edge Function が、本番で一度も動かなかった回
 * ----------------------------------------------------------------------------
 *  #R504 は `const SWEEP_TILES_MAX = READ_BURST;` を `WORLD_SLICE_TILES` の隣に置いた。
 *  `READ_BURST` はその **45 行下** で宣言されている。**temporal dead zone** である:
 *  この module を評価した瞬間に ReferenceError が投げられ、`Deno.serve` には一度も到達しない。
 *
 *      本番実測（deploy 直後）: GET ?meta=1 → **HTTP 500 `WORKER_ERROR`**、どの channel も同じ。
 *      「Cannot access 'READ_BURST' before initialization」
 *
 *  ⚠⚠⚠ **何一つ捕まえなかった。**
 *
 *    · `npm run check:static` は**構文**を読む。この順序は構文的に正しい。
 *    · `npm test` の 3,136 本は全部緑。CI も全緑（pass 7 / skip 3）。
 *    · #R504 自身の 13 本は、この定数を**文字列として**読んでいた——`READ_BURST` を参照している
 *      ことは確かめ、それが**その時点で存在するか**は一度も訊いていない。
 *
 *  ⚠ **これは「テストが足りなかった」ではなく、「テストの種類が1つも無かった」である。**
 *  この repo の Edge Function 検査は全部**ソースを読む**検査で、**本体を評価する**検査がゼロだった。
 *  だから穴は `aviation-feed` のものではなく、**13 本すべて**に空いている。
 *
 *  ⚠⚠ そして「本物を走らせる」以外の方法では、この穴は塞がらない。最初に書いた版は
 *  `import` 行を落として本体を `vm` に流す形だったが、5 本は複数行 import で切り損ね、
 *  3 本は **TypeScript の型注釈**で構文エラーになり、1 本は import された名前をトップレベルで
 *  使っていた——**どれも「この検査の粗さ」であって「その関数の欠陥」ではない**のに、赤は同じ顔をする。
 *  ⇒ Node 24 は `.ts` を素で `import()` できるので、**実際の module graph をそのまま評価する**。
 *  `_shared/` も本物が読まれ、型注釈も剥がれ、import の書き方も関係なくなる。
 *
 *    ① 13 本の Edge Function の module 本体が、**実際に評価できる**。
 *    ② そのうえで `SWEEP_TILES_MAX` は `READ_BURST` の**後**にある（場所の二本目の錨）。
 *    ③ この回が記録に載っている。
 * ==========================================================================*/

const FNDIR = join(ROOT, 'supabase/functions');

/* the functions, DISCOVERED rather than listed — a fourteenth one must not be able to arrive
   without this gate noticing (the #R465 shape). */
function edgeFunctions() {
  return readdirSync(FNDIR)
    .filter((d) => d !== '_shared' && statSync(join(FNDIR, d)).isDirectory())
    .filter((d) => { try { return statSync(join(FNDIR, d, 'index.ts')).isFile(); } catch (_) { return false; } })
    .sort();
}

/* ⚠ A CHILD PROCESS PER FUNCTION, ON PURPOSE. These modules install things on globalThis and call
   Deno.serve at the end; evaluating thirteen of them inside this test process would let one
   function's top level decide another's. The child gets the smallest Deno surface that lets a
   module REACH its end — env.get answering "" is what every function's own env() helper expects
   when a secret is unset, and serve() is a no-op so nothing listens.
   ⚠ Nothing else is stubbed. A missing platform global IS the fault this gate exists to find. */
function evaluateModuleBody(dir) {
  const url = pathToFileURL(join(FNDIR, dir, 'index.ts')).href;
  const src =
    'globalThis.Deno = { env: { get: () => "" }, serve: () => {} };\n' +
    'await import(' + JSON.stringify(url) + ');\n';
  execFileSync(process.execPath, ['--no-warnings', '--input-type=module', '-e', src],
    { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000 });
}

test('R505 ① every Edge Function module body actually evaluates', () => {
  const fns = edgeFunctions();
  assert.ok(fns.length >= 13, `expected the tree's Edge Functions; found ${fns.length}`);
  const broken = [];
  for (const name of fns) {
    try { evaluateModuleBody(name); }
    catch (e) {
      const out = String((e && e.stderr) || (e && e.message) || e);
      /* the first line that looks like the actual error, so the message is one line and not a
         sixty-line Node stack */
      const line = (out.split('\n').find((l) => /Error|error:/.test(l)) || out.split('\n')[0] || '').trim();
      broken.push(name + ' — ' + line.slice(0, 160));
    }
  }
  assert.deepEqual(broken, [],
    'these Edge Function module bodies throw before Deno.serve is reached, so EVERY request to them ' +
    'would answer 500 WORKER_ERROR:\n  ' + broken.join('\n  '));
});

/* ── ② …and the specific ordering #R504 got wrong ────────────────────────────────────────── */
test('R505 ② SWEEP_TILES_MAX is declared after the constant it reads', () => {
  const src = rd('supabase/functions/aviation-feed/index.ts');
  const at = (re) => { const m = re.exec(src); assert.ok(m, 'missing declaration: ' + re); return m.index; };
  const burst = at(/^const READ_BURST = /m);
  const cap = at(/^const SWEEP_TILES_MAX = /m);
  assert.ok(cap > burst,
    'const SWEEP_TILES_MAX = READ_BURST reads a `const` declared below it — a temporal dead zone, ' +
    'which is a ReferenceError at module evaluation and a 500 on every request (#R505)');
});

/* ── ③ 記録 ─────────────────────────────────────────────────────────────────────────────────
   ⚠ この回で本当に守られるのは ① であって ② ではない。② は「同じ場所をもう一度見る」錨で、
   ① が何かの理由で走らなくなったときに残る二本目にすぎない——**一度も落ちない検査は何も守らない**
   （#R317 の裏返し）ので、① が本物を走らせていることが要点である。 */
test('R505 ③ the round is written down where the next reader will look', () => {
  /* (2026-09-25) one file per entry now (scripts/dev-notes.mjs) */
  const dn = entryText(505) || '';
  assert.match(dn, /^## R505/m, 'the record has this round');
  assert.match(dn, /WORKER_ERROR/, '…and names what production actually answered');
  assert.match(rd('docs/AVIATION-ARCHITECTURE.md'), /R505/, 'and the aviation document carries it too');
  assert.match(rd('docs/TESTING.md'), /R505/, 'and TESTING.md says this kind of check now exists');
});
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  #R801 — was tests/r801-edge-config-checks.test.mjs ① (history: see process-database-checks)
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
/* config.toml を [functions.<name>] ごとに切る。註（`#` 行）は落とす——「書いてある」ではなく
   「してある」を見る。次の `[` 見出しまでがそのブロック。 */
function functionBlocks(toml) {
  const out = new Map();
  let cur = null;
  for (const raw of toml.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const head = /^\[(.+)\]$/.exec(line);
    if (head) {
      const fn = /^functions\.([A-Za-z0-9_-]+)$/.exec(head[1]);
      cur = fn ? fn[1] : null;
      if (cur) out.set(cur, []);
      continue;
    }
    if (cur) out.get(cur).push(line);
  }
  return out;
}

/* ── ① 全ブロックが verify_jwt を持つ ───────────────────────────────────────── */
test('R801 ① every [functions.*] block in supabase/config.toml states its own verify_jwt', () => {
  const blocks = functionBlocks(rd('supabase/config.toml'));
  assert.ok(blocks.size >= 2, 'the config declares Edge Functions');
  const missing = [];
  for (const [name, lines] of blocks) {
    const keys = lines.filter((l) => /^verify_jwt\s*=\s*(true|false)$/.test(l));
    if (keys.length !== 1) missing.push(name + (keys.length ? ` (${keys.length} keys)` : ''));
  }
  assert.deepEqual(missing, [],
    'a block without verify_jwt takes the CLI default (true) and puts a login in front of whatever it serves (#R351)');

  /* 関数ディレクトリの一覧は発見する。index.ts を持つものが関数で、_shared はライブラリ。 */
  const dirs = readdirSync(join(ROOT, 'supabase/functions'), { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(ROOT, 'supabase/functions', d.name, 'index.ts')))
    .map((d) => d.name).sort();
  const declared = [...blocks.keys()].sort();
  assert.deepEqual(declared, dirs,
    'every function directory has a [functions.*] block and every block has a directory (#R333)');
});
}
