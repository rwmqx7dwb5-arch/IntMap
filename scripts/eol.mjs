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
