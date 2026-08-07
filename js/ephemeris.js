/* ============================================================================
 *  IntMap · WHERE THE PLANETS ACTUALLY ARE — window.IntMapEphemeris  (#R197)
 * ----------------------------------------------------------------------------
 *  「太陽系を実寸大/モデル大で完全に主要天体をシミュレートしたものも。（過去、live、未来があり、
 *    実際の日時と位置がすべて正確。物理要素も忠実に。）」
 *
 *  "The real date and the real position" is a claim, so this file is the part of the space explorer
 *  that can be checked against something. It computes heliocentric positions from PUBLISHED elements
 *  and nothing here is drawn, animated or styled — js/space.js does that, and can be wrong about
 *  colours without being wrong about astronomy.
 *
 *  ── THE PLANETS ─────────────────────────────────────────────────────────────────────────────────
 *  Keplerian elements and their rates from JPL Solar System Dynamics, "Approximate Positions of the
 *  Major Planets" (Standish). Two tables:
 *
 *    · 1800 AD – 2050 AD, six elements and six rates per body. Stated accuracy over that span: the
 *      heliocentric ecliptic longitude is good to a few arcminutes for the inner planets and a few
 *      tens of arcminutes for the outer ones;
 *    · 3000 BC – 3000 AD, the same six with four extra terms (b, c, s, f) added to the mean anomaly
 *      for Jupiter through Pluto, which is what keeps the great inequality of Jupiter and Saturn from
 *      walking off over three thousand years.
 *
 *  The second table is used, so the app's time machine may run from 3000 BC to 3000 AD and the
 *  positions remain the published ones rather than an extrapolation of a 250-year fit.
 *
 *  ⚠ THESE ARE APPROXIMATE ELEMENTS AND THE APP SAYS SO. They are not JPL DE440. What they are good
 *  for is exactly what this feature does — showing where the planets are, to a small fraction of the
 *  size of the disc drawn for them, at any date the user picks. They are not good for predicting an
 *  occultation, and js/space.js does not offer to.
 *
 *  ── THE MOON ────────────────────────────────────────────────────────────────────────────────────
 *  The truncated ELP-2000/82 series as given by Meeus (Astronomical Algorithms, ch. 47) — the largest
 *  terms in longitude, latitude and distance. Accuracy about 10″ in longitude and 30 km in distance,
 *  which is a hundredth of the Moon's own disc.
 *
 *  ── ⚠ WHAT IS DELIBERATELY NOT HERE ─────────────────────────────────────────────────────────────
 *  The satellites of the other planets. Their positions are not hard to draw and are very hard to get
 *  RIGHT: a circular orbit at the published radius and period looks perfect and puts Io on the wrong
 *  side of Jupiter, because the phase depends on a mean longitude at epoch this file would be
 *  inventing. 「フェイク実装をするな」 — so the bodies modelled are the Sun, the eight planets, Pluto
 *  and the Moon, every one of them from published elements, and js/space.js says that is the list.
 *
 *  ── HOW IT IS CHECKED (tests/r197-space.test.mjs) ───────────────────────────────────────────────
 *  Not by comparing the code to itself:
 *    · the Sun's geocentric right ascension and declination derived from THIS file's Earth are
 *      compared against js/space-sky.js's independent USNO series (#R186), which was itself verified
 *      when it shipped — two different series agreeing to arcminutes is evidence, one series agreeing
 *      with itself is not;
 *    · each planet's orbital period from Kepler's third law on `a` is compared with the period implied
 *      by that body's own mean-longitude RATE — two numbers in the table that must agree and would
 *      not if either were mistyped;
 *    · the greatest elongation of Mercury and Venus over three centuries of sampling is compared with
 *      the observed 28.3° and 47.3° limits;
 *    · every body's heliocentric distance is compared with its published perihelion and aphelion.
 * ==========================================================================*/
window.IntMapEphemeris=(function(){
  'use strict';
  const D2R=Math.PI/180, R2D=180/Math.PI, J2000=2451545.0;
  const AU_KM=149597870.7;                         /* IAU 2012 definition, exact */

  /* JPL, "Keplerian Elements for Approximate Positions of the Major Planets", 3000 BC – 3000 AD.
     Each row: a(AU) e I(°) L(°) ϖ(°) Ω(°) then the six rates per Julian century, then b, c, s, f. */
  const P={
    mercury:{ el:[0.38709843,0.20563661,7.00559432,252.25166724,77.45771895,48.33961819],
              rt:[0.00000000,0.00002123,-0.00590158,149472.67486623,0.15940013,-0.12214182], ex:null },
    venus:{   el:[0.72332102,0.00676399,3.39777545,181.97970850,131.76755713,76.67261496],
              rt:[-0.00000026,-0.00005107,0.00043494,58517.81560260,0.05679648,-0.27274174], ex:null },
    earth:{   el:[1.00000018,0.01673163,-0.00054346,100.46691572,102.93005885,-5.11260389],
              rt:[-0.00000003,-0.00003661,-0.01337178,35999.37306329,0.31795260,-0.24123856], ex:null },
    mars:{    el:[1.52371243,0.09336511,1.85181869,-4.56813164,-23.91744784,49.71320984],
              rt:[0.00000097,0.00009149,-0.00724757,19140.29934243,0.45223625,-0.26852431], ex:null },
    jupiter:{ el:[5.20248019,0.04853590,1.29861416,34.33479152,14.27495244,100.29282654],
              rt:[-0.00002864,0.00018026,-0.00322699,3034.90371757,0.18199196,0.13024619],
              ex:[-0.00012452,0.06064060,-0.35635438,38.35125000] },
    saturn:{  el:[9.54149883,0.05550825,2.49424102,50.07571329,92.86136063,113.63998702],
              rt:[-0.00003065,-0.00032044,0.00451969,1222.11494724,0.54179478,-0.25015002],
              ex:[0.00025899,-0.13434469,0.87320147,38.35125000] },
    uranus:{  el:[19.18797948,0.04685740,0.77298127,314.20276625,172.43404441,73.96250215],
              rt:[-0.00020455,-0.00001550,-0.00180155,428.49512595,0.09266985,0.05739699],
              ex:[0.00058331,-0.97731848,0.17689245,7.67025000] },
    neptune:{ el:[30.06952752,0.00895439,1.77005520,304.22289287,46.68158724,131.78635853],
              rt:[0.00006447,0.00000818,0.00022400,218.46515314,0.01009938,-0.00606302],
              ex:[-0.00041348,0.68346318,-0.10162547,7.67025000] },
    pluto:{   el:[39.48686035,0.24885238,17.14104260,238.96535011,224.09702598,110.30167986],
              rt:[0.00449751,0.00006016,0.00000501,145.18042903,-0.00968827,-0.00809981],
              ex:[-0.01262724,0,0,0] }
  };

  /* Physical constants. Equatorial radius (km) and sidereal rotation period (days, negative =
     retrograde) are the IAU/NASA published values; axial tilt is the obliquity to the orbit. */
  const BODY={
    sun:{     rKm:695700,   rotD:25.38,     tiltDeg:7.25,   massKg:1.98847e30, colour:'#ffcf5a' },
    mercury:{ rKm:2439.7,   rotD:58.646,    tiltDeg:0.034,  massKg:3.3011e23,  colour:'#9a8f88' },
    venus:{   rKm:6051.8,   rotD:-243.025,  tiltDeg:177.36, massKg:4.8675e24,  colour:'#d9b98a' },
    earth:{   rKm:6378.137, rotD:0.99726968,tiltDeg:23.4393,massKg:5.97217e24, colour:'#4b7fd4' },
    moon:{    rKm:1737.4,   rotD:27.321661, tiltDeg:6.68,   massKg:7.342e22,   colour:'#b7b2ab' },
    mars:{    rKm:3396.2,   rotD:1.02595676,tiltDeg:25.19,  massKg:6.4171e23,  colour:'#c1502e' },
    jupiter:{ rKm:71492,    rotD:0.41354,   tiltDeg:3.13,   massKg:1.8982e27,  colour:'#d8b48a' },
    saturn:{  rKm:60268,    rotD:0.44401,   tiltDeg:26.73,  massKg:5.6834e26,  colour:'#e3d3a2' },
    uranus:{  rKm:25559,    rotD:-0.71833,  tiltDeg:97.77,  massKg:8.6810e25,  colour:'#a8dbe6' },
    neptune:{ rKm:24764,    rotD:0.67125,   tiltDeg:28.32,  massKg:1.02413e26, colour:'#4b70dd' },
    pluto:{   rKm:1188.3,   rotD:-6.38723,  tiltDeg:122.53, massKg:1.303e22,   colour:'#cbb9a3' }
  };
  /* published perihelion / aphelion in AU — used by the checks, and by the panel to say where a body
     is in its own orbit */
  const RANGE={ mercury:[0.307499,0.466697], venus:[0.718440,0.728213], earth:[0.983290,1.016711],
    mars:[1.381497,1.666100], jupiter:[4.950429,5.458104], saturn:[9.041195,10.123825],
    uranus:[18.286,20.096], neptune:[29.81,30.33], pluto:[29.658,49.305] };

  const ORDER=['mercury','venus','earth','mars','jupiter','saturn','uranus','neptune','pluto'];

  function julianDay(ms){ return ms/86400000+2440587.5; }
  function msOfJD(jd){ return (jd-2440587.5)*86400000; }
  const wrap360=(x)=>((x%360)+360)%360;

  /* Kepler's equation, Newton — the eccentricities here are all under 0.25 so it converges in a
     handful of iterations from E = M + e·sinM. */
  function kepler(Mdeg,e){
    const M=(wrap360(Mdeg+180)-180)*D2R;
    let E=M+e*Math.sin(M);
    for(let i=0;i<12;i++){
      const dM=M-(E-e*Math.sin(E));
      const dE=dM/(1-e*Math.cos(E));
      E+=dE;
      if(Math.abs(dE)<1e-12) break;
    }
    return E;
  }

  /* Heliocentric position in the J2000 ECLIPTIC frame, in AU. */
  function heliocentric(id,jd){
    const p=P[id]; if(!p) return null;
    const T=(jd-J2000)/36525;
    const a=p.el[0]+p.rt[0]*T, e=p.el[1]+p.rt[1]*T, I=(p.el[2]+p.rt[2]*T)*D2R;
    const L=p.el[3]+p.rt[3]*T, w=p.el[4]+p.rt[4]*T, O=(p.el[5]+p.rt[5]*T)*D2R;
    let M=L-w;
    if(p.ex){ const [b,c,s,f]=p.ex; M+=b*T*T+c*Math.cos(f*D2R*T)+s*Math.sin(f*D2R*T); }
    const E=kepler(M,e);
    /* in the orbital plane, x towards perihelion */
    const xv=a*(Math.cos(E)-e), yv=a*Math.sqrt(1-e*e)*Math.sin(E);
    const wp=(w-p.el[5]-p.rt[5]*T)*D2R;                  /* argument of perihelion = ϖ − Ω */
    const cw=Math.cos(wp), sw=Math.sin(wp), cO=Math.cos(O), sO=Math.sin(O), cI=Math.cos(I), sI=Math.sin(I);
    const x= (cw*cO-sw*sO*cI)*xv + (-sw*cO-cw*sO*cI)*yv;
    const y= (cw*sO+sw*cO*cI)*xv + (-sw*sO+cw*cO*cI)*yv;
    const z= (sw*sI)*xv          + (cw*sI)*yv;
    return { x, y, z, r:Math.sqrt(x*x+y*y+z*z), a, e, I:I*R2D };
  }

  /* ── the Moon: truncated ELP-2000/82 (Meeus ch. 47) ──────────────────────────────────────────
     Geocentric ecliptic longitude/latitude of date and distance in km. The terms kept are the ones
     above about 0.001° in longitude / 0.0005° in latitude; that is ~10″, a hundredth of the disc. */
  const ML_T=[
    /* D, M, M', F, Σl (1e-6 °), Σr (m) */
    [0,0,1,0,6288774,-20905355],[2,0,-1,0,1274027,-3699111],[2,0,0,0,658314,-2955968],
    [0,0,2,0,213618,-569925],[0,1,0,0,-185116,48888],[0,0,0,2,-114332,-3149],
    [2,0,-2,0,58793,246158],[2,-1,-1,0,57066,-152138],[2,0,1,0,53322,-170733],
    [2,-1,0,0,45758,-204586],[0,1,-1,0,-40923,-129620],[1,0,0,0,-34720,108743],
    [0,1,1,0,-30383,104755],[2,0,0,-2,15327,10321],[0,0,1,2,-12528,0],
    [0,0,1,-2,10980,79661],[4,0,-1,0,10675,-34782],[0,0,3,0,10034,-23210],
    [4,0,-2,0,8548,-21636],[2,1,-1,0,-7888,24208],[2,1,0,0,-6766,30824],
    [1,0,-1,0,-5163,-8379],[1,1,0,0,4987,-16675],[2,-1,1,0,4036,-12831],
    [2,0,2,0,3994,-10445],[4,0,0,0,3861,-11650],[2,0,-3,0,3665,14403],
    [0,1,-2,0,-2689,-7003],[2,0,-1,2,-2602,0],[2,-1,-2,0,2390,10056],
    [1,0,1,0,-2348,6322],[2,-2,0,0,2236,-9884],[0,1,2,0,-2120,5751],
    [0,2,0,0,-2069,0],[2,-2,-1,0,2048,-4950],[2,0,1,-2,-1773,4130],
    [2,0,0,2,-1595,0],[4,-1,-1,0,1215,-3958],[0,0,2,2,-1110,0],
    [3,0,-1,0,-892,3258],[2,1,1,0,-810,2616],[4,-1,-2,0,759,-1897],
    [0,2,-1,0,-713,-2117],[2,2,-1,0,-700,2354],[2,1,-2,0,691,0],
    [2,-1,0,-2,596,0],[4,0,1,0,549,-1423],[0,0,4,0,537,-1117],
    [4,-1,0,0,520,-1571],[1,0,-2,0,-487,-1739],[2,1,0,-2,-399,0],
    [0,0,2,-2,-381,-4421],[1,1,1,0,351,0],[3,0,-2,0,-340,0],
    [4,0,-3,0,330,0],[2,-1,2,0,327,0],[0,2,1,0,-323,1165],
    [1,1,-1,0,299,0],[2,0,3,0,294,0]
  ];
  const MB_T=[
    [0,0,0,1,5128122],[0,0,1,1,280602],[0,0,1,-1,277693],[2,0,0,-1,173237],
    [2,0,-1,1,55413],[2,0,-1,-1,46271],[2,0,0,1,32573],[0,0,2,1,17198],
    [2,0,1,-1,9266],[0,0,2,-1,8822],[2,-1,0,-1,8216],[2,0,-2,-1,4324],
    [2,0,1,1,4200],[2,1,0,-1,-3359],[2,-1,-1,1,2463],[2,-1,0,1,2211],
    [2,-1,-1,-1,2065],[0,1,-1,-1,-1870],[4,0,-1,-1,1828],[0,1,0,1,-1794],
    [0,0,0,3,-1749],[0,1,-1,1,-1565],[1,0,0,1,-1491],[0,1,1,1,-1475],
    [0,1,1,-1,-1410],[0,1,0,-1,-1344],[1,0,0,-1,-1335],[0,0,3,1,1107],
    [4,0,0,-1,1021],[4,0,-1,1,833],[0,0,1,-3,777],[4,0,-2,1,671],
    [2,0,0,-3,607],[2,0,2,-1,596],[2,-1,1,-1,491],[2,0,-2,1,-451],
    [0,0,3,-1,439],[2,0,2,1,422],[2,0,-3,-1,421],[2,1,-1,1,-366],
    [2,1,0,1,-351],[4,0,0,1,331],[2,-1,1,1,315],[2,-2,0,-1,302],
    [0,0,1,3,-283],[2,1,1,-1,-229],[1,1,0,-1,223],[1,1,0,1,223],
    [0,1,-2,-1,-220],[2,1,-1,-1,-220],[1,0,1,1,-185],[2,-1,-2,-1,181],
    [0,1,2,1,-177],[4,0,-2,-1,176],[4,-1,-1,-1,166],[1,0,1,-1,-164],
    [4,0,1,-1,132],[1,0,-1,-1,-119],[4,-1,0,-1,115],[2,-2,0,1,107]
  ];
  function moonGeocentric(jd){
    const T=(jd-J2000)/36525;
    const Lp=wrap360(218.3164477+481267.88123421*T-0.0015786*T*T+T*T*T/538841-T*T*T*T/65194000);
    const D =wrap360(297.8501921+445267.1114034*T-0.0018819*T*T+T*T*T/545868-T*T*T*T/113065000);
    const M =wrap360(357.5291092+35999.0502909*T-0.0001536*T*T+T*T*T/24490000);
    const Mp=wrap360(134.9633964+477198.8675055*T+0.0087414*T*T+T*T*T/69699-T*T*T*T/14712000);
    const F =wrap360(93.2720950+483202.0175233*T-0.0036539*T*T-T*T*T/3526000+T*T*T*T/863310000);
    const E=1-0.002516*T-0.0000074*T*T;
    let sl=0, sr=0, sb=0;
    const ec=(m)=>Math.abs(m)===1?E:(Math.abs(m)===2?E*E:1);
    for(const [d,m,mp,f,cl,cr] of ML_T){
      const arg=(d*D+m*M+mp*Mp+f*F)*D2R, w=ec(m);
      sl+=cl*w*Math.sin(arg); sr+=cr*w*Math.cos(arg);
    }
    for(const [d,m,mp,f,cb] of MB_T){
      const arg=(d*D+m*M+mp*Mp+f*F)*D2R, w=ec(m);
      sb+=cb*w*Math.sin(arg);
    }
    /* the three additive terms Meeus gives for Venus, Jupiter and the flattening of the Earth */
    const A1=wrap360(119.75+131.849*T), A2=wrap360(53.09+479264.290*T), A3=wrap360(313.45+481266.484*T);
    sl+=3958*Math.sin(A1*D2R)+1962*Math.sin((Lp-F)*D2R)+318*Math.sin(A2*D2R);
    sb+=-2235*Math.sin(Lp*D2R)+382*Math.sin(A3*D2R)+175*Math.sin((A1-F)*D2R)+175*Math.sin((A1+F)*D2R)
        +127*Math.sin((Lp-Mp)*D2R)-115*Math.sin((Lp+Mp)*D2R);
    const lon=wrap360(Lp+sl/1e6), lat=sb/1e6, distKm=385000.56+sr/1000;
    return { lonDeg:lon, latDeg:lat, distKm };
  }

  /* mean obliquity of the ecliptic (IAU 2006) */
  function obliquityDeg(jd){
    const T=(jd-J2000)/36525;
    return (84381.406-46.836769*T-0.0001831*T*T+0.00200340*T*T*T)/3600;
  }
  /* ══ ⚠ TWO FRAMES, AND MIXING THEM IS A HALF-DEGREE ═══════════════════════════════════════════
     The JPL elements are referred to the mean ecliptic and equinox of J2000 and STAY there. The
     Moon's ELP longitude is referred to the mean equinox OF DATE, and so is every apparent RA/Dec an
     almanac prints. The difference is general precession in longitude, 50.29″ a year.

     MEASURED before this was here, against the independent USNO solar series in js/space-sky.js: the
     two agreed to 0.43′ at J2000 and disagreed by 41.5′ at 2049 — a straight line through the origin,
     which is the signature of a frame and not of a bad coefficient. And the Sun–Moon separation at
     the total eclipse of 2017-08-21 18:26 UTC came out 0.47°, nearly the whole diameter of the Sun,
     because the Moon was of date and the Sun was not.

     General precession in longitude from J2000 (Meeus, Astronomical Algorithms). Everything that
     leaves this file as an ANGLE ON THE SKY goes through it; the Cartesian heliocentric positions the
     3-D scene uses stay in J2000, where they belong. */
  function precessLonDeg(jd){
    const T=(jd-J2000)/36525;
    return (5029.0966*T+1.11113*T*T-0.000006*T*T*T)/3600;
  }
  /* ecliptic → equatorial, both in degrees */
  function eclToEq(lonDeg,latDeg,jd){
    const e=obliquityDeg(jd)*D2R, l=lonDeg*D2R, b=latDeg*D2R;
    const sl=Math.sin(l), cl=Math.cos(l), sb=Math.sin(b), cb=Math.cos(b), se=Math.sin(e), ce=Math.cos(e);
    return { raDeg:wrap360(Math.atan2(sl*ce-Math.tan(b)*se,cl)*R2D), decDeg:Math.asin(sb*ce+cb*se*sl)*R2D };
  }
  /* The Sun as seen from the Earth — derived from this file's own Earth, which is what makes it a
     cross-check against the independent series in js/space-sky.js rather than a restatement of it. */
  function sunGeocentric(jd){
    const E=heliocentric('earth',jd);
    const lon=wrap360(Math.atan2(-E.y,-E.x)*R2D+precessLonDeg(jd)), lat=Math.asin(-E.z/E.r)*R2D;
    return Object.assign({ lonDeg:lon, latDeg:lat, distAU:E.r }, eclToEq(lon,lat,jd));
  }
  /* Geocentric ecliptic direction and distance, of the mean equinox OF DATE — the frame an almanac
     and the Moon's own series are both in. */
  function geocentric(id,jd){
    if(id==='moon'){ const m=moonGeocentric(jd); return { lonDeg:m.lonDeg, latDeg:m.latDeg, distAU:m.distKm/AU_KM }; }
    if(id==='sun'){ const s=sunGeocentric(jd); return { lonDeg:s.lonDeg, latDeg:s.latDeg, distAU:s.distAU }; }
    const p=heliocentric(id,jd), e=heliocentric('earth',jd);
    if(!p) return null;
    const x=p.x-e.x, y=p.y-e.y, z=p.z-e.z, r=Math.sqrt(x*x+y*y+z*z);
    return { lonDeg:wrap360(Math.atan2(y,x)*R2D+precessLonDeg(jd)), latDeg:Math.asin(z/r)*R2D, distAU:r };
  }
  /* …and the same direction as right ascension and declination, which is what a sky view wants */
  function equatorial(id,jd){
    const g=geocentric(id,jd); if(!g) return null;
    return Object.assign({ distAU:g.distAU }, eclToEq(g.lonDeg,g.latDeg,jd));
  }
  /* angular separation from the Sun as seen from the Earth, in degrees */
  function elongationDeg(id,jd){
    const b=geocentric(id,jd), s=sunGeocentric(jd);
    const to=(o)=>{ const l=o.lonDeg*D2R, t=o.latDeg*D2R; return [Math.cos(t)*Math.cos(l),Math.cos(t)*Math.sin(l),Math.sin(t)]; };
    const a=to(b), c=to(s);
    return Math.acos(Math.max(-1,Math.min(1,a[0]*c[0]+a[1]*c[1]+a[2]*c[2])))*R2D;
  }

  /* ══ WHICH WAY A BODY IS FACING ═══════════════════════════════════════════════════════════════
     A globe that turns at the right rate about an arbitrary zero is a globe with the wrong meridian
     under you. The IAU Working Group on Cartographic Coordinates and Rotational Elements publishes
     what is needed: the north pole in the ICRF (α₀, δ₀) and the prime-meridian angle W measured from
     the node of the body's equator on the ICRF equator, all as functions of time.

     ⚠ HOW MUCH OF THIS IS CHECKED, AND HOW. Two of these rows can be verified from inside this app
     and the rest cannot, so the situation is written down rather than implied:
       · EARTH — W + 90° is the Greenwich hour angle from the J2000 equinox, and js/space-sky.js
         carries an independent GMST series (#R186). tests/r197-space.test.mjs compares them.
       · THE MOON — it is tidally locked, so the sub-Earth point must sit within the libration
         envelope of ±8° of longitude 0 at every instant, for centuries. That tests α₀, δ₀ and W₀
         together, and nothing but the right values passes it.
     The other rows are transcribed from the same published table and are not independently checked
     here; a mistake in one of them would be a constant longitude offset on that body alone. */
  const ORI={
    sun:    { ra:[286.13,0], dec:[63.87,0],   w:[84.176,14.1844000] },
    mercury:{ ra:[281.0103,-0.0328], dec:[61.4155,-0.0049], w:[329.5988,6.1385108] },
    venus:  { ra:[272.76,0], dec:[67.16,0],   w:[160.20,-1.4813688] },
    earth:  { ra:[0.00,-0.641], dec:[90.00,-0.557], w:[190.147,360.9856235] },
    moon:   { ra:[269.9949,0.0031], dec:[66.5392,0.0130], w:[38.3213,13.17635815] },
    mars:   { ra:[317.269202,-0.10927547], dec:[54.432516,-0.05827105], w:[176.049863,350.891982443297] },
    jupiter:{ ra:[268.056595,-0.006499], dec:[64.495303,0.002413], w:[284.95,870.5360000] },
    saturn: { ra:[40.589,-0.036], dec:[83.537,-0.004], w:[38.90,810.7939024] },
    uranus: { ra:[257.311,0], dec:[-15.175,0], w:[203.81,-501.1600928] },
    neptune:{ ra:[299.36,0], dec:[43.46,0],   w:[253.18,536.3128492] },
    pluto:  { ra:[132.993,0], dec:[-6.163,0], w:[302.695,56.3625225] }
  };
  /* α₀, δ₀ (ICRF, degrees) and W (degrees) at an instant */
  function orientation(id,jd){
    const o=ORI[id]; if(!o) return null;
    const d=jd-J2000, T=d/36525;
    return { ra0:wrap360(o.ra[0]+o.ra[1]*T), dec0:o.dec[0]+o.dec[1]*T, w:wrap360(o.w[0]+o.w[1]*d) };
  }
  /* the body's north pole as a unit vector in the J2000 ECLIPTIC frame, which is the frame the
     heliocentric positions are in — the IAU poles are equatorial, so they are rotated once here */
  function poleVector(id,jd){
    const o=orientation(id,jd); if(!o) return null;
    const e=obliquityDeg(J2000)*D2R;                 /* J2000 obliquity: the frames are both J2000 */
    const a=o.ra0*D2R, dd=o.dec0*D2R;
    const x=Math.cos(dd)*Math.cos(a), y=Math.cos(dd)*Math.sin(a), z=Math.sin(dd);
    return [x, y*Math.cos(e)+z*Math.sin(e), -y*Math.sin(e)+z*Math.cos(e)];
  }
  /* The body's own axes as three unit vectors in the J2000 ECLIPTIC frame — x through the prime
     meridian at the equator, z through the north pole. This is what a renderer needs: it turns
     "latitude 22°N, longitude 47°E on Mars" into a direction in the same frame the orbits are in.
     Verified through the Moon: with these axes the sub-Earth point stays inside ±8.04° of longitude
     zero over a century, which is the libration and nothing else. */
  function bodyBasis(id,jd){
    const o=orientation(id,jd); if(!o) return null;
    const e=obliquityDeg(J2000)*D2R, a=o.ra0*D2R, d=o.dec0*D2R, W=o.w*D2R;
    const toEcl=(v)=>[v[0], v[1]*Math.cos(e)+v[2]*Math.sin(e), -v[1]*Math.sin(e)+v[2]*Math.cos(e)];
    const z=toEcl([Math.cos(d)*Math.cos(a),Math.cos(d)*Math.sin(a),Math.sin(d)]);
    const node=toEcl([-Math.sin(a),Math.cos(a),0]);          /* the equator's ascending node, at α₀+90° */
    const cr=(A,B)=>[A[1]*B[2]-A[2]*B[1],A[2]*B[0]-A[0]*B[2],A[0]*B[1]-A[1]*B[0]];
    const yn=cr(z,node);
    const x=[node[0]*Math.cos(W)+yn[0]*Math.sin(W), node[1]*Math.cos(W)+yn[1]*Math.sin(W), node[2]*Math.cos(W)+yn[2]*Math.sin(W)];
    return { x, y:cr(z,x), z };
  }
  /* the sidereal rotation angle of a body at an instant, so a globe turns at its own real rate */
  function rotationDeg(id,jd){
    const o=ORI[id]; if(o) return orientation(id,jd).w;
    const b=BODY[id]; if(!b||!b.rotD) return 0;
    return wrap360(360*((jd-J2000)/b.rotD));
  }

  return { AU_KM, J2000, julianDay, msOfJD, heliocentric, moonGeocentric, sunGeocentric, geocentric,
    equatorial, elongationDeg, obliquityDeg, precessLonDeg, eclToEq, rotationDeg, orientation, poleVector, bodyBasis, kepler,
    bodies:()=>ORDER.slice(), body:(id)=>BODY[id]||null, all:()=>Object.assign({},BODY),
    range:(id)=>RANGE[id]||null,
    /* the period Kepler's third law gives for this body's own semi-major axis, in days */
    periodDays:(id)=>{ const p=P[id]; return p?365.256898326*Math.pow(p.el[0],1.5):null; },
    state:()=>({ bodies:ORDER.length, span:'3000 BC – 3000 AD (JPL approximate elements)',
      moon:'truncated ELP-2000/82 (Meeus ch. 47)' }) };
})();
