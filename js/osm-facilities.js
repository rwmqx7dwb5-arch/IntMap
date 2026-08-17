/* ============================================================================
 *  IntMap · Surveyed facilities — IntMapFacilities   (#R255)
 * ----------------------------------------------------------------------------
 *  「政治、軍事、医療・衛生、IT・テックレイヤーカテゴリを追加し、レイヤーの再編や追加を行うように。」
 *  → 「新レイヤー、単に国別で色分けする奴だけじゃなくて、ガチな奴もしっかりたくさん追加して。」
 *
 *  ── WHY THESE FOUR, AND WHY THEY ARE NOT CHOROPLETHS ──────────────────────────────────────────
 *  The four new categories could have been filled entirely from the World Bank's indicator table —
 *  one number per country, painted on the country. The reader asked for the opposite: the layers
 *  that make those categories worth opening are the ones that show OBJECTS, in their real places,
 *  that you can click. So each of the four categories gets one point layer of surveyed facilities:
 *
 *    政治・統治    embassies, consulates and other diplomatic missions
 *    軍事・安全保障 military airfields, naval bases, barracks, ranges and danger areas
 *    医療・衛生    hospitals, clinics, doctors' surgeries and pharmacies
 *    IT・技術インフラ internet exchanges, telephone exchanges, communication masts and towers
 *
 *  ── THE SOURCE IS OPENSTREETMAP, PER VIEW, AND IT SAYS SO ─────────────────────────────────────
 *  Every point is an OSM object with its own id, fetched for the current viewport through the same
 *  raced-mirror Overpass path js/datacenters.js and js/atlas-sources.js use, cached per view box,
 *  ODbL-attributed. Nothing is generated and no field is filled in: the card prints the object's own
 *  tags and links to the object, so a wrong value is a thing to fix in OSM rather than a thing this
 *  program made up (standing rule 4).
 *
 *  ⚠ NOT AN INTELLIGENCE PRODUCT. The military layer shows what volunteers have mapped from public
 *  sources and what national surveys publish — it is a map of the public record, and the card says
 *  so. Nothing here is derived from imagery analysis, and no site is inferred from anything.
 *
 *  ── MODULE RULES ──────────────────────────────────────────────────────────────────────────────
 *  · One engine, four tag sets: the fetch, the cache, the layers, the card and the legend are
 *    written once and parameterised, because four copies of them would be four things to keep true.
 *  · The renderer is reached through the contract only (`GE()`), never a raw handle (#R178).
 *  · Every value that reaches the DOM goes through window.IntMapSafe (#R138).
 *  · Five languages inline (standing rule 3); the keyed table covers the other four.
 * ==========================================================================*/
window.IntMapModules=window.IntMapModules||{};
window.IntMapModules.facilities=function(HOST){
  const GE=()=>window.IntMapGeoEngine;
  const L=window.IntMapLang.pick(()=>HOST.lang);
  const LA=window.IntMapLang.pickArgs();
  const S=(v)=>{ try{ return window.IntMapSafe.html(v==null?'':String(v)); }catch(_){ return ''; } };
  const U=(v)=>{ try{ return window.IntMapSafe.url(String(v||'')); }catch(_){ return ''; } };
  function _canDraw(){ try{ return !!HOST.canDraw(); }catch(_){ try{ return !!GE().ready(); }catch(__){ return false; } } }

  /* ─── the four sets ────────────────────────────────────────────────────────────────────────────
     `q`    the Overpass selectors, joined into one union query
     `kind` (tags)→ a bucket id, which decides the colour, the legend row and the card's subtitle
     `zoom` the zoom at which the viewport stops being a continent — below it the layer waits    */
  const SETS={
    diplo:{
      id:'osmdiplo', row:'fac-dl-osmdiplo', zoom:5,
      name:()=>LA('Diplomatic missions','外交公館（大使館・領事館）','Diplomatische Vertretungen','Дипломатические миссии','Misiones diplomáticas'),
      note:()=>L('Embassies, consulates and other diplomatic missions mapped in OpenStreetMap for the current view. Click any point for the record.',
                 '現在の表示範囲について OpenStreetMap に登録されている大使館・領事館などの外交公館です。点をクリックすると内容が出ます。',
                 'In OpenStreetMap erfasste Botschaften und Konsulate im aktuellen Ausschnitt. Punkt anklicken für den Datensatz.',
                 'Посольства и консульства из OpenStreetMap для текущего вида. Нажмите точку для сведений.',
                 'Embajadas y consulados de OpenStreetMap para la vista actual. Haga clic en un punto para ver el registro.'),
      q:['nwr["amenity"="embassy"]','nwr["office"="diplomatic"]'],
      buckets:{
        embassy:['#5ac8fa',LA('Embassy','大使館','Botschaft','Посольство','Embajada')],
        consulate:['#ffd166',LA('Consulate','領事館','Konsulat','Консульство','Consulado')],
        other:['#a0a6b0',LA('Other mission','その他の公館','Sonstige Vertretung','Иная миссия','Otra misión')] },
      kind:(t)=>{ const d=String(t['diplomatic']||t['office']||t['amenity']||'').toLowerCase();
        if(/embassy|high_commission|nunciature/.test(d)) return 'embassy';
        if(/consul/.test(d)) return 'consulate'; return 'other'; },
      /* the fields worth printing, in the order a reader wants them */
      fields:(t)=>[['country',t['country']||t['target']||t['diplomatic:sending_country']||''],
                   ['operator',t['operator']||''],['addr',_addr(t)],['phone',t['phone']||t['contact:phone']||''],
                   ['web',t['website']||t['contact:website']||'']]
    },
    mil:{
      id:'osmmil', row:'fac-dl-osmmil', zoom:6,
      name:()=>LA('Military sites','軍事施設','Militärische Anlagen','Военные объекты','Instalaciones militares'),
      note:()=>L('Airfields, naval bases, barracks, ranges and danger areas tagged military in OpenStreetMap for the current view. The public record only — nothing here is inferred from imagery.',
                 '現在の表示範囲について OpenStreetMap に military として登録されている飛行場・海軍基地・兵舎・演習場・危険区域です。公開情報の記録のみで、画像判読による推定は含みません。',
                 'Flugplätze, Marinestützpunkte, Kasernen und Sperrgebiete aus OpenStreetMap. Nur öffentlich erfasste Angaben.',
                 'Аэродромы, базы, казармы и опасные зоны по данным OpenStreetMap. Только открытые сведения.',
                 'Aeródromos, bases navales, cuarteles y zonas peligrosas de OpenStreetMap. Solo el registro público.'),
      q:['nwr["military"]','nwr["landuse"="military"]'],
      buckets:{
        air:['#ff9f0a',LA('Airfield','飛行場','Flugplatz','Аэродром','Aeródromo')],
        naval:['#32d0ff',LA('Naval base','海軍基地','Marinestützpunkt','Военно-морская база','Base naval')],
        base:['#ff453a',LA('Base / barracks','基地・兵舎','Stützpunkt / Kaserne','База / казармы','Base / cuartel')],
        range:['#bf5af2',LA('Range / danger area','演習場・危険区域','Übungsplatz / Sperrgebiet','Полигон / опасная зона','Campo de tiro / zona peligrosa')],
        other:['#a0a6b0',LA('Other military site','その他の軍事施設','Sonstige Anlage','Иной объект','Otra instalación')] },
      kind:(t)=>{ const d=String(t['military']||t['landuse']||'').toLowerCase();
        if(/airfield|air_base|airbase/.test(d)) return 'air';
        if(/naval/.test(d)) return 'naval';
        if(/range|danger_area|training_area/.test(d)) return 'range';
        if(/base|barracks|checkpoint|office/.test(d)) return 'base'; return 'other'; },
      fields:(t)=>[['branch',t['military:service']||t['operator:type']||''],['operator',t['operator']||''],
                   ['addr',_addr(t)],['web',t['website']||'']]
    },
    health:{
      id:'osmhealth', row:'fac-dl-osmhealth', zoom:8,
      name:()=>LA('Health facilities','医療機関','Gesundheitseinrichtungen','Медицинские учреждения','Centros sanitarios'),
      note:()=>L('Hospitals, clinics, doctors and pharmacies mapped in OpenStreetMap for the current view. Click any point for beds, speciality, operator and opening hours where the object carries them.',
                 '現在の表示範囲について OpenStreetMap に登録されている病院・診療所・薬局です。病床数・診療科・開設者・診療時間は、そのオブジェクトが持っている場合にのみ表示します。',
                 'Krankenhäuser, Kliniken, Ärzte und Apotheken aus OpenStreetMap für den aktuellen Ausschnitt.',
                 'Больницы, клиники, врачи и аптеки из OpenStreetMap для текущего вида.',
                 'Hospitales, clínicas, médicos y farmacias de OpenStreetMap para la vista actual.'),
      q:['nwr["amenity"~"^(hospital|clinic|doctors|pharmacy)$"]'],
      buckets:{
        hospital:['#ff453a',LA('Hospital','病院','Krankenhaus','Больница','Hospital')],
        clinic:['#ff9f0a',LA('Clinic','診療所','Klinik','Клиника','Clínica')],
        doctors:['#30d158',LA('Doctors','医院','Arztpraxis','Врачебный кабинет','Consultorio')],
        pharmacy:['#5e8bff',LA('Pharmacy','薬局','Apotheke','Аптека','Farmacia')],
        other:['#a0a6b0',LA('Other','その他','Sonstige','Прочее','Otros')] },
      kind:(t)=>{ const d=String(t['amenity']||'').toLowerCase();
        return ({hospital:'hospital',clinic:'clinic',doctors:'doctors',pharmacy:'pharmacy'})[d]||'other'; },
      fields:(t)=>[['beds',t['beds']||t['capacity:beds']||''],['speciality',t['healthcare:speciality']||''],
                   ['emergency',t['emergency']||''],['operator',t['operator']||''],['addr',_addr(t)],
                   ['hours',t['opening_hours']||''],['phone',t['phone']||t['contact:phone']||''],
                   ['web',t['website']||t['contact:website']||'']]
    },
    telecom:{
      id:'osmtelecom', row:'fac-dl-osmtelecom', zoom:7,
      name:()=>LA('Telecom & internet infrastructure','通信・インターネット基盤','Telekom- & Internet-Infrastruktur','Связь и интернет-инфраструктура','Infraestructura de telecomunicaciones'),
      note:()=>L('Internet exchanges, telephone exchanges, communication masts and towers mapped in OpenStreetMap for the current view — the physical plant the network actually runs on.',
                 '現在の表示範囲について OpenStreetMap に登録されているインターネットエクスチェンジ・電話交換局・通信鉄塔です。ネットワークが実際に載っている物理設備です。',
                 'Internet-Knoten, Vermittlungsstellen, Funkmasten und Türme aus OpenStreetMap für den aktuellen Ausschnitt.',
                 'Точки обмена трафиком, АТС, антенные мачты и башни из OpenStreetMap для текущего вида.',
                 'Puntos neutros, centrales telefónicas, mástiles y torres de comunicación de OpenStreetMap.'),
      q:['nwr["telecom"~"^(exchange|connection_point|data_center|central_office)$"]',
         'nwr["man_made"="communications_tower"]','nwr["tower:type"="communication"]'],
      buckets:{
        ix:['#af52de',LA('Internet exchange','インターネットエクスチェンジ','Internet-Knoten','Точка обмена трафиком','Punto neutro')],
        exchange:['#0a84ff',LA('Telephone exchange','電話交換局','Vermittlungsstelle','АТС','Central telefónica')],
        tower:['#ffd166',LA('Communication tower / mast','通信鉄塔・アンテナ塔','Funkturm / Mast','Башня / мачта связи','Torre / mástil')],
        other:['#a0a6b0',LA('Other','その他','Sonstige','Прочее','Otros')] },
      kind:(t)=>{ const d=String(t['telecom']||'').toLowerCase();
        if(/internet_exchange/.test(String(t['telecom:medium']||''))||/\bix\b|internet exchange/i.test(String(t['name']||''))) return 'ix';
        if(/exchange|central_office/.test(d)) return 'exchange';
        if(t['man_made']==='communications_tower'||t['tower:type']==='communication') return 'tower';
        return 'other'; },
      fields:(t)=>[['operator',t['operator']||t['owner']||''],['height',t['height']?(t['height']+' m'):''],
                   ['addr',_addr(t)],['web',t['website']||'']]
    },
    /* ══ (#R256) THE FIFTH AND SIXTH SETS — A NEW CATEGORY THAT IS NOT A CHOROPLETH ════════════════
       「追加すべきと思うレイヤーカテゴリはありますか？あれば作り…新レイヤー（国単位で塗るだけのやつじゃ
         なくて、モノホンのやつ。）」
       Energy and extraction was the largest subject this map had no shelf for: the only energy rows
       were the country-level energy MIX (a choropleth, and one the reader placed in 人口・経済 by
       name in #R254) and CO₂ in Climate. Where the electricity is actually MADE, and where the
       material comes out of the ground, were nowhere — and both are surveyed objects with their own
       tags, which is what the instruction asks for. Same engine, two more tag sets. */
    power:{
      id:'osmpower', row:'fac-dl-osmpower', zoom:6,
      name:()=>LA('Power plants & grid','発電所・送変電設備','Kraftwerke & Netz','Электростанции и сети','Centrales eléctricas y red'),
      note:()=>L('Power stations, substations, wind turbines and solar farms mapped in OpenStreetMap for the current view — where the electricity is actually generated and stepped up, not a national average. Click any point for its output, fuel and operator as tagged.',
                 '現在の表示範囲について OpenStreetMap に登録されている発電所・変電所・風力発電機・太陽光発電所です。国別平均ではなく、実際に発電・変電している場所そのものです。点をクリックすると出力・燃料・運営者が出ます。',
                 'Kraftwerke, Umspannwerke, Windräder und Solarparks aus OpenStreetMap für den aktuellen Ausschnitt.',
                 'Электростанции, подстанции, ветрогенераторы и солнечные парки из OpenStreetMap для текущего вида.',
                 'Centrales, subestaciones, aerogeneradores y plantas solares de OpenStreetMap para la vista actual.'),
      q:['nwr["power"="plant"]','nwr["power"="substation"]','nwr["power"="generator"]["generator:source"~"^(wind|solar|nuclear|hydro|geothermal)$"]'],
      buckets:{
        nuclear:['#af52de',LA('Nuclear','原子力','Kernkraft','АЭС','Nuclear')],
        fossil:['#ff9f0a',LA('Coal / oil / gas','石炭・石油・ガス','Kohle / Öl / Gas','Уголь / нефть / газ','Carbón / petróleo / gas')],
        hydro:['#0a84ff',LA('Hydro','水力','Wasserkraft','ГЭС','Hidroeléctrica')],
        wind:['#64d2ff',LA('Wind','風力','Wind','Ветер','Eólica')],
        solar:['#ffd60a',LA('Solar','太陽光','Solarenergie','Солнечная','Solar')],
        grid:['#8e8e93',LA('Substation','変電所','Umspannwerk','Подстанция','Subestación')],
        other:['#30d158',LA('Other / biomass','その他・バイオマス','Sonstige / Biomasse','Прочие / биомасса','Otras / biomasa')] },
      kind:(t)=>{ if(t['power']==='substation') return 'grid';
        const s=String(t['plant:source']||t['generator:source']||'').toLowerCase();
        if(/nuclear/.test(s)) return 'nuclear';
        if(/coal|oil|gas|diesel|fossil|waste/.test(s)) return 'fossil';
        if(/hydro|tidal|wave/.test(s)) return 'hydro';
        if(/wind/.test(s)) return 'wind';
        if(/solar|photovoltaic/.test(s)) return 'solar';
        return 'other'; },
      fields:(t)=>[['operator',t['operator']||t['owner']||''],
                   ['output',t['plant:output:electricity']||t['generator:output:electricity']||''],
                   ['fuel',t['plant:source']||t['generator:source']||''],
                   ['method',t['plant:method']||t['generator:method']||''],
                   ['voltage',t['voltage']?(String(t['voltage']).split(';')[0]+' V'):''],
                   ['start',t['start_date']||''],['addr',_addr(t)],['web',t['website']||'']]
    },
    extract:{
      id:'osmextract', row:'fac-dl-osmextract', zoom:7,
      name:()=>LA('Mines, quarries & wells','鉱山・採石場・油井','Bergbau, Steinbrüche & Bohrungen','Шахты, карьеры и скважины','Minas, canteras y pozos'),
      note:()=>L('Mines, quarries, mine shafts and oil or gas wells mapped in OpenStreetMap for the current view — the places raw material physically leaves the ground. Click any point for the resource and operator as tagged.',
                 '現在の表示範囲について OpenStreetMap に登録されている鉱山・採石場・立坑・油井／ガス井です。資源が実際に地面から出てくる場所そのものです。点をクリックすると資源名・運営者が出ます。',
                 'Bergwerke, Steinbrüche, Schächte sowie Öl- und Gasbohrungen aus OpenStreetMap für den aktuellen Ausschnitt.',
                 'Шахты, карьеры, стволы и нефтегазовые скважины из OpenStreetMap для текущего вида.',
                 'Minas, canteras, pozos mineros y pozos de petróleo o gas de OpenStreetMap para la vista actual.'),
      q:['nwr["landuse"="quarry"]','nwr["man_made"="mineshaft"]','nwr["man_made"="adit"]','nwr["industrial"="mine"]',
         'nwr["man_made"="petroleum_well"]','nwr["man_made"="water_well"]["pump"]'],
      buckets:{
        quarry:['#c9a227',LA('Quarry','採石場','Steinbruch','Карьер','Cantera')],
        mine:['#ff6b35',LA('Mine / shaft','鉱山・立坑','Bergwerk / Schacht','Шахта / ствол','Mina / pozo')],
        well:['#7d8590',LA('Oil or gas well','油井・ガス井','Öl- oder Gasbohrung','Нефтегазовая скважина','Pozo de petróleo o gas')],
        other:['#a0a6b0',LA('Other','その他','Sonstige','Прочее','Otros')] },
      kind:(t)=>{ if(t['man_made']==='petroleum_well') return 'well';
        if(t['landuse']==='quarry') return 'quarry';
        if(t['man_made']==='mineshaft'||t['man_made']==='adit'||t['industrial']==='mine') return 'mine';
        return 'other'; },
      fields:(t)=>[['operator',t['operator']||t['owner']||''],
                   ['resource',t['resource']||t['mineral']||t['raw_material']||''],
                   ['start',t['start_date']||''],['addr',_addr(t)],['web',t['website']||'']]
    }
  };
  function _addr(t){ const a=[t['addr:housenumber'],t['addr:street'],t['addr:city']].filter(Boolean).join(' ');
    return a||t['addr:full']||''; }
  /* the labels for the card's rows — one table, five languages, keyed by the field name above */
  const FLD={
    country:()=>L('Represents','派遣国','Entsendestaat','Представляет','Representa'),
    operator:()=>L('Operator','運営者','Betreiber','Оператор','Operador'),
    branch:()=>L('Service','所属','Teilstreitkraft','Род войск','Servicio'),
    addr:()=>L('Address','所在地','Adresse','Адрес','Dirección'),
    phone:()=>L('Phone','電話','Telefon','Телефон','Teléfono'),
    hours:()=>L('Opening hours','診療時間','Öffnungszeiten','Часы работы','Horario'),
    beds:()=>L('Beds','病床数','Betten','Койки','Camas'),
    speciality:()=>L('Speciality','診療科','Fachrichtung','Специализация','Especialidad'),
    emergency:()=>L('Emergency','救急','Notaufnahme','Неотложная помощь','Urgencias'),
    height:()=>L('Height','高さ','Höhe','Высота','Altura'),
    /* (#R256) the energy / extraction fields */
    output:()=>L('Output','出力','Leistung','Мощность','Potencia'),
    fuel:()=>L('Fuel / source','燃料・エネルギー源','Brennstoff / Quelle','Топливо / источник','Combustible / fuente'),
    method:()=>L('Method','方式','Verfahren','Способ','Método'),
    voltage:()=>L('Voltage','電圧','Spannung','Напряжение','Tensión'),
    start:()=>L('In service','稼働開始','In Betrieb','В эксплуатации','En servicio'),
    resource:()=>L('Resource','資源','Rohstoff','Ресурс','Recurso'),
    web:()=>L('Website','ウェブサイト','Website','Сайт','Sitio web')
  };

  /* ─── Overpass, raced across mirrors — the shape js/atlas-sources.js and js/datacenters.js use ─── */
  const EPS=['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter','https://overpass.private.coffee/api/interpreter'];
  async function overpass(ql){
    const ctls=[];
    const one=ep=>new Promise(res=>{ let c=null; try{ c=new AbortController(); ctls.push(c); }catch(_){}
      const tm=setTimeout(()=>{ try{ c&&c.abort(); }catch(_){} },26000);
      fetch(ep,Object.assign({method:'POST',body:'data='+encodeURIComponent(ql)},c?{signal:c.signal}:{}))
        .then(r=>r.ok?r.json():null).then(j=>{ clearTimeout(tm); res((j&&Array.isArray(j.elements))?j.elements:null); })
        .catch(()=>{ clearTimeout(tm); res(null); }); });
    return await new Promise(res=>{ let pending=EPS.length, done=false;
      EPS.forEach(ep=>{ one(ep).then(x=>{ if(done) return; if(x){ done=true; ctls.forEach(c=>{ try{ c.abort(); }catch(_){} }); res(x); }
        else if(--pending<=0) res(null); }); }); });
  }

  /* ─── one layer, built from one set ───────────────────────────────────────────────────────────── */
  function build(key){
    const SET=SETS[key];
    const SRC='fac-'+key+'-src', PT='fac-'+key+'-pt', LBL='fac-'+key+'-lbl';
    const cache=new Map();
    let on=false, wired=false, busy=false, lastKey='', count=0;
    const col=(k)=>((SET.buckets[k]||SET.buckets.other)[0]);
    const before=()=>{ try{ return GE().layers.has('tool-poly')?'tool-poly':undefined; }catch(_){ return undefined; } };

    function ensure(){ if(GE().layers.hasSource(SRC)) return true; if(!_canDraw()) return false;
      try{
        GE().layers.addSource(SRC,{type:'geojson',data:{type:'FeatureCollection',features:[]},
          attribution:'© OpenStreetMap contributors (ODbL)'});
        GE().layers.add({id:PT,type:'circle',source:SRC,layout:{visibility:'none'},paint:{
          'circle-radius':['interpolate',['linear'],['zoom'],5,3,9,5.5,14,9],
          'circle-color':['coalesce',['get','col'],'#a0a6b0'],
          'circle-stroke-color':'rgba(255,255,255,0.8)','circle-stroke-width':0.9,'circle-opacity':0.92}},before());
        GE().layers.add({id:LBL,type:'symbol',source:SRC,minzoom:11,layout:{visibility:'none',
          'text-field':['get','n'],'text-size':window.IntMapLabelScale.sub(0.8),'text-offset':[0,1.0],
          'text-anchor':'top','text-font':['literal',['Noto Sans Regular']],'text-max-width':15,'text-optional':true},
          paint:{'text-color':'#e6ecf6','text-halo-color':'rgba(0,0,0,0.8)','text-halo-width':1.2}},before());
        return true;
      }catch(_){ return false; } }
    function setVis(v){ [PT,LBL].forEach(id=>{ try{ if(GE().layers.has(id)) GE().layers.setLayout(id,'visibility',v?'visible':'none'); }catch(_){} }); }

    async function refresh(){
      if(!on||busy) return;
      let z,b; try{ z=GE().camera.getZoom(); b=GE().camera.getBounds(); }catch(_){ return; }
      if(!b) return;
      if(z<SET.zoom){ try{ GE().layers.setSourceData(SRC,{type:'FeatureCollection',features:[]}); }catch(_){}
        lastKey=''; count=0; legend(); return; }
      const bbox=[Math.max(-180,b.getWest()),Math.max(-85,b.getSouth()),Math.min(180,b.getEast()),Math.min(85,b.getNorth())];
      const ck=bbox.map(v=>v.toFixed(2)).join(',');
      if(ck===lastKey) return;
      lastKey=ck; busy=true;
      try{
        let feats=cache.get(ck);
        if(!feats){
          const bb='('+bbox[1].toFixed(4)+','+bbox[0].toFixed(4)+','+bbox[3].toFixed(4)+','+bbox[2].toFixed(4)+')';
          const ql='[out:json][timeout:30];('+SET.q.map(q=>q+bb+';').join('')+');out center 1200;';
          const els=await overpass(ql);
          feats=[];
          (els||[]).forEach(e=>{ const t=e.tags||{};
            const lon=(e.lon!=null?e.lon:(e.center&&e.center.lon)), lat=(e.lat!=null?e.lat:(e.center&&e.center.lat));
            if(lon==null||lat==null) return;
            const k=SET.kind(t);
            feats.push({type:'Feature',geometry:{type:'Point',coordinates:[+lon,+lat]},
              properties:{ n:t.name||t['name:en']||(SET.buckets[k]||SET.buckets.other)[1][0], k, col:col(k),
                osmId:e.type+'/'+e.id, tags:JSON.stringify(t).slice(0,3000) }}); });
          cache.set(ck,feats); if(cache.size>20) cache.delete(cache.keys().next().value);
        }
        count=feats.length;
        if(on){ GE().layers.setSourceData(SRC,{type:'FeatureCollection',features:feats}); legend(); }
      }catch(_){ lastKey=''; }
      busy=false; }

    /* ── the detail card ────────────────────────────────────────────────────────────────────────
       A `.country-popup`, placed explicitly — ⚠ (#R255) that shell is `position:absolute` with no
       `left`/`top` of its own, so an element appended to <body> without them lands at its static
       position: below the whole document, off the bottom of the window. js/datacenters.js shipped
       exactly that defect and it read as 「押しても詳細が出ない」. */
    let card=null;
    function closeCard(){ try{ if(card&&card.parentNode) card.parentNode.removeChild(card); }catch(_){} card=null; }
    function row(k,v){ return v?('<div style="display:flex;gap:10px;justify-content:space-between;font-size:12.5px;padding:4px 0;border-bottom:1px solid rgba(128,128,128,0.14);">'
      +'<span style="color:var(--text-muted);flex:0 0 auto;">'+S(k)+'</span><b style="color:var(--text-main);text-align:right;">'+v+'</b></div>'):''; }
    function openCard(p,lngLat){
      closeCard();
      let tags={}; try{ tags=JSON.parse(p.tags||'{}'); }catch(_){}
      const bucket=SET.buckets[p.k]||SET.buckets.other;
      const el=document.createElement('div'); el.className='country-popup'; el.id='fac-detail';
      el.style.display='block';
      const coord=(+lngLat.lat).toFixed(5)+'°, '+(+lngLat.lng).toFixed(5)+'°';
      const rows=SET.fields(tags).map(([f,v])=>{
        if(!v) return '';
        if(f==='web') return row(FLD.web(),'<a href="'+U(v)+'" target="_blank" rel="noopener" style="color:var(--primary-color);">'+S(String(v).replace(/^https?:\/\//,'').slice(0,38))+'</a>');
        return row((FLD[f]||FLD.operator)(),S(v)); }).join('');
      el.innerHTML='<button class="cp-close" aria-label="close" style="position:absolute;top:10px;right:10px;width:28px;height:28px;border:none;border-radius:50%;background:var(--input-bg);color:var(--text-main);font-size:15px;cursor:pointer;">✕</button>'
        +'<div style="padding:16px 18px 18px;">'
        +'<div class="fac-drag" style="display:flex;align-items:center;gap:9px;margin-bottom:3px;padding-right:32px;cursor:move;user-select:none;">'
        +'<span style="width:12px;height:12px;border-radius:7px;flex:none;background:'+S(bucket[0])+';"></span>'
        +'<span style="font-weight:700;font-size:15px;color:var(--text-main);">'+S(p.n)+'</span></div>'
        +'<div style="font-size:11.5px;color:var(--text-muted);margin-bottom:10px;">'+S(L.arr(bucket[1]))+'</div>'
        +rows
        +row(L('Coordinates','座標','Koordinaten','Координаты','Coordenadas'),S(coord))
        +row(L('OSM object','OSMオブジェクト','OSM-Objekt','Объект OSM','Objeto OSM'),
             '<a href="'+U('https://www.openstreetmap.org/'+p.osmId)+'" target="_blank" rel="noopener" style="color:var(--primary-color);">'+S(p.osmId)+'</a>')
        +'<div style="margin-top:11px;font-size:9.5px;color:var(--text-muted);line-height:1.55;">'
        +S(L('Surveyed in OpenStreetMap. Every field above is that object’s own tag; nothing is inferred, and a field the object does not carry is left out rather than estimated.',
             'OpenStreetMap の実測データです。上の項目はそのオブジェクト自身のタグで、推測は含みません。タグの無い項目は推定せず省略しています。',
             'In OpenStreetMap erfasst. Alle Felder stammen aus den Tags dieses Objekts; nichts wird geschätzt.',
             'Данные OpenStreetMap. Все поля — теги самого объекта; ничего не додумано.',
             'Registrado en OpenStreetMap. Todos los campos son etiquetas del propio objeto; nada se estima.'))
        +'</div></div>';
      document.body.appendChild(el); card=el;
      try{
        const vw=window.innerWidth||1200, vh=window.innerHeight||800, w=el.offsetWidth||380, h=el.offsetHeight||300;
        const rs=(()=>{ try{ const s2=document.getElementById('layer-sidebar-r');
          return (s2&&document.body.classList.contains('lsr-open'))?s2.getBoundingClientRect().width:0; }catch(_){ return 0; } })();
        /* ⚠ `project()` is CANVAS-relative (#R252); the card is placed in PAGE coordinates */
        const px=(()=>{ try{ const q=GE().coords.project({lng:+lngLat.lng,lat:+lngLat.lat});
          const r2=GE().render.canvas().getBoundingClientRect(); return r2.left+q.x; }catch(_){ return null; } })();
        let left=(px!=null)?(px+18):(vw-rs-w-24);
        left=Math.max(12,Math.min(left,vw-rs-w-12));
        el.style.left=Math.round(Math.max(12,left))+'px';
        el.style.top=Math.round(Math.max(12,Math.min(96,vh-h-16)))+'px';
      }catch(_){ el.style.left='16px'; el.style.top='96px'; }
      try{ HOST.makeDraggable&&HOST.makeDraggable(el,el.querySelector('.fac-drag')); }catch(_){}
      try{ el.querySelector('.cp-close').onclick=closeCard; }catch(_){}
    }

    /* ── the legend: the colour key, the count, and what the layer is ───────────────────────────── */
    function legend(){
      if(!on){ try{ const e=document.getElementById('data-legend-'+SET.id); if(e) e.style.display='none'; }catch(_){} return; }
      let el=null;
      try{ el=window._registerLayerOpacity&&window._registerLayerOpacity(SET.id,
        (()=>{ const n=L.arr(SET.name()); return [n,n,n,n,n]; })(),
        [PT,LBL], SET.row); }catch(_){}
      if(!el) return;
      el.style.display='block';
      let b=el.querySelector('.fac-body');
      if(!b){ b=document.createElement('div'); b.className='fac-body';
        const h=el.querySelector('h4'); if(h&&h.parentNode===el) el.insertBefore(b,h.nextSibling); else el.appendChild(b); }
      let z=0; try{ z=GE().camera.getZoom(); }catch(_){}
      const keys=Object.keys(SET.buckets).map(k=>'<div style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text-main);margin-top:3px;">'
        +'<span style="width:10px;height:10px;border-radius:6px;flex:none;background:'+S(SET.buckets[k][0])+';"></span>'
        +S(L.arr(SET.buckets[k][1]))+'</div>').join('');
      const tooFar=(z<SET.zoom);
      b.innerHTML=keys
        +'<div style="font-size:10.5px;color:var(--text-muted);margin-top:7px;">'
        +(tooFar?S(L('Zoom in to load this view','この範囲を読み込むにはズームしてください','Zum Laden hineinzoomen','Приблизьте, чтобы загрузить','Acérquese para cargar'))
                :S(count+' '+L('objects in view','件（表示範囲内）','Objekte im Ausschnitt','объектов в виде','objetos en la vista')))
        +'</div>'
        +'<div style="font-size:9.5px;color:var(--text-muted);line-height:1.5;margin-top:6px;">'+S(SET.note())+' · OpenStreetMap (ODbL)</div>';
    }

    function wire(){ if(wired) return; wired=true;
      GE().events.onLayer('click',PT,e=>{ const f=e.features&&e.features[0]; if(!f) return;
        openCard(f.properties||{}, {lng:f.geometry.coordinates[0], lat:f.geometry.coordinates[1]}); });
      GE().events.onLayer('mouseenter',PT,()=>{ try{ GE().render.canvas().style.cursor='pointer'; }catch(_){} });
      GE().events.onLayer('mouseleave',PT,()=>{ try{ GE().render.canvas().style.cursor=''; }catch(_){} });
      try{ GE().events.on('moveend',()=>{ if(on) setTimeout(()=>refresh(),250); }); }catch(_){}
      window.addEventListener('intmap-lang',()=>{ if(on) legend(); });
    }
    function toggle(v){ on=!!v;
      if(!on){ setVis(false); closeCard(); legend(); return; }
      const a=()=>{ if(!ensure()){ try{ GE().events.once('idle',a); }catch(_){} return; }
        wire(); setVis(true); legend(); lastKey=''; refresh(); };
      a(); }
    return { toggle, refresh, count:()=>count, id:SET.id, name:SET.name, buckets:()=>SET.buckets };
  }

  const API={};
  Object.keys(SETS).forEach(k=>{ API[k]=build(k); });

  /* ─── the four rows in the layer list ─────────────────────────────────────────────────────────
     Appended to `#layer-dropdown`, which is this app's single source of truth for what layers exist
     (#R70): the tile sidebar, the phone sheet, Active layers, the share link and Atlas all read from
     it, so a row created here is a layer everywhere without any of them being told. The ids are
     `fac-dl-<id>`, and js/data-layers.js's `rowFor()` knows that prefix. */
  const SW={diplo:'#5ac8fa',mil:'#ff453a',health:'#30d158',telecom:'#af52de',power:'#ffd60a',extract:'#c9a227'};
  function buildRows(){
    const dd=document.getElementById('layer-dropdown'); if(!dd){ setTimeout(buildRows,400); return; }
    Object.keys(SETS).forEach(k=>{
      const id=SETS[k].row;
      let cb=document.getElementById(id);
      if(!cb){ const w=document.createElement('div'); w.className='lyr-row';
        w.innerHTML='<label class="layer-option"><input type="checkbox" id="'+id+'"> <span class="lyr-sw" style="background:'+SW[k]+'"></span> <span id="'+id+'-lbl"></span></label>';
        dd.appendChild(w); cb=w.querySelector('input'); }
      const lab=document.getElementById(id+'-lbl');
      if(lab) lab.textContent=L.arr(SETS[k].name());
      if(cb.__facWired) return; cb.__facWired=true;
      cb.addEventListener('change',e=>{ const r=e.target.closest('.lyr-row'); if(r) r.classList.toggle('on',e.target.checked);
        try{ API[k].toggle(e.target.checked); }catch(err){ console.warn('facilities toggle',k,err); } });
    });
    try{ window.reorganizeLayerPanel&&window.reorganizeLayerPanel(); }catch(_){}
  }
  if(document.readyState!=='loading') setTimeout(buildRows,0); else document.addEventListener('DOMContentLoaded',buildRows);
  window.addEventListener('intmap-lang',()=>setTimeout(buildRows,20));

  window.IntMapFacilities=API;
  return API;
};
