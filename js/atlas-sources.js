/* ============================================================================
 *  IntMap · Atlas — external evidence sources — leaders, live news, POI catalogues  (#R199)
 * ----------------------------------------------------------------------------
 *  Every network source Atlas quotes: Wikidata heads of state/government, GDELT and Google-News
 *  article fetches, Wikipedia summaries, the Overpass POI selector table (#R69) and the Wikidata POI
 *  query (#R80). Pure fetch-and-normalise — no drawing — so nothing here can touch the map by accident.
 *
 *  Lifted out of js/atlas-console.js's 178-line block verbatim (#R199). It is a REAL ES module:
 *  nothing registers it on window.IntMapModules and nothing depends on load order — js/atlas-console.js
 *  names it in an `import`, so the bundler resolves the binding and orders the graph.
 *
 *  Everything the block used to read from the console's closure arrives through `CTX` (and the app's
 *  live host through `HOST`), rebound below under the ORIGINAL names so the body stays byte-identical.
 *  tests/r199-checks.test.mjs re-derives that byte-identity from the two files on every commit.
 * ==========================================================================*/
export function makeAtlasSources(HOST, CTX) {
  const _fetchJSON=CTX._fetchJSON, askAIJSON=CTX.askAIJSON, countryStats=CTX.countryStats, nm=CTX.nm;
    async function _leaderData(codes){ try{
      const iso=(codes||[]).filter(Boolean).slice(0,4); if(!iso.length) return null;
      const langQ=(HOST.lang==='jp'?'ja':HOST.lang)+',en';
      const q='SELECT ?iso ?hogLabel ?hosLabel WHERE { VALUES ?iso {'+iso.map(c=>' "'+String(c).replace(/[^A-Z]/g,'')+'"').join('')+' } ?c wdt:P298 ?iso. OPTIONAL{ ?c wdt:P6 ?hog. } OPTIONAL{ ?c wdt:P35 ?hos. } SERVICE wikibase:label { bd:serviceParam wikibase:language "'+langQ+'". } }';
      const ctl=new AbortController(); const tt=setTimeout(()=>ctl.abort(),9000);
      let j=null; try{ const r=await fetch('https://query.wikidata.org/sparql?format=json&query='+encodeURIComponent(q),{headers:{Accept:'application/sparql-results+json'},signal:ctl.signal}); j=await r.json(); } finally{ clearTimeout(tt); }
      const rows=(j&&j.results&&j.results.bindings)||[]; if(!rows.length) return null;
      const by={}; rows.forEach(b=>{ const k=b.iso&&b.iso.value; if(!k) return; const e=by[k]=by[k]||{hog:new Set(),hos:new Set()};
        if(b.hogLabel&&b.hogLabel.value&&!/^Q\d+$/.test(b.hogLabel.value)) e.hog.add(b.hogLabel.value);
        if(b.hosLabel&&b.hosLabel.value&&!/^Q\d+$/.test(b.hosLabel.value)) e.hos.add(b.hosLabel.value); });
      const out=[]; for(const k in by){ const e=by[k]; const nmC=(countryStats[k]&&nm(countryStats[k]))||k; const seg=[];
        if(e.hog.size) seg.push('head of government (PM/chancellor): '+Array.from(e.hog).join(' / '));
        if(e.hos.size) seg.push('head of state (president/monarch): '+Array.from(e.hos).join(' / '));
        if(seg.length) out.push('- '+nmC+': '+seg.join(' · ')); }
      return out.length?out.join('\n'):null; }catch(_){ return null; } }
    /* ---- (#R62) LIVE WEB SEARCH ("ネット検索を積極的に活用し、内部情報にこだわらない") — GDELT DOC 2.0 (global
       news search across ~all outlets, last 72 h, CORS-open) + Wikipedia REST summaries. This is what fixes the
       "provided data is insufficient to describe current events around Taiwan" class of reply: the loaded RSS
       feed is no longer the only news source. ---- */
    async function _gdeltNews(q2,sink,timespan){ const query=String(q2||'').trim(); if(!query) return null;   /* (#R113d) optional timespan (default 3d) so a brief can widen the window */
      const j=await _fetchJSON('https://api.gdeltproject.org/api/v2/doc/doc?query='+encodeURIComponent(query)+'&mode=artlist&maxrecords=14&format=json&timespan='+encodeURIComponent(timespan||'3d')+'&sort=hybridrel');
      const arts=j&&j.articles; if(!Array.isArray(arts)||!arts.length) return null;
      const seen=new Set(); const rows2=[];
      for(const a2 of arts){ const t2=String(a2.title||'').trim(); if(!t2||seen.has(t2)) continue; seen.add(t2);
        let when=''; try{ const s2=String(a2.seendate||''); if(s2.length>=8) when=s2.slice(0,4)+'-'+s2.slice(4,6)+'-'+s2.slice(6,8); }catch(_){}
        try{ if(sink&&a2.url) sink.push({url:a2.url,title:t2,src:(a2.domain||''),date:when,dateType:'gdelt_seen_date',origin:'gdelt'}); }catch(_){}   /* (#R79) real URL → source card; (#R113) date → evidence record; (#R131) seendate is the GDELT SEEN date, not the event date */
        rows2.push('- '+t2.slice(0,150)+' ['+(a2.domain||'?')+(when?(' · '+when):'')+']'); if(rows2.length>=12) break; }
      return rows2.length?rows2.join('\n'):null; }
    /* (#R64) second live-news engine: Google News RSS search (multi-language, topic-aware). GDELT alone failed
       for non-English topics ("取得不可: ライブWebニュース" in the Greece report) — the ladder is now
       GDELT (EN topic) → Google News RSS (user language + English). Fetched via the CORS-proxy ladder. */
    async function _fetchText(url){ const PROX=[x=>x, x=>'https://corsproxy.io/?url='+encodeURIComponent(x), x=>'https://api.allorigins.win/raw?url='+encodeURIComponent(x)];
      for(const p of PROX){ try{ const c=('AbortController' in window)?new AbortController():null; const t2=c?setTimeout(()=>{ try{ c.abort(); }catch(_){} },9000):null;
        const r=await fetch(p(url),c?{signal:c.signal}:undefined); if(t2) clearTimeout(t2); if(r&&r.ok){ const tx=await r.text(); if(tx&&tx.length>40) return tx; } }catch(_){} }
      return null; }
    async function _gnewsNews(q2,sink){ const query=String(q2||'').trim(); if(!query) return null;
      const LOCS={jp:['ja','JP','JP:ja'],de:['de','DE','DE:de'],ru:['ru','RU','RU:ru'],es:['es','ES','ES:es']};
      const locs=[LOCS[HOST.lang]||['en','US','US:en']]; if(HOST.lang!=='en'&&LOCS[HOST.lang]) locs.push(['en','US','US:en']);
      for(const loc of locs){ try{
        const xml=await _fetchText('https://news.google.com/rss/search?q='+encodeURIComponent(query)+'&hl='+loc[0]+'&gl='+loc[1]+'&ceid='+encodeURIComponent(loc[2]));
        if(!xml) continue;
        const doc=new DOMParser().parseFromString(xml,'text/xml'); if(doc.querySelector('parsererror')) continue;
        const items=Array.prototype.slice.call(doc.querySelectorAll('item'),0,12); const rows2=[]; const seen=new Set();
        for(const it of items){ const t2=(it.querySelector('title')&&it.querySelector('title').textContent||'').trim(); if(!t2||seen.has(t2)) continue; seen.add(t2);
          const src=(it.querySelector('source')&&it.querySelector('source').textContent)||''; let when='';
          try{ const d=it.querySelector('pubDate')&&it.querySelector('pubDate').textContent; if(d) when=new Date(d).toISOString().slice(0,10); }catch(_){}
          try{ if(sink){ const lk=(it.querySelector('link')&&it.querySelector('link').textContent||'').trim(); if(lk) sink.push({url:lk,title:t2,src:(src||''),date:when,dateType:'publication_date',origin:'gnews'}); } }catch(_){}   /* (#R79) real URL → source card; (#R113) date → evidence record; (#R131) pubDate is the article date, not the event date */
          rows2.push('- '+t2.slice(0,150)+' ['+(src||'?')+(when?(' · '+when):'')+']'); }
        if(rows2.length) return rows2.join('\n'); }catch(_){} }
      return null; }
    async function _wikiSummary(topic){ const t2=String(topic||'').trim(); if(!t2) return null;
      const langW=({jp:'ja',de:'de',ru:'ru',es:'es'})[HOST.lang]||'en';
      let j=await _fetchJSON('https://'+langW+'.wikipedia.org/api/rest_v1/page/summary/'+encodeURIComponent(t2.replace(/ /g,'_')));
      if(!(j&&j.extract)&&langW!=='en') j=await _fetchJSON('https://en.wikipedia.org/api/rest_v1/page/summary/'+encodeURIComponent(t2.replace(/ /g,'_')));
      return (j&&j.extract)?String(j.extract).slice(0,900):null; }
    /* ---- (#R62) POI mapping ("○○にある石油施設を表示して" → REAL facilities on the map, not a point search):
       natural-language kind → OpenStreetMap Overpass selectors → pins + labels + click popups. ---- */
    const POI_KINDS=[
      [/oil|petrol|refin|石油|製油|原油|erdöl|raffiner|нефт|petróle|refiner/i,['nwr["man_made"="petroleum_well"]','nwr["industrial"~"oil|refinery|petroleum",i]','nwr["man_made"="works"]["product"~"oil|petroleum|fuel",i]','nwr["man_made"="storage_tank"]["content"~"oil|fuel",i]','nwr["landuse"="industrial"]["name"~"oil|petrol|refiner|石油",i]']],
      [/\blng\b|natural gas|gas plant|天然ガス|ガス施設|erdgas|газов|gas natural/i,['nwr["industrial"~"gas|lng",i]','nwr["man_made"="gasometer"]','nwr["man_made"="works"]["product"~"gas|lng",i]']],
      [/nuclear|原子力|原発|kernkraft|atomkraft|аэс|атомн|nuclear/i,['nwr["power"="plant"]["plant:source"="nuclear"]']],
      [/wind farm|wind power|風力|windkraft|windpark|ветро|eólic/i,['nwr["power"="plant"]["plant:source"="wind"]']],
      [/solar|太陽光|メガソーラー|solarpark|солнечн/i,['nwr["power"="plant"]["plant:source"="solar"]']],
      [/power (plant|station)|発電所|kraftwerk|электростанц|central eléctrica|centrales/i,['nwr["power"="plant"]']],
      [/dam|ダム|staudamm|плотин|presa/i,['nwr["waterway"="dam"]']],
      [/airport|airfield|空港|飛行場|flughafen|аэропорт|aeropuerto/i,['nwr["aeroway"="aerodrome"]']],
      [/port|harbou?r|港湾|港|hafen|порт|puerto/i,['nwr["landuse"="harbour"]','nwr["harbour"="yes"]','nwr["industrial"="port"]']],
      [/military|army base|軍事|基地|駐屯地|militär|военн|militar/i,['nwr["landuse"="military"]','nwr["military"="base"]','nwr["military"="airfield"]']],
      [/mine|mining|鉱山|炭鉱|bergwerk|шахт|рудник|mina/i,['nwr["landuse"="quarry"]','nwr["man_made"="mineshaft"]','nwr["industrial"="mine"]']],
      [/steel|製鉄|stahlwerk|сталелит|acería|acero/i,['nwr["man_made"="works"]["product"~"steel|iron",i]','nwr["industrial"~"steel",i]']],
      [/factor(y|ies)|works|plant\b|工場|fabrik|завод|fábrica/i,['nwr["man_made"="works"]']],
      [/hospital|病院|krankenhaus|больниц|госпитал|hospital/i,['nwr["amenity"="hospital"]']],
      [/universit|大学|университет|universidad/i,['nwr["amenity"="university"]']],
      [/stadium|スタジアム|競技場|stadion|стадион|estadio/i,['nwr["leisure"="stadium"]']],
      [/prison|刑務所|gefängnis|тюрьм|prisión|cárcel/i,['nwr["amenity"="prison"]']],
      [/lighthouse|灯台|leuchtturm|маяк|faro/i,['nwr["man_made"="lighthouse"]']],
      [/embass|大使館|botschaft|посольств|embajada/i,['nwr["office"="diplomatic"]']],
      [/train station|railway station|駅|bahnhof|вокзал|estación/i,['nwr["railway"="station"]']],
      [/desalination|淡水化|entsalzung|опреснит|desalinizadora/i,['nwr["man_made"="works"]["product"~"water",i]','nwr["name"~"desalination|淡水化",i]']],
      [/data ?cent(er|re)|データセンター|rechenzentrum|дата-центр|centro de datos/i,['nwr["telecom"="data_center"]','nwr["man_made"="data_center"]','nwr["building"="data_center"]']]
    ];
    function poiSelectors(kindStr){ const s2=String(kindStr||''); for(const k of POI_KINDS){ if(k[0].test(s2)) return {sel:k[1],named:true}; }
      const safe=s2.replace(/["\\]/g,'').trim(); if(!safe) return null; return {sel:['nwr["name"~"'+safe+'",i]'],named:false}; }
    const _OP_EPS=['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter','https://overpass.private.coffee/api/interpreter'];
    async function overpassPOIs(kindStr,box,lite,areaRel){ const ps=poiSelectors(kindStr); if(!ps) return null;
      /* (#R64) whole-admin-area coverage ("地点が一部地域だけ"): when the place resolved to a real OSM admin
         relation (a country/state), query by AREA — every tagged facility in the whole territory, not a clamped
         bbox slice — and return up to 600 features instead of 90. */
      const useArea=!!areaRel;
      const bb=useArea?'(area.__a)':'('+(+box[0][1]).toFixed(3)+','+(+box[0][0]).toFixed(3)+','+(+box[1][1]).toFixed(3)+','+(+box[1][0]).toFixed(3)+')';
      /* (#R63) lite retry: fewer selectors + longer server timeout — big-country unions were 504ing ("機能してない") */
      const sels=lite?ps.sel.slice(0,2):ps.sel;
      const q2='[out:json][timeout:'+(lite?60:25)+'];'+(useArea?('area('+(3600000000+(+areaRel))+')->.__a;'):'')+'('+sels.map(s2=>s2+bb+';').join('')+');out center 600;';
      /* (#R63) RACE the mirrors in parallel with a hard client-side abort — the old sequential ladder could sit
         silent for minutes on a big area (the reported "機能してない"). First good answer wins, the rest abort. */
      const ctls=[]; const capMs=lite?65000:28000;
      const tryEp=ep=>new Promise(res=>{ const c=('AbortController' in window)?new AbortController():null; if(c) ctls.push(c);
        const tm=setTimeout(()=>{ try{ c&&c.abort(); }catch(_){} },capMs);
        fetch(ep,c?{method:'POST',body:'data='+encodeURIComponent(q2),signal:c.signal}:{method:'POST',body:'data='+encodeURIComponent(q2)})
          .then(r=>r.ok?r.json():null).then(j2=>{ clearTimeout(tm); res((j2&&Array.isArray(j2.elements))?j2:null); })
          .catch(()=>{ clearTimeout(tm); res(null); }); });
      const j=await new Promise(res=>{ let pending=_OP_EPS.length, done=false;
        _OP_EPS.forEach(ep=>{ tryEp(ep).then(x=>{ if(done) return; if(x){ done=true; ctls.forEach(c=>{ try{ c.abort(); }catch(_){} }); res(x); } else if(--pending<=0) res(null); }); }); });
      if(!j||!Array.isArray(j.elements)) return null;
      const out=[],seen=new Set();
      for(const el of j.elements){ const lat=(el.lat!=null)?el.lat:(el.center&&el.center.lat), lon=(el.lon!=null)?el.lon:(el.center&&el.center.lon); if(lat==null||lon==null) continue;
        const t2=el.tags||{}; const nm2=t2.name||t2['name:en']||t2.operator||''; const key=(nm2||'?')+'|'+(+lat).toFixed(3)+'|'+(+lon).toFixed(3); if(seen.has(key)) continue; seen.add(key);
        /* (#R72) keep the OSM wikipedia/wikidata/website tags so the pin popup can offer a real detail link */
        out.push({lng:+lon,lat:+lat,name:nm2,kind:t2.man_made||t2.industrial||t2.power||t2.amenity||t2.aeroway||t2.military||t2.landuse||t2.leisure||t2.railway||'',
          wiki:t2.wikipedia||'',wd:t2.wikidata||'',web:t2.website||t2['contact:website']||''}); if(out.length>=600) break; }
      out._truncated=(j.elements.length>=600||out.length>=600);
      return out; }
    /* (#R63) AI fallback for facilities OpenStreetMap doesn't tag ("ネット検索等から地図にマッピング"): a
       strict-JSON list of REAL notable facilities with best-estimate coordinates, clamped to the search box and
       clearly labelled as AI-estimated in the reply. */
    async function aiFacilities(kindStr,placeName,box){ let out=null;
      try{ const j=await askAIJSON('Facility type: "'+kindStr+'"\nArea: '+(placeName||'the bounding box below')+'\nBounding box (lng/lat): W '+(+box[0][0]).toFixed(2)+', S '+(+box[0][1]).toFixed(2)+', E '+(+box[1][0]).toFixed(2)+', N '+(+box[1][1]).toFixed(2),
        'You output ONLY strict JSON (no prose). List REAL, notable facilities of the requested type inside the given area: {"found":[{"name":str,"lng":num,"lat":num},...]} up to 25 entries. Coordinates must be your best real estimate INSIDE the bounding box. Skip anything you are not reasonably sure actually exists — an empty list is better than an invented site. If you know none, return {"found":[]}.');
        if(j&&Array.isArray(j.found)){ out=j.found.filter(f=>f&&f.name&&isFinite(+f.lng)&&isFinite(+f.lat)&&+f.lng>=+box[0][0]-0.5&&+f.lng<=+box[1][0]+0.5&&+f.lat>=+box[0][1]-0.5&&+f.lat<=+box[1][1]+0.5).map(f=>({lng:+f.lng,lat:+f.lat,name:String(f.name).slice(0,80),kind:'AI'})).slice(0,25); } }catch(_){}
      return out; }
    /* (#R69) SECOND independent facility source ("なんでもかんでもOpen Street Mapで済ませようとするな"):
       Wikidata. Curated encyclopedic entities with verified coordinates — a genuinely different dataset from
       OSM's crowd-tagged geometry. Country searches filter by ISO3 (P17 country whose P298 = the code, so no
       QID lookup round-trip); everything else uses the search bbox. Runs in PARALLEL with Overpass and the
       results are MERGED (name/proximity dedupe) with per-source counts in the reply so the basis is explicit.
       QIDs verified live against wbsearchentities + query.wikidata.org (2026-07). */
    const WD_KINDS=[
      [/oil|petrol|refin|石油|製油|原油|erdöl|raffiner|нефт|petróle|refiner/i,['Q12353044']],                    /* oil refinery */
      [/nuclear|原子力|原発|kernkraft|atomkraft|аэс|атомн/i,['Q134447']],                                        /* nuclear power plant */
      [/wind farm|wind power|風力|windkraft|windpark|ветро|eólic/i,['Q194356']],                                 /* wind farm */
      [/solar|太陽光|メガソーラー|solarpark|солнечн/i,['Q2298412']],                                             /* solar power plant */
      [/power (plant|station)|発電所|kraftwerk|электростанц|central eléctrica|centrales/i,['Q159719','Q134447','Q194356','Q2298412']],
      [/dam|ダム|staudamm|плотин|presa/i,['Q12323']],
      [/airport|airfield|空港|飛行場|flughafen|аэропорт|aeropuerto/i,['Q1248784']],
      [/port|harbou?r|港湾|港|hafen|порт|puerto/i,['Q44782']],
      [/military|army base|軍事|基地|駐屯地|militär|военн|militar/i,['Q245016','Q18691599']],                    /* military base + installation */
      [/mine|mining|鉱山|炭鉱|bergwerk|шахт|рудник|mina/i,['Q820477']],
      [/steel|製鉄|stahlwerk|сталелит|acería|acero/i,['Q2069494']],                                              /* steel mill */
      [/hospital|病院|krankenhaus|больниц|госпитал/i,['Q16917']],
      [/universit|大学|университет|universidad/i,['Q3918']],
      [/stadium|スタジアム|競技場|stadion|стадион|estadio/i,['Q483110']],
      [/prison|刑務所|gefängnis|тюрьм|prisión|cárcel/i,['Q40357']],
      [/lighthouse|灯台|leuchtturm|маяк|faro/i,['Q39715']],
      [/embass|大使館|botschaft|посольств|embajada/i,['Q3917681']],
      [/train station|railway station|駅|bahnhof|вокзал|estación/i,['Q55488']],
      [/desalination|淡水化|entsalzung|опреснит|desalinizadora/i,['Q51932686']],
      [/data ?cent(er|re)|データセンター|rechenzentrum|дата-центр|centro de datos/i,['Q671224']]
    ];
    async function wikidataPOIs(kindStr,box,iso3){
      let qids=null; for(const k of WD_KINDS){ if(k[0].test(String(kindStr||''))){ qids=k[1]; break; } }
      if(!qids) return null;   /* kind has no curated Wikidata class → OSM/AI handle it */
      const langWD=({jp:'ja'})[HOST.lang]||HOST.lang||'en';
      const cls='VALUES ?cls { '+qids.map(q=>'wd:'+q).join(' ')+' } ?item wdt:P31 ?cls. ';
      const scope=iso3
        ?('?country wdt:P298 "'+String(iso3).replace(/[^A-Z]/g,'')+'". ?item wdt:P17 ?country; wdt:P625 ?coord. ')
        :('SERVICE wikibase:box { ?item wdt:P625 ?coord. bd:serviceParam wikibase:cornerSouthWest "Point('+(+box[0][0]).toFixed(3)+' '+(+box[0][1]).toFixed(3)+')"^^geo:wktLiteral. bd:serviceParam wikibase:cornerNorthEast "Point('+(+box[1][0]).toFixed(3)+' '+(+box[1][1]).toFixed(3)+')"^^geo:wktLiteral. } ');
      /* (#R72) also pull the Wikipedia ARTICLE sitelink (UI language, then English) so the pin popup can link to it */
      const wikiHost=(langWD&&langWD!=='en')?langWD:'en';
      const q2='SELECT ?item ?itemLabel ?coord ?artL ?artE WHERE { '+cls+scope
        +'OPTIONAL { ?artL schema:about ?item; schema:isPartOf <https://'+wikiHost+'.wikipedia.org/>. } '
        +'OPTIONAL { ?artE schema:about ?item; schema:isPartOf <https://en.wikipedia.org/>. } '
        +'SERVICE wikibase:label { bd:serviceParam wikibase:language "'+langWD+',en". } } LIMIT 400';
      try{
        const c=('AbortController' in window)?new AbortController():null; const tm=setTimeout(()=>{ try{ c&&c.abort(); }catch(_){} },26000);
        const opt={headers:{'Accept':'application/sparql-results+json'}}; if(c) opt.signal=c.signal;
        const r=await fetch('https://query.wikidata.org/sparql?format=json&query='+encodeURIComponent(q2),opt);
        clearTimeout(tm); if(!r.ok) return null;
        const j=await r.json(); const rows=(j&&j.results&&j.results.bindings)||[];
        const out=[];
        for(const b of rows){ try{
          const m=/Point\(([-0-9.eE]+) ([-0-9.eE]+)\)/.exec((b.coord&&b.coord.value)||''); if(!m) continue;
          const nm2=(b.itemLabel&&b.itemLabel.value)||''; if(!nm2||/^Q\d+$/.test(nm2)) continue;   /* bare QID = no usable label */
          const art=(b.artL&&b.artL.value)||(b.artE&&b.artE.value)||'';
          const qid=((b.item&&b.item.value)||'').split('/').pop();
          out.push({lng:+m[1],lat:+m[2],name:nm2.slice(0,90),kind:'Wikidata',wikiUrl:art,wd:/^Q\d+$/.test(qid)?qid:''});
        }catch(_){} }
        return out;   /* [] = source answered, nothing tagged; null = source failed */
      }catch(_){ return null; } }
  return { _OP_EPS, _gdeltNews, _gnewsNews, _leaderData, _wikiSummary, aiFacilities, overpassPOIs, wikidataPOIs };
}
