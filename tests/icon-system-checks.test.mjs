/* icon-system — js/icons.js EVALUATED (every glyph, both ways out, the token form a translation uses), every icon
   name the code writes resolved against the set, and the emoji rule (scripts/icon-glyphs.mjs) shown to catch what
   it says and to pass what it says it passes. The rule is fed text directly (sitesIn), so nothing writes the checkout. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';
import { icon, iconNode, withIcons, hydrateIcons, ICON_NAMES } from '../js/icons.js';
import { sitesIn, iconGlyphProblems, glyphSites, DECLARED } from '../scripts/icon-glyphs.mjs';
import { codeOnly } from '../scripts/code-only.mjs';

const ROOT = join(import.meta.dirname, '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const NAMES = new Set(ICON_NAMES);

/* ── a DOM stand-in: just what iconNode / hydrateIcons touch ───────────────────────────────────── */
function makeDoc() {
  class El {
    constructor(tag) { this.tagName = tag; this.attrs = {}; this.children = []; this.ownerDocument = doc; }
    setAttribute(k, v) { this.attrs[k] = String(v); } getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
    appendChild(c) { this.children.push(c); return c; }
    replaceChildren(...c) { this.children = c; }
    get firstElementChild() { return this.children.find((c) => c && typeof c === 'object') || null; }
  }
  const doc = {
    createElementNS: (ns, tag) => Object.assign(new El(tag), { ns }),
    createElement: (tag) => new El(tag),
    slots: [],
    querySelectorAll(sel) { assert.equal(sel, '[data-icon]'); return this.slots; },
  };
  return doc;
}

test('icon-system ①: every glyph draws, on one grid, in one weight, in the text colour, hidden unless it carries the meaning', () => {
  assert.ok(ICON_NAMES.length >= 100, 'the set has the glyphs the emoji were replaced with (' + ICON_NAMES.length + ')');
  for (const n of ICON_NAMES) {
    const s = String(icon(n));
    assert.match(s, /^<svg class="im-icon" viewBox="0 0 24 24" width="1\.2em" height="1\.2em" /, n);
    assert.match(s, n === 'dot' ? /fill="currentColor" stroke="none"/ : /fill="none" stroke="currentColor"/, n + ' is drawn in currentColor');
    assert.match(s, /stroke-width="1\.75" stroke-linecap="round" stroke-linejoin="round"/, n);
    assert.match(s, /aria-hidden="true"><path d="[MmLlHhVvCcSsQqTtAaZz0-9 .,-]+"\/><\/svg>$/, n + ' is one path, decorative');
  }
  const lab = String(icon('warning', { label: 'Careful "here"', size: 16, cls: 'x' }));
  assert.match(lab, /class="im-icon x"/);
  assert.match(lab, /width="16" height="16"/);
  assert.match(lab, /role="img" aria-label="Careful &quot;here&quot;"/, 'a label is an escaped attribute value');
  assert.throws(() => icon('no-such-glyph'), /no icon named/);
});

test('icon-system ②: iconNode builds the same element with the DOM, and hydrateIcons fills only empty [data-icon] slots', () => {
  const doc = makeDoc();
  const svg = iconNode('play', { doc, size: 20 });
  assert.equal(svg.tagName, 'svg');
  assert.equal(svg.attrs.viewBox, '0 0 24 24');
  assert.equal(svg.attrs.width, '20');
  assert.equal(svg.attrs['aria-hidden'], 'true');
  assert.equal(svg.children[0].tagName, 'path');
  const empty = doc.createElement('span'); empty.setAttribute('data-icon', 'world');
  const drawn = doc.createElement('span'); drawn.setAttribute('data-icon', 'world'); drawn.appendChild(doc.createElement('svg'));
  doc.slots = [empty, drawn];
  assert.equal(hydrateIcons(doc), 1, 'one slot was empty');
  assert.equal(empty.children[0].tagName, 'svg');
  assert.equal(drawn.children.length, 1, 'a drawn slot (or a clone of one) is not drawn twice');
});

test('icon-system ③: a translation names a control by {icon:name}; withIcons draws it and leaves an unknown token visible', () => {
  const out = withIcons('Press {icon:play} to run it. {icon:nope} stays.');
  assert.ok(out.includes(String(icon('play'))));
  assert.ok(out.includes('{icon:nope}'), 'an unknown token is left as written, so the defect shows');
  assert.equal(withIcons(null), '');
});

/* every name the code WRITES — a literal argument of icon()/iconNode()/iconImageData() (both arms of a ternary), an
   `icon:'name'` / weather `i:'name'` row in a file that imports js/icons.js, a data-icon slot, a {icon:name} token */
function namesWritten() {
  const out = [];
  const files = [];
  const walkDir = (d) => { for (const n of readdirSync(join(ROOT, d), { withFileTypes: true })) { const p = d + '/' + n.name; if (n.isDirectory()) walkDir(p); else if (p.endsWith('.js')) files.push(p); } };
  walkDir('js');
  for (const f of files) {
    const src = read(f);
    const code = codeOnly(src);   /* a token named in a comment is not one a reader sees */
    for (const m of code.matchAll(/\{icon:([a-zA-Z-]+)\}/g)) out.push([f, m[1]]);
    if (!/from '\.\.?\/icons\.js'/.test(src) && f !== 'js/icons.js') continue;
    let ast; try { ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module' }); } catch { continue; }
    const lits = (n) => n.type === 'Literal' && typeof n.value === 'string' ? [n.value]
      : n.type === 'ConditionalExpression' ? [...lits(n.consequent), ...lits(n.alternate)] : [];
    walk.full(ast, (n) => {
      if (n.type === 'CallExpression' && n.arguments.length) {
        const c = n.callee.type === 'Identifier' ? n.callee.name : (n.callee.type === 'MemberExpression' ? n.callee.property.name : '');
        if (/^(icon|iconNode|iconImageData)$/.test(c)) for (const v of lits(n.arguments[0])) out.push([f, v]);
      }
      if (n.type === 'Property' && !n.computed && n.key.type === 'Identifier' && (n.key.name === 'icon' || n.key.name === 'i') && n.value.type === 'Literal' && typeof n.value.value === 'string' && /^[a-zA-Z][a-zA-Z-]*$/.test(n.value.value)) out.push([f, n.value.value]);   /* a name — not the turn arrow a maneuver row carries as text */
    });
  }
  for (const page of ['index.html', 'admin.html']) for (const m of read(page).matchAll(/data-icon="([^"]+)"/g)) out.push([page, m[1]]);
  return out;
}

test('icon-system ④: every icon name written anywhere is one the set draws (an unknown name throws at run time — meet it here)', () => {
  const written = namesWritten();
  assert.ok(written.length > 300, 'the census found the call sites (' + written.length + ')');
  const bad = written.filter(([, n]) => !NAMES.has(n));
  assert.deepEqual(bad, [], 'names with no glyph: ' + bad.map((b) => b.join(' ')).join(', '));
});

test('icon-system ⑤: a translation that carries {icon:…} tokens carries the same ones in every language', () => {
  for (const f of readdirSync(join(ROOT, 'js/locales')).filter((x) => /^ui\..*\.js$/.test(x))) {
    const src = read('js/locales/' + f);
    const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module' });
    walk.full(ast, (n) => {
      if (n.type !== 'Property' || n.key.type !== 'Literal' || typeof n.key.value !== 'string' || n.value.type !== 'Literal') return;
      const toks = (s) => [...String(s).matchAll(/\{icon:[a-z-]+\}/g)].map((m) => m[0]).sort().join(' ');
      assert.equal(toks(n.value.value), toks(n.key.value), f + ': «' + n.key.value.slice(0, 60) + '» and its translation name different pictures');
    });
  }
});

test('icon-system ⑥: the rule reads strings by their cooked value, and not comments, regexes or typographic marks', () => {
  const g = (rel, text) => sitesIn(rel, text).map((s) => s.glyph + '@' + s.line + ':' + s.where);
  assert.deepEqual(g('js/x.js', "const a = '\u{1F310} Grid';"), ['\u{1F310}@1:string']);
  assert.deepEqual(g('js/x.js', "const a = '\\u{1F310} Grid';"), ['\u{1F310}@1:string'], 'an escape spells the same picture');
  assert.deepEqual(g('js/x.js', 'const a = `x\n${b} \u26A0 y`;'), ['\u26A0@2:string'], 'template text, at the line of the piece that holds it');
  assert.deepEqual(g('js/x.js', '/* \u26A0 a comment for the next author */ const r = /[\u2716x]/;'), [], 'a comment and a regex draw nothing');
  assert.deepEqual(g('js/x.js', "const c = '\u00A9 OpenStreetMap contributors', w = 'Wikipedia \u2197';"), [], 'the copyright sign and a sentence arrow are read as text');
  assert.deepEqual(g('x.html', '<!-- \u{1F4F7} --><button>&#x1F4F7; Shot</button>\n<script>const q = "\u23F8";</script>'), ['\u23F8@2:string', '\u{1F4F7}@1:markup'], 'a page: its scripts are read before its text');
  assert.deepEqual(g('css/x.css', '/* \u{1F310} */ .a::before{ content:"\\1F310"; }'), ['\u{1F310}@1:css'], 'a CSS escape in content');
});

test('icon-system ⑦: the served tree draws no emoji as an icon, and every declaration is still true', () => {
  assert.deepEqual(iconGlyphProblems(ROOT), []);
  const sites = glyphSites(ROOT);
  for (const d of DECLARED) assert.ok(sites.some((s) => s.file === d.file), d.file + ' still holds what it declares');
  /* a declaration that no longer matches is refused (the excuse would be a hole for the next emoji) */
  const stale = iconGlyphProblems(ROOT, { declared: [...DECLARED, { file: 'js/icons.js', glyphs: '\u{1F310}', why: 'a declaration written for this test, naming a file that holds no such glyph' }], typographic: [], upstream: [] });
  assert.ok(stale.some((p) => /DECLARED js\/icons\.js: holds none/.test(p)), 'a stale declaration is an error');
});

test('icon-system ⑧: the shared helpers draw their own mark — a warning line, the copy button, the static pickers', () => {
  const con = codeOnly(read('js/atlas-console.js'), { literals: 'keep' });
  assert.match(con, /const warn=s=>'<div[^']*'\+icon\('warning'\)\+' '\+s\+'<\/div>'/, 'Atlas\'s warn() draws the warning sign itself');
  const ui = codeOnly(read('js/map-ui.js'));
  assert.match(ui, /btn\.replaceChildren\(iconNode\('clipboard'\),' '\+label\(\)\)/, 'the copy button restores its glyph beside its words');
  for (const f of ['js/page-i18n.js', 'js/legal-page.js']) assert.match(codeOnly(read(f)), /globe\.appendChild\(iconNode\('world'\)\)/, f + ' draws the picker globe');
  assert.match(read('vite.config.js'), /^\s*'js\/icons\.js',/m, 'the static pages import js/icons.js, so the build copies it beside them');
});
