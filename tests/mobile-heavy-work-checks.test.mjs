/* ============================================================================
 *  IntMap · mobile-heavy-work checks — the work the phone stopped doing
 * ----------------------------------------------------------------------------
 *  ① The in-page place matcher (js/place-terms.js) compiles an entry the first time a question
 *    reaches it, through a prefilter that cannot drop a hit. RUN, not read: the real
 *    js/news-context.js factory over the real gazetteer (curated rows + the world head + the DE/RU/ES
 *    tables), against real production headlines, compared with the exhaustive scan.
 *  ② The phone's layer grid is not built inside the boot (read: the boot path and the reservation;
 *    the sheet's own mount is tests/shell-layer-panel-checks.test.mjs R408 ⑥b).
 *  ③ A locally drawn glyph is drawn once: concurrent asks share one draw, and a newly loaded CJK
 *    subset drops only the glyphs inside its unicode-range. RUN against js/geo-engine.js and
 *    js/map-typography.js with the renderer's glyph manager stood in.
 *  ④ The light launch mark the CSS names is the master resampled to the box it is drawn in.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { importModule, langRegistry } from './helpers/import-module.mjs';
import { canonUnit } from '../js/place-terms.js';
import { gunzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);

/* ── the page the matcher runs in: the gazetteer module with the world rows landed, the tables,
      the publisher dictionary — the same inputs js/app-body.js hands the factory ─────────────── */
let PAGE = null;
async function page() {
  if (PAGE) return PAGE;
  globalThis.window = globalThis;
  globalThis.window.addEventListener = globalThis.window.addEventListener || (() => {});
  globalThis.window.dispatchEvent = globalThis.window.dispatchEvent || (() => true);
  globalThis.document = globalThis.document || { baseURI: 'https://example.test/' };
  globalThis.IntMapMapTypography = { bandText: (t) => String(t || '').slice(0, 40) };
  const doc = JSON.parse(gunzipSync(readFileSync(join(ROOT, 'data', 'gazetteer-world.json.gz'))).toString('utf8'));
  globalThis.IntMapDataDoor = { load: async () => doc };
  new Function('window', 'document', read('js/gazetteer.js'))(globalThis, globalThis.document);
  const GZ = globalThis.IntMapGazetteer;
  await GZ.warm();
  const { IntMapTables } = await imp('js/tables.js');
  const { _ORG_GZ, _DEMONYM_GZ, sourceDict } = IntMapTables;
  /* js/app-body.js `_pubMatchers`, same construction */
  const cjk = /[　-ヿ㐀-鿿ｦ-ﾟ]/;
  const _pubMatchers = Object.entries(sourceDict).map(([k, v]) => {
    const isC = cjk.test(k);
    return { loc: v.loc, label: k, cjk: isC, re: isC ? null : new RegExp('\\b' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i') };
  }).sort((a, b) => b.label.length - a.label.length);
  const HOST = {
    lang: 'en', geoRaw: {}, countryStats: {}, geoDB: [],
    get BUILTIN_GAZETTEER() { return GZ.index(); },
    _DEMONYM_GZ, _ORG_GZ, _pubMatchers,
    applyPinMode() {},
  };
  /* js/newsgeo.js is NOT loaded, so every headline takes the in-page scorer — the path under test */
  delete globalThis.IntMapNewsGeo;
  const { newsContext } = await imp('js/news-context.js');
  const ctx = newsContext(HOST);
  ctx.rebuildGeoIndex();
  const PT = await imp('js/place-terms.js');
  PAGE = { HOST, ctx, PT, doc };
  return PAGE;
}

/* real headlines (production current_news), plus the next headline as a description so the
   description path is exercised by real text too */
function corpus() {
  const a = JSON.parse(read('tests/fixtures/news-events-prod.json')).items;
  const b = JSON.parse(read('tests/fixtures/r334-news-events.json')).articles;
  const rows = [...a, ...b].map((x) => ({ title: x.title || '', publisher: x.publisher || '' }));
  return rows.map((r, i) => ({ ...r, desc: i % 2 ? rows[(i + 1) % rows.length].title : '' }));
}
/* every matcher kind, built from the gazetteer's own terms: Latin in three cases and inside a
   longer word, Cyrillic stems with an inflection, CJK with a locational particle */
function termProbes(db, every) {
  const out = [];
  for (let i = 0; i < db.length; i += every) {
    for (const t of db[i].terms) {
      out.push({ title: `Protests in ${t} continue`, desc: '', publisher: `${t} Daily` });
      out.push({ title: `${t.toUpperCase()} — officials`, desc: `near ${t.toLowerCase()}`, publisher: '' });
      out.push({ title: `x${t}x unrelated`, desc: '', publisher: '' });
      if (/[Ѐ-ӿ]/.test(t)) out.push({ title: `Удар по ${t}е`, desc: `в ${t}ой`, publisher: '' });
      if (/[　-鿿]/.test(t)) out.push({ title: `${t}で地震`, desc: `${t}から`, publisher: '' });
    }
  }
  return out;
}

test('mobile-heavy-work ①a: a rebuild compiles no matcher; a question compiles only what it reaches', async () => {
  const { HOST, ctx } = await page();
  ctx.rebuildGeoIndex();
  const db = HOST.geoDB;
  assert.ok(db.length > 15000, `the real gazetteer is in (${db.length} entries)`);
  assert.equal(db.filter((g) => g._terms).length, 0, 'rebuildGeoIndex compiles nothing');
  const r = ctx.analyzeContext('Earthquake strikes near Kathmandu, Nepal', 'Kathmandu Post', '', '');
  assert.ok(r.subjectLoc, 'and the headline still places');
  const compiled = db.filter((g) => g._terms).length;
  assert.ok(compiled > 0 && compiled < db.length / 50,
    `one headline compiled ${compiled} of ${db.length} entries — the prefilter decides what is reached`);
});

test('mobile-heavy-work ①b: the prefilter never drops an entry the exhaustive matchers hit', async () => {
  const { HOST, PT } = await page();
  const db = HOST.geoDB;
  const ref = PT.makePlaceTerms();               /* its own cache: every term compiled, exhaustively */
  const inputs = [...corpus().filter((_, i) => i % 10 === 0), ...termProbes(db, 2500)];
  const { candidates } = PT.makePlaceTerms();
  let hits = 0;
  for (const { title, desc, publisher } of inputs) {
    for (const text of [title, desc, publisher]) {
      if (!text) continue;
      const cand = new Set(candidates(db, text));
      for (let i = 0; i < db.length; i++) {
        const terms = ref.termsOf(db[i]);
        for (const t of terms) {
          const hit = t.jp ? text.includes(t.term) : t.matchRe.test(text);
          if (!hit) continue;
          hits++;
          assert.ok(cand.has(i), `«${t.term}» matches «${text}» but entry ${i} is not a candidate`);
        }
      }
    }
  }
  assert.ok(hits > 100, `the probes exercised real hits (${hits})`);
});

test('mobile-heavy-work ①c: the answer is the exhaustive scan\'s answer, headline for headline', async () => {
  const { HOST, ctx, PT } = await page();
  const db = HOST.geoDB;
  const ref = PT.makePlaceTerms();
  let placed = 0, n = 0;
  for (const { title, desc, publisher } of [...corpus().filter((_, i) => i % 12 === 0), ...termProbes(db, 4000)]) {
    n++;
    /* the shipped path, end to end (prefilter + lazy compile) … */
    const got = ctx.analyzeContext(title, publisher, '', desc);
    /* … against every entry, every matcher */
    const best = PT.bestSubject(db, title, desc, ref.termsOf, null);
    if (best) {
      placed++;
      assert.deepEqual(got.subjectLoc, best.loc, `«${title}»`);
      assert.equal(got.subjectType, best.type, `«${title}»`);
    } else {
      assert.equal(got.subjectLoc, null, `«${title}»: nothing to place`);
    }
    if (publisher) {
      const p1 = PT.bestPublisherPlace(db, publisher, ref.termsOf, null);
      const p2 = PT.bestPublisherPlace(db, publisher, ref.termsOf, PT.makePlaceTerms().candidates(db, publisher));
      assert.equal(p2, p1, `publisher «${publisher}»`);
    }
  }
  assert.ok(placed > n / 4, `${placed} of ${n} placed by the in-page scorer`);
});

/* the prefilter's case rule IS the RegExp's: for every code unit that has a case partner, the
   /i matcher of that unit matches exactly the units whose canonical form is the same */
test('mobile-heavy-work ①d: canonUnit is the non-unicode /i case rule', async () => {
  const { PT } = await page();
  const cased = [];
  for (let c = 0; c < 65536; c++) {
    if (c >= 0xd800 && c <= 0xdfff) continue;
    const s = String.fromCharCode(c);
    if (s.toUpperCase() !== s || s.toLowerCase() !== s) cased.push(c);
  }
  const pool = [...new Set([...cased, ...cased.map((c) => canonUnit(c))])];
  const hay = String.fromCharCode(...pool);
  for (const c of pool) {
    const re = new RegExp(String.fromCharCode(c).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    for (const m of hay.matchAll(re)) {
      assert.equal(canonUnit(m[0].charCodeAt(0)), canonUnit(c),
        `U+${c.toString(16)} /i matches U+${m[0].charCodeAt(0).toString(16)} but their canonical units differ`);
    }
  }
});

/* ═══ ② the grid waits for the reader ════════════════════════════════════════════════════════ */
/* spelling kept: browser script (js/mobile-ui.js) — the boot path's claim is which calls it makes, and the
   page it runs in is the whole booted app. */
test('mobile-heavy-work ②: the boot path reserves the grid instead of building it, after the launch screen and a quiet spell', () => {
  const m = read('js/mobile-ui.js');
  const apply = m.slice(m.indexOf('function applyLayout('), m.indexOf('function applyLayout(') + 4000);
  assert.ok(!/mountInto\(moMountLayers\)/.test(apply), 'applyLayout builds the grid again');
  const pre = m.slice(m.indexOf('function prebuildGrid('), m.indexOf('function prebuildGrid(') + 1600);
  assert.match(pre, /S\.interactive\(\)\.then\(/, 'the reservation waits for the launch screen to lift');
  assert.match(pre, /GRID_PREBUILD_AFTER_MS/, '…and for the quiet spell after it');
  assert.match(pre, /whenStage\('settled'/, '…and takes its turn behind the deferred reads');
  assert.match(pre, /requestIdleCallback\(go/, '…and builds in an idle period');
  assert.match(pre, /mq\.matches/, 'a window that is no longer a phone does not build it');
});

/* ═══ ③ one draw per glyph ═══════════════════════════════════════════════════════════════════ */
/* the shape of MapLibre 6's GlyphManager this code touches: entries + the async per-glyph path, whose cache
   is written only after the (awaited) draw — the window the duplicate draws came through */
class FakeGlyphManager {
  constructor() { this.entries = {}; this.draws = []; }
  async _getAndCacheGlyphsPromise(stack, id, variant) {
    const e = (this.entries[stack] ??= { glyphs: { default: {} }, requests: {}, ranges: {} });
    const g = (e.glyphs[variant] ||= {});
    if (g[id] !== undefined) return { stack, id, variant, glyph: g[id] };
    await new Promise((r) => setTimeout(r, 5));
    this.draws.push(id);
    return { stack, id, variant, glyph: (g[id] = { id }) };
  }
}
test('mobile-heavy-work ③a: the same glyph asked for by many tiles at once is drawn once', async () => {
  await page();
  const geSrc = read('js/geo-engine.js');
  assert.match(geSrc, /_dedupeGlyphDraws\(mm\)/, 'the one map constructor installs it');
  /* the install, evaluated as written, against a renderer whose class this test holds */
  const install = new Function('m', geSrc.slice(geSrc.indexOf('const _glyphInflight='), geSrc.indexOf('function _redrawLocalGlyphs(')) + '; return _dedupeGlyphDraws(m);');
  const gm = new FakeGlyphManager();
  assert.equal(install({ style: { glyphManager: gm } }), true);
  const got = await Promise.all(['대', '日', '대', '대', '日', 'ก'].map((id) => gm._getAndCacheGlyphsPromise('Noto Sans JP', id, 'default')));
  assert.deepEqual([...gm.draws].sort(), ['ก', '대', '日'].sort(), 'each glyph drawn once');
  assert.equal(got[0].glyph, got[2].glyph, 'and every asker gets the one result');
  await gm._getAndCacheGlyphsPromise('Noto Sans JP', '대', 'default');
  assert.equal(gm.draws.length, 3, 'a later ask is answered by the cache');
  /* a second manager of the same class shares the install but not the in-flight table */
  const gm2 = new FakeGlyphManager();
  await gm2._getAndCacheGlyphsPromise('Noto Sans JP', '대', 'default');
  assert.deepEqual(gm2.draws, ['대']);
});

test('mobile-heavy-work ③b: a new CJK subset drops only the glyphs inside its range; outside it nothing re-lays out', async () => {
  await page();
  const { IntMapGeoEngine: E } = await imp('js/geo-engine.js');
  const imap = window.__imap;
  try {
    const glyph = (id) => ({ id, bitmap: {}, metrics: {} });
    const gm = {
      localIdeographFontFamily: "'Noto Sans JP'",
      _charUsesLocalIdeographFontFamily: (cp) => cp >= 0x3000,
      entries: { 'Noto Sans JP,Noto Sans SC': {
        glyphs: { default: { A: glyph(65), '東': glyph(0x6771), '대': glyph(0xb300), 'ភ្ពុ': glyph(0x1797) } },
        ranges: { 0: true }, requests: {}, ideographTinySDF: {}, clusterTinySDFs: {},
      } },
    };
    const calls = { update: 0, set: 0 };
    window.__imap = { style: { glyphManager: gm }, _update() { calls.update++; }, getGlyphs: () => 'u', setGlyphs() { calls.set++; } };
    const tab = gm.entries['Noto Sans JP,Noto Sans SC'].glyphs.default;
    assert.equal(E.scene.refreshCjkGlyphs([[0x4e00, 0x4e0f]]), true);
    assert.ok(tab['東'] && tab['대'] && tab['ភ្ពុ'], 'a glyph outside the loaded range was dropped');
    assert.equal(calls.update, 0, 'nothing changed, and the style was still told to re-lay out every tile');
    E.scene.refreshCjkGlyphs([[0x6700, 0x67ff]]);
    assert.equal(tab['東'], undefined, 'the glyph the new face draws differently survived');
    assert.ok(tab['대'] && tab['ភ្ពុ'] && tab.A, 'glyphs the new face does not draw were dropped with it');
    assert.equal(calls.update, 1);
    E.scene.refreshCjkGlyphs();
    assert.equal(tab['대'], undefined, 'no range (a new family) is every local glyph, as before');
    assert.equal(tab['ភ្ពុ'], undefined);
    assert.ok(tab.A, 'a glyph from a downloaded range is never dropped');
    assert.equal(calls.set, 0);
  } finally { if (imap === undefined) delete window.__imap; else window.__imap = imap; }
});

test('mobile-heavy-work ③c: the faces that loaded hand their unicode-range to the refresh', async () => {
  const listeners = {}; let frames = []; const got = [];
  const win = { addEventListener() {}, requestAnimationFrame: (f) => { frames.push(f); return frames.length; } };
  win.window = win;
  const doc = {
    readyState: 'complete', documentElement: { lang: 'en' }, head: { appendChild() {} }, baseURI: 'http://x/',
    createElement: () => ({ dataset: {}, getContext: () => null }),
    fonts: { addEventListener: (t, f) => { listeners[t] = f; }, forEach() {} },
  };
  langRegistry();
  await importModule('js/map-typography.js', {
    globals: { window: win, document: doc, requestAnimationFrame: win.requestAnimationFrame, getComputedStyle: () => ({}) },
    mocks: { 'js/geo-engine.js': { IntMapGeoEngine: { scene: { refreshCjkGlyphs: (c) => { got.push(c); return true; } } } } },
  });
  const flush = () => { const f = frames; frames = []; f.forEach((x) => x()); };
  listeners.loadingdone({ fontfaces: [{ family: 'Noto Sans JP', unicodeRange: 'U+6700-67FF, U+3000' }] });
  listeners.loadingdone({ fontfaces: [{ family: 'Noto Sans SC', unicodeRange: 'U+4E??' }] });
  flush();
  assert.deepEqual(got.pop(), [[0x6700, 0x67ff], [0x3000, 0x3000], [0x4e00, 0x4eff]], 'two subsets in one frame are one refresh over both ranges');
  listeners.loadingdone({ fontfaces: [{ family: 'Noto Sans TC', unicodeRange: 'U+0-10FFFF' }] }); flush();
  assert.equal(got.pop(), undefined, 'a face that covers everything refreshes everything');
  listeners.loadingdone({ fontfaces: [{ family: 'Noto Sans TC' }] }); flush();
  assert.equal(got.pop(), undefined, 'a face that states no range refreshes everything');
  assert.equal(got.length, 0, 'one refresh per frame');
});

/* ═══ ④ the launch mark at its own size ════════════════════════════════════════════════════════ */
test('mobile-heavy-work ④: the light launch mark is the master resampled to the box it is drawn in', async () => {
  const F = await imp('scripts/boot-icon-flatten.mjs');
  const css = read('css/intmap.css');
  const rule = /:root\[data-theme="light"\] \.boot-icon\{([^}]*)\}/.exec(css);
  assert.ok(rule && rule[1].includes(F.LIGHT.out), 'the CSS names the derived file');
  const want = await F.deriveLight();
  assert.equal(want.S, F.bootIconCssPx(css) * F.BOOT_ICON_DPR, 'its size is the box times the highest device pixel ratio');
  const have = F.readLight();
  assert.ok(have && have.w === want.S && have.h === want.S, `${F.LIGHT.out} is not ${want.S} px square`);
  assert.ok(have.px.equals(want.px), `${F.LIGHT.out} is not ${F.LIGHT.src} resampled — run node scripts/boot-icon-flatten.mjs`);
  assert.ok(statSync(join(ROOT, F.LIGHT.out)).size < statSync(join(ROOT, F.LIGHT.src)).size / 3, 'and it is a fraction of the master');
});
