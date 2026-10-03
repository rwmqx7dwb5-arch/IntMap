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
 *  (atlas-capability-single-source) An entry also holds `doc` — its fragment of each catalogue block the planner
 *  reads (js/atlas-catalog-text.js keeps only the blocks' order and headings) — and, where it has them, `phrases`,
 *  `policy`, `goal`, `chips` and `catalogueSilent`. js/atlas-caps.js says what each one is; nothing outside the
 *  entry names them.
 * ==========================================================================*/
import { str, bool, num, one, lat, lng, noArgs } from './atlas-caps.js';
import { EMBED_SIZES, EMBED_PX } from './embed-mode.js';   /* (share-embed-distribution) the frame presets `share` offers are the share panel's own */
import { IntMapTime } from './chronos.js';   /* (landing-showcase) the clock, by import (#860) */
import { SHOWCASE, showcaseById, showcaseLink } from './showcase.js';   /* (landing-showcase) the example maps — pure data */
import { openSupport, operatingFacts } from './supporter.js';   /* (supporter-funnel) `operatingCosts` */
import { icon } from './icons.js';   /* (icon-system) the one icon set — js/icons.js */

export default [
  {
    row: ['panel.compare',              'compare',        '',                                                            'panel',   'panel',   'panel.compare',          'panel',               'session', 'none',   '',         ''],
    doc: [
      { in: 'tools-panels', at: 20, text: '{"type":"compare","on":bool}; ' },
    ],
    catalogueSilent: '2026-09-18',   /* ㉓'s ledger (#R802, measured that day): its `doc` does not yet name its own subject in both en and jp — delete this line when it does */
    schema: () => ({ type: 'object', properties: { on: bool() } }),
    async run(a, dctx, K) { const R = K.R, note = K.note, L = K.L, _featTogHtml = K._featTogHtml, clickId = K.clickId;
      { try{ if(a.on===false){ const x=document.querySelector('#compare-window .cmp-close'); if(x){ x.click(); return R(true, note('✓ '+L('Compare off','比較オフ','Vergleich aus','Сравнение выкл','Comparar: off'))+_featTogHtml('compare')); } } else if(window.IntMapCompare&&window.IntMapCompare.open){ window.IntMapCompare.open(); return R(true, note('✓ '+L('Compare','比較','Vergleich','Сравнение','Comparar'))+_featTogHtml('compare')); } }catch(_){} return R(clickId('btn-compare'), note('✓ '+L('Compare','比較','Vergleich','Сравнение','Comparar'))+_featTogHtml('compare')); }   /* (#R151) offer the Compare on/off switch */
    },
  },
  {
    row: ['panel.tab',                  'tab',            '',                                                            'panel',   'panel',   'panel.tab',              'panel',               'session', 'none',   '',         ''],
    doc: [
      { in: 'tools-panels', at: 210, text: '{"type":"tab","name":"news"|"info"|"countries"|"community"} ("countries" = the country statistics tab, formerly Stats/Data); ' },
    ],
    catalogueSilent: '2026-09-18',   /* ㉓'s ledger (#R802, measured that day): its `doc` does not yet name its own subject in both en and jp — delete this line when it does */
    schema: () => ({ type: 'object', properties: { name: str() }, required: ['name'] }),
    async run(a, dctx, K) { const kexec = K.kexec, R = K.R, note = K.note, esc = K.esc, warn = K.warn, doControl = K.doControl;
      { const cmd={news:'tab.news',information:'tab.info',info:'tab.info',companies:'tab.info',company:'tab.info','企業':'tab.info',stats:'tab.stats',statistics:'tab.stats',data:'tab.stats',countries:'tab.stats',nations:'tab.stats',atlas:'tab.atlas',community:'tab.atlas'}[String(a.name||'').toLowerCase()];   /* (#R139) 'companies' → the repurposed info tab */
          const bid={'tab.news':'btn-news','tab.info':'btn-info','tab.stats':'btn-stats','tab.atlas':'btn-community','tab.community':'btn-community'}[cmd];
          if(cmd){ const ok=kexec(cmd,bid); return R(ok, ok?note('✓ '+esc(a.name||'')):warn('')); } return doControl({target:a.name}); }
    },
  },
  {
    row: ['panel.streetView',           'streetview',     'streetView,pano',                                             'panel',   'panel',   'panel.streetview',       'panel',               'session', 'none',   'point',    'streetView'],
    /* coverage mode paints the streets with no point at all, so it is its own branch */
    doc: [
      { in: 'tools-panels', at: 80, text: '{"type":"streetview","place":str} or {"type":"streetview","lng":num,"lat":num} = open embedded Google Street View at a spot (use for "Xのストリートビュー", "street view of Y"); ' },
    ],
    chips: 'streetview',   /* the map's on/off chip a completed run switches (js/atlas-console.js _ovlOf) */
    schema: () => ({ type: 'object', properties: { place: str(), lng: lng(), lat: lat(), mode: str(), coverage: bool(), on: bool() }, anyOf: [{ required: ['place'] }, { required: ['lat', 'lng'] }, { required: ['mode'] }, { required: ['coverage'] }, { required: ['on'] }] }), /* `streetview` */
    async run(a, dctx, K) { const R = K.R, note = K.note, L = K.L, _featTogHtml = K._featTogHtml, warn = K.warn, geocode = K.geocode, whereMiss = K.whereMiss, GE = K.GE, esc = K.esc;
      {
          /* (#R84) coverage mode: with no place, or when explicitly asked, tint roads blue + make the map clickable */
          if(a.on===false||/^(off|hide|stop)$/i.test(String(a.mode||''))){ try{ window.IntMapStreetView&&window.IntMapStreetView.coverage&&window.IntMapStreetView.coverage(false); }catch(_){} try{ window.IntMapStreetView&&window.IntMapStreetView.close&&window.IntMapStreetView.close(); }catch(_){} return R(true, note('✓ '+L('Street View off','ストリートビューをオフ','Street View aus','Просмотр улиц выкл','Street View apagado'))+_featTogHtml('streetview')); }   /* (#R150) offer the toggle to flip it back on */
          const wantCov=/^(coverage|layer|mode|map|roads?)$/i.test(String(a.mode||''))||a.coverage===true||(!a.place&&a.lng==null&&!(K._herePoint&&isFinite(K._herePoint.lng)));
          if(wantCov){ await window.IntMapLazy.need('streetView'); let on=false; try{ if(window.IntMapStreetView&&window.IntMapStreetView.coverage) on=window.IntMapStreetView.coverage(true); }catch(_){} return R(!!on, on?note(icon('person-standing')+' '+L('Street View mode on — the light-blue lines are Google\'s real coverage; click one to open its panorama','ストリートビュー・モードをオン — 水色の線はGoogleの実際のカバレッジです。クリックでパノラマを表示','Street-View-Modus an — die hellblauen Linien sind Googles echte Abdeckung; zum Öffnen anklicken','Режим панорам включён — голубые линии это реальное покрытие Google; кликните для просмотра','Modo Street View activado — las líneas celestes son la cobertura real de Google; haz clic para abrir'))+_featTogHtml('streetview'):warn('')); }
          let ll=null; if(a.lng!=null&&isFinite(+a.lng)) ll={lng:+a.lng,lat:+a.lat,name:a.place||''}; else if(a.place) ll=await geocode(a.place); else if(K._herePoint&&isFinite(K._herePoint.lng)) ll={lng:K._herePoint.lng,lat:K._herePoint.lat,name:K._herePoint.name||''};
          if(!ll) return R(false, warn(whereMiss(L('Where? Name a place or right-click a point','場所を指定するか地点を右クリックしてください','Wo? Ort nennen oder Punkt rechtsklicken','Где? Назовите место или ПКМ по точке','¿Dónde? Nombra un lugar'), a.place||a.at||a.location)));
          try{ GE().camera.flyTo({center:[+ll.lng,+ll.lat],zoom:Math.max(GE().camera.getZoom(),15),duration:900}); }catch(_){}
          await window.IntMapLazy.need('streetView'); let ok=false; try{ if(window.IntMapStreetView&&window.IntMapStreetView.open) ok=window.IntMapStreetView.open({lng:+ll.lng,lat:+ll.lat},ll.name||''); }catch(_){}
          return R(ok, ok?note(icon('person-standing')+' '+L('Street View','ストリートビュー','Street View','Просмотр улиц','Street View')+': '+esc(ll.name||((+ll.lat).toFixed(4)+', '+(+ll.lng).toFixed(4)))):warn('')); }
    },
  },
  {
    row: ['panel.education',            'edu',            'learn',                                                       'panel',   'panel',   'panel.edu',              'panel',               'session', 'none',   '',         ''],
    /* ── panels, layers, settings, the clock ────────────────────────────────────────────────── */
    doc: [
      { in: 'tools-panels', at: 200, text: '{"type":"edu"} (learn mode); ' },
    ],
    catalogueSilent: '2026-09-18',   /* ㉓'s ledger (#R802, measured that day): its `doc` does not yet name its own subject in both en and jp — delete this line when it does */
    schema: () => (noArgs('edu')),
    async run(a, dctx, K) { const clickId = K.clickId, R = K.R, note = K.note, L = K.L, warn = K.warn;
      { let ok=false; try{ if(window.IntMapEdu&&window.IntMapEdu.open){ window.IntMapEdu.open(); ok=true; } }catch(_){} if(!ok) ok=clickId('btn-edu'); return R(ok, ok?note(icon('graduation')+' '+L('Learn','学ぶ','Lernen','Обучение','Aprender')):warn('')); }
    },
  },
  {
    row: ['panel.ecmwf',                'ecmwf',          'weatherLayers',                                               'panel',   'panel',   'panel.ecmwf',            'panel',               'session', 'none',   '',         ''],
    doc: [
      { in: 'layers', at: 60, text: '{"type":"ecmwf"} (open the weather-layer suite). ' },
    ],
    catalogueSilent: '2026-09-18',   /* ㉓'s ledger (#R802, measured that day): its `doc` does not yet name its own subject in both en and jp — delete this line when it does */
    schema: () => (noArgs('ecmwf')),
    async run(a, dctx, K) { const R = K.R, note = K.note, L = K.L, warn = K.warn;
      { let ok=false; try{ if(window.IntMapWeatherEC&&window.IntMapWeatherEC.open){ window.IntMapWeatherEC.open(); ok=true; } }catch(_){} return R(ok, ok?note(icon('cloud-rain')+' '+L('Weather layers','気象レイヤー','Wetterebenen','Погодные слои','Capas meteorológicas')):warn('')); }
    },
  },
  {
    row: ['panel.widgets',              'widgets',        '',                                                            'panel',   'panel',   'panel.widgets',          'panel',               'session', 'none',   '',         ''],
    doc: [
      { in: 'tools-panels', at: 150, text: '{"type":"widgets"}; ' },
    ],
    catalogueSilent: '2026-09-18',   /* ㉓'s ledger (#R802, measured that day): its `doc` does not yet name its own subject in both en and jp — delete this line when it does */
    schema: () => (noArgs('widgets')),
    async run(a, dctx, K) { const clickId = K.clickId, R = K.R, note = K.note, L = K.L, warn = K.warn;
      { let ok=false; try{ if(window.IntMapWidgets&&window.IntMapWidgets.toggle){ window.IntMapWidgets.toggle(); ok=true; } else ok=clickId('btn-widgets'); }catch(_){} return R(ok, ok?note('✓ '+L('Widgets','ウィジェット','Widgets','Виджеты','Widgets')):warn('')); }
    },
  },
  {
    row: ['panel.screenshot',           'screenshot',     '',                                                            'panel',   'panel',   'panel.screenshot',       'panel,file',          'session', 'none',   '',         ''],
    doc: [
      { in: 'tools-panels', at: 160, text: '{"type":"screenshot"}; ' },
    ],
    catalogueSilent: '2026-09-18',   /* ㉓'s ledger (#R802, measured that day): its `doc` does not yet name its own subject in both en and jp — delete this line when it does */
    schema: () => (noArgs('screenshot')),
    async run(a, dctx, K) { const clickId = K.clickId, R = K.R, note = K.note, L = K.L, warn = K.warn;
      { const ok=clickId('btn-screenshot'); return R(ok, ok?note('✓ '+L('Screenshot','スクショ','Screenshot','Снимок','Captura')):warn('')); }
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
    doc: [
      { in: 'tools-panels', at: 170, text: '{"type":"share","embed"?:bool,"size"?:"small"|"medium"|"large"|"responsive","width"?:num,"height"?:num,"interactive"?:bool} = SHARE THE CURRENT MAP: opens the share panel and the RESULT carries the link itself — one address that reproduces the whole view (position, projection, base map, every active layer, the clock, compare and the simulators\' inputs), so give it to the user verbatim. With "embed":true it returns instead the <iframe> CODE that puts this same view on another website, read-only (the map, its legends, the date on the clock and every data credit, plus a link that opens it in IntMap); "size" picks one of the share panel\'s frame presets (medium is the default; responsive fills the width of the page it is put on) and the result states the size it used, "width"/"height" set pixels instead, and "interactive":false makes it a still picture with no pan or zoom. Use for "共有リンクを作って", "このビューのURLをちょうだい", "share this view", "send me a link to this map", "ブログに埋め込むコードをちょうだい" (embed:true), "embed this map on my website" (embed:true), "動かせない埋め込みにして" (embed:true, interactive:false); ' },
    ],
    schema: () => ({ type: 'object', properties: { embed: bool(), size: one.apply(null, Object.keys(EMBED_SIZES)), width: num(EMBED_PX.min, EMBED_PX.max), height: num(EMBED_PX.min, EMBED_PX.max), interactive: bool() } }),
    async run(a, dctx, K) { const clickId = K.clickId, R = K.R, note = K.note, L = K.L, warn = K.warn, esc = K.esc;
      { const S=window.IntMapShare, wantEmbed=(a.embed===true);
        if(!(S&&S.open)){ const ok=clickId('btn-share'); return R(ok, ok?note('✓ '+L('Share panel','共有パネル','Teilen','Поделиться','Compartir')):warn('')); }
        let made=null; try{
          await S.open(wantEmbed?{ tab:'embed', size:a.size, width:a.width, height:a.height, interactive:a.interactive }:{ tab:'link' });
          made=wantEmbed?S.embed():{ url:S.link() }; }catch(_){ made=null; }
        if(!made||!made.url) return R(false, warn(L('Could not build the share link','共有リンクを作れませんでした')));
        if(wantEmbed) return R(true, note('✓ '+L('Embed code','埋め込みコード')+' ('+esc(String(made.size.w))+' × '+esc(String(made.size.h))+(made.interactive?'':(', '+L('no pan or zoom','パン・ズーム無効')))+'): '+esc(made.code)));
        return R(true, note('✓ '+L('Share link','共有リンク')+': '+esc(made.url))); }
    },
  },
  {
    row: ['panel.search',               'search',         '',                                                            'panel',   'panel',   'panel.search',           'panel',               'session', 'none',   'text',     ''],
    doc: [
      { in: 'navigation-view', at: 100, text: '{"type":"search","query":str} (place-search box). For a REGION (continent, "Central Europe", "Southern Italy", "Middle East", "the Caribbean") just pass its name to flyTo — the engine knows region extents and slices directional names from the real country; never substitute a tiny sub-place. ' },
    ],
    catalogueSilent: '2026-09-18',   /* ㉓'s ledger (#R802, measured that day): its `doc` does not yet name its own subject in both en and jp — delete this line when it does */
    schema: () => ({ type: 'object', properties: { query: str(), place: str() }, anyOf: [{ required: ['query'] }, { required: ['place'] }] }),
    async run(a, dctx, K) { const R = K.R, note = K.note, esc = K.esc, WORLD_RE = K.WORLD_RE, GE = K.GE, L = K.L, placeExtent = K.placeExtent, _setLast = K._setLast, flyToBox = K.flyToBox, _ambigNote = K._ambigNote, geocode = K.geocode, _bboxOK = K._bboxOK, warn = K.warn;
      { const q=a.query||a.place||''; const inp=document.getElementById('ms-input')||document.getElementById('search-input'); if(inp&&q){ inp.focus(); inp.value=q; inp.dispatchEvent(new Event('input',{bubbles:true})); const btn=document.getElementById('ms-btn'); if(btn) btn.click(); else inp.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',keyCode:13,bubbles:true})); return R(true, note(icon('search')+' '+esc(q))); } if(WORLD_RE.test(String(q).trim())){ try{ GE().camera.flyTo({center:[GE().camera.getCenter().lng,20],zoom:1.4,duration:1000}); }catch(_){} return R(true, note(icon('world')+' '+L('Whole world','全世界','Ganze Welt','Весь мир','El mundo entero'))); } const ext=await placeExtent(q); if(ext){ try{ _setLast(ext); }catch(_){} if(!(ext.box&&flyToBox(ext.box))) GE().camera.flyTo({center:[ext.lng,ext.lat],zoom:Math.max(GE().camera.getZoom(),10),duration:1000}); return R(true, note(icon('search')+' '+esc(ext.name||q))+_ambigNote(q,ext.lng,ext.lat)); } const ll=await geocode(q); if(ll){ try{ if(ll.bbox&&_bboxOK(ll.bbox)) flyToBox(ll.bbox); else GE().camera.flyTo({center:[ll.lng,ll.lat],zoom:Math.max(GE().camera.getZoom(),10),duration:1000}); }catch(_){} return R(true, note(icon('search')+' '+esc(ll.name||q))+_ambigNote(q,ll.lng,ll.lat)); } return R(false, warn(esc(q))); }
    },
  },
  {
    row: ['panel.correlate',            'correlate',      '',                                                            'panel',   'panel',   'panel.correlate',        'panel',               'session', 'none',   '',         ''],
    doc: [
      { in: 'tools-panels', at: 140, text: '{"type":"correlate"} (scatter tool); ' },
    ],
    catalogueSilent: '2026-09-18',   /* ㉓'s ledger (#R802, measured that day): its `doc` does not yet name its own subject in both en and jp — delete this line when it does */
    schema: () => (noArgs('correlate')),
    async run(a, dctx, K) { const clickId = K.clickId, R = K.R, note = K.note, L = K.L, warn = K.warn;
      { let ok=false; try{ if(window.IntMapCorrelate&&window.IntMapCorrelate.open){ window.IntMapCorrelate.open(); ok=true; } else ok=clickId('btn-correlate'); }catch(_){} return R(ok, ok?note(L('Correlation tool','相関ツール','Korrelationswerkzeug','Корреляция','Correlación')):warn('')); }
    },
  },
  {
    row: ['panel.settings',             'settings',       '',                                                            'panel',   'panel',   'panel.settings',         'panel',               'session', 'none',   '',         ''],
    doc: [
      { in: 'tools-panels', at: 180, text: '{"type":"settings"}; ' },
    ],
    catalogueSilent: '2026-09-18',   /* ㉓'s ledger (#R802, measured that day): its `doc` does not yet name its own subject in both en and jp — delete this line when it does */
    schema: () => (noArgs('settings')),
    async run(a, dctx, K) { const clickId = K.clickId, R = K.R, note = K.note, L = K.L, warn = K.warn;
      { const ok=clickId('btn-open-settings'); return R(ok, ok?note('✓ '+L('Settings','設定','Einstellungen','Настройки','Ajustes')):warn('')); }
    },
  },
  {
    row: ['panel.workspace',            'workspace',      'windows,windowMode,windowWorkspace',                          'panel',   'panel',   'panel.workspace',        'panel',               'session', 'none',   '',         ''],
    doc: [
      { in: 'tools-panels', at: 190, text: '{"type":"workspace","on"?:bool} = switch the desktop floating-window WORKSPACE mode on/off (News, Countries, map, layers and Atlas each become a movable/resizable window) — use for "ワークスペースモードにして", "switch to workspace", "exit workspace", "通常モードに戻して" (on:false); ' },
    ],
    schema: () => ({ type: 'object', properties: { on: bool(), mode: str(), action: str(), state: str() } }),
      /* (#R85) workspace (floating-window) mode via Atlas ("ワークスペースモードの切り替えがAtlasでできない") */
    async run(a, dctx, K) { const R = K.R, warn = K.warn, note = K.note, L = K.L;
      {
          if(!window.IntMapWorkspace) return R(false, warn(''));
          const active=!!(window.IntMapWorkspace.active&&window.IntMapWorkspace.active());
          const m=String(a.mode||a.action||a.state||'').toLowerCase();
          const want = (a.on===false||/^(off|exit|close|normal|stop|disable|leave)$/.test(m)) ? false
                     : (a.on===true ||/^(on|enter|open|start|enable|switch)$/.test(m)) ? true
                     : !active;   /* unspecified → toggle */
          if(want===active) return R(true, note('✓ '+(active?L('Already in workspace mode','すでにワークスペースモードです','Bereits im Workspace-Modus','Уже в оконном режиме','Ya en modo espacio'):L('Already in normal mode','すでに通常モードです','Bereits im Normalmodus','Уже в обычном режиме','Ya en modo normal'))));
          let ok=false; try{ if(want){ ok=(window.IntMapWorkspace.open()!==false); } else { window.IntMapWorkspace.close(); ok=true; } }catch(_){}
          return R(ok, ok? note(want?'🗔 '+L('Workspace mode on — News, Countries, the map, layers and Atlas are now free-floating windows','ワークスペースモードをオン — ニュース・国・地図・レイヤー・Atlasが自由なウィンドウになりました','Workspace-Modus an','Оконный режим включён','Modo espacio activado')
                                   :'✓ '+L('Back to the normal layout','通常レイアウトに戻しました','Zurück zum Normal-Layout','Обычный вид','De vuelta al diseño normal'))
                       : warn(L('Workspace mode is desktop-only','ワークスペースモードはデスクトップ専用です','Workspace nur am Desktop','Оконный режим — только для десктопа','Solo escritorio'))); }
    },
  },
  {
    row: ['panel.shortcuts',            'shortcuts',      'keyboard,hotkeys',                                            'panel',   'panel',   'panel.shortcuts',        'panel',               'session', 'none',   '',         ''],
    doc: [
      { in: 'more-features', at: 80, text: '{"type":"shortcuts"} (keyboard-shortcut cheat sheet); ' },
    ],
    catalogueSilent: '2026-09-18',   /* ㉓'s ledger (#R802, measured that day): its `doc` does not yet name its own subject in both en and jp — delete this line when it does */
    schema: () => (noArgs('shortcuts')),
    async run(a, dctx, K) { const R = K.R, note = K.note, L = K.L, warn = K.warn;
      { let ok=false; try{ if(window.IntMapKbdHelp){ window.IntMapKbdHelp(); ok=true; } }catch(_){} return R(ok, ok?note(L('Keyboard shortcuts','キーボードショートカット','Tastaturkürzel','Горячие клавиши','Atajos de teclado')):warn('')); }
    },
  },
  {
    row: ['panel.playground',           'playground',     'game',                                                        'panel',   'panel',   'panel.playground',       'panel',               'session', 'none',   '',         'playground'],
    doc: [
      { in: 'more-features', at: 10, text: '{"type":"playground","mode":"world"|"pandemic"|"quiz"} (open a Playground game — World Explorer / Pandemic Simulator / Quiz); ' },
    ],
    catalogueSilent: '2026-09-18',   /* ㉓'s ledger (#R802, measured that day): its `doc` does not yet name its own subject in both en and jp — delete this line when it does */
    schema: () => ({ type: 'object', properties: { mode: str(), name: str() } }),
    async run(a, dctx, K) { const R = K.R, note = K.note, esc = K.esc, warn = K.warn, L = K.L;
      { const m=String(a.mode||a.name||'').toLowerCase(); let ok=false, lbl='Playground';
          try{ await window.IntMapLazy.need('playground'); if(/world|explorer|geo|satellite|drop|guess|どこ|地理/.test(m)&&window._pgWorldExplorer){ window._pgWorldExplorer(); ok=true; lbl='World Explorer'; }   /* ⚠⚠ (#R666) THE MODULE IS FETCHED BEFORE THE MODE IS CHOSEN, NOT INSTEAD OF IT. The two named-mode arms below test `window._pgWorldExplorer` / `window._pgPandemic`, and js/playground.js's factory — which since #R209 runs only when the module is ASKED FOR — is what installs them. So on a page where nobody had opened the Playground yet, both arms were false and 「パンデミック・シミュレーターを開いて」 fell through to the `else`, which fetched the module and opened THE HUB: Atlas answered a request for one simulator with a menu of four. */
            else if(/pandemic|virus|outbreak|epidemic|disease|感染|パンデミック|эпидеми|pandemia/.test(m)&&window._pgPandemic){ window._pgPandemic(); ok=true; lbl='Pandemic Simulator'; }
            else if(/quiz|test|クイズ|викторин|cuestionario/.test(m)&&window.IntMapEdu&&window.IntMapEdu.open){ window.IntMapEdu.open(); ok=true; lbl='Quiz'; }
            else if(window._openPlayground){ window._openPlayground(); ok=true; } }catch(_){}
          return R(ok, ok?note(icon('gamepad')+' '+esc(lbl)):warn(L('Playground unavailable','プレイグラウンドを開けません','Playground nicht verfügbar','Playground недоступен','Playground no disponible'))); }
    },
  },
  {
    row: ['panel.news',                 'news',           '',                                                            'panel',   'panel',   'panel.news',             'panel',               'session', 'none',   '',         ''],
    doc: [
      { in: 'more-features', at: 20, text: '{"type":"news","mode":"subject"|"publisher"|"saved"|"translate"} (switch news pins to where the event happened vs the outlet HQ, show saved articles, or translate headlines); ' },
    ],
    catalogueSilent: '2026-09-18',   /* ㉓'s ledger (#R802, measured that day): its `doc` does not yet name its own subject in both en and jp — delete this line when it does */
    schema: () => ({ type: 'object', properties: { mode: str(), name: str() } }),
    async run(a, dctx, K) { const L = K.L, clickId = K.clickId, R = K.R, note = K.note, esc = K.esc, warn = K.warn;
      { const m=String(a.mode||a.name||'').toLowerCase(); let id=null,lbl='';
          /* (#R416) `pinmode-pub` / `pinmode-loc` are gone — the pin is where the story happened. */
          if(/saved|favorit|bookmark|保存|ブックマーク|сохран|guardad/.test(m)){ id='newsfilter-saved'; lbl=L('Saved','保存','Gespeichert','Сохранённые','Guardados'); }
          else if(/all|unsaved|すべて|全部|все|todo/.test(m)){ id='newsfilter-all'; lbl=L('All','すべて','Alle','Все','Todo'); }
          else if(/translat|翻訳|перевод|traduc/.test(m)){ id='ai-translate-btn'; lbl=L('Translate','翻訳','Übersetzen','Перевод','Traducir'); }
          if(id){ const ok=clickId(id); return R(ok, ok?note(icon('news')+' '+esc(lbl)):warn('')); }
          const ok=clickId('btn-news'); return R(ok, ok?note(icon('news')+' '+L('News','ニュース','Nachrichten','Новости','Noticias')):warn('')); }
    },
  },
  {
    row: ['panel.account',              'account',        'login',                                                       'panel',   'panel',   'panel.account',          'panel',               'session', 'none',   '',         ''],
    doc: [
      { in: 'more-features', at: 30, text: '{"type":"account"} (open login / account); ' },
    ],
    catalogueSilent: '2026-09-18',   /* ㉓'s ledger (#R802, measured that day): its `doc` does not yet name its own subject in both en and jp — delete this line when it does */
    schema: () => (noArgs('account')),
    async run(a, dctx, K) { const clickId = K.clickId, R = K.R, note = K.note, L = K.L, warn = K.warn;
      { const ok=clickId('btn-account'); return R(ok, ok?note(icon('person')+' '+L('Account','アカウント','Konto','Аккаунт','Cuenta')):warn('')); }
    },
  },
  {
    row: ['panel.donate',               'donate',         '',                                                            'panel',   'panel',   'panel.donate',           'panel',               'session', 'none',   '',         ''],
    doc: [
      { in: 'more-features', at: 40, text: '{"type":"donate"} (open the support panel — the Stripe page opens only when the reader clicks it); ' },
    ],
    catalogueSilent: '2026-09-18',   /* ㉓'s ledger (#R802, measured that day): its `doc` does not yet name its own subject in both en and jp — delete this line when it does */
    schema: () => (noArgs('donate')),
    async run(a, dctx, K) { const clickId = K.clickId, R = K.R, note = K.note, L = K.L, warn = K.warn;
      { const ok=clickId('btn-blueberry'); return R(ok, ok?note(icon('heart')+' '+L('Donate','寄付','Spenden','Поддержать','Donar')):warn('')); }
    },
  },
  {
    row: ['panel.about',                'about',          'aboutIntMap,forTeachers,teachingGuide,landingPage',          'panel',   'none',    '',                       'explanation',         'read',    'none',   '',         ''],
    /* (landing-showcase) what IntMap is and how to teach with it — the two static pages scripts/landing.mjs
       writes. `page:'teachers'` names the teacher page; anything else, the landing page. The link is the
       English URL: the page itself moves a reader whose app language is Japanese to its ja/ twin
       (scripts/landing.mjs PAGE_SCRIPT), so that rule lives in one place and not also here. */
    doc: [
      { in: 'about-and-showcase', at: 10, text: '{"type":"about","page"?:"teachers"} = a link to the page that says what IntMap is (or, with page "teachers", how to teach with it), in the reader’s language — an overview of the product for a new visitor, or a lesson plan and classroom guide — for 「IntMap について」「IntMap とは何か」「先生向けの授業での使い方」, "about IntMap", "for teachers". ' },
    ],
    schema: () => ({ type: 'object', properties: { page: str() } }),
    async run(a, dctx, K) { const R = K.R, note = K.note, L = K.L, esc = K.esc;
      { const teach=/^(teach|teacher|teachers|class|classroom|lesson|school|edu)/i.test(String(a.page||''));
          const href=new URL('./'+(teach?'teachers':'about')+'.html', location.href).href;
          const label=teach?L('Teaching with IntMap','授業での IntMap'):L('About IntMap','IntMap について');
          return R(true, note(icon('info')+' '+esc(label))+'<div style="margin:4px 0;"><a href="'+esc(IntMapSafe.url(href))+'" target="_blank" rel="noopener">'+esc(label)+' ↗</a></div>'); }
    },
  },
  {
    row: ['panel.showcase',             'showcase',       'example,exampleMap,showcaseMap,gallery',                      'panel',   'time',    'camera,map.layer,time',  'map,time',            'session', 'none',   '',         ''],
    /* (landing-showcase) the example maps of js/showcase.js. With `id`, the map is put into that example
       through the share link's own restore (js/map-ui.js IntMapBookmark.restore — the path a reader who
       clicks the example takes), and the result is READ BACK from the clock and the layer boxes before it
       is reported: completed only when the date and every declared layer are what the example says.
       Without `id`, it lists them (id, title, link) so the next call can name one. */
    doc: [
      { in: 'about-and-showcase', at: 20, text: (c) => '{"type":"showcase","id":ID} = put the map into one of IntMap’s ready-made example maps — the camera, the date and the layers exactly as the example declares them — and report it opened only once the clock and the layers say so; with no id it lists them. The examples (ID — title): ' + c.showcaseList() + ' — for 「見本の地図を見せて」「授業で使える地図の例」, "show me an example map", "a map for my class", or a request that matches one of the titles (「1914年のヨーロッパ」 → europe-1914).' },
    ],
    schema: () => ({ type: 'object', properties: { id: str() } }),
    async run(a, dctx, K) { const R = K.R, note = K.note, warn = K.warn, L = K.L, esc = K.esc;
      { const want=String(a.id||a.example||a.name||'').trim();
          const s=want?showcaseById(want):null;
          const abs=(rel)=>IntMapSafe.url(new URL(rel, location.href).href);
          if(!s){
            const rows=SHOWCASE.map(x=>{ const href=showcaseLink(x.id); return '<li><b>'+esc(x.id)+'</b> — '+(href?'<a href="'+esc(abs(href))+'">'+esc(L.arr(x.title))+'</a>':esc(L.arr(x.title)))+'</li>'; }).join('');
            return R(!want, (want?warn(esc(L('No example is called','この名前の見本はありません'))+' «'+esc(want)+'»'):note(esc(L('Example maps','見本の地図'))))+'<ul style="margin:4px 0 4px 18px;padding:0;">'+rows+'</ul>'); }
          const href=showcaseLink(s.id);
          if(!href) return R(false, warn(esc(L('This example has no captured link yet','この見本にはまだリンクがありません'))));
          const hash=href.slice(href.indexOf('#'));
          try{ history.replaceState(null,'',location.pathname+location.search+hash); window.IntMapBookmark.restore({shared:true});
            /* a link with no `tt` leaves the clock where it is (restore() sets it only when the link names one), so a
               «now» example returns the clock to now itself — the example's intent is the present, whatever the
               map was showing before */
            if(s.at==null) IntMapTime.setNow({source:'ui'}); }catch(e){ return R(false, warn(esc(String(e&&e.message||e)))); }
          /* read the state back. The restore applies the clock at +900 ms and the layer boxes at +700 / +1800 /
             +3200 ms (js/map-ui.js restore()); 6 s is its last pass plus room for a busy page. It returns the
             moment both agree — the wait is a bound, not a sleep — and a changed restore schedule is the
             thing that invalidates the number. */
          const T=IntMapTime, at=s.at;
          const met=()=>{ try{ const st=T.state(); const timeOk=at==null?!!st.isLive:(!st.isLive&&st.iso===at);
              const off=s.layers.filter(id=>{ const cb=document.getElementById(id); return !(cb&&cb.checked); });
              return { timeOk, off }; }catch(_){ return { timeOk:false, off:s.layers.slice() }; } };
          let m=met(); const t0=Date.now();
          while(!(m.timeOk&&!m.off.length)&&Date.now()-t0<6000){ await new Promise(r=>setTimeout(r,250)); m=met(); }
          const body='<div style="font-weight:600;margin:2px 0;">'+esc(L.arr(s.title))+'</div><div style="font-size:12px;margin:2px 0;">'+esc(L.arr(s.blurb))+'</div>'
            +'<div style="font-size:12px;margin:4px 0;color:var(--text-muted);">'+esc(L('Question for class','授業での問い'))+': '+esc(L.arr(s.question))+'</div>';
          if(m.timeOk&&!m.off.length) return R(true, note('✓ '+esc(L('Example opened','見本を開きました')))+body);
          const miss=[]; if(!m.timeOk) miss.push(L('the date','日付')); if(m.off.length) miss.push(L('layers not on','オンにならないレイヤー')+' '+m.off.join(', '));
          return R(false, warn(esc(L('The example did not fully apply','見本が一部しか適用されていません'))+' — '+esc(miss.join(' / ')))+body); }
    },
  },
  {
    row: ['panel.tour',                 'tour',           'classroomTour,lessonTour,guidedTour,startTour,nextStep',      'panel',   'time',    'camera,map.layer,time',  'map,time',            'session', 'none',   '',         ''],
    /* (classroom-tours) the classroom tours of js/tours.js, played by js/tour-player.js in its full-screen
       classroom mode. `action`:
         list            the tours (id, title, steps) — and the one assembled in this tab, if any
         start           `id` (a declared tour, or "atlas") at `step` (from 1)
         next / prev / go   move through the tour playing (`go` takes `step`)
         exit            leave the classroom mode
         addStep         record the map AS IT IS NOW — the app's own share link, IntMapBookmark.link() — with
                         `title`, `say` (what the teacher reads out) and `ask` (the question for the class) onto the
                         tour this tab assembles (id "atlas"; `tourTitle` names it). Set the map up first with the
                         other capabilities; this never writes a link of its own.
         clear           forget the assembled tour
       A step is reported shown only when the map says so: the player reads the clock and the layer boxes back
       against the step's own link (js/tour-player.js settled — the reading panel.showcase makes). */
    doc: [
      { in: 'panel.tour', text: (c) => 'CLASSROOM TOURS — A LESSON AS A SEQUENCE OF MAPS, FULL SCREEN FOR A PROJECTOR (授業ツアー): {"type":"tour","action"?:"list"|"start"|"next"|"prev"|"go"|"exit"|"addStep"|"clear","id"?:ID,"step"?:int,"title"?:str,"say"?:str,"ask"?:str,"tourTitle"?:str}. start opens a tour in the classroom mode (everything but the map, its legends and credits put away; large type; the reader moves with Next / Previous, the arrow keys or Space) at `step` (from 1) and reports it opened only once the clock and the layers say so; next / prev / go move through the tour that is playing; exit leaves. The tours (ID — title): ' + c.tourList() + '. To BUILD A TOUR FROM THIS CONVERSATION: set the map up for one step with the other capabilities (camera, date, layers), then {"type":"tour","action":"addStep","title":…,"say":…,"ask":…} records the map exactly as it is now (its own share link) with the words to read out and a question for the class; repeat for each step, then {"type":"tour","action":"start","id":"atlas"}. Write `say` and `ask` only about what the map shows. For 「授業ツアーを始めて」「明治の日本のツアー」「次へ」「前のステップ」「この流れをツアーにして」, "start a classroom tour", "next step", "make this into a lesson tour".' },
    ],
    schema: () => ({ type: 'object', properties: { action: one('list', 'start', 'next', 'prev', 'go', 'exit', 'addStep', 'clear'), id: str(), step: num(1), title: str(), say: str(), ask: str(), tourTitle: str() } }),
    async run(a, dctx, K) { const R = K.R, note = K.note, warn = K.warn, L = K.L, esc = K.esc;
      { const P = await import('./tour-player.js');
          const act = String(a.action || (a.id ? 'start' : 'list')).trim();
          const shown = (r, head) => {
            const s = P.status();
            const body = s ? '<div style="font-weight:600;margin:2px 0;">' + esc(s.title) + ' · ' + esc(L('step ', 'ステップ ')) + s.step + ' / ' + s.of + '</div>'
              + (s.stepTitle ? '<div style="font-size:12px;margin:2px 0;">' + esc(s.stepTitle) + '</div>' : '')
              + (s.ask ? '<div style="font-size:12px;margin:4px 0;color:var(--text-muted);">' + esc(L('Question for class', '授業での問い')) + ': ' + esc(s.ask) + '</div>' : '') : '';
            if (r && r.ok) return R(true, note('✓ ' + esc(head)) + body);
            const miss = []; if (r && r.timeOk === false) miss.push(L('the date', '日付')); if (r && r.off && r.off.length) miss.push(L('layers not on', 'オンにならないレイヤー') + ' ' + r.off.join(', '));
            return R(false, warn('' + esc(L('The step did not fully apply', 'ステップが一部しか適用されていません')) + (miss.length ? ' — ' + esc(miss.join(' / ')) : (r && r.reason ? ' — ' + esc(r.reason) : ''))) + body);
          };
          if (act === 'list') {
            const rows = P.declaredTours().map((t) => '<li><b>' + esc(t.id) + '</b> — ' + esc(L.arr(t.title)) + ' (' + t.steps.length + ')</li>').join('');
            const tmp = P.tempTour();
            return R(true, note(esc(L('Classroom tours', '授業ツアー'))) + '<ul style="margin:4px 0 4px 18px;padding:0;">' + rows
              + (tmp && tmp.steps.length ? '<li><b>atlas</b> — ' + esc(tmp.title || L('Tour from Atlas', 'Atlas が作ったツアー')) + ' (' + tmp.steps.length + ')</li>' : '') + '</ul>'); }
          if (act === 'addStep') {
            const r = P.addStep({ title: a.title, say: a.say, ask: a.ask, tourTitle: a.tourTitle });
            if (!r.ok) return R(false, warn('' + esc(L('Could not record the map', '地図を記録できませんでした')) + ' — ' + esc(r.reason)));
            return R(true, note('✓ ' + esc(L('Step recorded', 'ステップを記録しました')) + ' (' + r.count + ') — ' + esc(L('start it with id "atlas"', 'id "atlas" で開始できます')))); }
          if (act === 'clear') { P.clearTemp(); return R(true, note('✓ ' + esc(L('The assembled tour is cleared', '組み立てたツアーを消しました')))); }
          if (act === 'exit') { const ok = P.exit(); return R(ok, ok ? note('✓ ' + esc(L('Left the tour', 'ツアーを終えました'))) : warn('' + esc(L('No tour is playing', '再生中のツアーはありません')))); }
          if (act === 'next') return shown(await P.next(), L('Next step', '次のステップ'));
          if (act === 'prev') return shown(await P.prev(), L('Previous step', '前のステップ'));
          if (act === 'go') return shown(await P.go(a.step), L('Step opened', 'ステップを開きました'));
          const id = String(a.id || a.name || '').trim();
          const r = await P.startTour(id, a.step || 1);
          if (r && r.reason === 'unknown-tour') return R(false, warn('' + esc(L('No tour is called', 'この名前のツアーはありません')) + ' «' + esc(id) + '»'));
          return shown(r, L('Tour started', 'ツアーを始めました')); }
    },
  },
  {
    row: ['panel.tourBuilder',          'tourBuilder',    'buildTour,makeTour,tourEditor,addMapToTour,shareTour',        'panel',   'time',    'camera,map.layer,time,tour.draft', 'map,time',     'persist', 'explicit', '',     ''],
    /* (tour-builder) the TOUR BUILDER (js/tour-builder.js): the tour a reader writes for their own lesson, kept in
       this browser while it is written and shared as a link that carries the whole tour (`?tour=custom&t=…`,
       js/tours.js) — no account, no server. `action`:
         open            show the builder panel
         addStep         record the map AS IT IS NOW (the codec's own fragment, MapState.hash() — the share link's)
                         as a new step with `title`, `say`, `ask` (at the end, or after `step`); `tourTitle` names the tour
         replace         step `step` takes the map as it is now (its words stay)
         edit            set step `step`'s `title` / `say` / `ask` (only those given)
         move            move step `step` to position `to`
         remove          delete step `step`
         title           name the tour (`tourTitle`)
         list            the draft's steps
         link            the share link, with how much of the address it uses against the hosted site's measured limit
         play            preview the draft in the classroom mode from `step` — the same player a shared link opens
         clear           delete the draft
       Column 7 is 'persist' (the draft is written to localStorage) and column 8 'explicit' — `clear` and `remove`
       destroy what a teacher wrote. Column 5 names `tour.draft`, which no restorer puts back, so the turn's undo
       does not claim to reverse it (js/atlas-capabilities.js UNDO_EXACT). */
    doc: [
      { in: 'panel.tour', at: 10, text: ' TOUR BUILDER — A TOUR THE READER WRITES AND SHARES AS A LINK (ツアー作成): {"type":"tourBuilder","action"?:"open"|"addStep"|"replace"|"edit"|"move"|"remove"|"title"|"list"|"link"|"play"|"clear","step"?:int,"to"?:int,"title"?:str,"say"?:str,"ask"?:str,"tourTitle"?:str}. The builder keeps a draft in this browser that the reader can edit in its panel (reorder, replace, delete, write the words) and share as ONE link carrying the whole tour (no account, no server). addStep records the map exactly as it is now — set it up first with the other capabilities (camera, date, layers, compare) — with the step title, what to say and a question for the class; link returns the share link and how much of the address it uses (a tour too long for the hosted site is refused, not shortened); play previews it in the classroom mode. Prefer this over panel.tour addStep when the reader wants to KEEP, EDIT or SHARE the tour; panel.tour addStep is the tab-only tour. For 「ツアーを作る」「この地図をツアーのステップに追加」「ツアーを共有するリンク」「作ったツアーを再生」, "make a tour", "add this map to my tour", "share my tour", "play my tour".' },
    ],
    schema: () => ({ type: 'object', properties: { action: one('open', 'addStep', 'replace', 'edit', 'move', 'remove', 'title', 'list', 'link', 'play', 'clear'), step: num(1), to: num(1), title: str(), say: str(), ask: str(), tourTitle: str() } }),
    async run(a, dctx, K) { const R = K.R, note = K.note, warn = K.warn, L = K.L, esc = K.esc;
      { const B = await import('./tour-builder.js');
          const act = String(a.action || 'open').trim();
          const why = (r) => ({ 'no-map': L('the map has not finished loading', '地図の読み込みが終わっていません'), 'no-link': L('this map cannot be written as a link', 'この地図はリンクにできません'),
            'no-step': L('there is no such step', 'そのステップはありません'), 'no-steps': L('the tour has no steps yet', 'ツアーにまだステップがありません'),
            'too-long': L('the tour is too long for a link', 'ツアーがリンクには長すぎます') }[r && r.reason] || String((r && r.reason) || ''));
          const fail = (head, r) => R(false, warn(esc(head) + ' — ' + esc(why(r))));
          const size = (m) => (m ? ' · ' + esc(L('link', 'リンク')) + ' ' + m.bytes + ' / ' + m.limit + ' B'
            + (m.level === 'near' ? ' — ' + esc(L('one more step may not fit', 'あと 1 ステップ入らないかもしれません')) : m.level === 'over' ? ' — ' + esc(L('too long to share; shorten it', '共有できない長さです。短くしてください')) : '') : '');
          const listHtml = () => { const d = B.getDraft();
            return '<div style="font-weight:600;margin:2px 0;">' + esc(d.title || L('Untitled tour', '無題のツアー')) + ' (' + d.steps.length + ')</div><ol style="margin:4px 0 4px 18px;padding:0;">'
              + d.steps.map((s) => '<li>' + esc(s.title || L('(no title)', '（題なし）')) + (s.hash ? '' : ' — ' + esc(L('no map', '地図なし'))) + '</li>').join('') + '</ol>'; };
          if (act === 'open') { B.openBuilder(); return R(true, note('✓ ' + esc(L('Tour builder opened', 'ツアー作成を開きました'))) + listHtml()); }
          if (act === 'addStep') {
            const r = await B.addCurrent({ title: a.title, say: a.say, ask: a.ask, tourTitle: a.tourTitle, after: a.step });
            if (!r.ok) return fail(L('Could not record the map', '地図を記録できませんでした'), r);
            return R(true, note('✓ ' + esc(L('Step recorded', 'ステップを記録しました')) + ' (' + r.step + ' / ' + r.count + ')') + size(r.budget)); }
          if (act === 'replace') { const r = await B.replaceStep(a.step); if (!r.ok) return fail(L('Could not replace the map', '地図を差し替えられませんでした'), r);
            return R(true, note('✓ ' + esc(L('The step now shows the map as it is', 'ステップをいまの地図にしました')) + ' (' + r.step + ')') + size(r.budget)); }
          if (act === 'edit') { const r = B.editStep(a.step, { title: a.title, say: a.say, ask: a.ask }); return r.ok ? R(true, note('✓ ' + esc(L('Step updated', 'ステップを更新しました'))) + listHtml()) : fail(L('Could not edit', '編集できませんでした'), r); }
          if (act === 'move') { const r = B.moveStep(a.step, a.to); return r.ok ? R(true, note('✓ ' + esc(L('Step moved', 'ステップを移動しました'))) + listHtml()) : fail(L('Could not move', '移動できませんでした'), r); }
          if (act === 'remove') { const r = B.removeStep(a.step); return r.ok ? R(true, note('✓ ' + esc(L('Step deleted', 'ステップを削除しました'))) + listHtml()) : fail(L('Could not delete', '削除できませんでした'), r); }
          if (act === 'title') { B.setTitle(a.tourTitle != null ? a.tourTitle : a.title); return R(true, note('✓ ' + esc(L('Tour named', 'ツアーの題を付けました'))) + listHtml()); }
          if (act === 'list') return R(true, listHtml());
          if (act === 'clear') { B.clearDraft(); return R(true, note('✓ ' + esc(L('The draft tour is deleted', '下書きのツアーを削除しました')))); }
          if (act === 'link') { const r = await B.shareLink(); if (!r.ok) return fail(L('No link', 'リンクを作れません'), r);
            return R(true, note('✓ ' + esc(L('Tour link', 'ツアーのリンク'))) + size(r) + '<div style="font-size:12px;word-break:break-all;margin:4px 0;"><a href="' + esc(IntMapSafe.url(r.url)) + '">' + esc(r.url) + '</a></div>'); }
          if (act === 'play') { const r = await B.preview(a.step || 1);
            if (r && r.ok) return R(true, note('✓ ' + esc(L('Tour preview started', 'ツアーのプレビューを始めました'))) + ' · ' + esc(L('step ', 'ステップ ')) + r.step + ' / ' + r.of);
            const miss = []; if (r && r.timeOk === false) miss.push(L('the date', '日付')); if (r && r.off && r.off.length) miss.push(L('layers not on', 'オンにならないレイヤー') + ' ' + r.off.join(', '));
            return R(false, warn(esc(L('The step did not fully apply', 'ステップが一部しか適用されていません')) + ' — ' + esc(miss.length ? miss.join(' / ') : why(r)))); }
          return R(false, warn(esc(L('Unknown action', '不明な操作')) + ' «' + esc(act) + '»')); }
    },
  },
  {
    row: ['panel.operatingCosts',       'operatingCosts', 'runningCosts,supportCosts,whereSupportGoes',                  'panel',   'panel',   'panel.donate',           'panel,explanation',   'session', 'none',   '',         ''],
    /* (supporter-funnel) «運営費を見る» / "what does IntMap cost to run" — opens the support panel at «where
       support goes» AND hands Atlas the same facts the panel shows, so it can answer in words without
       inventing a figure: the daily allowance from the plan table and this month's AI requests and
       tokens from public.operating_stats(). A month that could not be read is said to be unreadable. */
    doc: [
      { in: 'more-features', at: 50, text: '{"type":"operatingCosts"} (WHERE SUPPORT GOES — opens the support panel at its costs section AND returns the facts it shows: the daily Atlas allowance from the plan table and the project-wide AI requests and tokens recorded this month; use for 「運営費を見る」「IntMapの維持費は？」「支援は何に使われる？」, "what does IntMap cost to run", "where does my support go"; quote only the figures it returns — it has no figure in money); ' },
    ],
    schema: () => (noArgs('operatingCosts')),
    async run(a, dctx, K) { const R = K.R, note = K.note, L = K.L, esc = K.esc, warn = K.warn;
      { const opened=openSupport({ section:'costs' }); let f=null; try{ f=await operatingFacts(); }catch(_){ f=null; }
          if(!opened&&!f) return R(false, warn(''));
          const al=f&&f.allowance;
          const lines=[ L('Where support goes','支援の使い道'),
            al? L('Atlas allowance: ','Atlas の1日の上限: ')+al.aiTurnsPerDay+L(' questions and ',' 回の質問と ')+al.aiGlossPerDay+L(' term look-ups a day (free plan — every reader has it; no paid plan exists).',' 回の用語解説（無料プラン。全員が同じで、有料プランはありません）') : '',
            f? f.monthLine : '' ].filter(Boolean);
          return R(true, note(lines.map(esc).join('<br>'))); }
    },
  },
  {
    row: ['panel.feedback',             'feedback',       '',                                                            'panel',   'panel',   'panel.feedback',         'panel',               'session', 'none',   '',         ''],
    doc: [
      { in: 'more-features', at: 60, text: '{"type":"feedback"}; ' },
    ],
    catalogueSilent: '2026-09-18',   /* ㉓'s ledger (#R802, measured that day): its `doc` does not yet name its own subject in both en and jp — delete this line when it does */
    schema: () => (noArgs('feedback')),
    async run(a, dctx, K) { const clickId = K.clickId, R = K.R, note = K.note, L = K.L, warn = K.warn;
      { let ok=false; try{ if(window._openFeedback){ window._openFeedback(); ok=true; } }catch(_){} if(!ok) ok=clickId('btn-feedback-hdr'); return R(ok, ok?note('✓ '+L('Feedback','フィードバック','Feedback','Отзыв','Comentarios')):warn('')); }
    },
  },
  {
    row: ['panel.bugReport',            'bugReport',      'bug',                                                         'panel',   'panel',   'panel.feedback',         'panel',               'session', 'none',   '',         ''],
    doc: [
      { in: 'more-features', at: 70, text: '{"type":"bugReport"}; ' },
    ],
    catalogueSilent: '2026-09-18',   /* ㉓'s ledger (#R802, measured that day): its `doc` does not yet name its own subject in both en and jp — delete this line when it does */
    schema: () => (noArgs('bugReport')),
    async run(a, dctx, K) { const R = K.R, note = K.note, L = K.L, warn = K.warn;
      { let ok=false; try{ if(window._openBugReport){ window._openBugReport(); ok=true; } }catch(_){} return R(ok, ok?note(icon('bug')+' '+L('Bug report','バグ報告','Fehlerbericht','Сообщить об ошибке','Reportar error')):warn('')); }
    },
  },
  {
    row: ['panel.ticker',               'ticker',         '',                                                            'panel',   'panel',   'panel.ticker',           'panel',               'session', 'none',   '',         ''],
    doc: [
      { in: 'tools-panels', at: 250, text: '{"type":"ticker","on":bool} (the bottom news/markets ticker strip); ' },
    ],
    catalogueSilent: '2026-09-18',   /* ㉓'s ledger (#R802, measured that day): its `doc` does not yet name its own subject in both en and jp — delete this line when it does */
    schema: () => ({ type: 'object', properties: { on: bool(), mode: str() } }),
    async run(a, dctx, K) { const saveSettings = K.saveSettings, R = K.R, note = K.note, L = K.L, _featTogHtml = K._featTogHtml, warn = K.warn;
      { const onT=!(a.on===false||/^(off|hide)$/i.test(String(a.mode||''))); let okT=false;
          try{ if(window.IntMapTicker){ window.imTicker=onT?'on':'off'; window.IntMapTicker.apply(); okT=true; try{ if(typeof saveSettings==='function') saveSettings(); }catch(_){} } }catch(_){}
          return R(okT, okT?note('✓ '+L('Bottom ticker','下部ティッカー','Ticker','Бегущая строка','Cinta inferior')+': '+(onT?'on':'off'))+_featTogHtml('ticker'):warn('')); }   /* (#R149) offer the ticker on/off toggle */
    },
  },
];
