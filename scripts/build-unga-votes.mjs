#!/usr/bin/env node
/* ============================================================================
 *  IntMap · scripts/build-unga-votes.mjs — HOW EVERY MEMBER VOTED ON EVERY RECORDED UN GENERAL ASSEMBLY VOTE
 *  (geopolitics-layers)
 * ----------------------------------------------------------------------------
 *  The reader asked for 「国連決議の採決結果: 決議を選んで、各国の賛成・反対・棄権・不参加を見る」.
 *
 *  THE RECORD. Erik Voeten, Anton Strezhnev & Michael Bailey, «United Nations General Assembly Voting Data», Harvard
 *  Dataverse, doi:10.7910/DVN/LEJUQZ — CC0 1.0. Its roll-call file UNVotes.csv (file id 9656257, version 32 of the
 *  dataset, released 2024-03-21) holds every recorded vote of sessions 1–77 (1946-01 – 2023-09): one row per member per
 *  vote, with the resolution's symbol, date, short title, description and issue codes.
 *  ⚠ WHY THIS VERSION AND NOT A NEWER ONE. Versions 33–39 of the same dataset (to 2026-07) ship the votes only as R
 *  workspaces (.RData), which no tool of this repository reads; version 32 is the newest that ships them as CSV.
 *  ⚠ WHY NOT THE UN'S OWN FILE. The UN Digital Library publishes the same votes to 81/1 (2026-09-17), but its record
 *  states «Copyright, United Nations; Non commercial use, with attribution» (read 2026-11-17 on
 *  digitallibrary.un.org/record/4060887) and IntMap is a commercial service. So the record ends where the CC0 file ends,
 *  and the layer says so (js/layer-time-decl.js: carried after the last vote, with its date).
 *
 *  THE CODES the file uses (vote): 1 yes · 2 abstain · 3 no · 8 absent (a member that did not vote) · 9 not a member.
 *  Written here as one character per member: Y A N X and «-».
 *  THE MEMBERS are keyed by the file's own `Country` code (ISO 3166-1 alpha-3, with the codes of states that no longer
 *  exist — DDR, CSK, YUG, YAR, EAZ — kept under the file's own name). The USSR's seat is the Russian Federation's in the
 *  file (the UN's continuity of membership), so its votes are under RUS with the name the file writes.
 *
 *  OUTPUT (split so the map reads only what it draws):
 *    data/unga-votes/index.json  { v, source…, first, last, members:[{c, n, ja?}], sessions:[{s, from, to, n}],
 *                                  votes:[[rcid, date, symbol, short, session, flags, description]] }
 *                                  flags: bit0 important (U.S. State Department), bit1 amendment, bit2 paragraph vote,
 *                                  bits 3–8 issue codes me nu di hr co ec
 *    data/unga-votes/s<NN>.json  { s, votes:[{id, y, n, a, x, v}] }   v = one character per member,
 *                                  in the order of index.members
 *
 *  USAGE
 *    node scripts/build-unga-votes.mjs                    download the CSV (393 MB, measured 2026-11-17), derive, write
 *    node scripts/build-unga-votes.mjs --csv <file>       the same from a local copy
 *  ⚠ NOT IN `npm test` (it needs the network). tests/geopolitics-layers-checks.test.mjs validates the committed files.
 * ==========================================================================*/
import { createReadStream, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';
import { Readable } from 'node:stream';
import { parseCSV } from './lib/cldf.mjs';
import { USER_AGENT } from './lib/upstream.mjs';
import { neCountries } from './build-world-flows.mjs';
import { agreeOrRefuse } from './lib/gov-stamp.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const DIR = 'data/unga-votes';
const CSV_URL = 'https://dataverse.harvard.edu/api/access/datafile/9656257';
const NE_FILE = join(ROOT, 'data', 'ne-countries', 'ne_10m_admin_0_countries.json.gz');
const DATASET = 'https://dataverse.harvard.edu/dataset.xhtml?persistentId=doi:10.7910/DVN/LEJUQZ';

/* ⚠ 出自は値である（js/data-governance.js の read() と npm run check:datagov が読む）。上流が述べることだけを書く。 */
export const GOVERNANCE = (() => {
  const rec = {
  publisher: 'Erik Voeten, Anton Strezhnev & Michael Bailey — United Nations General Assembly Voting Data (Harvard Dataverse)',
  url: 'https://dataverse.harvard.edu/dataset.xhtml?persistentId=doi:10.7910/DVN/LEJUQZ',
  licence: 'CC0 1.0',
  licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  /* CC0 waives every condition; the credit is given anyway, as scholarly practice */
  attribution: false,
  asOf: '2023-09-01',
  cadence: 'P1Y',
  cadenceBasis: {
    kind: 'measured',
    observed: 'read 2026-11-17 on dataverse.harvard.edu (doi:10.7910/DVN/LEJUQZ): 39 versions 2012–2026, the roll-call CSV last shipped in version 32 (2024-03-21); a new session is added about once a year',
    expires: 'if a newer version ships the roll calls in a format this builder reads again',
    canon: 'scripts/build-unga-votes.mjs GOVERNANCE',
  },
  schema: 'scripts/build-unga-votes.mjs (index: members · sessions · votes; s<NN>: votes with one character per member) — read by js/geopolitics-core.js; tests/geopolitics-layers-checks.test.mjs',
  builtBy: 'scripts/build-unga-votes.mjs',
  /* ⚠ LITERALS THE GATE CAN READ WITHOUT RUNNING THIS FILE; main() refuses to write an index that disagrees (scripts/lib/gov-stamp.mjs) */
  retrievedAt: '2026-11-17',
  generatedAt: '2026-11-17',
  /* measured on the index's votes[]: key id (the dataset's rcid); session ≥ 1 */
  quality: { rows: 6464, missing: { id: 0, d: 0, s: 0 }, outOfRange: { s: 0 }, duplicates: 0 },
  };
  return { 'data/unga-votes/index.json': rec, 'data/unga-votes/*.json': rec };
})();
const REC = GOVERNANCE['data/unga-votes/index.json'];

const VOTE = { 1: 'Y', 2: 'A', 3: 'N', 8: 'X', 9: '-' };
const ISSUES = ['me', 'nu', 'di', 'hr', 'co', 'ec'];

async function lines(csv) {
  if (csv) return readline.createInterface({ input: createReadStream(csv), crlfDelay: Infinity });
  const r = await fetch(CSV_URL, { headers: { 'user-agent': USER_AGENT }, redirect: 'follow' });
  if (!r.ok || !r.body) throw new Error('UNVotes.csv: HTTP ' + r.status);
  return readline.createInterface({ input: Readable.fromWeb(r.body), crlfDelay: Infinity });
}

async function main() {
  const at = process.argv.indexOf('--csv');
  const rl = await lines(at > 0 ? process.argv[at + 1] : null);
  let head = null;
  /** @type {Map<number, any>} */ const V = new Map();
  /** @type {Map<string, string>} */ const members = new Map();
  /** @type {Map<string, string>} the file's own pairing of a Correlates of War number with an ISO code */ const cow = new Map();
  const byName = [];
  let buf = '';
  for await (const line of rl) {
    /* a description may hold a newline inside quotes: a record ends where the quotes balance */
    buf = buf ? buf + '\n' + line : line;
    if ((buf.match(/"/g) || []).length % 2) continue;
    const r = parseCSV(buf)[0]; buf = '';
    if (!head) { head = r; continue; }
    const o = {}; head.forEach((h, i) => { o[h] = r[i]; });
    const id = +o.rcid;
    if (!Number.isFinite(id) || !o.Country) continue;
    /* ⚠ 17,472 rows (rcids 9057–9147, session 74 — measured 2026-11-17) write the member as its NAME in capitals
       («AFGHANISTAN») with Countryname «NA»; they carry the Correlates of War number (ccode) every other row pairs with the
       ISO code. They are resolved through that pairing once the whole file has been read — the file's own identifier. */
    const iso = /^[A-Z]{3}$/.test(o.Country);
    if (iso && !members.has(o.Country)) members.set(o.Country, o.Countryname);
    if (iso && /^\d+$/.test(o.ccode)) cow.set(o.ccode, o.Country);
    const code = iso ? o.Country : { cow: o.ccode, name: o.Country };
    if (!V.has(id)) {
      let f = 0;
      if (o.importantvote === '1') f |= 1;
      if (o.amend === '1') f |= 2;
      if (o.para === '1') f |= 4;
      ISSUES.forEach((k, i) => { if (o[k] === '1') f |= 8 << i; });
      V.set(id, { id, s: +o.session, d: o.date, sym: o.unres || '', t: o.short || '', ds: o.descr || '', f, by: new Map() });
    }
    const vc = VOTE[o.vote];
    if (!vc) throw new Error('rcid ' + id + ': vote code «' + o.vote + '» is not one the codebook defines (1 2 3 8 9)');
    if (typeof code === 'string') V.get(id).by.set(code, vc); else byName.push([id, code, vc]);
  }
  const lost = new Map();
  for (const [id, c, vc] of byName) {
    const code = cow.get(c.cow);
    if (code) V.get(id).by.set(code, vc); else lost.set(c.name, (lost.get(c.name) || 0) + 1);
  }
  if (lost.size) throw new Error('rows whose member neither an ISO code nor a paired COW number identifies: ' + [...lost].map((x) => x.join(':')).join(', '));
  const codes = [...members.keys()].sort();
  const votes = [...V.values()].sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : a.id - b.id));
  if (votes.length < 6000) throw new Error('only ' + votes.length + ' votes — refusing to write (6,373 on 2026-11-17)');
  const dir = join(ROOT, DIR);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  for (const f of readdirSync(dir)) if (/^s\d+\.json$/.test(f)) unlinkSync(join(dir, f));
  const sessions = new Map();
  for (const v of votes) {
    /* the words live once, in the index (searched there); a session file carries the votes */
    const row = { id: v.id, y: 0, n: 0, a: 0, x: 0, v: '' };
    row.v = codes.map((c) => { const ch = v.by.get(c) || '-'; if (ch === 'Y') row.y++; else if (ch === 'N') row.n++; else if (ch === 'A') row.a++; else if (ch === 'X') row.x++; return ch; }).join('');
    if (!sessions.has(v.s)) sessions.set(v.s, []);
    sessions.get(v.s).push(row);
  }
  const ne = neCountries(NE_FILE);
  const today = new Date().toISOString().slice(0, 10);
  const index = {
    v: 1, ...agreeOrRefuse(REC, votes.map((v) => ({ id: v.id, d: v.d, s: v.s })), { fields: { id: {}, d: {}, s: { min: 1 } }, key: ['id'] }, today),
    first: votes[0].d, last: votes[votes.length - 1].d,
    codebook: { Y: 'yes', A: 'abstain', N: 'no', X: 'absent (a member that did not vote)', '-': 'not a member' },
    /* `n` is the file's own name for the seat; `ja` is Natural Earth's Japanese name of the country the code names today (absent
       for a state that no longer exists — the card then writes the file's name) */
    members: codes.map((c) => { const p = ne.byA3.get(c); return p && p.ja ? { c, n: members.get(c), ja: p.ja } : { c, n: members.get(c) }; }),
    sessions: [...sessions].map(([s, rows]) => { const ds = votes.filter((v) => v.s === s).map((v) => v.d); return { s, from: ds[0], to: ds[ds.length - 1], n: rows.length }; }),
    /* ⚠ `short` is the file's SUBJECT for the newer rows («ARMED CONFLICTS PREVENTION--MEDIATION») and the resolution's title is
       `descr` («Territorial integrity of Ukraine»); in earlier sessions `short` is the topic and `descr` the motion. Both are kept and
       both are searched (measured 2026-11-17: a search of the short titles alone could not find A/RES/68/262). */
    votes: votes.map((v) => [v.id, v.d, v.sym, v.t.trim(), v.s, v.f, v.ds.trim()]),
  };
  for (const [s, rows] of sessions) writeFileSync(join(dir, 's' + String(s).padStart(2, '0') + '.json'), JSON.stringify({ s, votes: rows }));
  writeFileSync(join(dir, 'index.json'), JSON.stringify(index));
  console.log('wrote', DIR, votes.length, 'votes ·', sessions.size, 'sessions ·', codes.length, 'members ·', index.first, '→', index.last);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch((e) => { console.error(e); process.exit(1); });
