/* ============================================================================
 *  IntMap · #R695 — the provinces, in a language the reader has
 * ----------------------------------------------------------------------------
 *  data/hist-admin2.js shipped 22,708 units and 20,357 of them had no `name:<lang>` at all: the map
 *  was not blank (upstream's local `name` was there) but a Japanese reader travelling to 1900 got
 *  the neighbours of 東京府 in Polish, Arabic and Thai, and 0.5 % of the tier in Japanese. Upstream
 *  was not silent about them — 17,120 carried a `wikidata` tag — and the build never read it.
 *
 *  What is measured here, and why each is measured this way:
 *    · the RULE that decides whether an item may name a unit, by EVALUATION (#R505) — a rule that
 *      cannot be run cannot be shown to refuse anything, and the whole risk of this join is that
 *      one item is claimed by seven units and only some of them are it;
 *    · the SCRIPT question for `name:zh`, against the real converter, because the alternative was a
 *      guess about 1,807 strings that no assertion anywhere would have contradicted;
 *    · the SHIPPED BUNDLES, for the two properties that hold whatever upstream does — every name
 *      column is one a reader can actually be served, and no language the build does not fill is
 *      better covered than one it does. The numeric budget is the gate's (`check:histadmin`); it is
 *      deliberately not restated here, because one fact with two homes is #R500's defect.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as OpenCC from 'opencc-js';
import { itemVerdicts, fillNames, chineseTags, missingByTag, REFUSE } from '../scripts/histadmin/names.mjs';
import { registry, harvestTags, shipTags, harvestWikidataCodes, codeForTag } from '../scripts/histadmin/langs.mjs';
import { labelsByTag } from '../scripts/histadmin/wikidata.mjs';
import { plainLabel } from '../scripts/histeras/match.mjs';
import { appLangs } from '../scripts/histnames/langs.mjs';

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

test('① one item, two units that call themselves different things — nobody gets the label', () => {
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

test('② the SAME unit at ten dates is still that unit — a shared item that agrees is usable', () => {
  /* Provinz Brandenburg is ten records because its borders moved ten times, and all ten are
     Q700264. Refusing every shared item would throw away 19,917 of the units this round is for. */
  const rows = [];
  for (let i = 0; i < 10; i++) rows.push({ qid: 'Q700264', name: 'Provinz Brandenburg' });
  const v = itemVerdicts(rows);
  assert.equal(v.get('Q700264').ok, true);
  assert.equal(v.get('Q700264').count, 10);
});

test('③ a lone claimant is usable; a group with nothing to agree on is not', () => {
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

test('④ filling only ever fills an EMPTY column, and never a disambiguated label', () => {
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

test('⑤ `name:zh` is asked which script it is, not assumed to be Traditional', () => {
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

test('⑥ every name column in the shipped bundles is one a reader can actually be served', () => {
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

test('⑦ no language the build does not fill is better covered than one it does', () => {
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

test('⑧ narrowing what SHIPS does not narrow what is harvested or cached', () => {
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

test('⑨ a label is chosen by the app\'s own reading of «which Chinese is bare `zh`»', () => {
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

test('⑩ the units this round set out to make readable are readable', () => {
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
