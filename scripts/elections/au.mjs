/* ============================================================================
 *  IntMap · AUSTRALIA — HOUSE OF REPRESENTATIVES, 2004–2025   (#R582)
 * ----------------------------------------------------------------------------
 *  ⚠ AUSTRALIA IS THE ONE COUNTRY IN THIS ROUND WHERE «WHO GOT THE MOST VOTES» AND «WHO WON THE
 *  SEAT» ARE ROUTINELY DIFFERENT PEOPLE. Every division is decided by full preferential voting, so
 *  a candidate can lead the first count and lose on preferences — Melbourne 2010, Indi 2013, every
 *  «teal» seat in 2022. The fill therefore comes from the AEC's members-elected file (who actually
 *  sits), and the bar a reader gets on click comes from the first-preference file (who they voted
 *  for first). Deriving the winner from the largest first-preference count would be quicker and
 *  would hand a dozen seats to the wrong party.
 *
 *  ══ WHERE THE POLYGONS COME FROM, AND WHY NOT FROM THE AEC ═════════════════════════════════════
 *  The AEC publishes its own boundary ZIPs at aec.gov.au/Electorates/files/. Measured 2026-09-09,
 *  the data.gov.au record for that dataset carries licence `other-nc`: non-commercial, and not
 *  transferable — IntMap may not redistribute it. The SAME boundaries reach the public a second
 *  time through Geoscience Australia's Digital Atlas of Australia under CC BY 4.0 («© Commonwealth
 *  of Australia (Australian Electoral Commission)»), and that is what this pack ships.
 *
 *  Digital Atlas only carries the two most recent maps (2022: 151 divisions, 2025: 150). For the
 *  elections before them the boundaries come from the ABS, whose Commonwealth Electoral Division
 *  (CED) geography is published as ArcGIS FeatureServers going back to 2001 with no key and no
 *  token. ⚠ A CED IS AN APPROXIMATION: the ABS rebuilds each division out of whole mesh blocks so
 *  that census counts can be attributed to it, so its edges follow statistical geography rather
 *  than the exact gazetted line. The attribution line on those elections says so.
 *
 *  ⚠ NO YEAR→BOUNDARY TABLE IS WRITTEN OUT ANYWHERE BELOW. Which map an election was fought on is
 *  decided by measurement: a boundary source may serve an election only if it carries a polygon for
 *  every division that election actually elected somebody in, and among the sources that pass, the
 *  AEC-authored ones beat the approximated ones and the nearest vintage beats the further one. That
 *  rule found 2004↔CED2004, 2007↔CED2007, 2010↔CED2011, 2013↔CED2012, 2016↔CED2016, 2019↔CED2018,
 *  2022↔Digital Atlas 2022 and 2025↔Digital Atlas 2025 without being told any of them, and it will
 *  reject rather than guess when the next redistribution lands.
 * ==========================================================================*/
import { simplifyGeoJSON } from '../lib/elections-geo.mjs';
import { createHash } from 'node:crypto';

export const about = 'Australia · House of Representatives 2004–2025 — AEC tally room, Digital Atlas / ABS boundaries';

const TALLY_ROOM = 'https://results.aec.gov.au/';
const ABS_ARCGIS = 'https://geo.abs.gov.au/arcgis/rest/services';
const AGOL_SEARCH = 'https://www.arcgis.com/sharing/rest/search';

/* ⚠ THE TOLERANCE IS ASKED OF THE SERVER, which generalises before it serialises — a full-detail
   request for 150 Australian divisions returns tens of megabytes of coastline that no web zoom can
   show. Measured on the ABS 2016 vintage, 2026-09-09: 0.02° → 0.78 MB, 0.01° → 0.97 MB,
   0.005° → 1.34 MB. 0.01° is about a kilometre here; it holds Tasmania's islands and the
   inner-Sydney divisions and costs eight eras roughly 8 MB, where 0.005° costs eleven for detail
   that is below a pixel until the reader is inside one suburb. Re-measure before changing it. */
const OFFSET_DEG = 0.01;
const PRECISION = 5;   /* ≈1 m; the same figure the Digital Atlas service itself rounds to */

/* ── polling days ──────────────────────────────────────────────────────────────────────────────
   ⚠ THIS IS THE ONE THING THE UPSTREAM DOES NOT CARRY. Every AEC download stamps the date the file
   was GENERATED («Generated:2025-06-16», six weeks after the poll), the tally-room landing pages
   stamp the date the results were declared, and neither is polling day. Australia's polling day is
   not derivable either — it is whatever Saturday the Governor-General's writs name. So the dates
   are recorded here, from the writs as reported by the AEC for each event, and nothing else in this
   file may invent one: an election whose year is not in this table is skipped and named in the
   build log rather than dated by guesswork. */
const POLLING_DAY = {
  2004: '2004-10-09', 2007: '2007-11-24', 2010: '2010-08-21', 2013: '2013-09-07',
  2016: '2016-07-02', 2019: '2019-05-18', 2022: '2022-05-21', 2025: '2025-05-03',
};

/* ── party colours ─────────────────────────────────────────────────────────────────────────────
   ⚠ A PARTY THAT HOLDS GROUND ON THE MAP MUST HAVE A COLOUR SOMEBODY ELSE CHOSE. These are the
   values Wikidata carries as sRGB colour (P465) for the Australian party items, read on 2026-09-09;
   they are the same colours the tally boards and every published seat map use, which is the whole
   point of the rule in elections-schema.mjs. Two entries are not from there and say why.
   ⚠ The keys are the AEC's own party abbreviations, so this table cannot drift from the results
   files, and `build` FAILS if a party wins a division without appearing here — a new party winning
   a seat must be given a real colour, not a generated one. */
const PARTY_COLOUR = {
  alp: '#f00011',   /* Australian Labor Party — Wikidata P465 */
  lp: '#080cab',    /* Liberal Party of Australia — Wikidata P465 */
  np: '#006644',    /* National Party of Australia — Wikidata P465 */
  lnp: '#1456f1',   /* Liberal National Party of Queensland — Wikidata P465 */
  clp: '#f8981d',   /* Country Liberal Party — Wikidata P465 */
  grn: '#10c25b',   /* Australian Greens — Wikidata P465 */
  on: '#ff4900',    /* Pauline Hanson's One Nation — Wikidata P465 */
  kap: '#b50204',   /* Katter's Australian Party — Wikidata P465 */
  xen: '#ff6300',   /* Centre Alliance / Nick Xenophon Team — Wikidata P465 */
  /* Wikidata carries no P465 for Palmer United, which held Fairfax 2013–2016. Yellow is the colour
     on its registered logo and on every 2013 tally board; if Wikidata ever records one, take it. */
  pup: '#ffed00',
  /* ⚠ NOT A PARTY. An independent has no party colour, and inventing one would say they belong to
     something. Neutral grey, the same grey #R243 paints a state that did not vote. */
  ind: '#8e8e93',
};

/* ⚠ THE COALITION IS NOT IN THE RESULTS FILES AS A FIELD, BUT IT IS IN THEM AS A COLUMN HEADING:
   every two-party-preferred download since 2004 counts «Liberal/National Coalition Votes» against
   «Australian Labor Party Votes», which is the AEC's own statement of who is in it. `bloc` groups
   the bars; it never merges a fill, because the seat belongs to the party that won it. */
const COALITION = new Set(['lp', 'np', 'lnp', 'lnq', 'clp']);

/* ══ small parsers ═════════════════════════════════════════════════════════════════════════════ */

/** RFC4180 CSV. ⚠ Needed rather than split(','): party names contain commas («Shooters, Fishers
 *  and Farmers Party») and the AEC quotes them. */
function parseCsv(text) {
  const rows = [];
  let field = '', row = [], quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') { field += c; continue; }
      if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** ⚠ THE FIRST LINE OF AN AEC DOWNLOAD IS NOT THE HEADER. It is a provenance banner («2025 Federal
 *  Election House of Representatives Members Elected [Event:31496 …]») and the column names are on
 *  line 2. Reading line 1 as the header produces one column called the whole sentence and silently
 *  loses every field. Returns rows as objects keyed by the real column names. */
function aecTable(text) {
  const rows = parseCsv(text).filter(r => r.length > 1 || (r[0] || '').length);
  const head = rows[1];
  return rows.slice(2).filter(r => r.length >= head.length).map(r => {
    const o = {};
    for (let i = 0; i < head.length; i++) o[head[i]] = r[i];
    return o;
  });
}

const num = (s) => {
  const v = Number(String(s == null ? '' : s).replace(/,/g, ''));
  return Number.isFinite(v) && String(s).trim() !== '' ? v : null;
};
/** Division names are compared, never displayed, through this: the AEC writes «O'Connor» and
 *  «Eden-Monaro», the ABS writes the same names, and only punctuation and case differ. */
const nameKey = (s) => String(s || '').normalize('NFKD').replace(/[^A-Za-z]/g, '').toLowerCase();

/* ══ upstream discovery ════════════════════════════════════════════════════════════════════════ */

/** Every full federal election the tally-room archive still serves, read off the archive index so
 *  that the next one appears here without this file being edited. ⚠ The archive puts the event id
 *  and the site layout in the href — 2004 sits under `/12246/results/`, everything since under
 *  `/<id>/Website/` — so both are taken from the link rather than assumed. */
async function discoverEvents(ctx) {
  const html = await ctx.get(TALLY_ROOM, { text: true });
  const out = [];
  const re = /<a [^>]*href="(\d+)\/([A-Za-z]+)\/[^"]*"[^>]*>\s*(\d{4}) federal election\s*<\/a>/g;
  for (const m of html.matchAll(re)) {
    if (out.some(e => e.id === m[1])) continue;   /* the page repeats each event in the FTP list */
    out.push({ id: m[1], seg: m[2], year: Number(m[3]) });
  }
  return out.sort((a, b) => b.year - a.year);
}

/** The three downloads this pack reads, if the event has them. ⚠ 2001 is served as a frameset with
 *  no Downloads directory at all (measured: 404 on all three), so an event that cannot answer is
 *  reported and skipped rather than half-built. */
async function eventTables(ctx, ev) {
  const want = ['HouseMembersElectedDownload', 'HouseFirstPrefsByCandidateByVoteTypeDownload', 'HouseTppByDivisionDownload'];
  const got = [];
  for (const w of want) {
    try {
      got.push(aecTable(await ctx.get(`${TALLY_ROOM}${ev.id}/${ev.seg}/Downloads/${w}-${ev.id}.csv`, { text: true })));
    } catch { return null; }
  }
  return { elected: got[0], firstPrefs: got[1], tpp: got[2] };
}

/** Boundary sources, found rather than listed.
 *  · Digital Atlas — the AEC's own divisions, CC BY 4.0, one service per election it was drawn for.
 *  · ABS — one CED FeatureServer per statistical vintage. The folder list is read from the server,
 *    so a vintage the ABS publishes later is picked up; the ones that answer «Token Required» are
 *    simply not offered publicly and drop out here. */
async function discoverBoundarySources(ctx) {
  const out = [];

  /* ⚠ THE VINTAGE IS IN THE CATALOGUE ENTRY, NOT IN THE SERVICE. The 2025 map is served as
     `Federal_Electoral_Boundaries_2025` but the 2022 map is served as `Federal_Electoral_Boundaries`
     with no year anywhere in the service, the layer or the field list (measured). Only the ArcGIS
     Online item that publishes it is titled «Federal Electoral Boundaries (2022)», so the item
     search is what says which election a Digital Atlas layer belongs to — and it is also what turns
     up the next one without this file being edited. */
  const catalogue = await ctx.get(AGOL_SEARCH + '?f=json&num=100&q=' + encodeURIComponent(
    'owner:aus_digitalatlas AND type:"Feature Service" AND title:"Federal Electoral"'), { json: true });
  for (const item of catalogue.results || []) {
    const year = Number((String(item.title).match(/(\d{4})/) || [])[1]);
    if (!year || !item.url) continue;
    const base = item.url.replace(/\/FeatureServer\/?$/i, '/FeatureServer');
    const meta = await ctx.get(`${base}?f=json`, { json: true });
    for (const layer of meta.layers || []) {
      const info = await ctx.get(`${base}/${layer.id}?f=json`, { json: true });
      const field = (info.fields || []).find(f => /^elect_div$/i.test(f.name));
      if (!field) continue;
      out.push({
        id: 'da' + year, year, exact: true, nameField: field.name,
        query: `${base}/${layer.id}/query`,
        src: 'Boundaries: Digital Atlas of Australia (Geoscience Australia), «' + item.title +
          '» — © Commonwealth of Australia (Australian Electoral Commission)',
        lic: 'CC BY 4.0',
      });
    }
  }

  const root = await ctx.get(`${ABS_ARCGIS}?f=json`, { json: true });
  for (const folder of root.folders || []) {
    const year = Number((folder.match(/(\d{4})$/) || [])[1]);
    if (!year) continue;
    let meta;
    try { meta = await ctx.get(`${ABS_ARCGIS}/${folder}/CED/FeatureServer?f=json`, { json: true }); } catch { continue; }
    if (meta.error || !(meta.layers || []).length) continue;   /* not published without a token */
    const layer = (meta.layers || []).find(l => l.name === 'CED');
    if (!layer) continue;
    const info = await ctx.get(`${ABS_ARCGIS}/${folder}/CED/FeatureServer/${layer.id}?f=json`, { json: true });
    /* the name field is `ced_name`, `ced04_name`, `ced_name_2016`, … — found, not spelled out */
    const field = (info.fields || []).find(f => /^ced.*name/i.test(f.name));
    if (!field) continue;
    out.push({
      id: 'abs' + year, year, exact: false, nameField: field.name,
      query: `${ABS_ARCGIS}/${folder}/CED/FeatureServer/${layer.id}/query`,
      src: 'Boundaries: ABS Commonwealth Electoral Divisions (' + folder + '), which approximate the AEC divisions to whole ABS mesh blocks',
      lic: 'CC BY 4.0',
    });
  }
  return out;
}

/** The district names a source carries, asked for without geometry — this is what the match below
 *  is decided on, and it costs one small request per source instead of a megabyte.
 *  ⚠ `f=` COMES FIRST IN BOTH QUERIES ON PURPOSE. The build cache keys on the first 180 base64
 *  characters of the URL — about 135 bytes — and an ArcGIS query URL has spent most of that on the
 *  service path before the parameters start. With the parameters in their natural order the names
 *  request and the geometry request below hash to the SAME key, and the second one is served the
 *  first one's answer: 150 features with attributes and no geometry, which fails as «properties is
 *  undefined» several steps later instead of where the mistake is. */
async function sourceNames(ctx, s) {
  const j = await ctx.get(`${s.query}?f=json&returnGeometry=false&resultRecordCount=4000` +
    `&where=1%3D1&outFields=${encodeURIComponent(s.nameField)}`, { json: true });
  return (j.features || []).map(f => f.attributes[s.nameField]).filter(Boolean);
}

async function sourceGeometry(ctx, s) {
  return ctx.get(`${s.query}?f=geojson&maxAllowableOffset=${OFFSET_DEG}&geometryPrecision=${PRECISION}` +
    `&outSR=4326&resultRecordCount=4000&where=1%3D1&outFields=${encodeURIComponent(s.nameField)}`,
    { json: true });
}

/* ══ parties ═══════════════════════════════════════════════════════════════════════════════════
   ⚠ THE AEC CHANGES A PARTY'S ABBREVIATION WITHOUT CHANGING THE PARTY. Queensland's LNP is `LNP`
   in some events and `LNQ` in others; One Nation is `ON` and `HAN`; the Democrats are `DEM` and
   `AUD`. Keying on the abbreviation alone would put one party in the table twice under two ids and
   split its history; merging by hand would be a list of the pairs somebody happened to notice.
   So two abbreviations are the same party when they publish an IDENTICAL registered name AND never
   stand in the same election — the second half is what stops «Liberal» in two states, or a splinter
   that reuses a name, from being folded into its rival. */
function groupParties(perElection) {
  const namesOf = new Map();       /* ab → Set(normalised name) */
  const yearsOf = new Map();       /* ab → Set(election year)   */
  const label = new Map();         /* ab → Map(name → last year seen) */
  for (const { year, parties } of perElection) {
    for (const [ab, name] of parties) {
      if (!namesOf.has(ab)) { namesOf.set(ab, new Set()); yearsOf.set(ab, new Set()); label.set(ab, new Map()); }
      namesOf.get(ab).add(nameKey(name));
      yearsOf.get(ab).add(year);
      const seen = label.get(ab).get(name) || 0;
      if (year > seen) label.get(ab).set(name, year);
    }
  }
  const abs = [...namesOf.keys()];
  const parent = new Map(abs.map(a => [a, a]));
  const find = (a) => (parent.get(a) === a ? a : (parent.set(a, find(parent.get(a))), parent.get(a)));
  for (let i = 0; i < abs.length; i++) {
    for (let j = i + 1; j < abs.length; j++) {
      const a = abs[i], b = abs[j];
      const share = [...namesOf.get(a)].some(n => namesOf.get(b).has(n));
      if (!share) continue;
      const overlap = [...yearsOf.get(a)].some(y => yearsOf.get(b).has(y));
      if (overlap) continue;
      parent.set(find(a), find(b));
    }
  }
  /* the group's id is its most recent abbreviation, and its name is the most recent registered
     name, so the reader sees what the party last called itself */
  const members = new Map();
  for (const a of abs) {
    const r = find(a);
    if (!members.has(r)) members.set(r, []);
    members.get(r).push(a);
  }
  const idOf = new Map(), nameOf = new Map();
  for (const [, group] of members) {
    let best = group[0], bestYear = -1, bestName = '', bestNameYear = -1;
    for (const a of group) {
      const last = Math.max(...yearsOf.get(a));
      if (last > bestYear) { bestYear = last; best = a; }
      /* ⚠ the AEC writes both «LNP» and «Liberal National Party of Queensland» in the SAME event.
         Latest first, and among the latest the longest — the abbreviation is never the name. */
      for (const [n, y] of label.get(a)) {
        if (!n) continue;
        if (y > bestNameYear || (y === bestNameYear && n.length > bestName.length)) { bestNameYear = y; bestName = n; }
      }
    }
    const id = best.toLowerCase();
    for (const a of group) { idOf.set(a, id); nameOf.set(a, bestName || best); }
  }
  return { idOf, nameOf: (ab) => nameOf.get(ab) };
}

/** A colour for a party nobody colours. ⚠ It is deterministic and it is deliberately unsaturated:
 *  it exists so that eleven candidates in a bar chart are told apart, and it must not look like the
 *  brand of a party that has one. Parties that win ground get a real colour or the build fails. */
function derivedColour(id) {
  const h = createHash('sha256').update(id).digest();
  const hue = (h[0] * 360) / 256, sat = 0.30 + (h[1] / 256) * 0.16, lig = 0.46 + (h[2] / 256) * 0.14;
  const c = (1 - Math.abs(2 * lig - 1)) * sat, x = c * (1 - Math.abs(((hue / 60) % 2) - 1)), m = lig - c / 2;
  const seg = Math.floor(hue / 60) % 6;
  const [r, g, b] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][seg];
  return '#' + [r, g, b].map(v => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('');
}

/* ══ build ═════════════════════════════════════════════════════════════════════════════════════ */

/* ── the note the reader reads ─────────────────────────────────────────────────────────────────
   ⚠ A NOTE IS A NAME TABLE, NOT A STRING: it is prose shown in the legend, so it obeys AGENTS.md
   §3.5 and exists in all nine languages. `src` and `lic` do not — an attribution line is the
   publisher's own wording and a licence is a legal condition, and translating either misquotes it.
   ⚠ AND EACH LANGUAGE BUILDS ITS OWN SENTENCE. The counts do not fall in the same place in a
   Japanese, Korean or German clause as in an English one, so this is nine sentences that share a
   number — not one English sentence with the number swapped out.
   ⚠ BOTH `jp` AND `ja`: 'jp' is the app's own code for Japanese (js/lang-registry.js) and the key
   js/elections.js looks up in a name table; 'ja' is the BCP-47 tag the rest of this data uses. */
function noteFor(divisions) {
  const jp = divisions + ' の選挙区すべてが 1 名を選び、名簿から選ばれる議員はいません。色は選挙管理委員会（AEC）が' +
    '当選と宣言した議員の政党で、完全優先順位付投票では第一順位票が最も多かった候補とは限りません。' +
    '選挙区をクリックすると出る得票は第一順位票です。';
  return {
    en: 'Each of the ' + divisions + ' divisions elects one member and nobody is elected from a list. ' +
      'The colour is the member the Australian Electoral Commission declared elected, which under full ' +
      'preferential voting is not always the candidate with the most first preferences; the votes ' +
      'shown for a division are first preferences.',
    ja: jp, jp,
    de: 'Jeder der ' + divisions + ' Wahlkreise wählt ein Mitglied, und niemand wird über eine Liste ' +
      'gewählt. Die Farbe zeigt das von der Australian Electoral Commission für gewählt erklärte ' +
      'Mitglied — bei voller Präferenzwahl nicht immer die Kandidatin oder der Kandidat mit den ' +
      'meisten Erstpräferenzen; die zu einem Wahlkreis angezeigten Stimmen sind Erstpräferenzen.',
    ru: 'Каждый из ' + divisions + ' округов избирает одного члена, и никто не проходит по списку. ' +
      'Цвет — тот, кого Австралийская избирательная комиссия объявила избранным: при полном ' +
      'преференциальном голосовании это не всегда кандидат с наибольшим числом первых преференций. ' +
      'Голоса, показанные по округу, — это первые преференции.',
    es: 'Cada una de las ' + divisions + ' divisiones elige a un miembro y nadie es elegido por lista. ' +
      'El color corresponde al miembro que la Comisión Electoral Australiana declaró electo, que con ' +
      'el voto preferencial completo no siempre es el candidato con más primeras preferencias; los ' +
      'votos que se muestran de una división son primeras preferencias.',
    fr: 'Chacune des ' + divisions + ' circonscriptions élit un membre et personne n’est élu sur une ' +
      'liste. La couleur est celle du membre déclaré élu par la Commission électorale australienne, ' +
      'qui, au scrutin préférentiel intégral, n’est pas toujours le candidat ayant le plus de ' +
      'premières préférences ; les voix affichées pour une circonscription sont les premières préférences.',
    ko: divisions + '개 선거구가 각각 1명을 선출하며 명부로 선출되는 의원은 없습니다. 색은 호주 선거관리위원회가 ' +
      '당선을 선언한 의원의 정당이며, 완전 선호투표에서는 1순위 득표가 가장 많은 후보가 아닐 수도 있습니다. ' +
      '선거구에 표시되는 득표는 1순위 표입니다.',
    zh: divisions + ' 個選區各選出一名議員，沒有任何議員由名單產生。顏色代表澳洲選舉委員會宣布當選的議員，' +
      '在完全偏好投票制下未必是第一偏好票最多的候選人；選區顯示的票數是第一偏好票。',
    'zh-hans': divisions + ' 个选区各选出一名议员，没有任何议员由名单产生。颜色代表澳大利亚选举委员会宣布当选的' +
      '议员，在完全偏好投票制下未必是第一偏好票最多的候选人；选区显示的票数是第一偏好票。',
  };
}

export async function build(ctx) {
  const events = await discoverEvents(ctx);
  const skipped = [];

  /* ── read every event that still has downloads ───────────────────────────────────────────── */
  const polls = [];
  for (const ev of events) {
    const t = await eventTables(ctx, ev);
    if (!t) { skipped.push(ev.year + ': the archive serves no CSV downloads for this event'); continue; }
    if (!POLLING_DAY[ev.year]) { skipped.push(ev.year + ': no polling day recorded'); continue; }
    polls.push({ ...ev, ...t });
  }
  if (!polls.length) throw new Error('au: the AEC tally room served no usable election');

  /* ── parties, over every election at once ────────────────────────────────────────────────── */
  const perElection = polls.map(p => ({
    year: p.year,
    parties: [...p.firstPrefs, ...p.elected]
      .filter(r => r.PartyAb)
      .map(r => [r.PartyAb, r.PartyNm || r.PartyAb]),
  }));
  const { idOf, nameOf } = groupParties(perElection);

  const parties = {};
  const usedParty = new Set();
  const partyId = (ab) => {
    if (!ab || !idOf.has(ab)) return null;
    const id = 'au:' + idOf.get(ab);
    if (!parties[id]) {
      const slug = idOf.get(ab);
      parties[id] = {
        n: { en: nameOf(ab) },
        col: PARTY_COLOUR[slug] || derivedColour(id),
        ...(COALITION.has(slug) ? { bloc: 'coalition' } : {}),
      };
    }
    return id;
  };

  /* ── which map was each election fought on ───────────────────────────────────────────────── */
  const sources = await discoverBoundarySources(ctx);
  const sourceIndex = new Map();
  for (const s of sources) sourceIndex.set(s.id, { s, names: await sourceNames(ctx, s) });

  const chosen = new Map();   /* election year → source */
  for (const p of polls) {
    const need = new Set(p.elected.map(r => nameKey(r.DivisionNm)));
    const fits = [];
    for (const { s, names } of sourceIndex.values()) {
      const have = new Set(names.map(nameKey));
      if ([...need].some(k => !have.has(k))) continue;
      fits.push({ s, extra: names.length - need.size });
    }
    if (!fits.length) { skipped.push(p.year + ': no published boundary set carries all ' + need.size + ' divisions'); continue; }
    /* the AEC's own boundaries beat an ABS approximation; then the nearest vintage; then the one
       carrying the fewest polygons that are not divisions at all */
    fits.sort((a, b) =>
      (b.s.exact - a.s.exact) ||
      (Math.abs(a.s.year - p.year) - Math.abs(b.s.year - p.year)) ||
      (a.s.year - b.s.year) || (a.extra - b.extra));
    chosen.set(p.year, fits[0].s);
  }

  /* ── results, per election ───────────────────────────────────────────────────────────────── */
  const geo = {}, res = {}, elections = [];
  const geoByHash = new Map();
  const allCentroids = [];

  for (const p of polls) {
    const source = chosen.get(p.year);
    if (!source) continue;

    /* the AEC's DivisionID is the code the whole pack joins on: it is stable across events (Adelaide
       is 179 in 2004 and in 2025), so a results file and a boundary era share it without either
       side carrying the other's spelling */
    const codeOf = new Map();     /* name key → DivisionID */
    const stateOf = new Map(), labelOf = new Map();
    for (const r of p.elected) {
      const k = nameKey(r.DivisionNm);
      codeOf.set(k, String(r.DivisionID));
      labelOf.set(k, r.DivisionNm);
    }
    for (const r of p.firstPrefs) {
      const k = nameKey(r.DivisionNm);
      if (r.StateAb) stateOf.set(k, r.StateAb);   /* ⚠ the boundary layers carry no state column */
    }

    const d = {};
    for (const r of p.elected) {
      const id = partyId(r.PartyAb);
      if (id) usedParty.add(id);
      d[codeOf.get(nameKey(r.DivisionNm))] = { w: id || undefined, c: [], t: 0 };
    }

    /* first preferences. ⚠ «Informal» is a row in this file and it is not a candidate — it is the
       ballots that could not be counted for anyone. It belongs in the division total and nowhere
       else; listing it as a candidate would put a party-less bar beside real people. */
    for (const r of p.firstPrefs) {
      const row = d[codeOf.get(nameKey(r.DivisionNm))];
      if (!row) continue;
      const votes = num(r.TotalVotes);
      if (votes != null) row.t += votes;
      if (!r.PartyAb && /^informal$/i.test(String(r.Surname || r.PartyNm || ''))) continue;
      const pid = partyId(r.PartyAb);
      if (pid) usedParty.add(pid);
      const given = String(r.GivenNm || '').trim(), surname = String(r.Surname || '').trim();
      row.c.push({
        n: (given ? given + ' ' : '') + surname,
        ...(pid ? { p: pid } : {}),
        ...(votes != null ? { v: votes } : {}),
      });
    }

    /* two-party-preferred. ⚠ This is a BLOC number, not a party number: the AEC counts «Liberal/
       National Coalition» against «Australian Labor Party» whichever party actually stood, and the
       column order changes between events (Coalition first in 2004, Labor first in 2010), so the
       columns are found by their headings. */
    for (const r of p.tpp) {
      const row = d[codeOf.get(nameKey(r.DivisionNm))];
      if (!row) continue;
      const coa = num(r['Liberal/National Coalition Percentage']);
      const alp = num(r['Australian Labor Party Percentage']);
      if (coa != null && alp != null) row.tpp = { coalition: coa, alp };
    }

    for (const row of Object.values(d)) {
      if (!row.c.length) delete row.c; else row.c.sort((a, b) => (b.v || 0) - (a.v || 0));
      if (!row.t) delete row.t;         /* ⚠ an absent count is absent, never a zero */
      if (row.w === undefined) delete row.w;
    }

    /* ── the national bar ───────────────────────────────────────────────────────────────────
       The House has no list seats at all, so for once the chamber IS the map: every one of its
       members sits for a division. `pct` is the national first-preference share, which is the
       number the reader has heard on the night and is not the same shape as the seat count. */
    const seats = new Map(), votes = new Map();
    let formal = 0;
    for (const r of p.elected) {
      const id = partyId(r.PartyAb);
      if (id) seats.set(id, (seats.get(id) || 0) + 1);
    }
    for (const r of p.firstPrefs) {
      if (!r.PartyAb && /^informal$/i.test(String(r.Surname || r.PartyNm || ''))) continue;
      const id = partyId(r.PartyAb);
      const v = num(r.TotalVotes) || 0;
      formal += v;
      if (id) votes.set(id, (votes.get(id) || 0) + v);
    }
    const n = [...new Set([...seats.keys(), ...votes.keys()])].map(id => ({
      p: id,
      seats: seats.get(id) || 0,
      dseats: seats.get(id) || 0,
      ...(formal ? { pct: Math.round((votes.get(id) || 0) / formal * 1e4) / 100 } : {}),
    })).sort((a, b) => b.seats - a.seats || (b.pct || 0) - (a.pct || 0));

    /* ── the polygons ───────────────────────────────────────────────────────────────────────── */
    const raw = await sourceGeometry(ctx, source);
    const features = [];
    if (!raw.features || raw.features.some(f => !f.properties)) {
      throw new Error('au: ' + source.id + ' answered without feature properties');
    }
    for (const f of raw.features) {
      const k = nameKey(f.properties[source.nameField]);
      const cd = codeOf.get(k);
      /* ⚠ An ABS vintage also carries «Migratory — Offshore — Shipping (NSW)» and «No usual
         address (Vic.)»: real records with a code, a name and NO GEOMETRY. They are not divisions,
         nobody was elected in them, and they drop out here by not being named in the results. */
      if (!cd) continue;
      if (!f.geometry) throw new Error('au: ' + source.id + ' has no geometry for division ' + k);
      features.push({
        type: 'Feature',
        properties: { cd, n: { en: labelOf.get(k), native: labelOf.get(k) }, st: stateOf.get(k) || undefined },
        geometry: f.geometry,
      });
    }
    const fc = simplifyGeoJSON({ type: 'FeatureCollection', features }, { tolerance: 0, decimals: PRECISION });

    /* ⚠ TWO ELECTIONS SHARE A FILE ONLY WHEN THEY ARE THE SAME MAP, and that is decided by the
       bytes, not by the vintage label: the ABS republishes an unchanged CED every year, so two
       consecutive vintages are often the same geometry under two names. */
    const hash = createHash('sha256').update(JSON.stringify(fc)).digest('hex').slice(0, 12);
    let geoId = geoByHash.get(hash);
    if (!geoId) {
      geoId = 'au-' + source.id + '.geo.json';
      geoByHash.set(hash, geoId);
      geo[geoId] = fc;
    }

    /* ⚠ THE FIRST RING OF A MULTIPOLYGON IS NOT THE DIVISION. Lingiari's rings include the Cocos
       Islands and Christmas Island, and taking whichever ring the server happened to serialise
       first put the «centroid» of that division at 96°E — which then stretched the home view below
       across 76° of empty Indian Ocean. The division's place is its LARGEST ring. */
    for (const f of fc.features) {
      const rings = f.geometry.type === 'Polygon' ? [f.geometry.coordinates[0]] : f.geometry.coordinates.map(p => p[0]);
      let best = rings[0], bestArea = -1;
      for (const r of rings) {
        let a = 0;
        for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1];
        if (Math.abs(a) > bestArea) { bestArea = Math.abs(a); best = r; }
      }
      let x = 0, y = 0;
      for (const pt of best) { x += pt[0]; y += pt[1]; }
      allCentroids.push([x / best.length, y / best.length]);
    }

    const resId = 'au-hr-' + p.year + '.res.json';
    res[resId] = { d, n };
    elections.push({
      id: 'au-hr-' + p.year,
      polity: 'au',
      body: { en: 'House of Representatives', native: 'House of Representatives' },
      date: POLLING_DAY[p.year],
      y: p.year,
      geo: geoId,
      res: resId,
      seatsTotal: Object.keys(d).length,
      districtSeats: Object.keys(d).length,
      listSeats: 0,        /* ⚠ the House elects nobody from a list; every member holds ground */
      note: noteFor(Object.keys(d).length),
      src: 'Results: Australian Electoral Commission tally room (event ' + p.id + '). ' + source.src,
      lic: 'CC BY 4.0 (AEC results and ' + (source.exact ? 'Digital Atlas boundaries' : 'ABS boundaries') + ')',
    });
  }

  /* ⚠ EVERY PARTY THAT HOLDS A DIVISION MUST HAVE A COLOUR SOMEBODY ELSE CHOSE. A generated hue on
     a fill would look exactly as authoritative as a real one and would be a claim about a party. */
  const uncoloured = [];
  for (const e of elections) {
    for (const row of Object.values(res[e.res].d)) {
      if (row.w && !PARTY_COLOUR[row.w.slice(3)]) uncoloured.push(row.w);
    }
  }
  if (uncoloured.length) {
    throw new Error('au: ' + [...new Set(uncoloured)].join(', ') + ' won a division but PARTY_COLOUR has no colour for it');
  }

  /* keep only the parties something in the pack actually refers to */
  for (const id of Object.keys(parties)) if (!usedParty.has(id)) delete parties[id];

  /* ── the home view ──────────────────────────────────────────────────────────────────────────
     ⚠ A BOX ROUND THE DIVISIONS THEMSELVES IS MOSTLY OCEAN. Lingiari carries the Cocos Islands at
     96°E and Bean carries Norfolk Island at 168°E, so the geometric extent is 72° wide and opens
     on empty sea. The centroids are all on the continent and in Tasmania, so the home view is their
     extent with a margin — derived from the polygons that were actually shipped, not typed in. */
  const lons = allCentroids.map(c => c[0]), lats = allCentroids.map(c => c[1]);
  const PAD = 2.5;
  const home = [
    [Math.min(...lons) - PAD, Math.min(...lats) - PAD],
    [Math.max(...lons) + PAD, Math.max(...lats) + PAD],
  ];

  if (skipped.length) console.log('    au · not built: ' + skipped.join(' · '));

  return {
    polities: [{
      id: 'au',
      n: {
        en: 'Australia', native: 'Australia', ja: 'オーストラリア', de: 'Australien',
        ru: 'Австралия', es: 'Australia', fr: 'Australie',
        'zh-Hant': '澳大利亞', 'zh-Hans': '澳大利亚', ko: '오스트레일리아',
      },
      home,
    }],
    parties,
    elections: elections.sort((a, b) => b.y - a.y),
    geo,
    res,
  };
}
