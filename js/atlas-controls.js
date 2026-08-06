/* ============================================================================
 *  IntMap · Atlas — the full-control action surface — real UI controls and module methods  (#R199)
 * ----------------------------------------------------------------------------
 *  How Atlas presses the app's own buttons: the kernel-first execution path (#R82), the control
 *  finder/executor and its catalogue, the window.IntMap* module method dispatcher, and the UI-name sweep
 *  that reports controls Atlas cannot name (window.IntMapUIAudit).
 *
 *  Lifted out of js/atlas-console.js's 105-line block verbatim (#R199). It is a REAL ES module:
 *  nothing registers it on window.IntMapModules and nothing depends on load order — js/atlas-console.js
 *  names it in an `import`, so the bundler resolves the binding and orders the graph.
 *
 *  Everything the block used to read from the console's closure arrives through `CTX` (and the app's
 *  live host through `HOST`), rebound below under the ORIGINAL names so the body stays byte-identical.
 *  tests/r199-checks.test.mjs re-derives that byte-identity from the two files on every commit.
 * ==========================================================================*/
export function makeAtlasControls(HOST, CTX) {
  const L=CTX.L, R=CTX.R, _ctlTogHtml=CTX._ctlTogHtml, esc=CTX.esc, note=CTX.note, warn=CTX.warn;
    /* ---- generic UI helpers for the full-control action set ---- */
    const clickId=id=>{ const el=document.getElementById(id); if(el){ el.click(); return true; } return false; };
    /* (#R82) kexec = run an OS KERNEL command directly (the inverted path: Atlas → kernel → engine, no UI-click
       simulation), falling back to a UI click only if the kernel/command isn't available. Both Atlas and the UI
       button converge on the SAME registered command. */
    const kexec=(cmd,fallbackBtnId)=>{ try{ if(window.IntMapOS&&window.IntMapOS.has&&window.IntMapOS.has(cmd)){ const r=window.IntMapOS.exec(cmd,{source:'atlas'}); return !(r&&r.ok===false); } }catch(_){} return fallbackBtnId?clickId(fallbackBtnId):false; };
    function setSel(id,val){ const el=document.getElementById(id); if(!el) return false; el.value=val; el.dispatchEvent(new Event('change',{bubbles:true})); return true; }
    /* ---- (#R42d) UNIVERSAL control layer so Atlas can operate ANY control in IntMap, not just the enumerated
       semantic actions ("all actions, literally"). It fuzzy-matches a target name/id against EVERY button,
       checkbox/radio, select, slider and text input in the live DOM (visible OR inside a closed panel — direct
       DOM ops + dispatched events still run the real handler) and clicks/sets/toggles it. ---- */
    function _assocLabel(el){ try{ if(el.id){ const l=document.querySelector('label[for="'+el.id+'"]'); if(l) return l.textContent||''; } const grp=el.closest&&(el.closest('.setting-group')||el.closest('label')); if(grp&&grp!==el){ const l=grp.tagName==='LABEL'?grp:grp.querySelector('label'); if(l) return l.textContent||''; } let p=el.previousElementSibling; let k=0; while(p&&k++<2){ if(p.tagName==='LABEL') return p.textContent||''; p=p.previousElementSibling; } }catch(_){} return ''; }
    function _ctlLabel(el){ const opts=(el.tagName==='SELECT')?'':(el.textContent||''); return ((el.id||'')+' '+opts+' '+_assocLabel(el)+' '+(el.getAttribute&&(el.getAttribute('title')||'')||'')+' '+(el.getAttribute&&(el.getAttribute('aria-label')||'')||'')+' '+(el.getAttribute&&(el.getAttribute('data-i18n')||el.getAttribute('data-i18n-title')||'')||'')+' '+(el.placeholder||'')).toLowerCase().replace(/\s+/g,' ').trim(); }
    function _ctlEls(){ return [].slice.call(document.querySelectorAll('button, input, select, textarea, [role="button"], .view-btn, .mode-btn, .ios-segment-btn, .dash-nav-btn, .lyr-head')); }
    function findControl(target){ const q=String(target||'').toLowerCase().trim(); if(!q) return null; let best=null,bs=0;
      _ctlEls().forEach(el=>{ if(el.disabled) return; if((el.type==='checkbox'||el.type==='radio')&&el.closest&&el.closest('#layer-dropdown')) return; /* layers use the `layer` action */ const id=(el.id||'').toLowerCase(); const lab=_ctlLabel(el); let sc=0;
        if(id&&id===q) sc=100; else if(lab===q) sc=96; else if(id&&q===id.replace(/^(btn-|cb-|setting-|dl-)/,'')) sc=92;
        else if(lab.indexOf(q)>=0&&q.length>1) sc=62+Math.min(22,q.length); else if(id&&id.indexOf(q)>=0&&q.length>2) sc=58;
        else { const qt=q.split(/\s+/).filter(w=>w.length>1); if(qt.length){ const hit=qt.filter(w=>lab.indexOf(w)>=0||id.indexOf(w)>=0).length; if(hit) sc=45*hit/qt.length; } }
        if(sc>0 && el.offsetParent===null) sc*=0.6; /* prefer a VISIBLE control over a hidden duplicate (e.g. desktop btn vs mobile proxy); hidden still wins if it's the only match (settings in a closed modal) */
        if(sc>bs){ bs=sc; best=el; } });
      return bs>=22?best:null; }
    function doControl(a){ const el=findControl(a.target); if(!el) return R(false, warn('⚠ '+L('Control not found','操作対象が見つかりません','Steuerung nicht gefunden','Элемент не найден','Control no encontrado')+': '+esc(a.target||'')));
      const tag=el.tagName.toLowerCase(), nm=esc(a.target||el.id||(el.textContent||'').trim().slice(0,24));
      try{
        if(tag==='select'){ if(a.value!=null){ const v=String(a.value).toLowerCase(); const opts=[].slice.call(el.options); const o=opts.find(o=>String(o.value).toLowerCase()===v)||opts.find(o=>(o.textContent||'').toLowerCase().indexOf(v)>=0); if(!o) return R(false, warn('⚠ '+nm+': '+L('option not found','選択肢なし','Option fehlt','нет варианта','sin opción')+' "'+esc(a.value)+'"')); el.value=o.value; el.dispatchEvent(new Event('change',{bubbles:true})); } return R(true, note('✓ '+nm+(a.value!=null?(' = '+esc(a.value)):''))); }
        if(el.type==='checkbox'||el.type==='radio'){ const want=(a.on!=null)?(a.on!==false):!el.checked; if(el.checked!==want){ el.checked=want; el.dispatchEvent(new Event('change',{bubbles:true})); } return R(el.checked===want, note('✓ '+nm+': '+(want?'on':'off'))+_ctlTogHtml(a.target||el.id,el)); }   /* (#R152) attach an on/off switch for any checkbox control */
        if(el.type==='range'||el.type==='number'){ if(a.value!=null){ el.value=a.value; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); } return R(true, note('✓ '+nm+(a.value!=null?(' = '+esc(a.value)):''))); }
        /* (#R77) dated-layer date/month inputs (「気温レイヤーの日付を2023-06-01に」) were unreachable — click() did nothing useful */
        if(el.type==='date'||el.type==='month'){ if(a.value!=null){ let v=String(a.value).trim(); if(el.type==='month') v=v.slice(0,7); else v=v.slice(0,10);
            el.value=v; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true}));
            return R(el.value===v, el.value===v?note('✓ '+nm+' = '+esc(v)):warn('⚠ '+nm+': '+L('value rejected (out of range?)','値が受理されません（範囲外？）','Wert abgelehnt','значение отклонено','valor rechazado')+' '+esc(v))); }
          return R(true, note('✓ '+nm)); }
        if(tag==='textarea'||(tag==='input'&&(!el.type||/^(text|search|email|url)$/.test(el.type)))){ if(a.value!=null){ el.focus(); el.value=a.value; el.dispatchEvent(new Event('input',{bubbles:true})); if(a.submit!==false){ el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',keyCode:13,bubbles:true})); } } return R(true, note('✓ '+nm)); }
        el.click(); return R(true, note('✓ '+nm));
      }catch(_){ return R(false, warn('⚠ '+nm)); } }
    /* Compact catalog of the main controls (buttons + selects), fed to the AI so it can target ANY of them by
       name via {"type":"control",...}. Layer checkboxes are omitted (the `layer` action covers them). */
    function controlCatalog(){ try{ const seen=new Set(), out=[];
      _ctlEls().forEach(el=>{ const tag=el.tagName.toLowerCase(); if(el.type==='checkbox'||el.type==='radio') return; if(el.closest&&el.closest('#layer-dropdown')&&tag!=='select') return;
        let nm=(tag==='select'||tag==='input'||tag==='textarea')?(_assocLabel(el)||(el.getAttribute&&(el.getAttribute('title')||el.placeholder||''))||el.id||''):((el.textContent||'').replace(/\s+/g,' ').trim()||(el.getAttribute&&(el.getAttribute('title')||el.getAttribute('aria-label')||''))||el.id||''); nm=String(nm).replace(/\s+/g,' ').slice(0,28).trim(); if(!nm||nm.length<2) return;
        const key=(el.id||nm).toLowerCase(); if(seen.has(key)) return; seen.add(key);
        out.push(nm+(el.id?(' [#'+el.id+']'):'')+(tag==='select'?' (select)':'')); });
      return out.slice(0,140).join('; '); }catch(_){ return ''; } }
    /* ==== (#R77) FULL UI⇄Atlas integration ("IntMapのUIすべてとAtlasが統合されるように" / vision §1·§17·第六段階).
       Measured baseline: 538 interactive elements, 192 had NO accessible name — unreachable by any Atlas path
       (128 favourite ★ per layer row, 21 legend-close ✕, per-layer date inputs, opacity sliders, unlabeled
       checkboxes). Fix = a NAMING SWEEP that derives an aria-label from each element's real context (its layer
       row text, its legend's title, its container heading). aria-label feeds _ctlLabel/findControl directly, so
       named = reachable via {"type":"control"} — and the sweep re-runs periodically, so elements created later
       (legends open lazily) and FUTURE features are integrated the moment they appear (§17). ==== */
    function _rowLbl(el){ try{ const row=el.closest&&(el.closest('.lyr-row')||el.closest('label')); if(!row) return '';
      const sp=row.querySelector('span[data-i18n], span.ec-lbl, span[id$="-lbl"], .geo-label')||row.querySelector('span');
      return String((sp?sp.textContent:row.textContent)||'').replace(/\s+/g,' ').trim().slice(0,40); }catch(_){ return ''; } }
    function _uiNameSweep(){ try{ const jp=HOST.lang==='jp';
      document.querySelectorAll('button.lyr-star:not([aria-label])').forEach(b=>{ const l2=_rowLbl(b); if(l2) b.setAttribute('aria-label',(jp?'お気に入り: ':'favorite: ')+l2); });
      document.querySelectorAll('input.lyr-op:not([aria-label])').forEach(i2=>{ const l2=_rowLbl(i2); if(l2) i2.setAttribute('aria-label',(jp?'透明度: ':'opacity: ')+l2); });
      document.querySelectorAll('input.dl-date:not([aria-label])').forEach(i2=>{ let l2=_rowLbl(i2);
        if(!l2){ const lg=i2.closest('[id^="data-legend-"]'); if(lg) l2=lg.id.replace(/^data-legend-/,''); }   /* date inputs live in the layer's LEGEND, not its row */
        if(l2) i2.setAttribute('aria-label',(jp?'日付: ':'date: ')+l2); });
      document.querySelectorAll('#layer-dropdown input[type=checkbox]:not([aria-label])').forEach(i2=>{ const l2=_rowLbl(i2); if(l2) i2.setAttribute('aria-label',l2); });
      document.querySelectorAll('button.layer-popup-x:not([aria-label])').forEach(b=>{ let nm2='';
        const box=b.closest('[id^="data-legend-"]')||b.closest('[id$="-legend"]')||b.closest('[id^="legend"]')||b.closest('.layer-popup')||b.closest('.data-legend');
        if(box){ /* first heading candidate that contains REAL text (skip the ⋮⋮ drag handle) */
          let t3=''; try{ [].slice.call(box.querySelectorAll('b, strong, .lgd-t, span')).some(h=>{ const x2=String(h.textContent||'').replace(/\s+/g,' ').trim(); if(/\p{L}/u.test(x2)&&x2.length>=2){ t3=x2; return true; } return false; }); }catch(_){}
          nm2=(t3||String(box.id||'').replace(/^data-legend-/,'')).slice(0,32); }
        b.setAttribute('aria-label',(jp?'凡例を閉じる: ':'close legend: ')+(nm2||'legend')); });
      document.querySelectorAll('input.sl-legend-range:not([aria-label]), input.sl-num:not([aria-label])').forEach(i2=>{ i2.setAttribute('aria-label',jp?'海面上昇 (m)':'sea level rise (m)'); });
      /* generic: an unnamed ×/✕ button is a CLOSE button for its nearest identified container */
      document.querySelectorAll('button:not([aria-label]), [role="button"]:not([aria-label])').forEach(b=>{ try{
        const t2=(b.textContent||'').replace(/\s+/g,''); if(t2&&!/^[×✕✖xX]$/.test(t2)) return; if(b.id&&b.id.length>3) return;
        const host=b.closest&&b.closest('[id]'); if(!host||!host.id) return;
        b.setAttribute('aria-label',(jp?'閉じる: ':'close: ')+host.id.replace(/[-_]/g,' ').slice(0,32)); }catch(_){} });
      document.querySelectorAll('input[type=file]:not([aria-label])').forEach(i2=>{ i2.setAttribute('aria-label','file: '+String(i2.accept||'upload').replace(/[.,]/g,' ').replace(/\s+/g,' ').trim().slice(0,32)); });
      /* unnamed generic checkboxes/radios outside the layer panel: take the row text they sit in */
      document.querySelectorAll('input[type=checkbox]:not([aria-label]), input[type=radio]:not([aria-label])').forEach(i2=>{ try{
        if(i2.closest('#layer-dropdown')||i2.closest('#atlas-panel')) return; const l2=_rowLbl(i2); if(l2) i2.setAttribute('aria-label',l2); }catch(_){} });
    }catch(_){} }
    /* permanent §17 diagnostic: how much of the UI can Atlas actually address? Names elements first, then counts. */
    window.IntMapUIAudit={ sweep:_uiNameSweep,
      run(){ _uiNameSweep(); const seen=new Set(); let total=0,named=0; const un=[];
        [].slice.call(document.querySelectorAll('button, input, select, textarea, [role="button"], [onclick]')).forEach(el=>{
          if(seen.has(el)||el.disabled) return; seen.add(el);
          if(el.closest&&el.closest('#atlas-panel')) return; total++;
          /* named = SOME candidate is a usable (≥2-char) handle — a "★"/"×" glyph alone is not, but its aria-label is */
          const cands=[(el.textContent||''),el.getAttribute('title')||'',el.getAttribute('aria-label')||'',el.getAttribute('placeholder')||'',el.id||''];
          const lab=cands.map(x2=>String(x2).replace(/\s+/g,' ').trim()).find(x2=>x2.length>=2)||'';
          if(lab) named++; else un.push(el.tagName.toLowerCase()+(el.id?('#'+el.id):'')+'.'+String(el.className||'').split(' ')[0]); });
        return {total,named,unnamed:un.length,coverage:total?Math.round(named/total*100):100,unnamedList:un.slice(0,40)}; } };
    setTimeout(()=>{ _uiNameSweep(); setInterval(()=>{ if(!document.hidden) _uiNameSweep(); },20000); },3500);   /* legends & future panels appear lazily — keep integrating them */
    /* ---- (#R45) MODULE registry so Atlas is the OS over ALL of IntMap ("IntMapのすべてを統合するOS"): EVERY
       IntMap-prefixed window subsystem (current OR future) with a standard entrypoint is auto-discovered and
       callable by name via a "module" action — no per-feature wiring needed, so new modules are reachable the
       moment they exist. Bounded to IntMap-prefixed names plus RunwaySearch, and a safe method allow-list. ---- */
    const MOD_METHODS=['open','toggle','close','clear','exit','refresh','render'];
    const MOD_RE=/^(IntMap[A-Za-z0-9]*|RunwaySearch)$/;
    function moduleCatalog(){ try{ const out=[]; for(const k of Object.keys(window)){ if(!MOD_RE.test(k)) continue;
      if(k==='IntMapAIResearch') continue;   /* (#R118) absorbed into Atlas (brief) — the legacy panel must not be offered to the planner */
      let v; try{ v=window[k]; }catch(_){ continue; } if(!v||typeof v!=='object') continue; const ms=MOD_METHODS.filter(m=>typeof v[m]==='function'); if(ms.length) out.push(k+'('+ms.join(',')+')'); } return out.join('; '); }catch(_){ return ''; } }
    function doModule(a){ const nm0=String(a.name||'').trim(); const meth=String(a.method||'open').trim();
      if(!MOD_RE.test(nm0)) return R(false, warn('⚠ '+L('Unknown module','不明なモジュール','Unbekanntes Modul','Неизвестный модуль','Módulo desconocido')+': '+esc(nm0)));
      if(MOD_METHODS.indexOf(meth)<0) return R(false, warn('⚠ '+L('Unsupported method','非対応のメソッド','Methode nicht unterstützt','Метод не поддерживается','Método no admitido')+': '+esc(meth)));
      let m; try{ m=window[nm0]; }catch(_){ m=null; }
      if(m&&typeof m[meth]==='function'){ try{ m[meth](); return R(true, note('✓ '+esc(nm0)+'.'+esc(meth)+'()')); }catch(e){ return R(false, warn('⚠ '+esc(nm0)+': '+esc((e&&e.message)||'error'))); } }
      return R(false, warn('⚠ '+L('Module/method not found','モジュール/メソッドが見つかりません','Modul/Methode nicht gefunden','Модуль/метод не найден','Módulo/método no encontrado')+': '+esc(nm0+'.'+meth))); }
  return { clickId, controlCatalog, doControl, doModule, findControl, kexec, moduleCatalog, setSel };
}
