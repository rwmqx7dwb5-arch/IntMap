import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze } from '../scripts/migration-order.mjs';

const D = 'supabase/migrations/';
const base = [D + '20261001000000_a.sql', D + '20261101000000_b.sql'];
const NOW = new Date(Date.UTC(2026, 9, 1, 0, 0, 0)); // earlier than the base's newest, as the real tree is (versions run ahead of the clock)
const run = (head, extra = {}) => analyze({ baseTip: base, head: [...base, ...head], now: NOW, ...extra });

test('古い時刻の追加は赤で、付け替え先は base の最新より後', () => {
  const r = run([D + '20261010000000_old.sql']);
  assert.equal(r.problems.some((p) => p.kind === 'stale'), true);
  assert.equal(r.fixes[0].to, D + '20261101000001_old.sql');
});
test('新しい時刻の追加は緑', () => {
  assert.deepEqual(run([D + '20261102000000_new.sql']).problems, []);
});
test('base の最新と同時刻は赤（<=）', () => {
  assert.equal(run([D + '20261101000000_dup.sql']).problems.some((p) => p.kind === 'stale'), true);
});
test('改名は「削除」と「追加」の両方として述べる', () => {
  const head = [D + '20261001000000_a.sql', D + '20260901000000_b.sql'];
  const r = analyze({ baseTip: base, head, now: NOW });
  assert.deepEqual(r.removed, [D + '20261101000000_b.sql']);
  assert.ok(r.problems.some((p) => p.kind === 'removed'));
  assert.ok(r.problems.some((p) => p.kind === 'stale'));
});
test('削除だけでも赤', () => {
  assert.ok(analyze({ baseTip: base, head: [base[0]], now: NOW }).problems.some((p) => p.kind === 'removed'));
});
test('base が先へ進んだだけ（branch が遅れている）なら赤にならない', () => {
  const tip = [...base, D + '20261120000000_main-new.sql'];
  const r = analyze({ baseTip: tip, ancestor: base, head: base, now: NOW });
  assert.deepEqual(r.problems, []);
});
test('複数の古い追加は順序を保って付け替える', () => {
  const r = run([D + '20261005000000_x.sql', D + '20261006000000_y.sql']);
  assert.deepEqual(r.fixes.map((f) => f.to), [D + '20261101000001_x.sql', D + '20261101000002_y.sql']);
});
test('同じ版を 2 本が名乗れば赤', () => {
  assert.ok(run([D + '20261201000000_p.sql', D + '20261201000000_q.sql']).problems.some((p) => p.kind === 'duplicate'));
});
test('実 git: CLI は古い追加で exit 1・新しい追加で exit 0', () => {
  const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../scripts/migration-order.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'migord-'));
  const g = (...a) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: dir, stdio: 'pipe' });
  const cli = (...a) => { try { return { rc: 0, out: execFileSync('node', [script, ...a], { cwd: dir, encoding: 'utf8', stdio: 'pipe', env: { ...process.env, GITHUB_ACTIONS: '', GITHUB_BASE_REF: '' } }) }; } catch (e) { return { rc: e.status, out: String(e.stdout) }; } };
  try {
    g('init', '-q', '-b', 'main');
    fs.mkdirSync(path.join(dir, D), { recursive: true });
    fs.writeFileSync(path.join(dir, D, '20261101000000_b.sql'), 'select 1;');
    g('add', '-A'); g('commit', '-qm', 'base');
    g('checkout', '-qb', 'feat');
    fs.writeFileSync(path.join(dir, D, '20261001000000_old.sql'), 'select 1;');
    g('add', '-A'); g('commit', '-qm', 'old');
    const red = cli('--base', 'main');
    assert.equal(red.rc, 1); assert.match(red.out, /git mv .*20261001000000_old\.sql .*\d{14}_old\.sql/);
    g('mv', D + '20261001000000_old.sql', D + '20261102000000_old.sql'); g('commit', '-qam', 'fix');
    assert.equal(cli('--base', 'main').rc, 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('現在時刻のほうが base の最新より新しければ現在時刻へ付け替える', () => {
  const r = run([D + '20261010000000_old.sql'], { now: new Date(Date.UTC(2026, 11, 5, 3, 4, 5)) });
  assert.equal(r.fixes[0].to, D + '20261205030405_old.sql');
});
