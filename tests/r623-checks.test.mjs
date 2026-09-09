/* ============================================================================
 *  #R623 — 錠は取り合いのたびに破れており、診断はその破れを「木は綺麗」と印字していた
 * ----------------------------------------------------------------------------
 *  報告: CI run 34389623083 の「Static checks」で `tests/r403 ①` が落ち、その文言は
 *  `tests/r399 ②` が**わざと作る**変異そのものだった——2つのプロセスが同時に木を書いていた。
 *  そして `tests/r403` の診断は `git status` を**ゲートが返ったあとで**採るので `(clean)` と
 *  印字し、「木が汚れていない＝ゲート自身の問題」と読ませた。**捕まえるために置いた当の場合で、
 *  答えを逆に言った。**
 *
 *  実測した窓は `tests/helpers/gate-lock.mjs` の頭にある。要は
 *  **「所有者の pid が読めなかった」を「所有者は死んでいる」と読んでいた**——`writeFileSync` は
 *  O_TRUNC で開いてから書くので、その隙に読むと `''`、`Number('')` は 0、0 は生きた pid では
 *  ないので、待ち手は**生きている保持者の錠を消して入った**。実測 480 回の持ち替えのうち 13 回
 *  (2.7%) がその隙に当たり、320 保持のうち 24 件で相互排除が破れていた。
 *
 *  ここで守るのは綴りではなく**事実**である:
 *
 *    ① 競争のもとで相互排除が実際に成り立つ（これが破れていた当の事実）
 *    ② 読めない stamp は「まだ書かれていない」であって「死んでいる」ではない
 *    ③ ただし**本当に死んだ**所有者の錠は今でも回収される（②のために生存性を失っていない）
 *    ④ 保持者は「自分の錠がまだ自分のものか」を訊ける——診断が木ではなく錠に訊けるように
 *    ⑤ 診断は、錠が破れていたときに「ゲート自身の問題」とは決して言わない
 *
 *  ⚠ **この木の錠は使わない。** 使うと、同じ suite で 200 秒級の保持をする r399/r403/r500 の
 *  後ろに並び、測りたいもの（取り合いの頻度）ではなく待ち時間を測ることになる。しかも ②〜④ は
 *  錠を意図的に壊すので、共有された錠でやれば**他のファイルを巻き添えにする**。そこで
 *  `gate-lock.mjs` を「チェックアウトの形」をした temp へ**現物のバイト列のままコピー**して
 *  そこを叩く。錠の場所はチェックアウトから導出されるので、コピーは自分だけの錠を持つ。
 *  ⚠⚠ **これは「写し」ではない**——毎回その場で現物をコピーするので、規則が分岐して古くなる
 *  ことがない（`.agents/rules/no-ad-hoc-hardcoding.md` §1 が禁じるのは、手で書き直した第2の正本）。
 * ==========================================================================*/
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, readFileSync, readdirSync, cpSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { verdict } from './helpers/gate-precondition.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HELPER = join(ROOT, 'tests/helpers/gate-lock.mjs');
const asUrl = (p) => 'file:///' + p.split('\\').join('/');

let DIR;                 // the sandbox checkout
let MOD;                 // the copied gate-lock, loaded in THIS process
let LOCK, OWNER;         // …and the lock it derived for itself

before(async () => {
  DIR = join(tmpdir(), 'intmap-r623-' + process.pid + '-' + Math.random().toString(36).slice(2, 8));
  mkdirSync(join(DIR, 'tests', 'helpers'), { recursive: true });
  cpSync(HELPER, join(DIR, 'tests', 'helpers', 'gate-lock.mjs'));
  MOD = await import(asUrl(join(DIR, 'tests', 'helpers', 'gate-lock.mjs')));
  ({ lock: LOCK, owner: OWNER } = MOD.lockPaths());
});

after(() => { rmSync(DIR, { recursive: true, force: true }); rmSync(LOCK, { recursive: true, force: true }); });

/* 別プロセスの待ち手。同じプロセスから呼ぶと `withTreeLock` は再入と見なして即座に通す
   （それが正しい）ので、「本当に外から入れるか」は外から測るしかない。
   解決したら待ち時間、拒まれたら reject。 */
function waiter(timeoutMs) {
  const f = join(DIR, 'waiter-' + Math.random().toString(36).slice(2, 8) + '.mjs');
  writeFileSync(f, [
    "const { withTreeLock } = await import(process.env.LOCKMOD);",
    "const t0 = Date.now();",
    "await withTreeLock(() => {}, { timeoutMs: Number(process.env.T) });",
    "process.stdout.write(String(Date.now() - t0));",
  ].join('\n'));
  const r = spawnSync(process.execPath, [f], {
    env: { ...process.env, LOCKMOD: asUrl(join(DIR, 'tests', 'helpers', 'gate-lock.mjs')), T: String(timeoutMs) },
    encoding: 'utf8', timeout: timeoutMs + 60_000,
  });
  if (r.status === 0) return { entered: true, waitedMs: Number(r.stdout) };
  return { entered: false, why: String(r.stderr || r.error) };
}

test('R623 ① mutual exclusion actually holds when the lock is fought over', async () => {
  const out = join(DIR, 'out');
  mkdirSync(out, { recursive: true });
  /* ⚠ 保持は**同期的に**イベントループを塞ぐ——ゲートは `execFileSync` で走るので、実物がそう
     だから。塞がない保持で測るとこの回のバグは出ない（待ち手が覗く隙が生まれない）。 */
  writeFileSync(join(DIR, 'holder.mjs'), [
    "import { writeFileSync, readFileSync } from 'node:fs';",
    "import { join } from 'node:path';",
    "const { withTreeLock } = await import(process.env.LOCKMOD);",
    "const OUT = process.env.OUTDIR, S = join(OUT, 'sentinel'), ME = String(process.pid);",
    "const breaches = [];",
    "const block = (ms) => { const t = Date.now(); while (Date.now() - t < ms) {} };",
    "for (let i = 0; i < Number(process.env.ROUNDS); i++) {",
    "  await withTreeLock(() => {",
    "    const tok = ME + ':' + i;",
    "    writeFileSync(S, tok);",
    "    block(20 + Math.floor(Math.random() * 120));",
    "    const seen = readFileSync(S, 'utf8');",
    "    if (seen !== tok) breaches.push(tok + ' found ' + seen);",
    "  });",
    "  await new Promise((r) => setTimeout(r, Math.floor(Math.random() * 6)));",
    "}",
    "writeFileSync(join(OUT, 'b-' + ME + '.json'), JSON.stringify(breaches));",
  ].join('\n'));

  /* ⚠⚠⚠ THEY MUST RUN AT THE SAME TIME. `spawnSync` blocks until the child exits, so a loop of
     `spawnSync` runs eight holders ONE AFTER ANOTHER — 320 holds with nothing to contend with,
     which passes on a lock that has no mutual exclusion at all. Measured while writing this: the
     spawnSync version stayed green against the pre-#R623 lock twice, and cost 10–19 s to prove
     nothing. `spawn` and wait for all of them. */
  const PROCS = 6, ROUNDS = 20;
  const kids = await Promise.all(Array.from({ length: PROCS }, () => new Promise((res) => {
    const c = spawn(process.execPath, [join(DIR, 'holder.mjs')], {
      env: { ...process.env, LOCKMOD: asUrl(join(DIR, 'tests', 'helpers', 'gate-lock.mjs')), OUTDIR: out, ROUNDS: String(ROUNDS) },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let err = '';
    c.stderr.on('data', (d) => { err += d; });
    c.on('exit', (code) => res({ code, err }));
  })));
  for (const k of kids) assert.equal(k.code, 0, 'a lock holder died:\n' + k.err);

  const breaches = readdirSync(out).filter((f) => f.startsWith('b-'))
    .flatMap((f) => JSON.parse(readFileSync(join(out, f), 'utf8')));
  /* ⚠ 「たまに落ちる」で済ませてはならない——**ここが赤いなら相互排除が壊れている**。偽陽性は
     構造上あり得ない（他人の token を読んだのなら、他人が中にいた）。実測(#R623): 直す前の
     `gate-lock.mjs` はこの形で 320 保持中 24 件破れ、直した版は 1,080 保持で 0 件。
     ⚠⚠⚠ **だがこれは検出器ではない。圧力試験である。** 実測(#R623)した検出率は、壊した錠に
     対して 4 回中 1 回だった（保持を短くすると 0/2、この形の単体ハーネスなら 5/6）。窓は
     持ち替えの一瞬にしか開かないので、そのとき**何人が覗いていたか**という運が効く。
     ⚠⚠⚠ **#R623 の欠陥そのものを 80ms で毎回捕まえるのは ② のほうで、そちらが門である。**
     ここが要るのは、②が**既知の窓**しか見ないから——①は「二人入った」という事実そのものを
     見るので、まだ名前のついていない壊れ方に対しても赤くなれる。偽陽性は構造上あり得ない
     （他人の token を読んだのなら、他人が中にいた）ので、**ここが赤いなら常に本物である。**
     ⚠ 大きさは意図的に控えめ（6×20）——検出率は回数ではなく運で決まるので、20 秒かけても
     4 回に 1 回のままだった。払う価値があるのは「無料に近い保険」としてであって、門としてではない。 */
  assert.deepEqual(breaches, [], breaches.length + ' of ' + (PROCS * ROUNDS)
    + ' holds saw another process\u2019s token — two writers were inside the tree lock at once');
});

test('R623 ② a stamp that cannot be read is NOT read as a dead owner', async () => {
  /* この回のバグそのもの。所有者の記録が**空**（＝いま書かれている最中）の錠は、生きた保持者の
     錠かもしれない——奪ってはならない。錠は取ったばかりで mtime が新しいので、
     `UNCLAIMED_MS` の時計の逃げ道も開いていない。 */
  await MOD.withTreeLock(() => {
    assert.ok(existsSync(OWNER), 'the hold we are inside did not publish a stamp');
    const mine = readFileSync(OWNER, 'utf8');
    try {
      writeFileSync(OWNER, '');
      const r = waiter(600);
      assert.equal(r.entered, false,
        'an EMPTY stamp let a second waiter into a LIVE hold after ' + r.waitedMs + 'ms — that is the #R623 defect itself');
      assert.match(r.why, /waited 600ms/, 'it failed, but not by waiting:\n' + r.why);
    } finally {
      writeFileSync(OWNER, mine);
    }
  });
});

test('R623 ③ a genuinely dead owner is still reclaimed — the fix did not cost liveness', () => {
  /* ② を「読めなければ永久に待つ」で通すだけの実装でも緑になってしまうので、生存性そのものを
     測る。⚠ pid は手で書かない——**本当に終了したプロセス**のものを使う。 */
  const dead = spawnSync(process.execPath, ['-e', 'process.exit(0)']);
  assert.equal(dead.status, 0);
  assert.ok(dead.pid > 0, 'no pid to work with');

  rmSync(LOCK, { recursive: true, force: true });
  mkdirSync(LOCK, { recursive: true });
  writeFileSync(OWNER, String(dead.pid) + ' 0123456789abcdef');
  const r = waiter(60_000);
  rmSync(LOCK, { recursive: true, force: true });
  assert.equal(r.entered, true,
    'a lock whose owner is genuinely gone was never reclaimed — liveness was lost:\n' + r.why);
  /* 30_000 は `UNCLAIMED_MS`。死んだ所有者は**時計を待たずに**判定できる。 */
  assert.ok(r.waitedMs < 30_000,
    'the dead owner was only reclaimed after the unclaimed-lock clock (' + r.waitedMs + 'ms) — pid liveness is not being consulted');
});

test('R623 ④ a holder can ask whether the lock it took is still the lock it has', async () => {
  await MOD.withTreeLock(() => {
    assert.equal(MOD.lockIntact().intact, true, 'an undisturbed hold must report itself intact');
    const mine = readFileSync(OWNER, 'utf8');

    /* 奪われた形——#R623 で実際に起きたこと: 錠を消され、別の stamp で作り直されている。 */
    rmSync(LOCK, { recursive: true, force: true });
    mkdirSync(LOCK, { recursive: true });
    writeFileSync(OWNER, '999999 someoneelse');
    const stolen = MOD.lockIntact();
    assert.equal(stolen.intact, false, 'a hold whose lock was taken over reported itself intact');
    assert.equal(stolen.held, true, 'the process still believes it holds — that is what makes the report worth printing');
    assert.match(stolen.why, /taken over/, 'the report must say what happened:\n' + stolen.why);

    /* 消えたままの形も、奪われた形と区別できること。 */
    rmSync(LOCK, { recursive: true, force: true });
    const gone = MOD.lockIntact();
    assert.equal(gone.intact, false);
    assert.match(gone.why, /gone/, 'a removed lock must be reported as removed:\n' + gone.why);

    mkdirSync(LOCK, { recursive: true });
    writeFileSync(OWNER, mine);                         // 自分の保持を戻してから抜ける
  });
  assert.equal(MOD.lockIntact().held, false, 'after the hold, this process must not claim to hold anything');
});

test('R623 ⑥ the diagnostic samples the lock WHILE the gate runs, not when it is printed', async () => {
  /* ⚠⚠⚠ この回のバグの「診断側」での再演。最初に書いた `runGate` は `lockIntact()` を
     `explain()` の中で遅延評価していた——ところが `tests/r280 ①` は assertion を
     `withTreeLock` の**外**で書くので、そこで評価すると「錠を取っていなかった」と報告する。
     **嘘であり、しかも同じ間違い**（別の瞬間の状態を、この瞬間の状態として報告する）。
     ⚠ 木ではなく**戻り値**で測る——ゲートを走らせずに `runGate` の契約だけを見る。 */
  const { runGate } = await import('./helpers/gate-precondition.mjs');
  let inside;
  const r = await withTreeLockReal(() => {
    const g = runGate(() => ({ code: 1, out: 'pretend the gate went red' }));
    inside = g.explain();
    return g;
  });
  assert.match(inside, /held continuously/, 'inside the hold it must see the hold:\n' + inside);
  const outside = r.explain();
  assert.equal(outside, inside,
    'the verdict changed between being captured and being printed — it is being sampled at the wrong moment:\n'
    + '--- inside the hold ---\n' + inside + '\n--- after release ---\n' + outside);
});

/* ⑥ は診断が**本物の錠**をどう見るかの話なので、ここだけは sandbox ではなく
   `tests/helpers/gate-precondition.mjs` が実際に読む錠を使う。ゲートは走らせず木も触らないので、
   保持はミリ秒で終わり、他のファイルを待たせない。 */
async function withTreeLockReal(fn) {
  const { withTreeLock } = await import('./helpers/gate-lock.mjs');
  return withTreeLock(fn);
}

test('R623 ⑤ the diagnostic never blames the gate when the lock was broken', () => {
  const CLEAN = '(clean)';
  const INTACT = { held: true, intact: true, why: 'held continuously by this process' };

  /* ⚠ 報告された失敗の核心はここ: **木は前後とも綺麗なのに、答えは「ゲートのせい」ではない。**
     旧実装はこの状況で `(clean)` を印字し、読み手を1日ゲートへ送った。 */
  const broken = verdict({ before: CLEAN, after: CLEAN, lock: { held: true, intact: false, why: 'the lock was taken over while we were inside it' } });
  assert.match(broken, /THE LOCK BROKE/, broken);
  assert.doesNotMatch(broken, /AS COMMITTED/, 'a broken lock was still reported as the gate\u2019s own problem:\n' + broken);

  const held = verdict({ before: CLEAN, after: CLEAN, lock: INTACT });
  assert.match(held, /AS COMMITTED/, held);
  /* ⚠⚠ そして**見えない場合を黙って除外しない**。錠を取らずに書いて戻す書き手は誰にも見えない。 */
  assert.match(held, /WITHOUT taking the tree lock/, 'the one case it cannot see must be named, not omitted:\n' + held);

  const dirty = verdict({ before: ' M Architecture.md', after: CLEAN, lock: INTACT });
  assert.match(dirty, /NOT clean/, dirty);
  assert.doesNotMatch(dirty, /AS COMMITTED/, 'a tree that was already dirty is not evidence about the committed tree:\n' + dirty);

  const unlocked = verdict({ before: CLEAN, after: CLEAN, lock: { held: false, intact: false, why: 'this process is not holding the tree lock' } });
  assert.match(unlocked, /did not run under the tree lock/, unlocked);
  assert.doesNotMatch(unlocked, /AS COMMITTED/, 'a sample taken outside the lock proves nothing about the gate:\n' + unlocked);
});
