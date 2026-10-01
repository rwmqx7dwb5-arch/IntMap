/* ============================================================================
 *  IntMap · Atlas capabilities — the `panel.*` namespace   (js/atlas-cap-panel.js)
 * ----------------------------------------------------------------------------
 *  One entry per capability, and everything about it in the one place:
 *    row     its registry row (its columns are documented at «THE TABLE» in js/atlas-capabilities.js) — the id, the dispatch
 *            spelling, the aliases, the observer, the effects that are also its conflict keys …
 *    schema  its argument schema, built fresh on every call (the builders are in js/atlas-caps.js)
 *    run     what the dispatch runs for it: `run(a, dctx, K)` — the action, the execution context, and
 *            K, the Atlas kernel's internals it needs (js/atlas-console.js builds K; a `let` there is
 *            read and written as `K.name`, so the value is always the live one).
 *  The registry rows (copied into js/atlas-capabilities.js), the dispatch and the schema table are
 *  DERIVED from these entries — `node scripts/atlas-caps.mjs --write` rewrites what is generated after
 *  an entry is added or removed, and `npm run check:capabilities` fails while they disagree.
 *  The prose the planner reads stays in js/atlas-catalog-text.js (a block names the ids it documents).
 * ==========================================================================*/
import { str, bool, num, one, lat, lng, noArgs } from './atlas-caps.js';
import { EMBED_SIZES, EMBED_PX } from './embed-mode.js';   /* (share-embed-distribution) the frame presets `share` offers are the share panel's own */
import { openSupport, operatingFacts } from './supporter.js';   /* (supporter-funnel) `operatingCosts` */

export default [
  {
    row: ['panel.compare',              'compare',        '',                                                            'panel',   'panel',   'panel.compare',          'panel',               'session', 'none',   '',         ''],
    schema: () => ({ type: 'object', properties: { on: bool() } }),
    async run(a, dctx, K) { const R = K.R, note = K.note, L = K.L, _featTogHtml = K._featTogHtml, clickId = K.clickId;
      { try{ if(a.on===false){ const x=document.querySelector('#compare-window .cmp-close'); if(x){ x.click(); return R(true, note('✓ '+L('Compare off','比較オフ','Vergleich aus','Сравнение выкл','Comparar: off'))+_featTogHtml('compare')); } } else if(window.IntMapCompare&&window.IntMapCompare.open){ window.IntMapCompare.open(); return R(true, note('✓ '+L('Compare','比較','Vergleich','Сравнение','Comparar'))+_featTogHtml('compare')); } }catch(_){} return R(clickId('btn-compare'), note('✓ '+L('Compare','比較','Vergleich','Сравнение','Comparar'))+_featTogHtml('compare')); }   /* (#R151) offer the Compare on/off switch */
    },
  },
  {
    row: ['panel.tab',                  'tab',            '',                                                            'panel',   'panel',   'panel.tab',              'panel',               'session', 'none',   '',         ''],
    schema: () => ({ type: 'object', properties: { name: str() }, required: ['name'] }),
    async run(a, dctx, K) { const kexec = K.kexec, R = K.R, note = K.note, esc = K.esc, warn = K.warn, doControl = K.doControl;
      { const cmd={news:'tab.news',information:'tab.info',info:'tab.info',companies:'tab.info',company:'tab.info','企業':'tab.info',stats:'tab.stats',statistics:'tab.stats',data:'tab.stats',countries:'tab.stats',nations:'tab.stats',atlas:'tab.atlas',community:'tab.atlas'}[String(a.name||'').toLowerCase()];   /* (#R139) 'companies' → the repurposed info tab */
          const bid={'tab.news':'btn-news','tab.info':'btn-info','tab.stats':'btn-stats','tab.atlas':'btn-community','tab.community':'btn-community'}[cmd];
          if(cmd){ const ok=kexec(cmd,bid); return R(ok, ok?note('✓ '+esc(a.name||'')):warn('⚠')); } return doControl({target:a.name}); }
    },
  },
  {
    row: ['panel.streetView',           'streetview',     'streetView,pano',                                             'panel',   'panel',   'panel.streetview',       'panel',               'session', 'none',   'point',    'streetView'],
    /* coverage mode paints the streets with no point at all, so it is its own branch */
    schema: () => ({ type: 'object', properties: { place: str(), lng: lng(), lat: lat(), mode: str(), coverage: bool(), on: bool() }, anyOf: [{ required: ['place'] }, { required: ['lat', 'lng'] }, { required: ['mode'] }, { required: ['coverage'] }, { required: ['on'] }] }), /* `streetview` */
    async run(a, dctx, K) { const R = K.R, note = K.note, L = K.L, _featTogHtml = K._featTogHtml, warn = K.warn, geocode = K.geocode, whereMiss = K.whereMiss, GE = K.GE, esc = K.esc;
      {
          /* (#R84) coverage mode: with no place, or when explicitly asked, tint roads blue + make the map clickable */
          if(a.on===false||/^(off|hide|stop)$/i.test(String(a.mode||''))){ try{ window.IntMapStreetView&&window.IntMapStreetView.coverage&&window.IntMapStreetView.coverage(false); }catch(_){} try{ window.IntMapStreetView&&window.IntMapStreetView.close&&window.IntMapStreetView.close(); }catch(_){} return R(true, note('✓ '+L('Street View off','ストリートビューをオフ','Street View aus','Просмотр улиц выкл','Street View apagado'))+_featTogHtml('streetview')); }   /* (#R150) offer the toggle to flip it back on */
          const wantCov=/^(coverage|layer|mode|map|roads?)$/i.test(String(a.mode||''))||a.coverage===true||(!a.place&&a.lng==null&&!(K._herePoint&&isFinite(K._herePoint.lng)));
          if(wantCov){ await window.IntMapLazy.need('streetView'); let on=false; try{ if(window.IntMapStreetView&&window.IntMapStreetView.coverage) on=window.IntMapStreetView.coverage(true); }catch(_){} return R(!!on, on?note('🧍 '+L('Street View mode on — the light-blue lines are Google\'s real coverage; click one to open its panorama','ストリートビュー・モードをオン — 水色の線はGoogleの実際のカバレッジです。クリックでパノラマを表示','Street-View-Modus an — die hellblauen Linien sind Googles echte Abdeckung; zum Öffnen anklicken','Режим панорам включён — голубые линии это реальное покрытие Google; кликните для просмотра','Modo Street View activado — las líneas celestes son la cobertura real de Google; haz clic para abrir'))+_featTogHtml('streetview'):warn('⚠')); }
          let ll=null; if(a.lng!=null&&isFinite(+a.lng)) ll={lng:+a.lng,lat:+a.lat,name:a.place||''}; else if(a.place) ll=await geocode(a.place); else if(K._herePoint&&isFinite(K._herePoint.lng)) ll={lng:K._herePoint.lng,lat:K._herePoint.lat,name:K._herePoint.name||''};
          if(!ll) return R(false, warn('⚠ '+whereMiss(L('Where? Name a place or right-click a point','場所を指定するか地点を右クリックしてください','Wo? Ort nennen oder Punkt rechtsklicken','Где? Назовите место или ПКМ по точке','¿Dónde? Nombra un lugar'), a.place||a.at||a.location)));
          try{ GE().camera.flyTo({center:[+ll.lng,+ll.lat],zoom:Math.max(GE().camera.getZoom(),15),duration:900}); }catch(_){}
          await window.IntMapLazy.need('streetView'); let ok=false; try{ if(window.IntMapStreetView&&window.IntMapStreetView.open) ok=window.IntMapStreetView.open({lng:+ll.lng,lat:+ll.lat},ll.name||''); }catch(_){}
          return R(ok, ok?note('🧍 '+L('Street View','ストリートビュー','Street View','Просмотр улиц','Street View')+': '+esc(ll.name||((+ll.lat).toFixed(4)+', '+(+ll.lng).toFixed(4)))):warn('⚠')); }
    },
  },
  {
    row: ['panel.education',            'edu',            'learn',                                                       'panel',   'panel',   'panel.edu',              'panel',               'session', 'none',   '',         ''],
    /* ── panels, layers, settings, the clock ────────────────────────────────────────────────── */
    schema: () => (noArgs('edu')),
    async run(a, dctx, K) { const clickId = K.clickId, R = K.R, note = K.note, L = K.L, warn = K.warn;
      { let ok=false; try{ if(window.IntMapEdu&&window.IntMapEdu.open){ window.IntMapEdu.open(); ok=true; } }catch(_){} if(!ok) ok=clickId('btn-edu'); return R(ok, ok?note('🎓 '+L('Learn','学ぶ','Lernen','Обучение','Aprender')):warn('⚠')); }
    },
  },
  {
    row: ['panel.ecmwf',                'ecmwf',          'weatherLayers',                                               'panel',   'panel',   'panel.ecmwf',            'panel',               'session', 'none',   '',         ''],
    schema: () => (noArgs('ecmwf')),
    async run(a, dctx, K) { const R = K.R, note = K.note, L = K.L, warn = K.warn;
      { let ok=false; try{ if(window.IntMapWeatherEC&&window.IntMapWeatherEC.open){ window.IntMapWeatherEC.open(); ok=true; } }catch(_){} return R(ok, ok?note('🌦 '+L('Weather layers','気象レイヤー','Wetterebenen','Погодные слои','Capas meteorológicas')):warn('⚠')); }
    },
  },
  {
    row: ['panel.widgets',              'widgets',        '',                                                            'panel',   'panel',   'panel.widgets',          'panel',               'session', 'none',   '',         ''],
    schema: () => (noArgs('widgets')),
    async run(a, dctx, K) { const clickId = K.clickId, R = K.R, note = K.note, L = K.L, warn = K.warn;
      { let ok=false; try{ if(window.IntMapWidgets&&window.IntMapWidgets.toggle){ window.IntMapWidgets.toggle(); ok=true; } else ok=clickId('btn-widgets'); }catch(_){} return R(ok, ok?note('✓ '+L('Widgets','ウィジェット','Widgets','Виджеты','Widgets')):warn('⚠')); }
    },
  },
  {
    row: ['panel.screenshot',           'screenshot',     '',                                                            'panel',   'panel',   'panel.screenshot',       'panel,file',          'session', 'none',   '',         ''],
    schema: () => (noArgs('screenshot')),
    async run(a, dctx, K) { const clickId = K.clickId, R = K.R, note = K.note, L = K.L, warn = K.warn;
      { const ok=clickId('btn-screenshot'); return R(ok, ok?note('✓ '+L('Screenshot','スクショ','Screenshot','Снимок','Captura')):warn('⚠')); }
    },
  },
  {
    row: ['panel.share',                'share',          '',                                                            'panel',   'panel',   'panel.share',            'panel',               'session', 'none',   '',         ''],
    /* ⚠ (share-embed-distribution) IT USED TO OPEN THE PANEL AND SAY 「✓ 共有パネル」 — and nothing else, so
       「共有リンクを作って」 ended with Atlas unable to give the reader the link it had just made, and
       「ブログに貼るコードをちょうだい」 had no capability at all. The result now CARRIES what was made:
       the address (the same IntMapBookmark.link() the panel shows) or, with embed:true, the <iframe>
       code for the current map (js/embed-mode.js — the share link with ?embed=1). The panel is opened
       on the matching tab, so what Atlas hands over and what the reader sees are one value. */
    schema: () => ({ type: 'object', properties: { embed: bool(), size: one.apply(null, Object.keys(EMBED_SIZES)), width: num(EMBED_PX.min, EMBED_PX.max), height: num(EMBED_PX.min, EMBED_PX.max), interactive: bool() } }),
    async run(a, dctx, K) { const clickId = K.clickId, R = K.R, note = K.note, L = K.L, warn = K.warn, esc = K.esc;
      { const S=window.IntMapShare, wantEmbed=(a.embed===true);
        if(!(S&&S.open)){ const ok=clickId('btn-share'); return R(ok, ok?note('✓ '+L('Share panel','共有パネル','Teilen','Поделиться','Compartir')):warn('⚠')); }
        let made=null; try{
          await S.open(wantEmbed?{ tab:'embed', size:a.size, width:a.width, height:a.height, interactive:a.interactive }:{ tab:'link' });
          made=wantEmbed?S.embed():{ url:S.link() }; }catch(_){ made=null; }
        if(!made||!made.url) return R(false, warn('⚠ '+L('Could not build the share link','共有リンクを作れませんでした')));
        if(wantEmbed) return R(true, note('✓ '+L('Embed code','埋め込みコード')+' ('+esc(String(made.size.w))+' × '+esc(String(made.size.h))+(made.interactive?'':(', '+L('no pan or zoom','パン・ズーム無効')))+'): '+esc(made.code)));
        return R(true, note('✓ '+L('Share link','共有リンク')+': '+esc(made.url))); }
    },
  },
  {
    row: ['panel.search',               'search',         '',                                                            'panel',   'panel',   'panel.search',           'panel',               'session', 'none',   'text',     ''],
    schema: () => ({ type: 'object', properties: { query: str(), place: str() }, anyOf: [{ required: ['query'] }, { required: ['place'] }] }),
    async run(a, dctx, K) { const R = K.R, note = K.note, esc = K.esc, WORLD_RE = K.WORLD_RE, GE = K.GE, L = K.L, placeExtent = K.placeExtent, _setLast = K._setLast, flyToBox = K.flyToBox, _ambigNote = K._ambigNote, geocode = K.geocode, _bboxOK = K._bboxOK, warn = K.warn;
      { const q=a.query||a.place||''; const inp=document.getElementById('ms-input')||document.getElementById('search-input'); if(inp&&q){ inp.focus(); inp.value=q; inp.dispatchEvent(new Event('input',{bubbles:true})); const btn=document.getElementById('ms-btn'); if(btn) btn.click(); else inp.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',keyCode:13,bubbles:true})); return R(true, note('🔍 '+esc(q))); } if(WORLD_RE.test(String(q).trim())){ try{ GE().camera.flyTo({center:[GE().camera.getCenter().lng,20],zoom:1.4,duration:1000}); }catch(_){} return R(true, note('🌍 '+L('Whole world','全世界','Ganze Welt','Весь мир','El mundo entero'))); } const ext=await placeExtent(q); if(ext){ try{ _setLast(ext); }catch(_){} if(!(ext.box&&flyToBox(ext.box))) GE().camera.flyTo({center:[ext.lng,ext.lat],zoom:Math.max(GE().camera.getZoom(),10),duration:1000}); return R(true, note('🔍 '+esc(ext.name||q))+_ambigNote(q,ext.lng,ext.lat)); } const ll=await geocode(q); if(ll){ try{ if(ll.bbox&&_bboxOK(ll.bbox)) flyToBox(ll.bbox); else GE().camera.flyTo({center:[ll.lng,ll.lat],zoom:Math.max(GE().camera.getZoom(),10),duration:1000}); }catch(_){} return R(true, note('🔍 '+esc(ll.name||q))+_ambigNote(q,ll.lng,ll.lat)); } return R(false, warn('⚠ '+esc(q))); }
    },
  },
  {
    row: ['panel.correlate',            'correlate',      '',                                                            'panel',   'panel',   'panel.correlate',        'panel',               'session', 'none',   '',         ''],
    schema: () => (noArgs('correlate')),
    async run(a, dctx, K) { const clickId = K.clickId, R = K.R, note = K.note, L = K.L, warn = K.warn;
      { let ok=false; try{ if(window.IntMapCorrelate&&window.IntMapCorrelate.open){ window.IntMapCorrelate.open(); ok=true; } else ok=clickId('btn-correlate'); }catch(_){} return R(ok, ok?note(L('Correlation tool','相関ツール','Korrelationswerkzeug','Корреляция','Correlación')):warn('⚠')); }
    },
  },
  {
    row: ['panel.settings',             'settings',       '',                                                            'panel',   'panel',   'panel.settings',         'panel',               'session', 'none',   '',         ''],
    schema: () => (noArgs('settings')),
    async run(a, dctx, K) { const clickId = K.clickId, R = K.R, note = K.note, L = K.L, warn = K.warn;
      { const ok=clickId('btn-open-settings'); return R(ok, ok?note('✓ '+L('Settings','設定','Einstellungen','Настройки','Ajustes')):warn('⚠')); }
    },
  },
  {
    row: ['panel.workspace',            'workspace',      'windows,windowMode,windowWorkspace',                          'panel',   'panel',   'panel.workspace',        'panel',               'session', 'none',   '',         ''],
    schema: () => ({ type: 'object', properties: { on: bool(), mode: str(), action: str(), state: str() } }),
      /* (#R85) workspace (floating-window) mode via Atlas ("ワークスペースモードの切り替えがAtlasでできない") */
    async run(a, dctx, K) { const R = K.R, warn = K.warn, note = K.note, L = K.L;
      {
          if(!window.IntMapWorkspace) return R(false, warn('⚠'));
          const active=!!(window.IntMapWorkspace.active&&window.IntMapWorkspace.active());
          const m=String(a.mode||a.action||a.state||'').toLowerCase();
          const want = (a.on===false||/^(off|exit|close|normal|stop|disable|leave)$/.test(m)) ? false
                     : (a.on===true ||/^(on|enter|open|start|enable|switch)$/.test(m)) ? true
                     : !active;   /* unspecified → toggle */
          if(want===active) return R(true, note('✓ '+(active?L('Already in workspace mode','すでにワークスペースモードです','Bereits im Workspace-Modus','Уже в оконном режиме','Ya en modo espacio'):L('Already in normal mode','すでに通常モードです','Bereits im Normalmodus','Уже в обычном режиме','Ya en modo normal'))));
          let ok=false; try{ if(want){ ok=(window.IntMapWorkspace.open()!==false); } else { window.IntMapWorkspace.close(); ok=true; } }catch(_){}
          return R(ok, ok? note(want?'🗔 '+L('Workspace mode on — News, Countries, the map, layers and Atlas are now free-floating windows','ワークスペースモードをオン — ニュース・国・地図・レイヤー・Atlasが自由なウィンドウになりました','Workspace-Modus an','Оконный режим включён','Modo espacio activado')
                                   :'✓ '+L('Back to the normal layout','通常レイアウトに戻しました','Zurück zum Normal-Layout','Обычный вид','De vuelta al diseño normal'))
                       : warn('⚠ '+L('Workspace mode is desktop-only','ワークスペースモードはデスクトップ専用です','Workspace nur am Desktop','Оконный режим — только для десктопа','Solo escritorio'))); }
    },
  },
  {
    row: ['panel.shortcuts',            'shortcuts',      'keyboard,hotkeys',                                            'panel',   'panel',   'panel.shortcuts',        'panel',               'session', 'none',   '',         ''],
    schema: () => (noArgs('shortcuts')),
    async run(a, dctx, K) { const R = K.R, note = K.note, L = K.L, warn = K.warn;
      { let ok=false; try{ if(window.IntMapKbdHelp){ window.IntMapKbdHelp(); ok=true; } }catch(_){} return R(ok, ok?note(L('Keyboard shortcuts','キーボードショートカット','Tastaturkürzel','Горячие клавиши','Atajos de teclado')):warn('⚠')); }
    },
  },
  {
    row: ['panel.playground',           'playground',     'game',                                                        'panel',   'panel',   'panel.playground',       'panel',               'session', 'none',   '',         'playground'],
    schema: () => ({ type: 'object', properties: { mode: str(), name: str() } }),
    async run(a, dctx, K) { const R = K.R, note = K.note, esc = K.esc, warn = K.warn, L = K.L;
      { const m=String(a.mode||a.name||'').toLowerCase(); let ok=false, lbl='Playground';
          try{ await window.IntMapLazy.need('playground'); if(/world|explorer|geo|satellite|drop|guess|どこ|地理/.test(m)&&window._pgWorldExplorer){ window._pgWorldExplorer(); ok=true; lbl='World Explorer'; }   /* ⚠⚠ (#R666) THE MODULE IS FETCHED BEFORE THE MODE IS CHOSEN, NOT INSTEAD OF IT. The two named-mode arms below test `window._pgWorldExplorer` / `window._pgPandemic`, and js/playground.js's factory — which since #R209 runs only when the module is ASKED FOR — is what installs them. So on a page where nobody had opened the Playground yet, both arms were false and 「パンデミック・シミュレーターを開いて」 fell through to the `else`, which fetched the module and opened THE HUB: Atlas answered a request for one simulator with a menu of four. */
            else if(/pandemic|virus|outbreak|epidemic|disease|感染|パンデミック|эпидеми|pandemia/.test(m)&&window._pgPandemic){ window._pgPandemic(); ok=true; lbl='Pandemic Simulator'; }
            else if(/quiz|test|クイズ|викторин|cuestionario/.test(m)&&window.IntMapEdu&&window.IntMapEdu.open){ window.IntMapEdu.open(); ok=true; lbl='Quiz'; }
            else if(window._openPlayground){ window._openPlayground(); ok=true; } }catch(_){}
          return R(ok, ok?note('🎮 '+esc(lbl)):warn('⚠ '+L('Playground unavailable','プレイグラウンドを開けません','Playground nicht verfügbar','Playground недоступен','Playground no disponible'))); }
    },
  },
  {
    row: ['panel.news',                 'news',           '',                                                            'panel',   'panel',   'panel.news',             'panel',               'session', 'none',   '',         ''],
    schema: () => ({ type: 'object', properties: { mode: str(), name: str() } }),
    async run(a, dctx, K) { const L = K.L, clickId = K.clickId, R = K.R, note = K.note, esc = K.esc, warn = K.warn;
      { const m=String(a.mode||a.name||'').toLowerCase(); let id=null,lbl='';
          /* (#R416) `pinmode-pub` / `pinmode-loc` are gone — the pin is where the story happened. */
          if(/saved|favorit|bookmark|保存|ブックマーク|сохран|guardad/.test(m)){ id='newsfilter-saved'; lbl=L('Saved','保存','Gespeichert','Сохранённые','Guardados'); }
          else if(/all|unsaved|すべて|全部|все|todo/.test(m)){ id='newsfilter-all'; lbl=L('All','すべて','Alle','Все','Todo'); }
          else if(/translat|翻訳|перевод|traduc/.test(m)){ id='ai-translate-btn'; lbl=L('Translate','翻訳','Übersetzen','Перевод','Traducir'); }
          if(id){ const ok=clickId(id); return R(ok, ok?note('📰 '+esc(lbl)):warn('⚠')); }
          const ok=clickId('btn-news'); return R(ok, ok?note('📰 '+L('News','ニュース','Nachrichten','Новости','Noticias')):warn('⚠')); }
    },
  },
  {
    row: ['panel.account',              'account',        'login',                                                       'panel',   'panel',   'panel.account',          'panel',               'session', 'none',   '',         ''],
    schema: () => (noArgs('account')),
    async run(a, dctx, K) { const clickId = K.clickId, R = K.R, note = K.note, L = K.L, warn = K.warn;
      { const ok=clickId('btn-account'); return R(ok, ok?note('👤 '+L('Account','アカウント','Konto','Аккаунт','Cuenta')):warn('⚠')); }
    },
  },
  {
    row: ['panel.donate',               'donate',         '',                                                            'panel',   'panel',   'panel.donate',           'panel',               'session', 'none',   '',         ''],
    schema: () => (noArgs('donate')),
    async run(a, dctx, K) { const clickId = K.clickId, R = K.R, note = K.note, L = K.L, warn = K.warn;
      { const ok=clickId('btn-blueberry'); return R(ok, ok?note('💙 '+L('Donate','寄付','Spenden','Поддержать','Donar')):warn('⚠')); }
    },
  },
  {
    row: ['panel.operatingCosts',       'operatingCosts', 'runningCosts,supportCosts,whereSupportGoes',                  'panel',   'panel',   'panel.donate',           'panel,explanation',   'session', 'none',   '',         ''],
    /* (supporter-funnel) «運営費を見る» / "what does IntMap cost to run" — opens the support panel at «where
       support goes» AND hands Atlas the same facts the panel shows, so it can answer in words without
       inventing a figure: the daily allowance from the plan table and this month's AI requests and
       tokens from public.operating_stats(). A month that could not be read is said to be unreadable. */
    schema: () => (noArgs('operatingCosts')),
    async run(a, dctx, K) { const R = K.R, note = K.note, L = K.L, esc = K.esc, warn = K.warn;
      { const opened=openSupport({ section:'costs' }); let f=null; try{ f=await operatingFacts(); }catch(_){ f=null; }
          if(!opened&&!f) return R(false, warn('⚠'));
          const al=f&&f.allowance;
          const lines=[ L('Where support goes','支援の使い道'),
            al? L('Atlas allowance: ','Atlas の1日の上限: ')+al.aiTurnsPerDay+L(' questions and ',' 回の質問と ')+al.aiGlossPerDay+L(' term look-ups a day (free plan — every reader has it; no paid plan exists).',' 回の用語解説（無料プラン。全員が同じで、有料プランはありません）') : '',
            f? f.monthLine : '' ].filter(Boolean);
          return R(true, note(lines.map(esc).join('<br>'))); }
    },
  },
  {
    row: ['panel.feedback',             'feedback',       '',                                                            'panel',   'panel',   'panel.feedback',         'panel',               'session', 'none',   '',         ''],
    schema: () => (noArgs('feedback')),
    async run(a, dctx, K) { const clickId = K.clickId, R = K.R, note = K.note, L = K.L, warn = K.warn;
      { let ok=false; try{ if(window._openFeedback){ window._openFeedback(); ok=true; } }catch(_){} if(!ok) ok=clickId('btn-feedback-hdr'); return R(ok, ok?note('✓ '+L('Feedback','フィードバック','Feedback','Отзыв','Comentarios')):warn('⚠')); }
    },
  },
  {
    row: ['panel.bugReport',            'bugReport',      'bug',                                                         'panel',   'panel',   'panel.feedback',         'panel',               'session', 'none',   '',         ''],
    schema: () => (noArgs('bugReport')),
    async run(a, dctx, K) { const R = K.R, note = K.note, L = K.L, warn = K.warn;
      { let ok=false; try{ if(window._openBugReport){ window._openBugReport(); ok=true; } }catch(_){} return R(ok, ok?note('🐞 '+L('Bug report','バグ報告','Fehlerbericht','Сообщить об ошибке','Reportar error')):warn('⚠')); }
    },
  },
  {
    row: ['panel.ticker',               'ticker',         '',                                                            'panel',   'panel',   'panel.ticker',           'panel',               'session', 'none',   '',         ''],
    schema: () => ({ type: 'object', properties: { on: bool(), mode: str() } }),
    async run(a, dctx, K) { const saveSettings = K.saveSettings, R = K.R, note = K.note, L = K.L, _featTogHtml = K._featTogHtml, warn = K.warn;
      { const onT=!(a.on===false||/^(off|hide)$/i.test(String(a.mode||''))); let okT=false;
          try{ if(window.IntMapTicker){ window.imTicker=onT?'on':'off'; window.IntMapTicker.apply(); okT=true; try{ if(typeof saveSettings==='function') saveSettings(); }catch(_){} } }catch(_){}
          return R(okT, okT?note('✓ '+L('Bottom ticker','下部ティッカー','Ticker','Бегущая строка','Cinta inferior')+': '+(onT?'on':'off'))+_featTogHtml('ticker'):warn('⚠')); }   /* (#R149) offer the ticker on/off toggle */
    },
  },
];
