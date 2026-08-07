/* ============================================================================
 *  IntMap · THE BUNDLED SEA FLOOR — window.IntMapBathymetry  (#R197)
 * ----------------------------------------------------------------------------
 *  「津波シミュレータのシミュレート範囲は全球に。また、精度と忠実性を根本的に大幅に強化して。」
 *
 *  A global shallow-water model needs a depth for EVERY cell before its first time step, and up to
 *  #R196 the tsunami got one by warming DEM tiles around the epicentre: a box, a budget of ninety
 *  tiles, and #R192's measurement that 19 % of the cells ran on a constant because the tiles had not
 *  arrived. Neither the box nor the tiles survive a global domain — 0.25° over the whole world is
 *  1,024 terrarium tiles and about 60 MB, on the user's connection, every time the button is pressed,
 *  and any tile that failed would be a hole in the ocean for the wave to reflect off.
 *
 *  So the sea floor ships with the app: data/bathymetry.png, 1440 × 720 (0.25°), built by
 *  scripts/build-bathymetry.mjs from the same AWS terrarium elevation data the app already uses and
 *  already attributes. 1.26 MB, one request, cached, complete, and identical on every device.
 *
 *  ENCODING (see the builder): R·256 + G = the mean depth of the cell's SEA samples in metres;
 *  B = the cell's sea fraction × 255. Two facts, not one, because a 0.25° coastal cell is part land
 *  and the average of a trench and a mountain is a depth that belongs to neither.
 *
 *  ⚠ IT IS NOT ON THE BOOT PATH. Nothing loads it until something asks — `warm()` is called by the
 *  tsunami panel when it opens, which is the only thing that needs a global sea floor. The app starts
 *  exactly as fast as it did.
 *
 *  ⚠ THE WORKER GETS A COPY, NOT THIS ONE. `slice()` hands the solver a transferable buffer; the
 *  master stays here so a second run does not re-fetch and re-decode 1 MB of PNG.
 * ==========================================================================*/
window.IntMapBathymetry=(function(){
  'use strict';
  const W=1440, H=720;                       /* must match data/bathymetry.json */
  let rgb=null, loading=null, failed=null, ms=0, bytes=0;

  function url(){
    try{ return new URL('data/bathymetry.png',document.baseURI).toString(); }
    catch(_){ return 'data/bathymetry.png'; }
  }

  /* Decode to a tight RGB byte array — 3.1 MB, against the 4.1 MB an RGBA ImageData would hold, and
     read in strips so a phone never holds a whole decoded world plus a canvas at once. */
  function decode(im){
    const t0=(typeof performance!=='undefined'&&performance.now)?performance.now():0;
    const out=new Uint8Array(W*H*3);
    const cv=document.createElement('canvas'); cv.width=W; cv.height=180;
    const g=cv.getContext('2d',{alpha:false, willReadFrequently:true});
    for(let y0=0;y0<H;y0+=180){
      const hh=Math.min(180,H-y0);
      g.drawImage(im,0,y0,W,hh,0,0,W,hh);
      const d=g.getImageData(0,0,W,hh).data;
      for(let j=0;j<hh;j++){
        let s=(j*W)*4, o=((y0+j)*W)*3;
        for(let i=0;i<W;i++){ out[o]=d[s]; out[o+1]=d[s+1]; out[o+2]=d[s+2]; o+=3; s+=4; }
      }
    }
    cv.width=cv.height=1;
    ms=Math.round(((typeof performance!=='undefined'&&performance.now)?performance.now():0)-t0);
    return out;
  }

  function warm(){
    if(rgb) return Promise.resolve(true);
    if(loading) return loading;
    loading=new Promise((res)=>{
      const im=new Image(); im.decoding='async';
      im.onload=()=>{ try{ rgb=decode(im); bytes=rgb.length; }catch(e){ failed='decode: '+((e&&e.message)||e); }
        loading=null; res(!!rgb); };
      im.onerror=()=>{ failed='image failed to load'; loading=null; res(false); };
      im.src=url();
    });
    return loading;
  }

  const col=(lng)=>{ let i=Math.floor(((((+lng+180)%360)+360)%360)/360*W); return i>=W?W-1:(i<0?0:i); };
  const row=(lat)=>{ let j=Math.floor((90-Math.max(-90,Math.min(90,+lat||0)))/180*H); return j>=H?H-1:(j<0?0:j); };

  /* metres of water, 0 over land or where the cell has no sea; null = not loaded (never guessed) */
  function depthAt(lng,lat){
    if(!rgb) return null;
    const o=(row(lat)*W+col(lng))*3;
    return rgb[o]*256+rgb[o+1];
  }
  /* 0…1 — how much of the cell is sea; null = not loaded */
  function seaFractionAt(lng,lat){
    if(!rgb) return null;
    return rgb[(row(lat)*W+col(lng))*3+2]/255;
  }

  /* a transferable copy for a worker */
  function slice(){ return rgb?{ w:W, h:H, rgb:rgb.slice() }:null; }

  return { warm, slice, depthAt, seaFractionAt, ready:()=>!!rgb, width:W, height:H,
    state:()=>({ ready:!!rgb, failed, width:W, height:H, decodeMs:ms, bytes,
      degrees:+(360/W).toFixed(3) }) };
})();
