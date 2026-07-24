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
window.IntMapModules.toolPanel=function(map,HOST){
  function bearingHTML(a,b){ const d=HOST.bearingDeg(a,b); return `${d.toFixed(1)}° <span class="unit-sub">(${HOST.compassDir(d)})</span>`; }

  /* (#R167) moved verbatim to js/tables.js — see Architecture.md §3.1. */
  const {RADIUS_PRESETS}=window.IntMapTables;

  /* Radius color quick-presets (#R7): R / G / B one-tap swatches alongside the custom color picker. */
  const RADIUS_COLOR_PRESETS=[{col:'#ff3b30',lbl:'R'},{col:'#34c759',lbl:'G'},{col:'#007aff',lbl:'B'}];

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
    } else if(HOST.toolMode==='area'){
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
    const titles={measure:'📏 '+HOST.t('measure'),area:'📐 '+HOST.t('areaTool'),radius:'⭕ '+HOST.t('radius')}; let body='';
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
    const cl=p.querySelector('#tp-clear'); if(cl) cl.onclick=()=>{ HOST.measurePoints=[]; if(HOST.toolMode==='area'){ HOST.toolMode='measure'; try{ HOST._syncToolBtns(); }catch(_){} } HOST.hideMeasureTip(); HOST.refreshTool(); updateToolPanel(); };
    const un=p.querySelector('#tp-undo'); if(un) un.onclick=()=>window._measureUndo();
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

  /* Context menu */
  function showContextMenu(point,lngLat){
    const m=document.getElementById('ctx-menu'); const mc=document.getElementById('map-container').getBoundingClientRect();
    const items=[
      {h:`${HOST.t('ctxThisPoint')}: ${HOST.fmtLL(lngLat.lng,lngLat.lat)}`,head:true},
      {label:`${HOST.lang==='jp'?'ここをAtlasに聞く':HOST.lang==='de'?'Atlas zu diesem Ort fragen':HOST.lang==='ru'?'Спросить Atlas об этом месте':HOST.lang==='es'?'Preguntar a Atlas sobre aquí':'Ask Atlas about here'}`, action:()=>{ try{ if(window.IntMapConsole&&window.IntMapConsole.askHere) window.IntMapConsole.askHere(lngLat); else if(window.IntMapConsole) window.IntMapConsole.open(); }catch(_){} }},
      {label:`🧍 ${HOST.lang==='jp'?'ここのストリートビュー':HOST.lang==='de'?'Street View hier':HOST.lang==='ru'?'Просмотр улиц здесь':HOST.lang==='es'?'Street View aquí':'Street View here'}`, action:()=>{ try{ window.IntMapStreetView&&window.IntMapStreetView.open({lng:lngLat.lng,lat:lngLat.lat}); }catch(_){} }},
      {label:`📍 ${HOST.t('ctxDropPin')}`, action:()=>{ const id=HOST.addPin(lngLat.lng,lngLat.lat); HOST.openPinPopup(id); }},
      {label:`📏 ${HOST.t('ctxMeasureFrom')}`, action:()=>{ if(HOST.toolMode!=='measure') HOST.setTool('measure'); HOST.measurePoints=[[lngLat.lng,lngLat.lat]]; HOST.refreshTool(); updateToolPanel(); }},
      {label:`⭕ ${HOST.lang==='jp'?'ここからの半径':HOST.lang==='de'?'Radius von hier':HOST.lang==='ru'?'Радиус отсюда':'Radius from here'}`, action:()=>{ try{ window._radiusFromPoint(lngLat.lng,lngLat.lat); }catch(_){} }},
      {label:`💬 ${HOST.t('ctxPostHere')}`, action:()=>{ if(!HOST.requireLogin()) return; HOST.pendingPostLoc=[lngLat.lng,lngLat.lat]; HOST.communityAddArmed=false; HOST.openComposeModal(); }},
      {divider:true},
      /* (#R8c) Alt-projection viewer removed (MapLibre renders only Mercator/Globe). (#R9) "Copy link to
         this view" removed per request — the live-permalink hash still restores a reload. */
      {label:`📋 ${HOST.t('ctxCopy')}`, action:()=>{ try{ navigator.clipboard.writeText(`${lngLat.lat.toFixed(5)}, ${lngLat.lng.toFixed(5)}`); }catch(_){} }},
      /* (#R40/#R42) Share the EXACT current state (position, zoom, projection, base map, layers, time-travel,
         compare) as a link — opens the surfaced IntMapShare panel (link shown + copy + native share). */
      {label:`🔗 ${HOST.lang==='jp'?'この表示を共有':HOST.lang==='de'?'Diese Ansicht teilen':HOST.lang==='ru'?'Поделиться этим видом':HOST.lang==='es'?'Compartir esta vista':'Share this view'}`, action:()=>{ try{ window.IntMapShare&&window.IntMapShare.open(); }catch(_){} }},
      {label:`🌤 ${HOST.lang==='jp'?'ここの天気（最新）':HOST.lang==='de'?'Wetter hier (aktuell)':HOST.lang==='ru'?'Погода здесь (сейчас)':HOST.lang==='es'?'El tiempo aquí (ahora)':'Weather here (live)'}`, action:()=>{ try{ window.IntMapWeather&&window.IntMapWeather.open(lngLat); }catch(_){} }},
      {label:`🛬 ${HOST.lang==='jp'?'滑走路検索（ここから）':HOST.lang==='de'?'Start-/Landebahn-Suche (von hier)':HOST.lang==='ru'?'Поиск ВПП (отсюда)':'Runway search (from here)'}`, action:()=>{ try{ window.RunwaySearch&&window.RunwaySearch.open(lngLat); }catch(_){} }},
      {label:`📡 ${HOST.lang==='jp'?'見通し線解析（レーダー死角）':HOST.lang==='de'?'Sichtlinie (Radarschatten)':HOST.lang==='ru'?'Линия видимости (радиотень)':'Line of sight (radar shadow)'}`, action:()=>{ try{ window.IntMapLOS&&window.IntMapLOS.open(lngLat); }catch(_){} }},
      {label:`🎯 ${HOST.lang==='jp'?'到達圏（車/徒歩/自転車）':HOST.lang==='de'?'Erreichbarkeit (Auto/Fuß/Rad)':HOST.lang==='ru'?'Зона доступности (авто/пешком/вело)':HOST.lang==='es'?'Área alcanzable (coche/pie/bici)':'Reachable area (drive/walk/cycle)'}`, action:()=>{ try{ window.IntMapIsochrone&&window.IntMapIsochrone.open(lngLat); }catch(_){} }},
      /* (#R15c) Sea-route feature removed per request — repeatedly mis-routed (shallow endpoints / linear /
         cut across land). The IntMapRoute engine stays defined but is no longer reachable from the UI. */
      ...(HOST.userPins.length?[{label:`🗑 ${HOST.t('ctxClearPins')} (${HOST.userPins.length})`, action:HOST.clearAllPins}]:[])
    ];
    m.innerHTML=items.map(it=>{
      if(it.divider) return `<div class="ctx-divider"></div>`;
      if(it.head) return `<div class="ctx-head">${it.h}</div>`;
      return `<button data-act="${items.indexOf(it)}">${it.label}</button>`;
    }).join('');
    m.querySelectorAll('button[data-act]').forEach(b=>{ b.onclick=()=>{ const i=+b.getAttribute('data-act'); items[i].action(); m.style.display='none'; }; });
    m.style.display='block';
    /* (#R17) On mobile the bottom sheet covers the lower map; clamp the menu into the VISIBLE area above it
       (and cap its height so a long menu scrolls) — it was overflowing behind the sheet / off-screen. */
    let availBottom=mc.height; try{ const mcEl=document.getElementById('map-container'); const cover=parseFloat(getComputedStyle(mcEl).getPropertyValue('--sheet-cover'))||0; const isM=window.matchMedia&&window.matchMedia('(max-width:768px)').matches; if(isM&&cover>0){ availBottom=mc.height-cover-8; m.style.maxHeight=Math.max(160,availBottom-56)+'px'; m.style.overflowY='auto'; } else { m.style.maxHeight=''; m.style.overflowY=''; } }catch(_){}
    const rect=m.getBoundingClientRect();
    let x=point.x, y=point.y;
    if(x+rect.width>mc.width) x=mc.width-rect.width-8;
    if(y+rect.height>availBottom) y=availBottom-rect.height-8;
    m.style.left=Math.max(8,x)+'px'; m.style.top=Math.max(8,y)+'px';
  }

  /* The names index.html still calls: it keeps a hoisted shim for each (#R168). */
  return { updateToolPanel, buildToolFeatures, showContextMenu };
};
