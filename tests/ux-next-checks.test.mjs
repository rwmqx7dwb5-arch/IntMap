/* (ux-next) the regression checks of this work — see dev-notes/2026-10-03-ux-next.md */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { wikiTargets, findArticle, siteOfKey, isSingleName } from '../js/wiki-lookup.js';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');

/* ══ ① THE WIKIPEDIA BUTTON ASKS BY QUERY FIELDS, NOT BY THE DISPLAY NAME ══════════════════════════════
   Production f01c607: the Libya label asked en.wikipedia for «ⵍⵉⴱⵢⴰ ليبيا Libya» (OSM `name`, a side-by-side
   display of three scripts) and 404'd. The properties below are the OpenMapTiles fields that label carries. */
const LIBYA = { name: 'ⵍⵉⴱⵢⴰ ليبيا Libya', 'name:en': 'Libya', 'name:ja': 'リビア', 'name:de': 'Libyen', name_en: 'Libya', name_int: 'Libya', class: 'country' };
const KEYS = { en: ['name:en', 'name:latin', 'name_int'], jp: ['name:ja', 'name:en', 'name:latin', 'name_int'], zh: ['name:zh-Hant', 'name:zh', 'name:en', 'name:latin', 'name_int'] };

test('① a composite display name is never a title; the per-language fields are, each in its own wiki', () => {
  assert.equal(isSingleName(LIBYA.name), false, 'three scripts side by side are not one name');
  for (const s of ['Paris', 'リビア', '東京都', '서울특별시', 'Москва', 'القاهرة', "Côte d'Ivoire"]) assert.equal(isSingleName(s), true, s);
  const en = wikiTargets(LIBYA, KEYS.en);
  assert.deepEqual(en[0], { site: 'en', title: 'Libya', via: 'name:en' });
  assert.ok(!en.some((t) => t.title === LIBYA.name), 'the display name is not asked anywhere');
  const jp = wikiTargets(LIBYA, KEYS.jp);
  assert.deepEqual(jp.slice(0, 2).map((t) => t.site + ':' + t.title), ['ja:リビア', 'en:Libya']);
  assert.equal(new Set(jp.map((t) => t.site + t.title)).size, jp.length, 'a pair is asked once');
});

test('① the wiki of a field is the language of the field (zh-Hant → zh, name_int → en)', () => {
  assert.equal(siteOfKey('name:zh-Hant'), 'zh');
  assert.equal(siteOfKey('name:ja'), 'ja');
  assert.equal(siteOfKey('name_int'), 'en');
  assert.equal(siteOfKey('name:latin'), 'en');
  assert.equal(siteOfKey('name_de'), 'de');
  assert.equal(siteOfKey('class'), '');
  const t = wikiTargets({ name: '臺北市', 'name:zh-Hant': '臺北市', 'name:en': 'Taipei' }, KEYS.zh);
  assert.deepEqual(t.slice(0, 2).map((x) => x.site), ['zh', 'en']);
});

test('① a refused name:* (the label refuses it, #R691) is refused by the lookup too; a QID comes first', () => {
  const p = { name: 'Yüreğir', 'name:ja': '良癖', 'name:en': 'Yüreğir' };
  const t = wikiTargets(p, KEYS.jp, { refused: (k) => k === 'name:ja' });
  assert.ok(!t.some((x) => x.title === '良癖'));
  const q = wikiTargets({ wikidata: 'Q1016', name: LIBYA.name, 'name:en': 'Libya' }, KEYS.jp);
  assert.deepEqual(q[0], { qid: 'Q1016', sites: ['ja', 'en'], via: 'wikidata' });
});

test('① findArticle walks the targets and answers the first real article (a stub fetch — no network)', async () => {
  const pages = { 'https://ja.wikipedia.org/api/rest_v1/page/summary/%E3%83%AA%E3%83%93%E3%82%A2': { type: 'standard', title: 'リビア', content_urls: { desktop: { page: 'https://ja.wikipedia.org/wiki/%E3%83%AA%E3%83%93%E3%82%A2' } } } };
  const asked = [];
  const hit = await findArticle(wikiTargets(LIBYA, KEYS.jp), async (u) => { asked.push(u); return pages[u] || null; });
  assert.equal(hit.url, 'https://ja.wikipedia.org/wiki/%E3%83%AA%E3%83%93%E3%82%A2');
  assert.equal(asked.length, 1, 'stops at the first hit');
  /* a disambiguation page is not an article; the walk moves on */
  const dis = await findArticle([{ site: 'en', title: 'Georgia', via: 'name:en' }], async () => ({ type: 'disambiguation', content_urls: { desktop: { page: 'x' } } }));
  assert.equal(dis, null);
  /* a QID resolves through its sitelinks to the reader's wiki first */
  const viaQ = await findArticle([{ qid: 'Q1016', sites: ['ja', 'en'], via: 'wikidata' }], async (u) => {
    if (new URL(u).hostname === 'www.wikidata.org') return { entities: { Q1016: { sitelinks: { jawiki: { title: 'リビア' }, enwiki: { title: 'Libya' } } } } };
    if (new URL(u).hostname === 'ja.wikipedia.org') return { type: 'standard', title: 'リビア', content_urls: { desktop: { page: 'https://ja.wikipedia.org/wiki/x' } } };
    return null;
  });
  assert.equal(viaQ.site, 'ja');
});

test('① every place-label popup hands the lookup the feature properties, and the modern path asks wikiTargets', () => {
  const src = read('js/map-ui.js');
  const calls = src.match(/showPopup\(labelAnchor\([^;]*\);/g) || [];
  assert.ok(calls.length >= 3, 'the three label callers');
  for (const c of calls) assert.match(c, /props:/, 'a label caller without the feature properties: ' + c.slice(0, 90));
  const block = src.slice(src.indexOf("const w=document.querySelector('.plc-wiki');"), src.indexOf('/* (#R20) AI Research Assistant entry point */'));
  assert.match(block, /W\.findArticle\(W\.wikiTargets\(/);
  assert.doesNotMatch(read('js/map-ui.js'), /^import[^\n]*wiki-lookup/m, 'fetched by the popup, not imported at boot');
  assert.doesNotMatch(block, /_probe\(wl,wtitle\)/, 'the old display-name probe is gone');
  /* every remaining probe of the display title is on the historical branch (an explicit English title). The English
     reader's branch used to come FIRST and probe the display name for every modern place — the first version of this
     fix left it there, and tests/ux-next.spec.js ③ caught it asking «ⵍⵉⴱⵢⴰ_ليبيا_Libya» again */
  const hist = block.indexOf('if(opts&&opts.wiki'), modern = block.indexOf('/* a modern place');
  assert.ok(hist >= 0 && modern > hist, 'the historical/modern split is the first question');
  for (const m of block.matchAll(/(?<!const )_probe\(/g)) assert.ok(m.index > hist && m.index < modern, 'a display-title probe outside the historical branch at ' + m.index);
});

/* ══ ② THE COMMAND PALETTE ORDERS BY AGREEMENT, THE SAME FOR EVERY KIND ═════════════════════════════════ */
import { scoreText, scoreEntry, rankEntries, fold } from '../js/command-palette.js';

test('② the agreement of a name with what was typed — whole, start, word start, inside, every word', () => {
  assert.equal(scoreText('rail', 'Rail'), 100);
  assert.ok(scoreText('rail', 'Railways') > scoreText('rail', 'Light rail') && scoreText('rail', 'Light rail') > scoreText('rail', 'Guardrails'));
  assert.equal(scoreText('rain', 'Water & terrain labels'), 66, 'a fragment inside a word is the weakest single match');
  assert.ok(scoreText('rail japan', 'Railways (Japan)') > 0, 'every typed word present');
  assert.equal(scoreText('zzz', 'Railways'), 0);
  assert.equal(fold('Köppen'), 'koppen', 'Latin accents fold');
  assert.equal(fold('ガス'), 'ガス', 'the Japanese voicing mark is not an accent');
  assert.ok(scoreText('地震', '地震シミュレーター') >= 90);
});

test('② ranking: best agreement first, a recent choice wins a tie, nothing that does not agree is shown', () => {
  const E = [
    { key: 'layer:a', kind: 'layer', title: 'Earthquakes', terms: [] },
    { key: 'cmd:sim.seismic', kind: 'action', title: 'Earthquake simulator', terms: ['sim.seismic'] },
    { key: 'layer:b', kind: 'layer', title: 'Night lights', terms: [] },
  ];
  assert.deepEqual(rankEntries('earthquake', E).map((e) => e.key), ['layer:a', 'cmd:sim.seismic'], 'equal agreement: the shorter name');
  assert.deepEqual(rankEntries('earthquake', E, ['cmd:sim.seismic']).map((e) => e.key), ['cmd:sim.seismic', 'layer:a'], 'a recent choice wins the tie');
  assert.equal(scoreEntry('seismic', E[1]), 80 - 6, 'an extra term counts, a little below the title');
});

/* ══ ③ THE COMPANY FOOTPRINT — DERIVED FROM THE PROFILES, READ FROM THE LAND ═════════════════════════════ */
import { buildFootprint, footprintDrift } from '../scripts/companies/footprint.mjs';
import { expand, select, tally, inBox } from '../js/company-footprint.js';

test('③ the shipped footprint is exactly the profiles (the derivation the audit ㉒ also runs)', () => {
  assert.equal(footprintDrift(), '');
  const fp = buildFootprint();
  const idx = JSON.parse(read('data/companies/index.json'));
  assert.equal(fp.companies.length, idx.companies.length);
  /* every facility the index counts is in the footprint (index `fac` is the profile's located facilities) */
  const counted = idx.companies.reduce((a, c) => a + (+c.fac || 0), 0);
  assert.ok(fp.f.length > 0 && fp.f.length <= counted, fp.f.length + ' of ' + counted);
  assert.ok(fp.f.every((r) => r[2] >= -180 && r[2] <= 180 && r[3] >= -90 && r[3] <= 90 && !(r[2] === 0 && r[3] === 0)));
});

test('③ select / tally answer «who is here» — by country, by group, by a box across the antimeridian', () => {
  const fp = { companies: ['a', 'b'], types: ['factory', 'headquarters', 'mine'], statuses: ['operating'],
    f: [[0, 0, 139.7, 35.6, 'JPN', 0, 0, 'A Tokyo plant'], [0, 1, 139.8, 35.7, 'JPN', 0, 0, 'A HQ'], [1, 2, -70.6, -23.6, 'CHL', 1, 0, 'B mine'], [1, 0, 179.5, -16.5, 'FJI', 0, 0, 'B Fiji']] };
  const groupOf = (ty) => ({ factory: 'factory', headquarters: 'hq', mine: 'factory' }[ty] || 'other');
  const rows = expand(fp, groupOf, (id) => ({ n: id.toUpperCase(), sec: id === 'a' ? 'auto' : 'mining' }));
  assert.equal(rows[2].precision, 'city');
  const jp = tally(select(rows, { cc: 'jpn' }));
  assert.equal(jp.sites, 2); assert.equal(jp.companies[0].name, 'A'); assert.deepEqual(jp.companies[0].groups, { factory: 1, hq: 1 });
  assert.equal(tally(select(rows, { groups: ['factory'] })).sites, 3);
  assert.equal(tally(select(rows, { sectors: ['mining'] })).companies[0].id, 'b');
  assert.ok(inBox(179.5, -16.5, [170, -30, 190, 0]), 'a box running past +180 holds Fiji');
  assert.ok(inBox(-179.5, -16.5, [170, -30, 190, 0]), '…and the far side of the date line');
  assert.ok(!inBox(139.7, 35.6, [170, -30, 190, 0]));
  assert.deepEqual(tally(select(rows, { box: [170, -30, 190, 0] })).countries, [{ cc: 'FJI', n: 1 }]);
});

test('③ the footprint reaches the reader from the Companies tab, the kernel, the palette and Atlas', () => {
  assert.match(read('js/companies-ui.js'), /data-im-click="coFootprint"/);
  assert.match(read('js/inline-actions.js'), /coFootprint:.*company\.footprint/);
  assert.match(read('js/session-tabs.js'), /\['company\.footprint',[\s\S]*?\['Company sites map','企業の拠点の地図'\]\]/);
  assert.match(read('js/lazy-modules.js'), /companyFootprint: \{ publishes: 'IntMapCompanyFootprint'/);
  assert.match(read('js/atlas-capabilities.js'), /\["data\.companySites","companySites"/);
  assert.match(read('scripts/companies-audit.mjs'), /footprintDrift\(DIR\)/);
  assert.match(read('scripts/companies/build.mjs'), /writeFootprint\(OUT_DIR\)/);
});
