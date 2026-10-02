/* ============================================================================
 *  IntMap · js/layer-pkg-alliances.js — LAYER PACKAGE: NATO members, EU members, defence spending
 * ----------------------------------------------------------------------------
 *  (layer-packages) The implementation of every row whose declaration says `pkg: 'alliances'` — dl-nato,
 *  dl-eu and dl-milSpend: one family, because the three share their pieces (the accession-year ramp and key,
 *  the colour-mode switch, the defence share NATO's hover reads) and were one block of js/data-layers.js.
 *  The NATO and EU fills with their Article-6 / accession-year legends and hovers (window.IntMapNatoFC /
 *  window.IntMapEuFC, read by js/layer-home.js once the row has arrived), the 国防費 row's two modes, the
 *  clock they follow, the switches and the opacity.
 *  It was the NATO / EU / defence block of js/data-layers.js, and moved here with its notes. Every moved line is the same bytes it was
 *  there — indented as it stood inside that file's factory, which is why the body sits one level deeper than this
 *  function needs — except that the names it shared with the rest of that file arrive in the kit (`K`) instead of
 *  through the closure; that the two defence legends — which js/data-layers.js rebuilds on a language change — are
 *  read as `live.lgdMil` / `live.lgdMilGDP` where they are used; that the two hover latches (`_natoHoverWired`,
 *  `_euHoverWired`) are declared here, where their only readers are; that the clock handler is named and run once
 *  on arrival (said where it stands); and the switch at the end, which was the rows' branches of toggleLayer and
 *  setLayerOpacity. `onLegendsRebuilt` is the call js/data-layers.js made after a language change (the mode switch
 *  lives inside the defence legends, so a rebuild drops it).
 *  The legend cards are still built by js/data-layers.js (buildCoreLegends) with the others, and the choropleth
 *  machinery the defence row draws with (addChoro / applyChoro / withCountries) is the kit's.
 *  js/data-layers.js fetches this module the first time one of the rows is switched and calls the factory once;
 *  what the kit holds is written there (`packageKit`).
 * ==========================================================================*/
import { IntMapTime } from './chronos.js';
import { IntMapLang } from './lang-registry.js';

/** @param {any} K the layer kit js/data-layers.js hands every package (`packageKit` there)
    @returns {{ rows: Record<string, { on: () => any, off: () => void, opacity: (v: number) => void }> }} */
export function alliancesPackage(K) {
    const { GE, HOST, NATO, addChoro, applyChoro, beforeId, cName, countryStats, ensureMapTooltip, flagM, isMobile, opacities, positionTooltip, setVis, tileLegends, withCountries } = K;
    /* the two shared helpers every module binds for itself, not handed through the kit — the gates read them by their binding:
       the one markup tag (safe-dom-template; scripts/output-taint.mjs judges a template by what its tag is bound to) and the
       translation tuple builder (scripts/i18n-audit.mjs counts an LA(…) row by the name bound to pickArgs) */
    const html=window.IntMapSafe.markup, LA=IntMapLang.pickArgs();
    const live = K.live;   /* lgdMil, lgdMilGDP — reassigned in js/data-layers.js (a language change rebuilds the legends), so read where used, never copied */
    let _natoHoverWired=false, _euHoverWired=false;   /* (#R178) "have I already wired this hover?" — module state, not renderer state (moved with the two rows that read it) */
    /* NATO members fill (#R7): brighter blue so it's clearly visible on the dark basemap, with a crisp
       outline. Built from a DEDICATED geojson (not the shared country feature-state) so we can drop the
       two member territories that lie SOUTH of the Tropic of Cancer — French Guiana (France) and Hawaii
       (USA) — which fall outside NATO's Article-6 treaty area. The Tropic of Cancer (23.4366°N) is drawn
       as a labeled gold line so the exclusion is self-explanatory. */
    const TROPIC_CANCER=23.4366;
    /* (#R7) NATO Article 6 limits the treaty area to Europe/North America and North-Atlantic islands
       NORTH of the Tropic of Cancer. So we drop EVERY member sub-polygon whose centroid is south of that
       line — French Guiana, Guadeloupe, Martinique, Saint-Martin, Mayotte, Réunion, New Caledonia, French
       Polynesia, Hawaii, Puerto Rico, Guam, … — while keeping all mainlands and the Atlantic islands
       (Azores, Madeira, Canaries) that ARE covered. Mainland polygons aren't clipped (centroid is north),
       so e.g. southern Florida/Texas stay whole. */
    /* ══ ⚠ (#R289) 「加盟年ごとに色分けされたバージョンも用意して」 ═══════════════════════════════════
       NATO and the EU each paint every member ONE colour, which answers 「who is in」 and says
       nothing about 「since when」 — although both layers have carried the real accession year
       since #R14/#R26 and both already have a year slider driven by it. A second colouring makes
       that year visible instead of only filterable, and the switch is in the legend beside the
       slider that uses the same numbers.
       ⚠ ONE PALETTE FOR BOTH.
       ⚠ AND THE BAR GOES AWAY WITH IT. #R270's defect was a legend whose gradient contradicted
       the colours on the map; a flat blue bar over a year-coloured map is the same statement. So
       the mode hides `.dl-bar`/`.dl-scale` and shows a chip per wave instead. */
    /* ══ ⚠⚠⚠ (#R290) 「加盟年別の色分けの色味が分かりにくい」 — AND THAT IS MEASURABLE ═══════════
       #R289 chose viridis for this on the argument that 「a rainbow would imply an order the eye
       has to be taught」. The reader has now looked at the result and cannot read it, so the
       trade-off is settled by the other criterion: how far apart two waves actually LOOK.
       MEASURED, CIEDE2000 between the closest pair in the set (which for a monotone ramp is
       always an adjacent pair — the one a reader has to tell apart on the legend):

           waves   viridis (before)   this palette (after)
             8         ΔE00 12.2            ΔE00 19.7      ← the EU
            11         ΔE00  8.1            ΔE00 19.7      ← NATO
            14         ΔE00  6.1            ΔE00 13.0

       ΔE00 ≈ 2.3 is the just-noticeable difference for large flat areas; 8.1 across eleven country
       fills at 55 % opacity over a basemap is not enough, and it is why 「分かりにくい」 is a fact
       about the palette rather than about the reader. The new set sweeps hue a full turn instead
       of a third of one, so the separation stops shrinking as waves are added — at eleven it is
       the same 19.7 as at eight. Order is still read off the sequence and off the legend chips,
       which name the year beside every swatch.
       ⚠ AND IT IS INDEXED, NOT INTERPOLATED. Sampling eleven colours out of a ten-anchor gradient
       is what put the closest pair at 8.1 in the first place; when there are no more waves than
       entries, each wave takes an ENTRY, so the measured separation is the separation on screen.
       (More entries than that — no such layer today — falls back to interpolation.) */
    /* ══ ⚠⚠ (#R293) 「ランダムな色の分け方ではなく、古いのから新しいのまで、赤から紫に連続的に」 ═══
       #R290 maximised how far apart the waves LOOK and got 26.1 (CIE76) by sweeping hue a full turn
       — which starts at dark blue, ends at lavender, and passes red in the middle. That is far apart
       and it is not an ORDER anybody can read off the map, which is what 「ランダム」 names.
       This ramp is the one the reader asked for: hue sweeps MONOTONICALLY from red (oldest) through
       orange, yellow, green and blue to purple (newest), so where a country sits in the sequence is
       legible without the key.
       ⚠ THE SEPARATION IS NOW A CONSEQUENCE, NOT THE OBJECTIVE, AND IT IS SMALLER — MEASURED:
       closest pair 23.9 (CIE76) against #R290's 26.1, and the closest pair is always an ADJACENT
       one, which is the signature of a continuous ramp: two waves that could be confused are
       neighbours in time, and no two distant waves ever are. It is still an order of magnitude
       above the 2.3 JND and roughly twice the 12.8 of the viridis sampling both of these replace.
       `tests/weather-warnings-checks.test.mjs (#R293)` asserts the monotone red→purple sweep AND re-computes the separation. */
    const _WAVEPAL=['#cf0032','#ea4a1c','#fa8b00','#f2c200','#c9df00','#5fbb46','#00a878','#0096bf','#2f66cf','#5a3cc4','#902fa6'];
    function _mixHex(a,b,t){ const p=(h)=>[parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)];
      const A=p(a),B=p(b),o=A.map((v,i)=>Math.round(v+(B[i]-v)*t));
      return '#'+o.map(v=>v.toString(16).padStart(2,'0')).join(''); }
    function _rampAt(f){ const x=Math.max(0,Math.min(1,f))*(_WAVEPAL.length-1), i=Math.min(_WAVEPAL.length-2,Math.floor(x));
      return _mixHex(_WAVEPAL[i],_WAVEPAL[i+1],x-i); }
    /* year → colour, ordered oldest-first. ONE entry means one colour, not a division by zero. */
    function yearColors(years){ const o={}; const n=years.length, P=_WAVEPAL.length;
      years.forEach((y,i)=>{ o[y]=(n<2)?_WAVEPAL[0]
        :(n<=P)?_WAVEPAL[Math.round(i*(P-1)/(n-1))]
        :_rampAt(i/(n-1)); }); return o; }
    /* the fill expression: an exact match on the accession year, with the uniform colour as the
       fallback so a member whose year is missing is never invisible. */
    function yearFillExpr(years,colors,fallback){
      const e=['match',['to-number',['get','__y'],0]];
      years.forEach(y=>{ e.push(y,colors[y]); });
      e.push(fallback); return e; }
    /* the chips: one per wave that is actually on the map at the selected year, with its count */
    function yearKeyHTML(years,colors,joinTable,upTo,leftTable){
      const rows=[];
      years.forEach(y=>{ if(upTo!=null&&y>upTo) return;
        let n=0; Object.keys(joinTable).forEach(code=>{ if(joinTable[code]!==y) return;
          if(upTo!=null&&leftTable&&leftTable[code]&&upTo>=leftTable[code]) return; n++; });
        if(!n) return;
        rows.push(html`<span style="display:inline-flex;align-items:center;gap:4px;"><i style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${colors[y]};"></i>${y} (${n})</span>`); });
      return html`<div class="dl-yearkey" style="display:flex;flex-wrap:wrap;gap:5px 9px;margin-top:6px;font-size:10px;color:var(--text-muted);font-variant-numeric:tabular-nums;">${rows}</div>`; }
    /* the two-button switch every one of these legends gets. `get`/`set` keep the state with its
       own layer rather than making a second copy here. */
    function styleModeRow(el,cls,get,set){ if(!el) return;
      let r=el.querySelector('.'+cls);
      const OPT=[['uniform',()=>IntMapLang.t(HOST.lang,'One colour','単色','Eine Farbe','Один цвет','Un color')],
                 ['byYear', ()=>IntMapLang.t(HOST.lang,'By accession year','加盟年別','Nach Beitrittsjahr','По году вступления','Por año de ingreso')]];
      if(!r){ r=document.createElement('div'); r.className=cls;
        r.style.cssText='display:flex;gap:5px;margin-top:7px;';
        r.innerHTML=html`${OPT.map(o=>html`<button type="button" data-s="${o[0]}" style="flex:1;min-width:0;border:1px solid rgba(128,128,128,0.3);border-radius:7px;padding:4px 6px;font-size:10.5px;font-weight:600;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"></button>`)}`;
        const bar=el.querySelector('.dl-scale'); if(bar&&bar.parentNode===el) el.insertBefore(r,bar.nextSibling); else el.appendChild(r);
        r.addEventListener('click',(ev)=>{ const b=ev.target.closest('button[data-s]'); if(b&&r.contains(b)) set(b.getAttribute('data-s')); }); }
      r.querySelectorAll('button[data-s]').forEach(b=>{ const k=b.getAttribute('data-s');
        const o=OPT.filter(x=>x[0]===k)[0]; if(o) b.textContent=o[1]();
        const act=(k===get());
        b.style.background=act?'var(--primary-fill)':'var(--input-bg)';
        b.style.color=act?'#fff':'var(--text-main)';
        b.setAttribute('aria-pressed',act?'true':'false'); });
      /* the gradient bar describes the uniform colouring only — see the note above */
      const byYear=(get()==='byYear');
      ['.dl-bar','.dl-scale'].forEach(sel=>{ const e2=el.querySelector(sel); if(e2) e2.style.display=byYear?'none':''; });
      return r; }
    function _ringCentroidLat(ring){ if(!ring||!ring.length) return 0; let sy=0; for(const p of ring) sy+=p[1]; return sy/ring.length; }
    function _dropSouthOfTropic(geom){
      if(!geom) return null;
      const keep=pc=>_ringCentroidLat(pc[0])>=TROPIC_CANCER;
      if(geom.type==='Polygon') return keep(geom.coordinates)?geom:null;
      if(geom.type==='MultiPolygon'){ const polys=geom.coordinates.filter(keep); return polys.length?{type:'MultiPolygon',coordinates:polys}:null; }
      return geom;
    }
    /* (#R337) the collection this layer paints, published so js/layer-home.js frames the geometry
       that is actually on screen — the members who had acceded by whatever year Chronos is set to,
       already clipped to the treaty area north of the Tropic of Cancer. Same contract as
       window.IntMapEuFC below; see that file for why the frame takes each member's largest landmass. */
    window.IntMapNatoFC=()=>{ try{ return buildNatoFC(); }catch(_){ return null; } };
    function buildNatoFC(){
      const feats=[];
      if(HOST.countryGeo&&HOST.countryGeo.features){
        HOST.countryGeo.features.forEach(f=>{ const code=String(f.id); if(!NATO.has(code)) return;
          /* (#R25) Time-travel like Historical borders: only show members who had ALREADY joined by the
             selected year (based on each country's real accession year). */
          const jy=NATO_JOIN[code]; if(jy && _natoYear && jy>_natoYear) return;
          const g=_dropSouthOfTropic(f.geometry);
          /* (#R289) the accession year travels WITH the feature, so the fill can colour by it */
          if(g) feats.push({type:'Feature',id:code,properties:{__code:code,__y:(jy||0)},geometry:g});
        });
      }
      return {type:'FeatureCollection',features:feats};
    }
    function tropicFC(){ const c=[]; for(let lo=-180;lo<=180;lo+=5) c.push([lo,TROPIC_CANCER]); return {type:'FeatureCollection',features:[{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:c}}]}; }
    function addNato(){
      if(!GE().layers.hasSource('src-nato')) GE().layers.addSource('src-nato',{type:'geojson',data:buildNatoFC(),promoteId:'__code'});
      if(!GE().layers.has('nato-fill')) GE().layers.add({id:'nato-fill',type:'fill',source:'src-nato',layout:{visibility:'none'},paint:{'fill-color':natoFillColor(),'fill-opacity':opacities.nato}},beforeId);
      if(!GE().layers.has('nato-line')) GE().layers.add({id:'nato-line',type:'line',source:'src-nato',layout:{visibility:'none'},paint:{'line-color':'#7fb0ff','line-width':1.6}},beforeId);
      if(!GE().layers.hasSource('src-tropic')) GE().layers.addSource('src-tropic',{type:'geojson',data:tropicFC()});
      if(!GE().layers.has('nato-tropic-line')) GE().layers.add({id:'nato-tropic-line',type:'line',source:'src-tropic',layout:{visibility:'none'},paint:{'line-color':'#f4b740','line-width':1.4,'line-dasharray':[3,3],'line-opacity':0.9}},beforeId);
      if(!GE().layers.has('nato-tropic-label')) GE().layers.add({id:'nato-tropic-label',type:'symbol',source:'src-tropic',layout:{visibility:'none','symbol-placement':'line','text-field':(IntMapLang.t(HOST.lang,'Tropic of Cancer (23.4°N)','北回帰線 (北緯23.4°)','Wendekreis des Krebses (23,4°N)','Северный тропик (23,4° с.ш.)','Trópico de Cáncer (23,4°N)')),'text-size':window.IntMapLabelScale.sub(0.9),'text-font':['literal',['Noto Sans Regular']],'symbol-spacing':340,'text-letter-spacing':0.04},paint:{'text-color':'#f4b740','text-halo-color':'rgba(0,0,0,0.65)','text-halo-width':1.3}},beforeId);
    }
    function natoFillColor(){ return (_natoStyle==='byYear')
      ? yearFillExpr(NATO_YEARS,yearColors(NATO_YEARS),'#2f6bff') : '#2f6bff'; }
    function applyNato(){ try{ GE().layers.setSourceData('src-nato',buildNatoFC()); }catch(_){}
      /* (#R289) the colouring is re-asserted on every repaint, not only at creation — the same
         rule the World-Bank ramp needed: the addLayer branch runs once and the mode can change
         afterwards. */
      try{ if(GE().layers.has('nato-fill')) GE().layers.setPaint('nato-fill','fill-color',natoFillColor()); }catch(_){}
      /* ⚠ the legend is only re-drawn while the layer is ON — `_registerLayerOpacity` SHOWS the
         box, so calling it from a repaint that ran with the layer off would open a legend for a
         layer that is not on the map. */
      try{ const cb=document.getElementById('dl-nato'); if(cb&&cb.checked) natoLegend(); }catch(_){} }
    function setNatoVis(on){ ['nato-fill','nato-line','nato-tropic-line','nato-tropic-label'].forEach(l=>setVis(l,on)); }
    /* NATO accession years (#14) — shown on hover alongside the member's defense spend as % of GDP. */
    const NATO_JOIN={USA:1949,CAN:1949,GBR:1949,FRA:1949,ITA:1949,NLD:1949,BEL:1949,LUX:1949,DNK:1949,NOR:1949,ISL:1949,PRT:1949,GRC:1952,TUR:1952,DEU:1955,ESP:1982,CZE:1999,HUN:1999,POL:1999,BGR:2004,EST:2004,LVA:2004,LTU:2004,ROU:2004,SVK:2004,SVN:2004,ALB:2009,HRV:2009,MNE:2017,MKD:2020,FIN:2023,SWE:2024};
    /* (#R25 / #24) NATO enlargement time-travel: a year control (like Historical borders) filters the
       members fill to those who had joined by the chosen year. NATO_YEARS = the distinct accession years. */
    const NATO_YEARS=[...new Set(Object.values(NATO_JOIN))].sort((a,b)=>a-b);
    let _natoYear=NATO_YEARS[NATO_YEARS.length-1];   /* default: latest = all current members */
    let _natoStyle='uniform';                        /* (#R289) 'uniform' | 'byYear' */
    function setNatoStyle(k){ if(k!=='uniform'&&k!=='byYear') return; if(k===_natoStyle) return; _natoStyle=k; applyNato(); }
    /* ══ (hist-fidelity) THE NUMBER A LEGEND STATES IS A FUNCTION OF WHAT THE LAYER DRAWS ════════════════
       The legend said 「32 members」 at every instant — in 1985, over a map painting 16. A count written into
       a legend is a claim about the picture beside it, so it is read off the picture: the members
       buildNatoFC() hands the source at the clock's instant (window.IntMapNatoFC is the same function), and
       it is rewritten every time natoLegend runs, which is every repaint while the row is on. */
    function natoCountHint(){ const n=buildNatoFC().features.length;
      return n+IntMapLang.t(HOST.lang,' members','か国',' Mitglieder',' членов',' miembros'); }   /* the words are an authored tuple; the number is the drawing's */
    function natoWriteCount(el){
      let h=el.querySelector('.dl-hint');
      if(!h){ h=document.createElement('div'); h.className='dl-hint';
        const sc=el.querySelector('.dl-scale'); if(sc&&sc.parentNode===el) el.insertBefore(h,sc.nextSibling); else el.appendChild(h); }   /* where makeLegend puts a hint */
      h.textContent=natoCountHint();
    }
    function natoLegend(){
      try{
        const el=window._registerLayerOpacity&&window._registerLayerOpacity('nato',LA('NATO members','NATO加盟国','NATO-Mitglieder','Страны НАТО','Países de la OTAN'),['nato-fill','nato-line'],'dl-nato');
        if(!el) return;
        natoWriteCount(el);
        /* ⚠ (#R289) THE «BUILT ONCE» GUARD IS NOW A BRANCH, NOT A RETURN. It used to leave the
           function the moment the year row existed, which is right for the row (rebuilding a
           <select> under the finger that opened it is #R266's defect) and wrong for everything
           added after it: the colouring switch's own selected state and its key CHANGE while the
           legend stays up, so a return would have made this round's control build once and never
           update — which looks exactly like a button that does nothing. */
        if(el.querySelector('.nato-year-row')){ const lbl=el.querySelector('.nato-year-val'); if(lbl) lbl.textContent=_natoYear; }
        else {
        const jp=HOST.lang==='jp';
        const row=document.createElement('div'); row.className='nato-year-row'; row.style.cssText='font-size:11px;color:var(--text-muted);margin-top:7px;display:flex;align-items:center;gap:7px;';
        if(typeof isMobile==='function'&&isMobile()){
          row.innerHTML=html`<label style="display:contents;">${IntMapLang.t(HOST.lang,'Year','加盟年','Beitrittsjahr','Год','Año')} <select class="nato-year-sel" style="flex:1;min-width:0;font-size:14px;padding:7px 9px;border-radius:8px;border:1px solid rgba(128,128,128,0.3);background:var(--input-bg);color:var(--text-main);">${
            NATO_YEARS.map(y=>html`<option value="${y}"${y===_natoYear?' selected':''}>${y}</option>`)}</select></label>`;
          row.querySelector('.nato-year-sel').addEventListener('change',(e)=>{ _natoYear=+e.target.value||_natoYear; applyNato(); const v=el.querySelector('.nato-year-val'); if(v) v.textContent=_natoYear; });
        } else {
          /* (#R27) Only the START and END years are labeled (a flex space-between row), not every
             accession year — the dense per-year ticks collided (1999/2004/2009/2017/2020/2023/2024 all
             bunched at the right) which was the "範囲のテキストが重なるクソUI". The selected year shows in
             the <b> readout, so no information is lost. */
          row.innerHTML=html`${[html`<label style="display:contents;">${IntMapLang.t(HOST.lang,'Year','加盟年','Beitrittsjahr','Год','Año')} <span style="flex:1;min-width:90px;display:flex;flex-direction:column;gap:1px;">`,
            html`<input type="range" min="0" max="${NATO_YEARS.length-1}" step="1" value="${NATO_YEARS.indexOf(_natoYear)}" style="width:100%;display:block;margin:0;box-sizing:border-box;">`,
            html`<span aria-hidden="true" style="display:flex;justify-content:space-between;font-size:8px;line-height:1;color:var(--text-muted);"><span>${NATO_YEARS[0]}</span><span>${NATO_YEARS[NATO_YEARS.length-1]}</span></span>`,
            html`</span></label> <b class="nato-year-val" style="color:var(--text-main);min-width:34px;text-align:right;">${_natoYear}</b>`]}`;
          row.querySelector('input').addEventListener('input',(e)=>{ _natoYear=NATO_YEARS[+e.target.value]||_natoYear; const v=el.querySelector('.nato-year-val'); if(v) v.textContent=_natoYear; clearTimeout(natoLegend._t); natoLegend._t=setTimeout(applyNato,120); });
        }
        el.appendChild(row);
        }
      }catch(_){}
      /* (#R289) …and the colouring switch, which is OUTSIDE the «built once» early return above
         because its selected state and its key both change while the legend stays up. */
      try{ const el2=document.getElementById('data-legend-nato'); if(el2){
        styleModeRow(el2,'nato-style-row',()=>_natoStyle,setNatoStyle);
        let k=el2.querySelector('.nato-yearkey-wrap');
        if(!k){ k=document.createElement('div'); k.className='nato-yearkey-wrap';
          const r=el2.querySelector('.nato-style-row'); if(r&&r.parentNode===el2) el2.insertBefore(k,r.nextSibling); else el2.appendChild(k); }
        k.innerHTML=(_natoStyle==='byYear')?yearKeyHTML(NATO_YEARS,yearColors(NATO_YEARS),NATO_JOIN,_natoYear,null):'';
        try{ tileLegends(); }catch(_){}
      } }catch(_){}
    }
    /* ══ (#R289) 国防費: ONE ROW, TWO WAYS OF EXPRESSING THE SAME BUDGET ═════════════════════════
       Total US$ billions and the same figure as a share of the country's GDP were `dl-milSpend` and
       `dl-milSpendGDP`: two rows side by side in 政治・軍事 painting one series. They are one row
       now, with the switch in the legend — and NOTHING about either picture changed. Both fills,
       both ramps, both legends and both `applyChoro` expressions are the ones that were already
       there; this function only decides which of the two is showing.
       ⚠ THE MODE BUTTONS GO IN BOTH LEGENDS, because the legend a reader is looking at is the one
       for the ACTIVE mode — a switch that lived in only one of them would be unreachable from the
       other half of its own toggle. */
    let milMode='total';                       /* 'total' = US$ billions · 'gdp' = % of GDP */
    const MIL_MODES=[['total',()=>IntMapLang.t(HOST.lang,'Total ($B)','総額（$B）','Gesamt ($ Mrd.)','Всего ($ млрд)','Total ($ mil M)')],
                     ['gdp',  ()=>IntMapLang.t(HOST.lang,'% of GDP','対GDP比','% des BIP','% ВВП','% del PIB')]];
    function milIsOn(){ try{ const cb=document.getElementById('dl-milSpend'); return !!(cb&&cb.checked); }catch(_){ return false; } }
    function milModeRow(el){ if(!el) return;
      let r=el.querySelector('.dl-milmode');
      if(!r){ r=document.createElement('div'); r.className='dl-milmode';
        r.style.cssText='display:flex;gap:5px;margin-top:7px;';
        r.innerHTML=html`${MIL_MODES.map(m=>html`<button type="button" data-m="${m[0]}" style="flex:1;min-width:0;border:1px solid rgba(128,128,128,0.3);border-radius:7px;padding:4px 6px;font-size:10.5px;font-weight:600;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"></button>`)}`;
        const bar=el.querySelector('.dl-scale'); if(bar&&bar.parentNode===el) el.insertBefore(r,bar.nextSibling); else el.appendChild(r);
        r.addEventListener('click',(ev)=>{ const b=ev.target.closest('button[data-m]'); if(b&&r.contains(b)) setMilMode(b.getAttribute('data-m')); }); }
      r.querySelectorAll('button[data-m]').forEach(b=>{ const k=b.getAttribute('data-m');
        const m=MIL_MODES.filter(x=>x[0]===k)[0]; if(m) b.textContent=m[1]();
        const act=(k===milMode);
        b.style.background=act?'var(--primary-fill)':'var(--input-bg)';
        b.style.color=act?'#fff':'var(--text-main)';
        b.setAttribute('aria-pressed',act?'true':'false'); }); }
    function applyMilMode(){
      const gdp=(milMode==='gdp'), on=milIsOn();
      try{ if(live.lgdMil) live.lgdMil.style.display=(on&&!gdp)?'block':'none'; }catch(_){}
      try{ if(live.lgdMilGDP) live.lgdMilGDP.style.display=(on&&gdp)?'block':'none'; }catch(_){}
      try{ milModeRow(live.lgdMil); milModeRow(live.lgdMilGDP); }catch(_){}
      try{ tileLegends(); }catch(_){}
      try{ setVis('milSpend-fill',on&&!gdp); }catch(_){}
      try{ setVis('milSpendGDP-fill',on&&gdp); }catch(_){}
      if(!on) return;
      return withCountries(()=>{ try{
        if(gdp){ addChoro('milSpendGDP'); applyChoro('milSpendGDP',s=>(s.milSpend!=null&&s.gdp)?s.milSpend/s.gdp*100:null); setVis('milSpendGDP-fill',true); }
        else   { addChoro('milSpend');    applyChoro('milSpend',   s=>s.milSpend);                                          setVis('milSpend-fill',true); }
      }catch(e){ console.warn('milSpend choro fail',e); } });
    }
    function setMilMode(k){ if(k!=='gdp'&&k!=='total') return; if(k===milMode) return; milMode=k; applyMilMode(); }
    function defensePctGDP(s){ if(!s||s.milSpend==null||!s.gdp) return null; const p=(s.milSpend/s.gdp)*100; return isFinite(p)?p:null; }
    function wireNatoHover(){
      if(_natoHoverWired) return; _natoHoverWired=true;
      GE().events.onLayer('mousemove','nato-fill',e=>{ if(!e.features.length) return; const s=countryStats[e.features[0].id]; if(!s) return;
        const yr=NATO_JOIN[s.code], pct=defensePctGDP(s);
        const el=ensureMapTooltip(); window.showMapTooltip(el);
        window.setMapTooltipHTML(el,String(html`${[html`<div style="font-weight:600;font-size:14px;">${s.flag?[flagM(s.flag),' ']:''}${cName(s)}</div>`,
          html`<div style="margin-top:5px;color:var(--text-muted);font-size:12px;">${IntMapLang.t(HOST.lang,'Joined NATO','NATO加盟年','NATO-Beitritt','Вступление в НАТО','Ingreso en la OTAN')}: <b style="color:var(--text-main);">${yr||'—'}</b></div>`,
          html`<div style="color:var(--text-muted);font-size:12px;">${IntMapLang.t(HOST.lang,'Defense spending','国防費','Verteidigungsausgaben','Расходы на оборону','Gasto en defensa')}: <b style="color:var(--text-main);">${s.milSpend!=null?'$'+s.milSpend+'B (2023)':'—'}</b></div>`,
          html`<div style="color:var(--text-muted);font-size:12px;">${IntMapLang.t(HOST.lang,'Defense (% GDP)','国防費 (対GDP)','Verteidigung (% BIP)','Оборона (% ВВП)','Defensa (% PIB)')}: <b style="color:var(--text-main);">${pct!=null?pct.toFixed(2)+'%':'—'}</b></div>`]}`));
        positionTooltip(e.point);
      });
      GE().events.onLayer('mouseleave','nato-fill',()=>{ if(HOST.mapTooltipEl) window.hideMapTooltip(HOST.mapTooltipEl); });
    }

    /* (#R26 / EU) European Union members fill + accession-year time-travel control (mirrors NATO). Real
       enlargement years; the UK is dropped from 2020 (Brexit). EU outermost regions are NOT clipped. */
    const EU=new Set(['BEL','FRA','DEU','ITA','LUX','NLD','DNK','IRL','GBR','GRC','ESP','PRT','AUT','FIN','SWE','CYP','CZE','EST','HUN','LVA','LTU','MLT','POL','SVK','SVN','BGR','ROU','HRV']);
    const EU_JOIN={BEL:1958,FRA:1958,DEU:1958,ITA:1958,LUX:1958,NLD:1958,DNK:1973,IRL:1973,GBR:1973,GRC:1981,ESP:1986,PRT:1986,AUT:1995,FIN:1995,SWE:1995,CYP:2004,CZE:2004,EST:2004,HUN:2004,LVA:2004,LTU:2004,MLT:2004,POL:2004,SVK:2004,SVN:2004,BGR:2007,ROU:2007,HRV:2013};
    const EU_LEFT={GBR:2020};
    const EU_YEARS=[1958,1973,1981,1986,1995,2004,2007,2013,2020,2024];
    let _euYear=EU_YEARS[EU_YEARS.length-1];
    function euMemberAt(code,y){ const j=EU_JOIN[code]; if(j==null||j>y) return false; const l=EU_LEFT[code]; if(l&&y>=l) return false; return true; }
    /* (#R313) the collection this layer paints, published so js/layer-home.js frames the geometry
       that is actually on screen — including whichever accession year the reader has Chronos set to —
       instead of a box somebody typed. See that file for why it takes each member's largest landmass. */
    window.IntMapEuFC=()=>{ try{ return buildEuFC(); }catch(_){ return null; } };
    function buildEuFC(){ const feats=[]; if(HOST.countryGeo&&HOST.countryGeo.features){ HOST.countryGeo.features.forEach(f=>{ const code=String(f.id); if(!EU.has(code)) return; if(!euMemberAt(code,_euYear)) return; feats.push({type:'Feature',id:code,properties:{__code:code,__y:(EU_JOIN[code]||0)},geometry:f.geometry}); }); } return {type:'FeatureCollection',features:feats}; }
    /* (#R289) 2020 and 2024 are in EU_YEARS as SLIDER stops (Brexit, and «today»); nobody joined in
       either, so the colour key is built from the years countries actually acceded in — otherwise
       the ramp would spend two of its eight steps on waves with no members. */
    const EU_JOIN_YEARS=[...new Set(Object.values(EU_JOIN))].sort((a,b)=>a-b);
    let _euStyle='uniform';                          /* (#R289) 'uniform' | 'byYear' */
    function euFillColor(){ return (_euStyle==='byYear')
      ? yearFillExpr(EU_JOIN_YEARS,yearColors(EU_JOIN_YEARS),'#1c3faa') : '#1c3faa'; }
    function setEuStyle(k){ if(k!=='uniform'&&k!=='byYear') return; if(k===_euStyle) return; _euStyle=k; applyEu(); }
    function addEu(){
      if(!GE().layers.hasSource('src-eu')) GE().layers.addSource('src-eu',{type:'geojson',data:buildEuFC(),promoteId:'__code'});
      if(!GE().layers.has('eu-fill')) GE().layers.add({id:'eu-fill',type:'fill',source:'src-eu',layout:{visibility:'none'},paint:{'fill-color':euFillColor(),'fill-opacity':opacities.eu!=null?opacities.eu:0.5}},beforeId);
      if(!GE().layers.has('eu-line')) GE().layers.add({id:'eu-line',type:'line',source:'src-eu',layout:{visibility:'none'},paint:{'line-color':'#ffd617','line-width':1.5}},beforeId);
    }
    function applyEu(){ try{ GE().layers.setSourceData('src-eu',buildEuFC()); }catch(_){}
      try{ if(GE().layers.has('eu-fill')) GE().layers.setPaint('eu-fill','fill-color',euFillColor()); }catch(_){}
      /* ⚠ the legend is only re-drawn while the layer is ON — `_registerLayerOpacity` SHOWS the
         box, so calling it from a repaint that ran with the layer off would open a legend for a
         layer that is not on the map. */
      try{ const cb=document.getElementById('dl-eu'); if(cb&&cb.checked) euLegend(); }catch(_){} }
    function setEuVis(on){ ['eu-fill','eu-line'].forEach(l=>setVis(l,on)); }
    function euLegend(){
      try{
        const el=window._registerLayerOpacity&&window._registerLayerOpacity('eu',LA('EU members','EU加盟国','EU-Mitglieder','Страны ЕС','Países de la UE'),['eu-fill','eu-line'],'dl-eu');
        if(!el) return;
        /* ⚠ (#R289) THE «BUILT ONCE» GUARD IS NOW A BRANCH, NOT A RETURN. It used to leave the
           function the moment the year row existed, which is right for the row (rebuilding a
           <select> under the finger that opened it is #R266's defect) and wrong for everything
           added after it: the colouring switch's own selected state and its key CHANGE while the
           legend stays up, so a return would have made this round's control build once and never
           update — which looks exactly like a button that does nothing. */
        if(el.querySelector('.eu-year-row')){ const lbl=el.querySelector('.eu-year-val'); if(lbl) lbl.textContent=_euYear; }
        else {
        const jp=HOST.lang==='jp';
        const row=document.createElement('div'); row.className='eu-year-row'; row.style.cssText='font-size:11px;color:var(--text-muted);margin-top:7px;display:flex;align-items:center;gap:7px;';
        if(typeof isMobile==='function'&&isMobile()){
          row.innerHTML='<label style="display:contents;">'+(IntMapLang.t(HOST.lang,'Year','加盟年','Beitrittsjahr','Год','Año'))+' <select class="eu-year-sel" style="flex:1;min-width:0;font-size:14px;padding:7px 9px;border-radius:8px;border:1px solid rgba(128,128,128,0.3);background:var(--input-bg);color:var(--text-main);">'+
            EU_YEARS.map(y=>'<option value="'+y+'"'+(y===_euYear?' selected':'')+'>'+y+'</option>').join('')+'</select></label>';
          row.querySelector('.eu-year-sel').addEventListener('change',(e)=>{ _euYear=+e.target.value||_euYear; applyEu(); const v=el.querySelector('.eu-year-val'); if(v) v.textContent=_euYear; });
        } else {
          /* (#R27) Same fix as NATO: label only the first/last year (space-between), not every dense
             enlargement year, so the range text no longer overlaps. */
          row.innerHTML=html`${[html`<label style="display:contents;">${IntMapLang.t(HOST.lang,'Year','加盟年','Beitrittsjahr','Год','Año')} <span style="flex:1;min-width:90px;display:flex;flex-direction:column;gap:1px;">`,
            html`<input type="range" min="0" max="${EU_YEARS.length-1}" step="1" value="${EU_YEARS.indexOf(_euYear)}" style="width:100%;display:block;margin:0;box-sizing:border-box;">`,
            html`<span aria-hidden="true" style="display:flex;justify-content:space-between;font-size:8px;line-height:1;color:var(--text-muted);"><span>${EU_YEARS[0]}</span><span>${EU_YEARS[EU_YEARS.length-1]}</span></span>`,
            html`</span></label> <b class="eu-year-val" style="color:var(--text-main);min-width:34px;text-align:right;">${_euYear}</b>`]}`;
          row.querySelector('input').addEventListener('input',(e)=>{ _euYear=EU_YEARS[+e.target.value]||_euYear; const v=el.querySelector('.eu-year-val'); if(v) v.textContent=_euYear; clearTimeout(euLegend._t); euLegend._t=setTimeout(applyEu,120); });
        }
        el.appendChild(row);
        }
      }catch(_){}
      /* (#R289) …and the same colouring switch the NATO legend gets, for the same instruction:
         「EU加盟国レイヤーでも同じことをやって。」 ⚠ The key is built from EU_JOIN_YEARS and it
         subtracts a member who has LEFT by the selected year — the United Kingdom is in EU_JOIN
         for ever and off the map from 2020, so counting the 1973 wave as three after Brexit would
         put a number in the legend that is not on the map. */
      try{ const el2=document.getElementById('data-legend-eu'); if(el2){
        styleModeRow(el2,'eu-style-row',()=>_euStyle,setEuStyle);
        let k=el2.querySelector('.eu-yearkey-wrap');
        if(!k){ k=document.createElement('div'); k.className='eu-yearkey-wrap';
          const r=el2.querySelector('.eu-style-row'); if(r&&r.parentNode===el2) el2.insertBefore(k,r.nextSibling); else el2.appendChild(k); }
        k.innerHTML=(_euStyle==='byYear')?yearKeyHTML(EU_JOIN_YEARS,yearColors(EU_JOIN_YEARS),EU_JOIN,_euYear,EU_LEFT):'';
        try{ tileLegends(); }catch(_){}
      } }catch(_){}
    }
    function wireEuHover(){
      if(_euHoverWired) return; _euHoverWired=true;
      GE().events.onLayer('mousemove','eu-fill',e=>{ if(!e.features.length) return; const s=countryStats[e.features[0].id]; const code=e.features[0].id; if(!s) return;
        const el=ensureMapTooltip(); window.showMapTooltip(el);
        window.setMapTooltipHTML(el,String(html`${[html`<div style="font-weight:600;font-size:14px;">${s.flag?[flagM(s.flag),' ']:''}${cName(s)}</div>`,
          html`<div style="margin-top:5px;color:var(--text-muted);font-size:12px;">${IntMapLang.t(HOST.lang,'Joined EU','EU加盟年','EU-Beitritt','Вступление в ЕС','Ingreso en la UE')}: <b style="color:var(--text-main);">${EU_JOIN[code]||'—'}${EU_LEFT[code]?(' → '+EU_LEFT[code]+(IntMapLang.t(HOST.lang,' left',' 離脱',' ausgetreten',' вышла',' salió'))):''}</b></div>`]}`));
        positionTooltip(e.point);
      });
      GE().events.onLayer('mouseleave','eu-fill',()=>{ if(HOST.mapTooltipEl) window.hideMapTooltip(HOST.mapTooltipEl); });
    }

    /* (#R94) NATO & EU enlargement follow the master spacetime clock: travel to a year → only members that
       had already joined by then are shown; back to "Now" → every current member. The per-layer year sliders
       in the legend still work as instant overrides and are kept in step with the clock. */
    function _syncYearLegend(prefix,years,val){ try{
      const v=document.querySelector('.'+prefix+'-year-val'); if(v) v.textContent=val;
      const row=document.querySelector('.'+prefix+'-year-row'); if(!row) return;
      const rg=row.querySelector('input[type=range]'); if(rg){ let idx=0; for(let i=0;i<years.length;i++){ if(years[i]<=val) idx=i; } rg.value=idx; }
      const se=row.querySelector('select'); if(se){ let best=years[0]; years.forEach(y=>{ if(y<=val) best=y; }); se.value=best; }
    }catch(_){} }
    /* (layer-packages) the handler is named so that it can be run once, now, with the clock as it stands: the rows have
       followed the clock since boot, and this module arrives the first time one of them is switched — after the clock
       may already have moved. Run on the clock's own state it leaves the years exactly where the subscription would have. */
    const _onClock=(e)=>{
      const nt=e.isLive?NATO_YEARS[NATO_YEARS.length-1]:e.year;
      if(nt!==_natoYear){ _natoYear=nt;
        try{ if(GE().layers.has('nato-fill')&&GE().layers.getLayout('nato-fill','visibility')==='visible') applyNato(); }catch(_){}
        _syncYearLegend('nato',NATO_YEARS,_natoYear); }
      const et=e.isLive?EU_YEARS[EU_YEARS.length-1]:e.year;
      if(et!==_euYear){ _euYear=et;
        try{ if(GE().layers.has('eu-fill')&&GE().layers.getLayout('eu-fill','visibility')==='visible') applyEu(); }catch(_){}
        _syncYearLegend('eu',EU_YEARS,_euYear); }
    };
    try{ if(IntMapTime){ IntMapTime.on(_onClock); _onClock(IntMapTime.state()); } }catch(_){}
    /* (layer-packages) the rows: what toggleLayer's branches and setLayerOpacity's did for them */
    return { rows: {
      'dl-nato': {
        on: () => {
      let req;
          /* NATO members fill (#14) + accession-year time-travel control (#R25/#24); accession year +
             defense %GDP also show on hover. */
          req=withCountries(()=>{ try{ addNato(); applyNato(); wireNatoHover(); setNatoVis(true); natoLegend();
            /* ⚠ (#R337) 「NATO membersレイヤーをオンにしたら、自動的にNATOに行くように。」 Inside
               `withCountries` for the same reason the EU branch below is: the frame is measured from
               the members' own footprints and those arrive with the country table. The «may this layer
               move the camera / has it already / did the READER ask» decision is js/layer-home.js's. */
            try{ window.IntMapLayerHome&&window.IntMapLayerHome.arrive('dl-nato'); }catch(_){}
          }catch(e){ console.warn('nato fail',e); } });
      return req;
        },
        off: () => { setNatoVis(false); try{ window._hideGenericLegend&&window._hideGenericLegend('nato'); }catch(_){} },
        opacity: (v) => { if(GE().layers.has('nato-fill'))GE().layers.setPaint('nato-fill','fill-opacity',v); },
      },
      'dl-eu': {
        on: () => {
      let req;
          /* (#R26) EU members fill + accession-year time-travel control (mirrors NATO). */
          req=withCountries(()=>{ try{ addEu(); applyEu(); wireEuHover(); setEuVis(true); euLegend();
            /* ⚠ (#R313) 「EU membersレイヤーをオンにしたら、自動的にEUに行くように。」 Inside
               `withCountries` because the frame is the union of the members' own footprints and
               those arrive with the country table. The «may this layer move the camera / has it
               already / did the READER ask» decision is js/layer-home.js's, not this branch's. */
            try{ window.IntMapLayerHome&&window.IntMapLayerHome.arrive('dl-eu'); }catch(_){}
          }catch(e){ console.warn('eu fail',e); } });
      return req;
        },
        off: () => { setEuVis(false); try{ window._hideGenericLegend&&window._hideGenericLegend('eu'); }catch(_){} },
        opacity: (v) => { if(GE().layers.has('eu-fill'))GE().layers.setPaint('eu-fill','fill-opacity',v); },
      },
      'dl-milSpend': {
        on: () => applyMilMode(),   /* (#R289) whichever of the two modes is selected */
        off: () => { setVis('milSpend-fill',false); live.lgdMil.style.display='none'; live.lgdMilGDP.style.display='none'; setVis('milSpendGDP-fill',false); },   /* (#R289) both halves of the one row */
        /* Keep no-data countries gray (0.45) — see addChoro for the "<= 0" reasoning. (The % of GDP half has no row of its
           own; its legend's slider still reaches js/data-layers.js setLayerOpacity as `milSpendGDP`.) */
        opacity: (v) => { if(GE().layers.has('milSpend-fill')) GE().layers.setPaint('milSpend-fill','fill-opacity',['case',['<=',['to-number',['feature-state','milSpend'],0],0],Math.max(0,v*0.75),v]); },
      },
    }, onLegendsRebuilt: () => { applyMilMode();
      /* (hist-fidelity) the rebuilt NATO card carries no count of its own (js/data-layers.js buildCoreLegends) —
         while the row is on, the count is written again from what is drawn */
      try{ const cb=document.getElementById('dl-nato'); if(cb&&cb.checked) natoLegend(); }catch(_){} } };
}
