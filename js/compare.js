/* ============================================================================
 *  IntMap · Side-by-side / swipe map comparison — IntMapCompare  (#R163)
 * ----------------------------------------------------------------------------
 *  A second synchronised MapLibre instance for comparing base maps and raster layers,
 *  with sync / swipe / x-ray modes and four-corner resizing.
 *
 *  Moved verbatim out of index.html's DOMContentLoaded closure (#R163). The values it used
 *  to inherit from that closure are now passed in explicitly — see Architecture.md §3.1.
 *   Reassigned at runtime, so read LIVE through HOST (never captured):
 *      countryGeo -> HOST.countryGeo
 *      currentLang -> HOST.lang
 *      currentProj -> HOST.proj
 *  Never rebound, so bound once under the original name:
 *      countryStats, isMobile, loadCountryData, t
 * 
 *  The CSS stays in css/intmap.css; this file adds no <style>.
 * ==========================================================================*/
window.IntMapModules=window.IntMapModules||{};
window.IntMapModules.compare=function(HOST){
  const GE=()=>window.IntMapGeoEngine;   /* (#R178) the renderer, through the contract — never the raw handle */
  const countryStats=HOST.countryStats, isMobile=HOST.isMobile, loadCountryData=HOST.loadCountryData, t=HOST.t;
  return (function(){
    /* (#R179) the renderer is asked FOR ITSELF, not named. `typeof maplibregl` was the last
       reference to the library in this file. */
    if(!GE()||!GE().hasRenderer()) return { open(){}, close(){} };
    const jp=()=>HOST.lang==='jp';
    let win=null, cmap=null, mode='sync', minimized=false, built=false, ro=null, syncing=false, baseKind='map';
    /* (#R179) four pieces of OUR state that used to be hung on the renderer's map object
       (`_wantGlobe` and friends). #R178 moved the main map's four such flags into module
       variables for the same reason: they are this module's bookkeeping, not the renderer's, and a
       contract has nowhere to put them. */
    let _wantGlobe=null, _basePoll=0, _baseRetryT=0, _copiesApplied=null;
    const xrayOn=()=>mode==='xray';
    const KC=window.KCOORDS||[[-180,85.0511],[180,85.0511],[180,-85.0511],[-180,-85.0511]];
    /* (#R29.1) Use the MOBILE 4k texture on phones — exactly like the main map's koppenDisplayURL().
       The compare map is a SECOND WebGL context; loading the full-res Köppen PNG there (on top of the main
       map's) doubled GPU memory and OOM-crashed iPhone Safari ("iPhoneでcompare viewでケッペン…ブラウザが落ちる"). */
    function koppenUrl(){ try{ const p=(window.KOPPEN_PERIODS||[]).find(x=>x[0]===window._koppenPeriod); let u=p?p[1]:'koppen_mercator_1991-2020.png'; if(typeof isMobile==='function'&&isMobile()) u=u.replace(/\.png$/,'_4k.png'); return u; }catch(_){ return 'koppen_mercator_1991-2020.png'; } }
    function injectCSS(){ if(document.getElementById('cmp-css')) return; const st=document.createElement('style'); st.id='cmp-css'; st.textContent=
      /* ⚠ (#R258) 2200, NOT 4000 — the card band css/intmap.css §「WHO IS IN FRONT」 defines. This is a
         window the reader reaches into, so it has to obey the same rule every other one does: an open
         sidebar (2600) covers it, and touching it raises it above the sidebar (`.im-front`, 2650).
         At 4000 it sat permanently in front of BOTH sidebars and clicking the left sidebar could not
         bring it forward, which is the half of that instruction that kept coming back. The MOBILE
         rule below is untouched: the band is desktop-only (the phone's sheet has its own order). */
      '#compare-window{position:fixed;right:24px;bottom:24px;width:440px;height:340px;min-width:260px;min-height:200px;z-index:2200;background:var(--card-bg);border:1px solid rgba(128,128,128,0.28);border-radius:14px;box-shadow:0 18px 50px rgba(0,0,0,0.4);overflow:hidden;resize:none;display:flex;flex-direction:column;}'+
      '#compare-window.cmp-min{height:auto !important;min-height:0;resize:none;}'+
      /* (#R36) Minimise must VISIBLY collapse to just the title bar — hide the map body AND the layer-picker row
         ("最小化したときにもUIが変わらず分かりにくい"). */
      '#compare-window.cmp-min .cmp-body,#compare-window.cmp-min .cmp-picker{display:none;}'+
      /* (#R36) and the −/restore button must change: minimised → a SQUARE (restore) affordance, not the same dash. */
      '#compare-window.cmp-min #cmp-min::before{width:11px;height:11px;background:transparent;border:2px solid var(--text-main);border-radius:2px;}'+
      /* (#R23) draw the minimize bar as a perfectly CENTERED line (the "—" glyph sat on the text baseline,
         so the line was not vertically centered in the button — "横線がボタン内の中間にない"). */
      '#cmp-min{position:relative;color:transparent !important;display:flex;align-items:center;justify-content:center;}'+
      '#cmp-min::before{content:"";position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:13px;height:2px;border-radius:1px;background:var(--text-main);}'+
      '.cmp-head{display:flex;align-items:center;gap:6px;padding:6px 40px 6px 8px;background:var(--sidebar-bg);cursor:move;flex:0 0 auto;border-bottom:1px solid rgba(128,128,128,0.18);}'+
      '.cmp-head .cmp-title{font-weight:700;font-size:12px;margin-right:auto;color:var(--text-main);}'+
      /* (#R27) Close × is a direct child of the window now (relocated out of the header), pinned top-right
         above all header/controls so nothing can overlap it. Mobile media query enlarges it below. */
      /* (#R29.1) Clean circular close + grouped iOS segments so the header reads regular, not "並びが不規則でダサい". */
      /* (#R35) Close × is a rounded-RECT now, not a circle ("×ボタンが丸でダサい") — matches the minimise
         button + every other compare control (the iOS design language is rounded-rect, never circles here). */
      '#cmp-close{position:absolute;top:6px;right:7px;z-index:30;width:28px;height:28px;border-radius:8px;background:rgba(128,128,128,0.16);font-size:13px;}'+
      '#cmp-close:hover{background:#ff3b30;color:#fff;}'+
      '.cmp-seg{display:inline-flex;background:var(--input-bg);border-radius:9px;padding:2px;gap:2px;flex:0 0 auto;}'+
      '.cmp-seg .cmp-btn{background:transparent;border-radius:7px;padding:4px 9px;}'+
      '.cmp-seg .cmp-btn.on{background:var(--primary-color);color:#fff;box-shadow:0 1px 4px rgba(0,0,0,0.12);}'+
      '.cmp-icon{width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;padding:0;border-radius:8px;flex:0 0 auto;}'+
      /* (#R24) touch-action:manipulation → compare buttons (Map/Sat/Sync/Free/X-ray/min/close) fire on the
         FIRST tap with no iOS 300ms delayed/retargeted click — a big reason map/satellite "押しても変わらない"
         and the close "終了できない" on mobile. */
      '.cmp-btn{background:var(--input-bg);border:none;color:var(--text-main);border-radius:7px;padding:4px 8px;font-size:11px;font-weight:600;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;}'+
      '.cmp-btn.on{background:var(--primary-color);color:#fff;}'+
      '.cmp-body{position:relative;flex:1 1 auto;min-height:0;}'+
      '#compare-map{position:absolute;inset:0;}'+
      /* (#R31) layer picker row directly under the control segments. */
      '.cmp-picker{flex:0 0 auto;padding:6px 10px 8px;background:var(--sidebar-bg);border-bottom:1px solid rgba(128,128,128,0.14);position:relative;z-index:8;pointer-events:auto;}'+
      '#compare-window.cmp-xray .cmp-picker{pointer-events:auto !important;z-index:9;position:relative;}'+   /* (#R33) picker stays clickable in x-ray */
      '.cmp-picker select{width:100%;box-sizing:border-box;background:var(--input-bg);color:var(--text-main);border:1px solid rgba(128,128,128,0.28);border-radius:8px;padding:7px 9px;font-size:12.5px;font-weight:600;cursor:pointer;}'+
      '.cmp-ctrls{position:absolute;top:8px;left:8px;z-index:5;display:flex;flex-wrap:wrap;gap:4px;max-width:calc(100% - 16px);}'+
      '.cmp-ctrls label{font-size:11px;background:var(--popup-bg);color:var(--text-main);border:1px solid rgba(128,128,128,0.25);border-radius:7px;padding:4px 7px;display:flex;align-items:center;gap:4px;backdrop-filter:blur(8px);}'+
      /* (#R27) The select had display:flex applied to a NATIVE <select>, which collapsed its text box so
         "レイヤーを選択" rendered crushed. Give the select its own comfortable rule (no flex, bigger font,
         real padding + a min-width so the placeholder always fits). */
      '.cmp-ctrls select{font-size:12.5px;background:var(--popup-bg);color:var(--text-main);border:1px solid rgba(128,128,128,0.25);border-radius:7px;padding:5px 9px;line-height:1.35;backdrop-filter:blur(8px);min-width:200px;}'+
      /* (#R13) X-ray mode: the compare window goes transparent so the MAIN map shows through at the same
         location (like an X-ray) — only the compare window\'s own data layers paint on top. */
      /* (#R16) X-ray is a movable LENS — NOT a fullscreen takeover (the user: "なんで勝手に全画面にするねん").
         The window stays its normal floating/resizable size; only its basemap goes transparent so the MAIN
         map shows through, and the camera is synced so the window shows exactly the main-map geography
         BEHIND it (perfect register — see syncFromMain's lens branch). A cyan border marks the lens. */
      /* (#R34) "謎の青い枠…いらない" — the bright cyan x-ray keyline is GONE. A faint neutral edge is all that
         marks the lens boundary now (no blue anywhere). */
      '#compare-window.cmp-xray{background:transparent !important;box-shadow:0 10px 34px rgba(0,0,0,0.34);}'+
      /* (#R36) The x-ray lens frame was an INSET box-shadow on the window, but the opaque header (top edge) and
         the transparent map canvas painted OVER it → "枠が消えている箇所がある" (the top run of the frame vanished
         behind the header). Draw the frame as an always-on-top overlay border instead so all four sides are
         continuous and never covered (pointer-events:none keeps the lens fully interactive). */
      '#compare-window.cmp-xray::after{content:"";position:absolute;inset:0;border:1.5px solid rgba(150,160,175,0.72);border-radius:14px;pointer-events:none;z-index:20;}'+
      '#compare-window.cmp-xray .cmp-body,#compare-window.cmp-xray #compare-map,#compare-window.cmp-xray .maplibregl-map,#compare-window.cmp-xray .maplibregl-canvas{background:transparent !important;}'+
      /* (#R35) Kill the "謎の青い枠": the focusable compare-map canvas (and the window) were showing the
         browser default blue :focus / :focus-visible outline on click. Suppress it everywhere in compare so
         no blue frame can appear; the neutral inset keyline above is the ONLY boundary marker now. */
      '#compare-window,#compare-window *,#compare-map,#compare-map canvas,#compare-window .maplibregl-canvas{outline:none !important;-webkit-tap-highlight-color:transparent;}'+
      '#compare-window .maplibregl-canvas:focus,#compare-map canvas:focus{outline:none !important;box-shadow:none !important;}'+
      /* (#R40) X-ray = a true click-through LENS. The window / body / compare-map are pointer-events:none so a
         drag or zoom hits the REAL main map underneath (always fully interactive); the compare overlay then
         follows 1:1 via the map.on('move')→syncFromMain handler. This REPLACES the fragile "compare map drives
         the main map" path that left the lens frozen ("X-rayにしたとき地図が動かせない"). Header + controls below
         are re-enabled so Close / X-ray / Map-Sat / date pickers stay clickable. */
      '#compare-window.cmp-xray{pointer-events:none;}'+
      '#compare-window.cmp-xray .cmp-body,#compare-window.cmp-xray #compare-map,#compare-window.cmp-xray .maplibregl-canvas-container,#compare-window.cmp-xray .maplibregl-canvas{pointer-events:none !important;}'+
      '#compare-window.cmp-xray .cmp-head,#compare-window.cmp-xray .cmp-head *,#compare-window.cmp-xray .cmp-ctrls,#compare-window.cmp-xray .cmp-ctrls *,#compare-window.cmp-xray .cmp-picker,#compare-window.cmp-xray #cmp-close,#compare-window.cmp-xray #cmp-min{pointer-events:auto !important;}'+
      /* (#R26) x-ray needs the header SOLID (the window goes transparent for alignment) so the buttons stay
         visible — but it must MATCH THE THEME, not force black in light mode ("Light modeで黒くなる謎システムは
         いらない。テーマに合わせろ"). Solid theme surface + theme-colored chips; only the cyan keyline marks the lens. */
      '#compare-window.cmp-xray .cmp-head{background:#f3f4f7 !important;position:relative;z-index:7;border-bottom:1px solid rgba(128,128,128,0.3);box-shadow:0 2px 10px rgba(0,0,0,0.18);}'+
      '[data-theme="dark"] #compare-window.cmp-xray .cmp-head{background:#1a1c22 !important;box-shadow:0 2px 10px rgba(0,0,0,0.45);}'+
      '#compare-window.cmp-xray .cmp-head .cmp-title{color:var(--text-main) !important;}'+
      '#compare-window.cmp-xray .cmp-btn{background:var(--input-bg) !important;color:var(--text-main) !important;}'+
      '#compare-window.cmp-xray .cmp-btn.on{background:var(--primary-color) !important;color:#fff !important;}'+
      '#compare-window.cmp-xray #cmp-close{background:#ff3b30 !important;color:#fff !important;}'+
      '#compare-window.cmp-xray .cmp-ctrls{pointer-events:auto;z-index:6;}'+
      '#compare-window.cmp-xray .cmp-ctrls select{background:var(--input-bg) !important;color:var(--text-main) !important;}'+
      /* (#R18) In lens mode the compare map is pulled out to cover the whole container (clipped to the
         window). Keep it BELOW the header/controls and give it a cyan edge so the lens boundary reads. */
      '#compare-window.cmp-xray #compare-map{box-shadow:none;}'+
      /* (#R15d) MOBILE: the 440px resizable window + the full-cover x-ray were "ほぼ使えない / どうにもできない".
         Make it a clean full-width TOP panel with big tappable header buttons; x-ray still overlays for
         alignment but its header is a tall, opaque bar so Close/X-ray are always reachable. */
      /* (#R16) MOBILE compare: smaller default (44vh, was "大きすぎる") + a touch resize grip (.cmp-resize)
         so the height IS adjustable ("大きさ調節できない" fixed). Native CSS resize ignores touch, hence the grip. */
      '.cmp-resize{display:none;}'+
      /* (#R20) four-corner resize handles */
      '.cmp-rz{position:absolute;width:18px;height:18px;z-index:8;touch-action:none;}'+
      '.cmp-rz[data-c="nw"]{top:-4px;left:-4px;cursor:nwse-resize;}'+
      '.cmp-rz[data-c="ne"]{top:-4px;right:-4px;cursor:nesw-resize;}'+
      '.cmp-rz[data-c="sw"]{bottom:-4px;left:-4px;cursor:nesw-resize;}'+
      '.cmp-rz[data-c="se"]{bottom:-4px;right:-4px;cursor:nwse-resize;}'+
      '.cmp-rz::after{content:"";position:absolute;inset:5px;border-radius:3px;border:2px solid rgba(150,160,175,0.55);border-top:none;border-left:none;opacity:0;transition:opacity 0.15s;}'+
      '#compare-window:hover .cmp-rz::after{opacity:0;}'+   /* (#R47) hide the resize corner-mark (still resizable; the cursor change is the only hint the user wants) */
      '@media(max-width:768px){'+
      '#compare-window{left:6px !important;right:6px !important;top:max(8px,env(safe-area-inset-top)) !important;bottom:auto !important;width:auto !important;height:46vh !important;min-width:0 !important;resize:none !important;border-radius:16px;padding-bottom:20px;z-index:4200;overflow:hidden;}'+
      '.cmp-resize{display:block;position:absolute;left:0;right:0;bottom:0;height:24px;cursor:ns-resize;touch-action:none;z-index:7;}'+
      '.cmp-resize::after{content:"";position:absolute;left:50%;bottom:6px;transform:translateX(-50%);width:42px;height:4px;border-radius:2px;background:rgba(150,160,175,0.7);}'+
      /* (#R30/#R31) Clean iOS header — NO chaotic flex-wrap. Title on its own line; the two segmented
         controls fill an even second row; the layer picker is its own row beneath. Close + Minimise are
         SQUARE (rounded-rect like the other controls — "ふちをまるではなく四角に"), the × is an SVG that is
         perfectly centred ("中心からずれている"), the minimise a single clean line ("二重線がある"). */
      '.cmp-head{display:flex !important;flex-wrap:wrap;padding:10px 92px 10px 14px;gap:7px;align-items:center;cursor:default;}'+
      '.cmp-head .cmp-title{flex:1 1 100%;font-size:14px;margin:0;}'+
      '.cmp-head .cmp-seg{flex:1 1 0;display:flex;background:var(--input-bg);border-radius:9px;padding:2px;gap:2px;}'+
      '.cmp-head .cmp-seg .cmp-btn{flex:1 1 0;min-width:0;padding:7px 4px;font-size:12px;min-height:32px;background:transparent;border-radius:7px;}'+
      '.cmp-head .cmp-seg .cmp-btn.on{background:var(--primary-color);color:#fff;}'+
      '#cmp-close,#cmp-min{position:absolute !important;top:10px;z-index:30 !important;pointer-events:auto !important;width:34px;height:34px;min-width:34px;border-radius:9px;padding:0;display:flex !important;align-items:center;justify-content:center;background:var(--input-bg) !important;color:var(--text-main) !important;border:none;}'+
      '#cmp-close{right:10px;} #cmp-min{right:50px;}'+
      /* (#R30) Main-map FABs move to the BOTTOM-LEFT while compare is open — clear of the compare ×
         (top-right), the layer picker, AND the bottom-RIGHT timebar. Moved, never hidden. */
      'body.cmp-open .m-fab-stack{top:auto !important;bottom:calc(env(safe-area-inset-bottom) + 84px) !important;left:12px !important;right:auto !important;transform:none !important;opacity:1 !important;pointer-events:auto !important;}'+
      '#compare-window.cmp-xray .cmp-head{padding:10px 92px 10px 14px;}'+
      '.cmp-picker select{min-height:40px;font-size:13px;}'+
      '}';
      document.head.appendChild(st); }
    function compareStyle(){ const dark=document.documentElement.getAttribute('data-theme')==='dark';
      return { version:8, glyphs:'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf', sources:{
        'cmp-carto':{type:'raster',tiles:['https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png','https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png','https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png'],tileSize:256,attribution:'© CARTO © OpenStreetMap'},
        'cmp-dark':{type:'raster',tiles:['https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png','https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png','https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'],tileSize:256,attribution:'© CARTO © OpenStreetMap'},
        /* (#R34) Same two-host Esri imagery as the MAIN map so compare satellite is byte-identical quality
           ("Compare viewでも同一品質のレイヤーを") and not throttled to one host. */
        'cmp-sat':{type:'raster',tiles:['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}','https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],tileSize:256,maxzoom:(typeof isMobile==='function'&&isMobile())?18:19,attribution:'© Esri'},
        'cmp-koppen':{type:'image',url:koppenUrl(),coordinates:KC},
        'cmp-worldcover':{type:'raster',tiles:['https://wmts.terrascope.be/?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=esa-worldcover-map-10m-2021-v2_map&STYLE=default&TILEMATRIXSET=EPSG:3857&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/png&TIME=2021-01-01'],tileSize:256,maxzoom:14,attribution:'ESA WorldCover 2021 · Terrascope'},
        'cmp-relief':{type:'raster',tiles:['https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png'],tileSize:256}
      }, layers:[
        {id:'cmp-base-carto',type:'raster',source:'cmp-carto',layout:{visibility:dark?'none':'visible'}},
        {id:'cmp-base-dark',type:'raster',source:'cmp-dark',layout:{visibility:dark?'visible':'none'}},
        {id:'cmp-base-sat',type:'raster',source:'cmp-sat',layout:{visibility:'none'}},
        {id:'cmp-lyr-worldcover',type:'raster',source:'cmp-worldcover',layout:{visibility:'none'},paint:{'raster-opacity':0.9,'raster-fade-duration':0,'raster-resampling':'nearest'}},
        {id:'cmp-lyr-koppen',type:'raster',source:'cmp-koppen',layout:{visibility:'none'},paint:{'raster-opacity':0.78}}
      ] }; }
    function setVis(id,on){ try{ if(cmap.layers.has(id)) cmap.layers.setLayout(id,'visibility',on?'visible':'none'); }catch(_){} }
    /* (#R20) Base swap that CANNOT silently no-op: remembers the wanted base and retries until the
       style has the layers ("map/satellite切り替えが、押しても地図が変わらない" = a click during style
       load hit a missing layer and nothing retried). */
    function applyBase(){ if(!cmap) return;
      /* (#R29.1) POLL until the base layers exist instead of waiting for `idle` — a globe renders
         continuously and never goes idle, so the old `cmap.events.once('idle',applyBase)` could never fire and the
         Map/Sat switch "押しても地図が変わらない". A bounded 120ms poll always lands once the style is ready. */
      if(!cmap.layers.has('cmp-base-carto')){ clearTimeout(_baseRetryT); _baseRetryT=setTimeout(applyBase,120); return; }
      /* (#R35) X-ray "Map" now paints the compare's OWN carto/dark base instead of going transparent.
         The old behavior ("Map" = transparent = just shows the MAIN map through the lens) was exactly the
         "X-rayはすべてをメインマップに合わせるためのモード" the user rejected — you could never make the lens a
         MAP. X-ray exists to show a DIFFERENT view at the SAME registered spot (e.g. main=Satellite, lens=Map,
         or any data layer over an independent base). So both Map and Sat now show an opaque, independent base
         in the lens, registered pixel-for-pixel to the main camera. */
      const dark=document.documentElement.getAttribute('data-theme')==='dark';
      if(xrayOn()){ setVis('cmp-base-carto',baseKind==='map'&&!dark); setVis('cmp-base-dark',baseKind==='map'&&dark); setVis('cmp-base-sat',baseKind==='sat'); return; }
      setVis('cmp-base-carto',baseKind==='map'&&!dark); setVis('cmp-base-dark',baseKind==='map'&&dark); setVis('cmp-base-sat',baseKind==='sat'); }
    function setBase(kind){ baseKind=kind; const go=()=>{ try{ applyBase(); if(xrayOn()){ layoutXrayLens(); try{ cmap.render.resize(); }catch(_){} } }catch(_){} }; go(); setTimeout(go,180); setTimeout(go,600);   /* (#R32/#R32b) re-assert + re-fit the x-ray lens so Map/Sat always switches, incl. inside x-ray */
      /* (#R34) POLL until the wanted base actually shows — a click landing during the cmap style-load
         otherwise no-ops with nothing retrying ("Compare viewで…切り替えができないバグが発生する"). */
      try{ clearInterval(_basePoll); let n=0; _basePoll=setInterval(()=>{ n++;
        try{ if(!cmap||baseKind!==kind){ clearInterval(_basePoll); return; }
          if(cmap.layers.has('cmp-base-sat')){ const wantSat=(kind==='sat'), isSat=(cmap.layers.getLayout('cmp-base-sat','visibility')==='visible'); if(wantSat!==isSat) go(); else clearInterval(_basePoll); } }catch(_){}
        if(n>30) clearInterval(_basePoll); },150); }catch(_){}
    }
    /* (#R20) projection ALWAYS follows the main map (selector removed) — mercator-referenced overlays
       (Köppen/land cover/eco) only register when both maps share the projection. */
    /* (#R24) Track the compare projection with OUR OWN flag instead of cmap.getProjection() — the latter
       returned an unreliable type, so when the MAIN map was Globe and compare was Flat the old code thought
       they already matched (isGlobe defaulted true) and never switched. That's why "Flatに戻してからGlobeに
       しないと反映されない". Now it always syncs whenever the wanted projection differs from what we last set. */
    function followProjection(){ try{ const wantGlobe=(typeof HOST.proj==='undefined'||HOST.proj!=='flat');
      if(_wantGlobe!==wantGlobe){ _wantGlobe=wantGlobe; cmap.camera.setProjection(wantGlobe?'globe':'flat'); } }catch(_){} }
    /* centroid (container px) of the main-map area NOT covered by the compare window */
    function uncoveredCentroidPx(){
      const mcEl=document.getElementById('map-container')||document.body;
      const mr=mcEl.getBoundingClientRect();
      let cx=mr.width/2, cy=mr.height/2;
      try{ if(win&&win.style.display!=='none'&&!xrayOn()){
        const wr=win.getBoundingClientRect();
        const ix0=Math.max(mr.left,wr.left), iy0=Math.max(mr.top,wr.top), ix1=Math.min(mr.right,wr.right), iy1=Math.min(mr.bottom,wr.bottom);
        const iw=Math.max(0,ix1-ix0), ih=Math.max(0,iy1-iy0);
        const At=mr.width*mr.height, Aw=iw*ih;
        if(Aw>0 && Aw<At*0.92){
          const wx=(ix0+ix1)/2-mr.left, wy=(iy0+iy1)/2-mr.top;
          cx=(cx*At - wx*Aw)/(At-Aw); cy=(cy*At - wy*Aw)/(At-Aw);
          cx=Math.max(0,Math.min(mr.width,cx)); cy=Math.max(0,Math.min(mr.height,cy));
        }
      } }catch(_){}
      return [cx,cy];
    }
    /* (#R27) Normalize longitude to [-180,180]. The main flat map in FREE-PAN wraps the world (renders
       copies past ±180°), but the compare map is renderWorldCopies:false — so once the main scrolled into
       a wrapped copy, the synced center longitude (e.g. 200°) put the compare camera somewhere its basemap
       couldn't follow → "レイヤーと地図がずれる" on big scrolls / zoomed-out X-ray. Wrapping the synced lng to
       the equivalent in-range value keeps the compare basemap + its data layers registered together. */
    const _wrapLng=(lng)=>{ let x=((lng+180)%360+360)%360-180; return x; };
    const _normCenter=()=>{ const c=GE().camera.getCenter(); return {lng:_wrapLng(c.lng), lat:c.lat}; };
    const _rawCenter=()=>{ const c=GE().camera.getCenter(); return {lng:c.lng, lat:c.lat}; };
    /* (#R28) The compare map must render the SAME world copies as the main map or it drifts on big
       horizontal scrolls. The main flat map ALWAYS wraps (#R297 removed the fixed-extent mode); the globe does not.
       When the main wraps, the compare must wrap too — so its basemap + overlays repeat across copies and
       stay registered with the main map's copies — and we sync the RAW (unwrapped) center so both cameras
       sit in the SAME copy. Fix for "free panのflat mapで大きくスクロールするとレイヤーと地図がずれる" (#5)
       and the zoomed-out X-ray drift (#8). */
    function _cmpWorldCopies(){ try{ return (typeof HOST.proj!=='undefined'&&HOST.proj==='flat'); }catch(_){ return false; } }
    function _syncCopies(){ const want=_cmpWorldCopies(); try{ if(_copiesApplied!==want){ _copiesApplied=want; cmap.camera.setRenderWorldCopies(want); } }catch(_){} return want; }
    function syncFromMain(){ if(mode==='free'||!cmap||syncing) return; syncing=true; const _copies=_syncCopies();
      try{
        followProjection();
        if(xrayOn() && win){
          /* (#R18) TRUE LENS — compare covers the whole container at the EXACT main camera and is
             clipped to the window rect → pixel-perfect register on globe AND flat.
             (#R21) Drift fix ("一定以上メインマップを動かすとずれる"): the main camera carries PADDING
             (frosted sidebar / sheet detents shift its optical center) — the lens must carry the SAME
             padding or every padded pixel is offset. Mirror it on every sync. */
          layoutXrayLens();
          let pad; try{ pad=GE().camera.getPadding?GE().camera.getPadding():undefined; }catch(_){}
          cmap.camera.jumpTo({center:_copies?_rawCenter():_normCenter(),zoom:GE().camera.getZoom(),bearing:GE().camera.getBearing(),pitch:GE().camera.getPitch(),padding:pad});
        } else {
          /* SYNC: center the compare on the geography under the UNCOVERED-area centroid. */
          let target=null; try{ const u=GE().coords.unproject(uncoveredCentroidPx()); target={lng:_copies?u.lng:_wrapLng(u.lng),lat:u.lat}; }catch(_){}
          cmap.camera.jumpTo({center:target||(_copies?_rawCenter():_normCenter()),zoom:GE().camera.getZoom(),bearing:GE().camera.getBearing(),pitch:GE().camera.getPitch(),padding:{top:0,right:0,bottom:0,left:0}});
        }
      }catch(_){} syncing=false; }
    /* (#R20) the REVERSE direction: the user drags the compare map → drive the main map so the
       sync relation (compare center = uncovered-area centroid geography) keeps holding. */
    function syncToMain(){ if(mode!=='sync'||!cmap||syncing) return; syncing=true;
      try{
        const C=cmap.camera.getCenter();
        GE().camera.jumpTo({zoom:cmap.camera.getZoom(),bearing:cmap.camera.getBearing(),pitch:cmap.camera.getPitch()});
        const tpx=uncoveredCentroidPx();
        const p=GE().coords.project(C);                                  /* where C sits on the main map now */
        const cpx=GE().coords.project(GE().camera.getCenter());                  /* main center in screen px */
        const next=GE().coords.unproject([cpx.x+(p.x-tpx[0]), cpx.y+(p.y-tpx[1])]);
        GE().camera.jumpTo({center:next});
      }catch(_){} syncing=false; }
    /* (#R18) Size the compare map to the full map-container and clip it to the window rect → a lens. */
    function layoutXrayLens(){
      if(!xrayOn()||!win) return; const cm=document.getElementById('compare-map'); if(!cm) return;
      const mcEl=document.getElementById('map-container')||document.body; const mr=mcEl.getBoundingClientRect(); const wr=win.getBoundingClientRect();
      cm.style.position='fixed'; cm.style.inset='auto';
      cm.style.left=mr.left+'px'; cm.style.top=mr.top+'px'; cm.style.width=mr.width+'px'; cm.style.height=mr.height+'px'; cm.style.zIndex='1';
      const top=Math.max(0,wr.top-mr.top), left=Math.max(0,wr.left-mr.left), right=Math.max(0,mr.right-wr.right), bottom=Math.max(0,mr.bottom-wr.bottom);
      const clip='inset('+top+'px '+right+'px '+bottom+'px '+left+'px round 12px)'; cm.style.clipPath=clip; cm.style.webkitClipPath=clip;
      try{ cmap.render.resize(); }catch(_){}
    }
    function clearXrayLens(){ const cm=document.getElementById('compare-map'); if(!cm) return;
      /* (#R25) Fully restore the canvas to its in-window CSS box (position:absolute;inset:0) and resize a
         few times — a single resize sometimes left the compare map mis-sized after x-ray, showing as a dark
         strip at the top ("x-ray後に上部が暗転"). */
      ['position','inset','left','top','width','height','zIndex','clipPath','webkitClipPath','boxShadow'].forEach(p=>cm.style[p]='');
      const r=()=>{ try{ cmap.render.resize(); }catch(_){} };
      r(); requestAnimationFrame(r); setTimeout(r,80); setTimeout(r,300); }
    /* ---------- (#R20) portable layer registry for the compare "Layers ▾" pulldown ---------- */
    const CMP_DATE=new Date(Date.now()-2*864e5).toISOString().slice(0,10);
    const cmpGibs=(layer,lvl,ext,time)=>['https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/'+layer+'/default/'+time+'/GoogleMapsCompatible_Level'+lvl+'/{z}/{y}/{x}.'+ext];
    const cmpGibsStatic=(layer,lvl,ext)=>['https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/'+layer+'/default/GoogleMapsCompatible_Level'+lvl+'/{z}/{y}/{x}.'+ext];
    function ld(k,fb){ try{ if(typeof layerDates!=='undefined'&&layerDates&&layerDates[k]) return layerDates[k]; }catch(_){} return fb; }
    function addR(id,tiles,maxz,op){ if(cmap.layers.hasSource('cmpx-'+id)) return; cmap.layers.addSource('cmpx-'+id,{type:'raster',tiles:tiles,tileSize:256,maxzoom:maxz||9}); cmap.layers.add({id:'cmpx-'+id,type:'raster',source:'cmpx-'+id,layout:{visibility:'none'},paint:{'raster-opacity':op==null?0.78:op}}); }
    const CMP_LAYERS=[
      {k:'koppen', n:()=>window.IntMapLang.t(HOST.lang,"Köppen climate","ケッペン気候区分","Köppen-Klima","Климат по Кёппену","Clima de Köppen"), ids:['cmp-lyr-koppen'], add(){ try{ cmap.layers.updateImage('cmp-koppen',{url:koppenUrl(),coordinates:KC}); }catch(_){} }},
      {k:'worldcover', n:()=>window.IntMapLang.t(HOST.lang,"Land cover (ESA 2021)","土地被覆 (ESA 2021)","Landbedeckung (ESA 2021)","Земной покров (ESA 2021)","Cobertura del suelo (ESA 2021)"), ids:['cmp-lyr-worldcover'], add(){}},
      {k:'eco', n:()=>window.IntMapLang.t(HOST.lang,"Ecoregions","生態地域","Ökoregionen","Экорегионы","Ecorregiones"), ids:['cmp-lyr-eco','cmp-lyr-eco-l'], add(done){
        const addEco=(gj)=>{ if(!gj) return; try{ if(!cmap.layers.hasSource('cmp-eco')){ cmap.layers.addSource('cmp-eco',{type:'geojson',data:gj}); cmap.layers.add({id:'cmp-lyr-eco',type:'fill',source:'cmp-eco',layout:{visibility:'none'},paint:{'fill-color':['coalesce',['to-color',['get','COLOR']],'#4caf50'],'fill-opacity':0.55}}); cmap.layers.add({id:'cmp-lyr-eco-l',type:'line',source:'cmp-eco',layout:{visibility:'none'},paint:{'line-color':'rgba(0,0,0,0.22)','line-width':0.4}}); } done&&done(); }catch(_){} };
        if(window.__ECOREGIONS_2017) addEco(window.__ECOREGIONS_2017); else if(window.__loadEcoregions) window.__loadEcoregions(addEco); }},
      {k:'plates', n:()=>window.IntMapLang.t(HOST.lang,"Tectonic plates","プレート境界","Tektonische Platten","Тектонические плиты","Placas tectónicas"), ids:['cmpx-plates-f','cmpx-plates-l'], add(done){
        if(cmap.layers.hasSource('cmpx-plates')){ done&&done(); return; }
        Promise.all([
          fetch('https://raw.githubusercontent.com/fraxen/tectonicplates/master/GeoJSON/PB2002_plates.json').then(r=>r.json()),
          fetch('https://raw.githubusercontent.com/fraxen/tectonicplates/master/GeoJSON/PB2002_boundaries.json').then(r=>r.json()).catch(()=>null)
        ]).then(([pl,bd])=>{ try{
          cmap.layers.addSource('cmpx-plates',{type:'geojson',data:pl}); cmap.layers.addSource('cmpx-plates-b',{type:'geojson',data:bd||{type:'FeatureCollection',features:[]}});
          cmap.layers.add({id:'cmpx-plates-f',type:'fill',source:'cmpx-plates',layout:{visibility:'none'},paint:{'fill-color':'#e8590c','fill-opacity':0.12}});
          cmap.layers.add({id:'cmpx-plates-l',type:'line',source:'cmpx-plates-b',layout:{visibility:'none'},paint:{'line-color':'#ff5a3c','line-width':1.4,'line-opacity':0.9}});
          done&&done(); }catch(_){} }).catch(()=>{}); }},
      /* (#R234) the comparison map's DEM was pinned at 13 for every device — two zoom levels below
         what the main map has streamed on desktop since #R20, so the same hillshade was visibly
         coarser here than beside it. It asks the shell for the depth now (window.__imDemMaxZoom),
         so desktop gets terrarium's native 15 and a phone keeps its 13. */
      {k:'hillshade', n:()=>window.IntMapLang.t(HOST.lang,"Hillshade","陰影起伏","Schummerung","Отмывка рельефа","Sombreado del relieve"), ids:['cmpx-hill'], add(){ try{ if(!cmap.layers.hasSource('cmpx-dem')) cmap.layers.addSource('cmpx-dem',{type:'raster-dem',tiles:['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],encoding:'terrarium',tileSize:256,maxzoom:(window.__imDemMaxZoom?window.__imDemMaxZoom():13)});
        if(!cmap.layers.has('cmpx-hill')) cmap.layers.add({id:'cmpx-hill',type:'hillshade',source:'cmpx-dem',layout:{visibility:'none'},paint:{'hillshade-exaggeration':0.55}}); }catch(_){} }},
      {k:'nightsat', n:()=>window.IntMapLang.t(HOST.lang,"Night lights (satellite)","夜の光（衛星）","Nachtlichter (Satellit)","Ночные огни (спутник)","Luces nocturnas (satélite)"), ids:['cmpx-nightsat'], add(){ addR('nightsat',cmpGibsStatic('VIIRS_Black_Marble',8,'png').map(u=>u.replace('/default/','/default/2016-01-01/')),8,0.95); }},
      {k:'snow', n:()=>window.IntMapLang.t(HOST.lang,"Snow cover","積雪","Schneedecke","Снежный покров","Cubierta de nieve"), ids:['cmpx-snow'], add(){ addR('snow',cmpGibs('MODIS_Terra_NDSI_Snow_Cover',8,'png',ld('snow',CMP_DATE)),8); }},
      {k:'aod', n:()=>window.IntMapLang.t(HOST.lang,"Aerosol (AOD)","エアロゾル","Aerosol (AOD)","Аэрозоль (AOD)","Aerosol (AOD)"), ids:['cmpx-aod'], add(){ addR('aod',cmpGibs('MODIS_Combined_Value_Added_AOD',6,'png',ld('aod',CMP_DATE)),6); }},
      {k:'sst', n:()=>window.IntMapLang.t(HOST.lang,"Sea-surface temp","海面水温","Meeresoberflächentemperatur","Температура поверхности моря","Temperatura del mar"), ids:['cmpx-sst'], add(){ addR('sst',cmpGibs('GHRSST_L4_MUR_Sea_Surface_Temperature',7,'png',ld('sst',CMP_DATE)),7); }},
      {k:'temp', n:()=>window.IntMapLang.t(HOST.lang,"Air temperature (monthly)","気温（月平均）","Lufttemperatur (monatlich)","Температура воздуха (по месяцам)","Temperatura del aire (mensual)"), ids:['cmpx-temp'], add(){ addR('temp',cmpGibs('MERRA2_2m_Air_Temperature_Monthly',6,'png',ld('temp','2024-01-01')),6); }},
      {k:'precip', n:()=>window.IntMapLang.t(HOST.lang,"Precipitation","降水量","Niederschlag","Осадки","Precipitación"), ids:['cmpx-precip'], add(){ addR('precip',cmpGibs('IMERG_Precipitation_Rate',6,'png',ld('precip',CMP_DATE)+'T12:00:00Z'),6); }},
      {k:'thermal', n:()=>window.IntMapLang.t(HOST.lang,"Thermal anomalies","熱異常（火災）","Wärmeanomalien","Тепловые аномалии","Anomalías térmicas"), ids:['cmpx-thermal'], add(){ addR('thermal',['https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=VIIRS_NOAA20_Thermal_Anomalies_375m_All,VIIRS_SNPP_Thermal_Anomalies_375m_All&CRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256&FORMAT=image/png&TRANSPARENT=TRUE&STYLES=&TIME='+CMP_DATE],9,0.85); }},
      {k:'popgrid', n:()=>window.IntMapLang.t(HOST.lang,"Population grid","人口密度グリッド","Bevölkerungsraster","Сетка населения","Malla de población"), ids:['cmpx-popgrid'], add(){ addR('popgrid',cmpGibsStatic('GPW_Population_Density_2020',7,'png'),7,0.8); }},
      {k:'ukr', n:()=>window.IntMapLang.t(HOST.lang,"Ukraine frontline","ウクライナ前線","Frontlinie Ukraine","Линия фронта в Украине","Frente de Ucrania"), ids:['cmpx-ukr-f','cmpx-ukr-l'], add(done){
        if(cmap.layers.hasSource('cmpx-ukr')){ done&&done(); return; }
        fetch('https://deepstatemap.live/api/history/last').then(r=>r.json()).then(j=>{ try{
          let fc=(j&&j.map)?j.map:j; if(typeof fc==='string') fc=JSON.parse(fc);
          if(!fc||!Array.isArray(fc.features)) return;
          /* (#R31) SAME Ukraine-only filter as the main map ("compare viewでも同一のレイヤーを"): the raw
             DeepState feed carries stray polygons (Abkhazia, S.Ossetia, even Kuril/Northern Territories) that
             were leaking onto the compare map outside Ukraine. Keep only Ukraine-region polygons. */
          const firstLL=(g)=>{ try{ let c=g.coordinates; while(Array.isArray(c[0])) c=c[0]; return c; }catch(_){ return null; } };
          const inUA=(f)=>{ const c=firstLL(f.geometry); return !c || (c[0]>20&&c[0]<42.5&&c[1]>43.9&&c[1]<54.5); };
          const feats=fc.features.filter(f=>f&&f.geometry&&/Polygon/.test(f.geometry.type)&&inUA(f));
          cmap.layers.addSource('cmpx-ukr',{type:'geojson',data:{type:'FeatureCollection',features:feats}});
          cmap.layers.add({id:'cmpx-ukr-f',type:'fill',source:'cmpx-ukr',filter:['any',['==',['geometry-type'],'Polygon'],['==',['geometry-type'],'MultiPolygon']],layout:{visibility:'none'},paint:{'fill-color':['coalesce',['get','fill'],'#d62b2b'],'fill-opacity':0.3}});
          cmap.layers.add({id:'cmpx-ukr-l',type:'line',source:'cmpx-ukr',layout:{visibility:'none'},paint:{'line-color':['coalesce',['get','stroke'],'#c01616'],'line-width':1.3}});
          done&&done(); }catch(_){} }).catch(()=>{}); }},
      {k:'volc', n:()=>window.IntMapLang.t(HOST.lang,"Volcanoes","火山","Vulkane","Вулканы","Volcanes"), ids:['cmpx-volc'], add(done){
        if(cmap.layers.hasSource('cmpx-volc')){ done&&done(); return; }
        fetch('data/volcanoes_gvp.json').then(r=>r.json()).then(j=>{ try{
          cmap.layers.addSource('cmpx-volc',{type:'geojson',data:j});
          cmap.layers.add({id:'cmpx-volc',type:'circle',source:'cmpx-volc',layout:{visibility:'none'},paint:{'circle-radius':['interpolate',['linear'],['zoom'],1,2,6,5],'circle-color':'#ff6a3d','circle-stroke-color':'#fff','circle-stroke-width':0.7,'circle-opacity':0.9}});
          done&&done(); }catch(_){} }).catch(()=>{}); }},
      /* (#R36) parity adds — aurora + earthquakes (the main map has them; compare didn't). Same sources/paint
         as the main map so they are byte-identical, not "low quality" clones. */
      {k:'aurora', n:()=>window.IntMapLang.t(HOST.lang,"Aurora forecast","オーロラ予報","Polarlicht-Vorhersage","Прогноз полярных сияний","Previsión de auroras"), ids:['cmpx-aurora-heat','cmpx-aurora-glow'], add(done){
        if(cmap.layers.hasSource('cmpx-aurora')){ done&&done(); return; }
        cmap.layers.addSource('cmpx-aurora',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
        cmap.layers.add({id:'cmpx-aurora-heat',type:'heatmap',source:'cmpx-aurora',layout:{visibility:'none'},paint:{'heatmap-weight':['interpolate',['linear'],['get','a'],0,0,100,1],
          /* (#R123/#R124) same zoom fix as the main l9-aurora-heat layer (compare-map copy): heatmap fades out on
             zoom-in, a soft-circle glow (below) takes over so the oval stays visible at every zoom. */
          'heatmap-intensity':['interpolate',['linear'],['zoom'],1,1.1,4,1.35,7,1.9,10,2.6],
          'heatmap-radius':['interpolate',['linear'],['zoom'],1,10,3,20,4,30,5,52,6,88,7,150,8,250,9,380,10,480],'heatmap-opacity':['interpolate',['linear'],['zoom'],1,0.78,6,0.78,8,0.42,10,0.16],'heatmap-color':['interpolate',['linear'],['heatmap-density'],0,'rgba(0,0,0,0)',0.2,'rgba(0,120,60,0.45)',0.5,'rgba(0,220,120,0.6)',0.8,'rgba(140,255,170,0.85)',1,'rgba(210,255,220,0.95)']}});
        cmap.layers.add({id:'cmpx-aurora-glow',type:'circle',source:'cmpx-aurora',layout:{visibility:'none'},paint:{
          'circle-radius':['interpolate',['exponential',2],['zoom'],3,8,5,26,7,110,9,430,11,1700],
          'circle-color':['interpolate',['linear'],['get','a'],8,'#00753b',20,'#00d072',50,'#7dffa6',100,'#d2ffdc'],
          'circle-blur':0.85,
          'circle-opacity':['interpolate',['linear'],['zoom'],4,0,6,0.32,8,0.62,10,0.8]}},'cmpx-aurora-heat');
        fetch('https://services.swpc.noaa.gov/json/ovation_aurora_latest.json').then(r=>r.json()).then(j=>{ try{
          const co=j.coordinates||[], feats=[];
          for(let i=0;i<co.length;i+=2){ const c=co[i]; if(!c) continue; const a=c[2]; if(a<8) continue; let lng=c[0]; if(lng>180) lng-=360; feats.push({type:'Feature',geometry:{type:'Point',coordinates:[lng,c[1]]},properties:{a:a}}); }
          if(cmap.layers.hasSource('cmpx-aurora')) cmap.layers.setSourceData('cmpx-aurora',{type:'FeatureCollection',features:feats});
          done&&done(); }catch(_){} }).catch(()=>{}); }},
      {k:'eq', n:()=>window.IntMapLang.t(HOST.lang,"Earthquakes (USGS)","地震（USGS）","Erdbeben (USGS)","Землетрясения (USGS)","Terremotos (USGS)"), ids:['cmpx-eq'], add(done){
        if(cmap.layers.hasSource('cmpx-eq')){ done&&done(); return; }
        fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_week.geojson').then(r=>r.json()).then(j=>{ try{
          cmap.layers.addSource('cmpx-eq',{type:'geojson',data:j});
          cmap.layers.add({id:'cmpx-eq',type:'circle',source:'cmpx-eq',layout:{visibility:'none'},paint:{'circle-radius':['interpolate',['linear'],['get','mag'],1,2.5,4,6,6,12,8,22],'circle-color':['interpolate',['linear'],['get','mag'],1,'#ffd24d',3,'#ff9500',5,'#ff3b30',7,'#7a0010'],'circle-opacity':0.78,'circle-stroke-color':'rgba(255,255,255,0.6)','circle-stroke-width':0.4}});
          done&&done(); }catch(_){} }).catch(()=>{}); }},
      /* (#R21) "全部のレイヤーをcompare viewでも使えるように" — country CHOROPLETHS are now cloned:
         the main map paints them via feature-state on its own 'countries' source (unshareable), so
         the compare map gets ONE geojson with every metric baked into properties + the same ramps. */
      ...(function(){
        const RAMP={
          pop:[2,'#ffffcc',20,'#fed976',100,'#fd8d3c',500,'#e31a1c',3000,'#800026'],
          hdi:[.45,'#a50026',.6,'#f46d43',.7,'#fee08b',.8,'#a6d96a',.95,'#1a9850'],
          dem:[1,'#a50026',4,'#f46d43',6,'#fee08b',8,'#74add1',10,'#313695'],
          milSpend:[1,'#fff7ec',5,'#fdd49e',20,'#fc8d59',75,'#d7301f',300,'#7f0000',916,'#4d0000'],
          milSpendGDP:[0.5,'#edf8fb',1,'#b2e2e2',2,'#66c2a4',3.5,'#2ca25f',6,'#006d2c'],
          gdppc:[1000,'#fff7ec',5000,'#fee8c8',15000,'#fdbb84',30000,'#fc8d59',55000,'#e34a33',90000,'#7f0000'],
          tfr:[1,'#2c7fb8',2.1,'#7fcdbb',3,'#ffffb2',4.5,'#fe9929',6.5,'#cc4c02']};
        function srcReady(done){
          if(cmap.layers.hasSource('cmp-choro')){ done&&done(); return; }
          try{
            const cg=(typeof HOST.countryGeo!=='undefined'&&HOST.countryGeo)||window.countryGeo;
            const cs=(typeof countryStats!=='undefined'&&countryStats)||{};
            if(!cg||!Array.isArray(cg.features)){ try{ typeof loadCountryData==='function'&&loadCountryData(); }catch(_){} setTimeout(()=>srcReady(done),1500); return; }
            const feats=cg.features.map(f=>{ const s=cs[f.id]||{}; const msg=(s.milSpend!=null&&s.gdp)?s.milSpend/s.gdp*100:null;
              const nv=(x)=>(x!=null&&!isNaN(x)&&x>0)?x:-1;
              return {type:'Feature',geometry:f.geometry,properties:{pop:nv(s.density),hdi:nv(s.hdi),dem:nv(s.dem),milSpend:nv(s.milSpend),milSpendGDP:nv(msg),gdppc:nv(s.gdppc),tfr:nv(s.tfr)}}; });
            cmap.layers.addSource('cmp-choro',{type:'geojson',data:{type:'FeatureCollection',features:feats}});
            done&&done();
          }catch(_){}
        }
        function mk(k,nm){ return {k:'ch-'+k, n:nm, ids:['cmp-ch-'+k], add(done){ srcReady(()=>{ try{
          if(!cmap.layers.has('cmp-ch-'+k)){
            const ramp=['interpolate',['linear'],['to-number',['get',k]]].concat(RAMP[k]);
            cmap.layers.add({id:'cmp-ch-'+k,type:'fill',source:'cmp-choro',layout:{visibility:'none'},paint:{'fill-color':['case',['<=',['to-number',['get',k]],0],'rgba(128,128,128,0.25)',ramp],'fill-opacity':0.7}});
          }
          done&&done(); }catch(_){} }); }}; }
        return [
          mk('pop',()=>window.IntMapLang.t(HOST.lang,"Population density","人口密度","Bevölkerungsdichte","Плотность населения","Densidad de población")),
          mk('gdppc',()=>window.IntMapLang.t(HOST.lang,"GDP per capita","1人当たりGDP","BIP pro Kopf","ВВП на душу населения","PIB per cápita")),
          mk('hdi',()=>'HDI'),
          mk('dem',()=>window.IntMapLang.t(HOST.lang,"Democracy Index","民主主義指数","Demokratieindex","Индекс демократии","Índice de Democracia")),
          mk('tfr',()=>window.IntMapLang.t(HOST.lang,"Fertility rate","合計特殊出生率","Geburtenrate","Суммарный коэффициент рождаемости","Tasa de fecundidad")),
          mk('milSpend',()=>window.IntMapLang.t(HOST.lang,"Military spending ($B)","国防費（$B）","Militärausgaben (Mrd. $)","Военные расходы (млрд $)","Gasto militar (miles de mill. $)")),
          mk('milSpendGDP',()=>window.IntMapLang.t(HOST.lang,"Military spending (%GDP)","国防費（対GDP）","Militärausgaben (% BIP)","Военные расходы (% ВВП)","Gasto militar (% del PIB)"))
        ];
      })(),
      {k:'histb', n:()=>window.IntMapLang.t(HOST.lang,"Historical borders","過去の国境","Historische Grenzen","Исторические границы","Fronteras históricas"), ids:['cmp-hb-f','cmp-hb-l'], add(done){
        const cur=(window.IntMapBeta&&window.IntMapBeta.hbCurrent)?window.IntMapBeta.hbCurrent():null;
        if(cmap.layers.hasSource('cmp-hb')){ try{ if(cur&&cur.fc) cmap.layers.setSourceData('cmp-hb',cur.fc); }catch(_){} done&&done(); return; }
        const use=(fc)=>{ try{ if(!fc||!Array.isArray(fc.features)) return;
          cmap.layers.addSource('cmp-hb',{type:'geojson',data:fc});
          cmap.layers.add({id:'cmp-hb-f',type:'fill',source:'cmp-hb',layout:{visibility:'none'},paint:{'fill-color':['coalesce',['get','__col'],'#c9b18a'],'fill-opacity':0.3}});
          cmap.layers.add({id:'cmp-hb-l',type:'line',source:'cmp-hb',layout:{visibility:'none'},paint:{'line-color':'#5e4a33','line-width':0.9,'line-opacity':0.85}});
          done&&done(); }catch(_){} };
        if(cur&&cur.fc){ use(cur.fc); return; }
        fetch('https://raw.githubusercontent.com/aourednik/historical-basemaps/master/geojson/world_'+((cur&&cur.year)||1914)+'.geojson').then(r=>r.json()).then(use).catch(()=>{}); }},
      {k:'rail', n:()=>window.IntMapLang.t(HOST.lang,"World railways","世界の鉄道","Eisenbahnen","Железные дороги","Ferrocarriles"), ids:['cmp-rail'], add(done){
        if(cmap.layers.hasSource('cmp-rail')){ done&&done(); return; }
        if(!window.IntMapBeta2) return;
        window.IntMapBeta2.load('rail',fc=>{ try{ if(cmap.layers.hasSource('cmp-rail')) { done&&done(); return; }
          cmap.layers.addSource('cmp-rail',{type:'geojson',data:fc});
          /* (#R388) the colour comes from the railway module, which owns the gauge buckets and their
             colours — this file used to read a `col` property that the Natural Earth build stamped on
             every feature, and the new data has no such property because the bucket is derived. */
          cmap.layers.add({id:'cmp-rail',type:'line',source:'cmp-rail',layout:{visibility:'none'},paint:{'line-color':(window.IntMapRailways&&window.IntMapRailways.colour?window.IntMapRailways.colour():'#888'),'line-width':1.3,'line-opacity':0.85}});
          done&&done(); }catch(_){} }); }},
      {k:'dc', n:()=>window.IntMapLang.t(HOST.lang,"Data centers / cloud","データセンター","Rechenzentren / Cloud","Дата-центры / облако","Centros de datos / nube"), ids:['cmp-dc'], add(done){
        if(cmap.layers.hasSource('cmp-dc')){ done&&done(); return; }
        if(!window.IntMapBeta2) return;
        window.IntMapBeta2.load('dc',fc=>{ try{ if(cmap.layers.hasSource('cmp-dc')) { done&&done(); return; }
          cmap.layers.addSource('cmp-dc',{type:'geojson',data:fc});
          cmap.layers.add({id:'cmp-dc',type:'circle',source:'cmp-dc',layout:{visibility:'none'},paint:{'circle-radius':['interpolate',['linear'],['zoom'],1,2.4,6,5.5],'circle-color':['coalesce',['get','col'],'#5e8bff'],'circle-stroke-color':'#fff','circle-stroke-width':0.8,'circle-opacity':0.9}});
          done&&done(); }catch(_){} }); }},
      {k:'pharma', n:()=>window.IntMapLang.t(HOST.lang,"Pharma & health","医療・製薬","Pharma & Gesundheit","Фармацевтика и здравоохранение","Farmacéuticas y salud"), ids:['cmp-ph'], add(done){
        if(cmap.layers.hasSource('cmp-ph')){ done&&done(); return; }
        if(!window.IntMapBeta2) return;
        window.IntMapBeta2.load('pharma',fc=>{ try{ if(cmap.layers.hasSource('cmp-ph')) { done&&done(); return; }
          cmap.layers.addSource('cmp-ph',{type:'geojson',data:fc});
          cmap.layers.add({id:'cmp-ph',type:'circle',source:'cmp-ph',layout:{visibility:'none'},paint:{'circle-radius':['interpolate',['linear'],['zoom'],1,2.4,6,5.5],'circle-color':['coalesce',['get','col'],'#2bb3a3'],'circle-stroke-color':'#fff','circle-stroke-width':0.8,'circle-opacity':0.9}});
          done&&done(); }catch(_){} }); }}
    ];
    function build(){ if(built) return; built=true; injectCSS();
      win=document.createElement('div'); win.id='compare-window';
      win.innerHTML='<div class="cmp-head"><span class="cmp-title">'+(window.IntMapLang.t(HOST.lang,"Compare","比較","Vergleichen","Сравнить","Comparar"))+'</span>'+
        '<span class="cmp-seg">'+
          '<button class="cmp-btn on" data-v="map">'+(window.IntMapLang.t(HOST.lang,"Map","地図","Karte","Карта","Mapa"))+'</button>'+
          '<button class="cmp-btn" data-v="sat">'+(window.IntMapLang.t(HOST.lang,"Sat","衛星","Sat","Спутник","Sat"))+'</button>'+
        '</span>'+
        '<span class="cmp-seg">'+
          '<button class="cmp-btn on" data-m="sync" title="'+(window.IntMapLang.t(HOST.lang,"Two-way view sync","両方向に視点同期","Ansicht beidseitig synchronisieren","Двусторонняя синхронизация вида","Sincronización de vista bidireccional"))+'">'+(window.IntMapLang.t(HOST.lang,"Sync","同期","Sync","Синхр.","Sinc."))+'</button>'+
          '<button class="cmp-btn" data-m="free" title="'+(window.IntMapLang.t(HOST.lang,"Independent of the main map","メイン地図と独立","Unabhängig von der Hauptkarte","Независимо от основной карты","Independiente del mapa principal"))+'">'+(window.IntMapLang.t(HOST.lang,"Free","独立","Frei","Свободно","Libre"))+'</button>'+
          '<button class="cmp-btn" data-m="xray" title="'+(window.IntMapLang.t(HOST.lang,"Pixel-registered lens over the main map","メイン地図に重ねる透視レンズ","Pixelgenaue Lupe über der Hauptkarte","Пиксельно совмещённая линза поверх основной карты","Lente superpuesta al mapa principal, registrada píxel a píxel"))+'">'+(window.IntMapLang.t(HOST.lang,"X-ray","X線","Röntgen","Рентген","Rayos X"))+'</button>'+
        '</span>'+
        /* (#R31) Minimise = single clean line; Close = centred ×; both SQUARE like the other controls
           ("ふちをまるではなく…四角に", "×は中心からずれている"). */
        '<button class="cmp-btn cmp-icon" id="cmp-min" title="'+(window.IntMapLang.t(HOST.lang,"Minimize","最小化","Minimieren","Свернуть","Minimizar"))+'"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg></button>'+
        '<button class="cmp-btn cmp-icon" id="cmp-close" title="'+t('close')+'"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>'+
        /* (#R31) Layer picker sits in its own row directly UNDER the Map/Sat + Sync/Free/X-ray controls
           ("Select a layerは…欄の下に配置しろ"). */
        '<div class="cmp-picker"><select id="cmp-layers-sel" title="'+(window.IntMapLang.t(HOST.lang,"Compare layer","比較レイヤー","Vergleichsebene","Слой сравнения","Capa de comparación"))+'"></select></div>'+
        '<div class="cmp-body"><div id="compare-map"></div></div>'+
        '<div class="cmp-rz" data-c="nw"></div><div class="cmp-rz" data-c="ne"></div><div class="cmp-rz" data-c="sw"></div><div class="cmp-rz" data-c="se"></div>'+
        '<div class="cmp-resize" title="'+(window.IntMapLang.t(HOST.lang,"Drag to resize","高さを調節","Zum Ändern der Höhe ziehen","Потяните, чтобы изменить высоту","Arrastre para ajustar la altura"))+'"></div>';
      (document.getElementById('map-container')||document.body).appendChild(win);
      try{ window.registerWindow&&window.registerWindow(win); }catch(_){}   /* (#R47) click-to-front */
      /* (#R27) Pull the close × OUT of the wrapping header flow and make it a direct child of the window,
         pinned top-right above everything. On mobile the 7-button header wraps, and a wrapped row could
         land on top of the × ("×がレイヤー選択ボタンと重なって終了できない") — now nothing in the header/controls
         can ever overlap it, on ANY platform. (Base + mobile CSS position #cmp-close absolutely.) */
      try{ const _x=win.querySelector('#cmp-close'); if(_x) win.appendChild(_x); }catch(_){}
      cmap=GE().ui.createSubView({container:'compare-map',style:compareStyle(),center:GE().camera.getCenter(),zoom:GE().camera.getZoom(),bearing:GE().camera.getBearing(),pitch:GE().camera.getPitch(),attributionControl:{compact:true},renderWorldCopies:false,maxPitch:85});
      try{ _wantGlobe=(typeof HOST.proj==='undefined'||HOST.proj!=='flat'); cmap.camera.setProjection(_wantGlobe?'globe':'flat'); }catch(_){}
      /* (#R25) ROOT CAUSE of "メインマップがGlobeでもcompareはFlatのまま / Flatに戻してからGlobeにしないと反映
         されない": MapLibre's default projection is MERCATOR, and the setProjection() above runs BEFORE the
         cmap style loads, so it silently no-ops — yet __wantGlobe was left = true, so the followProjection()
         guard thought it already matched and never re-applied. Force a clean re-apply once the style is
         actually ready (and again on first idle as a backstop). */
      cmap.events.on('load',()=>{ applyBase(); try{ _wantGlobe=null; }catch(_){} followProjection(); });
      cmap.events.once('idle',()=>{ try{ _wantGlobe=null; }catch(_){} followProjection(); });
      /* (#R34) Re-assert base AND re-show the picked compare layer after any style change — in x-ray a
         layer add/base swap could drop the chosen layer's visibility ("x-rayで…選択したレイヤーが反映されない"). */
      cmap.events.on('styledata',()=>{ setTimeout(()=>{ try{ applyBase(); if(xrayOn()) _reshowCmpLayer(); }catch(_){} },60); });
      /* base buttons */
      win.querySelectorAll('[data-v]').forEach(b=>b.onclick=()=>{ win.querySelectorAll('[data-v]').forEach(x=>x.classList.remove('on')); b.classList.add('on'); setBase(b.getAttribute('data-v')); });
      /* (#R20) three EXCLUSIVE modes */
      /* (#R32b) Re-assert the currently-picked layer's visibility (x-ray was losing it on mode/base changes). */
      function _reshowCmpLayer(){ try{ const L=CMP_LAYERS.find(x=>x.k===curCmpLayer); if(L){ L.ids.forEach(id=>setVis(id,true)); } }catch(_){} }
      function setMode(m){ const prev=mode; mode=m;
        win.querySelectorAll('[data-m]').forEach(x=>x.classList.toggle('on',x.getAttribute('data-m')===m));
        win.classList.toggle('cmp-xray',m==='xray');
        if(prev==='xray'&&m!=='xray'){ try{ clearXrayLens(); }catch(_){} }
        applyBase(); _reshowCmpLayer();
        try{ cmap.render.resize(); }catch(_){}
        if(m!=='free') syncFromMain();   /* immediate (rAF never fires in a hidden tab) */
        requestAnimationFrame(()=>{ try{ cmap.render.resize(); }catch(_){} if(m!=='free') syncFromMain(); });
        /* (#R32b) X-ray needs the canvas reflowed to its fixed full-container box a few times before the lens
           registers + the base/layer paint ("x-rayだけバグが多発"). Re-layout + re-assert base/layer/sync. */
        if(m==='xray'){ [60,200,500].forEach(ms=>setTimeout(()=>{ try{ layoutXrayLens(); applyBase(); _reshowCmpLayer(); syncFromMain(); cmap.render.resize(); }catch(_){} },ms)); }
      }
      win.querySelectorAll('[data-m]').forEach(b=>b.onclick=()=>setMode(b.getAttribute('data-m')));
      window._cmpSetMode=setMode;
      /* layers pulldown */
      /* (#R23) compare layer picker = native <select> (one layer at a time). buildLayerDD repopulates it;
         picking a layer hides the previous one and lazily adds + shows the new one. */
      const sel=win.querySelector('#cmp-layers-sel');
      let curCmpLayer='';
      /* (#R32b) The compare picker offers the SAME high-quality layers as the main map for FREE selection
         (the user's clarification: "同一条件・クオリティのものを選択できるように" — NOT auto-reflect the main
         map's current selection). No auto-mirror; pick any CMP_LAYER (each is the full-quality clone). */
      function buildLayerDD(){ if(!sel) return; sel.innerHTML='<option value="">'+(window.IntMapLang.t(HOST.lang,"Select a layer…","レイヤーを選択…","Ebene auswählen…","Выберите слой…","Seleccione una capa…"))+'</option>'+CMP_LAYERS.map(L=>'<option value="'+L.k+'">'+L.n()+'</option>').join(''); try{ sel.value=curCmpLayer; }catch(_){} }
      buildLayerDD();
      if(sel) sel.onchange=()=>{
        const prev=CMP_LAYERS.find(x=>x.k===curCmpLayer); if(prev) prev.ids.forEach(id=>setVis(id,false));
        curCmpLayer=sel.value; const L=CMP_LAYERS.find(x=>x.k===curCmpLayer); if(!L) return;
        const show=()=>L.ids.forEach(id=>setVis(id,true)); try{ L.add(show); }catch(_){} show(); setTimeout(show,400); setTimeout(show,1500);
        if(xrayOn()) setTimeout(()=>{ try{ layoutXrayLens(); }catch(_){} },120);   /* (#R32b) re-fit the lens so a newly-picked layer paints inside x-ray */
      };
      /* min / close */
      win.querySelector('#cmp-min').onclick=()=>{ minimized=!minimized;
        /* (#R23) the four-corner/grip resizers set an inline height:Xpx !important, which BEAT the
           .cmp-min{height:auto !important} rule → after any resize the minimize button "did nothing".
           Stash + clear the inline height when collapsing, restore it when expanding. */
        if(minimized){ win.dataset.prevH=win.style.getPropertyValue('height'); win.style.removeProperty('height'); win.classList.add('cmp-min'); }
        else { win.classList.remove('cmp-min'); if(win.dataset.prevH){ win.style.setProperty('height',win.dataset.prevH,'important'); } setTimeout(()=>{ try{cmap.render.resize();}catch(_){} },60); }
        /* (#R36) Swap the button icon/title so it's obvious whether the panel is collapsed (mobile shows the SVG;
           desktop shows the ::before, which the .cmp-min CSS turns into a square). */
        try{ const mb=win.querySelector('#cmp-min');
          mb.innerHTML=minimized
            ? '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>'
            : '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>';
          mb.title=minimized?(window.IntMapLang.t(HOST.lang,"Restore","元に戻す","Wiederherstellen","Восстановить","Restaurar")):(window.IntMapLang.t(HOST.lang,"Minimize","最小化","Minimieren","Свернуть","Minimizar"));
        }catch(_){}
      };
      win.querySelector('#cmp-close').onclick=close;
      /* (#R26) The compare window must not sit ON TOP OF the sidebar — clamp its left edge to the sidebar's
         right edge (desktop, sidebar visible on the left). On mobile it's a full-width sheet → no clamp. */
      const _sbRight=()=>{ try{ if(window.matchMedia('(max-width:768px)').matches) return 0; const sb=document.getElementById('sidebar'); if(!sb||sb.classList.contains('collapsed')) return 0; const r=sb.getBoundingClientRect(); return (r.width>0 && r.left<=2)?(r.right+8):0; }catch(_){ return 0; } };
      /* drag by header */
      (function(){ const h=win.querySelector('.cmp-head'); let dx=0,dy=0,drag=false;
        h.addEventListener('pointerdown',e=>{ if(e.target.closest('.cmp-btn')) return; drag=true; const r=win.getBoundingClientRect(); dx=e.clientX-r.left; dy=e.clientY-r.top; win.style.right='auto'; win.style.bottom='auto'; win.style.left=r.left+'px'; win.style.top=r.top+'px'; try{h.setPointerCapture(e.pointerId);}catch(_){} });
        h.addEventListener('pointermove',e=>{ if(!drag) return; win.style.left=Math.max(_sbRight(),Math.min(window.innerWidth-60,e.clientX-dx))+'px'; win.style.top=Math.max(0,Math.min(window.innerHeight-30,e.clientY-dy))+'px'; if(mode!=='free') syncFromMain(); /* lens/centroid follow the window */ });
        h.addEventListener('pointerup',()=>drag=false); h.addEventListener('pointercancel',()=>drag=false);
      })();
      /* (#R20) FOUR-corner resize ("四隅でできるようにして") — pointer-driven so it also works on touch. */
      (function(){ let rz=null,sx=0,sy=0,r0=null;
        win.querySelectorAll('.cmp-rz').forEach(g=>{
          g.addEventListener('pointerdown',e=>{ rz=g.getAttribute('data-c'); sx=e.clientX; sy=e.clientY; r0=win.getBoundingClientRect();
            win.style.right='auto'; win.style.bottom='auto'; win.style.left=r0.left+'px'; win.style.top=r0.top+'px';
            try{ g.setPointerCapture(e.pointerId); }catch(_){} e.preventDefault(); e.stopPropagation(); });
          g.addEventListener('pointermove',e=>{ if(!rz) return; const dx=e.clientX-sx, dy=e.clientY-sy;
            let L=r0.left,T=r0.top,W=r0.width,H=r0.height;
            if(rz.includes('e')) W=r0.width+dx; if(rz.includes('s')) H=r0.height+dy;
            if(rz.includes('w')){ W=r0.width-dx; L=r0.left+dx; } if(rz.includes('n')){ H=r0.height-dy; T=r0.top+dy; }
            W=Math.max(240,Math.min(window.innerWidth-20,W)); H=Math.max(180,Math.min(window.innerHeight-20,H));
            if(rz.includes('w')) L=r0.right-W; if(rz.includes('n')) T=r0.bottom-H;
            win.style.left=Math.max(0,L)+'px'; win.style.top=Math.max(0,T)+'px';
            win.style.setProperty('width',W+'px','important'); win.style.setProperty('height',H+'px','important');
            try{ cmap.render.resize(); }catch(_){} if(mode!=='free') syncFromMain(); });
          const end=()=>{ rz=null; }; g.addEventListener('pointerup',end); g.addEventListener('pointercancel',end);
        });
      })();
      /* resize observer → resize the map (+ re-aim the lens/centroid) */
      try{ ro=new ResizeObserver(()=>{ try{ cmap.render.resize(); }catch(_){} if(mode!=='free') syncFromMain(); }); ro.observe(win); }catch(_){}
      /* (#R16) touch resize grip (mobile height) */
      (function(){ const g=win.querySelector('.cmp-resize'); if(!g) return; let rz=false,sy=0,sh=0;
        g.addEventListener('pointerdown',e=>{ rz=true; sy=e.clientY; sh=win.getBoundingClientRect().height; try{g.setPointerCapture(e.pointerId);}catch(_){} e.preventDefault(); });
        g.addEventListener('pointermove',e=>{ if(!rz) return; const h=Math.max(180,Math.min(window.innerHeight-40,sh+(e.clientY-sy))); win.style.setProperty('height',h+'px','important'); try{cmap.render.resize();}catch(_){} if(mode!=='free') syncFromMain(); });
        const end=()=>{ rz=false; }; g.addEventListener('pointerup',end); g.addEventListener('pointercancel',end);
      })();
      /* (#R20) BIDIRECTIONAL camera sync. Main→compare follows every main move (user or programmatic);
         compare→main only on USER gestures on the compare map (originalEvent present) so the two
         jumpTo streams can never feed back into each other (plus the syncing flag). */
      GE().events.on('move',()=>{ if(window.__fsCamActive) return; if(mode!=='free') syncFromMain(); });   /* (#R95) don't re-sync the compare map every flight frame */
      GE().events.on('moveend',followProjection);
      /* (#R21) Flat/Globe button calls this hook directly — the compare projection flips the same
         instant, in EVERY mode (incl. Free, where no camera sync runs). */
      window._cmpFollowProj=()=>{ try{ followProjection(); if(mode!=='free') syncFromMain(); }catch(_){} };
      /* (#R21) belt-and-braces: a final re-register once the main map settles (kills any residual
         lens drift from camera clamping mid-gesture). */
      GE().events.on('idle',()=>{ if(xrayOn()) syncFromMain(); });
      cmap.events.on('move',(ev)=>{ if(syncing||!ev||!ev.originalEvent) return;   /* user-driven compare drags only */
        if(mode==='sync'){ syncToMain(); }
        else if(mode==='xray'){
          /* (#R29.1) Let the user pan/zoom the map from INSIDE the X-ray window. The lens is 1:1 registered
             with the main camera, so a drag in the window drives the MAIN map by the same amount and both
             stay locked together ("compare viewのウィンドウ内からもX-ray時に地図を動かせるように"). */
          syncing=true; try{ let pad; try{ pad=GE().camera.getPadding?GE().camera.getPadding():undefined; }catch(_){}
            GE().camera.jumpTo({center:cmap.camera.getCenter(),zoom:cmap.camera.getZoom(),bearing:cmap.camera.getBearing(),pitch:cmap.camera.getPitch(),padding:pad}); }catch(_){}
          syncing=false;
        }
      });
    }
    function open(){ build(); win.style.display='flex'; minimized=false; win.classList.remove('cmp-min');
      /* (#R30) While compare is open on mobile, MOVE the main-map FAB stack to the bottom-LEFT (CSS on
         body.cmp-open). The compare window is a full-width top panel and its close × sits top-right — exactly
         where the Layers/Map FABs normally live, which caused "×がレイヤー選択ボタンと重なる / 終了できない".
         Moving (not hiding — "勝手に消すな") keeps them usable AND clear of the bottom-right timebar. */
      try{ document.body.classList.add('cmp-open'); }catch(_){}
      /* (#R26) Make sure the default (bottom-right) position doesn't land ON TOP OF the sidebar on a narrow
         desktop / wide sidebar — nudge the window right of the sidebar if it would overlap. */
      try{ if(!window.matchMedia('(max-width:768px)').matches){ const sb=document.getElementById('sidebar');
        if(sb && !sb.classList.contains('collapsed')){ const sr=sb.getBoundingClientRect(); const wr=win.getBoundingClientRect();
          if(sr.width>0 && sr.left<=2 && wr.left < sr.right+8){ win.style.right='auto'; win.style.left=(sr.right+12)+'px'; } } } }catch(_){}
      /* (#R22) Resize several times after the window becomes visible so the GL canvas always fills the
         body — a single deferred resize sometimes left an unsized gray strip at the top ("上部がグレー"). */
      const fit=()=>{ try{cmap.render.resize();}catch(_){} followProjection(); if(mode!=='free') syncFromMain(); };
      requestAnimationFrame(fit); setTimeout(fit,80); setTimeout(fit,300); try{ cmap.events.once('idle',fit); }catch(_){} }
    function close(){ try{ document.body.classList.remove('cmp-open'); }catch(_){}   /* (#R28) restore the main-map FABs */
      if(win){ if(xrayOn()){ try{ clearXrayLens(); }catch(_){} } win.style.display='none'; win.classList.remove('cmp-xray'); mode='sync';
      try{ win.querySelectorAll('[data-m]').forEach(x=>x.classList.toggle('on',x.getAttribute('data-m')==='sync')); }catch(_){} applyBase(); } }
    /* (#R27) Re-clamp the window OFF the sidebar whenever the sidebar WIDTH changes — the open/drag clamps
       didn't cover a LIVE sidebar resize, so widening the sidebar slid it under the window ("サイドバーを
       広げるとCompare view windowがサイドバーの上に載る"). Pushes the window right if the now-wider sidebar
       would overlap it. */
    window._cmpReclamp=function(){ try{ if(!win||win.style.display==='none') return; if(window.matchMedia('(max-width:768px)').matches) return;
      const sb=document.getElementById('sidebar'); if(!sb||sb.classList.contains('collapsed')) return;
      const sr=sb.getBoundingClientRect(), wr=win.getBoundingClientRect();
      if(sr.width>0 && sr.left<=2 && wr.left < sr.right+8){ win.style.right='auto'; win.style.left=(sr.right+12)+'px'; try{ cmap.render.resize(); }catch(_){} if(mode!=='free') syncFromMain(); } }catch(_){} };
    /* entry button in the Layers dropdown */
    /* (#R17) Dedupe by the BUTTON, not the #cmp-mount wrapper — reorganizeLayerPanel MOVES the button into
       #layer-tools and removes the wrapper, so the old wrapper-guard let a later call create a SECOND button
       ("Tools二重" on mobile). Re-file into Tools right after mounting so the section never goes missing. */
    function mountButton(){ const dd=document.getElementById('layer-dropdown'); if(!dd||document.getElementById('btn-compare')) return;
      const wrap=document.createElement('div'); wrap.id='cmp-mount'; wrap.style.marginTop='4px';
      wrap.innerHTML='<button id="btn-compare" class="ai-test-btn" style="width:100%;">🪟 <span>'+(window.IntMapLang.t(HOST.lang,"Open compare view","比較ビューを開く","Vergleichsansicht öffnen","Открыть режим сравнения","Abrir la vista de comparación"))+'</span></button>';
      dd.appendChild(wrap); wrap.querySelector('#btn-compare').onclick=open;
      try{ window.reorganizeLayerPanel&&window.reorganizeLayerPanel(); }catch(_){} }
    mountButton(); setTimeout(mountButton,1600);
    /* (#R27) Re-clamp the compare window off the sidebar whenever the sidebar slides open/closed or is
       resized (covers "サイドバーを広げるとcompare viewがサイドバーの上に載る"). The 450ms re-run waits out the
       0.4s sidebar slide so the final geometry is clamped, not the mid-transition one. */
    try{
      const _reclampSoon=()=>{ try{ window._cmpReclamp&&window._cmpReclamp(); }catch(_){} setTimeout(()=>{ try{ window._cmpReclamp&&window._cmpReclamp(); }catch(_){} },450); };
      window.addEventListener('intmap-sidebar-resize',_reclampSoon);
      document.addEventListener('click',(e)=>{ try{ if(e.target.closest&&e.target.closest('.btn-toggle-sidebar')) _reclampSoon(); }catch(_){} });
      const _sbEl=document.getElementById('sidebar'); if(_sbEl) _sbEl.addEventListener('transitionend',(e)=>{ if(e.propertyName==='margin-left'||e.propertyName==='width') _reclampSoon(); });
    }catch(_){}
    return { open, close, _map:()=>cmap };
  })();
};
