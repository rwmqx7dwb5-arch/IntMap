/* ============================================================================
 *  IntMap · Welcome card, guided demo & progress control (#R167)  (#R167)
 * ----------------------------------------------------------------------------
 *  First-run onboarding: the welcome card, the guided map demo reachable from Settings, and
 *  the shared honest progress control (window._imProgCtl) that js/map-tools.js also uses.
 *  Two factories, each called where its block used to run — the progress control sits much
 *  further down the closure than the demo.
 * ==========================================================================*/

window.IntMapModules=window.IntMapModules||{};

window.IntMapModules.onboarding=function(map,HOST){
  const ensurePlaceLabels=HOST.ensurePlaceLabels, applyLabelLang=HOST.applyLabelLang, isMobile=HOST.isMobile;
  /* (#R15c) First-visit showcase — a new user reported the map "was initially just black". On the very
     first visit (nothing seen before) we auto-cycle a few colorful layers with a bottom pill that names
     the layer being shown + play/pause + dismiss. It stops the moment the user toggles any layer or hits ✕,
     and remembers it's been seen so it never nags again. Purely additive; touches only its own pill. */
  function _imStartDemo(force){
    /* (#R21) force=true → the Settings "Tutorial" button re-runs the showcase on demand. */
    if(!force){
      try{ if(localStorage.getItem('intmap_demo_seen')==='1') return; }catch(_){}
      /* (#R16) Skip the auto-demo on phones: it eagerly loaded 4 heavy layers (incl. Köppen) on the very
         first visit — slowing the mobile startup the user called slow, and adding to the Köppen OOM risk.
         Mobile gets a clean, fast first paint instead. Desktop keeps the showcase. */
      try{ if(window.matchMedia && window.matchMedia('(max-width:768px)').matches) return; }catch(_){}
    }
    if(typeof map==='undefined'||!map) return;
    try{ const old=document.getElementById('im-demo-pill'); if(old) old.remove(); }catch(_){}
    const jp=()=>HOST.lang==='jp';
    const SHOW=[['dl-climate','Köppen climate','ケッペン気候区分'],['dl-nightsat','Night lights','夜間光（衛星）'],['dl-relief','Elevation relief','標高（段彩）'],['dl-popgrid','Population density (1 km grid)','人口密度（1kmグリッド）']];
    /* don't start if a thematic layer is already on */
    if(!force && document.querySelectorAll('#layer-dropdown .lyr-row.on, #layer-dropdown input.geo-layer-cb:checked').length) return;
    let idx=-1,timer=null,paused=false,demoToggling=false,done=false,curId=null;
    const gcb=(id)=>document.getElementById(id);
    const pill=document.createElement('div'); pill.id='im-demo-pill';
    pill.style.cssText='position:absolute;left:50%;transform:translateX(-50%);bottom:calc(var(--sheet-cover, 20px) + 20px);z-index:1300;display:flex;align-items:center;gap:9px;padding:7px 13px;border-radius:999px;background:var(--popup-bg);border:1px solid rgba(128,128,128,0.22);box-shadow:var(--shadow);backdrop-filter:blur(14px);font-size:12.5px;color:var(--text-main);max-width:92vw;';
    (document.getElementById('map-container')||document.body).appendChild(pill);
    const setOff=(id)=>{ const c=id&&gcb(id); if(c&&c.checked){ demoToggling=true; c.checked=false; try{ c.dispatchEvent(new Event('change',{bubbles:true})); }catch(_){} setTimeout(()=>{ demoToggling=false; },0); } };
    const setOn=(id)=>{ const c=gcb(id); if(c&&!c.checked){ demoToggling=true; c.checked=true; try{ c.dispatchEvent(new Event('change',{bubbles:true})); }catch(_){} setTimeout(()=>{ demoToggling=false; },0); } };
    function render(name){ pill.innerHTML='';
      /* (#R22) Make it unmistakable this is a TEMPORARY one-time intro auto-play, not a permanent state —
         a pulsing "AUTO" badge + "intro demo" wording + an explicit "End tour" button. */
      const badge=document.createElement('span'); badge.textContent=jp()?'自動再生':'AUTO';
      badge.style.cssText='font-size:9.5px;font-weight:800;letter-spacing:0.06em;padding:2px 6px;border-radius:999px;background:var(--primary-color);color:#fff;text-transform:uppercase;animation:imDemoPulse 1.6s ease-in-out infinite;';
      pill.appendChild(badge);
      const t=document.createElement('span'); t.innerHTML='<span style="opacity:0.7;">'+(jp()?'初回デモ:':'Intro demo:')+'</span> <b>'+name+'</b>'; pill.appendChild(t);
      /* (#R32) iOS-clean controls — SVG play/pause + a circular × instead of the ▶ ⏸ ✕ emoji
         ("中途半端にダサい絵文字を入れるな / iOS風にしろ"). */
      const _svgPlay='<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
      const _svgPause='<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>';
      const pb=document.createElement('button'); pb.innerHTML=paused?_svgPlay:_svgPause; pb.title=paused?(jp()?'再開':'Play'):(jp()?'一時停止':'Pause'); pb.style.cssText='background:var(--input-bg);border:none;color:var(--text-main);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;flex:0 0 auto;'; pb.onclick=()=>{ paused=!paused; if(!paused) schedule(); else clearTimeout(timer); render(name); }; pill.appendChild(pb);
      const xb=document.createElement('button'); xb.innerHTML='<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>'; xb.title=jp()?'デモを終了':'End the intro demo'; xb.setAttribute('aria-label',jp()?'終了':'End tour'); xb.style.cssText='background:var(--input-bg);border:none;border-radius:50%;color:var(--text-main);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;flex:0 0 auto;margin-left:2px;'; xb.onclick=()=>stop(true); pill.appendChild(xb); }
    /* (#R25) 6.5s → 9s dwell: the GIBS night-lights raster and the DEM color-relief need longer to fetch
       + paint than the instant Köppen image, so at 6.5s they were toggled OFF before they finished loading
       ("night lights と elevation relief が表示されない"). 9s gives every showcase layer time to appear. */
    function schedule(){ clearTimeout(timer); timer=setTimeout(next,9000); }
    function next(){ if(done||paused) return; try{ setOff(curId); idx=(idx+1)%SHOW.length; const s=SHOW[idx]; curId=s[0]; setOn(curId); render(jp()?s[2]:s[1]); }catch(_){} schedule(); }
    /* (#R25) Pressing the × on ANY layer legend ends the demo too ("どれかのレイヤの凡例の×を押せばintro demoも
       終了"). Some legend ×'s only hide the legend without firing a checkbox change, so the dropdown-change
       listener below wouldn't catch them — hook the close controls explicitly (capture phase). */
    const onLegendX=(e)=>{ try{ if(e.target&&e.target.closest&&e.target.closest('.layer-popup-x,.kip-x')) stop(true); }catch(_){} };
    document.addEventListener('click',onLegendX,true);
    function stop(markSeen){ if(done) return; done=true; clearTimeout(timer);
      try{ document.removeEventListener('click',onLegendX,true); }catch(_){}
      /* (#R23) turn off EVERY layer the demo could have switched on (not just the current one) so it can
         never leave an orphan layer behind ("オンのままで active layers に出ず消せない"). */
      try{ SHOW.forEach(s=>setOff(s[0])); }catch(_){ setOff(curId); }
      /* (#R28) belt-and-suspenders: force-hide the demo's MAP layers directly too. If a setOff change handler
         ran while the map was still busy (the demo starts ~1.4s after load), the checkbox could end up OFF
         while the raster stayed VISIBLE — a true orphan ("オンなのにactive layersに出ず消せない"). Hiding the
         actual layers here guarantees the demo can never strand one. */
      try{ ['lyr-climate','lyr-nightsat','lyr-relief','lyr-popgrid'].forEach(l=>{ if(map.getLayer&&map.getLayer(l)) map.setLayoutProperty(l,'visibility','none'); }); }catch(_){}
      window._imDemoActive=false;
      /* (#R27) Re-assert place labels after the demo so the default names aren't left hidden by the
         demo's layer cycling ("デフォルトで地名ラベルが出ない"). */
      try{ ensurePlaceLabels(); applyLabelLang(); window._raiseLabelLayers&&window._raiseLabelLayers(); }catch(_){}
      try{ pill.remove(); }catch(_){} if(markSeen){ try{ localStorage.setItem('intmap_demo_seen','1'); }catch(_){} }
      try{ const sv=window.IntMapBookmark&&window.IntMapBookmark.save; if(sv) sv(); }catch(_){}   /* re-sync the hash to the real (demo-free) layer set */ }
    const dd=document.getElementById('layer-dropdown');
    if(dd) dd.addEventListener('change',(e)=>{ if(!demoToggling && e.target && e.target.type==='checkbox') stop(true); });
    window._imDemoStop=()=>stop(true);
    window._imDemoActive=true;
    next();
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
    const jp=HOST.lang==='jp';
    const de=HOST.lang==='de';   /* (#R35) welcome screen now full 3-language (was jp/en only → leaked English in DE) */
    const isM=(typeof isMobile==='function' && isMobile());
    const ov=document.createElement('div'); ov.id='im-welcome';
    ov.style.cssText='position:fixed;inset:0;z-index:100000;display:flex;justify-content:center;'+(isM?'align-items:flex-end;':'align-items:center;')+'background:rgba(0,0,0,0.45);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);opacity:0;transition:opacity 0.28s ease;';
    const card=document.createElement('div');
    card.style.cssText='width:min(440px,100%);max-height:92dvh;overflow-y:auto;-webkit-overflow-scrolling:touch;background:var(--popup-bg);color:var(--text-main);box-shadow:0 18px 60px rgba(0,0,0,0.4);padding:26px 24px max(24px,env(safe-area-inset-bottom)) 24px;box-sizing:border-box;'+(isM?'border-radius:22px 22px 0 0;animation:mSheetUp 0.42s var(--sheet-ease);':'border-radius:22px;margin:16px;');
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
    const h2=document.createElement('div'); h2.textContent=jp?'世界を、地図で読み解く':de?'Die Welt erkunden – Ebene für Ebene':'Explore the world, one layer at a time'; h2.style.cssText='font-size:13px;color:var(--text-muted);margin-top:3px;';
    ht.appendChild(h1); ht.appendChild(h2); head.appendChild(icon); head.appendChild(ht); card.appendChild(head);
    /* (#R102) up-to-date feature list — reflects the app as it is now (100+ layers incl. live weather, the time
       machine, and the Atlas assistant / flight simulator), not the old "70+ / country data" copy. */
    const feats=jp?[
      ['layers','100以上のデータレイヤー','気候・人口・経済・地政学・ライブ気象を地図に重ねて表示'],
      ['news','ライブニュースマップ','世界のニュースを「発生した場所」にピン表示'],
      ['globe','地球儀・衛星・タイムマシン','3D地形と実写衛星画像、1900年まで遡って表示'],
      ['chart','Atlas AI・国データ','自然言語で操作、国どうしを比較、フライトシミュレーターも']
    ]:de?[
      ['layers','Über 100 Datenebenen','Klima, Bevölkerung, Wirtschaft, Geopolitik & Live-Wetter'],
      ['news','Live-Nachrichtenkarte','Schlagzeilen dort angeheftet, wo sie wirklich geschehen'],
      ['globe','Globus, Satellit & Zeitmaschine','3D-Gelände, echte Satellitenbilder, zurück bis 1900'],
      ['chart','Atlas-KI & Länderdaten','In normaler Sprache steuern, Länder vergleichen, Flugsimulator']
    ]:[
      ['layers','100+ data layers','Climate, population, economy, geopolitics & live weather'],
      ['news','Live news map','World headlines pinned to where they actually happen'],
      ['globe','Globe, satellite & time machine','3D terrain, real imagery, and travel back to 1900'],
      ['chart','Atlas AI & country data','Ask in plain language, compare countries, even fly a jet']
    ];
    const list=document.createElement('div'); list.style.cssText='display:flex;flex-direction:column;gap:16px;margin:0 0 22px;';
    const tints=['rgba(0,122,255,0.15)','rgba(255,59,48,0.15)','rgba(52,199,89,0.15)','rgba(175,82,222,0.15)'];
    const tintFg=['#0a84ff','#ff3b30','#34c759','#af52de'];
    feats.forEach((f,i)=>{ const row=document.createElement('div'); row.style.cssText='display:flex;align-items:center;gap:13px;';
      const ic=document.createElement('div'); ic.innerHTML=ICONS[f[0]]||''; ic.style.cssText='width:38px;height:38px;border-radius:10px;background:'+tints[i%tints.length]+';color:'+tintFg[i%tintFg.length]+';display:flex;align-items:center;justify-content:center;flex-shrink:0;';
      const tx=document.createElement('div');
      const t1=document.createElement('div'); t1.textContent=f[1]; t1.style.cssText='font-size:14.5px;font-weight:600;line-height:1.2;';
      const t2=document.createElement('div'); t2.textContent=f[2]; t2.style.cssText='font-size:12px;color:var(--text-muted);margin-top:2px;line-height:1.3;';
      tx.appendChild(t1); tx.appendChild(t2); row.appendChild(ic); row.appendChild(tx); list.appendChild(row); });
    card.appendChild(list);
    const close=()=>{ try{ localStorage.setItem('intmap_demo_seen','1'); }catch(_){} ov.style.opacity='0'; setTimeout(()=>{ try{ ov.remove(); }catch(_){} },280); };
    const primary=document.createElement('button'); primary.textContent=jp?'使ってみる':de?'Loslegen':'Start exploring';
    primary.style.cssText='width:100%;padding:14px;border:none;border-radius:13px;background:var(--primary-color);color:#fff;font-size:15.5px;font-weight:600;cursor:pointer;';
    primary.onclick=close; card.appendChild(primary);
    /* (#R102) the "Play Satellite Drop" and "Watch the layer tour" buttons were removed from the Start card per request
       ("satellite drop, watch the layer tourボタンはいらない"). Both features remain reachable — Satellite Drop from the
       Playground, and the layer tour from Settings → Tutorial — so nothing is deleted, just off the welcome screen. */
    ov.appendChild(card);
    ov.addEventListener('click',(e)=>{ if(e.target===ov) close(); });
    (document.body||document.documentElement).appendChild(ov);
    /* Fade in — rAF for the smooth case + a setTimeout fallback so the card can NEVER get stuck at
       opacity:0 (rAF is paused while the tab is backgrounded). */
    requestAnimationFrame(()=>{ ov.style.opacity='1'; });
    setTimeout(()=>{ try{ ov.style.opacity='1'; }catch(_){} },80);
  }
  window._imWelcome=_imWelcome;
};

window.IntMapModules.progressCtl=function(map,HOST){
  /* (#R139) HONEST population-progress control shared by the measure/radius panel and the Draw tool. WorldPop gives
     NO real % for a single request (its task API only reports created/finished/error), so any determinate number
     there is fabricated — the old bar was a time-based ease-out that DECELERATED toward 92% and snapped to 100%
     ("100%に近づくほど遅くなる／グラフの意味を成さない"). This control is honest: `busy()` shows an INDETERMINATE animated
     sweep with no % while there is no real fraction; `set(f)` shows a REAL, MONOTONIC linear fraction the moment one
     exists (a large area that must be TILED reports tiles-done/total; radius reports circles-done/N). */
  window._imProgCtl=function(box){
    const fill=box&&box.querySelector('.tp-prog-fill'), pct=box&&box.querySelector('.tp-prog-pct');
    let shown=0;
    return {
      busy(){ try{ box.classList.add('indet'); if(pct) pct.textContent=''; }catch(_){} },
      set(f){ try{ box.classList.remove('indet'); f=Math.max(0,Math.min(1,+f||0)); if(f<shown) f=shown; shown=f; if(fill) fill.style.width=(f*100).toFixed(0)+'%'; if(pct) pct.textContent=(f*100).toFixed(0)+'%'; }catch(_){} },
      done(){ try{ box.classList.remove('indet'); shown=1; if(fill) fill.style.width='100%'; if(pct) pct.textContent='100%'; }catch(_){} }
    };
  };
};
