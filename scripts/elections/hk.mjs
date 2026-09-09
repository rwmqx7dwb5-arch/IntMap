/* ============================================================================
 *  IntMap · HONG KONG — the Legislative Council, on the ten geographical constituencies   (#R588)
 * ----------------------------------------------------------------------------
 *  ⚠ WHAT THIS PACK SAYS ABOUT HONG KONG IS: AN ELECTION WAS HELD AND THIS IS THE RESULT. Nothing
 *  here, and nothing in scripts/lib/elections-schema.mjs, is a claim about status — see the comment
 *  above `checkPolity`, which is where that decision is written down for every pack at once. The
 *  names below are the ones the returning officer prints on the ballot paper, in English and in
 *  Chinese, and no other vocabulary is introduced.
 *
 *  ══ THE MAP AND THE CHAMBER ARE TWO DIFFERENT COUNTS, AND HERE THEY DIVIDE UNUSUALLY ═════════
 *  The Council has ninety members: twenty returned by the ten geographical constituencies (TWO
 *  each), thirty by twenty-eight functional constituencies and forty by the Election Committee.
 *  Only the first twenty belong to a piece of ground, so only ten polygons exist and
 *  `districtSeats` is ten — the number of AREAS THE MAP CAN COLOUR, which is what the schema's join
 *  check measures it against — while `listSeats` is the remaining eighty seats the map cannot
 *  colour. The per-party `dseats`/`lseats` in the results file carry the other, political division
 *  (20 geographical / 70 not), and the legend note says which is which. Both are true; neither is
 *  the other.
 *
 *  ⚠ TWO MEMBERS PER CONSTITUENCY MEANS THE FILL IS THE LEADING ELECTED PARTY, and the popup lists
 *  every candidate with their vote so that the second seat is visible rather than implied.
 *
 *  ══ WHY 2021 IS NOT HERE ════════════════════════════════════════════════════════════════════
 *  Measured 2026-09-09. The 2021 boundaries, the 2021 votes and the 2021 winners are all reachable
 *  (CSDI publishes an LC2021 layer whose New Territories North polygon genuinely differs from
 *  LC2025's, and elections.gov.hk/legco2021 serves the same vote-count files). What is NOT reachable
 *  is any candidate's party: the 2021 「Nominations Received」 tables have no Political Affiliation
 *  column — it was added for 2025 — and the only 2021 source that names the parties is a PDF per
 *  constituency, which nothing in this repository can read. A map of ten constituencies with no
 *  colour in any of them is not a cheaper version of this layer; it is a blank island. So 2021 is
 *  left out until its parties can be read, rather than shipped hollow.
 * ==========================================================================*/
import { simplifyGeoJSON } from '../lib/elections-geo.mjs';

export const about = 'Hong Kong — Legislative Council geographical constituencies (2025)';

/* ── the sources ───────────────────────────────────────────────────────────────────────────────
   The boundaries come from the Common Spatial Data Infrastructure portal, which serves the
   Registration and Electoral Office's own layer; the votes, the candidates and their declared
   political affiliation all come from the Electoral Affairs Commission's election site. */
const CSDI = 'https://portal.csdi.gov.hk/server/rest/services/common/reo_rcd_1698719807005_45829/FeatureServer/0/query';
const SITE = 'https://www.elections.gov.hk/legco2025/';

const SRC = 'Boundaries: Registration and Electoral Office via the Common Spatial Data Infrastructure ' +
  'portal (portal.csdi.gov.hk). Results, candidates and declared political affiliations: Electoral ' +
  'Affairs Commission / Registration and Electoral Office (elections.gov.hk).';
/* data.gov.hk's terms of use permit reproduction and redistribution, commercial and non-commercial,
   on condition that the source is acknowledged — which is why `src` above is not decoration and why
   js/elections.js makes the attribution follow the selected election. Read 2026-09-09. */
const LIC = 'Terms of Use of data.gov.hk / the Government of the Hong Kong Special Administrative ' +
  'Region: free to reproduce and redistribute with acknowledgement of the source.';

/* ⚠ SIMPLIFICATION IN DEGREES, AND HONG KONG IS SMALL. The ten constituencies span 60 km, so a
   tolerance that suits Russia would eat Lamma Island: 0.00005° is 5.5 m, finer than the boundary was
   digitised, and the saving comes almost entirely from rounding fifteen-decimal coordinates to five
   (about a metre) and from dropping the server's own bookkeeping fields. Measured 2026-09-09:
   679 KB from the FeatureServer, 117 KB written.
   ⚠ THESE POLYGONS EXTEND OVER WATER AND THAT IS NOT A DEFECT. Each constituency arrives as a
   single ring — the Registration and Electoral Office draws the boundary out to sea so that the
   outlying islands are enclosed rather than listed — so the fill covers harbour as well as land.
   Clipping it to the coastline would be this pack inventing a boundary the returning officer did
   not draw. */
const TOLERANCE = 0.00005;

/* ── party colours ─────────────────────────────────────────────────────────────────────────────
   ⚠ THE LIST OF PARTIES IS DISCOVERED, NOT WRITTEN DOWN: it is whatever the nominees declared. What
   cannot be discovered is a colour, because no upstream publishes one, so this table holds colours
   only, keyed by the canonical English name reduced to letters. A body the table does not know is
   still carried, under its own declared name and with a colour derived from that name.
   Observed 2026-09-09 from the liveries the parties themselves use; it expires when they change. */
const COLOURS = {
  DEMOCRATICALLIANCEFORTHEBETTERMENTANDPROGRESSOFHONGKONG: '#1a4f9c',
  THEHONGKONGFEDERATIONOFTRADEUNIONS: '#e2231a',
  NEWPEOPLESPARTY: '#5c2d91',
  LIBERALPARTY: '#f7941e',
  BUSINESSANDPROFESSIONALSALLIANCEFORHONGKONG: '#00a0a0',
  THEFEDERATIONOFHONGKONGKOWLOONLABOURUNIONS: '#c0392b',
  ROUNDTABLE: '#7f8c8d',
};

function derivedColour(key) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  const hue = h % 360, s = 0.45, l = 0.45;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((hue / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x]
    : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x];
  return '#' + [r, g, b].map(v => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('');
}

/* ── reading the Commission's pages ────────────────────────────────────────────────────────────
   ⚠ THE PAGES ARE READ AS TABLES, NOT AS TEXT. Three generations of template are in use across the
   site and they differ in every attribute except the shape of the table, so nothing below matches a
   class name, a heading or a piece of prose. Cells keep their `id` because the Commission's own
   identifiers — 「lc1_3_total_num」 — are the only structural key that says which constituency and
   which candidate a cell belongs to. */
const unescape = (s) => s.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;|&rsquo;|&#8217;/g, '’').replace(/\s+/g, ' ').trim();

function tables(html) {
  const out = [];
  for (const t of html.match(/<table[\s\S]*?<\/table>/gi) || []) {
    const rows = [];
    for (const r of t.match(/<tr[\s\S]*?<\/tr>/gi) || []) {
      const cells = [];
      for (const c of r.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) || []) {
        const id = (c.match(/\bid\s*=\s*"([^"]*)"/i) || [])[1] || '';
        cells.push({ id, text: unescape(c.replace(/^<t[dh][^>]*>/i, '').replace(/<\/t[dh]>$/i, '')) });
      }
      if (cells.length) rows.push(cells);
    }
    if (rows.length) out.push(rows);
  }
  return out;
}

/** The rows of a 「Nominations Received」 table, as objects keyed by the publisher's own column
 *  headings. ⚠ A MISSING HEADING IS A BUILD FAILURE, not a silently absent field: this is how a
 *  candidate would otherwise acquire no party and a constituency lose its colour. */
function nominationRows(html, wanted) {
  for (const rows of tables(html)) {
    const head = rows[0].map(c => c.text);
    const idx = {};
    for (const [key, label] of Object.entries(wanted)) {
      const i = head.findIndex(h => h.replace(/\s+/g, ' ').toLowerCase().startsWith(label.toLowerCase()));
      if (i >= 0) idx[key] = i;
    }
    if (Object.keys(idx).length !== Object.keys(wanted).length) continue;
    /* ⚠ ONLY THE ROWS THAT NAME SOMEBODY. These tables are laid out for the eye: a blank row
       separates one constituency from the next and a constituency's first row repeats its name with
       every other cell empty. Measured 2026-09-09, the English functional-constituency table has
       121 such rows and the Chinese one 120 — so a pairing by row NUMBER puts most of the
       functional constituencies' nominees under the wrong party, and quietly. */
    return rows.slice(1)
      .filter(r => r.length >= head.length)
      .map(r => Object.fromEntries(Object.entries(idx).map(([k, i]) => [k, r[i].text])))
      .filter(r => r.name);
  }
  throw new Error('hk: no nomination table carrying ' + Object.values(wanted).join(' / '));
}

/** The same nominees out of the English and the Chinese edition of one nomination table, paired.
 *  ⚠ THE PAIRING IS WITHIN A CONSTITUENCY, NOT ACROSS THE FILE, because the constituency is the one
 *  thing both editions agree on structurally: the names are in different scripts and the layout
 *  rows do not survive translation. Both editions list the constituencies in the same order and each
 *  constituency's nominees in the same order, and this asserts both rather than assuming them. */
function pairEditions(en, zh, where) {
  const group = (rows) => {
    const order = [];
    const by = new Map();
    for (const r of rows) {
      if (!by.has(r.con)) { by.set(r.con, []); order.push(r.con); }
      by.get(r.con).push(r);
    }
    return order.map(k => by.get(k));
  };
  const a = group(en), b = group(zh);
  if (a.length !== b.length) {
    throw new Error(where + ': ' + a.length + ' constituencies in English, ' + b.length + ' in Chinese');
  }
  const out = [];
  a.forEach((rows, i) => {
    if (rows.length !== b[i].length) {
      throw new Error(where + ' · ' + rows[0].con + ': ' + rows.length + ' nominees in English, ' + b[i].length + ' in Chinese');
    }
    rows.forEach((r, k) => out.push([r, b[i][k]]));
  });
  return out;
}

/** A candidate's name reduced to the letters of it, so that the results page's 「LEE KA KUI (ELVIN
 *  LEE)」 and the nomination table's 「LEE Ka-kui」 + alias 「Elvin Lee」 are recognisably one person.
 *  ⚠ THE ALIAS IS PART OF THE KEY IN ONE FORM AND NOT IN THE OTHER, so both are offered. */
const nameKey = (s) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

/* ── party identity across two spellings ───────────────────────────────────────────────────────
   ⚠ THE SAME BODY IS WRITTEN TWO WAYS BY THE SAME PUBLISHER. A geographical-constituency nominee
   declares 「Democratic Alliance for the Betterment and Progress of Hong Kong / 民主建港協進聯盟」
   and a functional-constituency nominee declares 「DAB / 民建聯」. Keying on the string gives that
   party two entries, two colours and two bars in the legend.
   The merge is done on BOTH forms at once, by the rules that FORM abbreviations in each language:
   in Chinese the short form's characters occur, in order, inside the long one (民建聯 ⊂
   民主建港協進聯盟, 經民聯 ⊂ 香港經濟民生聯盟); in English the short form's letters occur, in
   order, among the INITIALS of the long one's words (DAB ⊂ D-A-f-t-B-a-p-o-h-k, FTU ⊂
   t-h-k-F-o-T-U). Those are properties of the languages, not a list of parties, so a body that
   appears next time under a new abbreviation merges without this file changing.
   ⚠ NEITHER RULE IS ENOUGH ALONE, and that was measured rather than assumed: on the 2025 pages
   「工聯會」 sits inside 香港工會聯合會, 港九勞工社團聯會 AND 香港教育工作者聯會, three unrelated
   bodies. Requiring the English side to agree leaves exactly one. ⚠ If more than one long form
   still fits, the build stops rather than guessing which party a member belongs to. */
const isSubsequence = (short, long) => {
  let i = 0;
  for (const ch of long) if (ch === short[i]) i++;
  return i === short.length;
};
const letters = (s) => s.toUpperCase().replace(/[^A-Z]/g, '');
const initials = (s) => (s.toUpperCase().match(/[A-Z][A-Z']*/g) || []).map(w => w[0]).join('');
/* ⚠ THE ENGLISH TEST ONLY EVER RUNS ON CANDIDATES THE CHINESE TEST ALREADY ACCEPTED, and that is
   what makes it safe to be generous: on its own, letters F-T-U sit inside 「The Federation of Hong
   Kong & Kowloon Labour Unions」 as readily as inside their own party's name. Both directions are
   tried because after the normalisation above a SHORT Chinese form often carries a LONG English one
   — 工聯會 is published with 「Hong Kong Federation of Trade Unions」 while 香港工會聯合會 is
   published with 「The Hong Kong Federation of Trade Unions」, and neither is the other's initials. */
const enCompatible = (a, b) =>
  a === b || letters(a) === letters(b) ||
  isSubsequence(letters(a), initials(b)) || isSubsequence(letters(b), initials(a)) ||
  isSubsequence(letters(a), letters(b)) || isSubsequence(letters(b), letters(a));

function canonicalise(input) {
  /* ⚠ THE ENGLISH CELL IS SOMETIMES EMPTY WHERE THE CHINESE ONE IS NOT, and that is the publisher
     rather than the reader: measured 2026-09-09, three geographical-constituency nominees (TAM
     Chun-kwok, CHAN Wing-yan, KU Wai-ping) declared an affiliation in the Chinese edition and left
     a blank cell in the English one. A blank English form matches EVERY long form under the
     initials rule, so it is filled in first from another nominee who declared the same Chinese
     body — otherwise one empty cell makes an entire party ambiguous and stops the build. */
  const enByZh = new Map();
  for (const p of input) {
    if (!p.zh || !p.en) continue;
    if ((enByZh.get(p.zh) || '').length < p.en.length) enByZh.set(p.zh, p.en);
  }
  /* and the same reduction settles the milder disagreement too: the same Chinese body is written
     both as 「Business and Professionals Alliance for Hong Kong」 and as 「BPA」, so every
     occurrence of one Chinese form is normalised to the longest English form seen with it and a
     Chinese body has exactly one form to merge on. */
  const fill = (p) => ({ zh: p.zh, en: (p.zh ? enByZh.get(p.zh) : '') || p.en || '' });
  const pairs = input.map(fill);

  /* the unit of identity is the PAIR a nominee declared, because the two languages disambiguate
     each other; a Chinese form on its own does not identify a body */
  const forms = [];
  for (const p of pairs) {
    if (!p.zh && !p.en) continue;
    if (!forms.some(f => f.zh === p.zh && f.en === p.en)) forms.push({ zh: p.zh, en: p.en });
  }
  const key = (f) => f.zh + ' ' + f.en;
  const parent = new Map();
  for (const s of forms) {
    const hosts = forms.filter(l => l.zh.length > s.zh.length && isSubsequence(s.zh, l.zh) && enCompatible(s.en, l.en));
    if (new Set(hosts.map(h => h.zh)).size > 1) {
      throw new Error('hk: «' + s.zh + ' / ' + s.en + '» abbreviates ' + hosts.length +
        ' different affiliations (' + hosts.map(h => h.zh).join(', ') + ')');
    }
    if (hosts.length === 1) parent.set(key(s), key(hosts[0]));
  }
  const root = (k) => { let r = k; while (parent.has(r)) r = parent.get(r); return r; };
  const groupOf = (p) => { const f = fill(p); return (f.zh || f.en) ? root(key(f)) : ''; };
  /* every group keeps the longest form of each language it was seen under: the long English name is
     what a reader recognises, and the long Chinese name is what is written on the ballot */
  const groups = new Map();
  for (const p of pairs) {
    const k = groupOf(p);
    const g = groups.get(k) || { en: '', zh: '' };
    if (p.en.length > g.en.length) g.en = p.en;
    if (p.zh.length > g.zh.length) g.zh = p.zh;
    groups.set(k, g);
  }
  return { groups, groupOf };
}

export async function build(ctx) {
  /* ── the ten constituencies ────────────────────────────────────────────────────────────────
     The layer is asked for WGS-84 directly; its native reference is the Hong Kong 1980 grid
     (EPSG:2326), which the server reprojects, so nothing here does arithmetic on coordinates. */
  const fc = await ctx.get(CSDI + '?where=1%3D1&outFields=*&f=geojson&outSR=4326', { json: true });
  if (!fc.features || fc.features.length !== 10) {
    throw new Error('hk: expected 10 geographical constituencies, got ' + (fc.features || []).length);
  }

  /* the English and Chinese names of each constituency come from the Commission's own results page
     in each language — 「(LC1)Hong Kong Island East」 — rather than from a property name in the
     boundary layer, which spells them differently in every vintage of the file */
  const pages = {};
  for (const [lang, path] of [['en', 'eng/results_gc.html'], ['zh', 'chi/results_gc.html']]) {
    pages[lang] = await ctx.get(SITE + path, { text: true });
  }
  const constituencyNames = (html) => {
    const out = new Map();
    for (const rows of tables(html)) {
      for (const row of rows) {
        for (const cell of row) {
          const m = cell.text.match(/^\(\s*(LC\s*\d+)\s*\)\s*(.+)$/);
          if (m) out.set(m[1].replace(/\s+/g, ''), m[2].trim());
        }
      }
    }
    return out;
  };
  const nameEn = constituencyNames(pages.en);
  const nameZh = constituencyNames(pages.zh);

  const codes = new Set();
  for (const f of fc.features) {
    /* the code is found by the SHAPE of its value, because the property carrying it is LC_Code in
       the 2025 layer and LCCODE in the 2021 one */
    const raw = Object.values(f.properties || {})
      .filter(v => typeof v === 'string' && /^LC\s*\d+$/.test(v.trim()));
    if (raw.length !== 1) throw new Error('hk: a polygon carries ' + raw.length + ' constituency codes');
    const cd = raw[0].replace(/\s+/g, '');
    if (codes.has(cd)) throw new Error('hk: two polygons claim ' + cd);
    codes.add(cd);
    if (!nameEn.has(cd) || !nameZh.has(cd)) throw new Error('hk: the results page does not name ' + cd);
    f.properties = { cd, n: { en: nameEn.get(cd), native: nameZh.get(cd), 'zh-Hant': nameZh.get(cd) } };
  }
  simplifyGeoJSON(fc, { tolerance: TOLERANCE, decimals: 5 });

  /* ── who stood, and for whom ───────────────────────────────────────────────────────────────
     Three families of nomination table: one per geographical constituency, one for all functional
     constituencies, one for the Election Committee constituency. They share a shape, so they share
     a reader; the geographical ones are fetched per constituency because that is how they are
     published. ⚠ A nominee may declare SEVERAL bodies (「BPA, Kowloon West New Dynamic」); the first
     is the one the seat is counted under, and that is stated rather than assumed to be the only one. */
  const nomination = [];
  const wantEn = { con: 'Geographical Constituency', name: 'Name of Nominee', alias: 'Alias', party: 'Political Affiliation' };
  const wantZh = { con: '地方選區', name: '獲提名人士姓名', alias: '別名', party: '政治聯繫' };
  const codeList = [...codes].sort((a, b) => Number(a.slice(2)) - Number(b.slice(2)));

  /* ⚠ A DECLARATION IS TRIMMED OF ITS TYPOGRAPHY BEFORE IT IS COMPARED. One 2025 nominee's cell
     reads 「*BPA / *經民聯」 — the asterisk is a footnote marker on the page — and an asterisk is not a
     character of any party's name, so leaving it in gives that party a second identity, a second
     colour and a second bar. */
  const firstOf = (s) => String(s || '').split(/[,、]/)[0]
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '').trim();

  for (const [file, scope, headEn, headZh] of [
    ...codeList.map(cd => [cd, cd, wantEn.con, wantZh.con]),
    ['FC', 'fc', 'Functional Constituency', '功能界別'],
    ['ECC', 'ecc', 'Constituency', '界別'],
  ]) {
    const en = nominationRows(await ctx.get(SITE + 'pdf/' + file + '_e.html', { text: true }),
      { ...wantEn, con: headEn });
    const zh = nominationRows(await ctx.get(SITE + 'pdf/' + file + '_c.html', { text: true }),
      { ...wantZh, con: headZh });
    for (const [e, c] of pairEditions(en, zh, 'hk ' + file)) {
      nomination.push({ scope, en: e.name, alias: e.alias, party: { en: firstOf(e.party), zh: firstOf(c.party) } });
    }
  }

  const { groups, groupOf } = canonicalise(nomination.map(n => n.party));
  const parties = {};
  const idOfGroup = new Map();
  for (const [key, g] of groups) {
    /* ⚠ A NOMINEE WHO DECLARED NOTHING IS NOT A PARTY OF ONE. The Commission prints an empty cell,
       which is the ordinary way of saying the candidate stands unattached; that is one entry so the
       map can colour those seats, and it is named for what it is. */
    const en = g.en || 'No declared affiliation';
    const zh = g.zh || '沒有申報政治聯繫';
    /* the id is the English name as a slug; a body that named itself only in Chinese has no
       transliteration anywhere upstream, so it keeps a stable id derived from that name instead of
       borrowing a Latin one nobody wrote */
    const slug = en.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
      || ('p' + [...zh].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7).toString(36));
    const id = 'hk:' + slug;
    const flat = en.toUpperCase().replace(/[^A-Z]/g, '');
    /* ⚠ THE ABSENCE OF AN AFFILIATION IS NOT A PARTY, so it does not get a party's hue — a
       derived colour would put a confident purple on the map for members who declared nothing. It
       still needs A colour, because these are forty of the ninety seats and leaving them out of the
       bars would misreport the chamber; a neutral grey is what says «recorded, and not a party». */
    const col = key === '' ? '#6b7280' : (COLOURS[flat] || derivedColour(flat));
    parties[id] = { n: { en, native: zh, 'zh-Hant': zh }, col };
    idOfGroup.set(key, id);
  }
  const partyOf = (p) => idOfGroup.get(groupOf(p));

  /** the nominee a results page is talking about, matched inside its own constituency */
  const lookup = (scope, printed) => {
    const want = nameKey(printed);
    const here = nomination.filter(n => n.scope === scope);
    const hit = here.find(n => nameKey(n.en) === want || nameKey(n.en + n.alias) === want);
    if (!hit) throw new Error('hk ' + scope + ': «' + printed + '» is not in the nomination list');
    return hit;
  };

  /* ── the geographical result ───────────────────────────────────────────────────────────────
     The names and the ballot numbers are in the page; the votes and the elected flag are in the
     per-constituency script the page loads, which publishes them as a JSON object keyed by the
     constituency code. Reading that object rather than the rendered cells is what makes this
     independent of whether the count is being displayed live or was frozen after the declaration. */
  const printedNames = new Map();          /* cd → Map(list_num → printed name) */
  for (const rows of tables(pages.en)) {
    for (const row of rows) {
      const at = row.findIndex(c => /^lc\s*\d+[_-]\d+[_-]total/i.test(c.id));
      if (at < 1) continue;
      const m = row[at].id.match(/^lc\s*(\d+)[_-](\d+)/i);
      const cd = 'LC' + m[1], num = Number(m[2]);
      /* the two cells before the vote are the ballot number and the name, in that order; checking
         the number rather than trusting the position is what turns a template change into a build
         failure instead of a map of the wrong candidates */
      if (Number(row[at - 2] && row[at - 2].text) !== num) {
        throw new Error('hk ' + cd + ': the cell before candidate ' + num + ' is «' + (row[at - 2] || {}).text + '»');
      }
      if (!printedNames.has(cd)) printedNames.set(cd, new Map());
      printedNames.get(cd).set(num, row[at - 1].text);
    }
  }

  const d = {};
  const seats = new Map();                 /* party id → { d, l } */
  const bump = (id, kind) => { const s = seats.get(id) || { d: 0, l: 0 }; s[kind]++; seats.set(id, s); };

  for (const cd of codeList) {
    const js = await ctx.get(SITE + 'js/election.results/' + cd.toLowerCase() + '_vote_count.js', { text: true });
    const at = js.indexOf('"gc_code":"' + cd + '"');
    if (at < 0) throw new Error('hk ' + cd + ': the vote-count script does not mention ' + cd);
    let depth = 0, start = js.lastIndexOf('{', at), end = -1;
    for (let i = start; i < js.length; i++) {
      if (js[i] === '{') depth++;
      else if (js[i] === '}' && --depth === 0) { end = i + 1; break; }
    }
    const rec = JSON.parse(js.slice(start, end));
    const printed = printedNames.get(cd);
    if (!printed || printed.size !== rec.candidates.length) {
      throw new Error('hk ' + cd + ': ' + (printed ? printed.size : 0) + ' candidates on the page, ' + rec.candidates.length + ' in the count');
    }
    const c = rec.candidates.map((k) => {
      const who = lookup(cd, printed.get(k.list_num));
      return { n: printed.get(k.list_num), p: partyOf(who.party), v: k.total_count, won: !!k.num_satisfy };
    }).sort((a, b) => b.v - a.v);
    for (const x of c) if (x.won) bump(x.p, 'd');
    /* ⚠ TWO MEMBERS ARE RETURNED HERE, so `w` is the elected candidate with the most votes and the
       popup shows the rest. Colouring by the top VOTE rather than the top ELECTED candidate would
       occasionally colour a constituency for a party that did not take either of its seats. */
    const lead = c.find(x => x.won);
    d[cd] = {
      w: lead ? lead.p : undefined,
      c: c.map(({ n, p, v }) => ({ n, p, v })),
      t: c.reduce((a, x) => a + x.v, 0),
    };
    if (!lead) delete d[cd].w;
  }

  /* ── the other seventy seats ───────────────────────────────────────────────────────────────
     Needed only for the bar chart, which is the whole chamber. The functional-constituency pages
     are DISCOVERED from the index page's own links rather than listed here, so a constituency added
     or renamed is followed automatically; the Election Committee's are on one page. */
  const fcIndex = await ctx.get(SITE + 'eng/results_fc.html', { text: true });
  const fcPages = [...new Set([...fcIndex.matchAll(/href="(results_fc_[a-z0-9]+\.html)"/gi)].map(m => m[1]))];
  if (!fcPages.length) throw new Error('hk: no functional-constituency result pages found');

  for (const [page, scope] of [...fcPages.map(p => [p, 'fc']), ['results_ecc.html', 'ecc']]) {
    const html = await ctx.get(SITE + 'eng/' + page, { text: true });
    for (const rows of tables(html)) {
      for (const row of rows) {
        const at = row.findIndex(c => /_elected_result$/i.test(c.id));
        if (at < 2) continue;
        if (!row[at].text) continue;                  /* an empty cell is «not elected», not «unknown» */
        const printed = row[at - 2].text;
        bump(partyOf(lookup(scope, printed).party), 'l');
      }
    }
  }

  const total = [...seats.values()].reduce((a, s) => a + s.d + s.l, 0);
  /* ⚠ THE CHAMBER MUST ADD UP OR THE BAR CHART MISREPORTS WHO GOVERNS. 20 + 30 + 40 = 90 is the
     composition fixed by Annex II of the Basic Law as amended in 2021; if the pages ever yield a
     different number this build stops rather than shipping a chamber that is short a party. */
  if (total !== 90) throw new Error('hk: the pages account for ' + total + ' of the 90 seats');

  const geoId = 'hk-lc-2025.geo.json';
  const resId = 'hk-legco-2025.res.json';

  return {
    polities: [{
      id: 'hk',
      n: {
        en: 'Hong Kong', native: '香港', 'zh-Hant': '香港', 'zh-Hans': '香港', ja: '香港',
        de: 'Hongkong', ru: 'Гонконг', es: 'Hong Kong', fr: 'Hong Kong', ko: '홍콩',
      },
      home: (() => {
        let s = 90, n = -90, w = 180, e = -180;
        const visit = (c) => {
          if (typeof c[0] === 'number') {
            if (c[1] < s) s = c[1]; if (c[1] > n) n = c[1];
            if (c[0] < w) w = c[0]; if (c[0] > e) e = c[0];
            return;
          }
          c.forEach(visit);
        };
        for (const f of fc.features) if (f.geometry) visit(f.geometry.coordinates);
        return [[w, s], [e, n]];
      })(),
    }],
    parties,
    elections: [{
      id: 'hk-legco-2025',
      polity: 'hk',
      body: {
        en: 'Legislative Council', native: '立法會', 'zh-Hant': '立法會', 'zh-Hans': '立法会',
        ja: '立法会', de: 'Legislativrat', ru: 'Законодательный совет',
        es: 'Consejo Legislativo', fr: 'Conseil législatif', ko: '입법회',
      },
      date: '2025-12-07', y: 2025,
      geo: geoId, res: resId,
      seatsTotal: 90, districtSeats: 10, listSeats: 80,
      /* ⚠ A NOTE IS A NAME TABLE, NOT A STRING: it is prose the reader reads in the legend, so it
         obeys AGENTS.md §3.5 and exists in all nine languages. `src` and `lic` do not — an
         attribution line is the publisher's own wording and a licence is a legal condition, and
         translating either misquotes it.
         ⚠ `jp` AND `ja` BOTH: the app's own code for Japanese is 'jp' (js/lang-registry.js) and that
         is the key js/elections.js looks up in a name table; 'ja' is the BCP-47 tag the rest of this
         data uses. */
      note: (() => {
        const jp = '10 の地方選挙区はそれぞれ 2 名を選ぶため、地図が塗る 10 の区域は 90 議席のうち 20 議席' +
          'にあたり、色はそこで最多得票だった当選者の政党です。残る 70 議席（28 の職能別選挙区から 30、' +
          '選挙委員会から 40）はそれぞれ独自の選挙人によって選ばれ、地面を持ちません。バーには含まれますが' +
          '地図には現れません。複数の所属を届け出た議員の議席は、最初に挙げられたものに数えています。';
        return {
          en: 'Each of the ten geographical constituencies returns TWO members, so the map colours ' +
            'ten areas holding twenty of the ninety seats, and the colour is the elected member who ' +
            'polled highest there. The other seventy — thirty from twenty-eight functional ' +
            'constituencies, forty from the Election Committee — are elected by their own electorates ' +
            'and belong to no piece of ground; they are in the bars but not on the map. Where a ' +
            'member declared more than one affiliation, the seat is counted under the first.',
          ja: jp, jp,
          de: 'Jeder der zehn geografischen Wahlkreise entsendet ZWEI Mitglieder, die zehn ' +
            'eingefärbten Gebiete stehen also für zwanzig der neunzig Sitze, und die Farbe ist das ' +
            'dort stimmenstärkste gewählte Mitglied. Die übrigen siebzig — dreißig aus achtundzwanzig ' +
            'funktionalen Wahlkreisen, vierzig aus dem Wahlkomitee — werden von eigenen Wählerschaften ' +
            'gewählt und gehören zu keinem Gebiet; sie stecken in den Balken, aber nicht in der Karte. ' +
            'Hat ein Mitglied mehr als eine Zugehörigkeit angegeben, zählt der Sitz zur erstgenannten.',
          ru: 'Каждый из десяти территориальных округов избирает ДВУХ членов, поэтому десять ' +
            'закрашенных областей — это двадцать из девяноста мест, а цвет соответствует избранному ' +
            'члену, набравшему там больше всего голосов. Остальные семьдесят — тридцать от двадцати ' +
            'восьми функциональных округов и сорок от Избирательного комитета — избираются ' +
            'собственными коллегиями и не привязаны к территории: они есть в полосах, но не на карте. ' +
            'Если член заявил более одной партийной принадлежности, место засчитано по первой.',
          es: 'Cada una de las diez circunscripciones geográficas elige DOS miembros, de modo que las ' +
            'diez áreas coloreadas representan veinte de los noventa escaños, y el color corresponde ' +
            'al miembro electo más votado allí. Los otros setenta —treinta de veintiocho ' +
            'circunscripciones funcionales y cuarenta del Comité Electoral— son elegidos por sus ' +
            'propios electorados y no pertenecen a ningún territorio; están en las barras pero no en ' +
            'el mapa. Cuando un miembro declaró más de una afiliación, el escaño se cuenta en la primera.',
          fr: 'Chacune des dix circonscriptions géographiques élit DEUX membres : les dix zones ' +
            'coloriées représentent donc vingt des quatre-vingt-dix sièges, et la couleur est celle du ' +
            'membre élu arrivé en tête sur place. Les soixante-dix autres — trente pour vingt-huit ' +
            'circonscriptions fonctionnelles, quarante pour le Comité électoral — sont élus par leurs ' +
            'propres collèges et ne correspondent à aucun territoire ; ils figurent dans les barres ' +
            'mais pas sur la carte. Lorsqu’un membre a déclaré plusieurs appartenances, le siège est ' +
            'compté au titre de la première.',
          ko: '10개 지역구는 각각 2명을 선출하므로 지도에 색칠된 10개 구역은 90석 가운데 20석에 해당하며, ' +
            '색은 그곳에서 가장 많은 표를 얻은 당선자의 정당입니다. 나머지 70석(28개 직능별 선거구에서 30석, ' +
            '선거위원회에서 40석)은 각자의 선거인단이 뽑으며 어떤 지역에도 속하지 않아 막대에는 포함되지만 ' +
            '지도에는 나타나지 않습니다. 한 의원이 둘 이상의 소속을 신고한 경우 의석은 처음 적힌 소속으로 ' +
            '계산했습니다.',
          zh: '十個地方選區各選出兩名議員，因此地圖上著色的十個區域代表九十席中的二十席，顏色是該區得票' +
            '最高的當選議員。其餘七十席（二十八個功能界別選出三十席、選舉委員會選出四十席）由各自的選民' +
            '選出，不屬於任何地域；它們計入長條圖，但不會出現在地圖上。議員申報多於一個所屬時，該席次' +
            '計入最先申報的一個。',
          'zh-hans': '十个地方选区各选出两名议员，因此地图上着色的十个区域代表九十席中的二十席，颜色是' +
            '该区得票最高的当选议员。其余七十席（二十八个功能界别选出三十席、选举委员会选出四十席）由' +
            '各自的选民选出，不属于任何地域；它们计入条形图，但不会出现在地图上。议员申报多于一个所属时，' +
            '该席次计入最先申报的一个。',
        };
      })(),
      src: SRC, lic: LIC,
    }],
    geo: { [geoId]: fc },
    res: {
      [resId]: {
        d,
        n: [...seats.entries()]
          .map(([p, s]) => ({ p, seats: s.d + s.l, dseats: s.d, lseats: s.l }))
          .sort((a, b) => b.seats - a.seats),
      },
    },
  };
}
