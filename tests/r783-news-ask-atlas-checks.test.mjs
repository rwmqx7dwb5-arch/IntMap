/* ══════════════════════════════════════════════════════════════════════════════════════════════
 *  R783 — «Ask Atlas» from a News detail arrives WITH the news, offers a field, and retires itself
 *
 *  THE DEFECT, restated as the defect (memory: restate-the-defect-not-the-fix). The reader:
 *  「News の Details から Ask Atlas を選択できるが、Atlas はニュースの内容を見ていない。意味がない。
 *    また、選択肢に自由入力欄がないし、どれかの選択肢を押しても、選択肢が消えない。」
 *
 *  ⑴ THE CONTENT. #R776 wrote that the subject «was never missing» because `window._imReader` carries
 *    it — and that was true of the HEADLINE only. The one live writer of the bridge is
 *    js/news-events.js `openDetail()`, which fills `body` from `synthesis.lines` + `brief.gist`
 *    alone; the same file records that 43.5% of production events have no article text at all and
 *    only 15.0% have two gist sentences. So for most events the prompt carried a single line while
 *    the pane in front of the reader showed every outlet's headline, the key figures and what the
 *    latest report changed. ⚠ MEASURED HERE, FROM THE READER'S SIDE: the same fixture is rendered
 *    through the REAL `_selectionState()` (js/atlas-console.js) and the REAL `renderPrompt()`
 *    (js/atlas-state.js), once with the bridge as `openDetail()` leaves it — which is the reference
 *    OUTSIDE the thing being measured (memory: co-designed-reader-cannot-falsify) — and once after
 *    `askReading()` has run. The first prompt must not contain the event's content; the second must.
 *  ⑵ THE FIELD. #R776's «the composer stays free» was implemented as `focus()` on a composer at the
 *    far end of the panel. A caret off the subject is not the same offer as a field in it.
 *  ⑶ THE RETIREMENT. Asking retires the starters — pressing a chip OR typing a question, because the
 *    rule is that the arrival has been used, not that a particular control was touched. The head and
 *    the note stay: they are the record of what Atlas is holding, not an offer.
 * ═══════════════════════════════════════════════════════════════════════════════════════════════ */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const mod = (p) => import(pathToFileURL(join(ROOT, p)).href);

/* ── a DOM small enough to be obvious and real enough to parse the app's own markup ───────────
   The fixture below is HTML — the shape js/news-events.js `openDetail()` emits — so the walk under
   test is measured against markup rather than against a tree hand-built to suit it. Supported:
   elements, text, `class`, `.class` selectors, parentNode/removeChild, and the handful of element
   properties js/atlas-reading.js touches. */
const VOID = /^(br|hr|img|input|meta|link|path|source)$/i;
function mkEl(tag, cls, ph, parent) {
  return { nodeType: 1, tagName: tag, classList: cl(cls), className: cls || '', placeholder: ph || '',
    childNodes: [], parentNode: parent || null, value: '', style: {}, _focused: false,
    focus() { this._focused = true; },
    get textContent() { return text(this); },
    querySelector(s) { return find(this, s)[0] || null; },
    querySelectorAll(s) { return find(this, s); },
    removeChild(c) { const i = this.childNodes.indexOf(c); if (i >= 0) this.childNodes.splice(i, 1); c.parentNode = null; return c; } };
}
function parse(html) {
  const root = mkEl('DIV', '', '', null);
  const stack = [root];
  const re = /<(\/?)([a-zA-Z0-9]+)([^>]*?)(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(html))) {
    const top = stack[stack.length - 1];
    if (m[5] != null) {
      const t = m[5];
      if (t.trim()) top.childNodes.push({ nodeType: 3, nodeValue: t, parentNode: top });
      continue;
    }
    const tag = m[2].toUpperCase();
    if (m[1]) { if (stack.length > 1) stack.pop(); continue; }
    const cls = (/class\s*=\s*"([^"]*)"/.exec(m[3]) || [, ''])[1];
    const ph = (/placeholder\s*=\s*"([^"]*)"/.exec(m[3]) || [, ''])[1];
    const el = mkEl(tag, cls, ph, top);
    top.childNodes.push(el);
    if (!m[4] && !VOID.test(m[2])) stack.push(el);
  }
  return root;
}
function cl(s) { const set = String(s || '').split(/\s+/).filter(Boolean); return { contains: (c) => set.includes(c) }; }
function text(n) { return (n.childNodes || []).map((c) => (c.nodeType === 3 ? c.nodeValue : text(c))).join(''); }
function find(n, sel) {
  const want = String(sel).replace(/^\./, ''), out = [];
  (function walk(x) {
    for (const c of x.childNodes || []) {
      if (c.nodeType === 1) { if (c.classList.contains(want)) out.push(c); walk(c); }
    }
  })(n);
  return out;
}

/* ── the fixture: an Event detail with NO synthesis and NO gist ───────────────────────────────
   The common case, and the one the reader hit: js/news-events.js then writes `body: ''` (its own
   measurement: 43.5% of events have no article text), while the pane still shows every outlet's
   headline. ⚠ The `.nrp-bar` at the top is chrome (js/article-reader.js `readerBar()`) and must not
   reach the prompt — «Ask Atlas» is a button, not something an outlet published. */
const DETAIL_HTML = `
<div class="nrp-bar"><button class="nrp-back">&#8249; Back</button><span class="nrp-src">El Pais +4</span><button class="nrp-atlas">Ask Atlas</button></div>
<div class="ev-detail">
  <div class="ev-d-head"><span class="loc-chip">Valencia</span><span class="ev-cat">Disaster</span></div>
  <h2 class="ev-d-title">Flooding in Valencia kills 12</h2>
  <div class="ev-d-meta"><span>First reported: Sep 16, 09:12</span><span>Latest article: Sep 16, 11:40</span><span>5 articles &#183; 4 independent outlets</span></div>
  <div class="ev-d-sec ev-brief"><h3>What happened</h3><p class="ev-short">The outlets covering this event publish headline-only feeds.</p></div>
  <div class="ev-d-sec ev-covs"><h3>Coverage</h3>
    <div class="ev-cov"><div class="ev-cov-h"><span class="ev-cov-src">El Pais</span><span class="ev-cov-at">Sep 16, 09:12</span></div><a class="ev-cov-t">Turia river bursts its banks after 300 mm of rain</a></div>
    <div class="ev-cov"><div class="ev-cov-h"><span class="ev-cov-src">RTVE</span><span class="ev-cov-at">Sep 16, 10:04</span></div><a class="ev-cov-t">Twelve dead and four missing in Valencia province</a></div>
  </div>
</div>`;

/* The bridge exactly as js/news-events.js `openDetail()` writes it for that fixture. */
const BRIDGE = () => ({ open: true, kind: 'event', title: 'Flooding in Valencia kills 12',
  publisher: 'El Pais +4', link: 'https://example.invalid/a', pubDate: '2026-09-16T11:40:00Z',
  loc: [-0.37, 39.47], place: 'Valencia', body: '' });

/* ── the READERS of the bridge, both of them the shipping ones ────────────────────────────────
   `_selectionState()` is pulled out of js/atlas-console.js and RUN (#R505: reading source cannot see
   what code decides), and the paragraph is rendered by js/atlas-state.js's own `renderPrompt`. */
function extractFn(src, name) {
  const at = src.indexOf('function ' + name + '(');
  assert.ok(at >= 0, `${name}() not found`);
  let depth = 0;
  for (let j = src.indexOf('{', at); j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(at, j + 1); }
  }
  throw new Error(`${name}() has no closing brace`);
}
const ATLAS = read('js/atlas-console.js');
const READING = read('js/atlas-reading.js');

async function promptFor() {
  const sel = new Function('_lastPlace', 'return ' + extractFn(ATLAS, '_selectionState').replace('function _selectionState(', 'function (') + ';')(null);
  const { makeAtlasState } = await mod('js/atlas-state.js');
  const S = makeAtlasState({});
  S.registerStateProvider('selection', sel);
  return S.renderPrompt(S.snapshot());
}

/* The module under test, with the kernel's dependencies stubbed by what they DO. */
async function arrival({ surface }) {
  const { makeAtlasReading } = await mod('js/atlas-reading.js');
  const asked = [];
  const pane = { querySelector: () => null };
  const root = surface ? parse(surface) : null;
  let opened = 0;
  globalThis.document = {
    querySelector: (s) => (s === '.nrp-bar' && root ? root.querySelector('.nrp-bar') : null),
    getElementById: () => null,
  };
  const READ = makeAtlasReading({ lang: 'en' }, {
    L: (...a) => a[0],
    esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'),
    bubble: (who, html) => parse(html),
    run: (q) => { asked.push(q); },
    ensure: () => pane,
    focus: () => { asked.push('__composer_focus__'); },
    /* entering Atlas LEAVES the reading surface — js/app-body.js `closeReaderPane()` empties the
       pane. Doing it here is what makes ③ a measurement of the order and not of an intention. */
    open: () => { opened++; if (root) { const b = root.querySelector('.nrp-bar'); if (b) root.childNodes.length = 0; else root.childNodes.length = 0; } },
    pin: () => { }, reset: () => { },
  });
  return { READ, asked, opened: () => opened };
}

/* ── ① the news reaches the model ─────────────────────────────────────────────────────────── */
test('R783 ① the event\'s content reaches the prompt, and did not before', async () => {
  globalThis.window = globalThis;

  /* the reference, OUTSIDE the change: the bridge as its writer leaves it */
  window._imReader = BRIDGE();
  const before = await promptFor();
  assert.ok(before.includes('Flooding in Valencia kills 12'), 'the headline was not reaching the prompt either — this check is measuring the wrong thing');
  assert.ok(!before.includes('Turia river bursts its banks'), 'the fixture already leaks its body into the bridge; the reference is not a reference');
  assert.ok(!/ARTICLE BODY/.test(before), 'the bridge as written already declares a body');

  /* and now the press the reader makes */
  window._imReader = BRIDGE();
  const { READ } = await arrival({ surface: DETAIL_HTML });
  assert.equal(READ.askReading(), true, 'askReading() refused an open event');
  const after = await promptFor();
  assert.ok(/ARTICLE BODY/.test(after), 'the prompt still has no article body');
  for (const needle of ['Turia river bursts its banks', 'Twelve dead and four missing', 'El Pais', 'RTVE', '4 independent outlets']) {
    assert.ok(after.includes(needle), `the prompt does not contain what the reader was looking at: ${needle}`);
  }
  /* chrome is not content: a button label is an offer to act, not something an outlet published */
  for (const chrome of ['Ask Atlas', '&#8249; Back', 'Back']) {
    assert.ok(!after.includes(chrome), `reading-surface chrome reached the prompt: ${chrome}`);
  }
});

/* ── ② a field to ask in the reader's own words, in the arrival itself ─────────────────────── */
test('R783 ② the arrival carries a free-text field, and the caret goes to it', async () => {
  globalThis.window = globalThis;
  const { READ, asked } = await arrival({ surface: null });
  const b = READ.arrive('<div class="atl-read-hd">Head</div>', 'note', ['one', 'two']);
  const inp = b.querySelector('.atl-arrive-in');
  assert.ok(inp, 'the arrival has no field to type into');
  assert.equal(inp.tagName, 'INPUT', 'the free-text field is not an input');
  assert.ok(inp.placeholder && inp.placeholder.trim(), 'the field has no placeholder saying what it is for');
  assert.ok(b.querySelector('.atl-arrive-send'), 'the field has no send control');
  /* ⚠ #R776's rule is unchanged: nothing is sent by arriving */
  assert.deepEqual(asked, [], 'the arrival sent something on its own');
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(inp._focused, true, 'the caret did not land in the arrival\'s own field');
  assert.ok(!asked.includes('__composer_focus__'), 'the caret was sent to the far-away composer instead');
});

/* ── ③ asking retires the offer ───────────────────────────────────────────────────────────── */
test('R783 ③ pressing a starter asks it and removes the starters', async () => {
  globalThis.window = globalThis;
  const { READ, asked } = await arrival({ surface: null });
  const b = READ.arrive('<div class="atl-read-hd">Head</div>', 'note', ['first', 'second', 'third']);
  const chips = b.querySelectorAll('.atl-here-q');
  assert.equal(chips.length, 3, 'the starters were not rendered');
  chips[1].onclick();
  assert.deepEqual(asked, ['second'], 'the pressed starter was not asked');
  assert.equal(b.querySelectorAll('.atl-here-q').length, 0, 'the starters are still on screen after one was pressed');
  assert.equal(b.querySelector('.atl-arrive-in'), null, 'the arrival\'s field outlived the arrival');
  /* the record of WHAT Atlas is holding stays — it is not an offer */
  assert.ok(b.textContent.includes('Head') && b.textContent.includes('note'), 'the arrival erased the subject it had named');
});

test('R783 ④ a typed question asks it and retires the starters too; an empty field does nothing', async () => {
  globalThis.window = globalThis;
  const { READ, asked } = await arrival({ surface: null });
  const b = READ.arrive('<div class="atl-read-hd">Head</div>', 'note', ['one', 'two']);
  const inp = b.querySelector('.atl-arrive-in');

  /* empty (and whitespace) is not a question */
  inp.value = '   ';
  b.querySelector('.atl-arrive-send').onclick();
  assert.deepEqual(asked, [], 'an empty field was sent as a question');
  assert.equal(b.querySelectorAll('.atl-here-q').length, 2, 'an empty press retired the starters');

  inp.value = 'why did the river burst?';
  inp.onkeydown({ key: 'Enter', preventDefault() { } });
  assert.deepEqual(asked, ['why did the river burst?'], 'Enter in the arrival\'s field asked nothing');
  assert.equal(b.querySelectorAll('.atl-here-q').length, 0, 'typing a question left three guesses at it underneath');
});

/* ── ⑤ the order the whole thing depends on ───────────────────────────────────────────────── */
test('R783 ⑤ the surface is read BEFORE Atlas is opened (opening empties it)', async () => {
  globalThis.window = globalThis;
  window._imReader = BRIDGE();
  const { READ, opened } = await arrival({ surface: DETAIL_HTML });
  READ.askReading();
  assert.equal(opened(), 1, 'askReading() no longer opens the console');
  assert.ok(String(window._imReader.body || '').includes('Turia river bursts its banks'),
    'the surface was read after entering Atlas had already emptied it — the body is whatever survived');
});

/* ── ⑥ a bridge with a richer body of its own is not overwritten ───────────────────────────── */
test('R783 ⑥ what a writer put in body stands when the surface has less to say', async () => {
  globalThis.window = globalThis;
  const curated = 'Machine-checked sentence one — El Pais\n\nMachine-checked sentence two — RTVE\n\n' + 'x'.repeat(4000);
  window._imReader = Object.assign(BRIDGE(), { body: curated });
  /* the «web» reading mode puts the publisher's page in an <iframe>: the surface's own text is a
     loading note and a link, which is not the article */
  const { READ } = await arrival({ surface: '<div class="nrp-bar"><button class="nrp-atlas">Ask Atlas</button></div><div class="nrp-webwrap"><div class="nrp-webnote">Loading page&#8230;</div><iframe class="nrp-iframe">blocked</iframe></div>' });
  READ.askReading();
  assert.equal(window._imReader.body, curated, 'an embedded page\'s chrome replaced a checked, attributed body');
});

/* ── ⑦ one arrival, still ─────────────────────────────────────────────────────────────────── */
test('R783 ⑦ the field and the retirement are in the ONE arrival builder', async () => {
  /* #R776 ③ measures the chip markup; these are the two controls added beside it. A second copy is
     how the map's «Ask Atlas» and the reading surface's came to behave differently. */
  const both = ATLAS + READING;
  assert.equal(both.split('class="atl-arrive-in"').length - 1, 1, 'the free-text field has more than one copy');
  assert.equal(both.split('class="atl-arrive-qs"').length - 1, 1, 'the starter group has more than one copy');
  const arriveFn = extractFn(READING, 'arrive');
  assert.ok(/removeChild\(grp\)/.test(arriveFn), 'the retirement is not in arrive()');
  assert.ok(!/class="atl-here-q"/.test(extractFn(ATLAS, 'askHere')), 'askHere grew its own arrival markup');
  /* and the surface read is one function, reached by whoever needs it */
  assert.equal(READING.split('function surfaceText(').length - 1, 1, 'surfaceText has more than one definition');
});
