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
 *  ── Renderer independence ───────────────────────────────────────────────────────────────────
 *  Written entirely against window.IntMapGeoEngine (#R152/#R160/#R161/#R170) — it never touches
 *  the MapLibre map. That makes it the first feature built end-to-end on the engine facade, and
 *  the reason `extrusion3d`, `addExtrusion`, `setExtrusionRange` and `canDraw` were added to the
 *  contract this round. A future Earth/Cesium adapter inherits the whole tool by implementing them.
 *
 *  The CSS stays in css/intmap.css; this file adds no <style>.
 * ==========================================================================*/
window.IntMapModules=window.IntMapModules||{};
window.IntMapModules.volume3d=function(map,HOST){
  return (function(){
    const SRC='imv3d-src', LYR='imv3d-vol', EDGE='imv3d-edge';
    const GE=()=>window.IntMapGeoEngine;

    /* the live volume: a closed ring (lng/lat, no repeated last point) + two ALTITUDES in metres AMSL */
    let ring=[], baseM=1000, topM=3000, color='#0a84ff', opacity=0.45;
    let groundM=null;        /* DEM elevation under the footprint centroid (null = unknown / terrain off) */
    let lastRenderErr=null;

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
    function thicknessM(){ return Math.max(0, topM-baseM); }
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
    function ensure(){ const E=GE(); if(!E||!E.canDraw()) return false;
      try{
        if(!E.layers.hasSource(SRC)) E.layers.addSource(SRC,{type:'geojson',data:{type:'FeatureCollection',features:[]}});
        if(!E.layers.has(LYR)){
          const ok=E.layers.addExtrusion({ id:LYR, source:SRC, paint:{
            'fill-extrusion-color':['coalesce',['get','color'],color],
            'fill-extrusion-opacity':opacity,
            'fill-extrusion-base':0, 'fill-extrusion-height':0 } });
          if(!ok) return false;
        }
        /* a thin outline on the footprint so the box is locatable on the ground even edge-on */
        if(!E.layers.has(EDGE)) E.layers.add({ id:EDGE, type:'line', source:SRC,
          paint:{ 'line-color':['coalesce',['get','color'],color], 'line-width':1.6, 'line-opacity':0.9 } });
        return true;
      }catch(e){ lastRenderErr=String(e&&e.message||e); return false; }
    }

    /* Push the current ring + altitudes to the renderer. See the altitude-reference note at the top:
       with terrain on we hand over HEIGHT-ABOVE-GROUND, so the box lands at the requested ALTITUDE. */
    function paint(noChase){ const E=GE(); if(!E) return false;
      const r=closedRing();
      if(!r){ hide(); return false; }
      if(!ensure()) return false;
      groundM=has3DTerrain()?readGround():null;
      const off=(has3DTerrain()&&groundM!=null)?groundM:0;
      const rb=Math.max(0, baseM-off), rh=Math.max(rb+0.5, topM-off);   /* never a zero/inverted box */
      try{
        E.layers.setSourceData(SRC,{type:'FeatureCollection',features:[
          {type:'Feature',geometry:{type:'Polygon',coordinates:[r]},properties:{color}} ]});
        E.layers.setExtrusionRange(LYR, rb, rh);
        E.layers.setPaint(LYR,'fill-extrusion-opacity',opacity);
        E.layers.setVisible(LYR,true); E.layers.setVisible(EDGE,true);
        if(has3DTerrain()&&!noChase) chaseGround();   /* the DEM may still be streaming — see chaseGround */
        lastRenderErr=null; return true;
      }catch(e){ lastRenderErr=String(e&&e.message||e); return false; }
    }
    function hide(){ const E=GE(); if(!E) return; try{ E.layers.setVisible(LYR,false); E.layers.setVisible(EDGE,false); }catch(_){} }
    function remove(){ const E=GE(); if(!E) return;
      try{ E.layers.remove(LYR); E.layers.remove(EDGE); E.layers.removeSource(SRC); }catch(_){} }

    /* ---- public API ------------------------------------------------------------------------ */
    /* Every setter re-paints, so the box tracks the numbers as they are typed. */
    function setRing(pts){ ring=(pts||[]).map(p=>[+p[0],+p[1]]); return paint(); }
    function setAltitudes(b,t){
      /* -430 m = the Dead Sea shore, the lowest dry land on Earth; 100 km = the Kármán line. Clamping
         to a real range keeps a stray keystroke from asking the renderer for a 10^9 m tower. */
      let nb=isFinite(+b)?+b:baseM, nt=isFinite(+t)?+t:topM;
      nb=clamp(nb,-430,100000); nt=clamp(nt,-430,100000);
      if(nt<nb){ const s=nb; nb=nt; nt=s; }          /* tolerate "3000 to 1000" — the user means the band */
      baseM=nb; topM=nt; return paint(); }
    function setStyle(col,op){ if(col) color=col; if(op!=null&&isFinite(+op)) opacity=clamp(+op,0.05,0.95); return paint(); }
    function clear(){ ring=[]; groundM=null; hide(); }

    /* "Keep on map": hand the footprint to the shared annotation store the measure/area/radius tools
       use, tagged with the altitude band so the saved shape still says what it represented. The
       annotation layer is 2-D, so this deliberately keeps the FOOTPRINT plus its altitude label —
       it does not pretend to persist the extrusion. */
    function keep(){ const r=closedRing(); if(!r||!window.IntMapAnnotations) return false;
      const L=(en,jp,de,ru,es)=>HOST.lang==='jp'?jp:HOST.lang==='de'?de:HOST.lang==='ru'?ru:HOST.lang==='es'?es:en;
      try{ window.IntMapAnnotations.add({type:'Polygon',coordinates:[r]},{
          color, op:0.18,
          name:L('3-D volume','3D立体','3-D-Volumen','3-D объём','Volumen 3-D'),
          value:Math.round(baseM).toLocaleString()+'–'+Math.round(topM).toLocaleString()+' m · '+fmtVolume() });
        return true; }catch(_){ return false; } }

    /* ---- formatting (shared with the tool panel) -------------------------------------------- */
    function fmtVolume(){ const v=volumeM3(); if(!(v>0)) return '—';
      if(v>=1e9) return (v/1e9).toLocaleString(undefined,{maximumFractionDigits:2})+' km³';
      return Math.round(v).toLocaleString()+' m³'; }
    function fmtAlt(m){ return Math.round(m).toLocaleString()+' m'; }

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

    return { setRing, setAltitudes, setStyle, clear, remove, paint,
      ring:()=>ring.slice(), base:()=>baseM, top:()=>topM, color:()=>color, opacity:()=>opacity,
      ground:()=>groundM, terrainOn:has3DTerrain,
      areaM2, thicknessM, volumeM3, fmtVolume, fmtAlt, keep,
      /* diagnostics — Atlas + tests read these instead of poking at the renderer */
      state:()=>({ points:ring.length, base:baseM, top:topM, thickness:thicknessM(), areaM2:areaM2(),
        volumeM3:volumeM3(), ground:groundM, terrain:has3DTerrain(),
        painted:(()=>{ try{ return !!(GE()&&GE().layers.has(LYR)&&GE().layers.isVisible(LYR)); }catch(_){ return false; } })(),
        err:lastRenderErr }) };
  })();
};
