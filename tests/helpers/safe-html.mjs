/* The shipped output encoder, window.IntMapSafe, for a harness that evaluates a CLASSIC file with a
 * `window` of its own (the `new Function('window', …)` / `vm.runInNewContext(src, { window })` patterns).
 *
 * (safe-output-single-module) js/safe-html.js is the ONE encoder: the app imports it, sources.html and
 * admin.html load it, and an ES module that needs it imports it. A classic file reads it off `window` at
 * call time, so a harness whose `window` is a plain object has to be HANDED it — never a copy of it and
 * never an identity stub, or the check stops measuring what the reader gets.
 * `installSafe(target)` evaluates the REAL file with `target` as its global object, so the object it
 * publishes lands on `target.IntMapSafe`, and returns it. `document` is what `text()` parses in (an
 * inert document is made from `document.implementation` on first use); pass one only if the check
 * calls text(). Nothing in the file is copied here; it is read from the tree on every call. */
import { readFileSync } from 'node:fs';

const SRC = new URL('../../js/safe-html.js', import.meta.url);

export function installSafe(target = {}, { document } = {}) {
  const g = document ? Object.assign(Object.create(target), { document }) : target;
  // eslint-disable-next-line no-new-func
  new Function('globalThis', readFileSync(SRC, 'utf8'))(g);
  if (g !== target) target.IntMapSafe = g.IntMapSafe;
  if (!target.IntMapSafe || typeof target.IntMapSafe.html !== 'function') throw new Error('js/safe-html.js no longer publishes IntMapSafe on its global — update this helper');
  return target.IntMapSafe;
}
