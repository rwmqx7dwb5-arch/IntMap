/* ============================================================================
 *  IntMap · Place / sea labels and label localisation  (#R169)
 * ----------------------------------------------------------------------------
 *  Moved VERBATIM out of the index.html DOMContentLoaded closure (Architecture.md §3.1).
 *  Every statement here is a DECLARATION — the factory runs no app code, so it can be
 *  instantiated with the other #R168/#R169 factories right after `map` exists.
 *  The only edit to the moved text is that free references to closure variables became
 *  HOST.<member> reads/writes.
 * ==========================================================================*/
window.IntMapModules=window.IntMapModules||{};
window.IntMapModules.placeLabels=function(HOST){
 const GE=()=>window.IntMapGeoEngine;   /* (#R178) the renderer, through the contract — never the raw handle */
 const LS=window.IntMapLabelScale;      /* (#R198) every text size on the map comes from js/label-scale.js */
  /* (#R170) "Is it safe to addSource/addLayer right now?" — the app-wide predicate declared in index.html.
     A function DECLARATION so nested closures above this line can call it (no TDZ). Falls back to the old
     isStyleLoaded() test only if the host is somehow absent. */
  function _imCanDraw(){ try{ return !!HOST.canDraw(); }catch(_){ try{ return !!GE().ready(); }catch(__){ return false; } } }
  /* Localize the geopolitical / strategic layer checkboxes in the Layers menu (their text was
     hard-coded English; pull the right language out of geoLayersDB instead). */
  /* Fallback names for geo-layer checkboxes whose layer was pulled out of geoLayersDB (e.g. Rimland,
     now a country-fill) so they still localize EN/JP (#3). */
  const GEO_LABEL_FALLBACK={ rimland:{name:{en:'Rimland',jp:'リムランド'}}, fsu:{name:{en:'Former Soviet Union',jp:'旧ソ連諸国'}} };
  function localizeGeoLabels(){
    document.querySelectorAll('.geo-layer-cb').forEach(cb=>{
      const key=cb.getAttribute('data-layer'), data=(typeof HOST.geoLayersDB!=='undefined'&&HOST.geoLayersDB[key])||GEO_LABEL_FALLBACK[key]; if(!data||!data.name) return;
      const label=cb.closest('.layer-option'); if(!label) return;
      let span=label.querySelector('.geo-label');
      if(!span){ /* migrate the bare trailing text node into a span we can re-localize */
        Array.from(label.childNodes).forEach(n=>{ if(n.nodeType===3 && n.textContent.trim()) n.remove(); });
        span=document.createElement('span'); span.className='geo-label';
        /* (#R15e) Insert the label BEFORE the favorite star — appending it to the end put it AFTER the
           star (which has margin-left:auto), shoving the text to the right with a big gap ("ぐちゃっと"). */
        const star=label.querySelector('.lyr-star');
        if(star) label.insertBefore(span,star); else label.appendChild(span);
      }
      span.textContent=' '+(data.name[HOST.lang]||data.name.en||key);
    });
  }
  let _placeLabelsAdded=false;
  /* (#R27) IDEMPOTENT now. The old `_placeLabelsAdded` early-return made this a one-shot: if the very
     first call added the layers a hair before the OFM source/style was truly ready, they were never
     re-added — which is exactly why labels were missing on first load but appeared after toggling
     names off/on ("デフォルト選択なのに地名ラベルが出ない、再チェックで出る"). The per-source / per-layer
     `if(!getLayer)` guards already make repeated calls safe, so we just re-attempt every time. */
  function ensurePlaceLabels(){
    if(!_imCanDraw()) return;
    try{
      /* Use the TileJSON URL (not a hardcoded tile path) — OpenFreeMap serves versioned tiles, so
         the bare /planet/{z}/{x}/{y}.pbf path 404s at real zooms and labels never appear. */
      if(!GE().layers.hasSource('ofm')) GE().layers.addSource('ofm',{type:'vector',url:'https://tiles.openfreemap.org/planet',attribution:'© OpenFreeMap © OpenMapTiles © OSM'});
      const FONT=['Noto Sans Regular'];
      const before = GE().layers.has('grid-lines') ? 'grid-lines' : undefined;
      if(!GE().layers.has('ofm-country')) GE().layers.add({id:'ofm-country',type:'symbol',source:'ofm','source-layer':'place',maxzoom:7,filter:['==',['get','class'],'country'],layout:{visibility:'none','text-field':['get','name'],'text-font':FONT,'text-size':LS.place('country'),'text-letter-spacing':0.08,'text-max-width':8,'text-padding':6},paint:{'text-color':'#e8eefc','text-halo-color':'rgba(0,0,0,0.75)','text-halo-width':1.4}}, before);
      if(!GE().layers.has('ofm-city')) GE().layers.add({id:'ofm-city',type:'symbol',source:'ofm','source-layer':'place',minzoom:3,filter:['all',['in',['get','class'],['literal',['city','town']]]],layout:{visibility:'none','text-field':['get','name'],'text-font':FONT,'text-size':LS.place('city'),'text-max-width':7,'text-variable-anchor':['top','bottom','left','right'],'text-radial-offset':0.4,'text-justify':'auto','icon-optional':true},paint:{'text-color':'#ffffff','text-halo-color':'rgba(0,0,0,0.8)','text-halo-width':1.3}});
      /* ══ (#R198) THE NAMES OF THE THINGS BETWEEN A COUNTRY AND A CITY ═══════════════════════════
         「地方行政区分も地名ラベルをつけるように。（例：日本の都道府県、アメリカ・ドイツ・オーストラリア
           の州、中国の省など。）」

         The app has drawn state/province BORDERS since #R32 and has never drawn their NAMES. Same
         `place` source-layer as the settlements above; the classes are `state` and `province`, which
         MEASURED over the live tiles carry exactly the units named in the request — 41 Japanese
         prefectures (class `province`, rank 5), 50 US states (`state`, rank 1), the Chinese provinces
         (`state`, rank 2), the German Länder and Australian states (`state`, rank 3) — each with the
         same `name:xx` fields every other label here localises through.

         ⚠ `rank` IS NOT A SEQUENCE NUMBER HERE. #R187 measured that `poi.rank` is one (a flat 72, 72,
         71 … histogram) and stopped gating on it. For state/province it is the opposite: the measured
         values group by SIZE across the whole planet — 1 for US states, 2 for Chinese provinces and
         Canadian provinces, 3 for German/Australian/Spanish/Italian regions, 4 for Russian oblasts,
         5 for Japanese prefectures, 6 for the smallest units — so it is exactly the "how far out is
         this thing still worth naming" ordering a zoom ladder wants. A unit appears when it is big
         enough on screen to hold its name, which is why the ladder is by rank and not by country.

         maxzoom 9: past that the label point is the unit's centroid sitting in the middle of streets
         that have their own names, and the region it belongs to is no longer the question being asked.
         ⚠ The order it is ADDED in here decides nothing: js/app-body.js's label STACK is re-asserted on
         idle and styledata, and that list is where ofm-admin1 is placed below ofm-city — so a crowded
         view resolves in the city's favour.
         ⚠ (#R201) IT IS IN THE LABEL-CLICK / HOVER LISTS. This note used to say the opposite, and the
         reply to it was 「クリック可能ではない！ほかの地名ラベルと違う挙動にするな！」. A label that looks like
         every other place label and answers nothing is not a smaller feature, it is a broken one — so
         js/map-ui.js now wires ofm-admin1 exactly the way it wires ofm-city (cursor, popup, outline). */
      /* ⚠ THE BREAKPOINTS ARE INTEGERS, AND THAT IS NOT A STYLE CHOICE. `['zoom']` inside a FILTER is
         re-evaluated only at INTEGER zooms — the app's own #R186 note says so about the POI gate, and
         this ladder was written with fractional stops (3.2 / 3.8 / 4.6 / 5.3 / 6.0 / 6.8) anyway.
         MEASURED consequence: Australia's states are rank 3, so they claimed to appear at z4.6, and at
         z4.6 the filter is evaluated at zoom 4, where the threshold is still 2 — six states present in
         the tiles and NOT ONE drawn, at exactly the zoom you look at Australia. Germany (also rank 3)
         hid the bug because you look at Germany at z5+, where floor(z) happens to agree.
         Integer stops mean the ladder does what it reads as.
         ⚠ AND rank 3 HAS TO ENTER AT z4, NOT z5. Measured again after the first fix: at z5 Australia
         no longer fits on screen, so only the one state whose label point is still in view gets drawn
         (South Australia, 1 of 6). The zoom at which you look at Australia IS z4 — the same z4 that
         already draws US states — and rank does not mean area here (Australia's states are far larger
         than the German Länder that share rank 3), so a ladder that separates them by zoom separates
         them by nothing. Each stop is pinned to a zoom verified by rendering: z4 → ranks 1-3, US (20),
         China (10), Brazil (16), India, Germany, Australia; z5 → rank 4, Russia (7); z6 → rank 5, the
         Japanese prefectures (11 at z6.2); z7 → everything left. */
      const A1_RANK=['<=',['coalesce',['get','rank'],6],['step',['zoom'],0, 4,3, 5,4, 6,5, 7,6]];
      if(!GE().layers.has('ofm-admin1')) GE().layers.add({id:'ofm-admin1',type:'symbol',source:'ofm','source-layer':'place',minzoom:4,maxzoom:9,
        filter:['all',['has','name'],['in',['get','class'],['literal',['state','province']]],A1_RANK],
        layout:{visibility:'none','text-field':['get','name'],'text-font':FONT,'text-size':LS.place('admin1'),
          'text-letter-spacing':0.06,'text-max-width':8,'text-padding':4,'text-optional':true,
          'symbol-sort-key':['coalesce',['get','rank'],6]},
        paint:{'text-color':'#c6d3ea','text-halo-color':'rgba(0,0,0,0.75)','text-halo-width':1.2}});
      if(!GE().layers.has('ofm-other')) GE().layers.add({id:'ofm-other',type:'symbol',source:'ofm','source-layer':'place',minzoom:7,filter:['all',['in',['get','class'],['literal',['village','suburb','hamlet','neighborhood']]]],layout:{visibility:'none','text-field':['get','name'],'text-font':FONT,'text-size':LS.place('other'),'text-max-width':7},paint:{'text-color':'#d8dde6','text-halo-color':'rgba(0,0,0,0.75)','text-halo-width':1.1}});
      /* (#R40) "河川や湖、その他地形のラベルが欲しい" — rivers/lakes/seas (water_name) + mountain peaks (mountain_peak),
         from the same OFM vector source. Italic blue for water (cartographic convention), a ▲ for peaks with
         elevation. They follow the Place-names toggle + the active label language (handled in applyLabelLang). */
      const FONTI=['Noto Sans Italic'];
      /* (#R41) ROOT CAUSE of "水域のラベルが地図からずれている": river names were read from `water_name` (which is
         POINT label geometry) but drawn with symbol-placement:line — line placement on a point lands the label
         off the actual river. River/canal names live in the `waterway` LINE layer; placing them there makes them
         follow the real river line on the basemap (aligned). */
      if(!GE().layers.has('ofm-river')) GE().layers.add({id:'ofm-river',type:'symbol',source:'ofm','source-layer':'waterway',minzoom:6,filter:['in',['get','class'],['literal',['river','canal']]],layout:{visibility:'none','symbol-placement':'line','text-field':['get','name'],'text-font':FONTI,'text-size':LS.sub(0.95),'text-max-angle':38,'text-letter-spacing':0.02,'symbol-spacing':350},paint:{'text-color':'#7fc4ff','text-halo-color':'rgba(0,0,0,0.7)','text-halo-width':1.1}});
      /* (#R62) sea/ocean/bay labels moved OFF the vector tiles: water_name label points are stored PER TILE, so the
         visible label jumped to a different point at every zoom level ("ズームに応じて位置がどんどんずれてしまう").
         OFM now only supplies LAKE names (compact bodies → no visible drift); seas/oceans/gulfs come from the fixed
         gazetteer below (one stable coordinate each, 5 languages, clickable). */
      /* (#R63) lakes: major lakes now come from the FIXED gazetteer too (their per-tile label points also drifted);
         OFM keeps only the long tail of small lakes from z5.5 where any drift is sub-glyph. Constant text size —
         the size interpolation amplified the perceived slide while zooming. */
      /* (#R64) WATER labels: the vector tiles store a DIFFERENT label geometry for the same lake at every zoom
         (per-tile LineString label lines), so a tile-driven layer re-anchors on zoom → the visible "slide".
         Water labels therefore render from a client-side STABLE source ('stab-water-src') that a harvester fills
         at runtime: every water name keeps the FIRST coordinate it was seen at, worldwide, nothing hardcoded.
         (#R67) PEAKS ARE THE OPPOSITE CASE and go back to DIRECT tile rendering: summits are exact POINT nodes
         whose tile-quantization error is always sub-pixel AT THE ZOOM THAT TILE IS VIEWED AT (error and pixel
         size shrink together), so the raw tile layer is inherently drift-free — while pinning them (R64/R66)
         BAKED IN one zoom's coarse coordinate and then hopped on refinement, which was itself the reported
         "山岳名がズームに応じて位置ずれする". Do not re-pin point features. */
      try{ if(!GE().layers.hasSource('stab-water-src')) GE().layers.addSource('stab-water-src',{type:'geojson',data:{type:'FeatureCollection',features:[]}}); }catch(_){}
      /* (#R69) both water layers additionally gate each pin on its first-seen tile zoom (`mz`, see _harvestOne)
         so zoomed-in harvests don't flood lower zooms ("水域ラベルが…過剰な数見えすぎ"). */
      if(!GE().layers.has('ofm-water')) GE().layers.add({id:'ofm-water',type:'symbol',source:'stab-water-src',minzoom:5.5,filter:['all',['!',['in',['get','class'],['literal',['ocean','sea','bay','strait','gulf','lagoon']]]],['<=',['coalesce',['get','mz'],0],['+',['zoom'],0.2]]],layout:{visibility:'none','text-field':['get','name'],'text-font':FONTI,'text-size':LS.sub(0.95),'text-max-width':8},paint:{'text-color':'#8fd0ff','text-halo-color':'rgba(0,0,0,0.7)','text-halo-width':1.1}});
      /* (#R65) seas/bays/straits/gulfs from the SAME pinned dynamic source (visible from low zoom) — every
         named water body worldwide gets a stable label, not just the curated majors. */
      if(!GE().layers.has('ofm-water2')) GE().layers.add({id:'ofm-water2',type:'symbol',source:'stab-water-src',minzoom:2,filter:['all',['in',['get','class'],['literal',['ocean','sea','bay','strait','gulf','lagoon']]],['<=',['coalesce',['get','mz'],0],['+',['zoom'],0.2]]],layout:{visibility:'none','text-field':['get','name'],'text-font':FONTI,'text-letter-spacing':0.06,'text-max-width':8,'text-size':LS.sub(1)},paint:{'text-color':'#8fd0ff','text-halo-color':'rgba(0,0,0,0.7)','text-halo-width':1.1,'text-opacity':0.95}});
      try{ if(!GE().layers.hasSource('geo-sea-src')){
        const S=window.SEA_LABELS||[];
        GE().layers.addSource('geo-sea-src',{type:'geojson',data:{type:'FeatureCollection',features:S.map((r,i)=>({type:'Feature',id:i,geometry:{type:'Point',coordinates:[r[0],r[1]]},properties:{z:r[2],big:r[2]<=1?1:0,en:r[3],jp:r[4],de:r[5],ru:r[6],es:r[7]}}))}});
      }
      /* (#R73) ROOT CAUSE of "主要な海や湖の名前が表示されない" (and the earlier 東シナ海 report): this layer's
         text-size was `case(big, interpolate(zoom), interpolate(zoom))` — a zoom interpolation NESTED inside
         `case`, which the style spec forbids (zoom must be the OUTERMOST expression). MapLibre rejected the
         whole addLayer SILENTLY (async error event, swallowed try) → the gazetteer sea/lake layer NEVER existed,
         and because the harvester dedupes any name already in the gazetteer, the majors were labelled NOWHERE.
         Rewritten with zoom outermost and the big/small distinction inside each stop output (valid form). */
      if(!GE().layers.has('geo-sea')) GE().layers.add({id:'geo-sea',type:'symbol',source:'geo-sea-src',minzoom:0,filter:['<=',['get','z'],['+',['zoom'],0.001]],layout:{visibility:'none','symbol-sort-key':['get','z'],'text-field':['get','en'],'text-font':FONTI,'text-letter-spacing':0.08,'text-max-width':8,
        /* (#R198) …and that valid form is now produced by LS.subCase, which keeps zoom outermost by
           construction. An ocean used to be the BIGGEST text on the map (19.3 px against a city's 15);
           it is a non-place label, so it is now under the place ladder like every other one. */
        'text-size':LS.subCase(['==',['get','big'],1],1,0.86)},
        paint:{'text-color':'#8fd0ff','text-halo-color':'rgba(0,0,0,0.7)','text-halo-width':1.1,'text-opacity':0.95}}); }catch(_){}
      /* (#R63) peaks: CONSTANT text size — size interpolation read as sliding. (#R67) rendered DIRECTLY from the
         mountain_peak tiles (point nodes are sub-pixel accurate at every zoom's own tiles).
         (#R68) MEASURED root cause of the still-reported drift: the anchors were glued (≤2.4 m across z10→z13.5,
         verified via queryRenderedFeatures), but text-anchor:'top' centered the whole "▲ Name" string under the
         point — the ▲ marker sat half-a-string-width LEFT of the summit, a constant SCREEN offset that spans
         kilometres of terrain at low zoom and metres at high zoom → the ▲ visibly pointed at different terrain
         at every zoom. The string is now LEFT-anchored: the ▲ glyph itself sits ON the summit at every zoom. */
      if(!GE().layers.has('ofm-peak')) GE().layers.add({id:'ofm-peak',type:'symbol',source:'ofm','source-layer':'mountain_peak',minzoom:7,filter:['has','name'],layout:{visibility:'none','text-field':['concat','▲ ',['get','name']],'text-font':FONT,'text-size':LS.sub(0.92),'text-max-width':30,'text-anchor':'left','text-justify':'left','text-offset':[-0.32,0]},paint:{'text-color':'#e7dcc8','text-halo-color':'rgba(0,0,0,0.8)','text-halo-width':1.2}});
      /* ══ (#R186) THE NAMES OF PLACES YOU GO TO ═════════════════════════════════════════════════
         「Base map & labelsに、地点の名前も追加して。（例：地名などではなく、店舗名や施設名など）」

         Settlement names come from the `place` layer above and water/terrain names from `waterway`,
         `water_name` and `mountain_peak`. Shops, restaurants, stations, hospitals, schools, museums
         and hotels are none of those — in the OpenMapTiles schema they are the `poi` layer, which
         the app has simply never drawn. Same source, same tiles, same fonts; nothing new is fetched.

         TWO THINGS ABOUT `poi` THAT DECIDE THE SHAPE OF THIS LAYER:
           · It starts at z14. Below that the tiles carry no POIs at all, so a lower minzoom would
             not show more, it would only ask the renderer to look.
           · It is DENSE — a city block can hold dozens. OpenMapTiles already answers that with
             `rank`, its own per-tile importance ordering (1 = the one to keep). So the filter opens
             the rank window as the zoom goes in, and `symbol-sort-key` hands the same ordering to
             the collision test, which means the label that survives a crowded corner is the one the
             tile itself considers most significant rather than whichever came first in the buffer.
             ⚠ `["zoom"]` inside a FILTER is only re-evaluated at integer zooms — that is exactly
             what a per-tile rank window wants, so it is used deliberately here and nowhere else.
         A dot marks the point itself: the text is offset off the feature, and without the dot the
         name would float with nothing under it. */
      /* ══ (#R187) WHAT KIND OF PLACE IT IS DECIDES WHETHER IT IS DRAWN ═══════════════════════════
         「（追記：店以外もいろいろ地点を追加して。）」

         #R186 gated this layer on OpenMapTiles' `rank`, on the belief that rank is a per-tile
         IMPORTANCE ordering. MEASURED over the tiles for central Tokyo at z16, it is not: the rank
         histogram is flat — 72, 72, 71, 71, 71 … — i.e. rank is a sequence number, not a score. So the
         window `rank ≤ 40` was an arbitrary slice, and of the 12,134 POIs in view it admitted 2,769,
         of which the two largest groups were **shop (723) and bus stops (372)** while restaurants fell
         from 1,903 to 41. What survived collision on screen was 74 labels: 24 bus stops and 14 shops,
         with one bank, one bakery, one school. Convenience stores and bus stops — which is the report.

         The window is therefore on the one field that DOES say what a place is: `class`. Four tiers,
         opened by zoom, so a hospital, a university, a station, a museum or a park appears as soon as
         the layer does, ordinary shops and restaurants join a zoom later, and street furniture (bus
         stops, entrances, benches, bollards) comes last instead of first. Nothing is removed — every
         class the tiles carry is still reachable, just no longer ahead of the landmarks.

         The same expression is the `symbol-sort-key`, so the collision test resolves a crowded corner
         the same way: the hospital keeps its label and the vending machine loses it. `rank` stays as
         the tie-break WITHIN a tier, which is the one job the flat sequence is fit for. */
      const POI_TIER=['match',['get','class'],
        /* 1 — the things a person navigates by */
        ['hospital','university','college','school','railway','aerodrome','airport','bus_station','ferry_terminal','harbor',
         'museum','attraction','monument','castle','memorial','place_of_worship','town_hall','police','fire_station',
         'library','theatre','stadium','sports_centre','park','zoo','cemetery','embassy','prison'],1,
        /* 2 — everyday destinations */
        ['bank','post','pharmacy','doctors','dentist','lodging','cinema','art_gallery','garden','playground','marketplace',
         'grocery','supermarket','fuel','golf','swimming_pool','picnic_site','veterinary','childcare','community_centre',
         'bicycle_rental','car_rental','information','recycling','shelter'],2,
        /* 3 — shops, food and drink, offices */
        ['shop','clothing_store','bakery','butcher','alcohol_shop','music','bicycle','car','hairdresser','laundry',
         'ice_cream','restaurant','cafe','fast_food','bar','beer','office','atm','parking','toilets','pitch',
         'basketball','running','yoga'],3,
        /* 4 — street furniture: real, useful up close, and never worth a landmark's place */
        4];
      const POI_GATE=['<=',POI_TIER,['step',['zoom'],1,15,2,16,3,17,4]];
      const POI_FILTER=['all',['has','name'],POI_GATE];
      if(!GE().layers.has('ofm-poi-dot')) GE().layers.add({id:'ofm-poi-dot',type:'circle',source:'ofm','source-layer':'poi',minzoom:14,
        filter:POI_FILTER,
        layout:{visibility:'none'},
        paint:{'circle-radius':['interpolate',['linear'],['zoom'],14,2.1,18,3.4],'circle-color':'#ffb454','circle-stroke-color':'rgba(0,0,0,0.55)','circle-stroke-width':0.9,'circle-opacity':0.95}});
      if(!GE().layers.has('ofm-poi')) GE().layers.add({id:'ofm-poi',type:'symbol',source:'ofm','source-layer':'poi',minzoom:14,
        filter:POI_FILTER,
        layout:{visibility:'none','text-field':['get','name'],'text-font':FONT,
          'text-size':LS.sub(0.86),
          'text-max-width':9,'text-optional':true,'text-padding':3,
          /* tier first, the tile's own sequence as the tie-break inside it */
          'symbol-sort-key':['+',['*',POI_TIER,1000],['coalesce',['get','rank'],1]],
          'text-variable-anchor':['top','bottom','left','right'],'text-radial-offset':0.55,'text-justify':'auto'},
        paint:{'text-color':'#ffd9a0','text-halo-color':'rgba(0,0,0,0.85)','text-halo-width':1.25}});
      _placeLabelsAdded=true;
      /* register the harvester ONCE — ensurePlaceLabels is intentionally re-run all the time (R27 idempotency),
         so an unguarded map.on here would pile up listeners. */
      if(!ensurePlaceLabels._harvestHooked){ ensurePlaceLabels._harvestHooked=true; GE().events.on('idle',()=>{ try{ harvestStableLabels(); }catch(_){}
        /* (#R72) SELF-HEAL: a basemap/style swap can wipe individual label layers; if the water/sea layers are
           gone while the toggle is on, re-add + re-apply. This was the reported "東シナ海が全体を写していても
           出ない" — the fixed sea-label layer had been silently dropped and nothing ever put it back. */
        try{ if(typeof HOST.geoLabelsOn!=='undefined'&&HOST.geoLabelsOn&&(!GE().layers.has('geo-sea')||!GE().layers.has('ofm-water')||!GE().layers.has('ofm-water2'))){ ensurePlaceLabels(); if(typeof applyLabelLang==='function') applyLabelLang(); } }catch(_){} }); }
    }catch(e){ console.warn('ensurePlaceLabels',e); }
  }
  let _stabSeaNames=null, _stabDirty={water:false};
  function _seaNameSet(){ if(_stabSeaNames) return _stabSeaNames; _stabSeaNames=new Set();
    try{ (window.SEA_LABELS||[]).forEach(r=>{ for(let i=3;i<=7;i++){ if(r[i]) _stabSeaNames.add(String(r[i]).toLowerCase()); } }); }catch(_){}
    return _stabSeaNames; }
  function _harvestOne(kind,sourceLayer,filter,cellDeg){
    const idx=HOST._stabIdx[kind]; let feats=[];
    try{ const opts={sourceLayer}; if(filter) opts.filter=filter; feats=GE().coords.querySourceFeatures('ofm',opts)||[]; }catch(_){ return; }
    const seaSet=(kind==='water')?_seaNameSet():null;
    /* (#R69) DENSITY ("水域ラベルがそれほどズームしていない状態でも過剰な数見えすぎ"): a pin harvested while
       zoomed in used to stay visible at EVERY lower zoom (the geojson source has no per-feature importance).
       Each pin now records the lowest tile zoom it was actually SEEN at (`mz`) — exactly the importance grading
       OpenMapTiles itself applies per zoom — and the label layers filter on it, so zooming out only keeps the
       water bodies the low-zoom tiles themselves consider worth labelling. mz only ever moves DOWN (a pin never
       disappears while zooming in) and the pinned POSITION never changes. */
    let zNow=6; try{ zNow=Math.max(0,Math.floor(GE().camera.getZoom())); }catch(_){}
    for(const f of feats){ try{
      const p=f.properties||{}; const nm2=p.name||p['name:en']||p.name_en; if(!nm2) continue;
      if(seaSet){ let dup=false; [p.name,p['name:en'],p.name_en,p['name:ja'],p['name:de'],p['name:ru'],p['name:es']].forEach(v=>{ if(v&&seaSet.has(String(v).toLowerCase())) dup=true; }); if(dup) continue; }   /* the curated multilingual gazetteer already labels it */
      /* OFM stores lake/water labels as per-tile LineStrings (label placement lines) — exactly why they drifted.
         Pin the midpoint of the line (or the point) as the one stable anchor. */
      const g=f.geometry; if(!g) continue; let co=null;
      if(g.type==='Point') co=g.coordinates;
      else if(g.type==='LineString'&&g.coordinates.length) co=g.coordinates[Math.floor(g.coordinates.length/2)];
      else if(g.type==='MultiLineString'&&g.coordinates.length&&g.coordinates[0].length){ const ln=g.coordinates[0]; co=ln[Math.floor(ln.length/2)]; }
      if(!co) continue;
      /* (#R65) dedupe radius scales with the feature's physical size class — one "Caspian Sea" pin, not one
         per tile pyramid level; small bays still allow same-name twins far apart. */
      const cls=String(p.class||'');
      const cell=(typeof cellDeg==='number')?cellDeg:(cls==='ocean'?30:cls==='sea'?12:(cls==='bay'||cls==='strait'||cls==='gulf'||cls==='lagoon')?2.5:4);
      const base=String(nm2).toLowerCase();
      /* same name may exist in several places (e.g. many "Long Lake") — key by name + coarse cell, and treat a
         nearby existing pin as THE anchor. FIRST SEEN WINS, FOREVER: a water label floats on the water body, so
         a few hundred metres of low-zoom quantization is invisible — total positional stability is what matters
         (#R67: the R66 "refinement" idea is deliberately gone; updating pins was itself visible movement). */
      /* (#R69) per-class floor keeps rare huge bodies visible early while bays/lagoons wait for closer zooms.
         (#R72) straits/lagoons raised 5.5→8.5 and bays →7.2: OpenMapTiles ships small 瀬戸/straits in mid-zoom
         tiles, so they were labelled at region-wide views ("近畿全体を写しているときに〇〇瀬戸が出てくる") —
         a strait label only makes sense once the strait itself is a meaningful share of the screen. */
      const clsMin=(cls==='ocean')?0:(cls==='sea')?3:(cls==='gulf')?4.5:(cls==='strait'||cls==='lagoon')?8.5:(cls==='bay')?7.2:6.5;
      const mzNew=Math.max(clsMin,zNow);
      let hit=null; for(let dx=-1;dx<=1&&!hit;dx++) for(let dy=-1;dy<=1&&!hit;dy++){ const k=base+'|'+cell+'|'+(Math.round(co[0]/cell)+dx)+'|'+(Math.round(co[1]/cell)+dy); if(idx.has(k)) hit=k; }
      if(hit){ const ex=idx.get(hit); const exz=(ex&&ex.properties&&typeof ex.properties.mz==='number')?ex.properties.mz:99;
        if(mzNew<exz-0.01){ ex.properties.mz=mzNew; _stabDirty[kind]=true; }   /* seen in a lower-zoom tile → may appear earlier; position untouched */
        continue; }
      const key=base+'|'+cell+'|'+Math.round(co[0]/cell)+'|'+Math.round(co[1]/cell);
      if(idx.size>9000) return;
      p.mz=mzNew;
      idx.set(key,{type:'Feature',id:idx.size,geometry:{type:'Point',coordinates:[co[0],co[1]]},properties:p});
      _stabDirty[kind]=true;
    }catch(_){} } }
  function harvestStableLabels(){
    let vis=false; try{ vis=GE().layers.get('ofm-water')&&GE().layers.getLayout('ofm-water','visibility')==='visible'; }catch(_){}
    if(!vis) return;
    /* (#R65) ALL water_name classes — seas, bays, straits, gulfs, lagoons AND lakes — are pinned dynamically.
       The curated gazetteer is only a multilingual override for the majors; every other water body on the
       planet gets its label from live tile data (no fixed list, no coverage ceiling). */
    _harvestOne('water','water_name',null,null);
    ['water'].forEach(kind=>{ if(!_stabDirty[kind]) return; _stabDirty[kind]=false;
      try{ GE().layers.setSourceData('stab-'+kind+'-src',{type:'FeatureCollection',features:Array.from(HOST._stabIdx[kind].values())}); }catch(_){} });
  }
  function applyLabelLang(){
    if(!GE().hasRenderer()) return;
    const mode=window.imLabelLang||'ui';
    let nameExpr;
    if(mode==='en') nameExpr=['coalesce',['get','name:en'],['get','name:latin'],['get','name_int'],['get','name']];
    else if(mode==='local') nameExpr=['get','name'];
    else if(HOST.lang==='jp') nameExpr=['coalesce',['get','name:ja'],['get','name']];
    else if(HOST.lang==='de') nameExpr=['coalesce',['get','name:de'],['get','name:en'],['get','name:latin'],['get','name']];   /* (#R32) German place labels */
    else if(HOST.lang==='ru') nameExpr=['coalesce',['get','name:ru'],['get','name:en'],['get','name:latin'],['get','name']];   /* (#R40) Russian place labels — RU previously fell into the English branch (item: 地名ラベルが英語のまま) */
    else if(HOST.lang==='es') nameExpr=['coalesce',['get','name:es'],['get','name:en'],['get','name:latin'],['get','name']];   /* (#R40) Spanish place labels */
    else nameExpr=['coalesce',['get','name:en'],['get','name:latin'],['get','name']];
    const sat=(HOST.mapType==='sat');
    /* Show vector labels in satellite mode (always — replaces ugly Esri) and on the map for jp/local. */
    const show = HOST.namesOn && (sat || HOST.mapLabelsViaVector());
    const isDark = !( (window.imMapColor==='light') || (window.imMapColor!=='dark' && ((HOST.userTheme==='light')||(HOST.userTheme==='auto'&&window.matchMedia('(prefers-color-scheme: light)').matches))) );
    /* (#R40) localize + show/hide the water (river/lake/sea) and mountain-peak labels with the same toggle.
       They keep their own (blue / stone) colors, so they're only given the language expression + visibility. */
    /* (#R41) water/terrain labels follow their OWN checkbox (geoLabelsOn), independent of place names. */
    const showGeo = HOST.geoLabelsOn && (sat || HOST.mapLabelsViaVector());
    try{ ['ofm-river','ofm-water','ofm-water2'].forEach(id=>{ if(!GE().layers.has(id)) return; GE().layers.setLayout(id,'visibility',showGeo?'visible':'none'); GE().layers.setLayout(id,'text-field',nameExpr); });
      if(GE().layers.has('ofm-peak')){ GE().layers.setLayout('ofm-peak','visibility',showGeo?'visible':'none'); GE().layers.setLayout('ofm-peak','text-field',['concat','▲ ',nameExpr]); }
      /* (#R62) fixed sea labels follow the same toggle; language from the gazetteer's own 5 name fields. */
      if(GE().layers.has('geo-sea')){ const gl=(mode==='en')?'en':(mode==='local')?'en':(({jp:'jp',de:'de',ru:'ru',es:'es'})[HOST.lang]||'en');
        GE().layers.setLayout('geo-sea','visibility',showGeo?'visible':'none'); GE().layers.setLayout('geo-sea','text-field',['get',gl]); }
      /* (#R64) populate the pinned lake/peak anchors immediately when the toggle turns on */
      if(showGeo) setTimeout(()=>{ try{ harvestStableLabels(); }catch(_){} },250); }catch(_){}
    /* (#R186) shop / facility names: their own toggle, the same language expression as every other
       OFM-sourced label, and light/dark text for the same reason the settlement names have it. The
       dot follows the same visibility so a name can never be left pointing at nothing. */
    try{ const showPoi = HOST.poiOn && (sat || HOST.mapLabelsViaVector());
      if(GE().layers.has('ofm-poi-dot')) GE().layers.setLayout('ofm-poi-dot','visibility',showPoi?'visible':'none');
      if(GE().layers.has('ofm-poi')){ GE().layers.setLayout('ofm-poi','visibility',showPoi?'visible':'none');
        GE().layers.setLayout('ofm-poi','text-field',nameExpr);
        const lightPoi = sat || isDark;
        GE().layers.setPaint('ofm-poi','text-color', lightPoi?'#ffd9a0':'#8a5300');
        GE().layers.setPaint('ofm-poi','text-halo-color', lightPoi?'rgba(0,0,0,0.85)':'rgba(255,255,255,0.92)');
      }
    }catch(_){}
    /* (#R103) ROOT FIX for "過去に戻っても国名が変わらない (変化なし)": while the time machine is on a past year the
       MODERN country labels must stay hidden (the era names come from imtb-lbl/lbl2). applyLabelLang runs on many
       events (styledata, cb-names, language change…) and was unconditionally RE-SHOWING ofm-country based on namesOn,
       overriding _applyBorders → the present-day country names kept reappearing under/over the era labels. Keep
       ofm-country hidden here whenever travelling. City/other place labels stay (they aren't country names). */
    const _travelingLbl=!!(window.IntMapTimeBorders&&window.IntMapTimeBorders.active&&window.IntMapTimeBorders.active());
    /* (#R198) ofm-admin1 joins this list, not a list of its own: a prefecture name IS a place name —
       it follows the same "Place names" switch, the same language expression and the same light/dark
       rule. It also hides while the time machine is on a past year, for the reason ofm-country does
       (#R103): today's prefectures over a 1900 map are the modern claim the era labels replace. */
    ['ofm-country','ofm-admin1','ofm-city','ofm-other'].forEach(id=>{ if(!GE().layers.has(id)) return;
      const _showThis=((id==='ofm-country'||id==='ofm-admin1')&&_travelingLbl)?false:show;
      GE().layers.setLayout(id,'visibility',_showThis?'visible':'none');
      GE().layers.setLayout(id,'text-field',nameExpr);
      /* dark map / satellite → light text; light map → dark text. The admin-1 tier is deliberately
         quieter than the settlement it contains — it names the ground, it is not the destination. */
      const lightText = sat || isDark;
      GE().layers.setPaint(id,'text-color', lightText?(id==='ofm-country'?'#eaf0ff':id==='ofm-admin1'?'#c6d3ea':'#ffffff'):(id==='ofm-admin1'?'#54607a':'#1b1b1f'));
      GE().layers.setPaint(id,'text-halo-color', lightText?'rgba(0,0,0,0.8)':'rgba(255,255,255,0.9)');
    });
  }
  function geoLabel(s){ return (HOST.lang==='jp' && HOST.GEO_LABEL_JP[s]) ? HOST.GEO_LABEL_JP[s] : s; }
  function buildGeoFC(data){
    const feats=[];
    (data.areas||[]).forEach(a=>{
      const ring=a.ring.slice(); const f=ring[0], l=ring[ring.length-1];
      if(f[0]!==l[0]||f[1]!==l[1]) ring.push(f);
      feats.push({type:'Feature',geometry:{type:'Polygon',coordinates:[ring]},properties:{}});
      if(a.label){ let sx=0,sy=0; a.ring.forEach(p=>{sx+=p[0];sy+=p[1];}); feats.push({type:'Feature',geometry:{type:'Point',coordinates:[sx/a.ring.length,sy/a.ring.length]},properties:{label:geoLabel(a.label)}}); }
    });
    (data.lines||[]).forEach(ln=>{
      const path=(data.smooth&&window.smoothGeoPath)?window.smoothGeoPath(ln.path,16):ln.path;
      feats.push({type:'Feature',geometry:{type:'LineString',coordinates:path},properties:{kind:ln.kind||''}});
      if(ln.label){ const m=ln.path[Math.floor(ln.path.length/2)]; feats.push({type:'Feature',geometry:{type:'Point',coordinates:m},properties:{label:geoLabel(ln.label),kind:ln.kind||''}}); }
    });
    (data.points||[]).forEach(pt=>{
      feats.push({type:'Feature',geometry:{type:'Point',coordinates:pt.at},properties:{label:geoLabel(pt.label),marker:1}});
    });
    return {type:'FeatureCollection',features:feats};
  }
  function ensureGeoLayers(){
    if(!GE().hasRenderer()) return;
    /* Style may not be ready yet (e.g. right after setProjection on load). Retry until it is. */
    if(!_imCanDraw()){ clearTimeout(ensureGeoLayers._t); ensureGeoLayers._t=setTimeout(ensureGeoLayers,160); return; }
    for(const[key,data] of Object.entries(HOST.geoLayersDB)){
      if(GE().layers.hasSource(key)) continue;
      try{ GE().layers.addSource(key,{type:'geojson',data:buildGeoFC(data)}); }catch(e){ continue; }
      try{
        if(data.areas&&data.areas.length){
          GE().layers.add({id:key+'-fill',type:'fill',source:key,filter:['==','$type','Polygon'],layout:{visibility:'none'},paint:{'fill-color':data.color,'fill-opacity':0.22}});
          /* soft, fuzzy zone edge — no hard outline (zones are conceptual, not borders) */
          GE().layers.add({id:key+'-edge',type:'line',source:key,filter:['==','$type','Polygon'],layout:{visibility:'none','line-cap':'round','line-join':'round'},paint:{'line-color':data.color,'line-width':16,'line-opacity':0.18,'line-blur':8}});
        }
        /* (#R8) High-quality pipeline network: two-tone OIL/GAS color, a crisp dark casing and
           zoom-scaled width = an "infrastructure map" look. Other geo lines (theory corridors) carry
           kind:'' so the match falls through to their single conceptual color — unchanged. */
        const _pipe=key==='pipelines';
        const _lineColor=_pipe?['match',['get','kind'],'oil','#d6451f','gas','#f4a72c',data.color]:data.color;
        GE().layers.add({id:key+'-glow',type:'line',source:key,filter:['==','$type','LineString'],layout:{visibility:'none','line-cap':'round','line-join':'round'},paint:{'line-color':_lineColor,'line-width':_pipe?['interpolate',['linear'],['zoom'],1,7,5,14]:10,'line-opacity':_pipe?0.22:0.18,'line-blur':4}});
        if(_pipe) GE().layers.add({id:key+'-casing',type:'line',source:key,filter:['==','$type','LineString'],layout:{visibility:'none','line-cap':'round','line-join':'round'},paint:{'line-color':'#1f0d05','line-width':['interpolate',['linear'],['zoom'],1,3,4,5.5,8,10],'line-opacity':0.6}});
        GE().layers.add({id:key+'-line',type:'line',source:key,filter:['==','$type','LineString'],layout:{visibility:'none','line-cap':'round','line-join':'round'},paint:{'line-color':_lineColor,'line-width':_pipe?['interpolate',['linear'],['zoom'],1,1.6,4,3.2,8,5.5]:3.5,'line-opacity':0.97}});
        GE().layers.add({id:key+'-pt',type:'circle',source:key,filter:['==','marker',1],layout:{visibility:'none'},paint:{'circle-radius':5,'circle-color':data.color,'circle-stroke-color':'#fff','circle-stroke-width':2,'circle-opacity':0.95}});
        GE().layers.add({id:key+'-label',type:'symbol',source:key,filter:['has','label'],layout:{visibility:'none','text-field':['get','label'],'text-size':LS.sub(0.9),'text-font':['literal',['Noto Sans Regular']],'text-offset':[0,1.1],'text-anchor':'top','text-allow-overlap':false,'symbol-placement':'point'},paint:{'text-color':data.color,'text-halo-color':'rgba(255,255,255,0.95)','text-halo-width':1.8}});
      }catch(e){ console.warn('geoLayer add fail',key,e); }
    }
    updateGeoLayers();
  }
  function updateGeoLayers(){
    if(!GE().hasRenderer())return;
    /* (#R13c) If the style is mid-load, a toggle-OFF would silently no-op and the layer would STAY on
       ("消したはずのレイヤーが残る"). Re-run once the style settles so the on/off state always lands. */
    if(!_imCanDraw()){ try{ GE().events.once('idle',()=>{ try{ updateGeoLayers(); }catch(_){} }); }catch(_){} return; }
    const isDark=document.documentElement.getAttribute('data-theme')==='dark';
    for(const key of Object.keys(HOST.geoLayersDB)){
      const cb=document.querySelector(`input[data-layer="${key}"]`);
      const vis=((cb&&cb.checked)||HOST.forceHoverLayers.has(key))?'visible':'none';
      ['-fill','-edge','-glow','-casing','-line','-pt','-label'].forEach(s=>{ if(GE().layers.has(key+s)) GE().layers.setLayout(key+s,'visibility',vis); });
      if(GE().layers.has(key+'-label')) GE().layers.setPaint(key+'-label','text-halo-color',isDark?'rgba(0,0,0,0.85)':'rgba(255,255,255,0.95)');
    }
  }
  return { applyLabelLang, buildGeoFC, ensureGeoLayers, ensurePlaceLabels, localizeGeoLabels, updateGeoLayers };
};
