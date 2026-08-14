/* ============================================================================
 *  IntMap · Playground (beta) — IntMapModules.playground  (#R166)
 * ----------------------------------------------------------------------------
 *  The experimental hub: World Explorer (satellite "where am I?"), the Pandemic Simulator and
 *  Nation Sim, all built with createElement + inline styles.
 *
 *  Moved verbatim out of index.html's DOMContentLoaded closure (#R166): each body below is
 *  byte-identical to the block that used to live there, except that closure values which are
 *  REASSIGNED at runtime are read through the live host interface (Architecture.md §3.1):
 *      bordersOn -> HOST.bordersOn
 *      currentLang -> HOST.lang
 *      currentMapType -> HOST.mapType
 *      currentMode -> HOST.mode
 *      currentProj -> HOST.proj
 *      geoDB -> HOST.geoDB
 *      namesOn -> HOST.namesOn
 *      renderUI -> HOST.renderUI
 *      satPanelDismissed -> HOST.satPanelDismissed
 *
 *  Every factory is called at the exact spot its block used to occupy, so execution order is
 *  unchanged. The CSS stays in css/intmap.css; this file adds no <style>.
 * ==========================================================================*/
window.IntMapModules=window.IntMapModules||{};

window.IntMapModules.playground=function(HOST){
  const GE=()=>window.IntMapGeoEngine;   /* (#R178) the renderer, through the contract — never the raw handle */
  /* stable closure values (never reassigned) — rebound under their original names so the moved body stays verbatim */
  const loadCountryData=HOST.loadCountryData, imToast=HOST.imToast, countryStats=HOST.countryStats;
  (function(){
    const jp=()=>HOST.lang==='jp';
    /* (#R243) …and the tuples this file holds AS DATA go through the same resolver — see pickArgs()
       in js/lang-registry.js. A {en,jp} object is the seventh shape #R241 named and is invisible to
       every instrument; written as a call it is measured like any other call site. */
    const L=window.IntMapLang.pick(()=>HOST.lang), LA=window.IntMapLang.pickArgs();
    const haversine=(a,b)=>{ const R=6371,dLat=(b[1]-a[1])*Math.PI/180,dLng=(b[0]-a[0])*Math.PI/180,la1=a[1]*Math.PI/180,la2=b[1]*Math.PI/180; const h=Math.sin(dLat/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin(dLng/2)**2; return 2*R*Math.asin(Math.min(1,Math.sqrt(h))); };
    function ensureCountries(cb){ try{ if(window.countryGeo&&window.countryGeo.features){ cb(); return; } if(typeof loadCountryData==='function'){ loadCountryData().then(()=>cb()); } else cb(); }catch(_){ cb(); } }
    // ---- shared modal shell ----
    function shell(maxw){ const ov=document.createElement('div'); ov.className='pg-overlay';
      ov.style.cssText='position:fixed;inset:0;z-index:6000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);padding:18px;';
      const card=document.createElement('div'); card.style.cssText='position:relative;width:min('+(maxw||520)+'px,100%);max-height:90dvh;overflow-y:auto;-webkit-overflow-scrolling:touch;background:var(--card-bg);color:var(--text-main);border-radius:18px;box-shadow:var(--shadow);padding:22px 22px max(22px,env(safe-area-inset-bottom));box-sizing:border-box;';
      ov.appendChild(card); ov.addEventListener('click',e=>{ if(e.target===ov) ov.remove(); }); document.body.appendChild(ov); return {ov,card}; }
    function xbtn(onclick){ const b=document.createElement('button'); b.textContent='✕'; b.style.cssText='position:absolute;top:12px;right:12px;width:32px;height:32px;border:none;border-radius:9px;background:var(--input-bg);color:var(--text-main);font-size:16px;cursor:pointer;z-index:2;'; b.onclick=onclick; return b; }
    function pill(txt,bg){ const s=document.createElement('span'); s.textContent=txt; s.style.cssText='display:inline-block;font-size:9.5px;font-weight:800;letter-spacing:0.05em;text-transform:uppercase;padding:2px 7px;border-radius:999px;background:'+(bg||'var(--primary-color)')+';color:#fff;'; return s; }

    /* ===================== HUB ===================== */
    window._openPlayground=function(){
      try{ document.getElementById('settings-modal')&&(document.getElementById('settings-modal').style.display='none'); }catch(_){}
      const {ov,card}=shell(560); card.appendChild(xbtn(()=>ov.remove()));
      const h=document.createElement('div'); h.style.cssText='display:flex;align-items:center;gap:10px;margin:0 0 4px;';
      const t=document.createElement('h3'); t.textContent=window.IntMapLang.t(HOST.lang,"Playground","プレイグラウンド","Spielwiese","Песочница","Zona de pruebas"); t.style.cssText='margin:0;font-size:21px;'; h.appendChild(t); h.appendChild(pill('beta','#ff9500')); card.appendChild(h);
      const sub=document.createElement('p'); sub.textContent=window.IntMapLang.t(HOST.lang,"Experimental interactive modes built on real data.","実データを使った実験的なインタラクティブモード。","Experimentelle interaktive Modi auf Basis echter Daten.","Экспериментальные интерактивные режимы на реальных данных.","Modos interactivos experimentales basados en datos reales."); sub.style.cssText='margin:0 0 16px;color:var(--text-muted);font-size:13px;'; card.appendChild(sub);
      /* (#R30) Clean SF-Symbol-style SVG tile icons (no emojis). Quiz mode moved IN here; Nation Sim
         renamed "Statecraft". */
      const SV={
        globe:'<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.6 2.6 3.9 5.8 3.9 9s-1.3 6.4-3.9 9c-2.6-2.6-3.9-5.8-3.9-9S9.4 5.6 12 3Z"/></svg>',
        virus:'<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/></svg>',
        capitol:'<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M5 21V10M9.5 21V10M14.5 21V10M19 21V10M3 10l9-6 9 6"/></svg>',
        cap:'<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M22 9 12 5 2 9l10 4 10-4Z"/><path d="M6 11v5c0 1.2 2.7 2.6 6 2.6s6-1.4 6-2.6v-5"/><path d="M22 9v5"/></svg>',
        sandbox:'<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="M11 3a13 13 0 0 1 0 16M11 3a13 13 0 0 0 0 16M3 11h16"/><path d="m18.5 18.5 3 3"/></svg>',
        plane:'<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5L21 16Z"/></svg>'
      };
      /* (#R32) Statecraft & World Sandbox ABOLISHED per request — removed from the hub. */
      const modes=[
        {svg:SV.globe,bg:'linear-gradient(135deg,#0a84ff,#34c759)',t:(window.IntMapLang.t(HOST.lang,'Satellite Drop','サテライトドロップ','Satelliten-Absprung','Спутниковый десант','Salto por satélite')),d:(window.IntMapLang.t(HOST.lang,'A satellite where-am-I geography game — dropped somewhere on Earth, guess your location.','衛星写真からスタート地点を推理する地理ゲーム。ランダムな地点へ飛び、現在地を当てる。','Ein Satelliten-Geografiespiel: irgendwo auf der Erde abgesetzt — errate deinen Standort.','Географическая игра «где я»: вас забрасывает в случайную точку Земли по спутниковому снимку — угадайте, где вы.','Un juego de geografía «dónde estoy»: te suelta en algún punto de la Tierra a partir de una imagen satelital — adivina tu ubicación.')),go:()=>{ ov.remove(); window._pgWorldExplorer&&window._pgWorldExplorer(); }},
        {svg:SV.plane,bg:'linear-gradient(135deg,#5e5ce6,#0a84ff)',t:window.IntMapLang.t(HOST.lang,"Flight Simulator","フライトシミュレーター","Flugsimulator","Авиасимулятор","Simulador de vuelo"),d:window.IntMapLang.t(HOST.lang,"A full 6-DOF flight model — pick an aircraft and airport, then take off and land over the real 3-D terrain.","6自由度の本格フライトモデル。機体と空港を選び、実際の地形の上を滑走路から離陸・着陸。","Ein vollständiges 6-DOF-Flugmodell — Flugzeug und Flughafen wählen, dann über echtem 3-D-Gelände starten und landen.","Полная модель полёта с 6 степенями свободы — выберите самолёт и аэропорт, взлетайте и садитесь над настоящим 3-D-рельефом.","Un modelo de vuelo completo de 6 grados de libertad: elija avión y aeropuerto y despegue y aterrice sobre el relieve 3-D real."),go:()=>{ ov.remove(); window.IntMapLazy.need('flightSim').then(()=>{ try{ window.IntMapFlightSim&&window.IntMapFlightSim.setup&&window.IntMapFlightSim.setup(); }catch(_){} }); }},
        {svg:SV.virus,bg:'linear-gradient(135deg,#ff3b30,#ff9500)',t:window.IntMapLang.t(HOST.lang,"Pandemic Simulator","パンデミック・シミュレーター","Pandemie-Simulator","Симулятор пандемии","Simulador de pandemia"),d:window.IntMapLang.t(HOST.lang,"Seed an outbreak and watch a scientific model spread it across real countries until a vaccine arrives.","感染源を置き、交通網で世界へ広がる感染症を科学的に可視化。ワクチン開発まで。","Setzen Sie einen Ausbruch und sehen Sie zu, wie ein wissenschaftliches Modell ihn über echte Länder verbreitet, bis ein Impfstoff kommt.","Задайте очаг вспышки и смотрите, как научная модель разносит её по реальным странам, пока не появится вакцина.","Siembre un brote y observe cómo un modelo científico lo extiende por países reales hasta que llega una vacuna."),go:()=>{ ov.remove(); window._pgPandemic&&window._pgPandemic(); }},
        {svg:SV.cap,bg:'linear-gradient(135deg,#34c759,#0a84ff)',t:window.IntMapLang.t(HOST.lang,"Quiz mode","クイズモード","Quizmodus","Режим викторины","Modo cuestionario"),d:window.IntMapLang.t(HOST.lang,"Test your world geography: flags, capitals, map-clicks, silhouettes & duels.","国旗・首都・地図・シルエットなど、世界地理クイズで腕試し。","Testen Sie Ihre Weltgeografie: Flaggen, Hauptstädte, Kartenklicks, Umrisse und Duelle.","Проверьте знание географии мира: флаги, столицы, клики по карте, силуэты и дуэли.","Ponga a prueba su geografía mundial: banderas, capitales, clics en el mapa, siluetas y duelos."),go:()=>{ ov.remove();
          /* (#R33) Close the layer-selection panel/sheet when entering Quiz mode. */
          try{ const dd=document.getElementById('layer-dropdown'); if(dd) dd.classList.remove('show'); document.querySelectorAll('.m-sheet.show,#mo-sheet.show,#tools-sheet.show,.m-scrim.show').forEach(s=>s.classList.remove('show')); }catch(_){}
          try{ window.IntMapEdu&&window.IntMapEdu.open(); }catch(_){} }}
      ];
      modes.forEach(m=>{ const row=document.createElement('button'); row.style.cssText='display:flex;align-items:center;gap:14px;width:100%;text-align:left;background:var(--input-bg);border:1px solid rgba(128,128,128,0.16);border-radius:14px;padding:14px;margin-bottom:11px;cursor:pointer;color:var(--text-main);';
        const ic=document.createElement('div'); ic.innerHTML=m.svg; ic.style.cssText='width:48px;height:48px;border-radius:13px;background:'+m.bg+';display:flex;align-items:center;justify-content:center;flex-shrink:0;';
        const tx=document.createElement('div'); const tt=document.createElement('div'); tt.textContent=m.t; tt.style.cssText='font-size:15px;font-weight:700;'; const dd=document.createElement('div'); dd.textContent=m.d; dd.style.cssText='font-size:12px;color:var(--text-muted);margin-top:3px;line-height:1.35;'; tx.appendChild(tt); tx.appendChild(dd);
        row.appendChild(ic); row.appendChild(tx); row.onclick=m.go; card.appendChild(row); });
    };

    /* ===================== floating toast / breaking-news ===================== */
    function pgNews(html, kind){ let host=document.getElementById('pg-news-host'); if(!host){ host=document.createElement('div'); host.id='pg-news-host'; host.style.cssText='position:fixed;top:max(12px,env(safe-area-inset-top));left:50%;transform:translateX(-50%);z-index:6200;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none;width:min(440px,92vw);'; document.body.appendChild(host); }
      const n=document.createElement('div'); n.style.cssText='pointer-events:auto;background:var(--popup-bg);color:var(--text-main);border:1px solid var(--glass-border,rgba(128,128,128,0.25));border-left:4px solid '+(kind==='alert'?'#ff3b30':kind==='good'?'#34c759':'#0a84ff')+';border-radius:12px;box-shadow:var(--shadow);backdrop-filter:blur(14px);padding:10px 14px;font-size:12.5px;line-height:1.4;opacity:0;transform:translateY(-8px);transition:opacity .3s,transform .3s;max-width:100%;';
      n.innerHTML='<b style="font-size:10px;letter-spacing:0.06em;text-transform:uppercase;color:'+(kind==='alert'?'#ff3b30':kind==='good'?'#34c759':'#0a84ff')+';">'+(window.IntMapLang.t(HOST.lang,"Breaking","速報","Eilmeldung","Срочно","Última hora"))+'</b><br>'+html;
      host.appendChild(n); requestAnimationFrame(()=>{ n.style.opacity='1'; n.style.transform='none'; }); setTimeout(()=>{ n.style.opacity='0'; n.style.transform='translateY(-8px)'; setTimeout(()=>n.remove(),350); }, 5200);
    }
    window._pgNews=pgNews;

    // shared point-in-polygon (local copy)
    function pir(x,y,r){let i,j,c=false;for(i=0,j=r.length-1;i<r.length;j=i++){const xi=r[i][0],yi=r[i][1],xj=r[j][0],yj=r[j][1];if(((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/((yj-yi)||1e-12)+xi))c=!c;}return c;}
    function pig(x,y,g){if(!g)return false;const ps=g.type==='Polygon'?[g.coordinates]:(g.type==='MultiPolygon'?g.coordinates:[]);for(const poly of ps){if(poly&&poly.length&&pir(x,y,poly[0])){let h=false;for(let k=1;k<poly.length;k++){if(pir(x,y,poly[k])){h=true;break;}}if(!h)return true;}}return false;}
    function bboxOf(f){let mnx=180,mny=90,mxx=-180,mxy=-90;const eat=r=>r.forEach(p=>{if(p[0]<mnx)mnx=p[0];if(p[0]>mxx)mxx=p[0];if(p[1]<mny)mny=p[1];if(p[1]>mxy)mxy=p[1];});const g=f.geometry;if(!g)return[0,0,0,0];if(g.type==='Polygon')g.coordinates.forEach(eat);else if(g.type==='MultiPolygon')g.coordinates.forEach(poly=>poly.forEach(eat));return[mnx,mny,mxx,mxy];}
    function cName(f){ const p=f&&f.properties||{}; return p.NAME_EN||p.ADMIN||p.NAME||p.name||''; }

    /* ===================== WORLD EXPLORER ===================== */
    function _pgWeStyle(){ if(document.getElementById('pg-we-style')) return; const s=document.createElement('style'); s.id='pg-we-style';
      s.textContent='.pg-we-pin{width:22px;height:22px;cursor:pointer;}'+
        '.pg-we-pin span{display:block;width:14px;height:14px;margin:4px;border-radius:50%;background:#ff3b30;border:2.5px solid #fff;box-shadow:0 0 0 2px rgba(255,59,48,0.45),0 2px 7px rgba(0,0,0,0.55);animation:pgWePulse 1.8s ease-in-out infinite;}'+
        '@keyframes pgWePulse{0%,100%{box-shadow:0 0 0 2px rgba(255,59,48,0.45),0 2px 7px rgba(0,0,0,0.55);}50%{box-shadow:0 0 0 8px rgba(255,59,48,0.0),0 2px 7px rgba(0,0,0,0.55);}}'+
        /* (#R33) World Explorer also hides the lat/lng/elevation readout + center crosshair ("常時表示欄は非表示に"). */
        'body.pg-we .m-fab-stack,body.pg-we .m-sheet,body.pg-we .m-scrim,body.pg-we .news-timeline,body.pg-we .sat-controller,body.pg-we .coord-readout,body.pg-we #m-crosshair,body.pg-we #m-addpoint,'+
        'body.pg-sim .m-fab-stack,body.pg-sim .m-sheet,body.pg-sim .m-scrim,body.pg-sim .news-timeline,body.pg-sim .sat-controller{display:none !important;}'+
        /* (#R33) The playground HUDs must sit ABOVE everything and not reserve any bottom-sheet space, so they
           are never hidden under / crushed by the mobile sheet. Panels go full-width on phones. */
        'body.pg-we,body.pg-sim{--sheet-cover:0px !important;--peek-h:0px !important;}'+
        '#pg-we-panel,#pg-pan-hud{z-index:6300 !important;}'+
        '@media(max-width:768px){'+
        /* (#R34) Hide the MAIN bottom sheet (#sidebar) on phones during these focused modes. The rule above
           only hides the secondary .m-sheet option sheets — on mobile the #sidebar IS the bottom sheet and
           .collapsed (a desktop mechanism) doesn\'t move it, so it kept covering the HUD ("ボトムシートの下に
           隠れてしまう"). Slide it fully off-screen; the inline --sheet-ty transform restores it on exit. */
        'body.pg-we #sidebar,body.pg-sim #sidebar{transform:translateY(125%) !important;}'+
        '#pg-we-panel{left:8px !important;right:8px !important;width:auto !important;max-width:none !important;transform:none !important;flex-wrap:wrap;justify-content:center;gap:8px;padding:10px 12px;}'+
        /* (#R34) flex must NOT squash the round home/exit buttons into ovals ("ボタンの縦横比がおかしい"); the
           label takes its own full row so the action buttons sit on a clean centred row. */
        '#pg-we-panel button{flex:0 0 auto;min-height:40px;}'+
        /* (#R35) The round home/exit buttons are width:34px inline; min-height:40px alone stretched them into
           34×40 OVALS ("ボタンの縦横比がおかしい"). Force the circular ones (border-radius:50%) square. */
        '#pg-we-panel button[style*="50%"]{width:42px !important;height:42px !important;min-height:0 !important;}'+
        '#pg-we-panel>span{flex:1 1 100%;text-align:center;margin-bottom:2px;}'+
        '#pg-pan-hud{left:8px !important;right:8px !important;width:auto !important;max-width:none !important;transform:none !important;}'+
        /* (#R35) Same oval fix for the pandemic HUD's circular ✕ (width:28px inline). */
        '#pg-pan-hud button{flex-shrink:0;}'+
        '#pg-pan-hud button[style*="50%"]{width:34px !important;height:34px !important;min-height:0 !important;}'+
        '}';
      document.head.appendChild(s); }
    window._pgWorldExplorer=function(){
      if(!GE().hasRenderer()){ try{ imToast('Map not ready'); }catch(_){} return; }
      _pgWeStyle();
      ensureCountries(()=>{
        const feats=(window.countryGeo&&window.countryGeo.features)||[]; if(!feats.length){ try{ imToast(window.IntMapLang.t(HOST.lang,"Country data unavailable","国境データを読み込めません","Länderdaten nicht verfügbar","Данные по странам недоступны","Datos de países no disponibles")); }catch(_){} return; }
        /* (#R30) TRULY RANDOM land point — area-weighted uniform over the sphere (lat=asin(U), lng uniform),
           accepted only when it falls on land. The old per-feature pick clustered on a handful of countries
           ("毎回似たような場所に行く"). A bbox pre-reject keeps the point-in-polygon scan cheap. */
        const bbs=feats.map(bboxOf);
        let target=null;
        for(let tr=0;tr<2500 && !target;tr++){
          const lat=Math.asin(Math.random()*2-1)*180/Math.PI, lng=Math.random()*360-180;
          for(let i=0;i<feats.length;i++){ const bb=bbs[i]; if(lng<bb[0]||lng>bb[2]||lat<bb[1]||lat>bb[3]) continue; if(pig(lng,lat,feats[i].geometry)){ target={lng,lat,country:cName(feats[i])}; break; } }
        }
        if(!target){ try{ imToast(window.IntMapLang.t(HOST.lang,"Could not pick a spot","地点を選べませんでした","Es konnte kein Ort gewählt werden","Не удалось выбрать точку","No se pudo elegir un punto")); }catch(_){} return; }
        const START_Z=15.4; let minZoom=START_Z;
        const sbEl=document.getElementById('sidebar');
        const saved={ c:GE().camera.getCenter(), z:GE().camera.getZoom(), proj:(typeof HOST.proj!=='undefined'?HOST.proj:'globe'), mt:(typeof HOST.mapType!=='undefined'?HOST.mapType:'map'), names:(typeof HOST.namesOn!=='undefined'?HOST.namesOn:true), borders:(typeof HOST.bordersOn!=='undefined'?HOST.bordersOn:false), mode:(typeof HOST.mode!=='undefined'?HOST.mode:null), sbCol:(sbEl?sbEl.classList.contains('collapsed'):true) };
        /* (#R30) On start: turn OFF every data layer + labels + borders, DESELECT all tabs, and COLLAPSE the
           sidebar ("起動時には自動的にサイドバーが収納され、その他のタブやレイヤーが選択解除された状態に"). */
        try{ document.querySelectorAll('#layer-dropdown input[type=checkbox]:checked').forEach(cb=>{ if(cb.id==='cb-grid') return; if(cb.id==='cb-names'||cb.id==='cb-borders'||cb.id!=='cb-countries'){ cb.checked=false; cb.dispatchEvent(new Event('change',{bubbles:true})); } }); }catch(_){}
        try{ if(typeof HOST.mode!=='undefined' && HOST.mode){ HOST.mode=null; document.querySelectorAll('.control-panel .mode-btn').forEach(b=>b.classList.remove('active')); try{ HOST.renderUI(); }catch(_){} } }catch(_){}
        try{ if(sbEl && !sbEl.classList.contains('collapsed')){ sbEl.classList.add('collapsed'); window.dispatchEvent(new Event('intmap-sidebar-resize')); } }catch(_){}
        try{ document.body.classList.add('pg-we'); }catch(_){}
        try{ const sat=document.getElementById('btn-view-sat'); if(sat&&typeof HOST.mapType!=='undefined'&&HOST.mapType!=='sat') sat.click(); }catch(_){}
        /* (#R31) Don't pop the satellite controller panel each round ("毎回satelliteのポップアップが出るのを辞めて"). */
        try{ if(typeof HOST.satPanelDismissed!=='undefined') HOST.satPanelDismissed=true; const sp=document.getElementById('sat-controller'); if(sp) sp.style.display='none'; }catch(_){}
        const black=document.createElement('div'); black.style.cssText='position:fixed;inset:0;z-index:5800;background:#000;transition:opacity .6s;'; document.body.appendChild(black);
        const bt=document.createElement('div'); bt.textContent=window.IntMapLang.t(HOST.lang,"Dropping you somewhere…","どこかへ移動中…","Sie werden irgendwohin gesetzt…","Переносим вас куда-нибудь…","Le dejamos en algún lugar…"); bt.style.cssText='position:fixed;inset:0;z-index:5801;display:flex;align-items:center;justify-content:center;color:#fff;font:600 15px system-ui;'; document.body.appendChild(bt);
        let pin=null; const onZoom=()=>{ try{ minZoom=Math.min(minZoom, GE().camera.getZoom()); }catch(_){} };
        setTimeout(()=>{ try{ GE().camera.jumpTo({center:[target.lng,target.lat],zoom:START_Z,bearing:0,pitch:0}); }catch(_){}
          /* (#R34) RE-ASSERT satellite after the drop — World Explorer is a satellite where-am-I game, but a
             single early btn-view-sat click could lose the race with the style swap and leave it on Map
             ("World ExplorerではSatelliteではなくMapになっている"). Force it again here + keep the panel hidden. */
          try{ if(typeof HOST.mapType!=='undefined'&&HOST.mapType!=='sat'){ const sb=document.getElementById('btn-view-sat'); if(sb) sb.click(); } if(typeof HOST.satPanelDismissed!=='undefined') HOST.satPanelDismissed=true; const sp=document.getElementById('sat-controller'); if(sp) sp.style.display='none'; }catch(_){}
          /* (#R30) drop a pulsing "home" pin at the start point so you never lose it while panning. */
          try{ const el=document.createElement('div'); el.className='pg-we-pin'; el.innerHTML='<span></span>'; pin=GE().ui.attach(GE().ui.marker({element:el}).setLngLat([target.lng,target.lat])); }catch(_){}
          try{ GE().events.on('zoom',onZoom); }catch(_){}
          setTimeout(()=>{ black.style.opacity='0'; bt.remove(); setTimeout(()=>black.remove(),650); }, 900); }, 250);
        const panel=document.createElement('div'); panel.id='pg-we-panel';
        panel.style.cssText='position:fixed;left:50%;transform:translateX(-50%);bottom:max(20px,env(safe-area-inset-bottom));z-index:5810;display:flex;gap:8px;align-items:center;background:var(--popup-bg);color:var(--text-main);border:1px solid var(--glass-border,rgba(128,128,128,0.25));border-radius:999px;box-shadow:var(--shadow);backdrop-filter:blur(14px);padding:8px 10px 8px 16px;font-size:13px;font-weight:600;max-width:calc(100vw - 24px);';
        const lab=document.createElement('span'); lab.textContent=window.IntMapLang.t(HOST.lang,"Where are you?","ここはどこ？","Wo sind Sie?","Где вы?","¿Dónde está?"); panel.appendChild(lab);
        const homeB=document.createElement('button'); homeB.title=window.IntMapLang.t(HOST.lang,"Back to start","開始地点へ戻る","Zurück zum Start","Вернуться к началу","Volver al inicio"); homeB.innerHTML='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-6-5.7-6-10a6 6 0 0 1 12 0c0 4.3-6 10-6 10Z"/><circle cx="12" cy="11" r="2.2"/></svg>'; homeB.style.cssText='border:none;border-radius:50%;width:34px;height:34px;background:var(--input-bg);color:var(--text-main);cursor:pointer;display:flex;align-items:center;justify-content:center;'; homeB.onclick=()=>{ try{ GE().camera.flyTo({center:[target.lng,target.lat],zoom:START_Z,duration:700}); }catch(_){} }; panel.appendChild(homeB);
        const guessB=document.createElement('button'); guessB.textContent=window.IntMapLang.t(HOST.lang,"Make a guess","回答する","Tippen abgeben","Сделать предположение","Adivinar"); guessB.style.cssText='border:none;border-radius:999px;background:var(--primary-color);color:#fff;font-size:12.5px;font-weight:700;padding:8px 14px;cursor:pointer;'; panel.appendChild(guessB);
        const exitB=document.createElement('button'); exitB.textContent='✕'; exitB.title=window.IntMapLang.t(HOST.lang,"Exit","終了","Beenden","Выход","Salir"); exitB.style.cssText='border:none;border-radius:50%;width:30px;height:30px;background:var(--input-bg);color:var(--text-main);font-size:14px;cursor:pointer;'; panel.appendChild(exitB);
        (document.getElementById('map-container')||document.body).appendChild(panel);
        function restore(){ try{ panel.remove(); }catch(_){} try{ black.remove(); }catch(_){} try{ GE().events.off('zoom',onZoom); }catch(_){} try{ pin&&pin.remove(); }catch(_){}
          try{ document.body.classList.remove('pg-we'); }catch(_){}
          try{ const cb=document.getElementById('cb-names'); if(cb&&!!saved.names!==cb.checked){ cb.checked=!!saved.names; cb.dispatchEvent(new Event('change',{bubbles:true})); } }catch(_){}
          try{ const mt=document.getElementById(saved.mt==='sat'?'btn-view-sat':'btn-view-map'); if(mt&&typeof HOST.mapType!=='undefined'&&HOST.mapType!==saved.mt) mt.click(); }catch(_){}
          try{ if(sbEl && !saved.sbCol && sbEl.classList.contains('collapsed')){ sbEl.classList.remove('collapsed'); window.dispatchEvent(new Event('intmap-sidebar-resize')); } }catch(_){}
          try{ GE().camera.flyTo({center:saved.c,zoom:saved.z,duration:900}); }catch(_){}
        }
        exitB.onclick=restore;
        guessB.onclick=()=>openGuess(target,restore,{startZoom:START_Z,getMinZoom:()=>minZoom});
      });
    };
    function openGuess(target,restore,roundInfo){
      const {ov,card}=shell(560); card.appendChild(xbtn(()=>ov.remove()));
      const t=document.createElement('h3'); t.textContent=window.IntMapLang.t(HOST.lang,"Click the map to drop your guess","現在地はどこ？地図をタップ","Zum Tippen auf die Karte klicken","Кликните по карте, чтобы поставить догадку","Haga clic en el mapa para colocar su respuesta"); t.style.cssText='margin:0 0 4px;font-size:16px;'; card.appendChild(t);
      const hint=document.createElement('div'); hint.style.cssText='margin:0 0 10px;font-size:11.5px;color:var(--text-muted);'; hint.textContent=window.IntMapLang.t(HOST.lang,"The less you zoom out, the higher your score (min zoom is penalised).","ズームアウトせずに当てるほど高得点（最小ズームで減点）。","Je weniger Sie herauszoomen, desto höher die Punktzahl (minimaler Zoom wird bestraft).","Чем меньше вы отдаляете карту, тем выше счёт (минимальный зум штрафуется).","Cuanto menos aleje el mapa, mayor será su puntuación (el zoom mínimo penaliza)."); card.appendChild(hint);
      const mapDiv=document.createElement('div'); mapDiv.id='pg-guess-map'; mapDiv.style.cssText='width:100%;height:300px;border-radius:12px;overflow:hidden;background:var(--input-bg);'; card.appendChild(mapDiv);
      const result=document.createElement('div'); result.style.cssText='margin-top:12px;font-size:13.5px;line-height:1.6;'; card.appendChild(result);
      const answerB=document.createElement('button'); answerB.textContent=window.IntMapLang.t(HOST.lang,"Answer","回答","Antwort","Ответ","Respuesta"); answerB.disabled=true; answerB.style.cssText='width:100%;margin-top:12px;padding:12px;border:none;border-radius:11px;background:var(--primary-color);color:#fff;font-size:14px;font-weight:700;cursor:pointer;opacity:0.5;'; card.appendChild(answerB);
      let gmap=null, guess=null, gmarker=null, answered=false;
      try{
        gmap=GE().ui.createSubView({container:'pg-guess-map',style:{version:8,sources:{c:{type:'raster',tiles:['https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png','https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png'],tileSize:256,attribution:'© CARTO © OSM'}},layers:[{id:'c',type:'raster',source:'c'}]},center:[10,25],zoom:0.35,attributionControl:{compact:true},renderWorldCopies:false});
        /* (#R31) GLOBE projection for the guess map ("メルカトルではなくglobe地図に") — more game-y & honest about distance. */
        /* (#R179) through the scoped engine: setProjection takes a MODE, not a renderer spec */
        try{ gmap.events.on('style.load',()=>{ try{ gmap.camera.setProjection('globe'); }catch(_){} }); gmap.camera.setProjection('globe'); }catch(_){}
        gmap.events.on('click',(e)=>{ if(answered) return; guess=[e.lngLat.lng,e.lngLat.lat]; if(gmarker) gmarker.remove(); const el=document.createElement('div'); el.style.cssText='width:16px;height:16px;border-radius:50%;background:#ff3b30;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.5);'; gmarker=gmap.ui.addMarker({element:el},guess); answerB.disabled=false; answerB.style.opacity='1'; });
      }catch(err){ result.textContent='Guess map failed.'; }
      answerB.onclick=()=>{
        if(answered||!guess) return; answered=true; answerB.style.display='none';
        const dist=haversine(guess,[target.lng,target.lat]); const base=Math.round(1000*Math.exp(-dist/1500));
        /* (#R30) zoom-out penalty — the more the player zoomed out during the round, the bigger the deduction. */
        const sz=(roundInfo&&roundInfo.startZoom)||15.4; const mz=(roundInfo&&roundInfo.getMinZoom)?roundInfo.getMinZoom():sz;
        const zoomDrop=Math.max(0, sz-mz); const penFrac=Math.min(0.6, zoomDrop*0.045); const penalty=Math.round(base*penFrac); const score=Math.max(0, base-penalty);
        try{ const el=document.createElement('div'); el.style.cssText='width:18px;height:18px;border-radius:50%;background:#34c759;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.5);'; gmap.ui.addMarker({element:el},[target.lng,target.lat]);
          gmap.camera.fitBounds([[Math.min(guess[0],target.lng),Math.min(guess[1],target.lat)],[Math.max(guess[0],target.lng),Math.max(guess[1],target.lat)]],{padding:60,maxZoom:6,duration:800}); }catch(_){}
        result.innerHTML='<b style="font-size:22px;color:var(--primary-color);">'+score+' / 1000</b><br>'
          +(window.IntMapLang.t(HOST.lang,"Distance: ","距離: ","Entfernung: ","Расстояние: ","Distancia: "))+Math.round(dist).toLocaleString()+' km'+(target.country?' · '+(window.IntMapLang.t(HOST.lang,"Actual: ","正解: ","Tatsächlich: ","На самом деле: ","Real: "))+target.country:'')
          +'<div style="margin-top:6px;font-size:12px;color:var(--text-muted);">'+(window.IntMapLang.t(HOST.lang,"Base ","基本点 ","Grundpunkte ","Базовые ","Base "))+base
          +(penalty>0?(' · '+(window.IntMapLang.t(HOST.lang,"Zoom-out −","ズームアウト減点 −","Herauszoomen −","Отдаление −","Alejamiento −"))+penalty+' ('+(window.IntMapLang.t(HOST.lang,"min zoom ","最小ズーム ","min. Zoom ","мин. зум ","zoom mínimo "))+mz.toFixed(1)+')'):' · <span style="color:#34c759;">'+(window.IntMapLang.t(HOST.lang,"no zoom-out!","ズームアウトなし！","kein Herauszoomen!","без отдаления!","¡sin alejar!"))+'</span>')+'</div>';
        const again=document.createElement('button'); again.textContent=window.IntMapLang.t(HOST.lang,"Play again","もう一度","Noch einmal","Сыграть ещё","Jugar otra vez"); again.style.cssText='width:100%;margin-top:12px;padding:11px;border:none;border-radius:11px;background:var(--input-bg);color:var(--text-main);font-size:13.5px;font-weight:700;cursor:pointer;'; card.appendChild(again);
        again.onclick=()=>{ try{ gmap&&gmap.destroy(); }catch(_){} ov.remove(); try{ restore&&restore(); }catch(_){} window._pgWorldExplorer&&window._pgWorldExplorer(); };
      };
      ov.addEventListener('click',e=>{ if(e.target===ov){ try{ gmap&&gmap.destroy(); }catch(_){} } });
    }

    /* ===================== PANDEMIC SIMULATOR ===================== */
    /* (#R30) Scientifically-grounded SEIR metapopulation model. Per-country S/E/I/R/D/V compartments;
       transmission from R0 + incubation + infectious period; sanitation (HDI/GDP) drives healthcare
       overload & care speed; seasonality + behavioural distancing + automatic lockdowns / border closures
       + waning immunity + random VARIANTS produce long, chaotic, VARIED outcomes — not the old short
       "everyone dies" curve. Spread shows as RED CASE DOTS that multiply & spread (no country-wide red
       fill, per spec). Vaccine + treatment arrive on a luck-driven timeline. */
    const PG_PRESETS={
      flu:{ n:LA('Influenza','インフルエンザ','Influenza','Грипп','Gripe'), r0:1.4, inc:2, inf:5, ifr:0.001, immMo:8, seas:0.35 },
      covid:{ n:LA('COVID-19','COVID-19','COVID-19','COVID-19','COVID-19'), r0:3.2, inc:5, inf:9, ifr:0.007, immMo:9, seas:0.18 },
      sars:{ n:LA('SARS','SARS','SARS','ТОРС','SARS'), r0:2.6, inc:5, inf:10, ifr:0.1, immMo:36, seas:0.12 },
      ebola:{ n:LA('Ebola','エボラ出血熱','Ebola','Эбола','Ébola'), r0:1.9, inc:9, inf:10, ifr:0.5, immMo:120, seas:0 },
      measles:{ n:LA('Measles','麻疹','Masern','Корь','Sarampión'), r0:14, inc:11, inf:8, ifr:0.002, immMo:600, seas:0.05 }
    };
    window._pgPandemic=function(){
      if(!GE().hasRenderer()){ try{ imToast('Map not ready'); }catch(_){} return; }
      _pgWeStyle();
      ensureCountries(()=>{
        const feats=(window.countryGeo&&window.countryGeo.features)||[]; if(!feats.length){ try{ imToast(window.IntMapLang.t(HOST.lang,"Country data unavailable","国境データを読み込めません","Länderdaten nicht verfügbar","Данные по странам недоступны","Datos de países no disponibles")); }catch(_){} return; }
        /* (#R30) hide the mobile bottom-sheet / FABs so the HUD + map aren't covered ("ボタンがボトムシートに隠れる"). */
        try{ document.body.classList.add('pg-sim'); }catch(_){}
        const cs=(typeof countryStats!=='undefined'&&countryStats)||{};
        const resolve=(p)=>{ const c=[p.ISO_A3_EH,p.ISO_A3,p.ADM0_A3,p.SOV_A3].map(String).find(x=>cs[x]); return c?cs[c]:null; };
        const N=feats.length, cent=[], bbs=[], pop=[], dev=[], st=[], nm=[]; let WORLDPOP=0;
        feats.forEach((f,i)=>{ const bb=bboxOf(f); bbs[i]=bb; cent[i]=[(bb[0]+bb[2])/2,(bb[1]+bb[3])/2]; const s=resolve(f.properties||{}); const Pp=(s&&s.pop&&s.pop>0)?s.pop:3e6; pop[i]=Pp; WORLDPOP+=Pp; dev[i]=(s&&s.gdppc)?Math.min(1,Math.max(0.12,s.gdppc/55000)):(s&&s.hdi?s.hdi:0.5); nm[i]=cName(f)||'?'; st[i]={S:Pp,E:0,I:0,R:0,D:0,V:0,seeded:false,closed:false,lock:0,pool:null,fatigue:0}; });
        /* CASE-DOT layers (no country fill). A soft glow under crisp dots. */
        try{ ['pg-dots','pg-dots-glow'].forEach(id=>{ if(GE().layers.has(id)) GE().layers.remove(id); }); if(GE().layers.hasSource('pg-dots')) GE().layers.removeSource('pg-dots'); }catch(_){}
        try{ GE().layers.addSource('pg-dots',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
          /* (#R31) Finer, more UNIFORM dots ("大きさ差を小さく") — small fixed glow + tiny crisp dot. */
          GE().layers.add({id:'pg-dots-glow',type:'circle',source:'pg-dots',paint:{'circle-radius':['interpolate',['linear'],['zoom'],1,2.6,5,5],'circle-color':['interpolate',['linear'],['get','sev'],0,'#ff5a3c',1,'#7a0010'],'circle-blur':0.9,'circle-opacity':0.28}});
          GE().layers.add({id:'pg-dots',type:'circle',source:'pg-dots',paint:{'circle-radius':['interpolate',['linear'],['zoom'],1,1.6,5,2.9],'circle-color':['interpolate',['linear'],['get','sev'],0,'#ff3b30',0.5,'#e01010',1,'#7a0010'],'circle-stroke-color':'rgba(255,255,255,0.45)','circle-stroke-width':0.25,'circle-opacity':0.95}});
        }catch(e){ console.warn('pandemic dots',e); }
        /* (#R31) Place case dots on REAL places — the capital + gazetteer cities inside the country —
           then jittered clusters around them ("感染者単位で実際の場所に置いて"). Falls back to random
           in-polygon points only when no city is known for that country. */
        function genPts(i,n){ const f=feats[i], bb=bbs[i]; const span=Math.min(2.0,Math.max(0.1,Math.max(bb[2]-bb[0],bb[3]-bb[1])*0.09)); const anchors=[];
          try{ const s=resolve(f.properties||{}); if(s&&s.latlng){ const cl=[s.latlng[1],s.latlng[0]]; if(pig(cl[0],cl[1],f.geometry)) anchors.push(cl); } }catch(_){}
          try{ const gz=(typeof HOST.geoDB!=='undefined'&&HOST.geoDB)||window.geoDB||[]; for(let q=0;q<gz.length && anchors.length<64;q++){ const c=gz[q]&&gz[q].loc; if(!c) continue; if(c[0]<bb[0]||c[0]>bb[2]||c[1]<bb[1]||c[1]>bb[3]) continue; if(pig(c[0],c[1],f.geometry)) anchors.push([c[0],c[1]]); } }catch(_){}
          const out=[];
          if(anchors.length){ for(let d=0; d<n; d++){ const a=anchors[d%anchors.length]; const jit=d<anchors.length?0:1; out.push([a[0]+(Math.random()-0.5)*span*jit, a[1]+(Math.random()-0.5)*span*jit]); } return out; }
          let tries=0; while(out.length<n && tries<n*16){ tries++; const lng=bb[0]+Math.random()*(bb[2]-bb[0]), lat=bb[1]+Math.random()*(bb[3]-bb[1]); if(pig(lng,lat,f.geometry)) out.push([lng,lat]); } if(!out.length) out.push(cent[i]); return out; }

        let P=Object.assign({},PG_PRESETS.covid), immMo=P.immMo, seasAmp=P.seas;
        let day=0, timer=null, running=false, speed=2, picking=true, lastDots=0, lastEvt='', R0_BASE=P.r0;
        let vaxProg=0, vaxDay=-1, vaxRate=0, treat=false, pheic=false, hit10=false, variants=0, closeAnn=0, lockAnn=0, d1m=false, d10m=false;
        const vaxDifficulty=0.7+Math.random()*0.9;   // luck: some runs get a fast vaccine, some slow
        /* (#R35) REALISM: a vaccine can NEVER be approved before ~8 months. The R&D-progress race alone let a
           massive early outbreak unlock a vaccine in ~1 month ("ありえないことが多すぎる") — but the real record
           (COVID mRNA, genome→first EUA) is ~270 days. Gate approval behind a realistic floor of 240–360 days. */
        const VAX_MIN_DAY=240+Math.floor(Math.random()*120);
        const peakDay=(lat)=> lat>=0 ? 20 : 202;
        function totals(){ let I=0,E=0,R=0,D=0,V=0,aff=0; for(let i=0;i<N;i++){ const s=st[i]; I+=s.I; E+=s.E; R+=s.R; D+=s.D; V+=s.V; if(s.seeded&&(s.I+s.E)>0.5) aff++; } return {I,E,R,D,V,aff}; }
        function seed(i,amount){ const s=st[i]; const k=Math.min(s.S, amount||Math.max(40,pop[i]*1e-6)); s.S-=k; s.E+=k; s.seeded=true; }
        function news(html,kind){ lastEvt=html; try{ pgNews(html,kind); }catch(_){} const el=hud&&hud.querySelector('#pg-evt'); if(el) el.textContent=html.replace(/<[^>]+>/g,''); }

        function step(){ day++;
          const gamE=1/Math.max(0.5,P.inc), gam=1/Math.max(1,P.inf), omega=immMo>=400?0:1/(immMo*30);
          /* vaccine R&D — driven by global infections in capable (high-GDP) countries + time (luck-gated) */
          if(vaxDay<0){ let drive=0; for(let i=0;i<N;i++){ if(dev[i]>0.6) drive+=st[i].I; } vaxProg+=0.0016+Math.min(0.02,drive/4e8);
            if(vaxProg>vaxDifficulty && day>=VAX_MIN_DAY){ vaxDay=day; let best=-1,bv=-1; for(let i=0;i<N;i++){ if(dev[i]>0.62){ const v=st[i].I*dev[i]+Math.random()*1e6; if(v>bv){bv=v;best=i;} } } const cn=best>=0?nm[best]:'a leading lab';
              news((jp()?(cn+'がワクチンを承認。接種が始まります。'):(cn+' approves a vaccine — rollout begins.')),'good'); } }
          if(vaxDay>=0) vaxRate=Math.min(0.012, vaxRate+0.00035);
          let totI=0;
          for(let i=0;i<N;i++){ const s=st[i]; if(!s.seeded) continue; const live=s.S+s.E+s.I+s.R+s.V||1;
            const seas=1+seasAmp*Math.cos(2*Math.PI*((day-peakDay(cent[i][1]))/365));
            const sick=s.I/live; const behav=1-0.55*Math.min(1,sick*90)-0.25*s.lock;
            const beta=P.r0*gam*seas*Math.max(0.12,behav);
            const newE=Math.min(s.S, beta*s.I*s.S/live), toI=gamE*s.E;
            const overload=1+Math.min(1.1,(sick*55)*(1-dev[i]));              /* (#R32) gentler hospital overload */
            const medImprove=Math.max(0.5,1-day*0.00045);                      /* (#R32) care/CFR improves over time (realistic) */
            const ifrEff=Math.min(0.85,P.ifr*overload*(treat?0.4:1)*medImprove*(1.2-0.4*dev[i]));
            const out=gam*s.I, dead=out*ifrEff, rec=out-dead, vac=Math.min(s.S,vaxRate*s.S*0.9), wane=omega*s.R;
            s.S+= -newE - vac + wane; s.E+= newE - toI; s.I+= toI - out; s.R+= rec - wane; s.D+= dead; s.V+= vac;
            if(s.S<0)s.S=0; if(s.E<0)s.E=0; if(s.I<0)s.I=0; if(s.R<0)s.R=0;
            totI+=s.I;
            /* automatic interventions (the lockdown / border-screening the spec asked for) */
            if(!s.closed && sick>0.0008 && Math.random()<0.04+0.16*dev[i]){ s.closed=true; if(closeAnn<6 && pop[i]>8e6){ closeAnn++; news((jp()?(nm[i]+'が国境を封鎖。'):(nm[i]+' closes its borders.')),'info'); } }
            if(s.lock<0.85 && sick>0.004 && s.fatigue<3){ s.lock=Math.min(0.85,s.lock+0.08); if(lockAnn<6 && pop[i]>1.2e7 && s.lock>0.45 && Math.random()<0.25){ lockAnn++; news((jp()?(nm[i]+'がロックダウンを発令。'):(nm[i]+' enters lockdown.')),'info'); } }
            else if(s.lock>0 && sick<0.0015){ s.lock=Math.max(0,s.lock-0.04); s.fatigue+=0.01; }
            /* between-country spread — gravity + transport, throttled by border closures */
            if(s.I>live*0.0004){ const tries=2+Math.floor(P.r0/2); for(let t=0;t<tries;t++){ const j=Math.floor(Math.random()*N); if(j===i) continue; const d=haversine(cent[i],cent[j])+1; const air=Math.exp(-d/3200)*0.55, hub=0.04*dev[j]; let pHop=(P.r0/3)*(air+hub)*Math.min(1,s.I/live*120); if(s.closed) pHop*=0.18; if(st[j].closed) pHop*=0.25; if(Math.random()<pHop*speed*0.12){ if(!st[j].seeded) seed(j,Math.max(20,pop[j]*4e-7)); else st[j].E+=Math.min(st[j].S,30); } } }
          }
          /* VARIANTS — random emergence with immune escape → new waves. (#R32b) REALISM: a real variant
             raises R0 ~1.1–1.4× (Omicron-ish), not 1.6× repeatedly, and the cumulative R0 is capped so it
             can't balloon to impossible values ("ありえないことが多すぎる"). Cap 4 variants. */
          if(variants<4 && totI>5e5 && Math.random()<0.0014*speed){ variants++;
            let best=-1,bv=-1; for(let i=0;i<N;i++){ if(st[i].I>bv){bv=st[i].I;best=i;} }
            const moreInf=Math.random()<0.7; P.r0=Math.min(R0_BASE*2.2,16,Math.max(0.8,P.r0*(moreInf?(1.08+Math.random()*0.3):(0.88+Math.random()*0.08))));
            const escape=0.15+Math.random()*0.3; for(let i=0;i<N;i++){ const mv=st[i].R*escape; st[i].R-=mv; st[i].S+=mv; const vv=st[i].V*escape*0.5; st[i].V-=vv; st[i].S+=vv; }
            if(Math.random()<0.4) P.ifr*=(0.7+Math.random()*0.6);
            const gl=String.fromCharCode(944+variants);
            news((jp()?('新変異株（'+gl+'）を'+(best>=0?nm[best]:'?')+'で確認。'+(moreInf?'感染力が上昇。':'')):('New variant ('+gl+') detected in '+(best>=0?nm[best]:'?')+'.'+(moreInf?' More transmissible.':''))),'alert');
          }
          const T=totals();
          if(!hit10 && T.aff>=10){ hit10=true; news((window.IntMapLang.t(HOST.lang,"Outbreak has reached 10 countries.","感染が10カ国に拡大。","Der Ausbruch hat 10 Länder erreicht.","Вспышка достигла 10 стран.","El brote ha llegado a 10 países.")),'alert'); }
          if(!pheic && (T.I+T.R+T.D)>3e6){ pheic=true; news((window.IntMapLang.t(HOST.lang,"WHO declares a global health emergency (PHEIC).","WHOが「国際的に懸念される公衆衛生上の緊急事態（PHEIC）」を宣言。","Die WHO erklärt eine gesundheitliche Notlage internationaler Tragweite (PHEIC).","ВОЗ объявляет чрезвычайную ситуацию в области общественного здравоохранения, имеющую международное значение (PHEIC).","La OMS declara una emergencia de salud pública de importancia internacional (ESPII).")),'alert'); }
          if(!treat && totI>2e6 && Math.random()<0.0009*speed){ treat=true; news((window.IntMapLang.t(HOST.lang,"An effective treatment is found — fatality rate falls.","有効な治療法が確立。致死率が低下します。","Eine wirksame Behandlung wird gefunden — die Sterblichkeit sinkt.","Найдено эффективное лечение — летальность снижается.","Se encuentra un tratamiento eficaz: la letalidad cae.")),'good'); }
          if(!d1m && T.D>1e6){ d1m=true; news((window.IntMapLang.t(HOST.lang,"Global death toll passes 1 million.","世界の死者が100万人を突破。","Die weltweite Zahl der Todesopfer übersteigt 1 Million.","Число погибших в мире превысило 1 миллион.","El número global de muertes supera el millón.")),'alert'); }
          if(!d10m && T.D>1e7){ d10m=true; news((window.IntMapLang.t(HOST.lang,"Global death toll passes 10 million.","世界の死者が1000万人を突破。","Die weltweite Zahl der Todesopfer übersteigt 10 Millionen.","Число погибших в мире превысило 10 миллионов.","El número global de muertes supera los 10 millones.")),'alert'); }
          const now=Date.now(); if(now-lastDots>140){ lastDots=now; buildDots(); } updateHud(T);
          /* (#R32) richer, VARIED end states ("オチが毎回同じ…をやめて") with the final toll + attack rate. */
          const attack=WORLDPOP?((T.R+T.D+T.I)/WORLDPOP):0;
          if(day>40 && totI<150 && T.aff<=1 && day<300){ buildDots(); stop(); news((jp()?('封じ込め成功 — 死者'+fmt(T.D)+'。世界的流行には至りませんでした。'):('Contained — '+fmt(T.D)+' deaths; it never became a pandemic.')),'good'); renderRun(true); }
          else if(day>40 && totI<200){ buildDots(); stop(); const verdict=attack<0.05?(window.IntMapLang.t(HOST.lang,"a minor outbreak","小規模な流行で終息","ein kleinerer Ausbruch","небольшая вспышка","un brote menor")):attack<0.25?(window.IntMapLang.t(HOST.lang,"the outbreak has ended","流行は終息","der Ausbruch ist vorbei","вспышка закончилась","el brote ha terminado")):(window.IntMapLang.t(HOST.lang,"a devastating pandemic, now over","壊滅的な大流行を経て終息","eine verheerende Pandemie, jetzt vorbei","разрушительная пандемия, теперь завершившаяся","una pandemia devastadora, ya terminada")); news((jp()?(verdict+' — 累計死者'+fmt(T.D)+'（世界の'+(attack*100).toFixed(1)+'%が感染）。'):('It was '+verdict+' — '+fmt(T.D)+' deaths, '+(attack*100).toFixed(1)+'% of the world infected.')),attack<0.25?'good':'alert'); renderRun(true); }
          else if(day>365*8){ stop(); news((jp()?('風土病として定着（長期均衡）。累計死者'+fmt(T.D)+'。'):('Now endemic (long-run equilibrium) — '+fmt(T.D)+' cumulative deaths.')),'info'); renderRun(true); }
        }
        /* (#R32) Dots now scale with the ACTUAL case count ("感染者の人数単位で") — each dot ≈ `perDot`
           active cases, allocated proportionally per country up to a global budget (perf), placed on REAL
           cities. Far MORE dots than the old log-capped 30 ("数を増やして"); uniform small size kept. */
        const PG_POOL=80, PG_DOTCAP=4800, PG_CASES_PER_DOT=60;
        function buildDots(){ let totAct=0; for(let i=0;i<N;i++){ const s=st[i]; if(s.seeded) totAct+=s.I+s.E; }
          /* (#R32) each dot ≈ a fixed number of cases (so a small outbreak shows a FEW dots and grows
             visibly as cases rise), with the global budget only kicking in once the pandemic is huge. */
          const perDot=Math.max(PG_CASES_PER_DOT, totAct/PG_DOTCAP); const out=[];
          for(let i=0;i<N;i++){ const s=st[i]; if(!s.seeded) continue; const act=s.I+s.E; if(act<1 && s.D<1) continue;
            let k=Math.round(act/perDot); if(k<1 && (act>=1||s.D>0)) k=1; if(k>PG_POOL) k=PG_POOL;
            if(!s.pool) s.pool=genPts(i,PG_POOL); const sev=s.D>0?Math.min(1,s.D/(s.I+s.R+s.D+1)*3):0;
            for(let d=0; d<k && d<s.pool.length; d++) out.push({type:'Feature',geometry:{type:'Point',coordinates:s.pool[d]},properties:{sev}}); }
          try{ GE().layers.setSourceData('pg-dots',{type:'FeatureCollection',features:out}); }catch(_){} }
        function loop(){ clearTimeout(timer); if(!running) return; step(); if(running) timer=setTimeout(loop, Math.max(70,440/speed)); }
        function start(){ if(running) return; running=true; loop(); }
        function stop(){ running=false; clearTimeout(timer); }

        const hud=document.createElement('div'); hud.id='pg-pan-hud';
        hud.style.cssText='position:fixed;left:50%;transform:translateX(-50%);bottom:max(18px,env(safe-area-inset-bottom));z-index:5810;width:min(540px,94vw);box-sizing:border-box;background:var(--popup-bg);color:var(--text-main);border:1px solid var(--glass-border,rgba(128,128,128,0.25));border-radius:16px;box-shadow:var(--shadow);backdrop-filter:blur(14px);padding:12px 14px;font-size:12.5px;';
        (document.getElementById('map-container')||document.body).appendChild(hud);
        function fmt(n){ n=Math.round(n); if(n>=1e9)return (n/1e9).toFixed(2)+'B'; if(n>=1e6)return (n/1e6).toFixed(2)+'M'; if(n>=1e3)return (n/1e3).toFixed(1)+'k'; return ''+n; }
        function updateHud(T){ const el=hud.querySelector('#pg-pan-stats'); if(!el) return; const vpct=WORLDPOP?Math.round(T.V/WORLDPOP*100):0;
          el.innerHTML='<span style="color:#f03b20;">'+(window.IntMapLang.t(HOST.lang,"Infected","感染","Infiziert","Заражено","Infectados"))+' <b>'+fmt(T.I)+'</b></span> · '+
          '<span style="color:#7a0010;">'+(window.IntMapLang.t(HOST.lang,"Dead","死亡","Tote","Умерло","Fallecidos"))+' <b>'+fmt(T.D)+'</b></span> · '+
          '<span style="color:#2ca25f;">'+(window.IntMapLang.t(HOST.lang,"Recovered","回復","Genesen","Выздоровело","Recuperados"))+' <b>'+fmt(T.R)+'</b></span> · '+
          '<span style="color:#0a84ff;">'+(window.IntMapLang.t(HOST.lang,"Vaccinated","接種","Geimpft","Вакцинировано","Vacunados"))+' <b>'+vpct+'%</b></span><br>'+
          '<span>'+(window.IntMapLang.t(HOST.lang,"Countries","国","Länder","Страны","Países"))+' <b>'+T.aff+'</b></span> · '+(window.IntMapLang.t(HOST.lang,"Day","経過","Tag","День","Día"))+' <b>'+day+'</b>'+(variants?' · '+(window.IntMapLang.t(HOST.lang,"variants","変異株","Varianten","варианты","variantes"))+' <b>'+variants+'</b>':'')+(vaxDay>=0?' · 💉':(vaxProg>0?' · '+(window.IntMapLang.t(HOST.lang,"vaccine R&D","ワクチン開発","Impfstoffentwicklung","разработка вакцины","I+D de vacunas"))+' '+Math.round(Math.min(1,vaxProg/vaxDifficulty,day/VAX_MIN_DAY)*100)+'%':'')); }   /* (#R35) progress also bounded by the realistic time floor */
        function mk(lab,val,min,max,stp,fmtv,set){ const w=document.createElement('div'); w.style.cssText='display:flex;align-items:center;gap:8px;margin:5px 0;font-size:11.5px;'; const l=document.createElement('span'); l.textContent=lab; l.style.cssText='flex:0 0 104px;color:var(--text-muted);'; const r=document.createElement('input'); r.type='range'; r.min=min; r.max=max; r.step=stp; r.value=val; r.style.cssText='flex:1;accent-color:var(--primary-color);'; const v=document.createElement('b'); v.textContent=fmtv(+val); v.style.cssText='flex:0 0 50px;text-align:right;'; r.oninput=()=>{ v.textContent=fmtv(+r.value); set(+r.value); }; w.appendChild(l); w.appendChild(r); w.appendChild(v); hud.appendChild(w); }
        function renderConfig(){ hud.innerHTML='';
          const h=document.createElement('div'); h.style.cssText='display:flex;align-items:center;gap:8px;margin-bottom:8px;'; const tt=document.createElement('b'); tt.textContent=window.IntMapLang.t(HOST.lang,"Outbreak setup","パンデミック設定","Ausbruch einrichten","Настройка вспышки","Configuración del brote"); tt.style.fontSize='14px'; h.appendChild(tt); h.appendChild(pill('beta','#ff9500')); const sp=document.createElement('span'); sp.style.flex='1'; h.appendChild(sp); const ex=document.createElement('button'); ex.textContent='✕'; ex.style.cssText='border:none;border-radius:50%;width:28px;height:28px;background:var(--input-bg);color:var(--text-main);cursor:pointer;'; ex.onclick=exit; h.appendChild(ex); hud.appendChild(h);
          const presetRow=document.createElement('div'); presetRow.style.cssText='display:flex;flex-wrap:wrap;gap:6px;margin-bottom:9px;';
          Object.keys(PG_PRESETS).forEach(k=>{ const pr=PG_PRESETS[k]; const on=(P.n&&P.n[0])===pr.n[0]; const b=document.createElement('button'); b.textContent=L.arr(pr.n); b.style.cssText='border:1px solid rgba(128,128,128,0.3);background:'+(on?'var(--primary-color)':'var(--input-bg)')+';color:'+(on?'#fff':'var(--text-main)')+';border-radius:999px;padding:6px 11px;font-size:11.5px;font-weight:600;cursor:pointer;'; b.onclick=()=>{ P=Object.assign({},pr); immMo=P.immMo; seasAmp=P.seas; renderConfig(); }; presetRow.appendChild(b); }); hud.appendChild(presetRow);
          mk(window.IntMapLang.t(HOST.lang,"Infectivity R₀","基本再生産数R₀","Basisreproduktionszahl R₀","Базовое репродуктивное число R₀","Número reproductivo básico R₀"),P.r0,0.6,18,0.1,v=>v.toFixed(1),v=>P.r0=v);
          mk(window.IntMapLang.t(HOST.lang,"Lethality %","致死率(IFR)%","Letalität %","Летальность %","Letalidad %"),+(P.ifr*100).toFixed(1),0,60,0.1,v=>v+'%',v=>P.ifr=v/100);
          mk(window.IntMapLang.t(HOST.lang,"Incubation (d)","潜伏(日)","Inkubation (T)","Инкубация (дн.)","Incubación (d)"),P.inc,0,21,1,v=>''+v,v=>P.inc=v);
          mk(window.IntMapLang.t(HOST.lang,"Infectious (d)","感染期(日)","Ansteckend (T)","Заразность (дн.)","Contagiosidad (d)"),P.inf,1,21,1,v=>''+v,v=>P.inf=v);
          mk(window.IntMapLang.t(HOST.lang,"Immunity (mo)","免疫(月)","Immunität (Mon.)","Иммунитет (мес.)","Inmunidad (meses)"),Math.min(120,immMo),0,120,1,v=>v>=120?'∞':(''+v),v=>immMo=(v>=120?600:v));
          const hint=document.createElement('div'); hint.style.cssText='margin-top:9px;font-size:12px;color:var(--primary-color);font-weight:600;'; hint.textContent=window.IntMapLang.t(HOST.lang,"▶ Tap a country on the map to place patient zero","▶ 地図で感染源となる国をタップ","▶ Auf der Karte ein Land antippen, um Patient null zu setzen","▶ Нажмите страну на карте, чтобы поместить нулевого пациента","▶ Toque un país en el mapa para colocar al paciente cero"); hud.appendChild(hint);
        }
        function renderRun(ended){ hud.innerHTML='';
          const stats=document.createElement('div'); stats.id='pg-pan-stats'; stats.style.cssText='margin-bottom:7px;line-height:1.65;'; hud.appendChild(stats);
          const evt=document.createElement('div'); evt.id='pg-evt'; evt.style.cssText='font-size:11px;color:var(--text-muted);margin-bottom:8px;min-height:14px;line-height:1.35;'; evt.textContent=lastEvt.replace(/<[^>]+>/g,''); hud.appendChild(evt);
          const row=document.createElement('div'); row.style.cssText='display:flex;gap:8px;align-items:center;';
          if(ended){ const again=document.createElement('button'); again.textContent=window.IntMapLang.t(HOST.lang,"New outbreak","もう一度","Neuer Ausbruch","Новая вспышка","Nuevo brote"); again.style.cssText='flex:1;border:none;border-radius:10px;background:var(--primary-color);color:#fff;padding:10px;font-weight:700;cursor:pointer;'; again.onclick=()=>{ exit(); setTimeout(()=>window._pgPandemic&&window._pgPandemic(),120); }; row.appendChild(again); }
          else { const play=document.createElement('button'); const setPlay=()=>play.textContent=running?(window.IntMapLang.t(HOST.lang,"⏸ Pause","⏸ 一時停止","⏸ Pause","⏸ Пауза","⏸ Pausa")):(window.IntMapLang.t(HOST.lang,"▶ Play","▶ 再開","▶ Abspielen","▶ Воспроизвести","▶ Reproducir")); play.style.cssText='flex:1;border:none;border-radius:10px;background:var(--primary-color);color:#fff;padding:9px;font-weight:700;cursor:pointer;'; play.onclick=()=>{ if(running) stop(); else start(); setPlay(); }; setPlay(); row.appendChild(play);
            const spd=document.createElement('button'); spd.textContent='⏩ x'+speed; spd.style.cssText='border:none;border-radius:10px;background:var(--input-bg);color:var(--text-main);padding:9px 12px;font-weight:700;cursor:pointer;'; spd.onclick=()=>{ speed=speed>=8?1:speed*2; spd.textContent='⏩ x'+speed; }; row.appendChild(spd); }
          const ex=document.createElement('button'); ex.textContent='✕'; ex.style.cssText='border:none;border-radius:10px;background:var(--input-bg);color:var(--text-main);padding:9px 12px;cursor:pointer;'; ex.onclick=exit; row.appendChild(ex);
          hud.appendChild(row); updateHud(totals());
        }
        function onPick(e){ if(!picking) return; let hit=null; for(let i=0;i<N;i++){ if(pig(e.lngLat.lng,e.lngLat.lat,feats[i].geometry)){ hit=i; break; } }
          if(hit==null) return; picking=false; R0_BASE=P.r0; seed(hit,Math.max(60,pop[hit]*2e-6)); buildDots(); renderRun(false); start();
          news((window.IntMapLang.t(HOST.lang,"Patient zero confirmed in ","最初の感染者が確認されました — ","Patient null bestätigt in ","Нулевой пациент подтверждён в ","Paciente cero confirmado en "))+nm[hit]+'.','alert');
        }
        GE().events.on('click',onPick);
        function exit(){ stop(); try{ GE().events.off('click',onPick); }catch(_){} try{ ['pg-dots','pg-dots-glow'].forEach(id=>{ if(GE().layers.has(id))GE().layers.remove(id); }); if(GE().layers.hasSource('pg-dots'))GE().layers.removeSource('pg-dots'); }catch(_){} try{ hud.remove(); }catch(_){} try{ document.body.classList.remove('pg-sim'); }catch(_){} }
        window._pgPandemicExit=exit;
        renderConfig();
      });
    };

    /* (#R32) Statecraft (_pgNationSim) & World Sandbox (_pgWorldSandbox) ABOLISHED per request. */
  })();
};
