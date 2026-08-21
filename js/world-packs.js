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
    const _csvVal=Object.create(null);      /* (#R270) the RESOLVED value, so a year range can be read synchronously */
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
        /* (#R270) the range the file actually covers — the year picker's bounds are measured, never
           assumed, the same rule scripts/probe-gibs-range.mjs follows for the rasters */
        let lo=1e9, hi=-1e9;
        for(const c in by) for(const y in by[c]){ const n=+y; if(n<lo) lo=n; if(n>hi) hi=n; }
        return { columns:head, by, minYear:(lo<=hi?lo:null), maxYear:(lo<=hi?hi:null) };
      })().then(v=>{ _csvVal[slug]=v; return v; });
      return _csvCache[slug]; }
    /* the loaded CSV's own year span, or null while nothing has landed yet */
    function owidRange(slug){ const d=_csvVal[slug];
      return (d&&d.minYear!=null)?{min:d.minYear,max:d.maxYear}:null; }

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
       「レイヤー系で、ポップアップを消してもレイヤーは選択状態とかやめろ。連動させろ。」 The × used to
       hide the panel and leave the row ticked, so the layer list claimed a layer was on while the only
       place its answer is shown had been dismissed — two switches for one thing, disagreeing. There is
       now one: × drives the checkbox, the checkbox drives the layer. `uncheckRow` returns false when
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
       box — `.data-legend.generic-legend` from js/data-layers.js — with the drag grip, the × that
       unchecks the layer row, the minimise button, the opacity slider and the "what is this data"
       line, all tiled by `tileLegends()`. These families now render INTO that box instead of beside
       it. Nothing about it is special-cased for them: `_registerLayerOpacity` builds it, the × is
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
      /* ══ ⚠⚠ (#R216) THE × CLOSED IT AND THE LAYER PUT IT STRAIGHT BACK ═════════════════════════
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
        /* ══ (#R270) THE YEAR, ON THE LAYER ══════════════════════════════════════════════════════
           「年を変えることに意味があるレイヤーは一つ残らずすべて、変えられるようにしろ。」 — the trade,
           energy and crop layers have followed the master clock since they were written (see the
           header: 「a year that follows window.IntMapTime」), and nothing on them said so. This is
           js/data-layers.js's row — the SAME builder the six country-statistic legends use, reading
           and writing the one clock — appended to the legend SHELL rather than to `.wp-body`, so a
           re-render of the body cannot take it away. */
        clockYear(opts){ const el=legend(); if(!el) return null;
          try{ return window._legendClockYear?window._legendClockYear(el,opts||{}):null; }catch(_){ return null; } },
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

    /* ══ (#R258) A LONG NOTE IS FOLDED, NOT DELETED ═══════════════════════════════════════════════
       「凡例に書いてある注意書きが長すぎ。せめて隠すとかしろ。」 The provenance paragraph under a legend
       is the thing that makes the picture checkable (standing rule 4: say where the numbers come
       from), so it cannot go — but it was six lines of prose above a three-line panel. `<details>`
       lets the BROWSER own the open/closed state, so it survives a re-render of the panel body the
       way #R211's 「詳細情報を表示」 does, and one line of summary is what is left on screen. */
    function noteBlock(text){ if(!text) return '';
      return '<details class="wp-note" style="margin-top:2px;">'
        +'<summary style="cursor:pointer;font-size:9.5px;color:var(--text-muted);list-style:revert;">'
        +esc(L('Source & notes','出典・注記','Quelle & Hinweise','Источник и примечания','Fuente y notas'))+'</summary>'
        +'<div style="font-size:9.5px;color:var(--text-muted);line-height:1.5;margin-top:3px;">'+esc(text)+'</div></details>'; }

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
      const SRC='wp-trade', LYR=['wp-trade-arc','wp-trade-tip','wp-trade-lbl'];   /* (#R254) `wp-trade-pt` (the country pins) removed — see ensureLayers. (#R258) `wp-trade-arrow` (the repeater along the shaft) removed; the arrow is `arc`+`tip`. */
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
      /* (#R254) 「矢印の有無はトグルでオンオフできるようにしろ。」 — a switch of its own, in the panel
         beside the direction and the commodity.
         ⚠ (#R258) 「矢印だけオンオフしてどないすんねん線もやろがい。」 — it took the heads off and left
         the shafts standing, which is a picture of flows with no direction in it. The switch is over
         the WHOLE arrow now (shaft, head and the partner's name); the country shading is what stays,
         so turning the arrows off leaves the choropleth answer 「誰と、どれだけ」 on the map. */
      let arrows=true;
      function applyVis(){ setVis(LYR,on&&arrows); }
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
      /* ══ ⚠⚠⚠ (#R254) THE ARROWHEADS WERE NEVER REGISTERED — WRONG NAMESPACE, SWALLOWED BY A CATCH ══
         「矢印はただの線ではなくちゃんと方向に対応した矢印にしろ。」 They were supposed to exist since
         #R212 and they never have. MEASURED in a real browser with the layer on and Japan's flows
         loaded: `GE().scene.hasImage('wp-arrow-X')` → **false**, `hasImage('wp-arrow-M')` → **false**,
         while `wp-trade-arrow` itself is present and `visibility:visible`. A symbol layer whose
         `icon-image` names an unregistered image draws NOTHING, so what reached the screen was the
         `wp-trade-arc` line and nothing else — 「ただの線」, exactly.
         THE CAUSE IS ONE WORD. The renderer contract puts the sprite atlas under `scene`, not under
         `layers`: `typeof GE().layers.hasImage` is **undefined**, so calling it throws a TypeError,
         and the whole body sits inside `try{…}catch(_){}` — the failure had no way to be seen. This
         project has written that fact down before: js/ocean-currents.js carries «⚠ IT IS `scene`, NOT
         `layers` (#R216): `GE().layers.addImage` is simply undefined» — the same mistake, found in
         that file two rounds after it was made here, and never re-checked against this one.
         ⚠ THE CATCH STAYS, BUT IT NO LONGER HIDES THIS: a missing image is now reported once. */
      /* ══ ⚠⚠⚠ (#R255) THE ARROWHEADS WERE DRAWN, AND COULD NOT BE SEEN ═════════════════════════════
         「貿易レイヤーは、矢印にしろ。…矢印はただの線ではなくちゃんと方向に対応した矢印にしろ。矢印にしろ。」
         — a third time, and #R254's fix was real: MEASURED on this build with Japan's exports loaded,
         `scene.hasImage('wp-arrow-X')` is **true** and `queryRenderedFeatures('wp-trade-arrow')`
         returns **20** symbols. They reach the screen. They are simply invisible, and the arithmetic
         says why:

             head    22 px image at pixelRatio 2 = 11 CSS px, × icon-size 0.34–0.92  →  3.7–10.1 px
             shaft   line-width 1.2 + 11.8·√share                                    →  1.2–13.0 px
             colour  head #ff9f0a          shaft #ff9f0a                             →  THE SAME

         The largest partner's arrowhead is 10 px of orange laid on a 13 px orange line: narrower than
         the thing it sits on, in its own colour. There is no arrow to see — 「ただの線」, exactly, and
         for the third round in a row the picture was right about that.

         So the head is now sized FROM the shaft rather than independently of it (always ≥ 2.6× the
         line's width), it is drawn with a dark outline so its edges separate from the stroke beneath,
         and every arc additionally carries ONE BIG TERMINAL HEAD at the end the goods arrive at —
         which is what makes the whole flow read as an arrow rather than as a decorated line.
         ⚠ Two plain images per direction rather than SDF: `icon-color` only applies to SDF sprites,
         and an SDF built from a hard-edged triangle is a blurred triangle (#R212). */
      /* ══ ⚠⚠⚠ (#R258) THE FLOW **IS** AN ARROW. IT IS NOT A LINE WITH ARROWS PUT ON IT ═════════════
         「貿易レイヤーは、矢印にしろ。…（追記：ふざけんじゃねーよ。誰が線に複数矢印つけろって言ってん
           ねん。それに矢印だけオンオフしてどないすんねん線もやろがい。…矢印を後付けであきらかに浮いた
           形にするな。意図を理解しろ。）」

         Three concrete faults, all of them real, all of them in what #R212–#R255 built:

           ① `wp-trade-arrow` placed a head every 110 px ALONG the shaft (`symbol-placement:'line'`).
              Nobody asked for a decorated line. **That layer is deleted**, and removed from the style
              if a running session still has it, the way #R212 retired `tw-breach`.
           ② The switch turned the heads off and left the shafts. A flow you cannot see the direction
              of is not half a flow, it is a different picture — **the switch now takes the whole
              arrow**: shaft, head and partner label together.
           ③ The head was PASTED ON: a dark outline round it, `icon-opacity` 0.98 over a shaft at
              `line-opacity` 0.78, and the shaft running underneath it to the same endpoint. Three
              different ways of saying «two objects». Now: **one colour, one opacity (1), and the
              shaft STOPS where the head begins**, so what is drawn is a single continuous arrow —
              flat shaft end butted against the base of the triangle, nothing overlapping.

         ⚠ WHERE THE SHAFT STOPS IS A NUMBER OF PIXELS, SO IT DEPENDS ON THE CAMERA. The head is
         sized in CSS px (it has to stay legible from z1 to z8), so the length to cut off the arc is
         asked of the RENDERER'S OWN PROJECTION — see `trimEnd`, which walks the arc's vertices in
         screen space — and the geometry is rebuilt on `moveend` (zoom, pan and rotation all move
         it in globe view). The Mercator arithmetic below survives only as the fallback for the
         moment before the camera exists. */
      const ARROW={X:'#ff9f0a',M:'#32d0ff'};
      /* the head image: tip at the TOP of the canvas, base along the bottom, so `icon-anchor:'top'`
         puts the tip exactly on the arc's last vertex and the body extends back down the shaft.
         64 px canvas at pixelRatio 2 → 32 CSS px; the triangle is 24 CSS wide and 30 CSS long, so
         `icon-size = base/24`. No outline: an arrowhead is part of the arrow, not a sticker on it. */
      const ARROW_PX=64, HEAD_BASE_CSS=24, HEAD_LEN_CSS=30;
      function arrowImg(hex){ const S=ARROW_PX, c=document.createElement('canvas'); c.width=c.height=S;
        const g=c.getContext('2d');
        g.beginPath(); g.moveTo(S*0.5,S*0.03); g.lineTo(S*0.875,S*0.97); g.lineTo(S*0.125,S*0.97);
        g.closePath(); g.fillStyle=hex; g.fill();
        return g.getImageData(0,0,S,S); }
      let _arrowWarned=false;
      function ensureArrows(){ try{ Object.keys(ARROW).forEach(k=>{ const id='wp-arrow-'+k;
        if(!GE().scene.hasImage(id)) GE().scene.addImage(id,arrowImg(ARROW[k]),{pixelRatio:2}); }); }catch(e){
        if(!_arrowWarned){ _arrowWarned=true; try{ console.warn('trade arrowheads could not be registered',e); }catch(_){} } } }
      /* the head is the arrow's point, so it is set by the shaft it terminates: 2.8× its width, and
         never so small that the triangle stops reading as one (10 CSS px of base is the floor). */
      const headBasePx=(w)=>Math.max(10,2.8*w);
      const headSize=(w)=>headBasePx(w)/HEAD_BASE_CSS;
      const headLenPx=(w)=>headSize(w)*HEAD_LEN_CSS;

      /* ── Mercator, in metres, which is the space one screen pixel is constant in ─────────────── */
      const MERC_R=6378137, MERC_HALF=Math.PI*MERC_R;
      const mercX=(lng)=>lng*MERC_HALF/180;
      const mercY=(lat)=>{ const p=Math.max(-85.05112878,Math.min(85.05112878,lat));
        return Math.log(Math.tan(Math.PI/4+p*D/2))*MERC_R; };
      const unMercX=(x)=>x*180/MERC_HALF;
      const unMercY=(y)=>(2*Math.atan(Math.exp(y/MERC_R))-Math.PI/2)/D;
      /* MapLibre's zoom is defined against a 512-px world tile */
      const metrePerPx=()=>{ let z=2; try{ z=GE().camera.getZoom(); }catch(_){}
        if(!isFinite(z)) z=2; return (2*MERC_HALF)/(512*Math.pow(2,z)); }

      /* the initial great-circle bearing a→b, clockwise from north — the local heading, which is what
         `icon-rotate` measures when `icon-rotation-alignment` is 'map' (and it is a property of the
         two points, not of the projection, so it is right in globe view as well as flat) */
      function bearingOf(a,b){ const f1=a[1]*D, f2=b[1]*D, dl=(b[0]-a[0])*D;
        const y=Math.sin(dl)*Math.cos(f2), x=Math.cos(f1)*Math.sin(f2)-Math.sin(f1)*Math.cos(f2)*Math.cos(dl);
        return (Math.atan2(y,x)*180/Math.PI+360)%360; }

      /* ⚠ (#R258) THE CUT IS MEASURED IN THE RENDERER'S OWN PROJECTION, NOT IN MERCATOR METRES.
         The first version of this round did the arithmetic in Mercator metres, which is exact only
         where the theoretical and the drawn scale agree. MEASURED at z4 in GLOBE projection with
         Japan's exports on: at the map centre the two agree to 1 part in 5,000 (4,892.9 vs 4,892.0
         m/px), but the shaft-to-tip gap came out **10.1 px for a 45.5 px head** (USA, far off-centre)
         and 23.7 px for a 43 px head (China) — the globe compresses towards the limb, and every arc
         ENDS off-centre by construction. Asking `GE().coords.project` where the vertices actually
         land removes the whole class of error and costs one projection per vertex.
         The Mercator estimate stays as the fallback for the moment before the camera exists. */
      /* ══ ⚠⚠⚠ (#R261) THE HEAD'S ANGLE IS A SCREEN ANGLE. IT WAS A GEOGRAPHIC BEARING ═════════════
         「貿易レイヤーは、矢印と線が分離している。ふざけんなよ。」

         #R258 cut the shaft back by a number of PIXELS asked of the renderer's own projection —
         that half is right and is measured right (below, the cut lands within 0.2 px of the head's
         length at every partner). It then aimed the head with `bearingOf(neck,tip)`, which is a
         GEOGRAPHIC bearing, through `icon-rotation-alignment:'map'` — and that alignment does not
         mean «along the ground», it means «measured from the map's north», a SINGLE scalar for the
         whole viewport. On a globe, north is screen-up only on the central meridian; everywhere
         else the meridians converge. So the length was in screen space and the angle was in
         geographic space, and the two disagreed by exactly the grid convergence.

         MEASURED in globe projection with Japan's exports drawn, head-angle vs the true screen
         direction of the shaft's last leg (`coords.project` on both ends):

             z2.2, centre 170°E   USA  125.3° vs  99.0°   →  26.3° apart  (45.5 px head)
             z1.4, centre 100°E   USA  107.1° vs 237.6°   → 130.5° apart
                                  TWN  227.6° vs 211.8°   →  15.8° apart

         26° on a 45 px head puts the base of the triangle **20.7 px** from the end of a 13 px
         shaft: they do not touch. 130° puts it on the other side of the tip entirely. That is the
         report, exactly — an arrowhead floating beside a line.

         THE FIX IS TO STOP HAVING TWO SPACES. The neck is already known in projected coordinates
         (the cut is computed there), so the angle is taken there too and the layer is switched to
         `icon-rotation-alignment:'viewport'`, where `icon-rotate` IS a screen angle. Head and shaft
         are then collinear by construction, in Mercator and on the globe, at any zoom, bearing and
         pitch — there is one number and it cannot drift from itself.
         ⚠ The Mercator estimate stays as the fallback for the moment before the camera exists; in
         viewport space it has to give up the map's rotation, hence `− bearing`. */
      const _mapBearing=()=>{ try{ const b=GE().camera.getBearing(); return isFinite(b)?b:0; }catch(_){ return 0; } };
      function trimEnd(line,headPx){
        let P=null, screen=false;
        try{ const pr=GE().coords&&GE().coords.project;
          if(typeof pr==='function'){ P=[];
            for(const p of line){ const q=pr(p);
              if(!q||!isFinite(q.x)||!isFinite(q.y)){ P=null; break; } P.push([q.x,q.y]); }
            screen=!!P; } }catch(_){ P=null; screen=false; }
        let cut=headPx;
        if(!P){ P=line.map(p=>[mercX(p[0]),mercY(p[1])]); cut=headPx*metrePerPx(); }
        /* the angle the head must be drawn at, clockwise from screen-up. In projected pixels y grows
           DOWNWARD, so it is atan2(dx,−dy); in the Mercator fallback y grows northward and the map's
           own rotation has to come off. */
        const ang=(from,to)=>screen
          ? ((Math.atan2(to[0]-from[0],-(to[1]-from[1]))*180/Math.PI)+360)%360
          : ((Math.atan2(to[0]-from[0],to[1]-from[1])*180/Math.PI)-_mapBearing()+720)%360;
        let acc=0, i=P.length-1, f=0;
        for(;i>0;i--){ const a=P[i-1], b=P[i], d=Math.hypot(b[0]-a[0],b[1]-a[1]);
          if(acc+d>=cut){ f=(cut-acc)/(d||1); break; }
          acc+=d; }
        const tip=line[line.length-1], tipP=P[P.length-1];
        if(i<=0) return { shaft:null, brg:ang(P[Math.max(0,P.length-2)],tipP) };
        /* the neck, interpolated in GEOGRAPHIC coordinates on the segment the cut fell in — the arc is
           sampled finely enough (56 legs) that a linear step inside one leg is under a pixel */
        const a=line[i-1], b=line[i];
        const neck=[b[0]+(a[0]-b[0])*f, b[1]+(a[1]-b[1])*f];
        /* …and the SAME point in the space the cut was measured in, which is where the angle is read */
        const aP=P[i-1], bP=P[i];
        const neckP=[bP[0]+(aP[0]-bP[0])*f, bP[1]+(aP[1]-bP[1])*f];
        const shaft=line.slice(0,i).concat([neck]);
        return { shaft:(shaft.length>=2?shaft:null), brg:ang(neckP,tipP) };
      }

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
        /* (#R258) 「誰が線に複数矢印つけろって言ってんねん。」 — the along-the-shaft repeater is gone,
           and removed from a style that still carries it rather than merely left empty. */
        try{ if(GE().layers.has('wp-trade-arrow')) GE().layers.remove('wp-trade-arrow'); }catch(_){}
        /* the SHAFT of the arrow. Butt cap, because its flat end is what the head's base sits against
           — a round cap would bulge out past the triangle and read as two objects again. */
        if(!GE().layers.has('wp-trade-arc')) GE().layers.add({id:'wp-trade-arc',type:'line',source:SRC,filter:['==',['get','kind'],'arc'],
          layout:{visibility:'none','line-cap':'butt','line-join':'round'},
          paint:{'line-color':['get','col'],'line-width':['get','w'],'line-opacity':1}});
        /* the POINT of the same arrow: one per flow, at the end the goods arrive at, in the shaft's
           own colour and opacity, its tip on the arc's last vertex (`icon-anchor:'top'`). */
        if(!GE().layers.has('wp-trade-tip')) GE().layers.add({id:'wp-trade-tip',type:'symbol',source:SRC,filter:['==',['get','kind'],'tip'],
          layout:{visibility:'none','icon-image':['get','ai'],'icon-size':['get','asz'],
            /* (#R261) 'viewport': `brg` is a SCREEN angle now, read off the same projection the
               shaft's cut is measured in — see trimEnd. With 'map' it was a geographic bearing and
               the head stood up to 130° away from the line it belongs to. */
            'icon-rotate':['get','brg'],'icon-rotation-alignment':'viewport','icon-allow-overlap':true,
            'icon-ignore-placement':true,'icon-padding':0,'icon-anchor':'top'},
          paint:{'icon-opacity':1}});
        /* ⚠ (#R254) 「国にピンを置くな」 — the circle markers this layer dropped on every partner's
           centroid (and the white r=7 disc on the selected country) are gone. The countries themselves
           are shaded by `wp-trade-fill` (#R215) and the arcs carry the amounts, so the dots were a
           third statement of the same thing sitting on top of the map. The `node` FEATURES stay:
           they are what places the partner NAME, which the reader kept. */
        if(!GE().layers.has('wp-trade-lbl')) GE().layers.add({id:'wp-trade-lbl',type:'symbol',source:SRC,filter:['==',['get','kind'],'node'],
          layout:{visibility:'none','text-field':['get','name'],'text-size':window.IntMapLabelScale.sub(0.86),'text-offset':[0,0.2],'text-anchor':'top','text-allow-overlap':false},
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
              /* (#R258) ONE arrow: the shaft is cut back by exactly the head's length, so the two
                 primitives meet edge to edge instead of one lying on top of the other. */
              const asz=headSize(w);
              const cut=trimEnd(line,headLenPx(w));
              const props={col,v:d.v,iso:d.iso,name:d.name,vShort:usdShort(d.v),vExact:usdExact(d.v)};
              if(cut.shaft) feats.push({type:'Feature',geometry:{type:'LineString',coordinates:cut.shaft},
                properties:Object.assign({kind:'arc',w},props)});
              feats.push({type:'Feature',geometry:{type:'Point',coordinates:line[line.length-1]},
                properties:Object.assign({kind:'tip',ai:'wp-arrow-'+dir,asz,brg:cut.brg},props)});
              feats.push({type:'Feature',geometry:{type:'Point',coordinates:c},
                properties:{kind:'node',col,r:2.5+5.5*Math.sqrt(Math.max(0,d.v)/Math.max(1,vmax)),name:d.name,
                  v:d.v,vShort:usdShort(d.v),vExact:usdExact(d.v)}}); });
            feats.push({type:'Feature',geometry:{type:'Point',coordinates:home},
              properties:{kind:'node',col:'#ffffff',r:7,name:countryName(iso),v:0,vShort:'',vExact:''}});
          }
        }
        whenDrawable(()=>{ if(ensureLayers()){ GE().layers.setSourceData(SRC,{type:'FeatureCollection',features:feats}); applyVis(); }
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
          /* (#R254/#R258) the switch is over the whole arrow — shaft, head and label together */
          +'<label style="'+ROW+'cursor:pointer;">'+L('Flow arrows','フローの矢印','Strompfeile','Стрелки потоков','Flechas de flujo')
            +'<input type="checkbox" class="wp-arr"'+(arrows?' checked':'')+' style="width:16px;height:16px;accent-color:var(--primary-color);cursor:pointer;"></label>'
          +rampLegend(TRADE_RAMP.map(x=>[x[0]+'%',x[1]]),
              L('Share of the selected country’s total trade (the white country is the one selected)',
                '選択した国の貿易額全体に占める割合（白い国が選択中の国）',
                'Anteil am Gesamthandel des gewählten Landes','Доля в общей торговле выбранной страны','Cuota del comercio total del país elegido'))
          +'<div class="wp-stat" style="font-size:11.5px;color:var(--text-main);line-height:1.55;min-height:16px;"></div>'
          +'<div class="wp-list" style="font-size:11.5px;color:var(--text-main);"></div>'
          +'<div style="font-size:9.5px;color:var(--text-muted);line-height:1.5;">'
          +L('Arrow width is proportional to the SQUARE ROOT of the value (a flow-map convention — the eye compares area, and a stroke’s area is width × length), and the arrow points the way the goods move. Hover any arrow for the exact figure; nothing here rescales the amounts. Source: BACI (CEPII) via OEC, HS 6-digit, year ',
             '矢印の太さは金額の平方根に比例します（流動図の慣例。目は面積を比べるため、線の面積は幅×長さ）。矢印は物が動く向きを指しています。実額は矢印にホバーすると出ます。表示は圧縮しても金額そのものは一切加工していません。出典: BACI (CEPII) / OEC、HS6桁、',
             'Die Linienbreite folgt der QUADRATWURZEL des Werts. Genaue Zahl beim Hover. Quelle: BACI (CEPII) via OEC, ',
             'Ширина линии пропорциональна КОРНЮ из суммы. Точная цифра — при наведении. Источник: BACI (CEPII) / OEC, ',
             'El ancho sigue la RAÍZ CUADRADA del valor. Cifra exacta al pasar el cursor. Fuente: BACI (CEPII) vía OEC, ')
          +y+(y<YMIN||y>YMAX?(' → '+Math.max(YMIN,Math.min(YMAX,y))):'')+'.</div>');
        /* (#R270) the year, on the layer — BACI's own range. See makePanel.clockYear. */
        panel.clockYear({min:YMIN,max:YMAX});
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
        { const a=b.querySelector('.wp-arr'); if(a) a.onchange=(e)=>{ arrows=!!e.target.checked; applyVis(); }; }   /* (#R254) */
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
        /* (#R255) …and the terminal head, which is the largest thing on the arc and therefore the one
           a reader is most likely to point at. It carries the same properties as its own arc. */
        ['wp-trade-arc','wp-trade-tip'].forEach(id=>{   /* (#R254) the pin layer it also hovered is gone; the arc carries the figure */
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
      STATE.trade=()=>({ on, dir, section, topN, iso, year, arrows, partners:rows?rows.length:0,
        top:rows?rows.slice(0,3).map(d=>({iso:d.iso,v:d.v})):[] });
      STATE.tradeLoad=(code,o)=>{ o=o||{}; if(o.dir) dir=(o.dir==='M'||o.dir==='imports')?'M':'X';
        if(o.section!=null) section=String(o.section); if(o.topN) topN=+o.topN;
        if(o.arrows!=null){ arrows=!!o.arrows; applyVis(); }   /* (#R254) the arrow switch travels with the rest of the choice */
        return load(String(code||'').toUpperCase(),true); };
      STATE.tradeToggle=(v)=>{ const cb=document.getElementById('wp-dl-trade'); if(cb){ cb.checked=!!v; cb.dispatchEvent(new Event('change',{bubbles:true})); } else toggle(!!v); return !!v; };

      /* a basemap swap drops every added layer — put them back if this one is on (#R72) */
      onRestyle(()=>{ if(on) whenDrawable(()=>{ if(ensureLayers()) draw(); }); });
      /* ⚠ (#R258) THE SHAFT IS CUT BACK BY A NUMBER OF PIXELS, SO THE CUT MOVES WITH THE CAMERA. The
         head keeps its size on screen; the ground distance it covers halves with every zoom step, and
         in globe projection it also depends on WHERE on the disc the arc ends. If the geometry were
         built once, zooming in would leave the shaft short of the head (a gap) and zooming out would
         run it through the head (the overlap #R255 shipped). Rebuilt on `moveend` — which covers
         zoom, pan and rotation — debounced, and only while there is something drawn.
         ⚠ `draw()` ends in `setSourceData` + `setVis`, neither of which restyles when nothing
         changes (MapLibre's `setLayoutProperty` returns early on an equal value), so this cannot
         become the self-restyling loop the crop layer had. */
      { let _zt=null;
        try{ GE().events.on('moveend',()=>{ if(!(on&&rows&&iso)) return;
          if(_zt) clearTimeout(_zt); _zt=setTimeout(()=>{ _zt=null; try{ draw(); }catch(_){} },150); }); }catch(_){} }
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
          parts:[['coal_share_of_electricity__pct',LA('Coal','石炭','Kohle','Уголь','Carbón'),'#6b6b6b'],
                 ['gas_share_of_electricity__pct',LA('Gas','ガス','Gas','Газ','Gas'),'#c78a4b'],
                 ['oil_share_of_electricity__pct',LA('Oil','石油','Öl','Нефть','Petróleo'),'#8b5a3c'],
                 ['nuclear_share_of_electricity__pct',LA('Nuclear','原子力','Kernkraft','Атомная','Nuclear'),'#b455ff'],
                 ['hydro_share_of_electricity__pct',LA('Hydro','水力','Wasserkraft','ГЭС','Hidráulica'),'#2f7fe0'],
                 ['wind_share_of_electricity__pct',LA('Wind','風力','Wind','Ветер','Viento'),'#3fd1c7'],
                 ['solar_share_of_electricity__pct',LA('Solar','太陽光','Solarenergie','Солнечная','Solar'),'#ffd23f'],
                 ['bioenergy_share_of_electricity__pct',LA('Bioenergy','バイオ','Bioenergie','Биоэнергия','Bioenergía'),'#7cb342'],
                 ['other_renewables_excluding_bioenergy_share_of_electricity__pct',LA('Other renewables','その他再エネ','Sonstige Erneuerbare','Прочие ВИЭ','Otras renovables'),'#26a69a']],
          clean:['nuclear_share_of_electricity__pct','hydro_share_of_electricity__pct','wind_share_of_electricity__pct','solar_share_of_electricity__pct','bioenergy_share_of_electricity__pct','other_renewables_excluding_bioenergy_share_of_electricity__pct'] },
        prim:{ slug:'primary-energy-source-bar', unit:'TWh',
          parts:[['coal_twh',LA('Coal','石炭','Kohle','Уголь','Carbón'),'#6b6b6b'],['oil_twh',LA('Oil','石油','Öl','Нефть','Petróleo'),'#8b5a3c'],['gas_twh',LA('Gas','ガス','Gas','Газ','Gas'),'#c78a4b'],
                 ['nuclear_twh',LA('Nuclear','原子力','Kernkraft','Атомная','Nuclear'),'#b455ff'],['hydro_twh',LA('Hydro','水力','Wasserkraft','ГЭС','Hidráulica'),'#2f7fe0'],
                 ['wind_twh',LA('Wind','風力','Wind','Ветер','Viento'),'#3fd1c7'],['solar_twh',LA('Solar','太陽光','Solarenergie','Солнечная','Solar'),'#ffd23f'],
                 ['other_renewables_twh',LA('Other renewables','その他再エネ','Sonstige Erneuerbare','Прочие ВИЭ','Otras renovables'),'#26a69a']],
          clean:['nuclear_twh','hydro_twh','wind_twh','solar_twh','other_renewables_twh'] } };
      let on=false, iso=null, kind='elec';
      const panel=makePanel('wp-energy-panel',()=>'⚡ '+L('Energy mix','エネルギー構成','Energiemix','Энергобаланс','Mezcla energética'),'wp-dl-energy',
        { legendId:'wpenergy', layers:()=>[fillId('elec'),fillId('prim')],
          names:()=>(LA('⚡ Energy mix','⚡ エネルギー構成','⚡ Energiemix','⚡ Энергобаланс','⚡ Mezcla energética')) });
      /* ⚠ (#R251) the two name slots collapsed into ONE tuple, so the row is [key, name, colour]
         and the colour moved from p[3] to p[2]. Resolved through pick() itself — `L.arr` — so a
         language past the five arguments reaches the inline table instead of falling to English. */
      const partName=(p)=>L.arr(p[1]);

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
        /* (#R270) the year row's bounds are the file's own, so it can only be built once the file is
           here — this is the moment it arrives, on the path the MAP already takes. */
        try{ if(panel.shown()){ const yr=owidRange(cfg.slug); if(yr) panel.clockYear(yr); } }catch(_){}
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
          return '<div title="'+esc(partName(p))+'" style="width:'+(v/tot*100).toFixed(2)+'%;background:'+p[2]+';"></div>'; }).join('');
        const leg=parts.map(p=>{ const v=rec[p[0]]; if(!(isFinite(v)&&v>0)) return '';
          return '<div style="display:flex;align-items:center;gap:6px;padding:1.5px 0;">'
            +'<span style="width:10px;height:10px;border-radius:2px;background:'+p[2]+';flex:none;"></span>'
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
        /* (#R270) the year, on the layer — Our World in Data's own range, read off the rows that
           actually loaded rather than assumed; before they land the row is simply not built. */
        { const yr=owidRange(SRCS[kind].slug); if(yr) panel.clockYear(yr); }
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
     *  「気象警報は、日本では気象庁の塗分けに対応させろ。また、市町村単位で塗り分けろ。まだ対応して
     *    いない国は、灰色斜線で、発令されていないだけの地域は灰色に。」
     *  「警報レイヤー、日本以外でも区分単位、発令単位ごとに色分けしろ。…対応国も増やせ。更新が遅すぎる。
     *    ソースは一国一ソース。各国の気象台やそれに相当する機関の情報をもとにしろ。GDACSを完全に撤廃しろ。」
     *  「一番根本的なのは、今のレイヤーが『警報を理解するUI』ではなく『取得した警報データを全部描画する
     *    UI』になっていること。初期状態では地図を見ただけで どこで / 何が / どれほど危険か / 情報は新鮮か
     *    の4つが分かるべき。」
     *
     *  ══ ⚠⚠⚠ (#R273) THE TEN THINGS THAT WERE WRONG WERE ONE THING ═══════════════════════════════
     *  Every item on that list is the same defect seen from a different side: the layer was drawing
     *  what it had FETCHED rather than answering what a reader asks a warning map. So it is built
     *  around the four questions and every earlier feature is placed under one of them.
     *
     *    WHERE   the unit the agency issues for — Japan at the MUNICIPALITY (its class20, the level
     *            its own map draws), Germany at the Landkreis, Europe at the CAP region, China at
     *            the province, and so on. A country with a feed but nothing in force is GREY; a
     *            country with no feed at all is HATCHED, because 「警報なし」 and 「データなし」 are
     *            different states and a blank map cannot say which.
     *    WHAT    the hazard, ON the map — the area carries the agency's own word for it as TEXT
     *            (an abbreviation when the area is small on screen), plus 「+N」 when more than one
     *            warning is in force there. A single worst-severity colour throws the other
     *            warnings away, and 「クリックするまで種類が分からない設計」 is what that produced.
     *    HOW BAD in the issuing agency's OWN published palette by default — the JMA's
     *            黄/赤/紫/黒, the CMA's 蓝/黄/橙/红, the CAP awareness ladder everyone else
     *            publishes on. 「赤だからフランスと日本で同程度の危険」 is exactly what one shared
     *            three-colour ramp says, and it is not true. The IntMap-normalised view is still
     *            there — it is a MODE you choose, and it says in words that the conversion is
     *            IntMap's own and not a statement about equivalence.
     *    HOW NEW every feed's own clock (#R269), now graded Fresh / Delayed / Stale / Error rather
     *            than one green dot for 「answered」 — 31 h and 2 min were the same colour.
     *
     *  ⚠ GDACS IS GONE. 「GDACSを完全に撤廃しろ。」 It was an EVENT feed whose unit was a whole
     *  country, painted next to national warnings on the same map; removing it is why the hatch
     *  above has to exist, because it was the thing that made an unwired country look answered.
     *
     *  ⚠ THE NUMBERS IN THE PANEL ARE ONE UNIT. 「JMA 111 発令区域 / MeteoAlarm 5070 件」 compared
     *  nothing: one was areas and the other was warnings. Every source line counts the SAME thing —
     *  units drawn — and the source list itself is folded away under 「ソースの状態」, because a
     *  reader asked 「どこで何が起きているか」 and was shown a list of APIs.
     * ════════════════════════════════════════════════════════════════════════════════════════════*/
    (function alerts(){
      const SRC='wp-alert', LYR=['wp-alert-fill','wp-alert-line','wp-alert-lbl','wp-alert-lbls'];
      const CHORO='wp-alert-choro', HATCH='wp-alert-hatch';
      /* (#R288) 「発令なし」 at the unit the country is divided into — see quietFeatures() */
      const QSRC='wp-alert-quiet-src', QFILL='wp-alert-quiet', QLINE='wp-alert-quiet-line';
      /* the SAME grey the country-wide sheet uses (`washExpr`'s tier 1), because it is the same
         claim at a finer unit — a second shade would read as a second meaning */
      const QUIET_COL='rgba(220,220,224,0.42)';
      /* ══ ⚠⚠ (#R288) ONE PLACE DECIDES WHETHER THIS LAYER IS SHOWING ═══════════════════════════
         Visibility was set in four places over three different lists (LYR in publish, [CHORO,HATCH]
         in paintCountries, LYR again in the restyle hook), and any of them could run while the style
         was refusing new layers — so a re-add that landed between two of those calls left PART of
         the layer hidden. MEASURED while this round was being written: `wp-alert-fill`, the country
         wash and the hatch sat at `visibility:none` while the outlines and the labels beside them
         were visible, i.e. the warnings were on the map as thin coloured lines with no fill.
         So the whole family is ONE list and ONE call, re-asserted whenever the map goes idle — the
         same treatment the weather field needed in #R276, for the same reason. */
      const ALL_LYR=()=>LYR.concat([CHORO,HATCH,QFILL,QLINE]);
      function applyAlertVis(){ setVis(ALL_LYR(),on); }
      let on=false, feats=[], busy=false, timer=null;
      /* ⚠ (#R212) 「現在出てるのに、何も発令されてないと日本の場合は出てくる。」 — AND THAT WAS THE FEED
         NOT HAVING ARRIVED, PRINTED AS A FACT. Every feed carries its own state and the legend says
         which one it is: loading / could not be fetched / genuinely nothing. */
      const FEED_STATE={};        /* feed key → 'idle' | 'loading' | 'ok' | 'error' */
      /* ══ ⚠⚠⚠ (#R269) A FEED THAT STOPPED IS NOT A FEED THAT FAILED ═══════════════════════════════
         The JMA endpoint this layer read had been frozen for eighty-three days and answered 200 with
         valid JSON of the expected shape the whole time. Every loader records the newest timestamp
         IT COULD FIND IN ITS OWN PAYLOAD, and the panel prints the age beside the service. */
      const FEED_AT={};           /* feed key → the newest item timestamp in that feed's own payload */
      /* ══ ⚠⚠ (#R293) 「いつ発表の情報か、そしてIntMapがいつ取得した情報かも書け」 — TWO CLOCKS ═══════
         `FEED_AT` is the AGENCY's clock (the newest timestamp inside its own payload) and this is
         IntMap's (when THIS browser last read that service successfully). They answer different
         questions and #R269 is the round that paid for confusing them: a feed frozen for eighty-
         three days answered 200 with valid JSON the whole time, so 「いつ取得したか」 looked fresh
         while 「いつ発表されたか」 was three months old. A card that prints only one of them cannot
         tell the reader which situation they are in. */
      const FEED_GOT={};          /* feed key → epoch ms when THIS browser last read that feed OK */
      const feedOK=(k)=>{ FEED_STATE[k]='ok'; FEED_GOT[k]=Date.now(); };
      /* ⚠ A TIMESTAMP IN THE FUTURE IS NOT EVIDENCE OF FRESHNESS (#R269): MeteoAlarm's rows carry the
         warning's VALIDITY WINDOW and a warning in force normally expires tomorrow. */
      const seenAt=(k,t)=>{ const v=Date.parse(t||''); if(!isFinite(v)) return;
        if(v>Date.now()+60000) return;
        if(!FEED_AT[k]||v>FEED_AT[k]) FEED_AT[k]=v; };
      const ageH=(k)=>(FEED_AT[k]?((Date.now()-FEED_AT[k])/3600000):null);
      const ageTxt=(k)=>{ const h=ageH(k); if(h==null) return '';
        return (h<1?(Math.max(0,Math.round(h*60))+' min'):h<48?(h.toFixed(1)+' h'):(Math.round(h/24)+' d')); };
      let cmaCount=0, cmaRec=null;
      let lastAt=0;
      /* ⚠⚠ (#R273 追記) THE SLIDER OWNS THE WASH, NOT THE ANSWER. MEASURED on production with the
         layer on: `line-opacity` on `wp-alert-line` came back **0.38** — `_applyGenericOpacity` dims a
         line layer along with everything else the checkbox owns, so the OUTLINE that was given the
         rank to carry (「面はもっと薄くして、重大度は境界線やパターンでも表現した方がいい」) faded with the fill
         it was supposed to survive. `layers()` below declares the FILL and the country wash; the
         outline and the hazard's own name are the answer and stay — the same rule #R205 wrote for a
         plate label, which is what `_opacityOpaqueText` does for the symbol half.
         ⚠ KEEP THIS NOTE OUTSIDE THE CALL: tests/r212 ② matches `makePanel('…', …)` within 560
         characters to check every family passes a row id, and a comment inside the argument list
         pushes the closing brace past that window. */
      const panel=makePanel('wp-alert-panel',()=>'⚠ '+L('Warnings','気象・災害警報','Warnungen','Предупреждения','Avisos'),'wp-dl-alerts',
        { legendId:'wpalerts', layers:()=>['wp-alert-fill',CHORO,HATCH],
          names:()=>(LA('⚠ Weather & disaster warnings','⚠ 気象・災害警報','⚠ Wetter- und Katastrophenwarnungen','⚠ Метеопредупреждения','⚠ Avisos meteorológicos')) });

      /* ══ ⚠⚠⚠ (#R269) THE JMA CODE TABLE IS THE JMA'S OWN, NOT ONE WRITTEN FROM MEMORY ═══════════
         The table this replaces was written from memory and from code 10 onwards almost every row
         named the wrong hazard AND the wrong severity (14 = 雷注意報 was drawn as 洪水警報 over 914
         areas). This is the object the JMA's own warning page carries: every code with the ELEMENT
         it belongs to and the LEVEL the JMA assigns it — 20 注意報 / 30 警報 / 40 危険警報 /
         50 特別警報. The rank comes from that level and from nothing else.
         ⚠ THE FLOOD-FORECAST CODES ARE A DIFFERENT TABLE AND ARE DELIBERATELY NOT HERE (their codes
         collide with 濃霧/乾燥/なだれ in this one). */
      const JMA_ELEM={
        rain:LA('Heavy rain','大雨','Starkregen','Сильный дождь','Lluvia intensa'),
        landslide:LA('Landslide','土砂災害','Erdrutsch','Оползень','Deslizamiento'),
        tide:LA('Storm surge','高潮','Sturmflut','Штормовой нагон','Marea de tormenta'),
        wind:LA('Strong wind','強風','Starkwind','Сильный ветер','Viento fuerte'),
        windGale:LA('Gale','暴風','Sturm','Шторм','Vendaval'),
        wind_snow:LA('Snow and wind','風雪','Schneetreiben','Снег с ветром','Nieve con viento'),
        wind_snowGale:LA('Snowstorm','暴風雪','Schneesturm','Метель','Ventisca'),
        snow:LA('Heavy snow','大雪','Starker Schneefall','Сильный снегопад','Nevada intensa'),
        wave:LA('High waves','波浪','Hoher Seegang','Высокие волны','Oleaje fuerte'),
        thunder:LA('Thunderstorm','雷','Gewitter','Гроза','Tormenta eléctrica'),
        snow_melting:LA('Snowmelt','融雪','Schneeschmelze','Таяние снега','Deshielo'),
        fog:LA('Dense fog','濃霧','Dichter Nebel','Густой туман','Niebla densa'),
        dry:LA('Dry air','乾燥','Trockene Luft','Сухой воздух','Aire seco'),
        avalanche:LA('Avalanche','なだれ','Lawine','Лавина','Avalancha'),
        cold:LA('Low temperature','低温','Tiefe Temperaturen','Низкая температура','Baja temperatura'),
        frost:LA('Frost','霜','Frost','Заморозки','Helada'),
        ice_accretion:LA('Ice accretion','着氷','Eisansatz','Обледенение','Engelamiento'),
        snow_accretion:LA('Snow accretion','着雪','Schneeanhaftung','Налипание снега','Acumulación de nieve')};
      /* code → [element, JMA level].  ⚠ 強風/暴風 and 風雪/暴風雪 are DIFFERENT WORDS at different
         levels and the JMA writes them so; the element key gains `Gale` above level 20 for those two. */
      const JMA_CODE={
        '10':['rain',20], '03':['rain',30], '43':['rain',40], '33':['rain',50],
        '29':['landslide',20], '09':['landslide',30], '49':['landslide',40], '39':['landslide',50],
        '19':['tide',20], '08':['tide',30], '48':['tide',40], '38':['tide',50],
        '15':['wind',20], '05':['wind',30], '35':['wind',50],
        '13':['wind_snow',20], '02':['wind_snow',30], '32':['wind_snow',50],
        '12':['snow',20], '06':['snow',30], '36':['snow',50],
        '16':['wave',20], '07':['wave',30], '37':['wave',50],
        '14':['thunder',20], '17':['snow_melting',20], '20':['fog',20], '21':['dry',20],
        '22':['avalanche',20], '23':['cold',20], '24':['frost',20],
        '25':['ice_accretion',20], '26':['snow_accretion',20]};
      const jmaKind=(code)=>{ const e=JMA_CODE[String(code)]; if(!e) return null;
        const k=(e[1]>20&&JMA_ELEM[e[0]+'Gale'])?(e[0]+'Gale'):e[0];
        return JMA_ELEM[k]||null; };

      /* ══ ⚠⚠⚠ (#R273) TWO PALETTES, AND ONLY ONE OF THEM IS ANYBODY'S OFFICIAL SCALE ═════════════
         「各国の警報階級を同じ紫・赤・黄に押し込んでいる。これがかなり危険です。JMA、NWS、MeteoAlarm、
           CMAなどは警報制度そのものが違います。『赤だからフランスと日本で同程度の危険』と読めてしまう。
           共通3段階へ正規化するなら、IntMap独自換算であることを明示する必要があります。」

         → 「塗りの色を、各国の公式配色に忠実に塗るモードと、IntMap換算の世界共通塗りモードを
             切り替えられるように。」 Both exist; the switch is in the panel and the choice is kept.

         AGENCY MODE. Every colour below was read out of the issuing service's OWN published table,
         not chosen here:
           JMA   the object its warning page's stylesheet carries —
                 `.contents-level20 #f2e700` 注意報 · `-level30 #ff2800` 警報 ·
                 `-level40 #aa00aa` 危険警報 · `-level50 #0c000c` 特別警報 ·
                 `.contents-missing #c8c8cb` 発表なし  (measured this round, from jma.go.jp itself)
           CMA   China's 气象灾害预警信号 four-colour scale: 蓝 IV · 黄 III · 橙 II · 红 I
           CAP   the awareness ladder MeteoAlarm, the DWD, MET Norway, the NWS, ECCC, INMET, BoM,
                 PAGASA, the HKO and the CWA all publish on: yellow · orange · red
         A service that publishes no scale of its own is on CAP because CAP is what it files in.

         INTMAP MODE. One four-step scale for the whole world, in colours no agency uses, so it can
         never be mistaken for an official one — and the panel says, in words, that it is IntMap's
         own conversion and NOT a claim that two countries' reds mean the same thing. The mapping
         is stated per agency in `NORM_NOTE` and is the only place a rank is ever compared. */
      const PAL={
        jma:{20:'#f2e700',30:'#ff2800',40:'#aa00aa',50:'#0c000c'},
        cma:{1:'#3b6fd4',2:'#f2e700',3:'#ff8c00',4:'#e60000'},
        cap:{1:'#ffd200',2:'#ff8c00',3:'#e60000'}};
      /* ══ ⚠⚠ (#R293) THE NORMALISED LADDER IS THE FIVE COLOURS THE READER NAMED ══════════════
         「IntMap独自階級は、灰色、黄色、赤色、紫色、黒にしろ。」 Five names for the five rows this key has
         always had — the four ranks plus 「発令なし」 — so grey keeps the one meaning it has carried
         since #R273 (「読んだ。何も出ていない」) and the ranks run yellow → red → purple → black.
         ⚠ #R273 chose the previous four so they could never be mistaken for an agency's own scale,
         and this ladder is the ORDER the JMA publishes on. The values below are IntMap's (the app's
         own iOS system hues), not the JMA's table — and `worldKey()` still says in words that the
         conversion is IntMap's own and not a claim that two countries' ranks mean the same thing. */
      const PAL_NORM={1:'#ffd60a',2:'#ff3b30',3:'#af52de',4:'#141418'};
      /* ⚠ (#R293) 「灰色塗の色味は少しだけ白に近づけろ」 — ONE declaration, because the map's quiet fill,
         the country-wide wash and every legend swatch are the SAME claim and #R270 is the round that
         paid for letting a colour and its name travel separately. Was the JMA's own #c8c8cb. */
      const NONE_COL='#dcdce0';          /* 「発令なし」 — read, and nothing in force */
      const NORM_NAME=(n)=>n>=4?L('Emergency','緊急（最高階級）','Notfall','Экстренный','Emergencia')
        :n===3?L('Danger','危険','Gefahr','Опасность','Peligro')
        :n===2?L('Warning','警戒','Warnung','Предупреждение','Aviso')
        :L('Advisory','注意','Hinweis','Внимание','Advertencia');
      /* which of the three published palettes a feed files its ranks in */
      const FEED_PAL={ jma:'jma', cma:'cma' };
      const palOf=(feed)=>PAL[FEED_PAL[feed]||'cap'];
      /* the agency's own rank → IntMap's four. ⚠ This is the ONE place ranks are compared, and the
         panel prints this table rather than hiding it inside a colour. */
      function normOf(feed,lv){
        if(feed==='jma') return lv>=50?4:lv>=40?3:lv>=30?2:1;
        if(feed==='cma') return lv>=4?3:lv>=3?2:1;      /* 红 I → Danger, 橙 II → Warning, 黄/蓝 → Advisory */
        return lv>=3?3:lv>=2?2:1;                       /* CAP Extreme / Severe / Moderate-Minor */
      }
      const agCol=(feed,lv)=>(palOf(feed)[lv]||palOf(feed)[Math.max.apply(null,Object.keys(palOf(feed)).map(Number))]||NONE_COL);
      /* the agency's own WORD for the rank it assigned, in the reader's language where the agency
         publishes one; otherwise CAP's own severity word, which is what the feed actually carries */
      function rankName(feed,lv){
        if(feed==='jma') return lv>=50?L('Emergency warning','特別警報','Notfallwarnung','Экстренное предупреждение','Aviso de emergencia')
          :lv>=40?L('Danger warning','危険警報','Gefahrenwarnung','Опасное предупреждение','Aviso de peligro')
          :lv>=30?L('Warning','警報','Warnung','Предупреждение','Aviso')
          :L('Advisory','注意報','Hinweis','Рекомендация','Advertencia');
        if(feed==='cma') return lv>=4?L('Red (I)','赤（I級）','Rot (I)','Красный (I)','Rojo (I)')
          :lv>=3?L('Orange (II)','オレンジ（II級）','Orange (Stufe II)','Оранжевый (II)','Naranja (II)')
          :lv>=2?L('Yellow (III)','黄（III級）','Gelb (III)','Жёлтый (III)','Amarillo (III)')
          :L('Blue (IV)','青（IV級）','Blau (IV)','Синий (IV)','Azul (IV)');
        return lv>=3?L('Extreme','Extreme（最も深刻）','Extrem','Экстремальный','Extremo')
          :lv>=2?L('Severe','Severe（深刻）','Schwer','Серьёзный','Grave')
          :L('Moderate','Moderate','Mäßig','Умеренный','Moderado'); }
      /* CAP's own severity words, the scale the NWS, the DWD and MeteoAlarm all publish on */
      const SEV3={Extreme:3,Severe:2,Moderate:1,Minor:1,Unknown:1};

      /* ⚠⚠ (#R273) 「色が濃すぎて地図を殺している。フランス、イタリア、ポーランドあたりを見ると、警報
         ポリゴンがほぼベタ塗り。地形・道路・都市・国境を見る能力が急激に落ちている。面はもっと薄くして、
         重大度は境界線やパターンでも表現した方がいい。」 — the fill starts at 38 % rather than 85 %,
         the OUTLINE carries the rank (its width steps with it) and the hazard's own name is drawn
         on the area, so the answer survives a fill you can see the map through.
         「透明度選択をつけろ」 — the legend's own opacity row drives all of this (js/data-layers.js
         registers it from `panel.open`), and the panel repeats it as four labelled steps so it is
         where the reader is looking rather than at the bottom of the box. */
      const OPACITY_DEFAULT=0.38;

      /* ══ ⚠⚠⚠ (#R273) 「まだ対応していない国は、灰色斜線で、発令されていないだけの地域は灰色に。」 ══
         「『警報なし』と『データなし』を区別できない。世界地図ではこれは必須です。」
         Three states, three appearances, and the difference is the whole point:
            HATCHED  no national feed is wired for this country — the map is saying nothing about it
            GREY     a feed IS wired and nothing is in force in that unit  (the JMA's own #c8c8cb)
            COLOUR   a warning is in force, in the palette of whichever mode is on
         The hatch is drawn as an image pattern rather than as a colour, because a fourth grey would
         be a fourth thing to learn and 「未対応」 is not a severity. */
      /* ⚠ the image API is `GE().scene` — «`GE().layers.addImage` is simply undefined» is a mistake
         this file has already made once (see the note in the arrows block above). */
      /* ══ ⚠⚠⚠ (#R290) THE HATCH TILE WAS PAINTING A GREY SHEET UNDER ITS OWN LINES ═════════════
         「灰色塗と灰色斜線が両方ある地域があるが、どうなっとんねんごら。」 — the two appearances this
         layer asks the reader to tell apart were BOTH being drawn, in the same place, by one
         layer. The 10×10 tile opened with `fillRect` in `rgba(158,162,170,0.26)` and then stroked
         the diagonals over it, so 「未対応 / 未取得」 rendered as **grey fill PLUS lines** while
         「発令なし」 renders as grey fill alone. Every hatched country therefore carried the quiet
         country's appearance underneath its own, which is exactly the state the reader described
         and exactly the confusion 「ここの区別はちゃんとやれ。混同するな。」 forbids.
         → THE TILE IS LINES ON TRANSPARENT. The two claims are now visually exclusive: grey means
         「読んだ。何も出ていない」 and nothing else; diagonals mean 「この地図はここについて何も述べ
         ていない」 and nothing else. The lines carry the whole signal, so they are a little darker
         and a little wider than before to stay legible without a backing sheet. */
      const HATCH_IMG='wp-alert-hatch-img';
      /* ══ ⚠⚠ (#R293) 「斜線塗をもっと見やすい感じにしろ」 — AND THE SWATCH IS THE SAME TILE ══════
         #R290 took the backing sheet OFF the tile, which was right, and left the whole signal to a
         single mid-grey line: legible over a pale basemap, nearly invisible over satellite imagery
         and over the dark theme. So each diagonal now carries its own light halo — the same trick
         the hazard labels beside it already use — and it reads on any ground WITHOUT the sheet
         coming back: the gaps are still exactly transparent, which is the property #R290 measured
         and `tests/r293` re-measures.
         ⚠ ONE DECLARATION, TWO SURFACES. `hatchCanvas()` is what the map draws AND what the legend
         swatch is a picture of — #R270 is the round that paid for a key disagreeing with the thing
         it names, and a hand-written `repeating-linear-gradient` beside this is exactly that bug
         waiting to happen (there were two of them here, with different numbers, before this). */
      const HATCH_S=13, HATCH_HW=3.4, HATCH_LW=1.9;
      const HATCH_HALO='rgba(255,255,255,0.74)', HATCH_LINE='rgba(34,38,48,0.94)';
      let _hatchCv=null;
      function hatchCanvas(){ if(_hatchCv) return _hatchCv;
        const S=HATCH_S, c=document.createElement('canvas'); c.width=c.height=S;
        const g=c.getContext('2d');
        g.clearRect(0,0,S,S);                       /* (#R290) NO backing sheet — see above */
        g.lineCap='square';
        const path=()=>{ g.beginPath();
          g.moveTo(-2,S+2); g.lineTo(S+2,-2);
          g.moveTo(S-2,S+2); g.lineTo(S+2,S-2);
          g.moveTo(-2,2); g.lineTo(2,-2); };
        g.strokeStyle=HATCH_HALO; g.lineWidth=HATCH_HW; path(); g.stroke();
        g.strokeStyle=HATCH_LINE; g.lineWidth=HATCH_LW; path(); g.stroke();
        return (_hatchCv=c); }
      let _hatchURL='';
      const hatchSwatch=(px)=>{ let u=''; try{ u=(_hatchURL=_hatchURL||hatchCanvas().toDataURL()); }catch(_){}
        const n=px||12;
        return 'width:'+n+'px;height:'+n+'px;border-radius:3px;flex:none;'
          +(u?('background-image:url('+u+');background-repeat:repeat;background-size:'+HATCH_S+'px '+HATCH_S+'px;'):'background:rgba(128,132,140,0.4);')
          +'box-shadow:0 0 0 1px rgba(128,128,128,0.32);'; };
      let _hatchOn=false;
      function ensureHatch(){ if(_hatchOn) return true;
        try{ if(GE().scene.hasImage(HATCH_IMG)){ _hatchOn=true; return true; } }catch(_){}
        try{
          const S=HATCH_S, g=hatchCanvas().getContext('2d');
          const im=g.getImageData(0,0,S,S);
          if(!GE().scene.addImage(HATCH_IMG,{width:S,height:S,data:new Uint8Array(im.data.buffer.slice(0))})) return false;
          _hatchOn=true; return true;
        }catch(_){ return false; } }

      /* ══ ⚠⚠ (#R273) THE HAZARD, ON THE MAP ═══════════════════════════════════════════════════════
         「赤いフランスを見ても、暴風・大雨・洪水・高温・雷・雪 のどれなのか分かりません。今の表示は
           severity しか表現しておらず、警報地図として情報量が足りません。」
         → 「警報種別は、その区間に文字で表示。（小さい場合はイニシャル表記など。）」
         The area carries the agency's own word for the hazard. Two forms travel with the feature —
         the full name and a short one — and the label layer picks between them by ZOOM, so a small
         area is initials rather than nothing. 「+N」 is the other warnings in force in that same
         unit, which is what a single worst-severity colour was throwing away. */
      /* ⚠ AN ACRONYM IS NOT A SHORT NAME. The first version of this took initials, and MeteoAlarm's
         own event wording turned into 「MTW+4」 and 「GHT+6」 on the map — measured over Italy and
         Greece — which is a code the reader has no key to. The short form is the HAZARD WORD with
         the rank words taken off, because the rank is already the colour: 「Moderate thunderstorm
         warning」 → 「Thunderstorm」, 「Severe high-temperature warning」 → 「High-temperature」.
         Nothing is reworded; words that name the severity are simply not repeated. */
      const HZ_DROP=/^(a|an|the|minor|moderate|severe|extreme|major|green|yellow|orange|red|warning|warnings|warnung|advisory|advisories|alert|alerts|watch|statement|special|weather|aviso|alerta)$/i;
      function shortHz(s){ s=String(s||'').trim(); if(!s) return '';
        if(/[぀-ヿ㐀-鿿가-힯]/.test(s)) return s.slice(0,4);
        const w=s.split(/[\s,·()]+/).filter(x=>x&&!HZ_DROP.test(x));
        let t=w[0]||s.split(/\s+/)[0]||s;
        if(t.length<=5&&w[1]) t=t+' '+w[1];
        if(t.length>13) t=t.slice(0,12)+'…';
        return t.charAt(0).toUpperCase()+t.slice(1); }

      /* ══ ⚠⚠⚠ (#R277) 「警報名は設定言語で書け。」 ═══════════════════════════════
         Until this round the word on the map was whatever the issuing service happened to write, so
         one map carried, MEASURED in one session: 「Thunderstormwarning」 (Austria), 「ORAGE」 (Ivory
         Coast), 「STARKES GEWITTER」 (Germany), 「Mye regn」 (Norway), 「Baixa Umidade」 (Brazil),
         「降雨」 (Taiwan), 「大風蓝色」 (China), 「大雨」 (Japan) and 「ارتفاع درجات الحرارة」 — eight
         languages and three scripts, on one screen, none of them necessarily the reader’s.

         So the hazard is CLASSIFIED and then NAMED in the reader’s language. The classification is
         a match against the vocabulary the services actually publish (each pattern carries the word
         in the languages the services that use it write in), and the winner is the pattern that
         matches EARLIEST in the text — not the first pattern in the list — because the leading word
         is the hazard and the rest is qualification: 「Strong Wind and Large Waves」 is wind,
         「雷雨大风」 is a thunderstorm, 「rain-flood」 is rain. Ties go to list order, which is what
         puts 「VENT DE SABLE」 (a sandstorm, matching `dust` and `wind` at position 0) under dust.

         ⚠ NOTHING IS THROWN AWAY. The agency’s own wording travels with the row and is what the tap
         card prints, beside the translated name — 「正確で忠実な」 means the reader can always see what
         the service itself said. And a hazard that matches NOTHING keeps the agency’s own word
         rather than being flattened into 「Other」: a name this table has not learned yet is
         information, and replacing it with a placeholder would be the only lossy option here.
         ⚠ THE RANK IS NOT PART OF THE NAME. 「Yellow high-temperature warning」 is 「Heat」 — the rank
         is already the colour, and repeating it in the label is what produced 「Moderate Heat Related
         Impact」 on the map. */
      const HAZ=[
        ['tsunami',   /tsunami|rissaga|meteotsunami|津波|海啸|해일|цунами/i,        ()=>L('Tsunami','津波','Tsunami','Цунами','Tsunami')],
        ['volcano',   /volcan|ash ?fall|cendre|火山|화산|вулкан/i,       ()=>L('Volcanic ash','火山灰','Vulkanasche','Вулканический пепел','Ceniza volcánica')],
        ['cyclone',   /typhoon|hurricane|tropical (cyclone|storm|depression)|cyclone|tempête tropicale|cicl[oó]n|台风|颱風|台風|熱帯低気圧|тайфун|ураган|циклон/i, ()=>L('Cyclone','台風','Wirbelsturm','Циклон','Ciclón')],
        ['tornado',   /tornado|waterspout|trombe|竜巻|龍捲|龙卷|смерч/i, ()=>L('Tornado','竜巻','Tornado','Смерч','Tornado')],
        ['dust',      /dust|sand ?storm|vent de sable|sable|رمل|غبار|沙尘|揚沙|砂じん|黄砂|пыл|polvo|staub/i, ()=>L('Dust','砂じん嵐','Staubsturm','Пыльная буря','Polvo')],
        ['avalanche', /avalanche|lawine|valanga|alud|snøskred|雪崩|なだれ|лавин|awareness_?type ?= ?9\b/i, ()=>L('Avalanche','なだれ','Lawine','Лавина','Aludes')],
        /* ⚠ (#R284) 「Red Flag Warning」 IS THE NWS'S NAME FOR FIRE WEATHER and carries neither the
           word 「fire」 nor 「weather」 in a form this list matched — measured, it came through as the
           agency's own words on a map set to Japanese. Same for the CMA's 「Meteorological risk of
           geological disaster」 (a landslide) and 「Strong convection」 (a thunderstorm), and for the
           Balearic 「rissaga」, which is a meteotsunami and has no other name in any language. */
        ['wildfire',  /fire\b|red flag|waldbrand|skogbrann|feu de for|incendi|山火|林野火災|森林火|пожар|awareness_?type ?= ?8\b/i, ()=>L('Wildfire','林野火災','Waldbrand','Лесные пожары','Incendios')],
        ['landslide', /landslide|mudslide|debris flow|rockfall|geological (disaster|hazard)|erdrutsch|glissement|deslizamiento|土砂|地质灾害|山体滑坡|оползен/i, ()=>L('Landslide','土砂災害','Erdrutsch','Оползень','Deslizamiento')],
        ['flashflood',/flash ?flood|sturzflut|riada|内涝|山洪|浸水|ливнев|awareness_?type ?= ?12\b/i,  ()=>L('Flash flood','浸水','Sturzflut','Ливневый паводок','Riada')],
        ['flood',     /flood|inondation|hochwasser|inundaci|alluvion|poplav|powódź|árvíz|flom|tulva|översvämning|洪水|大水|боднен|наводнен|паводок/i, ()=>L('Flood','洪水','Hochwasser','Наводнение','Inundación')],
        ['ice',       /black ?ice|freezing rain|glatteis|verglas|icing|glaze|isglatta|着氷|凍結|冻雨|гололёд|гололед|hielo/i, ()=>L('Ice','着氷・路面凍結','Glatteis','Гололёд','Hielo')],
        ['snow',      /snow|schnee|neige|nieve|neve|snø|lumi|snö|blizzard|大雪|降雪|融雪|着雪|снег|снегопад|awareness_?type ?= ?2\b/i, ()=>L('Heavy snow','大雪','Schnee','Снег','Nieve')],
        ['hail',      /hail|hagel|grêle|granizo|grandine|冰雹|雹|град|우박|awareness_?type ?= ?13\b/i, /* ⚠ NOT 「Hail」: the inline tables are keyed BY THE ENGLISH STRING and one already exists for
           the Yemeni city of حائل — measured, fr 《Haïl》 / ko 《하일》 / 中文 《哈伊勒》. A hazard called
           「Hail」 would have rendered as a CITY NAME in every language past the five positional ones. */
          ()=>L('Hailstorm','雹','Hagel','Град','Granizo')],
        ['frost',     /frost|gelée|helada|霜|заморозк/i,             ()=>L('Frost','霜','Frost','Заморозки','Helada')],
        ['fog',       /fog|nebel|brouillard|niebla|nevoeiro|dimma|濃霧|大雾|大霧|туман|안개|awareness_?type ?= ?4\b/i, ()=>L('Dense fog','濃霧','Nebel','Туман','Niebla')],
        ['heat',      /heat|high[- ]?temp|hot weather|canicule|hitze|calor|caldo|altas temperaturas|高温|酷暑|猛暑|жар|폭염|الحرارة|awareness_?type ?= ?5\b/i, ()=>L('Heat','高温','Hitze','Жара','Calor')],
        ['cold',      /cold|low[- ]?temperature|kälte|kaelte|froid|fr[ií]o|寒潮|低温|寒波|холод|мороз|한파|awareness_?type ?= ?6\b/i, ()=>L('Cold','低温','Kälte','Холод','Frío')],
        ['dryair',    /dry ?air|low humidity|baixa umidade|trockenheit|sequedad|乾燥|干燥/i, ()=>L('Dry air','乾燥','Trockenheit','Сухость','Sequedad')],
        ['drought',   /drought|dürre|duerre|sécheresse|sequ[ií]a|seca|干旱|засух/i, ()=>L('Drought','干ばつ','Dürre','Засуха','Sequía')],
        ['lowwater',  /low water|niedrigwasser|étiage|estiaje|渇水|межен/i,  ()=>L('Low water','渇水','Niedrigwasser','Малая вода','Estiaje')],
        ['airquality',/air ?quality|smog|haze|pollution|luftqualität|calidad del aire|空气污染|霾|воздуха/i, ()=>L('Air quality','大気汚染','Luftqualität','Качество воздуха','Calidad del aire')],
        ['wind',      /wind|\bgale\b|\bstorm\b|sturm|\bvent\b|viento|vento|vendaval|vind|tuuli|強風|暴風|大風|大风|风力|ветер|шторм|강풍|رياح|awareness_?type ?= ?1\b/i, ()=>L('Strong wind','強風','Wind','Ветер','Viento')],
        ['coastal',   /coastal|high (waves|water)|storm surge|swell|waves?\b|houle|oleaje|marejada|高波|高潮|波浪|прибой|волн|풍랑|awareness_?type ?= ?7\b/i, ()=>L('Coastal','高波・高潮','Küste','Побережье','Costa')],
        ['marine',    /marine|sea area|offshore|maritime|small craft|海上|海面|море|морск/i, ()=>L('Marine','海上','See','Море','Marítimo')],
        ['thunderstorm',/thunder|t-?storm|strong convection|gewitter|orage|onweer|tormenta|trovoada|tempestade|nubifragio|åska|ukkonen|雷|强对流|強對流|гроз|뇌우|awareness_?type ?= ?3\b/i, ()=>L('Thunderstorms','雷','Gewitter','Гроза','Tormenta')],
        ['rain',      /rain|regen|regn|pluie|lluvia|chuva|pioggia|sade|precipita|大雨|暴雨|降雨|豪雨|雨|дожд|호우|أمطار|awareness_?type ?= ?10\b/i, ()=>L('Heavy rainfall','大雨','Starkregen','Сильный дождь','Lluvia intensa')]];
      const HAZI={}; HAZ.forEach((h,i)=>{ HAZI[h[0]]=h; h[3]=i; });
      /* the pattern that matches EARLIEST wins; list order breaks a tie (see the note above) */
      function hazardKey(text){ const t=String(text||''); if(!t) return '';
        let best=null, at=1e9;
        for(let i=0;i<HAZ.length;i++){ const m=HAZ[i][1].exec(t); if(!m) continue;
          if(m.index<at||(m.index===at&&best&&HAZ[i][3]<best[3])){ at=m.index; best=HAZ[i]; } }
        return best?best[0]:''; }
      const hazardName=(k)=>{ const h=HAZI[k]; return h?h[2]():''; };
      /* the reader’s word for it, or — when this table has not learned that name — the agency’s own */
      function hazardLabel(raw){ const k=hazardKey(raw); return k?hazardName(k):String(raw||'').trim(); }

      /* ══ ONE BUILDER FOR EVERY FEED ═══════════════════════════════════════════════════════════════
         Rows carry the agency's own rank (`lv`) and its own word for the hazard (`kind`). This turns
         a set of rows over one unit into the feature the map draws: the worst rank decides the
         colour and the outline, the distinct hazards decide the text, and BOTH palettes are computed
         here so switching modes is a paint swap rather than a re-fetch. */
      /* (#R277) the words the map draws, from the agency's own words — kept as their own function so
         a language change RELABELS what is already drawn instead of waiting for the next fetch. */
      const HZSEP='␟';
      /* ⚠ (#R277) A RANK IS NOT A HAZARD. MeteoAlarm publishes rows whose whole event text is
         「Yellow Warning」 — the colour and nothing else — and drawing that as the hazard puts the
         rank on the map twice and says nothing. Such a row contributes NO name, and if a unit has
         only those the label falls back to the agency's own rank word, which is what it is. */
      function hzName(w){ const t=hazardLabel(w); if(!t) return '';
        if(hazardKey(w)) return t;
        return String(t).split(/[\s,·()]+/).some(x=>x&&!HZ_DROP.test(x))?t:''; }
      function hzFields(raw,feed,lv){
        const words=String(raw||'').split(HZSEP).filter(Boolean);
        const named=[]; words.forEach(w=>{ const t=hzName(w); if(t&&named.indexOf(t)<0) named.push(t); });
        const hz=named[0]||rankName(feed,lv);
        const extra=Math.max(0,named.length-1);
        return { hz:hz+(extra?(' +'+extra):''), hzs:shortHz(hz)+(extra?('+'+extra):''), nh:named.length||1 }; }
      function unitFeature(iso,feed,geometry,unit,name,rows,at,got){
        let lv=0; const kinds=[];
        (rows||[]).forEach(r=>{ const v=+r.lv||0; if(v>lv) lv=v;
          const k=String(r.kind||'').trim(); if(k&&kinds.indexOf(k)<0) kinds.push(k); });
        if(!lv) return null;
        const norm=normOf(feed,lv);
        /* ⚠ `hzr` IS THE AGENCY'S OWN WORDING, VERBATIM. It is what the tap card prints beside the
           translated name and what `relabel()` re-reads when the reader changes language. */
        const hzr=kinds.join(HZSEP);
        const f=hzFields(hzr,feed,lv);
        return {type:'Feature',geometry,properties:{
          iso, feed, unit, name:String(name||''), lv, norm,
          colA:agCol(feed,lv), colN:PAL_NORM[norm],
          hzr, hz:f.hz, hzs:f.hzs,
          nh:f.nh, n:(rows||[]).length, at:String(at||''), got:String(got||''),
          items:JSON.stringify((rows||[]).slice(0,400))}}; }
      /* a unit with a feed and nothing in force — the JMA's own 「発表なし」 grey (Japan only, where
         the issuing units are all known; elsewhere the country wash below says the same thing) */
      function quietFeature(iso,feed,geometry,unit,name){
        return {type:'Feature',geometry,properties:{ iso, feed, unit, name:String(name||''),
          lv:0, norm:0, colA:NONE_COL, colN:NONE_COL, hzr:'', hz:'', hzs:'', nh:0, n:0, at:'', got:'', items:'[]'}}; }

      /* ══ ⚠⚠ (#R273) 「対応国も増やせ」「ソースは一国一ソース」 ══════════════════════════════════
         Fourteen national services plus the thirty-five MeteoAlarm carries, and each country appears
         exactly ONCE: Germany and Norway are EUMETNET members, but their own services publish the
         SHAPES and MeteoAlarm's rows for them arrive without geometry, so the national service wins
         and MA below is EUMETNET's remaining thirty-five.
         Added this round: Taiwan (CWA via NCDR — 157 of the aggregator's 1,029 entries are the CWA's,
         CAP 1.2 with a <polygon> per area and the CWA's own colour word) and New Zealand (MetService
         CAP RSS — measured 200 and EMPTY the minute this was written, which is a state, not a
         failure, and the panel prints it as one). */
      const FEEDS={ JPN:'jma', USA:'nws', CAN:'eccc', CHN:'cma', AUS:'bom', BRA:'inmet', HKG:'hko',
        DEU:'dwd', NOR:'metno', PHL:'pagasa', TWN:'cwa', NZL:'metservice' };
      /* ══ ⚠⚠ (#R284) A SERVICE'S AREA OF RESPONSIBILITY IS NOT ITS OWN BORDER — 「対応国も増やせ」 ══
         MEASURED against api.weather.gov this build: the NWS's active-alert feed carries UGC zones
         in **GU, MP, PW and FM** as well as the fifty states — WFO Guam issues for the Marianas,
         Palau, the Federated States of Micronesia and the Marshalls, WFO San Juan for Puerto Rico
         and the U.S. Virgin Islands, WFO Pago Pago for American Samoa. Those warnings were already
         being DRAWN; the country layer just did not know a feed existed there, so it hatched
         「未対応」 over the very islands it had a warning polygon on.
         ⚠ This is not a second source for those countries — 「ソースは一国一ソース」 holds: the NWS IS
         their national weather service, by treaty and by office. A country listed here never asks
         the WMO register (`loadSWICMeta` only wires members with no feed).
         ⚠ And it is checked rather than declared: tests/r284 asserts every ISO here is one the
         NWS's own UGC prefixes cover. */
      const ALSO={ nws:['PRI','VIR','GUM','MNP','ASM','PLW','FSM','MHL'] };
      Object.keys(ALSO).forEach(f=>{ ALSO[f].forEach(c=>{ if(!FEEDS[c]) FEEDS[c]=f; }); });
      /* ══ ⚠⚠⚠ (#R288) …AND THE REST OF IT IS LEARNED, BECAUSE A HAND-WRITTEN LIST GOES STALE ═════
         「対応国も増やせ。」 #R284 found eight of these by reading the NWS's zone codes and writing
         them down. MEASURED this round, the same defect is elsewhere and the list does not have it:
         the Finnish service issues for 「Ahvenanmaa」 — ÅLAND, which is its own country on this map —
         so a Finnish warning polygon was being drawn on an island the country layer was hatching as
         「未対応」 underneath. There is no reason to believe that is the last one, and every reason
         to believe a table of them would be wrong again within a few months (#R271: 「手書きの対象
         一覧は、その一覧に増える日に嘘になる」).
         So it is not written down. A drawn unit's own centroid is put through `countryAt`, and if it
         lands in a country that has NO feed of its own, that country is covered BY THE SERVICE THAT
         DREW IT. The evidence is the polygon, which is the same evidence #R284 used by hand.
         ⚠ THE CENTROID, not any vertex: a coarse outline that spills a few kilometres over a border
         must not claim the neighbour. ⚠ And it can only ADD — a country with its own feed is never
         re-assigned, so 「ソースは一国一ソース」 holds.
         ⚠ It is not persisted: it is re-derived from whatever is on the map right now, so a service
         that stops issuing for a territory stops covering it. */
      const LEARNED=Object.create(null);       /* iso3 → the feed whose polygon proved it */
      /* ⚠⚠ (#R290) …AND EACH UNIT IS ONLY ASKED ONCE. `countryAt` is a point-in-polygon sweep over
         every country outline, and this ran it for EVERY drawn feature on EVERY publish — up to
         3,713 features × 258 outlines, dozens of times a minute. MEASURED before: a 2,418 ms main-
         thread task while the layer settled. The answer for a given unit cannot change (the shape
         and the point are the same every time), so a unit that has been asked is remembered by its
         own identity and never asked again. Nothing is skipped: a NEW unit is still measured the
         first time it appears. */
      const _learnSeen=Object.create(null);
      function learnCoverage(list){
        let added=0;
        (list||[]).forEach(f=>{
          try{
            const q=f.properties||{}; if(!q.iso||!(q.norm>0)) return;
            const id=q.iso+''+(q.feed||'')+''+(q.unit||'')+''+(q.name||'');
            if(_learnSeen[id]) return;
            _learnSeen[id]=1;
            const c=centroidOf(f.geometry); if(!c) return;
            const at=countryAt(c[0],c[1]);
            if(!at||at===q.iso||FEEDS[at]||LEARNED[at]) return;
            LEARNED[at]=q.feed||FEEDS[q.iso]||'';
            added++;
          }catch(_){}
        });
        return added; }
      function centroidOf(g){
        if(!g) return null;
        const polys=(g.type==='Polygon')?[g.coordinates]:(g.type==='MultiPolygon'?g.coordinates:null);
        if(!polys||!polys.length) return null;
        /* the largest ring's average vertex — cheap, and inside for the convex-ish units services use */
        let best=null,bn=0;
        polys.forEach(p=>{ const r=p&&p[0]; if(r&&r.length>bn){ bn=r.length; best=r; } });
        if(!best||!best.length) return null;
        let x=0,y=0,n=0;
        for(let i=0;i<best.length;i++){ const pt=best[i]; if(!pt||!isFinite(pt[0])||!isFinite(pt[1])) continue; x+=pt[0]; y+=pt[1]; n++; }
        return n?[x/n,y/n]:null; }
      const MA={ AUT:'austria', BEL:'belgium', BIH:'bosnia-herzegovina', BGR:'bulgaria', HRV:'croatia',
        CYP:'cyprus', CZE:'czechia', DNK:'denmark', EST:'estonia', FIN:'finland', FRA:'france',
        GRC:'greece', HUN:'hungary', ISL:'iceland', IRL:'ireland', ISR:'israel',
        ITA:'italy', LVA:'latvia', LTU:'lithuania', LUX:'luxembourg', MLT:'malta', MDA:'moldova',
        MNE:'montenegro', NLD:'netherlands', MKD:'north-macedonia', POL:'poland',
        PRT:'portugal', ROU:'romania', SRB:'serbia', SVK:'slovakia', SVN:'slovenia', ESP:'spain',
        SWE:'sweden', CHE:'switzerland', GBR:'united-kingdom' };
      Object.keys(MA).forEach(k=>{ FEEDS[k]='meteoalarm'; });
      const MA_DEFAULT=['DEU','FRA','ITA','GBR'];
      const maData={};
      const maAt={};                /* iso → when THIS country's rows were last read (#R275) */
      let maAsked=MA_DEFAULT.slice();
      const MA_PER_TICK=6;          /* the relay's own per-request bound — see alerts-relay */
      /* ⚠⚠ (#R277) THREE, AND THE NUMBER IS NOT ARBITRARY — 「更新が遅すぎる。リアルタイムにと言っている」
         (3回目). #R275 turned a stuck first-load queue into a real rotation and left it at two calls
         a tick: 12 countries every 30 s over 35 is a full cycle every ~90 s. The relay's edge cache
         is SIXTY seconds, so a country asked for more often than that costs nothing upstream and
         returns the same bytes — i.e. 60 s is the floor, and 90 s was above it for no reason.
         18 a tick × two ticks = 35 countries in 60 s, exactly on the floor. Asking faster would not
         make any answer newer; it would only multiply requests EUMETNET has to serve. */
      const MA_SLOTS=3;             /* …so a full cycle is 60 s, which is the edge cache's own age */
      /* ══ ⚠⚠⚠ (#R275) 「更新が遅すぎる。リアルタイムにと言っている。」 (2回目) ═══════════════════════
         #R273 answered this by halving the tick — 60 s to 30 s — and the tick was never what was
         wrong for most of the map. MEASURED on the built page, layer on, refresh() driven 80 times
         over eight minutes: MeteoAlarm made **THREE** requests in total. It reached 35/35 countries
         and then issued NOTHING for the remaining seventy-seven refreshes. Europe's thirty-five
         services — three quarters of every country this layer covered — were frozen at whatever they
         said when the page was opened, for the whole session.

         The cause is one predicate used twice:

             loadMA( maAsked.filter(k => !maData[k]).concat(maNext()) )
                                  ^^^^^^^^^^^^^^^                      and maNext() filters the same

         Both halves mean 「countries we do not have yet」, so the moment a country arrives it is
         excluded from every future request. It was a first-load queue, and nothing ever turned it
         into a refresh cycle.

         → A ROTATION BY AGE. `maAt` is when each country was last read; the next batch is the ones
         read longest ago (never-read first, which keeps the original first-load order). Two batches
         of six a tick over 35 countries is a full cycle every ~90 s, and the panel prints the feed's
         own clock, so the number is never hidden. */
      /* ══ ⚠⚠ (#R288) 「更新が遅すぎる。リアルタイムにと言っている。」 (5回目) — WHOSE CLOCK? ══════
         The steady-state cycle has been at the transport's own floor since #R284 (the relay's edge
         cache is 60 s; asking sooner returns the same bytes), and the cold start was fixed there
         too. What was still slow is not the CYCLE, it is the reader's own country's PLACE in it:
         a rotation ordered purely by age treats the country under the cursor exactly like one on
         the other side of the world, so the reader waits a full sweep for the only country they can
         see. Ordering the SAME rotation by 「in view first, then oldest」 costs no extra request and
         makes the visible part of the map the freshest part. */
      function inViewISO(iso){ try{
        const f=(HOST.countryGeo&&HOST.countryGeo.features||[]).find(x=>String(x.id)===iso);
        return f?inView(f):false; }catch(_){ return false; } }
      function viewFirst(list){ const a=[],b=[];
        list.forEach(k=>{ (inViewISO(k)?a:b).push(k); }); return a.concat(b); }
      function maNext(n){
        const all=Object.keys(MA);
        const fresh=all.filter(k=>maData[k]);
        const cold=all.filter(k=>!maData[k]);
        cold.sort((a,b)=>(maAsked.indexOf(a)>=0?0:1)-(maAsked.indexOf(b)>=0?0:1));
        const byAge=viewFirst(fresh.sort((a,b)=>(maAt[a]||0)-(maAt[b]||0)));
        const now=Date.now();
        const take=cold.concat(byAge).filter(k=>!maPend[k]&&(!maAt[k]||now-maAt[k]>=MIN_AGE_MS))
          .slice(0,Math.max(0,n||MA_PER_TICK));
        take.forEach(k=>{ if(maAsked.indexOf(k)<0) maAsked.push(k); });
        return take; }
      /* ══ ⚠⚠⚠ (#R275) THE WMO REGISTER — 「対応国も増やせ。ソースは一国一ソース。」 ═══════════════
         Ninety-four more countries, each from its OWN national service. See the long note in
         supabase/functions/alerts-relay for why the transport is the WMO's Severe Weather
         Information Centre and why that is not GDACS coming back: SWIC republishes each member's own
         CAP, polygon and wording intact, and the panel names the MEMBER'S service as the source.
         ⚠ A country that already has a feed never asks here — one source per country. */
      /* (#R277) three calls here too — the scan says which members have anything in force at all
         (measured, 38 of 93), so a full cycle of the ones that matter is two ticks. */
      const SWIC_PER_TICK=6, SWIC_SLOTS=3;
      const swicMeta={ mid:Object.create(null), dept:Object.create(null), status:Object.create(null), at:0, asked:false };
      const swicData={};            /* iso → the member summary */
      const swicAt={};              /* iso → when it was last read */
      /* ⚠ (#R275) THE MEMBERS THIS MAP ACTUALLY READS, WHICH IS NOT «every WMO member without
         another feed». `loadSWICMeta` writes `FEEDS[c]='swic'` for exactly the members the WMO's own
         register marks CAP-Completed; `!FEEDS[c]` would have added the Development and Not-started
         ones too — measured, 152 instead of 94 — i.e. this layer would have been asking for
         countries that file nothing and counting them as covered. */
      const swicISO=()=>Object.keys(swicMeta.mid).filter(c=>FEEDS[c]==='swic');
      const swicScan={ at:0, by:Object.create(null) };   /* mid → {areas,worst,sent}, from ?swicscan */
      /* which of our members the scan says has something in force — the only ones worth a shape call */
      const swicHot=()=>swicISO().filter(c=>((swicScan.by[swicMeta.mid[c]]||{}).areas||0)>0);
      function swicNext(n){
        const hot=swicHot();
        const cold=hot.filter(k=>!swicData[k]);
        /* (#R288) — see the note on maNext: in view first, then oldest */
        const byAge=viewFirst(hot.filter(k=>swicData[k]).sort((a,b)=>(swicAt[a]||0)-(swicAt[b]||0)));
        const now=Date.now();
        return cold.concat(byAge).filter(k=>!swicPend[k]&&(!swicAt[k]||now-swicAt[k]>=MIN_AGE_MS))
          .slice(0,Math.max(0,n||SWIC_PER_TICK)); }
      /* (#R277) how many batches of each rotation are in flight, and which countries they hold */
      const maPend=Object.create(null), swicPend=Object.create(null);
      let swicMetaBusy=false;
      let bomRec=null, hkoRec=null;
      /* the loaders that are NOT awaited with the others still put shapes on the map, so the
         published collection is the awaited half plus whatever each of them has landed (#R271). */
      const SIDE={cma:[],bom:[],ma:[],phl:[],cwa:[],nzl:[],swic:[]};
      const PLACED={};            /* iso → [placed, published] — printed, never assumed (#R185) */
      const UNPL={};              /* iso → worst rank among the areas that could NOT be placed */
      /* ⚠ (#R277) `maBusy` and `swicBusy` are COUNTS of batches in flight, not booleans — see the
         note in refresh(): one slow country must not stop the rotation for a whole tick. */
      let cmaBusy=false, maBusy=0, phlBusy=false, capBusy={}, swicBusy=0;
      const relay=(qs)=>{ let b=''; try{ b=String(window.SUPABASE_URL||'').replace(/\/$/,''); }catch(_){ b=''; }
        return b?(b+'/functions/v1/alerts-relay?'+qs):''; };
      const CN_PROV={'11':'北京市','12':'天津市','13':'河北省','14':'山西省','15':'内蒙古自治区','21':'辽宁省',
        '22':'吉林省','23':'黑龙江省','31':'上海市','32':'江苏省','33':'浙江省','34':'安徽省','35':'福建省',
        '36':'江西省','37':'山东省','41':'河南省','42':'湖北省','43':'湖南省','44':'广东省','45':'广西壮族自治区',
        '46':'海南省','50':'重庆市','51':'四川省','52':'贵州省','53':'云南省','54':'西藏自治区','61':'陕西省',
        '62':'甘肃省','63':'青海省','64':'宁夏回族自治区','65':'新疆维吾尔自治区','71':'台湾省','81':'香港特别行政区','82':'澳门特别行政区'};

      /* which palette the map is painting in — kept, because it is a reading preference */
      let mode=(function(){ try{ return localStorage.getItem('im.alertPal')==='norm'?'norm':'agency'; }catch(_){ return 'agency'; } })();
      const colField=()=>(mode==='agency'?'colA':'colN');
      function ensureLayers(){ if(!_imCanDraw()) return false; try{
        /* (#R290) a fresh source is an empty one — the content signature has to go with it */
        if(!GE().layers.hasSource(SRC)){ featsSig=''; GE().layers.addSource(SRC,{type:'geojson',data:{type:'FeatureCollection',features:[]}}); }
        if(!GE().layers.has('wp-alert-fill')) GE().layers.add({id:'wp-alert-fill',type:'fill',source:SRC,
          layout:{visibility:'none'},paint:{'fill-color':['get',colField()],'fill-opacity':OPACITY_DEFAULT}});
        /* the rank is in the OUTLINE too, so it survives a fill you can see through */
        if(!GE().layers.has('wp-alert-line')) GE().layers.add({id:'wp-alert-line',type:'line',source:SRC,
          layout:{visibility:'none','line-join':'round'},
          paint:{'line-color':['case',['>',['get','norm'],0],['get',colField()],'rgba(130,134,142,0.55)'],
            'line-width':['interpolate',['linear'],['zoom'],
              2,['case',['>',['get','norm'],0],['+',0.4,['*',0.35,['get','norm']]],0.25],
              8,['case',['>',['get','norm'],0],['+',0.9,['*',0.9,['get','norm']]],0.5]],
            'line-opacity':0.95}});
        /* ⚠ (#R273) TWO LABEL LAYERS, NOT ONE EXPRESSION. `['step',['zoom'],['get','hzs'],5,['get','hz']]`
           mixes a zoom expression with a data expression in `text-field`, and MapLibre answers that
           with «this.expression.evaluate is not a function» at style time — measured, it took the
           whole page down. `minzoom`/`maxzoom` are layer properties rather than expressions, so the
           same rule is expressed where it cannot be mis-typed: the abbreviation below z5, the full
           name above it. */
        if(!GE().layers.has('wp-alert-lbls')) GE().layers.add({id:'wp-alert-lbls',type:'symbol',source:SRC,
          filter:['>',['get','norm'],0], maxzoom:5,
          layout:{visibility:'none','text-field':['get','hzs'],
            'text-font':['Noto Sans Regular'],
            'text-size':['interpolate',['linear'],['zoom'],2,9.5,5,11],
            'text-allow-overlap':false,'text-padding':9,'text-max-width':6,
            'symbol-sort-key':['-',0,['get','norm']]},
          paint:{'text-color':'#141416','text-halo-color':'rgba(255,255,255,0.95)','text-halo-width':1.6}});
        if(!GE().layers.has('wp-alert-lbl')) GE().layers.add({id:'wp-alert-lbl',type:'symbol',source:SRC,
          filter:['>',['get','norm'],0], minzoom:5,
          layout:{visibility:'none','text-field':['get','hz'],
            'text-font':['Noto Sans Regular'],
            'text-size':['interpolate',['linear'],['zoom'],5,11,9,13],
            'text-allow-overlap':false,'text-padding':4,'text-max-width':8,
            'symbol-sort-key':['-',0,['get','norm']]},
          paint:{'text-color':'#141416','text-halo-color':'rgba(255,255,255,0.95)','text-halo-width':1.6}});
        /* the hazard's name is the ANSWER, not a wash over the map — it does not follow the slider */
        try{ const OT=(window._opacityOpaqueText=window._opacityOpaqueText||{});
          OT['wp-alert-lbl']=true; OT['wp-alert-lbls']=true; }catch(_){}
        return true; }catch(_){ return false; } }
      function repaintMode(){ try{
        if(GE().layers.has('wp-alert-fill')) GE().layers.setPaint('wp-alert-fill','fill-color',['get',colField()]);
        if(GE().layers.has('wp-alert-line')) GE().layers.setPaint('wp-alert-line','line-color',
          ['case',['>',['get','norm'],0],['get',colField()],'rgba(130,134,142,0.55)']);
        if(GE().layers.has(CHORO)) GE().layers.setPaint(CHORO,'fill-color',washExpr());
      }catch(_){} }
      /* the country layer: 0 = no feed (hatched) · 1 = a feed and everything placed (grey) ·
         11–14 = a feed, and areas at that rank whose location could not be resolved (#R271) */
      /* ⚠ A COUNTRY-SCALE STATEMENT IS WEAKER THAN A UNIT-SCALE ONE, AND IT LOOKS IT. The wash means
         «somewhere in this country, at this rank, and this map could not say where»; the unit fills
         mean «here». So the wash carries its own alpha (0.62 of whatever the opacity control is
         set to) — the alpha is in the COLOUR because the opacity slider overwrites `fill-opacity`
         with one scalar for every layer it owns (#R270). */
      const _wash=(hex)=>{ const h=String(hex||'').replace('#',''); if(h.length!==6) return hex;
        return 'rgba('+parseInt(h.slice(0,2),16)+','+parseInt(h.slice(2,4),16)+','+parseInt(h.slice(4,6),16)+',0.62)'; };
      const washExpr=()=>{ const P=(mode==='agency')?PAL.cap:PAL_NORM;
        return ['match',['to-number',['feature-state','wpAlert'],-1],
          1,QUIET_COL,
          11,_wash(P[1]),12,_wash(P[2]||P[1]),13,_wash(P[3]||P[2]),14,_wash(PAL_NORM[4]),
          'rgba(0,0,0,0)']; };
      function ensureChoro(){ if(GE().layers.has(CHORO)&&GE().layers.has(HATCH)) return true;
        if(!_imCanDraw()||!GE().layers.hasSource('countries')) return false;
        /* ══ ⚠⚠⚠ (#R277) THE COUNTRY-SCALE GREY WAS ON TOP OF THE UNITS ══════════════════
           MEASURED on the built page with the layer on: `wp-alert-fill` sat at style index 34 and
           `wp-alert-choro` at 39 — the wash is added from `paintCountries()`, which lands AFTER
           `ensureLayers()`, and neither named a `before`, so 「発令されていないだけの地域は灰色に」
           was painting its 42 % grey OVER every warned unit in the same country, and the hatch its
           90 % pattern over everything in an unwired one. Which one won depended on which async
           continuation happened to land first, which is worse than either answer.
           → the wash and the hatch go UNDER the unit fills, by NAME, so the order is a fact of the
           construction rather than of the timing. Grey means 「read, nothing here」; it can never be
           the thing a reader sees where something IS in force. */
        const before=GE().layers.has('wp-alert-fill')?'wp-alert-fill'
          :(GE().layers.has('tool-poly')?'tool-poly':undefined);
        try{
          if(!GE().layers.has(HATCH)){
            ensureHatch();
            GE().layers.add({id:HATCH,type:'fill',source:'countries',layout:{visibility:'none'},
              paint:{'fill-pattern':'wp-alert-hatch-img',
                'fill-opacity':['case',['==',['to-number',['feature-state','wpAlert'],-1],0],0.9,0]}},before); }
          if(!GE().layers.has(CHORO))
            GE().layers.add({id:CHORO,type:'fill',source:'countries',layout:{visibility:'none'},
              paint:{'fill-color':washExpr(),
                'fill-opacity':['case',['>',['to-number',['feature-state','wpAlert'],-1],0],1,0]}},before);
        }catch(_){ return false; }
        return true; }

      /* ══ THE UNIT THE AGENCY ISSUES AT IS WHAT GETS COLOURED (#R271, extended #R273) ════════════
             Japan       the MUNICIPALITY — the JMA's class20, which is what 「市町村単位で塗り分けろ」
                         names and what its own warning map draws. The geometry is the Ministry of
                         Land's 国土数値情報 administrative boundaries keyed on the JIS code, and a
                         class20 code's first five digits ARE that code (measured: 1,774 of 1,805
                         match exactly; the rest are designated cities, whose wards are unioned).
                         class10 (its 153 regions) is the fallback, and the panel says which is up.
             Germany     the DWD's own WFS — warning polygons per Landkreis
             Norway      MET Norway metalerts — the alert's own polygon
             Europe      MeteoAlarm's CAP area: its polygon when the feed carries one, otherwise the
                         NUTS 2/3 region whose name the CAP itself names
             Taiwan      the CWA's own <polygon> per area, through NCDR
             China       the CMA's province (the alert id is a GB/T 2260 division code)
             Australia   the BoM's state · Hong Kong  the territory IS the issuing unit          */
      const SUBDIV={};
      function fetchJSON(u,opt){ return fetch(u,opt||{}).then(r=>{ if(!r.ok) throw new Error(String(u).slice(0,60)+' '+r.status); return r.json(); }); }
      /* ⚠⚠ (#R293) — EVERY BOUNDARY SET GOES THROUGH THE CACHE, NOT JUST geoBoundaries'.
         MEASURED on production: NUTS level 2+3 is 2.29 MB, Natural Earth's 10 m countries 4.23 MB,
         China's city polygons 1.90 MB, and all of them were re-downloaded on every single visit.
         `bndJSON` is declared further down beside the geoBoundaries loader (one owner, one note);
         these call sites are boundary sets, so they use it. A WARNING is never cached — only the
         shapes it is drawn on, which is the whole distinction the alerts layer already draws
         between 「この地図が持っている索引」 and 「その機関が今発表しているもの」. */
      function jmaClass10Geo(){ return SUBDIV.jma||(SUBDIV.jma=
        bndJSON('https://www.jma.go.jp/bosai/common/const/geojson/class10s.json').then(j=>{
          const by=Object.create(null);
          (j.features||[]).forEach(f=>{ const c=(f.properties&&f.properties.code)||''; if(c) by[String(c)]=f; });
          if(!Object.keys(by).length) throw new Error('jma class10 geometry empty');
          return by; })); }
      /* ⚠⚠ (#R273) THE JMA PUBLISHES ITS MUNICIPALITIES ONE FILE PER MUNICIPALITY. Measured: its own
         page reads `common/const/geojson/class20s/<code>.json`, i.e. ~1,800 requests, and
         `class20s.json` (the collection) is a 404. So the shapes come from the source the JMA's own
         codes are derived from — 国土交通省 国土数値情報 (行政区域), 1,897 features, one file, keyed on
         the JIS X 0402 code that is the first five digits of a class20 code. */
      const JP_MUNI_URL='https://cdn.jsdelivr.net/gh/smartnews-smri/japan-topography@main/data/municipality/geojson/s0001/N03-21_210101.json';
      function jpMuniGeo(){ return SUBDIV.jpmuni||(SUBDIV.jpmuni=bndJSON(JP_MUNI_URL).then(j=>{
        const by=Object.create(null);
        (j.features||[]).forEach(f=>{ const p=f.properties||{}; const c=String(p.N03_007||''); if(!c) return;
          const nm=(p.N03_004&&p.N03_003&&p.N03_004!==p.N03_003)?(p.N03_003+p.N03_004):(p.N03_004||p.N03_003||p.N03_001||c);
          const rec=by[c]=by[c]||{name:nm,parts:[]};
          const g=f.geometry; if(!g) return;
          if(g.type==='Polygon') rec.parts.push(g.coordinates);
          else if(g.type==='MultiPolygon') g.coordinates.forEach(x=>rec.parts.push(x)); });
        if(!Object.keys(by).length) throw new Error('jp municipality geometry empty');
        return by; })); }
      const multi=(parts)=>({type:'MultiPolygon',coordinates:parts});
      /* a class20 code → the municipality shape. A designated city files as `PP100` and its wards are
         `PP101…PP199`, so where the exact code is absent the wards are unioned — which is the city. */
      /* ⚠ IT RETURNS THE KEYS IT CONSUMED, and that is not a detail: a designated city's shape is the
         union of its wards, so the WARDS' own codes are used up by it. Without that list the wards
         would each be emitted again as a «nothing in force» grey — drawn later in the same fill
         layer, i.e. ON TOP of the warning that was just painted over them. */
      function jpShape(idx,code){ const jis=String(code).slice(0,5);
        if(idx[jis]) return {name:idx[jis].name,geom:multi(idx[jis].parts),used:[jis]};
        if(/00$/.test(jis)){ const pref=jis.slice(0,2), lo=+jis.slice(2)+1, hi=+jis.slice(2)+100;
          const parts=[], used=[]; let nm='';
          Object.keys(idx).forEach(k=>{ if(k.slice(0,2)!==pref) return; const n=+k.slice(2);
            if(n>=lo&&n<hi){ idx[k].parts.forEach(p=>parts.push(p)); used.push(k);
              if(!nm) nm=String(idx[k].name||'').replace(/[市区]?$/,''); } });
          if(parts.length) return {name:nm||jis,geom:multi(parts),used}; }
        return null; }
      const _norm=(s)=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase()
        .replace(/[\s　.,\-_'’«»"]/g,'').replace(/[()]/g,'')
        .replace(/(county|province|region|state|territory|prefecture|lan|voivodeship|megye|zupanija)$/,'');
      /* ══ ⚠⚠ (#R277) THE INDEX SIDE OF THE MATCH ═════════════════════════════════════
         This tried shorter and shorter pieces of the QUERY against the index and never the other
         way round, so 「Antwerp」 could not find 「Prov. Antwerpen」 and 「Viseu」 could not find
         「Viseu Dão Lafões」 — Belgium came out 0 of 9 and Lithuania 0 of 11, measured.
         ⚠ AND ONLY WHEN EXACTLY ONE KEY MATCHES. A stem that fits two units is not an answer; it
         is a coin toss, and a warning drawn on the wrong district is worse than one drawn nowhere.
         The keys are cached per index (they are built once and never mutated). */
      const _IDXKEYS=(typeof WeakMap==='function')?new WeakMap():null;
      const _keysOf=(idx)=>{ if(!_IDXKEYS) return Object.keys(idx);
        let k=_IDXKEYS.get(idx); if(!k){ k=Object.keys(idx); _IDXKEYS.set(idx,k); } return k; };
      /* ══ ⚠⚠⚠ (#R290) A BOUNDARY SET CAN SPELL ITS OWN UNITS WRONG ═══════════════════════════
         「警報の塗漏れが多すぎる。」 MEASURED against the live feeds this round: **Slovakia 0 of 48**.
         SHMÚ warns by okres and geoBoundaries holds all 79 of them — but its `shapeName` field has
         had every non-ASCII letter mangled: 「District of Trebi ov」 for Trebišov, 「District of
         Ronnava」 for Rožňava, 「District of Piertany」 for Piešťany, 「District of Banskk vtiavnica」
         for Banská Štiavnica. Exact matching cannot see through that, and neither can a stem.
         So the LAST rung is a bounded edit distance, and it is safe for exactly one reason: it
         answers only when **exactly one** key in the index is within the bound (the same rule the
         stem rung already follows — 「a stem that fits two units is a coin toss」), the first letter
         must agree, and the bound is 1 for a short name and 2 for one of nine characters or more.
         MEASURED with that rule: Slovakia 0 → 25 (the widened prefix list below) → **39 of 48**;
         Moldova 28 → 32; Greece 0 → 3; Belgium 1 → 2. Every recovered pair was checked by eye and
         every one is the same district. */
      function _lev(a,b,cap){
        const n=a.length, m=b.length;
        if(Math.abs(n-m)>cap) return cap+1;
        let prev=new Array(m+1), cur=new Array(m+1);
        for(let j=0;j<=m;j++) prev[j]=j;
        for(let i=1;i<=n;i++){
          cur[0]=i; let best=i;
          for(let j=1;j<=m;j++){
            const d=Math.min(prev[j]+1,cur[j-1]+1,prev[j-1]+(a.charCodeAt(i-1)===b.charCodeAt(j-1)?0:1));
            cur[j]=d; if(d<best) best=d; }
          if(best>cap) return cap+1;
          const t=prev; prev=cur; cur=t; }
        return prev[m]; }
      function lookupUnit(idx,name){ if(!idx) return null;
        const k=_norm(name); if(k&&idx[k]) return idx[k];
        const w=String(name||'').split(/\s+/).filter(Boolean);
        const tryK=(t)=>{ const q=_norm(t); return (q.length>=4&&idx[q])?idx[q]:null; };
        if(w.length>=2){
          for(let n=w.length-1;n>=1;n--){ const f=tryK(w.slice(0,n).join(' ')); if(f) return f; }
          for(let n=1;n<w.length;n++){ const f=tryK(w.slice(n).join(' ')); if(f) return f; }
        }
        if(k.length>=5){ let hit=null,n=0;
          const keys=_keysOf(idx);
          for(let i=0;i<keys.length;i++){ const q=keys[i];
            if(q.length>k.length&&q.slice(0,k.length)===k&&idx[q]!==hit){ hit=idx[q]; if(++n>1) break; } }
          if(n===1) return hit; }
        if(k.length>=5){ const cap=(k.length>=9)?2:1; let hit=null,n=0;
          const keys=_keysOf(idx);
          for(let i=0;i<keys.length;i++){ const q=keys[i];
            if(Math.abs(q.length-k.length)>cap||q.charCodeAt(0)!==k.charCodeAt(0)) continue;
            if(_lev(k,q,cap)>cap||idx[q]===hit) continue;
            hit=idx[q]; if(++n>1) break; }
          if(n===1) return hit; }
        return null; }
      /* ⚠ (#R277) …and a leading administrative word is not part of the name. Eurostat writes
         「Prov. West-Vlaanderen」 and 「Région de Bruxelles-Capitale」; the agency writes 「West
         Flanders」 and 「Brussels」. The prefix is registered as an alias so both spellings resolve. */
      /* ⚠ (#R290) …and geoBoundaries writes the WHOLE FAMILY of them in English — 「District of
         Bardejov」, 「Region of Košice」, 「Governorate of …」. MEASURED: adding those spellings took
         Slovakia from 0 to 25 of 48 before the edit-distance rung below was consulted at all. */
      const _LEAD=/^(prov\.?|provincia(?:\s+d[ie])?|province\s+(?:of|de|du)|région\s+(?:de|du|des)|regione|região|región(?:\s+de)?|comunidad(?:\s+de)?|kreis|landkreis|kanton|okres|powiat|département|departement|zupanija|županija|district\s+(?:of|de|du)|region\s+of|state\s+of|county\s+of|governorate\s+of|prefecture\s+of|municipality\s+of|city\s+of|canton\s+of|department\s+of|oblast\s+of|voivodeship\s+of|republic\s+of|autonomous\s+\S+\s+of)\s+/i;
      const _alias=(v)=>{ const out=[];
        String(v||'').split('|').forEach(part=>{ const t=part.trim(); if(!t) return;
          out.push(t);
          t.split('/').forEach(x=>{ if(x.trim()) out.push(x.trim()); });
          const noParen=t.replace(/\([^)]*\)/g,'').trim(); if(noParen&&noParen!==t) out.push(noParen);
          [t,noParen].forEach(x=>{ const st=String(x||'').replace(_LEAD,'').trim(); if(st&&st!==x) out.push(st); });
          /* a composite 「A; B; C」 areaDesc names each of its parts as well as the whole */
          if(t.indexOf(';')>=0) t.split(/\s*;\s*/).forEach(x=>{ if(x.trim()) out.push(x.trim()); }); });
        return out; };
      /* ⚠ (#R273) 「発令の色分けの境界線の解像度が低すぎる。」 — Eurostat's NUTS goes from 60 m to 20 m
         (measured: 0.68 MB + 1.60 MB, and at 60 m a French département was a seven-sided blob), and
         Japan goes from the prefecture to the municipality. Natural Earth STAYS at 50 m and that is
         a measurement rather than an oversight: the 10 m file is 24 MB and jsDelivr answers **403**
         for it (over its size limit), and the two feeds that use this index issue at the Chinese
         province and the Australian state — units where 50 m and 10 m differ by less than a pixel at
         the zoom anyone reads them at. */
      function adm1Geo(){ return SUBDIV.adm1||(SUBDIV.adm1=
        bndJSON('https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_50m_admin_1_states_provinces.geojson').then(j=>{
          const by=Object.create(null);
          (j.features||[]).forEach(f=>{ const p=f.properties||{}; const iso=String(p.adm0_a3||'').toUpperCase();
            if(!iso) return; const m=by[iso]=by[iso]||Object.create(null);
            const names=[];
            ['name','name_alt','name_local','name_en','name_zh','name_zht','name_ja','name_ru','name_es','name_fr','name_de','gn_name','woe_name','iso_3166_2','code_hasc','postal','abbrev']
              .forEach(k=>{ _alias(p[k]).forEach(x=>names.push(x)); });
            names.forEach(n=>{ const k=_norm(n); if(k&&!m[k]) m[k]=f; }); });
          return by; })); }
      /* ══ ⚠⚠⚠ (#R290) ONE FIRST-LEVEL INDEX FOR THE WHOLE PLANET ═══════════════════════════════
         「日本以外でも区分単位、発令単位ごとに色分けしろ」 — MEASURED on production before this round:
         **95 countries were still a single country-wide sheet of grey** and only 50 were drawn at
         the unit, because the only worldwide index this map held (`adm1Geo`, Natural Earth 50 m)
         covers **9 countries / 294 features** and everything else fell to geoBoundaries ONE COUNTRY
         AT A TIME, two downloads in flight, 0.3–2 MB each. That is both halves of the report at
         once: not by unit, and 「重すぎる」.
         So the world set is simplified ONCE at build time and shipped — `scripts/build-admin1.mjs`
         → `data/admin1-world.json.gz`, **4,515 units across 247 countries, 2.38 MB gzipped**, from
         Natural Earth 10 m (public domain). One request replaces the stampede.
         ⚠ IT IS A GEOMETRY SOURCE, NOT A SECOND OPINION ABOUT THE WEATHER — the same rule NUTS and
         国土数値情報 already follow. What is warned, its rank and its wording stay the service's.
         ⚠ AND IT IS THE **LAST** NAMING RUNG. Measured against the live feeds, it is better than
         nothing (Slovakia 0 → 8, Bosnia 0 → 6) and worse than the closer indexes where those exist
         (Poland: NUTS 231/234 against 153/234 here), so it is consulted only for what the rungs
         above could not answer. */
      const ADM1_URL='data/admin1-world.json.gz';
      function worldAdm1(){ return SUBDIV.world||(SUBDIV.world=(function(){
        if(typeof DecompressionStream!=='function') return Promise.reject(new Error('DecompressionStream unavailable'));
        return fetch(ADM1_URL).then(r=>{ if(!r.ok||!r.body) throw new Error('admin1 '+r.status);
          return new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).text(); })
          .then(txt=>{ const j=JSON.parse(txt);
            const geoms=Object.create(null), names=Object.create(null);
            (j.f||[]).forEach(f=>{ const iso=String(f.i||''); if(!iso||!f.g) return;
              (geoms[iso]=geoms[iso]||[]).push(f.g);
              const m=names[iso]=names[iso]||Object.create(null);
              _alias(f.n).forEach(x=>{ const k=_norm(x); if(k&&!m[k]) m[k]={geometry:f.g}; }); });
            if(!Object.keys(geoms).length) throw new Error('admin1 empty');
            return {geoms:geoms,names:names,units:(j.f||[]).length,countries:Object.keys(geoms).length}; });
      })()); }
      let WORLD=null, worldAsked=false;
      /* ⚠⚠ EVERY CALLER IS ANSWERED, NOT JUST THE FIRST. A dozen countries reach this inside one
         tick; the first starts the download and the rest arrive while it is in flight. An
         `if(worldAsked) return;` that dropped their callbacks would leave those countries marked
         「asked」 with no units and nothing to re-ask them — 「呼ばれていない1行」, the shape this
         project has paid for five times. They queue, and they are all called with the same frame.
         ⚠ …AND WITH `null` ON FAILURE, so each of them falls to its own last resort rather than
         waiting for ever on a file that is not coming. */
      const worldWaiting=[];
      function askWorldAdm1(then){
        if(WORLD){ if(then) then(WORLD); return; }
        if(then) worldWaiting.push(then);
        if(worldAsked) return;
        worldAsked=true;
        worldAdm1().then(w=>{ WORLD=w;
          worldWaiting.splice(0).forEach(f=>{ try{ f(w); }catch(_){} });
          if(on) publish(); })
          .catch(()=>{ worldAsked=false;
            worldWaiting.splice(0).forEach(f=>{ try{ f(null); }catch(_){} }); });
      }
      function nutsGeo(){ return SUBDIV.nuts||(SUBDIV.nuts=Promise.all([
          bndJSON('https://gisco-services.ec.europa.eu/distribution/v2/nuts/geojson/NUTS_RG_20M_2021_4326_LEVL_2.geojson'),
          bndJSON('https://gisco-services.ec.europa.eu/distribution/v2/nuts/geojson/NUTS_RG_20M_2021_4326_LEVL_3.geojson')])
        .then(function(r){ const by=Object.create(null);
          r.forEach(j=>(j.features||[]).forEach(f=>{ const p=f.properties||{};
            const cc=String(p.CNTR_CODE||'').toUpperCase(); if(!cc) return;
            const m=by[cc]=by[cc]||Object.create(null);
            [p.NAME_LATN,p.NUTS_NAME,p.NUTS_ID].forEach(n=>_alias(n).forEach(x=>{ const k=_norm(x); if(k&&!m[k]) m[k]=f; })); }));
          return by; })); }
      const NUTS_CC={ AUT:'AT', BEL:'BE', BGR:'BG', HRV:'HR', CYP:'CY', CZE:'CZ', DNK:'DK', EST:'EE',
        FIN:'FI', FRA:'FR', DEU:'DE', GRC:'EL', HUN:'HU', ISL:'IS', IRL:'IE', ITA:'IT', LVA:'LV',
        LTU:'LT', LUX:'LU', MLT:'MT', NLD:'NL', MKD:'MK', NOR:'NO', POL:'PL', PRT:'PT', ROU:'RO',
        SRB:'RS', SVK:'SK', SVN:'SI', ESP:'ES', SWE:'SE', CHE:'CH', GBR:'UK', MNE:'ME' };
      function capPolygon(txt){
        const pts=String(txt||'').trim().split(/\s+/).map(p=>{ const a=p.split(','); const y=+a[0], x=+a[1];
          return (isFinite(x)&&isFinite(y))?[x,y]:null; }).filter(Boolean);
        if(pts.length<4) return null;
        const first=pts[0], last=pts[pts.length-1];
        if(first[0]!==last[0]||first[1]!==last[1]) pts.push([first[0],first[1]]);
        return {type:'Polygon',coordinates:[pts]}; }

      /* ══ ⚠⚠⚠ (#R269) THE FEED THE APP READ HAD STOPPED THREE MONTHS EARLIER ═════════════════════
         `…/warning/data/warning/map.json` answers 200 and parses, and it is FROZEN. The JMA's OWN
         warning page requests `…/warning/data/r8/map.json`, which is live and is a LIST OF BULLETINS.
         ⚠ THE STATE IS THE NEWEST BULLETIN PER OFFICE, NOT THE UNION OF ALL OF THEM. ⚠ AND THE AGE
         IS CHECKED RATHER THAN ASSUMED — a file whose newest bulletin is more than three days old is
         REFUSED rather than presented as 「in force now」. */
      const JMA_R8='https://www.jma.go.jp/bosai/warning/data/r8/map.json';
      const JMA_MAX_AGE_H=72;
      let jmaAgeH=null, jmaSuperseded=0, jmaAt='';
      let jmaUnit='', jmaAreas=0, jmaPlaced=0, jmaQuiet=0;
      async function loadJMA(){
        const [list,area]=await Promise.all([
          fetch(JMA_R8,{cache:'no-store'}).then(r=>{ if(!r.ok) throw new Error('jma '+r.status); return r.json(); }),
          fetch('https://www.jma.go.jp/bosai/common/const/area.json').then(r=>r.ok?r.json():{}) ]);
        if(!Array.isArray(list)||!list.length) throw new Error('jma: not a bulletin list');
        const nameOf=(code)=>{ for(const k of ['class20s','class15s','class10s','offices','centers']){
            const t=area&&area[k]; if(t&&t[code]&&t[code].name) return t[code].name; } return code; };
        const parentOf=(code)=>{ for(const k of ['class20s','class15s','class10s']){
            const t=area&&area[k]; if(t&&t[code]) return t[code].parent||''; } return ''; };
        const regionOf=(code)=>{ let c=String(code);
          for(let i=0;i<4;i++){ if(area&&area.class10s&&area.class10s[c]) return c;
            const q=parentOf(c); if(!q||q===c) break; c=q; }
          return null; };
        const newest=Object.create(null);
        list.forEach(b=>{ const k=String(b.publishingOffice||''); const t=String(b.reportDatetime||'');
          if(!newest[k]||t>String(newest[k].reportDatetime||'')) newest[k]=b; });
        const kept=Object.values(newest);
        jmaSuperseded=list.length-kept.length;
        jmaAt=kept.reduce((m,b)=>{ const t=String(b.reportDatetime||''); return t>m?t:m; },'');
        jmaAgeH=jmaAt?((Date.now()-Date.parse(jmaAt))/3600000):null;
        seenAt('jma',jmaAt);
        if(!(jmaAgeH!=null&&jmaAgeH<JMA_MAX_AGE_H))
          throw new Error('jma: newest bulletin is '+(jmaAgeH==null?'undated':(Math.round(jmaAgeH)+' h old')));
        /* ⚠⚠ (#R273) THE BUCKET IS THE MUNICIPALITY. class20Items ARE municipalities and class10Items
           are the region above them; a class10 row is spread over the municipalities inside it so a
           regional 注意報 does not leave those towns looking quiet, and a municipality's OWN row wins
           wherever it has one. Rolling both up to the prefecture is what painted the quiet 28 % of
           Japan in #R270. */
        const kidsOf=Object.create(null);
        try{ const t20=(area&&area.class20s)||{};
          Object.keys(t20).forEach(c=>{ const r10=regionOf(c); if(!r10) return;
            (kidsOf[r10]=kidsOf[r10]||[]).push(c); }); }catch(_){}
        const byM=Object.create(null), byC10=Object.create(null), byPref=Object.create(null);
        const put=(bag,id,row,at,pref)=>{ const rec=bag[id]=bag[id]||{lv:0,items:[],reportedAt:'',pref};
          if((row.lv||0)>rec.lv) rec.lv=row.lv||0;
          if(String(at||'')>String(rec.reportedAt||'')) rec.reportedAt=at||'';
          rec.items.push(row); };
        kept.forEach(b=>{ const w=b.warning||{};
          [['class10Items','region'],['class20Items','muni']].forEach(function(pair){
            const key=pair[0], unit=pair[1];
            (w[key]||[]).forEach(a=>{
              const code=String(a.areaCode||''); const pref=parseInt(code.slice(0,2),10);
              if(!isFinite(pref)) return;
              (a.kinds||[]).forEach(k=>{
                if(!k||!k.code) return;
                if(k.status==='解除'||k.status==='発表警報・注意報はなし') return;
                const e=JMA_CODE[String(k.code)]; if(!e) return;
                const lv=e[1];
                const kind=jmaKind(k.code);
                const r10=regionOf(code)||(unit==='region'?code:null);
                const pn=nameOf(String(pref).padStart(2,'0')+'0000')||nameOf(code);
                const mk=(mcode)=>({ area:nameOf(mcode), sub:r10?nameOf(r10):nameOf(code),
                  adm:pn, unit:'muni', lv, tier:normOf('jma',lv), kind:kind?L.arr(kind):('#'+k.code), status:k.status });
                if(unit==='muni'){ put(byM,code,mk(code),b.reportDatetime,pref); }
                else if(r10&&kidsOf[r10]&&kidsOf[r10].length){ kidsOf[r10].forEach(mc=>put(byM,mc,mk(mc),b.reportDatetime,pref)); }
                else if(r10){ put(byC10,String(r10),mk(r10),b.reportDatetime,pref); }
                put(byPref,String(pref),mk(code),b.reportDatetime,pref); }); }); }); });
        /* the municipality shapes; class10 is the fallback and the panel says which one is up */
        let muni=null; try{ muni=await jpMuniGeo(); }catch(_){ muni=null; }
        const out=[];
        if(muni){
          jmaUnit='muni'; jmaAreas=Object.keys(byM).length; jmaPlaced=0; jmaQuiet=0;
          const drawn=Object.create(null); const hot=[];
          Object.keys(byM).forEach(c=>{ const rec=byM[c]; if(!rec.lv) return;
            const s=jpShape(muni,c); if(!s) return;
            jmaPlaced++; (s.used||[]).forEach(k=>{ drawn[k]=1; });
            const f=unitFeature('JPN','jma',s.geom,'muni',s.name||nameOf(c),rec.items,rec.reportedAt);
            if(f) hot.push(f); });
          /* ⚠ 「発令されていないだけの地域は灰色に。」 — every OTHER municipality is drawn in the JMA's
             own 「発表なし」 grey, which is what its map does and what makes the coloured ones mean
             something. They carry norm 0, so no label and no count.
             ⚠ THE GREY GOES IN FIRST. One GeoJSON source draws in array order, so a quiet shape
             appended after a warned one would paint over it wherever the two touch. */
          Object.keys(muni).forEach(jis=>{ if(drawn[jis]) return;
            const r=muni[jis]; jmaQuiet++;
            out.push(quietFeature('JPN','jma',multi(r.parts),'muni',r.name)); });
          hot.forEach(f=>out.push(f));
          UNPL.JPN=0; Object.keys(byM).forEach(c=>{ const r=byM[c];
            if(!jpShape(muni,c)&&(r.lv||0)>0){ const n=normOf('jma',r.lv); if(n>UNPL.JPN) UNPL.JPN=n; } });
          PLACED.JPN=[jmaPlaced,jmaAreas];
          if(jmaPlaced) return out;
          out.length=0;
        }
        let c10geo=null; try{ c10geo=await jmaClass10Geo(); }catch(_){ c10geo=null; }
        if(c10geo){
          const bag=Object.keys(byC10).length?byC10:(function(){ const b=Object.create(null);
            Object.keys(byM).forEach(c=>{ const r10=regionOf(c); if(!r10) return;
              const rec=b[r10]=b[r10]||{lv:0,items:[],reportedAt:''};
              if(byM[c].lv>rec.lv) rec.lv=byM[c].lv;
              byM[c].items.forEach(x=>rec.items.push(x)); }); return b; })();
          jmaUnit='class10'; jmaAreas=Object.keys(bag).length; jmaPlaced=0; jmaQuiet=0;
          Object.keys(bag).forEach(c=>{ const rec=bag[c]; if(!rec.lv) return;
            const f=c10geo[c]; if(!f) return; jmaPlaced++;
            const ft=unitFeature('JPN','jma',f.geometry,'class10',nameOf(c),rec.items,rec.reportedAt);
            if(ft) out.push(ft); });
          UNPL.JPN=0; Object.keys(bag).forEach(c=>{ const r=bag[c];
            if(!c10geo[c]&&(r.lv||0)>0){ const n=normOf('jma',r.lv); if(n>UNPL.JPN) UNPL.JPN=n; } });
          PLACED.JPN=[jmaPlaced,jmaAreas];
          if(jmaPlaced) return out; }
        throw new Error('jma: no issuing-unit geometry could be read');
      }

      async function loadNWS(){
        const r=await fetch('https://api.weather.gov/alerts/active?status=actual&message_type=alert',{cache:'no-store'});
        if(!r.ok) throw new Error('nws '+r.status);
        const j=await r.json();
        const out=[];
        (j.features||[]).forEach(f=>{ if(!f.geometry) return;
          const p=f.properties||{}; const lv=SEV3[p.severity]||1;
          let st=''; try{ const u=(p.geocode&&(p.geocode.UGC||p.geocode.SAME))||[]; st=String(u[0]||'').slice(0,2).toUpperCase(); }catch(_){}
          if(!/^[A-Z]{2}$/.test(st)) st=String(p.areaDesc||'').split(',').pop().trim().slice(-2).toUpperCase();
          seenAt('nws',p.sent);
          const ft=unitFeature('USA','nws',f.geometry,'zone',p.areaDesc||p.event||'',
            [{area:p.areaDesc||'',adm:st,unit:'zone',lv,tier:normOf('nws',lv),kind:p.event||'',status:p.severity||''}],p.sent||'');
          if(ft) out.push(ft); });
        PLACED.USA=[out.length,out.length]; UNPL.USA=0;
        return out; }

      /* ── Canada: Environment and Climate Change Canada, alert polygons, grouped by province ── */
      async function loadECCC(){
        const r=await fetch('https://api.weather.gc.ca/collections/weather-alerts/items?f=json&limit=500',{cache:'no-store'});
        if(!r.ok) throw new Error('eccc '+r.status);
        const j=await r.json(); const out=[];
        const en=()=>HOST.lang!=='fr';
        (j.features||[]).forEach(f=>{ if(!f.geometry) return; const p=f.properties||{};
          const lv=/warning/i.test(p.alert_type||'')?2:1;
          const kind=(en()?p.alert_name_en:p.alert_name_fr)||p.alert_name_en||p.alert_code||'';
          const areaN=(en()?p.feature_name_en:p.feature_name_fr)||p.feature_name_en||'';
          seenAt('eccc',p.publication_datetime);
          const ft=unitFeature('CAN','eccc',f.geometry,'zone',areaN||kind,
            [{area:areaN,adm:p.province||'',unit:'zone',lv,tier:normOf('eccc',lv),kind,status:(en()?p.status_en:p.status_fr)||''}],
            p.publication_datetime||'');
          if(ft) out.push(ft); });
        PLACED.CAN=[out.length,out.length]; UNPL.CAN=0;
        return out; }

      /* ══ ONE PLACE TURNS «THE AGENCY SAID THIS UNIT» INTO A SHAPE (#R271) ═══════════════════════
         A name that does not resolve is COUNTED, not dropped silently: `PLACED[iso]` is
         [placed, total] and the panel prints both (#R185). */
      async function unitFeatures(iso,feed,rows,keyOf,unitName){
        const by=new Map();
        (rows||[]).forEach(x=>{ const k=String(keyOf(x)||'').trim(); if(!k) return;
          const g=by.get(k)||{lv:0,items:[]}; by.set(k,g);
          if((x.lv||0)>g.lv) g.lv=x.lv||0; g.items.push(x); });
        PLACED[iso]=[0,by.size];
        UNPL[iso]=0;
        const worst=()=>{ let u=0; by.forEach(g=>{ const n=g.lv?normOf(feed,g.lv):0; if(n>u) u=n; }); return u; };
        if(!by.size) return [];
        let idx=null; try{ idx=(await adm1Geo())[iso]||null; }catch(_){ idx=null; }
        /* ⚠ (#R271 追記) A BOUNDARY SET THAT COULD NOT BE READ IS «NOTHING COULD BE PLACED», NOT
           «NOTHING IS IN FORCE» — a CDN hiccup must not take a country's warnings off the map. */
        if(!idx){ UNPL[iso]=worst(); return []; }
        const out=[];
        by.forEach((g,k)=>{ const f=lookupUnit(idx,k); if(!f||!f.geometry) return;
          const ft=unitFeature(iso,feed,f.geometry,unitName,k,g.items,(g.items[0]&&g.items[0].status)||'');
          if(ft) out.push(ft); });
        PLACED[iso]=[out.length,by.size];
        let u=0; by.forEach((g,k)=>{ if(!lookupUnit(idx,k)){ const n=g.lv?normOf(feed,g.lv):0; if(n>u) u=n; } });
        UNPL[iso]=u;
        return out; }

      /* ══ ⚠⚠⚠ (#R277) CHINA, AT THE UNIT THE CMA ACTUALLY ISSUES FOR ═══════════════════
         「日本以外でも区分単位、発令単位ごとに色分けしろ。」「漏れが多すぎる。」
         MEASURED, one request: the CMA list holds 1,235 warnings in force; this loader asked for
         **300** and painted them over **28 PROVINCES**. Both halves are wrong in the same way — the
         id 「36073341600000」 is a GB/T 2260 division code and 360733 is 会昌县, a county inside
         赣州市 inside 江西省. 「江西省赣州市会昌县气象台发布大风蓝色预警信号」 is one county’s wind
         warning, and it was colouring 167,000 km².

         So: every page of the list (1,000 a request, and the relay states the real total), and the
         shape is looked up BY CODE rather than by the province’s name — the district first, then the
         prefecture-city, then the province, because the code says which of the three the issuing
         office is. The boundaries are DataV.GeoAtlas (Aliyun), which publishes every prefecture-city
         in one CORS-open file keyed on the same adcode. MEASURED with this ladder: **1,000 of 1,000
         warnings placed, over 223 distinct units** — 149 at the district, 849 at the city, 2 at the
         province (those two ARE province-level bulletins: 「江西省气象台发布大风黄色预警信号」).
         ⚠ The two files are fetched ONCE, and only when this layer is on and China has something in
         force — 4.3 MB from a CDN, against a country drawn at the wrong unit. */
      /* ⚠⚠⚠ (#R277 追記) THROUGH THE RELAY, BECAUSE THE DEPLOYED ORIGIN IS BLOCKED.
         DataV.GeoAtlas is CORS-open and it is ALSO hotlink-guarded: MEASURED the same second on the
         same url, `Referer: http://127.0.0.1:4277/` answers **200 / 569 KB** and
         `Referer: https://rwmqx7dwb5-arch.github.io/IntMap/` answers **403**. The local preview
         could not see it, so China drew 223 units on 127.0.0.1 and **nothing at all** in production
         — `PLACED.CHN` came back `[0, 1217]`. The relay sends no Referer.
         ⚠ The direct url stays as the fallback for a build with no relay configured (a localhost
         preview, where it works), and the relay is preferred whenever there is one. */
      const cnUrl=(n)=>relay('cngeo='+encodeURIComponent(n))||('https://geo.datav.aliyun.com/areas_v3/bound/'+n+'.json');
      function cnGeo(){ return SUBDIV.cn||(SUBDIV.cn=Promise.all([bndJSON(cnUrl('100000_full_city')),bndJSON(cnUrl('100000_full'))])
        .then(([city,prov])=>{ const by=Object.create(null);
          (city.features||[]).forEach(f=>{ const q=f.properties||{}; const c=String(q.adcode||'');
            if(c&&f.geometry) by[c]={name:String(q.name||c),level:String(q.level||''),geometry:f.geometry}; });
          (prov.features||[]).forEach(f=>{ const q=f.properties||{}; const c=String(q.adcode||'');
            if(c&&f.geometry&&!by[c]) by[c]={name:String(q.name||c),level:'province',geometry:f.geometry}; });
          if(!Object.keys(by).length) throw new Error('cn division geometry empty');
          return by; })); }
      /* the unit an alert id names: district → prefecture-city → province, first one that exists */
      function cnUnitOf(idx,id){ const d=String(id||'').slice(0,6); if(d.length<6||!idx) return null;
        const c=d.slice(0,4)+'00', p=d.slice(0,2)+'0000';
        if(idx[d]&&idx[d].level!=='province') return {code:d,rec:idx[d]};
        if(idx[c]) return {code:c,rec:idx[c]};
        if(idx[p]) return {code:p,rec:idx[p]};
        return null; }
      const CN_PAGE=1000, CN_PAGES=2;      /* the relay states `count`; this is the bound on pages */
      let cnTotal=0;
      async function loadCMA(){
        const page=async(n)=>{
          const u=relay('u='+encodeURIComponent('https://www.nmc.cn/rest/findAlarm?pageNo='+n+'&pageSize='+CN_PAGE+'&signaltype=&signallevel=&province='));
          if(!u) throw new Error('no relay');
          const r=await fetch(u,{cache:'no-store'}); if(!r.ok) throw new Error('cma '+r.status);
          return r.json(); };
        const first=await page(1);
        const pg=(first&&first.data&&first.data.page)||{};
        cnTotal=+pg.count||0;
        let list=(pg.list||[]).slice();
        for(let n=2;n<=CN_PAGES&&list.length<cnTotal;n++){
          try{ const j=await page(n); const l=((j&&j.data&&j.data.page)||{}).list||[]; if(!l.length) break; list=list.concat(l); }
          catch(_){ break; } }
        const items=[];
        list.forEach(a=>{ const id=String(a.alertid||''); const prov=CN_PROV[id.slice(0,2)]||'';
          const title=String(a.title||'');
          /* the CMA's own four-colour signal — its word, not a judgement about the text */
          const lv=/红色/.test(title)?4:/橙色/.test(title)?3:/黄色/.test(title)?2:1;
          /* WARNING (#R269) the CMA writes 2026/08/19 17:22 - slashes, no seconds, no zone.
             `Date.parse` answers NaN for that, and it is a `split`/`join` rather than a regex literal
             because a literal for one slash spells two of them, which every comment-stripping
             instrument in this repo reads as the start of a line comment. */
          seenAt('cma',String(a.issuetime||'').split('/').join('-').replace(' ','T')+':00+08:00');
          items.push({ id, area:title.replace(/^.*?气象台发布/,'')||title, adm:prov, unit:'division', lv,
            tier:normOf('cma',lv), kind:(title.match(/发布(.+?)预警/)||[])[1]||'', status:String(a.issuetime||'') }); });
        cmaCount=items.length;
        SIDE.cma=await cmaFeatures(items);
        return { items }; }
      async function cmaFeatures(items){
        let idx=null; try{ idx=await cnGeo(); }catch(_){ idx=null; }
        /* (#R271 追記) A BOUNDARY SET THAT COULD NOT BE READ IS 「nothing could be placed」, NOT
           「nothing is in force」 — the wash then says so, in the rank of the worst unplaced warning. */
        if(!idx){ let w=0; items.forEach(x=>{ const n=normOf('cma',x.lv||1); if(n>w) w=n; });
          PLACED.CHN=[0,items.length]; UNPL.CHN=w; return []; }
        const by=new Map(); let lost=0, worst=0;
        items.forEach(x=>{ const u=cnUnitOf(idx,x.id);
          if(!u){ lost++; const n=normOf('cma',x.lv||1); if(n>worst) worst=n; return; }
          const g=by.get(u.code)||{rec:u.rec,items:[]}; by.set(u.code,g); g.items.push(x); });
        const out=[];
        by.forEach((g,code)=>{ const ft=unitFeature('CHN','cma',g.rec.geometry,
            (g.rec.level==='province'?'province':g.rec.level==='city'?'city':'district'),
            g.rec.name,g.items,(g.items[0]&&g.items[0].status)||'');
          if(ft) out.push(ft); });
        PLACED.CHN=[items.length-lost,items.length]; UNPL.CHN=worst;
        return out; }

      /* ── Australia: the Bureau of Meteorology's own warning list, at the state it files by ── */
      async function loadBOM(){
        const r=await fetch('https://api.weather.bom.gov.au/v1/warnings',{cache:'no-store'});
        if(!r.ok) throw new Error('bom '+r.status);
        const j=await r.json(); const items=[];
        (j.data||[]).forEach(a=>{ const lv=/major|emergency/i.test(String(a.warning_group_type||''))?3:2;
          seenAt('bom',a.issue_time);
          (a.states&&a.states.length?a.states:[a.state||'']).forEach(st=>{
            items.push({ area:String(a.title||a.short_title||''), sub:String(a.short_title||a.type||''),
              adm:String(st||''), unit:'state', lv, tier:normOf('bom',lv),
              kind:String(a.short_title||a.type||'').replace(/_/g,' '), status:String(a.issue_time||'') }); }); });
        SIDE.bom=await unitFeatures('AUS','bom',items,(x)=>x.adm,'state');
        return { items }; }

      /* ── Hong Kong: the Observatory's warning SUMMARY. The territory IS the issuing unit. ── */
      async function loadHKO(){
        const r=await fetch('https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=warnsum&lang=en',{cache:'no-store'});
        if(!r.ok) throw new Error('hko '+r.status);
        const j=await r.json(); const items=[]; let worst=0;
        Object.keys(j||{}).forEach(k=>{ const a=j[k]||{};
          if(/CANCEL/i.test(String(a.actionCode||''))) return;
          const key=String(a.subtype||a.type||a.code||k);
          const lv=/WRAINB|TC(8|9|10)/i.test(key)?3:2; if(lv>worst) worst=lv;
          seenAt('hko',a.issueTime||a.updateTime);
          items.push({ area:'Hong Kong', sub:String(a.name||key), adm:'Hong Kong', unit:'territory',
            lv, tier:normOf('hko',lv), kind:String(a.name||key), status:String(a.issueTime||'') }); });
        PLACED.HKG=[items.length?1:0,items.length?1:0];
        UNPL.HKG=items.length?normOf('hko',worst):0;
        return { items, worst }; }

      /* ── Brazil: INMET's active warnings, which carry their own polygon ── */
      async function loadINMET(){
        const r=await fetch('https://apiprevmet3.inmet.gov.br/avisos/ativos',{cache:'no-store'});
        if(!r.ok) throw new Error('inmet '+r.status);
        const j=await r.json(); const out=[];
        const SEV={'Grande Perigo':3,'Perigo':2,'Perigo Potencial':1};
        (j.hoje||[]).forEach(a=>{ if(a.encerrado) return;
          let g=null; try{ g=JSON.parse(a.poligono||'null'); }catch(_){}
          if(!g||!g.type) return;
          const lv=SEV[String(a.severidade||'')]||1;
          seenAt('inmet',a.updated_at||a.data_inicio);
          const states=String(a.estados||'').split(',').map(x=>x.trim()).filter(Boolean);
          const rows=(states.length?states:['']).map(st=>({ area:String(a.descricao||''), sub:String(a.severidade||''),
            adm:st, unit:'state', lv, tier:normOf('inmet',lv), kind:String(a.descricao||''), status:String(a.inicio||'') }));
          const ft=unitFeature('BRA','inmet',g,'area',String(a.descricao||''),rows,String(a.data_inicio||''));
          if(ft) out.push(ft); });
        PLACED.BRA=[out.length,out.length]; UNPL.BRA=0;
        return out; }

      /* ══ GERMANY, AT THE DISTRICT THE DWD ISSUES FOR (#R271) ════════════════════════════════════
         The DWD runs a public GeoServer and its `Warnungen_Landkreise` layer IS the warning set with
         the district polygons attached. MeteoAlarm relays the same warnings without geometry, so the
         issuing service is read directly. The Bundesland comes from the DWD too. */
      const DWD_WFS='https://maps.dwd.de/geoserver/dwd/ows?service=WFS&version=2.0.0&request=GetFeature'
        +'&typeName=dwd:Warnungen_Landkreise&outputFormat=application/json&count=2000';
      async function dwdStates(){
        const r=await fetch('https://www.dwd.de/DWD/warnungen/warnapp/json/warnings.json',{cache:'no-store'});
        if(!r.ok) throw new Error('dwd states '+r.status);
        let t=await r.text();
        const a=t.indexOf('('), b=t.lastIndexOf(')');
        if(a<0||b<a) throw new Error('dwd states: not the callback shape');
        const j=JSON.parse(t.slice(a+1,b));
        const by=Object.create(null);
        Object.keys(j.warnings||{}).forEach(k=>{ const w=(j.warnings[k]||[])[0]; if(w&&w.state) by[String(k)]=String(w.state); });
        Object.keys(j.vorabInformation||{}).forEach(k=>{ const w=(j.vorabInformation[k]||[])[0]; if(w&&w.state&&!by[String(k)]) by[String(k)]=String(w.state); });
        return by; }
      async function loadDWD(){
        const [j,st]=await Promise.all([
          fetch(DWD_WFS,{cache:'no-store'}).then(r=>{ if(!r.ok) throw new Error('dwd '+r.status); return r.json(); }),
          dwdStates().catch(()=>({}))]);
        const out=[]; let n=0;
        (j.features||[]).forEach(f=>{ if(!f.geometry) return; const p=f.properties||{}; n++;
          const lv=SEV3[String(p.SEVERITY||'')]||1;
          seenAt('dwd',p.SENT||p.EFFECTIVE);
          const areaN=String(p.NAME||p.AREADESC||'');
          const adm=st[String(p.WARNCELLID||'')]||areaN;
          const ft=unitFeature('DEU','dwd',f.geometry,'district',areaN,
            [{ area:areaN, adm, sub:String(p.EVENT||''), unit:'district', lv, tier:normOf('dwd',lv),
               kind:String(p.EVENT||''), status:String(p.HEADLINE||p.SEVERITY||'') }],String(p.SENT||''));
          if(ft) out.push(ft); });
        PLACED.DEU=[out.length,n]; UNPL.DEU=0;
        return out; }

      /* ══ NORWAY, WITH THE ALERT'S OWN POLYGON (#R271) ══════════════════════════════════════════ */
      async function loadMETNO(){
        const r=await fetch('https://api.met.no/weatherapi/metalerts/2.0/current.json',{cache:'no-store'});
        if(!r.ok) throw new Error('metno '+r.status);
        const j=await r.json(); const out=[]; let n=0;
        (j.features||[]).forEach(f=>{ if(!f.geometry) return; const p=f.properties||{}; n++;
          const lvw=String(p.awareness_level||'');
          const lv=/red|extreme/i.test(lvw)?3:/orange|severe/i.test(lvw)?2:1;
          seenAt('metno',p.eventStartingTime||p.sent||j.lastChange);
          const areaN=String(p.area||'');
          const ft=unitFeature('NOR','metno',f.geometry,'area',areaN,
            [{ area:areaN, adm:areaN, sub:String(p.eventAwarenessName||p.event||''),
               unit:'area', lv, tier:normOf('metno',lv), kind:String(p.eventAwarenessName||p.event||''),
               status:String(p.awarenessSeriousness||lvw||'') }],String(p.eventStartingTime||''));
          if(ft) out.push(ft); });
        PLACED.NOR=[out.length,n]; UNPL.NOR=0;
        return out; }

      /* ══ EUROPE, AT THE REGION THE CAP MESSAGE NAMES (#R271, ═ the ladder is #R277) ════════
         ══ ⚠⚠⚠ (#R277) 「漏れが多すぎる。」 — MEASURED: 754 OF 1,127 ═══════════════════
         Over all thirty-five MeteoAlarm countries the same minute, 373 published areas could not be
         placed and simply did not appear — Austria 86 of 116, Slovakia ALL 59, Belgium all 9,
         Croatia all 13, Bosnia all 10, Spain 64 of 157, Portugal all 18, Moldova all 42. The single
         cause is that MeteoAlarm’s CAP carries no polygon for them (the `<geocode>` is a bare
         `EMMA_ID`) and their names are the SERVICE’S own region names, which are not Eurostat NUTS
         names: 「Rijeka region」, 「Wien Brigittenau」, 「Meseta cacereña」, 「Košice okolie」.

         So the shape is looked for in FIVE places, in order of how close each is to the agency that
         issued the warning:
            1  the CAP’s own <polygon>, when the service publishes one       (the UK, the Netherlands)
            2  THE SAME SERVICE’S OWN SHAPES, from the WMO register (#R277)  (Austria, Slovakia,
               Spain, Poland, Serbia, Bosnia, Croatia, Greece, Slovenia, …)
            3  Eurostat NUTS, where the region name IS the NUTS name          (Italy, France, …)
            4  (#R284) geoBoundaries gbOpen ADM1/ADM2 — a boundary set that does not depend on
               today's weather, for a unit that is in no NUTS  (Portugal's distritos, Moldova's
               raions)
            5  the country outline, but ONLY when the area names the country  (Cyprus)
         MEASURED with rungs 1–3 and 5: 965 of 1,127 (#R277), and 2,737 of 2,923 across every feed
         when this round measured it again. Whatever is left is counted and printed per country
         (「置けなかった数は言葉で印字する」 #R273) rather than rounded away.
         ⚠ STEP 2 IS NOT A SECOND SOURCE OF WARNINGS — 「ソースは一国一ソース」. What the warning IS still
         comes from that country’s own feed; the register supplies the OUTLINE the same national
         service drew for the same named unit, and nothing else travels with it. */
      const swicGeoBy={};        /* iso → name index of that member’s own published shapes */
      const swicGeoAsked={};     /* iso → asked already (a FAILURE clears it, so it is retried) */
      const SHAPELIB={};         /* iso → how many shapes that library holds (printed, not assumed) */
      let swicGeoInflight=0;
      const SWIC_GEO_MAX=3;      /* at most three libraries in flight, so a tick cannot become a storm */
      /* ══ ⚠⚠⚠ (#R284) THE REGISTER'S SHAPES ARE WHAT IS IN FORCE **NOW**, AND THAT EMPTIES ════
         `?swicgeo=` returns the member's CURRENT CAP areas, so the library is only as complete as
         that member's weather. MEASURED this build, same minute: Austria 112 shapes, Poland 126,
         Spain 86, Slovakia 54 — and **Portugal 0, Moldova 0, Hungary 0, Italy 0, Belgium 0**,
         because those services had nothing filed with the WMO at that moment. Their MeteoAlarm
         warnings therefore had no shape at all: MEASURED, Moldova placed **0 of 42** and Portugal
         **1 of 18**, i.e. two whole countries drawing nothing while their own service was
         publishing. That is 「漏れが多すぎる」 with a cause — a library that forgets.
         → it ACCUMULATES. A shape learned once is kept for the session, a later read MERGES into it
         rather than replacing it, and a member that answered with nothing is asked again later
         instead of being written off for ever. */
      const swicGeoAt={};              /* iso → when its library was last read */
      /* ⚠ (#R288) 「警報の塗漏れが多すぎる」 — the register only ever holds what that member has in
         force RIGHT NOW (#R284), so the library grows by being asked again while the country still
         has areas it could not place. Ten minutes was the interval for BOTH cases; it is now the
         interval for a member that answered with something, and three minutes for one that is still
         short — the difference between a library that converges within a session and one that does
         not. MEASURED before this change: Spain 107 of 157 placed, Croatia 6 of 13, Moldova 32/42. */
      const SWIC_GEO_RETRY_MS=600000;  /* an answer that helped — ask again eventually */
      const SWIC_GEO_SHORT_MS=180000;  /* …still short of a full library — ask again sooner */
      function askSwicGeo(iso){
        if(swicGeoInflight>=SWIC_GEO_MAX) return;
        /* (#R288) a country that STILL cannot place everything is on the short interval, whether or
           not it has a partial library — 「持っている」 is not 「足りている」 */
        const short=!!(UNPL[iso]||((PLACED[iso]||[])[0]<(PLACED[iso]||[])[1]));
        const wait=short?SWIC_GEO_SHORT_MS:SWIC_GEO_RETRY_MS;
        if(swicGeoAsked[iso]&&Date.now()-(swicGeoAt[iso]||0)<wait) return;
        const mid=swicMeta.mid[iso]; if(!mid) return;     /* the member table has not landed yet */
        const u=relay('swicgeo='+encodeURIComponent(mid)); if(!u) return;
        swicGeoAsked[iso]=true; swicGeoAt[iso]=Date.now(); swicGeoInflight++;
        fetchJSON(u).then(j=>{ const d=(j.members||{})[mid]; if(!d||d.error) return;
            const by=swicGeoBy[iso]||Object.create(null); let n=0;
            (d.areas||[]).forEach(a=>{ if(!a.geom) return; n++;
              _alias(a.name).forEach(x=>{ const k=_norm(x); if(k&&!by[k]) by[k]={geometry:a.geom}; }); });
            if(!n) return;
            swicGeoBy[iso]=by; SHAPELIB[iso]=Object.keys(by).length;
            return maFeatures().then(()=>{ if(on) publish(); }); })
          .catch(()=>{ swicGeoAsked[iso]=false; })
          .then(()=>{ swicGeoInflight--; }); }

      /* ══ ⚠⚠⚠ (#R284) A STABLE ADMINISTRATIVE INDEX, FOR THE UNITS NOBODY ELSE NAMES ═══════════
         Some services issue at a unit that is neither their own published polygon, nor a WMO shape
         they happen to have filed today, nor a Eurostat NUTS region: IPMA warns by DISTRITO and the
         Moldovan service by RAION, and neither is in NUTS at all. So the last rung before 「the
         whole country」 is a boundary set that does not depend on the weather: geoBoundaries gbOpen,
         one country at a time, ADM1 then ADM2, fetched only for a country that still has areas it
         could not place.
         MEASURED with the real matcher against the live feeds: Moldova **32 of 42** at ADM1 (was 0),
         Portugal **17 of 18** at ADM2 (was 1), Lithuania 10 of 11, Italy 19 of 20 — and Greece and
         Belgium WORSE than what they already had, which is why this is a FALLBACK rather than a
         replacement: it is consulted only for the areas the closer rungs could not answer.
         ⚠ THE SHAPES ARE GEOMETRY, NOT A SECOND OPINION ABOUT THE WEATHER. What the warning is, its
         rank and its wording all still come from that country's own service — exactly as NUTS,
         Natural Earth and 国土数値情報 already do for the other feeds. 「ソースは一国一ソース」 is about
         the warning, and the warning is untouched.
         ⚠ `raw.githubusercontent.com` returns the Git-LFS POINTER for these files (measured: 131
         bytes beginning 「version https://git-lfs…」) and `github.com/…/raw/…` sends no CORS header
         at all. `media.githubusercontent.com/media/…` serves the real GeoJSON with
         `Access-Control-Allow-Origin: *` — measured, 595 kB in 373 ms for Portugal.
         Source & terms: geoBoundaries (gbOpen), Runfola et al. 2020 — declared in sources.html,
         js/reference-data.js and js/legal.js. */
      const GB_BASE='https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/main/releaseData/gbOpen/';
      /* ══ ⚠⚠⚠ (#R293) 「警報レイヤーが重すぎる。品質保ったまま爆速にしろ」 — MEASURED FIRST ════════
         #R290 answered the same sentence by stopping the layer from PUBLISHING the same collection
         190 times, and that worked: on production this round the steady state is 60 fps exactly
         (frame interval p50 16.7 ms, p90 17.8 ms — the same as with the layer switched off).
         What it never touched is the LOADING, and that is where the report still lives. MEASURED on
         production, 80 s from switching the layer on:

             total downloaded by this layer            46.37 MB
             …of which geoBoundaries, one country at a time   23.07 MB  (30 requests)
             …and the bundled world ADM1 file          2.27 MB   (#R290 added it to AVOID the above)
             longest single main-thread task           7,597 ms   (13 tasks over 200 ms)

         So the page freezes for seven and a half seconds while it parses boundary sets it is
         downloading TWICE OVER: #R290 shipped `data/admin1-world.json.gz` precisely so the world
         would not be fetched a country at a time, and left this path running beside it.

         Three changes, none of which drops a single warning or coarsens a single outline:
           ① ADM2 IS NOT FETCHED UNTIL ADM1 HAS BEEN TRIED AND SOMETHING IS STILL UNPLACED. ADM2 is
             the expensive half (ESP 3.59 MB, POL 2.77, LVA 2.31, HRV 2.10 — about 14 of the 23 MB),
             and it can only ever help with areas ADM1 did NOT place. Quality is preserved by
             construction: the condition for skipping it is that it had nothing left to do.
           ② THE SAME CONCURRENCY GATE the quiet-unit loader has always had, so twenty countries'
             boundary sets cannot land in one tick — which is what makes one 7.6 s task instead of
             twenty short ones.
           ③ CACHE STORAGE. Administrative boundaries are not news; the same bytes were being pulled
             on every visit. Cached under `intmap-bnd-v1`, a second session pays nothing for them.
         ⚠ THE CACHE IS KEYED ON THE URL AND HAS NO TTL ON PURPOSE: geoBoundaries publishes a NEW
         release path when a boundary set changes, so a stale entry is a stale URL nobody asks for. */
      const BND_CACHE='intmap-bnd-v1';
      async function bndCached(u){ try{ if(!self.caches) return null;
        const c=await caches.open(BND_CACHE); const r=await c.match(u); if(!r) return null;
        const j=await r.json(); return (j&&j.features)?j:null; }catch(_){ return null; } }
      async function bndStore(u,j){ try{ if(!self.caches||!j||!j.features) return;
        const c=await caches.open(BND_CACHE);
        await c.put(u,new Response(JSON.stringify(j),{headers:{'content-type':'application/json'}})); }catch(_){} }
      async function bndJSON(u){ const hit=await bndCached(u); if(hit) return hit;
        const j=await fetchJSON(u); bndStore(u,j); return j; }
      const gbAsked={}, gbBy={}, gbLvl={};
      function gbIndex(iso,lvl){
        const u=GB_BASE+iso+'/'+lvl+'/geoBoundaries-'+iso+'-'+lvl+'_simplified.geojson';
        return bndJSON(u).then(j=>{ const by=Object.create(null); let n=0;
          (j.features||[]).forEach(f=>{ const nm=(f.properties||{}).shapeName; if(!nm||!f.geometry) return; n++;
            _alias(nm).forEach(x=>{ const k=_norm(x); if(k&&!by[k]) by[k]=f; }); });
          return n?by:null; }); }
      const gbMerge=(iso,x)=>{ if(!x) return false;
        const by=gbBy[iso]||(gbBy[iso]=Object.create(null));
        Object.keys(x).forEach(k=>{ if(!by[k]) by[k]=x[k]; });
        SHAPELIB[iso+'/gb']=Object.keys(by).length; return true; };
      /* how many of this country's areas the ladder still cannot place — the ONLY reason to spend
         a second download on it (see ① above) */
      function stillMissing(iso){ const p=PLACED[iso]; return p?Math.max(0,p[1]-p[0]):1; }
      function askGB(iso){
        if(gbAsked[iso]||!/^[A-Z]{3}$/.test(String(iso||''))) return;
        if(gbInflight>=GB_MAX) return;                 /* ② — it will be asked again next publish */
        gbAsked[iso]=true; gbInflight++;
        gbIndex(iso,'ADM1').catch(()=>null)
          .then(a=>{ gbLvl[iso]=1;
            if(!gbMerge(iso,a)) return null;
            return maFeatures().then(()=>{ if(on) publish(); }); })
          .then(()=>{
            if(!stillMissing(iso)) return null;         /* ① ADM1 answered everything — stop here */
            return gbIndex(iso,'ADM2').catch(()=>null).then(b=>{ gbLvl[iso]=2;
              if(!gbMerge(iso,b)) return null;
              return maFeatures().then(()=>{ if(on) publish(); }); }); })
          .catch(()=>{ gbAsked[iso]=false; })
          .then(()=>{ gbInflight--; }); }
      /* ⚠ (#R284) HUNGARY NAMES ITS NUTS-2 REGIONS **IN ENGLISH**, and Eurostat publishes them only
         in Hungarian (`NAME_LATN` = 「Dél-Alföld」), so 「Southern Great Plain」 matched nothing at any
         rung — measured 0 of 7, i.e. the whole country blank. The NUTS index is also keyed by
         `NUTS_ID`, so the standard English name of each region is registered as an alias of its ID.
         This is a NAMING table, not a boundary: the shapes are still Eurostat's. */
      const MA_ALIAS={ HUN:{ 'Central Hungary':'HU11', 'Budapest':'HU11', 'Pest':'HU12',
        'Central Transdanubia':'HU21', 'Western Transdanubia':'HU22', 'Southern Transdanubia':'HU23',
        'Northern Hungary':'HU31', 'Northern Great Plain':'HU32', 'Southern Great Plain':'HU33' } };
      function aliasUnit(idx,iso,name){ const t=MA_ALIAS[iso]&&MA_ALIAS[iso][String(name||'').trim()];
        if(!t||!idx) return null; const f=idx[_norm(t)]; return (f&&f.geometry)?f:null; }
      /* the country outline, and ONLY when the area is the country — 「Cyprus」 is an issuing unit
         for a service that issues for the whole island, and a wash over a country that names itself
         is the truth rather than the 「発令されてない箇所が塗られている」 this layer has been reported for. */
      function wholeCountryShape(iso,name){
        const k=_norm(name); if(!k) return null;
        if(k!==_norm(countryName(iso))&&k!==_norm(iso)) return null;
        try{ const f=(HOST.countryGeo&&HOST.countryGeo.features||[]).find(x=>String(x.id)===String(iso));
          return (f&&f.geometry)||null; }catch(_){ return null; } }
      const _shapeMemo=Object.create(null);   /* (#R290) iso → {k:<indexes in hand>, m:{name→geometry}} */
      async function maFeatures(){
        const isos=Object.keys(maData).filter(k=>((maData[k]||{}).areas||[]).length);
        if(!isos.length){ SIDE.ma=[]; return; }
        let nuts=null; try{ nuts=await nutsGeo(); }catch(_){ nuts=null; }
        try{ await withCountryGeo(); }catch(_){}
        const out=[];
        isos.forEach(iso=>{ const d=maData[iso]||{}; const cc=NUTS_CC[iso];
          const idx=(nuts&&cc&&nuts[cc])||null; const lib=swicGeoBy[iso]||null;
          const gb=gbBy[iso]||null; let placed=0, missed=0;
          const wa=(WORLD&&WORLD.names[iso])||null;    /* (#R290) the shipped world ADM1 index */
          /* ⚠⚠ (#R290) THE LADDER IS WALKED ONCE PER NAME, NOT ONCE PER REBUILD. `maFeatures()`
             runs after EVERY MeteoAlarm batch and rebuilds all thirty-five countries — up to
             fourteen thousand `shapeOf` calls a time — and the rungs are not cheap: the edit-
             distance rung added this round sweeps the whole index for a name none of the exact
             rungs matched. The answer for a given (country, area name) cannot change while the
             indexes it consults are the same, so it is remembered; a NEW index arriving (the WMO
             register's shapes, geoBoundaries, the world file) invalidates that country's memo,
             which is what keeps a late-arriving boundary set from being ignored. */
          const mkey=(gb?'g':'-')+(wa?'w':'-')+(lib?'l':'-')+(idx?'n':'-');
          let memo=_shapeMemo[iso];
          if(!memo||memo.k!==mkey){ memo=_shapeMemo[iso]={k:mkey,m:Object.create(null)}; }
          const shapeOfRaw=(a)=>{
            if(a.poly){ const g=capPolygon(a.poly); if(g) return g; }
            if(lib){ const f=lookupUnit(lib,a.name); if(f&&f.geometry) return f.geometry; }
            if(idx){ const f=lookupUnit(idx,a.name); if(f&&f.geometry) return f.geometry;
              const al=aliasUnit(idx,iso,a.name); if(al) return al.geometry; }
            /* (#R284) the stable administrative index, for a unit none of the above names */
            if(gb){ const f=lookupUnit(gb,a.name); if(f&&f.geometry) return f.geometry; }
            /* (#R290) …and the world index LAST, because the closer rungs measure better where they
               exist (Poland: NUTS 231/234 against 153/234 here) and this one is better than the
               country-wide fallback below where they do not (Bosnia 0 → 6, Slovakia 0 → 8) */
            if(wa){ const f=lookupUnit(wa,a.name); if(f&&f.geometry) return f.geometry; }
            return wholeCountryShape(iso,a.name); };
          const shapeOf=(a)=>{ if(a.poly) return shapeOfRaw(a);   /* its own polygon: no index, no memo */
            const k=String(a.name||'');
            if(k in memo.m) return memo.m[k];
            return (memo.m[k]=shapeOfRaw(a)); };
          (d.areas||[]).forEach(a=>{
            const g=shapeOf(a);
            if(!g){ missed++; return; }
            placed++;
            const lv=a.tier||1;
            const ev=(a.events&&a.events.length)?a.events:[{event:'',severity:'',tier:lv}];
            const rows=ev.slice(0,40).map(e=>({ area:String(a.name||''), adm:String(a.name||''),
              sub:String(e.event||a.name||''), unit:'region', lv:(e.tier||lv), tier:normOf('meteoalarm',e.tier||lv),
              kind:String(e.event||''), status:String(e.severity||'') }));
            const ft=unitFeature(iso,'meteoalarm',g,'region',String(a.name||''),rows,String(a.sent||''),String(d.fetchedAt||''));
            if(ft) out.push(ft); });
          PLACED[iso]=[placed,(d.areas||[]).length];
          let u=0; (d.areas||[]).forEach(a=>{ if(!shapeOf(a)){ const n=normOf('meteoalarm',a.tier||1); if(n>u) u=n; } });
          UNPL[iso]=u;
          /* a country that could not place everything asks the register for that service’s shapes,
             and — (#R284) — the stable administrative index as well, because the register only
             holds what that member has in force right now */
          if(missed){ askSwicGeo(iso); askGB(iso); askWorldAdm1(); } });
        SIDE.ma=out; }

      async function loadMA(list){
        const names=list.map(k=>MA[k]).filter(Boolean); if(!names.length) return;
        const u=relay('ma='+encodeURIComponent(names.join(','))+'&lang='+encodeURIComponent(window.IntMapLang.htmlTag(HOST.lang)||'en'));
        if(!u) throw new Error('no relay');
        const r=await fetch(u,{cache:'no-store'}); if(!r.ok) throw new Error('meteoalarm '+r.status);
        const j=await r.json();
        list.forEach(k=>{ const n=MA[k]; const d=(j.countries||{})[n]; if(d){ maData[k]=d;
          maAt[k]=Date.now();                       /* (#R275) the rotation orders by this */
          seenAt('meteoalarm',d.fetchedAt); } });
        await maFeatures();
      }

      /* ══ (#R275) THE WMO REGISTER: the member table first, then the members' own warnings ══════
         The two static tables are read ONCE (they change monthly at most) and they are what decides
         which countries this map claims to cover: `status[iso] === 1` is the WMO's own 「CAP
         implementation Completed」. Everything else stays hatched, because 「発表なし」 over a country
         that files nothing would be exactly the lie the hatch exists to prevent. */
      async function loadSWICMeta(){
        if(swicMeta.at||swicMeta.asked) return;
        swicMeta.asked=true;
        const u=relay('swicmeta=1'); if(!u) throw new Error('no relay');
        const j=await fetchJSON(u,{cache:'no-store'});
        (j.members||[]).forEach(m=>{ const c=String(m.code||'').toUpperCase();
          if(!c||!m.mid) return; swicMeta.mid[c]=String(m.mid); swicMeta.dept[c]=String(m.dept||''); });
        Object.keys(j.status||{}).forEach(c=>{ swicMeta.status[String(c).toUpperCase()]=+j.status[c]||0; });
        /* a member the WMO records as Completed, and that no other feed already covers, is ours */
        Object.keys(swicMeta.mid).forEach(c=>{ if(!FEEDS[c]&&swicMeta.status[c]===1) FEEDS[c]='swic'; });
        Object.keys(swicMeta.mid).forEach(c=>{ if(FEEDS[c]==='swic'&&swicMeta.status[c]!==1) delete FEEDS[c]; });
        swicMeta.at=Date.now(); }
      /* ⚠⚠ (#R275) THE SCAN IS WHAT MAKES 「発表なし」 AN OBSERVATION. Without it, ninety-three
         members fetched six at a time is a four-minute sweep during which the map paints grey over
         countries it has not read — 「発令されていないだけの地域は灰色に」 would be a guess for most of
         them. One geometry-free call answers every member at once (see the relay), so a country the
         scan does not list is READ and quiet from the first tick, and only the ones with something
         in force cost a shape download. */
      async function loadSWICScan(){
        const u=relay('swicscan=1'); if(!u) throw new Error('no relay');
        const j=await fetchJSON(u,{cache:'no-store'});
        swicScan.by=(j&&j.members)||Object.create(null);
        swicScan.at=Date.now();
        seenAt('swic',j&&(j.newest||j.fetchedAt));
        /* every wired member the scan does NOT list has been read and has nothing in force */
        const now=Date.now();
        swicISO().forEach(c=>{ const m=swicMeta.mid[c];
          if(((swicScan.by[m]||{}).areas||0)>0) return;
          const had=swicData[c];
          if(had&&(had.areas||[]).length) delete swicData[c];
          swicData[c]={ source:'WMO Severe Weather Information Centre', mid:m,
            fetchedAt:(j&&j.fetchedAt)||new Date().toISOString(), count:0, areas:[], areaTotal:0 };
          swicAt[c]=now; });
        swicFeatures(); }
      async function loadSWIC(list){
        const isos=(list||[]).filter(c=>swicMeta.mid[c]);
        if(!isos.length) return;
        const mids=isos.map(c=>swicMeta.mid[c]);
        const u=relay('swic='+encodeURIComponent(mids.join(','))); if(!u) throw new Error('no relay');
        const j=await fetchJSON(u,{cache:'no-store'});
        isos.forEach(c=>{ const d=(j.members||{})[swicMeta.mid[c]];
          if(d&&!d.error){ swicData[c]=d; swicAt[c]=Date.now(); seenAt('swic',d.fetchedAt); } });
        swicFeatures(); }
      function swicFeatures(){
        const out=[];
        let anyMissed=false;
        Object.keys(swicData).forEach(iso=>{ const d=swicData[iso]||{}; let placed=0, u=0;
          const lib=swicGeoBy[iso]||null;
          const wa=(WORLD&&WORLD.names[iso])||null;
          (d.areas||[]).forEach(a=>{
            const lv=+a.tier||1;
            /* ⚠ (#R290) THE REGISTER'S OWN SHAPE FIRST, THEN A NAME. A member whose bulletin names
               its province but files no polygon used to be dropped entirely — the whole reason
               「塗漏れ」 is a hundred-country problem rather than a European one. The library this
               map has already built for that member is tried first (it is that service's own
               geometry), then the world administrative index. */
            if(!a.geom&&lib){ const f=lookupUnit(lib,a.name); if(f&&f.geometry) a.geom=f.geometry; }
            if(!a.geom&&wa){ const f=lookupUnit(wa,a.name); if(f&&f.geometry) a.geom=f.geometry; }
            if(!a.geom){ anyMissed=true; if(normOf('swic',lv)>u) u=normOf('swic',lv); return; }
            placed++;
            const ev=(a.events&&a.events.length)?a.events:[{event:'',severity:'',tier:lv}];
            const rows=ev.slice(0,40).map(e=>({ area:String(a.name||''), adm:String(a.name||''),
              sub:String(e.event||a.name||''), unit:'area', lv:(+e.tier||lv), tier:normOf('swic',+e.tier||lv),
              kind:String(e.event||''), status:String(e.severity||'') }));
            const ft=unitFeature(iso,'swic',a.geom,'area',String(a.name||''),rows,String(a.sent||''),String(d.fetchedAt||''));
            if(ft) out.push(ft); });
          PLACED[iso]=[placed,(d.areas||[]).length];
          UNPL[iso]=u; });
        if(anyMissed) askWorldAdm1();
        SIDE.swic=out; }

      /* ══ THE CAP-INDEX SERVICES — the Philippines, Taiwan and New Zealand ══════════════════════
         All three publish an RSS/Atom index of CAP bulletins, and the relay reads them through ONE
         summariser (see supabase/functions/alerts-relay). The areas come back with the agency's own
         polygon and, where it publishes one, its own word for the colour it assigned. */
      /* ⚠⚠ (#R273) THE CWA PUBLISHES A POLYGON FOR SOME OF ITS WARNINGS AND A TOWNSHIP NAME FOR THE
         REST. MEASURED through the relay in one minute: 278 areas, and only SIX carried a
         `<polygon>` — those are the 雷雨 river-catchment alerts. The 強風 and 降雨 warnings name a
         township instead (「屏東縣恆春鎮」), which is the level the CWA issues them at. g0v's township
         boundary set publishes its `name` in exactly that county+township form, 378 units in 629 KB
         with `Access-Control-Allow-Origin: *`, so the warning is drawn on the township it names
         rather than washed over the island. */
      /* ══ ⚠⚠ (#R277) THE BOUNDARY SET IS FROM 1982 AND TAIWAN RENAMED ITS COUNTIES IN 2010 ════
         MEASURED: 183 of the CWA's 286 areas were placed and 103 were dropped, and almost all of the
         drop was 臺南市 and 新北市 — the 2010 municipal reform turned 台南縣楠西鄉 into 臺南市楠西區
         and 台北縣板橋市 into 新北市板橋區, so an EXACT string match against a 1982 file misses every
         district of two of the six special municipalities.
         → Two keys per unit, neither of them a hand-written rename table:
             · the STEM of the whole name — 臺/台 folded and the 縣市區鄉鎮 suffixes dropped, so
               「臺南市楠西區」 and 「台南縣楠西鄉」 are the same key
             · the TOWNSHIP stem alone, and only where it is unique in the whole country — which is
               what carries a county that was RENAMED (台北縣 → 新北市): 「板橋」 is one place.
         MEASURED with both: **284 of 286**. What is left is 「高雄市那瑪夏區」 (a township renamed in
         2008) and 「台20臨105線 0k+0~43k+830」, which is a stretch of ROAD and not a place at all. */
      const _twFold=(n)=>String(n||'').trim().split('臺').join('台');
      const twKey=(n)=>_twFold(n).replace(/[縣市區鄉鎮]/g,'');
      const twTown=(n)=>{ const m=_twFold(n).match(/^(.{2,3}[縣市])(.+)$/);
        return m?m[2].replace(/[區鄉鎮市]$/,''):''; };
      function twTownGeo(){ return SUBDIV.twtown||(SUBDIV.twtown=
        fetchJSON('https://cdn.jsdelivr.net/gh/g0v/twgeojson@master/legacy/twTown1982.json').then(j=>{
          const by=Object.create(null), tn=Object.create(null), dup=Object.create(null);
          (j.features||[]).forEach(f=>{ const n=(f.properties&&f.properties.name)||''; if(!n||!f.geometry) return;
            const k=twKey(n); if(!by[k]) by[k]=f;
            const t=twTown(n); if(t){ if(tn[t]&&tn[t]!==f) dup[t]=1; else tn[t]=f; } });
          if(!Object.keys(by).length) throw new Error('tw township geometry empty');
          Object.keys(dup).forEach(t=>{ delete tn[t]; });   /* an ambiguous stem is not an answer */
          return {by,tn}; })); }
      const twFind=(idx,name)=>{ if(!idx) return null;
        const f=idx.by[twKey(name)]; if(f) return f;
        const t=twTown(name); return (t&&idx.tn[t])||null; };

      const CAPFEED={ pagasa:{q:'ph=1',iso:'PHL',unit:'province',side:'phl'},
        cwa:{q:'cap=tw',iso:'TWN',unit:'township',side:'cwa'},
        metservice:{q:'cap=nz',iso:'NZL',unit:'area',side:'nzl'} };
      const capRec={};
      async function loadCAP(feed){
        const cfg=CAPFEED[feed];
        const u=relay(cfg.q); if(!u) throw new Error('no relay');
        const r=await fetch(u,{cache:'no-store'}); if(!r.ok) throw new Error(feed+' '+r.status);
        const j=await r.json(); if(j&&j.error) throw new Error(feed+' '+j.error);
        let town=null;
        if(feed==='cwa'){ try{ town=await twTownGeo(); }catch(_){ town=null; } }
        const shapeOf=(a)=>{ if(a.poly){ const g=capPolygon(a.poly); if(g) return g; }
          if(town){ const f=twFind(town,a.name); if(f&&f.geometry) return f.geometry; }
          return null; };
        const out=[]; const areas=(j&&j.areas)||[];
        areas.forEach(a=>{ const g=shapeOf(a); if(!g) return;
          const lv=a.tier||1;
          const ev=(a.events&&a.events.length)?a.events:[{event:'',severity:'',tier:lv}];
          const rows=ev.slice(0,20).map(e=>({ area:String(a.name||''), adm:String(a.name||''),
            sub:String(e.event||''), unit:cfg.unit, lv:(e.tier||lv), tier:normOf(feed,e.tier||lv),
            kind:String(e.event||''), status:String(e.severity||a.acol||'') }));
          const ft=unitFeature(cfg.iso,feed,g,cfg.unit,String(a.name||''),rows,String(a.sent||''),String(j.fetchedAt||''));
          if(ft) out.push(ft); });
        PLACED[cfg.iso]=[out.length,areas.length];
        let u2=0; areas.forEach(a=>{ if(!shapeOf(a)){ const n=normOf(feed,a.tier||1); if(n>u2) u2=n; } });
        UNPL[cfg.iso]=u2;
        seenAt(feed,j&&j.fetchedAt);
        capRec[feed]=j;
        SIDE[cfg.side]=out;
        return j; }

      /* ══ ⚠⚠⚠ (#R273) THE COUNTRY LAYER HAS THREE STATES AND THEY LOOK DIFFERENT ═════════════════
         「まだ対応していない国は、灰色斜線で、発令されていないだけの地域は灰色に。」 and
         「『警報なし』と『データなし』を区別できない。世界地図ではこれは必須です。」
         `drawnISO` is rebuilt from the features that actually reached the source on every publish
         (#R271), so «this country's own units are on the map» stays a measurement rather than a
         hand-written table. */
      let drawnISO=Object.create(null);
      /* (#R288) …or a service whose own polygon proved it covers this country — see learnCoverage */
      const supported=(c)=>!!(FEEDS[c]||LEARNED[c]);
      /* 0 = no feed (hatched) · 1 = a feed, everything placed (grey) · 11–14 = a feed and areas at
         that normalised rank whose location could not be resolved */
      /* ⚠⚠⚠ (#R273) A COUNTRY IS DRAWN AT ITS UNITS **OR** WASHED, NEVER BOTH ═══════════════════
         #R271 made the wash mean «areas at this rank that could not be placed» and let it sit over
         a country whose other units WERE drawn. MEASURED this round with Japan at the municipality:
         1,479 of 1,490 areas placed and ELEVEN unplaced — which under that rule tinted the whole of
         Japan, on top of 1,479 shapes that already answer the question correctly. That is 「発令され
         てない箇所が紫色」 with a smaller cause, which is the report this layer has now had four
         times. So: the wash is for a country where NOTHING could be drawn, and the shortfall
         everywhere else is stated in words — the panel prints «placed / published» per country and
         the country's own legend repeats it, which is the #R185 requirement without a fill that
         contradicts the shapes underneath it. */
      /* ══ ⚠⚠ (#R275) GREY IS A STATEMENT, SO IT HAS TO HAVE BEEN CHECKED ═════════════════════
         「発令されていないだけの地域は灰色に。」 — grey means 「読んだ。何も出ていない」. Both of the
         rotating feeds have a window in which a wired country has NOT been read yet (MeteoAlarm
         sweeps 35 countries and the WMO register 93), and painting those grey would be answering
         「発表なし」 for a service nobody had asked. During that window the country is HATCHED, which
         is the appearance that means 「この地図はこの国について何も述べていない」 — and the tap says
         which of the two hatched states it is, in words. */
      function readState(c){ const f=FEEDS[c]||LEARNED[c];
        if(!f) return 'none';
        if(f==='meteoalarm') return maData[c]?(maData[c].error?'error':'ok'):(FEED_STATE.meteoalarm==='error'?'error':'loading');
        if(f==='swic') return swicData[c]?'ok':(FEED_STATE.swic==='error'?'error':'loading');
        return FEED_STATE[f]||'idle'; }
      /* ══ ⚠⚠⚠ (#R277) GREY IS 「READ, AND NOTHING IS IN FORCE」 — SO ONLY A READ EARNS IT ══════
         #R275 stopped 「発表なし」 being painted over a country that had not been READ yet (`loading`)
         and left `error` and `idle` painting it. MEASURED this round: 「cma 502」 — www.nmc.cn is
         intermittently unreachable from the edge region (two attempts, 45 s each, both timed out;
         the same url answers in 0.9 s when it is up) — and China came out GREY, i.e. the map said
         「中国に発令中の警報はありません」 while 1,235 were in force. That is #R212's defect exactly,
         one state along: a feed that could not be fetched is not a feed that answered 「nothing」.
         → only `ok` earns the grey. Everything else is HATCHED, which says nothing, and the tap
         says WHICH nothing it is, in words. */
      /* ══ ⚠⚠⚠ (#R288) THE HATCH MEANS 「この地図はここについて何も述べていない」 ═══════════
         「気象警報はまだ対応していない、もしくはデータがまだ入っていないところは灰色斜線で、
           発令されていないだけの地域は灰色に。個々の区別はちゃんとやれ。」

         #R284 read the previous round's 「対応国まで斜線で塗るのを辞めろ」 as 「a country that is
         wired but unread must draw NOTHING」 and returned −1 for it. The reader has now said which
         of the two they meant, in the same sentence as the rule: 未対応 **もしくは** データがまだ
         入っていない → hatched. The 「対応地域まで斜線で塗るのを辞めろ」 half is unchanged and still
         holds — a country whose data IS in is never hatched, whatever it turns out to say.

         So there are THREE claims and three appearances, and the fourth state does not exist:
             0    no feed at all, or a feed this map has not read yet   → hatched
             1    read, and nothing in force                            → grey (per UNIT, see below)
            11-14 read, and areas at that rank that could not be placed → the rank, washed
         「個々の区別」 lives in the tap card, which says WHICH of the two silences it is in words
         (「順番待ち」 / 「取得できませんでした」 / 「未対応」), and in the panel, which counts them.

         ── the note this replaces, kept because the measurement in it is still the reason −1 existed:
         #R275 stopped 「発表なし」 grey being painted over a country nobody had read yet, and #R277
         did the same for one whose feed had errored — both correct, and both answered with THE HATCH.
         MEASURED then: at t+45 s **22 wired countries were hatched**. What made that a defect was
         that the hatch stayed on for a whole cold sweep; #R284's own fix for THAT (a 6-slot cold
         rotation) is what makes the same appearance honest now — measured this round, the sweep is
         over in well under a minute and the hatch is transient rather than the opening state. */
      function washTier(c){
        if(!supported(c)) return 0;
        if(readState(c)!=='ok') return 0;      /* (#R288) 未対応 もしくは データがまだ入っていない */
        const u=UNPL[c]||0;
        if(u&&!drawnISO[c]) return 10+Math.min(4,u);
        /* (#R288) 2 = 「read, quiet, AND this map holds this country's own units」 — the grey is
           painted per unit below, so the country-wide sheet must not paint it a second time (two
           42 % greys over each other is a different colour, and a wrong one). 2 matches no arm of
           `washExpr`, so it lands on the transparent default.
           ⚠ (#R290) …and the question is whether the unit layer is drawing this country RIGHT NOW,
           not whether its shapes are in the cache: the quiet collection is bounded by the view, so
           a country whose units are held but off-screen must keep the country-wide sheet or it
           would be painted by nobody at all. */
        return quietSet[c]?2:1; }
      /* ══ ⚠⚠⚠ (#R288) THE COUNTRY IS NOT THE UNIT 「発令なし」 IS TRUE OF ═══════════════════
         「日本以外でも区分単位、発令単位ごとに色分けしろ」「個々の区別はちゃんとやれ」

         What was in force has been drawn at the issuing unit since #R271. What was NOT in force was
         still a single sheet of grey over the whole country — so a reader looking at a warned
         Landkreis beside a quiet one saw a coloured shape floating on an undivided wash, and could
         not tell the quiet neighbour from the rest of the country. The claim 「発令なし」 is true of
         each unit separately, so it is drawn on each unit separately.

         ⚠ THE UNITS ARE THE ONES THIS MAP ALREADY HOLDS. Every index here is one the placement
         ladder builds for its own reasons — the JMA's municipalities, Eurostat's NUTS-3, the CMA's
         divisions, the CWA's townships, Natural Earth's admin-1, geoBoundaries' ADM1 — so a unit
         drawn grey is a unit this map could have coloured, which is what makes the grey a claim
         rather than a decoration. A country whose units are NOT held keeps the country-wide grey
         (`washTier` returns 1 for it) and the panel PRINTS how many countries are in each state,
         because 「持っていない」 is a fact about this map and not about the country.
         ⚠ geoBoundaries is asked for at most two countries at a time and only for countries the
         reader is actually looking at — the全世界分 would be tens of megabytes for a picture nobody
         has scrolled to. */
      const UNITS=Object.create(null);        /* iso3 → [geometry, …] */
      /* ══ ⚠⚠⚠ (#R293) 「境界線解像度が低すぎる」 — WHICH SET A COUNTRY'S UNITS CAME FROM ═════════════
         #R290 shipped `data/admin1-world.json.gz` so every country could be drawn by unit at all:
         247 countries and 4,515 subdivisions, Douglas–Peucker at 0.01° (≈1.1 km) and four decimal
         places, in 2.38 MB. That tolerance is invisible at the zoom the file exists for — the world
         view — and it is exactly what the reader is looking at when they zoom in to a coastline.
         It cannot be fixed by making the bundle finer: the same file is what makes the overview
         affordable, and Natural Earth's own 10 m source is 40.7 MB before simplification.
         → the bundled index is a FLOOR, not an answer. Above `UNIT_HIRES_Z` a country that is on
         screen and is still being drawn from the world file is upgraded to its OWN boundary set —
         geoBoundaries ADM1, the same source the placement ladder already trusts, at that country's
         published resolution. It is fetched for what is on screen, at two countries at a time, and
         it is cached (see bndJSON), so the upgrade is paid once per country per browser. */
      const UNIT_SRC=Object.create(null);     /* iso3 → which index the shapes came from */
      const UNIT_HIRES_Z=5;                   /* below this the world file and the real one are the same picture */
      const COARSE=/^(world|ne50)$/;
      const unitAsked=Object.create(null);
      const NO_UNITS=Object.create(null);     /* iso3 → this map has looked and has none */
      let gbInflight=0;
      const GB_MAX=2;
      function unitsOf(iso){ const u=UNITS[iso]; return (u&&u.length)?u:null; }
      function setUnits(iso,geoms,src){
        const g=(geoms||[]).filter(Boolean);
        if(!g.length){ NO_UNITS[iso]=1; return false; }
        UNITS[iso]=g; UNIT_SRC[iso]=src||'?'; delete NO_UNITS[iso];
        /* (#R290) COALESCED. This fired twice per country, and the world index makes 147 countries
           land inside a second — 147 uploads of a collection that grows with each one. */
        if(on) publish();
        return true; }
      const uniq=(idx)=>{ const seen=[], out=[];
        Object.keys(idx||{}).forEach(k=>{ const f=idx[k]; if(!f||seen.indexOf(f)>=0) return; seen.push(f); out.push(f); });
        return out; };
      /* one country's own subdivisions, from whichever index this map holds for it */
      function askUnits(iso){
        if(unitAsked[iso]||UNITS[iso]) return;
        unitAsked[iso]=true;
        const fail=()=>{ unitAsked[iso]=false; };
        if(iso==='JPN'){ jpMuniGeo().then(by=>setUnits(iso,Object.keys(by).map(k=>multi(by[k].parts)),'jp')).catch(fail); return; }
        if(iso==='CHN'){ cnGeo().then(by=>setUnits(iso,Object.keys(by).filter(k=>by[k].level!=='province').map(k=>by[k].geometry),'cn')).catch(fail); return; }
        if(iso==='TWN'){ twTownGeo().then(x=>setUnits(iso,uniq(x.by).map(f=>f.geometry),'tw')).catch(fail); return; }
        const cc=NUTS_CC[iso];
        if(cc){ nutsGeo().then(by=>{ const idx=by[cc]||null;
          /* NUTS-3 only: the index also holds level 2, and drawing both stacks two greys */
          const l3=uniq(idx).filter(f=>String((f.properties||{}).NUTS_ID||'').length===5);
          setUnits(iso,(l3.length?l3:uniq(idx)).map(f=>f.geometry),'nuts'); }).catch(fail); return; }
        adm1Geo().then(by=>{ const idx=by[iso]||null; const l=uniq(idx);
          if(l.length){ setUnits(iso,l.map(f=>f.geometry),'ne50'); return; }
          askUnitsWorld(iso); }).catch(()=>{ askUnitsWorld(iso); });
      }
      /* (#R290) the shipped world index — ONE request for every country that has no closer one */
      function askUnitsWorld(iso){
        const use=(w)=>{ const g=w&&w.geoms[iso];
          if(g&&g.length){ setUnits(iso,g.slice(),'world'); return true; }
          return false; };
        if(WORLD){ if(!use(WORLD)) askUnitsGB(iso); return; }
        askWorldAdm1(w=>{ if(!use(w)&&unitAsked[iso]) askUnitsGB(iso); });
      }
      /* the last resort, and the only one that costs a download of its own */
      function askUnitsGB(iso){
        if(gbBy[iso]&&Object.keys(gbBy[iso]).length){ setUnits(iso,uniq(gbBy[iso]).map(f=>f.geometry),'gb'); return; }
        if(gbInflight>=GB_MAX){ if(COARSE.test(UNIT_SRC[iso]||'')) return; unitAsked[iso]=false; return; }
        gbInflight++;
        gbIndex(iso,'ADM1').catch(()=>null)
          .then(by=>{ if(by){ gbBy[iso]=Object.assign(gbBy[iso]||Object.create(null),by); setUnits(iso,uniq(by).map(f=>f.geometry),'gb'); }
            else if(!UNITS[iso]) NO_UNITS[iso]=1; })
          .catch(()=>{ if(!UNITS[iso]) unitAsked[iso]=false; })
          .then(()=>{ gbInflight--; });
      }
      /* (#R293) the upgrade pass — see the note on UNIT_SRC. A country only ever moves from the
         bundled world index to its own boundary set, never back, and only while it is on screen. */
      const upAsked=Object.create(null);
      function upgradeUnitsInView(){ if(!on) return;
        let z=0; try{ z=GE().camera.getZoom(); }catch(_){ return; }
        if(!(z>=UNIT_HIRES_Z)) return;
        try{ (HOST.countryGeo&&HOST.countryGeo.features||[]).forEach(f=>{ const c=String(f.id||'');
          if(!c||upAsked[c]||!UNITS[c]||!COARSE.test(UNIT_SRC[c]||'')) return;
          if(!inView(f)) return;
          if(gbInflight>=GB_MAX) return;
          upAsked[c]=1; askUnitsGB(c); }); }catch(_){} }
      /* the countries the reader can actually see, so a world of downloads is never started at once */
      function bboxOf(f){ if(f.__bb) return f.__bb;
        let w=180,e=-180,s2=90,n=-90;
        const walk=(a)=>{ if(typeof a[0]==='number'){ if(a[0]<w)w=a[0]; if(a[0]>e)e=a[0]; if(a[1]<s2)s2=a[1]; if(a[1]>n)n=a[1]; return; }
          for(let i=0;i<a.length;i++) walk(a[i]); };
        try{ walk((f.geometry||{}).coordinates||[]); }catch(_){}
        f.__bb=[w,s2,e,n]; return f.__bb; }
      function inView(f){ try{ const b=GE().camera.getBounds();
        const bb=bboxOf(f);
        return !(bb[2]<b.getWest()||bb[0]>b.getEast()||bb[3]<b.getSouth()||bb[1]>b.getNorth()); }catch(_){ return true; } }
      function askUnitsInView(){ if(!on) return;
        /* (#R290) …and only at the zoom the units are drawn at, so a world view neither downloads
           nor indexes anything it is not going to draw */
        try{ if(!(GE().camera.getZoom()>=QUIET_UNIT_Z)) return; }catch(_){}
        try{ (HOST.countryGeo&&HOST.countryGeo.features||[]).forEach(f=>{ const c=String(f.id||'');
          if(!c||!supported(c)||readState(c)!=='ok') return;
          if(UNITS[c]||unitAsked[c]||NO_UNITS[c]) return;
          if(!inView(f)) return;
          askUnits(c); }); }catch(_){}
        upgradeUnitsInView(); }
      /* ══ ⚠⚠ (#R290) THE COLLECTION IS BOUNDED BY THE VIEW, NOT BY THE CACHE ═══════════════════
         `UNITS` accumulates: once a country's subdivisions are in hand they stay. Emitting all of
         them made the grey collection grow with every pan — MEASURED at world zoom with the new
         world index: **6,101 features / 10.0 MB**, re-uploaded whenever anything about it changed.
         Nothing off-screen is visible, so nothing off-screen is published. The set is padded by a
         viewport's width so a small pan does not change it, and the signature below means a pan
         that leaves the set alone costs nothing at all. */
      /* ⚠⚠ (#R290) …AND BY THE ZOOM, BECAUSE A UNIT NOBODY CAN SEE IS NOT A DISTINCTION.
         Below `QUIET_UNIT_Z` the whole planet is on screen: a Landkreis is a fraction of a pixel,
         the dividing outline is 0.25 px wide, and the country-wide sheet and five hundred unit
         sheets are the SAME PICTURE in the same colour. Measured at world zoom, drawing it by unit
         cost 5,445 features and 6.1 MB to produce an image indistinguishable from one polygon per
         country. Zoom in and the units take over — which is the moment they mean something. */
      const QUIET_UNIT_Z=3;
      function quietISOs(){
        const out=[];
        let z=0; try{ z=GE().camera.getZoom(); }catch(_){ z=0; }
        if(!(z>=QUIET_UNIT_Z)) return out;
        let vb=null; try{ const b=GE().camera.getBounds();
          const w=b.getEast()-b.getWest(), h=b.getNorth()-b.getSouth();
          vb=[b.getWest()-w*0.5,b.getSouth()-h*0.5,b.getEast()+w*0.5,b.getNorth()+h*0.5]; }catch(_){}
        Object.keys(UNITS).forEach(iso=>{
          if(!supported(iso)||readState(iso)!=='ok'||!UNITS[iso]||!UNITS[iso].length) return;
          if(vb){ const f=countryFeature(iso); if(f){ const bb=bboxOf(f);
            if(bb[2]<vb[0]||bb[0]>vb[2]||bb[3]<vb[1]||bb[1]>vb[3]) return; } }
          out.push(iso); });
        return out.sort(); }
      let _cFeat=Object.create(null);   /* cleared when the countries source is swapped — paintCountries(true) */
      function countryFeature(iso){ if(_cFeat[iso]!==undefined) return _cFeat[iso];
        let f=null; try{ f=(HOST.countryGeo&&HOST.countryGeo.features||[]).find(x=>String(x.id)===iso)||null; }catch(_){}
        _cFeat[iso]=f; return f; }
      /* which countries the grey is CURRENTLY drawn at the unit for — `washTier` reads this, so the
         country-wide sheet covers exactly the countries the unit layer is not covering and the two
         can never both be on (or both be off) over the same ground */
      let quietSet=Object.create(null), quietList=[];
      function refreshQuietSet(){ quietList=quietISOs();
        const s=Object.create(null); quietList.forEach(c=>{ s[c]=1; }); quietSet=s; return quietList; }
      function quietFeatures(){
        const out=[];
        quietList.forEach(iso=>{
          (UNITS[iso]||[]).forEach(g=>{ if(g) out.push({type:'Feature',properties:{iso:iso},geometry:g}); }); });
        return out; }
      /* (#R290) the content of the quiet collection, as a string — see the note on publishNow */
      let quietSig='';
      function publishQuiet(force){
        /* ⚠ (#R290) the set and the LAYER move together. `washTier` returns 2 — 「the unit layer has
           this country」 — off `quietSet`, so a set that says yes while the layer is not up would
           leave those countries painted by nobody. */
        if(!_imCanDraw()||!ensureQuiet()){ quietSet=Object.create(null); quietList=[]; return false; }
        refreshQuietSet();
        const sig=quietList.map(c=>c+':'+UNITS[c].length).join(',');
        if(!force&&sig===quietSig){ applyAlertVis(); return true; }
        try{ GE().layers.setSourceData(QSRC,{type:'FeatureCollection',features:quietFeatures()}); }catch(_){ return false; }
        quietSig=sig;
        applyAlertVis();
        return true; }
      function ensureQuiet(){ if(GE().layers.has(QFILL)&&GE().layers.has(QLINE)) return true;
        if(!_imCanDraw()) return false;
        const before=GE().layers.has('wp-alert-fill')?'wp-alert-fill'
          :(GE().layers.has('tool-poly')?'tool-poly':undefined);
        try{
          /* ⚠ (#R290) a style reload drops the source, so the content signature that lets
             `publishQuiet` skip an identical upload has to be cleared with it — otherwise the
             optimisation would leave an empty source on the map after every basemap change. */
          if(!GE().layers.hasSource(QSRC)){ quietSig=''; GE().layers.addSource(QSRC,{type:'geojson',data:{type:'FeatureCollection',features:[]}}); }
          if(!GE().layers.has(QFILL)) GE().layers.add({id:QFILL,type:'fill',source:QSRC,layout:{visibility:'none'},
            paint:{'fill-color':QUIET_COL,'fill-opacity':1}},before);
          /* the DIVISION is half the answer — without an outline a hundred grey units are one grey
             country again, which is the report this is fixing */
          if(!GE().layers.has(QLINE)) GE().layers.add({id:QLINE,type:'line',source:QSRC,layout:{visibility:'none'},
            paint:{'line-color':'rgba(120,124,132,0.55)',
              'line-width':['interpolate',['linear'],['zoom'],2,0.25,6,0.5,10,0.8],'line-opacity':0.9}},before);
        }catch(_){ return false; }
        return true; }
      /* (#R290) the tier each country was last WRITTEN with — `setFeatureState` was being called
         25,713 times in 75 seconds to write the value that was already there */
      let tierWritten=Object.create(null);
      function paintCountries(force){ withCountrySource().then(()=>{ if(!on) return;
        if(!ensureChoro()) { whenDrawable(()=>{ if(on&&ensureChoro()) paintCountries(true); }); return; }
        if(force){ tierWritten=Object.create(null); _cFeat=Object.create(null); }
        try{ (HOST.countryGeo&&HOST.countryGeo.features||[]).forEach(f=>{ const c=String(f.id||''); if(!c) return;
          const t=washTier(c); if(tierWritten[c]===t) return; tierWritten[c]=t;
          GE().layers.setFeatureState({source:'countries',id:f.id},{wpAlert:t}); }); }catch(_){}
        applyAlertVis(); }); }

      /* ══ ONE PUBLISHER (#R271) — a late feed can never blank an early one ══════════════════════ */
      /* ══ ⚠⚠⚠ (#R290) 「警報レイヤーが重すぎる。品質保ったまま爆速にしろ。」 ═══════════════════════
         MEASURED on production, 75 seconds with the layer on and nothing else touched:

             wp-alert          **64** setSourceData calls · up to 3,713 features · **10.3 MB** of
                               GeoJSON re-uploaded each time
             wp-alert-quiet    **126** setSourceData calls · up to 4,811 features · **18.5 MB** each
             setFeatureState   **25,713** calls
             main thread       long tasks of 2,418 / 681 / 670 / 615 / 567 ms …

         That is 190 whole-collection uploads in 75 seconds — 2.5 per second — because `publish()`
         runs to completion on EVERY batch that lands, and there are dozens per tick (six cold
         rotation slots, MeteoAlarm, the WMO register, and each national feed). Nothing about the
         PICTURE needed any of it: the same collection was re-parsed and re-tiled over and over.

         Nothing here is dropped, sampled or simplified. Three properties are added:
           ① the publish is COALESCED (trailing, one animation frame's worth) — the data still lands
              the moment it arrives, only the announcement waits, and a burst of eight batches costs
              one upload instead of eight;
           ② the quiet-unit collection is uploaded only when its CONTENT changed (a signature of the
              countries in it and how many units each contributes) — panning and re-reads do not
              rebuild an 18 MB collection that is identical to the one already on the map;
           ③ `paintCountries` writes a feature state only where the tier actually CHANGED.
         `publishNow()` stays available for the one caller that must not wait (`toggle`). */
      let baseFeats=[];
      let pubT=0, featsSig='';
      /* a 32-bit rolling hash of the properties the style paints from — cheap (one pass, no
         allocation) and it changes whenever the picture would */
      function featSig(list){ let h=2166136261>>>0;
        const mix=(s)=>{ s=String(s==null?'':s); for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619)>>>0; } h^=124; h=Math.imul(h,16777619)>>>0; };
        for(let i=0;i<list.length;i++){ const q=list[i]&&list[i].properties; if(!q) continue;
          mix(q.iso); mix(q.feed); mix(q.name); mix(q.norm); mix(q.lv); mix(q.colA); mix(q.colN); mix(q.hz); mix(q.nh); }
        return list.length+':'+h; }
      function publish(){ if(pubT) return;
        pubT=setTimeout(()=>{ pubT=0; publishNow(); },160); }
      function publishNow(){
        clearTimeout(pubT); pubT=0;
        feats=baseFeats.concat(SIDE.cma,SIDE.bom,SIDE.ma,SIDE.phl,SIDE.cwa,SIDE.nzl,SIDE.swic);
        learnCoverage(feats);            /* (#R288) the polygons are the evidence — see learnCoverage */
        drawnISO=Object.create(null);
        feats.forEach(f=>{ const g=f.geometry; if(g&&f.properties&&f.properties.iso&&(f.properties.norm||0)>0) drawnISO[f.properties.iso]=1; });
        /* ⚠ (#R290) …and an upload that would put back the collection already on the map is not
           an upload. A feed re-read that returns the same warnings — which is most of them, most
           ticks — used to cost a full re-parse and re-tile of every drawn polygon. The signature
           is over what the STYLE reads (identity, rank, colour, wording); anything the map draws
           differently changes it. */
        const sig=featSig(feats);
        whenDrawable(()=>{ if(!ensureLayers()) return;
          if(sig!==featsSig){ featsSig=sig; GE().layers.setSourceData(SRC,{type:'FeatureCollection',features:feats}); }
          applyAlertVis(); });
        publishQuiet();                                 /* (#R288) 「発令なし」 at the unit — and it
                                                           refreshes `quietSet`, which `washTier`
                                                           reads, so it runs BEFORE the sheet */
        paintCountries();
        askUnitsInView();
        if(on&&panel.shown()) overview(); }

      /* ══ ⚠⚠ (#R277) A LANGUAGE CHANGE RELABELS WHAT IS ALREADY DRAWN ════════════════════
         「警報名は設定言語で書け。」 Every feature carries `hzr` — the issuing agency's own wording — so
         the reader's word for it is recomputed from what is already here. No feed is asked again,
         and a reader who switches language does not watch the map empty and refill. */
      function relabel(){
        try{ feats.forEach(f=>{ const q=f&&f.properties; if(!q||!q.hzr) return;
          const x=hzFields(q.hzr,q.feed,q.lv); q.hz=x.hz; q.hzs=x.hzs; q.nh=x.nh; }); }catch(_){}
        whenDrawable(()=>{ if(ensureLayers()){ featsSig=featSig(feats); GE().layers.setSourceData(SRC,{type:'FeatureCollection',features:feats}); } });
        if(on&&panel.shown()) overview(); }
      try{ window.addEventListener('intmap-lang',()=>{ if(on) relabel(); }); }catch(_){}

      /* ⚠ 「更新が遅すぎる。リアルタイムにと言っている。」 — thirty seconds while the layer is on and the
         tab is visible, and an immediate refresh when the tab comes back. The relay's edge cache is
         what stops that becoming thirty upstream requests a minute. */
      const TICK_MS=30000;
      const FEED_KEYS=['jma','nws','eccc','meteoalarm','swic','cma','bom','inmet','hko','dwd','metno','pagasa','cwa','metservice'];
      /* ══ ⚠⚠ (#R277) THE ROTATION REFILLS ITS OWN SLOTS ═════════════════════════════
         Starting batches only ON the tick caps the cycle at `MA_CALLS` countries-worth every 30 s
         AND wastes any slot that frees early — MEASURED, the oldest country still swung to 94 s.
         A finished batch pumps the next one, so the three slots stay busy and the cycle is bounded
         by throughput rather than by the clock.
         ⚠ AND THERE IS A FLOOR, or a fast round would spin. `MIN_AGE_MS` is just under the relay's
         own sixty seconds of edge cache: a country read more recently than that would answer with
         the SAME BYTES, so asking is pure cost — for us and for the service. 「リアルタイム」 here
         means 「as new as the transport can be」, and the transport says sixty seconds. */
      const MIN_AGE_MS=45000;
      /* ══ ⚠⚠ (#R284) A COLD ROTATION SPRINTS; A WARM ONE CRUISES ═══════════════════════════════
         「更新が遅すぎる。リアルタイムにと言っている。」 (4回目). The steady-state cycle is already at the
         floor the transport allows — the relay's edge cache is sixty seconds, so asking a country
         more often than that returns the same bytes (MEASURED this round: the oldest MeteoAlarm
         country swings between 38 and 78 s, i.e. one cache lifetime).
         What was NOT at the floor is the FIRST minute. MEASURED at t+45 s after switching the layer
         on: 30 of 35 MeteoAlarm countries and 78 of 93 WMO members had been read — so a quarter of
         the world was still blank at the moment the reader was looking at it. Three slots is the
         right sustained rate and the wrong opening one: a country nobody has read yet is not
         costing the cache anything, because there is nothing cached.
         → while any wired country is still unread the rotation runs at `COLD_CALLS` slots and drops
         back to `MA_CALLS` the moment it has been round once. The burst is bounded by the number of
         countries, so it happens once per session and never repeats. */
      const COLD_CALLS=6;
      const maCold=()=>Object.keys(MA).some(k=>!maData[k]);
      const swicCold=()=>swicHot().some(k=>!swicData[k]);
      function pumpMA(){ if(!on) return;
        const MA_CALLS=maCold()?COLD_CALLS:MA_SLOTS;
        while(maBusy<MA_CALLS){
          const b=maNext(MA_PER_TICK); if(!b.length) break;
          maBusy++; b.forEach(k=>{ maPend[k]=1; });
          loadMA(b).then(()=>{ feedOK('meteoalarm'); if(on) publish(); })
            .catch(e=>{ FEED_STATE.meteoalarm='error'; console.warn('MeteoAlarm',e); if(on&&panel.shown()) overview(); })
            .then(()=>{ maBusy--; b.forEach(k=>{ delete maPend[k]; }); pumpMA(); }); } }
      function pumpSWIC(){ if(!on||!swicMeta.at) return;
        const SWIC_CALLS=swicCold()?COLD_CALLS:SWIC_SLOTS;
        while(swicBusy<SWIC_CALLS){
          const b=swicNext(SWIC_PER_TICK); if(!b.length) break;
          swicBusy++; b.forEach(k=>{ swicPend[k]=1; });
          loadSWIC(b).then(()=>{ feedOK('swic'); if(on){ publish(); paintCountries(); } })
            .catch(e=>{ FEED_STATE.swic='error'; console.warn('WMO SWIC',e); if(on&&panel.shown()) overview(); })
            .then(()=>{ swicBusy--; b.forEach(k=>{ delete swicPend[k]; }); pumpSWIC(); }); } }

      async function refresh(){ if(busy) return; busy=true;
        FEED_KEYS.forEach(k=>{ if(FEED_STATE[k]!=='ok') FEED_STATE[k]='loading'; });
        try{ const parts=await Promise.all([
            loadJMA().then(v=>{ feedOK('jma'); return v; }).catch(e=>{ FEED_STATE.jma='error'; console.warn('JMA warnings',e); return []; }),
            loadNWS().then(v=>{ feedOK('nws'); return v; }).catch(e=>{ FEED_STATE.nws='error'; console.warn('NWS warnings',e); return []; }),
            loadECCC().then(v=>{ feedOK('eccc'); return v; }).catch(e=>{ FEED_STATE.eccc='error'; console.warn('ECCC warnings',e); return []; }),
            loadINMET().then(v=>{ feedOK('inmet'); return v; }).catch(e=>{ FEED_STATE.inmet='error'; console.warn('INMET warnings',e); return []; }),
            loadDWD().then(v=>{ feedOK('dwd'); return v; }).catch(e=>{ FEED_STATE.dwd='error'; console.warn('DWD warnings',e); return []; }),
            loadMETNO().then(v=>{ feedOK('metno'); return v; }).catch(e=>{ FEED_STATE.metno='error'; console.warn('MET Norway warnings',e); return []; })]);
          baseFeats=parts.flat(); lastAt=Date.now();
          /* ⚠ (#R266) THE RELAY-BACKED FEEDS ARE NOT AWAITED WITH THE OTHERS — a `Promise.all` that
             includes them means Japan's and America's warnings, which arrived in milliseconds, sit
             unrendered until Europe answers. ⚠ (#R269) …and each gets its own in-flight guard,
             because `busy` only covers the awaited half. */
          if(!cmaBusy){ cmaBusy=true;
            loadCMA().then(v=>{ feedOK('cma'); cmaRec=v; if(on) publish(); })
              .catch(e=>{ FEED_STATE.cma='error'; console.warn('CMA warnings',e); if(on&&panel.shown()) overview(); })
              .then(()=>{ cmaBusy=false; }); }
          loadBOM().then(v=>{ feedOK('bom'); bomRec=v; if(on) publish(); })
            .catch(e=>{ FEED_STATE.bom='error'; console.warn('BoM warnings',e); if(on&&panel.shown()) overview(); });
          ['pagasa','cwa','metservice'].forEach(k=>{ if(capBusy[k]) return; capBusy[k]=true;
            loadCAP(k).then(()=>{ feedOK(k); if(on) publish(); })
              .catch(e=>{ FEED_STATE[k]='error'; console.warn(k+' warnings',e); if(on&&panel.shown()) overview(); })
              .then(()=>{ capBusy[k]=false; }); });
          loadHKO().then(v=>{ feedOK('hko'); hkoRec=v; if(on){ paintCountries(); if(panel.shown()) overview(); } })
            .catch(e=>{ FEED_STATE.hko='error'; console.warn('HKO warnings',e); if(on&&panel.shown()) overview(); });
          /* ⚠ (#R275) A ROTATION, NOT A FIRST-LOAD QUEUE — see the note on `maNext`. Each call takes
             the relay's own maximum and the batches are disjoint, so a tick advances the cycle by
             `MA_CALLS × MA_PER_TICK` countries and never asks for the same one twice. */
          /* ══ ⚠⚠⚠ (#R277) ONE SLOW BATCH USED TO STOP THE WHOLE ROTATION FOR A TICK ════════
             `maBusy` covered a `Promise.all` of every batch, so a tick advanced only when the SLOWEST
             of them finished — and a MeteoAlarm country is up to a ten-megabyte upstream fetch.
             MEASURED with three batches under that flag: the oldest country reached 108 s, WORSE
             than the two-batch version it replaced, because a batch that overran 30 s made the next
             tick a no-op entirely.
             → the flag becomes a COUNT of batches in flight, each independent: a slow one occupies
             one of the three slots and the other two keep the cycle turning. `maPend` is what stops
             two slots claiming the same country — `maAt` is only written when a read COMPLETES,
             because it is the age the panel prints and an optimistic write would hide a stall. */
          pumpMA();
          /* (#R275) the WMO register — the member table once, then the members' own warnings, on the
             same age-ordered rotation MeteoAlarm uses (#R277: and the same independent slots) */
          if(!swicMetaBusy){ swicMetaBusy=true;
            Promise.resolve(loadSWICMeta()).then(()=>loadSWICScan())
              .then(()=>{ feedOK('swic'); if(on){ publish(); paintCountries(); } })
              .catch(e=>{ FEED_STATE.swic='error'; console.warn('WMO SWIC',e); if(on&&panel.shown()) overview(); })
              .then(()=>{ swicMetaBusy=false; }); }
          pumpSWIC();
          publish();
        } finally { busy=false; } }

      /* ── the keys ─────────────────────────────────────────────────────────────────────────────── */
      /* ⚠ (#R270) A KEY TAKES ITS COLOURS FROM THE THING IT IS A KEY TO — the palette travels with
         the names, so a swatch and its label can never be about different scales. */
      /* ⚠⚠ (#R293) 「日本の特別警報の凡例だけ、図形の形が違うのを辞めろ」 — AND IT WAS THE BORDER ══════
         Every row here is the same 12 px rounded square, so nothing here CHOSE a different shape.
         What differed was the only thing that can: the JMA's 特別警報 is #0c000c, darker than the
         panel it sits on, so `1px solid rgba(128,128,128,0.35)` was the brightest thing in the chip
         and the eye read a RING where the yellow/red/magenta chips beside it read as filled squares.
         → the outline is drawn INSIDE, as a hairline inset shadow that is dark on pale chips and
         pale on dark ones, so every swatch is a filled square whatever colour it carries. */
      function keyRows(pairs){ return '<div style="margin-top:6px;display:flex;flex-direction:column;gap:3px;">'
        +pairs.map(p=>'<div style="display:flex;align-items:center;gap:7px;font-size:11.5px;">'
          +'<span style="'+(p[0]===HATCH_KEY?hatchSwatch(12):swatchStyle(p[0],12))+'"></span>'+esc(p[1])+'</div>').join('')+'</div>'; }
      const keyHead=(t)=>'<div style="margin-top:9px;font-size:10.5px;font-weight:600;color:var(--text-muted);">'+esc(t)+'</div>';
      const HATCH_ROW=()=>[HATCH_KEY,L('Not covered, or not read yet (diagonal hatching)','未対応・未取得（斜線）','Nicht abgedeckt / noch nicht gelesen (Schraffur)','Нет данных / ещё не прочитано (штриховка)','Sin cobertura o aún no leído (rayado)')];
      /* the sentinel is an OBJECT, compared by identity: no string can collide with it and no
         encoding can mangle it (a control-character sentinel put a real NUL byte in this file) */
      const HATCH_KEY={hatch:true};
      /* ══ ⚠⚠ (#R293) 「日本の特別警報の凡例だけ、図形の形が違うのを辞めろ」 — MEASURED, TWO CAUSES ═════
         ① THE DELIMITER WAS INSIDE THE CHIP'S OWN CONTRAST. Every swatch carried
         `border:1px solid rgba(128,128,128,0.35)`, and a border's contrast is against the FILL.
         The JMA's 特別警報 is #0c000c — the only chip in any of these keys that is DARKER than that
         grey — so alone among them it was ringed in something brighter than itself and read as an
         OUTLINED square beside four filled ones. → the delimiter moves OUTSIDE, as a spread shadow,
         where its contrast is against the PANEL and therefore the same for every row.
         ② AND THE PANEL HELD THREE SIZES. MEASURED on production, one open legend: the country
         list drew 10 px chips, `keyRows` 12 px and the hatched swatch in `legendFor` 14 px — three
         sizes for one idea. → `SW_PX`, once. (The source-status dots stay circles: a status light
         is not a colour key, and they are consistent with each other.) */
      const SW_PX=12;
      const swatchStyle=(col,px)=>'width:'+(px||SW_PX)+'px;height:'+(px||SW_PX)+'px;border-radius:3px;flex:none;'
        +'background:'+col+';box-shadow:0 0 0 1px rgba(128,128,128,0.32);';
      const agencyKey=(feed)=>keyRows(Object.keys(palOf(feed)).map(Number).sort((a,b)=>b-a)
        .map(lv=>[palOf(feed)[lv],rankName(feed,lv)]).concat([[NONE_COL,L('Nothing in force','発表なし','Nichts in Kraft','Ничего не действует','Nada vigente')]]));
      const normKey=()=>keyRows([4,3,2,1].map(n=>[PAL_NORM[n],NORM_NAME(n)])
        .concat([[NONE_COL,L('Nothing in force','発表なし','Nichts in Kraft','Ничего не действует','Nada vigente')],HATCH_ROW()]));
      /* ⚠⚠ (#R273) 「気象庁の階級をまるで世界共通かのように、日本を選択していなくても表示するのを辞めろ。」
         The world panel shows an agency's OWN ranks only in that agency's own legend, which is what a
         tap opens. In agency mode the world key can only say what is true of every agency at once —
         that the ladder runs from an advisory to an emergency — and it says so in those words. */
      function worldKey(){
        if(mode==='norm') return keyHead(L('IntMap normalised scale — IntMap’s own conversion','IntMap 換算（IntMap 独自の換算）','IntMap-Skala (eigene Umrechnung)','Шкала IntMap (собственный пересчёт)','Escala IntMap (conversión propia)'))
          +normKey()
          +'<div style="margin-top:4px;font-size:9.5px;color:var(--text-muted);line-height:1.5;">'
          +esc(L('Each agency’s ranks are mapped onto these four by IntMap. Two countries at the same step do NOT necessarily face the same danger — the warning systems themselves differ. Tap a country for its own agency’s scale.',
                 '各機関の階級を IntMap が独自にこの4段階へ換算したものです。同じ段でも国どうしの危険度が等しいという意味ではありません——制度そのものが違います。国をタップすると、その機関自身の階級が出ます。',
                 'Von IntMap umgerechnet — gleiche Stufe heißt nicht gleiche Gefahr.',
                 'Пересчёт IntMap — одинаковая ступень не означает одинаковую опасность.',
                 'Conversión propia de IntMap — el mismo nivel no implica el mismo peligro.'))+'</div>';
        return keyHead(L('Each agency’s own published scale','各機関が公表している配色','Skala der jeweiligen Behörde','Собственная шкала службы','Escala propia de cada agencia'))
          +keyRows([[PAL.cap[1],L('lower rank','下位の階級','niedrigere Stufe','низкая ступень','rango menor')],
                    [PAL.cap[3],L('higher rank','上位の階級','höhere Stufe','высокая ступень','rango mayor')],
                    [NONE_COL,L('Nothing in force','発表なし','Nichts in Kraft','Ничего не действует','Nada vigente')],HATCH_ROW()])
          +'<div style="margin-top:4px;font-size:9.5px;color:var(--text-muted);line-height:1.5;">'
          +esc(L('Colours are the issuing agency’s own — Japan’s are the JMA’s yellow / red / magenta / black, China’s the CMA’s four signal colours, and the rest the CAP awareness ladder. Tap a country for that agency’s exact scale.',
                 '色はその機関自身の配色です——日本は気象庁の 黄／赤／紫／黒、中国は中国気象局の四色予警信号、その他は CAP の階級です。国をタップすると、その機関の正確な階級が出ます。',
                 'Farben sind die der jeweiligen Behörde. Land antippen für deren genaue Skala.',
                 'Цвета — самой службы. Нажмите страну для её точной шкалы.',
                 'Los colores son los de cada agencia. Toque un país para su escala exacta.'))+'</div>'; }

      /* ── the per-country legend a tap opens ────────────────────────────────────────────────────── */
      const AGENCY_NAME={ jma:'気象庁 JMA', nws:'US National Weather Service', eccc:'ECCC', cma:'中国气象局 CMA',
        bom:'Bureau of Meteorology', inmet:'INMET', hko:'香港天文台 HKO', dwd:'Deutscher Wetterdienst',
        metno:'MET Norway', pagasa:'PAGASA', cwa:'中央氣象署 CWA', metservice:'MetService',
        meteoalarm:'MeteoAlarm (EUMETNET)', swic:'WMO Severe Weather Information Centre' };
      /* ⚠ (#R275) FOR A WMO-REGISTER COUNTRY THE AUTHOR IS THE MEMBER'S OWN SERVICE, and that is the
         name the reader is given — 「各国の気象台やその他それに相当する機関の情報をもとにしろ」. The WMO
         is named too, as the route the file travelled, not as the author. */
      function agencyFor(feed,iso3){
        if(feed==='swic'){ const d=swicMeta.dept[iso3]||'';
          return d?(d+' · '+L('via WMO SWIC','WMO SWIC 経由','über WMO SWIC','через WMO SWIC','vía WMO SWIC')):AGENCY_NAME.swic; }
        return AGENCY_NAME[feed]||feed; }
      function legendFor(iso3){
        const feed=FEEDS[iso3]||LEARNED[iso3];   /* (#R288) — a learned territory names the service that covers it */
        const mine=feats.filter(f=>f.properties.iso===iso3&&(f.properties.norm||0)>0);
        let h='<div style="font-weight:700;font-size:13px;">'+esc(countryName(iso3))+'</div>';
        if(feed&&readState(iso3)!=='ok'){
          /* ⚠ (#R288) THE HATCHED swatch, because a hatched country is what the map draws again —
             「もしくはデータがまだ入っていないところは灰色斜線で」. The swatch matches the map; the
             SENTENCE is where 「個々の区別」 lives, and it says which of the two silences this is
             (`readState` may be `error` as well as `loading`). */
          h+='<div style="margin-top:6px;display:flex;align-items:center;gap:7px;font-size:11.5px;">'
            +'<span style="'+hatchSwatch()+'"></span>'
            +esc(readState(iso3)==='error'?L('Could not be read','取得できませんでした','Nicht lesbar','Не удалось прочитать','No se pudo leer')
                                          :L('Not read yet','未取得','Noch nicht gelesen','Ещё не прочитано','Aún no leído'))+'</div>'
            +'<div style="margin-top:6px;color:var(--text-main);font-size:11.5px;line-height:1.6;">'
            +esc(agencyFor(feed,iso3))+' — '
            +(readState(iso3)==='error'
              ? L('this service could not be reached just now, so the map is not saying anything about this country. It is retried on every update.',
                  'この機関にいま到達できませんでした。そのため、この地図はこの国について何も述べていません。更新のたびに再試行します。',
                  'Dieser Dienst war gerade nicht erreichbar — die Karte sagt nichts über dieses Land. Wird bei jeder Aktualisierung erneut versucht.',
                  'Служба сейчас недоступна — карта ничего не утверждает об этой стране. Повтор при каждом обновлении.',
                  'No se pudo contactar con este servicio — el mapa no afirma nada sobre este país. Se reintenta en cada actualización.')
              : L('this service is in the update cycle and has not been read yet, so the map is not saying anything about this country until it has.',
                  'この機関は更新の順番待ちで、まだ取得できていません。取得できるまで、この地図はこの国について何も述べません。',
                  'Dieser Dienst ist noch nicht gelesen — bis dahin sagt die Karte nichts über dieses Land.',
                  'Эта служба ещё не прочитана — до тех пор карта ничего не утверждает об этой стране.',
                  'Este servicio aún no se ha leído — hasta entonces el mapa no afirma nada sobre este país.'))+'</div>';
          return h; }
        if(!feed){
          /* ⚠ 「『警報なし』と『データなし』を区別できない」 — this is the second of those two, and it
             is a sentence rather than an empty map. */
          h+='<div style="margin-top:6px;display:flex;align-items:center;gap:7px;font-size:11.5px;">'
            +'<span style="'+hatchSwatch()+'"></span>'
            +esc(L('No feed connected','未対応（フィード未接続）','Kein Feed angebunden','Фид не подключён','Sin feed conectado'))+'</div>'
            +'<div style="margin-top:6px;color:var(--text-main);font-size:11.5px;line-height:1.6;">'
            +L('IntMap has no connection to this country’s warning service, so it is saying nothing about it — not that nothing is in force. Follow the national authority.',
               'この国の警報機関のフィードに接続していないため、この地図はこの国について何も述べていません——「発表されていない」という意味ではありません。各国の公的機関の発表に従ってください。',
               'Kein Anschluss an den Warndienst dieses Landes — die Karte sagt hier nichts aus.',
               'Нет подключения к службе предупреждений этой страны — карта здесь ничего не утверждает.',
               'Sin conexión al servicio de avisos de este país — el mapa no afirma nada aquí.')+'</div>';
          return h; }
        const st=FEED_STATE[feed];
        const stLine=(s)=>s==='loading'?('<div style="margin-top:8px;color:var(--text-muted);">'+L('Reading the feed…','フィードを取得中…','Feed wird gelesen…','Загрузка фида…','Leyendo el feed…')+'</div>')
          :s==='error'?('<div style="margin-top:8px;color:#ff9f0a;">⚠ '+L('This feed could not be fetched just now, so nothing below is a statement about what is in force.','このフィードを取得できませんでした。したがって以下は「発表状況」を示すものではありません。','Feed nicht abrufbar — die Anzeige sagt nichts über geltende Warnungen.','Не удалось получить фид — показанное ничего не говорит о действующих предупреждениях.','No se pudo obtener el feed — lo mostrado no indica qué avisos están vigentes.')+'</div>')
          :'';
        h+='<div style="margin-top:3px;font-size:11px;color:var(--text-muted);">'+esc(agencyFor(feed,iso3))
          +' · '+esc(unitWord(feed))+'</div>';
        h+=keyHead(L('This agency’s own ranks','この機関自身の階級','Stufen dieser Behörde','Ступени этой службы','Rangos de esta agencia'))+agencyKey(feed);
        h+=stLine(readState(iso3));
        const rows=[];
        if(feed==='cma'&&cmaRec) cmaRec.items.forEach(x=>rows.push(x));
        else if(feed==='bom'&&bomRec) bomRec.items.forEach(x=>rows.push(x));
        else if(feed==='hko'&&hkoRec) hkoRec.items.forEach(x=>rows.push(x));
        else mine.forEach(f=>{ let it=[]; try{ it=JSON.parse(f.properties.items||'[]'); }catch(_){}
          it.forEach(x=>rows.push(Object.assign({pref:f.properties.name},x))); });
        if(rows.length) h+=grouped(rows);
        else if(st==='ok') h+='<div style="margin-top:8px;color:var(--text-muted);">'
          +L('Nothing in force right now — this country’s service was read and had nothing to publish.','現在、発表中のものはありません（この国の機関を取得できており、発表がありません）。','Derzeit nichts in Kraft.','Сейчас ничего не действует.','Nada vigente ahora.')+'</div>';
        const p=PLACED[iso3];
        if(p&&p[1]>p[0]) h+='<div style="margin-top:6px;font-size:10px;color:var(--text-muted);">'
          +esc(L('Areas published but not locatable on this map: ','発表されたが地図上に位置を特定できなかった区域: ','Gebiete ohne auflösbare Geometrie: ','Зоны без найденной геометрии: ','Zonas sin geometría resuelta: '))+(p[1]-p[0])+'/'+p[1]+'</div>';
        return h; }
      function unitWord(feed){
        return feed==='jma'?(jmaUnit==='muni'?L('by municipality','市町村単位','nach Gemeinde','по муниципалитетам','por municipio'):L('by issuing region','発令区域単位','nach Warnregion','по районам выпуска','por región de emisión'))
          :feed==='dwd'?L('by district','郡単位','nach Landkreis','по округам','por distrito')
          :feed==='cma'?L('by province','省単位','nach Provinz','по провинциям','por provincia')
          :feed==='bom'?L('by state','州単位','nach Bundesstaat','по штатам','por estado')
          :feed==='hko'?L('territory-wide','全域が発令単位','gesamtes Gebiet','вся территория','todo el territorio')
          :feed==='meteoalarm'?L('by region','地域単位','nach Region','по регионам','por región')
          :feed==='swic'?L('by the area the service names','発表機関が指定した区域単位','nach dem Gebiet der Behörde','по зонам самой службы','por la zona que indica el servicio')
          :L('by warning area','警報区域単位','nach Warngebiet','по зонам','por zona de aviso'); }

      /* ══ ⚠ THE TAP IS A LIST OF ADMINISTRATIVE UNITS, NOT A LIST OF ROWS (#R266/#R268) ══════════
         One line per unit, the worst rank as its colour, the distinct hazards named once each, and
         the individual rows folded behind the browser's own <details>. Nothing is dropped — it is
         nested — and every cap that bites is printed (#R185). */
      let _wpaCss=false;
      function ensureGroupedCss(){ if(_wpaCss||typeof document==='undefined') return; _wpaCss=true;
        const st=document.createElement('style'); st.id='wpa-grouped-css';
        st.textContent='.wpa{margin-top:8px;max-height:300px;overflow:auto;}'
          +'.wpa-g{padding:4px 0;border-bottom:1px solid var(--glass-border,rgba(128,128,128,0.16));}'
          +'.wpa-h{display:flex;gap:6px;align-items:center;font-size:12px;}'
          +'.wpa-h b{flex:1;}.wpa-n{opacity:.7;font-size:11px;}'
          +'.wpa-sw{width:10px;height:10px;border-radius:3px;flex:none;}'
          +'.wpa-k{font-size:10.5px;margin:2px 0 0 16px;}'
          +'.wpa-s{padding:2px 0;}'
          +'.wpa-sh{display:flex;gap:6px;align-items:baseline;font-size:11.5px;}'
          +'.wpa-sh span:last-child{flex:1;}'
          +'.wpa-sw2{width:8px;height:8px;border-radius:2px;flex:none;position:relative;top:1px;}'
          +'.wpa-sk{font-size:10.5px;margin:1px 0 0 14px;}'
          +'.wpa-a{font-size:11px;color:var(--text-muted);margin:1px 0 0 14px;line-height:1.5;}'
          +'.wpa-c{display:inline-flex;align-items:center;gap:3px;margin-right:6px;white-space:nowrap;}'
          +'.wpa-c i{width:7px;height:7px;border-radius:2px;display:inline-block;font-style:normal;}'
          +'.wpa-more{font-size:10.5px;opacity:.7;padding-top:2px;}';
        (document.head||document.documentElement).appendChild(st); }
      const rowCol=(x)=>(mode==='agency'?agCol(x.feed||'cap',x.lv||1):PAL_NORM[x.tier||1]);
      function grouped(rows,cap){
        if(!rows||!rows.length) return '';
        ensureGroupedCss();
        /* (#R277) the chip carries the reader's word for the hazard and the agency's own on hover —
           the rows are grouped BY that word, so two of a service's spellings are one chip. */
        const chip=(kd,c,raw)=>'<span class="wpa-c"'+(raw&&raw!==kd?(' title="'+esc(raw)+'"'):'')
          +'><i style="background:'+c+';"></i>'+esc(kd)+'</span>';
        const kindChips=(km)=>[...km.entries()].sort((a,b)=>b[1].n-a[1].n).map(([kd,v])=>chip(kd,v.c,v.raw)).join('');
        const sig=(km)=>[...km.keys()].sort().join('');
        const by=new Map();
        rows.forEach(x=>{ const k=x.adm||x.pref||x.area||'—';
          const t=x.tier||0, c=rowCol(x);
          const g=by.get(k)||{tier:0,col:NONE_COL,kinds:new Map(),n:0,subs:new Map()}; by.set(k,g);
          if(t>g.tier){ g.tier=t; g.col=c; } g.n++;
          const raw=String(x.kind||'').trim(); const kd=hazardLabel(raw)||raw;
          if(kd&&(!g.kinds.has(kd)||g.kinds.get(kd).n<t)) g.kinds.set(kd,{n:t,c,raw});
          const sk=x.sub||x.area||k;
          const sg=g.subs.get(sk)||{tier:0,col:NONE_COL,kinds:new Map(),areas:new Map()}; g.subs.set(sk,sg);
          if(t>sg.tier){ sg.tier=t; sg.col=c; }
          if(kd&&(!sg.kinds.has(kd)||sg.kinds.get(kd).n<t)) sg.kinds.set(kd,{n:t,c,raw});
          const ar=x.area||''; if(ar&&ar!==sk){ const am=sg.areas.get(ar)||new Map(); sg.areas.set(ar,am);
            if(kd&&(!am.has(kd)||am.get(kd).n<t)) am.set(kd,{n:t,c,raw}); } });
        const list=[...by.entries()].sort((a,b)=>(b[1].tier-a[1].tier)||(b[1].n-a[1].n));
        const N=cap||60, SUBN=20, ARN=40;
        const more=(n)=>'<div class="wpa-more">+'+n+'</div>';
        return '<div class="wpa">'
          +list.slice(0,N).map(([k,g])=>{
            const subs=[...g.subs.entries()].sort((a,b)=>(b[1].tier-a[1].tier)||(b[1].areas.size-a[1].areas.size));
            const subHtml=subs.slice(0,SUBN).map(([sk,sg])=>{
              const bySig=new Map();
              [...sg.areas.entries()].sort((a,b)=>a[0]<b[0]?-1:1).forEach(([ar,am])=>{
                const key=sig(am); const b2=bySig.get(key)||{kinds:am,names:[]}; bySig.set(key,b2); b2.names.push(ar); });
              const groupsOfSame=[...bySig.values()].sort((a,b)=>b.names.length-a.names.length);
              const arCount=sg.areas.size;
              const arHtml=groupsOfSame.map(b2=>'<div class="wpa-a">'
                  +(sig(b2.kinds)===sig(sg.kinds)?'':kindChips(b2.kinds))
                  +esc(b2.names.slice(0,ARN).join('・'))+(b2.names.length>ARN?(' +'+(b2.names.length-ARN)):'')+'</div>').join('');
              return '<div class="wpa-s">'
                +'<div class="wpa-sh"><span class="wpa-sw2" style="background:'+sg.col+';"></span>'
                +'<span>'+esc(sk)+'</span></div>'
                +'<div class="wpa-sk">'+kindChips(sg.kinds)+'</div>'
                +(arCount?('<details class="im-more" style="margin:1px 0 0 14px;"><summary>'
                  +esc(L('Each municipality','市区町村ごと','Einzelne Gemeinden','По муниципалитетам','Cada municipio'))
                  +' ('+arCount+')</summary>'+arHtml+'</details>'):'')
                +'</div>'; }).join('')
              +(subs.length>SUBN?more(subs.length-SUBN):'');
            return '<div class="wpa-g">'
              +'<div class="wpa-h"><span class="wpa-sw" style="background:'+g.col+';"></span>'
              +'<b>'+esc(k)+'</b><span class="wpa-n">'+subs.length+'</span></div>'
              +'<div class="wpa-k">'+kindChips(g.kinds)+'</div>'
              +'<details class="im-more" style="margin:2px 0 0 16px;"><summary>'
                +esc(L('By area','地域ごと','Nach Gebiet','По районам','Por zona'))+' ('+subs.length+')</summary>'
                +subHtml+'</details>'
              +'</div>'; }).join('')
          +(list.length>N?more(list.length-N):'')
          +'</div>'; }

      /* ══ ⚠⚠⚠ (#R273) FRESH / DELAYED / STALE / ERROR ═══════════════════════════════════════════
         「更新時間31.1hと2minが同列。INMETの『31.1 h』とPAGASAの『0 min』が同じ緑丸なのはかなり気に
           なります。古いデータなのか、そもそも更新頻度が低いデータなのか判断不能です。」
         ⚠ AND THE GRADE IS ABOUT THE FEED, NOT ABOUT THE DANGER. A national service with nothing to
         say publishes nothing, and that is not a fault — so 「Delayed」 names the age of the newest
         thing in the feed and the panel says as much underneath, rather than implying a failure. */
      const FRESH_H=6, DELAY_H=48;
      function grade(k){ const s=FEED_STATE[k]||'idle';
        if(s==='error') return 'error'; if(s!=='ok') return 'loading';
        const h=ageH(k); if(h==null) return 'ok';
        return h<=FRESH_H?'fresh':h<=DELAY_H?'delayed':'stale'; }
      const GRADE_COL={fresh:'#32d74b',delayed:'#ffd60a',stale:'#ff9f0a',error:'#ff453a',loading:'#8e8e93',ok:'#32d74b'};
      const GRADE_TXT=(g)=>g==='fresh'?L('Fresh','最新','Aktuell','Свежий','Reciente')
        :g==='delayed'?L('Delayed','やや古い','Verzögert','С задержкой','Con retraso')
        :g==='stale'?L('Stale','古い','Veraltet','Устарел','Obsoleto')
        :g==='error'?L('Error','取得不可','Fehler','Ошибка','Error')
        :L('Loading','取得中','Lädt','Загрузка','Cargando');

      /* how many units of a country are DRAWN with something in force — one unit for every source,
         so the numbers in the list can be compared with one another (「左の数字が比較不能」) */
      const drawnCount=(iso)=>feats.filter(f=>f.properties.iso===iso&&(f.properties.norm||0)>0).length;
      const feedCount=(feed)=>{ let n=0; Object.keys(FEEDS).forEach(c=>{ if(FEEDS[c]===feed) n+=drawnCount(c); }); return n; };

      /* ══ ⚠⚠⚠ (#R273) THE PANEL ANSWERS THE FOUR QUESTIONS, IN THAT ORDER ═══════════════════════
         「世界警報レイヤーなのに、一覧が『取得先一覧』になっている。ユーザーが知りたいのは『どこで何が
           起きているか』です。今のパネルはむしろ『IntMapがどのAPIから何件取ってきたか』を説明している。」
         So the first thing in the box is what is in force, worst first, one line per country-and-
         hazard: WHERE · WHAT · HOW BAD · how many units. The source list is still complete, and it
         is folded; the placement diagnostics are folded one level below that. */
      /* ══ ⚠⚠⚠ (#R275) 「今発表されている警報欄は、一国一行までにしろ。」 ═══════════════════════════
         This list keyed on COUNTRY × HAZARD, so one country took as many lines as it had kinds of
         warning in force. MEASURED on the built page, fourteen visible rows: **five of them were
         China** (雷電黄色 / 暴雨黄色 / 暴雨橙色 / 暴雨紅色 / 強対流黄色), four were Italy and two were
         Australia — three countries occupying eleven of the fourteen lines while 「+59」 stood for
         everywhere else. A reader asking 「どこで何が起きているか」 was shown one country five times.

         One country is one line: its worst rank decides the colour and the word, the hazards are
         named on the same line (worst first, and the ones that do not fit are counted), and the
         number on the right is how many issuing units of that country are drawn.
         ⚠ AND THE RANK ON THE LINE IS NOW THE RANK OF THE LINE. The old row printed the WORST rank
         of the whole country beside ONE hazard's name — measured, 「雷电黄色」 (a CMA yellow) captioned
         「Red (I)」, because the feature it came from carried its unit's worst level. A country row's
         worst rank is that country's worst rank, so the two cannot disagree again. */
      function hotList(){
        const by=new Map();
        feats.forEach(f=>{ const p=f.properties; if(!(p.norm>0)) return;
          const g=by.get(p.iso)||{iso:p.iso,feed:p.feed,norm:0,lv:0,units:0,kinds:new Map()};
          by.set(p.iso,g);
          g.units++; if(p.norm>g.norm){ g.norm=p.norm; g.lv=p.lv; }
          let it=[]; try{ it=JSON.parse(p.items||'[]'); }catch(_){}
          /* ⚠ A HAZARD'S RANK IS ITS OWN, not the unit's worst. The rows carry `tier`, and using the
             feature's `norm` here would order 「雷電黄色」 as if it were the province's 「暴雨紅色」 —
             the same conflation that captioned a CMA yellow 「Red (I)」, one level down. */
          /* (#R277) …and the NAME is the reader's, from the agency's word — see `hazardLabel` */
          const add=(k,t)=>{ k=hazardLabel(k); if(!k) return;
            const cur=g.kinds.get(k)||{n:0,norm:0};
            cur.n++; if(t>cur.norm) cur.norm=t; g.kinds.set(k,cur); };
          if(it.length) it.forEach(x=>add(x.kind,+x.tier||p.norm));
          else add(String(p.hz||'').replace(/\s\+\d+$/,''),p.norm); });
        const list=[...by.values()].sort((a,b)=>(b.norm-a.norm)||(b.units-a.units));
        if(!list.length) return '<div style="margin-top:6px;font-size:11.5px;color:var(--text-muted);">'
          +L('Nothing in force in any connected service right now.','接続中のいずれの機関にも、現在発表中のものはありません。','Derzeit nichts in Kraft.','Сейчас ничего не действует.','Nada vigente ahora.')+'</div>';
        const N=16, KN=3;
        return '<div style="margin-top:6px;display:flex;flex-direction:column;gap:2px;">'
          +list.slice(0,N).map(g=>{
            const ks=[...g.kinds.entries()].sort((a,b)=>(b[1].norm-a[1].norm)||(b[1].n-a[1].n)).map(x=>x[0]);
            const shown=ks.slice(0,KN).join('・')+(ks.length>KN?(' +'+(ks.length-KN)):'');
            return '<div style="display:flex;gap:6px;align-items:center;font-size:11.5px;">'
              +'<span style="'+swatchStyle(mode==='agency'?agCol(g.feed,g.lv):PAL_NORM[g.norm])+'"></span>'
              +'<b style="flex:none;max-width:34%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+esc(countryName(g.iso))+'</b>'
              +'<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+esc(shown||'—')+'</span>'
              +'<span style="opacity:.8;flex:none;">'+esc(mode==='agency'?rankName(g.feed,g.lv):NORM_NAME(g.norm))+'</span>'
              +'<span style="opacity:.6;flex:none;font-variant-numeric:tabular-nums;">'+g.units+'</span></div>'; }).join('')
          +(list.length>N?('<div style="font-size:10.5px;opacity:.7;">+'+(list.length-N)+' '
            +esc(L('more countries','か国','weitere Länder','стран','países'))+'</div>'):'')
          +'</div>'; }

      function sourceList(){
        const rowsFor=[['jma','JPN'],['nws','USA'],['eccc','CAN'],['dwd','DEU'],['metno','NOR'],
          ['meteoalarm',null],['swic',null],['cma','CHN'],['bom','AUS'],['inmet','BRA'],['pagasa','PHL'],
          ['cwa','TWN'],['metservice','NZL'],['hko','HKG']];
        return rowsFor.map(function(pair){ const k=pair[0], iso=pair[1];
          const g=grade(k), n=iso?drawnCount(iso):feedCount(k);
          const who=(k==='meteoalarm')
            ? (L('Europe — MeteoAlarm','ヨーロッパ — MeteoAlarm','Europa — MeteoAlarm','Европа — MeteoAlarm','Europa — MeteoAlarm')
               +' ('+Object.keys(maData).length+'/'+Object.keys(MA).length+')')
            : (k==='swic')
            ? (L('National services via the WMO register','各国の気象機関（WMO 登録経由）','Nationale Dienste über das WMO-Register','Национальные службы (реестр ВМО)','Servicios nacionales vía el registro de la OMM')
               +' ('+Object.keys(swicData).length+'/'+swicISO().length+')')
            : (countryName(iso)+' — '+(AGENCY_NAME[k]||k));
          return '<div style="display:flex;gap:6px;align-items:center;font-size:11px;padding:2px 0;">'
            +'<span style="width:8px;height:8px;border-radius:50%;flex:none;background:'+GRADE_COL[g]+';"></span>'
            +'<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+esc(who)+'</span>'
            +'<span style="opacity:.75;flex:none;font-variant-numeric:tabular-nums;">'+n+' '
            +esc(L('areas','区域','Gebiete','зон','zonas'))+'</span>'
            +'<span style="opacity:.6;flex:none;min-width:52px;text-align:right;">'
            +esc(g==='error'?GRADE_TXT('error'):g==='loading'?GRADE_TXT('loading'):(ageTxt(k)||GRADE_TXT(g)))+'</span></div>'; }).join(''); }

      /* ⚠ (#R288) 「発令なし」 IS DRAWN AT THE UNIT WHERE THIS MAP HOLDS THE UNITS, AND AT THE
         COUNTRY WHERE IT DOES NOT — that difference is a fact about this map, so it is printed
         rather than left for the reader to infer from the picture. */
      function unitLine(){
        let uc=0, cc=0;
        /* ⚠ (#R290) `quietSet`, not the CACHE — the sentence is in the present tense, and the unit
           layer is bounded by the view and the zoom, so 「持っている」 and 「描いている」 are two
           different numbers. Printing the first under a sentence that claims the second is the
           shape #R185 exists to prevent. */
        try{ (HOST.countryGeo&&HOST.countryGeo.features||[]).forEach(f=>{ const c=String(f.id||'');
          if(!c||!supported(c)||readState(c)!=='ok') return;
          if(quietSet[c]) uc++; else cc++; }); }catch(_){}
        const units=quietList.reduce((n,k)=>n+((UNITS[k]||[]).length),0);
        /* ⚠ ONE sentence per language with placeholders, not four fragments concatenated: a
           sentence broken into pieces cannot be re-ordered by a translator, and every piece
           becomes its own row in the i18n tables (#R239's 「翻訳済みの定義」 problem, in miniature). */
        const txt=L('Nothing in force is drawn per administrative unit in {u} countries ({n} units), and country-wide in {c}.',
          '「発令なし」は {u} か国で区分単位ごとに（{n} 区分）、{c} か国で国全体として描いています。',
          'Nichts in Kraft wird in {u} Ländern je Verwaltungseinheit ({n} Einheiten) und in {c} Ländern landesweit gezeichnet.',
          '«Ничего не действует» показано по единицам в {u} странах ({n} единиц) и по стране целиком в {c}.',
          'Nada vigente se dibuja por unidad administrativa en {u} países ({n} unidades) y por país entero en {c}.');
        return '<div style="font-size:10.5px;color:var(--text-muted);line-height:1.55;">'
          +esc(txt.replace('{u}',uc).replace('{n}',units).replace('{c}',cc))+'</div>'; }
      function placedLine(){
        const gaps=Object.keys(PLACED).filter(k=>PLACED[k]&&PLACED[k][1]>PLACED[k][0]);
        if(!gaps.length) return '<div style="font-size:10.5px;color:var(--text-muted);">'
          +L('Every area every connected service published could be located.','接続中の各機関が発表したすべての区域について、位置を特定できています。','Alle Gebiete konnten verortet werden.','Все зоны удалось разместить.','Todas las zonas se pudieron ubicar.')+'</div>';
        const tot=gaps.reduce((n,k)=>n+PLACED[k][1]-PLACED[k][0],0);
        return '<div style="font-size:10.5px;color:var(--text-muted);line-height:1.55;">'
          +esc(L('Areas the agency published but this map could not place: ','機関が発表したもののうち、地図上に位置を特定できなかった区域: ','Gebiete ohne auflösbare Geometrie: ','Зоны без найденной геометрии: ','Zonas sin geometría resuelta: '))
          +tot+' ('+esc(gaps.slice(0,8).map(k=>countryName(k)+' '+PLACED[k][0]+'/'+PLACED[k][1]).join(', '))
          +(gaps.length>8?(' +'+(gaps.length-8)):'')+')</div>'; }

      /* ⚠ (#R273) 「透明度選択、元の共通のスライダーをなんで変えどんねん。余計なボタン作るな。」 — the
         opacity control this panel offers is the one EVERY legend already has (js/data-layers.js
         builds `.dl-op-row` from `_registerLayerOpacity`, which `panel.open` calls). This layer only
         declares a lower DEFAULT for it, the way `plates` declares 30 % and `worldcover` 100 %; it
         does not add a second control for a value that already has one. The palette switch below is
         the only control here, and it exists because there is no existing control for it. */
      function controls(){
        const seg=(id,cur,opts)=>'<div class="wpa-seg" data-seg="'+id+'">'
          +opts.map(o=>'<button type="button" data-v="'+o[0]+'"'+(String(o[0])===String(cur)?' class="on"':'')+'>'+esc(o[1])+'</button>').join('')+'</div>';
        return '<div style="margin-top:8px;display:flex;align-items:center;gap:8px;font-size:11px;">'
            +'<span style="flex:none;color:var(--text-muted);">'+esc(L('Colours','配色','Farben','Цвета','Colores'))+'</span>'
            +seg('pal',mode,[['agency',L('Official','各国公式','Offiziell','Официальные','Oficiales')],['norm',L('IntMap scale','IntMap換算','IntMap-Skala','Шкала IntMap','Escala IntMap')]])
          +'</div>'; }
      let _segCss=false;
      function ensureSegCss(){ if(_segCss||typeof document==='undefined') return; _segCss=true;
        const st=document.createElement('style'); st.id='wpa-seg-css';
        st.textContent='.wpa-seg{display:flex;gap:2px;background:var(--input-bg);border-radius:8px;padding:2px;flex:1;min-width:0;}'
          +'.wpa-seg button{flex:1;min-width:0;border:0;background:transparent;color:var(--text-main);font-size:10.5px;'
          +'font-weight:500;padding:4px 3px;border-radius:6px;cursor:pointer;line-height:1.2;white-space:nowrap;}'
          +'.wpa-seg button.on{background:var(--primary-color);color:#fff;font-weight:600;}';
        (document.head||document.documentElement).appendChild(st); }
      function wireControls(b){ if(!b) return;
        b.querySelectorAll('.wpa-seg').forEach(sg=>{ const kind=sg.getAttribute('data-seg');
          sg.querySelectorAll('button').forEach(bt=>{ bt.addEventListener('click',(e)=>{ e.stopPropagation();
            const v=bt.getAttribute('data-v');
            if(kind==='pal'){ mode=(v==='norm')?'norm':'agency';
              try{ localStorage.setItem('im.alertPal',mode); }catch(_){}
              repaintMode(); overview(); }
          }); }); }); }


      /* ══ ⚠⚠⚠ (#R275) 「押した地点の警報情報が別ポップアップで出るようにしろ。」 ═══════════════════
         A tap used to REPLACE the legend's body with the whole country's list — so the answer to
         「この地点は何が出ているのか」 was a country-wide document, and getting it destroyed the
         「いま発表されている警報」 overview the same box was showing. Two different questions were
         sharing one surface, and the narrower one could not be asked at all.

         #R264 wrote the rule this follows: a question about the point under the finger FLOATS; a
         question about the layer belongs to the layer's own legend. So the tap opens a separate card
         — the app's own `.country-popup` shell, the one the aircraft, data-centre and facility
         details use — listing the warnings whose ISSUING AREA CONTAINS THAT POINT, and the legend
         keeps the overview it was showing.
         ⚠ THE HIT TEST IS THE DRAWN GEOMETRY, not the country. `feats` is what is on the map, so
         「その地点で発令されているもの」 is exactly the features that contain the point — a municipality
         in Japan, a Landkreis in Germany, the polygon the service itself drew elsewhere. */
      function ptInGeom(lng,lat,g){
        if(!g) return false;
        const polys=(g.type==='Polygon')?[g.coordinates]:(g.type==='MultiPolygon'?g.coordinates:null);
        if(!polys) return false;
        for(let a=0;a<polys.length;a++){ const rings=polys[a]||[];
          if(!rings.length||!ptInRing([lng,lat],rings[0])) continue;
          let hole=false;
          for(let h=1;h<rings.length;h++){ if(ptInRing([lng,lat],rings[h])){ hole=true; break; } }
          if(!hole) return true; }
        return false; }
      function alertsAt(lng,lat){
        const hit=[];
        feats.forEach(f=>{ const pr=f.properties||{};
          if(!(pr.norm>0)) return;
          if(ptInGeom(lng,lat,f.geometry)) hit.push(f); });
        return hit.sort((a,b)=>(b.properties.norm-a.properties.norm)); }
      /* ⚠⚠ (#R293) THE TWO CLOCKS, ON ONE LINE — the agency's issue time and IntMap's read time.
         Each is printed only if it is really known; a dash is an honest answer, and a FETCH time
         printed under the word 「発表」 would be #R269's defect in miniature. */
      function stampAt(v){ const t=(typeof v==='number')?v:Date.parse(String(v||''));
        if(!isFinite(t)) return '';
        try{ return new Date(t).toLocaleString(window.IntMapLang.locale(HOST.lang,'en-US'),
          {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}); }catch(_){ return ''; } }
      function stampLine(pr){
        const issued=stampAt(pr.at)||stampAt(FEED_AT[pr.feed]);
        const got=stampAt(pr.got)||stampAt(FEED_GOT[pr.feed]);
        return esc(L('issued','発表','ausgegeben','выпущено','emitido')+' '+(issued||'—')
          +' · '+L('IntMap read','IntMap取得','IntMap gelesen','IntMap прочитал','IntMap leyó')+' '+(got||'—')); }
      let ptCard=null;
      function closePointCard(){ try{ if(ptCard&&ptCard.parentNode) ptCard.parentNode.removeChild(ptCard); }catch(_){} ptCard=null; }
      function pointBody(lng,lat,iso){
        const hits=alertsAt(lng,lat);
        const feed=FEEDS[iso]||LEARNED[iso];   /* (#R288) */
        let h='<div style="font-size:11px;color:var(--text-muted);">'
          +esc((+lat).toFixed(4)+'°, '+(+lng).toFixed(4)+'°')+(iso?(' · '+esc(countryName(iso))):'')+'</div>';
        if(!hits.length){
          h+='<div style="margin-top:9px;font-size:12px;color:var(--text-main);line-height:1.6;">'
            +(!iso?esc(L('No country here.','ここには国がありません。','Hier ist kein Land.','Здесь нет страны.','No hay país aquí.'))
              /* (#R277) …and 「could not be fetched」 is a THIRD thing, not the same silence as
                 「not read yet」 and not 「nothing in force」 — both are hatched on the map, so this
                 card is where the reader finds out which one it is. */
              :(feed&&readState(iso)==='error')?esc(L('This country’s service could not be fetched just now — nothing is being said about this point.',
                           'この国の機関の情報を今は取得できませんでした——この地点については何も述べていません。',
                           'Dieser Dienst war gerade nicht erreichbar — über diesen Punkt wird nichts ausgesagt.',
                           'Службу этой страны сейчас не удалось прочитать — о этой точке ничего не утверждается.',
                           'No se pudo obtener el servicio de este país ahora mismo — no se afirma nada sobre este punto.'))
              :(feed&&readState(iso)!=='ok')?esc(L('This country’s service is in the update cycle and has not been read yet.',
                           'この国の機関は更新の順番待ちで、まだ取得できていません。',
                           'Dieser Dienst wurde noch nicht gelesen.',
                           'Эта служба ещё не прочитана.',
                           'Este servicio aún no se ha leído.'))
              :!feed?esc(L('IntMap is not connected to this country’s warning service, so it is saying nothing about this point — not that nothing is in force.',
                           'この国の警報機関には接続していないため、この地点について何も述べていません——「発表されていない」という意味ではありません。',
                           'Kein Anschluss an den Warndienst dieses Landes — über diesen Punkt wird nichts ausgesagt.',
                           'Нет подключения к службе этой страны — об этой точке ничего не утверждается.',
                           'Sin conexión al servicio de este país — no se afirma nada sobre este punto.'))
              :esc(L('Nothing in force at this point.','この地点に発表中の警報はありません。','Hier ist nichts in Kraft.','В этой точке ничего не действует.','Nada vigente en este punto.')))
            +'</div>';
        } else {
          h+='<div style="margin-top:7px;display:flex;flex-direction:column;gap:5px;">'
            +hits.slice(0,6).map(f=>{ const pr=f.properties;
              let items=[]; try{ items=JSON.parse(pr.items||'[]'); }catch(_){}
              const col=(mode==='agency'?pr.colA:pr.colN);
              /* (#R277) ⚠ THE AGENCY'S OWN WORDING IS NOT REPLACED, IT IS ACCOMPANIED. The reader's
                 name for the hazard first, and what the service itself wrote in brackets after it —
                 「正確で忠実な」 means the original has to stay legible somewhere, and this card is where. */
              const kinds=[]; items.forEach(x=>{ const k=String(x.kind||'').trim(); if(!k) return;
                const t=hazardLabel(k); const shown=(t&&t!==k)?(t+' （'+k+'）'):k;
                if(kinds.indexOf(shown)<0) kinds.push(shown); });
              return '<div style="border-left:3px solid '+col+';padding-left:7px;">'
                +'<div style="display:flex;gap:6px;align-items:baseline;font-size:12px;">'
                +'<b style="flex:1;">'+esc(pr.name||countryName(pr.iso))+'</b>'
                +'<span style="flex:none;opacity:.85;">'+esc(mode==='agency'?rankName(pr.feed,pr.lv):NORM_NAME(pr.norm))+'</span></div>'
                +'<div style="margin-top:1px;font-size:11px;color:var(--text-main);line-height:1.4;">'
                +esc((kinds.length?kinds:[String(pr.hz||'')]).join('・'))+'</div>'
                +'<div style="margin-top:1px;font-size:9.5px;color:var(--text-muted);line-height:1.45;">'
                +esc(agencyFor(pr.feed,pr.iso))+'<br>'+stampLine(pr)+'</div></div>'; }).join('')
            +(hits.length>6?('<div style="font-size:10.5px;opacity:.7;">+'+(hits.length-6)+'</div>'):'')
            +'</div>';
        }
        /* ══ ⚠⚠ (#R293) 「ポップアップがでかすぎるからコンパクトに」 — WHAT WAS ACTUALLY BIG ═══════════
           MEASURED on production with ONE warning in force at the tapped point: the card came out
           about 300 px tall and only ~90 px of that was the warning. The rest was the agency's FULL
           rank key — five rows, repeated verbatim from the layer legend three centimetres away — a
           full-width button, a two-line disclaimer, and the part nothing on screen could have
           explained: `.country-popup` carries `padding:18px 22px` and this card added a SECOND
           `padding:14px 16px` inside it.
           → the rank key goes (it is in the legend and in the country card, and the rank of THIS
           warning is already on its own row); one padding, not two; a narrower shell; the
           disclaimer is one line; twelve stacked warnings become six. */
        if(iso&&feed){
          h+='<div style="margin-top:7px;"><button type="button" class="wpa-more-btn" style="width:100%;min-height:26px;border-radius:8px;border:1px solid var(--glass-border,rgba(128,128,128,0.25));background:var(--input-bg);color:var(--text-main);font-size:10.5px;cursor:pointer;">'
            +esc(L('All areas in force in this country','この国で発表中の区域をすべて見る','Alle Gebiete dieses Landes','Все зоны этой страны','Todas las zonas de este país'))+'</button></div>';
        }
        h+='<div style="margin-top:6px;font-size:9px;color:var(--text-muted);line-height:1.4;">'
          +esc(L('Educational — follow the official authorities.','参考表示。公的機関の発表に従ってください。','Bildungsanzeige — amtlichen Stellen folgen.','Справочно — следуйте официальным службам.','Educativo — siga a las autoridades.'))+'</div>';
        return h; }
      function openPointCard(lng,lat,iso){
        closePointCard();
        const el=document.createElement('div'); el.className='country-popup'; el.id='wpa-point';
        el.style.display='block';
        el.style.width='min(316px,92vw)'; el.style.padding='0';   /* (#R293) ONE padding — see pointBody */
        el.innerHTML='<button class="country-popup-close wpa-x" type="button" aria-label="'+esc(L('Close','閉じる','Schließen','Закрыть','Cerrar'))+'">×</button>'
          +'<div style="padding:11px 13px 12px;">'
          +'<div class="wpa-drag" style="display:flex;align-items:center;gap:8px;margin-bottom:2px;padding-right:26px;cursor:move;user-select:none;">'
          +'<span style="font-weight:700;font-size:12.5px;color:var(--text-main);">⚠ '
          +esc(L('Warnings at this point','この地点の警報','Warnungen an diesem Punkt','Предупреждения в этой точке','Avisos en este punto'))+'</span></div>'
          +'<div class="wpa-pt-body"></div></div>';
        const b=el.querySelector('.wpa-pt-body'); if(b) b.innerHTML=pointBody(lng,lat,iso);
        document.body.appendChild(el); ptCard=el;
        /* ⚠ (#R255) `.country-popup` is `position:absolute` with no left/top of its own — an element
           appended to <body> without them lands below the whole document. Placed explicitly, in PAGE
           coordinates (`project()` is canvas-relative — #R252). */
        try{
          const vw=window.innerWidth||1200, vh=window.innerHeight||800, w=el.offsetWidth||360, h=el.offsetHeight||280;
          const rs=(()=>{ try{ const s2=document.getElementById('layer-sidebar-r');
            return (s2&&document.body.classList.contains('lsr-open'))?s2.getBoundingClientRect().width:0; }catch(_){ return 0; } })();
          const px=(()=>{ try{ const q=GE().coords.project({lng:+lng,lat:+lat});
            const r2=GE().render.canvas().getBoundingClientRect(); return r2.left+q.x; }catch(_){ return null; } })();
          let left=(px!=null)?(px+18):(vw-rs-w-24);
          left=Math.max(12,Math.min(left,vw-rs-w-12));
          el.style.left=Math.round(Math.max(12,left))+'px';
          el.style.top=Math.round(Math.max(12,Math.min(96,vh-h-16)))+'px';
        }catch(_){ el.style.left='16px'; el.style.top='96px'; }
        try{ HOST.makeDraggable&&HOST.makeDraggable(el,el.querySelector('.wpa-drag')); }catch(_){}
        try{ el.querySelector('.wpa-x').onclick=closePointCard; }catch(_){}
        try{ const mb=el.querySelector('.wpa-more-btn');
          if(mb) mb.onclick=()=>{ panel.open('<div class="wp-a-body">'+legendFor(iso)+'</div>'); }; }catch(_){}
        return el; }

      /* what is in force RIGHT NOW, worldwide — shown the moment the layer is on, without a tap */
      function overview(){
        ensureSegCss();
        const oldest=FEED_KEYS.map(k=>ageH(k)).filter(v=>v!=null).reduce((m,v)=>Math.max(m,v),0);
        const bad=FEED_KEYS.filter(k=>FEED_STATE[k]==='error').length;
        const b=panel.open('<div class="wp-a-body">'
          +'<div style="font-weight:700;font-size:13px;">'+L('What is in force now','いま発表されている警報','Aktuell in Kraft','Действует сейчас','Vigente ahora')+'</div>'
          +'<div style="margin-top:2px;font-size:10.5px;color:var(--text-muted);">'
          +esc(L('Updated','最終取得','Aktualisiert','Обновлено','Actualizado'))+' '
          +esc(lastAt?new Date(lastAt).toLocaleTimeString():'—')
          +' · '+esc(L('every 30 s','30秒ごと','alle 30 s','каждые 30 с','cada 30 s'))
          +(oldest?(' · '+esc(L('oldest feed','最も古いフィード','ältester Feed','старейший фид','feed más antiguo'))+' '+(oldest<1?(Math.round(oldest*60)+' min'):(oldest.toFixed(1)+' h'))):'')
          +(bad?(' · <span style="color:#ff453a;">'+bad+' '+esc(L('unavailable','取得不可','nicht verfügbar','недоступно','no disponible'))+'</span>'):'')
          +'</div>'
          +hotList()
          +controls()
          +worldKey()
          +'<details class="im-more" style="margin-top:8px;"><summary style="font-size:11px;">'
            +esc(L('Source status','ソースの状態','Quellenstatus','Состояние источников','Estado de las fuentes'))
            +' ('+FEED_KEYS.length+')</summary>'
            +'<div style="margin-top:4px;">'+sourceList()+'</div>'
            +'<div style="margin-top:5px;font-size:9.5px;color:var(--text-muted);line-height:1.5;">'
            +esc(L('The clock is the newest item in that feed, not how long ago it was fetched. A national service with nothing to publish is quiet, not broken.',
                   '表示している時間は、そのフィードの中で最も新しい項目の時刻です（取得時刻ではありません）。発表するものが無い機関は「静か」であって「故障」ではありません。',
                   'Die Uhr ist der neueste Eintrag im Feed, nicht der Abrufzeitpunkt.',
                   'Часы — это самый свежий элемент фида, а не время запроса.',
                   'El reloj es el elemento más nuevo del feed, no cuándo se descargó.'))+'</div>'
            +'<details class="im-more" style="margin-top:6px;"><summary style="font-size:10.5px;">'
              +esc(L('Diagnostics','診断','Diagnose','Диагностика','Diagnóstico'))+'</summary>'
              +'<div style="margin-top:4px;">'+placedLine()+'</div>'
              +'<div style="margin-top:4px;">'+unitLine()+'</div></details>'
          +'</details>'
          +'<div style="margin-top:8px;font-size:11px;color:var(--text-main);">'
          +L('Tap any country for its own agency’s scale and the areas in force.','国をタップすると、その機関自身の階級と発表中の区域が出ます。','Land antippen für die Skala der Behörde.','Нажмите страну — шкала её службы.','Toque un país para la escala de su agencia.')+'</div>'
          /* 「これ長すぎ。」 — the attribution is one sentence, and the detail is behind the fold */
          +'<div style="margin-top:5px;font-size:9.5px;color:var(--text-muted);line-height:1.5;">'
          +L('Each country is drawn from its own agency, at the unit that agency issues for. Educational display — follow the official authorities.',
             '各国は、その国の機関の発令単位で描いています。表示は参考です。実際には公的機関の発表に従ってください。',
             'Jedes Land stammt von seiner eigenen Behörde, in deren Warneinheiten. Bildungsanzeige.',
             'Каждая страна — по данным её собственной службы, в её единицах. Справочно.',
             'Cada país procede de su propia agencia, en sus unidades. Visualización educativa.')+'</div>'
          +'</div>');
        wireControls(b); }

      /* (#R288) panning is when a country becomes worth its units — bounded by `GB_MAX` and by
         「asked once per session」, so a sweep across the world is a walk, never a storm */
      try{ GE().events.on('moveend',()=>{ if(!on) return; askUnitsInView();
        /* (#R290) the quiet collection is bounded by the view (see quietISOs), so a pan that brings
           a new country on screen has to republish it — and the signature makes a pan that changes
           nothing cost nothing. */
        publishQuiet(); paintCountries(); }); }catch(_){}
      try{ GE().events.on('idle',()=>{ if(on) applyAlertVis(); }); }catch(_){}   /* the re-assert — see applyAlertVis */
      /* ⚠ (#R288) the tick re-asserts too. MEASURED: something outside this module sets
         `wp-alert-fill` to `visibility:none` once during the first minute (the saved-layer
         re-apply, js/map-ui.js — see #R276's note about it switching off ids not in the share
         hash), and until this round nothing put it back until the next publish happened to run.
         The result was warnings drawn as outlines with no fill, which is not a state anything
         chose. `idle` catches it in a moving map; this catches it in a still one. */
      function tick(){ if(on) applyAlertVis(); if(on&&!document.hidden) refresh(); }
      function toggle(v){ on=v;
        if(!on){ if(timer){ clearInterval(timer); timer=null; } panel.hide(); closePointCard();
          applyAlertVis(); return; }
        whenDrawable(()=>ensureLayers()); overview(); refresh(); hiResCountries(()=>{ if(on) paintCountries(true); });
        if(!timer) timer=setInterval(tick,TICK_MS); }
      document.addEventListener('visibilitychange',()=>{ if(on&&!document.hidden) refresh(); });

      onRestyle(()=>{ if(on) whenDrawable(()=>{ if(ensureLayers()){ featsSig=featSig(feats); GE().layers.setSourceData(SRC,{type:'FeatureCollection',features:feats}); } applyAlertVis(); publishQuiet(true); paintCountries(true); }); });
      mapClick((e)=>{ if(!on) return false;
        const lng=e.lngLat.lng, lat=e.lngLat.lat;
        const c=countryAt(lng,lat);
        /* ══ ⚠⚠ (#R290) A CARD WITH NOTHING TO SAY IS NOT AN ANSWER ═══════════════════════════
           「海などをクリックするとここには国がありませんと出てくるが、そんなの分かりきってるので、
             わざわざポップアップを出すな。」 — a tap on open water had no country and no warning, so
           the whole card was the sentence 「ここには国がありません。」 over a blank. It says nothing
           the reader cannot already see, and it took the click from whatever else was under it.
           ⚠ 「no country」 IS NOT 「nothing to say」: a marine warning is issued over water and
           carries its own polygon, so the card still opens when something IS in force at that
           point. Only the empty combination is silent, and then the click falls through. */
        if(!c&&!alertsAt(lng,lat).length){ closePointCard(); return false; }
        openPointCard(lng,lat,c);
        /* a country whose rows have not been fetched yet is fetched NOW and the card re-renders —
           the tap is the one moment the reader is definitely waiting for THIS country */
        const again=()=>{ try{ if(ptCard){ const b=ptCard.querySelector('.wpa-pt-body');
          if(b){ b.innerHTML=pointBody(lng,lat,c);
            const mb=ptCard.querySelector('.wpa-more-btn');
            if(mb) mb.onclick=()=>{ panel.open('<div class="wp-a-body">'+legendFor(c)+'</div>'); } } } }catch(_){} };
        if(c&&MA[c]&&!maData[c]){ if(maAsked.indexOf(c)<0) maAsked.push(c);
          loadMA([c]).then(()=>{ publish(); again(); })
            .catch(()=>{ maData[c]={error:'fetch'}; again(); }); }
        else if(c&&FEEDS[c]==='swic'&&!swicData[c]){
          loadSWIC([c]).then(()=>{ publish(); again(); }).catch(()=>{ again(); }); }
        return true; });

      STATE.alerts=()=>({ on, areas:feats.filter(f=>(f.properties.norm||0)>0).length, feeds:Object.keys(FEEDS),
        state:Object.assign({},FEED_STATE), at:lastAt,
        worst:feats.reduce((m,f)=>Math.max(m,f.properties.norm||0),0),
        national:Object.keys(FEEDS).length, meteoalarm:Object.keys(MA).length,
        /* (#R275) the WMO register: how many countries it makes supported and how many are read */
        swic:{ members:Object.keys(swicMeta.mid).length, wired:swicISO().length,
          loaded:Object.keys(swicData).length, areas:feats.filter(f=>f.properties.feed==='swic'&&(f.properties.norm||0)>0).length,
          oldestS:(function(){ const t=swicISO().map(c=>swicAt[c]||0).filter(Boolean);
            return t.length?Math.round((Date.now()-Math.min.apply(null,t))/1000):null; })() },
        /* (#R275) the MeteoAlarm ROTATION — the age of the country read longest ago, in seconds.
           A number that only ever grows is the frozen-feed defect this round found. */
        maOldestS:(function(){ const t=Object.keys(maData).map(c=>maAt[c]||0).filter(Boolean);
          return t.length?Math.round((Date.now()-Math.min.apply(null,t))/1000):null; })(),
        maLoaded:Object.keys(maData).length, maWarnings:Object.keys(maData).reduce((n,k)=>n+(((maData[k]||{}).warnings||[]).length),0),
        cma:cmaCount, canada:drawnCount('CAN'), intervalMs:TICK_MS,
        /* (#R273) the palette mode, and the two properties every feature carries so the mode is a
           paint swap rather than a re-fetch */
        palette:mode, palettes:{jma:Object.assign({},PAL.jma),cma:Object.assign({},PAL.cma),cap:Object.assign({},PAL.cap),norm:Object.assign({},PAL_NORM)},
        noneColour:NONE_COL, opacityDefault:OPACITY_DEFAULT,
        /* (#R269) every feed's own clock, in hours — the instrument a frozen endpoint trips */
        jmaAt, jmaAgeH:(jmaAgeH==null?null:+jmaAgeH.toFixed(2)), jmaSuperseded,
        feedAgeH:FEED_KEYS.reduce((o,k)=>{ const h=ageH(k); o[k]=(h==null?null:+h.toFixed(2)); return o; },{}),
        grades:FEED_KEYS.reduce((o,k)=>{ o[k]=grade(k); return o; },{}),
        bom:(bomRec&&bomRec.items.length)||0, hko:(hkoRec&&hkoRec.items.length)||0,
        brazil:drawnCount('BRA'), maAll:Object.keys(MA).length,
        jmaUnit, jmaAreas, jmaPlaced, jmaQuiet,
        drawn:Object.keys(drawnISO).sort(),
        placed:Object.keys(PLACED).sort().reduce((o,k)=>{ o[k]=PLACED[k].slice(); return o; },{}),
        germany:drawnCount('DEU'), philippines:drawnCount('PHL'), norway:drawnCount('NOR'),
        china:drawnCount('CHN'), australia:drawnCount('AUS'), taiwan:drawnCount('TWN'),
        newzealand:drawnCount('NZL'), japan:drawnCount('JPN'),
        europeUnits:feats.filter(f=>f.properties.unit==='region'&&(f.properties.norm||0)>0).length,
        /* (#R273) the three country states — hatched (no feed) / grey (a feed, quiet) / washed */
        washed:(function(){ const o={}; try{ (HOST.countryGeo&&HOST.countryGeo.features||[]).forEach(f=>{
            const t=washTier(String(f.id||'')); o[String(f.id)]=t; }); }catch(_){} return o; })(),
        unsupported:(function(){ let n=0; try{ (HOST.countryGeo&&HOST.countryGeo.features||[]).forEach(f=>{
            if(!supported(String(f.id||''))) n++; }); }catch(_){} return n; })(),
        /* (#R275) wired but not yet read — the countries the hatch is covering for a REASON that is
           not 「未対応」, and a number that must go to zero as the rotation comes round */
        unread:(function(){ let n=0; try{ (HOST.countryGeo&&HOST.countryGeo.features||[]).forEach(f=>{
            const c=String(f.id||''); if(supported(c)&&readState(c)!=='ok') n++; }); }catch(_){} return n; })(),
        /* (#R290) …and WHICH of the two silences it is. MEASURED: after the rotation has been round
           once (MeteoAlarm 35/35 at t+46 s, the WMO register 93/93 at t+40 s) the count does not
           reach zero and never will — what is left is countries whose service ERRORED, and those
           are hatched for a different reason and for as long as the upstream is down. Counting
           them together made 「まだ読んでいない」 look like it never finished. */
        errored:(function(){ let n=0; try{ (HOST.countryGeo&&HOST.countryGeo.features||[]).forEach(f=>{
            const c=String(f.id||''); if(supported(c)&&readState(c)==='error') n++; }); }catch(_){} return n; })(),
        pending:(function(){ let n=0; try{ (HOST.countryGeo&&HOST.countryGeo.features||[]).forEach(f=>{
            const c=String(f.id||''); const st=readState(c); if(supported(c)&&st!=='ok'&&st!=='error') n++; }); }catch(_){} return n; })(),
        /* (#R288) 「発令なし」 is drawn at the unit for these, and country-wide for the rest — the
           difference is a fact about this map, so it is counted rather than assumed */
        learned:Object.assign({},LEARNED),
        unitCountries:Object.keys(UNITS).filter(k=>UNITS[k]&&UNITS[k].length).sort(),
        unitCount:Object.keys(UNITS).reduce((n,k)=>n+((UNITS[k]||[]).length),0),
        quietDrawn:(function(){ try{ return quietFeatures().length; }catch(_){ return 0; } })(),
        countryGrey:(function(){ let n=0; try{ (HOST.countryGeo&&HOST.countryGeo.features||[]).forEach(f=>{
            if(washTier(String(f.id||''))===1) n++; }); }catch(_){} return n; })() });
      STATE.alertsLegend=(iso3)=>legendFor(String(iso3||'').toUpperCase());
      /* ══ (#R292) THE WARNINGS, AS RECORDS — for the widget board's Saved-place alerts / Viewport
         situation / Country watch cards. ⚠ THIS IS A READ OF `feats`, NOT A SECOND PIPELINE. The
         requirement those cards are built to («既存の警報フィードと同じ正規化済みデータを使用し、
         別の簡略処理を作らない») is only satisfiable if there is exactly one normalisation, and it
         is the one above: `norm` is the 0–4 severity every feed has already been mapped onto, `hzr`
         the hazard's own words, `at` the issuing time, `unit`/`name` the area it was issued for.
         Nothing is recomputed here and nothing is fetched; a caller that asks before the layer has
         ever been switched on gets an empty list and `on:false`, which is the truthful answer.
         `bbox` is memoised on the feature object so a per-frame caller does not re-walk geometry. */
      function _fBbox(f){
        if(f._bb) return f._bb;
        let w=180,s=90,e=-180,n=-90;
        const eat=(c)=>{ if(typeof c[0]==='number'){ if(c[0]<w)w=c[0]; if(c[0]>e)e=c[0]; if(c[1]<s)s=c[1]; if(c[1]>n)n=c[1]; } else c.forEach(eat); };
        try{ if(f.geometry&&f.geometry.coordinates) eat(f.geometry.coordinates); }catch(_){}
        f._bb=(e<w)?null:[w,s,e,n];
        return f._bb;
      }
      STATE.alertsQuery=(opt)=>{
        opt=opt||{};
        const out=[];
        const bb=opt.bbox&&opt.bbox.length===4?opt.bbox:null;
        const pt=(opt.lng!=null&&opt.lat!=null)?[+opt.lng,+opt.lat]:null;
        const pad=(opt.padDeg==null?0:+opt.padDeg);
        feats.forEach(f=>{
          const p=f.properties||{};
          if(!(p.norm>0)) return;                       /* 「発令なし」 is not an alert */
          if(opt.iso&&String(p.iso)!==String(opt.iso).toUpperCase()) return;
          const b=_fBbox(f);
          if(bb){ if(!b) return; if(b[2]<bb[0]||b[0]>bb[2]||b[3]<bb[1]||b[1]>bb[3]) return; }
          if(pt){ if(!b) return; if(pt[0]<b[0]-pad||pt[0]>b[2]+pad||pt[1]<b[1]-pad||pt[1]>b[3]+pad) return; }
          let at=0; try{ const t=Date.parse(p.at); if(isFinite(t)) at=t; }catch(_){}
          out.push({ iso:p.iso, feed:p.feed, unit:p.unit, place:String(p.name||''),
            level:Math.max(0,Math.min(4,p.norm|0)), kind:String(p.hzr||p.hz||''), at:at||null,
            colour:p.colA||p.colN||null, count:p.n|0, bbox:b });
        });
        out.sort((a,b2)=>(b2.level-a.level)||((b2.at||0)-(a.at||0)));
        return { on, at:lastAt, alerts:opt.limit?out.slice(0,opt.limit):out, total:out.length };
      };
      window.__wpAlerts={ toggle, refresh, ask:(iso)=>loadMA([String(iso||'').toUpperCase()]),
        /* (#R275) the tap's own answer, as a call — so a test can ask 「この地点で何が出ているか」
           without a pointer, and so Atlas can (standing rule: every feature is operable) */
        at:(lng,lat)=>alertsAt(+lng,+lat).map(f=>({ iso:f.properties.iso, feed:f.properties.feed,
          unit:f.properties.unit, name:f.properties.name, lv:f.properties.lv, norm:f.properties.norm,
          hazard:f.properties.hz })),
        openAt:(lng,lat)=>openPointCard(+lng,+lat,countryAt(+lng,+lat)),
        closeAt:closePointCard,
        swicMeta:()=>({ members:Object.keys(swicMeta.mid).length, wired:swicISO().slice().sort(),
          loaded:Object.keys(swicData).sort() }),
        grouped:(rows)=>grouped(rows), maCountries:()=>Object.keys(MA),
        setPalette:(m)=>{ mode=(m==='norm')?'norm':'agency'; try{ localStorage.setItem('im.alertPal',mode); }catch(_){}
          repaintMode(); if(on&&panel.shown()) overview(); return mode; },
        palette:()=>mode, shortHz,
        /* (#R277) what this table makes of one agency's word — so the classifier is testable
           without a map, and so an unlearned name can be FOUND rather than guessed at */
        hazard:(t)=>({ key:hazardKey(t), name:hazardLabel(t) }) };
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
        const j=await window.IntMapWx.guardedJSON(u,1800000); if(!j) throw new Error('marine');
        const arr=Array.isArray(j)?j:[j];
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
        const j=await window.IntMapWx.guardedJSON(u,1800000); if(!j) throw new Error('marine');
        const h=j.hourly||{};
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
      let on=false, crop='Wheat', variable='Harvested area', supply='Total', busy=false, drawKey='', lastMeta=null, srcGen=0;
      /* (#R254) 「作物の栽培に絵文字はいらない。」 — the panel title and the legend name carried a 🌾 that
         nothing else about this layer needs; the row in the layer list never had one. */
      const panel=makePanel('wp-crop-panel',()=>L('Crop cultivation','作物の栽培','Feldfrüchte','Сельхозкультуры','Cultivos'),'wp-dl-crops',
        { legendId:'wpcrop', layers:()=>[LYR],
          names:()=>(LA('Crop cultivation','作物の栽培','Feldfrüchte','Сельхозкультуры','Cultivos')) });
      /* ⚠ (#R241) this was `HOST.lang==='jp' ? r[1] : k` — thirty-one crop names in English on
         every language but Japanese, in a shape no instrument reads (the two-branch audit sees
         `jp ? 'literal' : 'literal'`, and both arms here are variables). */
      const cropName=(k)=>{ const r=CROPS.find(c=>c[0]===k); return r?L.arr(r):k; };
      const varName=(v)=>{ const r=VARS.find(x=>x[0]===v); return r?L.arr(r):v; };
      const supName=(s)=>{ const r=SUPPLY.find(x=>x[0]===s); return r?L.arr(r):s; };
      /* the reference years GAEZ publishes; the clock picks the nearer one and the panel says which */
      const gaezYear=()=>(nowYear()<2005?'2000':'2010');

      /* (#R255) the Web-Mercator half-extent, which is all the tile scheme needs. The lng/lat ↔ metre
         helpers this block used to carry went with the single stretched image they served — a tile's
         box comes from its own z/x/y (see tileBox), never from the viewport. */
      const R=6378137, HALF=Math.PI*R;

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

      /* ══ ⚠⚠⚠ (#R255) A MAP LAYER IS TILES. ONE STRETCHED PICTURE IS WHY IT WENT BLACK ═══════════════
         「作物を栽培をオンにしている際、挙動が非常に不安定。移動やズームですぐに描画がずれたり地図が黒に
           おかしくなる。」 — the third round on this layer's stability, and the first two treated the
         symptom because they accepted its shape. MEASURED on the shipped build, wheeling in over the
         sea north-east of Japan with the layer on (`x/cg-06`, `x/cg-07`):

             immediately after the wheel   the whole map is rgb ≈ (5,20,12) — SOLID BLACK
             2 s later                     still solid black
             10 s later                    correct

         and, jumping from a world view to z6 over India, `wp-crop-src.coordinates` stayed
         `[[-180,83]…[180,-58]]` — the WHOLE WORLD — for five seconds, drawing a 2048-px world raster
         across a 12°-wide viewport as ~50-px blocks (`x/crop-4-back.png`).

         Both pictures are the same defect, and it is structural. The layer was ONE `image` source
         covering a quadtree cell, re-fetched whenever the cell changed. Between the move and the new
         picture arriving, the old one is still there — geographically correct and at the WRONG SCALE.
         Magnify a world raster to a city and one source pixel covers the screen; when that pixel is
         at the top of the ramp (`#03230f`, rgb 3/35/15 — the near-black end) the screen is black. The
         reader is not looking at a slow layer, they are looking at one pixel.

         So it is a RASTER TILE SOURCE now, like every other raster in this app. MapLibre asks for the
         tiles that cover the view at the zoom it is at, keeps the parent tile only until the child
         arrives, and never stretches a z0 tile across a z14 screen. `maxzoom` is 5 because the GAEZ
         grid is 5 arc-minutes (~9 km) and a 512-px tile at z5 is 2.4 km/px — past that there is
         nothing further to ask for, so zooming in costs NO requests at all and the picture is the
         data's own resolution rather than a server-side resample of it.
         ⚠ The tile is fetched, recoloured and handed back as an ImageBitmap by a PROTOCOL handler —
         the same contract js/sat-proto.js uses (`scene.addProtocol`), so the renderer owns the
         scheduling, the abort on pan, the cache and the fade, and this file owns only the colours. */
      const CROP_PROTO='imapcrop';
      /* the ramp expanded once — 256 RGB entries, shared by every tile */
      const _lut=(()=>{ const lut=new Uint8Array(256*3);
        for(let i=0;i<256;i++){ const t=i/255; let a=CROP_RAMP[0], b=CROP_RAMP[CROP_RAMP.length-1];
          for(let k=0;k<CROP_RAMP.length-1;k++){ if(t>=CROP_RAMP[k][0]&&t<=CROP_RAMP[k+1][0]){ a=CROP_RAMP[k]; b=CROP_RAMP[k+1]; break; } }
          const f=(b[0]-a[0]>1e-9)?(t-a[0])/(b[0]-a[0]):0;
          const ca=parseInt(a[1].slice(1),16), cb=parseInt(b[1].slice(1),16);
          lut[i*3]=Math.round(((ca>>16)&255)*(1-f)+((cb>>16)&255)*f);
          lut[i*3+1]=Math.round(((ca>>8)&255)*(1-f)+((cb>>8)&255)*f);
          lut[i*3+2]=Math.round((ca&255)*(1-f)+(cb&255)*f); }
        return lut; })();
      /* grey → the ramp, with nothing drawn where there is no crop. Unchanged in what it decides:
         ⚠ (#R216) A DATA CELL IS OPAQUE — the value is the COLOUR, and the one opacity control the
         reader holds is `raster-opacity`. Baking `0.30+0.70·value` into the alpha channel is what
         made 「透明度100%が全然100%ではない」 true, and no-crop (grey 0) stays transparent because
         that is absence of data rather than a small value. */
      function recolorTile(src,N){
        const cv=document.createElement('canvas'); cv.width=N; cv.height=N;
        const ct=cv.getContext('2d',{willReadFrequently:true}); ct.drawImage(src,0,0,N,N);
        let d; try{ d=ct.getImageData(0,0,N,N); }catch(_){ return null; }
        const px=d.data;
        for(let i=0;i<px.length;i+=4){
          const g=px[i], al=px[i+3];
          if(al<8||g===0){ px[i+3]=0; continue; }
          px[i]=_lut[g*3]; px[i+1]=_lut[g*3+1]; px[i+2]=_lut[g*3+2];
          px[i+3]=255; }
        ct.putImageData(d,0,0);
        return cv; }

      /* the Web-Mercator extent of an XYZ tile, in metres — the scheme's own square, ±HALF on both axes */
      function tileBox(z,x,y){ const world=2*HALF, s=world/Math.pow(2,z);
        const x0=-HALF+x*s, y1=HALF-y*s; return [x0,y1-s,x0+s,y1]; }

      /* ══ (#R255) A TILE IS FETCHED FROM FAO ONCE PER SESSION ═════════════════════════════════════
         MapLibre evicts tiles from its own cache as the camera moves and asks for them again when it
         comes back; MEASURED over one scripted zoom-out / drag / zoom-in that is 930 requests to
         gaez-services for a few dozen distinct tiles. The RECOLOURED png is kept here instead —
         ~20-80 KB apiece, so 240 of them is single-digit megabytes and covers far more than a session
         ever revisits. A hit costs one `createImageBitmap` and no network at all.
         ⚠ Keyed by the RASTER as well as the tile: a different crop, measure, water supply or
         reference year is a different picture of the same square. */
      const _tiles=new Map(), _inflight=new Map(), TILE_CACHE_MAX=240;
      function _tileGet(k){ const v=_tiles.get(k); if(v){ _tiles.delete(k); _tiles.set(k,v); } return v; }
      function _tilePut(k,v){ _tiles.set(k,v); while(_tiles.size>TILE_CACHE_MAX) _tiles.delete(_tiles.keys().next().value); }
      const _toBlob=(cv)=>new Promise(res=>{ try{ cv.toBlob(b2=>res(b2||null),'image/png'); }catch(_){ res(null); } });
      let _protoOn=false, _protoWarned=false;
      function ensureProto(){ if(_protoOn) return true;
        try{
          /* ⚠ the renderer's AbortController is deliberately not taken — see the in-flight note below */
          const ok=GE().scene.addProtocol(CROP_PROTO, async (params)=>{
            const u=String((params&&params.url)||'');
            const m=/^imapcrop:\/\/(\d+)\/(\d+)\/(\d+)\?(.*)$/.exec(u);
            if(!m) throw new Error('bad imapcrop url');
            const z=+m[1], x=+m[2], y=+m[3], q=new URLSearchParams(m[4]);
            const oid=q.get('oid'), mn=+q.get('mn'), mx=+q.get('mx'), N=+q.get('n')||512;
            const ck=oid+'|'+N+'|'+z+'/'+x+'/'+y;
            const hit=_tileGet(ck);
            if(hit) return { data: await createImageBitmap(hit) };
            /* ⚠ (#R255) ONE FETCH PER TILE, AND IT IS NOT ABORTED. MEASURED before this: 98 requests
               to FAO during one settle for **11 distinct tiles** — the renderer asks for the same
               square from several places at once and cancels freely as the camera moves, and every
               cancelled request is work already done that is then done again. The whole source is at
               most 341 tiles (z0–z4), so letting an in-flight one finish and land in the cache is
               strictly less traffic than cancelling it and asking again. Concurrent askers share the
               one promise. */
            const flight=_inflight.get(ck);
            if(flight) return { data: await createImageBitmap(await flight) };
            const [x0,y0,x1,y1]=tileBox(z,x,y);
            const mr=encodeURIComponent(JSON.stringify({mosaicMethod:'esriMosaicNone',where:'OBJECTID='+oid}));
            const rr=encodeURIComponent(JSON.stringify({rasterFunction:'Stretch',rasterFunctionArguments:{
              StretchType:5, Statistics:[[mn,mx,(mn+mx)/2,1]], DRA:false, UseGamma:false, Min:0, Max:255 }}));
            const url=GAEZ+'/exportImage?bbox='+[x0,y0,x1,y1].join(',')+'&bboxSR=3857&imageSR=3857&size='+N+','+N
              +'&format=png32&f=image&interpolation=RSP_NearestNeighbor&mosaicRule='+mr+'&renderingRule='+rr;
            const job=(async()=>{
              const r=await fetch(url);
              if(!r.ok) throw new Error('gaez tile '+r.status);
              const bmp=await createImageBitmap(await r.blob());
              const cv=recolorTile(bmp,N);
              try{ bmp.close&&bmp.close(); }catch(_){}
              if(!cv) throw new Error('canvas');
              const out=await _toBlob(cv);
              if(out) _tilePut(ck,out);
              return out;
            })();
            _inflight.set(ck,job);
            let out=null;
            try{ out=await job; } finally { _inflight.delete(ck); }
            if(!out) throw new Error('canvas');
            return { data: await createImageBitmap(out) };
          });
          _protoOn=!!ok;
        }catch(e){ if(!_protoWarned){ _protoWarned=true; try{ console.warn('crop tile protocol could not be registered',e); }catch(_){} } }
        return _protoOn; }

      /* ⚠ (#R219) A CACHED REJECTION IS A LAYER THAT NEVER WORKS AGAIN — see catalog()/statsFor()
         above; both forget a rejection. What used to also be needed here (releasing a latched
         `drawKey` on failure) has no equivalent any more: a tile that fails is retried by the
         renderer when it is next needed, and one failed tile is one blank square rather than a layer
         that never draws again. */

      /* ══ (#R255) BUILD / REBUILD THE SOURCE ═════════════════════════════════════════════════════════
         The raster IDENTITY is (crop, variable, supply, year). When it changes the source is replaced,
         which is also what discards every tile of the previous crop — there is no per-view key to
         latch and nothing to go stale, so #R254's `_dirty`/`_dirtyForce` bookkeeping and the whole
         `moveend` → refetch path are gone with the defect they were compensating for. */
      /* ⚠ (#R255) `maxzoom` IS SET BY THE DATA, NOT BY THE SCREEN. GAEZ is a 5-arcminute grid (~9 km);
         a 512-px tile at z4 is 0.044°/px = 2.6 arcmin, already twice as fine as anything the raster
         can say. Asking for z5 or deeper would be four times the requests for pixels FAO would have
         to invent, so the source stops here and the renderer overzooms — which is the honest picture
         of a 9 km cell and, unlike #R254's single stretched image, is the RIGHT cell for the place. */
      const TILE_N=512, TILE_MAXZ=4;
      async function paint(force){
        if(!on) return;
        const yr=gaezYear();
        const key=[crop,variable,supply,yr].join('|');
        if(!force&&key===drawKey&&GE().layers.hasSource(IMG)) return;
        if(!ensureProto()){ stat('⚠ '+L('This crop layer could not start.','この作物レイヤーを開始できませんでした。','Diese Ebene konnte nicht starten.','Не удалось запустить слой.','No se pudo iniciar esta capa.')); return; }
        drawKey=key; busy=true; stat('');
        const gen=++srcGen;
        try{
          const cat=await catalog();
          const rec=cat[[crop,yr,variable,supply].join('|')];
          if(!rec) throw new Error('no such raster');
          const st=await statsFor(rec.OBJECTID);
          if(gen!==srcGen||!on){ busy=false; return; }
          lastMeta={ st, units:rec.units, year:yr, oid:rec.OBJECTID };
          const tiles=[CROP_PROTO+'://{z}/{x}/{y}?oid='+encodeURIComponent(rec.OBJECTID)
            +'&mn='+encodeURIComponent(st.min)+'&mx='+encodeURIComponent(st.max)+'&n='+TILE_N];
          whenDrawable(()=>{ try{
            if(gen!==srcGen||!on) return;
            clearImg(true);
            GE().layers.addSource(IMG,{type:'raster',tiles,tileSize:TILE_N,minzoom:0,maxzoom:TILE_MAXZ,
              attribution:'FAO GAEZ v4'});
            GE().layers.add({id:LYR,type:'raster',source:IMG,
              paint:{'raster-opacity':0.85,'raster-fade-duration':180,'raster-resampling':'nearest'}},
              GE().layers.has('tool-poly')?'tool-poly':undefined);
            panel.claim(); setVis([LYR],on);
          }catch(_){} });
          render();
        }catch(e){ console.warn('crops',e);
          drawKey='';
          stat('⚠ '+L('This crop and variable could not be fetched from GAEZ — it will be tried again when the map moves.','この作物・指標を GAEZ から取得できませんでした（地図を動かすと再試行します）。','Nicht abrufbar — beim nächsten Verschieben wird es erneut versucht.','Не удалось получить — повторим при перемещении карты.','No se pudo obtener; se reintentará al mover el mapa.')); }
        busy=false; }

      function clearImg(keepKey){ try{ if(GE().layers.has(LYR)) GE().layers.remove(LYR); }catch(_){}
        try{ if(GE().layers.hasSource(IMG)) GE().layers.removeSource(IMG); }catch(_){} if(!keepKey) drawKey=''; }

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
          /* (#R258) 「凡例に書いてある注意書きが長すぎ。せめて隠すとかしろ。」 — folded, see noteBlock() */
          +noteBlock(
           L('Source: FAO GAEZ v4, theme «Area, Yield and Production» — a 5-arcminute grid of where each crop is actually grown, for the reference years 2000 and 2010 (the clock picks the nearer one; this view is '+(lastMeta?lastMeta.year:'2010')+'). The color scale is fixed to this raster’s own measured minimum and maximum, so the same color means the same number wherever you pan. Tap the map for the value in that cell.',
             '出典: FAO GAEZ v4「面積・収量・生産量」——各作物が実際に栽培されている場所の5分メッシュ格子（基準年 2000 / 2010。時計が近い方を選びます。現在の表示は '+(lastMeta?lastMeta.year:'2010')+' 年）。色階はこのラスタ自身の実測の最小・最大に固定してあるので、同じ色はどこへ動かしても同じ値です。地図をタップするとそのセルの値が出ます。',
             'Quelle: FAO GAEZ v4 («Fläche, Ertrag, Produktion»), 5-Bogenminuten-Raster, Referenzjahre 2000/2010.',
             'Источник: FAO GAEZ v4 («Площадь, урожайность, производство»), сетка 5′, 2000/2010.',
             'Fuente: FAO GAEZ v4 («Superficie, rendimiento y producción»), malla de 5′, años 2000/2010.')));
        /* (#R270) GAEZ publishes two reference years and `gaezYear()` picks the nearer one, so the
           year that matters here is the CLOCK's — the panel's own note already prints which raster
           that resolved to. */
        panel.clockYear({min:1961,max:2024});
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
      /* ══ ⚠⚠⚠ (#R258) THE LAYER WAS RESTYLING ITSELF, AT ABOUT 9 Hz ═══════════════════════════════
         「作物を栽培は激しく点滅する。」 MEASURED on the shipped build with the layer on and the camera
         perfectly still: **88 remove/addSource/add cycles in 10 s**, and `styledata` fires **28 times
         in 3 s with this layer on and 0 times with it off**. It is a closed loop, and this line was
         both halves of it:

             paint() removes the source and adds it again  →  the renderer fires `styledata`
             onRestyle clears `drawKey` and calls paint(true)  →  paint() removes and adds again …

         With `raster-fade-duration:180` the picture never finishes fading in before it is torn down,
         which is exactly 「激しく点滅」. Every other pack survives its own `styledata` because their
         handlers call `ensureLayers()`, which returns without touching the style when the layer is
         already there; only this one unconditionally rebuilt.
         ⚠ THE #R72 REPAIR IS THE POINT OF THE HANDLER AND IT STAYS. A basemap swap really does drop
         every added layer — so the rebuild still runs, but only when the layer is actually GONE,
         which is the condition #R72 was about. A restyle that left the layer standing is not a
         reason to redraw it. */
      onRestyle(()=>{ if(!on) return;
        try{ if(GE().layers.has(LYR)&&GE().layers.hasSource(IMG)) return; }catch(_){}
        drawKey=''; whenDrawable(()=>paint(true)); });
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
        if(t&&t.on) o.t={d:t.dir,s:t.section,n:t.topN,i:t.iso||'',a:t.arrows?1:0};   /* (#R254) +arrows */
        if(e&&e.on) o.e={k:e.kind,i:e.iso||''};
        if(c&&c.on) o.c=[c.crop,c.variable,c.supply];
        return Object.keys(o).length?o:null; },
      set(v){ if(!v||typeof v!=='object') return;
        try{ if(v.c&&STATE.cropSet) STATE.cropSet.apply(null,[].concat(v.c)); }catch(_){}
        try{ if(v.e&&v.e.k&&STATE.energyKind) STATE.energyKind(v.e.k); }catch(_){}
        try{ if(v.t&&STATE.tradeLoad&&v.t.i) STATE.tradeLoad(v.t.i,{dir:v.t.d,section:v.t.s,topN:v.t.n,arrows:(v.t.a==null?null:!!+v.t.a)}); }catch(_){}
        try{ if(v.e&&STATE.energyShow&&v.e.i) STATE.energyShow(v.e.i,v.e.k); }catch(_){} } }); }catch(_){}

    /* ══ (#R213) THE TOOLKIT, PUBLISHED ONCE ═════════════════════════════════════════════════════
       js/industry-web.js is a sixth layer of exactly this family — a row under the same heading, a
       floating panel whose × unchecks that row, the same clock and the same money formatting. It is
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
