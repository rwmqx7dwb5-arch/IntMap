/* ============================================================================
 *  IntMap · the company atlas — sourced facts, lazy delivery, and the upstreams the tab reads
 * ----------------------------------------------------------------------------
 *  企業アトラスが配る事実の質（出典・通貨・期間・位置精度）と、Companies タブの上流
 *  （ロゴ・株価の中継）の構造。
 *
 *  ⚠ 主題単位へ統合した検査（旧ラウンド単位のファイルから、題名を保ったまま移した）。
 *    各節はブロックに包んであり、補助の名前は節ごとに閉じている（別ファイルだった頃と同じ隔離）。
 *    「綴りのまま:」の注記は、評価に置き換えられない検査がなぜそうなのかを 1 行で言う。
 * ==========================================================================*/
import test from 'node:test';
import { LAZY_NAMES } from '../js/lazy-modules.js';
import assert from 'node:assert/strict';
import path, { join } from 'node:path';
import { readFileSync, existsSync, readdirSync, statSync, globSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/* ════════ #R354 — from tests/r354-checks.test.mjs ════════ */
{
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
/* 綴りのまま: 主張が配線・不在・一意性（どこが何を呼ぶか／無いこと／1 か所だけ）で、評価して取り出せる値が無い */
test('#R354 ① the company atlas is not in the boot path', async () => {
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
  /* 門2の残り: 登録表（js/lazy-modules.js の LAZY_REGISTRY・#R798）に名前が載っていること */
  for (const n of ['companyData', 'companyPanel', 'companyFacilities']) {
    assert.ok(LAZY_NAMES.includes(n), 'the lazy registry is missing ' + n);
  }
});

/* ── ② 既存の curated 表を壊していない ───────────────────────────────────── */
test('#R354 ② the 190-row curated table is still the one source of the live-market-cap universe', () => {
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
/* 綴りのまま: 対象はネットワーク（Wikidata・上流 API）を呼ぶビルド／問い合わせ文で、ここでは走らせない */
test('#R354 ③ brand:wikidata is retail presence, never a corporate facility', async () => {
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
test('#R354 ④ a supermarket with rooftop solar is a store, not a power plant', async () => {
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
/* 綴りのまま: 対象はネットワーク（Wikidata・上流 API）を呼ぶビルド／問い合わせ文で、ここでは走らせない */
test('#R354 ⑤ the facility query never walks the ownership graph transitively', () => {
  const src = code('scripts/companies/build.mjs');
  const queries = src.match(/wdt:P749[^\n]*/g) || [];
  for (const q of queries) {
    assert.ok(!/wdt:P749\s*\*/.test(q) && !/P749\)\*/.test(q),
      'a transitive parent-organisation path is back: ' + q.trim().slice(0, 100));
  }
  assert.ok(!/\(wdt:P749\|wdt:P127\)\*/.test(src), 'the measured Toyota-to-railway-stations path is back');
});

/* ── ⑥ 型ゲートは許可と拒否の両方を持つ ─────────────────────────────────── */
test('#R354 ⑥ facility classes are gated by an allow list AND a deny list', async () => {
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
/* 綴りのまま: 主張が配線・不在・一意性（どこが何を呼ぶか／無いこと／1 か所だけ）で、評価して取り出せる値が無い */
test('#R354 ⑦ the facility vocabulary exists exactly once', () => {
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
/* 綴りのまま: 主張が配線・不在・一意性（どこが何を呼ぶか／無いこと／1 か所だけ）で、評価して取り出せる値が無い */
test('#R354 ⑧ the browser fetches nothing but our own data files', () => {
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
test('#R354 ⑨ the shipped index is the shape the panel reads', { skip: !hasData && 'data/companies not built' }, () => {
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
test('#R354 ⑩ every shipped money value states its currency and its period',
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
test('#R354 ⑪ every shipped facility carries a source and says how precise its position is',
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
test('#R354 ⑫ the companies the brief names have a profile with real facilities',
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
test('#R354 ⑬ a retail network never rides along in the profile',
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
test('#R354 ⑭ one profile is one company, and it is small enough to fetch on a tap',
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
/* 綴りのまま: 主張が配線・不在・一意性（どこが何を呼ぶか／無いこと／1 か所だけ）で、評価して取り出せる値が無い */
test('#R354 ⑮ the company gate is actually wired into the test run', () => {
  const pkg = JSON.parse(rd('package.json'));
  assert.ok(pkg.scripts['check:companies'], 'npm run check:companies does not exist');
  const parallel = rd('scripts/test-parallel.mjs') + rd('scripts/static-checks.mjs');
  assert.ok(/check:companies|companies-audit/.test(parallel + JSON.stringify(pkg.scripts)),
    'the company audit is never executed by npm test');
});

/* ── ⑯ 期間は「年」であって、0 ではない ────────────────────────────────── */
test('#R354 ⑯ a period that is not a year is the same failure as no period at all',
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
/* 綴りのまま: 対象は DOM・地図（MapLibre / WebGL）に触れる closure の中で、ブラウザの外では走らない（実ブラウザ側は spec が持つ） */
test('#R354 ⑰ the frame waits for the panel it is supposed to avoid', () => {
  const src = code('js/company-facilities.js');
  /* the fit must not run in the same tick as show(): the panel that has to be avoided is still
     being built, so it measures 0 and the frame avoids nothing (measured on a phone: 0 of 33
     sites in the visible strip). */
  assert.match(src, /if\(fit\)\s*setTimeout/, 'show({fit}) frames before the panel exists again');
  /* and the camera padding it borrows has to be given back */
  assert.match(src, /_restorePad\(\)/, 'the camera keeps whatever padding the atlas set');
  assert.match(src, /function hide\(\)\{[\s\S]{0,120}_restorePad\(\)/, 'hide() does not restore the padding');
});

/* ── ⑱ フレーミングは、断られたら降りる。黙って止まらない ──────────────── */
/* 綴りのまま: 対象は DOM・地図（MapLibre / WebGL）に触れる closure の中で、ブラウザの外では走らない（実ブラウザ側は spec が持つ） */
test('#R354 ⑱ a padding the renderer refuses backs off instead of cancelling the frame', () => {
  const src = code('js/company-facilities.js');
  /* ⚠ forBounds answers NULL for a padding it cannot satisfy — not an exception, not a warning —
     and the fitBounds fallback then throws into a catch. MEASURED IN PRODUCTION: the camera did
     not move for 24 s and 19 of 33 sites sat on the far side of the globe. */
  assert.ok(src.includes('[1,0.75,0.5,0.25,0]'),
    'the frame no longer backs off when the renderer refuses a padding');
  /* and a frame that is not looking at its own subject is a refusal too: heavy one-sided padding
     is honoured by MOVING THE CENTRE, which on a globe puts the sites past the limb. */
  assert.ok(src.includes('Math.abs(lat-bbLat)>30'),
    'a frame centred far from the sites is accepted again');
  assert.ok(src.includes('const bbLat='), 'the bounds centre is not computed');
});
}

/* ════════ #R533 — from tests/r533-checks.test.mjs ════════ */
{
/* ============================================================================
 *  #R533 — the Companies tab stops asking a host that no longer exists
 * ----------------------------------------------------------------------------
 *  Two upstreams of the Companies tab were failing on the live site (measured 2026-09-07):
 *
 *    · logo.clearbit.com — 189 × ERR_NAME_NOT_RESOLVED per visit. Clearbit's free Logo API was
 *      deprecated 2025-03-18 and shut down 2025-12-08; the host is gone from DNS (8.8.8.8,
 *      1.1.1.1 and 9.9.9.9 all return the clearbit.com SOA and no A, no CNAME).
 *    · the tab's own three-rung CORS-proxy ladder — Yahoo answers 200 with no ACAO, corsproxy.io
 *      answered 403 and api.allorigins.win answered 522, all at the same time.
 *
 *  The liveness half of this is in tests/prod-smoke.spec.js, where it belongs: a host either
 *  answers or it does not, and only the network can say. What is checked here is the half that can
 *  be decided from the tree — that the structures which produced those two failures are gone, and
 *  that the answer this project already had is the one the code now reaches for.
 * ==========================================================================*/
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/* ── ① no shipped code REQUESTS the dead host ─────────────────────────────────────────────────
   Over the whole of js/, not over the one file that had it: #R429's lesson is that a check written
   at one file guards that file and nothing else.

   ⚠ IT ASKS «DOES ANYTHING REQUEST IT», NOT «IS THE NAME PRESENT». The first draft banned the
   spelling outright and went red on nine locale files — which name the host in PROSE, to tell
   readers which source went away and when. A check that bans a name turns the honest explanation
   of a dead source into a test failure, and the pressure it creates is to delete the explanation.
   What separates asking from explaining is the scheme: a URL the code will fetch carries
   `https://`, and the prose says `logo.clearbit.com`. Comments are stripped for the same reason —
   this repository's own notes are allowed to remember what was removed. */
/* 綴りのまま: 主張が配線・不在・一意性（どこが何を呼ぶか／無いこと／1 か所だけ）で、評価して取り出せる値が無い */
test('#R533 ① no shipped code requests logo.clearbit.com', () => {
  const files = globSync('js/**/*.js', { cwd: ROOT });
  assert.ok(files.length > 50, 'found js/ modules to scan (got ' + files.length + ')');
  const guilty = files.filter((f) => /https:\/\/logo\.clearbit\.com/.test(stripComments(read(f))));
  assert.deepEqual(guilty, [], 'these still build a URL for the dead Clearbit host: ' + guilty.join(', '));
  /* …and the rung that replaced it reads the shipped index rather than another stranger */
  assert.match(read('js/companies-ui.js'), /function _coLogoSrc\(tk,dom\)\{[\s\S]*?IntMapCompanyData\.logoFor/,
    'the first rung reads the logo out of the shipped company index');
});

/* ── ② the logo the list draws is the one this repository already resolved ─────────────────────
   scripts/companies/build.mjs reads Wikidata P154 and writes a Commons URL. The failure was that
   it only reached profiles/<id>.json, which the list never fetches. */
test('#R533 ② the shipped company index carries the build-time Commons logo', () => {
  const rows = JSON.parse(read('data/companies/index.json')).companies;
  assert.ok(rows.length > 400, 'index holds companies');
  const withLogo = rows.filter((c) => c.lg);
  assert.ok(withLogo.length > 300, 'most companies ship a logo (got ' + withLogo.length + ')');
  const bad = withLogo.filter((c) => !c.lg.startsWith('https://commons.wikimedia.org/wiki/Special:FilePath/'));
  assert.deepEqual(bad.map((c) => c.id), [], 'every shipped logo is a Commons file path');
  /* and it is the profile's own string, not a second construction of the same URL */
  let compared = 0;
  for (const c of withLogo) {
    const pf = join(ROOT, 'data/companies/profiles', c.id + '.json');
    if (!existsSync(pf)) continue;
    assert.equal(c.lg, JSON.parse(readFileSync(pf, 'utf8')).identity.logo,
      c.id + ': the index logo and the profile logo must be the same string');
    compared++;
  }
  assert.ok(compared > 300, 'compared against the profiles (got ' + compared + ')');
});

/* ── ③ the builder keeps writing it ───────────────────────────────────────────────────────────
   ② measures today's artefact; without this the next full rebuild would silently drop the field
   and ② would only notice after the data had already been regenerated. */
/* 綴りのまま: 対象はネットワーク（Wikidata・上流 API）を呼ぶビルド／問い合わせ文で、ここでは走らせない */
test('#R533 ③ scripts/companies/build.mjs emits the logo into the index row', () => {
  assert.match(read('scripts/companies/build.mjs'), /lg:\s*profile\.identity\.logo/,
    'the index row takes the logo from the profile it just wrote');
});

/* ── ④ a company with no known logo makes NO request ───────────────────────────────────────────
   The whole defect was 189 requests that could not succeed. The monogram is the answer when the
   index has not landed or holds nothing, and a speculative URL is not. */
/* 綴りのまま: 対象は DOM・地図（MapLibre / WebGL）に触れる closure の中で、ブラウザの外では走らない（実ブラウザ側は spec が持つ） */
test('#R533 ④ the list falls back to the monogram, never to a guessed logo URL', () => {
  const s = read('js/companies-ui.js');
  assert.match(s, /const src=r\|\|_coLogoSrc\(tk,d\);[\s\S]{0,80}?if\(!src\) return mono\(\);/,
    'an unknown logo yields the monogram rather than an <img> with a guessed src');
  assert.match(s, /if\(s===0&&dom\)\{[^}]*google\.com\/s2\/favicons/,
    'the favicon fallback survives, and only for a company we have a domain for');
});

/* ── ⑤ the private proxy ladder is gone ────────────────────────────────────────────────────────
   `no-ad-hoc-hardcoding` §2.3: the judgement already existed in js/proxy-fetch.js. */
/* 綴りのまま: 主張が配線・不在・一意性（どこが何を呼ぶか／無いこと／1 か所だけ）で、評価して取り出せる値が無い */
test('#R533 ⑤ js/companies.js uses the shared relay ladder, not a copy of one', () => {
  const s = read('js/companies.js');
  assert.doesNotMatch(stripComments(s), /corsproxy\.io|allorigins\.win/,
    'no private proxy list survives outside the comments that explain its removal');
  assert.match(s, /HOST\.fetchViaProxy\(u,\s*\{as:'json'/, 'quotes go through the shared ladder');
});

/* ── ⑥ …and the shared ladder offers the new relay for the URLs this file builds ───────────────*/
test('#R533 ⑥ the shared ladder offers quotes-relay for the URLs companies.js builds', () => {
  const m = /const OWN_RELAYS = \[([\s\S]*?)\n {2}\];/.exec(read('js/proxy-fetch.js'));
  assert.ok(m, 'proxy-fetch publishes a relay table');
  const rows = [...m[1].matchAll(/fn: '([a-z-]+)',\s*test: \(u\) => (\/[^\n]*?\/)\.test\(u\)/g)];
  assert.ok(rows.length >= 2, 'the table holds both relays (got ' + rows.length + ')');
  const quotes = rows.find(([, fn]) => fn === 'quotes-relay');
  assert.ok(quotes, 'quotes-relay is in the table');
  const re = new RegExp(quotes[2].slice(1, -1));

  /* the URLs the app actually builds, taken from the file rather than retyped */
  const built = yahooPrefixes();
  assert.ok(built.length >= 3, 'companies.js builds Yahoo URLs (got ' + built.length + ')');
  for (const u of built) assert.ok(re.test(u), 'quotes-relay would be offered for ' + u);
});

/* Every Yahoo URL js/companies.js builds, with the concatenated values filled in so the string is
   a URL rather than a prefix. Taken from the source so that a new call site joins these checks
   without anyone remembering to add it. */
function yahooPrefixes() {
  const co = read('js/companies.js');
  const out = [];
  for (const m of co.matchAll(/'(https:\/\/query[12]\.finance\.yahoo\.com\/[^']*)'/g)) {
    out.push(m[1]
      .replace(/symbols=$/, 'symbols=AAPL,MSFT')
      .replace(/chart\/$/, 'chart/AAPL')
      .replace(/[?&]period1=$/, '?period1=100&period2=200&interval=1mo'));
  }
  return out;
}

/* ── ⑦ the function on the other side accepts exactly those ────────────────────────────────────
   The browser-side table and the relay's own allow-list are two halves of one rule. A URL the app
   builds, offered to a relay that refuses it, is a wasted round trip that looks like an outage.
   ⚠ The predicate is EVALUATED, not read: #R505 — a check that reads source cannot see what the
   code does. */
test('#R533 ⑦ quotes-relay accepts the URLs the app builds and refuses everything else', () => {
  const src = read('supabase/functions/quotes-relay/index.ts');
  const body = src.slice(src.indexOf('const SYMBOL_RE'), src.indexOf('Deno.serve'));
  assert.ok(body.includes('function allowed'), 'found the allow-list predicate');
  const allowed = new Function(body + '\nreturn allowed;')();

  for (const u of [
    'https://query1.finance.yahoo.com/v8/finance/spark?symbols=AAPL,MSFT&range=1mo&interval=1d',
    'https://query1.finance.yahoo.com/v8/finance/chart/AAPL?range=1d&interval=1d',
    'https://query1.finance.yahoo.com/v8/finance/chart/AAPL?period1=100&period2=200&interval=1mo',
    /* ⚠ BEFORE 1970 IS A REAL WINDOW, AND THE FIRST ALLOW-LIST REFUSED IT. The compare view's time
       series goes back to 1962, so period1/period2 are negative there. Production measured 112 of
       135 calls answered 400 for exactly this, with the graph still drawing because the public
       relays picked up what our own relay had refused — a defect that hides behind its fallback. */
    'https://query1.finance.yahoo.com/v8/finance/chart/KO?period1=-473385600&period2=-441936000&interval=1mo',
  ]) assert.ok(allowed(u), 'should relay ' + u);

  for (const u of [
    'https://query1.finance.yahoo.com/v7/finance/download/AAPL',         // a different endpoint
    'https://finance.yahoo.com/v8/finance/chart/AAPL',                   // a different host
    'http://query1.finance.yahoo.com/v8/finance/chart/AAPL',             // not https
    'https://query1.finance.yahoo.com/v8/finance/chart/AAPL?cookie=x',   // an unlisted parameter
    'https://query1.finance.yahoo.com/v8/finance/spark?range=1mo',       // spark with no symbols
    'https://evil.example/v8/finance/spark?symbols=AAPL',
  ]) assert.ok(!allowed(u), 'must NOT relay ' + u);

  /* and it accepts what the app builds — the same list ⑥ used, so the two halves cannot drift */
  for (const u of yahooPrefixes()) assert.ok(allowed(u), 'the function accepts ' + u);
});

/* ── ⑧ the batch size is the upstream's stated limit, in both halves ───────────────────
   Yahoo answers a 24-symbol spark request with 400 and «Number of symbols needs to be less than or
   equal to 20» (measured 2026-09-07). js/companies.js had been asking for 40, so every batched
   quote 400'd and the tab fell through to ~150 single-symbol requests — the failure #R353's
   production verification recorded as 「ライブ株価の最初の数手は必ず失敗する」 and blamed on the proxies.
   The number appears twice because two processes enforce it; this is what keeps them equal. */
/* 綴りのまま: 主張が配線・不在・一意性（どこが何を呼ぶか／無いこと／1 か所だけ）で、評価して取り出せる値が無い */
test('#R533 ⑧ the spark batch size matches the relay cap, and both are the upstream limit', () => {
  const app = /const SPARK_MAX_SYMBOLS\s*=\s*(\d+)/.exec(read('js/companies.js'));
  const fn = /const SPARK_MAX_SYMBOLS\s*=\s*(\d+)/.exec(read('supabase/functions/quotes-relay/index.ts'));
  assert.ok(app, 'js/companies.js names its batch size');
  assert.ok(fn, 'quotes-relay names its cap');
  assert.equal(app[1], fn[1], 'the app batches exactly what the relay will accept');
  assert.equal(Number(app[1]), 20, "Yahoo's stated limit for /v8/finance/spark");
  /* and the batcher actually uses it, rather than naming it beside a literal */
  assert.match(read('js/companies.js'), /const B=SPARK_MAX_SYMBOLS;/,
    'the batch loop uses the constant');
});

/* ── ⑨ the relay is declared, or it does not exist in production ───────────────────────────────
   Asked of the DISK rather than of a hand-written roster (#R529): the set of functions is
   discovered, and config.toml must name exactly it. */
test('#R533 ⑨ every Edge Function on disk is declared in supabase/config.toml, and vice versa', () => {
  const toml = read('supabase/config.toml');
  assert.match(toml, /^\[functions\.quotes-relay\]/m, 'quotes-relay is declared');
  const declared = [...toml.matchAll(/^\[functions\.([a-z0-9-]+)\]/gm)].map((m) => m[1]).sort();
  const onDisk = globSync('supabase/functions/*/index.ts', { cwd: ROOT })
    .map((p) => p.split(/[\\/]/)[2]).sort();
  assert.ok(onDisk.length >= 15, 'found the functions on disk (got ' + onDisk.length + ')');
  assert.deepEqual(declared, onDisk,
    '_shared/ is a library, not a function — every directory with an index.ts is declared');
});
}
