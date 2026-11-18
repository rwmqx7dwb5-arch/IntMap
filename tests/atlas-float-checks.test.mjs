/* ============================================================================
 *  Atlas — the conversation floating on the map, and the work trace's weights (ui-feedback-nov17)
 * ----------------------------------------------------------------------------
 *  「Atlas の回答をタブではなく、地図の左側に半透明で浮かべて表示する設定を。入力欄も地図の上に。」
 *  and, on the progress panel: 説明文がイタリック／完了の緑のチェックのほうが実行中の行より目を引く／
 *  ラベル（考え中・次:・秒数）と中身が灰色の濃さでしか分かれていない。
 *
 *  ⚠ THE DEFECTS, RESTATED — not the fix ([[intmap-restate-the-defect-not-the-fix]]):
 *    ① the only place Atlas could be read was its sidebar tab — a reader had to open the tab to ask
 *       and to read, and a second implementation on the map would be a second Atlas that drifts;
 *    ② a floating copy that kept the panel after the reader opened the tab would leave the tab empty;
 *    ③ on a phone-width layout the sheet already lies over the map, so a card there leaves no map;
 *    ④ the say-row (what Atlas wrote on the way) was italic, and the label 「次:」 was the same text
 *       node as the content it labels, so the two could only differ by colour.
 *
 *  ①–③ RUN THE MODULE, EVALUATED, against the smallest DOM stub its questions need (it is not a DOM):
 *  where does the console's own node end up, and when.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* ── the stub ─────────────────────────────────────────────────────────────────────────────── */
class El {
  constructor(tag) { this.tagName = String(tag).toUpperCase(); this.nodeType = 1; this.children = []; this.parentNode = null;
    this._cls = new Set(); this._attr = {}; this.id = ''; this.textContent = ''; this.title = '';
    const self = this;
    this.style = { display: '', removeProperty(k) { delete this[k]; }, setProperty(k, v) { this[k] = v; } };
    this.classList = { add: (...c) => c.forEach((x) => self._cls.add(x)), remove: (...c) => c.forEach((x) => self._cls.delete(x)),
      contains: (c) => self._cls.has(c), toggle: (c, f) => { const on = f === undefined ? !self._cls.has(c) : !!f; if (on) self._cls.add(c); else self._cls.delete(c); return on; } };
  }
  set className(v) { this._cls = new Set(String(v).split(/\s+/).filter(Boolean)); }
  get className() { return [...this._cls].join(' '); }
  set innerHTML(v) { this._html = v; }
  setAttribute(k, v) { this._attr[k] = String(v); if (k === 'id') this.id = String(v); }
  getAttribute(k) { return this._attr[k] ?? null; }
  addEventListener() { }
  focus() { globalThis.document.activeElement = this; }
  matches() { return false; }
  appendChild(c) { if (c.parentNode) c.parentNode.children.splice(c.parentNode.children.indexOf(c), 1); c.parentNode = this; this.children.push(c); return c; }
  get isConnected() { let n = this; while (n.parentNode) n = n.parentNode; return n === globalThis.document.documentElement; }
  *walk() { for (const c of this.children) { yield c; yield* c.walk(); } }
  querySelector(sel) {
    const want = sel.split('.').filter(Boolean);
    for (const n of this.walk()) if (want.every((c) => n._cls.has(c))) return n;
    return null;
  }
  contains(n) { for (; n; n = n.parentNode) if (n === this) return true; return false; }
}
function page({ compact = false } = {}) {
  const html = new El('html'), head = new El('head'), body = new El('body');
  html.appendChild(head); html.appendChild(body);
  const doc = { documentElement: html, head, body, activeElement: null,
    createElement: (t) => new El(t), createTextNode: (t) => ({ nodeType: 3, textContent: t }),
    getElementById: (id) => { for (const n of html.walk()) if (n.id === id) return n; return null; } };
  const mk = (tag, id, parent, cls) => { const e = new El(tag); if (id) e.id = id; if (cls) e.className = cls; parent.appendChild(e); return e; };
  const sidebar = mk('div', 'sidebar', body, 'sidebar');
  const feed = mk('div', 'atlas-feed', sidebar); feed.style.display = 'none';
  const mc = mk('div', 'map-container', body, 'map-container');
  mk('div', 'map', mc);
  /* the console's panel, as ensure() builds and places it: in #map-container */
  const panel = mk('div', 'atlas-panel', mc);
  mk('div', '', panel, 'atl-chat'); const inbar = mk('div', '', panel, 'atl-inbar'); mk('textarea', '', inbar, 'atl-in'); mk('button', '', inbar, 'atl-go idle');
  const st = setTimeout;
  Object.assign(globalThis, {
    document: doc,
    getComputedStyle: (e) => ({ display: e.style.display || 'block' }),
    MutationObserver: class { observe() { } disconnect() { } },
    setTimeout: (f, ms) => { const t = st(f, ms); if (t && t.unref) t.unref(); return t; },
    window: {
      IntMapDevice: { compact: () => compact, embedded: () => false, on() { } },
      IntMapLang: { keyedText: (_c, _k, fb) => fb },
      IntMapAtlas: { ensure: () => Promise.resolve(null), call() { } },
      IntMapConsole: { panel: () => panel },
    },
  });
  return { doc, panel, feed, mc, sidebar, body };
}
let n = 0;
const load = () => import(pathToFileURL(path.join(ROOT, 'js/atlas-float.js')).href + '?i=' + (++n));

/* ── ① ② ③ ─────────────────────────────────────────────────────────────────────────────────── */
test('① float: the console\'s own #atlas-panel — the same node — is carried into the card on the map', async () => {
  const P = page(); const F = await load();
  F.applyAtlasDisplay('float');
  const root = P.doc.getElementById('atlas-float');
  assert.ok(root, 'the floating container exists');
  assert.equal(root.parentNode, P.mc, 'it stands on the map, not in the sidebar');
  assert.ok(root.contains(P.panel), 'the panel is inside it — moved, not copied');
  assert.equal([...P.doc.documentElement.walk()].filter((e) => e.id === 'atlas-panel').length, 1, 'there is still exactly one Atlas panel');
  assert.ok(root.classList.contains('on'), 'and the card is shown');
  assert.ok(P.panel.querySelector('.atl-in'), 'the input travels with it');
});

test('② opening the Atlas tab hands the panel back; leaving it brings the panel to the map again', async () => {
  const P = page(); const F = await load();
  F.applyAtlasDisplay('float');
  P.feed.style.display = 'flex';                 /* what js/news-ui.js renderUI does for the Atlas tab */
  assert.equal(F.floatRoute('open'), false, 'with the tab on screen, the console opens Atlas as it always did');
  F.applyAtlasDisplay('float');                  /* the observers' sync, run directly */
  assert.equal(P.panel.parentNode, P.feed, 'the tab is not left empty');
  assert.ok(!P.doc.getElementById('atlas-float').classList.contains('on'), 'and the empty card is not shown');
  P.feed.style.display = 'none';
  F.applyAtlasDisplay('float');
  assert.ok(P.doc.getElementById('atlas-float').contains(P.panel), 'the tab left: the conversation floats again');
});

test('② switching back to 「in the tab」 returns the panel to #atlas-feed, still a tab panel', async () => {
  const P = page(); const F = await load();
  F.applyAtlasDisplay('float');
  F.applyAtlasDisplay('tab');
  assert.equal(P.panel.parentNode, P.feed);
  assert.ok(P.panel.classList.contains('atl-tab'));
  assert.equal(F.floatRoute('open'), false, 'and the console\'s own open() is not intercepted');
});

test('① close and toggle are answered by the card while it holds Atlas — the console is not sent to the tab', async () => {
  const P = page(); const F = await load();
  F.applyAtlasDisplay('float');
  const root = P.doc.getElementById('atlas-float');
  assert.equal(F.floatRoute('close'), true);
  assert.ok(!root.classList.contains('on'), 'hidden');
  assert.ok(root.contains(P.panel), 'hiding keeps the conversation where it is');
  assert.equal(F.floatRoute('toggle'), true);
  assert.ok(root.classList.contains('on'), 'and A / the Atlas button brings it back');
});

test('③ a phone-width layout does not float: the sheet already covers the map', async () => {
  const P = page({ compact: true }); const F = await load();
  F.applyAtlasDisplay('float');
  assert.ok(!P.doc.getElementById('atlas-float') || !P.doc.getElementById('atlas-float').contains(P.panel), 'the panel is not on the map');
  assert.equal(F.floatRoute('open'), false, 'and opening Atlas goes to its sheet');
});

/* spelling kept: stylesheet rule (js/atlas-float.js) — Node has no cascade or layout to evaluate it in. */
test('① the card blocks only its own rectangle, and motion yields to prefers-reduced-motion', () => {
  const s = read('js/atlas-float.js');
  assert.match(s, /'#atlas-float\{[^}]*pointer-events:none;\}/, 'the positioned column lets the map through');
  assert.match(s, /#atlas-float \.atl-float-card\{pointer-events:none;/, 'the card is no surface: the map under its empty parts keeps the pointer');
  assert.match(s, /#atlas-float #atlas-panel \.atl-inbar\{pointer-events:auto;/, 'the input pill and the bar take it themselves');
  assert.doesNotMatch(s.slice(s.indexOf('.atl-float-card{pointer-events'), s.indexOf('.atl-float-card{pointer-events')+400), /backdrop-filter/, 'the card itself has no glass');
  assert.match(s, /@media \(prefers-reduced-motion:reduce\)\{#atlas-float/, 'reduced motion is honoured');
});

/* ── ④ ────────────────────────────────────────────────────────────────────────────────────── */
test('④ the label in front of the live row\'s content is its own node, so weight can tell them apart', () => {
  const live = read('js/atlas-live.js');
  assert.match(live, /PROG\.detail\(ai, st\.callNames\.map\(wordForTool\)\.join\(', '\), L\('Next: '/, 'the 「次:」 label travels as its own argument');
  const prog = read('js/atlas-progress.js');
  assert.match(prog, /function detail\(bubble, text, label\)/);
  assert.match(prog, /className = 'atl-trace-lbl'/);
});

/* spelling kept: stylesheet rule (js/atlas-live.js, js/atlas-progress.js) — no cascade in Node. */
test('④ the say-row is upright body text; the running row outweighs a finished one', () => {
  const live = read('js/atlas-live.js');
  const say = /'#atlas-panel \.atl-trace-row\.say \.atl-trace-det\{([^}]*)\}'/.exec(live);
  assert.ok(say, 'the say-row rule exists');
  assert.doesNotMatch(say[1], /italic/);
  const prog = read('js/atlas-progress.js');
  assert.match(prog, /\.atl-trace-row\.run \.atl-trace-det\{font-weight:600;/, 'the moving row\'s content is the heaviest');
  assert.doesNotMatch(prog, /\.atl-trace-row\.ok \.atl-trace-mark\{color:#30d158;\}/, 'the finished tick is not the full-strength green');
});
