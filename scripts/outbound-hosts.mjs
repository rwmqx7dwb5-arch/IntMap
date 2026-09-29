#!/usr/bin/env node
/* ============================================================================
 *  outbound-hosts.mjs — WHICH HOSTS DOES THE READER'S BROWSER TALK TO, AND DOES THE POLICY SAY SO
 * ----------------------------------------------------------------------------
 *  ⚠⚠⚠ THE PRIVACY POLICY HAD NEVER BEEN COMPARED WITH THE CODE IT DESCRIBES. js/legal-text.js's
 *  own header states 「IT DESCRIBES A DATA FLOW, SO IT IS A FACT ABOUT THE CODE, NOT COPY」, and
 *  Privacy §4 "Third parties" is ~16 KB of hand-written prose per language. Nothing read the two
 *  side by side. MEASURED (outbound-hosts-disclosed, 2026-09-29): of the hosts the browser code
 *  names in a string literal outside a link, 18 had neither their registered domain nor their brand
 *  anywhere in §4 or in DATA_SOURCES — among them r.jina.ai, which is sent the URL of the article
 *  the reader is reading, and api.pwnedpasswords.com, which is sent the first five hex digits of the
 *  SHA-1 of the password being chosen. Both were correct code and undisclosed recipients.
 *
 *  ══ WHAT THIS MODULE MEASURES (rule `outbound-disclosed` of `npm run check:datagov`) ══════════
 *    ① every host the browser code can request is in scripts/outbound-hosts.json
 *    ② every `disclosure` there is a substring of Privacy §4 in BOTH en and jp, read from the
 *       policy the reader is shown (js/legal-text.js evaluated, not grepped)
 *    ③ every host in the ledger is still discovered — a ledger that outlives its code excuses the
 *       next host that happens to share the name
 *
 *  ⚠ THE UNIVERSE IS DISCOVERED, NEVER LISTED ([[intmap-discovered-list-is-a-photograph]]). The
 *  files are `git ls-files` of what the browser loads (js/, src/, the root .html pages, sw.js,
 *  css/); the hosts are read by the PARSER from string and template literals only — a URL in a
 *  comment is not a request, and a regular expression over the source cannot tell the two apart.
 *
 *  ⚠ A LINK IS DECIDED BY ITS CONTEXT, NOT BY ITS HOST. The same host can be a hyperlink in one
 *  place and a fetch in another; only the occurrence is classified. The contexts recognised as
 *  「the browser does not request this by itself」 are facts of the syntax (an <a href>, an XML
 *  namespace, a window.open/location navigation, a DATA_SOURCES credit, a licence URL named by
 *  js/data-governance.js's SPELLINGS, a <meta> content, a <link rel> that fetches nothing).
 *  Everything else must be ACCOUNTED FOR in the ledger — as a request with what it sends and the
 *  words of the policy that say so, or as a link with the reason it is one. The ledger is where a
 *  judgement lives; the code refuses a host nobody judged.
 *
 *  Run:
 *    node scripts/outbound-hosts.mjs            the table: every host, request/link, where
 *    node scripts/outbound-hosts.mjs --check    this rule alone (check:datagov runs it too)
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';
import { SPELLINGS } from '../js/data-governance.js';
import { codeOnly } from './code-only.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const LEDGER = 'scripts/outbound-hosts.json';
export const LEGAL = 'js/legal-text.js';

/* ── the universe of files the browser loads ─────────────────────────────────────────────────
   ⚠ BY DIRECTORY AND BY SUFFIX, NOT BY NAME: js/ and src/ are what index.html and vite load, the
   root *.html are the served pages, sw.js is the service worker, css/ holds the stylesheets
   (a url() there is fetched like any other). scripts/, tests/, supabase/ and data/ are not loaded
   by the browser — the Edge Functions' own upstreams are the server's, and the policy names the
   server's relays as the recipient of what the browser sends them. */
const BROWSER = /^(?:(?:js|src)\/.+\.m?js|[^/]+\.html|sw\.js|css\/.+\.css)$/;

export function browserFiles(root = ROOT) {
  return execFileSync('git', ['ls-files', '-z', 'js', 'src', 'css', '*.html', 'sw.js'], { cwd: root, maxBuffer: 1 << 26 })
    .toString('utf8').split('\0').filter((f) => f && BROWSER.test(f))
    .map((file) => ({ file, text: fs.readFileSync(path.join(root, file), 'utf8') }));
}

/* ── hosts inside one piece of text ──────────────────────────────────────────────────────────
   `{s}` / `{a-c}` / `${…}` label placeholders become `*`, so a tile template is one host, and a
   URL whose whole host is an expression is reported as DYNAMIC rather than guessed at. */
const URL_RE = /\bhttps?:\/\/((?:[a-z0-9-]|\{[^{}\s/]*\})+(?:\.(?:[a-z0-9-]|\{[^{}\s/]*\})+)*)/gi;
/* a placeholder inside a label keeps the label's fixed part: `mts{}` → `mts*` (Google's mts0…mts3) */
const hostOf = (raw) => raw.toLowerCase().split('.').map((l) => l.replace(/\{[^{}]*\}/g, '*').replace(/\*+/g, '*')).join('.');

function urlsIn(text) {
  const out = [];
  for (const m of text.matchAll(URL_RE)) {
    const host = hostOf(m[1]);
    out.push({ host, at: m.index, dynamic: host.split('.').every((l) => l === '*') || !host.includes('.') });
  }
  return out;
}

/* the text before a URL inside the SAME literal: what it is an attribute of */
const ANCHOR = /<a\b[^<>]*\bhref\s*=\s*["']?\s*$/i;
const NAMESPACE_ATTR = /\bxmlns(?::[\w-]+)?\s*=\s*["']?\s*$/i;

/* ── JavaScript: the parser, never a regular expression over the source ─────────────────────── */
function parse(src, file) {
  const o = { ecmaVersion: 'latest', allowHashBang: true, allowReturnOutsideFunction: true };
  try { return acorn.parse(src, { ...o, sourceType: 'module' }); } catch (asModule) {
    try { return acorn.parse(src, { ...o, sourceType: 'script' }); } catch (_) {
      throw new Error(`outbound-hosts: cannot parse ${file} — ${asModule.message}`);
    }
  }
}

const SKIP = new Set(['type', 'start', 'end', 'loc', 'range']);
const propName = (p) => (p && !p.computed ? (p.key.type === 'Identifier' ? p.key.name : p.key.value) : null);
const memberName = (m) => (m && m.type === 'MemberExpression' && !m.computed ? m.property.name : null);
const calleeName = (c) => (c.type === 'Identifier' ? c.name : memberName(c));
/* offset → 1-based line, by binary search over the newline offsets (a 400 KB file is scanned once) */
function lineIndex(text) {
  const nl = [];
  for (let k = text.indexOf('\n'); k >= 0; k = text.indexOf('\n', k + 1)) nl.push(k);
  return (i) => { let lo = 0, hi = nl.length; while (lo < hi) { const m = (lo + hi) >> 1; if (nl[m] < i) lo = m + 1; else hi = m; } return lo + 1; };
}

/* The licence-URL spellings are js/data-governance.js's, never a second list: a record's
   `licenceUrl` is where a reader goes to read terms, never something the page fetches. */
const LICENCE_KEYS = new Set(SPELLINGS.licenceUrl);
/* ⚠ A `url` IS NOT A LINK BY ITS NAME — a MapLibre source's `url` is fetched. It is a link when the
   object it sits in is a PROVENANCE RECORD: one that also states a licence or an attribution in the
   same vocabulary. `{ id:'ioda', …, licence:'…', url:'https://ioda…/' }` names where the data comes
   from; `{ type:'vector', url:'https://tiles…' }` names what to fetch. */
const SOURCE_KEYS = new Set(SPELLINGS.source);
const PROVENANCE_KEYS = new Set([...SPELLINGS.licence, ...SPELLINGS.licenceUrl, ...SPELLINGS.attribution]);

/* The static text that ends immediately before `child` in the string being assembled around it:
   the rightmost literal leaf of the left operand of a `+`, or the quasi before a `${…}`. */
function rightmostText(n) {
  if (!n) return null;
  if (n.type === 'Literal' && typeof n.value === 'string') return n.value;
  if (n.type === 'TemplateLiteral') return n.expressions.length ? null : n.quasis.map((q) => q.value.cooked ?? '').join('');
  if (n.type === 'BinaryExpression' && n.operator === '+') return rightmostText(n.right);
  return null;
}

/* ⚠ AN HREF ASSEMBLED BY CONCATENATION IS STILL AN HREF. `'<a href="' + U(photo.link || ('https://…'))`
   puts the URL into an anchor exactly as a literal `<a href="https://…">` does; the climb passes
   through what can stand between the two (||, ?:, an escaping call, parentheses) and stops at the
   first `+` or `${}` — the text before THAT decides, and nothing further out does. */
function anchorByConcatenation(anc, node) {
  let child = node;
  for (let i = anc.length - 1; i >= 0; i--) {
    const a = anc[i];
    if (a.type === 'BinaryExpression' && a.operator === '+') {
      /* the LEFT operand starts where the whole sum starts, so what precedes it is further out */
      if (a.left === child) { child = a; continue; }
      const t = rightmostText(a.left);
      return t != null && ANCHOR.test(t);
    }
    if (a.type === 'TemplateLiteral') {
      const k = a.expressions.indexOf(child);
      return k >= 0 && ANCHOR.test(a.quasis[k].value.cooked ?? '');
    }
    const through = a.type === 'LogicalExpression'
      || (a.type === 'ConditionalExpression' && a.test !== child)
      || (a.type === 'CallExpression' && a.arguments.includes(child))
      || a.type === 'ParenthesizedExpression';
    if (!through) return false;
    child = a;
  }
  return false;
}

/* Why a literal, seen from its ancestors, is a link. null ⇒ it has to be accounted for. */
function linkByAncestry(anc, node) {
  if (anchorByConcatenation(anc, node)) return 'anchor';
  for (let i = anc.length - 1; i >= 0; i--) {
    const a = anc[i], child = anc[i + 1] || node;
    if (a.type === 'CallExpression') {
      const name = calleeName(a.callee);
      /* createElementNS / setAttributeNS / … — the first argument is a NAME, never fetched */
      if (name && /NS$/.test(name) && a.arguments[0] === child) return 'namespace';
      /* window.open(url) / location.assign(url) / location.replace(url): a navigation the reader
         asked for; the page does not request it on the reader's behalf */
      if (name === 'open' && (a.callee.type === 'Identifier' || /^(window|self|globalThis)$/.test(a.callee.object?.name || ''))) return 'navigation';
      if ((name === 'assign' || name === 'replace') && memberName(a.callee.object) === 'location') return 'navigation';
      if ((name === 'assign' || name === 'replace') && a.callee.object?.name === 'location') return 'navigation';
      /* a function call that consumes the value ends the ancestry that matters */
      if (a.arguments.includes(child)) return null;
    }
    if (a.type === 'AssignmentExpression' && a.right === child) {
      const t = a.left;
      if ((t.type === 'Identifier' && t.name === 'location') || memberName(t) === 'location'
        || (memberName(t) === 'href' && (t.object.name === 'location' || memberName(t.object) === 'location'))) return 'navigation';
      return null;
    }
    if (a.type === 'Property' && a.value === child) {
      const k = propName(a);
      if (k && LICENCE_KEYS.has(k)) return 'licence';
      const obj = anc[i - 1];
      if (k && SOURCE_KEYS.has(k) && obj && obj.type === 'ObjectExpression'
        && obj.properties.some((p) => PROVENANCE_KEYS.has(propName(p)))) return 'provenance';
      /* js/reference-data.js's DATA_SOURCES: each row's `u` is the credit's hyperlink */
      if (k === 'u' && anc.slice(0, i).some((x) => x.type === 'VariableDeclarator' && x.id.name === 'DATA_SOURCES')) return 'credit';
    }
    if (/Function|Program|Statement$/.test(a.type) || a.type === 'VariableDeclarator') break;
  }
  return null;
}

/* ⚠ A URL ASSEMBLED BY `+` IS STILL ONE URL. `'https://' + (opts.host || 'a') + '.basemaps.cartocdn.com/'`
   names its host in the SECOND literal, which on its own has no scheme and so no URL — read literal by
   literal, CARTO's tile host did not exist (measured: it was found only through index.html's
   preconnect hint). So a `+` chain is read as ONE text, each operand that is not itself string text
   standing in as `{}` — the same placeholder a tile template's `{s}` is. */
function flatten(n, used) {
  if (n.type === 'Literal' && typeof n.value === 'string') { used.add(n); return n.value; }
  if (n.type === 'TemplateLiteral') { used.add(n); return n.quasis.map((q) => q.value.cooked ?? q.value.raw).join('{}'); }
  if (n.type === 'BinaryExpression' && n.operator === '+') {
    const l = flatten(n.left, used), r = flatten(n.right, used);
    return (l ?? '{}') + (r ?? '{}');
  }
  return null;
}

function scanJs(file, src, out, offset = 0, whole = src) {
  const tree = parse(src, file);
  const line = lineIndex(whole);
  const consumed = new Set();
  (function walk(n, anc) {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { for (const c of n) walk(c, anc); return; }
    let text = null;
    if (!consumed.has(n)) {
      const top = n.type === 'BinaryExpression' && n.operator === '+' && !(anc.length && anc[anc.length - 1].type === 'BinaryExpression' && anc[anc.length - 1].operator === '+');
      if (top || n.type === 'Literal' || n.type === 'TemplateLiteral') {
        const used = new Set();
        text = flatten(n, used);
        if (text != null && top) for (const u of used) consumed.add(u);
      }
    }
    if (text != null && text.includes('://')) {
      for (const u of urlsIn(text)) {
        const before = text.slice(Math.max(0, u.at - 400), u.at);
        const link = ANCHOR.test(before) ? 'anchor' : NAMESPACE_ATTR.test(before) ? 'namespace' : linkByAncestry(anc, n);
        out.push({ host: u.host, dynamic: u.dynamic, file, line: line(offset + n.start), link });
      }
    }
    if (n.type === 'Literal') return;
    const next = anc.concat(n);
    for (const k of Object.keys(n)) if (!SKIP.has(k)) walk(n[k], next);
  })(tree, []);
}

/* ── HTML: the tag decides; inline <script> goes to the parser ─────────────────────────────── */
/* <link rel> values the browser does not fetch on its own (a canonical/alternate is a NAME for
   the page; author/license/me are hyperlinks). preconnect/dns-prefetch DO open a connection to the
   host — they are requests and stay unclassified. */
const LINK_REL_NAMES = /^(canonical|alternate|author|license|me|help|search|bookmark|external)$/i;

function scanHtml(file, html, out) {
  const line = lineIndex(html);
  const blank = codeOnly(html, { lang: 'html', offsets: true });
  const scripts = [];
  /* <script> elements by position, the way the HTML tokenizer ends them: the body stops at the first
     `</script` whatever follows it (a regex for the end tag is always one spelling short). */
  const lower = blank.toLowerCase();
  const scriptEls = [];
  for (let at = lower.indexOf('<script'); at >= 0; at = lower.indexOf('<script', at + 1)) {
    if (/[\w-]/.test(lower[at + 7] || '')) continue;
    const openEnd = lower.indexOf('>', at);
    if (openEnd < 0) break;
    const close = lower.indexOf('</script', openEnd + 1);
    const bodyEnd = close < 0 ? blank.length : close;
    const closeEnd = close < 0 ? blank.length : (lower.indexOf('>', close) < 0 ? blank.length : lower.indexOf('>', close) + 1);
    const m = [blank.slice(at, closeEnd), blank.slice(at + 7, openEnd), blank.slice(openEnd + 1, bodyEnd)];
    m.index = at;
    scriptEls.push(m);
    at = closeEnd - 1;
  }
  for (const m of scriptEls) {
    const type = (/\btype\s*=\s*["']?([^"'\s>]+)/i.exec(m[1]) || [])[1] || '';
    const body0 = m.index + m[0].indexOf('>') + 1;
    scripts.push([m.index, m.index + m[0].length]);
    if (/json|ld\+json|importmap|template/i.test(type)) {
      for (const u of urlsIn(m[2])) out.push({ host: u.host, dynamic: u.dynamic, file, line: line(body0 + u.at), link: 'metadata' });
    } else if (m[2].trim()) scanJs(file, m[2], out, body0, html);
    const src = /\bsrc\s*=\s*["']([^"']+)/i.exec(m[1]);
    if (src) for (const u of urlsIn(src[1])) out.push({ host: u.host, dynamic: u.dynamic, file, line: line(m.index), link: null });
  }
  const inScript = (i) => scripts.some(([a, b]) => i >= a && i < b);
  for (const m of blank.matchAll(/<(\w+)\b([^>]*)>/g)) {
    if (inScript(m.index) || m[1].toLowerCase() === 'script') continue;
    const tag = m[1].toLowerCase();
    const rel = (/\brel\s*=\s*["']?([^"'>]+)/i.exec(m[2]) || [])[1] || '';
    for (const u of urlsIn(m[2])) {
      const link = tag === 'a' ? 'anchor'
        : tag === 'meta' ? 'metadata'
          : tag === 'link' && rel.split(/\s+/).every((r) => LINK_REL_NAMES.test(r)) ? 'metadata'
            : null;
      out.push({ host: u.host, dynamic: u.dynamic, file, line: line(m.index + m[0].indexOf(u.host)), link });
    }
  }
  /* text between tags is prose: a URL written there is not requested and not a link either */
}

/* ── CSS: url(…) and @import are fetched ────────────────────────────────────────────────────── */
function scanCss(file, css, out) {
  const line = lineIndex(css);
  const blank = codeOnly(css, { lang: 'css', offsets: true });
  for (const m of blank.matchAll(/(?:url\(\s*["']?|@import\s+["'])([^"')\s]+)/gi)) {
    for (const u of urlsIn(m[1])) out.push({ host: u.host, dynamic: u.dynamic, file, line: line(m.index), link: null });
  }
}

/** Every URL occurrence in the browser's files: [{host, file, line, link, dynamic}] */
export function discover(files) {
  const out = [];
  for (const { file, text } of files) {
    if (file.endsWith('.html')) scanHtml(file, text, out);
    else if (file.endsWith('.css')) scanCss(file, text, out);
    else scanJs(file, text, out);
  }
  return out;
}

/* ── the policy the reader is shown ─────────────────────────────────────────────────────────── */
/* ⚠ EVALUATED, NOT GREPPED. The template literals interpolate ${LEGAL_DATE}, and what counts is
   the text js/legal.js and privacy.html render — so the file is run the way the page runs it and
   asked for the same document through its own `html('privacy', lang)`. */
export function privacySection4(legalSource) {
  const sandbox = { window: {} };
  vm.runInNewContext(legalSource, sandbox, { filename: LEGAL });
  const L = sandbox.window.IntMapLegalText;
  const para = (lang) => {
    const html = L.html('privacy', lang);
    const m = /<p><b>4\.[\s\S]*?<\/p>/.exec(html);
    if (!m) return null;
    /* text, for comparison only (never rendered): strip tags until none remain, then decode, &amp; LAST */
    let t = m[0], prev;
    do { prev = t; t = t.replace(/<[^<>]*>/g, ''); } while (t !== prev);
    return t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&').replace(/\s+/g, ' ');
  };
  return { en: para('en'), jp: para('jp') };
}

/* The switches a dormant entry may name are the page's own `window.<NAME>=true|false;` literals —
   read from index.html, so a dormant host becomes an undisclosed one the day its switch flips. */
function switches(files) {
  const html = (files.find((f) => f.file === 'index.html') || {}).text || '';
  const out = new Map();
  for (const m of html.matchAll(/window\.([A-Z][A-Z0-9_]*)\s*=\s*(true|false)\s*;/g)) out.set(m[1], m[2] === 'true');
  return out;
}

export const SENDS = Object.freeze(['nothing', 'coordinates', 'area', 'query-text', 'url', 'identifier',
  'credential-prefix', 'content', 'page-visit']);

/** The rule, evaluated over what it is handed. Every argument is injectable so the test can
    change one fact without writing to the working tree. */
export function check({ files, ledger, legalSource }) {
  const occ = discover(files);
  const problems = [], notes = [];
  const sec4 = privacySection4(legalSource);
  if (!sec4.en || !sec4.jp) problems.push('Privacy §4 could not be read from ' + LEGAL + ' in ' + (!sec4.en ? 'en' : 'jp') + ' — nothing below can be compared with it');

  const requested = new Map(), linked = new Map(), dynamic = [];
  for (const o of occ) {
    if (o.dynamic) { if (!o.link) dynamic.push(o); continue; }
    const m = o.link ? linked : requested;
    if (!m.has(o.host)) m.set(o.host, []);
    m.get(o.host).push(o);
  }
  const rows = (ledger && Array.isArray(ledger.hosts)) ? ledger.hosts : [];
  const byHost = new Map();
  for (const r of rows) {
    if (byHost.has(r.host)) problems.push(`${LEDGER}: ${r.host} is listed twice`);
    byHost.set(r.host, r);
  }
  const sw = switches(files);
  const where = (list) => list.slice(0, 3).map((o) => o.file + ':' + o.line).join(', ') + (list.length > 3 ? ` (+${list.length - 3})` : '');

  /* ① every host requested is accounted for */
  for (const [host, list] of requested) {
    if (!byHost.has(host)) problems.push(`${host} is requested by the browser code (${where(list)}) and ${LEDGER} does not account for it — say what it is sent and which words of Privacy §4 say so, or why it is only a link`);
  }
  /* ② each row is one of the forms, and its words are in the policy the reader is shown */
  for (const r of rows) {
    const forms = ['disclosure', 'link', 'dormant', 'removedBy'].filter((k) => r[k] != null);
    if (forms.length !== 1) { problems.push(`${LEDGER}: ${r.host} must carry exactly one of disclosure / link / dormant / removedBy (has ${forms.join(', ') || 'none'})`); continue; }
    if (!r.what) problems.push(`${LEDGER}: ${r.host} does not say what is fetched from it (\`what\`)`);
    if (r.link != null) { if (!String(r.link).trim()) problems.push(`${LEDGER}: ${r.host} is a link with no reason`); continue; }
    if (r.removedBy != null) { notes.push(`${r.host} is excused as «${r.removedBy}» — ${r.why || 'no reason given'}; remove the row when that lands`); continue; }
    if (!r.sends || !SENDS.includes(r.sends.code)) problems.push(`${LEDGER}: ${r.host} states \`sends.code\` ${JSON.stringify(r.sends && r.sends.code)}, not one of ${SENDS.join(' / ')}`);
    if (r.dormant != null) {
      const on = sw.get(r.dormant.switch);
      if (on === undefined) problems.push(`${LEDGER}: ${r.host} is dormant behind window.${r.dormant.switch}, and index.html declares no such switch as true/false`);
      else if (on) problems.push(`${r.host} is dormant behind window.${r.dormant.switch}, and that switch is now TRUE — it is a live recipient and Privacy §4 must name it (replace \`dormant\` with \`disclosure\`)`);
      continue;
    }
    for (const lang of ['en', 'jp']) {
      const phrase = r.disclosure && r.disclosure[lang];
      if (!phrase) problems.push(`${LEDGER}: ${r.host} has no ${lang} disclosure phrase`);
      else if (sec4[lang] && !sec4[lang].includes(phrase.replace(/\s+/g, ' '))) problems.push(`${r.host}: the ${lang} disclosure «${phrase}» is not in Privacy §4 as the reader sees it`);
    }
  }
  /* ③ nothing in the ledger outlives its code */
  for (const r of rows) {
    if (requested.has(r.host)) continue;
    problems.push(linked.has(r.host)
      ? `${LEDGER}: ${r.host} is now only ever a link by its context (${where(linked.get(r.host))}) — the row is no longer needed; remove it`
      : `${LEDGER}: ${r.host} is no longer named by any browser file — remove the row (a ledger that outlives its code excuses the next host that shares the name)`);
  }
  if (dynamic.length) notes.push(dynamic.length + ' URL(s) have a host assembled at run time and are not guessed at: ' + where(dynamic));

  const kinds = { disclosure: 0, link: 0, dormant: 0, removedBy: 0 };
  for (const r of rows) for (const k of Object.keys(kinds)) if (r[k] != null) kinds[k]++;
  return { problems, notes, requested, linked, dynamic, rows, kinds, occurrences: occ.length };
}

export function readLedger(root = ROOT) {
  return JSON.parse(fs.readFileSync(path.join(root, LEDGER), 'utf8'));
}

/** The rule against the working tree, as check:datagov runs it. */
export function checkRepository(root = ROOT) {
  return check({ files: browserFiles(root), ledger: readLedger(root), legalSource: fs.readFileSync(path.join(root, LEGAL), 'utf8') });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = checkRepository();
  if (!process.argv.includes('--check')) {
    const all = [...new Set([...r.requested.keys(), ...r.linked.keys()])].sort();
    for (const h of all) {
      const q = r.requested.get(h) || [], l = r.linked.get(h) || [];
      console.log((q.length ? 'REQ ' : 'lnk ') + h.padEnd(44) + ' ' + (q.length ? q.slice(0, 2).map((o) => o.file + ':' + o.line).join(' ') : [...new Set(l.map((o) => o.link))].join(',')));
    }
  }
  console.log(`\n${r.occurrences} URL occurrence(s); ${r.requested.size} requested host(s), ${r.linked.size} link-only host(s); ledger ${r.rows.length} row(s)`);
  for (const n of r.notes) console.log('  note ' + n);
  for (const p of r.problems) console.log('  ✖ ' + p);
  if (process.argv.includes('--check') && r.problems.length) process.exit(1);
}
