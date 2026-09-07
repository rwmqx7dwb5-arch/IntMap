/* ============================================================================
 *  IntMap · RELIGION, from a real source instead of a hand table   (#R266)
 * ----------------------------------------------------------------------------
 *  「宗教分布レイヤーはカトリック、プロテスタント、正教会を区別しろ。」
 *  「言語分布レイヤーはもっと正確に。表示言語数も増やして。」
 *
 *  What those two layers WERE: two literal lists of ISO codes typed into js/layer-packs.js — six
 *  religion buckets (with all of Christianity as one) and sixteen languages, with no share, no
 *  source and no way to be wrong about a country without a human noticing. Poland and Russia and
 *  Sweden were the same colour.
 *
 *  What they are now: the CIA World Factbook's own «Religions» field, which is a US Government
 *  work and therefore public domain, parsed into a share per group per country. The Factbook states
 *  them as census/estimate percentages with the year, so the map can say WHICH denomination leads
 *  AND by how much, and the tap can print the whole composition.
 *
 *    node scripts/build-culture.mjs      → data/religion.json
 *
 *  ⚠ (#R538) LANGUAGE LEFT THIS FILE. The «Languages» field is now read by
 *  scripts/build-language.mjs, which resolves what it names to Glottocodes instead of to a hand
 *  table of 119 regular expressions — the table this build used silently dropped every language it
 *  did not recognise, so Burkina Faso shipped as Fula 7.8% with Mossi 52.9% missing, and every
 *  creole on earth shipped as Haitian. What the two builds share — the country-name crosswalk, the
 *  clause parser, the year — moved to scripts/lib/factbook.mjs so there is one copy of it rather
 *  than two that drift.
 *
 *  ⚠ THE COUNTRY KEY IS MATCHED BY NAME, ON PURPOSE. The Factbook files are named with GEC (FIPS
 *  10-4) codes, which are NOT ISO 3166 — «gm» is Germany there and Gambia in ISO. Rather than
 *  hand-copying a 250-row crosswalk (a table nobody would ever re-check), each file's own
 *  «conventional short form» is matched against Natural Earth's country names, which is the same
 *  collection the map is drawn from — so a country that fails to match is a country that would
 *  have no polygon to paint anyway, and the script prints every one of them.
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RAW, SOURCE_STAMP, j, useCache, countryFiles, isoIndex, isoOf, shortNameOf,
  pairs, REALNAME, yearOf, bucket } from './lib/factbook.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ── religion: the group a Factbook label belongs to. Ordered — first match wins. ─────────────── */
const REL = [
  [/orthodox|coptic|armenian apostolic|ethiopian orthodox|eritrean orthodox|greek catholic|syriac/i, 'orthodox'],
  [/roman catholic|^catholic|catholic church|maronite/i, 'catholic'],
  [/protestant|anglican|lutheran|evangelic|baptist|methodist|presbyterian|pentecostal|reformed|calvinis|adventist|congregational|moravian|dutch reformed|church of (england|scotland|sweden|norway|denmark|iceland|finland)/i, 'protestant'],
  [/christian|jehovah|latter-day saint|mormon|kimbanguist|nazarene|quaker|unification/i, 'christian_other'],
  [/muslim|islam|sunni|shia|shi'a|ibadi|alawite|ahmadi/i, 'muslim'],
  [/hindu/i, 'hindu'],
  [/buddhis/i, 'buddhist'],
  [/jewish|judaism/i, 'jewish'],
  [/shinto/i, 'shinto'],
  [/sikh/i, 'sikh'],
  [/folk|traditional|animis|indigenous|shaman|voodoo|vodoun|syncret|cao dai|hoa hao|confucian|taois|chinese religion|spiritis|candomble|rastafarian|baha'i|bahai|jain|zoroastrian|druze|yazidi/i, 'folk'],
  [/none|no religion|atheis|agnostic|unaffiliated|nonreligious|non-religious|irreligio|secular/i, 'unaffiliated'],
  [/unspecified|not stated|refused|no answer|do not know|don't know|other/i, 'unspecified'],
];

useCache(ROOT);
const byName = await isoIndex();
console.log('natural earth names', byName.size);

const files = await countryFiles();
console.log('factbook country files', files.length);

const religion = {}, missed = [];
for (const f of files) {
  let d; try { d = await j(RAW + f); } catch (e) { console.log('skip', f, e.message); continue; }
  const iso = isoOf(byName, shortNameOf(d));
  if (!iso) { missed.push(f); continue; }
  const ps = d['People and Society'] || {};
  const rt = (ps.Religions || {}).text || '';

  const rp = pairs(rt).filter(([nm]) => REALNAME(nm));
  if (rp.length) {
    const g = {};
    for (const [nm, v, par] of rp) {
      let k = bucket(nm, REL, null); if (!k) continue;   /* «citizens are 85-90%» is not a religion */
      /* «Christian 80.8% (overwhelmingly Roman Catholic …)» is a Catholic country, and the Factbook
         says so in the parenthetical rather than in the label */
      /* ⚠ ONLY WHEN THE PARENTHETICAL NAMES ONE TRADITION AS THE WHOLE. «Christian 80.8%
         (overwhelmingly Roman Catholic …)» is Italy being Catholic; «Christian (includes Anglican,
         Roman Catholic, Presbyterian, Methodist) 59.5%» is the United Kingdom being none of them in
         particular, and reading «Roman Catholic» out of that list made the UK a Catholic country.
         Where the Factbook does not separate the denominations, neither does this map. */
      if (k === 'christian_other' && /overwhelmingly|predominantly|mostly|mainly|primarily|largely|almost all/i.test(par)) {
        const k2 = bucket(par, REL, null); if (k2 && k2 !== 'christian_other') k = k2; }
      g[k] = (g[k] || 0) + v;
    }
    const rank = Object.entries(g).filter(([k]) => k !== 'unspecified').sort((a, b) => b[1] - a[1]);
    if (rank.length) religion[iso] = { top: rank[0][0], pct: Math.round(rank[0][1] * 10) / 10, mix: g, y: yearOf(rt), src: rt.slice(0, 400) };
  } else if (rt) {
    /* no share published — record the leading group and NO number */
    const first = (rt.split(/[,;(]/)[0] || '').trim();
    const k = bucket(first, REL, null);
    if (k && k !== 'unspecified') religion[iso] = { top: k, pct: null, mix: {}, y: yearOf(rt), src: rt.slice(0, 400) };
  }
  process.stdout.write('.');
}
console.log('\nreligion', Object.keys(religion).length);
if (missed.length) console.log('unmatched files (' + missed.length + ')');

const stamp = { ...SOURCE_STAMP, built: new Date().toISOString().slice(0, 10) };
fs.writeFileSync(path.join(ROOT, 'data', 'religion.json'), JSON.stringify({ ...stamp, countries: religion }));
console.log('wrote data/religion.json', fs.statSync(path.join(ROOT, 'data', 'religion.json')).size);
