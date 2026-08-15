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

window.IntMapModules.feedback=function(HOST){
  const escapeHtml=HOST.escapeHtml, isMobile=HOST.isMobile;
  /* ===== (#R20) Feedback — 5-star + free text, stored in Supabase (`feedback` table,
     supabase_feedback.sql; admins read it in admin.html). 4–5 stars → thank-you + a gentle
     donation ask (Stripe link, fully declinable); 1–3 stars → a plain thank-you. ===== */
  (function(){
    const jp=()=>HOST.lang==='jp';
    /* (#R243) …and the tuples this file holds AS DATA go through the same resolver — see pickArgs()
       in js/lang-registry.js. A {en,jp} object is the seventh shape #R241 named and is invisible to
       every instrument; written as a call it is measured like any other call site. */
    const L=window.IntMapLang.pick(()=>HOST.lang), LA=window.IntMapLang.pickArgs();
    let modal=null, rating=0, cat='general';
    /* (#R30) feedback categories — make every note actionable. Bug → offer the diagnostic Bug Reporter. */
    /* (#R33) "Praise" category removed; category is now an iOS pulldown (chips truncated on mobile). */
    /* ══ (#R247) 「Feedbackの選べるtypeの種類が少なすぎる。」 ════════════════════════════════════════
       Three choices — General / Feature idea / Bug — sorted nothing: every note about the map, the
       news, a simulator, a translation or the speed of the thing arrived as 「General」, which is the
       same as arriving unsorted. The list is now the SUBJECTS this app actually has, and it is the
       same vocabulary the bug reporter's own list uses (see `cats()` below) so a reader who files in
       one place and then the other is not asked to learn two taxonomies.
       ⚠ THE ID IS THE STORED VALUE. `submit()` embeds the English label in the comment (there is no
       column for it — see there), so ids may be APPENDED but never renamed: an old row's 「[Bug]」
       has to keep meaning what it meant. */
    const CATS=[
      ['general',LA('General','全般','Allgemein','Общее','General')],
      ['idea',   LA('Feature idea','機能の要望','Funktionswunsch','Пожелание','Sugerencia')],
      ['bug',    LA('Bug','不具合','Fehler','Ошибка','Error')],
      ['map',    LA('Map & layers','地図・レイヤー','Karte & Ebenen','Карта и слои','Mapa y capas')],
      ['data',   LA('Data accuracy','データの正確さ','Datengenauigkeit','Точность данных','Exactitud de los datos')],
      ['news',   LA('News','ニュース','Nachrichten','Новости','Noticias')],
      ['ai',     LA('AI & Atlas','AI・Atlas','KI & Atlas','ИИ и Atlas','IA y Atlas')],
      ['sim',    LA('Simulators','シミュレータ','Simulationen','Симуляторы','Simuladores')],
      ['space',  LA('Space & sky','宇宙・天体','Weltraum & Himmel','Космос и небо','Espacio y cielo')],
      ['design', LA('Design & layout','デザイン・レイアウト','Design & Layout','Дизайн и вёрстка','Diseño y disposición')],
      ['perf',   LA('Performance','動作の速さ','Leistung','Быстродействие','Rendimiento')],
      ['mobile', LA('Mobile','スマートフォン','Mobilgeräte','Мобильные устройства','Móvil')],
      ['lang',   LA('Translation & language','翻訳・言語','Übersetzung & Sprache','Перевод и язык','Traducción e idioma')],
      ['account',LA('Account & sign-in','アカウント・ログイン','Konto & Anmeldung','Аккаунт и вход','Cuenta e inicio de sesión')],
      ['access', LA('Accessibility','アクセシビリティ','Barrierefreiheit','Доступность','Accesibilidad')],
      ['other',  LA('Other','その他','Sonstiges','Другое','Otro')]];
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
        '<h3 style="margin:0 0 6px;font-size:17px;">'+(window.IntMapLang.t(HOST.lang,"Send feedback","フィードバックを送る","Feedback senden","Отправить отзыв","Enviar comentarios"))+'</h3>'+
        '<p style="margin:0 0 12px;color:var(--text-muted);font-size:12.5px;line-height:1.5;">'+(window.IntMapLang.t(HOST.lang,"Rate IntMap and tell us what to improve.","IntMapの評価と、ご意見・ご要望をお聞かせください。","Bewerten Sie IntMap und sagen Sie uns, was wir verbessern sollen.","Оцените IntMap и расскажите, что улучшить.","Valore IntMap y díganos qué mejorar."))+'</p>'+
        '<div style="font-size:11.5px;font-weight:600;color:var(--text-muted);margin:0 0 6px;">'+(window.IntMapLang.t(HOST.lang,"Type","種類","Art","Тип","Tipo"))+'</div>'+
        '<select id="fb-cat" style="width:100%;box-sizing:border-box;margin-bottom:12px;padding:10px 12px;border-radius:10px;border:1px solid rgba(128,128,128,0.25);background:var(--input-bg);color:var(--text-main);font-size:13px;font-weight:600;cursor:pointer;">'+CATS.map(([k,l])=>'<option value="'+k+'"'+(cat===k?' selected':'')+'>'+L.arr(l)+'</option>').join('')+'</select>'+
        (cat==='bug'?'<div id="fb-bughint" style="background:rgba(255,149,0,0.12);border:1px solid rgba(255,149,0,0.3);border-radius:9px;padding:9px 11px;margin-bottom:12px;font-size:11.5px;line-height:1.45;">'+(window.IntMapLang.t(HOST.lang,"For bugs, the <b>Bug Reporter</b> auto-attaches diagnostics.","不具合は、診断情報を自動添付する<b>バグレポート</b>からの送信がおすすめです。","Für Fehler hängt der <b>Fehlerbericht</b> Diagnosedaten automatisch an.","Для ошибок <b>отчёт об ошибке</b> автоматически прикладывает диагностику.","Para errores, el <b>informe de errores</b> adjunta diagnósticos automáticamente."))+' <button id="fb-openbug" style="border:none;background:none;color:var(--primary-color);font-weight:700;cursor:pointer;padding:0;font-size:11.5px;">'+(window.IntMapLang.t(HOST.lang,"Open it →","開く →","Öffnen →","Открыть →","Abrir →"))+'</button></div>':'')+
        '<div style="font-size:11.5px;font-weight:600;color:var(--text-muted);margin:0 0 4px;">'+(window.IntMapLang.t(HOST.lang,"Rating","評価","Bewertung","Оценка","Valoración"))+'</div>'+
        '<div id="fb-stars" style="display:flex;justify-content:center;margin-bottom:12px;">'+[1,2,3,4,5].map(star).join('')+'</div>'+
        '<textarea id="fb-text" maxlength="3000" placeholder="'+(window.IntMapLang.t(HOST.lang,"Comments (optional)","ご意見・ご要望（任意）","Kommentare (optional)","Комментарии (необязательно)","Comentarios (opcional)"))+'" style="width:100%;box-sizing:border-box;min-height:96px;resize:vertical;padding:10px 12px;border-radius:10px;border:1px solid rgba(128,128,128,0.25);background:var(--input-bg);color:var(--text-main);font-size:13px;outline:none;font-family:inherit;"></textarea>'+
        (loggedOut?'<input id="fb-email" type="email" placeholder="'+/* (#R210) "for a reply" / 「返信用」promised something this form does not
           guarantee. The field stays optional; the label no longer implies an answer. */
          (window.IntMapLang.t(HOST.lang,"Email (optional)","メール（任意）","E-Mail (optional)","E-mail (необязательно)","Correo electrónico (opcional)"))+'" style="width:100%;box-sizing:border-box;margin-top:9px;padding:10px 12px;border-radius:10px;border:1px solid rgba(128,128,128,0.25);background:var(--input-bg);color:var(--text-main);font-size:13px;outline:none;">':'')+
        '<button id="fb-send" style="width:100%;margin-top:12px;padding:11px;border:none;border-radius:10px;background:var(--primary-color);color:#fff;font-size:14px;font-weight:700;cursor:pointer;">'+(window.IntMapLang.t(HOST.lang,"Submit","送信","Senden","Отправить","Enviar"))+'</button>'+
        '<p id="fb-msg" style="margin:10px 0 0;font-size:12px;color:var(--text-muted);min-height:14px;text-align:center;"></p>';
      c.querySelector('#fb-x').onclick=closeM;
      { const cs=c.querySelector('#fb-cat'); if(cs) cs.onchange=()=>{ cat=cs.value; renderForm(); }; }
      const ob=c.querySelector('#fb-openbug'); if(ob) ob.onclick=()=>{ closeM(); try{ window._openBugReport&&window._openBugReport(); }catch(_){} };
      c.querySelectorAll('.fb-star').forEach(b=>b.onclick=()=>{ rating=+b.getAttribute('data-n'); renderForm(); });
      c.querySelector('#fb-send').onclick=submit; }
    async function submit(){ const c=modal.querySelector('#fb-card'); const msg=c.querySelector('#fb-msg');
      if(!rating){ msg.textContent=window.IntMapLang.t(HOST.lang,"Please pick a star rating.","星の数を選んでください。","Bitte eine Sternebewertung wählen.","Пожалуйста, поставьте оценку звёздами.","Elija una valoración con estrellas."); return; }
      const text=(c.querySelector('#fb-text').value||'').trim();
      const emailIn=c.querySelector('#fb-email'); const enteredEmail=emailIn?(emailIn.value||'').trim():'';
      /* ⚠ (#R247) `[1][0]`, NOT `[1].en`. #R243 turned these tuples from `{en,jp}` objects into
         `LA(…)` CALLS — which return an ARRAY — and left this reader on the object shape, so every
         feedback row since has been stored as 「[undefined] …」 and the category was lost. That is
         [[intmap-recurring-lessons]] B7 exactly: converting the data is half the job. */
      const catEN=(CATS.find(x=>x[0]===cat)||[,['General']])[1][0];
      const comment=('['+catEN+'] '+text).trim();   /* category embedded so it stores without a schema change */
      const btn=c.querySelector('#fb-send'); btn.disabled=true; btn.textContent=window.IntMapLang.t(HOST.lang,"Sending…","送信中…","Wird gesendet…","Отправка…","Enviando…");
      let ok=false;
      try{ if(typeof HOST.DB!=='undefined'&&HOST.DB){
        const row={ rating, comment:comment||null, lang:HOST.lang, ua:(navigator.userAgent||'').slice(0,250), page:location.pathname };
        try{ if(typeof HOST.user!=='undefined'&&HOST.user){ row.user_id=HOST.user.id; row.email=HOST.user.email||null; } else if(enteredEmail) row.email=enteredEmail; }catch(_){}
        const {error}=await HOST.DB.from('feedback').insert(row); ok=!error;
      } }catch(_){}
      if(!ok){ btn.disabled=false; btn.textContent=window.IntMapLang.t(HOST.lang,"Submit","送信","Senden","Отправить","Enviar"); msg.textContent=window.IntMapLang.t(HOST.lang,"Could not send — please try again later.","送信できませんでした。時間をおいてもう一度お試しください。","Senden fehlgeschlagen — bitte später erneut versuchen.","Не удалось отправить — попробуйте позже.","No se pudo enviar; inténtelo de nuevo más tarde."); return; }
      if(rating>=4) renderThanksHigh(); else renderThanksLow(); }
    function renderThanksLow(){ const c=modal.querySelector('#fb-card');
      c.innerHTML='<div style="text-align:center;padding:8px 0 2px;"><div style="font-size:34px;margin-bottom:8px;">🙏</div>'+
        '<h3 style="margin:0 0 8px;font-size:17px;">'+(window.IntMapLang.t(HOST.lang,"Thank you for your feedback","フィードバックありがとうございます","Vielen Dank für Ihr Feedback","Спасибо за отзыв","Gracias por sus comentarios"))+'</h3>'+
        '<p style="margin:0 0 16px;color:var(--text-muted);font-size:13px;line-height:1.6;">'+(window.IntMapLang.t(HOST.lang,"We read every note and use it to improve IntMap.","いただいたご意見は今後の改善に役立てます。","Wir lesen jede Nachricht und nutzen sie, um IntMap zu verbessern.","Мы читаем каждое сообщение и используем его для улучшения IntMap.","Leemos todos los mensajes y los usamos para mejorar IntMap."))+'</p>'+
        '<button id="fb-done" style="padding:10px 26px;border:none;border-radius:10px;background:var(--input-bg);color:var(--text-main);font-size:13.5px;font-weight:600;cursor:pointer;">'+(window.IntMapLang.t(HOST.lang,"Close","閉じる","Schließen","Закрыть","Cerrar"))+'</button></div>';
      c.querySelector('#fb-done').onclick=closeM; }
    function renderThanksHigh(){ const c=modal.querySelector('#fb-card');
      c.innerHTML='<div style="text-align:center;padding:8px 0 2px;"><div style="font-size:34px;margin-bottom:8px;">💙</div>'+
        '<h3 style="margin:0 0 8px;font-size:17px;">'+(window.IntMapLang.t(HOST.lang,"Thank you!","ありがとうございます！","Vielen Dank!","Спасибо!","¡Gracias!"))+'</h3>'+
        '<p style="margin:0 0 16px;color:var(--text-muted);font-size:13px;line-height:1.6;">'+(window.IntMapLang.t(HOST.lang,"Your high rating means a lot. If you enjoy IntMap, you can support its development — entirely optional.","高い評価をいただき励みになります。もしよろしければ、IntMapの開発・運営をご支援いただけると嬉しいです。","Ihre gute Bewertung bedeutet uns viel. Wenn Ihnen IntMap gefällt, können Sie die Entwicklung unterstützen — ganz freiwillig.","Ваша высокая оценка много значит. Если вам нравится IntMap, вы можете поддержать разработку — полностью по желанию.","Su alta valoración significa mucho. Si disfruta de IntMap, puede apoyar su desarrollo; es totalmente opcional."))+'</p>'+
        '<a id="fb-donate" href="'+window.stripeDonateURL()+'" target="_blank" rel="noopener" style="display:block;padding:12px;border-radius:10px;background:var(--primary-color);color:#fff;font-size:14px;font-weight:700;text-decoration:none;margin-bottom:8px;">'+(window.IntMapLang.t(HOST.lang,"Support IntMap","支援する","IntMap unterstützen","Поддержать IntMap","Apoyar IntMap"))+'</a>'+
        '<button id="fb-later" style="width:100%;padding:10px;border:none;border-radius:10px;background:var(--input-bg);color:var(--text-main);font-size:13px;font-weight:600;cursor:pointer;">'+(window.IntMapLang.t(HOST.lang,"Maybe later","また今度","Vielleicht später","Может быть, позже","Quizá más tarde"))+'</button></div>';
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
    /* (#R247) the `jp()` helper this closure had went with the two-armed category list below — the
       reason it existed. A helper that answers 「is this Japanese?」 is a two-language question and
       leaving it declared is an invitation to ask it again. */
    let modal=null;
    function ensure(){ if(modal) return modal;
      modal=document.createElement('div'); modal.className='modal-overlay'; modal.id='bug-modal';
      modal.style.cssText='display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:5200;align-items:center;justify-content:center;padding:20px;';
      modal.innerHTML='<div style="background:var(--card-bg);color:var(--text-main);border-radius:16px;box-shadow:var(--shadow);padding:22px 24px;width:100%;max-width:420px;box-sizing:border-box;position:relative;max-height:88dvh;overflow-y:auto;" id="bug-card"></div>';
      document.body.appendChild(modal);
      modal.addEventListener('click',(e)=>{ if(e.target===modal) close(); });
      return modal; }
    /* ══ ⚠⚠⚠ (#R247) THE THIRTEENTH SHAPE — A TERNARY WHOSE ARMS ARE ARRAYS ═══════════════════════
       This list was `jp() ? [ … ] : [ … ]`, i.e. the ninth shape #R242 closed, written one container
       deeper — and therefore invisible to every instrument in the repository: the helper-ternary
       audit wanted LITERAL arms, the adjacent-pair audit needs a Japanese string NEXT TO an English
       one and here they are in different arms, and nothing else looks at a ternary at all. Seven
       languages read this menu in English, and it is the first thing a reader has to answer before
       they can report anything. `scripts/i18n-helper-ternary-audit.mjs` counts the shape now.
       ⚠ THE IDS ARE THE STORED `category` COLUMN (supabase_bug_reports.sql, and admin.html filters on
       it) — the labels are translated, the ids are untouched. */
    const LA=window.IntMapLang.pickArgs(), L=window.IntMapLang.pick(()=>HOST.lang);
    const BUG_CATS=[
      ['ui',     LA('UI / display','UI・表示','UI / Anzeige','Интерфейс / отображение','Interfaz / visualización')],
      ['map',    LA('Map & layers','地図・レイヤー','Karte & Ebenen','Карта и слои','Mapa y capas')],
      ['news',   LA('News','ニュース','Nachrichten','Новости','Noticias')],
      ['ai',     LA('AI features','AI機能','KI-Funktionen','Функции ИИ','Funciones de IA')],
      ['account',LA('Account / login','アカウント・ログイン','Konto / Anmeldung','Аккаунт / вход','Cuenta / inicio de sesión')],
      ['perf',   LA('Performance / crash','動作が重い・落ちる','Leistung / Absturz','Производительность / сбой','Rendimiento / bloqueo')],
      ['other',  LA('Other','その他','Sonstiges','Другое','Otro')]];
    function cats(){ return BUG_CATS.map(([id,tuple])=>[id,L.arr(tuple)]); }
    function renderForm(){ const c=modal.querySelector('#bug-card'); const diag=_imDiag();
      c.innerHTML='<button id="bug-x" style="position:absolute;top:10px;right:10px;width:32px;height:32px;border:none;border-radius:9px;background:var(--input-bg);color:var(--text-main);font-size:16px;cursor:pointer;">✕</button>'+
        '<h3 style="margin:0 0 6px;font-size:17px;">🐞 '+(window.IntMapLang.t(HOST.lang,"Report a bug","バグを報告","Fehler melden","Сообщить об ошибке","Informar de un error"))+'</h3>'+
        '<p style="margin:0 0 12px;color:var(--text-muted);font-size:12.5px;line-height:1.5;">'+(window.IntMapLang.t(HOST.lang,"Describe what went wrong — steps to reproduce help a lot.","不具合の内容をできるだけ具体的に教えてください。再現手順があると助かります。","Beschreiben Sie, was schiefgelaufen ist — Schritte zum Nachstellen helfen sehr.","Опишите, что пошло не так — шаги воспроизведения очень помогают.","Describa qué ha fallado; los pasos para reproducirlo ayudan mucho."))+'</p>'+
        '<select id="bug-cat" style="width:100%;box-sizing:border-box;margin-bottom:10px;padding:9px 11px;border-radius:10px;border:1px solid rgba(128,128,128,0.25);background:var(--input-bg);color:var(--text-main);font-size:13px;">'+cats().map(c=>'<option value="'+c[0]+'">'+c[1]+'</option>').join('')+'</select>'+
        '<textarea id="bug-text" maxlength="3000" placeholder="'+(window.IntMapLang.t(HOST.lang,"e.g. On mobile, tapping X causes Y…","例: モバイルで○○を押すと△△になる…","z. B. Auf dem Handy führt Tippen auf X zu Y…","напр. на телефоне нажатие X приводит к Y…","p. ej. En el móvil, al tocar X ocurre Y…"))+'" style="width:100%;box-sizing:border-box;min-height:110px;resize:vertical;padding:10px 12px;border-radius:10px;border:1px solid rgba(128,128,128,0.25);background:var(--input-bg);color:var(--text-main);font-size:13px;outline:none;font-family:inherit;"></textarea>'+
        '<details style="margin-top:10px;"><summary style="cursor:pointer;font-size:12px;color:var(--text-muted);">'+(window.IntMapLang.t(HOST.lang,"Diagnostics attached","添付される診断情報","Angehängte Diagnosedaten","Прилагаемая диагностика","Diagnósticos adjuntos"))+'</summary>'+
          '<pre style="white-space:pre-wrap;word-break:break-word;font-size:10.5px;color:var(--text-muted);background:var(--input-bg);border-radius:8px;padding:9px;margin:8px 0 0;max-height:150px;overflow:auto;">'+escapeHtml(JSON.stringify(diag,null,1))+'</pre></details>'+
        '<button id="bug-send" style="width:100%;margin-top:12px;padding:11px;border:none;border-radius:10px;background:var(--primary-color);color:#fff;font-size:14px;font-weight:700;cursor:pointer;">'+(window.IntMapLang.t(HOST.lang,"Submit report","送信","Bericht senden","Отправить отчёт","Enviar informe"))+'</button>'+
        '<button id="bug-copy" style="width:100%;margin-top:8px;padding:9px;border:1px solid rgba(128,128,128,0.25);border-radius:10px;background:var(--input-bg);color:var(--text-main);font-size:12.5px;font-weight:600;cursor:pointer;">'+(window.IntMapLang.t(HOST.lang,"Copy report to clipboard","内容をコピー","Bericht in die Zwischenablage kopieren","Скопировать отчёт в буфер обмена","Copiar el informe al portapapeles"))+'</button>'+
        '<p id="bug-msg" style="margin:10px 0 0;font-size:12px;color:var(--text-muted);min-height:14px;text-align:center;"></p>';
      c.querySelector('#bug-x').onclick=close;
      c.querySelector('#bug-copy').onclick=()=>{ const payload=buildRow(); try{ navigator.clipboard.writeText(JSON.stringify(payload,null,2)); c.querySelector('#bug-msg').textContent=window.IntMapLang.t(HOST.lang,"Copied.","コピーしました。","Kopiert.","Скопировано.","Copiado."); }catch(_){ c.querySelector('#bug-msg').textContent=window.IntMapLang.t(HOST.lang,"Could not copy.","コピーできませんでした。","Kopieren fehlgeschlagen.","Не удалось скопировать.","No se pudo copiar."); } };
      c.querySelector('#bug-send').onclick=submit; }
    function buildRow(){ const c=modal.querySelector('#bug-card');
      const cat=c?c.querySelector('#bug-cat').value:'other'; const text=c?(c.querySelector('#bug-text').value||'').trim():'';
      const row={ category:cat, description:text.slice(0,3000), diagnostics:_imDiag(), lang:HOST.lang, build:window.INTMAP_BUILD||null, ua:(navigator.userAgent||'').slice(0,250), page:location.pathname, created_at:new Date().toISOString() };
      try{ if(typeof HOST.user!=='undefined'&&HOST.user){ row.user_id=HOST.user.id; row.email=HOST.user.email||null; } }catch(_){}
      return row; }
    async function submit(){ const c=modal.querySelector('#bug-card'); const msg=c.querySelector('#bug-msg');
      const text=(c.querySelector('#bug-text').value||'').trim();
      if(text.length<5){ msg.textContent=window.IntMapLang.t(HOST.lang,"Please describe the bug.","不具合の内容を入力してください。","Bitte beschreiben Sie den Fehler.","Пожалуйста, опишите ошибку.","Describa el error, por favor."); return; }
      const btn=c.querySelector('#bug-send'); btn.disabled=true; btn.textContent=window.IntMapLang.t(HOST.lang,"Sending…","送信中…","Wird gesendet…","Отправка…","Enviando…");
      const row=buildRow(); let ok=false;
      try{ if(typeof HOST.DB!=='undefined'&&HOST.DB){ const {error}=await HOST.DB.from('bug_reports').insert(row); ok=!error; } }catch(_){}
      if(!ok){ /* graceful fallback — never lose the report */
        try{ const k='intmap_bug_reports'; const arr=JSON.parse(localStorage.getItem(k)||'[]'); arr.push(row); localStorage.setItem(k,JSON.stringify(arr.slice(-20))); }catch(_){}
        try{ await navigator.clipboard.writeText(JSON.stringify(row,null,2)); }catch(_){}
      }
      renderThanks(ok); }
    function renderThanks(sent){ const c=modal.querySelector('#bug-card');
      c.innerHTML='<div style="text-align:center;padding:8px 0 2px;"><div style="font-size:34px;margin-bottom:8px;">'+(sent?'✅':'📋')+'</div>'+
        '<h3 style="margin:0 0 8px;font-size:17px;">'+(sent?(window.IntMapLang.t(HOST.lang,"Report sent","レポートを送信しました","Bericht gesendet","Отчёт отправлен","Informe enviado")):(window.IntMapLang.t(HOST.lang,"Report saved","レポートを保存しました","Bericht gespeichert","Отчёт сохранён","Informe guardado")))+'</h3>'+
        '<p style="margin:0 0 16px;color:var(--text-muted);font-size:13px;line-height:1.6;">'+(sent?(window.IntMapLang.t(HOST.lang,"Thank you — we will look into it.","ご報告ありがとうございます。確認して対応します。","Vielen Dank — wir sehen uns das an.","Спасибо — мы разберёмся.","Gracias; lo revisaremos.")):(window.IntMapLang.t(HOST.lang,"Saved on this device and copied to your clipboard (offline).","オフラインのため端末に保存し、内容をクリップボードにコピーしました。","Auf diesem Gerät gespeichert und in die Zwischenablage kopiert (offline).","Сохранено на этом устройстве и скопировано в буфер обмена (офлайн).","Guardado en este dispositivo y copiado al portapapeles (sin conexión).")))+'</p>'+
        '<button id="bug-done" style="padding:10px 26px;border:none;border-radius:10px;background:var(--input-bg);color:var(--text-main);font-size:13.5px;font-weight:600;cursor:pointer;">'+(window.IntMapLang.t(HOST.lang,"Close","閉じる","Schließen","Закрыть","Cerrar"))+'</button></div>';
      c.querySelector('#bug-done').onclick=close; }
    function open(){ ensure(); renderForm(); modal.style.display='flex'; }
    function close(){ if(modal) modal.style.display='none'; }
    window._openBugReport=open;
  })();
};
