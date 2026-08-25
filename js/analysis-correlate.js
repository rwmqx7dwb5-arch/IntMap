/* ============================================================================
 *  IntMap · Correlation / scatter — the implementation behind window.IntMapCorrelate  (#R322)
 * ----------------------------------------------------------------------------
 *  Fetched by js/lazy-modules.js when the Layers → Tools «Correlation / scatter» button is
 *  pressed (or Atlas dispatches `correlate`). ⚠ THE BUTTON ITSELF DID NOT MOVE: #btn-correlate is
 *  built at boot by the shell in js/analysis-panels.js, because deferring it would delete a
 *  Layers row until something asked for it. Only the overlay, the 62 metrics and the residual map
 *  are here, moved verbatim.
 *
 *  ⚠ The published global is `__imAnalysis…`, not `IntMap…` — js/atlas-controls.js's
 *  moduleCatalog() discovers `window.IntMap*` by enumeration.
 * ==========================================================================*/
window.IntMapModules=window.IntMapModules||{};
window.IntMapModules.analysisCorrelate=function(HOST){
 const GE=()=>window.IntMapGeoEngine;   /* (#R178) the renderer, through the contract — never the raw handle */
  /* (#R170) "Is it safe to addSource/addLayer right now?" — the app-wide predicate declared in index.html.
     A function DECLARATION so nested closures above this line can call it (no TDZ). Falls back to the old
     isStyleLoaded() test only if the host is somehow absent. */
  function _imCanDraw(){ try{ return !!HOST.canDraw(); }catch(_){ try{ return !!GE().ready(); }catch(__){ return false; } } }
  /* stable closure values (never reassigned) — rebound under their original names so the moved body stays verbatim */
  const countryStats=HOST.countryStats, t=HOST.t, loadCountryData=HOST.loadCountryData, addCountryLayers=HOST.addCountryLayers;
  (function(){
    if(typeof countryStats==='undefined') return;
    const L=()=>HOST.lang;
    const tr=window.IntMapLang.pick(()=>L());
    /* ⚠⚠⚠ (#R248) THE FOURTEENTH SHAPE — A LANGUAGE→POSITION CHAIN WRITTEN AS A TERNARY ═══════
       `ml` below used to turn the language into an ARRAY POSITION with a ternary chain ending in
       `:0`. It is the eleventh shape's sibling one container further out: #R241 closed the tuple
       held as an ARRAY, #R246 the tuple held as an OBJECT keyed by language code, and this is the
       tuple read through a language→POSITION map that is not a map — it is an EXPRESSION, so
       scripts/i18n-langmap-audit.mjs (which looks for an object whose values are numbers) counted
       zero of it, and so did every other instrument. The consequence is not subtle: the last arm is
       `0`, so fr / ko / zh / zh-Hans took ENGLISH for all 62 metric labels in the Countries panel,
       permanently, with no inline-table fallback to reach for.
       `tr.arr()` IS `pick()` applied to the array (js/lang-registry.js), so the five positional
       slots and the inline table stay the one rule they are everywhere else. */
    const LA=window.IntMapLang.pickArgs();
    function compact(v){ v=+v; const a=Math.abs(v); if(a>=1e12)return (v/1e12).toFixed(1)+'T'; if(a>=1e9)return (v/1e9).toFixed(1)+'B'; if(a>=1e6)return (v/1e6).toFixed(1)+'M'; if(a>=1e3)return (v/1e3).toFixed(1)+'k'; return ''+Math.round(v); }
    const METRICS=[
      {id:'pop',      get:s=>s.pop,      log:true,  fmt:v=>compact(v),       lbl:LA('Population','人口','Bevölkerung','Население','Población')},
      {id:'density',  get:s=>s.density,  log:true,  fmt:v=>Math.round(v).toLocaleString()+' /km²', lbl:LA('Pop. density','人口密度','Bevölkerungsdichte','Плотность нас.','Densidad de pob.')},
      {id:'area',     get:s=>s.area,     log:true,  fmt:v=>compact(v)+' km²', lbl:LA('Area','面積','Fläche','Площадь','Superficie')},
      {id:'gdp',      get:s=>s.gdp,      log:true,  fmt:v=>'$'+compact(v*1e9), lbl:LA('GDP (nominal)','GDP(名目)','BIP (nominal)','ВВП (номинал)','PIB (nominal)')},   /* s.gdp is in $B → ×1e9 for the T/B label */
      {id:'gdppc',    get:s=>s.gdppc,    log:true,  fmt:v=>'$'+compact(v),   lbl:LA('GDP per capita','1人当たりGDP','BIP pro Kopf','ВВП на душу','PIB per cápita')},
      {id:'gdppcPPP', get:s=>s.gdppcPPP, log:true,  fmt:v=>'$'+compact(v),   lbl:LA('GDP/capita (PPP)','1人当たりGDP(PPP)','BIP pro Kopf (KKP)','ВВП на душу (ППС)','PIB per cápita (PPA)')},
      {id:'hdi',      get:s=>s.hdi,      log:false, fmt:v=>v.toFixed(3),     lbl:['HDI','HDI','HDI','ИЧР','IDH']},
      {id:'dem',      get:s=>s.dem,      log:false, fmt:v=>v.toFixed(2),     lbl:LA('Democracy Index','民主主義指数','Demokratieindex','Индекс демократии','Índice de democracia')},
      {id:'milSpend', get:s=>s.milSpend, log:true,  fmt:v=>'$'+v+'B',        lbl:LA('Mil. spending','国防費','Militärausgaben','Военные расходы','Gasto militar')},
      {id:'milGDP',   get:s=>(s.milSpend!=null&&s.gdp)?s.milSpend/s.gdp*100:null, log:false, fmt:v=>v.toFixed(2)+'%', lbl:LA('Mil. spend (% GDP)','国防費(対GDP%)','Militärausg. (% BIP)','Воен. расходы (% ВВП)','Gasto mil. (% PIB)')},
      {id:'tfr',      get:s=>s.tfr,      log:false, fmt:v=>v.toFixed(2),     lbl:LA('Fertility rate','合計特殊出生率','Geburtenrate','Рождаемость','Tasa de fecundidad')},
      {id:'lifeExp',  get:s=>s.lifeExp,  log:false, fmt:v=>v.toFixed(1)+' yr', lbl:LA('Life expectancy','平均寿命','Lebenserwartung','Прод. жизни','Esperanza de vida')},
      {id:'internet', get:s=>s.internet, log:false, fmt:v=>v+'%',            lbl:LA('Internet users','ネット利用率','Internetnutzer','Интернет-польз.','Usuarios de Internet')},
      {id:'gdpPPP',   get:s=>s.gdpPPP,   log:true,  fmt:v=>'$'+compact(v*1e9), lbl:['GDP (PPP)','GDP(PPP)','BIP (KKP)','ВВП (ППС)','PIB (PPA)']}
    ];
    /* (#R40) World-Bank-backed axes — greatly expands the metric list ("対応する項目を大幅に増やして").
       Loaded on demand (cached) via window.IntMapWB; get(s,code) reads the latest value for that ISO3. */
    let WBV={};
    [['EN.GHG.CO2.PC.CE.AR5',false,v=>v.toFixed(1)+' t',LA('CO₂ per capita','1人当たりCO₂排出','CO₂ pro Kopf','CO₂ на душу','CO₂ per cápita')],
     ['SP.URB.TOTL.IN.ZS',false,v=>Math.round(v)+'%',LA('Urban population %','都市人口率','Stadtbevölkerung %','Городское нас. %','Población urbana %')],
     ['EG.ELC.ACCS.ZS',false,v=>Math.round(v)+'%',LA('Electricity access %','電力アクセス率','Stromzugang %','Доступ к электр. %','Acceso a electricidad %')],
     ['SH.XPD.CHEX.GD.ZS',false,v=>v.toFixed(1)+'%',LA('Health spend %GDP','医療支出 対GDP','Gesundheitsausg. %BIP','Расходы на здрав. %ВВП','Gasto en salud %PIB')],
     ['AG.LND.FRST.ZS',false,v=>Math.round(v)+'%',LA('Forest area %','森林面積率','Waldfläche %','Лесная площадь %','Superficie forestal %')],
     ['EG.FEC.RNEW.ZS',false,v=>Math.round(v)+'%',LA('Renewable energy %','再エネ比率','Erneuerbare Energie %','Возобн. энергия %','Energía renovable %')],
     ['IT.CEL.SETS.P2',false,v=>Math.round(v),LA('Mobile subs /100','携帯契約 /100人','Mobilfunk /100','Моб. связь /100','Móviles /100')],
     ['FP.CPI.TOTL.ZG',false,v=>v.toFixed(1)+'%',LA('Inflation % (CPI)','インフレ率','Inflation % (VPI)','Инфляция % (ИПЦ)','Inflación % (IPC)')],
     ['SE.ADT.LITR.ZS',false,v=>Math.round(v)+'%',LA('Literacy rate %','識字率','Alphabetisierung %','Грамотность %','Alfabetización %')],
     ['SI.POV.GINI',false,v=>v.toFixed(1),LA('Income inequality (Gini)','所得格差(ジニ)','Ungleichheit (Gini)','Неравенство (Джини)','Desigualdad (Gini)')],
     ['NE.TRD.GNFS.ZS',true,v=>Math.round(v)+'%',LA('Trade % of GDP','貿易 対GDP','Handel % BIP','Торговля % ВВП','Comercio % PIB')],
     ['SL.UEM.TOTL.ZS',false,v=>v.toFixed(1)+'%',LA('Unemployment %','失業率','Arbeitslosigkeit %','Безработица %','Desempleo %')],
     ['GC.DOD.TOTL.GD.ZS',false,v=>Math.round(v)+'%',LA('Govt debt % GDP','政府債務 対GDP','Staatsschulden % BIP','Госдолг % ВВП','Deuda púb. % PIB')],
     ['SH.DYN.MORT',true,v=>Math.round(v),LA('Under-5 mortality /1k','5歳未満死亡率','Kindersterblichkeit /1k','Смертн. до 5 лет /1k','Mortalidad <5 /1k')],
     ['EG.USE.ELEC.KH.PC',true,v=>compact(v)+' kWh',LA('Electricity use /capita','電力消費 /人','Stromverbrauch /Kopf','Потр. электр. /чел','Consumo eléctrico /cápita')],
     ['BX.KLT.DINV.WD.GD.ZS',false,v=>v.toFixed(1)+'%',LA('FDI inflow % GDP','対内直接投資 %','ADI-Zufluss % BIP','ПИИ % ВВП','IED entrante % PIB')],
     ['NV.IND.MANF.ZS',false,v=>v.toFixed(1)+'%',LA('Manufacturing % GDP','製造業 対GDP','Verarb. Gewerbe % BIP','Промышл. % ВВП','Manufactura % PIB')],
     ['SE.SEC.ENRR',false,v=>Math.round(v)+'%',LA('Secondary enrollment %','中等教育就学率','Sekundarschulrate %','Среднее образ. %','Matrícula secundaria %')],
     ['SH.MED.PHYS.ZS',false,v=>v.toFixed(2),LA('Physicians /1k','医師 /1k人','Ärzte /1k','Врачи /1k','Médicos /1k')],
     /* (#R41) greatly expanded set ("対応する項目を大幅に増やして") — all live, latest-value World Bank, full 5-lang */
     ['SP.POP.GROW',false,v=>v.toFixed(1)+'%',LA('Population growth %','人口増加率','Bevölkerungswachstum %','Рост населения %','Crecimiento pob. %')],
     ['SP.RUR.TOTL.ZS',false,v=>Math.round(v)+'%',LA('Rural population %','農村人口率','Landbevölkerung %','Сельское нас. %','Población rural %')],
     ['NY.GNP.PCAP.CD',true,v=>'$'+compact(v),LA('GNI per capita','1人当たりGNI','BNE pro Kopf','ВНД на душу','INB per cápita')],
     ['AG.LND.AGRI.ZS',false,v=>Math.round(v)+'%',LA('Agricultural land %','農地率','Landw. Fläche %','С/х земли %','Tierra agrícola %')],
     ['EN.ATM.PM25.MC.M3',false,v=>v.toFixed(1)+' µg/m³',LA('PM2.5 air pollution','PM2.5大気汚染','PM2.5-Belastung','PM2.5 загрязн.','Contaminación PM2.5')],
     ['VC.IHR.PSRC.P5',true,v=>v.toFixed(1),LA('Homicide rate /100k','殺人率 /10万','Tötungsrate /100k','Убийства /100k','Homicidios /100k')],
     ['SE.XPD.TOTL.GD.ZS',false,v=>v.toFixed(1)+'%',LA('Education spend %GDP','教育支出 対GDP','Bildungsausg. %BIP','Расходы на образ. %ВВП','Gasto educación %PIB')],
     ['SH.H2O.BASW.ZS',false,v=>Math.round(v)+'%',LA('Basic water access %','基本的飲料水 %','Wasserzugang %','Доступ к воде %','Acceso a agua %')],
     ['SH.STA.BASS.ZS',false,v=>Math.round(v)+'%',LA('Basic sanitation %','基本的衛生 %','Sanitärzugang %','Санитария %','Saneamiento %')],
     ['GB.XPD.RSDV.GD.ZS',false,v=>v.toFixed(2)+'%',LA('R&D spend %GDP','研究開発費 対GDP','F&E-Ausgaben %BIP','НИОКР %ВВП','Gasto I+D %PIB')],
     ['SL.TLF.CACT.FE.ZS',false,v=>Math.round(v)+'%',LA('Female labor force %','女性労働参加率','Frauenerwerbsquote %','Жен. занятость %','Mujeres en fuerza lab. %')],
     ['ST.INT.ARVL',true,v=>compact(v),LA('Tourist arrivals','外国人観光客数','Touristenankünfte','Турист. прибытия','Llegadas turísticas')],
     ['TX.VAL.TECH.MF.ZS',false,v=>v.toFixed(1)+'%',LA('High-tech exports %','ハイテク輸出 %','Hightech-Exporte %','Высокотех. экспорт %','Exp. alta tecnología %')],
     ['MS.MIL.TOTL.P1',true,v=>compact(v),LA('Armed forces','軍人数','Streitkräfte','Военнослужащие','Fuerzas armadas')],
     ['SH.DYN.AIDS.ZS',false,v=>v.toFixed(1)+'%',LA('HIV prevalence %','HIV有病率','HIV-Prävalenz %','Распр. ВИЧ %','Prevalencia VIH %')],
     ['NY.GDP.MKTP.KD.ZG',false,v=>v.toFixed(1)+'%',LA('GDP growth %','GDP成長率','BIP-Wachstum %','Рост ВВП %','Crecimiento PIB %')],
     ['SH.XPD.OOPC.CH.ZS',false,v=>v.toFixed(1)+'%',LA('Out-of-pocket health %','自己負担医療費 %','Selbstzahlerquote %','Личные расходы %','Gasto de bolsillo %')],
     ['AG.LND.ARBL.ZS',false,v=>v.toFixed(1)+'%',LA('Arable land %','耕地率','Ackerland %','Пашня %','Tierra cultivable %')]
    ].forEach(arr=>{ const code=arr[0]; METRICS.push({id:'wb:'+code,wb:code,log:arr[1],fmt:arr[2],lbl:arr[3],get:(s,c)=>{ const m=WBV[code]; return (m&&c&&m[c])?m[c].v:null; }}); });
    function ensureWB(){ try{ const need=[xId,yId].map(id=>METRICS.find(m=>m.id===id)).filter(m=>m&&m.wb&&!WBV[m.wb]);
      if(!need.length||!window.IntMapWB||!window.IntMapWB.fetch) return Promise.resolve();
      return Promise.all(need.map(m=>window.IntMapWB.fetch(m.wb).then(d=>{ WBV[m.wb]=d||{}; }).catch(()=>{ WBV[m.wb]={}; }))); }catch(_){ return Promise.resolve(); } }
    function reRender(){ if(!ov) return; try{ const need=[xId,yId].map(id=>METRICS.find(m=>m.id===id)).some(m=>m&&m.wb&&!WBV[m.wb]); if(need){ const w=ov.querySelector('.corr-svg-wrap'); if(w) w.innerHTML='<div style="padding:46px;text-align:center;color:var(--text-muted);">'+t('loadingData')+'</div>'; } }catch(_){} ensureWB().then(render); }
    const ml=m=>tr.arr(m.lbl);   /* (#R248) see the note by `LA` above — this was the fourteenth shape */
    function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
    function pear(xs,ys){ const n=xs.length; if(n<3)return null; let sx=0,sy=0,sxx=0,syy=0,sxy=0; for(let i=0;i<n;i++){const x=xs[i],y=ys[i]; sx+=x;sy+=y;sxx+=x*x;syy+=y*y;sxy+=x*y;} const dx=n*sxx-sx*sx,dy=n*syy-sy*sy; if(dx<=0||dy<=0)return null; return (n*sxy-sx*sy)/Math.sqrt(dx*dy); }
    function ranks(a){ const idx=a.map((v,i)=>[v,i]).sort((p,q)=>p[0]-q[0]); const r=new Array(a.length); let i=0; while(i<idx.length){ let j=i; while(j+1<idx.length&&idx[j+1][0]===idx[i][0])j++; const avg=(i+j)/2+1; for(let k=i;k<=j;k++)r[idx[k][1]]=avg; i=j+1; } return r; }
    function lsq(xs,ys){ const n=xs.length; let sx=0,sy=0,sxx=0,sxy=0; for(let i=0;i<n;i++){sx+=xs[i];sy+=ys[i];sxx+=xs[i]*xs[i];sxy+=xs[i]*ys[i];} const m=(n*sxy-sx*sy)/((n*sxx-sx*sx)||1); return {m,b:(sy-m*sx)/n}; }
    let xId='gdppc', yId='lifeExp', ov=null, _lastFit=null;
    function inject(){ if(document.getElementById('corr-style'))return; const st=document.createElement('style'); st.id='corr-style';
      st.textContent='#corr-overlay{display:none;position:fixed;inset:0;z-index:9998;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,0.18);}'
        +'#corr-overlay.show{display:flex;}'
        +'.corr-card{position:relative;background:var(--popup-bg);border:1px solid var(--glass-border,rgba(128,128,128,0.18));border-radius:20px;box-shadow:var(--shadow);width:min(620px,96vw);max-height:92vh;overflow:auto;padding:18px 20px 20px;backdrop-filter:saturate(180%) blur(22px);-webkit-backdrop-filter:saturate(180%) blur(22px);}'
        +'.corr-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px;cursor:grab;touch-action:none;}'
        +'.corr-head:active{cursor:grabbing;}'
        +'.corr-head h3{margin:0;font-size:17px;}'
        +'.corr-x{background:transparent;border:none;color:var(--text-muted);font-size:25px;line-height:1;cursor:pointer;padding:2px 6px;}'
        +'.corr-pick{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:8px;}'
        +'.corr-pick label{flex:1 1 0;min-width:150px;font-size:11.5px;color:var(--text-muted);}'
        +'.corr-pick select{width:100%;margin-top:3px;padding:8px 9px;border-radius:9px;border:1px solid var(--glass-border,rgba(128,128,128,0.25));background:var(--input-bg);color:var(--text-main);font-size:13px;}'
        +'.corr-r{display:flex;gap:18px;flex-wrap:wrap;align-items:baseline;margin:10px 2px 4px;}'
        +'.corr-r .lab{font-size:11px;color:var(--text-muted);}'
        +'.corr-r b{font-size:22px;display:block;}'
        +'.corr-dot{fill:var(--primary-color);fill-opacity:0.62;}'
        +'.corr-note{font-size:11px;color:var(--text-muted);margin-top:8px;line-height:1.5;}';
      document.head.appendChild(st); }
    function ensure(){ if(ov)return ov; inject(); ov=document.createElement('div'); ov.id='corr-overlay';
      ov.innerHTML='<div class="corr-card" role="dialog" aria-modal="true"><div class="corr-head"><h3></h3><button class="corr-x" aria-label="'+tr('Close','閉じる','Schließen','Закрыть','Cerrar')+'">×</button></div>'
        +'<div class="corr-pick"><label class="lx"><span></span><select class="corr-sel-x"></select></label><label class="ly"><span></span><select class="corr-sel-y"></select></label></div>'
        +'<div class="corr-svg-wrap"></div><div class="corr-r"></div><div class="corr-note"></div></div>';
      document.body.appendChild(ov);
      ov.addEventListener('click',e=>{ if(e.target===ov) hide(); });
      ov.querySelector('.corr-x').onclick=hide;
      /* (#R41) drag the card by its header so the user can shove it aside and watch the map — combined with the
         now-translucent backdrop this answers "機能使ってたら地図が見れない". */
      (function(){ const card=ov.querySelector('.corr-card'), head=ov.querySelector('.corr-head'); let dx=0,dy=0,ox=0,oy=0,drag=false;
        const dn=e=>{ if(e.target.closest('.corr-x'))return; drag=true; const p=e.touches?e.touches[0]:e; ox=p.clientX-dx; oy=p.clientY-dy; e.preventDefault(); };
        const mv=e=>{ if(!drag)return; const p=e.touches?e.touches[0]:e; dx=p.clientX-ox; dy=p.clientY-oy; card.style.transform='translate('+dx+'px,'+dy+'px)'; };
        const up=()=>{ drag=false; };
        head.addEventListener('mousedown',dn); head.addEventListener('touchstart',dn,{passive:false});
        window.addEventListener('mousemove',mv); window.addEventListener('touchmove',mv,{passive:false});
        window.addEventListener('mouseup',up); window.addEventListener('touchend',up);
      })();
      const sx=ov.querySelector('.corr-sel-x'), sy=ov.querySelector('.corr-sel-y');
      METRICS.forEach(m=>{ const o=document.createElement('option'); o.value=m.id; o.textContent=ml(m); sx.appendChild(o); sy.appendChild(o.cloneNode(true)); });
      sx.value=xId; sy.value=yId;
      sx.onchange=()=>{ xId=sx.value; reRender(); }; sy.onchange=()=>{ yId=sy.value; reRender(); };
      return ov; }
    function hide(){ if(ov) ov.classList.remove('show'); }
    function pairs(mx,my){ const out=[]; for(const c in countryStats){ const s=countryStats[c]; if(!s)continue; let x=mx.get(s,c),y=my.get(s,c); if(x==null||y==null||!isFinite(x)||!isFinite(y))continue; if(mx.log&&x<=0)continue; if(my.log&&y<=0)continue; out.push({c,nm:(L()==='jp'?(s.nameJp||s.nameEn):s.nameEn)||c,x:+x,y:+y}); } return out; }
    function render(){ if(!ov)return; const mx=METRICS.find(m=>m.id===xId), my=METRICS.find(m=>m.id===yId);
      ov.querySelector('.corr-head h3').textContent=tr('Correlation','相関分析','Korrelation','Корреляция','Correlación');
      ov.querySelector('.lx span').textContent=tr('X axis','横軸 (X)','X-Achse','Ось X','Eje X');
      ov.querySelector('.ly span').textContent=tr('Y axis','縦軸 (Y)','Y-Achse','Ось Y','Eje Y');
      const ps=pairs(mx,my), wrap=ov.querySelector('.corr-svg-wrap'), rEl=ov.querySelector('.corr-r'), nEl=ov.querySelector('.corr-note');
      if(ps.length<3){ wrap.innerHTML=''; rEl.innerHTML=''; nEl.textContent=tr('Not enough countries have both values.','両方の値を持つ国が不足しています。','Zu wenige Länder haben beide Werte.','Недостаточно стран с обоими значениями.','No hay suficientes países con ambos valores.'); return; }
      const tx=ps.map(p=>mx.log?Math.log10(p.x):p.x), ty=ps.map(p=>my.log?Math.log10(p.y):p.y);
      const r=pear(tx,ty), rho=pear(ranks(ps.map(p=>p.x)),ranks(ps.map(p=>p.y)));
      const W=560,H=360,pl=54,prr=16,ptt=14,pb=44, iw=W-pl-prr, ih=H-ptt-pb;
      const xmin=Math.min.apply(0,tx),xmax=Math.max.apply(0,tx),ymin=Math.min.apply(0,ty),ymax=Math.max.apply(0,ty);
      const SX=v=>pl+(xmax===xmin?0.5:(v-xmin)/(xmax-xmin))*iw, SY=v=>ptt+ih-(ymax===ymin?0.5:(v-ymin)/(ymax-ymin))*ih;
      let dots=''; ps.forEach((p,i)=>{ dots+='<circle class="corr-dot" cx="'+SX(tx[i]).toFixed(1)+'" cy="'+SY(ty[i]).toFixed(1)+'" r="4"><title>'+esc(p.nm)+': '+esc(mx.fmt(p.x))+' / '+esc(my.fmt(p.y))+'</title></circle>'; });
      const mb=(r!=null)?lsq(tx,ty):null; let line=''; if(mb){ line='<line x1="'+SX(xmin).toFixed(1)+'" y1="'+SY(mb.m*xmin+mb.b).toFixed(1)+'" x2="'+SX(xmax).toFixed(1)+'" y2="'+SY(mb.m*xmax+mb.b).toFixed(1)+'" stroke="#ff3b30" stroke-width="1.6" stroke-dasharray="5 4"/>'; }
      _lastFit={ps,tx,ty,mx,my,mb};   /* (#R40) kept for the residual map button */
      const axis='<line x1="'+pl+'" y1="'+(ptt+ih)+'" x2="'+(pl+iw)+'" y2="'+(ptt+ih)+'" stroke="rgba(128,128,128,0.5)"/><line x1="'+pl+'" y1="'+ptt+'" x2="'+pl+'" y2="'+(ptt+ih)+'" stroke="rgba(128,128,128,0.5)"/>';
      const inv=(tt,log)=>log?Math.pow(10,tt):tt, TS='font-size="9" style="fill:var(--text-muted)"';
      const ticks='<text x="'+pl+'" y="'+(ptt+ih+15)+'" '+TS+' text-anchor="start">'+esc(mx.fmt(inv(xmin,mx.log)))+'</text>'
        +'<text x="'+(pl+iw)+'" y="'+(ptt+ih+15)+'" '+TS+' text-anchor="end">'+esc(mx.fmt(inv(xmax,mx.log)))+'</text>'
        +'<text x="'+(pl-5)+'" y="'+(ptt+ih)+'" '+TS+' text-anchor="end">'+esc(my.fmt(inv(ymin,my.log)))+'</text>'
        +'<text x="'+(pl-5)+'" y="'+(ptt+9)+'" '+TS+' text-anchor="end">'+esc(my.fmt(inv(ymax,my.log)))+'</text>';
      const titles='<text x="'+(pl+iw/2)+'" y="'+(H-6)+'" font-size="11" style="fill:var(--text-main)" text-anchor="middle">'+esc(ml(mx))+(mx.log?' (log)':'')+'</text>'
        +'<text x="14" y="'+(ptt+ih/2)+'" font-size="11" style="fill:var(--text-main)" text-anchor="middle" transform="rotate(-90 14 '+(ptt+ih/2)+')">'+esc(ml(my))+(my.log?' (log)':'')+'</text>';
      wrap.innerHTML='<svg viewBox="0 0 '+W+' '+H+'" width="100%" style="display:block;">'+axis+line+dots+ticks+titles+'</svg>';
      const str=Math.abs(r||0), d= str<0.2?tr('very weak','ごく弱い','sehr schwach','очень слабая','muy débil'):str<0.4?tr('weak','弱い','schwach','слабая','débil'):str<0.6?tr('moderate','中程度の','mäßig','умеренная','moderada'):str<0.8?tr('strong','強い','stark','сильная','fuerte'):tr('very strong','非常に強い','sehr stark','очень сильная','muy fuerte');
      const sg= r>0?tr('positive','正の','positive','положительная','positiva'):tr('negative','負の','negative','отрицательная','negativa');
      rEl.innerHTML='<div><span class="lab">'+tr('Pearson r','ピアソン r','Pearson r','Пирсон r','r de Pearson')+(mx.log||my.log?' ('+tr('log','対数','log','лог','log')+')':'')+'</span><b style="color:'+(r>0?'#34c759':'#ff453a')+'">'+(r!=null?r.toFixed(3):'—')+'</b></div>'
        +'<div><span class="lab">'+tr('Spearman ρ (rank)','スピアマン ρ (順位)','Spearman ρ (Rang)','Спирмен ρ (ранг)','ρ de Spearman (rango)')+'</span><b>'+(rho!=null?rho.toFixed(3):'—')+'</b></div>'
        +'<div><span class="lab">'+tr('Countries','国数','Länder','Стран','Países')+'</span><b>'+ps.length+'</b></div>'
        +(mb?'<div style="flex:1 1 100%;margin-top:2px;"><button id="corr-resid-btn" class="ai-test-btn" style="width:100%;">🗺 '+tr('Color map by residual (blue = above, red = below)','残差で地図を塗る（青=上振れ / 赤=下振れ）','Karte nach Residuen färben (blau = über, rot = unter)','Закрасить карту по остаткам (синий = выше, красный = ниже)','Colorear el mapa por residuo (azul = por encima, rojo = por debajo)')+'</button></div>':'');
      try{ const rb=ov.querySelector('#corr-resid-btn'); if(rb) rb.onclick=()=>{ try{ residualMap(); }catch(_){} }; }catch(_){}
      nEl.textContent=d+' '+sg+' '+tr('correlation','相関','Korrelation','корреляция','correlación')+' · '+tr('Correlation is not causation; outliers and confounders matter.','相関は因果ではありません。外れ値や交絡因子に注意。','Korrelation ist keine Kausalität; Ausreißer & Störfaktoren beachten.','Корреляция — не причинность; учитывайте выбросы и факторы.','Correlación no es causalidad; atención a valores atípicos y factores de confusión.');
    }
    /* (#R40) Residual map: paint each country by how far it sits ABOVE (blue) or BELOW (red) the regression
       line — deeper = larger residual. Uses the `countries` source via a per-code match expression. */
    function ensureCountriesSrc(cb){ try{ if(GE().layers.hasSource('countries')){ cb(); return; } if(typeof loadCountryData==='function'){ loadCountryData().then(()=>{ try{ if(typeof addCountryLayers==='function'&&!GE().layers.hasSource('countries')&&_imCanDraw()) addCountryLayers(); }catch(_){} setTimeout(cb,200); }); return; } }catch(_){} cb(); }
    /* (#R41) Diverging RdBu ramp — the residual map now uses a GRADED multi-hue scale (deep red → orange →
       light → light blue → deep blue), not the old two flat colors with faint alpha ("青と赤二色だけで塗れと
       なんかいっていない"). n∈[-1,1]: +1 = far ABOVE the fit (deep blue), −1 = far BELOW (deep red), 0 ≈ on the
       line (near-neutral). */
    const _RDBU=[[-1,[103,0,31]],[-0.66,[178,24,43]],[-0.33,[239,138,98]],[0,[247,247,247]],[0.33,[103,169,207]],[0.66,[33,102,172]],[1,[5,48,97]]];
    function _divColor(n){ n=Math.max(-1,Math.min(1,n)); for(let i=1;i<_RDBU.length;i++){ if(n<=_RDBU[i][0]){ const a=_RDBU[i-1],b=_RDBU[i]; const t=(n-a[0])/((b[0]-a[0])||1); const c=k=>Math.round(a[1][k]+(b[1][k]-a[1][k])*t); return 'rgb('+c(0)+','+c(1)+','+c(2)+')'; } } return 'rgb(5,48,97)'; }
    function residualMap(){ const f=_lastFit; if(!f||!f.mb){ return; }
      hide();   /* (#R41) close the chooser FIRST so the map is ALWAYS revealed — the old code only closed it on
                   success inside a try/catch, so any failure left the user trapped behind the modal
                   ("機能使ってたら×しないと地図見れない"). */
      let tries=0;
      const paint=()=>{ try{
        if(!GE().layers.hasSource('countries')){ if(tries++<40){ ensureCountriesSrc(()=>setTimeout(paint,0)); return; } else { residPill(f.mx,f.my,true); return; } }
        let maxA=0; const resids=f.ps.map((p,i)=>{ const e=f.ty[i]-(f.mb.m*f.tx[i]+f.mb.b); if(Math.abs(e)>maxA)maxA=Math.abs(e); return {c:p.c,e}; }); if(maxA<=0) maxA=1;
        const match=['match',['get','__code']];
        resids.forEach(({c,e})=>{ const n=Math.max(-1,Math.min(1,e/maxA)); match.push(c,_divColor(n)); });
        match.push('rgba(0,0,0,0)');
        if(!GE().layers.has('corr-resid-fill')){ const before=['ofm-river','ofm-water','ofm-peak','ofm-country','ofm-city','ofm-other','borders-only-line'].find(id=>GE().layers.get(id))||(GE().layers.has('tool-poly')?'tool-poly':undefined); GE().layers.add({id:'corr-resid-fill',type:'fill',source:'countries',layout:{visibility:'visible'},paint:{'fill-color':match,'fill-opacity':0.72}}, before); }
        else { GE().layers.setPaint('corr-resid-fill','fill-color',match); GE().layers.setPaint('corr-resid-fill','fill-opacity',0.72); GE().layers.setLayout('corr-resid-fill','visibility','visible'); }
        residPill(f.mx,f.my);
      }catch(e){ if(tries++<40){ setTimeout(paint,120); } else { residPill(f.mx,f.my,true); } } };
      ensureCountriesSrc(()=>setTimeout(paint,0));
    }
    window._refreshResidualColors=()=>{ try{ if(GE().layers.has('corr-resid-fill')&&GE().layers.getLayout('corr-resid-fill','visibility')==='visible'&&_lastFit&&_lastFit.mb) residualMap(); }catch(_){} };
    function residPill(mx,my,err){ let pill=document.getElementById('corr-resid-pill'); if(!pill){ pill=document.createElement('div'); pill.id='corr-resid-pill'; pill.style.cssText='position:absolute;bottom:96px;left:50%;transform:translateX(-50%);z-index:1700;background:var(--popup-bg);color:var(--text-main);border:1px solid var(--glass-border,rgba(128,128,128,0.2));border-radius:14px;padding:9px 14px;font-size:11px;box-shadow:var(--shadow);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);display:flex;flex-direction:column;align-items:stretch;gap:6px;max-width:min(440px,calc(100vw - 24px));'; (document.getElementById('map-container')||document.body).appendChild(pill); }
      if(err){ pill.innerHTML='<div style="display:flex;align-items:center;gap:10px;justify-content:space-between;"><span>'+tr('Could not load country data — try again.','国データを取得できませんでした。再度お試しください。','Länderdaten konnten nicht geladen werden.','Не удалось загрузить данные стран.','No se pudieron cargar los datos de países.')+'</span><button style="background:none;border:none;color:var(--primary-color);font-weight:700;cursor:pointer;font-size:13px;">×</button></div>'; pill.querySelector('button').onclick=()=>{ pill.style.display='none'; }; pill.style.display='flex'; return; }
      /* (#R41) graded diverging legend bar (matches the RdBu fill) + a one-line "what is this" note */
      const grad='linear-gradient(to right,rgb(103,0,31),rgb(178,24,43),rgb(239,138,98),rgb(247,247,247),rgb(103,169,207),rgb(33,102,172),rgb(5,48,97))';
      pill.innerHTML='<div style="display:flex;align-items:center;gap:10px;justify-content:space-between;"><span style="font-weight:600;">'+esc(ml(my))+' '+tr('vs','対','vs','от','vs')+' '+esc(ml(mx))+'</span><button aria-label="'+tr('Close','閉じる','Schließen','Закрыть','Cerrar')+'" style="background:none;border:none;color:var(--primary-color);font-weight:700;cursor:pointer;font-size:13px;line-height:1;">×</button></div>'
        +'<div style="height:11px;border-radius:4px;background:'+grad+';border:1px solid rgba(128,128,128,0.25);"></div>'
        +'<div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text-muted);"><span>'+tr('below the trend','傾向より下','unter dem Trend','ниже тренда','por debajo')+'</span><span>'+tr('on the line','線上','auf der Linie','на линии','en la línea')+'</span><span>'+tr('above the trend','傾向より上','über dem Trend','выше тренда','por encima')+'</span></div>'
        +'<div style="font-size:10px;color:var(--text-muted);line-height:1.4;">'+tr('Each country is shaded by its regression residual — how far its '+ml(my)+' sits above/below what its '+ml(mx)+' predicts.','各国を回帰残差で塗り分け：その国の'+ml(my)+'が'+ml(mx)+'からの予測値より上振れ/下振れしている度合い。','Jedes Land ist nach dem Regressionsresiduum gefärbt — wie weit sein Wert über/unter der Erwartung liegt.','Каждая страна окрашена по остатку регрессии — насколько значение выше/ниже ожидаемого.','Cada país se sombrea por el residuo de la regresión: cuánto se sitúa por encima/debajo de lo previsto.')+'</div>';
      pill.querySelector('button').onclick=()=>{ try{ if(GE().layers.has('corr-resid-fill')) GE().layers.setLayout('corr-resid-fill','visibility','none'); }catch(_){} pill.style.display='none'; };
      pill.style.display='flex'; }
    function open(){ ensure(); ov.classList.add('show'); const go=()=>reRender();
      if(window.countryGeo&&Object.keys(countryStats||{}).length) go();
      else if(typeof loadCountryData==='function'){ ov.querySelector('.corr-svg-wrap').innerHTML='<div style="padding:46px;text-align:center;color:var(--text-muted);">'+t('loadingData')+'</div>'; loadCountryData().then(go); }
      else go(); }
    /* (#R322) the half of the boot-time `intmap-lang` handler that needs the overlay. The listener
       itself stays in the shell — it has to relabel #btn-correlate whether or not this file was ever
       fetched — and this is the branch it guarded with `if(ov)`, which could only ever do anything
       once this file had run. The shell calls it only when the loader says this module is ready. */
    function onLang(){ if(ov){ const sx=ov.querySelector('.corr-sel-x'),sy=ov.querySelector('.corr-sel-y'); if(sx&&sy){ [sx,sy].forEach(sel=>{ [].forEach.call(sel.options,(o,i)=>{ if(METRICS[i]) o.textContent=ml(METRICS[i]); }); }); if(ov.classList.contains('show')) render(); } } }
    window.__imAnalysisCorrelate={open,onLang};
  })();
};
