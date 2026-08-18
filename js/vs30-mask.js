/* ============================================================================
 *  IntMap · THE BUNDLED SITE TERM — window.IntMapVs30  (#R223)
 * ----------------------------------------------------------------------------
 *  「震度分布が同心円状になることがある。ふざけるな。」 (third round of this report)
 *
 *  An intensity field is a distance law times a SITE TERM, so a site term that is the same
 *  everywhere makes the intensity a function of distance alone — and a function of distance alone
 *  is drawn as perfect concentric rings. #R216 closed the "slope baseline gave up" door and #R221
 *  closed the "the field evicted its own DEM tiles" door. Two were left, and neither of them can be
 *  closed by fetching more tiles while the reader waits:
 *
 *    ① THE FAR FIELD HAS NO TERRAIN AT ALL. Past 1,500 km js/seismic.js paints a whole-world raster
 *       with ~28 km cells and no DEM behind them, so every cell there took the panel's single site
 *       class. For an M8+ that annulus is most of the picture, and it is rings BY CONSTRUCTION.
 *    ② A CELL WHOSE DEM TILE NEVER ARRIVED took the same single class — the 「一部は」 case.
 *
 *  data/vs30.png is the answer to both: an 8-bit raster of the MEAN Vs30 over each cell's land, built
 *  offline by scripts/build-vs30.mjs with the same Wald & Allen (2007) proxy and the same table
 *  js/seismic.js applies per DEM sample, evaluated at 1,223 m (terrarium z7) and averaged AFTER the
 *  conversion. No network at run time, no failure mode that ends in rings.
 *
 *  ⚠ (#R263) IT IS NOW 0.05°, AND THERE ARE TWO OF THEM. 「全球Vs30を高解像度化し、現在の粗い
 *  fallbackを改善する。」 #R223 shipped 1440 × 720 (0.25° = 27.8 km) — but the build was already
 *  reading terrarium z7, whose pixel is 1,223 m, and throwing away 516 samples per output cell. The
 *  same fetch now produces 7200 × 3600 (0.05° = 5.5 km), which is five times the linear resolution
 *  and no new assumption. A 5.5 km cell can see a river valley; a 27.8 km one cannot.
 *  ⚠ AND THE PHONE READS THE HALF-SIZE COPY. 0.05° is 4.9 MB on the wire and 25.9 M cells resident;
 *  data/vs30-phone.png is 0.1°, 1.3 MB and 6.5 M — still four times finer than what it replaces. The
 *  GRID IS READ OUT OF data/vs30.json rather than written here, so a rebuild at another resolution
 *  cannot leave this file quietly reading the wrong raster (which is exactly what #R263 did to itself
 *  before this manifest existed: the constants said 1440 × 720 and the file on disk was 7200 × 3600,
 *  so every lookup landed 5× off).
 *
 *  ⚠ IT IS THE FALLBACK, NOT THE ANSWER. Where the DEM can speak — the fine field's ~1 km cells —
 *  the DEM still speaks first. This is consulted exactly where the alternative was ONE number for
 *  the whole map.
 *  ⚠ 0 MEANS "NO LAND SAMPLED IN THIS CELL", not "soft ground". A caller that gets null must decide
 *  for itself, the same contract js/land-mask.js states for the same reason.
 * ==========================================================================*/
window.IntMapVs30=(function(){
  'use strict';
  let W=7200, H=3600, LO=150, HI=1500, FILE='data/vs30.png';
  let vals=null, loading=null, failed=null, ms=0, manifest=null;

  function url(f){
    try{ return new URL(f,document.baseURI).toString(); }
    catch(_){ return f; }
  }
  /* the shipped manifest decides the grid — see the ⚠ in the header.
     ⚠ THE PHONE TEST IS THE APP'S OWN, NOT A NEW ONE. js/app-body.js's `_imPhoneGPU` asks
     «coarse pointer AND no fine pointer available», and #R232 wrote down why it is that and not a
     width: an iPhone turned sideways is 844 px, so a width test calls it a desktop and hands the
     same GPU the desktop settings. The question here — «should this device download 4.9 MB and
     hold 26 M cells» — is the same device question, so it gets the same answer. This file is loaded
     standalone (like js/land-mask.js) and cannot reach the host factory, so the media query is
     repeated rather than imported; it is repeated EXACTLY. */
  function isPhone(){
    try{ return window.matchMedia('(pointer:coarse)').matches && !window.matchMedia('(any-pointer:fine)').matches; }
    catch(_){ return false; }
  }
  function loadManifest(){
    return fetch(url('data/vs30.json')).then(r=>r.ok?r.json():null).then((m)=>{
      if(!m) return;
      manifest=m;
      const phone=isPhone()&&m.phone;
      if(phone){ W=m.phone.width; H=m.phone.height; FILE=m.phone.file; }
      else { W=m.width; H=m.height; FILE='data/vs30.png'; }
      if(m.vs30Lo>0) LO=m.vs30Lo;
      if(m.vs30Hi>0) HI=m.vs30Hi;
    }).catch(()=>{});
  }

  /* Decode into one Uint8Array of quantised Vs30 — 1 MB, read in strips so the intermediate
     ImageData (4 MB for the whole raster) is never held all at once on a phone. */
  function decode(im){
    const t0=(typeof performance!=='undefined'&&performance.now)?performance.now():0;
    const out=new Uint8Array(W*H);
    /* (#R263) the strip is sized in BYTES, not rows: 180 rows of 1,440 was 1 MB of ImageData and 180
       rows of 7,200 would be 5 MB. Holding the strip to about 4 M pixels keeps the intermediate the
       size it has always been however wide the raster gets. */
    const rows=Math.max(1,Math.min(H,Math.floor(4194304/W)));
    const cv=document.createElement('canvas'); cv.width=W; cv.height=rows;
    const g=cv.getContext('2d',{alpha:false, willReadFrequently:true});
    for(let y0=0;y0<H;y0+=rows){
      const h=Math.min(rows,H-y0);
      g.drawImage(im,0,y0,W,h,0,0,W,h);
      const d=g.getImageData(0,0,W,h).data;
      for(let j=0;j<h;j++){ const row=(y0+j)*W;
        for(let i=0;i<W;i++) out[row+i]=d[(j*W+i)*4]; }
    }
    cv.width=cv.height=1;
    ms=Math.round(((typeof performance!=='undefined'&&performance.now)?performance.now():0)-t0);
    return out;
  }

  function warm(){
    if(vals) return Promise.resolve(true);
    if(loading) return loading;
    loading=loadManifest().then(()=>new Promise((res)=>{
      const im=new Image(); im.decoding='async';
      im.onload=()=>{ try{ vals=decode(im); }catch(e){ failed='decode: '+(e&&e.message||e); }
        loading=null; res(!!vals); };
      im.onerror=()=>{ failed='image failed to load'; loading=null; res(false); };
      im.src=url(FILE);
    }));
    return loading;
  }

  /* the mean Vs30 (m/s) over the land in this 0.25° cell, or null where there is none */
  function at(lng,lat){
    if(!vals) return null;
    let lo=+lng; if(!isFinite(lo)) return null;
    lo=((lo+180)%360+360)%360-180;                       /* wrap, so a field crossing ±180 works */
    const la=Math.max(-90,Math.min(90,+lat||0));
    let i=Math.floor((lo+180)/360*W); if(i<0) i=0; else if(i>=W) i=W-1;
    let j=Math.floor((90-la)/180*H); if(j<0) j=0; else if(j>=H) j=H-1;
    const q=vals[j*W+i];
    if(!q) return null;
    return LO+(q-1)/254*(HI-LO);
  }

  return { warm, at, ready:()=>!!vals,
    state:()=>({ ready:!!vals, failed, width:W, height:H, decodeMs:ms, file:FILE,
      phone:!!(manifest&&manifest.phone&&FILE===manifest.phone.file),
      cellKm:+(40075/W).toFixed(2), degrees:+(360/W).toFixed(3), vs30Lo:LO, vs30Hi:HI }) };
})();
