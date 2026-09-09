/* ============================================================================
 *  IntMap · SOUTH KOREA — NATIONAL ASSEMBLY, 2020 AND 2024   (#R584)
 * ----------------------------------------------------------------------------
 *  300 members: 254 (2024) or 253 (2020) elected in single-member districts by simple plurality,
 *  and the rest from one national party list. ⚠ THE MAP CAN ONLY EVER ANSWER HALF THE QUESTION —
 *  the district fill says who took the ground, and the party-list vote beside it is the ballot that
 *  decided the other 46 seats, which nothing on the map can show. Both are recorded, and neither is
 *  presented as the other.
 *
 *  ══ THE PART THAT NEEDED A KEY, AND THE PART THAT DID NOT ══════════════════════════════════════
 *  data.go.kr serves the National Election Commission's results as CSV, but every request needs a
 *  registered `serviceKey` (measured 2026-09-09: 400/403 without one), which a build that anybody
 *  can re-run cannot have. The NEC's OWN open portal, data.nec.go.kr, publishes the same counts as
 *  XLSX with no key, no session and no registration, under 공공저작물 출처표시 (KOGL Type 1 —
 *  attribution only). That is where the numbers below come from, and the per-polling-station detail
 *  is aggregated here to the 합계 row the NEC itself prints for each constituency.
 *
 *  ⚠ THE WINNER IS NOT ASSUMED, IT IS COUNTED. Korea's district ballot is first-past-the-post, so
 *  the largest count IS the member — unlike Australia in the file next to this one. Where two
 *  candidates tie, or where nobody was counted at all, no winner is recorded and the district is
 *  drawn with no colour rather than with a guess.
 *
 *  ══ WHY ONLY TWO ELECTIONS ═════════════════════════════════════════════════════════════════════
 *  The NEC portal carries district results back to the 19th Assembly (2012). Boundaries are the
 *  limit, not results: Korea publishes constituency geometry as a legal SCHEDULE OF ADMINISTRATIVE
 *  UNITS (선거구 구역표), not as a shapefile, and the only openly-licensed renderings of it are the
 *  two OhmyNews dissolves used here (MIT). Measured 2026-09-09, that publisher has no equivalent
 *  repository for the 20th or 19th Assembly, so those two elections have counts and no ground, and
 *  a results file with no polygons would paint nothing. They are named in the build log instead.
 * ==========================================================================*/
import XLSX from 'xlsx';
import { simplifyGeoJSON } from '../lib/elections-geo.mjs';
import { createHash } from 'node:crypto';

export const about = 'South Korea · National Assembly 2020 & 2024 — NEC open portal results, OhmyNews district geometry';

/* ── boundaries ────────────────────────────────────────────────────────────────────────────────
   Two published dissolves of Statistics Korea's 행정동 boundaries into the constituencies in force
   at each poll. ⚠ MIT REQUIRES THE COPYRIGHT NOTICE TO TRAVEL WITH THE DATA, so it is part of the
   attribution line every election carries, not a line in a licence file nobody opens.
   ⚠ The two files do not describe a district the same way — the 2020 set carries the NEC's full
   name («대구광역시 동구을») in one field and the 2024 set carries an abbreviated province and an
   abbreviated constituency in two («대구», «동구을»). `read` is per-source for exactly that reason;
   everything after it is shared. */
const BOUNDARIES = [
  {
    id: 'kr-2024',
    assembly: 22,
    url: 'https://raw.githubusercontent.com/OhmyNews/2024_22_elec_map/main/2024_22_Elec_simplify.json',
    read: (p) => ({ sido: p.SIDO, name: p.SGG }),
    src: '2024. 4. 10. 22대 국회의원 총선거 선거구 지도 — Copyright (c) 2024 오마이뉴스 (MIT), dissolved from Statistics Korea 행정동 boundaries',
    lic: 'MIT',
  },
  {
    id: 'kr-2020',
    assembly: 21,
    url: 'https://raw.githubusercontent.com/OhmyNews/2020_21_elec_map/master/2020_21_elec_253_simple.json',
    read: (p) => {
      const at = String(p.SGG_2 || '').indexOf(' ');
      return { sido: String(p.SGG_2).slice(0, at), name: String(p.SGG_2).slice(at + 1) };
    },
    src: '2020. 4. 15. 21대 국회의원 총선거 선거구 지도 — Copyright (c) 2020 OhmyNews 오마이뉴스 (MIT), dissolved from Statistics Korea 행정동 boundaries',
    lic: 'MIT',
  },
];

/* ⚠ THE ONE DATASET ID IN THIS FILE, AND IT IS CHECKED. data.nec.go.kr numbers its file datasets;
   9 is «중앙선거관리위원회_국회의원선거 개표결과». The build reads the page title and refuses to
   go on if that id ever comes to mean something else, so this cannot quietly ship the presidential
   count as the legislative one. Which assemblies it holds is read off the page, not written here. */
const NEC_DATASET = 'http://data.nec.go.kr/open-data/file.do?dataId=9';
const NEC_DATASET_TITLE = '국회의원선거 개표결과';
const NEC_DOWNLOAD = 'http://data.nec.go.kr/file-download.do?attachFileId=';

/* ── polling days ──────────────────────────────────────────────────────────────────────────────
   ⚠ NOT DERIVABLE, AND NOT ON A FOUR-YEAR GRID EITHER. 공직선거법 §34 names the first Wednesday of
   April, but the 22nd Assembly was elected on 10 April 2024 (the second Wednesday) and the 21st on
   15 April 2020 (the third) because the statute counts from the end of the sitting term. The NEC's
   result workbooks carry no date at all. An assembly that is not in this table is skipped and named
   in the build log rather than dated by arithmetic. */
const POLLING_DAY = { 21: '2020-04-15', 22: '2024-04-10' };

/* ⚠ THE CHAMBER IS FIXED AT 300 BY 공직선거법 §21, AND THAT IS WHY NO LIST-SEAT COUNT IS TYPED
   ANYWHERE BELOW: the number of proportional seats is 300 minus however many districts the NEC's
   own results file turns out to contain (46 in 2024, 47 in 2020). If the Assembly is ever resized,
   this one number moves and both elections follow it. */
const ASSEMBLY_SEATS = 300;

/* ── party colours ─────────────────────────────────────────────────────────────────────────────
   Colours come from Wikidata's sRGB colour (P465) for the party item whose Korean label or alias
   matches the name the NEC printed, restricted to items whose country (P17) is South Korea.
   ⚠ THAT RESTRICTION IS THE WHOLE JOIN. Without it «노동당» matches the NORWEGIAN Labour Party,
   which is the #R515 mistake exactly: a search that returns something is not a search that returned
   the right thing. Anything the join cannot answer for keeps a generated hue and is named in the
   build log — a fabricated hex would look exactly as authoritative as a real one. */
const WDQS = 'https://query.wikidata.org/sparql';
const PARTY_COLOUR = {
  /* ⚠ Wikidata records no P465 for 미래통합당, which held 84 districts in 2020 — a fifth of the
     map, and by far the largest gap the join leaves. The value is not invented: 미래한국당 is the
     proportional list 미래통합당 registered for that same election, it is the same organisation on
     the other half of the ballot, and Wikidata records #EF426F for it. Delete this the day the
     parent item gets its own P465. */
  '미래통합당': '#ef426f',
  /* ⚠ THE SAME GAP, THE SAME REASON, THE OTHER WAY ROUND — AND IT IS 위성정당, NOT AN ODDITY.
     Korea's 준연동형 formula makes it worth a large party's while to register a separate list under
     a separate name, so in 2024 the two largest parties fought the district half and the list half
     under different names: 더불어민주연합 is 더불어민주당's list and 국민의미래 is 국민의힘's, and
     between them they took the majority of the party-list ballot. Wikidata knows both items
     (Q124734409, Q125055993, measured 2026-09-10) and records no P465 for either, so without this
     the two biggest bars on the 2024 chart would be washed-out generated hues — while the parent
     they ARE sits beside them in its own colour. The value is not invented: it is the parent's own
     P465, which is also what Korean broadcasters painted them on the night. Delete each line the
     day its item gets a P465 of its own. */
  '더불어민주연합': '#152484',   /* = 더불어민주당 (Q15978686) P465 */
  '국민의미래': '#e61e2b',       /* = 국민의힘 (Q85412437) P465 */
  /* ⚠ NOT A PARTY. 무소속 is «no party», and giving it a party colour would say the independents
     belong to something. The same neutral grey the Australian pack uses for the same reason. */
  '무소속': '#8e8e93',
};

/* ⚠ ~90 m at this latitude, which is deliberately fine. Korea's constituencies are small and dense
   — Seoul alone holds 48 of them — and this layer is read zoomed in, so the boundary between two
   halves of one 구 has to survive. Measured on the 254-district file, 2026-09-09: source 1.05 MB,
   rounding alone 0.58 MB, 0.001° → 0.56 MB, 0.002° → 0.46 MB, 0.005° → 0.25 MB. Most of the saving
   is the rounding, not the thinning, so thinning harder buys little and costs city detail. */
const TOLERANCE_DEG = 0.001;
const PRECISION = 5;

/* ══ helpers ═══════════════════════════════════════════════════════════════════════════════════ */

const num = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v == null ? '' : v).replace(/,/g, '').trim();
  if (!s || !/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
};

/** ⚠ THE TWO SIDES SPELL THE SAME CONSTITUENCY DIFFERENTLY AND BOTH SPELLINGS ARE CORRECT. The NEC
 *  writes the legal name («중구성동구갑», «세종특별자치시갑», «강서구갑»); the maps write the name
 *  a reader sees on a ballot board («중구성동갑», «세종갑», «강서갑»). The difference is exactly the
 *  administrative unit words 시 · 군 · 구, plus the province name where the constituency repeats it.
 *  Dropping those characters from BOTH sides is what makes the two agree — and because it is
 *  applied to both, an over-eager strip cannot silently mis-join: the build asserts that the result
 *  is a one-to-one match of every district on both sides and fails loudly if it is not. */
function districtKey(sidoFull, sidoShort, name) {
  let n = String(name || '').trim();
  for (const prefix of [sidoFull, sidoShort]) {
    if (prefix && n.length > prefix.length && n.startsWith(prefix)) { n = n.slice(prefix.length); break; }
  }
  return sidoFull + '|' + n.replace(/[\s시군구]/g, '');
}

/** The abbreviated province on a map («충북», «경남») against the legal name the NEC prints
 *  («충청북도», «경상남도»): the short form is the long form with characters left out, in order.
 *  Resolved by that and by nothing else, and only when exactly one province can be meant. */
function resolveSido(short, fullNames) {
  const isSubsequence = (a, b) => { let i = 0; for (const c of b) if (c === a[i]) i++; return i === a.length; };
  const hit = fullNames.filter(f => f === short || isSubsequence(short, f));
  if (hit.length !== 1) throw new Error('kr: «' + short + '» matches ' + hit.length + ' provinces');
  return hit[0];
}

/** A colour for a party nobody colours — deterministic, deliberately unsaturated so it cannot be
 *  mistaken for a party's own brand, and always reported by the caller. */
function derivedColour(seed) {
  const h = createHash('sha256').update(seed).digest();
  const hue = (h[0] * 360) / 256, sat = 0.30 + (h[1] / 256) * 0.16, lig = 0.46 + (h[2] / 256) * 0.14;
  const c = (1 - Math.abs(2 * lig - 1)) * sat, x = c * (1 - Math.abs(((hue / 60) % 2) - 1)), m = lig - c / 2;
  const [r, g, b] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(hue / 60) % 6];
  return '#' + [r, g, b].map(v => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('');
}

/* ══ the NEC workbook ══════════════════════════════════════════════════════════════════════════
   Both sheets have the same unusual shape: a header row, then for each area a row of PARTY names,
   a row of CANDIDATE names under them, and then one row per polling station. The counts live in
   the same columns as the names above them, so a column is a candidate — reading the header alone
   tells you nothing about who stood where. */

/** Where the per-candidate columns stop: the first labelled column after them is the «계» total. */
function candidateColumns(header, from) {
  for (let i = from + 1; i < header.length; i++) if (header[i] != null && String(header[i]).trim()) return i;
  return header.length;
}

function readDistrictSheet(sheet) {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, blankrows: false });
  const header = rows[0];
  const FIRST = 6;                       /* 시도 · 선거구 · 읍면동 · 투표구 · 선거인수 · 투표수 */
  const stop = candidateColumns(header, FIRST);
  const out = new Map();                 /* «시도\u0000선거구» → { sido, name, parties, cands, votes, ballots } */
  for (const r of rows.slice(1)) {
    const sido = r[0], name = r[1];
    if (!sido || !name) continue;
    const k = sido + '\u0000' + name;
    if (!out.has(k)) out.set(k, { sido, name, parties: null, cands: null, votes: null, ballots: null });
    const rec = out.get(k);
    const sub = String(r[2] == null ? '' : r[2]).trim();
    if (sub === '') {
      /* the two unlabelled rows are the party row and then the candidate row beneath it */
      const cells = r.slice(FIRST, stop).map(v => (v == null ? '' : String(v).trim()));
      if (!rec.parties) rec.parties = cells; else if (!rec.cands) rec.cands = cells;
    } else if (sub === '합계') {
      rec.votes = r.slice(FIRST, stop).map(num);
      rec.ballots = num(r[5]);
    }
  }
  return out;
}

/** The party-list half. One «전체» row carries the national count for every party on the ballot. */
function readListSheet(sheet) {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, blankrows: false });
  const header = rows[0];
  const FIRST = 6;
  const stop = candidateColumns(header, FIRST);
  const parties = rows[1].slice(FIRST, stop).map(v => (v == null ? '' : String(v).trim()));
  const total = rows.find(r => String(r[0] || '').trim() === '전체');
  if (!total) return null;
  const votes = total.slice(FIRST, stop).map(num);
  return parties.map((p, i) => ({ p, v: votes[i] })).filter(x => x.p && x.v != null);
}

/* ══ build ═════════════════════════════════════════════════════════════════════════════════════ */

export async function build(ctx) {
  const notes = [];

  /* ── which assemblies the NEC currently publishes ─────────────────────────────────────────── */
  const page = await ctx.get(NEC_DATASET, { text: true });
  if (!page.includes(NEC_DATASET_TITLE)) {
    throw new Error('kr: ' + NEC_DATASET + ' is no longer «' + NEC_DATASET_TITLE + '»');
  }
  const workbooks = new Map();   /* assembly number → attachFileId */
  for (const m of page.matchAll(/href="\/file-download\.do[^"]*attachFileId=(\d+)"[^>]*title="제(\d+)대 국회의원선거 개표결과\.xlsx/g)) {
    workbooks.set(Number(m[2]), m[1]);
  }
  if (!workbooks.size) throw new Error('kr: the NEC dataset page listed no result workbooks');

  /* ── parties, collected over everything before any of them is named ───────────────────────── */
  const seenParties = new Set();
  const sheets = new Map();
  for (const [assembly, attach] of workbooks) {
    if (!BOUNDARIES.some(b => b.assembly === assembly)) {
      notes.push('제' + assembly + '대: results published, but no openly licensed constituency map');
      continue;
    }
    if (!POLLING_DAY[assembly]) { notes.push('제' + assembly + '대: no polling day recorded'); continue; }
    const wb = XLSX.read(await ctx.get(NEC_DOWNLOAD + attach), { type: 'buffer' });
    const districts = readDistrictSheet(wb.Sheets['지역구']);
    const list = wb.Sheets['비례대표'] ? readListSheet(wb.Sheets['비례대표']) : null;
    sheets.set(assembly, { districts, list });
    for (const rec of districts.values()) for (const p of rec.parties || []) if (p) seenParties.add(p);
    for (const row of list || []) seenParties.add(row.p);
  }
  if (!sheets.size) throw new Error('kr: no assembly could be built');

  /* ── colours and English names, asked of Wikidata once ────────────────────────────────────── */
  const wikidata = await lookupParties(ctx, [...seenParties]);
  const parties = {}, usedParty = new Set(), generated = new Set();
  const partyId = (koreanName) => {
    if (!koreanName) return null;
    const id = 'kr:' + createHash('sha1').update(koreanName).digest('hex').slice(0, 8);
    if (!parties[id]) {
      const wd = wikidata.get(koreanName);
      const col = PARTY_COLOUR[koreanName] || (wd && wd.col) || null;
      if (!col) generated.add(koreanName);
      parties[id] = {
        /* ⚠ NO ENGLISH NAME IS INVENTED. Most of the 40 lists on a Korean ballot have never had
           one; where Wikidata knows the party it supplies it, and where it does not the reader is
           shown the name that was actually on the ballot rather than a transliteration. */
        n: { en: (wd && wd.en) || koreanName, native: koreanName, ko: koreanName },
        col: col || derivedColour(koreanName),
      };
    }
    return id;
  };

  /* ── one election per assembly ────────────────────────────────────────────────────────────── */
  const geo = {}, res = {}, elections = [];
  const allCentroids = [];

  for (const [assembly, { districts, list }] of sheets) {
    const boundary = BOUNDARIES.find(b => b.assembly === assembly);
    const sidoNames = [...new Set([...districts.values()].map(r => r.sido))];

    const raw = await ctx.get(boundary.url, { json: true });

    /* ⚠ THE KEY NEEDS THE MAP'S ABBREVIATION TO BUILD THE NEC'S SIDE OF IT. The NEC writes
       «제주시갑» and the 2024 map writes «제주갑»: both repeat the province inside the constituency
       name, but each repeats its own spelling of it. So the abbreviations are read off the map
       FIRST, and then the same (full, short) pair keys both sides — keying the NEC side with no
       abbreviation leaves 제주 and 세종 unjoinable, which is where this was measured. */
    const shortOf = new Map();
    for (const f of raw.features || []) {
      const { sido } = boundary.read(f.properties || {});
      const full = resolveSido(sido, sidoNames);
      if (shortOf.has(full) && shortOf.get(full) !== sido) {
        throw new Error('kr: the map calls ' + full + ' both «' + shortOf.get(full) + '» and «' + sido + '»');
      }
      shortOf.set(full, sido);
    }

    const byKey = new Map();
    for (const rec of districts.values()) {
      const key = districtKey(rec.sido, shortOf.get(rec.sido), rec.name);
      if (byKey.has(key)) throw new Error('kr: 제' + assembly + '대 · two constituencies reduce to ' + key);
      byKey.set(key, rec);
    }

    const features = [], matched = new Set();
    for (const f of raw.features || []) {
      const { sido, name } = boundary.read(f.properties || {});
      const full = resolveSido(sido, sidoNames);
      const key = districtKey(full, sido, name);
      const rec = byKey.get(key);
      if (!rec) throw new Error('kr: 제' + assembly + '대 · the map has «' + sido + ' ' + name + '» and the NEC does not');
      if (matched.has(key)) throw new Error('kr: 제' + assembly + '대 · two polygons claim ' + key);
      matched.add(key);
      features.push({
        type: 'Feature',
        /* the code is the NEC's own legal name for the constituency, which is what the results are
           filed under; the label the reader sees is the ballot-board name from the map */
        properties: {
          cd: rec.sido + ' ' + rec.name,
          n: { en: sido + ' ' + name, native: sido + ' ' + name, ko: sido + ' ' + name },
        },
        geometry: f.geometry,
      });
    }
    /* ⚠ CHECKED IN BOTH DIRECTIONS. A map short of a constituency leaves a hole that reads as
       «nobody won here»; a results row with no polygon paints nothing at all. */
    if (matched.size !== byKey.size) {
      const missing = [...byKey.keys()].filter(k => !matched.has(k));
      throw new Error('kr: 제' + assembly + '대 · ' + missing.length + ' constituencies have no polygon: ' + missing.slice(0, 4).join(', '));
    }

    const fc = simplifyGeoJSON({ type: 'FeatureCollection', features }, { tolerance: TOLERANCE_DEG, decimals: PRECISION });
    const geoId = boundary.id + '.geo.json';
    geo[geoId] = fc;
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

    /* ── the counts ─────────────────────────────────────────────────────────────────────────── */
    const d = {}, dseats = new Map();
    for (const rec of byKey.values()) {
      const row = { c: [] };
      let top = -1, topAt = -1, tied = false;
      for (let i = 0; i < (rec.parties || []).length; i++) {
        if (!rec.parties[i] && !(rec.cands && rec.cands[i])) continue;
        const v = rec.votes ? rec.votes[i] : null;
        const pid = partyId(rec.parties[i]);
        if (pid) usedParty.add(pid);
        row.c.push({
          n: (rec.cands && rec.cands[i]) || rec.parties[i],
          ...(pid ? { p: pid } : {}),
          ...(v != null ? { v } : {}),
        });
        if (v != null) { if (v > top) { top = v; topAt = i; tied = false; } else if (v === top) tied = true; }
      }
      /* ⚠ plurality: the largest count IS the member. A tie is not a winner, and neither is an
         empty count — both leave `w` off, and the district is drawn without a colour. */
      if (topAt >= 0 && !tied) {
        const pid = partyId(rec.parties[topAt]);
        if (pid) { row.w = pid; usedParty.add(pid); dseats.set(pid, (dseats.get(pid) || 0) + 1); }
      }
      if (rec.ballots != null) row.t = rec.ballots;
      if (!row.c.length) delete row.c; else row.c.sort((a, b) => (b.v || 0) - (a.v || 0));
      d[rec.sido + ' ' + rec.name] = row;
    }

    /* ⚠ `seats` IS NOT RECORDED, AND THAT IS DELIBERATE. The NEC's open-portal workbooks carry the
       district counts and the party-list VOTES, but not the party-list SEATS — the 준연동형 formula
       that turns one into the other is not in any file here, and 46 of the chamber's 300 members
       are decided by it. So each row states the seats it can prove (`dseats`) and the share of the
       list ballot (`pct`), and says nothing about a chamber total it does not know. */
    const listTotal = (list || []).reduce((a, r) => a + r.v, 0);
    const n = [];
    const rowFor = new Map();
    for (const [pid, seats] of dseats) { const r = { p: pid, dseats: seats }; rowFor.set(pid, r); n.push(r); }
    for (const row of list || []) {
      const pid = partyId(row.p);
      usedParty.add(pid);
      let r = rowFor.get(pid);
      if (!r) { r = { p: pid, dseats: 0 }; rowFor.set(pid, r); n.push(r); }
      if (listTotal) r.pct = Math.round((row.v / listTotal) * 1e4) / 100;
    }
    n.sort((a, b) => b.dseats - a.dseats || (b.pct || 0) - (a.pct || 0));

    const districtSeats = Object.keys(d).length;
    const resId = 'kr-na-' + POLLING_DAY[assembly].slice(0, 4) + '.res.json';
    res[resId] = { d, n };
    elections.push({
      id: 'kr-na-' + POLLING_DAY[assembly].slice(0, 4),
      polity: 'kr',
      body: { en: 'National Assembly', native: '국회', ko: '국회', ja: '国会' },
      date: POLLING_DAY[assembly],
      y: Number(POLLING_DAY[assembly].slice(0, 4)),
      geo: geoId,
      res: resId,
      seatsTotal: ASSEMBLY_SEATS,
      districtSeats,
      listSeats: ASSEMBLY_SEATS - districtSeats,
      src: 'Results: 중앙선거관리위원회 국가선거정보 개방포털 «국회의원선거 개표결과» (제' + assembly +
        '대). District seats are counted; the ' + (ASSEMBLY_SEATS - districtSeats) +
        ' proportional seats are not in the published file and are not attributed to any party here. ' + boundary.src,
      lic: 'Results: KOGL Type 1 (공공저작물 출처표시). Boundaries: ' + boundary.lic,
    });
  }

  for (const id of Object.keys(parties)) if (!usedParty.has(id)) delete parties[id];
  if (generated.size) {
    notes.push('no upstream colour, generated hue: ' + [...generated].filter(p => {
      const id = 'kr:' + createHash('sha1').update(p).digest('hex').slice(0, 8);
      return usedParty.has(id);
    }).join(', '));
  }
  if (notes.length) console.log('    kr · ' + notes.join(' · '));

  /* the home view, from the polygons that were actually shipped */
  const lons = allCentroids.map(c => c[0]), lats = allCentroids.map(c => c[1]);
  const PAD = 0.6;
  return {
    polities: [{
      id: 'kr',
      n: {
        en: 'South Korea', native: '대한민국', ko: '대한민국', ja: '韓国', de: 'Südkorea',
        ru: 'Республика Корея', es: 'Corea del Sur', fr: 'Corée du Sud',
        'zh-Hant': '南韓', 'zh-Hans': '韩国',
      },
      home: [
        [Math.min(...lons) - PAD, Math.min(...lats) - PAD],
        [Math.max(...lons) + PAD, Math.max(...lats) + PAD],
      ],
    }],
    parties,
    elections: elections.sort((a, b) => b.y - a.y),
    geo,
    res,
  };
}

/** ⚠ ONE ROUND TRIP FOR THE WHOLE PACK, AND IT ASKS THE OPPOSITE QUESTION TO THE OBVIOUS ONE.
 *  The obvious query is «for these 36 names, which Korean party is called that», carried in a
 *  VALUES block. MEASURED 2026-09-10 against query.wikidata.org, with the pack's own 36 names:
 *  1 name 5.0 s, 2 names 2.9 s, 4 names 9.6 s, 8 names **502 after 17.8 s**, 16 names 38.9 s, and
 *  the full 36 — which is what this pack actually needs — **504**. The cost is superlinear in the
 *  size of the VALUES block, so chunking does not rescue it: it turns one failure into several.
 *  Asking instead for EVERY political party whose country is South Korea, with its Korean labels
 *  and aliases, is one query of a fixed size that does not grow with the ballot: 41 s, 176 KB,
 *  346 rows, 304 distinct Korean names — and the name join then happens here, in memory, where it
 *  cannot time out. Re-check this if the endpoint ever answers the VALUES form reliably; until
 *  then a build that anybody can re-run has to use the form that returns.
 *
 *  ⚠ `wdt:P17 wd:Q884` is not decoration: see the note on PARTY_COLOUR. `wdt:P31/wdt:P279* wd:Q7278`
 *  is the second half of the same guard — without it the answer set is every item in Korea that
 *  happens to share a name with a party, which is the #R515 mistake in a different costume.
 *
 *  ⚠ AN ALIAS IS NOT A NAME. «진보당» is the registered name of one party AND a former alias of
 *  another (통합진보당, dissolved 2014), and a query that treats the two alike returns whichever row
 *  the endpoint happened to order first — which is how this file first painted the 2024 Progressive
 *  Party in the 2011 Unified Progressive Party's purple. Every row says which kind of match it is,
 *  the reader below prefers real names, and it refuses when even those do not agree: measured,
 *  «국민의당» is the exact registered name of TWO different parties (2016 and 2020) whose English
 *  names disagree, so no English name is claimed for it at all. Two answers is not an answer. */
async function lookupParties(ctx, names) {
  const query = 'SELECT ?p ?ko ?exact ?col ?en WHERE { ' +
    '?p wdt:P17 wd:Q884 ; wdt:P31/wdt:P279* wd:Q7278 . ' +
    '{ ?p rdfs:label ?ko . BIND(1 AS ?exact) } UNION { ?p skos:altLabel ?ko . BIND(0 AS ?exact) } ' +
    'FILTER(lang(?ko)="ko") ' +
    'OPTIONAL { ?p wdt:P465 ?col } OPTIONAL { ?p rdfs:label ?en FILTER(lang(?en)="en") } }';
  const url = WDQS + '?format=json&query=' + encodeURIComponent(query);

  /* ⚠ A 502 FROM THIS ENDPOINT IS NOT AN ANSWER, IT IS THE PROXY IN FRONT OF IT GIVING UP. It was
     measured on an identical query that succeeded on the next attempt, so a single failure must not
     end the build — but a persistent one must, because the alternative is shipping 36 invented
     hues that look exactly as authoritative as the real ones. */
  let rows = null, last = null;
  for (let attempt = 0; attempt < 3 && rows == null; attempt++) {
    if (attempt) await new Promise(r => setTimeout(r, 5000 * attempt));
    try { rows = (await ctx.get(url, { json: true })).results.bindings; } catch (e) { last = e; }
  }
  if (rows == null) throw new Error('kr: Wikidata would not answer for party colours — ' + (last && last.message));

  const byName = new Map();
  for (const b of rows) {
    const k = b.ko.value;
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k).push({
      exact: Number(b.exact.value) === 1,
      col: b.col ? '#' + String(b.col.value).replace(/^#/, '').toLowerCase() : null,
      en: b.en ? b.en.value : null,
    });
  }
  const found = new Map();
  for (const k of names) {
    const all = byName.get(k);
    if (!all) continue;
    const best = all.some(r => r.exact) ? all.filter(r => r.exact) : all;
    const agreed = (field) => {
      const vals = [...new Set(best.map(r => r[field]).filter(Boolean))];
      return vals.length === 1 ? vals[0] : null;
    };
    found.set(k, { col: agreed('col'), en: agreed('en') });
  }
  return found;
}
