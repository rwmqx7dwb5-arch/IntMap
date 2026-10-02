/* ============================================================================
 *  IntMap · AN EMOJI IS NOT AN ICON — the rule that keeps pictures out of the strings  (icon-system)
 * ----------------------------------------------------------------------------
 *  The interface drew its icons with emoji — the Tools tiles, the toolbar, every Atlas confirmation
 *  line, the players, and the locale strings themselves («🌐 Grid»). MEASURED on the production DOM
 *  before js/icons.js existed: 🕒×10 🌐×6 📷×5 ⚠×4 🗂×3 🔒×3 and some thirty others. An emoji is drawn
 *  by the READER'S font: a different picture on every platform, in its own colours, deaf to the text
 *  colour and the theme. js/icons.js is now where every icon comes from; this keeps it that way.
 *
 *  THE RULE. In what the site serves — every file under js/ and src/ (the locales included), the pages,
 *  what vite.config.js STATIC_ASSETS copies, and the stylesheets under css/ — no STRING the code holds,
 *  no TEXT of a page and no CSS `content` may contain an Extended_Pictographic character (Unicode's own
 *  class of «this is a picture»), unless:
 *    · it is TYPOGRAPHIC below — a character the TEXT reads through, drawn by the text font (© in a
 *      licence notice, an arrow in «Wikipedia ↗»), each with its reason; or
 *    · the file DECLARES it below, with the glyphs and the reason (the reader's own data: an avatar the
 *      reader picked is a value they chose, not a picture we drew).
 *  What is read: string and template literals by their COOKED value (so «\u{1F310}» is the globe it
 *  spells), from the tokenizer — a comment is not a string, and the ⚠ that this repository's comments
 *  use for emphasis is prose for the next author, not something a reader sees. A regular expression is
 *  not read either: a pattern matches text, it draws nothing. In a page: its text and attribute values
 *  with numeric character references decoded, its inline scripts as above, its <style> as CSS.
 *
 *  ⚠ THE UNIVERSE IS DISCOVERED, NEVER LISTED: the same «served site» scripts/runtime-scripts.mjs reads
 *  (root pages, js/, src/, vite STATIC_ASSETS minus STATIC_EXCLUDE), plus css/. UPSTREAM excuses whole
 *  directories whose text was written by a source, not by IntMap — with the reason.
 *  ⚠ A DECLARATION IS A CLAIM AND IS CHECKED LIKE ONE: a declared file that no longer holds any of its
 *  glyphs, a declared glyph no longer present, and a declaration without a reason are errors.
 *
 *      node scripts/icon-glyphs.mjs           every site, grouped by file
 *      node scripts/icon-glyphs.mjs --check   exit 1 when there is a problem (what check:static runs)
 *  scripts/static-checks.mjs runs iconGlyphProblems() as its `icon-glyphs` rule.
 * ==========================================================================*/
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, extname, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';
import { codeOnly } from './code-only.mjs';
import { viteStaticAssets } from './runtime-scripts.mjs';

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), '..'));
const MIN_WHY = 40;

/** Unicode's class of pictographs — the definition of «emoji» this rule uses. */
export const PICTOGRAPH = /\p{Extended_Pictographic}/u;

/** Pictographic by Unicode, but read as TEXT: punctuation the sentence reads through. */
export const TYPOGRAPHIC = [
  {
    name: 'legal marks', re: /[©®™]/u,
    why: '© ® ™ are letters of a licence or trademark notice («© OpenStreetMap contributors»): the attribution a licence requires is text, copied as the licensor wrote it, and the text font draws it in the text colour.',
  },
  {
    name: 'arrows', re: /[↔-↙↩↪⤴⤵⬅-⬇➡]/u,
    why: 'Arrows written inside a sentence («Wikipedia ↗» for a link that leaves the page, a correlation ↗ / ↘, «A ↔ B»): punctuation the line reads through, drawn by the text font, not a picture standing for a control.',
  },
];

/** Directories whose text a SOURCE wrote. */
export const UPSTREAM = [
  {
    prefix: 'data/',
    why: 'The bundled datasets (historical borders, administrative units, coasts): every name and label in them is what the upstream record says, carried as written — CONSTITUTION.md §7, a source\'s label is not ours to rewrite.',
  },
];

/** Files that keep pictographs on purpose — the glyphs, and why. */
export const DECLARED = [
  {
    file: 'js/auth-ui.js', glyphs: '👤🌍🛰⚓✈🛡📡⛰🗺🔭📰🏛🦅🐻🐉🌐',
    why: 'The account avatar palette. The avatar is a CHARACTER the reader picks; it is stored as that character (localStorage intmap_avatar, synced with the reader\'s settings) and shown as their identity — the reader\'s own value, not an icon the interface draws.',
  },
  {
    file: 'js/app-body.js', glyphs: '👤',
    why: 'The stored avatar\'s reader (window.imGetAvatar): it answers the character the reader picked from the avatar palette in js/auth-ui.js, and the palette\'s first character for a reader who has not picked one — the same value, not an icon.',
  },
];

/* ── the universe ─────────────────────────────────────────────────────────────────────────── */
function listFiles(abs, out) {
  let st; try { st = statSync(abs); } catch { return out; }
  if (st.isDirectory()) { for (const n of readdirSync(abs)) listFiles(join(abs, n), out); }
  else out.push(abs);
  return out;
}
/** The served files this rule reads (relative, forward slashes). */
export function servedFiles(root = ROOT) {
  const rel = (a) => relative(root, a).replace(/\\/g, '/');
  const rels = new Set();
  for (const n of readdirSync(root)) if (n.endsWith('.html')) rels.add(n);
  for (const d of ['js', 'src', 'css']) if (existsSync(join(root, d))) listFiles(join(root, d), []).forEach((a) => rels.add(rel(a)));
  const vite = viteStaticAssets(readFileSync(join(root, 'vite.config.js'), 'utf8'));
  for (const a of vite.assets) if (existsSync(join(root, a))) listFiles(join(root, a), []).forEach((x) => rels.add(rel(x)));
  const excluded = (r) => vite.exclude.some((x) => r === x || r.startsWith(x.replace(/\/$/, '') + '/'))
    || UPSTREAM.some((u) => r.startsWith(u.prefix));
  return [...rels].filter((r) => !excluded(r) && ['.js', '.mjs', '.html', '.css'].includes(extname(r))).sort();
}

/* ── reading ──────────────────────────────────────────────────────────────────────────────── */
const lineAt = (text, i) => { let n = 1; for (let k = 0; k < i && k < text.length; k++) if (text.charCodeAt(k) === 10) n++; return n; };
const typographic = (ch) => TYPOGRAPHIC.some((t) => t.re.test(ch));
function pictographs(value) {
  const out = [];
  for (const m of String(value).matchAll(/\p{Extended_Pictographic}/gu)) if (!typographic(m[0])) out.push(m[0]);
  return out;
}

/** The string / template literals of a script, cooked, with their offsets. */
function jsStrings(code) {
  for (const sourceType of ['module', 'script']) {
    try {
      const out = [];
      for (const t of acorn.tokenizer(code, { ecmaVersion: 'latest', sourceType, allowHashBang: true, allowReturnOutsideFunction: true })) {
        if (t.type.label === 'string' || t.type.label === 'template') out.push({ start: t.start, value: t.value == null ? code.slice(t.start, t.end) : t.value });
      }
      return out;
    } catch (e) { if (sourceType === 'script') throw e; }
  }
  return [];
}
const decodeRefs = (s) => s.replace(/&#(x[0-9a-f]+|[0-9]+);/gi, (m, v) => {
  const cp = v[0] === 'x' || v[0] === 'X' ? parseInt(v.slice(1), 16) : parseInt(v, 10);
  try { return String.fromCodePoint(cp); } catch { return m; }
});
const decodeCss = (s) => s.replace(/\\([0-9a-f]{1,6})\s?/gi, (m, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch { return m; } });

/** Every pictograph site in one file's text: [{line, glyph, where}] */
export function sitesIn(rel, text) {
  const sites = [];
  const push = (offset, glyphs, where) => { const line = lineAt(text, offset); for (const g of glyphs) sites.push({ line, glyph: g, where }); };
  const fromScript = (code, base) => { for (const s of jsStrings(code)) { const g = pictographs(s.value); if (g.length) push(base + s.start, g, 'string'); } };
  const fromCss = (css, base) => {
    const c = codeOnly(css, { lang: 'css', offsets: true });
    for (const line of c.matchAll(/[^\n]+/g)) { const g = pictographs(decodeCss(line[0])); if (g.length) push(base + line.index, g, 'css'); }
  };
  const ext = extname(rel);
  if (ext === '.js' || ext === '.mjs') fromScript(text, 0);
  else if (ext === '.css') fromCss(text, 0);
  else if (ext === '.html') {
    /* blank what is not page text, keeping offsets: comments, then each <script>/<style> read in its own language */
    let page = codeOnly(text, { lang: 'html', offsets: true });
    page = page.replace(/(<script\b([^>]*)>)([\s\S]*?)(<\/script>)/gi, (m, open, attrs, body, close, at) => {
      const start = at + open.length;
      if (/type\s*=\s*["']?application\/(?:ld\+)?json/i.test(attrs)) { const g = pictographs(body); if (g.length) push(start, g, 'json'); }
      else fromScript(body, start);
      return open + body.replace(/[^\n]/g, ' ') + close;
    });
    page = page.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (m, open, body, close, at) => {
      fromCss(body, at + open.length);
      return open + body.replace(/[^\n]/g, ' ') + close;
    });
    for (const line of page.matchAll(/[^\n]+/g)) { const g = pictographs(decodeRefs(line[0])); if (g.length) push(line.index, g, 'markup'); }
  }
  return sites;
}

/** Every site in the served tree: [{file, line, glyph, where}] */
export function glyphSites(root = ROOT) {
  const out = [];
  for (const rel of servedFiles(root)) {
    let text; try { text = readFileSync(join(root, rel), 'utf8'); } catch { continue; }
    if (!PICTOGRAPH.test(text) && !/\\u\{?[0-9a-f]{4,5}|&#|\\[0-9a-f]{4,6}/i.test(text)) continue;   /* nothing it could spell */
    let s; try { s = sitesIn(rel, text); } catch (e) { out.push({ file: rel, line: 0, glyph: '', where: 'unreadable', error: String(e && e.message) }); continue; }
    for (const x of s) out.push({ file: rel, ...x });
  }
  return out;
}

const cpOf = (g) => [...g].map((c) => 'U+' + c.codePointAt(0).toString(16).toUpperCase()).join(' ');
const glyphSet = (s) => new Set([...String(s)].filter((c) => PICTOGRAPH.test(c)));

/** What check:static reports. */
export function iconGlyphProblems(root = ROOT, decl = { declared: DECLARED, typographic: TYPOGRAPHIC, upstream: UPSTREAM }) {
  const problems = [];
  for (const t of decl.typographic) if (!t.why || t.why.trim().length < MIN_WHY) problems.push(`TYPOGRAPHIC ${t.name}: needs a reason — a sentence saying why the text reads this character`);
  for (const u of decl.upstream) if (!u.why || u.why.trim().length < MIN_WHY) problems.push(`UPSTREAM ${u.prefix}: needs a reason — a sentence saying who wrote this text`);
  const sites = glyphSites(root);
  const seen = new Map();   /* declared file → glyphs met */
  for (const s of sites) {
    if (s.where === 'unreadable') { problems.push(`${s.file}: could not be read as a script (${s.error})`); continue; }
    const d = decl.declared.find((x) => x.file === s.file);
    if (d && glyphSet(d.glyphs).has(s.glyph)) { if (!seen.has(d.file)) seen.set(d.file, new Set()); seen.get(d.file).add(s.glyph); continue; }
    problems.push(`${s.file}:${s.line}: «${s.glyph}» (${cpOf(s.glyph)}) in ${s.where === 'markup' ? 'page text' : 'a ' + s.where} is an emoji drawn as an icon — draw it with js/icons.js (icon() / iconNode() / data-icon), or, if it is the reader's own data and not ours to draw, declare it in DECLARED with the reason`);
  }
  for (const d of decl.declared) {
    if (!d.why || d.why.trim().length < MIN_WHY) problems.push(`DECLARED ${d.file}: needs a reason — a sentence saying why these characters are not icons`);
    const met = seen.get(d.file) || new Set();
    if (!met.size) { problems.push(`DECLARED ${d.file}: holds none of its declared glyphs any more — remove the declaration`); continue; }
    for (const g of glyphSet(d.glyphs)) if (!met.has(g)) problems.push(`DECLARED ${d.file}: «${g}» is declared but no longer there — remove it from the declaration`);
  }
  return problems;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--check')) {
    const p = iconGlyphProblems();
    for (const l of p) console.log('  · ' + l);
    console.log(p.length ? `\n✗ ${p.length} icon-glyph problem(s)` : '✓ no emoji drawn as an icon');
    process.exit(p.length ? 1 : 0);
  }
  const by = new Map();
  for (const s of glyphSites()) { if (!by.has(s.file)) by.set(s.file, []); by.get(s.file).push(s); }
  for (const [f, list] of by) console.log(f + '  ' + list.length + '  ' + list.map((s) => s.line + ':' + s.glyph).join(' '));
}
