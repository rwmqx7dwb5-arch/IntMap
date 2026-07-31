/* ============================================================================
 *  IntMap · VECTOR TILES FOR THE SECOND ENGINE  (#R180)
 * ----------------------------------------------------------------------------
 *  Cesium has no vector-tile pipeline. Six of the app's 122 sources are
 *  `type:'vector'` — OpenFreeMap planet (the place labels and the beta
 *  overlays), the languages tileset, the contour tiles maplibre-contour derives
 *  from the DEM, and two Open-Meteo weather tilesets — and the user chose full
 *  parity, so they have to draw in Cesium too rather than being quietly missing
 *  from the layer list.
 *
 *  WHAT MAKES THIS TRACTABLE. The hard part of vector tiles in a renderer is the
 *  RENDERER — binning, tessellating and label-placing millions of features per
 *  frame. That part is already solved on this side: 97 of the app's sources are
 *  GeoJSON and js/cesium-engine.js already turns GeoJSON features into Cesium
 *  primitives through the same style interpreter. So a vector tile only has to
 *  become FEATURES. `@mapbox/vector-tile` decodes the protobuf and its
 *  `toGeoJSON(x,y,z)` returns lng/lat geometry directly — the same geometry the
 *  GeoJSON path already draws.
 *
 *  What this file owns, therefore, is the PYRAMID, not the drawing: which tiles
 *  the current camera needs, fetching them without stampeding, decoding them off
 *  the critical path, caching them, and telling the layer above when the set of
 *  visible features changed. Both libraries are imported dynamically, so a
 *  MapLibre session never downloads either.
 * ==========================================================================*/
window.IntMapVectorTiles=(function(){
  'use strict';

  let _VectorTile=null, _Pbf=null, _libP=null;
  /* Loaded on first use, once. A MapLibre session never reaches this. */
  function lib(){
    if(_libP) return _libP;
    _libP=Promise.all([import('@mapbox/vector-tile'), import('pbf')]).then(([vt,pbf])=>{
      _VectorTile=vt.VectorTile||(vt.default&&vt.default.VectorTile);
      _Pbf=pbf.default||pbf;
      return !!(_VectorTile&&_Pbf);
    }).catch(()=>false);
    return _libP;
  }

  const D2R=Math.PI/180;
  /* the standard Web-Mercator tile cover for a lng/lat box at an integer zoom */
  function tileX(lng,z){ return Math.floor(((lng+180)/360)*Math.pow(2,z)); }
  function tileY(lat,z){
    const l=Math.max(-85.05112878,Math.min(85.05112878,lat));
    return Math.floor((1-Math.log(Math.tan(l*D2R)+1/Math.cos(l*D2R))/Math.PI)/2*Math.pow(2,z));
  }

  /* ── ONE SOURCE ────────────────────────────────────────────────────────────
     `spec` is the MapLibre source object verbatim — {type:'vector', tiles:[…]} or
     {type:'vector', url:'…'} (a TileJSON document, which OpenFreeMap and the
     Open-Meteo tilesets both use and which has to be fetched before anything can
     be requested). */
  function makeSource(id,spec,onChange){
    const state={ id, spec, tiles:(spec&&spec.tiles)||null, minzoom:(spec&&spec.minzoom)||0,
                  maxzoom:(spec&&spec.maxzoom!=null)?spec.maxzoom:14, ready:!!(spec&&spec.tiles), error:null };
    const cache=new Map();                 /* "z/x/y" → {features:[…]} | 'pending' | 'error' */
    const CACHE_MAX=320;                   /* ≈ six screens of tiles; decoded features are the heavy part */
    let inflight=0; const MAX_INFLIGHT=8;
    const queue=[];
    /* ══ (#R181) WHAT IS STILL WANTED IS A SET OF TILES, NOT A COUNTER ═════════════════════════
       This was a `generation` counter bumped once per update() call, and queued work was thrown
       away when its generation no longer matched — the comment said "the camera moved on", but
       update() is called once per LAYER per frame, not once per camera change. Ten vector layers
       over one source is ten bumps a frame with the map standing still, so a tile queued by one
       layer was cancelled by the next layer asking, and — the part that actually broke the map —
       `onChange` was gated on the same stale comparison, so "a tile arrived, redraw" was almost
       never delivered.
       Measured: pan to z12, back out to z1.7, and the country labels never came back. 768
       features reached the layer and 714 passed its filter, with the layer visible, in zoom range
       and its data source shown — and it drew NOTHING, because the rebuild that would have used
       them was never asked for. It stayed that way indefinitely; only another camera movement
       cleared it.
       So say the thing that was meant: a tile is still wanted if it is in the cover the CURRENT
       view asks for. That is exactly a set membership test, it cannot drift when a second layer
       asks the same question, and a tile that lands is always announced. */
    let wantSet=new Set();

    /* TileJSON, when the source was given a `url` rather than a template list */
    const tjP=state.ready?Promise.resolve(true):fetch(spec.url,{mode:'cors',credentials:'omit'})
      .then(r=>r.ok?r.json():Promise.reject(new Error('tilejson '+r.status)))
      .then(tj=>{ state.tiles=tj.tiles||null;
        if(tj.minzoom!=null) state.minzoom=tj.minzoom;
        if(tj.maxzoom!=null) state.maxzoom=tj.maxzoom;
        state.ready=!!state.tiles; return state.ready; })
      .catch(e=>{ state.error=String(e&&e.message||e); return false; });

    const key=(z,x,y)=>z+'/'+x+'/'+y;
    function urlFor(z,x,y){
      const list=state.tiles; if(!list||!list.length) return null;
      /* the same round-robin over host aliases the raster paths use, so one host's
         six-connection limit is not the ceiling on a whole screen of tiles */
      const t=list[(x+y)%list.length];
      return t.replace('{z}',z).replace('{x}',x).replace('{y}',y)
              .replace(/\{s\}/,'abc'[(x+y)%3]).replace(/\{ratio\}/,'');
    }
    function touch(k,v){
      cache.delete(k); cache.set(k,v);
      while(cache.size>CACHE_MAX){ const f=cache.keys().next().value; if(f===k) break; cache.delete(f); }
    }
    function pump(){
      while(inflight<MAX_INFLIGHT&&queue.length){
        const job=queue.shift();
        /* dropped only when the view no longer covers it — and the pending marker goes with it,
           so the tile is asked for again the moment it IS wanted */
        if(!wantSet.has(job.k)){ cache.delete(job.k); continue; }
        inflight++;
        load(job).finally(()=>{ inflight--; pump(); });
      }
    }
    async function load(job){
      const {z,x,y,k}=job;
      const url=urlFor(z,x,y);
      if(!url){ touch(k,'error'); return; }
      try{
        const ok=await lib(); if(!ok){ touch(k,'error'); return; }
        const r=await fetch(url,{mode:'cors',credentials:'omit'});
        if(!r.ok){ touch(k, r.status===404?{features:[]}:'error'); return; }   /* 404 = an honest empty tile */
        const buf=await r.arrayBuffer();
        if(!buf.byteLength){ touch(k,{features:[]}); return; }
        const vt=new _VectorTile(new _Pbf(buf));
        const feats=[];
        for(const name of Object.keys(vt.layers||{})){
          const L=vt.layers[name];
          for(let i=0;i<L.length;i++){
            let g=null; try{ g=L.feature(i).toGeoJSON(x,y,z); }catch(_){ continue; }
            if(!g||!g.geometry) continue;
            /* `sourceLayer` is how a style layer selects within a tileset, and it is
               the ONE thing toGeoJSON does not carry over. */
            g.sourceLayer=name;
            g.tileKey=k;
            feats.push(g);
          }
        }
        touch(k,{features:feats});
        /* a tile that decoded and is still on screen is news, always — the layer above
           coalesces the redraw on the next animation frame, so saying so twice costs nothing
           and saying it never leaves the layer blank (see wantSet) */
        if(wantSet.has(k)&&onChange) { try{ onChange(); }catch(_){} }
      }catch(_){ touch(k,'error'); }
    }

    /* Which tiles cover this view, at the zoom this source can actually serve.
       Overzoom is deliberate and matches MapLibre: past `maxzoom` the deepest
       tiles keep being used rather than the layer vanishing. */
    function cover(bounds,zoom){
      const z=Math.max(state.minzoom,Math.min(state.maxzoom,Math.floor(zoom)));
      const n=Math.pow(2,z);
      let x0=tileX(bounds.west,z), x1=tileX(bounds.east,z);
      const y0=tileY(bounds.north,z), y1=tileY(bounds.south,z);
      const out=[];
      /* a view that crosses the antimeridian reports west > east */
      const spans=(x0<=x1)?[[x0,x1]]:[[x0,n-1],[0,x1]];
      let count=0;
      for(const [a,b] of spans) for(let x=a;x<=b;x++) for(let y=y0;y<=y1;y++){
        if(y<0||y>=n) continue;
        out.push([z,((x%n)+n)%n,y]);
        if(++count>MAX_TILES) return out;      /* a whole-globe view at z14 is not a request, it is a mistake */
      }
      return out;
    }
    const MAX_TILES=64;

    /* ══ (#R185) WHAT THIS VIEW WANTS, SAID WITHOUT ASSEMBLING ANYTHING ═══════════════════════
       `update()` below does two separable jobs: it declares which tiles the current view needs
       (cheap — a cover and a queue), and it concatenates every decoded feature in that cover
       (expensive — tens of thousands of objects). The layer above called it once PER LAYER PER
       CAMERA FRAME, so ten style layers over one tileset paid the concatenation ten times a
       frame whether or not anything had changed. Measured on the 3-D satellite scene over the
       Alps: 979 ms of feature assembly across a 40-step drag, and 2,963 ms of entity rebuilding
       downstream of it, for a tile cover that was IDENTICAL on most of those frames.
       So the declaration gets its own entrance, and it answers with a SIGNATURE of the cover.
       Same cover ⇒ same features ⇒ the entities already on screen are already right, and the
       caller can skip the whole rebuild. The signature is the level plus the tile-key list, so
       it changes exactly when the set of tiles does — no earlier (a sub-pixel pan) and no later
       (crossing a tile boundary, or the zoom stepping to another level). */
    let lastSig='';
    function want(bounds,zoom){
      if(!state.ready){ tjP.then(ok=>{ if(ok&&onChange) onChange(); }); return ''; }
      const list=cover(bounds,zoom);
      const next=new Set();
      let sig='';
      for(const [z,x,y] of list){ const k=key(z,x,y); next.add(k); sig+=k+' '; }
      wantSet=next;
      for(const [z,x,y] of list){
        const k=key(z,x,y);
        if(cache.get(k)===undefined){ cache.set(k,'pending'); queue.push({z,x,y,k}); }
      }
      pump();
      lastSig=sig;
      return sig;
    }
    /* the signature of the cover last DECLARED — used by the layer above to notice that a tile
       landing (which is announced through onChange, not through want()) has changed the answer */
    function sig(){ return lastSig; }

    /* Ask for the tiles this view needs; returns the features already decoded.
       Never blocks: what is not in yet arrives through `onChange`. */
    function update(bounds,zoom){
      if(!state.ready){ want(bounds,zoom); return []; }
      want(bounds,zoom);
      const out=[];
      for(const [z,x,y] of cover(bounds,zoom)){
        const k=key(z,x,y);
        const v=cache.get(k);
        if(v&&v!=='pending'&&v!=='error'){ touch(k,v); out.push(...v.features); }
      }
      return out;
    }
    /* what is decoded RIGHT NOW for this view, without scheduling anything */
    function current(bounds,zoom){
      if(!state.ready) return [];
      const out=[];
      for(const [z,x,y] of cover(bounds,zoom)){
        const v=cache.get(key(z,x,y));
        if(v&&v!=='pending'&&v!=='error') out.push(...v.features);
      }
      return out;
    }
    function stats(){
      let ready=0,pending=0,error=0;
      cache.forEach(v=>{ if(v==='pending') pending++; else if(v==='error') error++; else ready++; });
      return { id, ready, pending, error, cached:cache.size, tiles:!!state.tiles,
               minzoom:state.minzoom, maxzoom:state.maxzoom, sourceError:state.error };
    }
    /* (#R181) emptying wantSet is what now cancels the queue — pump() drops every job whose
       tile is no longer wanted, and after destroy() none of them are */
    function destroy(){ wantSet=new Set(); queue.length=0; cache.clear(); lastSig=''; }
    return { id, spec, want, sig, update, current, stats, destroy, isReady:()=>state.ready };
  }

  return { makeSource, lib, _tileX:tileX, _tileY:tileY };
})();
