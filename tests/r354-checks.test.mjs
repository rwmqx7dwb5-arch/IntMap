/* ============================================================================
 *  R354 — 企業アトラス: 出典のある事実だけを、起動を太らせずに配る
 * ----------------------------------------------------------------------------
 *  この機能で壊れやすいのは「見た目」ではなく **主張の質** である。実装中に実際に起きた
 *  誤りを、そのまま検査にしてある——どれも合成データでは再現しない、実データが教えたもの:
 *
 *   ⑴ **`brand:wikidata` を所有と読んだ。** OSM のドイツの "Autohaus …" は独立資本の
 *      ディーラーで、多くは自前の `operator` を持つ。これを施設として出すと **Toyota が
 *      持っていない事業所 5,262 件**を主張することになる（実測）。
 *   ⑵ **推移閉包で辿った。** `?mid (wdt:P749|wdt:P127)* ?root` は Toyota から JR 東海に
 *      届き、東海道本線の駅が全部「Toyota の拠点」になった（実測・上限300行まで駅）。
 *   ⑶ **屋根の太陽光パネルで工場になった。** Ponce の Walmart Supercenter は
 *      `power=generator` を持つので「発電所」として出荷されかけた。
 *   ⑷ **通貨も年度も無い金額。** Wikidata には単位が通貨でない時価総額と、P585 を持たない
 *      売上がある。どちらも「今年の値」として印字してはならない。
 *
 *  そして起動。500 社ぶんの索引と施設は **起動経路に 1 バイトも入ってはならない**——
 *  入れば、Companies を開かないセッション全部がその代金を払う。
 * ========================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(path.join(ROOT, p), 'utf8');
/* ⚠ READ THE CODE, NOT THE PROSE ABOUT THE CODE. Both ⑤ and ⑦ first went red on
   their own subject file's COMMENTS: the note explaining why `wdt:P749*` is
   forbidden contains `wdt:P749*`, and the note explaining that "Data centre" must
   not come back contains "Data centre". A check that reads comments is measuring
   the explanation, not the implementation. */
const code = (p) => {
  const src = rd(p);
  let out = String();
  for (let i = 0; i < src.length; i++) {
    if (src[i] === '/' && src[i + 1] === '*') {
      const e = src.indexOf('*/', i + 2);
      i = (e < 0 ? src.length : e + 1);
      out += ' ';
      continue;
    }
    out += src[i];
  }
  return out.split('\n').filter((l) => {
    const t = l.trim();
    return t.slice(0, 2) !== '//' && t.slice(0, 1) !== '*';
  }).join('\n');
};
const DATA = path.join(ROOT, 'data', 'companies');
const PROFILES = path.join(DATA, 'profiles');
const hasData = existsSync(path.join(DATA, 'index.json'));
const index = hasData ? JSON.parse(rd('data/companies/index.json')) : null;
const profileFiles = existsSync(PROFILES) ? readdirSync(PROFILES).filter((f) => f.endsWith('.json')) : [];
const readProfile = (f) => JSON.parse(readFileSync(path.join(PROFILES, f), 'utf8'));

/* ── ① 起動経路: 企業アトラスの3ファイルは遅延でなければならない ─────────── */
test('① the company atlas is not in the boot path', async () => {
  const { lazyFiles } = await import('./app-source.mjs');
  const lazy = new Set(lazyFiles(new URL('../', import.meta.url)));
  for (const f of ['js/company-data.js', 'js/company-panel.js', 'js/company-facilities.js']) {
    assert.ok(lazy.has(f), f + ' is not fetched lazily — 500 companies would land in the boot bundle');
  }
  /* src/main.js は import してはならない（門2）。ファイル名で見る——名前が出た時点で eager。 */
  const main = rd('src/main.js');
  for (const f of ['company-data.js', 'company-panel.js', 'company-facilities.js']) {
    assert.ok(!new RegExp("import\\s+'[^']*" + f.replace('.', '\\.') + "'").test(main),
      'src/main.js imports ' + f + ' — that makes it eager');
  }
  /* 門2の残り: LAZY_FACTORIES に名前が載っていること */
  for (const n of ['companyData', 'companyPanel', 'companyFacilities']) {
    assert.ok(new RegExp("'" + n + "'").test(main), 'src/main.js LAZY_FACTORIES is missing ' + n);
  }
});

/* ── ② 既存の curated 表を壊していない ───────────────────────────────────── */
test('② the 190-row curated table is still the one source of the live-market-cap universe', () => {
  const src = rd('js/companies.js');
  const m = /const RAW=\[([\s\S]*?)\n\s*\];/.exec(src);
  assert.ok(m, 'js/companies.js: the RAW table is gone or has changed shape');
  const rows = Function('"use strict";return ([' + m[1].replace(/\/\*[\s\S]*?\*\//g, '') + '])')();
  assert.ok(rows.length >= 190, 'the curated table shrank to ' + rows.length + ' rows (was 190)');
  for (const r of rows) assert.equal(r.length, 12, 'a curated row is not 12 fields: ' + JSON.stringify(r).slice(0, 90));
  /* the pipeline PARSES this table rather than copying it — a second copy is the failure mode */
  const man = rd('scripts/companies/manifest.mjs');
  assert.match(man, /js', 'companies\.js'|companies\.js/, 'scripts/companies/manifest.mjs no longer reads js/companies.js');
  assert.ok(!/\['AAPL'/.test(man), 'the manifest builder has a COPY of the curated table in it');
});

/* ── ③ OSM: brand は所有ではない ─────────────────────────────────────────── */
test('③ brand:wikidata is retail presence, never a corporate facility', async () => {
  const src = code('scripts/companies/osm.mjs');
  assert.match(src, /operator:wikidata/, 'the operator tag is not read at all');
  assert.match(src, /link/, 'the three tags are not distinguished');
  const { typeFromTags } = await import(new URL('../scripts/companies/osm.mjs', import.meta.url));
  /* the real tags of a German Toyota dealership, verbatim from the Overpass answer */
  const dealer = { brand: 'Toyota', 'brand:wikidata': 'Q53268', name: 'Autohaus Feldmoching', operator: 'Toyota', shop: 'car' };
  assert.equal(typeFromTags(dealer), 'store', 'a shop=car dealership is not a store');
  /* and the build must file a brand link as a store row, not a facility */
  const build = code('scripts/companies/build.mjs');
  assert.match(build, /o\.link === 'brand'/, 'build.mjs does not separate brand-linked elements');
});

/* ── ④ OSM: 小売タグは屋根の設備より強い ────────────────────────────────── */
test('④ a supermarket with rooftop solar is a store, not a power plant', async () => {
  const { typeFromTags } = await import(new URL('../scripts/companies/osm.mjs', import.meta.url));
  /* Walmart Supercenter #2026, Ponce PR — verbatim subset of its real tags */
  const walmart = {
    'operator:wikidata': 'Q483551', name: 'Walmart Supercenter', building: 'yes',
    power: 'generator', 'generator:source': 'solar', shop: 'supermarket',
  };
  assert.equal(typeFromTags(walmart), 'store', 'rooftop solar made a supermarket into a power plant');
  /* a real plant is still a plant */
  assert.equal(typeFromTags({ 'operator:wikidata': 'Q713418', industrial: 'semiconductor', name: 'Fab 21' }), 'factory');
  /* bare industrial land is NOT evidence of a factory */
  assert.equal(typeFromTags({ landuse: 'industrial', name: 'X' }), null, 'bare landuse=industrial claimed a factory');
  assert.equal(typeFromTags({ industrial: 'yes', name: 'X' }), null, 'industrial=yes claimed a factory');
});

/* ── ⑤ 施設は一段だけ辿る（推移閉包は駅を連れてくる）────────────────────── */
test('⑤ the facility query never walks the ownership graph transitively', () => {
  const src = code('scripts/companies/build.mjs');
  const queries = src.match(/wdt:P749[^\n]*/g) || [];
  for (const q of queries) {
    assert.ok(!/wdt:P749\s*\*/.test(q) && !/P749\)\*/.test(q),
      'a transitive parent-organisation path is back: ' + q.trim().slice(0, 100));
  }
  assert.ok(!/\(wdt:P749\|wdt:P127\)\*/.test(src), 'the measured Toyota-to-railway-stations path is back');
});

/* ── ⑥ 型ゲートは許可と拒否の両方を持つ ─────────────────────────────────── */
test('⑥ facility classes are gated by an allow list AND a deny list', async () => {
  const m = await import(new URL('../scripts/companies/facility-types.mjs', import.meta.url));
  assert.ok(m.ALLOW.length >= 20, 'the allow list is suspiciously short');
  assert.ok(m.DENY.length >= 8, 'the deny list is suspiciously short');
  const denySet = new Set(m.DENY);
  for (const q of ['Q55488', 'Q515', 'Q1248784']) {
    assert.ok(denySet.has(q), 'the deny list no longer rejects ' + q + ' (railway station / city / airport)');
  }
  /* every published type has a map group and a presence kind — adding one cannot forget either */
  for (const [, type] of m.ALLOW) {
    assert.ok(m.GROUP_OF[type], 'facility type "' + type + '" has no map group');
    assert.ok(m.PRESENCE_KIND[m.GROUP_OF[type]], 'group "' + m.GROUP_OF[type] + '" has no presence kind');
  }
});

/* ── ⑦ 語彙の正本は1つ ──────────────────────────────────────────────────── */
test('⑦ the facility vocabulary exists exactly once', () => {
  const data = code('js/company-data.js');
  const panel = code('js/company-panel.js');
  const fac = code('js/company-facilities.js');
  assert.match(data, /assembly_plant:\s*LA\(/, 'js/company-data.js no longer owns the vocabulary');
  for (const [name, src] of [['js/company-panel.js', panel], ['js/company-facilities.js', fac]]) {
    assert.ok(!/assembly_plant\s*:\s*(LA\(|\(\)\s*=>\s*L\()/.test(src),
      name + ' has its own copy of the type vocabulary again — the two drifted last time (Data centre / Data center)');
  }
  /* and the spelling the app already ships is the one used */
  assert.match(data, /'Data center'/, 'the vocabulary uses a spelling js/datacenters.js has not translated');
  assert.ok(!/Data centre/.test(data + panel + fac), 'a second spelling of "data center" is back');
});

/* ── ⑧ 実行時に外部 API を呼ばない ──────────────────────────────────────── */
test('⑧ the browser fetches nothing but our own data files', () => {
  for (const f of ['js/company-data.js', 'js/company-panel.js', 'js/company-facilities.js']) {
    const src = code(f);
    const urls = src.match(/https?:\/\/[^'"`\s)]+/g) || [];
    const live = urls.filter((u) => !/commons\.wikimedia\.org|openstreetmap\.org\/copyright|wikidata\.org\/wiki/.test(u));
    assert.deepEqual(live, [], f + ' would call ' + live.join(', ') + ' from the browser — every upstream is build time');
    if (/fetch\(/.test(src)) {
      const fetches = src.match(/fetch\([^)]*/g) || [];
      for (const ff of fetches) {
        assert.ok(/data\/companies|INDEX_URL|PROFILE_DIR|STORE_DIR/.test(ff),
          f + ' fetches something other than data/companies/: ' + ff.slice(0, 80));
      }
    }
  }
});

/* ── ⑨ 出荷された索引の形 ───────────────────────────────────────────────── */
test('⑨ the shipped index is the shape the panel reads', { skip: !hasData && 'data/companies not built' }, () => {
  assert.ok(Array.isArray(index.companies) && index.companies.length >= 400,
    'the index has ' + (index.companies || []).length + ' companies — the brief asks for 500+');
  const ids = new Set();
  for (const c of index.companies) {
    assert.ok(c.id && !ids.has(c.id), 'duplicate or missing company id: ' + c.id);
    ids.add(c.id);
    assert.ok(c.n, 'company with no name: ' + c.id);
    assert.ok(/^[A-Z]{3}$/.test(c.cc || 'XXX') || c.cc === '', 'bad country code on ' + c.id + ': ' + c.cc);
    if (c.hq) {
      assert.ok(Math.abs(c.hq[0]) <= 180 && Math.abs(c.hq[1]) <= 90, 'HQ out of range: ' + c.id);
      assert.ok(!(c.hq[0] === 0 && c.hq[1] === 0), 'HQ at 0,0 — "unknown" written as a place: ' + c.id);
    }
  }
});

/* ── ⑩ 金額は必ず通貨と期間を持つ ───────────────────────────────────────── */
test('⑩ every shipped money value states its currency and its period',
  { skip: !profileFiles.length && 'data/companies not built' }, () => {
    let checked = 0;
    for (const f of profileFiles) {
      const p = readProfile(f);
      for (const [k, v] of Object.entries(p.scale || {})) {
        checked++;
        assert.ok(Number.isFinite(v.value), p.id + ' scale.' + k + ' has no finite value');
        if (k !== 'employees') assert.ok(v.currency, p.id + ' scale.' + k + ' has no currency');
        assert.ok(v.fiscalYear || v.asOf, p.id + ' scale.' + k + ' has no fiscal year or as-of date');
        assert.ok((p.sources || [])[v.src], p.id + ' scale.' + k + ' points at no source');
      }
    }
    assert.ok(checked > 200, 'only ' + checked + ' financial values were checked — the data looks empty');
  });

/* ── ⑪ 施設は出典と位置精度を必ず持つ ───────────────────────────────────── */
test('⑪ every shipped facility carries a source and says how precise its position is',
  { skip: !profileFiles.length && 'data/companies not built' }, () => {
    const PREC = new Set(['exact', 'city', 'region']);
    let n = 0;
    for (const f of profileFiles) {
      const p = readProfile(f);
      for (const fac of (p.facilities || [])) {
        n++;
        assert.ok((p.sources || [])[fac.src], p.id + ': facility "' + fac.name + '" has no source');
        assert.ok(PREC.has(fac.precision), p.id + ': facility "' + fac.name + '" precision=' + fac.precision);
        assert.ok(!(fac.lon === 0 && fac.lat === 0), p.id + ': facility at 0,0 — ' + fac.name);
        assert.ok(String(fac.name || '').trim(), p.id + ': facility with an empty name');
      }
    }
    assert.ok(n > 500, 'only ' + n + ' facilities shipped — the atlas looks empty');
  });

/* ── ⑫ 代表企業は実データで動く ─────────────────────────────────────────── */
test('⑫ the companies the brief names have a profile with real facilities',
  { skip: !hasData && 'data/companies not built' }, () => {
    /* by identity, not by name — a name test would pass on a different "Shell" */
    const WANT = { Q312: 'Apple', Q53268: 'Toyota', Q713418: 'TSMC', Q81230: 'Siemens', Q483551: 'Walmart' };
    const byWd = new Map(index.companies.map((c) => [c.wd, c]));
    for (const [q, name] of Object.entries(WANT)) {
      const row = byWd.get(q);
      assert.ok(row, name + ' (' + q + ') is not in the company index');
      const p = readProfile(row.id + '.json');
      assert.ok(p.identity && p.identity.website, name + ' has no official website');
      assert.ok((p.facilities || []).length >= 3, name + ' has only ' + (p.facilities || []).length + ' facilities');
      assert.ok(p.facilities.some((f) => f.group === 'hq'), name + ' has no headquarters');
      assert.ok((p.sources || []).length >= 1, name + ' cites no sources');
    }
  });

/* ── ⑬ 巨大な店舗網はプロフィールに入れない ─────────────────────────────── */
test('⑬ a retail network never rides along in the profile',
  { skip: !profileFiles.length && 'data/companies not built' }, () => {
    for (const f of profileFiles) {
      const p = readProfile(f);
      const stores = (p.facilities || []).filter((x) => x.type === 'store').length;
      assert.ok(stores < 40, p.id + ' carries ' + stores + ' stores in its profile — that is a network, and it belongs in data/companies/stores/');
      if (p.storeNetwork) {
        assert.ok(p.storeNetwork.count > 0, p.id + ' declares an empty store network');
        assert.ok(existsSync(path.join(DATA, 'stores', p.id + '.json')),
          p.id + ' declares a store network with no file behind it');
      }
    }
  });

/* ── ⑭ プロフィールは1社ぶんだけ ────────────────────────────────────────── */
test('⑭ one profile is one company, and it is small enough to fetch on a tap',
  { skip: !profileFiles.length && 'data/companies not built' }, () => {
    let biggest = { n: 0, f: '' };
    for (const f of profileFiles) {
      const bytes = statSync(path.join(PROFILES, f)).size;
      if (bytes > biggest.n) biggest = { n: bytes, f };
    }
    assert.ok(biggest.n < 400 * 1024,
      'the largest profile is ' + Math.round(biggest.n / 1024) + ' kB (' + biggest.f + ') — a tap should not cost that');
  });

/* ── ⑮ 検査そのものが `npm test` から走ること ───────────────────────────── */
test('⑮ this file and the company gate are actually wired into the test run', () => {
  const pkg = JSON.parse(rd('package.json'));
  assert.match(pkg.scripts['test:checks'] || '', /r354-checks\.test\.mjs/,
    'tests/r354-checks.test.mjs is not in test:checks — a file left out of that list never runs (#R301)');
  assert.ok(pkg.scripts['check:companies'], 'npm run check:companies does not exist');
  const parallel = rd('scripts/test-parallel.mjs') + rd('scripts/static-checks.mjs');
  assert.ok(/check:companies|companies-audit/.test(parallel + JSON.stringify(pkg.scripts)),
    'the company audit is never executed by npm test');
});

/* ── ⑯ 期間は「年」であって、0 ではない ────────────────────────────────── */
test('⑯ a period that is not a year is the same failure as no period at all',
  { skip: !profileFiles.length && 'data/companies not built' }, () => {
    /* ⚠ MEASURED IN PRODUCTION after the first release: 69 figures across 57 companies printed
       «USD · 0» — al Rajhi Bank's revenue, Fanuc's net income, Rosneft's market cap and 48
       employee counts. The cause is the trap this file already records one level down:
       `Number(periodOf(c))` where periodOf returns null, Number(null) is 0, isFinite(0) is true,
       and 0 beats the -1 seed. A key that exists is not a date. */
    let bad = 0;
    const seen = [];
    for (const f of profileFiles) {
      const p = readProfile(f);
      for (const [k, v] of Object.entries(p.scale || {})) {
        const period = String(v.fiscalYear || v.asOf || '').replace(/^FY/, '');
        const y = Number(period);
        if (!Number.isFinite(y) || y < 1000 || y > 2200) { bad++; if (seen.length < 6) seen.push(p.id + '.' + k + '="' + period + '"'); }
      }
    }
    assert.equal(bad, 0, bad + ' shipped figures carry a period that is not a year: ' + seen.join(', '));
  });

/* ── ⑰ フレーミングはパネルが組み上がってから ──────────────────────────── */
test('⑰ the frame waits for the panel it is supposed to avoid', () => {
  const src = code('js/company-facilities.js');
  /* the fit must not run in the same tick as show(): the panel that has to be avoided is still
     being built, so it measures 0 and the frame avoids nothing (measured on a phone: 0 of 33
     sites in the visible strip). */
  assert.match(src, /if\(fit\)\s*setTimeout/, 'show({fit}) frames before the panel exists again');
  /* and the camera padding it borrows has to be given back */
  assert.match(src, /_restorePad\(\)/, 'the camera keeps whatever padding the atlas set');
  assert.match(src, /function hide\(\)\{[\s\S]{0,120}_restorePad\(\)/, 'hide() does not restore the padding');
});
