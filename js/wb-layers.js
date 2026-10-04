/* ============================================================================
 *  IntMap · World-Bank indicator choropleths + latest-stats refresh — IntMapModules.wbLayers  (#R164)
 * ----------------------------------------------------------------------------
 *  window.IntMapWB — the cached World-Bank indicator fetch (mrnev with date-range fallback), the
 *  WDI choropleth layers built from it, and the one-shot "refresh Stats to latest WB figures" pass.
 *
 *  Moved verbatim out of index.html's DOMContentLoaded closure (#R164): the body below is
 *  byte-identical to the block that used to live there, except that closure values which are
 *  REASSIGNED at runtime are read through the live host interface (Architecture.md §3.1):
 *      currentLang -> HOST.lang, currentMode -> HOST.mode
 *
 *  The CSS stays in css/intmap.css; this file adds no <style>.
 * ==========================================================================*/
import { isUnobserved, untilObserved } from './fetch-deadline.js';   /* (unobserved-is-not-refused) a read that ran out of time is not an empty series */
import { readWorldBank, wbClock, wbIndicator } from './wb-indicators.js';   /* (country-analysis-unify) the one World Bank read and the one catalogue of its series */
import { afterTick, tickKey } from './runtime.js';
import { IntMapGeoEngine } from './geo-engine.js';
import { IntMapLang } from './lang-registry.js';
import { IntMapTime } from './chronos.js';
/* (mobile-performance) when a phone may refresh the World Bank figures */
import { BootStage } from './boot-stage.js';
import * as bus from './bus.js';
import { layerInflight } from './layer-rows.js';   /* (map-layer-system) each row's request, for the layer-state audit */

export function wbLayers(HOST){
  const GE=()=>IntMapGeoEngine;   /* (#R178) the renderer, through the contract — never the raw handle */
  /* stable closure values (never reassigned) — rebound under their original names so the moved body stays verbatim */
  const computeFilteredNews=HOST.computeFilteredNews, countryStats=HOST.countryStats, imToast=HOST.imToast, loadCountryData=HOST.loadCountryData, renderStats=HOST.renderStats, searchVal=HOST.searchVal;
  (function(){
    if(!GE().hasRenderer()||!GE().hasRenderer()) return;
    const jp=()=>HOST.lang==='jp';
    function ensureGeo(cb){ try{ if(window.countryGeo&&window.countryGeo.features) return cb(window.countryGeo); if(typeof loadCountryData==='function'){ loadCountryData().then(()=>cb(window.countryGeo),()=>cb(null)); return; } }catch(_){} cb(null); }
    const iso=(p)=>{ p=p||{}; return p.ISO_A3_EH||p.ISO_A3||p.ADM0_A3||p.SOV_A3||p.iso_a3||p.ADM0_A3_US||''; };
    /* ══ (#R266) ONE SERIES PER INDICATOR, NOT ONE NUMBER ══════════════════════════════════════════
       「GDP成長率レイヤーは年を選択できるようにしろ。同一年度で比較しないと意味がない。」 — and that is
       exactly right about what was being painted. `mrnev=1` is «each country's most recent NON-EMPTY
       year», so one map could hold Japan at 2025 beside a country whose last reported year is 2019,
       and the legend said only «most recent value per country». A choropleth is a comparison; a
       comparison across different years is not one.

       So the fetch is now the whole series (1990 → next year, one page, measured 2.1 MB / 0.55 s for
       NY.GDP.MKTP.KD.ZG), kept per indicator, and every layer paints ONE year at a time. The old
       shape is derived from it rather than fetched separately — `wbFetch(code)` still answers the
       `{ISO:{v,y}}` latest-per-country map that the Correlation tool and refreshStatsLatest read,
       so there is still exactly one network path and one cache.

       ⚠ `code` MAY BE AN ARRAY, and it is summed per country-year. That is not a convenience: the
       World Bank RETIRED `SM.POP.REFG` (難民受入数) — the API answers «The indicator was not found.
       It may have been deleted or archived.» for it, which is why that layer said 「データを取得でき
       ませんでした」 — and its replacement is split in two, UNHCR's mandate and UNRWA's. Summing them
       is what reproduces «refugees hosted». */
    const wbCache={};        /* code -> {ISO:{v,y}}  — latest non-empty year per country (the old shape) */
    const wbSeriesCache={};  /* code -> {years:[…], by:{y:{ISO:v}}, counts:{y:n}, best:y} */
    const WB_FROM=1990;
    const _wbKey=(code)=>Array.isArray(code)?code.join('+'):code;
    /* (#R32) Resilient fetch, kept: newer WDI series answer a SERVER ERROR for `mrnev=1`, so the
       date-range query is the primary read and only a truly empty answer falls back. Nothing is
       cached unless it is non-empty, so a throttled attempt recovers on the next toggle. */
    function wbSeries(code){ const key=_wbKey(code);
      if(wbSeriesCache[key]) return Promise.resolve(wbSeriesCache[key]);
      const to=new Date().getUTCFullYear()+1;
      /* (stalled-fetch-and-surface-gauge) every year since WB_FROM for every country in one answer — a large body,
         so the clock measures SILENCE (`idle`: re-armed on every chunk), not the length of the download.
         ⚠ (unobserved-is-not-refused) A read that STOPPED is not `[]`. It used to be — so for a summed indicator
         (UNHCR + UNRWA) one silent half and one answering half made a partial sum that was CACHED as the series,
         and a wholly silent read painted every country grey («no data»). A refusal or a bad body is still `[]`;
         a silence re-throws, js/fetch-deadline.js `untilObserved` asks again with the clock doubled, and when the
         host stayed silent through every retry wbSeries REJECTS — nothing is cached, the next call reads again. */
      /* (country-analysis-unify) through js/wb-indicators.js readWorldBank — the answer's vocabulary is that file's: a late
         read (`late`) re-throws for untilObserved, anything else that is not an answer is `[]` exactly as before. `keep:false`:
         this reader keeps its own derived form (wbSeriesCache), so the 2 MB of rows are not kept twice. */
      const one=(c,scale)=>readWorldBank({ code:c, date:WB_FROM+':'+to, perPage:20000, scale, idle:true, keep:false })
        .then(r=>{ if(r.status==='unavailable'&&r.late) throw r.error; return r.rows; });
      const codes=Array.isArray(code)?code:[code];
      return untilObserved((s)=>Promise.all(codes.map((c)=>one(c,s))),{ base:wbClock(), wait:(ms)=>afterTick(tickKey('wb-layers:unobserved'),ms) }).then(parts=>{
        const by=Object.create(null);
        parts.forEach(arr=>{ arr.forEach(d=>{ if(!d||!d.iso3) return;
          const y=d.date; (by[y]=by[y]||Object.create(null));
          by[y][d.iso3]=(by[y][d.iso3]||0)+d.v; }); });
        const years=Object.keys(by).sort();
        if(!years.length) return null;
        const counts={}; years.forEach(y=>{ counts[y]=Object.keys(by[y]).length; });
        /* THE DEFAULT YEAR IS «as recent as the data actually is». Scanning for the most recent year
           that still carries essentially the full coverage the series ever had beats both «the very
           latest year» (which is half-empty while countries are still reporting) and «the year with
           the most countries» (which can be a decade old). The count is printed in the legend, so
           the choice is visible rather than asserted. */
        const max=Math.max.apply(null,years.map(y=>counts[y]));
        let best=years[years.length-1];
        for(let i=years.length-1;i>=0;i--){ if(counts[years[i]]>=max*0.9){ best=years[i]; break; } }
        const S={years,by,counts,best};
        wbSeriesCache[key]=S;
        /* the latest-per-country map, derived — never a second request */
        const m={}; years.forEach(y=>{ const row=by[y]; Object.keys(row).forEach(iso3=>{ const cur=m[iso3];
          if(!cur||(+y)>(+cur.y)) m[iso3]={v:row[iso3],y}; }); });
        if(Object.keys(m).length) wbCache[key]=m;
        return S; });
    }
    function wbFetch(code){ const key=_wbKey(code);
      if(wbCache[key]) return Promise.resolve(wbCache[key]);
      /* (unobserved-is-not-refused) a silent host hands this caller `{}` as before, but NOTHING is cached — the next call reads again */
      return wbSeries(code).then(()=>wbCache[key]||{}).catch(()=>({})); }
    /* (#R40) expose the WB indicator fetch (cached, latest value per country) so the Correlation/Scatter tool
       can offer the full World-Bank indicator set as axes ("対応する項目を大幅に増やして"). (#R266) `series`
       joins it, so Atlas can ask for a specific year rather than only «the latest». */
    /* (#R270) …and the RAMP, so js/layer-previews.js can draw a tile with the colours the layer
       actually paints. Its `WBP` table carried its own copy, and the copy went stale the moment
       #R268 made GDP growth diverging: the thumbnail was still the old red→green sequential ramp,
       so the tile and the map disagreed about the layer's colours. One owner, read at draw time. */
    try{ window.IntMapWB={ fetch:wbFetch, get:(code)=>wbCache[_wbKey(code)]||null,
      series:wbSeries, seriesOf:(code)=>wbSeriesCache[_wbKey(code)]||null,
      rampOf:(id)=>{ const L=WB.find(x=>x.id===id)||wbById[id]; return L?V(L).ramp.slice():null; },
      /* (#R289) …and the INDICATOR, for the same reason #R270 published the ramp: a modal layer's
         code changes with its mode, and js/layer-previews.js's copy would then draw the other
         series through this one's colours. One owner, read at draw time. */
      codeOf:(id)=>{ const L=WB.find(x=>x.id===id)||wbById[id]; return L?V(L).code:null; },
      /* (map-layer-system) the indicator browser — one row (`bx-wbind`) that paints any of the series below, chosen by
         search and by subject. The module that draws the picker is fetched the first time the row is switched on. */
      indicators:()=>indicatorEntries(), paintIndicator:(id)=>indPaint(id), clearIndicator:()=>indClear(), currentIndicator:()=>IND.cur,
      indicatorBrowser:()=>indBrowser() }; }catch(_){}
    const LA=IntMapLang.pickArgs(), LWB=IntMapLang.pick(()=>HOST.lang);
    /* (country-analysis-unify) A ROW HERE SAYS WHICH INDICATOR IT PAINTS (`k`) AND WITH WHAT RAMP — nothing else. The
       series, the name and the unit are the indicator's, in js/wb-indicators.js; `_wbInd` reads them in, so every path
       below still finds `code` / `n` / `unit` on the row. A summed series (`parts`) arrives as its array, which is
       what wbSeries sums. */
    const _wbInd=(r)=>{ const I=wbIndicator(r.k); return Object.assign({}, r, { code:I.parts?I.parts.slice():I.code, n:I.n, unit:I.unit||'' }); };
    const WB=[
      /* ══ ⚠ (#R289) ONE LAYER, TWO WAYS OF DIVIDING THE SAME QUANTITY ═══════════════════════════
         「1人当たりCO₂排出レイヤーとCO₂排出量（百万t）レイヤーは一つに統合し、一人当たりにも切り替え
           られる形式に。」 They were two rows painting the same World Bank AR5 series, one divided by
         population and one not, sitting next to each other in 気候・気象 since #R261. A `modes` array
         makes them one row with a switch in its own legend: `V(L)` below resolves the entry to the
         active mode, so every generic path in this file (the ramp key, the hover, the point-value
         contract, the source note) reads the right code, ramp and unit without knowing modes exist.
         ⚠ THE FIRST MODE IS THE DEFAULT, and it is the TOTAL — that is the quantity the layer's own
         name has always meant; per capita is the derived view you switch to. */
      {id:'wbco2', modes:[
        {key:'total', k:'co2t', ramp:[5,'#1a9850',50,'#a6d96a',300,'#fee08b',1500,'#f46d43',10000,'#a50026']},
        {key:'pc',    k:'co2',  ramp:[0,'#1a9850',2,'#a6d96a',5,'#fee08b',10,'#f46d43',20,'#a50026']}]},   /* (#R32) EN.ATM.CO2E.PC was discontinued by the World Bank → the AR5 series */
      {id:'wburb', k:'urban', ramp:[20,'#edf8e9',40,'#bae4b3',60,'#74c476',80,'#31a354',95,'#006d2c']},   /* (#R266) 「都市人口率」と「都市人口比率 %」は同じ SP.URB.TOTL.IN.ZS だった — 色違いの完全な重複。1本に統合 */
      {id:'wbelec', k:'elec', ramp:[20,'#a50026',50,'#f46d43',80,'#fee08b',95,'#a6d96a',100,'#1a9850']},
      {id:'wbhealth', k:'health', ramp:[2,'#fff7ec',4,'#fdd49e',8,'#fc8d59',12,'#d7301f',18,'#7f0000']},
      {id:'wbforest', k:'forest', ramp:[5,'#f6e8c3',20,'#c7eae5',40,'#80cdc1',60,'#35978f',80,'#01665e']},
      {id:'wbrenew', k:'renew', ramp:[5,'#fff7ec',20,'#fdd49e',40,'#a6d96a',60,'#66bd63',85,'#006837']},
      {id:'wbmobile', k:'mobile', ramp:[30,'#fee08b',80,'#a6d96a',110,'#66bd63',140,'#1a9850',180,'#006837']},
      {id:'wbinfl', k:'infl', ramp:[0,'#1a9850',3,'#a6d96a',6,'#fee08b',15,'#f46d43',40,'#a50026']},
      /* (#R33) +16 NEW beta choropleths (World Bank, latest value per country) — "最低20レイヤーをβに追加". */
      {id:'wbinfmort', k:'infmort', ramp:[2,'#1a9850',8,'#a6d96a',25,'#fee08b',50,'#f46d43',90,'#a50026']},
      /* == (#R268) GROWTH IS A SIGNED QUANTITY, SO ITS RAMP IS DIVERGING AND ZERO IS THE HINGE =====
         「GDP成長率レイヤーは0付近は白、正ほど青、負ほど赤色に。」 The old ramp ran red -> yellow ->
         green with its pale stop at +2 %, so a country that shrank by 1 % and a country that grew by
         1 % were two shades of the same warm family and «did this economy grow at all» could not be
         read off the colour. Zero is now white by construction: negative to red, positive to blue,
         symmetric about 0 so -3 % and +3 % are equally strong. */
      {id:'wbgdpgrow', k:'growth', ramp:[-8,'#67001f',-4,'#d6604d',-1.5,'#f4a582',0,'#ffffff',1.5,'#92c5de',4,'#4393c3',8,'#053061']},
      {id:'wblit', k:'lit', ramp:[40,'#a50026',60,'#f46d43',80,'#fee08b',92,'#a6d96a',100,'#1a9850']},
      {id:'wbwater', k:'water', ramp:[30,'#a50026',55,'#f46d43',75,'#fee08b',90,'#a6d96a',100,'#1a9850']},
      {id:'wbsan', k:'san', ramp:[20,'#a50026',45,'#f46d43',70,'#fee08b',90,'#a6d96a',100,'#1a9850']},
      {id:'wbpov', k:'pov', ramp:[0,'#1a9850',2,'#a6d96a',10,'#fee08b',30,'#f46d43',60,'#a50026']},
      {id:'wbgini', k:'gini', ramp:[25,'#1a9850',32,'#a6d96a',38,'#fee08b',45,'#f46d43',60,'#a50026']},
      {id:'wbtrade', k:'trade', ramp:[20,'#fff7ec',50,'#fdd49e',90,'#fc8d59',150,'#d7301f',300,'#7f0000']},
      {id:'wbtax', k:'tax', ramp:[5,'#fff7ec',12,'#fdd49e',20,'#a6d96a',30,'#66bd63',45,'#006837']},
      {id:'wbagri', k:'agri', ramp:[5,'#f6e8c3',25,'#dfc27d',45,'#c7eae5',65,'#80cdc1',85,'#01665e']},
      {id:'wbphys', k:'phys', ramp:[0.1,'#a50026',0.5,'#f46d43',1.5,'#fee08b',3,'#a6d96a',6,'#1a9850']},
      {id:'wbschool', k:'school', ramp:[30,'#a50026',55,'#f46d43',80,'#fee08b',100,'#a6d96a',130,'#1a9850']},
      {id:'wbelecuse', k:'elecuse', ramp:[100,'#fff7ec',1000,'#fdd49e',4000,'#fc8d59',10000,'#d7301f',20000,'#7f0000']},
      {id:'wbrenelec', k:'renelec', ramp:[5,'#fff7ec',25,'#fdd49e',50,'#a6d96a',75,'#66bd63',100,'#006837']},
      {id:'wbfdi', k:'fdi', ramp:[-2,'#a50026',1,'#fee08b',4,'#a6d96a',8,'#66bd63',15,'#006837']},
      {id:'wbmilppl', k:'milppl', ramp:[5000,'#fff7ec',50000,'#fdd49e',200000,'#fc8d59',800000,'#d7301f',2000000,'#7f0000']},
      /* (#R34) +8 more beta choropleths (World Bank) — same resilient mrnev+range fetch, hover values + source note. */
      /* (#R270) 「平均寿命」 is ALSO the name of `beta-dl-lifeexp` in 人口・経済 (the countryStats row
         the master clock drives). Two rows with one name is the ambiguity #R266 was asked to remove
         for 年降水量 — same fix, same wording: the source goes in the name. */
      {id:'wblife', k:'life', ramp:[50,'#a50026',60,'#f46d43',70,'#fee08b',78,'#a6d96a',85,'#1a9850']},
      {id:'wbunemp', k:'unemp', ramp:[2,'#1a9850',5,'#a6d96a',10,'#fee08b',20,'#f46d43',35,'#a50026']},
      {id:'wbnet', k:'net', ramp:[10,'#a50026',30,'#f46d43',55,'#fee08b',80,'#a6d96a',98,'#1a9850']},
      {id:'wbdebt', k:'debt', ramp:[20,'#1a9850',45,'#a6d96a',70,'#fee08b',110,'#f46d43',180,'#a50026']},
      {id:'wbmanuf', k:'manuf', ramp:[5,'#fff7ec',12,'#fdd49e',20,'#fc8d59',28,'#d7301f',40,'#7f0000']},
      {id:'wbu5mort', k:'u5mort', ramp:[3,'#1a9850',10,'#a6d96a',30,'#fee08b',70,'#f46d43',120,'#a50026']},
      {id:'wbpopgrow', k:'popgrow', ramp:[-1,'#2c7fb8',0,'#7fcdbb',1.5,'#ffffb2',3,'#fe9929',5,'#cc4c02']},
      {id:'wbenergy', k:'energy', ramp:[200,'#fff7ec',1000,'#fdd49e',3000,'#fc8d59',6000,'#d7301f',12000,'#7f0000']},
      /* (#R122) +6 NEW beta choropleths (World Bank, latest value per country — same resilient mrnev fetch, hover values + source note). */
      {id:'wbrnd', k:'rnd', ramp:[0.1,'#fff7ec',0.5,'#fdd49e',1.5,'#a6d96a',2.5,'#66bd63',4.5,'#006837']},
      {id:'wbtour', k:'tour', ramp:[500000,'#fff7ec',3000000,'#fdd49e',10000000,'#fc8d59',40000000,'#d7301f',90000000,'#7f0000']},
      {id:'wbref', k:'ref', ramp:[1000,'#fff7ec',20000,'#fee08b',100000,'#fc8d59',500000,'#d7301f',2000000,'#7f0000']},
      {id:'wbpatent', k:'patent', ramp:[10,'#fff7ec',500,'#fdd49e',5000,'#fc8d59',50000,'#d7301f',500000,'#7f0000']},
      {id:'wbwomparl', k:'womparl', ramp:[5,'#a50026',15,'#f46d43',30,'#fee08b',45,'#a6d96a',60,'#1a9850']},
      /* (#R123) +8 NEW beta choropleths (World Bank, latest value per country — same resilient mrnev fetch, hover
         values + source note; auto-wired into the layer list, Others(beta), Atlas layer-data + point sampling). */
      {id:'wbpm25', k:'pm25', ramp:[5,'#1a9850',10,'#a6d96a',25,'#fee08b',50,'#f46d43',100,'#a50026']},
      {id:'wbcook', k:'cook', ramp:[10,'#a50026',40,'#f46d43',70,'#fee08b',90,'#a6d96a',100,'#1a9850']},
      {id:'wbflfp', k:'flfp', ramp:[15,'#a50026',30,'#f46d43',45,'#fee08b',60,'#a6d96a',80,'#1a9850']},
      {id:'wbtert', k:'tert', ramp:[5,'#fff7ec',20,'#fdd49e',40,'#fc8d59',65,'#66bd63',95,'#006837']},
      {id:'wbrural', k:'rural', ramp:[10,'#2c7fb8',30,'#7fcdbb',50,'#ffffb2',70,'#fe9929',90,'#cc4c02']},
      {id:'wbgni', k:'gni', ramp:[1000,'#fff7ec',5000,'#fdd49e',15000,'#fc8d59',40000,'#66bd63',90000,'#006837']},
      {id:'wbunder', k:'under', ramp:[2.5,'#1a9850',10,'#a6d96a',25,'#fee08b',40,'#f46d43',60,'#a50026']},
      {id:'wbhitech', k:'hitech', ramp:[1,'#fff7ec',5,'#fdd49e',15,'#fc8d59',30,'#66bd63',50,'#006837']},
      /* (#R124) +6 more beta choropleths (World Bank, latest value per country — auto-wired like the rest). */
      {id:'wbbbnd', k:'bbnd', ramp:[1,'#a50026',5,'#f46d43',15,'#fee08b',30,'#a6d96a',45,'#1a9850']},
      {id:'wbaging', k:'aging', ramp:[2,'#fff7ec',7,'#fdd49e',14,'#fc8d59',21,'#d7301f',30,'#7f0000']},
      {id:'wbadofert', k:'adofert', ramp:[2,'#1a9850',15,'#a6d96a',40,'#fee08b',80,'#f46d43',130,'#a50026']},
      {id:'wbbeds', k:'beds', ramp:[0.5,'#a50026',2,'#f46d43',4,'#fee08b',8,'#a6d96a',13,'#1a9850']},
      {id:'wbresearch', k:'research', ramp:[50,'#fff7ec',500,'#fdd49e',2000,'#fc8d59',5000,'#66bd63',8000,'#006837']},
      {id:'wboverwt', k:'overwt', ramp:[10,'#1a9850',25,'#a6d96a',40,'#fee08b',55,'#f46d43',70,'#a50026']},
      /* (#R125) +6 more beta choropleths (World Bank, latest value per country — auto-wired like the rest). */
      {id:'wbremit', k:'remit', ramp:[0.5,'#fff7ec',2,'#fdd49e',5,'#fc8d59',12,'#d7301f',25,'#7f0000']},
      {id:'wbsuicide', k:'suicide', ramp:[3,'#1a9850',7,'#a6d96a',12,'#fee08b',20,'#f46d43',30,'#a50026']},
      {id:'wbalcohol', k:'alcohol', ramp:[1,'#fff7ec',4,'#fdd49e',7,'#fc8d59',10,'#d7301f',14,'#7f0000']},
      {id:'wbhomicide', k:'hom', ramp:[1,'#1a9850',3,'#a6d96a',8,'#fee08b',20,'#f46d43',40,'#a50026']},
      /* (#R126) +6 more beta choropleths (World Bank, latest value per country — auto-wired like the rest). */
      {id:'wbmilgdp', k:'mil', ramp:[0.5,'#1a9850',1.5,'#a6d96a',2.5,'#fee08b',4,'#f46d43',8,'#a50026']},
      /* (#R270) …and 「合計特殊出生率」 is also `dl-tfr` in 人口・経済 — same pair, same fix */
      {id:'wbfert', k:'tfr', ramp:[1.2,'#2c7fb8',1.8,'#7fcdbb',2.5,'#ffffb2',4,'#fe9929',6,'#cc4c02']},
      {id:'wbdensity', k:'density', ramp:[5,'#fff7ec',25,'#fdd49e',100,'#fc8d59',300,'#d7301f',1000,'#7f0000']},
      {id:'wbedu', k:'edu', ramp:[2,'#a50026',3,'#f46d43',4.5,'#fee08b',6,'#a6d96a',8,'#1a9850']},
      {id:'wbsmoke', k:'smoke', ramp:[8,'#1a9850',15,'#a6d96a',22,'#fee08b',30,'#f46d43',40,'#a50026']},
      {id:'wbagremp', k:'agremp', ramp:[2,'#fff7ec',10,'#fdd49e',25,'#fc8d59',45,'#d7301f',70,'#7f0000']}
    ].map((L)=>(L.modes?Object.assign({},L,{modes:L.modes.map(_wbInd)}):_wbInd(L)));
    /* ══ (#R289) THE ACTIVE MODE OF A MODAL LAYER ═══════════════════════════════════════════════
       An entry with `modes` is ONE row that can be divided two ways (today: CO₂ total vs per capita).
       `V(L)` returns the entry as the active mode makes it — the same shape every other entry
       already has — so nothing downstream needs to know modes exist. `modes` survives the copy
       because the legend has to be able to draw the switch, and because V(V(L)) must be V(L).
       ⚠ A PLAIN ENTRY IS RETURNED UNCHANGED, not copied: sixty rows go through here on every
       repaint and identity is what the `window['_wbhov_'+fill]` latch and the source cache read. */
    const wbMode={};                    /* id → the active mode key */
    const wbById={}; WB.forEach(L=>{ wbById[L.id]=L; });
    function V(L){ if(!L||!L.modes) return L;
      const k=wbMode[L.id]||L.modes[0].key;
      const m=L.modes.filter(x=>x.key===k)[0]||L.modes[0];
      return { id:L.id, modes:L.modes, mode:m.key, code:m.code, n:m.n, ramp:m.ramp, unit:m.unit }; }
    function wbSetMode(id,key){ const B=wbById[id]; if(!B||!B.modes) return;
      if((wbMode[id]||B.modes[0].key)===key) return;
      wbMode[id]=key;
      /* ⚠ THE YEAR IS DROPPED WITH THE MODE. The two series are different indicators; carrying a
         year across would silently fall back to «latest per country» whenever the new one has no
         such year, which looks identical to a year that was honoured. */
      delete wbYear[id];
      try{ const sp=document.querySelector('#lyrrow-'+id+' .bx-name'); if(sp) sp.textContent=bxLabel(B); }catch(_){}
      choroOn(B); }
    /* (#R32) Hover tooltip for every beta choropleth ("ホバーして数値が出るように") — reuses the shared map
       tooltip so it matches HDI/pop. Shows the country name, the metric and its value. */
    /* ══ ⚠⚠⚠ (#R270) THE KEY WAS A STAIRCASE FOR A LAYER THAT PAINTS A GRADIENT ═══════════════════
       「GDP成長率レイヤーの色は段彩ではなく、他レイヤーと同じようにグラデーションに。」

       MEASURED on the built site: `wbgdpgrow-fill` paints
       `['interpolate',['linear'],['get','v'], -8,#67001f, … , 8,#053061]` — a CONTINUOUS ramp, as
       every layer in this file does — while its key drew seven discrete chips, one per stop. So the
       key said 段彩 about a layer that is not 段彩, and a country at −6 % had a colour that appeared
       nowhere in its own legend. Every other choropleth in this app (HDI, GDP per capita, population
       density, fertility, military spending — js/data-layers.js `makeLegend`) draws a
       `linear-gradient` bar, which is what 「他レイヤーと同じように」 names.

       ⚠ THE STOPS ARE PLACED BY VALUE, NOT SPREAD EVENLY. `interpolate` is linear in the VALUE, so a
       bar whose stops sit at equal fractions would be a different picture from the map wherever the
       ramp is unevenly spaced — which is most of them (0 / 2 / 5 / 10 / 20 t of CO₂). Positioning
       each stop at (v − lo)/(hi − lo) makes the bar and the map the same function.
       ⚠ AND THE WHOLE FAMILY GETS IT, not just the one layer named: these sixty-odd rows share this
       one builder, and fixing the reported layer alone would leave GDP growth the only World-Bank
       choropleth whose key is a gradient — a new inconsistency in place of the old one. */
    const _kFmt=(v,unit)=>{ const a=Math.abs(v);
      const n=a>=1e9?((v/1e9)+'B'):a>=1e6?((v/1e6)+'M'):a>=1e4?((v/1e3)+'k'):String(v);
      return n+(unit||''); };
    function rampKey(L){
      const r=L.ramp, lo=r[0], hi=r[r.length-2], span=(hi-lo)||1;
      const at=(v)=>Math.max(0,Math.min(100,(v-lo)/span*100));
      const stops=[]; for(let i=0;i<r.length;i+=2) stops.push(r[i+1]+' '+at(r[i]).toFixed(2)+'%');
      /* at most five ticks, always including both ends and (for a diverging ramp) the hinge */
      const idx=[]; const n=r.length/2;
      for(let i=0;i<n;i++) idx.push(i);
      let show=idx;
      if(n>5){ show=[0]; const step=(n-1)/4; for(let k=1;k<4;k++) show.push(Math.round(k*step)); show.push(n-1);
        show=show.filter((v,i,a2)=>a2.indexOf(v)===i); }
      const ticks=show.map(i=>{ const v=r[i*2], p=at(v);
        const tr=(p<=1)?'translateX(0)':(p>=99)?'translateX(-100%)':'translateX(-50%)';
        return '<span style="position:absolute;left:'+p.toFixed(2)+'%;transform:'+tr+';white-space:nowrap;">'+HOST.escapeHtml(_kFmt(v,L.unit))+'</span>'; }).join('');
      return '<div style="height:10px;border-radius:5px;border:1px solid var(--glass-border,rgba(128,128,128,0.22));'
        +'background:linear-gradient(90deg,'+stops.join(',')+');"></div>'
        +'<div style="position:relative;height:13px;margin-top:3px;font-variant-numeric:tabular-nums;">'+ticks+'</div>';
    }
    /* ⚠ (#R289) THE HANDLER IS WIRED ONCE AND THE LAYER CAN CHANGE MODE UNDER IT, so it re-resolves
       the entry on every move instead of closing over the one that happened to paint it first. */
    function _wbHover(L0,fill){ if(window['_wbhov_'+fill]) return; window['_wbhov_'+fill]=true;
      const L=()=>V(wbById[L0.id]||L0);
      const fmt=(v)=>{ if(v==null) return '—'; const a=Math.abs(v); const r=(a>=100?Math.round(v):Math.round(v*10)/10); return r+(L().unit||''); };
      GE().events.onLayer('mousemove',fill,(e)=>{ if(!e.features||!e.features.length) return; GE().render.canvas().style.cursor='pointer'; const p=e.features[0].properties||{};
        try{ const el=window.ensureMapTooltip(); window.showMapTooltip(el); window.setMapTooltipHTML(el,'<div style="font-weight:600;">'+(p.nm||'')+'</div><div style="color:var(--text-muted);font-size:11px;margin-top:2px;">'+(bxLabel(L()))+'</div><div style="font-weight:700;margin-top:3px;">'+fmt(p.v)+'</div>'); window.positionTooltip(e.point); }catch(_){} });
      GE().events.onLayer('mouseleave',fill,()=>{ GE().render.canvas().style.cursor=''; try{ const el=window.ensureMapTooltip(); window.hideMapTooltip(el); }catch(_){} });
    }
    const _nmOf=(p)=>{ p=p||{}; return p.NAME_EN||p.ADMIN||p.name_en||p.NAME||p.name||p.NAME_LONG||p.ADM0_A3||''; };
    /* (#R37) IMF WEO (Oct 2024) GENERAL government gross debt, % of GDP — a broad, authoritative fallback for the
       Govt-debt layer, whose World-Bank series (GC.DOD.TOTL.GD.ZS = CENTRAL government debt) is reported by only
       ~half the world ("データのない国が多すぎる"). Merged ONLY where the World Bank has no value, and source-noted.
       This mirrors how HDI / Democracy / military-spend are embedded real datasets. Genuinely unreported states
       are omitted (they stay gray) rather than fabricated. */
    const DEBT_IMF_GG={JPN:251,GRC:159,ITA:135,USA:121,SGP:175,FRA:111,ESP:105,BEL:105,CAN:107,PRT:99,GBR:101,CYP:73,AUT:78,SVN:67,HUN:74,DEU:64,FIN:77,IRL:43,NLD:47,SWE:34,DNK:30,NOR:42,CHE:38,POL:55,CZE:45,SVK:59,HRV:62,ROU:52,BGR:24,EST:22,LVA:45,LTU:38,LUX:27,ISL:61,MLT:50,
      MEX:53,BRA:85,ARG:155,CHL:41,COL:55,PER:34,URY:62,ECU:55,BOL:84,PRY:40,PAN:54,CRI:63,DOM:60,SLV:73,GTM:28,HND:51,JAM:72,
      CHN:88,IND:83,IDN:39,KOR:55,THA:64,MYS:67,PHL:57,VNM:35,PAK:71,BGD:39,LKA:108,NPL:48,KHM:36,MMR:60,MNG:46,
      SAU:27,ARE:30,ISR:62,TUR:35,IRN:34,IRQ:44,EGY:96,JOR:89,QAT:45,KWT:8,OMN:36,BHR:122,LBN:150,YEM:78,
      ZAF:75,NGA:46,MAR:70,TUN:80,KEN:70,GHA:84,AGO:85,ETH:37,ZMB:113,MOZ:92,CIV:58,SEN:81,CMR:43,UGA:50,TZA:47,COD:21,SDN:152,NAM:66,BWA:24,MUS:80,
      AUS:50,NZL:46,FJI:80,RUS:20,UKR:88,KAZ:24,UZB:35,GEO:39,ARM:50,AZE:22,BLR:42,SRB:48,MKD:52,ALB:59,BIH:30,MNE:64,MDA:36};
    /* ══ (#R266) WHICH YEAR THIS LAYER IS PAINTING ═════════════════════════════════════════════════
       `undefined` = «the series' own default» (wbSeries.best — the most recent year that still has
       essentially full coverage); a year string = that year; '' = the old latest-per-country map,
       kept because for a survey indicator reported once a decade it is the only mode that fills the
       map — but it is no longer the default, because 「同一年度で比較しないと意味がない」. */
    const wbYear={};
    /* ══ (world-at-time) THE YEAR IS THE CLOCK'S ══════════════════════════════════════════════════════
       MEASURED (2026-10-01): with Chronos at 1914 every one of these 61 rows painted its own default year —
       2023 values on a 1914 map — because the year was this file's own (`wbYear`, a picker of its own) and
       nothing here read the clock. docs/architecture/07-map.md §7.4 already says a row keeps no year of its
       own (「行は自分の年を持たない」, the rule the other choropleths follow through `_legendClockYear`).
       ⇒ Off the live clock, the year painted is the clock's year; the years the fetched series holds are
       reported to js/layer-time-kernel.js, which holds a row back (and says why) when the clock is before
       them. After the last year the series holds, that last year is carried and the legend names it.
       On the live clock nothing changes: the series' own default, or the reader's «latest per country». */
    function clockYear(){ try{ const T=IntMapTime; return (T&&!T.isLive())?String(T.year()):null; }catch(_){ return null; } }
    function yearFor(L,S){ const cy=clockYear();
      if(cy==null) return (wbYear[L.id]!==undefined)?wbYear[L.id]:((S&&S.best)||'');
      if(!S||!S.years.length) return cy;
      const last=S.years[S.years.length-1];
      return (+cy>+last)?last:cy; }
    const wbOn=new Set();
    try{ IntMapTime.on(()=>{ wbOn.forEach(id=>{ const B=wbById[id]; if(B) choroOn(B); }); }); }catch(_){}
    /* (map-layer-system) returns a promise that settles when the paint has been done (or given up) — the row's request */
    function choroOn(L){ let fin; const done=new Promise((r)=>{ fin=r; }); wbOn.add(L.id); L=V(L); ensureGeo(geo=>{ if(!geo){ fin(); return; }
      /* (unobserved-is-not-refused) a host silent through every retry is LATE, not empty: say so and paint nothing,
         rather than a map of grey «no data» countries; nothing was cached, so switching it on again reads again */
      const LATE={};
      wbSeries(L.code).catch(e=>{ if(!isUnobserved(e)) throw e; try{ if(typeof imToast==='function') imToast(IntMapLang.t(HOST.lang,'The data did not arrive in time — try again','データが時間内に届きませんでした — もう一度お試しください')); }catch(_){} return LATE; }).then(S=>{ if(S===LATE) return;
      const key=_wbKey(L.code);
      const year=yearFor(L,S);
      try{ const LT=window.IntMapLayerTime; if(LT&&S&&S.years.length) LT.range('bx-'+L.id,{ from:S.years[0], to:S.years[S.years.length-1], by:'World Bank API '+_wbKey(L.code) }); }catch(_){}
      let m;
      if(S&&year&&S.by[year]){ m={}; const row=S.by[year]; Object.keys(row).forEach(k=>{ m[k]={v:row[k],y:year}; }); }
      else m=wbCache[key]||{};
      /* (#R37) Paint EVERY country, not only the ones WITH data: countries the World Bank has no value for now
         carry NO `v` property and are rendered NEUTRAL GRAY (like the core HDI/pop choropleths), instead of
         showing nothing ("レイヤーにおいて、データのない国は灰色にするように" + "Govt Debt にデータのない国が多すぎる"
         — the gray makes the real coverage gaps honest and visible rather than invisible). */
      /* ⚠ (#R266) the IMF gap-fill is a 2024 FIGURE. Painting it onto a 2005 map would be a made-up
         number in a year it was never reported, so it applies only to the latest-per-country mode and
         to 2024 itself — every other year shows the World Bank's own coverage, gaps included. */
      if((L.base||L.id)==='wbdebt'&&(!year||year==='2024')){ try{ Object.keys(DEBT_IMF_GG).forEach(k=>{ if(!(m[k]&&m[k].v!=null)) m[k]={v:DEBT_IMF_GG[k],y:'2024',imf:true}; }); }catch(_){} }
      const feats=[]; let withData=0; geo.features.forEach(f=>{ const d=m[iso(f.properties||{})]; const props={nm:_nmOf(f.properties)}; if(d&&d.v!=null){ props.v=d.v; withData++; } feats.push({type:'Feature',geometry:f.geometry,properties:props}); });
      if(!withData&&!S){ try{ if(typeof imToast==='function') imToast(IntMapLang.t(HOST.lang,"No data right now — please try again in a moment.","データを取得できませんでした。少し待って再試行してください。","Derzeit keine Daten — bitte gleich erneut versuchen.","Сейчас данных нет — попробуйте через мгновение.","Ahora mismo no hay datos; inténtelo en un momento.")); }catch(_){} }
      const fc={type:'FeatureCollection',features:feats}, src='src-'+L.id, fill=L.id+'-fill', line=L.id+'-line';
      try{ if(GE().layers.hasSource(src)) GE().layers.setSourceData(src,fc); else { GE().layers.addSource(src,{type:'geojson',data:fc});
        GE().layers.add({id:fill,type:'fill',source:src,paint:{'fill-color':['case',['has','v'],['interpolate',['linear'],['get','v']].concat(L.ramp),'#9aa0a6'],'fill-opacity':['case',['has','v'],0.62,0.42]}});
        GE().layers.add({id:line,type:'line',source:src,paint:{'line-color':'rgba(0,0,0,0.16)','line-width':0.3}}); _wbHover(L,fill); } }catch(_){}
      /* ⚠ (#R289) THE RAMP IS RE-ASSERTED, NOT ONLY SET AT CREATION. A modal layer changes its
         scale when it changes mode (0–20 t per head, 5–10,000 Mt in total), and the branch above
         only paints on the FIRST switch-on — so without this the map would draw megatonnes through
         the per-capita ramp and every country past 20 Mt would be the same dark red. Idempotent
         for the fifty-odd entries that have one ramp for ever. */
      try{ if(GE().layers.has(fill)) GE().layers.setPaint(fill,'fill-color',['case',['has','v'],['interpolate',['linear'],['get','v']].concat(L.ramp),'#9aa0a6']); }catch(_){}
      const cb=document.getElementById('bx-'+L.id), on=cb?cb.checked:true;
      [fill,line].forEach(id=>{ try{ if(GE().layers.has(id)) GE().layers.setLayout(id,'visibility',on?'visible':'none'); }catch(_){} });
      try{ if(on&&window._registerLayerOpacity){ const el=window._registerLayerOpacity(L.id,L.n,[fill,line],'bx-'+L.id); if(el){ let kk=el.querySelector('.bx-key'); if(!kk){ kk=document.createElement('div'); kk.className='bx-key'; kk.style.cssText='margin-top:6px;font-size:10px;color:var(--text-muted);'; el.appendChild(kk); } kk.innerHTML=rampKey(L);
        /* ── (#R289) the mode switch, for an entry that has one. Built once and only its selected
              state re-set, for the same reason the year <select> is: this whole block re-runs on
              every repaint and rebuilding the control would move it under the finger pressing it. ── */
        if(L.modes){ let mr=el.querySelector('.bx-moderow');
          if(!mr){ mr=document.createElement('div'); mr.className='bx-moderow';
            mr.style.cssText='display:flex;gap:5px;margin-top:7px;';
            mr.innerHTML=L.modes.map(m=>'<button type="button" class="bx-mode" data-k="'+m.key+'" style="flex:1;min-width:0;border:1px solid rgba(128,128,128,0.3);border-radius:7px;padding:4px 6px;font-size:10.5px;font-weight:600;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></button>').join('');
            el.insertBefore(mr,kk);
            mr.addEventListener('click',(ev)=>{ const b=ev.target.closest('.bx-mode'); if(b&&mr.contains(b)) wbSetMode(L.id,b.getAttribute('data-k')); }); }
          /* the button says WHAT IT WILL SHOW — the mode's own name, which is the name the row
             carries while that mode is on. No second table of words to go stale. */
          mr.querySelectorAll('.bx-mode').forEach(b=>{ const k=b.getAttribute('data-k');
            const m=L.modes.filter(x=>x.key===k)[0]; if(m) b.textContent=LWB.arr(m.n);
            const act=(k===L.mode);
            b.style.background=act?'var(--primary-fill)':'var(--input-bg)';
            b.style.color=act?'#fff':'var(--text-main)';
            b.setAttribute('aria-pressed',act?'true':'false'); }); }
        /* ── the year picker. Built once, then only its VALUE is set: rebuilding the <select> on every
              repaint would close the dropdown under the finger that just opened it. ── */
        if(S){ let yr=el.querySelector('.bx-yearrow');
          if(!yr){ yr=document.createElement('div'); yr.className='bx-yearrow'; yr.style.cssText='display:flex;align-items:center;gap:6px;margin-top:6px;font-size:10.5px;color:var(--text-muted);';
            yr.innerHTML='<label style="display:contents;"><span class="bx-yearlbl"></span><select class="bx-year" style="padding:2px 5px;border-radius:6px;border:1px solid var(--glass-border,rgba(128,128,128,0.25));background:var(--input-bg);color:var(--text-main);font-size:10.5px;"></select></label>';
            el.appendChild(yr);
            yr.querySelector('.bx-year').addEventListener('change',(e)=>{ const v=e.target.value;
              /* (world-at-time) a year chosen here is the MAP's year — it moves the one clock, and every layer
                 follows it. «Latest per country» is not a year: it returns the clock to now and keeps the mode. */
              if(v===''){ wbYear[L.id]=''; try{ IntMapTime.setNow({source:'ui'}); }catch(_){} choroOn(L); }
              else { delete wbYear[L.id]; try{ IntMapTime.setYear(+v,{source:'ui'}); }catch(_){ wbYear[L.id]=v; choroOn(L); } } }); }
          yr.querySelector('.bx-yearlbl').textContent=IntMapLang.t(HOST.lang,'Year','年','Jahr','Год','Año');
          const sel=yr.querySelector('.bx-year');
          const latestTxt=IntMapLang.t(HOST.lang,'Latest per country','最新（国ごと）','Neuester je Land','Последний по стране','Más reciente por país');
          const opts=S.years.slice().reverse().map(y=>'<option value="'+y+'">'+y+' ('+S.counts[y]+')</option>').join('')
            +'<option value="">'+HOST.escapeHtml(latestTxt)+'</option>';
          if(sel.getAttribute('data-built')!==String(S.years.length)){ sel.innerHTML=opts; sel.setAttribute('data-built',String(S.years.length)); }
          sel.value=year;
        }
        /* (#R34) State the DATA SOURCE + PERIOD on every World Bank choropleth ("Inflation % (CPI)→データの
           出典と時期を記載しろ"). (#R266) …and WHICH year is on the map, with how many countries reported it,
           so «the colours are comparable» is a statement the legend actually supports. */
        let ysp='', mode='';
        if(year&&S&&S.counts[year]){ ysp=year;
          mode=(IntMapLang.t(HOST.lang,' · ','・',' · ',' · ',' · '))+S.counts[year]+(IntMapLang.t(HOST.lang,' countries reporting','か国が報告',' Länder mit Daten',' стран с данными',' países con datos')); }
        else { let yrs=[]; try{ yrs=Object.values(m).map(d=>+d.y).filter(isFinite); }catch(_){} if(yrs.length){ const a=Math.min.apply(null,yrs),b=Math.max.apply(null,yrs); ysp=(a===b)?(''+a):(a+'–'+b); }
          mode=IntMapLang.t(HOST.lang," · most recent value per country","（国ごとに最新値）"," · jeweils neuester Wert je Land"," · последнее значение по каждой стране"," · valor más reciente por país"); }
        let nn=el.querySelector('.bx-note'); if(!nn){ nn=document.createElement('div'); nn.className='bx-note'; nn.style.cssText='font-size:9.5px;color:var(--text-muted);margin-top:5px;line-height:1.4;'; el.appendChild(nn); }
        nn.textContent=(IntMapLang.t(HOST.lang,"Source: World Bank · ","出典: 世界銀行 · ","Quelle: Weltbank · ","Источник: Всемирный банк · ","Fuente: Banco Mundial · "))+(Array.isArray(L.code)?L.code.join(' + '):L.code)+(ysp?(' · '+ysp):'')+mode+(((L.base||L.id)==='wbdebt'&&(!year||year==='2024'))?(IntMapLang.t(HOST.lang," + IMF WEO general govt gross debt (gap-fill)"," ＋ IMF WEO（一般政府総債務）で補完"," + IWF WEO Bruttoschuldenstand des Staates (Lückenfüllung)"," + МВФ WEO, валовой долг сектора госуправления (заполнение пробелов)"," + FMI WEO deuda bruta del gobierno general (relleno de huecos)")):''); } } }catch(_){}
    }).then(fin,fin); }); return done; }
    function choroOff(L){ wbOn.delete(L.id); [L.id+'-fill',L.id+'-line'].forEach(id=>{ try{ if(GE().layers.has(id)) GE().layers.setLayout(id,'visibility','none'); }catch(_){} }); try{ window._hideGenericLegend&&window._hideGenericLegend(L.id); }catch(_){} }

    /* ══ (map-layer-system) THE INDICATOR BROWSER — ONE ROW, EVERY COUNTRY INDICATOR ══════════════════════════════
       The sixty-odd rows above are one family read by one reader (wbSeries), filed across eleven shelves, and four of
       them paint a series another row also paints. A reader looking for «how many doctors per head» had to know which
       shelf a World Bank series had been filed on. This row is that family as ONE layer: the indicator is chosen inside
       it (search, subject — the subject is the shelf the indicator's own row stands on, read from js/layer-manifest.js,
       never a second taxonomy), and it paints through `choroOn` exactly as the row it stands for does — the same series,
       the same year rule (the clock's), the same ramp, legend, year picker, hover and point value. So the browser cannot
       disagree with the row: it IS that row's painter, pointed at another source id.
       ⚠ THE ENTRIES ARE THE TABLE, NOT A COPY. `indicatorEntries()` reads WB (a two-way row gives one entry per mode);
       the rows that measure the same series elsewhere (js/layers/<id>.js `measures`) and the country-statistics rows
       that this reader does not paint are joined by js/indicator-browser.js from the manifest. */
    const IND={ cur:null, view:null };
    const IND_NAME=LA('Country indicators','国別指標');
    function indicatorEntries(){ const out=[];
      WB.forEach(L=>{ if(L.modes) L.modes.forEach(m=>out.push({ id:L.id+':'+m.key, row:'bx-'+L.id, base:L.id, mode:m.key, code:m.code, key:_wbKey(m.code), n:m.n, unit:m.unit, ramp:m.ramp.slice() }));
        else out.push({ id:L.id, row:'bx-'+L.id, base:L.id, mode:null, code:L.code, key:_wbKey(L.code), n:L.n, unit:L.unit, ramp:L.ramp.slice() }); });
      return out; }
    function indPaint(id){ const e=indicatorEntries().find(x=>x.id===id); if(!e) return false;
      wbById.wbind={ id:'wbind', base:e.base, code:e.code, n:e.n, ramp:e.ramp, unit:e.unit };
      IND.cur=e.id; delete wbYear.wbind;
      /* the year list is the SERIES' — a new indicator has other years and other counts, so the picker is rebuilt */
      try{ const s=document.querySelector('#data-legend-wbind .bx-year'); if(s) s.removeAttribute('data-built'); }catch(_){}
      const req=choroOn(wbById.wbind);
      /* the paint (the series read and the country shapes it waits for) is this row's request: handed to js/layer-rows.js `layerInflight`, so the layer-state audit waits for it
         instead of reading «ticked and blank» while it is in flight (measured: the look 2.8 s after the tick pulsed the row
         off→on while the series was still arriving, and the pulse dropped the reader's choice). */
      try{ layerInflight.track('bx-wbind',req); }catch(_){}
      return true; }
    /* ⚠ the layer-state audit (js/data-layers.js `_imAuditReg`) re-fires a ticked row whose style layers are not
       visible; while the browser hands a country-table statistic to its own row, this row paints nothing on purpose,
       so its claim on wbind-fill/-line is withdrawn until it paints again (choroOn registers it anew) */
    function indClear(){ IND.cur=null; delete wbById.wbind; wbOn.delete('wbind'); try{ if(window._imAuditReg) delete window._imAuditReg['bx-wbind']; }catch(_){}
      ['wbind-fill','wbind-line'].forEach(id=>{ try{ if(GE().layers.has(id)) GE().layers.setLayout(id,'visibility','none'); }catch(_){} }); }
    let _indMod=null;
    function indBrowser(){ if(!_indMod) _indMod=import('./indicator-browser.js').then(m=>m.makeIndicatorBrowser({
        lang:()=>HOST.lang, entries:indicatorEntries, paint:indPaint, clear:indClear, current:()=>IND.cur,
        series:(code)=>wbSeries(code), seriesOf:(code)=>wbSeriesCache[_wbKey(code)]||null, yearOf:(code)=>{ const S=wbSeriesCache[_wbKey(code)]||null; return yearFor({id:'wbind'},S); },
        name:(n)=>LWB.arr(n), countryName:(iso)=>{ try{ const s=countryStats&&countryStats[iso]; if(s) return (HOST.lang==='jp'?(s.nameJp||s.nameEn):s.nameEn)||iso; }catch(_){} return iso; },
        wanted:()=>{ const w=IND.want; IND.want=null; return w||null; },
        /* while a country-table statistic is drawn by its own row, THIS row's drawing is that row's layers — said to the
           layer-state audit (js/data-layers.js `_imAuditReg`, the table it reads first), so a row that is meant to paint
           nothing of its own is not read as «ticked and blank» and pulsed off→on (measured: 1 run in 11 lost its choice) */
        delegated:(rowId)=>{ try{ const A=window.IntMapLayerAudit, reg=(window._imAuditReg=window._imAuditReg||{});
          const ids=(rowId&&A&&A.owned)?A.owned(rowId):[]; if(ids.length) reg['bx-wbind']=ids; else delete reg['bx-wbind']; }catch(_){} },
        legend:()=>{ try{ return window._registerLayerOpacity?window._registerLayerOpacity('wbind',IND_NAME,IND.cur?['wbind-fill','wbind-line']:[],'bx-wbind'):null; }catch(_){ return null; } },
        hideLegend:()=>{ try{ window._hideGenericLegend&&window._hideGenericLegend('wbind'); }catch(_){} },
        escape:(s)=>HOST.escapeHtml(s) })).then(b=>{ try{ window.IntMapIndicators=b; }catch(_){} return b; });
      return _indMod; }
    /* the chosen indicator travels in a share link (`wbind`), beside the row's own tick in `l=` */
    try{ window.IntMapShareState&&window.IntMapShareState.register('wbind',{
      get(){ return IND.cur?{ i:IND.cur }:null; },
      set(v){ if(!v||!v.i) return; IND.want=String(v.i);
        const cb=document.getElementById('bx-wbind');
        if(cb&&!cb.checked){ cb.checked=true; cb.dispatchEvent(new Event('change',{bubbles:true})); }
        else if(cb&&cb.checked) indBrowser().then(b=>b.select(IND.want)).catch(()=>{}); } }); }catch(_){}
    function indOn(){ return indBrowser().then(b=>b.open()).catch(()=>{ try{ if(typeof imToast==='function') imToast(IntMapLang.t(HOST.lang,'The indicator browser could not be loaded','指標ブラウザを読み込めませんでした')); }catch(_){} }); }
    function indOff(){ indClear(); try{ window._hideGenericLegend&&window._hideGenericLegend('wbind'); }catch(_){} if(_indMod) _indMod.then(b=>b.closed()).catch(()=>{}); }

    /* ---------- Earthquakes (USGS realtime feed + historical query) ---------- */
    let eqWin='week', eqClickWired=false;
    function eqUrl(){ if(eqWin==='year') return 'https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime='+new Date(Date.now()-365*864e5).toISOString().slice(0,10)+'&minmagnitude=6&orderby=time&limit=2000';
      return 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/'+({day:'all_day',week:'all_week',month:'4.5_month'}[eqWin]||'all_week')+'.geojson'; }
    function eqOn(){ fetch(eqUrl()).then(r=>r.json()).then(j=>{ const src='src-eq';
      try{ if(GE().layers.hasSource(src)) GE().layers.setSourceData(src,j); else { GE().layers.addSource(src,{type:'geojson',data:j});
        GE().layers.add({id:'eq-pt',type:'circle',source:src,paint:{'circle-radius':['interpolate',['linear'],['get','mag'],1,2.5,4,6,6,12,8,22],'circle-color':['interpolate',['linear'],['get','mag'],1,'#ffd24d',3,'#ff9500',5,'#ff3b30',7,'#7a0010'],'circle-opacity':0.78,'circle-stroke-color':'rgba(255,255,255,0.6)','circle-stroke-width':0.4}}); } }catch(_){}
      const cb=document.getElementById('bx-eq'), on=cb?cb.checked:true; try{ if(GE().layers.has('eq-pt')) GE().layers.setLayout('eq-pt','visibility',on?'visible':'none'); }catch(_){}
      if(!eqClickWired){ eqClickWired=true; try{ GE().events.onLayer('click','eq-pt',(e)=>{ const p=(e.features&&e.features[0]&&e.features[0].properties)||{}; const when=p.time?new Date(+p.time).toLocaleString():'';
        /* (#R32) className 'plc-popup' → themed dark/light bg + readable text. The default white maplibre popup
           inherited the page text color (near-white in dark mode) = white-on-white "ポップアップがダークモードで
           は見えない". */
        /* ⚠ (#R546) THE EVENT ID IS NOT `e.features[0].id`. A geojson source only carries feature ids
           maplibre can use when they are numeric or `promoteId` is set, and USGS ids are strings; the
           catalogue does hand every event its network and code, and `net+code` IS the id every USGS
           URL is built from (measured: nc + 72282711 → nc72282711). `ids` is the fallback for a feed
           row that carries the merged list instead. */
        const eid=((p.net||'')+(p.code||''))||String(p.ids||'').split(',').filter(Boolean)[0]||'';
        GE().ui.attach(GE().ui.popup({closeButton:true,className:'plc-popup'}).setLngLat(e.lngLat).setHTML('<div style="font-size:12.5px;line-height:1.5;color:var(--text-main);"><b style="color:#ff453a;">M '+(p.mag!=null?(+p.mag).toFixed(1):'?')+'</b><br>'+IntMapSafe.html(p.place||'')+'<br><span style="color:var(--text-muted);">'+when+'</span>'+(eid?('<br><button data-shk-open="'+IntMapSafe.html(eid)+'" style="margin-top:6px;border:1px solid rgba(128,128,128,0.3);background:var(--input-bg);color:var(--text-main);border-radius:7px;padding:4px 9px;font-size:11px;font-weight:600;cursor:pointer;">'+IntMapSafe.html(IntMapLang.t(HOST.lang,"Ground shaking (ShakeMap)","揺れの分布（ShakeMap）","Bodenerschütterung (ShakeMap)","Сотрясения грунта (ShakeMap)","Sacudida del suelo (ShakeMap)"))+'</button>'):'')+'</div>')); }); GE().events.onLayer('mouseenter','eq-pt',()=>{ GE().render.canvas().style.cursor='pointer'; }); GE().events.onLayer('mouseleave','eq-pt',()=>{ GE().render.canvas().style.cursor=''; });
        /* ONE delegated listener for every popup this layer will ever open — a popup's DOM is rebuilt
           on each click, so a handler bound to the button would have to be re-bound every time. */
        document.addEventListener('click',(ev)=>{ const b=ev.target&&ev.target.closest&&ev.target.closest('[data-shk-open]'); if(!b) return;
          const id=b.getAttribute('data-shk-open'); b.disabled=true;
          Promise.resolve().then(()=>window.IntMapLazy.need('shakeMap')).then(()=>window.IntMapShakeMap.show(id))
            .catch(err=>{ try{ b.disabled=false; if(typeof imToast==='function') imToast(err&&err.code==='NO_SHAKEMAP'
              ? IntMapLang.t(HOST.lang,"USGS published no ShakeMap for this earthquake","この地震について USGS は ShakeMap を公開していません","Für dieses Beben hat USGS keine ShakeMap veröffentlicht","Для этого землетрясения USGS не публиковал ShakeMap","El USGS no publicó un ShakeMap para este sismo")
              : IntMapLang.t(HOST.lang,"Could not load the ShakeMap","ShakeMap を取得できませんでした","ShakeMap konnte nicht geladen werden","Не удалось загрузить ShakeMap","No se pudo cargar el ShakeMap")); }catch(_){} }); }); }catch(_){} }
      try{ if(on&&window._registerLayerOpacity){ const el=window._registerLayerOpacity('eq',LA('Earthquakes (USGS)','地震（USGS）','Erdbeben (USGS)','Землетрясения (USGS)','Terremotos (USGS)'),['eq-pt'],'bx-eq');
        if(el){ let ctl=el.querySelector('.bx-eqwin'); if(!ctl){ ctl=document.createElement('div'); ctl.className='bx-eqwin'; ctl.style.cssText='display:flex;gap:5px;flex-wrap:wrap;margin-top:6px;'; el.appendChild(ctl); }
          const opts=[['day',IntMapLang.t(HOST.lang,"24h","24時間","24 h","24 ч","24 h")],['week',IntMapLang.t(HOST.lang,"7d","7日","7 T","7 дн","7 d")],['month',IntMapLang.t(HOST.lang,"30d M4.5+","30日(M4.5+)","30 T M4,5+","30 дн M4.5+","30 d M4,5+")],['year',IntMapLang.t(HOST.lang,"1yr M6+","1年(M6+)","1 J M6+","1 год M6+","1 año M6+")]];
          ctl.innerHTML=opts.map(o=>'<button data-w="'+o[0]+'" style="border:1px solid rgba(128,128,128,0.3);background:'+(eqWin===o[0]?'var(--primary-fill)':'var(--input-bg)')+';color:'+(eqWin===o[0]?'#fff':'var(--text-main)')+';border-radius:7px;padding:4px 7px;font-size:10.5px;font-weight:600;cursor:pointer;">'+o[1]+'</button>').join('');
          ctl.querySelectorAll('button').forEach(b=>b.onclick=()=>{ eqWin=b.getAttribute('data-w'); eqOn(); }); } } }catch(_){}
    }).catch(()=>{ try{ if(typeof imToast==='function') imToast(IntMapLang.t(HOST.lang,"Could not load earthquake data","地震データを取得できませんでした","Erdbebendaten konnten nicht geladen werden","Не удалось загрузить данные о землетрясениях","No se pudieron cargar los datos sísmicos")); }catch(_){} }); }
    function eqOff(){ try{ if(GE().layers.has('eq-pt')) GE().layers.setLayout('eq-pt','visibility','none'); }catch(_){} try{ window._hideGenericLegend&&window._hideGenericLegend('eq'); }catch(_){} }

    /* ---------- Heat of Attention (news-density heatmap) ---------- */
    function heatPts(){ const pts=[]; try{ (window.newsFeatures||[]).forEach(f=>{ if(f&&f.geometry&&f.geometry.coordinates) pts.push({type:'Feature',geometry:{type:'Point',coordinates:f.geometry.coordinates},properties:{}}); }); }catch(_){}
      if(pts.length<5){ try{ const list=(typeof computeFilteredNews==='function')?computeFilteredNews():[]; list.forEach(it=>{ const a=it&&it.analysis; if(a&&a.loc) pts.push({type:'Feature',geometry:{type:'Point',coordinates:a.loc},properties:{}}); }); }catch(_){} }
      return {type:'FeatureCollection',features:pts}; }
    function heatOn(){ const fc=heatPts(), src='src-heat';
      try{ if(GE().layers.hasSource(src)) GE().layers.setSourceData(src,fc); else { GE().layers.addSource(src,{type:'geojson',data:fc});
        GE().layers.add({id:'heat-h',type:'heatmap',source:src,paint:{'heatmap-intensity':1.1,'heatmap-radius':['interpolate',['linear'],['zoom'],1,18,4,42],'heatmap-opacity':0.72,'heatmap-color':['interpolate',['linear'],['heatmap-density'],0,'rgba(0,0,255,0)',0.2,'#3b82f6',0.4,'#22c55e',0.6,'#eab308',0.8,'#f97316',1,'#ef4444']}}); } }catch(_){}
      const cb=document.getElementById('bx-heat'), on=cb?cb.checked:true; try{ if(GE().layers.has('heat-h')) GE().layers.setLayout('heat-h','visibility',on?'visible':'none'); }catch(_){}
      try{ if(on&&window._registerLayerOpacity){ const el=window._registerLayerOpacity('heat',LA('Heat of Attention','注目度ヒートマップ','Aufmerksamkeits-Heatmap','Карта внимания','Mapa de calor de atención'),['heat-h'],'bx-heat'); if(el){ let h=el.querySelector('.bx-note'); if(!h){ h=document.createElement('div'); h.className='bx-note'; h.style.cssText='font-size:10px;color:var(--text-muted);margin-top:5px;line-height:1.4;'; el.appendChild(h);} h.textContent=IntMapLang.t(HOST.lang,'Estimated from world news density (approximate)','世界のニュース密度から推定（概算）','Geschätzt aus der weltweiten Nachrichtendichte (näherungsweise)','Оценка по плотности мировых новостей (приблизительно)','Estimado a partir de la densidad de noticias mundiales (aproximado)'); } } }catch(_){}
    }
    function heatOff(){ try{ if(GE().layers.has('heat-h')) GE().layers.setLayout('heat-h','visibility','none'); }catch(_){} try{ window._hideGenericLegend&&window._hideGenericLegend('heat'); }catch(_){} }

    /* ⚠ (#R289) `modes` TRAVELS WITH THE COPY, AND THE ROW'S NAME IS WHY. This list is a SHALLOW
       copy of each entry, and a modal entry carries no top-level `n` — its name belongs to the
       mode that is showing. Without `modes` here, `V()` had nothing to resolve and `bxLabel`
       returned the empty string: MEASURED in the browser, the CO₂ row rendered with a blank label
       and nothing else was wrong, which is exactly the kind of silence this project keeps paying
       for. tests/shell-data-layers-checks.test.mjs #R289 ④ now measures the label rather than the mechanism. */
    const ALL=WB.map(L=>({id:L.id,n:L.n,modes:L.modes,on:()=>choroOn(L),off:()=>choroOff(L)}))
      .concat([{id:'wbind',n:IND_NAME,on:indOn,off:indOff}])
      .concat([{id:'eq',n:LA('Earthquakes (live + history)','地震（ライブ＋過去）','Erdbeben (live + Verlauf)','Землетрясения (онлайн + история)','Terremotos (en vivo + histórico)'),on:eqOn,off:eqOff},
               {id:'heat',n:LA('Heat of Attention','注目度ヒートマップ','Aufmerksamkeits-Heatmap','Карта внимания','Mapa de calor de atención'),on:heatOn,off:heatOff}]);
    /* ⚠ (#R246) ONE NAME, ONE PLACE. (#R38) gave every beta row a German and Russian label. Every indicator's name was an `{en,jp}` object with a SECOND
       table (`BX_TR`, 34 entries keyed by the English string) bolted on for de/ru — the same quantity
       in two homes ([[intmap-recurring-lessons]] G), no Spanish anywhere, and nothing at all for
       fr/ko/zh/zh-Hans, which read the English. `LA(…)` is IntMapLang.pickArgs(): both tables are now
       ONE call per indicator, and `LWB.arr()` resolves it through pick() itself — de/ru/es from the
       arguments, the rest from the inline table keyed by the English name. BX_TR is gone. */
    const bxLabel=(L)=> LWB.arr(V(L).n);   /* (#R289) a modal row is named by the mode it is showing */
    /* (#R121) point-value hooks for the layer-data contract (IntMapLayers 'choropleth'): the value of every
       VISIBLE bx World-Bank choropleth at (lng,lat), read from the layer's OWN painted source data by
       point-in-polygon — works on- and off-screen. Registered here because this module owns these layers. */
    const _bxVis=L=>{ try{ const f=L.id+'-fill'; return !!(GE().layers.has(f)&&GE().layers.getLayout(f,'visibility')==='visible'); }catch(_){ return false; } };
    const _bxAll=()=>(IND.cur&&wbById.wbind)?WB.concat([wbById.wbind]):WB;   /* (map-layer-system) …and the indicator browser's row while it paints */
    window._imBxChoroOn=function(){ try{ return _bxAll().some(_bxVis); }catch(_){ return false; } };
    window._imBxChoroValueAt=function(lng,lat){ const out=[];
      try{ if(!window._imPipGeo) return out;
        _bxAll().forEach(L=>{ if(!_bxVis(L)) return;
          const d=GE().layers.sourceData('src-'+L.id); if(!d||!d.features) return;
          for(const f of d.features){ if(f&&f.geometry&&window._imPipGeo(lng,lat,f.geometry)){ const p=f.properties||{};
            if(p.v!=null){ const a=Math.abs(+p.v); const rv=(a>=100?Math.round(+p.v):Math.round(+p.v*10)/10); out.push(bxLabel(L)+': '+rv+(V(L).unit||'')+(p.nm?(' ('+p.nm+')'):'')); }
            else out.push(bxLabel(L)+': — '+(p.nm?('('+p.nm+')'):''));   /* gray no-data country = honest dash */
            break; } } }); }catch(_){}
      return out; };
    function buildRows(){ const dd=document.getElementById('layer-dropdown'); if(!dd||document.getElementById('bx-eq')) return;
      ALL.forEach(L=>{ const w=document.createElement('div'); w.className='lyr-row'; w.id='lyrrow-'+L.id;
        const lab=document.createElement('label'); lab.className='layer-option';
        const cb=document.createElement('input'); cb.type='checkbox'; cb.id='bx-'+L.id;
        const sp=document.createElement('span'); sp.className='bx-name'; sp.textContent=bxLabel(L);
        lab.appendChild(cb); lab.appendChild(document.createTextNode(' ')); lab.appendChild(sp); w.appendChild(lab); dd.appendChild(w);
        /* (map-layer-system) what `on` returns is the request this change started (choroOn settles once the series has been
           painted or given up) — handed to js/layer-rows.js `layerInflight` here, where every row of this module is wired, as
           js/data-layers.js does for its own rows, so the layer-state audit does not read a row whose series is still arriving
           as «ticked and blank» and pulse it off→on. An «off» returns nothing, which clears the box. */
        cb.addEventListener('change',e=>{ w.classList.toggle('on',e.target.checked); let req;
          if(e.target.checked){ try{ req=L.on(); }catch(_){} } else { try{ L.off(); }catch(_){} }
          try{ layerInflight.track(cb.id,req); }catch(_){} });
      });
      try{ window.reorganizeLayerPanel&&window.reorganizeLayerPanel(); }catch(_){}
    }
    /* keep labels in sync with UI language */
    bus.on('intmap-lang',()=>{ ALL.forEach(L=>{ const r=document.getElementById('lyrrow-'+L.id); const sp=r&&r.querySelector('.bx-name'); if(sp) sp.textContent=bxLabel(L); }); });
    if(document.readyState!=='loading') setTimeout(buildRows,700); else document.addEventListener('DOMContentLoaded',()=>setTimeout(buildRows,700));

    /* (#R31) Refresh Stats to the LATEST available figures ("Statsの数値はできる限り最新に") — pull the most
       recent World Bank GDP / population / GDP-per-capita / life-expectancy and merge into countryStats
       (only overwriting where WB has a value), then re-render Stats if it's open. Runs once, low-priority. */
    function refreshStatsLatest(){ try{ const cs=(typeof countryStats!=='undefined'&&countryStats)||null; if(!cs) return;
      return Promise.all(['gdp','pop','gdppc','life'].map(k=>wbFetch(wbIndicator(k).code))).then(([gdp,pop,pc,le])=>{
        Object.keys(cs).forEach(code=>{ const s=cs[code]; if(!s) return;
          if(gdp[code]&&gdp[code].v>0) s.gdp=gdp[code].v/1e9;
          if(pop[code]&&pop[code].v>0) s.pop=pop[code].v;
          if(pc[code]&&pc[code].v>0) s.gdppc=pc[code].v;
          if(le&&le[code]&&le[code].v>0) s.lifeExp=le[code].v;
        });
        try{ if(typeof HOST.mode!=='undefined'&&HOST.mode==='stats'&&typeof renderStats==='function') renderStats(typeof searchVal==='function'?searchVal():''); }catch(_){}
      }).catch(()=>{});
    }catch(_){} }
    /* (mobile-performance) the idle callback was the whole schedule, and a phone whose main thread is busy
       for nine seconds is idle INSIDE its boot: MEASURED, the four indicators (137 kB of World Bank JSON,
       parsed on the page) started at 7.6 s of an 8.4 s boot. js/boot-stage.js row `world-bank` puts them
       behind the moment a phone can be touched; every other device keeps this exact schedule. */
    const _go=()=>{ if(window.requestIdleCallback) requestIdleCallback(()=>refreshStatsLatest(),{timeout:6000}); else setTimeout(refreshStatsLatest,4500); };
    /* ⚠ …AND AFTER THE TABLE IT REFRESHES EXISTS. The merge only writes rows that are already in countryStats,
       and on a phone the country table is itself a settled read: MEASURED in the old schedule the indicators
       landed at 7.6 s and the country file at 8.8 s, so this refresh merged into an empty table and changed
       nothing. The turn therefore asks for the table first (the same latched promise every reader awaits). */
    if(BootStage.stageOf('world-bank')!=='boot') BootStage.at('world-bank',()=>Promise.resolve(typeof loadCountryData==='function'?loadCountryData():null).catch(()=>null).then(refreshStatsLatest)); else _go();
  })();
}
