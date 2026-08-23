/* ============================================================================
 *  IntMap · VOLCANO INTELLIGENCE — window.IntMapVolcano  (#R353)
 * ----------------------------------------------------------------------------
 *  「現在はGVPの完新世火山1,215座を全部入れてありますが、視覚上の主要分類は「1950年以降」
 *   「1500年以降」「古い／不明」です。ここは恐ろしく深くできます。」
 *
 *  ── WHAT THE LAYER COULD NOT SAY, AND WHY ──────────────────────────────────────────────────
 *  The three colours were not a design decision about depth. data/volcanoes_gvp.json carried SIX
 *  properties per volcano — name, country, type, elevation, last eruption year, region — and no GVP
 *  volcano number, so there was no join key: the eruption history, the VEI, the magma, the people
 *  living around it and every live feed on Earth were unreachable from the bundled file no matter
 *  what UI stood on top of it. scripts/build-volcanoes.mjs put the number in (and 11,089 eruptions
 *  beside it); this file is what the number is FOR.
 *
 *  ── THE STATUS LADDER, AND WHY IT IS A LADDER ──────────────────────────────────────────────
 *  There is no single feed that states a current alert level for every volcano on Earth. Pretending
 *  otherwise would make 1,150 quiet-looking volcanoes out of "nobody publishes this in a form a map
 *  can read", which is exactly the failure the weather-warning layer's grey hatching exists to
 *  prevent (docs/MAP-LAYERS.md §7.1). So the same three-state discipline applies here, with the
 *  rungs named on screen and each one carrying its own source and clock:
 *
 *    ① USGS HANS         United States (+ CNMI)  aviation colour code AND alert level, structured
 *    ② JMA               Japan                    噴火警戒レベル 1–5, or the worded warning where JMA
 *                                                 does not operate a level for that volcano
 *    ③ GVP weekly report World                    "New Unrest" / "Ongoing Activity" for the volcanoes
 *                                                 reported this week — an ACTIVITY statement, not a level
 *    ⓪ nothing published World                    said in words, never drawn as calm
 *
 *  ⚠ ①②③ ARE NOT THE SAME QUANTITY AND ARE NEVER MERGED INTO ONE NUMBER. A JMA level 2 and a USGS
 *  YELLOW/ADVISORY are different instruments of different agencies; the panel prints what the agency
 *  said, in the agency's own vocabulary, with the agency's name against it. What the map's colour
 *  mode reduces them to is a four-step SEVERITY ORDER for drawing, and the legend says so.
 *
 *  ⚠ JMA'S WARNING UNIT IS NOT ALWAYS GVP'S VOLCANO, AND THE TABLE BELOW IS HONEST ABOUT IT.
 *  JMA warns for 桜島; GVP's catalog entry is Aira, the caldera it sits in. JMA warns separately for
 *  樽前山 and 恵庭岳; GVP has one entry, Shikotsu. The mapping is therefore many-to-one by design, the
 *  panel shows JMA's OWN unit name, and the map colours the GVP point that contains it.
 *
 *  ── WHAT IS NOT HERE, AND WHY ──────────────────────────────────────────────────────────────
 *  · «噴火様式» (Strombolian / Vulcanian / Plinian …) is NOT a field in the GVP database. It appears
 *    only in Bulletin prose. So this file does not print a style label it cannot source: the
 *    eruption-character section is built from what the record actually contains — the VEI
 *    distribution of that volcano's own eruptions, its dominant rock type, its landform and its
 *    repose intervals — and says which of those is measured and which is derived.
 *  · Pyroclastic-flow / ashfall / lahar hazard ZONES exist as machine-readable GIS for a handful of
 *    volcanoes and for no others. js/volcano-layers.js draws the ones USGS publishes and this panel
 *    says plainly, per volcano, when none is published. No modelled circle is drawn anywhere.
 *
 *  ── RENDERER / MODULE RULES ────────────────────────────────────────────────────────────────
 *  · No <style> here — the CSS lives in css/intmap.css (standing rule since #R162).
 *  · The card is a `.country-popup`, so it inherits the app's detail-card look, drag behaviour and
 *    mobile bottom-sheet rather than inventing a second UI vocabulary.
 *  · Every value that reaches the DOM goes through window.IntMapSafe (#R138).
 *  · Five languages inline; the other four come from js/locales/ui.*.js (`npm run check:i18n`).
 *  · Load-on-demand (js/lazy-modules.js → `volcanoIntel`): nothing here is downloaded until a
 *    volcano is clicked, an Atlas volcano command runs, or the intelligence legend is opened.
 * ==========================================================================*/
window.IntMapModules=window.IntMapModules||{};
window.IntMapModules.volcanoIntel=function(HOST){
  const L=window.IntMapLang.pick(()=>HOST.lang);
  const GE=()=>window.IntMapGeoEngine;
  const S=(v)=>{ try{ return window.IntMapSafe.html(v==null?'':String(v)); }catch(_){ return ''; } };
  const loc=()=>{ try{ return window.IntMapLang.locale(HOST.lang,'en-GB'); }catch(_){ return 'en-GB'; } };
  const n0=(v)=>(v==null||!isFinite(v))?'':Math.round(v).toLocaleString(loc());

  /* ══ 1. THE BUNDLED RECORD ════════════════════════════════════════════════════════════════
     data/volcano-detail.json.gz — the eruption history, the geological summary, the photograph and
     the four population radii for all 1,214 volcanoes, in one gzipped file fetched the first time a
     panel is opened. ⚠ The gzip is DECIDED FROM THE BYTES, not from the file name: a host that
     labels `.gz` with Content-Encoding makes the browser decompress it already (js/gazetteer.js
     carries the same note and the same magic-number test). */
  const DETAIL_URL=(function(){ try{ return new URL('data/volcano-detail.json.gz',
    (window.IM_HOST&&window.IM_HOST.base)||document.baseURI).toString(); }catch(_){ return 'data/volcano-detail.json.gz'; } })();
  let detailDoc=null, detailPromise=null, detailFailed=false;
  function detail(){
    if(detailPromise) return detailPromise;
    detailPromise=(async()=>{
      try{
        const r=await fetch(DETAIL_URL,{cache:'force-cache'});
        if(!r.ok) throw new Error('HTTP '+r.status);
        const bytes=new Uint8Array(await r.arrayBuffer());
        let text;
        if(bytes[0]===0x1f&&bytes[1]===0x8b){
          if(typeof DecompressionStream!=='function') throw new Error('DecompressionStream unavailable');
          text=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
        } else { text=new TextDecoder().decode(bytes); }
        detailDoc=JSON.parse(text);
      }catch(e){ detailFailed=true; try{ console.warn('[IntMap] volcano detail unavailable —',e.message); }catch(_){} }
      return detailDoc;
    })();
    return detailPromise;
  }
  /* the layer's own FeatureCollection — js/beta-overlays.js owns it and publishes the accessor */
  const layerFC=()=>{ try{ return window.__imVolcLayer&&window.__imVolcLayer.data(); }catch(_){ return null; } };
  function base(vn){ const fc=layerFC(); if(!fc) return null;
    for(const f of fc.features){ if(f.properties&&f.properties.v===vn) return f; } return null; }

  /* ══ 2. JMA's WARNING UNIT → THE GVP VOLCANO THAT CONTAINS IT ══════════════════════════════
     JMA names its unit in Japanese and gives it a JMA volcano code; nothing in either feed carries a
     GVP number. This table is the join, keyed on JMA's own name because the name is what JMA prints
     and what a Japanese reader recognises. Every right-hand value was checked against the 105 GVP
     entries whose Country is Japan (data/volcanoes_gvp.json); tests/r353-checks.test.mjs re-checks
     all of them on every commit, so a catalog revision that retires a number fails the build rather
     than silently dropping a country's alert levels.
     ⚠ MANY-TO-ONE IS CORRECT HERE. 桜島 and 若尊 are both inside GVP's Aira; 樽前山 and 恵庭岳 are both
     inside Shikotsu; 池田・山川 and 開聞岳 are both inside Ata; the three 霧島山 units are all
     Kirishimayama. Merging them would be wrong only if the panel then claimed JMA had warned for the
     caldera — it does not: it prints JMA's unit name. */
  const JMA_TO_GVP={
    /* 北海道 */
    'アトサヌプリ':285080,'摩周':285081,'雌阿寒岳':285070,'大雪山':285060,'十勝岳':285050,
    '樽前山':285040,'恵庭岳':285040,'倶多楽':285034,'有珠山':285030,'北海道駒ヶ岳':285020,
    '恵山':285011,'渡島大島':285010,'知床硫黄山':285090,'羅臼岳':285082,'利尻山':285041,
    'ニセコ':285031,'羊蹄山':285032,'丸山':285061,
    /* 東北 */
    '恐山':283290,'岩木山':283270,'八甲田山':283280,'十和田':283271,'秋田焼山':283260,
    '八幡平':283250,'岩手山':283240,'秋田駒ヶ岳':283230,'鳥海山':283220,'栗駒山':283210,
    '鳴子':283200,'肘折':283191,'蔵王山':283190,'吾妻山':283180,'安達太良山':283170,
    '磐梯山':283160,'沼沢':283151,
    /* 関東・中部 */
    '那須岳':283150,'高原山':283143,'男体山':283141,'日光白根山':283140,'燧ヶ岳':283131,
    '赤城山':283130,'榛名山':283122,'草津白根山':283120,'浅間山':283110,'妙高山':283100,
    '新潟焼山':283090,'弥陀ヶ原':283080,'焼岳':283070,'アカンダナ山':283069,'乗鞍岳':283060,
    '白山':283050,'御嶽山':283040,'横岳':283031,'富士山':283030,'箱根山':283020,
    '伊豆東部火山群':283010,'三瓶山':283002,'阿武火山群':283001,
    /* 伊豆・小笠原 */
    '伊豆大島':284010,'利島':284011,'新島':284020,'神津島':284030,'三宅島':284040,
    '御蔵島':284041,'八丈島':284050,'青ヶ島':284060,'ベヨネース列岩':284061,'明神礁':284070,
    '須美寿島':284080,'伊豆鳥島':284090,'孀婦岩':284091,'西之島':284096,'海形海山':284097,
    '海徳海山':284100,'噴火浅根':284110,'硫黄島':284120,'北福徳堆':284121,
    '福徳岡ノ場':284130,'南日吉海山':284131,'日光海山':284132,
    /* 九州・南西諸島 */
    '鶴見岳・伽藍岳':282130,'九重山':282120,'阿蘇山':282110,'雲仙岳':282100,'福江火山群':282091,
    '霧島山':282090,'米丸・住吉池':282081,'桜島':282080,'若尊':282080,'池田・山川':282070,
    '開聞岳':282070,'薩摩硫黄島':282060,'口永良部島':282050,'中之島':282040,'諏訪之瀬島':282030,
    '硫黄鳥島':282020,'口之島':282043,'横当島':282021,'悪石島':282022,
    '西表島北北東海底火山':282010,
  };
  /* 「霧島山（新燃岳）」 → 「霧島山」. JMA qualifies a unit with the active vent in brackets; the
     bracket is a vent, not a different volcano, and the full string is what the panel shows. */
  const jmaKey=(name)=>String(name||'').replace(/[（(][^）)]*[）)]\s*$/,'').trim();

  /* ══ 3. THE LIVE SOURCES ═══════════════════════════════════════════════════════════════════
     Four are fetched directly (they answer with Access-Control-Allow-Origin: *) and two go through
     supabase/functions/volcano-feed, which is where the measurement of who does and does not send
     that header is written down. Each feed keeps its own state so the UI can tell "nothing is
     happening" apart from "this feed did not answer" — the same distinction the warning layer draws
     with hatching, and the reason nothing below collapses a failure into an empty array. */
  const RELAY=(qs)=>{ let b=''; try{ b=String(window.SUPABASE_URL||'').replace(/\/$/,''); }catch(_){ b=''; }
    return b?(b+'/functions/v1/volcano-feed?'+qs):''; };
  const HANS='https://volcanoes.usgs.gov/hans-public/api/';
  const JMA_WARN='https://www.jma.go.jp/bosai/volcano/data/warning.json';

  const FEEDS={
    usgs:{ state:'idle', at:0, rows:null, err:'' },
    vona:{ state:'idle', at:0, rows:null, err:'' },
    jma:{ state:'idle', at:0, rows:null, err:'' },
    weekly:{ state:'idle', at:0, rows:null, err:'' },
  };
  const FRESH_MS=5*60*1000;

  async function getJSON(url,ms){
    const ctrl=new AbortController(); const to=setTimeout(()=>{ try{ ctrl.abort(); }catch(_){} }, ms||15000);
    try{ const r=await fetch(url,{signal:ctrl.signal}); clearTimeout(to);
      if(!r.ok) throw new Error('HTTP '+r.status); return await r.json(); }
    finally{ clearTimeout(to); }
  }
  function mark(k,rows,err){ const f=FEEDS[k];
    if(err){ f.state='failed'; f.err=String(err&&err.message||err||'').slice(0,120); }
    else { f.state='ok'; f.rows=rows; f.err=''; }
    f.at=Date.now(); notify(); }

  async function pull(k){
    const f=FEEDS[k];
    if(f.state==='loading') return f.rows;
    if(f.state==='ok'&&Date.now()-f.at<FRESH_MS) return f.rows;
    f.state='loading'; notify();
    try{
      if(k==='usgs'){
        const j=await getJSON(HANS+'volcano/getElevatedVolcanoes',15000);
        mark(k, Array.isArray(j)?j:[]);
      } else if(k==='vona'){
        const j=await getJSON(HANS+'notice/getVonasWithinLastYear',20000);
        mark(k, Array.isArray(j)?j:[]);
      } else if(k==='jma'){
        const j=await getJSON(JMA_WARN,15000);
        mark(k, Array.isArray(j)?j:[]);
      } else if(k==='weekly'){
        const u=RELAY('feed=weekly'); if(!u) throw new Error('no relay');
        const j=await getJSON(u,20000);
        mark(k, (j&&Array.isArray(j.rows))?j.rows:[]);
      }
    }catch(e){ mark(k,null,e); }
    return FEEDS[k].rows;
  }
  /* ⚠ ALL FOUR AT ONCE, AND FAILURES DO NOT CANCEL EACH OTHER. A dead relay must not take the two
     national feeds down with it — that is how one outage turns into "IntMap says nothing about
     volcanoes", which is the failure mode this project keeps rediscovering. */
  function warm(){ return Promise.all(['usgs','vona','jma','weekly'].map(k=>pull(k).catch(()=>null))); }

  const subs=new Set();
  function notify(){ for(const fn of subs){ try{ fn(); }catch(_){} } }
  function onChange(fn){ subs.add(fn); return ()=>subs.delete(fn); }

  /* ══ 4. THE STATUS LADDER ══════════════════════════════════════════════════════════════════
     `rank` is a DRAWING order — 0 quiet … 4 the highest thing any of the three agencies said — and it
     exists only so the map can sort colours. It is never shown as a number and never presented as a
     level: `label` and `source` carry the agency's own words. */
  const RANK={ NORMAL:0, GREEN:0, ADVISORY:2, YELLOW:2, WATCH:3, ORANGE:3, WARNING:4, RED:4 };

  function usgsFor(vn){
    const rows=FEEDS.usgs.rows; if(!rows) return null;
    for(const r of rows){ if(+r.vnum===vn) return r; } return null;
  }
  function vonaFor(vn){
    const rows=FEEDS.vona.rows; if(!rows) return [];
    return rows.filter(r=>+r.vnum===vn).sort((a,b)=>(+b.sent_unixtime||0)-(+a.sent_unixtime||0));
  }
  function weeklyFor(vn){
    const rows=FEEDS.weekly.rows; if(!rows) return null;
    for(const r of rows){ if(+r.v===vn) return r; } return null;
  }
  /* JMA publishes one entry per volcano under warning; `volcanoInfos[0]` is the 対象火山 block and its
     items name the warning. 「レベル２（火口周辺規制）」 carries the number in the string, and the
     volcanoes JMA does not operate a level for carry a worded warning instead (「入山危険」,
     「周辺海域警戒」) — which is printed as written rather than converted into a level that does not
     exist for that volcano. */
  const JMA_LEVEL=/レベル\s*([1-5１-５])/;
  const jmaNum=(s)=>{ const m=JMA_LEVEL.exec(s||''); if(!m) return null;
    const c=m[1]; return c>='１'?(c.charCodeAt(0)-'０'.charCodeAt(0)):+c; };
  function jmaFor(vn){
    const rows=FEEDS.jma.rows; if(!rows) return null;
    let best=null;
    for(const e of rows){
      const infos=(e&&e.volcanoInfos)||[]; const block=infos[0]; if(!block) continue;
      for(const it of (block.items||[])){
        for(const a of (it.areas||[])){
          if(JMA_TO_GVP[jmaKey(a.name)]!==vn) continue;
          const lvl=jmaNum(it.name);
          const cand={ unit:a.name, jmaCode:a.code, text:it.name, kind:it.code,
                       level:lvl, condition:it.condition||'', at:e.reportDatetime||'' };
          if(!best||(cand.level||0)>(best.level||0)) best=cand;
        }
      }
    }
    return best;
  }

  /* JMA's five levels against the same 0–4 drawing order. 1 (活火山であることに留意) is not "calm" and
     not "elevated" — it is the baseline for a volcano JMA watches, so it draws as rank 1. */
  const JMA_RANK={1:1,2:2,3:3,4:4,5:4};

  function status(vn){
    /* ① the United States */
    const u=usgsFor(vn);
    if(u) return { tier:1, rank:Math.max(RANK[u.color_code]||0,RANK[u.alert_level]||0),
      label:(u.color_code||'')+' / '+(u.alert_level||''), colorCode:u.color_code||'', alertLevel:u.alert_level||'',
      unit:u.volcano_name||'', source:u.obs_fullname||'USGS', at:u.sent_utc||'',
      url:u.notice_url||'https://volcanoes.usgs.gov/vhp/updates.html' };
    /* ② Japan */
    const j=jmaFor(vn);
    if(j) return { tier:2, rank:(j.level!=null?JMA_RANK[j.level]:3), label:j.text, level:j.level,
      unit:j.unit, condition:j.condition, source:L('Japan Meteorological Agency','気象庁',
        'Japanische Wetterbehörde','Японское метеорологическое агентство','Agencia Meteorológica de Japón'),
      at:j.at||'', url:'https://www.jma.go.jp/bosai/map.html#contents=volcano' };
    /* ③ the world, this week */
    const w=weeklyFor(vn);
    if(w) return { tier:3, rank:/eruptiv|eruption/i.test(w.status||'')?3:2, label:w.status||'',
      unit:w.name||'', period:w.period||'', text:w.text||'',
      source:L('Smithsonian / USGS Weekly Volcanic Activity Report','スミソニアン／USGS 週間火山活動報告',
        'Smithsonian/USGS Wöchentlicher Vulkanaktivitätsbericht','Еженедельный отчёт Смитсоновского института и USGS',
        'Informe semanal de actividad volcánica (Smithsonian/USGS)'),
      at:w.at||'', url:'https://volcano.si.edu/reports_weekly.cfm' };
    /* ⓪ nothing published — said, not drawn as calm */
    return { tier:0, rank:null, label:'', source:'', at:'', url:'' };
  }
  /* every volcano the three feeds have anything to say about, for the map's colour mode */
  function statusIndex(){
    const m=new Map();
    const add=(vn,st)=>{ const p=m.get(vn); if(!p||(st.tier<p.tier)) m.set(vn,st); };
    for(const r of (FEEDS.usgs.rows||[])) add(+r.vnum,status(+r.vnum));
    for(const e of (FEEDS.jma.rows||[])){
      for(const it of (((e.volcanoInfos||[])[0]||{}).items||[])){
        for(const a of (it.areas||[])){ const vn=JMA_TO_GVP[jmaKey(a.name)]; if(vn) add(vn,status(vn)); }
      }
    }
    for(const r of (FEEDS.weekly.rows||[])) add(+r.v,status(+r.v));
    return m;
  }

  /* ══ 5. WHAT THE ERUPTION RECORD ITSELF SAYS ═══════════════════════════════════════════════
     Everything below is computed from that volcano's own 11,089-row-wide slice of the GVP eruption
     list. Nothing is a lookup of "volcanoes like this usually…", and the panel labels each figure
     with how many eruptions it rests on, because a "typical VEI" from three eruptions and one from
     forty-eight are not the same claim. */
  function character(rows){
    if(!rows||!rows.length) return null;
    const confirmed=rows.filter(r=>r[9]===1);
    const veis=confirmed.map(r=>r[7]).filter(v=>v!=null);
    const hist=[0,0,0,0,0,0,0,0];
    for(const v of veis) if(v>=0&&v<=7) hist[v]++;
    const years=confirmed.map(r=>r[1]).filter(y=>y!=null).sort((a,b)=>a-b);
    /* repose intervals from the OBSERVED era only. Prehistoric dates come from radiocarbon and
       tephrochronology, which resolve centuries, so mixing them into a mean interval would produce a
       number about the dating methods rather than about the volcano. */
    const obs=years.filter(y=>y>=1500);
    let repose=null;
    if(obs.length>=3){ const gaps=[]; for(let i=1;i<obs.length;i++) gaps.push(obs[i]-obs[i-1]);
      gaps.sort((a,b)=>a-b); repose=gaps[Math.floor(gaps.length/2)]; }
    let biggest=null;
    for(const r of confirmed){ if(r[7]!=null&&(!biggest||r[7]>biggest[7])) biggest=r; }
    const ongoing=confirmed.some(r=>r[4]==null&&r[1]!=null&&r[1]>=(new Date().getFullYear()-2));
    return { n:confirmed.length, uncertain:rows.length-confirmed.length, veis:veis.length, hist,
      first:years.length?years[0]:null, last:years.length?years[years.length-1]:null,
      maxVei:veis.length?Math.max(...veis):null, modeVei:hist.indexOf(Math.max(...hist)),
      explosive:veis.length?veis.filter(v=>v>=4).length:0, repose, biggest, ongoing, obsCount:obs.length };
  }

  /* ══ 6. NEARBY EARTHQUAKES — asked per volcano, never as a background sweep ════════════════ */
  const QUAKE='https://earthquake.usgs.gov/fdsnws/event/1/query';
  const quakeCache=new Map();
  async function quakesNear(vn,radiusKm,days){
    const f=base(vn); if(!f) return null;
    const key=vn+':'+(radiusKm||50)+':'+(days||30);
    if(quakeCache.has(key)) return quakeCache.get(key);
    const c=f.geometry.coordinates;
    const start=new Date(Date.now()-(days||30)*86400000).toISOString().slice(0,10);
    const u=QUAKE+'?format=geojson&latitude='+c[1].toFixed(4)+'&longitude='+c[0].toFixed(4)
      +'&maxradiuskm='+(radiusKm||50)+'&starttime='+start+'&orderby=time&limit=200';
    try{
      const j=await getJSON(u,20000);
      const rows=((j&&j.features)||[]).map(q=>({
        m:q.properties&&q.properties.mag, at:q.properties&&q.properties.time,
        depth:q.geometry&&q.geometry.coordinates&&q.geometry.coordinates[2],
        place:q.properties&&q.properties.place, url:q.properties&&q.properties.url,
        km:haversine(c[1],c[0],q.geometry.coordinates[1],q.geometry.coordinates[0]) }));
      const out={ ok:true, rows, radiusKm:radiusKm||50, days:days||30 };
      quakeCache.set(key,out); return out;
    }catch(e){ const out={ ok:false, rows:[], radiusKm:radiusKm||50, days:days||30 }; quakeCache.set(key,out); return out; }
  }
  function haversine(la1,lo1,la2,lo2){ const R=6371, r=Math.PI/180;
    const dLa=(la2-la1)*r, dLo=(lo2-lo1)*r;
    const a=Math.sin(dLa/2)**2+Math.cos(la1*r)*Math.cos(la2*r)*Math.sin(dLo/2)**2;
    return 2*R*Math.asin(Math.min(1,Math.sqrt(a))); }

  /* ══ 7. NEAREST AERODROMES — OpenStreetMap, asked per volcano ══════════════════════════════
     「周辺人口・空港・航空路への影響」. The population radii are bundled (GVP measures them); the
     airports are not, because no bundled airport set exists in this repo. `aeroway=aerodrome` inside
     150 km, from the same three Overpass mirrors js/atlas-sources.js races, raced rather than
     chained so one slow mirror does not become the answer's latency. */
  const OP_EPS=['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter','https://overpass.private.coffee/api/interpreter'];
  const aptCache=new Map();
  async function airportsNear(vn,radiusKm){
    const f=base(vn); if(!f) return null;
    const key=vn+':'+(radiusKm||150);
    if(aptCache.has(key)) return aptCache.get(key);
    const c=f.geometry.coordinates;
    const q='[out:json][timeout:25];nwr["aeroway"="aerodrome"](around:'+((radiusKm||150)*1000)+','+c[1].toFixed(4)+','+c[0].toFixed(4)+');out center tags 60;';
    const one=(ep)=>fetch(ep,{method:'POST',body:'data='+encodeURIComponent(q),
      headers:{'content-type':'application/x-www-form-urlencoded'}}).then(r=>r.ok?r.json():Promise.reject(new Error('HTTP '+r.status)));
    try{
      const j=await Promise.any(OP_EPS.map(one));
      const rows=((j&&j.elements)||[]).map(el=>{
        const t=el.tags||{}, lat=el.lat!=null?el.lat:(el.center&&el.center.lat), lon=el.lon!=null?el.lon:(el.center&&el.center.lon);
        if(lat==null||lon==null) return null;
        return { name:t['name:en']||t.name||t.icao||t.iata||'', icao:t.icao||'', iata:t.iata||'',
          kind:t.aerodrome||t['aerodrome:type']||'', km:haversine(c[1],c[0],lat,lon), lat, lng:lon };
      }).filter(Boolean).filter(a=>a.name||a.icao||a.iata).sort((a,b)=>a.km-b.km).slice(0,12);
      const out={ ok:true, rows, radiusKm:radiusKm||150 };
      aptCache.set(key,out); return out;
    }catch(_){ const out={ ok:false, rows:[], radiusKm:radiusKm||150 }; aptCache.set(key,out); return out; }
  }

  /* ══ 8. THE PANEL ══════════════════════════════════════════════════════════════════════════ */
  let el=null, curVn=null, extra={ quakes:null, apts:null, forVn:null }, tab='now';
  function ensureEl(){
    if(el&&document.body.contains(el)) return el;
    el=document.createElement('div');
    el.className='country-popup volc-popup'; el.id='volc-popup';
    el.innerHTML='<button class="country-popup-close" id="volcp-close" type="button" title="'+S(L('Close','閉じる','Schließen','Закрыть','Cerrar'))+'">×</button>'
      +'<div class="country-popup-header"><h3 id="volcp-title"></h3></div>'
      +'<div class="volc-tabs" id="volcp-tabs"></div><div id="volcp-body"></div>';
    (document.getElementById('map-container')||document.body).appendChild(el);
    el.querySelector('#volcp-close').addEventListener('click',()=>close());
    try{ HOST.makeDraggable(el, el.querySelector('.country-popup-header')); }catch(_){}
    el.addEventListener('mousedown',()=>{ try{ HOST.bringToFront(el); }catch(_){} });
    el.addEventListener('click',(ev)=>{
      const b=ev.target&&ev.target.closest?ev.target.closest('[data-volcp]'):null; if(!b) return;
      const a=b.dataset.volcp;
      if(a==='goto') gotoVolcano();
      else if(a==='quakes') loadQuakes();
      else if(a==='apts') loadAirports();
      else if(a==='ash'){ try{ window.IntMapLazy.need('volcanoLayers').then(()=>window.IntMapVolcanoLayers&&window.IntMapVolcanoLayers.ash(true)); }catch(_){} }
      else if(a==='so2'){ try{ window.IntMapLazy.need('volcanoLayers').then(()=>window.IntMapVolcanoLayers&&window.IntMapVolcanoLayers.so2(true)); }catch(_){} }
      else if(a==='hazard'){ try{ window.IntMapLazy.need('volcanoLayers').then(()=>window.IntMapVolcanoLayers&&window.IntMapVolcanoLayers.hazard(true,curVn)); }catch(_){} }
      else if(a==='thermal'){ openThermal(); }
      else if(b.dataset.tab){ tab=b.dataset.tab; render(); }
    });
    return el;
  }
  const row=(k,v)=>(v===''||v==null)?'':'<div class="acp-row"><span class="acp-k">'+S(k)+'</span><span class="acp-v">'+S(v)+'</span></div>';
  const sec=(t2)=>'<div class="acp-sec">'+S(t2)+'</div>';
  const note=(t2)=>'<div class="acp-note">'+S(t2)+'</div>';
  const hint=(t2)=>'<div class="tp-hint">'+S(t2)+'</div>';

  function yearTxt(y){ if(y==null) return '';
    return y<0?L('BCE ','紀元前','v. Chr. ','до н.э. ','a.C. ')+Math.abs(y):String(y); }
  function dateTxt(y,m,d){ if(y==null) return '';
    if(!m) return yearTxt(y);
    if(!d) return yearTxt(y)+'-'+String(m).padStart(2,'0');
    return yearTxt(y)+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0'); }

  /* the four rungs, as words. Never a number, never a merged scale. */
  function statusBadge(st){
    if(st.tier===0) return '<span class="volc-badge q">'+S(L('No current statement published','現在の状況を公表している出典なし',
      'Keine aktuelle Angabe veröffentlicht','Текущих сообщений не публикуется','Sin declaración actual publicada'))+'</span>';
    const cls=st.rank>=4?'r':st.rank>=3?'o':st.rank>=2?'y':'g';
    return '<span class="volc-badge '+cls+'">'+S(st.label)+'</span>'
      +'<span class="volc-badge src">'+S(st.source)+'</span>';
  }

  function tabsHTML(){
    const items=[['now',L('Now','現在','Jetzt','Сейчас','Ahora')],
      ['history',L('Eruptions','噴火履歴','Ausbrüche','Извержения','Erupciones')],
      ['about',L('The volcano','火山の姿','Der Vulkan','О вулкане','El volcán')],
      ['impact',L('Exposure','影響範囲','Exposition','Воздействие','Exposición')]];
    return items.map(([k,lab])=>'<button type="button" class="volc-tab'+(tab===k?' on':'')+'" data-volcp="tab" data-tab="'+k+'">'+S(lab)+'</button>').join('');
  }

  function nowHTML(f,d){
    const vn=f.properties.v, st=status(vn), u=usgsFor(vn), j=jmaFor(vn), w=weeklyFor(vn), vona=vonaFor(vn);
    let h='<div class="volc-badges">'+statusBadge(st)+'</div>';
    if(st.tier===0){
      h+=note(L('No volcano observatory publishes a machine-readable current level for this volcano. That is not the same as "quiet" — it means this map has nothing to report.',
        'この火山について、現在の警戒レベルを機械可読な形で公表している観測機関がありません。「静穏」という意味ではなく、この地図が報告できる情報が無いという意味です。',
        'Kein Observatorium veröffentlicht für diesen Vulkan eine maschinenlesbare aktuelle Stufe. Das heißt nicht „ruhig“, sondern dass diese Karte nichts zu melden hat.',
        'Ни одна обсерватория не публикует машиночитаемый текущий уровень для этого вулкана. Это не значит «спокоен» — это значит, что карте нечего сообщить.',
        'Ningún observatorio publica un nivel actual legible por máquina para este volcán. No significa «en calma»: significa que este mapa no tiene nada que informar.'));
    }
    if(u){
      h+=sec(L('United States — USGS aviation colour code and alert level','米国 — USGS 航空カラーコードと警戒レベル',
        'USA — USGS Luftfahrt-Farbcode und Warnstufe','США — цветовой код авиации и уровень тревоги USGS','EE. UU. — código de color de aviación y nivel de alerta del USGS'))
        +row(L('Aviation colour code','航空カラーコード','Luftfahrt-Farbcode','Цветовой код для авиации','Código de color de aviación'),u.color_code)
        +row(L('Volcano alert level','火山警戒レベル','Vulkan-Warnstufe','Уровень вулканической тревоги','Nivel de alerta volcánica'),u.alert_level)
        +row(L('Observatory','観測所','Observatorium','Обсерватория','Observatorio'),u.obs_fullname)
        +row(L('Issued','発表','Ausgegeben','Выпущено','Emitido'),(u.sent_utc||'')+' UTC');
    }
    if(j){
      h+=sec(L('Japan — JMA eruption warning','日本 — 気象庁 噴火警報・予報','Japan — JMA-Ausbruchswarnung','Япония — предупреждение JMA','Japón — aviso de erupción de la JMA'))
        +row(L('Warning unit','対象火山（気象庁の単位）','Warngebiet','Единица предупреждения','Unidad de aviso'),j.unit)
        +row(L('Warning','発表内容','Warnung','Предупреждение','Aviso'),j.text)
        +(j.level!=null?row(L('Eruption warning level','噴火警戒レベル','Ausbruchswarnstufe','Уровень предупреждения','Nivel de alerta'),String(j.level)+' / 5'):'')
        +row(L('Change','変化','Änderung','Изменение','Cambio'),j.condition)
        +row(L('Issued','発表','Ausgegeben','Выпущено','Emitido'),String(j.at||'').replace('T',' ').slice(0,16));
      if(j.level==null) h+=note(L('JMA does not operate a numbered eruption warning level for this volcano; the worded warning above is what it publishes.',
        'この火山では気象庁の噴火警戒レベルは運用されていません。上の文言そのものが公表されている内容です。',
        'Für diesen Vulkan betreibt die JMA keine nummerierte Warnstufe; die Wortmeldung oben ist das Veröffentlichte.',
        'Для этого вулкана JMA не ведёт нумерованный уровень; публикуется именно приведённая формулировка.',
        'La JMA no opera un nivel numerado para este volcán; lo publicado es el aviso en palabras.'));
    }
    if(w){
      h+=sec(L('This week — Smithsonian / USGS Weekly Volcanic Activity Report','今週 — スミソニアン／USGS 週間火山活動報告',
        'Diese Woche — Wöchentlicher Vulkanaktivitätsbericht','На этой неделе — еженедельный отчёт','Esta semana — informe semanal de actividad volcánica'))
        +row(L('Status','状況','Status','Статус','Estado'),w.status)
        +row(L('Report period','報告期間','Berichtszeitraum','Период отчёта','Periodo del informe'),w.period)
        +'<div class="volc-narr">'+S(w.text)+'</div>';
    }
    /* VONA — the aviation notice itself, not a summary of it */
    h+=sec(L('VONA — Volcano Observatory Notice for Aviation','VONA — 航空関係者向け火山情報','VONA — Vulkanmeldung für die Luftfahrt','VONA — уведомление для авиации','VONA — aviso volcánico para la aviación'));
    if(FEEDS.vona.state==='failed') h+=hint(L('The USGS notice feed did not answer.','USGS の情報フィードが応答しませんでした。','Der USGS-Meldungsfeed hat nicht geantwortet.','Лента уведомлений USGS не ответила.','El feed de avisos del USGS no respondió.'));
    else if(FEEDS.vona.state!=='ok') h+=hint(L('Reading…','読み込み中…','Wird gelesen…','Чтение…','Leyendo…'));
    else if(!vona.length) h+=hint(L('No VONA has been issued for this volcano in the last year. VONA is issued by the volcano observatories of a handful of countries — the United States among them — so an absence here is not a statement about volcanoes elsewhere.',
      'この火山について、直近1年間に VONA は発表されていません。VONA を発表しているのは米国など一部の国の観測機関に限られるため、ここが空であることは他国の火山について何も述べていません。',
      'Für diesen Vulkan wurde im letzten Jahr keine VONA ausgegeben. VONA geben nur die Observatorien einiger Länder heraus — eine Leerstelle sagt nichts über Vulkane anderswo.',
      'За последний год для этого вулкана VONA не выпускались. VONA выпускают обсерватории лишь нескольких стран — пустота здесь ничего не говорит о вулканах в других местах.',
      'No se ha emitido ninguna VONA para este volcán en el último año. Solo los observatorios de algunos países emiten VONA — su ausencia aquí no dice nada sobre volcanes de otros lugares.'));
    else {
      for(const v of vona.slice(0,4)){
        h+='<div class="volc-vona"><div class="volc-vona-h">'+S((v.color_code||'')+' / '+(v.alert_level||'')+' · '+String(v.sent_utc||'').slice(0,16)+' UTC')+'</div>'
          +'<div class="volc-vona-b">'+S(v.synopsis_complete||'')+'</div>'
          +(v.vona_url?'<a class="volc-link" target="_blank" rel="noopener" href="'+S(v.vona_url)+'">'+S(L('Read the notice','原文を読む','Meldung lesen','Читать уведомление','Leer el aviso'))+'</a>':'')
          +'</div>';
      }
      if(vona[0]&&vona[0].nvews_threat) h+=row(L('USGS national threat ranking','USGS 国内脅威度ランク','USGS-Bedrohungseinstufung','Рейтинг угрозы USGS','Clasificación de amenaza del USGS'),vona[0].nvews_threat);
    }
    /* ash / SO2 / thermal — the three satellite-and-airspace doors */
    h+=sec(L('Ash, gas and heat','火山灰・ガス・熱','Asche, Gas und Hitze','Пепел, газ и тепло','Ceniza, gas y calor'))
      +'<button type="button" class="acp-mini" data-volcp="ash">'+S(L('Show volcanic-ash areas now in force (SIGMET)','現在有効な火山灰域を表示（SIGMET）','Aktuelle Vulkanasche-Gebiete zeigen (SIGMET)','Показать действующие зоны пепла (SIGMET)','Mostrar zonas de ceniza vigentes (SIGMET)'))+'</button>'
      +'<button type="button" class="acp-mini" data-volcp="so2">'+S(L('Show satellite SO₂ (OMPS, today)','衛星 SO₂ を表示（OMPS・当日）','Satelliten-SO₂ zeigen (OMPS, heute)','Показать SO₂ со спутника (OMPS, сегодня)','Mostrar SO₂ satelital (OMPS, hoy)'))+'</button>'
      +'<button type="button" class="acp-mini" data-volcp="thermal">'+S(L('Show satellite thermal anomalies here','この付近の衛星熱異常を表示','Thermische Anomalien hier zeigen','Показать тепловые аномалии здесь','Mostrar anomalías térmicas aquí'))+'</button>';
    return h;
  }

  function historyHTML(f,d){
    if(!d) return hint(detailFailed
      ?L('The bundled eruption record could not be loaded.','同梱の噴火記録を読み込めませんでした。','Der mitgelieferte Ausbruchsdatensatz konnte nicht geladen werden.','Не удалось загрузить встроенную запись извержений.','No se pudo cargar el registro de erupciones incluido.')
      :L('Reading the eruption record…','噴火記録を読み込み中…','Ausbruchsdatensatz wird gelesen…','Чтение записи извержений…','Leyendo el registro de erupciones…'));
    const ch=character(d.er);
    if(!ch) return hint(L('The Global Volcanism Program holds no dated eruption for this volcano. It is in the Holocene catalog on other evidence — see “The volcano”.',
      'この火山について、GVP は日付のある噴火を1件も記録していません。完新世カタログには別の証拠にもとづいて収録されています（「火山の姿」を参照）。',
      'Das Global Volcanism Program führt keinen datierten Ausbruch. Die Aufnahme in den Holozän-Katalog beruht auf anderen Belegen — siehe „Der Vulkan“.',
      'В базе GVP нет ни одного датированного извержения. В голоценовый каталог вулкан включён по иным свидетельствам — см. «О вулкане».',
      'El Global Volcanism Program no registra ninguna erupción fechada. Está en el catálogo del Holoceno por otras evidencias — ver «El volcán».'));
    const V=window.IntMapLang;
    let h=sec(L('The record','記録の全体','Der Datensatz','Запись','El registro'))
      +row(L('Confirmed eruptions','確認された噴火','Bestätigte Ausbrüche','Подтверждённые извержения','Erupciones confirmadas'),n0(ch.n))
      +row(L('Uncertain eruptions','不確実な噴火','Unsichere Ausbrüche','Неподтверждённые','Erupciones inciertas'),ch.uncertain?n0(ch.uncertain):'')
      +row(L('Earliest / latest','最古 / 最新','Frühester / letzter','Первое / последнее','Más antigua / más reciente'),
           (ch.first!=null?yearTxt(ch.first):'')+(ch.last!=null?' → '+yearTxt(ch.last):''))
      +row(L('Largest recorded VEI','記録された最大VEI','Größter erfasster VEI','Наибольший зафиксированный VEI','Mayor VEI registrado'),
           ch.maxVei==null?'':('VEI '+ch.maxVei+(ch.biggest&&ch.biggest[1]!=null?' · '+yearTxt(ch.biggest[1]):'')))
      +row(L('Eruptions at VEI 4 or above','VEI 4 以上の噴火','Ausbrüche ab VEI 4','Извержения VEI 4 и выше','Erupciones de VEI 4 o más'),
           ch.veis?(n0(ch.explosive)+' / '+n0(ch.veis)):'')
      +row(L('Median interval since 1500','1500年以降の噴火間隔（中央値）','Medianes Intervall seit 1500','Медианный интервал с 1500 г.','Intervalo mediano desde 1500'),
           ch.repose==null?'':(n0(ch.repose)+L(' years',' 年',' Jahre',' лет',' años')+' · '+n0(ch.obsCount)+L(' eruptions',' 回',' Ausbrüche',' извержений',' erupciones')));

    /* the VEI histogram — this volcano's own eruptions, drawn as bars with the counts on them */
    const max=Math.max(...ch.hist);
    if(max>0){
      h+=sec(L('Explosivity of this volcano’s own eruptions (VEI)','この火山自身の噴火の爆発規模（VEI）','Explosivität der eigenen Ausbrüche (VEI)','Взрывная сила собственных извержений (VEI)','Explosividad de sus propias erupciones (VEI)'));
      h+='<div class="volc-vei">';
      for(let v=0;v<=7;v++){
        const c=ch.hist[v], pct=max?Math.round(c/max*100):0;
        h+='<div class="volc-vei-row"><span class="volc-vei-k">VEI '+v+'</span>'
          +'<span class="volc-vei-bar"><i style="width:'+pct+'%"></i></span>'
          +'<span class="volc-vei-n">'+S(c?n0(c):'')+'</span></div>';
      }
      h+='</div>';
      h+=note(L('VEI is the Volcanic Explosivity Index — the erupted volume and plume height of one eruption on a 0–8 scale, as recorded by the Global Volcanism Program. It is the only structured measure of eruptive size the catalog carries; an eruption STYLE (Strombolian, Vulcanian, Plinian…) is not a field in that database and is therefore not shown here as if it were.',
        'VEI は火山爆発指数 — 1回の噴火の噴出量と噴煙高度を 0〜8 で表した、GVP が記録している値です。カタログが持つ噴火規模の構造化データはこれだけであり、「噴火様式」（ストロンボリ式・ブルカノ式・プリニー式など）はデータベースの項目に存在しないため、あるかのようには表示しません。',
        'VEI ist der Vulkanexplosivitätsindex — Fördervolumen und Säulenhöhe eines Ausbruchs auf einer Skala 0–8, wie vom GVP erfasst. Ein Ausbruchs-STIL (strombolianisch, vulkanianisch, plinianisch …) ist kein Feld dieser Datenbank und wird hier deshalb nicht so dargestellt.',
        'VEI — индекс вулканической эксплозивности: объём выброса и высота колонны одного извержения по шкале 0–8, как зафиксировано GVP. Стиль извержения (стромболианский, вулканский, плинианский…) в этой базе не поле, и здесь он не показывается как таковой.',
        'El VEI es el Índice de Explosividad Volcánica — volumen emitido y altura de la columna de una erupción en una escala 0–8, según lo registra el GVP. El ESTILO eruptivo (estromboliano, vulcaniano, pliniano…) no es un campo de esa base de datos y por eso no se muestra como si lo fuera.'));
    }

    h+=sec(L('Every recorded eruption, most recent first','記録されている全噴火（新しい順）','Alle erfassten Ausbrüche, neueste zuerst','Все зафиксированные извержения, сначала новые','Todas las erupciones registradas, la más reciente primero'));
    h+='<div class="volc-er">';
    const vocab=(detailDoc&&detailDoc.vocab)||{};
    for(const r of d.er){
      const vei=r[7]==null?'':('VEI '+r[7]+(r[8]||''));
      const start=dateTxt(r[1],r[2],r[3]), end=dateTxt(r[4],r[5],r[6]);
      const ev=(r[10]!=null&&vocab.evidence)?vocab.evidence[r[10]]:'';
      h+='<div class="volc-er-row'+(r[9]===1?'':' unc')+'">'
        +'<span class="volc-er-d">'+S(start+(end&&end!==start?' → '+end:(r[1]!=null&&r[4]==null?' → '+L('continuing','継続中','andauernd','продолжается','en curso'):'')))+'</span>'
        +'<span class="volc-er-v'+(r[7]>=4?' big':'')+'">'+S(vei)+'</span>'
        +'<span class="volc-er-e">'+S(ev)+'</span></div>';
    }
    h+='</div>';
    if(d.er.some(r=>r[9]!==1)) h+=note(L('Rows in grey are recorded by GVP as uncertain eruptions.','灰色の行は、GVP が「不確実な噴火」として記録しているものです。','Graue Zeilen sind vom GVP als unsichere Ausbrüche geführt.','Серые строки GVP относит к неподтверждённым извержениям.','Las filas en gris están registradas por el GVP como erupciones inciertas.'));
    return h;
  }

  function aboutHTML(f,d){
    const p=f.properties, fc=layerFC(), voc=(detailDoc&&detailDoc.vocab)||{};
    const rocks=(fc&&fc.rocks)||voc.rocks||[], sets=(fc&&fc.settings)||voc.settings||[];
    let h=sec(L('Form and setting','形と場','Form und Lage','Форма и обстановка','Forma y contexto'))
      +row(L('Primary volcano type','火山の型','Vulkantyp','Тип вулкана','Tipo de volcán'),p.t)
      +row(L('Landform','地形区分','Geländeform','Форма рельефа','Forma del terreno'),(d&&d.lf!=null&&voc.landform)?voc.landform[d.lf]:'')
      +row(L('Summit elevation','標高','Gipfelhöhe','Высота','Altitud de la cumbre'),p.e==null?'':(n0(p.e)+' m'))
      +row(L('Tectonic setting','構造区分','Tektonische Lage','Тектоническая обстановка','Contexto tectónico'),p.s!=null?sets[p.s]:'')
      +row(L('Dominant magma composition','主要なマグマ組成','Vorherrschende Magmazusammensetzung','Преобладающий состав магмы','Composición dominante del magma'),p.k!=null?rocks[p.k]:'')
      +row(L('Region','地域','Region','Регион','Región'),p.r)
      +row(L('Subregion','小地域','Teilregion','Субрегион','Subregión'),d?d.sub:'')
      +row(L('Country','国','Land','Страна','País'),p.c)
      +row(L('GVP volcano number','GVP 火山番号','GVP-Vulkannummer','Номер вулкана GVP','Número de volcán GVP'),String(p.v))
      +row(L('Geologic epoch','地質時代','Geologische Epoche','Геологическая эпоха','Época geológica'),(d&&d.ep!=null&&voc.epoch)?voc.epoch[d.ep]:'')
      +row(L('Basis for inclusion','収録の根拠','Grundlage der Aufnahme','Основание включения','Base de la inclusión'),(d&&d.ev!=null&&voc.evidenceCat)?voc.evidenceCat[d.ev]:'');
    if(p.k!=null&&rocks[p.k]){
      h+=note(L('Magma composition is GVP’s dominant rock type for this volcano — the silica content behind it is what makes an eruption runny or sticky, and therefore effusive or explosive. It is a property of the volcano, not a forecast of the next eruption.',
        'マグマ組成は、GVP がこの火山の主要岩石として記録している値です。その背後にある SiO₂ 量が溶岩の粘性を決め、溶岩流型か爆発型かに効きます。火山の性質であって、次の噴火の予測ではありません。',
        'Die Magmazusammensetzung ist der vom GVP geführte vorherrschende Gesteinstyp — der dahinterstehende Kieselsäuregehalt entscheidet über zähflüssig oder dünnflüssig und damit über effusiv oder explosiv. Eine Eigenschaft des Vulkans, keine Vorhersage.',
        'Состав магмы — преобладающий тип породы по GVP; стоящее за ним содержание кремнезёма определяет вязкость и, значит, эффузивность или взрывной характер. Это свойство вулкана, а не прогноз.',
        'La composición del magma es el tipo de roca dominante según el GVP — el contenido de sílice detrás determina si la lava es fluida o viscosa, y por tanto efusiva o explosiva. Es una propiedad del volcán, no un pronóstico.'));
    }
    if(d&&d.ph){
      h+=sec(L('Photograph','写真','Fotografie','Фотография','Fotografía'))
        +'<img class="volc-photo" loading="lazy" alt="'+S(p.n)+'" src="'+S('https://volcano.si.edu/gallery/photos/'+d.ph[0]+'.jpg')+'">'
        +(d.ph[1]?'<div class="volc-cap">'+S(d.ph[1])+'</div>':'')
        +(d.ph[2]?'<div class="volc-cred">'+S(d.ph[2])+'</div>':'');
    }
    if(d&&d.g){
      h+=sec(L('Geological summary','地質の概要','Geologische Übersicht','Геологический обзор','Resumen geológico'))
        +'<div class="volc-narr">'+S(d.g)+'</div>';
    }
    h+='<div class="acp-src">'+S('Smithsonian Institution · Global Volcanism Program — Volcanoes of the World')+'</div>';
    h+='<a class="volc-link" target="_blank" rel="noopener" href="'+S('https://volcano.si.edu/volcano.cfm?vn='+p.v)+'">'
      +S(L('Open the GVP record','GVP の原典を開く','GVP-Eintrag öffnen','Открыть запись GVP','Abrir la ficha del GVP'))+'</a>';
    return h;
  }

  function impactHTML(f,d){
    const p=f.properties;
    let h=sec(L('People living around it','周辺人口','Menschen im Umkreis','Население вокруг','Población alrededor'));
    if(d&&d.p&&d.p.some(x=>x!=null)){
      h+=row(L('Within 5 km','半径 5 km 以内','Im Umkreis von 5 km','В радиусе 5 км','A menos de 5 km'),n0(d.p[0]))
       +row(L('Within 10 km','半径 10 km 以内','Im Umkreis von 10 km','В радиусе 10 км','A menos de 10 km'),n0(d.p[1]))
       +row(L('Within 30 km','半径 30 km 以内','Im Umkreis von 30 km','В радиусе 30 км','A menos de 30 km'),n0(d.p[2]))
       +row(L('Within 100 km','半径 100 km 以内','Im Umkreis von 100 km','В радиусе 100 км','A menos de 100 km'),n0(d.p[3]))
       +note(L('Population counts are the Global Volcanism Program’s own figures for this volcano.','人口は、GVP がこの火山について公表している値です。','Die Bevölkerungszahlen sind die Angaben des Global Volcanism Program für diesen Vulkan.','Данные о населении — собственные оценки GVP для этого вулкана.','Las cifras de población son las del propio Global Volcanism Program para este volcán.'));
    } else h+=hint(L('The Global Volcanism Program publishes no population figures for this volcano.','GVP はこの火山について人口の値を公表していません。','Das GVP veröffentlicht für diesen Vulkan keine Bevölkerungszahlen.','GVP не публикует данных о населении для этого вулкана.','El GVP no publica cifras de población para este volcán.'));

    /* hazard zones — real GIS or an explicit absence, never a modelled circle */
    h+=sec(L('Mapped hazard zones','公表されたハザード域','Kartierte Gefahrenzonen','Картированные зоны опасности','Zonas de peligro cartografiadas'));
    const hz=window.IntMapVolcanoLayers&&window.IntMapVolcanoLayers.hazardFor?window.IntMapVolcanoLayers.hazardFor(p.v):null;
    if(hz&&hz.length){
      h+=row(L('Zones published','公表されている区域','Veröffentlichte Zonen','Опубликованные зоны','Zonas publicadas'),hz.join(' · '))
       +'<button type="button" class="acp-mini" data-volcp="hazard">'+S(L('Draw them on the map','地図に表示','Auf der Karte zeichnen','Показать на карте','Dibujarlas en el mapa'))+'</button>';
    } else {
      h+=hint(L('No machine-readable hazard-zone GIS is published for this volcano. Pyroclastic-flow, ashfall and lahar zones exist on paper for many volcanoes and as data for very few; this map draws only the ones that exist as data, and says so for the rest rather than drawing a modelled circle.',
        'この火山については、機械可読なハザード域の GIS データが公表されていません。火砕流・降灰・ラハールの想定区域は多くの火山で紙のハザードマップとしては存在しますが、データとして公開されているものはごく僅かです。この地図はデータとして存在するものだけを描き、それ以外については「無い」と述べます（推定の円は描きません）。',
        'Für diesen Vulkan ist kein maschinenlesbares Gefahrenzonen-GIS veröffentlicht. Pyroklastik-, Aschefall- und Lahar-Zonen existieren für viele Vulkane auf Papier und für sehr wenige als Daten; diese Karte zeichnet nur letztere und sagt es sonst, statt einen modellierten Kreis zu malen.',
        'Для этого вулкана нет машиночитаемой ГИС зон опасности. Зоны пирокластических потоков, пеплопада и лахаров существуют на бумаге для многих вулканов и в виде данных — для единиц; карта рисует только вторые, а в остальных случаях говорит об отсутствии, а не рисует модельный круг.',
        'No se publica un SIG de zonas de peligro legible por máquina para este volcán. Las zonas de flujos piroclásticos, caída de ceniza y lahares existen en papel para muchos volcanes y como datos para muy pocos; este mapa dibuja solo estas últimas y, para el resto, lo dice en vez de dibujar un círculo modelado.'));
    }

    /* airports */
    h+=sec(L('Aerodromes nearby','周辺の空港','Flugplätze in der Nähe','Аэродромы поблизости','Aeródromos cercanos'));
    const A=(extra.forVn===p.v)?extra.apts:null;
    if(!A) h+='<button type="button" class="acp-mini" data-volcp="apts">'+S(L('Find aerodromes within 150 km','150 km 以内の空港を検索','Flugplätze im Umkreis von 150 km suchen','Найти аэродромы в радиусе 150 км','Buscar aeródromos en 150 km'))+'</button>';
    else if(A==='busy') h+=hint(L('Searching OpenStreetMap…','OpenStreetMap を検索中…','OpenStreetMap wird durchsucht…','Поиск в OpenStreetMap…','Buscando en OpenStreetMap…'));
    else if(!A.ok) h+=hint(L('OpenStreetMap did not answer.','OpenStreetMap が応答しませんでした。','OpenStreetMap hat nicht geantwortet.','OpenStreetMap не ответил.','OpenStreetMap no respondió.'));
    else if(!A.rows.length) h+=hint(L('No aerodrome is mapped within 150 km.','150 km 以内に空港はありません。','Im Umkreis von 150 km ist kein Flugplatz erfasst.','В радиусе 150 км аэродромов не найдено.','No hay aeródromos en 150 km.'));
    else for(const a of A.rows) h+=row(a.name+(a.icao?' ('+a.icao+')':''),Math.round(a.km)+' km');

    /* seismicity */
    h+=sec(L('Earthquakes nearby','周辺の地震','Erdbeben in der Nähe','Землетрясения поблизости','Sismos cercanos'));
    const Q=(extra.forVn===p.v)?extra.quakes:null;
    if(!Q) h+='<button type="button" class="acp-mini" data-volcp="quakes">'+S(L('Look for earthquakes within 50 km, last 30 days','50 km 以内・直近30日の地震を検索','Erdbeben im Umkreis von 50 km, letzte 30 Tage','Землетрясения в 50 км за 30 дней','Sismos en 50 km, últimos 30 días'))+'</button>';
    else if(Q==='busy') h+=hint(L('Asking the USGS earthquake catalog…','USGS 地震カタログに問い合わせ中…','USGS-Erdbebenkatalog wird abgefragt…','Запрос к каталогу землетрясений USGS…','Consultando el catálogo sísmico del USGS…'));
    else if(!Q.ok) h+=hint(L('The USGS earthquake catalog did not answer.','USGS 地震カタログが応答しませんでした。','Der USGS-Erdbebenkatalog hat nicht geantwortet.','Каталог землетрясений USGS не ответил.','El catálogo sísmico del USGS no respondió.'));
    else if(!Q.rows.length) h+=hint(L('The USGS catalog holds no earthquake within 50 km in the last 30 days. Volcanic seismicity is often too small or too shallow for the global catalog — a local network may still be recording it.',
      'USGS のカタログには、直近30日・50 km 以内の地震はありません。火山性地震は規模が小さく浅いことが多く、全球カタログに載らないことがあります（現地の観測網では観測されている場合があります）。',
      'Der USGS-Katalog enthält in den letzten 30 Tagen kein Beben im Umkreis von 50 km. Vulkanische Seismizität ist oft zu klein für den globalen Katalog.',
      'В каталоге USGS за 30 дней нет землетрясений в радиусе 50 км. Вулканическая сейсмичность часто слишком слаба для глобального каталога.',
      'El catálogo del USGS no tiene sismos en 50 km en los últimos 30 días. La sismicidad volcánica suele ser demasiado pequeña para el catálogo global.'));
    else {
      const mags=Q.rows.map(q=>q.m).filter(m=>m!=null);
      h+=row(L('Events','件数','Ereignisse','События','Eventos'),n0(Q.rows.length))
       +row(L('Largest','最大規模','Größtes','Максимум','Mayor'),mags.length?('M '+Math.max(...mags).toFixed(1)):'');
      for(const q of Q.rows.slice(0,10)){
        h+=row('M '+(q.m==null?'?':q.m.toFixed(1))+' · '+Math.round(q.km)+' km',
          (q.depth==null?'':Math.round(q.depth)+' km · ')+new Date(q.at).toLocaleString(loc(),{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}));
      }
      h+='<div class="acp-src">'+S('USGS Earthquake Hazards Program')+'</div>';
    }
    return h;
  }

  function bodyHTML(){
    const f=base(curVn);
    if(!f) return hint(L('This volcano is not in the loaded catalog.','この火山は読み込まれたカタログにありません。','Dieser Vulkan ist nicht im geladenen Katalog.','Этого вулкана нет в загруженном каталоге.','Este volcán no está en el catálogo cargado.'));
    const d=detailDoc&&detailDoc.volcanoes?detailDoc.volcanoes[String(curVn)]:null;
    if(tab==='history') return historyHTML(f,d);
    if(tab==='about') return aboutHTML(f,d);
    if(tab==='impact') return impactHTML(f,d);
    return nowHTML(f,d);
  }

  function render(){
    if(curVn==null) return; const e=ensureEl();
    const f=base(curVn), p=f?f.properties:null;
    const h=e.querySelector('#volcp-title');
    if(h) h.innerHTML=S((p&&p.n)||('#'+curVn))+(p&&p.c?'<span class="volc-sub">'+S(p.c)+'</span>':'');
    const tb=e.querySelector('#volcp-tabs'); if(tb) tb.innerHTML=tabsHTML();
    const b=e.querySelector('#volcp-body'); if(!b) return;
    b.innerHTML=bodyHTML();
  }

  function loadQuakes(){
    if(curVn==null) return; extra.forVn=curVn; extra.quakes='busy'; render();
    quakesNear(curVn,50,30).then(r=>{ if(extra.forVn===curVn){ extra.quakes=r; render(); } });
  }
  function loadAirports(){
    if(curVn==null) return; extra.forVn=curVn; extra.apts='busy'; render();
    airportsNear(curVn,150).then(r=>{ if(extra.forVn===curVn){ extra.apts=r; render(); } });
  }
  function openThermal(){
    const f=base(curVn); if(!f) return;
    try{ GE().camera.easeTo({ center:f.geometry.coordinates, zoom:Math.max(GE().camera.zoom(),7), duration:900 }); }catch(_){}
    try{ const cb=document.getElementById('dl-thermal'); if(cb&&!cb.checked){ cb.checked=true; cb.dispatchEvent(new Event('change')); } }catch(_){}
  }
  function gotoVolcano(){
    const f=base(curVn); if(!f) return false;
    try{ GE().camera.easeTo({ center:f.geometry.coordinates, zoom:Math.max(GE().camera.zoom(),9), duration:900 }); return true; }catch(_){ return false; }
  }

  function place(){
    const e=ensureEl(); const mc=document.getElementById('map-container'); if(!mc) return;
    if(e.dataset.placed==='1') return; e.dataset.placed='1';
    const r=mc.getBoundingClientRect();
    e.style.left=Math.max(12,r.width-e.offsetWidth-24)+'px'; e.style.top='84px';
  }

  function open(vn){
    if(vn==null) return false;
    vn=+vn; if(!isFinite(vn)) return false;
    if(curVn!==vn){ extra={ quakes:null, apts:null, forVn:vn }; tab='now'; }
    curVn=vn;
    const e=ensureEl(); e.style.display='block';
    render(); place();
    try{ HOST.bringToFront(e); }catch(_){}
    /* the two things the card needs and does not have yet, started together */
    detail().then(()=>{ if(curVn===vn) render(); });
    warm().then(()=>{ if(curVn===vn) render(); });
    return true;
  }
  function close(){ curVn=null; if(el) el.style.display='none'; }
  function isOpen(){ return !!(el&&el.style.display!=='none'&&curVn!=null); }

  /* the merged record, for Atlas and for anything else that wants the numbers without the card */
  async function record(vn){
    vn=+vn; await detail();
    const f=base(vn); if(!f) return null;
    const d=detailDoc&&detailDoc.volcanoes?detailDoc.volcanoes[String(vn)]:null;
    const fc=layerFC();
    return { v:vn, name:f.properties.n, country:f.properties.c, type:f.properties.t,
      elevation:f.properties.e, lastEruption:f.properties.y, region:f.properties.r,
      rock:f.properties.k!=null&&fc?fc.rocks[f.properties.k]:null,
      setting:f.properties.s!=null&&fc?fc.settings[f.properties.s]:null,
      maxVei:f.properties.x, eruptions:f.properties.q, pop30:f.properties.p,
      lngLat:f.geometry.coordinates,
      population:d?d.p:null, summary:d?d.g:null, subregion:d?d.sub:null,
      character:d?character(d.er):null, history:d?d.er:null, status:status(vn) };
  }
  function byName(q){
    const fc=layerFC(); if(!fc||!q) return [];
    const s=String(q).toLowerCase();
    return fc.features.filter(f=>String(f.properties.n||'').toLowerCase().indexOf(s)>=0)
      .slice(0,20).map(f=>({ v:f.properties.v, name:f.properties.n, country:f.properties.c }));
  }
  /* the health of each rung, so a legend can print three states rather than two */
  function feeds(){ const o={}; for(const k of Object.keys(FEEDS)) o[k]={ state:FEEDS[k].state, at:FEEDS[k].at, rows:FEEDS[k].rows?FEEDS[k].rows.length:0 }; return o; }

  const API={ open, close, isOpen, current:()=>curVn, record, status, statusIndex, byName,
    warm, feeds, onChange, quakesNear, airportsNear, detail, character,
    _jmaMap:JMA_TO_GVP, _jmaKey:jmaKey, _jmaLevel:jmaNum, _rank:RANK };
  window.IntMapVolcano=API;
  return API;
};
