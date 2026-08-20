/* ============================================================================
 *  IntMap · Area Monitors — IntMapMonitors  (#R162)
 * ----------------------------------------------------------------------------
 *  Body moved out of index.html's DOMContentLoaded closure, so the values it used to inherit
 *  implicitly are now passed in explicitly:
 *      window.IntMapMonitors=window.IntMapModules.monitors(map, host);
 *    • map  — the MapLibre instance; assigned exactly once at boot and never rebound.
 *    • host — the ten closure values this module reads. The four MUTABLE ones
 *      (lang/user/mode/radiusItems) are GETTERS so every read sees the current value; the six
 *      function declarations are handed over by value since index.html never rebinds them.
 *
 *  Why the getters matter: `radiusItems` is rebound by clearAllRadius()/removeRadiusItem(),
 *  and this module originally reached it through a `typeof … !== "undefined"` guard. Moved out
 *  of the closure that guard quietly evaluated to false, so activeArea() fell through to
 *  "no area selected" — a feature silently lost with no error at all.
 *  scripts/check-split-scope.mjs now fails CI on any free identifier that is an index.html
 *  closure variable, so this whole class of silent breakage cannot recur.
 *
 *  The monitor CSS still lives in css/intmap.css (the .mon-* rules), per #R152's
 *  "no CSS-in-JS template literal" rule.
 * ========================================================================== */
window.IntMapModules=window.IntMapModules||{};
window.IntMapModules.monitors=function(HOST){
  /* (#R173) 脱MapLibre 第7段階 — the monitor's map work goes through the engine facade, never the raw
     renderer. Every call it needed was already in the contract; the `map` parameter stays only because
     every module file shares one factory signature. */
  const GE=()=>window.IntMapGeoEngine;
  /* (#R170) "Is it safe to addSource/addLayer right now?" — the app-wide predicate declared in index.html.
     A function DECLARATION so nested closures above this line can call it (no TDZ). Falls back to the old
     isStyleLoaded() test only if the host is somehow absent. */
  function _imCanDraw(){ try{ return !!HOST.canDraw(); }catch(_){ try{ return !!GE().ready(); }catch(__){ return false; } } }
    /* (#R162) HOST is the HOST INTERFACE — the index.html closure values this module used to
       inherit implicitly. It matters that the four state reads (lang/user/mode/radiusItems)
       are GETTERS on H and not captured parameters: all four are reassigned at runtime (the
       language switch, login/logout, the tab change, and clearAllRadius/removeRadiusItem
       which rebind the array), so a captured copy would silently go stale — the module would
       keep "working" while reading a dead value. The six functions below are plain function
       declarations in index.html and are never rebound, so they are handed over by value. */
    const requireLogin=HOST.requireLogin, openAuthModal=HOST.openAuthModal, distHTML=HOST.distHTML,
          imToast=HOST.imToast, aiToast=HOST.aiToast, satToast=HOST.satToast;
    const DB=window.sb;
    const FN_URL=((window.SUPABASE_URL||'').replace(/\/$/,''))+'/functions/v1/monitor-run';
    const S=(v)=>{ try{ return window.IntMapSafe? window.IntMapSafe.html(v==null?'':String(v)) : String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }catch(_){ return ''; } };
    const URLS=(v)=>{ try{ return window.IntMapSafe? window.IntMapSafe.url(v) : (/^https?:\/\//i.test(String(v||''))?String(v):'#'); }catch(_){ return '#'; } };
    const ML=window.IntMapLang.pick(()=>HOST.lang||'en');
    const MLA=window.IntMapLang.pickArgs();   /* (#R251) the ARRAY form — see `pickArgs` in js/lang-registry.js */
    const _loggedIn=()=> !!HOST.user;
    const _promptLogin=()=>{ try{ if(typeof requireLogin==='function') return requireLogin(); if(typeof openAuthModal==='function') openAuthModal(); }catch(_){} };

    /* ---- status / severity vocab (5 languages) ---- */
    const STATUS_L={
      success:()=>ML('Change reported','変化を報告','Änderung gemeldet','Изменение','Cambio informado'),
      'success+report':()=>ML('Change reported','変化を報告','Änderung gemeldet','Изменение','Cambio informado'),
      'partial+report':()=>ML('Change (partial)','変化（一部）','Änderung (teilweise)','Изменение (частично)','Cambio (parcial)'),
      success_no_change:()=>ML('No change','変化なし','Keine Änderung','Без изменений','Sin cambios'),
      partial:()=>ML('Partial','一部取得','Teilweise','Частично','Parcial'),
      source_unavailable:()=>ML('Source unavailable','ソース取得不可','Quelle nicht verfügbar','Источник недоступен','Fuente no disponible'),
      ai_failed:()=>ML('AI failed (data kept)','AI失敗（データは保持）','KI fehlgeschlagen','Сбой ИИ','Fallo de IA'),
      timed_out:()=>ML('Timed out','タイムアウト','Zeitüberschreitung','Тайм-аут','Tiempo agotado'),
      invalid_geometry:()=>ML('Invalid area','範囲が無効','Ungültiger Bereich','Неверная область','Área no válida'),
      quota_exceeded:()=>ML('Quota exceeded','上限超過','Kontingent überschritten','Превышена квота','Cuota excedida'),
      disabled:()=>ML('Paused','停止中','Pausiert','Пауза','Pausado'),
      internal_error:()=>ML('Error','エラー','Fehler','Ошибка','Error'),
      /* rare partial-persistence outcomes (#R144): shown honestly, retried next run */
      evidence_failed:()=>ML('Error (data not saved)','エラー（データ未保存）','Fehler (nicht gespeichert)','Ошибка (не сохранено)','Error (no guardado)'),
      report_failed:()=>ML('Error (report not saved)','エラー（レポート未保存）','Fehler (Bericht nicht gespeichert)','Ошибка (отчёт не сохранён)','Error (informe no guardado)'),
      scaffold_failed:()=>ML('Error','エラー','Fehler','Ошибка','Error'),
      running:()=>ML('Running…','実行中…','Läuft…','Выполняется…','Ejecutando…')
    };
    const statusLabel=(s)=>{ const f=STATUS_L[s]; return f?f():(s||'—'); };
    const SEV_COLOR={ none:'#8e8e93', low:'#30a46c', medium:'#ff9f0a', high:'#ff453a', critical:'#ff2d55' };
    const SEV_L={
      none:()=>ML('None','なし','Keine','Нет','Ninguna'), low:()=>ML('Low','低','Niedrig','Низкая','Baja'),
      medium:()=>ML('Medium','中','Mittel','Средняя','Media'), high:()=>ML('High','高','Hoch','Высокая','Alta'),
      critical:()=>ML('Critical','重大','Kritisch','Критическая','Crítica')
    };
    const sevLabel=(s)=>{ const f=SEV_L[s]; return f?f():(s||'—'); };
    const SRC_L={ news:()=>ML('News','ニュース','Nachrichten','Новости','Noticias'), earthquake:()=>ML('Earthquakes','地震','Erdbeben','Землетрясения','Terremotos'), weather:()=>ML('Weather','気象','Wetter','Погода','Clima'), fire:()=>ML('Fires','火災','Brände','Пожары','Incendios') };
    const srcLabel=(s)=>{ const f=SRC_L[s]; return f?f():s; };

    /* ---- small helpers ---- */
    function _fmtWhen(iso){ if(!iso) return '—'; try{ const d=new Date(iso), now=Date.now(), diff=(now-d.getTime())/1000;
      const rel=(n,u1,uj)=>{ const l=(HOST.lang||'en'); return l==='jp'?(Math.round(n)+uj):(Math.round(n)+' '+u1+(Math.round(n)===1?'':'s')+' '+ML('ago','','','','')); };
      if(Math.abs(diff)<60) return ML('just now','たった今','gerade eben','только что','ahora mismo');
      if(diff<3600) return ML(Math.round(diff/60)+' min ago',Math.round(diff/60)+'分前','vor '+Math.round(diff/60)+' Min','мин назад',Math.round(diff/60)+' min');
      if(diff<86400) return ML(Math.round(diff/3600)+'h ago',Math.round(diff/3600)+'時間前','vor '+Math.round(diff/3600)+' Std',Math.round(diff/3600)+'ч назад','hace '+Math.round(diff/3600)+' h');
      return d.toLocaleDateString();
    }catch(_){ return '—'; } }
    function _fmtNext(iso,enabled){ if(enabled===false) return statusLabel('disabled'); if(!iso) return '—'; try{ const d=new Date(iso), diff=(d.getTime()-Date.now())/1000;
      if(diff<=0) return ML('due now','まもなく','fällig','скоро','pronto');
      if(diff<3600) return ML('in '+Math.round(diff/60)+' min','約'+Math.round(diff/60)+'分後','in '+Math.round(diff/60)+' Min','через '+Math.round(diff/60)+' мин','en '+Math.round(diff/60)+' min');
      if(diff<86400) return ML('in '+Math.round(diff/3600)+'h','約'+Math.round(diff/3600)+'時間後','in '+Math.round(diff/3600)+' Std','через '+Math.round(diff/3600)+'ч','en '+Math.round(diff/3600)+' h');
      return ML('in '+Math.round(diff/86400)+'d','約'+Math.round(diff/86400)+'日後','in '+Math.round(diff/86400)+' T','через '+Math.round(diff/86400)+'д','en '+Math.round(diff/86400)+' d');
    }catch(_){ return '—'; } }
    function _decimGeom(geom){ try{ if(!geom||!geom.coordinates) return geom;
      const dr=(ring)=>{ let r=ring.map(p=>[+(+p[0]).toFixed(5),+(+p[1]).toFixed(5)]); if(r.length>82){ const step=Math.ceil(r.length/80); const out=[]; for(let i=0;i<r.length;i+=step) out.push(r[i]); if(out[out.length-1][0]!==r[r.length-1][0]||out[out.length-1][1]!==r[r.length-1][1]) out.push(r[r.length-1]); r=out; } return r; };
      if(geom.type==='Polygon') return {type:'Polygon',coordinates:geom.coordinates.map(dr)};
      if(geom.type==='MultiPolygon') return {type:'MultiPolygon',coordinates:geom.coordinates.map(poly=>poly.map(dr))};
      return geom; }catch(_){ return geom; } }
    function _bboxOf(geom){ try{ let w=Infinity,s=Infinity,e=-Infinity,n=-Infinity; const scan=(ring)=>ring.forEach(p=>{ if(p[0]<w)w=p[0]; if(p[0]>e)e=p[0]; if(p[1]<s)s=p[1]; if(p[1]>n)n=p[1]; });
      if(geom.type==='Polygon') geom.coordinates.forEach(scan); else if(geom.type==='MultiPolygon') geom.coordinates.forEach(poly=>poly.forEach(scan)); else return null;
      return isFinite(w)?[w,s,e,n]:null; }catch(_){ return null; } }
    function _circlePoly(center,km){ try{ if(window.IntMapPopArea&&IntMapPopArea.circleGeom) return IntMapPopArea.circleGeom(center,km);
      const pts=[],R=6371; for(let i=0;i<=48;i++){ const brng=i/48*2*Math.PI; const lat1=center[1]*Math.PI/180,lng1=center[0]*Math.PI/180,d=km/R;
        const lat2=Math.asin(Math.sin(lat1)*Math.cos(d)+Math.cos(lat1)*Math.sin(d)*Math.cos(brng));
        const lng2=lng1+Math.atan2(Math.sin(brng)*Math.sin(d)*Math.cos(lat1),Math.cos(d)-Math.sin(lat1)*Math.sin(lat2));
        pts.push([lng2*180/Math.PI,lat2*180/Math.PI]); } return {type:'Polygon',coordinates:[pts]}; }catch(_){ return null; } }
    function _distLabel(km){ try{ if(typeof distHTML==='function'){ const t=distHTML(km); return String(t).replace(/<[^>]+>/g,''); } }catch(_){} return Math.round(km)+' km'; }

    /* ---- the unified "active area" accessor: radius > drawn > resolved region ---- */
    function activeArea(){
      try{
        if(HOST.radiusItems && HOST.radiusItems.length){
          const c=HOST.radiusItems.find(r=>r.id===window._activeRadiusId)||HOST.radiusItems[HOST.radiusItems.length-1];
          if(c&&c.center&&isFinite(c.radiusKm)){ const geom=_circlePoly(c.center,c.radiusKm);
            return { geometry_kind:'circle', center_lng:c.center[0], center_lat:c.center[1], radius_km:c.radiusKm, geometry:geom, bbox:_bboxOf(geom),
              label:_distLabel(c.radiusKm)+' · '+c.center[1].toFixed(2)+', '+c.center[0].toFixed(2) }; }
        }
        if(window.DrawTool&&DrawTool.active&&DrawTool.active()&&DrawTool.currentGeometry){ const g=DrawTool.currentGeometry();
          if(g){ const dg=_decimGeom(g); return { geometry_kind:(g.type==='MultiPolygon'?'multipolygon':'polygon'), geometry:dg, bbox:_bboxOf(dg), label:ML('Drawn area','描画範囲','Gezeichneter Bereich','Нарисованная область','Área dibujada') }; } }
        if(window.IntMapOutline&&IntMapOutline.active&&IntMapOutline.active()&&IntMapOutline.current){ const cur=IntMapOutline.current();
          if(cur&&cur.geo){ const dg=_decimGeom(cur.geo); return { geometry_kind:'region', geometry:dg, bbox:_bboxOf(dg), label:(cur.name||ML('Region','地域','Region','Регион','Región')) }; } }
      }catch(_){}
      return null;
    }
    function mapViewArea(){ try{ const b=GE().camera.getBounds(); if(!b) return null; const w=b.getWest(),s=b.getSouth(),e=b.getEast(),n=b.getNorth();
      const geom={type:'Polygon',coordinates:[[[w,s],[e,s],[e,n],[w,n],[w,s]]]}; return { geometry_kind:'polygon', geometry:geom, bbox:[w,s,e,n], label:ML('Current map view','現在の地図表示','Aktuelle Kartenansicht','Текущий вид карты','Vista actual del mapa') }; }catch(_){ return null; } }

    /* ---- map overlay for a monitor area + change points ---- */
    function _ensureLayers(){ try{ if(!GE()||!_imCanDraw()) return false;
      if(!GE().layers.hasSource('im-mon-area')){ GE().layers.addSource('im-mon-area',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
        GE().layers.add({id:'im-mon-area-fill',type:'fill',source:'im-mon-area',paint:{'fill-color':'#0a84ff','fill-opacity':0.10}});
        GE().layers.add({id:'im-mon-area-line',type:'line',source:'im-mon-area',paint:{'line-color':'#0a84ff','line-width':2,'line-dasharray':[2,1.5]}}); }
      if(!GE().layers.hasSource('im-mon-pts')){ GE().layers.addSource('im-mon-pts',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
        GE().layers.add({id:'im-mon-pts-c',type:'circle',source:'im-mon-pts',paint:{'circle-radius':7,'circle-color':'#ff375f','circle-stroke-color':'#fff','circle-stroke-width':2,'circle-opacity':0.9}}); }
      return true; }catch(_){ return false; } }
    /* (#R151) track WHICH monitor's area is currently painted so deleting it can clear the highlight
       ("モニターで監視を作成した際のハイライトが、モニター削除後も残ってしまった"). */
    let _shownMonId=null;
    function showOnMap(area,points,monId){ try{ if(!_ensureLayers()) return; _shownMonId=(monId!=null?monId:null); const af=[]; if(area&&area.geometry) af.push({type:'Feature',geometry:area.geometry,properties:{}});
      GE().layers.setSourceData('im-mon-area',{type:'FeatureCollection',features:af});
      const pf=(points||[]).filter(p=>isFinite(p.lng)&&isFinite(p.lat)).map(p=>({type:'Feature',geometry:{type:'Point',coordinates:[p.lng,p.lat]},properties:{label:p.label||''}}));
      GE().layers.setSourceData('im-mon-pts',{type:'FeatureCollection',features:pf});
      if(area&&area.bbox){ try{ GE().camera.fitBounds([[area.bbox[0],area.bbox[1]],[area.bbox[2],area.bbox[3]]],{padding:80,maxZoom:9,duration:800}); }catch(_){} }
    }catch(_){} }
    function clearMap(){ _shownMonId=null; try{ GE().layers.setSourceData('im-mon-area',{type:'FeatureCollection',features:[]}); GE().layers.setSourceData('im-mon-pts',{type:'FeatureCollection',features:[]}); }catch(_){} }

    /* ---- data access (RLS scopes to the owner) ---- */
    async function _list(){ const {data,error}=await DB.from('area_monitors').select('*').order('created_at',{ascending:false}); if(error) throw error; return data||[]; }
    async function _get(id){ try{ const {data}=await DB.from('area_monitors').select('*').eq('id',id).maybeSingle(); return data||null; }catch(_){ return null; } }
    async function _runs(id){ try{ const {data}=await DB.from('monitor_runs').select('*').eq('monitor_id',id).order('started_at',{ascending:false}).limit(30); return data||[]; }catch(_){ return []; } }
    async function _report(id){ try{ const {data}=await DB.from('monitor_reports').select('*').eq('id',id).maybeSingle(); return data||null; }catch(_){ return null; } }
    async function _evidence(runId){ try{ const {data}=await DB.from('monitor_evidence').select('*').eq('run_id',runId).order('ev_key'); return data||[]; }catch(_){ return []; } }

    function _errMsg(error){ const m=String(error&&error.message||error||''); if(/monitor_limit_reached/.test(m)) return ML('You have reached your monitor limit for this plan.','このプランの監視上限に達しました。','Sie haben Ihr Monitor-Limit erreicht.','Достигнут лимит мониторов для вашего плана.','Has alcanzado el límite de monitores de tu plan.');
      if(/geom/i.test(m)&&/size|400000|check/i.test(m)) return ML('That area is too large/detailed to save. Try a simpler shape.','範囲が大きすぎ/複雑すぎます。単純な形にしてください。','Bereich zu groß/detailliert.','Область слишком большая/подробная.','El área es demasiado grande/detallada.');
      return ML('Could not save the monitor.','監視を保存できませんでした。','Konnte den Monitor nicht speichern.','Не удалось сохранить монитор.','No se pudo guardar el monitor.'); }

    /* ---- CRUD ---- */
    async function create(opts){ opts=opts||{}; if(!_loggedIn()){ _promptLogin(); return {ok:false,error:'login'}; }
      const area=opts.area||activeArea(); if(!area||!area.geometry) return {ok:false,error:'no_area'};
      /* (#R150) THE "Could not save the monitor" ROOT CAUSE: area_monitors.user_id is `not null` and the
         insert RLS policy is `with check (user_id = auth.uid())`, but this row previously OMITTED user_id —
         so every UI insert violated NOT NULL / RLS and failed. The feature was only ever verified server-side
         (service_role sets user_id explicitly), never through the logged-in client. Set it here exactly like
         every other user-owned insert (feedback / bug_reports / donations). A belt-and-suspenders DB
         `default auth.uid()` is added in migration 20260721140000 too. */
      const _uid=(HOST.user&&HOST.user.id)||null;
      if(!_uid){ _promptLogin(); return {ok:false,error:'login'}; }
      const row={ user_id:_uid, name:String(opts.name||area.label||ML('Area monitor','エリア監視','Gebietsmonitor','Монитор области','Monitor de área')).slice(0,120),
        geometry:area.geometry, geometry_kind:area.geometry_kind||'polygon',
        center_lng:(area.center_lng!=null?area.center_lng:null), center_lat:(area.center_lat!=null?area.center_lat:null), radius_km:(area.radius_km!=null?area.radius_km:null),
        bbox:area.bbox||_bboxOf(area.geometry)||null, area_label:area.label||null,
        sources:(opts.sources&&opts.sources.length?opts.sources:['news']),
        comparison:opts.comparison||{mode:'previous_run',window_days:30}, sensitivity:opts.sensitivity||{},
        interval_minutes:Math.max(30,parseInt(opts.intervalMin||360,10)||360), enabled:true };  /* next_run_at is server-owned (DB default now()); the client never sets an execution time (#R144) */
      try{ const {data,error}=await DB.from('area_monitors').insert(row).select('*').single(); if(error) return {ok:false,error:_errMsg(error),raw:error}; return {ok:true,monitor:data}; }
      catch(e){ return {ok:false,error:_errMsg(e),raw:e}; } }
    async function setEnabled(id,on){ try{ const {error}=await DB.from('area_monitors').update({enabled:!!on}).eq('id',id); return !error; }catch(_){ return false; } }
    async function remove(id){ try{ const {error}=await DB.from('area_monitors').delete().eq('id',id);
      if(!error && (_shownMonId===id || _shownMonId==null)) clearMap();   /* (#R151) delete must remove the leftover area highlight for the monitor being shown */
      return !error; }catch(_){ return false; } }
    async function pause(id){ const ok=await setEnabled(id,false); if(ok) render(); return ok; }
    async function resume(id){ const ok=await setEnabled(id,true); if(ok) render(); return ok; }
    /* Honest, localized reasons for why a manual run couldn't start. The server
       decides atomically (monitor_claim_one) and returns a distinct code — the UI
       never claims success and never invents a reason. */
    function _runReasonMsg(code){ switch(String(code||'')){
      case 'already_running': return ML('Already running — it’s in progress.','すでに実行中です。','Läuft bereits.','Уже выполняется.','Ya se está ejecutando.');
      case 'cooldown':        return ML('Please wait a moment before running again.','少し待ってから再実行してください。','Bitte kurz warten, bevor Sie erneut ausführen.','Подождите немного перед повторным запуском.','Espera un momento antes de volver a ejecutar.');
      case 'disabled':        return ML('This monitor is paused — resume it to run.','この監視は停止中です。再開してください。','Dieser Monitor ist pausiert — fortsetzen zum Ausführen.','Монитор на паузе — возобновите для запуска.','El monitor está en pausa; reanúdalo para ejecutar.');
      case 'not_found':       return ML('Monitor not found.','監視が見つかりません。','Monitor nicht gefunden.','Монитор не найден.','Monitor no encontrado.');
      case 'login':           return ML('Log in to run monitors.','ログインすると実行できます。','Zum Ausführen anmelden.','Войдите, чтобы запускать.','Inicia sesión para ejecutar.');
      default:                return ML('This monitor can’t run right now.','今は実行できません。','Kann derzeit nicht ausgeführt werden.','Сейчас запустить нельзя.','No se puede ejecutar ahora.');
    } }
    async function runNow(id){ if(!_loggedIn()){ _promptLogin(); return {ok:false,error:'login',message:_runReasonMsg('login')}; }
      let token=''; try{ const r=await DB.auth.getSession(); token=(r&&r.data&&r.data.session&&r.data.session.access_token)||''; }catch(_){}
      if(!token) return {ok:false,error:'login',message:_runReasonMsg('login')};
      try{ const resp=await fetch(FN_URL,{method:'POST',headers:{'Content-Type':'application/json','apikey':window.SUPABASE_ANON_KEY||'','Authorization':'Bearer '+token},body:JSON.stringify({monitorId:id})});
        const j=await resp.json().catch(()=>null);
        if(!resp.ok){ const code=(j&&j.error)||('http_'+resp.status); return {ok:false,error:code,message:_runReasonMsg(code),status:resp.status}; }
        return {ok:true,status:(j&&j.status)||'ok'}; }
      catch(e){ return {ok:false,error:'network',message:ML('Network error — please try again.','ネットワークエラー。再試行してください。','Netzwerkfehler.','Ошибка сети.','Error de red.')}; } }

    /* ---- rendering: the list ---- */
    function _statusChip(m){ const run=(m.running_since&&(Date.now()-new Date(m.running_since).getTime())<15*60000); const key=run?'running':(m.enabled===false?'disabled':(m.last_status||'')); const sev=m.last_change_severity;
      let color='var(--text-muted)'; if(run) color='#0a84ff'; else if(m.enabled===false) color='#8e8e93'; else if(m.last_status==='source_unavailable'||m.last_status==='ai_failed'||m.last_status==='internal_error'||m.last_status==='invalid_geometry') color='#ff9f0a'; else if(sev&&SEV_COLOR[sev]&&sev!=='none') color=SEV_COLOR[sev]; else if(m.last_status) color='#30a46c';
      const label=run?statusLabel('running'):(m.enabled===false?statusLabel('disabled'):(m.last_status?statusLabel(m.last_status):ML('Scheduled','予定','Geplant','Запланирован','Programado')));
      return '<span class="mon-chip" style="--c:'+color+'">'+S(label)+'</span>'; }
    function _rowHtml(m){ const sources=(m.sources||[]).map(srcLabel).join(', ');
      const sev=(m.last_change_severity&&m.last_change_severity!=='none')?('<span class="mon-sev" style="--c:'+(SEV_COLOR[m.last_change_severity]||'#8e8e93')+'">'+S(sevLabel(m.last_change_severity))+'</span>'):'';
      return '<div class="mon-row" data-mid="'+S(m.id)+'">'
        +'<div class="mon-row-main">'
          +'<div class="mon-row-top"><span class="mon-name">'+S(m.name)+'</span>'+_statusChip(m)+sev+'</div>'
          +'<div class="mon-row-sub">'+S(m.area_label||'')+' · '+S(sources)+'</div>'
          +'<div class="mon-row-meta">'+S(ML('Last','前回','Zuletzt','Последний','Último'))+': '+S(_fmtWhen(m.last_run_at))+' · '+S(ML('Next','次回','Nächste','Следующий','Próximo'))+': '+S(_fmtNext(m.next_run_at,m.enabled))+'</div>'
        +'</div>'
        +'<div class="mon-row-acts">'
          +'<button class="mon-ic" data-act="run" title="'+S(ML('Run now','今すぐ実行','Jetzt ausführen','Запустить','Ejecutar ahora'))+'">▶</button>'
          +'<button class="mon-ic" data-act="'+(m.enabled===false?'resume':'pause')+'" title="'+S(m.enabled===false?ML('Resume','再開','Fortsetzen','Возобновить','Reanudar'):ML('Pause','一時停止','Pause','Пауза','Pausar'))+'">'+(m.enabled===false?'▷':'❚❚')+'</button>'
          +'<button class="mon-ic" data-act="map" title="'+S(ML('Show on map','地図に表示','Auf Karte','На карте','En el mapa'))+'">◎</button>'
        +'</div></div>'; }

    async function render(query){ const feed=document.getElementById('monitors-feed'); if(!feed) return;
      if(!_loggedIn()){ feed.innerHTML='<div class="mon-wrap"><div class="mon-empty">'+S(ML('Log in to create and view area monitors.','ログインすると地域監視を作成・表示できます。','Melden Sie sich an, um Gebietsmonitore zu nutzen.','Войдите, чтобы использовать мониторы областей.','Inicia sesión para usar los monitores de área.'))+'</div>'
          +'<button class="mon-new-btn" id="mon-login-btn">'+S(ML('Log in','ログイン','Anmelden','Войти','Iniciar sesión'))+'</button></div>';
        const lb=feed.querySelector('#mon-login-btn'); if(lb) lb.onclick=_promptLogin; return; }
      feed.innerHTML='<div class="mon-wrap"><div class="mon-loading">'+S(ML('Loading monitors…','監視を読み込み中…','Monitore werden geladen…','Загрузка…','Cargando…'))+'</div></div>';
      let rows=[]; try{ rows=await _list(); }catch(e){ feed.innerHTML='<div class="mon-wrap"><div class="mon-empty">'+S(ML('Could not load monitors.','監視を読み込めませんでした。','Konnte Monitore nicht laden.','Не удалось загрузить.','No se pudieron cargar.'))+'</div></div>'; return; }
      const q=String(query||'').trim().toLowerCase(); if(q) rows=rows.filter(r=>((r.name||'')+' '+(r.area_label||'')).toLowerCase().includes(q));
      const area=activeArea();
      let html='<div class="mon-wrap"><div class="mon-head">'
        +'<button class="mon-new-btn" id="mon-new-btn">＋ '+S(ML('New monitor','新規監視','Neuer Monitor','Новый монитор','Nuevo monitor'))+'</button>'
        +(area?'<span class="mon-area-hint">'+S(ML('Area ready','範囲あり','Bereich bereit','Область готова','Área lista'))+': '+S(area.label)+'</span>':'')
        +'</div>';
      if(!rows.length){ html+='<div class="mon-empty">'+S(ML('No monitors yet. Set a radius, draw an area, or resolve a region, then create a monitor to watch it for changes.','監視がまだありません。半径・描画・地域指定で範囲を決めてから監視を作成してください。','Noch keine Monitore. Wählen Sie einen Bereich und erstellen Sie einen Monitor.','Пока нет мониторов. Задайте область и создайте монитор.','Aún no hay monitores. Define un área y crea un monitor.'))+'</div>'; }
      else { html+='<div class="mon-list">'+rows.map(_rowHtml).join('')+'</div>'; }
      html+='</div>'; feed.innerHTML=html; _wireList(feed,rows); }

    function _wireList(feed,rows){ const nb=feed.querySelector('#mon-new-btn'); if(nb) nb.onclick=()=>openCreateDialog();
      const byId={}; (rows||[]).forEach(r=>byId[r.id]=r);
      feed.querySelectorAll('.mon-row').forEach(row=>{ const id=row.getAttribute('data-mid');
        row.querySelector('.mon-row-main').onclick=()=>openDetail(id);
        row.querySelectorAll('.mon-ic').forEach(b=>{ b.onclick=async(e)=>{ e.stopPropagation(); const act=b.getAttribute('data-act');
          if(act==='pause'){ await pause(id); }
          else if(act==='resume'){ await resume(id); }
          else if(act==='map'){ const m=byId[id]||await _get(id); if(m){ let pts=[]; try{ if(m.last_report_id){ const rep=await _report(m.last_report_id); if(rep&&rep.change_points) pts=rep.change_points; } }catch(_){} showOnMap({geometry:m.geometry,bbox:m.bbox},pts,m.id); _closeSheetIfMobile(); } }
          else if(act==='run'){ b.disabled=true; b.textContent='…'; const r=await runNow(id); b.disabled=false; b.textContent='▶';
            if(r.ok){ _toast(ML('Monitor ran: ','実行しました: ','Ausgeführt: ','Запущено: ','Ejecutado: ')+statusLabel(r.status)); render(); }
            else if(r.error==='login'){ _promptLogin(); }
            else { _toast(r.message||_runReasonMsg(r.error)); } }
        }; });
      }); }

    /* ---- create dialog ---- */
    function _overlay(inner,cls){ const ov=document.createElement('div'); ov.className='mon-ov '+(cls||''); ov.innerHTML='<div class="mon-dialog" role="dialog" aria-modal="true">'+inner+'</div>';
      document.body.appendChild(ov); ov.addEventListener('click',e=>{ if(e.target===ov) ov.remove(); }); const x=ov.querySelector('.mon-x'); if(x) x.onclick=()=>ov.remove(); return ov; }
    function openCreateDialog(prefill){ if(!_loggedIn()){ _promptLogin(); return; }
      prefill=prefill||{}; let area=prefill.area||activeArea(); let usingView=false; if(!area){ const mv=mapViewArea(); if(mv){ area=mv; usingView=true; } }   /* (#R147) fall back to the current map view so "監視を作成" is always actionable — the button used to render disabled with no area and clicking did nothing ("監視を作成を押しても何も起こらない") */
      const intervals=[[30,ML('Every 30 min','30分ごと','Alle 30 Min','Каждые 30 мин','Cada 30 min')],[60,ML('Hourly','1時間ごと','Stündlich','Каждый час','Cada hora')],[180,ML('Every 3 hours','3時間ごと','Alle 3 Std','Каждые 3 ч','Cada 3 h')],[360,ML('Every 6 hours','6時間ごと','Alle 6 Std','Каждые 6 ч','Cada 6 h')],[720,ML('Every 12 hours','12時間ごと','Alle 12 Std','Каждые 12 ч','Cada 12 h')],[1440,ML('Daily','1日ごと','Täglich','Ежедневно','Diario')]];
      const sens=[['low',ML('Low — only big changes','低 — 大きな変化のみ','Niedrig','Низкая','Baja')],['medium',ML('Medium (default)','中（既定）','Mittel','Средняя','Media')],['high',ML('High — smaller changes','高 — 小さな変化も','Hoch','Высокая','Alta')]];
      const srcOpts=[['news',true],['earthquake',false],['weather',false],['fire',false]];
      const areaLine=area?('<div class="mon-area-box">'+S(ML('Watching','監視範囲','Überwacht','Область','Vigilando'))+': <b>'+S(area.label)+'</b></div>'+(usingView?'<div style="font-size:11px;color:var(--text-muted);margin:2px 0 6px;line-height:1.4;">'+S(ML('Using the current map view — pan/zoom before creating, or close and set a radius, draw an area or resolve a region for a tighter watch.','現在の地図表示を使用中です。作成前に地図を調整するか、一度閉じて半径・描画・地域指定でより狭い範囲を監視できます。','Aktuelle Kartenansicht — vor dem Erstellen anpassen oder für einen engeren Bereich Radius/Zeichnung/Region setzen.','Используется текущий вид карты — настройте карту перед созданием или задайте радиус/область/регион для более узкой зоны.','Usando la vista actual del mapa — ajústala antes de crear o define un radio/área/región para una zona más precisa.'))+'</div>':''))
        :('<div class="mon-area-box mon-area-none">'+S(ML('No area selected. Set a radius, draw an area, or resolve a region — or use the current map view below.','範囲が未選択です。半径・描画・地域指定するか、下の「現在の地図表示」を使ってください。','Kein Bereich gewählt.','Область не выбрана.','Sin área seleccionada.'))+'</div>');
      const inner='<button class="mon-x" aria-label="Close">×</button>'
        +'<h3 class="mon-h3">'+S(ML('New monitor','新規監視','Neuer Monitor','Новый монитор','Nuevo monitor'))+'</h3>'
        +areaLine
        +(area?'':'<button class="mon-viewbtn" id="mon-usemapview">'+S(ML('Use current map view','現在の地図表示を使う','Aktuelle Kartenansicht verwenden','Использовать вид карты','Usar vista del mapa'))+'</button>')
        +'<label class="mon-lbl">'+S(ML('Name','名前','Name','Название','Nombre'))+'</label>'
        +'<input class="mon-inp" id="mon-name" maxlength="120" value="'+S(area?area.label:'')+'">'
        +'<label class="mon-lbl">'+S(ML('Watch for','監視対象','Überwachen','Отслеживать','Vigilar'))+'</label>'
        +'<div class="mon-src-row">'+srcOpts.map(([s,on])=>'<label class="mon-src '+(on?'':'mon-src-off')+'"><input type="checkbox" value="'+s+'" '+(on?'checked':'disabled')+'> '+S(srcLabel(s))+(on?'':' <span class="mon-soon">'+S(ML('soon','近日','bald','скоро','pronto'))+'</span>')+'</label>').join('')+'</div>'
        +'<label class="mon-lbl">'+S(ML('Compare against','比較対象','Vergleichen mit','Сравнивать с','Comparar con'))+'</label>'
        +'<select class="mon-inp" id="mon-cmp"><option value="previous_run">'+S(ML('The previous run','前回の実行','Vorheriger Lauf','Предыдущий запуск','Ejecución anterior'))+'</option><option value="baseline_window">'+S(ML('The past 30 days','過去30日','Letzte 30 Tage','Последние 30 дней','Últimos 30 días'))+'</option></select>'
        +'<label class="mon-lbl">'+S(ML('How often','実行頻度','Häufigkeit','Частота','Frecuencia'))+'</label>'
        +'<select class="mon-inp" id="mon-int">'+intervals.map(([v,l])=>'<option value="'+v+'"'+(v===360?' selected':'')+'>'+S(l)+'</option>').join('')+'</select>'
        +'<label class="mon-lbl">'+S(ML('Sensitivity','感度','Empfindlichkeit','Чувствительность','Sensibilidad'))+'</label>'
        +'<select class="mon-inp" id="mon-sens">'+sens.map(([v,l])=>'<option value="'+v+'"'+(v==='medium'?' selected':'')+'>'+S(l)+'</option>').join('')+'</select>'
        +'<div class="mon-note">'+S(ML('The monitor runs on our servers even when this page is closed. A report is generated only when a meaningful change is detected — every claim links to its source.','このページを閉じてもサーバー側で実行されます。意味のある変化が検出された時だけレポートが生成され、各主張は出典にリンクします。','Läuft serverseitig, auch wenn die Seite geschlossen ist. Ein Bericht entsteht nur bei einer bedeutsamen Änderung.','Работает на сервере, даже если страница закрыта. Отчёт создаётся только при значимом изменении.','Se ejecuta en el servidor aunque cierres la página. El informe solo se genera ante un cambio significativo.'))+'</div>'
        +'<div class="mon-create-err" id="mon-create-err" style="display:none;color:#ff453a;font-size:12px;margin:8px 0 0;line-height:1.45;"></div>'   /* (#R149) inline, unmissable failure feedback right where the user is looking — toast infra is not guaranteed */
        +'<div class="mon-dlg-acts"><button class="mon-cancel">'+S(ML('Cancel','キャンセル','Abbrechen','Отмена','Cancelar'))+'</button><button class="mon-save" id="mon-create-btn">'+S(ML('Create monitor','監視を作成','Monitor erstellen','Создать','Crear monitor'))+'</button></div>';   /* (#R148) NEVER render disabled — a disabled button clicks to nothing ("押しても何も起こらない"); the click handler below falls back to the map view or shows a clear toast, so pressing it always does something */
      const ov=_overlay(inner,'mon-ov-create');
      const upd=()=>{ const box=ov.querySelector('.mon-area-box'); const btn=ov.querySelector('#mon-create-btn'); const nm=ov.querySelector('#mon-name');
        if(box){ box.classList.toggle('mon-area-none',!area); box.innerHTML=area?(S(ML('Watching','監視範囲','Überwacht','Область','Vigilando'))+': <b>'+S(area.label)+'</b>'):S(ML('No area selected.','範囲が未選択です。','Kein Bereich gewählt.','Область не выбрана.','Sin área.')); }
        if(nm&&!nm.value&&area) nm.value=area.label; };   /* (#R148) button stays enabled — see the create handler's area fallback + toast */
      const uv=ov.querySelector('#mon-usemapview'); if(uv) uv.onclick=()=>{ area=mapViewArea(); usingView=true; uv.style.display='none'; upd(); };
      ov.querySelector('.mon-cancel').onclick=()=>ov.remove();
      ov.querySelector('#mon-create-btn').onclick=async(e)=>{ const btn=e.target; const em=ov.querySelector('#mon-create-err'); const showErr=(m)=>{ try{ if(em){ em.textContent=String(m||''); em.style.display=m?'block':'none'; } }catch(_){} _toast(m); }; if(em) em.style.display='none';
        if(!area){ const mv=mapViewArea(); if(mv){ area=mv; usingView=true; } } if(!area){ showErr(ML('Please set an area to monitor first (radius, drawn area, region, or the current map view).','監視する範囲を先に指定してください（半径・描画・地域、または現在の地図表示）。','Bitte zuerst einen Bereich festlegen (Radius, Zeichnung, Region oder Kartenansicht).','Сначала укажите область для мониторинга (радиус, область, регион или вид карты).','Primero define un área a vigilar (radio, área, región o vista del mapa).')); return; } btn.disabled=true; btn.textContent='…';   /* (#R147/#R149) never a silent no-op — inline error + toast */
        const sources=[...ov.querySelectorAll('.mon-src input:checked')].map(c=>c.value); if(!sources.length) sources.push('news');
        const cmp=ov.querySelector('#mon-cmp').value; const intv=parseInt(ov.querySelector('#mon-int').value,10)||360;
        const sensV=ov.querySelector('#mon-sens').value; const sensMap={low:{min_score:0.45,min_new:3},medium:{min_score:0.3,min_new:1},high:{min_score:0.18,min_new:1}};
        const res=await create({ name:ov.querySelector('#mon-name').value, area, sources, comparison:{mode:cmp,window_days:30}, intervalMin:intv, sensitivity:sensMap[sensV]||{} });
        if(res.ok){ ov.remove(); _toast(ML('Monitor created.','監視を作成しました。','Monitor erstellt.','Монитор создан.','Monitor creado.')); render();
          try{ if(GE().hasRenderer()){ showOnMap({geometry:res.monitor.geometry,bbox:res.monitor.bbox},[],res.monitor.id); } }catch(_){} }
        else if(res.error==='login'){ _promptLogin(); }
        else { btn.disabled=false; btn.textContent=ML('Create monitor','監視を作成','Monitor erstellen','Создать','Crear monitor'); showErr(String(res.error||ML('Could not create the monitor.','監視を作成できませんでした。','Monitor konnte nicht erstellt werden.','Не удалось создать монитор.','No se pudo crear el monitor.'))); } };
    }

    /* ---- monitor detail overlay (config + run history + latest report) ---- */
    async function openDetail(id){ const m=await _get(id); if(!m){ _toast(ML('Monitor not found.','監視が見つかりません。','Nicht gefunden.','Не найдено.','No encontrado.')); return; }
      const runs=await _runs(id);
      const kv=(k,v)=>'<div class="mon-kv"><span>'+S(k)+'</span><b>'+v+'</b></div>';
      const runsHtml=runs.length?('<div class="mon-runs">'+runs.map(r=>{ const sev=(r.report_generated&&r.change_score!=null)?'':''; const badge='<span class="mon-chip" style="--c:'+(r.status==='success'||r.status==='partial'?'#30a46c':(r.status==='success_no_change'?'#8e8e93':(r.status==='source_unavailable'||r.status==='ai_failed'?'#ff9f0a':'#ff453a')))+'">'+S(statusLabel(r.status))+'</span>';
        return '<div class="mon-run" data-rid="'+S(r.id)+'" data-rep="'+S(r.report_id||'')+'"><div class="mon-run-l"><span class="mon-run-when">'+S(_fmtWhen(r.started_at))+'</span>'+badge+'</div>'
          +'<span class="mon-run-r">'+(r.report_generated?'<span class="mon-run-link">'+S(ML('View report','レポートを見る','Bericht','Отчёт','Ver informe'))+' →</span>':(r.evidence_count?S(r.evidence_count)+' '+S(ML('items','件','Einträge','эл.','elem.')):'—'))+'</span></div>'; }).join('')+'</div>'):('<div class="mon-empty">'+S(ML('No runs yet.','実行履歴はまだありません。','Noch keine Läufe.','Пока нет запусков.','Sin ejecuciones.'))+'</div>');
      const inner='<button class="mon-x" aria-label="Close">×</button>'
        +'<h3 class="mon-h3">'+S(m.name)+' '+_statusChip(m)+'</h3>'
        +'<div class="mon-kvs">'
          +kv(ML('Area','範囲','Bereich','Область','Área'),S(m.area_label||'—'))
          +kv(ML('Watching','監視対象','Überwacht','Отслеживает','Vigila'),S((m.sources||[]).map(srcLabel).join(', ')))
          +kv(ML('Every','頻度','Alle','Каждые','Cada'),S(_intLabel(m.interval_minutes)))
          +kv(ML('Compare','比較','Vergleich','Сравнение','Comparar'),S(m.comparison&&m.comparison.mode==='baseline_window'?ML('past 30 days','過去30日','30 Tage','30 дней','30 días'):ML('previous run','前回','Vorlauf','пред. запуск','ejec. anterior')))
          +kv(ML('Last run','前回実行','Letzter Lauf','Последний','Último'),S(_fmtWhen(m.last_run_at)))
          +kv(ML('Next run','次回実行','Nächster Lauf','Следующий','Próximo'),S(_fmtNext(m.next_run_at,m.enabled)))
        +'</div>'
        +'<div class="mon-dlg-acts mon-detail-acts">'
          +'<button class="mon-btn" data-d="run">▶ '+S(ML('Run now','今すぐ実行','Jetzt','Запустить','Ejecutar'))+'</button>'
          +'<button class="mon-btn" data-d="map">◎ '+S(ML('Map','地図','Karte','Карта','Mapa'))+'</button>'
          +'<button class="mon-btn" data-d="'+(m.enabled===false?'resume':'pause')+'">'+(m.enabled===false?'▷ '+S(ML('Resume','再開','Fortsetzen','Возобновить','Reanudar')):'❚❚ '+S(ML('Pause','一時停止','Pause','Пауза','Pausar')))+'</button>'
          +'<button class="mon-btn mon-btn-danger" data-d="del">🗑 '+S(ML('Delete','削除','Löschen','Удалить','Eliminar'))+'</button>'
        +'</div>'
        +'<h4 class="mon-h4">'+S(ML('Run history','実行履歴','Verlauf','История','Historial'))+'</h4>'+runsHtml;
      const ov=_overlay(inner,'mon-ov-detail');
      ov.querySelectorAll('.mon-detail-acts .mon-btn').forEach(b=>{ b.onclick=async()=>{ const d=b.getAttribute('data-d');
        if(d==='run'){ b.disabled=true; b.textContent='…'; const r=await runNow(id); if(r.ok){ _toast(ML('Ran: ','実行: ','Lauf: ','Запуск: ','Ejec.: ')+statusLabel(r.status)); ov.remove(); render(); setTimeout(()=>openDetail(id),400); } else if(r.error==='login'){ _promptLogin(); } else { b.disabled=false; _toast(r.message||_runReasonMsg(r.error)); } }
        else if(d==='map'){ let pts=[]; try{ if(m.last_report_id){ const rep=await _report(m.last_report_id); if(rep&&rep.change_points) pts=rep.change_points; } }catch(_){} showOnMap({geometry:m.geometry,bbox:m.bbox},pts,m.id); ov.remove(); _closeSheetIfMobile(); }
        else if(d==='pause'){ await pause(id); ov.remove(); }
        else if(d==='resume'){ await resume(id); ov.remove(); }
        else if(d==='del'){ if(confirm(ML('Delete this monitor and its history?','この監視と履歴を削除しますか？','Diesen Monitor löschen?','Удалить этот монитор?','¿Eliminar este monitor?'))){ await remove(id); ov.remove(); render(); } }
      }; });
      ov.querySelectorAll('.mon-run').forEach(rr=>{ const rep=rr.getAttribute('data-rep'); if(rep){ rr.classList.add('mon-run-clickable'); rr.onclick=()=>{ openReport(rep); }; } }); }
    function _intLabel(mins){ mins=+mins||360; if(mins<60) return ML(mins+' min','約'+mins+'分','','','')||mins+' min'; const h=Math.round(mins/60); if(h<24) return ML(h+' h',h+'時間',h+' Std',h+' ч',h+' h'); return ML(Math.round(h/24)+' d',Math.round(h/24)+'日',Math.round(h/24)+' T',Math.round(h/24)+' д',Math.round(h/24)+' d'); }

    /* ---- report overlay: conclusion + changes(→evidence) + metrics + evidence list + gaps + limitations ---- */
    async function openReport(reportId){ const rep=(typeof reportId==='object')?reportId:await _report(reportId); if(!rep){ _toast(ML('Report not found.','レポートが見つかりません。','Bericht nicht gefunden.','Отчёт не найден.','Informe no encontrado.')); return; }
      const ev=await _evidence(rep.run_id); const evByKey={}; ev.forEach(e=>evByKey[e.ev_key]=e);
      try{ if(!rep.read) DB.rpc('monitor_mark_read',{p_report:rep.id}); }catch(_){}
      const sevC=SEV_COLOR[rep.severity]||'#8e8e93';
      const chip=(k)=>{ const e=evByKey[k]; return '<button class="mon-evchip" data-ev="'+S(k)+'">'+S(k)+'</button>'; };
      const changes=(rep.changes||[]).map(c=>'<li class="mon-change"><span class="mon-claim">'+S(c.claim)+'</span> '+(c.evidence_ids||[]).map(chip).join(' ')+'</li>').join('');
      const metrics=rep.metrics&&rep.metrics.articles?('<div class="mon-metrics">'
        +'<div class="mon-metric"><span>'+S(ML('Reports','記事','Berichte','Статьи','Artículos'))+'</span><b>'+S(rep.metrics.articles.prev)+' → '+S(rep.metrics.articles.cur)+' <em style="color:'+(rep.metrics.articles.delta>=0?'#30a46c':'#ff453a')+'">('+(rep.metrics.articles.delta>=0?'+':'')+S(rep.metrics.articles.delta)+')</em></b></div>'
        +(rep.metrics.new_clusters!=null?'<div class="mon-metric"><span>'+S(ML('New event clusters','新規クラスター','Neue Cluster','Новые кластеры','Nuevos grupos'))+'</span><b>'+S(rep.metrics.new_clusters)+'</b></div>':'')
        +(rep.metrics.publishers?'<div class="mon-metric"><span>'+S(ML('Publishers','媒体数','Quellen','Источники','Fuentes'))+'</span><b>'+S(rep.metrics.publishers.prev)+' → '+S(rep.metrics.publishers.cur)+'</b></div>':'')
        +'</div>'):'';
      /* ⚠ (#R251) THE TITLE ARRIVES AS ONE TUPLE, NOT AS FIVE PARAMETERS. Spread across `list`'s
         own parameters, the five strings were arguments of `list` rather than of `ML`, so the inline
         report counted none of the three headings and fr/ko/zh/zh-hans rendered them in English. */
      const list=(arr,title)=>{ if(!arr||!arr.length) return ''; return '<h4 class="mon-h4">'+S(ML.arr(title))+'</h4><ul class="mon-ul">'+arr.map(x=>'<li>'+S(x)+'</li>').join('')+'</ul>'; };
      const evCards=ev.map(e=>'<div class="mon-evcard" id="mon-ev-'+S(e.ev_key)+'"><div class="mon-evk">'+S(e.ev_key)+'</div><div class="mon-evb">'
        +'<div class="mon-evtitle">'+(e.source_url?'<a href="'+URLS(e.source_url)+'" target="_blank" rel="noopener">'+S(e.title||e.source_url)+'</a>':S(e.title||'—'))+'</div>'
        +'<div class="mon-evmeta">'+S(e.source_name||'')+(e.observed_at?' · '+S(new Date(e.observed_at).toLocaleString()):'')+((e.payload&&e.payload.subject)?' · '+S(e.payload.subject):'')+' · <span class="mon-evkind mon-evkind-'+S(e.change_kind||'')+'">'+S(e.change_kind||'')+'</span></div>'
        +'</div></div>').join('');
      const inner='<button class="mon-x" aria-label="Close">×</button>'
        +'<div class="mon-rep-head"><span class="mon-sev-badge" style="--c:'+sevC+'">'+S(sevLabel(rep.severity))+'</span><h3 class="mon-h3">'+S(rep.headline)+'</h3></div>'
        +(rep.summary?'<p class="mon-summary">'+S(rep.summary)+'</p>':'')
        +metrics
        +(changes?'<h4 class="mon-h4">'+S(ML('Key changes','主な変化','Wichtige Änderungen','Основные изменения','Cambios clave'))+'</h4><ul class="mon-changes">'+changes+'</ul>':'')
        +(ev.length?'<button class="mon-viewbtn" id="mon-rep-map">◎ '+S(ML('Show change points on map','変化地点を地図に表示','Auf Karte zeigen','Показать на карте','Mostrar en el mapa'))+'</button>':'')
        +list(rep.unchanged,MLA('Unchanged / not confirmed','変化なし・未確認','Unverändert','Без изменений','Sin cambios'))
        +list(rep.data_gaps,MLA('Data gaps','取得できなかったデータ','Datenlücken','Пробелы в данных','Lagunas de datos'))
        +list(rep.limitations,MLA('Limitations','制約・不確実性','Einschränkungen','Ограничения','Limitaciones'))
        +'<h4 class="mon-h4">'+S(ML('Evidence','根拠','Belege','Доказательства','Evidencia'))+' ('+ev.length+')</h4><div class="mon-evlist">'+(evCards||('<div class="mon-empty">'+S(ML('No evidence stored.','根拠が保存されていません。','Keine Belege.','Нет данных.','Sin evidencia.'))+'</div>'))+'</div>'
        +'<div class="mon-repfoot">'+S(ML('Generated','生成','Erstellt','Создано','Generado'))+': '+S(_fmtWhen(rep.created_at))+(rep.ai_model?' · '+S(rep.ai_model):'')+'</div>';
      const ov=_overlay(inner,'mon-ov-report');
      ov.querySelectorAll('.mon-evchip').forEach(ch=>{ ch.onclick=()=>{ const k=ch.getAttribute('data-ev'); const t=ov.querySelector('#mon-ev-'+CSS.escape(k)); if(t){ t.scrollIntoView({behavior:'smooth',block:'center'}); t.classList.add('mon-ev-hl'); setTimeout(()=>t.classList.remove('mon-ev-hl'),1500); } }; });
      const rm=ov.querySelector('#mon-rep-map'); if(rm) rm.onclick=async()=>{ let area=null; try{ const m=await _get(rep.monitor_id); if(m) area={geometry:m.geometry,bbox:m.bbox}; }catch(_){} showOnMap(area,rep.change_points||[],rep.monitor_id); ov.remove(); _closeSheetIfMobile(); }; }

    async function flyTo(id){ try{ const m=(typeof id==='object')?id:await _get(id); if(!m) return false; let pts=[]; try{ if(m.last_report_id){ const rep=await _report(m.last_report_id); if(rep&&rep.change_points) pts=rep.change_points; } }catch(_){} showOnMap({geometry:m.geometry,bbox:m.bbox},pts,m.id); return true; }catch(_){ return false; } }

    /* (#R149) ROOT-CAUSE of "監視を作成を押しても何も起こらない": imToast/aiToast are closure-scoped functions
       (the app is NOT an ES module, so top-level fns are NOT on window). This guarded on `window.imToast` /
       `window.aiToast` — BOTH undefined — so EVERY monitor toast silently no-op'd, including the error feedback
       when create() failed (e.g. plan limit reached, geometry too big). The button just reverted and nothing
       appeared. Call the in-scope fns directly (typeof-guarded), with alert() as a guaranteed last resort. */
    function _toast(msg){ if(msg==null||msg==='') return; try{ if(typeof imToast==='function') return imToast(msg); }catch(_){} try{ if(typeof aiToast==='function') return aiToast(msg); }catch(_){} try{ if(typeof satToast==='function') return satToast(msg); }catch(_){} try{ alert(String(msg)); }catch(_){} }
    function _closeSheetIfMobile(){ try{ if(window.__setDetent && window.matchMedia('(max-width:768px)').matches) window.__setDetent('peek'); }catch(_){} }

    /* ---- realtime: refresh the list when a run finishes / a report lands (if the tab is open) ---- */
    (function subscribe(){ try{ if(!DB||!DB.channel) return; let t=null; const bump=()=>{ clearTimeout(t); t=setTimeout(()=>{ try{ if(HOST.mode==='monitors') render(); }catch(_){} },600); };
      DB.channel('im-monitors').on('postgres_changes',{event:'*',schema:'public',table:'area_monitors'},bump).on('postgres_changes',{event:'*',schema:'public',table:'monitor_reports'},bump).subscribe();
    }catch(_){} })();

    /* ---- styles live in a STATIC <style id="mon-styles"> in <head> (no CSS-in-JS template literal — see
           memory: template-literal CSS backtick = blank site). ---- */

    /* ---- Atlas bridge (structured results for the dispatch cases) ---- */
    const atlas={
      async create(o){ const r=await create(o||{}); return r; },
      async openList(){ try{ IntMapOS.exec('tab.monitors',{source:'atlas'}); }catch(_){} return {ok:true}; },
      async open(id){ if(id) return openDetail(id); return this.openList(); },
      async listText(){ try{ if(!_loggedIn()) return {ok:false,error:'login'}; const rows=await _list(); return {ok:true,rows}; }catch(e){ return {ok:false,error:String(e&&e.message||e)}; } },
      async pause(id){ return {ok:await setEnabled(id,false)}; },
      async resume(id){ return {ok:await setEnabled(id,true)}; },
      async run(id){ return runNow(id); },
      async remove(id){ return {ok:await remove(id)}; },
      openReport, flyTo, activeArea
    };

    return { render, create, openCreateDialog, openDetail, openReport, pause, resume, remove, runNow, flyTo, activeArea, mapViewArea, showOnMap, clearMap, atlas,
      _list, _get, statusLabel, sevLabel };
};
