/* ============================================================================
 *  IntMap · THE PAGES' SCRIPT POLICY WITHOUT 'unsafe-inline'  (csp-without-inline)
 * ----------------------------------------------------------------------------
 *  THE DEFECT THIS EXISTS FOR. index.html and admin.html carried `'unsafe-inline'` in script-src, and
 *  the twelve other pages GitHub Pages serves (about, teachers, the share pages, privacy, terms,
 *  science, sources, in English and Japanese) carried no policy at all. With `'unsafe-inline'` an
 *  injected `<img src=x onerror=…>` — the shape output-encoding exists to stop — runs if one escape is
 *  ever missed; the policy was there as the second line and the second line was open.
 *
 *  WHAT A PAGE NOW SAYS. Its inline <script> elements are admitted ONE BY ONE, by the sha256 of their
 *  text (`'sha256-…'` in script-src); nothing else written inline runs. ⚠ Not a nonce: a nonce must be
 *  new for every response, and GitHub Pages serves the same bytes to everyone (no server, no headers —
 *  docs/SECURITY-ARCHITECTURE.md §6), so a nonce in a static file is a constant anyone can read and
 *  reuse. A hash names the script's own text, which is exactly what a static page can promise.
 *
 *  WHO WRITES THE HASHES — derived, never typed:
 *    · the pages copied verbatim (admin, the reading pages, the landing pages) hold them in the source:
 *      `node scripts/csp.mjs --write` writes them, and scripts/landing.mjs writes the pages it generates;
 *    · index.html's inline scripts carry the build stamp, so their text is only final AFTER the build
 *      has filled it in: cspHashesPlugin() below rewrites the policy as the LAST transformIndexHtml
 *      step (order 'post', dev and build), and again over every page in dist/ when the build closes, so
 *      a page whose text the build changed (the site-URL token) is never shipped with a stale hash.
 *
 *  THE RULE (`npm run check:static`, scriptPolicyProblems):
 *    ⑴ every served HTML document has a CSP <meta> with a script-src;
 *    ⑵ no script-src carries 'unsafe-inline' (or 'unsafe-hashes', which would re-admit attributes);
 *    ⑶ the page's sha256 sources are EXACTLY the hashes of its inline scripts — a missing one is a
 *      script the browser will refuse, an extra one is a permission for text that is no longer there;
 *    ⑷ no inline event attribute (`onclick="…"`, `onerror=…`) anywhere in the served code: not in the
 *      markup and not in a string or template that builds markup. The way to run code from markup is
 *      js/inline-actions.js — `data-im-click="name"` — and
 *    ⑸ every action name written in served code is declared in js/inline-actions.js ACTIONS, and every
 *      declared one is written somewhere; a name must be literal (an interpolated name cannot be
 *      checked, so it is refused rather than trusted).
 *
 *  ⚠ THE BROWSER NORMALISES BEFORE IT HASHES. The HTML tokenizer turns CR LF and a lone CR into LF
 *  before a script's text exists, so the hash is taken over that text — the same on a CRLF checkout
 *  (this machine) and an LF one (the CI runner that builds production).
 * ==========================================================================*/
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { codeOnly } from './code-only.mjs';

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), '..'));

/* ── reading a page ───────────────────────────────────────────────────────────────────────── */

/** script types the browser EXECUTES (and so script-src governs); a data block (ld+json) is not code. */
const JS_TYPES = new Set(['', 'module', 'importmap', 'text/javascript', 'application/javascript',
  'application/ecmascript', 'text/ecmascript', 'application/x-javascript', 'text/jscript']);

/**
 * The inline scripts of an HTML document, as the parser sees them: `<!-- -->` outside a script is a
 * comment (index.html's comments mention «<script>»), and a script's text runs to its first
 * `</script`. Returns [{ text, type, start }] for executable inline scripts only.
 */
export function inlineScripts(html) {
  const s = String(html);
  const out = [];
  let i = 0;
  const lower = s.toLowerCase();
  while (i < s.length) {
    const c = lower.indexOf('<!--', i), t = lower.indexOf('<script', i);
    if (t < 0) break;
    if (c >= 0 && c < t) { const e = s.indexOf('-->', c + 4); i = e < 0 ? s.length : e + 3; continue; }
    const after = lower[t + 7];
    if (after && !/[\s>\/]/.test(after)) { i = t + 7; continue; }   // <scripts>, <script-x>: not the element
    const gt = s.indexOf('>', t);
    if (gt < 0) break;
    const attrs = s.slice(t + 7, gt);
    const end = lower.indexOf('</script', gt + 1);
    const text = s.slice(gt + 1, end < 0 ? s.length : end);
    i = end < 0 ? s.length : end + 8;
    if (/\ssrc\s*=/i.test(' ' + attrs)) continue;
    const tm = /\stype\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(' ' + attrs);
    const type = tm ? String(tm[1] ?? tm[2] ?? tm[3]).trim().toLowerCase() : '';
    if (!JS_TYPES.has(type)) continue;
    out.push({ text, type, start: t });
  }
  return out;
}

/** The CSP source that admits exactly this script text.
    ⚠ This SHA-256 is what CSP Level 2 «hash-source» is defined as (the browser computes the same digest over the inline
    script and compares). It is an identity of PUBLIC page text, not a stored credential, so a slow password hash would
    be wrong here — the browser would never match it. */
export function scriptHash(text) {
  const normalised = String(text).replace(/\r\n?/g, '\n');
  return "'sha256-" + createHash('sha256').update(normalised, 'utf8').digest('base64') + "'";
}

const META_RE = /(<meta[^>]+http-equiv=["']Content-Security-Policy["'][^>]*content=")([^"]*)(")/i;

/** The page's policy as [[directive, ...sources]], or null. */
export function readPolicy(html) {
  const m = META_RE.exec(String(html));
  if (!m) return null;
  return m[2].split(';').map((d) => d.trim()).filter(Boolean).map((d) => d.split(/\s+/));
}

/** The page with its script-src sha256 sources replaced by the hashes of its inline scripts. */
export function withInlineHashes(html) {
  const s = String(html);
  const m = META_RE.exec(s);
  if (!m) return s;
  const hashes = [...new Set(inlineScripts(s).map((x) => scriptHash(x.text)))];
  const dirs = m[2].split(';').map((d) => d.trim()).filter(Boolean).map((d) => {
    const parts = d.split(/\s+/);
    if (parts[0].toLowerCase() !== 'script-src') return d;
    const kept = parts.slice(1).filter((p) => !/^'sha(256|384|512)-/.test(p));
    const at = kept.indexOf("'self'") + 1;                   // right after 'self', where a reader looks
    kept.splice(at, 0, ...hashes);
    return ['script-src', ...kept].join(' ');
  });
  const content = dirs.join('; ');
  return s.slice(0, m.index) + m[1] + content + m[3] + s.slice(m.index + m[0].length);
}

/* ── the served pages ─────────────────────────────────────────────────────────────────────── */

/** A served file that is an HTML DOCUMENT (has a <head>) — Search Console's one-line token file is not. */
const isDocument = (text) => /<head[\s>]/i.test(String(text));

/** Problems ⑴–⑶ for one page. */
export function pagePolicyProblems(rel, html) {
  const problems = [];
  if (!isDocument(html)) return problems;
  const pol = readPolicy(html);
  if (!pol) return [`${rel}: an HTML page with no Content-Security-Policy <meta> — every served page states its script policy`];
  const script = pol.find((d) => d[0].toLowerCase() === 'script-src');
  if (!script) return [`${rel}: the CSP has no script-src (default-src alone would refuse its inline scripts without saying why)`];
  for (const bad of ["'unsafe-inline'", "'unsafe-hashes'"]) {
    if (script.includes(bad)) problems.push(`${rel}: script-src carries ${bad} — inline code is admitted by the hash of each <script>, never wholesale (scripts/csp.mjs)`);
  }
  const want = new Set(inlineScripts(html).map((x) => scriptHash(x.text)));
  const have = new Set(script.filter((p) => /^'sha(256|384|512)-/.test(p)));
  for (const h of want) if (!have.has(h)) problems.push(`${rel}: an inline <script> whose hash ${h} is not in script-src — the browser will refuse it (node scripts/csp.mjs --write, or the generator that writes this page)`);
  for (const h of have) if (!want.has(h)) problems.push(`${rel}: script-src admits ${h}, which no inline <script> on the page has — a permission for text that is gone`);
  return problems;
}

/* ── inline event attributes and named actions ───────────────────────────────────────────────── */

/* An event attribute: whitespace, a quote or `<…` before it, `on` + letters, `=`, and a value. It is
   counted where it is MARKUP: in an HTML file outside its scripts, or inside a JS string/template. */
const ATTR_RE = /(^|[\s"'`\/])(on[a-z]{3,})\s*=\s*(?=["'`\\\w$])/gi;
const ACTION_RE = /data-im-(click|change|error)\s*=\s*(\\?["'])([^"'\\]*)\2?/g;

/** Positions inside JS string / template text, as a predicate over offsets of `codeOnly(src,{offsets})`. */
function literalMask(src) {
  const kept = codeOnly(src, { offsets: true });
  const blanked = codeOnly(src, { literals: 'blank' });
  return { text: kept, inLiteral: (i) => kept[i] !== blanked[i] };
}

/** Line number of an offset, by binary search over the line starts (data/ holds bundles of tens of MB). */
function liner(s) {
  const starts = [0];
  for (let i = s.indexOf('\n'); i >= 0; i = s.indexOf('\n', i + 1)) starts.push(i + 1);
  return (i) => {
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= i) lo = mid; else hi = mid - 1; }
    return lo + 1;
  };
}
/* The cheap first look: a file with no `on…=` anywhere holds no attribute (most of data/ does not), and
   the comment/literal scan of a 20 MB bundle is not paid for nothing. */
const MAYBE_ATTR = /(?:^|[\s"'`/])on[a-z]{3,}\s*=/i;

/** [{rel, line, attr}] — every inline event attribute in a served file. */
export function inlineAttributeSites(rel, text) {
  const sites = [];
  if (!MAYBE_ATTR.test(text)) return sites;
  const lineOf = (s, i) => liner(s)(i);
  const scanJs = (src, base, lineBase) => {
    if (!MAYBE_ATTR.test(src)) return;
    let m; const { text: t, inLiteral } = literalMask(src);
    const line = liner(t);
    ATTR_RE.lastIndex = 0;
    while ((m = ATTR_RE.exec(t))) {
      const at = m.index + m[1].length;
      if (inLiteral(at)) sites.push({ rel, line: lineBase + line(at) - 1, attr: m[2].toLowerCase() });
    }
  };
  if (/\.html?$/i.test(rel)) {
    const html = codeOnly(text, { lang: 'html', offsets: true });
    /* the markup outside scripts */
    let markup = html;
    for (const sc of inlineScripts(html)) {
      const from = html.indexOf('>', sc.start) + 1;
      markup = markup.slice(0, from) + sc.text.replace(/[^\n]/g, ' ') + markup.slice(from + sc.text.length);
      scanJs(sc.text, from, lineOf(html, from));
    }
    /* a tag's attribute — `<x … onclick=` — in the markup itself */
    const TAG_ATTR = /<[a-z][^>]*?\s(on[a-z]{3,})\s*=/gi;
    let m;
    while ((m = TAG_ATTR.exec(markup))) sites.push({ rel, line: lineOf(markup, m.index), attr: m[1].toLowerCase() });
  } else if (/\.(m?js|cjs)$/i.test(rel)) scanJs(text, 0, 1);
  return sites;
}

/** [{rel, line, event, name}] — every named action written in a served file. */
export function actionSites(rel, text) {
  const out = [];
  if (!/\.(m?js|cjs|html?)$/i.test(rel) || !String(text).includes('data-im-')) return out;
  const t =/\.html?$/i.test(rel) ? codeOnly(text, { lang: 'html', offsets: true }) : codeOnly(text, { offsets: true });
  let m;
  ACTION_RE.lastIndex = 0;
  const line = liner(t);
  while ((m = ACTION_RE.exec(t))) out.push({ rel, line: line(m.index), event: m[1], name: m[3] });
  return out;
}

/**
 * Problems ⑴–⑸ over the served files ([{rel, text}] — scripts/runtime-scripts.mjs collectServed) and
 * the declared vocabulary ({ name: { on } } — js/inline-actions.js ACTIONS).
 */
export function scriptPolicyProblems(files, actions) {
  const problems = [];
  const DECLARER = 'js/inline-actions.js';
  const used = new Map();
  for (const f of files) {
    if (/\.html?$/i.test(f.rel)) problems.push(...pagePolicyProblems(f.rel, f.text));
    for (const s of inlineAttributeSites(f.rel, f.text)) {
      problems.push(`${s.rel}:${s.line}: inline event attribute ${s.attr}= — the page's CSP refuses it; name an action instead (data-im-${s.attr.slice(2)}="…", declared in ${DECLARER})`);
    }
    if (f.rel === DECLARER) continue;
    for (const a of actionSites(f.rel, f.text)) {
      if (!a.name || /[$+{}]/.test(a.name)) { problems.push(`${a.rel}:${a.line}: data-im-${a.event} names its action by an expression — write the name literally so it can be checked against ${DECLARER}`); continue; }
      const d = Object.prototype.hasOwnProperty.call(actions, a.name) ? actions[a.name] : null;
      if (!d) problems.push(`${a.rel}:${a.line}: data-im-${a.event}="${a.name}" is not declared in ${DECLARER} ACTIONS — the listener would refuse it`);
      else if (d.on !== a.event) problems.push(`${a.rel}:${a.line}: data-im-${a.event}="${a.name}" — ${DECLARER} declares that action for ${d.on}, not ${a.event}`);
      used.set(a.name, (used.get(a.name) || 0) + 1);
    }
  }
  for (const name of Object.keys(actions)) {
    if (!used.has(name)) problems.push(`${DECLARER}: ACTIONS.${name} is declared and written nowhere in the served code — remove it (a name nothing uses is vocabulary an injection could reach)`);
  }
  return problems;
}

/** The declared vocabulary, read by evaluating the module (no window in Node, so it installs nothing). */
export async function declaredActions(root = ROOT) {
  const mod = await import(pathToFileURL(join(root, 'js', 'inline-actions.js')).href);
  return mod.ACTIONS;
}

/* ── the build ────────────────────────────────────────────────────────────────────────────── */

function htmlFilesUnder(dir) {
  const out = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) out.push(...htmlFilesUnder(p));
    else if (n.endsWith('.html')) out.push(p);
  }
  return out;
}

/** Vite plugin: index.html's policy is final only after every other transform (the build stamp). */
export function cspHashesPlugin() {
  let outDir = null;
  return {
    name: 'intmap-csp-hashes',
    configResolved(c) { try { outDir = resolve(c.root, c.build.outDir); } catch (_) { outDir = null; } },
    transformIndexHtml: { order: 'post', handler: (html) => withInlineHashes(html) },
    /* after copyStatic and the site-URL fill (both closeBundle, both earlier in the plugin list): every
       page in dist/ gets the hashes of the text it actually ships, and the build stops if one still
       admits inline code wholesale. */
    closeBundle: {
      order: 'post',
      sequential: true,
      handler() {
        if (!outDir || !existsSync(outDir)) return;
        const bad = [];
        for (const p of htmlFilesUnder(outDir)) {
          const t = readFileSync(p, 'utf8');
          const w = withInlineHashes(t);
          if (w !== t) writeFileSync(p, w);
          bad.push(...pagePolicyProblems(relative(outDir, p).replace(/\\/g, '/'), w));
        }
        if (bad.length) throw new Error('CSP: ' + bad.join('\n'));
      },
    },
  };
}

/* ── the CLI ──────────────────────────────────────────────────────────────────────────────── */

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  const { collectServed } = await import('./runtime-scripts.mjs');
  const files = collectServed(ROOT);
  if (process.argv.includes('--write')) {
    let n = 0;
    for (const f of files) {
      if (!/\.html?$/i.test(f.rel) || !isDocument(f.text)) continue;
      const w = withInlineHashes(f.text);
      if (w !== f.text) { writeFileSync(join(ROOT, f.rel), w); n++; console.log('wrote ' + f.rel); }
    }
    console.log(n ? `${n} page(s) rewritten` : 'every page already admits exactly its inline scripts');
  } else {
    const problems = scriptPolicyProblems(files, await declaredActions());
    for (const p of problems) console.log('  ✗ ' + p);
    console.log(problems.length ? `${problems.length} problem(s)` : 'ok: every served page admits its inline scripts by hash, and no inline event attribute is served');
    process.exitCode = problems.length ? 1 : 0;
  }
}
