/* ============================================================================
 *  #R473 — 「既存機能は絶対に削らない」を、利用者が「確認を取れば削ってよい」に変えた回
 * ----------------------------------------------------------------------------
 *  方針転換の一文はこうである——**必要と判断すれば提案し、確認が取れれば削除・縮小してよい。
 *  ただし勝手にはやらない。** そして Atlas だけは別扱いで、**実装は削ってよいが、到達可能な
 *  能力と回答品質は削らない。**
 *
 *  この一文は3つの文書に、3つの声で書いてある——`CONSTITUTION.md`（何を守るか）・
 *  `CLAUDE.md`（どう働くか）・`PRODUCT.md`（§2.1 守ること）。**同じ方針が3か所にある**という
 *  形は、この repository が最もよく壊してきた形そのものである（#R403 の gate-lists、#R399 の
 *  本数、`backup-shell` の launcher——どれも「1つを直して2つを直し忘れた」）。
 *
 *  ⚠ ここでは**両方の古さが事故になる**。古い禁止だけを読んだセッションは、いま望まれている
 *    削減を提案せずに終わる。逆に、許可だけを読んで「確認」の段を落としたセッションは、
 *    **訊かずに消す**。後者は取り返しがつかない。
 *
 *  よってこのファイルが検査するのは「文言」ではなく、`scripts/doc-facts.mjs` の
 *  `shrink-policy` 規則が**実際に赤くなること**である。
 *
 *    ① 現状は緑（この規則が何かを主張していること自体の前提）
 *    ② どの1文書からでも「確認・承認」の段が消えたら赤——**許可だけが残った文書**を作らない
 *    ③ 「勝手にはしない」が消えたら赤——ブレーキの無い許可は許可証である
 *    ④ Atlas の但し書きは `CONSTITUTION.md` が正本で、そこから消えたら赤
 *    ⑤ 他の2文書が正本を**名指さなくなったら**赤——写しを増やさずに届かせる唯一の手段
 *    ⑥ 錨（`既存機能`）ごと消えても緑にならない（#R385 の形——文が消えたせいで緑）
 *
 *  ⚠ 変異は**窓の中だけ**に効かせる。ファイル全体から「確認」を消すような変異は、通っても
 *    何も証明しない（規則が読んでいるのはその窓だから）。
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withTreeLock } from './helpers/gate-lock.mjs';
import { readLF } from '../scripts/eol.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
const CANON = 'CONSTITUTION.md';
const OWNERS = [CANON, 'CLAUDE.md', 'PRODUCT.md'];
const WIN = 700;                 /* scripts/doc-facts.mjs の窓と同じ幅 */

/* ⚠ 規則1本だけを走らせる（#R407 の `--rule=`）。全規則を回すと 11 秒、これは 1 秒。
   変異を戻さないまま長く錠を持たないためでもある。 */
function docFacts() {
  try {
    execFileSync(process.execPath, [join(ROOT, 'scripts/doc-facts.mjs'), '--rule=shrink-policy', '--check'],
      { cwd: ROOT, encoding: 'utf8' });
    return { code: 0, out: '' };
  } catch (e) {
    return { code: e.status == null ? -1 : e.status, out: String(e.stdout || '') + String(e.stderr || '') };
  }
}

/* 壊す → 走らせる → **バイト列で**戻す（#R403 の helper と同じ約束） */
async function breaking(file, mutate, fn) {
  await withTreeLock(() => {
    const originalBytes = rd(file);
    const original = readLF(join(ROOT, file));
    const broken = mutate(original);
    assert.notEqual(broken, original, `the mutation did not change ${file} — its anchor is gone`);
    try {
      writeFileSync(join(ROOT, file), broken);
      fn(docFacts());
    } finally {
      writeFileSync(join(ROOT, file), originalBytes);
    }
    assert.equal(rd(file), originalBytes, `${file} was not restored byte-for-byte after the mutation`);
  });
}

/* 錨から WIN 文字ぶんだけを書き換える。錨が複数あれば、そのすべてを書き換える
   （規則は「どれか1つの窓が条件を満たせば緑」なので、1つ残せば変異は無効になる）。 */
function editWindows(src, fn) {
  let out = '', last = 0;
  for (const m of src.matchAll(/既存機能/g)) {
    if (m.index < last) continue;                         /* 重なった窓 */
    const end = Math.min(src.length, m.index + WIN);
    out += src.slice(last, m.index) + fn(src.slice(m.index, end));
    last = end;
  }
  return out + src.slice(last);
}

function green(msg) {
  return withTreeLock(() => {
    const r = docFacts();
    if (r.code === 0) return;
    let dirty = '(git status unavailable)';
    try {
      dirty = execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).trim() || '(clean)';
    } catch { /* leave the placeholder */ }
    assert.fail(`${msg}\n--- check:docs (shrink-policy) said ---\n${r.out}\n--- working tree ---\n${dirty}`);
  });
}

const red = (r, file, why) => {
  assert.equal(r.code, 1, `the gate stayed GREEN with ${file} broken — ${why}`);
  assert.ok(r.out.includes('shrink-policy'), `the gate failed but never named shrink-policy (${why}):\n` + r.out);
  assert.ok(r.out.includes(file), `the gate failed but never named ${file} (${why}):\n` + r.out);
};

test('R473 ① 3つの正本が、確認つきの形で削除・縮小の方針を述べている', async () => {
  await green('shrink-policy must be green before any mutation below means anything');
  /* 規則を信じる前に、錨が実在することを直接確かめる（規則が「見ていなかった」ことによる緑を除く） */
  for (const f of OWNERS) {
    const body = readLF(join(ROOT, f));
    assert.ok(body.includes('既存機能'), `${f} does not state the policy about 既存機能 at all`);
    const win = body.slice(body.indexOf('既存機能'), body.indexOf('既存機能') + WIN);
    assert.match(win, /削除|縮小/, `${f} names 既存機能 but not what may happen to it`);
    assert.match(win, /確認|承認/, `${f} states the policy without the asking step`);
  }
});

test('R473 ② どの1文書からでも「確認」の段が消えたら赤い', async () => {
  await withTreeLock(async () => {
    for (const f of OWNERS) {
      await breaking(f, (s) => editWindows(s, (w) => w.replace(/確認|承認/g, '——')),
        (r) => red(r, f, 'permission with the asking step dropped'));
    }
  });
});

test('R473 ③ 「勝手にはしない」が消えたら赤い', async () => {
  await withTreeLock(async () => {
    for (const f of OWNERS) {
      await breaking(f, (s) => editWindows(s, (w) => w.replace(/勝手|承認の無い|承認されるまで/g, '——')),
        (r) => red(r, f, 'a permission with no brake on doing it alone'));
    }
  });
});

test('R473 ④ Atlas の但し書きは CONSTITUTION.md が正本で、そこから消えたら赤い', async () => {
  await withTreeLock(async () => {
    /* (a) 「一体として扱う」が消える */
    await breaking(CANON, (s) => s.replace(/一体/g, '別々'),
      (r) => red(r, CANON, 'Atlas no longer treated as one system'));
    /* (b) 「到達可能な能力は削らない」が消える——実装だけでなく能力まで削ってよく読める状態 */
    await breaking(CANON, (s) => s.replace(/到達/g, '——'),
      (r) => red(r, CANON, 'the reachable-capability floor is gone'));
  });
});

test('R473 ⑤ 他の2文書が正本を名指さなくなったら赤い', async () => {
  await withTreeLock(async () => {
    for (const f of OWNERS.filter((x) => x !== CANON)) {
      await breaking(f, (s) => editWindows(s, (w) => w.split(CANON).join('憲法')),
        (r) => red(r, f, 'the pointer to the owner of the Atlas carve-out is gone'));
    }
  });
});

test('R473 ⑥ 錨ごと消えても緑にならない（文が消えたせいで緑、を作らない）', async () => {
  await withTreeLock(async () => {
    for (const f of OWNERS) {
      await breaking(f, (s) => s.split('既存機能').join('既存の機能'),
        (r) => red(r, f, 'the policy simply stopped being stated'));
    }
  });
});
