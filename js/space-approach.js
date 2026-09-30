/* ============================================================================
 *  IntMap · THE WAY INTO SPACE — window.IntMapSpace, before the explorer arrives  (#R201, split at startup-lazy-layers)
 * ----------------------------------------------------------------------------
 *  The space explorer (js/space.js — the WebGL solar system, the planets as globes, the probes, the
 *  small bodies and the deep sky, ~120 kB of source plus the three arithmetic modules only it reads)
 *  is fetched through js/lazy-modules.js (`spaceBody`). What has to exist from boot is this file:
 *
 *   · THE APPROACH. There is no button (#R201): the zoom-out the map can no longer spend at its floor
 *     is integrated, a gauge says so, and at the trigger the view crosses over. That gesture is read
 *     from the input on every session, so the integral, the gauge and `mount()`'s passive listeners
 *     live here, unchanged. The explorer reads them back through `_kit` (its own inbound gauge and
 *     `close()` reset the same integral), so there is one integral and one gauge, not two.
 *   · THE FACADE. js/app-body.js calls `mount()`; Atlas (js/atlas-console.js `space`) calls `open()`
 *     and `setRate()`. Those answer now: a call made before the explorer is here is queued on the ONE
 *     promise of its arrival (js/lazy-modules.js `lazyBody`), in the order it was made. When the
 *     explorer arrives it hands this object its own entry points (js/space.js, the end of the factory),
 *     so every later call goes straight to it. `ready()` is that arrival, for a caller that wants the
 *     whole API; `state()` before it says `loaded:false` rather than inventing the explorer's answers.
 *
 *  ⚠ THE DOWNLOAD STARTS AT THE HINT, NOT AT THE TRIGGER — see pushOut.
 * ==========================================================================*/
import { lazyBody } from './lazy-modules.js';
window.IntMapModules=window.IntMapModules||{};
window.IntMapModules.space=function(HOST){
  const GE=()=>window.IntMapGeoEngine;

  window.IntMapSpace=(function(){
    'use strict';
    const L=window.IntMapLang.pick(()=>HOST.lang);
    /* the explorer, once js/lazy-modules.js has mounted it (window.__imSpaceBody is what its factory returned) */
    const DOOR=lazyBody(()=>window.IntMapLazy.need('spaceBody'));
    const X=()=>(DOOR.arrived()&&window.__imSpaceBody)||null;
    const isOpen=()=>{ const b=X(); return !!(b&&b.isOpen()); };
    /* the crossing — the explorer's own, once it is here; until then, as soon as it is */
    function enterFromZoom(){
      const b=X(); if(b) return b.enterFromZoom();
      return DOOR.need().then((ok)=>{ const e=X(); return !!(ok&&e&&e.enterFromZoom()); });
    }

    /* ══ (#R201) THE WAY IN IS THE ZOOM ITSELF, NOT A BUTTON ═════════════════════════════════════════
       「宇宙を探索は、ボタンで押す形式ではなく、そのまま普段の状態から、ズームアウトし続ければそのまま
         宇宙まで行き、画面も出てくる形式に。」

       #R197 put a button at the zoom floor because the request it answered asked for one there. This
       one asks for the opposite: the floor should not be a wall with a door in it, it should be a
       place you keep going through. So the button is gone and what replaces it is the gesture that
       was already being made — the zoom-out that the renderer has nowhere left to spend.

       ⚠ THE RENDERER GIVES NO EVENT FOR A ZOOM THAT CANNOT HAPPEN. MapLibre clamps the camera at
       minZoom and reports nothing, so "the user is still asking to zoom out" can only be read from
       the INPUT. Two are watched, and they are the two that exist: the wheel/trackpad (deltaY > 0)
       and a two-finger pinch that is closing. Both are read PASSIVELY — nothing here preventDefaults
       anything, so at every zoom that is not the floor the map behaves exactly as it always has.

       ⚠ AND IT HAS TO BE SUSTAINED, NOT INSTANTANEOUS. One flick past the floor must not launch
       anybody into space, so the gesture is integrated in ZOOM LEVELS (the same unit the renderer
       uses: MapLibre's wheel rate is one level per ~300 units of deltaY) and the integral decays back
       to zero the moment the pushing stops. 「ズームアウトし続ければ」 is a duration, and this is it.
       While it is filling, a non-interactive gauge says so — it is feedback for a gesture already
       under way, not a control to press. */
    /* ⚠ ASK THE RENDERER, DO NOT ASSUME 0. js/geo-engine.js RAISES the effective minimum zoom in some
       projections, so "as far out as it goes" is a number that changes underneath this. */
    function minZoom(){
      try{ const v=GE().camera.getMinZoom&&GE().camera.getMinZoom(); if(isFinite(v)) return v; }catch(_){}
      return 0;
    }
    function zoomNow(){ try{ const c=GE().camera.get(); return (c&&isFinite(c.zoom))?c.zoom:99; }catch(_){ return 99; } }
    function atFloor(){ return zoomNow()<=minZoom()+0.06; }

    const OVER_TRIGGER=1.6;          /* zoom levels of refused zoom-out that mean "keep going" */
    const OVER_DECAY=900;            /* ms of no input after which the gesture has stopped */
    let over=0, overAt=0, gauge=null, gaugeFill=null, wiredMap=false, pinchD=0;

    /* ══ (#R207) THE CENTRE OF THE MAP IS NOT THE CENTRE OF THE WINDOW ═════════════════════════════
       「さらにズームアウトで宇宙への文字は地図空間の中央下に。現在はサイドバー開時にも絶対的な中央下の
        位置に配置されている。」

       Since #R160 the sidebars OVERLAY a map that stays full-width, so `left:50%` is the middle of the
       window and the middle of the map only when nothing is open. With the sidebar out, the caption
       sits under it or beside it — never in the middle of what the user is actually looking at.
       So the midpoint is MEASURED: the map's own box minus whatever panels are currently covering its
       edges. Recomputed each time the gauge is shown, because the sidebar can open while it is up. */
    function mapMidX(){
      try{
        const mc=document.getElementById('map-container');
        const r=mc?mc.getBoundingClientRect():{left:0,right:(window.innerWidth||0)};
        let l=r.left, rr=r.right;
        /* every panel that OVERLAYS the map and is actually on screen eats into it from its own side */
        ['#sidebar','#layer-sidebar-r','.mobile-sheet.open'].forEach(sel=>{
          try{ const el=document.querySelector(sel); if(!el) return;
            const cs=getComputedStyle(el);
            if(cs.display==='none'||cs.visibility==='hidden'||+cs.opacity===0) return;
            const b=el.getBoundingClientRect();
            if(b.width<=1||b.height<=1) return;
            /* a panel that does not reach into the map's box is not covering it */
            if(b.right<=l||b.left>=rr) return;
            const midEl=(b.left+b.right)/2, midMap=(l+rr)/2;
            if(midEl<midMap) l=Math.max(l,b.right); else rr=Math.min(rr,b.left);
          }catch(_){}
        });
        if(rr-l<120){ l=r.left; rr=r.right; }   /* everything covered → fall back to the whole map */
        return (l+rr)/2;
      }catch(_){ return (window.innerWidth||0)/2; }
    }
    function ensureGauge(){
      if(gauge) return gauge;
      gauge=document.createElement('div'); gauge.id='space-approach';
      /* ⚠ (#R207) …AND IT IS A PILL, IN BOTH THEMES. 「ライトモードの時に視認性が悪いので、ダーク/
         ライトモードともにピルで包んで。」 The caption was pale blue text with a shadow — legible over a
         night sky, invisible over a white basemap, which is exactly the view a light-mode user zooms
         out of. Wrapped in the app's own card surface so it carries its own contrast either way. */
      /* ══ ⚠⚠ (#R218) THE RETURN GAUGE WAS BEHIND THE SPACE VIEW ═══════════════════════════════════
         「宇宙から地球に戻る時にも、同じUIを表示し、いきなり戻ったという雰囲気にしないように。」 — sent
         again, and the reason is one number. #R210 made `paintGauge(v, inbound)` take WHICH caption to
         show and wired `pushIn` to call it, and that half is correct — but the gauge is a child of
         <body> at z-index 1250, and `#space-view` is a full-screen opaque `#000` at z-index **4200**
         (see openView). Outbound the gauge is over the map and visible; inbound it is painted, with
         the right caption and the right fill, UNDERNEATH the black sky it is describing. From the
         reader's side nothing at all happened until the map simply reappeared — which is exactly the
         report. It now sits above both, and above nothing else: 4300 is over the space view and still
         under the modals (#R148's dialog layer). */
      gauge.style.cssText='position:fixed;bottom:96px;transform:translateX(-50%);z-index:4300;'
        +'pointer-events:none;opacity:0;transition:opacity 180ms ease;display:flex;flex-direction:column;'
        +'align-items:center;gap:6px;font-size:12px;font-weight:700;'
        +'padding:9px 16px 11px;border-radius:999px;'
        +'color:var(--text-main,#dce6ff);background:var(--card-bg,rgba(18,22,32,0.9));'
        +'border:1px solid var(--glass-border,rgba(128,128,128,0.28));'
        /* (#R210) NO inline box-shadow: css/intmap.css gives #space-approach a white RIM GLOW in
           dark mode and the drop shadow in light. An inline value would beat both. */
        +'-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);';
      const cap=document.createElement('div'); cap.className='space-approach-cap';
      cap.textContent=L('Keep zooming out for space','さらにズームアウトで宇宙へ','Weiter herauszoomen für den Weltraum','Продолжайте отдалять — космос','Sigue alejando para ir al espacio');
      const bar=document.createElement('div');
      bar.style.cssText='width:132px;height:4px;border-radius:99px;background:rgba(128,150,190,0.28);overflow:hidden;';
      gaugeFill=document.createElement('div');
      gaugeFill.style.cssText='height:100%;width:0%;border-radius:99px;background:linear-gradient(90deg,var(--primary-color,#6ea8ff),#cfe0ff);';
      bar.appendChild(gaugeFill); gauge.appendChild(cap); gauge.appendChild(bar);
      document.body.appendChild(gauge);
      return gauge;
    }
    /* ══ (#R210) THE WAY BACK GETS THE SAME UI AS THE WAY OUT ═════════════════════════════════════
       「宇宙から地球に戻る時にも、同じUIを表示し、いきなり戻ったという雰囲気にしないように。」 `pushIn`
       (below) has run the same integral as `pushOut` since #R208 — a zoom-in the space camera cannot
       spend returns the map — but it drew nothing, so from the user's side the map simply reappeared
       with no gesture having visibly been in progress. Same pill, same bar, opposite caption.
       `paintGauge` therefore takes WHAT to show rather than reading `over` itself. */
    function paintGauge(v,inbound){
      if(!v){ if(gauge) gauge.style.opacity='0'; return; }
      const g=ensureGauge();
      g.style.left=Math.round(mapMidX())+'px';   /* (#R207) */
      g.style.opacity='1';
      try{ const cap=g.querySelector('.space-approach-cap'); if(cap) cap.textContent=inbound
        ? L('Keep zooming in to return to the map','さらにズームインで地図へ戻る','Weiter hineinzoomen zurück zur Karte','Продолжайте приближать — назад к карте','Sigue acercando para volver al mapa')
        : L('Keep zooming out for space','さらにズームアウトで宇宙へ','Weiter herauszoomen für den Weltraum','Продолжайте отдалять — космос','Sigue alejando para ir al espacio'); }catch(_){}
      gaugeFill.style.width=Math.round(100*Math.min(1,v/OVER_TRIGGER))+'%';
    }
    /* ⚠ (#R212) THE PROMPT STARTS BEFORE THE FLOOR. 「さらにズームアウトで宇宙への開始ズームレベルを
       もう少し前から始まるように。」 The gauge only existed once the map had NOTHING left to give: the
       first sign that space was an option arrived at the exact moment zooming out stopped working,
       which reads as the map having broken. It now appears as a primed hint while the last three
       quarters of a zoom level are being spent — the map is still zooming, nothing is being counted
       towards the trigger, and the caption says what continuing will do. The integral itself still
       only accumulates on refused zoom-out, so a normal zoom-out can never fall into space. */
    /* ⚠⚠ (#R216) 0.75 → 2.0. 「宇宙への開始ズームレベルをもう少し前から始まるように。」 — the third
       round this sentence has been sent. #R212 did put the prompt before the floor, but three
       quarters of ONE zoom level is a single wheel notch on a mouse and less than one pinch on a
       phone: the hint appeared and the floor arrived in the same gesture, which is indistinguishable
       from the hint appearing AT the floor. Two full zoom levels is about three notches of warning,
       so the reader learns that space is down there while the map is still zooming normally.
       ⚠ The trigger itself is untouched: `over` only accumulates on REFUSED zoom-out (`atFloor()`),
       so widening the hint cannot make an ordinary zoom-out fall into space. */
    const NEAR_FLOOR=2.0;
    function nearFloor(){ return zoomNow()<=minZoom()+NEAR_FLOOR; }
    /* the integral, in zoom levels; `dz` is how much zoom-out the gesture just asked for */
    /* ══ ⚠ (#R289) THE FLAT MAP DOES NOT LEAD TO SPACE ══════════════════════════════════════════
       「Flat地図では、ズームし続ければ宇宙へ行く機能を無効に。」 The crossing is written for the
       globe: it hands the space camera the size and the FACE the Earth had on screen (see
       handoverRadiusPx and the axis note above), which is a statement about a sphere. On the flat
       projection there is no such face — Web Mercator at the zoom floor is a rectangle — so the
       gesture was arriving somewhere the map had not been.
       ⚠ THE GAUGE GOES WITH IT, not just the trigger: a primed hint that can never fire is the
       worse half of the defect. `leaveToMap()` is untouched, so a session that is already in space
       and switches to flat can still come back the same way it always could. */
    function flatProj(){ try{ return HOST.proj!=='globe'; }catch(_){ return false; } }
    function pushOut(dz){
      if(flatProj()){ if(over){ over=0; paintGauge(0); } return; }
      if(isOpen()||!(dz>0)) return;
      /* (startup-lazy-layers) the explorer starts downloading when the primed hint first shows — two
         zoom levels before the floor (NEAR_FLOOR) — so by the time the integral reaches the trigger it
         is normally already here. An ordinary zoom-out that stops short costs one background fetch. */
      if(!DOOR.asked()&&nearFloor()) DOOR.need();
      if(!atFloor()){
        if(over){ over=0; }
        if(nearFloor()){ paintGauge(OVER_TRIGGER*0.12,false); if(overTmr) clearTimeout(overTmr);
          overTmr=setTimeout(()=>{ over=0; paintGauge(0); },OVER_DECAY); }
        else paintGauge(0);
        return; }
      const t=(typeof performance!=='undefined'?performance.now():Date.now());
      if(overAt&&t-overAt>OVER_DECAY) over=0;
      overAt=t;
      over=Math.min(OVER_TRIGGER*1.5, over+Math.min(0.5,dz));
      if(over>=OVER_TRIGGER){ over=0; paintGauge(0); enterFromZoom(); return; }
      paintGauge(over,false);
      if(overTmr) clearTimeout(overTmr);
      overTmr=setTimeout(()=>{ over=0; paintGauge(0); },OVER_DECAY);
    }
    let overTmr=0;

    function mount(){
      if(wiredMap) return; wiredMap=true;
      let cont=null; try{ cont=GE().render.canvasContainer&&GE().render.canvasContainer(); }catch(_){}
      if(!cont) cont=document.getElementById('map')||document.body;
      /* MapLibre's own wheel rate is one zoom level per ~300 units of deltaY (js/wheel-zoom.js sets
         it), so the same divisor keeps this integral in the same unit the map is refusing to move in.
         Line/page deltas are normalised the way the renderer normalises them. */
      cont.addEventListener('wheel',(e)=>{
        let d=e.deltaY||0; if(e.deltaMode===1) d*=16; else if(e.deltaMode===2) d*=100;
        if(d>0) pushOut(Math.min(0.5,d/300));
      },{passive:true});
      cont.addEventListener('touchstart',(e)=>{ if(e.touches&&e.touches.length===2)
        pinchD=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY); },{passive:true});
      cont.addEventListener('touchmove',(e)=>{
        if(!e.touches||e.touches.length!==2) return;
        const d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);
        if(pinchD>0&&d>0&&d<pinchD) pushOut(Math.log2(pinchD/d));
        pinchD=d;
      },{passive:true});
      const endPinch=()=>{ pinchD=0; };
      cont.addEventListener('touchend',endPinch,{passive:true});
      cont.addEventListener('touchcancel',endPinch,{passive:true});
      /* the map moved somewhere that is not the floor → the gesture is no longer about leaving */
      try{ GE().events.on('moveend',()=>{ if(!isOpen()&&over&&!atFloor()){ over=0; paintGauge(0); } }); }catch(_){}
    }

    /* what the explorer reads back (js/space.js destructures it): ONE integral and ONE gauge */
    const _kit={ atFloor, nearFloor, paintGauge, OVER_TRIGGER, OVER_DECAY, pushOut,
      gaugeEl:()=>gauge, overNow:()=>over, resetOver:()=>{ over=0; },
      gaugeShown:()=>!!(gauge&&gauge.style.opacity==='1') };
    return {
      _kit, mount, ready:()=>DOOR.need(),
      open:(o)=>{ const b=X(); if(b) return b.open(o); return DOOR.need().then((ok)=>{ const e=X(); return !!(ok&&e&&e.open(o)); }); },
      close:()=>{ const b=X(); return b?b.close():true; },
      setRate:(r)=>{ DOOR.run((ok)=>{ const e=X(); if(ok&&e) e.setRate(r); }); },
      isOpen, atFloor, nearFloor, _pushOut:pushOut, enterFromZoom,
      state:()=>({ open:false, loaded:false, overzoom:+over.toFixed(3), overTrigger:OVER_TRIGGER,
        gaugeVisible:_kit.gaugeShown(), atFloor:atFloor(), atNearLimit:false, err:null }),
    };
  })();
};
