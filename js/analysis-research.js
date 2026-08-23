import { personaPrompt } from './atlas-persona.js';   /* (#R285) WHO Atlas is — the ONE copy; see js/atlas-persona.js */
/* ============================================================================
 *  IntMap · Research brief — the implementation behind window.IntMapAIResearch  (#R315)
 * ----------------------------------------------------------------------------
 *  Fetched by js/lazy-modules.js the first time a place asks for a brief or for «ask AI about
 *  here». js/analysis-panels.js keeps the eager SHELL, which publishes window.IntMapAIResearch at
 *  boot; every door awaits `IntMapLazy.need('analysisResearch')` before it reaches this file.
 *
 *  The body is the block that used to live in js/analysis-panels.js, moved verbatim — including
 *  the two personaPrompt() call sites, which travelled with it (see tests/r285-checks.test.mjs).
 *  ⚠ The published global is `__imAnalysis…`, not `IntMap…`: js/atlas-controls.js discovers
 *  `window.IntMap*` by enumeration and would offer the planner a second, undispatched capability.
 * ==========================================================================*/
window.IntMapModules=window.IntMapModules||{};
window.IntMapModules.analysisResearch=function(HOST){
  const GE=()=>window.IntMapGeoEngine;   /* (#R178) the renderer, through the contract — never the raw handle */
  /* stable closure values (never reassigned) — rebound under their original names so the moved body stays verbatim */
  const aiGate=HOST.aiGate, t=HOST.t, makeDraggable=HOST.makeDraggable, askAI=HOST.askAI, countryStats=HOST.countryStats;
  window.__imAnalysisResearch=(function(){
    const jp=()=>HOST.lang==='jp';
    /* (#R39) 4-language helper so the brief panel's own UI follows the app language (DE/RU used to fall to EN). */
    const LL=window.IntMapLang.pick(()=>HOST.lang);   /* (#R40) +Spanish (falls back to EN when a 5th arg isn't supplied) */
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
    /* ══ (#R231) …and the belt to the prompt's braces ═══════════════════════════════════════════
       Drop a FIRST line that is only the subject's name — `# Tokyo`, `**Tokyo**`, `Tokyo:`, or the
       bare word — when the panel header directly above it already says it.
       ⚠ IT ONLY EVER REMOVES A LINE THAT IS THE NAME. The comparison strips markdown, punctuation
       and case, then requires equality, so "Tokyo Bay in 1905" and "## Background" both survive: a
       heuristic that trimmed anything CONTAINING the name would eat real content, and losing a
       sentence is a much worse failure than the duplicated word this removes. */
    function _dropLeadTitle(text,name){
      try{
        const key=(s)=>String(s||'').replace(/[*_#`>\s]/g,'').replace(/[:：・.,、。()（）"'“”「」]/g,'').toLowerCase();
        const want=key(name); if(!want) return text;
        const lines=String(text).split(/\r?\n/);
        let i=0; while(i<lines.length&&!lines[i].trim()) i++;
        if(i>=lines.length) return text;
        if(key(lines[i])!==want) return text;
        lines.splice(0,i+1);
        while(lines.length&&!lines[0].trim()) lines.shift();
        return lines.join('\n');
      }catch(_){ return text; }
    }
    function ensure(){ if(panel) return panel;
      panel=document.createElement('div'); panel.className='tool-panel'; panel.id='ai-research-panel';
      panel.style.cssText='display:none;position:absolute;top:70px;right:24px;left:auto;bottom:auto;z-index:1600;width:min(380px,calc(100vw - 24px));max-height:min(70vh,640px);overflow-y:auto;';
      (document.getElementById('map-container')||document.body).appendChild(panel);
      return panel; }
    async function open(name,lngLat){
      try{ if(typeof aiGate==='function'&&!aiGate()) return; }catch(_){}
      const p=ensure();
      p.style.display='block';
      p.innerHTML='<div class="tp-header" style="cursor:move;"><span class="tp-title">'+LL('Research: ','調査: ','Recherche: ','Исследование: ','Investigación: ')+esc(name)+'</span><button class="tp-close" title="'+t('close')+'">×</button></div>'+
        '<div id="air-body" style="font-size:12.5px;line-height:1.65;color:var(--text-main);padding:4px 2px;"><span style="color:var(--text-muted);">'+LL('Researching… (background, history, economy, military, recent developments)','調査中… (AIが背景・歴史・経済・軍事・最近の動向を整理しています)','Recherche… (Hintergrund, Geschichte, Wirtschaft, Militär, jüngste Entwicklungen)','Анализ… (история, экономика, военная и стратегическая значимость, последние события)','Investigando… (contexto, historia, economía, militar, novedades recientes)')+'</span></div>'+
        '<button id="air-again" class="ai-test-btn" style="width:100%;display:none;">↻ '+LL('Regenerate','再生成','Neu generieren','Сгенерировать заново','Regenerar')+'</button>';
      p.querySelector('.tp-close').onclick=()=>{ p.style.display='none'; };
      try{ makeDraggable(p,p.querySelector('.tp-header')); }catch(_){}
      const body=p.querySelector('#air-body');
      const news=lngLat?nearbyNews(lngLat):[];
      /* (#R21) Sharper brief: today's date is injected, every claim should carry a concrete year/
         date/figure, and "Recent developments" must prioritise the newest events the model knows +
         the supplied nearby headlines ("できるだけ日付などを記載する等具体的に。最新の動向を意識"). */
      const today=new Date().toISOString().slice(0,10);
      /* ══ (#R231) THE REPLY DOES NOT OPEN BY NAMING THE PLACE ═════════════════════════════════
         「AIリサーチをやった時に、返答の最初にその地名だけなぜか出すのが、不自然だからやらなくて
           いい。」 Nothing in this app was printing that line — the MODEL was. Asked to "write a
         brief on X", a chat model opens with `# X`, which lands directly under a panel whose header
         already reads "Research: X". Two lines, one word, twice.
         ⚠ IT IS FIXED IN BOTH PLACES, because a prompt is a request and not a guarantee: the system
         message says not to, and `_dropLeadTitle` below removes it if one arrives anyway. */
      const noTitle=(window.IntMapLang.t(HOST.lang," Do NOT open with a heading or bold line that merely repeats the place name — it is already on screen above your reply. Start straight with the content.","見出しや太字で場所の名前だけを繰り返す行を冒頭に置かないでください（画面に既に表示されています）。本文からすぐ始めてください。"," Beginnen Sie NICHT mit einer Überschrift oder Fettzeile, die nur den Ortsnamen wiederholt — er steht bereits über Ihrer Antwort auf dem Bildschirm. Fangen Sie direkt mit dem Inhalt an."," НЕ начинайте с заголовка или жирной строки, которая лишь повторяет название места — оно уже показано над вашим ответом. Сразу переходите к содержанию."," NO empiece con un título ni una línea en negrita que sólo repita el nombre del lugar: ya aparece en pantalla encima de su respuesta. Empiece directamente con el contenido."));
      const sys=personaPrompt('working here as the geopolitical and area-studies research desk of IntMap')+(jp()   /* (#R285) both branches opened with an identity sentence of their own */
        ?('本日は'+today+'です。事実に忠実に、簡潔な日本語で答えてください。可能な限り具体的な年・日付・数値（人口、GDP、兵力、距離など）を文中に入れてください。不確かな点は「未確認」と明記してください。'+noTitle)
        :('Today is '+today+'. Be factual and concise; include concrete years, dates and figures (population, GDP, troop counts, distances) wherever possible; clearly flag anything uncertain.'+noTitle))+window._aiLangLine();
      const prompt=(jp()
        ?('場所「'+name+'」'+(lngLat?('（座標: '+lngLat.lat.toFixed(2)+', '+lngLat.lng.toFixed(2)+'）'):'')+'について、以下の構成で簡潔なインテリジェンス・ブリーフを書いてください。\n## 概要・背景\n## 歴史（重要な出来事は年号つきで）\n## 経済（最新の数値・年を明記）\n## 軍事・戦略的意義\n## 最近の動向（直近1〜2年を最優先。出来事には日付や時期を明記）\n各セクション2〜4文。曖昧な一般論より、固有名詞・日付・数値を優先してください。')
        :('Write a concise intelligence brief on "'+name+'"'+(lngLat?(' (around '+lngLat.lat.toFixed(2)+', '+lngLat.lng.toFixed(2)+')'):'')+' with the sections:\n## Background\n## History (date the key events)\n## Economy (state the latest figures with their year)\n## Military & strategic significance\n## Recent developments (prioritize the last 1–2 years; date each event)\n2–4 sentences per section. Prefer named entities, dates and numbers over generalities.'))
        +(news.length?('\n\n'+(window.IntMapLang.t(HOST.lang,"Recent nearby news headlines — reflect these in \"Recent developments\":\n","参考: 周辺の最近のニュース見出し（「最近の動向」に反映すること）:\n","Aktuelle Schlagzeilen aus der Umgebung — in „Aktuelle Entwicklungen“ berücksichtigen:\n","Недавние заголовки новостей поблизости — учтите их в разделе «Последние события»:\n","Titulares recientes de la zona — reflejarlos en «Novedades recientes»:\n"))+news.map(s=>'- '+s).join('\n')):'');
      /* (#R22) The brief runs FIRST; the suggested-questions block is appended only AFTER it finishes
         ("Suggested questions は AI brief が終わってから最後に表示") — it used to render immediately. */
      try{
        const out=await askAI(prompt,sys);
        body.innerHTML=md(_dropLeadTitle(out||'',name))+'<div style="margin-top:10px;font-size:10px;color:var(--text-muted);">'+LL('AI-generated — verify with primary sources for important decisions.','AI生成 — 重要な判断には一次情報の確認を。','KI-generiert — bei wichtigen Entscheidungen mit Primärquellen prüfen.','Сгенерировано ИИ — для важных решений проверяйте по первоисточникам.','Generado por IA — verifique con fuentes primarias para decisiones importantes.')+'</div>';
      }catch(e){ body.innerHTML='<span style="color:#ff453a;">'+esc(e&&e.message||'AI error')+'</span>'; }
      const again=p.querySelector('#air-again'); again.style.display='block'; again.onclick=()=>open(name,lngLat);
      /* (#R21 beta) SUGGESTED QUESTIONS — auto-generated from the countries in the current viewport
         ("AIに聞く質問を、現在表示中の領域に基づいて自動生成") + a free-question box. Shown last. */
      try{
        let sug=p.querySelector('#air-sugg'); if(sug) sug.remove();
        sug=document.createElement('div'); sug.id='air-sugg'; sug.style.cssText='margin-top:10px;border-top:1px solid rgba(128,128,128,0.2);padding-top:8px;';
        const qs=suggestQs(name);
        sug.innerHTML='<div style="font-size:10.5px;color:var(--text-muted);margin-bottom:4px;">'+LL('Suggested questions','おすすめの質問','Vorgeschlagene Fragen','Предлагаемые вопросы','Preguntas sugeridas')+'</div>'+
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
          const ai=bubble('ai','<span style="color:var(--text-muted);">'+LL('Thinking…','回答中…','Denke nach…','Думаю…','Pensando…')+'</span>');
          convo.push('User: '+qq);
          try{ const ctx=(news.length?('\n\n'+(window.IntMapLang.t(HOST.lang,"Context — recent nearby headlines:\n","参考: 周辺の最近のニュース見出し:\n","Kontext — aktuelle Schlagzeilen aus der Umgebung:\n","Контекст — недавние заголовки поблизости:\n","Contexto — titulares recientes de la zona:\n"))+news.map(s=>'- '+s).join('\n')):'')+(convo.length>1?('\n\n'+(window.IntMapLang.t(HOST.lang,"Conversation so far:\n","これまでの会話:\n","Bisheriges Gespräch:\n","Разговор до этого момента:\n","Conversación hasta ahora:\n"))+convo.slice(-6).join('\n')):'');
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
      try{ const b=GE().camera.getBounds();
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
      const title=LL('Ask AI about here','ここをAIに聞く','KI zu diesem Ort fragen','Спросить ИИ об этом месте','Preguntar a la IA sobre este lugar');
      const examples=LL(
        ['Why is this area so sparsely populated?','Why is the border here shaped this way?','Why is this place strategically important?'],
        ['なぜこの辺りは人口が少ないの？','この国境はなぜこの形なの？','この場所が重要な理由は？'],
        ['Warum ist dieses Gebiet so dünn besiedelt?','Warum verläuft die Grenze hier so?','Warum ist dieser Ort strategisch wichtig?'],
        ['Почему здесь так мало населения?','Почему граница здесь такой формы?','Почему это место важно?']);
      p.innerHTML='<div class="tp-header" style="cursor:move;"><span class="tp-title">'+esc(title)+'</span><button class="tp-close" title="'+t('close')+'">×</button></div>'+
        '<div style="font-size:11px;color:var(--text-muted);margin:0 2px 8px;">📍 '+coordStr+'</div>'+
        '<div id="air-chat" style="display:flex;flex-direction:column;gap:8px;"></div>'+
        '<div style="font-size:10.5px;color:var(--text-muted);margin:10px 2px 4px;border-top:1px solid rgba(128,128,128,0.18);padding-top:8px;">'+LL('Try asking','質問の例','Beispiele','Примеры вопросов','Ejemplos de preguntas')+'</div>'+
        examples.map(e=>'<button class="ai-test-btn air-q" style="width:100%;text-align:left;margin:3px 0;font-size:11.5px;">'+esc(e)+'</button>').join('')+
        '<div class="air-inbar" style="display:flex;gap:8px;align-items:center;margin-top:8px;position:sticky;bottom:0;background:var(--popup-bg);padding:8px 0 4px;"><input class="air-free" type="text" placeholder="'+LL('Ask anything about this spot…','この地点について質問…','Frage zu diesem Ort…','Спросите об этом месте…','Pregunta lo que sea sobre este lugar…')+'" style="flex:1;min-width:0;height:38px;padding:0 14px;border-radius:19px;border:1px solid var(--glass-border,rgba(128,128,128,0.28));background:var(--input-bg);color:var(--text-main);font-size:12.5px;outline:none;box-sizing:border-box;"><button class="air-go" title="'+LL("Send","送信","Senden","Отправить","Enviar")+'" style="flex:0 0 auto;width:38px;height:38px;border-radius:50%;border:none;background:var(--primary-color);color:#fff;font-size:18px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V6M6 12l6-6 6 6"/></svg></button></div>';
      p.querySelector('.tp-close').onclick=()=>{ p.style.display='none'; };
      try{ makeDraggable(p,p.querySelector('.tp-header')); }catch(_){}
      const chat=p.querySelector('#air-chat'); const convo=[]; const news=nearbyNews(lngLat); const today=new Date().toISOString().slice(0,10);
      const sys=personaPrompt('answering here as the world-geography, history and geopolitics desk of IntMap')/* (#R285) */+'The user is asking about a SPECIFIC point on the map at latitude '+lngLat.lat.toFixed(4)+', longitude '+lngLat.lng.toFixed(4)+'. Today is '+today+'. First work out what is at or near that exact location (country, region, city, terrain, sea), then answer concisely and factually with concrete facts, figures and dates. If the point is ocean or uninhabited, say so plainly. Flag anything uncertain.'+window._aiLangLine();
      const bubble=(who,html)=>{ const d=document.createElement('div'); d.style.cssText=(who==='user'?'align-self:flex-end;max-width:88%;background:var(--primary-color);color:#fff;border-radius:14px 14px 5px 14px;':'align-self:flex-start;max-width:93%;background:var(--input-bg);color:var(--text-main);border-radius:14px 14px 14px 5px;')+'padding:8px 11px;font-size:12.5px;line-height:1.55;word-break:break-word;'; d.innerHTML=html; chat.appendChild(d); try{ p.scrollTop=p.scrollHeight; }catch(_){} return d; };
      const ask=async(qq)=>{ bubble('user',esc(qq));
        const ai=bubble('ai','<span style="color:var(--text-muted);">'+LL('Thinking…','回答中…','Denke nach…','Думаю…','Pensando…')+'</span>'); convo.push('User: '+qq);
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
