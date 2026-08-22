/* ============================================================================
 *  IntMap · EVERY U.S. PRESIDENTIAL ELECTION — IntMapUSElections   (#R243)
 * ----------------------------------------------------------------------------
 *  「それまでのアメリカ大統領選挙の結果をすべて見れるレイヤーを作れ。共和党州と民主党州が塗り分けされ、
 *    バーチャート付き。（選挙特番でよくあるタイプのやつ）年は選べる。」
 *  Scope confirmed with the reader: all sixty elections 1789–2024; the map is coloured by who took
 *  each state's ELECTORAL VOTES and the bar chart carries the electoral-vote totals AND the national
 *  popular-vote share.
 *
 *  ══ WHERE THE DATA COMES FROM ═══════════════════════════════════════════════════════════════
 *  data/us-elections.json and data/us-states.json, both written by scripts/build-us-elections.mjs —
 *  see that file's header for the sources and for how the ambiguous years (1789/1792, 1824, 1836,
 *  1860 and every third-party state win) are resolved. Nothing is computed here; this file paints
 *  what that file says and nothing else.
 *
 *  ══ HOW THE FILL IS DRIVEN ══════════════════════════════════════════════════════════════════
 *  Each of the 51 features carries a `col` property that the year selector rewrites, and the fill
 *  reads `['get','col']`. Rewriting 51 properties and calling `setSourceData` is a fraction of a
 *  millisecond, so the year slider is smooth and the alternative — a per-year `match` expression
 *  rebuilt on every change — buys nothing and cannot express «this state did not vote that year».
 *  ⚠ A STATE THAT DID NOT EXIST YET GETS NO COLOUR AT ALL, not a grey one that could be mistaken for
 *  a party: `col` is null and the fill's opacity goes to 0 for that feature, so 1789 shows ten states
 *  on an otherwise empty map, which is what happened.
 * ==========================================================================*/
window.IntMapModules=window.IntMapModules||{};
window.IntMapModules.usElections=function(HOST){
  /* (#R251) the language helper and its ARRAY form — see `pickArgs` in js/lang-registry.js. The tuples below were bare array literals, which no instrument can see, so every language past the two they listed read English. */
  const LA=window.IntMapLang.pickArgs();
  const GE=()=>window.IntMapGeoEngine;
  const L=window.IntMapLang.pick(()=>HOST.lang);
  const IDS=['usel-fill','usel-line'];
  const SRC='usel-src';
  let data=null, geo=null, year=null, on=false, loading=null, popup=null;

  function _canDraw(){ try{ return !!HOST.canDraw(); }catch(_){ try{ return !!GE().ready(); }catch(__){ return false; } } }
  const setVis=(v)=>IDS.forEach(id=>{ try{ if(GE().layers.has(id)) GE().layers.setLayout(id,'visibility',v?'visible':'none'); }catch(_){} });

  async function load(){
    if(data&&geo) return true;
    if(loading) return loading;
    loading=(async()=>{
      try{
        const base=(document.baseURI||'./');
        const [a,b]=await Promise.all([
          fetch(new URL('data/us-elections.json',base).href).then(r=>r.ok?r.json():null),
          fetch(new URL('data/us-states.json',base).href).then(r=>r.ok?r.json():null)]);
        if(!a||!b) return false;
        data=a; geo=b;
        if(year==null) year=data.elections[data.elections.length-1].y;
        return true;
      }catch(_){ return false; } finally { loading=null; }
    })();
    return loading;
  }
  function election(y){ return (data&&data.elections.find(e=>e.y===y))||null; }
  function colourOf(e,i){ const c=e.c[i]; if(!c) return null; return c.col||((data.parties[c.p]||{}).col)||'#888'; }

  /* ── paint the year ────────────────────────────────────────────────────────────────────────── */
  function apply(){
    const e=election(year); if(!e||!geo) return;
    geo.features.forEach(f=>{
      const i=e.s[f.properties.st];
      /* ⚠ (#R243) A STATE THAT DID NOT VOTE HAS NO `col` PROPERTY AT ALL. Setting it to null was
         measured first and is wrong: MapLibre's `coalesce` over a property that is present-but-null
         does not fall through to the empty string, so the opacity case never matched and 1789
         painted all 51 states black. `['has','col']` cannot be ambiguous. */
      if(i==null){ delete f.properties.col; delete f.properties.who; delete f.properties.party; return; }
      f.properties.col=colourOf(e,i);
      f.properties.who=e.c[i].n;
      f.properties.party=((data.parties[e.c[i].p]||{}).en||e.c[i].p);
    });
    try{ GE().layers.setSourceData(SRC,geo); }catch(_){}
    renderPanel();
  }
  function ensure(){
    if(GE().layers.hasSource(SRC)) return true;
    if(!_canDraw()||!geo) return false;
    try{
      GE().layers.addSource(SRC,{type:'geojson',data:geo,attribution:'Natural Earth · National Archives'});
      const before=GE().layers.has('tool-poly')?'tool-poly':undefined;
      /* ⚠⚠ (#R243) «DID NOT VOTE» IS EXPRESSED IN THE COLOUR, NOT IN THE OPACITY, and the reason is
         the opacity SLIDER. `_registerLayerOpacity` gives this layer the same slider every other data
         layer has, and `setLayerOpacity` writes `fill-opacity` as a plain number — so a
         `['case',['has','col'],0.78,0]` expression is silently replaced the moment the slider
         initialises (MEASURED: `getPaintProperty('usel-fill','fill-opacity')` came back `"0.85"` and
         1789 painted all 51 states). A fully transparent FILL COLOUR survives any opacity the reader
         chooses, because α=0 times anything is still nothing. */
      GE().layers.add({id:'usel-fill',type:'fill',source:SRC,layout:{visibility:'none'},
        paint:{'fill-color':['coalesce',['get','col'],'rgba(0,0,0,0)'],'fill-opacity':0.78}},before);
      GE().layers.add({id:'usel-line',type:'line',source:SRC,layout:{visibility:'none'},
        paint:{'line-color':['case',['has','col'],'rgba(255,255,255,0.55)','rgba(0,0,0,0)'],'line-width':0.7}},before);
      try{ GE().events.onLayer('click','usel-fill',onClick); }catch(_){}
      return true;
    }catch(_){ return false; }
  }
  /* ══ (#R289) A CLICK ON A STATE SHOWS THAT STATE'S OWN RESULT ═══════════════════════════════
     「クリックした州内での票のグラフを表示して。選挙人の数も記載。」 The popup used to name the
     winner and nothing else — the same fact the colour already carried. It now carries the state's
     ELECTORS (per candidate, so Maine and Nebraska read correctly) and its POPULAR VOTE as a bar
     per candidate, from `sv` in data/us-elections.json — see scripts/build-us-elections.mjs for
     where those numbers come from and how every one of them is checked.
     ⚠ WHAT IS ABSENT IS ABSENT, NOT ZERO. Before 1824 most states had no popular vote at all (their
     electors were appointed by the legislature) and South Carolina's were until 1860. Those states
     get the elector row and a line saying why there is no vote to chart — never a bar of length 0
     standing for a ballot nobody cast.
     ⚠ AND THE BARS ARE A SHARE OF THE STATE'S OWN TURNOUT, so they do not add to 100 % wherever
     somebody else was on the ballot: Mississippi 1960's unpledged slate outpolled both named
     candidates and is not in the record's columns. Bars normalised to the two names would quietly
     turn Kennedy's 36 % into 60 %. */
  function stateHtml(e,st,name){
    const esc=(x)=>HOST.escapeHtml(String(x==null?'':x));
    const sv=(e.sv&&e.sv[st])||null;
    const nf=(n)=>{ try{ return Number(n).toLocaleString(window.IntMapLang.locale(HOST.lang,'en-US')); }catch(_){ return String(n); } };
    const evTot=(sv&&sv.e)?sv.e.reduce((a,b)=>a+(b||0),0):0;
    let h='<div class="usel-pop"><b class="usel-pop-h">'+esc(name)+'</b>'
      +'<div class="usel-pop-y">'+e.y+(evTot?(' · '+L('Electoral votes','選挙人票','Wahlmännerstimmen','Голоса выборщиков','Votos electorales')+' <b>'+evTot+'</b>'):'')+'</div>';
    if(!sv) return h+'<div class="usel-note">'+L('No state-level return is recorded for this election.','この選挙の州別記録はありません。','Für diese Wahl ist kein Ergebnis dieses Staates verzeichnet.','Результат этого штата за эти выборы не зафиксирован.','No hay resultado estatal registrado para esta elección.')+'</div></div>';
    const tot=sv.t||0;
    const maxV=sv.v?Math.max.apply(null,sv.v):0;
    const maxE=sv.e?Math.max.apply(null,sv.e):0;
    const order=e.c.map((c,i)=>i).sort((a,b)=>{
      const ea=(sv.e&&sv.e[a])||0, eb=(sv.e&&sv.e[b])||0; if(eb!==ea) return eb-ea;
      const va=(sv.v&&sv.v[a])||0, vb=(sv.v&&sv.v[b])||0; return vb-va; });
    order.forEach(i=>{
      const c=e.c[i], col=colourOf(e,i)||'#888';
      const v=(sv.v&&sv.v[i])||0, evv=(sv.e&&sv.e[i])||0;
      if(!v&&!evv) return;
      const pct=(tot&&v)?(v/tot*100):null;
      const w=sv.v?(maxV?Math.max(1.5,Math.round(v/maxV*100)):0):(maxE?Math.max(1.5,Math.round(evv/maxE*100)):0);
      h+='<div class="usel-row">'
        +'<span class="usel-nm"><i style="background:'+esc(col)+';"></i><b>'+esc(c.n)+'</b></span>'
        +'<span class="usel-ev">'+(sv.e?(evv+' '+L('EV','人','WS','ГВ','VE')):'')+'</span>'
        +'<span class="usel-bar"><i style="width:'+w+'%;background:'+esc(col)+';"></i></span>'
        +'<span class="usel-pv">'+esc((data.parties[c.p]||{}).en||c.p)
          +(sv.v?(' · '+nf(v)+(pct!=null?(' · '+pct.toFixed(1)+'%'):'')):'')
        +'</span></div>';
    });
    if(sv.v&&tot) h+='<div class="usel-note">'+L('Total votes cast','総投票数','Abgegebene Stimmen','Всего голосов','Votos emitidos')+': '+nf(tot)+'</div>';
    if(!sv.v) h+='<div class="usel-note">'+L('No popular vote — this state\u2019s electors were appointed by its legislature.','一般投票なし — この州の選挙人は州議会が選出しました。','Keine Volkswahl — die Wahlmänner dieses Staates wurden von seinem Parlament bestimmt.','Всенародного голосования не было — выборщиков штата назначил его законодательный орган.','Sin voto popular: los electores de este estado los designó su legislatura.')+'</div>';
    else if(!sv.e) h+='<div class="usel-note">'+L('The record does not break this state\u2019s electors down by candidate.','この州の選挙人票の候補者別内訳は記録にありません。','Die Aufteilung der Wahlmänner dieses Staates auf die Kandidaten ist nicht verzeichnet.','Распределение выборщиков этого штата по кандидатам не зафиксировано.','El registro no desglosa por candidato los electores de este estado.')+'</div>';
    return h+'</div>';
  }
  function onClick(ev){
    try{
      const f=(ev&&ev.features&&ev.features[0]); if(!f) return;
      const p=f.properties||{}; if(!p.who) return;
      const e=election(year); if(!e) return;
      _css();
      const html=stateHtml(e,String(p.st||''),p.name||p.st||'');
      if(popup){ try{ popup.remove(); }catch(_){} }
      popup=GE().ui.attach(GE().ui.popup({closeButton:true,closeOnClick:true,className:'plc-popup',maxWidth:'300px'}).setLngLat(ev.lngLat).setHTML(html));
    }catch(_){}
  }

  /* ── the panel: the year picker and the bar chart ──────────────────────────────────────────── */
  function _css(){
    if(document.getElementById('usel-css')) return;
    const s=document.createElement('style'); s.id='usel-css';
    s.textContent=[
      '.usel-yr{display:flex;align-items:center;gap:6px;margin:7px 0 9px;}',
      '.usel-yr select{flex:1;min-width:0;box-sizing:border-box;padding:6px 8px;border-radius:9px;'
        +'border:1px solid rgba(128,128,128,0.28);background:var(--input-bg);color:var(--text-main);font-size:12.5px;'
        +'font-variant-numeric:tabular-nums;}',
      /* (#R289) 「年度を送るボタンは、<>のサイズが小さすぎる。」 A 30 px box with a 13 px glyph is under
         the 44 px a finger is measured against, and the chevron itself was the small part of it. The
         box is 38 px and the glyph 22 px — on a phone the box is a full 44. */
      '.usel-step{flex:0 0 auto;width:38px;height:38px;border-radius:50%;border:1px solid rgba(128,128,128,0.24);'
        +'background:var(--input-bg);color:var(--text-main);font-size:22px;font-weight:600;line-height:1;cursor:pointer;padding:0;'
        +'display:flex;align-items:center;justify-content:center;}',
      '.usel-step:hover:not(:disabled){background:var(--primary-color);color:#fff;border-color:transparent;}',
      '@media(max-width:768px){.usel-step{width:44px;height:44px;font-size:24px;}}',
      '.usel-step:disabled{opacity:.35;cursor:default;}',
      '.usel-row{display:grid;grid-template-columns:1fr auto;gap:2px 8px;align-items:baseline;margin-bottom:7px;}',
      '.usel-nm{font-size:11.5px;color:var(--text-main);display:flex;align-items:center;gap:5px;min-width:0;}',
      '.usel-nm i{flex:0 0 auto;width:9px;height:9px;border-radius:2px;font-style:normal;}',
      '.usel-nm b{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.usel-ev{font-size:11.5px;font-weight:700;color:var(--text-main);font-variant-numeric:tabular-nums;}',
      '.usel-bar{grid-column:1/3;height:9px;border-radius:5px;background:rgba(128,128,128,0.18);overflow:hidden;}',
      '.usel-bar i{display:block;height:100%;border-radius:5px;}',
      '.usel-pv{grid-column:1/3;font-size:10.5px;color:var(--text-muted);font-variant-numeric:tabular-nums;}',
      '.usel-maj{position:relative;height:0;}',
      '.usel-note{font-size:10.5px;color:var(--text-muted);line-height:1.5;margin-top:6px;}',
      '.usel-win{font-size:10.5px;color:var(--text-muted);margin:-3px 0 8px;}',
      /* (#R289) the state popup reuses the legend's row/bar shapes, so a state reads like the nation */
      '.usel-pop{font-size:12px;line-height:1.5;min-width:190px;color:var(--text-main);}',
      '.usel-pop-h{font-size:13.5px;display:block;}',
      '.usel-pop-y{color:var(--text-muted);font-size:11px;margin:1px 0 8px;}',
      '.usel-pop .usel-ev{white-space:nowrap;}',
    ].join('');
    document.head.appendChild(s);
  }
  function renderPanel(){
    const el=document.getElementById('data-legend-uselect'); if(!el||!data) return;
    /* ⚠ (#R244) 「操作時に凡例が上に伸びるのではなく下に伸びるように。」 This legend rebuilds its whole
       body on every year change and the row count varies with the number of candidates, so a
       bottom-anchored box grows upward — out from under the very selector being operated. The flag
       is read by tileLegends() in js/data-layers.js, which places a flagged legend by its top; the
       stack order and the resting position are unchanged. */
    el.dataset.growDown='1';
    _css();
    let box=el.querySelector('.usel-box');
    if(!box){ box=document.createElement('div'); box.className='usel-box';
      const op=el.querySelector('.dl-op-row'); if(op) el.insertBefore(box,op); else el.appendChild(box); }
    const e=election(year); if(!e) return;
    const years=data.elections.map(x=>x.y);
    const i=years.indexOf(year);
    const total=e.t||e.c.reduce((a,c)=>a+(c.ev||0),0);
    /* the majority line is «half the electoral votes actually cast, plus one» — 270 today, 70 in 1789 */
    const need=Math.floor(total/2)+1;
    const maxEv=Math.max.apply(null,e.c.map(c=>c.ev||0))||1;
    const esc=(s)=>HOST.escapeHtml(String(s==null?'':s));
    const rows=e.c.map((c,k)=>{
      const col=colourOf(e,k), w=Math.max(1.5,Math.round((c.ev||0)/maxEv*100));
      return '<div class="usel-row">'
        +'<span class="usel-nm"><i style="background:'+esc(col)+';"></i><b>'+esc(c.n)+'</b></span>'
        +'<span class="usel-ev">'+(c.ev||0)+'</span>'
        +'<span class="usel-bar"><i style="width:'+w+'%;background:'+esc(col)+';"></i></span>'
        +'<span class="usel-pv">'+esc((data.parties[c.p]||{}).en||c.p)
          +(c.pv!=null?(' · '+c.pv.toFixed(1)+'% '+L('of the popular vote','得票率','der Wählerstimmen','голосов избирателей','del voto popular')):'')
        +'</span></div>';
    }).join('');
    box.innerHTML='<div class="usel-yr">'
        +'<button class="usel-step usel-prev" aria-label="'+esc(L('Earlier election','前の選挙','Frühere Wahl','Предыдущие выборы','Elección anterior'))+'"'+(i<=0?' disabled':'')+'>‹</button>'
        +'<select class="usel-sel">'+data.elections.map(x=>'<option value="'+x.y+'"'+(x.y===year?' selected':'')+'>'+x.y+' · '+esc(String(x.c[x.w||0].n).split(' ').pop())+'</option>').join('')+'</select>'
        +'<button class="usel-step usel-next" aria-label="'+esc(L('Later election','次の選挙','Spätere Wahl','Следующие выборы','Elección siguiente'))+'"'+(i>=years.length-1?' disabled':'')+'>›</button>'
      +'</div>'
      +'<div class="usel-win">'+L('Electoral votes','選挙人票','Wahlmännerstimmen','Голоса выборщиков','Votos electorales')
        +' · '+L('majority','過半数','Mehrheit','большинство','mayoría')+' '+need+'/'+total+'</div>'
      +rows
      +(e.split&&e.split.length?('<div class="usel-note">'+L('Split districts','分割された選挙区','Geteilte Distrikte','Разделённые округа','Distritos divididos')+': '+esc(e.split.join(', '))+'</div>'):'')
      +(e.note?('<div class="usel-note">'+esc(e.note)+'</div>'):'')
      +'<div class="usel-note">'+L('Colour = who received the state’s electoral votes.','塗り分けは、その州の選挙人票を得た候補です。','Farbe = wer die Wahlmännerstimmen des Staates erhielt.','Цвет — кто получил голоса выборщиков штата.','El color indica quién obtuvo los votos electorales del estado.')
        +' '+L('Source: National Archives · American Presidency Project','出典: 米国国立公文書館・American Presidency Project','Quelle: National Archives · American Presidency Project','Источник: Национальный архив США · American Presidency Project','Fuente: Archivos Nacionales · American Presidency Project')+'</div>';
    const sel=box.querySelector('.usel-sel');
    sel.onchange=()=>{ year=+sel.value; apply(); };
    box.querySelector('.usel-prev').onclick=()=>{ const k=years.indexOf(year); if(k>0){ year=years[k-1]; apply(); } };
    box.querySelector('.usel-next').onclick=()=>{ const k=years.indexOf(year); if(k<years.length-1){ year=years[k+1]; apply(); } };
    try{ window._tileLegends&&window._tileLegends(); }catch(_){}
  }

  /* ── the switch ────────────────────────────────────────────────────────────────────────────── */
  async function toggle(want){
    on=!!want;
    if(!on){
      setVis(false);
      if(popup){ try{ popup.remove(); }catch(_){} popup=null; }
      try{ window._hideGenericLegend&&window._hideGenericLegend('uselect'); }catch(_){}
      return false;
    }
    const ok=await load();
    if(!ok){ try{ HOST.imToast(L('Could not load the election data','選挙データを読み込めませんでした','Wahldaten konnten nicht geladen werden','Не удалось загрузить данные о выборах','No se pudieron cargar los datos electorales')); }catch(_){} return false; }
    if(!ensure()) return false;
    setVis(true);
    try{ window._registerLayerOpacity&&window._registerLayerOpacity('uselect',
      LA('U.S. presidential elections','アメリカ大統領選挙','US-Präsidentschaftswahlen','Президентские выборы в США','Elecciones presidenciales de EE. UU.'),
      IDS,'dl-uselect'); }catch(_){}
    apply();
    /* the layer is about one country, so the first switch-on flies to it.
       ⚠ (#R313) THE BOX AND THE «ONCE» RULE MOVED TO js/layer-home.js. This was the only place in
       the app that moved the camera on a layer toggle, and when the reader asked for the same
       behaviour on EU and Ukraine it would have become three private copies of «once» in three
       files. It is one table now, and it also learned something this line never knew: a session
       RESTORED with the layer on did not ask to be flown anywhere. */
    try{ window.IntMapLayerHome&&window.IntMapLayerHome.arrive('dl-uselect'); }catch(_){}
    return true;
  }

  /* the row in the Layers panel. `dl-uselect` is the id reorganizeLayerPanel and the tile browser
     both look for; the row is created here so the layer owns its own entry (#R164's rule). */
  function buildRow(){
    const dd=document.getElementById('layer-dropdown'); if(!dd||document.getElementById('dl-uselect')) return;
    const w=document.createElement('div'); w.className='lyr-row'; w.id='lyrrow-uselect';
    w.innerHTML='<label class="layer-option"><input type="checkbox" id="dl-uselect"> '
      +'<span class="lyr-sw" style="background:linear-gradient(90deg,#1f5fd0 50%,#d02f2f 50%)"></span> '
      +'<span id="dl-uselect-lbl"></span></label>';
    dd.appendChild(w);
    relabel();
    w.querySelector('input').addEventListener('change',(ev)=>{
      ev.target.closest('.lyr-row').classList.toggle('on',ev.target.checked);
      toggle(ev.target.checked);
    });
    try{ window.reorganizeLayerPanel&&window.reorganizeLayerPanel(); }catch(_){}
  }
  function relabel(){ const e=document.getElementById('dl-uselect-lbl'); if(e) e.textContent=L('U.S. presidential elections','アメリカ大統領選挙','US-Präsidentschaftswahlen','Президентские выборы в США','Elecciones presidenciales de EE. UU.'); }
  if(document.readyState!=='loading') setTimeout(buildRow,0); else document.addEventListener('DOMContentLoaded',buildRow);
  window.addEventListener('intmap-lang',()=>setTimeout(()=>{ relabel(); if(on) renderPanel(); },20));
  /* self-heal across basemap swaps, exactly like the other vector overlays */
  try{ GE().events.on('styledata',()=>{ if(on) setTimeout(()=>{ if(ensure()){ setVis(true); apply(); } },80); }); }catch(_){}

  window.IntMapUSElections={ toggle, setYear:(y)=>{ year=+y; if(on) apply(); }, year:()=>year,
    years:()=>((data&&data.elections.map(e=>e.y))||[]), isOn:()=>on };
  return window.IntMapUSElections;
};
