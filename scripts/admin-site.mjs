#!/usr/bin/env node
/* ============================================================================
 *  IntMap · scripts/admin-site.mjs — THE OPERATOR CONSOLE AS A SITE OF ITS OWN
 * ----------------------------------------------------------------------------
 *  WHY. The console (admin.html and the pages beside it) used to be published inside the app's
 *  own Pages site: same origin, same localStorage key. An XSS anywhere in the app could read an
 *  administrator's session (docs/SECURITY-ARCHITECTURE.md §8 item 20). The console is now built
 *  from this repository into a separate directory and published by the `intmap-admin`
 *  organisation's Pages site (ADMIN_URL in supabase/functions/_shared/site-origin.js) — a
 *  different origin and, github.io being a public suffix, a different site. The app's own build
 *  (vite.config.js) leaves the console out and puts a pointer page at each old address.
 *
 *  WHAT IS A CONSOLE PAGE — DISCOVERED, NOT LISTED. A root .html file that loads
 *  js/admin-auth.js, the console's one sign-in path (an MFA session in sessionStorage). A page
 *  that does not sign in through it is not a console page and stays with the app; a new console
 *  page joins the moment it loads that script. What each page needs is discovered too: every
 *  relative src/href it names, and every relative import / import() in the scripts it loads,
 *  followed to the end. A link to a page that is NOT a console page (the public corrections log,
 *  the app) is rewritten to that page's absolute address on the app's site.
 *
 *  USAGE
 *    node scripts/admin-site.mjs --list            the console pages and every file they need
 *    node scripts/admin-site.mjs --out <dir>       write the site into <dir> (emptied first)
 *         [--source <sha>]                         record which commit it was built from
 *  The reusable workflow .github/workflows/admin-site.yml runs the second form.
 * ============================================================================ */
import { readFileSync, writeFileSync, existsSync, mkdirSync, cpSync, rmSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ADMIN_URL, SITE_ORIGIN, SITE_URL, siteUrl } from '../supabase/functions/_shared/site-origin.js';
import { SITE_TOKEN } from './site-url.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, '..');

/* the console's sign-in module: loading it is what makes a page a console page */
export const CONSOLE_AUTH = 'js/admin-auth.js';
/* the SDK the console pages load by this path; it is not in the repository — it is the UMD build of the
   pinned @supabase/supabase-js (package-lock.json decides the version), as vite.config.js copies it today */
export const SDK_PATH = 'vendor/supabase-js.js';
export const sdkSource = (root = ROOT) => join(root, 'node_modules', '@supabase', 'supabase-js', 'dist', 'umd', 'supabase.js');

const rel = (root, p) => relative(root, p).split('\\').join('/');
/* a reference a script builds at run time (`href="${x}"`, `'+url+'`) names no file and is not followed */
const isBuilt = (u) => /\$\{|['"]\s*\+|\+\s*['"]/.test(u);
const isLocalRef = (u) => !!u && !isBuilt(u) && !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#|\?)/i.test(u) && !u.startsWith('/');
const strip = (u) => u.split('#')[0].split('?')[0];

/** Root .html files that load the console's sign-in module. */
export function consolePages(root = ROOT) {
  return readdirSync(root)
    .filter((f) => f.endsWith('.html') && statSync(join(root, f)).isFile())
    .filter((f) => htmlRefs(readFileSync(join(root, f), 'utf8')).some((r) => posix.normalize(strip(r)) === CONSOLE_AUTH))
    .sort();
}

/** Every src= / href= value in a page (scripts, styles, icons, links). */
export function htmlRefs(html) {
  const out = [];
  for (const m of String(html).matchAll(/\s(?:src|href)\s*=\s*(["'])(.*?)\1/gi)) out.push(m[2]);
  return out;
}

/** Every relative module specifier in a script: static import/export … from, and import(). */
export function jsRefs(code) {
  const out = [];
  const s = String(code);
  for (const m of s.matchAll(/\b(?:import|export)\s[^'";]*?\bfrom\s*(["'])(\.{1,2}\/[^'"]+)\1/g)) out.push(m[2]);
  for (const m of s.matchAll(/\bimport\s*\(\s*(["'])(\.{1,2}\/[^'"]+)\1\s*\)/g)) out.push(m[2]);
  for (const m of s.matchAll(/^\s*import\s*(["'])(\.{1,2}\/[^'"]+)\1/gm)) out.push(m[2]);
  return out;
}

/** The console: its pages, the files they need, and the links that leave it.
 *  @returns {{ pages: string[], files: string[], outbound: string[] }} root-relative POSIX paths */
export function consoleFiles(root = ROOT) {
  const pages = consolePages(root);
  const pageSet = new Set(pages);
  const files = new Set(pages);
  const outbound = new Set();
  const queue = [...pages];
  while (queue.length) {
    const f = queue.shift();
    const text = f === SDK_PATH ? '' : readFileSync(join(root, f), 'utf8');
    const refs = f.endsWith('.html') ? htmlRefs(text) : f.endsWith('.js') ? jsRefs(text) : [];
    for (const r of refs) {
      if (!isLocalRef(r)) continue;
      const target = posix.normalize(posix.join(posix.dirname(f), strip(r)));
      if (!target || target === '.' || target.startsWith('..')) continue;
      if (target.endsWith('.html') && !pageSet.has(target)) { outbound.add(target); continue; }
      if (files.has(target)) continue;
      if (target !== SDK_PATH && !existsSync(join(root, target))) {
        throw new Error(`admin-site: ${f} names ${r}, which is not in the repository`);
      }
      files.add(target);
      queue.push(target);
    }
  }
  return { pages, files: [...files].sort(), outbound: [...outbound].sort() };
}

/** Files reached from the app's own pages (every root .html that is NOT a console page), following the same
 *  references consoleFiles follows. */
export function appFiles(root = ROOT) {
  const consoleSet = new Set(consolePages(root));
  const start = readdirSync(root).filter((f) => f.endsWith('.html') && !consoleSet.has(f) && statSync(join(root, f)).isFile());
  const seen = new Set(start);
  const queue = [...start];
  while (queue.length) {
    const f = queue.shift();
    let text = '';
    try { text = readFileSync(join(root, f), 'utf8'); } catch (_) { continue; }
    const refs = f.endsWith('.html') ? htmlRefs(text) : /.(m?js|ts)$/.test(f) ? jsRefs(text) : [];
    for (const r of refs) {
      if (!isLocalRef(r)) continue;
      const t = posix.normalize(posix.join(posix.dirname(f), strip(r)));
      if (!t || t.startsWith('..') || seen.has(t) || !existsSync(join(root, t)) || statSync(join(root, t)).isDirectory()) continue;
      seen.add(t); queue.push(t);
    }
  }
  return seen;
}

/** The console's files that no app page needs: these must never be published on the app's origin. */
export function consoleOnlyFiles(root = ROOT) {
  const app = appFiles(root);
  return consoleFiles(root).files.filter((f) => !app.has(f));
}

/** Point a console page's links to pages that stay with the app at the app's own address. */
export function rewriteOutbound(html, fromFile, outbound) {
  return String(html).replace(/(\s(?:href)\s*=\s*)(["'])(.*?)\2/gi, (all, pre, q, u) => {
    if (!isLocalRef(u)) return all;
    const target = posix.normalize(posix.join(posix.dirname(fromFile), strip(u)));
    if (!outbound.includes(target)) return all;
    const tail = u.slice(strip(u).length);
    return `${pre}${q}${siteUrl(target)}${tail}${q}`;
  });
}

/* The console reads two kinds of the APP's own files from the app's address — the sitemap the Growth tab
   offers as link destinations, the land mask the corrections map is drawn on (each resolves them against
   <meta name="intmap-site">). On the app's origin those were 'self'; on the console's origin the app is
   another origin, so the built page's policy names it — for reading (connect-src) and images (img-src)
   only. script-src, style-src and everything else stay as the source page wrote them. */
const APP_DIRECTIVES = ['connect-src', 'img-src'];
export function allowAppOrigin(html, origin = SITE_ORIGIN) {
  return String(html).replace(/(<meta http-equiv="Content-Security-Policy" content=")([^"]*)(")/i, (all, a, csp, z) => {
    const out = csp.split(';').map((d) => {
      const t = d.trim().split(/\s+/);
      if (APP_DIRECTIVES.includes(t[0]) && !t.includes(origin)) return ' ' + [...t, origin].join(' ');
      return d;
    }).join(';');
    return a + out + z;
  });
}

/** Write the console site into `out`. */
export function buildAdminSite(out, { root = ROOT, source = '' } = {}) {
  const { pages, files, outbound } = consoleFiles(root);
  if (!pages.length) throw new Error(`admin-site: no page loads ${CONSOLE_AUTH} — nothing to publish`);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  for (const f of files) {
    const dest = join(out, f);
    mkdirSync(dirname(dest), { recursive: true });
    if (f === SDK_PATH) {
      if (!existsSync(sdkSource(root))) throw new Error('admin-site: the @supabase/supabase-js UMD build is missing — run npm ci first');
      cpSync(sdkSource(root), dest);
      continue;
    }
    if (f.endsWith('.html')) {
      const html = allowAppOrigin(rewriteOutbound(readFileSync(join(root, f), 'utf8'), f, outbound).split(SITE_TOKEN).join(SITE_URL));
      writeFileSync(dest, html);
      continue;
    }
    cpSync(join(root, f), dest);
  }
  /* the site's root answers with the console itself, not GitHub's 404 */
  const first = pages.includes('admin.html') ? 'admin.html' : pages[0];
  writeFileSync(join(out, 'index.html'), pointerPage(first, 'IntMap operator console'));
  writeFileSync(join(out, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
  writeFileSync(join(out, '.nojekyll'), '');
  writeFileSync(join(out, 'source.json'), JSON.stringify({ source: source || null, pages, site: ADMIN_URL }, null, 2) + '\n');
  return { pages, files, outbound };
}

/** A page that sends the reader to `target` and does nothing else: no script, nothing stored, nothing read.
 *  The app's build puts one at each old console address (vite.config.js), and the console site at its root. */
export function pointerPage(target, title = 'IntMap operator console') {
  const t = String(target).replace(/[&"<>]/g, (c) => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' })[c]);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<meta http-equiv="refresh" content="0; url=${t}">
<title>${title}</title>
<style>body{font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;max-width:560px;margin:15vh auto;padding:0 16px;color:#1d1d1f;background:#fff}@media (prefers-color-scheme:dark){body{color:#f5f5f7;background:#000}a{color:#4da3ff}}</style>
</head>
<body>
<p>The IntMap operator console is served from its own address: <a href="${t}">${t}</a></p>
</body>
</html>
`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const val = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
  if (argv.includes('--list')) {
    const r = consoleFiles();
    console.log(JSON.stringify(r, null, 2));
  } else if (val('--out')) {
    const out = resolve(val('--out'));
    const r = buildAdminSite(out, { source: val('--source') || '' });
    console.log(`admin-site: ${r.pages.length} page(s), ${r.files.length} file(s) → ${rel(process.cwd(), out) || '.'} (links out: ${r.outbound.join(', ') || 'none'})`);
  } else {
    console.error('usage: node scripts/admin-site.mjs --list | --out <dir> [--source <sha>]');
    process.exit(2);
  }
}
