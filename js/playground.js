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
/* (#R575) The Pandemic Simulator's arithmetic — a pure, seeded, node-testable SEIR metapopulation
   engine. Static, not lazy: this whole file is already behind js/lazy-modules.js's playground
   door, so the model is downloaded exactly when the playground is and never before. */
import { PANDEMIC_PRESETS, createPandemicModel, scatterCases, caseDotPlan, dotSignature, snapToStep, eventKind, chartPoints, summariseEnsemble, policyActors } from './pandemic-model.js';

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
    function xbtn(onclick){ const b=document.createElement('button'); b.textContent='×'; b.style.cssText='position:absolute;top:12px;right:12px;width:32px;height:32px;border:none;border-radius:9px;background:var(--input-bg);color:var(--text-main);font-size:16px;cursor:pointer;z-index:2;'; b.onclick=onclick; return b; }
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
        {svg:SV.virus,bg:'linear-gradient(135deg,#ff3b30,#ff9500)',t:window.IntMapLang.t(HOST.lang,"Pandemic Simulator","パンデミック・シミュレーター","Pandemie-Simulator","Симулятор пандемии","Simulador de pandemia"),d:window.IntMapLang.t(HOST.lang,"Seed an outbreak and watch a stochastic SEIR model carry it between real countries — vaccines, variants and lockdowns included.","感染源を置き、確率的SEIRモデルで国から国への広がりを可視化。ワクチン・変異株・封鎖まで。","Setzen Sie einen Ausbruch und sehen Sie zu, wie ein stochastisches SEIR-Modell ihn zwischen echten Ländern trägt — mit Impfstoffen, Varianten und Lockdowns.","Задайте очаг вспышки и смотрите, как стохастическая модель SEIR переносит её между реальными странами — с вакцинами, вариантами и локдаунами.","Siembre un brote y observe cómo un modelo SEIR estocástico lo lleva entre países reales: vacunas, variantes y confinamientos incluidos."),go:()=>{ ov.remove(); window._pgPandemic&&window._pgPandemic(); }},
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
        /* (#R35) Same oval fix for the pandemic HUD's circular × (width:28px inline). */
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
        const exitB=document.createElement('button'); exitB.textContent='×'; exitB.title=window.IntMapLang.t(HOST.lang,"Exit","終了","Beenden","Выход","Salir"); exitB.style.cssText='border:none;border-radius:50%;width:30px;height:30px;background:var(--input-bg);color:var(--text-main);font-size:14px;cursor:pointer;'; panel.appendChild(exitB);
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
        gmap=GE().ui.createSubView({container:'pg-guess-map',style:{version:8,sources:{c:{type:'raster',tiles:window.cartoTiles('rastertiles/voyager',{hosts:['a','b']}),tileSize:256,attribution:window.CARTO_ATTRIBUTION}},layers:[{id:'c',type:'raster',source:'c'}]},center:[10,25],zoom:0.35,attributionControl:{compact:true},renderWorldCopies:false});
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
    /* (#R575) The MAP and the CONTROLS live here; the epidemiology lives in js/pandemic-model.js and
       nothing in this file may do arithmetic on a compartment. That split is the point of the round:
       an external audit found six defects that made the old in-closure model contradict itself —
       playback speed changed the epidemic, «immunity 0» produced NaN, «latent 0» and every
       re-importation produced PEOPLE FROM NOTHING, a run ended while a million were still incubating,
       and the printed attack rate FELL whenever immunity waned. None of it was reachable by a test.
       ⚠ `speed` BELONGS TO setTimeout AND TO NOTHING ELSE. It decides how often step() is called.
       It must never reach a probability again — tests/r575-checks.test.mjs ⑬ watches this file for it. */
    /* ⚠ EVERY USER-FACING STRING BELOW IS WRITTEN OUT AS window.IntMapLang.t(HOST.lang, …), and a
       local alias for it would be a defect, not a tidy-up: scripts/i18n-audit.mjs extracts LITERAL
       call sites, so a renamed helper takes its strings out of the census entirely — the total stops
       growing and the missing translations never show as holes (#R548). Measured here: with an alias,
       44 of this round's 45 new strings were invisible to `npm run check:i18n`. */
    const PG_LABELS={
      flu:LA('Influenza','インフルエンザ','Influenza','Грипп','Gripe'),
      covid:LA('COVID-19','COVID-19','COVID-19','COVID-19','COVID-19'),
      sars:LA('SARS','SARS','SARS','ТОРС','SARS'),
      ebola:LA('Ebola','エボラ出血熱','Ebola','Эбола','Ébola'),
      measles:LA('Measles','麻疹','Masern','Корь','Sarampión')
    };
    /* ══ (#R666) THE TWO TABLES THE INTERNATIONAL SPREAD IS WEIGHTED BY ═════════════════════════
       Land borders come from data/country-facts.json (already loaded on demand by
       window.IntMapCountryFacts for the country card) and airport capacity from data/airports.json
       (built by scripts/build-airports.mjs). Both are fetched WHEN THE SIMULATOR OPENS and filled
       into the country rows IN PLACE, so nothing waits: a reader who taps the map before they land
       gets a model weighted by population and distance alone, and `model.mobility.from` says so on
       screen rather than the screen claiming air connectivity it did not get.
       ⚠ THE AIRPORT LOADER IS HERE BECAUSE THIS IS ITS ONLY READER. If a second one appears it
       belongs beside IntMapCountryFacts in js/countries-ui.js, which is the same shape. */
    let _airP=null, _airT=null;
    function loadAirports(){
      if(_airP) return _airP;
      _airP=fetch('data/airports.json').then(r=>{ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
        .then(j=>{ const c=j&&j.countries; if(!c||!Object.keys(c).length) throw new Error('no countries in data/airports.json'); _airT=c; return c; })
        .catch(e=>{ _airP=null; try{ console.error('[IntMap] airport capacity unavailable: '+((e&&e.message)||e)); }catch(_){} return null; });
      return _airP;
    }
    window._pgPandemic=function(){
      if(!GE().hasRenderer()){ try{ imToast('Map not ready'); }catch(_){} return; }
      _pgWeStyle();
      ensureCountries(()=>{
        const allFeats=(window.countryGeo&&window.countryGeo.features)||[]; if(!allFeats.length){ try{ imToast(window.IntMapLang.t(HOST.lang,"Country data unavailable","国境データを読み込めません","Länderdaten nicht verfügbar","Данные по странам недоступны","Datos de países no disponibles")); }catch(_){} return; }
        /* (#R30) hide the mobile bottom-sheet / FABs so the HUD + map aren't covered ("ボタンがボトムシートに隠れる"). */
        try{ document.body.classList.add('pg-sim'); }catch(_){}
        const cs=(typeof countryStats!=='undefined'&&countryStats)||{};
        /* ⚠ (#R666) THE CODE COMES BACK TOO. It was resolved here and thrown away, so the engine
           received five fields per country and no way to look one up in any other table — which is
           why the destination of an importation could only ever be «some index». */
        const resolve=(p)=>{ const c=[p.ISO_A3_EH,p.ISO_A3,p.ADM0_A3,p.SOV_A3].map(String).find(x=>cs[x]); return c?{code:c,s:cs[c]}:null; };
        /* ══ ⚠⚠⚠ (#R675) WHICH OF THESE ROWS IS A PLACE WHERE PEOPLE LIVE ═══════════════════════════
           `window.countryGeo` is Natural Earth admin-0, and admin-0 is not «the countries»: at 10 m
           it is 258 rows, and nine of them — Bir Tawil, Clipperton, Scarborough Reef, the Southern
           Patagonian Ice Field, two banks and a reef — have a population of ZERO. They were being
           simulated anyway, because the row that built the world read
           `(s && s.pop > 0) ? s.pop : 3e6` and handed three million invented people to every row the
           statistics table was silent about. Those people then caught the disease, died of it, and
           closed their borders.
           A population is the denominator of every quantity below it. Where there is no measured
           one, the honest answer is not a nicer default, it is «this is not a compartment set»: the
           row is dropped from the world and the panel says how many were, so the reader is told
           rather than shown a number that quietly excludes them. Natural Earth's own POP_EST is the
           fallback for a row the World Bank table has no entry for — it is a measurement, and the
           rows it puts at zero are the rows nobody lives on. */
        const popOf=(f)=>{ const _r=resolve(f.properties||{}); const s=_r&&_r.s; if(s&&s.pop>0) return s.pop; const pe=+((f.properties||{}).POP_EST); return pe>0?pe:0; };
        const feats=[], dropped=[];
        for(let q=0;q<allFeats.length;q++){ if(popOf(allFeats[q])>0) feats.push(allFeats[q]); else dropped.push(cName(allFeats[q])||'?'); }
        if(!feats.length){ try{ imToast(window.IntMapLang.t(HOST.lang,"Country data unavailable","国境データを読み込めません","Länderdaten nicht verfügbar","Данные по странам недоступны","Datos de países no disponibles")); }catch(_){} return; }
        const N=feats.length, cent=[], bbs=[], pools=[], world=[], home=[];
        feats.forEach((f,i)=>{ const bb=bboxOf(f); bbs[i]=bb; cent[i]=[(bb[0]+bb[2])/2,(bb[1]+bb[3])/2]; const _r=resolve(f.properties||{}); const s=_r&&_r.s;
          const pop=popOf(f);
          /* ⚠ ONE PROXY, FOUR MEANINGS — and the engine keeps them apart from here on. GDP per head
             (or HDI) stands in for medical capacity, travel connectivity, policy capacity and vaccine
             delivery because IntMap has no separate data for the other three yet; js/pandemic-model.js
             stores them as four fields so that the day one of them gets its own source, one formula
             changes instead of every formula. */
          const dev=(s&&s.gdppc)?Math.min(1,Math.max(0.12,s.gdppc/55000)):(s&&s.hdi?s.hdi:0.5);
          const pr=f.properties||{};
          /* ⚠ (#R675) `admin` AND `sov` ARE NATURAL EARTH'S OWN SELF-DESCRIPTION, kept because the
             policy actor is derived from them below: ADMIN is what this row calls itself and
             SOVEREIGNT is the row that administers it, and NE guarantees the second is the ADMIN of
             another row in the same file. Deriving «who governs here» from a map's own topology is
             the alternative to a list of dependency names, which would go stale the first time the
             upstream file changed. */
          world[i]={name:cName(f)||'?', code:(_r&&_r.code)||null, admin:pr.ADMIN||cName(f)||'?', sov:pr.SOVEREIGNT||null, pop, dev, lat:cent[i][1], lng:cent[i][0], borders:null, air:0, capital:null, actor:i}; pools[i]=null;
          /* ⚠ (#R675) THE POLICY BADGE GOES ON THE LABEL POINT, NOT THE BOUNDING-BOX CENTRE. Natural
             Earth's LABEL_X/Y is the point inside the country's main landmass that its own cartography
             puts the name at; the bbox centre of France is in the Atlantic and the bbox centre of
             Norway is in the Norwegian Sea, because both own remote territory (#R426). Falls back to
             the centre only when the label point is not inside this feature's geometry. */
          const lx=+pr.LABEL_X, ly=+pr.LABEL_Y;
          home[i]=(isFinite(lx)&&isFinite(ly)&&pig(lx,ly,f.geometry))?[lx,ly]:cent[i]; });
        /* ══ ⚠⚠⚠ (#R673) THE WORLD IS A SNAPSHOT, AND IT IS CONFIRMED BEFORE THE RUN EXISTS ═══════
           These two tables used to be filled IN PLACE while the panel was already accepting taps,
           and `createPandemicModel` freezes the mobility matrix at construction. So which world you
           got was decided by how fast your network was: tap within the second and the outbreak
           spread by population and distance alone, tap after and it spread by airports and land
           borders, and NOTHING LATER FIXED IT — the tables landed in `world` but the matrix was
           already built. The seed field promises that the same seed is the same run; it could not
           be, because the same seed was not the same world.

           ⚠ THE FIX IS NOT «FILL IT FASTER», IT IS «DECIDE WHAT THE WORLD IS FIRST». Picking is
           closed until both fetches have SETTLED — resolved or failed — and what they settled to is
           recorded per table, so a failure is a stated fact about this run («the airport table did
           not load») and not an unlabelled second world that happens to look like the first.
           ⚠ SETTLED, NOT SUCCEEDED. A dead table must not lock the reader out of the simulator; it
           must be named. `dataState` is what the panel prints and what the run carries. */
        const dataState={ borders:'pending', airports:'pending', policy:'pending' };
        function settle(p,key,fill){
          return Promise.resolve(p).then(t=>{ if(!t) { dataState[key]='failed'; return; }
            let hit=0; for(let i=0;i<N;i++){ const c=world[i].code; const row=c&&t[c]; if(row&&fill(world[i],row)) hit++; }
            dataState[key]=hit?(hit===N?'ok':'partial'):'failed'; })
            .catch(()=>{ dataState[key]='failed'; });
        }
        let worldReady=false, factsT=null;
        const factsP=Promise.resolve((window.IntMapCountryFacts&&window.IntMapCountryFacts.load)?window.IntMapCountryFacts.load():null)
          .then(t=>{ factsT=t||null; return t; }).catch(()=>{ factsT=null; return null; });
        Promise.all([
          settle(factsP,'borders',(w,row)=>{ if(row.capital) w.capital=row.capital; if(row.borders&&row.borders.length){ w.borders=row.borders; return true; } return false; }),
          settle(loadAirports(),'airports',(w,row)=>{ if(row.cap>0){ w.air=row.cap; return true; } return false; })
        ]).then(()=>{ assignActors(); worldReady=true; if(picking&&hud.isConnected&&!model) renderConfig(); });

        /* ══ ⚠⚠⚠ (#R675) WHO ANSWERS FOR EACH ROW — DERIVED, NOT LISTED ═════════════════════════════
           The screenshot that opened this round had 「Antarcticaが国境を封鎖。」 in it, and it was not a
           labelling slip: the engine really was giving a continent with no government a border
           policy, a lockdown, and a traffic multiplier that the importation loop then obeyed.

           Two facts decide it, and each does one job:
             · Natural Earth's SOVEREIGNT — if another SIMULATED row calls itself this row's
               sovereign, this row is under that government. Greenland is under Denmark, Puerto Rico
               under the United States, Macao under China. That is the map's own topology.
             · data/country-facts.json's `capital` — a seat of government. A row nobody administers
               and which the table gives no capital for has no government to ask, so it makes no
               policy and announces none. Antarctica is exactly that row; so are Bir Tawil, the
               Spratlys and the sovereign base areas.
           ⚠ THE CAPITAL TEST IS SECOND, NOT FIRST. Taiwan, Kosovo and Western Sahara all have a
           capital in the table and no simulated row administering them, so they are their own
           actors — which is what the border-policy question is actually about and what a list of
           «UN member states» would have got wrong.
           ⚠ IF THE TABLE DID NOT LOAD, NOBODY IS DEMOTED. `dataState.policy` records that, the panel
           says it, and the run behaves as every run before this one did: each mapped unit its own
           actor. A dead table must name itself rather than silently switch the world off (#R673). */
        /* ⚠ THE RULE ITSELF IS `policyActors` IN js/pandemic-model.js — pure, exported and measured
           by tests/r675-pandemic-checks against the real data/country-facts.json. A rule that only
           existed inside this DOM closure is a rule no test can reach (#R505), and this one decides
           whether a place is allowed to have a government. */
        function assignActors(){
          const a=policyActors(world,!!factsT);
          let none=0, follow=0;
          for(let i=0;i<N;i++){ world[i].actor=a[i]; if(a[i]<0) none++; else if(a[i]!==i) follow++; }
          dataState.policy=factsT?'ok':'failed';
          dataState.policyFollow=follow; dataState.policyNone=none;
        }
        const nm=world.map(c=>c.name);
        /* ⚠ (#R666) DECLARED HERE, NOT BESIDE buildDots' OTHER CONSTANTS — the layer spec below
           reads it during THIS call, and a `const` further down the same function body is in its
           temporal dead zone until then (#R505 shipped exactly that once). */
        const PG_HEAT_Z=3.2;
        /* CASE-DOT layers (no country fill). A soft glow under crisp dots. */
        const PG_LAYERS=['pg-policy-lock','pg-policy-ring','pg-dots','pg-dots-glow','pg-dots-heat'];
        try{ PG_LAYERS.forEach(id=>{ if(GE().layers.has(id)) GE().layers.remove(id); }); ['pg-dots','pg-policy'].forEach(id=>{ if(GE().layers.hasSource(id)) GE().layers.removeSource(id); }); }catch(_){}
        /* ══ ⚠⚠⚠ (#R675) THE RESPONSE IS A STATE OF THE WORLD, SO IT IS DRAWN ON THE WORLD ═══════════
           The only way to find out that Saudi Arabia had shut its border was to read a card that
           said so for five seconds and then deleted itself; a minute later nothing on screen knew.
           A border regime and a lockdown are STATES — they persist, they relax, they come back — and
           a map is the correct instrument for a state. Once they are on the map, the ticker does not
           have to carry them, which is what lets the ticker shrink to the handful of events that
           really are news (see `news` above).
           ⚠ ONE BADGE PER GOVERNMENT, AT ITS LABEL POINT — not a country fill. Refilling every
           polygon would need a second upload of Natural Earth's 10 m geometry (tens of megabytes,
           already in memory once) on top of the case dots this panel is already diffing every
           140 ms; a point layer is ~200 features and costs nothing. It is added BEFORE the dots so
           the cases draw on top of it: the cases are the subject, the policy is the context. */
        try{ GE().layers.addSource('pg-policy',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
          /* Border regime: an open ring whose colour is the state. Screening is yellow, restricted
             orange, «highest level» red — the words the panel uses, in the order it uses them. */
          GE().layers.add({id:'pg-policy-ring',type:'circle',source:'pg-policy',paint:{
            'circle-radius':['interpolate',['linear'],['zoom'],1,5,5,11],
            'circle-color':'rgba(0,0,0,0)',
            'circle-stroke-width':['interpolate',['linear'],['zoom'],1,1.4,5,2.4],
            'circle-stroke-color':['match',['get','b'],1,'#ffd60a',2,'#ff9f0a',3,'#ff3b30','rgba(0,0,0,0)'],
            'circle-stroke-opacity':0.9}});
          /* Lockdown: a filled core whose opacity IS the lockdown's strength, so a country easing
             out of one fades rather than switching off. Blue, because it is a domestic measure and
             must not be mistaken for the red of infection. */
          GE().layers.add({id:'pg-policy-lock',type:'circle',source:'pg-policy',paint:{
            'circle-radius':['interpolate',['linear'],['zoom'],1,2.4,5,5.4],
            'circle-color':'#0a84ff',
            'circle-opacity':['*',['get','k'],0.75],
            'circle-stroke-width':0}});
        }catch(e){ console.warn('pandemic policy layer',e); }
        try{ GE().layers.addSource('pg-dots',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
          /* (#R31) Finer, more UNIFORM dots ("大きさ差を小さく") — small fixed glow + tiny crisp dot.
             (#R575) …and TWO COLOURS, because the map draws E+I while the HUD used to print I: an
             orange dot is somebody incubating, a red one somebody infectious. Same dots, but the
             legend can now name what each one is. */
          const CLS=(inf,exp)=>['case',['==',['get','cls'],0],exp,inf];
          /* ══ ⚠ (#R666) A DENSITY SURFACE UNDER THE DOTS, FOR THE ZOOMS A DOT CANNOT SURVIVE ═══════
             At a whole-globe zoom a 1.6 px dot is smaller than the screen pixel it lands on, so four
             thousand of them read as one flat smear whose brightness says nothing about how many
             cases are where. The heatmap says exactly that, and it is ADDED UNDER the dots rather
             than swapped for them: the HUD's 「1 dot ≈ N」 legend has to go on being true, which it
             cannot be at a zoom where the dots are not drawn. Above PG_HEAT_Z it fades out and the
             individual dots are legible on their own.
             ⚠ SAME SOURCE, SAME FEATURES. It is a second reading of `pg-dots`, not a second upload. */
          GE().layers.add({id:'pg-dots-heat',type:'heatmap',source:'pg-dots',maxzoom:PG_HEAT_Z,paint:{
            'heatmap-weight':0.6,
            'heatmap-intensity':['interpolate',['linear'],['zoom'],0,0.7,PG_HEAT_Z,1.2],
            'heatmap-radius':['interpolate',['linear'],['zoom'],0,12,PG_HEAT_Z,30],
            'heatmap-opacity':['interpolate',['linear'],['zoom'],PG_HEAT_Z-1.2,0.75,PG_HEAT_Z,0],
            'heatmap-color':['interpolate',['linear'],['heatmap-density'],0,'rgba(0,0,0,0)',0.15,'rgba(255,159,10,0.55)',0.45,'#ff3b30',1,'#7a0010']}});
          GE().layers.add({id:'pg-dots-glow',type:'circle',source:'pg-dots',paint:{'circle-radius':['interpolate',['linear'],['zoom'],1,2.6,5,5],'circle-color':CLS(['interpolate',['linear'],['get','sev'],0,'#ff5a3c',1,'#7a0010'],'#ff9f0a'),'circle-blur':0.9,'circle-opacity':0.28}});
          GE().layers.add({id:'pg-dots',type:'circle',source:'pg-dots',paint:{'circle-radius':['interpolate',['linear'],['zoom'],1,1.6,5,2.9],'circle-color':CLS(['interpolate',['linear'],['get','sev'],0,'#ff3b30',0.5,'#e01010',1,'#7a0010'],'#ff9f0a'),'circle-stroke-color':'rgba(255,255,255,0.45)','circle-stroke-width':0.25,'circle-opacity':0.95}});
        }catch(e){ console.warn('pandemic dots',e); }
        /* (#R31) Place case dots on REAL places — the capital + gazetteer cities inside the country —
           then jittered clusters around them ("感染者単位で実際の場所に置いて"). Falls back to random
           in-polygon points only when no city is known for that country.
           (#R575) …and the jitter is CHECKED. It never was, so a coastal or border city scattered
           cases into the sea and into the neighbour — see scatterCases() in js/pandemic-model.js. */
        function genPts(i,n){ const f=feats[i], bb=bbs[i]; const span=Math.min(2.0,Math.max(0.1,Math.max(bb[2]-bb[0],bb[3]-bb[1])*0.09)); const anchors=[];
          const inside=(lng,lat)=>pig(lng,lat,f.geometry);
          /* ⚠ (#R673) `resolve()` RETURNS `{code, s}`, NOT THE STATS ROW. #R666 changed it to carry the
             ISO code back and this call site kept reading `.latlng` off the WRAPPER, which is
             `undefined` — so the country's own label point (Natural Earth LABEL_X/Y, the anchor
             inside its main landmass) has been silently absent from the anchor list ever since. It
             did not fail loudly because the gazetteer sweep below usually finds cities, so the dots
             landed somewhere plausible and nobody could see the anchor that was missing. */
          try{ const _r=resolve(f.properties||{}); const _s=_r&&_r.s; if(_s&&_s.latlng){ const cl=[_s.latlng[1],_s.latlng[0]]; if(inside(cl[0],cl[1])) anchors.push(cl); } }catch(_){}
          try{ const gz=(typeof HOST.geoDB!=='undefined'&&HOST.geoDB)||window.geoDB||[]; for(let q=0;q<gz.length && anchors.length<64;q++){ const c=gz[q]&&gz[q].loc; if(!c) continue; if(c[0]<bb[0]||c[0]>bb[2]||c[1]<bb[1]||c[1]>bb[3]) continue; if(inside(c[0],c[1])) anchors.push([c[0],c[1]]); } }catch(_){}
          if(anchors.length) return scatterCases(n,anchors,span,Math.random,inside);
          const out=[]; let tries=0; while(out.length<n && tries<n*16){ tries++; const lng=bb[0]+Math.random()*(bb[2]-bb[0]), lat=bb[1]+Math.random()*(bb[3]-bb[1]); if(inside(lng,lat)) out.push([lng,lat]); }
          /* ⚠ NOT the bbox centre: for a crescent, an archipelago or a country with overseas
             territory that point is in the sea or in somebody else. If no point inside the polygon
             could be found at all, this country draws nothing rather than drawing a lie. */
          return out; }

        /* ── the run's settings. The engine is built when patient zero is placed, from exactly these. */
        let presetKey='covid', scenario='naive', advanced=false;
        let cfg=freshParams('covid','naive');
        let runSeed=(Date.now()^Math.floor(Math.random()*1e9))>>>0;
        function freshParams(key,mode){ const pr=PANDEMIC_PRESETS[key]; return {
          scenario:mode, r0:pr.transmission.r0, latentDays:pr.transmission.latentDays,
          infectiousDays:pr.transmission.infectiousDays, baseFatality:pr.severity.value,
          /* ⚠ (#R673) THE DURATION AND THE «FOREVER» ARE TWO FIELDS. `lifelong ? 600 : months` put
             a sentinel in a numeric field and js/pandemic-model.js decoded it — see U2 there. */
          naturalImmunityMonths:pr.immunity.naturalMonths, naturalImmunityLifelong:!!pr.immunity.lifelong,
          seasonality:pr.transmission.seasonality, startDayOfYear:1, initialCases:100,
          initialImmunity:mode==='real-world'?(pr.baselineImmunity||0):0,
          mobility:1, interventions:'adaptive', vaccineAtStart:mode==='real-world'&&!!pr.vaccine.availableAtStart
        }; }

        let model=null, day=0, timer=null, running=false, speed=2, picking=true, lastDots=0, lastEvt='', perDotNow=0;
        function preset(){ return PANDEMIC_PRESETS[presetKey]; }

        /* ══ ⚠⚠⚠ (#R675) THE MAP IS THE THING THE READER CAME FOR, AND THE TICKER WAS COVERING IT ═══
           `news()` used to call `pgNews()` for EVERY event, and `pgNews()` appends to a column in
           the middle of the top of the screen that holds each card for 5.2 s. The number of policy
           events per day is roughly the number of governments reacting to their own prevalence, so
           the stack grew with the epidemic: the moment the map had most to show — a hundred
           countries changing state at once — was the moment it was most covered. Measured on the
           screenshot this round started from: twelve cards, every one of them a border or a
           lockdown, stacked over the world.
           ⚠ THE FIX IS NOT «SHORTER CARDS» OR «FEWER OF THEM». It is that two different kinds of
           thing were using one channel. A world event (a vaccine exists; a variant is named; the
           emergency threshold is passed) happens a handful of times per run and changes the rules
           everyone is under — that is worth interrupting for, ONE AT A TIME. A government reacting
           is a LIST, and a list belongs in a list: it goes to the feed, the map shows the resulting
           STATE (see the policy layer below), and the reader opens the list when they want the
           words. `eventTier` in js/pandemic-model.js decides which is which, beside the emitters.
           ⚠ ONE TOAST AT A TIME, ENFORCED BY REMOVING THE LAST ONE. The cards this panel raised are
           tagged, so clearing them cannot take down another tool's toast. */
        const feed=[]; let feedUnread=0, feedOpen=false;
        function majorToast(text,kind){
          try{ const host=document.getElementById('pg-news-host');
            if(host) Array.prototype.slice.call(host.children).forEach(n=>{ if(n.dataset&&n.dataset.pgPan) n.remove(); });
            pgNews(text,kind);
            const host2=document.getElementById('pg-news-host');
            const last=host2&&host2.lastElementChild; if(last&&last.dataset) last.dataset.pgPan='1';
          }catch(_){}
        }
        function news(text,kind,tier,scope){
          lastEvt=text;
          feed.push({day:day,text:text,kind:kind||'info',world:scope==='world'});
          /* The feed is the run's own record and a run is at most MAX_DAYS long, so it is bounded by
             the run rather than by a ring buffer — but a pandemic in which every government moves
             every day is thousands of lines, and the drawer only ever draws the newest slice. */
          if(tier==='major') majorToast(text,kind);
          if(!feedOpen) feedUnread++;
          const el=hud&&hud.querySelector('#pg-evt'); if(el) el.textContent=text;
          renderFeedBadge(); if(feedOpen) renderFeedList();
        }

        /* Events come out of the engine as data ({t:'variant', c:12, …}); the words are made here, in
           nine languages, because a model that spoke English would have to be translated to be read. */
        /* ⚠ (#R675) EVERY SENTENCE BELOW IS A LITERAL `t()` CALL WITH A `{c}` HOLE, not a
           `jp() ? ja : en` ternary. Five of these were two-language ternaries, which means fr, ko,
           zh, zh-Hans and es readers were shown English — and `check:i18n` could not see it, because
           a ternary is not a call site it extracts (#R548, #R667). The country name is substituted
           after the lookup so the KEY stays literal. */
        function announce(e){
          /* ⚠ (#R675) THE SAFE DEFAULT IS WRITTEN HERE, WHERE IT CAN BE SEEN. `eventKind` answers `null`
             for a kind the vocabulary does not declare; falling back to `routine` rather than `major`
             is the asymmetric choice — an undeclared event costs one line of a list, never the map. */
          const K=eventKind(e.t)||{tier:'routine',scope:'country'}, T=K.tier, SC=K.scope;
          const who=(e.c>=0&&nm[e.c])?nm[e.c]:window.IntMapLang.t(HOST.lang,'a leading lab','ある研究機関','einem führenden Labor','ведущей лаборатории','un laboratorio destacado');
          const sub=(s)=>s.replace('{c}',who);
          if(e.t==='vaccine') return news(sub(window.IntMapLang.t(HOST.lang,"{c} approves a vaccine — rollout begins.","{c}がワクチンを承認。接種が始まります。","{c} lässt einen Impfstoff zu — die Impfkampagne beginnt.","{c} одобряет вакцину — начинается вакцинация.","{c} aprueba una vacuna: comienza la campaña.")),'good',T,SC);
          if(e.t==='variant'){ const gl=String.fromCharCode(944+e.n);
            const base=e.moreTransmissible
              ? window.IntMapLang.t(HOST.lang,"New variant ({g}) detected in {c} — more transmissible. It is only there, for now.","新変異株（{g}）を{c}で確認。感染力が上昇。——まだその国だけ。","Neue Variante ({g}) in {c} nachgewiesen — übertragbarer. Vorerst nur dort.","Новый вариант ({g}) обнаружен в {c} — более заразный. Пока только там.","Nueva variante ({g}) detectada en {c}: más transmisible. Por ahora solo allí.")
              : window.IntMapLang.t(HOST.lang,"New variant ({g}) detected in {c}. It is only there, for now.","新変異株（{g}）を{c}で確認。——まだその国だけ。","Neue Variante ({g}) in {c} nachgewiesen. Vorerst nur dort.","Новый вариант ({g}) обнаружен в {c}. Пока только там.","Nueva variante ({g}) detectada en {c}. Por ahora solo allí.");
            return news(sub(base).replace('{g}',gl),'alert',T,SC); }
          if(e.t==='border') return news(sub(window.IntMapLang.t(HOST.lang,"{c} raises entry restrictions to their highest level.","{c}が入国規制を最高レベルに引き上げ。","{c} hebt die Einreisebeschränkungen auf die höchste Stufe an.","{c} вводит максимальные ограничения на въезд.","{c} eleva las restricciones de entrada a su nivel máximo.")),'info',T,SC);
          if(e.t==='reopen') return news(sub(window.IntMapLang.t(HOST.lang,"{c} lifts its entry restrictions.","{c}が入国規制を解除。","{c} hebt seine Einreisebeschränkungen auf.","{c} снимает ограничения на въезд.","{c} levanta sus restricciones de entrada.")),'info',T,SC);
          if(e.t==='lockdown') return news(sub(window.IntMapLang.t(HOST.lang,"{c} enters lockdown.","{c}がロックダウンを発令。","{c} verhängt einen Lockdown.","{c} вводит локдаун.","{c} entra en confinamiento.")),'info',T,SC);
          if(e.t==='tenCountries') return news(window.IntMapLang.t(HOST.lang,"Outbreak has reached 10 countries and territories.","感染が10の国・地域に拡大。","Der Ausbruch hat 10 Länder und Gebiete erreicht.","Вспышка достигла 10 стран и территорий.","El brote ha llegado a 10 países y territorios."),'alert',T,SC);
          /* ⚠ NOT «WHO declares a PHEIC». Under the IHR that is a judgement by the Director-General
             on the advice of an Emergency Committee — never a case count — and the old code declared
             one at exactly 3,000,000 cases. This is the simulation's own threshold, and it says so. */
          if(e.t==='emergency') return news(window.IntMapLang.t(HOST.lang,"Global health emergency threshold reached — international spread is sustained.","国際的な警戒レベルに到達 — 各国への拡大が継続しています。","Schwelle für einen globalen Gesundheitsnotstand erreicht — die internationale Ausbreitung hält an.","Достигнут порог глобальной чрезвычайной ситуации — международное распространение продолжается.","Se alcanza el umbral de emergencia sanitaria mundial: la propagación internacional se mantiene."),'alert',T,SC);
          if(e.t==='treatment') return news(window.IntMapLang.t(HOST.lang,"An effective treatment is found — fatality rate falls.","有効な治療法が確立。致死率が低下します。","Eine wirksame Behandlung wird gefunden — die Sterblichkeit sinkt.","Найдено эффективное лечение — летальность снижается.","Se encuentra un tratamiento eficaz: la letalidad cae."),'good',T,SC);
          if(e.t==='deaths') return news(e.n>=1e7
            ? window.IntMapLang.t(HOST.lang,"Global death toll passes 10 million.","世界の死者が1000万人を突破。","Die weltweite Zahl der Todesopfer übersteigt 10 Millionen.","Число погибших в мире превысило 10 миллионов.","El número global de muertes supera los 10 millones.")
            : window.IntMapLang.t(HOST.lang,"Global death toll passes 1 million.","世界の死者が100万人を突破。","Die weltweite Zahl der Todesopfer übersteigt 1 Million.","Число погибших в мире превысило 1 миллион.","El número global de muertes supera el millón."),'alert',T,SC);
          if(e.t==='end') return endRun(e.kind);
        }
        function endRun(kind){
          const T=model.totals(); buildDots(); buildPolicy(); stop();
          const attack=T.worldPop?(T.cumInf/T.worldPop*100):0;
          if(kind==='contained') news(jp()?('封じ込め成功 — 死者'+fmt(T.D)+'。世界的流行には至りませんでした。'):('Contained — '+fmt(T.D)+' deaths; it never became a pandemic.'),'good','major','world');
          else if(kind==='endemic') news(jp()?('3年経過 — 流行は続いています。累計死者'+fmt(T.D)+'。'):('Three years on, it is still circulating — '+fmt(T.D)+' cumulative deaths.'),'info','major','world');
          else { const verdict=attack<5?window.IntMapLang.t(HOST.lang,"a minor outbreak","小規模な流行で終息","ein kleinerer Ausbruch","небольшая вспышка","un brote menor"):attack<25?window.IntMapLang.t(HOST.lang,"the outbreak has ended","流行は終息","der Ausbruch ist vorbei","вспышка закончилась","el brote ha terminado"):window.IntMapLang.t(HOST.lang,"a devastating pandemic, now over","壊滅的な大流行を経て終息","eine verheerende Pandemie, jetzt vorbei","разрушительная пандемия, теперь завершившаяся","una pandemia devastadora, ya terminada");
            news(jp()?(verdict+' — 累計死者'+fmt(T.D)+'（延べ感染は世界人口の'+attack.toFixed(1)+'%）。'):('It was '+verdict+' — '+fmt(T.D)+' deaths; infections totalled '+attack.toFixed(1)+'% of world population.'),attack<25?'good':'alert','major','world'); }
          renderRun(true);
        }
        function tick(){ if(!model) return; const ev=model.step(); day=model.day; for(let k=0;k<ev.length;k++) announce(ev[k]);
          const now=Date.now(); if(now-lastDots>140||model.ended){ lastDots=now; buildDots(); buildPolicy(); } updateHud(); }

        /* (#R32) Dots scale with the ACTUAL case count ("感染者の人数単位で") — each dot ≈ `perDot`
           active cases, allocated per country up to a global budget (perf), placed on REAL cities.
           (#R575) …and `perDot` is now PRINTED, because it moves: at the start one dot is 60 cases
           and in a full pandemic it is thousands, and a reader who is not told cannot read the map. */
        /* ══ ⚠⚠⚠ (#R666) 「1 dot ≈ N」 HAS TO BE TRUE OF EVERY DOT, NOT OF THE FIRST EIGHTY ═════════
           There was a per-country ceiling of 80 dots on top of a GLOBAL dots-per-case rate, and the
           two contradict each other the moment one country holds most of the world's cases: at
           480 000 active cases in one country `perDot` is 100, the country needs 4 800 dots, it drew
           80 — a reader counting dots against the legend the HUD prints beside them was out by a
           factor of sixty. The ceiling is now the GLOBAL one that `perDot` is derived from, so the
           product of the two is the truth by construction. The point pool grows to match, by
           APPENDING (a regenerated pool would make every existing dot jump).
           ⚠ AND EVERY DOT NOW HAS AN IDENTITY: country × cap + slot, which is stable because slot d
           is always the same place. That is what lets the day's change go to the source as a change
           — `{add,remove}` → `GeoJSONSource.updateData`, re-tiling only what moved — instead of
           re-uploading four thousand points for the handful that changed colour. `data` is still the
           whole truth, so an engine that cannot diff falls back to it (js/geo-engine.js). The
           general form of this is js/world-packs.js `uploadShown`; this is the trivial case of it,
           because here identity is an index rather than something that has to be hashed.
           ⚠ `sev` IS ROUNDED TO A TWENTIETH before it becomes part of the signature. Un-rounded it
           drifts in the tenth decimal every single day and every dot counts as changed, which is the
           whole-collection upload wearing a diff's clothes. */
        const PG_POOL_STEP=80, PG_DOTCAP=4800, PG_CASES_PER_DOT=60;
        const PG_RESYNC=40, PG_DIFF_FRAC=0.35, PG_DIFF_MIN=64;
        let dotSig=null, dotDiffRun=0;
        function poolFor(i,need){
          const have=pools[i]||(pools[i]=[]);
          if(have.length>=need||have.length>=PG_DOTCAP) return have;
          const more=genPts(i,Math.min(PG_DOTCAP,Math.max(PG_POOL_STEP,need))-have.length);
          for(let q=0;q<more.length;q++) have.push(more[q]);
          return have; }
        function buildDots(){ if(!model) return; let totAct=0; for(let i=0;i<N;i++){ const a=model.active(i); if(a.seeded) totAct+=a.E+a.I; }
          const perDot=Math.max(PG_CASES_PER_DOT, totAct/PG_DOTCAP); perDotNow=perDot; const out=[]; const next=new Map();
          /* ══ ⚠⚠⚠ (#R673) THIS LAYER DRAWS PEOPLE WHO ARE ILL NOW, SO THE DEAD CANNOT KEEP IT ALIVE ══
             The gate was `if (act < 1 && a.D < 1) continue`, and the floor below it was
             `if (k < 1 && (act >= 1 || a.D > 0)) k = 1`. A country at E = 0, I = 0, D = 100 — an
             outbreak that is OVER, everyone recovered or dead — passed both: it drew one dot, and
             because `kE` is 0 when `act` is 0 that dot was RED, which the legend beside it defines
             as «infectious». The map went on reporting current cases in a country that had none,
             for the rest of the run, and the number it contradicted was its own HUD.
             Cumulative deaths are a different quantity and belong to a different layer; they are
             still what `sev` DARKENS a live dot by, which is a property of the outbreak there. */
          /* ⚠ (#R673) THE COUNT AND THE SIGNATURE ARE `caseDotPlan` / `dotSignature` IN
             js/pandemic-model.js — pure, exported, and measured by tests/r673-checks. They lived
             here, which is why an audit found both of their defects and no test did (#R505). */
          for(let i=0;i<N;i++){ const plan=caseDotPlan(model.active(i),perDot,PG_DOTCAP); if(!plan) continue;
            const pool=poolFor(i,plan.k); if(!pool.length) continue;
            for(let d=0; d<plan.k && d<pool.length; d++){ const cls=d<plan.kE?0:1, id=i*PG_DOTCAP+d;
              out.push({type:'Feature',id,geometry:{type:'Point',coordinates:pool[d]},properties:{sev:plan.sev,cls}});
              next.set(id,dotSignature(cls,plan.sevIdx)); } }
          let diff=null;
          if(dotSig&&dotDiffRun<PG_RESYNC){
            const add=[], remove=[]; const room=Math.max(PG_DIFF_MIN,Math.floor(next.size*PG_DIFF_FRAC));
            for(let q=0;q<out.length;q++){ const f=out[q]; const was=dotSig.get(f.id); if(was===undefined||was!==next.get(f.id)) add.push(f); }
            dotSig.forEach((_v,id)=>{ if(!next.has(id)) remove.push(id); });
            if(add.length+remove.length<=room) diff={add:add,remove:remove}; }
          dotDiffRun=diff?dotDiffRun+1:0; dotSig=next;
          try{ GE().layers.setSourceData('pg-dots',{type:'FeatureCollection',features:out},diff?{diffable:true,diff:diff}:{diffable:true}); }catch(_){} }
        /* ⚠ (#R675) THE BADGES ARE REBUILT ONLY WHEN THE POLICY MAP HAS ACTUALLY CHANGED. Border
           states are integers and lockdowns move in steps of 0.08/0.04, so a signature over them is
           exact rather than a tolerance — and on most days of a run it is unchanged, which is why
           this can run beside a dot diff without competing with it. It reads `border`, `lock` and
           `actor` off the engine's own rows; it does no arithmetic on a compartment (#R575). */
        let policySig='';
        function buildPolicy(){ if(!model) return; const rows=model.countries; const out=[]; let sig='';
          for(let i=0;i<N;i++){ const s=rows[i]; if(!s||s.actor!==i) continue;
            const b=s.border|0, k=Math.round(s.lock*100)/100;
            if(b<=0&&k<=0.02) continue;
            const p=home[i]; if(!p) continue;
            sig+=i+':'+b+':'+k+';';
            out.push({type:'Feature',id:i,geometry:{type:'Point',coordinates:p},properties:{b:b,k:k}}); }
          if(sig===policySig) return; policySig=sig;
          try{ GE().layers.setSourceData('pg-policy',{type:'FeatureCollection',features:out}); }catch(_){} }
        /* ⚠ THE ONLY THING `speed` TOUCHES. */
        function loop(){ clearTimeout(timer); if(!running) return; tick(); if(model&&model.ended){ running=false; return; } if(running) timer=setTimeout(loop, Math.max(70,440/speed)); }
        function start(){ if(running||!model||model.ended) return; running=true; loop(); }
        function stop(){ running=false; clearTimeout(timer); }

        const hud=document.createElement('div'); hud.id='pg-pan-hud';
        hud.style.cssText='position:fixed;left:50%;transform:translateX(-50%);bottom:max(18px,env(safe-area-inset-bottom));z-index:5810;width:min(540px,94vw);box-sizing:border-box;background:var(--popup-bg);color:var(--text-main);border:1px solid var(--glass-border,rgba(128,128,128,0.25));border-radius:16px;box-shadow:var(--shadow);backdrop-filter:blur(14px);padding:12px 14px;font-size:12.5px;max-height:70dvh;overflow-y:auto;';
        (document.getElementById('map-container')||document.body).appendChild(hud);
        function fmt(n){ n=Math.round(n); if(n>=1e9)return (n/1e9).toFixed(2)+'B'; if(n>=1e6)return (n/1e6).toFixed(2)+'M'; if(n>=1e3)return (n/1e3).toFixed(1)+'k'; return ''+n; }
        function grp(n){ try{ return Math.round(n).toLocaleString(window.IntMapLang.htmlLang?window.IntMapLang.htmlLang(HOST.lang):undefined); }catch(_){ return fmt(n); } }
        /* ══ ⚠⚠⚠ (#R675) FOUR GROUPS, BECAUSE THERE ARE FOUR QUESTIONS ═════════════════════════════
           The HUD was one run-on sentence of nine numbers separated by interpuncts, and a reader
           looking for «is the response working» had to find 「ロックダウン」 somewhere between a death
           toll and a dot legend. They are grouped now — how bad is it / how far has it got / what is
           being done / when — and the group labels are what make the numbers findable. Nothing was
           removed; two numbers were added (governments restricting entry, governments in lockdown),
           which is the point of drawing the response on the map: the map shows WHERE, the HUD shows
           HOW MANY. */
        function statGroup(label,html){
          return '<div style="display:flex;gap:8px;align-items:baseline;margin:1px 0;">'
            +'<span style="flex:0 0 52px;font-size:9.5px;letter-spacing:0.05em;text-transform:uppercase;color:var(--text-muted);font-weight:700;">'+label+'</span>'
            +'<span style="flex:1;">'+html+'</span></div>';
        }
        function updateHud(){ const el=hud.querySelector('#pg-pan-stats'); if(!el||!model) return; const T=model.totals();
          const vpct=T.worldPop?Math.round(T.V/T.worldPop*100):0, attack=T.worldPop?(T.cumInf/T.worldPop*100):0;
          /* ══ ⚠⚠⚠ (#R673) EVERY ONE OF THESE FOUR NAMED SOMETHING IT WAS NOT ═══════════════════════
             · «Incubating» for E. Incubation is infection→SYMPTOMS; E is infection→INFECTIOUS, and
               for influenza and COVID-19 they are deliberately different in this very model (the
               setup panel says so beside the slider). E is «infected, not yet infectious».
             · «Vaccinated» for V/pop. `V` is the people a dose is PROTECTING RIGHT NOW. It falls
               when protection wanes, when a variant escapes it and when a vaccinated person is
               infected anyway, so printing it as «% vaccinated» makes a rising campaign look like
               people being un-vaccinated. `SV` — reached and not protected — is not in it at all.
               The engine keeps no dose ledger, so the honest label is the one for what V IS.
             · «Countries» for `affected`. That is countries with cases RIGHT NOW; it goes down.
             · «Infectious» is a count of PEOPLE, so it reads as a noun phrase.
             ⚠ (#R675) AND «COUNTRIES» IS NOW «COUNTRIES AND TERRITORIES». The rows are Natural Earth
             admin-0 units — Greenland, Puerto Rico, New Caledonia and Western Sahara are among them
             — so 「国」 was never true of the count it labelled. */
          el.innerHTML=
            statGroup(window.IntMapLang.t(HOST.lang,"Disease","感染","Krankheit","Болезнь","Enfermedad"),
              '<span style="color:#f03b20;">'+window.IntMapLang.t(HOST.lang,"Infectious now","感染性あり","Jetzt ansteckend","Заразны сейчас","Contagiosos ahora")+' <b>'+fmt(T.I)+'</b></span> · '+
              '<span style="color:#ff9f0a;">'+window.IntMapLang.t(HOST.lang,"Infected, not yet infectious","感染済み・未感染性","Infiziert, noch nicht ansteckend","Заражены, ещё не заразны","Infectados, aún no contagiosos")+' <b>'+fmt(T.E)+'</b></span> · '+
              '<span style="color:#7a0010;">'+window.IntMapLang.t(HOST.lang,"Dead","死亡","Tote","Умерло","Fallecidos")+' <b>'+fmt(T.D)+'</b></span>')
            +statGroup(window.IntMapLang.t(HOST.lang,"Spread","拡大","Ausbreitung","Распространение","Propagación"),
              window.IntMapLang.t(HOST.lang,"Countries and territories with cases now","現在流行中の国・地域","Länder und Gebiete mit aktuellen Fällen","Страны и территории со случаями сейчас","Países y territorios con casos ahora")+' <b>'+T.affected+'</b> · '+
              window.IntMapLang.t(HOST.lang,"ever reached","到達済み","je erreicht","затронуто всего","alcanzados en total")+' <b>'+T.reached+'</b>'+
              /* ⚠ CUMULATIVE INFECTION EVENTS, AND THE LABEL SAYS SO. Reinfections count again, so this
                 is not «the share of people who have ever been infected» and must not be printed as one. */
              ' · '+window.IntMapLang.t(HOST.lang,"cumulative infections","延べ感染","kumulierte Infektionen","суммарно заражений","infecciones acumuladas")+' <b>'+attack.toFixed(1)+'%</b>'+
              (T.variants?' · '+window.IntMapLang.t(HOST.lang,"variants","変異株","Varianten","варианты","variantes")+' <b>'+T.variants+'</b>':''))
            +statGroup(window.IntMapLang.t(HOST.lang,"Response","対応","Reaktion","Меры","Respuesta"),
              '<span style="color:#0a84ff;">'+window.IntMapLang.t(HOST.lang,"Protected by vaccine now","ワクチンで防御中","Derzeit durch Impfung geschützt","Сейчас защищены вакциной","Protegidos por vacuna ahora")+' <b>'+vpct+'%</b></span>'+
              (T.vaccine?'':(model.vaccineProgress()>0?' · '+window.IntMapLang.t(HOST.lang,"vaccine R&D","ワクチン開発","Impfstoffentwicklung","разработка вакцины","I+D de vacunas")+' <b>'+Math.round(model.vaccineProgress()*100)+'%</b>':''))+
              /* ⚠ (#R675) COUNTED IN GOVERNMENTS. `totals()` counts only rows that decide for
                 themselves, so a dependency carrying its sovereign's lockdown is not a second one. */
              ' · <span style="color:#ff9f0a;">'+window.IntMapLang.t(HOST.lang,"governments restricting entry","入国規制中の政府","Regierungen mit Einreisebeschränkungen","правительств с ограничениями на въезд","gobiernos con restricciones de entrada")+' <b>'+T.restricted+'</b></span>'+
              ' · <span style="color:#0a84ff;">'+window.IntMapLang.t(HOST.lang,"in lockdown","ロックダウン中","im Lockdown","в локдауне","en confinamiento")+' <b>'+T.locked+'</b></span>'+
              (T.treatment?' · '+window.IntMapLang.t(HOST.lang,"treatment available","治療法あり","Behandlung verfügbar","есть лечение","tratamiento disponible"):''))
            +statGroup(window.IntMapLang.t(HOST.lang,"Time","時間","Zeit","Время","Tiempo"),
              window.IntMapLang.t(HOST.lang,"Day","経過","Tag","День","Día")+' <b>'+day+'</b>')
            +'<div style="color:var(--text-muted);font-size:10.5px;margin-top:3px;">'+window.IntMapLang.t(HOST.lang,"1 dot ≈ ","1点 ≈ ","1 Punkt ≈ ","1 точка ≈ ","1 punto ≈ ")+grp(perDotNow)+' '+
            /* ⚠ (#R673) THE LEGEND HAS TO USE THE SAME WORDS AS THE COUNTERS ABOVE IT. It said «orange =
               incubating» while the counter three lines up now says «infected, not yet infectious» —
               the same compartment, two names, on the same panel. Incubation is infection→SYMPTOMS. */
              window.IntMapLang.t(HOST.lang,"active cases · red = infectious, orange = infected but not yet infectious","人の現感染者 · 赤=感染性あり、橙=感染済みで未感染性","aktive Fälle · rot = ansteckend, orange = infiziert, aber noch nicht ansteckend","активных случаев · красный — заразные, оранжевый — заражены, но ещё не заразны","casos activos · rojo = contagiosos, naranja = infectados pero aún no contagiosos")+
            /* ⚠ THE POLICY BADGES NEED A KEY TOO, or a reader sees rings appear and cannot read them. */
            '<br>'+window.IntMapLang.t(HOST.lang,"ring = entry restrictions (yellow → orange → red), blue core = lockdown","リング=入国規制（黄→橙→赤）、青い芯=ロックダウン","Ring = Einreisebeschränkungen (gelb → orange → rot), blauer Kern = Lockdown","кольцо — ограничения на въезд (жёлтый → оранжевый → красный), синяя сердцевина — локдаун","anillo = restricciones de entrada (amarillo → naranja → rojo), núcleo azul = confinamiento")+'</div>';
          renderChart(); renderInspect(); }

        /* ══ (#R675) THE EVENT FEED — WHERE EVERY GOVERNMENT'S DECISION GOES ═══════════════════════
           The badge is the whole of its job when it is closed: a reader who does not open it is told
           HOW MUCH THEY ARE NOT READING, which a stack of cards that deletes itself never was. */
        function renderFeedBadge(){ const b=hud&&hud.querySelector('#pg-feed-btn'); if(!b) return;
          b.textContent='🗒 '+(feedUnread>0?('+'+feedUnread):String(feed.length));
          b.style.background=feedUnread>0?'var(--primary-color)':'var(--input-bg)';
          b.style.color=feedUnread>0?'#fff':'var(--text-main)'; }
        const FEED_SHOWN=120;
        function renderFeedList(){ const box=hud&&hud.querySelector('#pg-feed'); if(!box) return;
          box.innerHTML=''; if(!feedOpen){ box.style.display='none'; return; }
          box.style.display='block';
          const h=document.createElement('div'); h.style.cssText='font-size:10px;font-weight:700;color:var(--text-muted);margin-bottom:4px;display:flex;gap:8px;';
          h.innerHTML='<span style="flex:0 0 34px;text-align:right;">'+window.IntMapLang.t(HOST.lang,"Day","経過","Tag","День","Día")+'</span><span style="flex:1;">'+window.IntMapLang.t(HOST.lang,"Events in this run","このランの出来事","Ereignisse in diesem Lauf","События этого прогона","Eventos de esta simulación")+' ('+feed.length+')</span>';
          box.appendChild(h);
          const list=document.createElement('div'); list.style.cssText='max-height:150px;overflow-y:auto;font-size:11px;line-height:1.45;-webkit-overflow-scrolling:touch;';
          const from=Math.max(0,feed.length-FEED_SHOWN);
          for(let q=feed.length-1;q>=from;q--){ const e=feed[q];
            /* ⚠ (#R675) THE HANDFUL THAT CHANGED THE RULES ARE MARKED. In a full pandemic this list
               is hundreds of lines of one government after another, and the four or five entries a
               reader is actually looking for — a vaccine exists, a variant was named, the emergency
               threshold was passed — are the world-scoped ones. `eventScope` is what says which,
               and it is the same table `eventTier` used to decide they were worth interrupting for. */
            const r=document.createElement('div'); r.style.cssText='display:flex;gap:8px;padding:2px 0;'+(e.world?'border-left:2px solid var(--primary-color);margin-left:-6px;padding-left:4px;':'');
            const d=document.createElement('b'); d.textContent=String(e.day); d.style.cssText='flex:0 0 34px;color:var(--text-muted);font-weight:600;text-align:right;';
            const t=document.createElement('span'); t.textContent=e.text; t.style.cssText='flex:1;color:'+(e.kind==='alert'?'#ff453a':e.kind==='good'?'#34c759':'var(--text-main)')+';';
            r.appendChild(d); r.appendChild(t); list.appendChild(r); }
          if(from>0){ const m=document.createElement('div'); m.style.cssText='font-size:10px;color:var(--text-muted);padding-top:4px;';
            m.textContent=window.IntMapLang.t(HOST.lang,"Older entries are not shown.","これより古い記録は表示していません。","Ältere Einträge werden nicht angezeigt.","Более ранние записи не показаны.","No se muestran las entradas más antiguas."); list.appendChild(m); }
          box.appendChild(list); }

        /* ══ ⚠⚠⚠ (#R675) THE TIME AXIS ════════════════════════════════════════════════════════════
           「延べ感染 6.4%」 does not say whether this is a wave on the way up or one that is over, and
           the panel had no other way to tell the reader which. The series is the ENGINE's
           (`model.history()`), not one accumulated up here: `tick()` is a setTimeout and drops days
           under load, so a UI-side series would be a chart of how busy the browser was. */
        function renderChart(){ const box=hud&&hud.querySelector('#pg-chart'); if(!box||!model) return;
          const h=model.history(); if(h.length<3){ box.innerHTML=''; return; }
          const inf=[], ded=[]; let mi=0, md=0, pkDay=0;
          for(let q=0;q<h.length;q++){ const a=h[q].newInf, b=h[q].newDead; inf.push(a); ded.push(b); if(a>mi){ mi=a; pkDay=h[q].day; } if(b>md) md=b; }
          const W=280, H1=34, H2=12, GAP=5;
          const p1=chartPoints(inf,W,H1,mi), p2=chartPoints(ded,W,H2,md);
          box.innerHTML='<svg viewBox="0 0 '+W+' '+(H1+GAP+H2)+'" preserveAspectRatio="none" style="width:100%;height:56px;display:block;">'
            +'<polyline points="'+p1+'" fill="none" stroke="#ff9f0a" stroke-width="1.1" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>'
            +'<g transform="translate(0,'+(H1+GAP)+')"><polyline points="'+p2+'" fill="none" stroke="#7a0010" stroke-width="1.1" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></g>'
            +'</svg>'
            /* ⚠ TWO SERIES, TWO MAXIMA, AND THE CAPTION SAYS SO. Daily deaths are orders of magnitude
               below daily infections; on a shared axis the death curve is a flat line at zero, which
               reads as «nobody is dying». Each is scaled to its own peak and both peaks are printed,
               so the shapes are comparable and the levels cannot be confused for each other. */
            +'<div style="font-size:10px;color:var(--text-muted);line-height:1.4;margin-top:2px;">'
            +'<span style="color:#ff9f0a;">■</span> '+window.IntMapLang.t(HOST.lang,"new infections/day, peak","新規感染/日 ピーク","Neuinfektionen/Tag, Spitze","новых заражений в день, пик","nuevas infecciones/día, pico")+' <b>'+fmt(mi)+'</b> ('+window.IntMapLang.t(HOST.lang,"Day","経過","Tag","День","Día")+' '+pkDay+') · '
            +'<span style="color:#7a0010;">■</span> '+window.IntMapLang.t(HOST.lang,"deaths/day, peak","死亡/日 ピーク","Todesfälle/Tag, Spitze","смертей в день, пик","muertes/día, pico")+' <b>'+fmt(md)+'</b><br>'
            +window.IntMapLang.t(HOST.lang,"Each curve is scaled to its own peak, so their shapes can be compared but their heights cannot.","各曲線はそれぞれのピークで正規化しています。形は比べられますが、高さは比べられません。","Jede Kurve ist auf ihr eigenes Maximum skaliert: die Formen sind vergleichbar, die Höhen nicht.","Каждая кривая масштабирована по своему пику: формы сравнимы, высоты — нет.","Cada curva está escalada a su propio pico: sus formas son comparables, sus alturas no.")
            +'</div>'; }

        /* ══ ⚠⚠⚠ (#R675) ONE COUNTRY, EVERYTHING IT IS — INCLUDING Rₑ ═══════════════════════════════
           The setup panel has an R₀ slider, and R₀ is the one reproduction number that is NOT true of
           any country in a running epidemic: immunity, season, behaviour, lockdown and the local
           variant mix have all moved it. Rₑ is the number that answers «is it still growing here»,
           and it is computed by the ENGINE (`report`), because reconstructing it up here would mean
           copying β, the season term and the behaviour term out of the model — which is exactly how
           two answers to one question get created (#R536, #R660). */
        let inspectIdx=-1;
        function insRow(k,v,col){ return '<div style="display:flex;gap:8px;padding:1px 0;"><span style="flex:0 0 118px;color:var(--text-muted);">'+k+'</span><span style="flex:1;'+(col?'color:'+col+';':'')+'"><b>'+v+'</b></span></div>'; }
        function renderInspect(){ const box=hud&&hud.querySelector('#pg-inspect'); if(!box) return;
          if(inspectIdx<0||!model){ box.style.display='none'; box.innerHTML=''; return; }
          const r=model.report(inspectIdx); if(!r){ box.style.display='none'; box.innerHTML=''; return; }
          box.style.display='block';
          const pct=(x)=>(x*100).toFixed(1)+'%';
          const BORDER_WORD={open:window.IntMapLang.t(HOST.lang,"open","規制なし","offen","открыта","abierta"),
            screening:window.IntMapLang.t(HOST.lang,"screening on arrival","入国時の検査","Kontrolle bei Einreise","контроль при въезде","control a la llegada"),
            restricted:window.IntMapLang.t(HOST.lang,"entry restricted","入国制限","Einreise beschränkt","въезд ограничен","entrada restringida"),
            closed:window.IntMapLang.t(HOST.lang,"highest restrictions","規制は最高レベル","höchste Beschränkungen","максимальные ограничения","restricciones máximas")};
          const head='<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;"><b style="font-size:13px;flex:1;">'+nm[inspectIdx]+'</b>'
            +'<button id="pg-ins-x" style="border:none;border-radius:8px;background:var(--input-bg);color:var(--text-main);padding:3px 9px;font-size:11px;cursor:pointer;">×</button></div>';
          let body='';
          /* ⚠ WHOSE DECISION IS BEING SHOWN. A dependency's border is its sovereign's border and the
             panel must not present it as a decision taken here; a row with no government has no
             border policy at all, and saying so is the honest answer to «why is nothing happening». */
          if(r.actor<0) body+='<div style="font-size:10.5px;color:var(--text-muted);margin-bottom:4px;line-height:1.4;">'+window.IntMapLang.t(HOST.lang,"No seat of government is recorded here, so this place makes no policy of its own in the model.","この場所には政府の所在地が記録されていないため、モデル上は独自の政策を行いません。","Für diesen Ort ist kein Regierungssitz verzeichnet, daher trifft er im Modell keine eigenen Maßnahmen.","Для этого места не зафиксировано местопребывание правительства, поэтому в модели оно не принимает собственных мер.","Aquí no consta una sede de gobierno, por lo que en el modelo no toma medidas propias.")+'</div>';
          else if(!r.selfGoverning) body+='<div style="font-size:10.5px;color:var(--text-muted);margin-bottom:4px;line-height:1.4;">'+window.IntMapLang.t(HOST.lang,"Entry rules and lockdowns here are decided by {c}.","ここの入国規制とロックダウンは{c}が決定します。","Einreiseregeln und Lockdowns werden hier von {c} entschieden.","Правила въезда и локдауны здесь определяет {c}.","Las normas de entrada y los confinamientos aquí los decide {c}.").replace('{c}',nm[r.actor]||'?')+'</div>';
          if(!r.seeded) body+=insRow(window.IntMapLang.t(HOST.lang,"Cases","感染","Fälle","Случаи","Casos"),window.IntMapLang.t(HOST.lang,"none yet","まだ無し","noch keine","пока нет","aún ninguno"));
          else body+=insRow(window.IntMapLang.t(HOST.lang,"Rₑ (effective)","実効再生産数 Rₑ","Rₑ (effektiv)","Rₑ (эффективное)","Rₑ (efectivo)"),r.rEff.toFixed(2),r.rEff>1?'#ff3b30':'#34c759')
              +insRow(window.IntMapLang.t(HOST.lang,"R₀ here (with variants)","この国のR₀（変異株込み）","R₀ hier (mit Varianten)","R₀ здесь (с вариантами)","R₀ aquí (con variantes)"),r.r0.toFixed(2))
              /* ⚠ (#R675) AND WHERE THE DIFFERENCE WENT. Rₑ can be ABOVE the local R₀ — in a country
                 whose season is currently favouring transmission it simply is — and a reader shown
                 3.52 beside 3.20 with no third number can only conclude that one of them is wrong.
                 The three factors are named, so the arithmetic on screen closes. */
              +'<div style="font-size:10px;color:var(--text-muted);line-height:1.4;margin:1px 0 3px;">'
                +window.IntMapLang.t(HOST.lang,"Rₑ = R₀ × season ({s}) × behaviour and lockdown ({b}) × susceptible share ({u})","Rₑ = R₀ × 季節（{s}）× 行動変容とロックダウン（{b}）× 未感染の割合（{u}）","Rₑ = R₀ × Jahreszeit ({s}) × Verhalten und Ausgangssperre ({b}) × Anteil Empfänglicher ({u})","Rₑ = R₀ × сезон ({s}) × поведение и локдаун ({b}) × доля восприимчивых ({u})","Rₑ = R₀ × estación ({s}) × comportamiento y confinamiento ({b}) × proporción de susceptibles ({u})")
                  .replace('{s}','×'+r.season.toFixed(2)).replace('{b}','×'+r.behaviour.toFixed(2)).replace('{u}',pct((r.S+r.SV)/r.alive))
              +'</div>'
              +insRow(window.IntMapLang.t(HOST.lang,"Infectious now","感染性あり","Jetzt ansteckend","Заразны сейчас","Contagiosos ahora"),fmt(r.I),'#f03b20')
              +insRow(window.IntMapLang.t(HOST.lang,"Infected, not yet infectious","感染済み・未感染性","Infiziert, noch nicht ansteckend","Заражены, ещё не заразны","Infectados, aún no contagiosos"),fmt(r.E),'#ff9f0a')
              +insRow(window.IntMapLang.t(HOST.lang,"Dead","死亡","Tote","Умерло","Fallecidos"),fmt(r.D),'#7a0010')
              +insRow(window.IntMapLang.t(HOST.lang,"First case arrived","初発生","Erster Fall","Первый случай","Primer caso"),window.IntMapLang.t(HOST.lang,"Day","経過","Tag","День","Día")+' '+r.arrivalDay);
          body+=insRow(window.IntMapLang.t(HOST.lang,"Susceptible","未感染（感受性）","Empfänglich","Восприимчивы","Susceptibles"),fmt(r.S+r.SV)+' ('+pct((r.S+r.SV)/r.alive)+')')
            +insRow(window.IntMapLang.t(HOST.lang,"Immune (recovered)","免疫あり（回復）","Immun (genesen)","Иммунны (переболели)","Inmunes (recuperados)"),fmt(r.R))
            +insRow(window.IntMapLang.t(HOST.lang,"Protected by vaccine now","ワクチンで防御中","Derzeit durch Impfung geschützt","Сейчас защищены вакциной","Protegidos por vacuna ahora"),fmt(r.V),'#0a84ff');
          if(r.actor>=0) body+=insRow(window.IntMapLang.t(HOST.lang,"Entry rules","入国規制","Einreiseregeln","Правила въезда","Normas de entrada"),(BORDER_WORD[r.border]||r.border)+' — '+Math.round(r.borderPass*100)+'%')
              +insRow(window.IntMapLang.t(HOST.lang,"Lockdown","ロックダウン","Ausgangssperre","Локдаун","Confinamiento"),Math.round(r.lock*100)+'%');
          /* ⚠ HOSPITAL PRESSURE IS A MULTIPLIER ON FATALITY, not a bed count — IntMap has no bed data
             and the panel must not imply it does. ×1.00 is «coping». */
          body+=insRow(window.IntMapLang.t(HOST.lang,"Hospital pressure","医療の逼迫","Belastung der Kliniken","Нагрузка на больницы","Presión hospitalaria"),'×'+r.overload.toFixed(2),r.overload>1.3?'#ff3b30':'')
            +insRow(window.IntMapLang.t(HOST.lang,"Dominant variant","優勢な変異株","Vorherrschende Variante","Доминирующий вариант","Variante dominante"),(r.variant===0?window.IntMapLang.t(HOST.lang,"original","元の病原体","Ursprungsvariante","исходный","cepa original"):String.fromCharCode(944+r.variant))+' '+Math.round(r.variantShare*100)+'%');
          box.innerHTML=head+'<div style="font-size:11px;line-height:1.5;">'+body+'</div>';
          const x=box.querySelector('#pg-ins-x'); if(x) x.onclick=()=>{ inspectIdx=-1; renderInspect(); };
        }

        /* ══ ⚠⚠⚠ (#R675) ONE RUN IS ONE DRAW, AND THE PANEL WAS PRINTING IT AS A MEASUREMENT ════════
           Everything in the engine is stochastic — that is what the seed field, the fade-out rule and
           `STOCHASTIC_MAX` are for — and the reader was shown exactly one realisation, in the same
           typeface as a fact. 「現在流行中の国 257 · 経過 208」 is not a property of the pathogen; it is a
           property of seed 812734. The same settings with a different seed can turn a pandemic into
           an outbreak that died in the country it started in, and nothing on screen said so.
           ⚠ THE REPLICATES ARE THE SAME WORLD, THE SAME SETTINGS AND THE SAME ORIGIN. Only the seed
           differs, which is the whole point: what is left is the variation the model itself contains.
           ⚠ TIME-SLICED ON THE MAIN THREAD, NOT A WORKER. A worker needs a fallback for the browsers
           and memory conditions that refuse it, and that fallback is a SECOND copy of the run loop
           running on the devices least able to afford it (#R661). One loop, yielding every ~22 ms,
           reporting progress and stoppable. ⚠ THE TIME REMAINING IS MEASURED from the replicates
           already finished, never estimated from a constant nobody can date. */
        const ENS_SLICE_MS=22;
        let ensOpen=false, ensN=25, ensBusy=false, ensDone=0, ensStop=false, ensSum=null, ensMs=0, ensOrigin=-1;
        /* An independent stream per replicate. The engine hashes whatever seed it is handed, but two
           replicates must not be handed adjacent integers and hope — xorshift-mixed here so that
           replicate 1 and replicate 2 are as unrelated as any two seeds a reader might type. */
        function ensMix(a,b){ let x=(a^Math.imul(b,0x9E3779B1))>>>0; x^=x<<13; x>>>=0; x^=x>>>17; x^=x<<5; return x>>>0; }
        function ensembleGo(){
          if(ensBusy||ensOrigin<0) return;
          ensBusy=true; ensStop=false; ensDone=0; ensSum=null; ensMs=0;
          const t0=Date.now(), runs=[];
          let m=null;
          const nextRun=()=>{
            if(ensStop||!hud.isConnected){ ensBusy=false; if(runs.length) ensSum=summariseEnsemble(runs); renderEns(); return; }
            if(!m){
              if(ensDone>=ensN){ ensBusy=false; ensMs=Date.now()-t0; ensSum=summariseEnsemble(runs); renderEns(); return; }
              m=createPandemicModel({countries:world,preset:preset(),params:cfg,seed:ensMix(runSeed,ensDone+1)});
              m.seed(ensOrigin,cfg.initialCases);
            }
            const slice=Date.now();
            while(!m.ended&&Date.now()-slice<ENS_SLICE_MS) m.step();
            if(m.ended){
              const h=m.history(); let peakI=0, peakDay=0, reached=0;
              for(let q=0;q<h.length;q++){ if(h[q].I>peakI){ peakI=h[q].I; peakDay=h[q].day; } if(h[q].reached>reached) reached=h[q].reached; }
              const T=m.totals();
              runs.push({ deaths:T.D, cumInfPct:T.worldPop?(T.cumInf/T.worldPop*100):0, reached:reached, peakI:peakI, peakDay:peakDay, days:T.day, kind:(m.ended&&m.ended.kind)||'over' });
              m=null; ensDone++; ensMs=Date.now()-t0;
            }
            renderEns();
            setTimeout(nextRun,0);
          };
          renderEns(); setTimeout(nextRun,0);
        }
        function ensQ(k,f){ const q=ensSum&&ensSum.metrics&&ensSum.metrics[k]; if(!q) return '—';
          return '<b>'+f(q.p50)+'</b> <span style="color:var(--text-muted);font-weight:400;">'+f(q.p10)+' – '+f(q.p90)+'</span>'; }
        function renderEns(){ const box=hud&&hud.querySelector('#pg-ens'); if(!box) return;
          box.innerHTML=''; if(!ensOpen){ box.style.display='none'; return; }
          box.style.display='block';
          const h=document.createElement('div'); h.style.cssText='font-size:11.5px;font-weight:700;margin-bottom:4px;';
          h.textContent=window.IntMapLang.t(HOST.lang,"How much of this is chance?","この結果はどこまで偶然か","Wie viel davon ist Zufall?","Насколько это случайность?","¿Cuánto de esto es azar?"); box.appendChild(h);
          const note=document.createElement('div'); note.style.cssText='font-size:10px;color:var(--text-muted);line-height:1.4;margin-bottom:6px;';
          note.textContent=window.IntMapLang.t(HOST.lang,"Runs the same disease, the same world and the same first outbreak again with different random draws. The map keeps showing the single run you are watching.","同じ病原体・同じ世界・同じ最初の流行を、乱数だけ変えて繰り返します。地図はいま見ている1本のランのままです。","Führt dieselbe Krankheit, dieselbe Welt und denselben ersten Ausbruch erneut mit anderen Zufallszahlen aus. Die Karte zeigt weiterhin den einen Lauf, den Sie sehen.","Повторяет ту же болезнь, тот же мир и ту же первую вспышку с другими случайными числами. На карте по-прежнему один прогон, который вы смотрите.","Repite la misma enfermedad, el mismo mundo y el mismo brote inicial con otros números aleatorios. El mapa sigue mostrando la única simulación que está viendo."); box.appendChild(note);
          if(!ensBusy){
            const row=document.createElement('div'); row.style.cssText='display:flex;flex-wrap:wrap;gap:6px;margin-bottom:7px;align-items:center;';
            [10,25,50].forEach(n=>{ const b=document.createElement('button'); b.textContent=n+'×'; const on=n===ensN;
              b.style.cssText='border:1px solid rgba(128,128,128,0.3);background:'+(on?'var(--primary-color)':'var(--input-bg)')+';color:'+(on?'#fff':'var(--text-main)')+';border-radius:999px;padding:5px 11px;font-size:11.5px;font-weight:600;cursor:pointer;';
              b.onclick=()=>{ ensN=n; renderEns(); }; row.appendChild(b); });
            const go=document.createElement('button'); go.textContent=window.IntMapLang.t(HOST.lang,"Run","実行","Starten","Запустить","Ejecutar");
            go.style.cssText='border:none;border-radius:10px;background:var(--primary-color);color:#fff;padding:6px 14px;font-size:11.5px;font-weight:700;cursor:pointer;margin-left:auto;';
            go.onclick=ensembleGo; row.appendChild(go); box.appendChild(row);
          } else {
            const p=document.createElement('div'); p.style.cssText='font-size:11px;margin-bottom:6px;display:flex;gap:8px;align-items:center;';
            const est=ensDone>0?Math.round((ensMs/ensDone)*(ensN-ensDone)/1000):null;
            const sp=document.createElement('span'); sp.style.flex='1';
            sp.textContent=window.IntMapLang.t(HOST.lang,"Running {a} of {b}","{b}本中{a}本目","Lauf {a} von {b}","Прогон {a} из {b}","Simulación {a} de {b}").replace('{a}',String(Math.min(ensN,ensDone+1))).replace('{b}',String(ensN))+(est!=null?(' · ≈'+est+'s'):'');
            p.appendChild(sp);
            const c=document.createElement('button'); c.textContent=window.IntMapLang.t(HOST.lang,"Stop the runs","実行を中止","Läufe stoppen","Остановить прогоны","Detener las simulaciones");
            c.style.cssText='border:none;border-radius:10px;background:var(--input-bg);color:var(--text-main);padding:5px 12px;font-size:11px;cursor:pointer;';
            c.onclick=()=>{ ensStop=true; }; p.appendChild(c); box.appendChild(p);
          }
          if(ensSum&&ensSum.n){
            const g=document.createElement('div'); g.style.cssText='font-size:11px;line-height:1.5;';
            const pctOf=(k)=>Math.round((ensSum.outcomes[k]||0)*100);
            g.innerHTML=
              '<div style="font-size:10px;color:var(--text-muted);margin-bottom:3px;">'+window.IntMapLang.t(HOST.lang,"median, then the 10th to 90th percentile, over {n} runs","{n}本の中央値と、10〜90パーセンタイルの幅","Median, dann 10.–90. Perzentil über {n} Läufe","медиана, затем 10–90 перцентиль по {n} прогонам","mediana y luego el percentil 10 a 90 de {n} simulaciones").replace('{n}',String(ensSum.n))+'</div>'
              +insRow(window.IntMapLang.t(HOST.lang,"Dead","死亡","Tote","Умерло","Fallecidos"),ensQ('deaths',fmt))
              +insRow(window.IntMapLang.t(HOST.lang,"cumulative infections","延べ感染","kumulierte Infektionen","суммарно заражений","infecciones acumuladas"),ensQ('cumInfPct',v=>v.toFixed(1)+'%'))
              +insRow(window.IntMapLang.t(HOST.lang,"Countries and territories reached","到達した国・地域","Erreichte Länder und Gebiete","Затронуто стран и территорий","Países y territorios alcanzados"),ensQ('reached',v=>String(Math.round(v))))
              +insRow(window.IntMapLang.t(HOST.lang,"Peak infectious","感染性ありのピーク","Höchststand Ansteckender","Пик заразных","Pico de contagiosos"),ensQ('peakI',fmt))
              +insRow(window.IntMapLang.t(HOST.lang,"Day of the peak","ピークの日","Tag des Höchststands","День пика","Día del pico"),ensQ('peakDay',v=>String(Math.round(v))))
              +'<div style="margin-top:5px;padding-top:5px;border-top:1px solid rgba(128,128,128,0.18);">'
              +insRow(window.IntMapLang.t(HOST.lang,"Never left the first country","最初の国から出なかった","Verließ das erste Land nie","Не вышло за пределы первой страны","Nunca salió del primer país"),pctOf('contained')+'%','#34c759')
              /* ⚠ (#R675) THE THREE ENDINGS ARE EXHAUSTIVE, SO ALL THREE ARE PRINTED. Two of them
                 were, and a set of replicates that all ran their course would have shown 0% beside
                 0% — a reader looking at the outcome panel would have been told nothing at all,
                 by a panel that appeared to be answering. `contained` + `over` + `endemic` is every
                 `end` event the engine can emit (① holds that list to the emitters). */
              +insRow(window.IntMapLang.t(HOST.lang,"Ran its course and ended","流行しきって終息した","Lief aus und endete","Прошло свой путь и завершилось","Siguió su curso y terminó"),pctOf('over')+'%')
              +insRow(window.IntMapLang.t(HOST.lang,"Still circulating at the time limit","期間上限でも継続中","Am Zeitlimit noch im Umlauf","Всё ещё циркулирует к концу срока","Sigue circulando al límite de tiempo"),pctOf('endemic')+'%')
              +'</div>';
            box.appendChild(g);
          }
        }

        /* ══ ⚠⚠⚠ (#R673) THE VALUE SHOWN, THE VALUE IN THE INPUT AND THE VALUE IN THE ENGINE ARE ONE ══
           They were three. Ebola's preset R₀ is 1.95; the slider's step was 0.1, so the browser
           snapped `range.value` to 2; the readout was `toFixed(1)`, so it printed 1.9; and `cfg.r0`
           was never touched by any of that, so the engine ran 1.95. MEASURED in an isolated
           Chromium with these exact three lines: engine 1.95 / input 2 / label 1.9 — three numbers,
           one parameter, and no way for the reader to find out which one their outbreak used.

           ⚠ THE FIX IS NOT A ROUNDING RULE, IT IS ONE OWNER. `mk` now snaps the incoming value to
           the grid the input can actually represent and WRITES THAT BACK through `set` before
           drawing anything, so the engine holds what the slider holds. It is done here rather than
           at each call site because it must be true of every slider, including the next one
           somebody adds — a rule on the fact, not on one caller (#R429). Where a preset's precision
           is worth keeping, the STEP is what changes (R₀ is 0.05 below, so 1.95 survives it).
           ⚠ `Math.round((val-min)/stp)*stp` is re-rounded to the step's own decimals, or 0.1+0.2
           puts 1.9500000000000002 in a field whose step is 0.05 and the browser snaps it again. */
        function mk(lab,val,min,max,stp,fmtv,set){ val=snapToStep(+val,min,max,stp); set(val);
          const w=document.createElement('div'); w.style.cssText='display:flex;align-items:center;gap:8px;margin:5px 0;font-size:11.5px;'; const l=document.createElement('span'); l.textContent=lab; l.style.cssText='flex:0 0 118px;color:var(--text-muted);'; const r=document.createElement('input'); r.type='range'; r.min=min; r.max=max; r.step=stp; r.value=val; r.style.cssText='flex:1;accent-color:var(--primary-color);'; const v=document.createElement('b'); v.textContent=fmtv(+val); v.style.cssText='flex:0 0 54px;text-align:right;'; r.oninput=()=>{ const x=snapToStep(+r.value,min,max,stp); v.textContent=fmtv(x); set(x); }; w.appendChild(l); w.appendChild(r); w.appendChild(v); hud.appendChild(w); return r; }
        function pills(items,isOn,pick){ const row=document.createElement('div'); row.style.cssText='display:flex;flex-wrap:wrap;gap:6px;margin-bottom:9px;';
          items.forEach(it=>{ const on=isOn(it.k); const b=document.createElement('button'); b.textContent=it.t; b.style.cssText='border:1px solid rgba(128,128,128,0.3);background:'+(on?'var(--primary-color)':'var(--input-bg)')+';color:'+(on?'#fff':'var(--text-main)')+';border-radius:999px;padding:6px 11px;font-size:11.5px;font-weight:600;cursor:pointer;'; b.onclick=()=>pick(it.k); row.appendChild(b); }); hud.appendChild(row); return row; }
        function renderConfig(){ hud.innerHTML='';
          const h=document.createElement('div'); h.style.cssText='display:flex;align-items:center;gap:8px;margin-bottom:8px;'; const tt=document.createElement('b'); tt.textContent=window.IntMapLang.t(HOST.lang,"Outbreak setup","パンデミック設定","Ausbruch einrichten","Настройка вспышки","Configuración del brote"); tt.style.fontSize='14px'; h.appendChild(tt); h.appendChild(pill('beta','#ff9500')); const sp=document.createElement('span'); sp.style.flex='1'; h.appendChild(sp); const ex=document.createElement('button'); ex.textContent='×'; ex.style.cssText='border:none;border-radius:50%;width:28px;height:28px;background:var(--input-bg);color:var(--text-main);cursor:pointer;'; ex.onclick=exit; h.appendChild(ex); hud.appendChild(h);
          pills(Object.keys(PANDEMIC_PRESETS).map(k=>({k,t:L.arr(PG_LABELS[k])})),k=>k===presetKey,k=>{ presetKey=k; cfg=freshParams(k,scenario); renderConfig(); });
          /* ⚠ THE SCENARIO IS PART OF THE DISEASE'S IDENTITY. «Measles with nobody immune» is not
             measles — 84% of the world's children have had MCV1 — it is a measles-LIKE novel
             pathogen, and the old simulator only ever ran that one and called it by the real name. */
          pills([{k:'naive',t:window.IntMapLang.t(HOST.lang,"Novel pathogen","未知の病原体","Neuartiger Erreger","Новый патоген","Patógeno nuevo")},{k:'real-world',t:window.IntMapLang.t(HOST.lang,"Today's world","現在の世界","Heutige Welt","Сегодняшний мир","El mundo de hoy")}],k=>k===scenario,k=>{ scenario=k; cfg=freshParams(presetKey,k); renderConfig(); });
          const note=document.createElement('div'); note.style.cssText='font-size:10.5px;color:var(--text-muted);margin:-4px 0 8px;line-height:1.4;';
          note.textContent=scenario==='naive'
            ? window.IntMapLang.t(HOST.lang,"Nobody is immune, and no vaccine or treatment exists yet.","誰も免疫を持たず、ワクチンも治療法もまだ存在しない世界。","Niemand ist immun, und es gibt weder Impfstoff noch Behandlung.","Ни у кого нет иммунитета, вакцины и лечения ещё не существует.","Nadie es inmune y todavía no existe vacuna ni tratamiento.")
            /* ⚠⚠ (#R673) «ACTUALLY HAS» WAS TOO STRONG FOR WHAT THIS MODEL CAN HOLD. The vaccines and
               treatments are real and dated, but the initial immunity is ONE compartment: 90% for
               COVID-19 means «90% start fully protected», which is this engine's coarsest reading of
               a real qualitative fact and not a WHO estimate of anything. Measles' 84% is a CHILD
               MCV1 coverage figure being applied to every age in every country. Both are assumptions
               a reader may change, and the panel now says which word applies to which. */
            : window.IntMapLang.t(HOST.lang,"Uses the vaccines and treatments this disease really has in 2026, plus an ASSUMED level of starting immunity — one figure applied to every country and age.","2026年時点でこの病気に実際にあるワクチン・治療法を使い、初期免疫は「仮定した値」——全ての国・全ての年齢に同じ割合を当てています。","Nutzt die Impfstoffe und Behandlungen, die es 2026 für diese Krankheit wirklich gibt, dazu eine ANGENOMMENE Anfangsimmunität — ein Wert für jedes Land und jedes Alter.","Использует вакцины и лечение, которые реально существуют для этой болезни в 2026 году, плюс ПРЕДПОЛАГАЕМЫЙ начальный иммунитет — одна доля для всех стран и возрастов.","Usa las vacunas y los tratamientos que esta enfermedad realmente tiene en 2026, más un nivel SUPUESTO de inmunidad inicial: una sola cifra para cada país y cada edad.");
          hud.appendChild(note);
          /* ⚠ (#R673) STEP 0.05, NOT 0.1 — because Ebola's pooled R₀ really is 1.95 and a grid that
             cannot hold it forces the value, the slider and the label apart (see `snapToStep`). Two
             decimals in the readout for the same reason: 1.95 must not print as 1.9. */
          mk(window.IntMapLang.t(HOST.lang,"Infectivity R₀","基本再生産数R₀","Basisreproduktionszahl R₀","Базовое репродуктивное число R₀","Número reproductivo básico R₀"),cfg.r0,0.6,18,0.05,v=>v.toFixed(2),v=>cfg.r0=v);
          /* ⚠ «BASE», BECAUSE IT IS NOT THE DEATH RATE THE RUN WILL SHOW: hospital overload raises it,
             treatment and a milder variant lower it. And the preset's own number may be a CFR, which
             has a smaller denominator than an IFR — so the metric is printed next to the slider. */
          mk(window.IntMapLang.t(HOST.lang,"Base fatality","基準致死率","Basisletalität","Базовая летальность","Letalidad base")+' ('+preset().severity.metric+')',+(cfg.baseFatality*100).toFixed(1),0,60,0.1,v=>v+'%',v=>cfg.baseFatality=v/100);
          /* ══ ⚠⚠⚠ (#R673) THE LABEL SPLIT CFR FROM IFR; THE ARITHMETIC DID NOT ═══════════════════
             #R575 made `severity.metric` travel with the number, which was right and is not enough:
             a CFR's denominator is DETECTED CASES and this engine applies the value to every
             infection that leaves I, detected or not. SARS at 9.6% and Ebola at 50% are therefore
             being read as infection fatality ratios by the only thing that consumes them. There is
             no observation model in this simulator — no detection, no reporting, no ascertainment —
             so the honest move is not a made-up conversion factor (that would be a constant nobody
             can date) but to SAY which denominator the run is using. The reader can then lower it. */
          if(preset().severity.metric==='CFR'){ const cn=document.createElement('div'); cn.style.cssText='font-size:10px;color:var(--text-muted);margin:-2px 0 6px;line-height:1.4;';
            cn.textContent=window.IntMapLang.t(HOST.lang,"This figure is a case fatality ratio (deaths per detected case), but the model applies it to every infection — including undetected ones. Treat it as an assumed severity, not as an observed one.","この値は確認された症例あたりの致死率ですが、モデルは未検出を含むすべての感染に適用します。観測値ではなく仮定した重症度として扱ってください。","Dieser Wert ist eine Fall-Sterblichkeitsrate (Todesfälle je erkanntem Fall), doch das Modell wendet ihn auf jede Infektion an — auch auf unerkannte. Behandeln Sie ihn als angenommene, nicht als beobachtete Schwere.","Это летальность на выявленный случай, но модель применяет её ко всем заражениям, включая невыявленные. Считайте это допущением о тяжести, а не наблюдением.","Esta cifra es una letalidad por caso detectado, pero el modelo la aplica a todas las infecciones, incluidas las no detectadas. Trátela como una gravedad supuesta, no observada.");
            hud.appendChild(cn); }
          /* ⚠ LATENT, NOT INCUBATION. Incubation is infection→symptoms; this is infection→infectious,
             which is the one SEIR needs, and for influenza and COVID-19 it is the SHORTER of the two. */
          mk(window.IntMapLang.t(HOST.lang,"Latent (d)","感染力を持つまで(日)","Latenz (T)","Латентный период (дн.)","Latencia (d)"),cfg.latentDays,0,21,1,v=>''+v,v=>cfg.latentDays=v);
          mk(window.IntMapLang.t(HOST.lang,"Infectious (d)","感染期(日)","Ansteckend (T)","Заразность (дн.)","Contagiosidad (d)"),cfg.infectiousDays,1,21,1,v=>''+v,v=>cfg.infectiousDays=v);
          /* ⚠⚠⚠ (#R673) TWO CONTROLS, BECAUSE THERE ARE TWO STATEMENTS. The slider is a DURATION and
             120 on it means 120 months; «lifelong» is a separate answer with a separate control.
             One slider carrying both is what let Ebola's real 120-month immunity be drawn as «∞»
             and then, on a nudge that changed nothing visible, become actually infinite. */
          mk(window.IntMapLang.t(HOST.lang,"Immunity (mo)","免疫(月)","Immunität (Mon.)","Иммунитет (мес.)","Inmunidad (meses)"),cfg.naturalImmunityMonths,0,120,1,
            v=>cfg.naturalImmunityLifelong?'∞':(v<=0?'—':(''+v)),v=>cfg.naturalImmunityMonths=v)
            .disabled=!!cfg.naturalImmunityLifelong;
          pills([{k:false,t:window.IntMapLang.t(HOST.lang,"Immunity wanes","免疫は減衰する","Immunität lässt nach","Иммунитет ослабевает","La inmunidad decae")},{k:true,t:window.IntMapLang.t(HOST.lang,"Lifelong immunity","終生免疫","Lebenslange Immunität","Пожизненный иммунитет","Inmunidad de por vida")}],
            k=>k===!!cfg.naturalImmunityLifelong,k=>{ cfg.naturalImmunityLifelong=k; renderConfig(); });
          const adv=document.createElement('button'); adv.textContent=(advanced?'▾ ':'▸ ')+window.IntMapLang.t(HOST.lang,"Advanced","詳細設定","Erweitert","Дополнительно","Avanzado"); adv.style.cssText='border:none;background:none;color:var(--primary-color);font-size:11.5px;font-weight:600;cursor:pointer;padding:4px 0;'; adv.onclick=()=>{ advanced=!advanced; renderConfig(); }; hud.appendChild(adv);
          if(advanced){
            mk(window.IntMapLang.t(HOST.lang,"Initial immunity","初期免疫","Anfangsimmunität","Начальный иммунитет","Inmunidad inicial"),Math.round(cfg.initialImmunity*100),0,95,1,v=>v+'%',v=>cfg.initialImmunity=v/100);
            /* ⚠ IT IS A CLUSTER, NOT A PATIENT ZERO. The old UI said «patient zero» and seeded up to
               a few thousand exposed people, which is a different thing and a different epidemic. */
            mk(window.IntMapLang.t(HOST.lang,"Initial cases","初期感染者数","Anfangsfälle","Начальные случаи","Casos iniciales"),cfg.initialCases,1,5000,1,v=>grp(v),v=>cfg.initialCases=v);
            mk(window.IntMapLang.t(HOST.lang,"Seasonality","季節性","Saisonalität","Сезонность","Estacionalidad"),Math.round(cfg.seasonality*100),0,60,1,v=>v+'%',v=>cfg.seasonality=v/100);
            mk(window.IntMapLang.t(HOST.lang,"Start month","開始月","Startmonat","Месяц начала","Mes de inicio"),Math.round(cfg.startDayOfYear/30.4)+1,1,12,1,v=>''+v,v=>cfg.startDayOfYear=Math.round((v-1)*30.4)+1);
            mk(window.IntMapLang.t(HOST.lang,"Travel","移動量","Reisen","Поездки","Viajes"),Math.round(cfg.mobility*100),0,300,5,v=>v+'%',v=>cfg.mobility=v/100);
            pills([{k:'none',t:window.IntMapLang.t(HOST.lang,"No response","対策なし","Keine Maßnahmen","Без мер","Sin respuesta")},{k:'adaptive',t:window.IntMapLang.t(HOST.lang,"Adaptive","状況に応じて","Adaptiv","Адаптивные","Adaptativa")},{k:'strong',t:window.IntMapLang.t(HOST.lang,"Strong","強い対策","Streng","Строгие","Estricta")}],k=>k===cfg.interventions,k=>{ cfg.interventions=k; renderConfig(); });
            const sd=document.createElement('div'); sd.style.cssText='display:flex;align-items:center;gap:8px;font-size:11.5px;margin:5px 0;';
            const sl=document.createElement('span'); sl.textContent=window.IntMapLang.t(HOST.lang,"Seed","乱数シード","Zufallsstartwert","Зерно","Semilla"); sl.style.cssText='flex:0 0 118px;color:var(--text-muted);';
            const si=document.createElement('input'); si.type='text'; si.value=String(runSeed); si.inputMode='numeric'; si.style.cssText='flex:1;min-width:0;background:var(--input-bg);color:var(--text-main);border:1px solid rgba(128,128,128,0.25);border-radius:8px;padding:5px 8px;font-size:11.5px;';
            si.oninput=()=>{ const v=parseInt(si.value,10); if(isFinite(v)) runSeed=v>>>0; };
            sd.appendChild(sl); sd.appendChild(si); hud.appendChild(sd);
            const src=document.createElement('div'); src.style.cssText='font-size:10px;color:var(--text-muted);margin-top:6px;line-height:1.4;'; src.textContent=(preset().sources||[]).join(' · '); hud.appendChild(src);
          }
          /* ⚠ (#R673) THE HINT IS DERIVED FROM `worldReady`, because until the world is settled there
             is nothing to tap and a run started anyway would not be the run its seed names. */
          const hint=document.createElement('div'); hint.style.cssText='margin-top:9px;font-size:12px;color:'+(worldReady?'var(--primary-color)':'var(--text-muted)')+';font-weight:600;';
          hint.textContent=worldReady
            ? window.IntMapLang.t(HOST.lang,"▶ Tap a country on the map to start the outbreak there","▶ 地図で最初に流行が始まる国をタップ","▶ Tippen Sie auf der Karte ein Land an, in dem der Ausbruch beginnt","▶ Нажмите на карте страну, где начнётся вспышка","▶ Toque en el mapa el país donde comenzará el brote")
            : window.IntMapLang.t(HOST.lang,"Loading the border and airport tables — the outbreak starts once the world is fixed.","国境・空港のデータを読み込み中——世界が確定してから流行を開始します。","Grenz- und Flughafentabellen werden geladen — der Ausbruch beginnt, sobald die Welt feststeht.","Загружаются таблицы границ и аэропортов — вспышка начнётся, когда мир будет зафиксирован.","Cargando las tablas de fronteras y aeropuertos: el brote comienza cuando el mundo queda fijado.");
          hud.appendChild(hint);
          hud.appendChild(disclaimer());
        }
        /* ⚠ SAY WHAT IT IS. CDC says it of its own measles simulator, and this one simplifies far
           more: one well-mixed compartment set per country, and importation from distance + a
           development proxy rather than from airline routes or passenger volumes. */
        function disclaimer(){ const d=document.createElement('div'); d.style.cssText='margin-top:8px;font-size:10px;color:var(--text-muted);line-height:1.4;'; d.textContent=window.IntMapLang.t(HOST.lang,"Simplified educational model (stochastic SEIR, one well-mixed compartment set per country or territory, and one run out of many possible ones). Not a forecast.","教育目的の簡略モデル（確率的SEIR・国／地域ごとに1つの均一混合区画・起こりうる多数のうちの1本）。予測ではありません。","Vereinfachtes Lehrmodell (stochastisches SEIR, ein durchmischter Kompartimentsatz je Land oder Gebiet, ein Lauf von vielen möglichen). Keine Prognose.","Упрощённая учебная модель (стохастическая SEIR, один равномерно смешанный набор отсеков на страну или территорию, один прогон из многих возможных). Это не прогноз.","Modelo educativo simplificado (SEIR estocástico, un conjunto de compartimentos bien mezclado por país o territorio, y una simulación entre muchas posibles). No es una previsión."); return d; }
        function renderRun(ended){ hud.innerHTML='';
          const stats=document.createElement('div'); stats.id='pg-pan-stats'; stats.style.cssText='margin-bottom:6px;line-height:1.6;'; hud.appendChild(stats);
          const chart=document.createElement('div'); chart.id='pg-chart'; chart.style.cssText='margin:2px 0 7px;'; hud.appendChild(chart);
          const evt=document.createElement('div'); evt.id='pg-evt'; evt.style.cssText='font-size:11px;color:var(--text-muted);margin-bottom:8px;min-height:14px;line-height:1.35;'; evt.textContent=lastEvt; hud.appendChild(evt);
          const row=document.createElement('div'); row.style.cssText='display:flex;gap:8px;align-items:center;';
          if(ended){ const again=document.createElement('button'); again.textContent=window.IntMapLang.t(HOST.lang,"New outbreak","もう一度","Neuer Ausbruch","Новая вспышка","Nuevo brote"); again.style.cssText='flex:1;border:none;border-radius:10px;background:var(--primary-color);color:#fff;padding:10px;font-weight:700;cursor:pointer;'; again.onclick=()=>{ exit(); setTimeout(()=>window._pgPandemic&&window._pgPandemic(),120); }; row.appendChild(again); }
          else { const play=document.createElement('button'); const setPlay=()=>play.textContent=running?window.IntMapLang.t(HOST.lang,"⏸ Pause","⏸ 一時停止","⏸ Pause","⏸ Пауза","⏸ Pausa"):window.IntMapLang.t(HOST.lang,"▶ Play","▶ 再開","▶ Abspielen","▶ Воспроизвести","▶ Reproducir"); play.style.cssText='flex:1;border:none;border-radius:10px;background:var(--primary-color);color:#fff;padding:9px;font-weight:700;cursor:pointer;'; play.onclick=()=>{ if(running) stop(); else start(); setPlay(); }; setPlay(); row.appendChild(play);
            /* ⚠ WALL CLOCK ONLY. ×8 shows the same epidemic sooner; it does not make a different one. */
            const spd=document.createElement('button'); spd.textContent='⏩ x'+speed; spd.style.cssText='border:none;border-radius:10px;background:var(--input-bg);color:var(--text-main);padding:9px 12px;font-weight:700;cursor:pointer;'; spd.onclick=()=>{ speed=speed>=8?1:speed*2; spd.textContent='⏩ x'+speed; }; row.appendChild(spd); }
          const fb=document.createElement('button'); fb.id='pg-feed-btn'; fb.title=window.IntMapLang.t(HOST.lang,"Event log","出来事の記録","Ereignisprotokoll","Журнал событий","Registro de eventos");
          fb.style.cssText='border:none;border-radius:10px;background:var(--input-bg);color:var(--text-main);padding:9px 11px;font-weight:700;font-size:11.5px;cursor:pointer;';
          fb.onclick=()=>{ feedOpen=!feedOpen; if(feedOpen) feedUnread=0; renderFeedBadge(); renderFeedList(); }; row.appendChild(fb);
          const eb=document.createElement('button'); eb.textContent='📊'; eb.title=window.IntMapLang.t(HOST.lang,"How much of this is chance?","この結果はどこまで偶然か","Wie viel davon ist Zufall?","Насколько это случайность?","¿Cuánto de esto es azar?");
          eb.style.cssText='border:none;border-radius:10px;background:'+(ensOpen?'var(--primary-color)':'var(--input-bg)')+';color:'+(ensOpen?'#fff':'var(--text-main)')+';padding:9px 11px;font-size:11.5px;cursor:pointer;';
          eb.onclick=()=>{ ensOpen=!ensOpen; renderRun(ended); }; row.appendChild(eb);
          const ex=document.createElement('button'); ex.textContent='×'; ex.style.cssText='border:none;border-radius:10px;background:var(--input-bg);color:var(--text-main);padding:9px 12px;cursor:pointer;'; ex.onclick=exit; row.appendChild(ex);
          hud.appendChild(row);
          const hint=document.createElement('div'); hint.style.cssText='margin-top:6px;font-size:10.5px;color:var(--text-muted);line-height:1.4;';
          hint.textContent=window.IntMapLang.t(HOST.lang,"Tap any country for its own numbers.","国をタップすると、その国の数字が見られます。","Tippen Sie ein Land an, um seine eigenen Zahlen zu sehen.","Нажмите на страну, чтобы увидеть её показатели.","Toque un país para ver sus propias cifras."); hud.appendChild(hint);
          const ins=document.createElement('div'); ins.id='pg-inspect'; ins.style.cssText='margin-top:8px;border-top:1px solid rgba(128,128,128,0.2);padding-top:7px;display:none;'; hud.appendChild(ins);
          const fd=document.createElement('div'); fd.id='pg-feed'; fd.style.cssText='margin-top:8px;border-top:1px solid rgba(128,128,128,0.2);padding-top:7px;display:none;'; hud.appendChild(fd);
          const en=document.createElement('div'); en.id='pg-ens'; en.style.cssText='margin-top:8px;border-top:1px solid rgba(128,128,128,0.2);padding-top:7px;display:none;'; hud.appendChild(en);
          hud.appendChild(disclaimer()); hud.appendChild(mobilityNote()); hud.appendChild(policyNote());
          renderFeedBadge(); renderFeedList(); renderEns(); updateHud();
        }
        /* ⚠ (#R675) AND IT SAYS WHOSE DECISIONS THESE ARE. `dataState.policy` is «failed» when
           data/country-facts.json did not load, and in that case nothing was demoted — every mapped
           unit decides for itself, which is what every run before this round did. A dead table names
           itself rather than silently switching a rule off (#R673). */
        function policyNote(){ const d=document.createElement('div'); d.style.cssText='margin-top:4px;font-size:10px;color:var(--text-muted);line-height:1.4;';
          if(dataState.policy!=='ok'){ d.textContent=window.IntMapLang.t(HOST.lang,"Every mapped unit sets its own entry rules in this run — the table of governments did not load.","このランでは地図上のすべての単位が独自に入国規制を決めます（政府の一覧を読み込めませんでした）。","In diesem Lauf legt jede Karteneinheit ihre Einreiseregeln selbst fest — die Regierungstabelle wurde nicht geladen.","В этом прогоне каждая единица на карте сама устанавливает правила въезда — таблица правительств не загрузилась.","En esta simulación cada unidad del mapa fija sus propias normas de entrada: no se cargó la tabla de gobiernos."); return d; }
          d.textContent=window.IntMapLang.t(HOST.lang,"Entry rules and lockdowns are decided by governments: {a} places follow the government of another, and {b} have none recorded and make no policy of their own.","入国規制とロックダウンは政府が決めます。{a}件は別の政府に従い、{b}件は政府が記録されていないため独自の政策を行いません。","Über Einreiseregeln und Lockdowns entscheiden Regierungen: {a} Gebiete folgen einer anderen Regierung, für {b} ist keine verzeichnet, sie treffen keine eigenen Maßnahmen.","Правила въезда и локдауны определяют правительства: {a} территорий следуют чужому правительству, для {b} правительство не указано, и собственных мер они не принимают.","Las normas de entrada y los confinamientos los deciden los gobiernos: {a} lugares siguen al gobierno de otro y {b} no tienen ninguno registrado y no toman medidas propias.")
            .replace('{a}',String(dataState.policyFollow||0)).replace('{b}',String(dataState.policyNone||0));
          if(dropped.length) d.textContent+=' '+window.IntMapLang.t(HOST.lang,"{n} mapped units with no measured population are not simulated.","人口が測られていない{n}件の単位はシミュレーションから外しています。","{n} Karteneinheiten ohne gemessene Bevölkerung werden nicht simuliert.","{n} единиц карты без измеренного населения не моделируются.","{n} unidades del mapa sin población medida no se simulan.").replace('{n}',String(dropped.length));
          return d; }
        /* ⚠⚠ (#R666) THE SCREEN SAYS WHAT THE INTERNATIONAL SPREAD WAS ACTUALLY WEIGHTED BY, and it
           asks the engine rather than assuming — data/country-facts.json and data/airports.json are
           fetched when this panel opens and a reader who starts an outbreak before they land really
           does get a model with neither. ⚠ AND IT NAMES WHAT IT IS NOT: airport capacity is airline
           INFRASTRUCTURE, and this project has no routes, no frequencies and no passenger numbers. */
        /* ⚠⚠ (#R673) IT ASKS `dataState`, NOT A REGEX OVER A SUMMARY STRING. `/airports/.test(from)`
           could only ever answer one of two sentences, and `from` is a join of what was USED: a
           world with borders but no airports reads «population+borders», which does not match
           /airports/, so the screen said «the border AND airport tables did not load» while the
           borders were in the matrix. The two tables settle separately (see the snapshot above) and
           are now reported separately, including «loaded but only for some countries». */
        function mobilityNote(){ const d=document.createElement('div'); d.style.cssText='margin-top:4px;font-size:10px;color:var(--text-muted);line-height:1.4;';
          const rich=dataState.airports==='ok'||dataState.airports==='partial';
          const bord=dataState.borders==='ok'||dataState.borders==='partial';
          if(!rich||!bord){ d.textContent=window.IntMapLang.t(HOST.lang,"International spread is weighted by population and distance only — the border and airport tables did not load.","国際伝播の重みは人口と距離だけです（国境・空港のデータを読み込めませんでした）。","Die internationale Ausbreitung ist nur nach Bevölkerung und Entfernung gewichtet — die Grenz- und Flughafentabellen wurden nicht geladen.","Международное распространение взвешено только по населению и расстоянию — таблицы границ и аэропортов не загрузились.","La propagación internacional se pondera solo por población y distancia: no se cargaron las tablas de fronteras y aeropuertos.");
            if(rich||bord) d.textContent=rich
              ? window.IntMapLang.t(HOST.lang,"International spread is weighted by population, distance and airport capacity. The land-border table did not load.","国際伝播の重みは人口・距離・空港規模によるものです。陸上の国境データは読み込めませんでした。","Die internationale Ausbreitung ist nach Bevölkerung, Entfernung und Flughafenkapazität gewichtet. Die Landgrenzentabelle wurde nicht geladen.","Международное распространение взвешено по населению, расстоянию и мощности аэропортов. Таблица сухопутных границ не загрузилась.","La propagación internacional se pondera por población, distancia y capacidad aeroportuaria. No se cargó la tabla de fronteras terrestres.")
              : window.IntMapLang.t(HOST.lang,"International spread is weighted by population, distance and land borders. The airport table did not load.","国際伝播の重みは人口・距離・陸上の国境によるものです。空港データは読み込めませんでした。","Die internationale Ausbreitung ist nach Bevölkerung, Entfernung und Landgrenzen gewichtet. Die Flughafentabelle wurde nicht geladen.","Международное распространение взвешено по населению, расстоянию и сухопутным границам. Таблица аэропортов не загрузилась.","La propagación internacional se pondera por población, distancia y fronteras terrestres. No se cargó la tabla de aeropuertos.");
            return d; }
          d.textContent=window.IntMapLang.t(HOST.lang,"International spread is weighted by population, land borders and airport capacity — not by flight routes or passenger numbers.","国際伝播の重みは人口・陸上の国境・空港規模によるもので、路線や旅客数によるものではありません。","Die internationale Ausbreitung ist nach Bevölkerung, Landgrenzen und Flughafenkapazität gewichtet — nicht nach Flugrouten oder Passagierzahlen.","Международное распространение взвешено по населению, сухопутным границам и мощности аэропортов — не по авиамаршрутам и не по пассажиропотоку.","La propagación internacional se pondera por población, fronteras terrestres y capacidad aeroportuaria, no por rutas aéreas ni número de pasajeros.");
          return d; }
        /* ⚠ (#R673) `worldReady` IS A PRECONDITION OF THE RUN, NOT A SPINNER. Until both tables have
           settled there is no answer to «which world is this», and a run started without one cannot
           be reproduced from its seed. */
        /* ══ ⚠⚠⚠ (#R675) THE MAP ANSWERS TWO QUESTIONS, AND IT USED TO ANSWER ONLY THE FIRST ═══════
           Before the outbreak is placed, a tap chooses where it starts. Afterwards `picking` was
           false and the handler returned on its first line, so for the whole of the run — the part
           the reader actually watches — tapping a country did nothing at all. Every number on screen
           was a world total, and the one thing a world map is for is asking about a PLACE.
           Same hit test, two destinations. */
        function onPick(e){ if(!worldReady) return; let hit=null; for(let i=0;i<N;i++){ if(pig(e.lngLat.lng,e.lngLat.lat,feats[i].geometry)){ hit=i; break; } }
          if(hit==null) return;
          if(!picking){ if(!model) return; inspectIdx=(inspectIdx===hit?-1:hit); renderInspect(); return; }
          picking=false; ensOrigin=hit;
          model=createPandemicModel({countries:world,preset:preset(),params:cfg,seed:runSeed});
          /* ⚠ (#R673) `start()` BEFORE `renderRun()`, BECAUSE THE BUTTON'S CAPTION IS DERIVED FROM
             `running` AT DRAW TIME. It was drawn first and never redrawn, so a run that was already
             playing offered the reader a 「▶ 再開」 button — the control and the state disagreed from
             the first frame. Order is the whole of the defect: `setPlay()` already asks `running`. */
          model.seed(hit,cfg.initialCases); day=model.day; buildDots(); buildPolicy(); start(); renderRun(false);
          news(jp()?('最初の集団感染が'+nm[hit]+'で確認されました（'+grp(cfg.initialCases)+'人）。'):('First cluster confirmed in '+nm[hit]+' ('+grp(cfg.initialCases)+' cases).'),'alert','major','world');
        }
        GE().events.on('click',onPick);
        function exit(){ stop(); ensStop=true; try{ GE().events.off('click',onPick); }catch(_){} try{ PG_LAYERS.forEach(id=>{ if(GE().layers.has(id))GE().layers.remove(id); }); ['pg-dots','pg-policy'].forEach(id=>{ if(GE().layers.hasSource(id))GE().layers.removeSource(id); }); }catch(_){} try{ hud.remove(); }catch(_){} try{ document.body.classList.remove('pg-sim'); }catch(_){} }
        window._pgPandemicExit=exit;
        /* ⚠ (#R670) THE CONTRACT THE TOOLS ROW ASKS (js/map-ui.js `_toolOn` / `_toolOff`): is it open,
           and close it. Published from INSIDE this function, so before the reader has ever opened the
           simulator the global is absent and the row is unlit — which is the truth, and is also why
           the row cannot make the lazy module load just by being drawn (#R209). */
        window.IntMapPandemic={ isOpen:()=>!!document.getElementById('pg-pan-hud'), close:()=>{ exit(); return true; } };
        renderConfig();
      });
    };

    /* (#R32) Statecraft (_pgNationSim) & World Sandbox (_pgWorldSandbox) ABOLISHED per request. */
  })();
};
