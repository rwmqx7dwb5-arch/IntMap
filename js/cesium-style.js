/* ============================================================================
 *  IntMap · THE STYLE LANGUAGE, AS AN INTERPRETER  (#R180)
 * ----------------------------------------------------------------------------
 *  「設定から選択すれば、Cesiumも選べるように。」
 *
 *  WHY THIS FILE IS THE REAL COST OF A SECOND ENGINE. #R179 measured what the
 *  renderer seam actually carries and reported that the reference count being 0
 *  did not mean the app was renderer-neutral: it speaks MapLibre's STYLE LANGUAGE
 *  everywhere. Re-measured this round with the same AST sweep:
 *
 *      247 layer definitions in 11 types   line 75 · fill 51 · circle 49 ·
 *                                          symbol 33 · raster 17 ·
 *                                          fill-extrusion 9 · heatmap 4 ·
 *                                          hillshade 2 · color-relief 2
 *      122 source definitions in 5 types   geojson 97 · raster 11 · vector 6 ·
 *                                          image 6 · raster-dem 2
 *      762 style expressions, 36 operators get 216 · == 94 · interpolate 71 ·
 *                                          coalesce 63 · zoom 56 · case 35 ·
 *                                          literal 23 · feature-state 17 …
 *      40 paint properties, 33 layout properties
 *
 *  A second engine is therefore an INTERPRETER of that language, not a second
 *  set of draw calls, and this file is the interpreter's front half: expressions,
 *  filters and colours. It is deliberately PURE — no Cesium, no DOM, no window
 *  state — so it can be tested in Node (tests/r180-style.test.mjs) against the
 *  same inputs MapLibre is given, which is the only way to know the two agree.
 *
 *  SCOPE. Wider than the 36 operators measured, on purpose: 219 of the layer
 *  definitions are literals an AST can see, but the rest are built at run time
 *  from data (the choropleth ramps, Atlas's generated layers), so enumerating
 *  what is used today would ship an interpreter that fails on the first layer a
 *  user creates. What is NOT implemented says so out loud — see UNSUPPORTED.
 * ==========================================================================*/
window.IntMapStyle=(function(){
  'use strict';

  /* ── COLOUR ────────────────────────────────────────────────────────────────
     Everything downstream wants premultiplied-free RGBA in 0-1, because that is
     what a GPU material takes. The app writes colours in every CSS spelling it
     has: #rgb, #rrggbb, #rrggbbaa, rgb()/rgba(), hsl()/hsla(), and names. The
     named table is included in full rather than sampled — a missing name is a
     black polygon, and "which names does the app use" is not a question a static
     scan can answer for layers built at run time. */
  const NAMED={aliceblue:'#f0f8ff',antiquewhite:'#faebd7',aqua:'#00ffff',aquamarine:'#7fffd4',azure:'#f0ffff',
    beige:'#f5f5dc',bisque:'#ffe4c4',black:'#000000',blanchedalmond:'#ffebcd',blue:'#0000ff',blueviolet:'#8a2be2',
    brown:'#a52a2a',burlywood:'#deb887',cadetblue:'#5f9ea0',chartreuse:'#7fff00',chocolate:'#d2691e',coral:'#ff7f50',
    cornflowerblue:'#6495ed',cornsilk:'#fff8dc',crimson:'#dc143c',cyan:'#00ffff',darkblue:'#00008b',darkcyan:'#008b8b',
    darkgoldenrod:'#b8860b',darkgray:'#a9a9a9',darkgreen:'#006400',darkgrey:'#a9a9a9',darkkhaki:'#bdb76b',
    darkmagenta:'#8b008b',darkolivegreen:'#556b2f',darkorange:'#ff8c00',darkorchid:'#9932cc',darkred:'#8b0000',
    darksalmon:'#e9967a',darkseagreen:'#8fbc8f',darkslateblue:'#483d8b',darkslategray:'#2f4f4f',darkslategrey:'#2f4f4f',
    darkturquoise:'#00ced1',darkviolet:'#9400d3',deeppink:'#ff1493',deepskyblue:'#00bfff',dimgray:'#696969',
    dimgrey:'#696969',dodgerblue:'#1e90ff',firebrick:'#b22222',floralwhite:'#fffaf0',forestgreen:'#228b22',
    fuchsia:'#ff00ff',gainsboro:'#dcdcdc',ghostwhite:'#f8f8ff',gold:'#ffd700',goldenrod:'#daa520',gray:'#808080',
    green:'#008000',greenyellow:'#adff2f',grey:'#808080',honeydew:'#f0fff0',hotpink:'#ff69b4',indianred:'#cd5c5c',
    indigo:'#4b0082',ivory:'#fffff0',khaki:'#f0e68c',lavender:'#e6e6fa',lavenderblush:'#fff0f5',lawngreen:'#7cfc00',
    lemonchiffon:'#fffacd',lightblue:'#add8e6',lightcoral:'#f08080',lightcyan:'#e0ffff',lightgoldenrodyellow:'#fafad2',
    lightgray:'#d3d3d3',lightgreen:'#90ee90',lightgrey:'#d3d3d3',lightpink:'#ffb6c1',lightsalmon:'#ffa07a',
    lightseagreen:'#20b2aa',lightskyblue:'#87cefa',lightslategray:'#778899',lightslategrey:'#778899',
    lightsteelblue:'#b0c4de',lightyellow:'#ffffe0',lime:'#00ff00',limegreen:'#32cd32',linen:'#faf0e6',magenta:'#ff00ff',
    maroon:'#800000',mediumaquamarine:'#66cdaa',mediumblue:'#0000cd',mediumorchid:'#ba55d3',mediumpurple:'#9370db',
    mediumseagreen:'#3cb371',mediumslateblue:'#7b68ee',mediumspringgreen:'#00fa9a',mediumturquoise:'#48d1cc',
    mediumvioletred:'#c71585',midnightblue:'#191970',mintcream:'#f5fffa',mistyrose:'#ffe4e1',moccasin:'#ffe4b5',
    navajowhite:'#ffdead',navy:'#000080',oldlace:'#fdf5e6',olive:'#808000',olivedrab:'#6b8e23',orange:'#ffa500',
    orangered:'#ff4500',orchid:'#da70d6',palegoldenrod:'#eee8aa',palegreen:'#98fb98',paleturquoise:'#afeeee',
    palevioletred:'#db7093',papayawhip:'#ffefd5',peachpuff:'#ffdab9',peru:'#cd853f',pink:'#ffc0cb',plum:'#dda0dd',
    powderblue:'#b0e0e6',purple:'#800080',rebeccapurple:'#663399',red:'#ff0000',rosybrown:'#bc8f8f',royalblue:'#4169e1',
    saddlebrown:'#8b4513',salmon:'#fa8072',sandybrown:'#f4a460',seagreen:'#2e8b57',seashell:'#fff5ee',sienna:'#a0522d',
    silver:'#c0c0c0',skyblue:'#87ceeb',slateblue:'#6a5acd',slategray:'#708090',slategrey:'#708090',snow:'#fffafa',
    springgreen:'#00ff7f',steelblue:'#4682b4',tan:'#d2b48c',teal:'#008080',thistle:'#d8bfd8',tomato:'#ff6347',
    turquoise:'#40e0d0',violet:'#ee82ee',wheat:'#f5deb3',white:'#ffffff',whitesmoke:'#f5f5f5',yellow:'#ffff00',
    yellowgreen:'#9acd32',transparent:'rgba(0,0,0,0)'};

  const clamp01=v=>v<0?0:v>1?1:v;
  function hue2rgb(p,q,t){ if(t<0)t+=1; if(t>1)t-=1;
    if(t<1/6) return p+(q-p)*6*t; if(t<1/2) return q; if(t<2/3) return p+(q-p)*(2/3-t)*6; return p; }

  /* → {r,g,b,a} in 0-1, or null when the input is not a colour at all. Never throws:
     an unparseable colour must not take a whole layer down with it. */
  function parseColor(c){
    if(c==null) return null;
    if(typeof c==='object'){
      if(Array.isArray(c)&&c.length>=3) return { r:clamp01(c[0]), g:clamp01(c[1]), b:clamp01(c[2]), a:c.length>3?clamp01(c[3]):1 };
      if(typeof c.r==='number') return { r:clamp01(c.r), g:clamp01(c.g), b:clamp01(c.b), a:(c.a==null?1:clamp01(c.a)) };
      return null;
    }
    let s=String(c).trim().toLowerCase();
    if(NAMED[s]) s=NAMED[s];
    if(s[0]==='#'){
      const h=s.slice(1);
      const n=v=>parseInt(v,16);
      if(h.length===3||h.length===4)
        return { r:n(h[0]+h[0])/255, g:n(h[1]+h[1])/255, b:n(h[2]+h[2])/255, a:h.length===4?n(h[3]+h[3])/255:1 };
      if(h.length===6||h.length===8)
        return { r:n(h.slice(0,2))/255, g:n(h.slice(2,4))/255, b:n(h.slice(4,6))/255, a:h.length===8?n(h.slice(6,8))/255:1 };
      return null;
    }
    let m=/^rgba?\(([^)]+)\)$/.exec(s);
    if(m){
      const p=m[1].split(/[,\s/]+/).filter(Boolean);
      if(p.length<3) return null;
      const ch=v=>v.endsWith('%')?clamp01(parseFloat(v)/100):clamp01(parseFloat(v)/255);
      const al=v=>v==null?1:(v.endsWith('%')?clamp01(parseFloat(v)/100):clamp01(parseFloat(v)));
      return { r:ch(p[0]), g:ch(p[1]), b:ch(p[2]), a:al(p[3]) };
    }
    m=/^hsla?\(([^)]+)\)$/.exec(s);
    if(m){
      const p=m[1].split(/[,\s/]+/).filter(Boolean);
      if(p.length<3) return null;
      const h=((parseFloat(p[0])%360)+360)%360/360, sa=clamp01(parseFloat(p[1])/100), l=clamp01(parseFloat(p[2])/100);
      const a=p[3]==null?1:(p[3].endsWith('%')?clamp01(parseFloat(p[3])/100):clamp01(parseFloat(p[3])));
      if(sa===0) return { r:l, g:l, b:l, a };
      const q=l<0.5?l*(1+sa):l+sa-l*sa, pp=2*l-q;
      return { r:hue2rgb(pp,q,h+1/3), g:hue2rgb(pp,q,h), b:hue2rgb(pp,q,h-1/3), a };
    }
    return null;
  }
  const isColorish=v=>typeof v==='string'&&(v[0]==='#'||/^(rgba?|hsla?)\(/.test(v)||Object.prototype.hasOwnProperty.call(NAMED,v.toLowerCase()));

  /* ── INTERPOLATION ─────────────────────────────────────────────────────────
     MapLibre interpolates numbers, colours and arrays-of-numbers (an offset, a
     dash pattern). Colours are mixed in the space named by the operator; #R180
     implements `interpolate` and `interpolate-hcl`/`interpolate-lab` are mapped
     to the CIE-Lab mix rather than silently falling back to sRGB, because a
     two-stop ramp through Lab and one through sRGB differ visibly in the middle
     and the choropleths use exactly that shape. */
  const lerp=(a,b,t)=>a+(b-a)*t;
  function srgbToLin(v){ return v<=0.04045?v/12.92:Math.pow((v+0.055)/1.055,2.4); }
  function linToSrgb(v){ return v<=0.0031308?v*12.92:1.055*Math.pow(v,1/2.4)-0.055; }
  function rgbToLab(c){
    const r=srgbToLin(c.r), g=srgbToLin(c.g), b=srgbToLin(c.b);
    let x=(r*0.4124+g*0.3576+b*0.1805)/0.95047, y=(r*0.2126+g*0.7152+b*0.0722), z=(r*0.0193+g*0.1192+b*0.9505)/1.08883;
    const f=t=>t>0.008856?Math.cbrt(t):(7.787*t+16/116);
    x=f(x); y=f(y); z=f(z);
    return { L:116*y-16, a:500*(x-y), b:200*(y-z), alpha:c.a };
  }
  function labToRgb(l){
    const y=(l.L+16)/116, x=l.a/500+y, z=y-l.b/200;
    const g=t=>{ const t3=t*t*t; return t3>0.008856?t3:(t-16/116)/7.787; };
    const X=g(x)*0.95047, Y=g(y), Z=g(z)*1.08883;
    const r=X*3.2406+Y*-1.5372+Z*-0.4986, gg=X*-0.9689+Y*1.8758+Z*0.0415, b=X*0.0557+Y*-0.2040+Z*1.0570;
    return { r:clamp01(linToSrgb(r)), g:clamp01(linToSrgb(gg)), b:clamp01(linToSrgb(b)), a:l.alpha };
  }
  function mixColor(A,B,t,space){
    if(space==='lab'||space==='hcl'){
      const a=rgbToLab(A), b=rgbToLab(B);
      return labToRgb({ L:lerp(a.L,b.L,t), a:lerp(a.a,b.a,t), b:lerp(a.b,b.b,t), alpha:lerp(A.a,B.a,t) });
    }
    /* sRGB is what MapLibre's plain `interpolate` does */
    return { r:lerp(A.r,B.r,t), g:lerp(A.g,B.g,t), b:lerp(A.b,B.b,t), a:lerp(A.a,B.a,t) };
  }
  function mixValue(a,b,t,space){
    if(typeof a==='number'&&typeof b==='number') return lerp(a,b,t);
    if(Array.isArray(a)&&Array.isArray(b)) return a.map((v,i)=>typeof v==='number'&&typeof b[i]==='number'?lerp(v,b[i],t):v);
    const A=parseColor(a), B=parseColor(b);
    if(A&&B) return mixColor(A,B,t,space);
    return t<1?a:b;                    /* not interpolatable — step, which is what MapLibre does too */
  }
  /* the interpolation curve's parameter, given the input and the bracketing stops */
  function curveT(kind,base,x,lo,hi){
    if(hi===lo) return 0;
    if(kind==='exponential'&&base!==1){
      const d=hi-lo, p=x-lo;
      return (Math.pow(base,p)-1)/(Math.pow(base,d)-1);
    }
    if(kind==='cubic-bezier'){
      /* MapLibre's own unit-bezier, Newton-solved. `base` carries [x1,y1,x2,y2]. */
      const [x1,y1,x2,y2]=base;
      const t=(x-lo)/(hi-lo);
      const cx=3*x1, bx=3*(x2-x1)-cx, ax=1-cx-bx;
      const cy=3*y1, by=3*(y2-y1)-cy, ay=1-cy-by;
      const sampX=u=>((ax*u+bx)*u+cx)*u, dX=u=>(3*ax*u+2*bx)*u+cx;
      let u=t;
      for(let i=0;i<8;i++){ const e=sampX(u)-t; if(Math.abs(e)<1e-6) break; const d=dX(u); if(Math.abs(d)<1e-6) break; u-=e/d; }
      return ((ay*u+by)*u+cy)*u;
    }
    return (x-lo)/(hi-lo);             /* linear */
  }

  /* ── THE EVALUATOR ─────────────────────────────────────────────────────────
     `ctx` is { properties, geometryType, id, zoom, state, heatmapDensity }.
     Everything is guarded: an expression that throws must colour one feature
     wrong, never stop the layer. */
  const asNum=v=>{ const n=typeof v==='number'?v:parseFloat(v); return isFinite(n)?n:null; };
  const truthy=v=>!(v===false||v==null||v===0||v===''||(typeof v==='number'&&isNaN(v)));
  function deepEq(a,b){
    if(a===b) return true;
    if(Array.isArray(a)&&Array.isArray(b)) return a.length===b.length&&a.every((v,i)=>deepEq(v,b[i]));
    return false;
  }
  /* Ordering comparisons in MapLibre are only defined for two numbers or two
     strings; mixing them is an error there, and here it is simply false — a
     wrong colour beats a dead layer. */
  function cmp(op,a,b){
    if(typeof a!==typeof b) { const x=asNum(a), y=asNum(b); if(x==null||y==null) return false; a=x; b=y; }
    switch(op){ case '<': return a<b; case '<=': return a<=b; case '>': return a>b; case '>=': return a>=b; }
    return false;
  }

  /* Names the interpreter knows it does NOT implement. Reported rather than
     ignored: #R162's lesson is that a silent typeof guard deletes a feature
     without anybody finding out. The engine surfaces this list through
     IntMapGeoEngine.capabilities().styleGaps. */
  const UNSUPPORTED=new Set(['format','image','number-format','collator','resolved-locale','distance','within','pitch','distance-from-center']);
  const seenGaps=new Set();
  function gap(op){ seenGaps.add(op); }

  function evaluate(ex,ctx){
    try{ return _ev(ex,ctx||{},Object.create(null)); }catch(_){ return null; }
  }
  function _ev(ex,ctx,vars){
    if(ex==null) return null;
    if(typeof ex!=='object') return ex;                       /* a literal */
    if(!Array.isArray(ex)) return ex;                         /* a plain object (e.g. a stop function's shape) */
    if(!ex.length) return ex;
    const op=ex[0];
    if(typeof op!=='string') return ex;                       /* an array literal such as [0,-1] */
    const A=i=>_ev(ex[i],ctx,vars);
    switch(op){
      /* ── data ────────────────────────────────────────────────────────── */
      case 'literal': return ex[1];
      case 'get': { const k=A(1); const o=ex.length>2?A(2):(ctx.properties||{}); return (o&&Object.prototype.hasOwnProperty.call(o,k))?o[k]:null; }
      case 'has': { const k=A(1); const o=ex.length>2?A(2):(ctx.properties||{}); return !!(o&&Object.prototype.hasOwnProperty.call(o,k)); }
      case 'properties': return ctx.properties||{};
      case 'geometry-type': return ctx.geometryType||null;
      case 'id': return ctx.id==null?null:ctx.id;
      case 'feature-state': { const k=A(1); const s=ctx.state||{}; return Object.prototype.hasOwnProperty.call(s,k)?s[k]:null; }
      case 'zoom': return ctx.zoom==null?0:ctx.zoom;
      case 'heatmap-density': return ctx.heatmapDensity==null?0:ctx.heatmapDensity;
      /* `color-relief-color` is an interpolate over ['elevation'] — a term only that
         layer type has an input for, supplied through ctx.elevation by the relief
         raster producer rather than by widening every other evaluation context. */
      case 'elevation': return ctx.elevation==null?0:ctx.elevation;
      case 'line-progress': return ctx.lineProgress==null?0:ctx.lineProgress;
      case 'accumulated': return ctx.accumulated==null?0:ctx.accumulated;
      /* ── lookup ──────────────────────────────────────────────────────── */
      case 'at': { const i=asNum(A(1)), a=A(2); return (Array.isArray(a)&&i!=null&&i>=0&&i<a.length)?a[i|0]:null; }
      case 'in': { const n=A(1), h=A(2);
        if(typeof h==='string') return String(h).indexOf(String(n))>=0;
        return Array.isArray(h)?h.some(v=>deepEq(v,n)):false; }
      case 'index-of': { const n=A(1), h=A(2);
        if(typeof h==='string') return h.indexOf(String(n));
        return Array.isArray(h)?h.findIndex(v=>deepEq(v,n)):-1; }
      case 'slice': { const a=A(1), s=asNum(A(2))||0; const e=ex.length>3?asNum(A(3)):undefined;
        return (typeof a==='string'||Array.isArray(a))?a.slice(s,e):null; }
      case 'length': { const a=A(1); return (typeof a==='string'||Array.isArray(a))?a.length:null; }
      /* ── decision ────────────────────────────────────────────────────── */
      case 'case': { for(let i=1;i+1<ex.length;i+=2) if(truthy(_ev(ex[i],ctx,vars))) return _ev(ex[i+1],ctx,vars);
        return _ev(ex[ex.length-1],ctx,vars); }
      case 'match': { const v=A(1);
        for(let i=2;i+1<ex.length;i+=2){ const lab=ex[i];
          if(Array.isArray(lab)?lab.some(l=>deepEq(l,v)):deepEq(lab,v)) return _ev(ex[i+1],ctx,vars); }
        return _ev(ex[ex.length-1],ctx,vars); }
      case 'coalesce': { for(let i=1;i<ex.length;i++){ const v=_ev(ex[i],ctx,vars); if(v!=null) return v; } return null; }
      case 'step': { const x=asNum(A(1)); if(x==null) return _ev(ex[2],ctx,vars);
        let out=_ev(ex[2],ctx,vars);
        for(let i=3;i+1<ex.length;i+=2){ const stop=asNum(_ev(ex[i],ctx,vars)); if(stop!=null&&x>=stop) out=_ev(ex[i+1],ctx,vars); else break; }
        return out; }
      case 'interpolate': case 'interpolate-hcl': case 'interpolate-lab': {
        const space=op==='interpolate'?'rgb':(op==='interpolate-hcl'?'hcl':'lab');
        const curve=ex[1]||['linear'];
        const kind=Array.isArray(curve)?curve[0]:'linear';
        const base=kind==='exponential'?(asNum(_ev(curve[1],ctx,vars))||1)
                 :kind==='cubic-bezier'?[+curve[1],+curve[2],+curve[3],+curve[4]]:1;
        const x=asNum(A(2));
        const stops=[];
        for(let i=3;i+1<ex.length;i+=2) stops.push([asNum(_ev(ex[i],ctx,vars)), _ev(ex[i+1],ctx,vars)]);
        if(!stops.length) return null;
        if(x==null||x<=stops[0][0]) return stops[0][1];
        if(x>=stops[stops.length-1][0]) return stops[stops.length-1][1];
        for(let i=0;i+1<stops.length;i++){
          const [lo,lv]=stops[i], [hi,hv]=stops[i+1];
          if(x>=lo&&x<=hi) return mixValue(lv,hv,curveT(kind,base,x,lo,hi),space);
        }
        return stops[stops.length-1][1]; }
      /* ── boolean ─────────────────────────────────────────────────────── */
      case '!': return !truthy(A(1));
      case '==': return deepEq(A(1),A(2));
      case '!=': return !deepEq(A(1),A(2));
      case '<': case '<=': case '>': case '>=': return cmp(op,A(1),A(2));
      case 'all': { for(let i=1;i<ex.length;i++) if(!truthy(_ev(ex[i],ctx,vars))) return false; return true; }
      case 'any': { for(let i=1;i<ex.length;i++) if(truthy(_ev(ex[i],ctx,vars))) return true; return false; }
      /* ── arithmetic ──────────────────────────────────────────────────── */
      case '+': { let s=0; for(let i=1;i<ex.length;i++) s+=asNum(_ev(ex[i],ctx,vars))||0; return s; }
      case '*': { let s=1; for(let i=1;i<ex.length;i++) s*=(asNum(_ev(ex[i],ctx,vars))||0); return s; }
      case '-': { const a=asNum(A(1))||0; return ex.length>2?a-(asNum(A(2))||0):-a; }
      case '/': { const b=asNum(A(2)); return b?((asNum(A(1))||0)/b):null; }
      case '%': { const b=asNum(A(2)); return b?((asNum(A(1))||0)%b):null; }
      case '^': return Math.pow(asNum(A(1))||0, asNum(A(2))||0);
      case 'abs': return Math.abs(asNum(A(1))||0);
      case 'ceil': return Math.ceil(asNum(A(1))||0);
      case 'floor': return Math.floor(asNum(A(1))||0);
      case 'round': { const v=asNum(A(1))||0; return Math.sign(v)*Math.round(Math.abs(v)); }
      case 'sqrt': return Math.sqrt(asNum(A(1))||0);
      case 'ln': return Math.log(asNum(A(1))||0);
      case 'ln2': return Math.LN2;
      case 'log2': return Math.log2(asNum(A(1))||0);
      case 'log10': return Math.log10(asNum(A(1))||0);
      case 'sin': return Math.sin(asNum(A(1))||0);
      case 'cos': return Math.cos(asNum(A(1))||0);
      case 'tan': return Math.tan(asNum(A(1))||0);
      case 'asin': return Math.asin(asNum(A(1))||0);
      case 'acos': return Math.acos(asNum(A(1))||0);
      case 'atan': return Math.atan(asNum(A(1))||0);
      case 'e': return Math.E;
      case 'pi': return Math.PI;
      case 'min': { let v=Infinity; for(let i=1;i<ex.length;i++) v=Math.min(v,asNum(_ev(ex[i],ctx,vars))||0); return v; }
      case 'max': { let v=-Infinity; for(let i=1;i<ex.length;i++) v=Math.max(v,asNum(_ev(ex[i],ctx,vars))||0); return v; }
      /* ── types ───────────────────────────────────────────────────────── */
      case 'to-boolean': return truthy(A(1));
      case 'to-number': { for(let i=1;i<ex.length;i++){ const v=_ev(ex[i],ctx,vars);
        if(v===null) return 0; if(v===true) return 1; if(v===false) return 0;
        const n=asNum(v); if(n!=null) return n; } return null; }
      case 'to-string': { const v=A(1); return v==null?'':(typeof v==='object'?JSON.stringify(v):String(v)); }
      case 'to-color': { for(let i=1;i<ex.length;i++){ const v=_ev(ex[i],ctx,vars); if(parseColor(v)) return v; } return null; }
      case 'typeof': { const v=A(1);
        return v==null?'null':Array.isArray(v)?'array':(isColorish(v)?'color':typeof v); }
      case 'number': case 'string': case 'boolean': case 'object': case 'array': {
        for(let i=1;i<ex.length;i++){ const v=_ev(ex[i],ctx,vars);
          if(op==='array'){ if(Array.isArray(v)) return v; continue; }
          if(op==='object'){ if(v&&typeof v==='object'&&!Array.isArray(v)) return v; continue; }
          if(typeof v===op) return v; }
        return op==='number'?0:op==='string'?'':op==='boolean'?false:null; }
      /* ── strings & colour construction ───────────────────────────────── */
      case 'concat': { let s=''; for(let i=1;i<ex.length;i++){ const v=_ev(ex[i],ctx,vars); if(v!=null) s+=(typeof v==='object'?JSON.stringify(v):String(v)); } return s; }
      case 'downcase': return String(A(1)==null?'':A(1)).toLowerCase();
      case 'upcase': return String(A(1)==null?'':A(1)).toUpperCase();
      case 'rgb': return `rgb(${asNum(A(1))|0},${asNum(A(2))|0},${asNum(A(3))|0})`;
      case 'rgba': return `rgba(${asNum(A(1))|0},${asNum(A(2))|0},${asNum(A(3))|0},${asNum(A(4))==null?1:asNum(A(4))})`;
      case 'to-rgba': { const c=parseColor(A(1)); return c?[Math.round(c.r*255),Math.round(c.g*255),Math.round(c.b*255),c.a]:null; }
      /* ── binding ─────────────────────────────────────────────────────── */
      case 'let': { const inner=Object.create(vars);
        for(let i=1;i+1<ex.length;i+=2) inner[String(ex[i])]=_ev(ex[i+1],ctx,vars);
        return _ev(ex[ex.length-1],ctx,inner); }
      case 'var': { const k=String(ex[1]); return (k in vars)?vars[k]:null; }
      default:
        if(UNSUPPORTED.has(op)){ gap(op);
          /* `format`/`image` degrade to their plain payload rather than to nothing:
             a label that loses its font styling still reads, a label that loses its
             text does not. */
          if(op==='format') return _ev(ex[1],ctx,vars);
          if(op==='image') return _ev(ex[1],ctx,vars);
          return null; }
        /* Not an operator at all — an ARRAY LITERAL whose first element happens to be
           a string, e.g. text-font ['Noto Sans Regular'] or a legacy filter. Returning
           it verbatim is right and is why `literal` is not required everywhere. */
        return ex.map(v=>(v&&typeof v==='object')?_ev(v,ctx,vars):v);
    }
  }

  /* Is this value an expression at all, or a constant the caller can cache?
     Cheap and important: 97 of the app's sources are GeoJSON and most paint
     properties on them are plain strings, so re-evaluating per feature per frame
     would be the whole cost of the engine for no result. */
  function isExpression(v){
    if(!Array.isArray(v)||!v.length) return false;
    const op=v[0];
    if(typeof op!=='string') return false;
    if(op==='literal') return true;
    return KNOWN.has(op);
  }
  const KNOWN=new Set(['literal','get','has','properties','geometry-type','id','feature-state','zoom','heatmap-density','elevation',
    'line-progress','accumulated','at','in','index-of','slice','length','case','match','coalesce','step','interpolate',
    'interpolate-hcl','interpolate-lab','!','==','!=','<','<=','>','>=','all','any','+','*','-','/','%','^','abs','ceil',
    'floor','round','sqrt','ln','ln2','log2','log10','sin','cos','tan','asin','acos','atan','e','pi','min','max',
    'to-boolean','to-number','to-string','to-color','typeof','number','string','boolean','object','array','concat',
    'downcase','upcase','rgb','rgba','to-rgba','let','var','format','image','number-format','collator','resolved-locale',
    'distance','within','pitch','distance-from-center']);

  /* Does this expression depend on the FEATURE, or only on the zoom? A property
     that depends on zoom alone is evaluated once per camera change for the whole
     layer; one that reads `get`/`feature-state` has to be evaluated per feature.
     Telling them apart is the difference between 49 circle layers costing one
     evaluation each and costing one per point. */
  const FEATURE_OPS=new Set(['get','has','properties','geometry-type','id','feature-state','line-progress','accumulated']);
  function dependsOnFeature(ex){
    if(!Array.isArray(ex)) return false;
    if(typeof ex[0]==='string'&&FEATURE_OPS.has(ex[0])) return true;
    return ex.some(v=>Array.isArray(v)&&dependsOnFeature(v));
  }
  function dependsOnZoom(ex){
    if(!Array.isArray(ex)) return false;
    if(ex[0]==='zoom') return true;
    return ex.some(v=>Array.isArray(v)&&dependsOnZoom(v));
  }

  /* ── FILTERS ───────────────────────────────────────────────────────────────
     Both spellings, because the app writes both: the LEGACY form
     ['all',['==','$type','LineString'],['!=','kind','equator']] (15 uses of
     `$type` measured, all in the boot style and the tool layers) and modern
     expression filters. The legacy form is converted rather than special-cased
     at evaluation time, so there is exactly one evaluator. */
  const LEGACY_OPS=new Set(['==','!=','<','<=','>','>=','in','!in','has','!has','all','any','none']);
  function isLegacyFilter(f){
    if(!Array.isArray(f)||!f.length||typeof f[0]!=='string') return false;
    if(!LEGACY_OPS.has(f[0])) return false;
    if(f[0]==='all'||f[0]==='any'||f[0]==='none') return f.slice(1).every(isLegacyFilter);
    /* the discriminator: in the legacy form the second element is a KEY (a plain
       string), in the modern form it is an expression (an array) */
    return typeof f[1]==='string';
  }
  const keyExpr=k=>k==='$type'?['geometry-type']:k==='$id'?['id']:['get',k];
  function fromLegacy(f){
    if(!Array.isArray(f)||!f.length) return null;
    const op=f[0];
    switch(op){
      case 'all': return ['all',...f.slice(1).map(fromLegacy)];
      case 'any': return ['any',...f.slice(1).map(fromLegacy)];
      case 'none': return ['!',['any',...f.slice(1).map(fromLegacy)]];
      case 'has': return ['has',f[1]];
      case '!has': return ['!',['has',f[1]]];
      case 'in': return ['in',keyExpr(f[1]),['literal',f.slice(2)]];
      case '!in': return ['!',['in',keyExpr(f[1]),['literal',f.slice(2)]]];
      case '==': case '!=': case '<': case '<=': case '>': case '>=':
        /* `$type` is compared against 'Point'/'LineString'/'Polygon', which is what
           geometry-type answers — a MultiPolygon reports 'Polygon' there, and the
           renderer's own filter behaves the same way. */
        return [op,keyExpr(f[1]),f[2]];
    }
    return null;
  }
  /* → a function(feature-ish ctx) → boolean. `null`/absent filter passes everything. */
  function compileFilter(f){
    if(f==null) return ()=>true;
    const ex=isLegacyFilter(f)?fromLegacy(f):f;
    if(!Array.isArray(ex)) return ()=>true;
    return ctx=>{ const v=evaluate(ex,ctx); return !(v===false||v==null); };
  }

  /* ── PROPERTY RESOLUTION ───────────────────────────────────────────────────
     One place that turns "whatever the style says" into a value, covering the
     three spellings the app actually uses: a constant, an expression, and the
     legacy {stops:[…]} function (which the choropleth ramps still emit). */
  function resolve(spec,ctx,fallback){
    if(spec===undefined||spec===null) return fallback;
    if(Array.isArray(spec)&&isExpression(spec)){ const v=evaluate(spec,ctx); return v==null?fallback:v; }
    if(spec&&typeof spec==='object'&&Array.isArray(spec.stops)) return legacyStops(spec,ctx,fallback);
    return spec;
  }
  function legacyStops(fn,ctx,fallback){
    const stops=fn.stops||[]; if(!stops.length) return fallback;
    const input=fn.property!=null
      ? ((ctx.properties||{})[fn.property])
      : (ctx.zoom==null?0:ctx.zoom);
    const x=asNum(input);
    const type=fn.type||(fn.property!=null&&typeof input!=='number'?'categorical':'exponential');
    if(type==='categorical'){
      for(const [k,v] of stops) if(deepEq(k,input)) return v;
      return fn.default!=null?fn.default:fallback;
    }
    if(x==null) return fn.default!=null?fn.default:fallback;
    if(type==='interval'){
      let out=stops[0][1];
      for(const [k,v] of stops){ if(x>=k) out=v; else break; }
      return out;
    }
    const base=fn.base==null?1:fn.base;
    if(x<=stops[0][0]) return stops[0][1];
    if(x>=stops[stops.length-1][0]) return stops[stops.length-1][1];
    for(let i=0;i+1<stops.length;i++){
      const [lo,lv]=stops[i], [hi,hv]=stops[i+1];
      if(x>=lo&&x<=hi) return mixValue(lv,hv,curveT(base===1?'linear':'exponential',base,x,lo,hi),'rgb');
    }
    return stops[stops.length-1][1];
  }
  /* the same thing, for a colour: always → {r,g,b,a} or null */
  function resolveColor(spec,ctx,fallback){
    const v=resolve(spec,ctx,fallback);
    return parseColor(v)||parseColor(fallback);
  }
  function resolveNum(spec,ctx,fallback){
    const v=asNum(resolve(spec,ctx,fallback));
    return v==null?fallback:v;
  }

  return { parseColor, isColorish, evaluate, isExpression, dependsOnFeature, dependsOnZoom,
           compileFilter, isLegacyFilter, fromLegacy, resolve, resolveColor, resolveNum,
           mixValue, mixColor, rgbToLab, labToRgb,
           /* what the interpreter met and does not implement — reported, never hidden */
           gaps:()=>[...seenGaps], UNSUPPORTED:[...UNSUPPORTED] };
})();
