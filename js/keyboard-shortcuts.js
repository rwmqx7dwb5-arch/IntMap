/* ============================================================================
 *  IntMap · the keyboard, and the card that lists it  (#R200)
 * ----------------------------------------------------------------------------
 *  Desktop keyboard shortcuts — modifier-free, ignored while typing — and the five-language
 *  cheat-sheet `?` opens. One of them cycles the theme, which is the single place this file writes
 *  host state (through IM_HOST's accessor pair, and listed as an owner in tests/r165-checks).
 *
 *  Lifted verbatim out of js/app-body.js (#R200, second pass): 74 of its 76 lines are
 *  byte-identical, and the 2 that are not are all #R165's rule — a closure value
 *  js/app-body.js REASSIGNS at runtime is read through IM_HOST's live accessor
 *  (currentLang → HOST.lang, userTheme → HOST.userTheme), never captured when this factory ran.
 *  Everything else arrives through CTX under its ORIGINAL name, which is what lets the body stay
 *  word-for-word what it was. A real ES module: no window.IntMapModules entry, no src/main.js order.
 * ==========================================================================*/
export function makeKeyboardShortcuts(HOST, CTX) {
  const GE=CTX.GE, applyTheme=CTX.applyTheme, imToast=CTX.imToast, isMobile=CTX.isMobile;
  /* ===== (#R62) Keyboard shortcuts ("その他のキーボードショートカットも大幅に追加") — desktop, no modifier,
     ignored while typing. `?` opens a 5-language cheat-sheet. Esc(sidebar) + Ctrl/⌘+K(Atlas) live elsewhere. ===== */
  (function(){
    const KL=window.IntMapLang.pick(()=>HOST.lang);
    function helpModal(){
      let m=document.getElementById('kbd-help-modal');
      if(m){ m.style.display=(m.style.display==='none'||!m.style.display)?'flex':'none'; return; }
      m=document.createElement('div'); m.id='kbd-help-modal'; m.className='modal';
      m.style.cssText='position:fixed;inset:0;z-index:6000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.45);';
      const rows=[
        ['Esc',KL('Toggle sidebar','サイドバーの開閉','Seitenleiste ein/aus','Показать/скрыть панель','Mostrar/ocultar panel')],
        ['Ctrl/⌘+K '+KL('or','または','oder','или','o')+' A',KL('Atlas console','Atlas コンソール','Atlas-Konsole','Консоль Atlas','Consola Atlas')],
        ['/',KL('Focus place search','場所検索へフォーカス','Ortssuche fokussieren','Фокус на поиск','Enfocar búsqueda')],
        ['L',KL('Layers panel','レイヤー選択','Ebenen','Слои','Capas')],
        ['N / I / S / C',KL('News / Info / Countries / Community tab','ニュース / 情報 / 国 / コミュニティ','News / Info / Länder / Community','Новости / Инфо / Страны / Сообщество','Noticias / Info / Países / Comunidad')],
        ['B',KL('Map ⇄ satellite','地図 ⇄ 衛星','Karte ⇄ Satellit','Карта ⇄ спутник','Mapa ⇄ satélite')],
        ['1 / 2 / 3',KL('Globe / flat / 3D terrain','地球儀 / 平面 / 3D地形','Globus / flach / 3D','Глобус / плоская / 3D','Globo / plano / 3D')],
        ['G',KL('Coordinate grid','座標グリッド','Koordinatengitter','Сетка координат','Cuadrícula')],
        ['M / R / D',KL('Measure / radius / draw tool','計測 / 半径 / 描画ツール','Messen / Radius / Zeichnen','Измерение / радиус / рисование','Medir / radio / dibujar')],
        ['W',KL('Widgets','ウィジェット','Widgets','Виджеты','Widgets')],
        ['T',KL('Theme (light → dark → auto)','テーマ切替（ライト→ダーク→自動）','Design (hell → dunkel → auto)','Тема (светлая → тёмная → авто)','Tema (claro → oscuro → auto)')],
        ['F',KL('Fullscreen','全画面','Vollbild','Полный экран','Pantalla completa')],
        ['0',KL('Reset north','北を上に','Norden ausrichten','Сброс на север','Restablecer norte')],
        ['+ / −',KL('Zoom in / out','ズームイン / アウト','Zoom rein / raus','Приблизить / отдалить','Acercar / alejar')],
        ['?',KL('This help','このヘルプ','Diese Hilfe','Эта справка','Esta ayuda')]
      ];
      m.innerHTML='<div style="background:var(--card-bg);color:var(--text-main);border:1px solid var(--glass-border,rgba(128,128,128,0.25));border-radius:16px;box-shadow:var(--shadow);width:min(430px,calc(100vw - 32px));max-height:80vh;overflow-y:auto;padding:18px 20px;">'
        +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;"><b style="font-size:15px;">⌨ '+KL('Keyboard shortcuts','キーボードショートカット','Tastaturkürzel','Горячие клавиши','Atajos de teclado')+'</b><button id="kbd-x" style="background:none;border:none;color:var(--text-muted);font-size:20px;cursor:pointer;">✕</button></div>'
        +rows.map(r=>'<div style="display:flex;justify-content:space-between;gap:14px;padding:5px 0;border-bottom:1px solid rgba(128,128,128,0.12);font-size:12.5px;"><span style="font-family:ui-monospace,monospace;color:var(--primary-color);font-weight:700;white-space:nowrap;">'+r[0]+'</span><span style="text-align:right;color:var(--text-main);">'+r[1]+'</span></div>').join('')
        +'</div>';
      m.addEventListener('click',e=>{ if(e.target===m) m.style.display='none'; });
      document.body.appendChild(m);
      m.querySelector('#kbd-x').onclick=()=>{ m.style.display='none'; };
    }
    /* (#R72) discoverable entry points: Settings button + Atlas ("ショートカットキーの説明がどこにもない") */
    window.IntMapKbdHelp=helpModal;
    setTimeout(()=>{ try{ const b=document.getElementById('btn-kbd-help'); if(b) b.onclick=()=>{ try{ const m0=document.getElementById('settings-modal'); if(m0) m0.style.display='none'; }catch(_){} helpModal(); }; }catch(_){} },1200);
    const click=id=>{ const el=document.getElementById(id); if(el) el.click(); };
    document.addEventListener('keydown',(e)=>{
      if(e.ctrlKey||e.metaKey||e.altKey) return;
      if(typeof isMobile==='function'&&isMobile()) return;
      const ae=document.activeElement, tag=ae&&ae.tagName;
      if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT'||(ae&&ae.isContentEditable)) return;
      const k=e.key;
      if(k==='Escape'){ const hm=document.getElementById('kbd-help-modal'); if(hm&&hm.style.display!=='none'){ hm.style.display='none'; } return; }
      const K=k.toLowerCase();
      let done=true;
      switch(true){
        case (k==='?'): helpModal(); break;
        case (k==='/'): { const inp=document.getElementById('ms-input')||document.getElementById('search-input'); if(inp){ inp.focus(); try{ inp.select(); }catch(_){} } break; }
        case (K==='a'): try{ if(window.IntMapAtlas) window.IntMapAtlas.call('toggle'); else window.IntMapConsole&&window.IntMapConsole.toggle(); }catch(_){} break;   /* (#R224) fetches the kernel on demand */
        case (K==='l'): click('btn-layers'); break;
        case (K==='n'): click('btn-news'); break;
        case (K==='i'): click('btn-info'); break;
        case (K==='s'): click('btn-stats'); break;
        case (K==='c'): click('btn-community'); break;
        case (K==='b'): { const sat=document.getElementById('btn-view-sat'); click(sat&&sat.classList.contains('active')?'btn-view-map':'btn-view-sat'); break; }
        case (k==='1'): click('btn-view-globe'); break;
        case (k==='2'): click('btn-view-flat'); break;
        case (k==='3'): click('btn-view-3d'); break;
        case (K==='g'): click('btn-tool-grid'); break;
        case (K==='m'): click('btn-tool-measure'); break;
        case (K==='r'): click('btn-tool-radius'); break;
        case (K==='d'): click('btn-tool-draw'); break;
        case (K==='w'): { try{ if(window.IntMapWidgets&&window.IntMapWidgets.toggle) window.IntMapWidgets.toggle(); else click('btn-widgets'); }catch(_){} break; }
        case (K==='t'): { try{ const seq={light:'dark',dark:'auto',auto:'light'}; const cur=(typeof HOST.userTheme!=='undefined'?HOST.userTheme:'auto'); const nx=seq[cur]||'light'; const sel=document.getElementById('setting-theme'); if(sel){ sel.value=nx; sel.dispatchEvent(new Event('change',{bubbles:true})); } if(typeof HOST.userTheme!=='undefined'){ HOST.userTheme=nx; if(typeof applyTheme==='function') applyTheme(); } try{ imToast('🎨 '+nx); }catch(_){} }catch(_){} break; }
        case (K==='f'): { try{ if(document.fullscreenElement){ document.exitFullscreen&&document.exitFullscreen().catch(()=>{}); } else { const p=document.documentElement.requestFullscreen&&document.documentElement.requestFullscreen(); if(p&&p.catch) p.catch(()=>{}); } }catch(_){} break; }
        case (k==='0'): click('btn-compass'); break;
        case (k==='+'||k==='='): try{ GE().camera.zoomIn(); }catch(_){} break;
        case (k==='-'||k==='_'): try{ GE().camera.zoomOut(); }catch(_){} break;
        default: done=false;
      }
      if(done) e.preventDefault();
    });
  })();

}
