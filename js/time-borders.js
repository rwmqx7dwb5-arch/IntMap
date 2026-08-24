/* ============================================================================
 *  IntMap · Historical borders on the time axis — IntMapTimeBorders  (#R163)
 * ----------------------------------------------------------------------------
 *  Replaces the modern country polygons with the era's ones when the clock moves to a past year
 *  (aourednik/historical-basemaps snapshots), including the era-name index and point-in-polygon lookups.
 *
 *  Moved verbatim out of index.html's DOMContentLoaded closure (#R163). The values it used
 *  to inherit from that closure are now passed in explicitly — see Architecture.md §3.1.
 *   Reassigned at runtime, so read LIVE through HOST (never captured):
 *      currentLang -> HOST.lang
 *  Never rebound, so bound once under the original name:
 *      applyTheme, countryStats, showCountryDetail
 * 
 *  The CSS stays in css/intmap.css; this file adds no <style>.
 * ==========================================================================*/
window.IntMapModules=window.IntMapModules||{};
window.IntMapModules.timeBorders=function(HOST){
  /* ⚠ (#R245) THE HISTORICAL NAMES THIS FILE HOLDS ARE TUPLES, AND THEY GO THROUGH THE REGISTRY.
     `LA` is `IntMapLang.pickArgs()` — it returns the array it is given, so the data is unchanged and
     the file now contains ordinary CALLS that every translation instrument reads; `_LTB.arr(x)` is
     `pick()` itself, so a language past the five positional slots reaches its inline table keyed by
     the English name instead of falling to English for ever (#R244's eleventh shape). */
  const LA=window.IntMapLang.pickArgs();
  const _LTB=window.IntMapLang.pick(()=>HOST.lang);
  /* (#R178) module state, not renderer state — it was map.__imtbClick (see data-layers.js) */
  let _clickWired=false;
 const GE=()=>window.IntMapGeoEngine;   /* (#R178) the renderer, through the contract — never the raw handle */

  /* (#R170) "Is it safe to addSource/addLayer right now?" — the app-wide predicate declared in index.html.
     A function DECLARATION so nested closures above this line can call it (no TDZ). Falls back to the old
     isStyleLoaded() test only if the host is somehow absent. */
  function _imCanDraw(){ try{ return !!HOST.canDraw(); }catch(_){ try{ return !!GE().ready(); }catch(__){ return false; } } }
  /* ══ ⚠⚠⚠ (#R421) THIS FUNCTION WAS CALLED FOUR TIMES AND DEFINED NOWHERE ═══════════════════════
     `whenStyleReady()` is #R140's fix for 「歴史的国境が表示されない・再読み込みで治る」: when the style is
     mid-load, `apply()` and `go()` are supposed to DEFER and repaint once it is ready, instead of
     giving up and leaving the era borders absent until a reload. It lives in js/data-layers.js as a
     MODULE-LOCAL function, and #R163 moved this file out of the index.html closure where the name
     used to resolve — so from that round on all four call sites threw `ReferenceError: whenStyleReady
     is not defined`. MEASURED on this build before the fix: 6 uncaught rejections per boot, and the
     retry has therefore never once run. Three of the four sites are inside `try{}catch(_){}`, which is
     exactly why it stayed silent: the catch swallowed the ReferenceError and looked like "no retry
     needed". ⚠ A mechanism that throws on its first line is not a weaker safety net — it is none.
     Same shape as the canonical one (listen + poll + hard-resolve after ~6 s, because addSource works
     as soon as the style object exists and a slightly-early add beats a layer that never appears),
     built on THIS file's own `_imCanDraw()` so there is no second notion of "can I draw yet". */
  function whenStyleReady(){
    return new Promise(res=>{
      let done=false;
      const fin=()=>{ if(done) return; done=true; try{ GE().events.off('idle',ck); GE().events.off('styledata',ck); GE().events.off('load',ck); }catch(_){} res(); };
      const ck=()=>{ if(_imCanDraw()) fin(); };
      if(_imCanDraw()){ res(); return; }
      try{ GE().events.on('idle',ck); GE().events.on('styledata',ck); GE().events.on('load',ck); }catch(_){}
      let n=0; (function poll(){ if(done) return; if(_imCanDraw()||n++>40) fin(); else setTimeout(poll,150); })();
    });
  }
  const applyTheme=HOST.applyTheme, countryStats=HOST.countryStats, showCountryDetail=HOST.showCountryDetail;
  return (function(){
    if(!GE().hasRenderer()||!GE().hasRenderer()||!window.IntMapTime) return {};
    /* (#R349) 1815 and 1880 are new. The clock's floor moved to 1850 (js/chronos.js) and CShapes —
       the YEARLY source below — starts at 1886, so without these two the whole of 1850-1885 had no
       era polygons at all and would have rendered the PRESENT-DAY world under a 19th-century year.
       They are the only two the upstream repo has in that reach: world_1815 and world_1880 exist,
       nothing between them does, so 1850-1885 is honestly a two-frame range and the Sources page
       says so. */
    const YEARS=[1815,1880,1900,1914,1920,1930,1938,1945,1960,1994,2000,2010];
    const PROX=[x=>x, x=>'https://corsproxy.io/?url='+encodeURIComponent(x), x=>'https://api.allorigins.win/raw?url='+encodeURIComponent(x)];
    const cache=new Map(); let active=false, shownY=null, seq=0, shownCorr=false;   /* (#R106) shownCorr = the Tibet display-year merge state (see _eraCorrect) */
    /* (#R410) the YEAR the reader is on (shownY is the SNAPSHOT key, and one aourednik snapshot answers many
       years), and the collection currently on the source — the two things a re-tag of the labels needs. */
    let shownYear=null, shownFC=null;
    /* (#R94o) CLOSEST snapshot, not just the closest ≤ year — so a mid-gap year like 1910 shows the 1914 borders
       (Japan's southern Sakhalin/Karafuto, held since 1905) instead of the staler 1900, i.e. borders change at the
       gap midpoint, roughly halving how long a year is shown with the "wrong" borders. A FORWARD jump is only
       taken across a MODEST gap (≤ MAXGAP yr); the huge 1960→1994 gap keeps the earlier snapshot so the 1980s
       never render a post-Soviet world (the faithful state DATES already live in IntMapHistStates). */
    const MAXGAP=20;
    const nearest=y=>{ let prev=null,next=null; for(const yy of YEARS){ if(yy<=y){ if(prev===null||yy>prev) prev=yy; } else if(next===null||yy<next) next=yy; }
      if(prev===null) return next!=null?next:YEARS[0];
      if(next===null) return prev;
      if((next-y)>=(y-prev)) return prev;
      /* ⚠ (#R349) MAXGAP GUARDS A FALLBACK, NOT A SOURCE — so it does not apply below CShapes.
         Above CS_MIN these snapshots only run when data/cshapes.js failed to load, and the guard is
         there so that degraded mode never answers 1980 with the post-Soviet 1994 map. BELOW CS_MIN
         they are not a fallback: they are the only borders that exist, so the nearer of the two
         neighbours is simply the best available answer and refusing it would answer 1875 with the
         Congress-of-Vienna map — sixty years stale — for no gain. The 1815/1880 gap is 65 years
         wide, which is exactly what would have tripped the guard. */
      return (y<CS_MIN || (next-prev)<=MAXGAP) ? next : prev; };
    /* ===== (#R117) DAY-EXACT borders 1886–2019 from CShapes 2.0 (Schvitz et al. 2022, ETH Zürich — international
       borders with per-feature validity DATES). Self-hosted simplified copy (data/cshapes.js, ring-pooled).
       aourednik snapshots remain the automatic FALLBACK (and nothing else about that path was removed).
       ══ (#R421) …AND UNTIL NOW THE DATES WERE THROWN AWAY AT THE LAST STEP ═══════════════════════
       「歴史国境の更新ペースをさらに細かくして。理想は月日単位。特に20s前半が荒い。」 The selector below
       asked "was this feature alive on JULY 1 of `year`?" — one sample per calendar year — even though
       every record carries `sy,sm,sd → ey,em,ed`. Measured on the shipped bundle: 710 records span
       365 DISTINCT transition dates but only 104 distinct years, so the July-1 convention discarded
       ~72% of the border changes IntMap already had on disk. 1920 is the worst year in the file —
       13 transition dates (Tartu 1/12, Sèvres 7/23, Bessarabia 10/28, …) collapsing to 5 genuinely
       different worlds, of which July 1 showed exactly ONE.
       ⚠ THE CLOCK AND THE MAP DISAGREED, TOO. `IntMapTime.setYear(y)` sets JUNE 15 (chronos.js), and
       for 1920 the June-15 world has 166 entities while the July-1 world has 167 — so the year slider
       drew a world sixteen days ahead of the instant it claimed to be showing. Reading the clock's own
       Y-M-D removes the second convention instead of reconciling it.
       ⚠ LOCAL getters, not `e.iso`. `ymdISO` is `toISOString()` = UTC, so a date picked as 1920-10-28
       east of Greenwich would arrive here as 10-27 — the user would name a date and get the day before.
       `e.year` is already `getFullYear()` (local); the month and day now come from the same place. */
    const CS_MIN=1886, CS_MAX=2019;
    /* (#R421) every instant on which the world changes, as sortable YYYYMMDD ints. Both edges: a record's
       START, and the day AFTER its END (a state that vanishes with no successor record still ends an epoch).
       Built once, lazily, off the same bundle the polygons come from — no second source to drift. */
    let _csBnd=null;
    const _ymd=(y,m,d)=>y*10000+m*100+d;
    function _dayAfter(y,m,d){ const t=new Date(Date.UTC(y,m-1,d)); t.setUTCDate(t.getUTCDate()+1);
      return [t.getUTCFullYear(),t.getUTCMonth()+1,t.getUTCDate()]; }
    function csBounds(d){ if(_csBnd) return _csBnd;
      const set=new Set();
      for(const f of d.feats){ set.add(_ymd(f[2],f[3],f[4]));
        const a=_dayAfter(f[5],f[6],f[7]); set.add(_ymd(a[0],a[1],a[2])); }
      _csBnd=[...set].filter(k=>k>=_ymd(CS_MIN,1,1)&&k<=_ymd(CS_MAX,12,31)).sort((a,b)=>a-b);
      return _csBnd; }
    /* the epoch a date falls in = the last boundary at or before it. Two dates inside one epoch share a
       cache key, so scrubbing a quiet decade re-renders NOTHING while 1920 now steps thirteen times. */
    function csEpoch(d,y,m,dd){ const t=_ymd(y,m,dd), b=csBounds(d);
      let lo=0,hi=b.length-1,ans=b.length?b[0]:t;
      while(lo<=hi){ const mid=(lo+hi)>>1; if(b[mid]<=t){ ans=b[mid]; lo=mid+1; } else hi=mid-1; }
      return ans; }
    let _csD=null,_csP=null; const _csGeom=new Map();
    function csLoad(){ if(_csD) return Promise.resolve(_csD); if(_csP) return _csP;
      _csP=new Promise(res=>{ if(window.__CSHAPES){ _csD=window.__CSHAPES; res(_csD); return; }
        const s=document.createElement('script'); s.src='data/cshapes.js'; s.async=true;
        s.onload=()=>{ _csD=window.__CSHAPES||null; res(_csD); };
        s.onerror=()=>{ _csP=null; res(null); };
        document.head.appendChild(s); });
      return _csP; }
    /* era display names: gwcode → ordered [beforeYear, name] rules (first rule with year<beforeYear wins);
       null name = default (the CShapes name with any "(…)" gloss stripped). "(UK)/(France)…" suffixes reuse the
       existing coloniser-suffix localization. This is the R117 歴史国家拡充 curation table. */
    const _CS_ERA={
      2:[[9999,'United States']], 3:[[9999,'Alaska (USA)']], 4:[[1894,'Kingdom of Hawaii'],[1899,'Republic of Hawaii'],[9999,'Hawaii (USA)']],
      6:[[1899,'Puerto Rico (Spain)'],[9999,'Puerto Rico (USA)']], 31:[[1973,'Bahamas (UK)']], 51:[[1962,'Jamaica (UK)']],
      52:[[1962,'Trinidad and Tobago (UK)']], 53:[[1966,'Barbados (UK)']], 65:[[9999,'Guadeloupe (France)']], 66:[[9999,'Martinique (France)']],
      80:[[1981,'British Honduras (UK)']], 110:[[1966,'British Guiana (UK)']], 115:[[1975,'Dutch Guiana (Netherlands)'],[9999,'Suriname']],
      120:[[9999,'French Guiana (France)']], 205:[[1937,'Irish Free State'],[9999,'Ireland']],
      255:[[9999,'Germany']], 260:[[1990,'West Germany'],[9999,'Germany']], 265:[[9999,'East Germany']],
      325:[[9999,'Italy']], 343:[[9999,'North Macedonia']], 360:[[9999,'Romania']],
      365:[[1923,'Russia'],[1992,'Soviet Union'],[9999,'Russia']], 370:[[9999,'Belarus']],
      395:[[1918,'Iceland (Denmark)'],[1944,'Iceland (Denmark)'],[9999,'Iceland']],
      404:[[1974,'Portuguese Guinea (Portugal)'],[9999,'Guinea-Bissau']], 411:[[1968,'Spanish Guinea (Spain)'],[9999,'Equatorial Guinea']],
      420:[[1965,'Gambia (UK)']], 432:[[1960,'French Sudan (France)'],[9999,'Mali']], 433:[[1960,'Senegal (France)']],
      434:[[1960,'Dahomey (France)'],[1975,'Dahomey'],[9999,'Benin']], 435:[[1960,'Mauritania (France)']],
      436:[[1960,'Niger (France)']], 437:[[1960,"Cote d'Ivoire (France)"]], 438:[[1958,'French Guinea (France)'],[9999,'Guinea']],
      439:[[1960,'Upper Volta (France)'],[1984,'Upper Volta'],[9999,'Burkina Faso']],
      451:[[1961,'Sierra Leone (UK)']], 452:[[1957,'Gold Coast (UK)'],[9999,'Ghana']],
      461:[[1960,'French Togoland (France)'],[9999,'Togo']], 471:[[1960,'French Cameroons (France)'],[9999,'Cameroon']],
      475:[[1960,'Nigeria (UK)']], 481:[[1960,'Gabon (France)']], 482:[[1960,'Ubangi-Shari (France)'],[9999,'Central African Republic']],
      483:[[1960,'Chad (France)']], 484:[[1960,'French Congo (France)'],[9999,'Congo']],
      490:[[1908,'Congo Free State'],[1960,'Belgian Congo (Belgium)'],[1971,'Democratic Republic of the Congo'],[1997,'Zaire'],[9999,'Democratic Republic of the Congo']],
      500:[[1962,'Uganda (UK)']], 501:[[1920,'British East Africa (UK)'],[1963,'Kenya (UK)'],[9999,'Kenya']],
      510:[[1919,'German East Africa'],[1961,'Tanganyika (UK)'],[1964,'Tanganyika'],[9999,'Tanzania']],
      511:[[1964,'Sultanate of Zanzibar']], 515:[[9999,'Ruanda-Urundi (Belgium)']],
      521:[[1960,'British Somaliland (UK)']], 522:[[1977,'French Somaliland (France)'],[9999,'Djibouti']],
      530:[[1937,'Abyssinia'],[9999,'Ethiopia']],
      531:[[1941,'Eritrea (Italy)'],[1952,'Eritrea (UK)'],[1993,'Eritrea (Ethiopia)'],[9999,'Eritrea']],
      540:[[1975,'Angola (Portugal)']], 541:[[1975,'Mozambique (Portugal)']],
      551:[[1964,'Northern Rhodesia (UK)'],[9999,'Zambia']], 552:[[1965,'Southern Rhodesia (UK)'],[1980,'Rhodesia'],[9999,'Zimbabwe']],
      553:[[1964,'Nyasaland (UK)'],[9999,'Malawi']], 560:[[1961,'Union of South Africa'],[9999,'South Africa']],
      565:[[1916,'German South-West Africa'],[1990,'South West Africa (South Africa)'],[9999,'Namibia']],
      570:[[1966,'Basutoland (UK)'],[9999,'Lesotho']], 571:[[1966,'Bechuanaland (UK)'],[9999,'Botswana']],
      572:[[1968,'Swaziland (UK)'],[2018,'Swaziland'],[9999,'Eswatini']],
      580:[[1960,'Madagascar (France)'],[9999,'Madagascar']], 581:[[1975,'Comoros (France)']], 585:[[9999,'Reunion (France)']],
      590:[[1968,'Mauritius (UK)']], 600:[[1912,'Morocco'],[1956,'Morocco (France)'],[9999,'Morocco']],
      615:[[1962,'Algeria (France)']], 616:[[1956,'Tunisia (France)']],
      620:[[1943,'Libya (Italy)'],[1951,'Libya (UK)'],[9999,'Libya']], 625:[[1956,'Anglo-Egyptian Sudan'],[9999,'Sudan']],
      630:[[9999,'Iran']], 640:[[1923,'Ottoman Empire'],[9999,'Turkey']], 645:[[1932,'Iraq (UK)'],[9999,'Iraq']],
      651:[[1922,'Egypt (UK)'],[9999,'Egypt']], 652:[[1946,'Syria (France)']], 660:[[1943,'Lebanon (France)']],
      663:[[1946,'Transjordan (UK)'],[1949,'Transjordan'],[9999,'Jordan']], 665:[[9999,'Mandatory Palestine']],
      678:[[1967,'Yemen'],[1991,'North Yemen'],[9999,'Yemen']], 680:[[9999,'South Yemen']], 681:[[9999,'Aden (UK)']],
      694:[[1971,'Qatar (UK)']], 696:[[1971,'Trucial Oman (UK)'],[9999,'United Arab Emirates']],
      698:[[1970,'Muscat and Oman'],[9999,'Oman']], 703:[[9999,'Kyrgyzstan']],
      710:[[9999,'China']], 713:[[1945,'Taiwan (Japan)'],[1950,'Taiwan (China)'],[9999,'Taiwan']],
      730:[[1897,'Korea (Joseon)'],[1910,'Korean Empire'],[9999,'Korea (Japan)']],
      731:[[9999,'North Korea']], 732:[[9999,'South Korea']],
      750:[[1947,'India (UK)'],[9999,'India']],
      775:[[1948,'Burma (UK)'],[1989,'Burma'],[9999,'Myanmar']],
      780:[[1948,'Ceylon (UK)'],[1972,'Ceylon'],[9999,'Sri Lanka']], 781:[[1965,'Maldives (UK)']],
      800:[[1939,'Siam'],[9999,'Thailand']],
      811:[[1953,'Cambodia (France)'],[1976,'Cambodia'],[1990,'Kampuchea'],[9999,'Cambodia']],
      812:[[1953,'Laos (France)']], 815:[[1887,'Annam'],[9999,'Vietnam (France)']],
      816:[[1977,'North Vietnam'],[9999,'Vietnam']], 817:[[9999,'South Vietnam']],
      820:[[1957,'Malaya (UK)'],[1964,'Malaya'],[9999,'Malaysia']],
      823:[[9999,'North Borneo (UK)']], 824:[[1946,'Sarawak'],[9999,'Sarawak (UK)']],
      830:[[1964,'Singapore (UK)'],[9999,'Singapore']], 835:[[1984,'Brunei (UK)']],
      840:[[1899,'Philippines (Spain)'],[1946,'Philippines (USA)'],[9999,'Philippines']],
      850:[[1950,'Dutch East Indies'],[9999,'Indonesia']],
      851:[[1963,'Dutch New Guinea (Netherlands)'],[9999,'West Irian (Indonesia)']],
      860:[[1976,'Portuguese Timor (Portugal)'],[2000,'East Timor (Indonesia)'],[9999,'East Timor']],
      910:[[1975,'Papua and New Guinea (Australia)'],[9999,'Papua New Guinea']],
      911:[[1906,'Papua (UK)'],[9999,'Papua (Australia)']], 912:[[1920,'German New Guinea'],[9999,'New Guinea (Australia)']],
      930:[[9999,'New Caledonia (France)']], 940:[[1978,'British Solomon Islands (UK)'],[9999,'Solomon Islands']],
      950:[[1970,'Fiji (UK)']], 960:[[9999,'French Polynesia (France)']],
      3461:[[9999,'Bosnia (Austria-Hungary)']], 3462:[[9999,'Herzegovina (Austria-Hungary)']],
      4781:[[9999,'Lagos Colony (UK)']], 4782:[[9999,'Oil Rivers Protectorate (UK)']],
      4783:[[9999,'Southern Nigeria (UK)']], 4784:[[9999,'Northern Nigeria (UK)']],
      5518:[[9999,'North-Eastern Rhodesia (UK)']], 5519:[[9999,'North-Western Rhodesia (UK)']],
      6511:[[9999,'Gaza (Egypt)']], 6631:[[9999,'West Bank (Jordan)']],
      7020:[[9999,'Emirate of Bukhara']], 7030:[[9999,'Khanate of Khiva']],
      7351:[[9999,'Karafuto (Japan)']], 9401:[[9999,'German Solomon Islands']]
    };
    function _csName(nm,gw,y){ const rules=_CS_ERA[gw];
      if(rules){ for(const r of rules){ if(y<r[0]) return r[1]; } }
      return String(nm||'').replace(/\s*\([^)]*\)\s*$/,''); }   /* default: drop the "(…)" gloss (e.g. "Madagascar (Malagasy)") */
    function _csGeomOf(d,idx){ let g=_csGeom.get(idx); if(g) return g;
      const polys=d.feats[idx][8].map(poly=>poly.map(ri=>d.rings[ri]));
      g=(polys.length===1)?{type:'Polygon',coordinates:polys[0]}:{type:'MultiPolygon',coordinates:polys};
      _csGeom.set(idx,g); return g; }
    function csFC(d,year,mon,day){ const feats=[];
      /* (#R421) `mon`/`day` absent = the old July-1 sample, kept so the aourednik-fallback and any
         year-only caller still get a defined instant rather than January 1. */
      const M=(mon>=1&&mon<=12)?mon:7, D=(day>=1&&day<=31)?day:1, t=_ymd(year,M,D);
      for(let i=0;i<d.feats.length;i++){ const f=d.feats[i];
        /* active ON that date: started at or before it, and not yet ended (CShapes end dates are inclusive) */
        if(_ymd(f[2],f[3],f[4])>t || _ymd(f[5],f[6],f[7])<t) continue;
        const NAME=_csName(f[0],f[1],year);
        feats.push({type:'Feature',geometry:_csGeomOf(_csD,i),properties:{NAME:NAME,name:NAME,_gw:f[1]}}); }
      return {type:'FeatureCollection',features:feats}; }
    /* (#R105) vanished entities that occupy a modern country's territory (shared by the click resolver + the era
       correction) — a point-in-polygon would mis-resolve them to the modern occupant. */
    /* (#R128) flags for the vanished entities (were name+wiki only). Inline SVG data-URIs, no external assets —
       same mechanism as IntMapHistStates/IntMapHistId. Surfaced by resolveHist step 2b + the click popup. */
    const _vflag=(inner)=>'<img class="hist-flag" alt="" src="data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 20">'+inner+'</svg>')+'">';
    const F_TIBET=_vflag('<rect width="30" height="20" fill="#1560BD"/><path d="M15.00,11.00 L8.27,-14.11 L21.73,-14.11 Z" fill="#9E1B32"/><path d="M15.00,11.00 L21.73,-14.11 L33.38,-7.38 Z" fill="#1560BD"/><path d="M15.00,11.00 L33.38,-7.38 L40.11,4.27 Z" fill="#9E1B32"/><path d="M15.00,11.00 L40.11,4.27 L40.11,17.73 Z" fill="#1560BD"/><path d="M15.00,11.00 L40.11,17.73 L33.38,29.38 Z" fill="#9E1B32"/><path d="M15.00,11.00 L33.38,29.38 L21.73,36.11 Z" fill="#1560BD"/><path d="M15.00,11.00 L21.73,36.11 L8.27,36.11 Z" fill="#9E1B32"/><path d="M15.00,11.00 L8.27,36.11 L-3.38,29.38 Z" fill="#1560BD"/><path d="M15.00,11.00 L-3.38,29.38 L-10.11,17.73 Z" fill="#9E1B32"/><path d="M15.00,11.00 L-10.11,17.73 L-10.11,4.27 Z" fill="#1560BD"/><path d="M15.00,11.00 L-10.11,4.27 L-3.38,-7.38 Z" fill="#9E1B32"/><path d="M15.00,11.00 L-3.38,-7.38 L8.27,-14.11 Z" fill="#1560BD"/><circle cx="15" cy="11" r="3.1" fill="#FFDE00"/><path d="M4,20 L11,11 L15,15 L19,11 L26,20 Z" fill="#ffffff"/><rect x="0.6" y="0.6" width="28.8" height="18.8" fill="none" stroke="#FFDE00" stroke-width="1.2"/>');
    const F_ETRK=_vflag('<rect width="30" height="20" fill="#0099DC"/><circle cx="12" cy="10" r="4.4" fill="#ffffff"/><circle cx="13.7" cy="10" r="3.5" fill="#0099DC"/><g transform="translate(17.4,10) scale(1.7)"><path d="M0,-1 0.2245,-0.309 0.951,-0.309 0.363,0.118 0.588,0.809 0,0.382 -0.588,0.809 -0.363,0.118 -0.951,-0.309 -0.2245,-0.309Z" fill="#ffffff"/></g>');
    const F_MANK=_vflag('<rect width="30" height="20" fill="#FDD900"/><rect width="12" height="2.5" fill="#D7000F"/><rect y="2.5" width="12" height="2.5" fill="#002D9C"/><rect y="5" width="12" height="2.5" fill="#ffffff"/><rect y="7.5" width="12" height="2.5" fill="#111111"/>');
    /* (#R130) era flags for newly-distinguished vanished states — CShapes gave each its own polygon (gw265/817/680/291)
       but _GW2ISO collapsed them into a modern carrier, so a click showed the MODERN country's flag + the WRONG era
       Wikipedia (East Germany → West_Germany, South Vietnam → North_Vietnam, South Yemen → modern Yemen, Danzig → Poland).
       Adding them to _VANISHED (which resolves BEFORE the gwcode step) restores each real identity. */
    const F_DDR=_vflag('<rect width="30" height="6.667" fill="#000000"/><rect y="6.667" width="30" height="6.667" fill="#DD0000"/><rect y="13.333" width="30" height="6.667" fill="#FFCE00"/><g transform="translate(15,10)"><ellipse rx="4.4" ry="4.7" fill="none" stroke="#111" stroke-width="1.3"/><ellipse rx="4.4" ry="4.7" fill="none" stroke="#FFCE00" stroke-width="0.6"/><g fill="none" stroke-linecap="round"><g stroke="#111" stroke-width="1.4"><path d="M0,-3.1 -2,2.5"/><path d="M0,-3.1 2,2.5"/><path d="M-2.5,-0.7 2.5,1.7"/></g><g stroke="#FFCE00" stroke-width="0.7"><path d="M0,-3.1 -2,2.5"/><path d="M0,-3.1 2,2.5"/><path d="M-2.5,-0.7 2.5,1.7"/></g></g></g>');
    const F_RVN=_vflag('<rect width="30" height="20" fill="#FFF200"/><rect y="7.8" width="30" height="1.4" fill="#DA251D"/><rect y="9.6" width="30" height="1.4" fill="#DA251D"/><rect y="11.4" width="30" height="1.4" fill="#DA251D"/>');
    const F_PDRY=_vflag('<rect width="30" height="6.667" fill="#CE1126"/><rect y="6.667" width="30" height="6.667" fill="#ffffff"/><rect y="13.333" width="30" height="6.667" fill="#000000"/><path d="M0,0 11,10 0,20Z" fill="#00A9CE"/><g transform="translate(3.9,10) scale(1.7)"><path d="M0,-1 0.2245,-0.309 0.951,-0.309 0.363,0.118 0.588,0.809 0,0.382 -0.588,0.809 -0.363,0.118 -0.951,-0.309 -0.2245,-0.309Z" fill="#CE1126"/></g>');
    const F_DANZIG=_vflag('<rect width="30" height="20" fill="#DA121A"/><g fill="#ffffff"><rect x="13.1" y="9.1" width="3.8" height="1.2"/><rect x="14.4" y="7.8" width="1.2" height="3.8"/><rect x="13.1" y="12.9" width="3.8" height="1.2"/><rect x="14.4" y="11.6" width="1.2" height="3.8"/></g><path d="M12.2,6.6 13.4,4.9 15,6.1 16.6,4.9 17.8,6.6Z" fill="#FCD116"/>');
    /* (#R136) Union Jack — the OFFICIAL flag of the Dominion of Newfoundland (1931–1949) before it joined Canada. */
    const F_UNIONJACK=_vflag('<rect width="30" height="20" fill="#012169"/><path d="M0,0 30,20 M30,0 0,20" stroke="#fff" stroke-width="4.4"/><path d="M0,0 30,20 M30,0 0,20" stroke="#C8102E" stroke-width="1.8"/><rect x="11.4" width="7.2" height="20" fill="#fff"/><rect y="6.4" width="30" height="7.2" fill="#fff"/><rect x="12.75" width="4.5" height="20" fill="#C8102E"/><rect y="7.75" width="30" height="4.5" fill="#C8102E"/>');
    const _VANISHED=[
      {re:/^\s*(tibet|xizang|thibet)\s*$/i, nm:LA('Tibet','チベット','Tibet','Тибет','Tíbet'), wiki:'Tibet_(1912%E2%80%931951)', flag:F_TIBET},
      {re:/^\s*(east[ -]?turkest(an|än)|uygh?ur(istan)?|sinkiang|kashgaria|(first|second) east turkestan republic)\s*$/i, nm:LA('East Turkestan','東トルキスタン','Ostturkestan','Восточный Туркестан','Turkestán Oriental'), wiki:'East_Turkestan', flag:F_ETRK},
      {re:/^\s*(manchukuo|manchoukuo|manchuria)\s*$/i, nm:LA('Manchukuo','満洲国','Mandschukuo','Маньчжоу-го','Manchukuo'), wiki:'Manchukuo', flag:F_MANK},
      /* (#R130) states CShapes draws as their OWN polygon (gw265/817/680/291) but _GW2ISO folded into a modern carrier,
         so a click resolved to the modern country + its (wrong) era article/flag. Placed here (step 2b) so they win
         over the gwcode step. No stats carrier exists (their territory has no separate modern successor), so — like
         Tibet/Manchukuo — they surface identity/flag/Wikipedia honestly without comparable numbers. */
      {re:/^\s*(east germany|german democratic republic|d\.?\s?d\.?\s?r\.?|deutsche demokratische republik)\s*$/i, nm:LA('East Germany','東ドイツ','Deutsche Demokratische Republik','ГДР','Alemania Oriental'), wiki:'East_Germany', flag:F_DDR},
      {re:/^\s*(south vietnam|republic of vietnam)\s*$/i, nm:LA('South Vietnam','南ベトナム','Südvietnam','Южный Вьетнам','Vietnam del Sur'), wiki:'South_Vietnam', flag:F_RVN},
      {re:/^\s*(south yemen|people'?s democratic republic of yemen|p\.?d\.?r\.?y\.?)\s*$/i, nm:LA('South Yemen','南イエメン','Südjemen','Южный Йемен','Yemen del Sur'), wiki:'South_Yemen', flag:F_PDRY},
      {re:/^\s*(danzig|free city of danzig)\s*$/i, nm:LA('Free City of Danzig','ダンツィヒ自由市','Freie Stadt Danzig','Вольный город Данциг','Ciudad Libre de Dánzig'), wiki:'Free_City_of_Danzig', flag:F_DANZIG},
      /* (#R136) the Dominion of Newfoundland was a self-governing British dominion until it joined Canada in 1949 —
         _GW2ISO(21) folded it into modern CANADA, so a click showed Canada's flag/article. Restore its own identity
         (no separate Maddison series → honest name/flag/Wikipedia without comparable numbers, like Danzig). */
      {re:/^\s*(newfoundland|dominion of newfoundland)\s*$/i, nm:LA('Dominion of Newfoundland','ニューファンドランド自治領','Dominion Neufundland','Доминион Ньюфаундленд','Dominio de Terranova'), wiki:'Dominion_of_Newfoundland', flag:F_UNIONJACK}
    ];
    /* (#R105) correct a KNOWN anachronism in the aourednik data: it draws "Tibet" (and East Turkestan) as an
       INDEPENDENT country in the 1960 snapshot even though the PRC annexed Tibet in 1951 / East Turkestan by 1949.
       Because 1953–1993 all resolve to the 1960 snapshot, Tibet wrongly showed independent "for a while after 1951"
       ("1951年以降もしばらくは独立国として表記"). For any snapshot ≥ 1953 we merge those features into China's identity:
       renamed to China (so a click resolves to the PRC) with the independent LABEL suppressed. Snapshots ≤ 1945 keep
       Tibet independent (correct for their era). */
    const _TIBET_RE=/^\s*(tibet|xizang|thibet|east[ -]?turkest(an|än)|uygh?ur(istan)?|sinkiang|kashgaria)\s*$/i;
    /* (#R107) DISSOLVE Tibet/E-Turkestan INTO China's polygon (not just rename it). R105/R106 renamed the feature
       and suppressed its LABEL, but it stayed a SEPARATE feature so imtb-line kept drawing its outline — the border
       line stayed the independence-era one ("1951年以降もしばらくは国境線が独立時代のまま"). Here we turf.union the
       Tibet feature(s) into the China feature so the shared internal border is dissolved, then DROP the Tibet
       feature(s). China keeps its own name/properties so tagSame still gives it the normal localized label. Falls
       back to the R106 rename-only (label suppressed, geometry unchanged) when turf/union or a China feature is
       unavailable — never worse than before. Returns a NEW FeatureCollection; never mutates the input. */
    function _mergeTibet(fc){ try{ if(!fc||!Array.isArray(fc.features)) return fc;
      const tibet=[]; let china=null;
      fc.features.forEach(f=>{ const p=f.properties||{}; const n=String((p.NAME||p.name)||'');
        if(!p._corrected && _TIBET_RE.test(n)){ tibet.push(f); }
        else if(china===null && /^\s*(china|people'?s republic of china|republic of china)\s*$/i.test(n)) china=f; });
      if(!tibet.length) return fc;
      const _renameOnly=()=>({type:'FeatureCollection',features:fc.features.map(f=>{ const p=f.properties||{}; if(!p._corrected && _TIBET_RE.test(String((p.NAME||p.name)||'')))
        return {type:'Feature',geometry:f.geometry,properties:Object.assign({},p,{NAME:'China',name:'China',_corrected:1,_same:1,_modName:''})}; return f; })});
      if(!china || !(window.turf&&window.turf.union)) return _renameOnly();
      let merged=china; for(const t of tibet){ try{ const u=window.turf.union(merged,t); if(u&&u.geometry) merged={type:'Feature',geometry:u.geometry,properties:china.properties}; }catch(_){} }
      if(merged===china) return _renameOnly();   /* union produced nothing usable → don't drop Tibet */
      const feats=[]; for(const f of fc.features){ if(tibet.indexOf(f)>=0) continue;   /* drop the dissolved Tibet feature(s) */
        if(f===china) feats.push({type:'Feature',geometry:merged.geometry,properties:Object.assign({},china.properties)});   /* China now includes Tibet's area, one border */
        else feats.push(f); }
      return {type:'FeatureCollection',features:feats};
    }catch(_){ return fc; } }
    /* (#R110) the aourednik 1920 & 1930 snapshots draw "East Prussia" as a SEPARATE feature from "Germany", so the
       interwar German exclave looked like an independent country ("東プロイセンが別国家であるかのような表記・範囲").
       East Prussia was part of Germany the whole interwar period (an exclave beyond the Polish Corridor, but the SAME
       state — Weimar Republic, then the Reich). Dissolve it INTO Germany — one identity, one label, one fill — exactly
       like the Tibet merge. Its Baltic coast / corridor border remains (it really was cut off), it is just no longer a
       separate country. The Free City of Danzig stays separate (it genuinely was a League of Nations territory). */
    const _EPRUS_RE=/^\s*(east[ -]?prussia|ostpreu(ss|ß)en)\s*$/i;
    const _DEU_RE=/^\s*(germany|german reich|deutsches reich|weimar republic)\s*$/i;
    function _mergeEastPrussia(fc){ try{ if(!fc||!Array.isArray(fc.features)) return fc;
      const ep=[]; let de=null;
      fc.features.forEach(f=>{ const p=f.properties||{}; const n=String((p.NAME||p.name)||'');
        if(!p._corrected && _EPRUS_RE.test(n)){ ep.push(f); }
        else if(de===null && _DEU_RE.test(n)) de=f; });
      if(!ep.length) return fc;
      /* fallback (no turf / no Germany feature): keep East Prussia's geometry but rename it to Germany + suppress its
         own label, so at least it no longer reads as a separate country — never worse than before. */
      const _renameOnly=()=>({type:'FeatureCollection',features:fc.features.map(f=>{ const p=f.properties||{}; if(!p._corrected && _EPRUS_RE.test(String((p.NAME||p.name)||'')))
        return {type:'Feature',geometry:f.geometry,properties:Object.assign({},p,{NAME:'Germany',name:'Germany',_corrected:1,_same:1,_modName:''})}; return f; })});
      if(!de || !(window.turf&&window.turf.union)) return _renameOnly();
      let merged=de; for(const t of ep){ try{ const u=window.turf.union(merged,t); if(u&&u.geometry) merged={type:'Feature',geometry:u.geometry,properties:de.properties}; }catch(_){} }
      if(merged===de) return _renameOnly();   /* union produced nothing usable → don't drop East Prussia */
      const feats=[]; for(const f of fc.features){ if(ep.indexOf(f)>=0) continue;   /* drop the dissolved East Prussia feature(s) */
        if(f===de) feats.push({type:'Feature',geometry:merged.geometry,properties:Object.assign({},de.properties)});   /* Germany now includes East Prussia, one identity */
        else feats.push(f); }
      return {type:'FeatureCollection',features:feats};
    }catch(_){ return fc; } }
    /* SNAPSHOT baking — the 1960 snapshot (only shown for years ≥1953) draws Tibet independent (aourednik anachronism);
       merge it once and cache the merged FC. The East Prussia merge runs on EVERY snapshot (a no-op unless both a
       Germany and an East Prussia feature are present, i.e. only the 1920 & 1930 snapshots). */
    function _correctEra(fc,year){ try{ if(!fc||!Array.isArray(fc.features)) return fc; let out=fc; if(year>=1951) out=_mergeTibet(out); out=_mergeEastPrussia(out); return out; }catch(_){ return fc; } }
    /* (#R106/#R107) DISPLAY-YEAR correction: for a displayed year ≥1951 whose snapshot still carries an independent
       Tibet/E-Turkestan (the 1945 snapshot shown for 1951-1952), merge on the fly (NEW FC — the raw cached snapshot is
       left intact so pre-1951 years still show Tibet independent). */
    function _eraCorrect(fc,year){ try{ if(!(year>=1951)||!fc||!Array.isArray(fc.features)) return fc;
      if(!fc.features.some(f=>{ const p=f.properties||{}; return !p._corrected && _TIBET_RE.test(String((p.NAME||p.name)||'')); })) return fc;
      return _mergeTibet(fc); }catch(_){ return fc; } }
    async function fetchFC(year){ if(cache.has(year)) return cache.get(year);
      if(window.IntMapCache){ try{ const c=await window.IntMapCache.get('hb_'+year); if(c&&Array.isArray(c.features)){ const cc=_correctEra(c,year); cache.set(year,cc); return cc; } }catch(_){} }
      for(const wrap of PROX){ try{ const ctrl=('AbortController'in window)?new AbortController():null, to=ctrl?setTimeout(()=>{try{ctrl.abort();}catch(_){}} ,20000):null;
        const r=await fetch(wrap('https://raw.githubusercontent.com/aourednik/historical-basemaps/master/geojson/world_'+year+'.geojson'),ctrl?{signal:ctrl.signal}:undefined); if(to) clearTimeout(to);
        if(!r.ok) continue; const j=await r.json(); if(!j||!Array.isArray(j.features)) continue;
        const cj=_correctEra(j,year); cache.set(year,cj); try{ window.IntMapCache&&window.IntMapCache.set('hb_'+year,cj); }catch(_){} return cj;
      }catch(_){} } return null; }
    function ensure(){ try{ if(!_imCanDraw()) return false;
      if(!GE().layers.hasSource('imtb-src')) GE().layers.addSource('imtb-src',{type:'geojson',data:{type:'FeatureCollection',features:[]},attribution:'CShapes 2.0 (Schvitz et al.) · historical-basemaps (aourednik)'});
      const before=['ofm-country','ofm-city','ofm-other'].find(id=>{ try{ return !!GE().layers.has(id); }catch(_){ return false; } });
      /* whole-country click target (near-invisible fill) + a highlight fill (shown on click, like modern countries) */
      if(!GE().layers.has('imtb-fill')) GE().layers.add({id:'imtb-fill',type:'fill',source:'imtb-src',paint:{'fill-color':'#000000','fill-opacity':0.001}}, before);
      /* (#R212) 「歴史的国境線も同じものに統一して。」 — the same colour and the same zoom→width ladder as
         today's national border (js/border-style.js). Travelling in time must change WHERE a border
         runs, not what a border looks like. The literals are the fallback for a page where the module
         has not been evaluated, and they are the same numbers. */
      const _BS=(window.IntMapBorderStyle||{});
      if(!GE().layers.has('imtb-line')) GE().layers.add({id:'imtb-line',type:'line',source:'imtb-src',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':_BS.color||'#d9dbe0','line-opacity':0.95,'line-width':_BS.width||['interpolate',['linear'],['zoom'],1,0.95,4,1.55,8,2.2,12,2.9]}}, before);
      /* == (#R309) A PAST COUNTRY'S NAME IS A COUNTRY NAME ======================================
         「昔の国名ラベルの見た目や挙動も今の国名ラベルと完全に同じに。」 #R101 gave the RENAMED half its
         own smaller "era style" (that request was about the UNCHANGED half keeping the normal one), so
         the two era layers disagreed with each other AND with `ofm-country`. MEASURED on the built site
         at z4.2 in 1914, against js/place-labels.js `ofm-country`:
             text-font        imtb 'Noto Sans Regular'   ofm ['Noto Sans JP','Noto Sans SC']
             text-size (z1-4) imtb-lbl 8.5-12            ofm 12-17
             letter-spacing   imtb-lbl 0.06              ofm 0.08
             max-width        imtb-lbl 7                 ofm 8
             halo-width       1.5 / 1.4                  ofm 1.7
             colour           frozen #eef2ff / #e8eefc   ofm re-painted per basemap (applyLabelLang)
             maxzoom          imtb-lbl none              ofm 7
             minzoom          1.4                        ofm none
         Every number below is now the one `ofm-country` uses.
         ⚠ 'Noto Sans Regular' is the spelling js/map-typography.js documents as NOT AN INSTALLED
         FAMILY - MapLibre 5 treats a stack name as a CSS family list, so it fell to `sans-serif` and
         Windows drew one name in three system faces. The era text is ALREADY in the reader's language
         (`_locName` / `_modName` come out of `_LTB.arr`), which is exactly the case `readerFont()` exists
         for: `placeFont()` tests `name:ja` ON THE FEATURE, and an era feature carries no name keys at
         all, so it would send every era label to the pan-Han face. The colours below are the literals
         `ofm-country` is born with; `applyLabelLang` now re-applies them per basemap for these two too. */
      const _ERAFONT=(function(){ try{ return window.IntMapMapTypography.readerFont(); }catch(_){ return ['Noto Sans SC']; } })();
      /* (#R101) RENAMED countries (name differs from the present, e.g. Siam, Soviet Union, German Empire).
         Filtered to _same!=1 (see tagSame). */
      if(!GE().layers.has('imtb-lbl')) GE().layers.add({id:'imtb-lbl',type:'symbol',source:'imtb-src',maxzoom:7,filter:['!=',['coalesce',['get','_same'],0],1],layout:{'symbol-placement':'point','text-field':['coalesce',['get','_locName'],['get','NAME'],['get','name'],''],'text-font':_ERAFONT,'text-letter-spacing':0.08,'text-size':window.IntMapLabelScale.place('country'),'text-max-width':8,'text-padding':6},paint:{'text-color':'#ffffff','text-halo-color':'rgba(0,0,0,0.9)','text-halo-width':1.7}});
      /* (#R101) UNCHANGED countries (same name as today, e.g. Japan, France) keep their normal country label style
         (matching ofm-country) rather than the era style — per request "国名が変わってない国は既存の国名ラベルのまま".
         Filtered to _same==1. Rendered from the era data so no country ever loses its label. */
      if(!GE().layers.has('imtb-lbl2')) GE().layers.add({id:'imtb-lbl2',type:'symbol',source:'imtb-src',maxzoom:7,filter:['==',['coalesce',['get','_same'],0],1],layout:{'symbol-placement':'point','text-field':['coalesce',['get','_modName'],['get','NAME'],['get','name'],''],'text-font':_ERAFONT,'text-letter-spacing':0.08,'text-size':window.IntMapLabelScale.place('country'),'text-max-width':8,'text-padding':6},paint:{'text-color':'#ffffff','text-halo-color':'rgba(0,0,0,0.9)','text-halo-width':1.7}});
      /* (#R94k) clicking a historical label/border opens the SAME country card as a modern country: resolve the
         era polygon's NAME to its countryStats entry (a former state, or a modern country renamed for the era). */
      if(!_clickWired){ _clickWired=true;
        const _clk=(e)=>{ try{
          /* (#R108) while a country is ISOLATED, a click anywhere must NOT re-register as a historical-country click
             ("昔の国をisolateした状態でどこかをクリックすると国名をクリックした判定になってしまう"). */
          if(window.IntMapIsolate && window.IntMapIsolate.active && window.IntMapIsolate.active()) return;
          /* (#R102) FIX "過去に戻って地名ラベルをクリックすると強制的に当時の国をクリックしたことにされる": the whole-country
             fill / border line is a full-country click target that swallowed clicks meant for a place label. When the
             fill/line catches a click that ALSO lands on a specific place label (city / town / water / sea / peak /
             river), defer to that label so the PLACE opens — not the country. An era country-NAME label click
             (imtb-lbl / imtb-lbl2) still opens the country as before. */
          const _lyr=(e.features&&e.features[0]&&e.features[0].layer&&e.features[0].layer.id)||'';
          if(_lyr==='imtb-fill'||_lyr==='imtb-line'){
            try{ const specific=['ofm-city','ofm-other','geo-sea','ofm-water','ofm-water2','ofm-river','ofm-peak'].filter(id=>{ try{ return !!GE().layers.has(id); }catch(_){ return false; } });
              if(specific.length&&e.point&&GE().coords.queryRenderedFeatures(e.point,{layers:specific}).length) return; }catch(_){}
          }
          const f=e.features&&e.features[0]; if(!f) return; _openEra(f,e.lngLat,e); }catch(_){} };
        /* (#R94m) EXACTLY the modern-country reaction: the same place popup (Copy/Wikipedia/AI brief/Isolate)
           + blue outline — here the era polygon is outlined. No bespoke behaviour.
           (#R94n) resolve to the app's historical ENTITY → the era NAME + Wikipedia title (so the card/popup and
           the Wikipedia link land on e.g. "German Empire", NOT modern Germany), and take the FULL source polygon
           — the click event's feature.geometry is CLIPPED to the vector tile the tap landed in (a geojson-vt
           artifact), which is what drew the highlight "cut off in straight lines" for big countries.
           (#R309) split out of `_clk` so the padded tap below reaches the same door with the same feature. */
        function _openEra(f,lngLat,e){ const nm=(f&&f.properties&&(f.properties.NAME||f.properties.name))||''; if(!nm) return false;
          const R=resolveHist(nm,lngLat); const dispName=R.name||nm; const geom=R.geometry||f.geometry;
          /* == (#R309) SAY THAT THIS CLICK IS SPOKEN FOR =========================================
             「昔の国の国名ラベルを、今とおなじでクリック可能にして。」 The wiring was never missing.
             MEASURED on the built site at z4.2 in 1914: the delegated listener IS registered on both era
             layers, it DOES fire, the cursor IS a pointer, and `_imPlacePopup` IS called and does not
             throw. The popup was opened and destroyed inside the SAME MILLISECOND - a MutationObserver
             over one era-label click logged '+33100' then '-33100'. js/map-ui.js's generic map-click
             fallback calls `clearHL()`, which REMOVES the popup, whenever the tap missed everything in
             its own `ALL_LBL`; the era labels are not in that list. It runs in a microtask
             (`_deferLabel`), i.e. always AFTER this synchronous handler, so it could only ever undo it.
             #R210 built the answer to exactly this collision and this handler simply never used it:
             claim the click, and `_deferLabel`'s own `claimed()` check steps aside. */
          try{ if(e) GE().events.claimClick(e); }catch(_){}
          if(typeof window._imPlacePopup==='function'){ window._imPlacePopup(lngLat,dispName,true,{geojson:geom,wiki:R.wiki||nm,flag:R.flag}); return true; }
          if(R.code&&typeof showCountryDetail==='function'){ showCountryDetail(R.code); return true; }
          return false; }
        /* (#R122) ONLY the era country-NAME labels open the country card — NOT the whole-country fill/line. Clicking
           empty land inside a past country (no name label, no place label there) must NOT force a country-name click
           ("国名でも地名ラベルでもない場所をクリックしたら、強制的に国名をクリックした判定になる"). This mirrors the
           modern map, where clicking bare land opens nothing. The name labels (imtb-lbl / imtb-lbl2) remain clickable. */
        ['imtb-lbl','imtb-lbl2'].forEach(id=>{ GE().events.onLayer('click',id,_clk); GE().events.onLayer('mouseenter',id,()=>{ try{ GE().render.canvas().style.cursor='pointer'; }catch(_){} }); GE().events.onLayer('mouseleave',id,()=>{ try{ GE().render.canvas().style.cursor=''; }catch(_){} }); });
        /* == (#R309) THE PADDED TAP - THE OTHER HALF OF "the same as today's labels" ==============
           js/map-ui.js has given every modern place label a padded hit-box since #R23 (6 px on a
           mouse, 15 px on a finger) because "a finger tap almost never lands on the exact label
           glyph". The era labels only ever had the exact glyph, so on a phone they read as dead text.
           Same rule, same radii, through the same door as the exact hit above.
           ⚠ The exact hit is checked FIRST and returns: `_clk` already owns that click, and opening
           the popup twice would leave the first one's outline behind. */
        GE().events.on('click',(e)=>{ try{
          if(!active) return;
          if(GE().events.clickClaimed&&GE().events.clickClaimed(e)) return;
          if(window.IntMapIsolate&&window.IntMapIsolate.active&&window.IntMapIsolate.active()) return;
          const ids=['imtb-lbl','imtb-lbl2'].filter(id=>{ try{ return !!GE().layers.get(id); }catch(_){ return false; } });
          if(!ids.length||!e.point) return;
          if(GE().coords.queryRenderedFeatures(e.point,{layers:ids}).length) return;
          let pad=6; try{ if(HOST.isMobile&&HOST.isMobile()) pad=15; }catch(_){}
          const near=GE().coords.queryRenderedFeatures([[e.point.x-pad,e.point.y-pad],[e.point.x+pad,e.point.y+pad]],{layers:ids});
          if(near.length) _openEra(near[0],e.lngLat,e);
        }catch(_){} });
      }
      return true; }catch(_){ return false; } }
    /* visibility is owned by `window._applyBorders()`; `applyTheme()` additionally swaps the Carto base to its
       label-free variant while travelling (so the base tiles' BAKED-IN modern borders/labels disappear). */
    /* travelling → the robust `window._applyBorders()` (forces the label-free base + raises the era layers).
       Restoring at Now → `applyTheme()` (brings the labelled Carto base + modern labels back). */
    const _restoreBase=()=>{ try{ if(typeof applyTheme==='function') applyTheme(); else window._applyBorders(); }catch(_){ try{ window._applyBorders(); }catch(__){} } };
    /* (#R94n) once the era polygons are in, re-paint an OPEN Compare so it uses this year's borders (its own
       clock re-render can race ahead of the border fetch on the first, uncached travel to a year). */
    function _afterApply(){ try{ const C=window.IntMapStatsCompare; if(C&&C.paintOnMap&&document.getElementById('scp-view')) C.paintOnMap(); }catch(_){} }
    /* (#R101) tag each era polygon with `_same`=1 when its name still matches a present-day country (Japan, France,
       …) so those keep the normal label style (imtb-lbl2); renamed/vanished states (_same=0) show the era name in
       the era style (imtb-lbl). If countryStats isn't loaded yet, leave everything as era-style (safe fallback —
       nothing loses a label). */
    /* (#R102) diacritic-insensitive normalization so "Mexico"/"Cote d'Ivoire" match regardless of accents.
       Uses \u escapes for the combining-mark range (avoids literal combining marks in source — an OneDrive-revert gotcha). */
    const _normNm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/\p{M}/gu,'').replace(/[.’']/g,'').replace(/\s+/g,' ').trim();
    /* (#R107) localize a RENAMED / vanished era name for the map LABEL ("昔の国名は英語以外の言語も対応させて"). The
       aourednik NAME is English (SOVIET UNION / GERMAN EMPIRE / SIAM…); resolve it to the current-language name via the
       former-state registry (IntMapHistStates, which already carries name[lg]) or the _VANISHED table. Returns null when
       no localization is known (→ keep the English era name) or for EN users (no work needed). */
    /* (#R108) broader era-name → localized-name table for map labels ("未対応の国がまだ残る") — common historical
       entities in the 1900-1960 snapshots that are neither present-day countries nor in the former-state registry. */
    const _ERA_LOC=[
      [/^\s*persia\s*$/i,LA('Persia','ペルシャ','Persien','Персия','Persia')],
      [/^\s*siam\s*$/i,LA('Siam','シャム','Siam','Сиам','Siam')],
      [/^\s*abyssinia\s*$/i,LA('Abyssinia','アビシニア','Abessinien','Абиссиния','Abisinia')],
      [/^\s*burma\s*$/i,LA('Burma','ビルマ','Birma','Бирма','Birmania')],
      [/^\s*ceylon\s*$/i,LA('Ceylon','セイロン','Ceylon','Цейлон','Ceilán')],
      [/^\s*formosa\s*$/i,LA('Formosa','フォルモサ','Formosa','Формоза','Formosa')],
      [/^\s*prussia\s*$/i,LA('Prussia','プロイセン','Preußen','Пруссия','Prusia')],
      [/^\s*bavaria\s*$/i,LA('Bavaria','バイエルン','Bayern','Бавария','Baviera')],
      [/^\s*rhodesia\s*$/i,LA('Rhodesia','ローデシア','Rhodesien','Родезия','Rodesia')],
      [/^\s*zaire\s*$/i,LA('Zaire','ザイール','Zaire','Заир','Zaire')],
      [/^\s*trans-?jordan\s*$/i,LA('Transjordan','トランスヨルダン','Transjordanien','Трансиордания','Transjordania')],
      [/^\s*bohemia\s*$/i,LA('Bohemia','ボヘミア','Böhmen','Богемия','Bohemia')],
      [/^\s*mesopotamia\s*$/i,LA('Mesopotamia','メソポタミア','Mesopotamien','Месопотамия','Mesopotamia')],
      [/^\s*newfoundland\s*$/i,LA('Newfoundland','ニューファンドランド','Neufundland','Ньюфаундленд','Terranova')],
      [/^\s*tanganyika\s*$/i,LA('Tanganyika','タンガニーカ','Tanganjika','Танганьика','Tanganica')],
      [/^\s*nyasaland\s*$/i,LA('Nyasaland','ニアサランド','Njassaland','Ньясаленд','Niasalandia')],
      [/^\s*dahomey\s*$/i,LA('Dahomey','ダホメ','Dahomey','Дагомея','Dahomey')],
      [/^\s*(upper volta|haute-?volta)\s*$/i,LA('Upper Volta','オートボルタ','Obervolta','Верхняя Вольта','Alto Volta')],
      [/^\s*basutoland\s*$/i,LA('Basutoland','バストランド','Basutoland','Басутоленд','Basutolandia')],
      [/^\s*bechuanaland\s*$/i,LA('Bechuanaland','ベチュアナランド','Betschuanaland','Бечуаналенд','Bechuanalandia')],
      [/^\s*(kampuchea|khmer republic)\s*$/i,LA('Kampuchea','カンプチア','Kamputschea','Кампучия','Kampuchea')],
      [/^\s*kingdom of hungary\s*$/i,LA('Kingdom of Hungary','ハンガリー王国','Königreich Ungarn','Королевство Венгрия','Reino de Hungría')],
      [/^\s*(kingdom of romania|rumania)\s*$/i,LA('Kingdom of Romania','ルーマニア王国','Königreich Rumänien','Королевство Румыния','Reino de Rumania')],
      [/^\s*kingdom of (bulgaria)\s*$/i,LA('Kingdom of Bulgaria','ブルガリア王国','Königreich Bulgarien','Царство Болгария','Reino de Bulgaria')],
      [/^\s*kingdom of (serbia)\s*$/i,LA('Kingdom of Serbia','セルビア王国','Königreich Serbien','Королевство Сербия','Reino de Serbia')],
      [/^\s*kingdom of (greece)\s*$/i,LA('Kingdom of Greece','ギリシャ王国','Königreich Griechenland','Королевство Греция','Reino de Grecia')],
      [/^\s*(kingdom of yugoslavia|kingdom of (the )?serbs.*)\s*$/i,LA('Kingdom of Yugoslavia','ユーゴスラビア王国','Königreich Jugoslawien','Королевство Югославия','Reino de Yugoslavia')],
      [/^\s*(gran colombia|greater colombia)\s*$/i,LA('Gran Colombia','大コロンビア','Großkolumbien','Великая Колумбия','Gran Colombia')],
      [/^\s*congo free state\s*$/i,LA('Congo Free State','コンゴ自由国','Kongo-Freistaat','Свободное государство Конго','Estado Libre del Congo')],
      [/^\s*(french indochina|indochina)\s*$/i,LA('French Indochina','仏領インドシナ','Französisch-Indochina','Французский Индокитай','Indochina francesa')],
      [/^\s*kingdom of (egypt)\s*$/i,LA('Kingdom of Egypt','エジプト王国','Königreich Ägypten','Королевство Египет','Reino de Egipto')],
      [/^\s*kingdom of (iraq)\s*$/i,LA('Kingdom of Iraq','イラク王国','Königreich Irak','Королевство Ирак','Reino de Irak')],
      [/^\s*(manchuria|manchoukuo)\s*$/i,LA('Manchuria','満洲','Mandschurei','Маньчжурия','Manchuria')],
      [/^\s*(cochin ?china)\s*$/i,LA('Cochin China','コーチシナ','Cochinchina','Кохинхина','Cochinchina')],
      [/^\s*(gold coast)\s*$/i,LA('Gold Coast','ゴールドコースト','Goldküste','Золотой Берег','Costa del Oro')],
      [/^\s*(east prussia)\s*$/i,LA('East Prussia','東プロイセン','Ostpreußen','Восточная Пруссия','Prusia Oriental')],
      /* (#R110) further historical entities seen in the 1900–1960 snapshots ("昔の国名にするのは…未対応の国がまだ残ってる") —
         colonial federations & territories, interwar/occupation states, and the more recognisable pre-colonial kingdoms. */
      [/^\s*french west africa\s*$/i,LA('French West Africa','フランス領西アフリカ','Französisch-Westafrika','Французская Западная Африка','África Occidental Francesa')],
      [/^\s*french equatorial africa\s*$/i,LA('French Equatorial Africa','フランス領赤道アフリカ','Französisch-Äquatorialafrika','Французская Экваториальная Африка','África Ecuatorial Francesa')],
      [/^\s*french indo-?china\s*$/i,LA('French Indo-China','フランス領インドシナ','Französisch-Indochina','Французский Индокитай','Indochina francesa')],
      [/^\s*french somaliland\s*$/i,LA('French Somaliland','フランス領ソマリランド','Französisch-Somaliland','Французский Сомалиленд','Somalilandia Francesa')],
      [/^\s*french cameroons?\s*$/i,LA('French Cameroons','フランス領カメルーン','Französisch-Kamerun','Французский Камерун','Camerún Francés')],
      [/^\s*belgian congo\s*$/i,LA('Belgian Congo','ベルギー領コンゴ','Belgisch-Kongo','Бельгийское Конго','Congo Belga')],
      [/^\s*british east africa\s*$/i,LA('British East Africa','イギリス領東アフリカ','Britisch-Ostafrika','Британская Восточная Африка','África Oriental Británica')],
      [/^\s*british somaliland\s*$/i,LA('British Somaliland','イギリス領ソマリランド','Britisch-Somaliland','Британский Сомалиленд','Somalilandia Británica')],
      [/^\s*italian somaliland\s*$/i,LA('Italian Somaliland','イタリア領ソマリランド','Italienisch-Somaliland','Итальянское Сомали','Somalia Italiana')],
      [/^\s*anglo-?egypt(ia|io)n sudan\s*$/i,LA('Anglo-Egyptian Sudan','英埃領スーダン','Anglo-Ägyptischer Sudan','Англо-Египетский Судан','Sudán Anglo-Egipcio')],
      [/^\s*german south-?west africa\s*$/i,LA('German South-West Africa','ドイツ領南西アフリカ','Deutsch-Südwestafrika','Германская Юго-Западная Африка','África del Sudoeste Alemana')],
      [/^\s*german e(ast|\.) africa.*$/i,LA('German East Africa','ドイツ領東アフリカ','Deutsch-Ostafrika','Германская Восточная Африка','África Oriental Alemana')],
      [/^\s*portuguese east africa\s*$/i,LA('Portuguese East Africa','ポルトガル領東アフリカ','Portugiesisch-Ostafrika','Португальская Восточная Африка','África Oriental Portuguesa')],
      [/^\s*portuguese guinea\s*$/i,LA('Portuguese Guinea','ポルトガル領ギニア','Portugiesisch-Guinea','Португальская Гвинея','Guinea Portuguesa')],
      [/^\s*spanish guinea\s*$/i,LA('Spanish Guinea','スペイン領ギニア','Spanisch-Guinea','Испанская Гвинея','Guinea Española')],
      [/^\s*spanish morocco\s*$/i,LA('Spanish Morocco','スペイン領モロッコ','Spanisch-Marokko','Испанское Марокко','Marruecos Español')],
      [/^\s*spanish sahara\s*$/i,LA('Spanish Sahara','スペイン領サハラ','Spanisch-Sahara','Испанская Сахара','Sahara Español')],
      [/^\s*rio de oro\s*$/i,LA('Rio de Oro','リオ・デ・オロ','Río de Oro','Рио-де-Оро','Río de Oro')],
      [/^\s*kamerun\s*$/i,LA('Kamerun','ドイツ領カメルーン','Kamerun','Камерун (нем.)','Camerún alemán')],
      [/^\s*togoland\s*$/i,LA('Togoland','トーゴランド','Togoland','Тоголенд','Togolandia')],
      [/^\s*northern rhodesia\s*$/i,LA('Northern Rhodesia','北ローデシア','Nordrhodesien','Северная Родезия','Rodesia del Norte')],
      [/^\s*southern rhodesia\s*$/i,LA('Southern Rhodesia','南ローデシア','Südrhodesien','Южная Родезия','Rodesia del Sur')],
      [/^\s*netherlands indies\s*$/i,LA('Netherlands Indies','オランダ領東インド','Niederländisch-Indien','Голландская Ост-Индия','Indias Orientales Neerlandesas')],
      [/^\s*trucial oman\s*$/i,LA('Trucial Oman','トルーシャル・オマーン','Vertragsoman','Договорный Оман','Omán de la Tregua')],
      [/^\s*muscat and oman\s*$/i,LA('Muscat and Oman','マスカット・オマーン','Maskat und Oman','Маскат и Оман','Mascate y Omán')],
      [/^\s*hejaz\s*$/i,LA('Hejaz','ヒジャーズ','Hedschas','Хиджаз','Hiyaz')],
      [/^\s*union of south africa\s*$/i,LA('Union of South Africa','南アフリカ連邦','Südafrikanische Union','Южно-Африканский Союз','Unión Sudafricana')],
      [/^\s*orange free state\s*$/i,LA('Orange Free State','オレンジ自由国','Oranje-Freistaat','Оранжевое Свободное государство','Estado Libre de Orange')],
      [/^\s*transvaal\s*$/i,LA('Transvaal','トランスヴァール共和国','Transvaal','Трансвааль','Transvaal')],
      [/^\s*cape colony\s*$/i,LA('Cape Colony','ケープ植民地','Kapkolonie','Капская колония','Colonia del Cabo')],
      [/^\s*natal\s*$/i,LA('Natal','ナタール','Natal','Наталь','Natal')],
      [/^\s*zululand\s*$/i,LA('Zululand','ズールーランド','Zululand','Зулуленд','Zululandia')],
      [/^\s*sokoto caliphate\s*$/i,LA('Sokoto Caliphate','ソコト帝国','Kalifat von Sokoto','Халифат Сокото','Califato de Sokoto')],
      [/^\s*asante\s*$/i,LA('Asante','アシャンティ王国','Aschanti','Ашанти','Ashanti')],
      [/^\s*buganda\s*$/i,LA('Buganda','ブガンダ王国','Buganda','Буганда','Buganda')],
      [/^\s*bunyoro\s*$/i,LA('Bunyoro','ブニョロ王国','Bunyoro','Буньоро','Bunyoro')],
      [/^\s*oyo\s*$/i,LA('Oyo','オヨ王国','Oyo','Ойо','Oyo')],
      [/^\s*kanem-?bornu\s*$/i,LA('Kanem-Bornu','カネム・ボルヌ帝国','Kanem-Bornu','Канем-Борну','Kanem-Bornu')],
      [/^\s*manchu empire\s*$/i,LA('Manchu Empire','満洲帝国','Mandschurisches Reich','Маньчжурская империя','Imperio manchú')],
      [/^\s*malaya\s*$/i,LA('Malaya','マラヤ','Malaya','Малайя','Malaca')],
      [/^\s*annam\s*$/i,LA('Annam','安南','Annam','Аннам','Annam')],
      [/^\s*tonkin\s*$/i,LA('Tonkin','トンキン','Tonkin','Тонкин','Tonkín')],
      [/^\s*mandatory palestine\s*$/i,LA('Mandatory Palestine','委任統治領パレスチナ','Mandatsgebiet Palästina','Подмандатная Палестина','Palestina del Mandato')],
      [/^\s*danzig\s*$/i,LA('Danzig','ダンツィヒ自由市','Danzig','Данциг','Dánzig')],
      [/^\s*saar( protectorate)?\s*$/i,LA('Saar Protectorate','ザール保護領','Saarprotektorat','Саарский протекторат','Protectorado del Sarre')],
      [/^\s*east germany\s*$/i,LA('East Germany','東ドイツ','Ostdeutschland (DDR)','Восточная Германия','Alemania Oriental')],
      [/^\s*west germany\s*$/i,LA('West Germany','西ドイツ','Westdeutschland','Западная Германия','Alemania Occidental')],
      /* (#R130) Cold-War Vietnam / Yemen splits — the era LABELS localized to match the new _VANISHED identities. */
      [/^\s*south vietnam\s*$/i,LA('South Vietnam','南ベトナム','Südvietnam','Южный Вьетнам','Vietnam del Sur')],
      [/^\s*north vietnam\s*$/i,LA('North Vietnam','北ベトナム','Nordvietnam','Северный Вьетнам','Vietnam del Norte')],
      [/^\s*south yemen\s*$/i,LA('South Yemen','南イエメン','Südjemen','Южный Йемен','Yemen del Sur')],
      [/^\s*north yemen\s*$/i,LA('North Yemen','北イエメン','Nordjemen','Северный Йемен','Yemen del Norte')],
      [/^\s*dominion of newfoundland\s*$/i,LA('Dominion of Newfoundland','ニューファンドランド自治領','Dominion Neufundland','Доминион Ньюфаундленд','Dominio de Terranova')],
      [/^\s*united kingdom of great britain and ireland\s*$/i,LA('United Kingdom of Great Britain and Ireland','グレートブリテン・アイルランド連合王国','Vereinigtes Königreich Großbritannien und Irland','Соединённое Королевство Великобритании и Ирландии','Reino Unido de Gran Bretaña e Irlanda')],
      [/^\s*sweden[\s–-]+norway\s*$/i,LA('Sweden–Norway','スウェーデン・ノルウェー連合','Schweden-Norwegen','Швеция и Норвегия','Suecia y Noruega')],
      [/^\s*chinese warlords\s*$/i,LA('Chinese Warlords','中国軍閥','Chinesische Warlords','Китайские милитаристы','Señores de la guerra chinos')],
      [/^\s*xinjiang\s*$/i,LA('Xinjiang','新疆','Xinjiang','Синьцзян','Sinkiang')],
      [/^\s*far eastern (ssr|republic)\s*$/i,LA('Far Eastern Republic','極東共和国','Fernöstliche Republik','Дальневосточная республика','República del Lejano Oriente')],
      [/^\s*white russia\s*$/i,LA('White Russia','白ロシア','Weißrussland','Белоруссия','Rusia Blanca')],
      [/^\s*south russia\s*$/i,LA('South Russia','南ロシア','Südrussland','Юг России','Rusia del Sur')],
      [/^\s*rattanakosin kingdom\s*$/i,LA('Rattanakosin Kingdom','ラッタナコーシン王国','Rattanakosin-Königreich','Королевство Раттанакосин','Reino de Rattanakosin')],
      [/^\s*kingdom of hawaii\s*$/i,LA('Kingdom of Hawaii','ハワイ王国','Königreich Hawaiʻi','Гавайское королевство','Reino de Hawái')],
      [/^\s*kingdom of brazil\s*$/i,LA('Kingdom of Brazil','ブラジル王国','Königreich Brasilien','Королевство Бразилия','Reino de Brasil')],
      [/^\s*sult[ia]nate of zanzibar\s*$/i,LA('Sultanate of Zanzibar','ザンジバル・スルタン国','Sultanat Sansibar','Занзибарский султанат','Sultanato de Zanzíbar')],
      [/^\s*bosnia-herzegovina\s*$/i,LA('Bosnia-Herzegovina','ボスニア・ヘルツェゴビナ','Bosnien und Herzegowina','Босния и Герцеговина','Bosnia y Herzegovina')],
      [/^\s*arabia\s*$/i,LA('Arabia','アラビア','Arabien','Аравия','Arabia')],
      [/^\s*imperial japan\s*$/i,LA('Imperial Japan','大日本帝国','Kaiserreich Japan','Японская империя','Imperio del Japón')],
      /* (#R110) modern countries that appear in the data only with a "(Coloniser)" suffix (French/Portuguese/… rule) —
         listed here so the suffix handler can localize the BASE in DE/RU/ES too (countryStats has no DE/RU/ES country
         names), e.g. Syria (France) → Syrien (Frankreich) / Сирия (Франция) / Siria (Francia). */
      [/^\s*algeria\s*$/i,LA('Algeria','アルジェリア','Algerien','Алжир','Argelia')],
      [/^\s*angola\s*$/i,LA('Angola','アンゴラ','Angola','Ангола','Angola')],
      [/^\s*congo\s*$/i,LA('Congo','コンゴ','Kongo','Конго','Congo')],
      [/^\s*madagascar\s*$/i,LA('Madagascar','マダガスカル','Madagaskar','Мадагаскар','Madagascar')],
      [/^\s*morocco\s*$/i,LA('Morocco','モロッコ','Marokko','Марокко','Marruecos')],
      [/^\s*mozambique\s*$/i,LA('Mozambique','モザンビーク','Mosambik','Мозамбик','Mozambique')],
      [/^\s*syria\s*$/i,LA('Syria','シリア','Syrien','Сирия','Siria')],
      [/^\s*eritrea\s*$/i,LA('Eritrea','エリトリア','Eritrea','Эритрея','Eritrea')],
      [/^\s*jamaica\s*$/i,LA('Jamaica','ジャマイカ','Jamaika','Ямайка','Jamaica')],
      [/^\s*rwanda\s*$/i,LA('Rwanda','ルワンダ','Ruanda','Руанда','Ruanda')],
      [/^\s*yemen\s*$/i,LA('Yemen','イエメン','Jemen','Йемен','Yemen')],
      [/^\s*guinea-?bissau\s*$/i,LA('Guinea-Bissau','ギニアビサウ','Guinea-Bissau','Гвинея-Бисау','Guinea-Bisáu')],
      [/^\s*libya\s*$/i,LA('Libya','リビア','Libyen','Ливия','Libia')],
      [/^\s*martinique\s*$/i,LA('Martinique','マルティニーク','Martinique','Мартиника','Martinica')],
      /* (#R111) remaining untranslated names ("未対応の国がまだ残ってる") — (a) modern territories the aourednik data
         spells differently from Natural Earth so they never matched (United States, Gambia The, Swaziland…);
         (b) more colonial / interwar territories; (c) recognisable pre-colonial polities (JP katakana + RU Cyrillic;
         DE/ES keep the proper noun where there is no distinct local form). */
      [/^\s*united states\s*$/i,LA('United States','アメリカ合衆国','Vereinigte Staaten','США','Estados Unidos')],
      [/^\s*china\s*$/i,LA('China','中国','China','Китай','China')],
      [/^\s*norway\s*$/i,LA('Norway','ノルウェー','Norwegen','Норвегия','Noruega')],
      [/^\s*western sahara\s*$/i,LA('Western Sahara','西サハラ','Westsahara','Западная Сахара','Sáhara Occidental')],
      [/^\s*antarctica\s*$/i,LA('Antarctica','南極','Antarktis','Антарктида','Antártida')],
      [/^\s*bahamas(,? the)?\s*$/i,LA('The Bahamas','バハマ','Bahamas','Багамы','Bahamas')],
      [/^\s*(the )?gambia(,? the)?\s*$/i,LA('The Gambia','ガンビア','Gambia','Гамбия','Gambia')],
      [/^\s*tanzania, united republic of\s*$/i,LA('Tanzania, United Republic of','タンザニア','Tansania','Танзания','Tanzania')],
      [/^\s*swaziland\s*$/i,LA('Swaziland','スワジランド','Swasiland','Свазиленд','Suazilandia')],
      [/^\s*trinidad\s*$/i,LA('Trinidad','トリニダード','Trinidad','Тринидад','Trinidad')],
      [/^\s*rapa nui\s*$/i,LA('Rapa Nui','ラパ・ヌイ','Rapa Nui','Рапануи','Rapa Nui')],
      [/^\s*wallis and futuna( islands)?\s*$/i,LA('Wallis and Futuna Islands','ウォリス・フツナ','Wallis und Futuna','Уоллис и Футуна','Wallis y Futuna')],
      [/^\s*french guiana\s*$/i,LA('French Guiana','仏領ギアナ','Französisch-Guayana','Французская Гвиана','Guayana Francesa')],
      [/^\s*guadeloupe\s*$/i,LA('Guadeloupe','グアドループ','Guadeloupe','Гваделупа','Guadalupe')],
      [/^\s*netherlands antilles\s*$/i,LA('Netherlands Antilles','オランダ領アンティル','Niederländische Antillen','Нидерландские Антильские острова','Antillas Neerlandesas')],
      [/^\s*korea, republic of\s*$/i,LA('Korea, Republic of','大韓民国','Republik Korea','Республика Корея','República de Corea')],
      [/^\s*korea, democratic people'?s republic of\s*$/i,LA('Korea, Democratic People\'s Republic of','朝鮮民主主義人民共和国','Nordkorea','КНДР','Corea del Norte')],
      [/^\s*korea\s*$/i,LA('Korea','朝鮮','Korea','Корея','Corea')],
      [/^\s*dutch east indies\s*$/i,LA('Dutch East Indies','オランダ領東インド','Niederländisch-Indien','Голландская Ост-Индия','Indias Orientales Neerlandesas')],
      [/^\s*german empire\s*$/i,LA('German Empire','ドイツ帝国','Deutsches Kaiserreich','Германская империя','Imperio alemán')],
      [/^\s*king(dom|fom) of italy\s*$/i,LA('Kingdom of Italy','イタリア王国','Königreich Italien','Королевство Италия','Reino de Italia')],
      [/^\s*cyr[ae]n[ae]ica.*$/i,LA('Cyrenaica','キレナイカ','Kyrenaika','Киренаика','Cirenaica')],
      [/^\s*tripolitan.*$/i,LA('Tripolitania','トリポリタニア','Tripolitanien','Триполитания','Tripolitania')],
      [/^\s*fezzan.*$/i,LA('Fezzan','フェザーン','Fessan','Феццан','Fezán')],
      [/^\s*arabia \(nejd\)\s*$/i,LA('Arabia (Nejd)','ナジュド（アラビア）','Nadschd (Arabien)','Неджд (Аравия)','Néyed (Arabia)')],
      [/^\s*hail\s*$/i,LA('Hail','ハーイル','Hail','Хаиль','Hail')],
      [/^\s*british guiana\s*$/i,LA('British Guiana','英領ギアナ','Britisch-Guayana','Британская Гвиана','Guayana Británica')],
      [/^\s*dutch gui(ana|nea)\s*$/i,LA('Dutch Guiana','オランダ領ギアナ','Niederländisch-Guayana','Голландская Гвиана','Guayana Neerlandesa')],
      [/^\s*southern cameroons?\s*$/i,LA('Southern Cameroons','南カメルーン','Südkamerun','Южный Камерун','Camerún del Sur')],
      [/^\s*gilbert and el?lice islands\s*$/i,LA('Gilbert and Ellice Islands','ギルバート・エリス諸島','Gilbert- und Ellice-Inseln','Острова Гилберта и Эллис','Islas Gilbert y Ellice')],
      [/^\s*new hebrides\s*$/i,LA('New Hebrides','ニューヘブリディーズ','Neue Hebriden','Новые Гебриды','Nuevas Hébridas')],
      [/^\s*wal[bv]is bay\s*$/i,LA('Walvis Bay','ウォルビスベイ','Walfischbai','Уолфиш-Бей','Bahía de Walvis')],
      [/^\s*saipan\s*$/i,LA('Saipan','サイパン','Saipan','Сайпан','Saipán')],
      [/^\s*british protectorate\s*$/i,LA('British Protectorate','イギリス保護領','Britisches Protektorat','Британский протекторат','Protectorado británico')],
      [/^\s*central asian khanates\s*$/i,LA('Central Asian Khanates','中央アジアのハン国','Zentralasiatische Khanate','Среднеазиатские ханства','Kanatos de Asia Central')],
      [/^\s*m.?ori\s*$/i,LA('Māori','マオリ','Māori','Маори','Maorí')],
      [/^\s*accra\s*$/i,LA('Accra','アクラ','Accra','Аккра','Acra')],
      [/^\s*barotse\s*$/i,LA('Barotse','バロツェ','Barotse','Баротсе','Barotse')],
      [/^\s*borgu states\s*$/i,LA('Borgu States','ボルグ諸国','Borgu-Staaten','Государства Боргу','Estados de Borgu')],
      [/^\s*calabar\s*$/i,LA('Calabar','カラバル','Calabar','Калабар','Calabar')],
      [/^\s*cotonou\s*$/i,LA('Cotonou','コトヌー','Cotonou','Котону','Cotonú')],
      [/^\s*futa jal.?n\s*$/i,LA('Futa Jallon','フータ・ジャロン','Futa Dschallon','Фута-Джаллон','Futa Yallón')],
      [/^\s*futa toro\s*$/i,LA('Futa Toro','フータ・トロ','Futa Toro','Фута-Торо','Futa Toro')],
      [/^\s*griqualand west\s*$/i,LA('Griqualand West','西グリカランド','Griqualand West','Западный Гриквеленд','Griqualand Occidental')],
      [/^\s*ibadan\s*$/i,LA('Ibadan','イバダン','Ibadan','Ибадан','Ibadán')],
      [/^\s*imerina\s*$/i,LA('Imerina','イメリナ','Imerina','Имерина','Imerina')],
      [/^\s*kong\s*$/i,LA('Kong','コング帝国','Kong','Конг','Kong')],
      [/^\s*kuba\s*$/i,LA('Kuba','クバ王国','Kuba','Куба','Kuba')],
      [/^\s*lagos\s*$/i,LA('Lagos','ラゴス','Lagos','Лагос','Lagos')],
      [/^\s*lozi\s*$/i,LA('Lozi','ロジ','Lozi','Лози','Lozi')],
      [/^\s*luba\s*$/i,LA('Luba','ルバ王国','Luba','Луба','Luba')],
      [/^\s*lunda\s*$/i,LA('Lunda','ルンダ王国','Lunda','Лунда','Lunda')],
      [/^\s*mbailundu\s*$/i,LA('Mbailundu','ンバイルンドゥ','Mbailundu','Мбаилунду','Mbailundu')],
      [/^\s*mossi states\s*$/i,LA('Mossi States','モシ諸王国','Mossi-Staaten','Государства Моси','Estados Mossi')],
      [/^\s*ndebele\s*$/i,LA('Ndebele','ンデベレ','Ndebele','Ндебеле','Ndebele')],
      [/^\s*nguni\s*$/i,LA('Nguni','ングニ','Nguni','Нгуни','Nguni')],
      [/^\s*ngwato\s*$/i,LA('Ngwato','ングワト','Ngwato','Нгвато','Ngwato')],
      [/^\s*opobo\s*$/i,LA('Opobo','オポボ','Opobo','Опобо','Opobo')],
      [/^\s*ovimbundu\s*$/i,LA('Ovimbundu','オヴィンブンドゥ','Ovimbundu','Овимбунду','Ovimbundu')],
      [/^\s*shona\s*$/i,LA('Shona','ショナ','Shona','Шона','Shona')],
      [/^\s*teke\s*$/i,LA('Teke','テケ王国','Teke','Теке','Teke')],
      [/^\s*tukular caliphate\s*$/i,LA('Tukular Caliphate','トゥクロール帝国','Tukulor-Reich','Империя Тукулёр','Imperio tukulor')],
      [/^\s*yaka\s*$/i,LA('Yaka','ヤカ','Yaka','Яка','Yaka')],
      [/^\s*yeke\s*$/i,LA('Yeke','イェケ王国','Yeke','Йеке','Yeke')],
      /* (#R117) era names introduced by the CShapes 2.0 yearly borders (colonial-period display names) */
      [/^\s*french sudan\s*$/i,LA('French Sudan','フランス領スーダン','Französisch-Sudan','Французский Судан','Sudán Francés')],
      [/^\s*british guiana\s*$/i,LA('British Guiana','イギリス領ギアナ','Britisch-Guayana','Британская Гвиана','Guayana Británica')],
      [/^\s*british honduras\s*$/i,LA('British Honduras','イギリス領ホンジュラス','Britisch-Honduras','Британский Гондурас','Honduras Británica')],
      [/^\s*dutch guiana\s*$/i,LA('Dutch Guiana','オランダ領ギアナ','Niederländisch-Guayana','Нидерландская Гвиана','Guayana Neerlandesa')],
      [/^\s*french guinea\s*$/i,LA('French Guinea','フランス領ギニア','Französisch-Guinea','Французская Гвинея','Guinea Francesa')],
      [/^\s*french togoland\s*$/i,LA('French Togoland','フランス領トーゴランド','Französisch-Togo','Французское Того','Togolandia Francesa')],
      [/^\s*ubangi-?shari\s*$/i,LA('Ubangi-Shari','ウバンギ・シャリ','Ubangi-Schari','Убанги-Шари','Ubangui-Chari')],
      [/^\s*french congo\s*$/i,LA('French Congo','フランス領コンゴ','Französisch-Kongo','Французское Конго','Congo Francés')],
      [/^\s*ruanda-?urundi\s*$/i,LA('Ruanda-Urundi','ルアンダ＝ウルンディ','Ruanda-Urundi','Руанда-Урунди','Ruanda-Urundi')],
      [/^\s*south west africa\s*$/i,LA('South West Africa','南西アフリカ','Südwestafrika','Юго-Западная Африка','África del Sudoeste')],
      [/^\s*north yemen\s*$/i,LA('North Yemen','北イエメン','Nordjemen','Северный Йемен','Yemen del Norte')],
      [/^\s*south yemen\s*$/i,LA('South Yemen','南イエメン','Südjemen','Южный Йемен','Yemen del Sur')],
      [/^\s*north vietnam\s*$/i,LA('North Vietnam','北ベトナム','Nordvietnam','Северный Вьетнам','Vietnam del Norte')],
      [/^\s*south vietnam\s*$/i,LA('South Vietnam','南ベトナム','Südvietnam','Южный Вьетнам','Vietnam del Sur')],
      [/^\s*north borneo\s*$/i,LA('North Borneo','北ボルネオ','Nordborneo','Северное Борнео','Borneo del Norte')],
      [/^\s*german new guinea\s*$/i,LA('German New Guinea','ドイツ領ニューギニア','Deutsch-Neuguinea','Германская Новая Гвинея','Nueva Guinea Alemana')],
      [/^\s*new guinea\s*$/i,LA('New Guinea','ニューギニア','Neuguinea','Новая Гвинея','Nueva Guinea')],
      [/^\s*papua and new guinea\s*$/i,LA('Papua and New Guinea','パプア・ニューギニア','Papua und Neuguinea','Папуа и Новая Гвинея','Papúa y Nueva Guinea')],
      [/^\s*papua\s*$/i,LA('Papua','パプア','Papua','Папуа','Papúa')],
      [/^\s*new caledonia( and dependencies)?\s*$/i,LA('New Caledonia and Dependencies','ニューカレドニア','Neukaledonien','Новая Каледония','Nueva Caledonia')],
      [/^\s*french polynesia\s*$/i,LA('French Polynesia','フランス領ポリネシア','Französisch-Polynesien','Французская Полинезия','Polinesia Francesa')],
      [/^\s*emirate of bukhara\s*$/i,LA('Emirate of Bukhara','ブハラ・アミール国','Emirat Buchara','Бухарский эмират','Emirato de Bujará')],
      [/^\s*khanate of khiva\s*$/i,LA('Khanate of Khiva','ヒヴァ・ハン国','Khanat Chiwa','Хивинское ханство','Kanato de Jiva')],
      [/^\s*karafuto\s*$/i,LA('Karafuto','樺太','Karafuto','Карафуто','Karafuto')],
      [/^\s*straits settlements\s*$/i,LA('Straits Settlements','海峡植民地','Straits Settlements','Стрейтс-Сетлментс','Colonias del Estrecho')],
      [/^\s*federated malay states\s*$/i,LA('Federated Malay States','マレー連合州','Föderierte Malaiische Staaten','Федерированные малайские государства','Estados Malayos Federados')],
      [/^\s*unfederated malay states\s*$/i,LA('Unfederated Malay States','マレー非連合州','Unföderierte Malaiische Staaten','Нефедерированные малайские государства','Estados Malayos No Federados')],
      [/^\s*southern nigeria\s*$/i,LA('Southern Nigeria','南ナイジェリア','Südnigeria','Южная Нигерия','Nigeria del Sur')],
      [/^\s*northern nigeria\s*$/i,LA('Northern Nigeria','北ナイジェリア','Nordnigeria','Северная Нигерия','Nigeria del Norte')],
      [/^\s*oil rivers protectorate\s*$/i,LA('Oil Rivers Protectorate','オイル・リバーズ保護領','Oil-Rivers-Protektorat','Протекторат Ойл-Риверс','Protectorado de Oil Rivers')],
      [/^\s*british bechuanaland\s*$/i,LA('British Bechuanaland','イギリス領ベチュアナランド','Britisch-Betschuanaland','Британский Бечуаналенд','Bechuanalandia Británica')],
      [/^\s*federation of rhodesia and nyasaland\s*$/i,LA('Federation of Rhodesia and Nyasaland','ローデシア・ニヤサランド連邦','Föderation von Rhodesien und Njassaland','Федерация Родезии и Ньясаленда','Federación de Rodesia y Niasalandia')],
      [/^\s*federation of south arabia\s*$/i,LA('Federation of South Arabia','南アラビア連邦','Südarabische Föderation','Федерация Южной Аравии','Federación de Arabia del Sur')],
      [/^\s*east aden protectorate\s*$/i,LA('East Aden Protectorate','東アデン保護領','Ost-Aden-Protektorat','Восточный Аденский протекторат','Protectorado de Adén Oriental')],
      [/^\s*aden\s*$/i,LA('Aden','アデン','Aden','Аден','Adén')],
      [/^\s*(british )?solomon islands\s*$/i,LA('British Solomon Islands','ソロモン諸島','Salomonen','Соломоновы Острова','Islas Salomón')],
      [/^\s*german solomon islands\s*$/i,LA('German Solomon Islands','ドイツ領ソロモン諸島','Deutsche Salomonen','Германские Соломоновы острова','Islas Salomón Alemanas')],
      [/^\s*portuguese timor\s*$/i,LA('Portuguese Timor','ポルトガル領ティモール','Portugiesisch-Timor','Португальский Тимор','Timor Portugués')],
      [/^\s*west irian\s*$/i,LA('West Irian','西イリアン','West-Irian','Западный Ириан','Irián Occidental')],
      [/^\s*dutch new guinea\s*$/i,LA('Dutch New Guinea','オランダ領ニューギニア','Niederländisch-Neuguinea','Нидерландская Новая Гвинея','Nueva Guinea Neerlandesa')],
      [/^\s*inini\s*$/i,LA('Inini','イニニ','Inini','Инини','Inini')],
      [/^\s*kingdom of hawaii\s*$/i,LA('Kingdom of Hawaii','ハワイ王国','Königreich Hawaiʻi','Гавайское королевство','Reino de Hawái')],
      [/^\s*republic of hawaii\s*$/i,LA('Republic of Hawaii','ハワイ共和国','Republik Hawaii','Республика Гавайи','República de Hawái')],
      [/^\s*alaska\s*$/i,LA('Alaska','アラスカ','Alaska','Аляска','Alaska')],
      [/^\s*hawaii\s*$/i,LA('Hawaii','ハワイ','Hawaii','Гавайи','Hawái')],
      [/^\s*puerto rico\s*$/i,LA('Puerto Rico','プエルトリコ','Puerto Rico','Пуэрто-Рико','Puerto Rico')],
      [/^\s*guadeloupe\s*$/i,LA('Guadeloupe','グアドループ','Guadeloupe','Гваделупа','Guadalupe')],
      [/^\s*r(e|é)union\s*$/i,LA('Réunion','レユニオン','Réunion','Реюньон','Reunión')],
      [/^\s*irish free state\s*$/i,LA('Irish Free State','アイルランド自由国','Irischer Freistaat','Ирландское Свободное государство','Estado Libre Irlandés')],
      [/^\s*korean empire\s*$/i,LA('Korean Empire','大韓帝国','Kaiserreich Korea','Корейская империя','Imperio Coreano')],
      [/^\s*korea\s*$/i,LA('Korea','朝鮮','Korea','Корея','Corea')],
      [/^\s*lagos colony\s*$/i,LA('Lagos Colony','ラゴス植民地','Kolonie Lagos','Колония Лагос','Colonia de Lagos')],
      [/^\s*north-?eastern rhodesia\s*$/i,LA('North-Eastern Rhodesia','北東ローデシア','Nordostrhodesien','Северо-Восточная Родезия','Rodesia del Nordeste')],
      [/^\s*north-?western rhodesia\s*$/i,LA('North-Western Rhodesia','北西ローデシア','Nordwestrhodesien','Северо-Западная Родезия','Rodesia del Noroeste')],
      [/^\s*gaza\s*$/i,LA('Gaza','ガザ','Gaza','Газа','Gaza')],
      [/^\s*west bank\s*$/i,LA('West Bank','ヨルダン川西岸','Westjordanland','Западный берег','Cisjordania')],
      [/^\s*ottoman empire\s*$/i,LA('Ottoman Empire','オスマン帝国','Osmanisches Reich','Османская империя','Imperio Otomano')],
      [/^\s*(first |second )?samori empire\s*$/i,LA('Samori Empire','サモリ帝国','Samori-Reich','Империя Самори','Imperio de Samori')],
      [/^\s*sultanate of utetera\s*$/i,LA('Sultanate of Utetera','ウテテラ・スルタン国','Sultanat Utetera','Султанат Утетера','Sultanato de Utetera')],
      [/^\s*ato trading confederacy\s*$/i,LA('Ato Trading Confederacy','アト交易連合','Ato-Handelskonföderation','Торговая конфедерация Ато','Confederación comercial Ato')],
      [/^\s*mirambo.*$/i,LA('Mirambo','ミランボの領域','Mirambo-Reich','Государство Мирамбо','Reino de Mirambo')],
      [/^\s*emirate of bin shal.*$/i,LA('Emirate of Bin Shalan','ビン・シャアラーン首長国','Emirat Bin Schaalan','Эмират Бин-Шаалан','Emirato de Bin Shalan')]
    ];
    /* (#R110) coloniser / possessor names for the "(France)/(UK)/(Portugal)…" suffix the aourednik data appends to
       many interwar colonies, plus the 1945 occupation zones (Germany (USA)…). */
    const _COLONIZER={france:LA('France','フランス','Frankreich','Франция','Francia'),uk:LA('United Kingdom','イギリス','Vereinigtes Königreich','Великобритания','Reino Unido'),gb:LA('United Kingdom','イギリス','Vereinigtes Königreich','Великобритания','Reino Unido'),usa:LA('United States','アメリカ','USA','США','EE. UU.'),us:LA('United States','アメリカ','USA','США','EE. UU.'),portugal:LA('Portugal','ポルトガル','Portugal','Португалия','Portugal'),italy:LA('Italy','イタリア','Italien','Италия','Italia'),it:LA('Italy','イタリア','Italien','Италия','Italia'),belgium:LA('Belgium','ベルギー','Belgien','Бельгия','Bélgica'),spain:LA('Spain','スペイン','Spanien','Испания','España'),netherlands:LA('Netherlands','オランダ','Niederlande','Нидерланды','Países Bajos'),germany:LA('Germany','ドイツ','Deutschland','Германия','Alemania'),japan:LA('Japan','日本','Japan','Япония','Japón'),ru:LA('Russia','ロシア','Russland','Россия','Rusia'),russia:LA('Russia','ロシア','Russland','Россия','Rusia'),ussr:LA('Soviet Union','ソ連','UdSSR','СССР','URSS'),egypt:LA('Egypt','エジプト','Ägypten','Египет','Egipto'),'south africa':LA('South Africa','南アフリカ','Südafrika','ЮАР','Sudáfrica'),ethiopia:LA('Ethiopia','エチオピア','Äthiopien','Эфиопия','Etiopía'),jordan:LA('Jordan','ヨルダン','Jordanien','Иордания','Jordania'),indonesia:LA('Indonesia','インドネシア','Indonesien','Индонезия','Indonesia'),denmark:LA('Denmark','デンマーク','Dänemark','Дания','Dinamarca'),'austria-hungary':LA('Austria-Hungary','オーストリア＝ハンガリー','Österreich-Ungarn','Австро-Венгрия','Austria-Hungría'),australia:LA('Australia','オーストラリア','Australien','Австралия','Australia'),china:LA('China','中国','China','Китай','China'),joseon:LA('Joseon','李氏朝鮮','Joseon','Чосон','Joseon')};   /* (#R117) owners used by the CShapes era names */
    function _eraLocName(nm){ try{ const lg=(typeof HOST.lang!=='undefined')?HOST.lang:'en'; if(lg==='en') return null; const low0=String(nm||'').trim(); if(!low0) return null;
      const _loc1=(low)=>{
        /* (#R129) prefer the lifespan-CORRECT former state when several share a name (interwar "Kingdom of Yugoslavia"
           vs post-war "Yugoslavia (SFRY)" both match /yugoslav/i) — otherwise a 1925 label localized to the SFRY name. */
        const HS=window.IntMapHistStates; if(HS&&HS.STATES){ let pick=null, matched=false, y=null;
          try{ if(window.IntMapTime&&window.IntMapTime.year&&(!window.IntMapTime.isLive||!window.IntMapTime.isLive())) y=window.IntMapTime.year(); }catch(_){}
          for(const S of HS.STATES){ const re=HS.hbRe&&HS.hbRe(S.code); if(!(re&&re.test(low))) continue; matched=true;
            const n=S.name&&_LTB.arr(S.name); if(!(n&&n!==low)) continue;
            if(y!=null&&S.from&&S.to){ const a=+new Date(S.from+'T00:00:00Z'),b=+new Date(S.to+'T23:59:59Z'),t=+new Date(y+'-07-01T00:00:00Z'); if(isFinite(t)&&t>=a&&t<=b) return n; }   /* era-correct wins outright */
            if(!pick) pick=n; }
          if(pick) return pick;   /* else first regex match (legacy behaviour) */ }
        for(const V of _VANISHED){ if(V.re.test(low)){ const n=V.nm&&_LTB.arr(V.nm); if(n&&n!==low) return n; } }
        for(const E of _ERA_LOC){ if(E[0].test(low)){ const n=_LTB.arr(E[1]); if(n&&n!==low) return n; } }
        const cm=_COLONIZER[_normNm(low)]; if(cm){ const n=_LTB.arr(cm); if(n) return n; }   /* the major powers double as country-name localizations (Germany/Japan… occupation-zone bases) */
        try{ if(typeof countryStats!=='undefined'&&countryStats){ const key=_normNm(low); for(const c in countryStats){ const s=countryStats[c]; if(s&&s.nameEn&&_normNm(s.nameEn)===key){ const d=(s.name&&_LTB.arr(s.name))||((lg==='jp'&&s.nameJp)?s.nameJp:s.nameEn); if(d&&d!==low) return d; } } } }catch(_){}   /* modern base (Algeria, Syria…) → its localized present-day name (JP via nameJp, matching tagSame; DE/RU/ES keep the English base as elsewhere on the era map) */
        return null; };
      const direct=_loc1(low0); if(direct) return direct;
      /* "(Coloniser)" / occupation suffix → localize the BASE + append the localized possessor (e.g. アルジェリア（フランス）) */
      const m=/^(.+?)\s*\(([^)]+)\)\s*$/.exec(low0);
      if(m){ const col=_COLONIZER[_normNm(m[2])]; if(col){ const lb=_loc1(m[1].trim())||m[1].trim(); const lc=_LTB.arr(col)||m[2]; return lb+(lg==='jp'?'（'+lc+'）':' ('+lc+')'); } }
      return null; }catch(_){ return null; } }
    /* ══ (#R410) THE ERA NAME IS A PROPERTY OF THE YEAR, NOT OF WHATEVER `countryStats` HAPPENS TO HOLD ══
       「地図の国名ラベルが、同じ画面の Countries 一覧と食い違う。」 TWO listeners answer the same clock and they
       do not run in step. This file draws the borders 45 ms after the event; js/time-countries.js waits
       340 ms and then AWAITS the country table, Maddison and the HDI series before it renames `countryStats`
       to the year's identities. `tagSame` read that rename (`s._histId`) — so the labels were always one
       travel behind, and NOTHING ever re-tagged them.
       MEASURED on the built site (tests/r410.spec.js), Europe at z4, English:
         · fresh page → 1916 with the Natural Earth attributes 8 s late — map «Germany / France / Italy /
           Spain / United Kingdom» beside a list saying «German Empire / French Third Republic / Kingdom of
           Italy / Spain / United Kingdom of Great Britain and Ireland». Still wrong 16 s later: the tag is
           written once, and the year never asks again.
         · 1939 → 1916 — «Nazi Germany» at 1916 (the year before's name), «Spanish Republic» (a state that
           began in 1931), «United Kingdom» (in 1916 it was the UK of Great Britain and Ireland).
       So the year is asked of the TABLES, which are pure functions of it — `IntMapHistId.at(code, year)` and
       `IntMapHistStates.activeAt(year)` — and `countryStats` supplies only the present-day names, read
       through `IntMapHistId._applied()` when an era rename is standing over them. The one thing that stays
       ordering-dependent (the table has not arrived AT ALL yet) is repaired by the `intmap-hist-identity`
       listener below rather than left on the screen.
       ⚠ THE FLOOR IS THE LIST'S FLOOR. js/time-countries.js overlays a year only from the Maddison floor
       upward and RESTORES the modern identities below it, so an era name applied at 1750 would be a NEW
       disagreement pointing the other way. Same expression, so the two cannot part company. */
    function tagSame(fc,year){ try{ if(!fc||!Array.isArray(fc.features)) return fc;
      const lg=(typeof HOST.lang!=='undefined')?HOST.lang:'en';
      const HID=window.IntMapHistId, HS=window.IntMapHistStates;
      const _disp=(o)=>((o.name&&_LTB.arr(o.name))||((lg==='jp'&&o.nameJp)?o.nameJp:o.nameEn)||o.nameEn||'');
      /* normalized present-day name -> the country's CURRENT localized display name (so an unchanged country shows its
         EXISTING label, e.g. "フランス" for a JP user — "国名が変わってない国は既存の国名ラベルのまま"). */
      const cur=new Map();
      try{ if(typeof countryStats!=='undefined'&&countryStats){ Object.values(countryStats).forEach(s=>{ if(s&&s.sov!==false){
        const disp=_disp(s);
        if(s.nameEn) cur.set(_normNm(s.nameEn),disp); if(s.nameJp) cur.set(_normNm(s.nameJp),disp); } }); } }catch(_){}
      /* (#R410) …and the PRESENT-DAY name of every country an era rename is currently standing over, so the
         polygon called "Germany" still resolves in a year Germany has no era entry of its own (1946–1948)
         while `countryStats.DEU` is still called something else. */
      try{ const sav=(HID&&HID._applied&&HID._applied())||null;
        if(sav) for(const code in sav){ const o=sav[code]||{}; const disp=_disp(o);
          if(o.nameEn) cur.set(_normNm(o.nameEn),disp); if(o.nameJp) cur.set(_normNm(o.nameJp),disp); } }catch(_){}
      const _y=(year!=null&&isFinite(year))?+year:null;
      const _mfloor=(window.IntMapMaddison&&window.IntMapMaddison.minYear)||1900;   /* js/time-countries.js's own floor, verbatim */
      const _d=(_y!=null&&_y>=_mfloor)?(_y+'-07-01T00:00:00Z'):null;
      /* successors a former state covers this year: their own era identity must NOT be applied on top of it —
         the Countries list hides those rows for the same reason (js/history.js `histStates.apply`). */
      const _cov=new Set();
      try{ if(_d&&HS&&HS.activeAt) HS.activeAt(_d).forEach(S=>((HS.succAt&&HS.succAt(S,_d))||S.succ||[]).forEach(c=>_cov.add(c))); }catch(_){}   /* (#R425) the successors it HELD on _d, not every one it ever aggregates — the same expression js/history.js hides by, so the labels and the list cannot part company over a country that was independent that year */
      /* (#R109) HistId single-country renamings (Germany→Weimar/Nazi/Empire, China→Qing/ROC, Italy, Persia, Siam, Dutch
         East Indies): the aourednik polygon keeps the MODERN name ("Germany") — map that name to the era display name
         (#R410) FOR THE YEAR BEING DRAWN, rather than to whatever rename happens to be standing in countryStats. */
      /* ⚠ (#R410) EVERY CODE `IntMapHistId` CAN RENAME MUST BE IN HERE, or the map keeps the modern name for a
         country the Countries list has already renamed. KOR and ETH were missing — measured at 1939, «Ethiopia»
         on the map against «Ethiopian Empire» in the list. tests/r410-checks ② compares the two tables, so the
         next identity added to js/history.js cannot silently miss the labels. (KOR is covered by the Korean
         former states for every year it has an entry, so it changes nothing today; it is here because a table
         that is right only by coincidence is the thing that check exists to stop.) */
      try{ const MODNM={CHN:['China'],DEU:['Germany'],ITA:['Italy'],IRN:['Iran','Persia'],THA:['Thailand','Siam'],IDN:['Indonesia','Dutch East Indies'],JPN:['Japan'],RUS:['Russia'],GBR:['United Kingdom'],ESP:['Spain'],PRT:['Portugal'],BRA:['Brazil'],EGY:['Egypt'],FRA:['France'],HUN:['Hungary'],KOR:['Korea','South Korea'],ETH:['Ethiopia','Abyssinia']};   /* (#R117/#R118) expanded identities */
        if(_d&&HID&&HID.at) for(const code in MODNM){ if(_cov.has(code)) continue;
          const e=HID.at(code,_y); if(!e||!e.name) continue; const disp=_LTB.arr(e.name); if(!disp) continue;
          MODNM[code].forEach(mn=>cur.set(_normNm(mn),disp)); } }catch(_){}
      /* ⚠ (#R410) …AND THE FORMER STATES, WHOSE POLYGON USUALLY CARRIES A SUCCESSOR'S MODERN NAME. At 1916 the
         CShapes polygons are «Russia» and «Japan» while the Countries rows are «Russian Empire» and «Empire of
         Japan» — the same disagreement, one table over. `hbRe` is the polygon-name pattern js/history.js has
         always kept for exactly this correspondence; the click path (`resolveHist`) used it and the LABEL never
         did. Only a state whose row is REALLY in countryStats counts, so the map can never name a polity the
         list is not listing (`histStates.apply` skips a state with no successor data at all). */
      const _former=[];
      try{ if(_d&&HS&&HS.activeAt&&HS.hbRe&&typeof countryStats!=='undefined'&&countryStats)
        HS.activeAt(_d).forEach(S=>{ const s=countryStats[S.code], re=HS.hbRe(S.code);
          if(s&&s._hist&&re) _former.push([re,_disp(s)]); }); }catch(_){}
      if(!cur.size&&!_former.length) return fc;
      fc.features.forEach(f=>{ try{ f.properties=f.properties||{};
        if(f.properties._corrected){ return; }   /* (#R105) _correctEra already set _same/_modName (Tibet→China, label suppressed) — don't re-tag */
        const nm=(f.properties.NAME||f.properties.name)||'';
        /* the former state is asked FIRST: at 1916 `countryStats.RUS` is still in `cur` (hidden, not removed),
           so a name lookup would answer «Russia» for the polygon the list is calling the Russian Empire. */
        let hit=null; for(const p of _former){ if(p[0].test(nm)){ hit=p[1]; break; } }
        if(!hit) hit=cur.get(_normNm(nm));
        if(hit){ f.properties._same=1; f.properties._modName=hit; }   /* unchanged → its present-day localized name */
        else { f.properties._same=0; f.properties._modName=null;      /* renamed / vanished → era name (imtb-lbl) */
          const loc=_eraLocName(nm); if(loc) f.properties._locName=loc; else if('_locName' in f.properties) delete f.properties._locName; }   /* (#R107) localized era label when known */
      }catch(_){} });
      return fc;
      }catch(_){ return fc; } }
    function apply(fc){ const mySeq=seq; shownFC=fc; try{ fc=tagSame(fc,shownYear); }catch(_){}
      /* (#R94m) set the data on the EXISTING source directly (not gated by isStyleLoaded) — that gate was why a
         SECOND year change didn't update: ensure() could transiently return false and block setData, so the
         borders stayed on the first year until you went back to Now. No re-assert timeouts → no flicker.
         (#R126) …but ONLY when the imtb LAYERS also still exist: a mid-swap exception can leave the source added
         with the layers missing, and this early return then bypassed ensure() forever — the "年代を変えても歴史的
         国境が表示されない" report (data was being set on a source no layer drew). Layers gone → fall through to
         ensure(), which idempotently recreates them. */
      try{ if(GE().layers.hasSource('imtb-src')&&GE().layers.has('imtb-line')){ GE().layers.setSourceData('imtb-src',fc); window._applyBorders(); _afterApply(); return; } }catch(_){}
      if(ensure()){ try{ GE().layers.setSourceData('imtb-src',fc); }catch(_){} try{ window._applyBorders(); }catch(_){} _afterApply(); }
      /* (#R140) was map.once('idle',…) — a ONE-SHOT 'idle' that NEVER fires on a busy/backgrounded map (another source
         still tile-loading), so the era layers were never created and the borders stayed absent until a reload
         ("歴史的国境が表示されない・再読み込みで治る"). Reuse the app's own whenStyleReady() (polls + hard-resolves after
         ~6s — the exact fix R41 made for this class of hang), and guard on the travel seq so a stale deferred apply
         from an earlier year can't clobber a newer one ("タイムマシンで変更しても国境線が変化しない"). */
      else whenStyleReady().then(()=>{ if(active&&seq===mySeq) apply(fc); }); }
    function clear(){ const was=active; active=false; shownY=null; shownCorr=false; shownYear=null; shownFC=null;
      /* (#R101) empty the era polygons + hide the near-invisible imtb-fill click-target so a returned-to-Now map has
         NO stale full-country interactive fill left over the present map (which would swallow place-label clicks —
         the "現在でも地名ラベルをクリックできない" half of the report). */
      try{ GE().layers.setSourceData('imtb-src',{type:'FeatureCollection',features:[]}); }catch(_){}
      try{ ['imtb-fill','imtb-line','imtb-lbl','imtb-lbl2'].forEach(id=>{ if(GE().layers.has(id)) GE().layers.setLayout(id,'visibility','none'); }); }catch(_){}
      _restoreBase(); try{ window._applyBorders&&window._applyBorders(); }catch(_){} }
    /* (#R421) `go` takes the INSTANT now, not the year. Callers that still hand it a number keep the old
       meaning (that year's July 1) so nothing that predates this round has to change. */
    async function go(when){ active=true; const my=++seq;
      const isD=(when instanceof Date)&&!isNaN(when.getTime());
      const year=isD?when.getFullYear():Math.round(+when), mon=isD?(when.getMonth()+1):7, day=isD?when.getDate():1;
      shownYear=year;   /* (#R410) the reader's year, set BEFORE any early return — `shownY` is a snapshot key and one snapshot answers many years. ⚠ (#R421) it is derived from the INSTANT now, so it still answers "which year is on screen" while the borders under it moved to day precision. */
      /* (#R117/#R421) 1886–2019 → DAY-EXACT CShapes borders. Falls back to the aourednik snapshot path
         below if the CShapes bundle can't be loaded. */
      if(year>=CS_MIN&&year<=CS_MAX){ const d=await csLoad();
        if(my!==seq||!active) return;
        if(d){ let key; try{ key='cs'+csEpoch(d,year,mon,day); }catch(_){ key='cs'+year; }   /* the EPOCH, not the date: a quiet decade keeps one cache entry and re-renders nothing */
          if(shownY===key){ try{ if(ensure()) window._applyBorders(); else whenStyleReady().then(()=>{ if(active&&shownY===key&&ensure()) window._applyBorders(); }); }catch(_){} return; }   /* (#R140) don't silently give up when the style is mid-load — retry once ready */
          let fc=cache.get(key); if(!fc){ try{ fc=csFC(d,year,mon,day); cache.set(key,fc); }catch(_){ fc=null; } }
          if(fc){ shownY=key; shownCorr=false; apply(fc); return; } } }
      const ny=nearest(year);
      /* (#R106) the Tibet merge is DISPLAY-year based — re-apply when it flips (e.g. 1950→1951) even on the same snapshot. */
      const corr=(year>=1951);
      if(shownY===ny&&shownCorr===corr){ try{ if(ensure()) window._applyBorders(); else whenStyleReady().then(()=>{ if(active&&shownY===ny&&shownCorr===corr&&ensure()) window._applyBorders(); }); }catch(_){} return; }   /* (#R140) retry once the style is ready instead of latching absent borders */
      const fc=await fetchFC(ny); if(my!==seq||!active) return;
      if(fc){ shownY=ny; shownCorr=corr; apply(_eraCorrect(fc,year)); }
      /* (#R126) fetch failed (network hiccup on the first, uncached travel) → the map stayed border-less with no
         retry until the user moved the year again. Retry this same request once conditions allow. */
      else setTimeout(()=>{ try{ if(active&&my===seq) go(when); }catch(_){} },4000); }
    window.IntMapTime.on(e=>{ clearTimeout(go._t);   /* cancel any pending apply first, so Now after a fast travel really clears */
      /* (#R94i) recent years (after the last aourednik snapshot, 2010) → keep the MODERN borders: they are the
         accurate present-day borders (incl. South Sudan 2011, etc.), which the stale 2010 snapshot lacks. */
      if(e.isLive || e.year>=new Date().getFullYear() || e.year>CS_MAX){ clear(); return; }   /* (#R117) CShapes carries accurate borders through 2019 (incl. South Sudan 2011) — only 2020+ keeps the modern base */
      const w=e.when;   /* (#R421) the whole instant — `e.year` alone was the July-1 rounding */
      go._t=setTimeout(()=>{ try{ go(w); }catch(_){} },45); });   /* (#R122) 120→45ms: a single year change applies almost immediately, while a fast slider drag still coalesces */
    /* (#R107) re-localize the era LABELS (renamed states via _locName, unchanged countries via _modName) when the
       language changes WHILE travelling — tagSame bakes those at the current language, so re-apply the shown snapshot
       (no re-fetch; _eraCorrect reuses the already-computed merge state via shownCorr). */
    window.addEventListener('intmap-lang',()=>{ try{ if(!active||shownY==null) return; const fc=cache.get(shownY); if(fc) apply(_eraCorrect(fc, shownCorr?1951:1900)); }catch(_){} });
    /* ⚠ (#R410) …AND THE SAME RE-READ WHEN THE IDENTITIES THEMSELVES ARRIVE. The present-day names live in
       `countryStats`, which comes off the network (Natural Earth attributes) long after the first era snapshot
       is drawn: measured at 1916 with that file 8 s late, `tagSame` found an EMPTY table, returned untagged,
       and the map still read «Germany / France / Italy» sixteen seconds later beside a list reading «German
       Empire / French Third Republic / Kingdom of Italy». js/time-countries.js `repaint()` announces every
       moment the year's identities in that table may have changed — including the return to Now and the years
       below the Maddison floor, where they are RESTORED to the modern ones.
       ⚠ It re-pushes the collection ONLY when a label actually moved. `repaint()` fires twice per travel (the
       local overlay, then the World Bank series), and the second one must not cost a `setSourceData` of a few
       hundred kilobytes to write back what is already there. */
    window.addEventListener('intmap-hist-identity',()=>{ try{ if(!active||!shownFC||!Array.isArray(shownFC.features)) return;
      const sig=()=>JSON.stringify(shownFC.features.map(f=>{ const p=f.properties||{}; return [p._same||0,p._modName||'',p._locName||'']; }));
      const before=sig(); tagSame(shownFC,shownYear); if(sig()===before) return;
      if(GE().layers.hasSource('imtb-src')&&GE().layers.has('imtb-line')) GE().layers.setSourceData('imtb-src',shownFC);
    }catch(_){} });
    /* (#R94k) warm the cache in the background so the era borders swap INSTANTLY when a year is entered
       (the aourednik files are a few 100 KB each; once cached in IndexedDB via IntMapCache they load at once). */
    (function warm(){ const pf=()=>{ csLoad().then(d=>{ if(d) return;   /* (#R117) warm the CShapes bundle; only if it FAILED warm the aourednik fallback snapshots */
        let i=0; const nx=()=>{ if(i>=YEARS.length) return; const y=YEARS[i++]; fetchFC(y).catch(()=>{}).then(()=>setTimeout(nx,500)); }; nx(); }); };
      /* (#R122) load the CShapes bundle EAGERLY (was idle-gated up to 6 s) so the FIRST time-travel doesn't block on
         parsing it — the reported "年代を変えてから国境が出るまで遅い". A short delay keeps it off the critical boot path.
         ══ (#R192) …EXCEPT 900 ms IS NOT OFF THE BOOT PATH ═══════════════════════════════════════════
         「起動時の読み込みをもっと早く。」 Measured on a cold load: data/cshapes.js is 5.5 MB and it
         started at 1,243 ms — while the first satellite tiles, the Köppen raster and the country
         borders were still arriving, and it is a <script>, so the main thread also PARSES 5.5 MB of
         literal at whatever moment that lands. It was the largest single item on the boot path and
         nothing on screen was waiting for it.
         It is still eager, and #R122's reason still holds — the first time-travel must not block on
         it — but it now waits for the browser to say the main thread is FREE (requestIdleCallback,
         with a 6 s ceiling so a permanently busy page still gets it, and a floor of the map's own
         first idle). On Data Saver or 2G it is not prefetched at all: there the 5.5 MB is a real cost
         and the time machine can fetch it when it is actually opened. */
      /* ══ (#R201) …AND A PHONE IS THE SAME CASE AS DATA SAVER ═══════════════════════════════════
         「モバイル版で、衛星画像が圧倒的に重い」. Measured on a 390×844 session: the page pulls ~20 MB, of
         which the map tiles are ~1.5 MB — and 5.5 MB of the rest is THIS file, prefetched at t≈5 s,
         while the satellite tiles the user is looking at are still arriving over the same connection.
         The imagery is not heavy; it is queued behind things nothing on screen is waiting for.
         The rule this line already applied to Data Saver and 2G now covers phones for the same
         reason and with the same guarantee: the time machine still loads the bundle the first time it
         is opened (csLoad() below is what actually draws), so nothing is lost — only the speculative
         copy for a feature that has not been asked for. */
      const go=()=>{ try{ const c=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
          if(c&&(c.saveData===true||/(^|-)2g$/.test(c.effectiveType||''))) return; }catch(_){}
        try{ if(HOST.isMobile&&HOST.isMobile()) return; }catch(_){}
        if(typeof requestIdleCallback==='function') requestIdleCallback(pf,{timeout:6000}); else setTimeout(pf,2500); };
      let started=false; const once=()=>{ if(started) return; started=true; go(); };
      try{ GE().events.once('idle',()=>setTimeout(once,400)); }catch(_){}
      setTimeout(once,4000); })();
    /* re-assert ONLY when a base-style swap (globe/flat/satellite) WIPED our layers — detected by a missing
       imtb-line. Re-asserting on EVERY styledata would loop, because our own setLayoutProperty fires styledata
       (that was the fast-blink). */
    GE().events.on('styledata',()=>{ if(active&&shownY!=null&&_imCanDraw()&&!GE().layers.has('imtb-line')) setTimeout(()=>{ try{ if(active&&_imCanDraw()&&!GE().layers.has('imtb-line')){ ensure(); const fc=cache.get(shownY); if(fc){ try{ GE().layers.setSourceData('imtb-src',fc); }catch(_){} } window._applyBorders(); } }catch(_){} },160); });
    /* (#R94h) geometry of the era polygon whose NAME matches — used to paint compared former states.
       (#R94o) pick the LARGEST match, not the first: a broad regex like the British-Raj `/^india$/` also hits a
       tiny mislabeled "India" sliver in the 1900 data (a 28-pt strip near the Iran border), and `.find()` grabbed
       that instead of the whole subcontinent — the "British Raj highlight is a thin strip" bug. */
    function geomFor(re){ try{ const fc=cache.get(shownY); if(!fc||!re) return null;
      let best=null,bestA=-1; for(const ff of fc.features){ const n=(ff.properties&&(ff.properties.NAME||ff.properties.name))||''; if(!ff.geometry||!re.test(n)) continue; const a=_bboxArea(ff.geometry); if(isFinite(a)&&a>bestA){ bestA=a; best=ff; } }
      return best?best.geometry:null; }catch(_){ return null; } }
    /* ===== (#R94n) geometry + historical-entity resolution shared by the click popup and the Compare paint ===== */
    function _bbox(geom){ let a=180,b=90,c=-180,d=-90; const scan=cs=>{ for(const x of cs){ if(typeof x[0]==='number'){ if(x[0]<a)a=x[0]; if(x[1]<b)b=x[1]; if(x[0]>c)c=x[0]; if(x[1]>d)d=x[1]; } else scan(x); } }; try{ scan(geom.coordinates); }catch(_){ return null; } return (isFinite(a)&&c>=a&&d>=b)?[a,b,c,d]:null; }
    function _bboxArea(geom){ const bb=_bbox(geom); return bb?((bb[2]-bb[0])*(bb[3]-bb[1])):Infinity; }
    function _contains(geom,lng,lat){ try{ if(typeof turf!=='undefined'&&turf.booleanPointInPolygon&&geom&&/Polygon/.test(geom.type||'')) return turf.booleanPointInPolygon(turf.point([lng,lat]),{type:'Feature',geometry:geom,properties:{}}); }catch(_){}
      const bb=_bbox(geom); return !!(bb&&lng>=bb[0]&&lng<=bb[2]&&lat>=bb[1]&&lat<=bb[3]); }
    /* several interior sample points of a polygon (a bbox grid kept to strictly-inside points, + one guaranteed
       on-surface point as a fallback). Used to match a modern country to its era polygon by MAJORITY VOTE — a
       single point can land on a coastline or in territory that changed hands (modern Italy's South Tyrol was
       Austria-Hungary in 1900), which would mis-key; the vote is robust to a few stray samples. */
    function _interiorPts(geom,k){ const pts=[]; try{ const bb=_bbox(geom); if(!bb) return pts; const N=7;
      for(let i=1;i<N&&pts.length<k;i++){ for(let j=1;j<N&&pts.length<k;j++){ const x=bb[0]+(bb[2]-bb[0])*i/N, y=bb[1]+(bb[3]-bb[1])*j/N; if(_contains(geom,x,y)) pts.push([x,y]); } }
      if(!pts.length){ try{ if(typeof turf!=='undefined'&&turf.pointOnFeature){ const p=turf.pointOnFeature({type:'Feature',geometry:geom,properties:{}}); if(p&&p.geometry&&Array.isArray(p.geometry.coordinates)) pts.push(p.geometry.coordinates); } }catch(_){}
        if(!pts.length) pts.push([(bb[0]+bb[2])/2,(bb[1]+bb[3])/2]); }
    }catch(_){} return pts; }
    /* per-FeatureCollection bbox+area index, built once and reused across the compared codes of one paint */
    function _fcIdx(fc){ if(fc.__imtbIdx) return fc.__imtbIdx; const idx=fc.features.map(ff=>{ const bb=ff.geometry?_bbox(ff.geometry):null; return { ff, bb, area: bb?((bb[2]-bb[0])*(bb[3]-bb[1])):Infinity }; }); try{ Object.defineProperty(fc,'__imtbIdx',{value:idx,enumerable:false,configurable:true}); }catch(_){ fc.__imtbIdx=idx; } return idx; }
    /* the FULL, untruncated source feature (NAME match, preferring one that contains the click) — the click
       event only ever hands back a tile-clipped copy, so we look the original up in the cached FeatureCollection. */
    function featureAt(nm,lngLat){ try{ const fc=cache.get(shownY); if(!fc||!fc.features) return null; const low=String(nm||'').toLowerCase().trim(); if(!low) return null;
      const named=fc.features.filter(ff=>String((ff.properties&&(ff.properties.NAME||ff.properties.name))||'').toLowerCase().trim()===low);
      if(!named.length) return null; if(named.length===1||!lngLat||!isFinite(lngLat.lng)) return named[0];
      return named.find(ff=>_contains(ff.geometry,lngLat.lng,lngLat.lat))||named[0]; }catch(_){ return null; } }
    /* (#R128) CShapes gwcode (Gleditsch-Ward) → modern carrier ISO3. EVERY CShapes era feature carries this code
       in properties._gw (csFC, ~31127); it is border- and name-independent, so resolving through it deterministically
       fixes the whole long tail that the modern point-in-polygon fallback got WRONG ("国境線と国家は昔なのに、
       クリック判定は現在の国境になっている…まだ不完全"): a renamed/RESIZED single state whose historical territory
       spilled into today's neighbours (German Empire gw255 → DEU for the WHOLE feature incl. Poznań/Alsace; interwar
       Poland gw290 → POL incl. Lwów) and colonies with a different modern name (French Sudan gw432 → Mali). Only
       SINGLE-successor codes are listed; multi-successor empires (Austria-Hungary 300, Czechoslovakia 315,
       Yugoslavia 345…) and Tibet (711, a _VANISHED identity) are deliberately absent so step 1 / _VANISHED keep
       priority, and the _histHidden guard at the call site defers to an ACTIVE former state (Korea under the Empire
       of Japan). Table generated from data/cshapes.js (252 gwcodes actually used, 1886–2019). */
    const _GW2ISO={
      2:'USA',3:'USA',4:'USA',6:'PRI',20:'CAN',21:'CAN',31:'BHS',40:'CUB',41:'HTI',42:'DOM',51:'JAM',52:'TTO',53:'BRB',70:'MEX',80:'BLZ',90:'GTM',
      91:'HND',92:'SLV',93:'NIC',94:'CRI',95:'PAN',100:'COL',101:'VEN',110:'GUY',115:'SUR',130:'ECU',135:'PER',140:'BRA',145:'BOL',150:'PRY',155:'CHL',160:'ARG',
      165:'URY',200:'GBR',205:'IRL',210:'NLD',211:'BEL',212:'LUX',220:'FRA',225:'CHE',230:'ESP',235:'PRT',255:'DEU',260:'DEU',265:'DEU',290:'POL',291:'POL',305:'AUT',
      310:'HUN',316:'CZE',317:'SVK',325:'ITA',338:'MLT',339:'ALB',340:'SRB',341:'MNE',343:'MKD',344:'HRV',346:'BIH',347:'KOS',349:'SVN',350:'GRC',352:'CYP',355:'BGR',
      359:'MDA',360:'ROU',365:'RUS',366:'EST',367:'LVA',368:'LTU',369:'UKR',370:'BLR',371:'ARM',372:'GEO',373:'AZE',375:'FIN',380:'SWE',385:'NOR',390:'DNK',395:'ISL',
      402:'CPV',404:'GNB',411:'GNQ',420:'GMB',432:'MLI',433:'SEN',434:'BEN',435:'MRT',436:'NER',437:'CIV',438:'GIN',439:'BFA',450:'LBR',451:'SLE',452:'GHA',460:'TGO',
      461:'TGO',462:'GHA',470:'CMR',471:'CMR',475:'NGA',481:'GAB',482:'CAF',483:'TCD',484:'COG',490:'COD',500:'UGA',501:'KEN',510:'TZA',511:'TZA',516:'BDI',517:'RWA',
      520:'SOM',521:'SOM',522:'DJI',530:'ETH',531:'ERI',540:'AGO',541:'MOZ',551:'ZMB',552:'ZWE',553:'MWI',560:'ZAF',561:'ZAF',562:'ZAF',563:'ZAF',564:'ZAF',565:'NAM',
      570:'LSO',571:'BWA',572:'SWZ',580:'MDG',581:'COM',590:'MUS',600:'MAR',602:'MAR',609:'ESH',615:'DZA',616:'TUN',620:'LBY',625:'SDN',626:'SSD',630:'IRN',640:'TUR',
      645:'IRQ',651:'EGY',652:'SYR',660:'LBN',663:'JOR',665:'PSE',666:'ISR',670:'SAU',678:'YEM',680:'YEM',681:'YEM',690:'KWT',692:'BHR',694:'QAT',696:'ARE',698:'OMN',
      700:'AFG',701:'TKM',702:'TJK',703:'KGZ',704:'UZB',705:'KAZ',710:'CHN',712:'MNG',713:'TWN',730:'KOR',731:'PRK',732:'KOR',740:'JPN',750:'IND',760:'BTN',770:'PAK',
      771:'BGD',775:'MMR',780:'LKA',781:'MDV',790:'NPL',800:'THA',811:'KHM',812:'LAO',815:'VNM',816:'VNM',817:'VNM',820:'MYS',821:'MYS',822:'MYS',823:'MYS',824:'MYS',
      830:'SGP',835:'BRN',840:'PHL',850:'IDN',851:'IDN',860:'TLS',900:'AUS',901:'AUS',902:'AUS',903:'AUS',904:'AUS',905:'AUS',906:'AUS',910:'PNG',911:'PNG',912:'PNG',
      920:'NZL',940:'SLB',950:'FJI',3461:'BIH',3462:'BIH',4781:'NGA',4782:'NGA',4783:'NGA',4784:'NGA',5200:'SOM',5518:'ZMB',5519:'ZMB',5612:'BWA',6021:'MAR',6511:'PSE',6631:'PSE',
      6801:'YEM',6812:'YEM',7020:'UZB',7030:'UZB',7351:'RUS',7506:'IND',7708:'PAK',8201:'MYS',8202:'MYS',8203:'MYS',9401:'SLB'
    };
    /* resolve an era polygon (its NAME + the click point) to the app's historical entity → the era display name,
       Wikipedia title and the full geometry. countryStats already carries the era name/wiki (IntMapHistId +
       IntMapHistStates ran on this travel), so this just has to find the right code. */
    function resolveHist(nm,lngLat){ const lg=(typeof HOST.lang!=='undefined')?HOST.lang:'en';
      const out={ name:nm, wiki:String(nm||'').replace(/\s*\([^)]*\)\s*$/,'')||nm, code:null, geometry:null };   /* (#R117) fallback Wikipedia title without the "(France)/(UK)…" possessor suffix — "French Sudan (France)" → "French Sudan" */
      let gwCode=null;   /* (#R128) the era feature's CShapes Gleditsch-Ward code (properties._gw), for deterministic resolution below */
      try{ const ftr=featureAt(nm,lngLat); if(ftr){ if(ftr.geometry) out.geometry=ftr.geometry; if(ftr.properties&&ftr.properties._gw!=null) gwCode=ftr.properties._gw; } }catch(_){}
      let code=null, empire=false;
      /* 1) empires / former states — the era polygon NAME matches a former-state regex. The historical basemap is
         AUTHORITATIVE about identity, so use the registry's canonical era name + Wikipedia even when the state has
         no Maddison economic data this year and so was never injected into countryStats (e.g. the Ottoman Empire in
         1914 — it is still the Ottoman Empire on the map, not modern Turkey). The faithful lifespan disambiguates
         loose patterns (^russia$/^india$/yugoslav) so they only bind inside the state's own era. */
      /* (#R125) test BOTH the raw era name and the possessor-suffix-stripped one ("India (UK)" → "India") — CShapes
         dependencies carry the "(UK)/(France)/(Japan)…" gloss, which made ^india$-style patterns miss entirely, so a
         click on 1914 British India resolved to NOTHING ("まだ不完全"). */
      const nmBare=String(nm||'').replace(/\s*\([^)]*\)\s*$/,'').trim();
      try{ const HS=window.IntMapHistStates; const when=(window.IntMapTime&&window.IntMapTime.when)?window.IntMapTime.when():null;
        if(HS&&HS.STATES){ for(const S of HS.STATES){ const re=HS.hbRe&&HS.hbRe(S.code); if(!re||!(re.test(nm)||re.test(nmBare))) continue;
          let act=true; try{ if(when){ const t=+when,a=+new Date(S.from+'T00:00:00Z'),b=+new Date(S.to+'T23:59:59Z'); if(isFinite(t)) act=(t>=a&&t<=b); } }catch(_){}
          if(!act) continue;
          empire=true; const nmS=(S.name&&_LTB.arr(S.name))||S.name; if(nmS) out.name=nmS; if(S.wiki) out.wiki=S.wiki;
          if(S.flag) out.flag=S.flag;   /* (#R127) registry flag — shows even for a data-less empire (Ottoman 1914) not yet in countryStats */
          if(countryStats[S.code]&&!countryStats[S.code]._histHidden){ code=S.code; out.code=S.code; }
          break; } } }catch(_){}
      if(!empire){
        /* 2) exact modern name still present (a country that kept its name: France, Turkey, Weimar Germany…) */
        { const low=String(nm||'').toLowerCase().trim(); for(const c in countryStats){ const s=countryStats[c]; if(!s||s._histHidden) continue; if((s.nameEn||'').toLowerCase()===low){ code=c; break; } } }
        /* (#R105) 2b) VANISHED historical entities that sit ON the modern territory of ANOTHER country — the
           point-in-polygon catch-all below would wrongly resolve them to the modern country (Tibet / East Turkestan →
           PRC, "PRCかROC扱いになる"). Keep THEIR OWN identity + Wikipedia (post-annexation years are already merged into
           China by _correctEra, so this only fires while the era polygon still carries the historical name). */
        if(!code){ const vlow=String(nm||'').trim(); for(const V of _VANISHED){ if(V.re.test(vlow)){ out.name=_LTB.arr(V.nm); out.wiki=V.wiki; if(V.flag) out.flag=V.flag; out.code=null; return out; } } }   /* (#R128) pass the vanished-state flag to the click popup */
        /* (#R128) 2.4) DETERMINISTIC gwcode → modern carrier. The era feature's own CShapes _gw is authoritative and
           border/name-independent, so it resolves the entire renamed/RESIZED/colonial long tail WITHOUT depending on
           the modern point-in-polygon fallback (step 3) that grabbed whatever present-day country sat under the cursor
           (German Empire's Poznań → modern Poland). Runs after the exact-name (2) and _VANISHED (2b) checks so those
           keep priority, and BEFORE BEC (2.5) / PIP (3). The _histHidden guard defers to an ACTIVE former state so a
           successor absorbed by an empire this year (Korea under the Empire of Japan) still routes through step 3b. */
        if(!code && gwCode!=null){ const gc=_GW2ISO[gwCode]; if(gc&&countryStats[gc]&&!countryStats[gc]._histHidden) code=gc; }
        /* (#R127) 2.5) RENAMED single-countries (IntMapHistId): the era polygon keeps the BASE name ("Germany",
           "Persia", "Siam", "Dutch East Indies", "Kingdom of Italy"…) while countryStats[code] was renamed to the
           era identity — so the exact-name match (2) misses and the MODERN point-in-polygon (3) below wrongly hands
           the click to whatever present-day country sits under the cursor (the German Empire's Poznań / Alsace →
           modern Poland / France; the reported "国境線と国家は昔なのに、クリック判定は現在の国境になっている" bug).
           The historical basemap already knows the entity — resolve the base era name straight to its modern carrier
           code. This ALSO survives the identity-load race (countryStats['DEU'] always exists, only its label is
           renamed later). Empires / multi-successor former states are handled by (1) above; this is single-country
           renames only, so it never over-claims a colony's separate modern successors. */
        if(!code){ const be=String(nmBare||'').toLowerCase().trim();
          const BEC={ 'germany':'DEU','german empire':'DEU','german reich':'DEU','nazi germany':'DEU','weimar republic':'DEU','prussia':'DEU','kingdom of prussia':'DEU',
            'china':'CHN','qing':'CHN','qing empire':'CHN','qing dynasty':'CHN','republic of china':'CHN','great qing':'CHN',
            'italy':'ITA','kingdom of italy':'ITA',
            'iran':'IRN','persia':'IRN','imperial state of iran':'IRN',
            'thailand':'THA','siam':'THA','kingdom of siam':'THA',
            'indonesia':'IDN','dutch east indies':'IDN','netherlands east indies':'IDN',
            'japan':'JPN','empire of japan':'JPN',
            'spain':'ESP','spanish state':'ESP',
            'portugal':'PRT',
            'brazil':'BRA','empire of brazil':'BRA',
            'egypt':'EGY','kingdom of egypt':'EGY',
            'hungary':'HUN','kingdom of hungary':'HUN',
            'france':'FRA','french third republic':'FRA','vichy france':'FRA','french state':'FRA',
            'united kingdom':'GBR','great britain':'GBR','britain':'GBR' };
          const bc=BEC[be]; if(bc&&countryStats[bc]&&!countryStats[bc]._histHidden){ code=bc; } }
        /* 3) point-in-polygon over the MODERN polygons — the robust catch-all that survives aourednik name variance
              (e.g. "Kingfom of Italy" typo, "Italy"→our "Kingdom of Italy") by using WHERE the click landed */
        if(!code&&lngLat&&isFinite(lngLat.lng)){ try{ const g=window.countryGeo; if(g&&g.features){ let best=null,bestA=Infinity,bestHid=null,bestHidA=Infinity; for(const f of g.features){ const cd=String(f.id!=null?f.id:(f.properties&&f.properties.__code)); const s=countryStats[cd]; if(!s||!f.geometry) continue; if(_contains(f.geometry,lngLat.lng,lngLat.lat)){ const a=_bboxArea(f.geometry); if(s._histHidden){ if(a<bestHidA){ bestHidA=a; bestHid=cd; } } else if(a<bestA){ bestA=a; best=cd; } } } if(best) code=best;
          /* (#R125) the modern country here is HIDDEN because an ACTIVE former state absorbs it this year (India
             1914 → British Raj, Korea 1914 → Empire of Japan). Resolve to THAT state — its aggregate series is the
             comparable data for this territory — instead of returning nothing. */
          else if(bestHid){ try{ const HS=window.IntMapHistStates, when2=(window.IntMapTime&&window.IntMapTime.when)?window.IntMapTime.when():null;
            if(HS&&HS.STATES){ for(const S of HS.STATES){ const su=(when2&&HS.succAt)?HS.succAt(S,when2):(S.succ||[]);   /* (#R425) …and it must have held it THEN */
              if(!su.length||su.indexOf(bestHid)<0) continue;
              let act=true; try{ if(when2){ const t=+when2,a2=+new Date(S.from+'T00:00:00Z'),b2=+new Date(S.to+'T23:59:59Z'); if(isFinite(t)) act=(t>=a2&&t<=b2); } }catch(_){}
              if(!act||!countryStats[S.code]||countryStats[S.code]._histHidden) continue;
              code=S.code; break; } } }catch(_){} } } }catch(_){} }
        if(code){ const s=countryStats[code]; if(s){ out.code=code; const nm2=(s.name&&_LTB.arr(s.name))||s.nameEn; if(nm2) out.name=nm2; if(s.wiki) out.wiki=s.wiki; } }
        /* (#R116) ERA-SPECIFIC Wikipedia for SAME-NAME countries ("国名に変化がない国は特に、その時代の国の
           Wikipediaに飛ばしてもらえない"): a country that kept its label (France, China, Italy…) resolved to the
           MODERN article. When the clock is in a curated era range, link that era's own article instead (the
           displayed name stays the map's era name; former states with their own registry entry never reach here). */
        try{ const y=(window.IntMapTime&&!window.IntMapTime.isLive())?window.IntMapTime.year():null;
          if(code&&y!=null&&isFinite(y)){ const spans=_ERA_WIKI[code]; if(spans){ for(const sp of spans){ if(y>=sp[0]&&y<=sp[1]){ out.wiki=sp[2]; break; } } } } }catch(_){}
      }
      /* (#R127) surface the entity's flag (the era flag IntMapHistId/HistStates put on countryStats[code], e.g. the
         German Empire's flag on DEU, Siam's on THA) so the click popup can show it — the historical click path only
         passed name+wiki before, so historical flags never appeared on the map ("国旗…まだ詰められる箇所が大量にある"). */
      try{ if(!out.flag&&out.code&&countryStats[out.code]&&countryStats[out.code].flag) out.flag=countryStats[out.code].flag; }catch(_){}
      return out; }
    /* (#R116) curated era→article table (the time machine's whole window; en.wikipedia titles). Ranges are the
       state-form's lifespan; anything outside every range keeps the modern article. Kept to well-established,
       uncontroversial titles.
       ⚠ (#R349) THE LOWER BOUNDS USED TO BE THE WINDOW, NOT THE HISTORY. Every span below opened at 1900
       because that is where the clock stopped — so `1900` meant «as early as anyone can ask», not «this is
       when the state began». Moving the floor to 1850 turned each of those into a claim that was newly
       reachable and newly wrong: 1875 France resolved to the Third Republic five years before it existed
       only because nothing was asked before 1900. Each bound below is now the polity's OWN start date (or
       1850 where it began earlier), and the eras that ran between 1850 and 1900 are spans of their own.
       ⚠⚠ (#R380) THAT SWEEP REACHED 36 OF THE 51 ROWS, AND THE CHECK THAT NAMED IT ONLY ASKED ABOUT 20.
       `tests/r349-checks ④` is called «no era span still opens at 1900 just because the window used to» and
       it was green while FIFTEEN still did — because it spot-checks a hand-written list of codes instead of
       reading the table. Measured on the shipped bundle: 1875 British Guiana, Dutch Surinam, the Gambia,
       Sierra Leone, Mauritius, the Maldives, Fiji, Cape Verde, Portuguese Guinea, Spanish Guinea, Portuguese
       Timor, the Solomons, Kuwait and Laos ALL answered with their MODERN country article — a colony of
       1875 linking to a country founded a century later. Each bound below is now that polity's own start
       (British Guiana 1831, the Gambia 1821, Sierra Leone 1808, Mauritius 1810, the Maldive sultanate 1153,
       Cape Verde 1462, Portuguese Guinea 1588, Spanish Guinea 1778, Portuguese Timor 1702 → all clamped to
       the clock's own floor 1850; Fiji 1874, the Solomons 1893, Laos 1893, Kuwait 1899 → their real years,
       every one read off the article the row links to), and ④ now reads the TABLE. */
    const _ERA_WIKI={
      FRA:[[1850,1852,'French_Second_Republic'],[1852,1870,'Second_French_Empire'],[1870,1940,'French_Third_Republic'],[1940,1944,'Vichy_France'],[1944,1946,'Provisional_Government_of_the_French_Republic'],[1946,1958,'French_Fourth_Republic']],
      DEU:[[1850,1866,'German_Confederation'],[1867,1871,'North_German_Confederation'],[1871,1918,'German_Empire'],[1919,1933,'Weimar_Republic'],[1933,1945,'Nazi_Germany'],[1945,1949,'Allied-occupied_Germany'],[1949,1990,'West_Germany']],
      CHN:[[1850,1911,'Qing_dynasty'],[1912,1949,'Republic_of_China_(1912%E2%80%931949)']],
      JPN:[[1850,1868,'Tokugawa_shogunate'],[1868,1947,'Empire_of_Japan']],
      RUS:[[1850,1917,'Russian_Empire'],[1917,1922,'Russian_Soviet_Federative_Socialist_Republic'],[1922,1991,'Soviet_Union']],
      ITA:[[1850,1861,'Kingdom_of_Sardinia'],[1861,1946,'Kingdom_of_Italy']],
      GBR:[[1850,1922,'United_Kingdom_of_Great_Britain_and_Ireland']],
      TUR:[[1850,1922,'Ottoman_Empire']],
      ESP:[[1850,1868,'Reign_of_Isabella_II'],[1868,1873,'Sexenio_Democr%C3%A1tico'],[1873,1874,'First_Spanish_Republic'],[1874,1931,'Restoration_(Spain)'],[1931,1939,'Second_Spanish_Republic'],[1939,1975,'Francoist_Spain']],
      PRT:[[1850,1910,'Kingdom_of_Portugal'],[1910,1926,'First_Portuguese_Republic'],[1933,1974,'Estado_Novo_(Portugal)']],
      AUT:[[1850,1867,'Austrian_Empire'],[1867,1918,'Austria-Hungary'],[1919,1938,'First_Austrian_Republic'],[1945,1955,'Allied-occupied_Austria']],
      HUN:[[1850,1867,'Austrian_Empire'],[1867,1918,'Austria-Hungary'],[1920,1946,'Kingdom_of_Hungary_(1920%E2%80%931946)'],[1949,1989,'Hungarian_People%27s_Republic']],
      POL:[[1918,1939,'Second_Polish_Republic'],[1947,1989,'Polish_People%27s_Republic']],
      GRC:[[1850,1924,'Kingdom_of_Greece'],[1935,1973,'Kingdom_of_Greece']],
      ROU:[[1859,1881,'United_Principalities_of_Moldavia_and_Wallachia'],[1881,1947,'Kingdom_of_Romania'],[1947,1989,'Socialist_Republic_of_Romania']],
      BGR:[[1878,1908,'Principality_of_Bulgaria'],[1908,1946,'Kingdom_of_Bulgaria'],[1946,1990,'People%27s_Republic_of_Bulgaria']],
      SRB:[[1850,1882,'Principality_of_Serbia'],[1882,1918,'Kingdom_of_Serbia']],
      IRN:[[1850,1925,'Qajar_Iran'],[1925,1979,'Pahlavi_Iran']],
      THA:[[1850,1932,'Rattanakosin_Kingdom_(1782%E2%80%931932)']],
      EGY:[[1850,1867,'Ottoman_Egypt'],[1867,1914,'Khedivate_of_Egypt'],[1914,1922,'Sultanate_of_Egypt'],[1922,1953,'Kingdom_of_Egypt'],[1958,1971,'United_Arab_Republic']],
      ETH:[[1850,1974,'Ethiopian_Empire'],[1974,1987,'Derg']],
      IND:[[1850,1858,'Company_rule_in_India'],[1858,1947,'British_Raj'],[1947,1950,'Dominion_of_India']],
      KOR:[[1850,1897,'Joseon'],[1897,1910,'Korean_Empire'],[1910,1945,'Korea_under_Japanese_rule']],
      PRK:[[1910,1945,'Korea_under_Japanese_rule']],
      VNM:[[1850,1883,'Nguyen_dynasty'],[1883,1945,'French_Indochina'],[1954,1976,'North_Vietnam']],
      BRA:[[1850,1889,'Empire_of_Brazil'],[1889,1930,'First_Brazilian_Republic'],[1937,1946,'Estado_Novo_(Brazil)']],
      MEX:[[1864,1867,'Second_Mexican_Empire'],[1876,1911,'Porfiriato']],
      CZE:[[1918,1992,'Czechoslovakia']],
      SVK:[[1939,1945,'Slovak_Republic_(1939%E2%80%931945)']],
      IRL:[[1922,1937,'Irish_Free_State']],
      ISR:[[1920,1948,'Mandatory_Palestine']],
      SAU:[[1850,1891,'Second_Saudi_State'],[1902,1932,'Emirate_of_Nejd_and_Hasa']],
      IRQ:[[1921,1932,'Mandatory_Iraq'],[1932,1958,'Kingdom_of_Iraq']],
      SYR:[[1923,1946,'Mandate_for_Syria_and_the_Lebanon']],
      LBY:[[1850,1911,'Ottoman_Tripolitania'],[1911,1943,'Italian_Libya'],[1951,1969,'Kingdom_of_Libya']],
      IDN:[[1850,1949,'Dutch_East_Indies']],
      PHL:[[1850,1898,'Captaincy_General_of_the_Philippines'],[1902,1935,'Insular_Government_of_the_Philippine_Islands'],[1935,1946,'Commonwealth_of_the_Philippines']],
      COD:[[1885,1908,'Congo_Free_State'],[1908,1960,'Belgian_Congo'],[1971,1997,'Zaire']],
      ZAF:[[1910,1961,'Union_of_South_Africa']],
      ZWE:[[1923,1965,'Southern_Rhodesia'],[1965,1979,'Rhodesia']],
      LKA:[[1850,1948,'British_Ceylon'],[1948,1972,'Dominion_of_Ceylon']],
      MMR:[[1850,1885,'Konbaung_dynasty'],[1885,1948,'British_rule_in_Burma']],
      TWN:[[1850,1895,'Taiwan_under_Qing_rule'],[1895,1945,'Taiwan_under_Japanese_rule']],
      /* (#R127) colonial-era + former-state articles for entities that previously linked to the MODERN article (or
         showed no Wikipedia button at all) — "Wikipedia…まだ詰められる箇所が大量にある". A colony resolves to its
         modern successor code via the point-in-polygon fallback, so the era-Wikipedia override picks these by year.
         Titles are established en.wikipedia articles; the popup existence-probes each, so a miss just hides the button. */
      DZA:[[1850,1962,'French_Algeria']],
      MAR:[[1912,1956,'French_protectorate_in_Morocco']],
      TUN:[[1850,1881,'Beylik_of_Tunis'],[1881,1956,'French_protectorate_of_Tunisia']],
      SEN:[[1895,1960,'French_West_Africa']],
      MLI:[[1890,1960,'French_Sudan']],
      CIV:[[1895,1960,'French_West_Africa']],
      /* ⚠ (#R380) NER's 1900 is NOT the old window bound — the Third Military Territory of Niger was
         created in 1900 and there was no «Niger» to name before it, so this row is on ④'s allow-list with
         that reason rather than being pulled down to 1850 with the others. */
      NER:[[1900,1960,'French_West_Africa']],
      GIN:[[1895,1958,'French_West_Africa']],
      BFA:[[1919,1960,'French_Upper_Volta']],
      BEN:[[1894,1960,'French_Dahomey']],
      TCD:[[1910,1960,'French_Equatorial_Africa']],
      GAB:[[1910,1960,'French_Equatorial_Africa']],
      COG:[[1910,1960,'French_Equatorial_Africa']],
      CAF:[[1910,1958,'Ubangi-Shari']],
      MDG:[[1850,1897,'Kingdom_of_Madagascar'],[1897,1958,'French_Madagascar']],
      CMR:[[1884,1916,'Kamerun'],[1916,1960,'French_Cameroon']],
      KEN:[[1895,1920,'East_Africa_Protectorate'],[1920,1963,'Colony_of_Kenya']],
      NGA:[[1914,1960,'Colonial_Nigeria']],
      GHA:[[1874,1957,'Gold_Coast_(British_colony)']],
      SDN:[[1885,1899,'Mahdist_State'],[1899,1956,'Anglo-Egyptian_Sudan']],
      TZA:[[1885,1919,'German_East_Africa'],[1919,1961,'Tanganyika_(territory)']],
      AGO:[[1850,1975,'Portuguese_Angola']],
      MOZ:[[1850,1975,'Portuguese_Mozambique']],
      NAM:[[1884,1915,'German_South_West_Africa'],[1915,1990,'South_West_Africa']],
      UKR:[[1919,1991,'Ukrainian_Soviet_Socialist_Republic']],
      BLR:[[1919,1991,'Byelorussian_Soviet_Socialist_Republic']],
      KAZ:[[1936,1991,'Kazakh_Soviet_Socialist_Republic']],
      UZB:[[1924,1991,'Uzbek_Soviet_Socialist_Republic']],
      GEO:[[1921,1991,'Georgian_Soviet_Socialist_Republic']],
      FIN:[[1850,1917,'Grand_Duchy_of_Finland']],
      LBN:[[1920,1943,'Greater_Lebanon']],
      JOR:[[1921,1946,'Emirate_of_Transjordan']],
      PAK:[[1947,1956,'Dominion_of_Pakistan']],
      BGD:[[1947,1971,'East_Pakistan']],
      MYS:[[1850,1946,'British_Malaya']],
      LAO:[[1893,1953,'French_protectorate_of_Laos'],[1953,1975,'Kingdom_of_Laos']],
      KHM:[[1863,1953,'French_protectorate_of_Cambodia'],[1970,1975,'Khmer_Republic'],[1975,1979,'Democratic_Kampuchea'],[1979,1989,'People%27s_Republic_of_Kampuchea']],
      OMN:[[1850,1970,'Muscat_and_Oman']],
      ARE:[[1850,1971,'Trucial_States']],
      MNG:[[1850,1911,'Outer_Mongolia'],[1911,1924,'Bogd_Khanate_of_Mongolia'],[1924,1992,'Mongolian_People%27s_Republic']],
      CUB:[[1850,1898,'Captaincy_General_of_Cuba'],[1902,1959,'Republic_of_Cuba_(1902%E2%80%931959)']],
      /* (#R128) further era→article coverage — the remaining Soviet republics (only 5 of 15 were covered before, so a
         click on Soviet-era Armenia/Latvia/… linked the modern article) plus Afghanistan/Yemen/Eritrea/Palestine. */
      ARM:[[1920,1991,'Armenian_Soviet_Socialist_Republic']],
      AZE:[[1920,1991,'Azerbaijan_Soviet_Socialist_Republic']],
      LVA:[[1940,1991,'Latvian_Soviet_Socialist_Republic']],
      LTU:[[1940,1991,'Lithuanian_Soviet_Socialist_Republic']],
      EST:[[1940,1991,'Estonian_Soviet_Socialist_Republic']],
      MDA:[[1940,1991,'Moldavian_Soviet_Socialist_Republic']],
      TKM:[[1925,1991,'Turkmen_Soviet_Socialist_Republic']],
      KGZ:[[1936,1991,'Kirghiz_Soviet_Socialist_Republic']],
      TJK:[[1929,1991,'Tajik_Soviet_Socialist_Republic']],
      AFG:[[1850,1926,'Emirate_of_Afghanistan'],[1926,1973,'Kingdom_of_Afghanistan']],
      YEM:[[1918,1962,'Mutawakkilite_Kingdom_of_Yemen']],
      ERI:[[1890,1947,'Italian_Eritrea']],
      PSE:[[1920,1948,'Mandatory_Palestine']],
      /* (#R129) more monarchy/former-state articles that previously fell back to the modern country page (all
         existence-verified against en.wikipedia). */
      ALB:[[1925,1928,'Albanian_Republic_(1925%E2%80%931928)'],[1928,1939,'Albanian_Kingdom_(1928%E2%80%931939)'],[1946,1991,'People%27s_Socialist_Republic_of_Albania']],
      ISL:[[1918,1944,'Kingdom_of_Iceland']],
      MNE:[[1852,1910,'Principality_of_Montenegro'],[1910,1918,'Kingdom_of_Montenegro']],
      NPL:[[1850,2008,'Kingdom_of_Nepal']],
      NOR:[[1850,1905,'Union_between_Sweden_and_Norway']],
      /* (#R132) further era→article coverage for entities that still linked to their MODERN page: the WWII Independent
         State of Croatia, and colonial-era names for countries whose 1900-independence span had a distinct predecessor
         state. All established en.wikipedia titles; the popup existence-probes each, so any miss simply hides the button. */
      HRV:[[1941,1945,'Independent_State_of_Croatia']],
      SGP:[[1850,1946,'Straits_Settlements'],[1946,1963,'Colony_of_Singapore']],
      BLZ:[[1862,1981,'British_Honduras']],
      GUY:[[1850,1966,'British_Guiana']],
      SUR:[[1850,1975,'Surinam_(Dutch_colony)']],
      ZMB:[[1911,1964,'Northern_Rhodesia']],
      MWI:[[1907,1964,'Nyasaland']],
      BWA:[[1885,1966,'Bechuanaland_Protectorate']],
      LSO:[[1884,1966,'Basutoland']],
      SWZ:[[1903,1968,'Swaziland_(protectorate)']],
      UGA:[[1894,1962,'Uganda_Protectorate']],
      /* (#R136) further colonial-era → article coverage for colonies/protectorates that still linked to their MODERN
         country page ("Wikipedia…まだ詰められる箇所が大量にある"). All titles existence-verified against en.wikipedia
         (redirects resolved); ranges end at each territory's independence so the modern article returns afterwards. */
      GMB:[[1850,1965,'Gambia_Colony_and_Protectorate']],
      SLE:[[1850,1961,'Sierra_Leone_Colony_and_Protectorate']],
      MUS:[[1850,1968,'British_Mauritius']],
      MDV:[[1850,1965,'Sultanate_of_the_Maldive_Islands']],
      FJI:[[1874,1970,'Colony_of_Fiji']],
      CPV:[[1850,1975,'Portuguese_Cape_Verde']],
      GNB:[[1850,1974,'Portuguese_Guinea']],
      GNQ:[[1850,1968,'Spanish_Guinea']],
      TLS:[[1850,1975,'Portuguese_Timor']],
      SLB:[[1893,1978,'British_Solomon_Islands']],
      PNG:[[1949,1975,'Territory_of_Papua_and_New_Guinea']],
      KWT:[[1899,1961,'Emirate_of_Kuwait']]
    };
    /* (#R136) code → the era feature(s) that RESOLVE to that code, computed by running the SAME resolver the click
       picker uses (resolveHist: former-state identity → the feature's own CShapes _gw → base-name) over every era
       polygon, cached per FeatureCollection. This is what makes the Compare highlight paint EXACTLY what a click would
       detect. The majority-vote-over-the-MODERN-outline fallback below could disagree: 1925 Poland is detected as POL
       (its era feature's _gw=290), but a vote over MODERN Poland's outline — whose western third was Weimar Germany
       that year — tallied the German polygon and painted Germany ("1920sのポーランドをクリックしてもポーランド判定な
       もののドイツハイライトになる"). */
    function _eraCodeIndex(fc){ if(fc.__imtbCodeIdx) return fc.__imtbCodeIdx; const m=new Map();
      try{ for(const ff of fc.features){ try{ if(!ff.geometry) continue; const nm=(ff.properties&&(ff.properties.NAME||ff.properties.name))||'';
        const pts=_interiorPts(ff.geometry,1); const p=pts&&pts[0]; const R=resolveHist(nm, p?{lng:p[0],lat:p[1]}:null); const cd=R&&R.code;
        if(cd){ if(!m.has(cd)) m.set(cd,[]); m.get(cd).push(ff); } }catch(_){} } }catch(_){}
      try{ Object.defineProperty(fc,'__imtbCodeIdx',{value:m,enumerable:false,configurable:true}); }catch(_){ fc.__imtbCodeIdx=m; }
      return m; }
    /* merge several era features (a code can span more than one CShapes polygon) into one MultiPolygon geometry. */
    function _unionGeom(feats){ if(!feats||!feats.length) return null; if(feats.length===1) return feats[0].geometry;
      const polys=[]; for(const f of feats){ const g=f.geometry; if(!g) continue; if(g.type==='Polygon') polys.push(g.coordinates); else if(g.type==='MultiPolygon'){ for(const p of g.coordinates) polys.push(p); } }
      return polys.length?{type:'MultiPolygon',coordinates:polys}:(feats[0].geometry||null); }
    /* fraction of bbox B (the modern country) that bbox A (the era feature) covers — used to tell an era feature that
       IS the country that year (interwar Poland ≈ modern Poland) from a mere fragment sitting inside it. */
    function _bbCoverFrac(a,b){ try{ if(!a||!b) return 0; const ix=Math.max(0,Math.min(a[2],b[2])-Math.max(a[0],b[0])); const iy=Math.max(0,Math.min(a[3],b[3])-Math.max(a[1],b[1])); const barea=(b[2]-b[0])*(b[3]-b[1]); return barea>0?(ix*iy)/barea:0; }catch(_){ return 0; } }
    /* era polygon for a compared country CODE — a former state via its NAME regex, else the era feature(s) that RESOLVE
       to this code (identical to the click picker), else — only as a last resort — the era polygon that contains an
       interior point of the country's modern shape (so a renamed / border-shifted country paints its THAT-YEAR extent,
       e.g. the German Empire's 1910 borders instead of modern Germany's). */
    function geomForCode(code){ try{ const fc=cache.get(shownY); if(!fc||!fc.features) return null;
      const HS=window.IntMapHistStates; const re=HS&&HS.hbRe&&HS.hbRe(code); if(re){ const g=geomFor(re); if(g) return g; }
      const g=window.countryGeo; if(!g||!g.features) return null;
      const cf=g.features.find(f=>String(f.id!=null?f.id:(f.properties&&f.properties.__code))===String(code)); if(!cf||!cf.geometry) return null;
      const cfbb=_bbox(cf.geometry);
      /* (#R136) authoritative: the era feature(s) whose OWN identity resolves to this code — matches detection exactly.
         Use it only when it actually COVERS the country; a country that was ABSORBED that year keeps only a fragment
         feature (e.g. RUS in 1925 → just the Karafuto sliver, since mainland Russia is the Soviet Union), which would
         paint a misleading speck — those fall through to the modern-shape vote, which paints the enclosing extent. */
      try{ const cm=_eraCodeIndex(fc); const hit=cm.get(String(code)); if(hit&&hit.length){ const gg=_unionGeom(hit);
        if(gg){ const gb=_bbox(gg); if(!cfbb||!gb||_bbCoverFrac(gb,cfbb)>=0.3) return gg; } } }catch(_){}
      const samples=_interiorPts(cf.geometry,16); if(!samples.length) return null;
      /* majority vote: the era feature containing the MOST interior samples of this modern country (smallest
         bbox wins ties, so an enclosing empire never out-votes the actual country). bbox pre-filter keeps it cheap. */
      const idx=_fcIdx(fc); const tally=new Map();
      for(const pt of samples){ let best=null,bestA=Infinity; for(const e of idx){ const bb=e.bb; if(!bb||pt[0]<bb[0]||pt[0]>bb[2]||pt[1]<bb[1]||pt[1]>bb[3]) continue; if(e.area<bestA&&_contains(e.ff.geometry,pt[0],pt[1])){ bestA=e.area; best=e.ff; } } if(best) tally.set(best,(tally.get(best)||0)+1); }
      let win=null,wc=0; tally.forEach((c,ff)=>{ if(c>wc){ wc=c; win=ff; } });
      return win?win.geometry:null; }catch(_){ return null; } }
    /* ===== (#R421) WALK THE REAL TRANSITION DATES ==============================================
       「実際の国境変更日にスナップ」. The year slider stays the coarse control; these let the reader
       step onto the exact days the world changed, which is the only way the dense stretches are
       reachable at all — no amount of drag precision lands on 1920-10-28 in a 176-year slider.
       Async because the answer lives in the 5.5 MB bundle, which is warmed at idle and may not be
       parsed yet; every one of these resolves to `null` rather than throwing if it never loads. */
    const _kToDate=k=>{ const y=Math.floor(k/10000), m=Math.floor(k/100)%100, d=k%100; return new Date(y,m-1,d,12,0,0); };
    const _kOf=w=>{ const d=(w instanceof Date&&!isNaN(w.getTime()))?w:new Date(); return _ymd(d.getFullYear(),d.getMonth()+1,d.getDate()); };
    async function changeAfter(when){ try{ const d=await csLoad(); if(!d) return null;
      const t=_kOf(when), b=csBounds(d); for(const k of b) if(k>t) return _kToDate(k); return null; }catch(_){ return null; } }
    async function changeBefore(when){ try{ const d=await csLoad(); if(!d) return null;
      const t=_kOf(when), b=csBounds(d); for(let i=b.length-1;i>=0;i--) if(b[i]<t) return _kToDate(b[i]); return null; }catch(_){ return null; } }
    /* the day the CURRENTLY DRAWN world came into being — what the panel prints under the stepper */
    async function changeAt(when){ try{ const d=await csLoad(); if(!d) return null;
      const w=(when instanceof Date&&!isNaN(when.getTime()))?when:null; if(!w) return null;
      const y=w.getFullYear(); if(y<CS_MIN||y>CS_MAX) return null;
      return _kToDate(csEpoch(d,y,w.getMonth()+1,w.getDate())); }catch(_){ return null; } }
    async function changeDates(){ try{ const d=await csLoad(); if(!d) return []; return csBounds(d).map(_kToDate); }catch(_){ return []; } }
    return { _go:go, _clear:clear, current:()=>shownY, active:()=>active, refresh:()=>{ try{ window._applyBorders(); }catch(_){} }, currentFC:()=>cache.get(shownY)||null, geomFor, geomForCode, resolveHist, featureAt, _nearest:nearest,
             changeAfter, changeBefore, changeAt, changeDates, range:()=>({min:CS_MIN,max:CS_MAX}) };
  })();
};
