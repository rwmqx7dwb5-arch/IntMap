/* 監査（2026-11-19）で見つかった構造上の穴を、回帰として固定する。
   ① 到達可能性は「誰かが import している」ではなく、入口からの探索であること
   ② GIS の gis-core と gis-runtime は互いを import しないこと */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { jsReachability } from '../scripts/js-reachability.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function fixture(files) {
  const dir = mkdtempSync(join(tmpdir(), 'intmap-reach-'));
  mkdirSync(join(dir, 'js')); mkdirSync(join(dir, 'src'));
  for (const [p, t] of Object.entries(files)) writeFileSync(join(dir, p), t);
  return dir;
}

test('① 互いを import するだけの 2 つのモジュールは、入口から届かなければ生きていない', () => {
  const dir = fixture({
    'src/main.js': "import '../js/live.js';\n",
    'js/live.js': "import { z } from './lazy.js';\nexport const live = z;\n",
    'js/lazy.js': "export const z = 1;\n",
    'js/ghost-a.js': "import { b } from './ghost-b.js';\nexport const a = b;\n",
    'js/ghost-b.js': "import { a } from './ghost-a.js';\nexport const b = a;\n",
  });
  try {
    const r = jsReachability(dir);
    assert.ok(r.isReachable('js/live.js'));
    assert.ok(r.isReachable('js/lazy.js'), '到達できるモジュールが import するものは生きている');
    /* 旧い判定（集合に入っているか）では、この 2 つは互いに import されているので通っていた */
    assert.ok(r.sib.has('js/ghost-a.js') && r.sib.has('js/ghost-b.js'));
    assert.equal(r.isReachable('js/ghost-a.js'), false);
    assert.equal(r.isReachable('js/ghost-b.js'), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('① 動的 import・worker・単独ページ・再エクスポートを通っても届く', () => {
  const dir = fixture({
    'src/main.js': "import '../js/a.js';\n",
    'src/w-worker.js': "import '../js/w.js';\n",
    'js/a.js': "export const a = () => import('./b.js');\n",
    'js/b.js': "export { c } from './c.js';\n",
    'js/c.js': "export const c = 1;\n",
    'js/w.js': "export const w = 1;\n",
    'js/page.js': "export const p = 1;\n",
    'js/orphan.js': "export const o = 1;\n",
    'tool.html': '<script type="module" src="./js/page.js"></script>',
  });
  try {
    const r = jsReachability(dir);
    for (const f of ['a', 'b', 'c', 'w', 'page']) assert.ok(r.isReachable(`js/${f}.js`), f);
    assert.equal(r.isReachable('js/orphan.js'), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('① この repo の js/ は 1 つ残らず入口から届く', () => {
  const r = jsReachability(ROOT);
  assert.ok(r.imported.length > 0, '入口の import が 1 つも読めない');
  const missing = readdirSync(join(ROOT, 'js')).filter((f) => f.endsWith('.js')).filter((f) => !r.isReachable('js/' + f));
  assert.deepEqual(missing, []);
});

test('② gis-core と gis-runtime は互いを import しない（依存は gis-core → gis-runtime の一方向）', () => {
  const imports = (f) => [...readFileSync(join(ROOT, 'js', f), 'utf8').matchAll(/^\s*(?:import|export)\s[^;]*?from\s*'\.\/([\w.-]+\.js)'\s*;/gm)].map((m) => m[1]);
  assert.ok(imports('gis-core.js').includes('gis-runtime.js'), 'gis-core が gis-runtime を読む');
  assert.equal(imports('gis-runtime.js').includes('gis-core.js'), false, 'gis-runtime が gis-core を読み返している（循環）');
});

/* ③ 本番に実在した方言（2026-11-19 の配備ログと pg_policies の読み取り）を、migration 20261118130000 の
   書き換え規則がすべて拾うこと。拾えない 7 本が残って migration が自分で止まり、22 関数が出なかった。
   Postgres の正規表現と JS のそれは、ここで使う部分（\s・\(・選択・群）では同じ意味。 */
test('③ 管理者権限の書き換えは、リポジトリの綴りと本番の綴りの両方を拾う', () => {
  const sql = readFileSync(join(ROOT, 'supabase/migrations/20261118130000_admin_needs_mfa_session.sql'), 'utf8').replace(/\r\n/g, '\n');
  const decl = sql.slice(sql.indexOf('declare', sql.indexOf('-- ── 3.')), sql.indexOf('begin\n  for pol'));
  const lit = (s) => [...s.matchAll(/'((?:[^']|'')*)'/g)].map((m) => m[1].replace(/''/g, "'")).join('');
  const consts = {};
  for (const m of decl.matchAll(/^\s*(\w+) constant text :=\s*([\s\S]*?);\s*$(?=\n(?:\s*--|\s*\w+ constant|\s*$))/gm)) {
    const body = m[2].split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
    /* '…' || name || '…' の連結を評価する */
    consts[m[1]] = body.split('||').map((p) => p.trim()).map((p) => (p.startsWith("'") ? lit(p) : consts[p])).join('');
  }
  const rx = (n) => new RegExp(consts[n]);
  const shapes = {
    'リポジトリ（包み付き）': ['(EXISTS ( SELECT 1\n   FROM profiles p\n  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND p.is_admin)))', 're_exists'],
    '本番・posts admin delete': ['(EXISTS ( SELECT 1\n   FROM profiles p\n  WHERE ((p.id = auth.uid()) AND (p.is_admin = true))))', 're_exists'],
    '本番・feedback_select_admin': ['(EXISTS ( SELECT 1\n   FROM profiles p\n  WHERE ((p.id = auth.uid()) AND p.is_admin)))', 're_exists'],
    '本番・Allow admins to delete any post': ['(auth.uid() IN ( SELECT profiles.id\n   FROM profiles\n  WHERE (profiles.is_admin = true)))', 're_in'],
    '本番・profiles_select': ['is_admin(auth.uid())', 're_uid'],
  };
  for (const [name, [text, re]] of Object.entries(shapes)) {
    assert.ok(rx(re).test(text), `${name}: ${re} が拾わない`);
    const out = text.replace(new RegExp(consts[re], 'g'), 'public.is_admin()');
    assert.equal(out.replace(/(public\.)?is_admin\(\)/g, '').includes('is_admin'), false, `${name}: 書き換え後にまだ is_admin が残る → ${out}`);
  }
});
