/* ============================================================================
 *  safe-dom-template — markup is built by a tag that escapes by default, and the gate reads it
 * ----------------------------------------------------------------------------
 *  ① js/safe-html.js `IntMapSafe.markup` (aliased `html`): a value is escaped for WHERE it lands —
 *     text, a quoted attribute value, the start of an href/src (IntMapSafe.url), between attributes
 *     (bare names only) — and refused where escaping does not protect (a tag or attribute name, an
 *     unquoted value, an on* handler, <script>, a comment, a template ending inside a tag). Markup the
 *     tag made, or `trusted(x)`, goes in as it is, so nothing is escaped twice. null/undefined → '',
 *     arrays are concatenated.
 *  ② scripts/output-taint.mjs (check:static `output-taint`) reads the tag: a tagged template is safe
 *     whatever it interpolates; every `IntMapSafe.trusted(x)` is judged where it is written, by x; an
 *     alias of `trusted` is a leaf of its own; a template the tag would refuse is refused by the gate,
 *     with the tag's own plan. The pages (every tracked *.html) are measured too.
 *  ③ the ledger (tests/output-taint-baseline.json) agrees with the tree, and goes red when one migrated
 *     sink in js/data-layers.js, js/stats-compare.js or admin.html is put back to a raw value — in
 *     memory, no file in the working tree is written.
 *  ④ scripts/safe-output.mjs: an href/src started inside the tag is not a raw URL attribute (the tag
 *     runs IntMapSafe.url itself), the same href in an untagged template still is; and a page's inline
 *     scripts are read past a comment that mentions <script>.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { measure, check, LEDGER, discoverPages } from '../scripts/output-taint.mjs';
import { scanSource, inlineScripts } from '../scripts/safe-output.mjs';
import { parseSource } from './helpers/ast.mjs';
import '../js/safe-html.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const S = globalThis.IntMapSafe;
const html = S.markup;
const str = (m) => String(m);

/* ══ ① the tag ═══════════════════════════════════════════════════════════════════════════════════ */

test('①a a value is escaped as text and as an attribute value; a markup object is not escaped again', () => {
  const x = `<img src=x onerror=alert(1)>"'&`;
  assert.equal(str(html`<b title="${x}">${x}</b>`),
    '<b title="&lt;img src=x onerror=alert(1)&gt;&quot;&#39;&amp;">&lt;img src=x onerror=alert(1)&gt;&quot;&#39;&amp;</b>');
  assert.equal(str(html`<p>${html`<i>${'a & b'}</i>`}</p>`), '<p><i>a &amp; b</i></p>', 'a nested template is inserted as it is');
  assert.equal(str(html`<p>${S.trusted('<em>ok</em>')}</p>`), '<p><em>ok</em></p>');
  assert.equal(str(html`<p title="${html`a &amp; b`}">x</p>`), '<p title="a &amp; b">x</p>',
    'a markup object in an attribute keeps its entities (no second escape) — only its quotes are encoded');
  assert.equal(str(html`<p title='${html`<b class="q">`}'>x</p>`), `<p title='<b class=&quot;q&quot;>'>x</p>`);
  assert.equal(str(html`<p>${'<b>'}</p>`), '<p>&lt;b&gt;</p>', 'a STRING of markup is text — the reason a builder must return html`…`');
});

test('①b null and undefined are empty, numbers are text, arrays are concatenated item by item', () => {
  assert.equal(str(html`<p>${null}${undefined}${0}${1.5}</p>`), '<p>01.5</p>');
  assert.equal(str(html`<ul>${['<a>', html`<li>${'&'}</li>`, [1, [2]]]}</ul>`), '<ul>&lt;a&gt;<li>&amp;</li>12</ul>');
  assert.equal(str(html``), '');
  assert.ok(S.isMarkup(html`x`) && !S.isMarkup('x') && !S.isMarkup({ s: '<b>' }), 'a look-alike object is not markup');
});

test('①c the value that starts an href/src passes IntMapSafe.url; a later one, or a fixed prefix, is an attribute value', () => {
  assert.equal(str(html`<a href="${'javascript:alert(1)'}">a</a>`), '<a href="">a</a>');
  assert.equal(str(html`<a href="${'https://e.org/?q="x"&r=1'}">a</a>`), '<a href="https://e.org/?q=%22x%22&amp;r=1">a</a>');
  assert.equal(str(html`<img src="${'data:image/png;base64,AAA'}">`), '<img src="data:image/png;base64,AAA">', 'a raster data: image is allowed');
  assert.equal(str(html`<img src="${'data:image/svg+xml,<svg onload=alert(1)>'}">`), '<img src="">', 'an SVG data: URI is not');
  assert.equal(str(html`<a href="/search?q=${'"><script>'}">a</a>`), '<a href="/search?q=&quot;&gt;&lt;script&gt;">a</a>',
    'after a fixed prefix the scheme is settled and the value is an attribute value');
  assert.equal(str(html`<a HREF="${'vbscript:x'}">a</a>`), '<a HREF="">a</a>', 'attribute names are case-insensitive');
});

test('①d between attributes only bare names go in — the `selected` / `checked` toggle', () => {
  assert.equal(str(html`<option value="1"${true ? ' selected' : ''}>x</option>`), '<option value="1" selected>x</option>');
  assert.equal(str(html`<option value="1"${''}${null}${false}>x</option>`), '<option value="1">x</option>');
  assert.equal(str(html`<input ${'checked disabled'}>`), '<input checked disabled>');
  assert.throws(() => html`<a ${'href="javascript:alert(1)"'}>`, /bare attribute names/);
  assert.throws(() => html`<a ${'x onclick=alert(1)//'}>`, /bare attribute names/);
});

test('①e refused where escaping does not protect — at the first use, before anything is written', () => {
  const x = 'v';
  for (const [why, f] of [
    ['a tag name', () => html`<${x}>`],
    ['a tag name', () => html`<h${x}>`],
    ['an attribute name', () => html`<a data-${x}="1">`],
    ['unquoted', () => html`<a href=${x}>`],
    ['on* handler', () => html`<a onclick="go('${x}')">`],
    ['srcdoc', () => html`<iframe srcdoc="${x}"></iframe>`],
    ['SVG animation', () => html`<svg><a><animate attributeName="href" to="${x}"/></a></svg>`],
    ['script', () => html`<script>var a='${x}'</script>`],
    ['style', () => html`<style>a{color:${x}}</style>`],
    ['comment', () => html`<!-- ${x} -->`],
    ['ends inside a tag', () => html`<b class="${x}`],
  ]) assert.throws(f, TypeError, why);
  assert.equal(str(html`<textarea>${'</textarea><script>'}</textarea>`), '<textarea>&lt;/textarea&gt;&lt;script&gt;</textarea>');
});

test('①f the plan is a pure function of the static text, made once per template', () => {
  const p = S.markup.plan(['<a href="', '" title="', '">', '</a><option value="1"', '>']);
  assert.deepEqual(p.map((x) => x.at), ['url', 'attr', 'text', 'names']);
  const site = (v) => html`<i>${v}</i>`;
  site(1);
  const strings = ((s) => s)`<i>${0}</i>`;
  assert.strictEqual(S.markup.plan(strings), S.markup.plan(strings), 'cached on the strings array');
});

/* ══ ② the gate reads the tag ═══════════════════════════════════════════════════════════════════════ */

const leavesOf = (src) => Object.values(measure(ROOT, { 'js/x.js': src }).files).flat().flatMap((s) => s.leaves.map((l) => l.text));

test('② a tagged template is safe whatever it interpolates; trusted(x) is judged by x; an alias of trusted is a leaf', () => {
  assert.deepEqual(leavesOf(`const html=window.IntMapSafe.markup; function f(p){ el.innerHTML = html\`<b>\${p.name}</b>\`; }`), []);
  assert.deepEqual(leavesOf(`function f(p){ el.innerHTML = \`<b>\${p.name}</b>\`; }`), ['p.name'], 'the same template without the tag');
  assert.deepEqual(leavesOf(`const html=window.IntMapSafe.markup; const row=(p)=>html\`<li>\${p.n}</li>\`; function f(xs){ el.innerHTML = html\`<ul>\${xs.map(row)}</ul>\`; }`), []);
  assert.deepEqual(leavesOf(`function f(p){ const m = window.IntMapSafe.trusted(p.bio); box.append(m); }`), ['p.bio'],
    'trusted() is judged where it is written, even when its result is not written to a sink in this file');
  assert.deepEqual(leavesOf(`function f(p){ const m = window.IntMapSafe.trusted(window.IntMapSafe.flag(p.flag)); }`), [], 'vouching for an encoder\'s answer');
  assert.deepEqual(leavesOf(`const T = window.IntMapSafe.trusted; function f(p){ el.innerHTML = T(p.x); }`).length, 2,
    'an alias hides what it is given: the alias is a leaf, and its call is no longer known to be safe');
});

test('② a template the tag would refuse is refused by the gate, with the tag\'s own plan', () => {
  const tree = { 'js/x.js': `const html=window.IntMapSafe.markup; function f(p){ el.innerHTML = html\`<a href=\${p.u}>x</a>\`; }` };
  const r = check(ROOT, LEDGER, { ...jsTree(), ...tree });
  assert.ok(r.lines.some((l) => /^js\/x\.js:1 .*unquoted attribute value.*refuses this template/.test(l)), r.lines.join('\n'));
});

test('② the pages are in the universe: every tracked *.html, discovered — admin.html\'s sinks are measured', () => {
  const pages = discoverPages(ROOT);
  assert.ok('admin.html' in pages && 'index.html' in pages, Object.keys(pages).join(', '));
  assert.ok(Object.keys(pages).every((p) => p.endsWith('.html')));
  const m = measure(ROOT, {}, { 'admin.html': pages['admin.html'] });
  assert.ok((m.files['admin.html'] || []).length >= 20, 'admin.html writes its tables through innerHTML');
  assert.ok(pages['admin.html'].includes('</body>'));
  const probe = pages['admin.html'].replace('</body>', '<script>function __probe(p){ document.body.innerHTML = p.title; }</script>\n</body>');
  const m2 = measure(ROOT, {}, { 'admin.html': probe });
  assert.equal(m2.counts['admin.html'], 1, 'a raw value written in a page is counted at its page');
});

/* ══ ③ the ledger and the three migrated files ═══════════════════════════════════════════════════ */

function jsTree() {
  const out = {};
  (function go(dir) {
    for (const n of readdirSync(dir).sort()) {
      const a = join(dir, n);
      if (statSync(a).isDirectory()) go(a); else if (n.endsWith('.js')) out[relative(ROOT, a).replace(/\\/g, '/')] = readFileSync(a, 'utf8');
    }
  })(join(ROOT, 'js'));
  return out;
}
const TREE = jsTree();
const PAGES = discoverPages(ROOT);
const mutate = (map, rel, a, b) => {
  const was = map[rel]; assert.ok(was.includes(a), `${rel} no longer contains: ${a}`);
  return { ...map, [rel]: was.replace(a, b) };
};

test('③ the ledger agrees, and the three migrated files hold no unjudged value', () => {
  const now = check(ROOT, LEDGER, TREE, PAGES);
  assert.ok(now.ok, now.lines.join('\n'));
  const ledger = JSON.parse(readFileSync(LEDGER, 'utf8')).files;
  for (const f of ['js/data-layers.js', 'js/stats-compare.js', 'admin.html']) assert.equal(ledger[f] || 0, 0, f);
});

test('③ putting one migrated sink back to a raw value turns the gate red, in each of the three files', () => {
  const dl = check(ROOT, LEDGER, mutate(TREE, 'js/data-layers.js', 'w.innerHTML=html`<label class="layer-option">', 'w.innerHTML=`<label class="layer-option">'), PAGES);
  assert.ok(dl.lines.some((l) => l.startsWith('js/data-layers.js:') && /i18n\[HOST\.lang\]\[key\]/.test(l)), dl.lines.join('\n'));
  const sc = check(ROOT, LEDGER, mutate(TREE, 'js/stats-compare.js', 'tb.innerHTML=html`<b>${pw}</b>', 'tb.innerHTML=`<b>${pw}</b>'), PAGES);
  assert.ok(sc.lines.some((l) => l.startsWith('js/stats-compare.js:') && /\bpw\b/.test(l)), sc.lines.join('\n'));
  const ad = check(ROOT, LEDGER, TREE, mutate(PAGES, 'admin.html', 'tb.innerHTML=data.map(r=>html`<tr>', 'tb.innerHTML=data.map(r=>`<tr>'));
  assert.ok(ad.lines.some((l) => l.startsWith('admin.html:') && /unjudged value/.test(l)), ad.lines.join('\n'));
});

test('③ a builder that returns markup is built in templates, so a string version of it would be escaped — the flag stays an image', () => {
  const sc = TREE['js/stats-compare.js'];
  assert.match(sc, /const flagM=f=>window\.IntMapSafe\.trusted\(window\.IntMapSafe\.flag\(f\)\);/);
  const IMG = '<img class="hist-flag" alt="" src="data:image/svg+xml,%3Csvg%3E">';
  const flagM = (f) => S.trusted(S.flag(f));
  assert.equal(str(html`${[flagM(IMG), ' ']}${'Name & co'}`), IMG + ' Name &amp; co');
  assert.equal(str(html`${[flagM('<script>'), ' ']}x`), '&lt;script&gt; x', 'anything that is not the flag image is text');
});

/* ⚠ What the gate cannot see is the OTHER way a migration breaks: a builder left returning a STRING of
   markup and put into a template is not unsafe, it is printed as text (`&lt;b&gt;`). So the migrated
   builders are EVALUATED — lifted out of the shipped files with stubs for what they close over — and
   their output, given inputs with no `<` in them, must contain no escaped tag. */
function lift(src, names) {
  const ast = parseSource(src); const out = {};
  (function go(n) {
    if (!n || typeof n.type !== 'string') return;
    if (n.type === 'FunctionDeclaration' && n.id && names.includes(n.id.name) && !out[n.id.name]) out[n.id.name] = src.slice(n.start, n.end);
    if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && names.includes(n.id.name) && !out[n.id.name]) out[n.id.name] = 'const ' + src.slice(n.start, n.end) + ';';
    for (const k in n) { if (k === 'loc') continue; const v = n[k]; if (Array.isArray(v)) v.forEach(go); else if (v && typeof v.type === 'string') go(v); }
  })(ast);
  for (const nm of names) assert.ok(out[nm], 'lifted: ' + nm);
  return names.map((nm) => out[nm]).join('\n');
}
const run = (code, env, ret) => { const ks = Object.keys(env); return new Function(...ks, code + '\nreturn {' + ret.join(',') + '};')(...ks.map((k) => env[k])); };   // eslint-disable-line no-new-func
const ESCAPED_TAG = /&lt;\/?[a-z]/i;

test('③ the migrated builders, evaluated: their markup is markup, not text (no builder was left returning a string)', () => {
  const IMG = '<img class="hist-flag" alt="" src="data:image/svg+xml,%3Csvg%3E">';
  const stats = { AAA: { name: 'Japan', flag: '🇯🇵' }, BBB: { name: 'Prussia', flag: IMG } };
  const SC = run(lift(TREE['js/stats-compare.js'], ['CW', 'CH', 'mChart', 'secHtml', 'fmtSigned', 'barsHtml', 'barBlockHtml', 'blockHtml', '_tsYearList', '_yoptsAvail', '_tsRangeHtml']), {
    window: { IntMapSafe: S }, LL: (...a) => a[0], codes: ['AAA', 'BBB'], PAL: ['#0a84ff', '#ff9500'], esc: S.html, html, flagM: (f) => S.trusted(S.flag(f)),
    tsFrom: 2000, tsTo: null, SIGNED: { g: 1 }, srcSel: {}, _ttYear: () => null, _cs: (cd) => stats[cd] || {}, cName: (s) => s.name, IntMapTime: { min: 1990 }, _tsAvailYears: new Set([2001]),
  }, ['mChart', 'barBlockHtml', 'blockHtml', 'secHtml', '_tsRangeHtml']);
  const ind = { k: 'g', l: ['GDP growth'], fmt: (v) => v.toFixed(1) + '%', imf: true };
  const serMap = { AAA: [{ y: 2000, v: 1 }, { y: 2001, v: -2 }], BBB: [{ y: 2000, v: 3 }, { y: 2001, v: 4 }] };
  const b = { ind, srcName: 'World Bank', imfFail: true, mixed: true, serMap, map: { AAA: { v: -2, y: 2001, src: 'ref' }, BBB: { v: 4 } } };
  for (const [what, out] of [['barBlockHtml', SC.barBlockHtml(b)], ['blockHtml', SC.blockHtml(b)], ['secHtml focus', SC.secHtml(ind, 'IMF', '', true)], ['_tsRangeHtml', SC._tsRangeHtml()]]) {
    assert.ok(S.isMarkup(out), what + ' returns markup');
    assert.doesNotMatch(String(out), ESCAPED_TAG, what + ' printed a tag as text: ' + String(out).slice(0, 200));
  }
  assert.ok(String(SC.barBlockHtml(b)).includes(IMG), 'the former state\'s flag is an image');
  assert.match(String(SC.secHtml(ind, 'IMF', '', true)), /<button class="scp-focus" style="display:none;" data-k="g"/);

  /* (layer-packages) the accession-year key moved with the NATO / EU rows to their layer package */
  const DL = run(lift(TREE['js/data-layers.js'], ['_CHEV_L', '_CHEV_R', 'LEGEND_DESC', 'LEGEND_NOTE', '_legendDesc', '_dateBoxHTML'])
    + '\n' + lift(TREE['js/layer-pkg-alliances.js'], ['yearKeyHTML']), {
    window: { IntMapSafe: S }, html, LA: (...a) => a, LDL: { arr: (a) => a[0] }, t: () => 'Date',
    _dateBounds: () => ({ min: '2020-01-01', max: '2024-02-02' }), layerDates: { x: '2023-05-05' },
  }, ['_legendDesc', 'yearKeyHTML', '_dateBoxHTML']);
  for (const [what, out] of [['_legendDesc', DL._legendDesc('subcables')], ['yearKeyHTML', DL.yearKeyHTML([1949], { 1949: '#111' }, { A: 1949 }, null, null)],
    ['_dateBoxHTML', DL._dateBoxHTML('x', 'lgdt-x', { cls: 'dl-date', style: 'padding:2px;' })]]) {
    assert.ok(S.isMarkup(out), what + ' returns markup');
    assert.doesNotMatch(String(out), ESCAPED_TAG, what + ' printed a tag as text: ' + String(out).slice(0, 200));
  }
  assert.match(String(DL._dateBoxHTML('x', 'dt-x', { style: 's' })), /<button type="button" class="dl-step" data-step="-1"><svg /, 'the chevrons are markup');
});

/* ══ ④ the URL-attribute ratchet and the pages' code ══════════════════════════════════════════════ */

test('④ safe-output: an href started inside the tag is checked by the tag; the same href untagged is a raw URL attribute', () => {
  assert.equal(scanSource('const html=window.IntMapSafe.markup; function f(p){ return html`<a href="${p.u}">x</a>`; }').rawUrlAttr.length, 0);
  assert.equal(scanSource('function f(p){ return `<a href="${p.u}">x</a>`; }').rawUrlAttr.length, 1);
  assert.equal(scanSource('const other=(s)=>s; function f(p){ return other`<a href="${p.u}">x</a>`; }').rawUrlAttr.length, 1, 'only the markup tag');
});

test('④ a page\'s inline scripts are read past a comment that mentions <script>', () => {
  const page = '<!-- the <script> is inserted later -->\n<p>x</p>\n<script>var a=1;</script>\n<script src="x.js"></script>\n<script type="application/json">{}</script>';
  const blocks = inlineScripts(page);
  assert.deepEqual(blocks.map((b) => [b.code, b.lineOffset]), [['var a=1;', 2]]);
  assert.ok(inlineScripts(PAGES['index.html']).some((b) => /clarity\.ms/.test(b.code)),
    'index.html\'s Clarity loader (after a comment that says «<script>») is read');
});
