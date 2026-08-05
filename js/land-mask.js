/* ============================================================================
 *  IntMap · THE BUNDLED LAND / SEA MASK — window.IntMapLandMask  (#R192)
 * ----------------------------------------------------------------------------
 *  「震度分布の色塗りが、たまにバグって海もべた塗になる場合がある。」
 *
 *  Two places in the intensity field asked "is this land?" and both asked the TERRAIN TILES, which
 *  is why the failure was intermittent rather than constant:
 *
 *    · js/seismic.js buildFar() warmed 64 z3 DEM tiles for a whole-world land mask and, when fewer
 *      than half of them arrived, painted EVERY cell — the ocean included. One slow network, one
 *      cold cache, one eviction under memory pressure, and a continent-sized rectangle of colour
 *      appeared over open water.
 *    · the fine field painted any cell whose DEM was missing, using the panel's site class.
 *
 *  Land and sea do not need elevations, only a sign, and they never change between two runs of the
 *  app. So the answer ships with it: data/land-mask.png, a 1-bit 2048 × 1024 equirectangular raster
 *  of the world's land rasterised from Natural Earth's public-domain 1:50m land polygons (see
 *  scripts/build-land-mask.mjs). 19.6 KB on the wire, 256 KB of bitset in memory, no network.
 *
 *  RESOLUTION. 0.176° is ~19.5 km at the equator — finer than the far field's own 52 km cell (and
 *  its 104 km cell on a phone), so the mask is never what limits the picture. It is COARSER than the
 *  fine field near the coast, which is why the DEM still answers first there and this is only
 *  consulted where the DEM has nothing to say.
 *
 *  ⚠ AND A 19.5 km CELL ON A COAST ANSWERS FOR THE CELL, NOT FOR THE POINT. Each pixel is the
 *  MAJORITY of what is inside it (three scanlines, see scripts/build-land-mask.mjs), so
 *  isLand(139.76, 35.68) — central Tokyo — is FALSE: the cell that contains it is mostly Tokyo Bay.
 *  That is the right answer for a 19.5 km cell and the wrong answer for a street corner, which is
 *  exactly why nothing asks this where the DEM can speak.
 *
 *  It is deliberately its own module and not part of the seismic simulator: "where is the land" is a
 *  fact about the Earth, not about earthquakes, and anything else that needs it should ask here
 *  rather than grow a second copy (#R136).
 * ==========================================================================*/
window.IntMapLandMask=(function(){
  'use strict';
  const W=2048, H=1024;
  let bits=null, loading=null, failed=null, ms=0;

  function url(){
    try{ return new URL('data/land-mask.png',document.baseURI).toString(); }
    catch(_){ return 'data/land-mask.png'; }
  }

  /* Decode once into a packed bitset. The intermediate ImageData is 8 MB, so it is read in strips
     and released with the canvas — a phone should not have to hold a whole decoded world to answer
     a yes/no question. */
  function decode(im){
    const t0=(typeof performance!=='undefined'&&performance.now)?performance.now():0;
    const out=new Uint8Array((W*H)>>3);
    const cv=document.createElement('canvas'); cv.width=W; cv.height=256;
    const g=cv.getContext('2d',{alpha:false, willReadFrequently:true});
    for(let y0=0;y0<H;y0+=256){
      const h=Math.min(256,H-y0);
      g.drawImage(im,0,y0,W,h,0,0,W,h);
      const d=g.getImageData(0,0,W,h).data;
      for(let j=0;j<h;j++){ const row=(y0+j)*W;
        for(let i=0;i<W;i++){ if(d[(j*W+i)*4]>127){ const k=row+i; out[k>>3]|=(0x80>>(k&7)); } } }
    }
    cv.width=cv.height=1;
    ms=Math.round(((typeof performance!=='undefined'&&performance.now)?performance.now():0)-t0);
    return out;
  }

  function warm(){
    if(bits) return Promise.resolve(true);
    if(loading) return loading;
    loading=new Promise((res)=>{
      const im=new Image(); im.decoding='async';
      im.onload=()=>{ try{ bits=decode(im); }catch(e){ failed='decode: '+(e&&e.message||e); }
        loading=null; res(!!bits); };
      im.onerror=()=>{ failed='image failed to load'; loading=null; res(false); };
      im.src=url();
    });
    return loading;
  }

  /* true = land, false = sea, null = the mask is not loaded (ask again after warm()).
     NEVER guessed: a caller that gets null must decide for itself, and the whole point of this
     module is that "I do not know" and "it is land" stop being the same answer. */
  function isLand(lng,lat){
    if(!bits) return null;
    let lo=+lng; if(!isFinite(lo)) return null;
    lo=((lo+180)%360+360)%360-180;                       /* wrap, so a field that crosses ±180 works */
    const la=Math.max(-90,Math.min(90,+lat||0));
    let i=Math.floor((lo+180)/360*W); if(i<0) i=0; else if(i>=W) i=W-1;
    let j=Math.floor((90-la)/180*H); if(j<0) j=0; else if(j>=H) j=H-1;
    const k=j*W+i;
    return (bits[k>>3]&(0x80>>(k&7)))!==0;
  }

  return { warm, isLand, ready:()=>!!bits,
    state:()=>({ ready:!!bits, failed, width:W, height:H, decodeMs:ms,
      cellKm:+(40075/W).toFixed(1) }) };
})();
