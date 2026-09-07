/* ═══════════════════════════════════════════════════════════════════════════════════════════════
 *  IntMap · THE FACTBOOK READER — one copy, shared by every build that reads it   (#R538)
 *
 *  build-culture.mjs (religion) and build-language.mjs (language) both read the same free text out
 *  of the same CIA World Factbook country files, and both need the same four pieces of knowledge to
 *  do it: how the Factbook spells country names against Natural Earth, which states Natural Earth
 *  110 m leaves out, how a «name (parenthetical) 12.3%» clause is shaped, and where the year hides.
 *  Those lived in build-culture.mjs and were about to be copied into the second build — so they
 *  moved here instead. Two copies of a name table are two tables that drift.
 * ═══════════════════════════════════════════════════════════════════════════════════════════════ */

import fs from 'node:fs';
import path from 'node:path';

export const RAW = 'https://raw.githubusercontent.com/factbook/factbook.json/master/';
export const API = 'https://api.github.com/repos/factbook/factbook.json/contents/';
export const NE = 'https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_110m_admin_0_countries.geojson';
export const REGIONS = ['africa', 'australia-oceania', 'central-america-n-caribbean', 'central-asia',
  'east-n-southeast-asia', 'europe', 'middle-east', 'north-america', 'south-america', 'south-asia'];

export const SOURCE_STAMP = {
  source: 'CIA World Factbook — «Religions» / «Languages» field (US Government work, public domain)',
  url: 'https://www.cia.gov/the-world-factbook/',
  via: 'https://github.com/factbook/factbook.json',
};

/* the Factbook ships HTML entities in names («C&ocirc;te d'Ivoire»), and its «conventional short
   form» is literally the string «none» for a handful of states — both silently cost a country its
   polygon, so both are handled before the match rather than appearing as a mystery in the miss list */
const ENT = { ocirc: 'ô', eacute: 'é', egrave: 'è', agrave: 'à', ccedil: 'ç', uuml: 'ü', ouml: 'ö',
  auml: 'ä', ntilde: 'ñ', aacute: 'á', iacute: 'í', oacute: 'ó', uacute: 'ú', amp: '&', apos: "'",
  quot: '"', nbsp: ' ', lt: '<', gt: '>' };
export const deent = (s) => String(s || '').replace(/&([a-z]+);/gi, (m, k) => (ENT[k.toLowerCase()] || m));
export const norm = (s) => deent(s).toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();

export const NAME_FIX = {
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

/* ⚠ Natural Earth 110 m carries ~177 polygons; the map draws 10 m, which has every one of these.
   Rather than pull 25 MB of geometry into a build that only needs NAMES, the states 110 m leaves
   out are named here — each one is a real ISO country the layer must be able to colour. */
export const ALIAS = { 'drc': 'COD', 'comoros': 'COM', 'cabo verde': 'CPV', 'cote divoire': 'CIV',
  'mauritius': 'MUS', 'seychelles': 'SYC', 'sao tome and principe': 'STP', 'singapore': 'SGP',
  'andorra': 'AND', 'estonia': 'EST', 'kosovo': 'XKX', 'liechtenstein': 'LIE', 'monaco': 'MCO',
  'malta': 'MLT', 'san marino': 'SMR', 'holy see': 'VAT', 'bahrain': 'BHR', 'maldives': 'MDV',
  'micronesia federated states of': 'FSM', 'the dominican': 'DOM', 'cook islands': 'COK',
  'kiribati': 'KIR', 'niue': 'NIU', 'nauru': 'NRU', 'palau': 'PLW', 'marshall islands': 'MHL',
  'tonga': 'TON', 'tuvalu': 'TUV', 'samoa': 'WSM', 'antigua and barbuda': 'ATG', 'barbados': 'BRB',
  'dominica': 'DMA', 'grenada': 'GRD', 'saint kitts and nevis': 'KNA', 'saint lucia': 'LCA',
  'saint vincent and the grenadines': 'VCT', 'hong kong': 'HKG', 'macau': 'MAC', 'macao': 'MAC' };

/* ⚠ THE FACTBOOK IS 250 SEPARATE HTTP REQUESTS. A build that re-fetches all of them every time it
   is corrected is a build that gets corrected once; caching them under .cache/ is what lets the
   name-resolution ledger below be filled in over several passes instead of one heroic one. */
let CACHE = null;
export function useCache(root) { CACHE = path.join(root, '.cache', 'factbook'); }

export async function j(u) {
  let dest = null;
  if (CACHE) {
    dest = path.join(CACHE, u.replace(/^https?:\/\//, '').replace(/[^A-Za-z0-9._-]+/g, '_').slice(-180) + '.json');
    if (fs.existsSync(dest)) return JSON.parse(fs.readFileSync(dest, 'utf8'));
  }
  const r = await fetch(u, { headers: { 'user-agent': 'IntMap build' } });
  if (!r.ok) throw new Error(u + ' ' + r.status);
  const t = await r.text();
  if (dest) { fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, t); }
  return JSON.parse(t);
}

/* every country file the Factbook publishes, across its eleven regions */
export async function countryFiles() {
  const files = [];
  for (const reg of REGIONS) {
    let list; try { list = await j(API + reg); } catch (e) { console.log('skip region', reg, e.message); continue; }
    for (const f of list) if (f.name.endsWith('.json')) files.push(reg + '/' + f.name);
  }
  return files;
}

/* Natural Earth name → ISO3, over the six properties the atlas spells countries in.
   The same pass yields ISO3 → ISO2, because Natural Earth carries both and Glottolog spells
   countries in alpha-2 — deriving it here beats shipping a third country table. */
export async function isoIndex() {
  const ne = await j(NE);
  const byName = new Map(), alpha2 = new Map();
  for (const f of ne.features) {
    const p = f.properties;
    const iso = p.ISO_A3_EH || p.ISO_A3 || p.ADM0_A3;
    if (!iso || iso === '-99') continue;
    for (const k of [p.NAME, p.NAME_LONG, p.NAME_EN, p.ADMIN, p.BRK_NAME, p.FORMAL_EN]) if (k) byName.set(norm(k), iso);
    const a2 = p.ISO_A2_EH || p.ISO_A2;
    if (a2 && a2 !== '-99') alpha2.set(iso, a2);
  }
  byName.alpha2 = alpha2;
  return byName;
}

export function isoOf(byName, short) {
  return byName.get(norm(short)) || byName.get(norm(NAME_FIX[norm(short)] || '')) || ALIAS[norm(short)] || null;
}

export function shortNameOf(d) {
  const cn = ((d.Government || {})['Country name'] || {});
  let short = deent((cn['conventional short form'] || {}).text || '').trim();
  if (!short || /^none$/i.test(short)) short = deent((cn['conventional long form'] || {}).text || '').trim();
  if (!short || /^none$/i.test(short)) short = deent((cn['etymology'] || {}).text || '').split(/[,;.]/)[0];
  return short;
}

/* ── «name (parenthetical)* 12.3%» ──────────────────────────────────────────────────────────────
   ⚠ MORE THAN ONE PARENTHETICAL CAN SIT BETWEEN THE NAME AND THE NUMBER — «German (or Swiss
   German) (official) 62.1%» — and a single optional group silently loses that entry (Switzerland
   came out French-speaking). The repeated group takes them all; the FIRST one is kept for the
   denomination override the religion build does. */
export function pairs(text) {
  const t = deent(String(text || '')).replace(/<[^>]*>/g, ' ');
  const out = [];
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
export const REALNAME = (nm) => !/^(est|note|approx|about|around|roughly)$/i.test(nm.trim());

export const yearOf = (text) => {
  const t = String(text || '');
  let y = null, m;
  const re = /\((?:[^()]*?\b)?((?:1[89]|20)\d{2})\b[^()]*\)/g;
  while ((m = re.exec(t))) y = +m[1];                    /* the LAST one stated - the whole entry's */
  return y;
};

export const bucket = (nm, table, dflt) => { for (const [re, k] of table) if (re.test(nm)) return k; return dflt; };
