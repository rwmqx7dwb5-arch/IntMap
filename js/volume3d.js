/* ============================================================================
 *  IntMap · Measure ▸ 3-D VOLUME — a real-scale box standing in the air  (#R170)
 * ----------------------------------------------------------------------------
 *  「Measureに、3Dの立体を地図上に描画できる機能を作って。高度〇mから〇mで範囲を選択すると、
 *    その範囲が実際の縮尺で空中に描画される。」
 *
 *  The user traces a footprint on the map and gives a BASE and a TOP altitude in metres; the
 *  footprint is then extruded between those two altitudes at TRUE SCALE — a 2 km-thick slab really
 *  is 2 km thick against the terrain next to it, at any zoom, in globe or flat projection.
 *
 *  ── Altitude reference (the one thing that is easy to get silently wrong) ────────────────────
 *  MapLibre's `fill-extrusion-base` / `-height` are metres, but metres FROM WHAT depends on the
 *  map's state, and 5.24 has no `fill-extrusion-*-alignment` to pin it down (verified: setting
 *  that property throws). Measured on this app with an identical camera over Mt Fuji, one box at
 *  base 5000 / height 5300:
 *      3-D terrain OFF → the box renders at 5 000 m above SEA LEVEL;
 *      3-D terrain ON  → the same box jumps up by the DEM height (~3 698 m at the summit),
 *                        i.e. the numbers become metres ABOVE THE GROUND SURFACE.
 *  A tool whose numbers mean different things depending on an unrelated toggle is not a
 *  measurement tool, so this module fixes the semantics: the user's numbers are ALWAYS altitude
 *  above sea level, and when terrain is on we subtract the ground elevation under the footprint
 *  before handing the values to the renderer. The panel shows the ground elevation it used.
 *
 *  ── Shapes (#R171) ──────────────────────────────────────────────────────────────────────────
 *  「直線の描画しかできないのはよくない。」 The footprint used to be nothing but the measure tool's
 *  clicked vertices, so every edge was a straight line and a round or organic area was impossible.
 *  Four shapes now feed the same extrusion: POLYGON (click vertices, as before), FREEHAND (press and
 *  drag to trace a curve), CIRCLE (drag out a radius) and RECTANGLE (drag a corner). The last three
 *  own the drag while they are armed, which they take through the engine's input contract rather than
 *  by reaching for the renderer's pan handler.
 *
 *  ── What #R174 changed ─────────────────────────────────────────────────────────────────────
 *  「3-D VolumeはPolygonで描画時、描画完了ボタンを置くように。また、下の面は色がついていない。わざわざ
 *    Solidを選択制なんてするなボケ。しかもズームしたら立体が消える！」 Three of those are one bug and one
 *  is a missing control:
 *    · the body vanished from z12 up — and with it the bottom face — because the elevation argument of
 *      MapLibre's `projectTileFor3D` is METRES on the globe but MERCATOR UNITS on the flat map, and
 *      js/solid3d.js passed metres either way (measured, see the note in that file). Fixed there.
 *    · "Solid" is no longer a checkbox. A volume is a closed body; the open shell is only what a
 *      renderer without solids falls back to.
 *    · the clicked polygon now has a "drawing complete" button — see `sealed`.
 *
 *  ── Renderer independence ───────────────────────────────────────────────────────────────────
 *  Written entirely against window.IntMapGeoEngine (#R152/#R160/#R161/#R170/#R171) — it never touches
 *  the MapLibre map. That makes it the first feature built end-to-end on the engine facade, and
 *  the reason `extrusion3d`, `addExtrusion`, `setExtrusionRange`, `canDraw` and (this round) the
 *  `input.setDragPan` gesture hand-over were added to the contract.
 *  A future Earth/Cesium adapter inherits the whole tool by implementing them.
 *
 *  The CSS stays in css/intmap.css; this file adds no <style>.
 * ==========================================================================*/
window.IntMapModules=window.IntMapModules||{};
window.IntMapModules.volume3d=function(map,HOST){
  return (function(){
    const SRC='imv3d-src', LYR='imv3d-vol', EDGE='imv3d-edge', BODY='imv3d-body';
    const GE=()=>window.IntMapGeoEngine;

    /* the live volume: a closed ring (lng/lat, no repeated last point) + two ALTITUDES in metres AMSL */
    let ring=[], baseM=1000, topM=3000, color='#0a84ff', opacity=0.45;
    let groundM=null;        /* DEM elevation under the footprint centroid (null = unknown / terrain off) */
    let lastRenderErr=null;
    let shape='polygon';     /* polygon | freehand | circle | rect (#R171) */
    let onShapeDone=null;    /* the panel's redraw hook — a drag ends without any click the panel would see */
    /* (#R174) 「わざわざSolidを選択制なんてするな」 — the closed body is not an option any more, it is what a
       3-D volume IS. The open shell survives only as the fallback for a renderer that cannot draw a solid
       (canSolid() below); nothing in the UI, in Atlas or in the SYS catalog offers the choice. */
    /* (#R174) 「3-D VolumeはPolygonで描画時、描画完了ボタンを置くように。」 A traced stroke ends when the
       finger lifts, but a clicked polygon has no natural end — every later click on the map kept adding a
       vertex, so there was no way to say "that is the shape". `sealed` is that full stop: the footprint
       stops taking clicks, and the same button re-opens it. Purely about INPUT — the ring, the volume and
       everything derived from it are untouched. */
    let sealed=false;
    /* (#R172) who owns the current footprint. The panel re-pushes the measure tool's clicked vertices on every
       re-render, which used to wipe a ring that came from anywhere else — an Atlas-drawn volume lost its
       footprint (and the panel then read "Points 0" under a box that was still on screen) the next time
       anything refreshed the panel. Clicked rings are marked, and only those are re-pushed. */
    let ringFromClicks=false;

    const has3DTerrain=()=>{ try{ return !!HOST.terrain3D; }catch(_){ return false; } };
    const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));

    /* ---- geometry -------------------------------------------------------------------------- */
    function closedRing(){ if(ring.length<3) return null;
      const r=ring.map(p=>[+p[0],+p[1]]); const a=r[0], z=r[r.length-1];
      if(a[0]!==z[0]||a[1]!==z[1]) r.push([a[0],a[1]]);
      return r; }
    function centroid(){ if(!ring.length) return null;
      let x=0,y=0; ring.forEach(p=>{ x+=p[0]; y+=p[1]; }); return [x/ring.length, y/ring.length]; }
    /* footprint area in m² — the same turf ring area the Area tool reports, so the two agree */
    function areaM2(){ try{ return (HOST.hasTurf()&&ring.length>=3)?(HOST.ringArea(ring)*1e6):0; }catch(_){ return 0; } }
    function thicknessM(){ return Math.abs(topM-baseM); }
    function volumeM3(){ return areaM2()*thicknessM(); }

    /* ---- ground elevation under the footprint ----------------------------------------------- */
    /* Only the DEM knows this, and the DEM is only loaded while 3-D terrain is on — which is exactly
       when we need it. Returns null when it can't be read (tiles still streaming / terrain off), and
       the caller then renders the raw altitudes, which is correct for the terrain-off case. */
    function readGround(){ const c=centroid(); if(!c) return null;
      try{ const g=GE().coords.terrainElevation({lng:c[0],lat:c[1]}); return (g==null||!isFinite(g))?null:+g; }catch(_){ return null; } }
    /* MEASURED (see the probe in the R170 notes): after 3-D terrain is switched on, MapLibre fires its
       `terrain` event immediately but queryTerrainElevation answers **0** for the first ~2 s and only then
       the real height (0 → 3662 m over Mt Fuji at t≈3 s). So "did the DEM answer?" cannot be decided from
       the value — 0 is both "still loading" and "sea level" — and a single read taken on the terrain event
       would have silently compensated by 0 m, i.e. left the box 2 000 m above the MOUNTAIN instead of above
       the SEA. That is exactly the failure this module exists to prevent.
       Instead: poll for a few seconds and repaint whenever the reading MOVES, stopping once two consecutive
       reads agree (settled) or the budget runs out. paint(true) suppresses re-arming so this cannot recurse. */
    let _gndTimer=null;
    function chaseGround(){ if(_gndTimer) return; let n=0, prev=groundM;
      _gndTimer=setInterval(()=>{ n++;
        if(!has3DTerrain()||ring.length<3||n>16){ clearInterval(_gndTimer); _gndTimer=null; return; }
        const g=readGround();
        if(g==null) return;
        if(groundM==null||Math.abs(g-groundM)>1){ paint(true); }        /* moved → re-extrude at the new offset */
        else if(prev!=null&&Math.abs(g-prev)<=1&&n>=2){ clearInterval(_gndTimer); _gndTimer=null; }   /* settled */
        prev=g;
      },400); }

    /* ---- rendering ------------------------------------------------------------------------- */
    /* (#R173) ONE CLOSED BODY, not a stack of layers.
       「下の面は色がついていない。多面体内部の空間も無色になっている。内部にシートなんていうあほなことを
       するな。」 — and the sheets #R172 put inside were worse than useless: `fill-extrusion` WRITES DEPTH,
       so a floor slab and eight horizontal sheets drawn inside the body all sat behind its near wall and
       were discarded by the depth test before they ever reached the screen. The body was still a lid and
       four walls with nothing in it, which is all a fill-extrusion can ever be.
       The engine now has a contract for the thing itself — `layers.addSolid` / `setSolid` — and the
       MapLibre adapter answers it with a real closed prism: a triangulated TOP cap, a triangulated BOTTOM
       cap and the walls between them, drawn far-side-then-near-side with each fragment's opacity taken
       from the path length through the face (1/|n·v|). So it has a floor, it is filled, and it still
       measures exactly the same: this is how the volume is DRAWN, never what it IS.
       `solid` false keeps the old open shell (the extrusion), for anyone who wants to see through it. */
    function ensure(){ const E=GE(); if(!E||!E.canDraw()) return false;
      try{
        if(!E.layers.hasSource(SRC)) E.layers.addSource(SRC,{type:'geojson',data:{type:'FeatureCollection',features:[]}});
        if(canSolid()&&!E.layers.has(BODY)) E.layers.addSolid(BODY);
        if(!E.layers.has(LYR)){
          /* (#R171) a PLAIN colour, not ['coalesce',['get','color'],…]. There is only ever one box, and the
             expression form left the layer's own paint property frozen at the colour it was created with —
             so anything reading the renderer back (a test, a future adapter) was told the wrong colour even
             though the feature property made it render right. One value, one source of truth. */
          const ok=E.layers.addExtrusion({ id:LYR, source:SRC, paint:{
            'fill-extrusion-color':color,
            'fill-extrusion-opacity':opacity,
            'fill-extrusion-base':0, 'fill-extrusion-height':0 } });
          if(!ok) return false;
        }
        /* a thin outline on the footprint so the box is locatable on the ground even edge-on */
        if(!E.layers.has(EDGE)) E.layers.add({ id:EDGE, type:'line', source:SRC,
          paint:{ 'line-color':color, 'line-width':1.6, 'line-opacity':0.9 } });
        return true;
      }catch(e){ lastRenderErr=String(e&&e.message||e); return false; }
    }
    /* Does this renderer have closed bodies at all? An engine without them still gets the open shell,
       which is what every version before #R173 drew. */
    function canSolid(){ try{ const E=GE(); return !!(E&&E.can('solid3d')&&E.layers.addSolid); }catch(_){ return false; } }

    /* Push the current ring + altitudes to the renderer. See the altitude-reference note at the top:
       with terrain on we hand over HEIGHT-ABOVE-GROUND, so the box lands at the requested ALTITUDE. */
    function paint(noChase){ const E=GE(); if(!E) return false;
      const r=closedRing();
      if(!r){ hide(); return false; }
      if(!ensure()) return false;
      groundM=has3DTerrain()?readGround():null;
      const off=(has3DTerrain()&&groundM!=null)?groundM:0;
      const rb=Math.max(0, loM()-off), rh=Math.max(rb+0.5, hiM()-off);   /* never a zero/inverted box */
      /* asked of the LAYER, not just of the capability: if the renderer declined to create the solid for
         any reason (an old context, a style reload mid-flight) the open shell must draw rather than nothing. */
      const asSolid=canSolid()&&E.layers.has(BODY);
      try{
        E.layers.setSourceData(SRC,{type:'FeatureCollection',features:[
          {type:'Feature',geometry:{type:'Polygon',coordinates:[r]},properties:{color}} ]});
        E.layers.setExtrusionRange(LYR, rb, rh);
        E.layers.setPaint(LYR,'fill-extrusion-opacity',opacity);
        E.layers.setVisible(LYR,!asSolid);           /* one representation at a time — the same body */
        E.layers.setVisible(EDGE,true);
        if(canSolid()){
          E.layers.setSolid(BODY,{ ring:r, base:rb, top:rh, color, opacity });
          E.layers.setVisible(BODY,asSolid);
        }
        if(has3DTerrain()&&!noChase) chaseGround();   /* the DEM may still be streaming — see chaseGround */
        lastRenderErr=null; return true;
      }catch(e){ lastRenderErr=String(e&&e.message||e); return false; }
    }
    function hide(){ const E=GE(); if(!E) return; try{ E.layers.setVisible(LYR,false); E.layers.setVisible(EDGE,false);
      if(E.layers.has(BODY)) E.layers.setVisible(BODY,false); }catch(_){} }
    function remove(){ const E=GE(); if(!E) return;
      try{ E.layers.remove(LYR); E.layers.remove(EDGE);
        if(E.layers.removeSolid) E.layers.removeSolid(BODY);
        E.layers.removeSource(SRC); }catch(_){} }

    /* ---- shapes (#R171) --------------------------------------------------------------------
       Every shape ends up as the same thing — a ring of lng/lat — so the extrusion, the area, the
       volume and "Keep on map" are shared and none of them has to know how it was drawn. */
    const R_EARTH=6371008.8, D2R=Math.PI/180, R2D=180/Math.PI;
    /* metres between two lng/lat, on the sphere (the footprint is measured in real ground metres, so a
       circle dragged out at 60°N is a real circle on the ground, not an ellipse in degrees) */
    function distM(a,b){ const la1=a[1]*D2R, la2=b[1]*D2R, dla=(b[1]-a[1])*D2R, dlo=(b[0]-a[0])*D2R;
      const h=Math.sin(dla/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin(dlo/2)**2;
      return 2*R_EARTH*Math.asin(Math.min(1,Math.sqrt(h))); }
    /* the point `distM` metres from `c` on bearing `brg` — the standard spherical destination formula */
    function destM(c,distMetres,brg){ const d=distMetres/R_EARTH, b=brg*D2R, la1=c[1]*D2R, lo1=c[0]*D2R;
      const la2=Math.asin(Math.sin(la1)*Math.cos(d)+Math.cos(la1)*Math.sin(d)*Math.cos(b));
      const lo2=lo1+Math.atan2(Math.sin(b)*Math.sin(d)*Math.cos(la1), Math.cos(d)-Math.sin(la1)*Math.sin(la2));
      return [((lo2*R2D+540)%360)-180, la2*R2D]; }
    function circleRing(centre,radiusMetres,n){ n=n||96; const out=[];
      for(let i=0;i<n;i++) out.push(destM(centre,Math.max(1,radiusMetres),i*360/n));
      return out; }
    /* Densified so the sides follow the projection instead of cutting across a curved globe. */
    function rectRing(a,b,perSide){ perSide=perSide||16;
      const w=[a[0],b[0]], s=[a[1],b[1]];
      const x0=Math.min(w[0],w[1]), x1=Math.max(w[0],w[1]), y0=Math.min(s[0],s[1]), y1=Math.max(s[0],s[1]);
      const corners=[[x0,y0],[x1,y0],[x1,y1],[x0,y1]], out=[];
      for(let i=0;i<4;i++){ const p=corners[i], q=corners[(i+1)%4];
        for(let k=0;k<perSide;k++){ const f=k/perSide; out.push([p[0]+(q[0]-p[0])*f, p[1]+(q[1]-p[1])*f]); } }
      return out; }
    /* Ramer-Douglas-Peucker, the same simplification the freehand Draw tool uses — a traced curve keeps
       its shape with a fraction of the vertices, so the extrusion stays cheap to re-paint while typing. */
    function _perp(p,a,b){ const dx=b[0]-a[0],dy=b[1]-a[1],L=dx*dx+dy*dy; if(L<1e-18) return Math.hypot(p[0]-a[0],p[1]-a[1]);
      let t=((p[0]-a[0])*dx+(p[1]-a[1])*dy)/L; t=Math.max(0,Math.min(1,t)); return Math.hypot(p[0]-(a[0]+t*dx),p[1]-(a[1]+t*dy)); }
    function rdp(pts,eps){ if(pts.length<3||eps<=0) return pts.slice();
      const keep=new Array(pts.length).fill(false); keep[0]=keep[pts.length-1]=true; const stk=[[0,pts.length-1]];
      while(stk.length){ const sg=stk.pop(), s=sg[0], e=sg[1]; let dmax=0, idx=-1;
        for(let i=s+1;i<e;i++){ const d=_perp(pts[i],pts[s],pts[e]); if(d>dmax){ dmax=d; idx=i; } }
        if(dmax>eps&&idx>-1){ keep[idx]=true; stk.push([s,idx]); stk.push([idx,e]); } }
      const out=[]; for(let i=0;i<pts.length;i++) if(keep[i]) out.push(pts[i]); return out; }
    function smoothRing(pts){ if(pts.length<8) return pts.slice();
      let mnx=1e9,mny=1e9,mxx=-1e9,mxy=-1e9; pts.forEach(p=>{ mnx=Math.min(mnx,p[0]); mxx=Math.max(mxx,p[0]); mny=Math.min(mny,p[1]); mxy=Math.max(mxy,p[1]); });
      const eps=Math.hypot(mxx-mnx,mxy-mny)*0.004;   /* scaled to the drawing's own size → identical at any zoom */
      const s=rdp(pts,eps); return s.length>=3?s:pts.slice(); }

    /* ---- the drag gesture (freehand / circle / rectangle) ----------------------------------- */
    /* The polygon shape is driven by the map's own clicks (handleMapClick → measurePoints, unchanged).
       The other three are STROKES, so this module takes the drag for the length of one — through the
       engine's input contract, never by touching the renderer's pan handler. */
    let armed=false, drawing=false, anchor=null, trace=[], _cv=null, _lastPx=null;
    const ownsGesture=()=>armed;
    function _canvas(){ try{ return GE().render.canvas(); }catch(_){ return null; } }
    function _ll(clientX,clientY){ const cv=_canvas(); if(!cv) return null;
      const r=cv.getBoundingClientRect(); const p=GE().coords.unproject([clientX-r.left, clientY-r.top]);
      return p?[p.lng, Math.max(-88,Math.min(88,p.lat))]:null; }
    function _grab(on){ try{ GE().input.setDragPan(!on); }catch(_){}
      try{ GE().render.setCursor(on?'crosshair':''); }catch(_){} }
    function _begin(ll){ if(!ll) return; drawing=true; anchor=ll; trace=[ll]; _lastPx=null; _grab(true); }
    function _extend(ll,px){ if(!drawing||!ll) return;
      if(shape==='freehand'){
        if(_lastPx&&Math.hypot(px.x-_lastPx.x,px.y-_lastPx.y)<4) return;   /* one sample per ~4 px of travel */
        _lastPx={x:px.x,y:px.y}; trace.push(ll); if(trace.length>=3) setRing(smoothRing(trace));
      } else if(shape==='circle'){ setRing(circleRing(anchor,distM(anchor,ll)));
      } else if(shape==='rect'){ setRing(rectRing(anchor,ll)); } }
    function _end(){ if(!drawing) return; drawing=false; _grab(false);
      if(shape==='freehand'&&trace.length>=3) setRing(smoothRing(trace));
      /* A stroke produces no map click, so nothing else would tell the panel its numbers changed. */
      try{ if(onShapeDone) onShapeDone(); }catch(_){} }
    function onDown(e){ if(!armed||e.button!==0) return; e.preventDefault(); e.stopPropagation(); _begin(_ll(e.clientX,e.clientY)); }
    function onMove(e){ if(!drawing) return; const cv=_canvas(); if(!cv) return; const r=cv.getBoundingClientRect();
      _extend(_ll(e.clientX,e.clientY),{x:e.clientX-r.left,y:e.clientY-r.top}); }
    /* A stroke that ends where no mouseup can reach us — the pointer released outside the window, the
       tab lost focus mid-drag, a touch cancelled — would otherwise leave the map's pan switched off.
       Same defence the flight sim uses for held keys (#R95). */
    function onUp(){ _end(); }
    function onLost(){ if(drawing) _end(); }
    function onTouchStart(e){ if(!armed||e.touches.length!==1) return; e.preventDefault(); _begin(_ll(e.touches[0].clientX,e.touches[0].clientY)); }
    function onTouchMove(e){ if(!drawing||e.touches.length!==1) return; e.preventDefault(); const cv=_canvas(); if(!cv) return;
      const r=cv.getBoundingClientRect(), t=e.touches[0]; _extend(_ll(t.clientX,t.clientY),{x:t.clientX-r.left,y:t.clientY-r.top}); }
    function onTouchEnd(e){ if(drawing) e.preventDefault(); _end(); }
    function _wire(on){
      const cv=_canvas(); if(!cv) return;
      if(on&&cv!==_cv) _wire(false);
      if(on){ if(_cv) return; _cv=cv;
        cv.addEventListener('mousedown',onDown,true); window.addEventListener('mousemove',onMove,true); window.addEventListener('mouseup',onUp,true);
        cv.addEventListener('touchstart',onTouchStart,{passive:false}); cv.addEventListener('touchmove',onTouchMove,{passive:false}); cv.addEventListener('touchend',onTouchEnd,{passive:false});
        window.addEventListener('blur',onLost); window.addEventListener('pointercancel',onLost,true); cv.addEventListener('touchcancel',onLost,{passive:false});
      } else if(_cv){
        _cv.removeEventListener('mousedown',onDown,true); window.removeEventListener('mousemove',onMove,true); window.removeEventListener('mouseup',onUp,true);
        _cv.removeEventListener('touchstart',onTouchStart); _cv.removeEventListener('touchmove',onTouchMove); _cv.removeEventListener('touchend',onTouchEnd);
        window.removeEventListener('blur',onLost); window.removeEventListener('pointercancel',onLost,true); _cv.removeEventListener('touchcancel',onLost);
        _cv=null; }
    }
    /* Switching shape starts a fresh footprint: a circle is not "the polygon with rounder corners", and
       silently re-interpreting the old points as the new shape would draw something nobody asked for. */
    function setShape(kind){ const k=['polygon','freehand','circle','rect'].indexOf(String(kind))>=0?String(kind):'polygon';
      if(k===shape) return shape;
      shape=k; ring=[]; trace=[]; drawing=false; sealed=false;
      armed=(shape!=='polygon'); _wire(armed); if(!armed) _grab(false);
      hide(); return shape; }
    /* Called when the tool itself opens/closes — clear() alone must not unwire, because the panel's
       Clear button uses it and the user still expects to be able to draw afterwards. */
    function release(){ clear(); armed=false; drawing=false; _wire(false); _grab(false); shape='polygon'; }
    /* (#R174) the "drawing complete" full stop. `seal(false)` re-opens the footprint for more clicks, so
       nothing is lost by pressing it. Only the click-vertex shape has anything to seal. */
    function seal(v){ sealed=(v==null)?true:!!v; return sealed; }

    /* ---- public API ------------------------------------------------------------------------ */
    /* Every setter re-paints, so the box tracks the numbers as they are typed. */
    function setRing(pts){ ring=(pts||[]).map(p=>[+p[0],+p[1]]); ringFromClicks=false; return paint(); }
    /* (#R172) the click-vertex flow's own entry point. The panel re-renders constantly (every keystroke in a
       neighbouring field, every tool refresh) and used to push the measure tool's vertex list straight into
       setRing each time — so a footprint that came from anywhere else (Atlas, a traced stroke, a restored
       shape) was silently replaced by an empty list. Now only a ring this function created is refreshed by it. */
    function syncClicks(pts){ const n=(pts||[]).length;
      if(!n&&!ringFromClicks) return false;          /* nothing clicked and the ring is not ours — leave it alone */
      ring=(pts||[]).map(p=>[+p[0],+p[1]]); ringFromClicks=true; return paint(); }
    /* A field being TYPED into is not a number yet. '' (cleared to retype), '-' and '1e' are all states a
       real keyboard passes through, and `+''` is 0, so the old isFinite(+b) test silently rewrote a field
       the user had just emptied to 0 m. Anything that is not a finished number leaves the value alone. */
    function _num(v,cur){ if(v==null) return cur; const s=String(v).trim();
      if(s===''||s==='-'||s==='+'||s==='.'||s==='-.') return cur;
      const n=Number(s); return isFinite(n)?n:cur; }
    /* (#R172) NO CEILING (「上限の高度は無しに」). #R171 clamped both ends to the Kármán line at 100 km, which
       made the tool unable to say anything about the exosphere, a satellite orbit, or the Moon's distance —
       all perfectly reasonable things to want a real-scale band for. The only limits left are the renderer's:
       MAX_M is where MapLibre's extrusion still draws (measured, see tests/r172.spec.js), and the floor is the
       centre of the Earth, past which "an altitude above sea level" stops meaning anything. */
    const MAX_M=1e9, MIN_M=-6371000;
    function setAltitudes(b,t){
      baseM=clamp(_num(b,baseM),MIN_M,MAX_M); topM=clamp(_num(t,topM),MIN_M,MAX_M);
      /* (#R171) NO SWAPPING HERE. #R170 swapped an inverted pair so "3000 to 1000" still meant the band —
         but the pair is inverted on the way through EVERY edit ("1000" → clear the top field → type "5" →
         base and top swap under the cursor), which was half of "まともに数値入力ができない". The band is
         min..max at paint time instead, so an out-of-order pair still draws the right box and the two
         fields keep saying exactly what was typed into them. */
      return paint(); }
    const loM=()=>Math.min(baseM,topM), hiM=()=>Math.max(baseM,topM);
    function setStyle(col,op){ if(col) color=col; if(op!=null&&isFinite(+op)) opacity=clamp(+op,0.05,0.95);
      /* The colour lives on the LAYERS (see ensure), so a live change has to be pushed to both of them —
         the box and its ground outline. paint() below re-asserts the opacity and the geometry. */
      try{ const E=GE(); if(E&&E.layers.has(BODY)) E.layers.setSolid(BODY,{color,opacity}); }catch(_){}
      try{ const E=GE(); if(E&&E.layers.has(LYR)) E.layers.setPaint(LYR,'fill-extrusion-color',color);
        if(E&&E.layers.has(EDGE)) E.layers.setPaint(EDGE,'line-color',color);
      }catch(_){}
      return paint(); }
    function clear(){ ring=[]; trace=[]; groundM=null; sealed=false; hide(); }

    /* "Keep on map": hand the footprint to the shared annotation store the measure/area/radius tools
       use, tagged with the altitude band so the saved shape still says what it represented. The
       annotation layer is 2-D, so this deliberately keeps the FOOTPRINT plus its altitude label —
       it does not pretend to persist the extrusion. */
    function keep(){ const r=closedRing(); if(!r||!window.IntMapAnnotations) return false;
      const L=(en,jp,de,ru,es)=>HOST.lang==='jp'?jp:HOST.lang==='de'?de:HOST.lang==='ru'?ru:HOST.lang==='es'?es:en;
      try{ window.IntMapAnnotations.add({type:'Polygon',coordinates:[r]},{
          color, op:0.18,
          name:L('3-D volume','3D立体','3-D-Volumen','3-D объём','Volumen 3-D'),
          value:fmtAlt(loM())+'–'+fmtAlt(hiM())+' · '+fmtVolume() });   /* (#R172) in the unit the user chose */
        return true; }catch(_){ return false; } }

    /* ---- units (#R172) ---------------------------------------------------------------------
       「単位はm以外にkm等も選べるように。」 The altitude fields are the only place the user types a LENGTH
       into this tool, and metres are the wrong unit for most of what it is good for — a 10-14 km airway
       band, a 35,786 km geostationary shell, a 400 ft drone ceiling. The model stays in metres (one truth);
       the unit is a presentation choice that converts on the way in and on the way out, so switching it
       never changes the volume, only how it is written. */
    const UNITS={ m:1, km:1000, ft:0.3048, mi:1609.344 };
    let unit='m';
    function setUnit(u){ if(UNITS[u]) unit=u; return unit; }
    const toUnit=m=>(+m||0)/UNITS[unit];              /* metres → the display unit */
    const fromUnit=v=>(+v||0)*UNITS[unit];            /* the display unit → metres */
    /* enough decimals that a metre-scale edit is not rounded away in a big unit, none where it would be noise */
    function _dp(){ return unit==='m'?0:unit==='ft'?0:3; }
    function fieldValue(m){ const v=toUnit(m); const d=_dp();
      return d?(+v.toFixed(d)):Math.round(v); }
    function fieldStep(){ return unit==='m'?100:unit==='ft'?500:unit==='km'?0.1:0.1; }

    /* ---- formatting (shared with the tool panel) -------------------------------------------- */
    function fmtVolume(){ const v=volumeM3(); if(!(v>0)) return '—';
      const per=UNITS[unit]*UNITS[unit]*UNITS[unit], u=v/per;
      /* metres get the long-standing auto-flip to km³ once the number stops being readable; a unit the user
         chose on purpose is never silently swapped for another one. */
      if(unit==='m'&&v>=1e9) return (v/1e9).toLocaleString(undefined,{maximumFractionDigits:2})+' km³';
      return (u>=100?Math.round(u):+u.toPrecision(4)).toLocaleString(undefined,{maximumFractionDigits:4})+' '+unit+'³'; }
    function fmtAlt(m){ const v=toUnit(m), d=_dp();
      return (d?(+v.toFixed(d)):Math.round(v)).toLocaleString(undefined,{maximumFractionDigits:d})+' '+unit; }

    /* ---- keep the box alive across style swaps ---------------------------------------------- */
    /* A base-map change (Map ⇄ Satellite) can rebuild the style; re-add and re-paint when it settles.
       A terrain toggle changes what the renderer's metres MEAN, so it must re-paint too — that is the
       whole point of the compensation above.

       LAZILY wired. This factory is constructed with the other modules right after the map is created,
       which is BEFORE index.html builds window.IntMapGeoEngine — attaching at construction time silently
       bound nothing at all (caught in the browser: the box kept ground:null through a terrain toggle
       because no `terrain` listener existed). Poll briefly for the engine, then attach exactly once. */
    let _wired=false;
    (function wire(n){
      if(_wired) return;
      const E=GE();
      if(E&&E.events){ _wired=true;
        E.events.on('styledata',()=>{ try{ if(ring.length>=3 && !E.layers.has(LYR)) setTimeout(paint,80); }catch(_){} });
        E.events.on('terrain',()=>{ try{ if(ring.length>=3) setTimeout(()=>paint(),120); }catch(_){} });
        return; }
      if((n||0)<200) setTimeout(()=>wire((n||0)+1),100);
    })(0);

    return { setRing, syncClicks, setAltitudes, setStyle, clear, remove, paint,
      /* (#R171) shapes + gesture ownership */
      setShape, shape:()=>shape, release, ownsGesture, onDone:fn=>{ onShapeDone=fn; },
      circleRing, rectRing, smoothRing, distM,
      /* (#R174) the polygon's full stop */
      seal, isSealed:()=>sealed,
      /* (#R172) units */
      setUnit, unit:()=>unit, units:()=>Object.keys(UNITS), toUnit, fromUnit, fieldValue, fieldStep,
      limits:()=>({min:MIN_M,max:MAX_M}),
      ring:()=>ring.slice(), base:()=>baseM, top:()=>topM, low:loM, high:hiM, color:()=>color, opacity:()=>opacity,
      ground:()=>groundM, terrainOn:has3DTerrain,
      areaM2, thicknessM, volumeM3, fmtVolume, fmtAlt, keep,
      /* diagnostics — Atlas + tests read these instead of poking at the renderer */
      state:()=>({ points:ring.length, base:baseM, top:topM, low:loM(), high:hiM(), shape, drawing, sealed,
        thickness:thicknessM(), areaM2:areaM2(), unit, fromClicks:ringFromClicks,
        volumeM3:volumeM3(), ground:groundM, terrain:has3DTerrain(), color, opacity,
        /* (#R173) "painted" is true for EITHER representation — the closed body and the open shell are the
           same volume drawn two ways, and a caller asking "is it on screen?" must not have to know which. */
        painted:(()=>{ try{ const E=GE(); return !!(E&&((E.layers.has(LYR)&&E.layers.isVisible(LYR))||(E.layers.has(BODY)&&E.layers.isVisible(BODY)))); }catch(_){ return false; } })(),
        body:(()=>{ try{ const E=GE(); return !!(E&&E.layers.has(BODY)&&E.layers.isVisible(BODY)); }catch(_){ return false; } })(),
        shell:(()=>{ try{ const E=GE(); return !!(E&&E.layers.has(LYR)&&E.layers.isVisible(LYR)); }catch(_){ return false; } })(),
        canSolid:canSolid(),
        err:lastRenderErr }) };
  })();
};
