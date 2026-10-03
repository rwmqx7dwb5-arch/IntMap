/* ============================================================================
 *  IntMap · Search box: query pre-processing, geocoding and the result card  (#R169)
 * ----------------------------------------------------------------------------
 *  Moved VERBATIM out of the index.html DOMContentLoaded closure (Architecture.md §3.1).
 *  Every statement here is a DECLARATION — the factory runs no app code, so it can be
 *  instantiated with the other #R168/#R169 factories right after `map` exists.
 *  The only edit to the moved text is that free references to closure variables became
 *  HOST.<member> reads/writes.
 * ==========================================================================*/
import { IntMapGeoEngine } from './geo-engine.js';
import { IntMapLang } from './lang-registry.js';
import { icon } from './icons.js';   /* (icon-system) the one icon set — js/icons.js */
import { MAP_ANSWER_EVENT } from './mobile-sheet.js';
import * as bus from './bus.js';

/* ══ (showcase-gallery) THE EMPTY FIELD SHOWS THE EXAMPLE MAPS ═══════════════════════════════════════════
   With the caret in the place search and nothing typed, the result list under it holds the example maps and the
   classroom tours (js/showcase-gallery.js showInResults) — the app's door to them, which nothing opens unasked:
   it appears because the reader went to the field, and the first letter replaces it with place candidates.
   Delegated on the document and not inside the factory below, because the factory runs no app code (its header)
   and this has to hear the field from the first focus. The module is fetched on that first focus, not at boot.
   The same import answers any control marked `data-im-gallery` (the whole gallery, js/showcase-gallery.js). */
function _galleryEmptyState(inp, res){
  if(!inp||!res) return;
  import('./showcase-gallery.js').then((G)=>{
    /* asked again when the module has arrived: the reader may have typed, or left, meanwhile */
    if(document.activeElement!==inp||inp.value.trim()) return;
    G.showInResults(res);
  }).catch(()=>{});
}
if(typeof document!=='undefined'){
  document.addEventListener('focusin',(e)=>{ const inp=/** @type {HTMLInputElement} */ (e.target); if(inp&&inp.id==='ms-input'&&!inp.value.trim()) _galleryEmptyState(inp,document.getElementById('ms-results')); });
  document.addEventListener('input',(e)=>{ const inp=/** @type {HTMLInputElement} */ (e.target); if(!inp||inp.id!=='ms-input') return;
    const res=document.getElementById('ms-results'); if(!res) return;
    if(!inp.value.trim()) _galleryEmptyState(inp,res);
    else if(res.querySelector('.sg-strip')){ res.style.display='none'; res.innerHTML=''; } });   /* the first letter: the cards make way for the candidates */
  document.addEventListener('click',(e)=>{ const el=/** @type {Element} */ (e.target); const b=el&&el.closest?el.closest('[data-im-gallery]'):null;
    if(b) import('./showcase-gallery.js').then((G)=>G.openGallery({ section:b.getAttribute('data-im-gallery')||null })).catch(()=>{}); });
}

export function searchGeocode(HOST){
  const GE=()=>IntMapGeoEngine;   /* (#R178) the renderer, through the contract — never the raw handle */
  /* ===== Map-side global place search (Nominatim) + abstract / natural-language pre-processing =====
   * Handles patterns like:
   *   - "capital of <country>"
   *   - "highest mountain in <country>"
   *   - "largest city in <country>"
   *   - "<place> nearest to <city>"
   *   - country names by stat ("country with highest GDP")
   * For anything we can't pattern-match, we just hand the raw query to Nominatim, which
   * itself is reasonably forgiving for natural-language queries.
   */
  function preprocessNLQuery(q){
    const ql=q.toLowerCase().trim();
    /* "capital of <country>" → look up CAPITAL[code] */
    const mCap=ql.match(/^capital\s+of\s+(.+)$/) || ql.match(/^(.+?)の首都$/);
    if(mCap){
      const name=mCap[1].trim();
      const hit=Object.values(HOST.countryStats||{}).find(s=>{
        const en=(s.nameEn||'').toLowerCase(), jp=s.nameJp||'';
        return en===name || en.includes(name) || jp.includes(name);
      });
      if(hit && hit.capital) return hit.capital+', '+hit.nameEn;
    }
    /* "country with the highest <stat>" */
    const STAT_KEYS={'gdp':'gdp','economy':'gdp','population':'pop','area':'area','hdi':'hdi','democracy':'dem','military':'milSpend','life expectancy':'lifeExp','internet':'internet'};
    const mHigh=ql.match(/^(?:country|nation)\s+(?:with\s+)?(?:the\s+)?(?:highest|largest|biggest|most)\s+(.+)$/);
    if(mHigh){
      const key=Object.keys(STAT_KEYS).find(k=>mHigh[1].includes(k));
      if(key){ const sk=STAT_KEYS[key]; const top=Object.values(HOST.countryStats).filter(s=>s[sk]!=null).sort((a,b)=>b[sk]-a[sk])[0]; if(top) return top.nameEn; }
    }
    /* Japanese: "X 最大" / "X 最高" → similar fallback */
    const mJpHigh=ql.match(/^(.+?)(が|の)?(最大|最多|最高)(?:の国)?$/);
    if(mJpHigh){
      const w=mJpHigh[1].trim();
      const SUPERLATIVE={'人口':'pop','GDP':'gdp','面積':'area','軍事費':'milSpend','HDI':'hdi'};   /* (#R171) renamed off `map`: a local called `map` SHADOWS the renderer the factory is handed — the #R163 trap, now inert here only because this file no longer uses the renderer at all */
      const sk=SUPERLATIVE[w]; if(sk){ const top=Object.values(HOST.countryStats).filter(s=>s[sk]!=null).sort((a,b)=>b[sk]-a[sk])[0]; if(top) return top.nameEn; }
    }
    return q;
  }
  /* ══ ⚠⚠⚠ (search-identity) A ROW'S NAME AND ITS POINT COME FROM ONE RECORD ═══════════════════════════════
     Observed on production (2026-10-03, b797887): 「Tokyo」 offered 「Japan · Tokyo」, and the row flew to
     36.143°N 138.442°E — Japan's label point, a mountainside in Nagano, 932 m up — and wrote 「Japan」 into the
     field. The row was a CAPITAL match drawn with the COUNTRY's coordinate: the country table knows a capital's
     NAME (`s.capital`) and nothing about where it is, so the row borrowed `s.latlng`. A label from one record
     over a point from another. #R93d had measured the same thing from the other side (「Riga」 → Latvia's
     centroid, 83 km out) and worked around it in ONE caller, js/atlas-geo-resolve.js `geocode`, which declined
     to trust a `capital` row; the search box, which shows the row to a reader, never was.
     ⇒ The country table only says WHICH place is the capital. The row is the gazetteer's record OF that place —
       its own name, its own point, its own population — found by name AND country (GeoNames' iso2 against the
       country's alpha-2), or, for a curated row that carries no country, by lying inside the country's own
       extent. A capital the device holds no record of yields no row here; the three geocoders still answer it.
       A capital is therefore a city row whose kind says what the country table knows about it — the same row
       a name match on the gazetteer finds, so the two fold into one rather than standing side by side.
     ⚠ AND A RESEMBLANCE IS MEASURED BY THE ONE MEASURE THE OTHER DOORS USE. #R15/#R19 tolerated typos with an
       edit distance of 2 — half of a five-letter word: 「Tokyo」 offered Togo, Takeo, Mokpo and Soyo. The Dice
       agreement js/atlas-geo-resolve.js states (`placeRules.agreement` ≥ NAME_AGREE_MIN) keeps 「osakaa」 → Osaka
       (0.89) and 「Tokio」 → Tokyo (0.50) and refuses all four (0.29, 0, 0.25, 0.29). It is BORROWED, not
       restated: `doGeocode` awaits the rules before it asks; a synchronous caller that reaches this before the
       rules module has loaded gets the exact / prefix / containment tiers and no resemblance at all — never a
       guess measured some other way.
     ⚠ ORDER: how much of the name agrees (whole name > prefix > contained > resembles), then what KIND of place
       (the class's own scale in js/place-framing.js's zoom table — a country before a city before a station),
       then how many people live there (the population the record publishes; none ranks after some). */
  function _rulesNow(){ try{ return window.IntMapPlaceRules||null; }catch(_){ return null; } }
  /* folded once per spelling: a keystroke walks ~15,000 rows of several names each, and the fold (NFKC, NFD, a regex)
     is most of the cost of a walk — measured 160–550 ms a query unmemoised, against the 120 ms suggestion timer */
  const _foldMemo={rules:new Map(), plain:new Map()};
  function _fold(R,s){ const key=String(s==null?'':s), m=(R&&R.nkey)?_foldMemo.rules:_foldMemo.plain; let v=m.get(key);
    if(v===undefined){ v=key.toLowerCase().trim(); try{ if(R&&R.nkey) v=R.nkey(key); }catch(_){} m.set(key,v); } return v; }
  /** 3 = one of `names` IS the query, 2 = begins with it, 1 = contains it, 0 < x < 1 = resembles it (the
      rules' agreement, only at or above NAME_AGREE_MIN), 0 = none of these */
  function _nameLevel(R,q,names,fuzzy){
    const k=_fold(R,q); if(!k) return 0; let best=0;
    for(const n of (names||[])){ const f=_fold(R,n); if(!f) continue;
      if(f===k) return 3;
      if(f.startsWith(k)) best=Math.max(best,2);
      else if(k.length>=3&&f.includes(k)) best=Math.max(best,1);   /* the #R19 guard: two letters are inside everything */
      else if(fuzzy&&R&&R.agreement&&best<1&&_shareBigram(k,f)){ try{ const a=R.agreement(q,{name:n}); if(a>=R.NAME_AGREE_MIN&&a>best){
        /* the rules answer 1 for containment in EITHER direction; the name-inside-the-query direction (「osakaa」 ⊃
           Osaka, 「Tokyo Tower」 ⊃ Tokyo) is ranked by how much of the query the name covers, under the tiers above */
        const v=a<1?a:(f.length>=3&&k.includes(f)?f.length/k.length:0); if(v>=R.NAME_AGREE_MIN&&v<1&&v>best) best=v; } }catch(_){} } }
    return best; }
  /* a name that shares no two-letter run with the query has agreement 0 by the rules' own Dice — skip asking */
  function _shareBigram(k,f){ for(let i=0;i<f.length-1;i++) if(k.indexOf(f.slice(i,i+2))>=0) return true; return false; }
  function _classScale(kind){ try{ const PF=window.IntMapPlaceFraming; const z=PF.zoomTable()[PF.placeClass(null,kind)]; return isFinite(z)?z:PF.defaultZoom(); }catch(_){ return Infinity; } }
  /* the ordering above, over {level, scale, pop} */
  function _rankCmp(a,b){ return (b.level-a.level)||(a.scale-b.scale)||((+b.pop||0)-(+a.pop||0)); }
  /* inside a [w, s, e, n] box (js/country-extent.js's shape — `e` may lie past 180 across the antimeridian) */
  function _inBox(b,lng,lat){ if(!Array.isArray(b)||b.length!==4) return false; const w=+b[0],s=+b[1],e=+b[2],n=+b[3];
    if(!(lat>=s&&lat<=n)) return false; const span=((e-w)%360+360)%360||360; return (((lng-w)%360+360)%360)<=span; }
  /* the record the country table's capital NAME refers to: a place of that name IN that country — GeoNames' iso2
     against the country's alpha-2 (the index carries it, js/gazetteer.js), the most populous if several; a curated
     row with no country of its own counts when it stands inside the country's own extent; and a capital too small
     for the index is looked for in the whole list, once per list and country (a linear pass — no 148,000-row index
     is built for the few names that need it). */
  const _capMemo=new WeakMap();
  function _capitalRecord(R,s,gz){
    const k=_fold(R,s.capital); if(!k) return null;
    const a2=String(s.a2||'').toUpperCase(), box=s.bboxAll||s.bbox;
    let best=null;
    if(gz) for(const type in gz) for(const e of gz[type]){ if(!e.loc) continue;
      const terms=Array.isArray(e.terms)?e.terms:String(e.terms||'').split('|');
      if(!terms.some(t=>_fold(R,t)===k)) continue;
      if(e.iso2?(!a2||String(e.iso2).toUpperCase()!==a2):!_inBox(box,+e.loc[0],+e.loc[1])) continue;
      if(!best||(+e.pop||0)>best.pop) best={ name:(e.name&&(e.name[HOST.lang]||e.name.en))||s.capital, names:terms, lng:+e.loc[0], lat:+e.loc[1], pop:+e.pop||0 };
    }
    if(best||!a2) return best;
    let W=null; try{ W=window.IntMapGazetteer&&window.IntMapGazetteer.world&&window.IntMapGazetteer.world(); }catch(_){}
    if(!W||!W.length) return null;
    let m=_capMemo.get(W); if(!m){ m=new Map(); _capMemo.set(W,m); }
    const key=a2+'|'+k; if(m.has(key)) return m.get(key);
    let r0=null; for(const r of W) if(r[7]===a2&&(!r0||(+r[6]||0)>(+r0[6]||0))&&_fold(R,r[4])===k) r0=r;
    const rec=r0?{ name:(HOST.lang==='jp'&&r0[5])?r0[5]:r0[4], names:r0[1], lng:+r0[2], lat:+r0[3], pop:+r0[6]||0 }:null;
    m.set(key,rec); return rec; }
  /* (#R15 / #34) Local place lookup — resolves vague / partial / slightly-misspelled queries against the
     bundled countries, their capitals and the built-in gazetteer, so search still works when the external
     geocoders are slow / rate-limited / too strict for a loose query. Returns ranked rows.
     `score` keeps the scale its callers read (≥ 88 exact — js/routing-ui.js; ≥ 72 strong — doGeocode below);
     `level`, `scale` and `pop` are what the rows are ordered by. */
  function localFuzzyPlaces(q){
    const ql=(q||'').toLowerCase().trim(); if(!ql) return [];
    const R=_rulesNow(), out=[];
    const push=(name,lng,lat,score,kind,bbox,exact,level,pop,names)=>{ lng=+lng;lat=+lat; if(isNaN(lng)||isNaN(lat))return; out.push({name,lng,lat,score,kind:kind||'',bbox:bbox||null,exact:!!exact,level,scale:_classScale(kind),pop:+pop||0,names:names||[name]}); };   /* (#732) `exact` = this row's own name IS the query — the only kind of row a CONFIRMING door (js/atlas-geo-resolve.js `geocode`) may take; the rest are suggestions */   /* (#R46) kind = scale hint (country/capital/city/…) for Atlas zoom */
    let gz=null; try{ gz=(typeof HOST.BUILTIN_GAZETTEER!=='undefined')?HOST.BUILTIN_GAZETTEER:null; }catch(_){}
    /* the tier numbers are the ones these sources have always carried (#R15/#R19); a resemblance stays under all of them */
    const TIER={country:[0,72,86,100], gazetteer:[0,64,68,88]};
    const scoreOf=(src,lv)=>lv>=1?TIER[src][Math.floor(lv)]:Math.round(lv*60);
    const caps=[];
    /* ⚠ A RESEMBLANCE IS A GUESS AT A TYPO, AND A QUERY THAT A NAME ALREADY CONTAINS IS NOT ONE. Over the 15,000-row
       index the agreement floor admits Kyoto (0.75), Toyooka and Toki for 「Tokyo」 — a floor calibrated for judging a
       geocoder's handful of answers, not for enumerating a gazetteer. So the walk asks for the name itself first, and
       only when nothing on the device carries the query does it walk again for resemblances: 「osakaa」 and 「Tokio」
       still find theirs; 「Tokyo」 offers Tokyo. */
    const walk=(fuzzy)=>{
    try{ Object.values(HOST.countryStats||{}).forEach(s=>{
      if(!s.latlng) return;
      const names=[s.nameEn,s.nameJp].filter(Boolean), lv=_nameLevel(R,q,names,fuzzy);
      /* (#R185) a country match carries the country's REAL extent (see js/countries-ui.js), so the search frames
         Monaco like Monaco and Russia like Russia. */
      if(lv>0) push(s.nameEn, s.latlng[1], s.latlng[0], scoreOf('country',lv), 'country', s.bbox, lv===3, lv, s.pop, names);
      if(s.capital) caps.push({s,cl:_nameLevel(R,q,[s.capital],fuzzy)});
    }); }catch(_){}
    try{ if(gz) for(const type in gz){ gz[type].forEach(e=>{ if(!e.loc) return;
        const terms=Array.isArray(e.terms)?e.terms:String(e.terms||'').split('|');
        const lv=_nameLevel(R,q,terms,fuzzy); if(!(lv>0)) return;
        const nm=(e.name&&(e.name[HOST.lang]||e.name.en))||terms[0];
        push(nm, e.loc[0], e.loc[1], scoreOf('gazetteer',lv), type, null, lv===3, lv, +e.pop||0, terms); }); }
    }catch(_){} };
    walk(false);
    if(!out.length&&!caps.some(c=>c.cl>0)&&R){ caps.length=0; walk(true); }
    /* the capitals: the record OF the capital, folded into the gazetteer row that already is that record */
    /* — whether the query named the capital (「Tokyo」) or a row it found carries the capital's name among its own
       (「東京」 finds the curated row whose terms include Tokyo) */
    const folded=new Map(out.map(o=>[o,new Set((o.names||[]).map(t=>_fold(R,t)))]));
    for(const {s,cl} of caps){ try{
      const k=_fold(R,s.capital), z=_classScale('capital');
      const named=out.filter(o=>o.kind!=='country'&&folded.get(o)&&folded.get(o).has(k));
      if(!(cl>0)&&!named.length) continue;
      const rec=_capitalRecord(R,s,gz); if(!rec) continue;
      const twin=named.find(o=>_pxApart(o,rec,z)<=FRAME_PAD_PX);
      if(twin){ twin.kind='capital'; twin.scale=z; twin.pop=Math.max(twin.pop,rec.pop); continue; }
      if(!(cl>0)) continue;
      const lv=Math.max(cl,_nameLevel(R,q,rec.names,cl<1));
      push(rec.name, rec.lng, rec.lat, scoreOf('gazetteer',lv), 'capital', null, lv===3, lv, rec.pop, rec.names);
    }catch(_){} }
    const seen=new Set();
    return out.sort((a,b)=>_rankCmp(a,b)||(b.score-a.score)).filter(x=>{ const k=_fold(R,x.name)+'|'+x.lng.toFixed(1)+'|'+x.lat.toFixed(1); if(seen.has(k))return false; seen.add(k); return true; }).slice(0,7);
  }

  /* ══ ⚠⚠⚠ (#R802) THE SEARCH CARD LISTED ROWS THAT WERE NOT WHAT WAS TYPED ═══════════════════════
     Three geocoders answer this box in parallel and NONE of them was asked whether its row is the
     thing the reader typed. Measured on the deployed build 2026-09-18, through the sibling field in
     js/routing-geocode.js which merges the same two sources: 「Sahara」 → **New York**. Free-text
     search drops the terms it cannot match and returns what is left, 200 OK.
     js/atlas-geo-resolve.js has written that rule down, measured it against a captured gazetteer and
     tested it since #R515 / #R737, and it also holds `regionBox` — IntMap's reviewed extents for the
     names that have no single OSM boundary. Both are BORROWED here through the module's own
     `placeRules` surface; neither is restated. See the long note in js/routing-geocode.js for why the
     module is reached by a lazy `import()` rather than statically or off `window` alone.
     ⚠ AGREEMENT ONLY — NO IMPORTANCE FLOOR. #R19 made this box deliberately typo-tolerant
     (「あいまいな単語を入れても検索できるように」: 「osakaa」 must still find Osaka), and Photon's rows
     carry no `importance` at all. A fuzzy match scores 0.89 here and survives; a stranger scores 0. */
  async function _placeRules(){
    if(window.IntMapPlaceRules) return window.IntMapPlaceRules;
    try{ return (await import('./atlas-geo-resolve.js')).makeAtlasGeoResolve.placeRules; }catch(_){ return null; }
  }
  function _agrees(R,asked,row){ try{ return !R || R.agreement(R.queryCore(asked),row)>=R.NAME_AGREE_MIN; }catch(_){ return true; } }

  /* ══ ⚠⚠⚠ (search-result-dedupe) ONE PLACE IS ONE ROW ═══════════════════════════════════════════
     Reported on production: 「Kyoto」 listed 「Kyoto, Kyoto Prefecture, Japan」 THREE times.
     MEASURED against the three geocoders' live answers (2026-09-27, captured in
     tests/search-result-dedupe-checks.test.mjs): they were not three copies of the city. They were the
     city (Nominatim relation 357794 — Photon's copy of the same relation WAS folded) and Kyoto Station
     twice: Photon answers three railway nodes named 「Kyoto」 within 90 m and labels them identically,
     and the old key `label|lng.toFixed(2)|lat.toFixed(2)` put lat 34.9846 and 34.9853 in DIFFERENT
     0.01° cells. A grid key splits two points that straddle a cell edge however close they are, and
     it merges nothing whose label differs by a word — so Open-Meteo's 「Kyoto, Kyoto, Japan」, the same
     city (GeoNames PPLA, 1.6 km from OSM's point), also stood beside it.
     ⇒ Two rows are one row when a FACT about the feature says so, not when two strings collide:
       1. the same OSM object (Nominatim and Photon both name it) — identity, no measure needed;
       2. otherwise the same KIND, the same NAME and the same PLACE, where
            kind  = js/place-framing.js `placeClass` — the one reading of Nominatim / Photon / GeoNames /
                    gazetteer vocabularies there is (PPLA and boundary/city are both `city`);
            name  = js/atlas-geo-resolve.js `nkey` — the fold (width, case, diacritics) the name rules
                    already use, borrowed through the same `placeRules` surface as `_agrees` above;
            place = one row's point lies inside the other's own extent (`placeExtent`), or the two
                    points land within FRAME_PAD_PX of each other at the zoom this card flies that
                    kind of place to (`framingFor`) — i.e. choosing either row shows the same view.
     A station and the city it stands in stay two rows (different kind); Kyoto in Tanzania stays a row.
     When two rows merge, the one that knows MORE stays — a reviewed home extent over a provider's
     extent over none, then a known kind — and an already-shown row is rewritten in place, so the card
     does not depend on which geocoder happened to answer first.
     ⚠ FRAME_PAD_PX is the margin gotoPlace already leaves around what it frames (one constant, used by
     both). Observed: the Kyoto Station nodes sit 28–34 px apart at the station zoom (14.6), GeoNames'
     and OSM's Kyoto 39 px apart at the city zoom (10.6); the Kyōto subway node, 230 m off, is 89 px
     and stays its own row. EXPIRES if gotoPlace's padding or js/place-framing.js's zoom table changes
     (both are read here, not copied), or if the renderer stops using the 512-px world of MapLibre
     zoom levels. */
  const FRAME_PAD_PX=64;
  function _osmRef(raw){ try{ const t=String(raw&&raw.osm_type||'').charAt(0).toUpperCase(), id=raw&&raw.osm_id; return (t&&id!=null&&id!=='')?t+id:null; }catch(_){ return null; } }
  function _rowFacts(label,lng,lat,raw,kind){
    const PF=window.IntMapPlaceFraming;
    let cls=null, zoom=null, ext=null;
    try{ if(PF){ cls=PF.placeClass(raw,kind)||null; zoom=PF.framingFor(raw,kind).zoom; ext=PF.placeExtent(raw,null); } }catch(_){}
    const own=raw&&typeof raw.name==='string'&&raw.name.trim();
    const name=own||String(label||'').split(',')[0].split(' · ')[0].trim();
    const box=Array.isArray(ext)?ext:null;
    const extRank=box?(raw&&raw.homeExtent?3:2):((ext&&ext.huge)?1:0);
    const within=(raw&&Array.isArray(raw.within))?raw.within.filter((w)=>typeof w==='string'&&w.trim()):[];   /* (ui-a11y-polish) the provider's admin chain, coarse → fine — read by `_paint` in doGeocode */
    return { label, lng, lat, raw, kind, name, cls, zoom, box, within, osm:_osmRef(raw), rich:extRank*2+(cls?1:0) };
  }
  /* Web-Mercator pixel offset between two points at MapLibre zoom `z` (a 512-px world); ±85.0511° is
     where that projection ends. */
  function _pxApart(a,b,z){
    const W=512*Math.pow(2,z), X=(l)=>(l+180)/360*W;
    const Y=(f)=>{ const s=Math.sin(Math.max(-85.0511,Math.min(85.0511,f))*Math.PI/180); return (0.5-Math.log((1+s)/(1-s))/(4*Math.PI))*W; };
    let dx=Math.abs(X(a.lng)-X(b.lng)); dx=Math.min(dx,W-dx);
    return Math.hypot(dx,Y(a.lat)-Y(b.lat));
  }
  function _inside(box,p){ return !!box&&p.lng>=box[0][0]&&p.lng<=box[1][0]&&p.lat>=box[0][1]&&p.lat<=box[1][1]; }
  function _sameFeature(a,b,nameKey){
    if(a.osm&&b.osm&&a.osm===b.osm) return true;
    if(a.cls!==b.cls) return false;
    const na=nameKey(a.name); if(!na||na!==nameKey(b.name)) return false;
    if(_inside(a.box,b)||_inside(b.box,a)) return true;
    const z=Math.max(+a.zoom||0,+b.zoom||0);
    return z>0&&_pxApart(a,b,z)<=FRAME_PAD_PX;
  }

  /* ══ (mobile-shell) TWO WAYS IN: Enter (the full search) and, on a phone, EVERY KEYSTROKE ══════════════════
     `doGeocode({suggest:true})` answers while the reader types — from what is already on the device
     (`localFuzzyPlaces`: the countries, capitals and the gazetteer, the same rows the full search shows first),
     through the SAME row builder and the SAME `gotoPlace`, so a suggestion is a search result one keystroke
     early and not a second implementation. It asks no network; Enter still does. On a phone the last row is
     «Ask Atlas», because the field is the one entry for both a place and a question (`_askAtlasRow`).
     ⚠ A SEARCH THAT HAS BEEN OVERTAKEN WRITES NOTHING. Each call takes a generation; the three geocoders of an
     earlier Enter can answer after the reader has typed on, and their rows would land under the new letters. */
  let _gcGen=0;
  function _wirePicked(inp){ if(!inp||inp._imPickWired) return; inp._imPickWired=true; try{ inp.addEventListener('input',()=>{ inp._imPicked=null; }); }catch(_){} }
  /* a row was chosen: later answers of the same search write nothing, the field holds a name, and on a phone the
     keyboard goes away (the answer is on the map) */
  function _picked(inp,name){ _gcGen++; inp.value=name; inp._imPicked=name.trim(); try{ if(HOST.isMobile()) inp.blur(); }catch(_){} }
  function _askAtlasRow(res,q){
    try{ if(!HOST.isMobile()) return; }catch(_){ return; }
    const d=document.createElement('div'); d.className='ms-item ms-atlas'; d.setAttribute('role','option');
    const t=document.createElement('b'); t.textContent=IntMapLang.t(HOST.lang,'Ask Atlas','Atlasに聞く');
    const s=document.createElement('span'); s.className='ms-kind'; s.textContent=q;
    d.appendChild(t); d.appendChild(s);
    d.onclick=()=>{ res.style.display='none';
      try{ const inp=document.getElementById('ms-input'); if(inp){ inp.value=''; inp.blur(); } }catch(_){}
      /* the Atlas tab opens (the same button the reader would press), then the console — fetched on first use — runs the question */
      try{ const b=document.getElementById('btn-community'); if(b) b.click(); }catch(_){}
      try{ const Z=window.IntMapLazy; (Z?Z.need('atlasConsole'):Promise.resolve()).then(()=>{ const C=window.IntMapConsole; if(C&&C.run) C.run(q); }); }catch(_){} };
    res.appendChild(d);
  }
  const _localRaw=(l)=>(l&&l.bbox)?{ boundingbox:[l.bbox[1],l.bbox[3],l.bbox[0],l.bbox[2]], lat:l.lat, lon:l.lng, homeExtent:true }:null;
  /* (ux-next) go to ONE row of localFuzzyPlaces — the same flight a click on that row in the result list makes; the
     command palette (js/command-palette.js) offers the same rows and must not fly a second way */
  function goToLocal(l){ if(!l||isNaN(+l.lng)||isNaN(+l.lat)) return false; gotoPlace(+l.lng,+l.lat,l.name,_localRaw(l),l.kind||null); return true; }
  async function doGeocode(opt){
    const suggest=!!(opt&&opt.suggest);
    /* (search-identity) Enter: the same search, and then the first candidate is taken — see the end of this function */
    const go=!!(opt&&opt.go)&&!suggest;
    const inp=document.getElementById('ms-input'), q=inp.value.trim(), res=document.getElementById('ms-results');
    /* ⚠ (mobile-shell-flow) A PICK ENDS THE SEARCH. The suggestion timer (js/app-body.js, 120 ms after a keystroke)
       can fire AFTER the reader has already picked a row — MEASURED on production: 「Paris」 typed and its first row
       tapped left eight candidate rows open five seconds later, over the sheet raised for them. What the pick wrote
       into the field is the place's NAME, not a question, so a suggestion for exactly that text is not asked; any
       keystroke after the pick clears the mark (`_wirePicked` below). */
    _wirePicked(inp);
    if(suggest && inp._imPicked!=null && inp._imPicked===q) return;
    const gen=++_gcGen;
    if(!q){ if(suggest&&res){ res.style.display='none'; res.innerHTML=''; _galleryEmptyState(inp,res); } return; }   /* (showcase-gallery) the empty field's own state */
    /* (a11y-shared-dialog) the results are a listbox driven from the field — ArrowDown/ArrowUp move, Enter picks,
       Escape closes the list; focus stays in the field (the combobox pattern js/routing-ui.js's stop field uses).
       Wired once per field, here, because this is the file that renders the rows. */
    if(!inp._imListbox&&window.IntMapDialog) inp._imListbox=window.IntMapDialog.listbox(inp,res,{
      options:()=>res.style.display==='none'?[]:res.querySelectorAll('.ms-item'),
      pick:(el)=>el.click(), close:()=>{ res.style.display='none'; },
      label:IntMapLang.t(HOST.lang,'Search results','検索結果') });
    res.style.display='block';
    /* (#R15e) Make sure the bundled country data is loading so local country/capital matches are available
       (the gazetteer is always loaded; countryStats may not be until Stats is opened). Non-blocking. */
    try{ if(typeof HOST.loadCountryData==='function' && (typeof HOST.countryStats==='undefined' || !HOST.countryStats || !Object.keys(HOST.countryStats).length)) HOST.loadCountryData(); }catch(_){}
    /* (#R198) …and the world gazetteer, for the same reason and on the same terms: localFuzzyPlaces
       below reads HOST.BUILTIN_GAZETTEER, which is 3,482 rows larger once this resolves. Non-blocking
       — this search runs against whatever is loaded now, the next one against more. */
    try{ if(window.IntMapGazetteer&&window.IntMapGazetteer.warm) window.IntMapGazetteer.warm(); }catch(_){}
    const pq=preprocessNLQuery(q);
    const rulesP=_placeRules();   /* (#R802) started here, awaited beside the three geocoders below */
    /* (search-identity) the local rows are measured by the rules' agreement — the first search waits for the module
       (it is already being fetched for the three geocoders below), every later one has it in hand */
    if(!window.IntMapPlaceRules){ try{ await rulesP; }catch(_){} if(gen!==_gcGen) return; }
    const local=localFuzzyPlaces(q);
    /* (search-result-dedupe) the rows on the card, each with what is known about its feature — see
       `_sameFeature` above. The name fold is read when two rows are COMPARED, not when they arrive:
       the local rows below are added before the rules module may have loaded. */
    const rows=[];
    let _rules=window.IntMapPlaceRules||null; rulesP.then((r)=>{ if(r) _rules=r; },()=>{});
    const _nameKey=(s)=>{ try{ if(_rules&&_rules.nkey) return _rules.nkey(s); }catch(_){} return String(s==null?'':s).toLowerCase().trim(); };
    /* (#R183) `kind` rides along so a local (gazetteer / country / capital) match — which has no
       provider metadata at all — still gets framed by what it IS rather than by the default. */
    /* ══ (ui-a11y-polish) WHAT EACH ROW IS, UNDER WHAT IT IS CALLED ═══════════════════════════════
       The fold above leaves the city and Kyoto Station as two rows — correctly, they are two things —
       and both read 「Kyoto, Kyoto Prefecture, Japan」, because Photon's label is name + city + state +
       country and says nothing about kind. So every row carries a quiet second line:
         ① its CLASS, named by js/place-framing.js `classNames` — `placeClass`'s own answer, the one
           already computed for this row (`f.cls`), not a second reading of the provider's type;
         ② and, only when another row on the card still reads the same (same folded NAME, same class),
           the first place it lies WITHIN that the other does not — the provider's own admin chain
           (`raw.within`, coarse → fine), skipping what the label already shows. MEASURED 2026-09-27:
           Photon's 「Kyoto」 station nodes and the subway's 「Kyōto」 fold to one name — and Photon labels
           them 「Kyoto, Kyoto Prefecture, Japan」 and 「Kyōto, Kyoto, Kyoto Prefecture, Japan」, which differ
           only by the city it drops when it equals the name; one point is in Minami Ward and the other in
           Shimogyo Ward, and that is what each row now says.
       Painted for the WHOLE card on every arrival, because a row's twin can arrive after it does. */
    const _kindOf=(cls)=>{ try{ const N=window.IntMapPlaceFraming.classNames(); return (cls&&N[cls])?IntMapLang.pick(()=>HOST.lang).arr(N[cls]):''; }catch(_){ return ''; } };
    const _paint=()=>{
      const same=(a,b)=>a!==b&&a.f.cls===b.f.cls&&_nameKey(a.f.name)===_nameKey(b.f.name);
      rows.forEach((r)=>{
        const twins=rows.filter((o)=>same(r,o)), shown=new Set(String(r.f.label).split(',').map((s)=>_nameKey(s)));
        const inOther=(w)=>twins.every((o)=>(o.f.within||[]).some((x)=>_nameKey(x)===_nameKey(w)));
        const where=twins.length?(r.f.within||[]).find((w)=>!shown.has(_nameKey(w))&&!inOther(w)):null;
        const sub=[_kindOf(r.f.cls),where].filter(Boolean).join(' · ');
        r.el.textContent=r.f.label;
        if(sub){ const s=document.createElement('span'); s.className='ms-kind'; s.textContent=sub; r.el.appendChild(s); }
      }); };
    /* (search-identity) WHERE a row goes on the card: the order localFuzzyPlaces states (`_rankCmp` — how much of the
       name agrees, then the kind's scale, then population), asked of every source alike. A local row arrives with its
       three already measured (its label may be the Japanese name of an English query); a geocoder's row is measured
       here against its own names (`featureNames`, the rules' reading), its class's scale and the population it
       publishes (Open-Meteo does; Nominatim and Photon do not). A row is placed before the first one it outranks,
       so rows already on the card keep their order among themselves. */
    const _rankFor=(f,given)=>{ if(given&&given.level!=null) return {level:given.level,scale:given.scale,pop:given.pop};
      let names=[f.name]; try{ if(_rules&&_rules.featureNames){ const n=_rules.featureNames(f.raw); if(n.length) names=n; } }catch(_){}
      let scale=Infinity; try{ const PF=window.IntMapPlaceFraming, z=PF.zoomTable()[f.cls]; scale=isFinite(z)?z:PF.defaultZoom(); }catch(_){}
      return {level:_nameLevel(_rules,q,names), scale, pop:+(f.raw&&f.raw.population)||0}; };
    const addItem=(label,lng,lat,raw,kind,given)=>{ if(gen!==_gcGen||isNaN(lng)||isNaN(lat))return;
      const f=_rowFacts(label,lng,lat,raw,kind); f.rank=_rankFor(f,given);
      const same=rows.find((r)=>_sameFeature(r.f,f,_nameKey));
      if(same){ if(f.rich>same.f.rich){ same.f=f; _paint(); } return; }   /* the row that knows more stays, rewritten in place */
      const d=document.createElement('div'); d.className='ms-item'; d.setAttribute('role','option'); const row={f,el:d};
      d.onclick=()=>{ const g=row.f; res.style.display='none'; _picked(inp,String(g.label).split(',')[0].split(' · ')[0]); gotoPlace(g.lng,g.lat,g.label,g.raw||null,g.kind||null); };
      const at=rows.findIndex((r)=>_rankCmp(f.rank,r.f.rank)<0);
      if(at<0){ rows.push(row); res.appendChild(d); } else { res.insertBefore(d,rows[at].el); rows.splice(at,0,row); }
      _paint(); };
    /* (#R15e) Show strong LOCAL matches IMMEDIATELY — was awaiting Nominatim with no timeout, so a slow /
       unreachable geocoder left the box frozen on "Loading…" forever ("結果が出てこない"). Now local
       (countries/capitals/gazetteer) appear instantly; the external geocoder is merged in with a hard
       timeout so it can never hang the search. */
    res.innerHTML=''; try{ inp._imListbox.reset(); }catch(_){}
    /* (#R185) …and the extent rides along as the shape js/place-framing.js already reads — a
       Nominatim-style [S, N, W, E] box plus the point — so one ladder frames local and remote
       results alike rather than there being a second copy of the decision here. */
    /* (#R426) `homeExtent` marks WHERE this box came from, and js/place-framing.js reads it to skip
       the OUTLIER test — a guess about a provider box of unknown provenance, and the wrong question
       to ask of one js/country-extent.js has already trimmed. Without it twenty countries held their
       own measured footprint and were still flown to the flat `country` zoom of 4.4. */
    if(suggest){ local.forEach(l=>addItem(l.name,l.lng,l.lat,_localRaw(l),l.kind,l)); _askAtlasRow(res,q); if(!res.children.length) res.style.display='none'; return; }
    local.filter(l=>l.score>=72).forEach(l=>addItem(l.name,l.lng,l.lat,_localRaw(l),l.kind,l));
    /* (search-identity) Enter with a row on the device whose WHOLE name is the query: that row is the answer and it
       is already in hand — go now, ask no network. Anything less waits for the three geocoders (below). */
    if(go&&rows[0]&&rows[0].f.rank.level===3){ rows[0].el.click(); return; }
    if(!res.children.length) res.innerHTML=`<div class="ms-loading">${HOST.t('loading')}</div>`;
    /* (#R16) The mobile "no results" bug: under file:// / on mobile networks Nominatim is often rate-limited,
       blocked (null Origin) or just slow, and on a fresh load countryStats isn't loaded yet, so there was
       NOTHING to show. Now query TWO CORS-friendly geocoders in PARALLEL behind one hard timeout —
       **Open-Meteo geocoding** (fast, robust, fuzzy, works where Nominatim doesn't) AND Nominatim (richer
       coverage). Either one alone yields results, so the search practically never comes back empty. */
    const ctrl=new AbortController(); const to=setTimeout(()=>{ try{ctrl.abort();}catch(_){} },5000);
    const omP=fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=${IntMapLang.locale(HOST.lang,"en")}&format=json`,{signal:ctrl.signal})
      /* (#R183) `feature_code` is carried under its own name as well as `type`: it is a GeoNames code
         (PCLI / ADM1 / PPLC …), not an OSM type, and placeClass reads the two vocabularies apart. */
      .then(r=>r.ok?r.json():null).then(async j=>{ const R=await rulesP; (j&&j.results||[]).forEach(p=>{ if(p.latitude==null||p.longitude==null)return; if(!_agrees(R,q,{name:p.name}))return;   /* (#R802) */ const adm=[p.admin1,p.country].filter(Boolean).join(', '); addItem(p.name+(adm?', '+adm:''),+p.longitude,+p.latitude,{display_name:p.name,type:p.feature_code,feature_code:p.feature_code,population:p.population,address:{country:p.country},within:[p.admin2,p.admin3,p.admin4]}); }); }).catch(()=>{});
    /* (#R489) …behind the app's ONE one-a-second Nominatim floor (js/nominatim-gate.js), reached
       through `window` because this file may contain no top-level declarations (tests/layer-boot-graph-checks.test.mjs (#R175) #4).
       ⚠ IT QUEUES RATHER THAN DROPPING. #R298 measured what dropping does to a typed search — every
       keystroke inside the window answered 「[]」 — and the two parallel geocoders beside this one
       keep answering meanwhile, so the card is never empty while this waits. The 5 s AbortController
       above is still the ceiling, and a search the reader has moved on from is checked for here. */
    const nomP=(window.IntMapNominatimGate?window.IntMapNominatimGate.nominatimSlot():Promise.resolve(true))
      .then(()=>ctrl.signal.aborted?null:fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&accept-language=${IntMapLang.locale(HOST.lang,"en")}&q=${encodeURIComponent(pq)}`,{signal:ctrl.signal}))
      .then(r=>(r&&r.ok)?r.json():[]).then(async a=>{ const R=await rulesP; (a||[]).forEach(pl=>{ if(!_agrees(R,pq,pl))return;   /* (#R802) measured against what was SENT — preprocessNLQuery may have turned 「capital of France」 into 「Paris, France」 */ addItem(pl.display_name,+pl.lon,+pl.lat,pl); }); }).catch(()=>{});
    /* (#R19) Third parallel geocoder: Photon (komoot) — TYPO-TOLERANT like a search engine
       ("あいまいな単語を入れても検索できるように"; curl-verified CORS* and that "osakaa" → Osaka). */
    const phP=fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=6&lang=${HOST.lang==='jp'?'en':'en'}`,{signal:ctrl.signal})
      /* (#R183) Photon publishes `extent` [minLon, maxLat, maxLon, minLat] on most results — a real
         footprint, which beats any class guess — plus osm_key/osm_value as the class fallback. All
         three were being discarded here, so every Photon hit landed on the flat zoom-9 default. */
      .then(r=>r.ok?r.json():null).then(async j=>{ const R=await rulesP; (j&&j.features||[]).forEach(f=>{ try{ const p=f.properties||{}, g=f.geometry; if(!g||!g.coordinates) return;
        if(!_agrees(R,q,{name:p.name}))return;   /* (#R802) */
        const label=[p.name,p.city,p.state,p.country].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(', ');
        if(label) addItem(label,+g.coordinates[0],+g.coordinates[1],{display_name:label,type:p.osm_value||p.type,osm_key:p.osm_key,osm_value:p.osm_value,extent:p.extent,address:{country:p.country},osm_type:p.osm_type,osm_id:p.osm_id,within:[p.county,p.city,p.district,p.locality]}); }catch(_){} }); }).catch(()=>{});
    /* (#R802) …and IntMap's own reviewed extents for the ninety names that have NO single OSM
       boundary (「the Alps」, 「Scandinavia」, 「Middle East」, 「アルプス」). It rides in with the rules
       above rather than being a second table here, and it carries a REAL box, so js/place-framing.js
       frames the Alps like the Alps instead of giving a mountain range the default town zoom. */
    try{ const _R=await rulesP; const _reg=(_R&&_R.regionBox)?_R.regionBox(q):null;
      if(_reg) addItem(_reg.name,_reg.lng,_reg.lat,{boundingbox:[_reg.box[0][1],_reg.box[1][1],_reg.box[0][0],_reg.box[1][0]],lat:_reg.lat,lon:_reg.lng,homeExtent:true},'region'); }catch(_){}
    await Promise.allSettled([omP,nomP,phP]); clearTimeout(to);
    if(gen!==_gcGen) return;   /* (mobile-shell) the reader typed on — this card is no longer theirs */
    const lo=res.querySelector('.ms-loading'); if(lo) lo.remove();
    if(!res.querySelector('.ms-item')){ res.innerHTML=''; rows.length=0; local.forEach(l=>addItem(l.name,l.lng,l.lat,_localRaw(l),l.kind,l)); }   /* weak local fallback */
    if(!res.querySelector('.ms-item')){ res.innerHTML=`<div class="ms-loading">${HOST.t('noMatch')}</div>`; }
    /* ══ (search-identity) ENTER GOES ══════════════════════════════════════════════════════════════════════════
       Observed on production: Enter on 「Tokyo」 did nothing visible for five seconds — it re-ran this search and stopped
       at the card. Enter is the reader saying 「that one」 without pointing, so it takes the first candidate, the row
       the card ranks first, through the row's own click — the same pick, the same flight, the same card. A query
       with no candidate at all leaves the 「no match」 line, and nothing moves. (An IME's confirming Enter never gets
       here: js/app-body.js drops a keydown that is still composing.) */
    if(go&&rows[0]){ rows[0].el.click(); return; }
    _askAtlasRow(res,q);
  }
  let searchCardEl=null, searchCardData=null, searchCardOnMove=null;
  function closeSearchCard(){
    if(HOST.searchMarker){ HOST.searchMarker.remove(); HOST.searchMarker=null; }
    if(searchCardEl){ searchCardEl.remove(); searchCardEl=null; }
    /* ⚠ (#R244) ONE × CLEARS BOTH, which is the whole point of #R59: the place popup owns its
       boundary and closing it takes the boundary with it. The search card now owns one too, so it
       has to be the same contract — otherwise a postcode outline outlives the card that drew it and
       there is no control left that removes it. */
    try{ window.IntMapOutline && window.IntMapOutline.clear && window.IntMapOutline.clear(); }catch(_){}
    /* (#R171) events / camera / projection through IntMapGeoEngine — this file no longer names the renderer. */
    if(searchCardOnMove){ try{ const E=IntMapGeoEngine; if(E) E.events.off('move',searchCardOnMove); }catch(_){} searchCardOnMove=null; }
    searchCardData=null;
  }
  function positionSearchCard(){
    if(!searchCardEl||!searchCardData) return;
    const E=IntMapGeoEngine; if(!E) return;
    const pt=E.coords.project([searchCardData.lng,searchCardData.lat]); if(!pt) return;
    searchCardEl.style.left=pt.x+'px';
    searchCardEl.style.top=pt.y+'px';
    /* (mobile-shell-flow) on a phone the card's two edges are the stylesheet's (between the screen edge and the
       control group — css/intmap.css), so only its tail follows the pin across: that is this variable */
    try{ searchCardEl.style.setProperty('--src-x',pt.x+'px'); }catch(_){}
  }
  /* ── (#R244) postcode → its own boundary ─────────────────────────────────────────────────────
     `_looksPostal` asks the RESULT first (Nominatim types a postcode as `postcode` / `postal_code`,
     which is the answer with no guessing in it) and only falls back to the shape of the string when
     the provider said nothing — Open-Meteo and Photon do not carry the type. The pattern is
     deliberately the intersection of the world's postal formats rather than a per-country table:
     digits, at most one space or hyphen, 3–10 characters, at most two leading letters (GB/NL/CA). */
  const POSTAL_RE=/^[A-Za-z]{0,2}\d[A-Za-z0-9]{1,4}(?:[ -]?[A-Za-z0-9]{1,4})?$/;
  function _looksPostal(label,raw){
    try{
      const ty=String((raw&&(raw.type||raw.osm_value))||'').toLowerCase();
      if(ty==='postcode'||ty==='postal_code') return true;
      if(ty&&ty!=='') return false;   /* the provider typed it as something else — believe it */
      const head=String(label||'').split(',')[0].trim();
      return /\d/.test(head)&&POSTAL_RE.test(head);
    }catch(_){ return false; }
  }
  async function _outlinePostcode(label,raw,lng,lat){
    try{
      const OT=window.IntMapOutline; if(!OT||!OT.show) return;
      const code=String(label||'').split(',')[0].trim(); if(!code) return;
      /* ⚠ BOUNDED TO WHERE THE SEARCH LANDED, NOT «the first five worldwide». A postcode is shared
         across countries — measured, `postalcode=10115` with `limit=5` returns Zagreb, Manhattan,
         Gimpo and Bouira and never reaches Berlin, so the Berlin result the reader just picked had
         no boundary to find. `viewbox` + `bounded=1` around the point that was actually flown to
         returns the ONE postcode area the reader is looking at (measured: 1 result, a Polygon).
         ⚠ 1.5° is comfortably larger than any postal area and small enough to exclude a namesake in
         the next country; the sort below still breaks a tie by distance. */
      const d=1.5;
      const u='https://nominatim.openstreetmap.org/search?format=jsonv2&limit=10&polygon_geojson=1'
        +'&polygon_threshold=0.0003&bounded=1&viewbox='+(lng-d)+','+(lat+d)+','+(lng+d)+','+(lat-d)
        +'&postalcode='+encodeURIComponent(code);
      const _g=window.IntMapNominatimGate; if(_g) await _g.nominatimSlot();   /* (#R489) the one Nominatim floor — js/nominatim-gate.js */
      const r=await fetch(u,{headers:{Accept:'application/json'}}); if(!r.ok) return;
      const j=await r.json(); if(!Array.isArray(j)||!j.length) return;
      const polys=j.filter(o=>o&&o.geojson&&/Polygon/.test(o.geojson.type||''));
      if(!polys.length) return;   /* ⚠ no real boundary → draw NOTHING, exactly like a place label (#R59) */
      /* nearest to where the search actually landed, so a code shared across countries cannot win */
      polys.sort((a,b)=>(Math.hypot(+a.lon-lng,+a.lat-lat))-(Math.hypot(+b.lon-lng,+b.lat-lat)));
      const best=polys[0];
      try{ if(OT.setColor){ const ac=(window.imAccent&&/^#[0-9a-fA-F]{6}$/.test(window.imAccent))?window.imAccent:'#0a84ff'; OT.setColor(ac); } }catch(_){}
      OT.show(code,{geojson:best.geojson,lng,lat,fit:false});
    }catch(_){}
  }
  async function gotoPlace(lng,lat,displayName,raw,localKind){
    const GEO=IntMapGeoEngine; if(!GEO)return;
    closeSearchCard();
    /* (#R183) …instead of zoom 9 for a doorway and zoom 9 for a continent. See framingFor above.
       fitBounds is preferred where the geocoder gave a real extent; cameraForBounds is asked first so
       the flight is a single smooth flyTo rather than fitBounds' own motion, and so a renderer that
       cannot answer the query still gets framed. maxZoom keeps a tiny extent (a single building's
       footprint) from slamming into z20. */
    const fr=window.IntMapPlaceFraming.framingFor(raw,localKind);
    let flown=false;
    if(fr.bounds&&!fr.bounds.huge){
      try{
        const cam=GEO.camera.forBounds(fr.bounds,{padding:FRAME_PAD_PX,maxZoom:16.5});
        if(cam&&cam.center&&isFinite(cam.zoom)){ GEO.camera.flyTo({center:cam.center,zoom:cam.zoom,speed:1.4,essential:true}); flown=true; }
        else { GEO.camera.fitBounds(fr.bounds,{padding:FRAME_PAD_PX,maxZoom:16.5,speed:1.4,essential:true}); flown=true; }
      }catch(_){}
    }
    if(!flown) GEO.camera.flyTo({center:[lng,lat],zoom:fr.zoom,speed:1.4});
    /* Build custom HTML pin element */
    const pinEl=document.createElement('div');
    pinEl.className='search-pin';
    pinEl.innerHTML='<div class="sp-body"></div><div class="sp-pulse"></div>';
    HOST.searchMarker=GE().ui.attach(GE().ui.marker({element:pinEl,anchor:'bottom'}).setLngLat([lng,lat]));
    /* Build the result card */
    searchCardData={lng,lat,name:displayName,raw};
    searchCardEl=document.createElement('div');
    searchCardEl.className='search-result-card';
    document.getElementById('map-container').appendChild(searchCardEl);
    /* Try to enrich with admin info via reverse geocode (Nominatim) */
    let admin='', type='', country='';
    try{
      if(raw){ admin=raw.display_name||''; type=raw.type||raw.class||''; country=raw.address&&raw.address.country||''; }
    }catch(_){}
    const parts=(displayName||'').split(',');
    const primary=parts[0]||displayName||'';
    const restAdmin=parts.slice(1,4).map(s=>s.trim()).filter(Boolean).join(', ');
    searchCardEl.innerHTML=`<button class="src-card-close" title="${HOST.t('close')}">×</button>
      <div class="src-card">
        <h4>${icon('pin')} ${IntMapSafe.html(primary)}</h4>
        <div class="src-sub">${IntMapSafe.html(restAdmin||country||'')}</div>
        <div class="src-row"><span>${HOST.t('coords')}</span><b>${HOST.fmtLL(lng,lat)}</b></div>
        ${type?`<div class="src-row"><span>${IntMapLang.t(HOST.lang,'Type','種別','Typ','Тип','Tipo')}</span><b>${IntMapSafe.html(type)}</b></div>`:''}
        <div class="src-row"><span>${HOST.t('elev')}</span><b id="src-elev">${IntMapLang.t(HOST.lang,'Loading...','取得中...','Lädt…','Загрузка…','Cargando…')}</b></div>
        <div class="src-actions">
          <button class="primary" id="src-copy">${icon('clipboard')} ${HOST.t('ctxCopy')}</button>
          <button id="src-pin">${icon('pin')} ${HOST.t('ctxDropPin')}</button>
        </div>
        <div class="src-actions"><button id="src-profile">${icon('note')} ${IntMapLang.t(HOST.lang,'Place profile','地点プロファイル')}</button></div>
      </div>`;
    searchCardEl.querySelector('.src-card-close').onclick=closeSearchCard;
    searchCardEl.querySelector('#src-copy').onclick=()=>{ try{ navigator.clipboard.writeText(`${lat.toFixed(5)}, ${lng.toFixed(5)}`); }catch(_){} };
    /* (#R217) 「地名検索時のポップアップからdrop pin hereを押したら、地名検索時のポップアップは自動で消えるように。」
       The card is the ASK ("is this the place you meant?"); dropping a pin is the answer, so leaving the card open
       left the question on screen next to its own answer. closeSearchCard() takes the transient search marker with
       it, and that is the point rather than a side effect: a real user pin now stands at the same coordinates, and
       the × that was the search marker's ONLY remover is the thing being closed — keeping it would strand a second,
       un-removable pin under the first. Pin first, then close: HOST.openPinPopup(id) must not open into a card that
       is still being torn down. */
    searchCardEl.querySelector('#src-pin').onclick=()=>{ const id=HOST.addPin(lng,lat); HOST.openPinPopup(id); closeSearchCard(); };
    /* (place-dossier) everything the map knows about the place that was picked, on one card (js/place-dossier.js,
       fetched by this click). The search card stays: it is still the pin and the outline of the pick. */
    searchCardEl.querySelector('#src-profile').onclick=()=>{ import('./place-dossier.js').then(m=>m.openPlaceDossier(HOST,{lng,lat,name:primary})).catch(()=>{ try{ HOST.imToast(IntMapLang.t(HOST.lang,'The place profile could not be loaded','地点プロファイルを読み込めませんでした')); }catch(_){} }); };
    /* (#R36) rAF-coalesce the per-move reposition (mobile pan/zoom smoothness #13): `move` can fire several
       times per frame during inertia, and positionSearchCard does layout (getBoundingClientRect + style writes);
       collapse it to at most once per frame so it never piles up work mid-gesture. */
    /* ⚠ (#R234) one frame for the whole program — js/runtime.js — instead of this card's own rAF.
       Same coalescing and the same per-frame placement; the card still tracks its point exactly. */
    let _scRAF=0; searchCardOnMove=()=>{ const R=window.IntMapRuntime;
      if(R){ R.frame('search.card',()=>{ try{ positionSearchCard(); }catch(_){} }); return; }
      if(_scRAF) return; _scRAF=requestAnimationFrame(()=>{ _scRAF=0; try{ positionSearchCard(); }catch(_){} }); };
    GEO.events.on('move',searchCardOnMove);
    positionSearchCard();
    /* (mobile-shell-flow) the card IS the answer, and it is on the map: say so — js/mobile-ui.js brings a phone's
       sheet down to show it (js/mobile-sheet.js detentFor 'card'); this file chooses no detent */
    try{ bus.emit(MAP_ANSWER_EVENT, {kind:'card'}); }catch(_){}
    /* ══ ⚠⚠ (#R244) A POSTCODE SEARCH OUTLINES ITS AREA ═══════════════════════════════════════════
       「郵便番号で地点検索したら、その範囲が、地名ラベルをクリックした時みたいにハイライトされるように。」
       A place label already does this — js/map-ui.js's popup calls `IntMapOutline.show`, which draws
       the REAL OSM boundary and nothing at all when there is none (#R59: 「領域がわからない地名は
       全部長方形になるとかクソ」). A postcode goes through the same renderer for the same reason, so
       the two look identical and there is one boundary mechanism rather than two.
       ⚠ THE QUERY IS `postalcode=`, NOT `q=`. Nominatim's free-text search resolves «10115» to the
       postcode POINT; the structured parameter is what reaches the `boundary=postal_code` relation
       and returns its polygon (measured: 10115 → Polygon, and the free-text form → Point).
       ⚠ AND IT IS FIRE-AND-FORGET. The fly, the pin and the card are the answer to the search; this
       arrives when the network does, and a failure leaves the search exactly as it is today. */
    if(_looksPostal(displayName,raw)) _outlinePostcode(displayName,raw,lng,lat);
    /* Async elevation / depth */
    try{
      const _j=await window.IntMapWx.guardedJSON(`https://api.open-meteo.com/v1/elevation?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}`,3600000);
      const r={ok:!!_j, json:async()=>_j};
      let e=null; if(r.ok){ const j=await r.json(); e=j&&j.elevation&&j.elevation[0]; }
      const el=searchCardEl&&searchCardEl.querySelector('#src-elev');
      if(el){
        if(typeof e==='number' && e>0.5){ el.textContent=HOST.fmtElevVal(e); }
        else { const d=await HOST.fetchBathymetry(lat,lng); if(typeof d==='number'){ el.textContent = d<0 ? (HOST.fmtElevVal(Math.abs(d))+' '+(IntMapLang.t(HOST.lang,'(depth)','(水深)','(Tiefe)','(глубина)','(profundidad)'))) : HOST.fmtElevVal(d); } else if(typeof e==='number'){ el.textContent=HOST.fmtElevVal(e); } else el.textContent='—'; }
      }
    }catch(_){}
  }
  /* (#R183) The framing decision itself lives in js/place-framing.js — it is pure (no map, no HOST,
     no renderer), this factory's body may contain only declarations (tests/engine-app-shell-split-checks.test.mjs (#R169) #4), and the
     app-body shim contract pins exactly this return list. */
  return { doGeocode, localFuzzyPlaces, goToLocal };
}
