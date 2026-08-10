#!/usr/bin/env node
/* ============================================================================
 *  IntMap · BUNDLE THE INTERPLANETARY SPACECRAFT TRAJECTORIES  (#R213)
 * ----------------------------------------------------------------------------
 *  「宇宙を探索では、Voyager 1 / 2、New Horizons、Parker Solar Probe、各種惑星探査機といった
 *    地球周回衛星以外の衛星の位置を見れるように。」
 *
 *  WHY THIS IS A BUILD STEP AND NOT A FETCH
 *  ----------------------------------------
 *  #R212 measured it: JPL Horizons answers without `Access-Control-Allow-Origin`, so a browser can
 *  never read it directly, and there is no second publisher of these trajectories — the Horizons
 *  kernels ARE the record (they are the reconstructed/predicted SPK the missions themselves file).
 *  A proxy would put a third party between the user and NASA for data that never changes once
 *  reconstructed. So it is fetched here, in Node, and shipped as a file — the same shape
 *  `data/tle/` already uses for Earth satellites.
 *
 *  WHAT IS STORED, AND WHY IT IS SO FEW SAMPLES
 *  -------------------------------------------
 *  Position AND velocity at every sample, heliocentric, J2000 ecliptic, in AU and AU/day. With both,
 *  the client interpolates with a CUBIC HERMITE, which matches value *and* slope at the two ends —
 *  so a 90-day sample of Voyager 1 (a body that is very nearly on a straight line at 3.6 AU/yr)
 *  reproduces the trajectory to far better than a pixel, and even Parker Solar Probe's perihelion
 *  whip is captured at a 3-day step. A position-only table would need 10-50× the samples for the
 *  same accuracy. This is why the whole fleet fits in a few hundred kilobytes.
 *
 *  ⚠ THE STEP IS PER SPACECRAFT AND IT IS NOT A STYLE CHOICE. It is set from how fast the body
 *  turns in a HELIOCENTRIC frame, which is not the same as how fast it moves: Juno orbits Jupiter
 *  every 33-53 days but in this frame it is Jupiter, so 10 days is plenty; JWST and Gaia orbit L2
 *  but in this frame they are the Earth. Parker and Solar Orbiter really do whip around the Sun,
 *  so they get 3 days and dominate the file.
 *
 *  ⚠ WHAT THIS IS NOT. These are trajectories, not telemetry. Pioneer 10/11 stopped answering in
 *  2003/1995 and Horizons still propagates where they are — that is a prediction from the last fix,
 *  and the client says so. The manifest carries `contact` for exactly this reason, and the UI must
 *  print it rather than implying every dot is a live spacecraft.
 *
 *  Output: data/spacecraft.json
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.join(process.cwd(), 'data', 'spacecraft.json');
const API = 'https://ssd.jpl.nasa.gov/api/horizons.api';

/* ── THE FLEET ────────────────────────────────────────────────────────────────────────────────────
   `id`      Horizons target (negative integers are spacecraft; the 100-block ones are the ones with
             more than one NAIF object, where the bare number is the whole vehicle).
   `stepD`   sample spacing in days — chosen from how fast the thing actually turns, not uniformly.
   `from/to` the span to ask for. Horizons refuses spans outside a kernel's coverage and says so in
             its error text; `fetchVectors` reads the interval back out of that message and retries.
   `contact` 'active' | 'lost' | 'ended' — see the ⚠ above.                                        */
const FLEET = [
  { key:'voyager1',  id:'-31',  en:'Voyager 1',           ja:'ボイジャー1号',        agency:'NASA', launched:'1977-09-05', stepD:90, from:'2000-01-01', to:'2045-01-01', contact:'active',
    en_note:'The most distant human-made object. Crossed the heliopause into interstellar space in August 2012.',
    ja_note:'人類がつくった最も遠い物体。2012年8月にヘリオポーズを越え星間空間に入った。' },
  { key:'voyager2',  id:'-32',  en:'Voyager 2',           ja:'ボイジャー2号',        agency:'NASA', launched:'1977-08-20', stepD:90, from:'2000-01-01', to:'2045-01-01', contact:'active',
    en_note:'The only spacecraft to have visited Uranus and Neptune. Reached interstellar space in November 2018.',
    ja_note:'天王星と海王星を訪れた唯一の探査機。2018年11月に星間空間へ到達。' },
  { key:'pioneer10', id:'-23',  en:'Pioneer 10',          ja:'パイオニア10号',       agency:'NASA', launched:'1972-03-03', stepD:120, from:'2000-01-01', to:'2045-01-01', contact:'lost',
    en_note:'First spacecraft through the asteroid belt and past Jupiter. Last signal received 23 January 2003 — the position shown is propagated, not tracked.',
    ja_note:'小惑星帯と木星を初めて通過した探査機。最後の信号は2003年1月23日。表示位置は追跡ではなく外挿。' },
  { key:'pioneer11', id:'-24',  en:'Pioneer 11',          ja:'パイオニア11号',       agency:'NASA', launched:'1973-04-06', stepD:120, from:'2000-01-01', to:'2045-01-01', contact:'lost',
    en_note:'First flyby of Saturn. Contact lost in November 1995 — the position shown is propagated, not tracked.',
    ja_note:'土星を初めて接近通過。1995年11月に交信途絶。表示位置は外挿。' },
  { key:'newhorizons', id:'-98', en:'New Horizons',       ja:'ニューホライズンズ',   agency:'NASA', launched:'2006-01-19', stepD:40, from:'2006-02-01', to:'2040-01-01', contact:'active',
    en_note:'Flew past Pluto on 14 July 2015 and the Kuiper-belt object Arrokoth on 1 January 2019.',
    ja_note:'2015年7月14日に冥王星、2019年1月1日にカイパーベルト天体アロコスを接近通過。' },
  { key:'parker',    id:'-96',  en:'Parker Solar Probe',  ja:'パーカー・ソーラー・プローブ', agency:'NASA', launched:'2018-08-12', stepD:3, from:'2018-08-13', to:'2030-01-01', contact:'active',
    en_note:'The closest any spacecraft has come to the Sun — 6.1 million km, inside the corona, at 690,000 km/h.',
    ja_note:'太陽に最も近づいた探査機。太陽表面から約610万km、コロナの内側を秒速190kmで通過した。' },
  { key:'solarorbiter', id:'-144', en:'Solar Orbiter',    ja:'ソーラー・オービター',  agency:'ESA/NASA', launched:'2020-02-10', stepD:3, from:'2020-02-11', to:'2030-01-01', contact:'active',
    en_note:'Leaves the ecliptic plane using Venus gravity assists to photograph the Sun’s poles.',
    ja_note:'金星スイングバイで黄道面を離れ、太陽の極を初めて撮影する軌道に入った。' },
  { key:'juno',      id:'-61',  en:'Juno',                ja:'ジュノー',             agency:'NASA', launched:'2011-08-05', stepD:10, from:'2011-08-06', to:'2030-01-01', contact:'active',
    en_note:'In a polar orbit around Jupiter since July 2016, measuring the planet’s interior and magnetic field.',
    ja_note:'2016年7月から木星の極軌道を回り、内部構造と磁場を測っている。' },
  { key:'juice',     id:'-28',  en:'JUICE',               ja:'JUICE（ジュース）',    agency:'ESA', launched:'2023-04-14', stepD:8, from:'2023-04-15', to:'2036-01-01', contact:'active',
    en_note:'Jupiter Icy Moons Explorer — arrives at Jupiter in July 2031 and enters orbit around Ganymede in 2034.',
    ja_note:'木星氷衛星探査機。2031年7月に木星へ到着し、2034年にガニメデ周回軌道へ入る予定。' },
  { key:'europaclipper', id:'-159', en:'Europa Clipper',  ja:'エウロパ・クリッパー',  agency:'NASA', launched:'2024-10-14', stepD:8, from:'2024-10-15', to:'2036-01-01', contact:'active',
    en_note:'Will make dozens of close passes of Europa from Jupiter orbit, arriving April 2030.',
    ja_note:'2030年4月に木星へ到着し、木星周回軌道からエウロパへ数十回の接近通過を行う。' },
  { key:'lucy',      id:'-49',  en:'Lucy',                ja:'ルーシー',             agency:'NASA', launched:'2021-10-16', stepD:8, from:'2021-10-17', to:'2035-01-01', contact:'active',
    en_note:'The first mission to the Jupiter Trojan asteroids — eight of them between 2027 and 2033.',
    ja_note:'木星トロヤ群小惑星を初めて訪れる探査機。2027〜2033年に8天体を訪問する。' },
  { key:'psyche',    id:'-255', en:'Psyche',              ja:'サイキ',               agency:'NASA', launched:'2023-10-13', stepD:8, from:'2023-10-14', to:'2032-01-01', contact:'active',
    en_note:'Bound for (16) Psyche, a metal-rich asteroid that may be an exposed planetary core. Arrives 2029.',
    ja_note:'金属質の小惑星（16）プシケへ向かう。2029年到着予定。' },
  { key:'bepicolombo', id:'-121', en:'BepiColombo',       ja:'ベピコロンボ',         agency:'ESA/JAXA', launched:'2018-10-20', stepD:5, from:'2018-10-21', to:'2032-01-01', contact:'active',
    en_note:'Two orbiters flying to Mercury together; orbit insertion in late 2026.',
    ja_note:'2機の周回機が編隊で水星へ向かう。2026年末に水星周回軌道へ投入予定。' },
  { key:'hayabusa2', id:'-37',  en:'Hayabusa2',           ja:'はやぶさ2',            agency:'JAXA', launched:'2014-12-03', stepD:8, from:'2014-12-04', to:'2032-01-01', contact:'active',
    en_note:'Returned samples of asteroid Ryugu in 2020 and flew on; it reaches asteroid 1998 KY26 in 2031.',
    ja_note:'2020年に小惑星リュウグウの試料を持ち帰り、そのまま拡張ミッションへ。2031年に小惑星1998 KY26へ到達予定。' },
  { key:'osirisapex', id:'-64', en:'OSIRIS-APEX',         ja:'オシリス・アペックス',  agency:'NASA', launched:'2016-09-08', stepD:8, from:'2016-09-09', to:'2032-01-01', contact:'active',
    en_note:'Formerly OSIRIS-REx: delivered Bennu’s samples to Earth in September 2023 and is now chasing Apophis for 2029.',
    ja_note:'旧OSIRIS-REx。2023年9月にベンヌの試料を地球へ届け、2029年のアポフィス接近へ向かっている。' },
  { key:'jwst',      id:'-170', en:'James Webb Space Telescope', ja:'ジェイムズ・ウェッブ宇宙望遠鏡', agency:'NASA/ESA/CSA', launched:'2021-12-25', stepD:8, from:'2022-01-25', to:'2032-01-01', contact:'active',
    en_note:'Orbits the Sun–Earth L2 point, 1.5 million km outward from Earth, always in Earth’s shadow side.',
    ja_note:'地球から外側へ約150万km、太陽–地球のL2点を回る。常に地球の夜側にあたる方向にいる。' },
  { key:'gaia',      id:'-139479', en:'Gaia',             ja:'ガイア',               agency:'ESA', launched:'2013-12-19', stepD:8, from:'2014-01-08', to:'2026-06-30', contact:'ended',
    en_note:'Measured the positions and distances of nearly two billion stars from L2. Science ended in January 2025; passivated in March 2025.',
    ja_note:'L2から約20億個の恒星の位置と距離を測った。2025年1月に観測終了、同年3月に停波。' },
];

const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));

function q(v){ return encodeURIComponent("'"+v+"'"); }

async function horizons(params){
  const url = API+'?format=json&'+Object.entries(params).map(([k,v])=>k+'='+v).join('&');
  for(let attempt=0; attempt<4; attempt++){
    try{
      const r = await fetch(url, { headers:{ 'accept':'application/json' } });
      const j = await r.json();
      if(j && typeof j.result === 'string') return j.result;
      if(j && j.error) return 'ERROR: '+j.error;
    }catch(e){ /* transient — Horizons rate-limits bursts */ }
    await sleep(1500*(attempt+1));
  }
  return null;
}

/* Horizons refuses a span its kernel does not cover and NAMES the span it does cover, e.g.
   "No ephemeris for target "…" after A.D. 2033-Jan-05 00:00:00.0000 TDB". Read it back and retry
   inside the covered interval rather than guessing a span per spacecraft. */
function coverageFrom(text){
  const out = {};
  let m = /No ephemeris for target[^]*?after\s+A\.?D\.?\s+(\d{4})-([A-Za-z]{3})-(\d{2})/i.exec(text||'');
  if(m) out.to = isoOf(m[1],m[2],m[3]);
  m = /No ephemeris for target[^]*?prior to\s+A\.?D\.?\s+(\d{4})-([A-Za-z]{3})-(\d{2})/i.exec(text||'');
  if(m) out.from = isoOf(m[1],m[2],m[3]);
  return out;
}
const MON = { Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12' };
function isoOf(y,mon,d){ return `${y}-${MON[mon]||'01'}-${d}`; }
function shift(iso, days){ const t = Date.parse(iso+'T00:00:00Z') + days*86400000; return new Date(t).toISOString().slice(0,10); }

function parseVectors(text){
  const a = text.indexOf('$$SOE'), b = text.indexOf('$$EOE');
  if(a < 0 || b < 0) return null;
  const rows = text.slice(a+5, b).trim().split('\n');
  const out = [];
  for(const line of rows){
    const f = line.split(',').map(s=>s.trim());
    if(f.length < 8) continue;
    const jd = Number(f[0]);
    const v = [2,3,4,5,6,7].map(i=>Number(f[i]));
    if(!isFinite(jd) || v.some(x=>!isFinite(x))) continue;
    out.push([jd, ...v]);
  }
  return out.length ? out : null;
}

async function fetchVectors(sc){
  let from = sc.from, to = sc.to;
  for(let attempt=0; attempt<3; attempt++){
    const text = await horizons({
      COMMAND:q(sc.id), OBJ_DATA:q('NO'), MAKE_EPHEM:q('YES'), EPHEM_TYPE:q('VECTORS'),
      CENTER:q('500@10'),                 /* the Sun's centre — heliocentric, so the scene's own origin */
      REF_PLANE:q('ECLIPTIC'), REF_SYSTEM:q('ICRF'),
      START_TIME:q(from), STOP_TIME:q(to), STEP_SIZE:q(sc.stepD+'d'),
      VEC_TABLE:q('2'), OUT_UNITS:q('AU-D'), VEC_LABELS:q('NO'), CSV_FORMAT:q('YES'),
    });
    if(!text){ console.warn(`  ${sc.key}: no answer`); return null; }
    const rows = parseVectors(text);
    if(rows) return { rows, from, to };
    const cov = coverageFrom(text);
    if(cov.to || cov.from){
      if(cov.to) to = shift(cov.to, -1);
      if(cov.from) from = shift(cov.from, +1);
      console.log(`  ${sc.key}: kernel covers ${from} … ${to} — retrying inside it`);
      continue;
    }
    console.warn(`  ${sc.key}: ${String(text).slice(0,220).replace(/\s+/g,' ')}`);
    return null;
  }
  return null;
}

const rd = (x,n)=>{ const p = Math.pow(10,n); return Math.round(x*p)/p; };

const main = async () => {
  const out = {
    v: 1,
    built: new Date().toISOString().slice(0,10),
    source: 'NASA/JPL Horizons (ssd.jpl.nasa.gov/horizons) — reconstructed and predicted SPK trajectories, heliocentric, J2000 ecliptic, ICRF.',
    attribution: 'Spacecraft trajectories: NASA/JPL-Caltech Horizons system. U.S. Government work — not subject to copyright.',
    frame: 'heliocentric J2000 ecliptic (Horizons REF_PLANE=ECLIPTIC, CENTER=500@10)',
    units: { pos:'AU', vel:'AU/day', time:'Julian Date (TDB)' },
    method: 'Sampled at a per-spacecraft step and interpolated on the client with a cubic Hermite through position and velocity, so the reconstructed path is reproduced between samples rather than chorded.',
    warn: 'A trajectory is not telemetry. Entries marked contact:"lost" or "ended" are propagated from the last tracked state; the spacecraft is no longer being followed.',
    fields: ['jd','x','y','z','vx','vy','vz'],
    craft: [],
  };
  for(const sc of FLEET){
    process.stdout.write(`Horizons ${sc.key} (${sc.id}) … `);
    const got = await fetchVectors(sc);
    if(!got){ console.log('SKIPPED'); continue; }
    const samples = got.rows.map(r=>[ rd(r[0],5), rd(r[1],7), rd(r[2],7), rd(r[3],7), rd(r[4],9), rd(r[5],9), rd(r[6],9) ]);
    out.craft.push({
      key:sc.key, en:sc.en, ja:sc.ja, agency:sc.agency, launched:sc.launched, contact:sc.contact,
      en_note:sc.en_note, ja_note:sc.ja_note,
      spanFrom:got.from, spanTo:got.to, stepD:sc.stepD, n:samples.length, s:samples,
    });
    console.log(`${samples.length} samples`);
    await sleep(700);   /* Horizons asks for a civil request rate; this is one query per ~0.7 s */
  }
  fs.writeFileSync(OUT, JSON.stringify(out));
  const kb = (fs.statSync(OUT).size/1024).toFixed(0);
  console.log(`\n→ ${OUT}  (${out.craft.length} spacecraft, ${kb} KB)`);
  if(!out.craft.length) process.exit(1);
};

main().catch(e=>{ console.error(e); process.exit(1); });
