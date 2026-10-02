/* ============================================================================
 *  IntMap · Atlas capabilities — the `navigation.*` namespace   (js/atlas-cap-navigation.js)
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
import { bool, num, one, noArgs } from './atlas-caps.js';

export default [
  /* ══ (#R347) ACTIVE NAVIGATION — §34 ═════════════════════════════════════════════════════
     「「AtlasにはできるがUIからできない」「UIにはできるがAtlasにはできない」という状態を原則なくす。」
     Five, not one, because they differ in every column that matters: starting needs the route to
     exist and the reader to grant a permission (`external` risk — a position leaves the device);
     asking how long is left is a pure READ; stopping is neither.
     ⚠ `navigation.start` IS THE ONLY 'external' RISK IN THE ROUTING CATEGORY. It turns on a sensor
     and sends one position to a router. Atlas may do it on a plain instruction, but the risk column
     is what makes that visible in the plan rather than buried in an executor.
     ⚠ (#R801) WHAT LEAVES, TO WHOM: the device's position, to the routing relay — so column 8 is
     'explicit': on a plain instruction it still runs; on the model's say-so after outside content
     (a page, an article, an attachment) has been in the turn, the reader is asked first
     (js/atlas-executor.js 4b). */
  {
    row: ['navigation.start',           'startNavigation','startNav,beginNavigation,guideMe,driveThere',           'routing', 'route',   'map.route,navigation',   'route,map,panel',     'external','explicit','',        'navigation'],
    /* ══ (#R347) ACTIVE NAVIGATION — the live half of routing ══════════════════════════════════
       None of the four takes a target: they act on the route and the guidance that already exist,
       and `navigation.start` refuses with «plan a route first» rather than inventing one. */
    doc: [
      { in: 'navigation', at: 10, text: '{"type":"startNavigation","simulate"?:bool,"speed"?:num} = begin guided navigation along the route ALREADY PLANNED and selected. It asks the browser for the device location, follows it, matches it to the route, announces each turn by voice, detects leaving the route and re-plans automatically, and reports arrival — at every stop and at the destination. A ROUTE MUST EXIST FIRST: emit {"type":"directions",…} in the SAME plan when the user names places («名古屋駅から京都駅まで車で案内して» = directions THEN startNavigation). "simulate":true drives a synthetic vehicle along the route instead of using the real GPS (for demonstrating or testing; "speed" is the multiplier, e.g. 5). Use for 「このルートで案内開始」「ナビ開始して」「案内を始めて」, "start navigation", "navigate this route", "guide me there", "drive there"; ' },
    ],
    schema: () => ({ type: 'object', properties: { simulate: bool(), sim: bool(), speed: num(0) } }),
      /* ══ (#R347) ACTIVE NAVIGATION — §34 ════════════════════════════════════════════
         「Atlasが独自 route state を持つことは禁止。RouteStore / NavigationStore を唯一の正本に。」
         Every number below is READ from window.IntMapNavStore through IntMapNavigation.summary().
         Atlas holds no copy, derives no distance and predicts no arrival — it phrases what the store
         already decided. That is why 「あと何分？」 works while a reroute is in flight: the answer comes
         from the same object the nav UI is rendering. */
    async run(a, dctx, K) { const R = K.R, warn = K.warn, L = K.L, esc = K.esc, note = K.note;
      {
          let N=window.IntMapNavigation;
          if(!N){ try{ await window.IntMapLazy.need('navigation'); N=window.IntMapNavigation; }catch(_){} }
          if(!N) return R(false, warn(L('Navigation is unavailable in this session.','このセッションでは案内を使えません。','Navigation ist nicht verfügbar.','Навигация недоступна.','La navegación no está disponible.')));
          /* ⚠ A ROUTE HAS TO EXIST FIRST, AND SAYING SO IS MORE USE THAN FAILING. #R278's lesson: a
             capability that answers 「その機能は実行できません」 without naming what is missing is a dead end. */
          if(!N.canStart()) return R(false, warn(L('Plan a route first — tell me where from and where to.','先に経路を検索してください。出発地と目的地を教えてください。','Erst eine Route planen — nenne Start und Ziel.','Сначала постройте маршрут.','Primero planifica una ruta.')));
          const _sim=!!(a.simulate||a.sim);
          const _started=await (_sim?N.simulate({speedMultiplier:+a.speed||5}):N.start({}));
          if(!_started){ const _s=N.summary()||{}; const _c=(_s.error&&_s.error.code)||'NO_LOCATION';
            return R(false, warn(esc(window.IntMapRouteErrors.message(_c)))); }
          const _s0=N.summary();
          return R(true, note(L('Navigation started','案内を開始しました','Navigation gestartet','Навигация начата','Navegación iniciada')
            +(_s0.destination&&_s0.destination.name?(' · '+esc(_s0.destination.name)):'')
            +(_sim?(' · '+L('simulated','シミュレーション','simuliert','симуляция','simulado')):'')));
        }
    },
  },
  {
    row: ['navigation.stop',            'stopNavigation', 'endNavigation,stopNav',                              'routing', 'none',    'navigation',             'panel',               'session', 'none',   '',         ''],
    doc: [
      { in: 'navigation', at: 20, text: '{"type":"stopNavigation"} = end it and put the map back (「案内停止」「ナビをやめて」, "stop navigation"); ' },
    ],
    catalogueSilent: '2026-09-18',   /* ㉓'s ledger (#R802, measured that day): its `doc` does not yet name its own subject in both en and jp — delete this line when it does */
    schema: () => (noArgs('stopNavigation')),
    async run(a, dctx, K) { const R = K.R, note = K.note, L = K.L;
      {
          const N=window.IntMapNavigation;
          if(!N||N.state()==='idle') return R(true, note(L('Navigation is not running.','案内は実行されていません。','Navigation läuft nicht.','Навигация не запущена.','La navegación no está activa.')));
          N.stop();
          return R(true, note(L('Navigation stopped.','案内を停止しました。','Navigation beendet.','Навигация остановлена.','Navegación detenida.')));
        }
    },
  },
  {
    row: ['navigation.status',          'navStatus',      'howLongLeft,etaNow,remaining,nextTurn,arrivalTime',           'routing', 'none',    '',                       'explanation',         'read',    'none',   '',         ''],
    doc: [
      { in: 'navigation', at: 30, text: '{"type":"navStatus"} = ANSWER FROM THE LIVE NAVIGATION STATE \u2014 remaining time, remaining distance, arrival clock time, the next maneuver and the road it is on, whether the driver is off route, and whether the time includes traffic or is the router\u2019s plain estimate. Use for 「あと何分？」「このまま行ったら何時着？」「次の曲がり角は？」「残りどのくらい？」, "how much longer", "what time will I arrive", "what is the next turn", "am I still on route"; ' },
    ],
    schema: () => (noArgs('navStatus')),
    async run(a, dctx, K) { const R = K.R, warn = K.warn, L = K.L, HOST = K.HOST, note = K.note, esc = K.esc;
      {
          const N=window.IntMapNavigation;
          if(!N||N.state()==='idle') return R(false, warn(L('Navigation is not running.','案内は実行されていません。','Navigation läuft nicht.','Навигация не запущена.','La navegación no está activa.')));
          const _st=N.summary(), _C=window.IntMapRouteCards, _o={lang:HOST.lang};
          const _dist=_C.distance(_st.remainingDistance,_o), _dur=_C.duration(_st.remainingDuration,_o);
          const _eta=_st.eta?_C.clock(new Date(_st.eta),_o):'';
          let _h=note(esc(_dur)+' · '+esc(_dist)+(_eta?(' · '+L('arrive ','到着 ','Ankunft ','прибытие ','llegada ')+esc(_eta)):''));
          if(_st.nextManeuver) _h+=note(esc(_C.distance(_st.nextManeuver.distance,_o))+' · '+esc(_st.nextManeuver.road||_st.currentRoad||''));
          /* ⚠ THE HONESTY LINE (§6). Without a traffic provider the duration is the router's own
             estimate and the reply says so — 「渋滞考慮」 may never be printed on a number that has none. */
          _h+=note((_st.etaMeta&&_st.etaMeta.traffic)
            ? L('Traffic-aware.','交通状況を反映しています。','Verkehrsabhängig.','С учётом пробок.','Con tráfico.')
            : L('Standard travel time — traffic not included.','標準所要時間です（交通状況未反映）。','Standardfahrzeit — ohne Verkehr.','Обычное время — без пробок.','Tiempo estándar — sin tráfico.'));
          if(_st.offRoute) _h+=warn(L('Off route.','経路を外れています。','Abseits der Route.','Вне маршрута.','Fuera de ruta.'));
          return R(true, _h);
        }
    },
  },
  {
    row: ['navigation.camera',          'navCamera',      'recenter,overview,followMe,northUp',                          'routing', 'camera',  'camera,camera.follow',                 'map,camera',          'session', 'none',   '',         ''],
    doc: [
      { in: 'navigation', at: 40, text: '{"type":"navCamera","mode"?:"follow"|"north"|"overview"|"free"} = how the camera behaves while navigating \u2014 "follow" turns with the vehicle (heading-up) and keeps it low on the screen, "north" keeps north up, "overview" frames the whole remaining route, "free" stops following. {"type":"recenter"} alone resumes following after the user has panned away. Use for 「全体表示」「現在地に戻して」「北を上に」, "show the whole route", "recenter", "overview"; ' },
    ],
    schema: () => ({ type: 'object', properties: { mode: one('follow', 'north', 'overview', 'free'), camera: one('follow', 'north', 'overview', 'free') } }),
    async run(a, dctx, K) { const R = K.R, warn = K.warn, L = K.L, t = K.t, note = K.note, esc = K.esc;
      {
          const N=window.IntMapNavigation;
          if(!N||N.state()==='idle') return R(false, warn(L('Navigation is not running.','案内は実行されていません。','Navigation läuft nicht.','Навигация не запущена.','La navegación no está activa.')));
          if(t==='recenter'&&!a.mode){ N.recenter(); return R(true, note(L('Following your position again.','現在地の追従を再開しました。','Folge wieder deiner Position.','Снова слежу за позицией.','Siguiendo tu posición de nuevo.'))); }
          const _w=String(a.mode||a.camera||(t==='overview'?'overview':t==='northUp'?'north':'follow')).toLowerCase();
          const _ok=N.setCamera(_w==='north'?'north':_w==='overview'?'overview':_w==='free'?'free':'follow');
          return R(!!_ok, _ok?note(esc(_w)):warn(''));
        }
    },
  },
  {
    row: ['navigation.voice',           'navVoice',       'mute,unmute,voiceGuidance',                                   'routing', 'setting', 'navigation',             'setting',             'session', 'none',   '',         ''],
    doc: [
      { in: 'navigation', at: 50, text: '{"type":"navVoice","mode"?:"off"|"alerts"|"guidance"} = spoken guidance — "guidance" announces every turn at four distances, "alerts" speaks only the final call and re-routes, "off" is silent. {"type":"mute"} / {"type":"unmute"} are shortcuts. Use for 「音声案内を止めて」「ミュート」, "mute", "turn the voice back on". THE TIME AND DISTANCE COME FROM THE NAVIGATION STATE, NEVER FROM YOUR OWN ARITHMETIC: do not estimate an arrival time, and do not say a route is traffic-aware unless navStatus said so — the open routers carry no traffic and the reply says which it is.\n' },
    ],
    schema: () => ({ type: 'object', properties: { mode: one('off', 'alerts', 'guidance'), voice: one('off', 'alerts', 'guidance') } }),
    async run(a, dctx, K) { const R = K.R, warn = K.warn, L = K.L, t = K.t, note = K.note, esc = K.esc;
      {
          const N=window.IntMapNavigation;
          if(!N||N.state()==='idle') return R(false, warn(L('Navigation is not running.','案内は実行されていません。','Navigation läuft nicht.','Навигация не запущена.','La navegación no está activa.')));
          const _w=t==='mute'?'off':t==='unmute'?'guidance':String(a.mode||a.voice||'guidance').toLowerCase();
          const _ok=N.setVoice(_w==='off'?'off':_w==='alerts'?'alerts':'guidance');
          return R(!!_ok, _ok?note(esc(_w)):warn(''));
        }
    },
  },
];
