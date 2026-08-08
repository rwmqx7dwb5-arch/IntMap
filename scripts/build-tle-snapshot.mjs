#!/usr/bin/env node
/* ============================================================================
 *  IntMap · BUILD THE BUNDLED SATELLITE CATALOGUE  (#R185)
 * ----------------------------------------------------------------------------
 *  「何も表示されないのは論外。実際の位置に全衛星がリアルタイムで美しく表示されるのが最低条件。」
 *
 *  The live satellite layer reads CelesTrak. CelesTrak is a single free host, and on 2026-08-01 it
 *  was unreachable for hours — DNS resolved, every connection timed out, and the three CORS proxies
 *  the submarine-cable layer uses all answered Cloudflare 520/522, which is what "the origin is
 *  down" looks like from a proxy. With one source and no fallback the layer draws NOTHING, and a
 *  layer that draws nothing is the one outcome the brief rules out.
 *
 *  So the app ships a catalogue of its own. This script builds it, and CI re-runs it on a schedule
 *  so the file that ships is never far from the live one. It is a REAL element set with a REAL
 *  epoch — never synthesised — and the layer labels how old the elements it used are, which is the
 *  honest way to serve a snapshot: SGP4 keeps propagating it in real time, and its accuracy decays
 *  from the epoch rather than from the download.
 *
 *  Sources, in order of preference:
 *    1. CelesTrak GP `active` — the authoritative set the live path also uses (~11,000 objects).
 *    2. SatNOGS DB `/api/tle/` — a keyless mirror of Space-Track / CelesTrak elements (~1,700
 *       objects, current to the hour). Reachable when CelesTrak is not; CORS-blocked in a browser,
 *       which is why it is used HERE, at build time, rather than at run time.
 *
 *  Output: data/tle/catalogue.tle (3-line sets, the format CelesTrak itself serves as FORMAT=tle)
 *          data/tle/catalogue.json (the manifest: source, object count, build time)
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';

const OUT_DIR = path.join(process.cwd(), 'data', 'tle');
const CELESTRAK = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle';
const SATNOGS = 'https://db.satnogs.org/api/tle/?format=json';
const TIMEOUT_MS = Number(process.env.TLE_TIMEOUT_MS || 90000);
/* ══ (#R207) …AND WHICH OBJECTS ARE IN WHICH CATALOGUE ══════════════════════════════════════════
   「人工衛星レイヤーで、カテゴリ選択が機能していない。」

   REPRODUCED against the live app: `fetch('https://celestrak.org/…')` → "Failed to fetch", while
   Esri and USGS both answer 200 from the same page. So CelesTrak is the one host that is out — the
   condition #R185 built this snapshot for — and #R185's fallback covers exactly ONE group:

       if (want === 'active' && !sats.length) { … the bundled catalogue … }

   Everything else runs the whole ladder, fails, and returns false: catalogue 0, drawn 0, an empty
   map. MEASURED: switching the picker from "All active" to "Space stations" took 16,099 objects to
   0. The picker is not broken — it is the only control in the app whose every setting but the
   default has no offline path, so it LOOKS broken exactly when the snapshot is doing its job.

   A TLE says nothing about which CelesTrak group it belongs to, and inferring one from the object's
   NAME would be fabrication (standing instruction 4) — "visual" in particular is a curated
   brightness list that no element set implies. So the membership is FETCHED, from the same
   authority, at the same time as the elements, and shipped beside them: `groups.json` is
   {group: [NORAD ids…]}, ints only, which is a few tens of KB for the whole set.

   ⚠ A GROUP THAT DOES NOT ANSWER IS OMITTED, NOT EMPTIED. An empty array would mean "this catalogue
   contains nothing", which is a claim; a missing key means "not known here", which is the truth, and
   the app treats the two differently (see js/satellites-live.js `bundledGroup`). */
const GROUPS = ['visual', 'stations', 'weather', 'geo', 'gps-ops', 'galileo', 'science', 'starlink'];

const get = async (url, kind) => {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ac.signal, headers: { 'User-Agent': 'IntMap/TLE-snapshot (+https://github.com/rwmqx7dwb5-arch/IntMap)' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return kind === 'json' ? await r.json() : await r.text();
  } finally { clearTimeout(t); }
};

/* A 3-line set is only usable if its two element lines are the right length and carry the right
   line numbers. Anything else is dropped rather than shipped — a malformed line does not become a
   satellite in a wrong place, it becomes no satellite. */
const usable = (l1, l2) => typeof l1 === 'string' && typeof l2 === 'string'
  && l1.length >= 69 && l2.length >= 69 && l1[0] === '1' && l2[0] === '2'
  && l1.slice(2, 7).trim() === l2.slice(2, 7).trim();

const fromCelestrak = (txt) => {
  const lines = String(txt).split(/\r?\n/);
  const out = [];
  for (let i = 0; i + 2 < lines.length + 1; i += 3) {
    const name = (lines[i] || '').trim(), l1 = lines[i + 1], l2 = lines[i + 2];
    if (!name || !usable(l1, l2)) continue;
    out.push([name, l1, l2]);
  }
  return out;
};
const fromSatnogs = (arr) => {
  const out = [];
  for (const s of (Array.isArray(arr) ? arr : [])) {
    const name = String(s.tle0 || '').replace(/^0\s+/, '').trim();
    if (!name || !usable(s.tle1, s.tle2)) continue;
    out.push([name, s.tle1, s.tle2]);
  }
  return out;
};

let sets = [], source = null, err = [];
try { sets = fromCelestrak(await get(CELESTRAK, 'text')); if (sets.length) source = 'CelesTrak GP (active)'; }
catch (e) { err.push('celestrak: ' + (e && e.message || e)); }
if (!sets.length) {
  try { sets = fromSatnogs(await get(SATNOGS, 'json')); if (sets.length) source = 'SatNOGS DB (Space-Track / CelesTrak elements)'; }
  catch (e) { err.push('satnogs: ' + (e && e.message || e)); }
}
if (!sets.length) { console.error('no catalogue could be built:', err.join('; ')); process.exit(1); }

/* ⚠ THE TLE EPOCH FIELD IS `YYDDD.DDDDDDDD`, AND IT DOES NOT SORT.
   Comparing it as a number puts 1975 (75042) after 2026 (26212), because the two-digit year wraps
   at 57. Measured on the first build: the manifest reported the newest elements in the file as
   1975-02-11 while every set in it was from July 2026. Convert to an absolute instant first — the
   same conversion the dedupe below needs, so there is one of it. */
const epochMs = (l1) => {
  const e = parseFloat(l1.slice(18, 32));
  if (!isFinite(e)) return 0;
  const yy = Math.floor(e / 1000), year = yy < 57 ? 2000 + yy : 1900 + yy, doy = e % 1000;
  return Date.UTC(year, 0, 1) + (doy - 1) * 86400000;
};
/* newest elements win when a NORAD id appears twice */
const byId = new Map();
for (const [name, l1, l2] of sets) {
  const id = l1.slice(2, 7).trim();
  const epoch = epochMs(l1);
  const prev = byId.get(id);
  if (!prev || epoch > prev.epoch) byId.set(id, { name, l1, l2, epoch });
}
const kept = [...byId.values()];
const text = kept.map(o => o.name + '\n' + o.l1 + '\n' + o.l2).join('\n') + '\n';

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'catalogue.tle'), text, 'utf8');
/* the newest epoch in the file, so the app can say how old the elements are without parsing them */
const newestIso = new Date(kept.reduce((m, o) => Math.max(m, o.epoch), 0)).toISOString();
const medianAgeH = (() => {
  const now = Date.now();
  const ages = kept.map(o => (now - o.epoch) / 3600000).sort((a, b) => a - b);
  return +ages[ages.length >> 1].toFixed(1);
})();
/* (#R207) the membership lists — see the note by GROUPS. Sequential rather than parallel: this is a
   free service and #R185's own notes record it rate-limiting a burst of requests for one group. */
const groupIds = {};
const groupErr = [];
const have = new Set(kept.map(o => o.l1.slice(2, 7).trim().replace(/^0+/, '')));
for (const g of GROUPS) {
  try {
    const txt = await get('https://celestrak.org/NORAD/elements/gp.php?GROUP=' + encodeURIComponent(g) + '&FORMAT=tle', 'text');
    const ids = [];
    const lines = String(txt).split(/\r?\n/);
    for (let i = 0; i + 2 < lines.length + 1; i += 3) {
      const l1 = lines[i + 1], l2 = lines[i + 2];
      if (!usable(l1, l2)) continue;
      const id = l1.slice(2, 7).trim().replace(/^0+/, '');
      /* only ids the shipped catalogue can actually serve — a member it does not hold would make the
         count in the legend disagree with what is drawn */
      if (have.has(id)) ids.push(+id);
    }
    if (ids.length) groupIds[g] = ids.sort((a, b) => a - b);
    else groupErr.push(g + ': parsed nothing');
  } catch (e) { groupErr.push(g + ': ' + (e && e.message || e)); }
}
fs.writeFileSync(path.join(OUT_DIR, 'groups.json'), JSON.stringify({
  source: 'CelesTrak GP group listings',
  builtAt: new Date().toISOString(),
  note: 'NORAD catalogue numbers per CelesTrak group, restricted to objects present in catalogue.tle. Lets the bundled snapshot answer a category request when the live feed is unreachable. A group that could not be fetched is ABSENT, not empty.',
  groups: groupIds,
  errors: groupErr,
}) + '\n', 'utf8');

fs.writeFileSync(path.join(OUT_DIR, 'catalogue.json'), JSON.stringify({
  source, objects: kept.length, newestEpoch: newestIso, medianElementAgeHours: medianAgeH,
  builtAt: new Date().toISOString(),
  note: 'Bundled fallback for the live satellite layer. Real element sets; SGP4 propagates them in real time and the app shows their age.',
  errors: err,
}, null, 1) + '\n', 'utf8');
console.log('catalogue:', kept.length, 'objects from', source, '· newest epoch', newestIso, '·', Math.round(text.length / 1024) + ' KB');
console.log('groups:', Object.keys(groupIds).map(g => g + '=' + groupIds[g].length).join(' ') || '(none)');
if (groupErr.length) console.log('  (group listings unavailable:', groupErr.join('; ') + ')');
if (err.length) console.log('  (fell back:', err.join('; ') + ')');
