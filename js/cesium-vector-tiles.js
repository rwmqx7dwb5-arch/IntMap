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
    let generation=0;                      /* bumped on every camera change, so stale work can be dropped */

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
        if(job.gen!==generation){ cache.delete(job.k); continue; }   /* the camera moved on */
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
        if(job.gen===generation&&onChange) { try{ onChange(); }catch(_){} }
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

    /* Ask for the tiles this view needs; returns the features already decoded.
       Never blocks: what is not in yet arrives through `onChange`. */
    function update(bounds,zoom){
      generation++;
      const gen=generation;
      if(!state.ready){ tjP.then(ok=>{ if(ok&&gen===generation&&onChange) onChange(); }); return []; }
      const want=cover(bounds,zoom);
      const out=[];
      for(const [z,x,y] of want){
        const k=key(z,x,y);
        const v=cache.get(k);
        if(v===undefined){ cache.set(k,'pending'); queue.push({z,x,y,k,gen}); }
        else if(v&&v!=='pending'&&v!=='error'){ touch(k,v); out.push(...v.features); }
      }
      pump();
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
    function destroy(){ generation++; queue.length=0; cache.clear(); }
    return { id, spec, update, current, stats, destroy, isReady:()=>state.ready };
  }

  return { makeSource, lib, _tileX:tileX, _tileY:tileY };
})();
