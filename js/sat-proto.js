/* ============================================================================
 *  IntMap · SATELLITE TILE PROTOCOL — the `imapsat://` scheme  (#R158 … #R193, split out #R195)
 * ----------------------------------------------------------------------------
 *  「最大の問題は、中心部がまだ巨大なことです。app-body.js は約5,500行以上」。 This is index.html's ninth
 *  split (#R162–#R169 were the first eight), and it takes the surface #R193's notes named as the next
 *  one to leave: everything the app knows about fetching Esri World_Imagery — the placeholder
 *  detection, the ancestor crop, the imagery-depth memo, the @2x stitch and the hand-off to
 *  src/sat-worker.js — with exactly ONE thing reaching in from outside.
 *
 *  MEASURED SURFACE — the four counts to take before claiming a theme is separable at all:
 *    public names 1 (window.IntMapSatProto) · registrations 1 (the `imapsat` protocol) ·
 *    flags 1 (window.__imSatProto) · free references to the shell 1 (`_hiDPITiles`).
 *
 *  ⚠ THE ONE FREE REFERENCE IS THE WHOLE RISK. `_hiDPITiles` (#R179) is the single owner of "does
 *  this session use double-density tiles", and it is ALSO read by the Carto base-map URLs, so it
 *  stays in the shell and is handed over explicitly. Let it arrive as `undefined` and the @2x path
 *  stops for everybody with no error anywhere — no exception, no `typeof` guard, nothing in the
 *  console. scripts/check-split-scope.mjs is the gate that makes shipping that impossible.
 *
 *  ⚠ ORDER IS LOAD-BEARING: this factory sets `window.__imSatProto`, and the style object a few
 *  hundred lines below its call site reads that flag to choose between `imapsat://` and Esri direct.
 *  It is therefore called from exactly where the code used to sit — not earlier, not later.
 *
 *  The body below is the #R158–#R193 block moved BYTE FOR BYTE (259 lines, proven line by line at
 *  the time of the move), at its original two-space depth so the diff carries no reindentation.
 * ==========================================================================*/
window.IntMapModules=window.IntMapModules||{};
window.IntMapModules.satProto=function(HOST){
  const GE=()=>window.IntMapGeoEngine;   /* (#R178) the renderer, through the contract */
  /* (#R179/#R195) the shell's decision, handed over rather than re-derived — see the ⚠ above */
  const _hiDPITiles=HOST.hiDPITiles;
  /* (#R158) SATELLITE TILE PROTOCOL — "限界までズームしても灰色タイルを出さない／同じズームでも高画質". Esri World_Imagery's
     native max zoom varies by place (z19 city / z18 rural / z17 desert / z16 open sea); past it Esri returns an HTTP-200
     grey "Map data not yet available" tile — a FIXED ~2.5 KB JPEG that MapLibre can't distinguish from real imagery, so it
     rendered grey at the zoom limit. Esri sends `access-control-allow-origin:*`, so we fetch each tile client-side (NO proxy),
     and when a tile is that placeholder we CROP the matching sub-quadrant of the nearest REAL ancestor tile and upscale it
     (high-quality) — the sea/desert/rural view stays genuine imagery while cities keep their crisp native z19. Real tiles
     pass straight through (one fetch, decoded in MapLibre's worker as before), results are cached, and ANY error falls back
     to the raw bytes so the map is never worse than before. Also lets the flight sim drop its blue water-fill (#R158). */
  try{ if(typeof fetch!=='undefined' && typeof createImageBitmap!=='undefined'){
    const _SAT_HOSTS=['https://server.arcgisonline.com','https://services.arcgisonline.com'];
    const _satUrl=(z,y,x)=>_SAT_HOSTS[(x+y)&1]+'/ArcGIS/rest/services/World_Imagery/MapServer/tile/'+z+'/'+y+'/'+x;
    const _SAT_PLACEHOLDER_MAX=3500;   /* grey "no data" tile ≈ 2521 B; real imagery ≥ ~8 KB — a wide, safe gap */
    /* (#R191) 「モバイル版で、衛星画像が圧倒的に重い」 — these two Maps hold JPEG BYTES, and 800 + 1,200
       entries of Esri imagery is 20-60 MB of ArrayBuffers sitting beside MapLibre's own tile cache (whose
       mobile budget #R21 deliberately cut to 640-1,024 tiles for the same reason). They were sized for a
       desktop and never re-read on a phone. Cut to a quarter there — a phone's viewport holds a fraction
       of the tiles a monitor does, so the hit rate barely moves, and the memory does. */
    const _satMob=/Mobi|Android|iPhone|iPad/.test(navigator.userAgent);
    const _satCache=new Map(), _SAT_CACHE_MAX=(_satMob?200:800);
    const _satCacheGet=k=>{ const v=_satCache.get(k); if(v!==undefined){ _satCache.delete(k); _satCache.set(k,v); } return v; };
    const _satCachePut=(k,v)=>{ _satCache.set(k,v); if(_satCache.size>_SAT_CACHE_MAX){ const f=_satCache.keys().next().value; _satCache.delete(f); } };
    /* raw-fetch cache (keyed z/x/y) so the ancestor walk-up reuses the SHARED low-zoom tiles — over open ocean many z18
       children resolve to the same z8 ancestor, which is then fetched once, not per child. */
    const _satRaw=new Map(), _SAT_RAW_MAX=(_satMob?300:1200);
    /* ══ (#R179) HOW DEEP ESRI'S IMAGERY ACTUALLY GOES, LEARNED FROM THE TILES THAT ARRIVE ═══════
       Esri's native maximum zoom varies by place (#R158: z19 city, z18 rural, z17 desert, z16 open
       sea) and past it every tile is the grey placeholder. The @2x stitch below builds a tile from
       the four children one level DOWN, so over ocean and desert it fetches four placeholders,
       discovers they are useless, and throws them away — four wasted requests for every screen tile,
       on exactly the connections that can least afford them.
       Nothing has to guess: the answer arrives with the tiles. This records the deepest zoom real
       imagery has been seen at for each z10 neighbourhood (~40 km, which is far finer than the
       regions Esri's coverage varies over) and the stitch skips itself when the level it needs is
       past that. Deliberately conservative in the direction of QUALITY: only a REAL tile teaches
       anything, the value only ever grows, and an unknown neighbourhood is attempted. A coastal z10
       cell that holds both a city and open water keeps the city's depth and so keeps trying over the
       water — wasteful in that one cell, and never a lost pixel anywhere. */
    const _satDepth=new Map(), _SAT_DEPTH_MAX=4000;
    const _satCell=(z,x,y)=>{ const d=z-10; return d>=0?((x>>d)+'/'+(y>>d)):(z+':'+x+'/'+y); };
    /* Recorded against the tile that was ASKED FOR, with the depth that was DISCOVERED for it —
       never against the ancestor the walk-up happened to land on. That distinction is the whole
       correctness of this memo and the first version got it wrong: a z12 ocean tile resolves from a
       real z8 ancestor, and z8 is four levels above the z10 cell grid, so `_satCell(8,…)` produced a
       different key entirely and the z12 neighbourhood learned nothing. (A z8 tile also spans
       sixteen z10 cells, so there is no single cell it could honestly be filed under.) */
    /* TWO DIFFERENT FACTS, and conflating them silently switched @2x off everywhere.
       A real tile at zoom z proves imagery EXISTS at z. It says nothing whatsoever about z+1 — which
       is the level the stitch needs. Recording one number and treating it as a ceiling meant every
       tile the resolve path touched first (i.e. every city, since real tiles return immediately)
       came back "already as deep as it goes" and skipped its own double-density pass: a quality
       regression wearing a bandwidth saving's clothes, caught by the city half of the test.
         have — deepest level real imagery has been SEEN at. Encouraging, never limiting.
         stop — deepest real level where the NEXT one was observed to be the grey placeholder. Only
                the ancestor walk establishes this, and only this may block the stitch. */
    function _satHold(z,x,y){ const k=_satCell(z,x,y); let v=_satDepth.get(k);
      if(!v){ v={have:null,stop:null}; _satDepth.set(k,v);
        if(_satDepth.size>_SAT_DEPTH_MAX){ const f=_satDepth.keys().next().value; _satDepth.delete(f); } }
      return v; }
    function _satNoteHave(z,x,y,d){ if(!isFinite(d)) return; const v=_satHold(z,x,y);
      if(v.have==null||d>v.have) v.have=d;
      /* real imagery deeper than a recorded stop means that stop was wrong or has been re-flown */
      if(v.stop!=null&&v.stop<d) v.stop=null; }
    function _satNoteStop(z,x,y,d){ if(!isFinite(d)) return; const v=_satHold(z,x,y);
      if(v.have==null||d>v.have) v.have=d;
      if(v.stop==null||d>v.stop) v.stop=d; }
    /* null = no positive evidence that imagery stops before the level asked for, so try. */
    function _satKnownStop(z,x,y){ const v=_satDepth.get(_satCell(z,x,y)); return v?v.stop:null; }
    /* ══ (#R196) A TILE IS FETCHED ONCE — see the long note in src/sat-worker.js ═══════════════════
       Measured on an emulated iPhone: 891 satellite requests for 137 distinct tiles in a six-second
       pan, the worst tile fetched 24 times — once per pan step — because MapLibre's abort reached
       `fetch` and the response was thrown away mid-flight. The bytes are already on the wire; the
       fetch completes and is cached, so the re-request is instant. The abort still stops the
       ancestor WALK, where the saving is a request not yet made. This is the fallback path; the
       worker above is what normally runs, and the two are kept byte-for-byte in step. */
    const _satFly=new Map();
    function _satFetch(z,y,x){ const rk=z+'/'+x+'/'+y; const c=_satRaw.get(rk); if(c){ _satRaw.delete(rk); _satRaw.set(rk,c); return Promise.resolve(c); }
      const live=_satFly.get(rk); if(live) return live;
      const p=(async()=>{
        const r=await fetch(_satUrl(z,y,x),{mode:'cors',credentials:'omit'}); if(!r.ok) throw new Error('sat http '+r.status); const buf=await r.arrayBuffer();
        const out={buf, placeholder: buf.byteLength<=_SAT_PLACEHOLDER_MAX}; _satRaw.set(rk,out); if(_satRaw.size>_SAT_RAW_MAX){ const f=_satRaw.keys().next().value; _satRaw.delete(f); }
        return out; })().finally(()=>{ _satFly.delete(rk); });
      _satFly.set(rk,p); return p; }
    /* ══ (#R191) THE CROPPED TILE WAS TRANSCODED TWICE, ON THE MAIN THREAD ═══════════════════════════
       「衛星画像の読み込み時の動作を、極限までシームレスにして。」「モバイル版で、衛星画像が圧倒的に重い。」
       #R178's note says this path "returns a bitmap now too, which drops a full JPEG encode per tile
       over ocean and desert" — but it never did: it decoded the ancestor, drew the sub-quadrant, then
       RE-ENCODED the result to JPEG at quality 0.92, handed those bytes to MapLibre, and MapLibre
       decoded them a second time. Two extra image codecs per tile, both on the main thread, on exactly
       the views (open water, desert, anywhere Esri stops early) where nearly every tile takes this
       path — and phones are where the main thread is scarcest.
       MapLibre's protocol contract accepts an ImageBitmap directly ("User using addProtocol can
       directly return HTMLImageElement/ImageBitmap", image_request.ts) and the @2x stitch above has
       been doing exactly that since #R178. So this returns the bitmap it already has.
       It also stops holding the cropped BYTES: they were the largest thing in the cache and they were
       never the cheap thing to keep. What is worth keeping is the ANCESTOR, which `_satRaw` already
       holds — a repeat is then a decode-and-draw with no network and no encode, and one z8 ocean tile
       serves hundreds of its descendants. */
    async function _satCrop(buf, dz, subX, subY){ const bmp=await createImageBitmap(new Blob([buf])); const n=1<<dz, cell=bmp.width/n;
      let c; if(typeof OffscreenCanvas!=='undefined'){ c=new OffscreenCanvas(256,256); } else { c=document.createElement('canvas'); c.width=256; c.height=256; }
      const ctx=c.getContext('2d'); ctx.imageSmoothingEnabled=true; ctx.imageSmoothingQuality='high';
      ctx.drawImage(bmp, subX*cell, subY*cell, cell, cell, 0,0,256,256); try{ bmp.close&&bmp.close(); }catch(_){}
      return c.transferToImageBitmap?c.transferToImageBitmap():await createImageBitmap(c); }
    /* resolve one tile to REAL imagery. mode: 'native' (Esri had it) | 'cropped' (upscaled from the
       nearest real ancestor) | 'raw' (placeholder kept — no real ancestor found). `data` is an
       ArrayBuffer for the byte paths and an ImageBitmap for the cropped one; both are things MapLibre's
       protocol contract accepts. Shared by the protocol + a debug hook so it is E2E-testable. */
    async function _satResolve(z,y,x,signal){ const key=z+'/'+x+'/'+y; const hit=_satCacheGet(key); if(hit) return {data:hit, buf:hit, mode:hit.__mode||'cache'};
      const first=await _satFetch(z,y,x);
      /* (#R179) THIS is where the depth is learned, because this is where it is discovered — see
         _satNote. A native tile proves imagery reaches z; the ancestor walk below measures exactly
         how far short of z it stops. */
      if(!first.placeholder){ _satNoteHave(z,x,y,z); first.buf.__mode='native'; _satCachePut(key, first.buf); return {data:first.buf, buf:first.buf, mode:'native'}; }
      /* placeholder → walk up to the nearest REAL ancestor, crop its sub-quadrant, upscale */
      let az=z, ax=x, ay=y, dz=0, real=null;
      /* (#R193) …STARTING WHERE THE MEMO ALREADY SAYS THE IMAGERY IS. #R179's depth memo knew that
         over open ocean Esri stops around z8, and the stitch consulted it, but this walk did not: it
         climbed one level at a time, and each level is a SEQUENTIAL round trip. Nine of them per tile,
         for every tile on screen, after the first tile had already established the answer. The jump is
         VERIFIED — a stale hint falls back to the ordinary walk from that level and corrects the memo
         — so the answer is identical and only the number of round trips changes. Kept byte-for-byte in
         step with src/sat-worker.js, which is the path that normally runs; this one is the fallback
         and the one the E2E hooks call. */
      const _hint=_satKnownStop(z,x,y);
      if(_hint!=null&&_hint<z&&_hint>=1){ const d=z-_hint;
        if(d>1&&d<=13){ let got=null;
          try{ got=await _satFetch(_hint,y>>d,x>>d); }catch(_){ got=null; }
          if(got&&!got.placeholder){ real=got; az=_hint; dz=d; }
          else if(got){ az=_hint; ax=x>>d; ay=y>>d; dz=d; } } }
      if(!real) for(let up=0; up<13 && az>1; up++){ if(signal&&signal.aborted) break;   /* (#R196) the walk is where an abort still saves a request */
        az--; ax=ax>>1; ay=ay>>1; dz++;   /* up to 13 levels so open ocean (Esri imagery ends ~z8) still finds a real ancestor from z19 */
        let got=null; try{ got=await _satFetch(az,ay,ax); }catch(_){ break; }
        if(!got.placeholder){ real=got; break; } }
      if(real){ _satNoteStop(z,x,y,az);   /* az is real and az+1 was the placeholder — a STOP */
        try{ const bmp=await _satCrop(real.buf, dz, x-((x>>dz)<<dz), y-((y>>dz)<<dz)); return {data:bmp, mode:'cropped'}; }catch(_){} }
      return {data:first.buf, buf:first.buf, mode:'raw'};   /* no real ancestor / crop failed → original bytes (never break) */
    }
    /* ══ (#R178) THE IMAGERY IS HALF-RESOLUTION ON EVERY HIDPI SCREEN ═══════════════════════════
       MapLibre picks the tile zoom from `coveringZoomLevel(zoom + log2(512/tileSize))` — read it in
       src/geo/projection/covering_tiles.ts — and `pixelRatio` is not in that expression. The canvas
       IS rendered at devicePixelRatio (see the Map options above), so on a 2× display one 256-pixel
       Esri tile is stretched across 512 device pixels: the satellite view has been running at half
       the resolution the screen can show, at every zoom, since the layer existed. Zooming in one
       level is the only way a user could get that detail back, and that changes the framing.

       The standard remedy is a "@2x" tile, and Esri has no @2x endpoint — but it does have the next
       zoom level, and four of those children ARE the @2x tile. So stitch them: one 512×512 image for
       the same geographic extent, which is exactly the pixel density the display asks for.

       It costs 4× the tile bytes for a given view — and that is not waste, it is the same amount of
       data the display would need at any honest resolution (zooming in one level costs the same 4×).
       Kept off where that trade would be wrong: phones (RAM and radio), 1× screens (nothing to gain),
       Data Saver, and 2G. Any child that is missing or is Esri's grey placeholder abandons the whole
       attempt and the original single-tile path answers, so this can only ever add detail.

       No re-encode: MapLibre's image request accepts an ImageBitmap straight from a protocol handler
       ("User using addProtocol can directly return HTMLImageElement/ImageBitmap", image_request.ts),
       so the stitched tile never becomes JPEG bytes again. The ancestor-crop path below returns a
       bitmap now too, which drops a full JPEG encode per tile over ocean and desert. */
    /* (#R179) …and that decision is now _hiDPITiles, hoisted above the base-map URLs because the base
       map had the same defect and needs the same answer. Only the one extra condition that is
       specific to STITCHING stays here: Esri has no @2x endpoint, so this path builds the tile from
       four children and cannot run at all without createImageBitmap. Carto's @2x needs nothing. */
    const _satHiDPI=_hiDPITiles&&(typeof createImageBitmap==='function');
    function _canvas2d(w,h){
      if(typeof OffscreenCanvas!=='undefined') return new OffscreenCanvas(w,h);
      const c=document.createElement('canvas'); c.width=w; c.height=h; return c;
    }
    async function _toBitmap(c){ return c.transferToImageBitmap?c.transferToImageBitmap():await createImageBitmap(c); }
    /* the four z+1 children as ONE 512×512 tile, or null when they are not all real imagery */
    async function _sat2x(z,y,x,signal){
      /* (#R189) was `z>=19`: the stitch stopped one level short of the map's own maximum zoom, so
         the deepest view — the one where the user is squinting at detail — was the one view left at
         half resolution on HiDPI. Esri serves real z20 imagery over major cities; where it does not,
         the four children are placeholders, the attempt abandons itself, and the _satDepth memo
         (#R179) makes sure that lesson is only ever paid for once per neighbourhood. */
      if(!_satHiDPI||z>=20) return null;
      if(signal&&signal.aborted) return null;   /* (#R196) */
      /* (#R179) …and not where the imagery is already known to stop shallower than the level this
         needs. See _satDepth: four placeholder fetches per tile is the cost of asking anyway. */
      const stop=_satKnownStop(z,x,y);
      if(stop!=null&&z+1>stop) return null;
      const q=[[0,0],[1,0],[0,1],[1,1]];
      let kids;
      try{ kids=await Promise.all(q.map(([dx,dy])=>_satFetch(z+1,2*y+dy,2*x+dx))); }catch(_){ return null; }
      if(!kids.every(k=>k&&!k.placeholder)) return null;
      /* (#R179) all four are real, so imagery reaches at least one level past this tile */
      _satNoteHave(z,x,y,z+1);
      let bmps=null;
      try{
        bmps=await Promise.all(kids.map(k=>createImageBitmap(new Blob([k.buf]))));
        const c=_canvas2d(512,512), ctx=c.getContext('2d');
        ctx.imageSmoothingEnabled=true; ctx.imageSmoothingQuality='high';
        q.forEach(([dx,dy],i)=>ctx.drawImage(bmps[i],dx*256,dy*256,256,256));
        return await _toBitmap(c);
      }catch(_){ return null; }
      finally{ if(bmps) bmps.forEach(b=>{ try{ b&&b.close&&b.close(); }catch(_){} }); }
    }
    /* ══ (#R192) …AND ALL OF IT RUNS IN A WORKER ═══════════════════════════════════════════════════
       Measured panning Tokyo at z12: the desktop @2x path spent 8.9 s in long tasks inside a 6 s pan
       (75 of them, worst 275 ms) at 4.8 fps, against a phone's 0.40 s and 22.6 fps — four decodes,
       four draws and a canvas transfer per tile, on the thread that has to paint the map. Same work,
       wrong thread. src/sat-worker-client.js drives src/sat-worker.js, which posts back a
       TRANSFERABLE ImageBitmap; the depth memo is MIRRORED back here so `depth()`/`wouldStitch()`
       still answer synchronously, and the main-thread path above stays as the fallback. See
       DEV-NOTES #R192 §5. */
    let _satWReady=false;
    function _satWorker(){
      const W=window.IntMapSatWorker;
      if(!W||!W.available()) return false;
      if(!_satWReady){ _satWReady=true;
        W.configure({ rawMax:_SAT_RAW_MAX, depthMax:_SAT_DEPTH_MAX,
          /* the worker learned how deep the imagery goes — keep the MIRROR current, because
             `depth()` and `wouldStitch()` below answer synchronously and the tests ask them that way */
          depth:(rows)=>{ for(const [k,have,stop] of rows){
            let v=_satDepth.get(k); if(!v){ v={have:null,stop:null}; _satDepth.set(k,v);
              if(_satDepth.size>_SAT_DEPTH_MAX){ const f=_satDepth.keys().next().value; _satDepth.delete(f); } }
            v.have=have; v.stop=stop; } } }); }
      return true;
    }
    function _satViaWorker(z,y,x,hi,signal){
      if(!_satWorker()) return null;
      return window.IntMapSatWorker.tile(z,y,x,hi,signal);
    }
    GE().scene.addProtocol('imapsat', async (params, abortController)=>{
      const mm=/imapsat:\/\/(\d+)\/(\d+)\/(\d+)/.exec(params&&params.url||''); if(!mm) throw new Error('bad imapsat url');
      const z=+mm[1], y=+mm[2], x=+mm[3], signal=abortController&&abortController.signal;
      const via=_satViaWorker(z,y,x,_satHiDPI,signal);
      if(via){ try{ const r=await via; if(r&&r.data) return {data:r.data}; }catch(_){ /* fall through to the thread */ } }
      try{ const hi=await _sat2x(z,y,x,signal); if(hi) return {data:hi}; }catch(_){}
      /* (#R191) an ImageBitmap goes straight through; a cached ArrayBuffer is copied, because MapLibre
         transfers the buffer it is handed and a transferred buffer would empty the cache entry. */
      const res=await _satResolve(z,y,x,signal);
      return {data:(res.data&&res.data.byteLength!==undefined)?res.data.slice(0):res.data};
    });
    window.__imSatProto=true;
    /* debug/test hook — resolve a tile and report byte length + mode (native/cropped/raw). Lets an E2E test assert that a
       known placeholder area (open ocean, rural) comes back as real cropped imagery, and a city as native, against LIVE Esri. */
    window.IntMapSatProto={ resolve:async(z,y,x)=>{ try{ const r=await _satResolve(z|0,y|0,x|0,null);
        /* (#R191) …and `bytes` is only meaningful for the byte paths now; the cropped one answers with
           the bitmap's own size, which is what a test asking "is this real imagery" should look at. */
        return {mode:r.mode, bytes:(r.buf?r.buf.byteLength:null), w:(r.data&&r.data.width)||null, h:(r.data&&r.data.height)||null}; }
      catch(e){ return {mode:'error', err:String(e&&e.message||e)}; } }, placeholderMax:_SAT_PLACEHOLDER_MAX,
      /* (#R178) the HiDPI decision and the stitched tile, so an E2E test can prove against LIVE Esri
         that a 2× screen really gets 512 px of imagery per 256-unit tile — and that a 1× screen is
         left exactly as it was. Reporting the decision separately matters: "no @2x tile" is the right
         answer on a 1× display and a bug on a 2× one, and only the flag tells them apart. */
      hiDPI:()=>_satHiDPI, dpr:()=>(window.devicePixelRatio||1),
      /* (#R179) what the imagery-depth memo has learned, and what it would decide — so a test can
         prove that a second look-up over open ocean costs NO requests, without inferring it from
         network traffic (#R178's lesson: after the stitch starts, the render path's own child
         fetches outnumber the ring's, so a request count reads the wrong number). */
      depth:(z,x,y)=>{ const v=_satDepth.get(_satCell(z|0,x|0,y|0)); return v?{have:v.have,stop:v.stop}:null; },
      wouldStitch:(z,x,y)=>{ if(!_satHiDPI||(z|0)>=19) return false;
        const st=_satKnownStop(z|0,x|0,y|0); return !(st!=null&&(z|0)+1>st); },
      depthEntries:()=>_satDepth.size,
      /* (#R192) whether the pipeline is running off the main thread, and the same 2× tile asked for
         through whichever path is live — a test that wants the stitched pixels should not have to
         know which thread produced them. */
      worker:()=>!!_satWorker(),
      tile2x:async(z,y,x)=>{
        /* ⚠ (#R192) GATED ON _satHiDPI, exactly as _sat2x is. This hook means "what the @2x path
           would produce", and on a 1× display that path does not run — routing it to the worker
           unconditionally made a 1× screen build the stitch after all (caught by tests/r178 ①). */
        try{ const via=_satHiDPI?_satViaWorker(z|0,y|0,x|0,true,null):null;
          if(via){ const r=await via;
            const b=r&&r.data;
            if(b&&b.width===512) return {ok:true, w:b.width, h:b.height, bitmap:true, via:'worker'};
          } }catch(_){}
        try{ const b=await _sat2x(z|0,y|0,x|0,null);
        return b?{ok:true, w:b.width, h:b.height, bitmap:(typeof ImageBitmap!=='undefined'&&b instanceof ImageBitmap), via:'main'}:{ok:false}; }
        catch(e){ return {ok:false, err:String(e&&e.message||e)}; } } };
  } }catch(_){}
};
