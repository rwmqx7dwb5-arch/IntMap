/* ============================================================================
 *  IntMap · Atlas AI transport, quota and settings  (#R169)
 * ----------------------------------------------------------------------------
 *  Moved VERBATIM out of the index.html DOMContentLoaded closure (Architecture.md §3.1).
 *  Every statement here is a DECLARATION — the factory runs no app code, so it can be
 *  instantiated with the other #R168/#R169 factories right after `map` exists.
 *  The only edit to the moved text is that free references to closure variables became
 *  HOST.<member> reads/writes.
 * ==========================================================================*/
window.IntMapModules=window.IntMapModules||{};
window.IntMapModules.aiCore=function(map,HOST){
  const saveAIConfig=()=>{ try{ localStorage.setItem('intmap_ai_config',JSON.stringify(HOST.aiConfig)); }catch(_){} };
  /* (#R27) Account-based AI: the first-party server proxy is ALWAYS configured (see INTMAP_AI_PROXY
     below), so the engine is always "ready" to RECEIVE a click. The real gate — login required + the
     per-day free quota — is enforced in aiGate() at click time and authoritatively re-checked on the
     server. Buttons therefore never appear greyed-out as "needs key" (BYOK is retired). */
  function aiReady(){ return (typeof aiProxyOn==='function') ? aiProxyOn() : true; }
  function aiVisionReady(){ return aiReady(); }
  function aiErrSnippet(txt){ try{ const j=JSON.parse(txt); return (j.error&&(j.error.message||j.error.code))||JSON.stringify(j).slice(0,180); }catch(_){ return String(txt||'').slice(0,180); } }
  function aiProxyOn(){ try{ return !!(window.INTMAP_AI_PROXY && window.INTMAP_AI_PROXY.url); }catch(_){ return false; } }
  const aiJP=()=>(typeof HOST.lang!=='undefined'&&HOST.lang==='jp');
  function aiToday(){ try{ return new Date().toISOString().slice(0,10); }catch(_){ return ''; } }
  /* (#R31) Developer = unlimited AI. Enabled by localStorage intmap_dev='1' or the owner's account email.
     This lifts the CLIENT-side gate; for a truly unlimited server quota, the ai-proxy function also grants
     the dev user id/email an unlimited plan (DEV_USER_IDS / DEV_EMAILS secret) — see DEV-NOTES. */
  function aiDev(){ try{ if(localStorage.getItem('intmap_dev')==='1') return true;
    /* (#R36) ROOT CAUSE of "開発者なのに無制限が設定欄のグラフに反映されない（まだ変わっていない）": the dev flag was
       only set by logging in with the owner email, but the developer runs this build LOCALLY (file:// or
       localhost) without logging in → aiDev() stayed false → the graph showed the 5/day quota. Treat the local
       dev environment itself as the developer context. The PUBLIC site is served from its real domain, so
       end-users on the deployed site are unaffected (their quota is unchanged). */
    const proto=location.protocol, h=location.hostname;
    if(proto==='file:'||h==='localhost'||h==='127.0.0.1'||h==='[::1]'||h===''){ try{ localStorage.setItem('intmap_dev','1'); }catch(_){} return true; }
    const e=(typeof HOST.user!=='undefined'&&HOST.user&&HOST.user.email)||''; return /2ppzc4kk6r@privaterelay\.appleid\.com/i.test(e); }catch(_){ return false; } }
  function aiDailyLimit(){ return (HOST.aiUsage && HOST.aiUsage.limit) || HOST.AI_FREE_DAILY; }
  function aiUsesLeft(){ if(aiDev()) return Infinity; if(HOST.aiUsage.date!==aiToday()) return aiDailyLimit(); return Math.max(0, aiDailyLimit() - (HOST.aiUsage.used||0)); }
  function aiSetUsage(used, limit){
    HOST.aiUsage.date=aiToday();
    if(typeof used==='number') HOST.aiUsage.used=used;
    if(typeof limit==='number' && limit>0) HOST.aiUsage.limit=limit;
    try{ aiRenderSettings(); }catch(_){}
  }
  function aiLoginMsg(){ return aiJP()?'AI機能を使うにはログインが必要です。':'Please log in to use AI features.'; }
  function aiLimitMsg(){ return aiJP()?'本日の無料AI使用回数に達しました。':'You have reached today’s free AI limit.'; }
  /* Fetch today's usage for the logged-in user (RLS lets a user read only their own row). Lets the
     gate block + the Settings panel show "残り N/5" BEFORE any AI request is spent. */
  async function aiFetchUsage(){
    try{
      if(!HOST.user || !window.sb){ return; }
      const { data } = await window.sb.from('ai_usage').select('count').eq('user_id',HOST.user.id).eq('usage_date',aiToday()).maybeSingle();
      aiSetUsage(data && typeof data.count==='number' ? data.count : 0, aiDailyLimit());
    }catch(_){}
  }
  /* The single click-time gate every AI feature runs FIRST. Extensible: future paid plans only need to
     raise the limit the server returns (aiUsage.limit) — no per-feature change. */
  function aiGate(){
    if(typeof HOST.user==='undefined' || !HOST.user){ try{ HOST.openAuthModal(aiLoginMsg()); }catch(_){ try{ aiToast(aiLoginMsg()); }catch(__){} } return false; }
    if(HOST.aiUsage.date===aiToday() && aiUsesLeft()<=0){ try{ aiToast(aiLimitMsg()); }catch(_){} return false; }
    return true;
  }
  /* (#R113) Map a typed PROVIDER error (ai-proxy 502/503) to a clear, localized message. These are DISTINCT from
     the IntMap daily free-use limit (HTTP 429) — a Google-side 429 must never be shown as "out of free uses". */
  function aiProviderErrMsg(code, message){
    const _pl=(en,jp,de,ru,es)=>HOST.lang==='jp'?jp:HOST.lang==='de'?de:HOST.lang==='ru'?ru:HOST.lang==='es'?(es||en):en;
    const M={
      provider_rate_limit:_pl('The AI service is busy right now — please try again in a moment (this is not your IntMap usage limit).','AIサービスが混雑しています。少し待って再試行してください（IntMapの利用回数上限ではありません）。','Der KI-Dienst ist gerade ausgelastet — bitte gleich erneut versuchen (nicht Ihr IntMap-Limit).','Сервис ИИ сейчас перегружен — повторите через мгновение (это не ваш лимит IntMap).','El servicio de IA está ocupado — inténtalo de nuevo en un momento (no es tu límite de IntMap).'),
      provider_quota:_pl('The AI provider quota was reached — this is separate from your IntMap free uses. Please try again later.','AIプロバイダ側の利用上限に達しました（あなたのIntMap無料利用枠とは別です）。後ほど再試行してください。','Das Kontingent des KI-Anbieters ist erschöpft — getrennt von Ihren IntMap-Freinutzungen. Später erneut versuchen.','Достигнут лимит провайдера ИИ — это отдельно от бесплатных использований IntMap. Повторите позже.','Se alcanzó la cuota del proveedor de IA — es independiente de tus usos gratuitos de IntMap. Inténtalo más tarde.'),
      provider_empty:_pl('The AI returned an empty response — please try again.','AIが空の応答を返しました。もう一度お試しください。','Die KI lieferte eine leere Antwort — bitte erneut versuchen.','ИИ вернул пустой ответ — повторите попытку.','La IA devolvió una respuesta vacía — inténtalo de nuevo.'),
      provider_malformed:_pl('The AI response was malformed — please try again.','AIの応答が不正な形式でした。もう一度お試しください。','Die KI-Antwort war fehlerhaft — bitte erneut versuchen.','Ответ ИИ был некорректным — повторите попытку.','La respuesta de la IA fue incorrecta — inténtalo de nuevo.'),
      provider_blocked:_pl('The AI safety filter blocked that. Try rephrasing it as a public-information, broad-area analysis (e.g. an approximate zone or reach rings for defence/preparedness) rather than precise targeting.','AIの安全フィルタによりブロックされました。正確な標的指定ではなく、公開情報に基づく広域の分析（例：おおよそのゾーンや到達圏の表示など、防災・脅威評価目的）として言い換えてお試しください。','Der KI-Sicherheitsfilter hat das blockiert. Formulieren Sie es als öffentlich-informationsbasierte, großräumige Analyse (z. B. eine ungefähre Zone oder Reichweitenringe für Verteidigung/Vorsorge) statt als präzise Zielerfassung.','Фильтр безопасности ИИ заблокировал это. Переформулируйте как анализ по открытым данным для широкой области (например, приблизительная зона или кольца досягаемости для обороны/готовности), а не точное целеуказание.','El filtro de seguridad de la IA lo bloqueó. Reformúlalo como un análisis de información pública y de área amplia (p. ej., una zona aproximada o anillos de alcance para defensa/preparación) en lugar de una localización precisa de objetivos.'),
      provider_unavailable:_pl('The AI service is temporarily unavailable — please try again shortly.','AIサービスが一時的に利用できません。少し後に再試行してください。','Der KI-Dienst ist vorübergehend nicht verfügbar — bitte gleich erneut versuchen.','Сервис ИИ временно недоступен — повторите вскоре.','El servicio de IA no está disponible temporalmente — inténtalo pronto.'),
      invalid_structured_output:_pl('The AI structured output was invalid — please try again.','AIの構造化出力が不正でした。もう一度お試しください。','Die strukturierte KI-Ausgabe war ungültig — bitte erneut versuchen.','Структурированный вывод ИИ был неверным — повторите попытку.','La salida estructurada de la IA no era válida — inténtalo de nuevo.')
    };
    return M[code] || ('AI: '+(message||code||'error'));
  }
  /* (#R132) FULL-envelope server call: returns {text, meta, citations} for a SINGLE call (no reliance on the global
     window._aiLastMeta, which a concurrent call can overwrite) and accepts opts.signal for real AbortController
     cancellation (a timed-out / cancelled region-resolution call now aborts the underlying fetch instead of leaving
     it running in the background). aiCallServer stays a thin text-only wrapper so every existing caller is unchanged. */
  async function aiCallServerFull(prompt, system, imgs, opts){
    const cfg=window.INTMAP_AI_PROXY||{};
    const headers={'Content-Type':'application/json'};
    if(cfg.headerName && cfg.headerValue) headers[cfg.headerName]=cfg.headerValue;
    /* Attach the Supabase session JWT + anon apikey so the function can identify the user + enforce quota. */
    let token='';
    try{ const r=await window.sb.auth.getSession(); token=(r&&r.data&&r.data.session&&r.data.session.access_token)||''; }catch(_){}
    if(window.SUPABASE_ANON_KEY){ headers['apikey']=window.SUPABASE_ANON_KEY; if(!token) headers['Authorization']='Bearer '+window.SUPABASE_ANON_KEY; }
    if(token) headers['Authorization']='Bearer '+token;
    const body={ prompt, system:system||'', images:(imgs||[]), lang:(typeof HOST.lang!=='undefined'?HOST.lang:'en') };
    /* (#R113) task-aware contract: tell the proxy WHICH feature this is (output budget / JSON+structured-output
       mode / web policy are chosen per-task server-side) instead of one MAX_TOKENS + one boolean for everything. */
    if(opts){
      if(opts.task) body.task=String(opts.task);
      /* webMode: 'off' | 'auto' | 'required'. Back-compat: a bare {web:true} maps to 'auto'. */
      body.webMode = opts.webMode ? String(opts.webMode) : (opts.web ? 'auto' : 'off');
      if(body.webMode!=='off') body.web=true;   /* keep the legacy boolean in sync for the Anthropic native-search path */
      if(opts.requestedCount!=null && isFinite(+opts.requestedCount)) body.requestedCount=+opts.requestedCount;
      if(opts.schema && typeof opts.schema==='object') body.schema=opts.schema;
      if(opts.effortHint) body.effortHint=String(opts.effortHint);   /* (#R117) complexity hint → planner/analysis may think at "high" server-side */
      if(opts.imageDetail) body.imageDetail=String(opts.imageDetail);   /* (#R156) "high" → OpenAI input_image detail:high (small-text/math OCR); server clamps by task */
    }
    const fetchOpts={method:'POST',headers,body:JSON.stringify(body)};
    if(opts&&opts.signal) fetchOpts.signal=opts.signal;   /* (#R132) real Abort */
    const r=await fetch(cfg.url,fetchOpts);
    if(r.status===401){ try{ HOST.openAuthModal(aiLoginMsg()); }catch(_){} throw new Error(aiLoginMsg()); }
    if(r.status===429){ let j=null; try{ j=await r.json(); }catch(_){} if(j&&typeof j.used==='number') aiSetUsage(j.used, j.limit); else { HOST.aiUsage.date=aiToday(); HOST.aiUsage.used=aiDailyLimit(); } throw new Error(aiLimitMsg()); }
    if(!r.ok){
      /* (#R113) a typed PROVIDER error (502/503) is NOT the IntMap daily limit — surface a clear, distinct message
         (and never mislabel a Google-side 429 as "out of free uses"). */
      let ej=null; try{ ej=await r.json(); }catch(_){}
      if(ej&&ej.error) throw new Error(aiProviderErrMsg(ej.error, ej.message));
      throw new Error('AI '+r.status+': '+aiErrSnippet(await r.text().catch(()=>'')));
    }
    const j=await r.json().catch(()=>null);
    if(j==null) return {text:'',meta:null,citations:[]};
    if(typeof j.used==='number') aiSetUsage(j.used, j.limit);
    const meta=(j&&typeof j==='object'&&j.meta&&typeof j.meta==='object')?j.meta:null;
    const citations=(j&&typeof j==='object'&&Array.isArray(j.citations))?j.citations:[];
    /* (#R114/#R131) still mirror to the globals for the many existing readers, but the ENVELOPE is authoritative per call. */
    try{ window._aiLastMeta=meta; }catch(_){}
    try{ window._aiLastCitations=citations; }catch(_){}
    let text='';
    if(typeof j==='string') text=j;
    else if(typeof j.text==='string') text=j.text;
    else if(j.content&&Array.isArray(j.content)) text=j.content.map(b=>b.text||'').join('');
    else if(j.choices&&j.choices[0]) text=(j.choices[0].message&&j.choices[0].message.content)||j.choices[0].text||'';
    return {text, meta, citations};
  }
  async function aiCallServer(prompt, system, imgs, opts){ return (await aiCallServerFull(prompt, system, imgs, opts)).text; }
  /* ---- Unified entry point used by every AI feature ---- */
  async function askAI(prompt, systemPrompt, imageDatas, opts){
    const imgs=(imageDatas||[]).filter(Boolean);
    /* Account-based path (always on). Gate first so we never spend a network round-trip when the user
       is logged out / over quota, and so the auth modal opens immediately. */
    if(!HOST.user){ try{ HOST.openAuthModal(aiLoginMsg()); }catch(_){} throw new Error(aiLoginMsg()); }
    if(HOST.aiUsage.date===aiToday() && aiUsesLeft()<=0){ throw new Error(aiLimitMsg()); }
    if(aiProxyOn()) return aiCallServer(prompt, systemPrompt, imgs, opts);
    throw new Error(aiLimitMsg());
  }
  async function askAIJSON(prompt, systemPrompt, imageDatas, opts){ opts=opts||{}; if(!opts.task) opts.task='json_extract';   /* (#R113) JSON call → server JSON/structured-output mode by default */
    return aiParseJSON(await askAI(prompt, systemPrompt, imageDatas, opts)); }
  /* (#R132) ENVELOPE variants — same gating as askAI/askAIJSON but return {text|data, meta, citations} for a SINGLE
     call (no reliance on the global window._aiLastMeta a concurrent call could clobber) and forward opts.signal for
     real AbortController cancellation. Used by the region resolver so one resolve reads exactly its own meta/citations. */
  async function askAIEnvelope(prompt, systemPrompt, imageDatas, opts){
    const imgs=(imageDatas||[]).filter(Boolean);
    if(!HOST.user){ try{ HOST.openAuthModal(aiLoginMsg()); }catch(_){} throw new Error(aiLoginMsg()); }
    if(HOST.aiUsage.date===aiToday() && aiUsesLeft()<=0){ throw new Error(aiLimitMsg()); }
    if(aiProxyOn()) return aiCallServerFull(prompt, systemPrompt, imgs, opts);
    throw new Error(aiLimitMsg()); }
  async function askAIJSONEnvelope(prompt, systemPrompt, imageDatas, opts){ opts=opts||{}; if(!opts.task) opts.task='json_extract';
    const env=await askAIEnvelope(prompt, systemPrompt, imageDatas, opts);
    return { data:aiParseJSON(env.text), text:env.text, meta:env.meta, citations:env.citations }; }
  function aiParseJSON(raw){
    if(raw==null) return null;
    let s=String(raw).trim();
    const fence=s.match(/```(?:json)?\s*([\s\S]*?)```/i); if(fence) s=fence[1].trim();
    const seg=s.match(/[\[{][\s\S]*[\]}]/); if(seg) s=seg[0];
    try{ return JSON.parse(s); }catch(_){ try{ return JSON.parse(s.replace(/,\s*([\]}])/g,'$1')); }catch(__){ return null; } }
  }
  /* ---- Shared UI: toast + report popup (used by all four features) ---- */
  function aiToast(msg){
    let el=document.getElementById('ai-toast');
    if(!el){ el=document.createElement('div'); el.id='ai-toast'; el.className='sat-toast'; document.body.appendChild(el); }
    el.textContent=msg; el.classList.add('show');
    clearTimeout(aiToast._t); aiToast._t=setTimeout(()=>el.classList.remove('show'),4600);
  }
  function aiEsc(s){ return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
  /* Generic report popup. opts:{title, sub, images:[{src,caption}]}. Returns an api
     with setLoading()/setBody(text)/setError(msg,onRetry)/close(). */
  function aiReport(opts){
    opts=opts||{};
    let ov=document.getElementById('ai-report-modal');
    if(!ov){ ov=document.createElement('div'); ov.id='ai-report-modal'; ov.className='modal-overlay'; document.body.appendChild(ov);
      ov.addEventListener('click',e=>{ if(e.target===ov) ov.style.display='none'; }); }
    const imgsHtml=(opts.images&&opts.images.length)?`<div class="ai-report-imgs">${opts.images.map(im=>`<figure><img src="${aiEsc(im.src)}">${im.caption?`<figcaption>${aiEsc(im.caption)}</figcaption>`:''}</figure>`).join('')}</div>`:'';
    ov.innerHTML=`<div class="modal-content">
      <div class="ai-report-head">✨ <span>${aiEsc(opts.title||'AI')}</span></div>
      ${opts.sub?`<div class="ai-report-sub">${aiEsc(opts.sub)}</div>`:''}
      ${imgsHtml}
      <div class="ai-report-body loading" id="ai-report-body"><span class="ai-spin"></span><span>${aiEsc(HOST.t('aiThinking'))}</span></div>
      <div class="ai-report-actions" id="ai-report-actions"></div>
    </div>`;
    ov.style.display='flex';
    const bodyEl=ov.querySelector('#ai-report-body'), actEl=ov.querySelector('#ai-report-actions');
    const api={
      el:ov,
      close(){ ov.style.display='none'; },
      setLoading(msg){ bodyEl.className='ai-report-body loading'; bodyEl.innerHTML=`<span class="ai-spin"></span><span>${aiEsc(msg||HOST.t('aiThinking'))}</span>`; actEl.innerHTML=''; },
      setBody(text){ bodyEl.className='ai-report-body'; bodyEl.textContent=String(text||'');
        actEl.innerHTML=`<button id="ai-rep-copy">${aiEsc(HOST.t('aiCopy'))}</button><button class="primary" id="ai-rep-close">${aiEsc(HOST.t('aiClose'))}</button>`;
        actEl.querySelector('#ai-rep-close').onclick=api.close;
        actEl.querySelector('#ai-rep-copy').onclick=ev=>{ try{ navigator.clipboard.writeText(String(text||'')); ev.target.textContent=HOST.t('aiCopied'); }catch(_){} };
      },
      setError(msg,onRetry){ bodyEl.className='ai-report-body'; bodyEl.innerHTML=`<span style="color:#ff453a">⚠ ${aiEsc(HOST.t('aiError'))}</span><br><span style="font-size:12px;color:var(--text-muted)">${aiEsc(msg||'')}</span>`;
        actEl.innerHTML=(onRetry?`<button id="ai-rep-retry">${aiEsc(HOST.t('aiRetry'))}</button>`:'')+`<button class="primary" id="ai-rep-close">${aiEsc(HOST.t('aiClose'))}</button>`;
        actEl.querySelector('#ai-rep-close').onclick=api.close;
        const rb=actEl.querySelector('#ai-rep-retry'); if(rb) rb.onclick=()=>{ api.setLoading(); onRetry(); };
      }
    };
    return api;
  }
  /* ---- (#R27) Settings modal: AI section — account-based, NO key/provider/model picker ----
     Built-in AI: nothing to configure. We only show login state + today's free-use counter. */
  function aiRenderSettings(){
    const wrap=document.getElementById('ai-settings-body'); if(!wrap) return;
    const jp=aiJP();
    /* (#R34) DEV = UNLIMITED — check this FIRST. It used to sit BELOW the "not logged in" early-return, so a
       developer (intmap_dev flag, or logged in but currentUser not yet populated) saw the login prompt instead
       of the unlimited state ("開発者なので無制限に / 設定欄のグラフに反映されていない"). */
    if(aiDev()){
      wrap.innerHTML=
        /* (#R101) the "✨ Built-in AI is ready…" line duplicated the section hint above — removed (de-dup + no ✨). */
        `<div class="ai-row" style="font-size:13px;color:var(--text-main);font-weight:600;">`+
          aiEsc(jp?'開発者アカウント — AI利用は無制限です。':'Developer account — unlimited AI usage.')+
          `<div style="height:7px;border-radius:5px;background:var(--input-bg);overflow:hidden;margin-top:8px;"><div style="height:100%;width:100%;background:linear-gradient(90deg,#34c759,#0a84ff);"></div></div>`+
        `</div>`;
      return;
    }
    if(typeof HOST.user==='undefined' || !HOST.user){
      wrap.innerHTML=
        /* (#R33) The in-Settings "Log in / Sign up" button was removed as redundant (use the account button
           top-right). Only the explanatory line remains. */
        `<div class="ai-row" style="font-size:12px;color:var(--text-muted);line-height:1.5;">`+
          aiEsc(jp?'AI機能（要約・翻訳・位置解析・画像比較など）は、右上のアカウントからログインすると無料でご利用いただけます（1日'+HOST.AI_FREE_DAILY+'回まで）。APIキーは不要です。'
                  :'AI features (summaries, translation, locating, image compare…) are free once you log in from the account button (top-right) — up to '+HOST.AI_FREE_DAILY+' uses per day. No API key needed.')+
        `</div>`;
      return;
    }
    const left=aiUsesLeft(), lim=aiDailyLimit(), used=Math.max(0, lim-left);
    const pct=lim>0?Math.round((used/lim)*100):0;
    const bar=`<div style="height:7px;border-radius:5px;background:var(--input-bg);overflow:hidden;margin-top:8px;"><div style="height:100%;width:${pct}%;background:${left>0?'var(--primary-color)':'#ff453a'};transition:width .25s;"></div></div>`;
    wrap.innerHTML=
      /* (#R101) the "✨ Built-in AI is ready…" line duplicated the section hint above — removed (de-dup + no ✨). */
      `<div class="ai-row" style="font-size:13px;color:var(--text-main);font-weight:600;">`+
        aiEsc(jp?('本日の無料利用： 残り '+left+' / '+lim+' 回')
                :('Today’s free uses: '+left+' / '+lim+' left'))+
        bar+
        (left<=0?`<div style="font-size:11.5px;color:#ff453a;margin-top:7px;font-weight:500;">`+aiEsc(aiLimitMsg())+`</div>`:'')+
      `</div>`;
  }
  function aiSaveSettings(){ saveAIConfig(); try{ aiSyncFeatureButtons(); }catch(_){} }
  function aiSyncFeatureButtons(){ HOST.aiButtonSyncers.forEach(fn=>{ try{ fn(); }catch(_){} }); }
  /* Toggle a busy spinner + disabled state on an .ai-action-btn (shared by all features). */
  function aiSetBtnBusy(btn,busy,label){
    if(!btn) return;
    if(busy){ if(!btn.dataset.olabel) btn.dataset.olabel=btn.textContent; btn.disabled=true; btn.innerHTML='<span class="ai-spin"></span><span>'+aiEsc(label||btn.dataset.olabel)+'</span>'; }
    else { btn.disabled=false; if(btn.dataset.olabel!=null){ btn.textContent=btn.dataset.olabel; delete btn.dataset.olabel; } }
  }
  /* (#R171) through the engine's event contract — this file no longer names the renderer at all. */
  function aiWaitMapIdle(timeout){ return new Promise(res=>{ const E=window.IntMapGeoEngine; if(!E){ res(); return; } let done=false;
    const fin=()=>{ if(done)return; done=true; try{ E.events.off('idle',fin); }catch(_){} res(); };
    try{ E.events.on('idle',fin); }catch(_){ } setTimeout(fin,timeout||4500); }); }
  return { aiDev, aiEsc, aiFetchUsage, aiGate, aiLimitMsg, aiLoginMsg, aiParseJSON, aiReady, aiRenderSettings, aiReport, aiSaveSettings, aiSetBtnBusy, aiSyncFeatureButtons, aiToast, aiToday, aiUsesLeft, aiVisionReady, aiWaitMapIdle, askAI, askAIJSON, askAIJSONEnvelope };
};
