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
window.IntMapModules.timeBorders=function(map,HOST){
 const GE=()=>window.IntMapGeoEngine;   /* (#R178) the renderer, through the contract — never the raw handle */
  /* (#R170) "Is it safe to addSource/addLayer right now?" — the app-wide predicate declared in index.html.
     A function DECLARATION so nested closures above this line can call it (no TDZ). Falls back to the old
     isStyleLoaded() test only if the host is somehow absent. */
  function _imCanDraw(){ try{ return !!HOST.canDraw(); }catch(_){ try{ const m=window.__imap||map; return !!(m&&m.isStyleLoaded()); }catch(__){ return false; } } }
  const applyTheme=HOST.applyTheme, countryStats=HOST.countryStats, showCountryDetail=HOST.showCountryDetail;
  return (function(){
    if(typeof map==='undefined'||!map||!window.IntMapTime) return {};
    const YEARS=[1900,1914,1920,1930,1938,1945,1960,1994,2000,2010];
    const PROX=[x=>x, x=>'https://corsproxy.io/?url='+encodeURIComponent(x), x=>'https://api.allorigins.win/raw?url='+encodeURIComponent(x)];
    const cache=new Map(); let active=false, shownY=null, seq=0, shownCorr=false;   /* (#R106) shownCorr = the Tibet display-year merge state (see _eraCorrect) */
    /* (#R94o) CLOSEST snapshot, not just the closest ≤ year — so a mid-gap year like 1910 shows the 1914 borders
       (Japan's southern Sakhalin/Karafuto, held since 1905) instead of the staler 1900, i.e. borders change at the
       gap midpoint, roughly halving how long a year is shown with the "wrong" borders. A FORWARD jump is only
       taken across a MODEST gap (≤ MAXGAP yr); the huge 1960→1994 gap keeps the earlier snapshot so the 1980s
       never render a post-Soviet world (the faithful state DATES already live in IntMapHistStates). */
    const MAXGAP=20;
    const nearest=y=>{ let prev=null,next=null; for(const yy of YEARS){ if(yy<=y){ if(prev===null||yy>prev) prev=yy; } else if(next===null||yy<next) next=yy; }
      if(prev===null) return next!=null?next:YEARS[0];
      if(next===null) return prev;
      return ((next-y)<(y-prev) && (next-prev)<=MAXGAP) ? next : prev; };
    /* ===== (#R117) YEARLY borders 1886–2019 from CShapes 2.0 (Schvitz et al. 2022, ETH Zürich — international
       borders with per-feature validity DATES, so the map changes in the exact year a border changed: no more
       "nearest of 10 snapshots"). Self-hosted simplified copy (data/cshapes.js, ring-pooled). aourednik snapshots
       remain the automatic FALLBACK (and nothing else about that path was removed). The displayed state of a year
       is its JULY 1 state (mid-year convention: 1991 still shows the USSR, 1990 shows two Germanys). */
    const CS_MIN=1886, CS_MAX=2019;
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
    function csFC(d,year){ const feats=[];
      for(let i=0;i<d.feats.length;i++){ const f=d.feats[i];
        const sy=f[2],sm=f[3],sd=f[4],ey=f[5],em=f[6],ed=f[7];
        /* active on July 1 of `year` */
        const started=(sy<year)||(sy===year&&(sm<7||(sm===7&&sd<=1)));
        const ends=(ey>year)||(ey===year&&(em>7||(em===7&&ed>=1)));
        if(!started||!ends) continue;
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
      {re:/^\s*(tibet|xizang|thibet)\s*$/i, nm:{en:'Tibet',jp:'チベット',de:'Tibet',ru:'Тибет',es:'Tíbet'}, wiki:'Tibet_(1912%E2%80%931951)', flag:F_TIBET},
      {re:/^\s*(east[ -]?turkest(an|än)|uygh?ur(istan)?|sinkiang|kashgaria|(first|second) east turkestan republic)\s*$/i, nm:{en:'East Turkestan',jp:'東トルキスタン',de:'Ostturkestan',ru:'Восточный Туркестан',es:'Turkestán Oriental'}, wiki:'East_Turkestan', flag:F_ETRK},
      {re:/^\s*(manchukuo|manchoukuo|manchuria)\s*$/i, nm:{en:'Manchukuo',jp:'満洲国',de:'Mandschukuo',ru:'Маньчжоу-го',es:'Manchukuo'}, wiki:'Manchukuo', flag:F_MANK},
      /* (#R130) states CShapes draws as their OWN polygon (gw265/817/680/291) but _GW2ISO folded into a modern carrier,
         so a click resolved to the modern country + its (wrong) era article/flag. Placed here (step 2b) so they win
         over the gwcode step. No stats carrier exists (their territory has no separate modern successor), so — like
         Tibet/Manchukuo — they surface identity/flag/Wikipedia honestly without comparable numbers. */
      {re:/^\s*(east germany|german democratic republic|d\.?\s?d\.?\s?r\.?|deutsche demokratische republik)\s*$/i, nm:{en:'East Germany',jp:'東ドイツ',de:'Deutsche Demokratische Republik',ru:'ГДР',es:'Alemania Oriental'}, wiki:'East_Germany', flag:F_DDR},
      {re:/^\s*(south vietnam|republic of vietnam)\s*$/i, nm:{en:'South Vietnam',jp:'南ベトナム',de:'Südvietnam',ru:'Южный Вьетнам',es:'Vietnam del Sur'}, wiki:'South_Vietnam', flag:F_RVN},
      {re:/^\s*(south yemen|people'?s democratic republic of yemen|p\.?d\.?r\.?y\.?)\s*$/i, nm:{en:'South Yemen',jp:'南イエメン',de:'Südjemen',ru:'Южный Йемен',es:'Yemen del Sur'}, wiki:'South_Yemen', flag:F_PDRY},
      {re:/^\s*(danzig|free city of danzig)\s*$/i, nm:{en:'Free City of Danzig',jp:'ダンツィヒ自由市',de:'Freie Stadt Danzig',ru:'Вольный город Данциг',es:'Ciudad Libre de Dánzig'}, wiki:'Free_City_of_Danzig', flag:F_DANZIG},
      /* (#R136) the Dominion of Newfoundland was a self-governing British dominion until it joined Canada in 1949 —
         _GW2ISO(21) folded it into modern CANADA, so a click showed Canada's flag/article. Restore its own identity
         (no separate Maddison series → honest name/flag/Wikipedia without comparable numbers, like Danzig). */
      {re:/^\s*(newfoundland|dominion of newfoundland)\s*$/i, nm:{en:'Dominion of Newfoundland',jp:'ニューファンドランド自治領',de:'Dominion Neufundland',ru:'Доминион Ньюфаундленд',es:'Dominio de Terranova'}, wiki:'Dominion_of_Newfoundland', flag:F_UNIONJACK}
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
      if(!GE().layers.has('imtb-line')) GE().layers.add({id:'imtb-line',type:'line',source:'imtb-src',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':'rgba(160,160,168,0.95)','line-opacity':0.95,'line-width':['interpolate',['linear'],['zoom'],1,0.6,4,1.1,8,1.8,12,2.5]}}, before);
      /* (#R101) RENAMED countries (name differs from the present, e.g. Siam, Soviet Union, German Empire) → the era
         name, era style. Filtered to _same!=1 (see tagSame). */
      if(!GE().layers.has('imtb-lbl')) GE().layers.add({id:'imtb-lbl',type:'symbol',source:'imtb-src',minzoom:1.4,filter:['!=',['coalesce',['get','_same'],0],1],layout:{'symbol-placement':'point','text-field':['coalesce',['get','_locName'],['get','NAME'],['get','name'],''],'text-font':['literal',['Noto Sans Regular']],'text-letter-spacing':0.06,'text-size':['interpolate',['linear'],['zoom'],1,9.5,4,13],'text-max-width':7,'text-padding':6},paint:{'text-color':'#eef2ff','text-halo-color':'rgba(0,0,0,0.8)','text-halo-width':1.5}});
      /* (#R101) UNCHANGED countries (same name as today, e.g. Japan, France) keep their normal country label style
         (matching ofm-country) rather than the era style — per request "国名が変わってない国は既存の国名ラベルのまま".
         Filtered to _same==1. Rendered from the era data so no country ever loses its label. */
      if(!GE().layers.has('imtb-lbl2')) GE().layers.add({id:'imtb-lbl2',type:'symbol',source:'imtb-src',minzoom:1.4,maxzoom:7,filter:['==',['coalesce',['get','_same'],0],1],layout:{'symbol-placement':'point','text-field':['coalesce',['get','_modName'],['get','NAME'],['get','name'],''],'text-font':['literal',['Noto Sans Regular']],'text-letter-spacing':0.08,'text-size':['interpolate',['linear'],['zoom'],1,10,4,15],'text-max-width':8,'text-padding':6},paint:{'text-color':'#e8eefc','text-halo-color':'rgba(0,0,0,0.75)','text-halo-width':1.4}});
      /* (#R94k) clicking a historical label/border opens the SAME country card as a modern country: resolve the
         era polygon's NAME to its countryStats entry (a former state, or a modern country renamed for the era). */
      if(!map.__imtbClick){ map.__imtbClick=true;
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
          const f=e.features&&e.features[0]; if(!f) return; const nm=(f.properties&&(f.properties.NAME||f.properties.name))||''; if(!nm) return;
          /* (#R94m) EXACTLY the modern-country reaction: the same place popup (Copy/Wikipedia/AI brief/Isolate)
             + blue outline — here the era polygon is outlined. No bespoke behaviour.
             (#R94n) resolve to the app's historical ENTITY → the era NAME + Wikipedia title (so the card/popup and
             the Wikipedia link land on e.g. "German Empire", NOT modern Germany), and take the FULL source polygon
             — the click event's feature.geometry is CLIPPED to the vector tile the tap landed in (a geojson-vt
             artifact), which is what drew the highlight "cut off in straight lines" for big countries. */
          const R=resolveHist(nm,e.lngLat); const dispName=R.name||nm; const geom=R.geometry||f.geometry;
          if(typeof window._imPlacePopup==='function'){ window._imPlacePopup(e.lngLat,dispName,true,{geojson:geom,wiki:R.wiki||nm,flag:R.flag}); }
          else if(R.code&&typeof showCountryDetail==='function'){ showCountryDetail(R.code); } }catch(_){} };
        /* (#R122) ONLY the era country-NAME labels open the country card — NOT the whole-country fill/line. Clicking
           empty land inside a past country (no name label, no place label there) must NOT force a country-name click
           ("国名でも地名ラベルでもない場所をクリックしたら、強制的に国名をクリックした判定になる"). This mirrors the
           modern map, where clicking bare land opens nothing. The name labels (imtb-lbl / imtb-lbl2) remain clickable. */
        ['imtb-lbl','imtb-lbl2'].forEach(id=>{ GE().events.onLayer('click',id,_clk); GE().events.onLayer('mouseenter',id,()=>{ try{ GE().render.canvas().style.cursor='pointer'; }catch(_){} }); GE().events.onLayer('mouseleave',id,()=>{ try{ GE().render.canvas().style.cursor=''; }catch(_){} }); });
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
      [/^\s*persia\s*$/i,{jp:'ペルシャ',de:'Persien',ru:'Персия',es:'Persia'}],
      [/^\s*siam\s*$/i,{jp:'シャム',de:'Siam',ru:'Сиам',es:'Siam'}],
      [/^\s*abyssinia\s*$/i,{jp:'アビシニア',de:'Abessinien',ru:'Абиссиния',es:'Abisinia'}],
      [/^\s*burma\s*$/i,{jp:'ビルマ',de:'Birma',ru:'Бирма',es:'Birmania'}],
      [/^\s*ceylon\s*$/i,{jp:'セイロン',de:'Ceylon',ru:'Цейлон',es:'Ceilán'}],
      [/^\s*formosa\s*$/i,{jp:'フォルモサ',de:'Formosa',ru:'Формоза',es:'Formosa'}],
      [/^\s*prussia\s*$/i,{jp:'プロイセン',de:'Preußen',ru:'Пруссия',es:'Prusia'}],
      [/^\s*bavaria\s*$/i,{jp:'バイエルン',de:'Bayern',ru:'Бавария',es:'Baviera'}],
      [/^\s*rhodesia\s*$/i,{jp:'ローデシア',de:'Rhodesien',ru:'Родезия',es:'Rodesia'}],
      [/^\s*zaire\s*$/i,{jp:'ザイール',de:'Zaire',ru:'Заир',es:'Zaire'}],
      [/^\s*trans-?jordan\s*$/i,{jp:'トランスヨルダン',de:'Transjordanien',ru:'Трансиордания',es:'Transjordania'}],
      [/^\s*bohemia\s*$/i,{jp:'ボヘミア',de:'Böhmen',ru:'Богемия',es:'Bohemia'}],
      [/^\s*mesopotamia\s*$/i,{jp:'メソポタミア',de:'Mesopotamien',ru:'Месопотамия',es:'Mesopotamia'}],
      [/^\s*newfoundland\s*$/i,{jp:'ニューファンドランド',de:'Neufundland',ru:'Ньюфаундленд',es:'Terranova'}],
      [/^\s*tanganyika\s*$/i,{jp:'タンガニーカ',de:'Tanganjika',ru:'Танганьика',es:'Tanganica'}],
      [/^\s*nyasaland\s*$/i,{jp:'ニアサランド',de:'Njassaland',ru:'Ньясаленд',es:'Niasalandia'}],
      [/^\s*dahomey\s*$/i,{jp:'ダホメ',de:'Dahomey',ru:'Дагомея',es:'Dahomey'}],
      [/^\s*(upper volta|haute-?volta)\s*$/i,{jp:'オートボルタ',de:'Obervolta',ru:'Верхняя Вольта',es:'Alto Volta'}],
      [/^\s*basutoland\s*$/i,{jp:'バストランド',de:'Basutoland',ru:'Басутоленд',es:'Basutolandia'}],
      [/^\s*bechuanaland\s*$/i,{jp:'ベチュアナランド',de:'Betschuanaland',ru:'Бечуаналенд',es:'Bechuanalandia'}],
      [/^\s*(kampuchea|khmer republic)\s*$/i,{jp:'カンプチア',de:'Kamputschea',ru:'Кампучия',es:'Kampuchea'}],
      [/^\s*kingdom of hungary\s*$/i,{jp:'ハンガリー王国',de:'Königreich Ungarn',ru:'Королевство Венгрия',es:'Reino de Hungría'}],
      [/^\s*(kingdom of romania|rumania)\s*$/i,{jp:'ルーマニア王国',de:'Königreich Rumänien',ru:'Королевство Румыния',es:'Reino de Rumania'}],
      [/^\s*kingdom of (bulgaria)\s*$/i,{jp:'ブルガリア王国',de:'Königreich Bulgarien',ru:'Царство Болгария',es:'Reino de Bulgaria'}],
      [/^\s*kingdom of (serbia)\s*$/i,{jp:'セルビア王国',de:'Königreich Serbien',ru:'Королевство Сербия',es:'Reino de Serbia'}],
      [/^\s*kingdom of (greece)\s*$/i,{jp:'ギリシャ王国',de:'Königreich Griechenland',ru:'Королевство Греция',es:'Reino de Grecia'}],
      [/^\s*(kingdom of yugoslavia|kingdom of (the )?serbs.*)\s*$/i,{jp:'ユーゴスラビア王国',de:'Königreich Jugoslawien',ru:'Королевство Югославия',es:'Reino de Yugoslavia'}],
      [/^\s*(gran colombia|greater colombia)\s*$/i,{jp:'大コロンビア',de:'Großkolumbien',ru:'Великая Колумбия',es:'Gran Colombia'}],
      [/^\s*congo free state\s*$/i,{jp:'コンゴ自由国',de:'Kongo-Freistaat',ru:'Свободное государство Конго',es:'Estado Libre del Congo'}],
      [/^\s*(french indochina|indochina)\s*$/i,{jp:'仏領インドシナ',de:'Französisch-Indochina',ru:'Французский Индокитай',es:'Indochina francesa'}],
      [/^\s*kingdom of (egypt)\s*$/i,{jp:'エジプト王国',de:'Königreich Ägypten',ru:'Королевство Египет',es:'Reino de Egipto'}],
      [/^\s*kingdom of (iraq)\s*$/i,{jp:'イラク王国',de:'Königreich Irak',ru:'Королевство Ирак',es:'Reino de Irak'}],
      [/^\s*(manchuria|manchoukuo)\s*$/i,{jp:'満洲',de:'Mandschurei',ru:'Маньчжурия',es:'Manchuria'}],
      [/^\s*(cochin ?china)\s*$/i,{jp:'コーチシナ',de:'Cochinchina',ru:'Кохинхина',es:'Cochinchina'}],
      [/^\s*(gold coast)\s*$/i,{jp:'ゴールドコースト',de:'Goldküste',ru:'Золотой Берег',es:'Costa del Oro'}],
      [/^\s*(east prussia)\s*$/i,{jp:'東プロイセン',de:'Ostpreußen',ru:'Восточная Пруссия',es:'Prusia Oriental'}],
      /* (#R110) further historical entities seen in the 1900–1960 snapshots ("昔の国名にするのは…未対応の国がまだ残ってる") —
         colonial federations & territories, interwar/occupation states, and the more recognisable pre-colonial kingdoms. */
      [/^\s*french west africa\s*$/i,{jp:'フランス領西アフリカ',de:'Französisch-Westafrika',ru:'Французская Западная Африка',es:'África Occidental Francesa'}],
      [/^\s*french equatorial africa\s*$/i,{jp:'フランス領赤道アフリカ',de:'Französisch-Äquatorialafrika',ru:'Французская Экваториальная Африка',es:'África Ecuatorial Francesa'}],
      [/^\s*french indo-?china\s*$/i,{jp:'フランス領インドシナ',de:'Französisch-Indochina',ru:'Французский Индокитай',es:'Indochina francesa'}],
      [/^\s*french somaliland\s*$/i,{jp:'フランス領ソマリランド',de:'Französisch-Somaliland',ru:'Французский Сомалиленд',es:'Somalilandia Francesa'}],
      [/^\s*french cameroons?\s*$/i,{jp:'フランス領カメルーン',de:'Französisch-Kamerun',ru:'Французский Камерун',es:'Camerún Francés'}],
      [/^\s*belgian congo\s*$/i,{jp:'ベルギー領コンゴ',de:'Belgisch-Kongo',ru:'Бельгийское Конго',es:'Congo Belga'}],
      [/^\s*british east africa\s*$/i,{jp:'イギリス領東アフリカ',de:'Britisch-Ostafrika',ru:'Британская Восточная Африка',es:'África Oriental Británica'}],
      [/^\s*british somaliland\s*$/i,{jp:'イギリス領ソマリランド',de:'Britisch-Somaliland',ru:'Британский Сомалиленд',es:'Somalilandia Británica'}],
      [/^\s*italian somaliland\s*$/i,{jp:'イタリア領ソマリランド',de:'Italienisch-Somaliland',ru:'Итальянское Сомали',es:'Somalia Italiana'}],
      [/^\s*anglo-?egypt(ia|io)n sudan\s*$/i,{jp:'英埃領スーダン',de:'Anglo-Ägyptischer Sudan',ru:'Англо-Египетский Судан',es:'Sudán Anglo-Egipcio'}],
      [/^\s*german south-?west africa\s*$/i,{jp:'ドイツ領南西アフリカ',de:'Deutsch-Südwestafrika',ru:'Германская Юго-Западная Африка',es:'África del Sudoeste Alemana'}],
      [/^\s*german e(ast|\.) africa.*$/i,{jp:'ドイツ領東アフリカ',de:'Deutsch-Ostafrika',ru:'Германская Восточная Африка',es:'África Oriental Alemana'}],
      [/^\s*portuguese east africa\s*$/i,{jp:'ポルトガル領東アフリカ',de:'Portugiesisch-Ostafrika',ru:'Португальская Восточная Африка',es:'África Oriental Portuguesa'}],
      [/^\s*portuguese guinea\s*$/i,{jp:'ポルトガル領ギニア',de:'Portugiesisch-Guinea',ru:'Португальская Гвинея',es:'Guinea Portuguesa'}],
      [/^\s*spanish guinea\s*$/i,{jp:'スペイン領ギニア',de:'Spanisch-Guinea',ru:'Испанская Гвинея',es:'Guinea Española'}],
      [/^\s*spanish morocco\s*$/i,{jp:'スペイン領モロッコ',de:'Spanisch-Marokko',ru:'Испанское Марокко',es:'Marruecos Español'}],
      [/^\s*spanish sahara\s*$/i,{jp:'スペイン領サハラ',de:'Spanisch-Sahara',ru:'Испанская Сахара',es:'Sahara Español'}],
      [/^\s*rio de oro\s*$/i,{jp:'リオ・デ・オロ',de:'Río de Oro',ru:'Рио-де-Оро',es:'Río de Oro'}],
      [/^\s*kamerun\s*$/i,{jp:'ドイツ領カメルーン',de:'Kamerun',ru:'Камерун (нем.)',es:'Camerún alemán'}],
      [/^\s*togoland\s*$/i,{jp:'トーゴランド',de:'Togoland',ru:'Тоголенд',es:'Togolandia'}],
      [/^\s*northern rhodesia\s*$/i,{jp:'北ローデシア',de:'Nordrhodesien',ru:'Северная Родезия',es:'Rodesia del Norte'}],
      [/^\s*southern rhodesia\s*$/i,{jp:'南ローデシア',de:'Südrhodesien',ru:'Южная Родезия',es:'Rodesia del Sur'}],
      [/^\s*netherlands indies\s*$/i,{jp:'オランダ領東インド',de:'Niederländisch-Indien',ru:'Голландская Ост-Индия',es:'Indias Orientales Neerlandesas'}],
      [/^\s*trucial oman\s*$/i,{jp:'トルーシャル・オマーン',de:'Vertragsoman',ru:'Договорный Оман',es:'Omán de la Tregua'}],
      [/^\s*muscat and oman\s*$/i,{jp:'マスカット・オマーン',de:'Maskat und Oman',ru:'Маскат и Оман',es:'Mascate y Omán'}],
      [/^\s*hejaz\s*$/i,{jp:'ヒジャーズ',de:'Hedschas',ru:'Хиджаз',es:'Hiyaz'}],
      [/^\s*union of south africa\s*$/i,{jp:'南アフリカ連邦',de:'Südafrikanische Union',ru:'Южно-Африканский Союз',es:'Unión Sudafricana'}],
      [/^\s*orange free state\s*$/i,{jp:'オレンジ自由国',de:'Oranje-Freistaat',ru:'Оранжевое Свободное государство',es:'Estado Libre de Orange'}],
      [/^\s*transvaal\s*$/i,{jp:'トランスヴァール共和国',de:'Transvaal',ru:'Трансвааль',es:'Transvaal'}],
      [/^\s*cape colony\s*$/i,{jp:'ケープ植民地',de:'Kapkolonie',ru:'Капская колония',es:'Colonia del Cabo'}],
      [/^\s*natal\s*$/i,{jp:'ナタール',de:'Natal',ru:'Наталь',es:'Natal'}],
      [/^\s*zululand\s*$/i,{jp:'ズールーランド',de:'Zululand',ru:'Зулуленд',es:'Zululandia'}],
      [/^\s*sokoto caliphate\s*$/i,{jp:'ソコト帝国',de:'Kalifat von Sokoto',ru:'Халифат Сокото',es:'Califato de Sokoto'}],
      [/^\s*asante\s*$/i,{jp:'アシャンティ王国',de:'Aschanti',ru:'Ашанти',es:'Ashanti'}],
      [/^\s*buganda\s*$/i,{jp:'ブガンダ王国',de:'Buganda',ru:'Буганда',es:'Buganda'}],
      [/^\s*bunyoro\s*$/i,{jp:'ブニョロ王国',de:'Bunyoro',ru:'Буньоро',es:'Bunyoro'}],
      [/^\s*oyo\s*$/i,{jp:'オヨ王国',de:'Oyo',ru:'Ойо',es:'Oyo'}],
      [/^\s*kanem-?bornu\s*$/i,{jp:'カネム・ボルヌ帝国',de:'Kanem-Bornu',ru:'Канем-Борну',es:'Kanem-Bornu'}],
      [/^\s*manchu empire\s*$/i,{jp:'満洲帝国',de:'Mandschurisches Reich',ru:'Маньчжурская империя',es:'Imperio manchú'}],
      [/^\s*malaya\s*$/i,{jp:'マラヤ',de:'Malaya',ru:'Малайя',es:'Malaca'}],
      [/^\s*annam\s*$/i,{jp:'安南',de:'Annam',ru:'Аннам',es:'Annam'}],
      [/^\s*tonkin\s*$/i,{jp:'トンキン',de:'Tonkin',ru:'Тонкин',es:'Tonkín'}],
      [/^\s*mandatory palestine\s*$/i,{jp:'委任統治領パレスチナ',de:'Mandatsgebiet Palästina',ru:'Подмандатная Палестина',es:'Palestina del Mandato'}],
      [/^\s*danzig\s*$/i,{jp:'ダンツィヒ自由市',de:'Danzig',ru:'Данциг',es:'Dánzig'}],
      [/^\s*saar( protectorate)?\s*$/i,{jp:'ザール保護領',de:'Saarprotektorat',ru:'Саарский протекторат',es:'Protectorado del Sarre'}],
      [/^\s*east germany\s*$/i,{jp:'東ドイツ',de:'Ostdeutschland (DDR)',ru:'Восточная Германия',es:'Alemania Oriental'}],
      [/^\s*west germany\s*$/i,{jp:'西ドイツ',de:'Westdeutschland',ru:'Западная Германия',es:'Alemania Occidental'}],
      /* (#R130) Cold-War Vietnam / Yemen splits — the era LABELS localized to match the new _VANISHED identities. */
      [/^\s*south vietnam\s*$/i,{jp:'南ベトナム',de:'Südvietnam',ru:'Южный Вьетнам',es:'Vietnam del Sur'}],
      [/^\s*north vietnam\s*$/i,{jp:'北ベトナム',de:'Nordvietnam',ru:'Северный Вьетнам',es:'Vietnam del Norte'}],
      [/^\s*south yemen\s*$/i,{jp:'南イエメン',de:'Südjemen',ru:'Южный Йемен',es:'Yemen del Sur'}],
      [/^\s*north yemen\s*$/i,{jp:'北イエメン',de:'Nordjemen',ru:'Северный Йемен',es:'Yemen del Norte'}],
      [/^\s*dominion of newfoundland\s*$/i,{jp:'ニューファンドランド自治領',de:'Dominion Neufundland',ru:'Доминион Ньюфаундленд',es:'Dominio de Terranova'}],
      [/^\s*united kingdom of great britain and ireland\s*$/i,{jp:'グレートブリテン・アイルランド連合王国',de:'Vereinigtes Königreich Großbritannien und Irland',ru:'Соединённое Королевство Великобритании и Ирландии',es:'Reino Unido de Gran Bretaña e Irlanda'}],
      [/^\s*sweden[\s–-]+norway\s*$/i,{jp:'スウェーデン・ノルウェー連合',de:'Schweden-Norwegen',ru:'Швеция и Норвегия',es:'Suecia y Noruega'}],
      [/^\s*chinese warlords\s*$/i,{jp:'中国軍閥',de:'Chinesische Warlords',ru:'Китайские милитаристы',es:'Señores de la guerra chinos'}],
      [/^\s*xinjiang\s*$/i,{jp:'新疆',de:'Xinjiang',ru:'Синьцзян',es:'Sinkiang'}],
      [/^\s*far eastern (ssr|republic)\s*$/i,{jp:'極東共和国',de:'Fernöstliche Republik',ru:'Дальневосточная республика',es:'República del Lejano Oriente'}],
      [/^\s*white russia\s*$/i,{jp:'白ロシア',de:'Weißrussland',ru:'Белоруссия',es:'Rusia Blanca'}],
      [/^\s*south russia\s*$/i,{jp:'南ロシア',de:'Südrussland',ru:'Юг России',es:'Rusia del Sur'}],
      [/^\s*rattanakosin kingdom\s*$/i,{jp:'ラッタナコーシン王国',de:'Rattanakosin-Königreich',ru:'Королевство Раттанакосин',es:'Reino de Rattanakosin'}],
      [/^\s*kingdom of hawaii\s*$/i,{jp:'ハワイ王国',de:'Königreich Hawaiʻi',ru:'Гавайское королевство',es:'Reino de Hawái'}],
      [/^\s*kingdom of brazil\s*$/i,{jp:'ブラジル王国',de:'Königreich Brasilien',ru:'Королевство Бразилия',es:'Reino de Brasil'}],
      [/^\s*sult[ia]nate of zanzibar\s*$/i,{jp:'ザンジバル・スルタン国',de:'Sultanat Sansibar',ru:'Занзибарский султанат',es:'Sultanato de Zanzíbar'}],
      [/^\s*bosnia-herzegovina\s*$/i,{jp:'ボスニア・ヘルツェゴビナ',de:'Bosnien und Herzegowina',ru:'Босния и Герцеговина',es:'Bosnia y Herzegovina'}],
      [/^\s*arabia\s*$/i,{jp:'アラビア',de:'Arabien',ru:'Аравия',es:'Arabia'}],
      [/^\s*imperial japan\s*$/i,{jp:'大日本帝国',de:'Kaiserreich Japan',ru:'Японская империя',es:'Imperio del Japón'}],
      /* (#R110) modern countries that appear in the data only with a "(Coloniser)" suffix (French/Portuguese/… rule) —
         listed here so the suffix handler can localize the BASE in DE/RU/ES too (countryStats has no DE/RU/ES country
         names), e.g. Syria (France) → Syrien (Frankreich) / Сирия (Франция) / Siria (Francia). */
      [/^\s*algeria\s*$/i,{jp:'アルジェリア',de:'Algerien',ru:'Алжир',es:'Argelia'}],
      [/^\s*angola\s*$/i,{jp:'アンゴラ',de:'Angola',ru:'Ангола',es:'Angola'}],
      [/^\s*congo\s*$/i,{jp:'コンゴ',de:'Kongo',ru:'Конго',es:'Congo'}],
      [/^\s*madagascar\s*$/i,{jp:'マダガスカル',de:'Madagaskar',ru:'Мадагаскар',es:'Madagascar'}],
      [/^\s*morocco\s*$/i,{jp:'モロッコ',de:'Marokko',ru:'Марокко',es:'Marruecos'}],
      [/^\s*mozambique\s*$/i,{jp:'モザンビーク',de:'Mosambik',ru:'Мозамбик',es:'Mozambique'}],
      [/^\s*syria\s*$/i,{jp:'シリア',de:'Syrien',ru:'Сирия',es:'Siria'}],
      [/^\s*eritrea\s*$/i,{jp:'エリトリア',de:'Eritrea',ru:'Эритрея',es:'Eritrea'}],
      [/^\s*jamaica\s*$/i,{jp:'ジャマイカ',de:'Jamaika',ru:'Ямайка',es:'Jamaica'}],
      [/^\s*rwanda\s*$/i,{jp:'ルワンダ',de:'Ruanda',ru:'Руанда',es:'Ruanda'}],
      [/^\s*yemen\s*$/i,{jp:'イエメン',de:'Jemen',ru:'Йемен',es:'Yemen'}],
      [/^\s*guinea-?bissau\s*$/i,{jp:'ギニアビサウ',de:'Guinea-Bissau',ru:'Гвинея-Бисау',es:'Guinea-Bisáu'}],
      [/^\s*libya\s*$/i,{jp:'リビア',de:'Libyen',ru:'Ливия',es:'Libia'}],
      [/^\s*martinique\s*$/i,{jp:'マルティニーク',de:'Martinique',ru:'Мартиника',es:'Martinica'}],
      /* (#R111) remaining untranslated names ("未対応の国がまだ残ってる") — (a) modern territories the aourednik data
         spells differently from Natural Earth so they never matched (United States, Gambia The, Swaziland…);
         (b) more colonial / interwar territories; (c) recognisable pre-colonial polities (JP katakana + RU Cyrillic;
         DE/ES keep the proper noun where there is no distinct local form). */
      [/^\s*united states\s*$/i,{jp:'アメリカ合衆国',de:'Vereinigte Staaten',ru:'США',es:'Estados Unidos'}],
      [/^\s*china\s*$/i,{jp:'中国',de:'China',ru:'Китай',es:'China'}],
      [/^\s*norway\s*$/i,{jp:'ノルウェー',de:'Norwegen',ru:'Норвегия',es:'Noruega'}],
      [/^\s*western sahara\s*$/i,{jp:'西サハラ',de:'Westsahara',ru:'Западная Сахара',es:'Sáhara Occidental'}],
      [/^\s*antarctica\s*$/i,{jp:'南極',de:'Antarktis',ru:'Антарктида',es:'Antártida'}],
      [/^\s*bahamas(,? the)?\s*$/i,{jp:'バハマ',de:'Bahamas',ru:'Багамы',es:'Bahamas'}],
      [/^\s*(the )?gambia(,? the)?\s*$/i,{jp:'ガンビア',de:'Gambia',ru:'Гамбия',es:'Gambia'}],
      [/^\s*tanzania, united republic of\s*$/i,{jp:'タンザニア',de:'Tansania',ru:'Танзания',es:'Tanzania'}],
      [/^\s*swaziland\s*$/i,{jp:'スワジランド',de:'Swasiland',ru:'Свазиленд',es:'Suazilandia'}],
      [/^\s*trinidad\s*$/i,{jp:'トリニダード',de:'Trinidad',ru:'Тринидад',es:'Trinidad'}],
      [/^\s*rapa nui\s*$/i,{jp:'ラパ・ヌイ',de:'Rapa Nui',ru:'Рапануи',es:'Rapa Nui'}],
      [/^\s*wallis and futuna( islands)?\s*$/i,{jp:'ウォリス・フツナ',de:'Wallis und Futuna',ru:'Уоллис и Футуна',es:'Wallis y Futuna'}],
      [/^\s*french guiana\s*$/i,{jp:'仏領ギアナ',de:'Französisch-Guayana',ru:'Французская Гвиана',es:'Guayana Francesa'}],
      [/^\s*guadeloupe\s*$/i,{jp:'グアドループ',de:'Guadeloupe',ru:'Гваделупа',es:'Guadalupe'}],
      [/^\s*netherlands antilles\s*$/i,{jp:'オランダ領アンティル',de:'Niederländische Antillen',ru:'Нидерландские Антильские острова',es:'Antillas Neerlandesas'}],
      [/^\s*korea, republic of\s*$/i,{jp:'大韓民国',de:'Republik Korea',ru:'Республика Корея',es:'República de Corea'}],
      [/^\s*korea, democratic people'?s republic of\s*$/i,{jp:'朝鮮民主主義人民共和国',de:'Nordkorea',ru:'КНДР',es:'Corea del Norte'}],
      [/^\s*korea\s*$/i,{jp:'朝鮮',de:'Korea',ru:'Корея',es:'Corea'}],
      [/^\s*dutch east indies\s*$/i,{jp:'オランダ領東インド',de:'Niederländisch-Indien',ru:'Голландская Ост-Индия',es:'Indias Orientales Neerlandesas'}],
      [/^\s*german empire\s*$/i,{jp:'ドイツ帝国',de:'Deutsches Kaiserreich',ru:'Германская империя',es:'Imperio alemán'}],
      [/^\s*king(dom|fom) of italy\s*$/i,{jp:'イタリア王国',de:'Königreich Italien',ru:'Королевство Италия',es:'Reino de Italia'}],
      [/^\s*cyr[ae]n[ae]ica.*$/i,{jp:'キレナイカ',de:'Kyrenaika',ru:'Киренаика',es:'Cirenaica'}],
      [/^\s*tripolitan.*$/i,{jp:'トリポリタニア',de:'Tripolitanien',ru:'Триполитания',es:'Tripolitania'}],
      [/^\s*fezzan.*$/i,{jp:'フェザーン',de:'Fessan',ru:'Феццан',es:'Fezán'}],
      [/^\s*arabia \(nejd\)\s*$/i,{jp:'ナジュド（アラビア）',de:'Nadschd (Arabien)',ru:'Неджд (Аравия)',es:'Néyed (Arabia)'}],
      [/^\s*hail\s*$/i,{jp:'ハーイル',de:'Hail',ru:'Хаиль',es:'Hail'}],
      [/^\s*british guiana\s*$/i,{jp:'英領ギアナ',de:'Britisch-Guayana',ru:'Британская Гвиана',es:'Guayana Británica'}],
      [/^\s*dutch gui(ana|nea)\s*$/i,{jp:'オランダ領ギアナ',de:'Niederländisch-Guayana',ru:'Голландская Гвиана',es:'Guayana Neerlandesa'}],
      [/^\s*southern cameroons?\s*$/i,{jp:'南カメルーン',de:'Südkamerun',ru:'Южный Камерун',es:'Camerún del Sur'}],
      [/^\s*gilbert and el?lice islands\s*$/i,{jp:'ギルバート・エリス諸島',de:'Gilbert- und Ellice-Inseln',ru:'Острова Гилберта и Эллис',es:'Islas Gilbert y Ellice'}],
      [/^\s*new hebrides\s*$/i,{jp:'ニューヘブリディーズ',de:'Neue Hebriden',ru:'Новые Гебриды',es:'Nuevas Hébridas'}],
      [/^\s*wal[bv]is bay\s*$/i,{jp:'ウォルビスベイ',de:'Walfischbai',ru:'Уолфиш-Бей',es:'Bahía de Walvis'}],
      [/^\s*saipan\s*$/i,{jp:'サイパン',de:'Saipan',ru:'Сайпан',es:'Saipán'}],
      [/^\s*british protectorate\s*$/i,{jp:'イギリス保護領',de:'Britisches Protektorat',ru:'Британский протекторат',es:'Protectorado británico'}],
      [/^\s*central asian khanates\s*$/i,{jp:'中央アジアのハン国',de:'Zentralasiatische Khanate',ru:'Среднеазиатские ханства',es:'Kanatos de Asia Central'}],
      [/^\s*m.?ori\s*$/i,{jp:'マオリ',de:'Māori',ru:'Маори',es:'Maorí'}],
      [/^\s*accra\s*$/i,{jp:'アクラ',de:'Accra',ru:'Аккра',es:'Acra'}],
      [/^\s*barotse\s*$/i,{jp:'バロツェ',de:'Barotse',ru:'Баротсе',es:'Barotse'}],
      [/^\s*borgu states\s*$/i,{jp:'ボルグ諸国',de:'Borgu-Staaten',ru:'Государства Боргу',es:'Estados de Borgu'}],
      [/^\s*calabar\s*$/i,{jp:'カラバル',de:'Calabar',ru:'Калабар',es:'Calabar'}],
      [/^\s*cotonou\s*$/i,{jp:'コトヌー',de:'Cotonou',ru:'Котону',es:'Cotonú'}],
      [/^\s*futa jal.?n\s*$/i,{jp:'フータ・ジャロン',de:'Futa Dschallon',ru:'Фута-Джаллон',es:'Futa Yallón'}],
      [/^\s*futa toro\s*$/i,{jp:'フータ・トロ',de:'Futa Toro',ru:'Фута-Торо',es:'Futa Toro'}],
      [/^\s*griqualand west\s*$/i,{jp:'西グリカランド',de:'Griqualand West',ru:'Западный Гриквеленд',es:'Griqualand Occidental'}],
      [/^\s*ibadan\s*$/i,{jp:'イバダン',de:'Ibadan',ru:'Ибадан',es:'Ibadán'}],
      [/^\s*imerina\s*$/i,{jp:'イメリナ',de:'Imerina',ru:'Имерина',es:'Imerina'}],
      [/^\s*kong\s*$/i,{jp:'コング帝国',de:'Kong',ru:'Конг',es:'Kong'}],
      [/^\s*kuba\s*$/i,{jp:'クバ王国',de:'Kuba',ru:'Куба',es:'Kuba'}],
      [/^\s*lagos\s*$/i,{jp:'ラゴス',de:'Lagos',ru:'Лагос',es:'Lagos'}],
      [/^\s*lozi\s*$/i,{jp:'ロジ',de:'Lozi',ru:'Лози',es:'Lozi'}],
      [/^\s*luba\s*$/i,{jp:'ルバ王国',de:'Luba',ru:'Луба',es:'Luba'}],
      [/^\s*lunda\s*$/i,{jp:'ルンダ王国',de:'Lunda',ru:'Лунда',es:'Lunda'}],
      [/^\s*mbailundu\s*$/i,{jp:'ンバイルンドゥ',de:'Mbailundu',ru:'Мбаилунду',es:'Mbailundu'}],
      [/^\s*mossi states\s*$/i,{jp:'モシ諸王国',de:'Mossi-Staaten',ru:'Государства Моси',es:'Estados Mossi'}],
      [/^\s*ndebele\s*$/i,{jp:'ンデベレ',de:'Ndebele',ru:'Ндебеле',es:'Ndebele'}],
      [/^\s*nguni\s*$/i,{jp:'ングニ',de:'Nguni',ru:'Нгуни',es:'Nguni'}],
      [/^\s*ngwato\s*$/i,{jp:'ングワト',de:'Ngwato',ru:'Нгвато',es:'Ngwato'}],
      [/^\s*opobo\s*$/i,{jp:'オポボ',de:'Opobo',ru:'Опобо',es:'Opobo'}],
      [/^\s*ovimbundu\s*$/i,{jp:'オヴィンブンドゥ',de:'Ovimbundu',ru:'Овимбунду',es:'Ovimbundu'}],
      [/^\s*shona\s*$/i,{jp:'ショナ',de:'Shona',ru:'Шона',es:'Shona'}],
      [/^\s*teke\s*$/i,{jp:'テケ王国',de:'Teke',ru:'Теке',es:'Teke'}],
      [/^\s*tukular caliphate\s*$/i,{jp:'トゥクロール帝国',de:'Tukulor-Reich',ru:'Империя Тукулёр',es:'Imperio tukulor'}],
      [/^\s*yaka\s*$/i,{jp:'ヤカ',de:'Yaka',ru:'Яка',es:'Yaka'}],
      [/^\s*yeke\s*$/i,{jp:'イェケ王国',de:'Yeke',ru:'Йеке',es:'Yeke'}],
      /* (#R117) era names introduced by the CShapes 2.0 yearly borders (colonial-period display names) */
      [/^\s*french sudan\s*$/i,{jp:'フランス領スーダン',de:'Französisch-Sudan',ru:'Французский Судан',es:'Sudán Francés'}],
      [/^\s*british guiana\s*$/i,{jp:'イギリス領ギアナ',de:'Britisch-Guayana',ru:'Британская Гвиана',es:'Guayana Británica'}],
      [/^\s*british honduras\s*$/i,{jp:'イギリス領ホンジュラス',de:'Britisch-Honduras',ru:'Британский Гондурас',es:'Honduras Británica'}],
      [/^\s*dutch guiana\s*$/i,{jp:'オランダ領ギアナ',de:'Niederländisch-Guayana',ru:'Нидерландская Гвиана',es:'Guayana Neerlandesa'}],
      [/^\s*french guinea\s*$/i,{jp:'フランス領ギニア',de:'Französisch-Guinea',ru:'Французская Гвинея',es:'Guinea Francesa'}],
      [/^\s*french togoland\s*$/i,{jp:'フランス領トーゴランド',de:'Französisch-Togo',ru:'Французское Того',es:'Togolandia Francesa'}],
      [/^\s*ubangi-?shari\s*$/i,{jp:'ウバンギ・シャリ',de:'Ubangi-Schari',ru:'Убанги-Шари',es:'Ubangui-Chari'}],
      [/^\s*french congo\s*$/i,{jp:'フランス領コンゴ',de:'Französisch-Kongo',ru:'Французское Конго',es:'Congo Francés'}],
      [/^\s*ruanda-?urundi\s*$/i,{jp:'ルアンダ＝ウルンディ',de:'Ruanda-Urundi',ru:'Руанда-Урунди',es:'Ruanda-Urundi'}],
      [/^\s*south west africa\s*$/i,{jp:'南西アフリカ',de:'Südwestafrika',ru:'Юго-Западная Африка',es:'África del Sudoeste'}],
      [/^\s*north yemen\s*$/i,{jp:'北イエメン',de:'Nordjemen',ru:'Северный Йемен',es:'Yemen del Norte'}],
      [/^\s*south yemen\s*$/i,{jp:'南イエメン',de:'Südjemen',ru:'Южный Йемен',es:'Yemen del Sur'}],
      [/^\s*north vietnam\s*$/i,{jp:'北ベトナム',de:'Nordvietnam',ru:'Северный Вьетнам',es:'Vietnam del Norte'}],
      [/^\s*south vietnam\s*$/i,{jp:'南ベトナム',de:'Südvietnam',ru:'Южный Вьетнам',es:'Vietnam del Sur'}],
      [/^\s*north borneo\s*$/i,{jp:'北ボルネオ',de:'Nordborneo',ru:'Северное Борнео',es:'Borneo del Norte'}],
      [/^\s*german new guinea\s*$/i,{jp:'ドイツ領ニューギニア',de:'Deutsch-Neuguinea',ru:'Германская Новая Гвинея',es:'Nueva Guinea Alemana'}],
      [/^\s*new guinea\s*$/i,{jp:'ニューギニア',de:'Neuguinea',ru:'Новая Гвинея',es:'Nueva Guinea'}],
      [/^\s*papua and new guinea\s*$/i,{jp:'パプア・ニューギニア',de:'Papua und Neuguinea',ru:'Папуа и Новая Гвинея',es:'Papúa y Nueva Guinea'}],
      [/^\s*papua\s*$/i,{jp:'パプア',de:'Papua',ru:'Папуа',es:'Papúa'}],
      [/^\s*new caledonia( and dependencies)?\s*$/i,{jp:'ニューカレドニア',de:'Neukaledonien',ru:'Новая Каледония',es:'Nueva Caledonia'}],
      [/^\s*french polynesia\s*$/i,{jp:'フランス領ポリネシア',de:'Französisch-Polynesien',ru:'Французская Полинезия',es:'Polinesia Francesa'}],
      [/^\s*emirate of bukhara\s*$/i,{jp:'ブハラ・アミール国',de:'Emirat Buchara',ru:'Бухарский эмират',es:'Emirato de Bujará'}],
      [/^\s*khanate of khiva\s*$/i,{jp:'ヒヴァ・ハン国',de:'Khanat Chiwa',ru:'Хивинское ханство',es:'Kanato de Jiva'}],
      [/^\s*karafuto\s*$/i,{jp:'樺太',de:'Karafuto',ru:'Карафуто',es:'Karafuto'}],
      [/^\s*straits settlements\s*$/i,{jp:'海峡植民地',de:'Straits Settlements',ru:'Стрейтс-Сетлментс',es:'Colonias del Estrecho'}],
      [/^\s*federated malay states\s*$/i,{jp:'マレー連合州',de:'Föderierte Malaiische Staaten',ru:'Федерированные малайские государства',es:'Estados Malayos Federados'}],
      [/^\s*unfederated malay states\s*$/i,{jp:'マレー非連合州',de:'Unföderierte Malaiische Staaten',ru:'Нефедерированные малайские государства',es:'Estados Malayos No Federados'}],
      [/^\s*southern nigeria\s*$/i,{jp:'南ナイジェリア',de:'Südnigeria',ru:'Южная Нигерия',es:'Nigeria del Sur'}],
      [/^\s*northern nigeria\s*$/i,{jp:'北ナイジェリア',de:'Nordnigeria',ru:'Северная Нигерия',es:'Nigeria del Norte'}],
      [/^\s*oil rivers protectorate\s*$/i,{jp:'オイル・リバーズ保護領',de:'Oil-Rivers-Protektorat',ru:'Протекторат Ойл-Риверс',es:'Protectorado de Oil Rivers'}],
      [/^\s*british bechuanaland\s*$/i,{jp:'イギリス領ベチュアナランド',de:'Britisch-Betschuanaland',ru:'Британский Бечуаналенд',es:'Bechuanalandia Británica'}],
      [/^\s*federation of rhodesia and nyasaland\s*$/i,{jp:'ローデシア・ニヤサランド連邦',de:'Föderation von Rhodesien und Njassaland',ru:'Федерация Родезии и Ньясаленда',es:'Federación de Rodesia y Niasalandia'}],
      [/^\s*federation of south arabia\s*$/i,{jp:'南アラビア連邦',de:'Südarabische Föderation',ru:'Федерация Южной Аравии',es:'Federación de Arabia del Sur'}],
      [/^\s*east aden protectorate\s*$/i,{jp:'東アデン保護領',de:'Ost-Aden-Protektorat',ru:'Восточный Аденский протекторат',es:'Protectorado de Adén Oriental'}],
      [/^\s*aden\s*$/i,{jp:'アデン',de:'Aden',ru:'Аден',es:'Adén'}],
      [/^\s*(british )?solomon islands\s*$/i,{jp:'ソロモン諸島',de:'Salomonen',ru:'Соломоновы Острова',es:'Islas Salomón'}],
      [/^\s*german solomon islands\s*$/i,{jp:'ドイツ領ソロモン諸島',de:'Deutsche Salomonen',ru:'Германские Соломоновы острова',es:'Islas Salomón Alemanas'}],
      [/^\s*portuguese timor\s*$/i,{jp:'ポルトガル領ティモール',de:'Portugiesisch-Timor',ru:'Португальский Тимор',es:'Timor Portugués'}],
      [/^\s*west irian\s*$/i,{jp:'西イリアン',de:'West-Irian',ru:'Западный Ириан',es:'Irián Occidental'}],
      [/^\s*dutch new guinea\s*$/i,{jp:'オランダ領ニューギニア',de:'Niederländisch-Neuguinea',ru:'Нидерландская Новая Гвинея',es:'Nueva Guinea Neerlandesa'}],
      [/^\s*inini\s*$/i,{jp:'イニニ',de:'Inini',ru:'Инини',es:'Inini'}],
      [/^\s*kingdom of hawaii\s*$/i,{jp:'ハワイ王国',de:'Königreich Hawaiʻi',ru:'Гавайское королевство',es:'Reino de Hawái'}],
      [/^\s*republic of hawaii\s*$/i,{jp:'ハワイ共和国',de:'Republik Hawaii',ru:'Республика Гавайи',es:'República de Hawái'}],
      [/^\s*alaska\s*$/i,{jp:'アラスカ',de:'Alaska',ru:'Аляска',es:'Alaska'}],
      [/^\s*hawaii\s*$/i,{jp:'ハワイ',de:'Hawaii',ru:'Гавайи',es:'Hawái'}],
      [/^\s*puerto rico\s*$/i,{jp:'プエルトリコ',de:'Puerto Rico',ru:'Пуэрто-Рико',es:'Puerto Rico'}],
      [/^\s*guadeloupe\s*$/i,{jp:'グアドループ',de:'Guadeloupe',ru:'Гваделупа',es:'Guadalupe'}],
      [/^\s*r(e|é)union\s*$/i,{jp:'レユニオン',de:'Réunion',ru:'Реюньон',es:'Reunión'}],
      [/^\s*irish free state\s*$/i,{jp:'アイルランド自由国',de:'Irischer Freistaat',ru:'Ирландское Свободное государство',es:'Estado Libre Irlandés'}],
      [/^\s*korean empire\s*$/i,{jp:'大韓帝国',de:'Kaiserreich Korea',ru:'Корейская империя',es:'Imperio Coreano'}],
      [/^\s*korea\s*$/i,{jp:'朝鮮',de:'Korea',ru:'Корея',es:'Corea'}],
      [/^\s*lagos colony\s*$/i,{jp:'ラゴス植民地',de:'Kolonie Lagos',ru:'Колония Лагос',es:'Colonia de Lagos'}],
      [/^\s*north-?eastern rhodesia\s*$/i,{jp:'北東ローデシア',de:'Nordostrhodesien',ru:'Северо-Восточная Родезия',es:'Rodesia del Nordeste'}],
      [/^\s*north-?western rhodesia\s*$/i,{jp:'北西ローデシア',de:'Nordwestrhodesien',ru:'Северо-Западная Родезия',es:'Rodesia del Noroeste'}],
      [/^\s*gaza\s*$/i,{jp:'ガザ',de:'Gaza',ru:'Газа',es:'Gaza'}],
      [/^\s*west bank\s*$/i,{jp:'ヨルダン川西岸',de:'Westjordanland',ru:'Западный берег',es:'Cisjordania'}],
      [/^\s*ottoman empire\s*$/i,{jp:'オスマン帝国',de:'Osmanisches Reich',ru:'Османская империя',es:'Imperio Otomano'}],
      [/^\s*(first |second )?samori empire\s*$/i,{jp:'サモリ帝国',de:'Samori-Reich',ru:'Империя Самори',es:'Imperio de Samori'}],
      [/^\s*sultanate of utetera\s*$/i,{jp:'ウテテラ・スルタン国',de:'Sultanat Utetera',ru:'Султанат Утетера',es:'Sultanato de Utetera'}],
      [/^\s*ato trading confederacy\s*$/i,{jp:'アト交易連合',de:'Ato-Handelskonföderation',ru:'Торговая конфедерация Ато',es:'Confederación comercial Ato'}],
      [/^\s*mirambo.*$/i,{jp:'ミランボの領域',de:'Mirambo-Reich',ru:'Государство Мирамбо',es:'Reino de Mirambo'}],
      [/^\s*emirate of bin shal.*$/i,{jp:'ビン・シャアラーン首長国',de:'Emirat Bin Schaalan',ru:'Эмират Бин-Шаалан',es:'Emirato de Bin Shalan'}]
    ];
    /* (#R110) coloniser / possessor names for the "(France)/(UK)/(Portugal)…" suffix the aourednik data appends to
       many interwar colonies, plus the 1945 occupation zones (Germany (USA)…). */
    const _COLONIZER={france:{jp:'フランス',de:'Frankreich',ru:'Франция',es:'Francia'},uk:{jp:'イギリス',de:'Vereinigtes Königreich',ru:'Великобритания',es:'Reino Unido'},gb:{jp:'イギリス',de:'Vereinigtes Königreich',ru:'Великобритания',es:'Reino Unido'},usa:{jp:'アメリカ',de:'USA',ru:'США',es:'EE. UU.'},us:{jp:'アメリカ',de:'USA',ru:'США',es:'EE. UU.'},portugal:{jp:'ポルトガル',de:'Portugal',ru:'Португалия',es:'Portugal'},italy:{jp:'イタリア',de:'Italien',ru:'Италия',es:'Italia'},it:{jp:'イタリア',de:'Italien',ru:'Италия',es:'Italia'},belgium:{jp:'ベルギー',de:'Belgien',ru:'Бельгия',es:'Bélgica'},spain:{jp:'スペイン',de:'Spanien',ru:'Испания',es:'España'},netherlands:{jp:'オランダ',de:'Niederlande',ru:'Нидерланды',es:'Países Bajos'},germany:{jp:'ドイツ',de:'Deutschland',ru:'Германия',es:'Alemania'},japan:{jp:'日本',de:'Japan',ru:'Япония',es:'Japón'},ru:{jp:'ロシア',de:'Russland',ru:'Россия',es:'Rusia'},russia:{jp:'ロシア',de:'Russland',ru:'Россия',es:'Rusia'},ussr:{jp:'ソ連',de:'UdSSR',ru:'СССР',es:'URSS'},egypt:{jp:'エジプト',de:'Ägypten',ru:'Египет',es:'Egipto'},'south africa':{jp:'南アフリカ',de:'Südafrika',ru:'ЮАР',es:'Sudáfrica'},ethiopia:{jp:'エチオピア',de:'Äthiopien',ru:'Эфиопия',es:'Etiopía'},jordan:{jp:'ヨルダン',de:'Jordanien',ru:'Иордания',es:'Jordania'},indonesia:{jp:'インドネシア',de:'Indonesien',ru:'Индонезия',es:'Indonesia'},denmark:{jp:'デンマーク',de:'Dänemark',ru:'Дания',es:'Dinamarca'},'austria-hungary':{jp:'オーストリア＝ハンガリー',de:'Österreich-Ungarn',ru:'Австро-Венгрия',es:'Austria-Hungría'},australia:{jp:'オーストラリア',de:'Australien',ru:'Австралия',es:'Australia'},china:{jp:'中国',de:'China',ru:'Китай',es:'China'},joseon:{jp:'李氏朝鮮',de:'Joseon',ru:'Чосон',es:'Joseon'}};   /* (#R117) owners used by the CShapes era names */
    function _eraLocName(nm){ try{ const lg=(typeof HOST.lang!=='undefined')?HOST.lang:'en'; if(lg==='en') return null; const low0=String(nm||'').trim(); if(!low0) return null;
      const _loc1=(low)=>{
        /* (#R129) prefer the lifespan-CORRECT former state when several share a name (interwar "Kingdom of Yugoslavia"
           vs post-war "Yugoslavia (SFRY)" both match /yugoslav/i) — otherwise a 1925 label localized to the SFRY name. */
        const HS=window.IntMapHistStates; if(HS&&HS.STATES){ let pick=null, matched=false, y=null;
          try{ if(window.IntMapTime&&window.IntMapTime.year&&(!window.IntMapTime.isLive||!window.IntMapTime.isLive())) y=window.IntMapTime.year(); }catch(_){}
          for(const S of HS.STATES){ const re=HS.hbRe&&HS.hbRe(S.code); if(!(re&&re.test(low))) continue; matched=true;
            const n=S.name&&(S.name[lg]||S.name.en); if(!(n&&n!==low)) continue;
            if(y!=null&&S.from&&S.to){ const a=+new Date(S.from+'T00:00:00Z'),b=+new Date(S.to+'T23:59:59Z'),t=+new Date(y+'-07-01T00:00:00Z'); if(isFinite(t)&&t>=a&&t<=b) return n; }   /* era-correct wins outright */
            if(!pick) pick=n; }
          if(pick) return pick;   /* else first regex match (legacy behaviour) */ }
        for(const V of _VANISHED){ if(V.re.test(low)){ const n=V.nm&&(V.nm[lg]||V.nm.en); if(n&&n!==low) return n; } }
        for(const E of _ERA_LOC){ if(E[0].test(low)){ const n=E[1][lg]; if(n&&n!==low) return n; } }
        const cm=_COLONIZER[_normNm(low)]; if(cm&&cm[lg]) return cm[lg];   /* the major powers double as country-name localizations (Germany/Japan… occupation-zone bases) */
        try{ if(typeof countryStats!=='undefined'&&countryStats){ const key=_normNm(low); for(const c in countryStats){ const s=countryStats[c]; if(s&&s.nameEn&&_normNm(s.nameEn)===key){ const d=(s.name&&(s.name[lg]||s.name.en))||((lg==='jp'&&s.nameJp)?s.nameJp:s.nameEn); if(d&&d!==low) return d; } } } }catch(_){}   /* modern base (Algeria, Syria…) → its localized present-day name (JP via nameJp, matching tagSame; DE/RU/ES keep the English base as elsewhere on the era map) */
        return null; };
      const direct=_loc1(low0); if(direct) return direct;
      /* "(Coloniser)" / occupation suffix → localize the BASE + append the localized possessor (e.g. アルジェリア（フランス）) */
      const m=/^(.+?)\s*\(([^)]+)\)\s*$/.exec(low0);
      if(m){ const col=_COLONIZER[_normNm(m[2])]; if(col){ const lb=_loc1(m[1].trim())||m[1].trim(); const lc=col[lg]||m[2]; return lb+(lg==='jp'?'（'+lc+'）':' ('+lc+')'); } }
      return null; }catch(_){ return null; } }
    function tagSame(fc){ try{ if(!fc||!Array.isArray(fc.features)) return fc;
      const lg=(typeof HOST.lang!=='undefined')?HOST.lang:'en';
      /* normalized present-day name -> the country's CURRENT localized display name (so an unchanged country shows its
         EXISTING label, e.g. "フランス" for a JP user — "国名が変わってない国は既存の国名ラベルのまま"). */
      const cur=new Map();
      try{ if(typeof countryStats!=='undefined'&&countryStats){ Object.values(countryStats).forEach(s=>{ if(s&&s.sov!==false){
        const disp=(s.name&&(s.name[lg]||s.name.en))||((lg==='jp'&&s.nameJp)?s.nameJp:s.nameEn)||s.nameEn||'';
        if(s.nameEn) cur.set(_normNm(s.nameEn),disp); if(s.nameJp) cur.set(_normNm(s.nameJp),disp); } }); } }catch(_){}
      /* (#R109) HistId single-country renamings (Germany→Weimar/Nazi/Empire, China→Qing/ROC, Italy, Persia, Siam, Dutch
         East Indies): the aourednik polygon keeps the MODERN name ("Germany") but countryStats is renamed to the era
         name — map the modern polygon name → the current era display name so the LABEL shows the era name too, not the
         modern one. Only when HistId actually renamed the entry this era (s._histId). */
      try{ const MODNM={CHN:['China'],DEU:['Germany'],ITA:['Italy'],IRN:['Iran','Persia'],THA:['Thailand','Siam'],IDN:['Indonesia','Dutch East Indies'],JPN:['Japan'],RUS:['Russia'],GBR:['United Kingdom'],ESP:['Spain'],PRT:['Portugal'],BRA:['Brazil'],EGY:['Egypt'],FRA:['France'],HUN:['Hungary']};   /* (#R117/#R118) expanded identities */
        for(const code in MODNM){ const s=(typeof countryStats!=='undefined')&&countryStats[code]; if(!s||s._histHidden||!s._histId) continue;
          const disp=(s.name&&(s.name[lg]||s.name.en))||s.nameEn; if(!disp) continue; MODNM[code].forEach(mn=>cur.set(_normNm(mn),disp)); } }catch(_){}
      if(!cur.size) return fc;
      fc.features.forEach(f=>{ try{ f.properties=f.properties||{};
        if(f.properties._corrected){ return; }   /* (#R105) _correctEra already set _same/_modName (Tibet→China, label suppressed) — don't re-tag */
        const nm=(f.properties.NAME||f.properties.name)||'';
        const hit=cur.get(_normNm(nm));
        if(hit){ f.properties._same=1; f.properties._modName=hit; }   /* unchanged → its present-day localized name */
        else { f.properties._same=0; f.properties._modName=null;      /* renamed / vanished → era name (imtb-lbl) */
          const loc=_eraLocName(nm); if(loc) f.properties._locName=loc; else if('_locName' in f.properties) delete f.properties._locName; }   /* (#R107) localized era label when known */
      }catch(_){} });
      return fc;
      }catch(_){ return fc; } }
    function apply(fc){ const mySeq=seq; try{ fc=tagSame(fc); }catch(_){}
      /* (#R94m) set the data on the EXISTING source directly (not gated by isStyleLoaded) — that gate was why a
         SECOND year change didn't update: ensure() could transiently return false and block setData, so the
         borders stayed on the first year until you went back to Now. No re-assert timeouts → no flicker.
         (#R126) …but ONLY when the imtb LAYERS also still exist: a mid-swap exception can leave the source added
         with the layers missing, and this early return then bypassed ensure() forever — the "年代を変えても歴史的
         国境が表示されない" report (data was being set on a source no layer drew). Layers gone → fall through to
         ensure(), which idempotently recreates them. */
      try{ const s=map.getSource('imtb-src'); if(s&&GE().layers.has('imtb-line')){ s.setData(fc); window._applyBorders(); _afterApply(); return; } }catch(_){}
      if(ensure()){ try{ GE().layers.setSourceData('imtb-src',fc); }catch(_){} try{ window._applyBorders(); }catch(_){} _afterApply(); }
      /* (#R140) was map.once('idle',…) — a ONE-SHOT 'idle' that NEVER fires on a busy/backgrounded map (another source
         still tile-loading), so the era layers were never created and the borders stayed absent until a reload
         ("歴史的国境が表示されない・再読み込みで治る"). Reuse the app's own whenStyleReady() (polls + hard-resolves after
         ~6s — the exact fix R41 made for this class of hang), and guard on the travel seq so a stale deferred apply
         from an earlier year can't clobber a newer one ("タイムマシンで変更しても国境線が変化しない"). */
      else whenStyleReady().then(()=>{ if(active&&seq===mySeq) apply(fc); }); }
    function clear(){ const was=active; active=false; shownY=null; shownCorr=false;
      /* (#R101) empty the era polygons + hide the near-invisible imtb-fill click-target so a returned-to-Now map has
         NO stale full-country interactive fill left over the present map (which would swallow place-label clicks —
         the "現在でも地名ラベルをクリックできない" half of the report). */
      try{ const s=map.getSource('imtb-src'); if(s) s.setData({type:'FeatureCollection',features:[]}); }catch(_){}
      try{ ['imtb-fill','imtb-line','imtb-lbl','imtb-lbl2'].forEach(id=>{ if(GE().layers.has(id)) GE().layers.setLayout(id,'visibility','none'); }); }catch(_){}
      _restoreBase(); try{ window._applyBorders&&window._applyBorders(); }catch(_){} }
    async function go(year){ active=true; const my=++seq;
      /* (#R117) 1886–2019 → YEARLY CShapes borders (the year's July-1 state). Falls back to the aourednik
         snapshot path below if the CShapes bundle can't be loaded. */
      if(year>=CS_MIN&&year<=CS_MAX){ const d=await csLoad();
        if(my!==seq||!active) return;
        if(d){ const key='cs'+year;
          if(shownY===key){ try{ if(ensure()) window._applyBorders(); else whenStyleReady().then(()=>{ if(active&&shownY===key&&ensure()) window._applyBorders(); }); }catch(_){} return; }   /* (#R140) don't silently give up when the style is mid-load — retry once ready */
          let fc=cache.get(key); if(!fc){ try{ fc=csFC(d,year); cache.set(key,fc); }catch(_){ fc=null; } }
          if(fc){ shownY=key; shownCorr=false; apply(fc); return; } } }
      const ny=nearest(year);
      /* (#R106) the Tibet merge is DISPLAY-year based — re-apply when it flips (e.g. 1950→1951) even on the same snapshot. */
      const corr=(year>=1951);
      if(shownY===ny&&shownCorr===corr){ try{ if(ensure()) window._applyBorders(); else whenStyleReady().then(()=>{ if(active&&shownY===ny&&shownCorr===corr&&ensure()) window._applyBorders(); }); }catch(_){} return; }   /* (#R140) retry once the style is ready instead of latching absent borders */
      const fc=await fetchFC(ny); if(my!==seq||!active) return;
      if(fc){ shownY=ny; shownCorr=corr; apply(_eraCorrect(fc,year)); }
      /* (#R126) fetch failed (network hiccup on the first, uncached travel) → the map stayed border-less with no
         retry until the user moved the year again. Retry this same request once conditions allow. */
      else setTimeout(()=>{ try{ if(active&&my===seq) go(year); }catch(_){} },4000); }
    window.IntMapTime.on(e=>{ clearTimeout(go._t);   /* cancel any pending apply first, so Now after a fast travel really clears */
      /* (#R94i) recent years (after the last aourednik snapshot, 2010) → keep the MODERN borders: they are the
         accurate present-day borders (incl. South Sudan 2011, etc.), which the stale 2010 snapshot lacks. */
      if(e.isLive || e.year>=new Date().getFullYear() || e.year>CS_MAX){ clear(); return; }   /* (#R117) CShapes carries accurate borders through 2019 (incl. South Sudan 2011) — only 2020+ keeps the modern base */
      go._t=setTimeout(()=>{ try{ go(e.year); }catch(_){} },45); });   /* (#R122) 120→45ms: a single year change applies almost immediately, while a fast slider drag still coalesces */
    /* (#R107) re-localize the era LABELS (renamed states via _locName, unchanged countries via _modName) when the
       language changes WHILE travelling — tagSame bakes those at the current language, so re-apply the shown snapshot
       (no re-fetch; _eraCorrect reuses the already-computed merge state via shownCorr). */
    window.addEventListener('intmap-lang',()=>{ try{ if(!active||shownY==null) return; const fc=cache.get(shownY); if(fc) apply(_eraCorrect(fc, shownCorr?1951:1900)); }catch(_){} });
    /* (#R94k) warm the cache in the background so the era borders swap INSTANTLY when a year is entered
       (the aourednik files are a few 100 KB each; once cached in IndexedDB via IntMapCache they load at once). */
    (function warm(){ const pf=()=>{ csLoad().then(d=>{ if(d) return;   /* (#R117) warm the CShapes bundle; only if it FAILED warm the aourednik fallback snapshots */
        let i=0; const nx=()=>{ if(i>=YEARS.length) return; const y=YEARS[i++]; fetchFC(y).catch(()=>{}).then(()=>setTimeout(nx,500)); }; nx(); }); };
      /* (#R122) load the CShapes bundle EAGERLY (was idle-gated up to 6 s) so the FIRST time-travel doesn't block on
         parsing it — the reported "年代を変えてから国境が出るまで遅い". A short delay keeps it off the critical boot path. */
      setTimeout(pf,900); })();
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
          empire=true; const nmS=(S.name&&(S.name[lg]||S.name.en))||S.name; if(nmS) out.name=nmS; if(S.wiki) out.wiki=S.wiki;
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
        if(!code){ const vlow=String(nm||'').trim(); for(const V of _VANISHED){ if(V.re.test(vlow)){ out.name=(V.nm[lg]||V.nm.en); out.wiki=V.wiki; if(V.flag) out.flag=V.flag; out.code=null; return out; } } }   /* (#R128) pass the vanished-state flag to the click popup */
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
            if(HS&&HS.STATES){ for(const S of HS.STATES){ if(!S.succ||S.succ.indexOf(bestHid)<0) continue;
              let act=true; try{ if(when2){ const t=+when2,a2=+new Date(S.from+'T00:00:00Z'),b2=+new Date(S.to+'T23:59:59Z'); if(isFinite(t)) act=(t>=a2&&t<=b2); } }catch(_){}
              if(!act||!countryStats[S.code]||countryStats[S.code]._histHidden) continue;
              code=S.code; break; } } }catch(_){} } } }catch(_){} }
        if(code){ const s=countryStats[code]; if(s){ out.code=code; const nm2=(s.name&&(s.name[lg]||s.name.en))||s.nameEn; if(nm2) out.name=nm2; if(s.wiki) out.wiki=s.wiki; } }
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
    /* (#R116) curated era→article table (1900+ window of the time machine; en.wikipedia titles). Ranges are the
       state-form's lifespan; anything outside every range keeps the modern article. Kept to well-established,
       uncontroversial titles. */
    const _ERA_WIKI={
      FRA:[[1900,1940,'French_Third_Republic'],[1940,1944,'Vichy_France'],[1944,1946,'Provisional_Government_of_the_French_Republic'],[1946,1958,'French_Fourth_Republic']],
      DEU:[[1900,1918,'German_Empire'],[1919,1933,'Weimar_Republic'],[1933,1945,'Nazi_Germany'],[1945,1949,'Allied-occupied_Germany'],[1949,1990,'West_Germany']],
      CHN:[[1900,1911,'Qing_dynasty'],[1912,1949,'Republic_of_China_(1912%E2%80%931949)']],
      JPN:[[1900,1947,'Empire_of_Japan']],
      RUS:[[1900,1917,'Russian_Empire'],[1917,1922,'Russian_Soviet_Federative_Socialist_Republic'],[1922,1991,'Soviet_Union']],
      ITA:[[1900,1946,'Kingdom_of_Italy']],
      GBR:[[1900,1922,'United_Kingdom_of_Great_Britain_and_Ireland']],
      TUR:[[1900,1922,'Ottoman_Empire']],
      ESP:[[1900,1931,'Restoration_(Spain)'],[1931,1939,'Second_Spanish_Republic'],[1939,1975,'Francoist_Spain']],
      PRT:[[1900,1910,'Kingdom_of_Portugal'],[1910,1926,'First_Portuguese_Republic'],[1933,1974,'Estado_Novo_(Portugal)']],
      AUT:[[1900,1918,'Austria-Hungary'],[1919,1938,'First_Austrian_Republic'],[1945,1955,'Allied-occupied_Austria']],
      HUN:[[1920,1946,'Kingdom_of_Hungary_(1920%E2%80%931946)'],[1949,1989,'Hungarian_People%27s_Republic']],
      POL:[[1918,1939,'Second_Polish_Republic'],[1947,1989,'Polish_People%27s_Republic']],
      GRC:[[1900,1924,'Kingdom_of_Greece'],[1935,1973,'Kingdom_of_Greece']],
      ROU:[[1900,1947,'Kingdom_of_Romania'],[1947,1989,'Socialist_Republic_of_Romania']],
      BGR:[[1908,1946,'Kingdom_of_Bulgaria'],[1946,1990,'People%27s_Republic_of_Bulgaria']],
      SRB:[[1900,1918,'Kingdom_of_Serbia']],
      IRN:[[1900,1925,'Qajar_Iran'],[1925,1979,'Pahlavi_Iran']],
      THA:[[1900,1932,'Rattanakosin_Kingdom_(1782%E2%80%931932)']],
      EGY:[[1900,1914,'Khedivate_of_Egypt'],[1914,1922,'Sultanate_of_Egypt'],[1922,1953,'Kingdom_of_Egypt'],[1958,1971,'United_Arab_Republic']],
      ETH:[[1900,1974,'Ethiopian_Empire'],[1974,1987,'Derg']],
      IND:[[1900,1947,'British_Raj'],[1947,1950,'Dominion_of_India']],
      KOR:[[1900,1910,'Korean_Empire'],[1910,1945,'Korea_under_Japanese_rule']],
      PRK:[[1910,1945,'Korea_under_Japanese_rule']],
      VNM:[[1900,1945,'French_Indochina'],[1954,1976,'North_Vietnam']],
      BRA:[[1900,1930,'First_Brazilian_Republic'],[1937,1946,'Estado_Novo_(Brazil)']],
      MEX:[[1900,1911,'Porfiriato']],
      CZE:[[1918,1992,'Czechoslovakia']],
      SVK:[[1939,1945,'Slovak_Republic_(1939%E2%80%931945)']],
      IRL:[[1922,1937,'Irish_Free_State']],
      ISR:[[1920,1948,'Mandatory_Palestine']],
      SAU:[[1900,1932,'Emirate_of_Nejd_and_Hasa']],
      IRQ:[[1921,1932,'Mandatory_Iraq'],[1932,1958,'Kingdom_of_Iraq']],
      SYR:[[1923,1946,'Mandate_for_Syria_and_the_Lebanon']],
      LBY:[[1911,1943,'Italian_Libya'],[1951,1969,'Kingdom_of_Libya']],
      IDN:[[1900,1949,'Dutch_East_Indies']],
      PHL:[[1902,1935,'Insular_Government_of_the_Philippine_Islands'],[1935,1946,'Commonwealth_of_the_Philippines']],
      COD:[[1908,1960,'Belgian_Congo'],[1971,1997,'Zaire']],
      ZAF:[[1910,1961,'Union_of_South_Africa']],
      ZWE:[[1923,1965,'Southern_Rhodesia'],[1965,1979,'Rhodesia']],
      LKA:[[1900,1948,'British_Ceylon'],[1948,1972,'Dominion_of_Ceylon']],
      MMR:[[1900,1948,'British_rule_in_Burma']],
      TWN:[[1900,1945,'Taiwan_under_Japanese_rule']],
      /* (#R127) colonial-era + former-state articles for entities that previously linked to the MODERN article (or
         showed no Wikipedia button at all) — "Wikipedia…まだ詰められる箇所が大量にある". A colony resolves to its
         modern successor code via the point-in-polygon fallback, so the era-Wikipedia override picks these by year.
         Titles are established en.wikipedia articles; the popup existence-probes each, so a miss just hides the button. */
      DZA:[[1900,1962,'French_Algeria']],
      MAR:[[1912,1956,'French_protectorate_in_Morocco']],
      TUN:[[1881,1956,'French_protectorate_of_Tunisia']],
      SEN:[[1900,1960,'French_West_Africa']],
      MLI:[[1900,1960,'French_Sudan']],
      CIV:[[1900,1960,'French_West_Africa']],
      NER:[[1900,1960,'French_West_Africa']],
      GIN:[[1900,1958,'French_West_Africa']],
      BFA:[[1919,1960,'French_Upper_Volta']],
      BEN:[[1900,1960,'French_Dahomey']],
      TCD:[[1910,1960,'French_Equatorial_Africa']],
      GAB:[[1910,1960,'French_Equatorial_Africa']],
      COG:[[1910,1960,'French_Equatorial_Africa']],
      CAF:[[1910,1958,'Ubangi-Shari']],
      MDG:[[1897,1958,'French_Madagascar']],
      CMR:[[1884,1916,'Kamerun'],[1916,1960,'French_Cameroon']],
      KEN:[[1895,1920,'East_Africa_Protectorate'],[1920,1963,'Colony_of_Kenya']],
      NGA:[[1914,1960,'Colonial_Nigeria']],
      GHA:[[1900,1957,'Gold_Coast_(British_colony)']],
      SDN:[[1899,1956,'Anglo-Egyptian_Sudan']],
      TZA:[[1900,1919,'German_East_Africa'],[1919,1961,'Tanganyika_(territory)']],
      AGO:[[1900,1975,'Portuguese_Angola']],
      MOZ:[[1900,1975,'Portuguese_Mozambique']],
      NAM:[[1900,1915,'German_South_West_Africa'],[1915,1990,'South_West_Africa']],
      UKR:[[1919,1991,'Ukrainian_Soviet_Socialist_Republic']],
      BLR:[[1919,1991,'Byelorussian_Soviet_Socialist_Republic']],
      KAZ:[[1936,1991,'Kazakh_Soviet_Socialist_Republic']],
      UZB:[[1924,1991,'Uzbek_Soviet_Socialist_Republic']],
      GEO:[[1921,1991,'Georgian_Soviet_Socialist_Republic']],
      FIN:[[1900,1917,'Grand_Duchy_of_Finland']],
      LBN:[[1920,1943,'Greater_Lebanon']],
      JOR:[[1921,1946,'Emirate_of_Transjordan']],
      PAK:[[1947,1956,'Dominion_of_Pakistan']],
      BGD:[[1947,1971,'East_Pakistan']],
      MYS:[[1900,1946,'British_Malaya']],
      LAO:[[1900,1953,'French_Indochina'],[1953,1975,'Kingdom_of_Laos']],
      KHM:[[1863,1953,'French_protectorate_of_Cambodia'],[1970,1975,'Khmer_Republic'],[1975,1979,'Democratic_Kampuchea'],[1979,1989,'People%27s_Republic_of_Kampuchea']],
      OMN:[[1900,1970,'Muscat_and_Oman']],
      ARE:[[1900,1971,'Trucial_States']],
      MNG:[[1911,1924,'Bogd_Khanate_of_Mongolia'],[1924,1992,'Mongolian_People%27s_Republic']],
      CUB:[[1902,1959,'Republic_of_Cuba_(1902%E2%80%931959)']],
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
      AFG:[[1900,1926,'Emirate_of_Afghanistan'],[1926,1973,'Kingdom_of_Afghanistan']],
      YEM:[[1918,1962,'Mutawakkilite_Kingdom_of_Yemen']],
      ERI:[[1900,1947,'Italian_Eritrea']],
      PSE:[[1920,1948,'Mandatory_Palestine']],
      /* (#R129) more monarchy/former-state articles that previously fell back to the modern country page (all
         existence-verified against en.wikipedia). */
      ALB:[[1925,1928,'Albanian_Republic_(1925%E2%80%931928)'],[1928,1939,'Albanian_Kingdom_(1928%E2%80%931939)'],[1946,1991,'People%27s_Socialist_Republic_of_Albania']],
      ISL:[[1918,1944,'Kingdom_of_Iceland']],
      MNE:[[1900,1918,'Kingdom_of_Montenegro']],
      NPL:[[1900,2008,'Kingdom_of_Nepal']],
      NOR:[[1900,1905,'Union_between_Sweden_and_Norway']],
      /* (#R132) further era→article coverage for entities that still linked to their MODERN page: the WWII Independent
         State of Croatia, and colonial-era names for countries whose 1900-independence span had a distinct predecessor
         state. All established en.wikipedia titles; the popup existence-probes each, so any miss simply hides the button. */
      HRV:[[1941,1945,'Independent_State_of_Croatia']],
      SGP:[[1900,1946,'Straits_Settlements'],[1946,1963,'Colony_of_Singapore']],
      BLZ:[[1900,1981,'British_Honduras']],
      GUY:[[1900,1966,'British_Guiana']],
      SUR:[[1900,1975,'Surinam_(Dutch_colony)']],
      ZMB:[[1911,1964,'Northern_Rhodesia']],
      MWI:[[1907,1964,'Nyasaland']],
      BWA:[[1885,1966,'Bechuanaland_Protectorate']],
      LSO:[[1884,1966,'Basutoland']],
      SWZ:[[1903,1968,'Swaziland_(protectorate)']],
      UGA:[[1894,1962,'Uganda_Protectorate']],
      /* (#R136) further colonial-era → article coverage for colonies/protectorates that still linked to their MODERN
         country page ("Wikipedia…まだ詰められる箇所が大量にある"). All titles existence-verified against en.wikipedia
         (redirects resolved); ranges end at each territory's independence so the modern article returns afterwards. */
      GMB:[[1900,1965,'Gambia_Colony_and_Protectorate']],
      SLE:[[1900,1961,'Sierra_Leone_Colony_and_Protectorate']],
      MUS:[[1900,1968,'British_Mauritius']],
      MDV:[[1900,1965,'Sultanate_of_the_Maldive_Islands']],
      FJI:[[1900,1970,'Colony_of_Fiji']],
      CPV:[[1900,1975,'Portuguese_Cape_Verde']],
      GNB:[[1900,1974,'Portuguese_Guinea']],
      GNQ:[[1900,1968,'Spanish_Guinea']],
      TLS:[[1900,1975,'Portuguese_Timor']],
      SLB:[[1900,1978,'British_Solomon_Islands']],
      PNG:[[1949,1975,'Territory_of_Papua_and_New_Guinea']],
      KWT:[[1900,1961,'Emirate_of_Kuwait']]
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
    return { _go:go, _clear:clear, current:()=>shownY, active:()=>active, refresh:()=>{ try{ window._applyBorders(); }catch(_){} }, currentFC:()=>cache.get(shownY)||null, geomFor, geomForCode, resolveHist, featureAt, _nearest:nearest };
  })();
};
