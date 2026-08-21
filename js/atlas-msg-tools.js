/* ============================================================================
 *  IntMap · Atlas — the per-message tool bar, and editing a message in place   (#R298)
 * ----------------------------------------------------------------------------
 *  One small row under every message in the conversation: Copy on both sides (#R296), Retry under
 *  Atlas's reply (#R72), Copy + Edit under the reader's own (#R298). Edit opens the message IN
 *  PLACE — the bubble is hidden, never rewritten — and sending REWINDS the exchange to that turn
 *  instead of appending a new one. The auto-scroll that puts the reader's message at the top of the
 *  viewport when a reply lands (#R122) belongs to the same row, because it is what has to step over
 *  it. The CSS is here too: the kernel owns the one <style>, so this exports the rules and the
 *  kernel concatenates them where they stood.
 *
 *  ⚠ ITS OWN FILE BECAUSE js/atlas-console.js HAS A LINE CEILING (tests/r199-checks ⑤,
 *  tests/r200-checks ⑤, tests/r278-checks ⑦: under 5,300, and it follows the floor DOWN). The rule
 *  the kernel writes down beside that ceiling is that «a feature moves out, never that the ceiling
 *  moves up», so a whole subject left — the bar, its styles and the editor together. A real ES
 *  module exactly like js/atlas-attach.js: nothing registers it on window.IntMapModules and nothing
 *  orders it in src/main.js; js/atlas-console.js names it in an `import`, so the bundler resolves
 *  the binding and a rename is a BUILD error rather than a silent undefined.
 *
 *  ⚠ MOVED VERBATIM. Every line below stood in js/atlas-console.js, its indentation included, so
 *  the two revisions diff line for line. The only edits are the four values the kernel keeps and
 *  this module therefore reads through CTX — each of them is REASSIGNED or written at runtime, so
 *  a copy of the value would go stale (Architecture.md §3.1 makes the same argument for HOST):
 *      chatEl              -> CTX.chat()        (null until the panel is built)
 *      run(…)              -> CTX.run(…)        (the kernel's own local)
 *      _stopRun()          -> CTX.stopRun()     (likewise)
 *      _hist=_hist.filter(…) -> CTX.rewindHist(t)  (only the kernel may truncate its history)
 *  The `''` seed and the closing `;` of each CSS constant are the only characters added.
 * ==========================================================================*/

/* the desktop rules, in the order and the wording they had inside the kernel's style string */
export const MSG_TOOLS_CSS = ''
        /* (#R72/#R296) per-message tools under every Atlas reply (copy + retry) AND under the reader's own (copy + edit) */
        +'#atlas-panel .atl-msgt{display:flex;gap:2px;margin:4px 0 0;align-self:flex-start;opacity:0.55;transition:opacity .15s ease;}'
        +'#atlas-panel .atl-b.a:hover + .atl-msgt,#atlas-panel .atl-b.u:hover + .atl-msgt,#atlas-panel .atl-msgt:hover{opacity:1;}'
        /* (#R296) the reader's own bar is right-aligned like their message. ⚠ (#R298) 「コピーボタンは…ホバーしたときのみ表
           示…間隔を狭めて」— THIS bar only (Atlas's own is untouched): hidden until the bubble or the bar is hovered/focused,
           and 2px under the bubble instead of 14px (= .atl-chat's 10px gap BETWEEN MESSAGES + this bar's 4px margin; the gap
           is what separates MESSAGES, so the margin is what gives). ⚠ THE 2px IS PADDING, NOT MARGIN: the margin cancels the
           gap exactly (10−10) so the bar's box TOUCHES the bubble, and the pointer never crosses a strip where neither :hover
           matches. ⚠ AND pointer-events:none IS ON THE BUTTONS, NOT ON THE BAR — measured: put it on the bar and the bar can
           no longer be hit-tested, so `.atl-msgt-u:hover` never matches and the buttons are unreachable for any pointer that
           did not arrive across the bubble. The buttons still cannot be clicked while invisible. A touch screen has no hover,
           so there the bar keeps its old always-visible 0.55; a keyboard reaches it through :focus-within. */
        +'#atlas-panel .atl-msgt-u{align-self:flex-end;margin:-10px 0 0;padding-top:2px;opacity:0;}#atlas-panel .atl-msgt-u button{pointer-events:none;}'
        +'#atlas-panel .atl-b.u:hover + .atl-msgt-u,#atlas-panel .atl-msgt-u:hover,#atlas-panel .atl-msgt-u:focus-within{opacity:1;}#atlas-panel .atl-b.u:hover + .atl-msgt-u button,#atlas-panel .atl-msgt-u:hover button,#atlas-panel .atl-msgt-u:focus-within button{pointer-events:auto;}@media(hover:none){#atlas-panel .atl-msgt-u{opacity:0.55;}#atlas-panel .atl-msgt-u button{pointer-events:auto;}}'
        +'#atlas-panel .atl-msgt button{background:none;border:none;color:var(--text-muted);cursor:pointer;padding:3px 6px;border-radius:7px;display:inline-flex;align-items:center;gap:4px;font-size:10.5px;}'
        +'#atlas-panel .atl-msgt button:hover{background:var(--input-bg);color:var(--text-main);}'
        +'#atlas-panel .atl-edit{align-self:flex-end;width:92%;box-sizing:border-box;display:flex;flex-direction:column;gap:8px;padding:10px;border-radius:16px;border:1px solid var(--glass-border,rgba(128,128,128,0.28));background:var(--card-bg);box-shadow:0 2px 10px rgba(0,0,0,0.14);}'   /* (#R298) the in-place editor Edit opens — it stands where the hidden bubble was, and its geometry mirrors the composer (.atl-in) */
        +'#atlas-panel .atl-edit-in{width:100%;box-sizing:border-box;min-height:38px;max-height:220px;padding:9px 12px;border-radius:14px;border:1px solid rgba(128,128,128,0.25);background:var(--input-bg);color:var(--text-main);font-size:13px;line-height:1.45;font-family:inherit;outline:none;resize:none;overflow-y:auto;display:block;}#atlas-panel .atl-edit-in:focus{border-color:var(--primary-color);box-shadow:0 0 0 3px rgba(10,132,255,0.18);}#atlas-panel .atl-edit-btns{display:flex;justify-content:flex-end;gap:8px;}'
        +'#atlas-panel .atl-edit-btns button{border:1px solid var(--glass-border,rgba(128,128,128,0.3));background:var(--input-bg);color:var(--text-main);border-radius:14px;padding:6px 14px;font-size:11.5px;font-weight:600;font-family:inherit;cursor:pointer;}#atlas-panel .atl-edit-btns button:hover{border-color:var(--primary-color);color:var(--primary-color);}#atlas-panel .atl-edit-btns .atl-edit-go{background:var(--primary-color);border-color:transparent;color:#fff;}#atlas-panel .atl-edit-btns .atl-edit-go:hover{filter:brightness(1.07);border-color:transparent;color:#fff;}'
        ;

/* …and the overrides that belong INSIDE the kernel's @media(max-width:768px) block */
export const MSG_TOOLS_CSS_MOBILE = ''
        +'body:not(.ws-mode) #atlas-panel.atl-tab .atl-msgt-u{margin:-12px 0 0;}body:not(.ws-mode) #atlas-panel.atl-tab .atl-edit{width:96%;}body:not(.ws-mode) #atlas-panel.atl-tab .atl-edit-in{min-height:44px;border-radius:16px;padding:11px 14px;font-size:16px;}body:not(.ws-mode) #atlas-panel.atl-tab .atl-edit-btns button{font-size:14px;padding:9px 16px;}'   /* (#R298) the mobile .atl-chat gap is 12px, so −12 cancels it and the desktop rule's 2px padding still supplies the spacing; 16px in the editor kills the iOS focus auto-zoom exactly as .atl-in does, and the buttons grow to a real touch target */
        ;

/** THE ONE ENTRY POINT: the kernel calls this once and keeps the three builders it returns —
 *  `copyBtn`/`editBtn` for the reader's own bubble, `msgTools` for a finished reply. The editor's
 *  own closer stays private: it is reached from the box it opens, and nothing outside can hold a
 *  half-open editor (the chat is never cleared and the panel is never rebuilt). */
export function makeMsgTools(CTX){
  const L=CTX.L, esc=CTX.esc;   /* rebound under their original names so the body below stays verbatim — the same device the kernel uses for HOST */
    /* (#R72) per-reply tools: copy + retry on ATLAS messages. ⚠⚠ (#R296) …AND ON THE READER'S OWN
       (「Atlasはユーザーが送ったメッセージもコピーできるように」): ONE function, so the two cannot disagree.
       A user bubble gets Copy + Edit (#R298), not Retry — their own sentence's Retry is under the reply it produced. */
    function copyBtn(src){
      const cpSvg='<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>';
      const b=document.createElement('button');
      b.type='button';
      b.innerHTML=cpSvg+'<span>'+L('Copy','コピー','Kopieren','Копировать','Copiar')+'</span>';
      b.title=L('Copy message','メッセージをコピー','Nachricht kopieren','Скопировать','Copiar mensaje');
      b.onclick=()=>{ try{ navigator.clipboard.writeText(src.innerText||''); const sp=b.querySelector('span'); if(sp){ const t2=sp.textContent; sp.textContent='✓'; setTimeout(()=>{ sp.textContent=t2; },1200); } }catch(_){} };
      return b; }
    /* ⚠⚠ (#R298) 「その横に編集ボタンを付けて」 — EDIT REWINDS, IT DOES NOT APPEND. Retry puts a fresh exchange UNDER the old
       one, which is right for "run that again"; an edited message is a CORRECTION, so sending it removes that message and
       everything after it, truncates the rolling history to the same turn, supersedes whatever is still running exactly as
       the Stop button does, and re-runs the turn with its ORIGINAL attachments. The text is the `q` run() was given — never
       read back out of the bubble, whose HTML went through esc(). Editing happens IN PLACE: the bubble and its tool bar are
       only HIDDEN, so Cancel (or Esc, or an empty edit) restores a message that was never rewritten. */
    let _atlEd=null;   /* {box,b,bd,bar,rd} = the ONE open editor; opening another closes it first */
    /* ⚠ the whole `style` ATTRIBUTE is saved and put back, not just .style.display: setting display back to '' leaves an
       empty style="" behind, and "restores the message" has to mean the element is what it was, byte for byte. */
    function _atlEdClose(){ const e=_atlEd; _atlEd=null; if(!e) return; const st=(el,v)=>{ if(!el) return; if(v==null) el.removeAttribute('style'); else el.setAttribute('style',v); };
      try{ e.box.remove(); st(e.b,e.bd); st(e.bar,e.rd); }catch(_){} }
    function _atlEdGrow(ta){ try{ ta.style.height='auto'; ta.style.height=Math.min(220,Math.max(38,ta.scrollHeight))+'px'; }catch(_){} }   /* the box follows the text, like .atl-in's autoGrow */
    function editBtn(src,ed){ const b=document.createElement('button'); b.type='button';
      b.innerHTML='<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg><span>'+L('Edit','編集','Bearbeiten','Изменить','Editar')+'</span>';
      b.title=L('Edit message','メッセージを編集','Nachricht bearbeiten','Изменить сообщение','Editar mensaje');
      b.onclick=()=>_atlEdOpen(src,ed); return b; }
    function _atlEdOpen(src,ed){ try{ if(!src||!src.parentElement) return; _atlEdClose();
      const nx=src.nextElementSibling, bar=(nx&&nx.classList&&nx.classList.contains('atl-msgt'))?nx:null;
      const box=document.createElement('div'); box.className='atl-edit';
      box.innerHTML='<textarea class="atl-edit-in" rows="1" aria-label="'+esc(L('Edit message','メッセージを編集','Nachricht bearbeiten','Изменить сообщение','Editar mensaje'))+'"></textarea><div class="atl-edit-btns"><button type="button" class="atl-edit-x">'+esc(L('Cancel','キャンセル','Abbrechen','Отмена','Cancelar'))+'</button><button type="button" class="atl-edit-go">'+esc(L('Send','送信','Senden','Отправить','Enviar'))+'</button></div>';
      const ta=box.querySelector('.atl-edit-in'); ta.value=String((ed&&ed.q)||'');
      const send=()=>{ const v=String(ta.value||'').trim(); _atlEdClose(); if(v) _atlEdSend(src,ed,v); };   /* empty / whitespace only = Cancel */
      ta.addEventListener('input',()=>_atlEdGrow(ta));
      ta.addEventListener('keydown',e=>{ if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); send(); } else if(e.key==='Escape'){ e.preventDefault(); _atlEdClose(); } });   /* Shift+Enter stays a newline, as the composer's does */
      box.querySelector('.atl-edit-x').onclick=()=>_atlEdClose(); box.querySelector('.atl-edit-go').onclick=send;
      _atlEd={box:box,b:src,bd:src.getAttribute('style'),bar:bar,rd:bar?bar.getAttribute('style'):null};
      src.style.display='none'; if(bar) bar.style.display='none'; src.insertAdjacentElement('afterend',box);
      _atlEdGrow(ta); try{ ta.focus(); ta.setSelectionRange(ta.value.length,ta.value.length); }catch(_){} }catch(_){} }
    /* (#R298) an image row from the SAME turn sits ABOVE the text bubble, so removal starts at the turn's FIRST element —
       starting at the bubble would strand the attachment and re-running would then add a second copy of it. */
    function _atlEdSend(src,ed,text){ try{ const t=(ed&&ed.turn!=null)?ed.turn:null; try{ CTX.stopRun(); }catch(_){}
      let first=src; if(t!=null){ try{ for(const el of Array.from(CTX.chat().children)){ if(el.dataset&&el.dataset.turn===String(t)){ first=el; break; } } }catch(_){} }
      for(let el=first,n2; el; el=n2){ n2=el.nextElementSibling; try{ el.remove(); }catch(_){} }
      if(t!=null) CTX.rewindHist(t);
      CTX.run(text,((ed&&ed.imgs)||[]).slice(),((ed&&ed.files)||[]).slice()); }catch(_){} }
    /* (#R122) when a reply is finalized, position the conversation so the USER's message that triggered it sits at
       the TOP of the chat viewport (read the answer from its start) — unless the whole exchange already fits, in
       which case bottom-align so nothing is cut off. Deferred over two frames to survive late/async reply layout. */
    function _scrollUserTop(ub){ if(!ub||!CTX.chat()) return;
      const doit=()=>{ try{ const ubR=ub.getBoundingClientRect(), cR=CTX.chat().getBoundingClientRect();
        const rel=ubR.top-cR.top+CTX.chat().scrollTop;
        if(CTX.chat().scrollHeight-rel<=CTX.chat().clientHeight+4) CTX.chat().scrollTop=CTX.chat().scrollHeight;
        else CTX.chat().scrollTop=Math.max(0,rel-8); }catch(_){} };
      try{ requestAnimationFrame(()=>{ doit(); setTimeout(doit,70); }); }catch(_){ doit(); } }
    function msgTools(aiEl,q){ try{ if(!aiEl||!aiEl.parentElement) return;
      /* (#R122) auto-scroll: user message to top. ⚠ (#R296) the previous sibling is now that message's own copy bar, so the walk skips `.atl-msgt`. */
      try{ let ub=aiEl.previousElementSibling;
        while(ub&&ub.classList&&ub.classList.contains('atl-msgt')) ub=ub.previousElementSibling;
        if(ub&&ub.classList&&ub.classList.contains('u')) _scrollUserTop(ub); }catch(_){}
      const old=aiEl.nextElementSibling; if(old&&old.classList&&old.classList.contains('atl-msgt')) old.remove();
      const bar=document.createElement('div'); bar.className='atl-msgt';
      const rtSvg='<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>';
      bar.appendChild(copyBtn(aiEl));   /* (#R296) the same button the reader's own message gets */
      if(q){ const rt=document.createElement('button'); rt.innerHTML=rtSvg+'<span>'+L('Retry','再試行','Erneut','Повторить','Reintentar')+'</span>'; rt.title=L('Run this request again','この指示をもう一度実行','Erneut ausführen','Выполнить снова','Ejecutar de nuevo');
        rt.onclick=()=>{ try{ CTX.run(q); }catch(_){} };
        bar.appendChild(rt); }
      aiEl.insertAdjacentElement('afterend',bar);
    }catch(_){} }
  return { copyBtn, editBtn, msgTools };
}
