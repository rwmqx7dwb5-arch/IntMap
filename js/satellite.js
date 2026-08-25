/* ============================================================================
 *  IntMap · Satellite imagery controller  (#R169)
 * ----------------------------------------------------------------------------
 *  Moved VERBATIM out of the index.html DOMContentLoaded closure (Architecture.md §3.1).
 *  Every statement here is a DECLARATION — the factory runs no app code, so it can be
 *  instantiated with the other #R168/#R169 factories right after `map` exists.
 *  The only edit to the moved text is that free references to closure variables became
 *  HOST.<member> reads/writes.
 * ==========================================================================*/
window.IntMapModules=window.IntMapModules||{};
window.IntMapModules.satellite=function(HOST){
 const GE=()=>window.IntMapGeoEngine;   /* (#R178) the renderer, through the contract — never the raw handle */
  /* (#R170) "Is it safe to addSource/addLayer right now?" — the app-wide predicate declared in index.html.
     A function DECLARATION so nested closures above this line can call it (no TDZ). Falls back to the old
     isStyleLoaded() test only if the host is somehow absent. */
  function _imCanDraw(){ try{ return !!HOST.canDraw(); }catch(_){ try{ return !!GE().ready(); }catch(__){ return false; } } }
  const saveSatKeys=()=>{ try{ localStorage.setItem('intmap_sat_keys',JSON.stringify(HOST.satKeys)); }catch(_){} };
  const satProviderById=(id)=>HOST.SAT_PROVIDERS.find(p=>p.id===id);
  /* BYOK/paid satellite providers require Pro AND a saved key; free providers are always usable. */
  const satHasKey=(p)=>p.tier==='free' || (HOST.imIsPro() && !!(HOST.satKeys[p.keyName]&&String(HOST.satKeys[p.keyName]).trim()));
  const satMaxDay=()=>new Date().toISOString().slice(0,10);
  /* (#R246) the provider names are tuples held as data — see IntMapLang.pickArgs(). ⚠ BUILT ON FIRST
     USE, not at factory level: tests/r169 #4 requires a factory body to DECLARE and never to run. */
  let _LS=null; const LS=()=>(_LS||(_LS=window.IntMapLang.pick(()=>HOST.lang)));
  function satMsg(key,p){ return String(HOST.t(key)||'').replace('{provider}',(p&&(LS().arr(p.name)||p.short))||''); }
  function satCaptureLabel(p){ if(!p) return ''; if(!p.dated) return HOST.t('satLatest'); if(p.dateMode==='year') return HOST.satState.year+' '+HOST.t('satMosaicSuffix'); return HOST.satState.day; }
  function satChipHTML(){ const p=satProviderById(HOST.satState.providerId); if(!p) return ''; return `<span class="cr-sat">📡 ${p.short} · ${satCaptureLabel(p)}</span>`; }
  function satRefreshReadout(){ try{ HOST.renderCoordReadout(); }catch(_){} }
  function satToast(msg){
    let el=document.getElementById('sat-toast');
    if(!el){ el=document.createElement('div'); el.id='sat-toast'; el.className='sat-toast'; document.body.appendChild(el); }
    el.textContent=msg; el.classList.add('show');
    clearTimeout(satToast._t); satToast._t=setTimeout(()=>el.classList.remove('show'),4400);
  }
  /* Self-rescheduling style-ready guard (same pattern that fixed the layer race). */
  function satReady(cb,n){ n=n||0; if(_imCanDraw()){ try{cb();}catch(_){ } return; } if(n>80) return; setTimeout(()=>satReady(cb,n+1),160); }
  function satBuildTiles(p){
    const da=p.dateMode==='year'?HOST.satState.year:HOST.satState.day;
    if(p.tier==='pro'){ const k=HOST.satKeys[p.keyName]; if(!k||!String(k).trim()) return null; return p.tiles(da,String(k).trim()); }
    return p.tiles(da);
  }
  /* Core: load the selected provider into the idle buffer, then cross-fade (double-buffering). */
  function satApply(animate){
    if(!GE().hasRenderer()) return;
    const p=satProviderById(HOST.satState.providerId); if(!p) return;
    HOST.satErrCount=0;
    /* Esri = the always-present base layer (layer-sat): no buffer needed → it is our fallback. */
    if(p.id==='esri'){ satShowBase(animate); return; }
    const tiles=satBuildTiles(p);
    if(!tiles){ satToast(HOST.t('satLocked')); satRevertToFallback(); return; }
    if(GE().layers.has('layer-sat')) GE().layers.setPaint('layer-sat','raster-opacity',1); /* solid fallback under the buffer */
    const target=(HOST.satActive===0)?1:0, srcId='sat-src-'+target, lyrId='sat-fx-'+target;
    try{ if(GE().layers.has(lyrId)) GE().layers.remove(lyrId); if(GE().layers.hasSource(srcId)) GE().layers.removeSource(srcId); }catch(_){}
    try{
      GE().layers.addSource(srcId,{type:'raster',tiles:tiles,tileSize:256,maxzoom:p.maxzoom||19,attribution:p.attribution||''});
      const before=GE().layers.has('layer-sat-labels')?'layer-sat-labels':undefined;
      GE().layers.add({id:lyrId,type:'raster',source:srcId,layout:{visibility:'visible'},
        paint:{'raster-opacity':animate?0:HOST.satState.opacity,'raster-opacity-transition':{duration:animate?450:0}}},before);
    }catch(e){ console.warn('satApply add failed',e); return; }
    const prev=HOST.satActive;
    const finish=()=>{
      if(GE().layers.has(lyrId)) GE().layers.setPaint(lyrId,'raster-opacity',HOST.satState.opacity);
      if(prev!==-1 && prev!==target){
        const pl='sat-fx-'+prev, ps='sat-src-'+prev;
        if(GE().layers.has(pl)){ GE().layers.setPaint(pl,'raster-opacity-transition',{duration:450}); GE().layers.setPaint(pl,'raster-opacity',0); }
        setTimeout(()=>{ if(HOST.satActive!==prev){ try{ if(GE().layers.has(pl)) GE().layers.remove(pl); if(GE().layers.hasSource(ps)) GE().layers.removeSource(ps); }catch(_){} } },520);
      }
      HOST.satActive=target; HOST.satLastGood=HOST.satState.providerId; HOST.satErrCount=0;
    };
    if(!animate){ finish(); return; }
    let done=false;
    const onData=(e)=>{ if(e&&e.sourceId===srcId&&e.isSourceLoaded){ if(done)return; done=true; GE().events.off('sourcedata',onData); finish(); } };
    GE().events.on('sourcedata',onData);
    setTimeout(()=>{ if(!done){ done=true; GE().events.off('sourcedata',onData); finish(); } },1900);
  }
  function satShowBase(animate){
    if(HOST.satActive!==-1){
      const a=HOST.satActive, pl='sat-fx-'+a, ps='sat-src-'+a;
      if(GE().layers.has(pl)){ GE().layers.setPaint(pl,'raster-opacity-transition',{duration:animate?450:0}); GE().layers.setPaint(pl,'raster-opacity',0); }
      setTimeout(()=>{ if(HOST.satState.providerId==='esri'){ try{ if(GE().layers.has(pl)) GE().layers.remove(pl); if(GE().layers.hasSource(ps)) GE().layers.removeSource(ps); }catch(_){} } },animate?520:0);
      HOST.satActive=-1;
    }
    if(GE().layers.has('layer-sat')) GE().layers.setPaint('layer-sat','raster-opacity',HOST.satState.opacity);
    HOST.satLastGood='esri';
  }
  function satSetOpacity(v){
    HOST.satState.opacity=v;
    const p=satProviderById(HOST.satState.providerId);
    if(p&&p.id==='esri'){ if(GE().layers.has('layer-sat')) GE().layers.setPaint('layer-sat','raster-opacity',v); }
    else if(HOST.satActive!==-1&&GE().layers.has('sat-fx-'+HOST.satActive)){ GE().layers.setPaint('sat-fx-'+HOST.satActive,'raster-opacity',v); }
  }
  function satSelectProvider(id){
    const p=satProviderById(id); if(!p) return;
    if(!satHasKey(p)){ satToast(HOST.t('satLocked')); satRenderController(); return; }
    HOST.satState.providerId=id; HOST.satErrCount=0; HOST.satAutoBackoff=0;
    satRenderController(); satApply(true); satRefreshReadout();
  }
  function satStepDay(delta,auto){
    if(!auto) HOST.satAutoBackoff=0;
    const d=new Date(HOST.satState.day+'T00:00:00Z'); if(isNaN(d.getTime())) return;
    d.setUTCDate(d.getUTCDate()+delta);
    let s=d.toISOString().slice(0,10); const today=satMaxDay(); if(s>today) s=today;
    HOST.satState.day=s;
    const inp=document.getElementById('satc-day'); if(inp) inp.value=s;
    satApply(true); satRefreshReadout();
  }
  function satRevertToFallback(){
    const fb=(HOST.satLastGood&&HOST.satLastGood!==HOST.satState.providerId)?HOST.satLastGood:'esri';
    HOST.satState.providerId=fb; HOST.satErrCount=0;
    satRenderController(); satApply(true); satRefreshReadout();
  }
  /* Render-state tracking: tile/auth failures on a sat buffer → notify + fall back. */
  function satOnError(e){
    if(!e||!e.sourceId||String(e.sourceId).indexOf('sat-src-')!==0) return;
    const p=satProviderById(HOST.satState.providerId); if(!p) return;
    const st=e.error&&e.error.status;
    if(st===401||st===403){ satToast(satMsg('satErrAuth',p)); HOST.satErrCount=0; satRevertToFallback(); return; }
    HOST.satErrCount++;
    /* Dated GIBS day-layers: the latest day may not be processed yet → walk back to the freshest
       AVAILABLE day before giving up, so "latest" really means latest-that-exists. */
    if(p.dated && p.dateMode==='day' && HOST.satAutoBackoff<5 && HOST.satErrCount>=2){
      HOST.satAutoBackoff++; HOST.satErrCount=0; satStepDay(-1,true); return;
    }
    if(HOST.satErrCount>=4){ HOST.satErrCount=0; satToast(satMsg('satErrTiles',p)); satRevertToFallback(); }
  }
  /* Sat-Controller panel (provider + capture-date + opacity). Rebuilt on change / language. */
  function satRenderController(){
    const panel=document.getElementById('sat-controller'); if(!panel) return;
    const p=satProviderById(HOST.satState.providerId)||HOST.SAT_PROVIDERS[0];
    let opts='';
    HOST.SAT_PROVIDERS.forEach(pr=>{
      const sel=pr.id===HOST.satState.providerId?' selected':'', nm=LS().arr(pr.name);
      if(pr.tier==='free') opts+=`<option value="${pr.id}"${sel}>${nm}</option>`;
      else { const has=satHasKey(pr); opts+=`<option value="${pr.id}"${sel}${has?'':' disabled'}>${has?'':'🔒 '}${nm}${has?'':' — '+HOST.t('satLocked')}</option>`; }
    });
    let dateCtrl;
    if(p.dated&&p.dateMode==='day'){
      dateCtrl=`<div class="satc-row"><label>${HOST.t('satDate')}</label><div class="satc-date"><button class="satc-step" id="satc-prev" title="${HOST.t('satPrevDay')}">◀</button><input type="date" id="satc-day" value="${HOST.satState.day}" max="${satMaxDay()}"><button class="satc-step" id="satc-next" title="${HOST.t('satNextDay')}">▶</button></div></div>`;
    } else if(p.dated&&p.dateMode==='year'){
      const yo=p.years.map(y=>`<option value="${y}"${y===HOST.satState.year?' selected':''}>${y}</option>`).join('');
      dateCtrl=`<div class="satc-row"><label>${HOST.t('satDate')}</label><select id="satc-year">${yo}</select></div>`;
    } else {
      dateCtrl=`<div class="satc-row"><label>${HOST.t('satDate')}</label><span class="satc-latest">${HOST.t('satLatest')}</span></div>`;
    }
    panel.innerHTML=`<div class="satc-head">📡 <span>${HOST.t('satCtrlTitle')}</span><button id="satc-close" title="${window.IntMapLang.t(HOST.lang,'Close','閉じる','Schließen','Закрыть','Cerrar')}" aria-label="${window.IntMapLang.t(HOST.lang,'Close','閉じる','Schließen','Закрыть','Cerrar')}" style="margin-left:auto;background:transparent;border:none;color:var(--text-muted);width:26px;height:26px;font-size:22px;font-weight:300;line-height:1;cursor:pointer;">×</button></div>`+
      `<div class="satc-row"><label>${HOST.t('satProvider')}</label><select id="satc-provider">${opts}</select></div>`+
      dateCtrl+
      `<div class="satc-row"><label>${HOST.t('opacity')}</label><input type="range" id="satc-op" min="0.2" max="1" step="0.05" value="${HOST.satState.opacity}"></div>`+
      aiSatChangeBlockHTML(p)+
      `<div class="satc-attr">${p.attribution||''}</div>`;
    const sp=panel.querySelector('#satc-provider'); if(sp) sp.onchange=ev=>satSelectProvider(ev.target.value);
    const dd=panel.querySelector('#satc-day'); if(dd) dd.onchange=ev=>{ HOST.satState.day=ev.target.value||HOST.satState.day; satApply(true); satRefreshReadout(); };
    const yy=panel.querySelector('#satc-year'); if(yy) yy.onchange=ev=>{ HOST.satState.year=parseInt(ev.target.value,10)||HOST.satState.year; satApply(true); satRefreshReadout(); };
    const pv=panel.querySelector('#satc-prev'); if(pv) pv.onclick=()=>satStepDay(-1);
    const nx=panel.querySelector('#satc-next'); if(nx) nx.onclick=()=>satStepDay(1);
    const op=panel.querySelector('#satc-op'); if(op) op.oninput=ev=>satSetOpacity(parseFloat(ev.target.value));
    const cb=panel.querySelector('#ai-satchange-btn'); if(cb){ cb.classList.toggle('ai-needs-key',!HOST.aiVisionReady()); cb.title=HOST.aiVisionReady()?'':(HOST.aiReady()?HOST.t('aiNoVision'):HOST.t('aiNoKey')); cb.onclick=aiSatChangeDetect; }
    const cl=panel.querySelector('#satc-close'); if(cl) cl.onclick=()=>{ HOST.satPanelDismissed=true; panel.style.display='none'; };
  }
  /* Settings-modal API-key management (Pro / BYOK providers). */
  function satRenderKeyInputs(){
    const wrap=document.getElementById('sat-keys-list'); if(!wrap) return;
    /* ⚠ (#R465) wired HERE, not at factory level: this file's factory only ever DECLARES
       (tests/r169 #4 — that is what makes calling it early safe), and the first paint is also the
       first moment there is anything for a relabel to rewrite. */
    if(!satRenderKeyInputs._lang){ satRenderKeyInputs._lang=1; try{ window.addEventListener('intmap-lang',satRelabelKeyInputs); }catch(_){} }
    /* Only Pro users may register their own (paid) satellite imagery providers. */
    if(!HOST.imIsPro()){
      wrap.innerHTML=`<div style="font-size:12.5px;color:var(--text-muted);line-height:1.55;padding:4px 0;">${window.IntMapLang.t(HOST.lang,'🔒 Only <b>Pro</b> users can add their own satellite imagery services (API integrations).','🔒 独自の衛星画像サービス（API連携）を追加できるのは <b>Pro</b> ユーザーのみです。','🔒 Nur <b>Pro</b>-Nutzer können eigene Satellitenbild-Dienste (API-Integrationen) hinzufügen.','🔒 Только пользователи <b>Pro</b> могут добавлять собственные сервисы спутниковых снимков (API).','🔒 Solo los usuarios <b>Pro</b> pueden añadir sus propios servicios de imágenes satelitales (API).')}<br><button type="button" id="sat-keys-upgrade" style="margin-top:8px;background:linear-gradient(135deg,#ffe08a,#e9b949);color:#7a5a00;border:none;padding:8px 14px;border-radius:8px;font-weight:700;font-size:12px;cursor:pointer;">${window.IntMapLang.t(HOST.lang,'See IntMap Pro','IntMap Pro を見る','IntMap Pro ansehen','Смотреть IntMap Pro','Ver IntMap Pro')}</button></div>`;
      const up=wrap.querySelector('#sat-keys-upgrade'); if(up) up.onclick=()=>{ try{ if(typeof window.openProModal==='function') window.openProModal(); }catch(_){} };
      return;
    }
    wrap.innerHTML=HOST.SAT_PROVIDERS.filter(p=>p.tier==='pro').map(p=>{
      const v=HOST.satKeys[p.keyName]||'', on=!!String(v).trim();
      const nm=(p.keyLabel&&LS().arr(p.keyLabel))||LS().arr(p.name);
      return `<div class="sat-key-row"><div class="sat-key-top"><span class="sat-key-name">${nm}</span>`+
        `<span class="sat-key-status ${on?'on':''}">${on?'● '+HOST.t('satKeyConnected'):'○ '+HOST.t('satKeyNone')}</span></div>`+
        `<input type="text" class="sat-key-input" data-keyname="${p.keyName}" value="${String(v).replace(/"/g,'&quot;')}" placeholder="${String(p.keyPh||'').replace(/"/g,'&quot;')}" autocomplete="off" autocapitalize="off" spellcheck="false"></div>`;
    }).join('');
  }
  /* ══ (#R465) THE LANGUAGE CAN CHANGE WHILE THIS LIST IS ON SCREEN ═════════════════════════════
     satRenderKeyInputs() runs when Settings opens, and the language <select> is in that same dialog,
     so the provider names and the ●/○ status words kept the language the dialog was opened in.
     ⚠ RELABEL, DO NOT RE-RENDER, on the Pro path: the rebuild writes `value=` from the SAVED keys
     (satSaveKeyInputs is the Apply step), so re-running it would wipe a key that had been typed and
     not yet applied. The locked (non-Pro) panel has no input in it, so it is simply rebuilt. */
  function satRelabelKeyInputs(){
    const wrap=document.getElementById('sat-keys-list'); if(!wrap) return;
    if(!HOST.imIsPro()){ satRenderKeyInputs(); return; }
    wrap.querySelectorAll('.sat-key-row').forEach(row=>{
      const inp=row.querySelector('.sat-key-input'); if(!inp) return;
      const p=HOST.SAT_PROVIDERS.find(x=>x.keyName===inp.getAttribute('data-keyname')); if(!p) return;
      const nm=row.querySelector('.sat-key-name'); if(nm) nm.textContent=(p.keyLabel&&LS().arr(p.keyLabel))||LS().arr(p.name);
      const st=row.querySelector('.sat-key-status');
      if(st){ const on=st.classList.contains('on'); st.textContent=on?('● '+HOST.t('satKeyConnected')):('○ '+HOST.t('satKeyNone')); }
    });
  }
  function satSaveKeyInputs(){
    const wrap=document.getElementById('sat-keys-list'); if(!wrap) return;
    wrap.querySelectorAll('.sat-key-input').forEach(inp=>{ const k=inp.getAttribute('data-keyname'), val=inp.value.trim(); if(val) HOST.satKeys[k]=val; else delete HOST.satKeys[k]; });
    saveSatKeys();
    const cur=satProviderById(HOST.satState.providerId);
    if(cur&&cur.tier==='pro'&&!satHasKey(cur)&&HOST.mapType==='sat') satRevertToFallback();
    else if(HOST.mapType==='sat') satRenderController();
  }
  function satSetup(){
    if(!GE().hasRenderer()) return;
    if(!satSetup._wired){ satSetup._wired=true; try{ GE().events.on('error',satOnError); }catch(_){}
      /* (#R24) auto-dismiss the FLOATING satellite controller when the user starts operating elsewhere
         ("それ以外の場所を操作し始めたら自動で消える"); it re-opens via the Satellite button (which resets
         satPanelDismissed). On mobile it lives inside the sheet (not floating), so leave that one alone. */
      const _satDismiss=()=>{ try{ const p=document.getElementById('sat-controller');
        if(p && p.style.display==='block' && !(window.matchMedia&&window.matchMedia('(max-width:768px)').matches)){ HOST.satPanelDismissed=true; p.style.display='none'; } }catch(_){} };
      try{ GE().events.on('dragstart',_satDismiss); GE().events.on('zoomstart',(e)=>{ if(e&&e.originalEvent) _satDismiss(); }); }catch(_){}
      document.addEventListener('pointerdown',(e)=>{ try{ const p=document.getElementById('sat-controller');
        if(p && p.style.display==='block' && e.target && !e.target.closest('#sat-controller') && !e.target.closest('#btn-view-sat')) _satDismiss(); }catch(_){} }, true);
    }
    if(HOST.mapType==='sat') satReady(()=>{ satRenderController(); satApply(false); });
  }
  /* ===== AI FEATURE 4: satellite change detection (vision) =====
     Capture the map canvas at two dates and ask a vision model to compare them. Requires
     preserveDrawingBuffer:true on the map (set in the map config) + a vision-capable model. */
  function aiSatChangeBlockHTML(p){
    if(!p||!p.dated) return '';
    const today=satMaxDay(); let inputs;
    if(p.dateMode==='year'){
      const yo=v=>(p.years||[]).map(y=>`<option value="${y}"${y===v?' selected':''}>${y}</option>`).join('');
      inputs=`<select id="aic-date-a">${yo((p.years||[])[0])}</select><span>→</span><select id="aic-date-b">${yo((p.years||[])[(p.years||[]).length-1])}</select>`;
    } else {
      const dA=new Date(Date.now()-33*864e5).toISOString().slice(0,10);
      inputs=`<input type="date" id="aic-date-a" value="${dA}" max="${today}"><span>→</span><input type="date" id="aic-date-b" value="${HOST.satState.day}" max="${today}">`;
    }
    return `<div class="aic-sec"><div class="aic-head">🛰 ${HOST.t('aiVisHead')}</div><div class="aic-dates">${inputs}</div><button class="ai-action-btn" id="ai-satchange-btn">✨ ${HOST.t('aiVisBtn')}</button></div>`;
  }
  function aiDownscaleDataURL(canvas,maxDim){
    try{ const w=canvas.width,h=canvas.height,s=Math.min(1,(maxDim||1024)/Math.max(w,h));
      const c=document.createElement('canvas'); c.width=Math.max(1,Math.round(w*s)); c.height=Math.max(1,Math.round(h*s));
      c.getContext('2d').drawImage(canvas,0,0,c.width,c.height); return c.toDataURL('image/jpeg',0.85);
    }catch(e){ return null; }
  }
  async function aiCaptureSatAt(p,val){
    if(p.dateMode==='year') HOST.satState.year=parseInt(val,10)||HOST.satState.year; else HOST.satState.day=val;
    try{ satApply(false); }catch(_){}
    await HOST.aiWaitMapIdle(5000);
    await new Promise(r=>setTimeout(r,500)); /* let the cross-fade buffer cleanup settle */
    return await aiCaptureCanvas(1024);
  }
  /* Read the WebGL canvas INSIDE a render tick so capture works without preserveDrawingBuffer
     (a WebGL drawing buffer is only guaranteed valid in the same frame it was drawn). */
  function aiCaptureCanvas(maxDim){
    return new Promise(res=>{
      if(!GE().hasRenderer()){ res(null); return; }
      let done=false; const grab=()=>{ if(done)return; done=true; try{ res(aiDownscaleDataURL(GE().render.canvas(),maxDim)); }catch(_){ res(null); } };
      try{ GE().events.once('render',grab); GE().render.triggerRepaint(); }catch(_){ grab(); }
      setTimeout(grab,900); /* safety net if no render event fires */
    });
  }
  async function aiSatChangeDetect(){
    if(!HOST.aiGate()) return;
    const aEl=document.getElementById('aic-date-a'), bEl=document.getElementById('aic-date-b');
    const va=aEl&&aEl.value, vb=bEl&&bEl.value;
    const btn=document.getElementById('ai-satchange-btn'); HOST.aiSetBtnBusy(btn,true,HOST.t('aiVisCapturing'));
    const cap=await window._imSatCapture(va,vb);
    HOST.aiSetBtnBusy(btn,false);
    if(cap.err){ HOST.aiToast(cap.err); return; }
    const imgA=cap.imgA, imgB=cap.imgB;
    const rep=HOST.aiReport({ title:HOST.t('aiVisTitle'), sub:HOST.t('aiVisSub').replace('{a}',va).replace('{b}',vb),
      images:[{src:imgA,caption:HOST.t('aiVisBefore')+' · '+va},{src:imgB,caption:HOST.t('aiVisAfter')+' · '+vb}] });
    const run=async()=>{
      rep.setLoading(HOST.t('aiThinking'));
      try{ const out=await window._imSatAnalyze(va,vb,imgA,imgB); rep.setBody(out||''); }
      catch(e){ rep.setError((e&&e.message)||HOST.t('aiError'),run); }
    };
    run();
  }
  return { aiCaptureSatAt, satApply, satBuildTiles, satCaptureLabel, satChipHTML, satHasKey, satProviderById, satReady, satRefreshReadout, satRenderController, satRenderKeyInputs, satRevertToFallback, satSaveKeyInputs, satSelectProvider, satSetOpacity, satSetup, satStepDay, satToast };
};
