#!/usr/bin/env node
/* ============================================================================
 *  IntMap · scripts/site-url.mjs — the production address, for everything that cannot import it
 * ----------------------------------------------------------------------------
 *  (domain-portable) The address is written ONCE, in supabase/functions/_shared/site-origin.js. This
 *  file is that value's door for the readers that are not JavaScript modules, and the rule that keeps
 *  it the only place:
 *
 *    node scripts/site-url.mjs                     the site's URL (what a reader opens)
 *    node scripts/site-url.mjs --origin|--host|--base|--cname|--pages-host
 *    node scripts/site-url.mjs --github-output     url= origin= cname= into $GITHUB_OUTPUT (workflows)
 *    node scripts/site-url.mjs --pages-agrees <u>  exit 1 unless GitHub's own page_url is the site's URL
 *    node scripts/site-url.mjs --write             re-render every `[site:<path>]: <url>` line
 *    node scripts/site-url.mjs --check             the spelling rule below (check:static runs it)
 *
 *  ── THE SPELLING RULE ─────────────────────────────────────────────────────────────────────
 *  The host of the site (and the Pages host, which stays ours after a move) may not be spelled in
 *  any tracked file except:
 *    · site-origin.js itself — it is the value;
 *    · dev-notes/ and DEV-NOTES-ARCHIVE.md — a record of what was measured on the address of that
 *      day. Rewriting it to today's address would make the record say something that did not happen,
 *      and those files are append-only history (AGENTS.md §9);
 *    · a RENDERED line of the form `[site:<path>]: <url>` whose url is exactly siteUrl(<path>). That
 *      is a Markdown reference-link definition — the one place a document read on GitHub (README,
 *      AGENTS.md, an agent's role sheet) needs the address as text — and `--write` rewrites every one
 *      of them from the value, so a definition can never hold anything but today's address. A stale
 *      one (the value moved, `--write` was not run) is refused like any other spelling.
 *  ⚠ The rule is on the FACT (the host appears), not on a list of files: a new file that spells the
 *  address is caught the day it is added.
 *
 *  Kept to node built-ins and the one value, so a workflow can run it from a sparse checkout.
 * ==========================================================================*/
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  CUSTOM_DOMAIN, PAGES_URL, SITE_BASE_PATH, SITE_HOST, SITE_ORIGIN, SITE_URL, siteUrl,
} from '../supabase/functions/_shared/site-origin.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const CANONICAL = 'supabase/functions/_shared/site-origin.js';

/* The places the address may be written, other than a rendered definition. Each says why. */
export const EXEMPT = [
  { path: CANONICAL, why: 'the value itself' },
  { prefix: 'dev-notes/', why: 'history: what was measured on the address of that day (append-only)' },
  { path: 'DEV-NOTES-ARCHIVE.md', why: 'history: the archive before dev-notes/ (read-only)' },
];
const exempt = (rel) => EXEMPT.some((e) => (e.path ? rel === e.path : rel.startsWith(e.prefix)));

/* The hosts that must not be spelled: the site's, and the Pages one (the same host until a domain is
   set; after it, the Pages address still answers — with a redirect — and is still ours). */
export function guardedHosts() {
  return [...new Set([new URL(PAGES_URL).host, SITE_HOST].map((h) => h.toLowerCase()))];
}
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hostRe = (hosts) => new RegExp(`(?<![\\w.-])(?:${hosts.map(escapeRe).join('|')})(?![\\w-]|\\.[\\w-])`, 'i');

/* `[site:<path>]: <url>` — a Markdown reference definition. <path> is relative to the site's root. */
export const DEF_RE = /^(\s*)\[site:([^\]\s]*)\]:[ \t]+(\S+)[ \t]*$/;

/** The violations in one file's text. */
export function spellingsIn(rel, text, hosts = guardedHosts()) {
  if (exempt(rel)) return [];
  const re = hostRe(hosts);
  if (!re.test(text)) return [];
  const out = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (!re.test(line)) return;
    const def = DEF_RE.exec(line);
    if (def) {
      let want = null;
      try { want = siteUrl(def[2]); } catch { /* a root-absolute path: refused below */ }
      if (want && def[3] === want) return;
      out.push({ file: rel, line: i + 1, text: line.trim(),
        why: want ? `a stale [site:] definition — run \`node scripts/site-url.mjs --write\` (it should read ${want})`
          : 'a [site:] path must be relative to the site (no leading slash)' });
      return;
    }
    out.push({ file: rel, line: i + 1, text: line.trim(),
      why: `the production address is spelled by hand — derive it from ${CANONICAL} (or a [site:<path>] definition in a document)` });
  });
  return out;
}

/* The tracked files as text. Binary files (a NUL in the first 8 KB) are not read past that. */
function trackedText(root = ROOT) {
  const names = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20 })
    .split('\0').filter(Boolean);
  const out = [];
  for (const rel of names) {
    let buf;
    try { buf = readFileSync(join(root, rel)); } catch { continue; }   // deleted in the work tree
    if (buf.subarray(0, 8192).includes(0)) continue;
    out.push({ rel, text: buf.toString('utf8') });
  }
  return out;
}

/** Every violation in the tracked tree. */
export function siteSpellings(root = ROOT) {
  const hosts = guardedHosts();
  return trackedText(root).flatMap(({ rel, text }) => spellingsIn(rel, text, hosts));
}

/** Re-render the `[site:<path>]: <url>` lines of one text. Returns the new text. */
export function renderDefinitions(text) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  return text.split(/\r?\n/).map((line) => {
    const m = DEF_RE.exec(line);
    return m ? `${m[1]}[site:${m[2]}]: ${siteUrl(m[2])}` : line;
  }).join(eol);
}

/** `--write`: re-render every definition in the tracked tree. Returns the files it changed. */
export function writeDefinitions(root = ROOT) {
  const changed = [];
  for (const { rel, text } of trackedText(root)) {
    if (exempt(rel) || !text.includes('[site:')) continue;
    const next = renderDefinitions(text);
    if (next !== text) { writeFileSync(join(root, rel), next); changed.push(rel); }
  }
  return changed;
}

/* ── the build ───────────────────────────────────────────────────────────────────────────── */

/* index.html's social card needs an ABSOLUTE address (a crawler has no base to resolve against), so
   the source carries this token and the build writes the address in.
   (landing-showcase) …and so do the pages vite.config.js COPIES rather than bundles — the landing and
   teacher pages, the share pages and sitemap.xml / robots.txt that scripts/landing.mjs generates carry the
   same token in their canonical, hreflang, og:* and <loc>. transformIndexHtml never sees a copied file,
   so the plugin also fills the token in every copied .html / .xml / .txt in dist/ once the copy is done
   (fillSiteToken). The day the site moves, those pages follow without being regenerated. */
export const SITE_TOKEN = '__INTMAP_SITE_URL__';

/** Vite plugin: fill SITE_TOKEN in index.html, and — when the site has a domain of its own — emit
 *  dist/CNAME. ⚠ The CNAME file is NOT what binds the domain: this repository publishes with a custom
 *  GitHub Actions workflow, and for that source GitHub «ignores any existing CNAME file» (docs.github.com,
 *  «Managing a custom domain for your GitHub Pages site», read 2026-10-01). The binding is the Pages
 *  setting (`cname`), which the workflows compare against this value after every publish
 *  (`--pages-agrees`). The file is still emitted so the artifact says which domain it was built for,
 *  and so a branch-published copy (the fallback docs/RELEASE.md describes) would carry it. */
/* the text files a static copy can carry the token in. The directories that hold only bundled code or
   data payloads are not walked: nothing generated by this repository with the token is written there. */
const TOKEN_FILE = /.(html|xml|txt)$/i;
const TOKEN_SKIP = new Set(['assets', 'data', 'fonts', 'katex', 'cesium']);
/** Fill SITE_TOKEN in every .html / .xml / .txt under `dir` (recursively). Returns the files it changed. */
export function fillSiteToken(dir, url = SITE_URL, rel = '') {
  const changed = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name), r = rel + e.name;
    if (e.isDirectory()) { if (!(rel === '' && TOKEN_SKIP.has(e.name))) changed.push(...fillSiteToken(p, url, r + '/')); continue; }
    if (!e.isFile() || !TOKEN_FILE.test(e.name)) continue;
    const t = readFileSync(p, 'utf8');
    if (!t.includes(SITE_TOKEN)) continue;
    writeFileSync(p, t.split(SITE_TOKEN).join(url));
    changed.push(r);
  }
  return changed;
}

export function siteUrlPlugin(site = { SITE_URL, CUSTOM_DOMAIN }) {   // the argument exists for the tests
  let outDir = null;
  return {
    name: 'intmap-site-url',
    configResolved(c) { try { outDir = resolve(c.root, c.build.outDir); } catch (_) { outDir = null; } },
    /* after every other plugin's closeBundle — the static copy (vite.config.js copyStatic) writes the pages */
    closeBundle: { order: 'post', sequential: true, handler() { if (outDir) fillSiteToken(outDir, site.SITE_URL); } },
    transformIndexHtml: {
      order: 'pre',
      handler(html) { return html.includes(SITE_TOKEN) ? html.split(SITE_TOKEN).join(site.SITE_URL) : html; },
    },
    generateBundle() {
      if (site.CUSTOM_DOMAIN) this.emitFile({ type: 'asset', fileName: 'CNAME', source: site.CUSTOM_DOMAIN + '\n' });
    },
  };
}

/* ── the CLI ─────────────────────────────────────────────────────────────────────────────── */

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  const argv = process.argv.slice(2);
  const has = (f) => argv.includes(f);
  if (has('--check')) {
    const bad = siteSpellings();
    for (const b of bad) console.error(`${b.file}:${b.line}: ${b.why}\n    ${b.text.slice(0, 200)}`);
    console.log(bad.length ? `site-url: ${bad.length} spelling(s) of the production address outside ${CANONICAL}`
      : `site-url: the production address (${SITE_URL}) is written only in ${CANONICAL}`);
    process.exit(bad.length ? 1 : 0);
  } else if (has('--write')) {
    const changed = writeDefinitions();
    console.log(changed.length ? `re-rendered: ${changed.join(', ')}` : 'every [site:] definition already reads ' + SITE_URL);
  } else if (has('--github-output')) {
    const out = process.env.GITHUB_OUTPUT;
    const body = `url=${SITE_URL}\norigin=${SITE_ORIGIN}\ncname=${CUSTOM_DOMAIN}\n`;
    if (out) appendFileSync(out, body); else process.stdout.write(body);
  } else if (has('--pages-agrees')) {
    const got = String(argv[argv.indexOf('--pages-agrees') + 1] || '');
    if (!got) { console.log('site-url: no page_url to compare (nothing was published this run)'); process.exit(0); }
    if (got === SITE_URL) { console.log(`site-url: GitHub Pages serves the site at ${got}, as ${CANONICAL} says`); process.exit(0); }
    console.error(`::error::GitHub Pages says the site is at ${got}, ${CANONICAL} says ${SITE_URL}. `
      + 'The Pages custom-domain setting and CUSTOM_DOMAIN disagree — see docs/RELEASE.md «Moving the site to its own domain».');
    process.exit(1);
  } else if (has('--origin')) console.log(SITE_ORIGIN);
  else if (has('--host')) console.log(SITE_HOST);
  else if (has('--pages-host')) console.log(new URL(PAGES_URL).host);   // the DNS target of a custom domain
  else if (has('--base')) console.log(SITE_BASE_PATH);
  else if (has('--cname')) console.log(CUSTOM_DOMAIN);
  else console.log(SITE_URL);
}
