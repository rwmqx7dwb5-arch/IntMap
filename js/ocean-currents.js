/* ============================================================================
 *  IntMap · Ocean currents — a FLOW FIELD, drawn as streamlines  (#R218, replacing #R216)
 * ----------------------------------------------------------------------------
 *  「海流レイヤー、思ってたのと違う。ちゃんとレイヤーとして地図上に描画してください。作り直せ。」
 *  Confirmed this round: the wanted picture is streamlines over the whole sea in view — an atlas's
 *  ocean-current plate — not arrows standing on their own.
 *
 *  ══ WHAT #R216 DREW, AND WHY IT WAS NOT A LAYER ══════════════════════════════════════════════════
 *  #R216 sampled at most 24 points of the viewport and drew ONE arrow at each. Every number in it was
 *  real, and it is still the same data here — but 24 unconnected glyphs is a set of readings, not a
 *  field. Nothing in it said where the water GOES: two neighbouring arrows could belong to the same
 *  current or to two different ones and the picture could not tell you which. That is the whole of
 *  「思ってたのと違う」, and it is a rendering problem, not a data problem.
 *
 *  ══ WHAT IT DRAWS NOW ════════════════════════════════════════════════════════════════════════════
 *
 *  · THE FIELD — Open-Meteo Marine (`ocean_current_velocity`, `ocean_current_direction`,
 *    `sea_surface_temperature`), the same keyless, ACAO-* model js/world-packs.js uses for the tides.
 *    A grid covering the view is asked for in ONE request (the API takes comma-separated coordinates
 *    and answers with an array — measured: 120 points, 1.6 s). Cells the bundled land mask calls land
 *    are not asked about and stay empty. Velocity is km/h; direction is the direction the water flows
 *    TOWARD (#R216 verified that against the Kuroshio at 35 N 141 E and the Agulhas at 35 S 20 E), so
 *    east = v·sin(dir) and north = v·cos(dir).
 *
 *  · THE STREAMLINES — the grid is bilinearly interpolated into a continuous field and integrated
 *    with a 4th-order Runge–Kutta step from each seed, FORWARDS and BACKWARDS, so one polyline is a
 *    path the water actually takes rather than a mark at a point. The field is normalised to unit
 *    speed before integrating, which makes the step a DISTANCE rather than a time — the geometry of a
 *    streamline does not depend on how fast the water moves along it, only on which way it points,
 *    and a fixed distance step is what keeps the polyline's vertices evenly spaced whether it is
 *    crossing the Gulf of Guinea or the Kuroshio.
 *    ⚠ Seeds are spaced by the standard evenly-spaced-streamlines rule (Jobard & Lefer 1997): a seed
 *    is rejected if it is within d_sep of a line already drawn, and a line stops if it comes within
 *    d_test of one. Without it, every seed inside a strong current traces the SAME line and the map
 *    is a bundle of duplicates over an empty sea.
 *    ⚠ A line stops at the coast, at the edge of the padded grid, where the model has no answer, and
 *    where the water is slower than 0.05 km/h. It is never extended past a cell it has no value for:
 *    interpolation only ever averages values the model published, with the weights renormalised over
 *    the corners that have one.
 *
 *  · WARM OR COLD — measured, not assumed, exactly as #R216 established. 暖流 / 寒流 is a statement
 *    about what the water CARRIES, so each line is compared with the sea-surface temperature about
 *    110 km UPSTREAM along ITS OWN PATH — which this version actually has, because it integrated that
 *    path. Upstream warmer than here → the current is bringing warmth → red; upstream colder → blue.
 *    ⚠ WHERE THE DIFFERENCE IS INSIDE THE MODEL'S OWN NOISE (< 0.25 K) THE LINE IS GREY and the
 *    legend says «neither» — a current that is not carrying a temperature contrast must not be
 *    coloured as though it were. That is 「適当に fabricate するな」 in this layer.
 *
 *  · THE NAMES — Wikidata (CC0): every item that is an ocean current (Q129558, including subclasses)
 *    with a coordinate (P625), labelled in all five UI languages. A label is a POINT at the
 *    coordinate Wikidata publishes; it does not claim that the line beside it is that current.
 *
 *  ⚠ NOTHING IN THIS FILE SHIPS A CURRENT. There is no bundled table of «the world's major currents»
 *  with hand-drawn paths and hand-assigned colours, which is what this layer would be if it were
 *  faked. Every vertex is an integration of model values for the instant on the app clock.
 * ==========================================================================*/
window.IntMapModules=window.IntMapModules||{};
window.IntMapModules.oceanCurrents=function(HOST){
  const GE=()=>window.IntMapGeoEngine;

  window.IntMapCurrents=(function(){
    if(!GE().hasRenderer()) return { state:()=>({on:false}) };
    /* the shared layer-family toolkit (#R213) — the same panel, row, legend and clock every other
       World-data layer uses. If world-packs has not registered, this module does not build. */
    const W=(window.IntMapWorld&&window.IntMapWorld._ui)||null;
    if(!W) return { state:()=>({on:false,err:'world-packs not loaded'}) };
    const { makePanel, ensureHead, row, esc, whenDrawable, setVis, L, onYear } = W;

    const SRC='oc-src', LINE='oc-line', HEAD='oc-head', LBL='oc-label', NAME='oc-name-src', NAMELYR='oc-name';
    const MARINE='https://marine-api.open-meteo.com/v1/marine';
    const WDQS='https://query.wikidata.org/sparql';

    /* the two colours the request names, plus the honest third one */
    const COL_WARM='#ff453a', COL_COLD='#2f7fe0', COL_NEUTRAL='#9aa0a6';
    const DT_MIN=0.25;                     /* K — below this the sign is model noise, not a current */
    const UPSTREAM_KM=110;                 /* one degree of latitude: far enough to leave the cell */
    const V_MIN=0.05;                      /* km/h — slower than this is not a current, it is a rounding */
    const MAX_PTS=150;                     /* one request's grid; measured at 120 points / 1.6 s */

    let on=false, busy=false, gridKey='', lines=[], field=null, names=null, namesState='idle', err=null;

    const panel=makePanel('oc-panel',()=>'🌊 '+L('Ocean currents','海流','Meeresströmungen','Морские течения','Corrientes marinas'),'wp-dl-currents',
      { legendId:'wpcurrents', layers:()=>[LINE,HEAD,LBL,NAMELYR],
        names:()=>({en:'🌊 Ocean currents',jp:'🌊 海流（暖流・寒流）',de:'🌊 Meeresströmungen',ru:'🌊 Морские течения',es:'🌊 Corrientes marinas'}) });

    /* ── the arrowhead, drawn once and registered as an image the symbol layer places along a line ──
       ⚠ IT POINTS RIGHT, NOT UP. With `symbol-placement:'line'` the renderer rotates an icon to the
       LINE's own bearing and treats the icon's +x as forward, so an arrow drawn pointing north comes
       out 90° off at every vertex. (#R216's arrow pointed up because it was placed at a point and
       rotated by `icon-rotate` from the data; that layer no longer exists.)
       ⚠ SDF uses the ALPHA channel only, which is what lets one image serve warm, cold and neutral
       through `icon-color` — so the outline is drawn in white too. */
    let iconDone=false;
    function ensureIcon(){
      if(iconDone) return true;
      try{
        const S=48, cv=document.createElement('canvas'); cv.width=S; cv.height=S;
        const c=cv.getContext('2d');
        c.translate(S/2,S/2);
        c.beginPath();
        c.moveTo(19,0); c.lineTo(-11,13); c.lineTo(-5,0); c.lineTo(-11,-13); c.closePath();
        c.fillStyle='#ffffff'; c.fill();
        c.lineWidth=2.0; c.strokeStyle='#ffffff'; c.stroke();
        /* ⚠ `getImageData` IS NOT TRANSFORMED (#R216). It reads raw bitmap pixels, so asking for
           (−S/2, −S/2) after `translate(S/2, S/2)` reads from outside the canvas and hands back a
           fully TRANSPARENT block — which registers happily and then draws nothing at all.
           ⚠ IT IS `scene`, NOT `layers` (#R216). The renderer contract puts images beside the sky and
           the terrain (js/geo-engine.js); `GE().layers.addImage` is simply undefined. */
        const d=c.getImageData(0,0,S,S);
        if(!GE().scene.hasImage('oc-arrow-img'))
          GE().scene.addImage('oc-arrow-img',{width:S,height:S,data:new Uint8Array(d.data.buffer)},{sdf:true});
        iconDone=GE().scene.hasImage('oc-arrow-img');
      }catch(_){ iconDone=false; }
      return iconDone; }

    function ensureLayers(){
      if(!_canDraw()) return false;
      try{
        ensureIcon();
        if(!GE().layers.hasSource(SRC)) GE().layers.addSource(SRC,{type:'geojson',data:{type:'FeatureCollection',features:[]}});
        if(!GE().layers.hasSource(NAME)) GE().layers.addSource(NAME,{type:'geojson',data:{type:'FeatureCollection',features:[]}});
        /* the streamline itself: colour is the measured warm/cold/neither, width is the speed */
        if(!GE().layers.has(LINE)) GE().layers.add({id:LINE,type:'line',source:SRC,
          layout:{visibility:'none','line-cap':'round','line-join':'round'},
          paint:{'line-color':['get','col'],
            'line-width':['interpolate',['linear'],['zoom'],1,['*',1.1,['get','w']],5,['*',2.2,['get','w']],9,['*',3.4,['get','w']]],
            'line-opacity':0.9,'line-blur':0.25}});
        /* the arrowheads, placed ALONG the line by the renderer — one image, tinted per feature */
        if(!GE().layers.has(HEAD)) GE().layers.add({id:HEAD,type:'symbol',source:SRC,layout:{visibility:'none',
          'symbol-placement':'line','symbol-spacing':['interpolate',['linear'],['zoom'],1,60,6,110],
          'icon-image':'oc-arrow-img','icon-size':['interpolate',['linear'],['zoom'],1,0.26,6,0.42],
          'icon-rotation-alignment':'map','icon-allow-overlap':true,'icon-ignore-placement':true,'icon-padding':0},
          paint:{'icon-color':['get','col'],'icon-opacity':0.95}});
        /* the speed, once per line, so a line is a measurement and not a decoration */
        if(!GE().layers.has(LBL)) GE().layers.add({id:LBL,type:'symbol',source:SRC,minzoom:3.4,layout:{visibility:'none',
          'symbol-placement':'line-center','text-field':['get','lbl'],'text-size':window.IntMapLabelScale.sub(0.78),
          'text-offset':[0,1.0],'text-allow-overlap':false,'text-optional':true},
          paint:{'text-color':'#dff2ff','text-halo-color':'rgba(0,20,36,0.9)','text-halo-width':1.4}});
        if(!GE().layers.has(NAMELYR)) GE().layers.add({id:NAMELYR,type:'symbol',source:NAME,layout:{visibility:'none',
          'text-field':['get','name'],'text-size':window.IntMapLabelScale.sub(1.0),
          'text-allow-overlap':false,'text-optional':true,'text-max-width':9},
          paint:{'text-color':'#ffe9a8','text-halo-color':'rgba(0,18,32,0.92)','text-halo-width':1.6}});
        return true;
      }catch(_){ return false; } }
    function _canDraw(){ try{ return !!HOST.canDraw(); }catch(_){ try{ return !!GE().ready(); }catch(__){ return false; } } }

    /* ══ the grid ════════════════════════════════════════════════════════════════════════════════
       A padded box round the view, so a streamline that leaves the screen has field to walk into for
       a while instead of stopping at the frame. Land cells are never requested — the bundled mask
       answers that without a fetch — and they stay empty, which is what makes a line stop at a coast. */
    function planGrid(){
      let b; try{ b=GE().camera.getBounds(); }catch(_){ return null; }
      if(!b) return null;
      let Wb=b.getWest(), Eb=b.getEast(), S=b.getSouth(), N=b.getNorth();
      if(Eb<=Wb) Eb+=360;                                  /* the antimeridian is a seam, not a wall */
      if(Eb-Wb>350){ Wb=-180; Eb=180; }
      const padX=(Eb-Wb)*0.16, padY=(N-S)*0.16;
      Wb-=padX; Eb+=padX; S=Math.max(-78,S-padY); N=Math.min(84,N+padY);
      if(!(Eb>Wb&&N>S)) return null;
      /* keep the cells roughly square ON THE GROUND, then trim to the request budget */
      const midCos=Math.max(0.18,Math.cos((N+S)/2*Math.PI/180));
      let NX=14, NY=Math.max(4,Math.round(NX*(N-S)/((Eb-Wb)*midCos)));
      NY=Math.min(14,NY);
      while(NX*NY>MAX_PTS){ if(NX>=NY) NX--; else NY--; }
      return { W:Wb, E:Eb, S, N, NX, NY, dx:(Eb-Wb)/(NX-1), dy:(N-S)/(NY-1) };
    }
    function isSea(lo,la){
      try{ const LM=window.IntMapLandMask;
        if(LM&&LM.ready&&LM.ready()) return LM.isLand(((lo+180)%360+360)%360-180,la)!==true; }catch(_){}
      return true;                                          /* no mask → ask; the model answers null on land */
    }

    function whenMs(){ try{ const st=window.IntMapTime.state(); return st.isLive?Date.now():+new Date(st.when); }catch(_){ return Date.now(); } }
    const isoDay=(ms)=>new Date(ms).toISOString().slice(0,10);

    /* one multi-point request; `vars` picks which hourly fields come back */
    async function marine(pts,ms,vars){
      if(!pts.length) return [];
      const u=MARINE+'?latitude='+pts.map(p=>p[1].toFixed(3)).join(',')+'&longitude='+pts.map(p=>p[0].toFixed(3)).join(',')
        +'&hourly='+vars.join(',')+'&timezone=UTC&start_date='+isoDay(ms)+'&end_date='+isoDay(ms);
      const r=await fetch(u); if(!r.ok) throw new Error('marine '+r.status);
      const j=await r.json();
      return Array.isArray(j)?j:[j]; }
    /* the model's value at the hour on the clock (its series is hourly and starts at 00 UTC) */
    function atHour(o,key,ms){
      const h=o&&o.hourly||{}; const t=h.time||[], v=h[key]||[];
      if(!t.length) return null;
      const want=new Date(ms).toISOString().slice(0,13);
      let ix=t.findIndex(s=>String(s).slice(0,13)===want);
      if(ix<0) ix=Math.min(v.length-1,new Date(ms).getUTCHours());
      const x=v[ix]; return (x==null||!isFinite(x))?null:+x; }

    /* the field, the integrator and the evenly-spaced rule are js/streamline.js — pure arithmetic,
       in its own file so it can be RUN in a test without a browser (#R217's rule, applied again). */
    const SL=()=>window.IntMapStreamline;

    /* ── the fetch, then the field, then the lines ───────────────────────────────────────────────── */
    async function refresh(force){
      if(!on||busy) return;
      let key='';
      try{ const c=GE().camera.getCenter();
        key=[Math.round(GE().camera.getZoom()*2),Math.round(c.lng*3),Math.round(c.lat*3),Math.round(whenMs()/36e5)].join('/'); }catch(_){}
      if(!force&&(!key||key===gridKey)) return;
      gridKey=key; busy=true; err=null; render();
      const rearm=()=>{ gridKey=''; };
      try{
        const ms=whenMs();
        const g=planGrid();
        if(!g){ lines=[]; field=null; busy=false; rearm(); draw(); render(); return; }
        /* which cells to ask about: the sea ones. The index is kept so the answers land back in the
           grid they came from — an array whose order is the request's order (#R217's lesson about
           calling a set-shaped thing element by element applies to the reply too). */
        const ask=[], at=[];
        for(let j=0;j<g.NY;j++) for(let i=0;i<g.NX;i++){
          const lo=g.W+i*g.dx, la=g.S+j*g.dy;
          if(!isSea(lo,la)) continue;
          ask.push([lo,la]); at.push(j*g.NX+i);
        }
        if(!ask.length){ lines=[]; field=null; busy=false; rearm(); draw(); render(); return; }
        const res=await marine(ask,ms,['ocean_current_velocity','ocean_current_direction','sea_surface_temperature']);
        const n=g.NX*g.NY;
        g.u=new Float32Array(n).fill(NaN); g.v=new Float32Array(n).fill(NaN); g.t=new Float32Array(n).fill(NaN);
        let got=0;
        res.forEach((o,i)=>{
          const k=at[i]; if(k==null) return;
          const sp=atHour(o,'ocean_current_velocity',ms), dir=atHour(o,'ocean_current_direction',ms);
          const sst=atHour(o,'sea_surface_temperature',ms);
          if(sst!=null) g.t[k]=sst;
          if(sp==null||dir==null) return;
          const th=dir*Math.PI/180;                        /* the direction the water flows TOWARD */
          g.u[k]=sp*Math.sin(th); g.v[k]=sp*Math.cos(th); got++;
        });
        field=g;
        lines=(got>0)?buildLines(g):[];
      }catch(e){ err=(e&&e.message)||String(e); lines=[]; field=null; rearm(); }
      busy=false; draw(); render(); }

    /* ── seeds → streamlines → warm/cold ─────────────────────────────────────────────────────────── */
    function buildLines(g){
      const S=SL(); if(!S) return [];
      const sample=S.sampler(g);
      const spanKm=(g.E-g.W)*S.KM_PER_DEG_LNG*S.cosLat((g.N+g.S)/2);
      const cellKm=spanKm/Math.max(1,g.NX-1);
      const hKm=Math.max(6,cellKm/3.2);                    /* the step: a third of a cell */
      const dSep=Math.max(cellKm*0.62,hKm*2.4);            /* how far apart two lines must stay */
      const maxSteps=Math.round(Math.min(90,Math.max(24,cellKm*7/hKm)));
      const near=S.spacingIndex(dSep);
      const opt=(sign)=>({ sign, hKm, maxSteps, vMin:V_MIN, bounds:{W:g.W,E:g.E,S:g.S,N:g.N},
        blocked:(lo,la)=>!isSea(lo,la), near, nearLimKm:dSep*0.55 });
      const out=[];
      /* seeds on a denser lattice than the field, ordered from the middle of the view outwards so the
         lines the reader is looking at are the ones that get drawn when the budget runs out */
      const SX=g.NX*2-1, SY=g.NY*2-1;
      const seeds=[];
      for(let j=0;j<SY;j++) for(let i=0;i<SX;i++)
        seeds.push([g.W+i*(g.E-g.W)/(SX-1), g.S+j*(g.N-g.S)/(SY-1)]);
      const cx=(g.W+g.E)/2, cy=(g.S+g.N)/2;
      seeds.sort((a,b)=>((a[0]-cx)**2+(a[1]-cy)**2)-((b[0]-cx)**2+(b[1]-cy)**2));
      for(const s of seeds){
        if(out.length>=34) break;
        if(!isSea(s[0],s[1])) continue;
        if(near.tooClose(s[0],s[1])) continue;
        const here=sample(s[0],s[1]);
        if(!here) continue;
        const v0=Math.hypot(here.u,here.v); if(!(v0>V_MIN)) continue;
        const fwd=S.trace(sample,s,opt(1));
        const back=S.trace(sample,s,opt(-1));
        const pts=back.pts.slice(1).reverse().concat(fwd.pts);
        if(pts.length<4) continue;
        if(fwd.km+back.km<cellKm*0.9) continue;             /* too short to read as a path */
        pts.forEach(p=>near.add(p[0],p[1]));
        /* the classification: this point against the water ~110 km upstream ALONG THIS LINE, which is
           the path just integrated rather than a straight line drawn backwards from the arrow (#R216
           had to approximate it that way because it had no path). */
        const up=S.upstreamAt(back.pts,hKm,UPSTREAM_KM);
        const su=up?sample(up[0],up[1]):null;
        const sstH=here.t, sstU=su?su.t:null;
        const dT=(sstH!=null&&sstU!=null)?(sstU-sstH):null;
        const kind=(dT==null||Math.abs(dT)<DT_MIN)?'neutral':(dT>0?'warm':'cold');
        out.push({ pts, v:v0, sst:sstH, upT:sstU, dT, kind,
                   lat:s[1], lng:s[0], km:Math.round(fwd.km+back.km) });
      }
      return out;
    }

    function draw(){
      const feats=lines.map(a=>({type:'Feature',geometry:{type:'LineString',coordinates:a.pts},
        properties:{ w:Math.max(0.75,Math.min(3.2,0.75+a.v/2.2)),
          col:(a.kind==='warm')?COL_WARM:(a.kind==='cold')?COL_COLD:COL_NEUTRAL,
          lbl:a.v.toFixed(1)+' km/h' }}));
      whenDrawable(()=>{ if(!ensureLayers()) return;
        try{ GE().layers.setSourceData(SRC,{type:'FeatureCollection',features:feats}); }catch(_){}
        drawNames();
        setVis([LINE,HEAD,LBL,NAMELYR],on);
        panel.claim(); }); }

    /* ── the names, from Wikidata, once per session ───────────────────────────────────────────── */
    function nameOf(r){
      const k={jp:'ja',de:'de',ru:'ru',es:'es'}[HOST.lang];
      return (k&&r[k])||r.en||''; }
    function loadNames(){
      if(names||namesState==='loading') return;
      namesState='loading'; render();
      const q='SELECT ?c ?en ?ja ?de ?ru ?es ?coord WHERE {'
        +' ?c wdt:P31/wdt:P279* wd:Q129558 . ?c wdt:P625 ?coord .'
        +' OPTIONAL{ ?c rdfs:label ?en FILTER(lang(?en)="en") }'
        +' OPTIONAL{ ?c rdfs:label ?ja FILTER(lang(?ja)="ja") }'
        +' OPTIONAL{ ?c rdfs:label ?de FILTER(lang(?de)="de") }'
        +' OPTIONAL{ ?c rdfs:label ?ru FILTER(lang(?ru)="ru") }'
        +' OPTIONAL{ ?c rdfs:label ?es FILTER(lang(?es)="es") }'
        +' } LIMIT 400';
      fetch(WDQS+'?format=json&query='+encodeURIComponent(q),
        { headers:{'Accept':'application/sparql-results+json','Api-User-Agent':'IntMap/1.0 (https://github.com/rwmqx7dwb5-arch/IntMap)'} })
        .then(r=>{ if(!r.ok) throw new Error('wdqs '+r.status); return r.json(); })
        .then(j=>{
          const seen=Object.create(null), out=[];
          ((j.results&&j.results.bindings)||[]).forEach(b=>{
            const id=String(b.c.value).split('/').pop();
            if(seen[id]) return; seen[id]=1;
            const m=/Point\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)/.exec(b.coord.value); if(!m) return;
            out.push({ id, lng:+m[1], lat:+m[2],
              en:b.en?b.en.value:'', ja:b.ja?b.ja.value:'', de:b.de?b.de.value:'', ru:b.ru?b.ru.value:'', es:b.es?b.es.value:'' }); });
          names=out; namesState=out.length?'ok':'empty'; drawNames(); render(); })
        .catch(()=>{ names=[]; namesState='error'; render(); }); }
    function drawNames(){
      if(!names||!names.length) return;
      const feats=names.filter(r=>nameOf(r)).map(r=>({type:'Feature',geometry:{type:'Point',coordinates:[r.lng,r.lat]},
        properties:{ name:nameOf(r) }}));
      try{ if(GE().layers.hasSource(NAME)) GE().layers.setSourceData(NAME,{type:'FeatureCollection',features:feats}); }catch(_){} }

    /* ── the window: what the colours mean, what was measured, and where it came from ─────────── */
    const KEY=(col,txt)=>'<div style="display:flex;align-items:center;gap:7px;font-size:11.5px;padding:1.5px 0;">'
      +'<span style="width:22px;height:0;border-top:3px solid '+col+';border-radius:2px;flex:none;"></span>'
      +esc(txt)+'</div>';
    function render(){
      if(!on&&!panel.shown()) return;
      const warm=lines.filter(a=>a.kind==='warm').length, cold=lines.filter(a=>a.kind==='cold').length,
            neu=lines.filter(a=>a.kind==='neutral').length;
      let head;
      if(busy) head=L('Reading the current field…','海流を取得中…','Strömungsfeld wird gelesen…','Чтение течений…','Leyendo las corrientes…');
      else if(err) head='⚠ '+L('The current model could not be fetched.','海流データを取得できませんでした。','Strömungsmodell nicht abrufbar.','Не удалось получить данные.','No se pudieron obtener los datos.');
      else if(!lines.length) head=L('No open water in this view — pan out to a sea.','この表示範囲に外洋がありません。海の見える位置まで移動してください。','Kein offenes Wasser im Bild.','В этом виде нет открытой воды.','No hay mar abierto en esta vista.');
      else head=lines.length+' '+L('streamlines · ','本の流線 · ','Stromlinien · ','линий тока · ','líneas de corriente · ')
        +warm+' '+L('warm','暖流','warm','тёплых','cálidas')+' / '+cold+' '+L('cold','寒流','kalt','холодных','frías')
        +(neu?(' / '+neu+' '+L('neither','どちらでもない','weder noch','ни то ни другое','ninguna')):'');
      const rows=lines.slice().sort((a,b)=>b.v-a.v).slice(0,6).map(a=>
        '<div style="display:flex;justify-content:space-between;gap:8px;padding:2px 0;border-bottom:1px solid var(--glass-border,rgba(128,128,128,0.16));font-size:11.5px;">'
        +'<span style="color:'+((a.kind==='warm')?COL_WARM:(a.kind==='cold')?COL_COLD:COL_NEUTRAL)+';">'
        +(a.kind==='warm'?L('warm','暖流','warm','тёплое','cálida'):a.kind==='cold'?L('cold','寒流','kalt','холодное','fría'):L('—','—','—','—','—'))+'</span>'
        +'<span style="opacity:.75;">'+a.lat.toFixed(1)+', '+(((a.lng+180)%360+360)%360-180).toFixed(1)+'</span>'
        +'<b>'+a.v.toFixed(1)+' km/h</b>'
        +'<span style="opacity:.75;white-space:nowrap;">'+(a.sst!=null?a.sst.toFixed(1)+'°':'—')
        +(a.dT!=null?(' <span style="opacity:.8;">('+(a.dT>0?'+':'')+a.dT.toFixed(1)+' K)</span>'):'')+'</span></div>').join('');
      const nm=(namesState==='loading')?L('Loading current names…','海流名を取得中…','Namen werden geladen…','Загрузка названий…','Cargando nombres…')
        :(namesState==='error')?('⚠ '+L('The names could not be fetched from Wikidata.','Wikidata から海流名を取得できませんでした。','Namen nicht abrufbar.','Не удалось получить названия.','No se pudieron obtener los nombres.'))
        :(names&&names.length)?(names.length+' '+L('named currents from Wikidata','件の海流名（Wikidata）','benannte Strömungen (Wikidata)','названий (Wikidata)','corrientes con nombre (Wikidata)')):'';
      panel.open('<div style="font-size:11.5px;color:var(--text-main);margin-bottom:4px;">'+esc(head)+'</div>'
        +rows
        +'<div style="margin-top:6px;">'
        +KEY(COL_WARM,L('Warm current — the water upstream is warmer than here','暖流 — 上流側の海面水温がこの地点より高い','Warme Strömung','Тёплое течение','Corriente cálida'))
        +KEY(COL_COLD,L('Cold current — the water upstream is colder than here','寒流 — 上流側の海面水温がこの地点より低い','Kalte Strömung','Холодное течение','Corriente fría'))
        +KEY(COL_NEUTRAL,L('Neither — the difference is under 0.25 K, which is inside the model’s noise','どちらでもない — 差が 0.25 K 未満（モデルの誤差の範囲）','Weder noch (< 0,25 K)','Ни то ни другое (< 0,25 K)','Ninguna (< 0,25 K)'))
        +'</div>'
        +(nm?('<div style="margin-top:5px;font-size:10.5px;color:var(--text-muted);">'+esc(nm)+'</div>'):'')
        +'<div style="margin-top:6px;font-size:9.5px;color:var(--text-muted);line-height:1.5;">'
        +esc(L('Each line is a STREAMLINE: the path the water takes, integrated (4th-order Runge–Kutta) through the Open-Meteo Marine velocity field for the instant on the app clock. Line width is the speed and the arrowheads say which way it goes. A line stops at a coast, at the edge of the grid, or where the model has no value — nothing is drawn past what was measured. Warm or cold is measured, not assumed: each line is compared with the sea-surface temperature ~110 km upstream ALONG ITS OWN PATH, because a warm current is one that brings warmer water. Names are Wikidata (CC0), drawn at the coordinate published for each current.',
             '1本の線は「流線」です——アプリの時計の時刻の Open-Meteo Marine の速度場を4次のルンゲ＝クッタ法で積分した、水が実際に辿る道筋。太さは流速、線上の矢印が向きです。線は海岸・格子の端・モデルに値が無い所で止まります（測っていない先は描きません）。暖流・寒流は決めつけではなく実測で、各線をその流路に沿って約110km上流の海面水温と比べています（暖流とは「より暖かい水を運ぶ流れ」だからです）。名称は Wikidata（CC0）で、各海流に公開されている座標に表示しています。',
             'Jede Linie ist eine Stromlinie: der Weg des Wassers, mit Runge-Kutta 4. Ordnung durch das Geschwindigkeitsfeld von Open-Meteo Marine integriert. Breite = Geschwindigkeit, Pfeile = Richtung. Warm/kalt wird gegen die Temperatur ~110 km stromaufwärts auf demselben Weg gemessen. Namen: Wikidata (CC0).',
             'Каждая линия — линия тока: путь воды, проинтегрированный методом Рунге—Кутты 4-го порядка через поле скоростей Open-Meteo Marine. Толщина — скорость, стрелки — направление. Тёплое/холодное определяется по температуре ~110 км выше по течению вдоль того же пути. Названия: Wikidata (CC0).',
             'Cada línea es una línea de corriente: el camino del agua, integrado con Runge-Kutta de cuarto orden por el campo de velocidades de Open-Meteo Marine. El grosor es la velocidad y las flechas el sentido. Cálida o fría se mide contra la temperatura ~110 km aguas arriba por ese mismo camino. Nombres: Wikidata (CC0).'))
        +'</div>'); }

    function toggle(v){
      on=!!v;
      if(!on){ panel.hide(); setVis([LINE,HEAD,LBL,NAMELYR],false); lines=[]; field=null; gridKey=''; return; }
      render(); loadNames();
      whenDrawable(()=>{ ensureLayers(); gridKey=''; refresh(true); });
      try{ HOST.imToast(L('Reading the ocean currents in view…','表示範囲の海流を取得しています…','Strömungen im Bild werden gelesen…','Читаю течения в этом виде…','Leyendo las corrientes de esta vista…')); }catch(_){} }

    try{ GE().events.on('moveend',()=>{ if(on) setTimeout(()=>refresh(false),200); }); }catch(_){}
    /* a basemap swap drops every added layer AND every registered image — put both back (#R72) */
    try{ GE().events.on('styledata',()=>{ setTimeout(()=>{ if(!on) return;
      whenDrawable(()=>{ iconDone=false; if(ensureLayers()) draw(); }); },90); }); }catch(_){}
    onYear(()=>{ if(on) refresh(true); });
    window.addEventListener('intmap-lang',()=>setTimeout(()=>{ if(on){ drawNames(); render(); }
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

    return { toggle,
      set:(v)=>{ const cb=document.getElementById('wp-dl-currents'); if(cb){ cb.checked=!!v; cb.dispatchEvent(new Event('change',{bubbles:true})); } else toggle(!!v); return !!v; },
      /* the shape #R216 published, plus what a streamline layer can now answer: how many lines, how
         long they are, and how big the grid behind them was. `points` is kept as the number of grid
         cells that carried a velocity, so a caller that was reading it still gets a count of
         measurements rather than a renamed field. */
      state:()=>({ on, busy, err,
        lines:lines.length,
        points:field?[...field.u].filter(x=>isFinite(x)).length:0,
        grid:field?(field.NX+'×'+field.NY):null,
        warm:lines.filter(a=>a.kind==='warm').length,
        cold:lines.filter(a=>a.kind==='cold').length,
        neutral:lines.filter(a=>a.kind==='neutral').length,
        vertices:lines.reduce((n,a)=>n+a.pts.length,0),
        names:names?names.length:0, namesState,
        top:lines.slice().sort((a,b)=>b.v-a.v).slice(0,3).map(a=>({v:+a.v.toFixed(2),km:a.km,kind:a.kind,dT:a.dT!=null?+a.dT.toFixed(2):null})) }) };
  })();
};
