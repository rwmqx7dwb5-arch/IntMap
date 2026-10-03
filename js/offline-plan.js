/* ============================================================================
 *  IntMap · offline maps — the parts that need no browser   (keyboard-and-offline)
 * ----------------------------------------------------------------------------
 *  What a saved region is made of and whether a source may be part of it. Pure functions over plain
 *  values: js/offline-maps.js (the manager and its dialog) and the test in Node read the same ones.
 *
 *  ⚠ THE QUESTION «MAY THIS BE SAVED» IS NEVER ANSWERED HERE FROM A LIST OF OURS. It is answered by the
 *  policy the page is handed — data/offline-sources.json, which scripts/offline-sources.mjs derives from the
 *  `offline` statement on each host's row in scripts/outbound-hosts.json (the ledger check:datagov holds
 *  against the code). A host with no statement is `not-stated`, and that is a refusal: silence is not
 *  permission. A host that states «no» is refused with the terms it rests on, and the reader is shown them.
 *  ⚠ A HOST IS NOT ONE DATASET: permission covers the host AND the path prefix the row names (a path-style S3
 *  endpoint serves every bucket in the world).
 * ==========================================================================*/

/* ⚠ THE CACHE'S NAME IS NOT HERE. js/offline-maps.js owns it (`OFFLINE_CACHE`, a literal in the file that opens it — the one
   tests/sw-cache-names-owned-checks.test.mjs can read) and sw.js reads the same literal; a test holds the two equal. */
/** where the list of saved regions is kept (the files themselves are in OFFLINE_CACHE) */
export const PACKS_KEY = 'intmap_offline_packs';

const MAX_LAT = 85.0511287798066;   /* the Web Mercator limit — tiles do not exist beyond it */

export const lng2x = (lng, z) => Math.floor(((lng + 180) / 360) * 2 ** z);
export const lat2y = (lat, z) => {
  const la = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat)) * Math.PI / 180;
  return Math.floor((1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2 * 2 ** z);
};

/** the tile rectangle a box [west, south, east, north] covers at zoom z (clamped to the grid). A box that
    crosses the antimeridian is two boxes: the caller splits it with `splitBox`. */
function tileRange(box, z) {
  const n = 2 ** z, c = (v) => Math.max(0, Math.min(n - 1, v));
  return { x0: c(lng2x(box[0], z)), x1: c(lng2x(box[2], z)), y0: c(lat2y(box[3], z)), y1: c(lat2y(box[1], z)) };
}
/** [w,s,e,n] with w > e crosses the antimeridian: it is [w,s,180,n] and [-180,s,e,n] */
export function splitBox(box) {
  const [w, s, e, n] = box;
  return w <= e ? [[w, s, e, n]] : [[w, s, 180, n], [-180, s, e, n]];
}
export function countTiles(box, zMin, zMax) {
  let k = 0;
  for (const b of splitBox(box)) for (let z = zMin; z <= zMax; z++) { const r = tileRange(b, z); k += (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1); }
  return k;
}
/** every tile of the box from zMin to zMax, coarse to fine — the order they are saved in, so a save that is
    stopped half-way holds the whole region at a lower detail rather than part of it at full detail */
export function* tilesOf(box, zMin, zMax) {
  const seen = new Set();
  for (let z = zMin; z <= zMax; z++) for (const b of splitBox(box)) {
    const r = tileRange(b, z);
    for (let x = r.x0; x <= r.x1; x++) for (let y = r.y0; y <= r.y1; y++) { const k = z + '/' + x + '/' + y; if (!seen.has(k)) { seen.add(k); yield { z, x, y }; } }
  }
}
export const fill = (tpl, t) => tpl.replace('{z}', t.z).replace('{x}', t.x).replace('{y}', t.y);

/** the policy row that speaks for a host: the exact name, or a `*.` row for any subdomain of it */
export function rowFor(policy, host) {
  const rows = (policy && Array.isArray(policy.hosts)) ? policy.hosts : [];
  return rows.find((r) => r.host === host) || rows.find((r) => r.host.startsWith('*.') && host.endsWith(r.host.slice(1))) || null;
}
/**
 * May this URL be saved, and if not, why — in one of three words:
 *   { ok: true,  row }                       the row says yes and the URL is inside the part it covers
 *   { ok: false, why: 'stated-no', row }     the row says no (its `why` / `basis` are what the reader is shown)
 *   { ok: false, why: 'not-stated', row }    nobody wrote anything down, or the URL is outside the covered path
 * The files IntMap serves itself are not asked here: they are the site's own (`sameOrigin`).
 */
export function verdict(policy, url) {
  let u; try { u = new URL(url); } catch (_) { return { ok: false, why: 'not-stated', row: null }; }
  if (u.protocol !== 'https:') return { ok: false, why: 'not-stated', row: null };
  const row = rowFor(policy, u.hostname);
  if (!row) return { ok: false, why: 'not-stated', row: null };
  if (row.allowed === false) return { ok: false, why: 'stated-no', row };
  if (row.allowed === true && row.pathPrefix && u.pathname.startsWith(row.pathPrefix)) return { ok: true, row };
  return { ok: false, why: 'not-stated', row };
}

/** the first URL template of a source that the policy lets be saved — the one the save fetches AND stores under */
export function savableTemplate(policy, templates) {
  for (const t of templates || []) { if (verdict(policy, fill(t, { z: 4, x: 8, y: 5 })).ok) return t; }
  return null;
}
/** the sources the policy refuses, each once, with the reason in the reader's language — what the dialog says is NOT saved */
export function refusals(policy) {
  const rows = (policy && Array.isArray(policy.hosts)) ? policy.hosts : [];
  return rows.filter((r) => r.allowed === false).map((r) => ({ host: r.host, kind: r.kind, basis: r.basis, why: r.why, whyJp: r.whyJp }));
}

/** the detail levels a region could be saved at, finest last: [{ zMax, tiles, bytes }] — only those whose
    estimated size fits `room` bytes (what the device says it has free). `meanBytes(z)` is a MEASURED mean tile size. */
export function terrainOptions(box, zFrom, zTo, meanBytes, room) {
  const out = [];
  for (let z = zFrom; z <= zTo; z++) {
    const tiles = countTiles(box, 0, z), per = meanBytes(z);
    if (!(per > 0)) continue;
    const bytes = Math.round(tiles * per);
    if (room != null && bytes > room) break;
    out.push({ zMax: z, tiles, bytes });
  }
  return out;
}

export const mb = (bytes) => { const v = bytes / 1048576; return v >= 100 ? Math.round(v) : v >= 10 ? Math.round(v * 10) / 10 : Math.round(v * 100) / 100; };

/** a stable id for a saved region: its box at 3 decimals and its detail — saving the same thing twice is one pack */
export function packId(box, zMax) { return 'p' + box.map((v) => Math.round(v * 1000)).join('_') + 'z' + zMax; }

/** the detail the dialog pre-selects and Atlas saves at when it is not told: the coarsest level that is still at least two
    levels finer than the view — enough that zooming in a little stays on saved ground — else the finest that fits */
export function defaultDetail(options, zoom) {
  if (!options || !options.length) return null;
  const want = Math.ceil(zoom) + 2;
  return options.find((o) => o.zMax >= want) || options[options.length - 1];
}
