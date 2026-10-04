#!/usr/bin/env node
/* ============================================================================
 *  IntMap · scripts/fetch-world-events.mjs — the world events the dated-events index carries from WIKIDATA  (time-index-unify)
 * ----------------------------------------------------------------------------
 *  The Information dashboard's «World events» view used to read a hand-written table (js/analysis-world-events.js
 *  EVENTS_DB, 132 rows): a year, a pair of coordinates, a one-line description and a Wikipedia article name, each
 *  typed by hand and none of them citing anything. That table is gone. Its rows went three ways (the count is in
 *  dev-notes/2026-10-04-time-index-unify.md):
 *    · rows the war record (data/wars.json) already states by the day — the index has them;
 *    · rows that are border changes the border record (CShapes 2.0) dates by the day — the index has them too;
 *    · the rest, which neither record states. For each, the article the row named is the SEED below and THIS
 *      SCRIPT ASKS WIKIDATA what it states about that item: its date (with the precision Wikidata gives it), its
 *      place, its name and its description, in every language IntMap reads (js/lang-registry.js). A row whose item
 *      states no date to the year is DROPPED and the reason is written into the snapshot — the index never says
 *      what no source says (.agents/rules/historical-verification.md §2-3).
 *
 *  ⚠ THE SEED IS A SELECTION, NOT A CLAIM. It says which items the view offers (the dashboard's editorial choice,
 *  inherited from the table) and the IntMap category the view colours them by. Every fact the reader sees — the
 *  date, its precision, the place, the words — is Wikidata's, cited by the item’s QID and the property that stated
 *  it. The hand-written year, coordinates and description of the old row are not carried.
 *  ⚠ THE DATE IS ONE THE ITEM STATES (`dateOf`). First its point in time (P585) and its start time (P580), pooled:
 *  the FINEST precision either states, then the EARLIEST day at it. ⚠ Measured 2026-10-04 on this seed: 24 items state
 *  a bare year as P585 beside a day as P580 (Wall Street crash: P585 1929, P580 1929-10-24; Titanic: P585 1912-04,
 *  P580 1912-04-14) — taking P585 first would have handed the reader «1929» for a crash the item dates to the day.
 *  Only when the item states neither, the first of the properties that say when a THING came to be (LATER_PROPS:
 *  official opening, first flight, launch, discovery, publication, inception — inception last, being the vaguest).
 *  The property travels with the record, so the reader is told «start time» and is not handed a start as the day
 *  of an event. A precision coarser than a year (decade, century) cannot be placed in a year — not a date here.
 *  ⚠ A STATEMENT HISTORY CONTRADICTS IS REFUSED, BY VALUE, WITH ITS REASON (.agents/rules/historical-verification.md
 *  §2-2: «the upstream says so» is not history; no-ad-hoc-hardcoding §6). A SEED row may carry `refuse`: the one
 *  property value that is wrong, the record that says so, and nothing else — the rule above then runs on what is
 *  left. A refusal that no longer matches (Wikidata corrected it) is printed as STALE and written into the snapshot,
 *  so it is lifted rather than kept.
 *  ⚠ THE PLACE is the item’s own coordinates (P625), else its location's (P276 → P625); with neither the record
 *  has no place and the view draws no pin for it — a pin is never placed where no source put it.
 *
 *    node scripts/fetch-world-events.mjs     ask Wikidata, write scripts/time-index/wikidata-events.json
 *  The index builder (scripts/build-on-this-day.mjs) reads that snapshot, never the network.
 * ==========================================================================*/
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { langRegistry } from './lib/import-module.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const SNAPSHOT = 'scripts/time-index/wikidata-events.json';
const API = 'https://www.wikidata.org/w/api.php';
const WP_API = 'https://en.wikipedia.org/w/api.php';
const UA = 'IntMap/fetch-world-events (+https://github.com/rwmqx7dwb5-arch/IntMap)';

/* the properties that state WHEN an item happened (P585 point in time, P580 start time) and, failing both, when a thing
   came to be — in the order asked (P1619 official opening, P606 first flight, P619 launch, P575 discovery, P577
   publication, P571 inception) */
export const EVENT_PROPS = ['P585', 'P580'];
export const LATER_PROPS = ['P1619', 'P606', 'P619', 'P575', 'P577', 'P571'];
export const DATE_PROPS = EVENT_PROPS.concat(LATER_PROPS);
const JULIAN = 'http://www.wikidata.org/entity/Q1985786';

/* the selection: the English Wikipedia article each kept row of the old table named, and its category on the dashboard */
export const SEED = [
  ['Voyages of Christopher Columbus', 'geo'],
  ['Peace of Westphalia', 'geo'],
  ['1755 Lisbon earthquake', 'disaster'],
  ['French Revolution', 'revolution'],
  ['Congress of Vienna', 'geo'],
  ['Treaty of Nanking', 'geo'],
  ['Assassination of Abraham Lincoln', 'assassination', { refuse: [{ p: 'P585', v: '1865-04-15', why: 'the item’s only date is the day Lincoln died; he was shot at Ford’s Theatre on the evening of 14 April 1865 (the item’s own enwiki article opens «On the evening of April 14, 1865»)' }] }],
  ['Meiji Restoration', 'revolution'],
  ['Suez Canal', 'economic'],
  ['1883 eruption of Krakatoa', 'disaster'],
  ['Wright Flyer', 'space'],
  ['1906 San Francisco earthquake', 'disaster'],
  ['Sinking of the Titanic', 'disaster'],
  ['Panama Canal', 'economic'],
  ['Spanish flu', 'disaster'],
  ['Treaty of Versailles', 'geo'],
  ['1923 Great Kantō earthquake', 'disaster'],
  ['Wall Street Crash of 1929', 'economic'],
  ['Trinity (nuclear test)', 'space'],
  ['United Nations', 'geo'],
  ['Assassination of Mahatma Gandhi', 'assassination'],
  ["Proclamation of the People's Republic of China", 'revolution'],
  ['NATO', 'geo'],
  ['Sputnik 1', 'space'],
  ['Treaty of Rome', 'economic'],
  ['Cuban Revolution', 'revolution'],
  ['Berlin Wall', 'geo'],
  ['Vostok 1', 'space'],
  ['Cuban Missile Crisis', 'war'],
  ['Assassination of John F. Kennedy', 'assassination'],
  ['Assassination of Martin Luther King Jr.', 'assassination'],
  ['Apollo 11', 'space'],
  ['Nixon shock', 'economic'],
  ['1973 oil crisis', 'economic'],
  ['Iranian Revolution', 'revolution'],
  ['Soviet–Afghan War', 'war'],
  ['Bhopal disaster', 'disaster'],
  ['Plaza Accord', 'economic'],
  ['Chernobyl disaster', 'disaster'],
  ['Space Shuttle Challenger disaster', 'space'],
  ['Fall of the Berlin Wall', 'revolution'],
  ['1989 Tiananmen Square protests and massacre', 'revolution'],
  ['Gulf War', 'war'],
  ['1994 South African general election', 'revolution'],
  ['Assassination of Yitzhak Rabin', 'assassination'],
  ['Handover of Hong Kong', 'geo'],
  ['1997 Asian financial crisis', 'economic'],
  ['Euro', 'economic', { refuse: [{ p: 'P580', v: '2002-01-01', why: 'the day the euro’s notes and coins began to circulate, not the day the currency began: it was introduced on 1 January 1999 (Council Regulation (EC) No 974/98, Art. 2), the item’s other P580' }] }],
  ['September 11 attacks', 'war'],
  ['2003 invasion of Iraq', 'war'],
  ['2004 Indian Ocean earthquake and tsunami', 'disaster'],
  ['Hurricane Katrina', 'disaster'],
  ['Bankruptcy of Lehman Brothers', 'economic'],
  ['Arab Spring', 'revolution'],
  ['Greek government-debt crisis', 'economic'],
  ['2010 Haiti earthquake', 'disaster'],
  ['2011 Tōhoku earthquake and tsunami', 'disaster'],
  ['Annexation of Crimea by the Russian Federation', 'war'],
  ['Falcon 9 flight 20', 'space'],
  ['2016 United Kingdom European Union membership referendum', 'geo'],
  ['COVID-19 pandemic', 'disaster'],
  ['Russian invasion of Ukraine', 'war'],
  ['Assassination of Shinzo Abe', 'assassination'],
  ['2023 Turkey–Syria earthquakes', 'disaster'],
  ['October 7 attacks', 'war'],
  ['2024 Hualien earthquake', 'disaster'],
  ['Fall of the Assad regime', 'revolution'],
  ['2024 United States presidential election', 'geo'],
  ['Haitian Revolution', 'revolution'],
  ['History of penicillin', 'space'],
  ['Warsaw Pact', 'geo'],
  ['IPhone (1st generation)', 'space', { refuse: [{ p: 'P577', v: '2007-06-09', why: 'the first iPhone went on sale in the United States on 29 June 2007 (Apple press release, 28 June 2007, «iPhone Premieres This Friday Night at Apple Retail Stores»); nothing happened on 9 June' }] }],
  ['Higgs boson', 'space'],
  ['2018 inter-Korean summits', 'geo'],
  ['January 6 United States Capitol attack', 'geo'],
  ['Fall of Constantinople', 'war'],
  ['Reformation', 'revolution'],
  ['United States Declaration of Independence', 'revolution'],
  ['On the Origin of Species', 'space'],
  ['Russian Revolution', 'revolution'],
  ['Stonewall riots', 'revolution'],
  ['1972 Nixon visit to China', 'geo'],
  ['Invasion of Kuwait', 'war'],
  ['Rwandan genocide', 'disaster'],
  ['Deepwater Horizon oil spill', 'disaster', { refuse: [{ p: 'P585', v: '2010-04-15', why: 'the blowout and explosion of the Deepwater Horizon were on 20 April 2010 (National Commission on the BP Deepwater Horizon Oil Spill, Report to the President, January 2011) — the item’s own P580' }] }],
  ['November 2015 Paris attacks', 'war'],
  ['Notre-Dame fire', 'disaster'],
  ['2021 Taliban offensive', 'war'],
  ['ChatGPT', 'space'],
  ['James Webb Space Telescope', 'space'],
  ['Black Death', 'disaster'],
  ['De revolutionibus orbium coelestium', 'space'],
  ['Philosophiæ Naturalis Principia Mathematica', 'space'],
  ['Industrial Revolution', 'economic'],
  ['Battle of Waterloo', 'war'],
  ['Molecular Structure of Nucleic Acids', 'space'],
  ['1953 British Mount Everest expedition', 'space'],
  ['Christiaan Barnard', 'space'],
  ['Munich massacre', 'assassination'],
  ['Iran–Iraq War', 'war'],
  ['Falklands War', 'war'],
  ['World Wide Web', 'space'],
  ['Dolly (sheep)', 'space'],
  ['Human Genome Project', 'space'],
  ['First Libyan Civil War', 'revolution'],
  ['Paris Agreement', 'geo'],
  ['Sudanese civil war (2023–present)', 'war'],
];

/* IntMap's languages as Wikidata writes them (js/lang-registry.js htmlTag, lower-cased: ja, zh-hant, zh-hans …) */
function wdLangs() {
  const L = langRegistry();
  return L.list().map((r) => ({ code: r.code, wd: L.htmlTag(r.code).toLowerCase() }));
}
async function getJSON(base, params) {
  const u = base + '?' + new URLSearchParams(Object.assign({ format: 'json' }, params));
  const r = await fetch(u, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!r.ok) throw new Error(base + ' answered ' + r.status + ' for ' + u);
  const j = await r.json();
  if (j.error) throw new Error(base + ' refused: ' + JSON.stringify(j.error));
  return j;
}
/* the statements of a property a reader should take: preferred if any, else normal — never deprecated, never refused */
function best(claims, p, refused) {
  const all = ((claims && claims[p]) || []).filter((c) => c.mainsnak && c.mainsnak.snaktype === 'value' && !(refused && refused(p, c)));
  const pref = all.filter((c) => c.rank === 'preferred');
  return pref.length ? pref : all.filter((c) => c.rank === 'normal');
}
/** a Wikidata time value → { d, prec, cal } — `d` cut to what the precision states ('1912', '1918-02', '1912-04-15') */
export function timeOf(v) {
  const m = /^([+-])(\d+)-(\d\d)-(\d\d)T/.exec(String((v && v.time) || ''));
  if (!m || !(v.precision >= 9)) return null;
  const y = (m[1] === '-' ? -1 : 1) * +m[2];
  if (y <= 0) return null;   /* this index's years are the common era's (the old table's earliest is 1347) */
  const prec = v.precision >= 11 ? 'day' : v.precision === 10 ? 'month' : 'year';
  if ((prec !== 'year' && m[3] === '00') || (prec === 'day' && m[4] === '00')) return null;   /* a precision the value does not carry */
  const ys = String(y).padStart(4, '0');
  const d = prec === 'day' ? ys + '-' + m[3] + '-' + m[4] : prec === 'month' ? ys + '-' + m[3] : ys;
  return { d, prec, cal: v.calendarmodel === JULIAN ? 'julian' : 'gregorian' };
}
const RANK = { year: 0, month: 1, day: 2 };
/** the date an item states (header): P585 and P580 pooled — finest precision, then earliest — else the first of
    LATER_PROPS that states one. → { d, prec, cal, prop } | null */
export function dateOf(claims, refused) {
  /* a start the item's own end precedes is a statement the item contradicts (measured: Q856650 «Iraqi invasion of Kuwait»
     states P580 2009-08-02 beside P582 1990-08-04) — not a date of anything */
  const ends = best(claims, 'P582').map((c) => timeOf(c.mainsnak.datavalue.value)).filter(Boolean).map((t) => t.d);
  const afterEnd = (t) => t.prop === 'P580' && ends.length > 0 && ends.every((e) => e < t.d.slice(0, e.length));
  const cands = (props) => props.flatMap((p) => best(claims, p, refused).map((c) => Object.assign({ prop: p }, timeOf(c.mainsnak.datavalue.value) || { d: null }))).filter((t) => t.d && !afterEnd(t));
  const pickOf = (list) => list.sort((x, y) => RANK[y.prec] - RANK[x.prec] || (x.d < y.d ? -1 : x.d > y.d ? 1 : 0))[0] || null;
  const ev = pickOf(cands(EVENT_PROPS));
  if (ev) return ev;
  for (const p of LATER_PROPS) { const t = pickOf(cands([p])); if (t) return t; }
  return null;
}
const coordOf = (claims) => { const c = best(claims, 'P625')[0]; const v = c && c.mainsnak.datavalue.value; return v ? [Math.round(v.longitude * 1000) / 1000, Math.round(v.latitude * 1000) / 1000] : null; };
const valueDay = (c) => { const t = timeOf(c.mainsnak.datavalue.value); return t ? t.d : null; };

async function main() {
  const langs = wdLangs();
  const wdl = langs.map((l) => l.wd).concat('mul').join('|');   /* 'mul': the label Wikidata writes once for every language */
  const rows = [], dropped = [], stale = [];
  /* ① the article → its item, asked of the English Wikipedia itself (redirects followed: an article renamed since the
     table was written — «Wall Street Crash of 1929» → «Wall Street crash of 1929» — is the same article) */
  const qOf = new Map();
  for (let i = 0; i < SEED.length; i += 50) {
    const chunk = SEED.slice(i, i + 50);
    const j = await getJSON(WP_API, { action: 'query', redirects: '1', prop: 'pageprops', ppprop: 'wikibase_item', titles: chunk.map((s) => s[0]).join('|') });
    const hop = new Map();
    for (const n of ((j.query && j.query.normalized) || []).concat((j.query && j.query.redirects) || [])) hop.set(n.from, n.to);
    const byTitle = new Map(Object.values((j.query && j.query.pages) || {}).filter((p) => p.pageprops && p.pageprops.wikibase_item).map((p) => [p.title, p.pageprops.wikibase_item]));
    for (const s of chunk) { let t = s[0]; for (let k = 0; k < 4 && hop.has(t); k++) t = hop.get(t); if (byTitle.has(t)) qOf.set(s[0], byTitle.get(t)); }
  }
  /* ② the items */
  const ent = new Map();
  const ids = [...new Set(qOf.values())];
  for (let i = 0; i < ids.length; i += 50) {
    const j = await getJSON(API, { action: 'wbgetentities', ids: ids.slice(i, i + 50).join('|'), props: 'claims|labels|descriptions|sitelinks', languages: wdl, sitefilter: 'enwiki|jawiki' });
    for (const [id, e] of Object.entries(j.entities || {})) ent.set(id, e);
  }
  /* ③ the items a place is asked of (P276 location) when the event item has no coordinates of its own */
  const placeOf = new Map();
  const needPlace = [...new Set([...ent.values()].filter((e) => !coordOf(e.claims)).map((e) => { const c = best(e.claims, 'P276')[0]; return c && c.mainsnak.datavalue.value.id; }).filter(Boolean))];
  for (let i = 0; i < needPlace.length; i += 50) {
    const j = await getJSON(API, { action: 'wbgetentities', ids: needPlace.slice(i, i + 50).join('|'), props: 'claims' });
    for (const [id, e] of Object.entries(j.entities || {})) placeOf.set(id, coordOf(e.claims));
  }
  const seen = new Set();
  for (const [title, kind, opt] of SEED) {
    const q = qOf.get(title), e = q && ent.get(q);
    if (!e) { dropped.push({ seed: title, reason: 'the English Wikipedia names no Wikidata item for this article' }); continue; }
    if (seen.has(e.id)) { dropped.push({ seed: title, q: e.id, reason: 'the same item as an earlier row' }); continue; }
    /* the refusals of this row, each checked against what the item states now */
    const refuse = (opt && opt.refuse) || [];
    const hit = new Set();
    const refused = (p, c) => { const k = refuse.findIndex((r) => r.p === p && r.v === valueDay(c)); if (k >= 0) hit.add(k); return k >= 0; };
    const when = dateOf(e.claims, refused);
    refuse.forEach((r, k) => { if (!hit.has(k)) stale.push({ seed: title, q: e.id, p: r.p, v: r.v, note: 'the item no longer states this value — lift the refusal' }); });
    const used = refuse.filter((_, k) => hit.has(k));
    const contradicted = !when && best(e.claims, 'P580').length > 0 && best(e.claims, 'P582').length > 0;
    if (!when) { dropped.push({ seed: title, q: e.id, reason: 'the item states no date to the year by ' + DATE_PROPS.join('/') + (contradicted ? ' that its own end time (P582) does not precede' : '') + (used.length ? ' once ' + used.map((r) => r.p + ' ' + r.v).join(', ') + ' is refused: ' + used.map((r) => r.why).join('; ') : '') }); continue; }
    const pick = (o) => { const out = {}; for (const l of langs) if (o && o[l.wd] && o[l.wd].value) out[l.code] = o[l.wd].value; return out; };
    const name = pick(e.labels), desc = pick(e.descriptions);
    if (!name.en && e.labels && e.labels.mul) name.en = e.labels.mul.value;   /* the multilingual label stands for English where English has none */
    if (!name.en) { dropped.push({ seed: title, q: e.id, reason: 'the item has no English or multilingual label' }); continue; }
    seen.add(e.id);
    let at = coordOf(e.claims), atBy = at ? 'P625' : null;
    if (!at) { const c = best(e.claims, 'P276')[0]; const lq = c && c.mainsnak.datavalue.value.id; if (lq && placeOf.get(lq)) { at = placeOf.get(lq); atBy = 'P276 ' + lq; } }
    const wiki = {}; if (e.sitelinks.enwiki) wiki.en = e.sitelinks.enwiki.title; if (e.sitelinks.jawiki) wiki.jp = e.sitelinks.jawiki.title;
    const row = { q: e.id, kind, d: when.d, prec: when.prec, prop: when.prop };
    if (when.cal === 'julian') row.cal = 'julian';
    if (at) { row.at = at; row.atBy = atBy; }
    row.name = name; if (Object.keys(desc).length) row.desc = desc;
    row.wiki = wiki;
    if (used.length) row.refused = used;
    rows.push(row);
  }
  rows.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : a.q < b.q ? -1 : 1));
  const out = { src: 'Wikidata (CC0 1.0, wikidata.org) — items selected by IntMap; dates, places, names and descriptions as Wikidata states them', retrieved: new Date().toISOString().slice(0, 10), api: API, dateProps: DATE_PROPS, rows, dropped, stale };
  writeFileSync(join(ROOT, SNAPSHOT), JSON.stringify(out, null, 1) + '\n');
  console.log('fetch-world-events: ' + rows.length + ' rows, ' + dropped.length + ' dropped, ' + stale.length + ' stale refusals → ' + SNAPSHOT);
  for (const d of dropped) console.log('  dropped ' + d.seed + (d.q ? ' (' + d.q + ')' : '') + ': ' + d.reason);
  for (const d of stale) console.log('  STALE refusal ' + d.seed + ' ' + d.p + ' ' + d.v + ': ' + d.note);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
