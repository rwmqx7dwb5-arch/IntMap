/* ============================================================================
 *  IntMap · THE MAIN-THREAD SIDE OF THE SATELLITE TILE WORKER — window.IntMapSatWorker  (#R192)
 * ----------------------------------------------------------------------------
 *  src/sat-worker.js does the work (fetch, placeholder test, ancestor walk, crop, 2× stitch) and
 *  posts back a TRANSFERABLE ImageBitmap. This is the half that has to live on the page: it starts
 *  the worker lazily, matches replies to requests, forwards aborts, and hands the worker's
 *  imagery-depth updates back to the caller so the main thread's own memo stays current (the debug
 *  hooks and #R179's tests ask that memo SYNCHRONOUSLY, so it cannot live only in the worker).
 *
 *  It is its own file rather than forty more lines inside js/app-body.js because standing rule 13
 *  says new functionality goes in a new file, and it lives in src/ rather than js/ because the ONE
 *  thing it does that a js/ module cannot is name the worker asset: `new URL(…, import.meta.url)` is
 *  what lets the bundler emit and fingerprint src/sat-worker.js, and it is build-coupled by
 *  construction — the same reason src/vendor.js is where it is. Everything degrades: if Worker,
 *  OffscreenCanvas or transferable bitmaps are missing, `available()` is false and the caller keeps
 *  its own main-thread implementation.
 * ==========================================================================*/
window.IntMapSatWorker=(function(){
  'use strict';
  let w=null, tried=false, seq=0;
  const pend=new Map();
  let onDepth=null;

  function worker(){
    if(tried) return w;
    tried=true;
    try{
      if(typeof Worker!=='function'||typeof OffscreenCanvas!=='function'||typeof createImageBitmap!=='function') return null;
      const it=new Worker(new URL('./sat-worker.js',import.meta.url),{type:'module'});
      it.onmessage=(ev)=>{
        const m=ev.data||{};
        if(m.depth&&m.depth.length&&onDepth){ try{ onDepth(m.depth); }catch(_){} }
        const p=pend.get(m.id);
        /* a tile the renderer already abandoned (see `tile` below): nobody will draw this bitmap, so it is
           closed here rather than left for the collector */
        if(!p){ if(m.bitmap){ try{ m.bitmap.close(); }catch(_){} } return; }
        pend.delete(m.id);
        if(m.stats) p.res(m.stats);
        else if(m.ok) p.res({ data:(m.bitmap||m.buf), mode:m.mode });
        else p.rej(new Error(m.err||'sat worker'));
      };
      /* a worker that dies must not take the imagery with it — the caller falls back to its own path */
      it.onerror=()=>{ try{ it.terminate(); }catch(_){} w=null;
        pend.forEach(p=>{ try{ p.rej(new Error('sat worker died')); }catch(_){} }); pend.clear(); };
      w=it;
    }catch(_){ w=null; }
    return w;
  }

  return {
    available:()=>!!worker(),
    /* `depth` is called with [[cellKey, have, stop], …] whenever the worker learns something */
    configure(o){ o=o||{}; if(typeof o.depth==='function') onDepth=o.depth;
      const it=worker(); if(!it) return false;
      try{ it.postMessage({type:'config', rawMax:o.rawMax, depthMax:o.depthMax, lanes:o.lanes}); }catch(_){}
      return true; },
    /* one tile. Returns a promise for {data: ImageBitmap|ArrayBuffer, mode}, or null when there is
       no worker to ask — null and a rejected promise mean different things to the caller. */
    /* ══ (sat-arcgis-3d) AN ABANDONED TILE IS ANSWERED AT ONCE ══════════════════════════════════════
       MapLibre counts this promise against `MAX_PARALLEL_IMAGE_REQUESTS` (src/util/image_request.ts:
       `currentParallelImageRequests` is decremented only when the protocol handler settles) — and the
       satellite and the DEM share that one limit. The abort used to be forwarded and nothing else, so an
       abandoned tile kept its slot until the worker had finished fetching it: MEASURED on a phone (limit
       16, 8 while moving), 54 % of a needed tile's wait was that shared limit. The worker still decides
       what happens to the bytes (#R196); the SLOT is given back the moment the renderer lets go. */
    tile(z,y,x,hi,signal){
      const it=worker(); if(!it) return null;
      const id=++seq;
      const p=new Promise((res,rej)=>{ pend.set(id,{res,rej}); });
      try{ it.postMessage({type:'tile', id, z, y, x, hi:!!hi}); }
      catch(_){ pend.delete(id); return null; }
      if(signal){ try{ signal.addEventListener('abort',()=>{ try{ it.postMessage({type:'abort',id}); }catch(_){}
        const q=pend.get(id); if(q){ pend.delete(id); const e=new Error('aborted'); e.name='AbortError'; try{ q.rej(e); }catch(_){} } },{once:true}); }catch(_){} }
      return p;
    },
    /* what the worker's fetch queue has done — queued / handed to the browser / withdrawn — for the
       instruments (the fetches themselves happen in the worker, invisible to the page's resource timing) */
    stats(){ const it=worker(); if(!it) return Promise.resolve(null);
      const id=++seq; const p=new Promise((res,rej)=>{ pend.set(id,{res,rej}); });
      try{ it.postMessage({type:'stats', id}); }catch(_){ pend.delete(id); return Promise.resolve(null); }
      return p; },
    /* (map-motion) fetch these tiles' bytes ahead of the renderer — [[z,y,x],…], replacing any batch
       still queued (src/sat-worker.js `warm`). Nothing comes back; the renderer's own request later
       finds the bytes. false when there is no worker. */
    warm(tiles){ const it=worker(); if(!it) return false;
      try{ it.postMessage({type:'warm', tiles:Array.isArray(tiles)?tiles:[]}); return true; }catch(_){ return false; } },
    /* ══ ⚠⚠ (#R322) GIVING THE THREAD BACK — see the same note in tsunami-worker-client.js ═══════
       ⚠ THE PENDING TILES ARE REJECTED, NOT RESOLVED, and that is the difference from the tsunami
       client: a tile promise resolves to {data, mode} and js/sat-proto.js hands that straight to
       MapLibre's addProtocol. Resolving with null there would put «no data» where a bitmap belongs;
       a REJECTION is the shape the protocol handler already has an answer for.
       ⚠ NOTHING CLOSES AN ImageBitmap HERE. The bitmaps this client returns are owned by the
       consumer from the moment they are handed over (js/sat-proto.js:253 → MapLibre), and closing
       one that a tile is still being drawn from would blank the tile. What is dropped here are
       promises that never produced a bitmap at all. */
    dispose(){
      const it=w;
      pend.forEach(p=>{ try{ p.rej(new Error('sat worker disposed')); }catch(_){} }); pend.clear();
      w=null; tried=false; onDepth=null;
      if(it){ try{ it.terminate(); }catch(_){} return true; }
      return false;
    },
    state:()=>({ available:!!w, pending:pend.size, requests:seq })
  };
})();
