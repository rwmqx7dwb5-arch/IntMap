/* ============================================================================
 *  IntMap · WHICH SEGMENTS ARE THE SAME RIVER — window.IntMapRiverCourse  (#R217)
 * ----------------------------------------------------------------------------
 *  「河川名ラベルクリック時に、クリック地点によっては全区間がハイライトされない問題を解決して。」
 *
 *  #R210 made a river label light up its river. It did that by taking ONE name off the clicked
 *  feature —
 *
 *      const n = p.name || p['name:en'] || p.name_en;   …and then requiring n === want
 *
 *  — and that is the whole defect. A river is not one string:
 *
 *   1. IT IS RENAMED AT EVERY BORDER. The Danube's ways carry `name=Donau` in Austria, `name=Duna`
 *      in Hungary, `name=Dunav` in Serbia, `name=Dunărea` in Romania. Every one of them also carries
 *      `name:en=Danube`, so they ARE linked in the data — just never through the single field the
 *      comparison looked at. Click in Vienna and Hungary stays dark; click in Budapest and Austria
 *      does. That is exactly 「クリック地点によっては」.
 *   2. THE FALLBACK CHAIN ITSELF IS ASYMMETRIC, even for a river named the same all the way down.
 *      A segment tagged only `name:en` yields "Danube" from the chain while its neighbour tagged
 *      `name` yields "Donau" — so which segments match depends on which one you happened to hit.
 *
 *  So the unit of comparison here is a SET OF NAMES, never a name. Two segments are the same river
 *  when any of their name fields agree, and the sets are then merged so the agreement is transitive:
 *  {Donau, Danube} meets {Duna, Danube} through Danube, and {Duna} joins through Duna even though it
 *  never carried an English name at all.
 *
 *  ⚠ TRANSITIVITY IS BOUNDED, AND THAT IS DELIBERATE. Chaining through shared names is what crosses
 *  a border; unbounded, it is also what would eventually walk from a common creek name onto another
 *  one. The closure runs over the candidates the caller already limited (the loaded tiles) and stops
 *  after PASSES rounds or when nothing new joins, whichever is first.
 *
 *  ⚠ AND ONLY WATERWAYS THE LABEL LAYER ITSELF DRAWS ARE CANDIDATES (`class` river/canal — the same
 *  filter as `ofm-river` in js/place-labels.js). Before this round a ditch or a drain sharing a name
 *  with the river was highlighted as part of it, because nothing filtered on class at all.
 *
 *  ══ THE SECOND HALF: THE RIVER DOES NOT END AT THE EDGE OF THE SCREEN ═══════════════════════════
 *  The tiles can only answer for what is loaded, so a tile-only highlight stops at the viewport —
 *  which is the other half of 「全区間」. `course()` asks OpenStreetMap for the river's REAL course by
 *  name, the same two sources and the same order Atlas has used for river highlights since #R65:
 *  Nominatim's own waterway geometry first (one GET, the whole named river), then Overpass named
 *  ways inside a generous box around the click. Both are already declared in the privacy notice and
 *  the source list for this exact purpose.
 *
 *  ⚠ IT IS AN EXTENSION, NEVER A REPLACEMENT. The tile highlight is drawn first and stays drawn; if
 *  the network says nothing, the user keeps precisely what #R210 gave them. A resolver that could
 *  leave the map blank while it waited would be a worse feature than the one it replaced.
 *
 *  ⚠ AND A NAME IS NOT A RIVER UNTIL IT PASSES THE POINT THAT WAS CLICKED. Nominatim will happily
 *  return a different "Main" on the other side of the world, so a candidate course is only accepted
 *  when its geometry comes within NEAR_KM of the click.
 *
 *  Everything above `course()` is pure — no DOM, no renderer, no app state — so tests/r217-checks
 *  runs it in Node against real OpenStreetMap tag bags.
 * ==========================================================================*/
window.IntMapRiverCourse=(function(){
  /* Which property keys on a vector-tile / OSM feature are NAMES OF THE THING.
     `name`, every `name:xx` and its OpenMapTiles-flattened `name_xx` form, the international name,
     and declared alternates. ⚠ `old_name` and `loc_name` are NOT here: a historical or colloquial
     form is exactly the kind of string two unrelated waterways can share. */
  const NAME_KEY=/^(?:name|alt_name|official_name)(?:[:_][A-Za-z0-9_-]+)?$|^(?:int_name|name_int)$/;
  /* Tile keys that are name-SHAPED but are not names: OpenMapTiles carries these for label styling. */
  const NAME_SKIP=/^name(?:[:_])(?:rank|count|len)$/;
  const PASSES=4;              /* transitive rounds (see the header) */
  const NEAR_KM=40;            /* a fetched course must pass this close to the click to BE that river */

  function norm(v){
    if(typeof v!=='string') return '';
    let s=v; try{ s=v.normalize('NFC'); }catch(_){ }
    s=s.replace(/\s+/g,' ').trim().toLowerCase();
    /* a bare punctuation / digit run is not a name */
    return /[\p{L}\p{N}]/u.test(s)?s:'';
  }
  /* Every distinct, normalised name this feature answers to. */
  function nameSet(props){
    const out=new Set(); const p=props||{};
    for(const k in p){
      if(!NAME_KEY.test(k)||NAME_SKIP.test(k)) continue;
      const n=norm(p[k]); if(n) out.add(n);
    }
    return out;
  }
  /* The raw (un-normalised) names, best-first: the local name, then the international ones. Used as
     the query terms for `course()`, where a human-readable string is what the service wants. */
  function nameList(props){
    const p=props||{}, seen=new Set(), out=[];
    const push=(v)=>{ if(typeof v!=='string') return; const n=norm(v); if(!n||seen.has(n)) return; seen.add(n); out.push(v.trim()); };
    push(p.name); push(p['name:en']); push(p.name_en); push(p['name:latin']); push(p.name_int); push(p.int_name);
    for(const k in p){ if(NAME_KEY.test(k)&&!NAME_SKIP.test(k)) push(p[k]); }
    return out;
  }
  /* The classes `ofm-river` draws (js/place-labels.js). A feature with no class at all is kept:
     Natural Earth supplies the low-zoom waterways and does not tag one. */
  const DRAWN=/^(?:river|canal)$/;
  function drawn(props){ const c=props&&props.class; return c==null||c===''||DRAWN.test(String(c)); }

  /* ── THE SELECTION ─────────────────────────────────────────────────────────────────────────────
     `clicked` — the property bag of the feature under the pointer.
     `feats`   — the candidates (whatever the caller could see; for the map that is the loaded tiles).
     Returns the candidates that are the same river, in input order.
     `opts.limit` caps the result the way the caller's frame budget requires. */
  /* `opts.names` — a Set of ALREADY NORMALISED names to start the closure from, instead of (or as
     well as) the clicked feature's own. (#R219) The map's highlight keeps growing as tiles load, and
     each pass has to resume from every name the closure has agreed on so far; handing that set in is
     the same shape `course()` already takes, and it keeps the transitivity #R217 established across a
     pan (a river picked up as «Duna» still matches «Donau» three tiles later). */
  function sameRiver(clicked,feats,opts){
    const o=opts||{}, limit=o.limit>0?o.limit:Infinity;
    const want=nameSet(clicked);
    if(o.names&&o.names.forEach) o.names.forEach(n=>{ const v=norm(n); if(v) want.add(v); });
    const out=[];
    if(!want.size||!feats||!feats.length) return out;
    const props=[], taken=new Uint8Array(feats.length);
    for(let i=0;i<feats.length;i++){ const f=feats[i]; props.push((f&&f.properties)||f||{}); }
    for(let pass=0;pass<PASSES;pass++){
      let grew=false;
      for(let i=0;i<feats.length;i++){
        if(taken[i]) continue;
        const p=props[i];
        if(!drawn(p)) continue;
        const ns=nameSet(p);
        let hit=false;
        for(const n of ns){ if(want.has(n)){ hit=true; break; } }
        if(!hit) continue;
        taken[i]=1; grew=true;
        /* merging its names is what makes the agreement transitive — see the header */
        for(const n of ns) want.add(n);
      }
      if(!grew) break;
    }
    for(let i=0;i<feats.length&&out.length<limit;i++) if(taken[i]) out.push(feats[i]);
    return out;
  }

  /* ── GEOMETRY HELPERS (pure) ───────────────────────────────────────────────────────────────────
     Distance from a point to a lon/lat polyline, in km. A local equirectangular projection is exact
     enough for a "is this the same river" test and costs no dependency. */
  function _segKm(px,py,ax,ay,bx,by,kx){
    const dx=(bx-ax)*kx, dy=by-ay, ex=(px-ax)*kx, ey=py-ay;
    const L=dx*dx+dy*dy; let t=L>0?((ex*dx+ey*dy)/L):0;
    if(t<0)t=0; else if(t>1)t=1;
    const qx=ex-dx*t, qy=ey-dy*t;
    return Math.sqrt(qx*qx+qy*qy)*111.32;
  }
  function nearestKm(geo,lng,lat){
    if(!geo) return Infinity;
    const kx=Math.cos(lat*Math.PI/180);
    const lines=geo.type==='LineString'?[geo.coordinates]
      :geo.type==='MultiLineString'?geo.coordinates
      :geo.type==='GeometryCollection'?(geo.geometries||[]).flatMap(g=>g&&g.type==='LineString'?[g.coordinates]:(g&&g.type==='MultiLineString'?g.coordinates:[]))
      :[];
    let best=Infinity;
    for(const ln of lines){
      if(!ln||ln.length<1) continue;
      if(ln.length===1){ const d=_segKm(lng,lat,+ln[0][0],+ln[0][1],+ln[0][0],+ln[0][1],kx); if(d<best) best=d; continue; }
      for(let i=1;i<ln.length;i++){
        const d=_segKm(lng,lat,+ln[i-1][0],+ln[i-1][1],+ln[i][0],+ln[i][1],kx);
        if(d<best){ best=d; if(best===0) return 0; }
      }
    }
    return best;
  }
  function linesOf(geo){
    if(!geo) return [];
    if(geo.type==='LineString') return [geo.coordinates];
    if(geo.type==='MultiLineString') return geo.coordinates.slice();
    if(geo.type==='GeometryCollection') return (geo.geometries||[]).flatMap(linesOf);
    return [];
  }

  /* ── THE NETWORK HALF ──────────────────────────────────────────────────────────────────────────
     Cached by the clicked feature's own name set, because that is what identifies the river here —
     two clicks on the Danube in two countries produce two different `name` strings and must not be
     two different cache entries. A miss is remembered as null so a river OSM cannot answer for is
     asked about once per session, not once per click. */
  const OP_EPS=['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter','https://overpass.private.coffee/api/interpreter'];
  const NOMINATIM='https://nominatim.openstreetmap.org/search';
  const _cache=Object.create(null);
  function cacheKey(names){ return Array.from(names).sort().join('|'); }

  /* ══ ⚠⚠ (#R218) THE ANCHOR IS THE RIVER THE TILES FOUND, NOT THE PIXEL THAT WAS PRESSED ═══════════
     「河川名ラベルクリック時に、クリック地点によっては全区間がハイライトされない問題を解決して。」
     #R217 fixed the TILE side of this — the transitive name closure — and left two click-dependent
     things in the fetch, which is why the report came back:

       (1) `course()` asked with the CLICKED FEATURE's names only. Press a Hungarian way and the query
           is {Duna}; press an Austrian one and it is {Donau, Danube}. Nominatim answers with a
           different OSM object for each, so the highlight literally depended on which way was under
           the finger — the exact sentence in the report. It now asks with the WHOLE closure's names,
           which is a property of the river and not of the click.
       (2) A candidate had to run within 40 km OF THE CLICK. That is the right guard against a
           same-named river on another continent, and the wrong one for a river 2,850 km long: the
           Nominatim object for the Romanian Dunărea is the correct answer and passes nowhere near a
           click in Vienna. The guard now measures against ANY of the segments the tiles already
           matched, so it still rejects a different river and no longer rejects a distant reach of
           this one.
     ⚠ And every accepted candidate is UNIONED rather than the nearest one winning: a river that is
     renamed at each border is several OSM objects, and taking one of them is taking one country's
     stretch. */
  function _minKmToAny(geo,pts){
    let best=Infinity;
    for(const p of pts){ const d=nearestKm(geo,p[0],p[1]); if(d<best) best=d; if(best<=0) break; }
    return best;
  }
  async function _nominatim(name,anchors){
    try{
      /* (#R489) the app's ONE one-a-second floor — js/nominatim-gate.js. Reached through `window`
         because this file may contain no top-level declarations (tests/r175-checks #4), and it is
         the SAME module instance the ES-module callers import, so the counter really is shared. */
      const _g=window.IntMapNominatimGate; if(_g) await _g.nominatimSlot();
      const r=await fetch(NOMINATIM+'?format=jsonv2&limit=8&polygon_geojson=1&polygon_threshold=0.0008&q='+encodeURIComponent(name),{headers:{Accept:'application/json'}});
      if(!r.ok) return null;
      const j=await r.json(); if(!Array.isArray(j)) return null;
      /* waterway results only, and only the ones that actually run past the river we already have */
      const cands=j.filter(o=>{
        const cls=String(o.class||o.category||'').toLowerCase();
        const typ=String(o.type||'').toLowerCase();
        const gt=(o.geojson&&o.geojson.type)||'';
        return (cls==='waterway'||/^(river|canal|stream)$/.test(typ))&&/LineString/.test(gt);
      });
      const keep=[]; let bestD=Infinity;
      for(const c of cands){ const d=_minKmToAny(c.geojson,anchors);
        if(d<=NEAR_KM){ keep.push(c.geojson); if(d<bestD) bestD=d; } }
      if(keep.length) return {geo:_union(keep),src:'nominatim',km:bestD};
    }catch(_){ }
    return null;
  }
  function _union(geos){
    const coords=[];
    for(const g of geos) for(const ln of linesOf(g)) if(ln&&ln.length>1) coords.push(ln);
    return { type:'MultiLineString', coordinates:coords };
  }
  /* The fallback: every named way of this river inside a box around WHAT IS ALREADY MATCHED. `names`
     is the whole set, so the query spans the border the way the tile matcher does — one alternation,
     one request. ⚠ (#R218) the box comes from the matched river's own extent (grown by a degree and
     floored at the old ±3.2° so a single-segment match still reaches), not from the click: a box drawn
     round a pixel can only ever return the reach beside that pixel. Overpass is bounded either way —
     the box is capped, and the query has its own limit and timeout. */
  async function _overpass(names,lng,lat,bbox){
    const alts=Array.from(new Set(names)).filter(n=>n&&n.length>1).slice(0,12)
      .map(n=>String(n).replace(/[\\"^$.|?*+()[\]{}]/g,'\\$&'));
    if(!alts.length) return null;
    const d=3.2;
    let w=lng-d, s=lat-d, e=lng+d, n=lat+d;
    if(bbox&&bbox.length===4&&isFinite(bbox[0])&&bbox[2]>bbox[0]){
      w=Math.min(w,bbox[0]-1); s=Math.min(s,bbox[1]-1); e=Math.max(e,bbox[2]+1); n=Math.max(n,bbox[3]+1);
    }
    /* a box wider than this is a request for a continent's worth of ways; the service will refuse it
       anyway, and the tiles already carry what is on screen */
    const CAP=24;
    if(e-w>CAP){ const c=(e+w)/2; w=c-CAP/2; e=c+CAP/2; }
    if(n-s>CAP){ const c=(n+s)/2; s=c-CAP/2; n=c+CAP/2; }
    s=Math.max(-85,s); n=Math.min(85,n);
    const bb='('+s.toFixed(2)+','+w.toFixed(2)+','+n.toFixed(2)+','+e.toFixed(2)+')';
    const q='[out:json][timeout:30];way["waterway"~"^(river|canal)$"]["name"~"^('+alts.join('|')+')$",i]'+bb+';out geom 800;';
    for(const ep of OP_EPS){
      try{
        const r=await fetch(ep,{method:'POST',body:'data='+encodeURIComponent(q)});
        if(!r.ok) continue;
        const j=await r.json();
        const els=(j&&j.elements)||[];
        const coords=[];
        for(const el of els){ if(el&&el.geometry&&el.geometry.length>1) coords.push(el.geometry.map(g=>[g.lon,g.lat])); }
        if(coords.length) return {geo:{type:'MultiLineString',coordinates:coords},src:'overpass',km:0};
      }catch(_){ }
    }
    return null;
  }
  /* Resolve the real course of the river the clicked feature belongs to.
     Resolves to `{geo, src}` or null — it never rejects, because the caller already has a picture. */
  async function course(clickedProps,lngLat,opts){
    opts=opts||{};
    /* (#R218) the names of the WHOLE matched river when the caller has them, the clicked feature's
       when it does not — so the question asked of OSM is about the river rather than the pixel. */
    const set=(opts.names&&opts.names.size)?new Set(opts.names):nameSet(clickedProps);
    if(!set.size||!lngLat||!isFinite(lngLat.lng)||!isFinite(lngLat.lat)) return null;
    const key=cacheKey(set);
    if(key in _cache) return _cache[key];
    /* the points a candidate has to run past: the matched segments if there are any, the click if not */
    const anchors=(opts.anchors&&opts.anchors.length)?opts.anchors.slice(0,64):[[lngLat.lng,lngLat.lat]];
    const p=(async()=>{
      const names=(opts.nameList&&opts.nameList.length)?opts.nameList:nameList(clickedProps);
      const found=[]; let km=Infinity;
      for(const n of names.slice(0,4)){
        const hit=await _nominatim(n,anchors);
        if(hit){ found.push(hit.geo); if(hit.km<km) km=hit.km; }
      }
      if(found.length) return { geo:_union(found), src:'nominatim', km:isFinite(km)?km:0 };
      return await _overpass(names,lngLat.lng,lngLat.lat,opts.bbox);
    })().catch(()=>null);
    _cache[key]=p;
    const out=await p;
    _cache[key]=out;          /* keep the value, not the promise, once it has landed */
    return out;
  }

  return { nameSet, nameList, sameRiver, nearestKm, linesOf, course, union:_union,
    _cacheKey:cacheKey, NEAR_KM, PASSES };
})();
