/* ============================================================================
 *  safe-output-one-source — ONE output encoder, and a ratchet on the copies
 * ----------------------------------------------------------------------------
 *  ① every local escaper that now delegates to window.IntMapSafe.html is FOUND in the tree (not
 *    listed here) and evaluated with the REAL IntMapSafe out of index.html: an attribute-breaking
 *    payload stays inert — five of the old copies did not encode `"`.
 *  ② the webcam preset gallery (js/cameras.js), evaluated as written: javascript: is dropped and a
 *    quote in an OSM-editable URL cannot close data-u / src.
 *  ③ the news ingest's HTML-to-text runs in an INERT document (createHTMLDocument), never the live one.
 *  ④ the gate (scripts/safe-output.mjs): each shape it counts is counted, each safe form is not,
 *    and the ledger fails in BOTH directions.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import * as acorn from 'acorn';
import { scanSource, safeOutputProblems } from '../scripts/safe-output.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
const parse = (src) => { try { return acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module' }); } catch { return acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script', allowReturnOutsideFunction: true }); } };
function* nodes(n) {
  if (!n || typeof n.type !== 'string') return;
  yield n;
  for (const k in n) { const v = n[k]; if (Array.isArray(v)) { for (const c of v) yield* nodes(c); } else if (v && typeof v.type === 'string') yield* nodes(v); }
}

/* the real encoder, evaluated out of js/safe-html.js (safe-output-single-module moved it there from
   index.html) in a context of its own — `ctx` is that context's global, so it gets its own document */
const loadSafe = (ctx = {}) => { vm.runInNewContext(rd('js/safe-html.js'), ctx); return ctx.IntMapSafe; };
const SAFE = loadSafe();

const HOSTILE = ['"><img src=x onerror=alert(1)>', "'><svg onload=alert(1)>", '<script>alert(1)</script>', 'a&b "c" \'d\''];
const inertInAttr = (out) => !/["'<>]/.test(out);

/* ── ① ─────────────────────────────────────────────────────────────────────── */
test('① every one-line delegate to IntMapSafe.html, evaluated: quotes and tags come out inert', () => {
  /* discovered, not listed: a function of ONE parameter whose whole body is window.IntMapSafe.html(<that parameter>) */
  const found = [];
  const walk = (dir) => { for (const n of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    if (n.isDirectory()) walk(dir + '/' + n.name); else if (n.name.endsWith('.js')) found.push(dir + '/' + n.name); } };
  walk('js');
  const delegates = [];
  for (const f of found) {
    const src = rd(f);
    if (!src.includes('IntMapSafe.html(')) continue;
    for (const n of nodes(parse(src))) {
      if (!/^(?:FunctionDeclaration|FunctionExpression|ArrowFunctionExpression)$/.test(n.type) || n.params.length !== 1 || n.params[0].type !== 'Identifier') continue;
      let e = n.body;
      if (e.type === 'BlockStatement') { if (e.body.length !== 1 || e.body[0].type !== 'ReturnStatement') continue; e = e.body[0].argument; }
      if (!e || e.type !== 'CallExpression' || src.slice(e.callee.start, e.callee.end) !== 'window.IntMapSafe.html') continue;
      if (!(e.arguments.length === 1 && e.arguments[0].type === 'Identifier' && e.arguments[0].name === n.params[0].name)) continue;
      delegates.push({ f, src: src.slice(n.start, n.end) });
    }
  }
  /* MEASURED 2026-09-29: this change left 25 such delegates in 25 files (a floor, not a count to keep) */
  assert.ok(delegates.length >= 25, `the delegates are still there (${delegates.length})`);
  for (const d of delegates) {
    const fn = new Function('window', 'return (' + d.src.replace(/^function\s+\w+/, 'function') + ');')({ IntMapSafe: SAFE });
    for (const h of HOSTILE) assert.ok(inertInAttr(fn(h)), `${d.f}: ${JSON.stringify(h)} → ${fn(h)}`);
    assert.equal(fn(null), '', `${d.f}: null is empty, not "null"`);
  }
  /* the two of the five copies that did not encode `"` which this change could reach */
  for (const f of ['js/analysis-edu.js', 'js/analysis-research.js']) assert.ok(delegates.some((d) => d.f === f), f + ' delegates');
});

/* ── ② ─────────────────────────────────────────────────────────────────────── */
test('② the webcam preset gallery drops javascript: and cannot be closed by a quote in the URL', () => {
  const src = rd('js/cameras.js');
  const cb = [...nodes(parse(src))].find((n) => n.type === 'ArrowFunctionExpression' && n.params.length === 2
    && /class="wc-thumb" data-u=/.test(src.slice(n.start, n.end)));
  assert.ok(cb, 'the preset thumbnail builder is still one arrow');
  const build = new Function('IntMapSafe', 'LLw', 'return (' + src.slice(cb.start, cb.end) + ');')(SAFE, (en) => en);
  assert.equal(build('javascript:alert(1)', 0), '', 'a non-http(s) preset is not drawn at all');
  assert.equal(build('data:text/html,<script>alert(1)</script>', 0), '');
  const out = build('https://cam.example/x.jpg"><img src=x onerror=alert(1)>', 0);
  assert.ok(out.length > 0);
  /* exactly the two attributes that carry the URL, and neither contains a quote, tag or handler */
  const vals = [...out.matchAll(/\b(?:data-u|src)="([^"]*)"/g)].map((m) => m[1]);
  assert.equal(vals.length, 2, out);
  for (const v of vals) assert.ok(!/[<>'"]/.test(v) && v.startsWith('https://cam.example/'), v);
  assert.equal((out.match(/<img\b/g) || []).length, 1, 'no second <img> was injected');
});

/* ── ③ ─────────────────────────────────────────────────────────────────────── */
test('③ the news ingest reads RSS markup in an inert document — the live one never parses it', () => {
  /* the real stripHTML, evaluated out of js/news-feed.js, over the real IntMapSafe.text (js/safe-html.js —
     safe-output-single-module moved the inert parse there) given a document that throws if IT is asked to parse */
  const feed = rd('js/news-feed.js');
  const ast = parse(feed);
  const fn = [...nodes(ast)].find((n) => n.type === 'FunctionDeclaration' && n.id.name === 'stripHTML');
  assert.ok(fn, 'stripHTML is still a declaration in js/news-feed.js');
  const live = { createElement() { throw new Error('the LIVE document was asked to parse untrusted HTML'); } };
  let madeInert = 0; const parsed = [];
  /* a fake that does not parse (nor strip): it answers the text of the inputs this test gives it, by lookup */
  const TEXT_OF = new Map([['<p>A &amp; B<img src=x onerror=alert(1)></p>', 'A & B'], ['<b>C</b>', 'C']]);
  live.implementation = { createHTMLDocument() { madeInert++; return { createElement: () => ({
    set innerHTML(v) { parsed.push(v); this._t = TEXT_OF.get(String(v)); },
    get textContent() { return this._t; } }) }; } };
  const stripHTML = new Function('window', 'document', feed.slice(fn.start, fn.end) + '; return stripHTML;')({ IntMapSafe: loadSafe({ document: live }) }, live);
  assert.equal(stripHTML('<p>A &amp; B<img src=x onerror=alert(1)></p>'), 'A & B');
  assert.equal(stripHTML('<b>C</b>'), 'C');
  assert.equal(stripHTML(''), '');
  assert.equal(stripHTML(undefined), '');
  assert.equal(madeInert, 1, 'one inert document, reused');
  assert.equal(parsed.length, 2);
  assert.equal(scanSource(feed).parseText.length, 0, 'the gate sees no live-document parse left in the file');
});

/* ── ④ ─────────────────────────────────────────────────────────────────────── */
test('④ the gate counts each shape by its form, not its name', () => {
  const n = (src, k) => scanSource(src)[k].length;
  /* escapers — two forms, any name; a decoder is not an encoder */
  assert.equal(n("const zz=(s)=>String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));", 'escaper'), 1);
  assert.equal(n("function q(s){ return s.replace(/&/g,'&amp;').replace(/</g,'&lt;'); }", 'escaper'), 1);
  assert.equal(n("const e=(s)=>s.split('&').join('&amp;').split('<').join('&lt;');", 'escaper'), 1);
  assert.equal(n("const d=(s)=>s.replace(/&lt;/g,'<').replace(/&amp;/g,'&');", 'escaper'), 0, 'a decoder');
  assert.equal(n("const m={'&amp;':'&','&lt;':'<'};", 'escaper'), 0, 'a decoding table (keys)');
  assert.equal(n("const esc=(s)=>window.IntMapSafe.html(s);", 'escaper'), 0);
  /* the old stripHTML, verbatim, is counted; the inert one is not */
  assert.equal(n("function stripHTML(s){ const d=document.createElement('div'); d.innerHTML=s||''; return d.textContent||d.innerText||''; }", 'parseText'), 1);
  assert.equal(n("function t(s){ const d=doc.createElement('div'); d.innerHTML=s; return d.textContent; }", 'parseText'), 0);
  assert.equal(n("function r(s){ const d=document.createElement('div'); d.innerHTML='<b>x</b>'; return d.textContent; }", 'parseText'), 0, 'a constant');
  assert.equal(n("function r(s){ const d=document.createElement('div'); d.innerHTML=s; host.appendChild(d); }", 'parseText'), 0, 'rendering, not text extraction');
  /* href/src — what STARTS the value decides the scheme */
  assert.equal(n(`h='<a href="'+u+'">';`, 'rawUrlAttr'), 1);
  assert.equal(n(`h='<img src="'+esc(u)+'">';`, 'rawUrlAttr'), 1, 'escaping is not a scheme check');
  assert.equal(n("h=`<img src=\"${u}\">`;", 'rawUrlAttr'), 1);
  assert.equal(n(`const su=String(u).replace(/"/g,'&quot;'); h='<img src="'+su+'">';`, 'rawUrlAttr'), 1, 'the old camera form');
  assert.equal(n(`h='<a href="'+IntMapSafe.html(IntMapSafe.url(u))+'">';`, 'rawUrlAttr'), 0);
  assert.equal(n(`const S=window.IntMapSafe; h='<a href="'+S.url(u)+'">';`, 'rawUrlAttr'), 0);
  assert.equal(n(`h='<a href="https://x.org/'+encodeURIComponent(id)+'">';`, 'rawUrlAttr'), 0, 'a constant fixes the scheme');
  assert.equal(n(`h='<a href="'+'https://x.org/'+id+'">';`, 'rawUrlAttr'), 0);
  assert.equal(n(`function w(n){ return 'https://en.wikipedia.org/wiki/'+encodeURIComponent(n); } h='<a href="'+w(x)+'">';`, 'rawUrlAttr'), 0, 'a builder read');
  assert.equal(n(`function w(n){ return n; } h='<a href="'+w(x)+'">';`, 'rawUrlAttr'), 1, 'a builder that passes its input through');
});

test('④ the ledger fails in both directions, and a kept copy must say why', () => {
  const measured = { 'js/a.js': { escaper: [{ line: 1, name: 'esc' }, { line: 9, name: 'esc2' }] } };
  assert.equal(safeOutputProblems({ measured, ledger: { pending: { 'js/a.js': { escaper: 2 } }, kept: {} } }).length, 0);
  assert.match(safeOutputProblems({ measured, ledger: { pending: { 'js/a.js': { escaper: 1 } }, kept: {} } })[0], /2 escaper where the ledger allows 1/);
  assert.match(safeOutputProblems({ measured, ledger: { pending: { 'js/a.js': { escaper: 3 } }, kept: {} } })[0], /lower the ledger/);
  assert.match(safeOutputProblems({ measured: {}, ledger: { pending: {}, kept: { 'js/x.js': { escaper: 0 } } } }).join(), /must say WHY/);
  /* a file nobody has heard of gets zero */
  assert.equal(safeOutputProblems({ measured: { 'js/new.js': { rawUrlAttr: [{ line: 3, name: 'u' }] } }, ledger: { pending: {}, kept: {} } }).length, 1);
});

test('④ the tree matches the ledger (the gate check:static runs)', () => {
  assert.deepEqual(safeOutputProblems(), []);
});
