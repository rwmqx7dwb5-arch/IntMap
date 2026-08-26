/* ============================================================================
 *  R478 — 棚の名前を spec に二度書かせない
 * ----------------------------------------------------------------------------
 *  #R469 は読者の「ベータからはCAPE不安定度レイヤーを気象に昇格。」に従って `ec-cape` を
 *  `js/data-layers.js` の `GROUPS` の中で気候・気象の棚へ移した。同じ事実を述べていた node 検査は
 *  2本とも同じコミットで直っている（`tests/r439-checks` ⑨・`tests/r469-checks` ⑥）——**どちらも
 *  毎 push 走るから**である。
 *
 *  直らなかったのは1行だけだった: `tests/r439.spec.js` が
 *
 *      expect(under['dl-ec-cape'], …).toBe('lyrGrpOthers');
 *
 *  と**答えを直接綴っていた**写しである。その spec は deep tier にしか無いので、#R469 の push は
 *  緑のまま通り、赤くなったのは**次に nightly が回った夜**だった。#R475 が記録した形と同じ——
 *  **開いていないラウンドで動く判定は、そのラウンドでは測られていない。**
 *
 *  ⚠⚠⚠ 門は「落ちた1行」より広くなければならない。最初に書いた版は禁止する集合を `GROUPS` の
 *  キーから導出していて、**それでは落ちた当の行を捕まえられなかった**——`lyrGrpOthers` は棚では
 *  ないので、集合に入らない。実測（origin/main 08676e1 の `tests/r439.spec.js` を走査）: 145 行目
 *  （`'lyrGrpClimate'`）だけが挙がり、**赤くなった 149 行目は素通りした。**
 *
 *  だから禁じるのは棚の名前ではなく `lyrGrp` という綴りそのものである。spec がそれを綴るという
 *  ことは、`js/data-layers.js` が既に述べている事実の写しを持つということで、写しは分類が動いた
 *  瞬間に嘘になり、しかも夜まで黙っている。
 *
 *  ⚠ **綴らずに済む口は用意してある。** `tests/helpers/layer-groups.mjs` が
 *  `where(id)`（その行を宣言が載せている棚）と `BETA_KEY`（どの棚にも無い行が掃き出される
 *  「その他 (beta)」の見出し）を**同じファイルから読んで**返す。禁じているのは知ることではなく、
 *  二度書くことだ。
 *
 *  ⚠ **コメントは剥がす。** この欠陥を説明する注記は、必ずその綴りを含む——#R345 が9回目を数えて
 *  `scripts/code-only.mjs` を1本に切り出した理由がそれで、剥がさない検査は「よく説明された
 *  ファイルほど大きな声で嘘をつく」。剥がしたうえで、②が**出荷された当の2行**に対して発火する
 *  ことを実際に見せる（#R465: 検査は発火することを証明できる形に）。
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeOnly } from '../scripts/code-only.mjs';
import { GROUPS, BETA_KEY, where } from './helpers/layer-groups.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** `tests/<any depth>/*.spec.js` — a spec in a subdirectory is still a spec */
function specFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...specFiles(p));
    else if (e.name.endsWith('.spec.js')) out.push(p);
  }
  return out;
}

/** every `lyrGrp…` a source spells OUTSIDE its comments, with the line it was on */
function shelfSpellings(src) {
  const hits = [];
  codeOnly(src).split('\n').forEach((line, i) => {
    for (const m of line.matchAll(/lyrGrp\w*/g)) hits.push({ line: i + 1, key: m[0], text: line.trim() });
  });
  return hits;
}

/* ── ① no spec keeps a second copy of the answer ─────────────────────────────────────────────── */
test('R478 ① no .spec.js spells a layer-panel heading', () => {
  const offenders = [];
  for (const f of specFiles(path.join(ROOT, 'tests'))) {
    for (const h of shelfSpellings(fs.readFileSync(f, 'utf8'))) {
      offenders.push(path.relative(ROOT, f).replace(/\\/g, '/') + ':' + h.line + '  → ' + h.text);
    }
  }
  assert.deepEqual(offenders, [],
    'a spec that spells a panel heading states a fact js/data-layers.js already states, and the copy ' +
    'goes stale in silence — the deep tier only runs at night. Ask tests/helpers/layer-groups.mjs: ' +
    'where(id) for the shelf a row is filed on, BETA_KEY for the sweep\'s heading.\n' + offenders.join('\n'));
});

/* ── ② the scanner fires — on BOTH lines as origin/main 08676e1 shipped them ─────────────────── */
test('R478 ② the scanner catches the stale line, and the one beside it', () => {
  const shipped = [
    "  for (const id of ['dl-ec-slp', 'dl-ec-gust', 'dl-ec-precip', 'dl-ec-dew']) {",
    "    expect(under[id], id + ' is on the shelf').toBe('lyrGrp" + "Climate');",
    '  }',
    "  expect(under['dl-ec-isobars'], 'and the retired row is nowhere at all').toBeUndefined();",
    '  /* the rows the instruction did NOT name stayed where they were (#R273) */',
    "  expect(under['dl-ec-cape'], 'ec-cape was not promoted by anybody').toBe('lyrGrp" + "Others');",
  ].join('\n');
  const hits = shelfSpellings(shipped);
  assert.deepEqual(hits.map(h => h.line), [2, 6],
    'the assertion that stated the shelf AND the one that stated the sweep — the first version of ' +
    'this gate derived its universe from GROUPS and missed line 6, which is the line that went red');

  /* …and the prose that EXPLAINS the defect does not trip it (#R345) */
  const prose = '/* it used to say lyrGrp' + 'Climate here, and lyrGrp' + 'Others before that */\nconst x = 1;';
  assert.deepEqual(shelfSpellings(prose), [], 'a comment naming a heading is prose, not a copy');
});

/* ── ③ the module answers both halves, from the same file ────────────────────────────────────── */
test('R478 ③ the sweep’s heading is not a shelf, and both come from js/data-layers.js', () => {
  assert.ok(GROUPS.length > 10, 'the taxonomy was read as a value, not as a spelling');
  assert.ok(BETA_KEY, 'the safety sweep’s heading was read off reorganizeLayerPanel');
  assert.ok(!GROUPS.some(([k]) => k === BETA_KEY),
    'a row lands under it precisely BECAUSE no shelf claimed it — that is why `where(id) || BETA_KEY` ' +
    'is not a copy of the taxonomy but one fact about the sweep');
  /* the two rows this whole round is about, answered by value rather than by spelling */
  assert.equal(where('ec-cape'), GROUPS.find(([, ids]) => ids.includes('ec-cape'))[0],
    'where() agrees with the declaration it read');
  assert.equal(where('ec-wind'), undefined, 'the row nobody has named is on no shelf, then or now');
});

/* ── ④ the spec asks the declaration instead ─────────────────────────────────────────────────── */
test('R478 ④ tests/r439.spec.js reads the shelf off the declaration', () => {
  const src = codeOnly(fs.readFileSync(path.join(ROOT, 'tests', 'r439.spec.js'), 'utf8'));
  assert.ok(/from\s+'\.\/helpers\/layer-groups\.mjs'/.test(src),
    'it imports the module that evaluates the literal');
  assert.ok(/\bwhere\(/.test(src), 'and it actually calls where() — an unused import proves nothing');
  assert.ok(/\bBETA_KEY\b/.test(src), 'and names the sweep’s heading through the module');
});
