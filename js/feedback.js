/* ============================================================================
 *  IntMap · Feedback & bug-report modals  (#R167)
 * ----------------------------------------------------------------------------
 *  Two user-facing report surfaces: the star-rated feedback form and the bug reporter that
 *  attaches a diagnostics snapshot (_imDiag). Both post to Supabase through HOST.DB.
 *  HOST.DB is read at USE time, never at factory time: `const DB` is declared far below this
 *  block's call site, so binding it up front would hit its temporal dead zone.
 *  _imDiag() reports the live theme / tab / projection / basemap, so those four read through
 *  the host too — a captured copy would report whatever the app looked like at boot.
 * ==========================================================================*/

window.IntMapModules=window.IntMapModules||{};

window.IntMapModules.feedback=function(map,HOST){
  const escapeHtml=HOST.escapeHtml, isMobile=HOST.isMobile;
  /* ===== (#R20) Feedback — 5-star + free text, stored in Supabase (`feedback` table,
     supabase_feedback.sql; admins read it in admin.html). 4–5 stars → thank-you + a gentle
     donation ask (Stripe link, fully declinable); 1–3 stars → a plain thank-you. ===== */
  (function(){
    const jp=()=>HOST.lang==='jp';
    let modal=null, rating=0, cat='general';
    /* (#R30) feedback categories — make every note actionable. Bug → offer the diagnostic Bug Reporter. */
    /* (#R33) "Praise" category removed; category is now an iOS pulldown (chips truncated on mobile). */
    const CATS=[['general',{en:'General',jp:'全般'}],['idea',{en:'Feature idea',jp:'要望'}],['bug',{en:'Bug',jp:'不具合'}]];
    function ensure(){ if(modal) return modal;
      modal=document.createElement('div'); modal.className='modal-overlay'; modal.id='feedback-modal';
      modal.style.cssText='display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:5200;align-items:center;justify-content:center;padding:20px;';
      modal.innerHTML='<div style="background:var(--card-bg);color:var(--text-main);border-radius:16px;box-shadow:var(--shadow);padding:22px 24px;width:100%;max-width:400px;max-height:92vh;overflow-y:auto;box-sizing:border-box;position:relative;" id="fb-card"></div>';
      document.body.appendChild(modal);
      modal.addEventListener('click',(e)=>{ if(e.target===modal) closeM(); });
      return modal; }
    function star(n){ return '<button class="fb-star" data-n="'+n+'" style="background:none;border:none;font-size:30px;cursor:pointer;padding:2px 3px;line-height:1;color:'+(n<=rating?'#ffcc00':'rgba(128,128,128,0.45)')+';">'+(n<=rating?'★':'☆')+'</button>'; }
    function renderForm(){ const c=modal.querySelector('#fb-card'); const loggedOut=!(typeof HOST.user!=='undefined'&&HOST.user);
      c.innerHTML='<button id="fb-x" style="position:absolute;top:10px;right:10px;width:32px;height:32px;border:none;border-radius:9px;background:var(--input-bg);color:var(--text-main);font-size:16px;cursor:pointer;">✕</button>'+
        '<h3 style="margin:0 0 6px;font-size:17px;">'+(jp()?'フィードバックを送る':'Send feedback')+'</h3>'+
        '<p style="margin:0 0 12px;color:var(--text-muted);font-size:12.5px;line-height:1.5;">'+(jp()?'IntMapの評価と、ご意見・ご要望をお聞かせください。':'Rate IntMap and tell us what to improve.')+'</p>'+
        '<div style="font-size:11.5px;font-weight:600;color:var(--text-muted);margin:0 0 6px;">'+(jp()?'種類':'Type')+'</div>'+
        '<select id="fb-cat" style="width:100%;box-sizing:border-box;margin-bottom:12px;padding:10px 12px;border-radius:10px;border:1px solid rgba(128,128,128,0.25);background:var(--input-bg);color:var(--text-main);font-size:13px;font-weight:600;cursor:pointer;">'+CATS.map(([k,l])=>'<option value="'+k+'"'+(cat===k?' selected':'')+'>'+l[jp()?'jp':'en']+'</option>').join('')+'</select>'+
        (cat==='bug'?'<div id="fb-bughint" style="background:rgba(255,149,0,0.12);border:1px solid rgba(255,149,0,0.3);border-radius:9px;padding:9px 11px;margin-bottom:12px;font-size:11.5px;line-height:1.45;">'+(jp()?'不具合は、診断情報を自動添付する<b>バグレポート</b>からの送信がおすすめです。':'For bugs, the <b>Bug Reporter</b> auto-attaches diagnostics.')+' <button id="fb-openbug" style="border:none;background:none;color:var(--primary-color);font-weight:700;cursor:pointer;padding:0;font-size:11.5px;">'+(jp()?'開く →':'Open it →')+'</button></div>':'')+
        '<div style="font-size:11.5px;font-weight:600;color:var(--text-muted);margin:0 0 4px;">'+(jp()?'評価':'Rating')+'</div>'+
        '<div id="fb-stars" style="display:flex;justify-content:center;margin-bottom:12px;">'+[1,2,3,4,5].map(star).join('')+'</div>'+
        '<textarea id="fb-text" maxlength="3000" placeholder="'+(jp()?'ご意見・ご要望（任意）':'Comments (optional)')+'" style="width:100%;box-sizing:border-box;min-height:96px;resize:vertical;padding:10px 12px;border-radius:10px;border:1px solid rgba(128,128,128,0.25);background:var(--input-bg);color:var(--text-main);font-size:13px;outline:none;font-family:inherit;"></textarea>'+
        (loggedOut?'<input id="fb-email" type="email" placeholder="'+(jp()?'メール（任意・返信用）':'Email (optional, for a reply)')+'" style="width:100%;box-sizing:border-box;margin-top:9px;padding:10px 12px;border-radius:10px;border:1px solid rgba(128,128,128,0.25);background:var(--input-bg);color:var(--text-main);font-size:13px;outline:none;">':'')+
        '<button id="fb-send" style="width:100%;margin-top:12px;padding:11px;border:none;border-radius:10px;background:var(--primary-color);color:#fff;font-size:14px;font-weight:700;cursor:pointer;">'+(jp()?'送信':'Submit')+'</button>'+
        '<p id="fb-msg" style="margin:10px 0 0;font-size:12px;color:var(--text-muted);min-height:14px;text-align:center;"></p>';
      c.querySelector('#fb-x').onclick=closeM;
      { const cs=c.querySelector('#fb-cat'); if(cs) cs.onchange=()=>{ cat=cs.value; renderForm(); }; }
      const ob=c.querySelector('#fb-openbug'); if(ob) ob.onclick=()=>{ closeM(); try{ window._openBugReport&&window._openBugReport(); }catch(_){} };
      c.querySelectorAll('.fb-star').forEach(b=>b.onclick=()=>{ rating=+b.getAttribute('data-n'); renderForm(); });
      c.querySelector('#fb-send').onclick=submit; }
    async function submit(){ const c=modal.querySelector('#fb-card'); const msg=c.querySelector('#fb-msg');
      if(!rating){ msg.textContent=jp()?'星の数を選んでください。':'Please pick a star rating.'; return; }
      const text=(c.querySelector('#fb-text').value||'').trim();
      const emailIn=c.querySelector('#fb-email'); const enteredEmail=emailIn?(emailIn.value||'').trim():'';
      const catEN=(CATS.find(x=>x[0]===cat)||[,{en:'General'}])[1].en;
      const comment=('['+catEN+'] '+text).trim();   /* category embedded so it stores without a schema change */
      const btn=c.querySelector('#fb-send'); btn.disabled=true; btn.textContent=jp()?'送信中…':'Sending…';
      let ok=false;
      try{ if(typeof HOST.DB!=='undefined'&&HOST.DB){
        const row={ rating, comment:comment||null, lang:HOST.lang, ua:(navigator.userAgent||'').slice(0,250), page:location.pathname };
        try{ if(typeof HOST.user!=='undefined'&&HOST.user){ row.user_id=HOST.user.id; row.email=HOST.user.email||null; } else if(enteredEmail) row.email=enteredEmail; }catch(_){}
        const {error}=await HOST.DB.from('feedback').insert(row); ok=!error;
      } }catch(_){}
      if(!ok){ btn.disabled=false; btn.textContent=jp()?'送信':'Submit'; msg.textContent=jp()?'送信できませんでした。時間をおいてもう一度お試しください。':'Could not send — please try again later.'; return; }
      if(rating>=4) renderThanksHigh(); else renderThanksLow(); }
    function renderThanksLow(){ const c=modal.querySelector('#fb-card');
      c.innerHTML='<div style="text-align:center;padding:8px 0 2px;"><div style="font-size:34px;margin-bottom:8px;">🙏</div>'+
        '<h3 style="margin:0 0 8px;font-size:17px;">'+(jp()?'フィードバックありがとうございます':'Thank you for your feedback')+'</h3>'+
        '<p style="margin:0 0 16px;color:var(--text-muted);font-size:13px;line-height:1.6;">'+(jp()?'いただいたご意見は今後の改善に役立てます。':'We read every note and use it to improve IntMap.')+'</p>'+
        '<button id="fb-done" style="padding:10px 26px;border:none;border-radius:10px;background:var(--input-bg);color:var(--text-main);font-size:13.5px;font-weight:600;cursor:pointer;">'+(jp()?'閉じる':'Close')+'</button></div>';
      c.querySelector('#fb-done').onclick=closeM; }
    function renderThanksHigh(){ const c=modal.querySelector('#fb-card');
      c.innerHTML='<div style="text-align:center;padding:8px 0 2px;"><div style="font-size:34px;margin-bottom:8px;">💙</div>'+
        '<h3 style="margin:0 0 8px;font-size:17px;">'+(jp()?'ありがとうございます！':'Thank you!')+'</h3>'+
        '<p style="margin:0 0 16px;color:var(--text-muted);font-size:13px;line-height:1.6;">'+(jp()?'高い評価をいただき励みになります。もしよろしければ、IntMapの開発・運営をご支援いただけると嬉しいです。':'Your high rating means a lot. If you enjoy IntMap, you can support its development — entirely optional.')+'</p>'+
        '<a id="fb-donate" href="'+window.stripeDonateURL()+'" target="_blank" rel="noopener" style="display:block;padding:12px;border-radius:10px;background:var(--primary-color);color:#fff;font-size:14px;font-weight:700;text-decoration:none;margin-bottom:8px;">'+(jp()?'支援する':'Support IntMap')+'</a>'+
        '<button id="fb-later" style="width:100%;padding:10px;border:none;border-radius:10px;background:var(--input-bg);color:var(--text-main);font-size:13px;font-weight:600;cursor:pointer;">'+(jp()?'また今度':'Maybe later')+'</button></div>';
      c.querySelector('#fb-later').onclick=closeM;
      const dn=c.querySelector('#fb-donate');
      if(dn) dn.addEventListener('click',()=>{ try{ if(typeof HOST.DB!=='undefined'&&HOST.DB&&typeof HOST.user!=='undefined'&&HOST.user){ HOST.DB.from('donations').insert({user_id:HOST.user.id,email:HOST.user.email||null,locale:HOST.lang,source:'feedback_upsell',status:'initiated'}); } }catch(_){} setTimeout(closeM,400); }); }
    function openM(){ ensure(); rating=0; cat='general'; renderForm(); modal.style.display='flex'; }
    function closeM(){ if(modal) modal.style.display='none'; }
    window._openFeedback=openM;
  })();

  /* ===== (#R29.1) BUG REPORT system =====
     A one-tap reporter that auto-captures diagnostics (build, theme, language, viewport, current mode,
     active layers, the recent-error ring buffer, UA) and submits to Supabase `bug_reports`
     (supabase_bug_reports.sql; admins read it in admin.html). Degrades gracefully: if the DB/insert
     fails it stores locally AND copies the full report to the clipboard so nothing is ever lost. */
  function _imDiag(){
    const d={ build:window.INTMAP_BUILD||'?', when:new Date().toISOString(), lang:(typeof HOST.lang!=='undefined'?HOST.lang:'?'),
      theme:(typeof HOST.userTheme!=='undefined'?HOST.userTheme:'?'), mode:(typeof HOST.mode!=='undefined'?HOST.mode:null),
      viewport:(innerWidth+'x'+innerHeight), dpr:(window.devicePixelRatio||1), mobile:(typeof isMobile==='function'?isMobile():null),
      proj:(typeof HOST.proj!=='undefined'?HOST.proj:null), mapType:(typeof HOST.mapType!=='undefined'?HOST.mapType:null),
      ua:(navigator.userAgent||'').slice(0,250), errors:(window.__imErrors||[]).slice(-12) };
    try{ d.layers=Array.from(document.querySelectorAll('#layer-dropdown input[type=checkbox]:checked')).map(cb=>{ const l=cb.closest('label')||cb.closest('.lyr-row'); const sp=l&&l.querySelector('span'); return (sp?sp.textContent:cb.id||'?').trim(); }).filter(Boolean).slice(0,40); }catch(_){ d.layers=[]; }
    /* (#R171) camera through IntMapGeoEngine — this file no longer names the renderer. */
    try{ const E=window.IntMapGeoEngine, c=E&&E.camera.getCenter(); d.view=c?[+c.lng.toFixed(3),+c.lat.toFixed(3),+E.camera.getZoom().toFixed(2)]:null; }catch(_){}
    return d;
  }
  (function(){
    const jp=()=>HOST.lang==='jp';
    let modal=null;
    function ensure(){ if(modal) return modal;
      modal=document.createElement('div'); modal.className='modal-overlay'; modal.id='bug-modal';
      modal.style.cssText='display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:5200;align-items:center;justify-content:center;padding:20px;';
      modal.innerHTML='<div style="background:var(--card-bg);color:var(--text-main);border-radius:16px;box-shadow:var(--shadow);padding:22px 24px;width:100%;max-width:420px;box-sizing:border-box;position:relative;max-height:88dvh;overflow-y:auto;" id="bug-card"></div>';
      document.body.appendChild(modal);
      modal.addEventListener('click',(e)=>{ if(e.target===modal) close(); });
      return modal; }
    function cats(){ return jp()
      ? [['ui','UI・表示'],['map','地図・レイヤー'],['news','ニュース'],['ai','AI機能'],['account','アカウント・ログイン'],['perf','動作が重い・落ちる'],['other','その他']]
      : [['ui','UI / display'],['map','Map & layers'],['news','News'],['ai','AI features'],['account','Account / login'],['perf','Performance / crash'],['other','Other']]; }
    function renderForm(){ const c=modal.querySelector('#bug-card'); const diag=_imDiag();
      c.innerHTML='<button id="bug-x" style="position:absolute;top:10px;right:10px;width:32px;height:32px;border:none;border-radius:9px;background:var(--input-bg);color:var(--text-main);font-size:16px;cursor:pointer;">✕</button>'+
        '<h3 style="margin:0 0 6px;font-size:17px;">🐞 '+(jp()?'バグを報告':'Report a bug')+'</h3>'+
        '<p style="margin:0 0 12px;color:var(--text-muted);font-size:12.5px;line-height:1.5;">'+(jp()?'不具合の内容をできるだけ具体的に教えてください。再現手順があると助かります。':'Describe what went wrong — steps to reproduce help a lot.')+'</p>'+
        '<select id="bug-cat" style="width:100%;box-sizing:border-box;margin-bottom:10px;padding:9px 11px;border-radius:10px;border:1px solid rgba(128,128,128,0.25);background:var(--input-bg);color:var(--text-main);font-size:13px;">'+cats().map(c=>'<option value="'+c[0]+'">'+c[1]+'</option>').join('')+'</select>'+
        '<textarea id="bug-text" maxlength="3000" placeholder="'+(jp()?'例: モバイルで○○を押すと△△になる…':'e.g. On mobile, tapping X causes Y…')+'" style="width:100%;box-sizing:border-box;min-height:110px;resize:vertical;padding:10px 12px;border-radius:10px;border:1px solid rgba(128,128,128,0.25);background:var(--input-bg);color:var(--text-main);font-size:13px;outline:none;font-family:inherit;"></textarea>'+
        '<details style="margin-top:10px;"><summary style="cursor:pointer;font-size:12px;color:var(--text-muted);">'+(jp()?'添付される診断情報':'Diagnostics attached')+'</summary>'+
          '<pre style="white-space:pre-wrap;word-break:break-word;font-size:10.5px;color:var(--text-muted);background:var(--input-bg);border-radius:8px;padding:9px;margin:8px 0 0;max-height:150px;overflow:auto;">'+escapeHtml(JSON.stringify(diag,null,1))+'</pre></details>'+
        '<button id="bug-send" style="width:100%;margin-top:12px;padding:11px;border:none;border-radius:10px;background:var(--primary-color);color:#fff;font-size:14px;font-weight:700;cursor:pointer;">'+(jp()?'送信':'Submit report')+'</button>'+
        '<button id="bug-copy" style="width:100%;margin-top:8px;padding:9px;border:1px solid rgba(128,128,128,0.25);border-radius:10px;background:var(--input-bg);color:var(--text-main);font-size:12.5px;font-weight:600;cursor:pointer;">'+(jp()?'内容をコピー':'Copy report to clipboard')+'</button>'+
        '<p id="bug-msg" style="margin:10px 0 0;font-size:12px;color:var(--text-muted);min-height:14px;text-align:center;"></p>';
      c.querySelector('#bug-x').onclick=close;
      c.querySelector('#bug-copy').onclick=()=>{ const payload=buildRow(); try{ navigator.clipboard.writeText(JSON.stringify(payload,null,2)); c.querySelector('#bug-msg').textContent=jp()?'コピーしました。':'Copied.'; }catch(_){ c.querySelector('#bug-msg').textContent=jp()?'コピーできませんでした。':'Could not copy.'; } };
      c.querySelector('#bug-send').onclick=submit; }
    function buildRow(){ const c=modal.querySelector('#bug-card');
      const cat=c?c.querySelector('#bug-cat').value:'other'; const text=c?(c.querySelector('#bug-text').value||'').trim():'';
      const row={ category:cat, description:text.slice(0,3000), diagnostics:_imDiag(), lang:HOST.lang, build:window.INTMAP_BUILD||null, ua:(navigator.userAgent||'').slice(0,250), page:location.pathname, created_at:new Date().toISOString() };
      try{ if(typeof HOST.user!=='undefined'&&HOST.user){ row.user_id=HOST.user.id; row.email=HOST.user.email||null; } }catch(_){}
      return row; }
    async function submit(){ const c=modal.querySelector('#bug-card'); const msg=c.querySelector('#bug-msg');
      const text=(c.querySelector('#bug-text').value||'').trim();
      if(text.length<5){ msg.textContent=jp()?'不具合の内容を入力してください。':'Please describe the bug.'; return; }
      const btn=c.querySelector('#bug-send'); btn.disabled=true; btn.textContent=jp()?'送信中…':'Sending…';
      const row=buildRow(); let ok=false;
      try{ if(typeof HOST.DB!=='undefined'&&HOST.DB){ const {error}=await HOST.DB.from('bug_reports').insert(row); ok=!error; } }catch(_){}
      if(!ok){ /* graceful fallback — never lose the report */
        try{ const k='intmap_bug_reports'; const arr=JSON.parse(localStorage.getItem(k)||'[]'); arr.push(row); localStorage.setItem(k,JSON.stringify(arr.slice(-20))); }catch(_){}
        try{ await navigator.clipboard.writeText(JSON.stringify(row,null,2)); }catch(_){}
      }
      renderThanks(ok); }
    function renderThanks(sent){ const c=modal.querySelector('#bug-card');
      c.innerHTML='<div style="text-align:center;padding:8px 0 2px;"><div style="font-size:34px;margin-bottom:8px;">'+(sent?'✅':'📋')+'</div>'+
        '<h3 style="margin:0 0 8px;font-size:17px;">'+(sent?(jp()?'レポートを送信しました':'Report sent'):(jp()?'レポートを保存しました':'Report saved'))+'</h3>'+
        '<p style="margin:0 0 16px;color:var(--text-muted);font-size:13px;line-height:1.6;">'+(sent?(jp()?'ご報告ありがとうございます。確認して対応します。':'Thank you — we will look into it.'):(jp()?'オフラインのため端末に保存し、内容をクリップボードにコピーしました。':'Saved on this device and copied to your clipboard (offline).'))+'</p>'+
        '<button id="bug-done" style="padding:10px 26px;border:none;border-radius:10px;background:var(--input-bg);color:var(--text-main);font-size:13.5px;font-weight:600;cursor:pointer;">'+(jp()?'閉じる':'Close')+'</button></div>';
      c.querySelector('#bug-done').onclick=close; }
    function open(){ ensure(); renderForm(); modal.style.display='flex'; }
    function close(){ if(modal) modal.style.display='none'; }
    window._openBugReport=open;
  })();
};
