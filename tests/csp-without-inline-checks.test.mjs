/* ============================================================================
 *  csp-without-inline — the pages' script policy admits inline code by hash, never wholesale
 * ----------------------------------------------------------------------------
 *  scripts/csp.mjs is the rule (a check in `npm run check:static`) and the build step; js/inline-actions.js
 *  is the one way markup runs code. Every clause is fed the defect it exists for, so a rule that has
 *  stopped seeing is red here, not silently green. The browser half — whether Chromium agrees with the
 *  hashes — is tests/security.spec.js «no CSP violation».
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  inlineScripts, scriptHash, withInlineHashes, readPolicy, pagePolicyProblems,
  inlineAttributeSites, actionSites, scriptPolicyProblems, cspHashesPlugin,
} from '../scripts/csp.mjs';
import { ACTIONS, EVENTS, dispatch } from '../js/inline-actions.js';
import { STAMP_TOKEN } from '../scripts/build-stamp.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (f) => readFileSync(join(ROOT, f), 'utf8');
const page = (policy, body) => `<!DOCTYPE html><html><head><meta charset="utf-8">`
  + `<meta http-equiv="Content-Security-Policy" content="${policy}">${body}</head><body></body></html>`;

test('① the parser sees the scripts the browser runs — not a comment, not a data block, not an external file', () => {
  const html = '<head><!-- the tag <script>evil()</script> is prose here --><script>a()</script>'
    + '<script type="application/ld+json">{"x":1}</script><script src="/x.js"></script>'
    + '<script type="module">b()</script><SCRIPT>c()</SCRIPT><scripts>no</scripts></head>';
  assert.deepEqual(inlineScripts(html).map((s) => s.text), ['a()', 'b()', 'c()']);
});

test('② the hash is of the text the HTML tokenizer hands the CSP: CR LF and a lone CR are LF', () => {
  assert.equal(scriptHash('a();\r\nb();'), scriptHash('a();\nb();'));
  assert.equal(scriptHash('a();\rb();'), scriptHash('a();\nb();'));
  /* a known vector: sha256 of the empty string */
  assert.equal(scriptHash(''), "'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU='");
});

test('③ withInlineHashes writes exactly the page\'s hashes after \'self\', replaces stale ones, and is idempotent', () => {
  const stale = page("default-src 'self'; script-src 'self' 'sha256-STALE=' 'unsafe-eval' https://x.example", '<script>one()</script><script>two()</script>');
  const w = withInlineHashes(stale);
  const script = readPolicy(w).find((d) => d[0] === 'script-src');
  assert.deepEqual(script, ['script-src', "'self'", scriptHash('one()'), scriptHash('two()'), "'unsafe-eval'", 'https://x.example']);
  assert.equal(withInlineHashes(w), w);
  assert.deepEqual(pagePolicyProblems('p.html', w), []);
});

test('④ the page rule refuses each defect it names', () => {
  const ok = withInlineHashes(page("script-src 'self'", '<script>x()</script>'));
  assert.deepEqual(pagePolicyProblems('p.html', ok), []);
  assert.match(pagePolicyProblems('p.html', ok.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")).join(), /unsafe-inline/);
  assert.match(pagePolicyProblems('p.html', ok.replace("script-src 'self'", "script-src 'self' 'unsafe-hashes'")).join(), /unsafe-hashes/);
  assert.match(pagePolicyProblems('p.html', ok.replace('x()', 'y()')).join(), /not in script-src/);
  assert.match(pagePolicyProblems('p.html', ok.replace('x()', 'y()')).join(), /no inline <script> on the page has/);
  assert.match(pagePolicyProblems('p.html', '<html><head><script>x()</script></head></html>').join(), /no Content-Security-Policy/);
  /* Search Console's one-line token file is not a document */
  assert.deepEqual(pagePolicyProblems('google0.html', 'google-site-verification: google0.html'), []);
});

test('⑤ an inline event attribute is found where it is markup — a JS string, a template, an HTML tag — and not elsewhere', () => {
  const js = [
    "el.innerHTML = '<button onclick=\"go()\">x</button>';",
    'el.innerHTML = `<img src="${u}" onerror="this.remove()">`;',
    "h += '<a onmouseover=\\'x()\\'>';",
    '/* <b onclick="inAComment()"> */ // <i onclick="alsoAComment()">',
    'btn.onclick = () => go(); img.onerror = null; const onerr = 1;',
  ].join('\n');
  assert.deepEqual(inlineAttributeSites('js/x.js', js).map((s) => [s.line, s.attr]), [[1, 'onclick'], [2, 'onerror'], [3, 'onmouseover']]);
  const html = '<head><!-- <b onclick="x()"> --><script>var s = "<i onclick=\\"y()\\">";</script></head><body><div onload="z()"></div></body>';
  assert.deepEqual(inlineAttributeSites('p.html', html).map((s) => s.attr).sort(), ['onclick', 'onload']);
});

test('⑥ every action name is declared, for its event, and every declared one is used — names are literal', () => {
  const decl = { go: { on: 'click' }, idle: { on: 'click' } };
  const files = [{ rel: 'js/a.js', text: "x='<b data-im-click=\"go\">'; y='<i data-im-change=\"go\">'; z='<u data-im-click=\"nope\">'; w=`<s data-im-click=\"${n}\">`;" }];
  const p = scriptPolicyProblems(files, decl).join('\n');
  assert.match(p, /data-im-change="go" — .* declares that action for click/);
  assert.match(p, /data-im-click="nope" is not declared/);
  assert.match(p, /names its action by an expression/);
  assert.match(p, /ACTIONS\.idle is declared and written nowhere/);
  assert.equal(actionSites('js/a.js', '// data-im-click="commentOnly"').length, 0);
});

test('⑦ the served code today: no inline event attribute, every action declared and used', async () => {
  const { collectServed } = await import('../scripts/runtime-scripts.mjs');
  const files = collectServed(ROOT).filter((f) => f.rel.startsWith('js/') || f.rel.startsWith('src/') || f.rel.endsWith('.html'));
  assert.deepEqual(scriptPolicyProblems(files, ACTIONS), []);
});

test('⑧ index.html: the hashes the build writes are of the text after the stamp is filled in', async () => {
  const src = rd('index.html');
  assert.ok(src.includes(STAMP_TOKEN), 'index.html still carries the build-stamp token');
  assert.ok(!readPolicy(src).find((d) => d[0] === 'script-src').includes("'unsafe-inline'"));
  const stamped = src.split(STAMP_TOKEN).join('2026-10-02T00:00:00Z-abcdef1');
  /* the source's own hashes are of the token text, so they are stale once the stamp is in … */
  assert.notDeepEqual(pagePolicyProblems('index.html', stamped), []);
  /* … and the plugin's post transform is what makes the shipped page right */
  const plugin = cspHashesPlugin();
  assert.equal(plugin.transformIndexHtml.order, 'post');
  assert.deepEqual(pagePolicyProblems('index.html', plugin.transformIndexHtml.handler(stamped)), []);
  /* nothing after it in the build's plugin list changes the text it hashed: every later plugin declares on itself that
     it writes nothing into the output (the build lock — build-isolation — whose closeBundle must run after every other) */
  const plugins = (await import('../vite.config.js')).default.plugins.flat().filter(Boolean);
  const at = plugins.findIndex((p) => p.name === plugin.name);
  assert.ok(at >= 0, 'cspHashesPlugin is in the build');
  assert.deepEqual(plugins.slice(at + 1).filter((p) => p.writesNothing !== true).map((p) => p.name), []);
});

test('⑨ the listener: a declared action runs for a click inside its element; an undeclared name calls nothing', () => {
  const log = [];
  const g = globalThis;
  const keepWin = g.window;
  g.window = { _closePinPopup: () => log.push('closed'), _sfRemove: (i) => log.push('remove ' + i), __imErrors: [] };
  try {
    const el = (attrs, parent = null) => ({
      attrs, parentElement: parent,
      getAttribute: (k) => (k in attrs ? attrs[k] : null),
      hasAttribute: (k) => k in attrs,
      closest(sel) { const k = /\[([^\]]+)\]/.exec(sel)[1]; let e = this; while (e) { if (e.hasAttribute(k)) return e; e = e.parentElement; } return null; },
    });
    const btn = el({ 'data-im-click': 'pinPopupClose' });
    dispatch({ type: 'click', target: el({}, btn), cancelBubble: false });
    dispatch({ type: 'click', target: el({ 'data-im-click': 'statsFilterRemove', 'data-im-arg': '2' }), cancelBubble: false });
    dispatch({ type: 'click', target: el({ 'data-im-click': 'statsFilterRemove', 'data-im-arg': '2);alert(1' }), cancelBubble: false });
    dispatch({ type: 'click', target: el({ 'data-im-click': '_closePinPopup' }), cancelBubble: false });
    assert.deepEqual(log, ['closed', 'remove 2']);
    const kinds = g.window.__imErrors.map((e) => e.msg);
    assert.ok(kinds.some((m) => /bad-index/.test(m)), 'a non-integer index is refused');
    assert.ok(kinds.some((m) => /unknown-action click:_closePinPopup/.test(m)), 'a window function name is not an action');
  } finally { g.window = keepWin; }
  assert.deepEqual([...EVENTS].sort(), ['change', 'click', 'error']);
  for (const [name, a] of Object.entries(ACTIONS)) assert.equal(typeof a.run, 'function', name);
});
