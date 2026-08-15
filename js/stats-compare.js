/* ============================================================================
 *  IntMap · Multi-country statistics comparison — IntMapStatsCompare  (#R163)
 * ----------------------------------------------------------------------------
 *  Up to 10 countries side by side over ~20 indicators, World Bank <-> IMF source switching,
 *  latest-value table and overlaid time-series charts with a shared crosshair.
 *
 *  Moved verbatim out of index.html's DOMContentLoaded closure (#R163). The values it used
 *  to inherit from that closure are now passed in explicitly — see Architecture.md §3.1.
 *   Reassigned at runtime, so read LIVE through HOST (never captured):
 *      countryGeo -> HOST.countryGeo
 *      currentLang -> HOST.lang
 *  Never rebound, so bound once under the original name:
 *      cName, countryStats, imToast, renderCompareFixed, renderStats, resolveCountryId, searchVal
 * 
 *  The CSS stays in css/intmap.css; this file adds no <style>.
 * ==========================================================================*/
window.IntMapModules=window.IntMapModules||{};
window.IntMapModules.statsCompare=function(HOST){
  const GE=()=>window.IntMapGeoEngine;   /* (#R178) the renderer, through the contract — never the raw handle */
  /* (#R172) THROUGH IntMapGeoEngine — this module no longer names the renderer. */
  const _GE=()=>window.IntMapGeoEngine;
  const _LY=()=>{ const E=_GE(); return E?E.layers:null; };
  const _EV=()=>{ const E=_GE(); return E?E.events:null; };
  const _CM=()=>{ const E=_GE(); return E?E.camera:null; };
  const cName=HOST.cName, countryStats=HOST.countryStats, imToast=HOST.imToast, renderCompareFixed=HOST.renderCompareFixed, renderStats=HOST.renderStats, resolveCountryId=HOST.resolveCountryId, searchVal=HOST.searchVal;
  return (function(){
    const LL=window.IntMapLang.pick(()=>HOST.lang);
    /* (#R241) the ARRAY form of the language helper — see `pickArgs` in js/lang-registry.js.
       These tables held their translations as a bare array indexed by the language's position:
       no inline-table fallback (so fr/ko/zh got element 0 for ever) and invisible to every
       translation instrument. Written as a call, they are ordinary L(…) sites to the audits. */
    const LA=window.IntMapLang.pickArgs();
    const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
    const PAL=['#0a84ff','#ff9500','#34c759','#bf5af2','#ff453a','#5ac8fa','#ffd60a','#ff2d92','#30b0c7','#a2845e'];   /* (#R71) up to 10 countries */
    function short(v){ const a=Math.abs(v); if(a>=1e12) return (v/1e12).toFixed(2)+'T'; if(a>=1e9) return (v/1e9).toFixed(2)+'B'; if(a>=1e6) return (v/1e6).toFixed(2)+'M'; if(a>=1e3) return (v/1e3).toFixed(1)+'k'; return (Math.round(v*100)/100).toLocaleString(); }
    const pct=v=>(Math.round(v*100)/100)+'%', usd=v=>'$'+short(v), num=v=>short(v);
    /* wb: World Bank indicator id · imf: IMF WEO datamapper code (null = WB only) · sc: scale factor for IMF values */
    const IND=[
      {k:'gdp',    wb:'NY.GDP.MKTP.CD', imf:'NGDPD',      imfScale:1e9, fmt:usd, l:LA('GDP (US$)','GDP（米ドル）','BIP (US$)','ВВП (долл.)','PIB (US$)'), def:1},
      {k:'gdppc',  wb:'NY.GDP.PCAP.CD', imf:'NGDPDPC',    imfScale:1,   fmt:usd, l:LA('GDP per capita','1人当たりGDP','BIP pro Kopf','ВВП на душу','PIB per cápita'), def:1},
      {k:'growth', wb:'NY.GDP.MKTP.KD.ZG', imf:'NGDP_RPCH', imfScale:1, fmt:pct, l:LA('GDP growth','GDP成長率','BIP-Wachstum','Рост ВВП','Crecimiento del PIB'), def:1, signed:1},
      {k:'infl',   wb:'FP.CPI.TOTL.ZG', imf:'PCPIPCH',    imfScale:1,   fmt:pct, l:LA('Inflation (CPI)','インフレ率','Inflation','Инфляция','Inflación'), def:0, signed:1},
      {k:'unemp',  wb:'SL.UEM.TOTL.ZS', imf:'LUR',        imfScale:1,   fmt:pct, l:LA('Unemployment','失業率','Arbeitslosigkeit','Безработица','Desempleo'), def:0},
      {k:'debt',   wb:'GC.DOD.TOTL.GD.ZS', imf:'GGXWDG_NGDP', imfScale:1, fmt:pct, l:LA('Govt debt (% GDP)','政府債務(対GDP)','Staatsschulden (% BIP)','Госдолг (% ВВП)','Deuda pública (% PIB)'), def:0},
      {k:'cab',    wb:'BN.CAB.XOKA.GD.ZS', imf:'BCA_NGDPD', imfScale:1, fmt:pct, l:LA('Current account (% GDP)','経常収支(対GDP)','Leistungsbilanz (% BIP)','Текущий счёт (% ВВП)','Cuenta corriente (% PIB)'), def:0, signed:1},
      {k:'pop',    wb:'SP.POP.TOTL',    imf:'LP',         imfScale:1e6, fmt:num, l:LA('Population','人口','Bevölkerung','Население','Población'), def:1},
      {k:'life',   wb:'SP.DYN.LE00.IN', imf:null, fmt:v=>v.toFixed(1), l:LA('Life expectancy','平均寿命','Lebenserwartung','Продолж. жизни','Esperanza de vida'), def:1},
      {k:'tfr',    wb:'SP.DYN.TFRT.IN', imf:null, fmt:v=>v.toFixed(2), l:LA('Fertility rate','出生率','Geburtenrate','Рождаемость','Fecundidad'), def:0},
      {k:'mil',    wb:'MS.MIL.XPND.GD.ZS', imf:null, fmt:pct, l:LA('Military (% GDP)','軍事費(対GDP)','Militär (% BIP)','Военные (% ВВП)','Militar (% PIB)'), def:0},
      {k:'co2',    wb:['EN.GHG.CO2.PC.CE.AR5','EN.ATM.CO2E.PC'], imf:null, fmt:v=>v.toFixed(2)+' t', l:LA('CO₂ per capita','1人当たりCO₂','CO₂ pro Kopf','CO₂ на душу','CO₂ per cápita'), def:0},   /* (#R69) WB retired EN.ATM.CO2E.PC (0 values) — successor series first, old code as fallback */
      {k:'net',    wb:'IT.NET.USER.ZS', imf:null, fmt:pct, l:LA('Internet users','ネット利用率','Internetnutzer','Интернет-польз.','Usuarios de internet'), def:0},
      {k:'urban',  wb:'SP.URB.TOTL.IN.ZS', imf:null, fmt:pct, l:LA('Urban population','都市人口率','Stadtbevölkerung','Городское население','Población urbana'), def:0},
      {k:'exp',    wb:'NE.EXP.GNFS.ZS', imf:null, fmt:pct, l:LA('Exports (% GDP)','輸出(対GDP)','Exporte (% BIP)','Экспорт (% ВВП)','Exportaciones (% PIB)'), def:0},
      {k:'fdi',    wb:'BX.KLT.DINV.WD.GD.ZS', imf:null, fmt:pct, l:LA('FDI inflows (% GDP)','対内直接投資(対GDP)','ADI-Zuflüsse (% BIP)','ПИИ (% ВВП)','IED (% PIB)'), def:0, signed:1},
      {k:'health', wb:'SH.XPD.CHEX.GD.ZS', imf:null, fmt:pct, l:LA('Health spending (% GDP)','医療支出(対GDP)','Gesundheitsausgaben','Здравоохранение (% ВВП)','Gasto en salud (% PIB)'), def:0},
      {k:'edu',    wb:'SE.XPD.TOTL.GD.ZS', imf:null, fmt:pct, l:LA('Education spending (% GDP)','教育支出(対GDP)','Bildungsausgaben','Образование (% ВВП)','Gasto en educación (% PIB)'), def:0},
      {k:'rnd',    wb:'GB.XPD.RSDV.GD.ZS', imf:null, fmt:pct, l:LA('R&D (% GDP)','研究開発費(対GDP)','F&E (% BIP)','НИОКР (% ВВП)','I+D (% PIB)'), def:0},
      {k:'renew',  wb:'EG.FEC.RNEW.ZS', imf:null, fmt:pct, l:LA('Renewable energy','再エネ比率','Erneuerbare Energie','Возобновляемая энергия','Energía renovable'), def:0},
      {k:'forest', wb:'AG.LND.FRST.ZS', imf:null, fmt:pct, l:LA('Forest area','森林率','Waldfläche','Лесистость','Superficie forestal'), def:0},
      {k:'hom',    wb:'VC.IHR.PSRC.P5', imf:null, fmt:v=>v.toFixed(1), l:LA('Homicide rate (/100k)','殺人率(10万人当り)','Mordrate (/100k)','Убийства (/100 тыс.)','Homicidios (/100k)'), def:0},
      /* (#R70) 機能拡充: the bundled per-country reference values (the old bar-compare's data) become
         first-class indicators — instantly available (no fetch), bars/table always work, time-series shows the
         honest single point. `stat` reads countryStats; `src` is the real underlying source. */
      {k:'area',     stat:s=>s.area,      yr:0, fmt:v=>short(v)+' km²', l:LA('Area','面積','Fläche','Площадь','Superficie'), def:0, src:'Natural Earth'},
      {k:'hdi',      stat:s=>s.hdi,       yr:2022, fmt:v=>(+v).toFixed(3), l:LA('HDI','人間開発指数 (HDI)','HDI','ИЧР','IDH'), def:0, src:'UNDP'},
      {k:'demi',     stat:s=>s.dem,       yr:2023, fmt:v=>(+v).toFixed(2), l:LA('Democracy Index','民主主義指数','Demokratieindex','Индекс демократии','Índice de democracia'), def:0, src:'EIU'},
      {k:'gdpppp',   stat:s=>s.gdpPPP,    yr:0, fmt:usd, l:LA('GDP (PPP)','GDP（PPP）','BIP (KKP)','ВВП (ППС)','PIB (PPA)'), def:0, src:'IMF/WB (PPP)'},
      {k:'gdppcppp', stat:s=>s.gdppcPPP,  yr:0, fmt:usd, l:LA('GDP per capita (PPP)','1人当たりGDP（PPP）','BIP pro Kopf (KKP)','ВВП на душу (ППС)','PIB per cápita (PPA)'), def:0, src:'IMF/WB (PPP)'},
      {k:'milb',     stat:s=>s.milSpend,  yr:2023, fmt:v=>'$'+short(v*1e9), l:LA('Military spending ($)','軍事費（米ドル）','Militärausgaben ($)','Военные расходы ($)','Gasto militar ($)'), def:0, src:'SIPRI'}
    ];
    /* (#R71) indicator metadata: category (the picker is grouped — "指標選択画面が煩雑"), sign-carrying
       indicators (green/red ± in bars & table — "増減指標は…緑赤"), and bundled-reference fallbacks used to
       fill gaps ("主要国でも…抜けてしまって比較にならない"). */
    const INDCAT={gdp:'eco',gdppc:'eco',gdpppp:'eco',gdppcppp:'eco',growth:'eco',infl:'eco',unemp:'eco',
      debt:'fis',cab:'fis',exp:'fis',fdi:'fis',
      pop:'soc',life:'soc',tfr:'soc',net:'soc',urban:'soc',health:'soc',edu:'soc',rnd:'soc',hom:'soc',hdi:'soc',demi:'soc',
      co2:'env',renew:'env',forest:'env', area:'base',mil:'base',milb:'base'};
    const CATL={eco:LA('Economy','経済','Wirtschaft','Экономика','Economía'),fis:LA('Fiscal & trade','財政・貿易','Fiskal & Handel','Финансы и торговля','Fiscal y comercio'),
      soc:LA('People & society','人口・社会','Bevölkerung & Gesellschaft','Население и общество','Población y sociedad'),
      env:LA('Environment & energy','環境・エネルギー','Umwelt & Energie','Экология и энергия','Medio ambiente y energía'),
      base:LA('Reference','基礎・参照','Referenz','Справочные','Referencia')};
    const CATORD=['eco','fis','soc','env','base'];
    const SIGNED={growth:1,cab:1,fdi:1};
    const REFV={gdp:s=>s.gdp,gdppc:s=>s.gdppc,pop:s=>s.pop,life:s=>s.lifeExp,net:s=>s.internet};
    /* (#R63) reworked per explicit feedback: NO popup — the comparison renders INSIDE the sidebar (stats area);
       source switching is PER-INDICATOR and only shown where a second source actually exists (no fake implication
       that every metric has two sources). */
    /* (#R69) debt defaults to IMF WEO: the World Bank central-government-debt series is EMPTY for Japan and
       many majors (verified 0 non-null values) — the old WB default guaranteed "時系列データなし". */
    /* (#R70) ONE unified comparison ("似た機能なのに別の場所にあって分かりづらい"): mode = 'bar' (default,
       the old click-country bar view) | 'ts' (time-series) | 'table' (Excel-like pivot). indOrder keeps the
       user's indicator order (table columns are drag-reorderable); tYear/tSort/tFlip are the table state. */
    let host=null, codes=[], sel=null, indOrder=null, mode='bar'; const srcSel={debt:'imf'};
    let tYear=null, tSort=null, tFlip=false;
    let tsFrom=null, tsTo=null;   /* (#R122) user-set time-series year window (null = full available range) */
    let _tsAvailYears=new Set(), _tsYearsSig='';   /* (#R123) years that actually have data across the current comparison → the year pickers list ONLY these ("利用可能な年代のみ選択肢に") */
    /* (#R69) MEASURED root cause of "No time-series available" + "ソース切替でいちいち全再読み込み": every
       chip/metric/source change re-rendered EVERY block and fired a fresh fetch per (indicator,country) — one
       test session produced 321 parallel WB requests (34 for a single indicator), the browser's 6-per-host limit
       queued them for minutes, and the World Bank then throttled the IP so EVERYTHING showed "no data".
       Fixed at the root: the cache stores the IN-FLIGHT PROMISE (concurrent duplicates share one request), a
       6-slot scheduler bounds concurrency, and rendering below is incremental. */
    const cache={};
    const _wbQ=[]; let _wbAct=0;
    function _wbSlot(fn){ return new Promise((res,rej)=>{ _wbQ.push({fn,res,rej}); _wbPump(); }); }
    function _wbPump(){ while(_wbAct<6&&_wbQ.length){ const t=_wbQ.shift(); _wbAct++;
      Promise.resolve().then(t.fn).then(v=>{ _wbAct--; t.res(v); _wbPump(); },e=>{ _wbAct--; t.rej(e); _wbPump(); }); } }
    function _wbOne(code,id){ const key='wb|'+id+'|'+code;
      if(cache[key]===undefined){
        let wrapped=null;
        /* 20 s abort — a hung request (WB throttling) must not leak a scheduler slot forever. A NETWORK failure
           is NOT negative-cached (the entry is dropped so the next render retries); only a real "API answered,
           series is empty" is remembered as null. */
        wrapped=_wbSlot(async()=>{
          const c=('AbortController' in window)?new AbortController():null; const tm=c?setTimeout(()=>{ try{ c.abort(); }catch(_){} },20000):null;
          try{
            const r=await fetch('https://api.worldbank.org/v2/country/'+encodeURIComponent(code)+'/indicator/'+id+'?format=json&per_page=80&date=1970:2030',c?{signal:c.signal}:undefined);
            const j=await r.json(); if(tm) clearTimeout(tm);
            if(Array.isArray(j)&&j[1]){ const out=j[1].filter(d=>d.value!=null).map(d=>({y:+d.date,v:+d.value})).sort((a,b)=>a.y-b.y); if(out.length) return out; }
            if(Array.isArray(j)) return null;   /* API answered: genuinely no data */
          }catch(_){ if(tm) clearTimeout(tm); }
          throw 0;                              /* network/parse failure → retryable */
        }).catch(()=>{ if(cache[key]===wrapped) delete cache[key]; return null; });
        cache[key]=wrapped;
      }
      return cache[key]; }
    /* id may be an ARRAY of codes tried in order — used where the World Bank RETIRED a series (CO₂:
       EN.ATM.CO2E.PC now returns 0 values; the successor is EN.GHG.CO2.PC.CE.AR5). */
    async function fetchWB(code,id){ const ids=Array.isArray(id)?id:[id];
      for(const one of ids){ const v=await _wbOne(code,one); if(v) return v; } return null; }
    /* (#R69) IMF DataMapper returns EVERY country in one response — fetch each indicator ONCE (shared promise),
       then slice the requested countries locally. Country changes and WB⇄IMF flips become instant after the
       first load. */
    function _imfRaw(imfCode){ const key='imfraw|'+imfCode;
      if(cache[key]===undefined){
        let wrapped=null;
        wrapped=(async()=>{
          /* (#R118) RELIABILITY — "WB/IMFの切り替えが効かなくなっている" root cause: the IMF DataMapper call rides
             PUBLIC CORS proxies; when the ladder was down/hung the code silently fell back to World Bank (button
             said IMF, data said WB = a toggle that "does nothing"). Three fixes: ① a 5-day IndexedDB cache of the
             whole-world payload (after ONE success, source flips work offline-fast forever), ② a 12s per-rung
             timeout so a hung proxy can't stall the whole ladder, ③ an extra proxy rung. */
          try{ if(window.IntMapCache&&window.IntMapCache.get){ const c=await window.IntMapCache.get('imfraw_v1_'+imfCode);
            if(c&&c.t&&(Date.now()-c.t)<5*864e5&&c.vals) return c.vals; } }catch(_){}
          const url='https://www.imf.org/external/datamapper/api/v1/'+encodeURIComponent(imfCode);
          const PROX=[x=>x, x=>'https://corsproxy.io/?url='+encodeURIComponent(x), x=>'https://api.allorigins.win/raw?url='+encodeURIComponent(x), x=>'https://api.codetabs.com/v1/proxy?quest='+encodeURIComponent(x)];
          for(const p of PROX){ try{
            const ctrl=('AbortController'in window)?new AbortController():null, to=ctrl?setTimeout(()=>{try{ctrl.abort();}catch(_){}} ,12000):null;
            const r=await fetch(p(url),ctrl?{signal:ctrl.signal}:undefined); if(to) clearTimeout(to);
            if(!r.ok) continue; const j=await r.json();
            const vals=j&&j.values&&j.values[imfCode];
            if(vals){ try{ window.IntMapCache&&window.IntMapCache.set&&window.IntMapCache.set('imfraw_v1_'+imfCode,{t:Date.now(),vals}); }catch(_){} return vals; } }catch(_){} }
          throw 0;   /* whole ladder failed → retryable, not negative-cached */
        })().catch(()=>{ if(cache[key]===wrapped) delete cache[key]; return null; });
        cache[key]=wrapped;
      }
      return cache[key]; }
    async function fetchIMF(imfCode,cs,scale){ const vals=await _imfRaw(imfCode); if(!vals) return null;
      const out={}; const nowY=new Date().getFullYear();
      cs.forEach(c=>{ const o=vals[c]; if(!o) return; const arr=[]; for(const y in o){ const yy=+y, vv=+o[y]; if(isFinite(yy)&&isFinite(vv)&&yy<=nowY) arr.push({y:yy,v:vv*(scale||1)}); } if(arr.length) out[c]=arr.sort((a,b)=>a.y-b.y); });
      return Object.keys(out).length?out:null; }
    /* ===== (#R71) FAST latest values ("Loading data…の時間が長すぎる"): the bar view and the table's
       latest column need ONE number per country — fetched as ONE country/all&mrnev=1 request per indicator
       (all ~220 countries at once, shared-promise cached) instead of a request per (indicator,country).
       Gaps are FILLED from the other source (WB⇄IMF) and finally from the bundled reference values, so major
       countries stop showing "—" just because one source lacks one year ("比較にならない"). ===== */
    function _wbLatestOne(code){ const key='wbl|'+code;
      if(cache[key]===undefined){ let wrapped=null;
        wrapped=(async()=>{ try{
          const c=('AbortController' in window)?new AbortController():null; const tm=c?setTimeout(()=>{ try{ c.abort(); }catch(_){} },20000):null;
          const r=await fetch('https://api.worldbank.org/v2/country/all/indicator/'+encodeURIComponent(code)+'?format=json&mrnev=1&per_page=400',c?{signal:c.signal}:undefined);
          const j=await r.json(); if(tm) clearTimeout(tm);
          if(Array.isArray(j)&&j[1]){ const m={}; j[1].forEach(d=>{ if(d&&d.value!=null&&d.countryiso3code) m[d.countryiso3code]={v:+d.value,y:+d.date||0}; }); if(Object.keys(m).length) return m; }
          if(Array.isArray(j)) return {};
        }catch(_){} throw 0; })().catch(()=>{ if(cache[key]===wrapped) delete cache[key]; return {}; });
        cache[key]=wrapped; }
      return cache[key]; }
    async function wbLatest(id){ const ids=Array.isArray(id)?id:[id]; for(const one of ids){ const m=await _wbLatestOne(one); if(m&&Object.keys(m).length) return m; } return {}; }
    /* (#R94) TIME MACHINE: when the master clock is on a past year, the bar/table/focus show THAT year's real
       figures (World Bank date=<year>, IMF WEO at the year) — honestly, with no present-day gap-fill while
       travelling. `_ttYear()` is the active year (≥1960, where WB annual series begin) or null when live. */
    /* read the year from the kernel (set synchronously on travel), NOT window._imTimeYear which the Countries
       engine only writes after its ~1 s fetch — the compare re-renders sooner, so it must not race that. */
    function _ttYear(){ try{ const T=window.IntMapTime; if(!T||T.isLive()) return null; const y=T.year(), now=new Date().getFullYear(); return (y>=1900&&y<now)?y:null; }catch(_){ const y=window._imTimeYear; return (y&&y>=1900)?y:null; } }
    /* (#R94e) GDP & population come from Maddison (real 2011 int$) while travelling, matching the Countries tab. */
    function _madField(ind){ return (ind&&ind.k==='gdp')?'gdp':((ind&&ind.k==='pop')?'pop':((ind&&ind.k==='gdppc')?'gdppc':null)); }
    function _madOne(M,mf,cd,year){ if(mf==='gdp'){ const g=M.gdpBil(cd,year); return g!=null?g*1e9:null; } if(mf==='pop') return M.popN(cd,year); return M.gdppc(cd,year); }   /* gdppc = real 2011 int$ per capita (unscaled) */
    function _madMap(mf,year){ const M=window.IntMapMaddison; const m={}; if(!M||!M.ready()) return m;
      const need=new Set(codes); codes.forEach(cd=>{ const S=_histEntry&&_histEntry(cd); if(S) S.succ.forEach(c=>need.add(c)); });
      need.forEach(cd=>{ const v=_madOne(M,mf,cd,year); if(v!=null) m[cd]={v:v,y:year,real:true}; });
      return m; }
    function _wbYearOne(code,year){ const key='wby|'+code+'|'+year;
      if(cache[key]===undefined){ let wrapped=null;
        wrapped=(async()=>{ try{
          const c=('AbortController' in window)?new AbortController():null; const tm=c?setTimeout(()=>{ try{ c.abort(); }catch(_){} },20000):null;
          const r=await fetch('https://api.worldbank.org/v2/country/all/indicator/'+encodeURIComponent(code)+'?format=json&per_page=400&date='+year,c?{signal:c.signal}:undefined);
          const j=await r.json(); if(tm) clearTimeout(tm);
          if(Array.isArray(j)&&j[1]){ const m={}; j[1].forEach(d=>{ if(d&&d.value!=null&&d.countryiso3code) m[d.countryiso3code]={v:+d.value,y:+d.date||year}; }); return m; }
          if(Array.isArray(j)) return {};
        }catch(_){} throw 0; })().catch(()=>{ if(cache[key]===wrapped) delete cache[key]; return {}; });
        cache[key]=wrapped; }
      return cache[key]; }
    async function wbYear(id,year){ const ids=Array.isArray(id)?id:[id]; for(const one of ids){ const m=await _wbYearOne(one,year); if(m&&Object.keys(m).length) return m; } return {}; }
    function imfAt(vals,scale,year){ const out={}; for(const cd in vals){ const o=vals[cd]; if(o&&o[year]!=null&&isFinite(+o[year])) out[cd]={v:+o[year]*(scale||1),y:year}; } return out; }
    function imfLatest(vals,scale){ const nowY=new Date().getFullYear(); const out={};
      for(const cd in vals){ const o=vals[cd]; let best=null; for(const y in o){ const yy=+y,vv=+o[y]; if(isFinite(yy)&&isFinite(vv)&&yy<=nowY&&(!best||yy>best.y)) best={y:yy,v:vv*(scale||1)}; } if(best) out[cd]=best; }
      return out; }
    /* (#R94d) FORMER STATES are comparable: their value = the aggregate of the successor ISO3 codes (which are
       in the very same country/all fetch) — totals summed, rates population-weighted, GDP via the sourced
       estimate. So the Soviet Union etc. appear in the bar ranking, the time-series and the table. */
    const _HSUM={gdp:1,pop:1};   /* WB-path totals to SUM; every other WB indicator = population-weighted mean */
    function _histEntry(cd){ try{ const H=window.IntMapHistStates; if(!H) return null; return (H.STATES||[]).find(S=>S.code===cd)||null; }catch(_){ return null; } }
    function _histCodes(){ try{ return codes.filter(cd=>!!_histEntry(cd)); }catch(_){ return []; } }
    function _histMini(cd){ const S=_histEntry(cd); return S?{code:cd,nameEn:S.name.en,nameJp:S.name.jp,flag:S.flag,_hist:true}:null; }
    const _cs=(cd)=>countryStats[cd]||_histMini(cd)||{};   /* resolve name/flag even when a former state isn't currently applied */
    /* (#R110) ONE Maddison-path value for a former state in a given year — used by the bar/table (_histAddLatest) AND
       the time-series (_histAddSeries), so they can never diverge again. Mirrors IntMapHistStates.agg's EMPIRE-ESTIMATE
       fallback: Maddison has NO single entity for the pre-WWI multi-nation empires (Austria-Hungary, Ottoman, Russian
       Empire…) and most of their successors have no pre-1950 data, so a raw successor-SUM collapses — Austria-Hungary
       1915 became just Austria's 6.84M ("明らかにおかしい"), and its GDP likewise. When the sum is missing or
       implausibly low (< 60% of the documented census/GDP estimate) fall back to that estimate, exactly as the
       Countries tab already does. First-class Maddison entities (SUN/YUG/CSK) are used directly and never overridden. */
    function _histMadVal(S, mf, year){ const M=window.IntMapMaddison; if(!M||!M.ready()||!S) return null;
      if(M.has(S.code,year)) return _madOne(M,mf,S.code,year);   /* Soviet Union / Yugoslavia / Czechoslovakia = real single entity */
      if(mf==='pop'||mf==='gdp'){ let sum=0,h=false; S.succ.forEach(c=>{ const cv=_madOne(M,mf,c,year); if(cv!=null){ sum+=cv; h=true; } });
        let val=h?sum:null;
        if(mf==='pop'){ if(S.popEst && (val==null || val < S.popEst*0.6)) val=S.popEst; return val; }
        if(S.gdpEst && year>=(S.gdpEstFrom||0) && (val==null || val < S.gdpEst*1e9*0.6)) val=S.gdpEst*1e9; return val; }
      if(mf==='gdppc'){   /* aggregate per-capita = ΣGDP / Σpop, with the SAME empire estimate so it stays consistent with the pop & GDP shown */
        let g=0,p=0,h=false; S.succ.forEach(c=>{ const cg=M.gdpBil(c,year), cp=M.popN(c,year); if(cg!=null&&cp!=null){ g+=cg*1e9; p+=cp; h=true; } });
        let gg=h?g:null, pp=h?p:null;
        if(S.popEst && (pp==null || pp < S.popEst*0.6)) pp=S.popEst;
        if(S.gdpEst && year>=(S.gdpEstFrom||0) && (gg==null || gg < S.gdpEst*1e9*0.6)) gg=S.gdpEst*1e9;
        return (gg!=null&&pp)?gg/pp:null; }
      return null; }
    async function _histAddLatest(m, ind, year){
      const hcs=_histCodes(); if(!hcs.length) return;
      const mf=_madField(ind), M=window.IntMapMaddison, useMad=(mf&&M&&M.ready());
      const needW=!_HSUM[ind.k]; let popMap=null;
      for(const cd of hcs){ const S=_histEntry(cd); if(!S){ continue; }
        const fy=+String(S.from).slice(0,4), ty=+String(S.to).slice(0,4);
        if(year==null||year<fy||year>ty){ m[cd]=null; continue; }   /* outside its lifespan → no value */
        if(useMad){   /* GDP / population / per-capita → Maddison real, with the empire-estimate fallback (see _histMadVal) */
          const val=_histMadVal(S,mf,year);
          m[cd]=(val!=null)?{v:val,y:year,hist:true,real:true}:null; continue;
        }
        if(needW&&!popMap){ try{ popMap=await wbYear('SP.POP.TOTL',year)||{}; }catch(_){ popMap={}; } }
        let sum=0,num=0,den=0,have=0;
        S.succ.forEach(c=>{ const e=m[c]; if(!e||e.v==null) return; const v=e.v;
          if(_HSUM[ind.k]){ sum+=v; have++; } else { const p=popMap[c]&&popMap[c].v; if(p){ num+=v*p; den+=p; have++; } } });
        m[cd]= have ? {v:(_HSUM[ind.k]?sum:(den?num/den:null)), y:year, hist:true} : null;
      }
    }
    async function latestData(ind){
      const ttY=_ttYear();
      if(ttY&&window.IntMapMaddison){ try{ await window.IntMapMaddison.load(); }catch(_){} }
      if(ind.stat){ const m={}; codes.forEach(cd=>{ const s2=countryStats[cd]; const v=s2?ind.stat(s2):null; if(v!=null&&isFinite(+v)) m[cd]={v:+v,y:(typeof ind.yr==='number')?ind.yr:0}; });
        return {ind,map:m,srcName:ind.src||'IntMap',mixed:false}; }
      if(ttY){   /* travelling → THAT year only, honest (no present-day gap-fill) */
        const mf=_madField(ind), M=window.IntMapMaddison;
        if(mf && M && M.ready() && ttY<=(M.maxYear||2018)){   /* GDP/pop → Maddison (real 2011 int$) up to 2018; 2019+ falls through to the World Bank nominal path below */
          const m2=_madMap(mf,ttY); await _histAddLatest(m2, ind, ttY);
          return {ind,map:m2,srcName:'Maddison Project',mixed:false,ttY:ttY,real:true}; }
        const wantImf2=(ind.imf&&srcSel[ind.k]==='imf');
        let m2={}, src2='World Bank';
        if(wantImf2){ const vals=await _imfRaw(ind.imf); if(vals){ m2=Object.assign({},imfAt(vals,ind.imfScale,ttY)); if(Object.keys(m2).length) src2='IMF WEO'; } }
        if(!Object.keys(m2).length){ m2=Object.assign({},await wbYear(ind.wb,ttY)); src2='World Bank'; }
        await _histAddLatest(m2, ind, ttY);
        return {ind,map:m2,srcName:src2,mixed:false,ttY:ttY,imfFail:(wantImf2&&src2!=='IMF WEO')}; }   /* (#R118) IMF selected but unavailable → say so (bar view too) */
      const wantImf=(ind.imf&&srcSel[ind.k]==='imf');
      let m={}, srcName='World Bank';
      if(wantImf){ const vals=await _imfRaw(ind.imf); if(vals){ m=Object.assign({},imfLatest(vals,ind.imfScale)); srcName='IMF WEO'; } }
      if(!Object.keys(m).length){ m=Object.assign({},await wbLatest(ind.wb)); srcName='World Bank'; }
      const imfFail=(wantImf&&srcName!=='IMF WEO');   /* (#R118) honest bar-mode note instead of a silently "dead" toggle */
      let mixed=false;
      for(const cd of codes){ if(m[cd]||_histEntry(cd)) continue;
        if(ind.imf&&srcName!=='IMF WEO'){ const vals=await _imfRaw(ind.imf); if(vals){ const im=imfLatest(vals,ind.imfScale); if(im[cd]){ m[cd]=Object.assign({src:'IMF'},im[cd]); mixed=true; continue; } } }
        if(ind.imf&&srcName==='IMF WEO'){ const wl=await wbLatest(ind.wb); if(wl[cd]){ m[cd]=Object.assign({src:'WB'},wl[cd]); mixed=true; continue; } }
        const rf=REFV[ind.k]; if(rf){ try{ const v=rf(countryStats[cd]||{}); if(v!=null&&isFinite(+v)){ m[cd]={v:+v,y:0,src:'ref'}; mixed=true; } }catch(_){} } }
      await _histAddLatest(m, ind, _ttYear());   /* also when a former state lingers in the selection after leaving its era → resolves to — */
      return {ind,map:m,srcName,mixed,imfFail}; }
    /* (#R94d) the picker lists whatever's in countryStats — former states are injected there only while the clock is inside their lifespan, so they appear exactly when they can be compared. */
    /* (#R101) exclude non-sovereign geographic features (sov:false) from the compare picker too */
    function cList(){ try{ return Object.keys(countryStats).filter(cd=>{ const s=countryStats[cd]; return s&&s.sov!==false; }).map(cd=>({code:cd,name:cName(_cs(cd))})).sort((a,b)=>a.name.localeCompare(b.name)); }catch(_){ return []; } }
    function ensureView(){ if(host&&document.body.contains(host)) return host;
      if(!ensureView._css){ ensureView._css=1; const st=document.createElement('style');
      st.textContent='#scp-view .scp-chip{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:999px;font-size:12px;font-weight:600;background:var(--input-bg);color:var(--text-main);border:1.5px solid transparent;}'
        +'#scp-view .scp-chip .scp-x{cursor:pointer;color:var(--text-muted);font-weight:700;} #scp-view .scp-chip .scp-x:hover{color:#ff453a;}'
        +'#scp-view .scp-dot{width:9px;height:9px;border-radius:50%;flex:0 0 auto;}'
        +'#scp-view .scp-add{height:34px;padding:0 12px;border-radius:10px;border:1px solid rgba(128,128,128,0.3);background:var(--card-bg);color:var(--text-main);font-size:12.5px;outline:none;min-width:0;flex:1;box-sizing:border-box;}'
        +'#scp-view .scp-pickbtn{flex:0 0 auto;width:38px;height:34px;display:inline-flex;align-items:center;justify-content:center;border-radius:10px;border:1px solid rgba(128,128,128,0.3);background:var(--card-bg);color:var(--text-muted);cursor:pointer;transition:.15s;}'
        +'#scp-view .scp-pickbtn:hover{color:var(--text-main);border-color:var(--primary-color);}'
        +'#scp-view .scp-pickbtn.on{background:var(--primary-color);border-color:var(--primary-color);color:#fff;}'
        +'#scp-view .scp-metrics{display:flex;flex-wrap:wrap;gap:5px;margin:8px 0 2px;}'
        +'#scp-view .scp-m{font-size:11px;padding:4px 9px;border-radius:999px;border:1px solid rgba(128,128,128,0.28);background:transparent;color:var(--text-muted);cursor:pointer;}'
        +'#scp-view .scp-m.on{background:var(--primary-color);border-color:var(--primary-color);color:#fff;font-weight:600;}'
        +'#scp-view .scp-tblwrap{overflow-x:auto;-webkit-overflow-scrolling:touch;}'
        +'#scp-view .scp-tbl{width:100%;border-collapse:collapse;font-size:11.5px;margin:4px 0 6px;}'
        +'#scp-view .scp-tbl td,#scp-view .scp-tbl th{padding:4px 7px;text-align:right;border-bottom:1px solid rgba(128,128,128,0.12);white-space:nowrap;}'
        +'#scp-view .scp-tbl th{color:var(--text-muted);font-weight:600;text-align:right;}'
        +'#scp-view .scp-tbl td:first-child,#scp-view .scp-tbl th:first-child{text-align:left;}'
        +'#scp-view .scp-sec{margin:14px 0 4px;font-weight:700;font-size:13px;color:var(--text-main);display:flex;align-items:center;gap:8px;flex-wrap:wrap;}'
        /* (#R108) thin divider between each indicator block in the bar / time-series results (white in dark, subtle grey in light). */
        +'#scp-view .scp-blk + .scp-blk{border-top:2px solid rgba(128,128,128,0.45);padding-top:7px;margin-top:5px;}'   /* (#R109) thicker */
        +'[data-theme="dark"] #scp-view .scp-blk + .scp-blk{border-top-color:rgba(255,255,255,0.75);}'   /* (#R109) whiter */
        +'#scp-view .scp-src{font-size:10.5px;color:var(--text-muted);font-weight:400;}'
        +'#scp-view .scp-srcsw{display:inline-flex;border:1px solid rgba(128,128,128,0.3);border-radius:8px;overflow:hidden;}'
        +'#scp-view .scp-srcsw button{border:none;background:transparent;color:var(--text-muted);font-size:10px;padding:2.5px 8px;cursor:pointer;font-weight:600;}'
        +'#scp-view .scp-srcsw button.on{background:var(--primary-color);color:#fff;}'
        /* (#R105) Back button: white background, black text, a refined minimal arrow (no plain "←"). */
        +'#scp-view .scp-back{display:inline-flex;align-items:center;gap:6px;border:1px solid rgba(0,0,0,0.12);border-radius:10px;background:#ffffff;color:#111;padding:3px 12px 3px 9px;font-size:12px;font-weight:600;cursor:pointer;margin:0;flex:0 0 auto;}'   /* (#R108) tighter vertical padding (6→3), text size unchanged */
        +'#scp-view .scp-back:hover{background:#f2f2f4;}'
        +'#scp-view .scp-back .scp-backarr{flex:0 0 auto;display:block;}'
        /* (#R105) sticky compact header: title + view modes + Indicators toggle pinned to the top of the compare view. */
        +'#scp-view .scp-stickhead{position:sticky;top:0;z-index:8;background:var(--panel-bg,var(--glass-fill));display:flex;flex-direction:column;gap:6px;margin:0 0 6px;padding:8px 0 6px;}'   /* (#R109) slight painted gap above the Back button (2→8) */
        +'#scp-view .scp-cmptitle{font-weight:700;font-size:13px;text-transform:none;line-height:1.15;}'
        +'#scp-view .scp-cmpsub{font-weight:500;font-size:10.5px;color:var(--text-muted);}'
        /* (#R64) proper country picker ("国を選択するときのUIがくそ"): search box + scrollable flag list with
           check state, click to add/remove — replaces the bare <datalist>. */
        +'#scp-list{display:none;position:absolute;left:0;right:0;top:38px;max-height:240px;overflow-y:auto;background:var(--popup-bg);border:1px solid var(--glass-border,rgba(128,128,128,0.3));border-radius:12px;box-shadow:var(--shadow);z-index:40;padding:4px;}'
        +'#scp-list .scp-cr{display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:8px;cursor:pointer;font-size:12.5px;color:var(--text-main);}'
        +'#scp-list .scp-cr:hover{background:var(--input-bg);}'
        +'#scp-list .scp-cr.sel{background:rgba(10,132,255,0.10);}'
        +'#scp-view .ts-wrap svg{height:100px !important;}'
        /* (#R70) unified compare: mode segment + bar view + Excel-like table */
        +'#scp-view .scp-ctrlrow{display:flex;align-items:center;gap:5px;flex-wrap:wrap;}'   /* (#R106) modes + Indicators on one row */
        +'#scp-view .scp-modes{display:inline-flex;border:1px solid rgba(128,128,128,0.3);border-radius:10px;overflow:hidden;margin:0;align-self:center;}'
        +'#scp-view .scp-modes button{border:none;background:transparent;color:var(--text-muted);font-size:15px;font-weight:600;padding:5px 6px;cursor:pointer;}'   /* (#R110) larger text (14→15) with tighter padding; the @container tiers below keep "Bar chart | Time-series | Table" + Indicators on ONE line at every width ("文字サイズを大きく…二行になるのは厳禁") */
        /* (#R108) white divider lines between Bar chart / Time-series / Table (white in dark, subtle grey in light so visible in both) */
        +'#scp-view .scp-modes button + button{border-left:1px solid rgba(128,128,128,0.35);}'
        +'[data-theme="dark"] #scp-view .scp-modes button + button{border-left-color:rgba(255,255,255,0.6);}'
        +'#scp-view .scp-modes button.on{background:var(--primary-color);color:#fff;}'
        /* (#R122) time-series year-range control */
        +'#scp-view .scp-tsrange{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:0 0 8px;padding:6px 8px;background:var(--input-bg);border:1px solid rgba(128,128,128,0.2);border-radius:9px;font-size:12px;}'
        +'#scp-view .scp-tsrange .scp-tsl{color:var(--text-muted);font-weight:600;}'
        +'#scp-view .scp-tsrange select{background:var(--card-bg);color:var(--text-main);border:1px solid rgba(128,128,128,0.25);border-radius:7px;font-size:12px;padding:4px 6px;cursor:pointer;outline:none;}'
        +'#scp-view .scp-tsrange .scp-tsdash{color:var(--text-muted);}'
        +'#scp-view .scp-tsrange #scp-tsreset{margin-left:auto;background:var(--card-bg);border:1px solid rgba(128,128,128,0.25);color:var(--text-main);border-radius:7px;font-size:11.5px;font-weight:600;padding:4px 10px;cursor:pointer;}'
        +'#scp-view .scp-tsrange #scp-tsreset:hover{border-color:var(--primary-color);color:var(--primary-color);}'
        /* (#R71) bars: FIXED name + value columns so every track is the same length ("長さが統一されていなくて
           気持ち悪い"); absolute-positioned fills allow a true 0 axis (bars grow left/right from the line). */
        +'#scp-view .scp-bars{display:flex;flex-direction:column;gap:5px;margin:4px 0 10px;}'
        +'#scp-view .scp-brow{display:flex;align-items:center;gap:8px;font-size:12px;}'
        +'#scp-view .scp-bnm{flex:0 0 118px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-main);}'
        +'#scp-view .scp-btrack{flex:1;height:14px;border-radius:7px;background:var(--input-bg);overflow:hidden;display:block;position:relative;}'
        +'#scp-view .scp-bfill{position:absolute;top:0;bottom:0;border-radius:4px;transition:width .35s ease,left .35s ease;}'
        +'#scp-view .scp-zline{position:absolute;top:-1px;bottom:-1px;width:1.5px;background:var(--text-muted);opacity:0.65;z-index:1;}'
        +'#scp-view .scp-bval{flex:0 0 112px;font-size:11.5px;white-space:nowrap;text-align:right;font-variant-numeric:tabular-nums;}'
        +'#scp-view .scp-fill{color:var(--primary-color);font-weight:700;cursor:help;}'
        +'#scp-view .scp-secl{font-weight:700;}'
        +'#scp-view .scp-focus{margin-left:auto;border:1px solid rgba(128,128,128,0.28);background:transparent;color:var(--text-muted);border-radius:8px;font-size:10.5px;padding:2.5px 8px;cursor:pointer;}'
        +'#scp-view .scp-focus:hover{color:var(--primary-color);border-color:var(--primary-color);}'
        +'#scp-view #scp-fx .ts-wrap svg{height:240px !important;}'
        /* (#R71) grouped indicator picker ("指標選択画面が煩雑") */
        +'#scp-view .scp-mtog{display:inline-flex;align-items:center;gap:4px;border:1px solid rgba(128,128,128,0.3);background:var(--input-bg);color:var(--text-main);border-radius:10px;font-size:15px;font-weight:600;padding:5px 6px;cursor:pointer;margin:0;align-self:center;white-space:nowrap;transition:background .13s,border-color .13s,color .13s;}'   /* (#R107/#R108/#R110) single line, no wrap; larger text (14→15) */
        /* (#R107) count reserves a constant 2-digit width so the button never changes size / re-flows as indicators are toggled */
        +'#scp-view .scp-mtog .scp-mcount{font-weight:500;color:var(--text-muted);font-variant-numeric:tabular-nums;display:inline-block;min-width:2.9em;text-align:right;}'
        /* (#R107) Indicators button turns primary-blue while its cloud is expanded */
        +'#scp-view .scp-mtog.open{background:var(--primary-color);border-color:var(--primary-color);color:#fff;}'
        +'#scp-view .scp-mtog.open .scp-mcount{color:rgba(255,255,255,0.85);}'
        /* (#R107) "灰色枠から白枠に" — the mode segment + the Indicators toggle get a WHITE frame in dark mode (matching
           the R105 indicator pills); the expanded (blue) Indicators button keeps its primary border. */
        +'[data-theme="dark"] #scp-view .scp-modes,[data-theme="dark"] #scp-view .scp-mtog:not(.open){border-color:rgba(255,255,255,0.85);}'
        +'[data-theme="dark"] #scp-view .scp-m{border-color:rgba(255,255,255,0.85);}'   /* (#R105) dark-mode indicator pill border → white */
        +'#scp-view .scp-mcat{width:100%;font-size:10.5px;color:var(--text-muted);font-weight:700;letter-spacing:.03em;margin:7px 0 1px;}'
        +'#scp-view .scp-ttools{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin:2px 0 8px;}'
        +'#scp-view .scp-ttools button,#scp-view .scp-ttools select{height:28px;border-radius:8px;border:1px solid rgba(128,128,128,0.3);background:var(--input-bg);color:var(--text-main);font-size:11.5px;padding:0 10px;cursor:pointer;outline:none;}'
        +'#scp-view .scp-ttools button:hover{border-color:var(--primary-color);color:var(--primary-color);}'
        +'#scp-view .scp-xl th.scp-h{cursor:pointer;user-select:none;background:var(--input-bg);position:sticky;top:0;}'
        +'#scp-view .scp-xl th.scp-h:hover{color:var(--primary-color);}'
        +'#scp-view .scp-xl th.scp-rowh{text-align:left;cursor:grab;}'
        +'#scp-view .scp-xl td{font-variant-numeric:tabular-nums;}'
        +'#scp-view .scp-yr{color:var(--text-muted);font-size:9.5px;}'
        /* (#R79e) the bar chart was crushing in a narrow Countries WINDOW ("countriesウィンドウの幅によっては
           つぶれてしまう") because the name(118)+value(112) columns are fixed and the old media query keys off the
           VIEWPORT, not the window. Make the bars respond to the CONTAINER width: shrink the columns as it
           narrows, then stack (name on its own line, bar+value below) so the bar always has room. */
        +'#scp-view{container-type:inline-size;}'
        +'@container (max-width:430px){ #scp-view .scp-bnm{flex-basis:94px;} #scp-view .scp-bval{flex-basis:82px;font-size:10.5px;} }'
        +'@container (max-width:340px){ #scp-view .scp-brow{flex-wrap:wrap;gap:2px 8px;} #scp-view .scp-bnm{flex:1 1 100%;} #scp-view .scp-btrack{flex:1 1 62%;min-width:70px;} #scp-view .scp-bval{flex:0 0 auto;text-align:left;} }'
        /* (#R106) NARROW compare view (the ws Countries window is ~270 px): compact the mode segment + Indicators
           toggle so "Bar chart | Time-series | Table" + Indicators still fit on ONE row ("一列に"). The Indicators
           WORD collapses to just its count, the mode buttons tighten — full labels return in a wider view. */
        /* (#R107) NARROW compare view (the ~270 px ws Countries window): the Indicators WORD stays visible ("Indicators
           n/m" required), so tighten the MODE buttons + the toggle instead to keep everything on ONE row. */
        /* (#R111) The mode row + Indicators toggle are AUTO-FIT to the largest one-line font PER LANGUAGE & width by
           _fitModeFont() (inline styles, incl. workspace-mode's narrow ~274px Countries pane). These @container tiers
           are only the pre-JS / no-JS FALLBACK, sized to the WORST case (ES/RU labels are the LONGEST — the R110 tiers
           were sized for DE/EN and actually wrapped ES/RU) so the row never wraps even before the JS runs; JS then
           enlarges the shorter languages (JP fits ~13px in a 274px ws pane vs the old 10.5px). */
        +'@container (max-width:395px){ #scp-view .scp-modes button{font-size:13.5px;} #scp-view .scp-mtog{font-size:13.5px;} }'
        +'@container (max-width:360px){ #scp-view .scp-modes button{font-size:12px;} #scp-view .scp-mtog{font-size:12px;} }'
        +'@container (max-width:335px){ #scp-view .scp-modes button{font-size:11px;} #scp-view .scp-mtog{font-size:11px;} #scp-view .scp-mtog .scp-mcount{min-width:2.5em;} }'
        +'@container (max-width:313px){ #scp-view .scp-modes button{font-size:10.5px;} #scp-view .scp-mtog{font-size:10.5px;} #scp-view .scp-mtog .scp-mcount{min-width:2.4em;} }'
        +'@container (max-width:292px){ #scp-view .scp-modes button{font-size:9.5px;} #scp-view .scp-mtog{font-size:9.5px;} #scp-view .scp-mtog .scp-mcount{min-width:2.2em;} }'
        +'@media(max-width:768px){ #scp-view .ts-wrap svg{height:84px !important;} #scp-view .scp-tbl{font-size:10.5px;} #scp-view .scp-bnm{flex-basis:96px;} }';
      document.head.appendChild(st); }
      /* render INSIDE the country-list area — no popup. (#R79c) ROOT CAUSE of "比較機能死んでんぞ": the
         comparison mounted into #live-news-feed, but the country list moved to #countries-feed at the R78e
         split — so #scp-view rendered into the NEWS feed (hidden in the Stats tab, and in workspace mode it is
         the hidden News window → the comparison was invisible). Mount into #countries-feed (same element
         renderStats + the back button use). In workspace mode there are no tabs, so don't click the Stats tab. */
      if(!document.body.classList.contains('ws-mode')){ try{ const bs=document.getElementById('btn-stats'); if(bs&&!bs.classList.contains('active')) bs.click(); }catch(_){} }
      const feed=document.getElementById('countries-feed')||document.getElementById('live-news-feed'); if(!feed) return null;
      feed.innerHTML='';
      host=document.createElement('div'); host.id='scp-view'; feed.appendChild(host);
      /* (#R111) re-fit the mode-row font whenever the pane resizes (esp. dragging a workspace-mode Countries window) */
      try{ if('ResizeObserver' in window){ new ResizeObserver(()=>_fitModeFontSoon()).observe(host); } }catch(_){}
      /* (#R101) hide the outer "Filter countries…" box while comparing — the compare view has its own add-country
         search, so the top filter is redundant. Restored by the Back button.
         (#R102) in workspace mode a `!important` show-rule (body.ws-mode .ws-countries #countries-search-bar) beat the
         inline display:none, so the box stayed ("変化なし"). Add a `scp-open` body class + a higher-specificity CSS
         override (see ws-style) so it truly hides in BOTH modes. */
      try{ document.body.classList.add('scp-open'); }catch(_){}
      try{ ['countries-search-bar','sidebar-search-bar'].forEach(id=>{ const e=document.getElementById(id); if(e&&e.dataset.scpPrevDisp===undefined){ e.dataset.scpPrevDisp=e.style.display||''; e.style.display='none'; } }); }catch(_){}
      /* (#R105) compact STICKY header: [Back] + title on one row, then the view modes, then the Indicators pulldown —
         all pinned to the top so they stay reachable while the chart/table scrolls. */
      const _backArr='<svg class="scp-backarr" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>';
      host.innerHTML='<div class="scp-stickhead">'
          +'<div style="display:flex;align-items:center;gap:9px;flex-wrap:wrap;">'
            +'<button class="scp-back">'+_backArr+LL('Back to statistics','統計一覧へ戻る','Zurück zur Statistik','Назад к статистике','Volver a estadísticas')+'</button>'
            +'<div class="scp-cmptitle">'+LL('Compare countries','国を比較','Länder vergleichen','Сравнение стран','Comparar países')+' <span class="scp-cmpsub">'+LL('(up to 10)','（最大10か国）','(bis zu 10)','(до 10)','(hasta 10)')+'</span></div>'
          +'</div>'
          /* (#R106) view modes (Bar chart | Time-series | Table) + the Indicators pulldown on ONE row per request
             ("Bar chart/Time-series/Table, Indicatorsは一列に") */
          +'<div class="scp-ctrlrow">'
            +'<div id="scp-modes" class="scp-modes">'
              +'<button data-m="bar">'+LL('Bar chart','棒グラフ','Balken','Столбцы','Barras')+'</button>'
              +'<button data-m="ts">'+LL('Time-series','時系列','Zeitreihen','Динамика','Series temporales')+'</button>'
              +'<button data-m="table">'+LL('Table','表','Tabelle','Таблица','Tabla')+'</button>'
            +'</div>'
            /* (#R71) indicators live behind ONE compact toggle; the cloud itself is grouped by category */
            +'<button class="scp-mtog" id="scp-mtog"></button>'
          +'</div>'
          /* (#R106) the indicator cloud lives INSIDE the sticky header (was floating at the top of the non-sticky
             body — "Indicatorsの選択肢はスティックではないほうの上部に表示されてしまう"). */
          +'<div class="scp-metrics" id="scp-metrics" style="display:none;"></div>'
        +'</div>'
        +'<div id="scp-chips" style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:8px;"></div>'
        +'<div style="position:relative;"><div style="display:flex;gap:6px;align-items:stretch;"><input class="scp-add" id="scp-add" autocomplete="off" style="flex:1;min-width:0;" placeholder="'+LL('Search & add countries…','国を検索して追加…','Länder suchen & hinzufügen…','Найти и добавить страны…','Buscar y añadir países…')+'"><button id="scp-pick" class="scp-pickbtn" type="button" title="'+LL('Pick a country on the map','地図で国をクリックして追加','Land auf der Karte wählen','Выбрать страну на карте','Elegir país en el mapa')+'" aria-label="'+LL('Pick a country on the map','地図で国をクリックして追加','Land auf der Karte wählen','Выбрать страну на карте','Elegir país en el mapa')+'"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="6.5"/><line x1="12" y1="1.5" x2="12" y2="4.5"/><line x1="12" y1="19.5" x2="12" y2="22.5"/><line x1="1.5" y1="12" x2="4.5" y2="12"/><line x1="19.5" y1="12" x2="22.5" y2="12"/></svg></button></div><div id="scp-list"></div></div>'
        +'<div id="scp-timebanner" class="stats-timebanner" style="display:none;"></div>'
        +'<div id="scp-body" style="margin-top:6px;"></div>';
      host.querySelector('.scp-back').onclick=()=>{ try{ _endPick(); }catch(_){} try{ clearMap(); }catch(_){}   /* (#R94h) leaving the comparison clears the map colouring */
        /* (#R101) restore the outer "Filter countries…" box that was hidden while comparing */
        try{ document.body.classList.remove('scp-open'); }catch(_){}
        try{ ['countries-search-bar','sidebar-search-bar'].forEach(id=>{ const e=document.getElementById(id); if(e&&e.dataset.scpPrevDisp!==undefined){ e.style.display=e.dataset.scpPrevDisp; delete e.dataset.scpPrevDisp; } }); }catch(_){}
        try{ const v0=document.getElementById('scp-view'); if(v0) v0.remove(); host=null; if(typeof renderStats==='function') renderStats(typeof searchVal==='function'?searchVal():''); }catch(_){} };
      host.querySelectorAll('#scp-modes button').forEach(b=>{ b.onclick=()=>{ const m=b.getAttribute('data-m'); if(m===mode) return; mode=m; render(); }; });
      try{ if(typeof renderCompareFixed==='function') setTimeout(renderCompareFixed,0); }catch(_){}   /* hide the selection dock while the comparison owns the feed */
      /* (#R64) real picker: type-to-filter list with flags + check state; click toggles; Enter adds the first
         match; closes on outside click. */
      const addI=host.querySelector('#scp-add'), listEl=host.querySelector('#scp-list');
      const openList=()=>{ listEl.style.display='block'; refreshList(); };
      const closeList=()=>{ listEl.style.display='none'; };
      function refreshList(){ const qRaw=addI.value.trim(), q=qRaw.toLowerCase();
        const items=cList().filter(c=>{ if(!q) return true; const s2=countryStats[c.code]||{};
          return c.name.toLowerCase().indexOf(q)>=0||(s2.nameEn||'').toLowerCase().indexOf(q)>=0||(s2.nameJp||'').indexOf(qRaw)>=0; }).slice(0,300);
        listEl.innerHTML=items.map(c=>{ const s2=countryStats[c.code]||{}; const on=codes.indexOf(c.code)>=0;
          return '<div class="scp-cr'+(on?' sel':'')+'" data-c="'+esc(c.code)+'"><span style="width:20px;text-align:center;">'+(s2.flag||'')+'</span><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;">'+esc(c.name)+'</span>'+(on?'<span style="color:var(--primary-color);font-weight:700;">✓</span>':'')+'</div>'; }).join('')
          ||'<div style="padding:8px 10px;color:var(--text-muted);font-size:11.5px;">'+LL('No match','該当なし','Kein Treffer','Нет совпадений','Sin coincidencias')+'</div>';
        listEl.querySelectorAll('.scp-cr').forEach(r=>{ r.onmousedown=(e)=>{ e.preventDefault(); const cd=r.getAttribute('data-c');
          if(codes.indexOf(cd)>=0) codes=codes.filter(x=>x!==cd);
          else { if(codes.length>=10){ try{ imToast(LL('Maximum 10 countries','最大10か国です','Maximal 10 Länder','Максимум 10 стран','Máximo 10 países')); }catch(_){} return; } codes.push(cd); }
          render(); setTimeout(()=>{ try{ const a2=host&&host.querySelector('#scp-add'); if(a2){ a2.focus(); const l2=host.querySelector('#scp-list'); if(l2){ l2.style.display='block'; } } }catch(_){} },0); }; }); }
      addI.addEventListener('input',openList); addI.addEventListener('focus',openList);
      addI.addEventListener('keydown',e=>{ if(e.key==='Escape'){ closeList(); } if(e.key==='Enter'){ e.preventDefault();
        const first=listEl.querySelector('.scp-cr:not(.sel)'); if(first){ const cd=first.getAttribute('data-c'); if(codes.length<10&&codes.indexOf(cd)<0){ codes.push(cd); addI.value=''; render(); } } } });
      document.addEventListener('mousedown',e=>{ try{ if(host&&!host.contains(e.target)) closeList(); else if(host&&!e.target.closest('#scp-list')&&e.target!==addI) closeList(); }catch(_){} });
      host.__refreshList=refreshList;
      /* (#R86) pick-on-map button — wired here so it survives panel rebuilds; reflects the current pick state */
      const pickBtn=host.querySelector('#scp-pick'); if(pickBtn){ pickBtn.classList.toggle('on',_picking); pickBtn.onclick=()=>{ _setPick(!_picking); }; }
      return host; }
    /* (#R86) "地図上でクリックした国を比較に追加" — press ◎, then click countries on the globe. Continuous until pressed
       again / Esc / 10 reached / the panel closes. Resolves the click to a country via turf point-in-polygon (countryGeo). */
    let _picking=false, _pickBound=false, _pickKey=null;
    function _pickResolve(lngLat){
      /* (#R122) while the time machine is travelling, resolve a map click to the ERA polygon / historical entity at
         that point (e.g. click the USSR's territory in 1960 → add the Soviet Union), not the modern country that sits
         there today ("昔の年代でも、地図クリック国選択…現在は強制的に現行国家が選択される"). Falls back to the modern
         country when there is no era entity with comparable data there. */
      try{ const TB=window.IntMapTimeBorders;
        if(TB&&TB.active&&TB.active()&&GE().hasRenderer()&&GE().hasRenderer()){
          /* (#R123) resolve the era entity at the click from the ERA polygon FeatureCollection via point-in-polygon
             FIRST — queryRenderedFeatures on imtb-fill only sees what is CURRENTLY painted, so if the era layer
             hadn't finished rendering the pick fell through to the modern countryGeo below ("国境線と国家は昔なのに、
             クリック判定は現在の国境になっている"). The FC is authoritative regardless of render timing. */
          let nm=null;
          /* (#R129) pick the SMALLEST-area containing feature, not the first — simplified era polygons can OVERLAP at
             borders (a big neighbour listed earlier would win a first-match and mis-resolve a border click, e.g. a
             Polish-Kresy click grabbing the USSR polygon). Matches the popup path's majority/smallest-area logic. */
          try{ const fc=TB.currentFC&&TB.currentFC(); if(fc&&fc.features&&typeof turf!=='undefined'){ const tp=turf.point([lngLat.lng,lngLat.lat]); let bestA=Infinity;
            for(const f of fc.features){ try{ if(f.geometry&&turf.booleanPointInPolygon(tp,f)){ const bb=turf.bbox(f); const a=(bb[2]-bb[0])*(bb[3]-bb[1]); if(a<bestA){ bestA=a; nm=f.properties&&(f.properties.NAME||f.properties.name); } } }catch(_){} } } }catch(_){}
          if(!nm){ try{ const pt=_GE().coords.project([lngLat.lng,lngLat.lat]); const hit=_GE().coords.queryRenderedFeatures(pt,{layers:['imtb-fill']}); nm=hit&&hit.length&&hit[0].properties&&(hit[0].properties.NAME||hit[0].properties.name); }catch(_){} }
          /* (#R125) COASTAL near-miss rescue: simplified era coastlines can exclude a shoreline city (Istanbul sits
             outside the 1914 Ottoman polygon), so the PIP above finds nothing and the pick used to fall through to
             the MODERN borders ("クリック判定は現在の国境…まだ不完全"). Snap to the era feature whose ring passes
             closest to the click (vertex distance, ≤0.7°) — never a cross-country jump. */
          if(!nm){ try{ const fc2=TB.currentFC&&TB.currentFC(); if(fc2&&fc2.features){ let bd=0.7,bn=null;
            const scan=(cs,f)=>{ if(typeof cs[0]==='number'){ const dx=(cs[0]-lngLat.lng)*Math.cos(lngLat.lat*Math.PI/180), dy=cs[1]-lngLat.lat; const d=Math.hypot(dx,dy); if(d<bd){ bd=d; bn=f.properties&&(f.properties.NAME||f.properties.name); } } else cs.forEach(c2=>scan(c2,f)); };
            for(const f of fc2.features){ try{ if(!f.geometry) continue; const bb=turf.bbox(f); if(lngLat.lng<bb[0]-0.8||lngLat.lng>bb[2]+0.8||lngLat.lat<bb[1]-0.8||lngLat.lat>bb[3]+0.8) continue; scan(f.geometry.coordinates,f); }catch(_){} }
            if(bn) nm=bn; } }catch(_){} }
          if(nm&&TB.resolveHist){ const R=TB.resolveHist(nm,lngLat);
            if(R&&R.code&&countryStats[R.code]) return {code:R.code};
            /* the click landed on a REAL era entity that has no comparable time-series data — do NOT silently snap
               to the modern country that sits there today. Report it honestly instead. */
            if(R&&R.name) return {code:'', eraNoData:true, eraName:R.name}; }
          /* (#R132) TRAVELLING but the era polygon couldn't be resolved (FC loading / coastline gap): report honestly.
             NEVER fall through to the modern countryGeo below — that IS the reported "クリック判定が現在の国境になっている". */
          const _fcReady=(function(){ try{ const fc=TB.currentFC&&TB.currentFC(); return !!(fc&&fc.features&&fc.features.length); }catch(_){ return false; } })();
          return _fcReady?{code:''}:{code:'', eraLoading:true};
        } }catch(_){}
      try{ const cg=window.countryGeo; if(cg&&cg.features&&typeof turf!=='undefined'){ const pt=turf.point([lngLat.lng,lngLat.lat]); for(const f of cg.features){ try{ if(turf.booleanPointInPolygon(pt,f)) return {code:resolveCountryId(f)}; }catch(_){} } } }catch(_){} return {code:''}; }
    function _pickClick(e){ if(!_picking) return;
      if(!host||!document.body.contains(host)){ _setPick(false); return; }   /* panel gone → stop picking */
      const res=_pickResolve(e.lngLat)||{};
      if(res.eraNoData){ try{ imToast(LL('No comparable data for '+res.eraName+' in this era','「'+res.eraName+'」はこの年代の比較データがありません','Keine Vergleichsdaten für '+res.eraName+' in dieser Epoche','Нет данных для «'+res.eraName+'» в эту эпоху','Sin datos comparables para '+res.eraName+' en esta época')); }catch(_){} return; }
      if(res.eraLoading){ try{ imToast(LL('Era borders are still loading here — click again in a moment','この年代の国境を読み込み中です。少し後にもう一度クリックしてください','Epochengrenzen laden noch — gleich erneut klicken','Границы эпохи ещё загружаются — кликните ещё раз','Los límites de la época aún se cargan — haz clic de nuevo')); }catch(_){} return; }
      const cd=res.code;
      if(!cd){ try{ imToast(LL('Click on a country (land)','国（陸地）をクリックしてください','Auf ein Land klicken','Кликните по суше (страна)','Haz clic en un país')); }catch(_){} return; }
      const nm=cName(_cs(cd))||cd;
      /* (#R124) re-clicking a country already in the set DESELECTS it — a true toggle ("再クリックで選択解除").
         The 10-country cap only blocks ADDING, so a deselect always works even when the set is full. */
      const idx=codes.indexOf(cd);
      if(idx>=0){ codes.splice(idx,1); try{ render(); }catch(_){} try{ imToast('− '+nm); }catch(_){} return; }
      if(codes.length>=10){ try{ imToast(LL('Maximum 10 countries','最大10か国です','Maximal 10 Länder','Максимум 10 стран','Máximo 10 países')); }catch(_){} return; }
      codes.push(cd); try{ render(); }catch(_){} try{ imToast('✓ '+nm); }catch(_){} }
    function _setPick(on){ _picking=!!on; window.__scpPick=_picking;
      const b=host&&host.querySelector('#scp-pick'); if(b) b.classList.toggle('on',_picking);
      try{ _GE().render.setCursor(_picking?'crosshair':''); }catch(_){}
      if(_picking&&!_pickBound){ try{ _EV().on('click',_pickClick); _pickBound=true; }catch(_){} }
      if(_picking&&!_pickKey){ _pickKey=(ev)=>{ if(ev.key==='Escape') _setPick(false); }; try{ document.addEventListener('keydown',_pickKey); }catch(_){} }
      else if(!_picking&&_pickKey){ try{ document.removeEventListener('keydown',_pickKey); }catch(_){} _pickKey=null; }
      if(_picking){ try{ imToast(LL('Click a country on the map to add it','地図で国をクリックすると比較に追加されます','Land auf der Karte anklicken zum Hinzufügen','Кликните страну на карте, чтобы добавить','Haz clic en un país del mapa para añadirlo')); }catch(_){} } }
    function _endPick(){ try{ _setPick(false); }catch(_){} }
    function chipRow(){ const w=host&&host.querySelector('#scp-chips'); if(!w) return; w.innerHTML='';
      codes.forEach((cd,i)=>{ const s2=_cs(cd); const el=document.createElement('span'); el.className='scp-chip'; el.style.borderColor=PAL[i];
        el.innerHTML='<span class="scp-dot" style="background:'+PAL[i]+';"></span>'+(s2.flag?s2.flag+' ':'')+esc(cName(s2)||cd)+'<span class="scp-x" title="remove">✕</span>';
        el.querySelector('.scp-x').onclick=()=>{ codes=codes.filter(x=>x!==cd); render(); }; w.appendChild(el); });
      try{ paintOnMap(); }catch(_){} }   /* (#R83) keep the map fill in sync with the current selection */
    /* (#R71) grouped picker behind a single toggle ("指標選択画面が煩雑になっている。ごちゃごちゃ") */
    let mOpen=false;
    function metricRow(){ const w=host&&host.querySelector('#scp-metrics'); if(!w) return; w.innerHTML='';
      const tog=host.querySelector('#scp-mtog');
      /* (#R107) always "Indicators n/m" (word kept, never a bare number), NO ⌃/⌄ chevron, constant width (the count
         reserves 2-digit space so it never re-flows), single line. */
      const _mtogHTML=()=>'<span class="scp-mtoglbl">'+LL('Indicators','指標を選択','Kennzahlen','Показатели','Indicadores')+'</span> <span class="scp-mcount">'+sel.size+'/'+IND.length+'</span>';
      if(tog){ tog.innerHTML=_mtogHTML(); tog.classList.toggle('open',mOpen);   /* (#R107) blue while expanded */
        tog.onclick=()=>{ mOpen=!mOpen; w.style.display=mOpen?'flex':'none'; tog.innerHTML=_mtogHTML(); tog.classList.toggle('open',mOpen); };
        w.style.display=mOpen?'flex':'none'; }
      CATORD.forEach(cat=>{ const inds=IND.filter(i2=>(INDCAT[i2.k]||'base')===cat); if(!inds.length) return;
        const h=document.createElement('div'); h.className='scp-mcat'; const cl=CATL[cat]; h.textContent=LL(cl[0],cl[1],cl[2],cl[3],cl[4]); w.appendChild(h);
        inds.forEach(ind=>{ const b=document.createElement('button'); b.className='scp-m'+(sel.has(ind.k)?' on':''); b.textContent=LL(ind.l[0],ind.l[1],ind.l[2],ind.l[3],ind.l[4]);
          b.onclick=()=>{ if(!indOrder) indOrder=IND.filter(i2=>sel.has(i2.k)).map(i2=>i2.k);
            if(sel.has(ind.k)){ sel.delete(ind.k); indOrder=indOrder.filter(k2=>k2!==ind.k); }
            else { sel.add(ind.k); indOrder.push(ind.k); }
            render(); }; w.appendChild(b); }); }); }
    /* (#R70) selected indicators in the USER'S order (table columns are drag-reorderable) */
    function orderedInds(){ const ks=(indOrder&&indOrder.length)?indOrder.filter(k2=>sel.has(k2)):IND.filter(i2=>sel.has(i2.k)).map(i2=>i2.k);
      return ks.map(k2=>IND.find(i2=>i2.k===k2)).filter(Boolean); }
    /* multi-country chart with a shared crosshair (values for EVERY country at the hovered year) */
    const CW=760, CH=120;
    /* (#R71) hh = pixel height override (the focus view uses a LARGE chart); a dashed 0-axis gridline is
       drawn whenever the value range crosses zero ("0の位置に補助線があった方が見やすい"). */
    function mChart(ind,serMap,hh){ const _lo=(tsFrom!=null?tsFrom:-Infinity), _hi=(tsTo!=null?tsTo:Infinity);
      const entries=codes.map((cd,i)=>({cd,i,s:(serMap[cd]||[]).filter(p=>p.y>=_lo&&p.y<=_hi)})).filter(e=>e.s&&e.s.length>1);   /* (#R122) clip to the chosen year window */
      if(!entries.length) return '<div style="color:var(--text-muted);font-size:11px;padding:2px 0 8px;">'+LL('No time-series available','時系列データなし','Keine Zeitreihe','Нет динамики','Sin series')+(tsFrom!=null||tsTo!=null?(' ('+(tsFrom!=null?tsFrom:'…')+'–'+(tsTo!=null?tsTo:'…')+')'):'')+'</div>';
      let y0=Infinity,y1=-Infinity,v0=Infinity,v1=-Infinity;
      entries.forEach(e=>e.s.forEach(p=>{ if(p.y<y0)y0=p.y; if(p.y>y1)y1=p.y; if(p.v<v0)v0=p.v; if(p.v>v1)v1=p.v; }));
      /* (#R108) SIGNED indicators (any negative value present) get a 0 guide line in the TIME-SERIES too, matching the
         bar chart's 0-axis ("Time-seriesには0の場所に補助線を…プラスマイナス系指標のように") — force 0 into the value
         range so the baseline is always visible. */
      /* (#R109) SIGNED-capable indicators (growth / inflation / current account / FDI — ind.signed) ALWAYS include 0.
         (#R111) and now, like the single-country 時系列グラフ, EVERY indicator gets the 0 baseline ("数値が0の場所に
         補助線を引いて") — all-positive data extends down to 0 unless it is a near-constant high band (min within 10%
         of max), where a 0 baseline would crush the traces. */
      const _tsNeg=ind.signed||entries.some(e=>e.s.some(p=>p.v<0))||(v0>=0&&v1>0&&v0<v1*0.9);
      if(_tsNeg){ v0=Math.min(v0,0); v1=Math.max(v1,0); }
      const padL=8,padR=8,padT=10,padB=16; const X=y=>padL+((y-y0)/((y1-y0)||1))*(CW-padL-padR), Y=v=>padT+(1-(v-v0)/((v1-v0)||1))*(CH-padT-padB);
      let paths=''; const meta=[];
      if(v0<=0&&v1>=0&&(v1-v0)>0){ const zy=Y(0).toFixed(1); paths+='<line x1="'+padL+'" x2="'+(CW-padR)+'" y1="'+zy+'" y2="'+zy+'" stroke="var(--text-muted)" stroke-width="1" stroke-dasharray="4 4" opacity="0.55" vector-effect="non-scaling-stroke"/><text x="'+(padL+2)+'" y="'+(zy-3)+'" font-size="9" fill="var(--text-muted)">0</text>'; }
      entries.forEach(e=>{ let d=''; const pts=[]; e.s.forEach((p,j)=>{ const x=X(p.y),y=Y(p.v); d+=(j?'L':'M')+x.toFixed(1)+' '+y.toFixed(1)+' '; pts.push([p.y,+x.toFixed(1),+y.toFixed(1),ind.fmt(p.v)]); });
        paths+='<path d="'+d+'" fill="none" stroke="'+PAL[e.i]+'" stroke-width="2" vector-effect="non-scaling-stroke"/>'; meta.push({i:e.i,cd:e.cd,pts}); });
      const metaAttr=esc(JSON.stringify(meta));
      const hpx=hh||110;
      /* (#R84) year labels moved OUT of the SVG — with preserveAspectRatio="none" the SVG stretches to the
         container width and squashed the <text> ("年号の数字が潰れている"). As crisp HTML they never distort. */
      return '<div class="ts-wrap scp-chart" style="margin:0 0 10px;position:relative;" data-m=\''+metaAttr.replace(/'/g,'&#39;')+'\'>'
        +'<svg class="ts-svg" width="100%" viewBox="0 0 '+CW+' '+CH+'" preserveAspectRatio="none" style="display:block;height:'+hpx+'px;background:var(--input-bg);border-radius:10px;cursor:crosshair;touch-action:none;">'
        +paths
        +'<line class="ts-cursor" y1="0" y2="'+CH+'" stroke="var(--text-muted)" stroke-width="1" stroke-dasharray="3 3" vector-effect="non-scaling-stroke" style="display:none;"/>'
        +'</svg>'
        +'<div style="display:flex;justify-content:space-between;font-size:9.5px;color:var(--text-muted);padding:1px 8px 0;font-variant-numeric:tabular-nums;"><span>'+y0+'</span><span>'+y1+'</span></div>'
        +'<div class="ts-tip" style="display:none;position:absolute;pointer-events:none;background:var(--popup-bg);border:1px solid var(--glass-border,rgba(128,128,128,0.25));border-radius:8px;padding:5px 9px;font-size:11px;color:var(--text-main);box-shadow:var(--shadow);white-space:nowrap;z-index:5;transform:translate(-50%,-104%);line-height:1.5;"></div>'
      +'</div>'; }
    function wireM(root){ root.querySelectorAll('.scp-chart').forEach(wrap=>{
      const svg=wrap.querySelector('.ts-svg'), cur=wrap.querySelector('.ts-cursor'), tip=wrap.querySelector('.ts-tip');
      let meta=[]; try{ meta=JSON.parse(wrap.getAttribute('data-m')||'[]'); }catch(_){}
      if(!svg||!cur||!tip||!meta.length) return;
      const move=(e)=>{ const r=svg.getBoundingClientRect(); if(!r.width) return; const cx=(e.clientX!=null)?e.clientX:(e.touches&&e.touches[0]?e.touches[0].clientX:null); if(cx==null) return;
        const vx=(cx-r.left)/r.width*CW; let year=null,bd=Infinity,px=0;
        meta.forEach(m=>m.pts.forEach(p=>{ const d=Math.abs(p[1]-vx); if(d<bd){ bd=d; year=p[0]; px=p[1]; } }));
        if(year==null) return; cur.setAttribute('x1',px); cur.setAttribute('x2',px); cur.style.display='';
        let html='<b>'+year+'</b>';
        meta.forEach(m=>{ const p=m.pts.find(q=>q[0]===year); if(p){ const s2=countryStats[m.cd]||{}; html+='<br><span style="color:'+PAL[m.i]+';">●</span> '+esc(cName(s2)||m.cd)+': <b>'+esc(p[3])+'</b>'; } });
        tip.innerHTML=html; tip.style.display='block'; const wr=wrap.getBoundingClientRect();
        /* (#R72) keep the tooltip fully INSIDE the panel ("端の方になると端からは隠れて見えなくなってしまう"):
           clamp horizontally to the chart width (it renders translateX(-50%)) and flip it BELOW the crosshair
           when the chart sits so close to the top that the above-anchor tip would be clipped. */
        let lx=(px/CW)*r.width+(r.left-wr.left);
        const tw=tip.offsetWidth||120, th=tip.offsetHeight||40;
        lx=Math.max(tw/2+2, Math.min((wr.width||r.width)-tw/2-2, lx));
        tip.style.left=lx+'px';
        if(wr.top-th<52){ tip.style.top=(r.top-wr.top+r.height-6)+'px'; tip.style.transform='translate(-50%,0)'; }
        else { tip.style.top=(r.top-wr.top+14)+'px'; tip.style.transform='translate(-50%,-104%)'; } };
      const leave=()=>{ cur.style.display='none'; tip.style.display='none'; };
      svg.addEventListener('pointermove',move); svg.addEventListener('pointerdown',move); svg.addEventListener('pointerleave',leave); }); }
    /* (#R94d) build a former state's TIME-SERIES from the successor ISO3 series, over its lifespan only */
    async function _histAddSeries(serMap, ind){
      const hcs=_histCodes(); if(!hcs.length) return;
      const mf=_madField(ind), M=window.IntMapMaddison, useMad=(mf&&M&&M.ready());
      const needW=!_HSUM[ind.k];
      for(const cd of hcs){ const S=_histEntry(cd); if(!S) continue;
        if(useMad){   /* GDP / pop / per-capita time-series from Maddison, over the state's lifespan (empire-estimate fallback via _histMadVal — keeps the series consistent with the bar/table, fixing A-H's 6.84M) */
          const fy2=Math.max(M.minYear,+String(S.from).slice(0,4)), ty2=Math.min(M.maxYear,+String(S.to).slice(0,4)); const out2=[];
          for(let y=fy2;y<=ty2;y++){ const val=_histMadVal(S,mf,y); if(val!=null) out2.push({y,v:val}); }
          if(out2.length) serMap[cd]=out2; continue; }
        const fy=Math.max(1960,+String(S.from).slice(0,4)), ty=Math.min(new Date().getFullYear(),+String(S.to).slice(0,4));
        const rs=await Promise.all(S.succ.map(c=>fetchWB(c,ind.wb))); const byC={}; S.succ.forEach((c,i)=>{ if(rs[i]) byC[c]=rs[i]; });
        let popByC=null;
        if(needW){ const rp=await Promise.all(S.succ.map(c=>fetchWB(c,'SP.POP.TOTL'))); popByC={}; S.succ.forEach((c,i)=>{ if(rp[i]) popByC[c]=rp[i]; }); }
        const out=[];
        for(let y=fy;y<=ty;y++){
          if(ind.k==='gdp'&&S.gdpEst&&y>=(S.gdpEstFrom||0)){ out.push({y,v:S.gdpEst*1e9}); continue; }
          let sum=0,num=0,den=0,have=0;
          S.succ.forEach(c=>{ const ser=byC[c]; if(!ser) return; const pt=ser.find(p=>p.y===y); if(!pt||pt.v==null) return;
            if(_HSUM[ind.k]){ sum+=pt.v; have++; } else { const ps=popByC&&popByC[c]; const pp=ps&&ps.find(p=>p.y===y); if(pp&&pp.v){ num+=pt.v*pp.v; den+=pp.v; have++; } } });
          if(have) out.push({y,v:_HSUM[ind.k]?sum:(den?num/den:null)});
        }
        if(out.length) serMap[cd]=out;
      }
    }
    async function blockData(ind){
      /* (#R70) bundled reference indicators — instant, no fetch, single latest point */
      if(ind.stat){ const y=(typeof ind.yr==='number')?ind.yr:new Date().getFullYear(); const sm={};   /* y=0 → year unknown/not meaningful, display suppressed */
        codes.forEach(cd=>{ const s2=countryStats[cd]; const v=s2?ind.stat(s2):null; if(v!=null&&isFinite(+v)) sm[cd]=[{y,v:+v}]; });
        return {ind,serMap:sm,srcName:ind.src||'IntMap',imfFail:false,statOnly:true}; }
      /* (#R94e) GDP/pop time-series → Maddison (real 2011 int$) while travelling, matching the bar view & Countries tab */
      const _mf=_madField(ind);
      if(_ttYear()&&_mf&&window.IntMapMaddison){ try{ await window.IntMapMaddison.load(); }catch(_){} }
      if(_ttYear() && _mf && window.IntMapMaddison && window.IntMapMaddison.ready() && _ttYear()<=(window.IntMapMaddison.maxYear||2018)){
        const M=window.IntMapMaddison, serMapM={};
        codes.forEach(cd=>{ const arr=[]; for(let y=M.minYear;y<=M.maxYear;y++){ const v=_madOne(M,_mf,cd,y); if(v!=null) arr.push({y,v:v}); } if(arr.length) serMapM[cd]=arr; });
        await _histAddSeries(serMapM, ind);
        return {ind,serMap:serMapM,srcName:'Maddison Project',imfFail:false,real:true}; }
      /* (#R63) source is PER-INDICATOR; IMF only where a real IMF series exists for it */
      const wantImf=(ind.imf&&srcSel[ind.k]==='imf');
      let serMap={}, srcName='World Bank', imfFail=false;
      if(wantImf){ const im=await fetchIMF(ind.imf,codes,ind.imfScale); if(im){ serMap=im; srcName='IMF WEO'; } else imfFail=true; }
      if(!Object.keys(serMap).length){ const rs=await Promise.all(codes.map(cd=>fetchWB(cd,ind.wb))); codes.forEach((cd,i)=>{ if(rs[i]) serMap[cd]=rs[i]; }); srcName='World Bank'; }
      await _histAddSeries(serMap, ind);
      return {ind,serMap,srcName,imfFail}; }
    /* shared block header: label · WB⇄IMF switch · source · 詳細 (focus) button */
    function secHtml(ind,srcName,extra){ const lbl=LL(ind.l[0],ind.l[1],ind.l[2],ind.l[3],ind.l[4]);
      /* (#R109) the WB/IMF toggle only shows for years IMF WEO actually covers (~1980+; earlier years are World-Bank /
         Maddison only) — "利用可能年度のみ表示". Deep-past travel hides it and shows the real source. */
      const _ty=_ttYear();
      const sw=(ind.imf && (_ty==null || (_ty>=1980 && _ty<=2030)))
        ?('<span class="scp-srcsw" data-k="'+ind.k+'"><button data-s="wb"'+(srcSel[ind.k]!=='imf'?' class="on"':'')+'>WB</button><button data-s="imf"'+(srcSel[ind.k]==='imf'?' class="on"':'')+'>IMF</button></span>'
          +'<span class="scp-src">· '+esc(srcName)+'</span>')
        :('<span class="scp-src">· '+esc(ind.stat?(ind.src||'IntMap'):srcName||'World Bank')+'</span>');
      return '<div class="scp-sec"><span class="scp-secl">'+esc(lbl)+'</span> '+sw+(extra||'')
        +'<button class="scp-focus" data-k="'+ind.k+'" title="'+LL('Details','詳細','Details','Подробно','Detalles')+'">'+LL('Details','詳細','Details','Подробно','Detalles')+' ›</button></div>'; }
    const fmtSigned=(ind,v)=>{ if(!SIGNED[ind.k]) return '<b>'+esc(ind.fmt(v))+'</b>';
      const col=v>0?'#30d158':(v<0?'#ff453a':'var(--text-main)');
      return '<b style="color:'+col+';">'+(v>0?'+':'')+esc(ind.fmt(v))+'</b>'; };
    /* (#R71) bars — one shared track geometry (fixed name & value columns → identical bar lengths), a REAL
       zero axis for sign-carrying indicators (bars grow left/right from the 0 line), ± colouring, per-value
       year, and a ° marker + note when a gap was filled from the other source / bundled reference. */
    function barsHtml(b){ const entries=codes.map((cd,i)=>({cd,i,e:b.map[cd]||null}));
      const vals=entries.filter(x=>x.e).map(x=>x.e.v);
      if(!vals.length) return '<div style="color:var(--text-muted);font-size:11px;padding:2px 0 8px;">'+LL('No data','データなし','Keine Daten','Нет данных','Sin datos')+'</div>';
      const hasNeg=vals.some(v=>v<0);
      const min0=Math.min(0,Math.min.apply(null,vals)), max0=Math.max(0,Math.max.apply(null,vals));
      const range=(max0-min0)||1, zero=(-min0)/range*100;
      let html='<div class="scp-bars">'+entries.map(x=>{ const s2=_cs(x.cd);
        /* (#R94g) the flag may be an <img> (former states) — insert it RAW, escape only the NAME (an emoji is a
           safe char, but esc() turned the <img> into visible tag text). The title attr gets the plain name. */
        const nmTxt=cName(s2)||x.cd, nm=(s2.flag?s2.flag+' ':'')+esc(nmTxt), nmT=esc(nmTxt);
        if(!x.e) return '<div class="scp-brow"><span class="scp-bnm" title="'+nmT+'">'+nm+'</span><span class="scp-btrack"'+(hasNeg?' data-z="1"':'')+'>'+(hasNeg?('<span class="scp-zline" style="left:'+zero.toFixed(2)+'%;"></span>'):'')+'</span><span class="scp-bval" style="color:var(--text-muted);">—</span></div>';
        const v=x.e.v, w=Math.max(0.8,Math.abs(v)/range*100), left=v<0?(zero-w):zero;
        const bar=hasNeg
          ?('<span class="scp-zline" style="left:'+zero.toFixed(2)+'%;"></span><span class="scp-bfill" style="left:'+Math.max(0,left).toFixed(2)+'%;width:'+w.toFixed(2)+'%;background:'+(v<0?'#ff453a':PAL[x.i])+';"></span>')
          :('<span class="scp-bfill" style="left:0;width:'+Math.max(1.2,Math.abs(v)/(max0||1)*100).toFixed(2)+'%;background:'+PAL[x.i]+';"></span>');
        const yT=x.e.y?('<span class="scp-yr">('+x.e.y+')</span>'):'';
        const srcM=x.e.src?('<span class="scp-fill" title="'+(x.e.src==='ref'?LL('from bundled reference data','内蔵参照データで補完','aus Referenzdaten','из справочных данных','de datos de referencia'):LL('filled from ','補完: ','ergänzt aus ','дополнено из ','completado de ')+x.e.src)+'">°</span>'):'';
        return '<div class="scp-brow"><span class="scp-bnm" title="'+nmT+'">'+nm+'</span><span class="scp-btrack">'+bar+'</span><span class="scp-bval">'+fmtSigned(b.ind,v)+srcM+' '+yT+'</span></div>';
      }).join('')+'</div>';
      if(b.mixed) html+='<div class="scp-src" style="margin:-4px 0 8px;">° '+LL('gap filled from the other source / bundled reference','欠損値は他ソース・内蔵参照データで補完','Lücke aus anderer Quelle/Referenz ergänzt','пробел дополнен из другого источника','hueco completado de otra fuente/referencia')+'</div>';
      return html; }
    function barBlockHtml(b){ return secHtml(b.ind,b.srcName,(b.imfFail?('<span class="scp-src">('+LL('IMF unavailable — World Bank used','IMF取得不可のため世界銀行','IWF nicht verfügbar — Weltbank','МВФ недоступен — Всемирный банк','FMI no disponible — Banco Mundial')+')</span>'):''))+barsHtml(b); }   /* (#R118) bar view is honest about an IMF fallback too */
    function blockHtml(b){
      let html=secHtml(b.ind,b.srcName,(b.imfFail?('<span class="scp-src">('+LL('IMF unavailable — World Bank used','IMF取得不可のため世界銀行','IWF nicht verfügbar — Weltbank','МВФ недоступен — Всемирный банк','FMI no disponible — Banco Mundial')+')</span>'):''));
      html+='<div class="scp-tblwrap"><table class="scp-tbl"><tr><th></th>'+codes.map((cd,i)=>{ const s2=_cs(cd); return '<th><span style="color:'+PAL[i]+';">●</span> '+esc(cName(s2)||cd)+'</th>'; }).join('')+'</tr>';
      html+='<tr><td>'+LL('Latest','最新値','Aktuell','Последнее','Último')+'</td>'+codes.map(cd=>{ const s2=b.serMap[cd]; if(!s2||!s2.length) return '<td style="color:var(--text-muted);">—</td>'; const last=s2[s2.length-1]; return '<td>'+fmtSigned(b.ind,last.v)+(last.y?' <span style="color:var(--text-muted);">('+last.y+')</span>':'')+'</td>'; }).join('')+'</tr></table></div>';
      html+=mChart(b.ind,b.serMap); return html; }
    /* (#R64) PER-INDICATOR rendering: a source switch re-renders ONLY its own block, from cache when available —
       no full "Loading data…" wipe, no scroll jump ("ソースを切り替えたらいちいち再度すべて読み込み").
       (#R69) each block additionally remembers WHAT it rendered (countries+source signature): re-renders with an
       unchanged signature are skipped entirely, so toggling a metric or switching one block's source no longer
       touches any other block. */
    /* (#R123) time-series year pickers list ONLY years that actually have data. `_tsAvailYears` accumulates as the
       per-indicator series load; the option lists rebuild in place so a range change never re-fetches. */
    function _tsYearList(){ return [..._tsAvailYears].filter(y=>isFinite(y)).sort((a,b)=>b-a); }   /* newest first */
    function _yoptsAvail(selV){ const ys=_tsYearList();
      if(!ys.length){ /* before any series has loaded: fall back to a full 1900→now list so the control isn't empty */
        let o=''; const nowY=new Date().getFullYear(); for(let y=nowY;y>=1900;y--) o+='<option value="'+y+'"'+(String(selV)===String(y)?' selected':'')+'>'+y+'</option>'; return o; }
      return ys.map(y=>'<option value="'+y+'"'+(String(selV)===String(y)?' selected':'')+'>'+y+'</option>').join(''); }
    function _tsRangeHtml(){ return '<span class="scp-tsl">'+LL('Years','期間','Zeitraum','Годы','Años')+'</span>'
        +'<select id="scp-tsfrom"><option value="">'+LL('start','開始','Start','начало','inicio')+'</option>'+_yoptsAvail(tsFrom!=null?tsFrom:'')+'</select>'
        +'<span class="scp-tsdash">–</span>'
        +'<select id="scp-tsto"><option value="">'+LL('end','終了','Ende','конец','fin')+'</option>'+_yoptsAvail(tsTo!=null?tsTo:'')+'</select>'
        +((tsFrom!=null||tsTo!=null)?'<button id="scp-tsreset" type="button">'+LL('Reset','リセット','Zurücksetzen','Сброс','Reiniciar')+'</button>':''); }
    function _wireTsRange(bar){ if(!bar) return;
      const f=bar.querySelector('#scp-tsfrom'); if(f) f.onchange=e=>{ tsFrom=e.target.value?+e.target.value:null; if(tsFrom!=null&&tsTo!=null&&tsFrom>tsTo) tsTo=null; render(); };
      const t2=bar.querySelector('#scp-tsto'); if(t2) t2.onchange=e=>{ tsTo=e.target.value?+e.target.value:null; if(tsFrom!=null&&tsTo!=null&&tsTo<tsFrom) tsFrom=null; render(); };
      const rb=bar.querySelector('#scp-tsreset'); if(rb) rb.onclick=()=>{ tsFrom=null; tsTo=null; render(); }; }
    function _refreshTsYearOpts(){ try{ const bar=host&&host.querySelector('#scp-tsrange'); if(!bar) return;
      const f=bar.querySelector('#scp-tsfrom'), t2=bar.querySelector('#scp-tsto');   /* re-fill options in place — keeps the selects + their onchange handlers */
      if(f) f.innerHTML='<option value="">'+LL('start','開始','Start','начало','inicio')+'</option>'+_yoptsAvail(tsFrom!=null?tsFrom:'');
      if(t2) t2.innerHTML='<option value="">'+LL('end','終了','Ende','конец','fin')+'</option>'+_yoptsAvail(tsTo!=null?tsTo:''); }catch(_){} }
    async function renderInd(k){ if(!host) return; const el=host.querySelector('.scp-blk[data-k="'+k+'"]'); const ind=IND.find(i2=>i2.k===k); if(!el||!ind) return;
      const sig=codes.join(',')+'|'+(srcSel[k]||'wb')+'|'+mode+'|'+(_ttYear()||'now')+'|'+(tsFrom==null?'':tsFrom)+'-'+(tsTo==null?'':tsTo);   /* (#R94) master-clock year; (#R122) time-series year window so a range change re-renders */
      if(el.dataset.sig===sig&&el.querySelector('.scp-sec')) return;   /* already showing exactly this */
      const my=(el.__seq=(el.__seq||0)+1);
      /* (#R71) bar mode reads the FAST latest-value path (1 request per indicator); only the time-series
         view pays for full per-country series */
      const b=(mode==='bar')?await latestData(ind):await blockData(ind);
      if(el.__seq!==my||!el.isConnected) return;
      /* (#R123) collect the years that actually carry data so the time-series year pickers list only those */
      if(mode==='ts'&&b&&b.serMap){ let added=false; codes.forEach(cd=>{ (b.serMap[cd]||[]).forEach(p=>{ if(p&&isFinite(p.y)&&!_tsAvailYears.has(+p.y)){ _tsAvailYears.add(+p.y); added=true; } }); }); if(added) _refreshTsYearOpts(); }
      el.dataset.sig=sig;
      el.innerHTML=(mode==='bar')?barBlockHtml(b):blockHtml(b);
      el.querySelectorAll('.scp-srcsw button').forEach(btn=>{ btn.onclick=(e)=>{ e.stopPropagation(); srcSel[k]=btn.getAttribute('data-s'); renderInd(k); }; });
      el.querySelectorAll('.scp-focus').forEach(btn=>{ btn.onclick=(e)=>{ e.stopPropagation(); renderFocus(k); }; });
      try{ wireM(el); }catch(_){}
    }
    /* ===== (#R71) FOCUS view ("一つだけ選択したら詳細設定をできるとかなら尚いい"): one indicator, full
       width — source switch, latest bars, a LARGE time-series chart and a per-year value table. ===== */
    async function renderFocus(k){ if(!host) return; const ind=IND.find(i2=>i2.k===k); if(!ind) return;
      const body=host.querySelector('#scp-body'); if(!body) return;
      body.innerHTML='<div id="scp-fx"><button class="scp-back" id="scp-fxback">← '+LL('All indicators','指標一覧へ','Alle Kennzahlen','Все показатели','Todos los indicadores')+'</button><div style="color:var(--text-muted);font-size:12px;padding:8px 2px;">'+LL('Loading data…','データ読み込み中…','Lade Daten…','Загрузка данных…','Cargando datos…')+'</div></div>';
      body.querySelector('#scp-fxback').onclick=()=>{ render(); };
      const my=(renderFocus._seq=(renderFocus._seq||0)+1);
      const [lb,sb2]=await Promise.all([latestData(ind),blockData(ind)]);
      if(my!==renderFocus._seq||!host.isConnected) return;
      const fx=body.querySelector('#scp-fx'); if(!fx) return;
      /* per-year table: union of years, newest first, capped at 24 rows */
      const yset=new Set(); codes.forEach(cd=>{ (sb2.serMap[cd]||[]).forEach(p=>yset.add(p.y)); });
      const years=[...yset].sort((a,b2)=>b2-a).slice(0,24);
      let yt='';
      if(years.length){ yt='<div class="scp-tblwrap" style="max-height:300px;overflow-y:auto;"><table class="scp-tbl scp-xl"><tr><th>'+LL('Year','年','Jahr','Год','Año')+'</th>'
          +codes.map((cd,i)=>{ const s2=_cs(cd); return '<th><span style="color:'+PAL[i]+';">●</span> '+esc(cName(s2)||cd)+'</th>'; }).join('')+'</tr>';
        years.forEach(y2=>{ yt+='<tr><th class="scp-rowh" style="cursor:default;">'+y2+'</th>'+codes.map(cd=>{ const p=(sb2.serMap[cd]||[]).find(q=>q.y===y2); return p?('<td>'+fmtSigned(ind,p.v)+'</td>'):'<td style="color:var(--text-muted);">—</td>'; }).join('')+'</tr>'; });
        yt+='</table></div>'; }
      fx.innerHTML='<button class="scp-back" id="scp-fxback">← '+LL('All indicators','指標一覧へ','Alle Kennzahlen','Все показатели','Todos los indicadores')+'</button>'
        +secHtml(ind,sb2.srcName).replace('scp-focus','scp-focus" style="display:none;')
        +barsHtml(lb)
        +mChart(ind,sb2.serMap,240)
        +yt;
      fx.querySelector('#scp-fxback').onclick=()=>{ render(); };
      fx.querySelectorAll('.scp-srcsw button').forEach(btn=>{ btn.onclick=()=>{ srcSel[k]=btn.getAttribute('data-s'); renderFocus(k); }; });
      try{ wireM(fx); }catch(_){}
    }
    async function render(){ const v=ensureView(); if(!v) return; chipRow(); metricRow(); modeRow(); try{ v.__refreshList&&v.__refreshList(); }catch(_){}
      /* (#R114) time-machine banner — HONEST about the source. While travelling, GDP & population come from the
         Maddison long-run series (real 2011 int$); other indicators show their World Bank / IMF value for that year
         WHERE the annual series reaches it (WB/IMF begin in 1960). The old copy wrongly claimed EVERY travelled year
         was "this year's World Bank / IMF figures" (plainly false for e.g. 1939) and carried a 📅 emoji (removed). */
      try{ const tb=v.querySelector('#scp-timebanner'); if(tb){ const ty=_ttYear(), pw=(window._imTimePreWB||null);
        if(ty){ tb.style.display='block';
          if(ty<1960){ tb.classList.add('warn'); tb.innerHTML='<b>'+ty+'</b> · '+LL('long-run estimates for this year — World Bank / IMF annual series begin in 1960','この年の長期推計値 — 世界銀行・IMFの年次データは1960年以降','Langzeitschätzungen für dieses Jahr — Weltbank-/IWF-Reihen ab 1960','долгосрочные оценки за этот год — ряды Всемирного банка/МВФ с 1960','estimaciones de largo plazo para este año — las series del Banco Mundial/FMI empiezan en 1960'); }
          else { tb.classList.remove('warn'); tb.innerHTML='<b>'+ty+'</b> · '+LL('each indicator’s value for this year, by its own source','この年の各指標の値（各出典による）','Werte je Kennzahl für dieses Jahr, nach Quelle','значение каждого показателя за этот год, по своему источнику','valor de cada indicador para este año, según su fuente'); } }
        else if(pw){ tb.style.display='block'; tb.classList.add('warn'); tb.innerHTML='<b>'+pw+'</b> · '+LL('World Bank annual series begin in 1960 — latest available','世界銀行の年次データは1960年以降','Weltbank-Reihen ab 1960','ряды Всемирного банка с 1960','series desde 1960'); }
        else tb.style.display='none'; } }catch(_){}
      const body=v.querySelector('#scp-body');
      /* (#R108) FIX the rare "bar→time-series が切り替わらない（tableを経由すると変わる）" bug: a MODE change must fully
         rebuild the blocks. The incremental keep-blocks path (kept for country/indicator changes) occasionally left the
         previous mode's chart in place; wiping ONLY on a real mode change forces a clean render like the table path does. */
      if(body && render._lastMode!==undefined && render._lastMode!==mode){ try{ body.innerHTML=''; }catch(_){} }
      render._lastMode=mode;
      if(!codes.length){ body.innerHTML='<div style="color:var(--text-muted);font-size:12.5px;padding:16px 2px;">'+LL('Add countries above to compare them.','上の欄から国を追加してください。','Länder oben hinzufügen.','Добавьте страны выше.','Añade países arriba.')+'</div>'; return; }
      const inds=orderedInds();
      if(!inds.length){ body.innerHTML='<div style="color:var(--text-muted);font-size:12px;">'+LL('Select at least one indicator.','指標を選択してください。','Mindestens eine Kennzahl wählen.','Выберите показатель.','Selecciona un indicador.')+'</div>'; return; }
      if(mode==='table'){ renderTable(); return; }   /* (#R70) Excel-like pivot view */
      /* (#R69) INCREMENTAL ("いちいち再度すべて読み込みになる動作がうざい"): existing blocks are KEPT (their
         content stays visible while data refreshes from the shared cache), deselected ones are removed, new ones
         are inserted in IND order — never a full wipe back to "Loading data…". */
      if(!body.querySelector('.scp-blk')) body.innerHTML='';
      /* (#R122) time-series YEAR-RANGE control (inserted AFTER the possible wipe above, so it survives the first
         render): pick a start & end year and the graphs redraw to that window. */
      if(mode==='ts'){ try{ let bar=body.querySelector('#scp-tsrange');
        /* (#R123) reset the collected available-year set when the comparison (countries × indicators) changes, so
           the pickers rebuild from the new selection's real data years. A tsFrom/tsTo change keeps the same sig. */
        const csig=codes.join(',')+'|'+inds.map(i2=>i2.k).join(',');
        if(csig!==_tsYearsSig){ _tsAvailYears=new Set(); _tsYearsSig=csig; }
        if(!bar){ bar=document.createElement('div'); bar.id='scp-tsrange'; bar.className='scp-tsrange'; body.insertBefore(bar,body.firstChild); }
        bar.innerHTML=_tsRangeHtml(); _wireTsRange(bar);
      }catch(_){} }
      const wantKs=inds.map(i2=>i2.k);
      Array.prototype.slice.call(body.querySelectorAll('.scp-blk')).forEach(el=>{ if(wantKs.indexOf(el.getAttribute('data-k'))<0) el.remove(); });
      let prev=null;
      inds.forEach(ind=>{ let el=body.querySelector('.scp-blk[data-k="'+ind.k+'"]');
        if(!el){ el=document.createElement('div'); el.className='scp-blk'; el.setAttribute('data-k',ind.k);
          el.innerHTML='<div style="color:var(--text-muted);font-size:12px;padding:10px 2px;">'+LL('Loading data…','データ読み込み中…','Lade Daten…','Загрузка данных…','Cargando datos…')+'</div>';
          if(prev){ if(prev.nextSibling) body.insertBefore(el,prev.nextSibling); else body.appendChild(el); }
          else { const _tb=body.querySelector('#scp-tsrange'); if(_tb) body.insertBefore(el,_tb.nextSibling); else body.insertBefore(el,body.firstChild); } }   /* (#R122) keep the year-range bar on top */
        prev=el; renderInd(ind.k); });
    }
    /* (#R70) mode segmented control (bar | time-series | table) */
    function modeRow(){ const w=host&&host.querySelector('#scp-modes'); if(!w) return;
      w.querySelectorAll('button').forEach(b=>{ b.classList.toggle('on',b.getAttribute('data-m')===mode); }); try{ _fitModeFont(); }catch(_){} }
    /* (#R111) auto-fit "Bar chart | Time-series | Table" + the Indicators toggle to the LARGEST font that keeps them
       on ONE line at the CURRENT container width AND language ("文字サイズを大きく…二行になるのは厳禁"). A fixed CSS
       tier can't be optimal for every language (ES/RU labels are long, JP short), and it especially matters in the
       narrow workspace-mode Countries pane (~274px). Sets inline font-size (overrides the fallback tiers); runs on
       every render + a ResizeObserver (window/pane resize). */
    let _fitRAF=0;
    function _fitModeFont(){ const h=host; if(!h||!document.body.contains(h)) return;
      const row=h.querySelector('.scp-ctrlrow'), modes=h.querySelector('#scp-modes'), tog=h.querySelector('#scp-mtog');
      if(!row||!modes||!tog) return; const btns=[...modes.querySelectorAll('button')]; if(!btns.length) return;
      if(!row.clientWidth) return;   /* not laid out yet */
      const setF=f=>{ btns.forEach(b=>b.style.fontSize=f+'px'); tog.style.fontSize=f+'px'; };
      const wrapped=()=>{ const kids=[...row.children].filter(c=>c.getClientRects().length); if(kids.length<2) return false; const t0=kids[0].offsetTop; return kids.some(k=>k.offsetTop>t0+2); };
      let best=9; for(let f=16;f>=9;f-=0.25){ setF(f); if(!wrapped()){ best=f; break; } }
      setF(best); }
    function _fitModeFontSoon(){ if(_fitRAF) return; _fitRAF=requestAnimationFrame(()=>{ _fitRAF=0; try{ _fitModeFont(); }catch(_){} }); }
    /* ===== (#R70) TABLE mode — "エクセルのように、表を自由に組み替えて複数国家を複数指標で分析":
       countries × indicators grid; ⇄ transposes rows/columns; column-header click sorts (desc → asc → off);
       headers are DRAG-reorderable (real column/row rearrangement); a year selector re-reads every cell at
       that year (latest value ≤ the chosen year, year shown per cell); CSV export. All values come from the
       SAME cached series as the charts — no extra fetches. ===== */
    function _valAt(ser,yr){ if(!ser||!ser.length) return null; if(yr==null) return ser[ser.length-1];
      for(let i=ser.length-1;i>=0;i--){ if(ser[i].y<=yr) return ser[i]; } return null; }
    async function renderTable(){ if(!host) return; const body=host.querySelector('#scp-body');
      const inds=orderedInds(); if(!inds.length||!codes.length) return;
      if(!body.querySelector('#scp-tblv')) body.innerHTML='<div id="scp-tblv"><div style="color:var(--text-muted);font-size:12px;padding:10px 2px;">'+LL('Loading data…','データ読み込み中…','Lade Daten…','Загрузка данных…','Cargando datos…')+'</div></div>';
      const my=(renderTable._seq=(renderTable._seq||0)+1);
      /* (#R71) latest values ride the FAST path (1 request per indicator, WB⇄IMF⇄reference gap-fill);
         only a specific-year selection needs the full per-country series */
      const bByK={};
      if(tYear==null){ const ls=await Promise.all(inds.map(ind=>latestData(ind))); if(my!==renderTable._seq||!host||!host.isConnected) return; ls.forEach(b=>{ bByK[b.ind.k]={ind:b.ind,latest:b.map}; }); }
      else { const blocks=await Promise.all(inds.map(ind=>blockData(ind))); if(my!==renderTable._seq||!host||!host.isConnected) return; blocks.forEach(b=>{ bByK[b.ind.k]={ind:b.ind,ser:b.serMap}; }); }
      const wrap=body.querySelector('#scp-tblv'); if(!wrap) return;
      const cellAt=(indK,cd)=>{ const b=bByK[indK]; if(!b) return null; if(b.latest) return b.latest[cd]||null; return _valAt(b.ser[cd],tYear); };
      /* row/col axes — default rows=countries; tFlip transposes */
      const rows=tFlip?inds.map(i2=>i2.k):codes.slice();
      const cols=tFlip?codes.slice():inds.map(i2=>i2.k);
      /* sorting: tSort={col,dir} sorts the ROW axis by that column's value */
      let rowOrder=rows.slice();
      if(tSort&&cols.indexOf(tSort.col)>=0){ const colKey=tSort.col;
        const cellV=(rk)=>{ const indK=tFlip?rk:colKey, cd=tFlip?colKey:rk; const p=cellAt(indK,cd); return p?p.v:null; };
        rowOrder.sort((a,b2)=>{ const va=cellV(a),vb=cellV(b2); if(va==null&&vb==null) return 0; if(va==null) return 1; if(vb==null) return -1; return tSort.dir==='asc'?va-vb:vb-va; }); }
      const cLbl=cd=>{ const s2=_cs(cd); return (s2.flag?s2.flag+' ':'')+esc(cName(s2)||cd); };
      const iLbl=k2=>{ const i2=IND.find(x=>x.k===k2); return i2?esc(LL(i2.l[0],i2.l[1],i2.l[2],i2.l[3],i2.l[4])):esc(k2); };
      const hLbl=(key,isCol)=>((tFlip?isCol:!isCol)?cLbl(key):iLbl(key));
      const yrs=[]; for(let y2=new Date().getFullYear();y2>=1960;y2--) yrs.push(y2);
      const _selY=(tYear!=null)?tYear:_ttYear();   /* (#R94) the dropdown reflects the master clock while travelling */
      let h='<div class="scp-ttools">'
        +'<button id="scp-flip" title="'+LL('Swap rows/columns','行と列を入れ替え','Zeilen/Spalten tauschen','Поменять строки/столбцы','Intercambiar filas/columnas')+'">⇄ '+LL('Transpose','行列入替','Transponieren','Транспонировать','Transponer')+'</button>'
        +'<select id="scp-year"><option value=""'+(_selY==null?' selected':'')+'>'+LL('Latest','最新値','Aktuell','Последнее','Último')+'</option>'+yrs.map(y2=>'<option value="'+y2+'"'+(_selY===y2?' selected':'')+'>'+y2+'</option>').join('')+'</select>'
        +'<button id="scp-csv">CSV</button>'
        +(tSort?('<button id="scp-unsort">'+LL('Clear sort','並べ替え解除','Sortierung aufheben','Сбросить сортировку','Quitar orden')+'</button>'):'')
        +'<span class="scp-src" style="margin-left:auto;">'+LL('Drag headers to reorder · click to sort','ヘッダーをドラッグで並べ替え・クリックでソート','Header ziehen = umordnen · Klick = sortieren','Перетащите заголовки · клик = сортировка','Arrastra encabezados · clic = ordenar')+'</span></div>';
      h+='<div class="scp-tblwrap"><table class="scp-tbl scp-xl" id="scp-pivot"><tr><th class="scp-corner"></th>';
      cols.forEach((ck,ci)=>{ const srt=(tSort&&tSort.col===ck)?(tSort.dir==='asc'?' ▲':' ▼'):'';
        h+='<th class="scp-h" draggable="true" data-ax="col" data-i="'+ci+'" data-k="'+esc(ck)+'">'+hLbl(ck,true)+srt+'</th>'; });
      h+='</tr>';
      rowOrder.forEach(rk=>{ h+='<tr><th class="scp-h scp-rowh" draggable="true" data-ax="row" data-k="'+esc(rk)+'">'+hLbl(rk,false)+'</th>';
        cols.forEach(ck=>{ const indK=tFlip?rk:ck, cd=tFlip?ck:rk; const i2=IND.find(x=>x.k===indK);
          const p=cellAt(indK,cd);
          /* (#R71) sign-carrying indicators show ±green/red; ° marks a gap-filled value */
          h+=p?('<td>'+fmtSigned(i2,p.v)+(p.src?'<span class="scp-fill">°</span>':'')+(p.y?' <span class="scp-yr">('+p.y+')</span>':'')+'</td>'):'<td style="color:var(--text-muted);">—</td>'; });
        h+='</tr>'; });
      h+='</table></div>';
      h+='<div class="scp-src" style="margin-top:6px;">'+LL('Sources per indicator: World Bank / IMF WEO / bundled reference (shown in bar & time-series views)','出典は指標ごと（世界銀行／IMF WEO／内蔵参照データ — 棒グラフ・時系列表示に明記）','Quellen je Kennzahl: Weltbank / IWF WEO / Referenzdaten','Источники по показателям: Всемирный банк / МВФ / встроенные данные','Fuentes por indicador: Banco Mundial / FMI WEO / datos de referencia')+'</div>';
      wrap.innerHTML=h;
      wrap.querySelector('#scp-flip').onclick=()=>{ tFlip=!tFlip; tSort=null; renderTable(); };
      wrap.querySelector('#scp-year').onchange=(e)=>{ const v2=e.target.value; tYear=v2?+v2:null; renderTable(); };
      const un=wrap.querySelector('#scp-unsort'); if(un) un.onclick=()=>{ tSort=null; renderTable(); };
      wrap.querySelector('#scp-csv').onclick=()=>{ try{
        const esc2=s=>{ s=String(s==null?'':s); return /[",\n]/.test(s)?('"'+s.replace(/"/g,'""')+'"'):s; };
        const strip=s=>String(s).replace(/<[^>]*>/g,'');
        let csv=esc2('')+','+cols.map(ck=>esc2(strip(hLbl(ck,true)))).join(',')+'\n';
        rowOrder.forEach(rk=>{ const cells=cols.map(ck=>{ const indK=tFlip?rk:ck, cd=tFlip?ck:rk; const p=cellAt(indK,cd); return p?esc2(p.y?(p.v+' ('+p.y+')'):String(p.v)):''; });
          csv+=esc2(strip(hLbl(rk,false)))+','+cells.join(',')+'\n'; });
        const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob(['﻿'+csv],{type:'text/csv'})); a.download='intmap-compare.csv'; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),4000);
      }catch(_){} };
      /* column-header click = sort; drag = reorder the underlying codes[]/indOrder[] */
      wrap.querySelectorAll('th.scp-h[data-ax="col"]').forEach(th=>{
        th.onclick=()=>{ const k2=th.getAttribute('data-k');
          if(tSort&&tSort.col===k2) tSort=(tSort.dir==='desc')?{col:k2,dir:'asc'}:null;
          else tSort={col:k2,dir:'desc'};
          renderTable(); }; });
      let dragK=null, dragAx=null;
      wrap.querySelectorAll('th.scp-h').forEach(th=>{
        th.addEventListener('dragstart',e=>{ dragK=th.getAttribute('data-k'); dragAx=th.getAttribute('data-ax'); try{ e.dataTransfer.setData('text/plain',dragK); e.dataTransfer.effectAllowed='move'; }catch(_){} });
        th.addEventListener('dragover',e=>{ if(dragAx===th.getAttribute('data-ax')) e.preventDefault(); });
        th.addEventListener('drop',e=>{ e.preventDefault(); const toK=th.getAttribute('data-k'); if(!dragK||dragK===toK||dragAx!==th.getAttribute('data-ax')) return;
          /* axis identity: cols = tFlip?countries:indicators; rows = the other */
          const isCountryAxis=(dragAx==='col')?tFlip:!tFlip;
          const arr=isCountryAxis?codes:(indOrder||(indOrder=orderedInds().map(i2=>i2.k)));
          const fi=arr.indexOf(dragK), ti=arr.indexOf(toK); if(fi<0||ti<0) return;
          arr.splice(ti,0,arr.splice(fi,1)[0]); dragK=null; chipRow(); renderTable(); }); });
    }
    /* (#R83) PAINT the compared countries ON THE MAP in the SAME colours as the chart (user request:
       「Compareで選択された国家は、地図上でも同じ色で塗られるように（Show comparisonクリック時に）」). An independent
       categorical fill built directly from window.countryGeo — needs no layer toggle and never disturbs Atlas's
       own highlight/choropleth layers. Country codes[i] gets PAL[i], exactly matching the chips/bars/table. */
    function ensureCmpMap(){ if(!GE().hasRenderer()||!GE().hasRenderer()) return false; const g=window.countryGeo||(typeof HOST.countryGeo!=='undefined'?HOST.countryGeo:null); if(!g||!g.features) return false;
      try{ if(!_LY().hasSource('imcmp-src')) _LY().addSource('imcmp-src',{type:'geojson',data:{type:'FeatureCollection',features:[]}}); }catch(_){}
      if(!_LY()) return false;   /* engine not built yet (#R172) */
      if(_LY().has('imcmp-fill')) return true;
      const before=['nlq-fill','ofm-country','ofm-city','ofm-other','tool-poly'].find(id=>{ try{ return !!_LY().has(id); }catch(_){ return false; } });
      try{ _LY().add({id:'imcmp-fill',type:'fill',source:'imcmp-src',paint:{'fill-color':['coalesce',['get','color'],'#0a84ff'],'fill-opacity':0.5}},before);
        _LY().add({id:'imcmp-line',type:'line',source:'imcmp-src',paint:{'line-color':['coalesce',['get','color'],'#0a84ff'],'line-width':1.6,'line-opacity':0.95}},before); return true; }catch(_){ return false; } }
    /* (#R94h/#R94n) while travelling, paint each compared country's ERA polygon (its borders THAT year) rather
       than the modern one, so the Compare highlight matches history — the German Empire's 1910 extent (≠ modern
       Germany), 1910 France (no Alsace-Lorraine), and former states like the USSR that have no modern polygon
       at all. Off-era (LIVE) or when the era shape is unavailable, it falls back to the modern polygon. */
    function _paintCodes(list){ if(!ensureCmpMap()) return false; const g=window.countryGeo||(typeof HOST.countryGeo!=='undefined'?HOST.countryGeo:null); if(!g) return false;
      const TB=window.IntMapTimeBorders; const traveling=!!(TB&&TB.active&&TB.active());
      const modernOf={}; g.features.forEach(f=>{ const cd=String(f.id!=null?f.id:(f.properties&&f.properties.__code)); if(f.geometry&&!modernOf[cd]) modernOf[cd]=f.geometry; });
      const feats=[]; (list||[]).forEach((cd,i)=>{ const col=PAL[i%PAL.length]; let geom=null;
        if(traveling&&TB.geomForCode){ try{ geom=TB.geomForCode(cd); }catch(_){} }
        if(!geom) geom=modernOf[String(cd)]||null;
        if(geom) feats.push({type:'Feature',geometry:geom,properties:{color:col}}); });
      try{ _LY().setSourceData('imcmp-src',{type:'FeatureCollection',features:feats}); }catch(_){}
      return feats.length>0; }
    function paintOnMap(){ return _paintCodes(codes); }
    /* (#R122) live preview from the Countries-tab selection tray (compareSet) BEFORE the compare view opens — the
       same imcmp-src / palette, so selecting a country in Countries highlights it on the map immediately. */
    function previewOnMap(list){ return _paintCodes(Array.isArray(list)?list:[]); }
    function clearMap(){ try{ _LY().setSourceData('imcmp-src',{type:'FeatureCollection',features:[]}); }catch(_){} }
    /* re-apply after a base-style swap (globe/flat/satellite reload wipes runtime sources) */
    /* (#R94k) only re-paint while the comparison is actually OPEN — otherwise a styledata after "Back to
       statistics" (codes[] is still populated) re-painted the cleared map colouring. */
    try{ if(_EV()) _EV().on('styledata',()=>{ if(codes&&codes.length&&document.getElementById('scp-view')){ setTimeout(()=>{ try{ if(document.getElementById('scp-view')) paintOnMap(); }catch(_){} },160); } }); }catch(_){}
    /* (#R94) re-render the OPEN comparison when the master clock moves — bars/table/focus follow the year. */
    let _ttReb=null;
    try{ if(window.IntMapTime) window.IntMapTime.on(()=>{ if(host&&document.getElementById('scp-view')){ clearTimeout(_ttReb); _ttReb=setTimeout(()=>{ try{ render(); }catch(_){} },380); } }); }catch(_){}
    /* (#R105) re-localize the OPEN comparison immediately on a language change (was stuck until reload in ws mode).
       ensureView() returns the EXISTING host without rebuilding its header (title/back/modes), so we drop the host
       first → render() rebuilds it fresh in the new language (state — codes/sel/mode — is preserved in module vars). */
    try{ window.addEventListener('intmap-lang',()=>{ try{ if(host&&document.getElementById('scp-view')){ try{ host.remove(); }catch(_){} host=null; render(); } }catch(_){} }); }catch(_){}
    function open(initCodes,initMetrics,initSource,initMode){
      if(!sel){ sel=new Set(IND.filter(i=>i.def).map(i=>i.k)); }
      if(Array.isArray(initMetrics)&&initMetrics.length){ const ok=initMetrics.filter(k=>IND.some(i=>i.k===k)); if(ok.length){ sel=new Set(ok); indOrder=ok.slice(); } }
      if(initSource==='imf'||initSource==='wb'){ IND.forEach(i2=>{ if(i2.imf) srcSel[i2.k]=initSource; }); }
      /* (#R105) default to the BAR chart unless a view is explicitly requested ("明示がない限りbar-chartを開いて"). */
      mode=(initMode==='bar'||initMode==='ts'||initMode==='table')?initMode:'bar';   /* (#R70) callers may open straight into a view */
      if(Array.isArray(initCodes)&&initCodes.length){ codes=initCodes.filter(cd=>countryStats[cd]).slice(0,10); }   /* (#R71) cap 5→10 */
      if(!codes.length&&window._cpCurrent&&window._cpCurrent.code&&countryStats[window._cpCurrent.code]) codes=[window._cpCurrent.code];
      host=null;   /* rebuild inside the sidebar (the feed may have been re-rendered by tab switches) */
      render(); try{ paintOnMap(); }catch(_){} }
    /* (#R124) sync a single Countries-tab toggle into an ALREADY-OPEN compare view. The bug: the Countries tray
       (compareSet) and this panel's `codes` are separate stores, so adding a country in the Countries tab while
       the compare view was open never updated `codes` → the time-series only reflected it after a reload
       ("国を追加したとき、Time-seriesは再読み込みしないと反映されない"). This applies the DELTA (never clobbers a
       country added via the panel's own input) and re-renders in place, PRESERVING the current mode (bar/ts/table). */
    function toggleCountry(code, on){ if(!code||!countryStats[code]) return false;
      const i=codes.indexOf(code);
      if(on){ if(i>=0) return false; if(codes.length>=10) return false; codes.push(code); }
      else { if(i<0) return false; codes.splice(i,1); }
      if(host&&host.isConnected&&document.getElementById('scp-view')){ try{ render(); }catch(_){} try{ paintOnMap(); }catch(_){} }
      return true; }
    /* (#R115) Atlas needs the indicator vocabulary to honour "compare … — GDP, defense and population":
       expose the valid metric keys + a localized label so the compareStats action can resolve & report them. */
    function indLabel(k){ try{ const i2=IND.find(x=>x.k===k); if(!i2) return k; return (i2.l&&LL.arr(i2.l))||k; }catch(_){ return k; } }
    /* (#R118) state() — the compare panel's LIVE state (also when the user built it BY HAND), so Atlas's
       working context reflects reality instead of only its own past actions. */
    function state(){ try{ return { open:!!(host&&host.isConnected&&document.getElementById('scp-view')), codes:codes.slice(), indicators:(indOrder||[]).slice(), mode, sources:Object.assign({},srcSel) }; }catch(_){ return null; } }
    return { open, paintOnMap, previewOnMap, clearMap, toggleCountry, indKeys:()=>IND.map(i2=>i2.k), indLabel, state };
  })();
};
