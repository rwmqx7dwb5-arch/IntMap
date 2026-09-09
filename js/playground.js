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
/* (#R570) The Pandemic Simulator's arithmetic — a pure, seeded, node-testable SEIR metapopulation
   engine. Static, not lazy: this whole file is already behind js/lazy-modules.js's playground
   door, so the model is downloaded exactly when the playground is and never before. */
import { PANDEMIC_PRESETS, createPandemicModel, scatterCases } from './pandemic-model.js';

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
    /* (#R570) The MAP and the CONTROLS live here; the epidemiology lives in js/pandemic-model.js and
       nothing in this file may do arithmetic on a compartment. That split is the point of the round:
       an external audit found six defects that made the old in-closure model contradict itself —
       playback speed changed the epidemic, «immunity 0» produced NaN, «latent 0» and every
       re-importation produced PEOPLE FROM NOTHING, a run ended while a million were still incubating,
       and the printed attack rate FELL whenever immunity waned. None of it was reachable by a test.
       ⚠ `speed` BELONGS TO setTimeout AND TO NOTHING ELSE. It decides how often step() is called.
       It must never reach a probability again — tests/r570-checks.test.mjs ⑬ watches this file for it. */
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
    window._pgPandemic=function(){
      if(!GE().hasRenderer()){ try{ imToast('Map not ready'); }catch(_){} return; }
      _pgWeStyle();
      ensureCountries(()=>{
        const feats=(window.countryGeo&&window.countryGeo.features)||[]; if(!feats.length){ try{ imToast(window.IntMapLang.t(HOST.lang,"Country data unavailable","国境データを読み込めません","Länderdaten nicht verfügbar","Данные по странам недоступны","Datos de países no disponibles")); }catch(_){} return; }
        /* (#R30) hide the mobile bottom-sheet / FABs so the HUD + map aren't covered ("ボタンがボトムシートに隠れる"). */
        try{ document.body.classList.add('pg-sim'); }catch(_){}
        const cs=(typeof countryStats!=='undefined'&&countryStats)||{};
        const resolve=(p)=>{ const c=[p.ISO_A3_EH,p.ISO_A3,p.ADM0_A3,p.SOV_A3].map(String).find(x=>cs[x]); return c?cs[c]:null; };
        const N=feats.length, cent=[], bbs=[], pools=[], world=[];
        feats.forEach((f,i)=>{ const bb=bboxOf(f); bbs[i]=bb; cent[i]=[(bb[0]+bb[2])/2,(bb[1]+bb[3])/2]; const s=resolve(f.properties||{});
          const pop=(s&&s.pop&&s.pop>0)?s.pop:3e6;
          /* ⚠ ONE PROXY, FOUR MEANINGS — and the engine keeps them apart from here on. GDP per head
             (or HDI) stands in for medical capacity, travel connectivity, policy capacity and vaccine
             delivery because IntMap has no separate data for the other three yet; js/pandemic-model.js
             stores them as four fields so that the day one of them gets its own source, one formula
             changes instead of every formula. */
          const dev=(s&&s.gdppc)?Math.min(1,Math.max(0.12,s.gdppc/55000)):(s&&s.hdi?s.hdi:0.5);
          world[i]={name:cName(f)||'?', pop, dev, lat:cent[i][1], lng:cent[i][0]}; pools[i]=null; });
        const nm=world.map(c=>c.name);
        /* CASE-DOT layers (no country fill). A soft glow under crisp dots. */
        try{ ['pg-dots','pg-dots-glow'].forEach(id=>{ if(GE().layers.has(id)) GE().layers.remove(id); }); if(GE().layers.hasSource('pg-dots')) GE().layers.removeSource('pg-dots'); }catch(_){}
        try{ GE().layers.addSource('pg-dots',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
          /* (#R31) Finer, more UNIFORM dots ("大きさ差を小さく") — small fixed glow + tiny crisp dot.
             (#R570) …and TWO COLOURS, because the map draws E+I while the HUD used to print I: an
             orange dot is somebody incubating, a red one somebody infectious. Same dots, but the
             legend can now name what each one is. */
          const CLS=(inf,exp)=>['case',['==',['get','cls'],0],exp,inf];
          GE().layers.add({id:'pg-dots-glow',type:'circle',source:'pg-dots',paint:{'circle-radius':['interpolate',['linear'],['zoom'],1,2.6,5,5],'circle-color':CLS(['interpolate',['linear'],['get','sev'],0,'#ff5a3c',1,'#7a0010'],'#ff9f0a'),'circle-blur':0.9,'circle-opacity':0.28}});
          GE().layers.add({id:'pg-dots',type:'circle',source:'pg-dots',paint:{'circle-radius':['interpolate',['linear'],['zoom'],1,1.6,5,2.9],'circle-color':CLS(['interpolate',['linear'],['get','sev'],0,'#ff3b30',0.5,'#e01010',1,'#7a0010'],'#ff9f0a'),'circle-stroke-color':'rgba(255,255,255,0.45)','circle-stroke-width':0.25,'circle-opacity':0.95}});
        }catch(e){ console.warn('pandemic dots',e); }
        /* (#R31) Place case dots on REAL places — the capital + gazetteer cities inside the country —
           then jittered clusters around them ("感染者単位で実際の場所に置いて"). Falls back to random
           in-polygon points only when no city is known for that country.
           (#R570) …and the jitter is CHECKED. It never was, so a coastal or border city scattered
           cases into the sea and into the neighbour — see scatterCases() in js/pandemic-model.js. */
        function genPts(i,n){ const f=feats[i], bb=bbs[i]; const span=Math.min(2.0,Math.max(0.1,Math.max(bb[2]-bb[0],bb[3]-bb[1])*0.09)); const anchors=[];
          const inside=(lng,lat)=>pig(lng,lat,f.geometry);
          try{ const s=resolve(f.properties||{}); if(s&&s.latlng){ const cl=[s.latlng[1],s.latlng[0]]; if(inside(cl[0],cl[1])) anchors.push(cl); } }catch(_){}
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
          naturalImmunityMonths:pr.immunity.lifelong?600:pr.immunity.naturalMonths,
          seasonality:pr.transmission.seasonality, startDayOfYear:1, initialCases:100,
          initialImmunity:mode==='real-world'?(pr.baselineImmunity||0):0,
          mobility:1, interventions:'adaptive', vaccineAtStart:mode==='real-world'&&!!pr.vaccine.availableAtStart
        }; }

        let model=null, day=0, timer=null, running=false, speed=2, picking=true, lastDots=0, lastEvt='', perDotNow=0;
        function preset(){ return PANDEMIC_PRESETS[presetKey]; }
        function news(text,kind){ lastEvt=text; try{ pgNews(text,kind); }catch(_){} const el=hud&&hud.querySelector('#pg-evt'); if(el) el.textContent=text; }

        /* Events come out of the engine as data ({t:'variant', c:12, …}); the words are made here, in
           nine languages, because a model that spoke English would have to be translated to be read. */
        function announce(e){
          const who=(e.c>=0&&nm[e.c])?nm[e.c]:window.IntMapLang.t(HOST.lang,'a leading lab','ある研究機関','einem führenden Labor','ведущей лаборатории','un laboratorio destacado');
          if(e.t==='vaccine') return news(jp()?(who+'がワクチンを承認。接種が始まります。'):(who+' approves a vaccine — rollout begins.'),'good');
          if(e.t==='variant'){ const gl=String.fromCharCode(944+e.n);
            return news(jp()?('新変異株（'+gl+'）を'+who+'で確認。'+(e.moreTransmissible?'感染力が上昇。':'')+'——まだその国だけ。'):('New variant ('+gl+') detected in '+who+'.'+(e.moreTransmissible?' More transmissible.':'')+' It is only there, for now.'),'alert'); }
          if(e.t==='border') return news(jp()?(who+'が国境を封鎖。'):(who+' closes its borders.'),'info');
          if(e.t==='reopen') return news(jp()?(who+'が国境を再開。'):(who+' reopens its borders.'),'info');
          if(e.t==='lockdown') return news(jp()?(who+'がロックダウンを発令。'):(who+' enters lockdown.'),'info');
          if(e.t==='tenCountries') return news(window.IntMapLang.t(HOST.lang,"Outbreak has reached 10 countries.","感染が10カ国に拡大。","Der Ausbruch hat 10 Länder erreicht.","Вспышка достигла 10 стран.","El brote ha llegado a 10 países."),'alert');
          /* ⚠ NOT «WHO declares a PHEIC». Under the IHR that is a judgement by the Director-General
             on the advice of an Emergency Committee — never a case count — and the old code declared
             one at exactly 3,000,000 cases. This is the simulation's own threshold, and it says so. */
          if(e.t==='emergency') return news(window.IntMapLang.t(HOST.lang,"Global health emergency threshold reached — international spread is sustained.","国際的な警戒レベルに到達 — 各国への拡大が継続しています。","Schwelle für einen globalen Gesundheitsnotstand erreicht — die internationale Ausbreitung hält an.","Достигнут порог глобальной чрезвычайной ситуации — международное распространение продолжается.","Se alcanza el umbral de emergencia sanitaria mundial: la propagación internacional se mantiene."),'alert');
          if(e.t==='treatment') return news(window.IntMapLang.t(HOST.lang,"An effective treatment is found — fatality rate falls.","有効な治療法が確立。致死率が低下します。","Eine wirksame Behandlung wird gefunden — die Sterblichkeit sinkt.","Найдено эффективное лечение — летальность снижается.","Se encuentra un tratamiento eficaz: la letalidad cae."),'good');
          if(e.t==='deaths') return news(e.n>=1e7
            ? window.IntMapLang.t(HOST.lang,"Global death toll passes 10 million.","世界の死者が1000万人を突破。","Die weltweite Zahl der Todesopfer übersteigt 10 Millionen.","Число погибших в мире превысило 10 миллионов.","El número global de muertes supera los 10 millones.")
            : window.IntMapLang.t(HOST.lang,"Global death toll passes 1 million.","世界の死者が100万人を突破。","Die weltweite Zahl der Todesopfer übersteigt 1 Million.","Число погибших в мире превысило 1 миллион.","El número global de muertes supera el millón."),'alert');
          if(e.t==='end') return endRun(e.kind);
        }
        function endRun(kind){
          const T=model.totals(); buildDots(); stop();
          const attack=T.worldPop?(T.cumInf/T.worldPop*100):0;
          if(kind==='contained') news(jp()?('封じ込め成功 — 死者'+fmt(T.D)+'。世界的流行には至りませんでした。'):('Contained — '+fmt(T.D)+' deaths; it never became a pandemic.'),'good');
          else if(kind==='endemic') news(jp()?('3年経過 — 流行は続いています。累計死者'+fmt(T.D)+'。'):('Three years on, it is still circulating — '+fmt(T.D)+' cumulative deaths.'),'info');
          else { const verdict=attack<5?window.IntMapLang.t(HOST.lang,"a minor outbreak","小規模な流行で終息","ein kleinerer Ausbruch","небольшая вспышка","un brote menor"):attack<25?window.IntMapLang.t(HOST.lang,"the outbreak has ended","流行は終息","der Ausbruch ist vorbei","вспышка закончилась","el brote ha terminado"):window.IntMapLang.t(HOST.lang,"a devastating pandemic, now over","壊滅的な大流行を経て終息","eine verheerende Pandemie, jetzt vorbei","разрушительная пандемия, теперь завершившаяся","una pandemia devastadora, ya terminada");
            news(jp()?(verdict+' — 累計死者'+fmt(T.D)+'（延べ感染は世界人口の'+attack.toFixed(1)+'%）。'):('It was '+verdict+' — '+fmt(T.D)+' deaths; infections totalled '+attack.toFixed(1)+'% of world population.'),attack<25?'good':'alert'); }
          renderRun(true);
        }
        function tick(){ if(!model) return; const ev=model.step(); day=model.day; for(let k=0;k<ev.length;k++) announce(ev[k]);
          const now=Date.now(); if(now-lastDots>140||model.ended){ lastDots=now; buildDots(); } updateHud(); }

        /* (#R32) Dots scale with the ACTUAL case count ("感染者の人数単位で") — each dot ≈ `perDot`
           active cases, allocated per country up to a global budget (perf), placed on REAL cities.
           (#R570) …and `perDot` is now PRINTED, because it moves: at the start one dot is 60 cases
           and in a full pandemic it is thousands, and a reader who is not told cannot read the map. */
        const PG_POOL=80, PG_DOTCAP=4800, PG_CASES_PER_DOT=60;
        function buildDots(){ if(!model) return; let totAct=0; for(let i=0;i<N;i++){ const a=model.active(i); if(a.seeded) totAct+=a.E+a.I; }
          const perDot=Math.max(PG_CASES_PER_DOT, totAct/PG_DOTCAP); perDotNow=perDot; const out=[];
          for(let i=0;i<N;i++){ const a=model.active(i); if(!a.seeded) continue; const act=a.E+a.I; if(act<1 && a.D<1) continue;
            let k=Math.round(act/perDot); if(k<1 && (act>=1||a.D>0)) k=1; if(k>PG_POOL) k=PG_POOL;
            if(!pools[i]) pools[i]=genPts(i,PG_POOL); if(!pools[i].length) continue;
            const sev=a.D>0?Math.min(1,a.D/(a.I+a.D+1)*3):0;
            /* Split the country's dots the way its cases are actually split. */
            const kE=act>0?Math.round(k*(a.E/act)):0;
            for(let d=0; d<k && d<pools[i].length; d++) out.push({type:'Feature',geometry:{type:'Point',coordinates:pools[i][d]},properties:{sev,cls:d<kE?0:1}}); }
          try{ GE().layers.setSourceData('pg-dots',{type:'FeatureCollection',features:out}); }catch(_){} }
        /* ⚠ THE ONLY THING `speed` TOUCHES. */
        function loop(){ clearTimeout(timer); if(!running) return; tick(); if(model&&model.ended){ running=false; return; } if(running) timer=setTimeout(loop, Math.max(70,440/speed)); }
        function start(){ if(running||!model||model.ended) return; running=true; loop(); }
        function stop(){ running=false; clearTimeout(timer); }

        const hud=document.createElement('div'); hud.id='pg-pan-hud';
        hud.style.cssText='position:fixed;left:50%;transform:translateX(-50%);bottom:max(18px,env(safe-area-inset-bottom));z-index:5810;width:min(540px,94vw);box-sizing:border-box;background:var(--popup-bg);color:var(--text-main);border:1px solid var(--glass-border,rgba(128,128,128,0.25));border-radius:16px;box-shadow:var(--shadow);backdrop-filter:blur(14px);padding:12px 14px;font-size:12.5px;max-height:70dvh;overflow-y:auto;';
        (document.getElementById('map-container')||document.body).appendChild(hud);
        function fmt(n){ n=Math.round(n); if(n>=1e9)return (n/1e9).toFixed(2)+'B'; if(n>=1e6)return (n/1e6).toFixed(2)+'M'; if(n>=1e3)return (n/1e3).toFixed(1)+'k'; return ''+n; }
        function grp(n){ try{ return Math.round(n).toLocaleString(window.IntMapLang.htmlLang?window.IntMapLang.htmlLang(HOST.lang):undefined); }catch(_){ return fmt(n); } }
        function updateHud(){ const el=hud.querySelector('#pg-pan-stats'); if(!el||!model) return; const T=model.totals();
          const vpct=T.worldPop?Math.round(T.V/T.worldPop*100):0, attack=T.worldPop?(T.cumInf/T.worldPop*100):0;
          el.innerHTML='<span style="color:#f03b20;">'+window.IntMapLang.t(HOST.lang,"Infectious","感染性","Ansteckend","Заразны","Contagiosos")+' <b>'+fmt(T.I)+'</b></span> · '+
          '<span style="color:#ff9f0a;">'+window.IntMapLang.t(HOST.lang,"Incubating","潜伏中","Inkubierend","Инкубация","Incubando")+' <b>'+fmt(T.E)+'</b></span> · '+
          '<span style="color:#7a0010;">'+window.IntMapLang.t(HOST.lang,"Dead","死亡","Tote","Умерло","Fallecidos")+' <b>'+fmt(T.D)+'</b></span> · '+
          '<span style="color:#0a84ff;">'+window.IntMapLang.t(HOST.lang,"Vaccinated","接種","Geimpft","Вакцинировано","Vacunados")+' <b>'+vpct+'%</b></span><br>'+
          '<span>'+window.IntMapLang.t(HOST.lang,"Countries","国","Länder","Страны","Países")+' <b>'+T.affected+'</b></span> · '+window.IntMapLang.t(HOST.lang,"Day","経過","Tag","День","Día")+' <b>'+day+'</b>'+
          /* ⚠ CUMULATIVE INFECTION EVENTS, AND THE LABEL SAYS SO. Reinfections count again, so this
             is not «the share of people who have ever been infected» and must not be printed as one. */
          ' · '+window.IntMapLang.t(HOST.lang,"cumulative infections","延べ感染","kumulierte Infektionen","суммарно заражений","infecciones acumuladas")+' <b>'+attack.toFixed(1)+'%</b>'+
          (T.variants?' · '+window.IntMapLang.t(HOST.lang,"variants","変異株","Varianten","варианты","variantes")+' <b>'+T.variants+'</b>':'')+
          (T.vaccine?' · 💉':(model.vaccineProgress()>0?' · '+window.IntMapLang.t(HOST.lang,"vaccine R&D","ワクチン開発","Impfstoffentwicklung","разработка вакцины","I+D de vacunas")+' '+Math.round(model.vaccineProgress()*100)+'%':''))+
          '<br><span style="color:var(--text-muted);font-size:10.5px;">'+window.IntMapLang.t(HOST.lang,"1 dot ≈ ","1点 ≈ ","1 Punkt ≈ ","1 точка ≈ ","1 punto ≈ ")+grp(perDotNow)+' '+window.IntMapLang.t(HOST.lang,"active cases · red = infectious, orange = incubating","人の現感染者 · 赤=感染性、橙=潜伏中","aktive Fälle · rot = ansteckend, orange = inkubierend","активных случаев · красный — заразные, оранжевый — инкубация","casos activos · rojo = contagiosos, naranja = incubando")+'</span>'; }
        function mk(lab,val,min,max,stp,fmtv,set){ const w=document.createElement('div'); w.style.cssText='display:flex;align-items:center;gap:8px;margin:5px 0;font-size:11.5px;'; const l=document.createElement('span'); l.textContent=lab; l.style.cssText='flex:0 0 118px;color:var(--text-muted);'; const r=document.createElement('input'); r.type='range'; r.min=min; r.max=max; r.step=stp; r.value=val; r.style.cssText='flex:1;accent-color:var(--primary-color);'; const v=document.createElement('b'); v.textContent=fmtv(+val); v.style.cssText='flex:0 0 54px;text-align:right;'; r.oninput=()=>{ v.textContent=fmtv(+r.value); set(+r.value); }; w.appendChild(l); w.appendChild(r); w.appendChild(v); hud.appendChild(w); }
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
            : window.IntMapLang.t(HOST.lang,"Starts from the immunity, vaccines and treatments this disease actually has in 2026.","2026年時点でこの病気に実際にある免疫・ワクチン・治療法から始める。","Beginnt mit der Immunität, den Impfstoffen und Behandlungen, die es 2026 für diese Krankheit wirklich gibt.","Начинается с иммунитета, вакцин и методов лечения, которые реально существуют для этой болезни в 2026 году.","Parte de la inmunidad, las vacunas y los tratamientos que esta enfermedad realmente tiene en 2026.");
          hud.appendChild(note);
          mk(window.IntMapLang.t(HOST.lang,"Infectivity R₀","基本再生産数R₀","Basisreproduktionszahl R₀","Базовое репродуктивное число R₀","Número reproductivo básico R₀"),cfg.r0,0.6,18,0.1,v=>v.toFixed(1),v=>cfg.r0=v);
          /* ⚠ «BASE», BECAUSE IT IS NOT THE DEATH RATE THE RUN WILL SHOW: hospital overload raises it,
             treatment and a milder variant lower it. And the preset's own number may be a CFR, which
             has a smaller denominator than an IFR — so the metric is printed next to the slider. */
          mk(window.IntMapLang.t(HOST.lang,"Base fatality","基準致死率","Basisletalität","Базовая летальность","Letalidad base")+' ('+preset().severity.metric+')',+(cfg.baseFatality*100).toFixed(1),0,60,0.1,v=>v+'%',v=>cfg.baseFatality=v/100);
          /* ⚠ LATENT, NOT INCUBATION. Incubation is infection→symptoms; this is infection→infectious,
             which is the one SEIR needs, and for influenza and COVID-19 it is the SHORTER of the two. */
          mk(window.IntMapLang.t(HOST.lang,"Latent (d)","感染力を持つまで(日)","Latenz (T)","Латентный период (дн.)","Latencia (d)"),cfg.latentDays,0,21,1,v=>''+v,v=>cfg.latentDays=v);
          mk(window.IntMapLang.t(HOST.lang,"Infectious (d)","感染期(日)","Ansteckend (T)","Заразность (дн.)","Contagiosidad (d)"),cfg.infectiousDays,1,21,1,v=>''+v,v=>cfg.infectiousDays=v);
          mk(window.IntMapLang.t(HOST.lang,"Immunity (mo)","免疫(月)","Immunität (Mon.)","Иммунитет (мес.)","Inmunidad (meses)"),Math.min(120,cfg.naturalImmunityMonths),0,120,1,v=>v>=120?'∞':(v<=0?'—':(''+v)),v=>cfg.naturalImmunityMonths=(v>=120?600:v));
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
          const hint=document.createElement('div'); hint.style.cssText='margin-top:9px;font-size:12px;color:var(--primary-color);font-weight:600;'; hint.textContent=window.IntMapLang.t(HOST.lang,"▶ Tap a country on the map to start the outbreak there","▶ 地図で最初に流行が始まる国をタップ","▶ Tippen Sie auf der Karte ein Land an, in dem der Ausbruch beginnt","▶ Нажмите на карте страну, где начнётся вспышка","▶ Toque en el mapa el país donde comenzará el brote"); hud.appendChild(hint);
          hud.appendChild(disclaimer());
        }
        /* ⚠ SAY WHAT IT IS. CDC says it of its own measles simulator, and this one simplifies far
           more: one well-mixed compartment set per country, and importation from distance + a
           development proxy rather than from airline routes or passenger volumes. */
        function disclaimer(){ const d=document.createElement('div'); d.style.cssText='margin-top:8px;font-size:10px;color:var(--text-muted);line-height:1.4;'; d.textContent=window.IntMapLang.t(HOST.lang,"Simplified educational model (stochastic SEIR, one compartment set per country). Not a forecast.","教育目的の簡略モデル（確率的SEIR・国ごとに1区画）。予測ではありません。","Vereinfachtes Lehrmodell (stochastisches SEIR, ein Kompartimentsatz je Land). Keine Prognose.","Упрощённая учебная модель (стохастическая SEIR, один набор отсеков на страну). Это не прогноз.","Modelo educativo simplificado (SEIR estocástico, un conjunto de compartimentos por país). No es una previsión."); return d; }
        function renderRun(ended){ hud.innerHTML='';
          const stats=document.createElement('div'); stats.id='pg-pan-stats'; stats.style.cssText='margin-bottom:7px;line-height:1.65;'; hud.appendChild(stats);
          const evt=document.createElement('div'); evt.id='pg-evt'; evt.style.cssText='font-size:11px;color:var(--text-muted);margin-bottom:8px;min-height:14px;line-height:1.35;'; evt.textContent=lastEvt; hud.appendChild(evt);
          const row=document.createElement('div'); row.style.cssText='display:flex;gap:8px;align-items:center;';
          if(ended){ const again=document.createElement('button'); again.textContent=window.IntMapLang.t(HOST.lang,"New outbreak","もう一度","Neuer Ausbruch","Новая вспышка","Nuevo brote"); again.style.cssText='flex:1;border:none;border-radius:10px;background:var(--primary-color);color:#fff;padding:10px;font-weight:700;cursor:pointer;'; again.onclick=()=>{ exit(); setTimeout(()=>window._pgPandemic&&window._pgPandemic(),120); }; row.appendChild(again); }
          else { const play=document.createElement('button'); const setPlay=()=>play.textContent=running?window.IntMapLang.t(HOST.lang,"⏸ Pause","⏸ 一時停止","⏸ Pause","⏸ Пауза","⏸ Pausa"):window.IntMapLang.t(HOST.lang,"▶ Play","▶ 再開","▶ Abspielen","▶ Воспроизвести","▶ Reproducir"); play.style.cssText='flex:1;border:none;border-radius:10px;background:var(--primary-color);color:#fff;padding:9px;font-weight:700;cursor:pointer;'; play.onclick=()=>{ if(running) stop(); else start(); setPlay(); }; setPlay(); row.appendChild(play);
            /* ⚠ WALL CLOCK ONLY. ×8 shows the same epidemic sooner; it does not make a different one. */
            const spd=document.createElement('button'); spd.textContent='⏩ x'+speed; spd.style.cssText='border:none;border-radius:10px;background:var(--input-bg);color:var(--text-main);padding:9px 12px;font-weight:700;cursor:pointer;'; spd.onclick=()=>{ speed=speed>=8?1:speed*2; spd.textContent='⏩ x'+speed; }; row.appendChild(spd); }
          const ex=document.createElement('button'); ex.textContent='×'; ex.style.cssText='border:none;border-radius:10px;background:var(--input-bg);color:var(--text-main);padding:9px 12px;cursor:pointer;'; ex.onclick=exit; row.appendChild(ex);
          hud.appendChild(row); hud.appendChild(disclaimer()); updateHud();
        }
        function onPick(e){ if(!picking) return; let hit=null; for(let i=0;i<N;i++){ if(pig(e.lngLat.lng,e.lngLat.lat,feats[i].geometry)){ hit=i; break; } }
          if(hit==null) return; picking=false;
          model=createPandemicModel({countries:world,preset:preset(),params:cfg,seed:runSeed});
          model.seed(hit,cfg.initialCases); day=model.day; buildDots(); renderRun(false); start();
          news(jp()?('最初の集団感染が'+nm[hit]+'で確認されました（'+grp(cfg.initialCases)+'人）。'):('First cluster confirmed in '+nm[hit]+' ('+grp(cfg.initialCases)+' cases).'),'alert');
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
