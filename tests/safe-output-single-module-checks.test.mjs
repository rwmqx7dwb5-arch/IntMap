/* ============================================================================
 *  safe-output-single-module — the output encoder is ONE file, and every reader loads that file
 * ----------------------------------------------------------------------------
 *  Until this change window.IntMapSafe was defined inline in index.html's first <head> script, so
 *  nothing outside a parsed index.html could reach it: sources.html and admin.html, and nine modules
 *  that tests evaluate in Node, each kept an escaper of their own (scripts/safe-output-ledger.json).
 *
 *  ① there is exactly one definition of IntMapSafe in what ships — found by walking the tree, not by
 *    naming the file — and it is js/safe-html.js; a second definition (the old inline block) is caught
 *  ② the app evaluates it before anything that could use it: every module src/main.js imports ahead of
 *    it, and everything THOSE import, never touch IntMapSafe; no inline script of index.html does
 *  ③ sources.html and admin.html load the same file before the script that renders, and the build
 *    copies it for them
 *  ④ an ES module that reads globalThis.IntMapSafe imports ./safe-html.js (discovered over js/)
 *  ⑤ the ten files that kept copies now delegate — no escaper left, and the delegate, evaluated with
 *    the real encoder, leaves hostile text inert; two of them rendered end to end
 *  ⑥ IntMapSafe.text parses in an inert document, never the live one, and the news ingest uses it
 *  ⑦ the gate still counts a copy re-added to one of those files
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';
import { scanSource, safeOutputProblems, measure, readLedger } from '../scripts/safe-output.mjs';
import { installSafe } from './helpers/safe-html.mjs';
import { STATIC_ASSETS } from '../vite.config.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
const ASTS = new Map();   /* one parse per source text — ①, ② and ④ walk the same files */
const parse = (src) => ASTS.get(src) || ASTS.set(src, parse1(src)).get(src);
const parse1 = (src) => {
  const o = { ecmaVersion: 'latest', allowHashBang: true, allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true };
  try { return acorn.parse(src, { ...o, sourceType: 'module' }); } catch { return acorn.parse(src, { ...o, sourceType: 'script' }); }
};
function* nodes(n) {
  if (!n || typeof n.type !== 'string') return;
  yield n;
  for (const k in n) { const v = n[k]; if (Array.isArray(v)) { for (const c of v) yield* nodes(c); } else if (v && typeof v.type === 'string') yield* nodes(v); }
}
const walkJs = (dir, acc = []) => {
  for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    if (e.isDirectory()) walkJs(dir + '/' + e.name, acc); else if (e.name.endsWith('.js')) acc.push(dir + '/' + e.name);
  }
  return acc;
};
/* inline <script> bodies of a page (not src=, not JSON) */
const inlineScripts = (html) => [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\b[^>]*>/gi)]
  .filter((m) => !/\bsrc\s*=/.test(m[1]) && !/type\s*=\s*["']?(?:application\/(?:ld\+)?json|importmap|text\/template)/i.test(m[1]))
  .map((m) => m[2]);
const touches = (src) => { try { return [...nodes(parse(src))].some((n) => (n.type === 'Identifier' && n.name === 'IntMapSafe') || (n.type === 'MemberExpression' && !n.computed && n.property.name === 'IntMapSafe')); } catch { return /IntMapSafe/.test(src); } };
/* every assignment whose target is `<anything>.IntMapSafe` or a bare `IntMapSafe` */
const definitions = (src) => [...nodes(parse(src))].filter((n) => n.type === 'AssignmentExpression'
  && ((n.left.type === 'MemberExpression' && !n.left.computed && n.left.property.name === 'IntMapSafe') || (n.left.type === 'Identifier' && n.left.name === 'IntMapSafe'))).length;
function definersIn(pages = {}) {
  const out = [];
  for (const f of [...walkJs('js'), ...walkJs('src')]) if (definitions(rd(f))) out.push(f);
  for (const name of readdirSync(ROOT).filter((n) => n.endsWith('.html'))) {
    const html = pages[name] != null ? pages[name] : rd(name);
    for (const s of inlineScripts(html)) { let d = 0; try { d = definitions(s); } catch { /* not JS */ } if (d) out.push(name); }
  }
  return out;
}

const SAFE = installSafe({});
let MEASURED = null;   /* the whole-tree gate measurement, taken once for ③ and ⑦ */
const measured = () => MEASURED || (MEASURED = measure());
const HOSTILE = ['"><img src=x onerror=alert(1)>', "'><svg onload=alert(1)>", '<script>alert(1)</script>', 'a&b "c" \'d\''];
const inertInAttr = (out) => !/["'<>]/.test(out);

/* ── ① ─────────────────────────────────────────────────────────────────────── */
test('① one definition of IntMapSafe in everything that ships, and it is js/safe-html.js', () => {
  assert.deepEqual(definersIn(), ['js/safe-html.js']);
  /* the mutation: the old inline block back in index.html is a SECOND definition, and is seen */
  const idx = rd('index.html').replace('<head>', '<head>\n<script>(function(){ function html(s){ return String(s); } window.IntMapSafe={ html:html, esc:html }; })();</script>');
  assert.deepEqual(definersIn({ 'index.html': idx }).sort(), ['index.html', 'js/safe-html.js']);
});

/* ── ② ─────────────────────────────────────────────────────────────────────── */
test('② the app evaluates the encoder before anything that could use it', () => {
  const main = rd('src/main.js');
  const imports = [...nodes(parse(main))].filter((n) => n.type === 'ImportDeclaration').map((n) => n.source.value);
  const at = imports.indexOf('../js/safe-html.js');
  assert.ok(at >= 0, 'src/main.js imports ../js/safe-html.js');
  /* everything evaluated before it: the earlier imports and, depth first, what they import */
  const seen = new Set();
  const go = (abs) => {
    if (seen.has(abs) || !existsSync(abs) || !/\.m?js$/.test(abs)) return;
    seen.add(abs);
    for (const n of nodes(parse(readFileSync(abs, 'utf8')))) {
      if ((n.type === 'ImportDeclaration' || n.type === 'ExportAllDeclaration' || n.type === 'ExportNamedDeclaration') && n.source && /^\./.test(n.source.value)) go(resolve(dirname(abs), n.source.value));
    }
  };
  for (const s of imports.slice(0, at)) go(resolve(ROOT, 'src', s));
  assert.ok(seen.size >= 3, `the earlier slots were reached (${seen.size})`);
  const early = [...seen].filter((f) => touches(readFileSync(f, 'utf8'))).map((f) => f.slice(ROOT.length + 1));
  assert.deepEqual(early, [], 'evaluated before js/safe-html.js yet uses IntMapSafe');
  /* index.html's inline scripts run before the module graph; none of them may use it */
  const inl = inlineScripts(rd('index.html')).filter(touches);
  assert.equal(inl.length, 0, 'an inline script in index.html uses IntMapSafe, which the module graph defines later');
});

/* ── ③ ─────────────────────────────────────────────────────────────────────── */
test('③ sources.html and admin.html load the same file before the script that renders', () => {
  for (const page of ['sources.html', 'admin.html']) {
    const html = rd(page);
    const tag = html.search(/<script\s+src="\.\/js\/safe-html\.js"><\/script>/);
    assert.ok(tag > 0, `${page} loads ./js/safe-html.js`);
    const tags = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\b[^>]*>/gi)];
    /* the first script that uses it — inline, or a js/ file loaded by src= — comes after the tag */
    const firstUse = tags.find((m) => {
      const src = /\bsrc\s*=\s*"\.\/([^"]+)"/.exec(m[1]);
      if (src) return src[1] !== 'js/safe-html.js' && existsSync(join(ROOT, src[1])) && touches(rd(src[1]));
      return touches(m[2]);
    });
    assert.ok(firstUse, `${page} has a script that uses IntMapSafe`);
    assert.ok(firstUse.index > tag, `${page}: the script that renders comes after js/safe-html.js`);
  }
  assert.ok(STATIC_ASSETS.includes('js/safe-html.js'), 'the build copies js/safe-html.js for the two verbatim pages');
  /* the two static pages no longer keep an escaper of their own (sources-list is the one sources.html renders with) */
  assert.equal(Object.hasOwn(measured(), 'admin.html'), false, 'admin.html has no escaper and no unguarded href/src');
  assert.equal(scanSource(rd('js/sources-list.js')).escaper.length, 0);
});

/* ── ④ ─────────────────────────────────────────────────────────────────────── */
test('④ an ES module that reads globalThis.IntMapSafe imports ./safe-html.js', () => {
  const readers = [];
  for (const f of walkJs('js')) {
    if (f === 'js/safe-html.js') continue;
    const ast = (() => { try { return parse(rd(f)); } catch { return null; } })();
    if (!ast) continue;
    const all = [...nodes(ast)];
    const reads = all.some((n) => n.type === 'MemberExpression' && !n.computed && n.property.name === 'IntMapSafe'
      && n.object.type === 'Identifier' && n.object.name === 'globalThis');
    if (!reads) continue;
    readers.push(f);
    const imp = all.some((n) => n.type === 'ImportDeclaration' && n.source.value === './safe-html.js');
    assert.ok(imp, `${f} reads globalThis.IntMapSafe without importing ./safe-html.js — in Node and in a worker it is undefined`);
  }
  /* MEASURED 2026-09-29: this change made 11 such modules (a floor, not a count to keep) */
  assert.ok(readers.length >= 11, `the importing readers are still there (${readers.length})`);
});

/* ── ⑤ ─────────────────────────────────────────────────────────────────────── */
const TEN = ['js/gis-atlas.js', 'js/atlas-map-compose.js', 'js/atlas-annotate.js', 'js/atlas-highlight.js', 'js/atlas-query.js',
  'js/layer-manifest.js', 'js/waves.js', 'js/time-borders.js', 'js/routing-cards.js', 'js/sources-list.js'];
test('⑤ the ten files that kept copies delegate to the encoder, and the delegate is safe when evaluated', () => {
  for (const f of TEN) {
    const src = rd(f);
    assert.equal(scanSource(src).escaper.length, 0, `${f} still carries an escaper of its own`);
    /* the delegate: a one-parameter function whose whole body is <window|globalThis>.IntMapSafe.html(param) */
    const del = [...nodes(parse(src))].filter((n) => /^(?:FunctionDeclaration|FunctionExpression|ArrowFunctionExpression)$/.test(n.type)
      && n.params.length === 1 && n.params[0].type === 'Identifier').map((n) => {
      let e = n.body;
      if (e.type === 'BlockStatement') { if (e.body.length !== 1 || e.body[0].type !== 'ReturnStatement') return null; e = e.body[0].argument; }
      if (!e || e.type !== 'CallExpression' || !/^(?:window|globalThis)\.IntMapSafe\.html$/.test(src.slice(e.callee.start, e.callee.end))) return null;
      if (!(e.arguments.length === 1 && e.arguments[0].type === 'Identifier' && e.arguments[0].name === n.params[0].name)) return null;
      return src.slice(n.start, n.end).replace(/^function\s+\w+/, 'function');
    }).filter(Boolean);
    assert.ok(del.length >= 1, `${f} has a one-line delegate to IntMapSafe.html`);
    for (const d of del) {
      const fn = new Function('window', 'globalThis', 'return (' + d + ');')({ IntMapSafe: SAFE }, { IntMapSafe: SAFE });
      for (const h of HOSTILE) assert.ok(inertInAttr(fn(h)), `${f}: ${JSON.stringify(h)} → ${fn(h)}`);
      assert.equal(fn(null), '', `${f}: null is empty`);
    }
  }
});

test('⑤ end to end: a Layers row and an Atlas markdown link, rendered by the modules as shipped', async () => {
  /* layer-manifest imports the encoder itself — nothing is installed for it */
  const M = await import('../js/layer-manifest.js');
  const row = M.rowHTML({ id: 'x"><img src=x onerror=alert(1)>', label: "it's <b>" }, (k) => k + '"');
  assert.doesNotMatch(row, /<img|<b>/);
  assert.match(row, /id="x&quot;&gt;&lt;img src=x onerror=alert\(1\)&gt;"/);
  assert.match(row, /data-i18n="it&#39;s &lt;b&gt;"/);
  /* atlas-markdown: a link whose target carries a back-tick and a blank comes out through the scheme guard */
  const { makeAtlasMarkdown } = await import('../js/atlas-markdown.js');
  const md = makeAtlasMarkdown({ esc: (s) => SAFE.html(s), L: (en) => en });
  const out = md.renderMarkdown('see [here](https://ok.example/a`b) and https://ok.example/c');
  const hrefs = [...out.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
  assert.ok(hrefs.length >= 2, out);
  for (const h of hrefs) assert.ok(h.startsWith('https://ok.example/') && !/[`<>'"\s]/.test(h), h);
});

/* ── ⑥ ─────────────────────────────────────────────────────────────────────── */
test('⑥ IntMapSafe.text parses in an inert document — the live one is never asked — and the news ingest uses it', () => {
  const live = { createElement() { throw new Error('the LIVE document was asked to parse untrusted HTML'); } };
  let madeInert = 0; const parsed = [];
  const TEXT_OF = new Map([['<p>A &amp; B<img src=x onerror=alert(1)></p>', 'A & B'], ['<b>C</b>', 'C']]);
  live.implementation = { createHTMLDocument() { madeInert++; return { createElement: () => ({
    set innerHTML(v) { parsed.push(v); this._t = TEXT_OF.get(String(v)); },
    get textContent() { return this._t; } }) }; } };
  const S = installSafe({}, { document: live });
  assert.equal(S.text('<p>A &amp; B<img src=x onerror=alert(1)></p>'), 'A & B');
  assert.equal(S.text('<b>C</b>'), 'C');
  assert.equal(S.text(''), '');
  assert.equal(S.text(null), '');
  assert.equal(madeInert, 1, 'one inert document, reused');
  assert.equal(parsed.length, 2, 'empty input is not parsed at all');
  assert.equal(scanSource(rd('js/safe-html.js')).parseText.length, 0, 'the gate sees no live-document parse in the encoder');
  /* the ingest's stripHTML is a delegate to it */
  const feed = rd('js/news-feed.js');
  const fn = [...nodes(parse(feed))].find((n) => n.type === 'FunctionDeclaration' && n.id.name === 'stripHTML');
  assert.ok(fn && /window\.IntMapSafe\.text\(s\)/.test(feed.slice(fn.start, fn.end)), 'stripHTML delegates to IntMapSafe.text');
});

/* ── ⑦ ─────────────────────────────────────────────────────────────────────── */
test('⑦ a copy re-added to one of those files is counted by the gate', () => {
  const f = 'js/layer-manifest.js';
  const src = rd(f);
  const mutated = src.replace('const esc = (s) => globalThis.IntMapSafe.html(s);',
    "const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');");
  assert.notEqual(mutated, src, 'the delegate line is where this check expects it');
  const found = scanSource(mutated);
  assert.equal(found.escaper.length, 1);
  const tree = { ...measured(), [f]: found };
  const problems = safeOutputProblems({ measured: tree, ledger: readLedger() });
  assert.ok(problems.some((p) => p.startsWith(f + ': 1 escaper where the ledger allows 0')), problems.join('\n'));
  /* and an unguarded href put back into the Atlas link cards */
  const reply = rd('js/atlas-reply.js');
  const bare = reply.replace("href=\"'+esc(globalThis.IntMapSafe.url(c.url))+'\"", "href=\"'+esc(c.url)+'\"");
  assert.notEqual(bare, reply);
  assert.equal(scanSource(bare).rawUrlAttr.length, scanSource(reply).rawUrlAttr.length + 1);
});
