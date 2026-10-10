/* ============================================================================
 *  IntMap · Side-by-side / swipe map comparison — IntMapCompare  (#R163)
 * ----------------------------------------------------------------------------
 *  A second synchronised MapLibre instance for comparing base maps and raster layers,
 *  with sync / free / x-ray / swipe modes and four-corner resizing.
 *  (then-now-card) The swipe is 「あの頃といま」: this window's map over the whole map at the main camera, cut at a
 *  divider the reader drags — this window's instant left of it, the main map's right (`thenNow`, below).
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
import { everyTick, stopTick } from './runtime.js';   /* (#R408) the one timer wheel — see js/runtime.js */
/* (fetch-deadline-layer) THE COMPARE WINDOW'S FOUR NETWORK LAYERS READ UNDER A CLOCK, AND SAY WHEN THEY GOT NOTHING.
   Plates, aurora, earthquakes and historical borders were bare `fetch(…).then(r=>r.json())` with `.catch(()=>{})`:
   a host that stopped answering left the box ticked over an empty map for the session, and a host that refused
   looked exactly the same. Each is js/fetch-deadline.js `jsonWithin` under js/proxy-fetch.js `clockFor` now, and its
   failure path is the app's toast (`cmpFail`) — the sentence the main map already uses for the same failure. */
import { jsonWithin } from './fetch-deadline.js';
import { clockFor } from './proxy-fetch.js';
import { loadData } from './data-door.js';   /* (data-one-door) the shipped data/ files, one read each */
import { IntMapGeoEngine } from './geo-engine.js';
import { IntMapLang } from './lang-registry.js';
/* (time-compare-lapse) the main map's clock, and the factory this window makes its own clock with */
import { IntMapTime, makeClock } from './chronos.js';
import { MapState } from './map-state.js';   /* (map-state-store) this file owns the map state's `compare` field — see below */
import { icon } from './icons.js';   /* (icon-system) the one icon set — js/icons.js */
import * as bus from './bus.js';
import { ERA_BORDER_CREDIT } from './time-borders.js';   /* (then-now-card) the era border records' one credit */

/* ══ (time-compare-lapse) THE WINDOW'S TIME, BY IMPORT ═════════════════════════════════════════════════════
   The comparison window holds a clock of its own (below). The readers of that fact — the share link (through
   this file's own `compare` field of the map state, below), Atlas's capability, its observer and its state
   (js/atlas-cap-time.js, js/atlas-capabilities.js, js/atlas-state.js) — import this face from its owner rather than reaching
   through `window.IntMapCompare` (scripts/global-surface.mjs counts every such reach). It answers null until
   js/app-body.js has created the window's controller with `compare(HOST)`. */
let _cmpApi=null; const _cmpSubs=new Set();
export const compareTime={
  /** what the window shows and why — see `timeState` below; null before the window exists */
  state:()=>(_cmpApi&&_cmpApi.timeState?_cmpApi.timeState():null),
  /** setTime({ year | date | now | follow | param }) */
  set:(o)=>(_cmpApi&&_cmpApi.setTime?_cmpApi.setTime(o):null),
  /** the share link's value ('' while the window follows the main map) */
  param:()=>(_cmpApi&&_cmpApi.timeParam?_cmpApi.timeParam():''),
  /** resolves with `state()` once the picked layer has been judged at the window's instant */
  judged:()=>(_cmpApi&&_cmpApi.judged?_cmpApi.judged():Promise.resolve(null)),
  open:()=>{ if(_cmpApi) _cmpApi.open(); },
  /** (then-now-card) 「あの頃といま」 thenNow({ then?, now?, split?, layer? }) → { state, needsThen } | null — see js/compare.js thenNow */
  thenNow:(o)=>(_cmpApi&&_cmpApi.thenNow?_cmpApi.thenNow(o):null),
  /** fn() whenever the window's instant or its follow choice changes; returns the unsubscribe */
  on:(fn)=>{ if(typeof fn!=='function') return ()=>{}; _cmpSubs.add(fn); return ()=>{ _cmpSubs.delete(fn); }; },
};

/* ══ (map-state-store) THE WINDOW IS A FIELD OF THE MAP'S STATE, AND THIS FILE IS ITS OWNER ═══════════════════
   js/map-state.js spells it in the address bar as `cmp=1|x` and `ct=<the window's instant>` (absent `ct`: the
   window follows the main map's clock — a statement, as an absent `tt` is). The value is read off the window
   itself, and a restore opens the window through the same door the reader's button and Atlas use; the X-ray
   mode is pressed 700 ms later (its button exists once the window has built), under the same restore generation.
   (then-now-card) The swipe is spelled `cmp=s` (the divider in the middle) or `cmp=s<percent>`, and is restored through the
   controller's own door (`setMode` / `setSplit`) at the same moment the X-ray is. */
MapState.own('compare', {
  read: () => { try { const cw = document.getElementById('compare-window');
    if (!cw || getComputedStyle(cw).display === 'none') return null;
    const st = compareTime.state();
    return { xray: cw.classList.contains('cmp-xray'), swipe: st && st.mode === 'swipe' && st.split != null ? Math.round(st.split * 100) : null, at: compareTime.param() }; } catch (_) { return null; } },
  apply: (v, ctx) => { if (!v) return; try {
    compareTime.open(); compareTime.set(v.at ? { param: v.at } : { follow: true });
    if (v.swipe != null) ctx.later(() => { if (_cmpApi) { _cmpApi.setMode('swipe'); _cmpApi.setSplit(v.swipe / 100); } }, 700);
    else if (v.xray) ctx.later(() => { const xb = Array.from(document.querySelectorAll('#compare-window .cmp-btn')).find((b) => /x-ray/i.test(b.textContent)); if (xb) xb.click(); }, 700);
  } catch (_) { } },
});
compareTime.on(() => MapState.changed('compare'));   /* the window's instant is part of the link */

/* (time-compare-lapse) the window's own layer that no main-map layer reads, declared in js/layer-time.js's vocabulary
   (exported: tests/time-compare-lapse-checks.test.mjs runs it through the same `validate` the gate uses) */
const LA=/** @type {(...a: string[]) => string[]} */ (IntMapLang.pickArgs());
/* NASA GIBS's own extent for this product — its DescribeDomains document, read 2026-10-01:
   1980-01-01/2023-11-01/P1M, then months with holes, the last range ending 2026-06-01. The first month is
   the bound; the end is left unread here because upstream keeps publishing (a later month it lacks is an
   empty tile, as on the main map's GIBS rows). */
export const MERRA2=Object.freeze({ kind:'record', from:'1980-01-01',
  by:'NASA GIBS WMTS DescribeDomains, MERRA2_2m_Air_Temperature_Monthly (GoogleMapsCompatible_Level6), read 2026-10-01',
  follows:'js/compare.js dayOf',
  says:LA('MERRA-2 monthly air temperature (NASA GIBS)','MERRA-2 月平均気温（NASA GIBS）') });

export function compare(HOST){
  const cmpRead=(u)=>jsonWithin(u,clockFor(u),undefined,{idle:true});   /* (fetch-deadline-layer) see the note at the imports */
  const cmpFail=(msg)=>{ try{ HOST.imToast(msg); }catch(_){ /* no toast surface yet */ } };
  const GE=()=>IntMapGeoEngine;   /* (#R178) the renderer, through the contract — never the raw handle */
  /* (compare-window-resize) «is this a phone layout» — the device module's own predicate, read in ONE place (it was read three times here) */
  const _compact=()=>{ try{ return !!window.IntMapDevice.compact(); }catch(_){ return false; } };
  const countryStats=HOST.countryStats, isMobile=HOST.isMobile, loadCountryData=HOST.loadCountryData, t=HOST.t;
  /* ══ ⚠⚠ (#R668) 「携帯か」 IS A QUESTION ABOUT THE DEVICE, NOT ABOUT 768 px ═══════════════════════
     `isMobile()` is a max-width media query, so it answers FALSE for an iPhone held sideways (844 px)
     — the same phone, the same GPU. Every COST decision that asks it hands that phone the desktop
     budget; here that means the full-resolution Köppen PNG in a SECOND WebGL context, which is the
     exact crash #R29.1 fixed. One owner of the answer: js/mem-budget.js (the predicate is NOT copied
     here — three files that copied it each dropped a clause, #R499). Until the shell has published
     the page's answer the owner falls back to this file's own `isMobile`, so it is never worse. */
  const _phoneDev=()=>{ try{ return window.IntMapMemBudget.deviceIsPhone(isMobile); }catch(_){ return typeof isMobile==='function'&&isMobile(); } };
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
    /* (then-now-card) the two modes in which this window's map is REGISTERED to the main camera pixel for pixel: the
       X-ray lens, and the swipe — the same registered camera, clipped at a divider the reader drags (below) */
    const swipeOn=()=>mode==='swipe';
    const lensOn=()=>mode==='xray'||mode==='swipe';
    const MODES=['sync','free','xray','swipe'];
    /* the mode buttons' door and the picker's, bound once the window is built (build below); the last mode the share link was told */
    let _setMode=(/** @type {string} */ m)=>{ void m; }, _pickLayer=(/** @type {string} */ k)=>{ void k; return false; }, prevAnnounced='sync';
    /* ══ (time-compare-lapse) THIS WINDOW IS A MAP AT ITS OWN INSTANT ═════════════════════════════
       「1914 年 | 今日」. The window had no clock: every layer in it drew what it fetched, and the
       historical borders drew whatever year the MAIN map's historical layer last loaded (or 1914,
       typed). It now holds a clock of its own (js/chronos.js `makeClock`), and every layer in the
       picker is judged by the SAME rule the main map uses — js/layer-time-kernel.js `verdict(id,
       clock, drawnBy)` — against THIS clock: a layer whose source states nothing about the instant is
       not drawn here and the window says why; a layer that follows the clock is asked for the instant.
       `follow` (the default) keeps the two clocks equal, so a window that was never given a time of
       its own shows what it always showed beside a map at the same instant. */
    const CT=makeClock('compare');
    let follow=true;
    function mirror(){ if(!follow) return;
      const d=IntMapTime.get();
      if(d) CT.set(d,{allowFuture:true,source:'follow'}); else CT.setNow({source:'follow'}); }
    IntMapTime.on(()=>mirror());
    const KC=window.KCOORDS||[[-180,85.0511],[180,85.0511],[180,-85.0511],[-180,-85.0511]];
    /* (#R29.1) Use the MOBILE 4k texture on phones — exactly like the main map's koppenDisplayURL().
       The compare map is a SECOND WebGL context; loading the full-res Köppen PNG there (on top of the main
       map's) doubled GPU memory and OOM-crashed iPhone Safari ("iPhoneでcompare viewでケッペン…ブラウザが落ちる").
       ⚠ (#R668) …and that fix was only in force in PORTRAIT: asked by width, the phone turned sideways
       took the desktop arm and loaded the full-res PNG into the second context again. It asks the
       device now (`_phoneDev`, above) — the crash came back with the orientation, not with the phone. */
    const koppenPeriods=()=>window.KOPPEN_PERIODS||[];   /* js/data-layers.js — the periods and their rasters */
    function koppenUrl(period){ try{ const want=period||window._koppenPeriod; const p=koppenPeriods().find(x=>x[0]===want); let u=p?p[1]:'koppen_mercator_1991-2020.png'; if(_phoneDev()) u=u.replace(/\.png$/,'_4k.png'); return u; }catch(_){ return 'koppen_mercator_1991-2020.png'; } }
    /* (time-compare-lapse) the Köppen period that holds this window's year — read off js/data-layers.js
       KOPPEN_PERIODS (`'1901-1930'` …), so the periods are the main map's and are not listed here. On the
       live clock the reader's own legend choice stands, as it always did; past the newest period the newest
       is shown (the declaration carries it, `carry: 'last'`, and the verdict says so). */
    function koppenPeriodAt(clock){ if(clock.isLive()) return null;   /* null → the reader's legend choice (koppenUrl) */
      const y=clock.when().getUTCFullYear(); const P=koppenPeriods();
      const span=(k)=>String(k).split('-').map(Number);
      const hit=P.find(x=>{ const s=span(x[0]); return y>=s[0]&&y<=s[1]; });
      if(hit) return hit[0];
      const newest=P.reduce((b,x)=>(!b||span(x[0])[1]>span(b[0])[1])?x:b,null);
      return newest?newest[0]:null; }
    function injectCSS(){ if(document.getElementById('cmp-css')) return; const st=document.createElement('style'); st.id='cmp-css'; st.textContent=
      /* ⚠ (#R258) 2200, NOT 4000 — the card band css/intmap.css §「WHO IS IN FRONT」 defines. This is a
         window the reader reaches into, so it has to obey the same rule every other one does: an open
         sidebar (2600) covers it, and touching it raises it above the sidebar (`.im-front`, 2650).
         At 4000 it sat permanently in front of BOTH sidebars and clicking the left sidebar could not
         bring it forward, which is the half of that instruction that kept coming back. The MOBILE
         rule below is untouched: the band is desktop-only (the phone's sheet has its own order). */
      '#compare-window{position:fixed;right:24px;bottom:24px;width:440px;height:340px;min-width:260px;min-height:200px;z-index:var(--z-window);background:var(--card-bg);border:1px solid rgba(128,128,128,0.28);border-radius:14px;box-shadow:0 18px 50px rgba(0,0,0,0.4);overflow:hidden;resize:none;display:flex;flex-direction:column;}'+
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
      '#cmp-close{position:absolute;top:6px;right:7px;z-index:calc(var(--z-inset) + 30);width:28px;height:28px;border-radius:8px;background:rgba(128,128,128,0.16);font-size:13px;}'+
      '#cmp-close:hover{background:#ff3b30;color:#fff;}'+
      '.cmp-seg{display:inline-flex;background:var(--input-bg);border-radius:9px;padding:2px;gap:2px;flex:0 0 auto;}'+
      '.cmp-seg .cmp-btn{background:transparent;border-radius:7px;padding:4px 9px;}'+
      '.cmp-seg .cmp-btn.on{background:var(--primary-fill);color:#fff;box-shadow:0 1px 4px rgba(0,0,0,0.12);}'+
      '.cmp-icon{width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;padding:0;border-radius:8px;flex:0 0 auto;}'+
      /* (#R24) touch-action:manipulation → compare buttons (Map/Sat/Sync/Free/X-ray/min/close) fire on the
         FIRST tap with no iOS 300ms delayed/retargeted click — a big reason map/satellite "押しても変わらない"
         and the close "終了できない" on mobile. */
      '.cmp-btn{background:var(--input-bg);border:none;color:var(--text-main);border-radius:7px;padding:4px 8px;font-size:11px;font-weight:600;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;}'+
      '.cmp-btn.on{background:var(--primary-fill);color:#fff;}'+
      '.cmp-body{position:relative;flex:1 1 auto;min-height:0;}'+
      '#compare-map{position:absolute;inset:0;}'+
      /* (#R31) layer picker row directly under the control segments. */
      '.cmp-picker{flex:0 0 auto;padding:6px 10px 8px;background:var(--sidebar-bg);border-bottom:1px solid rgba(128,128,128,0.14);position:relative;z-index:calc(var(--z-inset) + 8);pointer-events:auto;}'+
      '#compare-window.cmp-xray .cmp-picker{pointer-events:auto !important;z-index:calc(var(--z-inset) + 9);position:relative;}'+   /* (#R33) picker stays clickable in x-ray */
      '.cmp-picker select{width:100%;box-sizing:border-box;background:var(--input-bg);color:var(--text-main);border:1px solid rgba(128,128,128,0.28);border-radius:8px;padding:7px 9px;font-size:12.5px;font-weight:600;cursor:pointer;}'+
      /* (time-compare-lapse) the window's own clock: a segmented follow/own control, a year field and «Now» on one
         row under the picker; the sentence about the picked layer at that instant under it; and the two instants as a
         pill on the map («1914 | Today»), the window's own in bold */
      '.cmp-time{display:flex;align-items:center;gap:6px;margin-top:6px;flex-wrap:wrap;}'+
      '.cmp-time .cmp-seg .cmp-btn{padding:5px 9px;}'+
      '.cmp-year{width:84px;box-sizing:border-box;background:var(--input-bg);color:var(--text-main);border:1px solid rgba(128,128,128,0.28);border-radius:8px;padding:5px 8px;font-size:12px;font-weight:600;font-variant-numeric:tabular-nums;}'+
      '.cmp-tnote{margin-top:6px;font-size:11px;line-height:1.4;color:var(--text-muted);}'+
      '.cmp-tnote.cmp-tnote-held{color:var(--text-main);}'+
      '.cmp-when{position:absolute;top:8px;right:8px;z-index:calc(var(--z-inset) + 4);display:flex;align-items:baseline;gap:6px;padding:4px 10px;border-radius:999px;background:var(--popup-bg);color:var(--text-muted);border:1px solid rgba(128,128,128,0.25);font-size:11.5px;font-variant-numeric:tabular-nums;backdrop-filter:saturate(180%) blur(10px);-webkit-backdrop-filter:saturate(180%) blur(10px);pointer-events:none;}'+
      '.cmp-when b{color:var(--text-main);font-size:13px;}'+
      '.cmp-when.cmp-when-own b{color:var(--primary-color);}'+
      '.cmp-when-sep{opacity:0.5;}'+
      '.cmp-ctrls{position:absolute;top:8px;left:8px;z-index:calc(var(--z-inset) + 5);display:flex;flex-wrap:wrap;gap:4px;max-width:calc(100% - 16px);}'+
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
      '#compare-window.cmp-xray::after{content:"";position:absolute;inset:0;border:1.5px solid rgba(150,160,175,0.72);border-radius:14px;pointer-events:none;z-index:calc(var(--z-inset) + 20);}'+
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
      '#compare-window.cmp-xray .cmp-head{background:#f3f4f7 !important;position:relative;z-index:calc(var(--z-inset) + 7);border-bottom:1px solid rgba(128,128,128,0.3);box-shadow:0 2px 10px rgba(0,0,0,0.18);}'+
      '[data-theme="dark"] #compare-window.cmp-xray .cmp-head{background:#1a1c22 !important;box-shadow:0 2px 10px rgba(0,0,0,0.45);}'+
      '#compare-window.cmp-xray .cmp-head .cmp-title{color:var(--text-main) !important;}'+
      '#compare-window.cmp-xray .cmp-btn{background:var(--input-bg) !important;color:var(--text-main) !important;}'+
      '#compare-window.cmp-xray .cmp-btn.on{background:var(--primary-fill) !important;color:#fff !important;}'+
      '#compare-window.cmp-xray #cmp-close{background:#ff3b30 !important;color:#fff !important;}'+
      '#compare-window.cmp-xray .cmp-ctrls{pointer-events:auto;z-index:calc(var(--z-inset) + 6);}'+
      '#compare-window.cmp-xray .cmp-ctrls select{background:var(--input-bg) !important;color:var(--text-main) !important;}'+
      /* (#R18) In lens mode the compare map is pulled out to cover the whole container (clipped to the
         window). Keep it BELOW the header/controls and give it a cyan edge so the lens boundary reads. */
      '#compare-window.cmp-xray #compare-map{box-shadow:none;}'+
      /* (#R15d) MOBILE: the 440px resizable window + the full-cover x-ray were "ほぼ使えない / どうにもできない".
         Make it a clean full-width TOP panel with big tappable header buttons; x-ray still overlays for
         alignment but its header is a tall, opaque bar so Close/X-ray are always reachable. */
      /* (#R16) MOBILE compare: smaller default (44vh, was "大きすぎる") + a touch resize grip (.cmp-resize)
         so the height IS adjustable ("大きさ調節できない" fixed). Native CSS resize ignores touch, hence the grip. */
      /* (then-now-card) THE SWIPE: the window keeps its controls (the layer, the year) and gives its map to the divider;
         the map sits beside #map under every overlay; the divider is a white line with an iOS-style grip, and the two
         instants ride on either side of it, just above the grip (the top and the bottom of the map belong to the window,
         the controls and the phone's sheet). The grip is a rounded rectangle like every other control here (#R35). */
      '#compare-window.cmp-swipe{height:auto !important;min-height:0 !important;}'+
      '#compare-window.cmp-swipe .cmp-body{display:none;}'+
      '#compare-map.cmp-swiping{position:absolute;inset:0;z-index:calc(var(--z-inset) + 1);pointer-events:none;}'+
      '#compare-map.cmp-swiping *{pointer-events:none !important;}'+
      '#cmp-swipe{--cmp-split:50%;position:absolute;inset:0;pointer-events:none;z-index:calc(var(--z-map-overlay) - 1);}'+
      '#cmp-swipe[hidden]{display:none;}'+
      '#cmp-swipe .cmp-sw-hit{position:absolute;top:0;bottom:0;left:var(--cmp-split);width:32px;margin-left:-16px;pointer-events:auto;touch-action:none;cursor:ew-resize;-webkit-tap-highlight-color:transparent;}'+
      '#cmp-swipe .cmp-sw-line{position:absolute;top:0;bottom:0;left:50%;width:2px;margin-left:-1px;background:#fff;box-shadow:0 0 0 0.5px rgba(0,0,0,0.28),0 0 10px rgba(0,0,0,0.28);}'+
      '#cmp-swipe .cmp-sw-grip{position:absolute;left:50%;top:50%;width:28px;height:52px;margin:-26px 0 0 -14px;border-radius:14px;background:rgba(255,255,255,0.96);box-shadow:0 2px 10px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;gap:4px;}'+
      '#cmp-swipe .cmp-sw-grip::before,#cmp-swipe .cmp-sw-grip::after{content:"";width:2px;height:18px;border-radius:1px;background:rgba(60,60,67,0.55);}'+
      '#cmp-swipe .cmp-sw-hit:focus-visible .cmp-sw-grip{box-shadow:0 0 0 3px var(--primary-color),0 2px 10px rgba(0,0,0,0.3);}'+
      '#cmp-swipe .cmp-sw-lab{position:absolute;top:calc(50% - 30px);transform:translateY(-100%);padding:5px 11px;border-radius:999px;background:rgba(20,22,28,0.72);color:#fff;font-size:13px;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap;backdrop-filter:saturate(180%) blur(10px);-webkit-backdrop-filter:saturate(180%) blur(10px);}'+
      '#cmp-swipe .cmp-sw-then{right:calc(100% - var(--cmp-split) + 14px);}'+
      '#cmp-swipe .cmp-sw-now{left:calc(var(--cmp-split) + 14px);}'+
      '.cmp-resize{display:none;}'+
      '@media'+window.IntMapDevice.COMPACT+'{'+
      '#compare-window{left:6px !important;right:6px !important;top:max(8px,var(--safe-top)) !important;bottom:auto !important;width:auto !important;height:46vh !important;min-width:0 !important;resize:none !important;border-radius:16px;padding-bottom:20px;z-index:calc(var(--z-toast) + 1200);overflow:hidden;}'+
      '.cmp-resize{display:block;position:absolute;left:0;right:0;bottom:0;height:24px;cursor:ns-resize;touch-action:none;z-index:calc(var(--z-inset) + 7);}'+
      '.cmp-resize::after{content:"";position:absolute;left:50%;bottom:6px;transform:translateX(-50%);width:42px;height:4px;border-radius:2px;background:rgba(150,160,175,0.7);}'+
      /* (#R30/#R31) Clean iOS header — NO chaotic flex-wrap. Title on its own line; the two segmented
         controls fill an even second row; the layer picker is its own row beneath. Close + Minimise are
         SQUARE (rounded-rect like the other controls — "ふちをまるではなく四角に"), the × is an SVG that is
         perfectly centred ("中心からずれている"), the minimise a single clean line ("二重線がある"). */
      '.cmp-head{display:flex !important;flex-wrap:wrap;padding:10px 92px 10px 14px;gap:7px;align-items:center;cursor:default;}'+
      '.cmp-head .cmp-title{flex:1 1 100%;font-size:14px;margin:0;}'+
      '.cmp-head .cmp-seg{flex:1 1 0;display:flex;background:var(--input-bg);border-radius:9px;padding:2px;gap:2px;}'+
      '.cmp-head .cmp-seg .cmp-btn{flex:1 1 0;min-width:0;padding:7px 4px;font-size:12px;min-height:32px;background:transparent;border-radius:7px;}'+
      '.cmp-head .cmp-seg .cmp-btn.on{background:var(--primary-fill);color:#fff;}'+
      '#cmp-close,#cmp-min{position:absolute !important;top:10px;z-index:calc(var(--z-inset) + 30) !important;pointer-events:auto !important;width:34px;height:34px;min-width:34px;border-radius:9px;padding:0;display:flex !important;align-items:center;justify-content:center;background:var(--input-bg) !important;color:var(--text-main) !important;border:none;}'+
      '#cmp-close{right:10px;} #cmp-min{right:50px;}'+
      /* (#R30) Main-map FABs move to the BOTTOM-LEFT while compare is open — clear of the compare ×
         (top-right), the layer picker, AND the bottom-RIGHT timebar. Moved, never hidden. */
      'body.cmp-open .m-fab-stack{top:auto !important;bottom:calc(var(--safe-bottom) + 84px) !important;left:12px !important;right:auto !important;transform:none !important;opacity:1 !important;pointer-events:auto !important;}'+
      '#compare-window.cmp-xray .cmp-head{padding:10px 92px 10px 14px;}'+
      '.cmp-picker select{min-height:40px;font-size:13px;}'+
      '}';
      document.head.appendChild(st); }
    function compareStyle(){ const dark=document.documentElement.getAttribute('data-theme')==='dark';
      return { version:8, glyphs:'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf', sources:{
        'cmp-carto':{type:'raster',tiles:window.cartoTiles('rastertiles/voyager',{hosts:['a','b','c']}),tileSize:256,attribution:window.CARTO_ATTRIBUTION},
        'cmp-dark':{type:'raster',tiles:window.cartoTiles('dark_all',{hosts:['a','b','c']}),tileSize:256,attribution:window.CARTO_ATTRIBUTION},
        /* (#R34) Same two-host Esri imagery as the MAIN map so compare satellite is byte-identical quality
           ("Compare viewでも同一品質のレイヤーを") and not throttled to one host.
           ⚠ (#R668) `maxzoom` STAYS A WIDTH QUESTION HERE, DELIBERATELY — but it is a COPY of a decision
           that is documented somewhere else, and an undocumented copy is how two answers drift apart in
           silence. The reasoning lives at js/app-body.js:145-146: maxZoom (18 on phones, 19 elsewhere)
           is a CAPABILITY, not a cost, and #R498 asked and was told to leave landscape at 19. If that
           answer ever changes, it changes in BOTH places — the compare map is supposed to be the same
           quality as the main one, which is the whole point of the paragraph above. */
        'cmp-sat':{type:'raster',tiles:['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}','https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],tileSize:256,maxzoom:(typeof isMobile==='function'&&isMobile())?18:19,attribution:'© Esri'},
        'cmp-koppen':{type:'image',url:koppenUrl(),coordinates:KC},
        'cmp-worldcover':{type:'raster',tiles:['https://wmts.terrascope.be/?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=esa-worldcover-map-10m-2021-v2_map&STYLE=default&TILEMATRIXSET=EPSG:3857&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/png&TIME=2021-01-01'],tileSize:256,maxzoom:14,attribution:'ESA WorldCover 2021 · Terrascope'},
        'cmp-relief':{type:'raster',tiles:window.cartoTiles('rastertiles/voyager',{hosts:['a']}),tileSize:256,attribution:window.CARTO_ATTRIBUTION}
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
      /* (time-compare-lapse) AT AN INSTANT AN ERA RECORD ANSWERS, THE MAP BASE IS PHYSICAL GEOGRAPHY — the main map's rule
         (js/historical-basemap.js): the CARTO raster draws TODAY's political boundaries and names, which a 1914 window
         would otherwise state under its 1914 borders. The same layer definitions, on this window's own vector source. */
      const era=eraAt(CT);
      if(baseKind==='map'&&era) ensureEraBase(!dark);
      setVis('cmp-base-carto',baseKind==='map'&&!dark&&!era); setVis('cmp-base-dark',baseKind==='map'&&dark&&!era); setVis('cmp-base-sat',baseKind==='sat');
      _eraBaseIds.forEach(id=>setVis(id,baseKind==='map'&&era)); }
    /* is this window's instant one an era record answers? — js/time-borders.js `modernAt`, the rule the main map uses */
    function eraAt(clock){ try{ return !window.IntMapTimeBorders.modernAt(clock.when(),clock.isLive()); }catch(_){ return false; } }
    let _eraBaseIds=[], _eraLight=null;
    function ensureEraBase(light){ const HB=window.IntMapHistoricalBasemap; if(!HB||!HB.definitions) return;
      try{
        if(!cmap.layers.hasSource('cmp-ofm')) cmap.layers.addSource('cmp-ofm',{type:'vector',url:'https://tiles.openfreemap.org/planet',attribution:'© OpenFreeMap © OpenMapTiles © OSM'});
        const defs=HB.definitions(light);
        /* below every overlay the window draws: above its raster bases, before its first data layer */
        const before=cmap.layers.has('cmp-lyr-worldcover')?'cmp-lyr-worldcover':undefined;
        defs.forEach(d=>{ const id='cmp-'+d.id;
          if(!cmap.layers.has(id)) cmap.layers.add(Object.assign({},d,{id,layout:Object.assign({},d.layout,{visibility:'none'})},d.source?{source:'cmp-ofm'}:{}),before);
          else if(_eraLight!==light) Object.entries(d.paint||{}).forEach(([k,v])=>{ try{ cmap.layers.setPaint(id,k,v); }catch(_){} }); });
        _eraBaseIds=defs.map(d=>'cmp-'+d.id); _eraLight=light;
      }catch(_){} }
    function setBase(kind){ baseKind=kind; const go=()=>{ try{ applyBase(); if(xrayOn()){ layoutXrayLens(); try{ cmap.render.resize(); }catch(_){} } }catch(_){} }; go(); setTimeout(go,180); setTimeout(go,600);   /* (#R32/#R32b) re-assert + re-fit the x-ray lens so Map/Sat always switches, incl. inside x-ray */
      /* (#R34) POLL until the wanted base actually shows — a click landing during the cmap style-load
         otherwise no-ops with nothing retrying ("Compare viewで…切り替えができないバグが発生する"). */
      try{ stopTick(_basePoll); let n=0; _basePoll=everyTick('compare:base-poll',150,()=>{ n++;
        try{ if(!cmap||baseKind!==kind){ stopTick(_basePoll); return; }
          if(cmap.layers.has('cmp-base-sat')){ const wantSat=(kind==='sat'), isSat=(cmap.layers.getLayout('cmp-base-sat','visibility')==='visible'); if(wantSat!==isSat) go(); else stopTick(_basePoll); } }catch(_){}
        if(n>30) stopTick(_basePoll); }); }catch(_){}
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
      try{ if(win&&win.style.display!=='none'&&!lensOn()){
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
        if(lensOn() && win){
          /* (#R18) TRUE LENS — compare covers the whole container at the EXACT main camera and is
             clipped to the window rect → pixel-perfect register on globe AND flat.
             (#R21) Drift fix ("一定以上メインマップを動かすとずれる"): the main camera carries PADDING
             (frosted sidebar / sheet detents shift its optical center) — the lens must carry the SAME
             padding or every padded pixel is offset. Mirror it on every sync. */
          if(xrayOn()) layoutXrayLens();
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
      cm.style.left=mr.left+'px'; cm.style.top=mr.top+'px'; cm.style.width=mr.width+'px'; cm.style.height=mr.height+'px'; cm.style.zIndex='calc(var(--z-inset) + 1)';
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
    /* ══ (then-now-card) THE SWIPE — 「あの頃といま」: THIS WINDOW'S MAP AND THE MAIN MAP, ONE PLACE, A DIVIDER BETWEEN ═══════
       The same registered camera as the X-ray lens (syncFromMain's lens branch), but the window's map covers the WHOLE
       map area and is clipped at a vertical divider: left of it, this window's instant; right of it, the main map's.
       Nothing is drawn twice and no renderer is added — the window's own map (its clock, its era base, its layer judged
       by the main map's rule) is moved under the divider, and back into the window when the swipe ends.
       ⚠ IT IS MOVED, NOT LEFT IN THE WINDOW: the window is a fixed box with its own z-index (the card band), so a map
       inside it would sit over the legends and the map's controls on the left half. Beside #map, inside #map-container,
       it is under every overlay the main map has, exactly where the main map's own picture is.
       The divider is a pointer-captured handle (touch-action:none, so a finger moves it on a phone, not the page) and
       a keyboard slider. Its position is part of the share link (js/map-state.js `cmp=s<percent>`). */
    let split=0.5, _swEl=null;
    const swipeLabels=()=>({ then:clockLabel(CT), now:clockLabel(IntMapTime) });
    function paintSwipe(){ if(!_swEl) return;
      const p=Math.round(split*1000)/10, L=swipeLabels();
      _swEl.style.setProperty('--cmp-split',p+'%');
      const h=_swEl.querySelector('.cmp-sw-hit'); if(h){ h.setAttribute('aria-valuenow',String(Math.round(split*100))); h.setAttribute('aria-valuetext',L.then+' | '+L.now); }
      const a=_swEl.querySelector('.cmp-sw-then'), b=_swEl.querySelector('.cmp-sw-now');
      if(a) a.textContent=L.then; if(b) b.textContent=L.now;
      const cm=document.getElementById('compare-map');
      if(cm&&swipeOn()){ const clip='inset(0 '+(100-p)+'% 0 0)'; cm.style.clipPath=clip; cm.style.webkitClipPath=clip; } }
    /** setSplit(0…1) — where the divider stands, as a fraction of the map's width from its left edge */
    function setSplit(v){ const n=+v; if(!isFinite(n)) return split; const c=Math.max(0,Math.min(1,n));
      if(c!==split){ split=c; paintSwipe(); announce(); } return split; }
    function buildSwipe(){ if(_swEl) return _swEl;
      const host=document.getElementById('map-container')||document.body;
      const el=document.createElement('div'); el.id='cmp-swipe';
      el.innerHTML='<span class="cmp-sw-lab cmp-sw-then"></span><span class="cmp-sw-lab cmp-sw-now"></span>'+
        '<div class="cmp-sw-hit" role="slider" tabindex="0" aria-valuemin="0" aria-valuemax="100"><span class="cmp-sw-line"></span><span class="cmp-sw-grip"></span></div>';
      host.appendChild(el); _swEl=el;
      const hit=/** @type {HTMLElement} */ (el.querySelector('.cmp-sw-hit'));
      const label=()=>IntMapLang.t(HOST.lang,"Drag to compare the two times","ドラッグして 2 つの時刻を比べる");
      hit.setAttribute('aria-label',label()); hit.title=label();
      /* the fraction under the pointer, measured against the map area itself (the sidebar beside it is not the map) */
      const at=(x)=>{ const r=host.getBoundingClientRect(); return r.width>0?(x-r.left)/r.width:split; };
      let drag=false;
      hit.addEventListener('pointerdown',e=>{ drag=true; try{ hit.setPointerCapture(e.pointerId); }catch(_){} e.preventDefault(); e.stopPropagation(); setSplit(at(e.clientX)); });
      hit.addEventListener('pointermove',e=>{ if(!drag) return; e.preventDefault(); setSplit(at(e.clientX)); });
      const end=()=>{ drag=false; }; hit.addEventListener('pointerup',end); hit.addEventListener('pointercancel',end); hit.addEventListener('lostpointercapture',end);
      /* the keyboard: the slider pattern's own steps (WAI-ARIA APG «Slider»: arrows by one step, Page keys by a larger one, Home/End) */
      hit.addEventListener('keydown',e=>{ const k=e.key; let d=null;
        if(k==='ArrowLeft'||k==='ArrowDown') d=-0.01; else if(k==='ArrowRight'||k==='ArrowUp') d=0.01;
        else if(k==='PageDown') d=-0.1; else if(k==='PageUp') d=0.1;
        if(d!=null){ e.preventDefault(); setSplit(split+d); } else if(k==='Home'){ e.preventDefault(); setSplit(0); } else if(k==='End'){ e.preventDefault(); setSplit(1); } });
      try{ window.addEventListener('intmap-lang',()=>{ hit.setAttribute('aria-label',label()); hit.title=label(); paintSwipe(); }); }catch(_){}
      return el; }
    function layoutSwipe(){ const cm=document.getElementById('compare-map'), mapEl=document.getElementById('map'); if(!cm) return;
      const host=document.getElementById('map-container')||document.body;
      if(cm.parentNode!==host){ if(mapEl&&mapEl.parentNode===host) host.insertBefore(cm,mapEl.nextSibling); else host.appendChild(cm); }
      cm.classList.add('cmp-swiping');
      buildSwipe().hidden=false; paintSwipe();
      try{ cmap.render.resize(); }catch(_){} }
    function clearSwipe(){ const cm=document.getElementById('compare-map');
      if(cm){ cm.classList.remove('cmp-swiping'); ['clipPath','webkitClipPath'].forEach(p=>{ cm.style[p]=''; });
        const body=win&&win.querySelector('.cmp-body'); if(body&&cm.parentNode!==body) body.insertBefore(cm,body.firstChild); }
      if(_swEl) _swEl.hidden=true;
      const r=()=>{ try{ cmap.render.resize(); }catch(_){} }; r(); requestAnimationFrame(r); setTimeout(r,80); }
    /* ---------- (#R20) portable layer registry for the compare "Layers ▾" pulldown ---------- */
    const CMP_DATE=new Date(Date.now()-2*864e5).toISOString().slice(0,10);
    const cmpGibs=(layer,lvl,ext,time)=>['https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/'+layer+'/default/'+time+'/GoogleMapsCompatible_Level'+lvl+'/{z}/{y}/{x}.'+ext];
    const cmpGibsStatic=(layer,lvl,ext)=>['https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/'+layer+'/default/GoogleMapsCompatible_Level'+lvl+'/{z}/{y}/{x}.'+ext];
    function ld(k,fb){ try{ if(typeof layerDates!=='undefined'&&layerDates&&layerDates[k]) return layerDates[k]; }catch(_){} return fb; }
    function addR(id,tiles,maxz,op){ if(cmap.layers.hasSource('cmpx-'+id)) return; cmap.layers.addSource('cmpx-'+id,{type:'raster',tiles:tiles,tileSize:256,maxzoom:maxz||9}); cmap.layers.add({id:'cmpx-'+id,type:'raster',source:'cmpx-'+id,layout:{visibility:'none'},paint:{'raster-opacity':op==null?0.78:op}}); }
    /* ══ (time-compare-lapse) WHAT TIME EACH LAYER IN THIS WINDOW STATES ══════════════════════════════
       Every entry below names, as `lid`, the main map's layer whose declaration speaks for the SAME source
       (js/layer-time-decl.js — what the source states about time is the source's, whichever map draws it),
       and as `drawnBy`, who applies the instant HERE: this window draws its own copy of each layer, so the
       main map's module is not the one that follows the clock on this map (js/layer-time-kernel.js
       `onMap`). An entry with `at()` follows this window's clock; one with `ownDate` shows a date of its
       own and is said to; one with neither is drawn as it was fetched — exactly the ones the rule
       withholds at an instant their source does not state.
       An entry whose source no main-map layer reads carries its own declaration as `time`, in the same
       vocabulary (js/layer-time.js), and the kernel judges it the same way (`judge`). */
    /* the day (or month) a GIBS product is asked for on THIS map: on the live clock the day the window has
       always used (the main map's chosen date for that product, else two days ago); off it, the clock's */
    function dayOf(k,monthly){ if(CT.isLive()) return ld(k,monthly?'2024-01-01':CMP_DATE);
      const iso=CT.iso(); return monthly?iso.slice(0,iso.lastIndexOf('-'))+'-01':iso; }
    /* the historical borders' request counter (a later instant supersedes an earlier answer) and what they drew */
    let _hbSeq=0, _hbShown=null;
    /* a GIBS day product that follows this window's clock — the tiles are re-pointed, not the layer rebuilt */
    function dayEntry(k,n,time,layer,lvl,sfx,monthly){
      const tiles=()=>cmpGibs(layer,lvl,'png',dayOf(k,monthly)+(sfx||''));
      return Object.assign({k, n, ids:['cmpx-'+k], drawnBy:{follows:'js/compare.js dayOf'},
        add(){ addR(k,tiles(),lvl); },
        at(){ try{ cmap.layers.setSourceTiles('cmpx-'+k,tiles()); }catch(_){} }}, time); }
    const CMP_LAYERS=[
      {k:'koppen', lid:'dl-climate', drawnBy:{follows:'js/compare.js koppenPeriodAt'}, at(){ try{ cmap.layers.updateImage('cmp-koppen',{url:koppenUrl(koppenPeriodAt(CT)),coordinates:KC}); }catch(_){} }, n:()=>IntMapLang.t(HOST.lang,"Köppen climate","ケッペン気候区分","Köppen-Klima","Климат по Кёппену","Clima de Köppen"), ids:['cmp-lyr-koppen'], add(){ try{ cmap.layers.updateImage('cmp-koppen',{url:koppenUrl(),coordinates:KC}); }catch(_){} }},
      {k:'worldcover', lid:'eco-dl-worldcover', drawnBy:{ownDate:'js/compare.js cmp-worldcover (the 2021 map)'}, n:()=>IntMapLang.t(HOST.lang,"Land cover (ESA 2021)","土地被覆 (ESA 2021)","Landbedeckung (ESA 2021)","Земной покров (ESA 2021)","Cobertura del suelo (ESA 2021)"), ids:['cmp-lyr-worldcover'], add(){}},
      {k:'eco', lid:'eco-dl-ecoregions', drawnBy:{}, n:()=>IntMapLang.t(HOST.lang,"Ecoregions","生態地域","Ökoregionen","Экорегионы","Ecorregiones"), ids:['cmp-lyr-eco','cmp-lyr-eco-l'], add(done){
        const addEco=(gj)=>{ if(!gj) return; try{ if(!cmap.layers.hasSource('cmp-eco')){ cmap.layers.addSource('cmp-eco',{type:'geojson',data:gj}); cmap.layers.add({id:'cmp-lyr-eco',type:'fill',source:'cmp-eco',layout:{visibility:'none'},paint:{'fill-color':['coalesce',['to-color',['get','COLOR']],'#4caf50'],'fill-opacity':0.55}}); cmap.layers.add({id:'cmp-lyr-eco-l',type:'line',source:'cmp-eco',layout:{visibility:'none'},paint:{'line-color':'rgba(0,0,0,0.22)','line-width':0.4}}); } done&&done(); }catch(_){} };
        if(window.__ECOREGIONS_2017) addEco(window.__ECOREGIONS_2017); else if(window.__loadEcoregions) window.__loadEcoregions(addEco); }},
      {k:'plates', lid:'eco-dl-plates', drawnBy:{}, n:()=>IntMapLang.t(HOST.lang,"Tectonic plates","プレート境界","Tektonische Platten","Тектонические плиты","Placas tectónicas"), ids:['cmpx-plates-f','cmpx-plates-l'], add(done){
        if(cmap.layers.hasSource('cmpx-plates')){ done&&done(); return; }
        Promise.all([
          cmpRead('https://raw.githubusercontent.com/fraxen/tectonicplates/master/GeoJSON/PB2002_plates.json'),
          cmpRead('https://raw.githubusercontent.com/fraxen/tectonicplates/master/GeoJSON/PB2002_boundaries.json').catch(()=>null)
        ]).then(([pl,bd])=>{ try{
          cmap.layers.addSource('cmpx-plates',{type:'geojson',data:pl}); cmap.layers.addSource('cmpx-plates-b',{type:'geojson',data:bd||{type:'FeatureCollection',features:[]}});
          cmap.layers.add({id:'cmpx-plates-f',type:'fill',source:'cmpx-plates',layout:{visibility:'none'},paint:{'fill-color':'#e8590c','fill-opacity':0.12}});
          cmap.layers.add({id:'cmpx-plates-l',type:'line',source:'cmpx-plates-b',layout:{visibility:'none'},paint:{'line-color':'#ff5a3c','line-width':1.4,'line-opacity':0.9}});
          done&&done(); }catch(_){} }).catch(()=>cmpFail(IntMapLang.t(HOST.lang,"Could not load plate data","プレートデータを取得できませんでした","Plattendaten konnten nicht geladen werden","Не удалось загрузить данные о плитах","No se pudieron cargar los datos de placas"))); }},
      /* (#R234) the comparison map's DEM was pinned at 13 for every device — two zoom levels below
         what the main map has streamed on desktop since #R20, so the same hillshade was visibly
         coarser here than beside it. It asks the shell for the depth now (window.__imDemMaxZoom),
         so desktop gets terrarium's native 15 and a phone keeps its 13. */
      {k:'hillshade', lid:'dl-hillshade', drawnBy:{}, n:()=>IntMapLang.t(HOST.lang,"Hillshade","陰影起伏","Schummerung","Отмывка рельефа","Sombreado del relieve"), ids:['cmpx-hill'], add(){ try{ if(!cmap.layers.hasSource('cmpx-dem')) cmap.layers.addSource('cmpx-dem',{type:'raster-dem',tiles:['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],encoding:'terrarium',tileSize:256,maxzoom:(window.__imDemMaxZoom?window.__imDemMaxZoom():13)});
        if(!cmap.layers.has('cmpx-hill')) cmap.layers.add({id:'cmpx-hill',type:'hillshade',source:'cmpx-dem',layout:{visibility:'none'},paint:{'hillshade-exaggeration':0.55}}); }catch(_){} }},
      {k:'nightsat', lid:'dl-nightsat', drawnBy:{ownDate:'js/night-lights.js tiles (the main map’s epoch)'}, n:()=>IntMapLang.t(HOST.lang,"Night lights (satellite)","夜の光（衛星）","Nachtlichter (Satellit)","Ночные огни (спутник)","Luces nocturnas (satélite)"), ids:['cmpx-nightsat'], add(){ /* (#R550) the THIRD copy of «which year of night lights» used to live
        here as a string replace that spelled 2016 — so the comparison window could contradict the map
        it was opened beside. It asks js/night-lights.js now, like the layer and the globe do. */
        try{ const NL=window.IntMapNightLights; const t=NL.tiles(); if(t.length) addR('nightsat',t,NL.maxzoom(),0.95); }catch(_){} }},
      dayEntry('snow',()=>IntMapLang.t(HOST.lang,"Snow cover","積雪","Schneedecke","Снежный покров","Cubierta de nieve"),{lid:'dl-snow'},'MODIS_Terra_NDSI_Snow_Cover',8,''),
      dayEntry('aod',()=>IntMapLang.t(HOST.lang,"Aerosol (AOD)","エアロゾル","Aerosol (AOD)","Аэрозоль (AOD)","Aerosol (AOD)"),{lid:'dl-aod'},'MODIS_Combined_Value_Added_AOD',6,''),
      dayEntry('sst',()=>IntMapLang.t(HOST.lang,"Sea-surface temp","海面水温","Meeresoberflächentemperatur","Температура поверхности моря","Temperatura del mar"),{lid:'dl-sst'},'GHRSST_L4_MUR_Sea_Surface_Temperature',7,''),
      dayEntry('temp',()=>IntMapLang.t(HOST.lang,"Air temperature (monthly)","気温（月平均）","Lufttemperatur (monatlich)","Температура воздуха (по месяцам)","Temperatura del aire (mensual)"),{time:MERRA2},'MERRA2_2m_Air_Temperature_Monthly',6,'',true),
      dayEntry('precip',()=>IntMapLang.t(HOST.lang,"Precipitation","降水量","Niederschlag","Осадки","Precipitación"),{lid:'dl-precip'},'IMERG_Precipitation_Rate',6,'T12:00:00Z'),
      {k:'thermal', lid:'dl-thermal', drawnBy:{}, n:()=>IntMapLang.t(HOST.lang,"Thermal anomalies","熱異常（火災）","Wärmeanomalien","Тепловые аномалии","Anomalías térmicas"), ids:['cmpx-thermal'], add(){ addR('thermal',['https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=VIIRS_NOAA20_Thermal_Anomalies_375m_All,VIIRS_SNPP_Thermal_Anomalies_375m_All&CRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256&FORMAT=image/png&TRANSPARENT=TRUE&STYLES=&TIME='+CMP_DATE],9,0.85); }},
      {k:'popgrid', lid:'dl-popgrid', drawnBy:{ownDate:'js/compare.js cmpx-popgrid (GPW 2020)'}, n:()=>IntMapLang.t(HOST.lang,"Population grid","人口密度グリッド","Bevölkerungsraster","Сетка населения","Malla de población"), ids:['cmpx-popgrid'], add(){ addR('popgrid',cmpGibsStatic('GPW_Population_Density_2020',7,'png'),7,0.8); }},
      {k:'ukr', lid:'beta-dl-ukrfront', drawnBy:{}, n:()=>IntMapLang.t(HOST.lang,"Ukraine frontline","ウクライナ前線","Frontlinie Ukraine","Линия фронта в Украине","Frente de Ucrania"), ids:['cmpx-ukr-f','cmpx-ukr-l'], add(done){
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
      {k:'volc', lid:'beta-dl-volc2', drawnBy:{}, n:()=>IntMapLang.t(HOST.lang,"Volcanoes","火山","Vulkane","Вулканы","Volcanes"), ids:['cmpx-volc'], add(done){
        if(cmap.layers.hasSource('cmpx-volc')){ done&&done(); return; }
        loadData('data/volcanoes_gvp.json').then(j=>{ try{   /* (data-one-door) the main map's read, shared — js/data-door.js */
          cmap.layers.addSource('cmpx-volc',{type:'geojson',data:j});
          cmap.layers.add({id:'cmpx-volc',type:'circle',source:'cmpx-volc',layout:{visibility:'none'},paint:{'circle-radius':['interpolate',['linear'],['zoom'],1,2,6,5],'circle-color':'#ff6a3d','circle-stroke-color':'#fff','circle-stroke-width':0.7,'circle-opacity':0.9}});
          done&&done(); }catch(_){} }).catch(()=>{}); }},
      /* (#R36) parity adds — aurora + earthquakes (the main map has them; compare didn't). Same sources/paint
         as the main map so they are byte-identical, not "low quality" clones. */
      {k:'aurora', lid:'l9-dl-aurora', drawnBy:{}, n:()=>IntMapLang.t(HOST.lang,"Aurora forecast","オーロラ予報","Polarlicht-Vorhersage","Прогноз полярных сияний","Previsión de auroras"), ids:['cmpx-aurora-heat','cmpx-aurora-glow'], add(done){
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
        cmpRead('https://services.swpc.noaa.gov/json/ovation_aurora_latest.json').then(j=>{ try{
          const co=j.coordinates||[], feats=[];
          for(let i=0;i<co.length;i+=2){ const c=co[i]; if(!c) continue; const a=c[2]; if(a<8) continue; let lng=c[0]; if(lng>180) lng-=360; feats.push({type:'Feature',geometry:{type:'Point',coordinates:[lng,c[1]]},properties:{a:a}}); }
          if(cmap.layers.hasSource('cmpx-aurora')) cmap.layers.setSourceData('cmpx-aurora',{type:'FeatureCollection',features:feats});
          done&&done(); }catch(_){} }).catch(()=>cmpFail(IntMapLang.t(HOST.lang,"Could not load — toggle again later.","取得できませんでした — 後でもう一度オンにしてください。","Laden fehlgeschlagen — später erneut einschalten.","Не удалось загрузить — включите позже ещё раз.","No se pudo cargar; vuelva a activarlo más tarde."))); }},
      {k:'eq', lid:'bx-eq', drawnBy:{}, n:()=>IntMapLang.t(HOST.lang,"Earthquakes (USGS)","地震（USGS）","Erdbeben (USGS)","Землетрясения (USGS)","Terremotos (USGS)"), ids:['cmpx-eq'], add(done){
        if(cmap.layers.hasSource('cmpx-eq')){ done&&done(); return; }
        cmpRead('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_week.geojson').then(j=>{ try{
          cmap.layers.addSource('cmpx-eq',{type:'geojson',data:j});
          cmap.layers.add({id:'cmpx-eq',type:'circle',source:'cmpx-eq',layout:{visibility:'none'},paint:{'circle-radius':['interpolate',['linear'],['get','mag'],1,2.5,4,6,6,12,8,22],'circle-color':['interpolate',['linear'],['get','mag'],1,'#ffd24d',3,'#ff9500',5,'#ff3b30',7,'#7a0010'],'circle-opacity':0.78,'circle-stroke-color':'rgba(255,255,255,0.6)','circle-stroke-width':0.4}});
          done&&done(); }catch(_){} }).catch(()=>cmpFail(IntMapLang.t(HOST.lang,"Could not load earthquake data","地震データを取得できませんでした","Erdbebendaten konnten nicht geladen werden","Не удалось загрузить данные о землетрясениях","No se pudieron cargar los datos sísmicos"))); }},
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
        function mk(k,nm,lid){ return {k:'ch-'+k, n:nm, ids:['cmp-ch-'+k], lid, drawnBy:{ownDate:'js/compare.js srcReady (the statistics baked when the window first drew them)'}, add(done){ srcReady(()=>{ try{
          if(!cmap.layers.has('cmp-ch-'+k)){
            const ramp=['interpolate',['linear'],['to-number',['get',k]]].concat(RAMP[k]);
            cmap.layers.add({id:'cmp-ch-'+k,type:'fill',source:'cmp-choro',layout:{visibility:'none'},paint:{'fill-color':['case',['<=',['to-number',['get',k]],0],'rgba(128,128,128,0.25)',ramp],'fill-opacity':0.7}});
          }
          done&&done(); }catch(_){} }); }}; }
        return [
          mk('pop',()=>IntMapLang.t(HOST.lang,"Population density","人口密度","Bevölkerungsdichte","Плотность населения","Densidad de población"),'dl-pop'),
          mk('gdppc',()=>IntMapLang.t(HOST.lang,"GDP per capita","1人当たりGDP","BIP pro Kopf","ВВП на душу населения","PIB per cápita"),'dl-gdppc'),
          mk('hdi',()=>'HDI','dl-hdi'),
          mk('dem',()=>IntMapLang.t(HOST.lang,"Democracy Index","民主主義指数","Demokratieindex","Индекс демократии","Índice de Democracia"),'dl-dem'),
          mk('tfr',()=>IntMapLang.t(HOST.lang,"Fertility rate","合計特殊出生率","Geburtenrate","Суммарный коэффициент рождаемости","Tasa de fecundidad"),'dl-tfr'),
          mk('milSpend',()=>IntMapLang.t(HOST.lang,"Military spending ($B)","国防費（$B）","Militärausgaben (Mrd. $)","Военные расходы (млрд $)","Gasto militar (miles de mill. $)"),'dl-milSpend'),
          mk('milSpendGDP',()=>IntMapLang.t(HOST.lang,"Military spending (%GDP)","国防費（対GDP）","Militärausgaben (% BIP)","Военные расходы (% ВВП)","Gasto militar (% del PIB)"),'dl-milSpend')
        ];
      })(),
      /* (time-compare-lapse) THE BORDERS OF THIS WINDOW'S INSTANT, FROM THE SAME RECORDS AS THE MAIN MAP'S.
         This entry used to draw whichever year the main map's OTHER historical layer had last loaded
         (js/beta-overlays.js `hbCurrent`), or the historical-basemaps 1914 sheet when it had loaded none —
         a year the reader never chose, on a window that had no clock. It now asks js/time-borders.js which
         collection answers THIS window's instant (`collectionAt`: CShapes 2.0 day-exact, then
         OpenHistoricalMap, then the historical-basemaps sheets — the main map's own chain, one
         implementation), so 1914 here and 1960 there are two answers of one rule. An instant the records
         leave to the present-day base map is said, not filled. */
      {k:'histb', lid:'cb-borders', drawnBy:{self:'js/compare.js histb.at'}, shown:()=>_hbShown, n:()=>IntMapLang.t(HOST.lang,"Historical borders","過去の国境","Historische Grenzen","Исторические границы","Fronteras históricas"), ids:['cmp-hb-f','cmp-hb-l'], add(done){
        if(!cmap.layers.hasSource('cmp-hb')){ try{
          cmap.layers.addSource('cmp-hb',{type:'geojson',data:{type:'FeatureCollection',features:[]},attribution:ERA_BORDER_CREDIT});   /* (then-now-card) the records it draws are credited, as on the main map */
          cmap.layers.add({id:'cmp-hb-f',type:'fill',source:'cmp-hb',layout:{visibility:'none'},paint:{'fill-color':['coalesce',['get','__col'],'#c9b18a'],'fill-opacity':0.3}});
          cmap.layers.add({id:'cmp-hb-l',type:'line',source:'cmp-hb',layout:{visibility:'none'},paint:{'line-color':'#5e4a33','line-width':0.9,'line-opacity':0.85}}); }catch(_){} }
        done&&done(); },
        /* → the sentence the window shows under the picker, or null */
        at(){ const when=CT.when(), live=CT.isLive(), iso=live?null:CT.iso(), my=++_hbSeq;
          const put=(fc)=>{ try{ if(my===_hbSeq&&cmap.layers.hasSource('cmp-hb')) cmap.layers.setSourceData('cmp-hb',fc); }catch(_){} };
          const TB=window.IntMapTimeBorders;
          return Promise.resolve().then(()=>TB.collectionAt(when,{live})).then(r=>{
            if(my!==_hbSeq) return null;
            _hbShown=r?{iso,key:r.key,features:r.fc?r.fc.features.length:0,names:r.fc?r.fc.features.filter(f=>f&&f.properties&&(f.properties.NAME||f.properties.name)).length:0,modern:!!r.modern}:null;
            if(r&&r.fc){ put(r.fc); return null; }
            put({type:'FeatureCollection',features:[]});
            if(r&&r.modern) return LA('Borders at this instant are today’s — the base map draws them','この日時の国境は現在のもの——ベースマップが描いています');
            return LA('No border record answers this instant yet','この日時に答える国境の記録はまだ読めていません');
          },()=>{ if(my!==_hbSeq) return null; _hbShown=null; put({type:'FeatureCollection',features:[]});
            /* the failure the window has always reported for this layer, in the app's toast */
            cmpFail(IntMapLang.t(HOST.lang,"Could not load — toggle again later.","取得できませんでした — 後でもう一度オンにしてください。","Laden fehlgeschlagen — später erneut einschalten.","Не удалось загрузить — включите позже ещё раз.","No se pudo cargar; vuelva a activarlo más tarde."));
            return LA('The border records could not be read','国境の記録を読めませんでした'); }); }},
      {k:'rail', lid:'beta-dl-rail', drawnBy:{}, n:()=>IntMapLang.t(HOST.lang,"World railways","世界の鉄道","Eisenbahnen","Железные дороги","Ferrocarriles"), ids:['cmp-rail'], add(done){
        if(cmap.layers.hasSource('cmp-rail')){ done&&done(); return; }
        if(!window.IntMapBeta2) return;
        window.IntMapBeta2.load('rail',fc=>{ try{ if(cmap.layers.hasSource('cmp-rail')) { done&&done(); return; }
          cmap.layers.addSource('cmp-rail',{type:'geojson',data:fc});
          /* (#R388) the colour comes from the railway module, which owns the gauge buckets and their
             colours — this file used to read a `col` property that the Natural Earth build stamped on
             every feature, and the new data has no such property because the bucket is derived. */
          cmap.layers.add({id:'cmp-rail',type:'line',source:'cmp-rail',layout:{visibility:'none'},paint:{'line-color':(window.IntMapRailways&&window.IntMapRailways.colour?window.IntMapRailways.colour():'#888'),'line-width':1.3,'line-opacity':0.85}});
          done&&done(); }catch(_){} }); }},
      {k:'dc', lid:'beta-dl-dc', drawnBy:{}, n:()=>IntMapLang.t(HOST.lang,"Data centers / cloud","データセンター","Rechenzentren / Cloud","Дата-центры / облако","Centros de datos / nube"), ids:['cmp-dc'], add(done){
        if(cmap.layers.hasSource('cmp-dc')){ done&&done(); return; }
        if(!window.IntMapBeta2) return;
        window.IntMapBeta2.load('dc',fc=>{ try{ if(cmap.layers.hasSource('cmp-dc')) { done&&done(); return; }
          cmap.layers.addSource('cmp-dc',{type:'geojson',data:fc});
          cmap.layers.add({id:'cmp-dc',type:'circle',source:'cmp-dc',layout:{visibility:'none'},paint:{'circle-radius':['interpolate',['linear'],['zoom'],1,2.4,6,5.5],'circle-color':['coalesce',['get','col'],'#5e8bff'],'circle-stroke-color':'#fff','circle-stroke-width':0.8,'circle-opacity':0.9}});
          done&&done(); }catch(_){} }); }},
      {k:'pharma', lid:'beta-dl-pharma', drawnBy:{}, n:()=>IntMapLang.t(HOST.lang,"Pharma & health","医療・製薬","Pharma & Gesundheit","Фармацевтика и здравоохранение","Farmacéuticas y salud"), ids:['cmp-ph'], add(done){
        if(cmap.layers.hasSource('cmp-ph')){ done&&done(); return; }
        if(!window.IntMapBeta2) return;
        window.IntMapBeta2.load('pharma',fc=>{ try{ if(cmap.layers.hasSource('cmp-ph')) { done&&done(); return; }
          cmap.layers.addSource('cmp-ph',{type:'geojson',data:fc});
          cmap.layers.add({id:'cmp-ph',type:'circle',source:'cmp-ph',layout:{visibility:'none'},paint:{'circle-radius':['interpolate',['linear'],['zoom'],1,2.4,6,5.5],'circle-color':['coalesce',['get','col'],'#2bb3a3'],'circle-stroke-color':'#fff','circle-stroke-width':0.8,'circle-opacity':0.9}});
          done&&done(); }catch(_){} }); }}
    ];
    /* ══ (time-compare-lapse) THE PICKED LAYER, JUDGED AT THIS WINDOW'S INSTANT ═══════════════════════ */
    let curCmpLayer='';
    const _held=new Set();             /* entries not drawn at this window's instant — their source states nothing about it */
    let _tv=null, _tNote=null, _tSeq=0; /* the picked layer's last verdict, the sentence shown for it, the request counter */
    const say=(m)=>{ if(!m) return ''; return Array.isArray(m)?IntMapLang.t(HOST.lang,m[0],m[1]):IntMapLang.t(HOST.lang,m.en,m.jp); };
    function showLayer(L,on){ L.ids.forEach(id=>setVis(id,!!on&&!_held.has(L.k))); }
    /* the rule's answer for one entry on THIS map: its main-map layer's declaration with this window as the drawer,
       or its own declaration — judged against this window's clock (js/layer-time-kernel.js) */
    async function judge(L){ const LT=window.IntMapLayerTime; if(!LT) return null;
      await LT.ready();
      if(L.time) return LT.judge(L.time,CT);
      if(L.lid) return LT.verdict(L.lid,CT,L.drawnBy||{});
      return null; }
    /* the latest judgement in flight — `judged()` resolves when the window has answered for its current instant */
    let _judging=Promise.resolve();
    function applyTime(){ _judging=judgeAndShow(); return _judging; }
    async function judged(){ let p; do{ p=_judging; try{ await p; }catch(_){} }while(p!==_judging); return timeState(); }
    async function judgeAndShow(){ const my=++_tSeq;
      const L=built?CMP_LAYERS.find(x=>x.k===curCmpLayer):null;
      if(!L){ _tv=null; _tNote=null; paintTime(); return; }
      /* off the present nothing is shown before the rule has answered — the main map's own order (js/layer-time-kernel.js):
         on the live clock no kind that is held is unstated, so a layer the window already drew keeps drawing while it asks */
      const sure=_tv&&_tv.k===L.k&&_tv.status!=='unstated';
      if(!CT.isLive()&&!sure){ _held.add(L.k); showLayer(L,false); }
      let v=null; try{ v=await judge(L); }catch(_){ v=null; }
      if(my!==_tSeq) return;
      _tv=v?{k:L.k,lid:L.lid||null,status:v.status,reason:v.reason,message:v.message||null}:null;
      if(v&&v.status==='unstated'){ _held.add(L.k); showLayer(L,false); _tNote=v.message; paintTime(); return; }
      let extra=null;
      if(typeof L.at==='function'){ try{ extra=await L.at(); }catch(_){ extra=null; } if(my!==_tSeq) return; }
      _held.delete(L.k); showLayer(L,true);
      _tNote=extra||((v&&v.status==='carried')?v.message:null);
      paintTime(); }
    /* the instant as the reader reads it: «Today», a year (the clock's year convention — mid-June noon UTC,
       js/chronos.js `setYear`), or the day */
    const HSc=()=>window.IntMapHistScale;   /* js/hist-scale.js — the year convention and the era-aware year text */
    function clockLabel(clock){
      if(clock.isLive()) return IntMapLang.t(HOST.lang,"Today","今日");
      const d=clock.when(), y=d.getUTCFullYear(); let byYear=false;
      try{ byYear=HSc().utcAt(y,5,15,12,0,0).getTime()===d.getTime(); }catch(_){ byYear=false; }
      if(!byYear) return clock.iso();
      try{ return HSc().yearText(y,IntMapLang.htmlTag(HOST.lang)||'en',HOST.lang==='jp'?'年':null); }catch(_){ return String(y); } }
    function paintTime(){ if(!win) return; paintSwipe();
      const w=win.querySelector('#cmp-when');
      /* (compare-window-bounds) «謎のToday/Today表示»: the pill compares the window's instant with the main map's, and while
         the two read the same (following, or an own clock at the same instant) it printed the one word twice. One
         label when they agree; the pair only when there is a difference to show. */
      if(w){ w.textContent=''; const own=clockLabel(CT), main=clockLabel(IntMapTime); const b=document.createElement('b'); b.textContent=own; w.append(b);
        if(own!==main){ const sep=document.createElement('span'); sep.className='cmp-when-sep'; sep.textContent='|';
          const m=document.createElement('span'); m.textContent=main; w.append(sep,m); }
        w.title=own!==main?IntMapLang.t(HOST.lang,"This window | the main map","このウィンドウ｜メイン地図"):IntMapLang.t(HOST.lang,"This window and the main map","このウィンドウとメイン地図");
        w.classList.toggle('cmp-when-own',!follow); }
      win.querySelectorAll('[data-t]').forEach(x=>x.classList.toggle('on',(x.getAttribute('data-t')==='follow')===follow));
      const yIn=win.querySelector('#cmp-year');
      if(yIn&&document.activeElement!==yIn){ yIn.value=CT.isLive()?'':String(CT.when().getUTCFullYear());
        yIn.placeholder=String(new Date().getUTCFullYear()); try{ yIn.min=String(CT.min); }catch(_){} }
      const n=win.querySelector('#cmp-tnote');
      if(n){ const L=CMP_LAYERS.find(x=>x.k===curCmpLayer); const txt=L&&_tNote?say(_tNote):'';
        n.textContent=txt?(L.n()+' — '+txt):''; n.hidden=!txt;
        n.classList.toggle('cmp-tnote-held',!!(L&&_held.has(L.k))); } }
    /* whoever keeps a record of the window's instant is told it moved (js/map-ui.js writes the share link) */
    function announce(){ _cmpSubs.forEach(f=>{ try{ f(); }catch(_){} }); }
    /** '' while following the main map; 'now'; a year ('1914', '-500') when the clock is at the year convention; else the ISO day */
    function timeParam(){ return follow?'':paramOfClock(CT); }
    /** setTime({ year | date | now | follow | param }) — the one door the time row, Atlas and the share link use.
        Anything but `follow:true` holds this window's own clock. → timeState() */
    function setTime(o){ o=o||{};
      if(o.param!=null){ const p=String(o.param).trim();
        o = p===''?{follow:true}: p==='now'?{now:true}: /^[+-]?\d{1,6}$/.test(p)?{year:+p}:{date:p}; }
      if(o.follow===true){ follow=true; mirror(); paintTime(); announce(); return timeState(); }
      follow=false;
      if(o.now) CT.setNow({source:'compare'});
      else if(o.year!=null&&isFinite(+o.year)) CT.setYear(Math.round(+o.year),{source:'compare'});
      else if(o.date!=null){ const t0=Date.parse(String(o.date)); if(isFinite(t0)) CT.set(new Date(t0),{source:'compare'}); }
      paintTime(); announce();
      return timeState(); }
    /** the parameter spelling ('now', a year, a date) → the spec setTime takes; null for anything else */
    function specOf(p){ if(p==null) return null; if(typeof p==='number') return isFinite(p)?{year:Math.round(p)}:null;
      const t=String(p).trim(); if(!t) return null; if(/^(now|today|live|現在|今|今日|いま)$/i.test(t)) return {now:true};
      if(/^[+-]?\d{1,6}$/.test(t)) return {year:+t}; return isFinite(Date.parse(t))?{date:t}:null; }
    /** the instant a clock stands at, in the same spelling as timeParam (a year at the year convention, else the day) */
    function paramOfClock(clock){ if(clock.isLive()) return 'now'; const d=clock.when(), y=d.getUTCFullYear();
      try{ if(HSc().utcAt(y,5,15,12,0,0).getTime()===d.getTime()) return String(y); }catch(_){}
      return clock.iso(); }
    /**
     * (then-now-card) 「あの頃といま」 — thenNow({ then?, now?, split?, layer? }) → { state, needsThen }
     * The swipe at one place: this window holds THEN (left of the divider), the main map shows NOW (right of it).
     * `then` / `now` are a year, a date or 'now'. With no `then`, the main map's own instant is the one compared when it is
     * in the past (and the main map goes to the present, unless `now` says otherwise); with no past instant anywhere, the
     * window's own clock is kept, and if it has none the year field is focused — no year is chosen for the reader.
     * The window's layer is the reader's; when none is picked and THEN is an instant a border record answers, it shows the
     * borders of that instant (`histb`) — the left half would otherwise be the era base alone (physical geography).
     */
    function thenNow(o){ o=o||{};
      open(); _setMode('swipe');
      if(o.split!=null) setSplit(o.split);
      let thenSpec=specOf(o.then), nowSpec=specOf(o.now), needsThen=false;
      if(!thenSpec&&!IntMapTime.isLive()){ thenSpec=specOf(paramOfClock(IntMapTime)); if(!nowSpec) nowSpec={now:true}; }
      if(thenSpec) setTime(thenSpec);
      else if(follow){ needsThen=true; }
      if(nowSpec){ if(nowSpec.now) IntMapTime.setNow({source:'compare'});
        else if(nowSpec.year!=null) IntMapTime.setYear(nowSpec.year,{source:'compare'});
        else if(nowSpec.date!=null){ const t0=Date.parse(nowSpec.date); if(isFinite(t0)) IntMapTime.set(new Date(t0),{source:'compare'}); } }
      if(o.layer) _pickLayer(String(o.layer));
      else if(!curCmpLayer&&!CT.isLive()&&eraAt(CT)) _pickLayer('histb');
      paintTime();
      if(needsThen){ try{ const y=win&&win.querySelector('#cmp-year'); if(y) y.focus(); }catch(_){} }
      return { state:timeState(), needsThen }; }
    /** what the window shows and why — Atlas's state, the observers, the share link and the specs read this */
    function timeState(){ const L=CMP_LAYERS.find(x=>x.k===curCmpLayer)||null;
      return { open:!!(win&&win.style.display!=='none'), follow, live:CT.isLive(), at:CT.isLive()?null:CT.when().toISOString(),
        iso:CT.isLive()?null:CT.iso(), label:clockLabel(CT), main:{ live:IntMapTime.isLive(), iso:IntMapTime.isLive()?null:IntMapTime.iso(), label:clockLabel(IntMapTime) },
        layer:L?L.k:null, layerName:L?L.n():null, held:!!(L&&_held.has(L.k)),
        /* (then-now-card) how the window is shown: 'sync' | 'free' | 'xray' | 'swipe', and where the swipe's divider stands */
        mode, split:swipeOn()?split:null,
        verdict:_tv?{ status:_tv.status, reason:_tv.reason, why:say(_tv.message)||null }:null,
        note:_tNote?say(_tNote):null,
        drawn:(L&&typeof L.shown==='function')?L.shown():null }; }
    function build(){ if(built) return; built=true; injectCSS();
      win=document.createElement('div'); win.id='compare-window';
      win.innerHTML='<div class="cmp-head"><span class="cmp-title">'+(IntMapLang.t(HOST.lang,"Compare","比較","Vergleichen","Сравнить","Comparar"))+'</span>'+
        '<span class="cmp-seg">'+
          '<button class="cmp-btn on" data-v="map">'+(IntMapLang.t(HOST.lang,"Map","地図","Karte","Карта","Mapa"))+'</button>'+
          '<button class="cmp-btn" data-v="sat">'+(IntMapLang.t(HOST.lang,"Sat","衛星","Sat","Спутник","Sat"))+'</button>'+
        '</span>'+
        '<span class="cmp-seg">'+
          '<button class="cmp-btn on" data-m="sync" title="'+(IntMapLang.t(HOST.lang,"Two-way view sync","両方向に視点同期","Ansicht beidseitig synchronisieren","Двусторонняя синхронизация вида","Sincronización de vista bidireccional"))+'">'+(IntMapLang.t(HOST.lang,"Sync","同期","Sync","Синхр.","Sinc."))+'</button>'+
          '<button class="cmp-btn" data-m="free" title="'+(IntMapLang.t(HOST.lang,"Independent of the main map","メイン地図と独立","Unabhängig von der Hauptkarte","Независимо от основной карты","Independiente del mapa principal"))+'">'+(IntMapLang.t(HOST.lang,"Free","独立","Frei","Свободно","Libre"))+'</button>'+
          '<button class="cmp-btn" data-m="xray" title="'+(IntMapLang.t(HOST.lang,"Pixel-registered lens over the main map","メイン地図に重ねる透視レンズ","Pixelgenaue Lupe über der Hauptkarte","Пиксельно совмещённая линза поверх основной карты","Lente superpuesta al mapa principal, registrada píxel a píxel"))+'">'+(IntMapLang.t(HOST.lang,"X-ray","X線","Röntgen","Рентген","Rayos X"))+'</button>'+
          /* (then-now-card) the swipe: this window's instant left of a divider, the main map's right of it, one place */
          '<button class="cmp-btn" data-m="swipe" title="'+IntMapLang.t(HOST.lang,"Swipe between this window’s time and the main map’s, over the whole map","地図全体で、このウィンドウの時刻とメイン地図の時刻をスワイプで比べる")+'">'+IntMapLang.t(HOST.lang,"Swipe","スワイプ")+'</button>'+
        '</span>'+
        /* (#R31) Minimise = single clean line; Close = centred ×; both SQUARE like the other controls
           ("ふちをまるではなく…四角に", "×は中心からずれている"). */
        '<button class="cmp-btn cmp-icon" id="cmp-min" title="'+(IntMapLang.t(HOST.lang,"Minimize","最小化","Minimieren","Свернуть","Minimizar"))+'"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg></button>'+
        '<button class="cmp-btn cmp-icon" id="cmp-close" title="'+t('close')+'"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>'+
        /* (#R31) Layer picker sits in its own row directly UNDER the Map/Sat + Sync/Free/X-ray controls
           ("Select a layerは…欄の下に配置しろ"). */
        '<div class="cmp-picker"><select id="cmp-layers-sel" title="'+(IntMapLang.t(HOST.lang,"Compare layer","比較レイヤー","Vergleichsebene","Слой сравнения","Capa de comparación"))+'"></select>'+
          /* (time-compare-lapse) this window's clock: follow the main map's, or hold one of its own */
          '<div class="cmp-time" data-time-intent>'+
            '<span class="cmp-seg"><button class="cmp-btn on" type="button" data-t="follow">'+IntMapLang.t(HOST.lang,"Main map’s time","メイン地図の時刻")+'</button>'+
            '<button class="cmp-btn" type="button" data-t="own">'+IntMapLang.t(HOST.lang,"Own time","独自の時刻")+'</button></span>'+
            '<input id="cmp-year" class="cmp-year" type="number" step="1" inputmode="numeric" aria-label="'+IntMapLang.t(HOST.lang,"Year shown in this window","このウィンドウに表示する年")+'" title="'+IntMapLang.t(HOST.lang,"Year shown in this window","このウィンドウに表示する年")+'">'+
            '<button class="cmp-btn" type="button" id="cmp-tnow">'+IntMapLang.t(HOST.lang,"Now","現在")+'</button>'+
          '</div><div class="cmp-tnote" id="cmp-tnote" hidden></div></div>'+
        '<div class="cmp-body"><div id="compare-map"></div><div class="cmp-when" id="cmp-when" title="'+IntMapLang.t(HOST.lang,"This window | the main map","このウィンドウ｜メイン地図")+'"></div></div>'+
                '<div class="cmp-resize" title="'+(IntMapLang.t(HOST.lang,"Drag to resize","高さを調節","Zum Ändern der Höhe ziehen","Потяните, чтобы изменить высоту","Arrastre para ajustar la altura"))+'"></div>';
      (document.getElementById('map-container')||document.body).appendChild(win);
      try{ window.registerWindow&&window.registerWindow(win); }catch(_){}   /* (#R47) click-to-front */
      /* (#R27) Pull the close × OUT of the wrapping header flow and make it a direct child of the window,
         pinned top-right above everything. On mobile the 7-button header wraps, and a wrapped row could
         land on top of the × ("×がレイヤー選択ボタンと重なって終了できない") — now nothing in the header/controls
         can ever overlap it, on ANY platform. (Base + mobile CSS position #cmp-close absolutely.) */
      try{ const _x=win.querySelector('#cmp-close'); if(_x) win.appendChild(_x); }catch(_){}
      cmap=GE().ui.createSubView({container:'compare-map',style:compareStyle(),center:GE().camera.getCenter(),zoom:GE().camera.getZoom(),bearing:GE().camera.getBearing(),pitch:GE().camera.getPitch(),credit:true,renderWorldCopies:false,maxPitch:85});
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
      function _reshowCmpLayer(){ try{ const L=CMP_LAYERS.find(x=>x.k===curCmpLayer); if(L) showLayer(L,true); }catch(_){} }   /* (time-compare-lapse) never over a layer held for this window's instant */
      function setMode(m){ const prev=mode; mode=m;
        win.querySelectorAll('[data-m]').forEach(x=>x.classList.toggle('on',x.getAttribute('data-m')===m));
        win.classList.toggle('cmp-xray',m==='xray');
        win.classList.toggle('cmp-swipe',m==='swipe');
        if(prev==='xray'&&m!=='xray'){ try{ clearXrayLens(); }catch(_){} }
        /* (then-now-card) the map goes under the divider, and comes back into the window when the swipe ends */
        if(prev==='swipe'&&m!=='swipe'){ try{ clearSwipe(); }catch(_){} }
        if(m==='swipe'){ try{ layoutSwipe(); }catch(_){} }
        applyBase(); _reshowCmpLayer();
        try{ cmap.render.resize(); }catch(_){}
        if(m!=='free') syncFromMain();   /* immediate (rAF never fires in a hidden tab) */
        requestAnimationFrame(()=>{ try{ cmap.render.resize(); }catch(_){} if(m!=='free') syncFromMain(); });
        /* (#R32b) X-ray needs the canvas reflowed to its fixed full-container box a few times before the lens
           registers + the base/layer paint ("x-rayだけバグが多発"). Re-layout + re-assert base/layer/sync. */
        if(m==='xray'){ [60,200,500].forEach(ms=>setTimeout(()=>{ try{ layoutXrayLens(); applyBase(); _reshowCmpLayer(); syncFromMain(); cmap.render.resize(); }catch(_){} },ms)); }
      }
      win.querySelectorAll('[data-m]').forEach(b=>b.onclick=()=>_setMode(b.getAttribute('data-m')));
      _setMode=(m)=>{ if(mode!==m) setMode(m); if(prevAnnounced!==mode){ prevAnnounced=mode; announce(); } };
      /* (then-now-card) a layer picked by key — the picker's own change path, so it is judged at the window's instant like a reader's pick */
      _pickLayer=(k)=>{ if(!sel||!CMP_LAYERS.some(x=>x.k===k)) return false; if(sel.value!==k){ sel.value=k; sel.onchange&&sel.onchange(new Event('change')); } return true; };
      /* layers pulldown */
      /* (#R23) compare layer picker = native <select> (one layer at a time). buildLayerDD repopulates it;
         picking a layer hides the previous one and lazily adds + shows the new one. */
      const sel=win.querySelector('#cmp-layers-sel');
      /* (#R32b) The compare picker offers the SAME high-quality layers as the main map for FREE selection
         (the user's clarification: "同一条件・クオリティのものを選択できるように" — NOT auto-reflect the main
         map's current selection). No auto-mirror; pick any CMP_LAYER (each is the full-quality clone). */
      function buildLayerDD(){ if(!sel) return; sel.innerHTML='<option value="">'+(IntMapLang.t(HOST.lang,"Select a layer…","レイヤーを選択…","Ebene auswählen…","Выберите слой…","Seleccione una capa…"))+'</option>'+CMP_LAYERS.map(L=>'<option value="'+L.k+'">'+L.n()+'</option>').join(''); try{ sel.value=curCmpLayer; }catch(_){} }
      buildLayerDD();
      if(sel) sel.onchange=()=>{
        const prev=CMP_LAYERS.find(x=>x.k===curCmpLayer); if(prev) prev.ids.forEach(id=>setVis(id,false));
        curCmpLayer=sel.value; _tv=null; const L=CMP_LAYERS.find(x=>x.k===curCmpLayer); if(!L){ applyTime(); return; }
        /* (time-compare-lapse) shown through `showLayer`, which keeps a layer held for this window's instant hidden —
           and judged at that instant before anything is drawn off the present (applyTime) */
        if(!CT.isLive()){ _held.add(L.k); }
        /* (then-now-card) …and added only once this window's style can take a source. A pick made in the same breath as
           the window's first open (Atlas `timeCompare` with a layer, «あの頃といま», a restore) used to reach `addSource`
           before the style had loaded: it threw inside the entry's own try, so the layer never existed while the verdict
           said «drawn» (measured: histb at 1914, 203 features answered, no `cmp-hb` source on the map). The view's own
           wait (js/geo-engine.js whenCanDraw — answers only when it is true) is the one gate, for every caller; the
           judgement waits on the same promise, so `judged()` resolves after the layer is on the map. */
        const show=()=>showLayer(L,true);
        _judging=Promise.resolve(cmap.whenCanDraw?cmap.whenCanDraw():null).then(()=>{ if(curCmpLayer!==L.k) return;
          try{ L.add(()=>{ show(); applyTime(); }); }catch(_){} show(); setTimeout(show,400); setTimeout(show,1500);
          return judgeAndShow(); });
        if(xrayOn()) setTimeout(()=>{ try{ layoutXrayLens(); }catch(_){} },120);   /* (#R32b) re-fit the lens so a newly-picked layer paints inside x-ray */
      };
      /* (time-compare-lapse) the time row: follow the main map's clock, hold one of this window's own, or the present */
      win.querySelectorAll('[data-t]').forEach(b=>b.onclick=()=>{ setTime(b.getAttribute('data-t')==='follow'?{follow:true}:{follow:false}); });
      const yIn=win.querySelector('#cmp-year');
      if(yIn) yIn.onchange=()=>{ const y=Math.round(+yIn.value); if(yIn.value!==''&&isFinite(y)) setTime({year:y}); };
      const tNow=win.querySelector('#cmp-tnow'); if(tNow) tNow.onclick=()=>setTime({now:true});
      CT.on(()=>{ paintTime(); applyTime(); applyBase(); announce(); });
      IntMapTime.on(()=>paintTime());
      paintTime();
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
          mb.title=minimized?(IntMapLang.t(HOST.lang,"Restore","元に戻す","Wiederherstellen","Восстановить","Restaurar")):(IntMapLang.t(HOST.lang,"Minimize","最小化","Minimieren","Свернуть","Minimizar"));
        }catch(_){}
      };
      win.querySelector('#cmp-close').onclick=close;
      /* (#R26) The compare window must not sit ON TOP OF the sidebar — clamp its left edge to the sidebar's
         right edge (desktop, sidebar visible on the left). On mobile it's a full-width sheet → no clamp. */
      const _sbRight=()=>{ try{ if(_compact()) return 0; const sb=document.getElementById('sidebar'); if(!sb||sb.classList.contains('collapsed')) return 0; const r=sb.getBoundingClientRect(); return (r.width>0 && r.left<=2)?(r.right+8):0; }catch(_){ return 0; } };
      /* (compare-window-bounds) THE WHOLE WINDOW STAYS ON SCREEN, ON ALL FOUR SIDES. 「ウィンドウは画面左上にはそれ以上外に
         行かないようにちゃんとなってるのに、右下には埋もれてしまう」 (2026-10-05): the drag stopped the left/top edges at the
         sidebar and 0, but the right/bottom at «60 px / 30 px still showing» (measured 1280×800: dragged to [1220,770,1661,1111]).
         One rule now — the window's own box inside the viewport, its left edge right of the sidebar — and the same rule
         re-applies when the viewport or the sidebar changes (`_cmpReclamp`) and bounds the edge-resize (`bounds` below). */
      const _vp=()=>{ const de=document.documentElement; return [de.clientWidth||window.innerWidth, de.clientHeight||window.innerHeight]; };
      const _fitPos=(l,t,w,h)=>{ const v=_vp(); return [Math.max(_sbRight(),Math.min(v[0]-w,l)), Math.max(0,Math.min(v[1]-h,t))]; };
      win.__cmpFitPos=_fitPos;   /* `_cmpReclamp` (outside this closure) asks the same rule */
      /* drag by header */
      (function(){ const h=win.querySelector('.cmp-head'); let dx=0,dy=0,drag=false;
        /* (compare-window-bounds) «リサイズの挙動がバグってる»: the header IS the top 9 px edge zone, and its listener runs
           before the window's edge-resize one — so a press on the top edge started BOTH, and the edge-resize's pointer
           capture swallowed the header's pointerup: `drag` stayed true and the window then followed the bare pointer
           (measured: a top-edge resize, then a hover over the header moved the window 121 px left / 197 px down). The
           press belongs to the edge when the edge claims it, and a move with no button down ends any drag. */
        const _onEdge=e=>{ try{ const E=win.__imEdge; return !!(E&&!(E.skip&&E.skip())&&E.edgeAt(e.clientX,e.clientY)); }catch(_){ return false; } };
        h.addEventListener('pointerdown',e=>{ if(e.target.closest('.cmp-btn')||win.dataset.resizing||_onEdge(e)) return; drag=true; const r=win.getBoundingClientRect(); dx=e.clientX-r.left; dy=e.clientY-r.top; win.style.right='auto'; win.style.bottom='auto'; win.style.left=r.left+'px'; win.style.top=r.top+'px'; try{h.setPointerCapture(e.pointerId);}catch(_){} });
        h.addEventListener('pointermove',e=>{ if(!drag) return; if(!(e.buttons&1)){ drag=false; return; } const r=win.getBoundingClientRect(), p=_fitPos(e.clientX-dx,e.clientY-dy,r.width,r.height); win.style.left=p[0]+'px'; win.style.top=p[1]+'px'; if(mode!=='free') syncFromMain(); /* lens/centroid follow the window */ });
        const _end=()=>drag=false; h.addEventListener('pointerup',_end); h.addEventListener('pointercancel',_end); h.addEventListener('lostpointercapture',_end);
      })();
      /* (compare-window-resize) RESIZE FROM ANY EDGE OR CORNER — the app's one edge-resize (js/window-manager.js
         addEdgeResize), the same the Atlas window and the route card use. 「compare viewのウィンドウ、サイズ変更ができない。」
         (2026-10-04, a PC, «辺や角をドラッグ»): the window had its OWN four 18 px corner squares (#R20) with their mark hidden
         (#R47), and no edge at all — four invisible dots were the whole resize. window-manager's own note already listed
         Compare among the windows that «keep edge-resize», but nothing called it for this window. A 9 px zone on every edge
         and corner, the resize cursor on hover, a minimum size. On a phone the window is pinned full-width by the
         COMPACT rule and its height has the grip below (.cmp-resize), so the edge zone stands aside there (`skip`):
         it would only swallow the first pixels of a pan. The ResizeObserver below resizes the map whichever path moved it. */
      try{ if(typeof HOST.addEdgeResize==='function') HOST.addEdgeResize(win,{ min:[260,200], skip:()=>_compact(), bounds:()=>({l:_sbRight()}) }); }catch(_){}
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
      GE().events.on('idle',()=>{ if(lensOn()) syncFromMain(); });
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
      /* (map-layer-system-chronos) opened by an operation: it takes the front from the panel the operation was made in —
         «Then & now» in the Chronos panel otherwise opened this window under that panel (js/ui-stack.js `opened`) */
      try{ window.IntMapStack.opened(win); }catch(_){}
      paintTime(); applyTime();   /* (time-compare-lapse) the window's instant, and the picked layer judged at it */
      /* (#R30) While compare is open on mobile, MOVE the main-map FAB stack to the bottom-LEFT (CSS on
         body.cmp-open). The compare window is a full-width top panel and its close × sits top-right — exactly
         where the Layers/Map FABs normally live, which caused "×がレイヤー選択ボタンと重なる / 終了できない".
         Moving (not hiding — "勝手に消すな") keeps them usable AND clear of the bottom-right timebar. */
      try{ document.body.classList.add('cmp-open'); }catch(_){}
      /* (#R26) Make sure the default (bottom-right) position doesn't land ON TOP OF the sidebar on a narrow
         desktop / wide sidebar — nudge the window right of the sidebar if it would overlap. */
      try{ if(!_compact()){ const sb=document.getElementById('sidebar');
        if(sb && !sb.classList.contains('collapsed')){ const sr=sb.getBoundingClientRect(); const wr=win.getBoundingClientRect();
          if(sr.width>0 && sr.left<=2 && wr.left < sr.right+8){ win.style.right='auto'; win.style.left=(sr.right+12)+'px'; } } } }catch(_){}
      /* (#R22) Resize several times after the window becomes visible so the GL canvas always fills the
         body — a single deferred resize sometimes left an unsized gray strip at the top ("上部がグレー"). */
      const fit=()=>{ try{cmap.render.resize();}catch(_){} followProjection(); if(mode!=='free') syncFromMain(); };
      requestAnimationFrame(fit); setTimeout(fit,80); setTimeout(fit,300); try{ cmap.events.once('idle',fit); }catch(_){} }
    function close(){ try{ document.body.classList.remove('cmp-open'); }catch(_){}   /* (#R28) restore the main-map FABs */
      if(win){ if(xrayOn()){ try{ clearXrayLens(); }catch(_){} } if(swipeOn()){ try{ clearSwipe(); }catch(_){} } win.style.display='none'; win.classList.remove('cmp-xray','cmp-swipe'); mode='sync'; prevAnnounced=mode;
      try{ win.querySelectorAll('[data-m]').forEach(x=>x.classList.toggle('on',x.getAttribute('data-m')==='sync')); }catch(_){} applyBase(); } }
    /* (#R27) Re-clamp the window OFF the sidebar whenever the sidebar WIDTH changes — the open/drag clamps
       didn't cover a LIVE sidebar resize, so widening the sidebar slid it under the window ("サイドバーを
       広げるとCompare view windowがサイドバーの上に載る"). Pushes the window right if the now-wider sidebar
       would overlap it. */
    /* (compare-window-bounds) …and the same for every side: a narrowed browser window left it below/right of the
       screen. The rule is the drag's (`_fitPos`), so the two cannot disagree about where the window may be. */
    window._cmpReclamp=function(){ try{ if(!win||win.style.display==='none') return; if(_compact()||!win.__cmpFitPos) return;
      const wr=win.getBoundingClientRect(), p=win.__cmpFitPos(wr.left,wr.top,wr.width,wr.height);
      if(p[0]!==wr.left||p[1]!==wr.top){ win.style.right='auto'; win.style.bottom='auto'; win.style.setProperty('left',p[0]+'px','important'); win.style.setProperty('top',p[1]+'px','important'); try{ cmap.render.resize(); }catch(_){} if(mode!=='free') syncFromMain(); } }catch(_){} };
    /* entry button in the Layers dropdown */
    /* (#R17) Dedupe by the BUTTON, not the #cmp-mount wrapper — reorganizeLayerPanel MOVES the button into
       #layer-tools and removes the wrapper, so the old wrapper-guard let a later call create a SECOND button
       ("Tools二重" on mobile). Re-file into Tools right after mounting so the section never goes missing. */
    const cmpBtnLabel=()=>IntMapLang.t(HOST.lang,"Open compare view","比較ビューを開く","Vergleichsansicht öffnen","Открыть режим сравнения","Abrir la vista de comparación");
    function mountButton(){ const dd=document.getElementById('layer-dropdown'); if(!dd||document.getElementById('btn-compare')) return;
      const wrap=document.createElement('div'); wrap.id='cmp-mount'; wrap.style.marginTop='4px';
      wrap.innerHTML=('<button id="btn-compare" class="ai-test-btn" style="width:100%;">'+icon('columns')+' <span>')+cmpBtnLabel()+'</span></button>';
      dd.appendChild(wrap); wrap.querySelector('#btn-compare').onclick=open;
      try{ window.reorganizeLayerPanel&&window.reorganizeLayerPanel(); }catch(_){} }
    mountButton(); setTimeout(mountButton,1600);
    /* ⚠ (#R466) …and those two calls are the ONLY ones: the dedupe guard above makes mountButton a
       no-op once the button exists, so the label was frozen in whatever language the session booted
       in. It lives in the Layers panel, which stays open across a language change. */
    try{ window.addEventListener('intmap-lang',()=>{ try{ const b=document.getElementById('btn-compare'); const sp=b&&b.querySelector('span'); if(sp) sp.textContent=cmpBtnLabel(); }catch(_){} }); }catch(_){}
    /* (#R27) Re-clamp the compare window off the sidebar whenever the sidebar slides open/closed or is
       resized (covers "サイドバーを広げるとcompare viewがサイドバーの上に載る"). The 450ms re-run waits out the
       0.4s sidebar slide so the final geometry is clamped, not the mid-transition one. */
    try{
      const _reclampSoon=()=>{ try{ window._cmpReclamp&&window._cmpReclamp(); }catch(_){} setTimeout(()=>{ try{ window._cmpReclamp&&window._cmpReclamp(); }catch(_){} },450); };
      bus.on('intmap-sidebar-resize',_reclampSoon);
      window.addEventListener('resize',_reclampSoon);   /* (compare-window-bounds) a narrowed browser window must not leave it off-screen */
      document.addEventListener('click',(e)=>{ try{ if(e.target.closest&&e.target.closest('.btn-toggle-sidebar')) _reclampSoon(); }catch(_){} });
      const _sbEl=document.getElementById('sidebar'); if(_sbEl) _sbEl.addEventListener('transitionend',(e)=>{ if(e.propertyName==='margin-left'||e.propertyName==='width') _reclampSoon(); });
    }catch(_){}
    mirror();   /* (time-compare-lapse) a window opened on a travelling map starts at its instant */
    const api={ open, close, _map:()=>cmap, setTime, timeState, timeParam, judged, clock:()=>CT,
      /* (then-now-card) */ setMode:(m)=>{ if(!MODES.includes(m)) return timeState(); open(); _setMode(m); return timeState(); }, setSplit, thenNow };
    _cmpApi=api;
    return api;
  })();
}
