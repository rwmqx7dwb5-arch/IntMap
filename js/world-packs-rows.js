/* ============================================================================
 *  IntMap · World data packs — THE ROWS AND THE TOOLKIT  (#R211, split at startup-lazy-layers)
 * ----------------------------------------------------------------------------
 *  Everything of the World-data family that has to exist AT BOOT: the heading and the five rows
 *  (trade, energy, warnings, tides, crops) in the Layers registry, the share-link state for their
 *  choices, and the toolkit (panel, row, clock, money formatting, country geometry) that
 *  js/industry-web.js, js/ocean-currents.js and js/outbreaks.js read through the `_ui` toolkit on window.IntMapWorld
 *  when THEY boot. The five layers themselves — 6,300 lines, 290 kB of the entry chunk measured before
 *  the split — are js/world-packs.js, fetched through js/lazy-modules.js (`worldPacksBody`) the first
 *  time a row is switched on or a share link carries one of their choices.
 *
 *  ⚠ THE SPLIT IS THE ONE js/war-fronts.js MADE (#R409): keep what registers something at boot,
 *  defer the body. A row that appeared only after its body had been fetched would not be a row — the
 *  manifest (js/layer-manifest.js), the session restore and Atlas's catalogue all find a layer by its
 *  row. The factory keeps its name (`worldPacks`) so js/app-body.js and the boot guard in src/main.js
 *  are unchanged.
 * ==========================================================================*/
/* (startup-lazy-layers) the eager-row / lazy-body rule, once */
import { lazyBody, lazyRowFailed } from './lazy-modules.js';
import { IntMapTime } from './chronos.js';
import { IntMapGeoEngine } from './geo-engine.js';
import { IntMapLang } from './lang-registry.js';
import * as bus from './bus.js';

export function worldPacks(HOST){
  const GE=()=>IntMapGeoEngine;
  function _imCanDraw(){ try{ return !!HOST.canDraw(); }catch(_){ try{ return !!GE().ready(); }catch(__){ return false; } } }

  window.IntMapWorld=(function(){
    if(!GE().hasRenderer()) return { state:()=>({}) };
    const L=IntMapLang.pick(()=>HOST.lang);
    /* ⚠ (#R241) the ARRAY form — see `pickArgs` in js/lang-registry.js. Five tables in this file
       held their translations as a bare tuple and subscripted it with a PRIVATE language→position
       map (`{jp:1,de:2,ru:3,es:4}`). That map is a second copy of the language order, it names a
       fixed set of languages, and an array literal is not a call — so every trade section, crop,
       GAEZ variable and panel title here was English on fr/ko/zh while every instrument read
       100 %. scripts/i18n-positional-array-audit.mjs found them and fails if the shape returns. */
    const LA=IntMapLang.pickArgs();
    const D=Math.PI/180;
    const esc=(s)=>window.IntMapSafe.html(s);

    /* ── the year every layer here reads ──────────────────────────────────────────────────────────
       ONE clock (#R94 standing rule: window.IntMapTime is the master). A layer that needs a year
       asks for it here and re-fetches when the kernel says the time moved, so 「タイムマシン対応」 is
       one subscription rather than five. */
    function nowYear(){ try{
      const d=IntMapTime.when(); const y=d.getUTCFullYear();
      return isFinite(y)?y:new Date().getUTCFullYear(); }catch(_){ return new Date().getUTCFullYear(); } }
    const _timeSubs=[];
    try{ IntMapTime.on(()=>{ _timeSubs.forEach(f=>{ try{ f(nowYear()); }catch(_){} }); }); }catch(_){}
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
      /* ⚠ (#R650) A MISS IS NOT CACHED. `hiResCountries()` swaps the collection for the detailed
         set, so a unit the 110 m stand-in does not carry can appear later — and this line used to
         freeze the first «no» for the session, which meant a layer that asked early drew that
         country never. A hit is still cached; only ignorance is re-asked. */
      const f=g.features.find(x=>String(x.id)===String(iso3)); if(!f||!f.geometry) return null;
      const polys=(f.geometry.type==='Polygon')?[f.geometry.coordinates]:(f.geometry.type==='MultiPolygon'?f.geometry.coordinates:[]);
      let best=null, bestA=-1;
      polys.forEach(p=>{ const r=p&&p[0]; if(!r||r.length<4) return; const a=ringArea(r); if(a>bestA){ bestA=a; best=r; } });
      return (_cent[iso3]=best?ringCentroid(best):null); }
    function ptInRing(pt,ring){ let inside=false;
      for(let i=0,j=ring.length-1;i<ring.length;j=i++){
        const xi=ring[i][0], yi=ring[i][1], xj=ring[j][0], yj=ring[j][1];
        if(((yi>pt[1])!==(yj>pt[1]))&&(pt[0]<(xj-xi)*(pt[1]-yi)/((yj-yi)||1e-15)+xi)) inside=!inside; }
      return inside; }
    /* ══ ⚠⚠⚠ (#R297) A BOX BEFORE A RING ═══════════════════════════════════════════════════════
       MEASURED with a CPU profile of the deployed build, 50 s with the warnings layer on:
       **`ptInRing` ← `countryAt` ← `learnCoverage` ← `publishNow` = 5,562 ms**, i.e. one ninth of
       all the JavaScript the page ran. This walked EVERY ring of EVERY country until it found a
       hit — and `hiResCountries()` swaps the outlines for the detailed set the moment the layer is
       switched on, so each of those rings is thousands of vertices.
       A bounding box rejects almost all of them in four comparisons. The boxes are built once per
       country collection and rebuilt when the collection itself is swapped (the hi-res upgrade is
       exactly that), which is why the source object's identity is the key rather than a flag.
       ⚠ THE ANSWER IS UNCHANGED: a box is a superset of the shape, so nothing a ring would have
       matched is skipped. #R290 made this callable once per unit; this makes the call cheap. */
    let _cBoxes=null, _cBoxSrc=null;
    function countryBoxes(){
      const g=HOST.countryGeo; if(!g||!g.features) return null;
      if(_cBoxes&&_cBoxSrc===g) return _cBoxes;
      const out=[];
      g.features.forEach(f=>{ const gm=f.geometry; if(!gm) return;
        let w=180,e=-180,s2=90,n=-90;
        const walk=(a)=>{ if(typeof a[0]==='number'){ if(a[0]<w)w=a[0]; if(a[0]>e)e=a[0]; if(a[1]<s2)s2=a[1]; if(a[1]>n)n=a[1]; return; }
          for(let i=0;i<a.length;i++) walk(a[i]); };
        try{ walk(gm.coordinates); }catch(_){ return; }
        out.push({f:f,id:String(f.id),b:[w,s2,e,n]}); });
      _cBoxSrc=g; return (_cBoxes=out); }
    function _inCountry(rec,lng,lat){
      const b=rec.b; if(lng<b[0]||lng>b[2]||lat<b[1]||lat>b[3]) return false;
      const gm=rec.f.geometry;
      const polys=(gm.type==='Polygon')?[gm.coordinates]:(gm.type==='MultiPolygon'?gm.coordinates:[]);
      for(const p of polys){ if(!p||!p[0]) continue;
        if(!ptInRing([lng,lat],p[0])) continue;
        let hole=false; for(let h=1;h<p.length;h++) if(ptInRing([lng,lat],p[h])){ hole=true; break; }
        if(!hole) return true; }
      return false; }
    function countryAt(lng,lat){
      const list=countryBoxes(); if(!list) return null;
      for(let i=0;i<list.length;i++) if(_inCountry(list[i],lng,lat)) return list[i].id;
      return null; }
    /* (#R297) …and the only caller that runs thousands of times asks a narrower question: 「is this
       point in a country NOBODY covers」. `pred` is given the iso so the caller can skip the 150-odd
       countries whose answer it would throw away. */
    function countryAtWhere(lng,lat,pred){
      const list=countryBoxes(); if(!list) return null;
      for(let i=0;i<list.length;i++){ const r=list[i];
        if(pred&&!pred(r.id)) continue;
        if(_inCountry(r,lng,lat)) return r.id; }
      return null; }
    function countryName(iso3){
      try{ const s=HOST.countryStats&&HOST.countryStats[iso3]; if(s) return HOST.cName(s); }catch(_){}
      try{ const f=HOST.countryGeo.features.find(x=>String(x.id)===String(iso3));
        const p=f&&f.properties; if(p) return p.NAME||p.name||p.ADMIN||iso3; }catch(_){}
      return iso3; }
    let _cgReady=null;
    function withCountryGeo(){ if(!_cgReady) _cgReady=Promise.resolve().then(()=>HOST.loadCountryData()).catch(()=>{}); return _cgReady; }
    /* the `countries` SOURCE (for feature-state choropleths) — the same wait js/data-layers.js does */
    /* ⚠ (restored-layers-under-load) answered by the two facts it waits on, not by 200 polls of 200 ms: the
       country collection (the latched loadCountryData — when it settles, HOST.countryGeo either holds the
       collection or the load failed, and nothing later fills it in) and the renderer being able to take a
       source (GE().whenCanDraw()). The poll gave up after 200 tries and resolved `false` exactly like a
       failed load, so a page busy for longer than the tries lasted lost the choropleths silently.
       Resolves true once the `countries` source exists; false only when the collection did NOT arrive
       (an observed failure, which js/countries-ui.js reports) or the renderer refused the add. */
    function withCountrySource(){ return withCountryGeo().then(()=>{
      const has=()=>{ try{ return !!(GE().layers.hasSource('countries')&&HOST.countryGeo); }catch(_){ return false; } };
      if(has()) return true;
      if(!HOST.countryGeo) return false;
      const add=()=>{ try{ if(!GE().layers.hasSource('countries')) HOST.addCountryLayers(); }catch(e){ console.warn('worldPacks: countries source',e); } return has(); };
      if(_imCanDraw()) return add();
      return GE().whenCanDraw().then(add); }); }
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
      /* ══ ⚠⚠ (#R499) THE SAME PANEL, WRITTEN AGAIN, DOES NOT MOVE THE LEGEND COLUMN ═════════════
         `open()` is the panel's ONLY renderer, and every automatic re-render goes through it —
         a feed landing, a feed failing, a publish, a language change. It re-registers the legend's
         opacity targets and re-tiles EVERY legend on the map, and `_registerLayerOpacity` ends with
         a `tileLegends()` of its own, so one call is TWO full re-layouts of the legend column.
         MEASURED (scripts/mobile-trace.mjs --attribute, phone profile, warnings on): those two lines
         were **6,090 of the 6,224 `getBoundingClientRect` calls** in one eight-second finger pan.
         The loop that produced them is fixed where it lives (the ⚠ box by RETRY_MS); this is the
         second half of the same answer — the guard #R311 put on the map tooltip's markup, here.
         ⚠ THE KEY NAMES EVERY INPUT THOSE TWO CALLS USE: the body, the layer ids (they arrive late
         for raster families) and the localized names (a language change must re-register).
         ⚠⚠ AND THE BODY IS STILL REWRITTEN, WHICH IS THE HALF THAT ALMOST GOT WRITTEN WRONG.
         Returning early from an identical open() looks strictly better and is not: `wireControls`
         attaches its handlers with `addEventListener`, and the only reason that has never leaked is
         that `b.innerHTML=` REPLACED the buttons on every render. Hand the same nodes back and every
         automatic re-render stacks another click listener on them. So the skip covers exactly the
         two calls that cost the frame — re-registering identical opacity targets, and re-placing
         legends that have not moved — and nothing a caller can observe. */
      let _openKey=null, _openEl=null;
      const P={
        get el(){ return legend(); },
        open(bodyHTML){
          let el=null, same=false, key=null;
          _want=true;
          try{
            const cur=legend();
            key=String(bodyHTML)+' '+layers().join(',')+' '+names().join('');
            same=!!(cur&&cur===_openEl&&key===_openKey&&cur.style.display==='block'&&cur.querySelector('.wp-body'));
          }catch(_){ same=false; key=null; }
          if(!same){ try{ el=window._registerLayerOpacity&&window._registerLayerOpacity(LID,names(),layers(),cbId); }catch(_){} }
          if(!el) el=legend();
          if(!el) return null;
          if(el.style.display!=='block') el.style.display='block';
          el.classList.add('wp-legend');
          let b=el.querySelector('.wp-body');
          if(!b){ b=document.createElement('div'); b.className='wp-body';
            const h=el.querySelector('h4');
            if(h&&h.parentNode===el) el.insertBefore(b,h.nextSibling); else el.appendChild(b); }
          b.innerHTML=bodyHTML;
          if(el.classList.contains('legend-collapsed')) b.style.display='none';
          try{ window._ensureLegendMinimize&&window._ensureLegendMinimize(el); }catch(_){}
          if(!same){ try{ window._tileLegends&&window._tileLegends(); }catch(_){} }
          _openKey=key; _openEl=el;   /* (#R499) the element the key belongs to — a rebuilt legend is a new box */
          return b; },
        body(){ const el=legend(); return el?el.querySelector('.wp-body'):null; },
        /* re-register the ids once the layers actually exist (raster families build theirs late).
           ⚠ never a way to re-open a box the user closed — see the note on `_want` above. */
        claim(){ try{ window._registerLayerOpacity&&window._registerLayerOpacity(LID,names(),layers(),cbId); }catch(_){}
          if(!_want){ _openKey=null; _openEl=null;   /* (#R499) */
            const el=legend(); if(el) el.style.display='none';
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
        hide(){ _want=false; _openKey=null; _openEl=null;   /* (#R499) a closed panel is not "already showing this" */
          try{ window._hideGenericLegend&&window._hideGenericLegend(LID); }catch(_){}
          const el=legend(); if(el) el.style.display='none'; },
        shown(){ const el=legend(); return !!(el&&el.style.display!=='none'&&el.style.display!==''); },
        /* (restored-layers-under-load) an OBSERVED failure on the way to drawing — said on the row and to Atlas
           through js/layer-state.js, the one owner of that fact, instead of a draw that is silently dropped */
        failed(reason,message){ try{ window.IntMapLayerState&&window.IntMapLayerState.report(cbId,'failed',{ reason, message }); }catch(_){} } };
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
    /* ⚠ (restored-layers-under-load) THE WAIT IS FOR THE EVENT, NOT FOR A NUMBER OF TRIES. This was 80 polls
       of 250 ms and then silence — on a page whose main thread was taken (all layers restored at once, CI
       measured timers 20 s late) the 80 tries were spent before the style was parsed and the draw was
       dropped with nothing left to retry. `GE().whenCanDraw()` resolves on the renderer's own styledata /
       load / idle the moment canDraw() is true, and never before (js/geo-engine.js) — the same door
       js/layer-rows.js holds every restored change behind. */
    function whenDrawable(fn){
      const run=()=>{ try{ fn(); }catch(e){ console.warn('worldPacks draw',e); } };
      if(_imCanDraw()){ run(); return; }
      try{ GE().whenCanDraw().then(run); }catch(e){ console.warn('worldPacks draw: no renderer to wait for',e); } }
    /* ══ ⚠⚠⚠ (#R297) `styledata` IS NOT 「THE BASEMAP CHANGED」 — IT IS 「ANYTHING CHANGED」 ═══════
       「警報レイヤーが重すぎる。品質保ったまま爆速にしろ。」 MEASURED with a control on the deployed
       build (z4 over Europe, 60 s): the map ran at **3.4 fps** with this layer on against **36.5 fps**
       with nothing on, and 78 seconds produced **62** whole-collection uploads and **9,990**
       feature-state writes. None of the coalescing added this round moved those numbers, which is
       the clue: the uploads were not coming through `publish()` at all.
       MapLibre fires `styledata` for EVERY style mutation — `addLayer`, `setPaint`, `setLayout` and
       **`setSourceData`** included, not only for a `setStyle()`. This handler existed for the ONE
       case a basemap swap creates (the style drops every layer this file added, and #R72 records
       what happens when nothing puts them back), and it ran on all of them. So one publish fired
       `styledata`, which 80 ms later re-uploaded the same collection, forced a full quiet upload
       and forced a repaint of all 258 countries — and that re-upload fired `styledata` again.
       **A publish therefore did not settle; it oscillated,** at whatever rate the browser could
       re-tile four thousand polygons.
       Two things stop it, and both are needed:
         · the dispatcher COALESCES, so a burst of mutations is one pass rather than one each;
         · a pack's recovery must be able to tell 「my layers are gone」 from 「something changed」.
           `ensureLayers()` already clears the content signature when it has to create a fresh
           source (#R290), so `featsSig===''` IS that signal — the recovery re-uploads only then.
       ⚠ THE RECOVERY ITSELF IS UNCHANGED. A real basemap swap still re-adds every layer, re-uploads
       every collection and re-asserts every feature state; what is gone is doing it when nothing
       was dropped. */
    const _restyle=[];
    const onRestyle=(fn)=>_restyle.push(fn);
    let _reT=0;
    try{ GE().events.on('styledata',()=>{ if(_reT) return;
      _reT=setTimeout(()=>{ _reT=0; _restyle.forEach(f=>{ try{ f(); }catch(_){} }); },400); }); }catch(_){}

    /* ⚠ (#R210) A MAP-LEVEL CLICK HANDLER MUST CLAIM AND MUST ASK. Every family below hit-tests the
       country polygons itself, so it appears in no layer registry — exactly the class of owner that
       #R210 found stealing the place-label tap. It claims the DOM event when it consumes one, and
       does nothing when somebody else already has. */
    function mapClick(fn){ GE().events.on('click',e=>{
      try{ if(GE().events.clickClaimed&&GE().events.clickClaimed(e)) return; }catch(_){}
      const used=fn(e); if(used){ try{ GE().events.claimClick&&GE().events.claimClick(e); }catch(_){} } }); }

    const STATE={};

    /* ── the six rows ─────────────────────────────────────────────────────────────────────────── */
    const LBL={
      trade:LA('Trade flows','貿易フロー','Handelsströme','Торговые потоки','Flujos comerciales'),
      /* (#R212) one row for both questions — the switch is inside the window (see §2) */
      energy:LA('Energy mix (electricity / primary)','エネルギー構成（電力・一次）','Energiemix (Strom / primär)','Энергобаланс (электро / первичная)','Mezcla energética (eléctrica / primaria)'),
      alerts:LA('Weather & disaster warnings','気象・災害警報','Wetter- und Katastrophenwarnungen','Метеопредупреждения','Avisos meteorológicos'),
      tides:LA('Tides','潮汐（満潮・干潮）','Gezeiten','Приливы','Mareas'),
      crops:LA('Crop cultivation','作物の栽培','Feldfrüchte','Сельхозкультуры','Cultivos')};
    const lbl=(k)=>L.arr(LBL[k]);
    /* ══ (startup-lazy-layers) THE ROW IS HERE; WHAT IT SWITCHES ARRIVES WHEN IT IS FIRST SWITCHED ══════
       The five layers are js/world-packs.js, fetched through js/lazy-modules.js (`worldPacksBody`) the
       first time a row goes on or a share link carries one of their choices. Each layer publishes its
       entry point as window.__wp<Name> exactly as before, so a row asks the body for the SAME object
       the eager file used to hand it. The order, the synchronous path once the body is here, and the
       failure path are js/lazy-modules.js's `lazyBody` / `lazyRowFailed` — one rule for every row
       module that defers its body. */
    const BODY={ trade:'__wpTrade', energy:'__wpEnergy', alerts:'__wpAlerts', tides:'__wpTides', crops:'__wpCrops' };
    const DOOR=lazyBody(()=>window.IntMapLazy.need('worldPacksBody'));
    function viaBody(k,want,cb){
      if(!want&&!DOOR.asked()) return;
      DOOR.run((ok)=>{
        const E=window[BODY[k]];
        if(!ok||!E){ if(want) lazyRowFailed(HOST,cb); return; }
        try{ E.toggle(want); }catch(err){ console.warn('worldPacks toggle',k,err); } });
    }
    function buildUI(){ const dd=ensureHead(); if(!dd) return;
      const H=[['trade','#ff9f0a'],['energy','#b455ff'],['alerts','#ff3b30'],['tides','#29b6f6'],['crops','#fe9929']];
      H.forEach(([k,sw])=>{ const cb=row(dd,'wp-dl-'+k,lbl(k),sw); if(!cb||cb.__wpWired) return; cb.__wpWired=true;
        cb.addEventListener('change',e=>{ const r=e.target.closest('.lyr-row'); if(r) r.classList.toggle('on',e.target.checked);
          viaBody(k,e.target.checked,e.target); });
        /* (startup-lazy-layers) a pointer on the row is the reader reaching for it: start the body now,
           so the tick finds it here. MEASURED first-switch latency without this — 129–191 ms desktop,
           1.3 s on fast-4G with the CPU ÷4 (the chunk itself 0.52 s of it, 67.5 kB gzip). `hint` is the
           loader's own preload (js/lazy-modules.js): the same promise the click then waits on, and a
           failed preload never blocks the click. */
        const lr=cb.closest('.lyr-row');
        if(lr){ const pre=()=>{ try{ window.IntMapLazy.hint('worldPacksBody'); }catch(_){} };
          lr.addEventListener('pointerenter',pre,{once:true,passive:true}); lr.addEventListener('pointerdown',pre,{once:true,passive:true}); } }); }
    if(document.readyState!=='loading') setTimeout(buildUI,0); else document.addEventListener('DOMContentLoaded',buildUI);
    function relabel(){ const h=document.getElementById('wp-head');
      if(h) h.textContent=L('World data','世界のデータ','Weltdaten','Мировые данные','Datos mundiales');
      Object.keys(LBL).forEach(k=>{ const e=document.getElementById('wp-dl-'+k+'-lbl'); if(e) e.textContent=lbl(k); }); }
    bus.on('intmap-lang',()=>setTimeout(relabel,20));

    /* (#R211) these five layers carry CHOICES (direction, commodity, crop, country), and a share
       link that reproduced the layer but not the choice would open on a different answer. The layer
       checkboxes themselves travel in the `l=` list already; this is only what they are set to.
       (startup-lazy-layers) `get` reads STATE, which is empty until the body has arrived — and a body
       that never arrived has no layer on, so «nothing to carry» is the true answer. `set` fetches the
       body first: a link that carries a choice is a link that is about to switch its layer on. */
    try{ window.IntMapShareState&&window.IntMapShareState.register('world',{
      get(){ const o={}, t=STATE.trade&&STATE.trade(), e=STATE.energy&&STATE.energy(), c=STATE.crops&&STATE.crops();
        if(t&&t.on) o.t={d:t.dir,s:t.section,n:t.topN,i:t.iso||'',a:t.arrows?1:0};   /* (#R254) +arrows */
        if(e&&e.on) o.e={k:e.kind,i:e.iso||''};
        if(c&&c.on) o.c=[c.crop,c.variable,c.supply];
        return Object.keys(o).length?o:null; },
      set(v){ if(!v||typeof v!=='object') return;
        DOOR.run((ok)=>{ if(!ok) return;
          try{ if(v.c&&STATE.cropSet) STATE.cropSet.apply(null,[].concat(v.c)); }catch(_){}
          try{ if(v.e&&v.e.k&&STATE.energyKind) STATE.energyKind(v.e.k); }catch(_){}
          try{ if(v.t&&STATE.tradeLoad&&v.t.i) STATE.tradeLoad(v.t.i,{dir:v.t.d,section:v.t.s,topN:v.t.n,arrows:(v.t.a==null?null:!!+v.t.a)}); }catch(_){}
          try{ if(v.e&&STATE.energyShow&&v.e.i) STATE.energyShow(v.e.i,v.e.k); }catch(_){} }); } }); }catch(_){}

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
    /* (#R650) …and `centroidOf`, because js/outbreaks.js anchors a WHO Disease Outbreak News item
       to the country WHO tagged it with, which is the same question the trade layer asks of the same
       countryGeo in js/world-packs.js (`const home=centroidOf(iso)`). Writing it again there
       would be the second copy of the ring-area centroid in the project and the second place a
       country's map position is decided — the exact duplication the paragraph above exists to stop. */
    const _ui={ makePanel, uncheckRow, ensureHead, row, esc, usdShort, usdExact, nowYear, onYear, whenDrawable, setVis, onRestyle, centroidOf, withCountryGeo, hiResCountries, L };
    /* (startup-lazy-layers) `_kit` is `_ui` plus what only the five layers of THIS file read — the
       formatting, the country geometry, the panel styles, the click claim and STATE, the object each
       layer hangs its entry points on. js/world-packs.js destructures it; nothing else reads it. */
    const _kit=Object.assign({ BTN, D, LBL, ROW, SEL, STATE, countryAt, countryAtWhere, countryName, greatCircle,
      mapClick, noteBlock, owid, owidRange, pct, ptInRing, rampLegend, relabel, withCountrySource }, _ui);
    return Object.assign({ _ui, _kit, ready:DOOR.need, state:()=>({ trade:STATE.trade&&STATE.trade(), energy:STATE.energy&&STATE.energy(),
      alerts:STATE.alerts&&STATE.alerts(), tides:STATE.tides&&STATE.tides(), crops:STATE.crops&&STATE.crops(),
      year:nowYear() }) }, STATE);
  })();
}
