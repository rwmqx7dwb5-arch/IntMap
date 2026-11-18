/* ============================================================================
 *  IntMap · the whole-world strip's ±180° columns (js/antimeridian-seam.js)
 * ----------------------------------------------------------------------------
 *  「夜の状態になっている日付変更線付近が…そこだけ線上に暗くなってしまっている」
 *
 *  ONE FACT, TWO READERS. GIBS's VIIRS Black Marble tiles carry an opaque BLACK band down the world's
 *  outermost columns — the easternmost tile's last columns and the westernmost tile's first ones — and
 *  the band is a FIXED GROUND WIDTH, so in tile pixels it doubles with every zoom. MEASURED 2026-11-19
 *  (2016-01-01 composite, 256 px tiles, mean RGB sum per column, 23 is the unlit base):
 *      z2 ≈0.4 col   z3 1 col (9)   z4 2 cols (3.9, 12.9)   z5 3 (4.9,0,0)   z6 6   z7 12   z8 24 cols of 0
 *  Two things draw those tiles: the canvas mosaic of the globe's night side (js/night-side.js) and the
 *  raster layer dl-nightsat (a MapLibre / Cesium raster source). #1210 stepped the mosaic over the band
 *  and left the raster source reading the tiles untouched, so the layer still drew the stripe on the
 *  built site. The judgement «how many outer columns are the upstream's edge rather than the Earth» is
 *  therefore made HERE, once, and both readers ask it.
 *
 *  ⚠ NOT A FIXED WIDTH AND NOT A LIST OF TILES. The band is found by its signature (below): a column past
 *  which, on nearly every row, the picture steps up. If the upstream stops writing it nothing steps, the
 *  count is 0 and the pixels are returned as they came. A band can only exist where the strip ends, so
 *  only the tiles at x = 0 and x = 2^z − 1 are ever decoded; every other tile is passed through as bytes.
 *  Invalid if the strip stops being a whole-world one whose first and last columns meet at ±180°.
 *  The band's columns are replaced, row by row, with the first column that is not part of it (a
 *  few km of ground at z8, the same source's own pixel one step in).
 * ==========================================================================*/
export const STEP=0.15, STEP_ROWS=0.9;

/* how many columns, counting inward from an edge, belong to the band — d is RGBA, dir +1 from the left
   edge, −1 from the right; rows are sampled every `step`. The band is found by its SIGNATURE, not by a
   brightness: a column where, on nearly every row, the next column inward is brighter by STEP (a
   city, a coastline, a gradient changes some rows, never 90 % of them at one column). The outermost
   such column is the band's inner edge. (A brightness comparison against a reference further in was tried
   first and failed on real tiles: the z2 tile's lit continent is darker at col 20 than col 70, and at z8
   column 0 is a lit column and the black starts at 1.) */
export function bandWidth(d,W,H,dir,step){
  const st=step||1, limit=W>>2; if(W<32) return 0;
  const at=(c,y)=>{ const j=(y*W+(dir>0?c:W-1-c))*4; return d[j]+d[j+1]+d[j+2]; };
  let found=-1;
  for(let k=0;k<limit;k++){
    let rise=0,rows=0;
    for(let y=0;y<H;y+=st){ rows++; const a=at(k,y), b=at(k+1,y); if(b>0&&b-a>STEP*b) rise++; }
    if(rows&&rise>=STEP_ROWS*rows) found=k;
  }
  return found+1;
}

/* repair the RGBA buffer in place; sides = {left, right}. Returns {left, right}: columns replaced. */
export function repairBand(d,W,H,sides){
  const out={ left:0, right:0 };
  const fill=(n,dir)=>{ if(!n) return;
    const src=dir>0?n:W-1-n;
    for(let y=0;y<H;y++){ const s=(y*W+src)*4;
      for(let k=0;k<n;k++){ const t=(y*W+(dir>0?k:W-1-k))*4;
        d[t]=d[s]; d[t+1]=d[s+1]; d[t+2]=d[s+2]; d[t+3]=d[s+3]; } } };
  if(sides&&sides.left){ out.left=bandWidth(d,W,H,1); fill(out.left,1); }
  if(sides&&sides.right){ out.right=bandWidth(d,W,H,-1); fill(out.right,-1); }
  return out;
}

/* does this tile touch the strip's end? (z = 0 is one tile that touches both) */
export function edgeSides(z,x){ const last=(2**z)-1; return { left:x===0, right:x===last }; }

/* ── the tile protocol ───────────────────────────────────────────────────────────────────────────
   `imnl://<epoch id>/{z}/{x}/{y}` — the night-lights tile, delivered with the band stepped over. The
   scheme is registered once, through the renderer contract, so MapLibre and Cesium both read it. */
const SCHEME='imnl';
let installed=null;
export function seamlessTiles(NL,ep,engine){
  if(!NL||!ep) return [];
  if(installed==null){
    try{ installed=!!(engine&&engine.scene&&engine.scene.addProtocol(SCHEME, async (params,abortController)=>{
      const m=/^imnl:\/\/([^/]+)\/(\d+)\/(\d+)\/(\d+)/.exec(params&&params.url||''); if(!m) throw new Error('bad imnl url');
      const z=+m[2], x=+m[3], y=+m[4];
      const url=NL.tileURL(z,x,y,m[1]); if(!url) throw new Error('no night-lights epoch '+m[1]);
      const r=await fetch(url,{ signal:abortController&&abortController.signal, mode:'cors' });
      if(!r.ok) throw new Error('night lights '+r.status);
      const sides=edgeSides(z,x);
      if(!sides.left&&!sides.right) return { data: await r.arrayBuffer() };
      const blob=await r.blob(); let bmp=null;
      try{ bmp=await createImageBitmap(blob);
        const cv=new OffscreenCanvas(bmp.width,bmp.height), cx=cv.getContext('2d',{ willReadFrequently:true });
        cx.drawImage(bmp,0,0); const img=cx.getImageData(0,0,bmp.width,bmp.height);
        const done=repairBand(img.data,bmp.width,bmp.height,sides);
        if(!done.left&&!done.right) return { data: await blob.arrayBuffer() };
        cx.putImageData(img,0,0); return { data: await createImageBitmap(cv) };
      }catch(_){ return { data: await blob.arrayBuffer() }; }   /* unreadable → shown as it came, never dropped */
    })); }catch(_){ installed=false; }
  }
  if(!installed) return NL.tiles(ep);
  return [SCHEME+'://'+(typeof ep==='object'?ep.id:ep)+'/{z}/{x}/{y}'];
}
