/* ============================================================================
 *  IntMap · building the historical subdivision bundles — names in the reader's language, dates at
 *  their stated precision, and topology refreshed without moving a vertex
 *  (scripts/build-hist-admin1.mjs · scripts/histadmin/*)
 *  (consolidated from tests/r695-histadmin-names, r705-chronos-admin-build and
 *   r712-historical-topology-build; each test keeps its round tag)
 * ----------------------------------------------------------------------------
 *  #R695 — data/hist-admin2.js shipped 22,708 units and 20,357 had no `name:<lang>`: a Japanese reader
 *  travelling to 1900 got the neighbours of 東京府 in Polish, Arabic and Thai. 17,120 carried a
 *  `wikidata` tag the build never read. Measured here: the RULE that decides whether an item may name
 *  a unit (one item is claimed by seven units and only some of them are it), the SCRIPT of a bare
 *  `name:zh` against the real converter, and two properties of the SHIPPED bundles. The numeric
 *  budget is the gate's (`check:histadmin`), deliberately not restated (#R500).
 *  #R705 — OHM end dates are exclusive at their stated precision; impossible dates are refused, not
 *  normalised; and ⚠⚠⚠ (#R730) an unknown start produces NO bound — the previous build's display bound
 *  (-199-01-01) had put 48 ritsuryō provinces in 200 BC and 壱岐国 · 安房国 on the map in 1900.
 *  #R712 — a topology refresh restores an explicit outer ring without changing one vertex or identity
 *  field, and refuses what it cannot reproduce.
 *  ⚠ Everything here RUNS the builder's own functions — imported, or lifted by its own text where the
 *  function is not exported.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs, { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as OpenCC from 'opencc-js';
import { itemVerdicts, fillNames, chineseTags, missingByTag, REFUSE } from '../scripts/histadmin/names.mjs';
import { registry, harvestTags, shipTags, harvestWikidataCodes, codeForTag } from '../scripts/histadmin/langs.mjs';
import { labelsByTag } from '../scripts/histadmin/wikidata.mjs';
import { plainLabel } from '../scripts/histeras/match.mjs';
import { appLangs } from '../scripts/histnames/langs.mjs';
import { detailPolys, refreshTopology, topologyErrors } from '../scripts/build-hist-admin1.mjs';
import { geometryOf } from '../scripts/histborders/precision.mjs';

/* ══ #R695 — the provinces, in a language the reader has ══════════════════════════════════════ */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REG = registry(ROOT);
const toSimp = OpenCC.Converter({ from: 'tw', to: 'cn' });
const toTrad = OpenCC.Converter({ from: 'cn', to: 'tw' });

/** the committed tiers, discovered the way the gate discovers them — never a pair of filenames */
function bundles() {
  const out = [];
  for (const n of [1, 2, 3, 4]) {
    const file = join(ROOT, 'data', 'hist-admin' + n + '.js');
    let src;
    try { src = readFileSync(file, 'utf8'); } catch (_) { continue; }
    const w = {};
    new Function('window', src)(w);
    out.push({ n, d: w['__HISTADM' + n] });
  }
  return out;
}
const TIERS = bundles();

test('#R695 ① one item, two units that call themselves different things — nobody gets the label', () => {
  /* Q724 is Maine. The units claiming it include «Devonshire County» and «Massachusetts Claim»,
     which are not Maine; distributing Wikidata's label to them would name a unit nobody named. */
  const v = itemVerdicts([
    { qid: 'Q724', name: 'Maine' },
    { qid: 'Q724', name: 'Maine' },
    { qid: 'Q724', name: 'Devonshire County' },
  ]);
  assert.equal(v.get('Q724').ok, false);
  assert.equal(v.get('Q724').why, REFUSE.BORROWED);
  assert.equal(v.get('Q724').count, 3);
});

test('#R695 ② the SAME unit at ten dates is still that unit — a shared item that agrees is usable', () => {
  /* Provinz Brandenburg is ten records because its borders moved ten times, and all ten are
     Q700264. Refusing every shared item would throw away 19,917 of the units this round is for. */
  const rows = [];
  for (let i = 0; i < 10; i++) rows.push({ qid: 'Q700264', name: 'Provinz Brandenburg' });
  const v = itemVerdicts(rows);
  assert.equal(v.get('Q700264').ok, true);
  assert.equal(v.get('Q700264').count, 10);
});

test('#R695 ③ a lone claimant is usable; a group with nothing to agree on is not', () => {
  const v = itemVerdicts([
    { qid: 'Q1', name: 'Alone' },
    { qid: 'Q2', name: '' }, { qid: 'Q2', name: '   ' },
    { qid: 'not-a-qid', name: 'x' },
  ]);
  assert.equal(v.get('Q1').ok, true);
  assert.equal(v.get('Q2').ok, false);
  assert.equal(v.get('Q2').why, REFUSE.ANONYMOUS);
  assert.equal(v.has('not-a-qid'), false, 'a wikidata tag that is not an item id is not an item');
});

test('#R695 ④ filling only ever fills an EMPTY column, and never a disambiguated label', () => {
  const names = { en: 'Hohenzollernsche Lande', ja: '' };
  const added = fillNames(names, { en: 'Hohenzollern', ja: 'ホーエンツォレルン領邦' }, plainLabel);
  assert.equal(names.en, 'Hohenzollernsche Lande', 'upstream said it — Wikidata does not overrule it');
  assert.equal(names.ja, 'ホーエンツォレルン領邦');
  assert.deepEqual(added, ['ja']);
  /* ⚠ WHICH languages are offered is decided ONE step earlier, by labelsByTag against the policy
     module — so a narrowed policy narrows what is filled, and this function needs no opinion. */
  const narrowed = labelsByTag({ en: 'Hohenzollern', de: 'Hohenzollern', ja: 'ホーエンツォレルン領邦' },
    shipTags(ROOT, REG), REG);
  const only = {};
  fillNames(only, narrowed, plainLabel);
  assert.equal(only.de, undefined, 'a language the policy does not ship is not added');

  const brackets = {};
  fillNames(brackets, { en: 'Montana (New Jersey)', ja: 'モンタナ (曖昧さ回避)' }, plainLabel);
  assert.deepEqual(brackets, {}, 'a label Wikidata had to disambiguate is not a map label');
});

test('#R695 ⑤ `name:zh` is asked which script it is, not assumed to be Traditional', () => {
  /* Upstream writes a bare `name:zh` on 1,807 relations and the build dropped every one. Filing
     them all under zh-Hant — which is how the app resolves a bare `zh` — would have handed 691 of
     them to the wrong reader. These four are upstream's own values. */
  assert.deepEqual(chineseTags('施泰爾馬克州', toSimp, toTrad), ['zh-Hant']);
  assert.deepEqual(chineseTags('缅因州', toSimp, toTrad), ['zh-Hans']);
  assert.deepEqual(chineseTags('廣州府', toSimp, toTrad), ['zh-Hant']);
  assert.deepEqual(chineseTags('钟路区', toSimp, toTrad), ['zh-Hans']);
  /* written the same way in both scripts — correct for both readers, so withheld from neither */
  assert.deepEqual(chineseTags('四川省', toSimp, toTrad).sort(), ['zh-Hans', 'zh-Hant']);
  assert.deepEqual(chineseTags('', toSimp, toTrad), []);
});

test('#R695 ⑥ every name column in the shipped bundles is one a reader can actually be served', () => {
  /* The bundle keys names by js/lang-registry.js\'s `html` tag, which is what js/time-admin1.js
     resolves the reader\'s language through. A column under any other key — a bare `zh`, say — is
     bytes shipped to nobody, and nothing else in the record would notice it. */
  const alphabet = new Set(harvestTags(ROOT, REG));
  for (const t of TIERS) {
    const seen = new Set();
    for (const f of t.d.feats) for (const k of Object.keys(f[9] || {})) seen.add(k);
    for (const k of seen) {
      assert.ok(alphabet.has(k), 'data/hist-admin' + t.n + '.js holds names under `' + k + '`, which no reader resolves to');
      const code = codeForTag(k, REG);
      assert.equal(REG.htmlTag(code), k, '`' + k + '` must round-trip through the app\'s own language row');
    }
  }
});

test('#R695 ⑦ no language the build does not fill is better covered than one it does', () => {
  /* A PROPERTY, NOT A COUNT. The shipped set is scripts/histnames/langs.mjs and can be widened in
     one edit; whatever it holds, those are the languages this build ADDS names in, so a language
     nobody fills standing ahead of one that ships means the name stage never ran over these bytes —
     which is exactly what a stale bundle looks like and what no count of its own would ever say. */
  const ship = shipTags(ROOT, REG);
  const rest = harvestTags(ROOT, REG).filter((t) => !ship.includes(t));
  const feats = TIERS.flatMap((t) => t.d.feats);
  assert.ok(feats.length > 0);
  const shipped = missingByTag(feats, ship), others = missingByTag(feats, rest);
  const worst = ship.reduce((a, b) => (shipped[a].missing >= shipped[b].missing ? a : b));
  for (const tag of rest)
    assert.ok(others[tag].missing >= shipped[worst].missing,
      '`' + tag + '` is better covered than the shipped `' + worst + '` — run `node scripts/build-hist-admin1.mjs --names`');
});

test('#R695 ⑧ narrowing what SHIPS does not narrow what is harvested or cached', () => {
  /* The policy module promises that restoring the nine is one edit. That is only true if the
     harvest and the Wikidata cache were nine-wide all along — a cache built to the narrow set would
     make that edit re-download everything, and a reader would wait a round for it. */
  const app = appLangs(ROOT);
  assert.deepEqual(harvestTags(ROOT, REG).sort(), app.map((c) => REG.htmlTag(c)).sort(),
    'the harvest reads every language the app has');
  const wd = harvestWikidataCodes(ROOT);
  for (const c of app) {
    const tag = REG.htmlTag(c);
    assert.ok(wd.some((w) => w === tag || w === tag.toLowerCase() || w.startsWith(tag.toLowerCase().slice(0, 2))),
      'the wikidata harvest asks for ' + c);
  }
  const ship = shipTags(ROOT, REG);
  assert.ok(ship.length >= 1 && ship.length <= app.length);
  for (const t of ship) assert.ok(harvestTags(ROOT, REG).includes(t), 'a shipped language must be a harvested one');
});

test('#R695 ⑨ a label is chosen by the app\'s own reading of «which Chinese is bare `zh`»', () => {
  /* Wikidata\'s bare `zh` is Simplified while IntMap\'s `zh` is Traditional (#R686 wrote that down
     once, in scripts/histeras/match.mjs). Getting it backwards serves every Chinese reader the
     other script with nothing anywhere to say so, so this pipeline asks that same table. */
  const byTag = labelsByTag({ zh: '四川', 'zh-hant': '四川省', ja: '四川省', en: 'Sichuan' },
    ['zh-Hant', 'zh-Hans', 'ja', 'en'], REG);
  assert.equal(byTag['zh-Hant'], '四川省', 'Traditional comes from zh-hant, not from bare zh');
  assert.equal(byTag['zh-Hans'], '四川', 'bare zh is the Simplified side');
  assert.equal(byTag.ja, '四川省');
  assert.equal(byTag.en, 'Sichuan');
  assert.deepEqual(labelsByTag({}, ['en'], REG), {}, 'an item with no labels contributes nothing');
});

test('#R695 ⑩ the units this round set out to make readable are readable', () => {
  /* The one end-to-end assertion, and it is about the DEEP tier, because that is where the defect
     was: 0.5 % of it carried a Japanese name. The threshold is not a measurement of upstream — it
     is the claim js/time-admin1.js makes to a travelling reader, that the layer it just switched on
     is a layer they can read. Half is the weakest form of that claim that still means something. */
  const deep = TIERS.find((t) => t.n === 2);
  assert.ok(deep, 'data/hist-admin2.js is the tier the reader zooms into');
  for (const tag of shipTags(ROOT, REG)) {
    const m = missingByTag(deep.d.feats, [tag])[tag];
    assert.ok(m.pct < 50, tag + ': ' + m.missing + ' of ' + m.total + ' second-tier units cannot be read ('
      + m.pct.toFixed(1) + ' %)');
  }
});

/* ══ #R705 — dates at their stated precision ══════════════════════════════════════════════ */
/* the builder's date arithmetic, LIFTED from its own text (it sits between `dateInfo` and the
   Douglas–Peucker section) and run in a context holding nothing but Date */
const source = fs.readFileSync(new URL('../scripts/build-hist-admin1.mjs', import.meta.url), 'utf8');
const start = source.indexOf('function dateInfo(');
const end = source.indexOf('/* ── Douglas', start);
const ctx = vm.createContext({ Date });
vm.runInContext(source.slice(start, end), ctx);
const parse = (raw, edge = 'end') => JSON.parse(JSON.stringify(ctx.edtf(raw, edge)));
test('#R705 OHM end dates are exclusive at their stated precision', () => {
  assert.deepEqual(parse('1871-05-04'), [1871, 5, 4]);
  assert.deepEqual(parse('1871-05'), [1871, 6, 1]);
  assert.deepEqual(parse('1871'), [1872, 1, 1]);
  assert.deepEqual(parse('-0500'), [-499, 1, 1]);
  assert.deepEqual(parse('0099-12'), [100, 1, 1]);
  assert.deepEqual(parse('0000-02'), [0, 3, 1]);
});
test('#R705 calendar validation does not normalize impossible source dates', () => {
  for (const raw of ['1900-02-29', '0001-02-29', '2020-04-31', '2020-00', '2020-13', '2020-01-00']) assert.equal(parse(raw), null, raw);
  assert.deepEqual(parse('0000-02-29', 'start'), [0, 2, 29]);
  assert.deepEqual(parse('2000-02-29', 'start'), [2000, 2, 29]);
  assert.deepEqual(parse('-0400-02-29', 'start'), [-400, 2, 29]);
});
test('#R705 source precision and uncertainty survive normalization', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.dateInfo('1871~'))), { raw: '1871~', precision: 'year', qualified: true });
  assert.equal(ctx.dateInfo(null).precision, 'unknown');
});
test('#R705 a rebuild retains the stored coordinate precision', () => {
  const from = source.indexOf('function coordinateDecimals(');
  const to = source.indexOf('const DECIMALS', from);
  vm.runInContext(source.slice(from, to), ctx);
  assert.equal(ctx.coordinateDecimals({ rings: [[[1.1234, 2.01]]] }), 4);
  assert.equal(ctx.coordinateDecimals({ decimals: 5, rings: [[[1, 2]]] }), 5);
  assert.equal(ctx.coordinateDecimals(undefined), 4); // new bundles use the same precision as refreshed ones
});
test('#R705 equal explicit days retain one day and carry the normalization reason', () => {
  const span = ctx.dateSpan('1861-01-09', '1861-01-09');
  assert.equal(span.valid, true);
  assert.deepEqual(JSON.parse(JSON.stringify(span.e)), [1861, 1, 10]);
  assert.equal(span.metadata.normalization, 'single-day');
  assert.equal(span.metadata.end.raw, '1861-01-09');
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.dateSpan('0000-02-29', '0000-02-29').e)), [0, 3, 1]);
});
test('#R705 contradictory periods cannot become one-day records', () => {
  for (const pair of [['1930', '1929'], ['1930-01-02', '1930-01-01'], ['1930-01-01', '1929']]) {
    const span = ctx.dateSpan(...pair);
    assert.equal(span.valid, false);
    assert.equal(span.metadata.normalization, undefined);
  }
  const invalid = ctx.dateSpan('1900-02-29', '1900-02-29');
  assert.equal(invalid.metadata.normalization, undefined);
  assert.equal(invalid.valid, false);
});

test('#R705 qualified or imprecisely formatted dates are not certified as a single day', () => {
  for (const raw of ['1930-01-01?', '1930-01-01~', '1930-1-1']) {
    const span = ctx.dateSpan(raw, raw);
    assert.equal(span.metadata.normalization, undefined);
    assert.equal(span.valid, false);
  }
});
/* ══ ⚠⚠⚠ (#R730) THIS TEST USED TO REQUIRE THE DEFECT ══════════════════════════════════════════
   It asserted that `boundedStart` returns the PREVIOUS build's published bound for a row upstream
   never dated, and that the row is marked `preserved-display-bound`. Measured 2026-09-15, that
   bound was -199-01-01 — the clock floor from before #R679 widened it — and 68 shipped rows were
   drawn from it: 48 ritsuryō provinces and the circuits of the 五畿七道 in 200 BC, 壱岐国 and
   安房国 still on the map in 1900 and today, the Shanghai concessions from before there was a
   Shanghai. The assertion below is the same one, turned around: a start nobody stated produces
   NOTHING here, and scripts/histadmin/class-dates.mjs derives a bound from the unit's own system
   or the row is not shipped. [[intmap-restate-the-defect-not-the-fix]] */
test('#R705 an unknown start produces no bound at all — nothing here invents one', () => {
  const previous = ['unit', 4, -199, 1, 1, 1900, 1, 1, [[0]], { en: 'unit', ja: '地方' }, 1];
  const snapshot = JSON.stringify(previous);
  const span = ctx.dateSpan(null, '1900');
  assert.equal(ctx.boundedStart(span, previous), null, "the previous build's display bound came back");
  assert.equal(span.metadata.start.raw, null);
  assert.equal(span.metadata.start.precision, 'unknown');
  assert.equal(span.metadata.start.boundary, undefined, 'the row was marked with a bound nobody stated');
  assert.equal(JSON.stringify(previous), snapshot, 'names, geometry and the original row remain intact');
  assert.equal(ctx.boundedStart(ctx.dateSpan(null, '1900'), null), null, 'unknown starts need source resolution');
});
test('#R705 a sourced BCE start is used as stated, and carries no boundary mark', () => {
  const span = ctx.dateSpan('-0500', '-0400');
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.boundedStart(span, ['unit', 4, -199, 1, 1]))), [-500, 1, 1]);
  assert.equal(span.metadata.start.boundary, undefined);
});

/* ══ #R712 — topology refreshed without moving a vertex ════════════════════════════════════ */
const shell = [[0, 0], [8, 0], [8, 8], [0, 8], [0, 0]];
const island = [[2, 2], [3, 2], [3, 3], [2, 3], [2, 2]];
const relation = { type: 'relation', id: 42, members: [shell, island].map(r => ({
  type: 'way', role: 'outer', geometry: r.map(([lon, lat]) => ({ lon, lat }))
})) };
// Published fixture: the former parser classified an explicit outer as a hole.
const baseline = { ringsOf: () => [shell, island], polysOf: rings => [rings] };
const bundle = () => ({ tolerance: 0, decimals: 4, src: 'fixture', dates: { 42: { source: 'exact' } },
  rings: [shell, island], feats: [['name', 4, 1800, 1, 1, 1900, 1, 1, [[0, 1]], { ja: '名前' }, 42]] });

test('#R712 topology refresh restores explicit outer without changing one vertex or identity field', () => {
  const before = bundle(), snapshot = JSON.stringify(before);
  const { data, stats } = refreshTopology(before, () => relation, baseline);
  assert.equal(stats.changed, 1);
  assert.equal(stats.unchangedVertices, 1);
  assert.equal(stats.retained, 0);
  assert.equal(data.rings, before.rings, 'pool and all coastline ring indices stay identical');
  assert.deepEqual(geometryOf(data, data.feats[0]), [[shell], [island]]);
  assert.deepEqual(data.feats[0].slice(0, 8), before.feats[0].slice(0, 8));
  assert.deepEqual(data.feats[0].slice(9), before.feats[0].slice(9));
  assert.deepEqual(data.dates, before.dates);
  assert.equal(JSON.stringify(before), snapshot, 'input is not mutated');
});

test('#R712 unreproducible corrected geometry and missing/wrong sources retain published shapes', () => {
  const before = bundle(); before.rings[1] = island.map(([x, y]) => [x + 0.25, y]);
  const corrected = refreshTopology(before, () => relation, baseline);
  assert.equal(corrected.stats.unreproducible, 1);
  assert.deepEqual(geometryOf(corrected.data, corrected.data.feats[0]), geometryOf(before, before.feats[0]));
  for (const source of [null, { ...relation, id: 43 }]) {
    const result = refreshTopology(bundle(), () => source, baseline);
    assert.equal(result.stats.unavailable, 1);
    assert.equal(result.stats.changed, 0);
  }
});

test('#R712 a different ring inventory cannot pass as a topology-only correction', () => {
  const source = { ...relation, members: relation.members.slice(0, 1) };
  const result = refreshTopology(bundle(), () => source, baseline);
  assert.equal(result.stats.changedVertices, 1);
  assert.equal(result.stats.retained, 1);
  assert.deepEqual(geometryOf(result.data, result.data.feats[0]), [[shell, island]]);
});

test('#R712 explicit source reassembly accepts matched geometry changes, repools, and is idempotent', () => {
  const source = { ...relation, members: relation.members.slice(0, 1) };
  const before = bundle();
  const result = refreshTopology(before, () => source, baseline, { reassembleSource: true });
  assert.equal(result.stats.reassembled, 1);
  assert.equal(result.stats.changed, 1);
  assert.equal(result.stats.retained, 0);
  assert.equal(result.stats.changedVertices, 0);
  assert.deepEqual(geometryOf(result.data, result.data.feats[0]), [[shell]]);
  assert.equal(result.data.rings.length, 1, 'unused rings are removed when the pool is rebuilt');
  assert.deepEqual(result.data.feats[0].slice(9), before.feats[0].slice(9));
  assert.deepEqual(result.data.dates, before.dates);
  const again = refreshTopology(result.data, () => source, baseline, { reassembleSource: true });
  assert.equal(again.stats.alreadyCurrent, 1);
  assert.equal(again.stats.changed, 0);
  assert.deepEqual(again.data, result.data);
});

test('#R712 reassembly still preserves corrections and refuses an empty source candidate', () => {
  const before = bundle(); before.rings[1] = island.map(([x, y]) => [x + 0.25, y]);
  const corrected = refreshTopology(before, () => relation, baseline, { reassembleSource: true });
  assert.equal(corrected.stats.unreproducible, 1);
  assert.deepEqual(geometryOf(corrected.data, corrected.data.feats[0]), geometryOf(before, before.feats[0]));
  const empty = refreshTopology(bundle(), () => ({ ...relation, members: [] }), baseline, { reassembleSource: true });
  assert.equal(empty.stats.empty, 1);
  assert.equal(empty.stats.retained, 1);
  assert.deepEqual(geometryOf(empty.data, empty.data.feats[0]), [[shell, island]]);
});

test('#R712 a collapsed shell never promotes its surviving interior to land', () => {
  const collapsed = [[0, 0], [0.00001, 0], [0, 0.00001], [0, 0]];
  assert.deepEqual(detailPolys(null, 0, 4, [[collapsed, island]]), []);
  assert.deepEqual(detailPolys(null, 0, 4, [[shell, collapsed]]), [[shell]]);
});

test('#R712 refresh requires an explicit baseline parser', () => {
  assert.throws(() => refreshTopology(bundle(), () => relation), /baseline parser/);
});

test('#R712 offline topology ledger gate rejects corrupt digests and inconsistent accounting', () => {
  const result = refreshTopology(bundle(), () => relation, baseline);
  const good = { ...result.data, topology: { ...result.stats, baselineParserSha256: 'a'.repeat(64), semantics: 'source-matched ring regrouping' } };
  assert.deepEqual(topologyErrors(good), []);
  assert.deepEqual(topologyErrors(bundle()), [], 'older bundles without a refresh ledger remain readable');
  for (const patch of [
    { baselineParserSha256: 'not-a-digest' },
    { changed: -1 }, { retained: 0.5 }, { matched: undefined },
    { matched: 2 }, { retained: 1 }, { unchangedVertices: 0 },
    { changed: 2 }, { semantics: '' }, { reassembled: 1 }, { alreadyCurrent: 2 }
  ]) assert.ok(topologyErrors({ ...good, topology: { ...good.topology, ...patch } }).length, JSON.stringify(patch));
  assert.ok(topologyErrors({ ...good, topology: null }).length);
  const rebuilt = refreshTopology(bundle(), () => ({ ...relation, members: relation.members.slice(0, 1) }), baseline, { reassembleSource: true });
  assert.deepEqual(topologyErrors({ ...rebuilt.data, topology: { ...good.topology, ...rebuilt.stats } }), []);
});
