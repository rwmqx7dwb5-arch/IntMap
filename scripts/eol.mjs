/* ============================================================================
 *  IntMap · A CHECK IS ABOUT CONTENT, NOT ABOUT THE CHECKOUT'S BYTES   (#R283)
 * ----------------------------------------------------------------------------
 *  Line endings belong to the CHECKOUT, not to the file. `.gitattributes` pins the
 *  extensions that are executed or parsed on Linux (*.sh, *.sql, *.mjs, *.yml,
 *  *.yaml, *.toml) to LF; everything else — js/, css/, *.html — is left to
 *  `core.autocrlf`, which is `true` on the development machine and hands those
 *  files back with a carriage return before every line break. CI runs on Linux and
 *  reads the same files without one.
 *
 *  So a source-level check written against the bytes the checkout happened to
 *  produce says something DIFFERENT on the two platforms, and the difference has
 *  nothing to do with what it is asserting. Two of them did, and the same finding
 *  was measured by hand and written down three separate times — #R274, #R279 and
 *  #R282 each recorded it and moved on, which is three rounds spent re-diagnosing
 *  one defect:
 *
 *    · tests/r261-checks ③ required the brace of `sources.forEach(sc=>{` to be
 *      followed IMMEDIATELY by a line break. On a CRLF working copy a carriage
 *      return sits in between, so the pattern could not match — red on Windows and
 *      green in CI ever since #R275 gave the assertion this shape (at #R267 it read
 *      `sc=>{ if(!sc.cont) return;` and had no line break in it to be defeated).
 *    · scripts/i18n-langs.mjs --check compared the committed js/locales/_langs.js
 *      with the text it renders BYTE FOR BYTE. The renderer emits LF, the checkout
 *      holds CRLF, so the committed copy read as «stale» on every local run even
 *      though git normalises that difference away on the way in — since #R232, the
 *      round that wrote the generator.
 *
 *  A red that is always red for a reason that is not the subject is worse than no
 *  check at all: it teaches the reader to skip the failure list.
 *
 *  ⚠ THIS NORMALISES; IT DOES NOT RELAX. The only thing dropped is a carriage
 *  return that precedes a line break. A pattern that demands a line break still
 *  demands one, and two texts that differ by a single character are still
 *  different — tests/r283-checks asserts BOTH directions, because a comparison
 *  that answers «the same» to everything is exactly how this would be «fixed» by
 *  weakening it.
 * ==========================================================================*/
import { readFileSync } from 'node:fs';

/* CRLF → LF, and nothing else. */
export const lf = (s) => String(s).split('\r\n').join('\n');

/* Read a source file as the CONTENT a check is about. */
export const readLF = (p) => lf(readFileSync(p, 'utf8'));

/* Do two texts say the same thing, whichever checkout produced them? */
export const sameText = (a, b) => lf(a) === lf(b);

/* ── (#R548) …AND WHEN A TOOL MUST COUNT LINES, IT COUNTS THE PARSER'S ────────────────────────────
 *  `lf()` above answers «are these the same text». A codemod asks a second question — «which line
 *  is this?» — and that one has a right answer that is not a matter of taste: ECMAScript's
 *  LineTerminatorSequence (spec 12.3) is <LF>, <CR>, <CR><LF>, <LS>, <PS>, and acorn's `loc.line`
 *  advances on exactly that set. A tool that indexes an array it split itself with a line number
 *  acorn counted must therefore split on exactly that set, or the two disagree.
 *
 *  ⚠ THE MEASURED FAILURE. scripts/i18n-dead-key-codemod.mjs decided one terminator for the whole
 *  file (`src.includes('\r\n') ? '\r\n' : '\n'`) and split on it. js/locales/ui.zh-hans.js is
 *  fourteen LF header lines in front of 6,271 CRLF ones — scripts/zh-hans.mjs pasted a header out
 *  of a .mjs (LF, forced by .gitattributes) onto a body sliced out of a .js (CRLF under
 *  `core.autocrlf`) — so the split came out fourteen short of acorn's count (6,272 against 6,286).
 *  Rows past the desync crashed on `lines0[a - 1]` being `undefined`; rows BEFORE it did something
 *  worse, reading a line fourteen away and deciding from it whether to delete a whole line.
 *  scripts/i18n-apply-inline.mjs ends by running that generator, so the ordinary sequence «apply
 *  the new keys, then remove the dead ones» met it every time.
 *
 *  ⚠ THE ANSWER IS NOT «NORMALISE EVERYTHING». A codemod rewrites the file it reads, and a codemod
 *  that also re-punctuated every line it did not touch would put a whole-file diff in front of a
 *  reviewer looking for two deleted rows. So each line here carries the terminator it actually had,
 *  and `joinLines(splitLines(s)) === s` for every string. Normalising is available, by name, to the
 *  callers that mean it.
 */

/* ⚠ ORDER MATTERS: \r\n must be tried before the single-character class, or a CRLF counts twice. */
export const LINE_TERMINATOR = /\r\n|[\n\r\u2028\u2029]/;

/* text → [{ text, eol }, …]. `eol` is the terminator that FOLLOWED that line, '' for the last, so
   the array's length is the parser's line count and `loc.line - 1` indexes it. */
export function splitLines(src) {
  const s = String(src);
  const re = new RegExp(LINE_TERMINATOR.source, 'g');
  const out = [];
  let at = 0, m;
  while ((m = re.exec(s))) { out.push({ text: s.slice(at, m.index), eol: m[0] }); at = re.lastIndex; }
  out.push({ text: s.slice(at), eol: '' });
  return out;
}

export const joinLines = (lines) => lines.map((l) => l.text + l.eol).join('');

/* every terminator the text uses, most frequent first */
export function eolHistogram(src) {
  const n = new Map();
  for (const l of splitLines(src)) if (l.eol) n.set(l.eol, (n.get(l.eol) || 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1]);
}

/* ⚠ THE MAJORITY, NOT «ANY CRLF ANYWHERE». A text's convention is what most of its lines do, and
   `includes('\r\n')` answered a different question — it said CRLF for a file with one stray CRLF in
   ten thousand LF lines, and it is the guess this whole section exists because of. A text with no
   terminator at all has no convention to observe, and LF is what .gitattributes forces on
   everything this repository executes. */
export function dominantEol(src) {
  const h = eolHistogram(src);
  return h.length ? h[0][0] : '\n';
}

/* the same lines, punctuated one way. ⚠ This CHANGES BYTES — only call it on text you are writing. */
export const normaliseEol = (src, eol) => splitLines(src).map((l) => l.text).join(eol);
