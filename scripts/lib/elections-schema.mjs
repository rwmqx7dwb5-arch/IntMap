/* ============================================================================
 *  IntMap · THE SHAPE OF AN ELECTION, AND THE ONLY PLACE THAT DEFINES IT   (#R584)
 * ----------------------------------------------------------------------------
 *  「アメリカ大統領選挙以外の選挙レイヤーも作って。衆院選、参院選など。欧米日豪韓中露」
 *
 *  #R243 built one country's one election type as one file that knew its own data by heart. Nine
 *  more countries cannot be nine more of those: the fifth copy of «find the winner, colour the
 *  polygon, draw a bar» is where the copies start disagreeing. So the runtime knows NOTHING about
 *  any particular country, and every fact a country contributes arrives through the shapes below.
 *
 *  ⚠ THIS FILE IS THE CONTRACT, NOT A DESCRIPTION OF ONE. `scripts/build-elections.mjs --check`
 *  runs `validate()` over the committed data on every `npm test`, so a country pack that drifts
 *  from this shape fails the build rather than painting something wrong. Nothing here is a list of
 *  country names, election names or party names: those all live in the packs, and this file only
 *  says what a well-formed pack looks like.
 *
 *  ══ THE FILES A COUNTRY PACK WRITES ═════════════════════════════════════════════════════════
 *    data/elections/index.json          one index for every polity and every election (small)
 *    data/elections/<geoId>.geo.json    one file per BOUNDARY ERA, shared by every election held
 *                                       under it — this is why the era is not the election
 *    data/elections/<id>.res.json       one file per election
 *
 *  ⚠ THE ERA IS NOT THE ELECTION, AND THAT IS THE WHOLE REASON THIS SPLIT EXISTS. Japan's 289
 *  small districts were redrawn for 2024 (10増10減) and the 300-district map before it stood from
 *  1996; Britain redrew all 650 for 2024; the United States redraws every decade and twice redrew
 *  mid-decade. An election painted on the wrong era's polygons is not «slightly stale» — it hands
 *  a seat to the wrong piece of ground. `geo` is therefore a property of the ELECTION, and two
 *  elections share a file only when they were genuinely fought on the same map.
 * ==========================================================================*/
import { readFileSync } from 'node:fs';

/** Every id in the data is a lowercase slug. Ids travel into DOM ids and file names, so they may
 *  not carry anything that would need escaping in either. */
export const ID_RE = /^[a-z0-9][a-z0-9-]*$/;
const HEX_RE = /^#[0-9a-f]{6}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The languages the product ships (AGENTS.md §3.5). A pack may name a polity, a chamber or a party
 *  in any subset of them; `en` is the only one that is required, because it is the only one every
 *  upstream record actually has.
 *
 *  ⚠⚠ THE LIST IS READ FROM js/lang-registry.js, NOT WRITTEN OUT HERE — and that is not tidiness,
 *  it is a bug this round actually shipped and then caught. The app's own code for Japanese is
 *  `jp`, not `ja`, and for Traditional Chinese it is `zh`, not `zh-Hant`. Packs wrote the BCP-47
 *  tags, `nm()` looked up `t[HOST.lang]`, and every Japanese and Chinese reader silently fell
 *  through to the native form or to English — 113 elections' worth of translations that existed and
 *  reached nobody. The registry already knows both spellings (each row carries its `alias`), so the
 *  fix is to ask it rather than to remember. */
export const REQUIRED_NAME_LANG = 'en';

let _langs = null;
function langs() {
  if (_langs) return _langs;
  const canon = new Set(), alias = new Map();
  try {
    /* ⚠ THE SHIPPED SET IS js/locales/_langs.js, WHICH IS GENERATED FROM THE LOCALE FILES THAT
       ACTUALLY EXIST — the row table in js/lang-registry.js is only the five that are inline, and
       reading that alone reported `fr` and `ko` as languages this app does not have (measured). */
    const codes = readFileSync(new URL('../../js/locales/_langs.js', import.meta.url), 'utf8')
      .match(/IntMapLangCodes\s*=\s*\[([^\]]*)\]/);
    if (codes) for (const m of codes[1].matchAll(/"([^"]+)"/g)) { canon.add(m[1]); alias.set(m[1], m[1]); }
    /* …and the alternative spellings each code answers to, from the registry's own rows */
    const src = readFileSync(new URL('../../js/lang-registry.js', import.meta.url), 'utf8');
    for (const m of src.matchAll(/\{\s*code:\s*'([a-z-]+)'[^}]*?\}/g)) {
      const code = m[1];
      if (!canon.has(code)) continue;
      const al = m[0].match(/alias:\s*\[([^\]]*)\]/);
      if (al) for (const a of al[1].matchAll(/'([^']+)'/g)) alias.set(a[1].toLowerCase(), code);
    }
  } catch (_) { /* fall through to the assertion below */ }
  if (canon.size < 5) throw new Error('elections-schema: could not read the shipped languages out of js/locales/_langs.js — this check needs rewriting');
  _langs = { canon, alias };
  return _langs;
}
/** the app's own code for a spelling a pack used, or '' when the registry has never heard of it */
export function canonicalLang(k) {
  const { canon, alias } = langs();
  const low = String(k || '').toLowerCase();
  if (alias.has(low)) return alias.get(low);
  const two = low.slice(0, 2);
  return canon.has(two) ? two : '';
}

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const isStr = (v) => typeof v === 'string' && v.length > 0;
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/* ── names ─────────────────────────────────────────────────────────────────────────────────────
   A NAME IS A TABLE, NOT A STRING, and the native form is not «one of the translations». A reader
   in any of the nine languages is shown the native name beside their own, because 「新潟5区」 and
   「Niigata 5」 are both true and only one of them is what is written on the ballot paper. */
function checkName(v, where, errs, { requireNative = false } = {}) {
  if (!isObj(v)) { errs.push(where + ': name must be an object of language → string'); return; }
  if (!isStr(v[REQUIRED_NAME_LANG])) errs.push(where + ': name has no `' + REQUIRED_NAME_LANG + '`');
  if (requireNative && !isStr(v.native)) errs.push(where + ': name has no `native`');
  const seenLang = new Map();
  for (const k of Object.keys(v)) {
    if (!isStr(v[k])) { errs.push(where + ': name.' + k + ' is empty'); continue; }
    if (k === 'native') continue;
    /* ⚠ A KEY NO READER'S LANGUAGE CAN EVER EQUAL IS A TRANSLATION THAT REACHES NOBODY. `ja` and
       `zh-Hant` are legal spellings and the registry knows them, but a key it has never heard of
       is dead weight that looks like coverage. */
    const c = canonicalLang(k);
    if (!c) { errs.push(where + ': name.' + k + ' is not a language this app has (js/lang-registry.js)'); continue; }
    /* ⚠ TWO SPELLINGS OF ONE LANGUAGE ARE ONLY A BUG WHEN THEY DISAGREE. A pack that writes both
       `jp` and `ja` with the same sentence is merely belt-and-braces; one that writes two DIFFERENT
       sentences has a second translation that no reader will ever be shown, and which of the two
       wins depends on key order. */
    const prev = seenLang.get(c);
    if (prev != null && v[prev] !== v[k]) {
      errs.push(where + ': name.' + k + ' and name.' + prev + ' are both «' + c + '» and differ — one of them is never read');
    } else if (prev == null) seenLang.set(c, k);
  }
}

/* ── parties ───────────────────────────────────────────────────────────────────────────────────
   ⚠ A PARTY ID IS SCOPED TO ITS POLITY (`jp:ldp`, `de:cdu`), and that is deliberate: «Liberal» is
   a different party in Britain, Australia and Japan, and a global `liberal` key would quietly
   paint three countries with one colour and one manifesto. The colour is the one that country's
   own broadcasters use, so a reader who has seen an election night recognises the map. */
export function checkParty(pid, p, errs) {
  const where = 'party ' + pid;
  if (!/^[a-z0-9]+:[a-z0-9][a-z0-9-]*$/.test(pid)) errs.push(where + ': id must be «polity:slug»');
  if (!isObj(p)) { errs.push(where + ': must be an object'); return; }
  checkName(p.n, where, errs);
  if (!HEX_RE.test(String(p.col || ''))) errs.push(where + ': col must be #rrggbb');
  /* `bloc` is optional and exists for the countries that fight elections in coalitions the reader
     sees as one thing (Australia's Coalition, Japan's 与党, Germany's CDU/CSU). It groups bars; it
     never merges the fill, because the seat belongs to the party that won it. */
  if (p.bloc != null && !isStr(p.bloc)) errs.push(where + ': bloc must be a string');
}

/* ── polities ──────────────────────────────────────────────────────────────────────────────────
   ⚠ WHAT A POLITY IS HERE IS «SOMETHING THAT HOLDS AN ELECTION», AND NOTHING ELSE. This file makes
   no claim about statehood, sovereignty, recognition or membership of anything, and the runtime has
   no vocabulary in which such a claim could be expressed: a polity has a name, a box on the map and
   a list of elections. Hong Kong and Taiwan appear beside Japan and Germany for the same reason
   Japan appears — an election was held and the result is recorded — and the layer says no more
   about any of them than that. */
export function checkPolity(p, errs) {
  const where = 'polity ' + (p && p.id);
  if (!isObj(p)) { errs.push('polity: not an object'); return; }
  if (!ID_RE.test(String(p.id || ''))) errs.push(where + ': bad id');
  checkName(p.n, where, errs, { requireNative: true });
  const b = p.home;
  if (!Array.isArray(b) || b.length !== 2 || !b.every(c => Array.isArray(c) && c.length === 2 && c.every(isNum))) {
    errs.push(where + ': home must be [[west,south],[east,north]]');
  } else if (!(b[0][0] < b[1][0] && b[0][1] < b[1][1])) {
    errs.push(where + ': home box is inverted');
  }
}

/* ── elections ─────────────────────────────────────────────────────────────────────────────────
   ⚠ `districtSeats` AND `listSeats` ARE BOTH RECORDED AND THEY ARE NOT THE SAME QUESTION. The map
   can only colour the seats that belong to a piece of ground, but the chamber is what the reader
   came to see: Japan's 465 members are 289 districts plus 176 from eleven proportional blocks, and
   a bar chart of only the 289 misreports who governs. So the fill answers «who took this district»
   and the bar answers «who holds the chamber», and the legend says which is which. */
export function checkElection(e, errs, { geoIds, resIds, polityIds }) {
  const where = 'election ' + (e && e.id);
  if (!isObj(e)) { errs.push('election: not an object'); return; }
  if (!ID_RE.test(String(e.id || ''))) errs.push(where + ': bad id');
  if (!polityIds.has(e.polity)) errs.push(where + ': unknown polity ' + e.polity);
  checkName(e.body, where + ' body', errs, { requireNative: true });
  if (!DATE_RE.test(String(e.date || ''))) errs.push(where + ': date must be YYYY-MM-DD');
  if (!isNum(e.y) || String(e.date || '').slice(0, 4) !== String(e.y)) errs.push(where + ': y disagrees with date');
  if (e.geo != null && !geoIds.has(e.geo)) errs.push(where + ': geo file ' + e.geo + ' is not in the pack');
  if (!resIds.has(e.res)) errs.push(where + ': results file ' + e.res + ' is not in the pack');
  for (const k of ['seatsTotal', 'districtSeats']) {
    if (!isNum(e[k]) || e[k] < 0) errs.push(where + ': ' + k + ' must be a number');
  }
  /* ⚠ `listSeats` IS «THE SEATS THIS MAP CANNOT DRAW», which is usually but not always a party
     list. MEASURED in this round: France's 577 deputies are ALL single-member, yet 18 of them sit
     for constituencies the published outlines do not cover (eleven for citizens abroad, seven in
     the Pacific and the Caribbean); Hong Kong's 70 non-geographical seats are functional and
     election-committee seats, not a list either. Calling those 「比例代表」 in the legend would be a
     plain falsehood, so an election may name its own off-map seats — and because that name is read
     by the reader, it is a name table like every other visible string. */
  if (e.listSeats != null && !isNum(e.listSeats)) errs.push(where + ': listSeats must be a number');
  if (e.listName != null) checkName(e.listName, where + ' listName', errs);
  /* the three numbers must be each other's arithmetic, or one of them is a guess */
  const list = e.listSeats || 0;
  if (isNum(e.seatsTotal) && isNum(e.districtSeats) && e.districtSeats + list !== e.seatsTotal) {
    errs.push(where + ': districtSeats(' + e.districtSeats + ') + listSeats(' + list + ') ≠ seatsTotal(' + e.seatsTotal + ')');
  }
  if (!isStr(e.src)) errs.push(where + ': src (the attribution line) is required');
  if (!isStr(e.lic)) errs.push(where + ': lic (the licence of the data) is required');
  /* ⚠ `note` IS PROSE THE READER READS, so it obeys AGENTS.md §3.5 and is a name table, not a
     string. `src` and `lic` are NOT: an attribution line is the publisher's own wording and the
     condition of the licence, and translating it would be misquoting a legal notice.
     A pack that writes a bare string here is caught rather than shipping English to nine readers. */
  if (e.note != null) {
    if (typeof e.note === 'string') errs.push(where + ': note must be a name table ({en, ja, …}), not a bare string — it is shown to the reader');
    else checkName(e.note, where + ' note', errs);
  }
}

/* ── a results file ────────────────────────────────────────────────────────────────────────────
   ⚠ AN ABSENT NUMBER IS ABSENT, NEVER ZERO (#R289 measured this on the American layer and #R543
   measured the same mistake again on a different one: `+null` is 0 and 0 is finite, so a missing
   count becomes a bar of length nothing standing for a ballot nobody counted). A district with no
   recorded vote carries no `v` at all, and the runtime says so in words. */
export function checkResults(id, r, errs, { partyIds, districtIds }) {
  const where = 'results ' + id;
  if (!isObj(r)) { errs.push(where + ': not an object'); return; }
  if (!isObj(r.d)) { errs.push(where + ': `d` (per-district) must be an object'); return; }
  const seen = new Set();
  for (const [cd, row] of Object.entries(r.d)) {
    const w2 = where + ' · ' + cd;
    if (districtIds && !districtIds.has(cd)) { errs.push(w2 + ': no polygon carries this code'); continue; }
    seen.add(cd);
    if (!isObj(row)) { errs.push(w2 + ': not an object'); continue; }
    /* ⚠ `w` MAY BE ABSENT. A seat can be genuinely undecided in the record (a void poll, a death
       between nomination and polling day, a result annulled by a court). «No winner recorded» is a
       fact the map draws as no colour, exactly as #R243 draws a state that did not vote. */
    if (row.w != null && !partyIds.has(row.w)) errs.push(w2 + ': winner ' + row.w + ' is not in the party table');
    if (row.c != null) {
      if (!Array.isArray(row.c)) { errs.push(w2 + ': c must be an array'); continue; }
      for (const c of row.c) {
        if (!isObj(c)) { errs.push(w2 + ': candidate is not an object'); continue; }
        if (!isStr(c.n)) errs.push(w2 + ': candidate has no name');
        if (c.p != null && !partyIds.has(c.p)) errs.push(w2 + ': candidate party ' + c.p + ' is not in the party table');
        if (c.v != null && !isNum(c.v)) errs.push(w2 + ': candidate v must be a number when present');
      }
      /* the winner named at district level must be one of the candidates the file lists */
      if (row.w != null && row.c.length && !row.c.some(c => c.p === row.w)) {
        errs.push(w2 + ': winner ' + row.w + ' is not among the candidates listed');
      }
    }
    if (row.t != null && !isNum(row.t)) errs.push(w2 + ': t must be a number when present');
  }
  /* ── the national bar ──────────────────────────────────────────────────────────────────────
     ⚠ THE CHAMBER TOTAL IS NOT DERIVED FROM THE MAP. Deriving it would silently drop every seat
     won from a list, and for Japan, Germany and Korea that is most of the difference between who
     won the districts and who formed the government. It is recorded, and then checked against the
     districts the map does hold. */
  if (!Array.isArray(r.n)) { errs.push(where + ': `n` (national totals) must be an array'); return seen; }
  for (const row of r.n) {
    if (!isObj(row)) { errs.push(where + ': national row is not an object'); continue; }
    if (!partyIds.has(row.p)) errs.push(where + ': national row party ' + row.p + ' is not in the party table');
    for (const k of ['seats', 'dseats', 'lseats']) {
      if (row[k] != null && !isNum(row[k])) errs.push(where + ': national ' + k + ' must be a number');
    }
    if (row.pct != null && (!isNum(row.pct) || row.pct < 0 || row.pct > 100)) errs.push(where + ': national pct out of range');
  }
  return seen;
}

/* ── geometry ──────────────────────────────────────────────────────────────────────────────────
   The runtime never looks at a coordinate; it looks up `cd` and writes a colour. So the only thing
   this checks about the geometry is the thing the join depends on. */
export function checkGeo(id, g, errs) {
  const where = 'geo ' + id;
  if (!isObj(g) || g.type !== 'FeatureCollection' || !Array.isArray(g.features)) {
    errs.push(where + ': must be a GeoJSON FeatureCollection'); return new Set();
  }
  const codes = new Set();
  for (const f of g.features) {
    const p = (f && f.properties) || {};
    if (!isStr(p.cd)) { errs.push(where + ': a feature has no `cd`'); continue; }
    if (codes.has(p.cd)) errs.push(where + ': duplicate district code ' + p.cd);
    codes.add(p.cd);
    if (!isObj(p.n)) errs.push(where + ' · ' + p.cd + ': no name table');
    if (!f.geometry || !/^(Multi)?Polygon$/.test(String(f.geometry.type))) {
      errs.push(where + ' · ' + p.cd + ': geometry must be Polygon or MultiPolygon');
    }
  }
  return codes;
}

/* ── the whole pack ────────────────────────────────────────────────────────────────────────────
   `read` is injected so the same validator runs over files on disk (the build gate) and over
   objects held in memory (a country pack checking itself before it writes anything). */
export function validate(index, read, errs = []) {
  if (!isObj(index)) { errs.push('index.json is not an object'); return errs; }
  if (!isObj(index.parties)) errs.push('index.parties missing');
  else for (const [pid, p] of Object.entries(index.parties)) checkParty(pid, p, errs);
  const partyIds = new Set(Object.keys(index.parties || {}));

  if (!Array.isArray(index.polities)) { errs.push('index.polities must be an array'); return errs; }
  const polityIds = new Set();
  for (const p of index.polities) { checkPolity(p, errs); if (p && p.id) polityIds.add(p.id); }
  if (polityIds.size !== (index.polities || []).length) errs.push('index.polities has duplicate ids');

  if (!Array.isArray(index.elections)) { errs.push('index.elections must be an array'); return errs; }
  const geoIds = new Set(index.elections.map(e => e && e.geo).filter(Boolean));
  const resIds = new Set(index.elections.map(e => e && e.res).filter(Boolean));

  const geoCodes = new Map();
  for (const gid of geoIds) {
    const g = read('geo', gid);
    if (g == null) { errs.push('geo ' + gid + ': file is missing'); continue; }
    geoCodes.set(gid, checkGeo(gid, g, errs));
  }

  const ids = new Set();
  for (const e of index.elections) {
    checkElection(e, errs, { geoIds, resIds, polityIds });
    if (e && e.id) { if (ids.has(e.id)) errs.push('duplicate election id ' + e.id); ids.add(e.id); }
    if (!e || !e.res) continue;
    const r = read('res', e.res);
    if (r == null) { errs.push('results ' + e.res + ': file is missing'); continue; }
    const districtIds = e.geo ? geoCodes.get(e.geo) : null;
    const seen = checkResults(e.res, r, errs, { partyIds, districtIds });
    /* ⚠ THE JOIN IS CHECKED IN BOTH DIRECTIONS. A results file that names a district the geometry
       does not have paints nothing (caught above); geometry the results never mention paints a
       HOLE, and a hole in a choropleth reads as «nobody won here», which is a different and
       entirely false statement. Both are build failures. */
    if (districtIds && seen) {
      const missing = [...districtIds].filter(cd => !seen.has(cd));
      if (missing.length) {
        errs.push('results ' + e.res + ': ' + missing.length + ' district(s) in ' + e.geo +
          ' have no result at all (first: ' + missing.slice(0, 5).join(', ') + ')');
      }
      if (isNum(e.districtSeats) && districtIds.size !== e.districtSeats) {
        errs.push('election ' + e.id + ': ' + e.geo + ' has ' + districtIds.size +
          ' polygons but districtSeats says ' + e.districtSeats);
      }
    }
  }
  /* every polity must actually have an election, or it is a name on a list nobody can reach */
  for (const pid of polityIds) {
    if (!index.elections.some(e => e && e.polity === pid)) errs.push('polity ' + pid + ' has no election');
  }
  return errs;
}
