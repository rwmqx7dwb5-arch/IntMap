/* ============================================================================
 *  IntMap · Atlas — THE WORK TRACE   window-less module, mounted by js/atlas-console.js
 * ----------------------------------------------------------------------------
 *  「Atlasの回答中に、なにをいまAtlasがやってるのかみえずらいから、ChatGPTやClaudeのような、
 *    作業中のことがよく見えるUIに。」
 *
 *  ══ ⚠⚠⚠ WHAT THE READER COULD NOT SEE, AND WHY — THE DEFECT, MEASURED ══════════════════════
 *  Atlas already knew every step it took. Three separate records held the whole path while the turn
 *  was running, and NOT ONE OF THEM WAS SHOWN TO THE READER:
 *
 *    ① js/atlas-executor.js emits ten lifecycle phases per operation (planned → validating →
 *       started → progress → completed / partial / failed / cancelled / superseded), each carrying
 *       the capability id, the turn and the source. `API.on(fn)` has been a public subscription
 *       since #R318. Before this file, the Atlas panel subscribed to it ZERO times.
 *    ② js/atlas-agent.js calls `opts.onStep({step, calls})` after every planner round-trip — the
 *       one place that knows 「Atlas has just decided to do these N things」. Its only consumer was
 *       `_atlasDbg.steps`, a DEVELOPER diagnostics object. The reader's own turn was being traced
 *       into a debug panel.
 *    ③ js/atlas-state.js `recordOperation` files args, status, produced and `ms` per operation.
 *
 *  What the reader got instead was ONE WORD that overwrote itself: `.atl-stage`, a single span
 *  holding one of seven nouns, replaced at every step. So (a) nothing that had already happened was
 *  on screen — a six-step turn showed one word at a time and left no trace of the other five — and
 *  (b) WHICH word it was came from `_STAGE_OF(a)`, a hand-written list of about thirty legacy
 *  `type` spellings with `return 'think'` for everything else.
 *
 *  ⚠ MEASURED (#R723, against the 138 rows of js/atlas-capabilities.js): that list named 29
 *  capabilities. THE OTHER 109 SAID 「考え中」 WHILE DOING SOMETHING ELSE — `data.weather`,
 *  `settings.language`, `map.choropleth`, `layers.opacity`, `research.askHere` and 104 more. The
 *  indicator was not merely thin; for four capabilities in five it was WRONG, and the reader had no
 *  way to tell those two cases apart.
 *
 *  ══ WHAT THIS FILE IS, THEREFORE ════════════════════════════════════════════════════════════
 *  A reader-facing view of records that already existed. It ADDS NO KNOWLEDGE and it decides
 *  nothing about the turn: it subscribes, it appends, and it never writes back.
 *
 *    · ROWS ARE OPENED BY EVENTS, NOT BY CALL SITES. A row exists because the executor said an
 *      operation began. So a capability reached through a path this file has never heard of still
 *      appears — which is the whole difference from `_STAGE_OF`, whose knowledge was a list.
 *    · THE WORD COMES FROM THE CAPABILITY'S OWN CATEGORY (column 4 of the registry table), not from
 *      a list of spellings. There are fourteen categories and the registry is the one that says
 *      which; `tests/r723-atlas-progress-ui-checks.test.mjs` ② fails if any category the registry
 *      uses has no word here, so the 109 silent capabilities cannot come back one capability at a
 *      time. ⚠ The words themselves are IntMap's own prose and cannot be derived from anything —
 *      what is derived is the SET OF KEYS, and that is what the gate measures.
 *    · NOTHING IS ERASED. The trace is a SIBLING of the reply bubble (`insertAdjacentElement`,
 *      the same way the per-message tool bar has been a sibling since #R298), so `_atlCompose`'s
 *      `ai.innerHTML = head + body` cannot wipe it. That is also why it survives the answer and
 *      stays openable afterwards, which is the ChatGPT / Claude behaviour being asked for.
 *    · ⚠⚠⚠ ONE LIVE WORD, AND IT IS THE TRACE'S OWN HEAD (#R744). #R723 left the live word inside
 *      the bubble and gave the trace a head of its own — 「Working」 plus the turn's total elapsed
 *      time — so a working turn showed the reader TWO live indicators for one state, in two places.
 *      Measured on the live site: 「Working 40.5s」 above the bubble and a shimmering 「Researching」
 *      below it, at the same instant, about the same step. The word now lives in the head, which is
 *      what the reader expands to see the steps behind it.
 *      ⚠ THE TURN'S TOTAL STAYS. It was 「Working」 that duplicated the live word, not the clock:
 *      no other element says how long the whole turn has been running, and the per-row times are
 *      not that number (they cover the operations, never the waits between them — #R723 measured
 *      13.6 s of rows inside a 57.2 s turn before the planner waits had rows of their own).
 *    · ⚠ `.atl-stage` KEEPS ITS SECOND JOB, WHICH IS THE ONE IT CANNOT DELEGATE. Since #R313 that
 *      class is not only the live label, it is THE MARKER for 「this bubble is still working」 —
 *      `js/atlas-console.js`'s cancel scan and `js/atlas-turn-continuity.js`'s `markCancelled` both
 *      look for `.atl-b.a .atl-stage`, and `markCancelled` replaces exactly that span with the
 *      Stopped note. So the span STAYS A DESCENDANT OF THE BUBBLE and keeps carrying the marker;
 *      what left it is the TEXT. An empty marker is still findable, still replaceable, and draws
 *      nothing — so there is one graphic per state, which is what #R313 asked for.
 *
 *  ⚠ NO BACK-TICKS ANYWHERE IN THIS FILE — CONSTITUTION §2. The CSS is built from quoted strings
 *  and `+`, for the same reason js/atlas-styles.js is.
 * ==========================================================================*/
import { everyTick } from './runtime.js';   /* (#R408) the one timer wheel — the elapsed clock is not a private setInterval */


export function makeAtlasProgress(HOST, deps) {
  deps = deps || {};
  const L = deps.L || ((en) => en);
  const esc = deps.esc || ((s) => String(s == null ? '' : s));
  const capsOf = (typeof deps.capabilities === 'function') ? deps.capabilities : (() => null);
  const schemasOf = (typeof deps.schemas === 'function') ? deps.schemas : (() => null);
  function schemaOf(capId) {
    const S = schemasOf();
    return (S && typeof S.schemaFor === 'function') ? S.schemaFor(String(capId || '')) : null;
  }

  /* ── THE PHASES THAT ARE NOT A CAPABILITY ──────────────────────────────────────────────────
     A turn is not only operations. Waiting for the planner, reading an attached image and
     re-checking a claim are things Atlas really does, and no capability id names them — so they
     are named here and nowhere else. `think` is the one a pending reply opens with.
     ⚠ INSIDE THE FACTORY, NOT AT MODULE LEVEL (tests/r175 ③): a constant at the top of a module
     is state every importer shares, and an export nothing imports by name is dead code. There is
     also no second list of the CATEGORY keys here — `categoryWords()` reads the table itself, and
     a hand-kept copy of those keys would be the duplicate source of truth this round removes. */
  const TRACE_PHASES = ['think', 'read', 'verify', 'write'];
  /* The words. ⚠ Five positional arguments (en, jp, de, ru, es) is the app's L(…) contract
     (js/lang-registry.js); the remaining four languages resolve through their `inline` table keyed
     by the English string, so a translation that has not landed yet degrades per string. */
  const PHASE_WORD = {
    think: () => L('Thinking', '考え中', 'Denke nach', 'Думаю', 'Pensando'),
    read: () => L('Reading the image', '画像を精読中', 'Lese das Bild', 'Читаю изображение', 'Leyendo la imagen'),
    verify: () => L('Verifying', '検算中', 'Verifiziere', 'Проверяю', 'Verificando'),
    write: () => L('Writing the answer', '回答を作成中', 'Schreibe die Antwort', 'Пишу ответ', 'Escribiendo la respuesta')
  };
  const CATEGORY_WORD = {
    map: () => L('Drawing on the map', '地図に描画', 'Zeichne auf der Karte', 'Рисую на карте', 'Dibujando en el mapa'),
    layers: () => L('Switching layers', 'レイヤーを切り替え', 'Ebenen umschalten', 'Переключаю слои', 'Cambiando capas'),
    view: () => L('Moving the view', '視点を移動', 'Ansicht bewegen', 'Перемещаю вид', 'Moviendo la vista'),
    panel: () => L('Opening a panel', 'パネルを開く', 'Panel öffnen', 'Открываю панель', 'Abriendo un panel'),
    data: () => L('Looking up data', 'データを照会', 'Daten abfragen', 'Запрашиваю данные', 'Consultando datos'),
    research: () => L('Researching', '調査中', 'Recherchiere', 'Изучаю', 'Investigando'),
    settings: () => L('Changing a setting', '設定を変更', 'Einstellung ändern', 'Меняю настройку', 'Cambiando un ajuste'),
    sim: () => L('Running a simulation', 'シミュレーションを実行', 'Simulation läuft', 'Запускаю симуляцию', 'Ejecutando una simulación'),
    routing: () => L('Working out a route', '経路を計算', 'Route berechnen', 'Прокладываю маршрут', 'Calculando una ruta'),
    time: () => L('Setting the clock', '時刻を設定', 'Uhr stellen', 'Ставлю время', 'Ajustando el reloj'),
    system: () => L('Checking the app', 'アプリを確認', 'App prüfen', 'Проверяю приложение', 'Comprobando la app'),
    ui: () => L('Adjusting the interface', '画面を調整', 'Oberfläche anpassen', 'Настраиваю интерфейс', 'Ajustando la interfaz'),
    dialog: () => L('Asking you', 'あなたに質問', 'Frage dich', 'Спрашиваю вас', 'Preguntándote'),
    photo: () => L('Matching the photo', '写真を照合', 'Foto abgleichen', 'Сверяю фото', 'Comparando la foto')
  };

  /* wordFor(capabilityId) — the reader's word for one operation, via the registry's category.
     ⚠ An id this build's registry does not know is NOT given a made-up word: it falls back to the
     id's own namespace, and failing that to 「作業中」. Saying 「考え中」 for it would be the defect
     this file exists to remove, one row at a time. */
  function wordFor(capId) {
    const id = String(capId || '');
    let cat = '';
    try { const caps = capsOf(); const c = caps && caps.resolve ? caps.resolve(id) : null; if (c && c.category) cat = c.category; } catch (_) { cat = ''; }
    if (!cat && id.indexOf('.') > 0) cat = id.slice(0, id.indexOf('.'));
    const w = CATEGORY_WORD[cat];
    return w ? w() : L('Working', '作業中', 'Arbeite', 'Работаю', 'Trabajando');
  }

  /* ── THE MARKER, AND THE LIVE LABEL THAT IS NO LONGER IN IT ────────────────────────────────
     `.atl-stage` had both of #R313's jobs until #R744: the shimmering word AND the marker meaning
     「this bubble has not answered yet」. The word moved to the trace head (see paintHead) because
     two live words in two places is what the reader was actually shown; THE MARKER DID NOT MOVE,
     because it is what `js/atlas-console.js`'s cancel scan finds and what `markCancelled` replaces
     with the Stopped note, and both of those name a descendant of the bubble.
     ⚠ It carries the phase it was opened for as data rather than as text: a marker that says
     nothing is still the answer to 「is this reply finished?」, and `:empty` takes it off the page. */
  function stageHtml(kind) {
    return '<span class="atl-stage" role="status" aria-live="polite" data-phase="'
      + esc(String(kind || 'think')) + '"></span>';
  }
  function setStage(el, kind) {
    try {
      if (!el || !el.querySelector) return;
      /* ⚠ (#R313) STILL A NO-OP ONCE REAL CONTENT HAS REPLACED THE PLACEHOLDER. The marker IS
         「this reply is not finished」, so a phase arriving late must not relabel an answer that
         has already landed — the guard is the same class it always was. */
      if (!el.querySelector('.atl-stage')) return;
      setLive(el, (PHASE_WORD[kind] || PHASE_WORD.think)());
    } catch (_) { }
  }
  /* setLive(el, text) — the live word, whether it names a phase or an OPERATION. One writer and one
     element, so the two can never disagree. */
  function setLive(el, text) {
    try {
      const tr = traces.get(el); if (!tr || tr.done) return;
      tr.liveWord = String(text || '');
      paintHead(tr);
    } catch (_) { }
  }

  const SVG_OK = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m4 12.5 5.5 5.5L20 6"/></svg>';
  const SVG_BAD = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6 6 18"/></svg>';
  const SVG_WARN = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 7v7"/><path d="M12 17.5v.01"/></svg>';
  const SVG_CHEV = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>';

  const MARK = { run: '', ok: SVG_OK, fail: SVG_BAD, warn: SVG_WARN, skip: SVG_BAD };
  /* status → row state. The seven statuses are js/atlas-results.js's, not a set invented here. */
  const STATE_OF = {
    completed: 'ok', partial: 'warn', needs_input: 'warn', running: 'run',
    failed: 'fail', cancelled: 'skip', superseded: 'skip'
  };

  const traces = new WeakMap();   /* reply bubble → its trace record */
  let current = null;             /* the bubble the executor's events belong to */
  let subscribed = false;

  function fmtMs(ms) {
    const n = Math.max(0, +ms || 0);
    if (n < 950) return (Math.round(n / 100) / 10).toFixed(1) + 's';
    if (n < 60000) return (Math.round(n / 100) / 10).toFixed(1) + 's';
    return Math.floor(n / 60000) + 'm' + String(Math.round((n % 60000) / 1000)).padStart(2, '0') + 's';
  }
  function now() { try { return Date.now(); } catch (_) { return 0; } }

  /* open(bubble) — start a trace above this reply. Idempotent: a repair pass that re-enters the
     same bubble continues the SAME trace, because it is the same turn's work. */
  function open(bubble) {
    if (!bubble || !bubble.insertAdjacentElement) return null;
    /* ⚠ A NEW REPLY ENDS THE PREVIOUS TRACE, WHATEVER ELSE HAPPENED. A turn can leave by paths this
       file does not enumerate (an abort, a superseding message, a throw), and a trace still spinning
       an hour later would be this file telling the reader something false. So the invariant is not
       「every exit calls done()」 — it is 「only one trace is ever live」, enforced here. */
    if (current && current !== bubble) { try { done(current); } catch (_) { } }
    current = bubble;
    let tr = traces.get(bubble);
    if (tr && tr.el && tr.el.parentNode) return tr;
    let el = null;
    try {
      el = document.createElement('div');
      el.className = 'atl-trace open';
      el.innerHTML = '<button class="atl-trace-head" type="button" aria-expanded="true">'
        + '<span class="atl-trace-chev">' + SVG_CHEV + '</span>'
        + '<span class="atl-trace-sum"></span>'
        + '<span class="atl-trace-ms"></span></button>'
        + '<div class="atl-trace-rows" role="list"></div>';
      bubble.insertAdjacentElement('beforebegin', el);
      const head = el.querySelector('.atl-trace-head');
      if (head) head.addEventListener('click', () => {
        try {
          const on = el.classList.toggle('open');
          head.setAttribute('aria-expanded', on ? 'true' : 'false');
        } catch (_) { }
      });
    } catch (_) { return null; }
    tr = { el: el, rows: [], byOp: Object.create(null), t0: now(), pendingAct: null, done: false, liveWord: '' };
    traces.set(bubble, tr);
    paintHead(tr);
    try {
      /* ⚠ ONE KEY, NOT ONE PER TRACE. The wheel supersedes a repeated key (js/runtime.js), and 「one
         live trace」 is already the invariant `open` enforces — so a fresh key per reply would be a
         second answer to the same question, and the one that leaks if an exit is ever missed. */
      tr.stopTick = everyTick('atl-trace', 250,
        () => { if (tr.done) { stopClock(tr); return; } paintHead(tr); });
    } catch (_) { }
    return tr;
  }
  function stopClock(tr) { try { if (tr.stopTick) { tr.stopTick(); tr.stopTick = null; } } catch (_) { } }

  /* paintHead(tr) — WHAT THE HEAD SAYS IS WHAT IS HAPPENING (#R744), not a second noun for it.
     While the turn runs the head carries the live word in `.atl-stage`'s shimmer — the indicator
     #R313 measured on chatgpt.com — and expanding that head is how the reader sees the steps behind
     it. When the answer lands the word is replaced by the count, which is the only thing a finished
     trace can still tell you. The turn's elapsed total stands at the other end of the same line,
     running while the turn runs and frozen at the end: it is the one number no row carries, because
     rows time OPERATIONS and a turn is mostly the waits between them.
     ⚠ THE SPAN IS REUSED, NOT REWRITTEN. Assigning innerHTML here would build a NEW element every
     time a step changed the word, and a new element restarts the CSS animation at 0% — the sweep
     would jump backwards at every step instead of running. That matters four times a second here,
     because the clock above repaints this head on every tick whether the word changed or not. */
  function paintHead(tr) {
    try {
      if (!tr || !tr.el) return;
      const sum = tr.el.querySelector('.atl-trace-sum');
      const ms = tr.el.querySelector('.atl-trace-ms');
      if (ms) ms.textContent = fmtMs((tr.doneAt || now()) - tr.t0);
      if (!sum) return;
      const n = tr.rows.length;
      if (!tr.done) {
        let s = sum.querySelector('.atl-stage');
        if (!s) {
          sum.textContent = '';
          s = document.createElement('span');
          s.className = 'atl-stage';
          s.setAttribute('role', 'status'); s.setAttribute('aria-live', 'polite');
          sum.appendChild(s);
        }
        const w = String(tr.liveWord || PHASE_WORD.think());
        if (s.textContent !== w) s.textContent = w;
        return;
      }
      {
        const s = sum.querySelector('.atl-stage');
        if (s && s.parentNode) s.parentNode.removeChild(s);
        sum.textContent = (n === 1
            ? L('1 step', '1 ステップ', '1 Schritt', '1 шаг', '1 paso')
            /* ⚠ ITS OWN KEY, NOT THE BARE 'steps'. That English string is already in the inline
               tables, put there for js/tsunami.js and js/viewshed.js where it counts SIMULATION
               steps — fr renders it «pas», the right word for a time step and the wrong one for a
               work trace («étapes»), and the two call sites already disagree in Japanese (ステップ
               vs 段). One English spelling standing for two meanings is #R277's shape, so the count
               travels INSIDE the string and each language that needs a different word can have one. */
            : L('{n} steps', '{n} ステップ', '{n} Schritte', '{n} шагов', '{n} pasos')
              .split('{n}').join(String(n)));
      }
    } catch (_) { }
  }

  /* addRow(tr, {word, detail, state}) — one line of the trace. */
  function addRow(tr, spec) {
    if (!tr || !tr.el) return null;
    let row = null;
    try {
      const host = tr.el.querySelector('.atl-trace-rows');
      if (!host) return null;
      row = document.createElement('div');
      row.className = 'atl-trace-row ' + (spec.state || 'run');
      row.setAttribute('role', 'listitem');
      row.innerHTML = '<span class="atl-trace-mark">' + (MARK[spec.state || 'run'] || '') + '</span>'
        + '<span class="atl-trace-word"></span>'
        + '<span class="atl-trace-det"></span>'
        + '<span class="atl-trace-t"></span>';
      row.querySelector('.atl-trace-word').textContent = String(spec.word || '');
      row.querySelector('.atl-trace-det').textContent = String(spec.detail || '');
      host.appendChild(row);
    } catch (_) { return null; }
    const rec = { row: row, t0: now(), state: spec.state || 'run', word: String(spec.word || '') };
    tr.rows.push(rec);
    paintHead(tr);
    return rec;
  }
  function closeRow(rec, state, ms) {
    try {
      if (!rec || !rec.row) return;
      rec.state = state;
      rec.row.className = 'atl-trace-row ' + state;
      const m = rec.row.querySelector('.atl-trace-mark'); if (m) m.innerHTML = MARK[state] || '';
      const t = rec.row.querySelector('.atl-trace-t');
      if (t) t.textContent = fmtMs(ms != null ? ms : (now() - rec.t0));
    } catch (_) { }
  }

  /* step(bubble, action) — the console is about to run this action. The row itself is opened by the
     executor's event; what only the caller has is the action's ARGUMENT, so that is all this takes.
     ⚠ It is not the row's identity. `runActions` awaits each action in turn, so at most one
     Atlas-sourced operation is ever in flight — which is why 「the next row」 is a fact, not a guess. */
  function step(bubble, action) {
    const tr = traces.get(bubble); if (!tr) return;
    tr.pendingAct = action || null;   /* the ARGUMENTS, kept whole — which of them to show is not this call site’s question */
  }

  /* ── WHICH ARGUMENT THE READER SEES ─────────────────────────────────────────────────────────
     ⚠⚠⚠ THIS WAS A HAND-WRITTEN LIST OF KEY NAMES and production measured what that costs. It read
     `a.name || a.place || a.country || a.metric || a.query || a.topic || …` — eleven spellings,
     copied from js/atlas-turn-continuity.js. On the live site the detail column was EMPTY for every
     row of a real turn, because the capability that ran (`map.compose`) carries its subject under
     `title` — a twelfth spelling. Adding `title` would fix that one turn and leave the next
     capability blank, which is exactly the shape .agents/rules/no-ad-hoc-hardcoding.md §1 forbids.

     THE CAPABILITY ALREADY DECLARES THE ANSWER. js/atlas-schemas.js holds one argument schema per
     capability, in the capability’s own order, and it distinguishes the two kinds of argument this
     question is about:

       · a SUBJECT is free text — `place: string`, `title: string`, `name: string`;
       · a SETTING is drawn from a declared vocabulary — `camera: {enum: […]}`, `on: boolean`.

     A setting is the machine talking to itself; the subject is what the reader recognises. So the
     rule is 「the first argument the schema declares as a string with NO enum, required ones first」,
     and it is stated in terms of the schema rather than of any key name. Measured on the four
     capabilities the reported turn ran: map.compose → `title` (not `camera`, which has 2 enum
     values), data.weather → `place`, layers.toggle → `name`, view.flyTo → `place`.

     ⚠ A capability with no schema, or none whose arguments are free text, gets NO detail — not a
     guessed one. An empty column says 「this step had no subject worth naming」, which is true; a
     guess would say something false about what Atlas did. */
  function detailFor(capId, a) {
    if (!a) return '';
    let props = null;
    try { const sc = schemaOf(capId); if (sc && sc.properties) props = sc.properties; } catch (_) { props = null; }
    if (!props) return '';
    /* ⚠ THE CAPABILITY'S OWN ORDER, AND NOTHING ELSE DECIDES. A 「required arguments first」 tie-break
       stood here and was measured WRONG on the one capability where the two rules differ:
       `chart.compose` declares free text as [title, source] and requires [kind, source], so
       required-first showed the reader a data SOURCE where the chart has a TITLE. One rule, and it
       is the order the capability itself wrote its arguments in. */
    const key = Object.keys(props).find((k) => {
      const p = props[k] || {};
      return p.type === 'string' && !(p.enum && p.enum.length) && typeof a[k] === 'string' && a[k].trim();
    });
    /* ⚠ NOR IS THE ACTION'S OWN `type` STRIPPED HERE ANY MORE. Twenty-one schemas declare a property
       literally named `type` and every one of them is an enum, so the rule above already refuses it —
       a second guard for the same case is the duplicate this round is removing, not extra safety.
       `tests/r725-atlas-trace-detail-checks.test.mjs` ⑤ measures that invariant against the whole
       registry, so the day a schema declares `type` as free text the gate says so instead of the
       trace quietly showing the reader the name of an action. */
    return key ? String(a[key]).slice(0, 48) : '';
  }

  /* phase(bubble, kind) — a non-capability phase: the planner wait, the image read, the re-check.
     It both opens a row and drives the live word, so the two can never disagree. */
  function phase(bubble, kind) {
    const tr = traces.get(bubble); if (!tr || tr.done) return;
    /* ⚠ IDEMPOTENT PER PHASE. A turn asks the planner once per step, and the call sites that say
       「the planner is being asked now」 overlap: the reply is opened with a thinking row AND the
       first model call announces itself. Two rows for one wait would be a 0.0s row above the real
       one — the reader would be counting the trace's own bookkeeping as work Atlas did. */
    if (tr.live && tr.live.state === 'run' && tr.live.kind === kind) return;
    const w = (PHASE_WORD[kind] || PHASE_WORD.think)();
    if (tr.live && tr.live.state === 'run') closeRow(tr.live, 'ok');
    tr.live = addRow(tr, { word: w, state: 'run' });
    if (tr.live) tr.live.kind = kind;
    /* ⚠ NOT THROUGH setStage. That one guards on the bubble's marker, which `_atlCompose` erases
       between tools; the head is the trace's own, and a phase must reach it whether or not the
       marker happens to be re-armed at this instant. TRACE_PHASES is what keeps a kind this file
       does not name from being announced as itself. */
    setLive(bubble, (PHASE_WORD[TRACE_PHASES.indexOf(kind) >= 0 ? kind : 'think'])());
  }

  /* plan(bubble, info) — js/atlas-agent.js has just finished a planner round-trip and chosen
     `info.calls`. Closing the thinking row here is what makes the elapsed time on it real. */
  function plan(bubble, info) {
    const tr = traces.get(bubble); if (!tr || tr.done) return;
    if (tr.live && tr.live.state === 'run') closeRow(tr.live, 'ok');
    tr.live = null;
    const n = (info && Array.isArray(info.calls)) ? info.calls.filter(Boolean).length : 0;
    if (!n) phase(bubble, 'write');
  }

  /* watch(EXEC) — ONE subscription for the whole panel, routed to whichever reply is live.
     ⚠ NOT one subscription per turn. A per-turn subscribe/unsubscribe pair is a lifecycle, and a
     lifecycle is a thing to get wrong — #R623's broken lock and #R667's two meanings of one `null`
     are both that shape. There is exactly one live reply at a time (that is what `open` enforces),
     so there is exactly one place for an event to go, and it is read off `current` rather than
     captured. Idempotent: mounting Atlas twice does not double-count a step. */
  function watch(EXEC) {
    if (subscribed || !EXEC || typeof EXEC.on !== 'function') return () => { };
    subscribed = true;
    return EXEC.on((ev) => {
      try {
        if (!ev || !ev.operationId || !current) return;
        const bubble = current;
        const tr = traces.get(bubble); if (!tr || tr.done) return;
        const st = STATE_OF[ev.phase] || null;
        let rec = tr.byOp[ev.operationId];
        if (!rec) {
          if (ev.phase === 'cancelled' || ev.phase === 'superseded') return;   /* never opened here; do not invent a row for something that did not start */
          if (tr.live && tr.live.state === 'run') { closeRow(tr.live, 'ok'); tr.live = null; }
          const word = wordFor(ev.capabilityId);
          rec = addRow(tr, { word: word, detail: detailFor(ev.capabilityId, tr.pendingAct), state: 'run' });
          tr.pendingAct = null;
          if (rec) { rec.word = word; tr.byOp[ev.operationId] = rec; setLive(bubble, word); }
        }
        if (st && st !== 'run') { closeRow(rec, st); if (tr.live === rec) tr.live = null; }
      } catch (_) { }
    });
  }

  /* live(bubble) — PUT THE MARKER BACK while this turn is still working.
     ⚠⚠⚠ THIS IS A BUG FIX, NOT DECORATION. `runActions` ends with `_atlCompose(ai)`, which assigns
     `ai.innerHTML`, so from the FIRST tool call onwards the bubble held no `.atl-stage` at all —
     and that class is two things: the word the reader watches, and the marker meaning 「this bubble
     is still working」. So after tool 1, (a) the indicator was gone for the rest of the turn no
     matter how long it ran, and (b) `js/atlas-console.js`'s cancel scan and
     `js/atlas-turn-continuity.js`'s `markCancelled` could no longer FIND the reply to stop. Both
     halves were invisible because `setStage` guards on the very class that had been erased, so the
     mechanism failed silently and looked like a no-op. */
  function live(bubble) {
    try {
      const tr = traces.get(bubble); if (!tr || tr.done) return;
      if (bubble.querySelector && bubble.querySelector('.atl-stage')) return;
      const s = document.createElement('span');
      s.className = 'atl-stage'; s.setAttribute('role', 'status'); s.setAttribute('aria-live', 'polite');
      bubble.appendChild(s);   /* ⚠ (#R744) NO TEXT: the word is in the trace head. This is the marker only. */
    } catch (_) { }
  }

  /* done(bubble) — the answer has landed. Collapse to the summary line and stop the clock.
     ⚠ It does NOT remove the trace: 「what did it do」 is a question a reader asks after reading. */
  function done(bubble) {
    const tr = traces.get(bubble); if (!tr || tr.done) return;
    tr.rows.forEach((r) => { if (r.state === 'run') closeRow(r, 'ok'); });
    tr.live = null;
    tr.done = true; tr.doneAt = now();
    tr.liveWord = '';
    if (current === bubble) current = null;
    stopClock(tr);
    paintHead(tr);
    /* ⚠ THE MARKER GOES AWAY HERE AND NOWHERE ELSE. `live()` re-arms `.atl-stage` after every
       compose, including the compose that renders the finished answer, so without this the cancel
       scan would still count a bubble that had already answered as working. Removing it is what
       makes the class mean what #R313 says it means. A Stopped note that replaced it is not
       touched. (#R744: the shimmering 「考え中」 that used to be left under a landed reply is gone
       from here too — paintHead puts the step count where the word was, on this same call.) */
    try { const s = bubble.querySelector && bubble.querySelector('.atl-stage'); if (s && s.parentNode) s.parentNode.removeChild(s); } catch (_) { }
    try {
      tr.el.classList.remove('open');
      const head = tr.el.querySelector('.atl-trace-head');
      if (head) head.setAttribute('aria-expanded', 'false');
      if (!tr.rows.length) tr.el.remove();   /* a turn with no steps has nothing to show */
    } catch (_) { }
  }

  return { open, step, phase, plan, watch, done, live, stageHtml, setStage, setLive, wordFor, detailFor,
    /* ⚠ (#R744) phaseWord() EXISTS BECAUSE A CHECK NEEDS THE WORD, NOT THE MARKUP. #R723 ② asked
       「does any capability announce itself as thinking?」 by testing stageHtml('think') for the
       capability's word; the marker no longer carries text, so that question would now be answered
       「no」 by an empty string — true, vacuous, and blind to the defect it was written for. The
       word itself is what the check is about, so the word is what is offered. */
    phaseWord: (k) => (PHASE_WORD[k] || PHASE_WORD.think)(),
    categoryWords: () => Object.keys(CATEGORY_WORD), phaseWords: () => Object.keys(PHASE_WORD) };
}

/* ⚠ CSS IN QUOTED STRINGS ONLY (CONSTITUTION §2 — a back-tick here would blank the site).
   Concatenated into the panel's sheet by js/atlas-styles.js. */
export const ATLAS_PROGRESS_CSS =
  '#atlas-panel .atl-trace{margin:2px 0 4px;padding:0;border-left:2px solid var(--glass-border,rgba(128,128,128,0.22));}'
  + '#atlas-panel .atl-trace-head{display:flex;align-items:center;gap:6px;width:100%;background:none;border:none;'
  + 'padding:3px 4px 3px 7px;margin:0;cursor:pointer;color:var(--text-muted);font:inherit;font-size:11.5px;font-weight:600;text-align:left;border-radius:7px;}'
  + '#atlas-panel .atl-trace-head:hover{background:var(--input-bg);}'
  + '#atlas-panel .atl-trace-chev{display:inline-flex;transition:transform .16s ease;}'
  + '#atlas-panel .atl-trace.open .atl-trace-chev{transform:rotate(90deg);}'
  + '#atlas-panel .atl-trace-ms{margin-left:auto;font-variant-numeric:tabular-nums;font-weight:500;opacity:.8;}'
  /* ⚠ (#R744) THE HEAD'S WORD IS THE SHIMMER, AT THE HEAD'S OWN SIZE. js/atlas-styles.js gives
     .atl-stage 12.5px and a padding of its own for the place it used to stand in; here it is one
     word inside an 11.5px button, so it inherits the button's type and adds no box.
     ⚠ AND IT YIELDS THE LINE, NOT THE CLOCK: the elapsed total is a fixed handful of digits and the
     word is arbitrarily long, so it is the word that ellipsises when the panel is narrow. */
  + '#atlas-panel .atl-trace-sum{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}'
  + '#atlas-panel .atl-trace-head .atl-stage{font-size:inherit;font-weight:inherit;padding:0;}'
  + '#atlas-panel .atl-trace-rows{display:none;padding:1px 4px 4px 9px;}'
  + '#atlas-panel .atl-trace.open .atl-trace-rows{display:block;}'
  + '#atlas-panel .atl-trace-row{display:flex;align-items:baseline;gap:6px;padding:2px 0;font-size:11.5px;line-height:1.45;color:var(--text-muted);}'
  + '#atlas-panel .atl-trace-mark{flex:0 0 12px;display:inline-flex;align-items:center;justify-content:center;height:12px;position:relative;top:1px;}'
  + '#atlas-panel .atl-trace-row.ok .atl-trace-mark{color:#30d158;}'
  + '#atlas-panel .atl-trace-row.warn .atl-trace-mark{color:#ff9f0a;}'
  + '#atlas-panel .atl-trace-row.fail .atl-trace-mark,#atlas-panel .atl-trace-row.skip .atl-trace-mark{color:#ff453a;}'
  /* the in-flight row: a small ring, so 「which of these is happening now」 needs no reading */
  + '#atlas-panel .atl-trace-row.run .atl-trace-mark::before{content:"";width:8px;height:8px;border-radius:50%;'
  + 'border:1.6px solid currentColor;border-top-color:transparent;animation:atl-trace-spin .7s linear infinite;}'
  + '@keyframes atl-trace-spin{to{transform:rotate(360deg);}}'
  + '#atlas-panel .atl-trace-row.run{color:var(--text-main);}'
  + '#atlas-panel .atl-trace-word{flex:0 1 auto;}'
  + '#atlas-panel .atl-trace-det{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:.72;}'
  + '#atlas-panel .atl-trace-t{flex:0 0 auto;font-variant-numeric:tabular-nums;opacity:.6;}'
  + '@media (prefers-reduced-motion:reduce){#atlas-panel .atl-trace-row.run .atl-trace-mark::before{animation:none;}'
  + '#atlas-panel .atl-trace-chev{transition:none;}}';
