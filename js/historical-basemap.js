/* Chronos uses present-day physical geography as a reference, never a raster
   containing modern political boundaries. The shared OFM source retains its
   existing OpenFreeMap / OpenMapTiles / OSM attribution. These are not reconstructed
   historical coastlines or land cover. Schema: openmaptiles/openmaptiles layers. */
(function(){
  const RASTERS=['layer-light','layer-light-nl','layer-dark','layer-dark-nl'];
  function definitions(light){
    const water=light?'#b7d0db':'#172c3a';
    return [
      {id:'imhb-ground',type:'background',paint:{'background-color':light?'#ede9df':'#323a3c'}},
      {id:'imhb-cover',type:'fill',source:'ofm','source-layer':'landcover',
        /* `grass` includes gardens / golf courses and `wood` includes managed
           forests: use upstream natural subclasses, not those broad classes. */
        filter:['in',['get','subclass'],['literal',['wood','grassland','heath','scrub','fell','tundra','bare_rock','scree','beach','sand','dune','glacier','ice_shelf','bog','swamp','marsh','reedbed','tidalflat','saltmarsh','mangrove']]],
        paint:{'fill-color':['match',['get','class'],'ice',light?'#f7faf9':'#8a9ca2','wood',light?'#cbd8bd':'#354b41','sand',light?'#e8ddba':'#514d3d','rock',light?'#d4d1c8':'#45494a',light?'#d4dec9':'#3d4a40'],'fill-opacity':0.75}},
      {id:'imhb-water',type:'fill',source:'ofm','source-layer':'water',
        filter:['in',['get','class'],['literal',['ocean','lake','river']]],
        paint:{'fill-color':water,'fill-antialias':false}},
      {id:'imhb-rivers',type:'line',source:'ofm','source-layer':'waterway',
        filter:['all',['in',['get','class'],['literal',['river','stream']]],['!=',['get','brunnel'],'tunnel']],
        layout:{'line-cap':'round','line-join':'round'},
        paint:{'line-color':water,'line-width':['interpolate',['linear'],['zoom'],3,0.4,8,0.8,14,2,18,5]}}
    ];
  }
  function apply(engine,{active,sat,light,labels=false}){
    const L=engine.layers, visible=!!active&&!sat;
    if(visible&&!L.hasSource('ofm')) return false;
    const defs=definitions(light);
    if(active&&L.has('imtb-line')&&window.IntMapBorderStyle?.colorFor)
      L.setPaint('imtb-line','line-color',window.IntMapBorderStyle.colorFor(light,sat));
    if(visible){
      /* Insert at the map base, above the polar/world background and below
         overlays. A background added above us must not replace the land color. */
      const before=engine.scene.getStyle()?.layers?.find(l=>RASTERS.includes(l.id))?.id;
      for(const def of defs){
        if(!L.has(def.id)) L.add({...def,layout:{...def.layout,visibility:'none'}},before);
        for(const [key,value] of Object.entries(def.paint)) L.setPaint(def.id,key,value);
      }
    }
    for(const def of defs) if(L.has(def.id)) L.setLayout(def.id,'visibility',visible?'visible':'none');
    for(const id of RASTERS) if(L.has(id)){
      const on=!sat&&!active&&id===`layer-${light?'light':'dark'}${labels?'':'-nl'}`;
      L.setLayout(id,'visibility',on?'visible':'none');
    }
    window.IntMapCartoCredit?.();
    return true;
  }
  window.IntMapHistoricalBasemap={apply,definitions};
})();
