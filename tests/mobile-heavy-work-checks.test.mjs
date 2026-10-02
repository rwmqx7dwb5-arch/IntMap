/* ============================================================================
 *  IntMap · mobile-heavy-work checks — the work the phone stopped doing
 * ----------------------------------------------------------------------------
 *  ① The in-page place matcher (js/place-terms.js) compiles an entry the first time a question
 *    reaches it, through a prefilter that cannot drop a hit. RUN, not read: the real
 *    js/news-context.js factory over the real gazetteer (curated rows + the world head + the DE/RU/ES
 *    tables), against real production headlines, compared with the exhaustive scan.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
  const pool = [...new Set([...cased, ...cased.map((c) => PT.canonUnit(c))])];
  const hay = String.fromCharCode(...pool);
  for (const c of pool) {
    const re = new RegExp(String.fromCharCode(c).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    for (const m of hay.matchAll(re)) {
      assert.equal(PT.canonUnit(m[0].charCodeAt(0)), PT.canonUnit(c),
        `U+${c.toString(16)} /i matches U+${m[0].charCodeAt(0).toString(16)} but their canonical units differ`);
    }
  }
});
