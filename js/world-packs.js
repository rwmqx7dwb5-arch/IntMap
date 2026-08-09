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
    const L=(en,jp,de,ru,es)=>HOST.lang==='jp'?jp:HOST.lang==='de'?de:HOST.lang==='ru'?ru:HOST.lang==='es'?es:en;
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
    function makePanel(id,title){
      let el=document.getElementById(id);
      if(!el){ el=document.createElement('div'); el.id=id;
        el.style.cssText='position:fixed;left:16px;top:96px;width:min(340px,92vw);max-height:76vh;overflow:auto;z-index:1402;display:none;flex-direction:column;background:var(--card-bg,#1c1c1e);border:1px solid var(--glass-border,rgba(128,128,128,0.3));border-radius:15px;box-shadow:0 18px 50px rgba(0,0,0,0.45);';
        document.body.appendChild(el); }
      return { el,
        open(bodyHTML){ el.innerHTML='<div class="wp-head" style="display:flex;align-items:center;gap:8px;padding:9px 12px;background:var(--input-bg);cursor:move;position:sticky;top:0;">'
            +'<span style="flex:1;font-size:13px;font-weight:700;color:var(--text-main);">'+title()+'</span>'
            +'<button class="wp-close" style="border:none;background:transparent;color:var(--text-muted);font-size:16px;cursor:pointer;">&#10005;</button></div>'
            +'<div class="wp-body" style="padding:10px 12px;display:flex;flex-direction:column;gap:9px;">'+bodyHTML+'</div>';
          el.style.display='flex';
          el.querySelector('.wp-close').onclick=()=>{ el.style.display='none'; };
          try{ HOST.makeDraggable(el,el.querySelector('.wp-head')); }catch(_){}
          return el.querySelector('.wp-body'); },
        body(){ return el.querySelector('.wp-body'); },
        hide(){ el.style.display='none'; },
        shown(){ return el.style.display!=='none'; } }; }

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
      const SRC='wp-trade', LYR=['wp-trade-arc','wp-trade-pt','wp-trade-lbl'];
      /* BACI HS revisions, newest first — one cube covers 1995‑2024 and the newer ones are finer */
      const CUBE=(y)=>(y>=2022?'trade_i_baci_a_22':y>=2018?'trade_i_baci_a_17':y>=2012?'trade_i_baci_a_12':y>=2008?'trade_i_baci_a_07':y>=2003?'trade_i_baci_a_02':'trade_i_baci_a_92');
      const YMIN=1995, YMAX=2024;
      const SECTIONS=[['','All goods','すべての品目','Alle Waren','Все товары','Todos los bienes'],
        ['01','Animal products','動物性生産品','Tierische Erzeugnisse','Продукция животноводства','Productos animales'],
        ['02','Vegetable products','植物性生産品','Pflanzliche Erzeugnisse','Продукция растениеводства','Productos vegetales'],
        ['04','Foodstuffs','調製食料品','Lebensmittel','Пищевые продукты','Alimentos'],
        ['05','Mineral products','鉱物性生産品','Mineralische Stoffe','Минеральные продукты','Productos minerales'],
        ['06','Chemicals','化学工業生産品','Chemische Erzeugnisse','Химическая продукция','Productos químicos'],
        ['07','Plastics & rubber','プラスチック・ゴム','Kunststoffe & Gummi','Пластмассы и каучук','Plásticos y caucho'],
        ['11','Textiles','紡織用繊維','Textilien','Текстиль','Textiles'],
        ['14','Precious metals','貴金属','Edelmetalle','Драгоценные металлы','Metales preciosos'],
        ['15','Metals','卑金属','Unedle Metalle','Металлы','Metales'],
        ['16','Machines','機械類','Maschinen','Машины','Máquinas'],
        ['17','Transportation','輸送機器','Fahrzeuge','Транспорт','Transporte'],
        ['18','Instruments','光学・精密機器','Instrumente','Приборы','Instrumentos'],
        ['19','Arms','武器','Waffen','Оружие','Armas']];
      const secLabel=(s)=>{ const i={jp:2,de:3,ru:4,es:5}[HOST.lang]||1; const r=SECTIONS.find(x=>x[0]===s); return r?r[i]:s; };
      let on=false, dir='X', section='', topN=15, iso=null, rows=null, year=null, busy=false, pop=null;
      const panel=makePanel('wp-trade-panel',()=>'🚢 '+L('Trade flows','貿易フロー','Handelsströme','Торговые потоки','Flujos comerciales'));

      function ensureLayers(){ if(!_imCanDraw()) return false; try{
        if(!GE().layers.hasSource(SRC)) GE().layers.addSource(SRC,{type:'geojson',data:{type:'FeatureCollection',features:[]}});
        if(!GE().layers.has('wp-trade-arc')) GE().layers.add({id:'wp-trade-arc',type:'line',source:SRC,filter:['==',['get','kind'],'arc'],
          layout:{visibility:'none','line-cap':'round','line-join':'round'},
          paint:{'line-color':['get','col'],'line-width':['get','w'],'line-opacity':0.78,'line-blur':0.3}});
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
              feats.push({type:'Feature',geometry:{type:'LineString',coordinates:greatCircle(home,c,56)},
                properties:{kind:'arc',col,w,v:d.v,iso:d.iso,name:d.name,
                  vShort:usdShort(d.v),vExact:usdExact(d.v)}});
              feats.push({type:'Feature',geometry:{type:'Point',coordinates:c},
                properties:{kind:'node',col,r:2.5+5.5*Math.sqrt(Math.max(0,d.v)/Math.max(1,vmax)),name:d.name,
                  v:d.v,vShort:usdShort(d.v),vExact:usdExact(d.v)}}); });
            feats.push({type:'Feature',geometry:{type:'Point',coordinates:home},
              properties:{kind:'node',col:'#ffffff',r:7,name:countryName(iso),v:0,vShort:'',vExact:''}});
          }
        }
        whenDrawable(()=>{ if(ensureLayers()){ GE().layers.setSourceData(SRC,{type:'FeatureCollection',features:feats}); setVis(LYR,on); } }); }

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
        b.querySelector('.wp-x').onclick=()=>{ dir='X'; load(iso,true); };
        b.querySelector('.wp-m').onclick=()=>{ dir='M'; load(iso,true); };
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
        if(!on){ panel.hide(); draw(); return; }
        whenDrawable(()=>{ if(ensureLayers()) wire(); draw(); }); render();
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
     *  Two rows, one machine. The map carries the single number that ranks countries (the low-carbon
     *  share of electricity / the fossil share of primary energy) as a choropleth on the EXISTING
     *  `countries` source; the composition itself is a stacked bar, because a mix of nine sources is
     *  not a colour. Both follow the time machine — the CSVs are per year, so travelling to 1990
     *  redraws the same map from that year's rows rather than interpolating anything.
     * ════════════════════════════════════════════════════════════════════════════════════════════*/
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
      const state={elec:false,prim:false};
      let iso=null, kind='elec';
      const panel=makePanel('wp-energy-panel',()=>'⚡ '+L('Energy mix','エネルギー構成','Energiemix','Энергобаланс','Mezcla energética'));
      const partName=(p)=>HOST.lang==='jp'?p[2]:p[1];

      function fillId(k){ return 'wp-'+k+'-fill'; }
      function ensureChoro(k){ const id=fillId(k); if(GE().layers.has(id)) return true; if(!_imCanDraw()||!GE().layers.hasSource('countries')) return false;
        const ramp=(k==='elec')
          ? ['interpolate',['linear'],['to-number',['feature-state','wpElec'],-1],0,'#7f0000',20,'#e34a33',40,'#fdbb84',60,'#a6d96a',80,'#1a9850',100,'#00602a']
          : ['interpolate',['linear'],['to-number',['feature-state','wpPrim'],-1],0,'#00602a',25,'#a6d96a',50,'#fdbb84',75,'#e34a33',100,'#7f0000'];
        const key=(k==='elec')?'wpElec':'wpPrim';
        const noData=['<=',['to-number',['feature-state',key],0],0];
        try{ GE().layers.add({id,type:'fill',source:'countries',layout:{visibility:'none'},
          paint:{'fill-color':['case',noData,'#9aa0a6',ramp],'fill-opacity':['case',noData,0.18,0.55]}},
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

      async function show(code){
        iso=code; const cfg=SRCS[kind]; const y=nowYear();
        const b=panel.open('<div style="display:flex;gap:5px;">'
            +'<button class="wp-k" data-k="elec" style="'+BTN+'flex:1;">'+L('Electricity','電力構成','Strom','Электроэнергия','Electricidad')+'</button>'
            +'<button class="wp-k" data-k="prim" style="'+BTN+'flex:1;">'+L('Primary energy','一次エネルギー','Primärenergie','Первичная энергия','Energía primaria')+'</button></div>'
          +'<div class="wp-e-body" style="font-size:11.5px;color:var(--text-main);line-height:1.5;">'+L('Loading…','読み込み中…','Lädt…','Загрузка…','Cargando…')+'</div>'
          +'<div style="font-size:9.5px;color:var(--text-muted);line-height:1.5;">'
          +L('Source: Our World in Data — Ember (electricity) and the Energy Institute Statistical Review (primary energy). The map shades the low-carbon share of electricity, and the fossil share of primary energy; the bar is the mix itself, because nine sources are not one color.',
             '出典: Our World in Data（電力＝Ember、一次エネルギー＝Energy Institute 統計）。地図は電力の低炭素比率／一次エネルギーの化石燃料比率で塗り、構成そのものは棒グラフで示します（9つの電源は1色では表せないため）。',
             'Quelle: Our World in Data (Ember / Energy Institute).','Источник: Our World in Data (Ember / Energy Institute).','Fuente: Our World in Data (Ember / Energy Institute).')+'</div>');
        b.querySelectorAll('.wp-k').forEach(x=>{ const a=x.getAttribute('data-k')===kind;
          x.style.background=a?'var(--primary-color)':'var(--input-bg)'; x.style.color=a?'#fff':'var(--text-main)';
          x.onclick=()=>{ kind=x.getAttribute('data-k'); show(iso); }; });
        const host=b.querySelector('.wp-e-body');
        try{ const data=await owid(cfg.slug); const yy=pickYear(data,code,y); const rec=yy!=null?data.by[code][yy]:null;
          if(!rec){ host.innerHTML='⚠ '+L('No data for this country.','この国のデータがありません。','Keine Daten.','Нет данных.','Sin datos.'); return; }
          host.innerHTML='<div style="font-weight:700;font-size:13px;margin-bottom:2px;">'+esc(countryName(code))+'</div>'
            +'<div style="color:var(--text-muted);margin-bottom:6px;">'+yy+(yy!==y?(' · '+L('latest available at or before','指定年以前で最新','letzte verfügbare','последний доступный','último disponible')+' '+y):'')+'</div>'
            +bar(cfg.parts,rec,cfg.unit);
        }catch(e){ host.innerHTML='⚠ '+L('Energy data could not be fetched.','エネルギーデータを取得できませんでした。','Daten nicht abrufbar.','Не удалось получить данные.','No se pudieron obtener los datos.'); } }

      function toggle(k,v){ state[k]=v;
        if(!v){ setVis([fillId(k)],false); if(!state.elec&&!state.prim) panel.hide(); return; }
        kind=k;
        withCountrySource().then(async()=>{ if(!state[k]) return;
          if(!ensureChoro(k)){ whenDrawable(()=>{ if(state[k]&&ensureChoro(k)) apply(k).then(()=>setVis([fillId(k)],true)).catch(()=>{}); }); return; }
          try{ await apply(k); }catch(e){ try{ HOST.imToast(L('Energy data could not be fetched.','エネルギーデータを取得できませんでした。','Daten nicht abrufbar.','Не удалось получить данные.','No se pudieron obtener los datos.')); }catch(_){} }
          setVis([fillId(k)],true);
          try{ if(window._registerLayerOpacity) window._registerLayerOpacity('wp'+k,
            [k==='elec'?'Electricity mix':'Primary energy mix', k==='elec'?'電力構成':'一次エネルギー構成',
             k==='elec'?'Strommix':'Primärenergiemix', k==='elec'?'Электроэнергия':'Первичная энергия',
             k==='elec'?'Mezcla eléctrica':'Energía primaria'],[fillId(k)],'wp-dl-'+k); }catch(_){}
        }); }

      mapClick((e)=>{ if(!state.elec&&!state.prim) return false;
        const c=countryAt(e.lngLat.lng,e.lngLat.lat); if(!c) return false;
        kind=state[kind]?kind:(state.elec?'elec':'prim'); show(c); return true; });
      onYear(()=>{ ['elec','prim'].forEach(k=>{ if(state[k]) withCountrySource().then(()=>apply(k).catch(()=>{})); });
        if(panel.shown()&&iso) show(iso); });

      STATE.energy=()=>({ elec:state.elec, prim:state.prim, iso, kind, year:nowYear() });
      STATE.energyShow=(code,k)=>{ if(k) kind=k; return show(String(code||'').toUpperCase()); };
      window.__wpEnergy={ toggle };
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
      const SRC='wp-alert', LYR=['wp-alert-fill','wp-alert-line'];
      let on=false, feats=[], busy=false, timer=null;
      const panel=makePanel('wp-alert-panel',()=>'⚠ '+L('Warnings','気象・災害警報','Warnungen','Предупреждения','Avisos'));
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
          layout:{visibility:'none'},paint:{'fill-color':['get','col'],'fill-opacity':0.34}});
        if(!GE().layers.has('wp-alert-line')) GE().layers.add({id:'wp-alert-line',type:'line',source:SRC,
          layout:{visibility:'none'},paint:{'line-color':['get','col'],'line-width':1.4,'line-opacity':0.95}});
        return true; }catch(_){ return false; } }

      let _jpGeo=null;
      async function jpPrefGeo(){ if(_jpGeo) return _jpGeo;
        const m=await (await fetch('https://www.geoboundaries.org/api/current/gbOpen/JPN/ADM1/')).json();
        const meta=Array.isArray(m)?m[0]:m;
        const g=await (await fetch(meta.simplifiedGeometryGeoJSON)).json();
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

      async function refresh(){ if(busy) return; busy=true;
        try{ const parts=await Promise.all([loadJMA().catch(()=>[]),loadNWS().catch(()=>[])]);
          feats=parts.flat();
          whenDrawable(()=>{ if(ensureLayers()){ GE().layers.setSourceData(SRC,{type:'FeatureCollection',features:feats}); setVis(LYR,on); } });
        } finally { busy=false; } }

      function legendFor(iso3){
        const feed=FEEDS[iso3];
        const mine=feats.filter(f=>f.properties.iso===iso3);
        let h='<div style="font-weight:700;font-size:13px;">'+esc(countryName(iso3))+'</div>';
        if(!feed){
          /* ⚠ NOT an empty map. Saying "no warnings" for a country whose agency we do not read
             would be a claim about safety that this app has no basis for. */
          h+='<div style="margin-top:6px;color:var(--text-main);">'
            +L('No public real-time warning feed is wired for this country yet, so this layer is showing nothing here — that is not the same as "no warnings in force".',
               'この国については、リアルタイム警報の公開フィードをまだ接続していません。ここに何も表示されていないことは「警報が出ていない」という意味ではありません。',
               'Für dieses Land ist noch kein Echtzeit-Feed angebunden — das bedeutet NICHT, dass keine Warnungen gelten.',
               'Для этой страны фид ещё не подключён — это не значит, что предупреждений нет.',
               'Aún no hay un feed en tiempo real para este país — eso NO significa que no haya avisos.')+'</div>';
          return h; }
        h+='<div style="margin-top:4px;color:var(--text-muted);">'+(feed==='jma'
            ?L('Japan Meteorological Agency, at the unit the warning is issued for.','気象庁・発令単位（都道府県／市町村）','Japanische Wetterbehörde','Метеоагентство Японии','Agencia Meteorológica de Japón')
            :L('US National Weather Service, active alerts.','米国 国立気象局（発表中の警報）','US-Wetterdienst','Нацслужба погоды США','Servicio Meteorológico Nacional de EE. UU.'))+'</div>';
        h+='<div style="margin-top:8px;display:flex;flex-direction:column;gap:3px;">'
          +[3,2,1].map(t=>'<div style="display:flex;align-items:center;gap:7px;font-size:11.5px;">'
            +'<span style="width:12px;height:12px;border-radius:3px;background:'+TIERCOL[t]+';"></span>'+esc(tierName(t))+'</div>').join('')+'</div>';
        if(!mine.length){ h+='<div style="margin-top:8px;color:var(--text-muted);">'+L('Nothing in force right now.','現在、発表中のものはありません。','Derzeit nichts in Kraft.','Сейчас ничего не действует.','Nada vigente ahora.')+'</div>'; return h; }
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

      function toggle(v){ on=v;
        if(!on){ if(timer){ clearInterval(timer); timer=null; } panel.hide(); setVis(LYR,false); return; }
        whenDrawable(()=>ensureLayers()); refresh();
        if(!timer) timer=setInterval(()=>{ if(on) refresh(); },300000);
        try{ HOST.imToast(L('Tap a country for its own warning legend.','国をタップするとその国の凡例が出ます。','Land antippen für die Legende.','Нажмите страну для легенды.','Toque un país para su leyenda.')); }catch(_){} }

      onRestyle(()=>{ if(on) whenDrawable(()=>{ if(ensureLayers()) GE().layers.setSourceData(SRC,{type:'FeatureCollection',features:feats}); setVis(LYR,true); }); });
      mapClick((e)=>{ if(!on) return false;
        const c=countryAt(e.lngLat.lng,e.lngLat.lat); if(!c) return false;
        panel.open('<div class="wp-a-body">'+legendFor(c)+'</div>'); return true; });

      STATE.alerts=()=>({ on, areas:feats.length, feeds:Object.keys(FEEDS),
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
      const IMG='wp-tide-src', LYR='wp-tide-img', SRC='wp-tide', PT='wp-tide-pt';
      let on=false, at=null, series=null, busy=false;
      const panel=makePanel('wp-tide-panel',()=>'🌊 '+L('Tides','潮汐','Gezeiten','Приливы','Mareas'));
      function ensureLayers(){ if(!_imCanDraw()) return false; try{
        if(!GE().layers.hasSource(SRC)) GE().layers.addSource(SRC,{type:'geojson',data:{type:'FeatureCollection',features:[]}});
        if(!GE().layers.has(PT)) GE().layers.add({id:PT,type:'circle',source:SRC,layout:{visibility:'none'},
          paint:{'circle-radius':6,'circle-color':'#29b6f6','circle-stroke-color':'#04283a','circle-stroke-width':2}});
        return true; }catch(_){ return false; } }

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
      function paintFlood(lng,lat,level){
        try{ const b=GE().camera.getBounds(); if(!b) return;
          const W=b.getWest(), E=b.getEast(), S=b.getSouth(), N=b.getNorth();
          const NX=220, NY=Math.max(40,Math.round(NX*(N-S)/Math.max(1e-9,E-W)));
          const cv=document.createElement('canvas'); cv.width=NX; cv.height=NY;
          const ct=cv.getContext('2d'), im=ct.createImageData(NX,NY), px=im.data;
          let wet=0;
          for(let j=0;j<NY;j++){ const la=N-(j+0.5)*(N-S)/NY;
            for(let i=0;i<NX;i++){ const lo=W+(i+0.5)*(E-W)/NX;
              let e=null; try{ e=HOST.demElevBilinear(lo,la,10); if(e==null) e=HOST.demElevAt(lo,la,null,10); }catch(_){}
              if(e==null||!isFinite(e)) continue;
              if(e<=level){ const d=Math.max(0,level-e), o=(j*NX+i)*4, s=Math.min(1,d/3);
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

      function fmtT(ms){ try{ return new Date(ms).toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}); }catch(_){ return new Date(ms).toISOString().slice(0,16).replace('T',' '); } }
      function when(){ try{ const st=window.IntMapTime.state(); return st.isLive?Date.now():+new Date(st.when); }catch(_){ return Date.now(); } }

      async function probe(lng,lat){
        at=[lng,lat]; busy=true;
        const b=panel.open('<div class="wp-t-body">'+L('Reading the tide…','潮位を取得中…','Gezeiten werden gelesen…','Чтение прилива…','Leyendo la marea…')+'</div>'
          +'<div style="font-size:9.5px;color:var(--text-muted);line-height:1.5;">'
          +L('Sea level above mean sea level from the Open-Meteo Marine model, hourly, at the point you tapped. Highs and lows are the local extrema of that series (refined between samples). The shading is the ground at or below the current tide level, read from the same elevation model the sea-level layer uses — a still-water fill, not a run-up model.',
             '出典は Open-Meteo Marine の1時間ごとの平均海面基準の潮位（タップした地点）。満潮・干潮はその系列の極値（標本間を補間して算出）。塗りは現在の潮位以下の地面で、Sea-level change と同じ標高データを使った静水面の塗りです（遡上モデルではありません）。',
             'Pegel aus dem Open-Meteo-Marine-Modell; Füllung ist Gelände unter dem Pegel (Stillwasser).',
             'Уровень моря из модели Open-Meteo Marine; заливка — суша ниже уровня (стоячая вода).',
             'Nivel del mar del modelo Open-Meteo Marine; el sombreado es el terreno bajo ese nivel (agua en reposo).')+'</div>');
        try{ GE().layers.setSourceData(SRC,{type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'Point',coordinates:[lng,lat]},properties:{}}]}); }catch(_){}
        setVis([PT],true);
        const host=b.querySelector('.wp-t-body');
        try{
          const t0=when();
          series=await fetchSeries(lng,lat,t0);
          if(!series.length){ host.innerHTML='⚠ '+L('No tide model at this point (inland or outside the model domain).','この地点には潮汐モデルがありません（内陸またはモデル範囲外）。','Kein Gezeitenmodell an diesem Punkt.','Нет модели прилива в этой точке.','Sin modelo de marea en este punto.'); busy=false; return; }
          const ex=extrema(series).filter(x=>Math.abs(x.t-t0)<30*3600e3).sort((a,b2)=>a.t-b2.t);
          const lv=levelAt(series,t0);
          const wet=(lv!=null)?paintFlood(lng,lat,lv):0;
          host.innerHTML='<div style="font-weight:700;font-size:13px;">'+lv.toFixed(2)+' m <span style="font-weight:400;color:var(--text-muted);font-size:11px;">'+L('above MSL','平均海面基準','über NN','над средним уровнем','sobre el nivel medio')+'</span></div>'
            +'<div style="color:var(--text-muted);font-size:11px;margin-bottom:6px;">'+fmtT(t0)+'</div>'
            +ex.slice(0,10).map(x=>'<div style="display:flex;justify-content:space-between;gap:8px;padding:2px 0;border-bottom:1px solid var(--glass-border,rgba(128,128,128,0.16));font-size:11.5px;">'
              +'<span>'+(x.high?('▲ '+L('High tide','満潮','Hochwasser','Прилив','Pleamar')):('▼ '+L('Low tide','干潮','Niedrigwasser','Отлив','Bajamar')))+'</span>'
              +'<span>'+esc(fmtT(x.t))+'</span><b>'+x.h.toFixed(2)+' m</b></div>').join('')
            +'<div style="margin-top:6px;color:var(--text-muted);font-size:11px;">'+L('Shaded cells at this level','この潮位で浸かるセル','Gefärbte Zellen','Затопленные ячейки','Celdas inundadas')+': '+wet+'</div>';
        }catch(e){ host.innerHTML='⚠ '+L('The tide model could not be fetched.','潮汐データを取得できませんでした。','Gezeitendaten nicht abrufbar.','Не удалось получить данные.','No se pudieron obtener los datos.'); }
        busy=false; }

      function toggle(v){ on=v;
        if(!on){ panel.hide(); clearFlood(); setVis([PT],false); return; }
        whenDrawable(()=>ensureLayers());
        try{ HOST.imToast(L('Tap a coast to see its tide.','海岸をタップすると潮汐が出ます。','Küste antippen.','Нажмите побережье.','Toque una costa.')); }catch(_){} }

      onRestyle(()=>{ if(on) whenDrawable(()=>ensureLayers()); });
      mapClick((e)=>{ if(!on) return false; probe(e.lngLat.lng,e.lngLat.lat); return true; });
      onYear(()=>{ if(on&&at) probe(at[0],at[1]); });

      STATE.tides=()=>({ on, at, points:series?series.length:0 });
      STATE.tideProbe=(lng,lat)=>probe(+lng,+lat);
      window.__wpTides={ toggle };
    })();

    /* ══════════════════════════════════════════════════════════════════════════════════════════════
     *  5 · CROPS — where a chosen crop is grown, and how well
     * ----------------------------------------------------------------------------------------------
     *  「作物を選択可能、高画質の栽培地域表示。」
     *  ⚠ AND THE HONEST SHAPE OF THAT. There is no keyless, CORS-reachable, crop-by-crop RASTER of
     *  growing areas: the field-level products (MapSPAM, EarthStat, GFSAD) ship as GeoTIFFs, not as
     *  tiles a browser can ask for, and FAOSTAT's own API answers 401 without credentials. What IS
     *  reachable is FAO's per-country yield series (through Our World in Data), and the app already
     *  carries a 10 m land-cover raster whose cropland class is the actual extent of cultivated
     *  ground. So this draws BOTH and says which is which: the choropleth is the selected crop's
     *  national yield for the year on the clock, and the panel offers the 10 m land cover as the
     *  physical field extent. Neither is presented as the other.
     * ════════════════════════════════════════════════════════════════════════════════════════════*/
    (function crops(){
      const FILL='wp-crop-fill';
      const CROPS=[['wheat','Wheat','小麦'],['rice','Rice','米'],['maize','Maize','とうもろこし'],['soybeans','Soybeans','大豆'],
        ['potatoes','Potatoes','じゃがいも'],['barley','Barley','大麦'],['cassava','Cassava','キャッサバ'],
        ['bananas','Bananas','バナナ'],['beans__dry','Beans (dry)','豆（乾燥）'],['peas__dry','Peas (dry)','えんどう（乾燥）'],
        ['cocoa_beans','Cocoa beans','カカオ豆']];
      let on=false, crop='wheat';
      const panel=makePanel('wp-crop-panel',()=>'🌾 '+L('Crops','作物','Feldfrüchte','Культуры','Cultivos'));
      const cropName=(k)=>{ const r=CROPS.find(c=>c[0]===k); return r?(HOST.lang==='jp'?r[2]:r[1]):k; };
      let _cols=null;
      function colFor(k,cols){ return cols.find(c=>c.indexOf(k+'__')===0&&c.indexOf('__yield__')>0)||null; }

      function ensureChoro(){ if(GE().layers.has(FILL)) return true; if(!_imCanDraw()||!GE().layers.hasSource('countries')) return false;
        const ramp=['interpolate',['linear'],['to-number',['feature-state','wpCrop'],-1],
          0.3,'#fff7bc',1,'#fee391',2,'#fec44f',4,'#fe9929',7,'#ec7014',11,'#993404',18,'#4d2600'];
        const noData=['<=',['to-number',['feature-state','wpCrop'],0],0];
        try{ GE().layers.add({id:FILL,type:'fill',source:'countries',layout:{visibility:'none'},
          paint:{'fill-color':['case',noData,'#9aa0a6',ramp],'fill-opacity':['case',noData,0.14,0.6]}},
          GE().layers.has('tool-poly')?'tool-poly':undefined); }catch(_){ return false; }
        return true; }

      async function apply(){
        const data=await owid('key-crop-yields'); _cols=data.columns;
        const col=colFor(crop,data.columns); if(!col) return 0;
        const y=nowYear(); let n=0;
        if(!HOST.countryGeo) return 0;
        HOST.countryGeo.features.forEach(f=>{ const c=String(f.id||''); const by=data.by[c];
          let v=-1;
          if(by){ let bestY=null; for(const k in by){ const yy=+k; if(yy<=y&&(bestY==null||yy>bestY)&&by[k][col]!=null) bestY=yy; }
            if(bestY!=null&&by[bestY][col]>0) v=by[bestY][col]; }
          try{ GE().layers.setFeatureState({source:'countries',id:f.id},{wpCrop:(v>0?v:-1)}); }catch(_){}
          if(v>0) n++; });
        return n; }

      function render(){
        const b=panel.open('<label style="'+ROW+'">'+L('Crop','作物','Feldfrucht','Культура','Cultivo')
            +'<select class="wp-crop" style="'+SEL+'">'+CROPS.map(c=>'<option value="'+c[0]+'"'+(c[0]===crop?' selected':'')+'>'+esc(cropName(c[0]))+'</option>').join('')+'</select></label>'
          +'<div class="wp-c-stat" style="font-size:11.5px;color:var(--text-main);"></div>'
          +'<button class="wp-c-lc" style="'+BTN+'width:100%;">'+L('Show 10 m land cover (the actual fields)','10m 土地被覆を表示（実際の耕地）','10-m-Landbedeckung anzeigen','Показать покрытие 10 м','Ver cobertura de 10 m')+'</button>'
          +'<div style="font-size:9.5px;color:var(--text-muted);line-height:1.5;">'
          +L('The shading is the selected crop’s NATIONAL yield in tonnes per hectare (FAO, via Our World in Data) for the year on the clock — a per-country statistic, not a field map. The 10 m button turns on ESA WorldCover, whose cropland class is the actual extent of cultivated ground. No keyless crop-by-crop raster exists, and the two are kept apart rather than blended into one picture.',
             '塗りは選択した作物の国別収量（t/ha・FAO / Our World in Data、時計の年）で、国単位の統計であって圃場地図ではありません。10m のボタンは ESA WorldCover を表示し、その耕地クラスが実際の耕作地の範囲です。作物別のラスタは無料・CORS で入手できるものが無いため、両者を混ぜず別々に示します。',
             'Die Färbung ist der nationale Ertrag (t/ha, FAO). Der 10-m-Knopf zeigt ESA WorldCover.',
             'Заливка — национальная урожайность (т/га, ФАО). Кнопка 10 м включает ESA WorldCover.',
             'El sombreado es el rendimiento nacional (t/ha, FAO). El botón de 10 m activa ESA WorldCover.')+'</div>');
        b.querySelector('.wp-crop').onchange=(e)=>{ crop=e.target.value; refresh(); };
        b.querySelector('.wp-c-lc').onclick=()=>{ const cb=document.getElementById('eco-dl-worldcover');
          if(cb){ if(!cb.checked){ cb.checked=true; cb.dispatchEvent(new Event('change',{bubbles:true})); } }
          else { try{ HOST.imToast(L('Land cover layer not available.','土地被覆レイヤーが見つかりません。','Landbedeckung nicht verfügbar.','Слой недоступен.','Capa no disponible.')); }catch(_){} } };
        stat(); }
      function stat(txt){ const b=panel.body(); const s=b&&b.querySelector('.wp-c-stat'); if(s) s.textContent=txt||''; }

      async function refresh(){ if(!on) return;
        stat(L('Loading…','読み込み中…','Lädt…','Загрузка…','Cargando…'));
        try{ const n=await apply(); setVis([FILL],true);
          stat(cropName(crop)+' · '+nowYear()+' · '+n+' '+L('countries with data','か国のデータ','Länder mit Daten','стран с данными','países con datos')); }
        catch(e){ stat('⚠ '+L('Crop data could not be fetched.','作物データを取得できませんでした。','Daten nicht abrufbar.','Не удалось получить данные.','No se pudieron obtener los datos.')); } }

      function toggle(v){ on=v;
        if(!on){ setVis([FILL],false); panel.hide(); return; }
        withCountrySource().then(()=>{ if(!on) return;
          if(!ensureChoro()){ whenDrawable(()=>{ if(on&&ensureChoro()){ render(); refresh(); } }); return; }
          render(); refresh();
          try{ if(window._registerLayerOpacity) window._registerLayerOpacity('wpcrop',
            ['Crop yield','作物の収量','Ertrag','Урожайность','Rendimiento'],[FILL],'wp-dl-crops'); }catch(_){} }); }

      onYear(()=>{ if(on) refresh(); });
      STATE.crops=()=>({ on, crop, year:nowYear() });
      STATE.cropSet=(k)=>{ crop=String(k||'').toLowerCase(); return refresh(); };
      window.__wpCrops={ toggle };
    })();

    /* ── the six rows ──────────────────────────────────────────────────────────────────────────── */
    const LBL={
      trade:['Trade flows','貿易フロー','Handelsströme','Торговые потоки','Flujos comerciales'],
      elec:['Electricity mix','電力構成','Strommix','Структура электроэнергии','Mezcla eléctrica'],
      prim:['Primary energy mix','一次エネルギー構成','Primärenergiemix','Первичная энергия','Energía primaria'],
      alerts:['Weather & disaster warnings','気象・災害警報','Wetter- und Katastrophenwarnungen','Метеопредупреждения','Avisos meteorológicos'],
      tides:['Tides','潮汐（満潮・干潮）','Gezeiten','Приливы','Mareas'],
      crops:['Crop cultivation','作物の栽培','Feldfrüchte','Сельхозкультуры','Cultivos']};
    const lbl=(k)=>LBL[k][{jp:1,de:2,ru:3,es:4}[HOST.lang]||0];
    function buildUI(){ const dd=ensureHead(); if(!dd) return;
      const H=[['trade','#ff9f0a',v=>window.__wpTrade.toggle(v)],
               ['elec','#b455ff',v=>window.__wpEnergy.toggle('elec',v)],
               ['prim','#c78a4b',v=>window.__wpEnergy.toggle('prim',v)],
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
        if(e&&(e.elec||e.prim)) o.e={k:e.kind,i:e.iso||''};
        if(c&&c.on) o.c=c.crop;
        return Object.keys(o).length?o:null; },
      set(v){ if(!v||typeof v!=='object') return;
        try{ if(v.c&&STATE.cropSet) STATE.cropSet(v.c); }catch(_){}
        try{ if(v.t&&STATE.tradeLoad&&v.t.i) STATE.tradeLoad(v.t.i,{dir:v.t.d,section:v.t.s,topN:v.t.n}); }catch(_){}
        try{ if(v.e&&STATE.energyShow&&v.e.i) STATE.energyShow(v.e.i,v.e.k); }catch(_){} } }); }catch(_){}

    return Object.assign({ state:()=>({ trade:STATE.trade&&STATE.trade(), energy:STATE.energy&&STATE.energy(),
      alerts:STATE.alerts&&STATE.alerts(), tides:STATE.tides&&STATE.tides(), crops:STATE.crops&&STATE.crops(),
      year:nowYear() }) }, STATE);
  })();
};
