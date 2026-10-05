#!/usr/bin/env node
/* ============================================================================
 *  IntMap · HARVESTER — Pelagios «MAGIS Pleiades Regions»: Roman provinces digitised by Pedar Foss
 *  (MAGIS, DePauw University, 2007) from the Barrington Atlas rasters of the Ancient World Mapping
 *  Center, linked to Pleiades places by Stuart Eve (Pelagios, 2015).
 * ----------------------------------------------------------------------------
 *  UPSTREAM (read 2026-10-05)
 *    repository  https://github.com/pelagios/magis-pleiades-regions
 *    commit      ad583a9aaa7f9d2b5c11ca1302e584a1100cd82d (2017-04-06, «Initial import»; the newest
 *                commit on 2026-10-05). EVERY URL below is pinned to it.
 *    file        pleiades-regions-magis-pelagios.geojson (1,785,371 bytes): 147 features, CRS84
 *                (urn:ogc:def:crs:OGC:1.3:CRS84 = WGS84 lon/lat), 86 Polygon + 61 MultiPolygon.
 *                Properties are ONLY { name, uri } — the outline and a Pleiades place URI. 121
 *                distinct URIs: 26 URIs carry two outlines each.
 *
 *  LICENCE EVIDENCE (checked 2026-10-05; harvest refuses to run if these no longer hold)
 *    · README.md at the pinned commit
 *      (https://raw.githubusercontent.com/pelagios/magis-pleiades-regions/ad583a9aaa7f9d2b5c11ca1302e584a1100cd82d/README.md):
 *        «The data was made available by Pedar Foss for free redistribution,
 *         with attribution (Copyright AWMC & Foss, CC-BY).»
 *    · the repository has NO LICENSE file (the listing at the commit is README.md, the .geojson,
 *      the .ttl and rdfToGeoJSON.py — GitHub API contents?ref=<sha>, cached as repo-listing.json).
 *      The README sentence is the only licence statement, and it names no CC BY version.
 *    · THE DATES AND THE LATIN NAMES ARE PLEIADES'S, not MAGIS's. Every Pleiades place JSON read
 *      states «Sharing and remixing permitted under terms of the Creative Commons Attribution 3.0
 *      License (cc-by).» (121 of 121; «Copyright © The Contributors» on 116, «The Creators» on 5).
 *      SOURCE.inheritedTerms says so; SOURCE.citation credits both.
 *
 *  ══ ⚠⚠ DATES — WHY THIS IS NOT «THE UNION OF THE PERIODS PLEIADES ATTESTS» ═════════════════════
 *  That was the plan. Measured on all 121 places (2026-10-05), it states false things:
 *    · 100 of 121 places carry NO period attestation on any name or location at all (Belgica I,
 *      Savia, Noricum Ripense, Aquitania II, every diocese…). There is no place-level minDate,
 *      maxDate or temporalRange field; `start`/`end` on names/locations/connections are Pleiades's
 *      own roll-up of the same attestations.
 *    · where attestations exist they date the NAME's use, not the province: Pannonia Inferior
 *      «modern» (1700–2100), Paphlagonia, Syria Coele, Mauretania Sitifensis «modern», Pontus
 *      Polemoniacus «twentieth-ce»; Britannia «hellenistic-republican, roman» (from 330 BC — the
 *      province dates from AD 43); Byzacena (a Diocletianic province) «roman» from 30 BC; Belgica
 *      (the early province) only «late-antique» — i.e. drawn AFTER it was split into Belgica I/II.
 *  Drawing those spans would put a Tetrarchic province in Augustus's empire and an early province
 *  in the 17th century (.agents/rules/historical-verification.md §2.2: «upstream says so» is not
 *  history). --summary prints the table so the refusal is checkable.
 *
 *  WHAT IS STATED INSTEAD — WHICH MAP THE OUTLINE IS FROM, AND WHAT MOMENT THAT MAP SHOWS
 *    · Every Pleiades place cites the Barrington Atlas grid square it is named on
 *      (references[].shortTitle «BAtlas», citationDetail «<map> <square> <name>»). The provinces
 *      are on map 100 or map 101; a few URIs point to REGIONS cited only on regional maps
 *      (1, 19, 29, 89) — those outlines have no stated moment and are dropped.
 *    · Pleiades states what the two maps show, in its own place descriptions, and the years are
 *      READ FROM THAT TEXT at harvest time (`moments()`), never typed here:
 *        map 100 — «A province of the Roman Empire at the death of Trajan (117 CE).»
 *                  (Britannia 981513, Numidia 981539, Pannonia Superior 981541, Pannonia Inferior
 *                  981540, Dalmatia 981522, Dacia 981518)
 *        map 101 — «Map 101 of the Barrington Atlas ("Dioceses and Provinces of the Roman Empire")
 *                  that follows the Verona List (ca. A.D. 303–324).» (Mauretania Sitifensis 991334)
 *    · So each unit is a SNAPSHOT, like a census map: map 100 → 117 (end 118, exclusive), map 101
 *      → 303 … 324 (end 325, exclusive), year precision. Both ends are DERIVED (startDerived /
 *      endDerived true) and the basis says that they are the date of the map, not the founding or
 *      abolition of the province.
 *
 *  ⚠ THE MAP A PLACE IS CITED ON IS NOT ALWAYS THE MAP THE OUTLINE IS FROM — measured, and caught:
 *    Pisidia, Paphlagonia, Hellespontus, Pontus Polemoniacus and Armenia Minor are cited «BAtlas
 *    100» but are Verona-List provinces (dioceses Asiana / Pontica), and their outlines sit inside
 *    the map-100 provinces (Galatia et Cappadocia, Bithynia et Pontus, Asia, Lycia et Pamphylia)
 *    while tiling with the map-101 ones. Two outlines of ONE moment cannot both hold the same
 *    ground, so:
 *  OVERLAPS AT ONE MOMENT — two non-diocese outlines of the same map sharing ≥ OVERLAP_MIN of
 *    the smaller one's ground (the share and the lattice of scripts/build-hist-admin-fill.mjs,
 *    imported — the same test the surveys builder yields with). If Pleiades states a part_of
 *    connection between the two places, the part is the lower level and only it is dropped;
 *    otherwise BOTH are dropped («overlapping claim Pleiades does not separate»). Nothing is
 *    decided by name. Run on every candidate, duplicates included, so a mis-cited outline is not
 *    left standing because its partner was dropped for another reason first.
 *  TWO OUTLINES, ONE PLACE — 26 URIs carry two outlines (one is usually the early province, the
 *    other the late one of the same name). Pleiades states one map for the place and no field
 *    ties either outline to it, so both are dropped («two outlines share one Pleiades place»).
 *
 *  LEVEL — dioceses are a level above the provinces (diocese ⊃ provinces): kind 'diocese' when the
 *    Barrington Atlas Directory note Pleiades quotes in `details` («The Barrington Atlas Directory
 *    notes: diocese») says so, OR when the outline is on map 101 and its name is one the Directory
 *    gives as the diocese of a map-101 province («…notes: Galliae»). admits() refuses dioceses.
 *    Measured: Thracia 992078 has no note and Pleiades titles it a «Late Roman province», but four
 *    provinces' notes name «Thracia» as their diocese and its outline holds all four; Creta 991373
 *    has placeType «diocese-roman» but its note names its diocese «Moesiae» — the Directory (the
 *    source the outlines were drawn from) is followed; --summary prints both disagreements.
 *
 *  sovereign: 'ROMAN' (the Roman Empire; not an ISO code — there is none).
 *  names: en = the MAGIS name; la = a Latin name Pleiades gives the place (language «la») — the one
 *    spelt as the MAGIS name if there is one, otherwise the first whose attestations are empty or
 *    include a period containing the snapshot year (so a «modern» Latin form is not used).
 *  id: «magis:<feature index in the pinned file>#pleiades:<place id>».
 *
 *  Usage:  node scripts/histsurveys/magis.mjs --fetch      (network; ~2.5 min, 1 request/s to Pleiades)
 *          node scripts/histsurveys/magis.mjs --summary    (cache only)
 * ==========================================================================*/
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { OVERLAP_MIN, samplePoints, hitMask } from '../build-hist-admin-fill.mjs';

const REPO = 'pelagios/magis-pleiades-regions';
const SHA = 'ad583a9aaa7f9d2b5c11ca1302e584a1100cd82d';
const RAW = `https://raw.githubusercontent.com/${REPO}/${SHA}`;
const README_URL = `${RAW}/README.md`;
const VOCAB_URL = 'https://pleiades.stoa.org/vocabularies/time-periods';

export const SOURCE = {
  key: 'magis',
  publisher: 'Ancient World Mapping Center & Pedar Foss (MAGIS), via Pelagios; dates and Latin names from Pleiades',
  title: 'MAGIS Pleiades Regions — Roman provinces of Barrington Atlas maps 100 (AD 117) and 101 (Verona List, ca. AD 303–324)',
  url: `https://github.com/${REPO}`,
  download: `${RAW}/pleiades-regions-magis-pelagios.geojson`,
  licence: 'CC BY (geometry: «Copyright AWMC & Foss, CC-BY», no version stated) · CC BY 3.0 (Pleiades dates and names)',
  licenceUrl: 'https://creativecommons.org/licenses/by/3.0/',
  licenceStatedAt: README_URL,
  inheritedTerms: 'Pleiades place records (https://pleiades.stoa.org/places/<id>/json): «Sharing and remixing permitted under terms of the Creative Commons Attribution 3.0 License (cc-by).»',
  citation: 'Polygons digitised by Pedar Foss (MAGIS, DePauw University, 2007) from Barrington Atlas rasters georegistered by the Ancient World Mapping Center; Copyright AWMC & Foss, CC-BY. '
    + 'Pleiades identifiers by Stuart Eve (Pelagios, 2015): github.com/pelagios/magis-pleiades-regions @ ad583a9. '
    + 'Dates and Latin names: Pleiades (pleiades.stoa.org), CC BY 3.0.',
};

const CACHE = path.join(os.tmpdir(), 'intmap-histsurveys-cache', 'magis');
const GEO = path.join(CACHE, 'pleiades-regions-magis-pelagios.geojson');
const README = path.join(CACHE, 'README.md');
const LISTING = path.join(CACHE, 'repo-listing.json');
const VOCAB = path.join(CACHE, 'time-periods.html');
const PLACES = path.join(CACHE, 'places');
const UA = { 'User-Agent': 'IntMap-histsurveys/1 (+https://github.com/rwmqx7dwb5-arch/IntMap)' };
const LICENCE_SENTENCE = /made available by Pedar Foss for free redistribution,\s+with attribution \(Copyright AWMC & Foss, CC-BY\)/;

async function get(url, as) {
  let last;
  for (let i = 0; i < 2; i++) {            /* retry only after an observed failure, with a longer wait */
    try {
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(60000) });
      if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
      return as === 'json' ? await r.json() : await r.text();
    } catch (e) { last = e; await new Promise((res) => setTimeout(res, 3000 * (i + 1))); }
  }
  throw last;
}
const placeId = (uri) => (/\/places\/(\d+)\/?$/.exec(uri || '') || [])[1] || null;

export async function fetchRaw() {
  fs.mkdirSync(PLACES, { recursive: true });
  const put = (f, s) => { fs.writeFileSync(f + '.part', s); fs.renameSync(f + '.part', f); };
  if (!fs.existsSync(GEO)) put(GEO, await get(SOURCE.download));
  if (!fs.existsSync(README)) put(README, await get(README_URL));
  if (!fs.existsSync(LISTING)) put(LISTING, JSON.stringify(await get(`https://api.github.com/repos/${REPO}/contents?ref=${SHA}`, 'json')));
  if (!fs.existsSync(VOCAB)) put(VOCAB, await get(VOCAB_URL));
  const ids = [...new Set(JSON.parse(fs.readFileSync(GEO, 'utf8')).features.map((f) => placeId(f.properties.uri)).filter(Boolean))];
  for (const id of ids) {
    const f = path.join(PLACES, id + '.json');
    if (fs.existsSync(f)) continue;
    put(f, JSON.stringify(await get(`https://pleiades.stoa.org/places/${id}/json`, 'json')));
    await new Promise((res) => setTimeout(res, 1000));   /* polite: one request a second */
  }
  return CACHE;
}

/* ── Pleiades's time-period vocabulary: slug → [fromYear, toYear] (negative = BC) ───────────────
   The page shows each term as «<a href="time-periods/<slug>">Title … (30 BC - AD 300)». */
function vocabulary() {
  const h = fs.readFileSync(VOCAB, 'utf8');
  const heads = [], re = /<a href="time-periods\/([a-z0-9-]+)">/g;
  let m;
  while ((m = re.exec(h))) heads.push([m.index, m[1]]);
  const year = (n, era) => (/BC/.test(era || '') ? -Number(n) : Number(n));
  const out = new Map();
  heads.forEach(([at, slug], k) => {
    const seg = h.slice(at, k + 1 < heads.length ? heads[k + 1][0] : undefined);
    const p = /\(\s*(?:AD\s+)?(\d+)(\s*BC)?\s*-\s*(?:AD\s+)?(\d+)(\s*BC)?\s*\)/.exec(seg);
    if (p) out.set(slug, [year(p[1], p[2]), year(p[3], p[4])]);
  });
  if (!out.has('roman') || !out.has('late-antique')) throw new Error('magis: the Pleiades time-period vocabulary no longer parses (no «roman» / «late-antique»)');
  return out;
}

/* ── what moment each Barrington map shows — READ FROM PLEIADES'S OWN DESCRIPTIONS ─────────── */
const MOMENT_READERS = {
  100: { re: /at the death of Trajan \((\d+) CE\)/i, span: (m) => [Number(m[1]), Number(m[1])] },
  101: { re: /Map 101 of the Barrington Atlas \("([^"]+)"\) that follows the Verona List \(ca\. A\.D\. (\d+)\s*[–-]\s*(\d+)\)/i, span: (m) => [Number(m[2]), Number(m[3])] },
};
function moments(places, mapOf) {
  const out = {};
  for (const [map, r] of Object.entries(MOMENT_READERS)) {
    const seen = [];
    for (const [id, j] of places) {
      if (mapOf.get(id) !== Number(map)) continue;
      const m = r.re.exec(j.description || '');
      if (m) seen.push({ id, span: r.span(m), quote: m[0] });
    }
    if (!seen.length) throw new Error(`magis: no Pleiades place on map ${map} states what moment the map shows any more — re-read before dating`);
    const k = new Set(seen.map((s) => s.span.join('-')));
    if (k.size !== 1) throw new Error(`magis: Pleiades descriptions disagree on the moment of map ${map}: ${[...k].join(', ')}`);
    out[map] = { from: seen[0].span[0], to: seen[0].span[1], quote: seen[0].quote, places: seen.map((s) => s.id) };
  }
  return out;
}

/* ── geometry ───────────────────────────────────────────────────────────────────────────── */
const r4 = (n) => Math.round(n * 1e4) / 1e4;
function ringClean(ring) {
  const out = [];
  for (const [x, y] of ring) {
    const p = [r4(x), r4(y)], q = out[out.length - 1];
    if (!q || q[0] !== p[0] || q[1] !== p[1]) out.push(p);
  }
  if (out.length && (out[0][0] !== out[out.length - 1][0] || out[0][1] !== out[out.length - 1][1])) out.push(out[0].slice());
  return out.length >= 4 ? out : null;
}
function toMulti(g) {
  if (!g) return [];
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  return polys.map((poly) => poly.map(ringClean)).filter((poly) => poly[0]).map((poly) => poly.filter(Boolean));
}
function bbox(polys) {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const p of polys) for (const [x, y] of p[0]) { if (x < a) a = x; if (y < b) b = y; if (x > c) c = x; if (y > d) d = y; }
  return [a, b, c, d];
}
const meets = (p, q) => !(p[2] < q[0] || p[0] > q[2] || p[3] < q[1] || p[1] > q[3]);
/* the share of A's sample that B holds */
function share(A, B) {
  const m = hitMask(B.coords, A.pts);
  let n = 0; for (let i = 0; i < m.length; i++) n += m[i];
  return A.pts.length ? n / A.pts.length : 0;
}

/* ── the Pleiades fields read ───────────────────────────────────────────────────────────── */
const bAtlas = (j) => (j.references || []).filter((r) => r.shortTitle === 'BAtlas').map((r) => String(r.citationDetail || '').trim());
/* «The Barrington Atlas Directory notes: Galliae» — the first word after the colon */
const directoryNote = (j) => ((String(j.details || '').replace(/<[^>]+>/g, ' ').match(/Directory notes:\s*([^\s<.]+)/) || [])[1] || '').trim();
const periodsOf = (j) => {
  const s = new Set();
  for (const x of [...(j.names || []), ...(j.locations || [])]) for (const a of x.attestations || []) if (a.timePeriod) s.add(a.timePeriod);
  return [...s];
};
const iso = (y) => (y < 0 ? '-' : '') + String(Math.abs(y)).padStart(4, '0') + '-01-01';

export async function harvest() {
  for (const f of [GEO, README, LISTING, VOCAB]) if (!fs.existsSync(f)) throw new Error('magis cache missing — run with --fetch first (' + f + ')');
  if (!LICENCE_SENTENCE.test(fs.readFileSync(README, 'utf8'))) throw new Error('magis: README at the pinned commit no longer carries the licence sentence — re-read the licence');
  const listing = JSON.parse(fs.readFileSync(LISTING, 'utf8')).map((x) => x.name);
  if (listing.some((n) => /^licen[cs]e/i.test(n))) throw new Error('magis: the repository now has a licence file (' + listing.join(', ') + ') — read it and update the evidence');
  const geo = JSON.parse(fs.readFileSync(GEO, 'utf8'));
  const crs = geo.crs && geo.crs.properties && geo.crs.properties.name;
  if (crs && !/CRS84|4326/.test(crs)) throw new Error('magis: CRS is ' + crs + ', not WGS84 lon/lat');
  const vocab = vocabulary();

  const places = new Map();
  for (const f of geo.features) {
    const id = placeId(f.properties && f.properties.uri);
    if (!id || places.has(id)) continue;
    const p = path.join(PLACES, id + '.json');
    if (!fs.existsSync(p)) throw new Error(`magis: Pleiades place ${id} not cached — run with --fetch`);
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!/Creative Commons Attribution 3\.0/.test(j.rights || '')) throw new Error(`magis: Pleiades place ${id} no longer states CC BY 3.0: ${j.rights}`);
    places.set(id, j);
  }
  /* the Barrington map each place is cited on (only 100 and 101 are the empire maps; a place cited on
     both, or on neither, has no single moment) */
  const mapOf = new Map();
  for (const [id, j] of places) {
    const maps = [...new Set(bAtlas(j).map((c) => Number(c.split(/\s+/)[0])).filter((n) => n === 100 || n === 101))];
    mapOf.set(id, maps.length === 1 ? maps[0] : null);
  }
  const moment = moments(places, mapOf);
  /* the diocese names the Directory gives for map-101 provinces */
  const dioceseNames = new Set();
  for (const [id, j] of places) { const n = directoryNote(j); if (mapOf.get(id) === 101 && n && n !== 'diocese' && n !== 'province') dioceseNames.add(n); }

  const uriCount = new Map();
  for (const f of geo.features) { const id = placeId(f.properties.uri); uriCount.set(id, (uriCount.get(id) || 0) + 1); }

  const cands = [], dropped = [];
  geo.features.forEach((f, i) => {
    const pid = placeId(f.properties.uri), name = String(f.properties.name || '').trim();
    const id = `magis:${i}#pleiades:${pid}`;
    if (!pid || !name) { dropped.push({ id, name: name || null, reason: 'no Pleiades URI or name' }); return; }
    const coords = toMulti(f.geometry);
    if (!coords.length) { dropped.push({ id, name, reason: 'no usable polygon geometry' }); return; }
    const j = places.get(pid), map = mapOf.get(pid), note = directoryNote(j);
    if (map == null) {
      dropped.push({ id, name, reason: 'Pleiades cites this place on no Barrington empire map (100 or 101) — the moment the outline shows is not stated', cited: bAtlas(j) });
      return;
    }
    const kind = note === 'diocese' || (map === 101 && dioceseNames.has(name)) ? 'diocese' : 'province';
    const mo = moment[map];
    const basis = `the date of Barrington Atlas map ${map}, on which Pleiades cites this place (${bAtlas(j).join('; ')}); Pleiades: «${mo.quote}» — the outline as that map shows it, not the founding or abolition of the ${kind}`;
    const lat = (j.names || []).filter((n) => n.language === 'la');
    const inMoment = (n) => !(n.attestations || []).length || n.attestations.some((a) => { const r = vocab.get(a.timePeriod); return r && r[0] <= mo.from && mo.from <= r[1]; });
    const laName = (n) => String(n.attested || n.romanized || '').split(',')[0].trim();
    const la = (lat.find((n) => laName(n) === name) || lat.find(inMoment) || null);
    const pp = periodsOf(j);
    const ranges = pp.map((p) => vocab.get(p)).filter(Boolean);
    cands.push({
      id, name, names: la ? { en: name, la: laName(la) } : { en: name },
      start: iso(mo.from), startPrecision: 'year', startDerived: true, startBasis: basis,
      end: iso(mo.to + 1), endPrecision: 'year', endDerived: true, endBasis: basis,
      sovereign: 'ROMAN', kind, coords,
      pleiades: `https://pleiades.stoa.org/places/${pid}`, pleiadesTitle: j.title, barringtonMap: map, directoryNote: note || null,
      placeTypes: j.placeTypes || [],
      pleiadesPeriods: pp, pleiadesPeriodSpan: ranges.length ? [Math.min(...ranges.map((r) => r[0])), Math.max(...ranges.map((r) => r[1]))] : null,
      _pid: pid, _dup: uriCount.get(pid) > 1,
    });
  });

  /* ── overlaps at one moment (dioceses excluded: they are refused as a level above) ─────────── */
  const prov = cands.filter((u) => u.kind !== 'diocese');
  for (const u of prov) { u._bb = bbox(u.coords); u.pts = samplePoints(u.coords); }
  const partOf = (a, b) => (places.get(a._pid).connections || []).some((c) => /part_of/.test(c.connectionType || '') && placeId(c.connectsTo) === b._pid);
  const overlaps = [];
  for (let x = 0; x < prov.length; x++) for (let y = x + 1; y < prov.length; y++) {
    const A = prov[x], B = prov[y];
    if (A.barringtonMap !== B.barringtonMap || !meets(A._bb, B._bb)) continue;
    const s = Math.max(share(A, B), share(B, A));
    if (s < OVERLAP_MIN) continue;
    const res = partOf(A, B) ? { lower: A } : partOf(B, A) ? { lower: B } : null;
    overlaps.push({ a: A, b: B, share: s, drop: res ? [res.lower] : [A, B], resolution: res ? `Pleiades: ${res.lower.name} part_of the other → drop ${res.lower.name}` : 'Pleiades states no part_of between them → drop both' });
  }
  const dropWhy = new Map();
  const mark = (u, r) => { if (!dropWhy.has(u)) dropWhy.set(u, []); if (!dropWhy.get(u).includes(r)) dropWhy.get(u).push(r); };
  for (const u of cands) if (u._dup) mark(u, 'two outlines share one Pleiades place — which one the place (and its Barrington map) is, Pleiades does not say');
  for (const o of overlaps) for (const u of o.drop) mark(u, o.drop.length === 2 ? 'overlapping claim Pleiades does not separate' : 'a part of another outline at the same moment, by Pleiades part_of');
  const units = [];
  for (const u of cands) {
    const why = dropWhy.get(u);
    const clean = { ...u }; delete clean.pts; delete clean._bb; delete clean._dup; delete clean._pid;
    if (why) dropped.push({ id: u.id, name: u.name, reason: why[0], also: why.slice(1), barringtonMap: u.barringtonMap, kind: u.kind });
    else units.push(clean);
  }
  return { source: SOURCE, units, dropped, report: { moment, dioceseNames: [...dioceseNames].sort(), overlaps, vocab, cands, places } };
}

/* WHICH ROWS ARE FIRST-LEVEL SUBDIVISIONS — the provinces. A diocese is a level above them (the
   Barrington Directory's own classification, see the header); drawing both is a double claim. */
export function admits(u) {
  return u.kind === 'diocese' ? 'diocese: a level above the provinces' : true;
}

/* ── CLI ── */
const count = (a, f) => { const m = new Map(); for (const x of a) m.set(f(x), (m.get(f(x)) || 0) + 1); return [...m].sort((x, y) => y[1] - x[1]); };
const verts = (u) => u.coords.reduce((n, poly) => n + poly.reduce((a, r) => a + r.length, 0), 0);
const yr = (y) => (y < 0 ? -y + ' BC' : 'AD ' + y);

async function summary() {
  const { units, dropped, report } = await harvest();
  const { moment, dioceseNames, overlaps, vocab, cands, places } = report;
  const kept = units.filter((u) => admits(u) === true);
  const refused = units.filter((u) => admits(u) !== true);
  const L = [];
  L.push(`features: ${cands.length + dropped.filter((d) => !d.barringtonMap).length}   candidates with a map: ${cands.length}   units: ${units.length}   admitted: ${kept.length}`);
  L.push(`dropped: ${dropped.length} — ` + count(dropped, (d) => d.reason).map(([k, n]) => `${n}× ${k}`).join(' | '));
  L.push(`refused by admits(): ${refused.length} — ` + refused.map((u) => u.name).join(', '));
  L.push('moments (read from Pleiades descriptions):');
  for (const [m, x] of Object.entries(moment)) L.push(`  map ${m}: ${x.from}–${x.to} → start ${iso(x.from)} end ${iso(x.to + 1)} (exclusive) — «${x.quote}» (places ${x.places.join(', ')})`);
  L.push('admitted by map: ' + count(kept, (u) => 'map ' + u.barringtonMap).map(([k, n]) => `${k} ${n}`).join(', ') + '   kinds: ' + count(units, (u) => u.kind).map(([k, n]) => `${k} ${n}`).join(', '));
  L.push('diocese names given by the Directory notes of map-101 places: ' + dioceseNames.join(', '));
  const noted = new Set();
  for (const u of cands) {
    if (noted.has(u.pleiades)) continue; noted.add(u.pleiades);
    const pt = u.placeTypes.includes('diocese-roman');
    if ((u.kind === 'diocese') !== pt || (u.kind === 'diocese' && u.directoryNote !== 'diocese')) L.push(`  level note: ${u.name} (${u.pleiades}) — kind ${u.kind}; Directory note «${u.directoryNote || ''}», Pleiades placeTypes ${u.placeTypes.join(',')}`);
  }
  L.push('Pleiades period vocabulary used by these places (slug → years):');
  const used = [...new Set(cands.flatMap((u) => u.pleiadesPeriods))];
  for (const s of used) { const r = vocab.get(s); L.push(`  ${s}: ${r ? yr(r[0]) + ' – ' + yr(r[1]) : 'no range on the vocabulary page'}`); }
  const withP = [...new Set(cands.filter((u) => u.pleiadesPeriods.length).map((u) => u.pleiades))];
  L.push(`Pleiades period attestations (names + locations) — on ${withP.length} of ${places.size} places; NOT used for dates (see header):`);
  const seenP = new Set();
  for (const u of cands) {
    if (!u.pleiadesPeriods.length || seenP.has(u.pleiades)) continue; seenP.add(u.pleiades);
    const sp = u.pleiadesPeriodSpan, mo = moment[u.barringtonMap];
    const holds = sp && sp[0] <= mo.from && mo.to <= sp[1];
    L.push(`  ${u.name} [map ${u.barringtonMap}] ${u.pleiadesPeriods.join(',')} → ${sp ? yr(sp[0]) + '–' + yr(sp[1]) : '?'}${holds ? '' : '  ⚠ excludes the map\'s own moment'}`);
  }
  L.push(`overlaps at one moment (≥ ${OVERLAP_MIN} of the smaller's sampled ground; dioceses excluded): ${overlaps.length}`);
  for (const o of overlaps) L.push(`  map ${o.a.barringtonMap}: ${o.a.name} (${o.a.id}) × ${o.b.name} (${o.b.id}) ${(o.share * 100).toFixed(0)}% — ${o.resolution}`);
  L.push('dropped outlines:');
  for (const d of dropped) L.push(`  ${d.id} ${d.name}${d.barringtonMap ? ' [map ' + d.barringtonMap + ', ' + d.kind + ']' : ''} — ${d.reason}${d.also && d.also.length ? ' (also: ' + d.also.join('; ') + ')' : ''}`);
  L.push('admitted: ' + kept.map((u) => `${u.name}${u.names.la && u.names.la !== u.name ? ' (la ' + u.names.la + ')' : ''} [${u.barringtonMap}]`).join(', '));
  L.push(`total vertices (admitted): ${kept.reduce((n, u) => n + verts(u), 0)}`);
  L.push('samples:');
  const step = Math.max(1, Math.floor(kept.length / 8));
  for (let i = 0, k = 0; i < kept.length && k < 8; i += step, k++) {
    const u = kept[i];
    L.push(`  ${u.name} | la ${u.names.la || '-'} | ${u.start} – ${u.end} | ${u.startPrecision}/${u.endPrecision} derived | ${u.kind} | ${u.sovereign} | ${u.pleiades} | ${verts(u)} vertices`);
  }
  console.log(L.join('\n'));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  if (a.includes('--fetch')) console.log('cached:', await fetchRaw());
  if (a.includes('--summary')) await summary();
  if (!a.includes('--fetch') && !a.includes('--summary')) console.log('usage: magis.mjs --fetch | --summary');
}
