/* ============================================================================
 *  IntMap · THE NIGHT-LIGHTS PRODUCT — window.IntMapNightLights   (#R550)
 * ----------------------------------------------------------------------------
 *  「夜間光レイヤーを、Chronosの時刻に応じて過去の夜間光へ切り替わる時系列レイヤーに。」
 *  「夜間光独自の別時計を新設しないでください。正本は window.IntMapTime。」
 *  「Chronosと凡例セレクトに二つの正本を作らない。どちらが正本かを1か所で決めてください。」
 *
 *  ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────────────────────────
 *  The same satellite night-lights product was being addressed from THREE places, each holding its
 *  own answer to 「いつの絵か」:
 *      · js/data-layers.js   `window._nightsatEpoch`, written only by the legend's <select>
 *      · js/night-side.js    the date '2016-01-01' spelled INSIDE the tile URL
 *      · js/compare.js       `.replace('/default/','/default/2016-01-01/')`
 *  Three copies of one fact is the shape CONSTITUTION §1 names — 「片方だけが直る」 — and here it
 *  had already happened: the manual layer could be moved to 2012 and the globe's night side stayed
 *  in 2016, showing two different years of the same product in one frame.
 *
 *  So the epoch is not a variable any more. It is a FUNCTION OF THE CLOCK, computed here and
 *  nowhere else. There is no `_nightsatEpoch` to disagree with `IntMapTime`, because the only
 *  state this module has is the clock's, and the only thing it remembers is which epoch it last
 *  told its subscribers about — so that a year change WITHIN one epoch costs nothing (see `on`).
 *
 *  ── WHAT THE EPOCHS ARE, MEASURED ───────────────────────────────────────────────────────────────
 *  ⚠ THIS IS NOT AN ANNUAL SERIES, BECAUSE THERE IS NO ANNUAL SERIES TO HAVE. Re-measured
 *  2026-09-08 against GIBS itself, not against #R268's note:
 *    · `VIIRS_Black_Marble` AND `VIIRS_Night_Lights`, on all three GIBS endpoints (best / std / nrt),
 *      declare exactly two Time values — 2012-01-01/2012-01-01/P1Y and 2016-01-01/2016-01-01/P1Y.
 *      A request for any other year answers 404; GIBS does not substitute silently.
 *    · The daily Black Marble that DOES span 2012→today
 *      (`VIIRS_SNPP_GapFilled_BRDF_Corrected_DayNightBand_Radiance`, z0–8, key-free, CORS *) was
 *      fetched and decoded at Tokyo z8 for 2013/2014/2016/2019/2022/2024/2026: it is a GREYSCALE
 *      SINGLE-NIGHT radiance image with 2.4–3.7× the Laplacian energy of Black Marble
 *      (44–68 vs 18.3) and 99 % of the tile above the lit threshold — i.e. a speckled grey
 *      background, not a composite. 「背景ノイズが増えていない」 rules it out as a substitute.
 *  The two epochs are therefore the whole of what exists at this quality, and the layer says so
 *  rather than inventing the years in between (「存在しない年を存在するように見せない」).
 *
 *  ── THE SELECTION RULE ──────────────────────────────────────────────────────────────────────────
 *      Chronos instant → year → epoch
 *    · live (now)            → the most recent epoch
 *    · year < ERA_FROM       → NO DATA. Not «the nearest epoch»: VIIRS DNB did not exist. Suomi NPP
 *                              launched 2011-10-28 and the first Black Marble composite is 2012, so
 *                              a 1990 map has no night lights to be nearest to, and drawing 2012 for
 *                              it would be 「存在しない年を存在するように見せる」. The floor is the
 *                              sensor's, not a tuned number; it expires if NASA publishes earlier.
 *    · otherwise             → the epoch with the smallest |year − epoch.year|; an exact tie (2014,
 *                              the midpoint) resolves to the LATER epoch, so a scrub through the
 *                              gap changes picture once, at one place, in the direction of travel.
 *
 *  ⚠ NOTHING HERE FETCHES. This module knows URLs and answers questions; whether a tile is asked
 *  for is the caller's business, which is what makes 「夜間光OFF時は追加通信0」 true by construction
 *  — js/data-layers.js only owns a raster source while the layer is on, and js/night-side.js only
 *  builds at whole-Earth zooms over the satellite basemap.
 * ==========================================================================*/
window.IntMapNightLights=(function(){
  'use strict';
  /* ⚠ ONE ROW PER EPOCH, AND EVERY FIELD IS SOMETHING THE READER IS SHOWN OR THE RENDERER USES.
     `gibs` is the GIBS layer identifier; `maxzoom` is the deepest TileMatrix that product publishes
     (GoogleMapsCompatible_Level8 → z8; z9 answers HTTP 400, measured). `resM` is the product's own
     native resolution, stated because the legend states it. */
  const EPOCHS=[
    { id:'2012-01-01', year:2012, gibs:'VIIRS_Black_Marble', maxzoom:8, resM:500,
      product:'VIIRS Black Marble', sensor:'VIIRS / Suomi NPP', source:'NASA EOSDIS GIBS' },
    { id:'2016-01-01', year:2016, gibs:'VIIRS_Black_Marble', maxzoom:8, resM:500,
      product:'VIIRS Black Marble', sensor:'VIIRS / Suomi NPP', source:'NASA EOSDIS GIBS' }
  ];
  /* the first year the sensor could produce one of these at all (Suomi NPP: launched 2011-10-28) */
  const ERA_FROM=EPOCHS[0].year;

  const clone=(e)=>e?({ id:e.id, year:e.year, gibs:e.gibs, maxzoom:e.maxzoom, resM:e.resM,
                        product:e.product, sensor:e.sensor, source:e.source }):null;

  /* the tile template — the SAME string js/data-layers.js has always built through `gibs()`, kept
     here so that the layer, the globe's night side and the compare window cannot drift apart */
  function url(ep,ext){ const e=at(ep); if(!e) return null;
    return 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/'+e.gibs+'/default/'+e.id
          +'/GoogleMapsCompatible_Level'+e.maxzoom+'/{z}/{y}/{x}.'+(ext||'png'); }
  /* …and the same one with the tile coordinates substituted, for the canvas mosaic (js/night-side.js) */
  function tileURL(ep,z,x,y){ const u=url(ep); return u?u.replace('{z}',z).replace('{y}',y).replace('{x}',x):null; }

  function at(ep){ if(!ep) return null; if(typeof ep==='object') return byId(ep.id); return byId(ep); }
  function byId(id){ for(let i=0;i<EPOCHS.length;i++) if(EPOCHS[i].id===id) return EPOCHS[i]; return null; }

  /* ⚠ THE SELECTION IS A PURE FUNCTION OF A YEAR — no clock read, no state — so a test can ask it
     about every year without a browser, and #R505's lesson holds: this is EVALUATED by the checks,
     not read as source. */
  function forYear(y){ y=Math.round(+y);
    if(!isFinite(y)||y<ERA_FROM) return null;
    let best=EPOCHS[0];
    for(let i=1;i<EPOCHS.length;i++){
      const d=Math.abs(y-EPOCHS[i].year), b=Math.abs(y-best.year);
      if(d<b||(d===b&&EPOCHS[i].year>best.year)) best=EPOCHS[i];
    }
    return best; }
  /* live (null instant) is «today», and today's most recent record is the newest epoch */
  function forInstant(d){ if(d==null) return EPOCHS[EPOCHS.length-1];
    const t=(d instanceof Date)?d:new Date(d); if(isNaN(t.getTime())) return EPOCHS[EPOCHS.length-1];
    return forYear(t.getFullYear()); }

  /* the clock, asked the way every other subsystem asks it */
  function clockYear(){ try{ const T=window.IntMapTime;
    if(T&&T.isLive&&T.isLive()) return null;
    if(T&&T.year) return T.year(); }catch(_){} return null; }
  function current(){ const y=clockYear(); return (y==null)?EPOCHS[EPOCHS.length-1]:forYear(y); }

  /* ── who is listening ────────────────────────────────────────────────────────────────────────────
     ⚠ (#R550) SUBSCRIBERS HEAR ABOUT EPOCHS, NOT ABOUT THE CLOCK. 「同じepochへの不要な再取得を
     しない」 is not a caller's duty here: moving 2017 → 2018 → 2019 resolves to the same epoch every
     time and this loop simply does not run, so no source is re-pointed and no tile is re-asked. */
  const subs=[]; let lastId=_id(current());
  function _id(e){ return e?e.id:''; }
  function announce(){ const e=current(), id=_id(e);
    if(id===lastId) return false;
    lastId=id;
    subs.forEach(f=>{ try{ f(clone(e)); }catch(_){} });
    return true; }
  try{ if(window.IntMapTime&&window.IntMapTime.on) window.IntMapTime.on(()=>{ announce(); }); }catch(_){}

  return {
    epochs:()=>EPOCHS.map(clone),
    eraFrom:()=>ERA_FROM,
    forYear:(y)=>clone(forYear(y)),
    forInstant:(d)=>clone(forInstant(d)),
    current:()=>clone(current()),
    /* the year the CLOCK is on (null = live) — so a reader can compare it with the epoch's year
       without asking two different objects what time it is */
    clockYear,
    tiles:(ep)=>{ const u=url(ep||current()); return u?[u]:[]; },
    tileURL:(z,x,y,ep)=>tileURL(ep||current(),z,x,y),
    maxzoom:(ep)=>{ const e=at(ep||current()); return e?e.maxzoom:8; },
    attribution:(ep)=>{ const e=at(ep||current()); return e?(e.source+' — '+e.product+' '+e.year):''; },
    on:(fn)=>{ if(typeof fn!=='function') return ()=>{};
      subs.push(fn); return ()=>{ const i=subs.indexOf(fn); if(i>=0) subs.splice(i,1); }; },
    /* for the tests and for Atlas' state snapshot: what is on screen, and whether the clock's year
       is the picture's year */
    state:()=>{ const e=current(), y=clockYear();
      return { epoch:e?e.id:null, year:e?e.year:null, clockYear:y, live:y==null,
               matches:!!(e&&(y==null||y===e.year)), product:e?e.product:null,
               sensor:e?e.sensor:null, source:e?e.source:null, maxzoom:e?e.maxzoom:null,
               resM:e?e.resM:null, eraFrom:ERA_FROM, epochs:EPOCHS.map(x=>x.id) }; },
    _announce:announce   /* the clock subscription calls this; the checks call it to prove coalescing */
  };
})();
