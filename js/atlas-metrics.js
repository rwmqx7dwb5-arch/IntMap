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
    /* the name index is built from each record's OWN labels — the positional `LA(…)` strings plus
       the one the current language renders — so a metric added later is reachable by its name in
       every language without anybody writing it down a second time (VMET/XVMET stay: they hold the
       spoken forms 「寿命」「一人当たりgdp」 that are not any label). */
    const _mnorm=s=>String(s==null?'':s).toLowerCase().replace(/[\s_.\-()%°·・、。，,]/g,'');
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
      const hits=[]; for(const n in idx){ if(n.indexOf(q)>=0&&hits.indexOf(idx[n])<0) hits.push(idx[n]); }
      if(hits.length===1) return {key:hits[0],m:metAll()[hits[0]]};
      return null; }
    /* a refusal that cannot be retried is a loop. Every one of these names the whole valid set. */
    function unknownMetric(k){ return R(false, warn('⚠ '+L('Unknown metric','不明な指標','Unbekannte Kennzahl','Неизвестный показатель','Métrica desconocida')
      +': '+esc(String(k==null?'':k))+' — '+L('valid','有効','gültig','допустимо','válidos')+': '+esc(metKeys().join(', ')))); }
  return { METRICS, XMET, VMET, XVMET, metAll, metKeys, metSpec, unknownMetric };
}
