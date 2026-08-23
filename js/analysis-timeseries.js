/* ============================================================================
 *  IntMap · Time-series chart — the implementation behind window.IntMapTimeSeries  (#R322)
 * ----------------------------------------------------------------------------
 *  Fetched by js/lazy-modules.js the first time something opens the chart. js/analysis-panels.js
 *  keeps the eager SHELL — it publishes window.IntMapTimeSeries at boot and every entry point
 *  awaits `IntMapLazy.need('analysisTimeSeries')` before it reaches anything here.
 *
 *  The body below is the block that used to live in js/analysis-panels.js, moved verbatim: the
 *  only change is the name of the global it publishes. ⚠ IT IS `__imAnalysis…` AND NOT
 *  `IntMap…` ON PURPOSE — js/atlas-controls.js's moduleCatalog() discovers `window.IntMap*` by
 *  enumeration, so a second IntMap-named object for the same feature would offer the planner a
 *  duplicate capability that nothing dispatches.
 * ==========================================================================*/
window.IntMapModules=window.IntMapModules||{};
window.IntMapModules.analysisTimeSeries=function(HOST){
  const GE=()=>window.IntMapGeoEngine;   /* (#R178) the renderer, through the contract — never the raw handle */
  /* (#R170) "Is it safe to addSource/addLayer right now?" — the app-wide predicate declared in index.html.
     A function DECLARATION so nested closures above this line can call it (no TDZ). Falls back to the old
     isStyleLoaded() test only if the host is somehow absent. */
  function _imCanDraw(){ try{ return !!HOST.canDraw(); }catch(_){ try{ return !!GE().ready(); }catch(__){ return false; } } }
  window.__imAnalysisTimeSeries=(function(){
    const jp=()=>HOST.lang==='jp';
    const LP=window.IntMapLang.pick(()=>HOST.lang);
    /* (#R241) the ARRAY form of the language helper — see `pickArgs` in js/lang-registry.js.
       These tables held their translations as a bare array indexed by the language's position:
       no inline-table fallback (so fr/ko/zh got element 0 for ever) and invisible to every
       translation instrument. Written as a call, they are ordinary L(…) sites to the audits. */
    const LA=window.IntMapLang.pickArgs();
    function short(v){ const a=Math.abs(v); if(a>=1e12) return (v/1e12).toFixed(2)+'T'; if(a>=1e9) return (v/1e9).toFixed(2)+'B'; if(a>=1e6) return (v/1e6).toFixed(2)+'M'; if(a>=1e3) return (v/1e3).toFixed(1)+'k'; return ''+Math.round(v); }
    const IND=[
      {id:'NY.GDP.MKTP.CD', label:LA('GDP (US$)','GDP（米ドル）','BIP (US$)','ВВП (долл. США)','PIB (US$)'), fmt:v=>'$'+short(v)},
      {id:'NY.GDP.PCAP.CD', label:LA('GDP per capita','1人当たりGDP','BIP pro Kopf','ВВП на душу населения','PIB per cápita'), fmt:v=>'$'+Math.round(v).toLocaleString()},
      {id:'SP.POP.TOTL', label:LA('Population','人口','Bevölkerung','Население','Población'), fmt:v=>short(v)},
      {id:'SP.DYN.LE00.IN', label:LA('Life expectancy','平均寿命','Lebenserwartung','Ожидаемая продолжительность жизни','Esperanza de vida'), fmt:v=>v.toFixed(1)+(window.IntMapLang.t(HOST.lang," yr"," 歳"," J."," лет"," años"))},
      {id:'MS.MIL.XPND.GD.ZS', label:LA('Military (% GDP)','軍事費（対GDP）','Militär (% BIP)','Военные расходы (% ВВП)','Militar (% PIB)'), fmt:v=>v.toFixed(2)+'%'},
      {id:['EN.GHG.CO2.PC.CE.AR5','EN.ATM.CO2E.PC'], label:LA('CO₂ per capita (t)','1人当たりCO₂ (t)','CO₂ pro Kopf (t)','CO₂ на душу населения (т)','CO₂ per cápita (t)'), fmt:v=>v.toFixed(2)}   /* (#R69) WB retired EN.ATM.CO2E.PC (0 values → "データなし") — successor first, old code as fallback */
    ];
    let modal=null;
    function ensureModal(){ if(modal) return modal; modal=document.createElement('div'); modal.className='modal-overlay'; modal.id='timeseries-modal';
      modal.innerHTML='<div class="modal-content" style="position:relative;max-width:560px;max-height:86vh;overflow-y:auto;"><button id="ts-x" type="button" style="position:absolute;top:14px;right:14px;width:32px;height:32px;border:none;background:transparent;color:var(--text-muted);font-size:25px;line-height:1;cursor:pointer;">×</button><h3 id="ts-title" style="margin:0 0 4px;font-size:18px;"></h3><p id="ts-sub" style="margin:0 0 12px;color:var(--text-muted);font-size:12px;"></p><div id="ts-body"></div></div>';
      document.body.appendChild(modal);
      modal.querySelector('#ts-x').onclick=()=>{ modal.style.display='none'; };
      modal.addEventListener('click',e=>{ if(e.target===modal) modal.style.display='none'; });
      return modal; }
    /* (#R69) shared-promise cache (re-opening the modal was refetching all 6 series every time) + array ids =
       ordered fallback for series the World Bank retired. */
    const _tsCache={};
    function _tsOne(code,id){ const key=id+'|'+code;
      if(_tsCache[key]===undefined){
        let wrapped=null;
        wrapped=(async()=>{
          const c=('AbortController' in window)?new AbortController():null; const tm=c?setTimeout(()=>{ try{ c.abort(); }catch(_){} },20000):null;
          try{
            const r=await fetch('https://api.worldbank.org/v2/country/'+encodeURIComponent(code)+'/indicator/'+id+'?format=json&per_page=80&date=1970:2030',c?{signal:c.signal}:undefined);
            const j=await r.json(); if(tm) clearTimeout(tm);
            if(Array.isArray(j)&&j[1]){ const out=j[1].filter(d=>d.value!=null).map(d=>({y:+d.date,v:+d.value})).sort((a,b)=>a.y-b.y); if(out.length) return out; }
            if(Array.isArray(j)) return null;
          }catch(_){ if(tm) clearTimeout(tm); }
          throw 0;
        })().catch(()=>{ if(_tsCache[key]===wrapped) delete _tsCache[key]; return null; });
        _tsCache[key]=wrapped;
      }
      return _tsCache[key]; }
    async function fetchInd(code,id){ const ids=Array.isArray(id)?id:[id]; for(const one of ids){ const v=await _tsOne(code,one); if(v) return v; } return null; }
    /* (#R34) Reworked per the explicit spec: NO always-on dots ("ドットは不要"); hovering ANYWHERE in the
       chart area shows the value INSTANTLY (a JS crosshair, not a laggy native <title> — "反応が悪い"); a
       vertical line is drawn at the cursor and a SINGLE dot sits where it meets the line ("カーソル地点の時間
       に線が引かれ、グラフとの交点にだけドット"). The per-point [px,py,year,formatted] data is embedded so
       wireCharts() can drive the crosshair after the HTML is injected. */
    const TS_W=500, TS_H=92;
    function chart(series,label,fmt){
      if(!series||series.length<2) return '<div style="color:var(--text-muted);font-size:11px;padding:3px 0 9px;">'+label+': '+(window.IntMapLang.t(HOST.lang,"no data","データなし","Keine Daten","Нет данных","Sin datos"))+'</div>';
      const W=TS_W,H=TS_H,padL=8,padR=8,padT=14,padB=16; const ys=series.map(s=>s.v); let minV=Math.min(...ys), maxV=Math.max(...ys); const y0=series[0].y, y1=series[series.length-1].y;
      /* (#R110) 0-baseline guide line ("CountriesのTime-seriesには、0の場所に補助線を引いて…プラスマイナス系指標のように"):
         extend the axis down to 0 so the zero line is visible whenever the data crosses zero, or is all-positive but
         spans a wide range toward 0 (GDP, population, CO₂, military %…). A narrow high band (e.g. life-expectancy
         60–82, minV≈0.7·maxV) keeps its zoomed scale so it is not crushed against the top. */
      const _incZero=(minV<0)||(minV>=0&&maxV>0&&minV<maxV*0.9);   /* (#R110) show the 0 line on essentially every indicator; only skip a near-constant high band (minV within 10% of maxV) where a 0 baseline would crush the trace */
      if(_incZero){ minV=Math.min(minV,0); maxV=Math.max(maxV,0); }
      const X=y=>padL+((y-y0)/((y1-y0)||1))*(W-padL-padR), Y=v=>padT+(1-(v-minV)/((maxV-minV)||1))*(H-padT-padB);
      let d=''; const pts=[]; series.forEach((s,i)=>{ const x=X(s.y),y=Y(s.v); d+=(i?'L':'M')+x.toFixed(1)+' '+y.toFixed(1)+' '; pts.push([+x.toFixed(1),+y.toFixed(1),s.y,fmt(s.v)]); });
      const last=series[series.length-1];
      const ptsAttr=JSON.stringify(pts).replace(/'/g,'&#39;');
      const _zLine=(_incZero&&minV<=0&&maxV>=0&&(maxV-minV)>0)?('<line x1="'+padL+'" x2="'+(W-padR)+'" y1="'+Y(0).toFixed(1)+'" y2="'+Y(0).toFixed(1)+'" stroke="var(--text-muted)" stroke-width="1" stroke-dasharray="4 4" opacity="0.5" vector-effect="non-scaling-stroke"/><text x="'+(padL+2)+'" y="'+(Y(0)-3).toFixed(1)+'" font-size="9" fill="var(--text-muted)">0</text>'):'';
      return '<div class="ts-wrap" style="margin:0 0 12px;position:relative;" data-pts=\''+ptsAttr+'\'>'
        +'<div style="display:flex;justify-content:space-between;font-size:11.5px;margin-bottom:2px;"><b style="color:var(--text-main);">'+label+'</b><span style="color:var(--primary-color);font-weight:700;">'+fmt(last.v)+' <span style="color:var(--text-muted);font-weight:400;">('+last.y+')</span></span></div>'
        +'<svg class="ts-svg" width="100%" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none" style="display:block;height:90px;background:var(--input-bg);border-radius:8px;cursor:crosshair;touch-action:none;">'
          +_zLine
          +'<path d="'+d+'" fill="none" stroke="var(--primary-color)" stroke-width="2" vector-effect="non-scaling-stroke"/>'
          +'<line class="ts-cursor" y1="0" y2="'+H+'" stroke="var(--text-muted)" stroke-width="1" stroke-dasharray="3 3" vector-effect="non-scaling-stroke" style="display:none;"/>'
          +'<text x="'+padL+'" y="'+(H-3)+'" font-size="9" fill="var(--text-muted)">'+y0+'</text><text x="'+(W-padR)+'" y="'+(H-3)+'" font-size="9" fill="var(--text-muted)" text-anchor="end">'+y1+'</text>'
        +'</svg>'
        +'<div class="ts-tip" style="display:none;position:absolute;pointer-events:none;background:var(--popup-bg);border:1px solid var(--glass-border,rgba(128,128,128,0.25));border-radius:7px;padding:3px 8px;font-size:11px;font-weight:600;color:var(--text-main);box-shadow:var(--shadow);white-space:nowrap;z-index:5;transform:translate(-50%,-118%);"></div>'
        /* (#R35) The intersection dot is an HTML element (perfect circle) — the old SVG <circle> lived in a
           preserveAspectRatio="none" chart, so the non-uniform x/y scale squashed it into an ellipse
           ("ドットが縦に潰れて楕円"). An absolutely-positioned div is immune to that scaling. */
        +'<div class="ts-dot" style="display:none;position:absolute;width:9px;height:9px;border-radius:50%;background:var(--primary-color);border:1.5px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,0.18);pointer-events:none;transform:translate(-50%,-50%);z-index:6;"></div>'
      +'</div>';
    }
    /* (#R34) Wire each chart's instant crosshair after its HTML is in the DOM. */
    function wireCharts(root){ if(!root) return; root.querySelectorAll('.ts-wrap').forEach(wrap=>{
      const svg=wrap.querySelector('.ts-svg'), cur=wrap.querySelector('.ts-cursor'), dot=wrap.querySelector('.ts-dot'), tip=wrap.querySelector('.ts-tip');
      if(!svg||!cur||!dot||!tip) return; let pts=[]; try{ pts=JSON.parse(wrap.getAttribute('data-pts')||'[]'); }catch(_){} if(!pts.length) return;
      const move=(e)=>{ const r=svg.getBoundingClientRect(); if(!r.width) return;
        const cx=(e.clientX!=null)?e.clientX:(e.touches&&e.touches[0]?e.touches[0].clientX:null); if(cx==null) return;
        const vbX=(cx-r.left)/r.width*TS_W;
        let best=0,bd=Infinity; for(let i=0;i<pts.length;i++){ const dd=Math.abs(pts[i][0]-vbX); if(dd<bd){ bd=dd; best=i; } }
        const p=pts[best];
        cur.setAttribute('x1',p[0]); cur.setAttribute('x2',p[0]); cur.style.display='';   /* vertical crosshair line (a line never distorts) */
        const wr=wrap.getBoundingClientRect();
        /* (#R35) position the HTML dot + tip at the exact intersection pixel (round dot, no ellipse). */
        const px=(p[0]/TS_W)*r.width + (r.left-wr.left), py=(p[1]/TS_H)*r.height + (r.top-wr.top);
        dot.style.left=px+'px'; dot.style.top=py+'px'; dot.style.display='block';
        tip.textContent=p[2]+' · '+p[3]; tip.style.display='block';
        /* (#R72) clamp inside the chart so edge hovers stay readable ("端の方になると端からは隠れて見えなくなる") */
        const tw=tip.offsetWidth||90, th=tip.offsetHeight||24;
        const cxp=Math.max(tw/2+2, Math.min((wr.width||r.width)-tw/2-2, px));
        tip.style.left=cxp+'px';
        if(py-th*1.18<2){ tip.style.top=(py+10)+'px'; tip.style.transform='translate(-50%,0)'; }
        else { tip.style.top=py+'px'; tip.style.transform='translate(-50%,-118%)'; }
      };
      const leave=()=>{ cur.style.display='none'; dot.style.display='none'; tip.style.display='none'; };
      svg.addEventListener('pointermove',move); svg.addEventListener('pointerdown',move); svg.addEventListener('pointerleave',leave);
    }); }
    async function open(){ const cur=window._cpCurrent||{}; const code=cur.code; if(!code) return;
      const m=ensureModal(); m.style.display='flex';
      m.querySelector('#ts-title').textContent=(window.IntMapLang.t(HOST.lang,"Time-series — ","時系列グラフ — ","Zeitreihe — ","Временной ряд — ","Serie temporal — "))+(cur.name||code);
      m.querySelector('#ts-sub').textContent=window.IntMapLang.t(HOST.lang,"Source: World Bank Open Data","出典: 世界銀行オープンデータ","Quelle: World Bank Open Data","Источник: World Bank Open Data","Fuente: World Bank Open Data");
      const body=m.querySelector('#ts-body'); body.innerHTML=window.IntMapLang.t(HOST.lang,"Loading…","読み込み中…","Wird geladen…","Загрузка…","Cargando…");
      const results=await Promise.all(IND.map(ind=>fetchInd(code,ind.id)));
      const html=IND.map((ind,i)=>chart(results[i],LP.arr(ind.label),ind.fmt)).join('');
      body.innerHTML=html || (window.IntMapLang.t(HOST.lang,"No data available","データがありません","Keine Daten verfügbar","Данные недоступны","No hay datos disponibles"));
      try{ wireCharts(body); }catch(_){}
    }
    return { open };
  })();
};
