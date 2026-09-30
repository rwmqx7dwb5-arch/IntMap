/* ============================================================================
 *  scripts/architecture-spec.mjs — where the current-state spec lives, in ONE place
 * ----------------------------------------------------------------------------
 *  The spec used to be one file, Architecture.md: MEASURED 2026-10-01, 741 KB, 6,166 lines, eighteen
 *  H2 chapters, touched by 68 of the last 101 commits. A session could only read it by grepping for a
 *  heading, and parallel branches collided in it on every landing. The chapters now live one per file
 *  under docs/architecture/, and Architecture.md is the MAP: a table «§N → file(s)» plus a summary.
 *
 *  ⚠ THE SECTION NUMBERS DID NOT MOVE. «Architecture.md §7.4» in a document, a comment or a test is
 *    still an address; it resolves through the map's table. That table is the one declaration of
 *    which files share the number space (the chapters, and docs/FILES.md / docs/MAP-LAYERS.md, which
 *    took §3.x and most of §7.x earlier) — scripts/doc-facts.mjs `section-refs` resolves through it
 *    and `arch-split` holds the table and the chapter headings to each other.
 *  ⚠ THE CHAPTERS ARE DISCOVERED, NOT LISTED. A chapter file added to docs/architecture/ is part of
 *    the spec the moment it exists; a rule that read a hand-written list would stop looking at it.
 *
 *  Readers: scripts/doc-facts.mjs (every rule that read Architecture.md reads `specText` now), and the
 *  tests that read the spec's prose (they call readSpec / specFileWith).
 * ==========================================================================*/
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, posix } from 'node:path';

export const GUIDE = 'Architecture.md';
export const CHAPTER_DIR = 'docs/architecture';

/** the chapter files, in reading order (the `NN-` prefix is the chapter number) */
export function chapters(root) {
  const dir = join(root, CHAPTER_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => /\.md$/.test(f)).sort().map((f) => CHAPTER_DIR + '/' + f);
}

/** the files whose text IS the spec: the map, then every chapter */
export function specFiles(root) {
  return [GUIDE, ...chapters(root)];
}

const readFrom = (root) => (f) => {
  try { return readFileSync(join(root, f), 'utf8'); } catch { return ''; }
};

/** the whole spec as one text — what "Architecture.md" meant before the split.
 *  `read(f)` lets a caller that already holds the bodies (doc-facts' BODY) supply them. */
export function readSpec(root, read = readFrom(root)) {
  return specFiles(root).map((f) => read(f) || '').join('\n');
}

/** the spec file whose text contains `needle` — for a test that has to break one sentence of the
 *  spec in a private copy and must find out which file carries it now. null when none does. */
export function specFileWith(root, needle, read = readFrom(root)) {
  /* a /g or /y needle carries lastIndex from one .test() to the next — ask a fresh one each time */
  const hit = typeof needle === 'string' ? (s) => s.includes(needle)
    : (s) => new RegExp(needle.source, needle.flags.replace(/[gy]/g, '')).test(s);
  for (const f of specFiles(root)) {
    if (hit(read(f) || '')) return f;
  }
  return null;
}

/** «Architecture.md» as an ADDRESS means the spec, the way «Architecture.md §7.4» does: for a caller
 *  that names a file and a sentence in it (a mutation test's { file, from }), the spec file that
 *  actually carries the sentence. Any other file name is returned as it is. */
export function specFileFor(root, file, needle, read = readFrom(root)) {
  if (file !== GUIDE) return file;
  return specFileWith(root, needle, read) || file;
}

/** the map's table: `| §N | [file](path)… | summary |` → [{ sec, files: [repo paths], line }].
 *  Links are resolved from the map's own directory (the repository root). */
export function guideRows(guideText) {
  const rows = [];
  (guideText || '').split(/\r?\n/).forEach((l, i) => {
    const m = l.match(/^\|\s*§(\d+)\s*\|([^|]*)\|/);
    if (!m) return;
    const files = [...m[2].matchAll(/\]\(([^)#\s]+\.md)(?:#[^)\s]*)?\)/g)].map((x) => posix.normalize(x[1]));
    rows.push({ sec: m[1], files, line: i + 1 });
  });
  return rows;
}

/** every file that shares the spec's section-number space: the map itself plus every file its
 *  table names. Derived from the table, so a document joins the number space by being on it. */
export function numberSpace(root, read = readFrom(root)) {
  const set = new Set([GUIDE]);
  for (const r of guideRows(read(GUIDE))) for (const f of r.files) set.add(f);
  return [...set];
}
