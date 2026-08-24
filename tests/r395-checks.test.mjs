/* ============================================================================
 *  #R395 — the volcano card's VALUES, in nine languages
 * ----------------------------------------------------------------------------
 *  「火山レイヤーを引き続き進めて。また、クリックしたら出てくるカードの情報が翻訳されていない。」
 *
 *  Every LABEL in js/volcano-intel.js was translated into all nine languages and every VALUE beside
 *  it was English: 「火山の型 Stratovolcano」「構造区分 Subduction zone / Continental crust (> 25 km)」.
 *  `npm run check:i18n` printed 100 % and was right to — it measures how full the tables are, and an
 *  upstream value that reaches the DOM is not a call site, so it was in no instrument's denominator.
 *
 *  ⚠⚠⚠ THE POINT OF ① AND ② IS THAT THEY DERIVE THEIR REQUIREMENT FROM THE SHIPPED DATA. A table a
 *  human maintains cannot say what it is missing (#R335), so these read data/volcanoes_gvp.json and
 *  data/volcano-detail.json.gz, enumerate every value the card can print, and demand a row for each.
 *  A Smithsonian catalog revision that introduces a 28th volcano type therefore fails the build
 *  instead of quietly printing English to eight of the nine languages.
 *
 *  What a failure here means, in order of severity:
 *    · ①/②/③ a value the card prints with no translation = English inside a Japanese sentence, and
 *      no other gate in this repo can see it
 *    · ④ prose being translated, or a translated classification being left raw = the card either
 *      claims an observatory said something it did not, or drops back to English for no reason
 *    · ⑤ rung ① losing the monitored feed = 65 volcanoes USGS publishes GREEN/NORMAL for are told
 *      to the reader as «nobody publishes anything», which is the one sentence this file forbids
 *    · ⑥ a second copy of the hazard names = the legend and the popup disagree again
 *    · ⑦/⑧ the narrowing or the clock losing the halo condition / the absence test
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { readLF } = await import('../scripts/eol.mjs');
const { codeOnly } = await import('../scripts/code-only.mjs');

const LAYER = JSON.parse(readFileSync(join(ROOT, 'data', 'volcanoes_gvp.json'), 'utf8'));
const DETAIL = JSON.parse(gunzipSync(readFileSync(join(ROOT, 'data', 'volcano-detail.json.gz'))).toString('utf8'));
const INTEL = readLF(join(ROOT, 'js', 'volcano-intel.js'));
const LAYERS = readLF(join(ROOT, 'js', 'volcano-layers.js'));
const BETA = readLF(join(ROOT, 'js', 'beta-overlays.js'));
const INTEL_CODE = codeOnly(INTEL);

/* the vocabulary the card can print, taken FROM THE DATA rather than from a list kept here */
const uniq = (a) => [...new Set(a.filter((x) => x != null && x !== ''))];
const REQUIRED = {
  type: uniq(LAYER.features.map((f) => f.properties.t)),
  rock: LAYER.rocks.slice(),
  setting: LAYER.settings.slice(),
  landform: DETAIL.vocab.landform.slice(),
  epoch: DETAIL.vocab.epoch.slice(),
  evidenceCat: DETAIL.vocab.evidenceCat.slice(),
  evidence: DETAIL.vocab.evidence.slice(),
  region: uniq(LAYER.features.map((f) => f.properties.r)),
  subregion: uniq(Object.values(DETAIL.volcanoes).map((v) => v.sub)),
};

/* the VOCAB literal, read as source: one `'<English>':LA(…)` row per term, inside a named group */
function vocabGroups() {
  const start = INTEL.indexOf('const VOCAB={');
  assert.ok(start > 0, 'js/volcano-intel.js no longer declares VOCAB');
  const body = INTEL.slice(start, INTEL.indexOf('\n  };', start));
  const groups = {};
  let cur = null;
  for (const line of body.split('\n')) {
    const g = /^ {4}([A-Za-z]+):\{\s*$/.exec(line);
    if (g) { cur = g[1]; groups[cur] = new Map(); continue; }
    if (!cur) continue;
    const r = /^ {6}'((?:[^'\\]|\\.)*)':LA\((.*)\),\s*$/.exec(line);
    if (r) groups[cur].set(r[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\'), r[2]);
  }
  return groups;
}
const GROUPS = vocabGroups();

/* ── ① every value the card can print has a row, and the requirement comes from the data ── */
test('① the controlled vocabularies cover every value the shipped catalog contains', () => {
  for (const [group, terms] of Object.entries(REQUIRED)) {
    const have = GROUPS[group];
    assert.ok(have, `js/volcano-intel.js has no VOCAB.${group} group`);
    assert.ok(terms.length > 0, `no ${group} values in the shipped data — the check would be vacuous`);
    const missing = terms.filter((t) => !have.has(t));
    assert.equal(missing.length, 0,
      `VOCAB.${group} is missing ${missing.length} of ${terms.length} value(s) the catalog actually contains — ` +
      `the card prints them raw, in English, to all nine languages: ${missing.slice(0, 6).join(' | ')}`);
  }
});

/* ── ② every row carries five inline languages; a four-argument row silently falls to English ── */
test('② every vocabulary row carries all five inline languages', () => {
  let rows = 0;
  for (const [group, m] of Object.entries(GROUPS)) {
    for (const [term, args] of m) {
      rows++;
      /* the args are five quoted strings; counting commas would miscount a term containing one */
      const quoted = args.match(/'(?:[^'\\]|\\.)*'/g) || [];
      assert.equal(quoted.length, 5,
        `VOCAB.${group}['${term}'] has ${quoted.length} arguments, not 5 — a missing positional slot falls back to English for that language`);
      assert.ok(quoted.every((q) => q.length > 2), `VOCAB.${group}['${term}'] has an empty translation`);
    }
  }
  assert.ok(rows > 200, `only ${rows} vocabulary rows — the table has shrunk`);
});

/* ── ③ the other four languages: every term is a key in each locale's inline table ── */
test('③ fr / ko / zh-Hant / zh-Hans have a row for every vocabulary term', () => {
  const files = { fr: 'ui.fr.js', ko: 'ui.ko.js', 'zh-Hant': 'ui.zh.js', 'zh-Hans': 'ui.zh-hans.js' };
  const text = {};
  for (const [code, f] of Object.entries(files)) text[code] = readLF(join(ROOT, 'js', 'locales', f));
  const terms = [];
  for (const m of Object.values(GROUPS)) for (const t of m.keys()) terms.push(t);
  assert.ok(terms.length > 200, 'the vocabulary table is unexpectedly small');
  for (const [code, s] of Object.entries(text)) {
    const missing = terms.filter((t) => s.indexOf(JSON.stringify(t) + ':') < 0);
    assert.equal(missing.length, 0,
      `js/locales/${files[code]} has no translation for ${missing.length} vocabulary term(s) — they ship in English: ${missing.slice(0, 6).join(' | ')}`);
  }
});

/* ── ④ the values go through the vocabulary, and the prose does not ── */
test('④ the card resolves classifications through term()/countryName() and marks prose instead', () => {
  /* the nine rows of the «The volcano» tab, as they are written in the source */
  for (const call of ["term('type',p.t)", "term('landform'", "term('setting'", "term('rock'",
    "term('region',p.r)", "term('subregion'", 'countryName(p.c)', "term('epoch'", "term('evidenceCat'"]) {
    assert.ok(INTEL_CODE.includes(call), `the card no longer resolves ${call} — that value prints raw`);
  }
  /* ⚠ the three paragraphs an institution WROTE are shown, not translated, and say which language */
  assert.ok(/prose\(d\.g,'en'\)/.test(INTEL_CODE), 'the geological summary must go through prose(), which names the language it was published in');
  assert.ok(/prose\(w\.text,'en'\)/.test(INTEL_CODE), 'the weekly narrative must go through prose()');
  assert.ok(INTEL_CODE.includes("proseNote('en')"), 'the VONA synopses must carry the same provenance line');
  /* and they are NOT in the dictionary: a machine translation of a volcano observatory's prose is
     exactly what this round decided not to ship */
  const dict = JSON.parse(readFileSync(join(ROOT, 'scripts', 'i18n', 'r395-a.json'), 'utf8'));
  const summaries = Object.values(DETAIL.volcanoes).map((v) => v.g).filter(Boolean);
  assert.ok(summaries.length > 1000, 'the geological summaries are missing from the bundle');
  assert.ok(!(summaries[0] in dict), 'a geological summary has been put into the translation dictionary');
});

/* ── ⑤ rung ① reads the MONITORED set, not only the elevated one ── */
test('⑤ the United States rung reads every volcano USGS monitors, not only the elevated ones', () => {
  assert.ok(INTEL_CODE.includes('volcano/getMonitoredVolcanoes'),
    'js/volcano-intel.js no longer reads getMonitoredVolcanoes — 65 volcanoes USGS publishes GREEN/NORMAL for fall back to «nobody publishes anything»');
  assert.ok(/warm\(\)\{[\s\S]{0,120}'usgsMon'/.test(INTEL_CODE), 'the monitored feed is not warmed with the others');
  assert.ok(/FEEDS\.usgsMon\.rows\|\|\[\]\)\) add/.test(INTEL_CODE.replace(/\s+/g, ' ')) || INTEL_CODE.includes('for(const r of (FEEDS.usgsMon.rows||[])) add(+r.vnum,status(+r.vnum));'),
    'statusIndex() does not include the monitored set, so the map cannot colour «an observatory says normal» differently from «nothing published»');
  assert.ok(INTEL_CODE.includes('function usgsMonitors('), 'the monitored/unmonitored distinction has no accessor');
});

/* ── ⑥ the five USGS hazard classes have exactly ONE implementation ── */
test('⑥ the hazard-class names live in js/volcano-layers.js and nowhere else', () => {
  assert.ok(codeOnly(LAYERS).includes('const HAZ_NAME={'), 'js/volcano-layers.js no longer owns the hazard names');
  assert.ok(codeOnly(LAYERS).includes('hazardName'), 'the hazard-name resolver is gone');
  assert.ok(INTEL_CODE.includes('IntMapVolcanoLayers.hazardName('),
    'js/volcano-intel.js must ask js/volcano-layers.js rather than keeping a second copy — that is how the legend and the popup came to disagree');
  assert.ok(!/'Ash \(2 in\. or greater\)'\s*:/.test(INTEL_CODE), 'a second copy of the hazard names has appeared in js/volcano-intel.js');
});

/* ── ⑦ the narrowing ANDs with the halo's own condition instead of replacing it ── */
test('⑦ a reader filter narrows which volcanoes are drawn without changing what the ring means', () => {
  const B = codeOnly(BETA);
  assert.ok(B.includes('const HALO_BASE='), 'the halo condition is no longer a named constant');
  assert.ok(/setFilter\('volc2-halo',\['all',HALO_BASE\]\.concat\(t\)\)/.test(B.replace(/\s+/g, '')) ||
    B.includes("GE().layers.setFilter('volc2-halo',['all',HALO_BASE].concat(t));"),
    'the halo filter must AND the reader filter onto its own condition, not replace it');
  for (const k of ['spoken', 'elevated', 'big', 'recent']) {
    assert.ok(B.includes(k + ':false'), `the ${k} filter is missing from VOLC_FILTERS`);
  }
  /* ⚠ «somebody publishes a level» is the ABSENCE test — the property is missing, not zero */
  assert.ok(B.includes("t.push(['has','st'])"), 'the «somebody publishes a level» filter must test for the presence of st, not for a value');
});

/* ── ⑧ the clock mode reads the bundled record and does not paint a blank end year for ever ── */
test('⑧ the eruption record on the master clock closes an open-ended eruption at its start year', () => {
  const B = codeOnly(BETA);
  assert.ok(B.includes('function volcTimeIndex('), 'the clock index is gone');
  assert.ok(B.includes('r[4]==null?r[1]:r[4]'),
    'an eruption with no recorded end must count for its start year alone — GVP leaves the end blank both for «still going» and for «not recorded»');
  assert.ok(B.includes('r[9]!==1'), 'the clock index must use confirmed eruptions only');
  assert.ok(B.includes("window.IntMapTime.on("), 'the volcano layer does not follow the master clock');
  /* the index is built from the SAME bundled file the card uses — no second fetch, no second truth */
  assert.ok(B.includes('window.IntMapVolcano.detail()'), 'the clock index must come from the bundled eruption record');
});

/* ── ⑨ the two new Atlas capabilities exist in all three lists at once ── */
test('⑨ Atlas can reach the volcano subsystem, and every list that must agree does', () => {
  const CAPS = codeOnly(readLF(join(ROOT, 'js', 'atlas-capabilities.js')));
  const CONSOLE = codeOnly(readLF(join(ROOT, 'js', 'atlas-console.js')));
  const CATALOG = readLF(join(ROOT, 'js', 'atlas-catalog-text.js'));
  /* the dispatch groups, read the way scripts/atlas-capability-audit.mjs reads them: a line that
     STARTS with eight spaces and `case '`, carrying every spelling on it. ⚠ Both capabilities share
     one line here — js/atlas-console.js's ceiling only ever comes down (#R199 5,300, #R318 5,270)
     and it was full, so the answers moved to js/atlas-controls.js and the switch kept one label. */
  const groups = CONSOLE.split('\n').filter((l) => /^ {8}case '/.test(l))
    .map((l) => [...l.matchAll(/case '([A-Za-z_][\w]*)'\s*:/g)].map((m) => m[1]));
  const spellings = new Set(groups.flat());
  for (const [id, legacy] of [['data.volcano', 'volcano'], ['map.volcanoFilter', 'volcanoFilter']]) {
    assert.ok(CAPS.includes(`'${id}'`), `the capability registry has no row for ${id}`);
    assert.ok(spellings.has(legacy),
      `no dispatch case line carries '${legacy}' — the capability audit finds a capability unrunnable when its legacy type has no case`);
    assert.ok(CATALOG.includes(`'${id}'`), `the planner is never told about ${id}`);
    assert.ok(CATALOG.includes(`"type":"${legacy}"`), `the catalogue does not show the planner how to emit ${legacy}`);
  }
  /* …and the body really is out of the switch, where the ceiling forced it */
  assert.ok(codeOnly(readLF(join(ROOT, 'js', 'atlas-controls.js'))).includes('async function doVolcano('),
    'the volcano answers must live in js/atlas-controls.js — js/atlas-console.js has no room for them');
  assert.ok(CONSOLE.includes('doVolcano(a)'), 'the dispatch no longer reaches the volcano answers');
  /* the kernel commands the dispatch reaches for */
  for (const cmd of ['volcano.open', 'volcano.filter', 'volcano.time', 'volcano.mode']) {
    assert.ok(codeOnly(BETA).includes(`OS.register('${cmd}'`), `${cmd} is not registered`);
  }
});

/* ── ⑩ the Simplified file carries mainland vocabulary, not converted Taiwanese vocabulary ── */
test('⑩ the Simplified locale does not ship Taiwan-only wording for the new geography', () => {
  /* ⚠ BOTH generated Simplified files, because scripts/zh-hans.mjs derives both and a word can live
     in either — 俯冲板块 is in the reading pages' Slab2 sentence and nowhere in the UI table. Reading
     only one of them is how a term ships wrong in the file nobody checked. */
  const hans = readLF(join(ROOT, 'js', 'locales', 'ui.zh-hans.js'))
    + '\n' + readLF(join(ROOT, 'js', 'locales', 'pages.zh-hans.js'));
  /* left column: what character conversion alone would have produced. #R319/#R335's shape — the
     characters are already shared, so no orthography check can see the difference. */
  /* ⚠ (#R395 追記) THE LAST TWO CAME FROM PRODUCTION, not from the inventory: OpenCC's vocabulary
     profile does not carry these geology terms, so the twp→cn sweep passed them and the shipped
     Simplified chunk said 隐没带 / 分裂径迹 to a mainland reader. The inventory is a floor. */
  const PAIRS = [['索马利亚', '索马里'], ['维德角', '佛得角'], ['肯亚', '肯尼亚'], ['葛摩', '科摩罗'],
    ['万那杜', '瓦努阿图'], ['安地斯', '安第斯'], ['加拉巴哥', '加拉帕戈斯'], ['克马得', '克马德克'],
    ['民答那峨', '棉兰老'], ['皮特康', '皮特凯恩'], ['加里波底', '加里波第'], ['安地列斯', '安的列斯'],
    ['二氧化矽', '二氧化硅'], ['隐没带', '俯冲带'], ['隐没板块', '俯冲板块'],
    ['分裂径迹', '裂变径迹']];
  for (const [taiwan, mainland] of PAIRS) {
    assert.ok(hans.includes(mainland), `the generated Simplified files have lost «${mainland}» — scripts/zh-hans.mjs WORDS row missing?`);
    assert.ok(!hans.includes(taiwan), `a generated Simplified file still ships the Taiwan wording «${taiwan}»; the mainland word is «${mainland}»`);
  }
});

/* ── ⑪ an inline KEY is an identity, so the generator must not convert it ── */
test('⑪ the Simplified generator leaves inline keys byte-identical, whatever they are written in', () => {
  /* ⚠ #R231 lifted keys out of the character conversion but matched an indent of exactly four
     spaces — the `ui` table's. The `inline` table is indented by two, so no inline key was ever
     protected; it was invisible only because every inline key was ASCII. JMA publishes its warnings
     in Japanese and the key IS what the agency said, so 「レベル２（火口周辺規制）」 came out as
     「…火口周辺规制）」 — a key no call site can ever produce. */
  const keysOf = (f) => [...readLF(join(ROOT, 'js', 'locales', f))
    .matchAll(/\n\s{2,}("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')\s*:/g)].map((m) => m[1]);
  const hant = keysOf('ui.zh.js'), hans = keysOf('ui.zh-hans.js');
  assert.equal(hans.length, hant.length, 'the two Chinese locales no longer hold the same number of keys');
  const drift = hant.map((k, i) => [k, hans[i]]).filter(([a, b]) => a !== b);
  assert.equal(drift.length, 0,
    `${drift.length} key(s) were rewritten by the Simplified generator, so they identify nothing: ` +
    drift.slice(0, 4).map(([a, b]) => a + ' → ' + b).join(' | '));
  /* and the check is not vacuous: some of those keys really do contain Han characters */
  assert.ok(hant.filter((k) => /[㐀-鿿]/.test(k)).length >= 4, 'no inline key contains Han characters — ⑪ would pass without testing anything');
});
