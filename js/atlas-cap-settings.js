/* ============================================================================
 *  IntMap · Atlas capabilities — the `settings.*` namespace   (js/atlas-cap-settings.js)
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
 *  (atlas-capability-single-source) An entry also holds `doc` — its fragment of each catalogue block the planner
 *  reads (js/atlas-catalog-text.js keeps only the blocks' order and headings) — and, where it has them, `phrases`,
 *  `policy`, `goal`, `chips` and `catalogueSilent`. js/atlas-caps.js says what each one is; nothing outside the
 *  entry names them.
 * ==========================================================================*/
import { str, bool, one, int } from './atlas-caps.js';
import { usage } from './usage-counts.js';   /* (anonymous-usage-counts) the Settings switch settings.usageCounts flips */

export default [
  {
    row: ['settings.theme',             'theme',          '',                                                            'settings','setting', 'settings.theme',         'setting',             'persist', 'explicit','',        ''],
    doc: [
      { in: 'settings', at: 10, text: '{"type":"theme","mode":"light"|"dark"|"auto"}; ' },
    ],
    catalogueSilent: '2026-09-18',   /* ㉓'s ledger (#R802, measured that day): its `doc` does not yet name its own subject in both en and jp — delete this line when it does */
    schema: () => ({ type: 'object', properties: { mode: one('light', 'dark', 'auto', 'system') }, required: ['mode'] }),
    async run(a, dctx, K) { const setSel = K.setSel, HOST = K.HOST, applyTheme = K.applyTheme, R = K.R, note = K.note, L = K.L;
      { const m=({dark:'dark',light:'light',auto:'auto',system:'auto'})[String(a.mode||'').toLowerCase()]||'auto'; const ok=setSel('setting-theme',m); try{ if(typeof HOST.userTheme!=='undefined'){ HOST.userTheme=m; if(typeof applyTheme==='function') applyTheme(); } }catch(_){} return R(ok||(typeof HOST.userTheme!=='undefined'&&HOST.userTheme===m), note('✓ '+L('Theme','テーマ','Thema','Тема','Tema')+': '+m)); }
    },
  },
  {
    row: ['settings.accent',            'accent',         'accentColor,accentColour',                                    'settings','setting', 'settings.accent',        'setting',             'persist', 'explicit','',        ''],
    doc: [
      { in: 'settings', at: 20, text: '{"type":"accent","color":"blue"|"green"|"purple"|"red"|"orange"|"teal"|"#rrggbb"|"default"} (recolours the UI accent); ' },
    ],
    catalogueSilent: '2026-09-18',   /* ㉓'s ledger (#R802, measured that day): its `doc` does not yet name its own subject in both en and jp — delete this line when it does */
    schema: () => ({ type: 'object', properties: { color: str(), value: str(), mode: str(), name: str() }, anyOf: [{ required: ['color'] }, { required: ['value'] }, { required: ['mode'] }, { required: ['name'] }] }),
    async run(a, dctx, K) { const R = K.R, warn = K.warn, L = K.L, esc = K.esc, applyAccent = K.applyAccent, saveSettings = K.saveSettings, note = K.note;
      {   /* (#R114) recolour the UI accent (--primary-color) */
          const raw=String(a.color||a.value||a.mode||a.name||'').trim().toLowerCase();
          const NAMED={blue:'#0a84ff',indigo:'#5e5ce6',purple:'#af52de',violet:'#af52de',magenta:'#bf5af2',pink:'#ff2d55',rose:'#ff2d55',red:'#ff3b30',orange:'#ff9500',amber:'#ff9500',green:'#34c759',teal:'#30b0c7',cyan:'#30b0c7',mint:'#00c7be',graphite:'#8e8e93',gray:'#8e8e93',grey:'#8e8e93'};
          let val=null;
          if(/^(default|reset|auto|none|off)$/.test(raw)) val='default';
          else if(/^#[0-9a-f]{6}$/.test(raw)) val=raw;
          else if(/^#[0-9a-f]{3}$/.test(raw)) val='#'+raw.slice(1).split('').map(c=>c+c).join('');
          else if(NAMED[raw]) val=NAMED[raw];
          if(!val) return R(false, warn(L('Unknown color','不明な色','Unbekannte Farbe','Неизвестный цвет','Color desconocido')+': '+esc(a.color||a.value||a.mode||'')));
          try{ window.imAccent=val; if(typeof applyAccent==='function') applyAccent(); if(typeof window._syncAccentPicker==='function') window._syncAccentPicker(); if(typeof saveSettings==='function') saveSettings(); }catch(_){}
          return R(true, note(L('Accent color','アクセントカラー','Akzentfarbe','Акцентный цвет','Color de acento')+': '+(val==='default'?L('default','デフォルト','Standard','по умолчанию','predeterminado'):val))); }
    },
  },
  {
    row: ['settings.language',          'language',       '',                                                            'settings','setting', 'settings.language',      'setting',             'persist', 'explicit','',        ''],
    /* any code, endonym, English name or alias js/lang-registry.js knows — not a closed set */
    doc: [
      { in: 'settings', at: 30, text: '{"type":"language","lang":"en"|"jp"|"de"|"ru"|"es"}; ' },
    ],
    catalogueSilent: '2026-09-18',   /* ㉓'s ledger (#R802, measured that day): its `doc` does not yet name its own subject in both en and jp — delete this line when it does */
    schema: () => ({ type: 'object', properties: { lang: str() }, required: ['lang'] }),
      /* (#R318) NINE, FROM THE REGISTRY. The hand-written table below covered five, so 「한국어로して」
         and «passe en français» were answered with 「非対応の言語」 by an app that has both. Every
         spelling a language row knows — its code, its aliases, its own name, its English name — now
         resolves, and a tenth language needs no edit here. */
    async run(a, dctx, K) { const _langCode = K._langCode, setLang = K.setLang, R = K.R, note = K.note, L = K.L, warn = K.warn, esc = K.esc;
      { const lg=_langCode(a.lang); if(lg){ let ok=false; try{ setLang(lg); ok=true; }catch(_){} return R(ok, note('✓ '+L('Language','言語','Sprache','Язык','Idioma')+': '+lg)); } return R(false, warn(L('Unsupported language','非対応の言語','Sprache nicht unterstützt','Язык не поддерживается','Idioma no admitido')+': '+esc(a.lang||''))); }
    },
  },
  {
    row: ['settings.tempUnit',          'tempUnit',       '',                                                            'settings','setting', 'settings.units',         'setting',             'persist', 'explicit','',        ''],
    doc: [
      { in: 'settings', at: 40, text: '{"type":"tempUnit","unit":"c"|"f"|"both"} = the TEMPERATURE SCALE every reading in the app is written in — Celsius, Fahrenheit, or both at once (use for 「華氏で表示して」, "show temperatures in Fahrenheit", 「摄氏に戻して」); ' },
    ],
    schema: () => ({ type: 'object', properties: { unit: one('c', 'celsius', 'f', 'fahrenheit', 'both') }, required: ['unit'] }),
    async run(a, dctx, K) { const setSel = K.setSel, R = K.R, note = K.note, warn = K.warn, esc = K.esc;
      { const u=({c:'c',celsius:'c',f:'f',fahrenheit:'f',both:'both'})[String(a.unit||'').toLowerCase()]; if(u){ const ok=setSel('setting-temp-unit',u); try{ window.imUnitTemp=u; localStorage.setItem('intmap_temp_unit',u); }catch(_){} return R(ok, note('✓ °'+String(u).toUpperCase())); } return R(false, warn(esc(a.unit||''))); }
    },
  },
  {
    row: ['settings.units',             'units',          '',                                                            'settings','setting', 'settings.units',         'setting',             'persist', 'explicit','',        ''],
    doc: [
      { in: 'settings', at: 50, text: '{"type":"units","mode":"metric"|"imperial"|"both"} = the same choice for everything else that carries a unit.\n' },
    ],
    catalogueSilent: '2026-09-18',   /* ㉓'s ledger (#R802, measured that day): its `doc` does not yet name its own subject in both en and jp — delete this line when it does */
    schema: () => ({ type: 'object', properties: { mode: one('metric', 'imperial', 'both') }, required: ['mode'] }),
    async run(a, dctx, K) { const setSel = K.setSel, HOST = K.HOST, R = K.R, note = K.note, esc = K.esc, warn = K.warn;
      { const m=({metric:'metric',imperial:'imperial',both:'both'})[String(a.mode||'').toLowerCase()]; if(m){ const ok=setSel('setting-units',m); try{ if(typeof HOST.unitMode!=='undefined') HOST.unitMode=m; }catch(_){} return R(ok, note('✓ '+esc(m))); } return R(false, warn(esc(a.mode||''))); }
    },
  },
  {
    row: ['settings.engine',            'engine',         '',                                                            'settings','setting', 'settings.engine',        'setting',             'persist', 'explicit','',        ''],
    /* ── settings and the layer switches that carry their own state ─────────────────────────── */
    doc: [
      { in: 'tools-panels', at: 260, text: '{"type":"engine","name":"maplibre"|"cesium"} = choose the MAP RENDERING ENGINE. MapLibre is the default 2-D/3-D map; Cesium is a real 3-D globe (a true ellipsoid at every zoom) drawing the SAME satellite imagery and the SAME elevation data through a second adapter, downloaded only when chosen. Switching RELOADS the page, and contour lines plus the closed 3-D solid tool remain MapLibre-only — say so rather than promising them. Omit "name" to REPORT which engine is running (use for "Cesiumに切り替えて", "3D地球儀モードにして", "switch to Cesium", "use the globe engine", "MapLibreに戻して", "which map engine is running?"); ' },
    ],
    schema: () => ({ type: 'object', properties: { name: str(), engine: str(), mode: str() } }), /* no name = REPORT which engine is running */
      /* (#R180) THE RENDERING ENGINE — Atlas is the control plane (STANDING RULE since #R82),
         so the second engine is selectable from here too. It cannot take effect on the live
         scene for the same reason the Settings panel reloads: a renderer swap is a rebuild.
         So this reports honestly — what is stored, what is DRAWING, and that a reload is what
         applies it — rather than claiming a change that has not happened yet. */
    async run(a, dctx, K) { const R = K.R, warn = K.warn, L = K.L, HOST = K.HOST, note = K.note;
      {
          const ES=window.IntMapEngineSelect;
          if(!ES) return R(false,warn(L('The engine selector is unavailable.','エンジン選択が利用できません。','Die Engine-Auswahl ist nicht verfügbar.','Выбор движка недоступен.','El selector de motor no está disponible.')));
          const nameOf=id=>ES.label(id,(HOST.lang||'en'));
          const asked=String(a.name||a.engine||a.mode||'').toLowerCase();
          const live=ES.active(), stored=ES.choice();
          if(!asked||/^(what|which|status)$/.test(asked)){
            let h=note('✓ '+L('Map engine','地図エンジン','Karten-Engine','Движок карты','Motor del mapa')+': '+nameOf(live));
            if(live!==stored) h+=note(L('Selected','選択中','Ausgewählt','Выбрано','Seleccionado')+': '+nameOf(stored)+' — '+L('reload to apply','再読み込みで適用','zum Anwenden neu laden','перезагрузите, чтобы применить','recarga para aplicar'));
            const f=ES.failure(); if(f) h+=warn(L('Cesium could not start','Cesiumを起動できませんでした','Cesium konnte nicht starten','Cesium не запустился','Cesium no pudo iniciarse')+' ('+f+')');
            return R(true,h);
          }
          const want=/cesium|セシウム|3d ?globe/.test(asked)?'cesium':'maplibre';
          ES.set(want);
          if(want===live) return R(true,note('✓ '+L('Already running on','すでに動作中','Läuft bereits mit','Уже работает на','Ya funciona con')+': '+nameOf(want)));
          /* the reload is the ACTION, so it is announced and then performed — not silently queued */
          try{ setTimeout(()=>{ try{ location.reload(); }catch(_){} },900); }catch(_){}
          return R(true,note('✓ '+L('Switching to','切り替え先','Wechsel zu','Переключение на','Cambiando a')+': '+nameOf(want)+' — '+L('reloading…','再読み込み中…','wird neu geladen…','перезагрузка…','recargando…')));
        }
    },
  },
  {
    row: ['settings.tiltLimit',         'tiltLimit',      '',                                                            'settings','setting', 'settings.camera',        'setting',             'persist', 'explicit','',        ''],
    doc: [
      { in: 'tools-panels', at: 270, text: '{"type":"tiltLimit","on":bool} = lift the MAP TILT CEILING from the standard 78° to the renderer\'s whole 0-180° range, so the camera can lean past the horizon until it looks straight up (use for "傾きの制限を外して", "地図をもっと倒したい", "let me tilt the map further", "unlimited tilt"); ' },
    ],
    schema: () => ({ type: 'object', properties: { on: bool(), mode: str() } }),
      /* (#R171) the two new Map-behaviour settings, operable from Atlas like every other feature. */
    async run(a, dctx, K) { const R = K.R, note = K.note, L = K.L, _featTogHtml = K._featTogHtml, warn = K.warn;
      { const want=!(a.on===false||/^(off|standard|normal)$/i.test(String(a.mode||''))); let ok=false; try{ if(window.IntMapTilt){ window.IntMapTilt.set(want); ok=true; } }catch(_){}
          const cap=(()=>{ try{ return Math.round(window.IntMapTilt.ceiling()); }catch(_){ return want?180:78; } })();
          return R(ok, ok?note('✓ '+L('Map tilt limit','地図の傾き制限','Neigungsgrenze','Предел наклона','Límite de inclinación')+': '+(want?L('unlimited','無制限','unbegrenzt','без предела','sin límite'):L('standard','標準','Standard','стандарт','estándar'))+' ('+cap+'°)')+_featTogHtml('tiltLimit'):warn('')); }
    },
  },
  {
    row: ['settings.eyeAltitude',       'eyeAltitude',    '',                                                            'settings','setting', 'settings.camera',        'setting',             'persist', 'explicit','',        ''],
    doc: [
      { in: 'tools-panels', at: 280, text: '{"type":"eyeAltitude","on":bool} = show the VIEWPOINT\'s own altitude above sea level in the always-on readout at the bottom-left, next to the coordinates and the ground elevation (use for "視点の高度も表示して", "show the camera altitude", "how high is the viewpoint"); ' },
    ],
    schema: () => ({ type: 'object', properties: { on: bool(), mode: str() } }),
    async run(a, dctx, K) { const R = K.R, note = K.note, L = K.L, _featTogHtml = K._featTogHtml, warn = K.warn;
      { const want=!(a.on===false||/^(off|hide)$/i.test(String(a.mode||''))); let ok=false;
          try{ if(window.IntMapEyeAlt){ window.IntMapEyeAlt.set(want); ok=true; } }catch(_){}
          const now=(()=>{ try{ const v=window.IntMapEyeAlt.altitude(); return (v==null)?'':' — '+window.IntMapEyeAlt.text(); }catch(_){ return ''; } })();
          return R(ok, ok?note('✓ '+L('Viewpoint altitude in the readout','常時表示欄の視点高度','Kamerahöhe in der Anzeige','Высота камеры в строке','Altitud del punto de vista')+': '+(want?'on':'off')+(want?now:''))+_featTogHtml('eyeAltitude'):warn('')); }
    },
  },
  {
    row: ['settings.usageCounts',       'usageCounts',    'usageStats,anonymousStats,telemetry',                         'settings','setting', 'settings.usageCounts',   'setting',             'persist', 'explicit','',        ''],
    /* (anonymous-usage-counts) the «Anonymous usage statistics» switch in Settings — js/usage-counts.js
       owns it (its `usage` export). No `on` and no mode = REPORT the state, including when nothing is
       sent for a reason the switch does not control (the browser's Do Not Track / Global Privacy
       Control, or a page that is not the production site). */
    doc: [
      { in: 'tools-panels', at: 290, text: '{"type":"usageCounts","on"?:bool} = the «Anonymous usage statistics» switch in Settings: IntMap\'s own aggregate counters (page views per day, the referring site\'s host name, utm tags, app language en/jp/other, mobile/desktop, which layers and features were used, how MANY Atlas questions — never their text; no cookie, IP, account or session). on:false stops it at once and discards what was not yet sent; no "on" = report the state, including when the browser\'s Do Not Track / Global Privacy Control already stops it (use for "利用統計を送らないで", "統計をオフ", "opt out of analytics", "stop sending usage data", "do you track me?"); ' },
    ],
    schema: () => ({ type: 'object', properties: { on: bool(), mode: str() } }),
    async run(a, dctx, K) { const R = K.R, note = K.note, L = K.L, warn = K.warn;
      { const U=usage; if(!U||typeof U.status!=='function') return R(false, warn(L('Usage statistics are not available on this page','このページでは利用統計を扱えません')));
          const m=String(a.mode||'').toLowerCase();
          const want=(a.on===true||/^(on|enable|enabled|true)$/.test(m))?true:(a.on===false||/^(off|disable|disabled|false|stop)$/.test(m))?false:null;
          const st=(want===null)?U.status():U.set(want);
          const why=st.reason==='dnt'?L('your browser asks not to be tracked (Do Not Track), so nothing is sent','ブラウザの「トラッキング拒否（Do Not Track）」が有効なので、何も送りません')
            :st.reason==='gpc'?L('your browser sends Global Privacy Control, so nothing is sent','ブラウザの Global Privacy Control が有効なので、何も送りません')
            :st.reason==='local'?L('this is not the production site, so nothing is sent','本番サイトではないので、何も送りません')
            :st.reason==='off'?L('nothing is sent','何も送りません')
            :L('anonymous counts are sent when the page is hidden or closed','ページを閉じる・隠すときに匿名の件数を送ります');
          return R(want===null||st.on===want, note('✓ '+L('Anonymous usage statistics','匿名の利用統計')+': '+(st.on?L('on','オン'):L('off','オフ'))+' — '+why)); }
    },
  },
  {
    row: ['settings.mapReading',        'mapReading',     'readingMode,screenReaderMode,readAloud,describeMap,describeHere', 'settings','none',    '',                       'explanation',         'persist', 'none',   '',        ''],
    /* (keyboard-and-offline) the map read in words — js/map-reader.js owns it (Alt+R says what is at the centre, Alt+Shift+R
       turns the reading mode on and off; Settings ▸ Keyboard shortcuts has the same switch). No `on` and no `describe` =
       REPORT the state. `describe` returns the very paragraph the screen reader is given. */
    doc: [
      { in: 'tools-panels', at: 292, text: '{"type":"mapReading","on"?:bool,"describe"?:bool} = the map READ IN WORDS for a person who cannot see the screen or does not use a mouse (スクリーンリーダー・キーボード操作・読み上げモード): on:true turns the reading mode on — after every move of the map IntMap says how far and which way the centre moved, then the place and its administrative chain, the country, the elevation, the local time and the value of every layer that is on; on:false turns it off; describe:true says what is at the centre of the view right now and returns that text (use for "読み上げモードをオンに", "地図を音声で説明して", "turn on screen reader mode", "describe where the map is centred"). The keys are Alt+R (describe) and Alt+Shift+R (mode) with focus on the map; the arrow keys move and +/- zoom; Alt+N walks the features near the centre; ' },
    ],
    schema: () => ({ type: 'object', properties: { on: bool(), mode: str(), describe: bool() } }),
    async run(a, dctx, K) { const R = K.R, note = K.note, L = K.L, warn = K.warn, esc = K.esc;
      { let m; try { m = await import('./map-reader.js'); } catch (_) { return R(false, warn(L('The reading mode is not available on this page','このページでは読み上げモードを使えません'))); }
          const md=String(a.mode||'').toLowerCase();
          const want=(a.on===true||/^(on|enable|enabled|true)$/.test(md))?true:(a.on===false||/^(off|disable|disabled|false)$/.test(md))?false:null;
          let text='', ok=true;
          try{ if(want!==null) m.setReading(want, a.describe===true); if(a.describe===true) text=await m.describeHere(); }catch(_){ ok=false; }
          if(!ok) return R(false, warn(L('The map is not ready to be read yet','地図の読み上げの準備がまだできていません')));
          const on=m.readingOn();
          return R(true, note('✓ '+L('Reading mode','読み上げモード')+': '+(on?L('on','オン'):L('off','オフ'))+(text?' — '+esc(text):'')), { exec: { mapReading: { on, text: text||null } } }); }
    },
  },
  {
    row: ['settings.offlineMaps',       'offlineMaps',    'offlineMap,saveMapOffline,downloadMap,offlineRegion,portableMap,mapWithoutInternet', 'settings','none',    '',                       'explanation',         'persist', 'explicit','',        ''],
    /* (keyboard-and-offline) the offline maps — js/offline-maps.js owns them; the Settings button opens the same dialog. `plan` is what the
       dialog shows BEFORE a save (the size, and what is refused with the terms it rests on); `save` keeps the region the view holds. */
    doc: [
      { in: 'tools-panels', at: 293, text: '{"type":"offlineMaps","action"?:"open"|"plan"|"save"|"list"|"remove","detail"?:int,"name"?:str,"id"?:str} = OFFLINE MAPS / 持ち歩ける地図・オフライン保存: keep the region the view holds on this device so IntMap opens with no connection — the terrain elevation tiles of that region (only a source whose terms were read and recorded as allowing it; the base map\'s vector tiles are NOT saved because OpenFreeMap\'s terms forbid automated collection) and IntMap\'s own data and code for the layers that are open. "plan" says the size and what is not saved and why, BEFORE anything is downloaded; "save" saves at "detail" (the terrain zoom; default = the dialog\'s choice) under "name"; "list" lists what is saved with sizes; "remove" deletes one by "id" or "name"; "open" (default) opens the dialog (use for "オフラインで使えるように保存", "この地域を保存して", "save this map for offline", "download the map for offline use", "what is saved offline", "delete the offline map"); ' },
    ],
    schema: () => ({ type: 'object', properties: { action: one('open', 'plan', 'save', 'list', 'remove'), detail: int(0, 22), name: str(), id: str() } }),
    async run(a, dctx, K) { const R = K.R, note = K.note, L = K.L, warn = K.warn, esc = K.esc, HOST = K.HOST;
      { let M, P; try { M = await import('./offline-maps.js'); P = await import('./offline-plan.js'); } catch (_) { return R(false, warn(L('Offline maps are not available on this page','このページではオフライン地図を使えません'))); }
          const act=String(a.action||'open').toLowerCase();
          const row=(k)=>esc((k.name||L('Saved area','保存した地域'))+' — '+P.mb(k.bytes)+' MB, '+k.tiles+' '+L('tiles','タイル')+', '+k.files.length+' '+L('files','ファイル')+(k.missing?', '+k.missing+' '+L('tile(s) missing','タイルが欠けています'):'')+' ['+k.id+']');
          if(act==='list'){ const ps=M.listPacks();
            return R(true, note(ps.length?'<ul>'+ps.map((k)=>'<li>'+row(k)+'</li>').join('')+'</ul>':L('Nothing is saved for offline use.','オフライン用に保存したものはありません。')), { exec: { offlineMaps: { packs: ps.map((k)=>({ id:k.id, name:k.name, bytes:k.bytes, tiles:k.tiles, files:k.files.length, missing:k.missing })) } } }); }
          if(act==='remove'){ const ps=M.listPacks(); const k=ps.find((x)=>x.id===a.id)||ps.find((x)=>a.name&&x.name===a.name);
            if(!k) return R(false, warn(L('No saved area matches. Say which one: ','該当する保存済みの地域がありません。どれか指定してください: ')+esc(ps.map((x)=>x.name||x.id).join(', '))));
            await M.remove(k.id); return R(true, note('✓ '+L('Deleted ','削除しました: ')+esc(k.name||k.id)), { exec: { offlineMaps: { removed: k.id } } }); }
          if(act==='open'){ await M.openOfflineMaps(HOST); return R(true, note('✓ '+L('Offline maps opened','オフライン地図を開きました'))); }
          const pl=await M.plan(HOST);
          if(!pl.box) return R(false, warn(L('The map is not ready yet','地図の準備がまだできていません')));
          const t=pl.terrain||{ options:[] };
          const summary=(t.options.length?t.options.map((o)=>L('detail ','細かさ ')+o.zMax+': '+o.tiles+' '+L('tiles','タイル')+', ≈'+P.mb(o.bytes)+' MB').join('; '):L('terrain not available ('+t.why+')','地形は保存できません（'+t.why+'）'))+'. '
            +L('IntMap\'s own files: ','IntMap 自身のファイル: ')+pl.own.files.length+' ≈'+P.mb(pl.own.bytes)+' MB. '
            +L('Not saved: ','保存しないもの: ')+(pl.refused.map((r)=>r.host+' — '+L(r.why,r.whyJp)).join(' | ')||L('nothing is refused','なし'));
          const exec={ offlineMaps: { box: pl.box, zoom: pl.zoom, layers: pl.layers, terrain: { why: t.why, options: t.options }, own: { files: pl.own.files.length, bytes: pl.own.bytes }, refused: pl.refused.map((r)=>({ host:r.host, basis:r.basis, why:r.why })), online: pl.online } };
          if(act==='plan') return R(true, note(esc(summary)), { exec });
          /* save */
          if(!pl.online) return R(false, warn(L('You are offline, so nothing can be saved now','オフラインのため、いまは保存できません')));
          const pick=a.detail!=null?t.options.find((o)=>o.zMax===+a.detail):P.defaultDetail(t.options, pl.zoom);
          if(a.detail!=null&&!pick) return R(false, warn(L('That detail does not fit. Available: ','その細かさは保存できません。選べるもの: ')+esc(t.options.map((o)=>o.zMax).join(', '))));
          if(!pick&&!pl.own.files.length) return R(false, warn(esc(summary)));
          const pack=await M.save({ box: pl.box, zMax: pick?pick.zMax:-1, template: t.template, name: String(a.name||''), layers: pl.layers, files: pl.own.files });
          exec.offlineMaps.saved={ id:pack.id, bytes:pack.bytes, tiles:pack.tiles, files:pack.files.length, missing:pack.missing };
          return R(pack.missing===0, note('✓ '+L('Saved: ','保存しました: ')+row(pack)), { exec }); }
    },
  },
];
