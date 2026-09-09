/* ============================================================================
 *  IntMap · UNITED KINGDOM — THE HOUSE OF COMMONS, 2010–2024   (#R584)
 * ----------------------------------------------------------------------------
 *  Five general elections fought on two maps: the boundaries that stood from 2010 to 2019, and the
 *  2023 Review boundaries that replaced all 650 for 2024. That is the whole reason `geo` belongs to
 *  the election rather than to the country — see the header of scripts/lib/elections-schema.mjs.
 *
 *  ══ WHY IT STOPS AT 2010 ════════════════════════════════════════════════════════════════════
 *  Not because the results run out — Parliament's own dataset holds boundary sets back to 1918 —
 *  but because the SHAPES do. Measured 2026-09-09 against the entire service list of the ONS Open
 *  Geography Portal (services1.arcgis.com/ESMARspQHYMw9BZ9): the earliest Westminster constituency
 *  boundary published anywhere on it is «December 2016», and December 2016 / 2017 / 2019 / 2021 /
 *  2022 are all the SAME 650 seats — the ones introduced in 2010. There is no openly licensed file
 *  for the boundaries used in 1997–2005, or for anything before them. Painting the 2001 result onto
 *  the 2010 map would hand seats to the wrong ground, which is the one thing this layer must never
 *  do, so those elections are simply not here.
 *  ⚠ Parliament also publishes NOTIONAL results — what 2005 would have been on the 2010 boundaries,
 *  what 2019 would have been on the 2024 ones. They are estimates, not results, and a reader cannot
 *  tell an estimate from a count once it is a coloured polygon, so they are excluded here
 *  (`is_notional = 0` below is what excludes them, and it is checked, not assumed).
 *
 *  ══ WHERE THE RESULTS COME FROM, AND WHY NOT FROM THE CSVs ══════════════════════════════════
 *  The House of Commons Library's «results by candidate» CSVs are the obvious source and this pack
 *  was first written against them. They cannot be fetched: researchbriefings.files.parliament.uk
 *  sits behind a bot filter that refuses Node's HTTP client with 403 whatever headers it sends —
 *  measured 2026-09-09, the same URL, same User-Agent string, returns 200 to curl and 403 to
 *  `fetch()`, so it is the TLS/HTTP fingerprint being judged and not anything a header can fix.
 *  Parliament publishes the same facts as a SQLite database — the one behind
 *  electionresults.parliament.uk — on raw.githubusercontent.com, which is reachable, and it is a
 *  better source anyway: it names the winner explicitly instead of leaving it to be inferred, it
 *  distinguishes a joint Labour and Co-operative candidacy from two candidacies, and it carries the
 *  Library briefing URL for each election so the attribution line is data rather than a constant.
 *
 *      node scripts/elections/_selftest.mjs uk
 * ==========================================================================*/
import { DatabaseSync } from 'node:sqlite';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { simplifyGeoJSON } from '../lib/elections-geo.mjs';

export const about =
  'House of Commons general elections 2010–2024 (five), on the two boundary eras that exist as open ' +
  'data: the seats introduced in 2010 (2010/2015/2017/2019) and the 2023 Review seats (2024). ' +
  'Boundaries from the ONS Open Geography Portal, results from Parliament\'s own psephology database ' +
  '(electionresults.parliament.uk). 1997–2005 are absent because no openly licensed pre-2010 ' +
  'constituency boundary is published; Parliament\'s notional 2005 and 2019 results are excluded ' +
  'because they are estimates rather than counts.';

const ONS = 'https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/';
/** The database behind electionresults.parliament.uk, as published for Datasette Lite. */
const DB_URL = 'https://raw.githubusercontent.com/ukparliament/psephology-datasette/main/psephology.db';

/* ── the two boundary eras ─────────────────────────────────────────────────────────────────────
   `service` is an ONS Open Geography Portal FeatureServer name, and its suffix says how much detail
   the publisher already threw away: BFC/BFE keep everything, BGC is generalised to 20 m, BSC to
   200 m, BUC to 500 m. BGC is taken because the reader asked for high resolution and anything
   coarser is a loss this build could not undo; it arrives at 21 MB and is simplified here (see
   TOLERANCE) rather than downloaded pre-broken.
   ⚠ WHICH ELECTION BELONGS TO WHICH ERA IS NOT WRITTEN DOWN — IT IS MEASURED. An era is matched to
   an election when the set of constituency codes is exactly equal (see chooseEra), so a boundary
   change nobody told this file about cannot quietly put a result on the wrong ground. It also means
   the file names below are the only thing here that is a name rather than a fact: the 2010-era
   geometry is published by ONS as «Dec 2022» because that is the last year it re-published those
   650 seats before they were abolished. */
const ERAS = [
  { id: 'uk-2010', service: 'Westminster_Parliamentary_Constituencies_Dec_2022_UK_BGC',
    note: 'the 650 constituencies in force from 2010 to 2019' },
  { id: 'uk-2024', service: 'Westminster_Parliamentary_Constituencies_July_2024_Boundaries_UK_BGC',
    note: 'the 650 constituencies of the 2023 Review, in force from 2024' },
];

/* ⚠ TOLERANCE IS IN DEGREES AND THIS ONE IS THE UNITED KINGDOM'S. 0.001° is 111 m north–south and
   about 65 m east–west at 54° N — under half a pixel at the zoom where all 650 seats are on screen,
   and still finer than the 200 m file ONS offers as its next size down. Measured 2026-09-09 on the
   2024 file: 21.0 MB raw → 2.8 MB at this tolerance, against 1.5 MB at 0.002 (visibly angular
   coastline) and 5.0 MB at 0.0005 (no visible gain). It stops being right if the layer ever draws a
   single constituency full-screen, and the answer then is a second, finer file — not a coarser one
   everywhere. */
const TOLERANCE = 0.001;
const DECIMALS = 4;   /* 1e-4° ≈ 11 m — an order finer than the tolerance, so rounding never leads */

/* ── colours ───────────────────────────────────────────────────────────────────────────────────
   ⚠ THIS TABLE IS COLOURS AND JAPANESE NAMES, NOT A LIST OF PARTIES. Which parties existed, what
   they were called and which of them won anything are all read out of Parliament's database. The
   only thing no database holds is what colour a British election-night broadcast paints them, so
   that is all this holds. A party that qualifies for the table without a colour FAILS THE BUILD
   (see collectParties) rather than being painted some default nobody chose.
   `en` appears only for the two rows that are not parties at all: Parliament records «independent»
   and «the Speaker seeking re-election» as properties of a candidacy, not as parties, so somebody
   has to give those two booleans a name and it may as well be visible here. */
const COLOUR = {
  Con:   { col: '#0087dc', ja: '保守党' },
  Lab:   { col: '#e4003b', ja: '労働党' },
  LD:    { col: '#faa61a', ja: '自由民主党' },
  SNP:   { col: '#fdf38e', ja: 'スコットランド国民党' },
  PC:    { col: '#005b54', ja: 'プライド・カムリ' },
  Green: { col: '#528d6b', ja: '緑の党' },
  RUK:   { col: '#12b6cf', ja: 'リフォームUK' },
  BRX:   { col: '#12b6cf', ja: 'ブレグジット党' },   /* the same party's earlier name, so the same colour */
  UKIP:  { col: '#70147a', ja: 'イギリス独立党' },
  BNP:   { col: '#2e3b1f' },
  DUP:   { col: '#d46a4c', ja: '民主統一党' },
  UUP:   { col: '#48a5ee', ja: 'アルスター統一党' },
  TUV:   { col: '#0c3a6a', ja: '伝統的統一主義者の声' },
  SF:    { col: '#326760', ja: 'シン・フェイン党' },
  SDLP:  { col: '#2aa82c', ja: '社会民主労働党' },
  APNI:  { col: '#f6cb2f', ja: '同盟党' },
  Ind:   { col: '#8a8f98', en: 'Independent', ja: '無所属' },
  Spk:   { col: '#6f7681', en: 'Speaker of the House of Commons', ja: '庶民院議長' },
};

/* ── which parties get a place in the shared index ─────────────────────────────────────────────
   ⚠ 327 PARTIES STOOD IN THESE FIVE ELECTIONS and almost every one of them was a single candidate
   in a single seat. Naming all of them in the index shared by every country would be tens of
   kilobytes of colour for parties no reader will ever see; naming a hand-picked few would be the
   ad-hoc list `.agents/rules/no-ad-hoc-hardcoding.md` forbids. So membership is a MEASUREMENT with
   two limbs, both computed from the data:
     · the party won at least one seat in one of these elections, or
     · it took at least VOTE_FLOOR of the national valid vote in one of them.
   The second limb exists because a party can be third in the country and hold nothing. Measured
   2026-09-09 it admits exactly two beyond the seat-winners — the BNP in 2010 (1.90 %) and the
   Brexit Party in 2019 (2.01 %) — and admits nobody at all in 2015, 2017 or 2024. A candidate whose
   party is outside the table keeps their name and their votes and carries no party id, which is the
   honest reading of «this line has no colour of its own». */
const VOTE_FLOOR = 1.0;   /* per cent of the national valid vote; see above for what it admits */

/* ══ the database ══════════════════════════════════════════════════════════════════════════════
   `node:sqlite` is part of Node, so this adds no dependency — but it opens a PATH, and the build's
   fetcher hands back a Buffer, so the download is spilled to the build cache first. */
async function openDb(ctx) {
  const buf = await ctx.get(DB_URL);
  const root = ctx.ROOT || join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const dir = join(root, 'node_modules', '.cache', 'intmap-elections');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, 'uk-psephology.db');
  writeFileSync(path, buf);
  return new DatabaseSync(path, { readOnly: true });
}

/** Every candidacy of every real general election, flattened. One row per candidate.
 *  ⚠ THE PARTY IS THE PRIMARY CERTIFICATION, NOT ANY CERTIFICATION. A Labour and Co-operative
 *  candidate carries two — Labour, and the Co-operative Party as an ADJUNCT to it — and counting
 *  both turns Labour's 411 seats in 2024 into 411 Labour plus 43 Co-operative, i.e. 43 seats that
 *  do not exist. Measured: 242 adjunct certifications in the file, all of them Co-operative. */
const CANDIDACY_SQL = `
  SELECT ge.id                AS ge_id,
         ge.polling_on        AS polling_on,
         ge.commons_library_briefing_url AS briefing,
         ca.geographic_code   AS cd,
         ca.name              AS cname,
         c.vote_count         AS votes,
         c.is_winning_candidacy AS won,
         c.candidate_given_name  AS given,
         c.candidate_family_name AS family,
         e.valid_vote_count   AS valid,
         pp.id                AS party_id,
         pp.abbreviation      AS abbr,
         pp.name              AS pname,
         c.is_standing_as_commons_speaker AS is_speaker,
         c.is_standing_as_independent     AS is_independent
    FROM candidacies c
    JOIN elections e             ON e.id = c.election_id
    JOIN general_elections ge    ON ge.id = e.general_election_id
    JOIN constituency_groups cg  ON cg.id = e.constituency_group_id
    JOIN constituency_areas ca   ON ca.id = cg.constituency_area_id
    LEFT JOIN certifications ce  ON ce.candidacy_id = c.id AND ce.adjunct_to_certification_id IS NULL
    LEFT JOIN political_parties pp ON pp.id = ce.political_party_id
   WHERE ge.is_notional = 0 AND e.is_notional = 0 AND c.is_notional = 0
   ORDER BY ge.polling_on, ca.geographic_code, c.vote_count DESC`;

/** ⚠ A PARTY IS ITS REGISTRATION, NOT ITS ABBREVIATION. «Green» is the abbreviation of three
 *  separately registered parties in this file — the Green Party, the Scottish Green Party and the
 *  Green Party Northern Ireland — and «ISP» and «NIP» each name two more. Keying on the letters
 *  would pool three parties' votes into one national share, which is how a party that never came
 *  near the floor gets into the shared index. So the internal key is the row id, and the readable
 *  slug is derived from the abbreviation only once membership is settled.
 *  Parliament models «independent» and «the Speaker seeking re-election» as flags on the candidacy
 *  rather than as parties, so those two get keys of their own. Anything that is neither a party nor
 *  one of those flags is a hole in the source and stops the build. */
function partyKey(row) {
  if (row.party_id != null) return 'p' + row.party_id;
  if (row.is_speaker) return 'Spk';
  if (row.is_independent) return 'Ind';
  return null;
}

/** The abbreviation this key is painted under: the registered party's, or the flag's own name. */
function partyAbbr(row) {
  return row.abbr || (row.is_speaker ? 'Spk' : (row.is_independent ? 'Ind' : null));
}

/* ══ boundaries ════════════════════════════════════════════════════════════════════════════════ */

/** ⚠ ONE REQUEST PER ERA, AND THAT IS NOT LAZINESS — IT IS FORCED. The build's HTTP cache keys a
 *  response by the first 180 characters of the base64url of its URL, i.e. by the first 135 BYTES of
 *  the URL (scripts/elections/_selftest.mjs, scripts/build-elections.mjs). The ONS prefix plus a
 *  service name plus «/FeatureServer/0» is already 137 bytes, so two URLs that differ only in their
 *  QUERY STRING collide and the second is answered with the first one's body: measured 2026-09-09,
 *  asking for the layer's field list and then for its features returned the field list twice, i.e.
 *  a FeatureCollection with no features at all. So there is no metadata call (the field names are
 *  read off the features, which is where they had to be read anyway) and no paging — instead, an
 *  explicit refusal if the server ever truncates. Both eras are 650 features against a server
 *  maxRecordCount of 2000, so truncation would be a change at ONS, not a size this build grows into.
 */
async function fetchEra(ctx, era) {
  const url = ONS + era.service + '/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson';
  const answer = await ctx.get(url, { json: true });
  if (answer.error) throw new Error(era.service + ': ' + JSON.stringify(answer.error).slice(0, 200));
  const raw = answer.features || [];
  if (!raw.length) throw new Error(era.service + ': no features came back');
  if (answer.exceededTransferLimit || (answer.properties && answer.properties.exceededTransferLimit)) {
    throw new Error(era.service + ': the server truncated the answer at ' + raw.length +
      ' features. Paging cannot be added while the build cache keys URLs by their first 135 bytes.');
  }
  /* ONS stamps the boundary vintage into the field name — PCON22CD in the 2010-era file, PCON24CD
     in the 2024 one — so the fields are found by their shape rather than written out. */
  const keys = Object.keys(raw[0].properties || {});
  const pick = (re) => keys.find(k => re.test(k)) || null;
  const cdF = pick(/^PCON\d{2}CD$/), nmF = pick(/^PCON\d{2}NM$/), nmwF = pick(/^PCON\d{2}NMW$/);
  if (!cdF || !nmF) throw new Error(era.service + ': no PCON##CD / PCON##NM field (' + keys.join(',') + ')');

  const fc = {
    type: 'FeatureCollection',
    features: raw.map(ft => {
      const p = ft.properties || {};
      const n = { en: String(p[nmF] || '').trim() };
      /* Welsh is published beside English for Welsh seats and left blank elsewhere; where it says
         something other than the English name, it is the name on the Welsh ballot paper. */
      const cy = nmwF ? String(p[nmwF] || '').trim() : '';
      /* ⚠ (#R584) THE WELSH NAME IS THE SEAT'S NATIVE FORM, NOT A TRANSLATION. It went in as `n.cy`,
         and `cy` is not one of the nine languages the app ships — so the key could never equal any
         reader's language and the name reached nobody, while looking in the data like coverage.
         `native` is the field the layer shows beside the reader's own language for exactly this. */
      if (cy && cy !== n.en) n.native = cy;
      return { type: 'Feature', properties: { cd: String(p[cdF] || '').trim(), n }, geometry: ft.geometry };
    }),
  };
  return simplifyGeoJSON(fc, { tolerance: TOLERANCE, decimals: DECIMALS });
}

/** The era an election was fought on is the one whose constituency codes ARE the election's — not
 *  the one whose published date range happens to contain polling day. Equality in both directions,
 *  so neither a seat the map lacks nor a seat nobody contested can slip through. */
function chooseEra(codes, eraCodes, when) {
  const hits = [...eraCodes].filter(([, set]) =>
    set.size === codes.size && [...codes].every(cd => set.has(cd)));
  if (hits.length !== 1) {
    const near = [...eraCodes].map(([id, set]) =>
      id + '(' + [...codes].filter(cd => set.has(cd)).length + '/' + set.size + ')').join(' ');
    throw new Error(when + ': its ' + codes.size + ' constituencies match ' + hits.length +
      ' boundary era(s) exactly — ' + near);
  }
  return hits[0][0];
}

/* ══ parties ═══════════════════════════════════════════════════════════════════════════════════ */
function collectParties(rows) {
  const stat = new Map();   /* key → { name, abbr, seats, topShare } */
  const perElection = new Map();
  for (const r of rows) {
    const key = partyKey(r);
    if (!key) throw new Error(r.polling_on + ' ' + r.cd + ': a candidacy has no party and is neither ' +
      'independent nor the Speaker — the source has changed shape');
    if (!stat.has(key)) stat.set(key, { name: '', abbr: partyAbbr(r), seats: 0, topShare: 0 });
    const s = stat.get(key);
    /* the later election's spelling wins: «Sinn Fein» is «Sinn Féin» in the newer rows */
    if (r.pname) s.name = r.pname;
    if (r.won) s.seats++;
    if (!perElection.has(r.ge_id)) perElection.set(r.ge_id, { total: 0, byParty: new Map() });
    const pe = perElection.get(r.ge_id);
    const v = Number.isFinite(r.votes) ? r.votes : 0;
    pe.total += v;
    pe.byParty.set(key, (pe.byParty.get(key) || 0) + v);
  }
  for (const pe of perElection.values()) {
    for (const [key, v] of pe.byParty) {
      const s = stat.get(key);
      s.topShare = Math.max(s.topShare, pe.total ? v / pe.total * 100 : 0);
    }
  }

  const parties = {}, keep = new Map();   /* key → «uk:slug» */
  const bySlug = new Map();
  for (const [key, s] of stat) {
    if (!(s.seats > 0 || s.topShare >= VOTE_FLOOR)) continue;
    const c = COLOUR[s.abbr];
    if (!c) {
      throw new Error('party «' + s.abbr + '» (' + (s.name || '?') + ') won ' + s.seats +
        ' seat(s) and polled up to ' + s.topShare.toFixed(2) +
        '% — add a colour for it to COLOUR rather than let it paint some default');
    }
    const id = 'uk:' + s.abbr.toLowerCase();
    /* two registered parties that both qualify and share an abbreviation would be one colour over
       two manifestos; measured 2026-09-09 it does not happen, and if it starts, it stops the build */
    if (bySlug.has(id)) {
      throw new Error('abbreviation «' + s.abbr + '» is claimed by two qualifying parties: ' +
        bySlug.get(id) + ' and ' + s.name);
    }
    bySlug.set(id, s.name || s.abbr);
    keep.set(key, id);
    const n = { en: s.name || c.en || s.abbr };
    if (c.ja) n.ja = c.ja;
    parties[id] = { n, col: c.col };
  }
  return { parties, keep };
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
function noteFor(seats) {
  const jp = seats + ' 議席のすべてがこの地図に描かれた選挙区から選ばれ、名簿から選ばれる議員はいません。' +
    '色はその選挙区で 1 回の単純多数投票により議席を得た政党で、その選挙区で投じられた票の過半に達して' +
    'いなくても当選します。';
  return {
    en: 'All ' + seats + ' members are returned by the constituencies drawn on this map and nobody is ' +
      'elected from a list. The colour is the party that won the seat in a single round of ' +
      'first-past-the-post voting, which can be far short of half the votes cast there.',
    ja: jp, jp,
    de: 'Alle ' + seats + ' Abgeordneten kommen aus den auf dieser Karte gezeichneten Wahlkreisen, ' +
      'niemand wird über eine Liste gewählt. Die Farbe zeigt die Partei, die den Sitz in einem ' +
      'einzigen Wahlgang nach relativer Mehrheit gewonnen hat — das kann weit weniger als die Hälfte ' +
      'der dort abgegebenen Stimmen sein.',
    ru: 'Все ' + seats + ' членов палаты избираются в округах, нарисованных на этой карте, и никто не ' +
      'проходит по списку. Цвет — партия, выигравшая место в один тур по системе относительного ' +
      'большинства, что может быть намного меньше половины поданных там голосов.',
    es: 'Los ' + seats + ' miembros proceden de las circunscripciones dibujadas en este mapa y nadie ' +
      'es elegido por lista. El color corresponde al partido que ganó el escaño en una sola vuelta ' +
      'por mayoría simple, que puede quedar muy por debajo de la mitad de los votos emitidos allí.',
    fr: 'Les ' + seats + ' membres sont tous élus dans les circonscriptions dessinées sur cette carte ' +
      'et personne n’est élu sur une liste. La couleur est celle du parti qui a remporté le siège en ' +
      'un seul tour au scrutin majoritaire simple, ce qui peut représenter bien moins de la moitié ' +
      'des voix exprimées sur place.',
    ko: seats + '석 전부가 이 지도에 그려진 선거구에서 선출되며 명부로 선출되는 의원은 없습니다. 색은 ' +
      '단 한 번의 단순다수 투표로 그 의석을 얻은 정당이며, 그곳에서 투표된 표의 절반에 크게 못 미쳐도 ' +
      '당선될 수 있습니다.',
    zh: '全部 ' + seats + ' 席都由本地圖上的選區選出，沒有任何議員由名單產生。顏色代表在單一輪相對多數' +
      '投票中贏得該席次的政黨，得票可能遠低於該選區投票數的一半。',
    'zh-hans': '全部 ' + seats + ' 席都由本地图上的选区选出，没有任何议员由名单产生。颜色代表在单一轮' +
      '相对多数投票中赢得该席次的政党，得票可能远低于该选区投票数的一半。',
  };
}

export async function build(ctx) {
  const geo = {};
  const eraCodes = new Map();
  for (const era of ERAS) {
    const fc = await fetchEra(ctx, era);
    geo[era.id + '.geo.json'] = fc;
    eraCodes.set(era.id, new Set(fc.features.map(f => f.properties.cd)));
  }

  const db = await openDb(ctx);
  const rows = db.prepare(CANDIDACY_SQL).all();
  db.close();
  if (!rows.length) throw new Error('psephology.db returned no candidacies');

  const { parties, keep } = collectParties(rows);

  /* group by general election, then by constituency, keeping the query's vote order */
  const byGe = new Map();
  for (const r of rows) {
    if (!byGe.has(r.ge_id)) {
      byGe.set(r.ge_id, { date: r.polling_on, briefing: r.briefing, seats: new Map() });
    }
    const ge = byGe.get(r.ge_id);
    if (!ge.seats.has(r.cd)) ge.seats.set(r.cd, []);
    ge.seats.get(r.cd).push(r);
  }

  const res = {}, elections = [];
  for (const [, ge] of [...byGe].sort((a, b) => (a[1].date < b[1].date ? -1 : 1))) {
    const year = Number(String(ge.date).slice(0, 4));
    const eraId = chooseEra(new Set(ge.seats.keys()), eraCodes, 'the ' + ge.date + ' general election');

    const d = {};
    const seats = new Map(), votes = new Map();
    let validTotal = 0;

    for (const [cd, runners] of ge.seats) {
      const winners = runners.filter(r => r.won);
      if (winners.length !== 1) {
        throw new Error(ge.date + ' ' + cd + ': ' + winners.length + ' winning candidacies');
      }
      /* ⚠ TWO STATEMENTS OF ONE FACT, CHECKED AGAINST EACH OTHER. `is_winning_candidacy` is
         Parliament's own record of who won; the head of the vote-ordered list is the arithmetic.
         Where they disagree, one of them is describing a different election. */
      if (winners[0] !== runners[0]) {
        throw new Error(ge.date + ' ' + cd + ': the winner is not the candidate with most votes (' +
          partyAbbr(winners[0]) + ' vs ' + partyAbbr(runners[0]) + ')');
      }
      const wKey = partyKey(winners[0]);
      /* a party that won a seat qualifies for the table by construction, so this cannot fire
         unless collectParties and this loop have stopped reading the same rows */
      if (!keep.has(wKey)) throw new Error(ge.date + ' ' + cd + ': the winner is not in the party table');

      const c = runners.map(r => {
        const key = partyKey(r);
        const name = [r.given, r.family].filter(Boolean).join(' ').trim();
        const out = { n: name || String(r.family || r.given || partyAbbr(r)) };
        if (keep.has(key)) out.p = keep.get(key);
        /* ⚠ an absent count is absent, never zero (elections-schema.mjs) */
        if (Number.isFinite(r.votes)) out.v = r.votes;
        return out;
      });

      const rec = { w: keep.get(wKey), c };
      if (Number.isFinite(runners[0].valid)) rec.t = runners[0].valid;
      d[cd] = rec;

      seats.set(wKey, (seats.get(wKey) || 0) + 1);
      for (const r of runners) {
        const key = partyKey(r);
        const v = Number.isFinite(r.votes) ? r.votes : 0;
        validTotal += v;
        votes.set(key, (votes.get(key) || 0) + v);
      }
    }

    /* ⚠ THE NATIONAL BAR COVERS THE WHOLE CHAMBER, and for the House of Commons that is the same
       set the map holds: every member is returned by one of these polygons and there is no list.
       That is a fact about Britain rather than a shortcut — Japan, Germany and Korea seat members
       the map cannot draw, and their packs have to record the totals instead of counting them. */
    const n = [...keep]
      .map(([key, id]) => {
        const s = seats.get(key) || 0, v = votes.get(key) || 0;
        if (!s && !v) return null;   /* did not stand in this election at all */
        const row = { p: id, seats: s, dseats: s };
        if (validTotal) row.pct = Math.round(v / validTotal * 1e4) / 1e2;
        return row;
      })
      .filter(Boolean)
      .sort((a, b) => (b.seats - a.seats) || ((b.pct || 0) - (a.pct || 0)));

    const seatCount = ge.seats.size;
    const id = 'uk-commons-' + year;
    res[id + '.res.json'] = { d, n };
    elections.push({
      id,
      polity: 'uk',
      body: { en: 'House of Commons', native: 'House of Commons', ja: '庶民院' },
      date: ge.date,
      y: year,
      geo: eraId + '.geo.json',
      res: id + '.res.json',
      seatsTotal: seatCount,
      districtSeats: seatCount,   /* every member is returned by a constituency drawn on this map */
      listSeats: 0,
      note: noteFor(seatCount),
      src: 'Results: UK Parliament, Election Results (electionresults.parliament.uk)' +
        (ge.briefing ? ', with the House of Commons Library briefing at ' + ge.briefing : '') +
        '. Boundaries: Office for National Statistics, Open Geography Portal — ' +
        ERAS.find(e => e.id === eraId).note +
        '. Contains OS data © Crown copyright and database right; contains National Statistics data ' +
        '© Crown copyright and database right.',
      lic: 'Results: Open Parliament Licence v3.0. Boundaries: Open Government Licence v3.0.',
    });
  }

  return {
    polities: [{
      id: 'uk',
      n: { en: 'United Kingdom', native: 'United Kingdom', ja: 'イギリス' },
      /* the box the map opens on: Great Britain, Northern Ireland and the islands that hold seats */
      home: [[-8.7, 49.8], [1.9, 60.9]],
    }],
    parties,
    elections,
    geo,
    res,
  };
}
