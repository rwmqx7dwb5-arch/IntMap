/* ============================================================================
 *  IntMap · THE PAGE SIDE OF THE TSUNAMI SOLVER — window.IntMapTsunamiWorker  (#R193)
 * ----------------------------------------------------------------------------
 *  src/tsunami-worker.js integrates the shallow-water equations; this is the half that has to live on
 *  the page. It starts the worker lazily, streams frames back to the caller as they are produced (so
 *  the animation is watchable long before the run ends), and reports progress.
 *
 *  It lives in src/ rather than js/ for the one reason src/sat-worker-client.js does: naming the
 *  worker asset needs `new URL(…, import.meta.url)`, which is what lets the bundler emit and
 *  fingerprint the worker. Everything degrades — if Worker is missing, `available()` is false and
 *  js/tsunami.js runs the same solver on the page in slices instead.
 * ==========================================================================*/
window.IntMapTsunamiWorker=(function(){
  'use strict';
  let w=null, tried=false, seq=0;
  const jobs=new Map();

  function worker(){
    if(tried) return w;
    tried=true;
    try{
      if(typeof Worker!=='function') return null;
      const it=new Worker(new URL('./tsunami-worker.js',import.meta.url),{type:'module'});
      it.onmessage=(ev)=>{
        const m=ev.data||{}; const j=jobs.get(m.id); if(!j) return;
        if(m.type==='frames'){ try{ j.onFrames&&j.onFrames(m.frames,m.nFrames,!!m.done); }catch(_){} return; }
        if(m.type==='progress'){ try{ j.onProgress&&j.onProgress(m.pct,m.frames,m.nFrames); }catch(_){} return; }
        if(m.type==='done'){ jobs.delete(m.id); try{ j.res(m); }catch(_){} return; }
        if(m.type==='aborted'){ jobs.delete(m.id); try{ j.res(null); }catch(_){} return; }
        if(m.type==='error'){ jobs.delete(m.id); try{ j.rej(new Error(m.err||'tsunami worker')); }catch(_){} return; }
      };
      /* a worker that dies must not take the model with it — the caller falls back to its own path */
      it.onerror=()=>{ try{ it.terminate(); }catch(_){} w=null; tried=true;
        jobs.forEach(j=>{ try{ j.rej(new Error('tsunami worker died')); }catch(_){} }); jobs.clear(); };
      w=it;
    }catch(_){ w=null; }
    return w;
  }

  return {
    available:()=>!!worker(),
    /* Run one model. `o` carries the grid, the sea floor and the initial surface; the two callbacks
       are called as the run proceeds. Resolves with the analysis fields, or null if it was aborted. */
    run(o,onFrames,onProgress){
      const it=worker(); if(!it) return null;
      const id=++seq;
      const p=new Promise((res,rej)=>{ jobs.set(id,{res,rej,onFrames,onProgress}); });
      const msg=Object.assign({type:'run',id},o);
      try{ it.postMessage(msg,[o.h,o.eta0]); }
      catch(_){ jobs.delete(id); return null; }
      return { id, promise:p };
    },
    abort(id){ const it=worker(); if(!it) return false;
      try{ it.postMessage({type:'abort',id}); }catch(_){}
      const j=jobs.get(id); if(j){ jobs.delete(id); try{ j.res(null); }catch(_){} }
      return true; },
    state:()=>({ available:!!w, running:jobs.size, runs:seq })
  };
})();
