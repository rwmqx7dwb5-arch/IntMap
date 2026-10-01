/* ============================================================================
 *  IntMap · scripts/app-shell.mjs — WHAT THE APP NEEDS TO OPEN, AS THE BUILD KNOWS IT   (installable-app)
 * ----------------------------------------------------------------------------
 *  sw.js can keep a copy of the application itself so that an installed IntMap opens without a
 *  network. It needs the list of files that is — and every one of them except the manifest carries a
 *  content hash in its name that changes on every build, so a list written by hand would be wrong
 *  the first time anything changed (.agents/rules/no-ad-hoc-hardcoding.md §2-4: a list is discovered).
 *
 *  The list is DERIVED from what the build already measured:
 *    · the EAGER set scripts/build-report.mjs computes from the finished module graph — the entry,
 *      everything it statically imports, the stylesheets they pull in and the workers the boot
 *      starts (the same set check:perf budgets, so «what opens the app» and «what the app costs to
 *      open» are one definition);
 *    · what dist/index.html itself names (its manifest, its icons — and anything it links that the
 *      graph does not own);
 *    · what the manifest names (its icons);
 *    · what the eager stylesheets name with url() (the typeface the first frame is drawn in).
 *  A file is IMMUTABLE when the bundler emitted it (its name is its content); everything else is
 *  revalidated by the worker on use.
 *
 *  `injectAppShell` writes the list and the build stamp into dist/sw.js in place of the token sw.js
 *  carries, so a worker that was never built caches no shell at all, and every build is a new worker
 *  — which is what makes the browser install it and drop the previous build's shell (#R16).
 * ==========================================================================*/
import { existsSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, posix } from 'node:path';
import { STAMP_RE } from './build-stamp.mjs';

export const SHELL_TOKEN_RE = /\/\*__INTMAP_APP_SHELL__\*\/[\s\S]*?\/\*__INTMAP_APP_SHELL_END__\*\//;

/* same-origin, relative references only: an absolute URL, a data: URI or a fragment is not a file of this site */
const localRef = (u) => u && !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(u) && !u.startsWith('/');
const clean = (u) => u.split('#')[0].split('?')[0];

/** Every `src`/`href` a built HTML document names, relative to the document. */
export function htmlRefs(html) {
  const out = [];
  for (const m of html.matchAll(/<(?:script|link|img)\b[^>]*?\s(?:src|href)\s*=\s*"([^"]+)"/gi)) if (localRef(m[1])) out.push(posix.normalize(clean(m[1])));   /* './assets/x' and 'assets/x' are one file */
  return out;
}
/** Every url(...) a stylesheet names, resolved against the stylesheet's own directory. */
export function cssRefs(css, cssPath) {
  const dir = posix.dirname(cssPath);
  const out = [];
  for (const m of css.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)) if (localRef(m[2])) out.push(posix.normalize(posix.join(dir, clean(m[2]))));
  return out;
}

/**
 * The shell, from a built dist/ and the build report.
 * @returns {{ build: string, immutable: string[], mutable: string[], bytes: number }}
 */
export function appShellFiles(dist, report) {
  const html = readFileSync(join(dist, 'index.html'), 'utf8');
  const stamp = /window\.INTMAP_BUILD='([^']+)'/.exec(html);
  if (!stamp || !STAMP_RE.test(stamp[1])) throw new Error('app-shell: dist/index.html carries no build stamp — the shell would have no version (scripts/build-stamp.mjs)');
  const bundled = new Set([...Object.keys(report.chunks || {}), ...Object.keys(report.assets || {})]);
  const eager = report.eager || {};
  const want = new Set([...(eager.chunks || []), ...((eager.css && eager.css.files) || []), ...((eager.workers && eager.workers.files) || [])]);
  for (const r of htmlRefs(html)) want.add(r);
  /* the manifest the document links, and what IT names */
  for (const r of [...want]) {
    if (!/\.webmanifest$/.test(r) || !existsSync(join(dist, r))) continue;
    const mf = JSON.parse(readFileSync(join(dist, r), 'utf8'));
    for (const ic of mf.icons || []) if (localRef(ic.src)) want.add(posix.normalize(posix.join(posix.dirname(r), clean(ic.src))));
  }
  /* what the eager stylesheets draw the first frame with */
  for (const r of [...want]) if (/\.css$/.test(r) && existsSync(join(dist, r))) for (const c of cssRefs(readFileSync(join(dist, r), 'utf8'), r)) want.add(c);
  const missing = [...want].filter((f) => !existsSync(join(dist, f)));
  if (missing.length) throw new Error('app-shell: the shell names files the build did not produce: ' + missing.join(', '));
  const all = [...want].sort();
  return {
    build: stamp[1],
    immutable: all.filter((f) => bundled.has(f)),
    mutable: all.filter((f) => !bundled.has(f)),
    bytes: all.reduce((n, f) => n + statSync(join(dist, f)).size, 0),
  };
}

/** Write the shell into dist/sw.js in place of the token. Throws when the token is not there. */
export function injectAppShell(dist, report) {
  const shell = appShellFiles(dist, report);
  const swPath = join(dist, 'sw.js');
  const sw = readFileSync(swPath, 'utf8');
  if (!SHELL_TOKEN_RE.test(sw)) throw new Error('app-shell: dist/sw.js has no /*__INTMAP_APP_SHELL__*/ token — the worker would ship without its shell list');
  const literal = JSON.stringify({ build: shell.build, immutable: shell.immutable, mutable: shell.mutable });
  writeFileSync(swPath, sw.replace(SHELL_TOKEN_RE, () => '/*__INTMAP_APP_SHELL__*/' + literal + '/*__INTMAP_APP_SHELL_END__*/'));
  return shell;
}
