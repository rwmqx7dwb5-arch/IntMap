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
    const push=(name,lng,lat,score,kind,bbox)=>{ lng=+lng;lat=+lat; if(isNaN(lng)||isNaN(lat))return; out.push({name,lng,lat,score,kind:kind||'',bbox:bbox||null}); };   /* (#R46) kind = scale hint (country/capital/city/…) for Atlas zoom */
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
      /* (#R185) a country match carries the country's REAL extent (see js/countries-ui.js), so the
         search frames Monaco like Monaco and Russia like Russia instead of giving both the one
         `country` zoom. A CAPITAL match is a point inside the country and must not be framed by the
         country's box — it keeps the class zoom, as before. */
      if(sc>0) push(s.nameEn+suffix, s.latlng[1], s.latlng[0], sc, suffix?'capital':'country', suffix?null:s.bbox);
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

  async function doGeocode(){
    const inp=document.getElementById('ms-input'), q=inp.value.trim(), res=document.getElementById('ms-results'); if(!q)return;
    res.style.display='block';
    /* (#R15e) Make sure the bundled country data is loading so local country/capital matches are available
       (the gazetteer is always loaded; countryStats may not be until Stats is opened). Non-blocking. */
    try{ if(typeof HOST.loadCountryData==='function' && (typeof HOST.countryStats==='undefined' || !HOST.countryStats || !Object.keys(HOST.countryStats).length)) HOST.loadCountryData(); }catch(_){}
    /* (#R198) …and the world gazetteer, for the same reason and on the same terms: localFuzzyPlaces
       below reads HOST.BUILTIN_GAZETTEER, which is 3,482 rows larger once this resolves. Non-blocking
       — this search runs against whatever is loaded now, the next one against more. */
    try{ if(window.IntMapGazetteer&&window.IntMapGazetteer.warm) window.IntMapGazetteer.warm(); }catch(_){}
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
    /* (#R185) …and the extent rides along as the shape js/place-framing.js already reads — a
       Nominatim-style [S, N, W, E] box plus the point — so one ladder frames local and remote
       results alike rather than there being a second copy of the decision here. */
    /* (#R426) `homeExtent` marks WHERE this box came from, and js/place-framing.js reads it to skip
       the OUTLIER test — a guess about a provider box of unknown provenance, and the wrong question
       to ask of one js/country-extent.js has already trimmed. Without it twenty countries held their
       own measured footprint and were still flown to the flat `country` zoom of 4.4. */
    const _localRaw=(l)=>(l&&l.bbox)?{ boundingbox:[l.bbox[1],l.bbox[3],l.bbox[0],l.bbox[2]], lat:l.lat, lon:l.lng, homeExtent:true }:null;
    local.filter(l=>l.score>=72).forEach(l=>addItem(l.name,l.lng,l.lat,_localRaw(l),l.kind));
    if(!res.children.length) res.innerHTML=`<div class="ms-loading">${HOST.t('loading')}</div>`;
    /* (#R16) The mobile "no results" bug: under file:// / on mobile networks Nominatim is often rate-limited,
       blocked (null Origin) or just slow, and on a fresh load countryStats isn't loaded yet, so there was
       NOTHING to show. Now query TWO CORS-friendly geocoders in PARALLEL behind one hard timeout —
       **Open-Meteo geocoding** (fast, robust, fuzzy, works where Nominatim doesn't) AND Nominatim (richer
       coverage). Either one alone yields results, so the search practically never comes back empty. */
    const ctrl=new AbortController(); const to=setTimeout(()=>{ try{ctrl.abort();}catch(_){} },5000);
    const omP=fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=${window.IntMapLang.locale(HOST.lang,"en")}&format=json`,{signal:ctrl.signal})
      /* (#R183) `feature_code` is carried under its own name as well as `type`: it is a GeoNames code
         (PCLI / ADM1 / PPLC …), not an OSM type, and placeClass reads the two vocabularies apart. */
      .then(r=>r.ok?r.json():null).then(j=>{ (j&&j.results||[]).forEach(p=>{ if(p.latitude==null||p.longitude==null)return; const adm=[p.admin1,p.country].filter(Boolean).join(', '); addItem(p.name+(adm?', '+adm:''),+p.longitude,+p.latitude,{display_name:p.name,type:p.feature_code,feature_code:p.feature_code,population:p.population,address:{country:p.country}}); }); }).catch(()=>{});
    /* (#R489) …behind the app's ONE one-a-second Nominatim floor (js/nominatim-gate.js), reached
       through `window` because this file may contain no top-level declarations (tests/r175 #4).
       ⚠ IT QUEUES RATHER THAN DROPPING. #R298 measured what dropping does to a typed search — every
       keystroke inside the window answered 「[]」 — and the two parallel geocoders beside this one
       keep answering meanwhile, so the card is never empty while this waits. The 5 s AbortController
       above is still the ceiling, and a search the reader has moved on from is checked for here. */
    const nomP=(window.IntMapNominatimGate?window.IntMapNominatimGate.nominatimSlot():Promise.resolve(true))
      .then(()=>ctrl.signal.aborted?null:fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&accept-language=${window.IntMapLang.locale(HOST.lang,"en")}&q=${encodeURIComponent(pq)}`,{signal:ctrl.signal}))
      .then(r=>(r&&r.ok)?r.json():[]).then(a=>{ (a||[]).forEach(pl=>addItem(pl.display_name,+pl.lon,+pl.lat,pl)); }).catch(()=>{});
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
    if(!res.querySelector('.ms-item')){ res.innerHTML=''; local.forEach(l=>addItem(l.name,l.lng,l.lat,_localRaw(l),l.kind)); }   /* weak local fallback */
    if(!res.querySelector('.ms-item')){ res.innerHTML=`<div class="ms-loading">${HOST.t('noMatch')}</div>`; }
  }
  let searchCardEl=null, searchCardData=null, searchCardOnMove=null;
  function closeSearchCard(){
    if(HOST.searchMarker){ HOST.searchMarker.remove(); HOST.searchMarker=null; }
    if(searchCardEl){ searchCardEl.remove(); searchCardEl=null; }
    /* ⚠ (#R244) ONE × CLEARS BOTH, which is the whole point of #R59: the place popup owns its
       boundary and closing it takes the boundary with it. The search card now owns one too, so it
       has to be the same contract — otherwise a postcode outline outlives the card that drew it and
       there is no control left that removes it. */
    try{ window.IntMapOutline && window.IntMapOutline.clear && window.IntMapOutline.clear(); }catch(_){}
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
  /* ── (#R244) postcode → its own boundary ─────────────────────────────────────────────────────
     `_looksPostal` asks the RESULT first (Nominatim types a postcode as `postcode` / `postal_code`,
     which is the answer with no guessing in it) and only falls back to the shape of the string when
     the provider said nothing — Open-Meteo and Photon do not carry the type. The pattern is
     deliberately the intersection of the world's postal formats rather than a per-country table:
     digits, at most one space or hyphen, 3–10 characters, at most two leading letters (GB/NL/CA). */
  const POSTAL_RE=/^[A-Za-z]{0,2}\d[A-Za-z0-9]{1,4}(?:[ -]?[A-Za-z0-9]{1,4})?$/;
  function _looksPostal(label,raw){
    try{
      const ty=String((raw&&(raw.type||raw.osm_value))||'').toLowerCase();
      if(ty==='postcode'||ty==='postal_code') return true;
      if(ty&&ty!=='') return false;   /* the provider typed it as something else — believe it */
      const head=String(label||'').split(',')[0].trim();
      return /\d/.test(head)&&POSTAL_RE.test(head);
    }catch(_){ return false; }
  }
  async function _outlinePostcode(label,raw,lng,lat){
    try{
      const OT=window.IntMapOutline; if(!OT||!OT.show) return;
      const code=String(label||'').split(',')[0].trim(); if(!code) return;
      /* ⚠ BOUNDED TO WHERE THE SEARCH LANDED, NOT «the first five worldwide». A postcode is shared
         across countries — measured, `postalcode=10115` with `limit=5` returns Zagreb, Manhattan,
         Gimpo and Bouira and never reaches Berlin, so the Berlin result the reader just picked had
         no boundary to find. `viewbox` + `bounded=1` around the point that was actually flown to
         returns the ONE postcode area the reader is looking at (measured: 1 result, a Polygon).
         ⚠ 1.5° is comfortably larger than any postal area and small enough to exclude a namesake in
         the next country; the sort below still breaks a tie by distance. */
      const d=1.5;
      const u='https://nominatim.openstreetmap.org/search?format=jsonv2&limit=10&polygon_geojson=1'
        +'&polygon_threshold=0.0003&bounded=1&viewbox='+(lng-d)+','+(lat+d)+','+(lng+d)+','+(lat-d)
        +'&postalcode='+encodeURIComponent(code);
      const _g=window.IntMapNominatimGate; if(_g) await _g.nominatimSlot();   /* (#R489) the one Nominatim floor — js/nominatim-gate.js */
      const r=await fetch(u,{headers:{Accept:'application/json'}}); if(!r.ok) return;
      const j=await r.json(); if(!Array.isArray(j)||!j.length) return;
      const polys=j.filter(o=>o&&o.geojson&&/Polygon/.test(o.geojson.type||''));
      if(!polys.length) return;   /* ⚠ no real boundary → draw NOTHING, exactly like a place label (#R59) */
      /* nearest to where the search actually landed, so a code shared across countries cannot win */
      polys.sort((a,b)=>(Math.hypot(+a.lon-lng,+a.lat-lat))-(Math.hypot(+b.lon-lng,+b.lat-lat)));
      const best=polys[0];
      try{ if(OT.setColor){ const ac=(window.imAccent&&/^#[0-9a-fA-F]{6}$/.test(window.imAccent))?window.imAccent:'#0a84ff'; OT.setColor(ac); } }catch(_){}
      OT.show(code,{geojson:best.geojson,lng,lat,fit:false});
    }catch(_){}
  }
  async function gotoPlace(lng,lat,displayName,raw,localKind){
    const GEO=window.IntMapGeoEngine; if(!GEO)return;
    closeSearchCard();
    /* (#R183) …instead of zoom 9 for a doorway and zoom 9 for a continent. See framingFor above.
       fitBounds is preferred where the geocoder gave a real extent; cameraForBounds is asked first so
       the flight is a single smooth flyTo rather than fitBounds' own motion, and so a renderer that
       cannot answer the query still gets framed. maxZoom keeps a tiny extent (a single building's
       footprint) from slamming into z20. */
    const fr=window.IntMapPlaceFraming.framingFor(raw,localKind);
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
    searchCardEl.innerHTML=`<button class="src-card-close" title="${HOST.t('close')}">×</button>
      <div class="src-card">
        <h4>📍 ${IntMapSafe.html(primary)}</h4>
        <div class="src-sub">${IntMapSafe.html(restAdmin||country||'')}</div>
        <div class="src-row"><span>${HOST.t('coords')}</span><b>${HOST.fmtLL(lng,lat)}</b></div>
        ${type?`<div class="src-row"><span>${window.IntMapLang.t(HOST.lang,'Type','種別','Typ','Тип','Tipo')}</span><b>${IntMapSafe.html(type)}</b></div>`:''}
        <div class="src-row"><span>${HOST.t('elev')}</span><b id="src-elev">${window.IntMapLang.t(HOST.lang,'Loading...','取得中...','Lädt…','Загрузка…','Cargando…')}</b></div>
        <div class="src-actions">
          <button class="primary" id="src-copy">📋 ${HOST.t('ctxCopy')}</button>
          <button id="src-pin">📍 ${HOST.t('ctxDropPin')}</button>
        </div>
      </div>`;
    searchCardEl.querySelector('.src-card-close').onclick=closeSearchCard;
    searchCardEl.querySelector('#src-copy').onclick=()=>{ try{ navigator.clipboard.writeText(`${lat.toFixed(5)}, ${lng.toFixed(5)}`); }catch(_){} };
    /* (#R217) 「地名検索時のポップアップからdrop pin hereを押したら、地名検索時のポップアップは自動で消えるように。」
       The card is the ASK ("is this the place you meant?"); dropping a pin is the answer, so leaving the card open
       left the question on screen next to its own answer. closeSearchCard() takes the transient search marker with
       it, and that is the point rather than a side effect: a real user pin now stands at the same coordinates, and
       the × that was the search marker's ONLY remover is the thing being closed — keeping it would strand a second,
       un-removable pin under the first. Pin first, then close: HOST.openPinPopup(id) must not open into a card that
       is still being torn down. */
    searchCardEl.querySelector('#src-pin').onclick=()=>{ const id=HOST.addPin(lng,lat); HOST.openPinPopup(id); closeSearchCard(); };
    /* (#R36) rAF-coalesce the per-move reposition (mobile pan/zoom smoothness #13): `move` can fire several
       times per frame during inertia, and positionSearchCard does layout (getBoundingClientRect + style writes);
       collapse it to at most once per frame so it never piles up work mid-gesture. */
    /* ⚠ (#R234) one frame for the whole program — js/runtime.js — instead of this card's own rAF.
       Same coalescing and the same per-frame placement; the card still tracks its point exactly. */
    let _scRAF=0; searchCardOnMove=()=>{ const R=window.IntMapRuntime;
      if(R){ R.frame('search.card',()=>{ try{ positionSearchCard(); }catch(_){} }); return; }
      if(_scRAF) return; _scRAF=requestAnimationFrame(()=>{ _scRAF=0; try{ positionSearchCard(); }catch(_){} }); };
    GEO.events.on('move',searchCardOnMove);
    positionSearchCard();
    /* ══ ⚠⚠ (#R244) A POSTCODE SEARCH OUTLINES ITS AREA ═══════════════════════════════════════════
       「郵便番号で地点検索したら、その範囲が、地名ラベルをクリックした時みたいにハイライトされるように。」
       A place label already does this — js/map-ui.js's popup calls `IntMapOutline.show`, which draws
       the REAL OSM boundary and nothing at all when there is none (#R59: 「領域がわからない地名は
       全部長方形になるとかクソ」). A postcode goes through the same renderer for the same reason, so
       the two look identical and there is one boundary mechanism rather than two.
       ⚠ THE QUERY IS `postalcode=`, NOT `q=`. Nominatim's free-text search resolves «10115» to the
       postcode POINT; the structured parameter is what reaches the `boundary=postal_code` relation
       and returns its polygon (measured: 10115 → Polygon, and the free-text form → Point).
       ⚠ AND IT IS FIRE-AND-FORGET. The fly, the pin and the card are the answer to the search; this
       arrives when the network does, and a failure leaves the search exactly as it is today. */
    if(_looksPostal(displayName,raw)) _outlinePostcode(displayName,raw,lng,lat);
    /* Async elevation / depth */
    try{
      const _j=await window.IntMapWx.guardedJSON(`https://api.open-meteo.com/v1/elevation?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}`,3600000);
      const r={ok:!!_j, json:async()=>_j};
      let e=null; if(r.ok){ const j=await r.json(); e=j&&j.elevation&&j.elevation[0]; }
      const el=searchCardEl&&searchCardEl.querySelector('#src-elev');
      if(el){
        if(typeof e==='number' && e>0.5){ el.textContent=HOST.fmtElevVal(e); }
        else { const d=await HOST.fetchBathymetry(lat,lng); if(typeof d==='number'){ el.textContent = d<0 ? (HOST.fmtElevVal(Math.abs(d))+' '+(window.IntMapLang.t(HOST.lang,'(depth)','(水深)','(Tiefe)','(глубина)','(profundidad)'))) : HOST.fmtElevVal(d); } else if(typeof e==='number'){ el.textContent=HOST.fmtElevVal(e); } else el.textContent='—'; }
      }
    }catch(_){}
  }
  /* (#R183) The framing decision itself lives in js/place-framing.js — it is pure (no map, no HOST,
     no renderer), this factory's body may contain only declarations (tests/r169-checks #4), and the
     app-body shim contract pins exactly this return list. */
  return { doGeocode, localFuzzyPlaces };
};
