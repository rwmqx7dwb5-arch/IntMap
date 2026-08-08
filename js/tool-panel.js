/* ============================================================================
 *  IntMap · Measure / radius tool panel & map context menu  (#R168)
 * ----------------------------------------------------------------------------
 *  The tool panel that drives the measure, radius and area tools, the GeoJSON features it puts
 *  on the map, and the map right-click context menu. Writes tool state through the host: three
 *  RW members already existed for the Atlas kernel (#R165), four are new.
 *
 *  Moved VERBATIM out of the index.html DOMContentLoaded closure: the only edit is that free
 *  references to closure variables became HOST.<member> reads (Architecture.md §3.1). The
 *  extraction was done by script and reversed byte-for-byte against the original text.
 * ==========================================================================*/
window.IntMapModules=window.IntMapModules||{};
window.IntMapModules.toolPanel=function(HOST){
  function bearingHTML(a,b){ const d=HOST.bearingDeg(a,b); return `${d.toFixed(1)}° <span class="unit-sub">(${HOST.compassDir(d)})</span>`; }

  /* (#R167) moved verbatim to js/tables.js — see Architecture.md §3.1. */
  const {RADIUS_PRESETS}=window.IntMapTables;

  /* Radius color quick-presets (#R7): R / G / B one-tap swatches alongside the custom color picker. */
  const RADIUS_COLOR_PRESETS=[{col:'#ff3b30',lbl:'R'},{col:'#34c759',lbl:'G'},{col:'#007aff',lbl:'B'}];
  /* (#R171) 3-D volume swatches. A translucent box in the air reads very differently from a flat circle,
     so these are picked for contrast against terrain and satellite imagery rather than copied from the
     radius set — blue, orange, green, magenta. The colour picker beside them takes anything else. */
  const V3D_COLORS=['#0a84ff','#ff9500','#34c759','#ff2d55'];
  /* (#R172) the altitude units the band can be typed in — metres are wrong for most of what this tool is
     good for (a 10-14 km airway, a 35,786 km geostationary shell, a 400 ft drone ceiling). */
  const V3D_UNITS=['m','km','ft','mi'];

  function buildToolFeatures(){
    /* radius circles (saved) — antimeridian + pole safe (#6,#5) */
    const f=[];
    HOST.radiusItems.forEach(c=>{
      try{
        const steps=c.radiusKm>3000?256:160;
        HOST.diskFillPolys(c.center,c.radiusKm,steps).forEach(poly=>{
          f.push({type:'Feature',geometry:{type:'Polygon',coordinates:poly},properties:{color:c.color,opacity:c.opacity,noStroke:true}}); });
        HOST.diskOutlineLines(c.center,c.radiusKm,steps).forEach(ln=>{
          f.push({type:'Feature',geometry:{type:'LineString',coordinates:ln},properties:{color:c.color,ringline:true}}); });
        f.push({type:'Feature',geometry:{type:'Point',coordinates:c.center},properties:{color:c.color}});
      }catch(e){}
    });
    /* live measure/area/radius preview */
    if(HOST.toolMode==='measure'){
      const all=HOST.measurePoints;
      for(let i=1;i<all.length;i++){
        try{ f.push(turf.greatCircle(turf.point(all[i-1]),turf.point(all[i]),{npoints:64})); }
        catch(e){ f.push(turf.lineString([all[i-1],all[i]])); }
      }
      /* Close-affordance (#47): when ≥3 points and the cursor is hovering near the FIRST point,
         highlight it so it's obvious the next click closes the shape (vs. adding a new point). */
      HOST.measurePoints.forEach((p,i)=>f.push(turf.point(p, (i===0&&HOST.measureSnapClose&&HOST.measurePoints.length>=3)?{snap:true}:{})));
      /* Dashed preview from the last fixed point to the live cursor */
      if(HOST.liveCursor && HOST.measurePoints.length>=1){
        const last=HOST.measurePoints[HOST.measurePoints.length-1];
        try{ const gc=turf.greatCircle(turf.point(last),turf.point(HOST.liveCursor),{npoints:32}); gc.properties={...(gc.properties||{}),preview:true}; f.push(gc); }
        catch(e){ f.push({type:'Feature',geometry:{type:'LineString',coordinates:[last,HOST.liveCursor]},properties:{preview:true}}); }
      }
    } else if(HOST.toolMode==='area'||HOST.toolMode==='volume'){   /* (#R170) the 3-D volume footprint previews like an area ring */
      if(HOST.measurePoints.length>=3){
        /* Great-circle polygon, antimeridian + pole safe (#5): build the ring in continuous lon,
           then split into pieces that each stay inside [-180,180] (no seam-jump fill bug). */
        try{
          const ring=HOST._gcRingUnwrapped(HOST.measurePoints,48);
          HOST._splitPolyToWindows(ring).forEach(r=>f.push({type:'Feature',geometry:{type:'Polygon',coordinates:[r]},properties:{color:'#007aff',opacity:0.18,noStroke:true}}));
          HOST._splitLineToWindows(ring).forEach(ln=>f.push({type:'Feature',geometry:{type:'LineString',coordinates:ln},properties:{color:'#007aff',ringline:true}}));
        }catch(e){ try{ f.push(turf.polygon([[...HOST.measurePoints,HOST.measurePoints[0]]],{color:'#007aff',opacity:0.18,noStroke:true})); }catch(_){} }
      } else if(HOST.measurePoints.length>=2){
        try{
          const gc=turf.greatCircle(turf.point(HOST.measurePoints[0]),turf.point(HOST.measurePoints[1]),{npoints:48});
          f.push(gc);
        }catch(e){ f.push(turf.lineString(HOST.measurePoints)); }
      }
      HOST.measurePoints.forEach(p=>f.push(turf.point(p)));
      /* Dashed preview while drawing area: great-circle line to cursor + closing arc */
      if(HOST.liveCursor && HOST.measurePoints.length>=1){
        const last=HOST.measurePoints[HOST.measurePoints.length-1];
        try{ const gc=turf.greatCircle(turf.point(last),turf.point(HOST.liveCursor),{npoints:32}); gc.properties={...(gc.properties||{}),preview:true}; f.push(gc); }
        catch(e){ f.push({type:'Feature',geometry:{type:'LineString',coordinates:[last,HOST.liveCursor]},properties:{preview:true}}); }
        if(HOST.measurePoints.length>=2){
          try{ const gc=turf.greatCircle(turf.point(HOST.liveCursor),turf.point(HOST.measurePoints[0]),{npoints:32}); gc.properties={...(gc.properties||{}),preview:true}; f.push(gc); }
          catch(e){ f.push({type:'Feature',geometry:{type:'LineString',coordinates:[HOST.liveCursor,HOST.measurePoints[0]]},properties:{preview:true}}); }
        }
      }
    }
    return f;
  }

  function ringPerimeter(p){ if(p.length<2)return 0; let s=HOST.totalDistance(p); if(p.length>=3)s+=turf.distance(turf.point(p[p.length-1]),turf.point(p[0]),{units:'kilometers'}); return s; }

  function updateToolPanel(){
    const p=document.getElementById('tool-panel'); if(!HOST.toolMode){ p.style.display='none'; return; } p.style.display='block';
    const titles={measure:'📏 '+HOST.t('measure'),area:'📐 '+HOST.t('areaTool'),radius:'⭕ '+HOST.t('radius'),volume:'🧊 '+HOST.t('vol3dTool')}; let body='';
    if(HOST.toolMode==='measure'){
      const tot=HOST.hasTurf()?HOST.totalDistance(HOST.measurePoints):0; let brg='';
      if(HOST.measurePoints.length>=2){
        const a=HOST.measurePoints[HOST.measurePoints.length-2], b=HOST.measurePoints[HOST.measurePoints.length-1];
        brg=`<div class="tp-row"><span>${HOST.t('bearing')} (${HOST.lang==='jp'?'最終区間':HOST.lang==='de'?'letzter Abschnitt':HOST.lang==='ru'?'последний отрезок':HOST.lang==='es'?'último tramo':'last leg'})</span><b>${bearingHTML(a,b)}</b></div>`;
        if(HOST.measurePoints.length>=3){
          const s=HOST.measurePoints[0], e=HOST.measurePoints[HOST.measurePoints.length-1];
          brg+=`<div class="tp-row"><span>${HOST.lang==='jp'?'始点→終点':HOST.lang==='de'?'Start → Ende':HOST.lang==='ru'?'начало → конец':HOST.lang==='es'?'inicio → fin':'start → end'}</span><b>${bearingHTML(s,e)}</b></div>`;
        }
      }
      body=`<div class="tp-row"><span>${HOST.t('points')}</span><b>${HOST.measurePoints.length}</b></div><div class="tp-row"><span>${HOST.t('total')}</span><b>${HOST.distHTML(tot)}</b></div>${brg}${HOST.measurePoints.length>=2?`<button class="ai-action-btn" id="tp-profile">📈 ${HOST.t('elevProfile')}</button><button class="ai-action-btn" id="tp-finalize">✓ ${HOST.t('finalizeMeas')}</button>`:''}`;
    } else if(HOST.toolMode==='area'){
      const pe=HOST.hasTurf()?ringPerimeter(HOST.measurePoints):0, ar=(HOST.hasTurf()&&HOST.measurePoints.length>=3)?HOST.ringArea(HOST.measurePoints):0;
      body=`<div class="tp-row"><span>${HOST.t('points')}</span><b>${HOST.measurePoints.length}</b></div><div class="tp-row"><span>${HOST.t('perimeter')}</span><b>${HOST.distHTML(pe)}</b></div><div class="tp-row"><span>${HOST.t('area')}</span><b>${ar?HOST.areaHTML(ar):'—'}</b></div><div class="tp-row" id="tp-pop-row" style="display:none;"><span>${HOST.t('popInArea')}</span><b id="tp-pop-val">—</b></div>${HOST.measurePoints.length>=3?`<button class="ai-action-btn" id="tp-pop-btn">${HOST.t('popInArea')}</button><button class="ai-action-btn" id="news-area-btn">📍 ${HOST.t('newsInArea')}</button><button class="ai-action-btn" id="ai-summarize-btn">📰 ${HOST.t('aiSumBtn')}</button><button class="ai-action-btn" id="tp-profile">📈 ${HOST.t('elevProfile')}</button><button class="ai-action-btn" id="tp-finalize">✓ ${HOST.t('finalizeMeas')}</button>`:''}`;
    } else if(HOST.toolMode==='volume'){
      /* (#R170) 3-D VOLUME — trace a footprint, give it a base and a top ALTITUDE, and the box is drawn
         at true scale in the air. The two altitude fields are metres above SEA LEVEL in both terrain
         states (js/volume3d.js compensates when 3-D terrain is on); the ground row shows the elevation
         it subtracted, so the number the user typed and the box they see are never in disagreement.
         (#R171) Rebuilt: a shape picker (the footprint is no longer only straight edges), colour and
         opacity, and — the actual defect — derived numbers that refresh IN PLACE. See v3dSync below. */
      const V=window.IntMapVolume3D;
      const _L=(en,jp,de,ru,es)=>HOST.lang==='jp'?jp:HOST.lang==='de'?de:HOST.lang==='ru'?ru:HOST.lang==='es'?es:en;
      const drag=!!(V&&V.ownsGesture&&V.ownsGesture());
      /* Only the click-vertex shape takes its footprint from measurePoints; a stroke shape owns its own.
         (#R172) …and it goes through syncClicks, which refuses to replace a ring it did not create. The old
         setRing() call ran on EVERY panel re-render, so an Atlas-drawn volume lost its footprint the moment
         anything refreshed the panel — the box stayed on screen while the panel read "Points 0". */
      if(V&&!drag){ try{ V.syncClicks(HOST.measurePoints); }catch(_){} }
      const st=V?V.state():{points:0,base:1000,top:3000,shape:'polygon',color:'#0a84ff',opacity:0.45};
      const SHAPES=[['polygon',_L('Polygon','多角形','Polygon','Полигон','Polígono')],
                    ['freehand',_L('Freehand','フリーハンド','Freihand','От руки','A mano')],
                    ['circle',_L('Circle','円','Kreis','Круг','Círculo')],
                    ['rect',_L('Rectangle','長方形','Rechteck','Прямоугольник','Rectángulo')]];
      const HINTS={ polygon:_L('Click 3 or more points on the map to trace the footprint.','地図を3点以上クリックして底面を描いてください。','Klicke 3 oder mehr Punkte, um die Grundfläche zu zeichnen.','Отметьте 3 и более точек, чтобы задать основание.','Haz clic en 3 o más puntos para trazar la base.'),
        freehand:_L('Press and drag on the map to trace any outline.','地図を押したままなぞると、自由な形の底面を描けます。','Auf der Karte gedrückt ziehen, um eine beliebige Form zu zeichnen.','Проведите по карте, удерживая кнопку, чтобы обвести любой контур.','Mantén pulsado y arrastra en el mapa para trazar un contorno libre.'),
        circle:_L('Drag from the centre outwards to size the circle.','中心から外へドラッグすると円の大きさが決まります。','Vom Mittelpunkt nach außen ziehen, um den Kreis aufzuziehen.','Потяните от центра наружу, чтобы задать радиус.','Arrastra desde el centro hacia fuera para fijar el radio.'),
        rect:_L('Drag from one corner to the opposite one.','一方の角から対角へドラッグしてください。','Von einer Ecke zur gegenüberliegenden ziehen.','Потяните от одного угла к противоположному.','Arrastra de una esquina a la contraria.') };
      const shapeRow=`<div class="v3d-shapes" id="v3d-shapes">`+SHAPES.map(s=>`<button type="button" class="v3d-shape${st.shape===s[0]?' on':''}" data-shape="${s[0]}">${s[1]}</button>`).join('')+`</div>`;
      body=shapeRow
        +`<div class="tp-row"><span>${HOST.t('points')}</span><b id="v3d-pts">${st.points}</b></div>`
        +`<div class="tp-row"><span>${HOST.t('area')}</span><b id="v3d-area">—</b></div>`
        /* (#R172) the band's unit is the user's choice now — the heading says which one is in the fields */
        +`<div class="v3d-band"><span class="tp-sub" style="margin:0;min-width:0;">${_L('Altitude band above sea level','高度の範囲（海抜）','Höhenband über NN','Диапазон высот над уровнем моря','Franja de altitud sobre el nivel del mar')}</span>`
        +`<select id="v3d-unit" class="v3d-unitsel">${V3D_UNITS.map(u=>`<option value="${u}"${st.unit===u?' selected':''}>${u}</option>`).join('')}</select></div>`
        /* (#R171) the fields are STACKED under their labels in a 2-column grid with min-width:0 — laid out
           side by side they were 160 px each inside a 282 px panel and the second one was cut off.
           (#R172) no min/max: the altitude has no ceiling any more ("上限の高度は無しに"). */
        +`<div class="v3d-alt"><label><span>${_L('from','下端','von','от','desde')}</span><input type="number" id="v3d-base" step="${V?V.fieldStep():100}" inputmode="decimal" value="${V?V.fieldValue(st.base):Math.round(st.base)}"></label>`
        +`<label><span>${_L('to','上端','bis','до','hasta')}</span><input type="number" id="v3d-top" step="${V?V.fieldStep():100}" inputmode="decimal" value="${V?V.fieldValue(st.top):Math.round(st.top)}"></label></div>`
        +`<div class="tp-row"><span>${_L('Thickness','厚さ','Dicke','Толщина','Grosor')}</span><b id="v3d-thick">—</b></div>`
        +`<div class="tp-row" id="v3d-gnd-row" style="display:none;"><span>${_L('Ground below','地表面の標高','Boden darunter','Высота земли','Suelo debajo')}</span><b id="v3d-gnd">—</b></div>`
        +`<div class="tp-row"><span>${_L('Volume','体積','Volumen','Объём','Volumen')}</span><b id="v3d-vol">—</b></div>`
        /* (#R171) colour + opacity, mirroring the radius tool's controls so the two feel like one app */
        +`<div class="v3d-style"><span class="v3d-slbl">${HOST.t('color')}</span>`
        +`<div class="rad-presets">${V3D_COLORS.map(c=>`<button type="button" class="rad-preset${String(st.color).toLowerCase()===c?' on':''}" data-v3dcol="${c}" style="background:${c}"></button>`).join('')}</div>`
        +`<input type="color" id="v3d-color" value="${st.color}" title="${_L('Custom color','カスタム色','Eigene Farbe','Свой цвет','Color personalizado')}"></div>`
        +`<div class="v3d-style"><span class="v3d-slbl">${HOST.t('opacity')}</span>`
        +`<input type="range" id="v3d-op" min="0.05" max="0.95" step="0.05" value="${st.opacity}" style="flex:1;min-width:0;accent-color:var(--primary-color);"></div>`
        /* (#R174) The "Solid" checkbox is GONE ("わざわざSolidを選択制なんてするな") — a volume is a closed
           body, full stop. In its place, the thing a clicked polygon actually lacked: an END. */
        +`<button class="ai-action-btn" id="v3d-seal" style="display:none;"></button>`
        +`<div class="tp-hint" id="v3d-hint">${HINTS[st.shape]||HINTS.polygon}</div>`
        /* (#R183) 「完了した立体を保存して次を描ける」 — the draft becomes a saved object and the
           footprint clears, keeping the altitudes/colour so a series is quick to draw. */
        +`<button class="ai-action-btn" id="v3d-save" style="display:none;">＋ ${_L('Save & draw next','保存して次を描く','Speichern & nächstes','Сохранить и следующий','Guardar y dibujar otro')}</button>`
        +`<button class="ai-action-btn" id="v3d-keep" style="display:none;">✓ ${_L('Keep on map','地図に残す','Auf der Karte behalten','Оставить на карте','Mantener en el mapa')}</button>`
        /* the saved-object list. Rebuilt in place by v3dList() so typing in a neighbouring field
           never rebuilds the whole panel out from under the cursor (the #R171 defect). */
        +`<div id="v3d-objs"></div>`;
    } else if(HOST.toolMode==='radius'){
      let opts=`<option value="">${HOST.t('presetNone')}</option>`;
      RADIUS_PRESETS.forEach(grp=>{ opts+=`<optgroup label="${grp.g[HOST.lang]}">`+grp.items.map(it=>`<option value="${it[1]}">${it[0]} — ${it[1]} km</option>`).join('')+`</optgroup>`; });
      let list='';
      if(HOST.radiusItems.length){
        list=`<div class="tp-sub">${HOST.radiusItems.length} ${HOST.t('radius')}</div><div class="radius-list">`+HOST.radiusItems.map((c,i)=>`<div class="radius-list-item"><span class="rl-sw" style="background:${c.color}"></span><span class="rl-main">${c.radiusKm} km · ${c.center[1].toFixed(2)}°,${c.center[0].toFixed(2)}°</span><button class="rl-del" onclick="removeRadiusItem('${c.id}')">✕</button></div>`).join('')+`</div><button class="tp-clear" onclick="clearAllRadius()" style="margin-top:6px;">${HOST.t('removeAll')}</button>`;
      }
      body=`<div class="tp-row radius-control"><input type="range" id="radius-range" min="1" max="20000" step="10" value="${Math.min(20000,HOST.radiusKm)}"><div class="radius-row"><button type="button" id="radius-dec" class="rad-step" title="${HOST.lang==='jp'?'小さく':HOST.lang==='de'?'Kleiner':HOST.lang==='ru'?'Мельче':HOST.lang==='es'?'Reducir':'Decrease'}">−</button><input type="number" id="radius-num" min="1" value="${HOST.radiusKm}"><button type="button" id="radius-inc" class="rad-step" title="${HOST.lang==='jp'?'大きく':HOST.lang==='de'?'Größer':HOST.lang==='ru'?'Крупнее':HOST.lang==='es'?'Aumentar':'Increase'}">＋</button><select id="radius-unit" style="background:var(--input-bg);color:var(--text-main);border:1px solid var(--glass-border,rgba(128,128,128,0.25));border-radius:6px;padding:2px 4px;font-size:11.5px;"><option value="km">km</option><option value="mi">mi</option></select></div></div>
        <div class="rad-stats"><div class="rad-stat"><label>${HOST.t('circumference')}</label><b id="rad-c">${HOST.distHTML(2*Math.PI*HOST.radiusKm)}</b></div><div class="rad-stat"><label>${HOST.t('area')}</label><b id="rad-a">${HOST.areaHTML(Math.PI*HOST.radiusKm*HOST.radiusKm)}</b></div></div><!-- (#R147) dropped the redundant Radius tile (already shown in the slider + number field) to declutter ("項目数が増え、煩雑…UIを整理") -->
        <details class="tp-more"><summary>${HOST.lang==='jp'?'スタイル・プリセット':HOST.lang==='de'?'Stil und Vorlagen':HOST.lang==='ru'?'Стиль и пресеты':HOST.lang==='es'?'Estilo y ajustes':'Style &amp; presets'}</summary>
        <div class="tp-sub" style="margin-top:4px;">${HOST.t('presetLbl')}</div><select class="tp-select" id="radius-preset">${opts}</select>
        <div class="radius-color-row"><span>${HOST.t('color')}</span><div class="rad-presets">${RADIUS_COLOR_PRESETS.map(c=>`<button type="button" class="rad-preset${HOST.radiusColor.toLowerCase()===c.col?' on':''}" data-col="${c.col}" title="${c.lbl}" style="background:${c.col}"></button>`).join('')}</div><input type="color" id="radius-color" value="${HOST.radiusColor}" title="${HOST.lang==='jp'?'カスタム色':HOST.lang==='de'?'Eigene Farbe':HOST.lang==='ru'?'Свой цвет':HOST.lang==='es'?'Color personalizado':'Custom color'}"><span class="tp-sub" style="margin:0;">${HOST.t('opacity')}</span><input type="range" id="radius-op" min="0" max="0.6" step="0.02" value="${HOST.radiusOpacity}" style="flex:1; accent-color:var(--primary-color);"></div></details>
        ${HOST.radiusItems.length?'':`<div class="tp-hint">${HOST.t('radiusHint')}</div>`}${list}${HOST.radiusItems.length?`<div class="rad-actions"><button class="rad-act" id="tp-pop-btn"><span class="ra-l">${HOST.t('popInArea')}</span></button><button class="rad-act" id="news-area-btn"><span class="ra-l">📍 ${HOST.t('newsInArea')}</span></button><button class="rad-act" id="ai-summarize-btn"><span class="ra-l">📰 ${HOST.t('aiSumBtn')}</span></button></div>`:''}<div class="tp-row" id="tp-pop-row" style="display:none;"><span>${HOST.t('popInArea')}</span><b id="tp-pop-val">—</b></div>`;   /* (#R40/#R142/#R146) circles persist; style/colour/opacity in the "Style" disclosure; 3 area actions in a compact grid (not stacked); usage hint hidden once a circle exists */
    }
    const footBtns = (HOST.toolMode!=='radius')
      ? `<div class="tp-foot-btns">${HOST.measurePoints.length?`<button class="tp-clear" id="tp-undo">↶ ${HOST.t('undoPt')}</button>`:''}<button class="tp-clear" id="tp-clear">${HOST.t('clear')}</button></div>`
      : '';
    p.innerHTML=`<div class="tp-header"><span class="tp-title">${titles[HOST.toolMode]}</span><span class="tp-hd-btns"><button class="tp-min-btn" title="${HOST.lang==='jp'?'最小化':HOST.lang==='de'?'Minimieren':HOST.lang==='ru'?'Свернуть':HOST.lang==='es'?'Minimizar':'Minimize'}">–</button><button class="tp-close" title="${HOST.t('close')}">✕</button></span></div>${body}${footBtns}`;
    p.classList.toggle('tp-radius', HOST.toolMode==='radius');   /* (#R22) drives the compact mobile radius layout */
    if(p.dataset.collapsed==='1'){ p.classList.add('tp-collapsed'); }   /* (#R34) keep minimized state across re-renders */
    p.querySelector('.tp-close').onclick=HOST.exitTool; HOST.makeDraggable(p,p.querySelector('.tp-header'));
    /* (#R34) Minimize button ("Enable − in Radius") — collapses the panel to just its header so the tool no
       longer covers the centre crosshair on mobile ("Radius widget is too big so it hides the cross pointer"). */
    { const mb=p.querySelector('.tp-min-btn'); if(mb) mb.onclick=(e)=>{ e.stopPropagation(); const on=p.classList.toggle('tp-collapsed'); p.dataset.collapsed=on?'1':'0'; mb.title=(HOST.lang==='jp'?(on?'展開':'最小化'):HOST.lang==='de'?(on?'Ausklappen':'Minimieren'):HOST.lang==='ru'?(on?'Развернуть':'Свернуть'):HOST.lang==='es'?(on?'Expandir':'Minimizar'):(on?'Expand':'Minimize')); }; }   /* (#R35) icon (line↔box) is drawn by CSS off .tp-collapsed — no text –/+ */
    { const sb=p.querySelector('#ai-summarize-btn'); if(sb){ sb.classList.toggle('ai-needs-key',!HOST.aiReady()); sb.title=HOST.aiReady()?'':HOST.t('aiNoKey');
      /* (#R119) the area summary now runs INSIDE the Atlas thread (analyze scope:"drawn-area" = news in the area +
         displayed-layer values + WorldPop population, one conversation surface). The legacy popup stays as fallback. */
      sb.onclick=()=>{ try{ if(window.IntMapConsole&&window.IntMapConsole.runDirect){
          const q5=HOST.lang==='jp'?'描画した範囲内の状況を要約・分析して':HOST.lang==='de'?'Fasse die Lage im gezeichneten Gebiet zusammen':HOST.lang==='ru'?'Сводка по нарисованной области':HOST.lang==='es'?'Resume la situación del área dibujada':'Summarize and analyse the situation inside the drawn area';
          window.IntMapConsole.runDirect(q5,[{type:'analyze',question:q5,scope:'drawn-area'}]); return; } }catch(_){}
        aiSummarizeArea(); }; } }
    { const nb=p.querySelector('#news-area-btn'); if(nb) nb.onclick=()=>{ try{ window._searchNewsInArea(); }catch(_){} }; }
    { const fb=p.querySelector('#tp-finalize'); if(fb) fb.onclick=()=>{ try{ window._finalizeMeasurement(); }catch(_){} }; const pb=p.querySelector('#tp-profile'); if(pb) pb.onclick=()=>{ try{ window._elevationProfile(); }catch(_){} }; }
    /* (#R118) population inside the drawn polygon / placed circle(s) — WorldPop 100m grid (see IntMapPopArea) */
    { const pb2=p.querySelector('#tp-pop-btn');
      const pbL=(txt)=>{ if(!pb2) return; const l=pb2.querySelector('.ra-l'); if(l) l.textContent=txt; else pb2.textContent=txt; };   /* (#R146) label lives in a .ra-l span (grid ellipsis) — update the span, not the button */
      const showRes=(popv,yr,src,multi)=>{ const row=p.querySelector('#tp-pop-row'), val=p.querySelector('#tp-pop-val');
        if(row&&val){ row.style.display=''; val.innerHTML=Number(popv).toLocaleString()+' <span style="font-size:10px;color:var(--text-muted);">('+src+' '+yr+(multi?' · Σ':'')+')</span>'; } };
      /* (#R122/#R139) PROGRESS BAR — the WorldPop summation runs as a server-side task (~10-30 s). WorldPop gives NO
         true % for a single request (its task API only reports created/finished), so the old time-based ease-out that
         DECELERATED toward 92% and snapped to 100% read as meaningless ("100%に近づくほど遅くなる／グラフの意味を成さない").
         Now HONEST (see window._imProgCtl): an INDETERMINATE animated sweep while there is no real fraction, switching
         to a REAL LINEAR fraction the moment one exists — a large area that must be TILED reports tiles-done/total,
         and multiple radius circles advance per finished circle (each circle's own tiling fills its band). */
      const _progLbl=()=>HOST.lang==='jp'?'WorldPop人口グリッドを集計中…':HOST.lang==='de'?'WorldPop-Bevölkerungsraster wird summiert…':HOST.lang==='ru'?'Суммирование сетки населения WorldPop…':HOST.lang==='es'?'Sumando la cuadrícula de población WorldPop…':'Summing the WorldPop population grid…';
      const _mkProg=()=>{ let box=p.querySelector('.tp-prog'); if(!box){ box=document.createElement('div'); box.className='tp-prog'; box.style.cssText='margin:7px 0 2px;';
          box.innerHTML='<div style="display:flex;justify-content:space-between;gap:8px;font-size:10.5px;color:var(--text-muted);margin-bottom:3px;"><span class="tp-prog-lbl" style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></span><b class="tp-prog-pct" style="flex:0 0 auto;">0%</b></div><div style="height:7px;border-radius:4px;background:rgba(128,128,128,0.22);overflow:hidden;"><div class="tp-prog-fill" style="height:100%;width:0%;background:linear-gradient(90deg,#0a84ff,#5e5ce6);transition:width .2s;"></div></div>';
          if(pb2&&pb2.parentNode) pb2.parentNode.insertBefore(box,pb2.nextSibling); else p.appendChild(box); }
        box.querySelector('.tp-prog-lbl').textContent=_progLbl(); box.classList.remove('indet'); box.style.display='block'; return box; };
      if(pb2) pb2.onclick=async()=>{ const box=_mkProg(); const P=window._imProgCtl(box); P.busy();
        const onProg=(f)=>P.set(f);   /* fires only when the area is large enough to be TILED → real tiles-done fraction */
        try{
          pb2.disabled=true; pbL(HOST.t('popCalcing'));
          if(HOST.toolMode==='area'&&HOST.measurePoints.length>=3){
            const geom={type:'Polygon',coordinates:[[...HOST.measurePoints,HOST.measurePoints[0]]]};
            const r=await window.IntMapPopArea.estimate(geom, onProg); P.done(); setTimeout(()=>{ box.style.display='none'; },450);
            showRes(r.pop,r.year,r.src,false); pb2.style.display='none'; return; }
          if(HOST.toolMode==='radius'&&HOST.radiusItems.length){ let tot=0, yr=2020, src='WorldPop'; const N=HOST.radiusItems.length;
            for(let i=0;i<N;i++){ if(N>1) P.set(i/N); else P.busy();
              const c=HOST.radiusItems[i]; const g=window.IntMapPopArea.circleGeom(c.center,c.radiusKm);
              const r=await window.IntMapPopArea.estimate(g, (N>1)?(f=>P.set((i+Math.max(0,Math.min(1,f)))/N)):onProg); tot+=r.pop; yr=r.year; src=r.src;
              if(N>1) P.set((i+1)/N); }
            P.done(); setTimeout(()=>{ box.style.display='none'; },450);
            showRes(tot,yr,src,N>1); pb2.style.display='none'; return; }
          box.style.display='none'; pb2.disabled=false; pbL(HOST.t('popInArea'));
        }catch(e){ box.style.display='none'; pb2.disabled=false; pbL(HOST.t('popFail')); setTimeout(()=>{ try{ pbL(HOST.t('popInArea')); }catch(_){} },2600); } }; }
    const cl=p.querySelector('#tp-clear'); if(cl) cl.onclick=()=>{ HOST.measurePoints=[]; if(HOST.toolMode==='area'){ HOST.toolMode='measure'; try{ HOST._syncToolBtns(); }catch(_){} }
      try{ if(HOST.toolMode==='volume'&&window.IntMapVolume3D) window.IntMapVolume3D.clear(); }catch(_){}   /* (#R170) drop the extruded box with its footprint */
      HOST.hideMeasureTip(); HOST.refreshTool(); updateToolPanel(); };
    const un=p.querySelector('#tp-undo'); if(un) un.onclick=()=>window._measureUndo();
    if(HOST.toolMode==='volume'){
      /* (#R170) live altitude editing: every keystroke re-extrudes, so the box grows/shrinks as you type.
         (#R171) …except it did not, because `apply()` ended in updateToolPanel(), which rewrites the whole
         panel's innerHTML — DESTROYING the input the user was typing into. Measured on a fresh profile:
         typing "2500" into the base field left the value "2" and document.activeElement back on BODY after
         the very first keystroke. That is the reported "まともに数値入力ができない／UIが壊れている".
         The derived numbers are refreshed IN PLACE now; nothing under the cursor is ever replaced. */
      const V=window.IntMapVolume3D;
      const bI=p.querySelector('#v3d-base'), tI=p.querySelector('#v3d-top');
      const _L=(en,jp,de,ru,es)=>HOST.lang==='jp'?jp:HOST.lang==='de'?de:HOST.lang==='ru'?ru:HOST.lang==='es'?es:en;
      const sync=()=>{ if(!V) return; const st=V.state();
        const set=(id,html)=>{ const el=p.querySelector(id); if(el) el.innerHTML=html; };
        set('#v3d-pts', String(st.points));
        set('#v3d-area', st.areaM2>0?HOST.areaHTML(st.areaM2/1e6):'—');
        set('#v3d-thick', V.fmtAlt(st.thickness));
        set('#v3d-vol', V.fmtVolume());
        const gr=p.querySelector('#v3d-gnd-row');
        if(gr){ if(st.ground!=null){ gr.style.display=''; set('#v3d-gnd', V.fmtAlt(st.ground)); } else gr.style.display='none'; }
        const hint=p.querySelector('#v3d-hint');
        if(hint&&st.terrain&&st.ground==null&&st.points>=3) hint.textContent=_L('Reading the terrain elevation…','地表面の標高を取得中…','Geländehöhe wird gelesen…','Чтение высоты рельефа…','Leyendo la altitud del terreno…');
        else if(hint&&st.sealed) hint.textContent=_L('Footprint finished — map clicks no longer add points.','底面の描画を完了しました。地図をクリックしても点は追加されません。','Grundfläche fertig — Klicks fügen keine Punkte mehr hinzu.','Основание готово — клики больше не добавляют точки.','Base terminada: los clics ya no añaden puntos.');
        const kp2=p.querySelector('#v3d-keep'); if(kp2) kp2.style.display=st.points>=3?'':'none';
        /* (#R174) the polygon's full stop. Shown only for the clicked shape (a stroke ends when the finger
           lifts) and only once there is a footprint to finish; pressing it again re-opens it, so nothing
           the button does is irreversible. */
        const sb=p.querySelector('#v3d-seal');
        if(sb){ const show=(st.shape==='polygon')&&(st.points>=3||st.sealed);
          sb.style.display=show?'':'none';
          sb.textContent=st.sealed
            ? '✎ '+_L('Resume drawing','描画を再開','Weiterzeichnen','Продолжить рисование','Seguir dibujando')
            : '✓ '+_L('Finish drawing','描画を完了','Zeichnen beenden','Завершить рисование','Terminar el dibujo'); }
        const sv=p.querySelector('#v3d-save'); if(sv) sv.style.display=st.points>=3?'':'none';
        v3dList();
      };
      /* (#R183) THE SAVED-OBJECT LIST — 「オブジェクト一覧から選択・非表示・削除／後から高度・色・
         透明度を編集／体積値を常時表示／クリックして選択」.
         Rebuilt in place inside #v3d-objs rather than by re-rendering the panel, for the reason #R171
         established: the panel re-renders on every keystroke in a neighbouring field, and rebuilding
         it would move the cursor out of whatever the user is typing in. The volume of each body and
         the running total are shown on every refresh, so "体積値を常時表示" is satisfied by the list
         itself and not by having to select something. */
      const v3dList=()=>{ if(!V||!V.list) return; const box=p.querySelector('#v3d-objs'); if(!box) return;
        const objs=V.list();
        if(!objs.length){ box.innerHTML=''; return; }
        const sel=V.selected();
        const esc=(s)=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
        box.innerHTML=`<div class="tp-sub" style="margin-top:8px;">${objs.length} ${_L('objects','オブジェクト','Objekte','объектов','objetos')}`
          +` · ${_L('total','合計','gesamt','всего','total')} <b style="color:var(--text-main);">${V.fmtVolumeOf(V.totalVolumeM3())}</b></div>`
          +`<div class="radius-list">`+objs.map(o=>
            `<div class="radius-list-item${o.id===sel?' v3d-sel':''}" data-v3d="${o.id}" style="${o.id===sel?'outline:1.5px solid var(--primary-color);border-radius:8px;':''}cursor:pointer;">`
            +`<span class="rl-sw" style="background:${o.color};${o.visible?'':'opacity:0.25;'}"></span>`
            +`<span class="rl-main" style="${o.visible?'':'opacity:0.45;'}">${esc(o.name)}<br>`
            +`<span style="font-size:10px;color:var(--text-muted);">${o.band} · ${o.volume}</span></span>`
            +`<button class="rl-del" data-v3dvis="${o.id}" title="${o.visible?_L('Hide','非表示','Ausblenden','Скрыть','Ocultar'):_L('Show','表示','Einblenden','Показать','Mostrar')}">${o.visible?'👁':'⚊'}</button>`
            +`<button class="rl-del" data-v3ddel="${o.id}" title="${_L('Delete','削除','Löschen','Удалить','Eliminar')}">✕</button></div>`).join('')
          +`</div>`
          +(sel?(()=>{ const o=objs.find(x=>x.id===sel); if(!o) return '';
              /* editing a SAVED body afterwards: the same three controls the draft has, bound to it */
              return `<div class="v3d-alt" style="margin-top:6px;">`
                +`<label><span>${_L('from','下端','von','от','desde')}</span><input type="number" id="v3d-o-base" step="${V.fieldStep()}" inputmode="decimal" value="${V.fieldValue(o.low)}"></label>`
                +`<label><span>${_L('to','上端','bis','до','hasta')}</span><input type="number" id="v3d-o-top" step="${V.fieldStep()}" inputmode="decimal" value="${V.fieldValue(o.high)}"></label></div>`
                +`<div class="v3d-style"><span class="v3d-slbl">${HOST.t('color')}</span>`
                +`<input type="color" id="v3d-o-color" value="${o.color}"></div>`
                +`<div class="v3d-style"><span class="v3d-slbl">${HOST.t('opacity')}</span>`
                +`<input type="range" id="v3d-o-op" min="0.05" max="0.95" step="0.05" value="${o.opacity}" style="flex:1;min-width:0;accent-color:var(--primary-color);"></div>`; })():'')
          +`<button class="tp-clear" id="v3d-clearall" style="margin-top:6px;">${HOST.t('removeAll')}</button>`;
        box.querySelectorAll('[data-v3d]').forEach(el=>{ el.onclick=(ev)=>{ if(ev.target.closest('button')) return;
          V.select(el.getAttribute('data-v3d')===V.selected()?null:el.getAttribute('data-v3d')); v3dList(); }; });
        box.querySelectorAll('[data-v3dvis]').forEach(b=>{ b.onclick=(ev)=>{ ev.stopPropagation(); V.setObjVisible(b.getAttribute('data-v3dvis')); v3dList(); }; });
        box.querySelectorAll('[data-v3ddel]').forEach(b=>{ b.onclick=(ev)=>{ ev.stopPropagation(); V.removeObj(b.getAttribute('data-v3ddel')); v3dList(); }; });
        const ca=box.querySelector('#v3d-clearall'); if(ca) ca.onclick=()=>{ V.removeAll(); v3dList(); };
        const ob=box.querySelector('#v3d-o-base'), ot=box.querySelector('#v3d-o-top'),
              oc=box.querySelector('#v3d-o-color'), oo=box.querySelector('#v3d-o-op');
        /* the same "not a number yet" discipline the draft's fields use (#R172): '' / '-' / '.' are
           states a real keyboard passes through and must reach the model unconverted */
        const _toM2=(raw)=>{ const s=String(raw==null?'':raw).trim();
          if(s===''||s==='-'||s==='+'||s==='.'||s==='-.') return s;
          const n=Number(s); return isFinite(n)?V.fromUnit(n):s; };
        /* Refresh only the DERIVED TEXT while a field is being typed into. Calling v3dList() here
           would rebuild these very inputs and throw the caret out of the one under the cursor —
           #R171's defect, which is why the draft's fields refresh in place too. */
        const retext=()=>{ const now=V.list(); const hd=box.querySelector('.tp-sub');
          if(hd) hd.innerHTML=`${now.length} ${_L('objects','オブジェクト','Objekte','объектов','objetos')}`
            +` · ${_L('total','合計','gesamt','всего','total')} <b style="color:var(--text-main);">${V.fmtVolumeOf(V.totalVolumeM3())}</b>`;
          now.forEach(o=>{ const row=box.querySelector('[data-v3d="'+o.id+'"] .rl-main span'); if(row) row.textContent=o.band+' · '+o.volume; }); };
        const applyO=()=>{ V.updateObj(sel,{base:_toM2(ob&&ob.value),top:_toM2(ot&&ot.value)}); retext(); };
        if(ob) ob.oninput=applyO; if(ot) ot.oninput=applyO;
        /* …and settle the field to what the model actually holds on blur/Enter, where the clamp
           becomes visible and can never fight the keyboard (same as the draft's `settle`) */
        const settleO=(el,get)=>{ if(!el) return; const w=()=>{ try{ el.value=V.fieldValue(get()); }catch(_){} };
          el.onchange=w; el.onblur=w; el.onkeydown=(e)=>{ if(e.key==='Enter'){ e.preventDefault(); applyO(); w(); el.blur(); } }; };
        settleO(ob,()=>{ const o=(V.list().find(x=>x.id===sel)||{}); return o.low; });
        settleO(ot,()=>{ const o=(V.list().find(x=>x.id===sel)||{}); return o.high; });
        if(oc) oc.oninput=()=>{ V.updateObj(sel,{color:oc.value});
          const sw=box.querySelector('[data-v3d="'+sel+'"] .rl-sw'); if(sw) sw.style.background=oc.value; };
        if(oo) oo.oninput=()=>{ V.updateObj(sel,{opacity:parseFloat(oo.value)}); };
      };
      sync();
      /* A stroke shape finishes without any map click, so the module tells the panel directly. */
      try{ if(V&&V.onDone) V.onDone(sync); }catch(_){}
      /* (#R172) the fields are in the CHOSEN UNIT; the model is always metres. A half-typed value ('', '-',
         '.') must still reach setAltitudes unchanged so its _num() guard can keep the old number — converting
         it here first would turn '' into 0 m and re-introduce exactly the bug #R171 fixed. */
      const _toM=(raw)=>{ const s=String(raw==null?'':raw).trim();
        if(s===''||s==='-'||s==='+'||s==='.'||s==='-.') return s;      /* not a number yet — pass it through */
        const n=Number(s); return isFinite(n)?V.fromUnit(n):s; };
      const applyAlt=()=>{ if(!V) return; V.setAltitudes(_toM(bI&&bI.value), _toM(tI&&tI.value)); sync(); };
      if(bI) bI.oninput=applyAlt; if(tI) tI.oninput=applyAlt;
      /* On blur / Enter, write the value the model actually holds back into the field — that is where the
         clamp becomes visible, and it is late enough that it can never fight the keyboard. */
      const settle=(el,get)=>{ if(!el) return; const w=()=>{ try{ el.value=V.fieldValue(get()); }catch(_){} };
        el.onchange=w; el.onblur=w; el.onkeydown=(e)=>{ if(e.key==='Enter'){ e.preventDefault(); applyAlt(); w(); el.blur(); } }; };
      settle(bI, ()=>V.base()); settle(tI, ()=>V.top());
      /* unit picker — the band is unchanged, only how it is written. Rewrite both fields in the new unit
         (and their step), then refresh the derived rows; nothing about the volume moves. */
      { const uS=p.querySelector('#v3d-unit');
        if(uS) uS.onchange=()=>{ if(!V) return; V.setUnit(uS.value);
          try{ if(bI){ bI.value=V.fieldValue(V.base()); bI.step=V.fieldStep(); }
               if(tI){ tI.value=V.fieldValue(V.top()); tI.step=V.fieldStep(); } }catch(_){}
          sync(); }; }
      { const sb=p.querySelector('#v3d-seal'); if(sb) sb.onclick=()=>{ if(!V) return; V.seal(!V.isSealed()); sync(); }; }
      /* shape picker — switching starts a fresh footprint (see setShape) */
      p.querySelectorAll('.v3d-shape').forEach(b=>{ b.onclick=()=>{ if(!V) return;
        V.setShape(b.getAttribute('data-shape'));
        HOST.measurePoints=[]; HOST.refreshTool();
        updateToolPanel(); }; });
      /* colour + opacity — repaint only, so these never rebuild the panel either */
      const col=p.querySelector('#v3d-color'), op=p.querySelector('#v3d-op');
      const mark=()=>p.querySelectorAll('[data-v3dcol]').forEach(b=>b.classList.toggle('on',(b.getAttribute('data-v3dcol')||'').toLowerCase()===String(V&&V.color()).toLowerCase()));
      if(col) col.oninput=()=>{ if(V) V.setStyle(col.value,null); mark(); };
      if(op) op.oninput=()=>{ if(V) V.setStyle(null,parseFloat(op.value)); };
      p.querySelectorAll('[data-v3dcol]').forEach(b=>{ b.onclick=()=>{ const c=b.getAttribute('data-v3dcol'); if(V) V.setStyle(c,null); if(col) col.value=c; mark(); }; });
      const kp=p.querySelector('#v3d-keep'); if(kp) kp.onclick=()=>{ try{ if(V) V.keep(); }catch(_){} };
      /* (#R183) save the finished body and start the next one. The measure tool's clicked vertices are
         cleared alongside the module's ring, otherwise the very next panel refresh would push them back
         in through syncClicks and the "cleared" footprint would reappear. */
      { const sv=p.querySelector('#v3d-save'); if(sv) sv.onclick=()=>{ if(!V||!V.commit) return;
          const id=V.commit(); if(!id) return;
          HOST.measurePoints=[]; try{ HOST.refreshTool(); }catch(_){}
          try{ if(bI) bI.value=V.fieldValue(V.base()); if(tI) tI.value=V.fieldValue(V.top()); }catch(_){}
          sync(); }; }
      /* 「クリックして選択」 — a click on a saved footprint selects it. Bound once, guarded by the tool
         being open, and it does NOT swallow the click: the measure tool still gets its vertex, because
         a click that both selects an object and extends the footprint is what the user asked for when
         the two overlap. Point-in-polygon lives in js/volume3d.js (pickAt) so the test is exact and
         renderer-independent. */
      if(!updateToolPanel._v3dClick){ updateToolPanel._v3dClick=true;
        try{ window.IntMapGeoEngine.events.on('click',(e)=>{
          try{ if(HOST.toolMode!=='volume') return; const W=window.IntMapVolume3D; if(!W||!W.pickAt) return;
            const ll=e&&e.lngLat; if(!ll) return;
            const hit=W.pickAt(ll.lng,ll.lat);
            if(hit){ W.select(hit===W.selected()?null:hit); try{ HOST.refreshTool(); }catch(_){} }
          }catch(_){}
        }); }catch(_){}
      }
    }
    if(HOST.toolMode==='radius'){
      const r=p.querySelector('#radius-range'), n=p.querySelector('#radius-num'), op=p.querySelector('#radius-op'), pre=p.querySelector('#radius-preset'), col=p.querySelector('#radius-color');
      /* (#R11) When a circle is "active" (just dropped, esp. from a pin / map-click popup), the slider /
         color / opacity edit THAT circle live — not just the defaults for the next one. */
      const applyActive=()=>{ if(!window._activeRadiusId) return; const c=HOST.radiusItems.find(x=>x.id===window._activeRadiusId); if(c){ c.radiusKm=HOST.radiusKm; c.color=HOST.radiusColor; c.opacity=HOST.radiusOpacity; HOST.refreshTool(); } };
      /* (#R15d) Radius input unit toggle (km/mi) — imperial is selectable even when the app default is
         metric. The slider stays km internally; only the number field + its unit follow the toggle. */
      const unitSel=p.querySelector('#radius-unit'); if(unitSel && (window.unitMode==='imperial')) unitSel.value='mi';
      const rImp=()=>!!(unitSel && unitSel.value==='mi');
      const dispVal=(km)=> rImp()? Math.round(km/1.60934*100)/100 : km;
      const refresh=()=>{ const rc=p.querySelector('#rad-c'), ra=p.querySelector('#rad-a'); if(rc) rc.innerHTML=HOST.distHTML(2*Math.PI*HOST.radiusKm); if(ra) ra.innerHTML=HOST.areaHTML(Math.PI*HOST.radiusKm*HOST.radiusKm); };   /* (#R147) radius tile removed */
      const setR=(v,fromInput)=>{ HOST.radiusKm=v; if(!fromInput)n.value=dispVal(v); r.value=Math.min(20000,v); refresh(); applyActive(); };
      r.oninput=()=>setR(Math.max(1,+r.value));
      n.oninput=()=>{ const raw=parseFloat(n.value); if(!isNaN(raw)&&raw>0){ const km=rImp()? raw*1.60934 : raw; setR(km,true); } };
      /* (#R33) −/＋ steppers for the radius (10% per tap, min 1km). */
      { const dec=p.querySelector('#radius-dec'), inc=p.querySelector('#radius-inc');
        const step=(f)=>{ const nv=Math.max(1, Math.round(HOST.radiusKm*f)); setR(nv); };
        if(dec) dec.onclick=()=>step(0.9); if(inc) inc.onclick=()=>step(1.1111); }
      if(unitSel){ unitSel.onchange=()=>{ n.value=dispVal(HOST.radiusKm); }; unitSel.value=rImp()?'mi':'km'; n.value=dispVal(HOST.radiusKm); }
      op.oninput=()=>{ HOST.radiusOpacity=parseFloat(op.value); applyActive(); };
      const markPreset=()=>{ p.querySelectorAll('.rad-preset').forEach(b=>b.classList.toggle('on',(b.getAttribute('data-col')||'').toLowerCase()===HOST.radiusColor.toLowerCase())); };
      col.oninput=()=>{ HOST.radiusColor=col.value; markPreset(); applyActive(); };
      /* R / G / B quick presets (#R7) — one tap sets the circle color; the swatch ring shows the
         active choice. The color picker remains for any custom color. */
      p.querySelectorAll('.rad-preset').forEach(b=>{ b.onclick=()=>{ HOST.radiusColor=b.getAttribute('data-col'); col.value=HOST.radiusColor; markPreset(); applyActive(); }; });
      pre.onchange=()=>{ const v=parseFloat(pre.value); if(v>0) setR(v); };
    }
  }

  async function aiSummarizeArea(){
    if(!HOST.aiGate()) return;
    if(!HOST.hasTurf()){ HOST.aiToast('Turf.js unavailable'); return; }
    let inside=null;
    if(HOST.toolMode==='radius'){
      if(!HOST.radiusItems.length){ HOST.aiToast(HOST.t('aiSumNoArea')); return; }
      inside=(lng,lat)=>HOST.radiusItems.some(c=>{ try{ return turf.distance(turf.point(c.center),turf.point([lng,lat]),{units:'kilometers'})<=c.radiusKm; }catch(_){ return false; } });
    } else if(HOST.toolMode==='area'){
      if(HOST.measurePoints.length<3){ HOST.aiToast(HOST.t('aiSumNoArea')); return; }
      let poly; try{ poly=turf.polygon([[...HOST.measurePoints,HOST.measurePoints[0]]]); }catch(_){ HOST.aiToast(HOST.t('aiSumNoArea')); return; }
      inside=(lng,lat)=>{ try{ return turf.booleanPointInPolygon(turf.point([lng,lat]),poly); }catch(_){ return false; } };
    } else { return; }
    const seen=new Set(), picked=[];
    HOST.newsFeatures.forEach(f=>{ const c=f.geometry&&f.geometry.coordinates, p=f.properties||{}; if(!c||!inside(c[0],c[1])) return; const k=p.link||p.title; if(seen.has(k)) return; seen.add(k); picked.push(p); });
    const uniq=picked.slice(0,40);
    if(!uniq.length){ HOST.aiToast(HOST.t('aiSumNoNews')); return; }
    HOST._aiAreaSummarize(uniq,'aiSumTitle');
  }

  /* ══ (#R204) THE RIGHT-CLICK MENU IS GROUPED, NOT LISTED ═══════════════════════════════════════
     「地図を右クリックしたときのポップアップが煩雑になっているから整理して」

     It had grown to fifteen buttons in one flat run with a single divider in the middle, added one
     round at a time (#R8c, #R9, #R15c, #R40, #R42, #R176 …) — so "Street View here" sat next to
     "Terrain & water flow" and nothing said which of them was an action on the point and which
     opened a simulator. Nothing is removed and nothing is renamed: the same fifteen entries are
     put under four headings that say what the group is FOR, in the order a hand reaches for them.

       この地点        — the coordinate itself: ask, look, pin, copy, share, post
       計測            — the two tools that START from the clicked point
       ここの情報      — live lookups about the point: weather, runways
       解析・シミュレーション — the five things that open a model of it

     The heading style (`.ctx-head`) is the one the coordinate line has always used, so this needed
     no CSS. `--sheet-cover` clamping and the scroll cap below already handle a menu taller than the
     visible map, which four extra heading rows make slightly more likely on a phone.

     ══ (#R205) …AND THAT WAS NOT 整理, IT WAS SORTING ══════════════════════════════════════════════
     Reported again, word for word, with the verdict on the round above: 「いや分類しただけで整理とか
     あほか」. Fair — #R204 made twenty rows out of fifteen. The four headings are now BUTTONS: each
     one owns the entries beneath it, every section starts closed, and opening one closes the others.
     The open menu is the coordinate plus four rows. Nothing is removed, nothing is renamed, and the
     `items` array below is byte-for-byte the same list it was — only how it is rendered changed.
     ⚠ the coordinate is its own row (`coord`) rather than being welded to the first heading: it is a
     FACT about the click, not a group you can open, and it has to stay visible when everything is
     collapsed. */
  function showContextMenu(point,lngLat){
    const m=document.getElementById('ctx-menu'); const mc=document.getElementById('map-container').getBoundingClientRect();
    const L=(en,jp,de,ru,es)=>({en,jp,de,ru,es})[HOST.lang]||en;
    const items=[
      {coord:`${HOST.t('ctxThisPoint')}: ${HOST.fmtLL(lngLat.lng,lngLat.lat)}`},
      {h:HOST.t('ctxThisPoint'),head:true},
      {label:`${L('Ask Atlas about here','ここをAtlasに聞く','Atlas zu diesem Ort fragen','Спросить Atlas об этом месте','Preguntar a Atlas sobre aquí')}`, action:()=>{ try{ if(window.IntMapConsole&&window.IntMapConsole.askHere) window.IntMapConsole.askHere(lngLat); else if(window.IntMapConsole) window.IntMapConsole.open(); }catch(_){} }},
      {label:`🧍 ${L('Street View here','ここのストリートビュー','Street View hier','Просмотр улиц здесь','Street View aquí')}`, action:()=>{ try{ window.IntMapStreetView&&window.IntMapStreetView.open({lng:lngLat.lng,lat:lngLat.lat}); }catch(_){} }},
      {label:`📍 ${HOST.t('ctxDropPin')}`, action:()=>{ const id=HOST.addPin(lngLat.lng,lngLat.lat); HOST.openPinPopup(id); }},
      /* (#R8c) Alt-projection viewer removed (MapLibre renders only Mercator/Globe). (#R9) "Copy link to
         this view" removed per request — the live-permalink hash still restores a reload. */
      {label:`📋 ${HOST.t('ctxCopy')}`, action:()=>{ try{ navigator.clipboard.writeText(`${lngLat.lat.toFixed(5)}, ${lngLat.lng.toFixed(5)}`); }catch(_){} }},
      /* (#R40/#R42) Share the EXACT current state (position, zoom, projection, base map, layers, time-travel,
         compare) as a link — opens the surfaced IntMapShare panel (link shown + copy + native share). */
      {label:`🔗 ${L('Share this view','この表示を共有','Diese Ansicht teilen','Поделиться этим видом','Compartir esta vista')}`, action:()=>{ try{ window.IntMapShare&&window.IntMapShare.open(); }catch(_){} }},
      {label:`💬 ${HOST.t('ctxPostHere')}`, action:()=>{ if(!HOST.requireLogin()) return; HOST.pendingPostLoc=[lngLat.lng,lngLat.lat]; HOST.communityAddArmed=false; HOST.openComposeModal(); }},
      {h:L('Measure','計測','Messen','Измерение','Medir'),head:true},
      {label:`📏 ${HOST.t('ctxMeasureFrom')}`, action:()=>{ if(HOST.toolMode!=='measure') HOST.setTool('measure'); HOST.measurePoints=[[lngLat.lng,lngLat.lat]]; HOST.refreshTool(); updateToolPanel(); }},
      {label:`⭕ ${L('Radius from here','ここからの半径','Radius von hier','Радиус отсюда','Radio desde aquí')}`, action:()=>{ try{ window._radiusFromPoint(lngLat.lng,lngLat.lat); }catch(_){} }},
      {h:L('About this point','ここの情報','Zu diesem Punkt','Об этой точке','Sobre este punto'),head:true},
      {label:`🌤 ${L('Weather here (live)','ここの天気（最新）','Wetter hier (aktuell)','Погода здесь (сейчас)','El tiempo aquí (ahora)')}`, action:()=>{ try{ window.IntMapWeather&&window.IntMapWeather.open(lngLat); }catch(_){} }},
      {label:`🛬 ${L('Runway search (from here)','滑走路検索（ここから）','Start-/Landebahn-Suche (von hier)','Поиск ВПП (отсюда)','Búsqueda de pistas (desde aquí)')}`, action:()=>{ try{ window.RunwaySearch&&window.RunwaySearch.open(lngLat); }catch(_){} }},
      {h:L('Analysis & simulation','解析・シミュレーション','Analyse & Simulation','Анализ и моделирование','Análisis y simulación'),head:true},
      {label:`📡 ${L('Line of sight (radar shadow)','見通し線解析（レーダー死角）','Sichtlinie (Radarschatten)','Линия видимости (радиотень)','Línea de visión (sombra de radar)')}`, action:()=>{ try{ window.IntMapLOS&&window.IntMapLOS.open(lngLat); }catch(_){} }},
      {label:`🎯 ${L('Reachable area (drive/walk/cycle)','到達圏（車/徒歩/自転車）','Erreichbarkeit (Auto/Fuß/Rad)','Зона доступности (авто/пешком/вело)','Área alcanzable (coche/pie/bici)')}`, action:()=>{ try{ window.IntMapIsochrone&&window.IntMapIsochrone.open(lngLat); }catch(_){} }},
      /* (#R176) The three simulators this round added. They live HERE and in Atlas — not in the Measure
         menu, which is where the drone planner was and which the user rejected outright. */
      {label:`⛰💧 ${L('Terrain & water flow','地形編集・水流シミュレーター','Gelände & Wasser bearbeiten','Рельеф и водоток','Terreno y flujo de agua')}`, action:()=>{ try{ window.IntMapTerrainWater&&window.IntMapTerrainWater.open({lng:lngLat.lng,lat:lngLat.lat}); }catch(_){} }},
      {label:`🌐 ${L('Seismic waves from here','ここを震源に地震波シミュレーション','Seismische Wellen von hier','Сейсмические волны отсюда','Ondas sísmicas desde aquí')}`, action:()=>{ try{ window.IntMapSeismic&&window.IntMapSeismic.open({lng:lngLat.lng,lat:lngLat.lat}); }catch(_){} }},
      {label:`🌇 ${L('Sunlight hours & shade here','ここの日照時間・影を解析','Sonnenstunden & Schatten hier','Часы солнца и тени здесь','Horas de sol y sombra aquí')}`, action:()=>{ try{ if(window.IntMapSun){ window.IntMapSun.open(); if(window.IntMapSun.analysePoint) window.IntMapSun.analysePoint(lngLat.lng,lngLat.lat); } }catch(_){} }},
      /* (#R15c) Sea-route feature removed per request — repeatedly mis-routed (shallow endpoints / linear /
         cut across land). The IntMapRoute engine stays defined but is no longer reachable from the UI. */
      ...(HOST.userPins.length?[{divider:true},{label:`🗑 ${HOST.t('ctxClearPins')} (${HOST.userPins.length})`, action:HOST.clearAllPins}]:[])
    ];
    /* ══ (#R205) THE HEADINGS BECAME THE MENU ═══════════════════════════════════════════════════════
       Each `head` opens a section that holds the entries after it; every section starts CLOSED and
       only one is open at a time, so the popup is the coordinate + four rows (+ the pin row when
       there are pins) instead of twenty. `items` and its indices are untouched — the button's
       `data-act` is still its position in that array, for the reason in the ⚠ below — so nothing
       about what the menu DOES changed.
       ⚠ the button's index is its position in `items`, taken from the map's own index — `indexOf`
       returns the FIRST equal element, which two identically-labelled entries would collide on. */
    let html='', open=false, gi=0;
    items.forEach((it,i)=>{
      if(it.coord){ html+=`<div class="ctx-coord">${IntMapSafe.html(it.coord)}</div>`; return; }
      if(it.head){ if(open) html+='</div>'; gi++; open=true;
        html+=`<button class="ctx-grp" data-grp="${gi}" aria-expanded="false"><span>${IntMapSafe.html(it.h)}</span><span class="ctx-chev">▶</span></button>`
             +`<div class="ctx-sec" data-sec="${gi}" hidden>`; return; }
      if(it.divider){ if(open){ html+='</div>'; open=false; } html+=`<div class="ctx-divider"></div>`; return; }
      html+=`<button data-act="${i}">${it.label}</button>`;
    });
    if(open) html+='</div>';
    m.innerHTML=html;
    m.querySelectorAll('button[data-act]').forEach(b=>{ b.onclick=()=>{ const i=+b.getAttribute('data-act'); items[i].action(); m.style.display='none'; }; });
    m.querySelectorAll('.ctx-grp').forEach(b=>{ b.onclick=()=>{
      const g=b.getAttribute('data-grp'), sec=m.querySelector(`.ctx-sec[data-sec="${g}"]`), was=b.getAttribute('aria-expanded')==='true';
      m.querySelectorAll('.ctx-grp').forEach(o=>o.setAttribute('aria-expanded','false'));
      m.querySelectorAll('.ctx-sec').forEach(o=>{ o.hidden=true; });
      if(!was){ b.setAttribute('aria-expanded','true'); if(sec) sec.hidden=false; }
      /* re-clamp: the menu just changed height and may now hang off the bottom */
      try{ place(); }catch(_){}
    }; });
    m.style.display='block';
    place();
    /* (#R17) On mobile the bottom sheet covers the lower map; clamp the menu into the VISIBLE area above it
       (and cap its height so a long menu scrolls) — it was overflowing behind the sheet / off-screen.
       (#R205) …and it is a function now, because expanding a section changes the height after the fact. */
    function place(){
      let availBottom=mc.height; try{ const mcEl=document.getElementById('map-container'); const cover=parseFloat(getComputedStyle(mcEl).getPropertyValue('--sheet-cover'))||0; const isM=window.matchMedia&&window.matchMedia('(max-width:768px)').matches; if(isM&&cover>0){ availBottom=mc.height-cover-8; m.style.maxHeight=Math.max(160,availBottom-56)+'px'; m.style.overflowY='auto'; } else { m.style.maxHeight=''; m.style.overflowY=''; } }catch(_){}
      const rect=m.getBoundingClientRect();
      let x=point.x, y=point.y;
      if(x+rect.width>mc.width) x=mc.width-rect.width-8;
      if(y+rect.height>availBottom) y=availBottom-rect.height-8;
      m.style.left=Math.max(8,x)+'px'; m.style.top=Math.max(8,y)+'px';
    }
  }

  /* The names index.html still calls: it keeps a hoisted shim for each (#R168). */
  return { updateToolPanel, buildToolFeatures, showContextMenu };
};
