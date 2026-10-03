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
 *  (atlas-capability-single-source) An entry also holds `doc` — its fragment of each catalogue block the planner
 *  reads (js/atlas-catalog-text.js keeps only the blocks' order and headings) — and, where it has them, `phrases`,
 *  `policy`, `goal`, `chips` and `catalogueSilent`. js/atlas-caps.js says what each one is; nothing outside the
 *  entry names them.
 * ==========================================================================*/
import { str, bool, one, int, loose, noArgs } from './atlas-caps.js';
import { IntMapLang } from './lang-registry.js';
import { icon } from './icons.js';   /* (icon-system) the one icon set — js/icons.js */
import { statusPage, whatsNew } from './layer-state.js';   /* (shell-experience) the status page, read as text by `diagnose`; (ops-next) the what's-new list, read by `whatsNew` */
import { registryConsistency, missingUiEntries, probeAiProxy } from './atlas-selfcheck.js';   /* (atlas-os) what the diagnosis can see of Atlas itself */
import { capabilityEntries } from './atlas-caps.js';

/* ══ (atlas-os) ATLAS ITSELF — the registry it booted with, the AI relay, the buttons its commands name ═══
   js/atlas-selfcheck.js holds the three readings; this renders them. Each line is green, red, or GREY for
   «could not observe» — a reading that did not happen is never shown as either of the other two. */
async function atlasSelf(K) {
  const L = K.L, esc = K.esc;
  const facts = {}; let ok = true;
  const dot = (b) => '<span style="color:' + (b == null ? 'var(--text-muted)' : (b ? '#34c759' : '#ff3b30')) + '">' + icon('dot') + '</span>';
  let h = '<div style="font-weight:600;margin:10px 0 6px;">' + L('Atlas itself', 'Atlas 自身') + '</div><div style="font-size:12px;line-height:1.75;">';
  /* ① the registry against the modules */
  let rc = null;
  try { const M = await import('./atlas-caps-modules.js'); rc = registryConsistency(capabilityEntries(M.CAPABILITY_MODULES), K.CAPS); } catch (_) { rc = null; }
  facts.registry = rc;
  if (!rc) h += dot(null) + ' ' + L('Capability registry: could not be read', '能力の登録: 読めませんでした') + '<br>';
  else {
    const bad = rc.implementedUnregistered.length + rc.registeredWithoutEntry.length + rc.spellingDrift.length;
    if (bad) ok = false;
    h += dot(!bad) + ' ' + L('Capability registry', '能力の登録') + ': ' + rc.registered + ' ' + L('registered', '件が登録') + ' · ' + rc.entries + ' ' + L('implemented', '件が実装');
    if (rc.implementedUnregistered.length) h += '<br>' + icon('warning') + ' ' + L('implemented but not in the registry Atlas searches (the page carries stale generated rows)', '実装されているが、Atlas が検索する登録に無い（生成された行が古い）') + ': ' + rc.implementedUnregistered.map(esc).join(', ');
    if (rc.registeredWithoutEntry.length) h += '<br>' + icon('warning') + ' ' + L('registered but with nothing to run', '登録されているが実行するものが無い') + ': ' + rc.registeredWithoutEntry.map(esc).join(', ');
    if (rc.spellingDrift.length) h += '<br>' + icon('warning') + ' ' + L('dispatch spelling differs', '呼び名が食い違う') + ': ' + rc.spellingDrift.map((d) => esc(d.id + ' (' + d.entry + ' / ' + d.registry + ')')).join(', ');
    h += '<br>';
  }
  /* ② the AI relay */
  let ai = null; try { const W = (typeof window !== 'undefined') ? window : globalThis; ai = await probeAiProxy((typeof fetch === 'function') ? fetch : null, W.SUPABASE_URL, W.SUPABASE_ANON_KEY, 8000); } catch (_) { ai = { state: 'unobservable' }; }
  facts.aiProxy = ai;
  if (ai.state === 'reachable') h += dot(true) + ' ' + L('AI relay (ai-proxy)', 'AI 中継（ai-proxy）') + ': ' + L('reachable', '到達可能') + ' · ' + ai.ms + 'ms<br>';
  else if (ai.state === 'unobservable') h += dot(null) + ' ' + L('AI relay (ai-proxy)', 'AI 中継（ai-proxy）') + ': ' + L('could not be observed from this page (not the same as down)', 'このページからは観測できませんでした（停止とは限りません）') + '<br>';
  else { ok = false; h += dot(false) + ' ' + L('AI relay (ai-proxy)', 'AI 中継（ai-proxy）') + ': ' + L('answered with an error', 'エラーを返しました') + ' ' + esc(String(ai.status)) + (ai.error ? ' (' + esc(ai.error) + ')' : '') + '<br>'; }
  /* ③ the buttons the kernel's commands declare */
  let ui = null; try { ui = missingUiEntries((typeof window !== 'undefined') ? window.IntMapOS : null, (typeof document !== 'undefined') ? document : null); } catch (_) { ui = null; }
  facts.uiEntries = ui;
  if (!ui) h += dot(null) + ' ' + L('UI entries: could not be read', 'UI の入口: 読めませんでした') + '<br>';
  else {
    if (ui.missing.length) ok = false;
    h += dot(!ui.missing.length) + ' ' + L('UI entries', 'UI の入口') + ': ' + ui.declared + ' ' + L('commands declare a button', '件のコマンドがボタンを宣言')
      + (ui.missing.length ? ' · ' + icon('warning') + ' ' + L('button not on the page', 'ボタンがページに無い') + ': ' + ui.missing.map((m) => esc(m.cmd + ' (#' + m.btn + ')')).join(', ') : ' · ' + L('all present', 'すべて在る')) + '<br>';
  }
  h += '</div>';
  return { ok, html: h, facts };
}

export default [
  {
    row: ['system.diagnose',            'diagnose',       'health,selfCheck,systemStatus,status',                        'system',  'none',    '',                       'explanation',         'read',    'none',   '',         ''],
    /* ── clearing, outlining, the first-class panels ────────────────────────────────────────── */
    doc: [
      { in: 'more-features', at: 90, text: '{"type":"diagnose"} (IntMap SELF-DIAGNOSIS — checks news-feed freshness, whether enabled layers are actually painting, whether the live data APIs are reachable, and ATLAS ITSELF — whether the capability registry this page booted with matches the capability modules (a capability implemented but missing from what you can search is named), whether the AI relay answers, and whether every command that declares a toolbar button still has it on the page; a reading that could not be made is reported as unobservable, never as down; use for "diagnose", "any issues?", "システムの状態", "データは最新？", "何か問題ある？"). Its result also carries the page 「IntMap のいま」 (IntMap, now): this device (online; stored for offline use), every layer that could not be drawn and why, LAST NIGHT\'S CHECK of every data source (which are not answering, since when, when each last answered) and when Atlas\'s own answers were last evaluated. To SHOW that page to the reader: {"type":"module","name":"IntMapStatus","method":"open"}.\n' + 'REACHABLE AREA / ISOCHRONE — the ONLY correct answer to a travel-TIME question: ' },
    ],
    schema: () => (noArgs('diagnose')),
      /* ⚠⚠ (#R296) TWO CASES STOOD HERE. `disaster`/`flood`/`ashfall` — 「4つのうち、放射性物質拡散シミュ
         レーションを残し全削除」: what survives is `radiation`, its own capability; the tsunami spelling it
         forwarded is `tsunami`. `earthReplay` — 「存在意義が不明だから全削除」: `timeTravel` sets the date. */
      /* (#R80) vision §17 — IntMap self-diagnosis: news freshness + layer paint integrity + live-API reachability. */
    async run(a, dctx, K) { const healthCheck = K.healthCheck, L = K.L, esc = K.esc, note = K.note, R = K.R;
      {
          const H=await healthCheck({probe:true}); const dot=b=>'<span style="color:'+(b?'#34c759':'#ff3b30')+'">'+icon('dot')+'</span>';   /* (icon-system) one status dot, coloured — green reachable, red not */
          let h='<div style="font-weight:600;margin:2px 0 6px;">'+L('Data & connection status','データ・接続状態','Daten- & Verbindungsstatus','Данные и соединение','Estado de datos y conexión')+'</div><div style="font-size:12px;line-height:1.75;">';
          h+=dot(!H.news.stale)+' '+L('News feed','ニュース','Nachrichten','Новости','Noticias')+': '+(H.news.count?(H.news.count+' '+L('articles','件','Artikel','статей','artículos')+(H.news.ageH==null?(' — '+L('undated','日付なし','ohne Datum','без дат','sin fecha')):(' — '+L('newest','最新','neuste','свежесть','más reciente')+' '+H.news.ageH+'h'))+(H.news.stale?(' '+icon('warning')+' '+L('may have stopped updating','更新停止の可能性','evtl. keine Updates','возможно не обновляется','quizá no se actualiza')):'')):L('not loaded yet','未読込','noch nicht geladen','ещё не загружено','no cargado'))+'<br>';
          h+=dot(H.layers.bad===0)+' '+L('Layers','レイヤー','Ebenen','Слои','Capas')+': '+H.layers.on+' '+L('on','オン','an','вкл','activas')+(H.layers.bad?(' '+icon('warning')+' '+H.layers.bad+' '+L('not painting','未描画','nicht gezeichnet','не отрисованы','sin pintar')+(H.layers.badN.length?(' ('+H.layers.badN.map(esc).join(', ')+')'):'')):(' — '+L('all painting','全て描画','alle ok','все ок','todas ok')))+'<br>';
          if(H.endpoints){ Object.keys(H.endpoints).forEach(k=>{ const e=H.endpoints[k]; if(e.ok==null){ h+='<span style="color:var(--text-muted)">'+icon('dot')+'</span> '+esc(k)+': '+L('not observed yet','未観測')+'<br>'; return; } h+=dot(e.ok)+' '+esc(k)+': '+(e.ok?(L('reachable','到達可能','erreichbar','доступно','accesible')+' · '+e.ms+'ms'):(e.status===429?(L('rate-limited','レート制限','ratenbegrenzt','лимит запросов','límite de tasa')+' (429)'):e.status?(L('error','エラー','Fehler','ошибка','error')+' '+e.status):(L('unreachable','到達不可','nicht erreichbar','недоступно','inaccesible'))))+'<br>'; }); }
          else h+='<span style="color:var(--text-muted)">'+icon('dot')+'</span> '+L('Live APIs: not probed','ライブAPI: 未確認','Live-APIs: nicht geprüft','Живые API: не проверены','APIs: sin comprobar')+'<br>';
          h+='</div>';
          /* (shell-experience) …and the status page's own reading, as text: the same model js/service-status.js draws for the
             reader — last night's check of every supplier, Atlas's own evaluation, offline readiness, the layers that failed and why */
          try{ const P=await statusPage.describe(); if(P&&P.text) h+='<div style="font-size:12px;line-height:1.6;margin-top:8px;white-space:pre-wrap;">'+esc(P.text)+'</div>'; }catch(_){}
          const A=await atlasSelf(K); h+=A.html;
          const allOk=H.ok&&A.ok;
          h+=note(allOk?('✓ '+L('All systems normal.','すべて正常です。','Alle Systeme normal.','Все системы в норме.','Todo normal.')):(icon('warning')+' '+L('Some data sources need attention (red). Atlas uses fallbacks where it can.','一部のデータ源に問題があります（赤）。可能な範囲でAtlasは代替に切り替えます。','Einige Datenquellen brauchen Aufmerksamkeit (rot). Atlas nutzt Ausweichquellen.','Некоторые источники требуют внимания (красное). Atlas использует запасные варианты.','Algunas fuentes requieren atención (rojo). Atlas usa alternativas.')));
          return R(true, h, { meta: { diagnose: { data: !!H.ok, atlas: A.facts } } }); }
    },
  },
  {
    row: ['system.connections',         'connections',    'pageConnections,networkActivity,thirdParties,whoIsThisPageTalkingTo', 'system', 'none', '',                   'explanation',         'read',    'none',   '',         ''],
    doc: [
      { in: 'more-features', at: 91, text: '{"type":"connections","show"?:true} = WHICH SITES THIS PAGE HAS ACTUALLY CONTACTED SINCE IT OPENED, as the browser itself reports them (every request of the page, every WebSocket, background workers\' requests while the offline helper is active, and attempts the security policy refused), each held against IntMap\'s published statement of where its code connects and what each place is sent (Privacy Policy §4): grouped by what is sent (nothing / the map area / a chosen point / search words / an article URL / what you write), and naming any host the statement does not name or contradicts. Also says what the list cannot see. This is the connection TRANSPARENCY list of IntMap — 「このページの通信」 (outbound connections, third parties). Use for 「このページはどこと通信している？」「外部に何を送っている？」「第三者に位置情報を送っている？」「通信の透明性」, "who is this page talking to?", "what does IntMap send to third parties?", "network activity". show:true also opens the live list (Settings ▸ Privacy ▸ This page\'s connections) for the reader; ' },
    ],
    /* the reader's own words for it (scored as spellings by the search — js/atlas-capabilities.js scoreParts) */
    phrases: () => ['このページの通信', '通信の透明性', '外部への送信'].concat(['transparency', 'outbound']),   /* the Japanese phrases, then the English words — two lists, not translations of each other */
    schema: () => ({ type: 'object', properties: { type: { type: 'string', enum: ['connections'] }, show: bool() } }),
    async run(a, dctx, K) { const R = K.R, note = K.note, esc = K.esc, HOST = K.HOST;
      const lang = HOST.lang, T = (en, jp) => IntMapLang.t(lang, en, jp);
      const M = await import('./connections-panel.js');
      const D = await M.describe(lang);
      const m = D.model;
      const tone = { ok: '#34c759', warn: 'var(--widget-warning,#ff9f0a)', bad: 'var(--widget-danger,#ff3b30)' };
      let h = '<div style="font-weight:600;margin:2px 0 4px;">' + esc(m.headline) + '</div><div style="font-size:11.5px;opacity:.75;margin:0 0 6px;">' + esc(m.sub) + '</div>';
      for (const s of m.sections) {
        if (s.id === 'coverage') continue;
        h += '<div style="font-size:11px;font-weight:600;opacity:.75;margin:8px 0 2px;">' + esc(s.title) + ' · ' + s.rows.length + '</div><div style="font-size:12px;line-height:1.6;">'
          + s.rows.slice(0, 12).map((r) => '<span style="color:' + (tone[r.tone] || 'var(--text-muted)') + '">' + icon('dot') + '</span> ' + esc(r.title) + (r.detail ? ' <span style="opacity:.7;">— ' + esc(r.detail) + '</span>' : '')).join('<br>')
          + (s.rows.length > 12 ? '<br><span style="opacity:.7;">' + esc(T('… and ' + (s.rows.length - 12) + ' more in the full list', '…ほか ' + (s.rows.length - 12) + ' 件（一覧に全件）')) + '</span>' : '') + '</div>';
      }
      const cov = m.sections.find((s) => s.id === 'coverage');
      if (cov) h += note(esc(cov.rows.filter((r) => r.tone !== 'ok').map((r) => r.title + ': ' + r.detail).join(' / ')));
      let shown = false;
      if (a && a.show) { try { await M.open(); shown = true; } catch (_) { shown = false; } }
      if (shown) h += note(esc(T('The live list is open.', 'ライブの一覧を開きました。')));
      return R(true, h, { meta: { connections: D.facts } });
    },
  },
  {
    /* (ops-next) 「新着」— what changed in IntMap, from whats-new.json (scripts/whats-new.mjs writes it at build from the
       reader's lines every merge's record carries). Read only: the list is IntMap's own words about itself. */
    row: ['system.whatsNew',            'whatsNew',       'whatsnew,changelog,releaseNotes,updates,newFeatures',          'system',  'none',    '',                       'explanation',         'read',    'none',   '',         ''],
    doc: [
      { in: 'more-features', at: 92, text: '{"type":"whatsNew","since"?:"YYYY-MM-DD","limit"?:int} = 新着・更新情報 — WHAT\'S NEW IN INTMAP: the changes a reader can see, newest first, each with its date and the change (pull request) it came from — the same list as Settings ▸ 「新着」, the updates page and its Atom feed. Use for "what\'s new", "what changed recently", "any new features?", 「最近何が変わった？」「新機能は？」「更新情報」. Entries this device has not shown yet are marked unread. To SHOW the list to the reader: {"type":"module","name":"IntMapWhatsNew","method":"open"}.\n' },
    ],
    schema: () => ({ type: 'object', properties: { since: str(), limit: int(1, 200) } }),
    async run(a, dctx, K) { const R = K.R, warn = K.warn, L = K.L, esc = K.esc, HOST = K.HOST;
      const since = /^\d{4}-\d{2}-\d{2}$/.test(String(a.since || '')) ? String(a.since) : undefined;
      const limit = Number.isInteger(a.limit) ? a.limit : undefined;
      let D = null;
      try { D = await whatsNew.describe({ since, limit, lang: HOST.lang }); } catch (_) { D = null; }
      if (!D || !D.ok) {
        return R(false, warn(L('The list of changes could not be read.', '更新情報を読めませんでした。')), { meta: { code: 'SOURCE_UNREADABLE', category: 'upstream', retryable: true, produced: [], userGoalSatisfied: false } });
      }
      let h = '<div style="font-weight:600;margin:2px 0 6px;">' + icon('sparkle') + ' ' + esc(L('What’s new in IntMap', 'IntMap の新着')) + ' <span style="font-size:11px;color:var(--text-muted);font-weight:400;">' + esc(D.entries.length + ' / ' + D.total) + '</span></div>';
      if (!D.entries.length) h += '<div style="font-size:12px;">' + esc(since ? L('Nothing announced since ' + since + '.', since + ' 以降のお知らせはありません。') : L('Nothing has been announced yet.', 'まだお知らせはありません。')) + '</div>';
      h += D.entries.map((e) => '<div style="font-size:12.5px;line-height:1.5;margin:4px 0;"><span style="color:var(--text-muted);font-size:11px;">' + esc(e.date) + (e.unread ? ' · ' + esc(L('not yet seen here', 'この端末では未読')) : '') + '</span><br>' + esc(e.text) + (e.url ? ' <a href="' + esc(window.IntMapSafe.url(e.url)) + '" target="_blank" rel="noopener" style="font-size:11px;">#' + esc(e.pr) + '</a>' : '') + '</div>').join('');
      return R(true, h, { exec: { whatsNew: { entries: D.entries.map((e) => ({ id: e.id, date: e.date, text: e.text, pr: e.pr, unread: e.unread })), total: D.total } },
        meta: { code: 'OK', category: 'ok', retryable: false, produced: ['explanation'], userGoalSatisfied: true } });
    },
  },
  {
    row: ['system.module',              'module',         '',                                                          'system',  'panel',   'panel.any',              'panel',               'session', 'none',   '',         ''],
    doc: [
      { in: 'system.module', text: (c) => 'MODULE fallback (advanced — open/close any IntMap subsystem panel by name, incl. ones with no toolbar button): {"type":"module","name":"IntMapX","method":"open"|"toggle"|"close"|"clear"}. Use only when no specific action or "control" fits. Available modules: ' + c.moduleCatalog() + '\n' },
    ],
    /* (§14) a FALLBACK: reachable, but not a user-facing feature — kept out of the search's front rank so it cannot crowd out a real capability */
    policy: { fallback: true },
    catalogueSilent: '2026-09-18',   /* ㉓'s ledger (#R802, measured that day): its `doc` does not yet name its own subject in both en and jp — delete this line when it does */
    schema: () => ({ type: 'object', properties: { name: str(), method: one('open', 'toggle', 'close', 'clear', 'exit', 'refresh', 'render') }, required: ['name'] }),
    async run(a, dctx, K) { const doModule = K.doModule;
      return doModule(a);
    },
  },
  {
    row: ['system.monitor',             'monitor',        '',                                                            'system',  'none',    '',                       '',                    'read',    'none',   '',         ''],
    /* DELIBERATELY not offered to the planner, with the reason and the proof (the only way to be absent from the catalogue) */
    policy: { withdrawn: { why: '#R231 withdrew area monitors 「一旦撤去」 — the dispatch case exists only to answer FEATURE_WITHDRAWN, and docs/AREA-MONITORS.md is the record of the design that is waiting', proofCode: 'FEATURE_WITHDRAWN' } },
    schema: () => (noArgs('monitor')), /* withdrawn (#R231) — the case answers FEATURE_WITHDRAWN */
      /* (#R231) 「Monitorsは…一旦撤去」 — the ~120-line body is deleted (it is in git; the file has
         a line ceiling). It ended in IntMapOS.exec('tab.monitors'), which is no longer registered,
         so it would have replied "✓ Your monitors" and opened nothing — #R141's own rule forbids
         claiming a result that did not happen. Nothing can reach this case now; if one ever does,
         it says so. Restoring the feature: this case, the catalogue note below, the tab button in
         index.html, and the two routes in js/session-tabs.js. See DEV-NOTES #R231 §Monitors. */
    async run(a, dctx, K) { const R = K.R, warn = K.warn, HOST = K.HOST;
      return R(false, warn(IntMapLang.t(HOST.lang,'Area monitors are not available right now.','エリア監視は現在ご利用いただけません。','Gebietsmonitore sind derzeit nicht verfügbar.','Мониторы районов сейчас недоступны.','Los monitores de área no están disponibles por ahora.')), {meta:{code:'FEATURE_WITHDRAWN',category:'capability',retryable:false,userGoalSatisfied:false,produced:[]}});
    },
  },
  {
    row: ['system.control',             'control',        '',                                                            'system',  'control', 'ui.any',                 'panel',               'session', 'none',   '',         ''],
    doc: [
      { in: 'system.control', text: 'UNIVERSAL fallback for anything not listed above (so EVERY operation is possible): {"type":"control","target":"<on-screen control name or #id>","value"?:str|num,"on"?:bool} — finds & clicks/sets/toggles any button, checkbox, dropdown, slider, date picker or input. Useful addressable patterns (every UI element is named, incl. per-layer micro-controls): "favorite: <layer name>" (★), "date: <layer name>" with value "YYYY-MM-DD" (change a dated raster layer\'s date — e.g. 「気温レイヤーの日付を2023-06-01に」), "close legend: <name>", "opacity: <layer>". Prefer a specific action; otherwise ALWAYS use "control" rather than refusing.\n' },
    ],
    /* (§14) a FALLBACK: reachable, but not a user-facing feature — kept out of the search's front rank so it cannot crowd out a real capability */
    policy: { fallback: true },
    schema: () => ({ type: 'object', properties: { target: str(), value: loose(), on: bool(), submit: bool() }, required: ['target'] }),
    async run(a, dctx, K) { const doControl = K.doControl;
      return doControl(a);
    },
  },
];
