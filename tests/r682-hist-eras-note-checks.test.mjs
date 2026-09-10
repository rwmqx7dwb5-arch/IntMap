/* ══ R682 — THE ERA LAYER SAYS WHAT IT IS DRAWING ═══════════════════════════════════════════════
 *
 *  「歴史国境レイヤーが『いま何を描いているか』を地図の上で述べるようにしてください。」
 *
 *  #R679 lowered the clock to 123000 BC and bundled the seventeen pre-common-era sheets. What it
 *  drew there are not polities — world_bc123000 draws Homo heidelbergensis and Neanderthal — and
 *  the only place that said so was the source page. On the map, a reader saw closed outlines.
 *
 *  ⚠ THESE CHECKS EVALUATE THE MODULE, THEY DO NOT READ IT (#R505). js/time-borders.js is loaded
 *  into a vm context with the shipped data/hist-eras.js as `window.__HISTERAS`, the clock is moved
 *  to a real year, and the sentence is asked for. That is why they can assert the one property the
 *  round is about: THE SENTENCE'S NUMBERS ARE THE DRAWN COLLECTION'S NUMBERS. A check that read the
 *  source for a literal «141» or «6,892» would still be green on the day the sentence and the lines
 *  disagreed, which is the whole failure this exists to prevent (#R669 wrote the same rule for the
 *  derived provinces of the admin1 layer).
 *
 *  ⚠ WHAT THEY DELIBERATELY DO NOT MEASURE: the spelling of any sentence (#R488 — a check that
 *  pins wording protects the wording, not the claim), and whether js/map-ui.js paints `opts.sub`
 *  on screen. The second is a rendering fact and was measured in a browser on the built site.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');

/* the nine positions the app resolves a tuple by, in the order js/time-admin1.js:112 records */
const SLOT = { en: 0, jp: 1, de: 2, ru: 3, es: 4, zh: 5, 'zh-hans': 6, fr: 7, ko: 8 };

/* the module, evaluated. The stubs are deliberately inert — anything the module asks of the
   renderer answers a proxy that records nothing, so nothing here can stand in for behaviour the
   module was supposed to have (#R585: a stub richer than the real thing repairs bugs in passing). */
function loadModule(lang = 'en') {
  const noop = () => {};
  const chain = new Proxy(function () {}, { get: () => chain, apply: () => chain });
  const win = {
    addEventListener: noop, setTimeout: () => 0, clearTimeout: noop, setInterval: () => 0,
    IntMapModules: {}, IntMapGeoEngine: chain, IntMapTime: { on: noop },
    /* ⚠ THE OTHER TWO BUNDLES ARE HONESTLY ABSENT HERE. data/cshapes.js and data/hist-borders.js
       are fetched with a <script> tag; this context has no loader, so every such tag fails, which
       is the real degraded path (#R518 demoted the snapshots to exactly that fallback). Nothing is
       faked into place: the snapshot tier answers because it is the tier that can. */
    document: {
      getElementById: () => null,
      createElement: () => { const el = {}; queueMicrotask(() => { try { el.onerror && el.onerror(); } catch (_) {} }); return el; },
      head: { appendChild: noop },
    },
    IntMapLang: {
      pickArgs: () => ((...a) => a),
      pick: (get) => ({ arr: (a) => a[SLOT[get()] ?? 0] }),
      htmlTag: (l) => (l === 'zh' ? 'zh-Hant' : l === 'jp' ? 'ja' : l === 'zh-hans' ? 'zh-Hans' : l),
      t: (_l, ...r) => r[0], index: () => ({}),
    },
    /* the era word is the platform's (js/hist-scale.js); this context has Intl, so use the owner */
    IntMapHistScale: null,
  };
  win.window = win;
  const ctx = vm.createContext(win);
  vm.runInContext(rd('js/hist-scale.js'), ctx);
  vm.runInContext(rd('data/hist-eras.js'), ctx);
  vm.runInContext(rd('js/time-borders.js'), ctx);
  const HOST = { lang, canDraw: () => false, isMobile: () => false };
  return { mod: ctx.window.IntMapModules.timeBorders(HOST), bundle: ctx.window.__HISTERAS, HOST };
}

/* what the bundle itself says a sheet holds — read straight off the record, not off the module */
const sheetOf = (bundle, y) => bundle.snaps.find((s) => s.y === y);

test('① the sentence exists only while the snapshot tier is what is drawn', async () => {
  const { mod } = loadModule();
  assert.equal(mod.note(), '', 'a live clock draws no era snapshot, so there is nothing to state');
  assert.equal(mod.coverage().era, false);
  await mod._go(-122999);
  assert.notEqual(mod.note(), '', 'travelling to a bundled sheet must produce the sentence');
  assert.equal(mod.coverage().era, true);
  mod._clear();
  assert.equal(mod.note(), '', 'returning to Now must retract it — the row may not state a date the map has left');
});

test('② the numbers are counted off the collection on the source, not typed', async () => {
  const { mod, bundle } = loadModule();
  /* every bundled sheet, so this cannot pass by being right about one of them */
  for (const snap of bundle.snaps) {
    await mod._go(snap.y);
    const c = mod.coverage();
    assert.equal(c.era, true, `sheet ${snap.key} must be drawn by the snapshot tier`);
    assert.equal(c.year, snap.y, `${snap.key}: the sentence names the sheet that answered`);
    const fc = mod.currentFC();
    assert.equal(c.feats, fc.features.length, `${snap.key}: shape count is the drawn collection's`);
    assert.equal(c.named + c.blank, c.feats, `${snap.key}: every shape is either named or not`);
    /* the record's own split: `feats` carry a name object, `blank` is geometry with none */
    assert.equal(c.named, snap.feats.length, `${snap.key}: named count is upstream's own`);
    assert.equal(c.blank, (snap.blank || []).length, `${snap.key}: unnamed count is upstream's own`);
    assert.ok(c.blank > 0, `${snap.key}: upstream leaves shapes unnamed in every sheet it publishes`);
  }
});

test('③ the neighbouring sheets are read out of the record, so the gaps are not typed anywhere', async () => {
  const { mod, bundle } = loadModule();
  const ys = bundle.snaps.map((s) => s.y).slice().sort((a, b) => a - b);
  await mod._go(ys[0]);
  let c = mod.coverage();
  assert.equal(c.prev, null, 'the deepest sheet has nothing before it');
  assert.equal(c.next, ys[1], 'and its neighbour is whatever the record publishes next');
  /* ⚠ THIS IS THE 113,000-YEAR HOLE, DERIVED. It is asserted as a relation between two entries of
     the shipped record — not as the number 113,000, which would have to be re-typed the day
     upstream publishes anything between them. */
  assert.ok(c.next - c.year > 100000, 'and there is nothing at all between the two deepest sheets');
  await mod._go(ys[ys.length - 1]);
  c = mod.coverage();
  assert.equal(c.next, null, 'the newest sheet has nothing after it');
  assert.equal(c.prev, ys[ys.length - 2]);
});

test('④ upstream classifies the shapes or it does not, and nothing is invented for the rest', async () => {
  const { mod, bundle } = loadModule();
  let sheetsWithType = 0, classified = 0;
  for (const snap of bundle.snaps) {
    await mod._go(snap.y);
    const c = mod.coverage();
    /* the record's own answer, computed here independently of the module */
    const want = new Map();
    for (const f of snap.feats) { const t = f[1] && f[1].t; if (t) want.set(String(t), (want.get(String(t)) || 0) + 1); }
    assert.deepEqual(new Map(c.types), want, `${snap.key}: the classification tally is upstream's`);
    const n = c.types.reduce((s, e) => s + e[1], 0);
    if (n) { sheetsWithType++; classified += n; }
    assert.ok(n <= c.feats, `${snap.key}: cannot classify more shapes than are drawn`);
  }
  assert.ok(sheetsWithType > 0 && sheetsWithType < bundle.snaps.length,
    'upstream classifies some sheets and not others — both branches of the sentence are reachable');
  assert.ok(classified > 0 && classified < 1000,
    'and it classifies a small minority of what it publishes, which is why the sentence says so');
  /* the deepest sheet — the one the reader in the report opened — classifies nothing at all */
  await mod._go(bundle.snaps.map((s) => s.y).sort((a, b) => a - b)[0]);
  /* ⚠ `.length`, not deepEqual against `[]`: the array is built inside the vm realm, so its
     prototype is not this realm's and a strict deep comparison fails on that alone. */
  assert.equal(mod.coverage().types.length, 0, 'nothing is asserted about Neanderthal or Homo heidelbergensis');
});

test('⑤ the sentence is nine different sentences, and every one carries the counted numbers', async () => {
  const langs = Object.keys(SLOT);
  const seen = new Set();
  for (const lang of langs) {
    const { mod } = loadModule(lang);
    await mod._go(-9999);           /* a sheet that has both unnamed shapes and classified ones */
    const c = mod.coverage(), n = mod.note();
    assert.ok(n && n.length > 60, `${lang}: the row carries a sentence`);
    assert.ok(!seen.has(n), `${lang}: a language that repeats another's text is an untranslated slot`);
    seen.add(n);
    assert.ok(n.includes(String(c.feats)), `${lang}: states how many shapes are drawn`);
    assert.ok(n.includes(String(c.blank)), `${lang}: states how many upstream leaves unnamed`);
    for (const [val, count] of c.types) {
      assert.ok(n.includes(val), `${lang}: upstream's own word «${val}» appears verbatim`);
      assert.ok(n.includes(String(count)), `${lang}: with the count it was measured at`);
    }
    /* the era word is the platform's, and it is not the astronomical number (#R679) */
    assert.ok(!n.includes('-9999') && !n.includes('−9999'), `${lang}: no reader is shown «−9999»`);
  }
  assert.equal(seen.size, langs.length);
});

test('⑥ the classification of one shape is upstream\'s word, or nothing', () => {
  const { mod } = loadModule();
  assert.equal(mod.typeNote({ properties: { NAME: 'Neanderthal' } }), '',
    'a shape upstream did not classify gets no line rather than a guess');
  assert.equal(mod.typeNote(null), '');
  assert.equal(mod.typeNote({ properties: { TYPE: '   ' } }), '', 'blank text is not a classification');
  for (const spelling of ['TYPE', 'type']) {
    /* upstream writes the same field both ways across its own files (48 / 93, measured in
       scripts/build-hist-eras.mjs). The bundle folds them; the remote fallback does not. */
    const out = mod.typeNote({ properties: { [spelling]: 'hunter-gatherers' } });
    assert.ok(out.includes('hunter-gatherers'), `the «${spelling}» spelling is read, verbatim`);
    assert.ok(out.length > 'hunter-gatherers'.length, 'and it is marked as upstream\'s word, not a name');
  }
  const nine = new Set(Object.keys(SLOT).map((l) => loadModule(l).mod.typeNote({ properties: { TYPE: 'culture' } })));
  assert.equal(nine.size, 9, 'all nine languages carry their own wording for «upstream says»');
});

test('⑦ a day-exact tier answering must not be described as a snapshot', async () => {
  const { mod } = loadModule();
  /* 1900 is inside CShapes' band. Its bundle is absent in this context, so the era tier answers and
     `coverage()` speaks — the point of the assertion is the PREDICATE, which is that the sentence
     only ever describes the collection `shownY` identifies as a snapshot (a number). */
  await mod._go(1900);
  const c = mod.coverage();
  assert.equal(typeof mod.current(), 'number', 'the aourednik tier keys the year itself');
  assert.equal(c.era, true);
  assert.equal(c.year, 1900);
  /* and the reader's own year travels beside the sheet's, which is how a mid-gap year is honest */
  await mod._go(1907);
  assert.equal(mod.coverage().asked, 1907, 'the year asked for is kept');
  assert.notEqual(mod.coverage().year, 1907, 'while the sheet drawn is the one upstream published');
});
