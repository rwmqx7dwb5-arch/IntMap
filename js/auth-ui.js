/* ============================================================================
 *  IntMap · Account, authentication & Supabase boot  (#R168)
 * ----------------------------------------------------------------------------
 *  Everything account-shaped: the auth modal, the account menu, password strength / breach
 *  checking, passkeys, the set-password flow, the favourites loader, the realtime subscription
 *  and bootSupabase(). currentUser is the single source of truth and stays declared in
 *  index.html — this module writes it through the host setter.
 *
 *  Moved VERBATIM out of the index.html DOMContentLoaded closure: the only edit is that free
 *  references to closure variables became HOST.<member> reads (Architecture.md §3.1). The
 *  extraction was done by script and reversed byte-for-byte against the original text.
 * ==========================================================================*/
window.IntMapModules=window.IntMapModules||{};
window.IntMapModules.authUi=function(HOST){
  /* ---------- DATA: geo_pins -> geoRaw -> rebuildGeoIndex ---------- */
  async function loadGeoFromSupabase(){
    if(!HOST.DB) return;
    const { data, error } = await HOST.DB.from('geo_pins').select('type,terms,name_en,name_jp,lng,lat').order('sort_order',{ascending:true});
    if(error){ console.warn('[IntMap] geo_pins load failed:', error.message); return; }
    const grouped={};
    (data||[]).forEach(r=>{ (grouped[r.type]=grouped[r.type]||[]).push({ terms:r.terms||[], loc:[r.lng,r.lat], name:{en:r.name_en, jp:r.name_jp||r.name_en} }); });
    HOST.geoRaw=grouped; HOST.rebuildGeoIndex();
  }

  /* ---------- AUTH ---------- */
  /* (#R155) 5-language helper for the auth/account modals (they predate the i18n dict). */
  function _authL(en,jp,de,ru,es){ return HOST.lang==='jp'?jp:HOST.lang==='de'?de:HOST.lang==='ru'?ru:HOST.lang==='es'?es:en; }

  /* (#R155) Password strength — mirrors the SERVER floor (supabase/config.toml [auth]:
     minimum_password_length=8, password_requirements="lower_upper_letters_digits"). Returns {ok,msg}. */
  function _pwStrength(pw){ pw=String(pw||'');
    if(pw.length<8) return {ok:false,msg:_authL('Password must be at least 8 characters.','パスワードは8文字以上にしてください。','Das Passwort muss mindestens 8 Zeichen lang sein.','Пароль должен содержать не менее 8 символов.','La contraseña debe tener al menos 8 caracteres.')};
    if(!/[a-z]/.test(pw)||!/[A-Z]/.test(pw)||!/[0-9]/.test(pw)) return {ok:false,msg:_authL('Include lower- and upper-case letters and a number.','小文字・大文字・数字を含めてください。','Verwende Groß- und Kleinbuchstaben sowie eine Ziffer.','Используйте строчные и прописные буквы и цифру.','Incluye mayúsculas, minúsculas y un número.')};
    return {ok:true,msg:''};
  }

  async function _pwBreachCount(pw){ try{
    if(!(window.crypto&&crypto.subtle&&crypto.subtle.digest)) return 0;
    const buf=await crypto.subtle.digest('SHA-1', new TextEncoder().encode(String(pw||'')));
    const hex=Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('').toUpperCase();
    const r=await fetch('https://api.pwnedpasswords.com/range/'+hex.slice(0,5));
    if(!r.ok) return 0;
    const suffix=hex.slice(5), txt=await r.text();
    for(const line of txt.split('\n')){ const p=line.trim().split(':'); if(p[0]===suffix) return parseInt(p[1],10)||1; }
    return 0;
  }catch(_){ return 0; } }

  /* (#R155) Full new-password gate: strength THEN breach. Returns {ok,msg}. */
  async function _pwValidateNew(pw){ const s=_pwStrength(pw); if(!s.ok) return s;
    if(await _pwBreachCount(pw)>0) return {ok:false,msg:_authL('This password appears in a known data breach — please choose a different one.','このパスワードは既知の漏えいに含まれています。別のものを選んでください。','Dieses Passwort taucht in einem bekannten Datenleck auf — bitte wähle ein anderes.','Этот пароль встречался в известной утечке — выберите другой.','Esta contraseña apareció en una filtración conocida: elige otra.')};
    return {ok:true,msg:''};
  }

  /* (#R155) Passkey capability: the SDK method exists AND the browser supports WebAuthn. */
  function _passkeysAvailable(){ try{ return !!(HOST.DB&&HOST.DB.auth&&typeof HOST.DB.auth.signInWithPasskey==='function'&&window.PublicKeyCredential); }catch(_){ return false; } }

  async function _renderPasskeys(){ const box=document.getElementById('acct-passkeys'); if(!box) return;
    const addBtn=document.getElementById('acct-add-passkey');
    if(!_passkeysAvailable()||!(HOST.DB.auth.passkey&&typeof HOST.DB.auth.passkey.list==='function')){ box.innerHTML=''; if(addBtn) addBtn.style.display='none'; return; }
    if(addBtn) addBtn.style.display='block';
    box.innerHTML='<div style="font-size:12px;color:var(--text-muted);">'+HOST.escapeHtml(_authL('Loading passkeys…','パスキーを読み込み中…','Passkeys werden geladen…','Загрузка паскеев…','Cargando passkeys…'))+'</div>';
    let list=[];
    try{ const r=await HOST.DB.auth.passkey.list(); const d=(r&&r.data)||r; list=Array.isArray(d)?d:(d&&(d.passkeys||d.all||d.factors))||[]; }
    catch(_){ box.innerHTML=''; return; }
    if(!list.length){ box.innerHTML='<div style="font-size:12px;color:var(--text-muted);">'+HOST.escapeHtml(_authL('No passkeys yet.','パスキーはまだありません。','Noch keine Passkeys.','Паскеев пока нет.','Aún no hay passkeys.'))+'</div>'; return; }
    box.innerHTML=list.map(pk=>{ const nm=HOST.escapeHtml(pk.friendly_name||pk.friendlyName||pk.name||'Passkey'), id=HOST.escapeHtml(String(pk.id||''));
      return '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;background:var(--input-bg);border-radius:8px;padding:7px 10px;margin-bottom:6px;"><span style="font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+nm+'</span><button data-pkdel="'+id+'" style="background:transparent;border:none;color:#ff3b30;font-size:12px;font-weight:600;cursor:pointer;flex:0 0 auto;">'+HOST.escapeHtml(_authL('Remove','削除','Entfernen','Удалить','Quitar'))+'</button></div>'; }).join('');
    box.querySelectorAll('[data-pkdel]').forEach(b=>b.onclick=async()=>{ const id=b.getAttribute('data-pkdel');
      if(!window.confirm(_authL('Remove this passkey?','このパスキーを削除しますか？','Diesen Passkey entfernen?','Удалить этот паскей?','¿Quitar este passkey?'))) return;
      try{ await HOST.DB.auth.passkey.delete({id}); }catch(_){ try{ await HOST.DB.auth.passkey.delete({passkeyId:id}); }catch(__){} }
      _renderPasskeys();
    });
  }

  /* (#R155) Shared "set a new password" modal — used by the reset-link recovery flow AND the
     account menu's Change-password button. Enforces the same strength + breach gate as signup. */
  function _openSetPassword(isRecovery){
    let d=document.getElementById('setpw-modal');
    if(!d){ d=document.createElement('div'); d.id='setpw-modal';
      d.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.55);display:none;align-items:center;justify-content:center;z-index:5300;padding:20px;';
      d.innerHTML='<div style="background:var(--card-bg);color:var(--text-main);border-radius:16px;box-shadow:var(--shadow);padding:24px;width:100%;max-width:340px;box-sizing:border-box;">'
        +'<h2 style="margin:0 0 12px;font-size:18px;">'+HOST.escapeHtml(_authL('Set a new password','新しいパスワードを設定','Neues Passwort festlegen','Задать новый пароль','Establecer nueva contraseña'))+'</h2>'
        +'<input id="setpw-input" type="password" autocomplete="new-password" placeholder="'+HOST.escapeHtml(_authL('New password (min. 8, incl. a number)','新しいパスワード（8文字以上・数字を含む）','Neues Passwort (min. 8, mit Ziffer)','Новый пароль (мин. 8, с цифрой)','Nueva contraseña (mín. 8, con número)'))+'" style="width:100%;box-sizing:border-box;padding:10px;border-radius:8px;border:1px solid transparent;background:var(--input-bg);color:var(--text-main);margin-bottom:12px;">'
        +'<button id="setpw-save" style="width:100%;background:var(--primary-color);color:#fff;border:none;padding:11px;border-radius:9px;font-weight:600;cursor:pointer;">'+HOST.escapeHtml(_authL('Save','保存','Speichern','Сохранить','Guardar'))+'</button>'
        +'<p id="setpw-msg" style="margin:10px 0 0;color:var(--text-muted);font-size:12.5px;"></p>'
        +'<button id="setpw-close" style="width:100%;background:transparent;border:none;color:var(--text-muted);margin-top:8px;padding:6px;cursor:pointer;font-size:13px;">'+HOST.escapeHtml(_authL('Cancel','キャンセル','Abbrechen','Отмена','Cancelar'))+'</button></div>';
      document.body.appendChild(d);
      d.onclick=e=>{ if(e.target===d) d.style.display='none'; };
      document.getElementById('setpw-close').onclick=()=>{ d.style.display='none'; };
      document.getElementById('setpw-save').onclick=async()=>{
        const pw=document.getElementById('setpw-input').value, msg=document.getElementById('setpw-msg'), btn=document.getElementById('setpw-save');
        btn.disabled=true; msg.textContent=_authL('Checking password…','パスワードを確認中…','Passwort wird geprüft…','Проверка пароля…','Comprobando contraseña…');
        const chk=await _pwValidateNew(pw); if(!chk.ok){ msg.textContent=chk.msg; btn.disabled=false; return; }
        msg.textContent=_authL('Saving…','保存中…','Speichere…','Сохранение…','Guardando…');
        try{ const {error}=await HOST.DB.auth.updateUser({password:pw}); if(error) throw error;
          msg.textContent=_authL('Password updated.','パスワードを更新しました。','Passwort aktualisiert.','Пароль обновлён.','Contraseña actualizada.');
          setTimeout(()=>{ d.style.display='none'; }, 900);
        }catch(e){ msg.textContent=_authL('Could not update the password.','パスワードを更新できませんでした。','Passwort konnte nicht aktualisiert werden.','Не удалось обновить пароль.','No se pudo actualizar la contraseña.'); }
        finally{ btn.disabled=false; }
      };
    }
    document.getElementById('setpw-input').value='';
    document.getElementById('setpw-msg').textContent=isRecovery?_authL('Enter a new password to finish resetting your account.','アカウント再設定を完了するには新しいパスワードを入力してください。','Gib ein neues Passwort ein, um das Zurücksetzen abzuschließen.','Введите новый пароль, чтобы завершить сброс.','Introduce una nueva contraseña para terminar el restablecimiento.'):'';
    d.style.display='flex';
  }

  function injectAuthUI(){
    const settingsBtn=document.getElementById('btn-open-settings');
    const acct=document.createElement('button');
    acct.id='btn-account'; acct.className='btn-settings'; acct.style.marginRight='8px'; acct.textContent=(HOST.lang==='jp'?'ログイン':HOST.lang==='de'?'Anmelden':HOST.lang==='ru'?'Войти':HOST.lang==='es'?'Iniciar sesión':'Log in');
    acct.onclick=()=>{ HOST.user ? openAccountMenu() : openAuthModal(); };
    if(settingsBtn&&settingsBtn.parentNode) settingsBtn.parentNode.insertBefore(acct,settingsBtn);
    else document.body.appendChild(acct);
    /* (#R122) enter Workspace (floating-window) mode from the Log in / Feedback / Settings row — desktop only. */
    try{ const wsB=document.createElement('button'); wsB.id='btn-ws-enter'; wsB.className='btn-settings'; wsB.style.marginRight='8px';
      const _wsL=()=>(HOST.lang==='jp'?'ワークスペース':HOST.lang==='de'?'Arbeitsbereich':HOST.lang==='ru'?'Рабочая область':HOST.lang==='es'?'Espacio':'Workspace');
      wsB.title=_wsL(); wsB.setAttribute('aria-label',_wsL());
      wsB.innerHTML='<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 9v11"/></svg>';
      window.addEventListener('intmap-lang',()=>{ wsB.title=_wsL(); wsB.setAttribute('aria-label',_wsL()); });
      wsB.onclick=()=>{ try{ if(window.IntMapWorkspace){ const act=window.IntMapWorkspace.active&&window.IntMapWorkspace.active(); if(act) window.IntMapWorkspace.close(); else window.IntMapWorkspace.open(); } }catch(_){} };
      if(settingsBtn&&settingsBtn.parentNode) settingsBtn.parentNode.insertBefore(wsB,acct); else document.body.appendChild(wsB); }catch(_){}
    /* (#R21) Header Support button RETIRED per request — support stays reachable from Settings
       (the in-panel button) and from the feedback flow. */
    /* (#R20) Feedback button in the header */
    const fb=document.createElement('button');
    fb.id='btn-feedback-hdr'; fb.className='btn-settings'; fb.style.marginRight='8px';
    fb.textContent=(HOST.lang==='jp'?'フィードバック':HOST.lang==='de'?'Feedback':HOST.lang==='ru'?'Обратная связь':HOST.lang==='es'?'Comentarios':'Feedback');
    window.addEventListener('intmap-lang',()=>{ fb.textContent=(HOST.lang==='jp'?'フィードバック':HOST.lang==='de'?'Feedback':HOST.lang==='ru'?'Обратная связь':HOST.lang==='es'?'Comentarios':'Feedback'); });
    fb.onclick=()=>{ try{ window._openFeedback&&window._openFeedback(); }catch(_){} };
    if(settingsBtn&&settingsBtn.parentNode) settingsBtn.parentNode.insertBefore(fb,settingsBtn);
    else document.body.appendChild(fb);

    const m=document.createElement('div'); m.id='auth-modal';
    m.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);display:none;align-items:center;justify-content:center;z-index:5000;padding:20px;';
    const inStyle='width:100%;box-sizing:border-box;padding:10px;border-radius:8px;border:1px solid transparent;background:var(--input-bg);color:var(--text-main);margin-bottom:10px;';
    const oaStyle='width:100%;box-sizing:border-box;display:flex;align-items:center;justify-content:center;gap:8px;padding:10px;border-radius:9px;border:1px solid rgba(128,128,128,0.25);background:var(--card-bg);color:var(--text-main);font-weight:600;font-size:13.5px;cursor:pointer;margin-bottom:8px;';
    m.innerHTML=`<div style="background:var(--card-bg);color:var(--text-main);border-radius:16px;box-shadow:var(--shadow);padding:24px;width:100%;max-width:360px;box-sizing:border-box;max-height:92vh;overflow-y:auto;">
      <h2 style="margin:0 0 4px;font-size:19px;">IntMap account</h2>
      <p id="am-sub" style="margin:0 0 16px;color:var(--text-muted);font-size:13px;line-height:1.5;">Log in or create an account to use AI features and sync your settings, widgets, favorites and avatar across devices.</p>
      <div style="display:flex;background:var(--input-bg);border-radius:10px;padding:3px;margin-bottom:14px;">
        <button id="am-tab-login" style="flex:1;border:none;background:var(--card-bg);color:var(--text-main);padding:8px;border-radius:8px;font-weight:600;cursor:pointer;">Log In</button>
        <button id="am-tab-signup" style="flex:1;border:none;background:transparent;color:var(--text-muted);padding:8px;border-radius:8px;font-weight:600;cursor:pointer;">Sign Up</button>
      </div>
      <button id="am-oauth-google" style="${oaStyle}"><svg width="17" height="17" viewBox="0 0 48 48" style="flex:0 0 auto;"><path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"/><path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"/><path fill="#FBBC05" d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"/><path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"/></svg> Continue with Google</button>
      <div style="display:flex;align-items:center;gap:10px;margin:12px 0 14px;color:var(--text-muted);font-size:12px;"><div style="flex:1;height:1px;background:rgba(128,128,128,0.2);"></div>or<div style="flex:1;height:1px;background:rgba(128,128,128,0.2);"></div></div>
      <input id="am-name" type="text" placeholder="Display name" autocomplete="nickname" maxlength="40" style="${inStyle}display:none;">
      <input id="am-email" type="email" placeholder="you@example.com" autocomplete="username" style="${inStyle}">
      <input id="am-pass" type="password" placeholder="Password" autocomplete="current-password" style="${inStyle}margin-bottom:8px;">
      <div id="am-forgot-row" style="text-align:right;margin:-2px 0 12px;"><a id="am-forgot" href="#" style="color:var(--text-muted);font-size:12px;text-decoration:none;">${_authL('Forgot password?','パスワードをお忘れですか？','Passwort vergessen?','Забыли пароль?','¿Olvidaste tu contraseña?')}</a></div>
      <button id="am-submit" style="width:100%;background:var(--primary-color);color:#fff;border:none;padding:11px;border-radius:9px;font-weight:600;font-size:14px;cursor:pointer;">Log In</button>
      <button id="am-passkey" style="width:100%;background:var(--card-bg);color:var(--text-main);border:1px solid rgba(128,128,128,0.25);padding:10px;border-radius:9px;font-weight:600;font-size:13.5px;cursor:pointer;margin-top:8px;display:none;">${_authL('Sign in with a passkey','パスキーでログイン','Mit Passkey anmelden','Войти по паскею','Iniciar sesión con passkey')}</button>
      <p id="am-msg" style="margin:12px 0 0;color:var(--text-muted);font-size:12.5px;line-height:1.5;"></p>
      <button id="am-close" style="width:100%;background:transparent;border:none;color:var(--text-muted);margin-top:8px;padding:6px;cursor:pointer;font-size:13px;">Close</button>
    </div>`;
    document.body.appendChild(m);
    let amMode='login';
    function setTab(mode){ amMode=mode;
      /* (#R122) dark mode: the SELECTED segment is a solid white pill with black text (high contrast) */
      const dk=document.documentElement.getAttribute('data-theme')==='dark';
      const selBg=dk?'#fff':'var(--card-bg)', selFg=dk?'#111':'var(--text-main)';
      $am('am-tab-login').style.background = mode==='login'?selBg:'transparent';
      $am('am-tab-login').style.color = mode==='login'?selFg:'var(--text-muted)';
      $am('am-tab-signup').style.background = mode==='signup'?selBg:'transparent';
      $am('am-tab-signup').style.color = mode==='signup'?selFg:'var(--text-muted)';
      $am('am-name').style.display = mode==='signup'?'block':'none';
      $am('am-pass').setAttribute('autocomplete', mode==='signup'?'new-password':'current-password');
      $am('am-submit').textContent = mode==='login'?'Log In':'Create account';
      $am('am-pass').placeholder = mode==='signup'?_authL('Password (min. 8 chars, incl. a number)','パスワード（8文字以上・数字を含む）','Passwort (min. 8 Zeichen, mit Ziffer)','Пароль (мин. 8 символов, с цифрой)','Contraseña (mín. 8, con un número)'):_authL('Password','パスワード','Passwort','Пароль','Contraseña');
      /* (#R155) passkey sign-in + forgot-password only make sense on the LOGIN tab. */
      try{ $am('am-passkey').style.display=(mode==='login'&&_passkeysAvailable())?'block':'none'; }catch(_){}
      try{ $am('am-forgot-row').style.display=mode==='login'?'block':'none'; }catch(_){}
      $am('am-msg').textContent='';
    }
    function $am(id){ return document.getElementById(id); }
    $am('am-tab-login').onclick=()=>setTab('login');
    $am('am-tab-signup').onclick=()=>setTab('signup');
    try{ setTab('login'); }catch(_){}   /* (#R122) normalize the initial segment colours for the current theme */
    $am('am-close').onclick=()=>{ m.style.display='none'; };
    m.onclick=(e)=>{ if(e.target===m) m.style.display='none'; };
    $am('am-submit').onclick=async()=>{
      const email=$am('am-email').value.trim(), password=$am('am-pass').value, name=$am('am-name').value.trim(), msg=$am('am-msg');
      if(!email||!password){ msg.textContent=_authL('Enter email and password.','メールアドレスとパスワードを入力してください。','Gib E-Mail und Passwort ein.','Введите e-mail и пароль.','Introduce el correo y la contraseña.'); return; }
      $am('am-submit').disabled=true;
      try{
        if(amMode==='signup'){
          if(!name){ msg.textContent=_authL('Choose a display name (shown on your community posts).','表示名を入力してください（コミュニティ投稿に表示されます）。','Wähle einen Anzeigenamen (in Community-Beiträgen sichtbar).','Выберите отображаемое имя (видно в постах сообщества).','Elige un nombre visible (aparece en tus publicaciones).'); return; }
          /* (#R155) strength (mirrors the server floor) THEN a HIBP breach check before we submit. */
          msg.textContent=_authL('Checking password…','パスワードを確認中…','Passwort wird geprüft…','Проверка пароля…','Comprobando contraseña…');
          const chk=await _pwValidateNew(password); if(!chk.ok){ msg.textContent=chk.msg; return; }
          msg.textContent=_authL('Working…','処理中…','Wird verarbeitet…','Обработка…','Procesando…');
          /* display_name is stored in user metadata; the profile row picks it up on first login */
          const {error}=await HOST.DB.auth.signUp({email,password,options:{data:{display_name:name}}});
          /* (#R155) ENUMERATION-SAFE: whether the email is new OR already registered, show the SAME
             neutral message so signup can't be used to probe which emails have accounts. */
          if(error && !/already|exist|registered/i.test(error.message||'')) throw error;
          msg.textContent=_authL('Check your email — if this address is new, we sent a confirmation link. Then log in.','メールをご確認ください。新規の場合は確認リンクを送信しました。その後ログインしてください。','Prüfe deine E-Mail — falls neu, haben wir einen Bestätigungslink gesendet. Dann anmelden.','Проверьте почту — если адрес новый, мы отправили ссылку для подтверждения. Затем войдите.','Revisa tu correo: si es nuevo, enviamos un enlace de confirmación. Luego inicia sesión.'); setTab('login');
        } else {
          const {data,error}=await HOST.DB.auth.signInWithPassword({email,password});
          /* (#R155) ENUMERATION-SAFE: Supabase already returns a generic "Invalid login credentials";
             surface a single localized generic message and never reveal whether the email exists. */
          if(error){ msg.textContent=_authL('Invalid email or password.','メールアドレスまたはパスワードが正しくありません。','E-Mail oder Passwort ist falsch.','Неверный e-mail или пароль.','Correo o contraseña incorrectos.'); return; }
          m.style.display='none';
          try{ HOST.recordLogin(data&&data.user&&data.user.id); }catch(_){}   /* (#R27) genuine login → count for the 3rd-login feedback nudge */
        }
      }catch(e){ msg.textContent=_authL('Something went wrong. Please try again.','エラーが発生しました。もう一度お試しください。','Etwas ist schiefgelaufen. Bitte erneut versuchen.','Что-то пошло не так. Повторите попытку.','Algo salió mal. Inténtalo de nuevo.'); }
      finally{ $am('am-submit').disabled=false; }
    };
    /* (#R155) Passkey sign-in (WebAuthn, discoverable credential — no email needed). */
    $am('am-passkey').onclick=async()=>{
      const msg=$am('am-msg');
      if(!_passkeysAvailable()){ msg.textContent=_authL('Passkeys aren\'t available on this device.','この端末ではパスキーを利用できません。','Passkeys sind auf diesem Gerät nicht verfügbar.','Паскеи недоступны на этом устройстве.','Los passkeys no están disponibles en este dispositivo.'); return; }
      $am('am-passkey').disabled=true; msg.textContent=_authL('Waiting for your passkey…','パスキーを待機中…','Warte auf deinen Passkey…','Ожидание паскея…','Esperando tu passkey…');
      try{ const {data,error}=await HOST.DB.auth.signInWithPasskey(); if(error) throw error;
        m.style.display='none'; try{ HOST.recordLogin(data&&data.user&&data.user.id); }catch(_){}
      }catch(e){ msg.textContent=_authL('Passkey sign-in failed or was cancelled.','パスキーのログインに失敗またはキャンセルされました。','Passkey-Anmeldung fehlgeschlagen oder abgebrochen.','Вход по паскею не удался или отменён.','El inicio con passkey falló o se canceló.'); }
      finally{ $am('am-passkey').disabled=false; }
    };
    /* (#R155) Forgot password → email a reset link. Enumeration-safe: identical message regardless. */
    $am('am-forgot').onclick=async(e)=>{ e.preventDefault(); const msg=$am('am-msg');
      const email=$am('am-email').value.trim();
      if(!email){ msg.textContent=_authL('Enter your email above, then tap “Forgot password?”.','上のメール欄を入力してから「パスワードをお忘れですか？」を押してください。','Gib oben deine E-Mail ein und tippe dann auf „Passwort vergessen?“.','Введите e-mail выше, затем нажмите «Забыли пароль?».','Introduce tu correo arriba y pulsa «¿Olvidaste tu contraseña?».'); return; }
      const redirectTo=(location.protocol==='file:')?location.href:(location.origin+location.pathname);
      try{ await HOST.DB.auth.resetPasswordForEmail(email,{redirectTo}); }catch(_){}
      msg.textContent=_authL('If an account exists for that email, we\'ve sent a password-reset link.','そのメールアドレスのアカウントが存在する場合、再設定リンクを送信しました。','Falls ein Konto zu dieser E-Mail existiert, haben wir einen Link zum Zurücksetzen gesendet.','Если аккаунт с этим адресом существует, мы отправили ссылку для сброса пароля.','Si existe una cuenta con ese correo, enviamos un enlace para restablecer la contraseña.');
    };
    /* OAuth (Google / Apple). NOTE: each provider must be ENABLED in the Supabase dashboard
       (Authentication → Providers) with this site added as a redirect URL, or it errors. */
    async function oauth(provider){ const msg=$am('am-msg'); msg.textContent='Redirecting…';
      /* Use a CLEAN redirect target (origin + path, no query/hash). It must be listed verbatim in
         Supabase → Auth → URL Configuration → Redirect URLs, or the provider bounces back without a
         session (the "logged in via Google but not actually logged in" symptom, #33). file:// can't
         do OAuth at all — must be served over http(s). */
      const redirectTo=(location.protocol==='file:') ? location.href : (location.origin+location.pathname);
      try{ const {error}=await HOST.DB.auth.signInWithOAuth({ provider, options:{ redirectTo } }); if(error) throw error; }
      catch(e){ msg.textContent='Error: '+((e&&e.message)||e); } }
    $am('am-oauth-google').onclick=()=>oauth('google');
    window.__amSetTab=setTab;
  }

  function openAuthModal(contextMsg){ const m=document.getElementById('auth-modal'); if(!m) return; if(window.__amSetTab) window.__amSetTab('login');
    try{ const sub=document.getElementById('am-sub');
      if(sub){ if(contextMsg){ sub.dataset.ctx='1'; sub.textContent=contextMsg; }
        else if(sub.dataset.ctx){ delete sub.dataset.ctx; sub.textContent=(HOST.lang==='jp'?'ログイン／新規登録で、AI機能・設定/ウィジェット/お気に入り/アイコンの端末間同期が使えます。':HOST.lang==='de'?'Melde dich an oder registriere dich für KI-Funktionen und die Synchronisierung von Einstellungen, Widgets, Favoriten und Avatar über Geräte hinweg.':HOST.lang==='ru'?'Войдите или создайте аккаунт: ИИ-функции и синхронизация настроек, виджетов, избранного и аватара между устройствами.':HOST.lang==='es'?'Inicia sesión o crea una cuenta para usar la IA y sincronizar ajustes, widgets, favoritos y avatar entre dispositivos.':'Log in or create an account to use AI features and sync your settings, widgets, favorites and avatar across devices.'); } }
    }catch(_){}
    m.style.display='flex'; }

  function openAccountMenu(){
    if(!HOST.user) return openAuthModal();
    let m=document.getElementById('acct-modal');
    if(!m){
      m=document.createElement('div'); m.id='acct-modal';
      m.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);display:none;align-items:center;justify-content:center;z-index:5000;padding:20px;';
      const secBtn='width:100%;background:var(--input-bg);color:var(--text-main);border:none;padding:10px;border-radius:9px;font-weight:600;font-size:13px;cursor:pointer;margin-bottom:8px;text-align:left;';   /* (#R155) security-section buttons */
      m.innerHTML=`<div style="background:var(--card-bg);color:var(--text-main);border-radius:16px;box-shadow:var(--shadow);padding:24px;width:100%;max-width:360px;box-sizing:border-box;max-height:90vh;overflow-y:auto;">
        <h2 style="margin:0 0 4px;font-size:19px;">${HOST.lang==='jp'?'プロフィール':HOST.lang==='de'?'Dein Profil':HOST.lang==='ru'?'Ваш профиль':HOST.lang==='es'?'Tu perfil':'Your profile'}</h2>
        <p id="acct-email" style="margin:0 0 10px;color:var(--text-muted);font-size:13px;"></p>
        <div class="acct-avatar-wrap"><div class="acct-avatar" id="acct-avatar-preview"></div>
          <div style="flex:1;"><div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px;">${HOST.lang==='jp'?'アイコン':HOST.lang==='de'?'Icon':HOST.lang==='ru'?'Значок':HOST.lang==='es'?'Icono':'Icon'}</div>
          <div class="acct-avatar-pick" id="acct-avatar-pick"></div>
          <label class="compose-img-btn" for="acct-avatar-file" style="padding:6px 11px;font-size:12px;margin-top:2px;">🖼 ${HOST.lang==='jp'?'画像をアップロード':HOST.lang==='de'?'Bild hochladen':HOST.lang==='ru'?'Загрузить изображение':HOST.lang==='es'?'Subir imagen':'Upload image'}</label>
          <input type="file" id="acct-avatar-file" accept="image/*" style="display:none;"></div></div>
        <div id="acct-pro" style="margin:0 0 16px;font-size:13px;"></div>
        <label style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px;">${HOST.lang==='jp'?'表示名':HOST.lang==='de'?'Anzeigename':HOST.lang==='ru'?'Отображаемое имя':HOST.lang==='es'?'Nombre visible':'Display name'}</label>
        <input id="acct-name" type="text" maxlength="40" style="width:100%;box-sizing:border-box;padding:10px;border-radius:8px;border:1px solid transparent;background:var(--input-bg);color:var(--text-main);margin:6px 0 12px;">
        <label style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px;">${HOST.lang==='jp'?'自己紹介（他のユーザーに公開）':HOST.lang==='de'?'Bio (öffentlich)':HOST.lang==='ru'?'О себе (публично)':HOST.lang==='es'?'Biografía (pública)':'Bio (public)'}</label>
        <textarea id="acct-bio" maxlength="280" rows="3" style="width:100%;box-sizing:border-box;padding:10px;border-radius:8px;border:1px solid transparent;background:var(--input-bg);color:var(--text-main);margin:6px 0 14px;resize:vertical;font-family:inherit;font-size:13px;"></textarea>
        <button id="acct-save" style="width:100%;background:var(--primary-color);color:#fff;border:none;padding:11px;border-radius:9px;font-weight:600;font-size:14px;cursor:pointer;">${HOST.lang==='jp'?'保存':HOST.lang==='de'?'Profil speichern':HOST.lang==='ru'?'Сохранить профиль':HOST.lang==='es'?'Guardar perfil':'Save profile'}</button>
        <p id="acct-msg" style="margin:10px 0 0;color:var(--text-muted);font-size:12.5px;"></p>
        <div style="margin-top:16px;border-top:1px solid rgba(128,128,128,0.18);padding-top:14px;">
          <div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px;margin-bottom:9px;">${_authL('Security','セキュリティ','Sicherheit','Безопасность','Seguridad')}</div>
          <div id="acct-passkeys" style="margin-bottom:8px;"></div>
          <button id="acct-add-passkey" style="${secBtn}display:none;">${_authL('Add a passkey','パスキーを追加','Passkey hinzufügen','Добавить паскей','Añadir passkey')}</button>
          <button id="acct-change-email" style="${secBtn}">${_authL('Change email','メールアドレスを変更','E-Mail ändern','Изменить e-mail','Cambiar correo')}</button>
          <button id="acct-change-pw" style="${secBtn}">${_authL('Change password','パスワードを変更','Passwort ändern','Изменить пароль','Cambiar contraseña')}</button>
          <button id="acct-logout-all" style="${secBtn}margin-bottom:0;">${_authL('Log out on all devices','すべての端末からログアウト','Auf allen Geräten abmelden','Выйти на всех устройствах','Cerrar sesión en todos')}</button>
        </div>
        <button id="acct-logout" style="width:100%;background:var(--input-bg);color:var(--info-mil);border:none;padding:10px;border-radius:9px;font-weight:600;font-size:13px;cursor:pointer;margin-top:12px;">${HOST.lang==='jp'?'ログアウト':HOST.lang==='de'?'Abmelden':HOST.lang==='ru'?'Выйти':HOST.lang==='es'?'Cerrar sesión':'Log out'}</button>
        <button id="acct-delete" style="width:100%;background:transparent;color:#ff3b30;border:1px solid rgba(255,59,48,0.4);padding:9px;border-radius:9px;font-weight:600;font-size:12.5px;cursor:pointer;margin-top:8px;">${_authL('Delete account','アカウントを削除','Konto löschen','Удалить аккаунт','Eliminar cuenta')}</button>
        <button id="acct-close" style="width:100%;background:transparent;border:none;color:var(--text-muted);margin-top:6px;padding:6px;cursor:pointer;font-size:13px;">${HOST.lang==='jp'?'閉じる':HOST.lang==='de'?'Schließen':HOST.lang==='ru'?'Закрыть':HOST.lang==='es'?'Cerrar':'Close'}</button>
      </div>`;
      document.body.appendChild(m);
      /* Avatar picker (#28): emoji + color, stored locally (and used as the account-button icon). */
      const AV_EMOJI=['👤','🌍','🛰️','⚓','✈️','🛡️','📡','⛰️','🗺️','🔭','📰','🏛️','🦅','🐻','🐉','🌐'];
      const pick=document.getElementById('acct-avatar-pick');
      pick.innerHTML=AV_EMOJI.map(e=>`<button class="acct-emoji" data-e="${e}">${e}</button>`).join('');
      pick.querySelectorAll('.acct-emoji').forEach(b=>b.onclick=()=>{ window.imSetAvatarImg(''); window.imSetAvatar(b.dataset.e); pick.querySelectorAll('.acct-emoji').forEach(x=>x.classList.toggle('sel',x===b)); const pv=document.getElementById('acct-avatar-preview'); pv.style.backgroundImage=''; pv.textContent=b.dataset.e; });
      /* Upload a custom avatar image (#28) — compressed, stored locally + pushed to the profile if the column exists. */
      const af=document.getElementById('acct-avatar-file');
      if(af) af.onchange=async()=>{ const f=af.files&&af.files[0]; af.value=''; if(!f) return; try{
        /* Crop to a square first (#12), then store the cropped 256² image. */
        const data=await window.imCropImage(f); if(!data) return;
        window.imSetAvatarImg(data); const pv=document.getElementById('acct-avatar-preview'); pv.style.backgroundImage=`url('${data}')`; pv.textContent='';
        document.querySelectorAll('#acct-avatar-pick .acct-emoji').forEach(x=>x.classList.remove('sel'));
        try{ await HOST.DB.from('profiles').update({avatar_url:data}).eq('id',HOST.user.id); }catch(_){}
      }catch(_){ HOST.imToast(HOST.lang==='jp'?'画像を読み込めませんでした':HOST.lang==='de'?'Bild konnte nicht geladen werden':HOST.lang==='ru'?'Не удалось загрузить изображение':HOST.lang==='es'?'No se pudo cargar la imagen':'Could not load image'); } };
      m.onclick=(e)=>{ if(e.target===m) m.style.display='none'; };
      document.getElementById('acct-close').onclick=()=>{ m.style.display='none'; };
      document.getElementById('acct-logout').onclick=()=>{
        /* (#R33) Confirm before logging out. */
        if(!window.confirm(HOST.lang==='jp'?'ログアウトしますか？':HOST.lang==='de'?'Vom Konto abmelden?':HOST.lang==='ru'?'Выйти из аккаунта?':HOST.lang==='es'?'¿Cerrar la sesión?':'Log out of your account?')) return;
        /* Instant: clear local state + UI right away, revoke the session in the background. */
        m.style.display='none';
        HOST.user=null; HOST.bookmarks=[];
        try{ HOST.updateAccountButton(); }catch(_){}
        try{ if(typeof HOST.renderUI==='function') HOST.renderUI(); }catch(_){}
        try{ window.refreshProUI&&window.refreshProUI(); }catch(_){}
        try{ HOST.DB.auth.signOut(); }catch(_){}   /* onAuthStateChange will reconcile favorites/community */
        try{ HOST.imToast(HOST.lang==='jp'?'ログアウトしました':HOST.lang==='de'?'Abgemeldet':HOST.lang==='ru'?'Вы вышли из аккаунта':HOST.lang==='es'?'Sesión cerrada':'Logged out'); }catch(_){}
      };
      document.getElementById('acct-save').onclick=async()=>{
        const name=document.getElementById('acct-name').value.trim(), msg=document.getElementById('acct-msg');
        const bio=(document.getElementById('acct-bio')||{}).value||'';
        if(!name){ msg.textContent=HOST.lang==='jp'?'表示名を入力してください。':HOST.lang==='de'?'Anzeigename darf nicht leer sein.':HOST.lang==='ru'?'Имя не может быть пустым.':HOST.lang==='es'?'El nombre no puede estar vacío.':'Display name cannot be empty.'; return; }
        const btn=document.getElementById('acct-save'); btn.disabled=true; msg.textContent=HOST.lang==='jp'?'保存中…':HOST.lang==='de'?'Speichere…':HOST.lang==='ru'?'Сохранение…':HOST.lang==='es'?'Guardando…':'Saving…';
        try{
          const {error}=await HOST.DB.from('profiles').update({display_name:name}).eq('id',HOST.user.id); if(error) throw error;
          try{ await HOST.DB.auth.updateUser({data:{display_name:name}}); }catch(_){}
          /* bio + avatar_url are best-effort (columns may not exist yet — see supabase_profiles_extra.sql) */
          try{ await HOST.DB.from('profiles').update({bio:bio.trim()}).eq('id',HOST.user.id); }catch(_){}
          try{ localStorage.setItem('intmap_bio',bio.trim()); }catch(_){}
          HOST.user.name=name; HOST.user.bio=bio.trim(); HOST.updateAccountButton(); msg.textContent=HOST.lang==='jp'?'保存しました。':HOST.lang==='de'?'Gespeichert.':HOST.lang==='ru'?'Сохранено.':HOST.lang==='es'?'Guardado.':'Saved.';
          if(HOST.mode==='community') HOST.loadCommunity();
          setTimeout(()=>{ m.style.display='none'; }, 600);
        }catch(e){ msg.textContent='Error: '+((e&&e.message)||e); }
        finally{ btn.disabled=false; }
      };
      /* ---- (#R155) Security section: passkeys / change email / change password / logout-all / delete ---- */
      const _addPk=document.getElementById('acct-add-passkey');
      if(_addPk) _addPk.onclick=async()=>{ const msg=document.getElementById('acct-msg');
        if(!_passkeysAvailable()||typeof HOST.DB.auth.registerPasskey!=='function'){ msg.textContent=_authL('Passkeys aren\'t available on this device.','この端末ではパスキーを利用できません。','Passkeys sind auf diesem Gerät nicht verfügbar.','Паскеи недоступны на этом устройстве.','Los passkeys no están disponibles en este dispositivo.'); return; }
        msg.textContent=_authL('Follow your device prompt to create a passkey…','端末の指示に従ってパスキーを作成してください…','Folge der Geräteaufforderung, um einen Passkey zu erstellen…','Следуйте подсказке устройства, чтобы создать паскей…','Sigue la indicación de tu dispositivo para crear un passkey…');
        try{ const {error}=await HOST.DB.auth.registerPasskey(); if(error) throw error; msg.textContent=_authL('Passkey added.','パスキーを追加しました。','Passkey hinzugefügt.','Паскей добавлен.','Passkey añadido.'); _renderPasskeys(); }
        catch(e){ msg.textContent=_authL('Could not add a passkey (or it was cancelled).','パスキーを追加できませんでした（またはキャンセルされました）。','Passkey konnte nicht hinzugefügt werden (oder abgebrochen).','Не удалось добавить паскей (или отменено).','No se pudo añadir el passkey (o se canceló).'); }
      };
      document.getElementById('acct-change-email').onclick=async()=>{ const msg=document.getElementById('acct-msg');
        const ne=window.prompt(_authL('New email address:','新しいメールアドレス：','Neue E-Mail-Adresse:','Новый e-mail:','Nuevo correo:')); if(ne==null) return;
        if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ne.trim())){ msg.textContent=_authL('That doesn\'t look like an email.','メールアドレスの形式ではありません。','Das sieht nicht wie eine E-Mail aus.','Это не похоже на e-mail.','Eso no parece un correo.'); return; }
        msg.textContent=_authL('Sending confirmation…','確認メールを送信中…','Bestätigung wird gesendet…','Отправка подтверждения…','Enviando confirmación…');
        try{ const {error}=await HOST.DB.auth.updateUser({email:ne.trim()}); if(error) throw error;
          msg.textContent=_authL('Confirm the change from the link sent to your new email (and, if asked, your current one).','新しいメールに届いたリンクから変更を確認してください（求められた場合は現在のメールも）。','Bestätige die Änderung über den Link an deine neue E-Mail (und ggf. deine aktuelle).','Подтвердите изменение по ссылке на новый e-mail (и, если попросят, на текущий).','Confirma el cambio desde el enlace enviado a tu nuevo correo (y al actual si se solicita).');
        }catch(e){ msg.textContent=_authL('Could not change the email.','メールアドレスを変更できませんでした。','E-Mail konnte nicht geändert werden.','Не удалось изменить e-mail.','No se pudo cambiar el correo.'); }
      };
      document.getElementById('acct-change-pw').onclick=()=>_openSetPassword(false);
      document.getElementById('acct-logout-all').onclick=async()=>{
        if(!window.confirm(_authL('Log out on ALL devices? You\'ll need to sign in again everywhere.','すべての端末からログアウトしますか？各端末で再度ログインが必要になります。','Auf ALLEN Geräten abmelden? Du musst dich überall neu anmelden.','Выйти на ВСЕХ устройствах? Потребуется войти заново везде.','¿Cerrar sesión en TODOS los dispositivos? Tendrás que volver a iniciar sesión.'))) return;
        m.style.display='none'; HOST.user=null; HOST.bookmarks=[];
        try{ HOST.updateAccountButton(); }catch(_){}
        try{ if(typeof HOST.renderUI==='function') HOST.renderUI(); }catch(_){}
        try{ window.refreshProUI&&window.refreshProUI(); }catch(_){}
        try{ await HOST.DB.auth.signOut({scope:'global'}); }catch(_){ try{ await HOST.DB.auth.signOut(); }catch(__){} }
        try{ HOST.imToast(_authL('Logged out on all devices','すべての端末からログアウトしました','Auf allen Geräten abgemeldet','Выход выполнен на всех устройствах','Sesión cerrada en todos los dispositivos')); }catch(_){}
      };
      document.getElementById('acct-delete').onclick=async()=>{ const msg=document.getElementById('acct-msg');
        const typed=window.prompt(_authL('This PERMANENTLY deletes your account and all your data — it cannot be undone. Type your email to confirm:','これはアカウントと全データを完全に削除します（取り消せません）。確認のためメールアドレスを入力：','Dies löscht dein Konto und alle Daten DAUERHAFT — nicht umkehrbar. Gib zur Bestätigung deine E-Mail ein:','Это НАВСЕГДА удалит аккаунт и все данные — отменить нельзя. Введите e-mail для подтверждения:','Esto elimina PERMANENTEMENTE tu cuenta y todos tus datos, sin vuelta atrás. Escribe tu correo para confirmar:'));
        if(typed==null) return;
        if((typed||'').trim().toLowerCase()!==String(HOST.user.email||'').toLowerCase()){ msg.textContent=_authL('That didn\'t match your email — cancelled.','メールアドレスが一致しません。キャンセルしました。','Stimmt nicht mit deiner E-Mail überein — abgebrochen.','Не совпадает с вашим e-mail — отменено.','No coincide con tu correo — cancelado.'); return; }
        msg.textContent=_authL('Deleting your account…','アカウントを削除中…','Konto wird gelöscht…','Удаление аккаунта…','Eliminando tu cuenta…');
        try{
          const sres=await HOST.DB.auth.getSession(); const session=sres&&sres.data&&sres.data.session;
          const r=await fetch(window.SUPABASE_URL+'/functions/v1/delete-account',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+((session&&session.access_token)||''),'apikey':window.SUPABASE_ANON_KEY},body:JSON.stringify({confirm:'DELETE'})});
          const j=await r.json().catch(()=>({}));
          if(!r.ok||!j.ok) throw new Error(j.message||'delete failed');
          try{ await HOST.DB.auth.signOut(); }catch(_){}
          HOST.user=null; HOST.bookmarks=[];
          try{ Object.keys(localStorage).forEach(k=>{ if(/^(intmap_|sb-)/.test(k)) localStorage.removeItem(k); }); }catch(_){}
          try{ HOST.updateAccountButton(); if(typeof HOST.renderUI==='function') HOST.renderUI(); }catch(_){}
          m.style.display='none';
          try{ HOST.imToast(_authL('Your account has been deleted.','アカウントを削除しました。','Dein Konto wurde gelöscht.','Ваш аккаунт удалён.','Tu cuenta ha sido eliminada.')); }catch(_){}
        }catch(e){ msg.textContent=_authL('Could not delete the account. Please try again or contact support.','アカウントを削除できませんでした。もう一度試すかサポートへご連絡ください。','Konto konnte nicht gelöscht werden. Bitte erneut versuchen oder Support kontaktieren.','Не удалось удалить аккаунт. Повторите попытку или обратитесь в поддержку.','No se pudo eliminar la cuenta. Inténtalo de nuevo o contacta soporte.'); }
      };
    }
    document.getElementById('acct-email').textContent=HOST.user.email;
    try{ _renderPasskeys(); }catch(_){}
    document.getElementById('acct-name').value=HOST.user.name||'';
    document.getElementById('acct-msg').textContent='';
    /* avatar preview + current selection */
    { const av=window.imGetAvatar(), img=window.imGetAvatarImg(); const prev=document.getElementById('acct-avatar-preview');
      if(prev){ if(img){ prev.style.backgroundImage=`url('${img}')`; prev.textContent=''; } else { prev.style.backgroundImage=''; prev.textContent=av; prev.style.background='hsl('+(window.imAvatarHue())+',58%,46%)'; } }
      document.querySelectorAll('#acct-avatar-pick .acct-emoji').forEach(b=>b.classList.toggle('sel',!img&&b.dataset.e===av)); }
    { const bioEl=document.getElementById('acct-bio'); if(bioEl){ let b=HOST.user.bio; if(b==null){ try{ b=localStorage.getItem('intmap_bio')||''; }catch(_){ b=''; } } bioEl.value=b||''; } }
    /* (#R10) Pro status / upgrade row removed — the app is fully free, no plan indicator. Admin still
       shown for moderators. */
    const proRow=document.getElementById('acct-pro');
    if(proRow){
      if(HOST.user && HOST.user.isAdmin){ proRow.style.display=''; proRow.innerHTML=`<span style="color:var(--text-muted);font-weight:600;font-size:12px;">· admin</span>`; }
      else { proRow.style.display='none'; proRow.innerHTML=''; }
    }
    m.style.display='flex';
  }

  async function refreshCurrentUser(sessionArg){
    if(!HOST.DB){ HOST.user=null; return; }
    /* Accept a session passed in from onAuthStateChange so we don't re-enter getSession() while the
       auth lock is held (that re-entry is the supabase-js v2 deadlock behind "logged in but the UI
       never updates", #14). Only call getSession() when invoked standalone (sessionArg===undefined). */
    let session=sessionArg;
    if(session===undefined){ try{ const r=await HOST.DB.auth.getSession(); session=(r&&r.data)?r.data.session:null; }catch(_){ session=null; } }
    if(!session){ HOST.user=null; HOST.updateAccountButton(); return; }
    const meta=session.user.user_metadata||{};
    let isAdmin=false, isPro=false, name='';
    try{
      /* try to read is_pro too; if that column doesn't exist yet, fall back to the basic select */
      let r=await HOST.DB.from('profiles').select('display_name,is_admin,is_pro').eq('id',session.user.id).maybeSingle();
      if(r.error) r=await HOST.DB.from('profiles').select('display_name,is_admin').eq('id',session.user.id).maybeSingle();
      const prof=r.data;
      if(prof){ isAdmin=!!prof.is_admin; isPro=!!prof.is_pro; if(prof.display_name) name=prof.display_name; }
      /* First login after email/OAuth signup: copy the chosen name (or OAuth name) into the profile */
      if(!name){ const want=meta.display_name||meta.full_name||meta.name||''; if(want){ try{ await HOST.DB.from('profiles').update({display_name:want}).eq('id',session.user.id); name=want; }catch(_){} } }
    }catch(_){}
    /* (#R33) PRIVACY: never derive the public name from the email (its local part would expose part of the
       address in community posts). Fall back to a neutral handle from the user id instead. */
    if(!name) name='User-'+String(session.user.id||'').replace(/[^a-z0-9]/gi,'').slice(0,5);
    HOST.user={ id:session.user.id, email:session.user.email, name, isAdmin, isPro:isPro||isAdmin }; HOST.updateAccountButton();
    /* (#R35) Persist the developer flag the moment the OWNER account logs in, so "unlimited AI" is recognised
       SYNCHRONOUSLY everywhere afterward — even before currentUser repopulates on the next load. This is why
       the Settings usage graph "wasn't reflecting unlimited": aiRenderSettings could run before the async
       email arrived. Persist + re-render now. */
    try{ if(/2ppzc4kk6r@privaterelay\.appleid\.com/i.test(HOST.user.email||'')) localStorage.setItem('intmap_dev','1'); }catch(_){}
    try{ window.aiRenderSettings&&window.aiRenderSettings(); }catch(_){}
    try{ window.refreshProUI&&window.refreshProUI(); }catch(_){}
    try{ window._syncPrefsDown&&window._syncPrefsDown(); }catch(_){}   /* (#R20) pull the account's saved settings/presets/widgets */
  }

  /* ---------- FAVORITES (★ saved articles) ---------- */
  async function loadFavorites(){
    if(!HOST.user||!HOST.DB) return;
    const {data,error}=await HOST.DB.from('favorites').select('article_link,article_title');   /* (#R210) the title too — see IntMapNewsSaved.seed */
    if(error){ console.warn('[IntMap] favorites load:', error.message); return; }
    let cloud=(data||[]).map(r=>r.article_link);
    /* one-time merge of any favorites saved as a guest before logging in */
    let local=[]; try{ local=JSON.parse(localStorage.getItem('intmap_bookmarks'))||[]; }catch(_){}
    const toAdd=local.filter(l=>!cloud.includes(l));
    if(toAdd.length){ try{ await HOST.DB.from('favorites').insert(toAdd.map(l=>({user_id:HOST.user.id,article_link:l}))); cloud=cloud.concat(toAdd); }catch(_){}
      try{ localStorage.removeItem('intmap_bookmarks'); }catch(_){} }
    HOST.bookmarks=cloud;
    /* (#R210) a browser that has never drawn these articles still needs something to draw. The
       account carries the title; the rest of the card (outlet, date, image) is filled in the next
       time the article appears in a live feed. */
    try{ window.IntMapNewsSaved&&window.IntMapNewsSaved.seed(data||[]); }catch(_){}
  }

  /* ---------- REALTIME (live auto-reflect) ---------- */
  function subscribeRealtime(){
    if(!HOST.DB||!HOST.DB.channel) return;
    try{
      HOST.DB.channel('intmap-public')
        .on('postgres_changes',{event:'*',schema:'public',table:'geo_pins'},        ()=>loadGeoFromSupabase().then(()=>{ try{ if(HOST.globalData&&HOST.globalData.length) HOST.renderUI(); }catch(_){} }))
        .on('postgres_changes',{event:'*',schema:'public',table:'dashboard_cards'}, ()=>HOST.loadDashFromSupabase().then(()=>{ try{ if(HOST.mode==='info') HOST.renderDashboard(); }catch(_){} }))
        .on('postgres_changes',{event:'*',schema:'public',table:'community_posts'},    ()=>HOST.loadCommunity())
        .on('postgres_changes',{event:'*',schema:'public',table:'community_comments'}, ()=>{ if(HOST.mode==='community') HOST.loadCommunity(); })
        .on('postgres_changes',{event:'*',schema:'public',table:'community_votes'},    ()=>{ if(HOST.mode==='community') HOST.loadCommunity(); })
        .on('postgres_changes',{event:'*',schema:'public',table:'current_news'},       ()=>{ try{ if(window.__IM_USE_SERVER_NEWS!==false && !HOST.activeSearchQuery&&!HOST.newsDate&&HOST.newsLangMode!=='multi') HOST.loadNewsFromSupabase(); }catch(_){} })   /* (#R40) gated off while the server feed is temporarily disabled */
        .subscribe();
    }catch(e){ console.warn('[IntMap] realtime subscribe failed:', e&&e.message); }
  }

  /* ---------- BOOT ---------- */
  async function bootSupabase(){
    if(!HOST.DB){ console.warn('[IntMap] Supabase unavailable — load supabase.js / supabase-config.js. Running with empty data.'); return; }
    injectAuthUI();
    /* Register the auth listener FIRST so the SIGNED_IN event fired while supabase parses the OAuth
       token out of the redirect URL is never missed (a cause of "logged in but not logged in", #33). */
    HOST.DB.auth.onAuthStateChange((event,session)=>{
      /* (#R7-login) IMMEDIATE, synchronous, lock-safe reflection: the instant Supabase parses the
         Google OAuth token out of the redirect URL it fires here. Update the account button RIGHT NOW
         from the event's own session (no Supabase calls — those would re-enter the held auth lock and
         deadlock, #14), so the UI shows "logged in" without waiting for the profile fetch or a reload. */
      try{
        /* (#R155) The user followed a "reset password" email link → prompt for a new password. */
        if(event==='PASSWORD_RECOVERY'){ try{ const am=document.getElementById('auth-modal'); if(am) am.style.display='none'; }catch(_){} try{ _openSetPassword(true); }catch(_){} }
        if(session&&session.user){
          if(!HOST.user||HOST.user.id!==session.user.id){
            const m=session.user.user_metadata||{};
            HOST.user={ id:session.user.id, email:session.user.email||'', name:(m.display_name||m.full_name||m.name||('User-'+String(session.user.id||'').replace(/[^a-z0-9]/gi,'').slice(0,5))), isAdmin:false, isPro:false };
          }
          try{ HOST.updateAccountButton(); }catch(_){}
          try{ const am=document.getElementById('auth-modal'); if(am && am.style.display!=='none') am.style.display='none'; }catch(_){}
        } else if(event==='SIGNED_OUT'){ HOST.user=null; try{ HOST.updateAccountButton(); }catch(_){} }
      }catch(_){}
      /* Then the heavier enrich (profile name / admin / pro, favorites, tab re-render) deferred a tick
         so the auth lock is released first. */
      setTimeout(async()=>{
        await refreshCurrentUser(session||null); await loadFavorites();
        try{ if(HOST.mode==='news'||HOST.mode==='saved') HOST.startNews(); }catch(_){}
        try{ if(HOST.mode==='community') HOST.loadCommunity(); }catch(_){}
        try{ const am=document.getElementById('auth-modal'); if(HOST.user && am && am.style.display!=='none') am.style.display='none'; }catch(_){}   /* close the login modal once signed in */
        try{ HOST.renderUI(); }catch(_){}            /* reflect the new auth state in the active tab immediately */
        /* Pro entitlement may have changed → re-check satellite provider access */
        try{ if(HOST.mapType==='sat'){ const cur=HOST.satProviderById(HOST.satState.providerId); if(cur&&cur.tier==='pro'&&!HOST.satHasKey(cur)) HOST.satRevertToFallback(); else HOST.satRenderController(); } }catch(_){}
        try{ if(HOST.user) HOST.aiFetchUsage(); }catch(_){}   /* (#R27) refresh today's AI-quota for the signed-in user */
      },0);
    });
    await refreshCurrentUser();
    /* OAuth implicit-flow tokens land in the URL hash and are parsed asynchronously; if the very
       first getSession ran a hair too early, re-check a couple of times so the session is picked up
       without needing a manual reload (#33). */
    if(!HOST.user && /[#&?](access_token|code|refresh_token)=/.test(location.href)){
      /* (#R8) Poll long enough to cover a slow PKCE code-exchange round-trip — the implicit-flow hash
         parse is near-instant, but a ?code= exchange needs a network hop to Supabase. Reflect each tick. */
      for(let i=0;i<16 && !HOST.user;i++){ await new Promise(r=>setTimeout(r,400)); try{ await refreshCurrentUser(); }catch(_){} if(HOST.user){ try{ HOST.updateAccountButton(); HOST.renderUI(); }catch(_){} } }
      try{ if(HOST.user){ await loadFavorites(); HOST.renderUI(); } }catch(_){}
      try{ if(HOST.user){ HOST.recordLogin(); HOST.aiFetchUsage(); } }catch(_){}   /* (#R27) an OAuth return is a genuine login */
      /* (#R8) Only scrub the token AFTER a session is in hand. Scrubbing while the exchange is still
         pending throws away the code and forces a manual reload — the exact "戻ると未ログイン" symptom. */
      try{ if(HOST.user && (location.protocol==='http:'||location.protocol==='https:')) history.replaceState(null,'',location.origin+location.pathname); }catch(_){}
    }
    /* (#R8) Safety nets so login reflects the instant the user returns from Google — no manual reload.
       focus + visibilitychange cover a tab switch; pageshow covers a BFCACHE restore (back button from
       Google, where focus/visibilitychange often DON'T fire — the missing case behind "戻ると未ログイン");
       storage covers the session being written by another tab or the Supabase auth helper. */
    let _authRecheck=0;
    const _recheckAuth=(force)=>{ if(!force && _authRecheck && Date.now()-_authRecheck<1200) return; _authRecheck=Date.now();
      setTimeout(async()=>{ try{ const had=!!HOST.user; await refreshCurrentUser(); if(!!HOST.user!==had){ try{ HOST.updateAccountButton(); HOST.renderUI(); }catch(_){} if(HOST.user) try{ await loadFavorites(); }catch(_){} } }catch(_){} },0); };
    window.addEventListener('focus',()=>_recheckAuth());
    document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible') _recheckAuth(); });
    window.addEventListener('pageshow',(e)=>{ _recheckAuth(!!(e&&e.persisted)); });
    window.addEventListener('storage',(e)=>{ if(e&&e.key&&/sb-|supabase|auth/i.test(e.key)) _recheckAuth(true); });
    await Promise.all([ loadGeoFromSupabase(), HOST.loadDashFromSupabase(), loadFavorites() ]);
    try{ HOST.renderUI(); }catch(_){}          /* re-render the active tab now data + favorites are in */
    try{ HOST.loadCommunity(); }catch(_){}      /* prime the community map pins */
    subscribeRealtime();
  }

  /* The names index.html still calls: it keeps a hoisted shim for each (#R168). */
  return { bootSupabase, _openSetPassword, openAuthModal };
};
