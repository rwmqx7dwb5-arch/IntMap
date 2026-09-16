/* ============================================================================
 *  IntMap · the pandemic world  (#R754)
 * ----------------------------------------------------------------------------
 *  WHAT «THE WORLD» IS, stated once, for every reader of it.
 *
 *  js/pandemic-model.js is the arithmetic and it is already pure and testable (#R575). What was
 *  NOT anywhere but inside one DOM closure was the answer to «which countries, with what
 *  populations, connected how» — js/playground.js built it from Natural Earth plus four tables
 *  inside `_pgPandemic`'s `ensureCountries` callback, and nothing that was not that panel could
 *  reach it. So the engine was drivable from node and the WORLD was drivable from nowhere, which
 *  is why Atlas could open the simulator and could not run one (#R747 §6).
 *
 *  ⚠ ONE WORLD, NOT TWO. The panel and the Atlas capability MUST get the same rows: if each built
 *  its own, the numbers Atlas reports and the epidemic the reader watches would be two different
 *  simulations wearing one name, and every seam this project has paid for
 *  ([[intmap-contract-is-not-implementation]], [[intmap-two-readers-one-field-list]]) is that shape.
 *  `buildPandemicWorld()` therefore caches its promise and hands both callers the same object.
 *
 *  ⚠ THE SNAPSHOT RULE IS #R673'S AND IT IS LOAD-BEARING. `createPandemicModel` freezes the
 *  mobility matrix at construction, so the world must be DECIDED — every table settled, resolved
 *  or failed — before anybody is allowed to start a run. A table that landed afterwards would be a
 *  second, unlabelled world, and the seed field would be promising a reproducibility it could not
 *  deliver. `dataState` is what settled to what, and it travels with the run.
 * ==========================================================================*/
import { policyActors } from './pandemic-model.js';

/* ── geometry and naming, shared ────────────────────────────────────────────────────────────────
   These moved here from js/playground.js unchanged. They are not «pandemic» functions — World
   Explorer uses them too — but they are what turns a Natural Earth feature into a row of the world,
   and one statement of each beats the copy each caller would otherwise keep. */
export function pig(x,y,g){
  /* the ray cast against ONE ring — nested in its only caller (tests/r175-checks ③: an unexported
     top-level declaration fails, and an export no js/ module imports fails as dead code). */
  const pir=(px,py,r)=>{let i,j,c=false;for(i=0,j=r.length-1;i<r.length;j=i++){const xi=r[i][0],yi=r[i][1],xj=r[j][0],yj=r[j][1];if(((yi>py)!==(yj>py))&&(px<(xj-xi)*(py-yi)/((yj-yi)||1e-12)+xi))c=!c;}return c;};
  if(!g)return false;const ps=g.type==='Polygon'?[g.coordinates]:(g.type==='MultiPolygon'?g.coordinates:[]);for(const poly of ps){if(poly&&poly.length&&pir(x,y,poly[0])){let h=false;for(let k=1;k<poly.length;k++){if(pir(x,y,poly[k])){h=true;break;}}if(!h)return true;}}return false;}
export function bboxOf(f){let mnx=180,mny=90,mxx=-180,mxy=-90;const eat=r=>r.forEach(p=>{if(p[0]<mnx)mnx=p[0];if(p[0]>mxx)mxx=p[0];if(p[1]<mny)mny=p[1];if(p[1]>mxy)mxy=p[1];});const g=f.geometry;if(!g)return[0,0,0,0];if(g.type==='Polygon')g.coordinates.forEach(eat);else if(g.type==='MultiPolygon')g.coordinates.forEach(poly=>poly.forEach(eat));return[mnx,mny,mxx,mxy];}
export function cName(f){ const p=f&&f.properties||{}; return p.NAME_EN||p.ADMIN||p.NAME||p.name||''; }

/* ⚠ EXPORTED UNDER THE NAME ITS CALLER WANTS, not under a name the caller has to rename. An
   `import { x as y }` is read by scripts/check-split-scope.mjs as a free reference to `x`, and
   js/nominatim-gate.js already names the honest answer: «the check is right about the shape it
   defends, and the honest answer is to export under the name the call site wants». */
export function ensureCountryGeo(loadCountryData, cb){ try{ if(window.countryGeo&&window.countryGeo.features){ cb(); return; } if(typeof loadCountryData==='function'){ loadCountryData().then(()=>cb()); } else cb(); }catch(_){ cb(); } }

/* ⚠⚠⚠ (#R754) ONE STATEMENT OF «WHICH STATISTICS ROW IS THIS FEATURE». It was a closure inside
   js/playground.js called `resolve`, and moving the world out left ONE call site behind reading a
   name that no longer existed — inside a `try/catch`, so it would have thrown ReferenceError in
   silence and dropped every country's own label point from the dot anchors, for ever, with nothing
   to show for it. ⚠ THE COMMENT AT THAT CALL SITE DESCRIBES #R673 FINDING THE SAME CALL SITE
   BROKEN THE SAME SILENT WAY. `npm run check:static` was the only thing that saw it this time. */
export function resolveStatsRow(cs, props){ const s=cs||{}; const p=props||{}; const c=[p.ISO_A3_EH,p.ISO_A3,p.ADM0_A3,p.SOV_A3].map(String).find(x=>s[x]); return c?{code:c,s:s[c]}:null; }

/* ── the four tables ────────────────────────────────────────────────────────────────────────────
   Moved here from js/playground.js with their reasoning, because prose left behind describing code
   that moved is the rot AGENTS.md §9 forbids. Each caches its own promise, each reports failure as
   a fact rather than as a zero, and none of them throws: a dead table must name itself rather than
   silently switch the world off (#R673).

   ══ (#R666) THE TWO TABLES THE INTERNATIONAL SPREAD IS WEIGHTED BY ═════════════════════════
   Land borders come from data/country-facts.json (already loaded on demand by
   window.IntMapCountryFacts for the country card) and airport capacity from data/airports.json
   (built by scripts/build-airports.mjs). Both are fetched WHEN A WORLD IS FIRST BUILT, and a
   reader who would have tapped before they land is held by `world.ready` instead, because
   `createPandemicModel` freezes the mobility matrix and a run that started early could not be
   reproduced from its seed (#R673). `model.mobility.from` still says which weighting was used.

   ══ (#R678) TWO MORE TABLES, THE SAME SHAPE ════════════════════════════════════════════
   data/mobility.json is WHERE people fly (OpenFlights 2014 route counts per country pair) and
   HOW MANY of them travel (World Bank arrivals, departures and boardings, pre-2020).
   data/health.json is WHAT a country can do about an epidemic (WHO UHC service coverage index,
   WHO IHR SPAR health emergency management, WHO/UNICEF DTP3 and MCV1 coverage).
   ⚠ THEY LOAD LIKE data/airports.json AND FAIL LIKE IT: a table that does not arrive leaves
   the model exactly where it was before that round, and the panel says so per table. */

/* ══ ⚠⚠⚠ (#R678) WHERE THE PEOPLE ARE — THE ONE POPULATION SURFACE IntMap ACTUALLY HAS ══════
   The case dots were spread evenly over whatever anchors a country happened to produce, so
   Canada, Russia and Australia got cases scattered across tundra, taiga and desert. The fix
   needs a population surface, and MEASURED 2026-09-10 this project has no population RASTER at
   all: NASA GIBS GPW is a rendered PNG tile whose pixels nothing reads back, and WorldPop is a
   remote per-polygon API that answers in tens of seconds. What it does have is
   data/gazetteer-world.json.gz — 148,630 GeoNames places, 139,056 of them with a population,
   already shipped, already lazily loadable, and keyed by country.

   ⚠ POINTS, NOT A SURFACE, and the screen says so. A city gazetteer knows where towns are, not
   where the countryside is; js/shakemap.js already names the same limitation of the same table
   for the same reason. It is nonetheless the difference between «cases are in the places
   Canadians live» and «cases are anywhere inside Canada».

   ⚠ `PPLX` ROWS ARE DROPPED. GeoNames codes a SECTION of a city as PPLX and gives it its own
   population — fourteen of them are above a million (js/gazetteer.js says so). Keeping them
   would count those people twice, once in the section and once in the city that contains it.

   ⚠ THERE IS NO ANCHOR CAP, and there does not need to be one. `scatterCases` allocates by
   weight, so at most `n` anchors can receive a dot for `n` dots; taking the `n` largest by
   population is exactly sufficient and loses nothing. A fixed cap WOULD have lost something —
   MEASURED, a cap of 160 anchors drops 29.8% of the world's gazetteer population, and 66.6% of
   France's. Sorting once per country and walking as far as the dots need is both cheaper and
   lossless. */
/* ⚠⚠⚠ (#R754) MODULE-PRIVATE STATE, ATTACHED TO window — one of the three answers
   tests/r175-checks ③ names («wrapped, exported, or attached to window»), and the only one that
   fits. The four table caches and the world memo must outlive a call and be shared by every
   caller, so they cannot be wrapped in a function; and exporting them would be a dead export,
   which the same test fails on its second assertion. ⚠ THE `__im` PREFIX MEANS PRIVATE: this bag
   is not an API, nothing outside this file reads it, and it is namespaced so it cannot collide
   with the globals the app actually publishes. */
window.__imPW = window.__imPW || { plP: null, plByIso: null, mobP: null, mobJ: null, hlthP: null, airP: null, airT: null, worldP: null };
export function loadPlaces(){
  if(window.__imPW.plP) return window.__imPW.plP;
  const G=window.IntMapGazetteer;
  if(!G||!G.warm){ window.__imPW.plP=Promise.resolve(false); return window.__imPW.plP; }
  window.__imPW.plP=Promise.resolve(G.warm()).then(()=>{
    const rows=(G.world&&G.world())||[];
    if(!rows.length) return false;
    /* row shape is js/gazetteer.js `_rowsFrom`: [type, terms, lng, lat, en, ja, pop, iso2, gid, fcode, …] */
    const by=Object.create(null);
    for(let q=0;q<rows.length;q++){
      const r=rows[q], pop=+r[6];
      if(!(pop>0)) continue;
      const iso=r[7]; if(!iso) continue;
      if(String(r[9]||'').indexOf('PPLX')===0) continue;
      (by[iso]||(by[iso]=[])).push([+r[2],+r[3],pop]);
    }
    const ks=Object.keys(by);
    if(!ks.length) return false;
    for(let q=0;q<ks.length;q++) by[ks[q]].sort((a,b)=>b[2]-a[2]);
    window.__imPW.plByIso=by; return true;
  }).catch(e=>{ try{ console.error('[IntMap] place populations unavailable: '+((e&&e.message)||e)); }catch(_){} return false; });
  return window.__imPW.plP;
}
/* the placement bank for one ISO-2, or null. Drawing reads this; the compartments never do. */
export function placesFor(iso2){ return (window.__imPW.plByIso&&iso2)?window.__imPW.plByIso[iso2]:null; }


/* ── the world ──────────────────────────────────────────────────────────────────────────────── */

/* buildPandemicWorld({loadCountryData, countryStats}) → Promise<World|null>
   null means «there is no world to simulate» — country geometry never arrived, or every row was
   refused for want of a measured population. The caller says so; this does not toast. */
export function buildPandemicWorld(deps){
  /* ⚠ THE THREE TABLES THIS IS THE ONLY CALLER OF LIVE INSIDE IT. tests/r175-checks ③ fails an
     unexported top-level declaration, and an export no js/ module imports fails as dead code —
     so a loader with exactly one caller belongs in that caller. Their caches are on window
     (see the bag above), so nesting costs nothing across calls. */
  function loadMobility(){
    if(window.__imPW.mobP) return window.__imPW.mobP;
    window.__imPW.mobP=fetch('data/mobility.json').then(r=>{ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
      .then(j=>{ if(!j||!j.vol||!j.pairs) throw new Error('no vol/pairs in data/mobility.json'); window.__imPW.mobJ=j; return j.vol; })
      .catch(e=>{ window.__imPW.mobP=null; window.__imPW.mobJ=null; try{ console.error('[IntMap] travel volumes unavailable: '+((e&&e.message)||e)); }catch(_){} return null; });
    return window.__imPW.mobP;
  }
  function loadHealth(){
    if(window.__imPW.hlthP) return window.__imPW.hlthP;
    window.__imPW.hlthP=fetch('data/health.json').then(r=>{ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
      .then(j=>{ const c=j&&j.countries; if(!c||!Object.keys(c).length) throw new Error('no countries in data/health.json'); return c; })
      .catch(e=>{ window.__imPW.hlthP=null; try{ console.error('[IntMap] health capacity unavailable: '+((e&&e.message)||e)); }catch(_){} return null; });
    return window.__imPW.hlthP;
  }
  function loadAirports(){
    if(window.__imPW.airP) return window.__imPW.airP;
    window.__imPW.airP=fetch('data/airports.json').then(r=>{ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
      .then(j=>{ const c=j&&j.countries; if(!c||!Object.keys(c).length) throw new Error('no countries in data/airports.json'); window.__imPW.airT=c; return c; })
      .catch(e=>{ window.__imPW.airP=null; try{ console.error('[IntMap] airport capacity unavailable: '+((e&&e.message)||e)); }catch(_){} return null; });
    return window.__imPW.airP;
  }
  /* ⚠ NESTED IN ITS ONLY CALLER. tests/r175-checks ③ fails an unexported top-level
     declaration, and exporting a helper nothing else imports fails its second assertion as a
     dead export — so a private helper with one caller lives inside that caller. */
  function makeWorld(w){
    const byCode=Object.create(null), byName=Object.create(null);
    const norm=(s)=>String(s==null?'':s).trim().toLowerCase();
    for(let i=0;i<w.N;i++){
      const r=w.world[i];
      if(r.code) byCode[String(r.code).toUpperCase()]=i;
      if(r.name){ const k=norm(r.name); if(byName[k]==null) byName[k]=i; }
      if(r.admin){ const k=norm(r.admin); if(byName[k]==null) byName[k]=i; }
    }
    w.names=w.world.map(c=>c.name);
    w.indexOfCode=(code)=>{ const k=String(code==null?'':code).trim().toUpperCase(); return (k&&byCode[k]!=null)?byCode[k]:-1; };
    w.indexOfName=(name)=>{ const k=norm(name); return (k&&byName[k]!=null)?byName[k]:-1; };
    /* Point-in-polygon against the same geometry the panel hit-tests with, so a coordinate resolves
       to the row a tap on that spot would have chosen — one hit test, two callers. A place that is
       not a country (a city, a port) reaches the world through THIS door and no other: the caller
       geocodes, and the world says which of its own rows contains the point. */
    w.indexAt=(lng,lat)=>{
      if(!(isFinite(lng)&&isFinite(lat))) return -1;
      for(let i=0;i<w.N;i++){ const b=w.bbs[i]; if(lng<b[0]||lng>b[2]||lat<b[1]||lat>b[3]) continue; if(pig(lng,lat,w.feats[i].geometry)) return i; }
      return -1;
    };
    w.codes=()=>w.world.map(c=>c.code).filter(Boolean);
    return w;
  }
  if(window.__imPW.worldP) return window.__imPW.worldP;
  /* ⚠⚠⚠ A FAILURE IS NOT CACHED. The promise is memoised so the panel and the Atlas capability get
     ONE world; memoising a `null` would instead make the FIRST call's bad luck permanent — country
     geometry that had not arrived yet, or a host that passed no loader, and every later call for
     the rest of the session gets «there is no world to simulate» however healthy the page has since
     become. MEASURED in the local preview: the first call reached this module before
     `window.countryGeo` existed, and without this line the reload was the only cure. */
  const forget = (v) => { if (v == null) window.__imPW.worldP = null; return v; };
  window.__imPW.worldP=new Promise((resolve)=>{
    ensureCountryGeo(deps&&deps.loadCountryData, ()=>{
      const allFeats=(window.countryGeo&&window.countryGeo.features)||[];
      if(!allFeats.length){ resolve(null); return; }
      /* ⚠⚠⚠ (#R754) A GETTER, NOT A SNAPSHOT — MEASURED IN THE LOCAL PREVIEW. `countryStats` is
         filled lazily, so binding its VALUE captures whatever existed at bind time, which is
         usually `{}`. Every row then resolved to `code: null`, every per-country table failed to
         join, 171 of 177 units lost their government, and the epidemic ran on distance alone. It
         did not look like a bug: `dataState` honestly reported four tables «failed», so the run was
         wrong in a way that described itself as a network problem. js/atlas-query.js already binds
         this as `countryStats: () => countryStats` for the same reason. Both shapes are accepted so
         that a caller holding a live object is not forced to wrap it. */
      const _cs=deps&&deps.countryStats; const cs=(typeof _cs==='function'?_cs():_cs)||{};
      /* ⚠ (#R666) THE CODE COMES BACK TOO. It was resolved here and thrown away, so the engine
         received five fields per country and no way to look one up in any other table — which is
         why the destination of an importation could only ever be «some index». */
      const resolveRow=(p)=>resolveStatsRow(cs,p);
      /* ══ ⚠⚠⚠ (#R675) WHICH OF THESE ROWS IS A PLACE WHERE PEOPLE LIVE ═══════════════════════════
         `window.countryGeo` is Natural Earth admin-0, and admin-0 is not «the countries»: at 10 m
         it is 258 rows, and nine of them — Bir Tawil, Clipperton, Scarborough Reef, the Southern
         Patagonian Ice Field, two banks and a reef — have a population of ZERO. They were being
         simulated anyway, because the row that built the world read
         `(s && s.pop > 0) ? s.pop : 3e6` and handed three million invented people to every row the
         statistics table was silent about. Those people then caught the disease, died of it, and
         closed their borders.
         A population is the denominator of every quantity below it. Where there is no measured
         one, the honest answer is not a nicer default, it is «this is not a compartment set»: the
         row is dropped from the world and the panel says how many were, so the reader is told
         rather than shown a number that quietly excludes them. Natural Earth's own POP_EST is the
         fallback for a row the World Bank table has no entry for — it is a measurement, and the
         rows it puts at zero are the rows nobody lives on. */
      const popOf=(f)=>{ const _r=resolveRow(f.properties||{}); const s=_r&&_r.s; if(s&&s.pop>0) return s.pop; const pe=+((f.properties||{}).POP_EST); return pe>0?pe:0; };
      const feats=[], dropped=[];
      for(let q=0;q<allFeats.length;q++){ if(popOf(allFeats[q])>0) feats.push(allFeats[q]); else dropped.push(cName(allFeats[q])||'?'); }
      if(!feats.length){ resolve(null); return; }
      const N=feats.length, cent=[], bbs=[], world=[], home=[];
      feats.forEach((f,i)=>{ const bb=bboxOf(f); bbs[i]=bb; cent[i]=[(bb[0]+bb[2])/2,(bb[1]+bb[3])/2]; const _r=resolveRow(f.properties||{}); const s=_r&&_r.s;
        const pop=popOf(f);
        /* ⚠ ONE PROXY, FOUR MEANINGS — and the engine keeps them apart from here on. GDP per head
           (or HDI) stands in for medical capacity, travel connectivity, policy capacity and vaccine
           delivery because IntMap has no separate data for the other three yet; js/pandemic-model.js
           stores them as four fields so that the day one of them gets its own source, one formula
           changes instead of every formula. */
        const dev=(s&&s.gdppc)?Math.min(1,Math.max(0.12,s.gdppc/55000)):(s&&s.hdi?s.hdi:0.5);
        const pr=f.properties||{};
        /* ⚠ (#R675) `admin` AND `sov` ARE NATURAL EARTH'S OWN SELF-DESCRIPTION, kept because the
           policy actor is derived from them below: ADMIN is what this row calls itself and
           SOVEREIGNT is the row that administers it, and NE guarantees the second is the ADMIN of
           another row in the same file. Deriving «who governs here» from a map's own topology is
           the alternative to a list of dependency names, which would go stale the first time the
           upstream file changed. */
        world[i]={name:cName(f)||'?', code:(_r&&_r.code)||null, admin:pr.ADMIN||cName(f)||'?', sov:pr.SOVEREIGNT||null, pop, dev, lat:cent[i][1], lng:cent[i][0], borders:null, air:0, capital:null, actor:i};
        /* ⚠ (#R675) THE POLICY BADGE GOES ON THE LABEL POINT, NOT THE BOUNDING-BOX CENTRE. Natural
           Earth's LABEL_X/Y is the point inside the country's main landmass that its own cartography
           puts the name at; the bbox centre of France is in the Atlantic and the bbox centre of
           Norway is in the Norwegian Sea, because both own remote territory (#R426). Falls back to
           the centre only when the label point is not inside this feature's geometry. */
        const lx=+pr.LABEL_X, ly=+pr.LABEL_Y;
        home[i]=(isFinite(lx)&&isFinite(ly)&&pig(lx,ly,f.geometry))?[lx,ly]:cent[i]; });
      /* ══ ⚠⚠⚠ (#R673) THE WORLD IS A SNAPSHOT, AND IT IS CONFIRMED BEFORE THE RUN EXISTS ═══════
         These tables used to be filled IN PLACE while the panel was already accepting taps, and
         `createPandemicModel` freezes the mobility matrix at construction. So which world you got
         was decided by how fast your network was: tap within the second and the outbreak spread by
         population and distance alone, tap after and it spread by airports and land borders, and
         NOTHING LATER FIXED IT. The seed field promises that the same seed is the same run; it
         could not be, because the same seed was not the same world.
         ⚠ SETTLED, NOT SUCCEEDED. A dead table must not lock the reader out of the simulator; it
         must be named. `dataState` is what the panel prints and what the run carries. */
      const dataState={ borders:'pending', airports:'pending', policy:'pending', volumes:'pending', health:'pending', routes:'pending', places:'pending' };
      function settle(p,key,fill){
        return Promise.resolve(p).then(t=>{ if(!t) { dataState[key]='failed'; return; }
          let hit=0; for(let i=0;i<N;i++){ const c=world[i].code; const row=c&&t[c]; if(row&&fill(world[i],row)) hit++; }
          dataState[key]=hit?(hit===N?'ok':'partial'):'failed'; })
          .catch(()=>{ dataState[key]='failed'; });
      }
      let factsT=null;
      const W=makeWorld({N, feats, world, home, bbs, dataState, routes:null, dropped});
      /* ⚠⚠⚠ (#R754) TWO PHASES, BECAUSE THE PANEL ALWAYS HAD TWO. The rows exist as soon as Natural
         Earth is parsed, and js/playground.js draws its configuration screen from them immediately —
         names, populations, how many rows were refused. What it must NOT do until the four tables
         have settled is let anybody START a run, because the mobility matrix freezes at
         `createPandemicModel` (#R673). Collapsing that into one promise would have replaced the
         panel's «here is the world, preparing connectivity» with a blank wait, which is a UI
         regression smuggled in under a refactor — the thing #R675 §3 forbids.
         So: this resolves with the rows, and `world.ready` resolves when the world is DECIDED.
         ⚠ EVERY CALLER THAT STARTS A RUN MUST AWAIT `ready`. The Atlas capability does it in one
         line because it has no screen to draw; the panel does it by ungating `picking`. */
      const factsP=Promise.resolve((window.IntMapCountryFacts&&window.IntMapCountryFacts.load)?window.IntMapCountryFacts.load():null)
        .then(t=>{ factsT=t||null; return t; }).catch(()=>{ factsT=null; return null; });
      W.ready=Promise.all([
        settle(factsP,'borders',(w,row)=>{ if(row.capital) w.capital=row.capital; if(row.borders&&row.borders.length){ w.borders=row.borders; return true; } return false; }),
        settle(loadAirports(),'airports',(w,row)=>{ if(row.cap>0){ w.air=row.cap; return true; } return false; }),
        /* ⚠ (#R673) THESE JOIN THE SNAPSHOT, they do not fill in afterwards. */
        settle(loadMobility(),'volumes',(w,row)=>{ if(row.arr>0){ w.arr=row.arr; return true; } return false; }),
        settle(loadHealth(),'health',(w,row)=>{
          let any=false;
          if(row.uhc>0){ w.uhc=row.uhc; any=true; }
          if(row.spar>0){ w.spar=row.spar; any=true; }
          if(row.dtp3>0){ w.dtp3=row.dtp3; any=true; }
          /* ⚠ MCV1 IS CARRIED, NOT APPLIED. It is an initial condition for ONE preset, so it is
             attached under its own name and the caller decides whether this run is the one where a
             measured measles coverage is the right starting immunity (#R678). */
          if(row.mcv1>0){ w.mcv1=row.mcv1; any=true; }
          return any; })
      ]).then(()=>{
        /* ⚠ THE ROUTE TABLE IS NOT A PER-COUNTRY TABLE, so `settle()` — which walks the world row
           by row — cannot report it. It is keyed by ORDERED PAIR, and how much of it reached the
           matrix is a question only the engine can answer (`model.mobility.stats`). */
        W.routes=(window.__imPW.mobJ&&window.__imPW.mobJ.pairs)||null;
        dataState.routes=W.routes?(dataState.volumes==='failed'?'partial':'ok'):'failed';
        /* ══ ⚠⚠⚠ (#R675) WHO ANSWERS FOR EACH ROW — DERIVED, NOT LISTED ═══════════════════════════
           「Antarcticaが国境を封鎖。」 was not a labelling slip: the engine really was giving a
           continent with no government a border policy, a lockdown and a traffic multiplier that
           the importation loop then obeyed. ⚠ THE RULE ITSELF IS `policyActors` IN
           js/pandemic-model.js — pure, exported and measured by tests/r675-pandemic-checks against
           the real data/country-facts.json. A rule that only existed inside a DOM closure is a rule
           no test can reach (#R505), and this one decides whether a place may have a government. */
        const a=policyActors(world,!!factsT);
        let none=0, follow=0;
        for(let i=0;i<N;i++){ world[i].actor=a[i]; if(a[i]<0) none++; else if(a[i]!==i) follow++; }
        dataState.policy=factsT?'ok':'failed';
        dataState.policyFollow=follow; dataState.policyNone=none;
        W.facts=factsT;
        return W;
      });
      resolve(W);
      /* ⚠⚠ THE GAZETTEER IS DELIBERATELY *NOT* IN THE SNAPSHOT ABOVE. It decides where the dots are
         DRAWN, not what the epidemic does — the compartments never see it — and it is a 5 MB
         download that would hold the reader at «loading» for no epidemiological reason. */
      loadPlaces().then(ok=>{ dataState.places=ok?'ok':'failed'; });
    });
  }).then(forget);
  return window.__imPW.worldP;
}

/* ⚠⚠⚠ (#R754) THE WORLD ANSWERS TO ITS OWN KEYS. [[intmap-store-refused-its-own-key]] is the round
   where a store would not accept the identifier it had itself issued, and a geocoder's first guess
   was promoted to «the country» without check — Germany became Belgium, Japan became Benin. So the
   lookups below are the world's own: `code` is the ISO3 this world actually stored, `name` and
   `admin` are the strings it actually holds, and a query matching none of them returns −1 rather
   than something plausible. Naming what it accepts is the refusal's job, not the caller's guesswork. */

/* ══ ⚠⚠⚠ (#R754) WHERE DOES IT START — AND WHAT DID WE ACTUALLY DECIDE ═══════════════════════════
   「ラゴス発のパンデミック」 names a CITY, and the engine seeds a COUNTRY. Something has to make that
   step, and the two ways to get it wrong are both on this project's record:
     · [[intmap-store-refused-its-own-key]] — a geocoder's first hit promoted to «the country»
       without check, so Germany became Belgium and Japan became Benin. ⇒ the point decides the
       country by POINT-IN-POLYGON against this world's own geometry, not by trusting a label.
     · [[intmap-one-store-was-asked]] — «no candidates» and «weak evidence» answering with one word.
       ⇒ the refusal says WHICH of the three doors was tried and what it would have accepted.
   ⚠ AND IT REPORTS WHAT IT DECIDED. A run that silently turns Lagos into Nigeria and then reports
   «Nigeria» has hidden a step the reader might disagree with; `how`, `matched` and `at` travel out
   with the answer so the reply can say «Lagos → Nigeria» and be argued with.
   ⚠ THE GAZETTEER IS ALREADY SHIPPED — data/gazetteer-world.json.gz, the same table the case dots
   are placed against. No new upstream, and no network call this module did not already make. */
export function resolveOrigin(w, q) {
  /* ⚠ NESTED IN ITS ONLY CALLER. tests/r175-checks ③ fails an unexported top-level
     declaration, and exporting a helper nothing else imports fails its second assertion as a
     dead export — so a private helper with one caller lives inside that caller. */
  function gazetteerPoint(query) {
    const G = window.IntMapGazetteer;
    const rows = (G && G.world && G.world()) || null;
    if (!rows || !rows.length) return null;
    const k = String(query).trim().toLowerCase();
    if (!k) return null;
    let best = null;
    for (let q = 0; q < rows.length; q++) {
      const r = rows[q];
      const en = String(r[4] || '').toLowerCase(), ja = String(r[5] || '').toLowerCase();
      let hit = (en === k || ja === k);
      if (!hit) { const terms = String(r[1] || '').toLowerCase().split(/[|,]/); for (let z = 0; z < terms.length; z++) { if (terms[z].trim() === k) { hit = true; break; } } }
      if (!hit) continue;
      const pop = +r[6] || 0;
      if (!best || pop > best.pop) best = { lng: +r[2], lat: +r[3], name: r[4] || r[5] || query, pop: pop };
    }
    return best;
  }
  const Q = q || {};
  const lng = +Q.lng, lat = +Q.lat;
  if (isFinite(lng) && isFinite(lat)) {
    const i = w.indexAt(lng, lat);
    return i >= 0 ? { i: i, how: 'point', at: [lng, lat] }
      : { i: -1, why: 'no-country-at-point', at: [lng, lat] };
  }
  /* ⚠ THREE SPELLINGS OF ONE FIELD, READ IN ONE PLACE. `country`, `place` and `origin` are all
     accepted by the capability's targetPolicy (js/atlas-capabilities.js `hasTarget('place')`), so a
     resolver that read only one of them would refuse a call the planner was told to make — which is
     exactly [[intmap-two-readers-one-field-list]], where `{targets:[…]}` failed and `{countries:[…]}`
     succeeded for the same request because two readers held two lists. One list, read here. */
  const named = ['country', 'origin', 'place'].map(k => (Q[k] == null ? '' : String(Q[k]).trim())).find(v => v !== '') || '';
  if (named) {
    let i = w.indexOfCode(named);
    if (i >= 0) return { i: i, how: 'code', matched: w.world[i].code };
    i = w.indexOfName(named);
    if (i >= 0) return { i: i, how: 'name', matched: w.world[i].name };
    /* ⚠ NOT A COUNTRY IS NOT NOTHING. A city handed to `country` falls through to the gazetteer
       rather than being refused, because the caller's mistake is a naming one and the answer is
       knowable — but WHICH door answered is reported, so nobody reads «Nigeria» as «you said
       Nigeria». */
  }
  const place = String(Q.place != null && String(Q.place).trim() !== '' ? Q.place : named).trim();
  if (!place) return { i: -1, why: 'no-origin-given' };
  const hit = gazetteerPoint(place);
  if (!hit) return { i: -1, why: 'place-not-found', place: place };
  const i = w.indexAt(hit.lng, hit.lat);
  if (i < 0) return { i: -1, why: 'place-outside-every-country', place: place, at: [hit.lng, hit.lat] };
  return { i: i, how: 'place', matched: hit.name, at: [hit.lng, hit.lat], pop: hit.pop };
}

/* The most populous gazetteer row whose English or Japanese name, or one of its search terms, IS
   the query (after casefolding) — never merely contains it. ⚠ «Contains» is what made a substring
   of a name outrank the name (#R515's bigram lesson in its cheapest form): 'York' must not answer
   with 'New York'. Population breaks ties because a tie here is two real places sharing a name, and
   the larger one is the one a reader naming it unqualified means. */
