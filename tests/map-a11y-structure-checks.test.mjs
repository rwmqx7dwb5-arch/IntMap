/* map-a11y-structure — the halves that need no browser, EVALUATED:
   ① the stylesheet's stacking order is named (:root --z-*), every declaration resolves, the resolved
     order is the ledger's, and the ledger fails on a moved layer and on a new bare number;
   ② the nameless-control ratchet (scripts/control-names.mjs) counts the shapes it says and lets the
     named ones through, in markup and in code, and the controls this round named stay named;
   ③ js/map-narrator.js's pure parts — the paragraph, the coordinates, a BCE year, the walk order;
   ④ the single-key shortcut switch is read before any shortcut runs, and Settings carries it.
   tests/map-a11y-structure.spec.js carries what needs a page (the live region, the walk, the computed
   z-index values, the switch pressed for real). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as acorn from 'acorn';
import { tokens, resolveValue, stack, countLiterals, stripCssComments, check as zCheck, LEDGER as Z_LEDGER } from '../scripts/z-layers.mjs';
import { markupUnnamed, codeUnnamed, hasText, scan, check as cnCheck } from '../scripts/control-names.mjs';
import { composeSummary, fmtLatLng, fmtWhen, rankCandidates } from '../js/map-narrator.js';

const ROOT = join(import.meta.dirname, '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ── ① ─────────────────────────────────────────────────────────────────────────────────────── */
test('① every z-index in the stylesheet reads a named layer, and resolves to the ledger’s order', () => {
  const css = read('css/intmap.css');
  const tok = tokens(css);
  const names = Object.keys(tok);
  assert.ok(names.length >= 6, 'the layers are declared in :root');
  const bases = names.map((n) => tok[n]);
  assert.deepEqual(bases, bases.slice().sort((a, b) => a - b), 'the layers are declared bottom to top');
  assert.equal(countLiterals(stripCssComments(css)), 0, 'no z-index in the stylesheet is a bare number');
  const st = stack(css);
  for (const s of st) assert.ok(s.value === 'auto' || Number.isInteger(s.value), s.selector);
  const ledger = JSON.parse(readFileSync(Z_LEDGER, 'utf8'));
  assert.deepEqual(st.map((s) => `${s.selector} → ${s.value}${s.important ? ' !important' : ''}`), ledger.stack,
    'the painting order is the one written down');
  /* the collision the audit named is still a tie — this round names layers, it does not re-order them */
  const at = (sel) => st.find((s) => s.selector === sel).value;
  assert.equal(at('.btn-toggle-sidebar'), at('.search-result-card'));
  const real = zCheck(); assert.equal(real.ok, true, real.lines.join('\n'));
});

test('① the resolver computes what a browser computes, and refuses what it cannot', () => {
  const tok = { '--z-a': 1000, '--z-b': 10000 };
  assert.equal(resolveValue('var(--z-a)', tok), 1000);
  assert.equal(resolveValue('calc(var(--z-a) + 150)', tok), 1150);
  assert.equal(resolveValue('calc(var(--z-b) - 1) !important', tok), 9999);
  assert.equal(resolveValue('auto !important', tok), 'auto');
  assert.equal(resolveValue('12', tok), 12);
  assert.throws(() => resolveValue('var(--z-missing)', tok), /not defined/);
  assert.throws(() => resolveValue('calc(var(--z-a) * 2)', tok), /not an integer/);
  /* a moved layer is a different stack */
  const moved = stack(':root{ --z-a:1000; }\n.x{ z-index:var(--z-a); }\n.y{ z-index:calc(var(--z-a) + 1); }');
  assert.deepEqual(moved.map((s) => s.value), [1000, 1001]);
});

test('① the bare-number shapes it counts, and the named ones it lets through', () => {
  assert.equal(countLiterals("el.style.cssText='position:fixed;z-index:6000;'"), 1);
  assert.equal(countLiterals("el.style.zIndex='12'; o={ zIndex: 5 }"), 2);
  assert.equal(countLiterals("el.style.setProperty('z-index','40')"), 1);
  assert.equal(countLiterals("el.style.zIndex='var(--z-popup)'; x.style.cssText='z-index:var(--z-modal)'"), 0);
  assert.equal(countLiterals('el.style.zIndex=String(n)'), 0);
  const dir = mkdtempSync(join(tmpdir(), 'zl-'));
  try {
    mkdirSync(join(dir, 'css')); mkdirSync(join(dir, 'js'));
    writeFileSync(join(dir, 'css', 'intmap.css'), ':root{ --z-a:10; }\n.x{ z-index:var(--z-a); }');
    writeFileSync(join(dir, 'js', 'a.js'), "/* z-index:99 in a comment is not a layer */ function f(e){ e.style.zIndex='7'; }");
    const ledger = join(dir, 'ledger.json');
    /* (ui-layer-owner) a file above zero has to say why; without the sentence the same count fails */
    writeFileSync(ledger, JSON.stringify({ literals: { 'js/a.js': 1 }, stack: ['.x → 10'] }));
    assert.match(zCheck(dir, ledger).lines.join('\n'), /js\/a\.js: 1 bare z-index number\(s\) and the ledger does not say why/);
    writeFileSync(ledger, JSON.stringify({ literals: { 'js/a.js': 1 }, why: { 'js/a.js': 'a fixture file standing in for a document that has no layers' }, stack: ['.x → 10'] }));
    assert.equal(zCheck(dir, ledger).ok, true, zCheck(dir, ledger).lines.join('\n'));
    /* (ui-layer-owner) a layer read in js/ that :root does not define paints at auto — refused */
    writeFileSync(join(dir, 'js', 'c.js'), "function h(e){ e.style.zIndex='var(--z-nope)'; }");
    assert.match(zCheck(dir, ledger).lines.join('\n'), /js\/c\.js: reads the layer --z-nope/);
    rmSync(join(dir, 'js', 'c.js'));
    writeFileSync(join(dir, 'js', 'b.js'), "function g(e){ e.style.cssText='z-index:3000'; }");
    const up = zCheck(dir, ledger);
    assert.equal(up.ok, false); assert.match(up.lines.join('\n'), /js\/b\.js: 1 z-index value/);
    rmSync(join(dir, 'js', 'b.js'));
    writeFileSync(join(dir, 'css', 'intmap.css'), ':root{ --z-a:10; }\n.x{ z-index:calc(var(--z-a) + 1); }');
    const moved = zCheck(dir, ledger);
    assert.equal(moved.ok, false); assert.match(moved.lines.join('\n'), /painting order changed at declaration 1/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

/* ── ② ─────────────────────────────────────────────────────────────────────────────────────── */
const parse = (src) => acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script', locations: true });
test('② markup: an icon-only button and a label-less field are counted; the named ones are not', () => {
  const none = new Set();
  const n = (s, t = none) => markupUnnamed(s, t).length;
  assert.equal(n('<button class="x">×</button>'), 1, 'a symbol only');
  assert.equal(n('<button><svg viewBox="0 0 1 1"><path d=""/></svg></button>'), 1, 'an icon only');
  assert.equal(n('<button aria-label="Close">×</button>'), 0);
  assert.equal(n('<button title="Close">×</button>'), 0);
  assert.equal(n('<button data-i18n-aria="close">×</button>'), 0);
  assert.equal(n('<button>Close</button>'), 0, 'words name it');
  assert.equal(n('<button>2</button>'), 0, 'a digit is read out');
  assert.equal(n('<button><img src="a.png" alt="Close"></button>'), 0, 'an alt text names it');
  assert.equal(n("'<button class=\"b\">'+label+'</button>'"), 0, 'a computed content is not evidence');
  assert.equal(n('<button id="x"></button>'), 0, 'an empty button is filled in by code');
  assert.equal(n('<input type="range" min="0">'), 1);
  assert.equal(n('<input type="range" aria-label="Zoom">'), 0);
  assert.equal(n('<input type="search" placeholder="Filter">'), 0, 'a placeholder is a name (accname)');
  assert.equal(n('<select placeholder="x"><option>a</option></select>'), 1, 'a select has no placeholder');
  assert.equal(n('<input type="hidden" name="k">'), 0);
  assert.equal(n('<label>Zoom <input type="range"></label>'), 0, 'inside a label');
  assert.equal(n('<label>Zoom</label><input type="range">'), 1, 'after a closed label');
  assert.equal(n('<input type="range" id="z">', new Set(['z'])), 0, 'a label points at its id');
  assert.equal(hasText('&times;'), false); assert.equal(hasText('Save &amp; go'), true);
});

test('② code: a button given a symbol and nothing else is counted; a name, a label or a hidden field is not', () => {
  const n = (src, t = new Set()) => codeUnnamed(parse(src), t).length;
  assert.equal(n("function f(p){ const b=document.createElement('button'); b.textContent='×'; p.appendChild(b); }"), 1);
  assert.equal(n("function f(p){ const b=document.createElement('button'); b.textContent='×'; b.title='Close'; p.appendChild(b); }"), 0);
  assert.equal(n("function f(p){ const b=document.createElement('button'); b.textContent='×'; b.setAttribute('aria-label','Close'); p.appendChild(b); }"), 0);
  assert.equal(n("function f(p,t){ const b=document.createElement('button'); b.textContent=t; p.appendChild(b); }"), 0, 'a computed text is not evidence');
  assert.equal(n("function f(p){ const i=document.createElement('input'); i.type='range'; p.appendChild(i); }"), 1);
  assert.equal(n("function f(p){ const i=document.createElement('input'); i.placeholder='Seed'; p.appendChild(i); }"), 0);
  assert.equal(n("function f(p){ const l=document.createElement('label'); const i=document.createElement('input'); l.appendChild(i); p.appendChild(l); }"), 0, 'inside a label made here');
  assert.equal(n("function f(p){ const i=document.createElement('input'); i.type='file'; i.click(); }"), 0, 'never reaches the document');
  assert.equal(n("function f(p){ const i=document.createElement('input'); i.style.display='none'; p.appendChild(i); }"), 0, 'hidden');
  assert.equal(n("function f(p){ const i=document.createElement('input'); i.id='z'; p.appendChild(i); }", new Set(['z'])), 0, 'a label points at its id');
});

test('② the controls this round named stay named, and the tree is at its ledger', () => {
  const found = scan();
  const at = (file, pred) => (found[file] || []).filter(pred);
  for (const f of ['js/news-ui.js', 'js/map-tools.js', 'js/ai-core.js', 'js/analysis-world-events.js', 'js/app-body.js']) {
    assert.deepEqual(found[f] || [], [], f + ' has no nameless control');
  }
  assert.deepEqual(at('js/photo-geo.js', (u) => u.tag === 'button'), [], 'the fine-tuning −/+');
  assert.deepEqual(at('js/playground.js', (u) => u.tag === 'button'), [], 'the two × buttons');
  assert.ok(!(found['admin.html'] || []).some((u) => u.tag === 'input' && /data-ev=/.test(read('admin.html').split('\n')[u.line - 1] || '')), 'the event checkbox');
  const real = cnCheck(); assert.equal(real.ok, true, real.lines.join('\n'));
  const dir = mkdtempSync(join(tmpdir(), 'cn-'));
  try {
    mkdirSync(join(dir, 'js'));
    writeFileSync(join(dir, 'js', 'a.js'), "function f(p){ const b=document.createElement('button'); b.textContent='×'; p.appendChild(b); }");
    const ledger = join(dir, 'ledger.json');
    writeFileSync(ledger, JSON.stringify({ files: { 'js/a.js': 1 } }));
    assert.equal(cnCheck(dir, ledger).ok, true);
    writeFileSync(join(dir, 'b.html'), '<select id="q"></select>');
    assert.match(cnCheck(dir, ledger).lines.join('\n'), /b\.html: 1 control/);
    rmSync(join(dir, 'b.html'));
    writeFileSync(join(dir, 'js', 'a.js'), "function f(p){ const b=document.createElement('button'); b.textContent='×'; b.title='Close'; p.appendChild(b); }");
    assert.match(cnCheck(dir, ledger).lines.join('\n'), /lower the ledger/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

/* ── ③ ─────────────────────────────────────────────────────────────────────────────────────── */
function stubLang() {   /* js/map-narrator.js reads window.IntMapLang.t at call time */
  const table = { en: 0, jp: 1 };
  globalThis.window = globalThis.window || {};
  window.IntMapLang = { t: (lang, en, jp) => (table[lang] === 1 && jp != null ? jp : en) };
}
test('③ the paragraph: each clause from its owner, absent clauses left out, en and jp', async () => {
  stubLang();
  assert.equal(fmtLatLng(35.68, 139.77, 'en'), '35.7° N, 139.8° E');
  assert.equal(fmtLatLng(-33.87, -70.6, 'jp'), '南緯33.9°・西経70.6°');
  assert.equal(fmtWhen(-43, '', 'en'), '44 BCE', 'astronomical −43 is 44 BCE');
  assert.equal(fmtWhen(-43, '', 'jp'), '紀元前44年');
  assert.equal(fmtWhen(1900, '1900-06-15', 'en'), '1900-06-15');
  const full = composeSummary({ place: 'Japan', lat: 35.7, lng: 139.7, zoom: 5.04, when: '1900-06-15',
    layers: ['Earthquakes', 'Volcanoes'], counts: ['Earthquakes: 12 in view'], selected: 'Mount Fuji' }, 'en');
  assert.equal(full, 'Map centred on Japan (35.7° N, 139.7° E), zoom 5. Showing 1900-06-15. Layers on (2): Earthquakes, Volcanoes. Earthquakes: 12 in view. Selected: Mount Fuji.');
  const bare = composeSummary({ lat: 0, lng: 0, zoom: 1.26, layers: [] }, 'en');
  assert.equal(bare, 'Map centred at 0.0° N, 0.0° E, zoom 1.3. No layers are on.', 'no place, no date, no selection is said');
  const jp = composeSummary({ place: '日本', lat: 35.7, lng: 139.7, zoom: 5, layers: ['地震'] }, 'jp');
  assert.equal(jp, '地図の中心: 日本（北緯35.7°・東経139.7°）、ズーム 5。 表示中のレイヤー（1）: 地震。');
});

test('③ the walk: one entry per feature, nearest the centre first, the nearest pixel kept', async () => {
  const f = (layer, id, props) => ({ layer: { id: layer }, id, properties: props || {} });
  const r = rankCandidates([
    { x: 100, y: 100, feature: f('pins', 1) },
    { x: 55, y: 50, feature: f('pins', 2) },
    { x: 90, y: 100, feature: f('pins', 1) },
    { x: 50, y: 50, feature: f('pins', 2) },
    { x: 60, y: 60, feature: f('quakes', undefined, { mag: 5 }) },
  ], 50, 50);
  assert.deepEqual(r.map((c) => c.key), ['pins#2', 'quakes#{"mag":5}', 'pins#1']);
  assert.deepEqual([r[0].x, r[0].y], [50, 50], 'the pixel nearest the centre is the one pressed');
  assert.deepEqual([r[2].x, r[2].y], [90, 100]);
});

test('③ the renderer is reached only through the contract, and both adapters can press', () => {
  const src = read('js/map-narrator.js');
  assert.doesNotMatch(src, /maplibre|cesium|__imap/i, 'no renderer is named outside the adapters');
  assert.match(src, /GE\(\)\.events\.pressAt\(/);
  assert.match(src, /clickLayers\(\{ ownersOnly: true \}\)/, 'what can be walked is the ownership registry’s answer');
  assert.match(read('js/geo-engine.js'), /pressAt:\(pt\)=>\{ const a=A\(\); return \(a&&a\.pressAt\)\?a\.pressAt\(pt\):false; \}/);
  assert.match(read('js/geo-engine.js'), /pressAt\(pt\)\{ const m=_m\(\);[^\n]*MapMouseEvent\('click'/);
  assert.match(read('js/cesium-engine.js'), /this\._pressAt=\(pt\)=>\{ dispatch\('click'/);
  assert.match(read('js/cesium-engine.js'), /pressAt\(pt\)\{ const v=V\(\); return \(v&&v\._pressAt&&pt\)\?v\._pressAt\(pt\):false; \}/);
  assert.match(read('js/app-body.js'), /makeMapNarrator\(IM_HOST, \{ GE \}\)/);
});

/* ── ④ ─────────────────────────────────────────────────────────────────────────────────────── */
test('④ the single-key shortcuts ask the switch before doing anything, and Settings carries it (en + jp)', () => {
  const src = read('js/keyboard-shortcuts.js');
  const body = src.slice(src.indexOf("document.addEventListener('keydown'"));
  const esc = body.indexOf("if(k==='Escape') return;"), gate = body.indexOf('if(!singleOn()) return;'), sw = body.indexOf('switch(true)');
  assert.ok(esc > 0 && gate > esc && sw > gate, 'Escape stays the dialog registry’s; every other key is gated before the switch');
  /* the row's words are written by the module, in en + jp (CONSTITUTION §7 — no new keyed row that the
     seven carried languages would then have to hold); the label points at the select, so it is named */
  assert.ok(read('index.html').includes('<label for="setting-kbd-single" id="lbl-kbd-single" style="margin-top:12px;"></label><select id="setting-kbd-single"><option value="on"></option><option value="off"></option></select>'));
  assert.ok(src.includes("lbl.textContent=L2('Single-key shortcuts','1 文字のショートカットキー')"));
  assert.ok(src.includes("sel.options[1].textContent=L2('Off — only shortcuts that use Ctrl/⌘ or Alt','オフ — Ctrl/⌘ や Alt との組み合わせのみ')"));
  assert.ok(src.includes("window.addEventListener('intmap-lang',words)"), 'and rewritten when the language changes');
});
