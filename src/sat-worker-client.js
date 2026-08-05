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
        const p=pend.get(m.id); if(!p) return; pend.delete(m.id);
        if(m.ok) p.res({ data:(m.bitmap||m.buf), mode:m.mode });
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
      try{ it.postMessage({type:'config', rawMax:o.rawMax, depthMax:o.depthMax}); }catch(_){}
      return true; },
    /* one tile. Returns a promise for {data: ImageBitmap|ArrayBuffer, mode}, or null when there is
       no worker to ask — null and a rejected promise mean different things to the caller. */
    tile(z,y,x,hi,signal){
      const it=worker(); if(!it) return null;
      const id=++seq;
      const p=new Promise((res,rej)=>{ pend.set(id,{res,rej}); });
      try{ it.postMessage({type:'tile', id, z, y, x, hi:!!hi}); }
      catch(_){ pend.delete(id); return null; }
      if(signal){ try{ signal.addEventListener('abort',()=>{ try{ it.postMessage({type:'abort',id}); }catch(_){} },{once:true}); }catch(_){} }
      return p;
    },
    state:()=>({ available:!!w, pending:pend.size, requests:seq })
  };
})();
