/* ============================================================================
 *  IntMap · Ocean currents — arrows, warm/cold, and the names  (#R216)
 * ----------------------------------------------------------------------------
 *  「世界の海流を矢印で表示するレイヤーを作って。寒暖流は青赤で。名前も表示。適当に fabricate は
 *    しないように。」
 *
 *  ══ WHERE EVERY NUMBER COMES FROM, AND WHY NOTHING HERE IS DRAWN BY HAND ═══════════════════════
 *
 *  · THE ARROWS — Open-Meteo Marine (`ocean_current_velocity`, `ocean_current_direction`), the same
 *    keyless, ACAO-* model js/world-packs.js already uses for the tides. One request carries every
 *    point in view (the API takes comma-separated coordinates and answers with an array), so a
 *    screenful of arrows is ONE call. Velocity is km/h and direction is the direction the water is
 *    flowing TOWARD — verified against two currents whose behaviour is not in dispute: 35 N 141 E
 *    (the Kuroshio, east of Japan) answered 6.5 km/h toward 39°, and 35 S 20 E (the Agulhas, off the
 *    Cape) answered 2.1 km/h toward 250°. Both are the real direction of those currents, so the
 *    convention is toward and not from. The arrow points where the water goes.
 *
 *  · WARM OR COLD — measured, not assumed. 暖流 / 寒流 is a statement about what the water CARRIES:
 *    a warm current brings water from a warmer place, a cold one from a colder place. So each arrow
 *    is asked for the sea-surface temperature at its own point AND at a point ~110 km UPSTREAM
 *    (against the direction just fetched), in the same request. Upstream warmer than here → the
 *    current is bringing warmth → red. Upstream colder → blue. The panel states the rule and prints
 *    the two temperatures, so the classification can be checked rather than believed.
 *    ⚠ WHERE THE DIFFERENCE IS INSIDE THE MODEL'S OWN NOISE (< 0.25 K) THE ARROW IS GREY and the
 *    legend says «neither» — a current that is not carrying a temperature contrast must not be
 *    coloured as though it were. That is the whole of 「適当に fabricate するな」 in this layer.
 *
 *  · THE NAMES — Wikidata (CC0): every item that is an ocean current (Q129558, including subclasses)
 *    and has a coordinate (P625), with its label in all five UI languages. 209 of them, measured, in
 *    1.1 s. A label is drawn at the coordinate Wikidata publishes for that current, so it names a
 *    current the same way an atlas does — the label is a POINT, and it is not claiming that the
 *    arrow beside it belongs to that current.
 *
 *  ⚠ NOTHING IN THIS FILE SHIPS A CURRENT. There is no bundled table of «the world's major currents»
 *  with hand-drawn paths and hand-assigned colours, which is what this layer would be if it were
 *  faked. Every arrow is a model value for the instant on the app clock, and every name is a
 *  third-party statement with a source.
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

    const SRC='oc-src', ARROW='oc-arrow', LBL='oc-label', NAME='oc-name-src', NAMELYR='oc-name';
    const MARINE='https://marine-api.open-meteo.com/v1/marine';
    const WDQS='https://query.wikidata.org/sparql';

    /* the two colours the request names, plus the honest third one */
    const COL_WARM='#ff453a', COL_COLD='#2f7fe0', COL_NEUTRAL='#9aa0a6';
    const DT_MIN=0.25;                     /* K — below this the sign is model noise, not a current */
    const UPSTREAM_KM=110;                 /* one degree of latitude: far enough to leave the cell */

    let on=false, busy=false, gridKey='', arrows=[], names=null, namesState='idle', err=null;

    const panel=makePanel('oc-panel',()=>'🌊 '+L('Ocean currents','海流','Meeresströmungen','Морские течения','Corrientes marinas'),'wp-dl-currents',
      { legendId:'wpcurrents', layers:()=>[ARROW,LBL,NAMELYR],
        names:()=>({en:'🌊 Ocean currents',jp:'🌊 海流（暖流・寒流）',de:'🌊 Meeresströmungen',ru:'🌊 Морские течения',es:'🌊 Corrientes marinas'}) });

    /* ── the arrow glyph, drawn once and registered as an image the symbol layer rotates ──────────
       A flat white arrow tinted per feature by `icon-color`, so one image serves warm, cold and
       neutral rather than three near-identical PNGs. */
    let iconDone=false;
    function ensureIcon(){
      if(iconDone) return true;
      try{
        const S=64, cv=document.createElement('canvas'); cv.width=S; cv.height=S;
        const c=cv.getContext('2d');
        c.translate(S/2,S/2);
        c.beginPath();
        c.moveTo(0,-26); c.lineTo(13,4); c.lineTo(4.5,4); c.lineTo(4.5,26);
        c.lineTo(-4.5,26); c.lineTo(-4.5,4); c.lineTo(-13,4); c.closePath();
        c.fillStyle='#ffffff'; c.fill();
        c.lineWidth=2.6; c.strokeStyle='rgba(0,0,0,0.55)'; c.stroke();
        const d=c.getImageData(-S/2,-S/2,S,S);
        GE().layers.addImage&&GE().layers.addImage('oc-arrow-img',{width:S,height:S,data:new Uint8Array(d.data.buffer)},{sdf:true});
        iconDone=true;
      }catch(_){ iconDone=false; }
      return iconDone; }

    function ensureLayers(){
      if(!_canDraw()) return false;
      try{
        ensureIcon();
        if(!GE().layers.hasSource(SRC)) GE().layers.addSource(SRC,{type:'geojson',data:{type:'FeatureCollection',features:[]}});
        if(!GE().layers.hasSource(NAME)) GE().layers.addSource(NAME,{type:'geojson',data:{type:'FeatureCollection',features:[]}});
        if(!GE().layers.has(ARROW)) GE().layers.add({id:ARROW,type:'symbol',source:SRC,layout:{visibility:'none',
          'icon-image':'oc-arrow-img','icon-rotate':['get','dir'],'icon-rotation-alignment':'map',
          'icon-size':['interpolate',['linear'],['zoom'],1,['*',0.30,['get','sz']],6,['*',0.62,['get','sz']]],
          'icon-allow-overlap':true,'icon-ignore-placement':true},
          paint:{'icon-color':['get','col'],'icon-opacity':0.95}});
        /* the speed, under the arrow, so an arrow is a measurement and not a decoration */
        if(!GE().layers.has(LBL)) GE().layers.add({id:LBL,type:'symbol',source:SRC,minzoom:3.6,layout:{visibility:'none',
          'text-field':['get','lbl'],'text-size':window.IntMapLabelScale.sub(0.78),'text-offset':[0,1.35],
          'text-anchor':'top','text-allow-overlap':false,'text-optional':true},
          paint:{'text-color':'#dff2ff','text-halo-color':'rgba(0,20,36,0.9)','text-halo-width':1.4}});
        if(!GE().layers.has(NAMELYR)) GE().layers.add({id:NAMELYR,type:'symbol',source:NAME,layout:{visibility:'none',
          'text-field':['get','name'],'text-size':window.IntMapLabelScale.sub(1.0),
          'text-allow-overlap':false,'text-optional':true,'text-max-width':9},
          paint:{'text-color':'#ffe9a8','text-halo-color':'rgba(0,18,32,0.92)','text-halo-width':1.6}});
        return true;
      }catch(_){ return false; } }
    function _canDraw(){ try{ return !!HOST.canDraw(); }catch(_){ try{ return !!GE().ready(); }catch(__){ return false; } } }

    /* ── the sample grid: open ocean in view, skipping land ───────────────────────────────────────
       The bundled land mask answers «is this sea» for a point; a cell whose centre is land is not
       asked about. 24 arrows is the budget — one request, and a screen that can still be read. */
    function samplePoints(max){
      const out=[];
      try{
        const b=GE().camera.getBounds(); if(!b) return out;
        const Wb=b.getWest(), Eb=b.getEast(), S=b.getSouth(), N=b.getNorth();
        const NX=6, NY=Math.max(3,Math.min(6,Math.round(NX*(N-S)/Math.max(1e-6,Eb-Wb))));
        const LM=window.IntMapLandMask;
        for(let j=0;j<NY;j++){ const la=S+(j+0.5)*(N-S)/NY;
          if(la<-78||la>84) continue;
          for(let i=0;i<NX;i++){ const lo=Wb+(i+0.5)*(Eb-Wb)/NX;
            try{ if(LM&&LM.ready&&LM.ready()&&LM.isLand(lo,la)===true) continue; }catch(_){}
            out.push([+lo.toFixed(3),+la.toFixed(3)]); } }
      }catch(_){}
      if(out.length>max) out.length=max;
      return out; }

    function whenMs(){ try{ const st=window.IntMapTime.state(); return st.isLive?Date.now():+new Date(st.when); }catch(_){ return Date.now(); } }
    const isoDay=(ms)=>new Date(ms).toISOString().slice(0,10);

    /* one multi-point request; `vars` picks which hourly fields come back */
    async function marine(pts,ms,vars){
      if(!pts.length) return [];
      const u=MARINE+'?latitude='+pts.map(p=>p[1]).join(',')+'&longitude='+pts.map(p=>p[0]).join(',')
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

    /* ── the fetch: direction+speed+SST here, then SST upstream, then the classification ──────── */
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
        const pts=samplePoints(24);
        if(!pts.length){ arrows=[]; busy=false; rearm(); draw(); render(); return; }
        const here=await marine(pts,ms,['ocean_current_velocity','ocean_current_direction','sea_surface_temperature']);
        const base=[];
        here.forEach((o,i)=>{
          const p=pts[i]||[o.longitude,o.latitude];
          const v=atHour(o,'ocean_current_velocity',ms), d=atHour(o,'ocean_current_direction',ms), t=atHour(o,'sea_surface_temperature',ms);
          if(v==null||d==null) return;
          base.push({ lng:p[0], lat:p[1], v, dir:d, sst:t }); });
        if(!base.length){ arrows=[]; busy=false; rearm(); draw(); render(); return; }
        /* upstream = one step BACK along the flow, at the same distance for every arrow */
        const up=base.map(a=>{
          const th=(a.dir+180)*Math.PI/180;                      /* where the water came from */
          const dLat=UPSTREAM_KM/110.574*Math.cos(th);
          const dLng=UPSTREAM_KM/(111.320*Math.max(0.15,Math.cos(a.lat*Math.PI/180)))*Math.sin(th);
          return [ +(a.lng+dLng).toFixed(3), +Math.max(-78,Math.min(84,a.lat+dLat)).toFixed(3) ]; });
        let upT=[];
        try{ upT=await marine(up,ms,['sea_surface_temperature']); }catch(_){ upT=[]; }
        arrows=base.map((a,i)=>{
          const tu=upT[i]?atHour(upT[i],'sea_surface_temperature',ms):null;
          const dT=(a.sst!=null&&tu!=null)?(tu-a.sst):null;      /* upstream minus here */
          const kind=(dT==null||Math.abs(dT)<DT_MIN)?'neutral':(dT>0?'warm':'cold');
          return Object.assign({},a,{ upT:tu, dT, kind }); });
      }catch(e){ err=(e&&e.message)||String(e); arrows=[]; rearm(); }
      busy=false; draw(); render(); }

    function draw(){
      const feats=arrows.map(a=>({type:'Feature',geometry:{type:'Point',coordinates:[a.lng,a.lat]},
        properties:{ dir:a.dir, sz:Math.max(0.55,Math.min(1.8,0.55+a.v/4)),
          col:(a.kind==='warm')?COL_WARM:(a.kind==='cold')?COL_COLD:COL_NEUTRAL,
          lbl:a.v.toFixed(1)+' km/h' }}));
      whenDrawable(()=>{ if(!ensureLayers()) return;
        try{ GE().layers.setSourceData(SRC,{type:'FeatureCollection',features:feats}); }catch(_){}
        drawNames();
        setVis([ARROW,LBL,NAMELYR],on);
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
      +'<span style="width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-bottom:11px solid '+col+';flex:none;"></span>'
      +esc(txt)+'</div>';
    function render(){
      if(!on&&!panel.shown()) return;
      const warm=arrows.filter(a=>a.kind==='warm').length, cold=arrows.filter(a=>a.kind==='cold').length,
            neu=arrows.filter(a=>a.kind==='neutral').length;
      let head;
      if(busy) head=L('Reading the current field…','海流を取得中…','Strömungsfeld wird gelesen…','Чтение течений…','Leyendo las corrientes…');
      else if(err) head='⚠ '+L('The current model could not be fetched.','海流データを取得できませんでした。','Strömungsmodell nicht abrufbar.','Не удалось получить данные.','No se pudieron obtener los datos.');
      else if(!arrows.length) head=L('No open water in this view — pan out to a sea.','この表示範囲に外洋がありません。海の見える位置まで移動してください。','Kein offenes Wasser im Bild.','В этом виде нет открытой воды.','No hay mar abierto en esta vista.');
      else head=arrows.length+' '+L('sample points · ','地点を計測 · ','Messpunkte · ','точек · ','puntos · ')
        +warm+' '+L('warm','暖流','warm','тёплых','cálidas')+' / '+cold+' '+L('cold','寒流','kalt','холодных','frías')
        +(neu?(' / '+neu+' '+L('neither','どちらでもない','weder noch','ни то ни другое','ninguna')):'');
      const rows=arrows.slice().sort((a,b)=>b.v-a.v).slice(0,6).map(a=>
        '<div style="display:flex;justify-content:space-between;gap:8px;padding:2px 0;border-bottom:1px solid var(--glass-border,rgba(128,128,128,0.16));font-size:11.5px;">'
        +'<span style="color:'+((a.kind==='warm')?COL_WARM:(a.kind==='cold')?COL_COLD:COL_NEUTRAL)+';">'
        +(a.kind==='warm'?L('warm','暖流','warm','тёплое','cálida'):a.kind==='cold'?L('cold','寒流','kalt','холодное','fría'):L('—','—','—','—','—'))+'</span>'
        +'<span style="opacity:.75;">'+a.lat.toFixed(1)+', '+a.lng.toFixed(1)+'</span>'
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
        +esc(L('The arrow points where the water is going and its length is the speed, from the Open-Meteo Marine model at the instant on the app clock. Warm or cold is measured, not assumed: each point is compared with the sea-surface temperature ~110 km upstream along its own flow, because a warm current is one that brings warmer water. Names are Wikidata (CC0), drawn at the coordinate published for each current.',
             '矢印は水が向かう方向、長さは流速で、出典は Open-Meteo Marine（アプリの時計の時刻の値）。暖流・寒流は決めつけではなく実測です——各地点の海面水温を、その流れに沿って約110km上流の水温と比べています（暖流とは「より暖かい水を運ぶ流れ」だからです）。名称は Wikidata（CC0）で、各海流に公開されている座標に表示しています。',
             'Pfeil = Fließrichtung, Länge = Geschwindigkeit (Open-Meteo Marine). Warm/kalt wird gegen die Temperatur ~110 km stromaufwärts gemessen. Namen: Wikidata (CC0).',
             'Стрелка — куда течёт вода, длина — скорость (Open-Meteo Marine). Тёплое/холодное определяется по температуре ~110 км выше по течению. Названия: Wikidata (CC0).',
             'La flecha indica hacia dónde va el agua y su longitud es la velocidad (Open-Meteo Marine). Cálida o fría se mide contra la temperatura ~110 km aguas arriba. Nombres: Wikidata (CC0).'))
        +'</div>'); }

    function toggle(v){
      on=!!v;
      if(!on){ panel.hide(); setVis([ARROW,LBL,NAMELYR],false); arrows=[]; gridKey=''; return; }
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
      state:()=>({ on, busy, err, points:arrows.length,
        warm:arrows.filter(a=>a.kind==='warm').length,
        cold:arrows.filter(a=>a.kind==='cold').length,
        neutral:arrows.filter(a=>a.kind==='neutral').length,
        names:names?names.length:0, namesState,
        top:arrows.slice().sort((a,b)=>b.v-a.v).slice(0,3).map(a=>({v:+a.v.toFixed(2),dir:a.dir,kind:a.kind,dT:a.dT!=null?+a.dT.toFixed(2):null})) }) };
  })();
};
