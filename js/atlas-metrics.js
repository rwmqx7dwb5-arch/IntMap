/* ============================================================================
 *  IntMap · Atlas — ONE set of country metrics, and ONE resolver for its names  (#R740)
 * ----------------------------------------------------------------------------
 *  Measured on production (logged in, 2026-09-15): 「世界を平均寿命で色分けして」 spent
 *  18 steps and 41.9 seconds to answer 「⚠ 不明な指標: lifeExp」 and drew nothing. Atlas had
 *  sent the RIGHT key. The refusal came from `drawChoro`, which read `METRICS` while life
 *  expectancy lives in `XMET` — and three centimetres away the Countries tab was printing a
 *  column headed 「Life expectancy」 at that same moment. The English form of the question was
 *  worse: its refusal named no alternatives, so the only move left to the planner was another
 *  spelling, and seven of them fit inside one turn before it hit the step budget.
 *
 *  So this file is ONE set (`METRICS` + `XMET`) and ONE resolver, and the resolver asks each
 *  metric record for the names IT declares — the positional `LA(…)` tuple in five languages plus
 *  the one the current language renders — instead of a second hand-written table. A metric added
 *  here is therefore reachable by its own printed name without anybody writing that name down
 *  twice, and every refusal enumerates the whole valid set (`unknownMetric`).
 *  `VMET`/`XVMET` stay: they hold the SPOKEN forms 「寿命」「一人当たりgdp」, which are not
 *  any record's label.
 *
 *  It sits outside js/atlas-console.js because of #R199's rule: the kernel is under a shrink-only
 *  ceiling (tests/r318 ⑨b), so a subject moves OUT and the ceiling is never raised. The bodies
 *  below are the kernel's own text, verbatim; everything they read from its closure arrives
 *  through `CTX` under the ORIGINAL names.
 * ==========================================================================*/
/* ⚠⚠⚠ (#R775) WHICH ROWS OF `countryStats` ARE A COUNTRY — asked in ONE place, because it was being
   answered in two. Measured on production 2026-09-17, 「GDP上位10か国を…人口あたりGDPと比べて」:
   `data.rank {metric:"gdp_per_capita"}` answered with Antarctica at $200,000 in FIRST place, ahead of
   Monaco. Nothing hardcodes that figure — it is Natural Earth's own GDP_MD/POP_EST for a continent
   whose 「population」 is research-station staff, divided in js/countries-ui.js:399. The Countries tab
   does not show it and neither does `map.highlight` (js/atlas-console.js:2727): both ask `sov!==false`.
   `rows()` / `ratio()` / `relate()` / `drawChoro()` / `scoreMap` never asked at all — the same judgement
   living in two places and answering differently (#R515's shape).
   ⚠ THIS DOES NOT NARROW THE WORLD. Bermuda (4th) and the French Southern and Antarctic Lands (5th)
   stay, because the product's own Countries table shows them — measured in the same screenshot. The
   only rows it removes are the ones IntMap already declines to call a country. */
export const isRankableCountry = s => !!(s && s.sov !== false && s.nameEn);

export function makeAtlasMetrics(HOST, CTX) {
  const LA=CTX.LA, lx=CTX.lx, L=CTX.L, esc=CTX.esc, warn=CTX.warn, R=CTX.R;
    /* metric catalog → countryStats keys */
    const METRICS={
      pop:{label:LA('Population','人口','Bevölkerung','Население','Población'),get:s=>s.pop},
      density:{label:LA('Pop. density','人口密度','Bevölkerungsdichte','Плотность нас.','Densidad'),get:s=>s.density},
      area:{label:LA('Area','面積','Fläche','Площадь','Superficie'),get:s=>s.area},
      gdp:{label:LA('GDP (nominal)','GDP（名目）','BIP (nominal)','ВВП (номин.)','PIB (nominal)'),get:s=>s.gdp,log:true},
      gdppc:{label:LA('GDP per capita','1人当たりGDP','BIP pro Kopf','ВВП на душу','PIB per cápita'),get:s=>s.gdppc,log:true},
      hdi:{label:LA('HDI','HDI','HDI','ИЧР','IDH'),get:s=>s.hdi},
      dem:{label:LA('Democracy Index','民主主義指数','Demokratieindex','Индекс демократии','Índice democrático'),get:s=>s.dem},
      milSpend:{label:LA('Military spending','国防費','Militärausgaben','Военные расходы','Gasto militar'),get:s=>s.milSpend,log:true},
      milSpendGDP:{label:LA('Military (% GDP)','国防費(対GDP)','Militär (% BIP)','Военные (% ВВП)','Militar (% PIB)'),get:s=>(s.milSpend!=null&&s.gdp)?(s.milSpend/s.gdp*100):null},
      tfr:{label:LA('Fertility rate','合計特殊出生率','Geburtenrate','Рождаемость','Fecundidad'),get:s=>s.tfr}
    };
    /* (#R75) hoisted from localPlan so metSpec can translate metric names too */
    const VMET={'population':'pop','人口':'pop','population density':'density','density':'density','人口密度':'density','area':'area','面積':'area','gdp':'gdp','gdp per capita':'gdppc','gdppc':'gdppc','一人当たりgdp':'gdppc','1人当たりgdp':'gdppc','hdi':'hdi','human development index':'hdi','fertility':'tfr','fertility rate':'tfr','出生率':'tfr','合計特殊出生率':'tfr','democracy index':'dem','民主主義指数':'dem','military spending':'milSpend','defense spending':'milSpend','国防費':'milSpend','軍事費':'milSpend','capital':'capital','capital city':'capital','首都':'capital','currency':'currency','通貨':'currency','languages':'languages','language':'languages','言語':'languages','公用語':'languages','flag':'flag','国旗':'flag'};
    const XMET={
      lifeExp:{label:LA('Life expectancy','平均寿命','Lebenserwartung','Ожид. продолжительность жизни','Esperanza de vida'),get:s=>s.lifeExp},
      internet:{label:LA('Internet users %','ネット利用率','Internetnutzer %','Интернет-пользователи %','Usuarios de internet %'),get:s=>s.internet}
    };
    const XVMET={'平均寿命':'lifeExp','寿命':'lifeExp','life expectancy':'lifeExp','lifeexp':'lifeExp','ネット利用率':'internet','インターネット利用率':'internet','internet':'internet','internet users':'internet'};
    /* ⚠⚠⚠ (#R740) ONE SET OF METRICS, AND IT IS THE ONE THE RECORDS THEMSELVES DECLARE.
       Measured on production: 「世界を平均寿命で色分けして」 answered 「⚠ 不明な指標: lifeExp」 —
       the model had sent the RIGHT key and the map refused it, because `drawChoro` read `METRICS`
       and life expectancy lives in `XMET`. The English form of the same question spent 21 steps
       trying "Life expectancy", "life expectancy", "life" seven times and died on the step budget,
       because the refusal named no alternatives. The Countries tab was showing a column headed
       「Life expectancy」 the whole time.
       ⇒ `metAll()` is the set, `metKeys()` is the list, and every "unknown metric" says it. */
    const metAll=()=>Object.assign({},METRICS,XMET);
    const metKeys=()=>Object.keys(metAll());
    /* ⚠⚠ (#R775) THE REFUSAL HAS TWO READERS AND ONE STRING. `unknownMetric` is rendered straight into
       the reply bubble (js/atlas-console.js `_atlCompose`), so 「有効: pop, density, area, gdp, gdppc, hdi,
       dem, milSpend, milSpendGDP, tfr, lifeExp, internet」 — measured on production 2026-09-17 — is what the
       READER was shown: twelve internal identifiers and nothing saying what any of them means. The
       planner needs the KEY (it is what it must send back); the reader needs the NAME. 「key (name)」
       serves both out of the one string, in the reader's own language. `metKeys()` stays: the prompt
       (js/atlas-catalog-text.js block 37) pairs them itself and must not be given a second spelling. */
    const metNamed=()=>{ const all=metAll(); return Object.keys(all).map(k=>{ let n=''; try{ n=lx(all[k].label); }catch(_){} return n?(k+' ('+n+')'):k; }); };
    /* the name index is built from each record's OWN labels — the positional `LA(…)` strings plus
       the one the current language renders — so a metric added later is reachable by its name in
       every language without anybody writing it down a second time (VMET/XVMET stay: they hold the
       spoken forms 「寿命」「一人当たりgdp」 that are not any label). */
    /* ⚠⚠ (#R775) THE STRIPPED FORM, AND WHERE EACH OF ITS CHARACTERS CAME FROM. `_mnorm` throws the
       separators away, which is what makes 「GDP per capita」 and 「gdp_per_capita」 the same name — and it
       is also what destroys the word boundaries the reverse match below needs. `_mmap` keeps the index
       so a match in the stripped blob can be checked against the ORIGINAL text it came from. */
    const _mmap=s=>{ const src=String(s==null?'':s).toLowerCase(), out=[]; let t='';
      for(let i=0;i<src.length;i++){ const c=src[i]; if(_MSEP.test(c)) continue; t+=c; out.push(i); }
      return {t:t,at:out,src:src}; };
    const _MSEP=/[\s_.\-()%°·・、。，,（）［］【】「」:：\/／％＋+－ー]/;
    const _mlat=c=>c!==undefined&&/[a-z0-9]/.test(c);
    const _mnorm=s=>String(s==null?'':s).toLowerCase().replace(/[\s_.\-()%°·・、。，,（）［］【】「」:：\/／％＋+－ー]/g,'');
    function _metByName(){ const out=Object.create(null), all=metAll();
      for(const k in all){ const rec=all[k]; const names=[k].concat(Array.isArray(rec.label)?rec.label:[rec.label]);
        try{ names.push(lx(rec.label)); }catch(_){}
        names.forEach(n=>{ const q=_mnorm(n); if(q&&!(q in out)) out[q]=k; }); }
      [VMET,XVMET].forEach(tbl=>{ for(const a in tbl){ const q=_mnorm(a); if(q&&!(q in out)&&all[tbl[a]]) out[q]=tbl[a]; } });
      return out; }
    function metSpec(key){ const raw=String(key||'').trim(); if(!raw) return null;
      const k2=VMET[raw.toLowerCase()]||XVMET[raw.toLowerCase()]||XVMET[raw]||raw;
      if(METRICS[k2]) return {key:k2,m:METRICS[k2]};
      if(XMET[k2]) return {key:k2,m:XMET[k2]};
      const idx=_metByName(), q=_mnorm(raw);
      if(idx[q]) return {key:idx[q],m:metAll()[idx[q]]};
      /* ⚠⚠⚠ (#R741) …AND A UNIQUE PART OF A NAME IS THAT NAME. #R740's production verification, on
         the deployed fix: 「世界を平均寿命で色分けして」 sent `mapMetric "life"` — SEVEN times, each
         refused, the turn dead on its step budget again. The refusal did enumerate (that half of
         #R740 works, and the list was on screen), but `life` is not any metric's whole name, and the
         name index only answered exact strings. js/atlas-query.js `byDeclaredName` had already been
         given the right rule in the same round — exact, then a partial match ONLY IF IT IS UNIQUE —
         and the two resolvers were left disagreeing about what counts as a name. They agree now.
         ⚠ UNIQUE, because a guess is worse than the refusal it replaces: 「pop」 is inside both
         `pop` and `popdensity`, so it stays exact-only and 「density」 still answers by itself. */
      /* ⚠⚠⚠ (#R775) …AND THE CONTAINMENT HAS TWO DIRECTIONS. Measured on production 2026-09-17,
         「GDP上位10か国を地図にコロプレスで描いて」: `data.rank` sent `metric:"名目GDP（現在価格米ドル）"`,
         was refused, sent `"gdp"`, succeeded — and then sent `"名目GDP"` and was refused AGAIN inside the
         same turn, which is #R768's 「同じ失敗の二度目」. Neither name was wrong: `gdp` prints itself
         「GDP（名目）」, so the query is the same two tokens IN THE OTHER ORDER — and a longer query that
         NAMES a metric and then qualifies it ("nominal GDP, current US$") can never be a substring of
         the short label. Only 「the query is part of a name」 was being asked. Asking 「the name is part
         of the query」 as well answers both, and #R741's uniqueness rule is what keeps it safe: `gdp` is
         inside 「名目gdp」 and `gdppc` is not, so exactly one metric answers.
         ⚠ A name shorter than 3 characters may NOT match this way — `hdi`/`dem`/`tfr` are whole words,
         and a two-character fragment found inside a sentence is a coincidence, not a name. */
      const hits=[]; for(const n in idx){ if(n.indexOf(q)>=0&&hits.indexOf(idx[n])<0) hits.push(idx[n]); }
      if(hits.length===1) return {key:hits[0],m:metAll()[hits[0]]};
      /* ⚠⚠⚠ (#R775) …AND THE OTHER DIRECTION: the query NAMES a metric and then qualifies it.
         `GDP（名目）` normalised is `gdp名目`; the query `名目GDP` is `名目gdp` — the same two tokens in
         the other order, and neither contains the other. `名目GDP（現在価格米ドル）` is longer than any
         label, so the pass above can never reach it either. Both were refused on production
         2026-09-17, in the SAME turn, one of them after `gdp` had already succeeded in it.
         ⚠ A NAME ONLY COUNTS WHERE IT IS A WHOLE WORD. The first version of this check asked only for
         containment and length ≥ 3, and `tell me about the demographics of the world` resolved to the
         Democracy Index — `dem` inside `demographics`. #R741 wrote the rule this violates: a guess is
         worse than the refusal it replaces. The boundary is read off the ORIGINAL text (`_mmap`), not
         the stripped blob, so 「名目GDP」 counts (a script change bounds it) and 「demographics」 does not.
         ⚠ LONGEST WINS, THEN UNIQUENESS. `gdp per capita, current US$` contains both `gdp` and
         `gdppercapita`; taking the longest is what makes it `gdppc` and not `gdp`. Two names of the
         same length still refuse, which is #R741's rule unchanged. */
      const mm=_mmap(raw), back=[];
      for(const n in idx){ if(n.length<3) continue; let at=mm.t.indexOf(n);
        while(at>=0){ const a0=mm.at[at], b0=mm.at[at+n.length-1];
          if(!_mlat(mm.src[a0-1])&&!_mlat(mm.src[b0+1])){ back.push({k:idx[n],len:n.length}); break; }
          at=mm.t.indexOf(n,at+1); } }
      if(back.length){ const top=back.reduce((a,b)=>b.len>a.len?b:a).len;
        const best=back.filter(x=>x.len===top).map(x=>x.k).filter((v,i,A)=>A.indexOf(v)===i);
        if(best.length===1) return {key:best[0],m:metAll()[best[0]]}; }
      return null; }
    /* a refusal that cannot be retried is a loop. Every one of these names the whole valid set. */
    function unknownMetric(k){ return R(false, warn('⚠ '+L('Unknown metric','不明な指標','Unbekannte Kennzahl','Неизвестный показатель','Métrica desconocida')
      +': '+esc(String(k==null?'':k))+' — '+L('valid','有効','gültig','допустимо','válidos')+': '+esc(metNamed().join(', '))),
      /* ⚠⚠⚠ (#R760) THE LINE ABOVE ALREADY SAID 「a refusal that cannot be retried is a loop」 AND
         THEN SAID IT TO NOBODY. Naming the valid set is necessary and not sufficient: the refusal is
         about a metric IntMap does not hold AT ALL, so another spelling of the same idea cannot work
         either — and the repeat guard keys on the exact arguments, so each new spelling looked like a
         new request. Measured on production 2026-09-16, 「Show a choropleth of CO2 emissions per
         capita」: `data.ratio` refused five times across 5 m 30 s, each with a differently-worded
         metric, and the turn produced no map and no answer. `permanent` names which fact this is:
         not 「that attempt failed」 but 「this KIND of request is not available」. Its reader is
         js/atlas-agent.js. ⚠ `meta.retryable` exists elsewhere with no reader at all; it is left
         alone rather than co-opted, because nothing has measured what those producers mean by it. */
      {meta:{code:'unknown_metric', permanent:true}}); }
  return { METRICS, XMET, VMET, XVMET, metAll, metKeys, metSpec, unknownMetric, isRankableCountry };   /* ⚠ (#R199 ②) the kernel destructures exactly this set — `metNamed` has no consumer outside this file and is deliberately not in it */
}
