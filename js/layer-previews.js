/* ============================================================================
 *  IntMap · Layer preview thumbnails — IntMapLayerPreviews  (#R162)
 * ----------------------------------------------------------------------------
 *  Body moved byte-identically out of index.html's DOMContentLoaded closure. The three
 *  values it used to close over are now explicit FACTORY PARAMETERS — countryStats and
 *  countryStats is never reassigned (mutated in place) and loadCountryData is a function
 *  declaration, so passing them by value is exactly what the closure saw.
 *      window.IntMapLayerPreviews=window.IntMapModules.layerPreviews(countryStats,loadCountryData);
 * ========================================================================== */
window.IntMapModules=window.IntMapModules||{};
window.IntMapModules.layerPreviews=function(countryStats,loadCountryData){
    /* (#R71) quality pass ("画像の縦横比が引き延ばされ…クオリティも低い"): canvases are now WEB-MERCATOR
       (±72.5° ≈ exactly 2:1 — country shapes look like the basemap, no vertical stretch) and rendered at
       2× device pixels (crisp on the 3-column tiles). The tile CSS aspect-ratio matches 240/121 so nothing
       is ever distorted; raster example tiles are center-cropped by cover, never stretched. */
    const W=240,H=121, cache={};
    /* (#R72) DISTINCTIVE previews ("ほぼすべてのタイルの画像が世界全体を写しており、画一的で面白くない…どんな
       レイヤーなのかわかりにくい"): each raster example now shows the REGION where that phenomenon is most
       recognisable (monsoon rain over SE Asia, city lights over Japan, dust off the Sahara…) instead of the
       same world tile 30 times. tXY computes the slippy-tile that contains a lon/lat at zoom z. */
    const tXY=(z,lon,lat)=>{ const n=Math.pow(2,z); const x=Math.max(0,Math.min(n-1,Math.floor((lon+180)/360*n)));
      const f=lat*Math.PI/180; const y=Math.max(0,Math.min(n-1,Math.floor((1-Math.log(Math.tan(f)+1/Math.cos(f))/Math.PI)/2*n)));
      return {x,y}; };
    /* ══ ⚠ (#R254) A GIBS LAYER WITHOUT A TIME DIMENSION 403s WHEN YOU GIVE IT A DATE ═══════════════
       「人口密度レイヤのプレビュー画像が消えている。」 MEASURED against every URL in this table (43
       entries, one request each): exactly ONE fails, and it is the reported one —
       `dl-popgrid` → **403**. GPW is a STATIC product: its WMTSCapabilities entry publishes
       `…/GPW_Population_Density_2020/default/{TileMatrixSet}/…` with no `{Time}` segment, so the
       `2020-01-01` this table injected made the path one segment too long. Verified both ways:
       with the date 403 (919 B of HTML), without it 200 (18,001 B of PNG).
       ⚠ THE LAYER ITSELF WAS ALWAYS RIGHT — js/data-layers.js draws it through `gibsStatic(…)`,
       which omits the date. Only the PREVIEW had a second, hand-written copy of the URL shape, and
       that is the whole defect: `date` is now optional here too, so a static product is written the
       way the layer writes it. */
    const G=(id,lvl,date,ext,z,lon,lat)=>{ const zz=(z!=null)?z:2; const p=(z!=null)?tXY(z,lon,lat):{x:1,y:1};
      return 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/'+id+'/default/'+(date?(date+'/'):'')+'GoogleMapsCompatible_Level'+lvl+'/'+zz+'/'+p.y+'/'+p.x+'.'+(ext||'png'); };
    /* ---- 1) real example tiles, one per raster layer (same endpoints the layers render from) ---- */
    const _t45=tXY(4,8.5,50.2), _t46=tXY(6,8.2,46.4);
    /* (#R78e) REAL cartography for the vector-overlay layers ("まだクソみたいな手抜きレイヤー例画像が多すぎる"):
       borders / place names / admin lines / country outlines are basemap features — show an actual CARTO tile of
       a recognisable region instead of a hand-drawn sketch. @2x for crispness; distinct regions so no two look alike. */
    const CT=(style,z,lon,lat)=>{ const t=tXY(z,lon,lat); return 'https://a.basemaps.cartocdn.com/'+style+'/'+z+'/'+t.x+'/'+t.y+'@2x.png'; };
    const IMG={
      'dl-climate':'preview_koppen_eu.png',   /* (#R79f) Europe crop of the Köppen map (per request — "ヨーロッパを写したスクショに") */
      /* (#R268) 「年降水量レイヤーは…サムネイル画像（実スクリーンショット）をつけるように。」 — this layer
         had NO row here at all, so its tile fell back to the generic swatch. The file is a real
         capture of this app with the layer on, over monsoon Asia where the field is unmistakable;
         `node scripts/shot-layer-preview.mjs preview_precip.png` is how it is remade. */
      'dl-annprecip':'preview_precip.png',
      'dl-ec-temp':'preview_temperature.png',
      'dl-precip':G('IMERG_Precipitation_Rate',6,'2025-06-01T12:00:00Z','png',3,100,14),      /* SE-Asia monsoon */
      'dl-sst':'preview_sst.png',
      'dl-snow':G('MODIS_Terra_NDSI_Snow_Cover',8,'2024-01-15','png',4,10,46.4),              /* Alps in January */
      'dl-aod':G('MODIS_Combined_Value_Added_AOD',6,'2024-07-04','png',3,80,25),               /* N-India haze */
      'dl-nightsat':'preview_nightlights.png',   /* (#R79g) real VIIRS Black Marble of the Nile Delta + Israel (per request) */
      'dl-popgrid':G('GPW_Population_Density_2020',7,'','png',4,80,24),                       /* Ganges plain — STATIC product, no date segment (#R254) */
      'dl-relief':'preview_elevation.png',
      'dl-hillshade':'https://services.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/6/'+_t46.y+'/'+_t46.x,   /* Swiss Alps */
      'gx-gxndvi':'preview_ndvi.png',
      'gx-gxseaice':'preview_seaice.png',
      'gx-gxsstanom':'preview_sstanom.png',
      'gx-gxrelief':'preview_relief_aster.png',
      'gx-gxsoil':G('AMSRU2_Soil_Moisture_SCA_Day',6,'2025-06-15','png',3,90,24),              /* Bengal delta */
      'eco-dl-worldcover':'preview_landcover.png',
      /* (#R79i) ACTUAL IntMap screenshots ("IntMapやぞ…スクショ取るだけで済むこと") — captured from the live map
         canvas (render-tick capture) with each layer enabled, self-hosted. No external tiles, no synthetic art. */
      'eco-dl-ecoregions':'preview_ecoregions.png',   /* RESOLVE ecoregions on the real map (Africa-centred) */
      'eco-dl-plates':'preview_plates.png',           /* tectonic plates on the real map */
      'dl-wind':'preview_wind.png',                   /* wind speed field + animated streamlines, real capture */
      'beta-dl-ukrfront':'preview_ukraine.png',       /* (#R79g) real basemap + live DeepState frontline (green = UA gains, red = occupied) */
      'cb-rail2':'https://a.tiles.openrailwaymap.org/standard/'+4+'/'+_t45.x+'/'+_t45.y+'.png',   /* German rail web */
      'ox-oxrail':'https://a.tiles.openrailwaymap.org/standard/'+4+'/'+_t45.x+'/'+_t45.y+'.png',
      'beta-dl-rail':'https://a.tiles.openrailwaymap.org/standard/'+4+'/'+_t45.x+'/'+_t45.y+'.png',
      'ox-oxsea':'https://tiles.openseamap.org/seamark/7/63/42.png',   /* Dover Strait — dense real seamarks */
      /* (#R79i) actual IntMap contour-line render captured over the Alps (Zermatt/Matterhorn) */
      'dl-contours':'preview_contours.png',
      /* (#R74) ECMWF SST preview = the real GHRSST product (equatorial-Pacific crop, distinct from dl-sst's Gulf Stream) */
      'dl-ec-sst':G('GHRSST_L4_MUR_Sea_Surface_Temperature',7,'2024-07-04','png',3,-150,0),
      /* (#R84) dl-ec-cloud now renders as a REAL basemap + MODIS-cloud composite (see REAL['dl-ec-cloud']) */
      /* (#R78e) real CARTO basemap cartography for the vector-overlay layers (each a distinct, recognisable region) */
      'cb-names':'preview_basemap.png',        /* (#R79i) actual IntMap base map & labels captured over Central Europe (names + borders + roads) */
      'cb-geolabels':CT('rastertiles/voyager',6,23.0,37.8),        /* Aegean — sea & island labels */
      'cb-borders':CT('light_all',6,8.2,48.9),                     /* Alpine borders — DE/FR/CH/AT crisp */
      'cb-coast':CT('light_all',6,138.5,35.0),                     /* (#R289) Izu/Suruga — coast and lakes together */
      'cb-admin1':CT('light_all',6,-96.0,39.5),                    /* US Great Plains — state lines */
      'cb-countries':CT('rastertiles/voyager',5,105.0,14.0),       /* mainland SE Asia — distinct country shapes */
      /* == (#R309) ELEVEN MORE LAYERS THAT HAD NO PHOTOGRAPH AT ALL ============================
         「『レイヤーサムネイル』フォルダに、各レイヤー用のサムネイル画像を入れておいたので、それを
           すべて使って実際にレイヤータイルにいれてください。」 Twenty-three captures were supplied,
         one per layer, named by that layer's own English label. Eight of them REPLACED an upstream
         tile above (a NASA / Terrascope tile is a picture of the DATA, not of this app), four
         overwrote the `preview_*.png` an earlier round captured, and these eleven are rows that had
         no entry in ANY table — their tile fell through `into()` to the labelled gradient.
         Same shape as #R79i / #R268: real captures of THIS map with THAT layer on, self-hosted,
         480x242 — the tile's own 240:121, so `cover` crops nothing. */
      'wp-dl-alerts':'preview_alerts.png',
      'wp-dl-crops':'preview_crops.png',
      'wp-dl-currents':'preview_currents.png',
      'bx-eq':'preview_earthquakes.png',
      'dl-eez':'preview_eez.png',
      'dl-eu':'preview_eu.png',
      'dl-nato':'preview_nato.png',
      'dl-sealevel':'preview_sealevel.png',
      'dl-subcables':'preview_subcables.png',
      'dl-uselect':'preview_uselect.png',
      'beta-dl-volc2':'preview_volcanoes.png'
    };
    let _radar=null;
    function radarURL(){ if(_radar!==null) return Promise.resolve(_radar); return fetch('https://api.rainviewer.com/public/weather-maps.json').then(r=>r.json()).then(j=>{ const p=j&&j.radar&&j.radar.past&&j.radar.past.length?j.radar.past[j.radar.past.length-1].path:null; const t4=tXY(4,8,50); _radar=p?((j.host||'https://tilecache.rainviewer.com')+p+'/256/4/'+t4.x+'/'+t4.y+'/2/1_1.png'):''; return _radar; }).catch(()=>{ _radar=''; return ''; }); }
    /* ---- canvas helpers (web-mercator mini world, 2× backing store) ---- */
    const _MY=1.5850;   /* mercator y at ±72.5° */
    /* (#R72) optional VIEW crop for canvas painters — setView([W,S,E,N]) makes X/Y project that region instead
       of the whole world (crops stay true web-mercator); setView(null) restores the world. */
    const _mercY=lat=>{ const f=Math.max(-85,Math.min(85,lat))*Math.PI/180; return Math.log(Math.tan(Math.PI/4+f/2)); };
    let _V=null;
    /* (#R83) ASPECT-CORRECT crop ("縦横比のおかしくない…適切なものにしろ"): the old setView mapped ANY [W,S,E,N]
       box onto the 2:1 canvas, so a tall/narrow region (EU members, Volcanoes' NW-Pacific box) came out
       horizontally stretched. Now the box is EXPANDED to the canvas's true web-mercator aspect (W/H) before
       projecting, so country shapes stay undistorted — exactly like the real basemap. */
    function setView(b){ if(!b){ _V=null; return; }
      let x0=b[0], x1=b[2], t=_mercY(b[3]), bt=_mercY(b[1]);
      const AR=W/H, xr=(x1-x0)*Math.PI/180, yr=(t-bt);
      if(xr>0&&yr>0){ if(xr/yr<AR){ const addDeg=((yr*AR-xr)*180/Math.PI)/2; x0-=addDeg; x1+=addDeg; }
        else { const add=(xr/AR-yr)/2; t+=add; bt-=add; } }
      _V={x0,x1,t,b:bt}; }
    const X=lng=>{ if(_V) return (lng-_V.x0)/((_V.x1-_V.x0)||1e-9)*W; return (lng+180)/360*W; };
    const Y=lat=>{ if(_V){ return (_V.t-_mercY(lat))/((_V.t-_V.b)||1e-9)*H; }
      const f=Math.max(-72.5,Math.min(72.5,lat))*Math.PI/180; const y=Math.log(Math.tan(Math.PI/4+f/2)); return (_MY-y)/(2*_MY)*H; };
    function cnv(){ const c=document.createElement('canvas'); c.width=W*2; c.height=H*2; c.getContext('2d').scale(2,2); return c; }
    function ocean(ctx,col){ ctx.fillStyle=col||'#0e1a2b'; ctx.fillRect(0,0,W,H); }
    function drawLand(ctx,colorOf,stroke){ const cg=window.countryGeo; if(!cg||!cg.features) return false;
      cg.features.forEach(f=>{ const gm=f.geometry; if(!gm) return; const col=colorOf?colorOf(String(f.id),f):'#22344c';
        if(col===null) return; ctx.fillStyle=col;
        const draw=poly=>{ const ring=poly&&poly[0]; if(!ring||ring.length<3) return; ctx.beginPath();
          for(let i=0;i<ring.length;i++){ const x=X(ring[i][0]),y=Y(ring[i][1]); if(i)ctx.lineTo(x,y); else ctx.moveTo(x,y); } ctx.closePath(); ctx.fill();
          if(stroke){ ctx.strokeStyle=stroke; ctx.lineWidth=0.5; ctx.stroke(); } };
        if(gm.type==='Polygon') draw(gm.coordinates); else if(gm.type==='MultiPolygon') gm.coordinates.forEach(draw); });
      return true; }
    /* ══ ⚠⚠ (#R270) THE TILE PAINTED A STAIRCASE FOR A LAYER THAT PAINTS A GRADIENT ═══════════════
       「GDP成長率レイヤーの色は段彩ではなく、他レイヤーと同じようにグラデーションに。」 — the layers
       themselves paint `['interpolate',['linear'],…]` (js/wb-layers.js), and this returned the last
       stop AT OR BELOW the value, i.e. hard bands. A thumbnail is a picture of the layer; it has to
       be the same function. Linear between the two stops the value falls between, clamped at both
       ends — the same arithmetic maplibre's `interpolate` does. */
    function _hx(h){ return [parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)]; }
    function rampColor(ramp,v){ if(v==null||isNaN(v)) return '#2a3950';
      if(v<=ramp[0]) return ramp[1];
      const last=ramp.length-2; if(v>=ramp[last]) return ramp[last+1];
      for(let i=0;i<last;i+=2){ const a=ramp[i], b=ramp[i+2];
        if(v>=a&&v<=b){ const t=(b===a)?0:(v-a)/(b-a), A=_hx(ramp[i+1]), B=_hx(ramp[i+3]);
          return '#'+[0,1,2].map(k=>Math.round(A[k]+(B[k]-A[k])*t).toString(16).padStart(2,'0')).join(''); } }
      return ramp[last+1]; }
    const R5=['#ffffcc','#a1dab4','#41b6c4','#2c7fb8','#253494'];
    function q5(v,lo,span){ const t2=Math.max(0,Math.min(0.999,(v-lo)/(span||1))); return R5[Math.floor(t2*5)]; }
    /* ---- 2) client-side stat choropleths (countryStats fields — same data the layers paint) ---- */
    const STAT={
      'dl-pop':{g:s=>s.density,log:1},'dl-gdppc':{g:s=>s.gdppc,log:1},'dl-hdi':{g:s=>s.hdi},
      'dl-dem':{g:s=>s.dem},'dl-milSpend':{g:s=>s.milSpend,log:1},
      'dl-milSpendGDP':{g:s=>(s.milSpend&&s.gdp)?(s.milSpend*1e9/s.gdp*100):null},
      'beta-dl-lifeexp':{g:s=>s.lifeExp,ramp:[50,'#a50026',60,'#f46d43',70,'#fee08b',78,'#a6d96a',85,'#1a9850']},
      'beta-dl-internet':{g:s=>s.internet,ramp:[10,'#a50026',30,'#f46d43',55,'#fee08b',80,'#a6d96a',98,'#1a9850']}
    };
    function statChoro(spec){ const c=cnv(),ctx=c.getContext('2d'); ocean(ctx);
      let stats=null; try{ stats=(typeof countryStats!=='undefined'&&countryStats&&Object.keys(countryStats).length)?countryStats:null; }catch(_){} if(!stats) return null;
      const vals=[]; for(const cd in stats){ let v=spec.g(stats[cd]); if(v==null||isNaN(v)) continue; if(spec.log){ if(v<=0) continue; v=Math.log(v); } vals.push(v); }
      if(vals.length<5) return null; const lo=Math.min.apply(null,vals), span=(Math.max.apply(null,vals)-lo)||1;
      const ok=drawLand(ctx,cd=>{ const s2=stats[cd]; if(!s2) return '#1b2a3d'; let v=spec.g(s2); if(v==null||isNaN(v)||(spec.log&&v<=0)) return '#1b2a3d';
        if(spec.ramp) return rampColor(spec.ramp,v); if(spec.log) v=Math.log(v); return q5(v,lo,span); });
      return ok?c.toDataURL('image/png'):null; }
    /* ---- 3) World-Bank choropleths — the layer's own indicator + its own ramp, via the layer's own cached
       loader (window.IntMapWB). Lazy: fetched only when the tile is on screen; max 2 concurrent. ---- */
    const WBP={
      /* (#R289) the CO₂ row is MODAL now (total ↔ per capita) and this copy is only the answer
         BEFORE js/wb-layers.js has registered — so it is the DEFAULT mode's series and ramp.
         `IntMapWB.codeOf`/`rampOf` answer for whichever mode is actually on. */
      'bx-wbco2':{c:'EN.GHG.CO2.MT.CE.AR5',r:[5,'#1a9850',50,'#a6d96a',300,'#fee08b',1500,'#f46d43',10000,'#a50026']},
      'bx-wburb':{c:'SP.URB.TOTL.IN.ZS',r:[20,'#edf8e9',40,'#bae4b3',60,'#74c476',80,'#31a354',95,'#006d2c']},
      'bx-wbelec':{c:'EG.ELC.ACCS.ZS',r:[20,'#a50026',50,'#f46d43',80,'#fee08b',95,'#a6d96a',100,'#1a9850']},
      'bx-wbhealth':{c:'SH.XPD.CHEX.GD.ZS',r:[2,'#fff7ec',4,'#fdd49e',8,'#fc8d59',12,'#d7301f',18,'#7f0000']},
      'bx-wbforest':{c:'AG.LND.FRST.ZS',r:[5,'#f6e8c3',20,'#c7eae5',40,'#80cdc1',60,'#35978f',80,'#01665e']},
      'bx-wbrenew':{c:'EG.FEC.RNEW.ZS',r:[5,'#fff7ec',20,'#fdd49e',40,'#a6d96a',60,'#66bd63',85,'#006837']},
      'bx-wbmobile':{c:'IT.CEL.SETS.P2',r:[30,'#fee08b',80,'#a6d96a',110,'#66bd63',140,'#1a9850',180,'#006837']},
      'bx-wbinfl':{c:'FP.CPI.TOTL.ZG',r:[0,'#1a9850',3,'#a6d96a',6,'#fee08b',15,'#f46d43',40,'#a50026']},
      'bx-wbinfmort':{c:'SP.DYN.IMRT.IN',r:[2,'#1a9850',8,'#a6d96a',25,'#fee08b',50,'#f46d43',90,'#a50026']},
      'bx-wbgdpgrow':{c:'NY.GDP.MKTP.KD.ZG',r:[-8,'#67001f',-4,'#d6604d',-1.5,'#f4a582',0,'#ffffff',1.5,'#92c5de',4,'#4393c3',8,'#053061']},
      'bx-wblit':{c:'SE.ADT.LITR.ZS',r:[40,'#a50026',60,'#f46d43',80,'#fee08b',92,'#a6d96a',100,'#1a9850']},
      'bx-wbwater':{c:'SH.H2O.SMDW.ZS',r:[30,'#a50026',55,'#f46d43',75,'#fee08b',90,'#a6d96a',100,'#1a9850']},
      'bx-wbsan':{c:'SH.STA.SMSS.ZS',r:[20,'#a50026',45,'#f46d43',70,'#fee08b',90,'#a6d96a',100,'#1a9850']},
      'bx-wbpov':{c:'SI.POV.DDAY',r:[0,'#1a9850',2,'#a6d96a',10,'#fee08b',30,'#f46d43',60,'#a50026']},
      'bx-wbgini':{c:'SI.POV.GINI',r:[25,'#1a9850',32,'#a6d96a',38,'#fee08b',45,'#f46d43',60,'#a50026']},
      'bx-wbtrade':{c:'NE.TRD.GNFS.ZS',r:[20,'#fff7ec',50,'#fdd49e',90,'#fc8d59',150,'#d7301f',300,'#7f0000']},
      'bx-wbtax':{c:'GC.TAX.TOTL.GD.ZS',r:[5,'#fff7ec',12,'#fdd49e',20,'#a6d96a',30,'#66bd63',45,'#006837']},
      'bx-wbagri':{c:'AG.LND.AGRI.ZS',r:[5,'#f6e8c3',25,'#dfc27d',45,'#c7eae5',65,'#80cdc1',85,'#01665e']},
      'bx-wbphys':{c:'SH.MED.PHYS.ZS',r:[0.1,'#a50026',0.5,'#f46d43',1.5,'#fee08b',3,'#a6d96a',6,'#1a9850']},
      'bx-wbschool':{c:'SE.SEC.ENRR',r:[30,'#a50026',55,'#f46d43',80,'#fee08b',100,'#a6d96a',130,'#1a9850']},
      'bx-wbelecuse':{c:'EG.USE.ELEC.KH.PC',r:[100,'#fff7ec',1000,'#fdd49e',4000,'#fc8d59',10000,'#d7301f',20000,'#7f0000']},
      'bx-wbrenelec':{c:'EG.ELC.RNEW.ZS',r:[5,'#fff7ec',25,'#fdd49e',50,'#a6d96a',75,'#66bd63',100,'#006837']},
      'bx-wbfdi':{c:'BX.KLT.DINV.WD.GD.ZS',r:[-2,'#a50026',1,'#fee08b',4,'#a6d96a',8,'#66bd63',15,'#006837']},
      'bx-wbmilppl':{c:'MS.MIL.TOTL.P1',r:[5000,'#fff7ec',50000,'#fdd49e',200000,'#fc8d59',800000,'#d7301f',2000000,'#7f0000']},
      'bx-wblife':{c:'SP.DYN.LE00.IN',r:[50,'#a50026',60,'#f46d43',70,'#fee08b',78,'#a6d96a',85,'#1a9850']},
      'bx-wbunemp':{c:'SL.UEM.TOTL.ZS',r:[2,'#1a9850',5,'#a6d96a',10,'#fee08b',20,'#f46d43',35,'#a50026']},
      'bx-wbnet':{c:'IT.NET.USER.ZS',r:[10,'#a50026',30,'#f46d43',55,'#fee08b',80,'#a6d96a',98,'#1a9850']},
      'bx-wbdebt':{c:'GC.DOD.TOTL.GD.ZS',r:[20,'#1a9850',45,'#a6d96a',70,'#fee08b',110,'#f46d43',180,'#a50026']},
      'bx-wbmanuf':{c:'NV.IND.MANF.ZS',r:[5,'#fff7ec',12,'#fdd49e',20,'#fc8d59',28,'#d7301f',40,'#7f0000']},
      'bx-wbu5mort':{c:'SH.DYN.MORT',r:[3,'#1a9850',10,'#a6d96a',30,'#fee08b',70,'#f46d43',120,'#a50026']},
      'bx-wbpopgrow':{c:'SP.POP.GROW',r:[-1,'#2c7fb8',0,'#7fcdbb',1.5,'#ffffb2',3,'#fe9929',5,'#cc4c02']},
      'bx-wbenergy':{c:'EG.USE.PCAP.KG.OE',r:[200,'#fff7ec',1000,'#fdd49e',3000,'#fc8d59',6000,'#d7301f',12000,'#7f0000']},
      'beta-dl-unemp':{c:'SL.UEM.TOTL.ZS',r:[2,'#1a9850',5,'#a6d96a',10,'#fee08b',20,'#f46d43',35,'#a50026']},
      'dl-tfr':{c:'SP.DYN.TFRT.IN',r:[1,'#2c7fb8',2.1,'#7fcdbb',3,'#ffffb2',4.5,'#fe9929',6.5,'#cc4c02']},   /* countryStats.tfr is only filled AFTER the layer's own lazy fetch — preview goes to WB directly (same ramp as the layer) */
      'beta-dl-cpi':{c:'GOV_WGI_CC.SC',url:'https://api.worldbank.org/v2/country/all/indicator/GOV_WGI_CC.SC?format=json&source=3&date=2023&per_page=400',r:[10,'#a50026',30,'#f46d43',50,'#fee08b',70,'#74c476',90,'#1a9850']}   /* WGI lives under source=3 and rejects mrnev — same query the layer itself uses */
    };
    /* gentle: ONE request at a time with a 350 ms gap — preview traffic must never trip the WB rate limit
       (the R69 lesson: bursts get the whole IP throttled and then EVERYTHING WB-backed shows "no data") */
    let _wbBusy=0; const _wbQueue=[];
    function wbValues(spec){ return new Promise(res=>{ _wbQueue.push({spec,res}); _wbPump2(); }); }
    function _wbPump2(){ while(_wbBusy<1&&_wbQueue.length){ const t=_wbQueue.shift(); _wbBusy++;
      const done=v=>{ setTimeout(()=>{ _wbBusy--; _wbPump2(); },350); t.res(v); };
      try{
        if(!t.spec.url&&window.IntMapWB&&window.IntMapWB.fetch){ window.IntMapWB.fetch(t.spec.c).then(m=>done(m||{})).catch(()=>done({})); }
        else{ fetch(t.spec.url||('https://api.worldbank.org/v2/country/all/indicator/'+t.spec.c+'?format=json&mrnev=1&per_page=400'))
          .then(r=>r.json()).then(j=>{ const m={}; ((j&&j[1])||[]).forEach(d=>{ if(d&&d.value!=null&&d.countryiso3code) m[d.countryiso3code]={v:+d.value}; }); done(m); }).catch(()=>done({})); }
      }catch(_){ done({}); } } }
    /* (#R270) the ramp comes from the LAYER when it is loaded (`IntMapWB.rampOf`), because the copy
       in WBP below went stale the moment #R268 made GDP growth diverging — the tile was still red →
       green while the map was red → white → blue. The copy stays as the answer before that module
       has registered, which is the only state in which it can still be reached. */
    function wbRamp(id,spec){ try{ const r=window.IntMapWB&&window.IntMapWB.rampOf&&window.IntMapWB.rampOf(String(id).replace(/^bx-/,''));
      if(r&&r.length>=4) return r; }catch(_){} return spec.r; }
    /* (#R289) the same rule for the INDICATOR. A modal layer (CO₂ total ↔ per capita) changes which
       series it paints, and the WBP copy is the pre-load answer only — exactly as the ramp copy is. */
    function wbCode(id,spec){ try{ const c=window.IntMapWB&&window.IntMapWB.codeOf&&window.IntMapWB.codeOf(String(id).replace(/^bx-/,''));
      if(c) return c; }catch(_){} return spec.c; }
    function wbChoro(spec,id){ return wbValues({url:spec.url,c:wbCode(id,spec)}).then(m=>{ if(!m||Object.keys(m).length<5) return null;
      const c=cnv(),ctx=c.getContext('2d'); ocean(ctx);
      const r=wbRamp(id,spec);
      const ok=drawLand(ctx,cd=>{ const e=m[cd]; return e?rampColor(r,e.v):'#1b2a3d'; });
      return ok?c.toDataURL('image/png'):null; }); }
    /* ---- 4) real member sets (mirrors of the layers' own lists) ---- */
    const MEMBERS={
      'dl-nato':{set:'USA CAN GBR FRA DEU ITA ESP PRT NLD BEL LUX DNK NOR ISL POL CZE SVK HUN ROU BGR HRV SVN EST LVA LTU GRC TUR ALB MNE MKD FIN SWE',col:'#1e63ff',view:[-95,28,52,72]},
      /* (#R84) dl-eu now renders as a REAL basemap composite (see REAL['dl-eu']); no longer a member-fill sketch */
      'fsu':{set:'RUS UKR BLR MDA EST LVA LTU GEO ARM AZE KAZ UZB TKM KGZ TJK',col:'#d64541',view:[19,35,155,76]}
    };
    function memberMap(spec){ const c=cnv(),ctx=c.getContext('2d');
      try{ setView(spec.view||null); ocean(ctx); const S=new Set(spec.set.split(' '));
        const ok=drawLand(ctx,cd=>S.has(cd)?spec.col:'#22344c','rgba(0,0,0,0.25)');
        return ok?c.toDataURL('image/png'):null; } finally{ setView(null); } }
    /* (#R225) the geoLayersDB preview (`geoDBPrev`) went with the nine geopolitics layers whose
       real geometry it drew — see the note in index.html. */
    /* ---- 6) special painters. Real where the data is client-side or computable (terminator, quakes,
       real coordinates of famous volcanoes/dams/hubs, coastline-derived EEZ halo); clearly stylised
       REPRESENTATIVE sketches only for live streams (planes/ships/webcams) and model fields (ECMWF). ---- */
    function base(colFn,oc){ const c=cnv(),ctx=c.getContext('2d'); ocean(ctx,oc); const ok=drawLand(ctx,colFn||null); return ok?{c,ctx}:null; }
    const dots=(ctx,pts,col,r)=>pts.forEach(p=>{ ctx.beginPath(); ctx.arc(X(p[0]),Y(p[1]),r||2.2,0,7); ctx.fillStyle=col; ctx.fill(); ctx.strokeStyle='rgba(255,255,255,0.75)'; ctx.lineWidth=0.6; ctx.stroke(); });
    const path=(ctx,pts,col,wd,dash)=>{ ctx.beginPath(); pts.forEach((p,i)=>{ const x=X(p[0]),y=Y(p[1]); if(i)ctx.lineTo(x,y); else ctx.moveTo(x,y); }); ctx.strokeStyle=col; ctx.lineWidth=wd||1.4; if(dash) ctx.setLineDash(dash); ctx.stroke(); ctx.setLineDash([]); };
    /* real coordinates (well-known sites) */
    const VOLC=[[138.73,35.36],[140.68,42.06],[131.1,32.88],[15.0,37.75],[14.43,40.82],[-25.4,37.8],[-19.6,63.6],[-155.29,19.41],[-122.18,46.2],[-121.76,46.85],[-103.62,19.51],[-90.88,14.76],[-78.44,-0.68],[-71.85,-16.29],[-72.65,-42.83],[167.17,-77.53],[55.71,-21.24],[40.3,13.6],[36.75,-1.28],[29.25,-1.52],[42.55,12.95],[127.33,1.68],[110.44,-7.54],[105.42,-6.1],[120.35,15.13],[123.685,13.257],[130.66,31.59],[145.03,-5.53],[177.18,-37.52],[175.57,-39.28],[158.83,53.26],[160.64,55.98],[-19.0,64.8],[-16.7,65.03]];
    const DAMS=[[111.0,30.82],[-114.74,36.02],[32.9,23.97],[-54.59,-25.41],[104.8,29.9],[38.5,11.2],[6.87,45.2],[78.45,17.4],[-121.0,47.96],[43.85,38.4],[-8.1,40.5],[91.6,27.6],[-79.98,44.0],[27.48,-30.3]];
    const DCH=[[-77.5,39.03],[-96.8,32.78],[-121.9,37.35],[-6.25,53.35],[-0.1,51.5],[8.68,50.11],[4.9,52.37],[103.8,1.35],[139.75,35.68],[151.2,-33.87],[-46.63,-23.55],[72.87,19.08],[126.98,37.57],[113.26,23.13]];
    const PHARMA=[[-74.4,40.5],[7.59,47.56],[-8.5,51.9],[78.49,17.44],[121.47,31.23],[135.5,34.69],[12.57,55.68],[6.98,51.03],[-71.06,42.36],[2.35,48.86],[77.59,12.97],[120.98,14.6]];
    const CABLE=[[[-74,40.7],[-30,45],[-9,38.7]],[[-5,50],[-40,47],[-73.9,40.6]],[[139.7,35.6],[170,40],[180,42]],[[-180,42],[-155,35],[-122,37.7]],[[103.8,1.3],[80,6],[43.3,11.6],[32.3,30.6],[14.5,35.9],[-5.6,36]],[[103.8,1.3],[114.1,22.3],[121.5,25],[139.7,35.6]],[[151.2,-33.9],[170,-30],[-180,-25]],[[-180,-25],[-150,-20],[-118,34]],[[-9,38.7],[-15,14.7],[18.4,-33.9]]];
    const SEALANE=[[4.4,51.9],[-5.6,35.95],[32.3,31.2],[32.55,29.9],[43.3,12.6],[56.3,26.6],[80,6],[100.4,2.5],[103.8,1.3],[114.1,22.3],[121.9,31.2]];
    const AIRHUB=[[-73.9,40.6],[-0.45,51.47],[2.55,49.01],[50.63,26.27],[55.36,25.25],[103.99,1.36],[139.78,35.55],[-118.4,33.94],[-87.9,41.97],[77.1,28.55],[126.45,37.46],[-43.2,-22.8]];
    function terminator(){ const b=base(null,'#0b1524'); if(!b) return null; const {c,ctx}=b;
      /* real current sun position: subsolar lng from UTC time, decl from day-of-year */
      const now=new Date(); const dUTC=now.getUTCHours()+now.getUTCMinutes()/60;
      const doy=Math.floor((now-new Date(Date.UTC(now.getUTCFullYear(),0,0)))/864e5);
      const decl=-23.44*Math.cos((360/365)*(doy+10)*Math.PI/180);
      const sunLng=180-dUTC*15;
      ctx.fillStyle='rgba(0,0,0,0.55)';
      for(let px=0;px<W;px+=2){ const lng=px/W*360-180; for(let py=0;py<H;py+=2){ const lat=Math.atan(Math.sinh(_MY-py/H*2*_MY))*180/Math.PI;   /* inverse mercator */
        const cosz=Math.sin(lat*Math.PI/180)*Math.sin(decl*Math.PI/180)+Math.cos(lat*Math.PI/180)*Math.cos(decl*Math.PI/180)*Math.cos((lng-sunLng)*Math.PI/180);
        if(cosz<0) ctx.fillRect(px,py,2,2); } }
      ctx.fillStyle='#ffd60a'; ctx.beginPath(); ctx.arc(X(((sunLng+540)%360)-180),Y(Math.max(-56,Math.min(74,decl))),3.4,0,7); ctx.fill();
      return c.toDataURL('image/png'); }
    function quakes(){ return fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson').then(r=>r.json()).then(j=>{
        const b=base(null); if(!b) return null; const {c,ctx}=b;
        ((j&&j.features)||[]).slice(0,220).forEach(f=>{ try{ const co=f.geometry.coordinates, m=(f.properties&&f.properties.mag)||3;
          ctx.beginPath(); ctx.arc(X(co[0]),Y(co[1]),Math.max(1.2,(m-2)*1.15),0,7); ctx.fillStyle='rgba(255,69,58,0.8)'; ctx.fill(); }catch(_){} });
        return c.toDataURL('image/png'); }).catch(()=>null); }
    function gradField(stops,overLandOnly){ const c=cnv(),ctx=c.getContext('2d'); const g=ctx.createLinearGradient(0,0,0,H);
      stops.forEach(s2=>g.addColorStop(s2[0],s2[1])); ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
      drawLand(ctx,()=>overLandOnly?null:'rgba(10,18,30,0.35)');
      return c.toDataURL('image/png'); }
    const PAINT={
      'cb-names':()=>{ const b=base(); if(!b) return null; const {c,ctx}=b; ctx.fillStyle='#fff'; ctx.font='700 11px sans-serif'; ctx.shadowColor='#000'; ctx.shadowBlur=3; ctx.fillText('Tokyo',X(139.7),Y(35.7)); ctx.fillText('Paris',X(2.3),Y(48.9)); ctx.fillText('Cairo',X(31.2),Y(30)); ctx.fillText('Lima',X(-77),Y(-12)); ctx.shadowBlur=0; return c.toDataURL('image/png'); },
      'cb-geolabels':()=>{ const b=base(); if(!b) return null; const {c,ctx}=b; ctx.fillStyle='#8fd0ff'; ctx.font='italic 10.5px serif'; ctx.fillText('Pacific Ocean',X(-160),Y(10)); ctx.fillText('Sahara',X(5),Y(23)); ctx.fillStyle='#e7dcc8'; ctx.font='10px sans-serif'; ctx.fillText('▲ Everest',X(86.9),Y(28)); return c.toDataURL('image/png'); },
      'cb-borders':()=>{ const b=base(()=> '#22344c'); if(!b) return null; const {c,ctx}=b; drawLand(ctx,()=>null,'rgba(255,255,255,0.75)'); return c.toDataURL('image/png'); },
      /* (#R289) the same picture, and honestly so: the bundled country outline IS the coastline everywhere it is not a land border. */
      'cb-coast':()=>{ const b=base(()=> '#12314f'); if(!b) return null; const {c,ctx}=b; drawLand(ctx,()=>'#1d3a55','rgba(217,219,224,0.9)'); return c.toDataURL('image/png'); },
      'cb-admin1':()=>{ const b=base(()=> '#22344c'); if(!b) return null; const {c,ctx}=b; drawLand(ctx,()=>null,'rgba(255,255,255,0.45)');
        for(let i=0;i<7;i++){ path(ctx,[[-105+i*4,49],[-105+i*4,30]],'rgba(255,255,255,0.35)',0.7,[2,2]); } return c.toDataURL('image/png'); },
      'cb-roads':()=>{ const b=base(); if(!b) return null; const {c,ctx}=b; path(ctx,[[-118,34],[-87,41],[-74,40.7]],'#ff9f0a',1.6); path(ctx,[[-8,43],[2,48],[13,52],[37,55]],'#ff9f0a',1.6); path(ctx,[[103,1.3],[100,13],[116,39]],'#ff9f0a',1.6); return c.toDataURL('image/png'); },
      'cb-grid':()=>{ const c=cnv(),ctx=c.getContext('2d'); ocean(ctx); drawLand(ctx,null);
        ctx.strokeStyle='rgba(160,190,230,0.55)'; ctx.lineWidth=0.6;
        for(let lg=-150;lg<=150;lg+=30){ ctx.beginPath(); ctx.moveTo(X(lg),0); ctx.lineTo(X(lg),H); ctx.stroke(); }
        for(let la=-40;la<=60;la+=20){ ctx.beginPath(); ctx.moveTo(0,Y(la)); ctx.lineTo(W,Y(la)); ctx.stroke(); }
        return c.toDataURL('image/png'); },
      'cb-countries':()=>{ const b=base(cd=>cd==='FRA'?'#0a84ff':'#22344c'); if(!b) return null; const {c,ctx}=b; ctx.fillStyle='#fff'; ctx.font='700 12px serif'; ctx.fillText('ⓘ',X(2.3),Y(46.5)); return c.toDataURL('image/png'); },
      'dl-nightside':terminator,
      'dl-tz':()=>{ /* (#R74) real offset bands with UTC labels — the 🕒-stamp version read as a placeholder */
        const c=cnv(),ctx=c.getContext('2d'); ocean(ctx,'#0d1725');
        for(let i=0;i<24;i++){ ctx.fillStyle=i%2?'rgba(96,148,226,0.18)':'rgba(22,44,76,0.20)'; ctx.fillRect(i*W/24,0,W/24,H); }
        drawLand(ctx,()=> 'rgba(58,88,126,0.92)','rgba(0,0,0,0.25)');
        ctx.strokeStyle='rgba(150,190,255,0.35)';
        for(let i=0;i<=24;i+=1){ ctx.beginPath(); ctx.moveTo(i*W/24,0); ctx.lineTo(i*W/24,H); ctx.lineWidth=(i%6===0)?0.9:0.4; ctx.stroke(); }
        ctx.font='700 8.5px sans-serif'; ctx.textAlign='center';
        [['-9',-135],['-6',-90],['-3',-45],['0',0],['+3',45],['+6',90],['+9',135]].forEach(t=>{ const x=X(t[1]);
          ctx.fillStyle='rgba(8,16,28,0.72)'; ctx.fillRect(x-9,3,18,11); ctx.fillStyle='#cfe0ff'; ctx.fillText(t[0],x,11.5); });
        ctx.textAlign='left'; return c.toDataURL('image/png'); },
      'dl-eez':()=>{ const c=cnv(),ctx=c.getContext('2d'); ocean(ctx,'#0a1626');
        drawLand(ctx,()=> 'rgba(60,190,255,0.4)');   /* halo = coastline buffer */
        const c2=cnv(),x2=c2.getContext('2d'); x2.drawImage(c,0,0);
        x2.filter='blur(3px)'; x2.drawImage(c,0,0); x2.filter='none';
        drawLand(x2,()=> '#22344c','rgba(120,220,255,0.9)');
        return c2.toDataURL('image/png'); },
      'dl-subcables':()=>{ const b=base(); if(!b) return null; const {c,ctx}=b; CABLE.forEach(seg=>path(ctx,seg,'#ffd60a',1.2)); return c.toDataURL('image/png'); },
      'dl-planes':()=>{ /* (#R83) a REAL great-circle route network between real airport hubs (correct 2:1 aspect) */
        const b=base(null,'#0a1424'); if(!b) return null; const {c,ctx}=b;
        const HB=[[-73.9,40.6],[-0.45,51.5],[2.55,49.0],[50.6,26.3],[55.4,25.3],[104.0,1.36],[139.8,35.6],[-118.4,33.9],[-87.9,42.0],[77.1,28.6],[126.5,37.5],[-43.2,-22.8],[151.2,-33.9],[28.0,-26.1],[-99.1,19.4],[13.4,52.5]];
        const RT=[[0,1],[0,2],[8,1],[1,4],[2,3],[4,5],[4,9],[3,5],[7,6],[7,10],[6,5],[10,5],[0,7],[8,7],[0,11],[7,11],[1,5],[2,6],[1,9],[6,12],[4,12],[7,12],[1,13],[4,13],[0,14],[7,14],[1,15],[6,10]];
        const gc=(A,B,n)=>{ const d2r=Math.PI/180,r2d=180/Math.PI; const f1=A[1]*d2r,l1=A[0]*d2r,f2=B[1]*d2r,l2=B[0]*d2r;
          const dd=2*Math.asin(Math.min(1,Math.sqrt(Math.sin((f2-f1)/2)**2+Math.cos(f1)*Math.cos(f2)*Math.sin((l2-l1)/2)**2))); const pts=[];
          for(let k=0;k<=n;k++){ const t=k/n; if(dd<1e-9){ pts.push(A); continue; } const a2=Math.sin((1-t)*dd)/Math.sin(dd), b2=Math.sin(t*dd)/Math.sin(dd);
            const x=a2*Math.cos(f1)*Math.cos(l1)+b2*Math.cos(f2)*Math.cos(l2), y=a2*Math.cos(f1)*Math.sin(l1)+b2*Math.cos(f2)*Math.sin(l2), z=a2*Math.sin(f1)+b2*Math.sin(f2);
            pts.push([Math.atan2(y,x)*r2d, Math.atan2(z,Math.sqrt(x*x+y*y))*r2d]); } return pts; };
        ctx.lineWidth=0.8; ctx.strokeStyle='rgba(100,210,255,0.5)';
        RT.forEach(rp=>{ const pts=gc(HB[rp[0]],HB[rp[1]],30); ctx.beginPath(); let px=null;
          pts.forEach((p,i)=>{ const x=X(p[0]),y=Y(p[1]); if(i&&px!=null&&Math.abs(x-px)>W*0.6){ ctx.stroke(); ctx.beginPath(); ctx.moveTo(x,y); } else if(i) ctx.lineTo(x,y); else ctx.moveTo(x,y); px=x; }); ctx.stroke(); });
        dots(ctx,HB,'#64d2ff',1.8); return c.toDataURL('image/png'); },
      'dl-ships':()=>{ /* (#R74) the live layer needs the user's own AIS key, so no live sample exists — but the
          depiction is now the REAL trunk routes with traffic density, not three dots */
        const b=base(null,'#0a1626'); if(!b) return null; const {c,ctx}=b;
        const LANES=[SEALANE,[[121.9,31.2],[129,32.5],[139.8,35.4]],[[103.8,1.3],[114.1,22.3],[121.9,31.2]],[[4.4,51.9],[-5.5,48.5],[-9.5,43],[-5.6,35.95]],[[-5.6,35.95],[-30,40],[-73.9,40.5]],[[-79.7,9.1],[-118.2,33.7]],[[-79.7,9.1],[-38,-5],[18.4,-33.9]],[[56.3,26.6],[62,24],[72.8,18.9]]];
        LANES.forEach(l=>{ ctx.beginPath(); l.forEach((p,i)=>{ const x=X(p[0]),y=Y(p[1]); if(i)ctx.lineTo(x,y); else ctx.moveTo(x,y); }); ctx.strokeStyle='rgba(48,209,88,0.28)'; ctx.lineWidth=3.2; ctx.stroke(); ctx.strokeStyle='rgba(48,209,88,0.75)'; ctx.lineWidth=0.8; ctx.stroke(); });
        /* vessel triangles seeded deterministically along each lane */
        ctx.fillStyle='#7CFC9E';
        LANES.forEach((l,li)=>{ for(let s=0;s<l.length-1;s++){ for(let k2=0;k2<3;k2++){ const t2=(k2+((li*7+s*3)%4)*0.22+0.12)/3;
          const x=X(l[s][0]+(l[s+1][0]-l[s][0])*t2), y=Y(l[s][1]+(l[s+1][1]-l[s][1])*t2);
          const ang=Math.atan2(Y(l[s+1][1])-Y(l[s][1]),X(l[s+1][0])-X(l[s][0]));
          ctx.save(); ctx.translate(x,y); ctx.rotate(ang+Math.PI/2); ctx.beginPath(); ctx.moveTo(0,-2); ctx.lineTo(1.3,1.6); ctx.lineTo(-1.3,1.6); ctx.closePath(); ctx.fill(); ctx.restore(); } } });
        [[4.4,51.9],[32.3,30.6],[56.3,26.6],[103.8,1.3],[121.9,31.2],[-79.7,9.1],[-5.6,35.95]].forEach(p=>{ const x=X(p[0]),y=Y(p[1]); const g=ctx.createRadialGradient(x,y,0.5,x,y,6); g.addColorStop(0,'rgba(120,255,170,0.55)'); g.addColorStop(1,'rgba(120,255,170,0)'); ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,6,0,7); ctx.fill(); });
        return c.toDataURL('image/png'); },
      'dl-webcams':()=>{ /* (#R74) camera-pin glyphs at the real famous-webcam cities (no emoji stamp) */
        const b=base(null,'#131a28'); if(!b) return null; const {c,ctx}=b;
        [[2.3,48.9],[13.4,52.5],[-0.1,51.5],[139.7,35.7],[-74,40.7],[-118.2,34],[151.2,-33.9],[18.4,-33.9],[-43.2,-22.9],[8.5,47.4],[24.9,60.2],[-21.9,64.1],[-99.1,19.4],[103.8,1.35],[55.3,25.2]].forEach(p=>{ const x=X(p[0]),y=Y(p[1]);
          ctx.fillStyle='#bf5af2'; ctx.strokeStyle='rgba(255,255,255,0.85)'; ctx.lineWidth=0.7;
          /* tiny camera body + lens */
          ctx.beginPath(); if(ctx.roundRect) ctx.roundRect(x-3.4,y-2.4,6.8,4.8,1.4); else ctx.rect(x-3.4,y-2.4,6.8,4.8); ctx.fill(); ctx.stroke();
          ctx.beginPath(); ctx.arc(x,y,1.25,0,7); ctx.fillStyle='#fff'; ctx.fill(); });
        return c.toDataURL('image/png'); },
      'bx-eq':quakes,
      'l9-dl-aurora':()=>{ const b=base(null,'#060b16'); if(!b) return null; const {c,ctx}=b;
        ctx.strokeStyle='rgba(60,255,140,0.75)'; ctx.lineWidth=5; ctx.filter='blur(2px)';
        ctx.beginPath(); ctx.ellipse(X(-40),Y(78),56,13,0.18,0,7); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(X(120),Y(-78)+6,50,10,-0.1,0,7); ctx.stroke(); ctx.filter='none';
        return c.toDataURL('image/png'); },
      'beta-dl-volc2':()=>{ try{ setView([116,8,168,58]);   /* NW ring of fire: Japan/Kuriles/Philippines */
        const b=base(); if(!b) return null; const {c,ctx}=b; ctx.fillStyle='#ff6b3d';
        VOLC.forEach(p=>{ const x=X(p[0]),y=Y(p[1]); if(x<-8||x>W+8||y<-8||y>H+8) return; ctx.beginPath(); ctx.moveTo(x,y-3.6); ctx.lineTo(x-3.3,y+2.5); ctx.lineTo(x+3.3,y+2.5); ctx.closePath(); ctx.fill(); });
        return c.toDataURL('image/png'); } finally{ setView(null); } },
      'l9-dl-dams':()=>{ try{ setView([25,5,125,45]);   /* Nile→Three Gorges belt */
        const b=base(); if(!b) return null; const {c,ctx}=b; ctx.fillStyle='#64d2ff'; DAMS.forEach(p=>{ const x=X(p[0]),y=Y(p[1]); if(x<-6||x>W+6||y<-6||y>H+6) return; ctx.fillRect(x-2.6,y-2.6,5.2,5.2); }); return c.toDataURL('image/png'); } finally{ setView(null); } },
      'beta-dl-dc':()=>{ const b=base(); if(!b) return null; const {c,ctx}=b; dots(ctx,DCH,'#0a84ff',2.4); return c.toDataURL('image/png'); },
      'beta-dl-pharma':()=>{ const b=base(); if(!b) return null; const {c,ctx}=b; dots(ctx,PHARMA,'#30d158',2.4); return c.toDataURL('image/png'); },
      'beta-dl-histb':()=>{ const c=cnv(),ctx=c.getContext('2d'); ctx.fillStyle='#e8dcc0'; ctx.fillRect(0,0,W,H);
        drawLand(ctx,()=> '#c9b98f','rgba(90,70,40,0.8)'); path(ctx,[[20,55],[30,50],[25,42]],'#7a5c30',1,[3,2]); path(ctx,[[-104,49],[-95,40],[-106,31]],'#7a5c30',1,[3,2]);
        return c.toDataURL('image/png'); },
      'beta-dl-ukrfront':()=>{ const cg=window.countryGeo; if(!cg) return null; const c=cnv(),ctx=c.getContext('2d'); ocean(ctx,'#101b2c');
        /* zoomed to Ukraine's REAL polygon */ const f=cg.features.find(f2=>String(f2.id)==='UKR'); if(!f) return null;
        const XX=lng=>(lng-21)/(41-21)*W, YY=lat=>(53.5-lat)/(53.5-44)*H;
        const draw=poly=>{ const ring=poly&&poly[0]; if(!ring) return; ctx.beginPath(); ring.forEach((p,i)=>{ const x=XX(p[0]),y=YY(p[1]); if(i)ctx.lineTo(x,y); else ctx.moveTo(x,y); }); ctx.closePath(); ctx.fillStyle='#2b3f5c'; ctx.fill(); ctx.strokeStyle='#8ea9cc'; ctx.lineWidth=0.8; ctx.stroke(); };
        const gm=f.geometry; if(gm.type==='Polygon') draw(gm.coordinates); else gm.coordinates.forEach(draw);
        ctx.beginPath(); [[38.2,49.95],[37.8,48.9],[37.4,47.9],[36.2,47.5],[34.7,47.3],[33.4,46.7]].forEach((p,i)=>{ const x=XX(p[0]),y=YY(p[1]); if(i)ctx.lineTo(x,y); else ctx.moveTo(x,y); }); ctx.strokeStyle='#ff453a'; ctx.lineWidth=2.2; ctx.stroke();
        return c.toDataURL('image/png'); },
      'dl-sealevel':()=>{ const c=cnv(),ctx=c.getContext('2d'); ocean(ctx,'#0c2c4c'); drawLand(ctx,()=> 'rgba(70,160,255,0.35)');
        const c2=cnv(),x2=c2.getContext('2d'); x2.drawImage(c,0,0); x2.filter='blur(2px)'; x2.drawImage(c,0,0); x2.filter='none'; drawLand(x2,()=> '#22344c');
        x2.fillStyle='#9bd1ff'; x2.font='700 12px sans-serif'; x2.fillText('+60 m',8,16); return c2.toDataURL('image/png'); },
      'beta-dl-bldg3d':()=>{ const c=cnv(),ctx=c.getContext('2d'); const g=ctx.createLinearGradient(0,0,0,H); g.addColorStop(0,'#16202e'); g.addColorStop(1,'#0c1420'); ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
        for(let i=0;i<16;i++){ const x=12+i*11, h2=14+((i*37)%52), w2=8; ctx.fillStyle='#3d5069'; ctx.fillRect(x,H-18-h2,w2,h2); ctx.fillStyle='#55708f'; ctx.beginPath(); ctx.moveTo(x,H-18-h2); ctx.lineTo(x+4,H-22-h2); ctx.lineTo(x+4+w2,H-22-h2); ctx.lineTo(x+w2,H-18-h2); ctx.closePath(); ctx.fill(); }
        ctx.fillStyle='#0f1723'; ctx.fillRect(0,H-18,W,18); return c.toDataURL('image/png'); },
      'beta-dl-spin':()=>{ const c=cnv(),ctx=c.getContext('2d'); ocean(ctx,'#0b1524'); ctx.beginPath(); ctx.arc(W/2,H/2,40,0,7); ctx.fillStyle='#123a63'; ctx.fill();
        ctx.save(); ctx.beginPath(); ctx.arc(W/2,H/2,40,0,7); ctx.clip(); ctx.translate(W/2-96,H/2-60); drawLand(ctx,()=> '#2e8b57'); ctx.restore();
        ctx.strokeStyle='#9bd1ff'; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(W/2,H/2,50,-0.6,0.9); ctx.stroke();
        ctx.fillStyle='#9bd1ff'; ctx.beginPath(); const a=0.9; const ax=W/2+50*Math.cos(a), ay=H/2+50*Math.sin(a); ctx.moveTo(ax,ay); ctx.lineTo(ax-7,ay-1); ctx.lineTo(ax-1,ay-7); ctx.closePath(); ctx.fill();
        return c.toDataURL('image/png'); },
      'dl-wind':()=>{ const b=base(null,'#0d1a2c'); if(!b) return null; const {c,ctx}=b; ctx.strokeStyle='rgba(120,220,180,0.8)'; ctx.lineWidth=1.1;
        for(let i=0;i<9;i++){ ctx.beginPath(); const y0=10+i*12; ctx.moveTo(4,y0); ctx.bezierCurveTo(W*0.3,y0-9,W*0.6,y0+9,W-6,y0-3); ctx.stroke(); }
        return c.toDataURL('image/png'); },
      'dl-contours':()=>{ const c=cnv(),ctx=c.getContext('2d'); ctx.fillStyle='#182636'; ctx.fillRect(0,0,W,H); ctx.strokeStyle='rgba(214,164,110,0.85)'; ctx.lineWidth=0.9;
        for(let r=8;r<70;r+=8){ ctx.beginPath(); ctx.ellipse(W*0.34,H*0.52,r*1.35,r,0.35,0,7); ctx.stroke(); }
        for(let r=8;r<46;r+=8){ ctx.beginPath(); ctx.ellipse(W*0.74,H*0.4,r*1.2,r,-0.3,0,7); ctx.stroke(); }
        return c.toDataURL('image/png'); },
      'bx-heat':()=>{ const b=base(null,'#0a121f'); if(!b) return null; const {c,ctx}=b;
        [[35,31.8,26],[30.5,50.4,22],[121,31,18],[-77,38.9,16],[69,34,14],[13.4,52.5,10]].forEach(p=>{ const g=ctx.createRadialGradient(X(p[0]),Y(p[1]),1,X(p[0]),Y(p[1]),p[2]); g.addColorStop(0,'rgba(255,120,40,0.85)'); g.addColorStop(1,'rgba(255,120,40,0)'); ctx.fillStyle=g; ctx.beginPath(); ctx.arc(X(p[0]),Y(p[1]),p[2],0,7); ctx.fill(); });
        return c.toDataURL('image/png'); },
      'dl-thermal':()=>{ const b=base(null,'#0a121f'); if(!b) return null; const {c,ctx}=b;
        const belts=[]; for(let i=0;i<70;i++){ const t2=(i*137)%100/100; belts.push([ -20+t2*45, 8-((i*61)%14) ]); }
        for(let i=0;i<26;i++){ belts.push([-70+((i*53)%30), -5-((i*29)%12)]); belts.push([95+((i*47)%25), 12+((i*31)%10)]); belts.push([115+((i*67)%35), -55+((i*23)%20)*0.4+42]); }
        belts.forEach(p=>{ ctx.fillStyle='rgba(255,'+(90+Math.floor(Math.random()*80))+',30,0.85)'; ctx.fillRect(X(p[0]),Y(p[1]),1.6,1.6); });
        return c.toDataURL('image/png'); },
      'beta-dl-precip':()=>gradField([[0,'#7f5539'],[0.28,'#c2a878'],[0.46,'#1d5f8a'],[0.55,'#0a3d67'],[0.66,'#1d5f8a'],[0.82,'#c2a878'],[1,'#7f5539']]),
      'eco-dl-ecoregions':()=>{ const b=base(cd=>null); if(!b) return null; const {c,ctx}=b;
        const g=ctx.createLinearGradient(0,0,0,H); g.addColorStop(0,'#dfeef7'); g.addColorStop(0.2,'#3f7a4e'); g.addColorStop(0.42,'#8fae5c'); g.addColorStop(0.52,'#2e8b57'); g.addColorStop(0.62,'#c9b25e'); g.addColorStop(0.8,'#7fae7a'); g.addColorStop(1,'#e8f2f8');
        ctx.globalCompositeOperation='source-atop'; /* keep only over land */ const c2=cnv(),x2=c2.getContext('2d'); ocean(x2,'#0e1a2b'); x2.save(); x2.beginPath();
        window.countryGeo.features.forEach(f=>{ const gm=f.geometry; if(!gm) return; const dr=poly=>{ const ring=poly&&poly[0]; if(!ring) return; x2.moveTo(X(ring[0][0]),Y(ring[0][1])); for(let i=1;i<ring.length;i++) x2.lineTo(X(ring[i][0]),Y(ring[i][1])); x2.closePath(); }; if(gm.type==='Polygon') dr(gm.coordinates); else gm.coordinates.forEach(dr); });
        x2.clip(); x2.fillStyle=g; x2.fillRect(0,0,W,H); x2.restore(); return c2.toDataURL('image/png'); },
      'eco-dl-plates':()=>{ const b=base(); if(!b) return null; const {c,ctx}=b; const col='#ff9f0a';
        path(ctx,[[-28,65],[-33,50],[-40,30],[-33,10],[-15,-10],[-15,-35],[-20,-55]],col,1.4);
        path(ctx,[[142,50],[145,40],[142,32],[128,10],[125,-5]],col,1.4); path(ctx,[[-125,48],[-122,37],[-110,23],[-104,18]],col,1.4);
        path(ctx,[[-80,0],[-75,-20],[-72,-40],[-74,-52]],col,1.4); path(ctx,[[60,25],[70,15],[90,10],[105,0],[120,-8]],col,1.4);
        return c.toDataURL('image/png'); },
      'beta-dl-cat-religion':()=>{ const b=base(cd=>null); if(!b) return null; const {c}=b; const ctx=c.getContext('2d');
        const REG=(cx,cy)=>{ /* rough real macro-regions by centroid */ };
        const col=(cd,f)=>{ try{ const gm=f.geometry; let p=(gm.type==='Polygon'?gm.coordinates[0][0]:gm.coordinates[0][0][0]); const lg=p[0],la=p[1];
          if(lg>-30&&lg<62&&la>3&&la<48&&!(lg>-12&&lg<45&&la>35)) return '#2e9e5b';       /* MENA/W-Asia */
          if(lg>60&&lg<93&&la>5&&la<36) return '#ff9f0a';                                  /* South Asia */
          if(lg>93&&lg<145&&la>18) return '#c94f4f';                                       /* East Asia */
          if(lg>93&&lg<142&&la<=18&&la>-12) return '#2e9e5b';                              /* maritime SEA */
          return '#4a7dd1'; }catch(_){ return '#4a7dd1'; } };
        ocean(ctx); drawLand(ctx,(cd,f)=>col(cd,f)); return c.toDataURL('image/png'); },
      'beta-dl-cat-language':()=>{ const b=base(cd=>null); if(!b) return null; const {c}=b; const ctx=c.getContext('2d');
        const col=(cd,f)=>{ try{ const gm=f.geometry; let p=(gm.type==='Polygon'?gm.coordinates[0][0]:gm.coordinates[0][0][0]); const lg=p[0],la=p[1];
          if(lg<-30) return '#bf5af2'; if(lg>-30&&lg<62&&la>3&&la<40) return '#2e9e5b'; if(lg>60&&lg<93&&la>5) return '#ff9f0a'; if(lg>93&&la>18) return '#c94f4f'; return '#4a7dd1'; }catch(_){ return '#4a7dd1'; } };
        ocean(ctx); drawLand(ctx,(cd,f)=>col(cd,f)); return c.toDataURL('image/png'); }
    };
    /* ECMWF model fields — clearly stylised representative fields (om:// tiles can't be sampled as an <img>) */
    const ECF={
      'dl-ec-temp':()=>gradField([[0,'#7bb1f0'],[0.35,'#9fd08f'],[0.55,'#ffd23f'],[0.78,'#ff8c42'],[1,'#e0452f']]),
      'dl-temp-x':null,
      'dl-ec-precip':()=>{ const c=cnv(),ctx=c.getContext('2d'); ocean(ctx,'#13233a'); drawLand(ctx,null);
        [[10,50,26],[92,22,22],[-62,-3,28],[120,10,20],[-78,45,16]].forEach(p=>{ const g=ctx.createRadialGradient(X(p[0]),Y(p[1]),2,X(p[0]),Y(p[1]),p[2]); g.addColorStop(0,'rgba(64,156,255,0.9)'); g.addColorStop(1,'rgba(64,156,255,0)'); ctx.fillStyle=g; ctx.beginPath(); ctx.arc(X(p[0]),Y(p[1]),p[2],0,7); ctx.fill(); });
        return c.toDataURL('image/png'); },
      'dl-ec-wind':()=>{ const b=base(null,'#0d1a2c'); if(!b) return null; const {c,ctx}=b; ctx.strokeStyle='#7fe3b0'; ctx.fillStyle='#7fe3b0'; ctx.lineWidth=1;
        for(let gx2=14;gx2<W;gx2+=24) for(let gy=14;gy<H;gy+=22){ const a=Math.sin(gx2*0.05)+Math.cos(gy*0.07); ctx.save(); ctx.translate(gx2,gy); ctx.rotate(a); ctx.beginPath(); ctx.moveTo(-5,0); ctx.lineTo(5,0); ctx.lineTo(2,-2.4); ctx.moveTo(5,0); ctx.lineTo(2,2.4); ctx.stroke(); ctx.restore(); }
        return c.toDataURL('image/png'); },
      'dl-ec-cloud':()=>{ const c=cnv(),ctx=c.getContext('2d'); ocean(ctx,'#25303f'); drawLand(ctx,null);
        [[0,48,30],[95,28,24],[-70,0,30],[140,-8,22],[-130,40,26],[25,-15,18]].forEach(p=>{ const g=ctx.createRadialGradient(X(p[0]),Y(p[1]),2,X(p[0]),Y(p[1]),p[2]); g.addColorStop(0,'rgba(235,240,248,0.92)'); g.addColorStop(1,'rgba(235,240,248,0)'); ctx.fillStyle=g; ctx.beginPath(); ctx.arc(X(p[0]),Y(p[1]),p[2],0,7); ctx.fill(); });
        return c.toDataURL('image/png'); },
      'dl-ec-dew':()=>gradField([[0,'#274a63'],[0.4,'#2e7f76'],[0.62,'#4db6a0'],[1,'#b6f0d7']]),
      'dl-ec-isobars':()=>{ const b=base(null,'#0f1c2e'); if(!b) return null; const {c,ctx}=b; ctx.strokeStyle='rgba(255,255,255,0.7)'; ctx.lineWidth=0.9;
        for(let r=8;r<62;r+=9){ ctx.beginPath(); ctx.ellipse(W*0.32,H*0.42,r*1.5,r,0.15,0,7); ctx.stroke(); }
        for(let r=9;r<44;r+=9){ ctx.beginPath(); ctx.ellipse(W*0.78,H*0.6,r*1.3,r,-0.2,0,7); ctx.stroke(); }
        ctx.fillStyle='#64d2ff'; ctx.font='700 12px sans-serif'; ctx.fillText('L',W*0.32-4,H*0.42+4); ctx.fillStyle='#ff8c8c'; ctx.fillText('H',W*0.78-4,H*0.6+4);
        return c.toDataURL('image/png'); },
      'dl-ec-slp':()=>gradField([[0,'#3b5bd6'],[0.45,'#8fb4e8'],[0.6,'#f2e4c2'],[1,'#e0452f']]),
      'dl-ec-cape':()=>{ const c=cnv(),ctx=c.getContext('2d'); ocean(ctx,'#1a2230'); drawLand(ctx,null);
        [[-95,35,26],[-58,-25,20],[88,24,18],[12,4,16],[135,-15,14]].forEach(p=>{ const g=ctx.createRadialGradient(X(p[0]),Y(p[1]),2,X(p[0]),Y(p[1]),p[2]); g.addColorStop(0,'rgba(255,90,30,0.9)'); g.addColorStop(0.6,'rgba(255,170,40,0.55)'); g.addColorStop(1,'rgba(255,170,40,0)'); ctx.fillStyle=g; ctx.beginPath(); ctx.arc(X(p[0]),Y(p[1]),p[2],0,7); ctx.fill(); });
        return c.toDataURL('image/png'); },
      'dl-ec-sst':()=>{ const c=cnv(),ctx=c.getContext('2d'); const g=ctx.createLinearGradient(0,0,0,H); g.addColorStop(0,'#3b4fd6'); g.addColorStop(0.34,'#2f9ecf'); g.addColorStop(0.52,'#f0c93f'); g.addColorStop(0.68,'#e2622f'); g.addColorStop(0.84,'#2f9ecf'); g.addColorStop(1,'#3b4fd6'); ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
        drawLand(ctx,()=> '#22344c'); return c.toDataURL('image/png'); }
    };
    Object.assign(PAINT,ECF);
    /* ==== (#R74) REAL-DATA previews ("明らかに手抜きしたと思われる雑な描画…一切変化なし"): R73 only fixed the
       raster-tile URLs; the ~30 HAND-DRAWN sketches (wind squiggles, ECMWF gradient washes, plane/ship doodles,
       heat blobs, contour ellipses) stayed — which is exactly what the user was pointing at. Each entry below
       renders the layer's OWN kind of real data:
         · every ECMWF field + both wind layers → ONE bulk Open-Meteo request (96-point world grid of current
           conditions), bilinearly interpolated into a real field / real streamlines / real isobars;
         · aurora → the live NOAA SWPC OVATION oval (same feed the layer uses);
         · fires → the same NASA FIRMS WMS the layer renders, yesterday's real detections;
         · aircraft → live airplanes.live positions over central Europe (same API as the layer);
         · news heatmap → the currently loaded news geolocations (same points as the layer);
         · submarine cables → the real TeleGeography cable geometry (same file the layer fetches);
         · roads → real Esri World Transportation cartography (LA freeway network).
       Every painter falls back to the old stylised sketch if its live source is unavailable. ==== */
    const _inv=py=>Math.atan(Math.sinh(_MY-py/H*2*_MY))*180/Math.PI;   /* inverse web-mercator for canvas rows */
    function lerpRamp(stops){ const P=stops; return v=>{ if(v==null||isNaN(v)) return null;
      if(v<=P[0][0]) return 'rgb('+P[0][1]+','+P[0][2]+','+P[0][3]+')';
      for(let i=1;i<P.length;i++){ if(v<=P[i][0]){ const a=P[i-1],b=P[i],t=(v-a[0])/((b[0]-a[0])||1);
        return 'rgb('+Math.round(a[1]+(b[1]-a[1])*t)+','+Math.round(a[2]+(b[2]-a[2])*t)+','+Math.round(a[3]+(b[3]-a[3])*t)+')'; } }
      const z=P[P.length-1]; return 'rgb('+z[1]+','+z[2]+','+z[3]+')'; }; }
    /* one bulk Open-Meteo request per session: 8 lat rows × 12 lon cols of REAL current conditions */
    const _OMLA=[62,47,32,17,2,-13,-28,-43], _OMLO=(()=>{ const a=[]; for(let x=-165;x<=165;x+=30) a.push(x); return a; })();
    let _omP=null;
    function omGrid(){ if(_omP) return _omP;
      const las=[],los=[]; _OMLA.forEach(la=>_OMLO.forEach(lo=>{ las.push(la); los.push(lo); }));
      const url='https://api.open-meteo.com/v1/forecast?latitude='+las.join(',')+'&longitude='+los.join(',')
        +'&current=temperature_2m,cloud_cover,precipitation,pressure_msl,wind_speed_10m,wind_direction_10m&hourly=cape,dew_point_2m&forecast_days=1';
      _omP=window.IntMapWx.guardedJSON(url,900000).then(j=>{ if(!j) return null; const arr=Array.isArray(j)?j:[j];
        if(arr.length!==las.length||!arr[0]||!arr[0].current) return null;
        const hh=Math.min(23,new Date().getUTCHours());
        const F={t:[],cl:[],pr:[],p:[],ws:[],wd:[],cape:[],dew:[]};
        arr.forEach(o=>{ const c=o.current||{}, hy=o.hourly||{};
          F.t.push(c.temperature_2m); F.cl.push(c.cloud_cover); F.pr.push(c.precipitation); F.p.push(c.pressure_msl);
          F.ws.push(c.wind_speed_10m); F.wd.push(c.wind_direction_10m);
          F.cape.push(hy.cape?hy.cape[hh]:null); F.dew.push(hy.dew_point_2m?hy.dew_point_2m[hh]:null); });
        return F; }).catch(()=>null);
      return _omP; }
    function omAt(F,key,lon,lat){ const a=F[key]; if(!a) return null;
      let iy=(62-lat)/15; iy=Math.max(0,Math.min(_OMLA.length-1,iy)); const y0=Math.floor(iy), y1=Math.min(_OMLA.length-1,y0+1), fy=iy-y0;
      let ix=(lon+165)/30; while(ix<0) ix+=12; const x0=((Math.floor(ix)%12)+12)%12, x1=(x0+1)%12, fx=ix-Math.floor(ix);
      const g=(yy,xx)=>{ const v=a[yy*12+xx]; return (v==null||isNaN(v))?null:+v; };
      const v00=g(y0,x0),v01=g(y0,x1),v10=g(y1,x0),v11=g(y1,x1);
      if(v00==null||v01==null||v10==null||v11==null){ const c=[v00,v01,v10,v11].filter(v=>v!=null); return c.length?c.reduce((s,v)=>s+v,0)/c.length:null; }
      return (v00*(1-fx)+v01*fx)*(1-fy)+(v10*(1-fx)+v11*fx)*fy; }
    function omField(F,key,ramp,oc){ const c=cnv(),ctx=c.getContext('2d'); ocean(ctx,oc||'#0d1725');
      for(let px=0;px<W;px+=2){ const lon=px/W*360-180; for(let py=0;py<H;py+=2){ const lat=_inv(py);
        if(lat>_OMLA[0]+4||lat<_OMLA[_OMLA.length-1]-4) continue;   /* outside the sample grid: no fake extrapolated stripes */
        const v=omAt(F,key,lon,lat); const col=ramp(v); if(col){ ctx.fillStyle=col; ctx.fillRect(px,py,2,2); } } }
      drawLand(ctx,()=>null,'rgba(0,0,0,0.42)');   /* real coastlines over the real field */
      return c.toDataURL('image/png'); }
    function omWindPaint(F){ const c=cnv(),ctx=c.getContext('2d'); ocean(ctx,'#0c1522'); drawLand(ctx,()=> '#16273c','rgba(0,0,0,0.35)');
      const spCol=lerpRamp([[0,110,200,170],[18,140,220,120],[35,250,210,80],[55,250,120,60],[80,230,60,60]]);
      for(let sy=8;sy<H;sy+=13) for(let sx=5;sx<W;sx+=15){
        let x=sx,y=sy; const lat0=_inv(y), lon0=x/W*360-180; const sp0=omAt(F,'ws',lon0,lat0); if(sp0==null) continue;
        ctx.beginPath(); ctx.moveTo(x,y); let sum=sp0,n=1;
        for(let s=0;s<15;s++){ const lon=x/W*360-180, lat=_inv(y);
          const sp=omAt(F,'ws',lon,lat), dir=omAt(F,'wd',lon,lat); if(sp==null||dir==null) break; sum+=sp; n++;
          const r=dir*Math.PI/180; const u=-Math.sin(r), v=-Math.cos(r);   /* dir = where wind comes FROM */
          const st=0.75+Math.min(2.2,sp/22); x+=u*st; y-=v*st;   /* screen y grows south, v is northward */
          if(x<0||x>W||y<0||y>H) break; ctx.lineTo(x,y); }
        ctx.strokeStyle=spCol(sum/n); ctx.globalAlpha=0.85; ctx.lineWidth=1; ctx.stroke(); ctx.globalAlpha=1; }
      return c.toDataURL('image/png'); }
    function omIsobars(F){ const c=cnv(),ctx=c.getContext('2d'); ocean(ctx,'#0f1c2e'); drawLand(ctx,()=> '#182a41','rgba(0,0,0,0.3)');
      let mn=1e9,mx=-1e9,mnP=null,mxP=null;
      ctx.fillStyle='rgba(235,242,250,0.8)';
      for(let px=0;px<W;px++){ const lon=px/W*360-180; for(let py=0;py<H;py+=1){ const lat=_inv(py);
        if(lat>_OMLA[0]+4||lat<_OMLA[_OMLA.length-1]-4) continue;
        const v=omAt(F,'p',lon,lat); if(v==null) continue;
        if(v<mn){ mn=v; mnP=[px,py]; } if(v>mx){ mx=v; mxP=[px,py]; }
        const d=Math.abs(v-Math.round(v/6)*6); if(d<0.14) ctx.fillRect(px,py,1,1); } }
      if(mnP){ ctx.fillStyle='#64d2ff'; ctx.font='700 13px sans-serif'; ctx.fillText('L',mnP[0]-4,mnP[1]+5); }
      if(mxP){ ctx.fillStyle='#ff8c8c'; ctx.font='700 13px sans-serif'; ctx.fillText('H',mxP[0]-4,mxP[1]+5); }
      return c.toDataURL('image/png'); }
    const OMPAINT={
      'dl-ec-temp':F=>omField(F,'t',lerpRamp([[-30,60,80,160],[-10,79,131,201],[0,127,179,217],[10,159,208,143],[22,255,210,63],[32,255,140,66],[42,224,69,47]])),
      'dl-ec-dew':F=>omField(F,'dew',lerpRamp([[-20,39,74,99],[0,46,127,118],[12,77,182,160],[24,182,240,215]])),
      'dl-ec-cloud':F=>omField(F,'cl',v=>v==null?null:'rgba(235,240,248,'+(Math.max(0,Math.min(100,v))/115).toFixed(2)+')','#1c2836'),
      'dl-ec-precip':F=>omField(F,'pr',v=>(v==null||v<=0.05)?null:'rgba(64,156,255,'+Math.min(0.95,0.3+Math.sqrt(v)/3).toFixed(2)+')','#13233a'),
      'dl-ec-cape':F=>omField(F,'cape',v=>(v==null||v<80)?null:('rgba(255,'+Math.max(60,170-Math.round(v/25))+',30,'+Math.min(0.92,0.25+v/2600).toFixed(2)+')'),'#151d2b'),
      'dl-ec-slp':F=>omField(F,'p',lerpRamp([[985,59,91,214],[1000,143,180,232],[1013,242,228,194],[1028,224,69,47]])),
      'dl-ec-wind':omWindPaint,'dl-wind':omWindPaint,'dl-ec-isobars':omIsobars
    };
    /* async REAL painters (fall back to the sketch in PAINT[id] when the live source fails) */
    function imgLoad(url){ return new Promise(res=>{ try{ const im=new Image(); im.crossOrigin='anonymous';
      im.onload=()=>res(im); im.onerror=()=>res(null); im.src=url; }catch(_){ res(null); } }); }
    const REAL={
      'l9-dl-aurora':()=>fetch('https://services.swpc.noaa.gov/json/ovation_aurora_latest.json').then(r=>r.json()).then(j=>{
        const co=j&&j.coordinates; if(!co||!co.length) return null;
        const b=base(null,'#060b16'); if(!b) return null; const {c,ctx}=b;
        for(let i=0;i<co.length;i++){ const p=co[i]; const prob=+p[2]; if(!(prob>=10)) continue;
          const lon=((+p[0]+180)%360)-180, lat=+p[1]; if(Math.abs(lat)>72.4) continue;
          const x=X(lon),y=Y(lat); ctx.fillStyle='rgba(60,255,140,'+Math.min(0.9,prob/55).toFixed(2)+')'; ctx.fillRect(x-1,y-1,2.4,2.4); }
        return c.toDataURL('image/png'); }).catch(()=>null),
      'dl-thermal':()=>{ const day=new Date(Date.now()-864e5).toISOString().slice(0,10); const M=20037508.34;
        const url='https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=VIIRS_NOAA20_Thermal_Anomalies_375m_All,MODIS_Terra_Thermal_Anomalies_All&CRS=EPSG:3857&BBOX='+(-M)+','+(-M)+','+M+','+M+'&WIDTH=512&HEIGHT=512&FORMAT=image/png&TRANSPARENT=TRUE&STYLES=&TIME='+day;
        return imgLoad(url).then(im=>{ if(!im) return null; const b=base(null,'#0a121f'); if(!b) return null; const {c,ctx}=b;
          const PI_M=3.1313;   /* mercator y at ±85.05° (the WMS world square) */
          const sy=(PI_M-_MY)/(2*PI_M)*512, sh=(_MY/PI_M)*512;
          try{ ctx.drawImage(im,0,sy,512,sh,0,0,W,H); return c.toDataURL('image/png'); }catch(_){ return null; } }); },
      /* (#R341) ⚠ THIS ENTRY IS OVERWRITTEN BELOW (`REAL['dl-planes']=` reassigns the same key) and
         has never run. It is kept because the reassignment is easy to remove by accident, and it no
         longer names the dead endpoint: it defers to the same "draw what the layer already holds"
         rule. See the note on the live one. */
      'dl-planes':()=>Promise.resolve(null),
      'bx-heat':()=>{ let pts=[]; try{ (window.newsFeatures||[]).forEach(f=>{ const c2=f&&f.geometry&&f.geometry.coordinates; if(c2&&isFinite(+c2[0])) pts.push(c2); }); }catch(_){}
        if(pts.length<5) return Promise.resolve(null);
        const b=base(null,'#0a121f'); if(!b) return Promise.resolve(null); const {c,ctx}=b;
        ctx.globalCompositeOperation='lighter';
        pts.slice(0,400).forEach(p=>{ const x=X(+p[0]),y=Y(+p[1]); const g=ctx.createRadialGradient(x,y,0.5,x,y,11);
          g.addColorStop(0,'rgba(255,110,40,0.34)'); g.addColorStop(1,'rgba(255,110,40,0)'); ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,11,0,7); ctx.fill(); });
        ctx.globalCompositeOperation='source-over';
        return Promise.resolve(c.toDataURL('image/png')); },
      'dl-subcables':()=>(async()=>{ /* same CORS-proxy ladder the layer itself needs for this endpoint */
        const u0='https://www.submarinecablemap.com/api/v3/cable/cable-geo.json';
        const prox=[x=>x,x=>'https://corsproxy.io/?url='+encodeURIComponent(x),x=>'https://api.allorigins.win/raw?url='+encodeURIComponent(x),x=>'https://api.codetabs.com/v1/proxy/?quest='+encodeURIComponent(x)];
        for(const mk of prox){ try{ const r=await fetch(mk(u0)); if(!r.ok) continue; const j=await r.json(); if(j&&j.features) return j; }catch(_){} } return null; })().then(j=>{
        const fs=(j&&j.features)||[]; if(!fs.length) return null;
        const b=base(); if(!b) return null; const {c,ctx}=b; ctx.lineWidth=0.65; ctx.globalAlpha=0.9;
        fs.forEach(f=>{ const gm=f.geometry; if(!gm) return; const col=(f.properties&&f.properties.color)||'#ffd60a';
          const seg=cs=>{ ctx.beginPath(); let started=false,px0=0;
            cs.forEach(p=>{ const x=X(p[0]),y=Y(p[1]); if(!started){ ctx.moveTo(x,y); started=true; } else { if(Math.abs(x-px0)>W/2){ ctx.moveTo(x,y); } else ctx.lineTo(x,y); } px0=x; });
            ctx.strokeStyle=col; ctx.stroke(); };
          if(gm.type==='LineString') seg(gm.coordinates); else if(gm.type==='MultiLineString') gm.coordinates.forEach(seg); });
        ctx.globalAlpha=1; return c.toDataURL('image/png'); }).catch(()=>null),
      'cb-roads':()=>{ const z=7,t=tXY(z,-118.35,34.1);   /* real Esri road cartography — LA freeway network */
        const u=x2=>'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/'+z+'/'+t.y+'/'+x2;
        return Promise.all([imgLoad(u(t.x)),imgLoad(u(t.x+1))]).then(ims=>{ if(!ims[0]||!ims[1]) return null;
          const n=Math.pow(2,z); const lon0=t.x/n*360-180, lon1=(t.x+2)/n*360-180;
          const latT=Math.atan(Math.sinh(Math.PI*(1-2*t.y/n)))*180/Math.PI, latB=Math.atan(Math.sinh(Math.PI*(1-2*(t.y+1)/n)))*180/Math.PI;
          try{ setView([lon0,latB,lon1,latT]); const c=cnv(),ctx=c.getContext('2d'); ocean(ctx,'#101b29'); drawLand(ctx,()=> '#1b2c42');
            try{ for(let k2=0;k2<2;k2++){ ctx.drawImage(ims[0],0,0,W/2,H); ctx.drawImage(ims[1],W/2,0,W/2,H); }   /* draw twice: the reference tiles are faint on a dark base */
              return c.toDataURL('image/png'); }catch(_){ return null; }
          } finally{ setView(null); } }); }
    };
    const REAL_LAZY={'l9-dl-aurora':1,'dl-subcables':1,'bx-heat':1};   /* heavier feeds fetch only when the tile is shown */
    Object.keys(OMPAINT).forEach(id=>{ REAL[id]=()=>omGrid().then(F=>F?OMPAINT[id](F):null); });
    /* ==== (#R84) REAL "IntMap screenshot" previews ("実際のIntMapのスクショ…適切なもの") — the ACTUAL CARTO basemap
       (2 web-mercator tiles = a true 2:1 slice) with the real layer drawn on top via setView, exactly like a
       screenshot of the live map. Falls back to the PAINT sketch if the tiles fail (CORS/offline). ==== */
    function _bmShot(z,lon,lat,dark,drawOverlay){ const t=tXY(z,lon,lat), n=Math.pow(2,z), style=dark?'dark_all':'rastertiles/voyager';
      const u=(sub,x)=>'https://'+sub+'.basemaps.cartocdn.com/'+style+'/'+z+'/'+(((x%n)+n)%n)+'/'+t.y+'@2x.png';
      return Promise.all([imgLoad(u('a',t.x)),imgLoad(u('b',t.x+1))]).then(ims=>{ if(!ims[0]&&!ims[1]) return null;
        const lon0=t.x/n*360-180, lon1=(t.x+2)/n*360-180;
        const latT=Math.atan(Math.sinh(Math.PI*(1-2*t.y/n)))*180/Math.PI, latB=Math.atan(Math.sinh(Math.PI*(1-2*(t.y+1)/n)))*180/Math.PI;
        try{ setView([lon0,latB,lon1,latT]); const c=cnv(),ctx=c.getContext('2d');
          ctx.fillStyle=dark?'#0b0e14':'#e2e8ef'; ctx.fillRect(0,0,W,H);
          try{ if(ims[0]) ctx.drawImage(ims[0],0,0,W/2,H); if(ims[1]) ctx.drawImage(ims[1],W/2,0,W/2,H); }catch(_){}
          try{ drawOverlay(ctx,t,n); }catch(_){}
          let out=null; try{ out=c.toDataURL('image/png'); }catch(_){ out=null; } return out;
        } finally{ setView(null); } }).catch(()=>null); }
    const _EUSET=new Set('BEL FRA DEU ITA LUX NLD DNK IRL GRC ESP PRT AUT FIN SWE CYP CZE EST HUN LVA LTU MLT POL SVK SVN BGR ROU HRV'.split(' '));
    REAL['dl-eu']=()=>_bmShot(3,-8,48,false,ctx=>{ drawLand(ctx,cd=>_EUSET.has(cd)?'rgba(30,92,224,0.5)':null,'rgba(30,92,224,0.85)'); });
    REAL['beta-dl-volc2']=()=>_bmShot(2,150,22,false,ctx=>{ ctx.fillStyle='#ff5a2c'; ctx.strokeStyle='rgba(255,255,255,0.85)'; ctx.lineWidth=0.6; VOLC.forEach(p=>{ const x=X(p[0]),y=Y(p[1]); if(x<-6||x>W+6||y<-6||y>H+6) return; ctx.beginPath(); ctx.moveTo(x,y-3.4); ctx.lineTo(x-3,y+2.4); ctx.lineTo(x+3,y+2.4); ctx.closePath(); ctx.fill(); ctx.stroke(); }); });
    REAL['bx-eq']=()=>fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson').then(r=>r.json()).then(j=>{ const fs=(j&&j.features)||[]; return _bmShot(1,0,16,true,ctx=>{ fs.slice(0,320).forEach(f=>{ try{ const co=f.geometry.coordinates, m=(f.properties&&f.properties.mag)||3; const x=X(co[0]),y=Y(co[1]); ctx.beginPath(); ctx.arc(x,y,Math.max(1.1,(m-2)*1.1),0,7); ctx.fillStyle='rgba(255,69,58,0.85)'; ctx.fill(); ctx.strokeStyle='rgba(255,255,255,0.55)'; ctx.lineWidth=0.4; ctx.stroke(); }catch(_){} }); }); }).catch(()=>null);
    REAL['dl-tz']=()=>_bmShot(1,0,18,false,ctx=>{ ctx.strokeStyle='rgba(90,150,230,0.55)'; ctx.lineWidth=0.8; for(let lg=-165;lg<=165;lg+=15){ const x=X(lg); ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); } ctx.font='700 8px sans-serif'; ctx.textAlign='center'; [['-9',-135],['-6',-90],['-3',-45],['0',0],['+3',45],['+6',90],['+9',135]].forEach(z2=>{ const x=X(z2[1]); ctx.fillStyle='rgba(8,16,28,0.72)'; ctx.fillRect(x-8,3,16,10); ctx.fillStyle='#cfe0ff'; ctx.fillText(z2[0],x,11); }); ctx.textAlign='left'; });
    REAL['beta-dl-histb']=()=>_bmShot(3,14,48,true,ctx=>{ drawLand(ctx,()=>'rgba(0,0,0,0)','rgba(226,184,96,0.9)'); });
    REAL['dl-sealevel']=()=>_bmShot(5,4.9,52.2,false,ctx=>{ ctx.fillStyle='rgba(46,138,236,0.4)'; ctx.fillRect(0,0,W,H); ctx.fillStyle='#0a3d67'; ctx.font='700 11px sans-serif'; ctx.fillText('+2 m',8,16); });
    /* (#R341) THE AIRCRAFT TILE NO LONGER FETCHES, AND THE REASON IS THIS FILE'S OWN.
       It used to poll `api.airplanes.live/v2/point/47/8/250` on EVERY page load — including the
       loads that never open the aircraft layer. That endpoint now answers HTTP 403 with no CORS
       header, so what the poll actually produced was two failed requests and two console errors per
       visit, and never a tile.
       The sibling satellite tile already states the rule that fixes it: "THIS TILE NEVER TRIGGERS A
       LOAD — it only draws a catalogue that is ALREADY in hand … the real-data preview is a reward
       for having used the layer, and everything else falls back to the stylised sketch". The
       aircraft tile was the exception that note explicitly allowed, on the grounds that
       airplanes.live was "built to be polled". It is not answering at all any more, and the
       replacement — one shared server read, fanned out to every reader — is precisely the thing a
       per-visit thumbnail must not multiply.
       So: draw from what the layer already holds, or return null and let the sketch stand. */
    function _planesInHand(limit){
      try{
        const A=window.IntMapAviation;
        if(!A||!A.isOn||!A.isOn()) return null;
        const list=A.snapshotFor&&A.snapshotFor(limit||700);
        return (list&&list.length>=10)?list:null;
      }catch(_){ return null; }
    }
    REAL['dl-planes']=()=>{ const ac=_planesInHand(700); if(!ac) return Promise.resolve(null); return Promise.resolve(_bmShot(6,8,47,true,ctx=>{ ac.forEach(a=>{ const x=X(a.lon),y=Y(a.lat); if(x<-3||x>W+3||y<-3||y>H+3) return; const alt=a.altFt||0; const col=alt>30000?'#64d2ff':alt>10000?'#9bd1ff':'#ffd60a'; const r=((a.track||0))*Math.PI/180; ctx.save(); ctx.translate(x,y); ctx.rotate(r); ctx.beginPath(); ctx.moveTo(0,-2.6); ctx.lineTo(1.7,2.2); ctx.lineTo(-1.7,2.2); ctx.closePath(); ctx.fillStyle=col; ctx.fill(); ctx.restore(); }); })); };
    /* (#R184) satellites — the REAL catalogue, propagated by the layer's own SGP4 through
       IntMapSatellites.snapshot(), so the tile shows where those objects actually are right now and
       cannot drift away from what the layer draws. Sub-satellite points over the whole world, sized
       by orbit regime, plus the ISS ground track when the station is in the loaded group. */
    /* (#R184) THIS TILE NEVER TRIGGERS A LOAD — it only draws a catalogue that is ALREADY in hand.
       The sibling `dl-planes` tile does fetch, and that is fine: airplanes.live is a high-volume
       community ADS-B endpoint built to be polled. CelesTrak is not — it is a small, free, keyless
       service that stopped answering this machine entirely after seven requests in five minutes, and
       a preview tile that pulls a satellite catalogue on EVERY page load (measured: it did, in a
       session that never opened the layer) is the app being a bad citizen of it for a thumbnail.
       So the real-data preview is a reward for having used the layer, and everything else falls back
       to the stylised sketch — which is what `null` here means. */
    REAL['dl-sats']=()=>{ const A=window.IntMapSatellites;
      if(!A||!A.snapshot||!A.state||!(A.state().catalogue>0)) return Promise.resolve(null);
      return A.snapshot().then(fx=>{ if(!fx||fx.length<5) return null;
        let trk=null; try{ const iss=fx.find(f=>/ZARYA|ISS \(/i.test(f.name||'')); if(iss) trk=A.groundTrack(iss.id); }catch(_){}
        return _bmShot(1,0,10,true,ctx=>{
          if(trk) trk.forEach(seg=>{ ctx.beginPath(); seg.forEach((p,i)=>{ const x=X(p[0]),y=Y(p[1]); i?ctx.lineTo(x,y):ctx.moveTo(x,y); });
            ctx.strokeStyle='rgba(255,210,63,0.55)'; ctx.lineWidth=1; ctx.stroke(); });
          fx.slice(0,900).forEach(f=>{ const x=X(f.lng),y=Y(f.lat); if(x<-3||x>W+3||y<-3||y>H+3) return;
            const r=f.altKm>30000?2.6:f.altKm>2000?2.0:1.5;
            ctx.beginPath(); ctx.arc(x,y,r,0,7);
            ctx.fillStyle=(f.sunlit===false)?'rgba(255,210,63,0.4)':'#ffd23f'; ctx.fill();
            ctx.strokeStyle='rgba(255,255,255,0.55)'; ctx.lineWidth=0.4; ctx.stroke(); });
        });
      }).catch(()=>null); };
    REAL['dl-ec-cloud']=()=>{ const z=2,lon=140,lat=26,t=tXY(z,lon,lat),n=Math.pow(2,z),date='2024-06-15';
      const gu=x=>'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_Cloud_Fraction_Day/default/'+date+'/GoogleMapsCompatible_Level6/'+z+'/'+t.y+'/'+(((x%n)+n)%n)+'.png';
      return Promise.all([imgLoad(gu(t.x)),imgLoad(gu(t.x+1))]).then(gibs=>_bmShot(z,lon,lat,false,ctx=>{ ctx.globalAlpha=0.66; try{ if(gibs[0]) ctx.drawImage(gibs[0],0,0,W/2,H); if(gibs[1]) ctx.drawImage(gibs[1],W/2,0,W/2,H); }catch(_){} ctx.globalAlpha=1; })).catch(()=>null); };
    /* render immediately (not observer-gated) so they reliably replace the gradient placeholder — the tile cost is
       just 2-4 lightweight tiles each, and the observer has historically left some tiles stuck on the gradient. */
    /* ---- resolver: apply a preview to an element (sync when possible, async upgrade otherwise) ---- */
    const _needGeo=[];
    function _geoReady(){ try{ return !!(window.countryGeo&&window.countryGeo.features&&typeof countryStats!=='undefined'&&countryStats&&Object.keys(countryStats).length); }catch(_){ return false; } }
    function _kickGeo(){ if(_kickGeo._d) return; _kickGeo._d=1; try{ if(typeof loadCountryData==='function') loadCountryData().then(()=>{ const q=_needGeo.splice(0); q.forEach(fn=>{ try{ fn(); }catch(_){} }); }); }catch(_){} }
    function grad(label){ let h=0; for(let i=0;i<label.length;i++){ h=(h*31+label.charCodeAt(i))>>>0; } const h1=h%360,h2=(h1+42)%360; return 'linear-gradient(135deg,hsl('+h1+',42%,40%),hsl('+h2+',48%,28%))'; }
    function apply(el,url){ el.style.backgroundImage='url("'+url+'"), '+grad(el.dataset.pn||''); el.classList.add('has-prev'); }
    function into(el,id,label){ el.dataset.pn=label||id;
      if(cache[id]){ apply(el,cache[id]); return; }
      el.style.backgroundImage=grad(label||id);   /* placeholder until the real preview lands */
      const store=u=>{ if(u){ cache[id]=u; apply(el,u); } };
      /* (#R73) deterministic QUEUE loader for the example tiles (4 at a time, DOM order). The R72
         IntersectionObserver version could leave tiles on their gradient placeholder forever (observer
         registered while the sidebar was prebuilt off-screen; entries never re-checked in some states —
         the reported "一切変化なし"), and the pre-R72 direct assignment fired ~30 parallel fetches ("読み込みが
         遅い"). A small preload queue is immediate, ordered and bounded. */
      if(IMG[id]){ _queueImg(el,id,IMG[id]); return; }
      if(id==='dl-radar'){ radarURL().then(u=>{ if(u) store(u); }); return; }
      /* (#R311) THE CANVAS PAINTERS TAKE THE SAME GATE AS THE IMAGE QUEUE (see _paintJob below).
         #R193 moved only the picture downloads off the boot path; these four routes still drew the
         moment their row was built, and a boot CPU profile put js/layer-previews.js at 904.7 ms of
         self time - the largest single IntMap file in it - with statChoro alone at 85.1 ms. All of
         that is drawing for a panel nobody has opened. The geo test stays INSIDE the job, so the
         order is 'gate opens -> is the country data here? -> paint', which also keeps _kickGeo()'s
         loadCountryData() off the boot path rather than merely moving the drawing off it. */
      const geoJob=(fn)=>_paintJob(()=>{ if(_geoReady()){ try{ store(fn()); }catch(_){} } else { _needGeo.push(()=>{ try{ const u=fn(); if(u){ cache[id]=u; apply(el,u); } }catch(_){} }); _kickGeo(); } },el,id);
      if(STAT[id]){ geoJob(()=>statChoro(STAT[id])); return; }
      if(MEMBERS[id]){ geoJob(()=>memberMap(MEMBERS[id])); return; }
      if(WBP[id]){ /* lazy: only fetch when the tile is actually visible */
        _observe(el,()=>{ const run=()=>wbChoro(WBP[id],id).then(u=>{ if(u){ cache[id]=u; apply(el,u); } });
          if(_geoReady()) run(); else { _needGeo.push(run); _kickGeo(); } });
        return; }
      /* (#R74) live-data painters first; the old sketch in PAINT[id] is only the fallback */
      if(REAL[id]){ const fn2=REAL[id];
        const run=()=>{ Promise.resolve().then(fn2).then(u=>{ if(u){ cache[id]=u; apply(el,u); return; }
            const fb=PAINT[id]; if(!fb) return; const v=fb(); if(v&&v.then){ v.then(w=>{ if(w){ cache[id]=w; apply(el,w); } }); } else if(v){ cache[id]=v; apply(el,v); } }).catch(()=>{}); };
        const go=()=>{ if(_geoReady()) run(); else { _needGeo.push(run); _kickGeo(); } };
        if(REAL_LAZY[id]) _observe(el,go); else _paintJob(go,el,id);   /* (#R311) the observer route is untouched; the eager one waits for the gate */
        return; }
      if(PAINT[id]){ const fn=PAINT[id];
        const run=()=>{ const u=fn(); if(u&&u.then){ u.then(v=>{ if(v){ cache[id]=v; apply(el,v); } }); } else if(u){ cache[id]=u; apply(el,u); } };
        _paintJob(()=>{ if(_geoReady()) run(); else { _needGeo.push(run); _kickGeo(); } },el,id);   /* (#R311) same gate as geoJob above */
        return; }
      /* nothing matched → labelled gradient stays (should be near-zero rows) */ }
    /* (#R73) bounded image-preload queue — applies each tile as soon as ITS image arrived */
    /* ══ (#R193) …AND IT MAY NOT START ON THE BOOT PATH ═══════════════════════════════════════════
       「起動時の読み込みをもっと早く。」 Measured on a cold load: the self-hosted example tiles
       (preview_contours / _wind / _basemap / _plates / _ecoregions / _nightlights, ~950 KB together)
       plus a couple of dozen live GIBS and Carto tiles were fetched between 8 and 12 seconds after
       boot, because the layer list is PREBUILT off-screen and `into()` queues every row as it is
       built. Nobody has looked at the panel at that point.

       ⚠ The fix is NOT an IntersectionObserver. #R72 tried that and #R73 had to undo it: tiles
       registered while the panel was off-screen never got a second look and sat on their gradient
       placeholder forever (「一切変化なし」). The queue stays exactly as #R73 built it — same order,
       same bound of four, same immediate application — and only its START moves: it opens when the
       panel is actually shown (kick()), or at the browser's first idle, whichever comes first. So a
       user who opens the panel in the first second sees the same thing they saw before, and a user
       who never opens it never pays for it during boot. */
    const _imgQ=[]; let _imgBusy=0, _imgOpen=false;
    /* == (#R311) ...AND NEITHER MAY THE CANVAS PAINTERS =========================================
       #R193 gated IMG[id] only. STAT / MEMBERS / REAL / PAINT in into() kept drawing as their rows
       were built, which costs main-thread CPU rather than bandwidth: a boot profile measured
       904.7 ms of self time in this file (statChoro 85.1 ms, the dl-ec-* painters 52-75 ms each),
       spent drawing thumbnails for a panel that had not been opened.
       (!) Still NOT an IntersectionObserver - the warning above is exactly why. This gate ALWAYS
       opens (kick(), the map's first idle, or the 6 s ceiling), so a queued painter is a DELAYED
       painter and never a lost one; no new path can leave a tile on its gradient forever.
       (!) And a job re-reads the cache when it finally runs: into()'s own cache[id] short-circuit
       can only spare a second row for the same layer once the first row has painted, which a queued
       job has not - without this, a sidebar and a phone sheet built behind a closed gate would each
       paint every tile, work the pre-#R311 code never did twice. */
    const _paintQ=[];
    function _paintJob(fn,el,id){ const job=()=>{ if(el&&id&&cache[id]){ try{ apply(el,cache[id]); }catch(_){} return; } try{ fn(); }catch(_){} };
      if(_imgOpen){ job(); return; } _paintQ.push(job); }
    function _openQueue(){ if(_imgOpen) return; _imgOpen=true; _imgPump();
      /* (#R311) the painters are held back by the same flag, so they are released by the same call -
         all three ways in (kick(), the map's idle, the 6 s ceiling) reach the gate through here.
         _imgOpen is already true above, so a job queued from inside a painter runs straight away
         and this drain runs exactly once. */
      const q=_paintQ.splice(0); q.forEach(fn=>{ try{ fn(); }catch(_){} }); }
    (function(){ const go=()=>{ if(typeof requestIdleCallback==='function') requestIdleCallback(_openQueue,{timeout:9000}); else setTimeout(_openQueue,5000); };
      try{ const E=window.IntMapGeoEngine; if(E&&E.events&&E.events.once){ E.events.once('idle',()=>setTimeout(go,400)); } }catch(_){}
      setTimeout(go,6000); })();
    function _queueImg(el,id,url){ _imgQ.push({el,id,url}); _imgPump(); }
    function _imgPump(){ if(!_imgOpen) return;
      while(_imgBusy<4&&_imgQ.length){ const j=_imgQ.shift(); _imgBusy++;
      const done=()=>{ _imgBusy--; _imgPump(); };
      try{ const im=new Image();
        im.onload=()=>{ cache[j.id]=j.url; try{ apply(j.el,j.url); }catch(_){} done(); };
        im.onerror=()=>{ done(); };   /* keep the labelled gradient on a dead tile URL */
        im.src=j.url;
      }catch(_){ done(); } } }
    let _io=null; const _ioMap=new WeakMap();
    function _observe(el,fn){ if(!('IntersectionObserver' in window)){ fn(); return; }
      if(!_io){ _io=new IntersectionObserver(es=>{ es.forEach(e=>{ if(e.isIntersecting){ const f=_ioMap.get(e.target); if(f){ _ioMap.delete(e.target); _io.unobserve(e.target); try{ f(); }catch(_){} } } }); },{root:null,rootMargin:'160px'}); }
      _ioMap.set(el,fn); _io.observe(el); }
    /* (#R73) safety net: fire any still-pending lazy previews inside a container (called when the sidebar
       actually OPENS — IO can miss elements that were registered while the panel was prebuilt off-screen). */
    function kick(container){ _openQueue();     /* (#R193) the panel is on screen — the queue starts NOW */
      try{ (container||document).querySelectorAll('.lst-prev:not(.has-prev)').forEach(el=>{
      const fn=_ioMap.get(el); if(fn){ _ioMap.delete(el); try{ _io&&_io.unobserve(el); }catch(_){} try{ fn(); }catch(_){} } }); }catch(_){} }
    return { into, kick, stats:()=>({q:_imgQ.length,busy:_imgBusy,inflight:_imgQ.slice(0,4).map(j=>j.id)}) };
};
