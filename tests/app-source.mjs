/* ============================================================================
 *  IntMap · "the app's source text"  (#R162)
 * ----------------------------------------------------------------------------
 *  The R1xx regression suites assert on the APP's source with literal-substring
 *  checks. They all used to read index.html, because index.html WAS the whole app.
 *
 *  Since #R162 it is not: the stylesheet lives in css/intmap.css and the
 *  self-contained reference-data tables + modules live in js/*.js. A test that
 *  still read only index.html would flip to red (or, worse, silently green for a
 *  `gone()` assertion) merely because a line moved between files — which is
 *  exactly the false signal a source-level guard must not produce.
 *
 *  So "the source" is every file the browser actually loads, concatenated. That
 *  keeps every existing assertion meaningful across the ongoing file split, and
 *  keeps future splits from breaking the suites again.
 * ==========================================================================*/
import { readFileSync, readdirSync, existsSync } from 'node:fs';

/** index.html + css/intmap.css + every js/*.js, concatenated. */
export function appSource(root) {
  const parts = [readFileSync(new URL('index.html', root), 'utf8')];

  const css = new URL('css/intmap.css', root);
  if (existsSync(css)) parts.push(readFileSync(css, 'utf8'));

  const jsDir = new URL('js/', root);
  if (existsSync(jsDir)) {
    for (const f of readdirSync(jsDir).filter((f) => f.endsWith('.js')).sort()) {
      parts.push(readFileSync(new URL(f, jsDir), 'utf8'));
    }
  }
  return parts.join('\n');
}
