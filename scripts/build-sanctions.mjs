#!/usr/bin/env node
/* ============================================================================
 *  IntMap · scripts/build-sanctions.mjs — WHO SANCTIONS WHOM, AND WITH WHAT   (geopolitics-layers)
 * ----------------------------------------------------------------------------
 *  The reader asked for 「経済制裁・禁輸: どの国・機関が、誰に、何を制限しているか」. Three authorities publish their
 *  lists of designated parties as machine-readable files under terms that allow commercial reuse, and this builder
 *  reads all three:
 *
 *    US   OFAC Specially Designated Nationals and Blocked Persons List (sdn.csv + add.csv) — a work of the United
 *         States Government, not subject to copyright (17 U.S.C. §105)
 *    UK   UK Sanctions List (FCDO; OFSI's consolidated list was merged into it) — Open Government Licence v3.0
 *    EU   Consolidated list of persons, groups and entities subject to EU financial sanctions (FSF) — reuse authorised
 *         under Commission Decision 2011/833/EU with acknowledgement of the source
 *
 *  ⚠ NOT READ: the UN Security Council Consolidated List. The UN website's terms of use grant use «for personal,
 *  non-commercial use» and IntMap is a commercial service (memory: intmap-commercial-service-licences). The UN's
 *  designations still reach this record where they bind: the UK and EU lists carry every UN designation their law
 *  implements (the UK list's «Designation source: UN»), and that is counted (`un`) — under the authority that
 *  implements it, which is the statement those lists make.
 *
 *  WHAT A LINK IS. One authority × one country: how many parties the authority's list designates whose ADDRESS the list
 *  places in that country (else, for a person, the NATIONALITY it states; for a ship, the FLAG it states) — by kind
 *  (individual / entity / ship / aircraft), by the regime or programme it designates them under, and by the measures it
 *  imposes. A party with addresses in several countries is counted in each (a link says «parties linked to X», never
 *  «parties of X»). The country is found by asking scripts/lib/country-name-index.mjs (Natural Earth + CLDR) or, for the
 *  EU list, read as the ISO 3166-1 alpha-2 code the list itself states. A party the list places nowhere — or whose
 *  country no record names — is counted in `unplaced` with the words the list wrote, never dropped and never guessed.
 *
 *  WHAT A MEASURE IS. The UK list states it per party («Sanctions Imposed»: asset freeze, travel ban, trust services,
 *  arms embargo, shipping…), so it is read. The EU FSF and OFAC SDN lists are each ONE measure by definition, stated in
 *  the list's own name: the FSF list is the list of financial sanctions (freezing of funds and economic resources, no
 *  funds made available), the SDN list is the list of persons whose property is blocked. Those are written as the
 *  list's measure, once, with the list as the author — not inferred per party.
 *
 *  TIME. All three are the list AS IT STANDS ON THE DAY IT WAS READ: a delisted party is not in it, so no earlier day
 *  can be reconstructed from it (designation dates are kept as `first`/`last` — the earliest and latest designation
 *  date the list states for the parties of a link — but they are not a history). js/layer-time-decl.js declares the
 *  layer a snapshot as of `asOf`.
 *
 *  OUTPUT — data/sanctions.json:
 *    { v, asOf, retrievedAt, generatedAt, publisher, url, licence, licenceUrl, attribution, paidBy, builtBy, cadence,
 *      authorities: [{ id, name:[en,jp], list, publisher, url, licence, licenceUrl, listDate, seat:[lon,lat], seatWhat,
 *                      measure (EU/US: the list's one measure, [en,jp]) | null, parties }],
 *      places: { <ISO3>: { en, ja, x, y } },             (Natural Earth's label point and names — the map's own)
 *      links: [{ a, c, n, kinds:{individual,entity,ship,aircraft}, basis:{address,nationality,flag}, un,
 *                regimes:[[name, n]], measures:[[name, n]], first, last }],
 *      unplaced: { <authority>: { n, words:[[text, n]] } } }
 *
 *  USAGE
 *    node scripts/build-sanctions.mjs                 download the three lists, derive, write
 *    node scripts/build-sanctions.mjs --from <dir>    the same from local copies (uk.csv, eu.csv, sdn.csv, add.csv)
 *  ⚠ NOT IN `npm test` (it needs the network: the UK list alone is 50 MB, measured 2026-11-17).
 *  tests/geopolitics-layers-checks.test.mjs validates the committed file offline.
 * ==========================================================================*/
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCSV } from './lib/cldf.mjs';
import { fetchChecked } from './lib/upstream.mjs';
import { countryNameIndex } from './lib/country-name-index.mjs';
import { neCountries } from './build-world-flows.mjs';
import { agreeOrRefuse } from './lib/gov-stamp.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const OUT = 'data/sanctions.json';
const NE_FILE = join(ROOT, 'data', 'ne-countries', 'ne_10m_admin_0_countries.json.gz');

const URLS = {
  ukCsv: 'https://sanctionslist.fcdo.gov.uk/docs/UK-Sanctions-List.csv',
  euCsv: 'https://webgate.ec.europa.eu/fsd/fsf/public/files/csvFullSanctionsList_1_1/content?token=dG9rZW4tMjAxNw',
  sdnCsv: 'https://www.treasury.gov/ofac/downloads/sdn.csv',
  addCsv: 'https://www.treasury.gov/ofac/downloads/add.csv',
};

/* ⚠ 出自は値である（js/data-governance.js の read() と npm run check:datagov が読む）。上流が述べることだけを書く。 */
export const GOVERNANCE = {
  'data/sanctions.json': {
    upstreams: [
      { publisher: 'U.S. Department of the Treasury, Office of Foreign Assets Control (OFAC)', url: 'https://ofac.treasury.gov/specially-designated-nationals-and-blocked-persons-list-sdn-human-readable-lists',
        licence: 'public domain (U.S. Government work, 17 U.S.C. §105)', licenceUrl: 'https://www.usa.gov/government-copyright', attribution: false,
        fields: 'sdn.csv (ent_num, name, type, programs, remarks, vessel flag) and add.csv (country) — the SDN list as published on the day read' },
      { publisher: 'UK Foreign, Commonwealth & Development Office — UK Sanctions List', url: 'https://www.gov.uk/government/publications/the-uk-sanctions-list',
        licence: 'Open Government Licence v3.0', licenceUrl: 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/', attribution: true, creditRequired: true,
        fields: 'UK-Sanctions-List.csv — Unique ID, Regime Name, Designation Type, Designation source, Sanctions Imposed, Address Country, Nationality(/ies), Current believed flag of ship, Date Designated',
        paidBy: 'UK Sanctions List — Foreign, Commonwealth & Development Office (Open Government Licence v3.0)' },
      { publisher: 'European Commission — Consolidated list of persons, groups and entities subject to EU financial sanctions (FSF)', url: 'https://data.europa.eu/data/datasets/consolidated-list-of-persons-groups-and-entities-subject-to-eu-financial-sanctions',
        licence: 'Commission Decision 2011/833/EU (reuse with acknowledgement)', licenceUrl: 'https://eur-lex.europa.eu/eli/dec/2011/833/oj', attribution: true, creditRequired: true,
        fields: 'csvFullSanctionsList_1_1 — Entity_LogicalId, Entity_SubjectType, Entity_DesignationDate, Entity_Regulation_Programme, Entity_Regulation_NumberTitle, Address_CountryIso2Code, Citizenship_CountryIso2Code, Entity_UnitedNationId',
        paidBy: 'EU financial sanctions — European Commission consolidated list (FSF, Decision 2011/833/EU)' },
      { publisher: 'Natural Earth', url: 'https://www.naturalearthdata.com/', licence: 'public domain', attribution: false,
        fields: 'ISO_A3_EH, ISO_A2_EH, NAME*, LABEL_X, LABEL_Y — read from data/ne-countries (the shapes the map draws) to place a named country' },
    ],
    /* the file as a whole: the three lists' publishers; its terms are the strictest of the three (OGL v3.0 and the Commission's
       reuse decision both make the acknowledgement a condition), so the file's licence URL is the OGL's and credit is required */
    publisher: 'U.S. Treasury OFAC · UK Foreign, Commonwealth & Development Office · European Commission',
    url: 'https://www.gov.uk/government/publications/the-uk-sanctions-list',
    licence: 'US public domain · OGL v3.0 · Decision 2011/833/EU',
    licenceUrl: 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/',
    attribution: true,
    paidBy: 'UK Sanctions List — Foreign, Commonwealth & Development Office (Open Government Licence v3.0)',
    /* which list stands where two speak: none overrides another — each authority is its own link, drawn and counted apart;
       Natural Earth only places a country the lists name */
    priority: { rank: ['OFAC SDN', 'UK Sanctions List', 'EU FSF', 'Natural Earth'],
      over: 'no list overrides another: each authority\'s parties are counted under that authority only; Natural Earth supplies the point and names of a country a list names, never a party' },
    cadence: 'P1D',
    cadenceBasis: {
      kind: 'measured',
      observed: 'read 2026-11-17: the UK list file states «Report Date: 12-Nov-2026», the EU file a fileGenerationDate of the same week, and OFAC publishes recent-actions notices several times a week — any day can change a list',
      expires: 'if the three lists are read from a dated archive instead of their live files',
      canon: 'scripts/build-sanctions.mjs GOVERNANCE',
    },
    /* ⚠ LITERALS THE GATE CAN READ WITHOUT RUNNING THIS FILE, and main() REFUSES to write a bundle that disagrees with them —
       a rebuild on another day restates them here (the convention of scripts/build-hist-urban.mjs) */
    retrievedAt: '2026-11-17',
    generatedAt: '2026-11-17',
    asOf: '2026-11-17',
    schema: 'scripts/build-sanctions.mjs (authorities · places · links · unplaced) — read by js/geopolitics-core.js; tests/geopolitics-layers-checks.test.mjs',
    /* measured on links[]: rows = authority × country links; key (a, c); n ≥ 1 */
    quality: { rows: 432, missing: { a: 0, c: 0, n: 0 }, outOfRange: { n: 0 }, duplicates: 0 },
    builtBy: 'scripts/build-sanctions.mjs',
  },
};

/* ══ THE AUTHORITIES ════════════════════════════════════════════════════════════════════════════════════════
   `seat` is where a line starts: the building that publishes the list. Observation 2026-11-17 (the publishers' own contact
   pages): OFAC — Treasury Annex, 1500 Pennsylvania Ave NW, Washington DC; FCDO — King Charles Street, London; the EU list
   is the Commission's (DG FISMA), Berlaymont, Rue de la Loi 200, Brussels. Coordinates read off OpenStreetMap at those
   addresses. Lapses if a publisher moves. Canonical: this table. */
const AUTH = {
  US: { name: ['United States (OFAC)', '米国（OFAC）'], list: 'Specially Designated Nationals and Blocked Persons List (SDN)',
    publisher: GOVERNANCE[OUT].upstreams[0].publisher, url: GOVERNANCE[OUT].upstreams[0].url,
    licence: GOVERNANCE[OUT].upstreams[0].licence, licenceUrl: GOVERNANCE[OUT].upstreams[0].licenceUrl,
    seat: [-77.0339, 38.8973], seatWhat: ['U.S. Treasury, Washington DC', '米財務省（ワシントン DC）'],
    measure: ['Blocking: property and interests in property are blocked and U.S. persons are generally prohibited from dealing with them', '資産凍結（ブロッキング）: 財産と財産上の権益が凍結され、米国人はその者との取引を原則として禁じられる'] },
  UK: { name: ['United Kingdom', '英国'], list: 'UK Sanctions List',
    publisher: GOVERNANCE[OUT].upstreams[1].publisher, url: GOVERNANCE[OUT].upstreams[1].url,
    licence: GOVERNANCE[OUT].upstreams[1].licence, licenceUrl: GOVERNANCE[OUT].upstreams[1].licenceUrl,
    seat: [-0.1276, 51.5026], seatWhat: ['FCDO, King Charles Street, London', '英外務・英連邦・開発省（ロンドン）'], measure: null },
  EU: { name: ['European Union', '欧州連合（EU）'], list: 'Consolidated list of persons, groups and entities subject to EU financial sanctions',
    publisher: GOVERNANCE[OUT].upstreams[2].publisher, url: GOVERNANCE[OUT].upstreams[2].url,
    licence: GOVERNANCE[OUT].upstreams[2].licence, licenceUrl: GOVERNANCE[OUT].upstreams[2].licenceUrl,
    seat: [4.3827, 50.8436], seatWhat: ['European Commission, Brussels', '欧州委員会（ブリュッセル）'],
    measure: ['Financial sanctions: funds and economic resources are frozen and none may be made available to the party', '金融制裁: 資金と経済資源が凍結され、その者に資金等を提供することが禁じられる'] },
};

/* ── small helpers ── */
const tidy = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
/* the UK list writes one measure in several capitalisations («Prohibition on Correspondent banking…» and «…correspondent
   banking…»): one comparison form, the first spelling met is the one shown */
const measureKey = (s) => tidy(s).toLowerCase();
/** dd/mm/yyyy (UK) or yyyy-mm-dd (EU) → yyyy-mm-dd, or null */
function isoDate(s) {
  const t = tidy(s);
  let m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[1] + '-' + m[2] + '-' + m[3] : null;
}
const table = (rows, headAt = 0) => {
  const head = rows[headAt].map(tidy);
  return rows.slice(headAt + 1).filter((r) => r.length > 1).map((r) => { const o = {}; head.forEach((h, i) => { o[h] = r[i]; }); return o; });
};

/* ══ ONE PARTY, AS EVERY LIST IS REDUCED TO ═══════════════════════════════════════════════════════════════
   { id, kind, countries:Map<ISO3, basis>, words:[unresolved text], regimes:Set, measures:Set, date, un } */
function party(id) { return { id, kind: null, countries: new Map(), words: [], regimes: new Set(), measures: new Map(), dates: [], un: false }; }

export function readUK(text, names) {
  const lines = parseCSV(text);
  const reportLine = tidy((lines[0] || []).join(','));
  const m = reportLine.match(/Report Date:\s*(\d{1,2})-([A-Za-z]{3})-(\d{4})/);
  const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  const listDate = m ? m[3] + '-' + String(MON[m[2].toLowerCase()]).padStart(2, '0') + '-' + m[1].padStart(2, '0') : null;
  const rows = table(lines, 1);
  const P = new Map();
  for (const r of rows) {
    const id = tidy(r['Unique ID']);
    if (!id) continue;
    if (!P.has(id)) P.set(id, party(id));
    const p = P.get(id);
    const kind = tidy(r['Designation Type']).toLowerCase();
    if (kind) p.kind = kind === 'ship' ? 'ship' : kind === 'individual' ? 'individual' : 'entity';
    const reg = tidy(r['Regime Name']); if (reg) p.regimes.add(reg);
    for (const s of String(r['Sanctions Imposed'] || '').split('|')) { const t = tidy(s); if (t && !p.measures.has(measureKey(t))) p.measures.set(measureKey(t), t); }
    const d = isoDate(r['Date Designated']); if (d) p.dates.push(d);
    if (/^un$/i.test(tidy(r['Designation source']))) p.un = true;
    const addr = tidy(r['Address Country']);
    if (addr) p._addr = (p._addr || new Set()).add(addr);
    for (const n of String(r['Nationality(/ies)'] || '').split(/[,;]/)) { const t = tidy(n); if (t) p._nat = (p._nat || new Set()).add(t); }
    const flag = tidy(r['Current believed flag of ship']); if (flag) p._flag = (p._flag || new Set()).add(flag);
  }
  for (const p of P.values()) place(p, names);
  return { listDate, parties: [...P.values()] };
}

/* ⚠ the EU file is SEMICOLON-separated and QUOTED — measured 2026-11-17: 1,068 of 44,044 lines carry a «;» or a newline
   inside a quoted field, so splitting lines on «;» misreads them; it is parsed as RFC-4180 with «;» as the separator. */
export function readEUText(text) {
  const lines = parseCSV(text.replace(/^﻿/, ''), ';').filter((r) => r.length > 1);
  const head = lines[0].map(tidy);
  if (lines.some((r) => r.length !== head.length)) throw new Error('EU list: a row does not have the header\'s ' + head.length + ' columns — the file changed shape');
  const ix = (n) => head.indexOf(n);
  const I = { gen: ix('fileGenerationDate'), id: ix('Entity_LogicalId'), un: ix('Entity_UnitedNationId'), date: ix('Entity_DesignationDate'),
    kind: ix('Entity_SubjectType_ClassificationCode'), prog: ix('Entity_Regulation_Programme'), title: ix('Entity_Regulation_NumberTitle'),
    pub: ix('Entity_Regulation_PublicationDate'), addr: ix('Address_CountryIso2Code'), cit: ix('Citizenship_CountryIso2Code') };
  for (const [k, v] of Object.entries(I)) if (v < 0) throw new Error('EU list: column for ' + k + ' not found in the header — the file changed shape');
  const P = new Map();
  let listDate = null;
  for (const r of lines.slice(1)) {
    const id = tidy(r[I.id]); if (!id) continue;
    if (!listDate) listDate = isoDate(r[I.gen]);
    if (!P.has(id)) P.set(id, party(id));
    const p = P.get(id);
    const k = tidy(r[I.kind]).toLowerCase();
    if (k) p.kind = k === 'person' ? 'individual' : k === 'enterprise' ? 'entity' : 'entity';
    const prog = tidy(r[I.prog]); if (prog) p.regimes.add(prog);
    const d = isoDate(r[I.date]) || isoDate(r[I.pub]); if (d) p.dates.push(d);
    if (tidy(r[I.un])) p.un = true;
    const a = tidy(r[I.addr]).toUpperCase(); if (/^[A-Z]{2}$/.test(a) && a !== '00') p._a2addr = (p._a2addr || new Set()).add(a);
    const c = tidy(r[I.cit]).toUpperCase(); if (/^[A-Z]{2}$/.test(c) && c !== '00') p._a2nat = (p._a2nat || new Set()).add(c);
  }
  return { listDate, parties: [...P.values()] };
}

export function readOFAC(sdnText, addText, names) {
  const sdn = parseCSV(sdnText).filter((r) => r.length >= 12);
  const add = parseCSV(addText).filter((r) => r.length >= 5);
  const nil = (s) => { const t = tidy(s); return t === '-0-' ? '' : t; };
  const P = new Map();
  for (const r of sdn) {
    const id = nil(r[0]); if (!id) continue;
    const p = party(id);
    const type = nil(r[2]).toLowerCase();
    p.kind = type === 'individual' ? 'individual' : type === 'vessel' ? 'ship' : type === 'aircraft' ? 'aircraft' : 'entity';
    /* programs are written «[A] [B]» or «A] [B» */
    for (const s of nil(r[3]).split(/\]\s*\[|\[|\]/)) { const t = tidy(s); if (t) p.regimes.add(t); }
    const flag = nil(r[9]); if (flag) p._flag = new Set([flag]);
    /* the remarks state nationality as «nationality <Country>;» — the list's own field inside its remarks */
    const rem = nil(r[11]);
    for (const m of rem.matchAll(/(?:^|;\s*)nationality\s+([^;]+)/gi)) { const t = tidy(m[1]).replace(/\.$/, ''); if (t) p._nat = (p._nat || new Set()).add(t); }
    P.set(id, p);
  }
  for (const r of add) {
    const p = P.get(nil(r[0]));
    const c = nil(r[4]);
    if (p && c) p._addr = (p._addr || new Set()).add(c);
  }
  for (const p of P.values()) place(p, names);
  return { listDate: null, parties: [...P.values()] };
}

/** the countries a party is linked to: its addresses, else (a person) its nationalities, else (a ship) its flag */
function place(p, names) {
  const fromNames = (set, basis) => {
    let any = false;
    for (const w of set || []) { const c = names.resolve(w); if (c) { if (!p.countries.has(c)) p.countries.set(c, basis); any = true; } else p.words.push(w); }
    return any;
  };
  const fromA2 = (set, basis) => {
    let any = false;
    for (const a2 of set || []) { const c = names.a2to3.get(a2); if (c) { if (!p.countries.has(c)) p.countries.set(c, basis); any = true; } else p.words.push(a2); }
    return any;
  };
  const words0 = p.words.length;
  if (fromNames(p._addr, 'address') || fromA2(p._a2addr, 'address')) { p.words.length = words0; return; }
  if (fromNames(p._nat, 'nationality') || fromA2(p._a2nat, 'nationality')) { p.words.length = words0; return; }
  if (fromNames(p._flag, 'flag')) { p.words.length = words0; return; }
}

/** reduce one authority's parties to its links */
export function linksOf(auth, parties, names) {
  const L = new Map();
  const un = { n: 0, words: new Map() };
  for (const p of parties) {
    if (auth === 'EU') place(p, names);
    if (!p.countries.size) {
      un.n++;
      for (const w of new Set(p.words)) un.words.set(w, (un.words.get(w) || 0) + 1);
      continue;
    }
    for (const [c, basis] of p.countries) {
      if (!L.has(c)) L.set(c, { a: auth, c, n: 0, kinds: {}, basis: {}, un: 0, regimes: new Map(), measures: new Map(), first: null, last: null });
      const l = L.get(c);
      l.n++;
      l.kinds[p.kind || 'entity'] = (l.kinds[p.kind || 'entity'] || 0) + 1;
      l.basis[basis] = (l.basis[basis] || 0) + 1;
      if (p.un) l.un++;
      for (const g of p.regimes) l.regimes.set(g, (l.regimes.get(g) || 0) + 1);
      for (const [k, t] of p.measures) { const e = l.measures.get(k) || [t, 0]; e[1]++; l.measures.set(k, e); }
      for (const d of p.dates) { if (!l.first || d < l.first) l.first = d; if (!l.last || d > l.last) l.last = d; }
    }
  }
  const sortN = (m) => [...m.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  const links = [...L.values()].map((l) => ({ ...l, regimes: sortN(l.regimes), measures: [...l.measures.values()].sort((a, b) => b[1] - a[1]) }))
    .sort((a, b) => b.n - a.n);
  return { links, unplaced: { n: un.n, words: sortN(un.words) } };
}

async function getText(name, url, from) {
  if (from) return readFileSync(join(from, name), 'utf8');
  return fetchChecked(url, {}, { as: 'text', attempts: 3, timeoutMs: 300000,
    validate: (t) => (t.length > 1000 ? null : 'the file is ' + t.length + ' bytes — not a sanctions list') });
}

/* Wikidata's English labels and aliases of the items that state an ISO 3166-1 alpha-3 code (P298, CC0) — the third
   record scripts/lib/country-name-index.mjs asks («DPRK», «Occupied Palestinian Territory», «St Vincent») */
const WD_QUERY = 'SELECT ?a3 ?l WHERE { ?c wdt:P298 ?a3 . { ?c rdfs:label ?l } UNION { ?c skos:altLabel ?l } FILTER(lang(?l)="en") }';
async function wikidataCountryNames(from) {
  const j = from ? JSON.parse(readFileSync(join(from, 'wd-countries.json'), 'utf8'))
    : await fetchChecked('https://query.wikidata.org/sparql?query=' + encodeURIComponent(WD_QUERY), { headers: { accept: 'application/sparql-results+json' } },
      { as: 'json', attempts: 3, validate: (b) => (b && b.results && b.results.bindings && b.results.bindings.length > 500 ? null : 'too few country names') });
  return j.results.bindings.map((b) => [b.l.value, b.a3.value]);
}

async function main() {
  const at = process.argv.indexOf('--from');
  const from = at > 0 ? process.argv[at + 1] : null;
  const names = countryNameIndex(NE_FILE, await wikidataCountryNames(from));
  const ne = neCountries(NE_FILE);
  const [uk, eu, sdn, add] = await Promise.all([
    getText('uk.csv', URLS.ukCsv, from), getText('eu.csv', URLS.euCsv, from), getText('sdn.csv', URLS.sdnCsv, from), getText('add.csv', URLS.addCsv, from)]);
  const today = new Date().toISOString().slice(0, 10);
  const lists = { US: readOFAC(sdn, add, names), UK: readUK(uk, names), EU: readEUText(eu) };
  const authorities = [], links = [], unplaced = {};
  for (const [id, L] of Object.entries(lists)) {
    if (L.parties.length < 100) throw new Error(id + ' list: ' + L.parties.length + ' parties — refusing to write a list that small (the smallest of the three held 6,269 on 2026-11-17)');
    const r = linksOf(id, L.parties, names);
    links.push(...r.links);
    unplaced[id] = r.unplaced;
    authorities.push({ id, ...AUTH[id], listDate: L.listDate || today, parties: L.parties.length });
    console.log(id, L.parties.length, 'parties ·', r.links.length, 'countries ·', r.unplaced.n, 'unplaced', r.unplaced.words.slice(0, 12).map((w) => w.join(':')).join(' | '));
  }
  const places = {};
  for (const l of links) {
    if (places[l.c]) continue;
    const p = ne.byA3.get(l.c);
    places[l.c] = p ? { en: p.en, ja: p.ja, x: p.x, y: p.y } : { en: l.c, ja: null, x: null, y: null };
  }
  /* the bundle carries its declaration whole (check:datagov reads the same facets from the file as from this script) */
  const g = agreeOrRefuse(GOVERNANCE[OUT], links, { fields: { a: {}, c: {}, n: { min: 1 } }, key: ['a', 'c'] }, today);
  const out = { v: 1, ...g, authorities, places, links, unplaced };
  writeFileSync(join(ROOT, OUT), JSON.stringify(out));
  console.log('wrote', OUT, JSON.stringify(out).length, 'bytes ·', links.length, 'links');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch((e) => { console.error(e); process.exit(1); });
