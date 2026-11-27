// IntMap · scripts/regex-escapes.mjs — A REGULAR EXPRESSION THAT LOST ITS BACKSLASH
//
// MEASURED 2026-11-27 (external audit, then a full sweep): five regex literals in js/ had lost the
// backslash of a class escape — `/s+/g` for `/\s+/g`, `/^d{4}$/` for `/^\d{4}$/`. The worst sat in
// js/atlas-goal-verify.js: the request and the answer were handed to Atlas's independent verifier
// with every letter «s» turned into a space («salinity rises» → «alinity ri e»), so the verifier
// judged an English request it could not read, found it unmet, and the turn was bounced and its
// answer withdrawn. The four were written months apart (2026-08-23 … 2026-11-25): the path that
// writes code drops the backslash, so it will happen again, and nothing ran the code to see it.
//
// THE FACT: a regex whose pattern BEGINS with a bare s/d/w (or S/D/W) that is QUANTIFIED is, in
// this codebase, never a run of that letter — every one found was a lost `\`. The rule reads the
// TOKEN (acorn's tokenizer gives the pattern as written), not a spelling of any call site, so it
// holds for code that does not exist yet. A file the tokenizer cannot read is left to `syntax`.
import { tokenizer } from 'acorn';

/* the first atom of the pattern (after an optional ^) is a bare class letter with a quantifier */
const LOST = /^\^?[sdwSDW][+*{]/;

/** lostEscapes(source) → [{ line, pattern }] */
export function lostEscapes(source) {
  const out = [];
  let toks;
  try {
    toks = tokenizer(String(source), { ecmaVersion: 'latest', sourceType: 'module', allowHashBang: true, allowReturnOutsideFunction: true, locations: true });
  } catch (_) { return out; }
  try {
    for (const t of toks) {
      if (t.type && t.type.label === 'regexp' && t.value && LOST.test(String(t.value.pattern))) {
        out.push({ line: t.loc ? t.loc.start.line : 0, pattern: '/' + t.value.pattern + '/' + (t.value.flags || '') });
      }
    }
  } catch (_) { /* a file the tokenizer stops on is the syntax gate's to report */ }
  return out;
}

/** lostEscapeProblems(files, read) → string[] — files: [{ rel, ext }], read(file) → text */
export function lostEscapeProblems(files, read) {
  const problems = [];
  for (const f of files || []) {
    if (!/^\.(?:m|c)?js$/.test(f.ext || '')) continue;
    if (/^(?:node_modules|dist|data|vendor)\//.test(f.rel)) continue;
    for (const hit of lostEscapes(read(f))) {
      problems.push(`${f.rel}:${hit.line} ${hit.pattern} — a quantified bare letter at the start of a pattern is a lost backslash (write \\s, \\d or \\w)`);
    }
  }
  return problems;
}
