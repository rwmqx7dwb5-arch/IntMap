#!/usr/bin/env node
/* ============================================================================
 *  IntMap · BUILD THE PLANETARY SATELLITE TABLE — data/moons.json   (#R208)
 * ----------------------------------------------------------------------------
 *  「他の惑星にも衛星（各惑星選択時にその衛星たち）。⚠ #R197 の記録どおり、元期の平均経度なしで
 *    置くのは捏造。実元期の要素を入れること。」
 *
 *  #R197 wrote that note while refusing to place them, and it is the whole specification: a moon
 *  drawn at a plausible distance and a made-up angle is a decoration, and this app does not ship
 *  decorations as data. What makes it real is the MEAN ANOMALY AT A STATED EPOCH — the number that
 *  says where the moon actually was at a moment — because with it the orbit can be propagated to
 *  the map's own clock and the answer is checkable against an ephemeris.
 *
 *  ── SOURCES ─────────────────────────────────────────────────────────────────────────────────
 *  · JPL Solar System Dynamics, "Planetary Satellite Mean Orbital Parameters"
 *      https://ssd.jpl.nasa.gov/sats/elem/
 *    a, e, ω, M, i, node and the period. ⚠ THAT TABLE STATES THE EPOCH AND THE REFERENCE FRAME IN
 *    EVERY ROW, so neither has to be assumed: each satellite says whether its i and node are
 *    measured in the J2000 ecliptic or in that planet's local Laplace plane, and a Laplace row
 *    carries the pole of its own plane as R.A./Dec.
 *  · JPL SSD, "Planetary Satellite Physical Parameters"
 *      https://ssd.jpl.nasa.gov/sats/phys_par/
 *    the mean radius, so a moon is drawn at its own size rather than at a chosen one.
 *
 *  ⚠ THE LAPLACE PLANE IS NOT A DETAIL. These elements are NOT referred to the ecliptic: for a close
 *  giant-planet satellite the plane about which the orbit precesses is set by the planet's own
 *  oblateness, and it lies between the planet's equator and its orbit. Reading `i` and `node` as if
 *  they were ecliptic would tilt Io's orbit by Jupiter's 3° obliquity plus the plane's own offset —
 *  small on a picture and wrong as a claim. The pole is carried through to the client and the
 *  rotation is applied there.
 *
 *  ⚠ AND A SATELLITE IS KEPT ONLY WHEN ITS OWN ROW SAYS WHICH PLANE IT IS MEASURED IN. A row with
 *  no frame, or a Laplace row with no pole, is dropped rather than folded into the ecliptic on the
 *  grounds that the difference is small — that is precisely the kind of quiet assumption #R197
 *  refused to make about these objects.
 *
 *      node scripts/build-moons.mjs
 * ==========================================================================*/
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data', 'moons.json');
const CACHE = join(ROOT, 'node_modules', '.cache', 'intmap-moons');
const UA = 'IntMap/1.0 (https://github.com/rwmqx7dwb5-arch/IntMap) moon-table-build';
const ELEM = 'https://ssd.jpl.nasa.gov/sats/elem/';
const PHYS = 'https://ssd.jpl.nasa.gov/sats/phys_par/';

/* the planet a satellite code belongs to: 3xx Earth, 4xx Mars, 5xx Jupiter … (IAU/NAIF numbering) */
const PLANET_OF = { 3: 'earth', 4: 'mars', 5: 'jupiter', 6: 'saturn', 7: 'uranus', 8: 'neptune', 9: 'pluto' };

async function page(url, file) {
  if (!existsSync(CACHE)) mkdirSync(CACHE, { recursive: true });
  const p = join(CACHE, file);
  if (existsSync(p)) return readFileSync(p, 'utf8');
  process.stdout.write('downloading ' + url + ' … ');
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const t = await r.text();
  writeFileSync(p, t);
  console.log((t.length / 1000).toFixed(0) + ' kB');
  return t;
}

/** every <tr> as an array of cell texts */
function rows(html) {
  return [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) =>
    m[1].replace(/<[^>]*>/g, '\t').replace(/&nbsp;/g, ' ').replace(/&[a-z]+;/g, '')
      .split('\t').map((s) => s.trim()).filter(Boolean));
}

const num = (s) => { const v = parseFloat(String(s).replace(/,/g, '')); return Number.isFinite(v) ? v : null; };

async function main() {
  const elemHtml = await page(ELEM, 'elem.html');
  const physHtml = await page(PHYS, 'phys.html');

  /* ── the elements ──────────────────────────────────────────────────────────────────────────
     ⚠ THE INDEX TABLE STATES THE FRAME AND THE EPOCH PER ROW, which is better than the per-section
     tables and removes the need to assume either. Columns:
       0 #  1 planet  2 satellite  3 code  4 ephemeris  5 FRAME  6 EPOCH
       7 a(km)  8 e  9 ω(deg)  10 M(deg)  11 i(deg)  12 node(deg)  13 P(days)
       14 P_apsis(yr)  15 P_node(yr)  then, for a `Laplace` row only, 16 R.A. 17 Dec. 18 Tilt
     So a moon is kept when its own row says which plane its i and node are measured in — the
     ecliptic ones need no pole, the Laplace ones carry theirs. Nothing is inferred. */
  const moons = [];
  for (const r of rows(elemHtml)) {
    if (r.length < 17) continue;
    if (!/^\d+$/.test(r[3])) continue;
    const code = num(r[3]);
    const planet = PLANET_OF[Math.floor(code / 100)];
    if (!planet) continue;
    const frame = /laplace/i.test(r[5]) ? 'laplace' : (/ecliptic/i.test(r[5]) ? 'ecliptic' : null);
    if (!frame) continue;
    const a = num(r[7]), e = num(r[8]), w = num(r[9]), M = num(r[10]);
    const i = num(r[11]), node = num(r[12]), P = num(r[13]);
    if ([a, e, w, M, i, node, P].some((v) => v == null)) continue;
    const m = { name: r[2], code, planet, frame, epoch: r[6],
      aKm: a, e, wDeg: w, mDeg: M, iDeg: i, nodeDeg: node, periodDays: P };
    if (frame === 'laplace') {
      const ra = num(r[16]), dec = num(r[17]);
      if (ra == null || dec == null) continue;     /* a Laplace row with no pole cannot be placed */
      m.poleRaDeg = ra; m.poleDecDeg = dec;
    }
    moons.push(m);
  }

  /* ── the radii ────────────────────────────────────────────────────────────────────────────
     A separate table with its own shape:
       0 planet  1 satellite  2 code  3 GM  4 σGM  5 ref  6 MEAN RADIUS (km)  7 σR  8 ref  …
     ⚠ It covers only the satellites whose size has actually been MEASURED — 59 rows against the
     177 with elements — so most of the small outer ones legitimately have no radius here and the
     client draws them at a floor size rather than at an invented one. */
  const radius = new Map();
  for (const r of rows(physHtml)) {
    if (r.length < 7 || !/^\d+$/.test(r[2])) continue;
    const v = num(r[6]);
    if (v != null && v > 0) radius.set(r[1], v);
  }
  let withR = 0;
  for (const m of moons) { const rr = radius.get(m.name); if (rr) { m.radiusKm = rr; withR++; } }

  const byPlanet = {};
  for (const m of moons) (byPlanet[m.planet] = byPlanet[m.planet] || []).push(m);
  /* nearest first, which is the order a diagram wants and the order the tables already use */
  for (const k in byPlanet) byPlanet[k].sort((x, y) => x.aKm - y.aKm);

  const doc = {
    v: 1,
    built: new Date().toISOString().slice(0, 10),
    epoch: 'stated per satellite (JPL publishes 2000-01-01.5 TDB = J2000.0 for all of these)',
    frame: 'stated per satellite: "ecliptic" (J2000 ecliptic) or "laplace" (that planet\'s local '
      + 'Laplace plane, whose pole is given as poleRaDeg/poleDecDeg in equatorial J2000)',
    attribution: 'Planetary satellite mean orbital parameters and physical parameters: '
      + 'NASA/JPL Solar System Dynamics (ssd.jpl.nasa.gov/sats/elem/, /sats/phys_par/).',
    fields: ['name', 'code', 'planet', 'aKm', 'e', 'wDeg', 'mDeg', 'iDeg', 'nodeDeg', 'periodDays',
      'frame', 'epoch', 'poleRaDeg', 'poleDecDeg', 'radiusKm'],
    planets: byPlanet,
  };
  writeFileSync(OUT, JSON.stringify(doc));
  const n = moons.length;
  console.log('\nwrote data/moons.json — ' + n + ' satellites with a stated epoch and frame, '
    + withR + ' with a measured radius, ' + (readFileSync(OUT).length / 1024).toFixed(0) + ' kB');
  for (const k of Object.keys(byPlanet).sort()) {
    console.log('  ' + k.padEnd(9) + byPlanet[k].length + '  ' + byPlanet[k].slice(0, 6).map((m) => m.name).join(', ')
      + (byPlanet[k].length > 6 ? ' …' : ''));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
