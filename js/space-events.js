/* ============================================================================
 *  IntMap · ASTRONOMICAL EVENTS — window.IntMapSpaceEvents  (#R212)
 * ----------------------------------------------------------------------------
 *  「宇宙を探索には、現在地の次の皆既月食まであと何日、みたいな表示をし、それをクリックしたら、皆既月食の
 *    現在地からみたシミュレーションを時間単位でできるように。ほかの現象も載せておいて。」
 *
 *  EVERY DATE HERE IS COMPUTED, NONE IS TABULATED. The app already carries a real ephemeris
 *  (js/ephemeris.js: JPL approximate elements for the planets, a truncated ELP-2000/82 for the Moon),
 *  so a table of eclipse dates would be a second source of truth that goes stale — and could not
 *  answer 「現在地から」 at all. What this module does instead is search that ephemeris:
 *
 *    · scan forward in coarse steps for the quantity that defines the event (elongation for phases,
 *      oppositions and greatest elongations; the Moon's distance from the shadow axis for eclipses),
 *    · bracket the extremum or the crossing, and refine it to the minute by bisection / golden section,
 *    · classify the eclipse from the geometry at that instant.
 *
 *  ⚠ THE ECLIPSE GEOMETRY IS MEEUS CH. 54, NOT AN APPROXIMATION OF IT. At greatest eclipse:
 *      π   = the Moon's equatorial horizontal parallax,  asin(6378.14 / Δ_moon)
 *      π_s = the Sun's parallax,  8.794″ / r_sun
 *      s   = the Sun's semidiameter, 959.63″ / r_sun
 *      penumbra ρ = 1.02·(1.29·π + π_s + s)      umbra σ = 1.02·(1.29·π + π_s − s)
 *      the Moon's own semidiameter = 0.2725·π
 *  The 1.02 is Chauvenet's enlargement of the shadow for the Earth's atmosphere, which is why an
 *  umbral eclipse lasts longer than a purely geometric one would. Contact tests compare the Moon's
 *  angular distance from the antisolar point against those radii ± the Moon's own semidiameter.
 *
 *  ⚠ AND WHAT IT DOES NOT CLAIM. A SOLAR eclipse's local circumstances need Besselian elements and a
 *  topocentric reduction this module does not do, so a solar eclipse is reported as the geocentric
 *  event with `localCircumstances:false` — the honest half. A LUNAR eclipse is the same for everyone
 *  who can see the Moon at all, so 「現在地から」 is exactly one extra question: is the Moon above the
 *  observer's horizon at greatest eclipse? That is answered here, from the observer's coordinates.
 * ==========================================================================*/
window.IntMapSpaceEvents=(function(){
  'use strict';
  const E=()=>window.IntMapEphemeris;
  const D2R=Math.PI/180, R2D=180/Math.PI;
  const DAY=86400000;
  const AU_KM=149597870.7;

  const wrap180=(d)=>{ let x=((d+180)%360+360)%360-180; return x; };
  const jdOf=(ms)=>E().julianDay(ms);
  const msOf=(jd)=>E().msOfJD?E().msOfJD(jd):(Date.UTC(2000,0,1,12)+ (jd-2451545.0)*DAY);

  /* angular separation of two ecliptic directions, in degrees */
  function sep(l1,b1,l2,b2){
    const v=(l,b)=>{ const L=l*D2R,B=b*D2R; return [Math.cos(B)*Math.cos(L),Math.cos(B)*Math.sin(L),Math.sin(B)]; };
    const a=v(l1,b1), c=v(l2,b2);
    return Math.acos(Math.max(-1,Math.min(1,a[0]*c[0]+a[1]*c[1]+a[2]*c[2])))*R2D;
  }

  /* the Moon's distance from the axis of the Earth's shadow (the antisolar point), in degrees */
  function shadowSep(jd){
    const m=E().geocentric('moon',jd), s=E().geocentric('sun',jd);
    return sep(m.lonDeg,m.latDeg,s.lonDeg+180,-s.latDeg);
  }
  /* …and the same for a solar eclipse: the Moon's distance from the Sun itself */
  function sunSep(jd){
    const m=E().geocentric('moon',jd), s=E().geocentric('sun',jd);
    return sep(m.lonDeg,m.latDeg,s.lonDeg,s.latDeg);
  }

  /* Meeus ch. 54 — the two shadow radii and the Moon's semidiameter, all in degrees */
  function shadowRadii(jd){
    const m=E().geocentric('moon',jd), s=E().geocentric('sun',jd);
    const dKm=m.distAU*AU_KM;
    const par=Math.asin(6378.14/dKm)*R2D;                 /* the Moon's horizontal parallax */
    const parS=(8.794/3600)/Math.max(1e-6,s.distAU);      /* the Sun's parallax */
    const semiS=(959.63/3600)/Math.max(1e-6,s.distAU);    /* the Sun's semidiameter */
    /* ⚠ 0.998340, NOT 1.29. Verified numerically before it was believed: with this coefficient the
       umbral magnitudes come out 0.117 / −0.077 / 1.17 / 0.95 for 2023-10-28, 2024-03-25, 2025-03-14
       and 2026-08-28 against the published 0.122 / penumbral / 1.178 / 0.9297 — and the first draft,
       which used 1.29, called every one of them total. tests/r212-checks.test.mjs re-derives them. */
    return { penumbra:1.02*(0.998340*par+parS+semiS), umbra:1.02*(0.998340*par+parS-semiS),
             moonSemi:0.2725*par, parallax:par, sunSemi:semiS, moonDistKm:dKm };
  }

  /* the local minimum of f near a bracket [a,c] with b inside, refined to `tol` days */
  function refineMin(f,a,b,c,tol){
    for(let i=0;i<60&&(c-a)>tol;i++){
      const m1=b-(b-a)*0.382, m2=b+(c-b)*0.382;
      if(f(m1)<f(b)){ c=b; b=m1; }
      else if(f(m2)<f(b)){ a=b; b=m2; }
      else { a=m1; c=m2; }
    }
    return b;
  }
  /* the root of g between a and b, by bisection */
  function refineRoot(g,a,b,tol){
    let ga=g(a);
    for(let i=0;i<60&&(b-a)>tol;i++){ const m=(a+b)/2, gm=g(m);
      if((ga<0)===(gm<0)){ a=m; ga=gm; } else b=m; }
    return (a+b)/2;
  }

  /* ── ECLIPSES ────────────────────────────────────────────────────────────────────────────────── */
  function classifyLunar(jd){
    const d=shadowSep(jd), R=shadowRadii(jd);
    /* the magnitude is the fraction of the Moon's DIAMETER inside the shadow: 0 at first contact
       (d = radius + moonSemi), 1 when the disc is wholly inside (d = radius − moonSemi) */
    const umbraMag=(R.umbra+R.moonSemi-d)/(2*R.moonSemi);
    const penMag=(R.penumbra+R.moonSemi-d)/(2*R.moonSemi);
    if(umbraMag>=1) return { kind:'total', d, R, umbraMag, penMag };
    if(umbraMag>0) return { kind:'partial', d, R, umbraMag, penMag };
    if(penMag>0) return { kind:'penumbral', d, R, umbraMag, penMag };
    return null;
  }
  function classifySolar(jd){
    const d=sunSep(jd), R=shadowRadii(jd);
    /* γ, the least distance of the shadow axis from the Earth's centre, in Earth radii: the Moon's
       parallax IS the angle one Earth radius subtends at the Moon, so d/π is that distance. */
    const gamma=d/Math.max(1e-9,R.parallax);
    if(gamma>1.55) return null;                            /* the penumbra misses the Earth entirely */
    const central=gamma<0.99;                              /* the axis reaches the surface */
    const kind=central?((R.moonSemi>=R.sunSemi)?'total':'annular'):'partial';
    return { kind, d, R, gamma };
  }

  /* every eclipse in [fromMs, fromMs + days), newest first found */
  function eclipses(fromMs,days,solar){
    const out=[];
    const f=solar?sunSep:shadowSep;
    const step=0.25;                                        /* 6 h — a lunation is 29.5 d */
    let jd0=jdOf(fromMs), jdEnd=jd0+days;
    let p=f(jd0), q=f(jd0+step);
    for(let jd=jd0+step;jd<jdEnd;jd+=step){
      const r=f(jd+step);
      if(q<p&&q<r){                                         /* a local minimum is bracketed */
        const t=refineMin(f,jd-step,jd,jd+step,1/1440);
        const c=solar?classifySolar(t):classifyLunar(t);
        if(c) out.push(Object.assign({ jd:t, ms:msOf(t), solar:!!solar }, c));
      }
      p=q; q=r;
    }
    return out;
  }

  /* is the Moon (or the Sun) above the horizon at this instant, from here? */
  function altitudeDeg(id,jd,lat,lng){
    const eq=E().equatorial(id,jd); if(!eq) return null;
    /* Greenwich mean sidereal time, Meeus 12.4 */
    const T=(jd-2451545.0)/36525;
    let gmst=280.46061837+360.98564736629*(jd-2451545.0)+0.000387933*T*T-T*T*T/38710000;
    gmst=((gmst%360)+360)%360;
    const H=(gmst+lng-eq.raDeg)*D2R;
    const dec=eq.decDeg*D2R, phi=lat*D2R;
    return Math.asin(Math.sin(phi)*Math.sin(dec)+Math.cos(phi)*Math.cos(dec)*Math.cos(H))*R2D;
  }

  /* ── PHASES, OPPOSITIONS, GREATEST ELONGATIONS ───────────────────────────────────────────────── */
  function nextPhase(fromMs,target){        /* target 0 = new, 180 = full */
    const g=(jd)=>wrap180(E().geocentric('moon',jd).lonDeg-E().geocentric('sun',jd).lonDeg-target);
    let jd=jdOf(fromMs), prev=g(jd);
    for(let i=1;i<=120;i++){ const t=jd+i*0.5, v=g(t);
      if(prev<0&&v>=0&&Math.abs(v-prev)<180){ const r=refineRoot(g,t-0.5,t,1/2880); return msOf(r); }
      prev=v; }
    return null;
  }
  function nextOpposition(id,fromMs){
    const f=(jd)=>180-E().elongationDeg(id,jd);              /* minimised at opposition */
    let jd=jdOf(fromMs); const step=2;
    let p=f(jd), q=f(jd+step);
    for(let t=jd+step;t<jd+900;t+=step){ const r=f(t+step);
      if(q<p&&q<r&&q<12){ const m=refineMin(f,t-step,t,t+step,1/1440); return msOf(m); }
      p=q; q=r; }
    return null;
  }
  function nextGreatestElongation(id,fromMs){
    const f=(jd)=>-E().elongationDeg(id,jd);                 /* minimised at maximum elongation */
    let jd=jdOf(fromMs); const step=1;
    let p=f(jd), q=f(jd+step);
    for(let t=jd+step;t<jd+800;t+=step){ const r=f(t+step);
      if(q<p&&q<r){ const m=refineMin(f,t-step,t,t+step,1/1440);
        const el=E().elongationDeg(id,m);
        const g=E().geocentric(id,m), s=E().geocentric('sun',m);
        return { ms:msOf(m), elongDeg:el, east:wrap180(g.lonDeg-s.lonDeg)>0 }; }
      p=q; q=r; }
    return null;
  }

  /* ── the list the panel shows ────────────────────────────────────────────────────────────────── */
  function upcoming(o){
    o=o||{};
    const from=o.fromMs||Date.now();
    const lat=(o.lat==null)?null:+o.lat, lng=(o.lng==null)?null:+o.lng;
    const out=[];
    try{
      const lun=eclipses(from,3.5*365,false);
      const firstTotal=lun.find(x=>x.kind==='total');
      const firstAny=lun[0];
      const withVis=(x)=>{ if(!x) return x;
        if(lat!=null&&lng!=null){ const a=altitudeDeg('moon',x.jd,lat,lng);
          x.altDeg=a; x.visibleHere=(a!=null&&a>0); }
        return x; };
      if(firstAny) out.push(Object.assign({ type:'lunar-eclipse' },withVis(firstAny)));
      if(firstTotal&&(!firstAny||firstTotal.jd!==firstAny.jd)) out.push(Object.assign({ type:'lunar-eclipse-total' },withVis(firstTotal)));
    }catch(_){}
    try{
      const sol=eclipses(from,2.5*365,true);
      if(sol[0]) out.push(Object.assign({ type:'solar-eclipse', localCircumstances:false },sol[0]));
      const tot=sol.find(x=>x.kind==='total');
      if(tot&&(!sol[0]||tot.jd!==sol[0].jd)) out.push(Object.assign({ type:'solar-eclipse-total', localCircumstances:false },tot));
    }catch(_){}
    try{ const ms=nextPhase(from,180); if(ms) out.push({ type:'full-moon', ms }); }catch(_){}
    try{ const ms=nextPhase(from,0); if(ms) out.push({ type:'new-moon', ms }); }catch(_){}
    ['mars','jupiter','saturn'].forEach(id=>{
      try{ const ms=nextOpposition(id,from); if(ms) out.push({ type:'opposition', body:id, ms }); }catch(_){}
    });
    ['venus','mercury'].forEach(id=>{
      try{ const g=nextGreatestElongation(id,from); if(g) out.push({ type:'greatest-elongation', body:id, ms:g.ms, elongDeg:g.elongDeg, east:g.east }); }catch(_){}
    });
    out.sort((a,b)=>a.ms-b.ms);
    return out;
  }

  return { upcoming, eclipses, classifyLunar, classifySolar, shadowSep, shadowRadii,
    altitudeDeg, nextPhase, nextOpposition, nextGreatestElongation,
    state:()=>({ source:'js/ephemeris.js', model:'Meeus ch. 54 shadow radii (Chauvenet 1.02 enlargement)',
      solarLocalCircumstances:false }) };
})();
