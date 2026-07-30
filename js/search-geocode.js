/* ============================================================================
 *  IntMap · Search box: query pre-processing, geocoding and the result card  (#R169)
 * ----------------------------------------------------------------------------
 *  Moved VERBATIM out of the index.html DOMContentLoaded closure (Architecture.md §3.1).
 *  Every statement here is a DECLARATION — the factory runs no app code, so it can be
 *  instantiated with the other #R168/#R169 factories right after `map` exists.
 *  The only edit to the moved text is that free references to closure variables became
 *  HOST.<member> reads/writes.
 * ==========================================================================*/
window.IntMapModules=window.IntMapModules||{};
window.IntMapModules.searchGeocode=function(HOST){
  const GE=()=>window.IntMapGeoEngine;   /* (#R178) the renderer, through the contract — never the raw handle */
  /* ===== Map-side global place search (Nominatim) + abstract / natural-language pre-processing =====
   * Handles patterns like:
   *   - "capital of <country>"
   *   - "highest mountain in <country>"
   *   - "largest city in <country>"
   *   - "<place> nearest to <city>"
   *   - country names by stat ("country with highest GDP")
   * For anything we can't pattern-match, we just hand the raw query to Nominatim, which
   * itself is reasonably forgiving for natural-language queries.
   */
  function preprocessNLQuery(q){
    const ql=q.toLowerCase().trim();
    /* "capital of <country>" → look up CAPITAL[code] */
    const mCap=ql.match(/^capital\s+of\s+(.+)$/) || ql.match(/^(.+?)の首都$/);
    if(mCap){
      const name=mCap[1].trim();
      const hit=Object.values(HOST.countryStats||{}).find(s=>{
        const en=(s.nameEn||'').toLowerCase(), jp=s.nameJp||'';
        return en===name || en.includes(name) || jp.includes(name);
      });
      if(hit && hit.capital) return hit.capital+', '+hit.nameEn;
    }
    /* "country with the highest <stat>" */
    const STAT_KEYS={'gdp':'gdp','economy':'gdp','population':'pop','area':'area','hdi':'hdi','democracy':'dem','military':'milSpend','life expectancy':'lifeExp','internet':'internet'};
    const mHigh=ql.match(/^(?:country|nation)\s+(?:with\s+)?(?:the\s+)?(?:highest|largest|biggest|most)\s+(.+)$/);
    if(mHigh){
      const key=Object.keys(STAT_KEYS).find(k=>mHigh[1].includes(k));
      if(key){ const sk=STAT_KEYS[key]; const top=Object.values(HOST.countryStats).filter(s=>s[sk]!=null).sort((a,b)=>b[sk]-a[sk])[0]; if(top) return top.nameEn; }
    }
    /* Japanese: "X 最大" / "X 最高" → similar fallback */
    const mJpHigh=ql.match(/^(.+?)(が|の)?(最大|最多|最高)(?:の国)?$/);
    if(mJpHigh){
      const w=mJpHigh[1].trim();
      const SUPERLATIVE={'人口':'pop','GDP':'gdp','面積':'area','軍事費':'milSpend','HDI':'hdi'};   /* (#R171) renamed off `map`: a local called `map` SHADOWS the renderer the factory is handed — the #R163 trap, now inert here only because this file no longer uses the renderer at all */
      const sk=SUPERLATIVE[w]; if(sk){ const top=Object.values(HOST.countryStats).filter(s=>s[sk]!=null).sort((a,b)=>b[sk]-a[sk])[0]; if(top) return top.nameEn; }
    }
    return q;
  }
  /* (#R15) Tiny Levenshtein for tolerant (fuzzy) matching of short queries. */
  function _lev(a,b){ a=a||'';b=b||''; const m=a.length,n=b.length; if(!m)return n; if(!n)return m;
    let prev=Array.from({length:n+1},(_,j)=>j), cur=new Array(n+1);
    for(let i=1;i<=m;i++){ cur[0]=i; for(let j=1;j<=n;j++){ const c=a[i-1]===b[j-1]?0:1; cur[j]=Math.min(prev[j]+1,cur[j-1]+1,prev[j-1]+c); } [prev,cur]=[cur,prev]; }
    return prev[n]; }
  /* (#R15 / #34) Local fuzzy place lookup — resolves vague / partial / slightly-misspelled queries
     against bundled country names, capitals and the built-in gazetteer, so search still works when the
     external geocoder is slow / rate-limited / too strict for a loose query. Returns scored {name,lng,lat}. */
  function localFuzzyPlaces(q){
    const ql=(q||'').toLowerCase().trim(); if(!ql) return [];
    const out=[];
    const push=(name,lng,lat,score,kind)=>{ lng=+lng;lat=+lat; if(isNaN(lng)||isNaN(lat))return; out.push({name,lng,lat,score,kind:kind||''}); };   /* (#R46) kind = scale hint (country/capital/city/…) for Atlas zoom */
    try{ Object.values(HOST.countryStats||{}).forEach(s=>{
      if(!s.latlng) return; const en=(s.nameEn||'').toLowerCase(), jp=(s.nameJp||''), cap=(s.capital||'').toLowerCase();
      let sc=0, suffix='';
      if(en===ql||(jp&&jp===q)) sc=100;
      else if(en.startsWith(ql)) sc=86;
      else if(cap===ql){ sc=82; suffix=' · '+s.capital; }
      else if(en.includes(ql)||(jp&&jp.includes(q))) sc=72;
      else if(en.split(/\s+/).some(w=>w.startsWith(ql))&&ql.length>=3) sc=66;   /* (#R19) word-prefix: "zeal"→New Zealand */
      else if(cap.includes(ql)&&ql.length>=3){ sc=58; suffix=' · '+s.capital; }
      else if(ql.length>=4 && _lev(en,ql)<=2) sc=62;
      else if(ql.length>=5 && cap && _lev(cap,ql)<=2){ sc=56; suffix=' · '+s.capital; }   /* (#R19) misspelled capital */
      if(sc>0) push(s.nameEn+suffix, s.latlng[1], s.latlng[0], sc, suffix?'capital':'country');
    }); }catch(_){}
    try{ const gz=(typeof HOST.BUILTIN_GAZETTEER!=='undefined')?HOST.BUILTIN_GAZETTEER:null;
      if(gz) for(const type in gz){ gz[type].forEach(e=>{ const terms=Array.isArray(e.terms)?e.terms.join(' '):String(e.terms||''); const tl=terms.toLowerCase(); const nm=(e.name&&(e.name[HOST.lang]||e.name.en))||terms;
        const words=tl.split(/[|,\s]+/);
        let sc=0; if(words.includes(ql)) sc=88; else if(words.some(w=>w.startsWith(ql))&&ql.length>=3) sc=68;   /* (#R19) prefix */
        else if(tl.includes(ql)&&ql.length>=3) sc=64;
        else if(ql.length>=4 && words.some(w=>w.length>=4&&_lev(w,ql)<=2)) sc=58;   /* (#R19) per-word typo tolerance */
        if(sc>0 && e.loc) push(nm, e.loc[0], e.loc[1], sc, type); }); }
    }catch(_){}
    const seen=new Set();
    return out.sort((a,b)=>b.score-a.score).filter(x=>{ const k=x.name+'|'+x.lng.toFixed(1)+'|'+x.lat.toFixed(1); if(seen.has(k))return false; seen.add(k); return true; }).slice(0,7);
  }

  /* ===== (#R183) HOW CLOSE TO GO ============================================================
     「地名検索時のズームは、対象に応じてズームレベルを最適なものにするように。」
     gotoPlace flew to zoom 9 for everything. z9 is roughly a 100 km window: it is far too far out
     for a building, a station or a park (which are then a pixel), and far too close for a country,
     an ocean or a desert (which are then off every edge). Zoom 9 is the right answer for almost
     nothing that anyone searches for.

     Two mechanisms, in order of preference, because one of them is a measurement and the other is
     a guess:

       1. THE REAL EXTENT, when the geocoder published one. Nominatim returns `boundingbox`
          [south, north, west, east] on every result and Photon returns `extent`
          [minLon, maxLat, maxLon, minLat] on most. Framing that box is not an estimate — it is the
          object's own footprint, so Vatican City and Russia both end up filling the screen.
       2. THE FEATURE CLASS, when it did not. Nominatim's class/type, Photon's osm_key/osm_value,
          Open-Meteo's GeoNames feature_code and our own gazetteer `kind` all name what the thing
          IS, and a continent is never a doorway. The table below is that mapping.

     TWO TRAPS, both real:
       · An antimeridian-crossing extent (Russia, Fiji, the USA with Alaska, New Zealand) comes back
         as a box spanning nearly the whole globe, and framing it zooms to the entire world. Any box
         wider than 180° of longitude — or taller than 170° — is therefore rejected and the class
         table answers instead. js/widgets.js has guarded its country flight the same way since #R34.
       · A bounding box is not always the useful frame. Nominatim gives a river or a motorway a box
         hundreds of km across whose centre is nowhere near the point that was clicked, so a LINEAR
         feature is framed by its class, not its extent. */
  const PLACE_ZOOM={
    /* continents / oceans / very large physical regions */
    continent:2.4, ocean:2.6, sea:4.2, archipelago:4.6, desert:4.6, plain:5.2,
    /* political */
    country:4.4, dependency:5.6, state:5.8, region:5.8, province:6.2, county:7.6, district:8.6,
    municipality:10.2, borough:11,
    /* settlements — the sizes people actually search for */
    megacity:9.6, city:10.6, town:12.2, village:13.4, hamlet:14.2, suburb:12.6, neighbourhood:13.8,
    /* physical features */
    island:8.4, lake:9.4, river:9, mountain:11, volcano:11, glacier:9, forest:9.4, bay:8.4, cape:11,
    /* things you can stand in front of */
    airport:12.4, port:12.4, station:14.6, park:13, university:14, stadium:15, museum:15.6,
    landmark:15.2, building:16.6, address:17, poi:15.6
  };
  const DEFAULT_ZOOM=12.2;
  /* Linear/very-elongated features whose bounding box is a bad frame (see the trap note above). */
  const LINEAR=new Set(['river','stream','canal','coastline','motorway','trunk','primary','secondary',
    'railway','rail','waterway','highway','valley','ridge','border','boundary']);

  /* Nominatim / Photon / Open-Meteo / gazetteer → one of the keys above. Anything unrecognised
     returns null and the caller falls back to DEFAULT_ZOOM, which is deliberately a town-sized
     window rather than the old country-sized one. */
  function placeClass(raw,localKind){
    const s=v=>String(v||'').toLowerCase();
    const k=s(raw&&(raw.osm_key||raw.class||raw.category)), v=s(raw&&(raw.osm_value||raw.type));
    const fc=s(raw&&raw.feature_code);
    /* Nominatim's `addresstype` — but ONLY for administrative areas and settlements, which is where
       it is the deciding field and nothing else is. MEASURED: Russia, Vatican City and Tokyo are ALL
       category=boundary / type=administrative — indistinguishable — while addresstype says country /
       country / province. Reading category alone put every administrative area on one zoom.
       For PHYSICAL features addresstype is the wrong field to trust: the Sahara comes back
       addresstype=region, which is an administrative word for a 4,800 km desert and framed it like a
       county. There category/type is exact (natural/desert), so that is read first below. */
    const at=(k==='boundary'||k==='place')?s(raw&&raw.addresstype):'';
    if(at&&at!=='yes'){
      if(at==='country') return 'country';
      if(at==='continent') return 'continent';
      if(at==='ocean') return 'ocean';
      if(at==='sea') return 'sea';
      if(at==='state') return 'state';
      if(at==='province'||at==='region') return (at==='province')?'province':'region';
      if(at==='county') return 'county';
      if(at==='city') return 'city';
      if(at==='town') return 'town';
      if(at==='village') return 'village';
      if(at==='hamlet') return 'hamlet';
      if(at==='suburb'||at==='quarter') return 'suburb';
      if(at==='neighbourhood'||at==='city_block') return 'neighbourhood';
      if(at==='municipality') return 'municipality';
      if(at==='borough') return 'borough';
      if(at==='island'||at==='islet') return 'island';
      if(at==='lake') return 'lake';
      if(at==='river'||at==='stream') return 'river';
      if(at==='peak'||at==='mountain') return 'mountain';
      if(at==='volcano') return 'volcano';
      if(at==='glacier') return 'glacier';
      if(at==='desert') return 'desert';
      if(at==='forest'||at==='wood') return 'forest';
      if(at==='bay') return 'bay';
      if(at==='aeroway'||at==='aerodrome') return 'airport';
      if(at==='railway') return 'station';
      if(at==='park') return 'park';
      if(at==='building'||at==='house') return 'building';
      if(at==='road'||at==='residential') return 'address';
      if(at==='postcode') return 'district';
      /* addresstype often just echoes the OSM key (man_made, leisure, amenity, tourism…) — fall
         through to the category/type reading below rather than inventing a meaning for it. */
    }
    /* GeoNames feature codes (Open-Meteo geocoding) — the exact codes, not a prefix guess. */
    if(fc){
      if(fc==='pcli'||fc==='pcls'||fc==='pcld'||fc==='ters') return 'country';
      if(fc==='cont') return 'continent';
      if(fc==='ocn') return 'ocean';
      if(fc==='adm1') return 'state';
      if(fc==='adm2') return 'county';
      if(fc==='adm3'||fc==='adm4'||fc==='adm5') return 'district';
      if(fc==='pplc') return 'city';
      if(fc==='ppla') return 'city';
      if(fc==='ppla2'||fc==='ppla3'||fc==='ppla4') return 'town';
      if(fc==='ppl'||fc==='ppls') return 'town';
      if(fc==='pplx') return 'suburb';
      if(fc==='isl') return 'island';
      if(fc==='mt'||fc==='pk') return 'mountain';
      if(fc==='lk') return 'lake';
      if(fc==='stm') return 'river';
      if(fc==='airp') return 'airport';
      if(fc==='rstn') return 'station';
    }
    /* OSM class/type, which is what Nominatim and Photon speak. */
    if(k==='place'){
      if(v==='continent') return 'continent';
      if(v==='country') return 'country';
      if(v==='state'||v==='province') return 'state';
      if(v==='region') return 'region';
      if(v==='county') return 'county';
      if(v==='city') return 'city';
      if(v==='town') return 'town';
      if(v==='village') return 'village';
      if(v==='hamlet'||v==='isolated_dwelling') return 'hamlet';
      if(v==='suburb'||v==='quarter'||v==='city_block') return 'suburb';
      if(v==='neighbourhood') return 'neighbourhood';
      if(v==='island'||v==='islet') return 'island';
      if(v==='archipelago') return 'archipelago';
      if(v==='sea') return 'sea';
      if(v==='ocean') return 'ocean';
      if(v==='house'||v==='houses') return 'address';
      return 'town';
    }
    if(k==='boundary') return (v==='administrative')?'region':'region';
    if(k==='natural'){
      if(v==='peak'||v==='saddle') return 'mountain';
      if(v==='volcano') return 'volcano';
      if(v==='water'||v==='bay') return (v==='bay')?'bay':'lake';
      if(v==='glacier') return 'glacier';
      if(v==='wood'||v==='forest'||v==='scrub') return 'forest';
      if(v==='desert'||v==='sand') return 'desert';
      if(v==='cape') return 'cape';
      if(v==='coastline') return 'river';
    }
    /* MEASURED: Lake Baikal comes back as category `water`, which is its own top-level key and was
       not in this table at all — the lake fell through to the default town-sized zoom. */
    if(k==='water'){
      if(v==='lake'||v==='reservoir'||v==='pond'||v==='lagoon') return 'lake';
      if(v==='river'||v==='stream'||v==='canal') return 'river';
      if(v==='bay'||v==='strait') return 'bay';
      if(v==='ocean') return 'ocean';
      if(v==='sea') return 'sea';
      return 'lake';
    }
    /* …and the Eiffel Tower is category `man_made`, likewise absent. */
    if(k==='man_made'){
      if(v==='tower'||v==='lighthouse'||v==='obelisk'||v==='monument'||v==='bridge') return 'landmark';
      if(v==='pier'||v==='breakwater') return 'port';
      return 'landmark';
    }
    if(k==='waterway') return 'river';
    if(k==='aeroway') return 'airport';
    if(k==='railway') return 'station';
    if(k==='amenity'){
      if(v==='university'||v==='college') return 'university';
      if(v==='museum') return 'museum';
      return 'poi';
    }
    if(k==='leisure') return (v==='stadium'||v==='sports_centre')?'stadium':'park';
    if(k==='tourism') return (v==='museum')?'museum':'landmark';
    if(k==='historic') return 'landmark';
    if(k==='building') return 'building';
    if(k==='highway') return 'address';
    if(k==='landuse') return 'district';
    if(k==='shop'||k==='office'||k==='craft') return 'poi';
    /* our own local matches (localFuzzyPlaces `kind`) and the gazetteer's own type names */
    const lk=s(localKind);
    if(lk){
      if(lk==='country') return 'country';
      if(lk==='capital') return 'city';
      if(PLACE_ZOOM[lk]!=null) return lk;
      if(lk==='cities'||lk==='city') return 'city';
      if(lk==='mountains'||lk==='peaks') return 'mountain';
      if(lk==='rivers') return 'river';
      if(lk==='lakes') return 'lake';
      if(lk==='deserts') return 'desert';
      if(lk==='islands') return 'island';
      if(lk==='seas'||lk==='oceans') return 'ocean';
      if(lk==='airports') return 'airport';
      if(lk==='landmarks') return 'landmark';
      if(lk==='regions') return 'region';
    }
    return null;
  }
  /* The extent the provider published, as [[w,s],[e,n]] — or null when there is none, when it is
     unusable (antimeridian / degenerate), or when the feature is linear. */
  const STUB_DEG=0.0005;   /* see NODE STUB below — the synthetic box is 0.0001°, this is 5× that */
  function placeExtent(raw,cls){
    if(!raw) return null;
    if(cls&&LINEAR.has(cls)) return null;
    let w,s,e,n;
    const bb=raw.boundingbox;                                   /* Nominatim: [S, N, W, E] as strings */
    if(Array.isArray(bb)&&bb.length===4){ s=+bb[0]; n=+bb[1]; w=+bb[2]; e=+bb[3]; }
    else if(Array.isArray(raw.extent)&&raw.extent.length===4){  /* Photon: [minLon, maxLat, maxLon, minLat] */
      w=+raw.extent[0]; n=+raw.extent[1]; e=+raw.extent[2]; s=+raw.extent[3];
    } else return null;
    if(![w,s,e,n].every(v=>isFinite(v))) return null;
    if(n<=s||e<=w) return null;                                  /* degenerate, or wrapped the wrong way */
    if((e-w)>180||(n-s)>170) return {huge:true};                 /* antimeridian / whole-globe box — see below */
    /* NODE STUB. A feature mapped in OSM as a single NODE has no footprint, and Nominatim answers
       with a synthetic ±0.0001° box around the point — about 11 m. MEASURED: Mount Fuji, the Sahara,
       the Pacific Ocean and a Shibuya subway entrance are all nodes and all came back 0.0001×0.0001.
       Framing that box put the SAHARA at zoom 16.5, looking at eleven metres of sand. A box this
       small is not a measurement, so the class decides instead. (Africa is also a node but carries a
       deliberate 50°×50° box, which survives this test — the rule keys on the stub, not on node-ness.) */
    if((e-w)<STUB_DEG&&(n-s)<STUB_DEG) return null;
    /* OUTLYING TERRITORY. An administrative extent includes everything the unit owns, however far
       away: Tokyo Metropolis reaches 1,000 km south to Ogasawara, France holds French Guiana,
       Ecuador holds the Galápagos. MEASURED: framing Tokyo's real 18.4°×15.7° extent centres the map
       in open ocean south of Honshu with the city itself a speck at the top — correct as geometry,
       useless as an answer to "Tokyo".
       The tell is that the geocoder's own point sits nowhere near the middle of the box. When the
       point falls outside the middle 60% of the extent in either axis, the extent is being driven by
       outliers and the class zoom at the point is the better frame. A compact place (Japan, Lake
       Baikal, Central Park) has its point near the centre and keeps its extent. */
    const plng=+(raw.lon!=null?raw.lon:raw.lng), plat=+raw.lat;
    if(isFinite(plng)&&isFinite(plat)){
      const fx=(plng-w)/(e-w), fy=(plat-s)/(n-s);
      if(fx<0.2||fx>0.8||fy<0.2||fy>0.8) return null;
    }
    return [[w,s],[e,n]];
  }
  /* The whole decision, in one place so a test can ask it without a map. */
  function framingFor(raw,localKind){
    const cls=placeClass(raw,localKind);
    const ext=placeExtent(raw,cls);
    let zoom=(cls&&PLACE_ZOOM[cls]!=null)?PLACE_ZOOM[cls]:DEFAULT_ZOOM;
    /* A box that had to be rejected for spanning the globe is itself evidence: only a feature that
       wraps the antimeridian does that, and every one of them (Russia, the USA with Alaska, Fiji,
       Kiribati, New Zealand) is enormous. Russia at the plain country zoom of 4.4 lands inside
       Siberia with the country running off all four edges, so an unusable box widens the fallback
       rather than being silently ignored. */
    if(ext&&ext.huge) return { cls:cls||null, bounds:null, zoom:Math.min(zoom,3.2), huge:true };
    return { cls:cls||null, bounds:ext, zoom };
  }
  async function doGeocode(){
    const inp=document.getElementById('ms-input'), q=inp.value.trim(), res=document.getElementById('ms-results'); if(!q)return;
    res.style.display='block';
    /* (#R15e) Make sure the bundled country data is loading so local country/capital matches are available
       (the gazetteer is always loaded; countryStats may not be until Stats is opened). Non-blocking. */
    try{ if(typeof HOST.loadCountryData==='function' && (typeof HOST.countryStats==='undefined' || !HOST.countryStats || !Object.keys(HOST.countryStats).length)) HOST.loadCountryData(); }catch(_){}
    const pq=preprocessNLQuery(q);
    const local=localFuzzyPlaces(q);
    const seen=new Set();
    /* (#R183) `kind` rides along so a local (gazetteer / country / capital) match — which has no
       provider metadata at all — still gets framed by what it IS rather than by the default. */
    const addItem=(label,lng,lat,raw,kind)=>{ if(isNaN(lng)||isNaN(lat))return; const key=label+'|'+lng.toFixed(2)+'|'+lat.toFixed(2); if(seen.has(key))return; seen.add(key);
      const d=document.createElement('div'); d.className='ms-item'; d.textContent=label; d.onclick=()=>{ gotoPlace(lng,lat,label,raw||null,kind||null); res.style.display='none'; inp.value=String(label).split(',')[0].split(' · ')[0]; }; res.appendChild(d); };
    /* (#R15e) Show strong LOCAL matches IMMEDIATELY — was awaiting Nominatim with no timeout, so a slow /
       unreachable geocoder left the box frozen on "Loading…" forever ("結果が出てこない"). Now local
       (countries/capitals/gazetteer) appear instantly; the external geocoder is merged in with a hard
       timeout so it can never hang the search. */
    res.innerHTML='';
    local.filter(l=>l.score>=72).forEach(l=>addItem(l.name,l.lng,l.lat,null,l.kind));
    if(!res.children.length) res.innerHTML=`<div class="ms-loading">${HOST.t('loading')}</div>`;
    /* (#R16) The mobile "no results" bug: under file:// / on mobile networks Nominatim is often rate-limited,
       blocked (null Origin) or just slow, and on a fresh load countryStats isn't loaded yet, so there was
       NOTHING to show. Now query TWO CORS-friendly geocoders in PARALLEL behind one hard timeout —
       **Open-Meteo geocoding** (fast, robust, fuzzy, works where Nominatim doesn't) AND Nominatim (richer
       coverage). Either one alone yields results, so the search practically never comes back empty. */
    const ctrl=new AbortController(); const to=setTimeout(()=>{ try{ctrl.abort();}catch(_){} },5000);
    const omP=fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=${HOST.lang==='jp'?'ja':'en'}&format=json`,{signal:ctrl.signal})
      /* (#R183) `feature_code` is carried under its own name as well as `type`: it is a GeoNames code
         (PCLI / ADM1 / PPLC …), not an OSM type, and placeClass reads the two vocabularies apart. */
      .then(r=>r.ok?r.json():null).then(j=>{ (j&&j.results||[]).forEach(p=>{ if(p.latitude==null||p.longitude==null)return; const adm=[p.admin1,p.country].filter(Boolean).join(', '); addItem(p.name+(adm?', '+adm:''),+p.longitude,+p.latitude,{display_name:p.name,type:p.feature_code,feature_code:p.feature_code,population:p.population,address:{country:p.country}}); }); }).catch(()=>{});
    const nomP=fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&accept-language=${HOST.lang==='jp'?'ja':'en'}&q=${encodeURIComponent(pq)}`,{signal:ctrl.signal})
      .then(r=>r.ok?r.json():[]).then(a=>{ (a||[]).forEach(pl=>addItem(pl.display_name,+pl.lon,+pl.lat,pl)); }).catch(()=>{});
    /* (#R19) Third parallel geocoder: Photon (komoot) — TYPO-TOLERANT like a search engine
       ("あいまいな単語を入れても検索できるように"; curl-verified CORS* and that "osakaa" → Osaka). */
    const phP=fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=6&lang=${HOST.lang==='jp'?'en':'en'}`,{signal:ctrl.signal})
      /* (#R183) Photon publishes `extent` [minLon, maxLat, maxLon, minLat] on most results — a real
         footprint, which beats any class guess — plus osm_key/osm_value as the class fallback. All
         three were being discarded here, so every Photon hit landed on the flat zoom-9 default. */
      .then(r=>r.ok?r.json():null).then(j=>{ (j&&j.features||[]).forEach(f=>{ try{ const p=f.properties||{}, g=f.geometry; if(!g||!g.coordinates) return;
        const label=[p.name,p.city,p.state,p.country].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(', ');
        if(label) addItem(label,+g.coordinates[0],+g.coordinates[1],{display_name:label,type:p.osm_value||p.type,osm_key:p.osm_key,osm_value:p.osm_value,extent:p.extent,address:{country:p.country}}); }catch(_){} }); }).catch(()=>{});
    await Promise.allSettled([omP,nomP,phP]); clearTimeout(to);
    const lo=res.querySelector('.ms-loading'); if(lo) lo.remove();
    if(!res.querySelector('.ms-item')){ res.innerHTML=''; local.forEach(l=>addItem(l.name,l.lng,l.lat,null,l.kind)); }   /* weak local fallback */
    if(!res.querySelector('.ms-item')){ res.innerHTML=`<div class="ms-loading">${HOST.t('noMatch')}</div>`; }
  }
  let searchCardEl=null, searchCardData=null, searchCardOnMove=null;
  function closeSearchCard(){
    if(HOST.searchMarker){ HOST.searchMarker.remove(); HOST.searchMarker=null; }
    if(searchCardEl){ searchCardEl.remove(); searchCardEl=null; }
    /* (#R171) events / camera / projection through IntMapGeoEngine — this file no longer names the renderer. */
    if(searchCardOnMove){ try{ const E=window.IntMapGeoEngine; if(E) E.events.off('move',searchCardOnMove); }catch(_){} searchCardOnMove=null; }
    searchCardData=null;
  }
  function positionSearchCard(){
    if(!searchCardEl||!searchCardData) return;
    const E=window.IntMapGeoEngine; if(!E) return;
    const pt=E.coords.project([searchCardData.lng,searchCardData.lat]); if(!pt) return;
    searchCardEl.style.left=pt.x+'px';
    searchCardEl.style.top=pt.y+'px';
  }
  async function gotoPlace(lng,lat,displayName,raw,localKind){
    const GEO=window.IntMapGeoEngine; if(!GEO)return;
    closeSearchCard();
    /* (#R183) …instead of zoom 9 for a doorway and zoom 9 for a continent. See framingFor above.
       fitBounds is preferred where the geocoder gave a real extent; cameraForBounds is asked first so
       the flight is a single smooth flyTo rather than fitBounds' own motion, and so a renderer that
       cannot answer the query still gets framed. maxZoom keeps a tiny extent (a single building's
       footprint) from slamming into z20. */
    const fr=framingFor(raw,localKind);
    let flown=false;
    if(fr.bounds&&!fr.bounds.huge){
      try{
        const cam=GEO.camera.forBounds(fr.bounds,{padding:64,maxZoom:16.5});
        if(cam&&cam.center&&isFinite(cam.zoom)){ GEO.camera.flyTo({center:cam.center,zoom:cam.zoom,speed:1.4,essential:true}); flown=true; }
        else { GEO.camera.fitBounds(fr.bounds,{padding:64,maxZoom:16.5,speed:1.4,essential:true}); flown=true; }
      }catch(_){}
    }
    if(!flown) GEO.camera.flyTo({center:[lng,lat],zoom:fr.zoom,speed:1.4});
    /* Build custom HTML pin element */
    const pinEl=document.createElement('div');
    pinEl.className='search-pin';
    pinEl.innerHTML='<div class="sp-body"></div><div class="sp-pulse"></div>';
    HOST.searchMarker=GE().ui.attach(GE().ui.marker({element:pinEl,anchor:'bottom'}).setLngLat([lng,lat]));
    /* Build the result card */
    searchCardData={lng,lat,name:displayName,raw};
    searchCardEl=document.createElement('div');
    searchCardEl.className='search-result-card';
    document.getElementById('map-container').appendChild(searchCardEl);
    /* Try to enrich with admin info via reverse geocode (Nominatim) */
    let admin='', type='', country='';
    try{
      if(raw){ admin=raw.display_name||''; type=raw.type||raw.class||''; country=raw.address&&raw.address.country||''; }
    }catch(_){}
    const parts=(displayName||'').split(',');
    const primary=parts[0]||displayName||'';
    const restAdmin=parts.slice(1,4).map(s=>s.trim()).filter(Boolean).join(', ');
    searchCardEl.innerHTML=`<button class="src-card-close" title="${HOST.t('close')}">✕</button>
      <div class="src-card">
        <h4>📍 ${IntMapSafe.html(primary)}</h4>
        <div class="src-sub">${IntMapSafe.html(restAdmin||country||'')}</div>
        <div class="src-row"><span>${HOST.t('coords')}</span><b>${HOST.fmtLL(lng,lat)}</b></div>
        ${type?`<div class="src-row"><span>${HOST.lang==='jp'?'種別':HOST.lang==='de'?'Typ':HOST.lang==='ru'?'Тип':HOST.lang==='es'?'Tipo':'Type'}</span><b>${IntMapSafe.html(type)}</b></div>`:''}
        <div class="src-row"><span>${HOST.t('elev')}</span><b id="src-elev">${HOST.lang==='jp'?'取得中...':HOST.lang==='de'?'Lädt…':HOST.lang==='ru'?'Загрузка…':HOST.lang==='es'?'Cargando…':'Loading...'}</b></div>
        <div class="src-actions">
          <button class="primary" id="src-copy">📋 ${HOST.t('ctxCopy')}</button>
          <button id="src-pin">📍 ${HOST.t('ctxDropPin')}</button>
        </div>
      </div>`;
    searchCardEl.querySelector('.src-card-close').onclick=closeSearchCard;
    searchCardEl.querySelector('#src-copy').onclick=()=>{ try{ navigator.clipboard.writeText(`${lat.toFixed(5)}, ${lng.toFixed(5)}`); }catch(_){} };
    searchCardEl.querySelector('#src-pin').onclick=()=>{ const id=HOST.addPin(lng,lat); HOST.openPinPopup(id); };
    /* (#R36) rAF-coalesce the per-move reposition (mobile pan/zoom smoothness #13): `move` can fire several
       times per frame during inertia, and positionSearchCard does layout (getBoundingClientRect + style writes);
       collapse it to at most once per frame so it never piles up work mid-gesture. */
    let _scRAF=0; searchCardOnMove=()=>{ if(_scRAF) return; _scRAF=requestAnimationFrame(()=>{ _scRAF=0; try{ positionSearchCard(); }catch(_){} }); }; GEO.events.on('move',searchCardOnMove);
    positionSearchCard();
    /* Async elevation / depth */
    try{
      const r=await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}`);
      let e=null; if(r.ok){ const j=await r.json(); e=j&&j.elevation&&j.elevation[0]; }
      const el=searchCardEl&&searchCardEl.querySelector('#src-elev');
      if(el){
        if(typeof e==='number' && e>0.5){ el.textContent=HOST.fmtElevVal(e); }
        else { const d=await HOST.fetchBathymetry(lat,lng); if(typeof d==='number'){ el.textContent = d<0 ? (HOST.fmtElevVal(Math.abs(d))+' '+(HOST.lang==='jp'?'(水深)':HOST.lang==='de'?'(Tiefe)':HOST.lang==='ru'?'(глубина)':HOST.lang==='es'?'(profundidad)':'(depth)')) : HOST.fmtElevVal(d); } else if(typeof e==='number'){ el.textContent=HOST.fmtElevVal(e); } else el.textContent='—'; }
      }
    }catch(_){}
  }
  /* (#R183) framingFor/placeClass/placeExtent are exported so the choice can be tested without a map
     and so Atlas can reuse the same table instead of inventing a second one. */
  return { doGeocode, localFuzzyPlaces, gotoPlace, framingFor, placeClass, placeExtent,
    _zoomTable:()=>Object.assign({},PLACE_ZOOM), _defaultZoom:()=>DEFAULT_ZOOM };
};
