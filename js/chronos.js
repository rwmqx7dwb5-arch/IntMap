/* ============================================================================
 *  IntMap · CHRONOS — the spacetime kernel   (#R94, named and moved out #R289)
 * ----------------------------------------------------------------------------
 *  「IntMap統一時間機能を、これよりChronosという名称に。」 The one master clock the whole app
 *  runs on. It was declared inside js/app-body.js's DOMContentLoaded closure; naming it is what
 *  made it a subject, and a subject gets its own file (tests/r168 #8 — the shell's ceiling comes
 *  DOWN, never up, and this round adds to the shell).
 *
 *  ⚠ NOTHING ABOUT IT CHANGED IN THE MOVE. The body below is #R94's, word for word, with two
 *  edits and no others:
 *    · `ymdISO` was a helper in the closure and is four characters of arithmetic — it is declared
 *      here rather than reached for;
 *    · `newsDate` — the recent-archive facet — was ASSIGNED from inside broadcast(). It is a
 *      js/app-body.js closure variable and cannot be assigned from another file, so app-body now
 *      keeps it in lock-step through an ordinary subscriber, registered FIRST, which is the same
 *      guarantee the inline assignment gave: every later subscriber still sees the fresh value.
 *
 *  ⚠ IT IS NOW PUBLISHED AT IMPORT TIME rather than at DOMContentLoaded, which is strictly
 *  earlier than before — no module could have subscribed in between, because every factory is
 *  called from js/app-body.js, which is imported last.
 *
 *  ⚠ THE NAME `window.IntMapTime` DOES NOT CHANGE. 「Chronos」 is what the reader calls it; the
 *  global is what ~30 files call it, and renaming a contract to match a label would be a rename
 *  for its own sake. The panel (js/news-timeline.js) is where the name is spoken.
 * ==========================================================================*/
/* (#R94)'s own note, kept because it is the argument for the design:
 *  INTMAP TIME — the SPACETIME KERNEL. One master clock the whole app runs on.
 *  The time slider, the date/year inputs, Earth Replay and Atlas all WRITE to this
 *  single kernel; every time-aware subsystem (news, the dated NASA rasters, the
 *  Countries statistics, the NATO/EU accession fills, historical borders, the Köppen
 *  climate era and the day/night terminator) SUBSCRIBES to it (IntMapTime.on) and
 *  reconstructs itself for the chosen instant. `newsDate` stays the recent-archive
 *  facet (kept in lock-step) so every existing news/raster reader is untouched; the
 *  kernel adds deep-time reach (back to year 1 — #R604; it was 1850 in #R349 and 1900 before that) for the
 *  subsystems that carry a real
 *  historical series. Single source of truth = _when (a Date, or null = LIVE/now).
 *  When LIVE, every subsystem holds its own independent default; the moment you travel
 *  to a past instant they all sync to it, and returning to "Now" releases them. ====== */
window.IntMapTime=(function(){
  /* ⚠⚠⚠ (#R679) `toISOString().slice(0,10)` WAS NOT A DATE ONCE THE FLOOR WENT BELOW YEAR 0.
     ECMA-262 writes a year outside 0…9999 in the expanded form, so an instant in 323 BC comes
     back as `-000322-01-01T00:00:00.000Z` and its first ten characters are `-000322-01` — a
     string with no day in it, broadcast to every subscriber as `e.iso`. Measured on Node 24
     before the fix. Same shape as #R604's `Date.UTC` trap one floor down: a rule that was right
     for every year the clock could reach starts lying the moment the floor moves, silently.
     ⚠ AND THERE WERE TWO COPIES — this one and js/app-body.js's, which is what `HOST.ymdISO`
     hands the news feed and the screenshot filename. The rule now has ONE owner
     (js/hist-scale.js `ymd`) and both read it; the local body is the same four lines, for a
     page on which hist-scale has not evaluated. */
  function ymdISO(d){
    try{ const HS=window.IntMapHistScale; if(HS&&HS.ymd) return HS.ymd(d); }catch(_){}
    const y=d.getUTCFullYear(), p=n=>String(n).padStart(2,'0');
    const ys=(y>=0&&y<=9999)?String(y).padStart(4,'0'):(y<0?'-':'+')+String(Math.abs(y)).padStart(6,'0');
    return ys+'-'+p(d.getUTCMonth()+1)+'-'+p(d.getUTCDate()); }
  /* ⚠ (#R679) THE FLOOR IS NOT A NUMBER THIS FILE OWNS ANY MORE. It is the oldest year the
     deepest subsystem can answer, and that subsystem's own arithmetic file states it with the
     measurement and the expiry beside it (js/hist-scale.js `FLOOR`), where a gate compares it
     against the shipped era bundle. A copy here is what #R604 spent a round undoing. */
  const subs=[]; let _when=null; let _bcast=false;
  /* ⚠⚠⚠ READ, NOT CAPTURED. `src/main.js:77` imports THIS FILE BEFORE js/hist-scale.js, so a
     `const YMIN = HS.FLOOR` evaluated here reads `undefined` and falls back to 1 — the floor
     would be silently wrong, every deep-time subsystem would be clamped, and nothing would
     throw. Reordering the two imports would fix this one site and leave the shape (the app
     shell's order is load-bearing and tests/r175-checks exists because of it); reading the
     value at CALL time removes the ordering question instead of answering it. Every caller of
     `ymin()` runs long after both modules have evaluated. */
  const ymin=()=>{ try{ const v=window.IntMapHistScale&&window.IntMapHistScale.FLOOR;
    if(Number.isFinite(v)) return Math.round(v); }catch(_){} return 1; };
  /* ⚠⚠⚠ (#R604) `new Date(Date.UTC(y,…))` IS NOT A DATE IN YEAR y WHEN y < 100 — IT IS y+1900.
     ECMA-262's Date.UTC applies the two-digit-year rule to its first argument, so Date.UTC(1,0,1)
     is 1901-01-01 and Date.UTC(50,…) is 1950. That silent shift is the whole reason a clock floor
     below 100 is not just a smaller number: every construction of an instant in this kernel has to
     go through `setUTCFullYear`, which does NOT apply the rule. Measured before the fix — asking for
     year 1 landed the map in 1901 and drew 1901's boundaries under the label «1年».
  ⚠ AND IT HAS TWO CALLERS, so the rule lives in js/hist-scale.js (`utcAt`) rather than here: the
     Chronos panel's own floor was still going through `Date.UTC` after this file was fixed, and a
     copy here is exactly what made that invisible. The local body is the fallback for a page on
     which js/hist-scale.js has not evaluated, and it is the same four lines. */
  function atUTC(y,mo,d,h,mi,s){
    try{ const HS=window.IntMapHistScale; if(HS&&HS.utcAt) return HS.utcAt(y,mo,d,h,mi,s); }catch(_){}
    const t=new Date(0); t.setUTCFullYear(y,mo,d); t.setUTCHours(h||0,mi||0,s||0,0); return t; }
  /* ⚠ (#R349, lowered again #R604) THE FLOOR IS THE CLOCK'S, NOT ANY ONE SUBSYSTEM'S.
     「1850年までさかのぼれるように。（1900までと完全に同様に。単に対応年を延長するだけです。）」(#R349)
     「歴史的地方区分の境界線のcoverageがくそ。全時代、全地域で完璧に網羅しろ。」(#R604)
     Every subsystem below reaches as far back as ITS OWN SOURCE reaches and says so where it stops —
     the kernel does not pretend they all stop together, and it never clamps a reader to the shortest
     of them:
       · subdivisions the deepest reach on the map, and the reason the floor moved to 1 (#R604):
                      OpenHistoricalMap's own vector tiles, date-filtered per frame, hold dated
                      admin_level 3-6 units in every century — measured on a 160-tile z5 sweep,
                      936 line segments in force in year 1, 1,195 in 1000, 3,712 in 1500, 8,341 in
                      1900. Older centuries are REGIONALLY thin (year 1 touches 14 of those tiles
                      against 1900's 66) and the layer row says so rather than filling it in.
       · borders      day-exact for the WHOLE reach since #R518: CShapes 2.0 from 1886-01-01 to 2019,
                      OpenHistoricalMap (data/hist-borders.js) from 1689 to 1885 — #R690 widened
                      that band from 1850, and its floor is DERIVED from how much land the record
                      covers rather than chosen. The historical-basemaps snapshots are now only the
                      fallback for both bands, and
                      before 1689 they are the only country answer there is.
       · GDP / pop    Maddison Project 2020, now carried back to 1850 (data/maddison.json — measured, not
                      declared: js/history.js reads the smallest year in the shipped file).
       · climate era  the oldest Köppen period that exists is 1901-1930; earlier years show it and
                      are labelled with the period, so nobody reads 1850 weather off a 1901 raster.
     Lowering this number is therefore the whole of «extend the supported years» for the kernel; what
     each subsystem does with a year it cannot source is that subsystem's own answer. */
  const now=()=>new Date();
  function ev(source){ const w=_when, live=(w==null); const d=live?now():new Date(w);
    return { date: live?null:new Date(w), when:d, iso: ymdISO(d), year:d.getFullYear(), isLive:live, source:source||'api' }; }
  function broadcast(source){ if(_bcast) return; _bcast=true;
    const e=ev(source);
    /* (#R289) `newsDate` was assigned HERE and it is a js/app-body.js closure variable, which
       another file cannot write. That file keeps it in lock-step through an ordinary subscriber
       registered before any other, so every later subscriber still sees the fresh value —
       which is the only property the inline assignment was providing. */
    subs.forEach(f=>{ try{ f(e); }catch(_){} });
    _bcast=false; return e; }
  const OS={};
  OS.get=()=>_when?new Date(_when):null;         /* the raw instant, or null when live */
  OS.when=()=>_when?new Date(_when):now();       /* always a Date (now when live) */
  OS.iso=()=>ymdISO(_when||now());
  OS.year=()=>(_when||now()).getFullYear();
  OS.isLive=()=>_when==null;
  try{ Object.defineProperty(OS,'min',{get:ymin,enumerable:true,configurable:true}); }catch(_){ OS.min=ymin(); }
  OS.state=()=>ev('query');
  OS.on=function(fn){ if(typeof fn==='function'){ subs.push(fn); return ()=>{ const i=subs.indexOf(fn); if(i>=0) subs.splice(i,1); }; } return ()=>{}; };
  OS.set=function(d,opts){ opts=opts||{};
    let nd=(d instanceof Date)?new Date(d):(d!=null?new Date(d):null);
    if(nd && isNaN(nd.getTime())) return OS;
    if(nd){ const floor=atUTC(ymin(),0,1); if(nd<floor) nd=floor;
      if(!opts.allowFuture){ const n=now(); if(nd.getTime()>n.getTime()) nd=null; } }   /* future → live */
    _when=nd; return broadcast(opts.source), OS; };
  OS.setYear=function(y,opts){ y=Math.round(+y); if(!(y>=ymin())) return OS;
    const n=now(); if(y>=n.getFullYear()) return OS.setNow(opts);
    return OS.set(atUTC(y,5,15,12,0,0), opts); };   /* mid-June noon UTC: neutral season/terminator */
  OS.setDaysAgo=function(days,opts){ days=Math.round(+days||0);
    if(days<=0) return OS.setNow(opts);
    const d=new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()-days); return OS.set(d,opts); };
  OS.setNow=function(opts){ _when=null; return broadcast((opts||{}).source), OS; };
  return OS;
})();
