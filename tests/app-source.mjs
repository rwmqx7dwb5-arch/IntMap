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

/**
 * (#R175) THE PAGE — what `index.html` alone used to be.
 *
 * Every split suite from #R162 to #R174 asks its questions of "the page": does it load each module,
 * does it instantiate each factory, does IM_HOST expose that value as a live getter. Until this round
 * the page was one file. The Vite migration split it into three, none of which lost anything:
 *
 *   index.html      the markup, the head, the one module tag
 *   src/main.js     the loader — what the fifty-eight <script src> tags used to be
 *   js/app-body.js  the program — the DOMContentLoaded closure that WAS the bottom of index.html
 *
 * So those suites read this instead of `index.html`. Not a loosening: pointed at the new index.html
 * they would all pass vacuously (it no longer contains the code they assert about), and a whole
 * generation of split invariants would go quiet in exactly the way they were written to prevent.
 */
/*
 * (#R178) …and FOUR files now. js/geo-engine.js is the renderer adapter plus the IntMapGeoEngine
 * facade, moved verbatim out of js/app-body.js this round: it had been created inside
 * `map.on('load', …)`, so it did not exist when the modules — now written entirely against it — run
 * their factories at import time. Nothing about it is a module in the js/ sense; it is a piece of the
 * page's own program that happens to live in its own file, exactly as app-body.js is. Leaving it out
 * would quietly retire every engine-contract invariant from #R152 onward.
 */
export function appShell(root) {
  const parts = [];
  for (const rel of ['index.html', 'src/main.js', 'src/vendor.js', 'js/app-body.js', 'js/geo-engine.js']) {
    const u = new URL(rel, root);
    if (existsSync(u)) parts.push(readFileSync(u, 'utf8'));
  }
  return parts.join('\n');
}

/** index.html + css/intmap.css + every js/*.js + src/*.js, concatenated. */
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
  /* (#R175) …and src/, the Vite entry. Code left index.html again this round — the Supabase client
     creation and the required-module guard are in src/vendor.js and src/main.js now — so a source
     assertion that only looked at index.html + js/ would silently stop covering them. */
  const srcDir = new URL('src/', root);
  if (existsSync(srcDir)) {
    for (const f of readdirSync(srcDir).filter((f) => f.endsWith('.js')).sort()) {
      parts.push(readFileSync(new URL(f, srcDir), 'utf8'));
    }
  }
  return parts.join('\n');
}
