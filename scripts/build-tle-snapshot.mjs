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
 *  Sources — COMPOSED, NOT CHOSEN BETWEEN (#1025; the rule is scripts/lib/tle-compose.mjs):
 *    1. CelesTrak GP `active` — the authoritative set the live path also uses (~11,000 objects).
 *    2. SatNOGS DB `/api/tle/` — a keyless mirror of Space-Track / CelesTrak elements (~1,700
 *       objects, current to the hour). Reachable when CelesTrak is not; CORS-blocked in a browser,
 *       which is why it is used HERE, at build time, rather than at run time.
 *  When CelesTrak answers it is the whole truth; when it does not, the PREVIOUS bundle is carried
 *  forward and SatNOGS only updates it — a 1,700-object mirror never replaces a 16,000-object set.
 *
 *  Output: data/tle/catalogue.tle (3-line sets, the format CelesTrak itself serves as FORMAT=tle)
 *          data/tle/catalogue.json (the manifest: source, object count, build time)
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import { CELESTRAK_GP } from './lib/upstream-cadence.mjs';
import { parseTle, parseSatnogs, composeCatalogue, composeGroups, lastCelestrakAt, idOf } from './lib/tle-compose.mjs';

const OUT_DIR = path.join(process.cwd(), 'data', 'tle');
const CELESTRAK = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle';
const SATNOGS = 'https://db.satnogs.org/api/tle/?format=json';

/* ⚠ (#729) 出自は値である（散文ではない）。読むのは js/data-governance.js の read() で、
   npm run check:datagov がこの宣言と data/ の実体・js/reference-data.js の DATA_SOURCES を
   突き合わせる。⚠ ここに書くのは「上流が述べていること」だけ——述べていないものは書かない。 */
export const GOVERNANCE = {
  ...(() => {
    /* two upstreams composed per run; the manifest records how many sets each supplied and how many were carried */
    const rec = {
      upstreams: [
        { publisher: 'CelesTrak', url: CELESTRAK },
        { publisher: 'SatNOGS DB', url: SATNOGS },
      ],
      /* ⚠ THE CADENCE IS THE UPSTREAM'S, MEASURED — NOT THE TWICE-A-DAY SCHEDULE THIS REPOSITORY
         REFRESHES AT (.github/workflows/tle-refresh.yml). A schedule we chose is not a period a
         supplier publishes (js/data-governance.js, `cadence`); the median element age at build time
         is, and it is about a day. */
      ...CELESTRAK_GP,
      builtBy: 'scripts/build-tle-snapshot.mjs',
    };
    return { 'data/tle/catalogue.tle': rec, 'data/tle/catalogue.json': rec, 'data/tle/groups.json': rec };
  })(),
};
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


/* (#1025) THE BUNDLE BEFORE THIS RUN. It is the universe a run that CelesTrak did not answer carries
   forward — see scripts/lib/tle-compose.mjs. Absent on the very first build. */
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(path.join(OUT_DIR, f), 'utf8')); } catch (_) { return null; } };
let previous = [];
try { previous = parseTle(fs.readFileSync(path.join(OUT_DIR, 'catalogue.tle'), 'utf8')); } catch (_) {}
const previousManifest = readJson('catalogue.json');
const previousGroups = (readJson('groups.json') || {}).groups || {};

let celestrak = null, satnogs = null, err = [];
try { celestrak = parseTle(await get(CELESTRAK, 'text')); }
catch (e) { err.push('celestrak: ' + (e && e.message || e)); }
if (!celestrak || !celestrak.length) {
  /* SatNOGS is asked only when CelesTrak did not answer — it is a ~1,700-object mirror, an update to
     the carried set and never a replacement for it */
  try { satnogs = parseSatnogs(await get(SATNOGS, 'json')); }
  catch (e) { err.push('satnogs: ' + (e && e.message || e)); }
}
const { kept, counts, celestrakAnswered } = composeCatalogue({ celestrak, satnogs, previous });
if (!kept.length) { console.error('no catalogue could be built:', err.join('; ')); process.exit(1); }
const source = celestrakAnswered ? 'CelesTrak GP (active)'
  : (counts.satnogs ? 'SatNOGS DB (Space-Track / CelesTrak elements) + carried forward from the previous bundle' : 'carried forward from the previous bundle (no upstream answered)');
const builtAt = new Date().toISOString();
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
const fetchedGroups = {};
const groupErr = [];
const have = new Set(kept.map(o => idOf(o.l1).replace(/^0+/, '')));
for (const g of GROUPS) {
  try {
    const sets = parseTle(await get('https://celestrak.org/NORAD/elements/gp.php?GROUP=' + encodeURIComponent(g) + '&FORMAT=tle', 'text'));
    /* only ids the shipped catalogue can actually serve — a member it does not hold would make the
       count in the legend disagree with what is drawn */
    const ids = sets.map(s => idOf(s[1]).replace(/^0+/, '')).filter(id => have.has(id)).map(Number);
    if (ids.length) fetchedGroups[g] = ids;
    else groupErr.push(g + ': parsed nothing');
  } catch (e) { groupErr.push(g + ': ' + (e && e.message || e)); }
}
const { groups: groupIds, carried: groupsCarried } = composeGroups({ wanted: GROUPS, fetched: fetchedGroups, previous: previousGroups, have });
const prevGroupsManifest = readJson('groups.json') || {};
fs.writeFileSync(path.join(OUT_DIR, 'groups.json'), JSON.stringify({
  source: 'CelesTrak GP group listings',
  builtAt,
  note: 'NORAD catalogue numbers per CelesTrak group, restricted to objects present in catalogue.tle. Lets the bundled snapshot answer a category request when the live feed is unreachable. A group that could not be fetched keeps its previous members (those the catalogue still holds) and is named in `carried`; a group never known is ABSENT, not empty.',
  groups: groupIds,
  carried: groupsCarried,
  /* the last time the group listings answered for the groups carried — kept so a long outage stays visible */
  carriedSince: groupsCarried.length ? (prevGroupsManifest.carried && prevGroupsManifest.carried.length && prevGroupsManifest.carriedSince ? prevGroupsManifest.carriedSince : (prevGroupsManifest.builtAt || null)) : null,
  errors: groupErr,
}) + '\n', 'utf8');

fs.writeFileSync(path.join(OUT_DIR, 'catalogue.json'), JSON.stringify({
  source, objects: kept.length, newestEpoch: newestIso, medianElementAgeHours: medianAgeH,
  builtAt,
  sources: counts,
  lastCelestrakAt: lastCelestrakAt({ celestrakAnswered, now: builtAt, previousManifest }),
  note: 'Bundled fallback for the live satellite layer. Real element sets; SGP4 propagates them in real time and the app shows their age. When CelesTrak does not answer, the previous bundle is carried forward and updated with whatever did answer (`sources.carried` counts the carried sets; `lastCelestrakAt` is when CelesTrak last answered).',
  errors: err,
}, null, 1) + '\n', 'utf8');
console.log('catalogue:', kept.length, 'objects · celestrak', counts.celestrak, '· satnogs', counts.satnogs, '· carried', counts.carried, '· newest epoch', newestIso, '·', Math.round(text.length / 1024) + ' KB');
console.log('groups:', Object.keys(groupIds).map(g => g + '=' + groupIds[g].length).join(' ') || '(none)');
if (groupsCarried.length) console.log('  (groups carried forward:', groupsCarried.join(', ') + ')');
if (groupErr.length) console.log('  (group listings unavailable:', groupErr.join('; ') + ')');
if (err.length) console.log('  (upstream errors:', err.join('; ') + ')');
