/* ============================================================================
 *  IntMap · tests/layer-manifest-checks.test.mjs — the Layers list is data (layer-manifest)
 * ----------------------------------------------------------------------------
 *  THE DEFECT, stated as it was (not as it was fixed):
 *    ① to learn which layers exist, a reader had to COUNT THE ROWS of `#layer-dropdown` — so a
 *      layer whose module had not built its row yet did not exist to the Layers panel, the session
 *      restore, the share link, the favourites or Atlas, and the restore polled 25 × 220 ms for it;
 *    ② the rows and the declarations about them could disagree: a default tick in index.html and
 *      the same id in window.IntMapDefaultOn were «ONE edit in two files» (#R476), and the taxonomy
 *      filed short names through a hand-kept table of id prefixes that each new family had to be
 *      taught (#R254 / #R255 / #R261).
 *  Everything below is EVALUATED — the manifest is imported, the generated markup is produced, the
 *  locale tables are run, `whenBoxes` is driven through a fake registry. The document side (the
 *  booted rows equal the manifest) is tests/layer-manifest.spec.js.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import * as M from '../js/layer-manifest.js';
import { whenBoxes } from '../js/layer-rows.js';
import { LAZY_REGISTRY } from '../js/lazy-modules.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
/* comments and strings blanked, so prose that QUOTES an old pattern is not the pattern */
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

/* the keyed UI table of one language, by running its locale file */
function uiTable(code) {
  let got = null;
  const sandbox = { window: { IntMapLang: { define: (c, t) => { if (c === code) got = t.ui; } } } };
  vm.runInNewContext(read('js/locales/ui.' + code + '.js'), sandbox);
  assert.ok(got, 'js/locales/ui.' + code + '.js defines no ui table');
  return got;
}

/* ── ① the list exists without a document ─────────────────────────────────────────────────── */
test('layer-manifest ① the whole Layers list — ids, shelves, order, folds, defaults, share, lazy — is known with no DOM', () => {
  assert.equal(typeof globalThis.document, 'undefined', 'this runs where no row can be counted');
  const all = M.catalog();
  assert.ok(all.length > 150, 'the manifest declares the registry (' + all.length + ')');
  const ids = all.map((l) => l.id);
  assert.equal(new Set(ids).size, ids.length, 'every checkbox id is declared once');
  const keys = all.map((l) => l.key).filter(Boolean);
  assert.equal(new Set(keys).size, keys.length, 'a short name names one row (reorganizeLayerPanel resolves it)');
  /* every shelf reorganizeLayerPanel draws is here, in panel order, with the fold count it reads */
  const g = M.layerGroups();
  assert.ok(g.length >= 16 && g.every(([k, list, n]) => /^lyrGrp/.test(k) && Array.isArray(list) && n >= 0 && n <= list.length));
  for (const s of M.SHELVES) {
    /* (#R469) the reader named the first N of a shelf; the fold is the TAIL, so a count can say it */
    const r = s.layers.map((l) => !!l.rest);
    assert.ok(r.indexOf(true) < 0 || r.slice(r.indexOf(true)).every(Boolean), s.key + ': the folded rows are not one tail — `named` could not describe them');
    if (s.key === M.BASE || s.key === M.HIDDEN || s.key === M.BETA) assert.ok(!r.some(Boolean), s.key + ' does not fold');
  }
  /* the four lists js/data-layers.js publishes are views of it, and it publishes them FROM it */
  const DL = codeOnly(read('js/data-layers.js'));
  for (const [name, fn] of [['IntMapDefaultLayers', 'defaultLayers'], ['IntMapDefaultOn', 'defaultOn'], ['IntMapBasicLayerRows', 'basicRows'],
    ['IntMapBasicLayers', 'basicLayers'], ['IntMapHiddenLayerRows', 'hiddenRows']]) {
    assert.ok(DL.includes('window.' + name + '=' + fn + '();'), 'js/data-layers.js publishes window.' + name + ' from the manifest');
    assert.ok(!new RegExp('window\\.' + name + '=\\[').test(DL), 'window.' + name + ' is not a hand-written literal any more');
  }
  assert.ok(DL.includes('const GROUPS=layerGroups();') && DL.includes('const OTHERS_IDS=betaKeys();'), 'reorganizeLayerPanel files rows by the manifest');
  assert.ok(!/const GROUPS=\[/.test(DL), 'and the literal is gone (one taxonomy, not two)');
});

/* ── ① (cont.) the readers that learned the list by counting rows ask the manifest ────────── */
test('layer-manifest ① the non-Atlas readers take the list from the manifest, and the prefix tables are gone', () => {
  const imports = (p) => [...read(p).matchAll(/^import\s+\{([^}]*)\}\s+from\s+'\.\/(layer-manifest|layer-rows)\.js'/gm)].flatMap((m) => m[1].split(',').map((x) => x.trim().split(/\s+as\s+/)[0]));
  assert.ok(imports('js/session-tabs.js').includes('whenBoxes'), 'the session restore waits through whenBoxes');
  assert.ok(imports('js/map-ui.js').includes('sharedIds') && imports('js/map-ui.js').includes('LAYERS'), 'the share link and the tile browser read the manifest');
  assert.ok(imports('js/layer-favs.js').includes('LAYERS'), 'the favourites read the manifest');
  const ST = codeOnly(read('js/session-tabs.js'));
  assert.ok(!/setTimeout\(\s*poll(Off)?\s*,\s*220\s*\)/.test(ST), 'the 25 × 220 ms poll is gone');
  const MU = codeOnly(read('js/map-ui.js'));
  assert.ok(!/input\[id\^="gx-"\]/.test(MU), 'the share link no longer names id prefixes');
  const DL = codeOnly(read('js/data-layers.js'));
  assert.ok(!/getElementById\('(eco-dl-|l9-dl-|wp-dl-|fac-dl-|ox-)'\+id\)/.test(DL), 'rowFor no longer keeps a prefix table');
  /* ⚠ AND THE PREFIX RULE THE MANIFEST REPLACED IS REPRODUCED EXACTLY — `share` is what the old selector
     matched on the day it was replaced, not a new policy (a row it did not carry is still not carried) */
  const OLD = /^(dl-|gx-|eco-dl-|l9-dl-|beta-dl-|wp-dl-)|^r7-dl-(disputes|airdef|langs)$/;
  for (const l of M.LAYERS) assert.equal(!!l.share, OLD.test(l.id), l.id + ': `share` is the selector it replaced');
});

/* ── ② the rows the manifest writes are the rows index.html shipped ───────────────────────── */
test('layer-manifest ② the generated rows: one field ticks the box AND names it default-on; names resolve in en and jp', () => {
  const en = uiTable('en'), jp = uiTable('jp');
  const rows = M.htmlRows();
  assert.ok(rows.length >= 10, 'the markup rows are declared (' + rows.length + ')');
  for (const l of rows) {
    const html = M.rowHTML(l, (k) => en[k]);
    const m = /^<label class="layer-option"><input type="checkbox" id="([^"]+)"( checked)?> <span data-i18n="([^"]+)">([^<]*)<\/label>$/.exec(html.replace('</span>', ''));
    assert.ok(m, l.id + ' renders the index.html shape: ' + html);
    assert.equal(m[1], l.id);
    assert.equal(!!m[2], !!l.on, l.id + ': `checked` is `on`');
    assert.equal(m[3], l.label);
    assert.ok(typeof en[l.label] === 'string' && en[l.label], l.id + ': English name ' + l.label);
    assert.ok(typeof jp[l.label] === 'string' && jp[l.label], l.id + ': Japanese name ' + l.label);
  }
  /* the tick and IntMapDefaultOn cannot disagree: both are `on` */
  const ticked = rows.filter((l) => l.on).map((l) => l.id);
  assert.deepEqual(M.defaultOn().slice(0, ticked.length), ticked);
  assert.deepEqual(M.defaultOn().slice(ticked.length), M.defaultLayers());
  /* every declared label resolves in the two languages IntMap writes (CONSTITUTION §7) */
  for (const l of M.LAYERS) if (l.label) {
    assert.ok(en[l.label], l.id + ' label ' + l.label + ' has no English'); assert.ok(jp[l.label], l.id + ' label ' + l.label + ' has no Japanese');
  }
  for (const s of M.SHELVES) if (/^lyrGrp/.test(s.key)) assert.ok(en[s.key] && jp[s.key], 'shelf heading ' + s.key + ' in en and jp');
  /* and index.html no longer carries them — one source */
  const HTML = read('index.html');
  for (const l of rows) assert.ok(!HTML.includes('id="' + l.id + '"'), 'index.html still ships ' + l.id + ' — two sources again');
  assert.ok(/import '\.\.\/js\/i18n\.js';\s*\r?\nimport '\.\.\/js\/layer-rows\.js';/.test(read('src/main.js')),
    'src/main.js writes the rows right after the English table and before any registry reader');
  const main = read('src/main.js');
  assert.ok(main.indexOf("'../js/layer-rows.js'") < main.indexOf("'../js/data-layers.js'"), '…before js/data-layers.js');
});

/* ── ③ the lazy links name real on-demand modules, and real call sites ────────────────────── */
test('layer-manifest ③ every lazy module the manifest names is registered in LAZY_REGISTRY and asked for by a real call', () => {
  const named = new Set(M.LAYERS.flatMap((l) => l.lazy || []));
  assert.ok(named.size > 0, 'the measured links are recorded');
  for (const n of named) assert.ok(Object.prototype.hasOwnProperty.call(LAZY_REGISTRY, n), n + ' is not in LAZY_REGISTRY');
  /* the reverse the source can answer: a link the manifest claims corresponds to an `IntMapLazy.need('<name>')`
     somewhere outside Atlas (a claim with no call site is a stale claim) */
  const calls = new Set();
  for (const f of readdirSync(join(ROOT, 'js')).filter((f) => f.endsWith('.js') && !/^atlas-/.test(f))) {
    for (const m of codeOnly(read('js/' + f)).matchAll(/IntMapLazy\.need\(\s*'([A-Za-z]+)'/g)) calls.add(m[1]);
  }
  for (const n of named) assert.ok(calls.has(n), n + ': no `IntMapLazy.need(\'' + n + '\')` outside Atlas — the manifest claims a link nothing makes');
  /* …and the module each lazy row asks for publishes something the row's owner can find */
  for (const n of named) assert.ok(typeof LAZY_REGISTRY[n].publishes === 'string' && LAZY_REGISTRY[n].publishes, n + ' publishes nothing');
});

/* ── ④ the restore does not poll: it waits for the row, and only for rows that exist ───────── */
test('layer-manifest ④ whenBoxes settles an undeclared id at once and applies a declared one the moment its row lands', () => {
  const nodes = new Map([['layer-dropdown', { id: 'layer-dropdown' }]]);
  const doc = { getElementById: (id) => nodes.get(id) || null };
  let observer = null, disconnected = false;
  const saved = globalThis.MutationObserver;
  globalThis.MutationObserver = class { constructor(cb) { this.cb = cb; observer = this; } observe(t, o) { assert.equal(t.id, 'layer-dropdown'); assert.ok(o.childList && o.subtree); } disconnect() { disconnected = true; } };
  try {
    const declared = M.LAYERS.find((l) => !l.html).id;          /* a module-built row: not in the document yet */
    const present = M.LAYERS.find((l) => l.html).id;            /* already written */
    nodes.set(present, { id: present });
    const seen = [];
    const waiting = whenBoxes(['dl-retired-for-good', present, declared], (cb) => seen.push(cb.id), doc);
    assert.deepEqual(seen, [present], 'the present row is applied synchronously, as the first poll did');
    assert.equal(waiting, 1, 'the undeclared, absent id is not waited for at all (was 25 polls); the declared one is');
    assert.ok(observer, 'it waits on the registry, not on a clock');
    observer.cb([]);                                             /* an unrelated mutation */
    assert.deepEqual(seen, [present]);
    nodes.set(declared, { id: declared });
    observer.cb([]);                                             /* the row lands */
    assert.deepEqual(seen, [present, declared], 'applied the moment it exists — once');
    assert.ok(disconnected, 'and the observer goes away with the last id');
    observer.cb([]);
    assert.equal(seen.length, 2, 'nothing is applied twice');
  } finally { globalThis.MutationObserver = saved; }
});
