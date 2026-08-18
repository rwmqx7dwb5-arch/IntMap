/* ============================================================================
 *  IntMap · RELIGION AND LANGUAGE, from a real source instead of a hand table   (#R266)
 * ----------------------------------------------------------------------------
 *  「宗教分布レイヤーはカトリック、プロテスタント、正教会を区別しろ。」
 *  「言語分布レイヤーはもっと正確に。表示言語数も増やして。」
 *
 *  What those two layers WERE: two literal lists of ISO codes typed into js/layer-packs.js — six
 *  religion buckets (with all of Christianity as one) and sixteen languages, with no share, no
 *  source and no way to be wrong about a country without a human noticing. Poland and Russia and
 *  Sweden were the same colour.
 *
 *  What they are now: the CIA World Factbook's own «Religions» and «Languages» fields, which are a
 *  US Government work and therefore public domain, parsed into a share per group per country. The
 *  Factbook states them as census/estimate percentages with the year, so the map can say WHICH
 *  denomination leads AND by how much, and the tap can print the whole composition.
 *
 *    node scripts/build-culture.mjs      → data/religion.json, data/language.json
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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = 'https://raw.githubusercontent.com/factbook/factbook.json/master/';
const API = 'https://api.github.com/repos/factbook/factbook.json/contents/';
const REGIONS = ['africa', 'australia-oceania', 'central-america-n-caribbean', 'central-asia',
  'east-n-southeast-asia', 'europe', 'middle-east', 'north-america', 'south-america', 'south-asia'];
const NE = 'https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_110m_admin_0_countries.geojson';

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

/* ── language: the canonical code a Factbook label maps to ────────────────────────────────────── */
const LANG = [
  [/^english|anglo/i, 'en'], [/^spanish|castilian|castellano/i, 'es'], [/^french/i, 'fr'],
  [/^portuguese/i, 'pt'], [/^arabic|modern standard arabic|msa/i, 'ar'], [/^russian/i, 'ru'],
  [/^german|schwyzerdutsch|swiss german/i, 'de'], [/^mandarin|chinese|cantonese|yue|wu \(|min nan|hakka/i, 'zh'],
  [/^hindi/i, 'hi'], [/^bengali|bangla/i, 'bn'], [/^japanese/i, 'ja'], [/^korean/i, 'ko'],
  [/^italian/i, 'it'], [/^turkish/i, 'tr'], [/^persian|farsi|dari|tajik/i, 'fa'],
  [/^indonesian|bahasa indonesia/i, 'id'], [/^malay|bahasa malaysia/i, 'ms'], [/^dutch|flemish/i, 'nl'],
  [/^urdu/i, 'ur'], [/^swahili|kiswahili/i, 'sw'], [/^vietnamese/i, 'vi'], [/^thai/i, 'th'],
  [/^polish/i, 'pl'], [/^ukrainian/i, 'uk'], [/^romanian|moldovan/i, 'ro'], [/^greek/i, 'el'],
  [/^czech/i, 'cs'], [/^hungarian|magyar/i, 'hu'], [/^swedish/i, 'sv'], [/^danish/i, 'da'],
  [/^norwegian|bokmal|nynorsk/i, 'no'], [/^finnish|suomi/i, 'fi'], [/^serbian|croatian|bosnian|montenegrin|serbo/i, 'sh'],
  [/^bulgarian/i, 'bg'], [/^slovak/i, 'sk'], [/^slovene|slovenian/i, 'sl'], [/^albanian|shqip/i, 'sq'],
  [/^lithuanian/i, 'lt'], [/^latvian/i, 'lv'], [/^estonian/i, 'et'], [/^hebrew/i, 'he'],
  [/^amharic/i, 'am'], [/^somali/i, 'so'], [/^hausa/i, 'ha'], [/^yoruba/i, 'yo'], [/^igbo/i, 'ig'],
  [/^zulu|isizulu/i, 'zu'], [/^afrikaans/i, 'af'], [/^tagalog|filipino/i, 'tl'], [/^burmese|myanmar/i, 'my'],
  [/^khmer|cambodian/i, 'km'], [/^lao/i, 'lo'], [/^nepali/i, 'ne'], [/^sinhala/i, 'si'], [/^tamil/i, 'ta'],
  [/^pashto|pushtu/i, 'ps'], [/^uzbek/i, 'uz'], [/^kazakh/i, 'kk'], [/^azerbaijani|azeri/i, 'az'],
  [/^armenian/i, 'hy'], [/^georgian/i, 'ka'], [/^mongolian/i, 'mn'], [/^icelandic/i, 'is'],
  [/^irish|gaelic/i, 'ga'], [/^catalan/i, 'ca'], [/^basque/i, 'eu'], [/^maltese/i, 'mt'],
  [/^macedonian/i, 'mk'], [/^belarus/i, 'be'], [/^kyrgyz/i, 'ky'], [/^turkmen/i, 'tk'],
  [/^malagasy/i, 'mg'], [/^kinyarwanda|kirundi/i, 'rw'], [/^chichewa|nyanja/i, 'ny'],
  [/^shona/i, 'sn'], [/^tswana|setswana/i, 'tn'], [/^sesotho|sotho/i, 'st'], [/^wolof/i, 'wo'],
  [/^fula|fulani|pular|peul/i, 'ff'], [/^bambara/i, 'bm'], [/^akan|twi|fante/i, 'ak'],
  [/^tigrinya/i, 'ti'], [/^oromo/i, 'om'], [/^quechua/i, 'qu'], [/^guarani/i, 'gn'],
  [/^aymara/i, 'ay'], [/^haitian creole|creole/i, 'ht'], [/^papiamento/i, 'pap'],
  [/^tetum/i, 'tet'], [/^dzongkha/i, 'dz'], [/^tibetan/i, 'bo'], [/^kurdish/i, 'ku'],
  [/^samoan/i, 'sm'], [/^tongan/i, 'to'], [/^fijian/i, 'fj'], [/^maori/i, 'mi'],
  [/^tok pisin|melanesian pidgin/i, 'tpi'], [/^bislama/i, 'bi'], [/^hiri motu/i, 'ho'],
  [/^marshallese/i, 'mh'], [/^palauan/i, 'pau'], [/^chamorro/i, 'ch'], [/^nauruan/i, 'na'],
  [/^kiribati|gilbertese/i, 'gil'], [/^tuvaluan/i, 'tvl'], [/^niuean/i, 'niu'], [/^cook islands maori/i, 'rar'],
  [/^greenlandic|kalaallisut/i, 'kl'], [/^faroese/i, 'fo'], [/^luxembourgish/i, 'lb'],
  [/^romansh/i, 'rm'], [/^frisian/i, 'fy'], [/^welsh/i, 'cy'], [/^breton/i, 'br'],
  [/^creole|krio|pidgin/i, 'crp'],
];

const NAME_FIX = {
  'burma': 'Myanmar', 'korea, south': 'South Korea', 'korea, north': 'North Korea',
  'czechia': 'Czechia', 'holy see (vatican city)': 'Vatican',
  'congo, democratic republic of the': 'Dem. Rep. Congo', 'congo, republic of the': 'Congo',
  'cabo verde': 'Cabo Verde', 'timor-leste': 'Timor-Leste', 'eswatini': 'eSwatini',
  'cote d’ivoire': "Côte d'Ivoire", "cote d'ivoire": "Côte d'Ivoire",
  'gambia, the': 'Gambia', 'bahamas, the': 'Bahamas', 'micronesia, federated states of': 'Micronesia',
  'bosnia and herzegovina': 'Bosnia and Herz.', 'central african republic': 'Central African Rep.',
  'dominican republic': 'Dominican Rep.', 'equatorial guinea': 'Eq. Guinea',
  'south sudan': 'S. Sudan', 'solomon islands': 'Solomon Is.', 'united states': 'United States of America',
  'burma ': 'Myanmar', 'macau': 'Macao', 'turkey (turkiye)': 'Turkey', 'turkey (türkiye)': 'Turkey',
  'north macedonia': 'North Macedonia', 'western sahara': 'W. Sahara',
};
/* the Factbook ships HTML entities in names («C&ocirc;te d'Ivoire»), and its «conventional short
   form» is literally the string «none» for a handful of states — both silently cost a country its
   polygon, so both are handled before the match rather than appearing as a mystery in the miss list */
const ENT = { ocirc: 'ô', eacute: 'é', egrave: 'è', agrave: 'à', ccedil: 'ç', uuml: 'ü', ouml: 'ö',
  auml: 'ä', ntilde: 'ñ', aacute: 'á', iacute: 'í', oacute: 'ó', uacute: 'ú', amp: '&', apos: "'", quot: '"' };
const deent = (s) => String(s || '').replace(/&([a-z]+);/gi, (m, k) => (ENT[k.toLowerCase()] || m));
const norm = (s) => deent(s).toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
/* ⚠ Natural Earth 110 m carries ~177 polygons; the map draws 10 m, which has every one of these.
   Rather than pull 25 MB of geometry into a build that only needs NAMES, the states 110 m leaves
   out are named here — each one is a real ISO country the layer must be able to colour. */
const ALIAS = { 'drc': 'COD', 'comoros': 'COM', 'cabo verde': 'CPV', 'cote divoire': 'CIV',
  'mauritius': 'MUS', 'seychelles': 'SYC', 'sao tome and principe': 'STP', 'singapore': 'SGP',
  'andorra': 'AND', 'estonia': 'EST', 'kosovo': 'XKX', 'liechtenstein': 'LIE', 'monaco': 'MCO',
  'malta': 'MLT', 'san marino': 'SMR', 'holy see': 'VAT', 'bahrain': 'BHR', 'maldives': 'MDV',
  'micronesia federated states of': 'FSM', 'the dominican': 'DOM', 'cook islands': 'COK',
  'kiribati': 'KIR', 'niue': 'NIU', 'nauru': 'NRU', 'palau': 'PLW', 'marshall islands': 'MHL',
  'tonga': 'TON', 'tuvalu': 'TUV', 'samoa': 'WSM', 'antigua and barbuda': 'ATG', 'barbados': 'BRB',
  'dominica': 'DMA', 'grenada': 'GRD', 'saint kitts and nevis': 'KNA', 'saint lucia': 'LCA',
  'saint vincent and the grenadines': 'VCT', 'hong kong': 'HKG', 'macau': 'MAC', 'macao': 'MAC' };

async function j(u) { const r = await fetch(u, { headers: { 'user-agent': 'IntMap build-culture' } }); if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); }

/* «Roman Catholic 70.7%», «Russian Orthodox 15-20%», «Christian 80.8% (overwhelmingly Roman
   Catholic …)» → [name, percent, parenthetical]. Three things the first version of this parser got
   wrong, each of which SILENTLY dropped a country rather than failing:
     · a RANGE («15-20%») matched nothing at all, so Russia's Orthodox majority vanished and the
       layer coloured it by «other Christian 2%» — the only line in its entry with a bare number;
     · the PARENTHETICAL was stripped before matching, so Italy's «Christian 80.8% (overwhelmingly
       Roman Catholic …)» became a generic Christian rather than the Catholic country it is;
     · an entry with NO percentage at all (Saudi Arabia's «Muslim (official …)») produced nothing.
   Ranges are taken at their midpoint, the parenthetical is carried through, and the no-percentage
   case is handled by the caller — which records the leading group WITHOUT inventing a share. */
function pairs(text) {
  const t = deent(String(text || '')).replace(/<[^>]*>/g, ' ');
  const out = [];
  /* ⚠ MORE THAN ONE PARENTHETICAL CAN SIT BETWEEN THE NAME AND THE NUMBER — «German (or Swiss
     German) (official) 62.1%» — and a single optional group silently loses that entry (Switzerland
     came out French-speaking). `(?:\([^)]*\)\s*)*` takes them all; the FIRST one is kept for the
     denomination override below. */
  const re = /([A-Za-z][A-Za-z'’\-.À-ɏ ]{2,60}?)\s*((?:\([^)]*\)\s*)*)(?:only\s+)?(\d+(?:\.\d+)?)(?:\s*[-–]\s*(\d+(?:\.\d+)?))?\s*%\s*(?:\(([^)]*)\))?/g;
  let m;
  while ((m = re.exec(t))) {
    const nm = m[1].replace(/^(?:and|or|other|including|incl\.?|less than \d+ percent:?)\s+/i, '').replace(/[,;]\s*$/, '').trim();
    const lo = parseFloat(m[3]), hi = m[4] ? parseFloat(m[4]) : null;
    const v = hi == null ? lo : (lo + hi) / 2;
    if (nm && isFinite(v) && !/^\d{4}$/.test(nm)) out.push([nm, v, (m[5] || m[2] || '')]);
  }
  return out;
}
/* the year in «(2015 est.)» is not a group, and neither is a stray «est» */
const REALNAME = (nm) => !/^(est|note|approx|about|around|roughly)$/i.test(nm.trim());
const bucket = (nm, table, dflt) => { for (const [re, k] of table) if (re.test(nm)) return k; return dflt; };

const ne = await j(NE);
const byName = new Map();
for (const f of ne.features) {
  const p = f.properties;
  const iso = p.ISO_A3_EH || p.ISO_A3 || p.ADM0_A3;
  if (!iso || iso === '-99') continue;
  for (const k of [p.NAME, p.NAME_LONG, p.NAME_EN, p.ADMIN, p.BRK_NAME, p.FORMAL_EN]) if (k) byName.set(norm(k), iso);
}
console.log('natural earth names', byName.size);

const files = [];
for (const r of REGIONS) {
  const list = await j(API + r);
  for (const f of list) if (f.name.endsWith('.json')) files.push(r + '/' + f.name);
}
console.log('factbook country files', files.length);

const religion = {}, language = {}, missed = [];
for (const f of files) {
  let d; try { d = await j(RAW + f); } catch (e) { console.log('skip', f, e.message); continue; }
  const gov = d.Government || {};
  const cn = (gov['Country name'] || {});
  let short = deent((cn['conventional short form'] || {}).text || '').trim();
  if (!short || /^none$/i.test(short)) short = deent((cn['conventional long form'] || {}).text || '').trim();
  if (!short || /^none$/i.test(short)) short = deent((cn['etymology'] || {}).text || '').split(/[,;.]/)[0];
  let iso = byName.get(norm(short)) || byName.get(norm(NAME_FIX[norm(short)] || '')) || ALIAS[norm(short)];
  if (!iso) { missed.push(short || f); continue; }
  const ps = d['People and Society'] || {};
  const rt = (ps.Religions || {}).text || '';
  const lt = ((ps.Languages || {}).Languages || {}).text || (ps.Languages || {}).text || '';

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
    if (rank.length) religion[iso] = { top: rank[0][0], pct: Math.round(rank[0][1] * 10) / 10, mix: g, src: rt.slice(0, 400) };
  } else if (rt) {
    /* no share published — record the leading group and NO number, the way the language branch does */
    const first = (rt.split(/[,;(]/)[0] || '').trim();
    const k = bucket(first, REL, null);
    if (k && k !== 'unspecified') religion[iso] = { top: k, pct: null, mix: {}, src: rt.slice(0, 400) };
  }
  const lp = pairs(lt).filter(([nm]) => REALNAME(nm));
  if (lp.length) {
    const g = {}; for (const [nm, v] of lp) { const k = bucket(nm, LANG, null); if (k) g[k] = (g[k] || 0) + v; }
    const rank = Object.entries(g).sort((a, b) => b[1] - a[1]);
    if (rank.length) language[iso] = { top: rank[0][0], pct: Math.round(rank[0][1] * 10) / 10, mix: g, src: lt.slice(0, 400) };
  } else if (lt) {
    /* no percentages given — the Factbook often lists the official language(s) only. The FIRST one
       named is the dominant one, and it is recorded WITHOUT a share so nothing is invented. */
    const first = (lt.split(/[,;(]/)[0] || '').trim();
    const k = bucket(first, LANG, null);
    if (k) language[iso] = { top: k, pct: null, mix: {}, src: lt.slice(0, 400) };
  }
  process.stdout.write('.');
}
console.log('\nreligion', Object.keys(religion).length, 'language', Object.keys(language).length);
if (missed.length) console.log('unmatched names (' + missed.length + '):', missed.join(' | '));

const stamp = { source: 'CIA World Factbook — «Religions» / «Languages» field (US Government work, public domain)',
  url: 'https://www.cia.gov/the-world-factbook/', via: 'https://github.com/factbook/factbook.json',
  built: new Date().toISOString().slice(0, 10) };
fs.writeFileSync(path.join(ROOT, 'data', 'religion.json'), JSON.stringify({ ...stamp, countries: religion }));
fs.writeFileSync(path.join(ROOT, 'data', 'language.json'), JSON.stringify({ ...stamp, countries: language }));
console.log('wrote data/religion.json', fs.statSync(path.join(ROOT, 'data', 'religion.json')).size);
console.log('wrote data/language.json', fs.statSync(path.join(ROOT, 'data', 'language.json')).size);
