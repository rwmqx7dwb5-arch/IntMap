/* ============================================================================
 *  IntMap · HOW CLOSE TO GO — window.IntMapPlaceFraming  (#R183)
 * ----------------------------------------------------------------------------
 *  「地名検索時のズームは、対象に応じてズームレベルを最適なものにするように。」
 *
 *  js/search-geocode.js's gotoPlace flew to zoom 9 for every result — roughly a 100 km window. Far
 *  too far out for a building, a station or a park; far too close for a country, an ocean or a
 *  desert. Zoom 9 is the right answer for almost nothing anyone searches for.
 *
 *  This module is PURE: it takes a geocoder result and returns a framing decision. It touches no
 *  map, no renderer, no HOST. That is not incidental — it is why it is a file of its own rather
 *  than a block inside js/search-geocode.js:
 *    · that factory's body may contain only DECLARATIONS (the property tests/r169-checks #4 pins,
 *      and the reason all eleven split factories can be constructed early), and publishing a global
 *      from inside it is a statement that RUNS;
 *    · its return list is the app-body shim contract, which pins exactly two names;
 *    · and being map-free is what lets the whole decision be tested without a browser — which is
 *      how three of the four traps below were actually found.
 *
 *  Everything here came from REAL geocoder responses, not from reasoning about the schema.
 *  Atlas reuses this table rather than inventing a second one.
 * ==========================================================================*/
(function(){
  /* ===== (#R183) HOW CLOSE TO GO ============================================================
     「地名検索時のズームは、対象に応じてズームレベルを最適なものにするように。」
     gotoPlace flew to zoom 9 for everything. z9 is roughly a 100 km window: it is far too far out
     for a building, a station or a park (which are then a pixel), and far too close for a country,
     an ocean or a desert (which are then off every edge). Zoom 9 is the right answer for almost
     nothing that anyone searches for.

     Two mechanisms, in order of preference, because one of them is a measurement and the other is
     a guess:

       1. THE REAL EXTENT, when the geocoder published one. Nominatim returns `boundingbox`
          [south, north, west, east] on every result and Photon returns `extent`
          [minLon, maxLat, maxLon, minLat] on most. Framing that box is not an estimate — it is the
          object's own footprint, so Vatican City and Russia both end up filling the screen.
       2. THE FEATURE CLASS, when it did not. Nominatim's class/type, Photon's osm_key/osm_value,
          Open-Meteo's GeoNames feature_code and our own gazetteer `kind` all name what the thing
          IS, and a continent is never a doorway. The table below is that mapping.

     TWO TRAPS, both real:
       · An antimeridian-crossing extent (Russia, Fiji, the USA with Alaska, New Zealand) comes back
         as a box spanning nearly the whole globe, and framing it zooms to the entire world. Any box
         wider than 180° of longitude — or taller than 170° — is therefore rejected and the class
         table answers instead. js/widgets.js has guarded its country flight the same way since #R34.
         ⚠ (#R426) That is a rule about a box a PROVIDER built with min/max, which genuinely cannot
         tell «spans the date line» from «spans the planet». A box that CAN say so does not trip it:
         js/country-extent.js writes a wrapping extent as an interval whose east edge runs past 180
         (Russia is 26.9 → 191.0, i.e. 164.1° wide), so `e - w` is the true span here and Russia is
         framed rather than refused. Only Antarctica, which really does encircle the pole, still
         arrives 360° wide and still takes the widened fallback below.
       · A bounding box is not always the useful frame. Nominatim gives a river or a motorway a box
         hundreds of km across whose centre is nowhere near the point that was clicked, so a LINEAR
         feature is framed by its class, not its extent. */
  const PLACE_ZOOM={
    /* continents / oceans / very large physical regions */
    continent:2.4, ocean:2.6, sea:4.2, archipelago:4.6, desert:4.6, plain:5.2,
    /* political */
    country:4.4, dependency:5.6, state:5.8, region:5.8, province:6.2, county:7.6, district:8.6,
    municipality:10.2, borough:11,
    /* settlements — the sizes people actually search for */
    megacity:9.6, city:10.6, town:12.2, village:13.4, hamlet:14.2, suburb:12.6, neighbourhood:13.8,
    /* physical features */
    island:8.4, lake:9.4, river:9, mountain:11, volcano:11, glacier:9, forest:9.4, bay:8.4, cape:11,
    /* (#R185) …and the ones a real answer landed on with NOTHING in this table to catch them, so
       they fell to the town-sized default: the Great Barrier Reef (natural/reef, 2,300 km) and the
       Grand Canyon (natural/valley, 446 km) were both framed at 12.2 — an 8 km window. Both are
       mapped in OSM as single NODES, so there is no extent to fall back on and the class IS the
       answer. Sizes within a class vary, so these are the middle of the class, not its largest
       member; a result that does publish an extent still overrides them. */
    reef:8.6, valley:9.6, plateau:7.5, peninsula:8.6, strait:8.4, ridge:10.4, cliff:12.6,
    beach:13.4, wetland:10.6, spring:15, cave:15, rock:15.4, reserve:9.2, natural:11,
    /* things you can stand in front of */
    airport:12.4, port:12.4, station:14.6, park:13, university:14, stadium:15, museum:15.6,
    landmark:15.2, building:16.6, address:17, poi:15.6
  };
  const DEFAULT_ZOOM=12.2;
  /* Linear/very-elongated features whose bounding box is a bad frame (see the trap note above). */
  const LINEAR=new Set(['river','stream','canal','coastline','motorway','trunk','primary','secondary',
    'railway','rail','waterway','highway','valley','ridge','border','boundary','cliff','strait']);

  /* Nominatim / Photon / Open-Meteo / gazetteer → one of the keys above. Anything unrecognised
     returns null and the caller falls back to DEFAULT_ZOOM, which is deliberately a town-sized
     window rather than the old country-sized one. */
  function placeClass(raw,localKind){
    const s=v=>String(v||'').toLowerCase();
    const k=s(raw&&(raw.osm_key||raw.class||raw.category)), v=s(raw&&(raw.osm_value||raw.type));
    const fc=s(raw&&raw.feature_code);
    /* Nominatim's `addresstype` — but ONLY for administrative areas and settlements, which is where
       it is the deciding field and nothing else is. MEASURED: Russia, Vatican City and Tokyo are ALL
       category=boundary / type=administrative — indistinguishable — while addresstype says country /
       country / province. Reading category alone put every administrative area on one zoom.
       For PHYSICAL features addresstype is the wrong field to trust: the Sahara comes back
       addresstype=region, which is an administrative word for a 4,800 km desert and framed it like a
       county. There category/type is exact (natural/desert), so that is read first below. */
    const at=(k==='boundary'||k==='place')?s(raw&&raw.addresstype):'';
    if(at&&at!=='yes'){
      if(at==='country') return 'country';
      if(at==='continent') return 'continent';
      if(at==='ocean') return 'ocean';
      if(at==='sea') return 'sea';
      if(at==='state') return 'state';
      if(at==='province'||at==='region') return (at==='province')?'province':'region';
      if(at==='county') return 'county';
      if(at==='city') return 'city';
      if(at==='town') return 'town';
      if(at==='village') return 'village';
      if(at==='hamlet') return 'hamlet';
      if(at==='suburb'||at==='quarter') return 'suburb';
      if(at==='neighbourhood'||at==='city_block') return 'neighbourhood';
      if(at==='municipality') return 'municipality';
      if(at==='borough') return 'borough';
      if(at==='island'||at==='islet') return 'island';
      if(at==='lake') return 'lake';
      if(at==='river'||at==='stream') return 'river';
      if(at==='peak'||at==='mountain') return 'mountain';
      if(at==='volcano') return 'volcano';
      if(at==='glacier') return 'glacier';
      if(at==='desert') return 'desert';
      if(at==='forest'||at==='wood') return 'forest';
      if(at==='bay') return 'bay';
      if(at==='aeroway'||at==='aerodrome') return 'airport';
      if(at==='railway') return 'station';
      if(at==='park') return 'park';
      if(at==='building'||at==='house') return 'building';
      if(at==='road'||at==='residential') return 'address';
      if(at==='postcode') return 'district';
      /* addresstype often just echoes the OSM key (man_made, leisure, amenity, tourism…) — fall
         through to the category/type reading below rather than inventing a meaning for it. */
    }
    /* GeoNames feature codes (Open-Meteo geocoding) — the exact codes, not a prefix guess. */
    if(fc){
      if(fc==='pcli'||fc==='pcls'||fc==='pcld'||fc==='ters') return 'country';
      if(fc==='cont') return 'continent';
      if(fc==='ocn') return 'ocean';
      if(fc==='adm1') return 'state';
      if(fc==='adm2') return 'county';
      if(fc==='adm3'||fc==='adm4'||fc==='adm5') return 'district';
      if(fc==='pplc') return 'city';
      if(fc==='ppla') return 'city';
      if(fc==='ppla2'||fc==='ppla3'||fc==='ppla4') return 'town';
      if(fc==='ppl'||fc==='ppls') return 'town';
      if(fc==='pplx') return 'suburb';
      if(fc==='isl') return 'island';
      if(fc==='mt'||fc==='pk') return 'mountain';
      if(fc==='lk') return 'lake';
      if(fc==='stm') return 'river';
      if(fc==='airp') return 'airport';
      if(fc==='rstn') return 'station';
    }
    /* OSM class/type, which is what Nominatim and Photon speak. */
    if(k==='place'){
      if(v==='continent') return 'continent';
      if(v==='country') return 'country';
      if(v==='state'||v==='province') return 'state';
      if(v==='region') return 'region';
      if(v==='county') return 'county';
      if(v==='city') return 'city';
      if(v==='town') return 'town';
      if(v==='village') return 'village';
      if(v==='hamlet'||v==='isolated_dwelling') return 'hamlet';
      if(v==='suburb'||v==='quarter'||v==='city_block') return 'suburb';
      if(v==='neighbourhood') return 'neighbourhood';
      if(v==='island'||v==='islet') return 'island';
      if(v==='archipelago') return 'archipelago';
      if(v==='sea') return 'sea';
      if(v==='ocean') return 'ocean';
      if(v==='house'||v==='houses') return 'address';
      return 'town';
    }
    /* (#R185) protected land — a national park, a nature reserve, a wilderness area. Checked
       BEFORE the generic boundary line below, which answers 'region' for everything. */
    if(k==='boundary'&&(v==='protected_area'||v==='national_park'||v==='aboriginal_lands')) return 'reserve';
    if(k==='leisure'&&v==='nature_reserve') return 'reserve';
    if(k==='boundary') return 'region';
    if(k==='natural'){
      if(v==='peak'||v==='saddle'||v==='hill') return 'mountain';
      if(v==='volcano') return 'volcano';
      if(v==='water'||v==='bay') return (v==='bay')?'bay':'lake';
      if(v==='glacier') return 'glacier';
      if(v==='wood'||v==='forest'||v==='scrub') return 'forest';
      if(v==='desert'||v==='sand'||v==='dune') return 'desert';
      if(v==='cape') return 'cape';
      if(v==='coastline') return 'river';
      /* (#R185) measured gaps — every one of these came back from a real query */
      if(v==='reef'||v==='shoal') return 'reef';
      if(v==='valley'||v==='gorge'||v==='canyon') return 'valley';
      if(v==='plateau') return 'plateau';
      if(v==='peninsula'||v==='isthmus') return 'peninsula';
      if(v==='strait'||v==='channel') return 'strait';
      if(v==='ridge'||v==='arete'||v==='esker') return 'ridge';
      if(v==='cliff') return 'cliff';
      if(v==='beach'||v==='shingle') return 'beach';
      if(v==='wetland'||v==='marsh'||v==='swamp'||v==='grassland'||v==='heath'||v==='moor') return 'wetland';
      if(v==='spring'||v==='hot_spring'||v==='geyser') return 'spring';
      if(v==='cave_entrance'||v==='sinkhole') return 'cave';
      if(v==='rock'||v==='stone'||v==='tree'||v==='boulder') return 'rock';
      /* a physical feature this table does not name is still a physical feature, and the
         town-sized default is the wrong order of magnitude for one */
      return 'natural';
    }

    /* MEASURED: Lake Baikal comes back as category `water`, which is its own top-level key and was
       not in this table at all — the lake fell through to the default town-sized zoom. */
    if(k==='water'){
      if(v==='lake'||v==='reservoir'||v==='pond'||v==='lagoon') return 'lake';
      if(v==='river'||v==='stream'||v==='canal') return 'river';
      if(v==='bay'||v==='strait') return 'bay';
      if(v==='ocean') return 'ocean';
      if(v==='sea') return 'sea';
      return 'lake';
    }
    /* …and the Eiffel Tower is category `man_made`, likewise absent. */
    if(k==='man_made'){
      if(v==='tower'||v==='lighthouse'||v==='obelisk'||v==='monument'||v==='bridge') return 'landmark';
      if(v==='pier'||v==='breakwater') return 'port';
      return 'landmark';
    }
    if(k==='waterway') return 'river';
    if(k==='aeroway') return 'airport';
    if(k==='railway') return 'station';
    if(k==='amenity'){
      if(v==='university'||v==='college') return 'university';
      if(v==='museum') return 'museum';
      return 'poi';
    }
    if(k==='leisure') return (v==='stadium'||v==='sports_centre')?'stadium':'park';
    if(k==='tourism') return (v==='museum')?'museum':'landmark';
    if(k==='historic') return 'landmark';
    if(k==='building') return 'building';
    if(k==='highway') return 'address';
    if(k==='landuse') return 'district';
    if(k==='shop'||k==='office'||k==='craft') return 'poi';
    /* our own local matches (localFuzzyPlaces `kind`) and the gazetteer's own type names */
    const lk=s(localKind);
    if(lk){
      if(lk==='country') return 'country';
      if(lk==='capital') return 'city';
      if(PLACE_ZOOM[lk]!=null) return lk;
      if(lk==='cities'||lk==='city') return 'city';
      if(lk==='mountains'||lk==='peaks') return 'mountain';
      if(lk==='rivers') return 'river';
      if(lk==='lakes') return 'lake';
      if(lk==='deserts') return 'desert';
      if(lk==='islands') return 'island';
      if(lk==='seas'||lk==='oceans') return 'ocean';
      if(lk==='airports') return 'airport';
      if(lk==='landmarks') return 'landmark';
      if(lk==='regions') return 'region';
    }
    return null;
  }
  /* The extent the provider published, as [[w,s],[e,n]] — or null when there is none, when it is
     unusable (antimeridian / degenerate), or when the feature is linear. */
  const STUB_DEG=0.0005;   /* see NODE STUB below — the synthetic box is 0.0001°, this is 5× that */
  const OUTLIER_DEG=1;     /* ~110 km — see the OUTLYING TERRITORY note below */
  function placeExtent(raw,cls){
    if(!raw) return null;
    if(cls&&LINEAR.has(cls)) return null;
    let w,s,e,n;
    const bb=raw.boundingbox;                                   /* Nominatim: [S, N, W, E] as strings */
    if(Array.isArray(bb)&&bb.length===4){ s=+bb[0]; n=+bb[1]; w=+bb[2]; e=+bb[3]; }
    else if(Array.isArray(raw.extent)&&raw.extent.length===4){  /* Photon: [minLon, maxLat, maxLon, minLat] */
      w=+raw.extent[0]; n=+raw.extent[1]; e=+raw.extent[2]; s=+raw.extent[3];
    } else return null;
    if(![w,s,e,n].every(v=>isFinite(v))) return null;
    if(n<=s||e<=w) return null;                                  /* degenerate, or wrapped the wrong way */
    if((e-w)>180||(n-s)>170) return {huge:true};                 /* antimeridian / whole-globe box — see below */
    /* NODE STUB. A feature mapped in OSM as a single NODE has no footprint, and Nominatim answers
       with a synthetic ±0.0001° box around the point — about 11 m. MEASURED: Mount Fuji, the Sahara,
       the Pacific Ocean and a Shibuya subway entrance are all nodes and all came back 0.0001×0.0001.
       Framing that box put the SAHARA at zoom 16.5, looking at eleven metres of sand. A box this
       small is not a measurement, so the class decides instead. (Africa is also a node but carries a
       deliberate 50°×50° box, which survives this test — the rule keys on the stub, not on node-ness.) */
    if((e-w)<STUB_DEG&&(n-s)<STUB_DEG) return null;
    /* OUTLYING TERRITORY. An administrative extent includes everything the unit owns, however far
       away: Tokyo Metropolis reaches 1,000 km south to Ogasawara, France holds French Guiana,
       Ecuador holds the Galápagos. MEASURED: framing Tokyo's real 18.4°×15.7° extent centres the map
       in open ocean south of Honshu with the city itself a speck at the top — correct as geometry,
       useless as an answer to "Tokyo".
       The tell is that the geocoder's own point sits nowhere near the middle of the box. When the
       point falls outside the middle 60% of the extent in either axis, the extent is being driven by
       outliers and the class zoom at the point is the better frame. A compact place (Japan, Lake
       Baikal, Central Park) has its point near the centre and keeps its extent. */
    /* (#R185) …AND THE TELL IS A DISTANCE, NOT A FRACTION. The rule above rejected Monaco: its box
       is 0.124° x 0.235° and the label point sits near the north edge (fy = 0.92), so a 2 km² state
       fell back to the plain `country` zoom of 4.4 — the entire Mediterranean, to answer "Monaco".
       Vatican City, San Marino and Gibraltar fail the same way, and so does any small place whose
       label is not in the middle of it.
       What the rule is actually looking for is an OUTLYING TERRITORY, and an outlier is what makes a
       box far bigger than the thing it is meant to frame: Tokyo's point is 700 km from the centre of
       its extent, France's 2,000 km. Monaco's is 11 km — which is not an outlier, it is just where
       the label goes. So the fraction has to be joined by an absolute offset: about 1° (110 km) is
       larger than any place that could be framed by its own box at street scale and far smaller than
       every outlier measured. Tokyo (6.3°) and France (20°) are still rejected; Monaco and Vatican
       City keep their footprints. */
    /* ⚠⚠⚠ (#R426) …AND A BOX THAT HAS NO OUTLIERS MUST NOT BE JUDGED BY THIS TEST. The rule
       above is a GUESS about a box whose provenance is unknown — it infers «this extent is
       being driven by outlying territory» from the label sitting off-centre, because a
       geocoder hands over one number and no way to ask what is in it. Our own country rows
       are not that: js/country-extent.js decides which parts of the feature ARE the country
       and publishes only those, so `raw.homeExtent` says the trimming already happened and
       an off-centre label is now just where the label goes.
       MEASURED, with the box fixed at the source and this test still applied to it: Norway
       (26.4° × 13.2°, mainland), Denmark (7.1° × 3.2°, all fifteen parts including Bornholm),
       Russia, Kiribati, Croatia, Vietnam, Indonesia, the Bahamas and eleven more were STILL
       refused and STILL fell to the flat `country` zoom of 4.4 — twenty rows framed by a
       guess while holding their own measured footprint. Denmark is the clearest of them: the
       whole country is in the box, and the label is 13 % across it because Jutland is. */
    const plng=+(raw.lon!=null?raw.lon:raw.lng), plat=+raw.lat;
    if(!raw.homeExtent&&isFinite(plng)&&isFinite(plat)){
      const cx=(w+e)/2, cy=(s+n)/2;
      const fx=(plng-w)/(e-w), fy=(plat-s)/(n-s);
      const offX=Math.abs(plng-cx), offY=Math.abs(plat-cy);
      if(((fx<0.2||fx>0.8)&&offX>OUTLIER_DEG)||((fy<0.2||fy>0.8)&&offY>OUTLIER_DEG)) return null;
    }
    return [[w,s],[e,n]];
  }
  /* The whole decision, in one place so a test can ask it without a map. */
  function framingFor(raw,localKind){
    const cls=placeClass(raw,localKind);
    const ext=placeExtent(raw,cls);
    let zoom=(cls&&PLACE_ZOOM[cls]!=null)?PLACE_ZOOM[cls]:DEFAULT_ZOOM;
    /* A box that had to be rejected for spanning the globe is itself evidence: only a feature that
       wraps the antimeridian does that, and every one of them (Russia, the USA with Alaska, Fiji,
       Kiribati, New Zealand) is enormous. Russia at the plain country zoom of 4.4 lands inside
       Siberia with the country running off all four edges, so an unusable box widens the fallback
       rather than being silently ignored. */
    if(ext&&ext.huge) return { cls:cls||null, bounds:null, zoom:Math.min(zoom,3.2), huge:true };
    return { cls:cls||null, bounds:ext, zoom };
  }
  window.IntMapPlaceFraming={ framingFor, placeClass, placeExtent,
    zoomTable:()=>Object.assign({},PLACE_ZOOM), defaultZoom:()=>DEFAULT_ZOOM };
})();
