#!/usr/bin/env node
/* ============================================================================
 *  IntMap · BUNDLE THE ASTEROID AND COMET ORBITS  (#R213)
 * ----------------------------------------------------------------------------
 *  「宇宙を探索に小惑星、彗星も追加して。」
 *
 *  WHY A BUILD STEP — #R212 measured that JPL's SBDB answers without CORS headers, so the browser
 *  cannot ask it. Unlike a live feed, though, nothing is lost by bundling: these are OSCULATING
 *  ORBITAL ELEMENTS, and an element set is a description of a whole orbit rather than a position at
 *  an instant. The client propagates it with the Kepler solver js/ephemeris.js already owns, so a
 *  file built today answers for any date the user scrubs to.
 *
 *  ⚠ WHAT AN ELEMENT SET IS AND IS NOT. Osculating elements are the ellipse (or hyperbola) that
 *  matches the body's state at ONE epoch. Two-body propagation from that epoch drifts as the planets
 *  perturb the real orbit — a few arcseconds a year for a main-belt asteroid, far more for a comet
 *  that passes close to Jupiter, and non-gravitational jetting makes an active comet worse still.
 *  This is fine for "where is Halley's Comet in 2061" at the scale of a solar-system view and is
 *  NOT fine for pointing a telescope. The manifest says so and the UI prints it.
 *
 *  WHERE THE MEAN ANOMALY COMES FROM — for a closed orbit the script prefers TIME OF PERIHELION
 *  (`tp`) with the period, because that pair is exactly what a comet's element set is quoted around
 *  and it stays meaningful when `ma`/`epoch` disagree. `ma` at `epoch` is the fallback. For e ≥ 1
 *  (the interstellar objects and the near-parabolic comets) there is no period and no mean anomaly:
 *  only `q` and `tp` are meaningful, and the client uses the hyperbolic/parabolic branch.
 *
 *  Output: data/small-bodies.json
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.join(process.cwd(), 'data', 'small-bodies.json');
const QUERY = 'https://ssd-api.jpl.nasa.gov/sbdb_query.api';
const FIELDS = 'full_name,pdes,name,class,e,a,q,i,om,w,ma,tp,epoch,per,H,diameter,albedo,spkid';
const F = FIELDS.split(',');

const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));

async function getJSON(url){
  for(let a=0;a<4;a++){
    try{ const r = await fetch(url,{headers:{accept:'application/json'}}); const j = await r.json(); if(j && !j.error) return j; if(j&&j.error) console.warn('  SBDB:', j.error); }
    catch(e){ /* transient */ }
    await sleep(1200*(a+1));
  }
  return null;
}

async function query(params){
  const u = new URL(QUERY);
  u.searchParams.set('fields', FIELDS);
  for(const [k,v] of Object.entries(params)) u.searchParams.set(k, v);
  const j = await getJSON(u.toString());
  if(!j || !Array.isArray(j.data)) return [];
  return j.data.map(row=>{ const o={}; F.forEach((f,i)=>{ o[f]=row[i]; }); return o; });
}

/* The single-object LOOKUP api, reshaped into the same row the query api returns so both feed one
   `pack()`. `full-prec` matters: without it SBDB rounds to three significant figures and e comes
   back as "1.2" for an object whose eccentricity is 1.19951. */
const LOOKUP = 'https://ssd-api.jpl.nasa.gov/sbdb.api';
async function lookup(sstr){
  const u = new URL(LOOKUP);
  u.searchParams.set('sstr', sstr);
  u.searchParams.set('full-prec', 'true');
  u.searchParams.set('phys-par', 'true');
  const j = await getJSON(u.toString());
  if(!j || !j.orbit || !Array.isArray(j.orbit.elements) || !j.object) return null;
  const el = {}; for(const e of j.orbit.elements) el[e.name] = e.value;
  const ph = {}; for(const p of (j.phys_par||[])) ph[p.name] = p.value;
  return {
    full_name: j.object.fullname || sstr,
    pdes: j.object.des || sstr,
    name: j.object.shortname || null,
    class: (j.object.orbit_class && j.object.orbit_class.code) || '',
    e: el.e, a: el.a, q: el.q, i: el.i, om: el.om, w: el.w, ma: el.ma, tp: el.tp,
    epoch: j.orbit.epoch, per: el.per,
    H: ph.H ?? null, diameter: ph.diameter ?? null, albedo: ph.albedo ?? null,
    spkid: j.object.spkid,
  };
}

/* ── WHAT GOES IN ─────────────────────────────────────────────────────────────────────────────────
   Three bulk sweeps that are defined by a MEASURED property (size, brightness, numbering) rather
   than by taste, plus one explicitly editorial list: the bodies a spacecraft has visited or that a
   person is likely to have heard of. The editorial list is marked as such in the output. */
const CURATED = [
  /* visited by a spacecraft, or named in the culture */
  '1','2','3','4','10','16','21','243','253','433','951','2867','4179','25143','101955','162173',
  '65803','99942','3200','1566','2060','10199','617','3548','11351','15094','21900','52246','152830',
  '486958','1998 KY26','5535','9969','132524','2685','4','704','511','87','65','52',
  /* the outer system */
  '136199','136472','136108','90377','50000','225088','90482','20000','28978','307261','15760',
  /* comets, periodic and famous */
  '1P','2P','9P','12P','19P','21P','26P','29P','46P','55P','67P','73P','81P','103P','109P','153P',
  'C/1995 O1','C/2020 F3','C/2023 A3','C/2006 P1','C/2012 S1','C/1996 B2',
  /* interstellar */
  '1I','2I','3I',
];

/* SBDB's `class` is the orbit class code. The comet codes are the ones that end in a lower-case
   `c` (CTc/ETc/JFc/…) plus the explicit COM/HTC/PAR/HYP families; everything else is an asteroid
   unless its orbit class says otherwise. `e ≥ 1` overrides all of it — an unbound orbit is drawn
   and labelled as one whatever catalogue it came from. */
const COMET_CLS = new Set(['COM','CTc','ETc','HTC','JFc','JFC','PAR','HYP','CHY','ITc','ETc']);
const KIND = (cls, e) => {
  if(e >= 1) return 'hyperbolic';
  if(COMET_CLS.has(cls) || /c$/.test(cls)) return 'comet';
  if(cls === 'TNO') return 'tno';
  if(cls === 'TJN') return 'trojan';
  if(cls === 'CEN') return 'centaur';
  return 'asteroid';
};

const num = (x)=> (x===null||x===undefined||x==='') ? null : (isFinite(Number(x)) ? Number(x) : null);
const rd = (x,n)=> x===null ? null : Math.round(x*Math.pow(10,n))/Math.pow(10,n);

function pack(o, curated){
  const e = num(o.e); if(e===null) return null;
  const a = num(o.a), q = num(o.q), per = num(o.per), tp = num(o.tp), ep = num(o.epoch);
  /* a closed orbit needs (a,e) and a time reference; an open one needs (q,e,tp) */
  if(e < 1 && (a===null || (tp===null && (num(o.ma)===null||ep===null)))) return null;
  if(e >= 1 && (q===null || tp===null)) return null;
  const nm = (o.name && String(o.name).trim()) || null;
  const full = String(o.full_name||'').trim().replace(/\s+/g,' ');
  return {
    id: String(o.pdes||o.spkid||full),
    full, name: nm, cls: o.class || '',
    kind: KIND(o.class||'', e),
    e: rd(e,7), a: rd(a,7), q: rd(q,7),
    i: rd(num(o.i),5), om: rd(num(o.om),5), w: rd(num(o.w),5),
    ma: rd(num(o.ma),5), ep: rd(ep,5), tp: rd(tp,5), per: rd(per,4),
    H: rd(num(o.H),2), d: rd(num(o.diameter),3), alb: rd(num(o.albedo),4),
    ...(curated ? { pick:1 } : {}),
  };
}

const main = async () => {
  const byId = new Map();
  const add = (rows, curated)=>{ let n=0; for(const r of rows){ const p = pack(r, curated); if(!p) continue;
    const prev = byId.get(p.id); if(prev && !curated) continue;
    if(prev && curated) { prev.pick = 1; continue; }
    byId.set(p.id, p); n++; } return n; };

  /* 1 — every asteroid at least 150 km across. A size cut, not a popularity cut. */
  process.stdout.write('SBDB: asteroids ≥150 km … ');
  console.log(add(await query({ 'sb-kind':'a', 'sb-cdata':'{"AND":["diameter|GE|150"]}', limit:'400' })));
  await sleep(800);

  /* 2 — the intrinsically brightest trans-Neptunian objects (H < 5.5 ≈ the dwarf-planet class). */
  process.stdout.write('SBDB: bright TNOs … ');
  console.log(add(await query({ 'sb-class':'TNO', 'sb-cdata':'{"AND":["H|LT|5.5"]}', limit:'400' })));
  await sleep(800);

  /* 3 — every NUMBERED comet. Numbering means the return has been observed, so this is the set of
        comets that are known to come back rather than the set that has ever been seen once. */
  process.stdout.write('SBDB: numbered comets … ');
  console.log(add(await query({ 'sb-kind':'c', 'sb-ns':'n', limit:'900' })));
  await sleep(800);

  /* 4 — potentially hazardous asteroids brighter than H 18 (≈ 1 km and up). These are the ones on
        every impact-monitoring list, so a user looking for "the dangerous ones" finds them. */
  process.stdout.write('SBDB: PHAs H<18 … ');
  console.log(add(await query({ 'sb-kind':'a', 'sb-group':'pha', 'sb-cdata':'{"AND":["H|LT|18"]}', limit:'400' })));
  await sleep(800);

  /* 5 — the editorial list, last so it can mark entries the sweeps already found.
        ⚠ The query API has NO designation parameter — `sb-des` is silently ignored and every row
        comes back, which is how the first run of this script reported "0 new" while quietly
        matching nothing. The primary designation is a constraint like any other field, so it goes
        through `sb-cdata`. And no `sb-kind`: 1I/'Oumuamua is filed as a hyperbolic ASTEROID, so
        asking for comets would have dropped exactly the objects this list exists to guarantee. */
  process.stdout.write('SBDB: curated … ');
  let got = 0, missed = [];
  for(const des of CURATED){
    let rows = await query({ 'sb-cdata':JSON.stringify({AND:[`pdes|EQ|${des}`]}), limit:'2' });
    /* ⚠ The QUERY api indexes an unnumbered comet under its bare provisional designation
       ("1995 O1"), not the form everyone writes ("C/1995 O1"), and the interstellar objects are
       filed with a `prefix` that pdes does not carry at all. The LOOKUP api resolves the same
       strings the SBDB search box does, so it is the fallback rather than a second guess at the
       key. Without it, exactly the famous objects this list exists for are the ones that go
       missing — which is what the first two runs of this script did. */
    if(!rows.length){ const one = await lookup(des); if(one) rows = [one]; }
    if(!rows.length) missed.push(des);
    got += add(rows, true);
    await sleep(260);
  }
  console.log(`${got} new, ${CURATED.length-missed.length}/${CURATED.length} resolved`);
  if(missed.length) console.log('  not in SBDB under that designation: ' + missed.join(', '));

  const bodies = [...byId.values()].sort((x,y)=>(x.kind===y.kind ? (y.pick||0)-(x.pick||0) : x.kind.localeCompare(y.kind)));
  const out = {
    v: 1,
    built: new Date().toISOString().slice(0,10),
    source: 'NASA/JPL Small-Body Database (ssd.jpl.nasa.gov/tools/sbdb_query.html), osculating heliocentric elements at the stated epoch.',
    attribution: 'Asteroid and comet orbits: NASA/JPL-Caltech Small-Body Database. U.S. Government work — not subject to copyright.',
    frame: 'heliocentric J2000 ecliptic; angles in degrees, a and q in AU, epoch and tp in Julian Date (TDB)',
    method: 'Two-body propagation from the osculating elements. For e<1 the mean anomaly is taken from the time of perihelion where SBDB gives one, otherwise from ma at epoch; for e≥1 the orbit is propagated from q and tp on the hyperbolic branch.',
    warn: 'Osculating elements describe the orbit at one epoch. Planetary perturbations (and, for an active comet, non-gravitational jetting) move the real body away from this ellipse over years — good enough to see where a body is in the solar system, not good enough to point a telescope.',
    selection: 'Bulk sets are defined by measurement: asteroids ≥150 km across, TNOs brighter than H 5.5, every numbered (i.e. confirmed-returning) comet, and PHAs brighter than H 18. Entries with pick:1 are additionally on an editorial list of spacecraft targets and culturally famous bodies.',
    count: bodies.length,
    bodies,
  };
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log(`\n→ ${OUT}  (${bodies.length} bodies, ${(fs.statSync(OUT).size/1024).toFixed(0)} KB)`);
  if(bodies.length < 100) process.exit(1);
};

main().catch(e=>{ console.error(e); process.exit(1); });
