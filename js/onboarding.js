/* ============================================================================
 *  IntMap · Welcome card, guided demo & progress control  (#R167)
 * ----------------------------------------------------------------------------
 *  First-run onboarding: the welcome card, the door to the guide tour reachable from Settings (the tour itself is js/tour-player.js's), and
 *  the shared honest progress control (window._imProgCtl) that js/map-tools.js also uses.
 *  Two factories, each called where its block used to run — the progress control sits much
 *  further down the closure than the demo.
 * ==========================================================================*/

import { IntMapLang } from './lang-registry.js';
import { GUIDE_TOUR_ID } from './tours.js';
import { isLayer, isDisplay } from './layer-manifest.js';


export function onboarding(HOST){
  const isMobile=HOST.isMobile;
  /* (guide-unify) The guided tour is no longer a mechanism of its own. It used to be a hand-written list of four
     layers a timer switched on (SHOW, 9 s each) with a pill of its own; it is now the tour the player already
     has — js/tour-player.js plays `guide`, whose steps js/tours.js derives from the examples marked `guide` in
     js/showcase.js. This function is only the DOOR: Settings ▸ Tutorial calls it with force=true.
     What the first-visit rules were, they still are (nothing calls it unforced today — the welcome card is off
     and so is the auto-run — but the rules stay with the door): once only (`intmap_demo_seen`), not on a phone
     (#R16: the heavy layers slowed the mobile start-up), and not over a thematic layer the reader already has on. */
  function _imStartDemo(force){
    if(!force){
      try{ if(localStorage.getItem('intmap_demo_seen')==='1') return; }catch(_){}
      try{ if(window.IntMapDevice.compact()) return; }catch(_){}
      /* (basic-display-not-layers) …a LAYER: the day & night and 3-D buildings rows are `.lyr-row`s too, and they are the
         map display, not layers (the manifest's `kind`) — so this asks the manifest instead of the row's class */
      if(Array.prototype.some.call(document.querySelectorAll('#layer-dropdown input[type=checkbox]:checked'),
        (cb)=>cb.classList.contains('geo-layer-cb') || (isLayer(cb.id) && !isDisplay(cb.id) && !!cb.closest('.lyr-row')))) return;
    }
    try{ localStorage.setItem('intmap_demo_seen','1'); }catch(_){}   /* a guide that has been opened has been seen — what × used to record */
    import('./tour-player.js').then((m)=>m.startTour(GUIDE_TOUR_ID,1)).catch(()=>{});
  }
  window._imStartDemo=_imStartDemo;

  /* (#R29) iOS-style first-run WELCOME card. Replaces the old auto-cycling layer "demo" that toggled
     layers on/off by itself — users mistook that for a bug ("バグと誤認") and on mobile it looked crushed.
     This is a clean, dismissible intro that explains what IntMap is, renders as a centered card on desktop
     and a bottom sheet on mobile, and offers the old showcase as an EXPLICIT, clearly-labelled opt-in
     "Watch the layer tour" button (so the feature is kept, not deleted). Built with createElement + inline
     styles only — no CSS-in-template-literal, so it can never blank the page. */
  function _imWelcome(){
    try{ if(localStorage.getItem('intmap_demo_seen')==='1') return; }catch(_){}
    if(document.getElementById('im-welcome')) return;
    /* (#R251) the language helper and its ARRAY form — see `pickArgs` in js/lang-registry.js */
    const LW=IntMapLang.pick(()=>HOST.lang), LA=IntMapLang.pickArgs();
    const jp=HOST.lang==='jp';
    const de=HOST.lang==='de';   /* (#R35) welcome screen now full 3-language (was jp/en only → leaked English in DE) */
    const isM=(typeof isMobile==='function' && isMobile());
    const ov=document.createElement('div'); ov.id='im-welcome';
    ov.style.cssText='position:fixed;inset:0;z-index:calc(var(--z-overlay) + 10);display:flex;justify-content:center;'+(isM?'align-items:flex-end;':'align-items:center;')+'background:rgba(0,0,0,0.45);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);opacity:0;transition:opacity 0.28s ease;';
    const card=document.createElement('div');
    card.style.cssText='width:min(440px,100%);max-height:92dvh;overflow-y:auto;-webkit-overflow-scrolling:touch;background:var(--popup-bg);color:var(--text-main);box-shadow:0 18px 60px rgba(0,0,0,0.4);padding:26px 24px max(24px,var(--safe-bottom)) 24px;box-sizing:border-box;'+(isM?'border-radius:22px 22px 0 0;animation:mSheetUp 0.42s var(--sheet-ease);':'border-radius:22px;margin:16px;');
    if(isM){ const g=document.createElement('div'); g.style.cssText='width:38px;height:5px;border-radius:3px;background:rgba(128,128,128,0.4);margin:-8px auto 14px;'; card.appendChild(g); }
    /* (#R30) Clean SF-Symbol-style line icons instead of emojis ("中途半端にダサい絵文字を入れるな"). */
    const ICONS={
      layers:'<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 3 7.7l9 4.7 9-4.7L12 3Z"/><path d="m3 12 9 4.7L21 12"/><path d="m3 16.3 9 4.7 9-4.7"/></svg>',
      news:'<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-6-5.7-6-10a6 6 0 0 1 12 0c0 4.3-6 10-6 10Z"/><circle cx="12" cy="11" r="2.3"/></svg>',
      globe:'<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.5 2.5 3.8 5.7 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.7-3.8-9S9.5 5.5 12 3Z"/></svg>',
      chart:'<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 15l3-4 3 2 4-6"/></svg>'
    };
    const head=document.createElement('div'); head.style.cssText='display:flex;align-items:center;gap:14px;margin:0 0 18px;';
    const icon=document.createElement('div'); icon.innerHTML='<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.5 2.5 3.8 5.7 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.7-3.8-9S9.5 5.5 12 3Z"/></svg>'; icon.style.cssText='width:56px;height:56px;border-radius:15px;background:linear-gradient(135deg,var(--primary-color),#5856d6);display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 6px 16px rgba(0,0,0,0.22);';
    const ht=document.createElement('div');
    const h1=document.createElement('div'); h1.textContent='IntMap'; h1.style.cssText='font-size:23px;font-weight:700;line-height:1.15;';
    const h2=document.createElement('div'); h2.textContent=LW('Explore the world, one layer at a time','世界を、地図で読み解く','Die Welt erkunden – Ebene für Ebene','Исследуйте мир слой за слоем','Explora el mundo, capa a capa'); h2.style.cssText='font-size:13px;color:var(--text-muted);margin-top:3px;';
    ht.appendChild(h1); ht.appendChild(h2); head.appendChild(icon); head.appendChild(ht); card.appendChild(head);
    /* (#R102) up-to-date feature list — reflects the app as it is now (100+ layers incl. live weather, the time
       machine, and the Atlas assistant / flight simulator), not the old "70+ / country data" copy. */
    /* ⚠⚠⚠ (#R251) THIS WAS THREE WHOLE LANGUAGE BLOCKS — `jp ? [...] : de ? [...] : [...]` — so the
       WELCOME CARD, the first screen a new reader ever sees, was in English for Russian, Spanish,
       French, Korean and both Chinese readers. Invisible to every instrument, and for a reason worth
       recording: the branches are not two literals (the two-branch audit), not an object keyed by a
       language (the langmap audit) and not an array indexed by one (the positional-array audit) —
       they are ARRAYS OF ROWS chosen by a boolean that was computed a hundred lines earlier
       (`const jp=HOST.lang==='jp'`). One row per feature now, each cell a call. */
    const feats=[
      ['layers',LA('100+ data layers','100以上のデータレイヤー','Über 100 Datenebenen','Более 100 слоёв данных','Más de 100 capas de datos'),
                LA('Climate, population, economy, geopolitics & live weather','気候・人口・経済・地政学・ライブ気象を地図に重ねて表示','Klima, Bevölkerung, Wirtschaft, Geopolitik & Live-Wetter','Климат, население, экономика, геополитика и погода в реальном времени','Clima, población, economía, geopolítica y meteorología en vivo')],
      ['news',LA('Live news map','ライブニュースマップ','Live-Nachrichtenkarte','Карта новостей в реальном времени','Mapa de noticias en vivo'),
              LA('World headlines pinned to where they actually happen','世界のニュースを「発生した場所」にピン表示','Schlagzeilen dort angeheftet, wo sie wirklich geschehen','Мировые новости на том месте, где они произошли','Titulares del mundo anclados donde realmente ocurren')],
      ['globe',LA('Globe, satellite & time machine','地球儀・衛星・タイムマシン','Globus, Satellit & Zeitmaschine','Глобус, спутник и машина времени','Globo, satélite y máquina del tiempo'),
               /* ⚠ (#R380 → #R604) 1900 → 1850 → AD 1: the clock's floor has moved twice, and this line,
                  which is the first thing a new reader is told about the time machine, named the old one
                  both times. It states the KERNEL's reach (js/chronos.js YMIN), so it must not be edited
                  to match any one data source — tests/history-chronos-clock-checks.test.mjs #R380 ① compares it with the kernel. */
               LA('3D terrain, real imagery, and time travel back to AD 1','3D地形と実写衛星画像、西暦1年までの時間旅行','3D-Gelände, echte Satellitenbilder und Zeitreisen zurück bis ins Jahr 1','3D-рельеф, реальные снимки и путешествие во времени вплоть до 1 года н. э.','Relieve 3D, imágenes reales y viaje en el tiempo hasta el año 1')],
      ['chart',LA('Atlas AI & country data','Atlas AI・国データ','Atlas-KI & Länderdaten','Atlas ИИ и данные по странам','Atlas IA y datos por país'),
               LA('Ask in plain language, compare countries, even fly a jet','自然言語で操作、国どうしを比較、フライトシミュレーターも','In normaler Sprache steuern, Länder vergleichen, Flugsimulator','Спрашивайте обычным языком, сравнивайте страны и даже летайте','Pregunta en lenguaje natural, compara países e incluso pilota un avión')]
    ];
    const list=document.createElement('div'); list.style.cssText='display:flex;flex-direction:column;gap:16px;margin:0 0 22px;';
    const tints=['rgba(0,122,255,0.15)','rgba(255,59,48,0.15)','rgba(52,199,89,0.15)','rgba(175,82,222,0.15)'];
    const tintFg=['#0a84ff','#ff3b30','#34c759','#af52de'];
    feats.forEach((f,i)=>{ const row=document.createElement('div'); row.style.cssText='display:flex;align-items:center;gap:13px;';
      const ic=document.createElement('div'); ic.innerHTML=ICONS[f[0]]||''; ic.style.cssText='width:38px;height:38px;border-radius:10px;background:'+tints[i%tints.length]+';color:'+tintFg[i%tintFg.length]+';display:flex;align-items:center;justify-content:center;flex-shrink:0;';
      const tx=document.createElement('div');
      const t1=document.createElement('div'); t1.textContent=LW.arr(f[1]); t1.style.cssText='font-size:14.5px;font-weight:600;line-height:1.2;';
      const t2=document.createElement('div'); t2.textContent=LW.arr(f[2]); t2.style.cssText='font-size:12px;color:var(--text-muted);margin-top:2px;line-height:1.3;';
      tx.appendChild(t1); tx.appendChild(t2); row.appendChild(ic); row.appendChild(tx); list.appendChild(row); });
    card.appendChild(list);
    const close=()=>{ try{ localStorage.setItem('intmap_demo_seen','1'); }catch(_){} ov.style.opacity='0'; setTimeout(()=>{ try{ ov.remove(); }catch(_){} },280); };
    const primary=document.createElement('button'); primary.textContent=LW('Start exploring','使ってみる','Loslegen','Начать','Empezar a explorar');
    primary.style.cssText='width:100%;padding:14px;border:none;border-radius:13px;background:var(--primary-fill);color:#fff;font-size:15.5px;font-weight:600;cursor:pointer;';
    primary.onclick=close; card.appendChild(primary);
    /* (#R102) the "Play Satellite Drop" and "Watch the layer tour" buttons were removed from the Start card per request
       ("satellite drop, watch the layer tourボタンはいらない"). Both features remain reachable — Satellite Drop from the
       Playground, and the layer tour from Settings → Tutorial — so nothing is deleted, just off the welcome screen. */
    ov.appendChild(card);
    ov.addEventListener('click',(e)=>{ if(e.target===ov) close(); });
    (document.body||document.documentElement).appendChild(ov);
    window.IntMapDialog.open(ov,{ panel:card, close });   /* (a11y-shared-dialog) Escape = «Start exploring», Tab trap, named by its heading */
    /* Fade in — rAF for the smooth case + a setTimeout fallback so the card can NEVER get stuck at
       opacity:0 (rAF is paused while the tab is backgrounded). */
    requestAnimationFrame(()=>{ ov.style.opacity='1'; });
    setTimeout(()=>{ try{ ov.style.opacity='1'; }catch(_){} },80);
  }
  window._imWelcome=_imWelcome;
}

export function progressCtl(HOST){
  /* (#R139) HONEST population-progress control shared by the measure/radius panel and the Draw tool. The bar it
     drives replaced a time-based ease-out that DECELERATED toward 92% and snapped to 100%
     ("100%に近づくほど遅くなる／グラフの意味を成さない"): every number it shows is measured.
     ══ ⚠⚠ (#R254) …AND IT WAS THE ONLY BAR IN THE APP WITH A UI OF ITS OWN ════════════════════════
     「進捗バーがおかしい。勝手にほかの進捗バーと違うUIにするな。」 MEASURED on the shipped build: this
     control's `busy()` put the fill into an `.indet` class — a 42%-wide accent band swept across the
     track by a CSS animation, with the percentage element EMPTIED. Every other progress bar in the
     app (js/seismic.js `sq-progb`, js/terrain-water.js `tw-prog-bar`, js/viewshed.js) is the same
     shape as each other and a different shape from this one: a plain `var(--prog-grad)` fill whose
     WIDTH is the fraction, with the number beside it.
     The reason it was different was real — a sub-cap WorldPop sum is ONE request and one request has
     no fraction — so the fix is upstream of the UI: js/sims.js now tiles EVERY area, which makes
     `done/total` a measured fraction for every sum there is. With a real fraction always available,
     the indeterminate mode has nothing left to represent: `busy()` is «started, nothing finished
     yet» = 0%, drawn exactly like the other bars, and the `.indet` CSS is gone. */
  window._imProgCtl=function(box){
    const fill=box&&box.querySelector('.tp-prog-fill'), pct=box&&box.querySelector('.tp-prog-pct');
    let shown=0;
    const put=(f)=>{ try{ if(fill) fill.style.width=(f*100).toFixed(0)+'%'; if(pct) pct.textContent=(f*100).toFixed(0)+'%'; }catch(_){} };
    return {
      busy(){ shown=0; put(0); },
      set(f){ f=Math.max(0,Math.min(1,+f||0)); if(f<shown) f=shown; shown=f; put(f); },
      done(){ shown=1; put(1); }
    };
  };
}
