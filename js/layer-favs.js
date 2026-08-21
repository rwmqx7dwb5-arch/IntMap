/* ============================================================================
 *  IntMap · starred layers and their quick-pick chips  (#R200)
 * ----------------------------------------------------------------------------
 *  A star on any layer row, the chip strip those stars produce above the map, and the reading of a
 *  layer checkbox (key, label, group) that both of them need.
 *
 *  Lifted verbatim out of js/app-body.js (#R200): 59 of its 61 lines are byte-identical,
 *  and the 2 that are not are all the same rule — #R165's: a closure value js/app-body.js
 *  REASSIGNS at runtime is read through IM_HOST's live accessor (currentLang → HOST.lang),
 *  never captured when this factory ran. Everything else arrives through CTX under its ORIGINAL name,
 *  which is what lets the body below stay word-for-word what it was.
 *
 *  It is a REAL ES module: nothing registers it on window.IntMapModules, nothing in src/main.js orders
 *  it, and js/app-body.js reaches it only through a static `import`. tests/r200-checks.test.mjs derives
 *  both halves of the hand-off — what this file returns and reads, what the core takes and passes — from
 *  the two files themselves, so neither list can drift into a silent `undefined`.
 * ==========================================================================*/
export function makeLayerFavs(HOST, CTX) {
  const escapeHtml=CTX.escapeHtml, i18n=CTX.i18n, saveSettings=CTX.saveSettings, t=CTX.t;
  /* ---------- Layer favorites (#16) — star any layer, quick-pick chips on top ---------- */
  function layerCbInfo(cb){
    if(!cb) return null;
    if(cb.id==='cb-names')     return {key:'names', label:t('placeNames')};
    if(cb.id==='cb-geolabels') return {key:'geolabels', label:t('geoLabels')||'Water & terrain labels'};
    if(cb.id==='cb-poi')       return {key:'poi', label:t('poiLabels')||'Shop & facility names'};   /* (#R186) */
    if(cb.id==='cb-borders')   return {key:'borders', label:t('borders')};
    if(cb.id==='cb-coast')     return {key:'coast', label:t('coastline')||'Coastlines & shores'};   /* (#R289) */
    if(cb.id==='cb-countries') return {key:'countries', label:i18n[HOST.lang].countries||'Countries'};
    /* (#R225) the `geo:` key belonged to the nine geopolitics layers; they are deleted, and so is
       the only kind of checkbox that carried `.geo-layer-cb`. A `geo:` favourite saved long ago simply
       resolves to nothing now, which is what a favourite for a deleted layer should do. */
    if(cb.id&&cb.id.indexOf('dl-')===0){ const k=cb.id.slice(3); const row=cb.closest('.layer-option')||cb.closest('.lyr-row'); const sp=row&&(row.querySelector('span[data-i18n]')||row.querySelector('span.ec-lbl')); return {key:'data:'+k, label:(sp?sp.textContent:k)}; }
    /* (#R17/#R18) Some layer rows couldn't be favorited because their checkbox id isn't `dl-…` (land-cover /
       ecoregions `eco-dl-*`, Round-9 `l9-dl-*`) OR the row uses `.lyr-row` without a `.layer-option` wrapper.
       Give EVERY layer-row checkbox that has an id a star, keyed by its id, sourcing the label from the
       nearest label span in EITHER container. (cb-grid is a utility → no star.) */
    if(cb.id==='cb-grid') return null;
    const row=cb.closest('.layer-option')||cb.closest('.lyr-row');
    if(row && cb.id){ const sp=row.querySelector('span[data-i18n]')||row.querySelector('span.ec-lbl')||row.querySelector('span:not(.lyr-sw):not(.lfc-sw):not(.lsr-thumb)'); const label=((sp?sp.textContent:cb.id)||'').trim(); if(label) return {key:'data:'+cb.id, label}; }
    return null;
  }
  function allLayerCbs(){ return Array.from(document.querySelectorAll('#layer-dropdown input[type=checkbox]')).filter(cb=>cb.id!=='cb-names-x'); }
  function cbForKey(key){
    return allLayerCbs().find(cb=>{ const i=layerCbInfo(cb); return i&&i.key===key; })||null;
  }
  function renderLayerFavs(){
    const sec=document.getElementById('layer-fav-section'), wrap=document.getElementById('layer-fav-chips'); if(!sec||!wrap) return;
    wrap.innerHTML='';
    const favs=window.imLayerFavs.filter(k=>cbForKey(k));
    sec.classList.toggle('has-favs',favs.length>0);
    favs.forEach(key=>{
      const cb=cbForKey(key); const info=layerCbInfo(cb); if(!info) return;
      const chip=document.createElement('button'); chip.className='layer-fav-chip'+(cb.checked?' on':'');
      chip.innerHTML=(info.color?`<span class="lfc-sw" style="background:${info.color}"></span>`:'')+escapeHtml(info.label);
      chip.onclick=()=>{ cb.checked=!cb.checked; cb.dispatchEvent(new Event('change',{bubbles:true})); renderLayerFavs(); };
      wrap.appendChild(chip);
    });
    /* keep star states in sync */
    document.querySelectorAll('#layer-dropdown .lyr-star').forEach(st=>{ st.classList.toggle('on', window.imLayerFavs.includes(st.dataset.key)); });
  }
  function injectLayerStars(){
    allLayerCbs().forEach(cb=>{
      /* (#R18) accept rows that use .lyr-row without a .layer-option wrapper too, so no layer is left
         without a favorite star ("お気に入りボタンをできないレイヤーがある"). */
      const opt=cb.closest('.layer-option')||cb.closest('.lyr-row'); if(!opt||opt.querySelector('.lyr-star')) return;
      const info=layerCbInfo(cb); if(!info) return;
      const star=document.createElement('button'); star.className='lyr-star'+(window.imLayerFavs.includes(info.key)?' on':'');
      star.type='button'; star.title='Favorite'; star.dataset.key=info.key; star.textContent='★';
      star.onclick=(e)=>{ e.preventDefault(); e.stopPropagation();
        const i=window.imLayerFavs.indexOf(info.key);
        if(i>=0) window.imLayerFavs.splice(i,1); else window.imLayerFavs.push(info.key);
        star.classList.toggle('on'); saveSettings(); renderLayerFavs();
      };
      opt.appendChild(star);
      /* reflect on/off chip state when the underlying layer toggles */
      cb.addEventListener('change',renderLayerFavs);
    });
    renderLayerFavs();
  }
  /* layers are built by the GROUP-3 IIFE (already run) + static ones; inject now and once more after idle */
  injectLayerStars(); setTimeout(injectLayerStars,1200); setTimeout(injectLayerStars,2800);   /* (#R17) extra pass so late-mounted modules (eco/l9/ECMWF, ~1.5–1.6 s) all get fav stars */
  /* (#R17) also (re)inject stars whenever the Layers panel is opened — covers any module that mounted late */
  try{ const _bl=document.getElementById('btn-layers'); if(_bl) _bl.addEventListener('click',()=>setTimeout(injectLayerStars,40)); }catch(_){}
  return { layerCbInfo, renderLayerFavs };
}
