/* ============================================================================
 *  IntMap · EVERY EUROPEAN PARLIAMENT ELECTION, 1979–2024   (#R588)
 * ----------------------------------------------------------------------------
 *  Ten elections, the whole series since the Parliament first became directly elected.
 *
 *  ══ THE MAP IS COLOURED BY POLITICAL GROUP, NOT BY PARTY ════════════════════════════════════
 *  Because that is the only unit that means the same thing in every member state. A German reader
 *  recognises CDU and a Spanish reader recognises PP; neither recognises the other's, and a map
 *  with two hundred national parties on it is a map with two hundred colours and no legend. The
 *  Parliament itself reports its results by group (EPP, S&D, Renew, ECR, Greens/EFA, The Left …),
 *  every election-night graphic in Europe is drawn that way, and the group is what actually
 *  decides how the chamber votes. So a country is filled with the group that took most of its
 *  seats, and the national parties are listed underneath with the group each of them sits in.
 *
 *  ⚠ THE GROUPS ARE NOT WRITTEN OUT HERE, AND NEITHER ARE THEIR COLOURS. Both are read from the
 *  Parliament's own published results for the term being built, because the groups are not the
 *  same set in any two terms — the 1979 chamber had «S», «PPE», «ED», «COM», «L», «DEP» and
 *  «CDI», and the identifiers the Parliament uses for them (GP0001…) are reused with DIFFERENT
 *  meanings in the next term (GP0201…). A hand-written table would therefore be wrong by 1984.
 *
 *  ══ WHICH COUNTRIES ARE ON THE MAP, AND WHY THAT IS NOT A LIST EITHER ═══════════════════════
 *  Membership changed at seven of the ten elections. The member states of a given election are
 *  therefore taken from that election's own results — the divisions the Parliament published
 *  results for, filtered to those that are not a sub-division of another (`parentDivision`), which
 *  is how Belgium's three electoral colleges and the United Kingdom's Great Britain / Northern
 *  Ireland split are recognised as parts rather than as countries.
 *
 *  ⚠ THE COUNTRY IS THE FINEST GRAIN THE PARLIAMENT PUBLISHES, WITH ONE EXCEPTION. Ireland, Italy
 *  and Poland do elect their members in regional constituencies, but results.elections.europa.eu
 *  reports `districts: null` for all three (measured 2026-09-09) — there is no regional breakdown
 *  to draw. Belgium is the only member state whose sub-divisions the Parliament does report, and
 *  those are electoral COLLEGES rather than territory: a voter in Brussels chooses which of the
 *  Dutch- and French-speaking colleges to vote in, so no polygon exists that contains exactly one
 *  of them. Belgium is therefore drawn whole, like everyone else, and its three colleges are
 *  summed. If the Parliament ever publishes regional results, `districts` is where they will
 *  appear and this file will need a second look.
 *
 *  ⚠ THE POLYGONS ARE TODAY'S BOUNDARIES. GISCO publishes one current world coastline, not a
 *  historical series, so the 1979 map draws reunified Germany although the eighty-one German
 *  members elected that year were elected in the Federal Republic alone. That is an acknowledged
 *  anachronism in the geometry, not in the results; the seats, parties and groups for 1979 are the
 *  1979 record exactly as the Parliament holds it.
 *
 *      node scripts/elections/_selftest.mjs eu
 * ==========================================================================*/
import { simplifyGeoJSON } from '../lib/elections-geo.mjs';
import { createHash } from 'node:crypto';

export const about = 'European Union · European Parliament, all 10 elections 1979–2024 (European Parliament results service; boundaries © EuroGeographics / GISCO)';

const SHEETS = 'https://results.elections.europa.eu/data-sheets/';
const TERM_PAGE = 'https://results.elections.europa.eu/en/european-results/';
/* GISCO's 1:10 million country polygons. 1:20M loses Malta and the Aegean islands to the point of
   comedy and 1:3M is 14 MB before anything is selected from it; measured 2026-09-09, the 10M set
   is 371 KB for the twenty-eight countries that have ever been in it. */
const GISCO = 'https://gisco-services.ec.europa.eu/distribution/v2/countries/geojson/CNTR_RG_10M_2024_4326.geojson';

const SRC = 'European Parliament, results.elections.europa.eu · boundaries © EuroGeographics for the administrative boundaries (Eurostat/GISCO)';
const LIC = 'European Parliament legal notice: reuse for commercial or non-commercial purposes is authorised provided the source is acknowledged · GISCO boundaries free to use with attribution to © EuroGeographics';

/* ⚠ 0.002° is 220 m at 50 °N. The GISCO 10M outlines are already generalised for a 1:10,000,000
   map, so this removes almost nothing (measured: 174 KB → 166 KB) and exists to round coordinates
   to four decimals rather than to drop shape. Raising it would start eating the Danish and Greek
   islands, which at this scale are already a handful of vertices each. */
const TOL = 0.002;
const DECIMALS = 4;

/* ⚠ THE POLLING DAY IS THE ONE FACT THE RESULTS SERVICE DOES NOT PUBLISH. Its `time` fields are
 *  when the Parliament certified a figure, not when anyone voted, and there is no endpoint that
 *  carries the ballot dates. A European election is spread over four days (member states vote on
 *  the day their own law names, Thursday to Sunday) and the count begins only when the last poll
 *  closes, so the date recorded here is THE CLOSING SUNDAY — the day the result exists.
 *  From the Parliament's own record of its elections. ⚠ A term that turns up here without a row
 *  fails the build rather than being dated by arithmetic: the closing Sunday has moved between
 *  May and June and cannot be computed from the year. */
const POLLING_DAY = {
  '1979-1984': '1979-06-10',
  '1984-1989': '1984-06-17',
  '1989-1994': '1989-06-18',
  '1994-1999': '1994-06-12',
  '1999-2004': '1999-06-13',
  '2004-2009': '2004-06-13',
  '2009-2014': '2009-06-07',
  '2014-2019': '2014-05-25',
  '2019-2024': '2019-05-26',
  '2024-2029': '2024-06-09',
};

/* ── small readers ─────────────────────────────────────────────────────────────────────────── */

function parseCsv(text, sep = ';') {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') { field += c; continue; }
      if (text[i + 1] === '"') { field += '"'; i++; continue; }
      quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === sep) { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); field = ''; rows.push(row); row = []; }
    else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const decodeEntities = (s) => String(s == null ? '' : s)
  .replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').trim();

/** One id per group, derived from the acronym the Parliament prints in English. ⚠ NOT from the
 *  Parliament's own group id: those are term-scoped (GP0001 is the Socialist Group in 1979 and
 *  does not exist in 1984, where the same group is GP0201), so keying on them would give ten
 *  disjoint party tables and a legend that could never say «this is the same group as last time».
 *  The acronym is the identity a reader carries between elections. */
function groupSlug(acronym) {
  const s = String(acronym).toLowerCase().normalize('NFD')
    .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '');
  return s || 'x';
}

/** ⚠ SAME RULE AS THE GERMAN PACK, AND FOR THE SAME REASON. The Parliament publishes the colour it
 *  uses for each group of the CURRENT term on its own results page, and that is where the colours
 *  below come from — nothing here is a remembered hex value. For a group that was wound up in 1994
 *  no such page exists any more (measured 2026-09-09: only the current term's page is served), so
 *  those get a colour derived from the group's id: deterministic, stable between rebuilds, and
 *  making no claim about the group's politics. */
function derivedColour(slug) {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  const hue = (h * 137.508) % 360, sat = 0.44, lig = 0.44;
  const c = (1 - Math.abs(2 * lig - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1)), m = lig - c / 2;
  const t = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(hue / 60) % 6];
  return '#' + t.map(v => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('');
}

/** The results page renders one table row per group with its acronym and its colour. */
function coloursFromTermPage(html) {
  const out = new Map();
  for (const m of String(html).matchAll(/<tr class="hemicycle-data-pie">([\s\S]*?)<\/tr>/g)) {
    const body = m[1];
    const acr = /<th[^>]*>\s*([\s\S]*?)\s*<\/th>/.exec(body);
    const col = /id-color">\s*(#[0-9A-Fa-f]{6})\s*</.exec(body);
    if (acr && col) out.set(groupSlug(decodeEntities(acr[1])), col[1].toLowerCase());
  }
  return out;
}

/* ── build ─────────────────────────────────────────────────────────────────────────────────── */

/* ── the note the reader reads ─────────────────────────────────────────────────────────────────
   ⚠ A NOTE IS A NAME TABLE, NOT A STRING: it is prose shown in the legend, so it obeys AGENTS.md
   §3.5 and exists in all nine languages. `src` and `lic` do not — an attribution line is the
   publisher's own wording and a licence is a legal condition, and translating either misquotes it.
   ⚠ AND EACH LANGUAGE BUILDS ITS OWN SENTENCE. The counts do not fall in the same place in a
   Japanese, Korean or German clause as in an English one, so this is nine sentences that share a
   number — not one English sentence with the number swapped out.
   ⚠ BOTH `jp` AND `ja`: 'jp' is the app's own code for Japanese (js/lang-registry.js) and the key
   js/elections.js looks up in a name table; 'ja' is the BCP-47 tag the rest of this data uses. */
function noteFor(seats, states) {
  const jp = '色が塗られている ' + states + ' の区域は選挙区ではなく加盟国そのもので、1 国が ' + seats +
    ' 議席のうち数十議席を出すこともあります。選挙の方式は各国の法律が決めます。色はその国で最も多くの' +
    '議席を得た会派で、首位が同数で並んだ国には色を塗りません。';
  return {
    en: 'The ' + states + ' areas are whole member states, not constituencies: one of them can return ' +
      'dozens of the ' + seats + ' members, and each state holds the election under its own law. The ' +
      'colour is the political group that took most of that state’s seats — where two groups tie for ' +
      'first, nothing is coloured.',
    ja: jp, jp,
    de: 'Die ' + states + ' Flächen sind ganze Mitgliedstaaten, keine Wahlkreise: Eine von ihnen kann ' +
      'Dutzende der ' + seats + ' Abgeordneten entsenden, und jeder Staat wählt nach eigenem Recht. ' +
      'Die Farbe zeigt die Fraktion mit den meisten Sitzen dieses Staates; liegen zwei Fraktionen ' +
      'gleichauf, wird nichts eingefärbt.',
    ru: states + ' закрашенных областей — это целые государства-члены, а не округа: одно из них может ' +
      'направить десятки из ' + seats + ' депутатов, и каждое проводит выборы по своему закону. Цвет — ' +
      'фракция, получившая больше всего мест этой страны; при равенстве двух фракций на первом месте ' +
      'цвет не наносится.',
    es: 'Las ' + states + ' áreas son Estados miembros enteros, no circunscripciones: uno de ellos ' +
      'puede enviar decenas de los ' + seats + ' diputados y cada Estado celebra la elección con su ' +
      'propia ley. El color corresponde al grupo político que obtuvo más escaños de ese Estado; si ' +
      'dos grupos empatan en el primer puesto, no se colorea nada.',
    fr: 'Les ' + states + ' zones sont des États membres entiers, et non des circonscriptions : l’un ' +
      'd’eux peut envoyer des dizaines des ' + seats + ' députés, et chaque État organise le scrutin ' +
      'selon sa propre loi. La couleur est celle du groupe politique ayant obtenu le plus de sièges ' +
      'de cet État ; en cas d’égalité en tête, rien n’est colorié.',
    ko: '색칠된 ' + states + '개 영역은 선거구가 아니라 회원국 전체이며, 한 나라가 ' + seats + '석 가운데 ' +
      '수십 석을 배출하기도 합니다. 선거 방식은 각 나라의 법이 정합니다. 색은 그 나라에서 가장 많은 ' +
      '의석을 얻은 정치그룹이며, 1위가 동수인 나라에는 색을 칠하지 않습니다.',
    zh: '圖上 ' + states + ' 塊區域都是完整的會員國，而不是選區：其中一國可能選出 ' + seats +
      ' 席中的數十席，選舉方式由各國自己的法律決定。顏色代表在該國取得最多席次的政治黨團；' +
      '若有兩個黨團並列第一，則不上色。',
    'zh-hans': '图上 ' + states + ' 块区域都是完整的成员国，而不是选区：其中一国可能选出 ' + seats +
      ' 席中的数十席，选举方式由各国自己的法律决定。颜色代表在该国取得最多席次的政治党团；' +
      '若有两个党团并列第一，则不上色。',
  };
}

export async function build(ctx) {
  const get = async (url, opts) => {
    let last;
    for (let attempt = 0; attempt < 4; attempt++) {
      try { return await ctx.get(url, opts); }
      catch (e) { last = e; if (/HTTP 40\d/.test(String(e && e.message))) throw e; await new Promise(r => setTimeout(r, 400 * (attempt + 1))); }
    }
    throw last;
  };
  const maybe = async (url, opts) => { try { return await get(url, opts); } catch { return null; } };

  /* ── 1. which terms exist ───────────────────────────────────────────────────────────────────
     ⚠ NOT A LIST OF TEN STRINGS. The Parliament has been elected every five years since 1979 and
     names each term «start-end»; the walk stops at the first term the service does not serve, so
     the 2029 election joins this layer by being published. */
  const terms = [];
  for (let start = 1979; start < 2100; start += 5) {
    const term = start + '-' + (start + 5);
    const csv = await maybe(SHEETS + 'csv/' + term + '/election-results/parties.csv', { text: true });
    if (!csv) break;
    terms.push({ term, partiesCsv: csv });
  }
  if (!terms.length) throw new Error('the European Parliament results service served no terms at all');

  /* ── 2. the world's country polygons, fetched once ─────────────────────────────────────────── */
  const world = await get(GISCO, { json: true });
  const byCountry = new Map();
  for (const f of world.features) {
    const id = String(f.properties.CNTR_ID || '');
    if (id) byCountry.set(id, f);
  }

  const parties = {};          /* group id → { n, col } */
  const groupNames = new Map();/* group slug → { lang → acronym } */
  const geo = {};
  const res = {};
  const elections = [];
  const seenGeo = new Map();   /* content hash → geo file name */

  /* The nine languages IntMap ships, mapped onto the language codes the Parliament publishes its
     group names in. ⚠ The Parliament translates into the EU's twenty-four official languages, so
     four of the nine are available and five are not; the missing ones fall back to English by
     simply not being present, which is what the schema's name table is for. */
  const EP_LANG = { EN: 'en', DE: 'de', FR: 'fr', ES: 'es' };

  for (const { term, partiesCsv } of terms) {
    const date = POLLING_DAY[term];
    if (!date) throw new Error(term + ': no polling day recorded for this term — add it to POLLING_DAY from the Parliament\'s own record');
    const year = Number(date.slice(0, 4));

    /* ── the divisions that published results, and which of them are countries ──────────────── */
    const rows = parseCsv(partiesCsv);
    const head = rows[0] || [];
    const cDiv = head.indexOf('DIVISION_ID'), cId = head.indexOf('ID'), cAcr = head.indexOf('ACRONYM'), cLab = head.indexOf('LABEL');
    if (cDiv < 0 || cId < 0 || cLab < 0) throw new Error(term + ': parties.csv no longer has DIVISION_ID/ID/LABEL');
    const partyLabel = new Map();       /* party id (e.g. DE04) → printed name */
    const divisions = [];
    for (const r of rows.slice(1)) {
      if (!r[cDiv]) continue;
      if (!divisions.includes(r[cDiv])) divisions.push(r[cDiv]);
      if (r[cId]) partyLabel.set(r[cId], (r[cAcr] || '').trim() || (r[cLab] || '').trim());
    }

    const countries = [];
    for (const div of divisions) {
      const j = await maybe(SHEETS + 'json/' + term + '/election-results/' + div.toLowerCase() + '.json', { json: true });
      if (!j) continue;
      /* ⚠ A DIVISION WITH A PARENT IS PART OF A COUNTRY, NOT A COUNTRY. Belgium's FBE/GBE/WBE and
         the United Kingdom's GB/NI are published beside their parents, and counting them as
         countries would draw Belgium three times and count its seats twice. */
      if (j.parentDivision) continue;
      countries.push({ id: div, data: j });
    }
    if (!countries.length) throw new Error(term + ': no member states could be identified');

    /* ── the group vocabulary of this term ──────────────────────────────────────────────────── */
    const groupsCsv = await get(SHEETS + 'csv/' + term + '/election-results/groups.csv', { text: true });
    const gRows = parseCsv(groupsCsv);
    const gHead = gRows[0] || [];
    const gId = gHead.indexOf('ID'), gLang = gHead.indexOf('LANGUAGE_ID'), gAcr = gHead.indexOf('ACRONYM'), gLab = gHead.indexOf('LABEL');
    if (gId < 0 || gLang < 0 || gAcr < 0) throw new Error(term + ': groups.csv no longer has ID/LANGUAGE_ID/ACRONYM');
    const slugOfGroup = new Map();      /* the term's own group id → the stable slug */
    const acronyms = new Map();         /* slug → { lang → acronym } */
    for (const r of gRows.slice(1)) {
      if (!r[gId] || r[gLang] !== 'EN') continue;
      const slug = groupSlug(r[gAcr]);
      slugOfGroup.set(r[gId], slug);
      if (!acronyms.has(slug)) acronyms.set(slug, {});
      acronyms.get(slug).en = (r[gAcr] || '').trim();
      acronyms.get(slug).__long = (r[gLab] || '').trim();
    }
    for (const r of gRows.slice(1)) {
      const slug = slugOfGroup.get(r[gId]);
      const lang = EP_LANG[r[gLang]];
      if (!slug || !lang || !((r[gAcr] || '').trim())) continue;
      acronyms.get(slug)[lang] = r[gAcr].trim();
    }
    for (const [slug, names] of acronyms) {
      const prior = groupNames.get(slug) || {};
      groupNames.set(slug, { ...names, ...prior });   /* the first term to name a group wins */
    }

    /* the colours this term's own results page uses, where the Parliament still serves one */
    const page = await maybe(TERM_PAGE + term + '/', { text: true });
    const pageColours = page ? coloursFromTermPage(page) : new Map();

    /* ── per country: seats by group, and the parties that won them ─────────────────────────── */
    const d = {};
    let seatSumFromCountries = 0;
    for (const { id, data } of countries) {
      if (!byCountry.has(id)) throw new Error(term + ': GISCO has no polygon for division ' + id);
      const dist = ((data.groupSummary || {}).groupDistribution || [])
        .map(g => ({ slug: slugOfGroup.get(g.id) || groupSlug(g.id), seats: Number(g.seatsTotal) || 0 }))
        .filter(g => g.seats > 0)
        .sort((a, b) => b.seats - a.seats);
      seatSumFromCountries += Number(data.seatsTotal) || 0;

      /* ⚠ A TIE FOR FIRST PLACE IS NOT A WINNER. Two groups level on seats in one country is a
         real outcome (measured in the small delegations), and picking whichever the sort happened
         to put first would paint a colour the record does not support. The schema draws «no
         winner» as no colour, which is the truthful answer. */
      let w = null;
      if (dist.length && !(dist.length > 1 && dist[1].seats === dist[0].seats)) w = 'eu:' + dist[0].slug;

      /* the national parties, each labelled with the group its members sat in */
      const c = [];
      for (const p of ((data.partySummary || {}).seatsByParty || [])) {
        const label = partyLabel.get(p.id) || p.id;
        const gd = (p.groupDistribution || []).slice().sort((a, b) => (b.seatsTotal || 0) - (a.seatsTotal || 0));
        const slug = gd.length ? (slugOfGroup.get(gd[0].id) || groupSlug(gd[0].id)) : null;
        /* ⚠ NO VOTE COUNTS ANYWHERE. The Parliament publishes percentages and seats, never
           ballots, so `v` is ABSENT rather than filled with a percentage pretending to be a count
           (elections-schema.mjs: an absent number is absent, never zero and never something else). */
        const row = { n: label };
        if (slug) row.p = 'eu:' + slug;
        c.push(row);
      }
      /* the winning group must appear among the parties listed, or the two sources disagree */
      if (w && c.length && !c.some(x => x.p === w)) {
        const known = new Set(c.map(x => x.p));
        throw new Error(term + ' · ' + id + ': ' + w + ' took most seats but sits with none of the parties listed (' + [...known].join(', ') + ')');
      }
      d[id] = w ? { w, c } : { c };
    }

    /* ── the chamber ────────────────────────────────────────────────────────────────────────── */
    const eu = await get(SHEETS + 'json/' + term + '/election-results/eu.json', { json: true });
    const n = [];
    for (const g of (eu.groupDistribution || [])) {
      const slug = slugOfGroup.get(g.id) || groupSlug(g.id);
      const seats = Number(g.seatsTotal);
      if (!Number.isFinite(seats)) continue;
      const row = { p: 'eu:' + slug, seats };
      if (Number.isFinite(Number(g.seatsPercentEU))) row.pct = Number(g.seatsPercentEU);
      n.push(row);
    }
    n.sort((a, b) => b.seats - a.seats);
    const seatsTotal = Number(eu.seatsTotal);
    const seatSum = n.reduce((s, r) => s + r.seats, 0);
    if (!Number.isFinite(seatsTotal) || seatSum !== seatsTotal) {
      throw new Error(term + ': the groups hold ' + seatSum + ' seats but the chamber is ' + seatsTotal);
    }
    /* and the member states' delegations must add up to the same chamber */
    if (seatSumFromCountries !== seatsTotal) {
      throw new Error(term + ': the member states hold ' + seatSumFromCountries + ' seats but the chamber is ' + seatsTotal);
    }

    /* ── the party table entries this term needs ────────────────────────────────────────────── */
    for (const [slug, names] of acronyms) {
      const id = 'eu:' + slug;
      const colour = pageColours.get(slug);
      if (parties[id] && !colour) continue;          /* keep the first (or the published) colour */
      const nm = {};
      for (const [k, v] of Object.entries(groupNames.get(slug) || names)) if (k !== '__long') nm[k] = v;
      if (!nm.en) nm.en = names.__long || slug;
      parties[id] = { n: nm, col: colour || (parties[id] && parties[id].col) || derivedColour(slug) };
    }

    /* ── geometry: the member states of this election, deduplicated across terms ────────────── */
    const features = countries.map(({ id }) => {
      const f = byCountry.get(id);
      const p = f.properties;
      return {
        type: 'Feature',
        properties: {
          cd: id,
          /* ⚠ `native` IS GISCO's CNTR_NAME, which is the country's name in its own language(s) —
             «Éire/Ireland», «Ελλάδα». `en` is NAME_ENGL. Both are the publisher's, not a guess. */
          n: { en: String(p.NAME_ENGL || p.CNTR_NAME || id), native: String(p.CNTR_NAME || p.NAME_ENGL || id) },
        },
        geometry: JSON.parse(JSON.stringify(f.geometry)),
      };
    }).sort((a, b) => a.properties.cd.localeCompare(b.properties.cd));
    const fc = { type: 'FeatureCollection', features };
    simplifyGeoJSON(fc, { tolerance: TOL, decimals: DECIMALS });
    const hash = createHash('sha1').update(JSON.stringify(fc.features.map(f => [f.properties.cd, f.geometry]))).digest('hex');
    let geoKey = seenGeo.get(hash);
    if (!geoKey) { geoKey = 'eu-ms-' + year + '.geo.json'; seenGeo.set(hash, geoKey); geo[geoKey] = fc; }

    const resKey = 'eu-' + year + '.res.json';
    res[resKey] = { d, n };

    /* ⚠ `districtSeats` MUST EQUAL THE NUMBER OF POLYGONS — the schema checks it, because for
       every other polity in this layer one polygon is one member. The European Parliament is the
       one chamber where that is not true: a polygon here is a whole national constituency holding
       between six and ninety-six members, and EVERY seat in the Parliament is won from a list
       inside one of them. So the pair below is the schema's bookkeeping, not a claim about the
       electoral system, and the numbers a reader is actually shown come from `n`, which is the
       Parliament's own seat distribution and sums to `seatsTotal`. */
    elections.push({
      id: 'eu-ep-' + year,
      polity: 'eu',
      body: {
        en: 'European Parliament', native: 'European Parliament', de: 'Europäisches Parlament',
        fr: 'Parlement européen', es: 'Parlamento Europeo', ru: 'Европейский парламент',
        ja: '欧州議会', ko: '유럽의회', 'zh-Hant': '歐洲議會', 'zh-Hans': '欧洲议会',
      },
      date,
      y: year,
      geo: geoKey,
      res: resKey,
      seatsTotal,
      districtSeats: features.length,
      listSeats: seatsTotal - features.length,
      note: noteFor(seatsTotal, features.length),
      src: SRC,
      lic: LIC,
    });
  }

  /* ── where the reader is put when they open the European Parliament ──────────────────────────
     ⚠ FROM EACH COUNTRY'S LARGEST POLYGON, NOT FROM EVERY VERTEX. France's constituency includes
     French Guiana, Réunion, Guadeloupe, Martinique and Mayotte, and Spain's includes the Canaries,
     so a box drawn round every vertex spans a third of the planet and shows the reader an empty
     ocean. The largest ring of each member state is its mainland in every case. */
  const newest = elections[elections.length - 1].geo;
  const box = [[Infinity, Infinity], [-Infinity, -Infinity]];
  for (const f of geo[newest].features) {
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    let best = null, bestN = -1;
    for (const poly of polys) if (poly[0].length > bestN) { bestN = poly[0].length; best = poly[0]; }
    for (const [x, y] of best) {
      box[0][0] = Math.min(box[0][0], x); box[0][1] = Math.min(box[0][1], y);
      box[1][0] = Math.max(box[1][0], x); box[1][1] = Math.max(box[1][1], y);
    }
  }

  return {
    polities: [{
      id: 'eu',
      /* ⚠ `native` HAS NO SINGLE ANSWER HERE — the Union has twenty-four equally official
         languages and «Europäische Union», «Union européenne» and «Ευρωπαϊκή Ένωση» are all the
         native name. English is one of them, so the English form stands in that slot rather than
         one of the other twenty-three being privileged over the rest. */
      n: {
        en: 'European Union', native: 'European Union', de: 'Europäische Union',
        fr: 'Union européenne', es: 'Unión Europea', ru: 'Европейский союз',
        ja: '欧州連合', ko: '유럽 연합', 'zh-Hant': '歐盟', 'zh-Hans': '欧盟',
      },
      home: box,
    }],
    parties,
    elections,
    geo,
    res,
  };
}
