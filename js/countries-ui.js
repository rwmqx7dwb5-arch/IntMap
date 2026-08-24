/* ============================================================================
 *  IntMap · Countries tab & country detail  (#R168)
 * ----------------------------------------------------------------------------
 *  The Countries subject: the boundary/stat loader, the map country layers, the ranked country
 *  list, the country card and its detail body. Fifteen closure statements — nine function
 *  declarations and six small tables/caches that only this subject reads.
 *  index.html keeps a hoisted shim for each of the five names it still calls by name.
 *
 *  Moved VERBATIM out of the index.html DOMContentLoaded closure: the only edit is that free
 *  references to closure variables became HOST.<member> reads (Architecture.md §3.1). The
 *  extraction was done by script and reversed byte-for-byte against the original text.
 * ==========================================================================*/
/* ══ ⚠⚠⚠ (#R240) A COUNTRY'S NAME IN THE READER'S LANGUAGE, FROM CLDR ══════════════════════════════
   「簡体、繁体、フランス語、韓国語、ドイツ語、ロシア語、スペイン語について、すべての面において対応が
     完璧かどうか最終点検し、未了点があれば修正して。（まだある）」

   The runtime sweep found the Countries tab printing 「Afghanistan」「Albania」「Algeria」… in every
   language but Japanese. `cName` (js/app-body.js) had exactly two branches — `nameJp` for jp,
   `nameEn` for everyone else — so the one screen whose entire content is names was 200 rows of
   English in seven of the nine languages, while every translation instrument read 100 %.

   ⚠ AND THE ANSWER IS NOT A TABLE OF 200 × 8 STRINGS. `Intl.DisplayNames` reads the browser's own
   CLDR data, which is where the canonical translation of every ISO 3166-1 region already lives; it
   is right for languages this app has not added yet and it cannot go stale. The curated `nameJp`
   still wins for Japanese — that is the app's own editorial choice (「アメリカ合衆国」 rather than
   CLDR's 「米国」) — and English falls back to `nameEn`, which carries Natural Earth's long forms.
   ⚠ ONE INSTANCE PER LANGUAGE, built lazily: constructing a DisplayNames costs about a millisecond
   and this is called once per row of a 200-row list on every re-sort.
   ⚠ IT LIVES HERE, NOT IN js/app-body.js: tests/r168 #8 budgets the app shell at 8,200 lines and the
   rule it states is that the ceiling follows the floor DOWN. A new mechanism goes where its feature
   is. `window._imCldrRegion` is the whole surface app-body reaches for. */
/* ⚠ the cache hangs off the function itself — tests/r175 ③ refuses an unexported top-level
   declaration in js/, and this file has exactly one thing to publish. */
window._imCldrRegion=function(a2,lang){
  try{
    /* ⚠ (#R313 追記2) 追記1 widened this to accept M49 codes so the Atlas chips could name a
       subregion through CLDR. MEASURED afterwards: `Intl.DisplayNames({type:'region'})` in Chromium has
       NO M49 macro-regions (0 of 22, every language), while Node's ICU has all of them — so the widening
       bought nothing in a browser and only made this helper look able to answer something it cannot.
       The chips ship their own strings now (js/atlas-examples.js). Two-letter countries again. */
    if(!a2||a2.length!==2) return '';
    const tag=(window.IntMapLang&&window.IntMapLang.htmlTag)?window.IntMapLang.htmlTag(lang):'';
    if(!tag||tag==='en') return '';
    const c=window._imCldrRegion._c||(window._imCldrRegion._c={});
    let dn=c[tag];
    if(dn===undefined){ try{ dn=new Intl.DisplayNames([tag],{type:'region',fallback:'none'}); }catch(_){ dn=null; } c[tag]=dn; }
    return (dn&&dn.of(a2.toUpperCase()))||'';
  }catch(_){ return ''; }
};
window.IntMapModules=window.IntMapModules||{};
window.IntMapModules.countriesUi=function(HOST){
  /* (#R251) the seven continent names the country table carries in `region`, as calls.
     ⚠ BUILT ON FIRST USE, NOT AT FACTORY LEVEL. tests/r168 #4 holds this repo to «a factory body
     does nothing while it runs» — a module factory may DECLARE, never CALL — and both
     `IntMapLang.pick()` and `LA(…)` are calls. Lazy also means the table is built after the
     registry exists, which is the ordering every other module relies on. */
  let _REGIONS=null, _LR=null;
  function _regionName(r){
    if(!r) return r;
    if(!_REGIONS){
      _LR=window.IntMapLang.pick(()=>HOST.lang);
      const A=window.IntMapLang.pickArgs();
      _REGIONS={
        'Africa':A('Africa','アフリカ','Afrika','Африка','África'),
        'Asia':A('Asia','アジア','Asien','Азия','Asia'),
        'Europe':A('Europe','ヨーロッパ','Europa','Европа','Europa'),
        'North America':A('North America','北アメリカ','Nordamerika','Северная Америка','América del Norte'),
        'South America':A('South America','南アメリカ','Südamerika','Южная Америка','América del Sur'),
        'Oceania':A('Oceania','オセアニア','Ozeanien','Океания','Oceanía'),
        'Antarctica':A('Antarctica','南極','Antarktika','Антарктида','Antártida'),
      };
    }
    const t=_REGIONS[r]; return t?_LR.arr(t):r;
  }
  const GE=()=>window.IntMapGeoEngine;   /* (#R178) the renderer, through the contract — never the raw handle */

  /* (#R172) THROUGH IntMapGeoEngine — this module no longer names the renderer. */
  const _GE=()=>window.IntMapGeoEngine;
  const _LY=()=>{ const E=_GE(); return E?E.layers:null; };
  const _EV=()=>{ const E=_GE(); return E?E.events:null; };
  const _CM=()=>{ const E=_GE(); return E?E.camera:null; };
  /* (#R170) "Is it safe to addSource/addLayer right now?" — the app-wide predicate declared in index.html.
     A function DECLARATION so nested closures above this line can call it (no TDZ). Falls back to the old
     isStyleLoaded() test only if the host is somehow absent. */
  function _imCanDraw(){ try{ return !!HOST.canDraw(); }catch(_){ try{ return !!GE().ready(); }catch(__){ return false; } } }
  const GDP_YEAR='2023', POP_YEAR='2024';

  /* (#R167) moved verbatim to js/tables.js — see Architecture.md §3.1. */
  const {GDP,HDI,DEM,MILSPEND,LIFE,INTERNET,CAPITAL,CURRENCY,LANGS}=window.IntMapTables;

  function flagFromISO2(a2){ if(!a2||a2.length!==2||a2==='-9')return'🏳️'; try{return a2.toUpperCase().replace(/./g,c=>String.fromCodePoint(127397+c.charCodeAt(0)));}catch(e){return'🏳️';} }

  function loadCountryData(){
    if(HOST.countryDataPromise) return HOST.countryDataPromise;
    HOST.countryDataPromise=(async()=>{
      try{
        let gj=null;
        /* (#R13) Highest-resolution Natural Earth borders (10 m) so the boundary lines are crisp and
           track the real borders — the user reported the 50 m lines were too coarse and ran parallel-
           offset from reality. 10 m gzips to ~4.7 MB and loads async (doesn't block the map), with a
           graceful fall back to 50 m then 110 m if it can't be fetched.
           ══ (#R195) …BUT NOTHING ON SCREEN IS WAITING FOR THE GEOMETRY ═══════════════════════════
           「起動時の読み込みをもっと早く。」 Measured on a cold load after #R193's work: this file is
           **4,335 KB starting at 2,024 ms** — the largest download left anywhere on the boot path, now
           that #R192 moved cshapes to idle. And on a default boot NOT ONE PIXEL of it is drawn: the
           visible border line comes from the OFM boundary layer (#R40, `ensureBordersLayer`), and
           `country-fill`/`country-line` are created with `visibility:'none'` and only shown when the
           user ticks Countries(info) — manual since #R83. What the boot actually needs from this file
           is the ATTRIBUTES: the names, populations, ISO codes and regions the Countries tab lists,
           and that tab is the desktop default (#R170), so it is what the user is waiting on.

           The attributes are identical at every Natural Earth scale. So: fetch the 110 m file — the
           same table, ~17× smaller — draw the rows from it, and pull the 10 m geometry in when the
           browser is idle, replacing the geometry WITHOUT disturbing the records (see upgrade below).
           The 10 m outline still ends up in `countryGeo`, so hit-testing, the silhouette quiz and the
           projection viewer are exactly as precise as before; they simply are not what boot pays for. */
        const NE='https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/';
        const grab=async(f)=>{ try{ const r=await fetch(NE+f); if(r.ok) return await r.json(); }catch(e){} return null; };
        let coarse=true;
        gj=await grab('ne_110m_admin_0_countries.geojson');
        if(!(gj&&gj.features)) gj=await grab('ne_50m_admin_0_countries.geojson');
        if(!(gj&&gj.features)){ gj=await grab('ne_10m_admin_0_countries.geojson'); coarse=false; }
        if(gj&&gj.features){
          HOST.countryGeo=gj; window.countryGeo=HOST.countryGeo;   /* reused by the projection viewer (#16,#17) */
          /* ══ ⚠⚠⚠ (#R426) TWO BOXES, BECAUSE THEY ANSWER TWO DIFFERENT QUESTIONS ═════════════
             This was one function returning min/max over the whole feature, and both callers were
             handed it. They do not want the same thing. Framing asks WHERE IS THE COUNTRY; the
             hit-test's cheap refusal asks WHERE COULD THIS POINT POSSIBLY BE. For a country with
             remote territory those differ by more than a hundred degrees — Norway's union is
             135.2° of latitude because Bouvet Island is Norwegian — and the union answered the
             framing question with the hit-test's answer. See js/country-extent.js for what that
             cost and how the frame is derived; the decision lives there because it is pure and so
             can be measured in Node against the real Natural Earth geometry. */
          const CE=()=>window.IntMapCountryExtent;
          const _labelOf=(p)=>(p&&p.LABEL_X!=null&&p.LABEL_Y!=null)?[+p.LABEL_X,+p.LABEL_Y]:null;
          const _homeOf=(feat)=>{ try{ const M=CE(); return M?M.homeExtent(feat&&feat.geometry,_labelOf(feat&&feat.properties)):null; }catch(_){ return null; } };
          const _fullOf=(feat)=>{ try{ const M=CE(); return M?M.fullExtent(feat&&feat.geometry):null; }catch(_){ return null; } };
          /* ══ ⚠⚠⚠ (#R375) ONE CONSTRUCTOR, BECAUSE TWO LOOPS BUILD THIS RECORD ════════════════════
             #R195 split this load in two — the 110 m file for the ATTRIBUTES at boot, the 10 m file for
             the GEOMETRY once the browser is idle — on the premise that «the attributes are identical at
             every Natural Earth scale». That is true of a FEATURE and false of a FILE: 110 m carries 177
             codes, 10 m carries 252. The upgrade below was written as a pure ENRICHMENT pass
             (`const s=HOST.countryStats[code]; if(!s) return;`), so the 75 codes only the fine file has
             never got a row — while `countryGeo` DID become the fine collection. The table and the
             geometry have disagreed ever since, and nothing said so.

             MEASURED ON PRODUCTION (#R392's verification pass, then this round's count): `codeAtPoint`
             answered 'SGP' over Singapore and `countryStats.SGP` was `undefined`, so `exFacts`
             (js/atlas-examples.js) got `st=null`, `usePlace` went false and the Atlas starter chips fell
             through to the WORLD pool — 「日本・ドイツ・インドを比較」 while the reader is looking at
             Singapore. 29 of the 75 are sovereign states (Singapore, Malta, Monaco, Vatican City,
             Bahrain, Maldives, Mauritius, Andorra, Liechtenstein, San Marino, Cape Verde, Comoros,
             Seychelles, São Tomé and Príncipe and 15 small island states), 26 dependencies, 9 more
             self-governing territories (Hong Kong, Macau, Aruba, Curaçao, Jersey …).

             ⚠ THE FIX IS NOT A SPECIAL CASE FOR SINGAPORE. The upgrade now CREATES the row it cannot
             find, and it builds it HERE — the one constructor both loops call — so the coarse pass and
             the fine pass cannot drift apart again. Whichever file supplies a code, its row is the same
             record built the same way. */
          const _mkStat=(f,code,area)=>{
            const p=f.properties||{};
            const pop=+p.POP_EST||0;
            const gdp=(GDP[code]!=null)?GDP[code]:(p.GDP_MD!=null?+p.GDP_MD/1000:(p.GDP_MD_EST!=null?+p.GDP_MD_EST/1000:null));
            const a2=(p.ISO_A2_EH&&p.ISO_A2_EH!=='-99')?p.ISO_A2_EH:p.ISO_A2;
            /* (#R23) flag non-sovereign / unrecognized features (Scarborough Shoal, Bir Tawil, Bajo Nuevo,
               ice fields …) so "Random country" + quizzes never serve them as if they were states.
               ══ ⚠⚠⚠ (#R423) …BUT NATURAL EARTH'S OWN `TYPE` OUTRANKS THE VIEWPOINT FIELDS ══════════
               The record CONTRADICTS ITSELF for Norway — `TYPE:"Sovereign country"` and
               `FCLASS_TLC:"Unrecognized"` on the same row — and the old predicate read only the second
               half, so Norway came out `sov:false`. The two fields are not two opinions about one
               question: `TYPE` says what the feature IS, while the `FCLASS_*` family classifies THIS
               POLYGON from one point of view. Norway's own `WOE_NOTE` says why the ISO viewpoint differs
               — «Does not include Svalbard, Jan Mayen, or Bouvet Islands» — and NE blanks its
               ISO_A3/ISO_A2/ISO_N3 to `-99` for that same reason. Nothing on the row disputes the state.
               ⚠ THE FCLASS FAMILY DEMONSTRABLY IS NOT A STATEHOOD FIELD: Somaliland and Northern Cyprus,
               the two genuinely unrecognized states in the file, carry `FCLASS_ISO:"Unrecognized"` with
               `FCLASS_TLC:"Admin-0 country"` — the opposite arrangement — and are listed today.

               MEASURED. The row was BUILT and then filtered away at every site that asks `sov!==false`:
               the Countries list (`renderStats` below — 240 rows, no Norway at ANY year, the present
               included), the 5-country comparison picker (js/stats-compare.js `cList`), every Atlas
               ranking (js/atlas-console.js «top N by X»), the Atlas starter chips (js/atlas-examples.js)
               and the era-label name map (js/time-borders.js `tagSame`) — while the map drew «Norway»
               the whole time. One `sov` flag, six readers, and nothing compared what is DRAWN with what
               is LISTED; tests/r423-checks.test.mjs is that comparison, and the R423 step of
               tests/r410.spec.js makes it again against the rendered DOM.

               ⚠ THIS IS NOT A SPECIAL CASE FOR NORWAY AND IT DOES NOT WEAKEN #R23. Counted over both
               shipped files, the FCLASS branch flags 4 features at 110 m and 13 at 10 m, and every one
               of them EXCEPT Norway is already `TYPE:"Indeterminate"`; no `TYPE:"Country"` feature
               carries such an FCLASS at all. Letting TYPE win therefore moves exactly one verdict at
               each scale, and Scarborough Shoal, Serranilla, Bajo Nuevo, Bir Tawil, Wake, Siachen, the
               Southern Patagonian Ice Field and the Cyprus buffer zone all stay flagged. */
            const _neType=String(p.TYPE||'');
            const _neCountry=/^(sovereign country|country)$/i.test(_neType);
            const _nonSov=(_neType==='Indeterminate')||(!_neCountry&&/indetermin|unrecogn/i.test(String(p.FCLASS_TLC||p.featurecla||p.FEATURECLA||'')));
            return { code, ccn3:String(p.ISO_N3||''), nameEn:p.NAME_EN||p.ADMIN||p.NAME||code, nameJp:p.NAME_JA||p.NAME_EN||p.ADMIN||code,
              sov:!_nonSov,
              pop, area:Math.round(area), _area:area, density:(pop&&area)?pop/area:null, region:p.CONTINENT||'', subregion:p.SUBREGION||'',
              /* (#R185) THE COUNTRY'S OWN FOOTPRINT, so the search can frame it instead of guessing.
                 js/place-framing.js prefers a published extent over a class zoom for exactly the reason
                 #R183 gave — it is a measurement — but a LOCAL match (a country name typed into the
                 search box, resolved against this table without touching a geocoder) had no extent to
                 offer, so every country from Russia to Vatican City was framed at the one `country`
                 zoom of 4.4. Measured: Monaco, Singapore, Vatican City and Japan all landed on 4.4.
                 The geometry that answers this is already in hand here — one pass over the winning
                 feature's rings, done once per country at load.
                 (#R426) …and it is the country's HOME extent, not the union of everything it owns.
                 The union put Norway back on 4.4 and flew New Zealand to zoom 3.2; see the ⚠ block
                 above `_homeOf` and js/country-extent.js. */
              bbox:_homeOf(f),
              /* (#R426) the union is still published, under a name that says what it is, for the one
                 reader that needs a SUPERSET rather than a frame: js/atlas-view-subject.js refuses a
                 country outright when the sampled point is outside this box before paying for a
                 ray-cast, and a refusal computed from the home extent would deny that Bouvet Island
                 is in Norway. */
              bboxAll:_fullOf(f),
              /* (#R240) the ISO 3166-1 alpha-2 is KEPT, not just used for the flag: it is the key
                 Intl.DisplayNames needs to name this country in the reader's own language — see
                 `cName` in js/app-body.js. Without it every language but Japanese read English. */
              a2:a2||'',
              capital:CAPITAL[code]||'', latlng:(p.LABEL_Y!=null&&p.LABEL_X!=null)?[+p.LABEL_Y,+p.LABEL_X]:null, flag:flagFromISO2(a2),
              currency:CURRENCY[code]||'', languages:LANGS[code]||'', gdp, gdppc:(gdp&&pop)?(gdp*1e9/pop):null,
              hdi:HDI[code]||null, dem:DEM[code]||null, milSpend:MILSPEND[code]||null, lifeExp:LIFE[code]||null, internet:INTERNET[code]||null };
          };
          gj.features.forEach(f=>{
            const p=f.properties||{};
            let code=(p.ISO_A3_EH&&p.ISO_A3_EH!=='-99')?p.ISO_A3_EH:((p.ISO_A3&&p.ISO_A3!=='-99')?p.ISO_A3:(p.ADM0_A3||''));
            if(!code||code==='-99'){ f.id=undefined; return; }
            f.id=code; if(f.properties) f.properties.__code=code;  /* used as promoteId so feature ids are stable codes */
            let area=0; try{ area=turf.area(f)/1e6; }catch(e){}
            /* (#R15) Natural Earth 10 m assigns minor territory polygons (Ashmore & Cartier, Coral Sea
               Islands, Indian Ocean Territories …) the SOVEREIGN's ISO_A3_EH code. Whichever such polygon
               came last in the file overwrote the real country's name/stats — e.g. "Australia" turned into
               a tiny territory's name. Keep the LARGEST-area feature per code so the mainland always wins. */
            const existing=HOST.countryStats[code];
            if(existing && existing._area!=null && existing._area>=area) return;
            HOST.countryStats[code]=_mkStat(f,code,area);
          });
          /* ══ (#R195) …AND THE 10 m OUTLINE ARRIVES WHEN THE BROWSER IS FREE ═══════════════════════
             The same shape #R192 gave the CShapes bundle: eager, because the first Countries(info)
             hover must not block on 4.3 MB, but gated on the main thread being idle with a ceiling so
             a permanently busy page still gets it, and a floor of the map's own first idle.

             ⚠ IT MERGES, IT DOES NOT REPLACE THE RECORD. `countryStats[code]` is enriched IN PLACE
             after this load by at least three other things — the PPP pass (#R22), the indicator
             gap-fill, and the time machine's snapshot/restore — so handing each code a fresh object
             here would silently drop whichever of them had already run. Only the three fields the
             GEOMETRY decides are refreshed; every other attribute is identical at 110 m and 10 m
             (Natural Earth keeps one attribute table across scales), which is exactly why the small
             file could stand in for the rows in the first place. */
          if(coarse){
            const upgrade=async()=>{
              const hi=await grab('ne_10m_admin_0_countries.geojson');
              if(!(hi&&hi.features&&hi.features.length)) return;
              /* ⚠ (#R195) IN CHUNKS, WITH A YIELD. This walks ~548,000 vertices and runs turf.area on
                 every feature; as one loop it is a single long task, and it lands 4-10 s after boot —
                 the window the renderer tests assert in. Nothing here is urgent, so it gives the
                 thread back every 16 features. Same reason the tsunami's bathymetry pass yields every
                 8 rows (#R193): the work is fine, holding the thread while doing it is not. */
              const best=new Map(), fs=hi.features;
              for(let i=0;i<fs.length;i++){
                const f=fs[i], p=f.properties||{};
                let code=(p.ISO_A3_EH&&p.ISO_A3_EH!=='-99')?p.ISO_A3_EH:((p.ISO_A3&&p.ISO_A3!=='-99')?p.ISO_A3:(p.ADM0_A3||''));
                if(!code||code==='-99'){ f.id=undefined; continue; }
                f.id=code; if(f.properties) f.properties.__code=code;
                let area=0; try{ area=turf.area(f)/1e6; }catch(e){}
                /* (#R15) the largest-area polygon per code is the mainland — same rule as above */
                const cur=best.get(code); if(!cur||area>cur.area) best.set(code,{area,f});
                if((i&15)===15) await new Promise(r=>setTimeout(r,0));
              }
              let added=0;
              best.forEach((v,code)=>{ const s=HOST.countryStats[code];
                /* ⚠⚠⚠ (#R375) A CODE THE COARSE FILE NEVER HAD GETS A ROW, NOT A `return`. This line read
                   `if(!s) return;` — an enrichment pass over a table assumed to already hold every code.
                   It does not (see the constructor above), and the 75 it misses are precisely the ones
                   `codeAtPoint` starts answering the moment the line below swaps `countryGeo` to the fine
                   collection. Creating the row here is what keeps THE TABLE AND THE GEOMETRY THE SAME SET:
                   they change in the same pass, off the same file, or they do not change at all. */
                if(!s){ HOST.countryStats[code]=_mkStat(v.f,code,v.area); added++; return; }
                /* an EXISTING row is enriched IN PLACE, never replaced — see the ⚠ above `upgrade` */
                s.area=Math.round(v.area); s._area=v.area;
                s.density=(s.pop&&v.area)?s.pop/v.area:null;
                s.bbox=_homeOf(v.f)||s.bbox; s.bboxAll=_fullOf(v.f)||s.bboxAll; });
              /* ⚠⚠⚠ (#R393) A ROW CREATED HERE IS A PRESENT-DAY ROW, AND THIS PASS LANDS AFTER THE CLOCK
                 MAY ALREADY HAVE TRAVELLED. `_mkStat` reads the file: 2024's population and GDP. Below
                 the World Bank's 1960 floor js/time-countries.js overlays ONCE, so nothing would ever
                 come back to correct it — MEASURED on production at 1860, Singapore ($501B) and Hong
                 Kong ($382B) ranked first and third above the Russian Empire. The time engine is asked
                 to bring the new rows into the year on screen; it answers false when the clock is live,
                 so this costs a function call on a normal session. */
              if(added){ try{ const TC=window.IntMapTimeCountries; if(TC&&TC.reapply) TC.reapply(); }catch(_){} }
              HOST.countryGeo=hi; window.countryGeo=hi;
              /* ⚠ (#R195) DO NOT PUSH IT AT THE RENDERER UNLESS SOMETHING WILL DRAW IT. The 10 m
                 collection is 258 features and ~548,000 vertices; handing that to the engine rebuilds
                 every feature on the main thread. `country-fill`/`country-line` are created hidden and
                 only shown by Countries(info), so on a default session that rebuild is pure cost with
                 nothing on screen to show for it — and it lands 4-10 s after boot, right where the
                 renderer tests are asserting. It cost two CI runs: on Cesium, r180 ④ and ⑤ went red
                 («the drawn feature is pickable», «entities 0») while every other shard stayed green,
                 and the same specs pass on main. Hold it instead, and flush it the moment the layer
                 is actually made visible (window._imFlushCountryGeo, called by applyCountryVisibility). */
              window._imCountryGeoPending=hi;
              try{ if(typeof window._imFlushCountryGeo==='function') window._imFlushCountryGeo(); }catch(_){}
              try{ HOST.rebuildGeoIndex(); }catch(_){}
              /* ⚠ (#R375) ROWS THAT ARRIVE AFTER BOOT HAVE TO BE HANDED TO WHATEVER ALREADY READ THE TABLE.
                 Two readers finished before this pass and cache what they saw:
                   · `loadGdpPPP` (js/app-body.js) merges the World Bank PPP figures over `Object.keys(
                     countryStats)` ONCE, chained off `countryDataPromise` — which resolves on the coarse
                     file. Without a re-run these rows would carry no PPP for the life of the tab AND of
                     every later tab, because the merge is served from a 30-day localStorage cache and
                     would re-run against the same coarse table next time. `reapplyPPP` replays the kept
                     payload over the whole table; it is not a second copy of the merge.
                   · the Countries tab is the desktop default (#R170), so it is already on screen — with
                     29 sovereign states missing from a list that claims to be all of them. */
              if(added){ try{ HOST.reapplyPPP(); }catch(_){}
                try{ if(HOST.mode==='stats') renderStats(HOST.searchVal()); }catch(_){} }
            };
            /* ⚠ (#R201) A PHONE TAKES THE DATA-SAVER SCHEDULE, NOT THE DESKTOP ONE. Measured on a
               390×844 session: 4.3 MB of 10 m geometry starts at t≈8 s, on the same connection the
               satellite tiles are still using, for an outline that on a 390-pixel-wide screen is
               indistinguishable from the 110 m one already loaded. That contention is the mechanism
               behind 「モバイル版で、衛星画像が圧倒的に重い」 — the imagery is not heavy, it is queued.
               NOTHING IS DROPPED: the upgrade still runs and still corrects the areas, densities and
               bounding boxes; it simply waits until the view the user is actually looking at has
               finished arriving. `_imFlushCountryGeo` (#R195) still pushes it at the renderer the
               moment Countries(info) is switched on, whenever that happens. */
            const go=()=>{ let slow=false;
              try{ const c=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
                slow=!!(c&&(c.saveData===true||/(^|-)2g$/.test(c.effectiveType||''))); }catch(_){}
              try{ if(HOST.isMobile&&HOST.isMobile()) slow=true; }catch(_){}
              const run=()=>{ upgrade().catch(()=>{}); };
              if(slow) setTimeout(run,15000);              /* on Data Saver the 4.3 MB is a real cost */
              else if(typeof requestIdleCallback==='function') requestIdleCallback(run,{timeout:6000});
              else setTimeout(run,3000); };
            let started=false; const once=()=>{ if(started) return; started=true; go(); };
            try{ GE().events.once('idle',()=>setTimeout(once,400)); }catch(_){}
            setTimeout(once,4000);
          }
        }
      }catch(e){ console.warn('country load failed',e); }
      finally{
        /* (#R40) ROOT CAUSE of "Isolate / Country borders / Countries(info) を押しても反応しない、再読み込みで治る":
           if the FIRST border-GeoJSON fetch failed (slow/blocked CDN on a cold load), countryGeo stayed null
           but countryDataPromise stayed RESOLVED FOREVER, so every later call short-circuited on the cached
           (empty) promise and nothing ever worked — until a full page reload reset the promise. Now, on a
           FAILED load, clear the cached promise + flags so the very next call (a click) transparently retries
           the fetch. On success, latch as before. */
        const ok=!!(HOST.countryGeo&&HOST.countryGeo.features&&HOST.countryGeo.features.length);
        if(ok){ HOST.countryDataLoaded=true; if(_imCanDraw()) addCountryLayers();
          /* (#R25/#28) now that countryStats exists, rebuild the geo index so the auto-country/capital
             entries join the gazetteer → the non-AI news locator gains full global coverage. */
          try{ HOST.rebuildGeoIndex(); }catch(_){}
          /* (#R127) borders are here now → re-spread any live news pins that were placed as a tight blob while
             countryGeo was still loading (regionFor had no polygon), so country clusters fill the real territory. */
          try{ if(typeof HOST._respreadNews==='function') HOST._respreadNews(); }catch(_){}
        } else { HOST.countryDataLoaded=false; HOST.countryDataPromise=null; }
      } }
    )();
    HOST.countryDataPromise.then(()=>{ try{ HOST.loadGdpPPP(); }catch(_){} });   /* (#R22) enrich with PPP once base stats exist */
    return HOST.countryDataPromise;
  }

  let hoveredCid=null;

  function addCountryLayers(){
    /* the engine is built inside map.on('load'); a call that beats it must not throw (#R172) */
    if(!_LY()||!_imCanDraw()||!HOST.countryGeo||_LY().hasSource('countries')) return;
    _LY().addSource('countries',{type:'geojson',data:HOST.countryGeo,promoteId:'__code'});
    _LY().add({id:'country-fill',type:'fill',source:'countries',layout:{visibility:'none'},paint:{'fill-color':'#007aff','fill-opacity':['case',['boolean',['feature-state','hover'],false],0.30,0]}},'tool-poly');
    _LY().add({id:'country-line',type:'line',source:'countries',layout:{visibility:'none'},paint:{'line-color':'#007aff','line-opacity':0.7,'line-width':['case',['boolean',['feature-state','hover'],false],2.4,0.6]}},'tool-poly');
    /* (#R26) Create the always-on country-BORDERS line HERE (when the countries source first exists), not
       only inside the cb-borders change handler — that lazy-create meant borders were checked-by-default but
       NOT drawn on load until you re-toggled them ("デフォルト選択されているのに表示されない"). applyTheme()
       sets its visibility from bordersOn (default true). */
    try{ HOST.ensureBordersLayer(); }catch(_){}   /* (#R40) borders-only-line now comes from the OFM boundary layer (accurate, basemap-aligned) — created here too in case Countries(info) initializes first */
    _EV().onLayer('mousemove','country-fill',(e)=>{ if(!HOST.countryInfoOn||HOST.toolMode||!e.features.length)return;
      /* (#R130) during time-travel do NOT highlight / read out the MODERN country under the cursor — that showed
         modern Ukraine/Lithuania info while hovering interwar Poland. The era name labels identify countries; the
         click handler above resolves the era entity on demand. */
      if(window.IntMapTimeBorders&&window.IntMapTimeBorders.active&&window.IntMapTimeBorders.active()){ if(hoveredCid!==null){ try{ _LY().setFeatureState({source:'countries',id:hoveredCid},{hover:false}); }catch(_){} hoveredCid=null; } return; }
      const f=e.features[0]; if(hoveredCid!==null)_LY().setFeatureState({source:'countries',id:hoveredCid},{hover:false}); hoveredCid=f.id; _LY().setFeatureState({source:'countries',id:hoveredCid},{hover:true}); showCountryInfo(f); });
    _EV().onLayer('mouseleave','country-fill',()=>{ if(hoveredCid!==null)_LY().setFeatureState({source:'countries',id:hoveredCid},{hover:false}); hoveredCid=null; HOST.hideCountryInfo(); });
    /* (#R130) ROOT CAUSE of the long-standing "昔の年代でも地図クリック国選択が現代国境になる" re-report (survived
       R122–R129): every prior round fixed the era-aware CROSSHAIR pickers (#scp-pick / #csearch-pick) + the resolveHist
       ladder — which were already correct — but the gesture the user actually performs, a PLAIN click on a country
       during time-travel, was handled by THIS era-UNAWARE country-fill handler. It resolved against the MODERN
       countryGeo, so clicking interwar Poland's Lwów gave modern Ukraine and Vilnius gave modern Lithuania (Warsaw/
       Kraków only looked "right" because their modern carrier is still POL — hence the intermittent, 1920s-Poland
       feel). Now, during travel, the plain click routes through the SAME era PIP → resolveHist path the pickers use
       and NEVER falls back to the modern polygon. */
    _EV().onLayer('click','country-fill',(e)=>{ if(!(HOST.countryInfoOn&&!HOST.toolMode&&!window.__scpPick&&e.features.length)) return;
      const TB=window.IntMapTimeBorders;
      if(TB&&TB.active&&TB.active()){
        try{
          /* defer to a specific place label under the click (city / water / peak / river) so a city still opens as a
             PLACE, exactly like the era name-label handler (_clk) does — only bare country land opens the country. */
          const specific=['ofm-city','ofm-other','geo-sea','ofm-water','ofm-water2','ofm-river','ofm-peak'].filter(id=>{ try{ return !!_LY().has(id); }catch(_){ return false; } });
          if(specific.length&&e.point&&_GE().coords.queryRenderedFeatures(e.point,{layers:specific}).length) return;
          const ll=e.lngLat; let nm=null, geom=null; const fc=TB.currentFC&&TB.currentFC();
          if(fc&&fc.features&&typeof turf!=='undefined'){ const tp=turf.point([ll.lng,ll.lat]); let bA=Infinity;
            for(const ff of fc.features){ try{ if(ff.geometry&&turf.booleanPointInPolygon(tp,ff)){ const bb=turf.bbox(ff); const a=(bb[2]-bb[0])*(bb[3]-bb[1]); if(a<bA){ bA=a; nm=ff.properties&&(ff.properties.NAME||ff.properties.name); geom=ff.geometry; } } }catch(_){} } }
          if(nm&&TB.resolveHist){ const R=TB.resolveHist(nm,ll)||{};
            if(R.code&&HOST.countryStats[R.code]){ showCountryDetail(R.code, R.name||nm); return; }
            /* a real era entity with no comparable stats carrier — open its era place popup (name/wiki/flag), not the
               modern country that sits there today. */
            if(typeof window._imPlacePopup==='function'){ window._imPlacePopup(ll,(R.name||nm),true,{geojson:(R.geometry||geom),wiki:(R.wiki||nm),flag:R.flag}); return; } }
        }catch(_){}
        return;   /* during travel, NEVER resolve a country click to the modern polygon */
      }
      const f=e.features[0]; const p=f.properties||{}; const id=HOST.resolveCountryId(f); showCountryDetail(id, p.NAME_EN||p.ADMIN||p.NAME); });
    HOST.applyCountryVisibility();
  }

  const fmtNum=(n)=>n||n===0?Number(Math.round(n)).toLocaleString():'—';

  const fmtArea=(a)=>a?Number(Math.round(a)).toLocaleString()+' km²':'—';

  function showCountryInfo(feat){
    const id=HOST.resolveCountryId(feat), s=HOST.countryStats[id], p=document.getElementById('country-info'),
          name=HOST.cName(s,feat.properties&&(feat.properties.NAME_EN||feat.properties.ADMIN||feat.properties.NAME));
    const haveAny = s && (s.pop||s.gdp||s.area||s.hdi||s.dem||s.milSpend);
    p.innerHTML=`<div class="ci-name">${s&&s.flag?s.flag+' ':'🏳️ '}${name}</div>
      <div class="ci-row"><span>${HOST.t('statPop')} (${POP_YEAR})</span><b>${s&&s.pop?fmtNum(s.pop):HOST.t('dataNA')}</b></div>
      <div class="ci-row"><span>${HOST.t('statGdp')} (${GDP_YEAR})</span><b>${s&&s.gdp?HOST.fmtMoney(s.gdp):HOST.t('dataNA')}</b></div>
      <div class="ci-row"><span>${HOST.t('statGdpPPP')}</span><b>${s&&s.gdpPPP?HOST.fmtMoney(s.gdpPPP):HOST.t('dataNA')}</b></div>
      <div class="ci-row"><span>${HOST.t('statGdpPc')}</span><b>${s&&s.gdppc?HOST.fmtPc(s.gdppc):HOST.t('dataNA')}</b></div>
      <div class="ci-row"><span>${HOST.t('statGdpPcPPP')}</span><b>${s&&s.gdppcPPP?HOST.fmtPc(s.gdppcPPP):HOST.t('dataNA')}</b></div>
      <div class="ci-row"><span>${HOST.t('statHDI')}</span><b>${s&&s.hdi?s.hdi.toFixed(3):HOST.t('dataNA')}</b></div>
      <div class="ci-row"><span>${HOST.t('statDem')}</span><b>${s&&s.dem?s.dem.toFixed(2):HOST.t('dataNA')}</b></div>
      <div class="ci-row"><span>${HOST.t('statMil')}</span><b>${s&&s.milSpend?'$'+s.milSpend+'B':HOST.t('dataNA')}</b></div>
      <div class="ci-row"><span>${HOST.t('statCapital')}</span><b>${s&&s.capital?s.capital:HOST.t('dataNA')}</b></div>
      <div class="ci-row"><span>${HOST.t('statArea')}</span><b>${s&&s.area?fmtArea(s.area):HOST.t('dataNA')}</b></div>`;
    p.style.display='block';
  }

  async function enrichCountry(id){
    if(!id) return null;
    const s=HOST.countryStats[id];
    if(!s) return null;
    if(s._enrichedTried) return s;
    s._enrichedTried=true;
    try{
      const r=await fetch(`https://restcountries.com/v3.1/alpha/${encodeURIComponent(id)}?fields=name,capital,languages,currencies,population,area,region,subregion,flag,latlng,timezones,car,callingCodes,demonyms,borders,independent,unMember`);
      if(!r.ok) return s;
      const j=await r.json(); const c=Array.isArray(j)?j[0]:j; if(!c) return s;
      if(!s.capital && c.capital && c.capital.length) s.capital=c.capital[0];
      if(!s.languages && c.languages) s.languages=Object.values(c.languages).join(', ');
      if(!s.currency && c.currencies){ const cur=Object.entries(c.currencies)[0]; if(cur) s.currency=`${cur[0]}${cur[1]&&cur[1].name?' ('+cur[1].name+')':''}`; }
      if(!s.pop && c.population) s.pop=c.population;
      if((!s.area||s.area<1) && c.area) s.area=c.area;
      if(!s.density && s.pop && s.area) s.density=s.pop/s.area;
      if(!s.region && c.region) s.region=c.region;
      if(!s.subregion && c.subregion) s.subregion=c.subregion;
      if((!s.flag||s.flag==='🏳️') && c.flag) s.flag=c.flag;
      if(!s.latlng && c.latlng && c.latlng.length===2) s.latlng=c.latlng;
      if(c.timezones) s.timezones=c.timezones;
      if(c.borders) s.borders=c.borders;
      if(c.independent!=null) s.independent=c.independent;
      if(c.unMember!=null) s.unMember=c.unMember;
      if(c.demonyms){ const eng=c.demonyms.eng; if(eng){ s.demonym=(eng.m||eng.f||''); } }
    }catch(e){}
    return s;
  }

  function renderCountryDetailBody(s){
    if(!s) return `<div class="cm-row"><span>${HOST.t('dataNA')}</span><b>—</b></div>`;
    const _de=HOST.lang==='de', _jp=HOST.lang==='jp', _ru=HOST.lang==='ru', _es=HOST.lang==='es';
    const TR=window.IntMapLang.pick(()=>HOST.lang);
    const yn=v=>v?TR('Yes','はい','Ja','Да','Sí'):TR('No','いいえ','Nein','Нет','No');
    const sec=(title,rows)=>{ const r=rows.filter(Boolean); if(!r.length) return ''; return `<div class="cp-sec"><div class="cp-sec-h">${title}</div>`+r.map(([k,v])=>`<div class="cm-row"><span>${k}</span><b>${v}</b></div>`).join('')+`</div>`; };
    const geo=sec('🌍 '+TR('Geography','地理','Geografie','География','Geografía'),[
      [HOST.t('statRegion'),(s.region||'—')+(s.subregion?' / '+s.subregion:'')],
      [HOST.t('statCapital'),s.capital||'—'],
      [HOST.t('statArea'),fmtArea(s.area)],
      [HOST.t('statDensity'),s.density?fmtNum(Math.round(s.density))+' /km²':'—'],
      (s.borders&&s.borders.length)?[TR('Neighbours','隣接','Nachbarländer','Соседи','Fronteras'),s.borders.join(', ')]:null,
      (s.timezones&&s.timezones.length)?[TR('Timezones','時間帯','Zeitzonen','Часовые пояса','Zonas horarias'),s.timezones.slice(0,3).join(', ')+(s.timezones.length>3?'…':'')]:null
    ]);
    /* (#R94) when the master clock has travelled to a past year, the WB-synced rows carry THAT year;
       HDI (UNDP) and the Democracy Index (EIU) have no WB annual series so they keep their own year. */
    const _ty=(typeof window!=='undefined'&&window._imTimeYear)||null; const YR=(def)=>_ty||def; const yrTag=()=>(_ty?` (${_ty})`:'');
    const _milB=(v)=>'$'+(Math.round(v*10)/10)+'B';
    const econ=sec('💰 '+TR('Economy','経済','Wirtschaft','Экономика','Economía'),[
      [((s._real||window._imTimeReal)?('GDP · '+TR('real 2011 int$','実質2011年国際ドル','real, int$ 2011','реальный, межд.$ 2011','real int$ 2011')):HOST.t('statGdp'))+` (${YR(GDP_YEAR)})`,HOST.fmtMoney(s.gdp)],
      s.gdpPPP?[HOST.t('statGdpPPP'),HOST.fmtMoney(s.gdpPPP)]:null,
      [HOST.t('statGdpPc')+yrTag(),HOST.fmtPc(s.gdppc)],
      s.gdppcPPP?[HOST.t('statGdpPcPPP'),HOST.fmtPc(s.gdppcPPP)]:null,
      [HOST.t('statCurrency'),s.currency||'—']
    ]);
    const soc=sec('👥 '+TR('Society','社会','Gesellschaft','Общество','Sociedad'),[
      [HOST.t('statPop')+` (${YR(POP_YEAR)})`,fmtNum(s.pop)],
      s.hdi?[HOST.t('statHDI')+' (2022)',s.hdi.toFixed(3)]:null,
      s.lifeExp?[HOST.t('statLife')+yrTag(),s.lifeExp.toFixed(1)+' '+TR('yr','年','J','лет','a')]:null,
      s.internet?[HOST.t('statInet')+yrTag(),(Math.round(s.internet*10)/10)+'%']:null,
      [HOST.t('statLang'),s.languages||'—']
    ]);
    const pol=sec('🏛 '+TR('Politics & defense','政治・防衛','Politik & Verteidigung','Политика и оборона','Política y defensa'),[
      s.dem?[HOST.t('statDem')+' (2023)',s.dem.toFixed(2)]:null,
      s.milSpend?[HOST.t('statMil')+` (${YR(2023)})`,_milB(s.milSpend)]:null,
      s.unMember!=null?[TR('UN member','国連加盟','UN-Mitglied','Член ООН','Miembro de la ONU'),yn(s.unMember)]:null
    ]);
    let histNote='';
    if(s._hist){ const yrs=(s._from?s._from.slice(0,4):'')+'–'+(s._to?s._to.slice(0,4):'');
      histNote=`<div class="cp-histnote">🏛 <b>${TR('Former state','かつて存在した国家','Ehemaliger Staat','Бывшее государство','Estado desaparecido')}</b> · ${yrs}<br>${TR('GDP & population: Maddison Project (real GDP, 2011 int$). Other indicators: World Bank aggregate of the successor states.','GDP・人口: マディソン・プロジェクト（実質GDP・2011年国際ドル）。その他の指標: 後継国の世界銀行データを合算。','BIP & Bevölkerung: Maddison-Projekt (reales BIP, int$ 2011). Übrige: Weltbank-Summe der Nachfolgestaaten.','ВВП и население: проект Мэддисона (реальный ВВП, межд.$ 2011). Прочее: сумма стран-преемников (Всемирный банк).','PIB y población: Proyecto Maddison (PIB real, int$ 2011). Resto: suma del Banco Mundial de los estados sucesores.')} ${TR('Borders on the map follow the era.','地図の国境も当時のものになります。','Grenzen folgen der Epoche.','Границы на карте — той эпохи.','Las fronteras del mapa siguen la época.')}</div>`; }
    return `<div id="cp-intro" class="cp-intro"></div>`+histNote+geo+econ+soc+pol;
  }

  /* (#R39) Fill the intro with a Wikipedia summary (extract + thumbnail + link) in the active language. */
  const _cpIntroCache={};

  function _fillCountryIntro(name){
    try{
      const intro=document.getElementById('cp-intro'); if(!intro||!name) return;
      const wl=HOST.lang==='jp'?'ja':HOST.lang==='de'?'de':HOST.lang==='ru'?'ru':HOST.lang==='es'?'es':'en';
      const key=wl+':'+name;
      const esc=tt=>String(tt==null?'':tt).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
      const paint=(html)=>{ const i2=document.getElementById('cp-intro'); if(i2&&html) i2.innerHTML=html; };
      if(_cpIntroCache[key]!=null){ paint(_cpIntroCache[key]); return; }   /* re-render flash-free */
      fetch('https://'+wl+'.wikipedia.org/api/rest_v1/page/summary/'+encodeURIComponent(String(name).replace(/ /g,'_')))
        .then(r=>r.ok?r.json():null).then(j=>{
          if(!j || j.type==='disambiguation'){ _cpIntroCache[key]=''; return; }
          const extract=j.extract||'', img=(j.thumbnail&&j.thumbnail.source)||'', url=(j.content_urls&&j.content_urls.desktop&&j.content_urls.desktop.page)||'';
          if(!extract && !img){ _cpIntroCache[key]=''; return; }
          const html=(img?'<img src="'+esc(img)+'" alt="" class="cp-intro-img" loading="lazy">':'')
            +(extract?'<p class="cp-intro-text">'+esc(extract)+'</p>':'')
            +(url?'<a href="'+esc(url)+'" target="_blank" rel="noopener" class="cp-wiki-link">'+HOST.t('readWiki')+'</a>':'');
          _cpIntroCache[key]=html; paint(html);
        }).catch(()=>{});
    }catch(_){}
  }

  function showCountryDetail(id,fallback){
    const idStr=String(id||'');
    let s=HOST.countryStats[idStr];
    const name=HOST.cName(s,fallback);
    const popup=document.getElementById('country-popup');
    document.getElementById('cp-title').innerHTML=(s&&s.flag?s.flag+' ':'🏳️ ')+name;
    const body=document.getElementById('cp-body');
    window._cpCurrent={code:idStr,name:name};   /* read by the isolate + time-series buttons */
    const _isoSvg='<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3"/></svg>';
    const _tsSvg='<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m7 14 4-4 3 3 5-6"/></svg>';
    const _topBtnCss='flex:1;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:9px 6px;border:none;border-radius:10px;background:var(--input-bg);color:var(--text-main);font-weight:600;font-size:12px;cursor:pointer;';
    const _aiSvg='<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3M5.6 5.6l2.1 2.1M3 12h3M18 12h3M16.3 7.7l2.1-2.1"/><circle cx="12" cy="14" r="5"/></svg>';
    const _cmpSvg='<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 20V10M12 20V4M18 20v-7"/></svg>';
    const _aiName=encodeURIComponent(name).replace(/'/g,'%27');
    const topBtns=()=>`<div style="display:flex;gap:6px;margin:0 0 12px;">`
      /* ══ ⚠ (#R236) THREE OF THESE FOUR HAD NO SPANISH AT ALL ═══════════════════════════════════════
         「ドイツ語、ロシア語、スペイン語について、すべての面において対応が完璧かどうか最終点検し」

         `t(lang, en, jp, de, ru, es)` is POSITIONAL, and these were written as
         `HOST.lang==='de' ? '…' : t(HOST.lang, en, jp, undefined, ru)` — German hoisted out in front
         of the call and the German SLOT left undefined, with the Spanish slot simply absent. German
         was therefore fine and Spanish fell through to English on Isolate / Time-series / AI brief,
         which is invisible to the positional audit (scripts/i18n-positional-audit.mjs reads `L(…)`
         call sites, and these are `t(…)` with a ternary in front — #R231's blind spot, one level
         further in). Folded back into the call so every language is one argument in one place. */
      +`<button data-cpact="isolate" style="${_topBtnCss}"><span style="color:var(--primary-color);display:inline-flex;">${_isoSvg}</span>${window.IntMapLang.t(HOST.lang,'Isolate','この国だけ','Nur dieses Land','Только эту страну','Solo este país')}</button>`
      +`<button data-cpact="timeseries" style="${_topBtnCss}"><span style="color:var(--primary-color);display:inline-flex;">${_tsSvg}</span>${window.IntMapLang.t(HOST.lang,'Time-series','時系列グラフ','Zeitverlauf','Динамика','Series temporales')}</button>`
      +`<button data-cpact="brief" data-cpname="${_aiName}" style="${_topBtnCss}"><span style="color:var(--primary-color);display:inline-flex;">${_aiSvg}</span>${window.IntMapLang.t(HOST.lang,'AI brief','AI調査','KI-Bericht','ИИ-справка','Informe de IA')}</button>`
      +`<button data-cpact="compare" style="${_topBtnCss}"><span style="color:var(--primary-color);display:inline-flex;">${_cmpSvg}</span>${window.IntMapLang.t(HOST.lang,'Compare','国を比較','Vergleichen','Сравнить','Comparar')}</button>`
      +`</div>`;
    if(s && s.latlng) window._cpCurrent._ll={lng:s.latlng[1],lat:s.latlng[0]};
    /* ⚠ SEC: A VALUE INTERPOLATED INTO AN EVENT ATTRIBUTE HAS BECOME JAVASCRIPT SOURCE.
       Each attribute rewritten here carried a runtime value inside an `on…="…"` string, so the only thing
       between that value and execution was the quoting around it. Some were safe by the column's type
       (a bigint id) and one was not safe by anything (`dashboard_cards.layer_ref` is admin-editable
       TEXT); the point is that the difference lived in a schema rather than in this file. The value now
       travels as a data-attribute — a VALUE the whole way — and one delegated listener on the container
       does the call. Behaviour is identical (same target, same function, same argument), and delegation
       is what makes it survive the container being re-rendered, which is why the attributes existed. */
    if(body && !body.__imCpWired){ body.__imCpWired=1;
      body.addEventListener('click',(ev)=>{ const b=ev.target.closest('[data-cpact]'); if(!b||!body.contains(b)) return;
        const a=b.getAttribute('data-cpact');
        try{
          if(a==='isolate'){ if(window.IntMapIsolate) window.IntMapIsolate.enter((window._cpCurrent||{}).code); return; }
          if(a==='timeseries'){ if(window.IntMapTimeSeries) window.IntMapTimeSeries.open(); return; }
          /* (#R311) the country card's Compare item is a door into the on-demand comparison panel */
          if(a==='compare'){ window.IntMapLazy.need('statsCompare').then(()=>{ try{ if(window.IntMapStatsCompare) window.IntMapStatsCompare.open(); }catch(_){} }); return; }
          if(a==='brief'){
            /* the SAME ladder the attribute used to spell out, verbatim: Atlas if it is (or can be)
               loaded, then the console's own brief, then the research panel. `_aiName` was already
               encodeURIComponent'd — it is read back out of the attribute and decoded exactly as before. */
            const _n=decodeURIComponent(b.getAttribute('data-cpname')||'');
            const _l=(window._cpCurrent&&window._cpCurrent._ll)||null;
            if(window.IntMapAtlas){ window.IntMapAtlas.ensure().then(function(C){ try{
              if(C&&C.brief){ C.brief(_n,_l); } else if(window.IntMapAIResearch){ window.IntMapAIResearch.open(_n,_l); } }catch(e2){} }); }
            else if(window.IntMapConsole&&window.IntMapConsole.brief){ window.IntMapConsole.brief(_n,_l); }
            else if(window.IntMapAIResearch){ window.IntMapAIResearch.open(_n,_l); }
          }
        }catch(e){}
      });
    }
    body.innerHTML=topBtns()+renderCountryDetailBody(s);
    _fillCountryIntro((s&&(s._hist||s._histId)&&s.wiki)||name);
    if(s && s.latlng){ try{ _CM().flyTo({center:[s.latlng[1],s.latlng[0]],zoom:3.5,speed:1.0}); }catch(_){} }
    /* Asynchronously enrich and re-render (#R9b: keep the action buttons at the top) */
    if(s) enrichCountry(idStr).then(()=>{ if(popup.style.display==='block'){ body.innerHTML=topBtns()+renderCountryDetailBody(HOST.countryStats[idStr]); _fillCountryIntro((s&&(s._hist||s._histId)&&s.wiki)||name); } document.getElementById('cp-title').innerHTML=(s.flag?s.flag+' ':'🏳️ ')+HOST.cName(s,fallback); });
    /* (#R94) let the time-machine refresh THIS card's numbers in place (no re-fly / no re-fetch) when the
       global clock moves — closes over the live idStr/body/topBtns for the currently-open country. */
    window._imCountryCardRefresh=()=>{ try{ if(popup.style.display!=='block'||!window._cpCurrent||window._cpCurrent.code!==idStr) return; const s2=HOST.countryStats[idStr]; if(s2&&body){ body.innerHTML=topBtns()+renderCountryDetailBody(s2); _fillCountryIntro((s&&(s._hist||s._histId)&&s.wiki)||name); } }catch(_){} };
    popup.style.display='block';
    /* Initial centered position (viewport coords). Drag handle wires in once. */
    if(!popup.dataset.placed){
      const vw=window.innerWidth, vh=window.innerHeight;
      const w=popup.offsetWidth||380, h=popup.offsetHeight||400;
      popup.style.left=Math.max(12,(vw-w)/2)+'px';
      popup.style.top=Math.max(60,(vh-h)/2)+'px';
      popup.dataset.placed='1';
      HOST.makeDraggable(popup, popup.querySelector('.country-popup-header'));
    }
  }

  function renderStats(q){
    const feed=document.getElementById('countries-feed')||document.getElementById('live-news-feed'); HOST.clearMarkers();
    /* (#R69) the 5-country comparison view owns the feed while it is open — a deferred renderStats (e.g. the
       loadCountryData().then below firing after the user opened the comparison) must NOT clobber it; its own
       "Back to statistics" button removes the view before calling renderStats. */
    if(document.getElementById('scp-view')) return;
    if(!HOST.countryDataLoaded){ feed.innerHTML=`<div class="empty-msg">${HOST.t('loadingData')}</div>`; loadCountryData().then(()=>{ if(HOST.mode==='stats')renderStats(HOST.searchVal()); }); return; }
    /* (#R94b) hide successors while a former state is shown. (#R101) also drop non-sovereign geographic features
       (reefs / glaciers / no-man's-land — Scarborough Shoal, Southern Patagonian Ice Field, Bir Tawil …) that are
       flagged sov:false; they are neither states, unrecognized states, nor regions and don't belong in Countries. */
    let arr=Object.values(HOST.countryStats).filter(s=>s.nameEn && !s._histHidden && s.sov!==false);
    if(arr.length===0){ feed.innerHTML=`<div class="empty-msg">${HOST.t('noData')}</div>`; return; }
    if(q) arr=arr.filter(s=>s.nameEn.toLowerCase().includes(q)||(s.nameJp&&s.nameJp.includes(q)));
    /* (#R122) apply the numeric threshold filters (each active condition must hold; a country missing that
       indicator is excluded from a threshold on it — honest, not counted as passing). */
    const _actF=HOST.statsFilters.filter(f=>f&&f.key&&isFinite(f.val));
    if(_actF.length) arr=arr.filter(s=>_actF.every(f=>{ const v=s[f.key]; if(!isFinite(v)) return false; return f.op==='lte'?(v<=f.val):(v>=f.val); }));
    const key=HOST.statsSort, dir=HOST.statsSortDir;
    /* (#R102) sort by the chosen indicator in the chosen direction. Numeric: missing/zero values sort to the END in
       BOTH directions (so ascending never fills the top with un-populated countries). Name: locale-aware A–Z / Z–A. */
    arr.sort((a,b)=>{
      if(key==='name'){ const av=(HOST.lang==='jp'?(a.nameJp||a.nameEn||''):(a.nameEn||'')), bv=(HOST.lang==='jp'?(b.nameJp||b.nameEn||''):(b.nameEn||'')); const c=av.localeCompare(bv,HOST.lang==='jp'?'ja':undefined); return dir==='asc'?c:-c; }
      const av=a[key], bv=b[key]; const aOk=isFinite(av)&&av>0, bOk=isFinite(bv)&&bv>0;
      if(!aOk&&!bOk) return 0; if(!aOk) return 1; if(!bOk) return -1;
      return dir==='asc'?(av-bv):(bv-av);
    });
    /* (#R102) indicator PULLDOWN + ascending/descending toggle (replaces the old button row). */
    /* (#R105) + GDP per capita, GDP (PPP) and GDP per capita (PPP) selectable in the Countries pulldown (real WB data). */
    const IND=[['gdp',HOST.t('sortGdp')],['gdppc',HOST.t('statGdpPc')],['gdpPPP',HOST.t('statGdpPPP')],['gdppcPPP',HOST.t('statGdpPcPPP')],['pop',HOST.t('sortPop')],['area',HOST.t('sortArea')],['hdi',HOST.t('sortHDI')],['milSpend',HOST.t('sortMil')],['lifeExp',HOST.t('sortLife')],['tfr',HOST.t('sortTfr')],['name',HOST.t('sortName')]];
    /* (#R104) refined minimal SVG arrow instead of the plain-text ↑ / ↓ glyphs; both labels stacked so the button
       width never changes on toggle (see .ssd-labels CSS). */
    const _ssdArrow=up=>'<svg class="ssd-arrow" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">'+(up?'<path d="M12 19.5V5M6.5 11l5.5-6 5.5 6"/>':'<path d="M12 4.5V19M6.5 13l5.5 6 5.5-6"/>')+'</svg>';
    const dirLbl=_ssdArrow(dir==='asc')+'<span class="ssd-labels" data-dir="'+(dir==='asc'?'asc':'desc')+'"><span class="ssd-l ssd-l-asc">'+HOST.t('sortAsc')+'</span><span class="ssd-l ssd-l-desc">'+HOST.t('sortDesc')+'</span></span>';
    /* (#R122) numeric-filter control next to the sort. Indicators = the sortable numeric ones (drop 'name'). */
    const _FIND=IND.filter(([k])=>k!=='name');
    const _nActF=HOST.statsFilters.filter(f=>f&&f.key&&isFinite(f.val)).length;
    const _funnel='<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h18l-7 8v6l-4 2v-8z"/></svg>';
    const filterBtn=`<button type="button" class="stats-filter-btn${HOST.statsFilterOpen?' on':''}${_nActF?' has':''}" onclick="_sfToggle()" title="${HOST._sfL('Filter by value','数値で絞り込み','Nach Wert filtern','Фильтр по значению','Filtrar por valor')}">${_funnel}${_nActF?`<span class="sf-badge">${_nActF}</span>`:''}</button>`;
    const _sfPanel=(()=>{ if(!HOST.statsFilterOpen) return '';
      const opts=(sel)=>_FIND.map(([k,l])=>`<option value="${k}"${sel===k?' selected':''}>${l}</option>`).join('');
      const rows=HOST.statsFilters.map((f,i)=>`<div class="sf-row"><select onchange="_sfSetKey(${i},this.value)">${opts(f.key)}</select><select class="sf-op" onchange="_sfSetOp(${i},this.value)"><option value="gte"${f.op!=='lte'?' selected':''}>≥</option><option value="lte"${f.op==='lte'?' selected':''}>≤</option></select><input type="text" class="sf-val" value="${(f.raw||'').replace(/"/g,'&quot;')}" placeholder="${HOST._sfL('value (5M, 20000…)','値（5M, 20000…）','Wert','значение','valor')}" onchange="_sfSetVal(${i},this.value)"><button type="button" class="sf-x" onclick="_sfRemove(${i})" title="${HOST.t('remove')||'×'}">×</button></div>`).join('');
      return `<div class="stats-filter-panel">${rows||`<div class="sf-empty">${HOST._sfL('No conditions yet.','条件がありません。','Keine Bedingungen.','Нет условий.','Sin condiciones.')}</div>`}<div class="sf-actions"><button type="button" class="sf-add" onclick="_sfAdd()">+ ${HOST._sfL('Add condition','条件を追加','Bedingung','Условие','Añadir')}</button>${HOST.statsFilters.length?`<button type="button" class="sf-clear" onclick="_sfClear()">${HOST._sfL('Clear','クリア','Löschen','Очистить','Limpiar')}</button>`:''}</div></div>`; })();
    let html=`<div class="stats-toolbar"><select class="stats-sort-sel" onchange="setStatsSort(this.value)">${IND.map(([k,l])=>`<option value="${k}"${HOST.statsSort===k?' selected':''}>${l}</option>`).join('')}</select><button type="button" class="stats-sort-dir" onclick="toggleStatsSortDir()" title="${HOST.t('sortDir')}">${dirLbl}</button>${filterBtn}</div>${_sfPanel}`;
    /* (#R101) in time-machine (historical) mode the figures are REAL GDP (Maddison, 2011 int$), not nominal. */
    const _histY=window._imTimeYear||null;
    /* (#R102) the value column now carries ONLY the number ($3.4T etc.) — no indicator name on the card, per request. */
    const metricVal=(s)=>{ switch(key){
      case 'pop': return fmtNum(s.pop);
      case 'area': return fmtArea(s.area);
      case 'gdppc': return (s.gdppc&&isFinite(s.gdppc))?('$'+Math.round(s.gdppc).toLocaleString()):'—';
      case 'gdpPPP': return (s.gdpPPP&&isFinite(s.gdpPPP))?HOST.fmtMoney(s.gdpPPP):'—';
      case 'gdppcPPP': return (s.gdppcPPP&&isFinite(s.gdppcPPP))?('$'+Math.round(s.gdppcPPP).toLocaleString()):'—';
      case 'hdi': return s.hdi?(+s.hdi).toFixed(3):'—';
      case 'milSpend': return s.milSpend?'$'+s.milSpend+'B':'—';
      case 'lifeExp': return (s.lifeExp&&isFinite(s.lifeExp))?((+s.lifeExp).toFixed(1)+(window.IntMapLang.t(HOST.lang,' yr','歳',' J',' л',' a'))):'—';
      case 'tfr': return (s.tfr&&isFinite(s.tfr))?(+s.tfr).toFixed(2):'—';
      default: return HOST.fmtMoney(s.gdp);   /* gdp + name */
    } };
    /* (#R94/#R101) Time-machine status bar — year + the CURRENTLY-SORTED indicator. (#R103) it used to always say
       "real GDP" no matter which indicator was chosen ("どの指標を選んでもGDPとなっている") — reflect the selection. */
    const _L5b=window.IntMapLang.pick(()=>HOST.lang);
    const _bMetric=(key==='pop')?_L5b('population','人口','Bevölkerung','население','población')
      :(key==='area')?_L5b('area','面積','Fläche','площадь','superficie')
      :(key==='hdi')?'HDI'
      :(key==='milSpend')?_L5b('military spending','軍事費','Militärausgaben','военные расходы','gasto militar')
      :(key==='lifeExp')?_L5b('life expectancy','平均寿命','Lebenserwartung','прод. жизни','esperanza de vida')
      :(key==='tfr')?_L5b('fertility rate','合計特殊出生率','Geburtenrate','рождаемость','fecundidad')
      :_L5b('real GDP (2011 int$)','実質GDP（2011年国際ドル）','reales BIP (int$ 2011)','реальный ВВП (межд.$ 2011)','PIB real (int$ 2011)');
    try{ const _ty=_histY, _pw=window._imTimePreWB;
      if(_ty){ html+=`<div class="stats-timebanner"><b>${_ty}${window.IntMapLang.t(HOST.lang,'','年')}</b> · ${_bMetric}</div>`; }
      else if(_pw){ html+=`<div class="stats-timebanner warn"><b>${_pw}</b> · ${window.IntMapLang.t(HOST.lang,'latest available figures','最新の入手可能な値','neueste verfügbare Werte','последние доступные значения','últimos valores disponibles')}</div>`; }
    }catch(_){}
    /* (#R70) the separate "Compare countries (up to 5)" button is RETIRED per instruction — country-row clicks
       build the selection and the dock's view button opens the unified comparison. */
    if(arr.length===0) html+=`<div class="empty-msg">${HOST.t('noMatch')}</div>`;
    /* (#R137) optional rank number on the far left (Settings → "Rank numbers", default OFF). The rank is the row's
       position in the CURRENT sort+filter, so it tracks whatever indicator/direction is active. */
    const _showRank=(window.imShowRank!=='off');   /* (#R139) rank numbers now default ON (show unless explicitly turned off) */
    /* (#R142) rank = the country's standing in the CURRENTLY-SORTED indicator by VALUE (largest = 1), NOT the row
       position — so toggling ascending/descending actually moves "#1" (the old i+1 kept showing 1,2,3… top-to-bottom
       for every sort/direction → "順序を変えても順位が変わらない"). In time-machine mode s[key] already holds the
       historical value, so the rank is the historical rank. Name sort falls back to the GDP rank. Rank over the shown set. */
    const _rankKey=(key==='name')?'gdp':key;
    const _rankOf=new Map(); arr.slice().filter(s=>isFinite(s[_rankKey])&&s[_rankKey]>0).sort((a,b)=>b[_rankKey]-a[_rankKey]).forEach((s,ri)=>_rankOf.set(s.code,ri+1));
    arr.forEach((s,i)=>{
      const active=HOST.compareSet.has(s.code)?'compare-on':'';
      /* (#R102) region / capital separated by a SLASH (was a middot); the value column shows the number only. */
      /* ⚠ (#R251) THE CONTINENT WAS PRINTED RAW. `s.region` is English in the table, so the sub-line
         under every country name read «Europe / Berlin» in all nine languages — found by
         tests/r251.spec.js, which reads the rendered DOM rather than the source. The seven regions
         are a closed set, so they are a table of calls; the capital is a place name and stays. */
      const subline=`${s.region?_regionName(s.region):''}${(s.region&&s.capital)?' / ':''}${s.capital||''}`;
      const rankHTML=_showRank?`<span class="stat-rank">${_rankOf.get(s.code)||'—'}</span>`:'';
      /* (#R115) native hover tooltip = the FULL country name (the .stat-name is ellipsized on narrow cards). */
      html+=`<div class="stat-row ${active}" data-ccn="${s.code}" title="${String(HOST.cName(s)||'').replace(/"/g,'&quot;')}">${rankHTML}<span class="stat-flag">${s.flag||'🏳️'}</span><div class="stat-main"><div class="stat-name">${HOST.cName(s)}</div><div class="stat-sub">${subline}</div></div><div class="stat-val">${metricVal(s)}</div></div>`;
    });
    feed.innerHTML=html;
    feed.querySelectorAll('.stat-row').forEach(row=>{
      /* Single-click → add/remove from compare; double-click → open detail */
      let clickTimer=null;
      row.onclick=(e)=>{
        if(clickTimer){ clearTimeout(clickTimer); clickTimer=null; showCountryDetail(row.getAttribute('data-ccn')); return; }
        clickTimer=setTimeout(()=>{ window._toggleCompare(row.getAttribute('data-ccn')); clickTimer=null; },250);
      };
    });
    feed.style.paddingBottom='92px';   /* leave room for the fixed compare panel */
    HOST.renderCompareFixed();
  }

  /* The names index.html still calls: it keeps a hoisted shim for each (#R168). */
  return { renderStats, showCountryDetail, renderCountryDetailBody, loadCountryData, addCountryLayers };
};
