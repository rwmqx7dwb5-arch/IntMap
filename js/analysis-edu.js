/* ============================================================================
 *  IntMap · Quiz mode — the implementation behind window.IntMapEdu  (#R315)
 * ----------------------------------------------------------------------------
 *  Fetched by js/lazy-modules.js when the quiz is opened (Playground → Quiz, or Atlas's `edu`
 *  action). ⚠ TWO THINGS DID NOT MOVE, because they exist before anybody asks for the quiz:
 *  #edu-mount / #btn-edu (the Playground button in the Layers panel) and the map `click`
 *  subscription, both of which stay in the shell in js/analysis-panels.js. The shell forwards a
 *  click here only when the loader says this file has arrived, so a map click never starts a fetch.
 *
 *  ⚠ The published global is `__imAnalysis…`, not `IntMap…` — js/atlas-controls.js's
 *  moduleCatalog() discovers `window.IntMap*` by enumeration.
 * ==========================================================================*/
window.IntMapModules=window.IntMapModules||{};
window.IntMapModules.analysisEdu=function(HOST){
 const GE=()=>window.IntMapGeoEngine;   /* (#R178) the renderer, through the contract — never the raw handle */
  /* stable closure values (never reassigned) — rebound under their original names so the moved body stays verbatim */
  const countryStats=HOST.countryStats, t=HOST.t, makeDraggable=HOST.makeDraggable, resolveCountryId=HOST.resolveCountryId, fmtMoney=HOST.fmtMoney, hasTurf=HOST.hasTurf;
  window.__imAnalysisEdu=(function(){
    const jp=()=>HOST.lang==='jp';
    let panel=null, mode=null, q=null, score=0, streak=0, total=0, mapQuizArmed=false;
    const esc=(s)=>String(s==null?'':s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
    function pool(){ try{ return Object.values(countryStats||{}).filter(s=>s&&s.nameEn&&s.flag&&(s.pop||0)>300000); }catch(_){ return []; } }
    function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
    function cname(s){ return jp()?(s.nameJp||s.nameEn):s.nameEn; }
    function ensure(){ if(panel) return panel;
      panel=document.createElement('div'); panel.className='tool-panel'; panel.id='edu-panel';
      panel.style.cssText='display:none;position:absolute;top:70px;left:50%;transform:translateX(-50%);z-index:1600;width:min(340px,calc(100vw - 24px));max-height:min(72vh,600px);overflow-y:auto;';
      (document.getElementById('map-container')||document.body).appendChild(panel);
      return panel; }
    /* (#R21) Renamed to QUIZ MODE; flags render via flagcdn images (Windows shows emoji flags as
       bare letters like "DE"); 4 new quiz types: country→capital, population duel, area duel,
       country silhouette. */
    const flagH=(s,h)=>window.imFlagHTML?window.imFlagHTML(s&&s.flag,h||20):((s&&s.flag)||'');
    function header(){ return '<div class="tp-header" style="cursor:move;"><span class="tp-title">🎓 '+(window.IntMapLang.t(HOST.lang,"Quiz mode","クイズモード","Quizmodus","Режим викторины","Modo cuestionario"))+'</span><button class="tp-close" title="'+t('close')+'">×</button></div>'+
      '<div style="font-size:11px;color:var(--text-muted);margin:0 0 8px;">'+(window.IntMapLang.t(HOST.lang,"Score ","スコア ","Punkte ","Счёт ","Puntuación "))+score+'/'+total+' · '+(window.IntMapLang.t(HOST.lang,"streak ","連続正解 ","Serie ","серия ","racha "))+streak+'</div>'; }
    function wire(){ panel.querySelector('.tp-close').onclick=closeP; try{ makeDraggable(panel,panel.querySelector('.tp-header')); }catch(_){} }
    function menu(){ const p=ensure(); mapQuizArmed=false; p.style.display='block';
      p.innerHTML=header()+
        '<div style="display:flex;flex-direction:column;gap:7px;">'+
        '<button class="ai-test-btn" data-q="flag" style="width:100%;">🚩 '+(window.IntMapLang.t(HOST.lang,"Flag quiz (flag → country)","国旗クイズ（国旗→国名）","Flaggenquiz (Flagge → Land)","Викторина по флагам (флаг → страна)","Cuestionario de banderas (bandera → país)"))+'</button>'+
        '<button class="ai-test-btn" data-q="capital" style="width:100%;">🏛 '+(window.IntMapLang.t(HOST.lang,"Capital quiz (capital → country)","首都クイズ（首都→国名）","Hauptstadtquiz (Hauptstadt → Land)","Викторина о столицах (столица → страна)","Cuestionario de capitales (capital → país)"))+'</button>'+
        '<button class="ai-test-btn" data-q="capital2" style="width:100%;">🏙 '+(window.IntMapLang.t(HOST.lang,"Capital quiz (country → capital)","首都クイズ（国名→首都）","Hauptstadtquiz (Land → Hauptstadt)","Викторина о столицах (страна → столица)","Cuestionario de capitales (país → capital)"))+'</button>'+
        '<button class="ai-test-btn" data-q="map" style="width:100%;">🗺 '+(window.IntMapLang.t(HOST.lang,"Map quiz (click the country)","地図クイズ（国を地図でクリック）","Kartenquiz (Land anklicken)","Викторина по карте (кликните по стране)","Cuestionario de mapa (haga clic en el país)"))+'</button>'+
        '<button class="ai-test-btn" data-q="shape" style="width:100%;">⬛ '+(window.IntMapLang.t(HOST.lang,"Silhouette quiz (shape → country)","シルエットクイズ（国の形→国名）","Umrissquiz (Form → Land)","Викторина по силуэтам (форма → страна)","Cuestionario de siluetas (forma → país)"))+'</button>'+
        '<button class="ai-test-btn" data-q="duelpop" style="width:100%;">👥 '+(window.IntMapLang.t(HOST.lang,"Population duel (which is bigger?)","人口対決（どちらが多い?）","Bevölkerungsduell (welches ist größer?)","Дуэль по населению (где больше?)","Duelo de población (¿cuál es mayor?)"))+'</button>'+
        '<button class="ai-test-btn" data-q="duelarea" style="width:100%;">📐 '+(window.IntMapLang.t(HOST.lang,"Area duel (which is larger?)","面積対決（どちらが広い?）","Flächenduell (welches ist größer?)","Дуэль по площади (что больше?)","Duelo de superficie (¿cuál es mayor?)"))+'</button>'+
        '<div style="font-size:10.5px;color:var(--text-muted);line-height:1.5;margin-top:4px;">'+(window.IntMapLang.t(HOST.lang,"Each answer shows a learning card about the country.","正解すると、その国の解説カードが表示されます。","Nach jeder Antwort erscheint eine Lernkarte zum Land.","После каждого ответа показывается карточка с фактами о стране.","Cada respuesta muestra una ficha didáctica sobre el país."))+'</div></div>';
      wire(); p.querySelectorAll('[data-q]').forEach(b=>b.onclick=()=>{ mode=b.getAttribute('data-q'); next(); }); }
    /* country silhouette → compact SVG (equirectangular, cos-lat corrected; antimeridian spanners skipped) */
    function shapeSVG(code){ try{
      if(!window.countryGeo) return null;
      const f=(HOST.countryGeo.features||[]).find(x=>{ try{ return resolveCountryId(x)===code; }catch(_){ return false; } });
      if(!f||!f.geometry) return null;
      const polys=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.type==='MultiPolygon'?f.geometry.coordinates:[];
      let minX=999,minY=999,maxX=-999,maxY=-999; const rings=[];
      polys.forEach(p=>{ const r=p&&p[0]; if(!r||r.length<4) return; rings.push(r);
        r.forEach(c=>{ if(c[0]<minX)minX=c[0]; if(c[0]>maxX)maxX=c[0]; if(c[1]<minY)minY=c[1]; if(c[1]>maxY)maxY=c[1]; }); });
      if(!rings.length||maxX-minX<=0||maxY-minY<=0) return null;
      if(maxX-minX>180) return null;
      const cosm=Math.max(0.15,Math.cos((minY+maxY)/2*Math.PI/180));
      const W=170,H=120,pad=8;
      const s=Math.min((W-2*pad)/((maxX-minX)*cosm),(H-2*pad)/(maxY-minY));
      const ox=(W-(maxX-minX)*cosm*s)/2, oy=(H-(maxY-minY)*s)/2;
      let d='';
      rings.forEach(r=>{ const step=Math.max(1,Math.floor(r.length/180));
        for(let i=0;i<r.length;i+=step){ const c=r[i];
          d+=(i===0?'M':'L')+((c[0]-minX)*cosm*s+ox).toFixed(1)+' '+((maxY-c[1])*s+oy).toFixed(1)+' '; }
        d+='Z '; });
      return '<svg width="'+W+'" height="'+H+'" viewBox="0 0 '+W+' '+H+'" style="display:block;margin:4px auto 10px;"><path d="'+d+'" fill="var(--primary-color)" fill-opacity="0.75" stroke="var(--text-main)" stroke-width="0.8" fill-rule="evenodd"/></svg>';
    }catch(_){ return null; } }
    function card(s,ok,extra){ const f=(v)=>{ if(v==null) return '—'; if(v>=1e9) return (v/1e9).toFixed(2)+'B'; if(v>=1e6) return (v/1e6).toFixed(1)+'M'; return Number(Math.round(v)).toLocaleString(); };
      return '<div style="border:1px solid '+(ok?'rgba(52,199,89,0.5)':'rgba(255,69,58,0.5)')+';border-radius:12px;padding:10px 12px;margin-top:8px;background:'+(ok?'rgba(52,199,89,0.08)':'rgba(255,69,58,0.07)')+';font-size:12px;line-height:1.6;">'+
        '<div style="font-weight:700;font-size:14px;">'+(ok?'⭕':'❌')+' '+flagH(s,18)+' '+esc(cname(s))+'</div>'+(extra||'')+
        '<div style="color:var(--text-muted);margin-top:3px;">'+(window.IntMapLang.t(HOST.lang,"Capital","首都","Hauptstadt","Столица","Capital"))+': '+esc(s.capital||'—')+' · '+(window.IntMapLang.t(HOST.lang,"Pop","人口","Bev.","Нас.","Pobl."))+': '+f(s.pop)+(s.gdp!=null?' · GDP: '+(typeof fmtMoney==='function'?fmtMoney(s.gdp):'$'+s.gdp+'B'):'')+(s.area!=null?' · '+f(s.area)+' km²':'')+'</div></div>'; }
    function next(){ const p=ensure(); const all=pool();
      if(all.length<8){ p.innerHTML=header()+'<div style="font-size:12px;color:var(--text-muted);">'+(window.IntMapLang.t(HOST.lang,"Country data is still loading — try again in a moment.","国データを読み込み中です。少し待ってから開いてください。","Länderdaten werden noch geladen — bitte gleich erneut versuchen.","Данные по странам ещё загружаются — попробуйте через мгновение.","Los datos de países aún se están cargando; inténtelo en un momento."))+'</div>'; wire(); return; }
      let answer=pick(all);
      q={answer};
      if(mode==='map'){
        mapQuizArmed=true;
        p.innerHTML=header()+'<div style="font-size:13px;font-weight:700;margin-bottom:6px;">🗺 '+(window.IntMapLang.t(HOST.lang,"Click on the map:","地図上でクリック:","Auf die Karte klicken:","Кликните по карте:","Haga clic en el mapa:"))+'</div>'+
          '<div style="font-size:17px;font-weight:800;color:var(--primary-color);margin-bottom:8px;">'+flagH(answer,18)+' '+esc(cname(answer))+'</div>'+
          '<div id="edu-map-res" style="font-size:12px;color:var(--text-muted);">'+(window.IntMapLang.t(HOST.lang,"Click that country on the map…","地図のその国をクリックしてください…","Dieses Land auf der Karte anklicken…","Кликните по этой стране на карте…","Haga clic en ese país en el mapa…"))+'</div>'+
          '<button class="ai-test-btn" id="edu-skip" style="width:100%;margin-top:8px;">'+(window.IntMapLang.t(HOST.lang,"Skip","スキップ","Überspringen","Пропустить","Omitir"))+'</button>';
        wire(); p.querySelector('#edu-skip').onclick=()=>{ total++; streak=0; next(); };
        return;
      }
      /* (#R21) DUEL quizzes — two countries, pick the one with the higher metric (≥20% apart so
         the question is fair). */
      if(mode==='duelpop'||mode==='duelarea'){
        const metric=mode==='duelpop'?(s=>s.pop):(s=>s.area);
        let a=null,b=null,tries=0;
        while(tries++<60){ a=pick(all); b=pick(all);
          const va=metric(a),vb=metric(b);
          if(a!==b&&va&&vb&&Math.max(va,vb)/Math.min(va,vb)>=1.2) break; a=null; }
        if(!a){ next(); return; }
        const win=metric(a)>=metric(b)?a:b;
        const fmt=(v)=>{ if(v==null) return '—'; if(v>=1e9) return (v/1e9).toFixed(2)+'B'; if(v>=1e6) return (v/1e6).toFixed(1)+'M'; return Number(Math.round(v)).toLocaleString(); };
        const unit=mode==='duelarea'?' km²':'';
        p.innerHTML=header()+'<div style="font-size:12.5px;font-weight:700;margin-bottom:8px;">'+(mode==='duelpop'?(window.IntMapLang.t(HOST.lang,"👥 Which has the larger population?","👥 人口が多いのはどっち?","👥 Welches Land hat mehr Einwohner?","👥 Где население больше?","👥 ¿Cuál tiene más población?")):(window.IntMapLang.t(HOST.lang,"📐 Which is larger by area?","📐 面積が広いのはどっち?","📐 Welches Land ist flächenmäßig größer?","📐 Что больше по площади?","📐 ¿Cuál es mayor en superficie?")))+'</div>'+
          '<div style="display:flex;flex-direction:column;gap:6px;">'+[a,b].map((o,i)=>'<button class="ai-test-btn" data-d="'+i+'" style="width:100%;text-align:left;">'+flagH(o,16)+' '+esc(cname(o))+'</button>').join('')+'</div><div id="edu-res"></div>';
        wire();
        p.querySelectorAll('[data-d]').forEach(btn=>btn.onclick=()=>{
          const chosen=[a,b][+btn.getAttribute('data-d')]; const ok=chosen===win; total++; if(ok){ score++; streak++; } else streak=0;
          const both='<div style="font-size:11px;margin-top:3px;">'+esc(cname(a))+': <b>'+fmt(metric(a))+unit+'</b> · '+esc(cname(b))+': <b>'+fmt(metric(b))+unit+'</b></div>';
          const res=p.querySelector('#edu-res'); if(res) res.innerHTML=card(win,ok,both)+'<button class="ai-test-btn" id="edu-next" style="width:100%;margin-top:8px;">'+(window.IntMapLang.t(HOST.lang,"Next →","次の問題 →","Weiter →","Далее →","Siguiente →"))+'</button>';
          const nx=p.querySelector('#edu-next'); if(nx) nx.onclick=next;
          p.querySelectorAll('[data-d]').forEach(x=>x.disabled=true);
        });
        return;
      }
      /* (#R21) SILHOUETTE quiz — the country's real outline from countryGeo. */
      let shape=null;
      if(mode==='shape'){
        let tries=0; while(tries++<40){ shape=shapeSVG(answer.code); if(shape) break; answer=pick(all); }
        if(!shape){ mode='flag'; }
        q={answer};
      }
      const wrong=[]; while(wrong.length<3){ const w=pick(all); if(w!==answer&&!wrong.includes(w)) wrong.push(w); }
      const opts=[answer,...wrong].sort(()=>Math.random()-0.5);
      /* (#R21) country→capital variant: options are CAPITALS */
      const cap2=(mode==='capital2');
      const qhtml=(mode==='flag')
        ?'<div style="text-align:center;margin:6px 0 12px;">'+flagH(answer,56)+'</div>'
        :(mode==='shape')?shape
        :cap2?'<div style="font-size:17px;font-weight:800;color:var(--primary-color);text-align:center;margin:6px 0 10px;">'+flagH(answer,18)+' '+esc(cname(answer))+'</div>'
        :'<div style="font-size:17px;font-weight:800;color:var(--primary-color);text-align:center;margin:6px 0 10px;">🏛 '+esc(answer.capital||'?')+'</div>';
      const title=(mode==='flag')?(window.IntMapLang.t(HOST.lang,"Which country is this flag?","この国旗はどこの国?","Zu welchem Land gehört diese Flagge?","Флаг какой страны это?","¿De qué país es esta bandera?"))
        :(mode==='shape')?(window.IntMapLang.t(HOST.lang,"Which country is this shape?","この形はどこの国?","Welches Land hat diese Form?","Какая страна имеет такую форму?","¿Qué país tiene esta forma?"))
        :cap2?(window.IntMapLang.t(HOST.lang,"What is this country’s capital?","この国の首都は?","Wie heißt die Hauptstadt dieses Landes?","Какая столица у этой страны?","¿Cuál es la capital de este país?"))
        :(window.IntMapLang.t(HOST.lang,"Which country has this capital?","この首都はどこの国?","Zu welchem Land gehört diese Hauptstadt?","У какой страны такая столица?","¿De qué país es esta capital?"));
      p.innerHTML=header()+'<div style="font-size:12.5px;font-weight:700;">'+title+'</div>'+qhtml+
        '<div style="display:flex;flex-direction:column;gap:6px;">'+opts.map((o,i)=>'<button class="ai-test-btn" data-o="'+i+'" style="width:100%;text-align:left;">'+esc(cap2?(o.capital||'—'):cname(o))+'</button>').join('')+'</div><div id="edu-res"></div>';
      wire();
      p.querySelectorAll('[data-o]').forEach(b=>b.onclick=()=>{
        const chosen=opts[+b.getAttribute('data-o')]; const ok=chosen===q.answer; total++; if(ok){ score++; streak++; } else streak=0;
        const res=p.querySelector('#edu-res'); if(res) res.innerHTML=card(q.answer,ok,(!ok?'<div style="font-size:11px;">'+(window.IntMapLang.t(HOST.lang,"You picked: ","あなたの回答: ","Ihre Wahl: ","Ваш ответ: ","Ha elegido: "))+esc(cap2?(chosen.capital||'—'):cname(chosen))+'</div>':''))+'<button class="ai-test-btn" id="edu-next" style="width:100%;margin-top:8px;">'+(window.IntMapLang.t(HOST.lang,"Next →","次の問題 →","Weiter →","Далее →","Siguiente →"))+'</button>';
        const nx=p.querySelector('#edu-next'); if(nx) nx.onclick=next;
        p.querySelectorAll('[data-o]').forEach(x=>x.disabled=true);
        try{ if(q.answer.latlng&&ok) GE().camera.flyTo({center:[q.answer.latlng[1],q.answer.latlng[0]],zoom:4}); }catch(_){}
      });
    }
    /* map-quiz click resolution: point-in-polygon over countryGeo (works with the fill layer hidden) */
    function countryAt(lngLat){ try{ if(!window.countryGeo||!hasTurf()) return null;
      const pt=turf.point([lngLat.lng,lngLat.lat]);
      for(const f of (HOST.countryGeo.features||[])){ try{ if(turf.booleanPointInPolygon(pt,f)) return f; }catch(_){} }
      }catch(_){} return null; }
    function onMapClick(e){ if(!mapQuizArmed||!q||!panel||panel.style.display==='none') return;
      if(typeof HOST.toolMode!=='undefined'&&HOST.toolMode) return;
      const f=countryAt(e.lngLat); const res=panel.querySelector('#edu-map-res'); if(!res) return;
      if(!f){ res.innerHTML='<span style="color:var(--text-muted);">'+(window.IntMapLang.t(HOST.lang,"Click on a country","陸地（国）をクリックしてください","Auf ein Land klicken","Кликните по стране","Haga clic en un país"))+'</span>'; return; }
      let id=null; try{ id=resolveCountryId(f); }catch(_){ }
      const ok=id&&q.answer.code===id; total++; if(ok){ score++; streak++; } else streak=0;
      mapQuizArmed=false;
      const got=(id&&countryStats[id])?countryStats[id]:null;
      res.innerHTML=card(q.answer,ok,(got&&!ok?'<div style="font-size:11px;">'+(window.IntMapLang.t(HOST.lang,"You clicked: ","クリックした国: ","Angeklickt: ","Вы кликнули: ","Ha hecho clic en: "))+esc(cname(got))+'</div>':''))+'<button class="ai-test-btn" id="edu-next2" style="width:100%;margin-top:8px;">'+(window.IntMapLang.t(HOST.lang,"Next →","次の問題 →","Weiter →","Далее →","Siguiente →"))+'</button>';
      const nx=panel.querySelector('#edu-next2'); if(nx) nx.onclick=next;
    }
    function closeP(){ if(panel) panel.style.display='none'; mapQuizArmed=false; }
    function openP(){ score=0; streak=0; total=0; menu(); }
    /* (#R315) `onMapClick` is exported too: the shell owns the map subscription (it is made at boot,
       before this file exists) and forwards to this one once the loader has fetched it. */
    return { open:openP, close:closeP, onMapClick };
  })();
};
