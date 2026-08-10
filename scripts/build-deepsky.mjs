#!/usr/bin/env node
/* ============================================================================
 *  IntMap · BUNDLE THE DEEP-SKY OBJECTS WITH MEASURED DISTANCES  (#R213)
 * ----------------------------------------------------------------------------
 *  「太陽系外のはるか遠くまでズームアウトできるように。（太陽系のさらに外の宇宙も見れるように）」
 *
 *  #R208 lifted the camera's ceiling to 10 million AU (48 pc) and #R212 recorded why it stopped
 *  there: past the star catalogue's reach THERE WAS NOTHING LEFT TO DRAW, and an empty view that
 *  keeps zooming is a lie about the universe rather than a picture of it. So going further is not a
 *  clamp change — it needs objects that have a MEASURED distance, because the whole point of pulling
 *  back is to see real structure at its real depth.
 *
 *  SOURCE — SIMBAD (Centre de Données astronomiques de Strasbourg). Two tables:
 *    · `basic`        — position, object type, angular size. One row per object, the curated identity.
 *    · `mesDistance`  — every PUBLISHED distance measurement, each with its unit, method and bibcode.
 *
 *  ⚠ THE DISTANCE IS THE HARD PART, AND IT IS NOT ONE NUMBER. A galaxy has many published distances
 *  that disagree — different methods (Cepheids, tip of the red-giant branch, Tully-Fisher, surface
 *  brightness fluctuation, redshift) with different systematics. This script keeps the MEDIAN of the
 *  published measurements and also records how many there were and how far apart the quartiles sit,
 *  so the client can say "780 kpc (median of 61 published measurements)" rather than inventing a
 *  precision nobody has. Objects with no published distance are kept with dist:null — they are still
 *  real objects on the sky, and the renderer places them on the celestial sphere instead of in depth.
 *
 *  ⚠ WHAT IS *NOT* HERE. No object is invented and no distance is interpolated. If SIMBAD has no
 *  row, there is no entry. That is why the count in the manifest is worth printing.
 *
 *  Output: data/deep-sky.json
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.join(process.cwd(), 'data', 'deep-sky.json');
const TAP = 'https://simbad.u-strasbg.fr/simbad/sim-tap/sync';

const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));

async function adql(query){
  for(let a=0;a<4;a++){
    try{
      const body = new URLSearchParams({ REQUEST:'doQuery', LANG:'ADQL', FORMAT:'json', QUERY:query });
      const r = await fetch(TAP, { method:'POST', body, headers:{ 'content-type':'application/x-www-form-urlencoded' } });
      const t = await r.text();
      if(t.trim().startsWith('{')){ const j = JSON.parse(t); if(j.data) return j; }
      console.warn('  SIMBAD:', t.slice(0,200).replace(/\s+/g,' '));
    }catch(e){ /* transient */ }
    await sleep(2000*(a+1));
  }
  return null;
}

/* Beyond Messier: the Local Group, the nearest big galaxies, the naked-eye southern sky, and the
   markers that give the view its scale — the centre of our own Galaxy and the two nearest clusters
   of galaxies. Every one of these is looked up in SIMBAD by identifier; none is written by hand. */
const EXTRA = [
  'LMC','SMC','NGC 5128','NGC 253','NGC 4945','NGC 55','NGC 300','NGC 6822','IC 10','IC 1613',
  'IC 342','NGC 2403','NGC 4736','NGC 5236','NGC 3115','NGC 1316','NGC 4258','NGC 891','NGC 2903',
  'NGC 7331','NGC 6946','NGC 4565','NGC 5907','NGC 1275','NGC 1365','NGC 1068','NGC 3628',
  'NGC 104','NGC 5139','NGC 6397','NGC 2070','NGC 7293','NGC 6543','NGC 7000','NGC 2237',
  'Sgr A*','NAME Virgo Cluster','NAME Coma Cluster','NAME Fornax Cluster','NAME Sculptor Group',
  'NAME Sagittarius Dwarf Spheroidal','NAME Canis Major Dwarf','NAME Draco Dwarf','NAME Fornax Dwarf Spheroidal',
  'NAME Barnard s Star','NAME Proxima Centauri','* alf Cen','NAME Sirius',
];

/* SIMBAD's `otype_txt` is a controlled vocabulary. Group it into the handful of things a viewer
   actually distinguishes at a glance, so the renderer can colour and size by class. */
function classify(ot, mid){
  const t = String(ot||'').trim();
  if(/^Sgr A\*/.test(mid||'')) return 'gcentre';
  /* ⚠ ORDER MATTERS AND IT IS NOT ALPHABETICAL. SIMBAD's codes are prefix-shaped: `GlC` (globular
     cluster) and `GiC` (galaxy in a cluster) both start with G, so a galaxy test anchored at ^G
     swallows every globular — which is exactly what the first run of this script did to M13. The
     specific codes are matched BEFORE the family ones. */
  if(/^(GlC|GlCl|Glob)/i.test(t)) return 'globular';
  if(/^(OpC|Cl\*|As\*|OpCl)/i.test(t)) return 'open';
  if(/^(PN|pNeb)/i.test(t)) return 'planetary';
  if(/^SNR/i.test(t)) return 'snr';
  if(/^(HII|RNe|ISM|Cld|DNe|GNe|Neb|MoC|SFR|EmO|bub)/i.test(t)) return 'nebula';
  if(/ClG|GrG|CGG|SCG/i.test(t)) return 'cluster-of-galaxies';
  if(/^(G|LSB|AG\?|SBG|H2G|EmG|RG|BiC|IG|PaG|GiC|GiG|GiP|AGN|Sy1|Sy2|SyG|QSO|BLL|LIN|StarburstG)/i.test(t)) return 'galaxy';
  if(/^\*|Star|PM\*|V\*/i.test(t)) return 'star';
  return 'other';
}

const PC_PER = { pc:1, kpc:1000, Mpc:1e6, Gpc:1e9 };
function medianPc(rows){
  const v = [];
  for(const r of rows){ const d = Number(r.dist), u = PC_PER[String(r.unit||'').trim()];
    if(isFinite(d) && d > 0 && u) v.push(d*u); }
  if(!v.length) return null;
  v.sort((a,b)=>a-b);
  const at = (p)=>v[Math.min(v.length-1, Math.max(0, Math.floor(p*(v.length-1))))];
  return { pc: at(0.5), n: v.length, q1: at(0.25), q3: at(0.75) };
}

const sig = (x,n)=> x===null||x===undefined ? null : Number(Number(x).toPrecision(n));

const main = async () => {
  /* 1 — every object SIMBAD indexes under a Messier number, with its position, type and size. */
  process.stdout.write('SIMBAD: Messier … ');
  const mess = await adql(`SELECT id.id AS ident, b.main_id, b.ra, b.dec, b.otype_txt, b.galdim_majaxis
     FROM ident AS id JOIN basic AS b ON b.oid = id.oidref
     WHERE id.id LIKE 'M %'`);
  if(!mess){ console.error('failed'); process.exit(1); }
  console.log(mess.data.length + ' rows');
  await sleep(600);

  /* 2 — the named objects above. `IN` over the ident table so an alias resolves the same way the
        SIMBAD search box would resolve it. */
  process.stdout.write('SIMBAD: named objects … ');
  const inList = EXTRA.map(s=>`'${s.replace(/'/g,"''")}'`).join(',');
  const extra = await adql(`SELECT id.id AS ident, b.main_id, b.ra, b.dec, b.otype_txt, b.galdim_majaxis
     FROM ident AS id JOIN basic AS b ON b.oid = id.oidref
     WHERE id.id IN (${inList})`);
  console.log((extra ? extra.data.length : 0) + ' rows');
  await sleep(600);

  const rows = [];
  const seen = new Map();
  const take = (src, label)=>{ if(!src) return;
    for(const r of src.data){
      const [ident, main_id, ra, dec, otype, maj] = r;
      if(ra===null || dec===null) continue;
      const key = String(main_id);
      const prev = seen.get(key);
      if(prev){ if(!prev.alias.includes(ident)) prev.alias.push(ident); continue; }
      const o = { main:key, alias:[ident], ra:sig(ra,8), dec:sig(dec,8), otype:String(otype||''),
                  cls:classify(otype, key), maj: maj===null?null:sig(maj,4), from:label };
      seen.set(key, o); rows.push(o);
    } };
  take(mess, 'messier'); take(extra, 'named');

  /* 3 — the published distance measurements, one query for each set. */
  const wantDist = async (where, label)=>{
    process.stdout.write(`SIMBAD: distances (${label}) … `);
    const j = await adql(`SELECT b.main_id, d.dist, d.unit
       FROM basic AS b JOIN mesDistance AS d ON d.oidref = b.oid
       WHERE ${where}`);
    console.log((j?j.data.length:0) + ' measurements');
    await sleep(600);
    return j;
  };
  const dMess = await wantDist(`b.oid IN (SELECT oidref FROM ident WHERE id LIKE 'M %')`, 'Messier');
  const dExtra = await wantDist(`b.oid IN (SELECT oidref FROM ident WHERE id IN (${inList}))`, 'named');

  const byMain = new Map();
  for(const j of [dMess, dExtra]){ if(!j) continue;
    for(const [main_id, dist, unit] of j.data){
      const k = String(main_id); if(!byMain.has(k)) byMain.set(k, []);
      byMain.get(k).push({ dist, unit });
    } }

  let withDist = 0;
  for(const o of rows){
    const m = medianPc(byMain.get(o.main) || []);
    if(m){ o.pc = sig(m.pc, 6); o.dn = m.n; o.q1 = sig(m.q1, 5); o.q3 = sig(m.q3, 5); withDist++; }
    else { o.pc = null; }
  }

  /* Messier numbers sort numerically so the UI can list M1…M110 in order. */
  const mnum = (o)=>{ const a = o.alias.find(s=>/^M\s+\d+$/.test(s)); return a ? Number(a.slice(1)) : 1e9; };
  rows.sort((a,b)=>mnum(a)-mnum(b) || String(a.main).localeCompare(String(b.main)));

  const out = {
    v: 1,
    built: new Date().toISOString().slice(0,10),
    source: 'SIMBAD astronomical database, Centre de Données astronomiques de Strasbourg (simbad.u-strasbg.fr). Positions and object types from `basic`; distances from the published measurements in `mesDistance`.',
    attribution: 'Deep-sky objects: SIMBAD, CDS, Strasbourg, France (Wenger et al. 2000, A&AS 143, 9). Please cite SIMBAD when this data is reused.',
    frame: 'ICRS J2000 right ascension and declination in degrees; distance in parsecs',
    method: 'Distance is the MEDIAN of every distance measurement SIMBAD carries for the object, converted to parsecs. `dn` is how many measurements that median is over and `q1`/`q3` are the quartiles — the spread between them is the real disagreement between published methods, not an error bar.',
    warn: 'A published distance is a measurement with a method behind it. Different methods disagree, sometimes by tens of per cent; the quartiles say by how much. Objects with pc:null have no published distance in SIMBAD and are placed on the celestial sphere without depth.',
    fields: ['main','alias','ra','dec','otype','cls','maj','pc','dn','q1','q3'],
    count: rows.length, withDistance: withDist,
    objects: rows,
  };
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log(`\n→ ${OUT}  (${rows.length} objects, ${withDist} with a published distance, ${(fs.statSync(OUT).size/1024).toFixed(0)} KB)`);
  if(rows.length < 80) process.exit(1);
};

main().catch(e=>{ console.error(e); process.exit(1); });
