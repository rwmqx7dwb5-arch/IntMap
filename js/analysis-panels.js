/* ============================================================================
 *  IntMap · Analysis panels — IntMapModules.{timeSeries,aiResearch,correlate,worldEvents,edu}  (#R166)
 * ----------------------------------------------------------------------------
 *  Panels that analyse the loaded data rather than draw layers: the shared time-series chart,
 *  the AI research brief, the two-layer correlation/scatter plot, the world-events archive and the
 *  geography quiz.
 *
 *  Moved verbatim out of index.html's DOMContentLoaded closure (#R166): each body below is
 *  byte-identical to the block that used to live there, except that closure values which are
 *  REASSIGNED at runtime are read through the live host interface (Architecture.md §3.1):
 *      countryGeo -> HOST.countryGeo
 *      currentLang -> HOST.lang
 *      globalData -> HOST.globalData
 *      toolMode -> HOST.toolMode
 *
 *  Every factory is called at the exact spot its block used to occupy, so execution order is
 *  unchanged. The CSS stays in css/intmap.css; this file adds no <style>.
 * ==========================================================================*/
window.IntMapModules=window.IntMapModules||{};

window.IntMapModules.timeSeries=function(map,HOST){
  window.IntMapTimeSeries=(function(){
    const jp=()=>HOST.lang==='jp';
    function short(v){ const a=Math.abs(v); if(a>=1e12) return (v/1e12).toFixed(2)+'T'; if(a>=1e9) return (v/1e9).toFixed(2)+'B'; if(a>=1e6) return (v/1e6).toFixed(2)+'M'; if(a>=1e3) return (v/1e3).toFixed(1)+'k'; return ''+Math.round(v); }
    const IND=[
      {id:'NY.GDP.MKTP.CD', label:['GDP (US$)','GDP（米ドル）'], fmt:v=>'$'+short(v)},
      {id:'NY.GDP.PCAP.CD', label:['GDP per capita','1人当たりGDP'], fmt:v=>'$'+Math.round(v).toLocaleString()},
      {id:'SP.POP.TOTL', label:['Population','人口'], fmt:v=>short(v)},
      {id:'SP.DYN.LE00.IN', label:['Life expectancy','平均寿命'], fmt:v=>v.toFixed(1)+(jp()?' 歳':' yr')},
      {id:'MS.MIL.XPND.GD.ZS', label:['Military (% GDP)','軍事費（対GDP）'], fmt:v=>v.toFixed(2)+'%'},
      {id:['EN.GHG.CO2.PC.CE.AR5','EN.ATM.CO2E.PC'], label:['CO₂ per capita (t)','1人当たりCO₂ (t)'], fmt:v=>v.toFixed(2)}   /* (#R69) WB retired EN.ATM.CO2E.PC (0 values → "データなし") — successor first, old code as fallback */
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
      if(!series||series.length<2) return '<div style="color:var(--text-muted);font-size:11px;padding:3px 0 9px;">'+label+': '+(jp()?'データなし':'no data')+'</div>';
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
      m.querySelector('#ts-title').textContent=(jp()?'時系列グラフ — ':'Time-series — ')+(cur.name||code);
      m.querySelector('#ts-sub').textContent=jp()?'出典: 世界銀行オープンデータ':'Source: World Bank Open Data';
      const body=m.querySelector('#ts-body'); body.innerHTML=jp()?'読み込み中…':'Loading…';
      const results=await Promise.all(IND.map(ind=>fetchInd(code,ind.id)));
      const html=IND.map((ind,i)=>chart(results[i],jp()?ind.label[1]:ind.label[0],ind.fmt)).join('');
      body.innerHTML=html || (jp()?'データがありません':'No data available');
      try{ wireCharts(body); }catch(_){}
    }
    return { open };
  })();
};

window.IntMapModules.aiResearch=function(map,HOST){
  /* stable closure values (never reassigned) — rebound under their original names so the moved body stays verbatim */
  const aiGate=HOST.aiGate, t=HOST.t, makeDraggable=HOST.makeDraggable, askAI=HOST.askAI, countryStats=HOST.countryStats;
  window.IntMapAIResearch=(function(){
    const jp=()=>HOST.lang==='jp';
    /* (#R39) 4-language helper so the brief panel's own UI follows the app language (DE/RU used to fall to EN). */
    const LL=(en,j,de,ru,es)=>HOST.lang==='jp'?j:HOST.lang==='de'?de:HOST.lang==='ru'?ru:HOST.lang==='es'?(es||en):en;   /* (#R40) +Spanish (falls back to EN when a 5th arg isn't supplied) */
    let panel=null;
    function esc(s){ return String(s==null?'':s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
    /* minimal safe markdown: ## headers, **bold**, bullet lines */
    function md(s){ return esc(s)
      .replace(/^#{1,6}\s*(.+)$/gm,'<h5 style="margin:12px 0 4px;font-size:13px;color:var(--primary-color);">$1</h5>')
      .replace(/\*\*([^*]+)\*\*/g,'<b>$1</b>')
      .replace(/^[-・*]\s+(.+)$/gm,'<div style="padding-left:14px;text-indent:-10px;">• $1</div>')
      .replace(/\n{2,}/g,'<br><br>').replace(/\n/g,'<br>'); }
    function nearbyNews(lngLat,km){ const out=[];
      try{ const R=km||600;
        (HOST.globalData||[]).forEach(it=>{ const a=it&&it.analysis; if(!a||!a.loc) return;
          const dx=(a.loc[0]-lngLat.lng)*111*Math.cos(lngLat.lat*Math.PI/180), dy=(a.loc[1]-lngLat.lat)*111;
          if(Math.sqrt(dx*dx+dy*dy)<=R) out.push(it.title);
        });
      }catch(_){}
      return out.slice(0,8); }
    function ensure(){ if(panel) return panel;
      panel=document.createElement('div'); panel.className='tool-panel'; panel.id='ai-research-panel';
      panel.style.cssText='display:none;position:absolute;top:70px;right:24px;left:auto;bottom:auto;z-index:1600;width:min(380px,calc(100vw - 24px));max-height:min(70vh,640px);overflow-y:auto;';
      (document.getElementById('map-container')||document.body).appendChild(panel);
      return panel; }
    async function open(name,lngLat){
      try{ if(typeof aiGate==='function'&&!aiGate()) return; }catch(_){}
      const p=ensure();
      p.style.display='block';
      p.innerHTML='<div class="tp-header" style="cursor:move;"><span class="tp-title">'+LL('Research: ','調査: ','Recherche: ','Исследование: ')+esc(name)+'</span><button class="tp-close" title="'+t('close')+'">✕</button></div>'+
        '<div id="air-body" style="font-size:12.5px;line-height:1.65;color:var(--text-main);padding:4px 2px;"><span style="color:var(--text-muted);">'+LL('Researching… (background, history, economy, military, recent developments)','調査中… (AIが背景・歴史・経済・軍事・最近の動向を整理しています)','Recherche… (Hintergrund, Geschichte, Wirtschaft, Militär, jüngste Entwicklungen)','Анализ… (история, экономика, военная и стратегическая значимость, последние события)')+'</span></div>'+
        '<button id="air-again" class="ai-test-btn" style="width:100%;display:none;">↻ '+LL('Regenerate','再生成','Neu generieren','Сгенерировать заново')+'</button>';
      p.querySelector('.tp-close').onclick=()=>{ p.style.display='none'; };
      try{ makeDraggable(p,p.querySelector('.tp-header')); }catch(_){}
      const body=p.querySelector('#air-body');
      const news=lngLat?nearbyNews(lngLat):[];
      /* (#R21) Sharper brief: today's date is injected, every claim should carry a concrete year/
         date/figure, and "Recent developments" must prioritise the newest events the model knows +
         the supplied nearby headlines ("できるだけ日付などを記載する等具体的に。最新の動向を意識"). */
      const today=new Date().toISOString().slice(0,10);
      const sys=(jp()
        ?('あなたは地政学・地域研究のリサーチアシスタントです。本日は'+today+'です。事実に忠実に、簡潔な日本語で答えてください。可能な限り具体的な年・日付・数値（人口、GDP、兵力、距離など）を文中に入れてください。不確かな点は「未確認」と明記してください。')
        :('You are a geopolitical and area-studies research assistant. Today is '+today+'. Be factual and concise; include concrete years, dates and figures (population, GDP, troop counts, distances) wherever possible; clearly flag anything uncertain.'))+window._aiLangLine();
      const prompt=(jp()
        ?('場所「'+name+'」'+(lngLat?('（座標: '+lngLat.lat.toFixed(2)+', '+lngLat.lng.toFixed(2)+'）'):'')+'について、以下の構成で簡潔なインテリジェンス・ブリーフを書いてください。\n## 概要・背景\n## 歴史（重要な出来事は年号つきで）\n## 経済（最新の数値・年を明記）\n## 軍事・戦略的意義\n## 最近の動向（直近1〜2年を最優先。出来事には日付や時期を明記）\n各セクション2〜4文。曖昧な一般論より、固有名詞・日付・数値を優先してください。')
        :('Write a concise intelligence brief on "'+name+'"'+(lngLat?(' (around '+lngLat.lat.toFixed(2)+', '+lngLat.lng.toFixed(2)+')'):'')+' with the sections:\n## Background\n## History (date the key events)\n## Economy (state the latest figures with their year)\n## Military & strategic significance\n## Recent developments (prioritise the last 1–2 years; date each event)\n2–4 sentences per section. Prefer named entities, dates and numbers over generalities.'))
        +(news.length?('\n\n'+(jp()?'参考: 周辺の最近のニュース見出し（「最近の動向」に反映すること）:\n':'Recent nearby news headlines — reflect these in "Recent developments":\n')+news.map(s=>'- '+s).join('\n')):'');
      /* (#R22) The brief runs FIRST; the suggested-questions block is appended only AFTER it finishes
         ("Suggested questions は AI brief が終わってから最後に表示") — it used to render immediately. */
      try{
        const out=await askAI(prompt,sys);
        body.innerHTML=md(out||'')+'<div style="margin-top:10px;font-size:10px;color:var(--text-muted);">'+LL('AI-generated — verify with primary sources for important decisions.','AI生成 — 重要な判断には一次情報の確認を。','KI-generiert — bei wichtigen Entscheidungen mit Primärquellen prüfen.','Сгенерировано ИИ — для важных решений проверяйте по первоисточникам.')+'</div>';
      }catch(e){ body.innerHTML='<span style="color:#ff453a;">'+esc(e&&e.message||'AI error')+'</span>'; }
      const again=p.querySelector('#air-again'); again.style.display='block'; again.onclick=()=>open(name,lngLat);
      /* (#R21 beta) SUGGESTED QUESTIONS — auto-generated from the countries in the current viewport
         ("AIに聞く質問を、現在表示中の領域に基づいて自動生成") + a free-question box. Shown last. */
      try{
        let sug=p.querySelector('#air-sugg'); if(sug) sug.remove();
        sug=document.createElement('div'); sug.id='air-sugg'; sug.style.cssText='margin-top:10px;border-top:1px solid rgba(128,128,128,0.2);padding-top:8px;';
        const qs=suggestQs(name);
        sug.innerHTML='<div style="font-size:10.5px;color:var(--text-muted);margin-bottom:4px;">'+LL('Suggested questions','おすすめの質問','Vorgeschlagene Fragen','Предлагаемые вопросы')+'</div>'+
          qs.map((s,i)=>'<button class="ai-test-btn air-q" data-i="'+i+'" style="width:100%;text-align:left;margin:3px 0;font-size:11.5px;">'+esc(s)+'</button>').join('')+
          '<div id="air-chat" style="display:flex;flex-direction:column;gap:8px;margin-top:10px;"></div>'+
          '<div class="air-inbar" style="display:flex;gap:8px;align-items:center;margin-top:8px;position:sticky;bottom:0;background:var(--popup-bg);padding:8px 0 4px;"><input class="air-free" type="text" placeholder="'+LL('Ask a follow-up…','続けて質問…','Nachfrage stellen…','Задать уточняющий вопрос…','Haz una pregunta de seguimiento…')+'" style="flex:1;min-width:0;height:38px;padding:0 14px;border-radius:19px;border:1px solid var(--glass-border,rgba(128,128,128,0.28));background:var(--input-bg);color:var(--text-main);font-size:12.5px;outline:none;box-sizing:border-box;"><button class="air-go" title="'+LL("Send","送信","Senden","Отправить","Enviar")+'" style="flex:0 0 auto;width:38px;height:38px;border-radius:50%;border:none;background:var(--primary-color);color:#fff;font-size:18px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V6M6 12l6-6 6 6"/></svg></button></div>';
        p.appendChild(sug);
        /* (#R31) CHAT-style thread — the user's message stays visible as a bubble after the AI replies
           ("主要なAIチャットアプリのようなUIに"), and the conversation accumulates with context continuity. */
        const chat=sug.querySelector('#air-chat'); const convo=[];
        const bubble=(who,html)=>{ const d=document.createElement('div'); d.style.cssText=(who==='user'
          ?'align-self:flex-end;max-width:88%;background:var(--primary-color);color:#fff;border-radius:14px 14px 5px 14px;'
          :'align-self:flex-start;max-width:93%;background:var(--input-bg);color:var(--text-main);border-radius:14px 14px 14px 5px;')+'padding:8px 11px;font-size:12.5px;line-height:1.55;word-break:break-word;'; d.innerHTML=html; chat.appendChild(d); try{ p.scrollTop=p.scrollHeight; }catch(_){} return d; };
        const ask=async(qq)=>{
          bubble('user',esc(qq));
          const ai=bubble('ai','<span style="color:var(--text-muted);">'+LL('Thinking…','回答中…','Denke nach…','Думаю…')+'</span>');
          convo.push('User: '+qq);
          try{ const ctx=(news.length?('\n\n'+(jp()?'参考: 周辺の最近のニュース見出し:\n':'Context — recent nearby headlines:\n')+news.map(s=>'- '+s).join('\n')):'')+(convo.length>1?('\n\n'+(jp()?'これまでの会話:\n':'Conversation so far:\n')+convo.slice(-6).join('\n')):'');
            const out2=await askAI(qq+ctx,sys);
            ai.innerHTML=md(out2||''); convo.push('Assistant: '+String(out2||'').slice(0,600));
          }catch(e2){ ai.innerHTML='<span style="color:#ff453a;">'+esc(e2&&e2.message||'AI error')+'</span>'; }
          try{ p.scrollTop=p.scrollHeight; }catch(_){}
        };
        sug.querySelectorAll('.air-q').forEach(b2=>b2.onclick=()=>ask(qs[+b2.getAttribute('data-i')]));
        const fr=sug.querySelector('.air-free'), go=sug.querySelector('.air-go');
        const fire=()=>{ const v=fr.value.trim(); if(v){ ask(v); fr.value=''; } };
        if(go) go.onclick=fire; if(fr) fr.addEventListener('keydown',e2=>{ if(e2.key==='Enter'){ e2.preventDefault(); fire(); } });
      }catch(_){}
    }
    /* questions templated from the most populous countries inside the current viewport */
    function suggestQs(name){
      let inView=[];
      try{ const b=map.getBounds();
        inView=Object.values(countryStats||{}).filter(s=>s&&s.latlng&&s.latlng[0]>b.getSouth()&&s.latlng[0]<b.getNorth()&&s.latlng[1]>b.getWest()&&s.latlng[1]<b.getEast());
        inView.sort((a,b2)=>(b2.pop||0)-(a.pop||0));
      }catch(_){}
      const nm=(s)=>{ const L=HOST.lang; if(L==='jp') return s.nameJp||s.nameEn; if(L==='de') return s.nameDe||s.nameEn; if(L==='ru') return s.nameRu||s.nameEn; return s.nameEn; };
      const out=[]; const L=HOST.lang; const A=inView[0]&&nm(inView[0]), B=inView[1]&&nm(inView[1]); const pair=inView[0]&&inView[1]&&inView[0]!==inView[1];
      if(L==='jp'){
        out.push(name+'の地政学的重要性を、直近の動向を踏まえて教えて');
        if(pair) out.push(A+'と'+B+'の現在の関係と主要な懸案は？');
        if(inView[0]) out.push(A+'の経済の強みと弱みを最新の数値で教えて');
        out.push(name+'周辺で今後12か月に注視すべきリスクは？');
      } else if(L==='de'){
        out.push('Warum ist '+name+' geopolitisch bedeutsam – angesichts der jüngsten Entwicklungen?');
        if(pair) out.push('Wie ist der aktuelle Stand der Beziehungen zwischen '+A+' und '+B+', und was sind die wichtigsten Konfliktpunkte?');
        if(inView[0]) out.push('Was sind '+A+'s wirtschaftliche Stärken und Schwächen, mit den neuesten Zahlen?');
        out.push('Welche Risiken rund um '+name+' sollte man in den nächsten 12 Monaten beobachten?');
      } else if(L==='ru'){
        out.push('Почему '+name+' важен геополитически, учитывая последние события?');
        if(pair) out.push('Каково текущее состояние отношений '+A+'–'+B+' и каковы основные точки трения?');
        if(inView[0]) out.push('Каковы экономические сильные и слабые стороны '+A+' по последним данным?');
        out.push('Какие риски вокруг '+name+' стоит отслеживать в ближайшие 12 месяцев?');
      } else {
        out.push('Why does '+name+' matter geopolitically, given recent developments?');
        if(pair) out.push('What is the current state of '+A+'–'+B+' relations, and the main friction points?');
        if(inView[0]) out.push('What are '+A+'’s economic strengths and weaknesses, with the latest figures?');
        out.push('What risks around '+name+' should be watched over the next 12 months?');
      }
      return out.slice(0,4);
    }
    /* ===== (#R39) "Ask AI about here" — click ANY map point and ask a free-form question. The coordinates
       are sent automatically, so questions like "why is population low only here?" / "why is this border
       curved?" / "why is this city important?" work without naming the place. Reuses this panel + chat. ===== */
    async function askHere(lngLat){
      try{ if(typeof aiGate==='function'&&!aiGate()) return; }catch(_){}
      const p=ensure(); p.style.display='block';
      const coordStr=lngLat.lat.toFixed(3)+', '+lngLat.lng.toFixed(3);
      const title=LL('Ask AI about here','ここをAIに聞く','KI zu diesem Ort fragen','Спросить ИИ об этом месте');
      const examples=LL(
        ['Why is this area so sparsely populated?','Why is the border here shaped this way?','Why is this place strategically important?'],
        ['なぜこの辺りは人口が少ないの？','この国境はなぜこの形なの？','この場所が重要な理由は？'],
        ['Warum ist dieses Gebiet so dünn besiedelt?','Warum verläuft die Grenze hier so?','Warum ist dieser Ort strategisch wichtig?'],
        ['Почему здесь так мало населения?','Почему граница здесь такой формы?','Почему это место важно?']);
      p.innerHTML='<div class="tp-header" style="cursor:move;"><span class="tp-title">'+esc(title)+'</span><button class="tp-close" title="'+t('close')+'">✕</button></div>'+
        '<div style="font-size:11px;color:var(--text-muted);margin:0 2px 8px;">📍 '+coordStr+'</div>'+
        '<div id="air-chat" style="display:flex;flex-direction:column;gap:8px;"></div>'+
        '<div style="font-size:10.5px;color:var(--text-muted);margin:10px 2px 4px;border-top:1px solid rgba(128,128,128,0.18);padding-top:8px;">'+LL('Try asking','質問の例','Beispiele','Примеры вопросов')+'</div>'+
        examples.map(e=>'<button class="ai-test-btn air-q" style="width:100%;text-align:left;margin:3px 0;font-size:11.5px;">'+esc(e)+'</button>').join('')+
        '<div class="air-inbar" style="display:flex;gap:8px;align-items:center;margin-top:8px;position:sticky;bottom:0;background:var(--popup-bg);padding:8px 0 4px;"><input class="air-free" type="text" placeholder="'+LL('Ask anything about this spot…','この地点について質問…','Frage zu diesem Ort…','Спросите об этом месте…','Pregunta lo que sea sobre este lugar…')+'" style="flex:1;min-width:0;height:38px;padding:0 14px;border-radius:19px;border:1px solid var(--glass-border,rgba(128,128,128,0.28));background:var(--input-bg);color:var(--text-main);font-size:12.5px;outline:none;box-sizing:border-box;"><button class="air-go" title="'+LL("Send","送信","Senden","Отправить","Enviar")+'" style="flex:0 0 auto;width:38px;height:38px;border-radius:50%;border:none;background:var(--primary-color);color:#fff;font-size:18px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V6M6 12l6-6 6 6"/></svg></button></div>';
      p.querySelector('.tp-close').onclick=()=>{ p.style.display='none'; };
      try{ makeDraggable(p,p.querySelector('.tp-header')); }catch(_){}
      const chat=p.querySelector('#air-chat'); const convo=[]; const news=nearbyNews(lngLat); const today=new Date().toISOString().slice(0,10);
      const sys='You are a world-geography, history and geopolitics expert. The user is asking about a SPECIFIC point on the map at latitude '+lngLat.lat.toFixed(4)+', longitude '+lngLat.lng.toFixed(4)+'. Today is '+today+'. First work out what is at or near that exact location (country, region, city, terrain, sea), then answer concisely and factually with concrete facts, figures and dates. If the point is ocean or uninhabited, say so plainly. Flag anything uncertain.'+window._aiLangLine();
      const bubble=(who,html)=>{ const d=document.createElement('div'); d.style.cssText=(who==='user'?'align-self:flex-end;max-width:88%;background:var(--primary-color);color:#fff;border-radius:14px 14px 5px 14px;':'align-self:flex-start;max-width:93%;background:var(--input-bg);color:var(--text-main);border-radius:14px 14px 14px 5px;')+'padding:8px 11px;font-size:12.5px;line-height:1.55;word-break:break-word;'; d.innerHTML=html; chat.appendChild(d); try{ p.scrollTop=p.scrollHeight; }catch(_){} return d; };
      const ask=async(qq)=>{ bubble('user',esc(qq));
        const ai=bubble('ai','<span style="color:var(--text-muted);">'+LL('Thinking…','回答中…','Denke nach…','Думаю…')+'</span>'); convo.push('User: '+qq);
        try{ const ctx='\n\nMap point: '+lngLat.lat.toFixed(4)+', '+lngLat.lng.toFixed(4)+(news.length?('\nNearby recent headlines:\n'+news.map(s=>'- '+s).join('\n')):'')+(convo.length>1?('\n\nConversation so far:\n'+convo.slice(-6).join('\n')):'');
          const out=await askAI(qq+ctx,sys); ai.innerHTML=md(out||''); convo.push('Assistant: '+String(out||'').slice(0,600));
        }catch(e){ ai.innerHTML='<span style="color:#ff453a;">'+esc(e&&e.message||'AI error')+'</span>'; }
        try{ p.scrollTop=p.scrollHeight; }catch(_){} };
      p.querySelectorAll('.air-q').forEach(b=>b.onclick=()=>ask(b.textContent.trim()));
      const fr=p.querySelector('.air-free'), go=p.querySelector('.air-go');
      const fire=()=>{ const v=fr.value.trim(); if(v){ ask(v); fr.value=''; } };
      if(go) go.onclick=fire; if(fr) fr.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); fire(); } });
    }
    return { open, askHere };
  })();
};

window.IntMapModules.correlate=function(map,HOST){
  /* stable closure values (never reassigned) — rebound under their original names so the moved body stays verbatim */
  const countryStats=HOST.countryStats, t=HOST.t, loadCountryData=HOST.loadCountryData, addCountryLayers=HOST.addCountryLayers;
  (function(){
    if(typeof countryStats==='undefined') return;
    const L=()=>HOST.lang;
    const tr=(en,jp,de,ru,es)=>L()==='jp'?jp:L()==='de'?de:L()==='ru'?ru:L()==='es'?(es||en):en;
    function compact(v){ v=+v; const a=Math.abs(v); if(a>=1e12)return (v/1e12).toFixed(1)+'T'; if(a>=1e9)return (v/1e9).toFixed(1)+'B'; if(a>=1e6)return (v/1e6).toFixed(1)+'M'; if(a>=1e3)return (v/1e3).toFixed(1)+'k'; return ''+Math.round(v); }
    const METRICS=[
      {id:'pop',      get:s=>s.pop,      log:true,  fmt:v=>compact(v),       lbl:['Population','人口','Bevölkerung','Население','Población']},
      {id:'density',  get:s=>s.density,  log:true,  fmt:v=>Math.round(v).toLocaleString()+' /km²', lbl:['Pop. density','人口密度','Bevölkerungsdichte','Плотность нас.','Densidad de pob.']},
      {id:'area',     get:s=>s.area,     log:true,  fmt:v=>compact(v)+' km²', lbl:['Area','面積','Fläche','Площадь','Superficie']},
      {id:'gdp',      get:s=>s.gdp,      log:true,  fmt:v=>'$'+compact(v*1e9), lbl:['GDP (nominal)','GDP(名目)','BIP (nominal)','ВВП (номинал)','PIB (nominal)']},   /* s.gdp is in $B → ×1e9 for the T/B label */
      {id:'gdppc',    get:s=>s.gdppc,    log:true,  fmt:v=>'$'+compact(v),   lbl:['GDP per capita','1人当たりGDP','BIP pro Kopf','ВВП на душу','PIB per cápita']},
      {id:'gdppcPPP', get:s=>s.gdppcPPP, log:true,  fmt:v=>'$'+compact(v),   lbl:['GDP/capita (PPP)','1人当たりGDP(PPP)','BIP pro Kopf (KKP)','ВВП на душу (ППС)','PIB per cápita (PPA)']},
      {id:'hdi',      get:s=>s.hdi,      log:false, fmt:v=>v.toFixed(3),     lbl:['HDI','HDI','HDI','ИЧР','IDH']},
      {id:'dem',      get:s=>s.dem,      log:false, fmt:v=>v.toFixed(2),     lbl:['Democracy Index','民主主義指数','Demokratieindex','Индекс демократии','Índice de democracia']},
      {id:'milSpend', get:s=>s.milSpend, log:true,  fmt:v=>'$'+v+'B',        lbl:['Mil. spending','国防費','Militärausgaben','Военные расходы','Gasto militar']},
      {id:'milGDP',   get:s=>(s.milSpend!=null&&s.gdp)?s.milSpend/s.gdp*100:null, log:false, fmt:v=>v.toFixed(2)+'%', lbl:['Mil. spend (% GDP)','国防費(対GDP%)','Militärausg. (% BIP)','Воен. расходы (% ВВП)','Gasto mil. (% PIB)']},
      {id:'tfr',      get:s=>s.tfr,      log:false, fmt:v=>v.toFixed(2),     lbl:['Fertility rate','合計特殊出生率','Geburtenrate','Рождаемость','Tasa de fecundidad']},
      {id:'lifeExp',  get:s=>s.lifeExp,  log:false, fmt:v=>v.toFixed(1)+' yr', lbl:['Life expectancy','平均寿命','Lebenserwartung','Прод. жизни','Esperanza de vida']},
      {id:'internet', get:s=>s.internet, log:false, fmt:v=>v+'%',            lbl:['Internet users','ネット利用率','Internetnutzer','Интернет-польз.','Usuarios de Internet']},
      {id:'gdpPPP',   get:s=>s.gdpPPP,   log:true,  fmt:v=>'$'+compact(v*1e9), lbl:['GDP (PPP)','GDP(PPP)','BIP (KKP)','ВВП (ППС)','PIB (PPA)']}
    ];
    /* (#R40) World-Bank-backed axes — greatly expands the metric list ("対応する項目を大幅に増やして").
       Loaded on demand (cached) via window.IntMapWB; get(s,code) reads the latest value for that ISO3. */
    let WBV={};
    [['EN.GHG.CO2.PC.CE.AR5',false,v=>v.toFixed(1)+' t',['CO₂ per capita','1人当たりCO₂排出','CO₂ pro Kopf','CO₂ на душу','CO₂ per cápita']],
     ['SP.URB.TOTL.IN.ZS',false,v=>Math.round(v)+'%',['Urban population %','都市人口率','Stadtbevölkerung %','Городское нас. %','Población urbana %']],
     ['EG.ELC.ACCS.ZS',false,v=>Math.round(v)+'%',['Electricity access %','電力アクセス率','Stromzugang %','Доступ к электр. %','Acceso a electricidad %']],
     ['SH.XPD.CHEX.GD.ZS',false,v=>v.toFixed(1)+'%',['Health spend %GDP','医療支出 対GDP','Gesundheitsausg. %BIP','Расходы на здрав. %ВВП','Gasto en salud %PIB']],
     ['AG.LND.FRST.ZS',false,v=>Math.round(v)+'%',['Forest area %','森林面積率','Waldfläche %','Лесная площадь %','Superficie forestal %']],
     ['EG.FEC.RNEW.ZS',false,v=>Math.round(v)+'%',['Renewable energy %','再エネ比率','Erneuerbare Energie %','Возобн. энергия %','Energía renovable %']],
     ['IT.CEL.SETS.P2',false,v=>Math.round(v),['Mobile subs /100','携帯契約 /100人','Mobilfunk /100','Моб. связь /100','Móviles /100']],
     ['FP.CPI.TOTL.ZG',false,v=>v.toFixed(1)+'%',['Inflation % (CPI)','インフレ率','Inflation % (VPI)','Инфляция % (ИПЦ)','Inflación % (IPC)']],
     ['SE.ADT.LITR.ZS',false,v=>Math.round(v)+'%',['Literacy rate %','識字率','Alphabetisierung %','Грамотность %','Alfabetización %']],
     ['SI.POV.GINI',false,v=>v.toFixed(1),['Income inequality (Gini)','所得格差(ジニ)','Ungleichheit (Gini)','Неравенство (Джини)','Desigualdad (Gini)']],
     ['NE.TRD.GNFS.ZS',true,v=>Math.round(v)+'%',['Trade % of GDP','貿易 対GDP','Handel % BIP','Торговля % ВВП','Comercio % PIB']],
     ['SL.UEM.TOTL.ZS',false,v=>v.toFixed(1)+'%',['Unemployment %','失業率','Arbeitslosigkeit %','Безработица %','Desempleo %']],
     ['GC.DOD.TOTL.GD.ZS',false,v=>Math.round(v)+'%',['Govt debt % GDP','政府債務 対GDP','Staatsschulden % BIP','Госдолг % ВВП','Deuda púb. % PIB']],
     ['SH.DYN.MORT',true,v=>Math.round(v),['Under-5 mortality /1k','5歳未満死亡率','Kindersterblichkeit /1k','Смертн. до 5 лет /1k','Mortalidad <5 /1k']],
     ['EG.USE.ELEC.KH.PC',true,v=>compact(v)+' kWh',['Electricity use /capita','電力消費 /人','Stromverbrauch /Kopf','Потр. электр. /чел','Consumo eléctrico /cápita']],
     ['BX.KLT.DINV.WD.GD.ZS',false,v=>v.toFixed(1)+'%',['FDI inflow % GDP','対内直接投資 %','ADI-Zufluss % BIP','ПИИ % ВВП','IED entrante % PIB']],
     ['NV.IND.MANF.ZS',false,v=>v.toFixed(1)+'%',['Manufacturing % GDP','製造業 対GDP','Verarb. Gewerbe % BIP','Промышл. % ВВП','Manufactura % PIB']],
     ['SE.SEC.ENRR',false,v=>Math.round(v)+'%',['Secondary enrollment %','中等教育就学率','Sekundarschulrate %','Среднее образ. %','Matrícula secundaria %']],
     ['SH.MED.PHYS.ZS',false,v=>v.toFixed(2),['Physicians /1k','医師 /1k人','Ärzte /1k','Врачи /1k','Médicos /1k']],
     /* (#R41) greatly expanded set ("対応する項目を大幅に増やして") — all live, latest-value World Bank, full 5-lang */
     ['SP.POP.GROW',false,v=>v.toFixed(1)+'%',['Population growth %','人口増加率','Bevölkerungswachstum %','Рост населения %','Crecimiento pob. %']],
     ['SP.RUR.TOTL.ZS',false,v=>Math.round(v)+'%',['Rural population %','農村人口率','Landbevölkerung %','Сельское нас. %','Población rural %']],
     ['NY.GNP.PCAP.CD',true,v=>'$'+compact(v),['GNI per capita','1人当たりGNI','BNE pro Kopf','ВНД на душу','INB per cápita']],
     ['AG.LND.AGRI.ZS',false,v=>Math.round(v)+'%',['Agricultural land %','農地率','Landw. Fläche %','С/х земли %','Tierra agrícola %']],
     ['EN.ATM.PM25.MC.M3',false,v=>v.toFixed(1)+' µg/m³',['PM2.5 air pollution','PM2.5大気汚染','PM2.5-Belastung','PM2.5 загрязн.','Contaminación PM2.5']],
     ['VC.IHR.PSRC.P5',true,v=>v.toFixed(1),['Homicide rate /100k','殺人率 /10万','Tötungsrate /100k','Убийства /100k','Homicidios /100k']],
     ['SE.XPD.TOTL.GD.ZS',false,v=>v.toFixed(1)+'%',['Education spend %GDP','教育支出 対GDP','Bildungsausg. %BIP','Расходы на образ. %ВВП','Gasto educación %PIB']],
     ['SH.H2O.BASW.ZS',false,v=>Math.round(v)+'%',['Basic water access %','基本的飲料水 %','Wasserzugang %','Доступ к воде %','Acceso a agua %']],
     ['SH.STA.BASS.ZS',false,v=>Math.round(v)+'%',['Basic sanitation %','基本的衛生 %','Sanitärzugang %','Санитария %','Saneamiento %']],
     ['GB.XPD.RSDV.GD.ZS',false,v=>v.toFixed(2)+'%',['R&D spend %GDP','研究開発費 対GDP','F&E-Ausgaben %BIP','НИОКР %ВВП','Gasto I+D %PIB']],
     ['SL.TLF.CACT.FE.ZS',false,v=>Math.round(v)+'%',['Female labor force %','女性労働参加率','Frauenerwerbsquote %','Жен. занятость %','Mujeres en fuerza lab. %']],
     ['ST.INT.ARVL',true,v=>compact(v),['Tourist arrivals','外国人観光客数','Touristenankünfte','Турист. прибытия','Llegadas turísticas']],
     ['TX.VAL.TECH.MF.ZS',false,v=>v.toFixed(1)+'%',['High-tech exports %','ハイテク輸出 %','Hightech-Exporte %','Высокотех. экспорт %','Exp. alta tecnología %']],
     ['MS.MIL.TOTL.P1',true,v=>compact(v),['Armed forces','軍人数','Streitkräfte','Военнослужащие','Fuerzas armadas']],
     ['SH.DYN.AIDS.ZS',false,v=>v.toFixed(1)+'%',['HIV prevalence %','HIV有病率','HIV-Prävalenz %','Распр. ВИЧ %','Prevalencia VIH %']],
     ['NY.GDP.MKTP.KD.ZG',false,v=>v.toFixed(1)+'%',['GDP growth %','GDP成長率','BIP-Wachstum %','Рост ВВП %','Crecimiento PIB %']],
     ['SH.XPD.OOPC.CH.ZS',false,v=>v.toFixed(1)+'%',['Out-of-pocket health %','自己負担医療費 %','Selbstzahlerquote %','Личные расходы %','Gasto de bolsillo %']],
     ['AG.LND.ARBL.ZS',false,v=>v.toFixed(1)+'%',['Arable land %','耕地率','Ackerland %','Пашня %','Tierra cultivable %']]
    ].forEach(arr=>{ const code=arr[0]; METRICS.push({id:'wb:'+code,wb:code,log:arr[1],fmt:arr[2],lbl:arr[3],get:(s,c)=>{ const m=WBV[code]; return (m&&c&&m[c])?m[c].v:null; }}); });
    function ensureWB(){ try{ const need=[xId,yId].map(id=>METRICS.find(m=>m.id===id)).filter(m=>m&&m.wb&&!WBV[m.wb]);
      if(!need.length||!window.IntMapWB||!window.IntMapWB.fetch) return Promise.resolve();
      return Promise.all(need.map(m=>window.IntMapWB.fetch(m.wb).then(d=>{ WBV[m.wb]=d||{}; }).catch(()=>{ WBV[m.wb]={}; }))); }catch(_){ return Promise.resolve(); } }
    function reRender(){ if(!ov) return; try{ const need=[xId,yId].map(id=>METRICS.find(m=>m.id===id)).some(m=>m&&m.wb&&!WBV[m.wb]); if(need){ const w=ov.querySelector('.corr-svg-wrap'); if(w) w.innerHTML='<div style="padding:46px;text-align:center;color:var(--text-muted);">'+t('loadingData')+'</div>'; } }catch(_){} ensureWB().then(render); }
    const ml=m=>{ const i=L()==='jp'?1:L()==='de'?2:L()==='ru'?3:L()==='es'?4:0; return m.lbl[i]||m.lbl[0]; };
    function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
    function pear(xs,ys){ const n=xs.length; if(n<3)return null; let sx=0,sy=0,sxx=0,syy=0,sxy=0; for(let i=0;i<n;i++){const x=xs[i],y=ys[i]; sx+=x;sy+=y;sxx+=x*x;syy+=y*y;sxy+=x*y;} const dx=n*sxx-sx*sx,dy=n*syy-sy*sy; if(dx<=0||dy<=0)return null; return (n*sxy-sx*sy)/Math.sqrt(dx*dy); }
    function ranks(a){ const idx=a.map((v,i)=>[v,i]).sort((p,q)=>p[0]-q[0]); const r=new Array(a.length); let i=0; while(i<idx.length){ let j=i; while(j+1<idx.length&&idx[j+1][0]===idx[i][0])j++; const avg=(i+j)/2+1; for(let k=i;k<=j;k++)r[idx[k][1]]=avg; i=j+1; } return r; }
    function lsq(xs,ys){ const n=xs.length; let sx=0,sy=0,sxx=0,sxy=0; for(let i=0;i<n;i++){sx+=xs[i];sy+=ys[i];sxx+=xs[i]*xs[i];sxy+=xs[i]*ys[i];} const m=(n*sxy-sx*sy)/((n*sxx-sx*sx)||1); return {m,b:(sy-m*sx)/n}; }
    let xId='gdppc', yId='lifeExp', ov=null, _lastFit=null;
    function inject(){ if(document.getElementById('corr-style'))return; const st=document.createElement('style'); st.id='corr-style';
      st.textContent='#corr-overlay{display:none;position:fixed;inset:0;z-index:9998;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,0.18);}'
        +'#corr-overlay.show{display:flex;}'
        +'.corr-card{position:relative;background:var(--popup-bg);border:1px solid var(--glass-border,rgba(128,128,128,0.18));border-radius:20px;box-shadow:var(--shadow);width:min(620px,96vw);max-height:92vh;overflow:auto;padding:18px 20px 20px;backdrop-filter:saturate(180%) blur(22px);-webkit-backdrop-filter:saturate(180%) blur(22px);}'
        +'.corr-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px;cursor:grab;touch-action:none;}'
        +'.corr-head:active{cursor:grabbing;}'
        +'.corr-head h3{margin:0;font-size:17px;}'
        +'.corr-x{background:transparent;border:none;color:var(--text-muted);font-size:25px;line-height:1;cursor:pointer;padding:2px 6px;}'
        +'.corr-pick{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:8px;}'
        +'.corr-pick label{flex:1 1 0;min-width:150px;font-size:11.5px;color:var(--text-muted);}'
        +'.corr-pick select{width:100%;margin-top:3px;padding:8px 9px;border-radius:9px;border:1px solid var(--glass-border,rgba(128,128,128,0.25));background:var(--input-bg);color:var(--text-main);font-size:13px;}'
        +'.corr-r{display:flex;gap:18px;flex-wrap:wrap;align-items:baseline;margin:10px 2px 4px;}'
        +'.corr-r .lab{font-size:11px;color:var(--text-muted);}'
        +'.corr-r b{font-size:22px;display:block;}'
        +'.corr-dot{fill:var(--primary-color);fill-opacity:0.62;}'
        +'.corr-note{font-size:11px;color:var(--text-muted);margin-top:8px;line-height:1.5;}';
      document.head.appendChild(st); }
    function ensure(){ if(ov)return ov; inject(); ov=document.createElement('div'); ov.id='corr-overlay';
      ov.innerHTML='<div class="corr-card" role="dialog" aria-modal="true"><div class="corr-head"><h3></h3><button class="corr-x" aria-label="Close">×</button></div>'
        +'<div class="corr-pick"><label class="lx"><span></span><select class="corr-sel-x"></select></label><label class="ly"><span></span><select class="corr-sel-y"></select></label></div>'
        +'<div class="corr-svg-wrap"></div><div class="corr-r"></div><div class="corr-note"></div></div>';
      document.body.appendChild(ov);
      ov.addEventListener('click',e=>{ if(e.target===ov) hide(); });
      ov.querySelector('.corr-x').onclick=hide;
      /* (#R41) drag the card by its header so the user can shove it aside and watch the map — combined with the
         now-translucent backdrop this answers "機能使ってたら地図が見れない". */
      (function(){ const card=ov.querySelector('.corr-card'), head=ov.querySelector('.corr-head'); let dx=0,dy=0,ox=0,oy=0,drag=false;
        const dn=e=>{ if(e.target.closest('.corr-x'))return; drag=true; const p=e.touches?e.touches[0]:e; ox=p.clientX-dx; oy=p.clientY-dy; e.preventDefault(); };
        const mv=e=>{ if(!drag)return; const p=e.touches?e.touches[0]:e; dx=p.clientX-ox; dy=p.clientY-oy; card.style.transform='translate('+dx+'px,'+dy+'px)'; };
        const up=()=>{ drag=false; };
        head.addEventListener('mousedown',dn); head.addEventListener('touchstart',dn,{passive:false});
        window.addEventListener('mousemove',mv); window.addEventListener('touchmove',mv,{passive:false});
        window.addEventListener('mouseup',up); window.addEventListener('touchend',up);
      })();
      const sx=ov.querySelector('.corr-sel-x'), sy=ov.querySelector('.corr-sel-y');
      METRICS.forEach(m=>{ const o=document.createElement('option'); o.value=m.id; o.textContent=ml(m); sx.appendChild(o); sy.appendChild(o.cloneNode(true)); });
      sx.value=xId; sy.value=yId;
      sx.onchange=()=>{ xId=sx.value; reRender(); }; sy.onchange=()=>{ yId=sy.value; reRender(); };
      return ov; }
    function hide(){ if(ov) ov.classList.remove('show'); }
    function pairs(mx,my){ const out=[]; for(const c in countryStats){ const s=countryStats[c]; if(!s)continue; let x=mx.get(s,c),y=my.get(s,c); if(x==null||y==null||!isFinite(x)||!isFinite(y))continue; if(mx.log&&x<=0)continue; if(my.log&&y<=0)continue; out.push({c,nm:(L()==='jp'?(s.nameJp||s.nameEn):s.nameEn)||c,x:+x,y:+y}); } return out; }
    function render(){ if(!ov)return; const mx=METRICS.find(m=>m.id===xId), my=METRICS.find(m=>m.id===yId);
      ov.querySelector('.corr-head h3').textContent=tr('Correlation','相関分析','Korrelation','Корреляция');
      ov.querySelector('.lx span').textContent=tr('X axis','横軸 (X)','X-Achse','Ось X');
      ov.querySelector('.ly span').textContent=tr('Y axis','縦軸 (Y)','Y-Achse','Ось Y');
      const ps=pairs(mx,my), wrap=ov.querySelector('.corr-svg-wrap'), rEl=ov.querySelector('.corr-r'), nEl=ov.querySelector('.corr-note');
      if(ps.length<3){ wrap.innerHTML=''; rEl.innerHTML=''; nEl.textContent=tr('Not enough countries have both values.','両方の値を持つ国が不足しています。','Zu wenige Länder haben beide Werte.','Недостаточно стран с обоими значениями.'); return; }
      const tx=ps.map(p=>mx.log?Math.log10(p.x):p.x), ty=ps.map(p=>my.log?Math.log10(p.y):p.y);
      const r=pear(tx,ty), rho=pear(ranks(ps.map(p=>p.x)),ranks(ps.map(p=>p.y)));
      const W=560,H=360,pl=54,prr=16,ptt=14,pb=44, iw=W-pl-prr, ih=H-ptt-pb;
      const xmin=Math.min.apply(0,tx),xmax=Math.max.apply(0,tx),ymin=Math.min.apply(0,ty),ymax=Math.max.apply(0,ty);
      const SX=v=>pl+(xmax===xmin?0.5:(v-xmin)/(xmax-xmin))*iw, SY=v=>ptt+ih-(ymax===ymin?0.5:(v-ymin)/(ymax-ymin))*ih;
      let dots=''; ps.forEach((p,i)=>{ dots+='<circle class="corr-dot" cx="'+SX(tx[i]).toFixed(1)+'" cy="'+SY(ty[i]).toFixed(1)+'" r="4"><title>'+esc(p.nm)+': '+esc(mx.fmt(p.x))+' / '+esc(my.fmt(p.y))+'</title></circle>'; });
      const mb=(r!=null)?lsq(tx,ty):null; let line=''; if(mb){ line='<line x1="'+SX(xmin).toFixed(1)+'" y1="'+SY(mb.m*xmin+mb.b).toFixed(1)+'" x2="'+SX(xmax).toFixed(1)+'" y2="'+SY(mb.m*xmax+mb.b).toFixed(1)+'" stroke="#ff3b30" stroke-width="1.6" stroke-dasharray="5 4"/>'; }
      _lastFit={ps,tx,ty,mx,my,mb};   /* (#R40) kept for the residual map button */
      const axis='<line x1="'+pl+'" y1="'+(ptt+ih)+'" x2="'+(pl+iw)+'" y2="'+(ptt+ih)+'" stroke="rgba(128,128,128,0.5)"/><line x1="'+pl+'" y1="'+ptt+'" x2="'+pl+'" y2="'+(ptt+ih)+'" stroke="rgba(128,128,128,0.5)"/>';
      const inv=(tt,log)=>log?Math.pow(10,tt):tt, TS='font-size="9" style="fill:var(--text-muted)"';
      const ticks='<text x="'+pl+'" y="'+(ptt+ih+15)+'" '+TS+' text-anchor="start">'+esc(mx.fmt(inv(xmin,mx.log)))+'</text>'
        +'<text x="'+(pl+iw)+'" y="'+(ptt+ih+15)+'" '+TS+' text-anchor="end">'+esc(mx.fmt(inv(xmax,mx.log)))+'</text>'
        +'<text x="'+(pl-5)+'" y="'+(ptt+ih)+'" '+TS+' text-anchor="end">'+esc(my.fmt(inv(ymin,my.log)))+'</text>'
        +'<text x="'+(pl-5)+'" y="'+(ptt+9)+'" '+TS+' text-anchor="end">'+esc(my.fmt(inv(ymax,my.log)))+'</text>';
      const titles='<text x="'+(pl+iw/2)+'" y="'+(H-6)+'" font-size="11" style="fill:var(--text-main)" text-anchor="middle">'+esc(ml(mx))+(mx.log?' (log)':'')+'</text>'
        +'<text x="14" y="'+(ptt+ih/2)+'" font-size="11" style="fill:var(--text-main)" text-anchor="middle" transform="rotate(-90 14 '+(ptt+ih/2)+')">'+esc(ml(my))+(my.log?' (log)':'')+'</text>';
      wrap.innerHTML='<svg viewBox="0 0 '+W+' '+H+'" width="100%" style="display:block;">'+axis+line+dots+ticks+titles+'</svg>';
      const str=Math.abs(r||0), d= str<0.2?tr('very weak','ごく弱い','sehr schwach','очень слабая'):str<0.4?tr('weak','弱い','schwach','слабая'):str<0.6?tr('moderate','中程度の','mäßig','умеренная'):str<0.8?tr('strong','強い','stark','сильная'):tr('very strong','非常に強い','sehr stark','очень сильная');
      const sg= r>0?tr('positive','正の','positive','положительная'):tr('negative','負の','negative','отрицательная');
      rEl.innerHTML='<div><span class="lab">'+tr('Pearson r','ピアソン r','Pearson r','Пирсон r')+(mx.log||my.log?' ('+tr('log','対数','log','лог')+')':'')+'</span><b style="color:'+(r>0?'#34c759':'#ff453a')+'">'+(r!=null?r.toFixed(3):'—')+'</b></div>'
        +'<div><span class="lab">'+tr('Spearman ρ (rank)','スピアマン ρ (順位)','Spearman ρ (Rang)','Спирмен ρ (ранг)')+'</span><b>'+(rho!=null?rho.toFixed(3):'—')+'</b></div>'
        +'<div><span class="lab">'+tr('Countries','国数','Länder','Стран')+'</span><b>'+ps.length+'</b></div>'
        +(mb?'<div style="flex:1 1 100%;margin-top:2px;"><button id="corr-resid-btn" class="ai-test-btn" style="width:100%;">🗺 '+tr('Color map by residual (blue = above, red = below)','残差で地図を塗る（青=上振れ / 赤=下振れ）','Karte nach Residuen färben (blau = über, rot = unter)','Закрасить карту по остаткам (синий = выше, красный = ниже)','Colorear el mapa por residuo (azul = por encima, rojo = por debajo)')+'</button></div>':'');
      try{ const rb=ov.querySelector('#corr-resid-btn'); if(rb) rb.onclick=()=>{ try{ residualMap(); }catch(_){} }; }catch(_){}
      nEl.textContent=d+' '+sg+' '+tr('correlation','相関','Korrelation','корреляция')+' · '+tr('Correlation is not causation; outliers and confounders matter.','相関は因果ではありません。外れ値や交絡因子に注意。','Korrelation ist keine Kausalität; Ausreißer & Störfaktoren beachten.','Корреляция — не причинность; учитывайте выбросы и факторы.');
    }
    /* (#R40) Residual map: paint each country by how far it sits ABOVE (blue) or BELOW (red) the regression
       line — deeper = larger residual. Uses the `countries` source via a per-code match expression. */
    function ensureCountriesSrc(cb){ try{ if(map.getSource('countries')){ cb(); return; } if(typeof loadCountryData==='function'){ loadCountryData().then(()=>{ try{ if(typeof addCountryLayers==='function'&&!map.getSource('countries')&&map.isStyleLoaded()) addCountryLayers(); }catch(_){} setTimeout(cb,200); }); return; } }catch(_){} cb(); }
    /* (#R41) Diverging RdBu ramp — the residual map now uses a GRADED multi-hue scale (deep red → orange →
       light → light blue → deep blue), not the old two flat colors with faint alpha ("青と赤二色だけで塗れと
       なんかいっていない"). n∈[-1,1]: +1 = far ABOVE the fit (deep blue), −1 = far BELOW (deep red), 0 ≈ on the
       line (near-neutral). */
    const _RDBU=[[-1,[103,0,31]],[-0.66,[178,24,43]],[-0.33,[239,138,98]],[0,[247,247,247]],[0.33,[103,169,207]],[0.66,[33,102,172]],[1,[5,48,97]]];
    function _divColor(n){ n=Math.max(-1,Math.min(1,n)); for(let i=1;i<_RDBU.length;i++){ if(n<=_RDBU[i][0]){ const a=_RDBU[i-1],b=_RDBU[i]; const t=(n-a[0])/((b[0]-a[0])||1); const c=k=>Math.round(a[1][k]+(b[1][k]-a[1][k])*t); return 'rgb('+c(0)+','+c(1)+','+c(2)+')'; } } return 'rgb(5,48,97)'; }
    function residualMap(){ const f=_lastFit; if(!f||!f.mb){ return; }
      hide();   /* (#R41) close the chooser FIRST so the map is ALWAYS revealed — the old code only closed it on
                   success inside a try/catch, so any failure left the user trapped behind the modal
                   ("機能使ってたら×しないと地図見れない"). */
      let tries=0;
      const paint=()=>{ try{
        if(!map.getSource('countries')){ if(tries++<40){ ensureCountriesSrc(()=>setTimeout(paint,0)); return; } else { residPill(f.mx,f.my,true); return; } }
        let maxA=0; const resids=f.ps.map((p,i)=>{ const e=f.ty[i]-(f.mb.m*f.tx[i]+f.mb.b); if(Math.abs(e)>maxA)maxA=Math.abs(e); return {c:p.c,e}; }); if(maxA<=0) maxA=1;
        const match=['match',['get','__code']];
        resids.forEach(({c,e})=>{ const n=Math.max(-1,Math.min(1,e/maxA)); match.push(c,_divColor(n)); });
        match.push('rgba(0,0,0,0)');
        if(!map.getLayer('corr-resid-fill')){ const before=['ofm-river','ofm-water','ofm-peak','ofm-country','ofm-city','ofm-other','borders-only-line'].find(id=>map.getLayer(id))||(map.getLayer('tool-poly')?'tool-poly':undefined); map.addLayer({id:'corr-resid-fill',type:'fill',source:'countries',layout:{visibility:'visible'},paint:{'fill-color':match,'fill-opacity':0.72}}, before); }
        else { map.setPaintProperty('corr-resid-fill','fill-color',match); map.setPaintProperty('corr-resid-fill','fill-opacity',0.72); map.setLayoutProperty('corr-resid-fill','visibility','visible'); }
        residPill(f.mx,f.my);
      }catch(e){ if(tries++<40){ setTimeout(paint,120); } else { residPill(f.mx,f.my,true); } } };
      ensureCountriesSrc(()=>setTimeout(paint,0));
    }
    window._refreshResidualColors=()=>{ try{ if(map.getLayer('corr-resid-fill')&&map.getLayoutProperty('corr-resid-fill','visibility')==='visible'&&_lastFit&&_lastFit.mb) residualMap(); }catch(_){} };
    function residPill(mx,my,err){ let pill=document.getElementById('corr-resid-pill'); if(!pill){ pill=document.createElement('div'); pill.id='corr-resid-pill'; pill.style.cssText='position:absolute;bottom:96px;left:50%;transform:translateX(-50%);z-index:1700;background:var(--popup-bg);color:var(--text-main);border:1px solid var(--glass-border,rgba(128,128,128,0.2));border-radius:14px;padding:9px 14px;font-size:11px;box-shadow:var(--shadow);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);display:flex;flex-direction:column;align-items:stretch;gap:6px;max-width:min(440px,calc(100vw - 24px));'; (document.getElementById('map-container')||document.body).appendChild(pill); }
      if(err){ pill.innerHTML='<div style="display:flex;align-items:center;gap:10px;justify-content:space-between;"><span>'+tr('Could not load country data — try again.','国データを取得できませんでした。再度お試しください。','Länderdaten konnten nicht geladen werden.','Не удалось загрузить данные стран.','No se pudieron cargar los datos de países.')+'</span><button style="background:none;border:none;color:var(--primary-color);font-weight:700;cursor:pointer;font-size:13px;">✕</button></div>'; pill.querySelector('button').onclick=()=>{ pill.style.display='none'; }; pill.style.display='flex'; return; }
      /* (#R41) graded diverging legend bar (matches the RdBu fill) + a one-line "what is this" note */
      const grad='linear-gradient(to right,rgb(103,0,31),rgb(178,24,43),rgb(239,138,98),rgb(247,247,247),rgb(103,169,207),rgb(33,102,172),rgb(5,48,97))';
      pill.innerHTML='<div style="display:flex;align-items:center;gap:10px;justify-content:space-between;"><span style="font-weight:600;">'+esc(ml(my))+' '+tr('vs','対','vs','от','vs')+' '+esc(ml(mx))+'</span><button aria-label="Close" style="background:none;border:none;color:var(--primary-color);font-weight:700;cursor:pointer;font-size:13px;line-height:1;">✕</button></div>'
        +'<div style="height:11px;border-radius:4px;background:'+grad+';border:1px solid rgba(128,128,128,0.25);"></div>'
        +'<div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text-muted);"><span>'+tr('below the trend','傾向より下','unter dem Trend','ниже тренда','por debajo')+'</span><span>'+tr('on the line','線上','auf der Linie','на линии','en la línea')+'</span><span>'+tr('above the trend','傾向より上','über dem Trend','выше тренда','por encima')+'</span></div>'
        +'<div style="font-size:10px;color:var(--text-muted);line-height:1.4;">'+tr('Each country is shaded by its regression residual — how far its '+ml(my)+' sits above/below what its '+ml(mx)+' predicts.','各国を回帰残差で塗り分け：その国の'+ml(my)+'が'+ml(mx)+'からの予測値より上振れ/下振れしている度合い。','Jedes Land ist nach dem Regressionsresiduum gefärbt — wie weit sein Wert über/unter der Erwartung liegt.','Каждая страна окрашена по остатку регрессии — насколько значение выше/ниже ожидаемого.','Cada país se sombrea por el residuo de la regresión: cuánto se sitúa por encima/debajo de lo previsto.')+'</div>';
      pill.querySelector('button').onclick=()=>{ try{ if(map.getLayer('corr-resid-fill')) map.setLayoutProperty('corr-resid-fill','visibility','none'); }catch(_){} pill.style.display='none'; };
      pill.style.display='flex'; }
    function open(){ ensure(); ov.classList.add('show'); const go=()=>reRender();
      if(window.countryGeo&&Object.keys(countryStats||{}).length) go();
      else if(typeof loadCountryData==='function'){ ov.querySelector('.corr-svg-wrap').innerHTML='<div style="padding:46px;text-align:center;color:var(--text-muted);">'+t('loadingData')+'</div>'; loadCountryData().then(go); }
      else go(); }
    window.IntMapCorrelate={open};
    const btnLbl=()=>tr('Correlation / scatter','相関・散布図','Korrelation / Streudiagramm','Корреляция / диаграмма');
    (function mkBtn(){ if(document.getElementById('btn-correlate'))return; const b=document.createElement('button'); b.id='btn-correlate'; b.type='button'; b.className='ai-test-btn'; b.style.cssText='width:100%;text-align:center;'; b.innerHTML='📊 <span>'+esc(btnLbl())+'</span>'; b.onclick=open; (document.getElementById('layer-tools')||document.body).appendChild(b); try{ window.reorganizeLayerPanel&&window.reorganizeLayerPanel(); }catch(_){} })();
    window.addEventListener('intmap-lang',()=>{ const b=document.getElementById('btn-correlate'); if(b){ const sp=b.querySelector('span'); if(sp) sp.textContent=btnLbl(); } if(ov){ const sx=ov.querySelector('.corr-sel-x'),sy=ov.querySelector('.corr-sel-y'); if(sx&&sy){ [sx,sy].forEach(sel=>{ [].forEach.call(sel.options,(o,i)=>{ if(METRICS[i]) o.textContent=ml(METRICS[i]); }); }); if(ov.classList.contains('show')) render(); } } });
  })();
};

window.IntMapModules.worldEvents=function(map,HOST){
  /* stable closure values (never reassigned) — rebound under their original names so the moved body stays verbatim */
  const renderDashboard=HOST.renderDashboard, setupIntelLayers=HOST.setupIntelLayers;
  (function(){
    const E=(y,lng,lat,tp,en,jpn,den,djp,wiki)=>({y,loc:[lng,lat],tp,en,jp:jpn,den,djp,wiki});
    const EVENTS_DB=[
      E(1492,-74.48,24.10,'geo','Columbus reaches the Americas','コロンブスのアメリカ到達','First Atlantic crossing opens the Columbian exchange.','大西洋横断により新旧両大陸の交流が始まる。','Voyages_of_Christopher_Columbus'),
      E(1648,7.63,51.96,'geo','Peace of Westphalia','ウェストファリア条約','Birth of the modern sovereign-state order.','近代主権国家体制の起点。','Peace_of_Westphalia'),
      E(1755,-9.14,38.71,'disaster','Great Lisbon Earthquake','リスボン大地震','Quake+tsunami killed tens of thousands; shook European thought.','地震と津波で数万人が犠牲。欧州思想にも衝撃。','1755_Lisbon_earthquake'),
      E(1789,2.35,48.86,'revolution','French Revolution','フランス革命','Storming of the Bastille topples the old order.','バスティーユ襲撃で旧体制が崩壊。','French_Revolution'),
      E(1815,16.37,48.21,'geo','Congress of Vienna','ウィーン会議','Post-Napoleonic balance-of-power settlement.','ナポレオン後の勢力均衡体制を構築。','Congress_of_Vienna'),
      E(1842,118.80,32.06,'geo','Treaty of Nanking','南京条約','Ends the First Opium War; cedes Hong Kong.','アヘン戦争終結、香港割譲。','Treaty_of_Nanking'),
      E(1865,-77.03,38.90,'assassination','Lincoln assassinated','リンカーン暗殺','US president shot at Ford’s Theatre.','フォード劇場で米大統領が撃たれる。','Assassination_of_Abraham_Lincoln'),
      E(1868,135.77,35.01,'revolution','Meiji Restoration','明治維新','Japan’s rapid modernisation begins.','日本の近代化が始動。','Meiji_Restoration'),
      E(1869,32.35,30.59,'economic','Suez Canal opens','スエズ運河開通','Europe–Asia sea route shortened by ~7,000 km.','欧亜航路を約7,000km短縮。','Suez_Canal'),
      E(1883,105.42,-6.10,'disaster','Krakatoa eruption','クラカタウ大噴火','One of the deadliest volcanic events in history.','史上最悪級の火山災害。','1883_eruption_of_Krakatoa'),
      E(1903,-75.67,36.02,'space','Wright brothers’ first flight','ライト兄弟初飛行','Powered flight begins at Kitty Hawk.','キティホークで動力飛行が実現。','Wright_Flyer'),
      E(1906,-122.42,37.77,'disaster','San Francisco earthquake','サンフランシスコ地震','M7.9 quake and fires destroy the city.','M7.9の地震と火災で市街壊滅。','1906_San_Francisco_earthquake'),
      E(1912,-49.95,41.73,'disaster','Titanic sinks','タイタニック号沈没','1,500+ die in the North Atlantic.','北大西洋で1,500人以上が犠牲。','Sinking_of_the_Titanic'),
      E(1914,18.43,43.86,'assassination','Assassination in Sarajevo','サラエボ事件','Archduke Franz Ferdinand shot — WWI ignites.','フランツ・フェルディナント暗殺、第一次大戦の引き金。','Assassination_of_Archduke_Franz_Ferdinand'),
      E(1914,-79.92,9.08,'economic','Panama Canal opens','パナマ運河開通','Atlantic and Pacific joined.','大西洋と太平洋を接続。','Panama_Canal'),
      E(1917,30.31,59.94,'revolution','Russian Revolution','ロシア革命','Bolsheviks seize Petrograd.','ボリシェヴィキが権力掌握。','October_Revolution'),
      E(1918,2.83,49.43,'war','WWI Armistice','第一次大戦休戦','Fighting ends in the Compiègne railway carriage.','コンピエーニュの森で休戦調印。','Armistice_of_11_November_1918'),
      E(1918,-96.79,39.20,'disaster','1918 influenza pandemic','スペインかぜ','Tens of millions die worldwide.','世界で数千万人が死亡。','Spanish_flu'),
      E(1919,2.13,48.80,'geo','Treaty of Versailles','ヴェルサイユ条約','Redraws Europe; seeds future conflict.','欧州の地図を書き換え、次の火種に。','Treaty_of_Versailles'),
      E(1923,139.69,35.68,'disaster','Great Kantō earthquake','関東大震災','Tokyo–Yokohama devastated; ~105,000 dead.','東京・横浜壊滅、犠牲者約10万5千人。','1923_Great_Kant%C5%8D_earthquake'),
      E(1929,-74.01,40.71,'economic','Wall Street Crash','ウォール街大暴落','Black Tuesday opens the Great Depression.','暗黒の木曜日から世界恐慌へ。','Wall_Street_Crash_of_1929'),
      E(1939,18.67,54.41,'war','WWII begins','第二次世界大戦勃発','Germany attacks Westerplatte, invades Poland.','ドイツがポーランド侵攻。','Invasion_of_Poland'),
      E(1941,-157.95,21.36,'war','Attack on Pearl Harbor','真珠湾攻撃','Japan strikes the US Pacific Fleet.','日本が米太平洋艦隊を奇襲。','Attack_on_Pearl_Harbor'),
      E(1944,-0.85,49.34,'war','D-Day landings','ノルマンディー上陸','Largest amphibious invasion in history.','史上最大の上陸作戦。','Normandy_landings'),
      E(1944,-71.30,44.26,'economic','Bretton Woods Conference','ブレトンウッズ会議','Dollar-centerd postwar monetary order.','ドル基軸の戦後通貨体制を設計。','Bretton_Woods_Conference'),
      E(1945,-106.47,33.68,'space','Trinity nuclear test','トリニティ核実験','First nuclear detonation.','人類初の核爆発。','Trinity_(nuclear_test)'),
      E(1945,132.45,34.39,'war','Hiroshima','広島への原爆投下','First atomic bombing of a city.','史上初の都市への原爆投下。','Atomic_bombings_of_Hiroshima_and_Nagasaki'),
      E(1945,-122.42,37.77,'geo','United Nations founded','国際連合発足','UN Charter signed in San Francisco.','サンフランシスコで国連憲章調印。','United_Nations'),
      E(1947,77.21,28.61,'revolution','Indian independence','インド独立','End of the British Raj; Partition follows.','英領インド帝国の終焉と分離独立。','Indian_independence_movement'),
      E(1948,77.21,28.61,'assassination','Gandhi assassinated','ガンディー暗殺','Shot in New Delhi.','ニューデリーで凶弾に倒れる。','Assassination_of_Mahatma_Gandhi'),
      E(1949,116.39,39.91,'revolution','People’s Republic of China founded','中華人民共和国成立','Mao proclaims the PRC in Beijing.','毛沢東が建国を宣言。','Proclamation_of_the_People%27s_Republic_of_China'),
      E(1949,-77.03,38.90,'geo','NATO founded','NATO発足','North Atlantic Treaty signed in Washington.','北大西洋条約に調印。','NATO'),
      E(1950,126.98,38.0,'war','Korean War begins','朝鮮戦争勃発','North invades across the 38th parallel.','北朝鮮が38度線を越え南侵。','Korean_War'),
      E(1956,32.35,30.59,'war','Suez Crisis','スエズ危機','Canal nationalisation triggers war; superpowers force a halt.','運河国有化が戦争に発展、米ソが停戦を強制。','Suez_Crisis'),
      E(1957,63.31,45.92,'space','Sputnik 1','スプートニク1号','First artificial satellite — the space age begins.','人類初の人工衛星、宇宙時代の幕開け。','Sputnik_1'),
      E(1957,12.48,41.89,'economic','Treaty of Rome','ローマ条約','European Economic Community founded.','EECが発足、欧州統合の礎に。','Treaty_of_Rome'),
      E(1959,-82.36,23.11,'revolution','Cuban Revolution','キューバ革命','Castro takes Havana.','カストロがハバナを掌握。','Cuban_Revolution'),
      E(1961,13.40,52.52,'geo','Berlin Wall built','ベルリンの壁構築','East Germany seals the inner-Berlin border.','東独が境界を封鎖。','Berlin_Wall'),
      E(1961,63.31,45.92,'space','Gagarin orbits Earth','ガガーリン宇宙飛行','First human in space.','人類初の有人宇宙飛行。','Vostok_1'),
      E(1962,-82.36,23.11,'war','Cuban Missile Crisis','キューバ危機','The Cold War’s closest brush with nuclear war.','核戦争に最も近づいた13日間。','Cuban_Missile_Crisis'),
      E(1963,-96.81,32.78,'assassination','JFK assassinated','ケネディ大統領暗殺','Shot in Dallas.','ダラスで狙撃される。','Assassination_of_John_F._Kennedy'),
      E(1967,35.23,31.78,'war','Six-Day War','第三次中東戦争','Israel takes Sinai, Golan, West Bank, Gaza.','イスラエルが六日間で広域を制圧。','Six-Day_War'),
      E(1968,-90.05,35.13,'assassination','Martin Luther King Jr. assassinated','キング牧師暗殺','Shot in Memphis.','メンフィスで暗殺。','Assassination_of_Martin_Luther_King_Jr.'),
      E(1969,-80.60,28.61,'space','Apollo 11','アポロ11号','Launch of the first crewed Moon landing.','人類初の月面着陸へ打ち上げ。','Apollo_11'),
      E(1971,-77.03,38.90,'economic','Nixon shock','ニクソン・ショック','Dollar–gold convertibility ends.','金とドルの交換停止。','Nixon_shock'),
      E(1973,46.72,24.69,'economic','1973 oil crisis','第一次石油危機','OPEC embargo quadruples oil prices.','OPEC禁輸で原油価格が4倍に。','1973_oil_crisis'),
      E(1975,106.70,10.78,'war','Fall of Saigon','サイゴン陥落','Vietnam War ends.','ベトナム戦争終結。','Fall_of_Saigon'),
      E(1979,51.39,35.69,'revolution','Iranian Revolution','イラン革命','Shah falls; Islamic Republic founded.','王制崩壊、イスラム共和国成立。','Iranian_Revolution'),
      E(1979,69.17,34.53,'war','Soviet invasion of Afghanistan','ソ連のアフガン侵攻','A decade-long quagmire begins.','10年に及ぶ泥沼の始まり。','Soviet%E2%80%93Afghan_War'),
      E(1984,77.41,23.26,'disaster','Bhopal gas disaster','ボパール化学工場事故','World’s worst industrial accident.','史上最悪の産業事故。','Bhopal_disaster'),
      E(1985,-74.01,40.71,'economic','Plaza Accord','プラザ合意','Coordinated dollar depreciation; yen surges.','ドル高是正で円が急騰。','Plaza_Accord'),
      E(1986,30.10,51.39,'disaster','Chernobyl disaster','チェルノブイリ原発事故','Worst nuclear accident in history.','史上最悪の原子力事故。','Chernobyl_disaster'),
      E(1986,-80.60,28.61,'space','Challenger disaster','チャレンジャー号爆発','Shuttle lost 73 seconds after launch.','打ち上げ73秒後に空中分解。','Space_Shuttle_Challenger_disaster'),
      E(1989,13.40,52.52,'revolution','Fall of the Berlin Wall','ベルリンの壁崩壊','The Iron Curtain cracks open.','鉄のカーテンが崩れる。','Fall_of_the_Berlin_Wall'),
      E(1989,116.39,39.90,'revolution','Tiananmen Square crackdown','天安門事件','Pro-democracy protests suppressed.','民主化運動が武力鎮圧される。','1989_Tiananmen_Square_protests_and_massacre'),
      E(1991,47.98,29.37,'war','Gulf War','湾岸戦争','Coalition liberates Kuwait.','多国籍軍がクウェートを解放。','Gulf_War'),
      E(1991,37.62,55.75,'geo','Dissolution of the USSR','ソ連崩壊','The Soviet flag is lowered over the Kremlin.','クレムリンからソ連国旗が降ろされる。','Dissolution_of_the_Soviet_Union'),
      E(1994,28.19,-25.75,'revolution','End of apartheid','アパルトヘイト終結','Mandela becomes president.','マンデラが大統領に就任。','1994_South_African_general_election'),
      E(1995,34.78,32.08,'assassination','Rabin assassinated','ラビン首相暗殺','Israeli PM shot at a peace rally.','和平集会で銃撃される。','Assassination_of_Yitzhak_Rabin'),
      E(1997,114.17,22.32,'geo','Hong Kong handover','香港返還','British rule ends after 156 years.','156年の英国統治が終了。','Handover_of_Hong_Kong'),
      E(1997,100.50,13.75,'economic','Asian financial crisis','アジア通貨危機','Baht collapse cascades across Asia.','バーツ暴落がアジア全域へ連鎖。','1997_Asian_financial_crisis'),
      E(1999,8.68,50.11,'economic','Euro launched','ユーロ誕生','Single currency for 11 EU states.','EU11か国の単一通貨が始動。','Euro'),
      E(2001,-74.01,40.71,'war','September 11 attacks','アメリカ同時多発テロ','Al-Qaeda attacks New York and Washington.','アルカイダによる米本土攻撃。','September_11_attacks'),
      E(2003,44.36,33.31,'war','Iraq War begins','イラク戦争開戦','US-led coalition invades Iraq.','米主導の有志連合が侵攻。','2003_invasion_of_Iraq'),
      E(2004,95.85,3.32,'disaster','Indian Ocean tsunami','スマトラ沖地震・津波','~230,000 dead across 14 countries.','14か国で約23万人が犠牲。','2004_Indian_Ocean_earthquake_and_tsunami'),
      E(2005,-90.07,29.95,'disaster','Hurricane Katrina','ハリケーン・カトリーナ','New Orleans flooded.','ニューオーリンズが水没。','Hurricane_Katrina'),
      E(2008,-74.01,40.71,'economic','Lehman Brothers collapse','リーマン・ショック','Global financial crisis erupts.','世界金融危機が勃発。','Bankruptcy_of_Lehman_Brothers'),
      E(2010,10.18,36.80,'revolution','Arab Spring begins','アラブの春','Tunisian uprising spreads across the region.','チュニジアから域内へ拡大。','Arab_Spring'),
      E(2010,23.73,37.98,'economic','Greek debt crisis','ギリシャ債務危機','Eurozone sovereign-debt crisis begins.','ユーロ圏債務危機の発端。','Greek_government-debt_crisis'),
      E(2010,-72.34,18.54,'disaster','Haiti earthquake','ハイチ地震','~200,000+ dead near Port-au-Prince.','首都近郊で20万人超が犠牲。','2010_Haiti_earthquake'),
      E(2011,142.37,38.32,'disaster','Tōhoku earthquake & tsunami','東日本大震災','M9.1 quake, tsunami and the Fukushima accident.','M9.1の地震・津波と福島第一原発事故。','2011_T%C5%8Dhoku_earthquake_and_tsunami'),
      E(2014,34.10,44.95,'war','Annexation of Crimea','クリミア併合','Russia seizes the peninsula from Ukraine.','ロシアがウクライナから半島を奪取。','Annexation_of_Crimea_by_the_Russian_Federation'),
      E(2015,-80.57,28.49,'space','First orbital booster landing','ロケット第1段の着陸回収','SpaceX lands Falcon 9 — reusability era.','ファルコン9が着陸、再使用時代へ。','Falcon_9_flight_20'),
      E(2016,-0.13,51.51,'geo','Brexit referendum','ブレグジット国民投票','UK votes to leave the EU.','英国がEU離脱を選択。','2016_United_Kingdom_European_Union_membership_referendum'),
      E(2019,114.31,30.59,'disaster','COVID-19 outbreak','新型コロナ流行開始','Pandemic that reshaped the world.','世界を変えたパンデミック。','COVID-19_pandemic'),
      E(2022,30.52,50.45,'war','Russia invades Ukraine','ロシアのウクライナ侵攻','Largest war in Europe since 1945.','1945年以降欧州最大の戦争。','Russian_invasion_of_Ukraine'),
      E(2022,135.81,34.69,'assassination','Abe Shinzō assassinated','安倍晋三元首相銃撃事件','Former Japanese PM shot in Nara.','奈良で銃撃され死亡。','Assassination_of_Shinzo_Abe'),
      E(2023,37.03,37.17,'disaster','Türkiye–Syria earthquakes','トルコ・シリア地震','M7.8 doublet; 55,000+ dead.','M7.8の連続地震、5万5千人超が犠牲。','2023_Turkey%E2%80%93Syria_earthquakes'),
      E(2023,34.46,31.52,'war','October 7 attacks / Gaza war','10月7日攻撃とガザ戦争','Hamas attack and the war that followed.','ハマスの攻撃とそれに続く戦争。','October_7_attacks'),
      /* (#R33) Information timeline greatly expanded — recent events + historical gaps. */
      E(2024,121.56,23.83,'disaster','Taiwan (Hualien) earthquake','台湾・花蓮地震','M7.4 quake off eastern Taiwan.','台湾東部沖でM7.4の地震。','2024_Hualien_earthquake'),
      E(2024,36.30,33.51,'revolution','Fall of the Assad regime','アサド政権の崩壊','Syrian government collapses; Assad flees.','シリア政権が崩壊しアサドが国外脱出。','Fall_of_the_Assad_regime'),
      E(2024,-77.04,38.90,'geo','2024 US presidential election','2024年アメリカ大統領選','Trump wins a second, non-consecutive term.','トランプが返り咲き当選。','2024_United_States_presidential_election'),
      E(1804,-72.34,18.59,'revolution','Haitian independence','ハイチ独立','First Black-led republic; slavery abolished.','黒人主導の共和国が独立、奴隷制廃止。','Haitian_Revolution'),
      E(1928,-0.14,51.52,'space','Penicillin discovered','ペニシリンの発見','Fleming opens the antibiotic era.','フレミングが抗生物質時代を開く。','History_of_penicillin'),
      E(1955,21.01,52.23,'geo','Warsaw Pact formed','ワルシャワ条約機構の成立','Soviet-led military alliance.','ソ連主導の軍事同盟が発足。','Warsaw_Pact'),
      E(1960,7.49,9.06,'geo','Year of Africa','アフリカの年','17 African nations gain independence.','アフリカ17か国が独立。','Year_of_Africa'),
      E(1990,13.40,52.52,'geo','German reunification','ドイツ再統一','East and West Germany reunite.','東西ドイツが再統一。','German_reunification'),
      E(1991,47.98,29.38,'war','Gulf War','湾岸戦争','Coalition expels Iraq from Kuwait.','多国籍軍がイラクをクウェートから撃退。','Gulf_War'),
      E(2007,-122.03,37.33,'space','iPhone introduced','iPhone発表','The modern smartphone era begins.','現代のスマートフォン時代の幕開け。','IPhone_(1st_generation)'),
      E(2012,6.05,46.23,'space','Higgs boson discovered','ヒッグス粒子の発見','CERN confirms the Higgs boson.','CERNがヒッグス粒子を確認。','Higgs_boson'),
      E(2018,126.66,37.95,'geo','Inter-Korean summit','南北首脳会談','Koreas meet at Panmunjom.','板門店で南北首脳が会談。','2018_inter-Korean_summits'),
      E(2020,-98.50,39.80,'disaster','WHO declares COVID-19 a pandemic','WHOがCOVID-19をパンデミックと宣言','Global pandemic declared in March 2020.','2020年3月、世界的流行を宣言。','COVID-19_pandemic'),
      E(2021,-77.01,38.89,'geo','US Capitol attack','米連邦議会議事堂襲撃','Rioters storm the US Capitol.','暴徒が連邦議会を襲撃。','January_6_United_States_Capitol_attack'),
      /* (#R34) Information timeline further expanded — major historical + recent events. */
      E(1453,28.98,41.01,'war','Fall of Constantinople','コンスタンティノープル陥落','Ottomans end the Byzantine Empire.','オスマン帝国がビザンツ帝国を滅ぼす。','Fall_of_Constantinople'),
      E(1517,11.33,51.51,'revolution','Protestant Reformation','宗教改革','Luther’s 95 Theses split Western Christianity.','ルターの95か条で西方教会が分裂。','Reformation'),
      E(1776,-75.15,39.95,'revolution','US Declaration of Independence','アメリカ独立宣言','Thirteen colonies declare independence.','13植民地が独立を宣言。','United_States_Declaration_of_Independence'),
      E(1859,-0.08,51.51,'space','On the Origin of Species','『種の起源』刊行','Darwin sets out evolution by natural selection.','ダーウィンが自然選択による進化論を提唱。','On_the_Origin_of_Species'),
      E(1914,18.41,43.86,'war','World War I begins','第一次世界大戦勃発','The assassination in Sarajevo triggers global war.','サラエボ事件が世界大戦の引き金に。','World_War_I'),
      E(1917,30.31,59.94,'revolution','Russian Revolution','ロシア革命','Bolsheviks seize power in Petrograd.','ボリシェヴィキが権力を掌握。','Russian_Revolution'),
      E(1918,2.84,49.42,'war','End of World War I','第一次世界大戦終結','Armistice signed at Compiègne.','コンピエーニュで休戦協定に調印。','Armistice_of_11_November_1918'),
      E(1929,-74.01,40.71,'economic','Wall Street Crash of 1929','世界恐慌の始まり','Market collapse triggers the Great Depression.','株価暴落が世界恐慌の引き金に。','Wall_Street_Crash_of_1929'),
      E(1939,21.01,52.23,'war','World War II begins','第二次世界大戦勃発','Germany invades Poland.','ドイツがポーランドに侵攻。','World_War_II'),
      E(1945,139.77,35.61,'war','End of World War II','第二次世界大戦終結','Japan’s surrender ends the war.','日本の降伏で大戦が終結。','Surrender_of_Japan'),
      E(1947,74.35,31.55,'geo','Partition of India','インド・パキスタン分離','British India splits into two states.','英領インドが2国に分離独立。','Partition_of_India'),
      E(1948,35.21,31.77,'geo','Establishment of Israel','イスラエル建国','The State of Israel is declared.','イスラエル国家の樹立。','Israeli_Declaration_of_Independence'),
      E(1969,-73.99,40.73,'revolution','Stonewall uprising','ストーンウォールの反乱','Catalyst of the modern LGBT-rights movement.','現代のLGBT権利運動の契機。','Stonewall_riots'),
      E(1972,116.39,39.90,'geo','Nixon visits China','ニクソン訪中','A turning point in US–China relations.','米中接近の転換点。','1972_Nixon_visit_to_China'),
      E(1990,47.98,29.37,'war','Iraq invades Kuwait','イラクのクウェート侵攻','Trigger of the Gulf War.','湾岸戦争の発端。','Invasion_of_Kuwait'),
      E(1994,30.06,-1.94,'disaster','Rwandan genocide','ルワンダ虐殺','~800,000 killed in about 100 days.','約100日で80万人前後が虐殺される。','Rwandan_genocide'),
      E(2010,-88.37,28.74,'disaster','Deepwater Horizon oil spill','メキシコ湾原油流出事故','Largest marine oil spill in history.','史上最大級の海洋原油流出。','Deepwater_Horizon_oil_spill'),
      E(2015,2.35,48.86,'war','November 2015 Paris attacks','パリ同時多発テロ','Coordinated attacks kill 130 across Paris.','連続攻撃で130人が死亡。','November_2015_Paris_attacks'),
      E(2019,2.35,48.85,'disaster','Notre-Dame fire','ノートルダム大聖堂火災','The Paris cathedral’s spire collapses in flames.','大聖堂の尖塔が焼け落ちる。','Notre-Dame_fire'),
      E(2021,69.17,34.53,'war','US withdrawal from Afghanistan','米軍アフガニスタン撤退','The Taliban retake Kabul.','タリバンがカブールを制圧。','2021_Taliban_offensive'),
      E(2022,-122.42,37.77,'space','ChatGPT launched','ChatGPT公開','Generative AI reaches mass adoption.','生成AIが急速に普及する契機。','ChatGPT'),
      E(2023,12.34,45.44,'space','JWST first images','ジェイムズ・ウェッブ宇宙望遠鏡','Deepest infrared view of the universe yet.','史上最も深い赤外線宇宙像を取得。','James_Webb_Space_Telescope'),
      /* (#R36) Information timeline strengthened — science milestones, more regions & conflicts. */
      E(1347,12.50,41.90,'disaster','Black Death reaches Europe','黒死病の到来','Plague kills roughly a third of Europe.','ペストが欧州人口の約3分の1を奪う。','Black_Death'),
      E(1543,19.68,54.36,'space','Copernican heliocentrism','地動説の提唱','Copernicus places the Sun at the center.','コペルニクスが地動説を提唱。','De_revolutionibus_orbium_coelestium'),
      E(1687,-0.12,51.51,'space','Newton’s Principia','『プリンキピア』刊行','Laws of motion and universal gravitation.','運動法則と万有引力の法則を提示。','Philosophi%C3%A6_Naturalis_Principia_Mathematica'),
      E(1769,-1.90,52.48,'economic','Industrial Revolution','産業革命','Steam power launches modern industry.','蒸気機関が近代産業を切り開く。','Industrial_Revolution'),
      E(1815,4.40,50.68,'war','Battle of Waterloo','ワーテルローの戦い','Napoleon’s final defeat.','ナポレオン最後の敗北。','Battle_of_Waterloo'),
      E(1953,0.12,52.21,'space','DNA double helix','DNAの二重らせん','Watson & Crick reveal the structure of DNA.','ワトソンとクリックがDNAの構造を解明。','Molecular_Structure_of_Nucleic_Acids'),
      E(1953,86.93,27.99,'space','First ascent of Everest','エベレスト初登頂','Hillary and Tenzing reach the summit.','ヒラリーとテンジンが世界最高峰に初登頂。','1953_British_Mount_Everest_expedition'),
      E(1967,18.42,-33.92,'space','First human heart transplant','世界初の心臓移植','Barnard performs the operation in Cape Town.','バーナードがケープタウンで成功させる。','Christiaan_Barnard'),
      E(1972,11.55,48.14,'assassination','Munich Olympics massacre','ミュンヘン五輪事件','Israeli athletes taken hostage and killed.','イスラエル選手団が人質となり殺害される。','Munich_massacre'),
      E(1980,48.20,30.40,'war','Iran–Iraq War begins','イラン・イラク戦争','An eight-year war begins along the border.','国境で8年に及ぶ戦争が始まる。','Iran%E2%80%93Iraq_War'),
      E(1982,-59.52,-51.70,'war','Falklands War','フォークランド紛争','Britain and Argentina clash over the islands.','英国とアルゼンチンが島を巡り交戦。','Falklands_War'),
      E(1989,6.05,46.23,'space','World Wide Web proposed','ワールド・ワイド・ウェブの提案','Berners-Lee invents the Web at CERN.','バーナーズ＝リーがCERNでWebを発明。','World_Wide_Web'),
      E(1996,-3.19,55.95,'space','Dolly the sheep cloned','クローン羊ドリー','First mammal cloned from an adult cell.','成体細胞から初めて哺乳類をクローン。','Dolly_(sheep)'),
      E(2003,-77.10,38.99,'space','Human Genome Project completed','ヒトゲノム計画の完了','The human genome is fully sequenced.','ヒトゲノムの解読が完了。','Human_Genome_Project'),
      E(2011,13.19,32.89,'revolution','Fall of Gaddafi','カダフィ政権の崩壊','Libya’s long-time ruler is overthrown.','長期政権が崩壊。','First_Libyan_Civil_War'),
      E(2015,2.35,48.86,'geo','Paris Climate Agreement','パリ協定','196 parties adopt a global climate accord.','196か国・地域が気候協定を採択。','Paris_Agreement'),
      E(2023,32.53,15.50,'war','Sudan civil war','スーダン内戦','Fighting erupts between the army and the RSF.','国軍とRSFの戦闘が勃発。','Sudanese_civil_war_(2023%E2%80%93present)')
    ];
    const EV_COLORS={war:'#ff3b30',disaster:'#ff9500',revolution:'#af52de',assassination:'#8e8e93',space:'#5856d6',economic:'#34c759',geo:'#007aff'};
    const EV_LBL={war:['War','戦争'],disaster:['Disaster','災害'],revolution:['Revolution','革命・政変'],assassination:['Assassination','暗殺'],space:['Space & science','宇宙・科学'],economic:['Economy','経済危機・転換点'],geo:['Geopolitics','地政学・条約']};
    window._dashView=window._dashView||'places';
    let yMin=1490, yMax=2026;
    window._setDashView=function(v){ window._dashView=v; try{ renderDashboard(); }catch(_){} };
    window._evYear=function(which,val){ if(which==='min') yMin=+val||1490; else yMax=+val||2026; try{ renderDashboard(); }catch(_){} };
    /* renderDashboard delegates here when the Events view is active */
    window._renderEventsArchive=function(dash,q){
      const jp=HOST.lang==='jp';
      const list=EVENTS_DB.filter(e=> e.y>=yMin && e.y<=yMax && (!q || ((e.en+' '+e.jp+' '+e.den+' '+e.djp+' '+e.y+' '+e.tp).toLowerCase().includes(q)))).sort((a,b)=>b.y-a.y);
      /* pins */
      try{
        if(map&&map.isStyleLoaded()) setupIntelLayers();
        const feats=list.map((e,i)=>({type:'Feature',id:'ev'+i,geometry:{type:'Point',coordinates:e.loc},properties:{fid:'ev'+i,type:e.tp,color:EV_COLORS[e.tp]||'#007aff',title:(jp?e.jp:e.en)+' ('+e.y+')',body:jp?e.djp:e.den,layerRef:''}}));
        if(map&&map.getSource('dash-points')) map.getSource('dash-points').setData({type:'FeatureCollection',features:feats});
      }catch(_){}
      const seg='<div class="dash-nav"><button class="dash-nav-btn" onclick="_setDashView(\'places\')">'+(jp?'📍 場所':'📍 Places')+'</button><button class="dash-nav-btn active" onclick="_setDashView(\'events\')">'+(jp?'🗓 出来事':'🗓 Events')+'</button></div>';
      const yr='<div style="display:flex;align-items:center;gap:8px;margin:4px 0 10px;font-size:12px;color:var(--text-muted);flex-wrap:wrap;">'+(jp?'年代':'Years')+
        ' <input type="number" value="'+yMin+'" min="1400" max="2026" style="width:74px;padding:5px 7px;border-radius:8px;border:1px solid rgba(128,128,128,0.25);background:var(--input-bg);color:var(--text-main);" onchange="_evYear(\'min\',this.value)"> –'+
        ' <input type="number" value="'+yMax+'" min="1400" max="2026" style="width:74px;padding:5px 7px;border-radius:8px;border:1px solid rgba(128,128,128,0.25);background:var(--input-bg);color:var(--text-main);" onchange="_evYear(\'max\',this.value)">'+
        ' <span>'+list.length+(jp?'件':' events')+'</span></div>';
      const esc=(s)=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
      const cards=list.map(e=>{
        const nm=jp?e.jp:e.en, d=jp?e.djp:e.den, tl=EV_LBL[e.tp]?(jp?EV_LBL[e.tp][1]:EV_LBL[e.tp][0]):e.tp;
        const wiki='https://'+(jp?'ja':'en')+'.wikipedia.org/wiki/'+e.wiki;
        return '<div class="wiki-card" onclick="flyToLoc('+e.loc[0]+','+e.loc[1]+')" style="cursor:pointer;">'+
          '<div class="wiki-card-content"><div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">'+
          '<span style="font-weight:800;font-size:15px;color:var(--primary-color);">'+e.y+'</span>'+
          '<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:999px;background:'+(EV_COLORS[e.tp]||'#007aff')+'22;color:'+(EV_COLORS[e.tp]||'#007aff')+';">'+esc(tl)+'</span></div>'+
          '<h4 class="wiki-card-title" style="margin:0 0 4px;">'+esc(nm)+'</h4><p class="wiki-card-body" style="margin:0;">'+esc(d)+'</p>'+
          '<div class="wiki-card-footer"><a href="'+wiki+'" target="_blank" rel="noopener" class="wiki-link" onclick="event.stopPropagation()">Wikipedia ↗</a></div></div></div>';
      }).join('');
      dash.innerHTML=seg+yr+'<div class="dash-cards-container">'+cards+'</div>';
    };
  })();
};

window.IntMapModules.edu=function(map,HOST){
  /* stable closure values (never reassigned) — rebound under their original names so the moved body stays verbatim */
  const countryStats=HOST.countryStats, t=HOST.t, makeDraggable=HOST.makeDraggable, resolveCountryId=HOST.resolveCountryId, fmtMoney=HOST.fmtMoney, hasTurf=HOST.hasTurf;
  window.IntMapEdu=(function(){
    const jp=()=>HOST.lang==='jp';
    let panel=null, mode=null, q=null, score=0, streak=0, total=0, mapQuizArmed=false;
    const esc=(s)=>String(s==null?'':s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
    function pool(){ try{ return Object.values(countryStats||{}).filter(s=>s&&s.nameEn&&s.flag&&(s.pop||0)>300000); }catch(_){ return []; } }
    function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
    function cname(s){ return jp()?(s.nameJp||s.nameEn):s.nameEn; }
    function ensure(){ if(panel) return panel;
      panel=document.createElement('div'); panel.className='tool-panel'; panel.id='edu-panel';
      panel.style.cssText='display:none;position:absolute;top:70px;left:50%;transform:translateX(-50%);z-index:1600;width:min(340px,calc(100vw - 24px));max-height:min(72vh,600px);overflow-y:auto;';
      (document.getElementById('map-container')||document.body).appendChild(panel);
      return panel; }
    /* (#R21) Renamed to QUIZ MODE; flags render via flagcdn images (Windows shows emoji flags as
       bare letters like "DE"); 4 new quiz types: country→capital, population duel, area duel,
       country silhouette. */
    const flagH=(s,h)=>window.imFlagHTML?window.imFlagHTML(s&&s.flag,h||20):((s&&s.flag)||'');
    function header(){ return '<div class="tp-header" style="cursor:move;"><span class="tp-title">🎓 '+(jp()?'クイズモード':'Quiz mode')+'</span><button class="tp-close" title="'+t('close')+'">✕</button></div>'+
      '<div style="font-size:11px;color:var(--text-muted);margin:0 0 8px;">'+(jp()?'スコア ':'Score ')+score+'/'+total+' · '+(jp()?'連続正解 ':'streak ')+streak+'</div>'; }
    function wire(){ panel.querySelector('.tp-close').onclick=closeP; try{ makeDraggable(panel,panel.querySelector('.tp-header')); }catch(_){} }
    function menu(){ const p=ensure(); mapQuizArmed=false; p.style.display='block';
      p.innerHTML=header()+
        '<div style="display:flex;flex-direction:column;gap:7px;">'+
        '<button class="ai-test-btn" data-q="flag" style="width:100%;">🚩 '+(jp()?'国旗クイズ（国旗→国名）':'Flag quiz (flag → country)')+'</button>'+
        '<button class="ai-test-btn" data-q="capital" style="width:100%;">🏛 '+(jp()?'首都クイズ（首都→国名）':'Capital quiz (capital → country)')+'</button>'+
        '<button class="ai-test-btn" data-q="capital2" style="width:100%;">🏙 '+(jp()?'首都クイズ（国名→首都）':'Capital quiz (country → capital)')+'</button>'+
        '<button class="ai-test-btn" data-q="map" style="width:100%;">🗺 '+(jp()?'地図クイズ（国を地図でクリック）':'Map quiz (click the country)')+'</button>'+
        '<button class="ai-test-btn" data-q="shape" style="width:100%;">⬛ '+(jp()?'シルエットクイズ（国の形→国名）':'Silhouette quiz (shape → country)')+'</button>'+
        '<button class="ai-test-btn" data-q="duelpop" style="width:100%;">👥 '+(jp()?'人口対決（どちらが多い?）':'Population duel (which is bigger?)')+'</button>'+
        '<button class="ai-test-btn" data-q="duelarea" style="width:100%;">📐 '+(jp()?'面積対決（どちらが広い?）':'Area duel (which is larger?)')+'</button>'+
        '<div style="font-size:10.5px;color:var(--text-muted);line-height:1.5;margin-top:4px;">'+(jp()?'正解すると、その国の解説カードが表示されます。':'Each answer shows a learning card about the country.')+'</div></div>';
      wire(); p.querySelectorAll('[data-q]').forEach(b=>b.onclick=()=>{ mode=b.getAttribute('data-q'); next(); }); }
    /* country silhouette → compact SVG (equirectangular, cos-lat corrected; antimeridian spanners skipped) */
    function shapeSVG(code){ try{
      if(!window.countryGeo) return null;
      const f=(HOST.countryGeo.features||[]).find(x=>{ try{ return resolveCountryId(x)===code; }catch(_){ return false; } });
      if(!f||!f.geometry) return null;
      const polys=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.type==='MultiPolygon'?f.geometry.coordinates:[];
      let minX=999,minY=999,maxX=-999,maxY=-999; const rings=[];
      polys.forEach(p=>{ const r=p&&p[0]; if(!r||r.length<4) return; rings.push(r);
        r.forEach(c=>{ if(c[0]<minX)minX=c[0]; if(c[0]>maxX)maxX=c[0]; if(c[1]<minY)minY=c[1]; if(c[1]>maxY)maxY=c[1]; }); });
      if(!rings.length||maxX-minX<=0||maxY-minY<=0) return null;
      if(maxX-minX>180) return null;
      const cosm=Math.max(0.15,Math.cos((minY+maxY)/2*Math.PI/180));
      const W=170,H=120,pad=8;
      const s=Math.min((W-2*pad)/((maxX-minX)*cosm),(H-2*pad)/(maxY-minY));
      const ox=(W-(maxX-minX)*cosm*s)/2, oy=(H-(maxY-minY)*s)/2;
      let d='';
      rings.forEach(r=>{ const step=Math.max(1,Math.floor(r.length/180));
        for(let i=0;i<r.length;i+=step){ const c=r[i];
          d+=(i===0?'M':'L')+((c[0]-minX)*cosm*s+ox).toFixed(1)+' '+((maxY-c[1])*s+oy).toFixed(1)+' '; }
        d+='Z '; });
      return '<svg width="'+W+'" height="'+H+'" viewBox="0 0 '+W+' '+H+'" style="display:block;margin:4px auto 10px;"><path d="'+d+'" fill="var(--primary-color)" fill-opacity="0.75" stroke="var(--text-main)" stroke-width="0.8" fill-rule="evenodd"/></svg>';
    }catch(_){ return null; } }
    function card(s,ok,extra){ const f=(v)=>{ if(v==null) return '—'; if(v>=1e9) return (v/1e9).toFixed(2)+'B'; if(v>=1e6) return (v/1e6).toFixed(1)+'M'; return Number(Math.round(v)).toLocaleString(); };
      return '<div style="border:1px solid '+(ok?'rgba(52,199,89,0.5)':'rgba(255,69,58,0.5)')+';border-radius:12px;padding:10px 12px;margin-top:8px;background:'+(ok?'rgba(52,199,89,0.08)':'rgba(255,69,58,0.07)')+';font-size:12px;line-height:1.6;">'+
        '<div style="font-weight:700;font-size:14px;">'+(ok?'⭕':'❌')+' '+flagH(s,18)+' '+esc(cname(s))+'</div>'+(extra||'')+
        '<div style="color:var(--text-muted);margin-top:3px;">'+(jp()?'首都':'Capital')+': '+esc(s.capital||'—')+' · '+(jp()?'人口':'Pop')+': '+f(s.pop)+(s.gdp!=null?' · GDP: '+(typeof fmtMoney==='function'?fmtMoney(s.gdp):'$'+s.gdp+'B'):'')+(s.area!=null?' · '+f(s.area)+' km²':'')+'</div></div>'; }
    function next(){ const p=ensure(); const all=pool();
      if(all.length<8){ p.innerHTML=header()+'<div style="font-size:12px;color:var(--text-muted);">'+(jp()?'国データを読み込み中です。少し待ってから開いてください。':'Country data is still loading — try again in a moment.')+'</div>'; wire(); return; }
      let answer=pick(all);
      q={answer};
      if(mode==='map'){
        mapQuizArmed=true;
        p.innerHTML=header()+'<div style="font-size:13px;font-weight:700;margin-bottom:6px;">🗺 '+(jp()?'地図上でクリック:':'Click on the map:')+'</div>'+
          '<div style="font-size:17px;font-weight:800;color:var(--primary-color);margin-bottom:8px;">'+flagH(answer,18)+' '+esc(cname(answer))+'</div>'+
          '<div id="edu-map-res" style="font-size:12px;color:var(--text-muted);">'+(jp()?'地図のその国をクリックしてください…':'Click that country on the map…')+'</div>'+
          '<button class="ai-test-btn" id="edu-skip" style="width:100%;margin-top:8px;">'+(jp()?'スキップ':'Skip')+'</button>';
        wire(); p.querySelector('#edu-skip').onclick=()=>{ total++; streak=0; next(); };
        return;
      }
      /* (#R21) DUEL quizzes — two countries, pick the one with the higher metric (≥20% apart so
         the question is fair). */
      if(mode==='duelpop'||mode==='duelarea'){
        const metric=mode==='duelpop'?(s=>s.pop):(s=>s.area);
        let a=null,b=null,tries=0;
        while(tries++<60){ a=pick(all); b=pick(all);
          const va=metric(a),vb=metric(b);
          if(a!==b&&va&&vb&&Math.max(va,vb)/Math.min(va,vb)>=1.2) break; a=null; }
        if(!a){ next(); return; }
        const win=metric(a)>=metric(b)?a:b;
        const fmt=(v)=>{ if(v==null) return '—'; if(v>=1e9) return (v/1e9).toFixed(2)+'B'; if(v>=1e6) return (v/1e6).toFixed(1)+'M'; return Number(Math.round(v)).toLocaleString(); };
        const unit=mode==='duelarea'?' km²':'';
        p.innerHTML=header()+'<div style="font-size:12.5px;font-weight:700;margin-bottom:8px;">'+(mode==='duelpop'?(jp()?'👥 人口が多いのはどっち?':'👥 Which has the larger population?'):(jp()?'📐 面積が広いのはどっち?':'📐 Which is larger by area?'))+'</div>'+
          '<div style="display:flex;flex-direction:column;gap:6px;">'+[a,b].map((o,i)=>'<button class="ai-test-btn" data-d="'+i+'" style="width:100%;text-align:left;">'+flagH(o,16)+' '+esc(cname(o))+'</button>').join('')+'</div><div id="edu-res"></div>';
        wire();
        p.querySelectorAll('[data-d]').forEach(btn=>btn.onclick=()=>{
          const chosen=[a,b][+btn.getAttribute('data-d')]; const ok=chosen===win; total++; if(ok){ score++; streak++; } else streak=0;
          const both='<div style="font-size:11px;margin-top:3px;">'+esc(cname(a))+': <b>'+fmt(metric(a))+unit+'</b> · '+esc(cname(b))+': <b>'+fmt(metric(b))+unit+'</b></div>';
          const res=p.querySelector('#edu-res'); if(res) res.innerHTML=card(win,ok,both)+'<button class="ai-test-btn" id="edu-next" style="width:100%;margin-top:8px;">'+(jp()?'次の問題 →':'Next →')+'</button>';
          const nx=p.querySelector('#edu-next'); if(nx) nx.onclick=next;
          p.querySelectorAll('[data-d]').forEach(x=>x.disabled=true);
        });
        return;
      }
      /* (#R21) SILHOUETTE quiz — the country's real outline from countryGeo. */
      let shape=null;
      if(mode==='shape'){
        let tries=0; while(tries++<40){ shape=shapeSVG(answer.code); if(shape) break; answer=pick(all); }
        if(!shape){ mode='flag'; }
        q={answer};
      }
      const wrong=[]; while(wrong.length<3){ const w=pick(all); if(w!==answer&&!wrong.includes(w)) wrong.push(w); }
      const opts=[answer,...wrong].sort(()=>Math.random()-0.5);
      /* (#R21) country→capital variant: options are CAPITALS */
      const cap2=(mode==='capital2');
      const qhtml=(mode==='flag')
        ?'<div style="text-align:center;margin:6px 0 12px;">'+flagH(answer,56)+'</div>'
        :(mode==='shape')?shape
        :cap2?'<div style="font-size:17px;font-weight:800;color:var(--primary-color);text-align:center;margin:6px 0 10px;">'+flagH(answer,18)+' '+esc(cname(answer))+'</div>'
        :'<div style="font-size:17px;font-weight:800;color:var(--primary-color);text-align:center;margin:6px 0 10px;">🏛 '+esc(answer.capital||'?')+'</div>';
      const title=(mode==='flag')?(jp()?'この国旗はどこの国?':'Which country is this flag?')
        :(mode==='shape')?(jp()?'この形はどこの国?':'Which country is this shape?')
        :cap2?(jp()?'この国の首都は?':'What is this country’s capital?')
        :(jp()?'この首都はどこの国?':'Which country has this capital?');
      p.innerHTML=header()+'<div style="font-size:12.5px;font-weight:700;">'+title+'</div>'+qhtml+
        '<div style="display:flex;flex-direction:column;gap:6px;">'+opts.map((o,i)=>'<button class="ai-test-btn" data-o="'+i+'" style="width:100%;text-align:left;">'+esc(cap2?(o.capital||'—'):cname(o))+'</button>').join('')+'</div><div id="edu-res"></div>';
      wire();
      p.querySelectorAll('[data-o]').forEach(b=>b.onclick=()=>{
        const chosen=opts[+b.getAttribute('data-o')]; const ok=chosen===q.answer; total++; if(ok){ score++; streak++; } else streak=0;
        const res=p.querySelector('#edu-res'); if(res) res.innerHTML=card(q.answer,ok,(!ok?'<div style="font-size:11px;">'+(jp()?'あなたの回答: ':'You picked: ')+esc(cap2?(chosen.capital||'—'):cname(chosen))+'</div>':''))+'<button class="ai-test-btn" id="edu-next" style="width:100%;margin-top:8px;">'+(jp()?'次の問題 →':'Next →')+'</button>';
        const nx=p.querySelector('#edu-next'); if(nx) nx.onclick=next;
        p.querySelectorAll('[data-o]').forEach(x=>x.disabled=true);
        try{ if(q.answer.latlng&&ok) map&&map.flyTo({center:[q.answer.latlng[1],q.answer.latlng[0]],zoom:4}); }catch(_){}
      });
    }
    /* map-quiz click resolution: point-in-polygon over countryGeo (works with the fill layer hidden) */
    function countryAt(lngLat){ try{ if(!window.countryGeo||!hasTurf()) return null;
      const pt=turf.point([lngLat.lng,lngLat.lat]);
      for(const f of (HOST.countryGeo.features||[])){ try{ if(turf.booleanPointInPolygon(pt,f)) return f; }catch(_){} }
      }catch(_){} return null; }
    function onMapClick(e){ if(!mapQuizArmed||!q||!panel||panel.style.display==='none') return;
      if(typeof HOST.toolMode!=='undefined'&&HOST.toolMode) return;
      const f=countryAt(e.lngLat); const res=panel.querySelector('#edu-map-res'); if(!res) return;
      if(!f){ res.innerHTML='<span style="color:var(--text-muted);">'+(jp()?'陸地（国）をクリックしてください':'Click on a country')+'</span>'; return; }
      let id=null; try{ id=resolveCountryId(f); }catch(_){ }
      const ok=id&&q.answer.code===id; total++; if(ok){ score++; streak++; } else streak=0;
      mapQuizArmed=false;
      const got=(id&&countryStats[id])?countryStats[id]:null;
      res.innerHTML=card(q.answer,ok,(got&&!ok?'<div style="font-size:11px;">'+(jp()?'クリックした国: ':'You clicked: ')+esc(cname(got))+'</div>':''))+'<button class="ai-test-btn" id="edu-next2" style="width:100%;margin-top:8px;">'+(jp()?'次の問題 →':'Next →')+'</button>';
      const nx=panel.querySelector('#edu-next2'); if(nx) nx.onclick=next;
    }
    function closeP(){ if(panel) panel.style.display='none'; mapQuizArmed=false; }
    function openP(){ score=0; streak=0; total=0; menu(); }
    /* (#R30) The Tools button that used to open Quiz mode now opens the PLAYGROUND (Quiz lives INSIDE the
       Playground hub) — "Playground自体は…旧quiz modeの場所に / Quiz modeをplaygroundに移動". */
    function mount(){ if(document.getElementById('edu-mount')) return;
      const host=document.createElement('div'); host.id='edu-mount'; host.style.marginTop='6px';
      host.innerHTML='<button id="btn-edu" class="ai-test-btn" style="width:100%;">🎮 <span>'+(jp()?'プレイグラウンド':'Playground')+'</span></button>';
      const tools=document.getElementById('layer-tools'); const dd=document.getElementById('layer-dropdown');
      (tools||dd||document.body).appendChild(host);
      host.querySelector('#btn-edu').onclick=()=>{ try{ window._openPlayground&&window._openPlayground(); }catch(_){} };
      try{ window.reorganizeLayerPanel&&window.reorganizeLayerPanel(); }catch(_){} }
    if(map) map.on('click',onMapClick);
    if(document.readyState!=='loading') setTimeout(mount,500); else document.addEventListener('DOMContentLoaded',()=>setTimeout(mount,500));
    window.addEventListener('intmap-lang',()=>{ const b=document.getElementById('btn-edu'); if(b) b.innerHTML='🎮 <span>'+(jp()?'プレイグラウンド':'Playground')+'</span>'; });
    return { open:openP, close:closeP };
  })();
};
