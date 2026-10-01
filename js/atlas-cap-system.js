/* ============================================================================
 *  IntMap · Atlas capabilities — the `system.*` namespace   (js/atlas-cap-system.js)
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
import { str, bool, one, loose, noArgs } from './atlas-caps.js';
import { IntMapLang } from './lang-registry.js';

export default [
  {
    row: ['system.diagnose',            'diagnose',       'health,selfCheck,systemStatus,status',                        'system',  'none',    '',                       'explanation',         'read',    'none',   '',         ''],
    /* ── clearing, outlining, the first-class panels ────────────────────────────────────────── */
    schema: () => (noArgs('diagnose')),
      /* ⚠⚠ (#R296) TWO CASES STOOD HERE. `disaster`/`flood`/`ashfall` — 「4つのうち、放射性物質拡散シミュ
         レーションを残し全削除」: what survives is `radiation`, its own capability; the tsunami spelling it
         forwarded is `tsunami`. `earthReplay` — 「存在意義が不明だから全削除」: `timeTravel` sets the date. */
      /* (#R80) vision §17 — IntMap self-diagnosis: news freshness + layer paint integrity + live-API reachability. */
    async run(a, dctx, K) { const healthCheck = K.healthCheck, L = K.L, esc = K.esc, note = K.note, R = K.R;
      {
          const H=await healthCheck({probe:true}); const dot=b=>b?'🟢':'🔴';
          let h='<div style="font-weight:600;margin:2px 0 6px;">'+L('Data & connection status','データ・接続状態','Daten- & Verbindungsstatus','Данные и соединение','Estado de datos y conexión')+'</div><div style="font-size:12px;line-height:1.75;">';
          h+=dot(!H.news.stale)+' '+L('News feed','ニュース','Nachrichten','Новости','Noticias')+': '+(H.news.count?(H.news.count+' '+L('articles','件','Artikel','статей','artículos')+(H.news.ageH==null?(' — '+L('undated','日付なし','ohne Datum','без дат','sin fecha')):(' — '+L('newest','最新','neuste','свежесть','más reciente')+' '+H.news.ageH+'h'))+(H.news.stale?(' ⚠ '+L('may have stopped updating','更新停止の可能性','evtl. keine Updates','возможно не обновляется','quizá no se actualiza')):'')):L('not loaded yet','未読込','noch nicht geladen','ещё не загружено','no cargado'))+'<br>';
          h+=dot(H.layers.bad===0)+' '+L('Layers','レイヤー','Ebenen','Слои','Capas')+': '+H.layers.on+' '+L('on','オン','an','вкл','activas')+(H.layers.bad?(' ⚠ '+H.layers.bad+' '+L('not painting','未描画','nicht gezeichnet','не отрисованы','sin pintar')+(H.layers.badN.length?(' ('+H.layers.badN.map(esc).join(', ')+')'):'')):(' — '+L('all painting','全て描画','alle ok','все ок','todas ok')))+'<br>';
          if(H.endpoints){ Object.keys(H.endpoints).forEach(k=>{ const e=H.endpoints[k]; if(e.ok==null){ h+='⚪ '+esc(k)+': '+L('not observed yet','未観測')+'<br>'; return; } h+=dot(e.ok)+' '+esc(k)+': '+(e.ok?(L('reachable','到達可能','erreichbar','доступно','accesible')+' · '+e.ms+'ms'):(e.status===429?(L('rate-limited','レート制限','ratenbegrenzt','лимит запросов','límite de tasa')+' (429)'):e.status?(L('error','エラー','Fehler','ошибка','error')+' '+e.status):(L('unreachable','到達不可','nicht erreichbar','недоступно','inaccesible'))))+'<br>'; }); }
          else h+='⚪ '+L('Live APIs: not probed','ライブAPI: 未確認','Live-APIs: nicht geprüft','Живые API: не проверены','APIs: sin comprobar')+'<br>';
          h+='</div>';
          h+=note(H.ok?('✓ '+L('All systems normal.','すべて正常です。','Alle Systeme normal.','Все системы в норме.','Todo normal.')):('⚠ '+L('Some data sources need attention (red). Atlas uses fallbacks where it can.','一部のデータ源に問題があります（赤）。可能な範囲でAtlasは代替に切り替えます。','Einige Datenquellen brauchen Aufmerksamkeit (rot). Atlas nutzt Ausweichquellen.','Некоторые источники требуют внимания (красное). Atlas использует запасные варианты.','Algunas fuentes requieren atención (rojo). Atlas usa alternativas.')));
          return R(true, h); }
    },
  },
  {
    row: ['system.module',              'module',         '',                                                            'system',  'panel',   'panel.any',              'panel',               'session', 'none',   '',         ''],
    schema: () => ({ type: 'object', properties: { name: str(), method: one('open', 'toggle', 'close', 'clear', 'exit', 'refresh', 'render') }, required: ['name'] }),
    async run(a, dctx, K) { const doModule = K.doModule;
      return doModule(a);
    },
  },
  {
    row: ['system.monitor',             'monitor',        '',                                                            'system',  'none',    '',                       '',                    'read',    'none',   '',         ''],
    schema: () => (noArgs('monitor')), /* withdrawn (#R231) — the case answers FEATURE_WITHDRAWN */
      /* (#R231) 「Monitorsは…一旦撤去」 — the ~120-line body is deleted (it is in git; the file has
         a line ceiling). It ended in IntMapOS.exec('tab.monitors'), which is no longer registered,
         so it would have replied "✓ Your monitors" and opened nothing — #R141's own rule forbids
         claiming a result that did not happen. Nothing can reach this case now; if one ever does,
         it says so. Restoring the feature: this case, the catalogue note below, the tab button in
         index.html, and the two routes in js/session-tabs.js. See DEV-NOTES #R231 §Monitors. */
    async run(a, dctx, K) { const R = K.R, warn = K.warn, HOST = K.HOST;
      return R(false, warn('⚠ '+IntMapLang.t(HOST.lang,'Area monitors are not available right now.','エリア監視は現在ご利用いただけません。','Gebietsmonitore sind derzeit nicht verfügbar.','Мониторы районов сейчас недоступны.','Los monitores de área no están disponibles por ahora.')), {meta:{code:'FEATURE_WITHDRAWN',category:'capability',retryable:false,userGoalSatisfied:false,produced:[]}});
    },
  },
  {
    row: ['system.control',             'control',        '',                                                            'system',  'control', 'ui.any',                 'panel',               'session', 'none',   '',         ''],
    schema: () => ({ type: 'object', properties: { target: str(), value: loose(), on: bool(), submit: bool() }, required: ['target'] }),
    async run(a, dctx, K) { const doControl = K.doControl;
      return doControl(a);
    },
  },
];
