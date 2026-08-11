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
 *    · 26 NAMED CURRENTS — Gulf Stream, Kuroshio, Oyashio, Agulhas, Humboldt, the three Antarctic
 *      Circumpolar sectors, … Each is a POLYLINE, and ⚠ the polyline is not copied from a drawing:
 *      it was TRACED through NASA/JPL OSCAR's measured sea-surface velocity field (1/3° L4, mean of
 *      eight five-day composites, served by NOAA CoastWatch ERDDAP — U.S. Government work, public
 *      domain). The name and one seed point per current are editorial; every vertex is the field's.
 *    · WARM / COLD / ZONAL — derived, not asserted: the mean poleward component sign(lat)·v along the
 *      traced path. Water carried toward its own pole is warm relative to the sea it crosses, toward
 *      the equator is cold, and near zero is genuinely zonal (the Antarctic Circumpolar and the
 *      equatorial currents) — which is drawn in grey rather than forced into one of the two colours.
 *    · THE GLOBAL FLOW FIELD — 5,484 arrows, one per moving ocean cell of the same mean field, at
 *      every zoom. This is what makes the layer a MAP of the ocean rather than 26 lines: the gyres,
 *      the equatorial counter-flow and the western boundary intensification are all in it. The arrow
 *      is shaded by the measured speed; the renderer thins them by collision, so the density follows
 *      the zoom without anything being recomputed.
 *
 *  ⚠ CONSEQUENCES THAT ARE DELIBERATE, so they are written down rather than discovered:
 *    · The picture no longer follows the app clock. It is a MEAN FIELD, and a mean has no instant —
 *      the panel says so. (#R216/#R218's instantaneous field did follow the clock; that is the one
 *      thing given up, and it is what 「固定」 asks for.)
 *    · The Wikidata name fetch is gone. Its names are now bundled, in all five languages, so the
 *      layer needs no query service to be complete.
 *    · Turning the layer on is one 146 kB file, fetched once per session and kept.
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
    const { makePanel, ensureHead, row, esc, whenDrawable, setVis, L } = W;

    const SRC='oc-src', LINE='oc-line', HEAD='oc-head', LBL='oc-label', FSRC='oc-flow-src', FLOW='oc-flow';

    /* the two colours the request names, plus the honest third one */
    const COL_WARM='#ff453a', COL_COLD='#2f7fe0', COL_NEUTRAL='#9aa0a6';

    let on=false, doc=null, state='idle', err=null, picked=null;

    const panel=makePanel('oc-panel',()=>'🌊 '+L('Ocean currents','海流','Meeresströmungen','Морские течения','Corrientes marinas'),'wp-dl-currents',
      { legendId:'wpcurrents', layers:()=>[FLOW,LINE,HEAD,LBL],
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
           (−S/2, −S/2) after `translate(S/2, S/2)` reads outside the canvas and hands back a fully
           TRANSPARENT block — which registers happily and then draws nothing at all. */
        const d=c.getImageData(0,0,S,S);
        if(!GE().scene.hasImage('oc-arrow-img'))
          GE().scene.addImage('oc-arrow-img',{width:S,height:S,data:new Uint8Array(d.data.buffer)},{sdf:true});
        iconDone=GE().scene.hasImage('oc-arrow-img');
      }catch(_){ iconDone=false; }
      return iconDone; }

    function _canDraw(){ try{ return !!HOST.canDraw(); }catch(_){ try{ return !!GE().ready(); }catch(__){ return false; } } }

    /* the speed shading for the flow field: the ONE thing an arrow can say beyond its direction, and
       it is measured (m/s in the file). Pale where the sea barely moves, deep where it races. */
    const SPEED_COL=['interpolate',['linear'],['get','s'],
      0.02,'#9fc6e8', 0.15,'#5c9ede', 0.40,'#2f7fe0', 0.80,'#1550b4', 1.40,'#0a2f78'];

    function ensureLayers(){
      if(!_canDraw()) return false;
      try{
        ensureIcon();
        if(!GE().layers.hasSource(FSRC)) GE().layers.addSource(FSRC,{type:'geojson',data:{type:'FeatureCollection',features:[]}});
        if(!GE().layers.hasSource(SRC))  GE().layers.addSource(SRC,{type:'geojson',data:{type:'FeatureCollection',features:[]}});
        /* ① the field. Points, each rotated to its own measured bearing. `icon-allow-overlap:false`
           is what makes the density follow the zoom: the renderer drops the ones that would collide,
           so a whole-Earth view is a readable field and a bay is every cell it has. */
        if(!GE().layers.has(FLOW)) GE().layers.add({id:FLOW,type:'symbol',source:FSRC,layout:{visibility:'none',
          'icon-image':'oc-arrow-img',
          'icon-size':['interpolate',['linear'],['zoom'],0,0.20,3,0.28,6,0.40,9,0.52],
          'icon-rotate':['-',['get','b'],90],
          'icon-rotation-alignment':'map','icon-allow-overlap':false,'icon-ignore-placement':false,'icon-padding':1},
          paint:{'icon-color':SPEED_COL,
            'icon-opacity':['interpolate',['linear'],['zoom'],0,0.55,4,0.7,8,0.8]}});
        /* ② the named currents, over the field */
        if(!GE().layers.has(LINE)) GE().layers.add({id:LINE,type:'line',source:SRC,
          layout:{visibility:'none','line-cap':'round','line-join':'round'},
          paint:{'line-color':['get','col'],
            'line-width':['interpolate',['linear'],['zoom'],0,['*',1.3,['get','w']],4,['*',2.6,['get','w']],9,['*',4.4,['get','w']]],
            'line-opacity':0.92,'line-blur':0.2}});
        if(!GE().layers.has(HEAD)) GE().layers.add({id:HEAD,type:'symbol',source:SRC,layout:{visibility:'none',
          'symbol-placement':'line','symbol-spacing':['interpolate',['linear'],['zoom'],0,70,6,130],
          'icon-image':'oc-arrow-img','icon-size':['interpolate',['linear'],['zoom'],0,0.30,6,0.50],
          'icon-rotation-alignment':'map','icon-allow-overlap':true,'icon-ignore-placement':true,'icon-padding':0},
          paint:{'icon-color':['get','col'],'icon-opacity':0.95}});
        /* ③ the name, along the current it belongs to */
        if(!GE().layers.has(LBL)) GE().layers.add({id:LBL,type:'symbol',source:SRC,layout:{visibility:'none',
          'symbol-placement':'line','symbol-spacing':600,
          'text-field':['get','name'],'text-size':window.IntMapLabelScale.sub(0.92),
          'text-offset':[0,1.0],'text-allow-overlap':false,'text-optional':true,'text-max-angle':38},
          paint:{'text-color':'#eaf4ff','text-halo-color':'rgba(0,20,36,0.92)','text-halo-width':1.5}});
        return true;
      }catch(_){ return false; } }

    /* ── the file, once ───────────────────────────────────────────────────────────────────────────
       ⚠ NOT ON THE BOOT PATH. 146 kB is nothing next to the layer being useful, and everything about
       nothing next to a layer nobody switched on — so it is fetched on the first toggle and kept. */
    function load(){
      if(doc||state==='loading') return Promise.resolve(doc);
      state='loading'; err=null; render();
      let url; try{ url=new URL('data/ocean-currents.json',document.baseURI).toString(); }catch(_){ url='data/ocean-currents.json'; }
      return fetch(url).then(r=>{ if(!r.ok) throw new Error('http '+r.status); return r.json(); })
        .then(d=>{ doc=d; state='ok'; draw(); render(); return d; })
        .catch(e=>{ state='error'; err=(e&&e.message)||String(e); render(); return null; }); }

    const nameOf=(c)=>{ const k={jp:'ja',de:'de',ru:'ru',es:'es'}[HOST.lang]; return (k&&c[k])||c.en||''; };
    const colOf=(c)=>(c.kind==='warm')?COL_WARM:(c.kind==='cold')?COL_COLD:COL_NEUTRAL;

    function draw(){
      if(!doc) return;
      /* width says speed — the same quantity the field's shading says, so the two agree */
      const named=(doc.named||[]).map(c=>({type:'Feature',
        geometry:{type:'LineString',coordinates:c.path},
        properties:{ name:nameOf(c), kind:c.kind, col:colOf(c),
                     w:Math.max(0.8,Math.min(3.0,0.8+(c.meanSpeed||0)*2.6)),
                     v:c.meanSpeed||0, vmax:c.maxSpeed||0 }}));
      const flow=(doc.arrows||[]).map(a=>({type:'Feature',
        geometry:{type:'Point',coordinates:[a[0],a[1]]},
        properties:{ b:a[2], s:a[3] }}));
      whenDrawable(()=>{ if(!ensureLayers()) return;
        try{ GE().layers.setSourceData(SRC,{type:'FeatureCollection',features:named}); }catch(_){}
        try{ GE().layers.setSourceData(FSRC,{type:'FeatureCollection',features:flow}); }catch(_){}
        setVis([FLOW,LINE,HEAD,LBL],on);
        panel.claim(); }); }

    /* ── the window ─────────────────────────────────────────────────────────────────────────────── */
    const KEY=(col,txt)=>'<div style="display:flex;align-items:center;gap:7px;font-size:11.5px;padding:1.5px 0;">'
      +'<span style="width:22px;height:0;border-top:3px solid '+col+';border-radius:2px;flex:none;"></span>'
      +esc(txt)+'</div>';
    const kindWord=(k)=>k==='warm'?L('warm','暖流','warm','тёплое','cálida')
      :k==='cold'?L('cold','寒流','kalt','холодное','fría')
      :L('zonal','東西流','zonal','зональное','zonal');
    function render(){
      if(!on&&!panel.shown()) return;
      let head;
      if(state==='loading') head=L('Loading the current atlas…','海流データを読み込み中…','Strömungsatlas wird geladen…','Загрузка атласа течений…','Cargando el atlas de corrientes…');
      else if(state==='error') head='⚠ '+L('The bundled current data could not be read.','同梱の海流データを読み込めませんでした。','Mitgelieferte Strömungsdaten nicht lesbar.','Не удалось прочитать данные.','No se pudieron leer los datos incluidos.');
      else if(!doc) head='';
      else head=(doc.named||[]).length+' '+L('named currents · ','本の海流 · ','benannte Strömungen · ','названных течений · ','corrientes con nombre · ')
        +(doc.arrows||[]).length.toLocaleString()+' '+L('field arrows','点の流向','Feldpfeile','стрелок поля','flechas de campo');
      const list=(doc&&doc.named||[]).slice()
        .sort((a,b)=>(b.meanSpeed||0)-(a.meanSpeed||0))
        .map(c=>'<div class="oc-row" data-en="'+esc(c.en)+'" style="display:flex;justify-content:space-between;gap:8px;padding:2.5px 0;border-bottom:1px solid var(--glass-border,rgba(128,128,128,0.16));font-size:11.5px;cursor:pointer;'
          +((picked&&picked===c.en)?'background:rgba(47,127,224,0.14);border-radius:5px;':'')+'">'
          +'<span style="color:'+colOf(c)+';white-space:nowrap;">'+esc(kindWord(c.kind))+'</span>'
          +'<span style="flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+esc(nameOf(c))+'</span>'
          +'<b style="white-space:nowrap;">'+(c.meanSpeed||0).toFixed(2)+' m/s</b></div>').join('');
      const b=panel.open('<div style="font-size:11.5px;color:var(--text-main);margin-bottom:4px;">'+esc(head)+'</div>'
        +'<div style="max-height:34vh;overflow:auto;">'+list+'</div>'
        +'<div style="margin-top:6px;">'
        +KEY(COL_WARM,L('Warm current — the water is carried toward its own pole','暖流 — 水が高緯度側へ運ばれている流れ','Warme Strömung','Тёплое течение','Corriente cálida'))
        +KEY(COL_COLD,L('Cold current — the water is carried toward the equator','寒流 — 水が赤道側へ運ばれている流れ','Kalte Strömung','Холодное течение','Corriente fría'))
        +KEY(COL_NEUTRAL,L('Zonal — the flow is east–west and carries no temperature contrast','東西流 — 南北にほとんど運ばない流れ','Zonal','Зональное','Zonal'))
        +'<div style="display:flex;align-items:center;gap:7px;font-size:11.5px;padding:1.5px 0;">'
        +'<span style="width:22px;height:9px;border-radius:2px;flex:none;background:linear-gradient(90deg,#9fc6e8,#2f7fe0,#0a2f78);"></span>'
        +esc(L('Field arrows: shading is the measured speed (0 → 1.4 m/s)','流向の矢印：濃さは実測の流速（0 → 1.4 m/s）','Pfeile: Farbe = gemessene Geschwindigkeit','Стрелки: цвет — измеренная скорость','Flechas: el color es la velocidad medida'))+'</div>'
        +'</div>'
        +'<div style="margin-top:6px;font-size:9.5px;color:var(--text-muted);line-height:1.5;">'
        +esc(L('Source: NASA/JPL OSCAR sea-surface velocity (1/3° L4) via NOAA CoastWatch ERDDAP — a U.S. Government work in the public domain. This layer is a FIXED dataset that ships with the app: the mean of eight five-day composites, with each named current traced through that measured field from a published seed on its core. Warm / cold / zonal is derived from the mean poleward component along the trace, not asserted. Because it is a mean, it does not follow the app clock — it is the climatological picture, the same everywhere and every time you open it.',
             '出典: NASA/JPL OSCAR の海面流速（1/3° L4）を NOAA CoastWatch ERDDAP 経由で取得（米国政府作成物・パブリックドメイン）。このレイヤーはアプリに同梱された固定データです：5日合成×8回分の平均場を作り、各海流はその実測の場を、公表されている核の位置から積分して辿ったものです。暖流・寒流・東西流は流路に沿った南北成分の平均から導いており、決めつけではありません。平均場なので時計には追随しません——いつ開いても同じ、気候学的な海流図です。',
             'Quelle: NASA/JPL OSCAR (1/3° L4) über NOAA CoastWatch ERDDAP, gemeinfrei. Mitgelieferter, fester Datensatz: Mittel aus acht Fünf-Tage-Kompositen; jede benannte Strömung wurde durch dieses gemessene Feld verfolgt. Warm/kalt/zonal ist abgeleitet. Ein Mittelfeld folgt der Uhr nicht.',
             'Источник: NASA/JPL OSCAR (1/3° L4) через NOAA CoastWatch ERDDAP, общественное достояние. Это фиксированный набор данных в составе приложения: среднее из восьми пятидневных композитов; каждое течение прослежено по этому измеренному полю. Тёплое/холодное/зональное выведено, а не заявлено. Среднее поле не следует за часами.',
             'Fuente: NASA/JPL OSCAR (1/3° L4) vía NOAA CoastWatch ERDDAP, dominio público. Es un conjunto fijo incluido en la app: media de ocho composiciones de cinco días; cada corriente con nombre se trazó por ese campo medido. Cálida/fría/zonal se deriva, no se afirma. Una media no sigue al reloj.'))
        +'</div>');
      if(b) b.querySelectorAll('.oc-row').forEach(r=>{ r.onclick=()=>flyTo(r.getAttribute('data-en')); });
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
      if(!on){ panel.hide(); setVis([FLOW,LINE,HEAD,LBL],false); picked=null; return; }
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

    return { toggle, flyTo, load,
      set:(v)=>{ const cb=document.getElementById('wp-dl-currents'); if(cb){ cb.checked=!!v; cb.dispatchEvent(new Event('change',{bubbles:true})); } else toggle(!!v); return !!v; },
      /* ⚠ `points` keeps its #R216 meaning — "how many measurements are on screen" — which for a
         bundled field is the arrow count. `lines` is the named currents. A caller reading either
         still gets a count of measurements rather than a renamed field. */
      state:()=>({ on, state, err,
        bundled:true, source:doc?doc.source:null, built:doc?doc.built:null,
        lines:doc?(doc.named||[]).length:0,
        points:doc?(doc.arrows||[]).length:0,
        warm:doc?(doc.named||[]).filter(c=>c.kind==='warm').length:0,
        cold:doc?(doc.named||[]).filter(c=>c.kind==='cold').length:0,
        zonal:doc?(doc.named||[]).filter(c=>c.kind==='zonal').length:0,
        vertices:doc?(doc.named||[]).reduce((n,c)=>n+(c.path||[]).length,0):0,
        picked,
        top:doc?(doc.named||[]).slice().sort((a,b)=>(b.meanSpeed||0)-(a.meanSpeed||0)).slice(0,3)
              .map(c=>({en:c.en,kind:c.kind,v:c.meanSpeed})):[] }) };
  })();
};
