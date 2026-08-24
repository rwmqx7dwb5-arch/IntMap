/* ============================================================================
 *  IntMap · LIVE SATELLITES — window.IntMapSatellites  (#R184)
 * ----------------------------------------------------------------------------
 *  「Live aircraft trafficの要領で、人工衛星版もフルクオリティで作って。」
 *
 *  The aircraft layer's shape, applied to orbit: a real keyless feed, real propagation, live
 *  positions, hover for a tooltip, click for a detail card, a track for the selected object, a filter
 *  in the legend, and every number on screen the one actually computed. What is NOT shared is the
 *  physics — an aeroplane REPORTS where it is, a satellite does not — so this file's centre of gravity
 *  is the propagator rather than the fetch.
 *
 *  ── THE ORBIT MODEL IS NOT HAND-ROLLED, AND THAT IS A CORRECTNESS DECISION ───────────────────
 *  Positions come from SGP4/SDP4 via `satellite.js` (MIT), the standard implementation of Spacetrack
 *  Report #3 / Vallado's revisiting paper. Writing SGP4 by hand is a very ordinary thing to get 95 %
 *  right and it fails in a way nobody notices: the near-earth branch alone is only valid below a
 *  ~225-minute period, so a partial implementation puts every GEO and Molniya satellite — the ones a
 *  user is most likely to look for by name — somewhere plausible and wrong. Verified before building
 *  anything on it, against the canonical test vector (Vallado, satellite 00005, t = 0 from epoch):
 *
 *      expected  7022.46529266  -1400.08296755   0.03995155  km (TEME)
 *      got       7022.46529266  -1400.08296755   0.03995155
 *      error     6.8e-9 km  =  7 micrometres
 *
 *  …and against the live catalogue: ISS 436.6 km / 7.650 km s⁻¹ / 92.96 min / 51.631° inclination,
 *  all of which are the real figures.
 *
 *  ── THE SUN ARGUMENT THAT SILENTLY RETURNED NaN ─────────────────────────────────────────────
 *  `shadowFraction(sunEciAU, satEciKm)` takes the SUN'S POSITION, not the time. Handed a `Date` it
 *  returns NaN — no throw, no warning — and "sunlit" then evaluates to null for every object in the
 *  catalogue, which is the one property that makes the "brightest / naked-eye" group mean anything.
 *  The Sun comes from `sunPos(jday(t)).rsun`, and the pair was checked over a whole ISS orbit:
 *  57 minutes lit, 36 eclipsed — which is the real duty cycle, and a declination of +18.3° on 31 July,
 *  which is the real Sun.
 *
 *  ── WHERE A SATELLITE IS DRAWN ───────────────────────────────────────────────────────────────
 *  At its SUB-SATELLITE POINT — the spot on the ground it is directly above — with the altitude
 *  carried as data rather than as height. This is a deliberate refusal, not a shortcut. #R172 lifted
 *  aircraft to their true altitude because 11 km is a real distance on a map; a satellite is at
 *  400–35,786 km, and geostationary is 5.6 EARTH RADII up. Drawing that at true scale puts it off
 *  every screen, and drawing it at a "nice" reduced height would be inventing a number — the exact
 *  fabrication standing instruction 4 forbids. So the map shows the honest projection, and the things
 *  that ARE spatially meaningful get drawn properly instead:
 *    · the FOOTPRINT — the region from which the satellite is above the horizon, which is real
 *      geometry: half-angle = acos(Re / (Re + h));
 *    · the GROUND TRACK — one full orbit either side of now, so the path is visible as a path.
 *
 *  ── HONEST STATE ─────────────────────────────────────────────────────────────────────────────
 *  · Element sets carry an EPOCH and decay in accuracy away from it. The card shows the age of the
 *    elements it used, because an SGP4 position from a three-week-old TLE is a different claim from
 *    one propagated ten minutes.
 *  · "Overhead now" and the NEXT PASS are computed from the map centre by real look angles
 *    (`ecfToLookAngles`), not from proximity on screen — a satellite 2,000 km up looks close on a
 *    world map and is still below the horizon.
 *  · No network per frame. TLEs refresh on the timescale they actually change (2 h); positions are
 *    recomputed locally every second from the elements already in hand.
 *
 *  ── (#R185) EVERY ACTIVE SATELLITE, AND NEVER AN EMPTY SKY ──────────────────────────────────
 *  「何も表示されないのは論外。実際の位置に全衛星がリアルタイムで美しく表示されるのが最低条件。」
 *  Two things followed. The default catalogue is now `active` — all of it — because the two reasons
 *  it was not have both been measured away: the elements are fetched as TLE rather than GP JSON
 *  (~2.5 MB instead of 6.8 MB, the same numbers), and SGP4 costs 1.94 µs an object, so eleven
 *  thousand of them are 21 ms of a tick that steps at 2–3 s for a catalogue that size. And the feed
 *  is no longer a single point of failure: on 2026-08-01 celestrak.org resolved and refused every
 *  connection for hours, and with one source this layer drew NOTHING. There are four ways to the
 *  same element sets now — CelesTrak, two public CORS mirrors, a catalogue SHIPPED WITH THE APP
 *  (data/tle/, rebuilt by CI) and the local cache — and each one says which it used.
 *
 *  Source & terms: CelesTrak GP/OMM (celestrak.org) — keyless, CORS-open (verified from the browser;
 *  a curl check cannot answer this because curl sends no Origin), free for non-commercial use with
 *  attribution. The bundled fallback is built by scripts/build-tle-snapshot.mjs from CelesTrak, or
 *  from SatNOGS DB (Space-Track / CelesTrak elements) when CelesTrak cannot be reached. Group sizes
 *  measured: `visual` 65 KB, `stations` 9.6 KB, `active` 6.8 MB as JSON and ~2.5 MB as TLE.
 *
 *  The CSS stays in css/intmap.css; this file adds no <style>.
 * ==========================================================================*/
/* (#R408) the program's one timer wheel (js/runtime.js), not a private timer of this file's own. */
import { everyTick, stopTick } from './runtime.js';
window.IntMapModules=window.IntMapModules||{};
window.IntMapModules.satellitesLive=function(HOST){
  /* ── (#R184) SGP4 ARRIVES WHEN THE LAYER DOES, NOT WHEN THE PAGE DOES ────────────────────────
     `satellite.js` is 27 KB gzipped, and a STATIC import puts it in the main bundle for EVERY
     session — including the overwhelming majority that never switch this layer on. The app already
     has a policy for this and states it plainly for Cesium (js/engine-select.js: 8 MB reached only
     through a dynamic import, so a MapLibre session transfers none of it); the same reasoning
     applies at a smaller scale here, in a round whose brief was 「高速化」.
     So the propagator is imported on FIRST USE and lands in its own Rollup chunk. Everything that
     needs it is downstream of load(), which awaits it; the sync helpers below still check, because
     a guard that can never fire costs nothing and a missing one is a TypeError in a live layer.

     It lives INSIDE the factory, not at the top of the file, and that is not a style choice: no js/
     module may have a TOP-LEVEL declaration (tests/r175-checks — an AST sweep finding zero of them
     across every file is precisely what made the ESM conversion incapable of changing a name
     resolution). A `let SAT` at file scope broke that invariant, and the check caught it. The
     factory is instantiated exactly once, so the closure holds the same single instance the file
     scope would have. */
  let SAT=null, _satP=null;
  function loadSGP4(){
    if(SAT) return Promise.resolve(SAT);
    if(!_satP) _satP=import('satellite.js').then(m=>{ SAT=m; return m; })
      .catch(e=>{ _satP=null; throw e; });
    return _satP;
  }
  const GE=()=>window.IntMapGeoEngine;
  const L=window.IntMapLang.pick(()=>HOST.lang);
  const S=(v)=>{ try{ return window.IntMapSafe.html(v==null?'':String(v)); }catch(_){ return ''; } };
  const D2R=Math.PI/180, R2D=180/Math.PI;
  const R_EARTH=6378.137;                    /* km, equatorial — the same figure SGP4 uses */

  /* ── the catalogue ────────────────────────────────────────────────────────────────────────────
     CelesTrak's group names. Sizes are MEASURED, not estimated, and they are why `active` carries a
     warning instead of being the obvious "show me everything" default. */
  const GROUPS=[
    { id:'visual',   kb:65,   nm:()=>L('Brightest (naked eye)','肉眼で見える衛星','Hellste (bloßes Auge)','Ярчайшие (видимые глазом)','Más brillantes (a simple vista)') },
    { id:'stations', kb:10,   nm:()=>L('Space stations','宇宙ステーション','Raumstationen','Космические станции','Estaciones espaciales') },
    { id:'weather',  kb:40,   nm:()=>L('Weather satellites','気象衛星','Wettersatelliten','Метеоспутники','Satélites meteorológicos') },
    { id:'geo',      kb:180,  nm:()=>L('Geostationary','静止衛星','Geostationär','Геостационарные','Geoestacionarios') },
    { id:'gps-ops',  kb:30,   nm:()=>L('GPS','GPS','GPS','GPS','GPS') },
    { id:'galileo',  kb:25,   nm:()=>L('Galileo','Galileo','Galileo','Galileo','Galileo') },
    { id:'science',  kb:60,   nm:()=>L('Science','科学衛星','Wissenschaft','Научные','Científicos') },
    { id:'starlink', kb:1800, nm:()=>L('Starlink','Starlink','Starlink','Starlink','Starlink') },
    { id:'active',   kb:2500, nm:()=>L('All active satellites','運用中の全衛星','Alle aktiven Satelliten','Все действующие спутники','Todos los satélites activos') }
  ];
  /* ══ (#R185) THE DEFAULT IS EVERYTHING ═══════════════════════════════════════════════════════
     「実際の位置に全衛星がリアルタイムで美しく表示されるのが最低条件。」 #R184 defaulted to the 157
     naked-eye objects because `active` is 6.8 MB as GP JSON and 16 s to fetch. Both halves of that
     are fixed rather than accepted: the elements are fetched in the TLE form CelesTrak also serves
     (~2.5 MB — a third of the JSON, and the same numbers), and the propagation was MEASURED at
     1.94 µs per object, so eleven thousand of them cost 21 ms of a one-second tick. There is no
     reason left to show a hundred and fifty of them. */
  const DEFAULT_GROUP='active';
  /* TLE rather than JSON: one third of the bytes for the same element sets, the format the bundled
     fallback below is stored in, and therefore ONE parser for the network, the cache and the
     snapshot — see ingestTLE below, which is the only parser there is, and a second format is how the
     three quietly start disagreeing. */
  const GP=(g)=>'https://celestrak.org/NORAD/elements/gp.php?GROUP='+encodeURIComponent(g)+'&FORMAT=tle';
  /* ══ AND IT MUST NOT BE ONE HOST ══════════════════════════════════════════════════════════════
     Measured on 2026-08-01: celestrak.org resolved and then refused every connection for hours, and
     the layer drew nothing at all — no satellites, one honest error line, an empty sky. A single
     free host IS a single point of failure, so there are three ways to the same element sets:
       1. CelesTrak directly (authoritative, ≤2 h old);
       2. the same CORS proxies js/data-layers.js already uses for the submarine-cable feed, which
          cover the case where the host is up but this browser cannot reach it;
       3. a catalogue SHIPPED WITH THE APP (data/tle/catalogue.tle, rebuilt by CI —
          scripts/build-tle-snapshot.mjs). Same-origin, so it cannot be blocked or rate-limited,
          and real elements with a real epoch — the card already reports how old they are.
     Nothing here fabricates an orbit. A snapshot propagated by SGP4 gives a real position whose
     accuracy decays from its epoch; that is a different thing from an invented one, and the
     difference is what makes it acceptable under standing instruction 4. */
  const PROXIES=[ (u)=>'https://api.allorigins.win/raw?url='+encodeURIComponent(u),
                  (u)=>'https://api.codetabs.com/v1/proxy/?quest='+encodeURIComponent(u) ];
  const BUNDLED='data/tle/catalogue.tle', BUNDLED_META='data/tle/catalogue.json';
  /* (#R207) which NORAD ids belong to which CelesTrak group, built beside the snapshot — see
     scripts/build-tle-snapshot.mjs. Fetched once, lazily, and only when a group other than `active`
     has to fall back to the bundle. */
  const BUNDLED_GROUPS='data/tle/groups.json';
  let _grpP=null, _grpTbl=null;
  function bundledGroupIds(g){
    if(g==='active') return Promise.resolve(null);          /* the whole file already IS `active` */
    if(_grpTbl!==null) return Promise.resolve(_grpTbl[g]||null);
    if(!_grpP) _grpP=fetch(BUNDLED_GROUPS,{cache:'no-store'})
      .then(r=>r.ok?r.json():null)
      .then(j=>{ _grpTbl=(j&&j.groups&&typeof j.groups==='object')?j.groups:{}; return _grpTbl; })
      .catch(()=>{ _grpTbl={}; return _grpTbl; });
    return _grpP.then(t=>t[g]||null);
  }

  const SRC='src-sats', LYR='lyr-sats', LBL='lyr-sats-lbl', HALO='lyr-sats-halo';
  const TRK_SRC='src-sat-track', TRK='lyr-sat-track', FOOT='lyr-sat-foot', FOOTLN='lyr-sat-foot-line';
  /* ══ (#R202) …AND THE SAME OBJECTS, IN ORBIT ═══════════════════════════════════════════════════
     「すべての地球周囲にある衛星をリアルタイムで実場所でアニメーションで見られるレイヤーを作って。」
     The layers above draw each object at its SUB-SATELLITE POINT, which is where it is on the map
     and not where it is. `ORB` is the same catalogue at its own altitude, through the engine's
     orbit3d primitive (js/orbit-points.js on MapLibre, a PointPrimitiveCollection on Cesium): on the
     globe the objects stand off the surface in a shell, the far side of the planet hides the ones
     behind it, and the motion between propagations is carried by the RATE rather than by a step.
     Both readings are kept, because they answer different questions — the dot in orbit is where the
     spacecraft is, the icon on the ground is the place it is over, and the footprint belongs to the
     second one. */
  const ORB='lyr-sats-orbit';
  const ALL_LAYERS=[FOOT,FOOTLN,TRK,HALO,LYR,LBL];
  /* Above this many objects the names stop being drawn at all — see the label layer's filter. */
  const LABEL_MAX=600;
  /* The orbital regimes, by the altitude SGP4 returned: GEO is the 35,786 km synchronous shell, MEO
     the navigation constellations above the inner Van Allen belt, HEO anything markedly eccentric
     (Molniya, Tundra), and everything else low orbit. */
  const bandOf=(f)=>{ const h=f.altKm;
    if(!(h>0)) return 'leo';
    if(h>32000) return 'geo';
    if((f.ecc||0)>0.25) return 'heo';
    if(h>2000) return 'meo';
    return 'leo'; };

  let group=DEFAULT_GROUP;
  let sats=[];                             /* [{satrec, name, id, intl, epoch}] */
  let fixes=[];                            /* the last computed positions, for picking and the card */
  let tleAt=0, loading=false, lastErr=null;
  let selected=null;                       /* NORAD id of the satellite whose track is drawn */
  let timer=null, on=false;
  let bundled=false, bundledMeta=null;     /* (#R185) true when the elements came from the shipped catalogue */
  let _diverged=0;                         /* (#R185) objects dropped this tick because SGP4 diverged on them */
  /* (#R202) the orbit rendering: whether the engine can do it, whether the layer is in, and the
     mercator/altitude triples the pick projects — kept here because the pick has to agree with what
     the shader drew, and the shader's own copy lives on the GPU. */
  let orbOn=false, orbAt=0, orbMercAlt=null, orbRate=null, orbIds=null;
  /* (#R185) called the FIRST time a catalogue lands, from whichever rung of the ladder answered, so
     the layer can go visible on the shipped copy instead of waiting out the network's timeouts. */
  let _onPrimed=null;
  let opacity=0.95;
  let _hover=null, _click=null, _moveT=null, _onMove=null;

  /* ── data ─────────────────────────────────────────────────────────────────────────────────── */
  /* The IN-FLIGHT request, so two callers COALESCE onto one fetch instead of the second being told
     "no". The layer and the Layers-panel preview tile both ask for the catalogue, and a bare
     `if(loading) return false` made whichever asked second receive an EMPTY answer — measured: the
     preview drew nothing while the layer had 157 objects. The same shape #R183 had to give the
     weather client, for the same reason: "already busy" is not an answer to "give me the data". */
  /* …keyed by GROUP, because "coalesce" and "ignore" are different things: two callers asking for the
     same catalogue share one request, while a caller asking for a DIFFERENT one after setGroup() must
     start its own — otherwise choosing GPS while `visual` is still downloading would hand back the
     wrong catalogue and never load the right one. */
  let _inflight=null, _inflightG=null;
  /* ── THE CATALOGUE IS CACHED, AND THAT IS ABOUT CELESTRAK AS MUCH AS ABOUT US ───────────────
     Element sets change on a two-hour timescale — the layer already refreshes on that clock and
     recomputes positions locally in between. Re-downloading them on every page load, every engine
     switch and every re-toggle is traffic that buys nothing and that a free, keyless, unmetered
     service does not owe us: asked for the same group seven times in a few minutes (a full test
     run), it simply stopped answering, and the layer had nothing to draw. Persisting the raw
     records for the same 2 h the refresh timer uses removes the whole class of request.
     `active` is 6.8 MB, so anything over the cap is fetched fresh rather than stuffed into
     localStorage — a quota exception here would take the layer down with it. */
  /* (#R185) the cache holds the TLE TEXT now, which is a third of the JSON it replaced, so the full
     `active` catalogue (~2.5 MB) fits inside a normal 5 MB localStorage budget instead of being the
     one group that could never be cached. A quota failure still just returns false. */
  const CK='intmap_sat_cat', CACHE_MS=2*3600*1000, CACHE_MAX=4000000;
  /* `visual` measured at 294 ms and the 6.8 MB `active` group at 16 s, so 25 s is generous for the
     largest catalogue on a slow link and still far short of "never" — see the abort in load(). */
  const FETCH_MS=12000;
  function cacheGet(g){
    try{ const j=JSON.parse(localStorage.getItem(CK)||'null');
      if(!j||j.g!==g||typeof j.a!=='string') return null;
      if(Date.now()-(+j.t||0)>CACHE_MS) return null;
      return j; }catch(_){ return null; }
  }
  function cachePut(g,text){
    try{ if(typeof text!=='string'||text.length>CACHE_MAX) return false;
      localStorage.setItem(CK,JSON.stringify({ g, t:Date.now(), a:text })); return true; }catch(_){ return false; }
  }
  /* ── THE ELEMENT SETS, PARSED ONCE ────────────────────────────────────────────────────────────
     One function, because the cache, the network, the proxies and the bundled snapshot must produce
     the identical thing: a second copy of this loop is how a cached catalogue quietly starts
     differing from a fetched one. The TLE columns are fixed-width by definition (Spacetrack Report
     #3), so every card field is read from the line it lives on rather than from a second document.
     `twoline2satrec` does the propagation set-up; nothing here re-derives what it already knows. */
  const _num=(v)=>{ const n=parseFloat(v); return isFinite(n)?n:null; };
  /* line 1 cols 54-61: a decimal point assumed before the mantissa, the last two chars an exponent */
  function _expField(t){
    const m=/^\s*([-+]?)(\d{5})([-+]\d)$/.exec(t); if(!m) return _num(t)||0;
    return (m[1]==='-'?-1:1)*parseFloat('0.'+m[2])*Math.pow(10,parseInt(m[3],10));
  }
  function _epochISO(l1){
    const e=parseFloat(l1.slice(18,32)); if(!isFinite(e)) return '';
    const yy=Math.floor(e/1000), year=yy<57?2000+yy:1900+yy, doy=e%1000;
    try{ return new Date(Date.UTC(year,0,1)+(doy-1)*86400000).toISOString(); }catch(_){ return ''; }
  }
  /* (#R207) `only` = a Set of NORAD ids to keep, or null for "everything in the text". It exists so
     the ONE bundled catalogue (which is the `active` set) can answer a request for a SUBSET of it —
     see bundledGroupIds. Filtering here rather than after means the objects that are not wanted are
     never turned into satrecs, which is most of the work. */
  function ingestTLE(text,want,only){
    if(!SAT||typeof text!=='string'||text.length<140) return false;
    const lines=text.split(/\r?\n/);
    const out=[]; const seen=new Set();
    for(let i=0;i+2<lines.length+1;i++){
      const l1=lines[i+1], l2=lines[i+2];
      if(!l1||!l2||l1[0]!=='1'||l2[0]!=='2'||l1.length<69||l2.length<69) continue;
      if(l1.slice(2,7).trim()!==l2.slice(2,7).trim()) continue;
      if(only&&!only.has(parseInt(l1.slice(2,7),10))){ i+=2; continue; }   /* (#R207) */
      const name=String(lines[i]||'').replace(/^0\s+/,'').trim();
      let rec=null;
      try{ rec=SAT.twoline2satrec(l1,l2); }catch(_){ continue; }
      /* A record that failed to initialise is DROPPED, not drawn at 0,0. satellite.js reports it
         on the record itself; an object we cannot propagate is one we must not pretend to place. */
      if(!rec||rec.error) { i+=2; continue; }
      const id=parseInt(l1.slice(2,7),10);
      if(seen.has(id)){ i+=2; continue; }
      seen.add(id);
      out.push({ satrec:rec, name:name||('NORAD '+id), id, intl:l1.slice(9,17).trim(),
        epoch:_epochISO(l1),
        /* the element set's own quality figures — shown on the card because they are what an
           SGP4 position is only as good as */
        meanMotion:_num(l2.slice(52,63)), ecc:_num('0.'+l2.slice(26,33).trim()),
        raan:_num(l2.slice(17,25)), argp:_num(l2.slice(34,42)),
        incl:_num(l2.slice(8,16)),
        bstar:_expField(l1.slice(53,61)), revNum:_num(l2.slice(63,68)),
        classification:(l1[7]||'').trim() });
      i+=2;
    }
    /* a reply for a catalogue the user has since switched away from is DROPPED, never painted */
    if(!out.length||want!==group) return false;
    sats=out; tleAt=Date.now();
    return true;
  }
  function load(g){
    const want=g||group;
    if(_inflight&&_inflightG===want) return _inflight;
    /* THE PROPAGATOR FIRST. Everything below turns element sets into satellite records, which is
       json2satrec's job, so this is the one place the lazy import has to be resolved — and doing it
       here means the cache path gets it too, rather than being the one route that skips it. */
    if(!SAT){
      loading=true; lastErr=null; _inflightG=want;
      _inflight=loadSGP4().then(()=>{ _inflight=null; _inflightG=null; loading=false; return load(want); })
        .catch(e=>{ lastErr='could not load the orbit propagator: '+String(e&&e.message||e);
          loading=false; _inflight=null; _inflightG=null; return false; });
      return _inflight;
    }
    /* a fresh cache answers synchronously — no request, no in-flight state to coalesce onto */
    const hit=cacheGet(want);
    if(hit&&want===group){
      if(ingestTLE(hit.a,want)) return Promise.resolve(true);
    }
    loading=true; lastErr=null; bundled=false; bundledMeta=null; _inflightG=want;
    /* A REQUEST THAT NEVER SETTLES IS WORSE THAN ONE THAT FAILS. `fetch` has no timeout of its own,
       so a CelesTrak that accepts the connection and then stops talking — which is what a rate-limited
       server does rather than refusing outright — left this promise pending for ever: `loading` stayed
       true, `err` stayed null, the layer never drew and never said why, and anything awaiting the
       catalogue (the preview tile, Atlas's `find`, a test) hung with it. Measured in CI: seven jobs
       each timing out at 60 s inside a single `await`. A refusal is a fact the layer can act on — it
       falls back to the cached elements below and labels them — so make sure one arrives. */
    const grab=(url,ms)=>{
      const ac=(typeof AbortController!=='undefined')?new AbortController():null;
      const killer=setTimeout(()=>{ try{ ac&&ac.abort(); }catch(_){} },ms||FETCH_MS);
      return fetch(url,Object.assign({cache:'no-store'},ac?{signal:ac.signal}:{}))
        .then(r=>{ if(!r.ok) throw new Error('HTTP '+r.status); return r.text(); })
        .then(t=>{ if(!t||t.length<140) throw new Error('empty catalog'); return t; })
        .finally(()=>clearTimeout(killer));
    };
    /* ══ (#R185) FOUR WAYS TO THE SAME ELEMENT SETS, TRIED IN ORDER ═══════════════════════════
       The layer must not be able to end up empty (「何も表示されないのは論外」), and on 2026-08-01
       it did: one host, unreachable, nothing drawn. Each rung below is a genuinely different
       failure it survives — CelesTrak down (2, 3), this browser blocked from it (2), everything
       offline (4) — and each one is labelled, so what is on screen is never a mystery. */
    _inflight=(async()=>{
      const tried=[];
      /* THE SHIPPED CATALOGUE IS THE FLOOR, NOT THE LAST RESORT. Trying it only after the network
         had exhausted its timeouts meant up to a minute of empty map before anything appeared —
         which is the same "nothing on screen" outcome, just slower. It is SAME-ORIGIN and arrives
         in milliseconds, so it goes first, is painted immediately, and the live feed replaces it
         the moment that answers. Only for the full catalogue, because that is what it IS: serving
         it in answer to a request for "GPS" would answer a different question. */
      /* ══ (#R207) …AND IT IS THE FLOOR FOR EVERY CATEGORY, NOT ONLY FOR `active` ══════════════════
         「人工衛星レイヤーで、カテゴリ選択が機能していない。」 The condition used to be
         `want==='active'`, so with CelesTrak out (measured: "Failed to fetch" while Esri and USGS
         answer 200 from the same page) every OTHER catalogue ran the ladder, failed, and drew
         nothing — 16,099 objects to 0 on one change of the picker.
         The bundle IS the `active` set, so a subset request is answered by filtering it to the
         membership CelesTrak published for that group (data/tle/groups.json, built beside it).
         ⚠ NO LIST → NO CLAIM. A group the snapshot has no membership for is NOT approximated from
         object names; the ladder simply carries on to the live attempts, and if those fail too the
         error says which catalogue could not be reached. Serving "everything" in answer to "GPS"
         would be a wrong answer, which is worse than a labelled empty one. */
      let primedFromBundle=false;
      if(!sats.length){
        let only=null, haveList=(want==='active');
        if(!haveList){ try{ const ids=await bundledGroupIds(want);
          if(ids&&ids.length){ only=new Set(ids); haveList=true; } }catch(_){} }
        if(haveList){
          try{ const t=await grab(BUNDLED,15000);
            if(ingestTLE(t,want,only)){
              primedFromBundle=true; bundled=true;
              let when='';
              try{ const m=await fetch(BUNDLED_META).then(r=>r.ok?r.json():null);
                if(m){ bundledMeta=m; if(m.newestEpoch) when=' ('+String(m.newestEpoch).slice(0,10)+')'; } }catch(_){}
              lastErr='showing the catalog shipped with the app'+when+' while the live feed loads';
              try{ if(_onPrimed) _onPrimed(); }catch(_){}
            }
          }catch(e){ tried.push('bundled: '+String(e&&e.message||e)); }
        }
      }
      const live=(t)=>{ if(!ingestTLE(t,want)) return false;
        cachePut(want,t); bundled=false; bundledMeta=null; lastErr=null;
        try{ if(_onPrimed) _onPrimed(); }catch(_){} return true; };
      try{ const t=await grab(GP(want)); if(live(t)) return true; tried.push('celestrak: parsed nothing'); }
      catch(e){ tried.push('celestrak: '+String(e&&e.message||e)); }
      for(let i=0;i<PROXIES.length;i++){
        try{ const t=await grab(PROXIES[i](GP(want)),FETCH_MS);
          if(live(t)){ lastErr='CelesTrak was unreachable; elements came through a public mirror'; return true; }
          tried.push('proxy'+i+': parsed nothing');
        }catch(e){ tried.push('proxy'+i+': '+String(e&&e.message||e)); }
      }
      if(primedFromBundle){
        lastErr='live feed unreachable — showing the catalog shipped with the app'
          +(bundledMeta&&bundledMeta.newestEpoch?(' ('+String(bundledMeta.newestEpoch).slice(0,10)+')'):'');
        return true;
      }
      /* THE FEED REFUSED. A cache past its refresh age is still a better answer than an empty map:
         SGP4 keeps propagating from it and the card already reports the age of the elements it used,
         so the user sees stale-but-labelled rather than nothing at all. */
      try{ const j=JSON.parse(localStorage.getItem(CK)||'null');
        if(j&&j.g===want&&typeof j.a==='string'&&ingestTLE(j.a,want)){
          lastErr='live feed unreachable — using cached elements';
          try{ if(_onPrimed) _onPrimed(); }catch(_){} return true; }
      }catch(_){}
      lastErr=tried.join('; ')||'no catalog source answered';
      return false;
    })()
      .then(ok=>{ if(_inflightG===want){ loading=false; _inflight=null; _inflightG=null; } return ok; });
    return _inflight;
  }

  /* ── propagation ──────────────────────────────────────────────────────────────────────────── */
  /* The Sun, once per instant rather than once per satellite: sunPos() takes a JULIAN DATE (not a
     Date) and returns the geocentric vector in AU, which is exactly what shadowFraction wants. */
  function sunAt(t){ if(!SAT) return null; try{ return SAT.sunPos(SAT.jday(t)).rsun; }catch(_){ return null; } }

  /* One instant, every satellite. Returns the sub-satellite point plus the quantities the card
     shows — all of them computed here rather than copied from the feed, because the feed carries
     ELEMENTS, not positions. */
  /* ⚠⚠ (#R289) THE INSTANT IS CHRONOS'S, NOT `new Date()` ═══════════════════════════════════
     「時間で変わるものは、IntMapの統一時間にすべて合わせること。」 SGP4 takes an instant and this
     module was passing it the wall clock, so the one layer in the app whose whole content is a
     function of time was the one layer the time machine did not move. `IntMapTime.when()` IS the
     wall clock while the clock is live, so nothing about a normal session changes.
     ⚠ AND THE ELEMENT AGE IS MEASURED AGAINST THE SAME INSTANT (see elementAgeH), because the
     honesty of this layer rests on that number: an SGP4 fix propagated ten minutes and one
     propagated three weeks are different claims, and travelling makes the second kind common.
     The panel already prints it; it now prints the truth about the frame being drawn. */
  function clockNow(){ try{ const T=window.IntMapTime; if(T&&T.when) return T.when(); }catch(_){} return new Date(); }
  function propagateAll(when){
    if(!SAT) return [];
    const t=when||clockNow();
    const gmst=SAT.gstime(t), sun=sunAt(t);
    const out=[];
    let dropped=0;
    for(let i=0;i<sats.length;i++){
      const s=sats[i];
      try{
        const pv=SAT.propagate(s.satrec,t);
        if(!pv||!pv.position) continue;                       /* decayed / un-propagatable */
        const gd=SAT.eciToGeodetic(pv.position,gmst);
        const lat=SAT.degreesLat(gd.latitude), lng=SAT.degreesLong(gd.longitude);
        if(!isFinite(lat)||!isFinite(lng)) continue;
        /* ══ (#R185) SGP4 DIVERGES ON SOME ELEMENT SETS, AND IT DOES IT QUIETLY ═══════════════
           It reports no error and hands back a position; the position is simply not where the
           object is. Measured on the live catalogue: ASTROCAST-0201 came back at 9,244,632 km and
           MENUT at 238,361 km, both with a mean motion near 16 revolutions a day — which is a
           ninety-minute orbit and therefore a few hundred kilometres up. Drawing those is drawing
           a fabricated position, and it was invisible while the default catalogue was the 157
           bright objects.
           The test is the object's OWN orbit rather than a magic altitude: the semi-major axis
           SGP4 itself derived from the mean motion fixes the apogee at a(1+e), and a real fix
           cannot be far outside it. The margin is generous (1.5×) so perturbations, a stale
           element set and genuinely eccentric orbits all survive — EXPLORER 50 (IMP-8), which
           really is 270,956 km out on a 222,000 km semi-major axis, sits at 1.04× its apogee and
           stays. Below 80 km the object has re-entered and is likewise not there. */
        const altKm=gd.height;
        if(!(altKm>80)){ dropped++; continue; }
        const apoKm=(s.satrec.a>0)?(s.satrec.a*R_EARTH*(1+(s.satrec.ecco||0))):0;
        if(apoKm>0&&(R_EARTH+altKm)>apoKm*1.5){ dropped++; continue; }
        const v=pv.velocity?Math.hypot(pv.velocity.x,pv.velocity.y,pv.velocity.z):null;
        /* ══ (#R185) WHICH WAY IT IS GOING, ALONG THE GROUND ═══════════════════════════════════
           The aircraft layer turns its glyph to the track; a satellite icon that always points north
           is the one place this layer did not follow it. The heading is the azimuth of the velocity
           RELATIVE TO THE ROTATING EARTH, which is what a ground track is: rotate the inertial
           velocity into ECF and subtract the Earth's own rotation (ω × r, and ω is about z, so the
           cross product is two terms), then read it in the sub-satellite point's east-north frame.
           Exact, and ten multiplications — no second propagation. */
        let hdg=null;
        if(pv.velocity){
          try{
            const r=SAT.eciToEcf(pv.position,gmst), vv=SAT.eciToEcf(pv.velocity,gmst);
            const W=7.2921159e-5;                       /* rad s⁻¹, Earth's rotation rate */
            const vx=vv.x+W*r.y, vy=vv.y-W*r.x, vz=vv.z;
            const la=gd.latitude, lo=gd.longitude;
            const sl=Math.sin(la), cl=Math.cos(la), so=Math.sin(lo), co=Math.cos(lo);
            const east=-so*vx+co*vy;
            const north=-sl*co*vx-sl*so*vy+cl*vz;
            const a=Math.atan2(east,north)*R2D;
            if(isFinite(a)) hdg=((a%360)+360)%360;
          }catch(_){}
        }
        let lit=null;
        if(sun){ try{ const f=SAT.shadowFraction(sun,pv.position); if(isFinite(f)) lit=(f<0.5); }catch(_){} }
        /* ══ (#R202) WHERE IT WILL BE ONE SECOND FROM NOW — for free ═════════════════════════════
           The orbit layer carries the motion between propagations from a RATE, and the rate has to
           be in the same coordinates as the position. Propagating a second time would double the
           catalogue's SGP4 bill (21 ms → 42 ms); the ECI velocity SGP4 already returned gives the
           same answer to first order for nothing: advance the inertial position by v·1 s, advance
           GMST by the Earth's own rotation over that second, and read the geodetic point again.
           One extra eciToGeodetic per object, which is a few hundred nanoseconds. */
        let lng2=lng, lat2=lat, alt2=gd.height;
        if(pv.velocity){
          try{
            const g2=SAT.eciToGeodetic({x:pv.position.x+pv.velocity.x, y:pv.position.y+pv.velocity.y, z:pv.position.z+pv.velocity.z}, gmst+7.2921159e-5);
            const a2=SAT.degreesLat(g2.latitude), o2=SAT.degreesLong(g2.longitude);
            if(isFinite(a2)&&isFinite(o2)){ lat2=a2; lng2=o2; alt2=g2.height; }
          }catch(_){}
        }
        out.push({ id:s.id, name:s.name, intl:s.intl, epoch:s.epoch, deep:(s.satrec.method==='d'),
          lng, lat, altKm:gd.height, lng2, lat2, alt2Km:alt2, velKmS:v, headingDeg:hdg,
          eci:pv.position, eciV:pv.velocity, gmst,
          /* minutes per revolution, straight off the mean motion the elements carry */
          periodMin:s.satrec.no?(2*Math.PI/s.satrec.no):null,
          inclDeg:(s.satrec.inclo!=null)?s.satrec.inclo*R2D:null,
          ecc:s.ecc, bstar:s.bstar, revNum:s.revNum, classification:s.classification,
          sunlit:lit });
      }catch(_){}
    }
    _diverged=dropped;
    return out;
  }

  /* ── observer geometry ────────────────────────────────────────────────────────────────────────
     "Can I see it from here?" is a look-angle question, not a distance-on-screen question: a
     satellite 2,000 km up looks adjacent on a world map and is still under the horizon. */
  /* ══ ⚠⚠ (#R298) …AND «HERE» IS THE MAP'S CENTRE ON PURPOSE ═══════════════════════════════════════
     「地点を選ばないといけない系のツール、押したら勝手に地図中心を選択しているものとして結果を出すのを
       辞めろ。」 Five point tools were doing exactly that and now ask (js/map-ui.js `_askPoint`). This
     one is deliberately not one of them: it is not opened and then asked about a place — it is a LIVE
     LAYER whose answer changes as the camera moves, read off a hover over a moving dot, so the sky it
     describes is the sky over what is on screen. Stopping to ask for a tap on every hover would be a
     question with no reader waiting for it. What the report is really about — answering for a point
     nobody named — is met by SAYING which point: the hover card's 「地図中心から」 line and the detail
     card's 「From the map center」 section header both name this observer where its numbers are printed.
     ⚠ `at` IS THE DOOR FOR A CALLER THAT HAS A POINT. Atlas holds the exact spot the reader clicked
     (`_herePoint`) and asks this module 「ここから見えるか」 with nothing, so it answers about the camera
     instead; that call site is in another file. Given nothing, the behaviour is what it always was. */
  function observer(at){ try{ const c=(at&&isFinite(at.lng)&&isFinite(at.lat))?at:GE().camera.getCenter();
      return { longitude:c.lng*D2R, latitude:c.lat*D2R, height:0 }; }catch(_){ return null; } }
  function lookFrom(obs,f){
    if(!SAT||!obs||!f||!f.eci) return null;
    try{
      const ecf=SAT.eciToEcf(f.eci,f.gmst);
      const la=SAT.ecfToLookAngles(obs,ecf);
      let dop=null;
      try{ if(f.eciV) dop=SAT.dopplerFactor(SAT.geodeticToEcf(obs),ecf,SAT.eciToEcf(f.eciV,f.gmst)); }catch(_){}
      return { azDeg:((la.azimuth*R2D)%360+360)%360, elDeg:la.elevation*R2D, rangeKm:la.rangeSat, doppler:dop };
    }catch(_){ return null; }
  }
  /* THE NEXT PASS, by search rather than by formula. Coarse 30 s steps until the elevation crosses
     the horizon, then a bisection onto the crossing and a scan for the maximum. Bounded by
     `horizonH` hours so a satellite that simply never rises here says so instead of spinning. */
  function nextPass(id,fromT,horizonH,at){
    if(!SAT) return null;
    const obs=observer(at); if(!obs) return null;   /* (#R298) the caller's point when it has one */
    let s=null; for(let i=0;i<sats.length;i++) if(sats[i].id===id){ s=sats[i]; break; }
    if(!s) return null;
    const t0=(fromT||new Date()).getTime(), horizon=(horizonH||24)*3600000;
    const elAt=(ms)=>{ const t=new Date(ms);
      try{ const pv=SAT.propagate(s.satrec,t); if(!pv||!pv.position) return null;
        const la=SAT.ecfToLookAngles(obs,SAT.eciToEcf(pv.position,SAT.gstime(t)));
        return la.elevation*R2D; }catch(_){ return null; } };
    const STEP=30000;
    let prev=elAt(t0); if(prev==null) return null;
    /* already up → report the pass in progress, with its start left blank rather than guessed */
    let riseMs=null, inProgress=(prev>0);
    let ms=t0;
    if(!inProgress){
      while(ms-t0<horizon){ const nx=ms+STEP, e=elAt(nx);
        if(e==null){ ms=nx; continue; }
        if(prev<=0&&e>0){ let lo=ms, hi=nx;
          for(let k=0;k<24;k++){ const mid=(lo+hi)/2; const em=elAt(mid); if(em==null) break; if(em<=0) lo=mid; else hi=mid; }
          riseMs=hi; break; }
        prev=e; ms=nx; }
      if(riseMs==null) return { none:true, horizonH:horizonH||24 };
    }
    /* walk the pass to its maximum and its end */
    let cur=inProgress?t0:riseMs, maxEl=-90, maxMs=cur, setMs=null;
    for(let k=0;k<2*3600/30;k++){        /* 2 hours is longer than any real pass, GEO excepted */
      const e=elAt(cur); if(e==null) break;
      if(e>maxEl){ maxEl=e; maxMs=cur; }
      if(e<=0&&cur>(inProgress?t0:riseMs)+60000){ setMs=cur; break; }
      cur+=STEP;
    }
    return { none:false, inProgress, riseMs, maxMs, maxEl, setMs,
      durationS:(setMs&&(inProgress?t0:riseMs))?Math.round((setMs-(inProgress?t0:riseMs))/1000):null };
  }

  /* The circle on the ground from which this satellite is above the horizon. Real geometry, not a
     decoration: the Earth-centred half-angle is acos(Re / (Re + h)). */
  function footprintRing(lng,lat,altKm,n){
    const half=Math.acos(R_EARTH/(R_EARTH+Math.max(1,altKm)));   /* radians at the Earth's centre */
    const out=[], N=n||128, la1=lat*D2R, lo1=lng*D2R;
    for(let i=0;i<=N;i++){
      const brg=i*2*Math.PI/N;
      const la2=Math.asin(Math.sin(la1)*Math.cos(half)+Math.cos(la1)*Math.sin(half)*Math.cos(brg));
      const lo2=lo1+Math.atan2(Math.sin(brg)*Math.sin(half)*Math.cos(la1),Math.cos(half)-Math.sin(la1)*Math.sin(la2));
      out.push([((lo2*R2D+540)%360)-180, la2*R2D]);
    }
    return out;
  }

  /* One full orbit either side of now, split wherever it crosses the antimeridian so the line does
     not draw itself across the whole map. */
  function groundTrack(id,when){
    if(!SAT) return [];
    let s=null; for(let i=0;i<sats.length;i++) if(sats[i].id===id){ s=sats[i]; break; }
    if(!s) return [];
    const per=s.satrec.no?(2*Math.PI/s.satrec.no):95;        /* minutes */
    const t0=(when||new Date()).getTime(), step=Math.max(0.25,per/180);
    const segs=[]; let cur=[], prev=null;
    for(let k=-180;k<=180;k++){
      const t=new Date(t0+k*step*60000);
      try{
        const pv=SAT.propagate(s.satrec,t); if(!pv||!pv.position) continue;
        const gd=SAT.eciToGeodetic(pv.position,SAT.gstime(t));
        const lat=SAT.degreesLat(gd.latitude), lng=SAT.degreesLong(gd.longitude);
        if(!isFinite(lat)||!isFinite(lng)) continue;
        if(prev!=null&&Math.abs(lng-prev)>180){ if(cur.length>1) segs.push(cur); cur=[]; }
        cur.push([lng,lat]); prev=lng;
      }catch(_){}
    }
    if(cur.length>1) segs.push(cur);
    return segs;
  }

  /* ── rendering ────────────────────────────────────────────────────────────────────────────── */
  function ensureIcon(){
    try{
      if(GE().scene.hasImage('sat-icon')) return;
      /* Drawn at devicePixelRatio and DECLARED with it — the #R183 lesson from the aircraft glyph:
         an ImageData handed over without a pixelRatio is treated as CSS pixels and upscaled on every
         HiDPI screen. A satellite bus with two panels, with the same shadow-under / white-rim
         treatment that made the aircraft readable over bright imagery. */
      const dpr=Math.max(1,Math.min(3,Math.round(window.devicePixelRatio||1)));
      const s=40, cv=document.createElement('canvas');
      cv.width=s*dpr; cv.height=s*dpr;
      const c=cv.getContext('2d'); c.scale(dpr,dpr); c.translate(s/2,s/2);
      const body=()=>{ c.beginPath(); c.rect(-3.4,-5.2,6.8,10.4); c.closePath(); };
      const panel=(x)=>{ c.beginPath(); c.rect(x,-3.6,7.4,7.2); c.closePath(); };
      c.save(); c.shadowColor='rgba(0,0,0,0.55)'; c.shadowBlur=4; c.shadowOffsetY=1.4;
      c.fillStyle='rgba(0,0,0,0.5)'; body(); c.fill(); panel(-11.4); c.fill(); panel(4.0); c.fill(); c.restore();
      c.lineJoin='round'; c.strokeStyle='rgba(255,255,255,0.98)'; c.lineWidth=2.2;
      body(); c.stroke(); panel(-11.4); c.stroke(); panel(4.0); c.stroke();
      c.fillStyle='#ffd23f'; body(); c.fill();
      c.fillStyle='#3a7bd5'; panel(-11.4); c.fill(); panel(4.0); c.fill();
      GE().scene.addImage('sat-icon',c.getImageData(0,0,s*dpr,s*dpr),{pixelRatio:dpr});
    }catch(_){}
  }
  function ensureLayers(){
    const E=GE(); if(!E||!E.canDraw()) return false;
    try{
      ensureIcon();
      if(!E.layers.hasSource(SRC)) E.layers.addSource(SRC,{type:'geojson',data:{type:'FeatureCollection',features:[]}});
      if(!E.layers.hasSource(TRK_SRC)) E.layers.addSource(TRK_SRC,{type:'geojson',data:{type:'FeatureCollection',features:[]}});
      if(!E.layers.has(FOOT)) E.layers.add({ id:FOOT, type:'fill', source:TRK_SRC,
        filter:['==',['get','kind'],'foot'],
        paint:{ 'fill-color':'#ffd23f', 'fill-opacity':0.10 } });
      if(!E.layers.has(FOOTLN)) E.layers.add({ id:FOOTLN, type:'line', source:TRK_SRC,
        filter:['==',['get','kind'],'foot'],
        paint:{ 'line-color':'#ffd23f', 'line-width':1.2, 'line-opacity':0.55 } });
      if(!E.layers.has(TRK)) E.layers.add({ id:TRK, type:'line', source:TRK_SRC,
        filter:['==',['get','kind'],'track'], layout:{ 'line-cap':'round', 'line-join':'round' },
        paint:{ 'line-color':'#ffd23f', 'line-width':1.8, 'line-opacity':0.9, 'line-dasharray':[2,1.6] } });
      /* == (#R185) A CATALOGUE OF ELEVEN THOUSAND HAS TO READ AS A SKY, NOT AS A SWARM ==========
         The default is now every active object, and every one of them the same yellow dot is a
         texture rather than a picture. A soft halo underneath, coloured and sized by ORBIT REGIME,
         is what separates them: low orbit sweeps fast and close, the geostationary belt stands
         still over the equator, the navigation shells sit between. The regime is computed from the
         altitude the propagator returned — a fact about the orbit, not a decoration. */
      if(!E.layers.has(HALO)) E.layers.add({ id:HALO, type:'circle', source:SRC,
        paint:{ 'circle-color':['match',['get','band'],'geo','#ff8a3d','meo','#8f7bff','heo','#ff5c8a','#3ad1ff'],
                'circle-radius':['interpolate',['linear'],['zoom'],
                  1,['match',['get','band'],'geo',3.4,'meo',3,'heo',3,2.2],
                  6,['match',['get','band'],'geo',6.5,'meo',5.6,'heo',5.6,4.4]],
                'circle-blur':0.45,
                'circle-opacity':['*',opacity,['case',['==',['get','sunlit'],false],0.35,0.72]] } });
      if(!E.layers.has(LYR)) E.layers.add({ id:LYR, type:'symbol', source:SRC, layout:{
        'icon-image':'sat-icon',
        /* (#R185) ...and the icon turns to the direction of travel, which is what the aircraft layer
           does and what 「Live aircraft trafficの要領で」 asks for. `hdg` is the azimuth of the
           ground track, computed in propagateAll from the velocity relative to the rotating Earth. */
        'icon-rotate':['coalesce',['get','hdg'],0],
        'icon-rotation-alignment':'map',
        'icon-size':['interpolate',['linear'],['zoom'],1,0.5,4,0.72,8,0.9],
        'icon-allow-overlap':true, 'icon-ignore-placement':true },
        paint:{ 'icon-opacity':['*',opacity,['case',['==',['get','sunlit'],false],0.55,1]] } });
      /* Names only where they can be read — at low zoom a catalogue of 5,000 labels is a grey band. */
      if(!E.layers.has(LBL)) E.layers.add({ id:LBL, type:'symbol', source:SRC, minzoom:3,
        /* (#R185) `text-optional` stops a name from hiding its icon; it does not stop MapLibre from
           CONSIDERING eleven thousand of them every frame. Name the selected object always, and the
           rest only while the catalogue is small enough for names to be readable at all. */
        filter:['any',['==',['get','sel'],1],['==',['get','lbl'],1]], layout:{
        'text-field':['get','name'], 'text-size':window.IntMapLabelScale.sub(0.86), 'text-offset':[0,1.3], 'text-anchor':'top',
        'text-allow-overlap':false, 'text-optional':true },
        paint:{ 'text-color':'#ffd23f', 'text-halo-color':'rgba(0,0,0,0.85)', 'text-halo-width':1.4,
                'text-opacity':opacity } });
      /* (#R202) the orbit cloud, added LAST so it draws over the map and is depth-tested against the
         globe the renderer has already drawn. An engine that cannot do it says so — the ground
         layers above are then the whole of the picture, which is what every engine had before. */
      /* ⚠ ASK THE RENDERER, not a flag we set once. `ensureLayers` re-asserts every other layer on
         every paint for exactly this reason: a style operation can take a layer away, and a boolean
         that remembers "we added it" would then never add it back. `orbOn` records whether the
         ENGINE CAN do this at all — the layer's presence is a separate question with its own answer. */
      let there=false; try{ there=E.layers.has(ORB); }catch(_){ there=false; }
      if(there) orbOn=true;
      else { try{ orbOn=!!E.layers.addOrbit(ORB); }catch(_){ orbOn=false; } }
      return true;
    }catch(e){ lastErr=String(e&&e.message||e); return false; }
  }
  /* the colour and size each object is drawn with in orbit — the same regime palette the ground
     halo uses, so the two readings of one catalogue cannot disagree */
  const ORB_RGB={ geo:[255,138,61], meo:[143,123,255], heo:[255,92,138], leo:[58,209,255] };
  const ORB_PX={ geo:5.2, meo:4.6, heo:4.6, leo:3.8 };
  function paintOrbit(list){
    if(!orbOn) return;
    const n=list.length;
    const pack=new Array(n);
    const ma=new Float32Array(n*3), rt=new Float32Array(n*3), ids=new Array(n);
    for(let i=0;i<n;i++){
      const f=list[i], b=bandOf(f), c=ORB_RGB[b]||ORB_RGB.leo;
      const sel=(f.id===selected);
      const a=Math.round(255*opacity*(f.sunlit===false?0.42:0.92));
      pack[i]={ lng:f.lng, lat:f.lat, altKm:f.altKm, lng2:f.lng2, lat2:f.lat2, alt2Km:f.alt2Km,
        rgba:sel?[255,255,255,Math.max(a,200)]:[c[0],c[1],c[2],a], size:sel?(ORB_PX[b]+4):(ORB_PX[b]||3.8) };
      /* the pick's own copy, in the coordinates layers.projectMercAlt takes */
      const m=_merc(f.lng,f.lat), m2=_merc(f.lng2,f.lat2);
      ma[i*3]=m[0]; ma[i*3+1]=m[1]; ma[i*3+2]=f.altKm*1000;
      let dx=m2[0]-m[0]; if(dx>0.5) dx-=1; else if(dx<-0.5) dx+=1;
      rt[i*3]=dx; rt[i*3+1]=m2[1]-m[1]; rt[i*3+2]=(f.alt2Km-f.altKm)*1000;
      ids[i]=f.id;
    }
    orbAt=(typeof performance!=='undefined'&&performance.now)?performance.now():Date.now();
    orbMercAlt=ma; orbRate=rt; orbIds=ids;
    try{ GE().layers.setOrbit(ORB,{ list:pack, t0:orbAt, visible:on, opacity }); }catch(_){}
  }
  /* mercator [0..1], unclamped in y — the same map js/orbit-points.js uses, restated here because
     the pick must land on the pixel the shader drew and a second definition would drift from it */
  function _merc(lng,lat){
    const x=(180+lng)/360;
    const p=Math.max(-89.9999,Math.min(89.9999,lat))*Math.PI/180;
    return [x,(180-(180/Math.PI)*Math.log(Math.tan(Math.PI/4+p/2)))/360];
  }
  /* ⚠ (#R266) THIS USED TO BE A FILTER, AND THE FILTER IS GONE BY INSTRUCTION («ここから見えるものだけ、
     チェックはいらない»). Everything propagated is drawn; `shown()` is kept as the ONE name the picker,
     the source builder and `state().drawn` all read, so «what is on the map» has a single definition
     rather than three call sites that each decide for themselves. The horizon geometry lives on in
     `lookFrom` / `nextPass` / `footprintRing`, which answer questions about ONE satellite. */
  function shown(){ return fixes; }
  function paint(){
    /* PROPAGATE FIRST, DRAW SECOND. The positions are this layer's data; the renderer is only where
       they are put. Bailing out before computing them (which is what an `if(!ensureLayers()) return`
       at the top does) leaves the whole layer with nothing to report for as long as the style is
       still parsing — the legend said "0 / 157 shown" while 157 objects were perfectly computable,
       and every read of state() during that window was wrong rather than merely undrawn. */
    fixes=propagateAll();
    if(!ensureLayers()){ try{ if(window.IntMapSatPanel&&window.IntMapSatPanel.isOpen()) window.IntMapSatPanel.refresh(); }catch(_){} return; }
    const list=shown();
    try{
      const named=list.length<=LABEL_MAX?1:0;
      GE().layers.setSourceData(SRC,{ type:'FeatureCollection', features:list.map(f=>({
        type:'Feature', geometry:{ type:'Point', coordinates:[f.lng,f.lat] },
        properties:{ id:f.id, name:f.name, sunlit:f.sunlit, altKm:Math.round(f.altKm),
          hdg:(f.headingDeg==null?0:Math.round(f.headingDeg)), band:bandOf(f), lbl:named,
          sel:(f.id===selected)?1:0 } })) });
    }catch(_){}
    paintOrbit(list);
    paintSelection();
    try{ if(window.IntMapSatPanel&&window.IntMapSatPanel.isOpen()) window.IntMapSatPanel.refresh(); }catch(_){}
  }
  function paintSelection(){
    const feats=[];
    if(selected!=null){
      let f=null; for(let i=0;i<fixes.length;i++) if(fixes[i].id===selected){ f=fixes[i]; break; }
      if(f){
        groundTrack(selected).forEach(seg=>{
          feats.push({ type:'Feature', geometry:{ type:'LineString', coordinates:seg }, properties:{ kind:'track' } });
        });
        feats.push({ type:'Feature', geometry:{ type:'Polygon', coordinates:[footprintRing(f.lng,f.lat,f.altKm)] }, properties:{ kind:'foot' } });
      }
    }
    try{ GE().layers.setSourceData(TRK_SRC,{ type:'FeatureCollection', features:feats }); }catch(_){}
  }
  function setOpacity(v){ opacity=Math.max(0,Math.min(1,+v||0));
    try{ const E=GE();
      if(E.layers.has(LYR)) E.layers.setPaint(LYR,'icon-opacity',['*',opacity,['case',['==',['get','sunlit'],false],0.55,1]]);
      if(E.layers.has(HALO)) E.layers.setPaint(HALO,'circle-opacity',['*',opacity,['case',['==',['get','sunlit'],false],0.35,0.72]]);
      if(E.layers.has(LBL)) E.layers.setPaint(LBL,'text-opacity',opacity);
      if(orbOn) E.layers.setOrbit(ORB,{opacity});          /* (#R202) the cloud follows the same slider */
    }catch(_){}
    return opacity; }

  /* ── picking ──────────────────────────────────────────────────────────────────────────────────
     Nearest satellite to a screen point, in SCREEN space — the same rule the aircraft pick uses, so
     "click the thing you can see" means the same in both layers. */
  function pickAt(pt,radiusPx){
    const E=GE(); if(!E||!pt) return null;
    const R=radiusPx||18;
    /* ⚠ (#R202) THE PICK FOLLOWS THE DRAWING. While the orbit cloud is up, the pixel an object
       occupies is its position AT ALTITUDE, which on a globe is nowhere near its ground point — the
       #R184 defect the aircraft layer had, one level up. layers.projectMercAlt runs the SAME
       matrix the shader used over the whole array at once (a per-point projectAltitude would build
       eleven thousand model matrices in one mouse move), and the rate is applied here too so the
       answer matches the frame on screen rather than the last propagation. */
    if(orbOn&&orbMercAlt&&orbIds){
      const now=(typeof performance!=='undefined'&&performance.now)?performance.now():Date.now();
      const dt=Math.max(0,Math.min(4,(now-orbAt)/1000));
      const n=orbIds.length, q=new Float32Array(n*3);
      for(let i=0;i<n;i++){
        q[i*3]=orbMercAlt[i*3]+orbRate[i*3]*dt;
        q[i*3+1]=orbMercAlt[i*3+1]+orbRate[i*3+1]*dt;
        q[i*3+2]=orbMercAlt[i*3+2]+orbRate[i*3+2]*dt;
      }
      let scr=null; try{ scr=E.layers.projectMercAlt(q); }catch(_){}
      if(scr){
        let best=null, bestD=R*R;
        for(let i=0;i<n;i++){
          const x=scr[i*2], y=scr[i*2+1];
          if(!isFinite(x)||!isFinite(y)) continue;
          const dx=x-pt.x, dy=y-pt.y, d=dx*dx+dy*dy;
          if(d<bestD){ bestD=d; best=orbIds[i]; }
        }
        if(best!=null) return best;
      }
    }
    const list=shown(); let best=null, bestD=R*R;
    for(let i=0;i<list.length;i++){
      const f=list[i];
      let p=null; try{ p=E.coords.project([f.lng,f.lat]); }catch(_){}
      if(!p) continue;
      const dx=p.x-pt.x, dy=p.y-pt.y, q2=dx*dx+dy*dy;
      if(q2<bestD){ bestD=q2; best=f; }
    }
    return best?best.id:null;
  }
  function select(id){ selected=(id==null)?null:id; paintSelection();
    try{ const E=GE(); if(E.layers.has(LYR)) E.layers.setSourceData(SRC,{ type:'FeatureCollection',
      features:shown().map(f=>({ type:'Feature', geometry:{ type:'Point', coordinates:[f.lng,f.lat] },
        properties:{ id:f.id, name:f.name, sunlit:f.sunlit, altKm:Math.round(f.altKm), sel:(f.id===selected)?1:0 } })) }); }catch(_){}
    return selected; }
  function get(id){ for(let i=0;i<fixes.length;i++) if(fixes[i].id===id) return fixes[i]; return null; }
  /* How old are the elements this position came from? An SGP4 fix propagated ten minutes and one
     propagated three weeks are different claims, and the card says which it is showing. */
  function elementAgeH(f){
    try{ const raw=(f&&f.epoch)?String(f.epoch):'';
      if(!raw) return null;
      const e=Date.parse(/[Zz]|[+-]\d\d:?\d\d$/.test(raw)?raw:(raw+'Z'));
      return isFinite(e)?(clockNow().getTime()-e)/3600000:null; }catch(_){ return null; }   /* (#R289) against the frame's own instant */
  }

  /* ── tooltip ───────────────────────────────────────────────────────────────────────────────── */
  function tooltipHTML(f){
    const obs=observer(), la=lookFrom(obs,f);
    const up=!!(la&&la.elDeg>0);
    const n0=(v)=>Math.round(v).toLocaleString(window.IntMapLang.locale(HOST.lang));
    return '<div style="font-weight:700;margin-bottom:2px;">🛰 '+S(f.name||('#'+f.id))+'</div>'
      +'<div>'+S(L('Altitude','高度','Höhe','Высота','Altitud'))+': '+n0(f.altKm)+' km'
      +(f.velKmS?(' · '+f.velKmS.toFixed(2)+' km/s'):'')+'</div>'
      +(f.periodMin?('<div>'+S(L('Period','周期','Umlaufzeit','Период','Periodo'))+': '+f.periodMin.toFixed(1)+' min · '+S(L('incl.','傾斜角','Neig.','накл.','incl.'))+' '+(f.inclDeg==null?'—':f.inclDeg.toFixed(1)+'°')+'</div>'):'')
      +(la?('<div>'+S(L('From the map center','地図中心から','Von der Kartenmitte','От центра карты','Desde el centro'))+': '
          +S(L('elev.','仰角','Elev.','возв.','elev.'))+' '+la.elDeg.toFixed(1)+'° · '+S(L('az.','方位','Az.','азим.','az.'))+' '+la.azDeg.toFixed(0)+'° · '+n0(la.rangeKm)+' km</div>'):'')
      /* ⚠ (#R298) NO OBSERVER, NO HORIZON CLAIM. `up` is false both when the satellite is under the
         horizon and when `lookFrom` returned nothing at all, so this line printed 「ここでは地平線の下」
         for a look angle that was never computed — an answer manufactured out of a failure. The part
         that belongs to the satellite itself (sunlit / in eclipse) is true either way and stays. */
      +((la||f.sunlit!=null)?('<div style="color:'+(up?'#30d158':'var(--text-muted)')+';">'
        +(la?S(up?L('Above the horizon here','ここでは地平線の上','Über dem Horizont','Над горизонтом','Sobre el horizonte')
                 :L('Below the horizon here','ここでは地平線の下','Unter dem Horizont','Под горизонтом','Bajo el horizonte')):'')
        +(f.sunlit==null?'':((la?' · ':'')+S(f.sunlit?L('sunlit','太陽光を受けている','sonnenbeschienen','освещён Солнцем','iluminado'):L('in eclipse','影の中','im Erdschatten','в тени Земли','en eclipse'))))+'</div>'):'')
      +'<div style="font-size:10px;color:var(--text-muted);margin-top:4px;border-top:1px solid rgba(128,128,128,0.18);padding-top:3px;">'
      +(bundled?S(L('Bundled catalog','同梱カタログ','Mitgelieferter Katalog','Встроенный каталог','Catálogo incluido')):'CelesTrak')
      +' · SGP4/SDP4</div>';
  }

  /* ── lifecycle ────────────────────────────────────────────────────────────────────────────── */
  function tick(){
    if(!on) return;
    /* Elements refresh on the timescale they actually change; positions are recomputed locally every
       second. A satellite layer that re-fetched to move a dot would be pointless traffic. */
    if(Date.now()-tleAt>2*3600*1000&&!loading) load(group).then(()=>{ paint(); });
    else paint();
  }
  function wire(){
    const E=GE(); if(!E) return;
    if(!_hover){ _hover=(e)=>{
      if(!on||!e||!e.point) return;
      const id=pickAt(e.point,18);
      const el=window.ensureMapTooltip?window.ensureMapTooltip():null; if(!el) return;
      if(id==null){ if(el.dataset.owner==='sats'){ el.style.display='none'; el.dataset.owner=''; } return; }
      const f=get(id); if(!f) return;
      el.dataset.owner='sats'; el.style.display='block'; el.innerHTML=tooltipHTML(f);
      try{ window.positionTooltip&&window.positionTooltip(e.point); }catch(_){}
    }; try{ E.events.on('mousemove',_hover); }catch(_){} }
    if(!_click){ _click=(e)=>{
      if(!on||!e||!e.point) return;
      const id=pickAt(e.point,20);
      if(id==null){ if(selected!=null) select(null); return; }
      try{ E.events.claimClick&&E.events.claimClick(e); }catch(_){}   /* (#R210) the satellite owns this tap */
      select(id);
      try{ const P=window.IntMapSatPanel; if(P) P.open(id); }catch(_){}
    }; try{ E.events.on('click',_click); }catch(_){} }
    /* the "visible from here" filter and the look angles on the card are both relative to the map
       centre, so a pan has to re-evaluate them */
    if(!_onMove){ _onMove=()=>{ if(!on) return; clearTimeout(_moveT); _moveT=setTimeout(()=>{ try{ paint(); }catch(_){} },250); };
      try{ E.events.on('moveend',_onMove); }catch(_){} }
  }
  function unwire(){
    const E=GE(); if(!E) return;
    try{ if(_hover) E.events.off('mousemove',_hover); }catch(_){} _hover=null;
    try{ if(_click) E.events.off('click',_click); }catch(_){} _click=null;
    try{ if(_onMove) E.events.off('moveend',_onMove); }catch(_){} _onMove=null;
  }
  function start(){
    on=true; wire();
    /* (#R185) ONE SECOND IS RIGHT FOR A HUNDRED OBJECTS AND WRONG FOR ELEVEN THOUSAND. Propagation
       is cheap (measured 1.94 us each, so 21 ms for the whole active catalogue), but each tick also
       rebuilds that many GeoJSON features and hands them to the renderer to re-tile. So the period
       follows the catalogue: a low-orbit satellite moves ~7.7 km/s, which at a world view is well
       under a pixel a second, and a larger catalogue therefore loses nothing visible by stepping at
       two or three seconds while getting the frame budget back. */
    const period=()=>(sats.length>6000?3000:sats.length>2000?2000:1000);
    const go=()=>{ paint(); try{ ALL_LAYERS.forEach(id=>{ if(GE().layers.has(id)) GE().layers.setVisible(id,true); }); }catch(_){}
      if(timer) stopTick(timer);
      timer=everyTick('satellites-live:tick',period(),tick); };
    /* go as soon as ANY source has answered — see _onPrimed */
    _onPrimed=()=>{ if(on) go(); };
    if(!sats.length) load(group).then(ok=>{ if(ok) go(); else { try{ HOST.imToast(L('Could not load the satellite catalog.','衛星カタログを取得できませんでした。','Satellitenkatalog nicht abrufbar.','Не удалось загрузить каталог спутников.','No se pudo cargar el catálogo de satélites.')); }catch(_){} } });
    else go();
    return true;
  }
  function stop(){
    on=false; _onPrimed=null;
    if(timer){ stopTick(timer); timer=null; }
    unwire();
    const E=GE(); if(!E) return true;
    try{ ALL_LAYERS.forEach(id=>{ if(E.layers.has(id)) E.layers.setVisible(id,false); }); }catch(_){}
    try{ if(orbOn) E.layers.setOrbit(ORB,{visible:false}); }catch(_){}
    try{ const el=window.ensureMapTooltip&&window.ensureMapTooltip(); if(el&&el.dataset.owner==='sats'){ el.style.display='none'; el.dataset.owner=''; } }catch(_){}
    try{ const P=window.IntMapSatPanel; if(P&&P.isOpen()) P.close(); }catch(_){}
    return true;
  }
  function setGroup(g){
    const ok=GROUPS.some(x=>x.id===g);
    if(!ok||g===group) return group;
    group=g; sats=[]; fixes=[]; selected=null; tleAt=0;
    if(on) load(group).then(()=>{ paint(); });
    return group;
  }

  /* Find one satellite by name / NORAD id / international designator — what Atlas needs to answer
     「ISSはどこ？」 without the user having to click a dot. */
  function find(q){
    const s=String(q||'').trim().toUpperCase(); if(!s) return null;
    if(/^\d+$/.test(s)){ const n=+s; const byId=fixes.find(f=>+f.id===n); if(byId) return byId; }
    return fixes.find(f=>(f.name||'').toUpperCase()===s)
      ||fixes.find(f=>(f.intl||'').toUpperCase()===s)
      ||fixes.find(f=>(f.name||'').toUpperCase().indexOf(s)>=0)||null;
  }

  /* ══ ⚠⚠ (#R322) WHAT `stop()` KEEPS ON PURPOSE, AND WHAT NOTHING EVER RELEASED ═══════════════
     `stop()` is a good SUSPEND and always was: the interval is cleared, the three map listeners come
     off (`unwire`), the layers go invisible and the detail panel closes. What it keeps is the
     CATALOGUE — up to eleven thousand propagated records — and that is the right trade for a layer
     the reader is likely to switch back on. It was also the only trade available: nothing in the
     app could ask for the memory back.

     `dispose` is that ask. The catalogue, the derived fixes and the map layers go; the next
     `activate` re-loads exactly as a first open does (`start()` already handles `!sats.length`), so
     nothing here can make the feature un-openable — the failure mode #R322 found in the register
     itself, one layer up. */
  function disposeSats(){
    stop();
    sats=[]; fixes=[]; selected=null; tleAt=0;
    const E=GE(); if(E){
      try{ ALL_LAYERS.forEach(id=>{ if(E.layers.has(id)) E.layers.remove(id); }); }catch(_){}
      try{ E.layers.removeOrbit(ORB); }catch(_){}
    }
    /* the tile worker is shared with the satellite BASEMAP, so it is not this layer's to terminate */
    return true;
  }
  try{
    const RT=window.IntMapRuntime;
    if(RT&&RT.define) RT.define('sat.live',{ activate:start, suspend:stop, dispose:disposeSats });
  }catch(_){}

  /* ⚠ see the note in js/tsunami.js: the PUBLIC door goes through the register and the definition
     above names the INTERNAL one, or activate would call start which would call activate. */
  function startPublic(){
    const RT=window.IntMapRuntime;
    if(RT&&RT.stateOf&&RT.stateOf('sat.live')!==null){ RT.activate('sat.live'); return true; }
    return start();
  }
  function stopPublic(){
    const RT=window.IntMapRuntime;
    if(RT&&RT.stateOf&&RT.stateOf('sat.live')!==null){ RT.suspend('sat.live'); return true; }
    return stop();
  }
  const API={
    start:startPublic, stop:stopPublic, dispose:disposeSats, isOn:()=>on,
    groups:()=>GROUPS.map(g=>({ id:g.id, kb:g.kb, name:g.nm() })),
    group:()=>group, setGroup,
    setOpacity, opacity:()=>opacity,
    reload(){ tleAt=0; return load(group).then(ok=>{ if(on) paint(); return ok; }); },
    /* (#R289) re-propagate at the current master instant — what the clock subscriber calls */
    refresh(){ if(on) paint(); return on; },
    pickAt, select, selected:()=>selected, get, find,
    list:()=>fixes.slice(), shown,
    /* REAL positions without turning the layer on — what the Layers-panel preview tile paints, and
       what a test can assert against with no map at all. Loads the catalogue once if it has to; the
       positions are propagated, never fetched, so a second call costs nothing. */
    snapshot(when){
      if(sats.length) return Promise.resolve(propagateAll(when));
      return load(group).then(ok=>ok?propagateAll(when):[]);
    },
    footprintRing, groundTrack, elementAgeH, nextPass, lookFrom, observer,
    /* diagnostics — Atlas and the tests read these instead of poking at the renderer (#R183: a
       GeoJSON source's data is not readable back out of MapLibre 5, so it would lie) */
    state:()=>({ on, group, catalogue:sats.length, drawn:shown().length, computed:fixes.length,
      /* (#R289) the instant these positions are for, and how far it is from now — a reader who has
         travelled is looking at a propagation, not at a report, and this is what says so. */
      when:clockNow().toISOString(), clockOffsetH:+(((clockNow().getTime()-Date.now())/3600000).toFixed(2)),
      selected, opacity,
      tleAgeH:tleAt?(Date.now()-tleAt)/3600000:null, loading, err:lastErr,
      bundled, bundledSource:(bundledMeta&&bundledMeta.source)||null,
      bundledEpoch:(bundledMeta&&bundledMeta.newestEpoch)||null,
      diverged:_diverged,
      sunlit:fixes.filter(f=>f.sunlit===true).length,
      deepSpace:fixes.filter(f=>f.deep).length,
      layerVisible:(()=>{ try{ return !!(GE().layers.has(LYR)&&GE().layers.isVisible(LYR)); }catch(_){ return false; } })() }),
    _propagateAll:propagateAll, _layers:()=>ALL_LAYERS.slice(), _sunAt:sunAt
  };
  window.IntMapSatellites=API;
  return API;
};
