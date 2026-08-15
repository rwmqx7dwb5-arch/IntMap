/* ============================================================================
 *  IntMap · World data packs — trade, energy, warnings, tides, crops  (#R211)
 * ----------------------------------------------------------------------------
 *  Five layer families the round was asked for, in one file because they share the same three
 *  problems and it would be three copies of each otherwise: a floating panel, a country click, and
 *  a year that follows window.IntMapTime.
 *
 *  ══ EVERY NUMBER HERE IS FETCHED, NONE IS SHIPPED ═══════════════════════════════════════════════
 *  Standing instruction 4 (no placeholder data). Each source below was CORS-checked from a real
 *  request before it was wired — an endpoint that does not send Access-Control-Allow-Origin cannot
 *  be reached from the page at all, and half the plausible candidates for this data do not (UN
 *  Comtrade's public preview returns an empty body without a subscription key; World Bank WITS
 *  returns the right numbers with no ACAO header; FAOSTAT's API answers 401). What is used:
 *
 *    · TRADE       OEC / BACI (CEPII), api-v2.oec.world tesseract  — bilateral goods trade by
 *                  reporter × partner × HS section × year, 1995‑2024. ACAO *.
 *    · ENERGY      Our World in Data grapher CSVs (Ember + Energy Institute) — electricity mix by
 *                  source (%) and primary energy by source (TWh), per country per year. ACAO *.
 *    · WARNINGS    JMA bosai (Japan, real time, at the issuing unit) + NWS api.weather.gov (US,
 *                  real time, geometry included in the feed). Both ACAO *.
 *    · TIDES       Open-Meteo Marine — hourly sea-level height, global, keyless. ACAO *.
 *    · CROPS       Our World in Data key crop yields (FAO) — 11 crops, per country per year. ACAO *.
 *
 *  ⚠ AND WHERE THERE IS NO FEED, THE LAYER SAYS SO. The warnings layer covers the two countries
 *  whose agencies publish a real-time, browser-reachable feed. Tapping any other country says that
 *  in words rather than drawing an empty map that reads as "no warnings in force" — #R207's rule
 *  about the satellite catalogue ("a group with no list is omitted, not empty"), applied to alerts,
 *  where the difference is a safety claim.
 * ==========================================================================*/
window.IntMapModules=window.IntMapModules||{};
window.IntMapModules.worldPacks=function(HOST){
  const GE=()=>window.IntMapGeoEngine;
  function _imCanDraw(){ try{ return !!HOST.canDraw(); }catch(_){ try{ return !!GE().ready(); }catch(__){ return false; } } }

  window.IntMapWorld=(function(){
    if(!GE().hasRenderer()) return { state:()=>({}) };
    const L=window.IntMapLang.pick(()=>HOST.lang);
    /* ⚠ (#R241) the ARRAY form — see `pickArgs` in js/lang-registry.js. Five tables in this file
       held their translations as a bare tuple and subscripted it with a PRIVATE language→position
       map (`{jp:1,de:2,ru:3,es:4}`). That map is a second copy of the language order, it names a
       fixed set of languages, and an array literal is not a call — so every trade section, crop,
       GAEZ variable and panel title here was English on fr/ko/zh while every instrument read
       100 %. scripts/i18n-positional-array-audit.mjs found them and fails if the shape returns. */
    const LA=window.IntMapLang.pickArgs();
    const D=Math.PI/180;
    const esc=(s)=>{ try{ return HOST.escapeHtml(String(s==null?'':s)); }catch(_){ return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); } };

    /* ── the year every layer here reads ──────────────────────────────────────────────────────────
       ONE clock (#R94 standing rule: window.IntMapTime is the master). A layer that needs a year
       asks for it here and re-fetches when the kernel says the time moved, so 「タイムマシン対応」 is
       one subscription rather than five. */
    function nowYear(){ try{ const st=window.IntMapTime.state();
      const d=st.isLive?new Date():new Date(st.when); const y=d.getUTCFullYear();
      return isFinite(y)?y:new Date().getUTCFullYear(); }catch(_){ return new Date().getUTCFullYear(); } }
    const _timeSubs=[];
    try{ window.IntMapTime.on(()=>{ _timeSubs.forEach(f=>{ try{ f(nowYear()); }catch(_){} }); }); }catch(_){}
    const onYear=(f)=>_timeSubs.push(f);

    /* ── formatting: the compressed form AND the figure it was compressed from ────────────────────
       ⚠ 「ホバーでは必ず $12.4B のような実額を出す（見た目は圧縮しても値は一切加工しない）」 — so the
       hover shows BOTH. `usdShort` is for reading; `usdExact` is the number itself, grouped, with no
       rounding at all. Nothing in this file ever displays a normalised or rescaled value. */
    function usdShort(v){ const a=Math.abs(v);
      if(a>=1e12) return '$'+(v/1e12).toFixed(2)+'T';
      if(a>=1e9)  return '$'+(v/1e9).toFixed(1)+'B';
      if(a>=1e6)  return '$'+(v/1e6).toFixed(1)+'M';
      if(a>=1e3)  return '$'+(v/1e3).toFixed(1)+'k';
      return '$'+Math.round(v); }
    function usdExact(v){ return '$'+Math.round(v).toLocaleString('en-US'); }
    const pct=(v,d)=>(v==null||!isFinite(v))?'—':(Number(v).toFixed(d==null?1:d)+' %');

    /* ── a CSV reader that survives a quoted comma (OWID entity names have them) ─────────────────── */
    function parseCSV(text){
      const rows=[]; let row=[], cell='', q=false;
      for(let i=0;i<text.length;i++){ const c=text[i];
        if(q){ if(c==='"'){ if(text[i+1]==='"'){ cell+='"'; i++; } else q=false; } else cell+=c; }
        else if(c==='"') q=true;
        else if(c===','){ row.push(cell); cell=''; }
        else if(c==='\n'){ row.push(cell); cell=''; if(row.length>1||row[0]!=='') rows.push(row); row=[]; }
        else if(c!=='\r') cell+=c; }
      if(cell!==''||row.length){ row.push(cell); rows.push(row); }
      return rows; }
    const _csvCache=Object.create(null);
    async function owid(slug){
      if(_csvCache[slug]) return _csvCache[slug];
      _csvCache[slug]=(async()=>{
        const r=await fetch('https://ourworldindata.org/grapher/'+slug+'.csv?csvType=full&useColumnShortNames=true');
        if(!r.ok) throw new Error('owid '+slug+' '+r.status);      /* (#R183) no r.ok test = a silent 「—」 */
        const rows=parseCSV(await r.text());
        const head=rows.shift()||[];
        const iC=head.indexOf('code'), iY=head.indexOf('year');
        /* ISO3 → year → {column: value}. Aggregates (no `code`) are dropped: they are not countries. */
        const by=Object.create(null);
        for(const r2 of rows){ const c=(r2[iC]||'').trim(); if(c.length!==3) continue;
          const y=+r2[iY]; if(!isFinite(y)) continue;
          const o=(by[c]=by[c]||Object.create(null))[y]=Object.create(null);
          for(let k=0;k<head.length;k++){ if(k===iC||k===iY||head[k]==='entity') continue;
            const v=parseFloat(r2[k]); if(isFinite(v)) o[head[k]]=v; } }
        return { columns:head, by };
      })();
      return _csvCache[slug]; }

    /* ── country geometry: centroids and a point-in-polygon, from the ONE country dataset ─────────
       ⚠ countryGeo is NEVER re-broadcast as a second geojson source. #R166 recorded that MapLibre's
       worker serialiser overflows its stack when this FeatureCollection is handed to it again, and
       that fault is still live on this renderer. Choropleths therefore go through the existing
       `countries` source with setFeatureState, exactly as js/data-layers.js does. */
    const _cent=Object.create(null);
    function ringCentroid(ring){ let a=0,cx=0,cy=0;
      for(let i=0,j=ring.length-1;i<ring.length;j=i++){
        const f=ring[j][0]*ring[i][1]-ring[i][0]*ring[j][1];
        a+=f; cx+=(ring[j][0]+ring[i][0])*f; cy+=(ring[j][1]+ring[i][1])*f; }
      if(Math.abs(a)<1e-12){ const n=ring.length||1; let sx=0,sy=0; ring.forEach(p=>{ sx+=p[0]; sy+=p[1]; }); return [sx/n,sy/n]; }
      return [cx/(3*a), cy/(3*a)]; }
    function ringArea(ring){ let a=0;
      for(let i=0,j=ring.length-1;i<ring.length;j=i++) a+=(ring[j][0]-ring[i][0])*(ring[j][1]+ring[i][1]);
      return Math.abs(a/2); }
    function centroidOf(iso3){
      if(_cent[iso3]!==undefined) return _cent[iso3];
      const g=HOST.countryGeo; if(!g||!g.features) return null;
      const f=g.features.find(x=>String(x.id)===String(iso3)); if(!f||!f.geometry) return (_cent[iso3]=null);
      const polys=(f.geometry.type==='Polygon')?[f.geometry.coordinates]:(f.geometry.type==='MultiPolygon'?f.geometry.coordinates:[]);
      let best=null, bestA=-1;
      polys.forEach(p=>{ const r=p&&p[0]; if(!r||r.length<4) return; const a=ringArea(r); if(a>bestA){ bestA=a; best=r; } });
      return (_cent[iso3]=best?ringCentroid(best):null); }
    function ptInRing(pt,ring){ let inside=false;
      for(let i=0,j=ring.length-1;i<ring.length;j=i++){
        const xi=ring[i][0], yi=ring[i][1], xj=ring[j][0], yj=ring[j][1];
        if(((yi>pt[1])!==(yj>pt[1]))&&(pt[0]<(xj-xi)*(pt[1]-yi)/((yj-yi)||1e-15)+xi)) inside=!inside; }
      return inside; }
    function countryAt(lng,lat){
      const g=HOST.countryGeo; if(!g||!g.features) return null;
      for(const f of g.features){ const gm=f.geometry; if(!gm) continue;
        const polys=(gm.type==='Polygon')?[gm.coordinates]:(gm.type==='MultiPolygon'?gm.coordinates:[]);
        for(const p of polys){ if(!p||!p[0]) continue;
          if(!ptInRing([lng,lat],p[0])) continue;
          let hole=false; for(let h=1;h<p.length;h++) if(ptInRing([lng,lat],p[h])){ hole=true; break; }
          if(!hole) return String(f.id); } }
      return null; }
    function countryName(iso3){
      try{ const s=HOST.countryStats&&HOST.countryStats[iso3]; if(s) return HOST.cName(s); }catch(_){}
      try{ const f=HOST.countryGeo.features.find(x=>String(x.id)===String(iso3));
        const p=f&&f.properties; if(p) return p.NAME||p.name||p.ADMIN||iso3; }catch(_){}
      return iso3; }
    let _cgReady=null;
    function withCountryGeo(){ if(!_cgReady) _cgReady=Promise.resolve().then(()=>HOST.loadCountryData()).catch(()=>{}); return _cgReady; }
    /* the `countries` SOURCE (for feature-state choropleths) — the same wait js/data-layers.js does */
    function withCountrySource(){ return withCountryGeo().then(()=>new Promise(res=>{ let n=0;
      (function w(){ try{ if(GE().layers.hasSource('countries')&&HOST.countryGeo) return res(true); }catch(_){}
        try{ if(_imCanDraw()&&HOST.countryGeo&&!GE().layers.hasSource('countries')) HOST.addCountryLayers(); }catch(_){}
        if(n++<200) setTimeout(w,200); else res(false); })(); })); }
    /* ⚠ (#R212) 「なぜか国の塗が荒い。おかしい。国境線がおかしい。」 — AND IT WAS, BY DESIGN, FOR SOMEBODY
       ELSE. js/countries-ui.js boots on Natural Earth **110 m** so the Countries tab can list its rows
       without waiting on 4.3 MB, then pulls the 10 m outline on an idle and parks it in
       `window._imCountryGeoPending` — #R195 deliberately does NOT push that at the renderer unless a
       layer is about to draw it, because rebuilding 548,000 vertices for a hidden layer cost two CI
       runs. A choropleth IS that layer, so it asks for the flush: once now, and again while the
       upgrade is still in flight (it lands 4-15 s after boot, later on a phone). `_imFlushCountryGeo`
       is a no-op when nothing is pending, so the retry costs a function call. */
    /* ⚠ (#R216) `force` — the flush used to refuse unless the Countries(info) mode was on, so every
       choropleth here painted the 110 m stand-in for the whole session (measured). And because
       `setSourceData` CLEARS FEATURE STATE, a flush that succeeds after the colours are on wipes
       them: `after` is the family's own repaint, run once the fine geometry is actually in. */
    function hiResCountries(after){ let n=0;
      (function t(){ try{ if(window._imFlushCountryGeo&&window._imFlushCountryGeo(true)){ try{ after&&after(); }catch(_){} return; } }catch(_){}
        if(n++<14) setTimeout(t,1600); })(); }

    /* ── a great circle that does not wrap round the back of the world ───────────────────────────
       Two centroids 200° apart in raw longitude are 160° apart on the globe; drawn without
       unwrapping, MapLibre stretches the arc across every meridian in between. Each point is
       therefore shifted to within 180° of the one before it. */
    function greatCircle(a,b,n){
      const p1=[a[1]*D,a[0]*D], p2=[b[1]*D,b[0]*D];
      const dl=p2[1]-p1[1];
      const dd=2*Math.asin(Math.sqrt(Math.pow(Math.sin((p2[0]-p1[0])/2),2)+Math.cos(p1[0])*Math.cos(p2[0])*Math.pow(Math.sin(dl/2),2)));
      const out=[]; const N=Math.max(2,n||48);
      if(!(dd>1e-9)) return [a.slice(),b.slice()];
      for(let i=0;i<=N;i++){ const f=i/N;
        const A=Math.sin((1-f)*dd)/Math.sin(dd), B=Math.sin(f*dd)/Math.sin(dd);
        const x=A*Math.cos(p1[0])*Math.cos(p1[1])+B*Math.cos(p2[0])*Math.cos(p2[1]);
        const y=A*Math.cos(p1[0])*Math.sin(p1[1])+B*Math.cos(p2[0])*Math.sin(p2[1]);
        const z=A*Math.sin(p1[0])+B*Math.sin(p2[0]);
        out.push([Math.atan2(y,x)/D, Math.atan2(z,Math.hypot(x,y))/D]); }
      for(let i=1;i<out.length;i++){ while(out[i][0]-out[i-1][0]>180) out[i][0]-=360;
        while(out[i][0]-out[i-1][0]<-180) out[i][0]+=360; }
      return out; }

    /* ── one floating panel shape, used by all five ─────────────────────────────────────────────── */
    const BTN='padding:5px 8px;border-radius:8px;border:1px solid var(--glass-border,rgba(128,128,128,0.28));background:var(--input-bg);color:var(--text-main);font-size:11px;cursor:pointer;white-space:nowrap;';
    const SEL='height:26px;border-radius:7px;border:1px solid var(--glass-border,rgba(128,128,128,0.28));background:var(--input-bg);color:var(--text-main);font-size:12px;padding:0 6px;max-width:170px;';
    const ROW='font-size:11.5px;color:var(--text-muted);display:flex;justify-content:space-between;align-items:center;gap:8px;';
    /* ══ (#R212) CLOSING THE WINDOW TURNS THE LAYER OFF ════════════════════════════════════════════
       「レイヤー系で、ポップアップを消してもレイヤーは選択状態とかやめろ。連動させろ。」 The ✕ used to
       hide the panel and leave the row ticked, so the layer list claimed a layer was on while the only
       place its answer is shown had been dismissed — two switches for one thing, disagreeing. There is
       now one: ✕ drives the checkbox, the checkbox drives the layer. `uncheckRow` returns false when
       the row is already off, which is what lets `toggle(false)`'s own `panel.hide()` stay a no-op. */
    function uncheckRow(cbId){ try{ const cb=cbId&&document.getElementById(cbId);
      if(cb&&cb.checked){ cb.checked=false; cb.dispatchEvent(new Event('change',{bubbles:true})); return true; } }catch(_){}
      return false; }
    /* ══ (#R215) THE PANEL **IS** THE GENERIC LEGEND — THERE IS NO SECOND WINDOW ═══════════════════
       「いやなんで凡例とポップアップをわざわざ分割するねんあほか」／「いやだからなんで凡例とポップアップ
       分離にしとんねんふざけんな」／「いや汎用の凡例の方に統合させろ。余計な例外作んなぼけ」

       MEASURED on the built site: ticking Energy mix produced TWO floating things — `wp-energy-panel`
       (this file's own window: title, switch, ramp, the tapped country) and `data-legend-wpenergy`,
       the app's standard legend, whose entire contents were the words «Energy mix» and an opacity
       slider. Crops was the same pair. That is also why the report says the crop layer has no
       transparency control: the control existed, in the OTHER window.

       The answer is not a third arrangement. Every other layer in the app already has exactly one
       box — `.data-legend.generic-legend` from js/data-layers.js — with the drag grip, the ✕ that
       unchecks the layer row, the minimise button, the opacity slider and the "what is this data"
       line, all tiled by `tileLegends()`. These families now render INTO that box instead of beside
       it. Nothing about it is special-cased for them: `_registerLayerOpacity` builds it, the ✕ is
       its own (already wired to `dataset.cbId`), the slider is `ensureLegendOpacity`'s, and the
       family's controls go in a `.wp-body` right under the title.

       ⚠ `_registerLayerOpacity` must be called with the layer ids, and again when they change —
       for the raster families the layer does not exist until the first image lands, so `open()`
       takes a THUNK for the ids and re-registers on every render. */
    /* (#R245) `names()` returns what `IntMapLang.pickArgs()` returns — the tuple as an ARRAY, which
       is already this shape. The object form is kept for anything that has not been converted yet. */
    function panelNames(o){ return Array.isArray(o)?o:[o.en,o.jp||o.en,o.de||o.en,o.ru||o.en,o.es||o.en]; }
    function makePanel(id,title,cbId,opt){
      opt=opt||{};
      const LID=opt.legendId||id;                 /* the legend id === the opacity id (#R19) */
      const names=()=>{ try{ return opt.names?panelNames(opt.names()):[title(),title(),title(),title(),title()]; }catch(_){ return [id,id,id,id,id]; } };
      const layers=()=>{ try{ return (opt.layers?opt.layers():[])||[]; }catch(_){ return []; } };
      const legend=()=>document.getElementById('data-legend-'+LID);
      /* ══ ⚠⚠ (#R216) THE ✕ CLOSED IT AND THE LAYER PUT IT STRAIGHT BACK ═════════════════════════
         「貿易フローのポップアップを消しても、また出現して消せない。」 MEASURED: closing the trade
         legend runs toggle(false) → panel.hide() (synchronous, the box goes) → draw(), whose
         `withCountrySource().then(…)` continuation lands a moment later and calls `panel.claim()`.
         `claim()` is `_registerLayerOpacity`, and that function ENDS WITH `el.style.display='block'`
         — it is the toggle-ON entry point, so re-registering the layer ids also re-opens the box.
         The window therefore reappeared a few hundred milliseconds after every close, for ever.
         `_want` is this panel's own idea of whether it should be on screen; `claim()` restores it
         after re-registering, so re-declaring the opacity targets stays what it says it is. */
      let _want=false;
      const P={
        get el(){ return legend(); },
        open(bodyHTML){
          let el=null;
          _want=true;
          try{ el=window._registerLayerOpacity&&window._registerLayerOpacity(LID,names(),layers(),cbId); }catch(_){}
          if(!el) el=legend();
          if(!el) return null;
          el.style.display='block'; el.classList.add('wp-legend');
          let b=el.querySelector('.wp-body');
          if(!b){ b=document.createElement('div'); b.className='wp-body';
            const h=el.querySelector('h4');
            if(h&&h.parentNode===el) el.insertBefore(b,h.nextSibling); else el.appendChild(b); }
          b.innerHTML=bodyHTML;
          if(el.classList.contains('legend-collapsed')) b.style.display='none';
          try{ window._ensureLegendMinimize&&window._ensureLegendMinimize(el); }catch(_){}
          try{ window._tileLegends&&window._tileLegends(); }catch(_){}
          return b; },
        body(){ const el=legend(); return el?el.querySelector('.wp-body'):null; },
        /* re-register the ids once the layers actually exist (raster families build theirs late).
           ⚠ never a way to re-open a box the user closed — see the note on `_want` above. */
        claim(){ try{ window._registerLayerOpacity&&window._registerLayerOpacity(LID,names(),layers(),cbId); }catch(_){}
          if(!_want){ const el=legend(); if(el) el.style.display='none';
            try{ window._tileLegends&&window._tileLegends(); }catch(_){} } },
        hide(){ _want=false;
          try{ window._hideGenericLegend&&window._hideGenericLegend(LID); }catch(_){}
          const el=legend(); if(el) el.style.display='none'; },
        shown(){ const el=legend(); return !!(el&&el.style.display!=='none'&&el.style.display!==''); } };
      return P; }

    /* a colour-scale legend, so a choropleth says what its colours mean where the colours are.
       ⚠ (#R212) 「凡例あるくせに、一切記載がないから何の色で国々を塗っているのかわからない。」 — the
       stops here are the SAME array the paint expression is built from, never a second copy. */
    function rampLegend(stops,unit,note){
      const grad=stops.map((s,i)=>s[1]+' '+(i/(stops.length-1)*100).toFixed(1)+'%').join(',');
      return '<div style="margin-top:2px;">'
        +'<div style="height:11px;border-radius:4px;border:1px solid var(--glass-border,rgba(128,128,128,0.28));background:linear-gradient(90deg,'+grad+');"></div>'
        +'<div style="display:flex;justify-content:space-between;font-size:9.5px;color:var(--text-muted);margin-top:2px;">'
        +stops.map(s=>'<span>'+esc(s[0])+'</span>').join('')+'</div>'
        +'<div style="font-size:9.5px;color:var(--text-muted);margin-top:1px;">'+esc(unit||'')
        +'<span style="display:inline-flex;align-items:center;gap:4px;margin-left:8px;"><span style="width:9px;height:9px;border-radius:2px;background:#9aa0a6;opacity:.5;"></span>'
        +L('no data','データなし','keine Daten','нет данных','sin datos')+'</span></div>'
        +(note?('<div style="font-size:9.5px;color:var(--text-muted);margin-top:1px;">'+esc(note)+'</div>'):'')+'</div>'; }

    /* the layer rows all five families add, under one heading */
    function ensureHead(){ const dd=document.getElementById('layer-dropdown'); if(!dd) return null;
      if(!document.getElementById('wp-head')){ const h=document.createElement('div'); h.className='lyr-head'; h.id='wp-head';
        h.textContent=L('World data','世界のデータ','Weltdaten','Мировые данные','Datos mundiales'); dd.appendChild(h); }
      return dd; }
    function row(dd,id,label,sw){ if(document.getElementById(id)) return document.getElementById(id);
      const w=document.createElement('div'); w.className='lyr-row';
      w.innerHTML='<label class="layer-option"><input type="checkbox" id="'+id+'"> <span class="lyr-sw" style="background:'+sw+'"></span> <span id="'+id+'-lbl">'+label+'</span></label>';
      dd.appendChild(w); return w.querySelector('input'); }
    const setVis=(ids,on)=>ids.forEach(l=>{ try{ if(GE().layers.has(l)) GE().layers.setLayout(l,'visibility',on?'visible':'none'); }catch(_){} });
    /* ⚠ ADDING A LAYER CAN BE REFUSED, AND A REFUSAL THAT IS NOT RETRIED IS A FEATURE THAT SILENTLY
       DOES NOT EXIST. `addSource` throws «Style is not done loading» whenever the renderer has not
       finished parsing — which is most of the time while the user is panning (#R170) and always
       while the page is not being composited. Every pack in this app therefore retries rather than
       calling ensure() once; this is that retry, plus the `styledata` re-apply a basemap swap needs
       (a style change drops layers, and #R72 records what happens when nothing puts them back). */
    function whenDrawable(fn,tries){ tries=(tries==null)?80:tries;
      (function t(){ if(_imCanDraw()){ try{ fn(); }catch(e){ console.warn('worldPacks draw',e); } return; }
        if(--tries<=0) return; setTimeout(t,250); })(); }
    const _restyle=[];
    const onRestyle=(fn)=>_restyle.push(fn);
    try{ GE().events.on('styledata',()=>setTimeout(()=>_restyle.forEach(f=>{ try{ f(); }catch(_){} }),80)); }catch(_){}

    /* ⚠ (#R210) A MAP-LEVEL CLICK HANDLER MUST CLAIM AND MUST ASK. Every family below hit-tests the
       country polygons itself, so it appears in no layer registry — exactly the class of owner that
       #R210 found stealing the place-label tap. It claims the DOM event when it consumes one, and
       does nothing when somebody else already has. */
    function mapClick(fn){ GE().events.on('click',e=>{
      try{ if(GE().events.clickClaimed&&GE().events.clickClaimed(e)) return; }catch(_){}
      const used=fn(e); if(used){ try{ GE().events.claimClick&&GE().events.claimClick(e); }catch(_){} } }); }

    const STATE={};

    /* ══════════════════════════════════════════════════════════════════════════════════════════════
     *  1 · TRADE FLOWS — who a country trades with, and for how much
     * ----------------------------------------------------------------------------------------------
     *  「国をクリックで相手国別の輸出入を額に応じた太さで。⚠線幅は完全な線形比例にしない（対数か方根）、
     *    ホバーでは必ず $12.4B のような実額を出す（見た目は圧縮しても値は一切加工しない）。」
     *
     *  ⚠ WHY THE WIDTH IS A SQUARE ROOT AND NOT A LOGARITHM OR A PROPORTION. A country's largest
     *  partner is routinely 500× its hundredth: linear widths make everything below the top three
     *  invisible, and a logarithm makes a $200 M flow look like a third of a $200 B one, which is a
     *  lie in the other direction. √ is the flow-map convention because the eye compares AREA, and a
     *  stroke's area is width × length. It is stated in the legend, and the exact dollars are one
     *  hover away — the picture is compressed, the number never is.
     * ════════════════════════════════════════════════════════════════════════════════════════════*/
    (function trade(){
      const SRC='wp-trade', LYR=['wp-trade-arc','wp-trade-arrow','wp-trade-pt','wp-trade-lbl'];
      /* BACI HS revisions, newest first — one cube covers 1995‑2024 and the newer ones are finer */
      const CUBE=(y)=>(y>=2022?'trade_i_baci_a_22':y>=2018?'trade_i_baci_a_17':y>=2012?'trade_i_baci_a_12':y>=2008?'trade_i_baci_a_07':y>=2003?'trade_i_baci_a_02':'trade_i_baci_a_92');
      const YMIN=1995, YMAX=2024;
      const SECTIONS=[['',LA('All goods','すべての品目','Alle Waren','Все товары','Todos los bienes')],
        ['01',LA('Animal products','動物性生産品','Tierische Erzeugnisse','Продукция животноводства','Productos animales')],
        ['02',LA('Vegetable products','植物性生産品','Pflanzliche Erzeugnisse','Продукция растениеводства','Productos vegetales')],
        ['04',LA('Foodstuffs','調製食料品','Lebensmittel','Пищевые продукты','Alimentos')],
        ['05',LA('Mineral products','鉱物性生産品','Mineralische Stoffe','Минеральные продукты','Productos minerales')],
        ['06',LA('Chemicals','化学工業生産品','Chemische Erzeugnisse','Химическая продукция','Productos químicos')],
        ['07',LA('Plastics & rubber','プラスチック・ゴム','Kunststoffe & Gummi','Пластмассы и каучук','Plásticos y caucho')],
        ['11',LA('Textiles','紡織用繊維','Textilien','Текстиль','Textiles')],
        ['14',LA('Precious metals','貴金属','Edelmetalle','Драгоценные металлы','Metales preciosos')],
        ['15',LA('Metals','卑金属','Unedle Metalle','Металлы','Metales')],
        ['16',LA('Machines','機械類','Maschinen','Машины','Máquinas')],
        ['17',LA('Transportation','輸送機器','Fahrzeuge','Транспорт','Transporte')],
        ['18',LA('Instruments','光学・精密機器','Instrumente','Приборы','Instrumentos')],
        ['19',LA('Arms','武器','Waffen','Оружие','Armas')]];
      const secLabel=(s)=>{ const r=SECTIONS.find(x=>x[0]===s); return r?L.arr(r[1]):s; };
      let on=false, dir='X', section='', topN=15, iso=null, rows=null, year=null, busy=false, pop=null;
      const panel=makePanel('wp-trade-panel',()=>'🚢 '+L('Trade flows','貿易フロー','Handelsströme','Торговые потоки','Flujos comerciales'),'wp-dl-trade',
        { legendId:'wptrade', layers:()=>['wp-trade-fill'].concat(LYR),
          names:()=>(LA('🚢 Trade flows','🚢 貿易フロー','🚢 Handelsströme','🚢 Торговые потоки','🚢 Flujos comerciales')) });

      /* ══ (#R212) THEY ARE ARROWS. 「いや矢印って言ってんだろうが。」 ═══════════════════════════════
         A trade flow has a direction and a bare line does not carry one. Two flat-coloured icons
         (one per direction) are registered once and placed ALONG the arc by the renderer, which
         orients each to the local heading — so the picture reads the way the goods move. The arc's
         own coordinate order is the flow: exports run home → partner, imports partner → home, and
         reversing the array is what makes every arrowhead point the right way at once.
         ⚠ Two plain images rather than one SDF: `icon-color` only applies to SDF sprites, and an SDF
         built from a hard-edged triangle is a blurred triangle. Two images cost nothing. */
      const ARROW={X:'#ff9f0a',M:'#32d0ff'};
      function arrowImg(hex){ const S=22, c=document.createElement('canvas'); c.width=c.height=S;
        const g=c.getContext('2d'); g.fillStyle=hex;
        g.beginPath(); g.moveTo(S*0.86,S*0.5); g.lineTo(S*0.20,S*0.14); g.lineTo(S*0.36,S*0.5); g.lineTo(S*0.20,S*0.86); g.closePath(); g.fill();
        return g.getImageData(0,0,S,S); }
      function ensureArrows(){ try{ Object.keys(ARROW).forEach(k=>{ const id='wp-arrow-'+k;
        if(!GE().layers.hasImage(id)) GE().layers.addImage(id,arrowImg(ARROW[k]),{pixelRatio:2}); }); }catch(_){} }

      /* ══ (#R215) 「貿易レイヤーは該当国がぬられるように」 — AND NO COUNTRY WAS PAINTED AT ALL ══════
         The layer drew arcs, arrowheads, partner dots and their labels; the countries themselves were
         never shaded, so the instruction was simply not implemented. It is one choropleth on the SAME
         `countries` source every other country layer in this app uses (js/countries-ui.js's 10 m
         outline — the 「いつもの国境線」), driven by feature-state:

             wpTrade  = this partner's share of the selected country's total, in %  (0 → not a partner)
             wpTradeH = 1 on the country the flows belong to, so home reads as home and not as a partner

         The share is what the ramp can honestly carry: absolute dollars span six orders of magnitude
         between the largest partner and the smallest, and a colour scale over that says nothing.
         The exact figure is still one hover away on the arc, and the panel prints both (#R213). */
      const CHORO='wp-trade-fill';
      const TRADE_RAMP=[[0.2,'#fff3d6'],[1,'#ffd591'],[4,'#ffab40'],[12,'#ff7043'],[30,'#d84315']];
      function ensureChoro(){ if(GE().layers.has(CHORO)) return true;
        if(!_imCanDraw()||!GE().layers.hasSource('countries')) return false;
        const ramp=['interpolate',['linear'],['to-number',['feature-state','wpTrade'],0]]
          .concat(TRADE_RAMP.reduce((a,x)=>a.concat([x[0],x[1]]),[]));
        try{ GE().layers.add({id:CHORO,type:'fill',source:'countries',layout:{visibility:'none'},
          paint:{'fill-color':['case',['==',['to-number',['feature-state','wpTradeH'],0],1],'#ffffff',
                                ['<=',['to-number',['feature-state','wpTrade'],0],0],'rgba(0,0,0,0)',ramp],
                 'fill-opacity':0.55}},
          GE().layers.has('wp-trade-arc')?'wp-trade-arc':(GE().layers.has('tool-poly')?'tool-poly':undefined)); }
        catch(_){ return false; }
        return true; }
      let _painted=[];
      function paintCountries(){
        if(!GE().layers.hasSource('countries')) return;
        _painted.forEach(id=>{ try{ GE().layers.setFeatureState({source:'countries',id},{wpTrade:0,wpTradeH:0}); }catch(_){} });
        _painted=[];
        if(!(on&&rows&&rows.length&&iso)) return;
        const tot=rows.reduce((a,d)=>a+d.v,0)||1;
        const list=(topN>=999)?rows:rows.slice(0,topN);
        list.forEach(d=>{ try{ GE().layers.setFeatureState({source:'countries',id:d.iso},{wpTrade:d.v/tot*100,wpTradeH:0}); _painted.push(d.iso); }catch(_){} });
        try{ GE().layers.setFeatureState({source:'countries',id:iso},{wpTrade:0,wpTradeH:1}); _painted.push(iso); }catch(_){} }
      function ensureLayers(){ if(!_imCanDraw()) return false; try{
        if(!GE().layers.hasSource(SRC)) GE().layers.addSource(SRC,{type:'geojson',data:{type:'FeatureCollection',features:[]}});
        ensureArrows();
        if(!GE().layers.has('wp-trade-arc')) GE().layers.add({id:'wp-trade-arc',type:'line',source:SRC,filter:['==',['get','kind'],'arc'],
          layout:{visibility:'none','line-cap':'round','line-join':'round'},
          paint:{'line-color':['get','col'],'line-width':['get','w'],'line-opacity':0.78,'line-blur':0.3}});
        if(!GE().layers.has('wp-trade-arrow')) GE().layers.add({id:'wp-trade-arrow',type:'symbol',source:SRC,filter:['==',['get','kind'],'arc'],
          layout:{visibility:'none','symbol-placement':'line','symbol-spacing':92,'icon-image':['get','ai'],
            'icon-size':['get','asz'],'icon-rotation-alignment':'map','icon-allow-overlap':true,'icon-ignore-placement':true,'icon-padding':0},
          paint:{'icon-opacity':0.95}});
        if(!GE().layers.has('wp-trade-pt')) GE().layers.add({id:'wp-trade-pt',type:'circle',source:SRC,filter:['==',['get','kind'],'node'],
          layout:{visibility:'none'},
          paint:{'circle-radius':['get','r'],'circle-color':['get','col'],'circle-stroke-color':'rgba(0,0,0,0.55)','circle-stroke-width':1,'circle-opacity':0.9}});
        if(!GE().layers.has('wp-trade-lbl')) GE().layers.add({id:'wp-trade-lbl',type:'symbol',source:SRC,filter:['==',['get','kind'],'node'],
          layout:{visibility:'none','text-field':['get','name'],'text-size':window.IntMapLabelScale.sub(0.86),'text-offset':[0,1.05],'text-anchor':'top','text-allow-overlap':false},
          paint:{'text-color':'#eaf2ff','text-halo-color':'rgba(0,10,25,0.85)','text-halo-width':1.4}});
        return true; }catch(_){ return false; } }

      async function fetchTrade(code,y,sec,flow){
        const lvl=(flow==='X')?'Importer Country Official':'Exporter Country Official';
        const fix=(flow==='X')?'Exporter Country Official':'Importer Country Official';
        let u='https://api-v2.oec.world/tesseract/data.jsonrecords?cube='+CUBE(y)
          +'&drilldowns='+encodeURIComponent(lvl)+'&measures='+encodeURIComponent('Trade Value')
          +'&'+encodeURIComponent(fix)+'='+code.toLowerCase()+'&Year='+y;
        if(sec) u+='&'+encodeURIComponent('Section Official')+'='+sec;
        const r=await fetch(u);
        if(!r.ok) throw new Error('oec '+r.status);
        const j=await r.json();
        return (j.data||[]).map(d=>({ iso:String(d[lvl+' ID']||'').toUpperCase(), name:d[lvl], v:+d['Trade Value']||0 }))
          .filter(d=>d.iso.length===3&&d.v>0).sort((a,b)=>b.v-a.v); }

      function draw(){
        const feats=[];
        if(rows&&rows.length&&iso){
          const home=centroidOf(iso);
          const list=(topN>=999)?rows:rows.slice(0,topN);
          const vmax=list.length?list[0].v:1;
          const col=(dir==='X')?'#ff9f0a':'#32d0ff';
          if(home){
            list.forEach(d=>{ const c=centroidOf(d.iso); if(!c) return;
              /* ⚠ √ of the SHARE, not of the raw dollars — see the header note. 1.2 px is the
                 thinnest stroke that still reads at z2; 13 px is set by the widest partner. */
              const w=1.2+11.8*Math.sqrt(Math.max(0,d.v)/Math.max(1,vmax));
              /* the arc IS the direction: exports leave home, imports arrive at it (#R212) */
              const line=(dir==='X')?greatCircle(home,c,56):greatCircle(c,home,56);
              feats.push({type:'Feature',geometry:{type:'LineString',coordinates:line},
                properties:{kind:'arc',col,w,v:d.v,iso:d.iso,name:d.name,
                  ai:'wp-arrow-'+dir, asz:Math.max(0.34,Math.min(0.92,0.30+0.62*Math.sqrt(Math.max(0,d.v)/Math.max(1,vmax)))),
                  vShort:usdShort(d.v),vExact:usdExact(d.v)}});
              feats.push({type:'Feature',geometry:{type:'Point',coordinates:c},
                properties:{kind:'node',col,r:2.5+5.5*Math.sqrt(Math.max(0,d.v)/Math.max(1,vmax)),name:d.name,
                  v:d.v,vShort:usdShort(d.v),vExact:usdExact(d.v)}}); });
            feats.push({type:'Feature',geometry:{type:'Point',coordinates:home},
              properties:{kind:'node',col:'#ffffff',r:7,name:countryName(iso),v:0,vShort:'',vExact:''}});
          }
        }
        whenDrawable(()=>{ if(ensureLayers()){ GE().layers.setSourceData(SRC,{type:'FeatureCollection',features:feats}); setVis(LYR,on); }
          withCountrySource().then(()=>{ try{ if(window._imFlushCountryGeo) window._imFlushCountryGeo(true); }catch(_){}
            if(ensureChoro()){ paintCountries(); setVis([CHORO],on); panel.claim(); } }); }); }

      function render(){
        if(!panel.shown()&&!on) return;
        const y=year||nowYear();
        const b=panel.open(
          '<div style="display:flex;gap:5px;">'
            +'<button class="wp-x" style="'+BTN+'flex:1;">'+L('Exports','輸出','Ausfuhr','Экспорт','Exportaciones')+'</button>'
            +'<button class="wp-m" style="'+BTN+'flex:1;">'+L('Imports','輸入','Einfuhr','Импорт','Importaciones')+'</button></div>'
          +'<label style="'+ROW+'">'+L('Commodity','品目','Warengruppe','Товарная группа','Producto')
            +'<select class="wp-sec" style="'+SEL+'">'+SECTIONS.map(s=>'<option value="'+s[0]+'"'+(s[0]===section?' selected':'')+'>'+esc(secLabel(s[0]))+'</option>').join('')+'</select></label>'
          +'<div style="'+ROW+'">'+L('Partners shown','表示する相手国','Angezeigte Partner','Показано партнёров','Socios mostrados')
            +'<span style="display:flex;gap:4px;">'+[10,20,999].map(n=>'<button class="wp-n" data-n="'+n+'" style="'+BTN+'padding:4px 7px;">'+(n>=999?L('All','すべて','Alle','Все','Todos'):n)+'</button>').join('')+'</span></div>'
          +rampLegend(TRADE_RAMP.map(x=>[x[0]+'%',x[1]]),
              L('Share of the selected country’s total trade (the white country is the one selected)',
                '選択した国の貿易額全体に占める割合（白い国が選択中の国）',
                'Anteil am Gesamthandel des gewählten Landes','Доля в общей торговле выбранной страны','Cuota del comercio total del país elegido'))
          +'<div class="wp-stat" style="font-size:11.5px;color:var(--text-main);line-height:1.55;min-height:16px;"></div>'
          +'<div class="wp-list" style="font-size:11.5px;color:var(--text-main);"></div>'
          +'<div style="font-size:9.5px;color:var(--text-muted);line-height:1.5;">'
          +L('Line width is proportional to the SQUARE ROOT of the value (a flow-map convention — the eye compares area, and a stroke’s area is width × length). Hover any arc for the exact figure; nothing here rescales the amounts. Source: BACI (CEPII) via OEC, HS 6-digit, year ',
             '線の太さは金額の平方根に比例します（流動図の慣例。目は面積を比べるため、線の面積は幅×長さ）。実額は円弧にホバーすると出ます。表示は圧縮しても金額そのものは一切加工していません。出典: BACI (CEPII) / OEC、HS6桁、',
             'Die Linienbreite folgt der QUADRATWURZEL des Werts. Genaue Zahl beim Hover. Quelle: BACI (CEPII) via OEC, ',
             'Ширина линии пропорциональна КОРНЮ из суммы. Точная цифра — при наведении. Источник: BACI (CEPII) / OEC, ',
             'El ancho sigue la RAÍZ CUADRADA del valor. Cifra exacta al pasar el cursor. Fuente: BACI (CEPII) vía OEC, ')
          +y+(y<YMIN||y>YMAX?(' → '+Math.max(YMIN,Math.min(YMAX,y))):'')+'.</div>');
        const mark=(sel,active)=>b.querySelectorAll(sel).forEach(x=>{ const a=active(x);
          x.style.background=a?'var(--primary-color)':'var(--input-bg)'; x.style.color=a?'#fff':'var(--text-main)'; });
        mark('.wp-x',()=>dir==='X'); mark('.wp-m',()=>dir==='M');
        mark('.wp-n',(x)=>+x.getAttribute('data-n')===topN);
        /* ══ ⚠ (#R218) THE SEGMENT THAT NEVER RE-LIT ═══════════════════════════════════════════════
           「貿易フローのポップアップで、輸出入を切り替えても、色が変わらず、選択中かわからない。」
           `mark()` above paints the selected segment — but it only ever runs from `render()`, and
           these two handlers called `load()`, which draws the map and rewrites the figures without
           rebuilding the panel. So `dir` changed, the arcs flipped, the totals changed, and the two
           buttons stayed exactly as they were. (The `.wp-n` handlers three lines down already call
           `render()`, which is why THAT segment has always lit correctly — the same control written
           twice, one of them missing a line.)
           ⚠ `render()` comes FIRST, and not only for tidiness: with no country selected `load(null)`
           returns on its first line, so a re-mark that waited for the load would never happen at all
           and pressing 輸出 / 輸入 before tapping a country would do nothing visible. */
        b.querySelector('.wp-x').onclick=()=>{ dir='X'; render(); load(iso,true); };
        b.querySelector('.wp-m').onclick=()=>{ dir='M'; render(); load(iso,true); };
        b.querySelector('.wp-sec').onchange=(e)=>{ section=e.target.value; load(iso,true); };
        b.querySelectorAll('.wp-n').forEach(x=>x.onclick=()=>{ topN=+x.getAttribute('data-n'); draw(); render(); });
        stat(); }

      function stat(){ const b=panel.body(); if(!b) return;
        const s=b.querySelector('.wp-stat'), l=b.querySelector('.wp-list'); if(!s) return;
        if(busy){ s.textContent=L('Loading trade data…','貿易データを取得中…','Handelsdaten werden geladen…','Загрузка данных…','Cargando datos…'); if(l) l.innerHTML=''; return; }
        if(!iso){ s.textContent=L('Tap a country on the map.','地図で国をタップしてください。','Land auf der Karte antippen.','Нажмите страну на карте.','Toque un país en el mapa.'); if(l) l.innerHTML=''; return; }
        if(!rows){ s.textContent='⚠ '+L('No data for this country and year.','この国・この年のデータがありません。','Keine Daten.','Нет данных.','Sin datos.'); if(l) l.innerHTML=''; return; }
        const tot=rows.reduce((a,d)=>a+d.v,0);
        s.innerHTML='<b>'+esc(countryName(iso))+'</b> · '+(dir==='X'?L('exports','輸出','Ausfuhr','экспорт','exportaciones'):L('imports','輸入','Einfuhr','импорт','importaciones'))
          +' '+usdShort(tot)+' <span style="opacity:.7;">('+usdExact(tot)+')</span> · '+rows.length+' '+L('partners','か国・地域','Partner','партнёров','socios');
        const list=(topN>=999)?rows.slice(0,60):rows.slice(0,topN);
        if(l) l.innerHTML=list.map((d,i)=>'<div style="display:flex;justify-content:space-between;gap:8px;padding:2px 0;border-bottom:1px solid var(--glass-border,rgba(128,128,128,0.16));">'
          +'<span>'+(i+1)+'. '+esc(d.name)+'</span><span style="white-space:nowrap;"><b>'+usdShort(d.v)+'</b> <span style="opacity:.65;">'+pct(d.v/Math.max(1,tot)*100)+'</span></span></div>').join('')
          +((topN>=999&&rows.length>60)?('<div style="opacity:.7;padding-top:4px;">+'+(rows.length-60)+' '+L('more (all are drawn on the map)','件（地図にはすべて描画されています）','weitere','ещё','más')+'</div>'):''); }

      async function load(code,force){
        if(!code) return;
        const y=Math.max(YMIN,Math.min(YMAX,nowYear()));
        if(!force&&iso===code&&year===y) return;
        iso=code; year=y; busy=true; rows=null; draw(); stat();
        try{ rows=await fetchTrade(code,y,section,dir); }
        catch(e){ rows=null; try{ HOST.imToast(L('Trade data could not be fetched.','貿易データを取得できませんでした。','Handelsdaten nicht abrufbar.','Не удалось получить данные.','No se pudieron obtener los datos.')); }catch(_){} }
        busy=false; draw(); stat(); }

      /* hover: the compact figure AND the exact one — never a rescaled number */
      let wired=false;
      function wire(){ if(wired) return; wired=true;
        ['wp-trade-arc','wp-trade-pt'].forEach(id=>{
          GE().events.onLayer('mousemove',id,e=>{ if(!on||!e.features.length) return;
            const p=e.features[0].properties; if(!p||!p.vShort) return;
            const el=HOST.ensureMapTooltip(); el.style.display='block';
            el.innerHTML='<div style="font-weight:600;font-size:13px;">'+esc(p.name)+'</div>'
              +'<div style="margin-top:4px;font-size:15px;font-weight:700;color:var(--text-main);">'+esc(p.vShort)+'</div>'
              +'<div style="font-size:11px;color:var(--text-muted);">'+esc(p.vExact)+'</div>';
            HOST.positionTooltip(e.point); });
          GE().events.onLayer('mouseleave',id,()=>{ if(HOST.mapTooltipEl) HOST.mapTooltipEl.style.display='none'; }); }); }

      function toggle(v){ on=v;
        if(!on){ panel.hide(); draw(); setVis([CHORO],false); return; }
        whenDrawable(()=>{ if(ensureLayers()) wire(); draw(); }); render(); hiResCountries(()=>{ if(on) draw(); });
        withCountryGeo().then(()=>{ if(on&&iso) load(iso,true); });
        try{ HOST.imToast(L('Tap a country to see who it trades with.','国をタップすると相手国別の貿易が出ます。','Land antippen.','Нажмите страну.','Toque un país.')); }catch(_){} }
      STATE.trade=()=>({ on, dir, section, topN, iso, year, partners:rows?rows.length:0,
        top:rows?rows.slice(0,3).map(d=>({iso:d.iso,v:d.v})):[] });
      STATE.tradeLoad=(code,o)=>{ o=o||{}; if(o.dir) dir=(o.dir==='M'||o.dir==='imports')?'M':'X';
        if(o.section!=null) section=String(o.section); if(o.topN) topN=+o.topN;
        return load(String(code||'').toUpperCase(),true); };
      STATE.tradeToggle=(v)=>{ const cb=document.getElementById('wp-dl-trade'); if(cb){ cb.checked=!!v; cb.dispatchEvent(new Event('change',{bubbles:true})); } else toggle(!!v); return !!v; };

      /* a basemap swap drops every added layer — put them back if this one is on (#R72) */
      onRestyle(()=>{ if(on) whenDrawable(()=>{ if(ensureLayers()) draw(); }); });
      mapClick((e)=>{ if(!on) return false;
        const c=countryAt(e.lngLat.lng,e.lngLat.lat); if(!c) return false;
        load(c,true); if(!panel.shown()) render(); return true; });
      onYear(()=>{ if(on&&iso) load(iso,true); });

      window.__wpTrade={ toggle, render, panel };
    })();

    /* ══════════════════════════════════════════════════════════════════════════════════════════════
     *  2 · ELECTRICITY MIX and PRIMARY ENERGY MIX — per country, with the composition bar
     * ----------------------------------------------------------------------------------------------
     *  「電力構成レイヤー / エネルギー源組成レイヤー — 各国。どちらも組成の棒グラフ付き。」
     *  ⚠ (#R212) 「ポップアップは共用なのにレイヤーとしての扱いは別とかなんやねん。じゃあもう同じ
     *  レイヤーで、両者を切り替えるという形にしろ。」 — they WERE one machine with one window and two
     *  checkboxes, which is the worst of both: ticking the second row silently retargeted the first
     *  row's window. Now it is ONE row and the switch lives inside the window, where the answer is.
     *  The map carries the single number that ranks countries (the low-carbon share of electricity /
     *  the fossil share of primary energy); the composition itself is a stacked bar, because a mix of
     *  nine sources is not a colour. Both follow the time machine — the CSVs are per year, so
     *  travelling to 1990 redraws the same map from that year's rows rather than interpolating.
     *  ⚠ AND THE RAMP IS PUBLISHED. The legend below is built from ENERGY_RAMP, the same array the
     *  paint expression is built from — 「凡例あるくせに一切記載がない」 was a legend with no numbers.
     * ════════════════════════════════════════════════════════════════════════════════════════════*/
    /* pure data, at the factory's top level on purpose (#R211: a ramp declared inside the builder is
       null for whoever runs before the builder, and the fallback is a flat single colour) */
    const ENERGY_RAMP={
      elec:[[0,'#7f0000'],[20,'#e34a33'],[40,'#fdbb84'],[60,'#a6d96a'],[80,'#1a9850'],[100,'#00602a']],
      prim:[[0,'#00602a'],[25,'#a6d96a'],[50,'#fdbb84'],[75,'#e34a33'],[100,'#7f0000']] };
    (function energy(){
      const SRCS={
        elec:{ slug:'share-elec-by-source', unit:'%',
          parts:[['coal_share_of_electricity__pct','Coal','石炭','#6b6b6b'],
                 ['gas_share_of_electricity__pct','Gas','ガス','#c78a4b'],
                 ['oil_share_of_electricity__pct','Oil','石油','#8b5a3c'],
                 ['nuclear_share_of_electricity__pct','Nuclear','原子力','#b455ff'],
                 ['hydro_share_of_electricity__pct','Hydro','水力','#2f7fe0'],
                 ['wind_share_of_electricity__pct','Wind','風力','#3fd1c7'],
                 ['solar_share_of_electricity__pct','Solar','太陽光','#ffd23f'],
                 ['bioenergy_share_of_electricity__pct','Bioenergy','バイオ','#7cb342'],
                 ['other_renewables_excluding_bioenergy_share_of_electricity__pct','Other renewables','その他再エネ','#26a69a']],
          clean:['nuclear_share_of_electricity__pct','hydro_share_of_electricity__pct','wind_share_of_electricity__pct','solar_share_of_electricity__pct','bioenergy_share_of_electricity__pct','other_renewables_excluding_bioenergy_share_of_electricity__pct'] },
        prim:{ slug:'primary-energy-source-bar', unit:'TWh',
          parts:[['coal_twh','Coal','石炭','#6b6b6b'],['oil_twh','Oil','石油','#8b5a3c'],['gas_twh','Gas','ガス','#c78a4b'],
                 ['nuclear_twh','Nuclear','原子力','#b455ff'],['hydro_twh','Hydro','水力','#2f7fe0'],
                 ['wind_twh','Wind','風力','#3fd1c7'],['solar_twh','Solar','太陽光','#ffd23f'],
                 ['other_renewables_twh','Other renewables','その他再エネ','#26a69a']],
          clean:['nuclear_twh','hydro_twh','wind_twh','solar_twh','other_renewables_twh'] } };
      let on=false, iso=null, kind='elec';
      const panel=makePanel('wp-energy-panel',()=>'⚡ '+L('Energy mix','エネルギー構成','Energiemix','Энергобаланс','Mezcla energética'),'wp-dl-energy',
        { legendId:'wpenergy', layers:()=>[fillId('elec'),fillId('prim')],
          names:()=>(LA('⚡ Energy mix','⚡ エネルギー構成','⚡ Energiemix','⚡ Энергобаланс','⚡ Mezcla energética')) });
      const partName=(p)=>HOST.lang==='jp'?p[2]:p[1];

      function fillId(k){ return 'wp-'+k+'-fill'; }
      function ensureChoro(k){ const id=fillId(k); if(GE().layers.has(id)) return true; if(!_imCanDraw()||!GE().layers.hasSource('countries')) return false;
        const key=(k==='elec')?'wpElec':'wpPrim';
        const ramp=['interpolate',['linear'],['to-number',['feature-state',key],-1]]
          .concat(ENERGY_RAMP[k].reduce((a,s)=>a.concat([s[0],s[1]]),[]));
        const noData=['<=',['to-number',['feature-state',key],0],0];
        /* ⚠ (#R215) NO-DATA IS A COLOUR HERE, NOT AN OPACITY. The fill-opacity used to be
           `['case', no-data, 0.18, 0.55]`, which meant the shared opacity slider (one control for
           every layer in the app) could not own this property without deleting the distinction.
           Grey #9aa0a6 already says «no data» and the legend prints that swatch, so the case moves
           into the colour and `fill-opacity` becomes an ordinary number the slider can set. */
        try{ GE().layers.add({id,type:'fill',source:'countries',layout:{visibility:'none'},
          paint:{'fill-color':['case',noData,'#9aa0a6',ramp],'fill-opacity':0.55}},
          GE().layers.has('tool-poly')?'tool-poly':undefined); }catch(_){ return false; }
        return true; }

      async function apply(k){
        const cfg=SRCS[k]; const data=await owid(cfg.slug);
        const y=nowYear(); const key=(k==='elec')?'wpElec':'wpPrim';
        if(!HOST.countryGeo) return;
        let n=0;
        HOST.countryGeo.features.forEach(f=>{ const c=String(f.id||''); if(!c) return;
          const rec=pick(data,c,y);
          let v=-1;
          if(rec){ let tot=0, cl=0;
            cfg.parts.forEach(p=>{ const x=rec[p[0]]; if(isFinite(x)&&x>0){ tot+=x; if(cfg.clean.indexOf(p[0])>=0) cl+=x; } });
            if(tot>0) v=(k==='elec')?(cl/tot*100):((tot-cl)/tot*100); }
          try{ GE().layers.setFeatureState({source:'countries',id:f.id},{[key]:(v>0?v:-1)}); }catch(_){}
          if(v>0) n++; });
        if(!n) console.warn('worldPacks energy: no country matched',k); }

      /* the row for (country, year) — or the newest year at or before it, so travelling to a year a
         country has no row for shows the last real observation instead of a blank */
      function pick(data,c,y){ const by=data.by[c]; if(!by) return null;
        if(by[y]) return by[y];
        let best=null, bestY=-Infinity;
        for(const k in by){ const yy=+k; if(yy<=y&&yy>bestY){ bestY=yy; best=by[k]; } }
        return best; }
      function pickYear(data,c,y){ const by=data.by[c]; if(!by) return null;
        if(by[y]) return y; let bestY=null;
        for(const k in by){ const yy=+k; if(yy<=y&&(bestY==null||yy>bestY)) bestY=yy; }
        return bestY; }

      function bar(parts,rec,unit){
        let tot=0; parts.forEach(p=>{ const v=rec[p[0]]; if(isFinite(v)&&v>0) tot+=v; });
        if(!(tot>0)) return '<div style="color:var(--text-muted);">'+L('no data','データなし','keine Daten','нет данных','sin datos')+'</div>';
        const seg=parts.map(p=>{ const v=rec[p[0]]; if(!(isFinite(v)&&v>0)) return '';
          return '<div title="'+esc(partName(p))+'" style="width:'+(v/tot*100).toFixed(2)+'%;background:'+p[3]+';"></div>'; }).join('');
        const leg=parts.map(p=>{ const v=rec[p[0]]; if(!(isFinite(v)&&v>0)) return '';
          return '<div style="display:flex;align-items:center;gap:6px;padding:1.5px 0;">'
            +'<span style="width:10px;height:10px;border-radius:2px;background:'+p[3]+';flex:none;"></span>'
            +'<span style="flex:1;">'+esc(partName(p))+'</span>'
            +'<b>'+(unit==='%'?pct(v):(Math.round(v).toLocaleString()+' TWh'))+'</b>'
            /* (#R211) …and the share ONLY when it is a different number. For the electricity mix the
               value already IS a percentage, and printing both gave 「20.6 %20.6 %」. */
            +(unit==='%'?'':'<span style="opacity:.62;width:52px;text-align:right;">'+pct(v/tot*100)+'</span>')+'</div>'; }).join('');
        return '<div style="display:flex;height:16px;border-radius:5px;overflow:hidden;border:1px solid var(--glass-border,rgba(128,128,128,0.28));">'+seg+'</div>'
          +'<div style="margin-top:6px;">'+leg+'</div>'; }

      /* what the choropleth's colour MEANS, in words and in numbers, next to the bar it colours */
      function legendHTML(){
        const k=kind;
        const unit=(k==='elec')
          ? L('Share of electricity generated from low-carbon sources (nuclear + renewables)','発電量に占める低炭素電源（原子力＋再生可能）の割合','Anteil kohlenstoffarmer Stromerzeugung','Доля низкоуглеродной электроэнергии','Cuota de electricidad baja en carbono')
          : L('Share of primary energy from fossil fuels (coal + oil + gas)','一次エネルギーに占める化石燃料（石炭＋石油＋ガス）の割合','Anteil fossiler Primärenergie','Доля ископаемого топлива','Cuota de energía primaria fósil');
        return rampLegend(ENERGY_RAMP[k].map(s=>[s[0]+'%',s[1]]),unit); }

      function render(){
        const cfg=SRCS[kind];
        const b=panel.open('<div style="display:flex;gap:5px;">'
            +'<button class="wp-k" data-k="elec" style="'+BTN+'flex:1;">'+L('Electricity','電力構成','Strom','Электроэнергия','Electricidad')+'</button>'
            +'<button class="wp-k" data-k="prim" style="'+BTN+'flex:1;">'+L('Primary energy','一次エネルギー','Primärenergie','Первичная энергия','Energía primaria')+'</button></div>'
          +'<div class="wp-e-leg">'+legendHTML()+'</div>'
          +'<div class="wp-e-body" style="font-size:11.5px;color:var(--text-main);line-height:1.5;">'
          +L('Tap a country for its mix.','国をタップすると構成が出ます。','Land antippen.','Нажмите страну.','Toque un país.')+'</div>'
          +'<div style="font-size:9.5px;color:var(--text-muted);line-height:1.5;">'
          +L('Source: Our World in Data — Ember (electricity) and the Energy Institute Statistical Review (primary energy). The map shades the low-carbon share of electricity, and the fossil share of primary energy; the bar is the mix itself, because nine sources are not one color.',
             '出典: Our World in Data（電力＝Ember、一次エネルギー＝Energy Institute 統計）。地図は電力の低炭素比率／一次エネルギーの化石燃料比率で塗り、構成そのものは棒グラフで示します（9つの電源は1色では表せないため）。',
             'Quelle: Our World in Data (Ember / Energy Institute).','Источник: Our World in Data (Ember / Energy Institute).','Fuente: Our World in Data (Ember / Energy Institute).')+'</div>');
        b.querySelectorAll('.wp-k').forEach(x=>{ const a=x.getAttribute('data-k')===kind;
          x.style.background=a?'var(--primary-color)':'var(--input-bg)'; x.style.color=a?'#fff':'var(--text-main)';
          x.onclick=()=>{ const nk=x.getAttribute('data-k'); if(nk===kind) return; setKind(nk); }; });
        return b; }

      async function show(code){
        iso=code; const cfg=SRCS[kind]; const y=nowYear();
        const b=panel.shown()?panel.body():render();
        const host=(b&&b.querySelector('.wp-e-body'))||render().querySelector('.wp-e-body');
        host.innerHTML=L('Loading…','読み込み中…','Lädt…','Загрузка…','Cargando…');
        try{ const data=await owid(cfg.slug); const yy=pickYear(data,code,y); const rec=yy!=null?data.by[code][yy]:null;
          if(!rec){ host.innerHTML='⚠ '+L('No data for this country.','この国のデータがありません。','Keine Daten.','Нет данных.','Sin datos.'); return; }
          host.innerHTML='<div style="font-weight:700;font-size:13px;margin-bottom:2px;">'+esc(countryName(code))+'</div>'
            +'<div style="color:var(--text-muted);margin-bottom:6px;">'+yy+(yy!==y?(' · '+L('latest available at or before','指定年以前で最新','letzte verfügbare','последний доступный','último disponible')+' '+y):'')+'</div>'
            +bar(cfg.parts,rec,cfg.unit);
        }catch(e){ host.innerHTML='⚠ '+L('Energy data could not be fetched.','エネルギーデータを取得できませんでした。','Daten nicht abrufbar.','Не удалось получить данные.','No se pudieron obtener los datos.'); } }

      /* one row, two questions: switching hides the other fill rather than stacking two choropleths */
      function setKind(k){ kind=(k==='prim')?'prim':'elec';
        if(!on){ render(); return kind; }
        setVis([fillId(kind==='elec'?'prim':'elec')],false);
        paint(); render(); if(iso) show(iso); return kind; }

      function paint(){ withCountrySource().then(async()=>{ if(!on) return;
        try{ if(window._imFlushCountryGeo) window._imFlushCountryGeo(true); }catch(_){}
        if(!ensureChoro(kind)){ whenDrawable(()=>{ if(on&&ensureChoro(kind)) apply(kind).then(()=>setVis([fillId(kind)],true)).catch(()=>{}); }); return; }
        try{ await apply(kind); }catch(e){ try{ HOST.imToast(L('Energy data could not be fetched.','エネルギーデータを取得できませんでした。','Daten nicht abrufbar.','Не удалось получить данные.','No se pudieron obtener los datos.')); }catch(_){} }
        setVis([fillId(kind)],true);
        panel.claim();               /* (#R215) the ids the one box's opacity slider drives */
      }); }

      function toggle(v){ on=!!v;
        if(!on){ setVis([fillId('elec'),fillId('prim')],false); panel.hide(); return; }
        render(); paint(); hiResCountries(()=>{ if(on) paint(); }); }

      mapClick((e)=>{ if(!on) return false;
        const c=countryAt(e.lngLat.lng,e.lngLat.lat); if(!c) return false;
        show(c); return true; });
      onRestyle(()=>{ if(on) whenDrawable(()=>{ if(ensureChoro(kind)) paint(); }); });
      onYear(()=>{ if(on) paint(); if(panel.shown()&&iso) show(iso); });

      STATE.energy=()=>({ on, elec:on&&kind==='elec', prim:on&&kind==='prim', iso, kind, year:nowYear() });
      STATE.energyShow=(code,k)=>{ if(k) kind=(k==='prim')?'prim':'elec'; return show(String(code||'').toUpperCase()); };
      STATE.energyKind=(k)=>setKind(k);
      window.__wpEnergy={ toggle, setKind };
    })();

    /* ══════════════════════════════════════════════════════════════════════════════════════════════
     *  3 · WARNINGS — the real ones, from the agencies that issue them
     * ----------------------------------------------------------------------------------------------
     *  「各国の気象・災害警報。日本は気象庁のリアルタイムを発令単位（都道府県/市町村）でマッピング。
     *    技術的に可能なすべての国で。国をタップするとその国の凡例。」
     *
     *  ⚠ 「技術的に可能なすべての国で」 IS A REAL CONSTRAINT AND IT IS NARROW. A warning layer that
     *  shows nothing for a country is indistinguishable from a warning layer that says there is
     *  nothing to warn about, and that difference is a safety claim. So this covers the agencies that
     *  actually publish a machine-readable, browser-reachable (CORS) real-time feed — JMA and the US
     *  NWS, both verified — and for every other country the tap says, in words, that no feed is
     *  wired. Adding a country later is one entry in FEEDS.
     *
     *  JAPAN, AT THE ISSUING UNIT. JMA's map.json carries two area types per office: areaTypes[0] is
     *  the prefecture-level unit and areaTypes[1] the municipality-level one. Both are read; the map
     *  is painted at the prefecture the office code names (its first two digits are the JIS
     *  prefecture number, which is exactly geoBoundaries' shapeISO `JP-nn`), and the municipality
     *  rows are listed in the tap. Colour is the SEVERITY that is actually in force: 特別警報 →
     *  purple, 警報 → red, 注意報 → yellow.
     * ════════════════════════════════════════════════════════════════════════════════════════════*/
    (function alerts(){
      const SRC='wp-alert', LYR=['wp-alert-fill','wp-alert-line','wp-alert-pt'];
      let on=false, feats=[], busy=false, timer=null;
      /* ⚠ (#R212) 「現在出てるのに、何も発令されてないと日本の場合は出てくる。」 — AND THAT WAS THE FEED
         NOT HAVING ARRIVED, PRINTED AS A FACT. `refresh()` takes a few seconds (JMA + the prefecture
         geometry + NWS + GDACS); tapping Japan before it returned found an empty `feats` and the
         legend said 「現在、発表中のものはありません」, which is a claim about safety made from a race.
         Worse, each loader was wrapped in `.catch(()=>[])`, so a fetch that FAILED was indistinguishable
         from a country with nothing in force. Every feed now carries its own state and the legend says
         which one it is: loading / could not be fetched / genuinely nothing. Verified against the live
         feed while writing this: 16 of 47 prefectures were under a warning at the time. */
      const FEED_STATE={};        /* jma | nws | gdacs → 'idle' | 'loading' | 'ok' | 'error' */
      let lastAt=0;
      const panel=makePanel('wp-alert-panel',()=>'⚠ '+L('Warnings','気象・災害警報','Warnungen','Предупреждения','Avisos'),'wp-dl-alerts',
        { legendId:'wpalerts', layers:()=>LYR.concat([CHORO]),
          names:()=>(LA('⚠ Weather & disaster warnings','⚠ 気象・災害警報','⚠ Wetter- und Katastrophenwarnungen','⚠ Метеопредупреждения','⚠ Avisos meteorológicos')) });
      /* JMA warning codes → the kind of hazard, and the tier the code belongs to.
         Tier comes from the code range JMA publishes: 3x = 特別警報, 0x/1x = 警報, 2x = 注意報. */
      const JMA_KIND={'02':['暴風雪','Snowstorm'],'03':['大雨','Heavy rain'],'04':['洪水','Flood'],'05':['暴風','Storm'],
        '06':['大雪','Heavy snow'],'07':['波浪','High waves'],'08':['高潮','Storm surge'],'10':['大雨','Heavy rain'],
        '12':['暴風雪','Snowstorm'],'13':['大雨','Heavy rain'],'14':['洪水','Flood'],'15':['暴風','Storm'],
        '16':['大雪','Heavy snow'],'17':['波浪','High waves'],'18':['高潮','Storm surge'],'19':['雷','Thunderstorm'],
        '20':['濃霧','Dense fog'],'21':['乾燥','Dry air'],'22':['なだれ','Avalanche'],'23':['低温','Low temperature'],
        '24':['霜','Frost'],'25':['着雪','Snow accretion'],'26':['融雪','Snowmelt'],'27':['その他','Other'],
        '32':['暴風雪','Snowstorm'],'33':['大雨','Heavy rain'],'35':['暴風','Storm'],'36':['大雪','Heavy snow'],
        '37':['波浪','High waves'],'38':['高潮','Storm surge']};
      const tierOf=(code)=>{ const n=parseInt(code,10);
        if(n>=32&&n<=38) return 3;                 /* 特別警報 */
        if(n>=19&&n<=27) return 1;                 /* 注意報 */
        return 2; };                               /* 警報 */
      const TIERCOL={3:'#a335ee',2:'#ff3b30',1:'#ffcc00'};
      const tierName=(t)=>t===3?L('Emergency warning','特別警報','Notfallwarnung','Экстренное предупреждение','Aviso de emergencia')
        :t===2?L('Warning','警報','Warnung','Предупреждение','Aviso')
        :L('Advisory','注意報','Hinweis','Рекомендация','Advertencia');
      const FEEDS={ JPN:'jma', USA:'nws' };

      function ensureLayers(){ if(!_imCanDraw()) return false; try{
        if(!GE().layers.hasSource(SRC)) GE().layers.addSource(SRC,{type:'geojson',data:{type:'FeatureCollection',features:[]}});
        if(!GE().layers.has('wp-alert-fill')) GE().layers.add({id:'wp-alert-fill',type:'fill',source:SRC,
          filter:['!=',['geometry-type'],'Point'],
          layout:{visibility:'none'},paint:{'fill-color':['get','col'],'fill-opacity':0.34}});
        if(!GE().layers.has('wp-alert-line')) GE().layers.add({id:'wp-alert-line',type:'line',source:SRC,
          filter:['!=',['geometry-type'],'Point'],
          layout:{visibility:'none'},paint:{'line-color':['get','col'],'line-width':1.4,'line-opacity':0.95}});
        /* the global feed is EVENTS, not areas — a point with the hazard's own severity (#R212) */
        if(!GE().layers.has('wp-alert-pt')) GE().layers.add({id:'wp-alert-pt',type:'circle',source:SRC,
          filter:['==',['geometry-type'],'Point'],layout:{visibility:'none'},
          paint:{'circle-radius':['interpolate',['linear'],['zoom'],1,['+',3.5,['*',1.6,['get','tier']]],6,['+',7,['*',3.2,['get','tier']]]],
            'circle-color':['get','col'],'circle-opacity':0.72,'circle-stroke-color':'rgba(0,0,0,0.6)','circle-stroke-width':1.2}});
        return true; }catch(_){ return false; } }
      /* the country wash: every country GDACS has a current event in, painted without a tap */
      const CHORO='wp-alert-choro';
      function ensureChoro(){ if(GE().layers.has(CHORO)) return true;
        if(!_imCanDraw()||!GE().layers.hasSource('countries')) return false;
        try{ GE().layers.add({id:CHORO,type:'fill',source:'countries',layout:{visibility:'none'},
          paint:{'fill-color':['match',['to-number',['feature-state','wpAlert'],0],3,TIERCOL[3],2,TIERCOL[2],1,TIERCOL[1],'rgba(0,0,0,0)'],
            'fill-opacity':['case',['>',['to-number',['feature-state','wpAlert'],0],0],0.20,0]}},
          GE().layers.has('tool-poly')?'tool-poly':undefined); }catch(_){ return false; }
        return true; }

      let _jpGeo=null;
      /* ⚠⚠ (#R212) THE PREFECTURE GEOMETRY NEVER ARRIVED IN A BROWSER, AND THAT IS THE WHOLE OF
         「日本の場合は何も発令されてないと出てくる」. Measured from the running page:
           · JMA map.json      → 200 in 19 ms   (the warnings themselves were always fine)
           · JMA area.json     → 200 in 15 ms
           · the geoBoundaries API → 200 in 3 ms, and it hands back a `github.com/…/raw/…` URL
           · THAT url          → «Failed to fetch»
         Two things are wrong with it at once: `github.com/raw` REDIRECTS, and the redirect target
         does not carry the CORS header, so the browser refuses it; and the file is stored in Git LFS,
         so `raw.githubusercontent.com` returns the 130-byte POINTER («version https://git-lfs…»)
         rather than the geometry. `media.githubusercontent.com/media/…` is GitHub's own LFS content
         host, it sends `Access-Control-Allow-Origin: *`, and it returns the real 2.2 MB collection
         with the same `shapeISO` `JP-nn` keys — measured, 47 features in 511 ms.
         ⚠ Node does not enforce CORS, which is why #R211 verified this endpoint and still shipped a
         layer that could not draw Japan. A feed check has to be run from the PAGE (#R188). */
      function _lfsUrl(u){
        const m=/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/raw\/(.+)$/.exec(String(u||''));
        return m?('https://media.githubusercontent.com/media/'+m[1]+'/'+m[2]+'/'+m[3]):u; }
      async function jpPrefGeo(){ if(_jpGeo) return _jpGeo;
        const m=await (await fetch('https://www.geoboundaries.org/api/current/gbOpen/JPN/ADM1/')).json();
        const meta=Array.isArray(m)?m[0]:m;
        const src=meta.simplifiedGeometryGeoJSON||meta.gjDownloadURL;
        let g=null;
        for(const u of [_lfsUrl(src),src]){ if(!u) continue;
          try{ const r=await fetch(u); if(!r.ok) continue;
            const j=await r.json(); if(j&&j.features&&j.features.length){ g=j; break; } }catch(_){} }
        if(!g) throw new Error('jp prefecture geometry unreachable');
        const by=Object.create(null);
        (g.features||[]).forEach(f=>{ const iso=(f.properties&&f.properties.shapeISO)||''; const n=parseInt(String(iso).replace('JP-',''),10);
          if(isFinite(n)) by[n]=f; });
        return (_jpGeo=by); }

      async function loadJMA(){
        const [map,area,geo]=await Promise.all([
          fetch('https://www.jma.go.jp/bosai/warning/data/warning/map.json').then(r=>{ if(!r.ok) throw new Error('jma '+r.status); return r.json(); }),
          fetch('https://www.jma.go.jp/bosai/common/const/area.json').then(r=>r.ok?r.json():{}),
          jpPrefGeo() ]);
        const nameOf=(code)=>{ for(const k of ['class20s','class15s','class10s','offices','centers']){
            const t=area&&area[k]; if(t&&t[code]&&t[code].name) return t[code].name; } return code; };
        const byPref=Object.create(null);
        Object.keys(map).forEach(k=>{ const o=map[k]; if(!o||!o.areaTypes) return;
          (o.areaTypes||[]).forEach((at,ti)=>{ (at.areas||[]).forEach(a=>{
            const pref=parseInt(String(a.code).slice(0,2),10); if(!isFinite(pref)) return;
            const rec=byPref[pref]=byPref[pref]||{tier:0,items:[],reportedAt:o.reportDatetime||''};
            (a.warnings||[]).forEach(w=>{ if(!w||w.status==='解除'||w.status==='発表警報・注意報はなし') return;
              const t=tierOf(w.code); if(t>rec.tier) rec.tier=t;
              const kind=JMA_KIND[String(w.code).padStart(2,'0')];
              rec.items.push({ area:nameOf(a.code), unit:ti===0?'pref':'muni', tier:t,
                kind:kind?(HOST.lang==='jp'?kind[0]:kind[1]):('#'+w.code), status:w.status }); }); }); }); });
        const out=[];
        Object.keys(byPref).forEach(p=>{ const rec=byPref[p]; if(!rec.tier) return;
          const f=geo[+p]; if(!f) return;
          out.push({type:'Feature',geometry:f.geometry,properties:{ iso:'JPN', col:TIERCOL[rec.tier], tier:rec.tier,
            name:(f.properties&&f.properties.shapeName)||('JP-'+p), n:rec.items.length, at:rec.reportedAt,
            items:JSON.stringify(rec.items.slice(0,120)) }}); });
        return out; }

      async function loadNWS(){
        const r=await fetch('https://api.weather.gov/alerts/active?status=actual&message_type=alert');
        if(!r.ok) throw new Error('nws '+r.status);
        const j=await r.json();
        const SEV={Extreme:3,Severe:2,Moderate:1,Minor:1,Unknown:1};
        const out=[];
        (j.features||[]).forEach(f=>{ if(!f.geometry) return;
          const p=f.properties||{}; const t=SEV[p.severity]||1;
          out.push({type:'Feature',geometry:f.geometry,properties:{ iso:'USA', col:TIERCOL[t], tier:t,
            name:p.event||'Alert', n:1, at:p.sent||'',
            items:JSON.stringify([{area:p.areaDesc||'',unit:'zone',tier:t,kind:p.event||'',status:p.severity||''}]) }}); });
        return out; }

      /* ── the rest of the world: GDACS, the UN/EC global disaster alert system ────────────────────
         「利用可能なデータのあるすべての国で実装しろ。」 GDACS is the one browser-reachable feed that is
         global: earthquakes, tropical cyclones, floods, volcanoes, droughts and wildfires, each with
         an alert level its own methodology assigns (Green / Orange / Red).
         ⚠ ITS POLYGONS ARE NOT REACHABLE. `getgeometry` (the affected-area outline) sends no
         Access-Control-Allow-Origin — measured — so this draws what it CAN read: the event location,
         and a wash over every country the event's own `affectedcountries` list names. That is a
         weaker statement than JMA's issuing units, and the legend says which one a country is on. */
      const GDACS_TIER={Red:3,Orange:2,Green:1};
      const GDACS_KIND={EQ:['地震','Earthquake'],TC:['熱帯低気圧','Tropical cyclone'],FL:['洪水','Flood'],
        VO:['火山','Volcano'],DR:['干ばつ','Drought'],WF:['森林火災','Wildfire']};
      let gCountries=Object.create(null);
      async function loadGDACS(){
        const r=await fetch('https://www.gdacs.org/gdacsapi/api/events/geteventlist/MAP?alertlevel=Green;Orange;Red&eventlist=EQ;TC;FL;VO;DR;WF');
        if(!r.ok) throw new Error('gdacs '+r.status);
        const j=await r.json(); const out=[]; const byC=Object.create(null);
        (j.features||[]).forEach(f=>{ const p=f.properties||{}; if(String(p.iscurrent)!=='true') return;
          const t=GDACS_TIER[p.alertlevel]||1;
          const kind=GDACS_KIND[p.eventtype];
          const label=kind?(HOST.lang==='jp'?kind[0]:kind[1]):(p.eventtype||'');
          (p.affectedcountries||[]).forEach(c=>{ const k=String(c.iso3||'').toUpperCase(); if(k.length!==3) return;
            const rec=byC[k]=byC[k]||{tier:0,items:[]};
            if(t>rec.tier) rec.tier=t;
            rec.items.push({ area:c.countryname||k, unit:'event', tier:t, kind:label,
              status:(p.name||p.eventname||'')+(p.severitydata&&p.severitydata.severitytext?(' · '+p.severitydata.severitytext):'') }); });
          if(f.geometry&&f.geometry.type==='Point') out.push({type:'Feature',geometry:f.geometry,
            properties:{ iso:String(p.iso3||'').toUpperCase(), col:TIERCOL[t], tier:t, src:'gdacs',
              name:p.name||label, n:1, at:p.datemodified||p.fromdate||'',
              items:JSON.stringify([{area:p.country||'',unit:'event',tier:t,kind:label,status:p.alertlevel||''}]) }}); });
        gCountries=byC; return out; }

      function paintCountries(){ withCountrySource().then(()=>{ if(!on) return;
        if(!ensureChoro()) { whenDrawable(()=>{ if(on&&ensureChoro()) paintCountries(); }); return; }
        try{ (HOST.countryGeo&&HOST.countryGeo.features||[]).forEach(f=>{ const c=String(f.id||''); if(!c) return;
          const rec=gCountries[c];
          GE().layers.setFeatureState({source:'countries',id:f.id},{wpAlert:rec?rec.tier:0}); }); }catch(_){}
        setVis([CHORO],on); }); }

      async function refresh(){ if(busy) return; busy=true;
        ['jma','nws','gdacs'].forEach(k=>{ if(FEED_STATE[k]!=='ok') FEED_STATE[k]='loading'; });
        try{ const parts=await Promise.all([
            loadJMA().then(v=>{ FEED_STATE.jma='ok'; return v; }).catch(e=>{ FEED_STATE.jma='error'; console.warn('JMA warnings',e); return []; }),
            loadNWS().then(v=>{ FEED_STATE.nws='ok'; return v; }).catch(e=>{ FEED_STATE.nws='error'; console.warn('NWS warnings',e); return []; }),
            loadGDACS().then(v=>{ FEED_STATE.gdacs='ok'; return v; }).catch(e=>{ FEED_STATE.gdacs='error'; console.warn('GDACS warnings',e); return []; })]);
          feats=parts.flat(); lastAt=Date.now();
          whenDrawable(()=>{ if(ensureLayers()){ GE().layers.setSourceData(SRC,{type:'FeatureCollection',features:feats}); setVis(LYR,on); } });
          paintCountries();
          if(on&&panel.shown()) overview();
        } finally { busy=false; } }

      /* the three tiers as a colour key — the same TIERCOL the map paints from */
      function tierKey(names){ return '<div style="margin-top:8px;display:flex;flex-direction:column;gap:3px;">'
        +[3,2,1].map(t=>'<div style="display:flex;align-items:center;gap:7px;font-size:11.5px;">'
          +'<span style="width:12px;height:12px;border-radius:3px;background:'+TIERCOL[t]+';"></span>'
          +esc(names?names(t):tierName(t))+'</div>').join('')+'</div>'; }
      const GDACS_TIERNAME=(t)=>t===3?L('Red alert','赤（最も深刻）','Rote Warnstufe','Красный уровень','Alerta roja')
        :t===2?L('Orange alert','オレンジ（深刻）','Orange Warnstufe','Оранжевый уровень','Alerta naranja')
        :L('Green alert','緑（情報）','Grüne Warnstufe','Зелёный уровень','Alerta verde');

      function legendFor(iso3){
        const feed=FEEDS[iso3];
        const mine=feats.filter(f=>f.properties.iso===iso3);
        const gRec=gCountries[iso3];
        const st=feed?FEED_STATE[feed]:FEED_STATE.gdacs;
        let h='<div style="font-weight:700;font-size:13px;">'+esc(countryName(iso3))+'</div>';
        /* ⚠ THE THREE ANSWERS ARE DIFFERENT AND MUST NOT LOOK ALIKE (#R212): still fetching / the
           fetch failed / the agency really has nothing in force. Only the third is a safety claim,
           and it is the only one this app is entitled to make. */
        const stLine=(s)=>s==='loading'?('<div style="margin-top:8px;color:var(--text-muted);">'+L('Reading the feed…','フィードを取得中…','Feed wird gelesen…','Загрузка фида…','Leyendo el feed…')+'</div>')
          :s==='error'?('<div style="margin-top:8px;color:#ff9f0a;">⚠ '+L('This feed could not be fetched just now, so nothing below is a statement about what is in force.','このフィードを取得できませんでした。したがって以下は「発表状況」を示すものではありません。','Feed nicht abrufbar — die Anzeige sagt nichts über geltende Warnungen.','Не удалось получить фид — показанное ничего не говорит о действующих предупреждениях.','No se pudo obtener el feed — lo mostrado no indica qué avisos están vigentes.')+'</div>')
          :'';
        if(!feed){
          h+='<div style="margin-top:4px;color:var(--text-muted);">'
            +L('Global feed: GDACS (Global Disaster Alert and Coordination System, UN/EC) — earthquakes, tropical cyclones, floods, volcanoes, droughts and wildfires.',
               '全球フィード: GDACS（国連/欧州委員会の全球災害警報システム）— 地震・熱帯低気圧・洪水・火山・干ばつ・森林火災。',
               'Globaler Feed: GDACS (UN/EC).','Глобальный фид: GDACS (ООН/ЕК).','Feed global: GDACS (ONU/CE).')+'</div>'
            +tierKey(GDACS_TIERNAME)+stLine(FEED_STATE.gdacs);
          if(FEED_STATE.gdacs==='ok'&&!gRec){
            /* ⚠ NOT an empty map, and not silence either: GDACS only carries events big enough to
               cross its own thresholds, so "no GDACS event" is not "no warnings". */
            h+='<div style="margin-top:8px;color:var(--text-main);">'
              +L('No current GDACS event for this country. GDACS only carries disasters above its own severity thresholds, and no national warning service is wired here yet — so this is not the same as "no warnings in force".',
                 'この国に現在の GDACS 事象はありません。GDACS は一定の規模を超えた災害だけを扱い、この国の気象機関のフィードはまだ接続していません——「警報が出ていない」という意味ではありません。',
                 'Kein aktuelles GDACS-Ereignis — das bedeutet NICHT, dass keine Warnungen gelten.',
                 'Нет текущих событий GDACS — это не значит, что предупреждений нет.',
                 'No hay evento GDACS actual — eso NO significa que no haya avisos.')+'</div>';
            return h; }
          if(gRec){ h+='<div style="margin-top:8px;max-height:230px;overflow:auto;">'
            +gRec.items.slice(0,60).map(x=>'<div style="display:flex;gap:6px;align-items:center;padding:2px 0;border-bottom:1px solid var(--glass-border,rgba(128,128,128,0.16));font-size:11.5px;">'
              +'<span style="width:9px;height:9px;border-radius:2px;background:'+TIERCOL[x.tier]+';flex:none;"></span>'
              +'<span style="flex:1;">'+esc(x.kind)+'</span><span style="opacity:.75;">'+esc(x.status)+'</span></div>').join('')+'</div>'; }
          return h; }
        h+='<div style="margin-top:4px;color:var(--text-muted);">'+(feed==='jma'
            ?L('Japan Meteorological Agency, at the unit the warning is issued for.','気象庁・発令単位（都道府県／市町村）','Japanische Wetterbehörde','Метеоагентство Японии','Agencia Meteorológica de Japón')
            :L('US National Weather Service, active alerts.','米国 国立気象局（発表中の警報）','US-Wetterdienst','Нацслужба погоды США','Servicio Meteorológico Nacional de EE. UU.'))+'</div>';
        h+=tierKey();
        h+=stLine(st);
        if(!mine.length){
          if(st==='ok') h+='<div style="margin-top:8px;color:var(--text-muted);">'+L('Nothing in force right now.','現在、発表中のものはありません。','Derzeit nichts in Kraft.','Сейчас ничего не действует.','Nada vigente ahora.')+'</div>';
          return h; }
        const rows=[]; mine.forEach(f=>{ let it=[]; try{ it=JSON.parse(f.properties.items||'[]'); }catch(_){}
          it.forEach(x=>rows.push(Object.assign({pref:f.properties.name},x))); });
        rows.sort((a,b)=>b.tier-a.tier);
        h+='<div style="margin-top:8px;max-height:230px;overflow:auto;">'
          +rows.slice(0,160).map(x=>'<div style="display:flex;gap:6px;align-items:center;padding:2px 0;border-bottom:1px solid var(--glass-border,rgba(128,128,128,0.16));font-size:11.5px;">'
            +'<span style="width:9px;height:9px;border-radius:2px;background:'+TIERCOL[x.tier]+';flex:none;"></span>'
            +'<span style="flex:1;">'+esc(x.area||x.pref)+'</span><b>'+esc(x.kind)+'</b>'
            +'<span style="opacity:.65;">'+esc(x.status||'')+'</span></div>').join('')
          +(rows.length>160?('<div style="opacity:.7;padding-top:4px;">+'+(rows.length-160)+'</div>'):'')+'</div>';
        return h; }

      /* what is in force RIGHT NOW, worldwide — shown the moment the layer is on, without a tap */
      function overview(){
        const fs=(k)=>FEED_STATE[k]||'idle';
        const line=(name,k,extra)=>'<div style="display:flex;gap:6px;align-items:center;font-size:11.5px;padding:2px 0;">'
          +'<span style="width:8px;height:8px;border-radius:50%;flex:none;background:'+(fs(k)==='ok'?'#32d74b':fs(k)==='error'?'#ff453a':'#ffcc00')+';"></span>'
          +'<span style="flex:1;">'+esc(name)+'</span><span style="opacity:.75;">'
          +(fs(k)==='ok'?esc(extra):fs(k)==='error'?L('unavailable','取得不可','nicht verfügbar','недоступно','no disponible')
            :L('loading…','取得中…','lädt…','загрузка…','cargando…'))+'</span></div>';
        const jp=feats.filter(f=>f.properties.iso==='JPN').length;
        const us=feats.filter(f=>f.properties.iso==='USA').length;
        const gc=Object.keys(gCountries).length;
        const worst=Object.keys(gCountries).reduce((m,k)=>Math.max(m,gCountries[k].tier||0),0);
        panel.open('<div class="wp-a-body">'
          +'<div style="font-weight:700;font-size:13px;">'+L('In force now','現在発表中','Aktuell in Kraft','Действует сейчас','Vigente ahora')+'</div>'
          +line(L('Japan — JMA, by issuing unit','日本 — 気象庁（発令単位）','Japan — JMA','Япония — JMA','Japón — JMA'),'jma',
                jp+' '+L('prefectures','都道府県','Präfekturen','префектур','prefecturas'))
          +line(L('United States — NWS','米国 — NWS','USA — NWS','США — NWS','EE. UU. — NWS'),'nws',
                us+' '+L('alert areas','警報区域','Warngebiete','зон','zonas'))
          +line(L('Rest of the world — GDACS','その他の国 — GDACS','Weltweit — GDACS','Остальной мир — GDACS','Resto del mundo — GDACS'),'gdacs',
                gc+' '+L('countries','か国','Länder','стран','países'))
          +tierKey(GDACS_TIERNAME)
          +'<div style="margin-top:8px;font-size:11.5px;color:var(--text-main);">'
          +L('Tap any country for the legend its own agency uses.','国をタップすると、その国の機関の凡例が出ます。','Land antippen für die Legende der jeweiligen Behörde.','Нажмите страну — появится легенда её службы.','Toque un país para la leyenda de su agencia.')+'</div>'
          +'<div style="margin-top:6px;font-size:9.5px;color:var(--text-muted);line-height:1.5;">'
          +L('Japan and the United States are drawn at the unit their agency issues at. Everywhere else is GDACS, which is an event feed, not a national warning service — a country with no GDACS event is not a country with no warnings. Educational display: follow the official authorities.',
             '日本と米国は各機関の発令単位で描いています。それ以外の国は GDACS で、これは事象の配信であって各国の警報そのものではありません——GDACS の事象が無い国は「警報が無い国」ではありません。表示は参考です。実際には公的機関の発表に従ってください。',
             'Japan und die USA in den Einheiten ihrer Behörden; sonst GDACS (Ereignisse, keine nationalen Warnungen).',
             'Япония и США — в единицах их служб; остальное — GDACS (события, а не национальные предупреждения).',
             'Japón y EE. UU. en sus unidades oficiales; el resto es GDACS (eventos, no avisos nacionales).')+'</div>'
          +(worst>=3?'':'')+'</div>'); }

      function toggle(v){ on=v;
        if(!on){ if(timer){ clearInterval(timer); timer=null; } panel.hide(); setVis(LYR,false); setVis([CHORO],false); return; }
        whenDrawable(()=>ensureLayers()); overview(); refresh(); hiResCountries(()=>{ if(on) paintCountries(); });
        if(!timer) timer=setInterval(()=>{ if(on) refresh(); },300000); }

      onRestyle(()=>{ if(on) whenDrawable(()=>{ if(ensureLayers()) GE().layers.setSourceData(SRC,{type:'FeatureCollection',features:feats}); setVis(LYR,true); paintCountries(); }); });
      mapClick((e)=>{ if(!on) return false;
        const c=countryAt(e.lngLat.lng,e.lngLat.lat); if(!c) return false;
        panel.open('<div class="wp-a-body">'+legendFor(c)+'</div>'); return true; });

      STATE.alerts=()=>({ on, areas:feats.length, feeds:Object.keys(FEEDS).concat(['*gdacs']),
        state:Object.assign({},FEED_STATE), countries:Object.keys(gCountries).length, at:lastAt,
        worst:feats.reduce((m,f)=>Math.max(m,f.properties.tier||0),0) });
      STATE.alertsLegend=(iso3)=>legendFor(String(iso3||'').toUpperCase());
      window.__wpAlerts={ toggle, refresh };
    })();

    /* ══════════════════════════════════════════════════════════════════════════════════════════════
     *  4 · TIDES — the times, and how far the water comes
     * ----------------------------------------------------------------------------------------------
     *  「満潮/干潮時刻。Sea-level change と同じ要領でどこまで水が来るかも表示。日時を変えると実データに
     *    基づき変わること。」
     *
     *  The series is Open-Meteo Marine's hourly sea-level height above MSL at the tapped point — a
     *  real global tide model, keyless and CORS-open. Highs and lows are the LOCAL EXTREMA of that
     *  series, refined by fitting a parabola through the three samples around each turn, so the time
     *  is not pinned to the hour the model happens to be sampled at.
     *  ⚠ The inundation shading is the SAME construction sea-level change uses: ground at or below
     *  the water level, read from the terrarium DEM at the app's own sampler. It is a bathtub fill,
     *  which is what a tide is over minutes-to-hours, and the panel says so rather than implying a
     *  hydrodynamic run-up model.
     * ════════════════════════════════════════════════════════════════════════════════════════════*/
    (function tides(){
      const IMG='wp-tide-src', LYR='wp-tide-img', SRC='wp-tide', PT='wp-tide-pt', LBL='wp-tide-lbl',
            SEL='wp-tide-sel', SELLBL='wp-tide-sel-lbl';
      let on=false, at=null, series=null, busy=false, stations=[], gridKey='', gridBusy=false, scanning=false;
      /* ══ (#R216) 「潮汐レイヤーは日時選択、再生もできるように。」 ══════════════════════════════════
         A tide is a curve in time, so the layer needs a handle on time. ⚠ IT DOES NOT GET A CLOCK OF
         ITS OWN — the standing rule (#R94) is that `window.IntMapTime` is the one master clock, and a
         second one here would put the tide, the terminator and the news on different instants. These
         controls DRIVE that clock (`allowFuture:true`, because the marine model is a forecast and its
         window reaches ~36 h ahead), and the existing `onYear` subscription is what redraws.
         ⚠ AND PLAYBACK MUST NOT BE A REQUEST LOOP. Each station keeps the hourly series it was
         already given, so stepping the clock inside that window is arithmetic; the network is only
         asked again when the instant leaves the window every station actually covers. */
      let playTmr=0, playStep=20*60e3, floodTick=0;
      const panel=makePanel('wp-tide-panel',()=>'🌊 '+L('Tides','潮汐','Gezeiten','Приливы','Mareas'),'wp-dl-tides',
        { legendId:'wptides', layers:()=>[LYR,PT,SEL,LBL,SELLBL],
          names:()=>(LA('🌊 Tides','🌊 潮汐（満潮・干潮）','🌊 Gezeiten','🌊 Приливы','🌊 Mareas')) });
      function ensureLayers(){ if(!_imCanDraw()) return false; try{
        if(!GE().layers.hasSource(SRC)) GE().layers.addSource(SRC,{type:'geojson',data:{type:'FeatureCollection',features:[]}});
        if(!GE().layers.has(PT)) GE().layers.add({id:PT,type:'circle',source:SRC,layout:{visibility:'none'},
          /* colour IS the state of the tide at that place: its own low → its own high, right now.
             ⚠ (#R220) …except the TAPPED one, which is white: the reader has to be able to find the
             point they chose among the scan's dots without reading the panel to work out which. */
          paint:{'circle-radius':['case',['==',['get','kind'],'probe'],6.5,['interpolate',['linear'],['zoom'],2,3.4,8,7]],
            'circle-color':['case',['==',['get','kind'],'probe'],'#ffffff',
              ['interpolate',['linear'],['to-number',['get','rel'],0.5],0,'#1b4f9c',0.5,'#2ea3d8',1,'#7ff0ff']],
            'circle-stroke-color':['case',['==',['get','kind'],'probe'],'#0b2740','rgba(3,26,40,0.85)'],
            'circle-stroke-width':['case',['==',['get','kind'],'probe'],2,1.4]}});
        /* ══ (#R220) THE SELECTED POINT, AS A MARK RATHER THAN AS ANOTHER DOT ═════════════════════
           「潮汐レイヤーは地点を選択したらどこを選択したかわかるようにしておけ。」 The tapped point had
           been drawn by the SAME paint as the ~28 scanned coasts — the same colour ramp, a radius 7
           against their 3.4–7 — so on any coast with stations near it the answer to 「どこを選んだか」
           was invisible. It is now a RING around the point (its own colour, twice the radius, drawn
           under the dot so the dot stays readable) plus a label that names the place, and both are
           allow-overlap: a selection must not be dropped by the label collider. */
        if(!GE().layers.has(SEL)) GE().layers.add({id:SEL,type:'circle',source:SRC,layout:{visibility:'none'},
          filter:['==',['get','kind'],'probe'],
          paint:{'circle-radius':15,'circle-opacity':0.10,'circle-color':'#ffd60a',
            'circle-stroke-color':'#ffd60a','circle-stroke-width':2.4,'circle-stroke-opacity':0.95,'circle-pitch-alignment':'map'}});
        if(!GE().layers.has(LBL)) GE().layers.add({id:LBL,type:'symbol',source:SRC,minzoom:3.4,
          filter:['==',['get','kind'],'st'],layout:{visibility:'none','text-field':['get','lbl'],
            'text-size':window.IntMapLabelScale.sub(0.82),'text-offset':[0,1.15],'text-anchor':'top','text-allow-overlap':false},
          paint:{'text-color':'#d8f6ff','text-halo-color':'rgba(0,18,32,0.88)','text-halo-width':1.4}});
        if(!GE().layers.has(SELLBL)) GE().layers.add({id:SELLBL,type:'symbol',source:SRC,
          filter:['==',['get','kind'],'probe'],layout:{visibility:'none','text-field':['get','lbl'],
            'text-size':window.IntMapLabelScale.sub(0.95),'text-offset':[0,-1.5],'text-anchor':'bottom',
            'text-allow-overlap':true,'text-ignore-placement':true},
          paint:{'text-color':'#ffd60a','text-halo-color':'rgba(0,18,32,0.94)','text-halo-width':1.7}});
        return true; }catch(_){ return false; } }

      /* ══ (#R212) A LAYER, NOT A PROBE ═══════════════════════════════════════════════════════════
         「いやさぼってんじゃねーよ。指示通り作れ」 — and the report was fair: switching the layer on drew
         nothing at all until you tapped, so as a LAYER it did not exist. It now samples the coast in
         view and asks the model for all of those points AT ONCE (Open-Meteo takes comma-separated
         coordinates and answers with an array), so the whole visible coastline carries its state:
         the level now, whether the water is rising or falling, and when it next turns.
         ⚠ The sampling asks the bundled land mask, not the network: a cell is coastal when it is sea
         and one of its four neighbours is land. That mask is 19.5 km, which is the right grain for
         points spread across a viewport and the wrong one for a street — so the tapped point is
         always asked for on its own coordinates (see probe). */
      function coastPoints(max){
        const out=[];
        try{
          const LM=window.IntMapLandMask; if(!LM||!LM.ready()) return out;
          const b=GE().camera.getBounds(); if(!b) return out;
          const W=b.getWest(), E=b.getEast(), S=b.getSouth(), N=b.getNorth();
          const span=Math.max(1e-6,E-W), NX=14, NY=Math.max(5,Math.round(NX*(N-S)/span));
          const dx=span/NX, dy=(N-S)/NY;
          for(let j=0;j<NY;j++){ const la=S+(j+0.5)*dy;
            for(let i=0;i<NX;i++){ const lo=W+(i+0.5)*dx;
              if(la<-79||la>81) continue;
              if(LM.isLand(lo,la)) continue;
              const near=LM.isLand(lo+dx,la)||LM.isLand(lo-dx,la)||LM.isLand(lo,la+dy)||LM.isLand(lo,la-dy)
                       ||LM.isLand(lo+dx*0.4,la)||LM.isLand(lo-dx*0.4,la)||LM.isLand(lo,la+dy*0.4)||LM.isLand(lo,la-dy*0.4);
              if(!near) continue;
              out.push([+lo.toFixed(3),+la.toFixed(3)]); } }
        }catch(_){}
        /* keep the ones nearest the middle of the view when there are more coasts than the API budget */
        if(out.length>max){ try{ const c=GE().camera.getCenter();
          out.sort((p,q)=>((p[0]-c.lng)**2+(p[1]-c.lat)**2)-((q[0]-c.lng)**2+(q[1]-c.lat)**2)); }catch(_){}
          out.length=max; }
        return out; }

      async function fetchMany(pts,when){
        if(!pts.length) return [];
        const day=new Date(when); const iso=(d)=>d.toISOString().slice(0,10);
        const a=new Date(day.getTime()-24*3600e3), b=new Date(day.getTime()+24*3600e3);
        const u='https://marine-api.open-meteo.com/v1/marine?latitude='+pts.map(p=>p[1]).join(',')
          +'&longitude='+pts.map(p=>p[0]).join(',')+'&hourly=sea_level_height_msl&timezone=UTC'
          +'&start_date='+iso(a)+'&end_date='+iso(b);
        const r=await fetch(u); if(!r.ok) throw new Error('marine '+r.status);
        const j=await r.json(); const arr=Array.isArray(j)?j:[j];
        return arr.map((o,i)=>{ const h=o&&o.hourly||{};
          const t=(h.time||[]).map(s=>Date.parse(s+'Z')), v=h.sea_level_height_msl||[];
          const s=[]; for(let k=0;k<t.length;k++) if(isFinite(t[k])&&v[k]!=null) s.push([t[k],+v[k]]);
          return { lng:pts[i]?pts[i][0]:o.longitude, lat:pts[i]?pts[i][1]:o.latitude, pts:s }; }); }

      function fmtHM(ms){ const m=Math.max(0,Math.round(ms/60000)); return Math.floor(m/60)+'h'+String(m%60).padStart(2,'0'); }

      /* (#R220) what the mark on the map says. Coordinates rather than a place name on purpose: the
         tap can land in open water where no gazetteer has a name, and a label that is sometimes a
         name and sometimes nothing is worse at 「どこを選んだか」 than one that is always the point. */
      function selLabel(){
        if(!at) return '';
        return L('Selected','選択地点','Ausgewählt','Выбрано','Seleccionado')
          +'  '+Math.abs(at[1]).toFixed(2)+'°'+(at[1]>=0?'N':'S')+' '+Math.abs(at[0]).toFixed(2)+'°'+(at[0]>=0?'E':'W'); }
      function drawStations(){
        const feats=stations.map(s=>{
          const f={type:'Feature',geometry:{type:'Point',coordinates:[s.lng,s.lat]},
            properties:{kind:'st',rel:s.rel,lbl:s.lbl}};
          return f; });
        if(at) feats.push({type:'Feature',geometry:{type:'Point',coordinates:at},properties:{kind:'probe',rel:0.5,lbl:selLabel()}});
        try{ GE().layers.setSourceData(SRC,{type:'FeatureCollection',features:feats}); }catch(_){}
        setVis([PT,SEL,LBL,SELLBL],on); }

      /* ══ ⚠⚠ (#R215) THE SCAN ASKED THE LAND MASK BEFORE THE LAND MASK EXISTED ═════════════
         「（追記：いやさぼってんじゃねーよ。指示通り作れ）」 reported a THIRD time, and switching the
         layer on this round still drew nothing: measured, `stations: 0`, no window, an empty map and
         a toast telling the reader to tap something. Two causes, both here.

         (1) `coastPoints()` returns [] unless `IntMapLandMask.ready()`, and `warm()` is a PROMISE that
             had just been fired and not awaited — so the very first scan, the one that runs when the
             layer is switched on, always sampled a mask that had not decoded yet and found no coast.
             Nothing retried it: `gridKey` had already been set to this view, so the next `moveend` at
             the same camera returned early. The layer stayed empty until the user happened to pan.
         (2) Even with stations, the WINDOW only opened from `probe()`, i.e. only on a tap. A layer
             whose answer is invisible until you guess where to click is the 「さぼってる」.

         So: the mask is awaited, a scan that answered nothing re-arms its key instead of latching the
         view, and `toggle(true)` opens the window immediately and says which of the three states it is
         in — scanning, N coasts carrying their level, or the model has nothing here. */
      function scanCoast(){
        if(!on) return;
        let key=''; try{ const c=GE().camera.getCenter();
          key=[Math.round(GE().camera.getZoom()*2),Math.round(c.lng*4),Math.round(c.lat*4)].join('/'); }catch(_){}
        if(!key||key===gridKey||gridBusy) return;
        gridKey=key; gridBusy=true;
        const rearm=()=>{ gridKey=''; };          /* a scan that answered nothing must be retriable */
        Promise.resolve().then(()=>{ try{ const LM=window.IntMapLandMask; return (LM&&LM.warm)?LM.warm():null; }catch(_){ return null; } })
          .then(()=>scanNow(rearm)).catch(()=>{ gridBusy=false; rearm(); }); }
      function scanNow(rearm){
        scanning=false;
        if(!on){ gridBusy=false; return; }
        const pts=coastPoints(28);
        if(!pts.length){ gridBusy=false; rearm(); stations=[]; drawStations(); overview(); return; }
        const t0=when();
        return fetchMany(pts,t0).then(list=>{
          /* ⚠ (#R216) the hourly series is KEPT on the station. It is what makes the clock scrubbable
             and the play button affordable: a step inside this window is arithmetic, not a request. */
          stations=list.map(o=>{
            if(!o.pts.length) return null;
            const st=restat({ lng:o.lng, lat:o.lat, pts:o.pts },t0);
            return st; }).filter(Boolean);
          if(!stations.length) rearm();
          drawStations(); paintFloodFromStations(); overview();   /* (#R218) shade before any tap */
        }).catch(()=>{ stations=[]; rearm(); drawStations(); overview(true); })
          .then(()=>{ gridBusy=false; }); }
      /* the level, the phase and the next turn AT `t0`, from a series this station already has */
      function restat(st,t0){
        const lv=levelAt(st.pts,t0); if(lv==null) return null;
        let lo=Infinity,hi=-Infinity; st.pts.forEach(p=>{ if(p[1]<lo)lo=p[1]; if(p[1]>hi)hi=p[1]; });
        st.lv=lv;
        st.rel=(hi-lo>1e-6)?Math.max(0,Math.min(1,(lv-lo)/(hi-lo))):0.5;
        const nx=extrema(st.pts).filter(x=>x.t>t0).sort((a,b)=>a.t-b.t)[0];
        st.next=nx||null;
        st.lbl=lv.toFixed(1)+' m'+(nx?('  '+(nx.high?'▲':'▼')+fmtHM(nx.t-t0)):'');
        return st; }
      /* does every cached series still cover this instant? (leaving the window is the only re-fetch) */
      function covered(t0){
        const has=(pts)=>!!(pts&&pts.length>1&&t0>=pts[0][0]&&t0<=pts[pts.length-1][0]);
        if(at&&!has(series)) return false;
        if(!stations.length) return !!(at&&has(series));
        return stations.every(s=>has(s.pts)); }
      /* the clock moved inside the cached window: recompute, redraw, never fetch */
      function restatAll(t0){
        stations=stations.map(s=>restat(s,t0)).filter(Boolean);
        drawStations();
        if(at&&series&&series.length){
          const lv=levelAt(series,t0);
          if(lv!=null&&(++floodTick%3===0||!playTmr)) paintFlood(at[0],at[1],lv);
          probeHtml(t0,lv);
        } else { /* (#R218) the un-tapped shading follows the clock too, at the same 1-in-3 cadence */
          if(++floodTick%3===0||!playTmr) paintFloodFromStations();
          overview(); } }
      /* what the layer says WITHOUT a tap: the coasts in view, the level now and when each next turns.
         A tapped point replaces this with its own table (probe) and it returns on the next scan. */
      const SRCNOTE=()=>'<div style="font-size:9.5px;color:var(--text-muted);line-height:1.5;">'
        +L('Sea level above mean sea level from the Open-Meteo Marine model, hourly. Highs and lows are the local extrema of that series, refined between samples. Tap a coast for its own table and how far the water reaches \u2014 the shading is ground at or below that level, from the same elevation model the sea-level layer uses (a still-water fill, not a run-up model). The clock drives all of it.',
           '\u51fa\u5178\u306f Open-Meteo Marine \u306e1\u6642\u9593\u3054\u3068\u306e\u5e73\u5747\u6d77\u9762\u57fa\u6e96\u306e\u6f6e\u4f4d\u3002\u6e80\u6f6e\u30fb\u5e72\u6f6e\u306f\u305d\u306e\u7cfb\u5217\u306e\u6975\u5024\uff08\u6a19\u672c\u9593\u3092\u88dc\u9593\uff09\u3002\u6d77\u5cb8\u3092\u30bf\u30c3\u30d7\u3059\u308b\u3068\u305d\u306e\u5730\u70b9\u306e\u6642\u523b\u8868\u3068\u6d78\u6c34\u7bc4\u56f2\u304c\u51fa\u307e\u3059\uff08\u5857\u308a\u306f\u73fe\u5728\u306e\u6f6e\u4f4d\u4ee5\u4e0b\u306e\u5730\u9762\u3067\u3001Sea-level change \u3068\u540c\u3058\u6a19\u9ad8\u30c7\u30fc\u30bf\u3092\u4f7f\u3063\u305f\u9759\u6c34\u9762\u306e\u5857\u308a\u3002\u9061\u4e0a\u30e2\u30c7\u30eb\u3067\u306f\u3042\u308a\u307e\u305b\u3093\uff09\u3002\u6642\u8a08\u3092\u52d5\u304b\u3059\u3068\u5168\u90e8\u304c\u8ffd\u96a8\u3057\u307e\u3059\u3002',
           'Pegel aus dem Open-Meteo-Marine-Modell; K\u00fcste antippen f\u00fcr Tabelle und \u00dcberflutung.',
           '\u0423\u0440\u043e\u0432\u0435\u043d\u044c \u043c\u043e\u0440\u044f \u0438\u0437 \u043c\u043e\u0434\u0435\u043b\u0438 Open-Meteo Marine; \u043d\u0430\u0436\u043c\u0438\u0442\u0435 \u043f\u043e\u0431\u0435\u0440\u0435\u0436\u044c\u0435 \u0434\u043b\u044f \u0442\u0430\u0431\u043b\u0438\u0446\u044b \u0438 \u0437\u0430\u0442\u043e\u043f\u043b\u0435\u043d\u0438\u044f.',
           'Nivel del mar del modelo Open-Meteo Marine; toque una costa para su tabla e inundaci\u00f3n.')+'</div>';
      function overview(failed){
        if(!on||at) return;                       /* a tapped point owns the window until the next scan */
        const t0=when();
        let body;
        if((gridBusy||scanning)&&!stations.length) body='<div class="wp-t-body">'+L('Scanning the coast in view\u2026','\u8868\u793a\u4e2d\u306e\u6d77\u5cb8\u3092\u8d70\u67fb\u3057\u3066\u3044\u307e\u3059\u2026','K\u00fcste wird abgetastet\u2026','\u0421\u043a\u0430\u043d\u0438\u0440\u043e\u0432\u0430\u043d\u0438\u0435 \u043f\u043e\u0431\u0435\u0440\u0435\u0436\u044c\u044f\u2026','Explorando la costa\u2026')+'</div>';
        else if(failed) body='<div class="wp-t-body">\u26a0 '+L('The tide model could not be fetched.','\u6f6e\u6c50\u30c7\u30fc\u30bf\u3092\u53d6\u5f97\u3067\u304d\u307e\u305b\u3093\u3067\u3057\u305f\u3002','Gezeitendaten nicht abrufbar.','\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043f\u043e\u043b\u0443\u0447\u0438\u0442\u044c \u0434\u0430\u043d\u043d\u044b\u0435.','No se pudieron obtener los datos.')+'</div>';
        else if(!stations.length) body='<div class="wp-t-body">'+L('No coast in this view \u2014 pan to a coastline, or tap one for its tide times.','\u3053\u306e\u8868\u793a\u7bc4\u56f2\u306b\u6d77\u5cb8\u304c\u3042\u308a\u307e\u305b\u3093\u3002\u6d77\u5cb8\u7dda\u307e\u3067\u79fb\u52d5\u3059\u308b\u304b\u3001\u6d77\u5cb8\u3092\u30bf\u30c3\u30d7\u3057\u3066\u304f\u3060\u3055\u3044\u3002','Keine K\u00fcste im Bild.','\u0412 \u044d\u0442\u043e\u043c \u0432\u0438\u0434\u0435 \u043d\u0435\u0442 \u043f\u043e\u0431\u0435\u0440\u0435\u0436\u044c\u044f.','No hay costa en esta vista.')+'</div>';
        else {
          const rows=stations.slice().sort((a,b)=>(a.next?a.next.t:Infinity)-(b.next?b.next.t:Infinity)).slice(0,8);
          body='<div class="wp-t-body"><div style="font-size:11.5px;color:var(--text-muted);margin-bottom:4px;">'
            +stations.length+' '+L('coasts in view \u00b7 level now, and the next turn','\u304b\u6240\uff08\u73fe\u5728\u306e\u6f6e\u4f4d\u3068\u6b21\u306e\u8ee2\u6d41\uff09','K\u00fcstenpunkte','\u0442\u043e\u0447\u0435\u043a \u043f\u043e\u0431\u0435\u0440\u0435\u0436\u044c\u044f','puntos de costa')+'</div>'
            +rows.map(st=>'<div style="display:flex;justify-content:space-between;gap:8px;padding:2px 0;border-bottom:1px solid var(--glass-border,rgba(128,128,128,0.16));font-size:11.5px;">'
              +'<span>'+st.lat.toFixed(1)+', '+st.lng.toFixed(1)+'</span>'
              +'<b>'+st.lv.toFixed(2)+' m</b>'
              +'<span style="color:var(--text-muted);">'+(st.next?((st.next.high?'\u25b2 ':'\u25bc ')+esc(fmtT(st.next.t))):'\u2014')+'</span></div>').join('')
            +'<div style="margin-top:5px;color:var(--text-muted);font-size:11px;">'+esc(fmtT(t0))+'</div></div>'; }
        openTide(body); drawStations(); }

      async function fetchSeries(lng,lat,when){
        const day=new Date(when); const iso=(d)=>d.toISOString().slice(0,10);
        const a=new Date(day.getTime()-36*3600e3), b=new Date(day.getTime()+36*3600e3);
        const u='https://marine-api.open-meteo.com/v1/marine?latitude='+lat.toFixed(4)+'&longitude='+lng.toFixed(4)
          +'&hourly=sea_level_height_msl&timezone=UTC&start_date='+iso(a)+'&end_date='+iso(b);
        const r=await fetch(u); if(!r.ok) throw new Error('marine '+r.status);
        const j=await r.json(); const h=j.hourly||{};
        const t=(h.time||[]).map(s=>Date.parse(s+'Z')), v=h.sea_level_height_msl||[];
        const pts=[]; for(let i=0;i<t.length;i++) if(isFinite(t[i])&&v[i]!=null) pts.push([t[i],+v[i]]);
        return pts; }

      /* local extrema, with a parabolic refinement so the minute is the model's and not the sample's */
      function extrema(pts){ const out=[];
        for(let i=1;i<pts.length-1;i++){ const a=pts[i-1][1], b=pts[i][1], c=pts[i+1][1];
          const isHigh=(b>=a&&b>=c&&(b>a||b>c)), isLow=(b<=a&&b<=c&&(b<a||b<c));
          if(!isHigh&&!isLow) continue;
          const den=(a-2*b+c); const off=(Math.abs(den)>1e-9)?(0.5*(a-c)/den):0;
          const dt=pts[i+1][0]-pts[i][0];
          const t=pts[i][0]+off*dt, h=b-0.25*(a-c)*off;
          /* ⚠ (#R211) A FLAT TURN IS ONE TURN, NOT TWO. Around slack water two consecutive hourly
             samples can both satisfy the (>= , >=, one strict) test, and the refinement then puts
             them within minutes of each other — the panel showed the same high tide twice, at the
             same clock time, 1 cm apart. Keep the more extreme of any pair inside half a cycle
             (90 min); a real semi-diurnal tide never turns twice that close. */
          const last=out[out.length-1];
          if(last&&last.high===isHigh&&Math.abs(t-last.t)<90*60e3){
            if((isHigh&&h>last.h)||(!isHigh&&h<last.h)){ last.t=t; last.h=h; }
            continue; }
          out.push({ t, h, high:isHigh }); }
        return out; }
      function levelAt(pts,when){ if(!pts||pts.length<2) return null;
        for(let i=0;i<pts.length-1;i++){ if(when>=pts[i][0]&&when<=pts[i+1][0]){
          const f=(when-pts[i][0])/Math.max(1,pts[i+1][0]-pts[i][0]);
          return pts[i][1]*(1-f)+pts[i+1][1]*f; } }
        return null; }

      /* the same bathtub the sea-level layer draws, at the tide's own level */
      /* ══ ⚠ (#R218) THE SEA IS MAPPED BEFORE ANYTHING IS TAPPED ═══════════════════════════════════
         「潮汐レイヤーは地点を選択する前から海面をマッピングしておけ。」 Confirmed this round: the same
         shading as before, only without having to guess where to click first. #R215 made the layer
         SCAN the coast on switch-on — the dots and the times have been there since — but the SHADING
         (ground at or below the water) was still painted only from `probe()`, i.e. only after a tap.
         So the layer's most visual answer waited for a gesture that nothing on screen asked for.
         `paintFlood` never used the coordinates it was handed anyway: it paints the whole viewport at
         one level. It now takes a LEVEL FUNCTION instead of a number, so the same routine draws the
         tapped point's level everywhere (as before) or, with no tap, the level of the NEAREST SCANNED
         COAST for each cell.
         ⚠ Nearest, not interpolated, and that is a claim about what is known: each station's level is
         a model value for THAT point, and the honest thing to paint a cell with is the measurement
         nearest to it — not a smooth surface through them, which would invent a tide between two
         coasts that the model was never asked about. The panel says which it is. */
      function paintFlood(lng,lat,level){
        const at=(typeof level==='function')?level:()=>level;
        try{ const b=GE().camera.getBounds(); if(!b) return;
          const W=b.getWest(), E=b.getEast(), S=b.getSouth(), N=b.getNorth();
          const NX=220, NY=Math.max(40,Math.round(NX*(N-S)/Math.max(1e-9,E-W)));
          const cv=document.createElement('canvas'); cv.width=NX; cv.height=NY;
          const ct=cv.getContext('2d'), im=ct.createImageData(NX,NY), px=im.data;
          let wet=0;
          for(let j=0;j<NY;j++){ const la=N-(j+0.5)*(N-S)/NY;
            for(let i=0;i<NX;i++){ const lo=W+(i+0.5)*(E-W)/NX;
              const level2=at(lo,la); if(level2==null||!isFinite(level2)) continue;
              let e=null; try{ e=HOST.demElevBilinear(lo,la,10); if(e==null) e=HOST.demElevAt(lo,la,null,10); }catch(_){}
              if(e==null||!isFinite(e)) continue;
              if(e<=level2){ const d=Math.max(0,level2-e), o=(j*NX+i)*4, s=Math.min(1,d/3);
                px[o]=Math.round(96-40*s); px[o+1]=Math.round(190-70*s); px[o+2]=255; px[o+3]=Math.round(120+90*s); wet++; } } }
          ct.putImageData(im,0,0);
          const coords=[[W,N],[E,N],[E,S],[W,S]];
          const url=cv.toDataURL('image/png');
          if(GE().layers.hasSource(IMG)) GE().layers.updateImage(IMG,{url,coordinates:coords});
          else { GE().layers.addSource(IMG,{type:'image',url,coordinates:coords});
            GE().layers.add({id:LYR,type:'raster',source:IMG,paint:{'raster-opacity':0.85,'raster-fade-duration':0,'raster-resampling':'nearest'}}); }
          return wet; }catch(_){ return 0; } }
      function clearFlood(){ try{ if(GE().layers.has(LYR)) GE().layers.remove(LYR); }catch(_){}
        try{ if(GE().layers.hasSource(IMG)) GE().layers.removeSource(IMG); }catch(_){} }
      /* the level of the nearest scanned coast, for a cell nobody tapped (#R218). Cells further than
         `FAR_DEG` from every station are left alone: past that the nearest measurement is not about
         this water any more, and painting it would be an extrapolation nothing asked for. */
      const FAR_DEG=6;
      function stationLevelFn(){
        if(!stations.length) return null;
        const st=stations.filter(s=>s&&isFinite(s.lv));
        if(!st.length) return null;
        return (lo,la)=>{ let best=null, bd=Infinity;
          for(const s of st){ const dx=(lo-s.lng)*Math.cos(la*Math.PI/180), dy=la-s.lat, d=dx*dx+dy*dy;
            if(d<bd){ bd=d; best=s; } }
          return (best&&bd<=FAR_DEG*FAR_DEG)?best.lv:null; }; }
      /* what the layer shades with no tap: the scanned coasts. Called after a scan and after the
         clock moves inside the cached window (restatAll). A tapped point owns the picture instead. */
      function paintFloodFromStations(){
        if(at) return;                                     /* a tapped point is showing its own level */
        const fn=stationLevelFn();
        if(!fn){ clearFlood(); return; }
        try{ paintFlood(null,null,fn); }catch(_){} }

      function fmtT(ms){ try{ return new Date(ms).toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}); }catch(_){ return new Date(ms).toISOString().slice(0,16).replace('T',' '); } }
      function when(){ try{ const st=window.IntMapTime.state(); return st.isLive?Date.now():+new Date(st.when); }catch(_){ return Date.now(); } }
      const isLive=()=>{ try{ return window.IntMapTime.isLive(); }catch(_){ return true; } };
      /* ══ (#R216) THE DATE FIELD AND THE PLAY BUTTON ═══════════════════════════════════════════════
         Local time in the field, because a tide table is read in local time; the master clock stores
         the instant. Steps are the shape of the phenomenon — an hour, and 6h12m, which is a quarter
         of the mean semi-diurnal period (12h25m), i.e. high water → slack → low water. */
      const TB='padding:3px 6px;border-radius:7px;border:1px solid var(--glass-border,rgba(128,128,128,0.28));background:var(--input-bg);color:var(--text-main);font-size:11px;cursor:pointer;line-height:1.1;';
      function localValue(ms){ const d=new Date(ms-new Date(ms).getTimezoneOffset()*60e3); return d.toISOString().slice(0,16); }
      function timeBar(){
        const live=isLive();
        return '<div class="wp-t-time" style="display:flex;flex-wrap:wrap;align-items:center;gap:4px;margin-bottom:5px;">'
          +'<button class="wp-t-step" data-d="-6.2" title="'+esc(L('back a quarter cycle (6h12m)','1/4周期戻る（6時間12分）','ein Viertelzyklus zurück','на четверть цикла назад','un cuarto de ciclo atrás'))+'" style="'+TB+'">«</button>'
          +'<button class="wp-t-step" data-d="-1" title="'+esc(L('an hour back','1時間前','eine Stunde zurück','на час назад','una hora atrás'))+'" style="'+TB+'">‹</button>'
          +'<button class="wp-t-play" style="'+TB+'min-width:26px;">'+(playTmr?'⏸':'▶')+'</button>'
          +'<button class="wp-t-step" data-d="1" title="'+esc(L('an hour on','1時間後','eine Stunde weiter','на час вперёд','una hora adelante'))+'" style="'+TB+'">›</button>'
          +'<button class="wp-t-step" data-d="6.2" title="'+esc(L('on a quarter cycle (6h12m)','1/4周期進む（6時間12分）','ein Viertelzyklus weiter','на четверть цикла вперёд','un cuarto de ciclo adelante'))+'" style="'+TB+'">»</button>'
          +'<input class="wp-t-when" type="datetime-local" style="flex:1 1 152px;min-width:132px;'+TB+'cursor:auto;font-variant-numeric:tabular-nums;">'
          +'<button class="wp-t-live" style="'+TB+(live?'background:var(--primary-color);color:#fff;border-color:var(--primary-color);':'')+'">● '+L('Live','ライブ','Live','Сейчас','En vivo')+'</button>'
          +'</div>'; }
      function setWhen(ms){ try{ window.IntMapTime.set(new Date(ms),{allowFuture:true,source:'tides'}); }catch(_){} }
      function stopPlay(){ if(playTmr){ clearInterval(playTmr); playTmr=0; } }
      function togglePlay(){
        if(playTmr){ stopPlay(); }
        else playTmr=setInterval(()=>{ if(!on){ stopPlay(); return; } setWhen(when()+playStep); },240);
        const b=panel.body(), pb=b&&b.querySelector('.wp-t-play'); if(pb) pb.textContent=playTmr?'⏸':'▶'; }
      function wireTime(b){
        if(!b) return;
        const w=b.querySelector('.wp-t-when');
        if(w&&document.activeElement!==w) w.value=localValue(when());
        if(w) w.onchange=()=>{ const d=new Date(w.value); if(!isNaN(d.getTime())){ stopPlay(); setWhen(+d); } };
        b.querySelectorAll('.wp-t-step').forEach(x=>x.onclick=()=>{ stopPlay(); setWhen(when()+parseFloat(x.getAttribute('data-d'))*3600e3); });
        const pb=b.querySelector('.wp-t-play'); if(pb) pb.onclick=togglePlay;
        const lb=b.querySelector('.wp-t-live'); if(lb) lb.onclick=()=>{ stopPlay(); try{ window.IntMapTime.setNow({source:'tides'}); }catch(_){} }; }
      /* every open of this panel goes through here, so the controls are never missing from one of them */
      function openTide(bodyHTML,note){ const b=panel.open(timeBar()+bodyHTML+(note==null?SRCNOTE():note)); wireTime(b); return b; }

      async function probe(lng,lat){
        at=[lng,lat]; busy=true;
        /* (#R220) the mark goes down on the TAP, not when the model answers — otherwise the one
           second the reader is still looking at their finger is the one second there is nothing to see. */
        try{ drawStations(); }catch(_){}
        const b=openTide('<div class="wp-t-body">'+L('Reading the tide…','潮位を取得中…','Gezeiten werden gelesen…','Чтение прилива…','Leyendo la marea…')+'</div>',
          '<div style="font-size:9.5px;color:var(--text-muted);line-height:1.5;">'
          +L('Sea level above mean sea level from the Open-Meteo Marine model, hourly, at the point you tapped. Highs and lows are the local extrema of that series (refined between samples). The shading is the ground at or below the current tide level, read from the same elevation model the sea-level layer uses — a still-water fill, not a run-up model.',
             '出典は Open-Meteo Marine の1時間ごとの平均海面基準の潮位（タップした地点）。満潮・干潮はその系列の極値（標本間を補間して算出）。塗りは現在の潮位以下の地面で、Sea-level change と同じ標高データを使った静水面の塗りです（遡上モデルではありません）。',
             'Pegel aus dem Open-Meteo-Marine-Modell; Füllung ist Gelände unter dem Pegel (Stillwasser).',
             'Уровень моря из модели Open-Meteo Marine; заливка — суша ниже уровня (стоячая вода).',
             'Nivel del mar del modelo Open-Meteo Marine; el sombreado es el terreno bajo ese nivel (agua en reposo).')+'</div>');
        drawStations();
        const host=b.querySelector('.wp-t-body');
        try{
          const t0=when();
          series=await fetchSeries(lng,lat,t0);
          if(!series.length){ host.innerHTML='⚠ '+L('No tide model at this point (inland or outside the model domain).','この地点には潮汐モデルがありません（内陸またはモデル範囲外）。','Kein Gezeitenmodell an diesem Punkt.','Нет модели прилива в этой точке.','Sin modelo de marea en este punto.'); busy=false; return; }
          const lv=levelAt(series,t0);
          const wet=(lv!=null)?paintFlood(lng,lat,lv):0;
          probeHtml(t0,lv,wet);
        }catch(e){ host.innerHTML='⚠ '+L('The tide model could not be fetched.','潮汐データを取得できませんでした。','Gezeitendaten nicht abrufbar.','Не удалось получить данные.','No se pudieron obtener los datos.'); }
        busy=false; }
      /* (#R216) the tapped point's table, at whatever instant the clock is on — split out of probe()
         so scrubbing and playback can re-draw it from the series that is already in hand */
      function probeHtml(t0,lv,wet){
        const b=panel.body(); const host=b&&b.querySelector('.wp-t-body'); if(!host||lv==null) return;
        const ex=extrema(series).filter(x=>Math.abs(x.t-t0)<30*3600e3).sort((a,b2)=>a.t-b2.t);
        host.innerHTML='<div style="font-weight:700;font-size:13px;">'+lv.toFixed(2)+' m <span style="font-weight:400;color:var(--text-muted);font-size:11px;">'+L('above MSL','平均海面基準','über NN','над средним уровнем','sobre el nivel medio')+'</span></div>'
          +'<div style="color:var(--text-muted);font-size:11px;margin-bottom:6px;">'+fmtT(t0)+'</div>'
          +ex.slice(0,10).map(x=>'<div style="display:flex;justify-content:space-between;gap:8px;padding:2px 0;border-bottom:1px solid var(--glass-border,rgba(128,128,128,0.16));font-size:11.5px;'
              +((x.t>=t0&&(!ex.find(y=>y.t>=t0&&y.t<x.t)))?'background:rgba(46,163,216,0.16);border-radius:5px;':'')+'">'
            +'<span>'+(x.high?('▲ '+L('High tide','満潮','Hochwasser','Прилив','Pleamar')):('▼ '+L('Low tide','干潮','Niedrigwasser','Отлив','Bajamar')))+'</span>'
            +'<span>'+esc(fmtT(x.t))+'</span><b>'+x.h.toFixed(2)+' m</b></div>').join('')
          +(wet!=null?('<div style="margin-top:6px;color:var(--text-muted);font-size:11px;">'+L('Shaded cells at this level','この潮位で浸かるセル','Gefärbte Zellen','Затопленные ячейки','Celdas inundadas')+': '+wet+'</div>'):''); }

      function toggle(v){ on=v;
        if(!on){ stopPlay(); panel.hide(); clearFlood(); setVis([PT,SEL,LBL,SELLBL],false); stations=[]; at=null; gridKey=''; return; }
        at=null; stations=[]; scanning=true; overview();   /* (#R215) the window opens WITH the layer, not on a tap */
        whenDrawable(()=>{ ensureLayers(); gridKey=''; scanCoast(); });
        try{ HOST.imToast(L('Tap a coast for its tide times and how far the water reaches.','海岸をタップすると満干潮の時刻と浸水範囲が出ます。','Küste antippen für Gezeiten und Überflutung.','Нажмите побережье — время приливов и затопление.','Toque una costa para mareas e inundación.')); }catch(_){} }

      /* ⚠ (#R219) A RESTYLE DROPS EVERY ADDED LAYER — INCLUDING THE SHADING. 「（追記：海を描画する
         機能が消えている。）」 `onRestyle` put the dots and the labels back and left the flood image
         out, so any basemap swap, theme change or style reload silently ended the one thing #R218
         added — the sea painted before a tap — until the next scan happened to run. The shading is
         re-drawn from the stations already in hand: no request, and no waiting for a pan. */
      onRestyle(()=>{ if(on) whenDrawable(()=>{ ensureLayers(); drawStations();
        if(at&&series&&series.length){ const lv=levelAt(series,when()); if(lv!=null) paintFlood(at[0],at[1],lv); }
        else paintFloodFromStations(); }); });
      try{ GE().events.on('moveend',()=>{ if(on) setTimeout(scanCoast,180); }); }catch(_){}
      mapClick((e)=>{ if(!on) return false; probe(e.lngLat.lng,e.lngLat.lat); return true; });
      /* the clock drives BOTH: the tapped point's table and the whole visible coast (#R212).
         ⚠ (#R216) …and it is now also what the panel's own date field and play button move, so this
         has to be cheap: while the instant is still inside the series every station already holds,
         redraw from that series. Only leaving the window costs a request. */
      onYear(()=>{ if(!on) return;
        const t0=when();
        if(covered(t0)){ restatAll(t0); return; }
        stopPlay(); gridKey=''; scanCoast(); if(at) probe(at[0],at[1]); });

      STATE.tides=()=>({ on, at, points:series?series.length:0, stations:stations.length,
        levels:stations.slice(0,4).map(s=>+s.lv.toFixed(2)) });
      STATE.tideProbe=(lng,lat)=>probe(+lng,+lat);
      window.__wpTides={ toggle };
    })();

    /* ══════════════════════════════════════════════════════════════════════════════════════════════
     *  5 · CROPS — where a chosen crop is grown, and how well
     * ----------------------------------------------------------------------------------------------
     *  「作物を選択可能、高画質の栽培地域表示。」 追記「いやだから国別に色分けしろなんて誰がいったんだよ。」
     *
     *  ⚠ (#R212) #R211 SHADED COUNTRIES BECAUSE IT CONCLUDED NO CROP-BY-CROP RASTER WAS REACHABLE.
     *  That conclusion was wrong, and finding out took one request: FAO's own GAEZ v4 data portal is
     *  served by an ArcGIS ImageServer (gaez-services.fao.org, theme res06 「Area, Yield and
     *  Production」) which answers exportImage / identify / statistics with an
     *  Access-Control-Allow-Origin header echoing the caller — measured, including the OPTIONS
     *  preflight. It carries 31 crops × 2 reference years × {irrigated, rainfed, total} × {harvested
     *  area, yield, production} on a 5-arcmin grid: the picture in the attached image, from the
     *  people who publish it.
     *
     *  HOW IT IS DRAWN. The server is asked for the CURRENT VIEW as a linear grey stretch between
     *  the raster's own measured minimum and maximum (fetched once per raster from
     *  computeStatisticsHistograms — never a dynamic per-view stretch, which would make the same
     *  colour mean a different number after every pan), and this file recolours those greys through
     *  the ramp below, with transparency where there is no crop. So the legend can print the real
     *  numbers and the units, and a tap can ask `identify` for the value AT THAT PIXEL.
     * ════════════════════════════════════════════════════════════════════════════════════════════*/
    const CROP_RAMP=[[0,'#f2fae6'],[0.16,'#cdeaa4'],[0.34,'#8fcc63'],[0.55,'#3f9e46'],[0.76,'#136b31'],[1,'#03230f']];
    (function crops(){
      const IMG='wp-crop-src', LYR='wp-crop-img';
      const GAEZ='https://gaez-services.fao.org/server/rest/services/res06/ImageServer';
      /* GAEZ's own crop names, with the app's five languages for the ones people ask for by name */
      const CROPS=[LA('Wheat','小麦','Weizen','Пшеница','Trigo'),LA('Wetland rice','稲（水田）','Nassreis','Рис (заливной)','Arroz de regadío'),LA('Maize','とうもろこし','Mais','Кукуруза','Maíz'),LA('Soybean','大豆','Sojabohne','Соя','Soja'),
        LA('Barley','大麦','Gerste','Ячмень','Cebada'),LA('Sorghum','ソルガム','Sorghum','Сорго','Sorgo'),LA('Millet','雑穀（ミレット）','Hirse','Просо','Mijo'),LA('Other cereals','その他の穀物','Andere Getreide','Прочие зерновые','Otros cereales'),
        LA('Potato and sweet potato','ばれいしょ・かんしょ','Kartoffel und Süßkartoffel','Картофель и батат','Patata y batata'),LA('Cassava','キャッサバ','Maniok','Маниок','Yuca'),LA('Yams and other roots','ヤム・その他いも類','Yams und andere Wurzeln','Ямс и другие корнеплоды','Ñame y otras raíces'),
        LA('Sugarcane','さとうきび','Zuckerrohr','Сахарный тростник','Caña de azúcar'),LA('Sugarbeet','てんさい','Zuckerrübe','Сахарная свёкла','Remolacha azucarera'),LA('Pulses','豆類','Hülsenfrüchte','Зернобобовые','Legumbres'),LA('Groundnut','落花生','Erdnuss','Арахис','Cacahuete'),
        LA('Rapeseed','なたね','Raps','Рапс','Colza'),LA('Sunflower','ひまわり','Sonnenblume','Подсолнечник','Girasol'),LA('Oil palm','アブラヤシ','Ölpalme','Масличная пальма','Palma aceitera'),LA('Olive','オリーブ','Olive','Олива','Olivo'),
        LA('Cotton','綿','Baumwolle','Хлопок','Algodón'),LA('Banana','バナナ','Banane','Банан','Plátano'),LA('Citrus','柑橘','Zitrusfrüchte','Цитрусовые','Cítricos'),LA('Fruits and nuts','果実・ナッツ','Obst und Nüsse','Фрукты и орехи','Frutas y frutos secos'),
        LA('Vegetables','野菜','Gemüse','Овощи','Hortalizas'),LA('Stimulants','嗜好作物（コーヒー・茶・カカオ）','Genussmittel (Kaffee, Tee, Kakao)','Тонизирующие культуры (кофе, чай, какао)','Cultivos estimulantes (café, té, cacao)'),LA('Tobacco','たばこ','Tabak','Табак','Tabaco'),
        LA('Fodder crops','飼料作物','Futterpflanzen','Кормовые культуры','Cultivos forrajeros'),LA('Cereals','穀物（合計）','Getreide (gesamt)','Зерновые (всего)','Cereales (total)'),LA('Oil seeds','油糧種子（合計）','Ölsaaten (gesamt)','Масличные (всего)','Oleaginosas (total)'),
        LA('Root crops','いも類（合計）','Wurzelfrüchte (gesamt)','Корнеплоды (всего)','Raíces y tubérculos (total)'),LA('Main crops','主要作物（合計）','Hauptkulturen (gesamt)','Основные культуры (всего)','Cultivos principales (total)')];
      const VARS=[LA('Harvested area','作付面積','Anbaufläche','Убранная площадь','Superficie cosechada'),
        LA('Yield','収量','Ertrag','Урожайность','Rendimiento'),
        LA('Production','生産量','Produktion','Производство','Producción')];
      const SUPPLY=[LA('Total','合計','Gesamt','Всего','Total'),LA('Rainfed','天水','Regenfeld','Богарное','Secano'),
        LA('Irrigated','灌漑','Bewässert','Орошаемое','Regadío')];
      let on=false, crop='Wheat', variable='Harvested area', supply='Total', busy=false, drawKey='', lastMeta=null;
      const panel=makePanel('wp-crop-panel',()=>'🌾 '+L('Crop cultivation','作物の栽培','Feldfrüchte','Сельхозкультуры','Cultivos'),'wp-dl-crops',
        { legendId:'wpcrop', layers:()=>[LYR],
          names:()=>(LA('🌾 Crop cultivation','🌾 作物の栽培','🌾 Feldfrüchte','🌾 Сельхозкультуры','🌾 Cultivos')) });
      /* ⚠ (#R241) this was `HOST.lang==='jp' ? r[1] : k` — thirty-one crop names in English on
         every language but Japanese, in a shape no instrument reads (the two-branch audit sees
         `jp ? 'literal' : 'literal'`, and both arms here are variables). */
      const cropName=(k)=>{ const r=CROPS.find(c=>c[0]===k); return r?L.arr(r):k; };
      const varName=(v)=>{ const r=VARS.find(x=>x[0]===v); return r?L.arr(r):v; };
      const supName=(s)=>{ const r=SUPPLY.find(x=>x[0]===s); return r?L.arr(r):s; };
      /* the reference years GAEZ publishes; the clock picks the nearer one and the panel says which */
      const gaezYear=()=>(nowYear()<2005?'2000':'2010');

      const R=6378137, HALF=Math.PI*R;
      const mercX=(lng)=>lng*HALF/180;
      const mercY=(lat)=>{ const l=Math.max(-85.05112878,Math.min(85.05112878,lat));
        return Math.log(Math.tan(Math.PI/4+l*Math.PI/360))*R; };
      const invY=(y)=>(2*Math.atan(Math.exp(y/R))-Math.PI/2)*180/Math.PI;

      /* ══ ⚠ (#R219) A CACHED REJECTION IS A LAYER THAT NEVER WORKS AGAIN ═══════════════════════════
         「作物栽培レイヤーで、読み込み時間が長い…（追記：まったく何も起こらなくなってしまった）」
         Not reproducible here (measured: the FAO picture draws on localhost and on the production
         origin, globally and at z4). What IS certainly wrong is the failure path, and it has exactly
         the shape of the report: `_cat` and `_stats[oid]` memoise the PROMISE, so one refused request
         — a dropped connection, a proxy hiccup, one 500 from ArcGIS — is remembered as the answer for
         the rest of the session. Every later paint awaits the same rejected promise and throws before
         it asks anything, and `drawKey` has already been latched to the cell that failed, so panning
         back to it does not retry either. From the reader's side that is 「まったく何も起こらない」,
         permanently, from one transient error. A rejection is now forgotten, and a failed draw
         releases its key. */
      let _cat=null;
      function catalog(){ if(_cat) return _cat;
        _cat=(async()=>{ const u=GAEZ+'/query?where='+encodeURIComponent("1=1")
            +'&outFields=OBJECTID,Name,variable,crop,year,water_supply,units&returnGeometry=false&f=json&resultRecordCount=2000';
          const r=await fetch(u); if(!r.ok) throw new Error('gaez catalog '+r.status);
          const j=await r.json(); const by=Object.create(null);
          (j.features||[]).forEach(f=>{ const a=f.attributes||{};
            by[[a.crop,a.year,a.variable,a.water_supply].join('|')]=a; });
          return by; })().catch(e=>{ _cat=null; throw e; });
        return _cat; }
      const _stats=Object.create(null);
      async function statsFor(oid){ if(_stats[oid]) return _stats[oid];
        _stats[oid]=(async()=>{ const mr=encodeURIComponent(JSON.stringify({mosaicMethod:'esriMosaicNone',where:'OBJECTID='+oid}));
          const g=encodeURIComponent(JSON.stringify({xmin:-180,ymin:-60,xmax:180,ymax:83,spatialReference:{wkid:4326}}));
          const r=await fetch(GAEZ+'/computeStatisticsHistograms?geometry='+g+'&geometryType=esriGeometryEnvelope&mosaicRule='+mr+'&f=json');
          if(!r.ok) throw new Error('gaez stats '+r.status);
          const j=await r.json(); const s=(j.statistics||[])[0];
          if(!s) throw new Error('gaez stats empty');
          return { min:+s.min, max:+s.max, mean:+s.mean }; })().catch(e=>{ delete _stats[oid]; throw e; });
        return _stats[oid]; }

      /* grey → the ramp, with nothing drawn where there is no crop */
      function recolor(img,W,H){
        const cv=document.createElement('canvas'); cv.width=W; cv.height=H;
        const ct=cv.getContext('2d'); ct.drawImage(img,0,0,W,H);
        let d; try{ d=ct.getImageData(0,0,W,H); }catch(_){ return null; }
        const px=d.data;
        /* the ramp, expanded to 256 entries once per repaint rather than per pixel */
        const lut=new Uint8Array(256*3);
        for(let i=0;i<256;i++){ const t=i/255; let a=CROP_RAMP[0], b=CROP_RAMP[CROP_RAMP.length-1];
          for(let k=0;k<CROP_RAMP.length-1;k++){ if(t>=CROP_RAMP[k][0]&&t<=CROP_RAMP[k+1][0]){ a=CROP_RAMP[k]; b=CROP_RAMP[k+1]; break; } }
          const f=(b[0]-a[0]>1e-9)?(t-a[0])/(b[0]-a[0]):0;
          const ca=parseInt(a[1].slice(1),16), cb=parseInt(b[1].slice(1),16);
          lut[i*3]=Math.round(((ca>>16)&255)*(1-f)+((cb>>16)&255)*f);
          lut[i*3+1]=Math.round(((ca>>8)&255)*(1-f)+((cb>>8)&255)*f);
          lut[i*3+2]=Math.round((ca&255)*(1-f)+(cb&255)*f); }
        let n=0;
        for(let i=0;i<px.length;i+=4){
          const g=px[i], al=px[i+3];
          if(al<8||g===0){ px[i+3]=0; continue; }
          px[i]=lut[g*3]; px[i+1]=lut[g*3+1]; px[i+2]=lut[g*3+2];
          /* ══ ⚠ (#R216) A DATA CELL IS OPAQUE. THE VALUE IS THE COLOUR. ═══════════════════════════
             「作物栽培レイヤーは透明度100%が全然100%ではない。」 — and it could not be: this line used
             to bake `0.30 + 0.70·value` into the PNG's own alpha channel, so a low-value cell was 30 %
             transparent BEFORE `raster-opacity` was applied. Dragging the shared slider to 100 % set
             the layer to 1.0 over an image that was already see-through, and the reader was right that
             it never got there. It is the same defect #R215 removed from the energy choropleth (a
             `['case', …]` in `fill-opacity` competing with the one slider that owns opacity), one
             layer down: the ramp above already says what the number is, so opacity says nothing and
             belongs entirely to the control the reader is holding. No-crop (g===0) stays transparent
             — that is absence of data, not a small value. */
          px[i+3]=255;
          n++; }
        ct.putImageData(d,0,0);
        return { url:cv.toDataURL('image/png'), n }; }

      /* ══ ⚠ (#R218) THE TILE THE VIEW SITS IN, NOT THE VIEW ═══════════════════════════════════════
         「作物栽培レイヤーで、読み込み時間が長い。いちいち地図の見る場所を変えるたびに、読み込みまで
          待たないといけないのは不便。」 The request was the VIEWPORT'S EXACT BOX, so every pan — every
         one, of any size — produced a key nothing had seen before, and the layer went back to FAO for
         a picture that overlapped the one already on screen by 95 %.
         The box is now snapped to a quadtree cell whose size is chosen to be about a viewport wide,
         and the answer is KEPT. Panning inside that cell costs nothing at all; crossing its edge costs
         one request; and coming back to somewhere already visited is instant, because the cache is
         keyed by (crop, variable, supply, year, cell) and a cell is a place rather than a moment.
         ⚠ The picture is not coarser for it: the request's pixel count scales with the box, so one
         screen pixel still carries what it carried — see PW below. The FAO grid itself is ~9 km, so
         both are well past what the data can say either way. */
      const _cache=new Map(); const CACHE_MAX=14;
      function _cacheGet(k){ const v=_cache.get(k); if(v){ _cache.delete(k); _cache.set(k,v); } return v; }
      function _cachePut(k,v){ _cache.set(k,v);
        while(_cache.size>CACHE_MAX){ const first=_cache.keys().next().value; const o=_cache.get(first);
          _cache.delete(first); try{ if(o&&o.url&&o.url.indexOf('blob:')===0) URL.revokeObjectURL(o.url); }catch(_){} } }
      /* the quadtree cell covering the view, in Mercator metres, aligned so it is the same cell for
         every camera inside it */
      function _cellBox(W,E,S,N){
        const x0=mercX(W), x1=mercX(E), y0=mercY(S), y1=mercY(N);
        const world=2*HALF, vw=Math.max(1,x1-x0);
        const lvl=Math.max(0,Math.min(14,Math.round(Math.log2(world/vw))));
        const step=world/Math.pow(2,lvl);
        const q=(v,dir)=>(dir<0?Math.floor(v/step):Math.ceil(v/step))*step;
        const X0=Math.max(-HALF,q(x0,-1)), X1=Math.min(HALF,q(x1,1));
        const Y0=Math.max(mercY(-58),q(y0,-1)), Y1=Math.min(mercY(83),q(y1,1));
        return { X0, X1, Y0, Y1, lvl, vw };
      }
      async function paint(force){
        if(!on||busy) return;
        let b,z; try{ b=GE().camera.getBounds(); z=GE().camera.getZoom(); }catch(_){ return; }
        if(!b) return;
        const W=Math.max(-180,b.getWest()), E=Math.min(180,b.getEast()), S=Math.max(-58,b.getSouth()), N=Math.min(83,b.getNorth());
        if(!(E>W&&N>S)) return;
        const yr=gaezYear();
        const cell=_cellBox(W,E,S,N);
        if(!(cell.X1>cell.X0&&cell.Y1>cell.Y0)) return;
        const key=[crop,variable,supply,yr,cell.lvl,Math.round(cell.X0),Math.round(cell.Y0),Math.round(cell.X1),Math.round(cell.Y1)].join('|');
        if(!force&&key===drawKey) return;
        /* a cell this session has already fetched goes straight to the map — no request, no wait */
        const hit=_cacheGet(key);
        if(hit&&!force){ drawKey=key; lastMeta=hit.meta;
          whenDrawable(()=>{ try{
            if(GE().layers.hasSource(IMG)) GE().layers.updateImage(IMG,{url:hit.url,coordinates:hit.coords});
            else { GE().layers.addSource(IMG,{type:'image',url:hit.url,coordinates:hit.coords});
              GE().layers.add({id:LYR,type:'raster',source:IMG,
                paint:{'raster-opacity':0.85,'raster-fade-duration':0,'raster-resampling':'nearest'}},
                GE().layers.has('tool-poly')?'tool-poly':undefined); }
            panel.claim(); setVis([LYR],on); }catch(_){} });
          render(); return; }
        drawKey=key; busy=true;
        /* ⚠ (#R220) 「「FAO のグリッドを取得中…」という文言はいらない。」 — and it is not needed for
           anything: the line was a progress report for a fetch the reader did not ask for by name,
           printed in the one slot this panel uses to answer 「この地点は何が穫れるのか」 (the cell
           readout below). Clearing it is what a silent fetch looks like; the FAILURE line stays,
           because "nothing arrived" is an answer and needs saying. */
        stat('');
        try{
          const cat=await catalog();
          const rec=cat[[crop,yr,variable,supply].join('|')];
          if(!rec) throw new Error('no such raster');
          const st=await statsFor(rec.OBJECTID);
          const x0=cell.X0, x1=cell.X1, y0=cell.Y0, y1=cell.Y1;
          const aspect=(x1-x0)/Math.max(1,(y1-y0));
          /* the same pixels per screen pixel the viewport request had, over a box that is bigger than
             the viewport — so nothing is softer than it was, and the ceiling is what the service and
             the canvas will carry */
          const PW=Math.max(320,Math.min(2048,Math.round((window.innerWidth||1200)*1.25*(x1-x0)/Math.max(1,cell.vw))));
          const PH=Math.max(200,Math.min(2048,Math.round(PW/Math.max(0.05,aspect))));
          const mr=encodeURIComponent(JSON.stringify({mosaicMethod:'esriMosaicNone',where:'OBJECTID='+rec.OBJECTID}));
          const rr=encodeURIComponent(JSON.stringify({rasterFunction:'Stretch',rasterFunctionArguments:{
            StretchType:5, Statistics:[[st.min,st.max,st.mean,1]], DRA:false, UseGamma:false, Min:0, Max:255 }}));
          const u=GAEZ+'/exportImage?bbox='+[x0,y0,x1,y1].join(',')+'&bboxSR=3857&imageSR=3857&size='+PW+','+PH
            +'&format=png32&f=image&interpolation=RSP_NearestNeighbor&mosaicRule='+mr+'&renderingRule='+rr;
          const img=await new Promise((res,rej)=>{ const im=new Image(); im.crossOrigin='anonymous';
            im.onload=()=>res(im); im.onerror=()=>rej(new Error('image')); im.src=u; });
          const out=recolor(img,PW,PH);
          if(!out) throw new Error('canvas');
          /* ⚠ the corners come from THE BOX THAT WAS REQUESTED, not from the viewport — that is the
             whole point of the cell, and reading `W`/`E` here (as the viewport request did) would put
             a wider picture inside a narrower frame and shift every crop east. */
          const lngOf=(x)=>x/HALF*180;
          const coords=[[lngOf(x0),invY(y1)],[lngOf(x1),invY(y1)],[lngOf(x1),invY(y0)],[lngOf(x0),invY(y0)]];
          const meta={ st, units:rec.units, year:yr, oid:rec.OBJECTID };
          _cachePut(key,{ url:out.url, coords, meta });
          whenDrawable(()=>{ try{
            if(GE().layers.hasSource(IMG)) GE().layers.updateImage(IMG,{url:out.url,coordinates:coords});
            else { GE().layers.addSource(IMG,{type:'image',url:out.url,coordinates:coords});
              GE().layers.add({id:LYR,type:'raster',source:IMG,
                paint:{'raster-opacity':0.85,'raster-fade-duration':0,'raster-resampling':'nearest'}},
                GE().layers.has('tool-poly')?'tool-poly':undefined);
              panel.claim(); }
            panel.claim();
            setVis([LYR],on); }catch(_){} });
          lastMeta=meta;
          render();
        }catch(e){ console.warn('crops',e);
          /* ⚠ release the key, or a pan back to this cell is a silent no-op for ever (see above) */
          drawKey='';
          stat('⚠ '+L('This crop and variable could not be fetched from GAEZ — it will be tried again when the map moves.','この作物・指標を GAEZ から取得できませんでした（地図を動かすと再試行します）。','Nicht abrufbar — beim nächsten Verschieben wird es erneut versucht.','Не удалось получить — повторим при перемещении карты.','No se pudo obtener; se reintentará al mover el mapa.')); }
        busy=false; }

      function clearImg(){ try{ if(GE().layers.has(LYR)) GE().layers.remove(LYR); }catch(_){}
        try{ if(GE().layers.hasSource(IMG)) GE().layers.removeSource(IMG); }catch(_){} drawKey=''; }

      function render(){
        const st=lastMeta&&lastMeta.st, un=lastMeta?lastMeta.units:'';
        const fmt=(v)=>(v>=100?Math.round(v):v>=10?v.toFixed(1):v.toFixed(2));
        const b=panel.open(
          '<label style="'+ROW+'">'+L('Crop','作物','Feldfrucht','Культура','Cultivo')
            +'<select class="wp-crop" style="'+SEL+'">'+CROPS.map(c=>'<option value="'+esc(c[0])+'"'+(c[0]===crop?' selected':'')+'>'+esc(cropName(c[0]))+'</option>').join('')+'</select></label>'
          +'<label style="'+ROW+'">'+L('Measure','指標','Größe','Показатель','Medida')
            +'<select class="wp-cvar" style="'+SEL+'">'+VARS.map(v=>'<option value="'+esc(v[0])+'"'+(v[0]===variable?' selected':'')+'>'+esc(varName(v[0]))+'</option>').join('')+'</select></label>'
          +'<label style="'+ROW+'">'+L('Water supply','水供給','Wasserversorgung','Водоснабжение','Suministro de agua')
            +'<select class="wp-csup" style="'+SEL+'">'+SUPPLY.map(s=>'<option value="'+esc(s[0])+'"'+(s[0]===supply?' selected':'')+'>'+esc(supName(s[0]))+'</option>').join('')+'</select></label>'
          +(st?rampLegend(CROP_RAMP.map(s=>[fmt(st.min+(st.max-st.min)*s[0]),s[1]]),
              varName(variable)+' — '+un+' '+L('per 5-arcminute cell (~9 km)','（5分メッシュ＝約9km 四方あたり）','pro 5-Bogenminuten-Zelle','на ячейку 5′','por celda de 5′')):'')
          +'<div class="wp-c-stat" style="font-size:11.5px;color:var(--text-main);min-height:15px;"></div>'
          +'<div style="font-size:9.5px;color:var(--text-muted);line-height:1.5;">'
          +L('Source: FAO GAEZ v4, theme «Area, Yield and Production» — a 5-arcminute grid of where each crop is actually grown, for the reference years 2000 and 2010 (the clock picks the nearer one; this view is '+(lastMeta?lastMeta.year:'2010')+'). The color scale is fixed to this raster’s own measured minimum and maximum, so the same color means the same number wherever you pan. Tap the map for the value in that cell.',
             '出典: FAO GAEZ v4「面積・収量・生産量」——各作物が実際に栽培されている場所の5分メッシュ格子（基準年 2000 / 2010。時計が近い方を選びます。現在の表示は '+(lastMeta?lastMeta.year:'2010')+' 年）。色階はこのラスタ自身の実測の最小・最大に固定してあるので、同じ色はどこへ動かしても同じ値です。地図をタップするとそのセルの値が出ます。',
             'Quelle: FAO GAEZ v4 («Fläche, Ertrag, Produktion»), 5-Bogenminuten-Raster, Referenzjahre 2000/2010.',
             'Источник: FAO GAEZ v4 («Площадь, урожайность, производство»), сетка 5′, 2000/2010.',
             'Fuente: FAO GAEZ v4 («Superficie, rendimiento y producción»), malla de 5′, años 2000/2010.')+'</div>');
        b.querySelector('.wp-crop').onchange=(e)=>{ crop=e.target.value; lastMeta=null; paint(true); };
        b.querySelector('.wp-cvar').onchange=(e)=>{ variable=e.target.value; lastMeta=null; paint(true); };
        b.querySelector('.wp-csup').onchange=(e)=>{ supply=e.target.value; lastMeta=null; paint(true); };
        return b; }
      function stat(txt){ const b=panel.body(); const s=b&&b.querySelector('.wp-c-stat'); if(s) s.textContent=txt||''; }

      /* the value at the pixel the finger landed on — the server's own answer, not an interpolation */
      async function identify(lng,lat){
        if(!lastMeta) return;
        stat(L('Reading this cell…','このセルを取得中…','Zelle wird gelesen…','Чтение ячейки…','Leyendo la celda…'));
        try{ const mr=encodeURIComponent(JSON.stringify({mosaicMethod:'esriMosaicNone',where:'OBJECTID='+lastMeta.oid}));
          const g=encodeURIComponent(JSON.stringify({x:lng,y:lat,spatialReference:{wkid:4326}}));
          const r=await fetch(GAEZ+'/identify?geometry='+g+'&geometryType=esriGeometryPoint&mosaicRule='+mr+'&f=json&returnCatalogItems=false');
          const j=await r.json();
          const v=j&&j.value;
          const nm=countryName(countryAt(lng,lat)||'');
          if(v==null||v==='NoData'){ stat(cropName(crop)+' · '+(nm?nm+' · ':'')+L('no cultivation recorded in this cell','このセルには栽培の記録がありません','keine Anbaufläche in dieser Zelle','в этой ячейке нет посевов','sin cultivo en esta celda')); return; }
          const num=parseFloat(v);
          stat(cropName(crop)+' · '+varName(variable)+' '+(isFinite(num)?(num>=10?num.toFixed(1):num.toFixed(3)):v)+' '+(lastMeta.units||'')+(nm?(' · '+nm):''));
        }catch(_){ stat(''); } }

      function toggle(v){ on=v;
        if(!on){ setVis([LYR],false); clearImg(); panel.hide(); return; }
        render(); paint(true); }

      try{ GE().events.on('moveend',()=>{ if(on) setTimeout(()=>paint(false),200); }); }catch(_){}
      onRestyle(()=>{ if(on){ drawKey=''; whenDrawable(()=>paint(true)); } });
      mapClick((e)=>{ if(!on) return false; identify(e.lngLat.lng,e.lngLat.lat); return true; });
      onYear(()=>{ if(on){ lastMeta=null; paint(true); } });
      STATE.crops=()=>({ on, crop, variable, supply, year:gaezYear(),
        range:lastMeta?[lastMeta.st.min,lastMeta.st.max]:null, units:lastMeta?lastMeta.units:null });
      STATE.cropSet=(k,v,s)=>{ if(k){ const m=CROPS.find(c=>c[0].toLowerCase()===String(k).toLowerCase()); crop=m?m[0]:crop; }
        if(v){ const m=VARS.find(x=>x[0].toLowerCase()===String(v).toLowerCase()); if(m) variable=m[0]; }
        if(s){ const m=SUPPLY.find(x=>x[0].toLowerCase()===String(s).toLowerCase()); if(m) supply=m[0]; }
        lastMeta=null; return paint(true); };
      window.__wpCrops={ toggle };
    })();

    /* ── the six rows ──────────────────────────────────────────────────────────────────────────── */
    const LBL={
      trade:LA('Trade flows','貿易フロー','Handelsströme','Торговые потоки','Flujos comerciales'),
      /* (#R212) one row for both questions — the switch is inside the window (see §2) */
      energy:LA('Energy mix (electricity / primary)','エネルギー構成（電力・一次）','Energiemix (Strom / primär)','Энергобаланс (электро / первичная)','Mezcla energética (eléctrica / primaria)'),
      alerts:LA('Weather & disaster warnings','気象・災害警報','Wetter- und Katastrophenwarnungen','Метеопредупреждения','Avisos meteorológicos'),
      tides:LA('Tides','潮汐（満潮・干潮）','Gezeiten','Приливы','Mareas'),
      crops:LA('Crop cultivation','作物の栽培','Feldfrüchte','Сельхозкультуры','Cultivos')};
    const lbl=(k)=>L.arr(LBL[k]);
    function buildUI(){ const dd=ensureHead(); if(!dd) return;
      const H=[['trade','#ff9f0a',v=>window.__wpTrade.toggle(v)],
               ['energy','#b455ff',v=>window.__wpEnergy.toggle(v)],
               ['alerts','#ff3b30',v=>window.__wpAlerts.toggle(v)],
               ['tides','#29b6f6',v=>window.__wpTides.toggle(v)],
               ['crops','#fe9929',v=>window.__wpCrops.toggle(v)]];
      H.forEach(([k,sw,fn])=>{ const cb=row(dd,'wp-dl-'+k,lbl(k),sw); if(!cb||cb.__wpWired) return; cb.__wpWired=true;
        cb.addEventListener('change',e=>{ const r=e.target.closest('.lyr-row'); if(r) r.classList.toggle('on',e.target.checked);
          try{ fn(e.target.checked); }catch(err){ console.warn('worldPacks toggle',k,err); } }); }); }
    if(document.readyState!=='loading') setTimeout(buildUI,0); else document.addEventListener('DOMContentLoaded',buildUI);
    function relabel(){ const h=document.getElementById('wp-head');
      if(h) h.textContent=L('World data','世界のデータ','Weltdaten','Мировые данные','Datos mundiales');
      Object.keys(LBL).forEach(k=>{ const e=document.getElementById('wp-dl-'+k+'-lbl'); if(e) e.textContent=lbl(k); }); }
    window.addEventListener('intmap-lang',()=>setTimeout(relabel,20));

    /* (#R211) these five layers carry CHOICES (direction, commodity, crop, country), and a share
       link that reproduced the layer but not the choice would open on a different answer. The layer
       checkboxes themselves travel in the `l=` list already; this is only what they are set to. */
    try{ window.IntMapShareState&&window.IntMapShareState.register('world',{
      get(){ const o={}, t=STATE.trade&&STATE.trade(), e=STATE.energy&&STATE.energy(), c=STATE.crops&&STATE.crops();
        if(t&&t.on) o.t={d:t.dir,s:t.section,n:t.topN,i:t.iso||''};
        if(e&&e.on) o.e={k:e.kind,i:e.iso||''};
        if(c&&c.on) o.c=[c.crop,c.variable,c.supply];
        return Object.keys(o).length?o:null; },
      set(v){ if(!v||typeof v!=='object') return;
        try{ if(v.c&&STATE.cropSet) STATE.cropSet.apply(null,[].concat(v.c)); }catch(_){}
        try{ if(v.e&&v.e.k&&STATE.energyKind) STATE.energyKind(v.e.k); }catch(_){}
        try{ if(v.t&&STATE.tradeLoad&&v.t.i) STATE.tradeLoad(v.t.i,{dir:v.t.d,section:v.t.s,topN:v.t.n}); }catch(_){}
        try{ if(v.e&&STATE.energyShow&&v.e.i) STATE.energyShow(v.e.i,v.e.k); }catch(_){} } }); }catch(_){}

    /* ══ (#R213) THE TOOLKIT, PUBLISHED ONCE ═════════════════════════════════════════════════════
       js/industry-web.js is a sixth layer of exactly this family — a row under the same heading, a
       floating panel whose ✕ unchecks that row, the same clock and the same money formatting. It is
       its own file (standing instruction 13: new work leaves the core), which leaves one question:
       where do the shared pieces live. Copying them would be the third copy of `makePanel` in the
       project and the second of `uncheckRow`, and the #R212 report 「ポップアップ消してもレイヤー
       選択状態」 was caused by exactly that kind of duplication getting out of step. So they are
       handed over rather than re-declared. Nothing here is new behaviour; it is the same functions. */
    /* (#R220) …and `onRestyle`, because a style reload drops every added layer and the ocean-current
       plate — the only member of this family that lives in its own file — had no way to hear about
       it. #R219 found the same hole in the tide shading; this closes it for the sixth layer too. */
    const _ui={ makePanel, uncheckRow, ensureHead, row, esc, usdShort, usdExact, nowYear, onYear, whenDrawable, setVis, onRestyle, L };
    return Object.assign({ _ui, state:()=>({ trade:STATE.trade&&STATE.trade(), energy:STATE.energy&&STATE.energy(),
      alerts:STATE.alerts&&STATE.alerts(), tides:STATE.tides&&STATE.tides(), crops:STATE.crops&&STATE.crops(),
      year:nowYear() }) }, STATE);
  })();
};
