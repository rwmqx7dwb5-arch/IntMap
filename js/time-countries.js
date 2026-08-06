/* ============================================================================
 *  IntMap · the Countries tab, as it was in the year on the clock  (#R200)
 * ----------------------------------------------------------------------------
 *  When the master clock travels to a past year, the real World Bank annual figures for THAT year
 *  are fetched and overlaid onto countryStats, so the choropleths, the rows and the open country card
 *  all show the world as it was. Returning to "Now" restores the present exactly.
 *
 *  Lifted verbatim out of js/app-body.js (#R200): 96 of its 97 lines are byte-identical,
 *  and the 1 that are not are all the same rule — #R165's: a closure value js/app-body.js
 *  REASSIGNS at runtime is read through IM_HOST's live accessor (countryDataLoaded → HOST.countryDataLoaded),
 *  never captured when this factory ran. Everything else arrives through CTX under its ORIGINAL name,
 *  which is what lets the body below stay word-for-word what it was.
 *
 *  It is a REAL ES module: nothing registers it on window.IntMapModules, nothing in src/main.js orders
 *  it, and js/app-body.js reaches it only through a static `import`. tests/r200-checks.test.mjs derives
 *  both halves of the hand-off — what this file returns and reads, what the core takes and passes — from
 *  the two files themselves, so neither list can drift into a silent `undefined`.
 * ==========================================================================*/
export function makeTimeCountries(HOST, CTX) {
  const countryStats=CTX.countryStats, loadCountryData=CTX.loadCountryData, renderStats=CTX.renderStats, searchVal=CTX.searchVal;
  /* ============================================================================
   *  (#R94) INTMAP TIME · COUNTRIES — the Countries tab, the country choropleths, the hover read-outs
   *  and the open country card all become YEAR-AWARE. When the master clock travels to a past year the
   *  real World Bank figures for THAT year (GDP, GDP/capita, population, life-expectancy, fertility,
   *  internet use, military spending) are fetched and overlaid onto countryStats, so the whole app shows
   *  the world as it was; returning to "Now" restores the present. Honest by construction: WB annual
   *  series begin in 1960 (deeper past keeps the latest figures with a clear banner), and indicators
   *  WITHOUT a WB annual series (HDI/UNDP, Democracy Index/EIU) are never relabelled with the wrong year.
   *  ========================================================================== */
  window.IntMapTimeCountries=(function(){
    const WB_FLOOR=1960;
    /* field on countryStats ← World Bank indicator (all-countries, one year). scale normalises to the
       units countryStats already uses (gdp & milSpend in US$ billions; the rest raw). */
    const FIELDS=[
      {f:'gdp',      ind:'NY.GDP.MKTP.CD', scale:1e-9},
      {f:'gdppc',    ind:'NY.GDP.PCAP.CD', scale:1},
      {f:'pop',      ind:'SP.POP.TOTL',    scale:1},
      {f:'lifeExp',  ind:'SP.DYN.LE00.IN', scale:1},
      {f:'tfr',      ind:'SP.DYN.TFRT.IN', scale:1},
      {f:'internet', ind:'IT.NET.USER.ZS', scale:1},
      {f:'milSpend', ind:'MS.MIL.XPND.CD', scale:1e-9}
    ];
    const yearCache={};        /* year -> { field -> {iso3 -> value} } */
    let base=null;             /* present-day snapshot of the overlaid fields (+ density) */
    let curYear=null;          /* the year currently overlaid, or null */
    let seq=0, deb=null;
    function snapshotBase(){ if(base) return; base={}; try{ for(const iso in countryStats){ const s=countryStats[iso]; if(!s) continue; const o={density:s.density}; FIELDS.forEach(F=>o[F.f]=s[F.f]); base[iso]=o; } }catch(_){} }
    function restore(){ try{ if(window.IntMapHistId) window.IntMapHistId.clear(); }catch(_){}   /* restore modern names/flags */
      try{ if(window.IntMapHistStates) window.IntMapHistStates.clear(); }catch(_){}   /* remove former-state entries */
      if(!base) return; try{ for(const iso in base){ const s=countryStats[iso]; if(!s) continue; const o=base[iso]; for(const k in o) s[k]=o[k]; } }catch(_){} curYear=null; window._imTimeYear=null; window._imTimeReal=false; }
    /* Fetch the year's figures from the World Bank. SEQUENTIALLY, not in parallel: the WB throttles a single
       IP on request bursts, so 7 concurrent calls get dropped — one-at-a-time (≈100 ms each) is reliable.
       A run that returns essentially nothing is NOT cached, so the next travel transparently retries. */
    async function fetchYear(year){ if(yearCache[year]) return yearCache[year];
      const out={}; FIELDS.forEach(F=>out[F.f]={});
      for(const F of FIELDS){ try{
        const c=('AbortController' in window)?new AbortController():null, tm=c?setTimeout(()=>{try{c.abort();}catch(_){}}, 12000):null;
        const r=await fetch('https://api.worldbank.org/v2/country/all/indicator/'+F.ind+'?format=json&per_page=400&date='+year, c?{signal:c.signal}:undefined);
        const j=await r.json(); if(tm) clearTimeout(tm);
        (j&&j[1]||[]).forEach(row=>{ if(row&&row.value!=null){ const iso=row.countryiso3code||(row.country&&row.country.id); if(iso&&iso.length===3) out[F.f][iso]=+row.value*F.scale; } });
      }catch(_){} }
      if(Object.keys(out.gdp).length>10||Object.keys(out.pop).length>10) yearCache[year]=out;   /* cache only a real result */
      return out; }
    function overlay(year,data){ snapshotBase();
      /* (#R94i) Maddison covers 1900–2018; for 2019+ there is NO Maddison year → keep the World Bank NOMINAL
         figures (and mark the basis NOT-real so the banner/labels say World Bank, not "real 2011 int$"). */
      const M=window.IntMapMaddison, useM=!!(M&&M.ready()&&year<=(M.maxYear||2018));
      try{ for(const iso in countryStats){ const s=countryStats[iso]; if(!s) continue;
        FIELDS.forEach(F=>{ const v=data[F.f]&&data[F.f][iso]; s[F.f]=(v!=null&&isFinite(v))?v:null; });
        /* (#R94e) real GDP / GDP-per-capita / population from Maddison (2011 int$) — consistent across every
           country back to 1900, and the only source before the World Bank's 1960 floor. WB nominal is discarded
           for GDP while travelling so a historical ranking is on ONE basis; life-exp/fertility/internet/military
           stay World Bank. Population prefers Maddison, else keeps the WB value (head-count is basis-free). */
        if(useM){ const mpc=M.gdppc(iso,year), mp=M.popN(iso,year), mg=M.gdpBil(iso,year);
          s.gdp=(mg!=null)?mg:(M.has(iso,year)?null:s.gdp);
          s.gdppc=(mpc!=null)?mpc:(M.has(iso,year)?null:s.gdppc);
          if(mp!=null) s.pop=mp; }
        s.density=(s.pop&&s.area)?s.pop/s.area:null;   /* density recomputed from the year's population */
      } }catch(_){}
      curYear=year; window._imTimeYear=year; window._imTimeReal=useM;
      /* former states: replace successors with the historical state for its real lifespan (uses the year values just overlaid) */
      try{ if(window.IntMapHistStates) window.IntMapHistStates.apply(window.IntMapTime.when()); }catch(_){}
      /* then rename/re-flag the remaining single countries to their era identity (Qing/ROC, German Empire, …) */
      try{ if(window.IntMapHistId) window.IntMapHistId.apply(window.IntMapTime.when()); }catch(_){}
    }
    function repaint(){
      try{ if(window._countriesActive&&window._countriesActive()&&typeof renderStats==='function') renderStats((typeof searchVal==='function')?searchVal():''); }catch(_){}
      try{ if(typeof window._imReapplyChoros==='function') window._imReapplyChoros(); }catch(_){}
      try{ if(typeof window._imCountryCardRefresh==='function') window._imCountryCardRefresh(); }catch(_){}
      try{ if(typeof window._imTimeSyncedRefresh==='function') window._imTimeSyncedRefresh(); }catch(_){}
    }
    window.IntMapTime.on(e=>{ clearTimeout(deb); const my=++seq;
      deb=setTimeout(async()=>{
        const y=e.year;
        if(e.isLive || y>=new Date().getFullYear()){ if(curYear!=null||window._imTimePreWB){ window._imTimePreWB=null; restore(); repaint(); } return; }
        const MFLOOR=(window.IntMapMaddison&&window.IntMapMaddison.minYear)||1900;
        if(y<MFLOOR){ /* before the Maddison historical series → keep present figures, flag the floor */
          if(curYear!=null){ restore(); } window._imTimePreWB=y; window._imTimeYear=null; repaint(); return; }
        window._imTimePreWB=null;
        if(y===curYear) return;   /* same year → country annual data unchanged, nothing to repaint */
        try{ if(!HOST.countryDataLoaded) await loadCountryData(); }catch(_){}
        try{ await window.IntMapMaddison.load(); }catch(_){}
        if(my!==seq) return;
        /* (#R110) TWO-PHASE update so the Countries tab reflects the new year IMMEDIATELY ("タイムマシンでの年代変更が、
           すぐにCountriesに反映されない。時間がかかる"): PHASE 1 overlays the LOCAL Maddison GDP / population /
           GDP-per-capita + the former-state identities right away (zero network) and repaints, so the tab, choropleths
           and open card update at once. PHASE 2 then fetches the World Bank life-expectancy / fertility / internet /
           military series for the year (the slow, throttled, sequential part) and repaints again when it lands. */
        const emptyWB={}; FIELDS.forEach(F=>emptyWB[F.f]={});
        restore(); overlay(y,emptyWB); repaint();
        let data; try{ data=(y>=WB_FLOOR)?await fetchYear(y):null; }catch(_){ data=null; }   /* WB annual series from 1960; earlier years = Maddison only */
        if(my!==seq) return;              /* superseded by a newer time change */
        if(data){ FIELDS.forEach(F=>{ if(!data[F.f]) data[F.f]={}; }); overlay(y,data); repaint(); }
      }, 340);
    });
    return { year:()=>curYear, floor:WB_FLOOR, _fetchYear:fetchYear, _restore:restore };
  })();
}
