/* ============================================================================
 *  IntMap · Ocean currents — the BUNDLED ATLAS PLATE  (#R219, replacing #R218/#R216)
 * ----------------------------------------------------------------------------
 *  「海流レイヤー、思ってたのと違う。ちゃんと**もとからデータが固定された**レイヤーとして地図上に
 *    描画してください。作り直せ。」（確認済：「同梱の固定データで常時描画」）
 *
 *  ══ WHAT WAS WRONG WITH THE PREVIOUS TWO ═════════════════════════════════════════════════════════
 *  #R216 drew 24 single arrows for the viewport; #R218 replaced them with streamlines integrated,
 *  live, through a per-viewport fetch of Open-Meteo Marine. Both were made of real numbers and both
 *  answered the wrong question. What a reader turning on 「海流」 expects is the plate every atlas
 *  has: the world's currents, named, warm in red and cold in blue, ALREADY THERE — not a picture
 *  that is recomputed (and re-fetched, and re-shaped) every time the map moves. That is the whole of
 *  「もとからデータが固定された」, and it is a data-shape decision, not a rendering one.
 *
 *  ══ WHAT IT DRAWS NOW — AND WHERE IT COMES FROM ══════════════════════════════════════════════════
 *  Everything on screen comes from `data/ocean-currents.json`, which ships with the app and is built
 *  offline by `scripts/build-ocean-currents.mjs` (#R208). NOTHING here touches the network.
 *
 *  ⚠ (#R221) 「海流レイヤーのquality, coverageが悪すぎる。」 — THE DATA WAS REBUILT. What follows
 *  describes the current file; scripts/build-ocean-currents.mjs's header has the measurements of
 *  what was wrong with the old one (40 days of one year on a 1° grid: the Kuroshio's trace was an
 *  eddy that ended where it started, the Canary Current was a 369 km stub of a 3,000 km current).
 *
 *    · 61 NAMED CURRENTS — Gulf Stream, Kuroshio, Oyashio, Agulhas, Humboldt, Leeuwin, Malvinas,
 *      Mozambique, Tsushima, the four Antarctic Circumpolar sectors, … Each is a POLYLINE, and ⚠ the
 *      polyline is not copied from a drawing: it was TRACED through a measured CLIMATOLOGICAL mean
 *      velocity field on its source's own 0.25° grid — NOAA CoastWatch's blended geostrophic surface
 *      current from multi-mission altimetry, plus the Ekman part from NOAA NCEI wind stress through
 *      Ralph & Niiler (1999). The name and one seed point per current are editorial; every vertex is
 *      the field's.
 *    · WARM / COLD / ZONAL — ⚠ MEASURED, not derived from the flow any more: each current's own SST
 *      against the ZONAL MEAN at the same latitude (NOAA OISST v2.1), which is what the words mean.
 *      The old derivation (the mean poleward component of the velocity) called the Benguela warm and
 *      the Canary zonal, because the sign of v along a real path is dominated by meanders. Within
 *      ±0.6 K the current is drawn grey — the equatorial and circumpolar currents genuinely run
 *      along their own isotherms, and forcing them into one of two colours would be a claim.
 *    · THE GLOBAL FLOW FIELD — 28,208 arrows on a 1° grid, one per moving ocean cell of the same mean
 *      field, at every zoom. This is what makes the layer a MAP of the ocean rather than 61 lines: the gyres,
 *      the equatorial counter-flow and the western boundary intensification are all in it. The arrow
 *      is shaded by the measured speed; the renderer thins them by collision, so the density follows
 *      the zoom without anything being recomputed.
 *
 *  ══ ⚠⚠ (#R222) 「海流レイヤーのquality, coverageを増強して」 — THREE THINGS, CONFIRMED ══════════════
 *  Confirmed with the reader as 「本数増＋格子0.5°＋季節（月別）」, and each of the three changed a
 *  different part of this file:
 *
 *    1. 61 NAMED CURRENTS → 108. The build's seed list grew by the marginal-sea and coastal currents
 *       an atlas plate has and this one did not (Tsugaru, Sōya, East Korea Warm, Taiwan Warm, Yellow
 *       Sea Warm, Vietnam Coastal, New Guinea Coastal, Costa Rica Coastal, Davidson, Yucatán, Guiana,
 *       Cape Horn, West Spitsbergen, Algerian, East African Coastal, the two India coastal currents…).
 *       Two of the 110 seeds have no measurable flow in the field and are DROPPED by the build rather
 *       than drawn from their name.
 *    2. THE FIELD IS NO LONGER A LIST OF ARROWS. `doc.arrows` is gone; the field is
 *       data/ocean-currents-field.bin.gz — the source's own 0.25° grid, 466,007 cells with flow, one
 *       byte of speed and one of bearing, ~870 kB gzipped (see js/ocean-currents-field.js). THIS FILE
 *       chooses the stride from the view, so the renderer is handed a roughly constant number of
 *       marks at every zoom — 16× the data, FEWER features than #R221 at every zoom, and the finest
 *       detail the source has when you look closely at a strait.
 *    3. THE SEASON. A month picker over twelve monthly climatologies at 0.5°
 *       (data/ocean-currents-months.bin.gz, ~3 MB, fetched ONLY if a month is chosen). The monsoon
 *       reversal is then something the reader watches happen; each named current also carries its
 *       twelve monthly speeds and the sign of the flow ALONG its own path, so a current that runs
 *       backwards in a season says so in the list.
 *
 *  ⚠ CONSEQUENCES THAT ARE DELIBERATE, so they are written down rather than discovered:
 *    · The picture no longer follows the app clock. It is a MEAN FIELD, and a mean has no instant —
 *      the panel says so. (#R216/#R218's instantaneous field did follow the clock; that is the one
 *      thing given up, and it is what 「固定」 asks for.)
 *    · The Wikidata name fetch is gone. Its names are now bundled, in all five languages, so the
 *      layer needs no query service to be complete.
 *    · Turning the layer on is one ~760 kB file, fetched once per session and kept — and NOT on the boot path.
 * ==========================================================================*/
window.IntMapModules=window.IntMapModules||{};
window.IntMapModules.oceanCurrents=function(HOST){
  const GE=()=>window.IntMapGeoEngine;

  window.IntMapCurrents=(function(){
    if(!GE().hasRenderer()) return { state:()=>({on:false}) };
    /* the shared layer-family toolkit (#R213) — the same panel, row and legend every other
       World-data layer uses. If world-packs has not registered, this module does not build. */
    const W=(window.IntMapWorld&&window.IntMapWorld._ui)||null;
    if(!W) return { state:()=>({on:false,err:'world-packs not loaded'}) };
    const { makePanel, ensureHead, row, esc, whenDrawable, setVis, onRestyle, L } = W;

    /* ══ ⚠⚠ (#R220) 「クオリティがゴミ。」 — WHAT WAS ACTUALLY ON SCREEN ═══════════════════════════
       #R219 got the DATA right (bundled, fixed, measured — see the file header) and then drew it as
       thin unoutlined threads. Measured on the built site: at z2 the named currents are 1.0–3.9 px
       wide with no casing, so on the satellite basemap they are the same value as the sea they cross;
       at z4, over the North Atlantic, NOT ONE arrowhead and NOT ONE name is legible, and the 5,484
       field arrows — white SDF at `icon-opacity` 0.55 — have vanished into the water entirely. A plate
       in an atlas is legible because every mark is OUTLINED against its background; none of these was.

       So this round is a RENDERING round for this layer, and the data file is untouched:
         · every mark now has a CASING (a darker, wider copy underneath) — line, arrowhead and field
           arrow alike. That is the single change that makes the layer readable on both basemaps.
         · the named currents are ribbons, not threads: a soft glow, a casing, then the colour, with
           the width carrying the measured mean speed.
         · the arrowheads repeat along each current at a spacing that follows the zoom, at ~2× their
           old size, so the DIRECTION is visible without reading the panel.
         · the names are ~15 % larger with a real halo, and no longer optional at low zoom.
         · the field arrow is a tapered dart with a tail rather than a fat triangle, and its SIZE as
           well as its shade carries the measured speed (the legend says so).
       ⚠ Nothing here recomputes anything when the map moves: every one of these is a style
       expression, exactly as #R219 left it. */
    const SRC='oc-src', GLOW='oc-glow', CASE='oc-case', LINE='oc-line',
          HEADC='oc-head-case', HEAD='oc-head', LBL='oc-label',
          FSRC='oc-flow-src', FLOWC='oc-flow-case', FLOW='oc-flow';

    /* the two colours the request names, plus the honest third one.
       (#R220) …chosen against BOTH basemaps this time: the old #ff453a is an interface red that goes
       muddy over the satellite ocean, and #2f7fe0 is within a few per cent of the sea it is drawn on. */
    const COL_WARM='#ff5b41', COL_COLD='#38b6ff', COL_NEUTRAL='#c9d1d9';
    const COL_CASE='rgba(2,16,28,0.82)';   /* the casing every mark shares */
    /* ⚠ (#R220) ONE LIST, and everything that switches the layer reads it. The first version of this
       round updated the PANEL's list and left `setVis([FLOW,LINE,HEAD,LBL], …)` in `draw()` and
       `toggle()` — measured on the built site: `oc-glow`, `oc-case`, `oc-head-case` and `oc-flow-case`
       all `visibility:'none'`, i.e. every casing this round exists to add was built and never shown,
       and the plate looked exactly as thin as it had before. */
    const ALL=[FLOWC,FLOW,GLOW,CASE,LINE,HEADC,HEAD,LBL];

    let on=false, doc=null, state='idle', err=null, picked=null;
    /* (#R222) the field, the months, and which plane is being shown. `month` is 0 for the
       climatological mean and 1…12 for a calendar month. */
    let field=null, fieldState='idle', months=null, monthState='idle', month=0, lastBox=null, lastStride=0;
    const FLD=()=>window.IntMapCurrentField;

    const panel=makePanel('oc-panel',()=>'🌊 '+L('Ocean currents','海流','Meeresströmungen','Морские течения','Corrientes marinas'),'wp-dl-currents',
      { legendId:'wpcurrents', layers:()=>ALL.slice(),
        names:()=>({en:'🌊 Ocean currents',jp:'🌊 海流（暖流・寒流）',de:'🌊 Meeresströmungen',ru:'🌊 Морские течения',es:'🌊 Corrientes marinas'}) });

    /* ── the arrowhead, drawn once and registered as an image ─────────────────────────────────────
       ⚠ IT POINTS RIGHT, NOT UP, and that is load-bearing twice over. With `symbol-placement:'line'`
       the renderer rotates an icon to the LINE's bearing and treats the icon's +x as forward. At a
       POINT (the flow field) nothing rotates it for us, so the feature's own bearing is applied with
       `icon-rotate` — and because +x already points at bearing 90°, the rotation asked for is
       (bearing − 90). One image serves both, and `icon-color` tints it, which is why it is SDF
       (SDF uses the ALPHA channel only — so the outline is drawn in white too).
       ⚠ IT IS `scene`, NOT `layers` (#R216): the renderer contract puts images beside the sky and the
       terrain; `GE().layers.addImage` is simply undefined. */
    let iconDone=false;
    /* (#R220) two glyphs now, both SDF, both pointing right:
         `oc-arrow-img` — the solid head that repeats along a NAMED current
         `oc-dart-img`  — the field mark: a tapered dart with a tail, which reads as "the water is
                          moving this way" at 1/3 the ink of a triangle and does not turn a busy
                          gyre into a field of confetti. */
    function _mkIcon(name,S,paint){
      try{
        if(GE().scene.hasImage(name)) return true;
        const cv=document.createElement('canvas'); cv.width=S; cv.height=S;
        const c=cv.getContext('2d');
        c.translate(S/2,S/2);
        c.fillStyle='#ffffff'; c.strokeStyle='#ffffff'; c.lineCap='round'; c.lineJoin='round';
        paint(c);
        /* ⚠ `getImageData` IS NOT TRANSFORMED (#R216). It reads raw bitmap pixels, so asking for
           (−S/2, −S/2) after `translate(S/2, S/2)` reads outside the canvas and hands back a fully
           TRANSPARENT block — which registers happily and then draws nothing at all. */
        const d=c.getImageData(0,0,S,S);
        GE().scene.addImage(name,{width:S,height:S,data:new Uint8Array(d.data.buffer)},{sdf:true});
        return GE().scene.hasImage(name);
      }catch(_){ return false; } }
    function ensureIcon(){
      if(iconDone) return true;
      const a=_mkIcon('oc-arrow-img',48,(c)=>{
        c.beginPath(); c.moveTo(20,0); c.lineTo(-10,13); c.lineTo(-4,0); c.lineTo(-10,-13); c.closePath();
        c.fill(); c.lineWidth=2.2; c.stroke(); });
      const b=_mkIcon('oc-dart-img',48,(c)=>{
        c.lineWidth=3.4; c.beginPath(); c.moveTo(-19,0); c.lineTo(4,0); c.stroke();      /* the tail */
        c.beginPath(); c.moveTo(19,0); c.lineTo(2,7.5); c.lineTo(2,-7.5); c.closePath(); /* the head */
        c.fill(); c.lineWidth=1.6; c.stroke(); });
      iconDone=a&&b;
      return iconDone; }

    function _canDraw(){ try{ return !!HOST.canDraw(); }catch(_){ try{ return !!GE().ready(); }catch(__){ return false; } } }

    /* The speed shading for the flow field: the ONE thing an arrow can say beyond its direction, and
       it is measured (m/s in the file).
       ⚠ (#R220) THE OLD RAMP WAS BLUE ON BLUE. It ran #9fc6e8 → #0a2f78, i.e. from "slightly lighter
       than the satellite ocean" to "darker than it", so on the basemap the layer is actually used
       with, speed was encoded in a channel the eye could not read. The new ramp goes from the water's
       own pale to a warm high — white through amber — which separates from every sea colour either
       basemap paints, and the SIZE carries the same number a second time (`SPEED_SZ`). */
    const SPEED_COL=['interpolate',['linear'],['get','s'],
      0.02,'#bcdcf2', 0.15,'#e8f4ff', 0.40,'#ffffff', 0.80,'#ffe08a', 1.40,'#ffb648'];
    const SPEED_SZ=(k)=>['*',k,['interpolate',['linear'],['get','s'],0.02,0.72,0.35,1.0,1.2,1.34]];

    function ensureLayers(){
      if(!_canDraw()) return false;
      try{
        ensureIcon();
        if(!GE().layers.hasSource(FSRC)) GE().layers.addSource(FSRC,{type:'geojson',data:{type:'FeatureCollection',features:[]}});
        if(!GE().layers.hasSource(SRC))  GE().layers.addSource(SRC,{type:'geojson',data:{type:'FeatureCollection',features:[]}});
        /* ① the field. Points, each rotated to its own measured bearing. `icon-allow-overlap:false`
           is what makes the density follow the zoom: the renderer drops the ones that would collide,
           so a whole-Earth view is a readable field and a bay is every cell it has.
           ⚠ (#R220) …under a CASING copy of itself. Two symbol layers over one source cost one more
           placement pass and are what stop the field from disappearing into the sea. The casing must
           `icon-allow-overlap:true` and `icon-ignore-placement:true` — if it took part in collision
           it would sometimes win the slot its own arrow lost, and the map would show naked shadows. */
        /* ⚠ THE ZOOM EXPRESSION IS THE OUTERMOST ONE (#R196's rule), so the SPEED rides on the stop
           OUTPUTS. Measured: writing `['*', speed, zoomRamp]` is accepted-looking and rejected, and a
           rejected layout leaves the icons at their natural 48 px — which is what a first version of
           this round did, and the whole ocean went dark under them. */
        const FLOW_SIZE=(k)=>['interpolate',['linear'],['zoom'],
          0,SPEED_SZ(0.26*k), 3,SPEED_SZ(0.34*k), 6,SPEED_SZ(0.46*k), 9,SPEED_SZ(0.58*k)];
        const FLOW_LAYOUT=()=>({visibility:'none',
          'icon-image':'oc-dart-img',
          'icon-rotate':['-',['get','b'],90],
          'icon-rotation-alignment':'map','icon-padding':1});
        if(!GE().layers.has(FLOWC)) GE().layers.add({id:FLOWC,type:'symbol',source:FSRC,
          layout:Object.assign(FLOW_LAYOUT(),{ 'icon-size':FLOW_SIZE(1),
            'icon-allow-overlap':true,'icon-ignore-placement':true }),
          paint:{'icon-color':COL_CASE,
            'icon-opacity':['interpolate',['linear'],['zoom'],0,0.34,4,0.44,8,0.52],
            'icon-halo-color':COL_CASE,'icon-halo-width':1.2,'icon-halo-blur':0.5}});
        if(!GE().layers.has(FLOW)) GE().layers.add({id:FLOW,type:'symbol',source:FSRC,
          layout:Object.assign(FLOW_LAYOUT(),{ 'icon-size':FLOW_SIZE(1),
            'icon-allow-overlap':false,'icon-ignore-placement':false }),
          paint:{'icon-color':SPEED_COL,
            'icon-opacity':['interpolate',['linear'],['zoom'],0,0.85,4,0.95,8,1]}});
        /* ② the named currents, over the field — glow, casing, colour, in that order */
        const WIDTH=(k,add)=>['interpolate',['linear'],['zoom'],
          0,['+',['*',2.0*k,['get','w']],add], 3,['+',['*',3.2*k,['get','w']],add],
          6,['+',['*',5.4*k,['get','w']],add], 9,['+',['*',8.0*k,['get','w']],add]];
        if(!GE().layers.has(GLOW)) GE().layers.add({id:GLOW,type:'line',source:SRC,
          layout:{visibility:'none','line-cap':'round','line-join':'round'},
          paint:{'line-color':['get','col'],'line-width':WIDTH(3.1,0),'line-opacity':0.22,'line-blur':6}});
        if(!GE().layers.has(CASE)) GE().layers.add({id:CASE,type:'line',source:SRC,
          layout:{visibility:'none','line-cap':'round','line-join':'round'},
          paint:{'line-color':COL_CASE,'line-width':WIDTH(1,2.6),'line-opacity':0.9}});
        if(!GE().layers.has(LINE)) GE().layers.add({id:LINE,type:'line',source:SRC,
          layout:{visibility:'none','line-cap':'round','line-join':'round'},
          paint:{'line-color':['get','col'],'line-width':WIDTH(1,0),'line-opacity':1,'line-blur':0.15}});
        const HEAD_LAYOUT=(sz)=>({visibility:'none',
          'symbol-placement':'line','symbol-spacing':['interpolate',['linear'],['zoom'],0,86,4,120,8,170],
          'icon-image':'oc-arrow-img','icon-size':['interpolate',['linear'],['zoom'],0,0.46*sz,4,0.62*sz,8,0.84*sz],
          'icon-rotation-alignment':'map','icon-allow-overlap':true,'icon-ignore-placement':true,'icon-padding':0});
        if(!GE().layers.has(HEADC)) GE().layers.add({id:HEADC,type:'symbol',source:SRC,layout:HEAD_LAYOUT(1.34),
          paint:{'icon-color':COL_CASE,'icon-opacity':0.9}});
        if(!GE().layers.has(HEAD)) GE().layers.add({id:HEAD,type:'symbol',source:SRC,layout:HEAD_LAYOUT(1),
          paint:{'icon-color':['get','col'],'icon-opacity':1}});
        /* ③ the name, along the current it belongs to */
        if(!GE().layers.has(LBL)) GE().layers.add({id:LBL,type:'symbol',source:SRC,layout:{visibility:'none',
          'symbol-placement':'line','symbol-spacing':600,
          'text-field':['get','name'],'text-size':window.IntMapLabelScale.sub(0.92),
          'text-offset':[0,1.0],'text-allow-overlap':false,'text-optional':true,'text-max-angle':38},
          paint:{'text-color':'#eaf4ff','text-halo-color':'rgba(0,20,36,0.92)','text-halo-width':1.5}});
        return true;
      }catch(_){ return false; } }

    /* ⚠ (#R220) A RESTYLE DROPS EVERY ADDED LAYER. The basemap swap, a theme change and a style
       reload all take the eight layers away, and this module had no `onRestyle` at all — so the plate
       vanished until the reader toggled it off and on again. Redrawn from the document already in
       hand: no request, no wait. (#R219 found and closed the same hole in the tide shading.) */
    onRestyle(()=>{ if(on&&doc) whenDrawable(()=>{ if(ensureLayers()) draw(); }); });

    /* ── the file, once ───────────────────────────────────────────────────────────────────────────
       ⚠ NOT ON THE BOOT PATH. 146 kB is nothing next to the layer being useful, and everything about
       nothing next to a layer nobody switched on — so it is fetched on the first toggle and kept. */
    function load(){
      if(doc||state==='loading') return Promise.resolve(doc);
      state='loading'; err=null; render();
      let url; try{ url=new URL('data/ocean-currents.json',document.baseURI).toString(); }catch(_){ url='data/ocean-currents.json'; }
      return fetch(url).then(r=>{ if(!r.ok) throw new Error('http '+r.status); return r.json(); })
        .then(d=>{ doc=d; state='ok'; loadField(); draw(); render(); return d; })
        .catch(e=>{ state='error'; err=(e&&e.message)||String(e); render(); return null; }); }

    /* ── (#R222) the gridded field, once ──────────────────────────────────────────────────────────
       ⚠ IT IS A SEPARATE FETCH FROM THE NAMED CURRENTS, AND THE LAYER WORKS WITHOUT IT. The names
       and their paths are the plate's skeleton and arrive in 160 kB; the field is 870 kB of grid
       behind them. If the grid fails — no DecompressionStream, a truncated file — the named currents
       are still drawn and the panel says the field is missing, rather than the whole layer going
       dark for a file that is an enrichment of it. */
    function loadField(){
      if(field||fieldState==='loading') return Promise.resolve(field);
      const F=FLD(); if(!F){ fieldState='error'; return Promise.resolve(null); }
      const rel=(doc&&doc.field&&doc.field.file)||'data/ocean-currents-field.bin.gz';
      let url; try{ url=new URL(rel,document.baseURI).toString(); }catch(_){ url=rel; }
      fieldState='loading'; render();
      return F.fetchField(url).then(f=>{ field=f; fieldState='ok'; drawFlow(true); render(); return f; })
        .catch(e=>{ fieldState='error'; err=err||((e&&e.message)||String(e)); render(); return null; }); }

    /* the twelve months — ⚠ ONLY when a month is actually chosen (3 MB) */
    function loadMonths(){
      if(months||monthState==='loading') return Promise.resolve(months);
      const F=FLD(); if(!F){ monthState='error'; return Promise.resolve(null); }
      const rel=(doc&&doc.months&&doc.months.file)||'data/ocean-currents-months.bin.gz';
      let url; try{ url=new URL(rel,document.baseURI).toString(); }catch(_){ url=rel; }
      monthState='loading'; render();
      return F.fetchField(url).then(f=>{ months=f; monthState='ok'; drawFlow(true); render(); return f; })
        .catch(e=>{ monthState='error'; render(); return null; }); }

    /* ── which grid is on screen, and how much of it ──────────────────────────────────────────────
       ⚠ THE CAP IS A NUMBER OF MARKS, NOT A ZOOM TABLE, and it is smaller on a phone. What decides
       whether a field of arrows is readable is how many of them are in front of the eye; the same
       zoom shows a hemisphere at one pitch and a bay at another, so a zoom→spacing table answers the
       wrong question. (It is also the whole reason 16× the data costs LESS than #R221's 28,208
       fixed points: the renderer never holds more than `CAP` of them.) */
    const _phone=()=>{ try{ return window.matchMedia('(max-width:768px)').matches; }catch(_){ return false; } };
    function viewBox(){
      let b=null; try{ b=GE().camera.getBounds(); }catch(_){}
      if(!b) return { w:-180, e:180, s:-85, n:85 };
      let w,e,s,n;
      try{ w=b.getWest(); e=b.getEast(); s=b.getSouth(); n=b.getNorth(); }
      catch(_){ try{ w=b[0][0]; s=b[0][1]; e=b[1][0]; n=b[1][1]; }catch(__){ return { w:-180, e:180, s:-85, n:85 }; } }
      if(!isFinite(w)||!isFinite(e)||!isFinite(s)||!isFinite(n)) return { w:-180, e:180, s:-85, n:85 };
      if(e<w) e+=360;
      /* a quarter of the span as margin, so a small pan does not have to rebuild anything */
      const mx=(e-w)*0.28, my=(n-s)*0.28;
      w-=mx; e+=mx; s=Math.max(-86,s-my); n=Math.min(86,n+my);
      if(e-w>=356){ w=-180; e=180; }
      return { w, e, s, n };
    }
    function planeIndex(){ return (month>0&&months)?month-1:0; }
    function planeSource(){ return (month>0&&months)?months:field; }
    /* has the view moved enough that the marks would be different? */
    function boxStale(box,st){
      if(!lastBox||st!==lastStride) return true;
      const g=(planeSource()?planeSource().grid:0.25)*st;
      return Math.abs(box.w-lastBox.w)>g||Math.abs(box.e-lastBox.e)>g
        ||Math.abs(box.s-lastBox.s)>g||Math.abs(box.n-lastBox.n)>g;
    }
    function drawFlow(force){
      const F=FLD(), src=planeSource();
      if(!F||!src||!on) return;
      const box=viewBox();
      const cap=_phone()?4200:9000;
      const st=F.strideFor(src,box,cap);
      if(!force&&!boxStale(box,st)) return;
      lastBox=box; lastStride=st;
      const r=F.arrows(src,planeIndex(),box,cap);
      whenDrawable(()=>{ if(!ensureLayers()) return;
        try{ GE().layers.setSourceData(FSRC,{type:'FeatureCollection',features:r.features}); }catch(_){}
        setVis(ALL,on); });
      /* ⚠ the panel's first line QUOTES these two numbers, so it has to be re-rendered when they
         move — otherwise it keeps reporting the spacing the layer was switched on at while the map
         has been zoomed three levels since. Only when they actually change: `render()` rebuilds the
         list of 108 rows and re-running it on every `moveend` would be the expensive kind of honest. */
      const changed=(_lastCount!==r.features.length||_lastGrid!==r.grid);
      _lastCount=r.features.length; _lastGrid=r.grid;
      if(changed&&panel.shown()) render();
    }
    let _lastCount=0, _lastGrid=0, _flowT=0;
    function flowSoon(){ if(!on) return; clearTimeout(_flowT); _flowT=setTimeout(()=>drawFlow(false),120); }
    try{ GE().events.on('moveend',flowSoon); }catch(_){}
    try{ GE().events.on('zoomend',flowSoon); }catch(_){}

    /* the month picker — 0 = the climatological mean, 1…12 = a calendar month */
    function setMonth(m){
      m=Math.max(0,Math.min(12,+m||0));
      if(m===month) return month;
      month=m; picked=picked;
      if(m>0&&!months){ render(); loadMonths(); return month; }
      drawFlow(true); render(); return month;
    }

    const nameOf=(c)=>{ const k={jp:'ja',de:'de',ru:'ru',es:'es'}[HOST.lang]; return (k&&c[k])||c.en||''; };
    const colOf=(c)=>(c.kind==='warm')?COL_WARM:(c.kind==='cold')?COL_COLD:COL_NEUTRAL;

    function draw(){
      if(!doc) return;
      /* width says speed — the same quantity the field's shading says, so the two agree */
      const named=(doc.named||[]).map(c=>({type:'Feature',
        geometry:{type:'LineString',coordinates:c.path},
        properties:{ name:nameOf(c), kind:c.kind, col:colOf(c),
                     /* (#R220) narrower than #R219's 0.8–3.0 because the WIDTH MULTIPLIERS grew: the
                        ribbon is now up to 8 px per unit at z9, so a 3.0 would be a 24 px band across
                        an ocean and the plate would be about the ribbons rather than about the sea. */
                     w:Math.max(0.9,Math.min(2.0,0.85+(c.meanSpeed||0)*2.2)),
                     v:c.meanSpeed||0, vmax:c.maxSpeed||0 }}));
      whenDrawable(()=>{ if(!ensureLayers()) return;
        try{ GE().layers.setSourceData(SRC,{type:'FeatureCollection',features:named}); }catch(_){}
        setVis(ALL,on);
        panel.claim(); });
      drawFlow(true); }

    /* ── the window ─────────────────────────────────────────────────────────────────────────────── */
    const KEY=(col,txt)=>'<div style="display:flex;align-items:center;gap:7px;font-size:11.5px;padding:1.5px 0;">'
      +'<span style="width:22px;height:0;border-top:3px solid '+col+';border-radius:2px;flex:none;"></span>'
      +esc(txt)+'</div>';
    const kindWord=(k)=>k==='warm'?L('warm','暖流','warm','тёплое','cálida')
      :k==='cold'?L('cold','寒流','kalt','холодное','fría')
      :L('zonal','東西流','zonal','зональное','zonal');
    /* ── (#R222) the season ───────────────────────────────────────────────────────────────────────
       ⚠ THE MONTH IS A PROPERTY OF THE PICTURE, NOT OF THE APP CLOCK, and that is deliberate. The
       twelve planes are CLIMATOLOGIES — six years of each calendar month averaged — so "August" here
       means "an average August", not August of the year the time machine happens to be standing in.
       Binding it to the clock would be a claim that this is the ocean of that date, which a mean is
       not (#R219 gave up following the clock for exactly this reason). */
    const MON=()=>[L('Jan','1月','Jan','янв','ene'),L('Feb','2月','Feb','фев','feb'),L('Mar','3月','Mär','мар','mar'),
      L('Apr','4月','Apr','апр','abr'),L('May','5月','Mai','май','may'),L('Jun','6月','Jun','июн','jun'),
      L('Jul','7月','Jul','июл','jul'),L('Aug','8月','Aug','авг','ago'),L('Sep','9月','Sep','сен','sep'),
      L('Oct','10月','Okt','окт','oct'),L('Nov','11月','Nov','ноя','nov'),L('Dec','12月','Dez','дек','dic')];
    const _speedOf=(c)=>{ if(month>0&&c.monthSpeed&&c.monthSpeed[month-1]!=null) return c.monthSpeed[month-1];
      return c.meanSpeed||0; };
    const _reverses=(c)=>{ const a=c.monthAlong; if(!a) return false;
      let pos=0,neg=0; for(const v of a){ if(v==null) continue; if(v>0.02) pos++; else if(v<-0.02) neg++; }
      return pos>=2&&neg>=2; };
    function _monthBar(){
      if(!doc||state!=='ok') return '';
      const chip=(sel)=>'padding:2px 6px;border-radius:7px;font-size:10.5px;cursor:pointer;border:1px solid '
        +(sel?'rgba(47,127,224,0.9);background:rgba(47,127,224,0.22);color:var(--text-main);'
             :'var(--glass-border,rgba(128,128,128,0.24));background:transparent;color:var(--text-muted);');
      let s='<div style="display:flex;flex-wrap:wrap;gap:3px;margin-bottom:5px;align-items:center;">'
        +'<button class="oc-m" data-m="0" style="'+chip(month===0)+'">'+esc(L('Mean','年平均','Mittel','Средн.','Media'))+'</button>';
      MON().forEach((n,i)=>{ s+='<button class="oc-m" data-m="'+(i+1)+'" style="'+chip(month===i+1)+'">'+esc(n)+'</button>'; });
      s+='</div>';
      if(monthState==='loading') s+='<div style="font-size:10.5px;color:var(--text-muted);margin-bottom:4px;">'
        +esc(L('Loading the twelve monthly fields…','月別の12枚を読み込み中…','Zwölf Monatsfelder werden geladen…','Загрузка двенадцати месячных полей…','Cargando los doce campos mensuales…'))+'</div>';
      else if(monthState==='error') s+='<div style="font-size:10.5px;color:var(--text-muted);margin-bottom:4px;">⚠ '
        +esc(L('The monthly fields could not be read — the mean is shown.','月別データを読み込めませんでした（年平均を表示）。','Monatsfelder nicht lesbar — Mittel wird gezeigt.','Месячные поля не прочитаны — показано среднее.','No se pudieron leer los campos mensuales — se muestra la media.'))+'</div>';
      return s;
    }
    function render(){
      if(!on&&!panel.shown()) return;
      let head;
      if(state==='loading') head=L('Loading the current atlas…','海流データを読み込み中…','Strömungsatlas wird geladen…','Загрузка атласа течений…','Cargando el atlas de corrientes…');
      else if(state==='error') head='⚠ '+L('The bundled current data could not be read.','同梱の海流データを読み込めませんでした。','Mitgelieferte Strömungsdaten nicht lesbar.','Не удалось прочитать данные.','No se pudieron leer los datos incluidos.');
      else if(!doc) head='';
      else head=(doc.named||[]).length+' '+L('named currents · ','本の海流 · ','benannte Strömungen · ','названных течений · ','corrientes con nombre · ')
        +(fieldState==='loading'?L('field loading…','流向の場を読み込み中…','Feld wird geladen…','поле загружается…','cargando el campo…')
         :fieldState==='error'?L('the field grid could not be read','流向の場を読み込めませんでした','Feldgitter nicht lesbar','поле не прочитано','no se pudo leer el campo')
         :field?((_lastCount||0).toLocaleString()+' '+L('field arrows at ','点の流向（','Feldpfeile bei ','стрелок поля, ','flechas de campo a ')
                 +(_lastGrid?(_lastGrid<1?_lastGrid.toFixed(2):_lastGrid.toFixed(0)):'?')+'°'+L('','間隔）','','','')
                 +' · '+((doc.field&&doc.field.cells)||0).toLocaleString()+' '+L('measured cells','実測セル','gemessene Zellen','измеренных ячеек','celdas medidas'))
         :'');
      /* (#R221) the row now carries the two numbers the rebuild made real: how LONG the current is
         (the old data's Canary Current was a 369 km stub of a 3,000 km current, and only a length
         shows that) and its measured temperature contrast, which is what warm/cold now means. */
      const list=(doc&&doc.named||[]).slice()
        .sort((a,b)=>(b.meanSpeed||0)-(a.meanSpeed||0))
        .map(c=>'<div class="oc-row" data-en="'+esc(c.en)+'" style="display:flex;justify-content:space-between;gap:8px;padding:2.5px 0;border-bottom:1px solid var(--glass-border,rgba(128,128,128,0.16));font-size:11.5px;cursor:pointer;'
          +((picked&&picked===c.en)?'background:rgba(47,127,224,0.14);border-radius:5px;':'')+'">'
          +'<span style="color:'+colOf(c)+';white-space:nowrap;">'+esc(kindWord(c.kind))
          +((c.sstAnomK!=null)?('<span style="opacity:0.72;font-size:10px;"> '+(c.sstAnomK>0?'+':'')+c.sstAnomK.toFixed(1)+'K</span>'):'')+'</span>'
          +'<span style="flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+esc(nameOf(c))
          /* (#R222) a current whose flow along its OWN path changes sign between months is one that
             reverses — the monsoon system, and a fact about the current rather than about the month
             being shown, so it is marked whichever month is up. */
          +(_reverses(c)?'<span title="'+esc(L('reverses with the season','季節で流向が反転する','kehrt sich saisonal um','меняет направление по сезону','se invierte con la estación'))+'" style="opacity:.8;"> ⇄</span>':'')+'</span>'
          +((c.lengthKm)?('<span style="white-space:nowrap;color:var(--text-muted);font-size:10.5px;">'+Math.round(c.lengthKm).toLocaleString()+' km</span>'):'')
          +'<b style="white-space:nowrap;">'+_speedOf(c).toFixed(2)+' m/s</b></div>').join('');
      const b=panel.open('<div style="font-size:11.5px;color:var(--text-main);margin-bottom:4px;">'+esc(head)+'</div>'
        +_monthBar()
        +'<div style="max-height:34vh;overflow:auto;">'+list+'</div>'
        +'<div style="margin-top:6px;">'
        /* (#R221) the legend says what the colour now MEANS — a measured temperature contrast — and
           not what it used to be derived from (the sign of the flow's poleward component). */
        +KEY(COL_WARM,L('Warm current — measurably warmer than the sea at the same latitude','暖流 — 同じ緯度の海より実測で暖かい流れ','Warme Strömung — messbar wärmer als das Meer derselben Breite','Тёплое течение — теплее моря на той же широте','Corriente cálida — más cálida que el mar de su latitud'))
        +KEY(COL_COLD,L('Cold current — measurably colder than the sea at the same latitude','寒流 — 同じ緯度の海より実測で冷たい流れ','Kalte Strömung — messbar kälter','Холодное течение — холоднее','Corriente fría — más fría'))
        +KEY(COL_NEUTRAL,L('Zonal — within ±0.6 K of the sea it flows through','東西流 — 周囲の海と ±0.6 K 以内','Zonal — innerhalb ±0,6 K','Зональное — в пределах ±0,6 K','Zonal — dentro de ±0,6 K'))
        +'<div style="display:flex;align-items:center;gap:7px;font-size:11.5px;padding:1.5px 0;">'
        +'<span style="width:22px;height:9px;border-radius:2px;flex:none;background:linear-gradient(90deg,#9fc6e8,#2f7fe0,#0a2f78);"></span>'
        +esc(L('Field arrows: shading is the measured speed (0 → 1.4 m/s)','流向の矢印：濃さは実測の流速（0 → 1.4 m/s）','Pfeile: Farbe = gemessene Geschwindigkeit','Стрелки: цвет — измеренная скорость','Flechas: el color es la velocidad medida'))+'</div>'
        /* (#R222) two sentences the reader needs when the spacing changes under them, and when a
           month is chosen: what decides the spacing, and what a month IS. */
        +'<div style="font-size:10.5px;color:var(--text-muted);line-height:1.5;margin-top:3px;">'
        +esc(L('The spacing follows the view — zoom in and the same measured grid is drawn finer, down to its own 0.25° (~28 km).',
               '矢印の間隔は表示範囲に追随します。拡大すれば同じ実測格子がより細かく描かれ、提供元と同じ 0.25°（約28 km）まで下がります。',
               'Der Abstand folgt dem Ausschnitt — beim Hineinzoomen wird dasselbe gemessene Gitter feiner gezeichnet, bis 0,25° (~28 km).',
               'Шаг стрелок следует за видом — при увеличении та же измеренная сетка рисуется мельче, вплоть до 0,25° (~28 км).',
               'El espaciado sigue a la vista — al acercarse, la misma malla medida se dibuja más fina, hasta 0,25° (~28 km).'))
        +' '+esc(L('A month is a CLIMATOLOGY of that calendar month (six years averaged), not that month of a particular year.',
               '「月」は暦月の気候値（6年分の平均）です。特定の年のその月ではありません。',
               'Ein Monat ist die Klimatologie dieses Kalendermonats (sechs Jahre gemittelt), nicht dieser Monat eines bestimmten Jahres.',
               '«Месяц» — климатология этого календарного месяца (среднее за шесть лет), а не месяц конкретного года.',
               'Un mes es la climatología de ese mes natural (media de seis años), no ese mes de un año concreto.'))
        +'</div>'
        +'</div>'
        +'<div style="margin-top:6px;font-size:9.5px;color:var(--text-muted);line-height:1.5;">'
        +esc(L('Sources: NOAA CoastWatch blended sea-surface geostrophic currents from multi-mission satellite altimetry (0.25°); NOAA NCEI blended wind stress, turned into the Ekman surface current by the drifter-fitted relation of Ralph & Niiler (1999); and NOAA OISST v2.1 sea-surface temperature. All U.S. Government works in the public domain; altimetric products generated using AVISO+. This layer is a FIXED dataset that ships with the app: a climatological mean of fields spread across the whole record, on the source\'s own 0.25° grid, with each named current traced through that measured field from a published seed on its core. Warm / cold / zonal is MEASURED, not asserted — it is the current\'s own temperature against the zonal mean at the same latitude. Because it is a mean, it does not follow the app clock: it is the climatological picture, the same every time you open it.',
             '出典: NOAA CoastWatch の海面地衡流（複数衛星の高度計をブレンド、0.25°）、NOAA NCEI の海上風応力（Ralph & Niiler 1999 の漂流ブイ実測式でエクマン流に換算）、および NOAA OISST v2.1 の海面水温。いずれも米国政府作成物でパブリックドメイン（高度計プロダクトは AVISO+ を使用）。このレイヤーはアプリに同梱された固定データです：記録全体にわたる多数の場を平均した気候値を、提供元と同じ 0.25° 格子のまま作り、各海流はその実測の場を、公表されている核の位置から積分して辿ったものです。暖流・寒流・東西流は決めつけではなく実測です——その海流自身の水温を、同じ緯度の帯平均と比べて判定しています。平均場なので時計には追随しません——いつ開いても同じ、気候学的な海流図です。',
             'Quellen: NOAA CoastWatch (geostrophische Oberflächenströmung aus Multi-Missions-Altimetrie, 0.25°), NOAA NCEI Windschub → Ekman-Strömung nach Ralph & Niiler (1999), NOAA OISST v2.1 Meeresoberflächentemperatur. Gemeinfrei. Mitgelieferter, fester Datensatz: ein klimatologisches Mittel über den gesamten Zeitraum auf dem 0.25°-Gitter der Quelle. Warm/kalt/zonal wird GEMESSEN (Temperatur gegen das zonale Mittel derselben Breite). Ein Mittelfeld folgt der Uhr nicht.',
             'Источники: NOAA CoastWatch (геострофические поверхностные течения по мультимиссионной альтиметрии, 0.25°), NOAA NCEI (напряжение ветра → экмановское течение по Ralph & Niiler, 1999), NOAA OISST v2.1 (температура поверхности). Общественное достояние. Фиксированный набор данных в составе приложения: климатическое среднее за весь период на сетке 0.25° самого источника. Тёплое/холодное/зональное ИЗМЕРЕНО — температура течения против зонального среднего на той же широте. Среднее поле не следует за часами.',
             'Fuentes: NOAA CoastWatch (corrientes geostróficas superficiales por altimetría multimisión, 0.25°), NOAA NCEI (tensión del viento → corriente de Ekman según Ralph y Niiler, 1999) y NOAA OISST v2.1 (temperatura superficial). Dominio público. Conjunto fijo incluido en la app: una media climatológica de todo el registro en la propia malla de 0.25°. Cálida/fría/zonal se MIDE — la temperatura de la corriente frente a la media zonal de su misma latitud. Una media no sigue al reloj.'))
        +'</div>');
      if(b) b.querySelectorAll('.oc-row').forEach(r=>{ r.onclick=()=>flyTo(r.getAttribute('data-en')); });
      if(b) b.querySelectorAll('.oc-m').forEach(r=>{ r.onclick=()=>setMonth(+r.getAttribute('data-m')||0); });
    }

    /* tapping a row (or the line itself) goes to that current — the list is a way INTO the map */
    function flyTo(en){
      const c=(doc&&doc.named||[]).find(x=>x.en===en); if(!c||!c.path||!c.path.length) return;
      picked=en; render();
      let W2=180,E2=-180,S2=90,N2=-90;
      c.path.forEach(p=>{ if(p[0]<W2)W2=p[0]; if(p[0]>E2)E2=p[0]; if(p[1]<S2)S2=p[1]; if(p[1]>N2)N2=p[1]; });
      try{ GE().camera.fitBounds([[W2,S2],[E2,N2]],{padding:70,duration:900,maxZoom:5}); }catch(_){}
    }

    function toggle(v){
      on=!!v;
      if(!on){ panel.hide(); setVis(ALL,false); picked=null; return; }
      render();
      whenDrawable(()=>{ ensureLayers(); if(doc){ draw(); } else load(); });
    }

    /* a basemap swap drops every added layer AND every registered image — put both back (#R72) */
    try{ GE().events.on('styledata',()=>{ setTimeout(()=>{ if(!on) return;
      whenDrawable(()=>{ iconDone=false; if(ensureLayers()) draw(); }); },90); }); }catch(_){}
    try{ GE().events.onLayer('click',LINE,(e)=>{ const f=e&&e.features&&e.features[0];
      if(!f||!f.properties) return;
      const nm=f.properties.name; const c=(doc&&doc.named||[]).find(x=>nameOf(x)===nm);
      if(c){ picked=c.en; render(); } }); }catch(_){}
    window.addEventListener('intmap-lang',()=>setTimeout(()=>{ if(on&&doc){ draw(); render(); }
      const e=document.getElementById('wp-dl-currents-lbl');
      if(e) e.textContent=L('Ocean currents','海流','Meeresströmungen','Морские течения','Corrientes marinas'); },20));

    /* the layer row, under the same "World data" heading the other families use */
    function buildUI(){
      const dd=ensureHead(); if(!dd) return;
      const cb=row(dd,'wp-dl-currents',L('Ocean currents','海流','Meeresströmungen','Морские течения','Corrientes marinas'),'#2f7fe0');
      if(!cb||cb.__ocWired) return; cb.__ocWired=true;
      cb.addEventListener('change',e=>{ const r=e.target.closest('.lyr-row'); if(r) r.classList.toggle('on',e.target.checked);
        try{ toggle(e.target.checked); }catch(err2){ console.warn('oceanCurrents toggle',err2); } }); }
    if(document.readyState!=='loading') setTimeout(buildUI,0); else document.addEventListener('DOMContentLoaded',buildUI);

    return { toggle, flyTo, load, setMonth, month:()=>month,
      set:(v)=>{ const cb=document.getElementById('wp-dl-currents'); if(cb){ cb.checked=!!v; cb.dispatchEvent(new Event('change',{bubbles:true})); } else toggle(!!v); return !!v; },
      /* ⚠ `points` keeps its #R216 meaning — "how many measurements are on screen" — which for a
         bundled field is the arrow count. `lines` is the named currents. A caller reading either
         still gets a count of measurements rather than a renamed field. */
      state:()=>({ on, state, err,
        bundled:true, source:doc?doc.source:null, built:doc?doc.built:null,
        lines:doc?(doc.named||[]).length:0,
        /* (#R222) the field is a GRID now, so there are three numbers where there was one:
           how many cells the file measures, how many marks are on screen, and at what spacing. */
        field:fieldState, cells:(doc&&doc.field&&doc.field.cells)||0,
        gridDeg:field?field.grid:null, drawnGridDeg:_lastGrid||null,
        month, months:monthState, monthsBytes:(doc&&doc.months&&doc.months.bytes)||0,
        points:_lastCount||0,
        warm:doc?(doc.named||[]).filter(c=>c.kind==='warm').length:0,
        cold:doc?(doc.named||[]).filter(c=>c.kind==='cold').length:0,
        zonal:doc?(doc.named||[]).filter(c=>c.kind==='zonal').length:0,
        vertices:doc?(doc.named||[]).reduce((n,c)=>n+(c.path||[]).length,0):0,
        picked,
        top:doc?(doc.named||[]).slice().sort((a,b)=>(b.meanSpeed||0)-(a.meanSpeed||0)).slice(0,3)
              .map(c=>({en:c.en,kind:c.kind,v:c.meanSpeed})):[] }) };
  })();
};
