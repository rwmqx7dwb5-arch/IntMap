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
 *  data/vs30.png is the answer to both: a 1440 × 720 (0.25°) 8-bit raster of the MEAN Vs30 over each
 *  cell's land, built offline by scripts/build-vs30.mjs with the same Wald & Allen (2007) proxy and
 *  the same table js/seismic.js applies per DEM sample, evaluated at 1,223 m (terrarium z7) and
 *  averaged AFTER the conversion. 239 kB, no network at run time, no failure mode that ends in
 *  rings.
 *
 *  ⚠ IT IS THE FALLBACK, NOT THE ANSWER. Where the DEM can speak — the fine field's 1.5 km cells —
 *  the DEM still speaks first: 0.25° is 28 km and cannot see a valley. This is consulted exactly
 *  where the alternative was ONE number for the whole map.
 *  ⚠ 0 MEANS "NO LAND SAMPLED IN THIS CELL", not "soft ground". A caller that gets null must decide
 *  for itself, the same contract js/land-mask.js states for the same reason.
 * ==========================================================================*/
window.IntMapVs30=(function(){
  'use strict';
  const W=1440, H=720, LO=150, HI=1500;
  let vals=null, loading=null, failed=null, ms=0;

  function url(){
    try{ return new URL('data/vs30.png',document.baseURI).toString(); }
    catch(_){ return 'data/vs30.png'; }
  }

  /* Decode into one Uint8Array of quantised Vs30 — 1 MB, read in strips so the intermediate
     ImageData (4 MB for the whole raster) is never held all at once on a phone. */
  function decode(im){
    const t0=(typeof performance!=='undefined'&&performance.now)?performance.now():0;
    const out=new Uint8Array(W*H);
    const cv=document.createElement('canvas'); cv.width=W; cv.height=180;
    const g=cv.getContext('2d',{alpha:false, willReadFrequently:true});
    for(let y0=0;y0<H;y0+=180){
      const h=Math.min(180,H-y0);
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
    loading=new Promise((res)=>{
      const im=new Image(); im.decoding='async';
      im.onload=()=>{ try{ vals=decode(im); }catch(e){ failed='decode: '+(e&&e.message||e); }
        loading=null; res(!!vals); };
      im.onerror=()=>{ failed='image failed to load'; loading=null; res(false); };
      im.src=url();
    });
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
    state:()=>({ ready:!!vals, failed, width:W, height:H, decodeMs:ms,
      cellKm:+(40075/W).toFixed(1), vs30Lo:LO, vs30Hi:HI }) };
})();
