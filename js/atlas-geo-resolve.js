import { personaPrompt } from './atlas-persona.js';   /* (#R285) WHO Atlas is — the ONE copy; see js/atlas-persona.js */
import { jsonWithin } from './fetch-deadline.js';   /* (#R452) Nominatim, with a clock — see the file header there */
import { NominatimGate } from './nominatim-gate.js';   /* (#R489) …and with the app's ONE one-a-second floor in front of it. Both calls below used to go straight out, so fourteen Atlas oblast outlines left as fast as the network took them. */
/* ============================================================================
 *  IntMap · Atlas — place / region resolution and camera framing  (#R199)
 * ----------------------------------------------------------------------------
 *  "Which patch of the world does this phrase mean, and how close should the camera go?" — deixis
 *  (#R44) and 現在地 (#R85), Nominatim geocoding with the capital→centroid guard (#R93d), robust extents,
 *  the curated region boxes and directional slicing, the geo-verification ladder (#R116) and the GPT
 *  region resolver with its IndexedDB cache and self-test (#R132/#R143), then placeExtent/flyToBox.
 *
 *  Lifted out of js/atlas-console.js's 452-line block verbatim (#R199). It is a REAL ES module:
 *  nothing registers it on window.IntMapModules and nothing depends on load order — js/atlas-console.js
 *  names it in an `import`, so the bundler resolves the binding and orders the graph.
 *
 *  Everything the block used to read from the console's closure arrives through `CTX` (and the app's
 *  live host through `HOST`), rebound below under the ORIGINAL names so the body stays byte-identical.
 *  tests/r199-checks.test.mjs re-derives that byte-identity from the two files on every commit.
 * ==========================================================================*/
export function makeAtlasGeoResolve(HOST, CTX) {
  const GE=CTX.GE, L=CTX.L, _bboxSoftPoly=CTX._bboxSoftPoly, _cgPoly=CTX._cgPoly, _clipGeoRect=CTX._clipGeoRect, _codesGeo=CTX._codesGeo, _expandRegionCompound=CTX._expandRegionCompound, _geoArea=CTX._geoArea, _hlLegendHtml=CTX._hlLegendHtml, _hlPaletteColor=CTX._hlPaletteColor, _lnorm=CTX._lnorm, _ptInGeo=CTX._ptInGeo, _setLast=CTX._setLast, _validGeo=CTX._validGeo, askAIJSONEnvelope=CTX.askAIJSONEnvelope, codeAtPoint=CTX.codeAtPoint, composeRegion=CTX.composeRegion, fbbox=CTX.fbbox, geo=CTX.geo, localFuzzyPlaces=CTX.localFuzzyPlaces, regionGroup=CTX.regionGroup, resolveCountrySync=CTX.resolveCountrySync;
    /* (#R452) `geocode()` and `_nomExtent()` both went to Nominatim with no signal and no deadline,
       and `placeExtent()` calls the second up to THREE times in a file — so a host that had stopped
       answering stopped the turn. 8 s is well above Nominatim's own answer time for every query this
       file builds; past it, the caller's existing 「no extent / no coordinate」 branch is the truth.
       ⚠ It sits BELOW the CTX rebinds because tests/r199 ② requires those to be the first statement. */
    const NOMINATIM_TIMEOUT_MS = 8000;
    /* (#R44) deictic references → the place Atlas last touched, else the current map centre. */
    const DEIXIS_RE=/^(here|there|current|this( ?place| ?location)?|that( ?place| ?spot)?|the same( ?place| ?spot)?|same|そこ|ここ|そこの|この場所|同じ場所)$/i;
    /* (#R85) "現在地" means the DEVICE'S real GPS location, NOT deixis. The old code lumped 現在地 into DEIXIS_RE, so
       "現在地の天気 / 現在地のストリートビュー / 現在地から東京への経路" all resolved to wherever Atlas last touched (or the
       map centre) — "Atlasが現在地というワードをユーザーの現在地だと認識できない". Now these phrases actually read the
       browser geolocation (cached 5 min), and only fall back to deixis/centre if permission is denied/unavailable. */
    /* ══ (#R413) 「現在地」 IN ALL NINE LANGUAGES INTMAP SHIPS, NOT FIVE OF THEM ══════════════════
       The regular expression this replaces carried ja / en / ru / es / de. A French, Korean or
       Chinese reader had NO WAY TO SAY IT: 「ma position」「내 위치」「我的位置」 fell through to the
       deixis branch below and came back as the map centre, silently. CLAUDE.md §3.5 has required nine
       languages for every reader-facing string for dozens of rounds; a phrase the reader TYPES is one.
       ⚠ IT IS A TABLE, NOT A PATTERN, so the coverage can be MEASURED, and it is KEYED BY INTMAP'S
       OWN LANGUAGE CODES — the ones js/locales/ui.<code>.js is named for — so tests/r413-checks
       reads the shipped set off the directory and requires a key for each. A hand-written list of
       "the languages we support" is the exact shape #R399 found lying. Every spelling the old
       expression accepted is still here. */
    const SELFLOC_WORDS=Object.freeze({
      en:['my location','my current location','my position','my current position','current location','current position','where am i','where i am','where iam'],
      jp:['現在地','現在の位置','今いる場所','今いる位置','今の場所','今の位置','自分の位置','自分の居場所','自分の現在地','マイロケーション','マイ ロケーション'],
      de:['mein standort','mein aktueller standort','aktueller standort','meine position','wo bin ich'],
      ru:['где я','где я нахожусь','моё местоположение','моёместоположение','мое местоположение','текущее местоположение','моя позиция'],
      es:['mi ubicación','mi ubicacion','ubicación actual','ubicacion actual','mi posición','mi posicion','dónde estoy','donde estoy'],
      fr:['ma position','ma position actuelle','position actuelle','ma localisation','où je suis','ou je suis','où suis-je','ou suis-je'],
      ko:['내 위치','내위치','현재 위치','현재위치','지금 위치','지금위치','내 현재 위치'],
      zh:['我的位置','目前位置','現在位置','目前所在位置','我在哪','我在哪裡'],
      'zh-hans':['我的位置','当前位置','现在位置','当前所在位置','我在哪','我在哪里'] });
    const SELFLOC_RE=new RegExp('^\\s*(?:'+Object.keys(SELFLOC_WORDS)
      .reduce((a,k)=>a.concat(SELFLOC_WORDS[k]),[])
      .map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'))
      .sort((a,b)=>b.length-a.length).join('|')+')\\s*$','i');
    let _selfLocCache=null,_selfLocT=0;
    function _selfLoc(){ return new Promise(res=>{ try{
        if(_selfLocCache && Date.now()-_selfLocT<300000) return res(_selfLocCache);
        if(!navigator.geolocation) return res(null);
        navigator.geolocation.getCurrentPosition(
          p=>{ res(_selfLocSeed({lng:+p.coords.longitude,lat:+p.coords.latitude,acc:+p.coords.accuracy||0})); },
          ()=>res(null), {enableHighAccuracy:true,timeout:20000,maximumAge:0});   /* (#R170) GPS-grade fix, never a cached one — the 5-min _selfLocCache above still avoids re-prompting */
      }catch(_){ res(null); } }); }
    /* (#R413) a fix obtained ELSEWHERE (the my_location capability) becomes this cache, so the very
       next 「現在地から…」 resolves from memory instead of putting a second permission prompt in front
       of the reader for a position IntMap already has. */
    function _selfLocSeed(f){ try{ const lng=+f.lng, lat=+f.lat; if(!isFinite(lng)||!isFinite(lat)) return null;
      _selfLocCache={lng,lat,acc:+f.acc||0,name:L('my location','現在地','mein Standort','моё местоположение','mi ubicación')}; _selfLocT=Date.now();
      return _selfLocCache; }catch(_){ return null; } }
    window._imSelfLoc=_selfLoc;
    /* (#R413) an explicit coordinate, written the way every map app writes one ("34.7016, 135.4959").
       Atlas obtains the reader's position as two numbers and must be able to HAND THEM BACK to any
       capability that takes a place — otherwise the fact it just obtained is only usable through a
       magic word, and every origin-taking case would need its own lng/lat pair bolted on. Latitude
       first, because that is the order the whole world writes and the order IntMap's own readouts
       print. Two bare numbers are never a place name, so nothing that used to resolve stops. */
    const COORD_RE=/^\s*(-?\d{1,2}(?:\.\d+)?)\s*[,\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;
    function _coordPlace(place){ const m=COORD_RE.exec(place); if(!m) return null;
      const lat=+m[1], lng=+m[2]; if(!isFinite(lat)||!isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180) return null;
      return {lng,lat,name:lat.toFixed(4)+', '+lng.toFixed(4)}; }
    async function geocode(place){ place=String(place||'').trim();
      /* ⚠ (#R413) A REFUSED GPS USED TO BECOME THE MAP CENTRE, AND THE CALLER WAS NEVER TOLD.
         「現在地から大阪駅まで」 with location blocked fell through the two branches below and
         returned `GE().camera.getCenter()` — so IntMap drew a route from wherever the map happened to
         be pointing and reported it as a SUCCESS. That is the failure PRODUCT.md §3.4 names by name
         (「必要な地点を勝手に決めない… 地図の中心で代用せず」) and it is worse than the refusal that
         started this round, because nothing on screen says the origin is wrong. A self-location
         phrase now resolves to the device or to NOTHING — including past `_lastPlace`, which is the
         place ATLAS last touched and is no more the reader than the map centre is. */
      if(SELFLOC_RE.test(place)){ const sl=await _selfLoc(); return sl?_setLast({lng:sl.lng,lat:sl.lat,name:sl.name}):null; }
      { const c=_coordPlace(place); if(c) return _setLast(c); }
      if(!place||DEIXIS_RE.test(place)){
        const _lastPlace=CTX.lastPlace(); if(_lastPlace) return {lng:_lastPlace.lng,lat:_lastPlace.lat,name:_lastPlace.name}; const c=GE().camera.getCenter(); return {lng:c.lng,lat:c.lat,name:''}; }
      /* (#R93d) A 'capital' fuzzy match carries the COUNTRY's centroid, NOT the city — up to ~80 km off (searching
         "Riga" gave Latvia's centroid 83 km from the city, "Paris" gives France's centroid, …), which put the point
         out in the countryside where transit/road routers find no stop → a false "no route". So DON'T short-circuit on
         a capital match: prefer precise Nominatim coords for it, and keep the coarse fuzzy result only as a fallback. */
      let _fz=null;
      try{ if(typeof localFuzzyPlaces==='function'){ const h=localFuzzyPlaces(place); if(h&&h.length){ _fz={lng:+h[0].lng,lat:+h[0].lat,name:h[0].name,kind:h[0].kind||''}; if(_fz.kind!=='capital') return _setLast(_fz); } } }catch(_){}
      /* (#R46) Nominatim returns a boundingbox [S,N,W,E] + class/type — use them to FIT the view to the place's
         real extent so a continent zooms out and a city zooms in (was: everything pinned at country-zoom ~6). */
      try{ await NominatimGate.nominatimSlot(); const j=await jsonWithin('https://nominatim.openstreetmap.org/search?format=json&limit=1&q='+encodeURIComponent(place),NOMINATIM_TIMEOUT_MS,{headers:{Accept:'application/json'}}); if(j&&j[0]){ const b=j[0].boundingbox; let bbox=null; if(Array.isArray(b)&&b.length===4){ const s=+b[0],n=+b[1],w=+b[2],e=+b[3]; if([s,n,w,e].every(v=>typeof v==='number'&&isFinite(v))) bbox=[[w,s],[e,n]]; } return _setLast({lng:+j[0].lon,lat:+j[0].lat,name:(j[0].display_name||'').split(',')[0],bbox,kind:(j[0].addresstype||j[0].type||j[0].class||'')}); } }catch(_){}
      if(_fz) return _setLast(_fz);   /* capital match + Nominatim unreachable → fall back to the coarse centroid */
      return null; }
    function _bboxOK(b){ try{ const w=b[0][0],s=b[0][1],e=b[1][0],n=b[1][1]; if(![w,s,e,n].every(v=>typeof v==='number'&&isFinite(v))) return false; if(e<=w||n<=s) return false; if((e-w)>355||(n-s)>175) return false; return true; }catch(_){ return false; } }
    /* (#R51) DYNAMIC navigation. The user: "固定値でいいはずがない／静的なコーディングだと所変われば不具合". Correct — a
       "city" can be Tokyo or a hamlet, so any hardcoded type→zoom table is wrong somewhere. We DERIVE the view from the
       place's REAL geographic FOOTPRINT instead of any constant. WORLD_RE is only the global-view INTENT (there is no
       geometry for "the world"). robustExtent() takes the actual polygon (Nominatim polygon_geojson) and returns the
       extent of the place's MAIN body — antimeridian-aware (Russia/Fiji) and discarding tiny far-flung outliers
       (France+Guiana, Tokyo+Ogasawara) by keeping only the largest rings up to ~92% of the area. cameraForBounds then
       frames it with a proportional margin. No per-type constants → every place gets exactly the zoom its size warrants. */
    const WORLD_RE=/^\s*(the\s+|whole\s+|entire\s+|all\s+(of\s+)?)*(world|earth|planet|globe|everything)\s*$|^\s*(全世界|世界全体|世界|地球|全体|全球|весь\s*мир|мир|mundo entero|el mundo|die welt|welt)\s*$/i;
    function _ringArea(r){ let a=0,n=(r&&r.length)||0; if(n<3) return 0; for(let i=0,j=n-1;i<n;j=i++){ if(r[i]&&r[j]) a+=(r[j][0]*r[i][1]-r[i][0]*r[j][1]); } return Math.abs(a/2); }
    function _outerRings(gj){ if(!gj) return null; const t=gj.type;
      if(t==='Polygon') return gj.coordinates&&[gj.coordinates[0]];
      if(t==='MultiPolygon') return gj.coordinates&&gj.coordinates.map(p=>p&&p[0]);
      if(t==='LineString') return [gj.coordinates];
      if(t==='MultiLineString') return gj.coordinates;
      return null; }
    function _ringMeta(ring,shift){ let w=Infinity,s=Infinity,e=-Infinity,n=-Infinity; for(const p of ring){ if(!p||typeof p[0]!=='number') continue; let x=p[0]; if(shift&&x<0) x+=360; if(x<w)w=x; if(x>e)e=x; if(p[1]<s)s=p[1]; if(p[1]>n)n=p[1]; } if(!isFinite(w)||!isFinite(s)) return null; return {w,s,e,n,cx:(w+e)/2,cy:(s+n)/2,ar:_ringArea(ring)||Math.max((e-w)*(n-s),1e-7),diag:Math.hypot(e-w,n-s)}; }
    /* Extent of the place's MAIN BODY: the largest polygon + only the OTHER polygons within a reach scaled to the
       main body's own size (so a country's mainland + nearby islands are kept, but scattered overseas territories /
       far exclaves — France+Polynesia, USA+Guam — are dropped). Antimeridian-aware (tries both 0° and 180° frames). */
    function robustExtent(gj){ const rings=_outerRings(gj); if(!rings||!rings.length) return null;
      const build=(shift)=>{ const ms=[]; for(const r of rings){ if(!r||!r.length) continue; const m=_ringMeta(r,shift); if(m) ms.push(m); } if(!ms.length) return null;
        ms.sort((a,b)=>b.ar-a.ar); const main=ms[0]; const reach=Math.max(main.diag*1.7, 4);
        let W=main.w,S=main.s,E=main.e,N=main.n; for(let i=1;i<ms.length;i++){ const p=ms[i]; if(Math.hypot(p.cx-main.cx,p.cy-main.cy)<=reach){ if(p.w<W)W=p.w; if(p.s<S)S=p.s; if(p.e>E)E=p.e; if(p.n>N)N=p.n; } }
        return {W,S,E,N,span:E-W}; };
      const a=build(false), b=build(true); const pick=(a&&b)?((b.span<a.span-1e-6)?b:a):(a||b);
      if(!pick||!isFinite(pick.W)||pick.E<=pick.W||pick.N<=pick.S) return null;
      return [[pick.W,pick.S],[pick.E,pick.N]]; }
    /* (#R53) The user reported real OFF-TARGET zooms: a REGION name jumped to a random tiny POI in the wrong country
       (verified live: "Central Europe"→a quarter in Minsk; "Southern Italy"→a military office in Vicenza; "City Center
       of Chongqing"→a tourist centre 100 km away). Root cause = blindly trusting Nominatim's highest-importance
       free-text hit. Fix WITHOUT any per-type zoom constant: a macro-REGION gazetteer (Nominatim has no polygon for
       these), DIRECTIONAL names sliced from the base country's REAL polygon, "city centre of X" → the city core, and
       POI-vs-admin result filtering. All 5 languages. */
    const _rnorm=s=>_lnorm(String(s||'')).replace(/^(the|la|el|las|los|le|les|der|die|das)\s+/,'').replace(/\s+(region|area)$/,'').trim();
    const REGION_BBOX={
      'central europe':[4,45,24,55],'western europe':[-10,42,13,55],'eastern europe':[16,43,42,58],'northern europe':[3,53,32,71],'southern europe':[-10,35,28,47],
      'europe':[-12,34,42,71],'scandinavia':[4,54,32,71],'nordics':[4,54,32,71],'baltics':[20,53,29,60],'baltic states':[20,53,29,60],'benelux':[2,49,7,54],
      'british isles':[-11,49,2,61],'iberia':[-10,36,4,44],'iberian peninsula':[-10,36,4,44],'balkans':[13,38,30,49],'caucasus':[40,38,50,45],'mediterranean':[-6,30,37,47],
      'middle east':[25,12,63,42],'near east':[25,12,50,42],'levant':[34,29,42,38],'arabian peninsula':[34,12,60,32],'gulf':[47,23,57,31],'persian gulf':[47,23,57,31],'mesopotamia':[38,30,49,37],
      'central asia':[46,35,88,56],'south asia':[60,5,98,38],'southeast asia':[92,-11,141,29],'south-east asia':[92,-11,141,29],'east asia':[100,18,146,54],'far east':[100,18,146,54],
      'indochina':[92,9,110,29],'indian subcontinent':[60,5,98,38],'asia':[26,-11,180,78],
      'north africa':[-17,19,37,38],'west africa':[-18,4,16,28],'east africa':[28,-12,52,18],'central africa':[8,-13,31,8],'southern africa':[11,-35,41,-15],
      'horn of africa':[40,-2,51,18],'sahel':[-18,11,40,18],'maghreb':[-13,27,12,38],'sub-saharan africa':[-18,-35,52,18],'africa':[-18,-35,52,38],'sahara':[-17,16,37,31],
      'north america':[-168,7,-52,72],'central america':[-92,7,-77,19],'latin america':[-118,-56,-34,33],'south america':[-82,-56,-34,13],'caribbean':[-85,9,-59,27],
      'midwest':[-104,36,-80,49],'new england':[-74,41,-66,48],'pacific northwest':[-125,42,-111,49],'great plains':[-105,31,-95,49],'deep south':[-95,29,-75,37],'american south':[-95,29,-75,37],
      'patagonia':[-76,-56,-62,-39],'amazon':[-79,-16,-44,5],'amazonia':[-79,-16,-44,5],'andes':[-79,-56,-62,11],
      'himalayas':[73,26,96,36],'alps':[5,43,17,48],'siberia':[60,50,180,78],'oceania':[110,-50,180,0],'gulf of mexico':[-98,18,-81,31],
      /* (#R136) famous geographic/historical regions with NO single OSM boundary (Nominatim otherwise returns a
         same-named village → wrong-place highlight); reviewed extents so they highlight honestly. */
      'manchuria':[119,39,135,53],'anatolia':[26,36,45,42],'asia minor':[26,36,45,42],'the levant':[34,29,42,38],'indochina peninsula':[92,9,110,29],'scandinavian peninsula':[4,55,32,71],
      /* (#R62) informal / economic regions so they highlight WITHOUT an AI round-trip (the AI-traced polygon
         still takes over for names not listed here) */
      'blue banana':[-1.5,45,12.5,54.5],'rhine-ruhr':[6.2,50.7,7.9,51.9],'ruhr':[6.5,51.2,7.9,51.7],'rust belt':[-93,38,-74,45],
      'sun belt':[-120,25,-75,37],'corn belt':[-98,38,-82,44],'bible belt':[-100,30,-77,38],'silicon valley':[-122.5,36.9,-121.2,37.8] };
    const REGION_ALIASES={
      '中央ヨーロッパ':'central europe','中欧':'central europe','西ヨーロッパ':'western europe','西欧':'western europe','東ヨーロッパ':'eastern europe','東欧':'eastern europe','北欧':'northern europe','南欧':'southern europe','ヨーロッパ':'europe','欧州':'europe','中東':'middle east','東南アジア':'southeast asia','東アジア':'east asia','中央アジア':'central asia','南アジア':'south asia','北アフリカ':'north africa','サハラ以南アフリカ':'sub-saharan africa','カリブ':'caribbean','カリブ海':'caribbean','バルカン':'balkans','バルカン半島':'balkans','スカンジナビア':'scandinavia','北米':'north america','中米':'central america','南米':'south america','ラテンアメリカ':'latin america','サハラ':'sahara','アマゾン':'amazon','ヒマラヤ':'himalayas','アルプス':'alps','シベリア':'siberia','中南米':'latin america',
      'mitteleuropa':'central europe','westeuropa':'western europe','osteuropa':'eastern europe','nordeuropa':'northern europe','südeuropa':'southern europe','naher osten':'middle east','südostasien':'southeast asia','ostasien':'east asia','zentralasien':'central asia','nordafrika':'north africa','der balkan':'balkans','skandinavien':'scandinavia',
      'центральная европа':'central europe','западная европа':'western europe','восточная европа':'eastern europe','северная европа':'northern europe','южная европа':'southern europe','европа':'europe','ближний восток':'middle east','юго-восточная азия':'southeast asia','восточная азия':'east asia','центральная азия':'central asia','северная африка':'north africa','балканы':'balkans','скандинавия':'scandinavia','сибирь':'siberia','карибы':'caribbean','латинская америка':'latin america',
      'europa central':'central europe','europa occidental':'western europe','europa oriental':'eastern europe','oriente medio':'middle east','medio oriente':'middle east','sudeste asiático':'southeast asia','asia oriental':'east asia','asia central':'central asia','el caribe':'caribbean','escandinavia':'scandinavia','los balcanes':'balkans','américa latina':'latin america','el sahara':'sahara','los andes':'andes','el amazonas':'amazon',
      /* (#R62) informal regions, 5 languages */
      'グレートプレーンズ':'great plains','大平原':'great plains','グレート・プレーンズ':'great plains','青いバナナ':'blue banana','ブルーバナナ':'blue banana','ブルー・バナナ':'blue banana','ライン・ルール':'rhine-ruhr','ラインルール':'rhine-ruhr','ライン＝ルール':'rhine-ruhr','ルール地方':'ruhr','ラストベルト':'rust belt','サンベルト':'sun belt','コーンベルト':'corn belt','シリコンバレー':'silicon valley','シリコン・バレー':'silicon valley',
      'blaue banane':'blue banana','rhein-ruhr':'rhine-ruhr','ruhrgebiet':'ruhr','great plains region':'great plains',
      'голубой банан':'blue banana','рейн-рур':'rhine-ruhr','ржавый пояс':'rust belt','великие равнины':'great plains','кремниевая долина':'silicon valley','силиконовая долина':'silicon valley',
      'banana azul':'blue banana','plátano azul':'blue banana','cinturón del óxido':'rust belt','grandes llanuras':'great plains','valle del silicio':'silicon valley',
      /* (#R136) famous regions, 5 languages */
      '満州':'manchuria','満洲':'manchuria','マンチュリア':'manchuria','mandschurei':'manchuria','маньчжурия':'manchuria',
      'アナトリア':'anatolia','小アジア':'asia minor','anatolien':'anatolia','kleinasien':'asia minor','анатолия':'anatolia','малая азия':'asia minor','anatolia':'anatolia','asia menor':'asia minor',
      'パタゴニア':'patagonia','patagonien':'patagonia','патагония':'patagonia' };
    function regionBox(place){ const raw=_lnorm(place); const k=REGION_ALIASES[raw]||REGION_ALIASES[_rnorm(place)]||_rnorm(place); const b=REGION_BBOX[k]; if(!b) return null; return {box:[[b[0],b[1]],[b[2],b[3]]], lng:(b[0]+b[2])/2, lat:(b[1]+b[3])/2, name:place.trim(), region:true}; }
    const DIR_VEC={north:'N',northern:'N',south:'S',southern:'S',east:'E',eastern:'E',west:'W',western:'W',central:'C',northeast:'NE',northeastern:'NE',northwest:'NW',northwestern:'NW',southeast:'SE',southeastern:'SE',southwest:'SW',southwestern:'SW',upper:'N',lower:'S'};
    function parseDirectional(place){ const s=String(place||'').trim(); let m;
      m=s.match(/^(northern|southern|eastern|western|central|northeast(?:ern)?|northwest(?:ern)?|southeast(?:ern)?|southwest(?:ern)?|upper|lower|north|south|east|west)\s+(.{2,})$/i);
      if(m) return {dir:DIR_VEC[m[1].toLowerCase()], base:m[2]};
      m=s.match(/^(?:el\s+|la\s+)?(norte|sur|este|oeste|centro|noreste|noroeste|sureste|suroeste)\s+de\s+(.{2,})$/i);
      if(m){ const M={norte:'N',sur:'S',este:'E',oeste:'W',centro:'C',noreste:'NE',noroeste:'NW',sureste:'SE',suroeste:'SW'}; return {dir:M[m[1].toLowerCase()], base:m[2]}; }
      m=s.match(/^(.{2,}?)(北東部|北西部|南東部|南西部|北部|南部|東部|西部|中部|中央部)$/);
      if(m){ const M={'北部':'N','南部':'S','東部':'E','西部':'W','中部':'C','中央部':'C','北東部':'NE','北西部':'NW','南東部':'SE','南西部':'SW'}; return {dir:M[m[2]], base:m[1]}; }
      m=s.match(/^(северо-восточн\S*|северо-западн\S*|юго-восточн\S*|юго-западн\S*|северн\S*|южн\S*|восточн\S*|западн\S*|центральн\S*)\s+(.{2,})$/i);
      if(m){ const w=m[1].toLowerCase(); const d=/^северо-в/.test(w)?'NE':/^северо-з/.test(w)?'NW':/^юго-в/.test(w)?'SE':/^юго-з/.test(w)?'SW':/^северн/.test(w)?'N':/^южн/.test(w)?'S':/^восточн/.test(w)?'E':/^западн/.test(w)?'W':'C'; return {dir:d, base:m[2]}; }
      m=s.match(/^(nord|süd|sud|ost|west|zentral|mittel)([a-zäöüß].{3,})$/i);
      if(m){ const M={nord:'N','süd':'S',sud:'S',ost:'E',west:'W',zentral:'C',mittel:'C'}; return {dir:M[m[1].toLowerCase()], base:m[2]}; }
      return null; }
    function sliceBox(box,dir){ const W=box[0][0],S=box[0][1],E=box[1][0],N=box[1][1], Hd=N-S, Wd=E-W, fr=0.58; let w=W,s=S,e=E,n=N;
      if(/N/.test(dir)) s=N-Hd*fr; if(/S/.test(dir)) n=S+Hd*fr; if(/E/.test(dir)) w=E-Wd*fr; if(/W/.test(dir)) e=W+Wd*fr;
      if(dir==='C'){ w=W+Wd*0.22; e=E-Wd*0.22; s=S+Hd*0.22; n=N-Hd*0.22; }
      return [[w,s],[e,n]]; }
    const CENTER_RE=/^(?:the\s+)?(?:downtown|city\s+cent(?:er|re)|cent(?:er|re)|inner\s+city)\s+(?:of\s+)?(.{2,})$|^(.{2,}?)\s+(?:city\s+cent(?:er|re)|downtown|inner\s+city)$|^(.{2,}?)(?:の)?(?:中心部|中心街|都心|繁華街)$|^(?:centro|el\s+centro)\s+de\s+(.{2,})$|^(?:zentrum|innenstadt|stadtzentrum)\s+(?:von\s+)?(.{2,})$|^центр\s+(.{2,})$/i;
    function parseCenter(place){ const m=String(place||'').trim().match(CENTER_RE); if(!m) return null; const base=m[1]||m[2]||m[3]||m[4]||m[5]||m[6]; return base?base.trim():null; }
    /* (#R64) BUG: Nominatim jsonv2 returns `category`, NOT `class` — so the POI penalty/admin bonus NEVER fired
       (junk shops outranked real boundaries; 畿内's real historic boundary lost to random POIs). Read both. */
    function _classBonus(o){ const c=(o.class||o.category||'').toLowerCase(), at=(o.addresstype||'').toLowerCase();
      if(/^(amenity|shop|tourism|leisure|office|building|man_made|highway|railway|historic|craft|healthcare|barrier|power|aeroway)$/.test(c)) return -0.6;
      if(/^(country|state|region|province|county|city|town|district|municipality|island|continent|borough|department)$/.test(at)) return 0.3;
      if(c==='place'||c==='boundary'||c==='natural') return 0.22; return 0; }
    /* (#R130) WEB-SEARCH-GROUNDED location verification for the highlight / outline resolver. The old ladder trusted
       whatever geometry a Nominatim importance score or a web-BLIND AI trace returned, and reported "✦ highlighted"
       on any paint — so an ambiguous/homonym name (大阪湾→a bay in China) or a hallucinated blob got painted AND
       claimed as success ("ハイライトが全く見当違いの場所"). geoVerify web-searches the authoritative coordinates so an
       untrusted rung can be DISAMBIGUATED (as an anchor for _nomExtent) and VERIFIED (reject clear mismatches).
       Fail-OPEN: any error / logout / quota / timeout / no-web → null, and the caller keeps its current behaviour, so
       this can only CATCH wrong-place results, never break a working highlight. Cached per normalized name. */
    const _geoVerifyCache={};
    async function geoVerify(name){ const key=_lnorm(name); if(!key) return null; if(key in _geoVerifyCache) return _geoVerifyCache[key];
      let out=null;
      /* (#R132) REAL AbortController timeout (was a 9 s Promise.race that discarded the winner but left the fetch
         running in the background — burning usage/cost + racing _aiLastMeta). Now the timeout ABORTS the fetch, and
         meta.webUsed is read from THIS call's envelope, not the shared global. Still fail-OPEN (any error → null). */
      try{
        const sys=personaPrompt('verifying a place against the live web for the IntMap world map',{mode:'internal'})/* (#R285) machine-read output */+'For the EXACT place the user names, web-search its single most authoritative CURRENT real-world location and return STRICT JSON ONLY: {"found":true|false,"lat":<number>,"lng":<number>,"kind":"country|admin1|admin2|city|water|region|river|basin|mountain|island|unknown","country":"<English name of the country it is in, or empty>","altNames":["<other names>"],"confidence":<0..1>}. lat/lng = a representative interior point on/inside the feature (for a country or region its centroid; for a bay/strait/river/range a point ON the feature). If the name is ambiguous, choose the most likely and put alternates in altNames. If you cannot verify it from a source, set found=false. Output JSON only, no prose.';
        const ctl=('AbortController' in window)?new AbortController():null; let timer=null; if(ctl){ timer=setTimeout(()=>{ try{ ctl.abort(); }catch(_){} }, 11000); }
        let env=null; try{ env=await askAIJSONEnvelope('Place: "'+String(name).slice(0,120)+'"', sys, null, {task:'geo_verify', webMode:'required', signal:ctl?ctl.signal:null}); } finally { if(timer) clearTimeout(timer); }
        const j=env&&env.data; const meta=(env&&env.meta)||{};
        if(j && typeof j==='object' && j.found && isFinite(+j.lat) && isFinite(+j.lng) && Math.abs(+j.lat)<=90 && Math.abs(+j.lng)<=180){
          out={ found:true, lat:+j.lat, lng:+j.lng, kind:String(j.kind||'unknown').toLowerCase(), country:String(j.country||'').trim(),
                altNames:(Array.isArray(j.altNames)?j.altNames.map(x=>String(x||'').trim()).filter(Boolean):[]),
                confidence:(typeof j.confidence==='number'?j.confidence:(meta.webUsed?0.7:0.35)), webUsed:!!meta.webUsed };
        }
      }catch(_){}
      _geoVerifyCache[key]=out; return out; }
    /* is this verification trustworthy enough to REJECT geometry on? require the web search to have actually run +
       a real point; otherwise we only USE it as a soft anchor, never to reject. */
    const _gvStrong=gv=>!!(gv&&gv.found&&gv.webUsed&&(gv.confidence==null||gv.confidence>=0.5));
    /* km from a geometry's representative point to the verified point (null if uncomputable) + a size-scaled tolerance */
    function _geoMismatchKm(geo,gv){ try{ if(!geo||!gv||typeof turf==='undefined') return null; let cx,cy;
      try{ const cen=turf.center({type:'Feature',geometry:geo,properties:{}}); cx=cen.geometry.coordinates[0]; cy=cen.geometry.coordinates[1]; }
      catch(_){ const bb=turf.bbox({type:'Feature',geometry:geo,properties:{}}); cx=(bb[0]+bb[2])/2; cy=(bb[1]+bb[3])/2; }
      if(!isFinite(cx)||!isFinite(cy)) return null; const d=turf.distance([cx,cy],[gv.lng,gv.lat],{units:'kilometers'}); return isFinite(d)?d:null; }catch(_){ return null; } }
    function _geoTolKm(geo){ try{ const bb=turf.bbox({type:'Feature',geometry:geo,properties:{}}); const diag=turf.distance([bb[0],bb[1]],[bb[2],bb[3]],{units:'kilometers'}); return Math.max(200, 0.65*(isFinite(diag)?diag:0)); }catch(_){ return 500; } }
    /* verified geometry check: true = geometry sits at the verified place (or we can't/ shouldn't judge → fail-open) */
    function _geoAgrees(geo,gv){ if(!_gvStrong(gv)) return true; const d=_geoMismatchKm(geo,gv); if(d==null) return true; return d<=_geoTolKm(geo); }
    async function _nomExtent(place, anchor){ place=String(place||'').trim(); if(!place) return null;
      /* (#R64) polygon_threshold 0.02 (~2 km Douglas-Peucker) was the "カクカクポリゴン" root cause — real admin
         boundaries came back as a handful of vertices. 0.0008 (~80 m) keeps full visual fidelity at any zoom the
         region is viewed at while still bounding the payload. Whole COUNTRIES never reach here (resolveCountrySync
         short-circuits first), so the worst case is a large oblast/prefecture — fine at this threshold. */
      try{ /* (#R136) accept-language so Nominatim returns display names IN the UI language (falling back to English):
              an ENGLISH-exonym query ("Tuscany", "Persia") otherwise never exact-name-matches the region's LOCAL name
              ("トスカーナ州" / "Toscana"), so the exact-name bonus below fired for an obscure English HOMONYM instead
              (Tuscany the Calgary suburb) — a reported "見当違いの場所" wrong-place highlight. */
        const _lang=(typeof HOST.lang!=='undefined'&&HOST.lang)?String(HOST.lang):'en';
        await NominatimGate.nominatimSlot(); const j=await jsonWithin('https://nominatim.openstreetmap.org/search?format=jsonv2&accept-language='+encodeURIComponent(_lang+',en')+'&limit=8&polygon_geojson=1&polygon_threshold=0.0008&q='+encodeURIComponent(place),NOMINATIM_TIMEOUT_MS,{headers:{Accept:'application/json'}}); if(!Array.isArray(j)||!j.length) return null;
        const _q=String(place).trim().toLowerCase();
        const _imp=x=>(+x.importance||0); const _maxImp=Math.max.apply(null,j.map(_imp).concat([0]));
        /* (#R116/#R136) EXACT-NAME bonus: a result whose own name equals the query beats a FUZZY near-miss of slightly
           higher importance (「大阪湾」 must beat 大坂湾, a hamlet in China). BUT it is decisive ONLY among candidates of
           COMPARABLE importance — a low-importance exact HOMONYM (a township literally named "Persia" in Iowa, imp 0.47)
           must NOT out-rank the dramatically more important real feature it shares letters with (Iran, imp 0.87). Full
           bonus within 0.25 of the top importance; near-zero below (still enough to break a genuine near-tie). */
        const _nameBonus=x=>{ try{ if(String((x.display_name||'').split(',')[0]).trim().toLowerCase()!==_q) return 0; return (_imp(x)>=_maxImp-0.25)?0.5:0.08; }catch(_){ return 0; } };
        /* (#R130) ANCHOR bonus: when a web-search-verified point is supplied (geoVerify), prefer the candidate NEAREST
           it — so the RIGHT one of the up-to-8 Nominatim candidates wins instead of a higher-importance homonym
           (the 大阪湾→坂湾-in-China class). Reuses the already-fetched candidates, no extra request. */
        const _anchorBonus=x=>{ try{ if(!anchor||!isFinite(+anchor.lat)||!isFinite(+anchor.lng)||typeof turf==='undefined') return 0; const d=turf.distance([+x.lon,+x.lat],[+anchor.lng,+anchor.lat],{units:'kilometers'}); if(!isFinite(d)) return 0; return d<=120?0.9:d<=400?0.5:d<=1200?0:-0.7; }catch(_){ return 0; } };
        const best=j.slice().sort((x,y)=>((+y.importance||0)+_classBonus(y)+_nameBonus(y)+_anchorBonus(y))-((+x.importance||0)+_classBonus(x)+_nameBonus(x)+_anchorBonus(x)))[0];
        /* (#R136) honest-miss guard (only when NO web-verified anchor vouches for the location): a bare minor SETTLEMENT
           with low importance is almost never what a region/country/place highlight meant — return null so the caller
           reports an honest miss instead of painting a speck in the wrong country. */
        if(!anchor){ const _typ=String(best.type||'').toLowerCase(); if(/^(hamlet|neighbourhood|neighborhood|suburb|quarter|locality|isolated_dwelling|farm|allotments|city_block|residential|croft)$/.test(_typ) && _imp(best)<0.35) return null; }
        let box=robustExtent(best.geojson);
        if(!box && Array.isArray(best.boundingbox)&&best.boundingbox.length===4){ const s=+best.boundingbox[0],n=+best.boundingbox[1],w=+best.boundingbox[2],e=+best.boundingbox[3]; if([s,n,w,e].every(v=>isFinite(v))&&e>w&&n>s&&(e-w)<=200) box=[[w,s],[e,n]]; }
        const adminPoly=!!(best.geojson && /Polygon/.test(best.geojson.type||'') && _classBonus(best)>0);
        return {lng:+best.lon, lat:+best.lat, name:(best.display_name||place).split(',')[0], box, geojson:best.geojson||null, adminPoly,
          cls:String(best.category||best.class||''), typ:String(best.type||''),   /* (#R116) jsonv2 = "category" (R64 gotcha); lets callers accept water/natural polygons */
          osmType:best.osm_type||'', osmId:+best.osm_id||0}; }catch(_){}
      return null; }

    /* ==================================================================================================
       (#R132) GENERAL AMBIGUOUS-/UNREGISTERED-REGION RESOLVER — window.IntMapRegionResolver
       --------------------------------------------------------------------------------------------------
       Goal: draw high-accuracy REAL extents for arbitrary natural / informal / historical / economic region
       names ("East European Plain", "関東平野", "Pannonian Basin", "Tibetan Plateau", "Levant", "Donbas",
       "Sahel", "Fertile Crescent", "Blue Banana"…) WITHOUT the AI hallucinating a dense polygon over the
       wrong coast, and to return an HONEST "no reliable boundary" instead of a country/continent/rectangle/blob.

       DESIGN (spec P0-P2):
       • The AI is NOT the author of boundary coordinates. ONE web-grounded geo_resolve call returns METADATA only —
         canonicalName, aliases, featureType, expectedCountries, representativePoint, expectedBbox, geometryStrategy,
         osmName, adminUnits, mustInclude / mustExclude points, clockwise boundaryAnchors, confidence, sources.
       • Real data draws the geometry, most-exact first: country → admin_union (real member boundaries via
         composeRegion) → osm_polygon (real OSM boundary via _nomExtent, anchored by the verified point) →
         derived_anchors (a SIMPLE polygon built from the web-verified boundary anchors, clipped to the expected
         bbox — labelled "derived / approximate"). No raw bbox is ever painted as a boundary.
       • fail-CLOSED validation gate: bbox overlap, mustInclude coverage, mustExclude exclusion, expected-country
         match, area/whole-world sanity — a result that does not pass is DROPPED (honest miss), never painted.
       • ambiguous names (Georgia country vs US state, Congo…) → return candidates so Atlas asks instead of guessing.
       • ONE web AI call per resolve; abortable (real AbortController, not a discarded Promise.race); two-layer cache
         (session Map + IndexedDB, versioned + TTL) so a repeat is instant and a stale/old-algo entry self-expires.
       ================================================================================================== */
    const _RR_ALGO=1, _RR_DB='intmap_regionresolver', _RR_STORE='regions';
    const _RR_TTL_POS=90*864e5, _RR_TTL_NEG=7*864e5;   /* keep good extents 90d, negatives 7d */
    const _rrMem=new Map(); let _rrLast=null;
    const _rrNow=()=>{ try{ return Date.now(); }catch(_){ return 0; } };
    /* geo_resolve OUTPUT schema (forwarded to the Gemini path as responseSchema; the OpenAI/Terra path pins the shape
       via the prompt + client validation). Google REST enum style (uppercase types) to match the proxy contract. */
    const GEO_RESOLVE_SCHEMA={ type:'OBJECT', properties:{
      found:{type:'BOOLEAN'}, canonicalName:{type:'STRING'}, aliases:{type:'ARRAY',items:{type:'STRING'}},
      featureType:{type:'STRING'}, ambiguous:{type:'BOOLEAN'},
      candidates:{type:'ARRAY',items:{type:'OBJECT',properties:{name:{type:'STRING'},country:{type:'STRING'},note:{type:'STRING'}}}},
      expectedCountries:{type:'ARRAY',items:{type:'STRING'}},
      representativePoint:{type:'OBJECT',properties:{lat:{type:'NUMBER'},lng:{type:'NUMBER'}}},
      expectedBbox:{type:'ARRAY',items:{type:'NUMBER'}},
      geometryStrategy:{type:'STRING'}, osmName:{type:'STRING'}, wikidata:{type:'STRING'},
      adminUnits:{type:'ARRAY',items:{type:'OBJECT',properties:{q:{type:'STRING'},part:{type:'STRING'}}}},
      mustInclude:{type:'ARRAY',items:{type:'OBJECT',properties:{name:{type:'STRING'},lat:{type:'NUMBER'},lng:{type:'NUMBER'}}}},
      mustExclude:{type:'ARRAY',items:{type:'OBJECT',properties:{name:{type:'STRING'},lat:{type:'NUMBER'},lng:{type:'NUMBER'}}}},
      boundaryAnchors:{type:'ARRAY',items:{type:'OBJECT',properties:{name:{type:'STRING'},lat:{type:'NUMBER'},lng:{type:'NUMBER'},role:{type:'STRING'}}}},
      confidence:{type:'NUMBER'}, sources:{type:'ARRAY',items:{type:'OBJECT',properties:{title:{type:'STRING'},url:{type:'STRING'}}}}
    }, required:['found','canonicalName','featureType','geometryStrategy'] };
    function _rrSysPrompt(){ return [
      personaPrompt('resolving a region against the live web for the IntMap world map',{mode:'internal'})/* (#R285) machine-read output */+'Given a place/region name (any language), web-search it to VERIFY it is a real place and to obtain its REAL extent, then return STRICT JSON ONLY (no prose, no code fence) describing HOW to draw it from real data. You do NOT output a dense boundary polygon — the client builds the geometry from the metadata you return, so your coordinates must be REAL places, never invented to fit.',
      'Output object fields:',
      '{"found":true|false, "canonicalName":"<English canonical name>", "aliases":["<other/native names>"], "featureType":"country|admin|region|historical_region|economic_region|cultural_region|plain|plateau|basin|valley|desert|mountain_range|coast|peninsula|isthmus|cape|island|archipelago|water|sea|gulf|strait|urban_area|corridor|other", "ambiguous":true|false, "candidates":[{"name":"","country":"","note":""}], "expectedCountries":["<English country names the feature lies in>"], "representativePoint":{"lat":<n>,"lng":<n>}, "expectedBbox":[<west>,<south>,<east>,<north>], "geometryStrategy":"country|admin_union|osm_polygon|derived_anchors|none", "osmName":"<best OpenStreetMap/Nominatim search string, include the country>", "wikidata":"<QID or empty>", "adminUnits":[{"q":"<admin unit, Country — Nominatim-searchable>","part":null}], "mustInclude":[{"name":"","lat":<n>,"lng":<n>}], "mustExclude":[{"name":"","lat":<n>,"lng":<n>}], "boundaryAnchors":[{"name":"","lat":<n>,"lng":<n>,"role":"<e.g. NW corner / eastern edge>"}], "confidence":<0..1>, "sources":[{"title":"","url":""}]}',
      'geometryStrategy — choose the MOST EXACT that fits:',
      '• "country": the name IS a sovereign country or dependency (return canonicalName; the client uses national borders).',
      '• "admin_union": the region is well approximated by a union of REAL administrative units (historic provinces, groupings of states/prefectures/oblasts, economic macro-regions). List them in adminUnits as Nominatim-searchable "Unit, Country" strings (up to 40); prefer first-level units; set part to a compass octant ("N"/"S"/"E"/"W"/"NE"/…/"C") ONLY when clearly <~70% of a unit belongs.',
      '• "osm_polygon": OpenStreetMap almost certainly has a single named boundary/relation for it (most named seas/gulfs/straits, many mountain ranges, deserts, well-defined regions). Give osmName = the exact Nominatim search string (with country).',
      '• "derived_anchors": NO official or OSM boundary exists (informal natural/economic/historical regions — plains, plateaus, belts, corridors). Provide boundaryAnchors = 6-16 REAL NAMED places (cities, capes, river mouths, mountain passes, coastal points) that lie ON the region perimeter, listed CLOCKWISE, each with real coords; and give a good mustInclude/mustExclude set. The client builds a simple polygon from these anchors and validates it.',
      '• "none": the name has no meaningful drawable extent (a whole continent, a hemisphere, a vague direction) or you cannot verify it — set found accordingly.',
      'ALWAYS fill representativePoint (a point clearly INSIDE the feature), expectedBbox [west,south,east,north] in degrees, expectedCountries, and 2-8 mustInclude points (well-known places clearly inside) plus 1-6 mustExclude points (well-known places just OUTSIDE / in a neighboring region that must NOT be covered). These are used to validate the drawn geometry, so they must be accurate.',
      'AMBIGUITY: if the name has more than one well-known referent (e.g. "Georgia" = the country vs the US state; "Congo" = two countries and a river; "Kashmir" = a disputed multi-country region), set ambiguous:true and list 2-4 candidates ({name, country, note}); still resolve your single most-likely interpretation for the other fields. If a CONTEXT line is given, use it ONLY to break ties between otherwise-equal candidates.',
      'found:false ONLY when the name is fictional or cannot be matched to any real place. Coordinates: lat -90..90, lng -180..180. Base every coordinate on web-search evidence or firm knowledge — NEVER fabricate coordinates to make a shape look right. Cite the pages you used in sources.'
    ].join('\n'); }
    function _rrCtxLine(ctx){ try{ if(!ctx) return ''; const bits=[];
      if(ctx.mapCenter&&isFinite(+ctx.mapCenter.lat)) bits.push('map is centered near lat '+(+ctx.mapCenter.lat).toFixed(1)+', lng '+(+ctx.mapCenter.lng).toFixed(1));
      if(ctx.lastCountry) bits.push('recently discussed country: '+String(ctx.lastCountry).slice(0,40));
      if(ctx.lang) bits.push('user language: '+ctx.lang);
      return bits.length?('CONTEXT (use only to disambiguate equal candidates): '+bits.join('; ')):''; }catch(_){ return ''; } }
    /* ONE abortable, web-grounded metadata call. Returns the full envelope {data,meta,citations}. */
    async function geoResolve(query, ctx, opts){ opts=opts||{};
      const ctl=('AbortController' in window)?new AbortController():null; let timer=null;
      if(ctl){ timer=setTimeout(()=>{ try{ ctl.abort(); }catch(_){} }, opts.timeoutMs||22000); }
      if(opts.signal&&ctl){ try{ if(opts.signal.aborted) ctl.abort(); else opts.signal.addEventListener('abort',()=>{ try{ ctl.abort(); }catch(_){} },{once:true}); }catch(_){} }
      try{ const line=_rrCtxLine(ctx);
        return await askAIJSONEnvelope('Region query: "'+String(query||'').slice(0,140)+'"'+(line?('\n'+line):''), _rrSysPrompt(), null, {task:'geo_resolve', webMode:'required', schema:GEO_RESOLVE_SCHEMA, signal:ctl?ctl.signal:null});
      } finally { if(timer) clearTimeout(timer); } }
    /* ---- geometry builders + validation (pure; covered by IntMapRegionResolverTest.run()) ---- */
    function _rrBoxOverlap(a,b){ try{ const w=Math.max(a[0],b[0]),s=Math.max(a[1],b[1]),e=Math.min(a[2],b[2]),n=Math.min(a[3],b[3]); if(e<=w||n<=s) return 0; const inter=(e-w)*(n-s); const aa=(a[2]-a[0])*(a[3]-a[1]),ab=(b[2]-b[0])*(b[3]-b[1]); const d=Math.min(aa,ab); return d>0?inter/d:0; }catch(_){ return 0; } }
    function _rrHull(pts){ const P=(pts||[]).filter(p=>Array.isArray(p)&&isFinite(+p[0])&&isFinite(+p[1])).map(p=>[+p[0],+p[1]]);
      if(P.length<3) return null; P.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
      const uniq=P.filter((p,i)=>i===0||p[0]!==P[i-1][0]||p[1]!==P[i-1][1]); if(uniq.length<3) return null;
      const cr=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);
      const lo=[]; for(const p of uniq){ while(lo.length>=2&&cr(lo[lo.length-2],lo[lo.length-1],p)<=0) lo.pop(); lo.push(p); }
      const up=[]; for(let i=uniq.length-1;i>=0;i--){ const p=uniq[i]; while(up.length>=2&&cr(up[up.length-2],up[up.length-1],p)<=0) up.pop(); up.push(p); }
      lo.pop(); up.pop(); const ring=lo.concat(up); if(ring.length<3) return null; ring.push(ring[0].slice());
      return {type:'Polygon',coordinates:[ring]}; }
    function _rrSimple(poly){ try{ if(typeof turf!=='undefined'&&turf.kinks){ const k=turf.kinks(poly); return !(k&&k.features&&k.features.length); } }catch(_){} return true; }
    function _rrLngSpan(pts){ let a=180,c=-180; (pts||[]).forEach(p=>{ if(p&&isFinite(+p[0])){ a=Math.min(a,+p[0]); c=Math.max(c,+p[0]); } }); return c-a; }
    /* Build a REAL-anchor-derived polygon: prefer the AI's clockwise perimeter anchors as an ordered ring (keeps
       concave band/corridor shapes) when it is SIMPLE (no self-crossing); else a convex hull of anchors+includes
       (always simple). Clip to the expected bbox so it can never bleed past the region's real span. */
    function _rrDerive(M){ try{
      const anchors=(M.boundaryAnchors||[]).filter(p=>p&&isFinite(+p.lat)&&isFinite(+p.lng)).map(p=>[+p.lng,+p.lat]);
      const incl=(M.mustInclude||[]).filter(p=>p&&isFinite(+p.lat)&&isFinite(+p.lng)).map(p=>[+p.lng,+p.lat]);
      if(_rrLngSpan(anchors.concat(incl))>=180) return null;   /* antimeridian-spanning → refuse (would wrap into a world blob) */
      let g=null;
      if(anchors.length>=5){ const ring=anchors.slice(); ring.push(ring[0].slice()); const poly={type:'Polygon',coordinates:[ring]};
        if(_rrSimple(poly)&&_geoArea(poly)>1e-5) g=poly; }
      if(!g){ const all=anchors.concat(incl); if(all.length>=5){ const h=_rrHull(all); if(h&&_geoArea(h)>1e-5) g=h; } }
      if(!g) return null;
      if(Array.isArray(M.expectedBbox)&&M.expectedBbox.length===4){ const e=M.expectedBbox.map(Number); if(e.every(isFinite)&&e[2]>e[0]&&e[3]>e[1]){ const cg=_clipGeoRect(g,[[e[0],e[1]],[e[2],e[3]]]); if(cg&&_geoArea(cg)>1e-6) g=cg; } }
      return g; }catch(_){ return null; } }
    /* fail-CLOSED validation of a candidate geometry against the resolved metadata. Returns {ok,reason,checks}. */
    function _rrValidate(geom, M){ const checks={}; M=M||{};
      try{
        if(!geom||(geom.type!=='Polygon'&&geom.type!=='MultiPolygon')) return {ok:false,reason:'geometry_invalid',checks};
        const bb=fbbox(geom); if(!bb) return {ok:false,reason:'geometry_invalid',checks}; checks.bbox=bb;
        const lngSpan=bb[2]-bb[0], latSpan=bb[3]-bb[1];
        if(!(lngSpan>0&&latSpan>0)) return {ok:false,reason:'geometry_invalid',checks};
        if(lngSpan>=345||latSpan>=170) return {ok:false,reason:'geometry_world',checks};   /* whole-world / continent blob */
        const area=_geoArea(geom); checks.area=area;
        const small=/island|cape|isthmus|reef|shoal|bay|lagoon|inlet|strait|urban/.test(String(M.featureType||''));
        if(area<(small?1e-6:1e-4)) return {ok:false,reason:'geometry_too_small',checks};
        if(Array.isArray(M.expectedBbox)&&M.expectedBbox.length===4){ const e=M.expectedBbox.map(Number); if(e.every(isFinite)&&e[2]>e[0]&&e[3]>e[1]){ const ov=_rrBoxOverlap(bb,e); checks.bboxOverlap=+ov.toFixed(3); if(ov<0.12) return {ok:false,reason:'geometry_bbox_mismatch',checks}; } }
        const inc=(M.mustInclude||[]).filter(p=>p&&isFinite(+p.lat)&&isFinite(+p.lng));
        if(inc.length){ let hit=0; inc.forEach(p=>{ if(_ptInGeo([+p.lng,+p.lat],geom)) hit++; }); checks.include=hit+'/'+inc.length;
          if(hit<Math.ceil(inc.length*0.6)) return {ok:false,reason:'include_anchor_failed',checks}; }
        const exc=(M.mustExclude||[]).filter(p=>p&&isFinite(+p.lat)&&isFinite(+p.lng));
        if(exc.length){ let bad=0; exc.forEach(p=>{ if(_ptInGeo([+p.lng,+p.lat],geom)) bad++; }); checks.exclude=bad+'/'+exc.length;
          if(bad>Math.floor(exc.length*0.15)) return {ok:false,reason:'exclude_anchor_failed',checks}; }
        if(Array.isArray(M.expectedCountries)&&M.expectedCountries.length){ const want=new Set(); M.expectedCountries.forEach(c=>{ try{ const r=resolveCountrySync(String(c)); if(r&&r.code) want.add(r.code); }catch(_){} });
          if(want.size){ const tp=inc.slice(0,4).map(p=>[+p.lng,+p.lat]); if(M.representativePoint&&isFinite(+M.representativePoint.lng)) tp.push([+M.representativePoint.lng,+M.representativePoint.lat]);
            let ok=!tp.length; for(const p of tp){ try{ const cc=codeAtPoint(p[0],p[1]); if(cc&&want.has(cc)){ ok=true; break; } }catch(_){} } checks.countryOk=ok;
            if(!ok) return {ok:false,reason:'geometry_country_mismatch',checks}; } }
        return {ok:true,checks};
      }catch(e){ return {ok:false,reason:'validator_error',checks}; } }
    function _rrDisambiguated(M,ctx){ try{ if(!ctx) return false; const lc=_lnorm(ctx.lastCountry||'');
      if(lc&&Array.isArray(M.expectedCountries)&&M.expectedCountries.some(c=>{ const x=_lnorm(c); return x&&(x.indexOf(lc)>=0||lc.indexOf(x)>=0); })) return true; }catch(_){} return false; }
    function _rrOk(status,query,M,geom,method,src,cites){ return {status,ran:true,query, canonicalName:M.canonicalName||query, aliases:M.aliases||[], featureType:M.featureType||'', geometry:geom, method, sourceName:src, citations:cites||[], confidence:(typeof M.confidence==='number'?M.confidence:0.6), countries:M.expectedCountries||[], candidates:[], warnings:[]}; }
    /* ---- IndexedDB persistent cache (versioned + TTL) ---- */
    function _rrIdbOpen(){ return new Promise(res=>{ try{ if(!('indexedDB' in window)) return res(null); const rq=indexedDB.open(_RR_DB,1);
      rq.onupgradeneeded=e=>{ try{ const db=e.target.result; if(!db.objectStoreNames.contains(_RR_STORE)) db.createObjectStore(_RR_STORE); }catch(_){} };
      rq.onsuccess=e=>res(e.target.result); rq.onerror=()=>res(null); rq.onblocked=()=>res(null); }catch(_){ res(null); } }); }
    async function _rrIdbGet(key){ const db=await _rrIdbOpen(); if(!db) return null; return new Promise(res=>{ try{ const rq=db.transaction(_RR_STORE,'readonly').objectStore(_RR_STORE).get(key); rq.onsuccess=()=>res(rq.result||null); rq.onerror=()=>res(null); }catch(_){ res(null); } }); }
    function _rrIdbPut(key,val){ _rrIdbOpen().then(db=>{ if(!db) return; try{ db.transaction(_RR_STORE,'readwrite').objectStore(_RR_STORE).put(val,key); }catch(_){} }); }
    function _rrFresh(rec){ try{ if(!rec||rec.algo!==_RR_ALGO||!rec.r) return false; const pos=(rec.r.status==='exact'||rec.r.status==='derived'); return (_rrNow()-rec.ts)<(pos?_RR_TTL_POS:_RR_TTL_NEG); }catch(_){ return false; } }
    async function _rrCacheGet(key){ const m=_rrMem.get(key); if(m){ if(_rrFresh(m)) return m.r; _rrMem.delete(key); }
      try{ const rec=await _rrIdbGet(key); if(rec&&_rrFresh(rec)){ _rrMem.set(key,rec); return rec.r; } }catch(_){} return null; }
    function _rrCachePut(key,r){ try{ const rec={algo:_RR_ALGO,ts:_rrNow(),r}; _rrMem.set(key,rec); _rrIdbPut(key,rec); }catch(_){} }
    /* ---- the resolver: ONE web call → real geometry (most-exact first) → fail-closed validation ---- */
    async function _rrResolve(query, ctx, opts){ query=String(query||'').trim(); ctx=ctx||{}; opts=opts||{};
      if(!query) return {status:'failed',ran:false,query,reason:'empty'};
      const key=_lnorm(query)+'|'+_RR_ALGO; const diag={query,stages:[]}; const _stage=s=>{ diag.stages.push(s); try{ if(ctx.onStage) ctx.onStage(s); }catch(_){} };
      const cached=await _rrCacheGet(key); if(cached){ const c=Object.assign({},cached,{cached:true}); _rrLast=c; return c; }
      if(!HOST.user){ const r={status:'failed',ran:false,query,reason:'not_logged_in',diagnostics:diag}; _rrLast=r; return r; }   /* fail-open → caller keeps legacy behaviour, no auth-modal pop */
      _stage('locating');
      let M=null, cites=[], webUsed=false;
      try{ const env=await geoResolve(query, ctx, opts); if(env){ M=env.data; cites=Array.isArray(env.citations)?env.citations:[]; webUsed=!!(env.meta&&env.meta.webUsed); } }
      catch(e){ const ab=(e&&(e.name==='AbortError'||/abort/i.test(String(e.message||''))));
        /* (#R132) ALWAYS fail-OPEN on an aborted OR errored call (ran:false) so resolveHlTarget keeps its legacy
           fallbacks — a transient provider blip must not suppress a highlight that used to work. */
        const r={status:'failed',ran:false,query,reason:ab?'aborted':'provider_error',diagnostics:diag}; _rrLast=r; return r; }
      /* a null/unparseable payload is a call FAILURE (fail-open); only an explicit found:false is a trusted "no region" verdict */
      if(!M||typeof M!=='object'){ const r={status:'failed',ran:false,query,reason:'no_data',diagnostics:diag}; _rrLast=r; return r; }
      if(!M.found){ const r={status:'not_found',ran:true,query,canonicalName:M.canonicalName||query,confidence:M.confidence||0,citations:cites,diagnostics:diag}; _rrCachePut(key,r); _rrLast=r; return r; }
      diag.featureType=M.featureType; diag.strategy=M.geometryStrategy; diag.webUsed=webUsed;
      /* seed the geoVerify cache from the SAME web call so any later _getGV() in resolveHlTarget is free */
      try{ if(M.representativePoint&&isFinite(+M.representativePoint.lat)&&isFinite(+M.representativePoint.lng)&&!(_lnorm(query) in _geoVerifyCache)){
        _geoVerifyCache[_lnorm(query)]={found:true,lat:+M.representativePoint.lat,lng:+M.representativePoint.lng,kind:String(M.featureType||'region'),country:(M.expectedCountries||[])[0]||'',altNames:M.aliases||[],confidence:(typeof M.confidence==='number'?M.confidence:0.6),webUsed}; } }catch(_){}
      if(M.ambiguous&&Array.isArray(M.candidates)&&M.candidates.length>=2&&!_rrDisambiguated(M,ctx)){ const r={status:'ambiguous',ran:true,query,canonicalName:M.canonicalName||query,candidates:M.candidates.slice(0,4),citations:cites,confidence:M.confidence||0,diagnostics:diag}; _rrLast=r; return r; }
      const strat=String(M.geometryStrategy||'').toLowerCase(); let geom=null, method='', src='';
      _stage('fetching');
      if(strat==='country'){ let cc=null; try{ cc=resolveCountrySync(M.canonicalName)||resolveCountrySync((M.expectedCountries||[])[0]||''); }catch(_){} if(cc&&cc.code){ const p=_cgPoly(cc.code); if(p&&p.geo){ geom=p.geo; method='country'; src='national boundary'; } } }
      if(!geom&&(strat==='admin_union'||strat==='admin')){ const units=(M.adminUnits||[]).filter(u=>u&&u.q).map(u=>({q:String(u.q).slice(0,90),part:(u.part&&/^(N|S|E|W|NE|NW|SE|SW|C)$/.test(String(u.part)))?String(u.part):null})).slice(0,44);
        if(units.length){ try{ const cp=await composeRegion({units,iso:[]}, key+'|au'); if(cp&&cp.geo&&cp.n>=Math.max(1,Math.round(cp.total*0.5))){ geom=cp.geo; method='admin_union'; src=cp.n+' administrative units'; diag.adminN=cp.n+'/'+cp.total; } }catch(_){} } }
      if(!geom&&(strat==='osm_polygon'||strat==='osm'||!strat)){ try{ const anc=(M.representativePoint&&isFinite(+M.representativePoint.lng))?{lat:+M.representativePoint.lat,lng:+M.representativePoint.lng}:null;
        const e=await _nomExtent(M.osmName||M.canonicalName||query, anc); if(e&&e.geojson&&/Polygon/.test(e.geojson.type||'')){ geom=e.geojson; method='osm_polygon'; src='OpenStreetMap boundary'; } }catch(_){} }
      if(!geom&&(strat==='derived_anchors'||strat==='derived'||strat==='osm_polygon'||!strat)){ if(webUsed){ const g=_rrDerive(M); if(g){ geom=g; method='derived_anchors'; src=((M.boundaryAnchors||[]).length)+' web-verified boundary anchors'; } } }
      if(!geom){ const r={status:'not_found',ran:true,query,canonicalName:M.canonicalName||query,confidence:M.confidence||0,citations:cites,warnings:['no_geometry'],diagnostics:diag}; _rrCachePut(key,r); _rrLast=r; return r; }
      _stage('validating'); let v=_rrValidate(geom,M); diag.validation=v;
      if(!v.ok){
        /* an OSM/admin polygon that fails validation → try the web-anchor derived shape ONCE before giving up */
        if(method!=='derived_anchors'&&webUsed){ const g2=_rrDerive(M); if(g2){ const v2=_rrValidate(g2,M); if(v2.ok){ geom=g2; method='derived_anchors'; src=((M.boundaryAnchors||[]).length)+' web-verified boundary anchors'; v=v2; diag.validation=v2; diag.fellBackToDerived=true; } } }
      }
      if(!v.ok){ const r={status:'failed',ran:true,query,canonicalName:M.canonicalName||query,confidence:M.confidence||0,citations:cites,warnings:[v.reason],reason:v.reason,diagnostics:diag}; _rrCachePut(key,r); _rrLast=r; return r; }
      _stage('drawing'); const status=(method==='derived_anchors')?'derived':'exact'; const r=_rrOk(status,query,M,geom,method,src,cites); r.diagnostics=diag; _rrCachePut(key,r); _rrLast=r; return r; }
    /* ---- pure-function regression harness (no AI): validates the geometry math the resolver depends on ---- */
    function _rrSelfTest(){ const res=[]; const ok=(n,c)=>res.push({name:n,pass:!!c});
      try{
        const sq={type:'Polygon',coordinates:[[[0,0],[0,10],[10,10],[10,0],[0,0]]]};
        ok('hull of a square', (()=>{ const h=_rrHull([[0,0],[0,10],[10,10],[10,0],[5,5]]); return h&&_geoArea(h)>90; })());
        ok('boxOverlap identical=1', Math.abs(_rrBoxOverlap([0,0,10,10],[0,0,10,10])-1)<1e-6);
        ok('boxOverlap disjoint=0', _rrBoxOverlap([0,0,1,1],[5,5,6,6])===0);
        ok('reject whole-world blob', !_rrValidate({type:'Polygon',coordinates:[[[-179,-85],[-179,85],[179,85],[179,-85],[-179,-85]]]},{}).ok);
        ok('reject tiny sliver', !_rrValidate({type:'Polygon',coordinates:[[[0,0],[0,0.0001],[0.0001,0.0001],[0.0001,0],[0,0]]]},{featureType:'plain'}).ok);
        ok('accept valid vs bbox+include', _rrValidate(sq,{expectedBbox:[0,0,10,10],mustInclude:[{lat:5,lng:5}],featureType:'plain'}).ok);
        ok('reject bbox mismatch', !_rrValidate(sq,{expectedBbox:[100,50,110,60],featureType:'plain'}).ok);
        ok('reject include miss', !_rrValidate(sq,{mustInclude:[{lat:50,lng:50}],featureType:'plain'}).ok);
        ok('reject exclude hit', !_rrValidate(sq,{mustExclude:[{lat:5,lng:5}],featureType:'plain'}).ok);
        ok('derive simple ring from anchors', (()=>{ const g=_rrDerive({boundaryAnchors:[{lat:0,lng:0},{lat:10,lng:0},{lat:10,lng:10},{lat:0,lng:10}],mustInclude:[{lat:5,lng:5}],expectedBbox:[-1,-1,11,11]}); return g&&_geoArea(g)>50; })());
        ok('refuse antimeridian span', _rrDerive({boundaryAnchors:[{lat:0,lng:-170},{lat:10,lng:-170},{lat:10,lng:170},{lat:0,lng:170}]})===null);
        ok('cache fresh check pos', _rrFresh({algo:_RR_ALGO,ts:_rrNow(),r:{status:'exact'}}));
        ok('cache stale algo rejected', !_rrFresh({algo:_RR_ALGO+9,ts:_rrNow(),r:{status:'exact'}}));
        /* ===== (#R143) geographic-target resolution + geometry-validation gate + multi-region grouping (pure) ===== */
        /* UN M49 country-set resolution — region names → REAL national borders (not a bbox/AI blob) */
        const _rg=n=>{ const r=regionGroup(n); return r&&r.codes?r.codes:null; };
        const _WE=_rg('western europe'), _EE=_rg('eastern europe'), _SE=_rg('southern europe'), _NE=_rg('northern europe');
        ok('M49 西欧 → Western Europe set (FRA/DEU/NLD, ~9)', !!_WE&&_WE.indexOf('FRA')>=0&&_WE.indexOf('DEU')>=0&&_WE.indexOf('NLD')>=0&&_WE.length>=8);
        ok('M49 alias 西欧===western europe', JSON.stringify(_rg('西欧'))===JSON.stringify(_WE));
        ok('M49 alias Westeuropa (DE)===western europe', JSON.stringify(_rg('Westeuropa'))===JSON.stringify(_WE));
        ok('M49 alias западная европа (RU)===western europe', JSON.stringify(_rg('западная европа'))===JSON.stringify(_WE));
        ok('M49 東欧 → Eastern Europe (POL/RUS/UKR)', !!_EE&&_EE.indexOf('POL')>=0&&_EE.indexOf('RUS')>=0&&_EE.indexOf('UKR')>=0);
        ok('M49 南欧 → Southern Europe (ITA/ESP/GRC)', !!_SE&&_SE.indexOf('ITA')>=0&&_SE.indexOf('ESP')>=0&&_SE.indexOf('GRC')>=0);
        ok('M49 Europe four are DISJOINT (clean partition)', (()=>{ const all=[].concat(_WE,_EE,_SE,_NE); return all.length===new Set(all).size; })());
        ok('standalone 北欧 stays the Nordic set (ISL yes, GBR no)', (()=>{ const n=_rg('北欧'); return !!n&&n.indexOf('ISL')>=0&&n.indexOf('GBR')<0&&n.length<=6; })());
        ok('M49 north america (USA/CAN)', (()=>{ const n=_rg('north america'); return !!n&&n.indexOf('USA')>=0&&n.indexOf('CAN')>=0; })());
        ok('M49 western asia (SAU/TUR/IRQ)', (()=>{ const n=_rg('western asia'); return !!n&&n.indexOf('SAU')>=0&&n.indexOf('TUR')>=0&&n.indexOf('IRQ')>=0; })());
        ok('europe union built (>30 countries)', (()=>{ const n=_rg('europe'); return !!n&&n.length>30; })());
        ok('a natural region (Sahara) is NOT a country set → null', _rg('Sahara')===null&&_rg('サハラ')===null);
        /* compound expansion — "東西南北欧" → the four M49 sub-regions; the co-occurrence rule canonicalises 北欧→M49 */
        const _ex1=_expandRegionCompound(['東西南北欧']);
        ok('expand 東西南北欧 → 4 M49 europe keys', _ex1.length===4&&_ex1.indexOf('western europe')>=0&&_ex1.indexOf('eastern europe')>=0&&_ex1.indexOf('southern europe')>=0&&_ex1.indexOf('northern europe')>=0);
        const _ex2=_expandRegionCompound(['西欧','東欧','南欧','北欧']);
        ok('expand [西欧,東欧,南欧,北欧] → M49 (北欧→northern europe in the set)', _ex2.length===4&&_ex2.indexOf('northern europe')>=0&&_ex2.indexOf('western europe')>=0);
        ok('single 北欧 NOT canonicalised (stays Nordic)', (()=>{ const e=_expandRegionCompound(['北欧']); return e.length===1&&e[0]==='北欧'; })());
        ok('expand 南北アメリカ → north+south america', (()=>{ const e=_expandRegionCompound(['南北アメリカ']); return e.length===2&&e.indexOf('north america')>=0&&e.indexOf('south america')>=0; })());
        /* geometry-validation gate — the "巨大な三角形など描画前に拒否" requirement */
        const _softBox=_bboxSoftPoly([[0,0],[10,8]]);
        ok('validGeo accepts a real soft outline (41-pt)', _validGeo(_softBox,{}).ok===true);
        ok('validGeo REJECTS a giant triangle', (()=>{ const r=_validGeo({type:'Polygon',coordinates:[[[0,0],[20,0],[10,20],[0,0]]]},{}); return !r.ok&&r.reason==='degenerate-triangle'; })());
        ok('validGeo REJECTS an unclosed ring', !_validGeo({type:'Polygon',coordinates:[[[0,0],[0,5],[5,5],[5,0]]]},{}).ok);
        ok('validGeo autocloses when asked', _validGeo({type:'Polygon',coordinates:[[[0,0],[0,0.5],[0.5,0.5],[0.4,0.2],[0.3,0.1],[0.2,0.05],[0.1,0.02]]]},{autoclose:true,allowTiny:true}).ok===true);
        ok('validGeo REJECTS a self-intersecting bowtie', (()=>{ const r=_validGeo({type:'Polygon',coordinates:[[[0,0],[1,1],[1,0],[0,1],[0,0]]]},{}); return !r.ok&&r.reason==='self-intersecting'; })());
        ok('validGeo REJECTS a whole-world blob', !_validGeo({type:'Polygon',coordinates:[[[-179,-85],[-179,85],[179,85],[179,-85],[-179,-85]]]},{}).ok);
        ok('validGeo REJECTS a tiny sliver', !_validGeo({type:'Polygon',coordinates:[[[0,0],[0,0.0002],[0.0002,0.0002],[0.0002,0],[0,0]]]},{}).ok);
        ok('validGeo REJECTS an abnormal long edge (crude quad)', (()=>{ const r=_validGeo({type:'Polygon',coordinates:[[[0,0],[10,0.2],[10.1,0.4],[0.1,0.3],[0,0]]]},{}); return !r.ok; })());
        ok('validGeo TRUSTS real borders (few-vertex heuristics skipped)', _validGeo({type:'Polygon',coordinates:[[[0,0],[20,0],[10,20],[0,0]]]},{trusted:true}).ok===true);
        ok('validGeo rejects non-polygon', !_validGeo({type:'LineString',coordinates:[[0,0],[1,1]]},{}).ok);
        /* palette + legend — multiple regions get distinct colours + a legend */
        ok('palette gives 4 distinct colors', new Set([0,1,2,3].map(_hlPaletteColor)).size===4);
        ok('legend lists each group with a color swatch', (()=>{ const h=_hlLegendHtml([{name:'A',color:'#111111',nCountries:3},{name:'B',color:'#222222',nCountries:5}]); return h.indexOf('>A<')>=0&&h.indexOf('>B<')>=0&&h.indexOf('#111111')>=0&&h.indexOf('#222222')>=0; })());
        /* real-border group geometry (only when countryGeo is loaded in this context) */
        ok('codesGeo empty input → null geo', (()=>{ const r=_codesGeo([]); return r&&r.geo===null; })());
        ok('codesGeo builds a MultiPolygon from real borders (if data loaded)', (()=>{ const g=geo(); if(!g||!g.features) return true; const r=_codesGeo(_WE); return !!r.geo&&r.geo.type==='MultiPolygon'&&r.hit.length>=6&&_validGeo(r.geo,{trusted:true}).ok; })());
      }catch(e){ res.push({name:'threw:'+String(e&&e.message||e),pass:false}); }
      const pass=res.filter(r=>r.pass).length; const out={pass,total:res.length,ok:pass===res.length,results:res};
      try{ console.log('[IntMapRegionResolverTest]', out.pass+'/'+out.total, out.ok?'ALL PASS':'FAIL', res.filter(r=>!r.pass).map(r=>r.name)); }catch(_){} return out; }
    try{ window.IntMapRegionResolver={ resolve:_rrResolve, geoResolve:geoResolve, validate:_rrValidate, hull:_rrHull, derive:_rrDerive, version:_RR_ALGO,
      clearCache:function(){ try{ _rrMem.clear(); }catch(_){} try{ indexedDB.deleteDatabase(_RR_DB); }catch(_){} } };
      window.IntMapRegionResolverDebug={ get last(){ return _rrLast; }, mem:function(){ return Array.from(_rrMem.keys()); }, cacheGet:_rrCacheGet };
      window.IntMapRegionResolverTest={ run:_rrSelfTest }; }catch(_){}

    async function placeExtent(place){ place=String(place||'').trim(); if(!place||DEIXIS_RE.test(place)||SELFLOC_RE.test(place)||WORLD_RE.test(place)) return null;   /* (#R85) 現在地 has no Nominatim extent — resolve it via geocode()→device GPS */
      /* 1) macro-region with a known real extent (Nominatim has no clean polygon for these). */
      const reg=regionBox(place); if(reg) return reg;
      /* 2) "city centre of X" → the city core at a close view (a small box around the city point). */
      const cb=parseCenter(place); if(cb){ const e=await _nomExtent(cb); if(e&&isFinite(e.lng)){ const d=0.06; return {lng:e.lng, lat:e.lat, name:e.name, box:[[e.lng-d,e.lat-d*0.8],[e.lng+d,e.lat+d*0.8]]}; } }
      /* 3) directional sub-region. A "Dir + Word" string is often a PROPER name (South Korea, West Virginia,
         Northern Ireland), so try the FULL name first — if Nominatim returns a real admin polygon, use it. Only
         when the full name is junk (Southern Italy → a POI) do we SLICE the base place's real polygon (dynamic). */
      const dir=parseDirectional(place);
      if(dir){ const full=await _nomExtent(place); if(full&&full.adminPoly&&full.box) return full;
        const e=await _nomExtent(dir.base); if(e&&e.box){ const sb=sliceBox(e.box,dir.dir); return {lng:(sb[0][0]+sb[1][0])/2, lat:(sb[0][1]+sb[1][1])/2, name:place.trim(), box:sb}; }
        if(full&&full.box) return full; }
      /* 4) normal place — Nominatim with POI-vs-admin filtering + real footprint. */
      return await _nomExtent(place); }
    /* Fit a box at a comfortable zoom: proportional MARGIN (so the place isn't edge-to-edge) + cameraForBounds, with
       only loose SANITY caps (a point can't go past z16.5; nothing below z0.6). NO per-type constants. */
    function flyToBox(box){ try{ const el=GE().render.container&&GE().render.container(); const W=(el&&el.clientWidth)||1000, H=(el&&el.clientHeight)||700; const pad=Math.max(38, Math.round(Math.min(W,H)*0.09));
      const cam=GE().camera.forBounds(box,{padding:pad,maxZoom:16.5}); if(cam&&cam.center&&isFinite(cam.zoom)){ const z=Math.max(0.6,Math.min(16.5,cam.zoom)); GE().camera.flyTo({center:[cam.center.lng,cam.center.lat], zoom:z, duration:1100}); return true; } }catch(_){}
      try{ GE().camera.fitBounds(box,{padding:46,duration:1100,maxZoom:16}); return true; }catch(_){} return false; }
  /* ⚠ (#R413) THIS SET IS NOT A CONVENIENCE — tests/r199-checks ② requires it to be EXACTLY what
     js/atlas-console.js destructures, because a name in one and not the other is a silent
     `undefined`. So `SELFLOC_WORDS`, `SELFLOC_RE` and `_coordPlace` are NOT exported for the test's
     benefit: tests/r413-checks reaches them the way the app does, through `geocode()`. */
  return { DEIXIS_RE, REGION_ALIASES, WORLD_RE, _bboxOK, _classBonus, _geoAgrees, _gvStrong, _nomExtent, _rrResolve, _selfLocSeed, flyToBox, geoVerify, geocode, parseDirectional, placeExtent, regionBox, sliceBox };
}
