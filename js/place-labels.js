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
  /* (#R27) the one-shot latch the idempotent ensurePlaceLabels() still writes (it is read by
     nothing now, and is kept because a value that stops being written is how a latch rots). */
  let _placeLabelsAdded=false;
  /* ⚠⚠ (#R225) THE GEO-LAYER FAMILY LIVED IN THIS FILE AND IT IS GONE.
     「大昔に捨てたはずの地政学レイヤーが勝手にオンになる。ふざけるな。」 — confirmed as 「レイヤー自体を削除してほしい」.
     `GEO_LABEL_FALLBACK`, `localizeGeoLabels`, `geoLabel`, `buildGeoFC`, `ensureGeoLayers` and
     `updateGeoLayers` existed only to draw and label the nine Strategic geography / Strategic
     networks layers, whose checkboxes were this app's only `.geo-layer-cb` elements and whose
     geometry was `geoLayersDB` in js/tables.js. All of it goes together: a family that keeps its
     machinery after its data is deleted is exactly how a retired feature comes back (#R220).
     What stays here is the PLACE labels — a different subject that merely shared the file. */
  /* ══ (#R211) THE TIER AND ITS COLOURS ARE FACTORY-SCOPE CONSTANTS, NOT LOCALS ═══════════════
     They were declared inside ensurePlaceLabels() and copied out to two `let`s for the light/dark
     repaint below to reach — an ORDERING HAZARD of exactly the kind this project keeps paying for.
     applyLabelLang() runs on styledata, on a language change and on the cb-poi toggle, and any of
     those can fire before the layers are built; at that moment the copies were still null and the
     repaint fell back to ONE FLAT COLOUR — the defect this round was told to fix, reintroduced by
     its own fix. They are pure data (no DOM, no renderer), so they live out here where both
     readers can always see them. Declarations only, so tests/r169-checks #4 still holds.
     ⚠ Caught by tests/r211.spec ③, which asserts the paint is an EXPRESSION and not a string.
   */
  const POI_TIER=['match',['get','class'],
    /* 1 — the things a person navigates by */
    ['hospital','university','college','school','railway','aerodrome','airport','bus_station','ferry_terminal','harbor',
     'museum','attraction','monument','castle','memorial','place_of_worship','town_hall','police','fire_station',
     /* ⚠ (#R211) `sports_centre` / `community_centre` ARE THE TILE SCHEMA'S OWN SPELLING, not prose.
        They are OpenMapTiles `class` values (from the OSM tag), so the British spelling is part of a
        data contract exactly like `["get","colour"]` in data/ocean-currents.json. The round's
        British→US sweep changed both and they were reverted; do not "fix" them. */
     'library','theatre','stadium','sports_centre','park','zoo','cemetery','embassy','prison'],1,
    /* 2 — everyday destinations
       ⚠ (#R211) 「工場・企業名が出ない」 — and the reason was that they were never NAMED here. An
       unlisted class falls through to tier 4, which the gate below did not admit until z17, so a
       factory or a company's premises simply was not there at any zoom a person actually browses
       at. The OpenMapTiles `poi` layer carries them under `industrial`, `commercial`, `factory`,
       `works`, `office`, `warehouse`, `construction` and `craft`, so they are listed — at tier 2,
       because a works or a headquarters is a landmark in the way a vending machine is not. */
    ['bank','post','pharmacy','doctors','dentist','lodging','cinema','art_gallery','garden','playground','marketplace',
     'grocery','supermarket','fuel','golf','swimming_pool','picnic_site','veterinary','childcare','community_centre',
     'bicycle_rental','car_rental','information','recycling','shelter',
     'industrial','commercial','factory','works','warehouse','office','company','construction','craft','mine','quarry','power','substation'],2,
    /* 3 — shops, food and drink, offices */
    ['shop','clothing_store','bakery','butcher','alcohol_shop','music','bicycle','car','hairdresser','laundry',
     /* ⚠ (#R211) 'office' MOVED UP to tier 2 (a company's premises is what 「企業名が出ない」 is about).
        It must appear in exactly ONE branch: a `match` with a repeated label fails MapLibre's style
        validation with «Branch labels must be unique», addLayer THROWS, and the whole label stack
        stops existing. tests/smoke caught it; tests/r211-checks now re-derives uniqueness. */
     'ice_cream','restaurant','cafe','fast_food','bar','beer','atm','parking','toilets','pitch',
     'basketball','running','yoga'],3,
    /* 4 — street furniture: real, useful up close, and never worth a landmark's place */
    4];
  /* ══ (#R211) NO MORE ALL-ON / ALL-OFF AT ONE ZOOM ═══════════════════════════════════════════
     「あるズームで問答無用に全表示・全非表示になるのをやめる」

     The old gate was a `step`: at z15 every tier-2 POI in view appeared at once, at z16 every
     tier-3, at z17 everything. Four zoom levels where the map changes wholesale — which is what
     the report describes, and it is a property of `step`, not of the data.

     Two changes make it gradual:
       · each feature carries a deterministic offset in [0, 0.9) derived from the tile's own
         `rank`, so the members of one tier no longer share a single threshold;
       · the ladder advances by about 0.6 per zoom instead of 1, so each step admits only a
         FRACTION of a tier and a tier takes roughly two zoom levels to finish arriving.
     Same features, same order (the sort key is untouched) — they simply come in gradually, and
     deterministically, so panning back does not reshuffle them.

     ⚠⚠ AND THE RIGHT-HAND SIDE MUST BE A `step`, NOT AN `interpolate`. MapLibre allows `zoom`
     inside a FILTER only in a `step`: a filter is evaluated once per integer zoom bucket, and an
     `interpolate` there fails style validation, which makes addLayer THROW — so the whole label
     stack failed to add. The first version of this used one, and tests/smoke's "no critical
     console.error from the app itself" caught it. Fractional stops would be pointless here for
     the same reason (the note above says so): the ladder is integer, and the smoothing comes from
     the per-feature offset instead. */
  const POI_JITTER=['*',0.9,['/',['%',['coalesce',['get','rank'],1],10],10]];
  const POI_GATE=['<=',['+',POI_TIER,POI_JITTER],['step',['zoom'],1.0,13,1.6,14,2.2,15,2.8,16,3.6,17,5]];
  const POI_FILTER=['all',['has','name'],POI_GATE];
  /* (#R211) 「全部同じ色をやめる」 — the tier is what the sort key, the gate and now the colour all
     read, so a landmark, an errand, a shop and a piece of street furniture are told apart at a
     glance instead of being one undifferentiated amber. */
  const POI_COL_DARK=['match',POI_TIER,1,'#ffd9a0',2,'#a9dcff',3,'#ffc0d8','#cfd4dc'];
  const POI_COL_LIGHT=['match',POI_TIER,1,'#8a5300',2,'#0b4f86',3,'#8e1f52','#4b5058'];
  /* ══ ⚠⚠ (#R252) A REGION'S NAME IS PAINTED BY THE LINE THAT DRAWS THE REGION ═══════════════════
     「地方行政区分（紫色の境界線をしてるやつ）の名前は、境界線と同じ地名ラベルの色にして。
       （大阪府やウィスコンシン州など）（世界共通）」
     The dashed province line (`ref-admin1` in js/app-body.js) has been ADMIN1_COLOR — one violet, the
     SAME one in light and in dark — since #R212; the name beside it was a near-white/near-black of its
     own, so the two read as unrelated. It is taken from js/border-style.js rather than re-typed, so the
     line and the label cannot drift apart ([[intmap-recurring-lessons]] G); the literal is only the
     fallback for the impossible case where that module has not evaluated (this file is a plain script,
     so it cannot `import`, and the value is read at CALL time, never captured at declaration time).
     ⚠ THE HALO GOES DARK ON BOTH BASEMAPS, and that is what makes the requested colour usable rather
     than a change of subject: #cba6f7 has ~0.72 luminance, so on the light basemap's white halo it
     would sit at about 1.4:1 against its own outline and vanish. Contrast here is the halo's job as
     much as the fill's (#R210's words), so the admin-1 tier — and only that tier — keeps a dark one. */
  const A1_TEXT=()=>{ try{ return window.IntMapBorderStyle.admin1 || '#cba6f7'; }catch(_){ return '#cba6f7'; } };

  /* (#R27) IDEMPOTENT now. The old `_placeLabelsAdded` early-return made this a one-shot: if the very
     first call added the layers a hair before the OFM source/style was truly ready, they were never
     re-added — which is exactly why labels were missing on first load but appeared after toggling
     names off/on ("デフォルト選択なのに地名ラベルが出ない、再チェックで出る"). The per-source / per-layer
     `if(!getLayer)` guards already make repeated calls safe, so we just re-attempt every time. */
  function ensurePlaceLabels(){
    if(!_imCanDraw()) return;
    /* (#R252) the ONE answer to «which `name:*` field is this label showing?», published before any
       label exists so js/map-ui.js's popup can ask it rather than keep a second list of languages
       ([[intmap-recurring-lessons]] B). It used to be set as a side effect of the sea gazetteer's
       first build, which is a fragile place for a fact two modules need. */
    try{ window.IntMapOsmNameKeys=OSM_NAME_KEYS; }catch(_){}
    /* ⚠ (#R64/#R67 — moved here #R252) THE WATER LABEL-ANCHOR INDEX AND ITS READ-ONLY DUMP.
       Lake/sea label geometry genuinely differs per tile zoom (OpenMapTiles stores LineString label
       lines), so each water name is pinned to its FIRST-SEEN coordinate in a stable geojson source —
       worldwide, dynamic, nothing hardcoded — and NEVER moves again. Peaks are exact point nodes and
       render straight from the tiles (#R67): no pinning, no refinement, nothing to hop.
       ⚠ It lives here rather than in js/app-body.js because this file is the index's only reader and
       that one has a line ceiling whose whole point is that a subject goes to its own file
       (tests/r168 #8, and [[intmap-recurring-lessons]] K — the ceiling comes DOWN, never up).
       ⚠ It is installed from inside a FUNCTION because the factory body may only DECLARE (tests/r169
       #4); `ensurePlaceLabels` is re-run on every styledata, and re-assigning is idempotent. */
    try{ window._imLabelStats=(dump)=>{ const o={water:HOST._stabIdx.water.size};
      if(dump==='peaks'){ try{ o.z=+GE().camera.getZoom().toFixed(2); o.c=[+GE().camera.getCenter().lng.toFixed(6),+GE().camera.getCenter().lat.toFixed(6)];
        o.rp=GE().coords.queryRenderedFeatures({layers:['ofm-peak']}).slice(0,12).map(f=>{ const c=f.geometry&&f.geometry.coordinates; let s=null; try{ s=c?GE().coords.project(c):null; }catch(_){}
          return {n:(f.properties||{}).name, c:c?c.map(x=>+x.toFixed(6)):null, px:s?[Math.round(s.x),Math.round(s.y)]:null}; }); }catch(e){ o.rpErr=String(e&&e.message||e); } }
      else if(dump){ o.samples=Array.from(HOST._stabIdx.water.values()).slice(0,10).map(f=>({n:(f.properties||{}).name,mz:(f.properties||{}).mz,cls:(f.properties||{}).class,c:f.geometry.coordinates.map(x=>+x.toFixed(5))})); }
      return o; }; }catch(_){}
    try{
      /* Use the TileJSON URL (not a hardcoded tile path) — OpenFreeMap serves versioned tiles, so
         the bare /planet/{z}/{x}/{y}.pbf path 404s at real zooms and labels never appear. */
      if(!GE().layers.hasSource('ofm')) GE().layers.addSource('ofm',{type:'vector',url:'https://tiles.openfreemap.org/planet',attribution:'© OpenFreeMap © OpenMapTiles © OSM'});
      const FONT=['Noto Sans Regular'];
      const before = GE().layers.has('grid-lines') ? 'grid-lines' : undefined;
      if(!GE().layers.has('ofm-country')) GE().layers.add({id:'ofm-country',type:'symbol',source:'ofm','source-layer':'place',maxzoom:7,filter:['==',['get','class'],'country'],layout:{visibility:'none','text-field':['get','name'],'text-font':FONT,'text-size':LS.place('country'),'text-letter-spacing':0.08,'text-max-width':8,'text-padding':6},paint:{'text-color':'#ffffff','text-halo-color':'rgba(0,0,0,0.9)','text-halo-width':1.7}}, before);   /* (#R210) 発色を濃く: pure white on a heavier halo */
      if(!GE().layers.has('ofm-city')) GE().layers.add({id:'ofm-city',type:'symbol',source:'ofm','source-layer':'place',minzoom:3,filter:['all',['in',['get','class'],['literal',['city','town']]]],layout:{visibility:'none','text-field':['get','name'],'text-font':FONT,'text-size':LS.place('city'),'text-max-width':7,'text-variable-anchor':['top','bottom','left','right'],'text-radial-offset':0.4,'text-justify':'auto','icon-optional':true},paint:{'text-color':'#ffffff','text-halo-color':'rgba(0,0,0,0.9)','text-halo-width':1.6}});   /* (#R210) 発色を濃く */
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
        paint:{'text-color':A1_TEXT(),'text-halo-color':'rgba(0,0,0,0.9)','text-halo-width':1.5}});   /* (#R252) the colour of the boundary it names — see A1_TEXT */
      /* ══ ⚠⚠⚠ (#R252) THE NAMES BELOW A MUNICIPALITY — AND A MISSPELLED CLASS ═══════════════════════
         「地名ラベルに、都道府県や市区町村までは出ても、それ未満の地名は出てこない。出るように。（世界共通）」

         ⚠ THE FILTER ASKED FOR A CLASS THAT DOES NOT EXIST. OpenMapTiles spells it `neighbourhood`;
         this layer has asked for `neighborhood` since it was written, so the branch has matched ZERO
         features for its whole life. This file already records the same fact about the POI classes
         («`sports_centre` IS THE TILE SCHEMA'S OWN SPELLING, not prose» — #R211) and the place layer
         was simply never re-read against it.
         ⚠ AND THREE MORE CLASSES WERE NEVER NAMED AT ALL. Measured on the live tiles
         (tiles.openfreemap.org/planet, 2026-08 build, one z14 tile each):
             Osaka  z14   neighbourhood 452,  suburb   5   (錦町, 淀川区)
             Tokyo  z14   neighbourhood 378,  quarter 63   (隼町, 佃)
             Berlin z14   neighbourhood  13,  quarter 14,  borough 2   (Barnimkiez, Bötzowkiez, Mitte)
             Paris  z14   neighbourhood   5,  quarter  8,  suburb 23   (Reuilly, Bercy)
             Madison z14  neighbourhood  17,  quarter  1   (Vilas, Downtown)
         So 町名・丁目・Kiez・Quartier — the whole tier the report is about — were absent everywhere,
         and it is one list for the planet, which is what 「世界共通」 asks for. `isolated_dwelling` and
         `farm` are the schema's two remaining sub-village classes and join for the same reason.

         ⚠ THE LADDER EXISTS SO THAT NOTHING DRAWN TODAY MOVES. The three classes this layer already
         admits are tier 1 and stay ungated from minzoom 7 — byte-for-byte their present behaviour. The
         new ones enter above them, and the tiles agree with the ladder rather than fight it: measured,
         `place` carries suburb from z12 and neighbourhood/quarter/borough only in the z14 tiles, so a
         stop below that would admit nothing anyway.
         ⚠ `symbol-sort-key` IS WHAT MAKES 452 LABELS IN ONE TILE READABLE. Collision resolves in favour
         of the coarser unit first and, inside a tier, of the tile's own `rank` — the same rule
         `ofm-poi` uses (#R187), so a ward keeps its label and the 丁目 beside it loses one. */
      const OTHER_TIER=['match',['get','class'],
        ['village','suburb','hamlet'],1,          /* what this layer has drawn since #R32 */
        ['borough','quarter'],2,                  /* the units between a ward and a street name */
        3];                                       /* neighbourhood, isolated_dwelling, farm */
      /* ⚠ INTEGER STOPS. `['zoom']` inside a FILTER is re-evaluated only at integer zooms — the same
         property that made #R198's admin-1 ladder wrong when it was written with fractions. */
      const OTHER_GATE=['<=',OTHER_TIER,['step',['zoom'],1, 13,2, 14,3]];
      if(!GE().layers.has('ofm-other')) GE().layers.add({id:'ofm-other',type:'symbol',source:'ofm','source-layer':'place',minzoom:7,
        filter:['all',['has','name'],['in',['get','class'],['literal',['village','suburb','hamlet','borough','quarter','neighbourhood','isolated_dwelling','farm']]],OTHER_GATE],
        layout:{visibility:'none','text-field':['get','name'],'text-font':FONT,'text-size':LS.place('other'),'text-max-width':7,'text-optional':true,
          'symbol-sort-key':['+',['*',OTHER_TIER,1000],['coalesce',['get','rank'],20]]},
        paint:{'text-color':'#f4f6fa','text-halo-color':'rgba(0,0,0,0.9)','text-halo-width':1.4}});   /* (#R210) 発色を濃く */
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
        GE().layers.addSource('geo-sea-src',{type:'geojson',data:_seaFC()});
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
      /* (#R211) minzoom 14 → 12: tier 1 is what a person navigates by (a hospital, a station, an
         airport), and it was not drawn at the zoom where you are looking for one. The gate above
         still admits only tier 1 down there, so this adds landmarks, not clutter. */
      if(!GE().layers.has('ofm-poi-dot')) GE().layers.add({id:'ofm-poi-dot',type:'circle',source:'ofm','source-layer':'poi',minzoom:12,
        filter:POI_FILTER,
        layout:{visibility:'none'},
        paint:{'circle-radius':['interpolate',['linear'],['zoom'],12,1.7,18,3.4],'circle-color':POI_COL_DARK,'circle-stroke-color':'rgba(0,0,0,0.55)','circle-stroke-width':0.9,
          /* and it fades in at its own minzoom instead of appearing all at once */
          'circle-opacity':['interpolate',['linear'],['zoom'],12,0,12.7,0.95]}});
      if(!GE().layers.has('ofm-poi')) GE().layers.add({id:'ofm-poi',type:'symbol',source:'ofm','source-layer':'poi',minzoom:12,
        filter:POI_FILTER,
        layout:{visibility:'none','text-field':['get','name'],'text-font':FONT,
          'text-size':LS.sub(0.86),
          'text-max-width':9,'text-optional':true,'text-padding':3,
          /* tier first, the tile's own sequence as the tie-break inside it */
          'symbol-sort-key':['+',['*',POI_TIER,1000],['coalesce',['get','rank'],1]],
          'text-variable-anchor':['top','bottom','left','right'],'text-radial-offset':0.55,'text-justify':'auto'},
        paint:{'text-color':POI_COL_DARK,'text-halo-color':'rgba(0,0,0,0.85)','text-halo-width':1.25,
          'text-opacity':['interpolate',['linear'],['zoom'],12,0,12.7,1]}});
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
  /* ══ ⚠⚠⚠ (#R242) THE PLACE-LABEL LANGUAGE WAS AN `else if` CHAIN OF FIVE ═══════════════════════
     「設定言語を変えれば地名ラベルもその言語になるはずだが、繁体、簡体、韓国語、フランス語では
       そうならない。」
     jp/de/ru/es each got a branch when they were added (#R32, #R40) and everything else fell through
     to the English `else` — so fr/ko/zh/zh-Hans, added in #R232 and #R239 with a locale file each,
     have been reading English place names ever since. It is [[intmap-recurring-lessons]] B again: a
     list of languages written down somewhere other than js/lang-registry.js.
     ⚠ SO IT IS A TABLE, KEYED BY THE APP'S OWN CODE, AND NOTHING ELSE NAMES A LANGUAGE. The value is
     the ordered list of OpenMapTiles `name:*` fields to try (OpenFreeMap serves the full
     OpenMapTiles schema); a `coalesce` over a key the tile does not carry simply moves on, so listing
     both `name:zh-Hant` and `name:zh` costs nothing and catches whichever the extract has. A code
     with no entry falls back to the international name, which is what the old `else` did — but now it
     is the DEFAULT of a lookup rather than the fate of every language after the fifth.
     ⚠ A NEW LANGUAGE ADDS ONE ROW HERE, and tests/r242 fails if the registry knows a code this table
     does not. */
  const OSM_LANG={ en:['name:en'], jp:['name:ja'], de:['name:de'], ru:['name:ru'], es:['name:es'],
                   fr:['name:fr'], ko:['name:ko'], zh:['name:zh-Hant','name:zh'], 'zh-hans':['name:zh-Hans','name:zh'] };
  function OSM_NAME_KEYS(code){
    const own=OSM_LANG[String(code||'').toLowerCase()]||[];
    /* Latin is the useful second try for a Latin-script language and a poor one for the others; the
       international name is the last resort for everybody, and `name` (local) is added by the caller. */
    return own.concat(['name:en','name:latin','name_int']);
  }

  /* (#R242) the curated sea/ocean rows, resolved for the CURRENT language through `pick()` — one
     answer per feature (`lbl`), so the style needs no language expression and a language past the
     five columns falls to its inline table rather than to English. `mode==='en'|'local'` are the
     reader's explicit 「英語で」/「現地表記で」 choices and stay English here (the gazetteer has no
     endonym column). */
  let _seaL=null;   /* ⚠ built on first use: tests/r169 #4 requires this file to only DECLARE while it runs */
  function _seaFC(mode){
    if(!_seaL){ _seaL=window.IntMapLang.pick(()=>HOST.lang); window.IntMapOsmNameKeys=OSM_NAME_KEYS; }
    const S=window.SEA_LABELS||[]; const raw=(mode==='en'||mode==='local');
    return {type:'FeatureCollection',features:S.map((r,i)=>({type:'Feature',id:i,geometry:{type:'Point',coordinates:[r[0],r[1]]},
      properties:{z:r[2],big:r[2]<=1?1:0,en:r[3],jp:r[4],de:r[5],ru:r[6],es:r[7],lbl:raw?r[3]:_seaL.arr([r[3],r[4],r[5],r[6],r[7]])}}))};
  }
  function applyLabelLang(){
    if(!GE().hasRenderer()) return;
    const mode=window.imLabelLang||'ui';
    let nameExpr;
    if(mode==='en') nameExpr=['coalesce',['get','name:en'],['get','name:latin'],['get','name_int'],['get','name']];
    else if(mode==='local') nameExpr=['get','name'];
    else nameExpr=['coalesce'].concat(OSM_NAME_KEYS(HOST.lang).map(k=>['get',k]),[['get','name']]);
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
      /* ⚠ (#R242) the curated sea gazetteer carries FIVE name columns and used to be read with a
         second five-language map (`{jp:'jp',de:'de',…}[HOST.lang]||'en'`) — the same defect as the
         `else if` chain above, one layer down. The row is now resolved through `pick()` itself, so a
         language past the fifth gets its inline-table entry keyed by the English name instead of
         English, and the feature carries the ANSWER (`lbl`) rather than five candidates. The source
         is rebuilt here because this function is what a language change calls. */
      if(GE().layers.has('geo-sea')){
        GE().layers.setLayout('geo-sea','visibility',showGeo?'visible':'none'); GE().layers.setLayout('geo-sea','text-field',['get','lbl']);
        try{ GE().layers.setSourceData('geo-sea-src',_seaFC(mode)); }catch(_){} }
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
        /* (#R211) per-tier, both ways round — the flat colour was the 「全部同じ色」 */
        GE().layers.setPaint('ofm-poi','text-color', lightPoi?POI_COL_DARK:POI_COL_LIGHT);
        if(GE().layers.has('ofm-poi-dot')) GE().layers.setPaint('ofm-poi-dot','circle-color', lightPoi?POI_COL_DARK:POI_COL_LIGHT);
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
      /* dark map / satellite → light text; light map → dark text. */
      const lightText = sat || isDark;
      /* (#R210) 「全地名ラベルの白と黒の発色を濃く」— the whites go to pure white and the blacks to pure
         black. The halo goes fully opaque with it: contrast here is the halo's job as much as the fill's.
         (#R252) …and the admin-1 tier is no longer a third grey: it is painted by the line that draws
         the region (A1_TEXT), the same colour on both basemaps, with the dark halo that colour needs. */
      GE().layers.setPaint(id,'text-color', (id==='ofm-admin1')?A1_TEXT():(lightText?'#ffffff':'#000000'));
      GE().layers.setPaint(id,'text-halo-color', (id==='ofm-admin1'||lightText)?'rgba(0,0,0,0.9)':'rgba(255,255,255,0.96)');
      GE().layers.setPaint(id,'text-halo-width', id==='ofm-country'?1.7:id==='ofm-city'?1.6:1.45);
    });
  }
  return { applyLabelLang, ensurePlaceLabels };
};
