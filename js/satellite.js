/* ============================================================================
 *  IntMap · Satellite imagery controller  (#R169)
 * ----------------------------------------------------------------------------
 *  Moved VERBATIM out of the index.html DOMContentLoaded closure (Architecture.md §3.1).
 *  Every statement here is a DECLARATION — the factory runs no app code, so it can be
 *  instantiated with the other #R168/#R169 factories right after `map` exists.
 *  The only edit to the moved text is that free references to closure variables became
 *  HOST.<member> reads/writes.
 * ==========================================================================*/
import { IntMapGeoEngine } from './geo-engine.js';
import { IntMapLang } from './lang-registry.js';
import { captureAt, captureLine, rankAt, planClockMatch, sourceById, SOURCES } from './imagery-registry.js';   /* (sat-imagery-supply) what picture is where, when, how sharp, on what terms */
import { icon } from './icons.js';   /* (icon-system) the one icon set — js/icons.js */

export function satellite(HOST){
 const GE=()=>IntMapGeoEngine;   /* (#R178) the renderer, through the contract — never the raw handle */
  /* (#R170) "Is it safe to addSource/addLayer right now?" — the app-wide predicate declared in index.html.
     A function DECLARATION so nested closures above this line can call it (no TDZ). Falls back to the old
     isStyleLoaded() test only if the host is somehow absent. */
  function _imCanDraw(){ try{ return !!HOST.canDraw(); }catch(_){ try{ return !!GE().ready(); }catch(__){ return false; } } }
  const saveSatKeys=()=>{ try{ localStorage.setItem('intmap_sat_keys',JSON.stringify(HOST.satKeys)); }catch(_){} };
  const satProviderById=(id)=>HOST.SAT_PROVIDERS.find(p=>p.id===id);
  /* BYOK satellite providers (tier 'pro') need the reader's own saved key; free providers are always usable. */
  const satHasKey=(p)=>p.tier==='free' || !!(HOST.satKeys[p.keyName]&&String(HOST.satKeys[p.keyName]).trim());
  const satMaxDay=()=>new Date().toISOString().slice(0,10);
  /* (#R246) the provider names are tuples held as data — see IntMapLang.pickArgs(). ⚠ BUILT ON FIRST
     USE, not at factory level: tests/engine-app-shell-split-checks.test.mjs (#R169) #4 requires a factory body to DECLARE and never to run. */
  let _LS=null; const LS=()=>(_LS||(_LS=IntMapLang.pick(()=>HOST.lang)));
  function satMsg(key,p){ return String(HOST.t(key)||'').replace('{provider}',(p&&(LS().arr(p.name)||p.short))||''); }
  function satCaptureLabel(p){ if(!p) return ''; if(p.epoch) return p.epoch[0]+'–'+p.epoch[1]; if(!p.dated) return HOST.t('satLatest'); if(p.dateMode==='year') return HOST.satState.year+' '+HOST.t('satMosaicSuffix'); return HOST.satState.day; }
  function satChipHTML(){ const p=satProviderById(HOST.satState.providerId); if(!p) return ''; return `<span class="cr-sat">${icon('antenna')} ${p.short} · ${satCaptureLabel(p)}</span>`; }
  function satRefreshReadout(){ try{ HOST.renderCoordReadout(); }catch(_){} }
  /* (layer-failure-state) delegates to the app's ONE toast and live region, js/notify.js. It used to draw a second
     `.sat-toast` box (#sat-toast) at exactly the spot #ai-toast occupies, on its own 4,400 ms clock, so two
     messages close together were two boxes on top of each other — and neither was announced. */
  function satToast(msg){ try{ window.IntMapNotify.show(msg); }catch(_){} }
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
      GE().layers.addSource(srcId,{type:'raster',tiles:tiles,tileSize:256,minzoom:p.minzoom||0,maxzoom:p.maxzoom||19,attribution:p.attribution||''});
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
    /* (sat-imagery-supply) a supplier's own date range: the year/day carried over from the previous supplier may be outside it */
    if(p.dateMode==='year'&&p.years&&!p.years.includes(HOST.satState.year)) HOST.satState.year=p.years.slice().sort((x,y)=>Math.abs(x-HOST.satState.year)-Math.abs(y-HOST.satState.year))[0];
    if(p.dateMode==='day'&&p.source&&p.source.time.from&&HOST.satState.day<p.source.time.from) HOST.satState.day=p.source.time.from;
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
    /* (sat-imagery-supply) a regional or swath source answers 404 where it has no picture — that is its declared coverage, not a failure */
    if((st===404||st===400)&&p.source&&(p.source.scope==='regional'||p.source.partial)) return;
    if(st===401||st===403){ satToast(satMsg('satErrAuth',p)); HOST.satErrCount=0; satRevertToFallback(); return; }
    HOST.satErrCount++;
    /* Dated GIBS day-layers: the latest day may not be processed yet → walk back to the freshest
       AVAILABLE day before giving up, so "latest" really means latest-that-exists. */
    if(p.dated && p.dateMode==='day' && HOST.satAutoBackoff<5 && HOST.satErrCount>=2){
      HOST.satAutoBackoff++; HOST.satErrCount=0; satStepDay(-1,true); return;
    }
    if(HOST.satErrCount>=4){ HOST.satErrCount=0; satToast(satMsg('satErrTiles',p)); satRevertToFallback(); }
  }
  /* ══ (sat-imagery-supply) WHAT IS THE PICTURE, AND IS THERE A BETTER ONE HERE ═══════════════════════════
     The capture line is MEASURED where the supplier answers per place (Esri's Citations layer), CHOSEN where the picture is the date
     picked (GIBS, PDOK), and DECLARED — said to be a range — where the supplier publishes no per-place date (GSI, USGS, swisstopo).
     The three never read alike: a declared range is not shown as if it were a date (js/imagery-registry.js, captureLine). */
  const satLang=()=>HOST.lang==='jp'?'jp':'en';
  function satCenter(){ try{ const c=GE().camera.getCenter(); return { lng:c.lng, lat:c.lat, zoom:GE().camera.getZoom() }; }catch(_){ return null; } }
  function satClockISO(){ try{ const T=window.IntMapTime; if(T&&T.iso) return T.iso(); }catch(_){} return new Date().toISOString().slice(0,10); }
  /* the capture block is built as DOM nodes (textContent, hrefs through IntMapSafe.url) — never as an HTML string */
  function satEl(tag,cls,text){ const e=document.createElement(tag); if(cls) e.className=cls; if(text!=null) e.textContent=text; return e; }
  function satBuildCapture(p){
    const rows=satHereRows(), frag=document.createDocumentFragment();
    const cap=satEl('div','satc-capture',IntMapLang.t(HOST.lang,'Reading the picture date…','画像の撮影日を確認中…')); cap.id='satc-capture'; cap.setAttribute('aria-live','polite'); frag.append(cap);
    const mrow=satEl('div','satc-row'), mb=satEl('button','satc-match',IntMapLang.t(HOST.lang,'Match the Chronos time','Chronos の時刻に合わせる')); mb.type='button'; mb.id='satc-match'; mrow.append(mb); frag.append(mrow);
    const det=satEl('details','satc-here'), sum=satEl('summary',null,IntMapLang.t(HOST.lang,'Pictures available here','この場所で使える画像')+' ('+rows.length+')'), ul=satEl('ul'); ul.id='satc-here-list';
    rows.forEach(r=>{
      const li=satEl('li'), b=satEl('button',null,LS().arr(satProviderById(r.id).name)||r.source.short); b.type='button'; b.setAttribute('data-id',r.id); if(r.id===p.id) b.setAttribute('aria-current','true');
      b.append(satEl('small',null,(r.source.scope==='regional'?IntMapLang.t(HOST.lang,'regional · ','地域別 · '):'')+(r.resolutionM<1?Math.round(r.resolutionM*100)+' cm':r.resolutionM+' m')+(r.pick.exact?'':IntMapLang.t(HOST.lang,' · nearest year ',' · 最も近い年 ')+(r.pick.year||''))));
      li.append(b); ul.append(li);
    });
    det.append(sum,ul); frag.append(det);
    return frag;
  }
  function satHereRows(){ const c=satCenter(); if(!c) return []; const T=window.IntMapTime; const live=!(T&&T.isLive&&!T.isLive()); return rankAt({ lng:c.lng, lat:c.lat, zoom:c.zoom, time:live?null:satClockISO() }); }
  function satBuildLicence(p){
    const s=p&&p.source, out=document.createDocumentFragment(); if(!s||!s.license) return out; const l=s.license;
    out.append(' ');
    const u=window.IntMapSafe&&window.IntMapSafe.url?window.IntMapSafe.url(l.url):'';
    if(u){ const an=satEl('a',null,IntMapLang.t(HOST.lang,'Terms','利用条件')); an.href=u; an.target='_blank'; an.rel='noopener noreferrer'; out.append(an); out.append(': '); } else out.append(IntMapLang.t(HOST.lang,'Terms','利用条件')+': ');
    out.append(l.name+(l.commercial==='unconfirmed'?IntMapLang.t(HOST.lang,' (commercial use not confirmed)','（商用の可否は未確認）'):''));
    return out;
  }
  let _satCapSeq=0;
  async function satUpdateCapture(){
    const el=document.getElementById('satc-capture'); if(!el) return;
    const p=satProviderById(HOST.satState.providerId), s=p&&p.source, c=satCenter(); if(!s||!c) { el.textContent=''; return; }
    const seq=++_satCapSeq;
    let info=null; try{ info=await captureAt(s,{ lng:c.lng, lat:c.lat, day:HOST.satState.day, year:HOST.satState.year }); }catch(_){ info=null; }
    if(seq!==_satCapSeq||!info) return;
    const el2=document.getElementById('satc-capture'); if(!el2) return;
    const note=(info.text&&info.text[satLang()==='jp'?1:0])||(s.note&&s.note[satLang()==='jp'?1:0])||'';
    el2.textContent=''; el2.append(captureLine(s,info,satLang())); if(note){ const sm=document.createElement('small'); sm.textContent=note; el2.append(sm); }
  }
  function satWireCapture(panel,p){
    const m=panel.querySelector('#satc-match'); if(m) m.onclick=satMatchClock;
    panel.querySelectorAll('#satc-here-list button').forEach(b=>{ b.onclick=()=>{ const id=b.getAttribute('data-id'); if(id&&id!==HOST.satState.providerId) satSelectProvider(id); }; });
    satUpdateCapture();
    if(!satWireCapture._moved){ satWireCapture._moved=true; let t=0; try{ GE().events.on('moveend',()=>{ clearTimeout(t); t=setTimeout(()=>{ if(HOST.mapType==='sat') satUpdateCapture(); },700); }); }catch(_){} }
  }
  /** Chronos → the picture of that time: this supplier's date for it, or the best supplier that has that time here. */
  function satMatchClock(){
    const c=satCenter(); if(!c) return;
    const plan=planClockMatch({ providerId:HOST.satState.providerId, lng:c.lng, lat:c.lat, zoom:c.zoom, iso:satClockISO() });
    if(!plan){ satToast(IntMapLang.t(HOST.lang,'No satellite or aerial picture of that time is available here.','その時刻のこの場所の衛星・航空画像はありません。')); return; }
    if(plan.pick.day) HOST.satState.day=plan.pick.day;
    if(plan.pick.year) HOST.satState.year=plan.pick.year;
    if(plan.switched){ HOST.satState.providerId=plan.providerId; HOST.satErrCount=0; HOST.satAutoBackoff=0; }
    satRenderController(); satApply(true); satRefreshReadout();
    if(!plan.pick.exact) satToast(IntMapLang.t(HOST.lang,'Nearest year available: ','最も近い年: ')+(plan.pick.year||''));
  }
  /* Sat-Controller panel (provider + capture-date + opacity). Rebuilt on change / language. */
  function satRenderController(){
    const panel=document.getElementById('sat-controller'); if(!panel) return;
    const p=satProviderById(HOST.satState.providerId)||HOST.SAT_PROVIDERS[0];
    let opts='';
    HOST.SAT_PROVIDERS.forEach(pr=>{
      const sel=pr.id===HOST.satState.providerId?' selected':'', nm=LS().arr(pr.name);
      if(pr.tier==='free') opts+=`<option value="${pr.id}"${sel}>${nm}</option>`;
      else { const has=satHasKey(pr); opts+=`<option value="${pr.id}"${sel}${has?'':' disabled'}>${has?'':''}${nm}${has?'':' — '+HOST.t('satLocked')}</option>`; }
    });
    let dateCtrl;
    if(p.dated&&p.dateMode==='day'){
      dateCtrl=`<div class="satc-row"><label for="satc-day">${HOST.t('satDate')}</label><div class="satc-date"><button class="satc-step" id="satc-prev" title="${HOST.t('satPrevDay')}">${icon('chevronL')}</button><input type="date" id="satc-day" value="${HOST.satState.day}" max="${satMaxDay()}"><button class="satc-step" id="satc-next" title="${HOST.t('satNextDay')}">${icon('chevronR')}</button></div></div>`;
    } else if(p.dated&&p.dateMode==='year'){
      const yo=p.years.map(y=>`<option value="${y}"${y===HOST.satState.year?' selected':''}>${y}</option>`).join('');
      dateCtrl=`<div class="satc-row"><label for="satc-year">${HOST.t('satDate')}</label><select id="satc-year">${yo}</select></div>`;
    } else {
      dateCtrl=`<div class="satc-row"><label>${HOST.t('satDate')}</label><span class="satc-latest">${p.epoch?p.epoch[0]+'–'+p.epoch[1]:HOST.t('satLatest')}</span></div>`;
    }
    panel.innerHTML=`<div class="satc-head">${icon('antenna')} <span>${HOST.t('satCtrlTitle')}</span><button id="satc-close" title="${IntMapLang.t(HOST.lang,'Close','閉じる','Schließen','Закрыть','Cerrar')}" aria-label="${IntMapLang.t(HOST.lang,'Close','閉じる','Schließen','Закрыть','Cerrar')}" style="margin-left:auto;background:transparent;border:none;color:var(--text-muted);width:26px;height:26px;font-size:22px;font-weight:300;line-height:1;cursor:pointer;">×</button></div>`+
      `<div class="satc-row"><label for="satc-provider">${HOST.t('satProvider')}</label><select id="satc-provider">${opts}</select></div>`+
      dateCtrl+
      '<div id="satc-extra"></div>'+
      `<div class="satc-row"><label for="satc-op">${HOST.t('opacity')}</label><input type="range" id="satc-op" min="0.2" max="1" step="0.05" value="${HOST.satState.opacity}"></div>`+
      aiSatChangeBlockHTML(p)+
      `<div class="satc-attr"><span>${p.attribution||''}</span><span id="satc-terms"></span></div>`;
    { const ex=panel.querySelector('#satc-extra'); if(ex) ex.replaceWith(satBuildCapture(p)); const tm=panel.querySelector('#satc-terms'); if(tm) tm.append(satBuildLicence(p)); }
    satWireCapture(panel,p);
    const sp=panel.querySelector('#satc-provider'); if(sp) sp.onchange=ev=>satSelectProvider(ev.target.value);
    const dd=panel.querySelector('#satc-day'); if(dd) dd.onchange=ev=>{ HOST.satState.day=ev.target.value||HOST.satState.day; satApply(true); satRefreshReadout(); };
    const yy=panel.querySelector('#satc-year'); if(yy) yy.onchange=ev=>{ HOST.satState.year=parseInt(ev.target.value,10)||HOST.satState.year; satApply(true); satRefreshReadout(); };
    const pv=panel.querySelector('#satc-prev'); if(pv) pv.onclick=()=>satStepDay(-1);
    const nx=panel.querySelector('#satc-next'); if(nx) nx.onclick=()=>satStepDay(1);
    const op=panel.querySelector('#satc-op'); if(op) op.oninput=ev=>satSetOpacity(parseFloat(ev.target.value));
    const cb=panel.querySelector('#ai-satchange-btn'); if(cb){ cb.classList.toggle('ai-needs-key',!HOST.aiVisionReady()); cb.title=HOST.aiVisionReady()?'':(HOST.aiReady()?HOST.t('aiNoVision'):HOST.t('aiNoKey')); cb.onclick=aiSatChangeDetect; }
    const cl=panel.querySelector('#satc-close'); if(cl) cl.onclick=()=>{ HOST.satPanelDismissed=true; panel.style.display='none'; };
  }
  /* Settings-modal API-key management (BYOK providers). */
  function satRenderKeyInputs(){
    const wrap=document.getElementById('sat-keys-list'); if(!wrap) return;
    /* ⚠ (#R466) wired HERE, not at factory level: this file's factory only ever DECLARES
       (tests/engine-app-shell-split-checks.test.mjs (#R169) #4 — that is what makes calling it early safe), and the first paint is also the
       first moment there is anything for a relabel to rewrite. */
    if(!satRenderKeyInputs._lang){ satRenderKeyInputs._lang=1; try{ window.addEventListener('intmap-lang',satRelabelKeyInputs); }catch(_){} }
    wrap.innerHTML=HOST.SAT_PROVIDERS.filter(p=>p.tier==='pro').map(p=>{
      const v=HOST.satKeys[p.keyName]||'', on=!!String(v).trim();
      const nm=(p.keyLabel&&LS().arr(p.keyLabel))||LS().arr(p.name);
      return `<div class="sat-key-row"><div class="sat-key-top"><span class="sat-key-name">${nm}</span>`+
        `<span class="sat-key-status ${on?'on':''}">${on?'● '+HOST.t('satKeyConnected'):'○ '+HOST.t('satKeyNone')}</span></div>`+
        `<input type="text" class="sat-key-input" data-keyname="${p.keyName}" value="${String(v).replace(/"/g,'&quot;')}" placeholder="${String(p.keyPh||'').replace(/"/g,'&quot;')}" autocomplete="off" autocapitalize="off" spellcheck="false"></div>`;
    }).join('');
  }
  /* ══ (#R466) THE LANGUAGE CAN CHANGE WHILE THIS LIST IS ON SCREEN ═════════════════════════════
     satRenderKeyInputs() runs when Settings opens, and the language <select> is in that same dialog,
     so the provider names and the ●/○ status words kept the language the dialog was opened in.
     ⚠ RELABEL, DO NOT RE-RENDER, on this path: the rebuild writes `value=` from the SAVED keys
     (satSaveKeyInputs is the Apply step), so re-running it would wipe a key that had been typed and
     not yet applied. */
  function satRelabelKeyInputs(){
    const wrap=document.getElementById('sat-keys-list'); if(!wrap) return;
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
        if(p && p.style.display==='block' && !(window.IntMapDevice.compact())){ HOST.satPanelDismissed=true; p.style.display='none'; } }catch(_){} };
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
    return `<div class="aic-sec"><div class="aic-head">${icon('satellite')} ${HOST.t('aiVisHead')}</div><div class="aic-dates">${inputs}</div><button class="ai-action-btn" id="ai-satchange-btn">${icon('sparkle')} ${HOST.t('aiVisBtn')}</button></div>`;
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
}
