/* ============================================================================
 *  tests/helpers/atlas-kernel.mjs — WHERE THE ATLAS KERNEL'S CODE IS   (atlas-capability-modules)
 * ----------------------------------------------------------------------------
 *  The Atlas kernel is js/atlas-console.js AND the capability entries it dispatches to,
 *  js/atlas-cap-<namespace>.js: what each capability does — the 2,190 lines that were the `case`s of
 *  the dispatch switch — moved there, beside its registry row and its argument schema. A check that
 *  asks «does the kernel do X» and reads js/atlas-console.js alone would go blind to every capability
 *  at once, and a `gone()`-style assertion would pass vacuously.
 *
 *    kernelFiles()           — js/atlas-console.js, then every js/atlas-cap-<namespace>.js (DISCOVERED)
 *    kernelSource()          — their texts joined with a newline (for spelling/regex checks; do not
 *                              PARSE the join — each module has its own imports and `export default`)
 *    capsSource()            — the capability modules alone, joined the same way
 *    capabilityEntry(s)      — the entry a dispatch spelling (row column 1) or a capability id names:
 *                              { file, id, spelling, text, row, schema, run, runFile } — the source of the whole
 *                              entry, of its row, of its schema, and `run`: the source of what the
 *                              dispatch runs for it (for a shared run, the function the entry names) —
 *                              i.e. what used to be that spelling's `case` body
 *    runAst(s)               — that run, parsed on its own (the function node)
 *    dispatchRuns()          — the spellings grouped by the run they reach: what used to be the runs of
 *                              `case` labels that fell through to one body
 *
 *  Every answer is read from the files as they are, and located with the parser (scripts/atlas-caps.mjs
 *  entrySources) — not by a spelling of the layout — so moving an entry between files or reformatting it
 *  changes nothing here.
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { entrySources, namespaceFiles } from '../../scripts/atlas-caps.mjs';
import { parseSource } from './ast.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const LF = (s) => s.replace(/\r\n/g, '\n');
const readRel = (root, rel) => LF(fs.readFileSync(path.join(root, rel), 'utf8'));

export function kernelFiles(root = ROOT) { return ['js/atlas-console.js', ...namespaceFiles(root)]; }
export function capsFiles(root = ROOT) { return namespaceFiles(root); }
export function kernelSource(root = ROOT) { return kernelFiles(root).map((f) => readRel(root, f)).join('\n'); }
export function capsSource(root = ROOT) { return capsFiles(root).map((f) => readRel(root, f)).join('\n'); }

/** every capability entry in the namespace modules, located by the parser */
export function capabilityEntries(root = ROOT) { return entrySources(root); }

/** the entry a dispatch spelling (row column 1) or a capability id names, or null */
export function capabilityEntry(spellingOrId, root = ROOT) {
  return capabilityEntries(root).find((e) => e.spelling === spellingOrId || e.id === spellingOrId) || null;
}

/** [[spelling, …], …] — one list per distinct run, in entry order */
export function dispatchRuns(root = ROOT) {
  const by = new Map();
  capabilityEntries(root).forEach((e) => {
    const k = e.runFile + ':' + e.runStart;
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(e.spelling);
  });
  return [...by.values()];
}

/** the run of an entry, parsed on its own: the function node (acorn), for checks that walk what the run reads */
export function runAst(spellingOrId, root = ROOT) {
  const e = capabilityEntry(spellingOrId, root);
  if (!e || !e.run) return null;
  const text = e.run.startsWith('(') ? '(async function ' + e.run + ')' : '(' + e.run + ')';
  return parseSource(text, { sourceType: 'module' }).body[0].expression;
}
