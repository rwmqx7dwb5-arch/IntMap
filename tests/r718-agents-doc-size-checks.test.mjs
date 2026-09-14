/* ============================================================================
 *  #R718 — a gate whose verdict depended on which machine ran it
 * ----------------------------------------------------------------------------
 *  `check:agents`' `doc-size` asserts that AGENTS.md fits under the 32,768 bytes
 *  Codex reads before it drops the rest in silence. It measured the bytes of the
 *  file AS CHECKED OUT — and `.gitattributes` pins only the extensions executed
 *  or parsed on Linux to LF, so `*.md` is left to `core.autocrlf` and the same
 *  commit is two different sizes.
 *
 *  MEASURED 2026-09-14 on ea7664a1: 32,718 bytes with LF endings over 465 line
 *  breaks, 33,183 bytes as checked out on the development machine. CI passed with
 *  50 bytes of margin. The file Codex opened on that machine was 415 bytes OVER
 *  and had lost the tail of §12 (本ファイル自体の保守) — the section that tells
 *  every round what to do when this file gets too long. Neither verdict was wrong
 *  about its own runner; a green CI was hiding a truncated rulebook.
 *
 *  Two things are asserted here, and they pull in opposite directions on purpose:
 *
 *    · the measurement is the WORST CASE a conforming checkout can produce, so it
 *      is the same number on Linux and on Windows — and #R283's `lf()` is NOT
 *      applied, because here the carriage return is the subject rather than noise
 *      in front of it. A version of this «fixed» by normalising would be portable
 *      and about nothing anyone reads, so ② asserts the un-normalised direction.
 *    · the margin was regained by MOVING §11.3 out (AGENTS.md §12 says exactly
 *      that: move the 正本, do not raise the number), and a move is only a move
 *      while the clauses are still somewhere a session is sent. ⑥ asserts that
 *      AGENTS.md does not also keep a copy — one fact, one owner.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const at = (p) => fileURLToPath(new URL('../' + p, import.meta.url));
const read = (p) => readFileSync(at(p), 'utf8');

const { crlfBytes } = await import('../scripts/eol.mjs');

/* ── ① the same text measures the same on either checkout ───────────────────────────────────── */
test('#R718 ① crlfBytes is a property of the content, not of the checkout', () => {
  const lfText = 'alpha\nbravo\ncharlie\n';
  const crlfText = lfText.split('\n').join('\r\n');

  assert.equal(crlfBytes(lfText), crlfBytes(crlfText),
    'the LF and CRLF spellings of one text measure differently — the verdict still depends on the runner');
  assert.equal(crlfBytes(lfText), Buffer.byteLength(crlfText, 'utf8'),
    'the worst case is not the size of the CRLF checkout, which is the file Codex actually opens');
  assert.ok(crlfBytes(lfText) >= Buffer.byteLength(lfText, 'utf8'),
    'the worst case came out SMALLER than the LF checkout — a bound that is not a bound');

  /* multi-byte text: the carriage returns are counted on top of UTF-8 bytes, not of characters */
  const ja = '作業終了処理\nUSB バックアップ\n';
  assert.equal(crlfBytes(ja), Buffer.byteLength(ja.split('\n').join('\r\n'), 'utf8'),
    'the count is wrong for non-ASCII text — AGENTS.md is almost entirely non-ASCII');
});

/* ── ② it must NOT normalise, which is how this would be «fixed» wrongly ─────────────────────── */
test('#R718 ② the carriage return is counted, not normalised away', () => {
  /* ⚠ This is the assertion that stops the obvious wrong fix. scripts/eol.mjs exists because a
     check is about content and line endings belong to the checkout (#R283); applying `lf()` here
     WOULD make the verdict portable, and it would answer «would this fit if the file were stored
     differently?» while the reader on a CRLF machine still loses the tail. */
  const text = 'a\nb\nc\n';
  assert.notEqual(crlfBytes(text), Buffer.byteLength(text, 'utf8'),
    'crlfBytes returned the LF size — the measurement normalised the subject away');
  assert.equal(crlfBytes(text) - Buffer.byteLength(text, 'utf8'), 3,
    'one byte per line break is what a CRLF checkout adds; this counted a different number');

  /* a text with no line break at all has no carriage returns to gain */
  assert.equal(crlfBytes('no newline here'), 15);
});

/* ── ③ the file that shipped over the ceiling is now judged over it ─────────────────────────── */
test('#R718 ③ the measured ea7664a1 shape fails, though its LF size passed', () => {
  const CEILING = 32768;
  /* the exact shape measured 2026-09-14: 32,718 bytes of text over 465 line breaks */
  const lfBytes = 32718, breaks = 465;
  const doc = 'x'.repeat(lfBytes - breaks) + '\n'.repeat(breaks);
  assert.equal(Buffer.byteLength(doc, 'utf8'), lfBytes, 'the reconstruction is not the measured size');

  assert.ok(Buffer.byteLength(doc, 'utf8') < CEILING,
    'the LF size was UNDER the ceiling — that is why CI was green, and the premise of this round');
  assert.equal(crlfBytes(doc), 33183,
    'the worst case of the measured file is not the 33,183 bytes this machine holds');
  assert.ok(crlfBytes(doc) >= CEILING,
    'the file that had lost the tail of §12 on this machine would still pass — the gate learnt nothing');
});

/* ── ④ the gate is WIRED to it, asserted by running the gate ────────────────────────────────── */
test('#R718 ④ check:agents reports the worst case for the shipped AGENTS.md', () => {
  /* ⚠ EVALUATED, NOT READ. A test that greps agent-sync.mjs for the word `crlfBytes` passes on a
     file that imports it and never calls it (#R505). So run the gate and read the number out. */
  /* ⚠ AND ITS MUTATION IS A LINUX-SIDE ONE, WHICH IS THE POINT. On a CRLF checkout the bytes on
     disk and the worst case are the same number BY DEFINITION, so no assertion here can tell a
     gate that reads the file's own bytes from one that computes the bound. VERIFIED #R718 by
     re-punctuating AGENTS.md to LF (a Linux checkout) and running this file: intact → green,
     `bytes = disk` → red. The bug hid on the runner where it was green; the test catches it on
     the runner where it is visible, which is the same one. */
  const out = execFileSync(process.execPath, [at('scripts/agent-sync.mjs')], { encoding: 'utf8' });
  const m = out.match(/doc-size: AGENTS\.md (\d+)\/(\d+) bytes/);
  assert.ok(m, `check:agents printed no doc-size verdict:\n${out}`);

  const want = crlfBytes(read('AGENTS.md'));
  assert.equal(Number(m[1]), want,
    'the gate is reporting some other size than the worst case — on a CRLF runner this is the same'
    + ' number by coincidence, and on Linux it is the one that let a truncated file through');
  /* ⚠ AND STRICTLY MORE THAN THE LF SIZE, which is the half that discriminates on EITHER platform.
     Comparing against `want` alone cannot catch a gate that went back to reading the checkout's
     bytes while the checkout happens to be CRLF — and the Linux runner, where that bug was green,
     is exactly the one where the two numbers differ. This inequality is false for any
     implementation that measures LF bytes, on any machine. */
  const lfSize = Buffer.byteLength(read('AGENTS.md').split('\r\n').join('\n'), 'utf8');
  assert.ok(Number(m[1]) > lfSize,
    `the gate reported ${m[1]} bytes, which is the LF size (${lfSize}) — it is measuring a checkout`
    + ' that stores no carriage returns, and that is the verdict CI gave while §12 was truncated');

  assert.equal(Number(m[2]), 32768, 'the ceiling moved; Codex reads 32,768 bytes by default');
  assert.ok(want < 32768, `AGENTS.md is ${want} bytes on a CRLF checkout — Codex would drop the tail`);

  /* and the bound has to actually bound the file this checkout holds */
  assert.ok(readFileSync(at('AGENTS.md')).length <= want,
    'this checkout is LARGER than the "worst case" — the measurement is not an upper bound');
});

/* ── ⑤ the margin was regained by moving, not by raising the number ─────────────────────────── */
test('#R718 ⑤ the ceiling is still 32,768 everywhere it is written down', () => {
  /* AGENTS.md §12 and docs/AGENT-SETUP.md both state the number; the fix for a full file is to
     move a section out, and a later round reading either document must not find a bigger one. */
  for (const f of ['AGENTS.md', 'docs/AGENT-SETUP.md', 'docs/TESTING.md']) {
    assert.match(read(f), /32,?768/,
      `${f} no longer states the byte ceiling — the number Codex enforces has no owner there`);
  }
  assert.match(read('scripts/agent-sync.mjs'), /do not raise this number/,
    'the failure message stopped telling the next round to move a section instead');
});

/* ── ⑥ §11.3 moved — it did not get copied, and it did not vanish ───────────────────────────── */
test('#R718 ⑥ the backup invariants have exactly one owner, and AGENTS.md reaches it', () => {
  const agents = read('AGENTS.md');
  const setup = read('docs/AGENT-SETUP.md');

  assert.match(setup, /^## 10\. USB バックアップのスクリプトが守っていること/m,
    'docs/AGENT-SETUP.md §10 is gone — the invariants moved out of AGENTS.md into nothing');
  assert.match(agents, /^### 11\.3 /m, 'AGENTS.md §11.3 disappeared entirely; §10 points at §11.x by number');

  /* the pointer has to be reachable prose, not a deleted section */
  const pointer = agents.slice(agents.indexOf('### 11.3 '), agents.indexOf('### 11.4 '));
  assert.ok(pointer.includes('docs/AGENT-SETUP.md'),
    'AGENTS.md §11.3 no longer names where the invariants went — a session reading it is sent nowhere');

  /* ⚠ AND NOT A SECOND COPY. The whole reason for the move is the byte ceiling; a round that
     "restores" a clause into AGENTS.md gets the bytes back AND a second 正本 to drift (§9). */
  for (const clause of ['SHA-256', 'ボリュームラベル', 'リポジトリに無いものは USB からも削除']) {
    assert.ok(setup.includes(clause), `docs/AGENT-SETUP.md §10 lost the clause 「${clause}」`);
    assert.ok(!pointer.includes(clause),
      `AGENTS.md §11.3 keeps a copy of 「${clause}」 — the fact now has two owners and the bytes are back`);
  }
});
