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
window.IntMapModules.searchGeocode=function(map,HOST){
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
  async function doGeocode(){
    const inp=document.getElementById('ms-input'), q=inp.value.trim(), res=document.getElementById('ms-results'); if(!q)return;
    res.style.display='block';
    /* (#R15e) Make sure the bundled country data is loading so local country/capital matches are available
       (the gazetteer is always loaded; countryStats may not be until Stats is opened). Non-blocking. */
    try{ if(typeof HOST.loadCountryData==='function' && (typeof HOST.countryStats==='undefined' || !HOST.countryStats || !Object.keys(HOST.countryStats).length)) HOST.loadCountryData(); }catch(_){}
    const pq=preprocessNLQuery(q);
    const local=localFuzzyPlaces(q);
    const seen=new Set();
    const addItem=(label,lng,lat,raw)=>{ if(isNaN(lng)||isNaN(lat))return; const key=label+'|'+lng.toFixed(2)+'|'+lat.toFixed(2); if(seen.has(key))return; seen.add(key);
      const d=document.createElement('div'); d.className='ms-item'; d.textContent=label; d.onclick=()=>{ gotoPlace(lng,lat,label,raw||null); res.style.display='none'; inp.value=String(label).split(',')[0].split(' · ')[0]; }; res.appendChild(d); };
    /* (#R15e) Show strong LOCAL matches IMMEDIATELY — was awaiting Nominatim with no timeout, so a slow /
       unreachable geocoder left the box frozen on "Loading…" forever ("結果が出てこない"). Now local
       (countries/capitals/gazetteer) appear instantly; the external geocoder is merged in with a hard
       timeout so it can never hang the search. */
    res.innerHTML='';
    local.filter(l=>l.score>=72).forEach(l=>addItem(l.name,l.lng,l.lat,null));
    if(!res.children.length) res.innerHTML=`<div class="ms-loading">${HOST.t('loading')}</div>`;
    /* (#R16) The mobile "no results" bug: under file:// / on mobile networks Nominatim is often rate-limited,
       blocked (null Origin) or just slow, and on a fresh load countryStats isn't loaded yet, so there was
       NOTHING to show. Now query TWO CORS-friendly geocoders in PARALLEL behind one hard timeout —
       **Open-Meteo geocoding** (fast, robust, fuzzy, works where Nominatim doesn't) AND Nominatim (richer
       coverage). Either one alone yields results, so the search practically never comes back empty. */
    const ctrl=new AbortController(); const to=setTimeout(()=>{ try{ctrl.abort();}catch(_){} },5000);
    const omP=fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=${HOST.lang==='jp'?'ja':'en'}&format=json`,{signal:ctrl.signal})
      .then(r=>r.ok?r.json():null).then(j=>{ (j&&j.results||[]).forEach(p=>{ if(p.latitude==null||p.longitude==null)return; const adm=[p.admin1,p.country].filter(Boolean).join(', '); addItem(p.name+(adm?', '+adm:''),+p.longitude,+p.latitude,{display_name:p.name,type:p.feature_code,address:{country:p.country}}); }); }).catch(()=>{});
    const nomP=fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&accept-language=${HOST.lang==='jp'?'ja':'en'}&q=${encodeURIComponent(pq)}`,{signal:ctrl.signal})
      .then(r=>r.ok?r.json():[]).then(a=>{ (a||[]).forEach(pl=>addItem(pl.display_name,+pl.lon,+pl.lat,pl)); }).catch(()=>{});
    /* (#R19) Third parallel geocoder: Photon (komoot) — TYPO-TOLERANT like a search engine
       ("あいまいな単語を入れても検索できるように"; curl-verified CORS* and that "osakaa" → Osaka). */
    const phP=fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=6&lang=${HOST.lang==='jp'?'en':'en'}`,{signal:ctrl.signal})
      .then(r=>r.ok?r.json():null).then(j=>{ (j&&j.features||[]).forEach(f=>{ try{ const p=f.properties||{}, g=f.geometry; if(!g||!g.coordinates) return;
        const label=[p.name,p.city,p.state,p.country].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(', ');
        if(label) addItem(label,+g.coordinates[0],+g.coordinates[1],{display_name:label,type:p.osm_value||p.type,address:{country:p.country}}); }catch(_){} }); }).catch(()=>{});
    await Promise.allSettled([omP,nomP,phP]); clearTimeout(to);
    const lo=res.querySelector('.ms-loading'); if(lo) lo.remove();
    if(!res.querySelector('.ms-item')){ res.innerHTML=''; local.forEach(l=>addItem(l.name,l.lng,l.lat,null)); }   /* weak local fallback */
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
  async function gotoPlace(lng,lat,displayName,raw){
    const GEO=window.IntMapGeoEngine; if(!GEO)return;
    closeSearchCard();
    GEO.camera.flyTo({center:[lng,lat],zoom:9,speed:1.4});
    /* Build custom HTML pin element */
    const pinEl=document.createElement('div');
    pinEl.className='search-pin';
    pinEl.innerHTML='<div class="sp-body"></div><div class="sp-pulse"></div>';
    HOST.searchMarker=new maplibregl.Marker({element:pinEl,anchor:'bottom'}).setLngLat([lng,lat]).addTo(map);
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
  return { doGeocode, localFuzzyPlaces };
};
