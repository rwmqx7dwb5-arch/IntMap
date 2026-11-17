/* ============================================================================
 *  IntMap · Dashboard cache & extended info cards  (#R167)
 * ----------------------------------------------------------------------------
 *  (A) window.IntMapCache — the IndexedDB key/value store several modules share, and
 *  (B) the extended dashboard cards it warms on boot.
 *  WRITES one host member: the cached card list is assigned back to extendedDashDB, whose
 *  declaration stays in index.html as the single source of truth.
 * ==========================================================================*/

import { everyTick } from './runtime.js';   /* (#R408) the one timer wheel — see js/runtime.js */
import { IntMapGeoEngine } from './geo-engine.js';



export function dashExtended(HOST){
 const GE=()=>IntMapGeoEngine;   /* (#R178) the renderer, through the contract — never the raw handle */
  const loadDashFromSupabase=HOST.loadDashFromSupabase, renderDashboard=HOST.renderDashboard;
  /* ===================== R7 — Next-gen ADDITIVE architecture & intelligence overlays =====================
     100% additive & self-contained — it never mutates the existing MapLibre / Supabase / i18n / timezone
     logic, honouring the repeated "全ロジックを破壊せずに" constraint. It delivers the achievable core of the
     next-gen brief WITHOUT a risky full CesiumJS rewrite of a working 8k-line app (that swap would break
     every feature; the app is instead made modular):
       (A) IndexedDB persistence  (D) speculative camera-lookahead tile prefetch
       [(B) a simulation bridge and (C) a Web-Worker offload bridge were never called and are gone]
       [(E) the hand-drawn dispute lines, air-defence "domes" and the unshipped languages overlay had no entry
        and no source; they are gone — the Ukraine front is beta-dl-ukrfront, languages are beta-dl-cat-language] */
  (function(){
    if(!GE().hasRenderer()) return;

    /* ---------- (A) IndexedDB persistence — instant next-load + offline resilience ---------- */
    window.IntMapCache=(function(){
      const DBN='intmap', STORE='kv'; let dbp=null;
      function open(){ if(dbp) return dbp; dbp=new Promise((res,rej)=>{ try{ const r=indexedDB.open(DBN,1); r.onupgradeneeded=()=>{ try{ r.result.createObjectStore(STORE); }catch(_){} }; r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }catch(e){ rej(e); } }); return dbp; }
      async function set(k,v){ try{ const db=await open(); return await new Promise(res=>{ const tx=db.transaction(STORE,'readwrite'); tx.objectStore(STORE).put(v,k); tx.oncomplete=()=>res(true); tx.onerror=()=>res(false); }); }catch(_){ try{ localStorage.setItem('imc_'+k,JSON.stringify(v)); }catch(__){} return false; } }
      async function get(k){ try{ const db=await open(); return await new Promise(res=>{ const tx=db.transaction(STORE,'readonly'); const rq=tx.objectStore(STORE).get(k); rq.onsuccess=()=>res(rq.result); rq.onerror=()=>res(null); }); }catch(_){ try{ return JSON.parse(localStorage.getItem('imc_'+k)||'null'); }catch(__){ return null; } } }
      return { get, set };
    })();
    /* Mirror Supabase intelligence (dashboard cards) into IndexedDB for an instant warm start next time. */
    try{ const _origLoadDash=(typeof loadDashFromSupabase==='function')?loadDashFromSupabase:null;
      window.IntMapCache.get('dash_cards').then(c=>{ try{ if(c&&c.length && typeof HOST.extendedDashDB!=='undefined' && (!HOST.extendedDashDB||!HOST.extendedDashDB.length)){ HOST.extendedDashDB=c; if(HOST.mode==='info'&&typeof renderDashboard==='function') renderDashboard(); } }catch(_){} });
      /* ⚠ (#R408) NOT `whenHidden`, and the write is why the question had to be asked. What it mirrors is a copy of a
         REMOTE list (loadDashFromSupabase), used only to paint the cards instantly on the NEXT load before the fetch
         answers — so a tick skipped while hidden loses nothing on return (the wheel runs it once when the tab comes
         back, and nothing reads the key until the next boot), and the worst case, hidden-then-closed, costs a colder
         start of a cache the network refills. Nothing the reader made lives here. */
      everyTick('dash-extended:cache-cards', 60000, ()=>{ try{ if(typeof HOST.extendedDashDB!=='undefined' && HOST.extendedDashDB && HOST.extendedDashDB.length) window.IntMapCache.set('dash_cards', HOST.extendedDashDB); }catch(_){} });
    }catch(_){}

    /* ---------- (D) Speculative tile prefetch — camera-direction lookahead ---------- */
    (function(){
      let hist=[];
      function activeTpl(){ try{ const st=GE().scene.getStyle(); if(!st) return null;
        if(typeof HOST.mapType!=='undefined' && HOST.mapType==='sat'){ const s=st.sources['satellite']; return s&&s.tiles&&s.tiles[0]; }
        for(const id of ['bd','bdn','bl','bln']){ const s=st.sources[id]; if(s&&s.tiles){ const lyr=(st.layers||[]).find(l=>l.source===id); if(lyr && GE().layers.has(lyr.id) && GE().layers.getLayout(lyr.id,'visibility')!=='none') return s.tiles[0]; } }
        const s=st.sources['bd']; return s&&s.tiles&&s.tiles[0]; }catch(_){ return null; } }
      /* ══ (#R286) A STYLE TILE TEMPLATE IS NOT ALWAYS A URL THE BROWSER CAN LOAD ═════════════
         This warmed a tile by substituting the numbers into the ACTIVE STYLE's own template and
         assigning the result to `new Image().src` — which means something only for `http(s):`. The
         satellite source has been served by the REGISTERED `imapsat://` protocol since #R158
         (js/sat-proto.js), and satellite is the DEFAULT basemap since #R207, so the ordinary case
         handed the browser `imapsat://2/0/2`. MEASURED: twenty of them per prefetch, every one
         refused against index.html's `img-src 'self' https: data: blob:`, and the protocol handler
         never consulted — so the warm warmed NOTHING and paid for it in console errors. It surfaced
         as an INTERMITTENT failure of tests/monitors.spec.js's console-error gate, intermittent only
         because this block fires on a fast `moveend` PAIR; the leak itself was not.
         The app registers five protocols (`imapsat`, `om`, and the DEM / world-base / crop ones), so
         the rule is about the SCHEME and not about a name: warm what the browser can load, and warm
         nothing for a template it cannot.
         ⚠ REFUSING IS NOT SILENCING, AND SATELLITE IS NOT LEFT UNWARMED. js/tile-warm.js OWNS the
         satellite prefetch: on this same `moveend` it warms that imagery through the protocol's own
         network URL (`IntMapSatProto.tileUrl`, #R206), at the level the render path actually asks
         for, across both Esri hosts, behind the dedupe memory #R196 added after measuring 865
         requests for 112 distinct tiles on a phone. A second, memory-less, twenty-five-tile block
         built here would re-create THAT defect while repairing this one. */
      const browserLoadable=(tpl)=>{ const m=/^\s*([a-z0-9+.-]+):/i.exec(tpl||''); return !m||/^https?$/i.test(m[1]); };
      /* …and the refusal is OBSERVABLE, so 「this path is dead」 can never pass for 「this path is quiet」. */
      let _last=null;
      function prefetch(lng,lat,z){ const tpl=activeTpl(); if(!tpl) return;
        if(!browserLoadable(tpl)){ _last={tpl:tpl,warmed:0,refused:true}; return; }
        z=Math.max(0,Math.min(18,Math.round(z))); const n=Math.pow(2,z);
        const xc=Math.floor((lng+180)/360*n), latR=lat*Math.PI/180, yc=Math.floor((1-Math.log(Math.tan(latR)+1/Math.cos(latR))/Math.PI)/2*n);
        let cnt=0; for(let dx=-2;dx<=2;dx++){ for(let dy=-2;dy<=2;dy++){ if(cnt>=22) break; const x=((xc+dx)%n+n)%n, y=yc+dy; if(y<0||y>=n) continue; const url=tpl.replace('{z}',z).replace('{x}',x).replace('{y}',y).replace('{s}','a'); try{ const im=new Image(); im.decoding='async'; im.src=url; }catch(_){} cnt++; } }
        _last={tpl:tpl,warmed:cnt,refused:false}; }
      GE().events.on('moveend',()=>{ try{ const c=GE().camera.getCenter(), z=GE().camera.getZoom(), now=performance.now(); hist.push({lng:c.lng,lat:c.lat,t:now}); if(hist.length>3) hist.shift(); if(hist.length<2) return; const a=hist[hist.length-2], b=hist[hist.length-1], dt=Math.max(1,b.t-a.t); let dl=b.lng-a.lng; if(dl>180)dl-=360; else if(dl<-180)dl+=360; const vlng=dl/dt, vlat=(b.lat-a.lat)/dt, look=550, pl=b.lng+vlng*look, pa=Math.max(-85,Math.min(85,b.lat+vlat*look)); if(Math.abs(vlng*look)<0.15 && Math.abs(vlat*look)<0.15) return; prefetch(pl,pa,z); }catch(_){} });
      window.SpeculativePrefetch={ prefetch, last:()=>_last };
    })();

  })();
}
