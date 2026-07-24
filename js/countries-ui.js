/* ============================================================================
 *  IntMap · Countries tab & country detail  (#R168)
 * ----------------------------------------------------------------------------
 *  The Countries subject: the boundary/stat loader, the map country layers, the ranked country
 *  list, the country card and its detail body. Fifteen closure statements — nine function
 *  declarations and six small tables/caches that only this subject reads.
 *  index.html keeps a hoisted shim for each of the five names it still calls by name.
 *
 *  Moved VERBATIM out of the index.html DOMContentLoaded closure: the only edit is that free
 *  references to closure variables became HOST.<member> reads (Architecture.md §3.1). The
 *  extraction was done by script and reversed byte-for-byte against the original text.
 * ==========================================================================*/
window.IntMapModules=window.IntMapModules||{};
window.IntMapModules.countriesUi=function(map,HOST){
  const GDP_YEAR='2023', POP_YEAR='2024';

  /* (#R167) moved verbatim to js/tables.js — see Architecture.md §3.1. */
  const {GDP,HDI,DEM,MILSPEND,LIFE,INTERNET,CAPITAL,CURRENCY,LANGS}=window.IntMapTables;

  function flagFromISO2(a2){ if(!a2||a2.length!==2||a2==='-9')return'🏳️'; try{return a2.toUpperCase().replace(/./g,c=>String.fromCodePoint(127397+c.charCodeAt(0)));}catch(e){return'🏳️';} }

  function loadCountryData(){
    if(HOST.countryDataPromise) return HOST.countryDataPromise;
    HOST.countryDataPromise=(async()=>{
      try{
        let gj=null;
        /* (#R13) Highest-resolution Natural Earth borders (10 m) so the boundary lines are crisp and
           track the real borders — the user reported the 50 m lines were too coarse and ran parallel-
           offset from reality. 10 m gzips to ~4.7 MB and loads async (doesn't block the map), with a
           graceful fall back to 50 m then 110 m if it can't be fetched. */
        const NE='https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/';
        try{ const r=await fetch(NE+'ne_10m_admin_0_countries.geojson'); if(r.ok) gj=await r.json(); }catch(e){}
        if(!(gj&&gj.features)){ try{ const r=await fetch(NE+'ne_50m_admin_0_countries.geojson'); if(r.ok) gj=await r.json(); }catch(e){} }
        if(!(gj&&gj.features)){ try{ const r=await fetch(NE+'ne_110m_admin_0_countries.geojson'); if(r.ok) gj=await r.json(); }catch(e){} }
        if(gj&&gj.features){
          HOST.countryGeo=gj; window.countryGeo=HOST.countryGeo;   /* reused by the projection viewer (#16,#17) */
          gj.features.forEach(f=>{
            const p=f.properties||{};
            let code=(p.ISO_A3_EH&&p.ISO_A3_EH!=='-99')?p.ISO_A3_EH:((p.ISO_A3&&p.ISO_A3!=='-99')?p.ISO_A3:(p.ADM0_A3||''));
            if(!code||code==='-99'){ f.id=undefined; return; }
            f.id=code; if(f.properties) f.properties.__code=code;  /* used as promoteId so feature ids are stable codes */
            let area=0; try{ area=turf.area(f)/1e6; }catch(e){}
            /* (#R15) Natural Earth 10 m assigns minor territory polygons (Ashmore & Cartier, Coral Sea
               Islands, Indian Ocean Territories …) the SOVEREIGN's ISO_A3_EH code. Whichever such polygon
               came last in the file overwrote the real country's name/stats — e.g. "Australia" turned into
               a tiny territory's name. Keep the LARGEST-area feature per code so the mainland always wins. */
            const existing=HOST.countryStats[code];
            if(existing && existing._area!=null && existing._area>=area) return;
            const pop=+p.POP_EST||0;
            const gdp=(GDP[code]!=null)?GDP[code]:(p.GDP_MD!=null?+p.GDP_MD/1000:(p.GDP_MD_EST!=null?+p.GDP_MD_EST/1000:null));
            const a2=(p.ISO_A2_EH&&p.ISO_A2_EH!=='-99')?p.ISO_A2_EH:p.ISO_A2;
            /* (#R23) flag non-sovereign / unrecognized features (Scarborough Shoal, Bir Tawil, Bajo Nuevo,
               ice fields …) so "Random country" + quizzes never serve them as if they were states. */
            const _nonSov=(p.TYPE==='Indeterminate')||/indetermin|unrecogn/i.test(String(p.FCLASS_TLC||p.featurecla||p.FEATURECLA||''));
            HOST.countryStats[code]={ code, ccn3:String(p.ISO_N3||''), nameEn:p.NAME_EN||p.ADMIN||p.NAME||code, nameJp:p.NAME_JA||p.NAME_EN||p.ADMIN||code,
              sov:!_nonSov,
              pop, area:Math.round(area), _area:area, density:(pop&&area)?pop/area:null, region:p.CONTINENT||'', subregion:p.SUBREGION||'',
              capital:CAPITAL[code]||'', latlng:(p.LABEL_Y!=null&&p.LABEL_X!=null)?[+p.LABEL_Y,+p.LABEL_X]:null, flag:flagFromISO2(a2),
              currency:CURRENCY[code]||'', languages:LANGS[code]||'', gdp, gdppc:(gdp&&pop)?(gdp*1e9/pop):null,
              hdi:HDI[code]||null, dem:DEM[code]||null, milSpend:MILSPEND[code]||null, lifeExp:LIFE[code]||null, internet:INTERNET[code]||null };
          });
        }
      }catch(e){ console.warn('country load failed',e); }
      finally{
        /* (#R40) ROOT CAUSE of "Isolate / Country borders / Countries(info) を押しても反応しない、再読み込みで治る":
           if the FIRST border-GeoJSON fetch failed (slow/blocked CDN on a cold load), countryGeo stayed null
           but countryDataPromise stayed RESOLVED FOREVER, so every later call short-circuited on the cached
           (empty) promise and nothing ever worked — until a full page reload reset the promise. Now, on a
           FAILED load, clear the cached promise + flags so the very next call (a click) transparently retries
           the fetch. On success, latch as before. */
        const ok=!!(HOST.countryGeo&&HOST.countryGeo.features&&HOST.countryGeo.features.length);
        if(ok){ HOST.countryDataLoaded=true; if(map&&map.isStyleLoaded()) addCountryLayers();
          /* (#R25/#28) now that countryStats exists, rebuild the geo index so the auto-country/capital
             entries join the gazetteer → the non-AI news locator gains full global coverage. */
          try{ HOST.rebuildGeoIndex(); }catch(_){}
          /* (#R127) borders are here now → re-spread any live news pins that were placed as a tight blob while
             countryGeo was still loading (regionFor had no polygon), so country clusters fill the real territory. */
          try{ if(typeof HOST._respreadNews==='function') HOST._respreadNews(); }catch(_){}
        } else { HOST.countryDataLoaded=false; HOST.countryDataPromise=null; }
      } }
    )();
    HOST.countryDataPromise.then(()=>{ try{ HOST.loadGdpPPP(); }catch(_){} });   /* (#R22) enrich with PPP once base stats exist */
    return HOST.countryDataPromise;
  }

  let hoveredCid=null;

  function addCountryLayers(){
    if(!map||!map.isStyleLoaded()||!HOST.countryGeo||map.getSource('countries')) return;
    map.addSource('countries',{type:'geojson',data:HOST.countryGeo,promoteId:'__code'});
    map.addLayer({id:'country-fill',type:'fill',source:'countries',layout:{visibility:'none'},paint:{'fill-color':'#007aff','fill-opacity':['case',['boolean',['feature-state','hover'],false],0.30,0]}},'tool-poly');
    map.addLayer({id:'country-line',type:'line',source:'countries',layout:{visibility:'none'},paint:{'line-color':'#007aff','line-opacity':0.7,'line-width':['case',['boolean',['feature-state','hover'],false],2.4,0.6]}},'tool-poly');
    /* (#R26) Create the always-on country-BORDERS line HERE (when the countries source first exists), not
       only inside the cb-borders change handler — that lazy-create meant borders were checked-by-default but
       NOT drawn on load until you re-toggled them ("デフォルト選択されているのに表示されない"). applyTheme()
       sets its visibility from bordersOn (default true). */
    try{ HOST.ensureBordersLayer(); }catch(_){}   /* (#R40) borders-only-line now comes from the OFM boundary layer (accurate, basemap-aligned) — created here too in case Countries(info) initializes first */
    map.on('mousemove','country-fill',(e)=>{ if(!HOST.countryInfoOn||HOST.toolMode||!e.features.length)return;
      /* (#R130) during time-travel do NOT highlight / read out the MODERN country under the cursor — that showed
         modern Ukraine/Lithuania info while hovering interwar Poland. The era name labels identify countries; the
         click handler above resolves the era entity on demand. */
      if(window.IntMapTimeBorders&&window.IntMapTimeBorders.active&&window.IntMapTimeBorders.active()){ if(hoveredCid!==null){ try{ map.setFeatureState({source:'countries',id:hoveredCid},{hover:false}); }catch(_){} hoveredCid=null; } return; }
      const f=e.features[0]; if(hoveredCid!==null)map.setFeatureState({source:'countries',id:hoveredCid},{hover:false}); hoveredCid=f.id; map.setFeatureState({source:'countries',id:hoveredCid},{hover:true}); showCountryInfo(f); });
    map.on('mouseleave','country-fill',()=>{ if(hoveredCid!==null)map.setFeatureState({source:'countries',id:hoveredCid},{hover:false}); hoveredCid=null; HOST.hideCountryInfo(); });
    /* (#R130) ROOT CAUSE of the long-standing "昔の年代でも地図クリック国選択が現代国境になる" re-report (survived
       R122–R129): every prior round fixed the era-aware CROSSHAIR pickers (#scp-pick / #csearch-pick) + the resolveHist
       ladder — which were already correct — but the gesture the user actually performs, a PLAIN click on a country
       during time-travel, was handled by THIS era-UNAWARE country-fill handler. It resolved against the MODERN
       countryGeo, so clicking interwar Poland's Lwów gave modern Ukraine and Vilnius gave modern Lithuania (Warsaw/
       Kraków only looked "right" because their modern carrier is still POL — hence the intermittent, 1920s-Poland
       feel). Now, during travel, the plain click routes through the SAME era PIP → resolveHist path the pickers use
       and NEVER falls back to the modern polygon. */
    map.on('click','country-fill',(e)=>{ if(!(HOST.countryInfoOn&&!HOST.toolMode&&!window.__scpPick&&e.features.length)) return;
      const TB=window.IntMapTimeBorders;
      if(TB&&TB.active&&TB.active()){
        try{
          /* defer to a specific place label under the click (city / water / peak / river) so a city still opens as a
             PLACE, exactly like the era name-label handler (_clk) does — only bare country land opens the country. */
          const specific=['ofm-city','ofm-other','geo-sea','ofm-water','ofm-water2','ofm-river','ofm-peak'].filter(id=>{ try{ return !!map.getLayer(id); }catch(_){ return false; } });
          if(specific.length&&e.point&&map.queryRenderedFeatures(e.point,{layers:specific}).length) return;
          const ll=e.lngLat; let nm=null, geom=null; const fc=TB.currentFC&&TB.currentFC();
          if(fc&&fc.features&&typeof turf!=='undefined'){ const tp=turf.point([ll.lng,ll.lat]); let bA=Infinity;
            for(const ff of fc.features){ try{ if(ff.geometry&&turf.booleanPointInPolygon(tp,ff)){ const bb=turf.bbox(ff); const a=(bb[2]-bb[0])*(bb[3]-bb[1]); if(a<bA){ bA=a; nm=ff.properties&&(ff.properties.NAME||ff.properties.name); geom=ff.geometry; } } }catch(_){} } }
          if(nm&&TB.resolveHist){ const R=TB.resolveHist(nm,ll)||{};
            if(R.code&&HOST.countryStats[R.code]){ showCountryDetail(R.code, R.name||nm); return; }
            /* a real era entity with no comparable stats carrier — open its era place popup (name/wiki/flag), not the
               modern country that sits there today. */
            if(typeof window._imPlacePopup==='function'){ window._imPlacePopup(ll,(R.name||nm),true,{geojson:(R.geometry||geom),wiki:(R.wiki||nm),flag:R.flag}); return; } }
        }catch(_){}
        return;   /* during travel, NEVER resolve a country click to the modern polygon */
      }
      const f=e.features[0]; const p=f.properties||{}; const id=HOST.resolveCountryId(f); showCountryDetail(id, p.NAME_EN||p.ADMIN||p.NAME); });
    HOST.applyCountryVisibility();
  }

  const fmtNum=(n)=>n||n===0?Number(Math.round(n)).toLocaleString():'—';

  const fmtArea=(a)=>a?Number(Math.round(a)).toLocaleString()+' km²':'—';

  function showCountryInfo(feat){
    const id=HOST.resolveCountryId(feat), s=HOST.countryStats[id], p=document.getElementById('country-info'),
          name=HOST.cName(s,feat.properties&&(feat.properties.NAME_EN||feat.properties.ADMIN||feat.properties.NAME));
    const haveAny = s && (s.pop||s.gdp||s.area||s.hdi||s.dem||s.milSpend);
    p.innerHTML=`<div class="ci-name">${s&&s.flag?s.flag+' ':'🏳️ '}${name}</div>
      <div class="ci-row"><span>${HOST.t('statPop')} (${POP_YEAR})</span><b>${s&&s.pop?fmtNum(s.pop):HOST.t('dataNA')}</b></div>
      <div class="ci-row"><span>${HOST.t('statGdp')} (${GDP_YEAR})</span><b>${s&&s.gdp?HOST.fmtMoney(s.gdp):HOST.t('dataNA')}</b></div>
      <div class="ci-row"><span>${HOST.t('statGdpPPP')}</span><b>${s&&s.gdpPPP?HOST.fmtMoney(s.gdpPPP):HOST.t('dataNA')}</b></div>
      <div class="ci-row"><span>${HOST.t('statGdpPc')}</span><b>${s&&s.gdppc?HOST.fmtPc(s.gdppc):HOST.t('dataNA')}</b></div>
      <div class="ci-row"><span>${HOST.t('statGdpPcPPP')}</span><b>${s&&s.gdppcPPP?HOST.fmtPc(s.gdppcPPP):HOST.t('dataNA')}</b></div>
      <div class="ci-row"><span>${HOST.t('statHDI')}</span><b>${s&&s.hdi?s.hdi.toFixed(3):HOST.t('dataNA')}</b></div>
      <div class="ci-row"><span>${HOST.t('statDem')}</span><b>${s&&s.dem?s.dem.toFixed(2):HOST.t('dataNA')}</b></div>
      <div class="ci-row"><span>${HOST.t('statMil')}</span><b>${s&&s.milSpend?'$'+s.milSpend+'B':HOST.t('dataNA')}</b></div>
      <div class="ci-row"><span>${HOST.t('statCapital')}</span><b>${s&&s.capital?s.capital:HOST.t('dataNA')}</b></div>
      <div class="ci-row"><span>${HOST.t('statArea')}</span><b>${s&&s.area?fmtArea(s.area):HOST.t('dataNA')}</b></div>`;
    p.style.display='block';
  }

  async function enrichCountry(id){
    if(!id) return null;
    const s=HOST.countryStats[id];
    if(!s) return null;
    if(s._enrichedTried) return s;
    s._enrichedTried=true;
    try{
      const r=await fetch(`https://restcountries.com/v3.1/alpha/${encodeURIComponent(id)}?fields=name,capital,languages,currencies,population,area,region,subregion,flag,latlng,timezones,car,callingCodes,demonyms,borders,independent,unMember`);
      if(!r.ok) return s;
      const j=await r.json(); const c=Array.isArray(j)?j[0]:j; if(!c) return s;
      if(!s.capital && c.capital && c.capital.length) s.capital=c.capital[0];
      if(!s.languages && c.languages) s.languages=Object.values(c.languages).join(', ');
      if(!s.currency && c.currencies){ const cur=Object.entries(c.currencies)[0]; if(cur) s.currency=`${cur[0]}${cur[1]&&cur[1].name?' ('+cur[1].name+')':''}`; }
      if(!s.pop && c.population) s.pop=c.population;
      if((!s.area||s.area<1) && c.area) s.area=c.area;
      if(!s.density && s.pop && s.area) s.density=s.pop/s.area;
      if(!s.region && c.region) s.region=c.region;
      if(!s.subregion && c.subregion) s.subregion=c.subregion;
      if((!s.flag||s.flag==='🏳️') && c.flag) s.flag=c.flag;
      if(!s.latlng && c.latlng && c.latlng.length===2) s.latlng=c.latlng;
      if(c.timezones) s.timezones=c.timezones;
      if(c.borders) s.borders=c.borders;
      if(c.independent!=null) s.independent=c.independent;
      if(c.unMember!=null) s.unMember=c.unMember;
      if(c.demonyms){ const eng=c.demonyms.eng; if(eng){ s.demonym=(eng.m||eng.f||''); } }
    }catch(e){}
    return s;
  }

  function renderCountryDetailBody(s){
    if(!s) return `<div class="cm-row"><span>${HOST.t('dataNA')}</span><b>—</b></div>`;
    const _de=HOST.lang==='de', _jp=HOST.lang==='jp', _ru=HOST.lang==='ru', _es=HOST.lang==='es';
    const TR=(en,jp,de,ru,es)=>_jp?jp:_de?de:_ru?ru:_es?(es||en):en;
    const yn=v=>v?TR('Yes','はい','Ja','Да','Sí'):TR('No','いいえ','Nein','Нет','No');
    const sec=(title,rows)=>{ const r=rows.filter(Boolean); if(!r.length) return ''; return `<div class="cp-sec"><div class="cp-sec-h">${title}</div>`+r.map(([k,v])=>`<div class="cm-row"><span>${k}</span><b>${v}</b></div>`).join('')+`</div>`; };
    const geo=sec('🌍 '+TR('Geography','地理','Geografie','География','Geografía'),[
      [HOST.t('statRegion'),(s.region||'—')+(s.subregion?' / '+s.subregion:'')],
      [HOST.t('statCapital'),s.capital||'—'],
      [HOST.t('statArea'),fmtArea(s.area)],
      [HOST.t('statDensity'),s.density?fmtNum(Math.round(s.density))+' /km²':'—'],
      (s.borders&&s.borders.length)?[TR('Borders','隣接','Nachbarländer','Соседи','Fronteras'),s.borders.join(', ')]:null,
      (s.timezones&&s.timezones.length)?[TR('Timezones','時間帯','Zeitzonen','Часовые пояса','Zonas horarias'),s.timezones.slice(0,3).join(', ')+(s.timezones.length>3?'…':'')]:null
    ]);
    /* (#R94) when the master clock has travelled to a past year, the WB-synced rows carry THAT year;
       HDI (UNDP) and the Democracy Index (EIU) have no WB annual series so they keep their own year. */
    const _ty=(typeof window!=='undefined'&&window._imTimeYear)||null; const YR=(def)=>_ty||def; const yrTag=()=>(_ty?` (${_ty})`:'');
    const _milB=(v)=>'$'+(Math.round(v*10)/10)+'B';
    const econ=sec('💰 '+TR('Economy','経済','Wirtschaft','Экономика','Economía'),[
      [((s._real||window._imTimeReal)?('GDP · '+TR('real 2011 int$','実質2011年国際ドル','real, int$ 2011','реальный, межд.$ 2011','real int$ 2011')):HOST.t('statGdp'))+` (${YR(GDP_YEAR)})`,HOST.fmtMoney(s.gdp)],
      s.gdpPPP?[HOST.t('statGdpPPP'),HOST.fmtMoney(s.gdpPPP)]:null,
      [HOST.t('statGdpPc')+yrTag(),HOST.fmtPc(s.gdppc)],
      s.gdppcPPP?[HOST.t('statGdpPcPPP'),HOST.fmtPc(s.gdppcPPP)]:null,
      [HOST.t('statCurrency'),s.currency||'—']
    ]);
    const soc=sec('👥 '+TR('Society','社会','Gesellschaft','Общество','Sociedad'),[
      [HOST.t('statPop')+` (${YR(POP_YEAR)})`,fmtNum(s.pop)],
      s.hdi?[HOST.t('statHDI')+' (2022)',s.hdi.toFixed(3)]:null,
      s.lifeExp?[HOST.t('statLife')+yrTag(),s.lifeExp.toFixed(1)+' '+TR('yr','年','J','лет','a')]:null,
      s.internet?[HOST.t('statInet')+yrTag(),(Math.round(s.internet*10)/10)+'%']:null,
      [HOST.t('statLang'),s.languages||'—']
    ]);
    const pol=sec('🏛 '+TR('Politics & defense','政治・防衛','Politik & Verteidigung','Политика и оборона','Política y defensa'),[
      s.dem?[HOST.t('statDem')+' (2023)',s.dem.toFixed(2)]:null,
      s.milSpend?[HOST.t('statMil')+` (${YR(2023)})`,_milB(s.milSpend)]:null,
      s.unMember!=null?[TR('UN member','国連加盟','UN-Mitglied','Член ООН','Miembro de la ONU'),yn(s.unMember)]:null
    ]);
    let histNote='';
    if(s._hist){ const yrs=(s._from?s._from.slice(0,4):'')+'–'+(s._to?s._to.slice(0,4):'');
      histNote=`<div class="cp-histnote">🏛 <b>${TR('Former state','かつて存在した国家','Ehemaliger Staat','Бывшее государство','Estado desaparecido')}</b> · ${yrs}<br>${TR('GDP & population: Maddison Project (real GDP, 2011 int$). Other indicators: World Bank aggregate of the successor states.','GDP・人口: マディソン・プロジェクト（実質GDP・2011年国際ドル）。その他の指標: 後継国の世界銀行データを合算。','BIP & Bevölkerung: Maddison-Projekt (reales BIP, int$ 2011). Übrige: Weltbank-Summe der Nachfolgestaaten.','ВВП и население: проект Мэддисона (реальный ВВП, межд.$ 2011). Прочее: сумма стран-преемников (Всемирный банк).','PIB y población: Proyecto Maddison (PIB real, int$ 2011). Resto: suma del Banco Mundial de los estados sucesores.')} ${TR('Borders on the map follow the era.','地図の国境も当時のものになります。','Grenzen folgen der Epoche.','Границы на карте — той эпохи.','Las fronteras del mapa siguen la época.')}</div>`; }
    return `<div id="cp-intro" class="cp-intro"></div>`+histNote+geo+econ+soc+pol;
  }

  /* (#R39) Fill the intro with a Wikipedia summary (extract + thumbnail + link) in the active language. */
  const _cpIntroCache={};

  function _fillCountryIntro(name){
    try{
      const intro=document.getElementById('cp-intro'); if(!intro||!name) return;
      const wl=HOST.lang==='jp'?'ja':HOST.lang==='de'?'de':HOST.lang==='ru'?'ru':HOST.lang==='es'?'es':'en';
      const key=wl+':'+name;
      const esc=tt=>String(tt==null?'':tt).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
      const paint=(html)=>{ const i2=document.getElementById('cp-intro'); if(i2&&html) i2.innerHTML=html; };
      if(_cpIntroCache[key]!=null){ paint(_cpIntroCache[key]); return; }   /* re-render flash-free */
      fetch('https://'+wl+'.wikipedia.org/api/rest_v1/page/summary/'+encodeURIComponent(String(name).replace(/ /g,'_')))
        .then(r=>r.ok?r.json():null).then(j=>{
          if(!j || j.type==='disambiguation'){ _cpIntroCache[key]=''; return; }
          const extract=j.extract||'', img=(j.thumbnail&&j.thumbnail.source)||'', url=(j.content_urls&&j.content_urls.desktop&&j.content_urls.desktop.page)||'';
          if(!extract && !img){ _cpIntroCache[key]=''; return; }
          const html=(img?'<img src="'+esc(img)+'" alt="" class="cp-intro-img" loading="lazy">':'')
            +(extract?'<p class="cp-intro-text">'+esc(extract)+'</p>':'')
            +(url?'<a href="'+esc(url)+'" target="_blank" rel="noopener" class="cp-wiki-link">'+HOST.t('readWiki')+'</a>':'');
          _cpIntroCache[key]=html; paint(html);
        }).catch(()=>{});
    }catch(_){}
  }

  function showCountryDetail(id,fallback){
    const idStr=String(id||'');
    let s=HOST.countryStats[idStr];
    const name=HOST.cName(s,fallback);
    const popup=document.getElementById('country-popup');
    document.getElementById('cp-title').innerHTML=(s&&s.flag?s.flag+' ':'🏳️ ')+name;
    const body=document.getElementById('cp-body');
    window._cpCurrent={code:idStr,name:name};   /* read by the isolate + time-series buttons */
    const _isoSvg='<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3"/></svg>';
    const _tsSvg='<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m7 14 4-4 3 3 5-6"/></svg>';
    const _topBtnCss='flex:1;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:9px 6px;border:none;border-radius:10px;background:var(--input-bg);color:var(--text-main);font-weight:600;font-size:12px;cursor:pointer;';
    const _aiSvg='<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3M5.6 5.6l2.1 2.1M3 12h3M18 12h3M16.3 7.7l2.1-2.1"/><circle cx="12" cy="14" r="5"/></svg>';
    const _cmpSvg='<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 20V10M12 20V4M18 20v-7"/></svg>';
    const _aiName=encodeURIComponent(name).replace(/'/g,'%27');
    const topBtns=()=>`<div style="display:flex;gap:6px;margin:0 0 12px;">`
      +`<button onclick="window.IntMapIsolate&&window.IntMapIsolate.enter((window._cpCurrent||{}).code)" style="${_topBtnCss}"><span style="color:var(--primary-color);display:inline-flex;">${_isoSvg}</span>${HOST.lang==='de'?'Nur dieses Land':HOST.lang==='jp'?'この国だけ':HOST.lang==='ru'?'Только эту страну':'Isolate'}</button>`
      +`<button onclick="window.IntMapTimeSeries&&window.IntMapTimeSeries.open()" style="${_topBtnCss}"><span style="color:var(--primary-color);display:inline-flex;">${_tsSvg}</span>${HOST.lang==='de'?'Zeitverlauf':HOST.lang==='jp'?'時系列グラフ':HOST.lang==='ru'?'Динамика':'Time-series'}</button>`
      +`<button onclick="try{var _n=decodeURIComponent('${_aiName}'),_l=(window._cpCurrent&&window._cpCurrent._ll)||null;if(window.IntMapConsole&&window.IntMapConsole.brief){window.IntMapConsole.brief(_n,_l);}else if(window.IntMapAIResearch){window.IntMapAIResearch.open(_n,_l);}}catch(e){}" style="${_topBtnCss}"><span style="color:var(--primary-color);display:inline-flex;">${_aiSvg}</span>${HOST.lang==='de'?'KI-Bericht':HOST.lang==='jp'?'AI調査':HOST.lang==='ru'?'ИИ-справка':'AI brief'}</button>`
      +`<button onclick="try{window.IntMapStatsCompare&&window.IntMapStatsCompare.open()}catch(e){}" style="${_topBtnCss}"><span style="color:var(--primary-color);display:inline-flex;">${_cmpSvg}</span>${HOST.lang==='de'?'Vergleichen':HOST.lang==='jp'?'国を比較':HOST.lang==='ru'?'Сравнить':HOST.lang==='es'?'Comparar':'Compare'}</button>`
      +`</div>`;
    if(s && s.latlng) window._cpCurrent._ll={lng:s.latlng[1],lat:s.latlng[0]};
    body.innerHTML=topBtns()+renderCountryDetailBody(s);
    _fillCountryIntro((s&&(s._hist||s._histId)&&s.wiki)||name);
    if(s && s.latlng&&map) map.flyTo({center:[s.latlng[1],s.latlng[0]],zoom:3.5,speed:1.0});
    /* Asynchronously enrich and re-render (#R9b: keep the action buttons at the top) */
    if(s) enrichCountry(idStr).then(()=>{ if(popup.style.display==='block'){ body.innerHTML=topBtns()+renderCountryDetailBody(HOST.countryStats[idStr]); _fillCountryIntro((s&&(s._hist||s._histId)&&s.wiki)||name); } document.getElementById('cp-title').innerHTML=(s.flag?s.flag+' ':'🏳️ ')+HOST.cName(s,fallback); });
    /* (#R94) let the time-machine refresh THIS card's numbers in place (no re-fly / no re-fetch) when the
       global clock moves — closes over the live idStr/body/topBtns for the currently-open country. */
    window._imCountryCardRefresh=()=>{ try{ if(popup.style.display!=='block'||!window._cpCurrent||window._cpCurrent.code!==idStr) return; const s2=HOST.countryStats[idStr]; if(s2&&body){ body.innerHTML=topBtns()+renderCountryDetailBody(s2); _fillCountryIntro((s&&(s._hist||s._histId)&&s.wiki)||name); } }catch(_){} };
    popup.style.display='block';
    /* Initial centered position (viewport coords). Drag handle wires in once. */
    if(!popup.dataset.placed){
      const vw=window.innerWidth, vh=window.innerHeight;
      const w=popup.offsetWidth||380, h=popup.offsetHeight||400;
      popup.style.left=Math.max(12,(vw-w)/2)+'px';
      popup.style.top=Math.max(60,(vh-h)/2)+'px';
      popup.dataset.placed='1';
      HOST.makeDraggable(popup, popup.querySelector('.country-popup-header'));
    }
  }

  function renderStats(q){
    const feed=document.getElementById('countries-feed')||document.getElementById('live-news-feed'); HOST.clearMarkers();
    /* (#R69) the 5-country comparison view owns the feed while it is open — a deferred renderStats (e.g. the
       loadCountryData().then below firing after the user opened the comparison) must NOT clobber it; its own
       "Back to statistics" button removes the view before calling renderStats. */
    if(document.getElementById('scp-view')) return;
    if(!HOST.countryDataLoaded){ feed.innerHTML=`<div class="empty-msg">${HOST.t('loadingData')}</div>`; loadCountryData().then(()=>{ if(HOST.mode==='stats')renderStats(HOST.searchVal()); }); return; }
    /* (#R94b) hide successors while a former state is shown. (#R101) also drop non-sovereign geographic features
       (reefs / glaciers / no-man's-land — Scarborough Shoal, Southern Patagonian Ice Field, Bir Tawil …) that are
       flagged sov:false; they are neither states, unrecognized states, nor regions and don't belong in Countries. */
    let arr=Object.values(HOST.countryStats).filter(s=>s.nameEn && !s._histHidden && s.sov!==false);
    if(arr.length===0){ feed.innerHTML=`<div class="empty-msg">${HOST.t('noData')}</div>`; return; }
    if(q) arr=arr.filter(s=>s.nameEn.toLowerCase().includes(q)||(s.nameJp&&s.nameJp.includes(q)));
    /* (#R122) apply the numeric threshold filters (each active condition must hold; a country missing that
       indicator is excluded from a threshold on it — honest, not counted as passing). */
    const _actF=HOST.statsFilters.filter(f=>f&&f.key&&isFinite(f.val));
    if(_actF.length) arr=arr.filter(s=>_actF.every(f=>{ const v=s[f.key]; if(!isFinite(v)) return false; return f.op==='lte'?(v<=f.val):(v>=f.val); }));
    const key=HOST.statsSort, dir=HOST.statsSortDir;
    /* (#R102) sort by the chosen indicator in the chosen direction. Numeric: missing/zero values sort to the END in
       BOTH directions (so ascending never fills the top with un-populated countries). Name: locale-aware A–Z / Z–A. */
    arr.sort((a,b)=>{
      if(key==='name'){ const av=(HOST.lang==='jp'?(a.nameJp||a.nameEn||''):(a.nameEn||'')), bv=(HOST.lang==='jp'?(b.nameJp||b.nameEn||''):(b.nameEn||'')); const c=av.localeCompare(bv,HOST.lang==='jp'?'ja':undefined); return dir==='asc'?c:-c; }
      const av=a[key], bv=b[key]; const aOk=isFinite(av)&&av>0, bOk=isFinite(bv)&&bv>0;
      if(!aOk&&!bOk) return 0; if(!aOk) return 1; if(!bOk) return -1;
      return dir==='asc'?(av-bv):(bv-av);
    });
    /* (#R102) indicator PULLDOWN + ascending/descending toggle (replaces the old button row). */
    /* (#R105) + GDP per capita, GDP (PPP) and GDP per capita (PPP) selectable in the Countries pulldown (real WB data). */
    const IND=[['gdp',HOST.t('sortGdp')],['gdppc',HOST.t('statGdpPc')],['gdpPPP',HOST.t('statGdpPPP')],['gdppcPPP',HOST.t('statGdpPcPPP')],['pop',HOST.t('sortPop')],['area',HOST.t('sortArea')],['hdi',HOST.t('sortHDI')],['milSpend',HOST.t('sortMil')],['lifeExp',HOST.t('sortLife')],['tfr',HOST.t('sortTfr')],['name',HOST.t('sortName')]];
    /* (#R104) refined minimal SVG arrow instead of the plain-text ↑ / ↓ glyphs; both labels stacked so the button
       width never changes on toggle (see .ssd-labels CSS). */
    const _ssdArrow=up=>'<svg class="ssd-arrow" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">'+(up?'<path d="M12 19.5V5M6.5 11l5.5-6 5.5 6"/>':'<path d="M12 4.5V19M6.5 13l5.5 6 5.5-6"/>')+'</svg>';
    const dirLbl=_ssdArrow(dir==='asc')+'<span class="ssd-labels" data-dir="'+(dir==='asc'?'asc':'desc')+'"><span class="ssd-l ssd-l-asc">'+HOST.t('sortAsc')+'</span><span class="ssd-l ssd-l-desc">'+HOST.t('sortDesc')+'</span></span>';
    /* (#R122) numeric-filter control next to the sort. Indicators = the sortable numeric ones (drop 'name'). */
    const _FIND=IND.filter(([k])=>k!=='name');
    const _nActF=HOST.statsFilters.filter(f=>f&&f.key&&isFinite(f.val)).length;
    const _funnel='<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h18l-7 8v6l-4 2v-8z"/></svg>';
    const filterBtn=`<button type="button" class="stats-filter-btn${HOST.statsFilterOpen?' on':''}${_nActF?' has':''}" onclick="_sfToggle()" title="${HOST._sfL('Filter by value','数値で絞り込み','Nach Wert filtern','Фильтр по значению','Filtrar por valor')}">${_funnel}${_nActF?`<span class="sf-badge">${_nActF}</span>`:''}</button>`;
    const _sfPanel=(()=>{ if(!HOST.statsFilterOpen) return '';
      const opts=(sel)=>_FIND.map(([k,l])=>`<option value="${k}"${sel===k?' selected':''}>${l}</option>`).join('');
      const rows=HOST.statsFilters.map((f,i)=>`<div class="sf-row"><select onchange="_sfSetKey(${i},this.value)">${opts(f.key)}</select><select class="sf-op" onchange="_sfSetOp(${i},this.value)"><option value="gte"${f.op!=='lte'?' selected':''}>≥</option><option value="lte"${f.op==='lte'?' selected':''}>≤</option></select><input type="text" class="sf-val" value="${(f.raw||'').replace(/"/g,'&quot;')}" placeholder="${HOST._sfL('value (5M, 20000…)','値（5M, 20000…）','Wert','значение','valor')}" onchange="_sfSetVal(${i},this.value)"><button type="button" class="sf-x" onclick="_sfRemove(${i})" title="${HOST.t('remove')||'✕'}">✕</button></div>`).join('');
      return `<div class="stats-filter-panel">${rows||`<div class="sf-empty">${HOST._sfL('No conditions yet.','条件がありません。','Keine Bedingungen.','Нет условий.','Sin condiciones.')}</div>`}<div class="sf-actions"><button type="button" class="sf-add" onclick="_sfAdd()">+ ${HOST._sfL('Add condition','条件を追加','Bedingung','Условие','Añadir')}</button>${HOST.statsFilters.length?`<button type="button" class="sf-clear" onclick="_sfClear()">${HOST._sfL('Clear','クリア','Löschen','Очистить','Limpiar')}</button>`:''}</div></div>`; })();
    let html=`<div class="stats-toolbar"><select class="stats-sort-sel" onchange="setStatsSort(this.value)">${IND.map(([k,l])=>`<option value="${k}"${HOST.statsSort===k?' selected':''}>${l}</option>`).join('')}</select><button type="button" class="stats-sort-dir" onclick="toggleStatsSortDir()" title="${HOST.t('sortDir')}">${dirLbl}</button>${filterBtn}</div>${_sfPanel}`;
    /* (#R101) in time-machine (historical) mode the figures are REAL GDP (Maddison, 2011 int$), not nominal. */
    const _histY=window._imTimeYear||null;
    /* (#R102) the value column now carries ONLY the number ($3.4T etc.) — no indicator name on the card, per request. */
    const metricVal=(s)=>{ switch(key){
      case 'pop': return fmtNum(s.pop);
      case 'area': return fmtArea(s.area);
      case 'gdppc': return (s.gdppc&&isFinite(s.gdppc))?('$'+Math.round(s.gdppc).toLocaleString()):'—';
      case 'gdpPPP': return (s.gdpPPP&&isFinite(s.gdpPPP))?HOST.fmtMoney(s.gdpPPP):'—';
      case 'gdppcPPP': return (s.gdppcPPP&&isFinite(s.gdppcPPP))?('$'+Math.round(s.gdppcPPP).toLocaleString()):'—';
      case 'hdi': return s.hdi?(+s.hdi).toFixed(3):'—';
      case 'milSpend': return s.milSpend?'$'+s.milSpend+'B':'—';
      case 'lifeExp': return (s.lifeExp&&isFinite(s.lifeExp))?((+s.lifeExp).toFixed(1)+(HOST.lang==='jp'?'歳':HOST.lang==='de'?' J':HOST.lang==='ru'?' л':HOST.lang==='es'?' a':' yr')):'—';
      case 'tfr': return (s.tfr&&isFinite(s.tfr))?(+s.tfr).toFixed(2):'—';
      default: return HOST.fmtMoney(s.gdp);   /* gdp + name */
    } };
    /* (#R94/#R101) Time-machine status bar — year + the CURRENTLY-SORTED indicator. (#R103) it used to always say
       "real GDP" no matter which indicator was chosen ("どの指標を選んでもGDPとなっている") — reflect the selection. */
    const _L5b=(en,jp,de,ru,es)=>HOST.lang==='jp'?jp:HOST.lang==='de'?de:HOST.lang==='ru'?ru:HOST.lang==='es'?es:en;
    const _bMetric=(key==='pop')?_L5b('population','人口','Bevölkerung','население','población')
      :(key==='area')?_L5b('area','面積','Fläche','площадь','superficie')
      :(key==='hdi')?'HDI'
      :(key==='milSpend')?_L5b('military spending','軍事費','Militärausgaben','военные расходы','gasto militar')
      :(key==='lifeExp')?_L5b('life expectancy','平均寿命','Lebenserwartung','прод. жизни','esperanza de vida')
      :(key==='tfr')?_L5b('fertility rate','合計特殊出生率','Geburtenrate','рождаемость','fecundidad')
      :_L5b('real GDP (2011 int$)','実質GDP（2011年国際ドル）','reales BIP (int$ 2011)','реальный ВВП (межд.$ 2011)','PIB real (int$ 2011)');
    try{ const _ty=_histY, _pw=window._imTimePreWB;
      if(_ty){ html+=`<div class="stats-timebanner"><b>${_ty}${HOST.lang==='jp'?'年':''}</b> · ${_bMetric}</div>`; }
      else if(_pw){ html+=`<div class="stats-timebanner warn"><b>${_pw}</b> · ${HOST.lang==='jp'?'最新の入手可能な値':HOST.lang==='de'?'neueste verfügbare Werte':HOST.lang==='ru'?'последние доступные значения':HOST.lang==='es'?'últimos valores disponibles':'latest available figures'}</div>`; }
    }catch(_){}
    /* (#R70) the separate "Compare countries (up to 5)" button is RETIRED per instruction — country-row clicks
       build the selection and the dock's view button opens the unified comparison. */
    if(arr.length===0) html+=`<div class="empty-msg">${HOST.t('noMatch')}</div>`;
    /* (#R137) optional rank number on the far left (Settings → "Rank numbers", default OFF). The rank is the row's
       position in the CURRENT sort+filter, so it tracks whatever indicator/direction is active. */
    const _showRank=(window.imShowRank!=='off');   /* (#R139) rank numbers now default ON (show unless explicitly turned off) */
    /* (#R142) rank = the country's standing in the CURRENTLY-SORTED indicator by VALUE (largest = 1), NOT the row
       position — so toggling ascending/descending actually moves "#1" (the old i+1 kept showing 1,2,3… top-to-bottom
       for every sort/direction → "順序を変えても順位が変わらない"). In time-machine mode s[key] already holds the
       historical value, so the rank is the historical rank. Name sort falls back to the GDP rank. Rank over the shown set. */
    const _rankKey=(key==='name')?'gdp':key;
    const _rankOf=new Map(); arr.slice().filter(s=>isFinite(s[_rankKey])&&s[_rankKey]>0).sort((a,b)=>b[_rankKey]-a[_rankKey]).forEach((s,ri)=>_rankOf.set(s.code,ri+1));
    arr.forEach((s,i)=>{
      const active=HOST.compareSet.has(s.code)?'compare-on':'';
      /* (#R102) region / capital separated by a SLASH (was a middot); the value column shows the number only. */
      const subline=`${s.region||''}${(s.region&&s.capital)?' / ':''}${s.capital||''}`;
      const rankHTML=_showRank?`<span class="stat-rank">${_rankOf.get(s.code)||'—'}</span>`:'';
      /* (#R115) native hover tooltip = the FULL country name (the .stat-name is ellipsized on narrow cards). */
      html+=`<div class="stat-row ${active}" data-ccn="${s.code}" title="${String(HOST.cName(s)||'').replace(/"/g,'&quot;')}">${rankHTML}<span class="stat-flag">${s.flag||'🏳️'}</span><div class="stat-main"><div class="stat-name">${HOST.cName(s)}</div><div class="stat-sub">${subline}</div></div><div class="stat-val">${metricVal(s)}</div></div>`;
    });
    feed.innerHTML=html;
    feed.querySelectorAll('.stat-row').forEach(row=>{
      /* Single-click → add/remove from compare; double-click → open detail */
      let clickTimer=null;
      row.onclick=(e)=>{
        if(clickTimer){ clearTimeout(clickTimer); clickTimer=null; showCountryDetail(row.getAttribute('data-ccn')); return; }
        clickTimer=setTimeout(()=>{ window._toggleCompare(row.getAttribute('data-ccn')); clickTimer=null; },250);
      };
    });
    feed.style.paddingBottom='92px';   /* leave room for the fixed compare panel */
    HOST.renderCompareFixed();
  }

  /* The names index.html still calls: it keeps a hoisted shim for each (#R168). */
  return { renderStats, showCountryDetail, renderCountryDetailBody, loadCountryData, addCountryLayers };
};
