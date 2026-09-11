/* ============================================================================
 *  IntMap · #R700 — «Ceylon (Dutch)» is two questions, and only one was ever asked
 * ----------------------------------------------------------------------------
 *  The era cartographer writes a polity AND its possessor in one string. Measured on the shipped
 *  bundle: 314 of data/hist-eras.js's 3,028 spellings are of that shape and they carry 372 drawn
 *  features. Every lane of data/histnames.json is keyed by the WHOLE string, so a row that
 *  already said what «Rome» is in Japanese could not be reached from the feature called
 *  «Rome (Diocletianus)», and the reader of the deepest half of the map read English.
 *
 *  ⚠⚠⚠ AND THE OBVIOUS FIX IS THE WRONG ONE. data/cshapes.js writes a trailing bracket the reader
 *  NEVER SEES — `_csName` strips «(Malagasy)» before it labels anything — so
 *  scripts/histnames/records.mjs asks about the stripped spelling, and that is right FOR THAT
 *  RECORD. The era snapshots mean the opposite thing by the same punctuation: js/time-borders.js
 *  has since #R110 localized the two halves separately and put the bracket back, so what is drawn
 *  is 「アルジェリア（フランス）」 and never 「アルジェリア」. A census that simply dropped the
 *  bracket here would look up a spelling nobody is ever shown — the cshapes rule pointing the
 *  wrong way. So the decomposition is PUBLISHED by the file that decides what the reader sees
 *  (`window.IntMapEraName`) and both sides read it from there.
 *
 *  ⚠ EVERYTHING BELOW IS MEASURED BY EVALUATING js/time-borders.js (#R505), never by reading it,
 *  and nothing pins a spelling (#R488): the subjects are the record's own 3,028 strings and the
 *  shipped table's own rows, so a name added upstream is measured the day it arrives.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { census, eraBundle, eraBaseCensus, eraNameRule } from '../scripts/histeras/census.mjs';
import { timeBorders } from '../scripts/histeras/time-borders.mjs';
import { commonWords, isProse } from '../scripts/histnames/prose.mjs';
import { CACHE } from '../scripts/histeras/harvest.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TABLE = JSON.parse(readFileSync(join(ROOT, 'data', 'histnames.json'), 'utf8'));
const ROWS = census(eraBundle(ROOT));
const GLOSSED = ROWS.filter((r) => eraNameRule().split(r.name));

/* ⚠ THE MODULE'S OWN LOADER IS RUN, NOT BYPASSED. `hnFor` answers out of `_hn`, which is module
   state filled by `hnLoad()` from `fetch('data/histnames.json')` — and the node harness stubs
   `fetch` to throw, precisely so that no gate ever reaches the network. Handing the module a
   `fetch` that resolves with the SHIPPED BYTES is the only way to measure the lane the reader
   actually gets: a test that poked a table into module state would be measuring its own poke.
   The one global is defined INSIDE the vm context — `api.eraLocName` was created there, so its
   `.constructor` is that context's `Function` — because the harness owns the sandbox and this
   file may not reach into it. */
async function live(lang) {
  const { api } = timeBorders({ lang });
  api.eraLocName.constructor('j',
    'fetch=function(){return Promise.resolve({ok:true,json:function(){return Promise.resolve(j);}});}')(TABLE);
  await api.loadHistNames();
  assert.ok(api.histNames() && api.histNames().byName, 'the shipped table did not reach the module');
  return api;
}

test('① the published rule DECOMPOSES a glossed era name — it does not strip the bracket', () => {
  const R = eraNameRule();
  assert.ok(GLOSSED.length > 100, 'the record draws ' + GLOSSED.length + ' glossed names; #R700 measured 314');
  for (const r of GLOSSED) {
    const p = R.split(r.name);
    /* both halves are non-empty and neither swallowed the other */
    assert.ok(p.base && p.gloss, r.name + ' split away one of its halves');
    /* ⚠ THE RULE IS ITS OWN INVERSE. Joining the two halves back in English must reproduce the
       upstream's string — that is what says the split is a decomposition and not a truncation,
       and it is measured on all 314 rather than on a spelling typed in here.
       ⚠ WHITESPACE IS THE ONE THING THE ROUND TRIP MAY MOVE, because the halves are trimmed and
       some upstream strings are not («Nahua ( Morelos, Puebla, …)»). A label is not allowed to
       carry the cartographer's stray space into nine languages, so the comparison ignores it —
       and ignoring it costs nothing here: a rule that dropped the gloss would fail anyway. */
    assert.equal(R.join(p.base, p.gloss, 'en').replace(/\s/g, ''), r.name.replace(/\s/g, ''),
      r.name + ' does not survive its own rule');
  }
});

test('② the join owns the punctuation, per language', () => {
  const R = eraNameRule();
  const jp = R.join('X', 'Y', 'jp'), en = R.join('X', 'Y', 'en');
  assert.ok(jp.includes('Y') && en.includes('Y'), 'the possessor left the label');
  assert.ok(jp.startsWith('X') && en.startsWith('X'), 'the base left the front of the label');
  assert.notEqual(jp, en, 'Japanese brackets are full-width — the label carried Latin ones');
  assert.ok(/[（）]/.test(jp), 'the Japanese label did not use full-width brackets');
});

test('③ the hand tables still put the possessor back — a localized base alone is not the label', () => {
  /* #R110's behaviour, measured through the published rule rather than through its regex.
     ⚠⚠ NOT EVERY LOCALIZED GLOSSED NAME GOES THROUGH THE BRACKET BRANCH, and pretending otherwise
     would make this check measure the wrong thing. `_eraLocName` asks its tables about the WHOLE
     string first, and some of them claim it: «Cyraneica (UK Lybia)» is 「キレナイカ」 and
     «Ethiopia (Italy)» is 「エチオピア（エリトリア含む）」 — hand-written judgements about one name
     each, both older than this round. «Arabia (Nejd)» comes back 「ナジュド（アラビア）」, the
     halves the other way round, because Nejd is what the shape is and Arabia is where it stands.
     ⇒ SO THE COMPOSED ONES ARE IDENTIFIED BY WHAT COMPOSITION LEAVES BEHIND — a label that is
     the localized base AND MORE — and the check is that there are still plenty of them and that
     every one of them says something the base did not. A rule that dropped the bracket makes that
     population EMPTY, which is the failure this exists to produce. */
  const R = eraNameRule();
  const api = timeBorders({ lang: 'jp' }).api;
  let seen = 0, composed = 0;
  for (const r of GLOSSED) {
    const label = api.eraLocName(r.name);
    if (!label) continue;
    seen++;
    const p = R.split(r.name);
    const base = api.eraLocName(p.base) || p.base;
    if (!label.startsWith(base) || label === base) continue;   /* answered whole, not composed */
    composed++;
    const tail = label.slice(base.length);
    assert.ok(/^[\s（(].*[）)]$/.test(tail),
      r.name + ' → «' + label + '»: the possessor is not in a bracket of its own');
    assert.ok(tail.replace(/[\s（）()]/g, '').length > 0,
      r.name + ' → «' + label + '»: the bracket was put back empty');
  }
  assert.ok(seen > 20, 'only ' + seen + ' glossed names localize at all — the hand-table branch is unreachable');
  assert.ok(composed > 20, 'only ' + composed + ' of ' + seen
    + ' localized glossed labels are the base AND MORE — the possessor stopped being put back');
});

test('④ the table answers a glossed name out of its BASE row, possessor put back', async () => {
  const R = eraNameRule();
  for (const lang of ['jp', 'de']) {
    const api = await live(lang);
    let viaBase = 0;
    for (const r of GLOSSED) {
      if (api.histNameFor('eras', r.name, null, null)) continue;      /* the whole string has its own row */
      const g = api.histNameForGloss(r.name);
      if (!g || !g[lang]) continue;
      viaBase++;
      const p = R.split(r.name);
      /* ⚠ THE BASE IS READ THROUGH BOTH LANES, BECAUSE THAT IS WHAT THE IMPLEMENTATION DOES.
         This check first asked only the era lane — written when that was the only lane a base
         could come from — and the base lane's own harvest produced the counter-example the hour
         it landed: «Hispaniola» is a base the record never draws on its own, so its row is in
         `eraBase` and the era lane has nothing. A check that names ONE lane is a check about a
         call site, not about the name (#R429). */
      const base = api.histNameFor('eraBase', p.base, null, null) || api.histNameFor('eras', p.base, null, null);
      assert.ok(base && base[lang], r.name + ': answered without a base row to answer from');
      assert.equal(g.en, r.name, r.name + ': the tuple forgot the upstream\'s own string');
      assert.ok(g[lang].startsWith(base[lang]), r.name + ' → «' + g[lang] + '» does not begin with the base row');
      assert.ok(g[lang].length > base[lang].length,
        r.name + ' → «' + g[lang] + '» is the base alone; the possessor was not put back');
    }
    if (lang === 'jp') assert.ok(viaBase > 0, 'not one glossed name reaches the table through its base');
  }
});

test('⑤ the whole string always wins, and a description is never given a possessor', async () => {
  const api = await live('jp');
  for (const r of GLOSSED) {
    const whole = api.histNameFor('eras', r.name, null, null);
    /* ⚠ A NAME WITH A ROW OF ITS OWN MUST NOT BE OVERTAKEN BY ITS BASE'S — that would be one name
       with two answers (#R536), and the base's is the weaker evidence of the two. */
    if (whole) assert.ok(!api.histNameFor('eras', eraNameRule().split(r.name).base, null, null)
      || api.histNameFor('eras', r.name, null, null) === whole, r.name + ': the base overtook its own row');
    /* the prose lane translates a SENTENCE about unnamed ground (#R682); appending a possessor to
       it would author a claim no source makes */
    const g = api.histNameForGloss(r.name);
    if (g) assert.ok(!g._d, r.name + ': a description was given a possessor');
  }
  for (const k of Object.keys(TABLE.prose)) {
    const g = api.histNameForGloss(k);
    assert.equal(g, null, '"' + k + '" is prose and was composed as a glossed name');
  }
});

test('⑥ the base lane is a SEPARATE namespace — the era store still decides what prose is', () => {
  /* ⚠⚠⚠ THIS IS THE CHECK THAT KEEPS 101 ROWS ALIVE. `isProse(name, hasItem, common)` is asked
     «does Wikidata carry an item for this string?» out of the ERA candidate store, and the era
     store is the set of names the record DRAWS. Fold the base names into it — either by adding
     base rows to `census()` or by harvesting them under the same cache keys — and a description
     that happens to be the base of a glossed name flips to «has an item»: its row leaves
     data/histnames.json without a word, and `checkShipped` measures by the same definition, so
     nothing says so. The two questions are stored apart, and here that is measured. */
  const base = eraBaseCensus(ROWS);
  const drawn = new Set(ROWS.map((r) => r.name));
  assert.ok(base.length > 100, 'the base lane asks about ' + base.length + ' names; #R700 measured 236');
  for (const b of base) {
    assert.ok(!drawn.has(b.name), '"' + b.name + '" is drawn in its own right — it is not a base question');
    assert.ok(b.glossed.length > 0, '"' + b.name + '" came from no glossed name');
    for (const g of b.glossed) assert.ok(drawn.has(g), '"' + g + '" is not a name the record draws');
    /* the boxes and years are the glossed feature's — that is the whole safeguard (#R515) */
    assert.ok(b.boxes.length > 0 && isFinite(b.y0) && isFinite(b.y1), '"' + b.name + '" carries no where or when');
  }
  const baseNames = new Set(base.map((b) => b.name));
  const common = commonWords(ROWS.map((r) => r.name));
  for (const k of Object.keys(TABLE.prose)) {
    assert.ok(!baseNames.has(k), '"' + k + '" is shipped as prose and is also a base question');
    assert.equal(isProse(k, false, common), true, '"' + k + '" no longer classifies as the upstream\'s prose');
  }
  /* and where the harvest cache exists, the era store really does hold no base names */
  const CAND = join(CACHE, 'candidates.json');
  if (existsSync(CAND)) {
    const store = JSON.parse(readFileSync(CAND, 'utf8'));
    for (const b of base) assert.ok(!(b.name in store.byName),
      '"' + b.name + '" is a base question and its candidates were written into the era store');
    for (const k of Object.keys(TABLE.prose)) assert.equal((store.byName[k] || []).length, 0,
      '"' + k + '" is shipped as prose and the era store now carries an item for it');
  }
});

test('⑦ the shipped lanes never answer one name twice', () => {
  const lanes = TABLE.byName;
  const eraBase = lanes.eraBase || {};
  for (const k of Object.keys(eraBase)) {
    assert.ok(!(k in lanes.eras), '"' + k + '" is in both the era lane and the base lane');
    assert.ok(!(k in TABLE.prose), '"' + k + '" is in both the base lane and the prose lane');
  }
  const baseNames = new Set(eraBaseCensus(ROWS).map((b) => b.name));
  for (const k of Object.keys(eraBase)) assert.ok(baseNames.has(k),
    '"' + k + '" is in the base lane and no glossed era name asks about it');
});
