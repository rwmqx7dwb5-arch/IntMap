/* ============================================================================
 *  IntMap · the pandemic simulator, as something Atlas can DRIVE  (#R754)
 * ----------------------------------------------------------------------------
 *  THE DEFECT THIS ANSWERS (#R747 §6, measured in production 2026-09-16). Asked
 *  「Simulate a pandemic starting in Lagos and show me day 60.」 Atlas spent 43.8 s over 7 steps,
 *  made ZERO tool calls, and replied that «IntMap does not currently provide an epidemiological
 *  transmission simulator». The first half of that sentence was honest and the second half was
 *  FALSE ABOUT ITS OWN PRODUCT: js/pandemic-model.js is a seeded SEIR metapopulation engine with
 *  R₀, latent and infectious periods, waning immunity, vaccination and policy tiers (#R575 → #R678).
 *
 *  WHY IT COULD NOT KNOW. Everything the catalogue told the planner about pandemics was one clause
 *  of one long line — `{"type":"playground","mode":"pandemic"}`, «open a Playground game» — sharing
 *  a block with a dozen unrelated panels. There was a door to the SCREEN and no door to the MODEL:
 *  no way to place a seed, advance a number of days, or read a day back. A model asked to answer
 *  from a catalogue that does not mention a capability will correctly report it does not exist.
 *  That is [[intmap-prompt-that-hid-the-tools-in-hand]] in its harsher form — there, the tools were
 *  in hand and described as unreachable; here, they were never described at all.
 *
 *  ⚠⚠⚠ TWO CAPABILITIES, NOT ONE, AND THE REASON IS THE OBSERVER (#R743). `run()` computes and
 *  promises the map NOTHING; `draw()` paints and promises exactly that. A single capability that
 *  did both could not honestly declare `map.object`: the observer would measure an unmoved map on
 *  every run that was not asked to draw and call a correct answer `not_rendered` — the shape
 *  #R736/#R737 measured, where 21 tool calls went into re-drawing a map that had been right from
 *  the first, and #R742 measured again at 52 failures in 207 calls.
 *
 *  ⚠ AND THE OBSERVER ASKS THE PAINTER. `paintNow()` in js/atlas-capabilities.js is a HAND-WRITTEN
 *  list of source ids and its own comment forbids adding to it, for the reason #R735 already paid
 *  for with `nlq-fac-src`. So `painted()` below reads this module's own canvas live off the map,
 *  and the observer calls it. A surface declared beside the code that paints it cannot be the
 *  surface somebody forgot to list.
 * ==========================================================================*/
import { PANDEMIC_PRESETS, createPandemicModel, defaultPandemicParams, describePandemicParams, checkPandemicParams, paramBounds, PANDEMIC_PARAMS } from './pandemic-model.js';
import { buildPandemicWorld, resolveOrigin } from './pandemic-world.js';

(function () {
  const GE = () => window.IntMapGeoEngine;
  /* ⚠ THE LANGUAGE COMES FROM THE HOST THROUGH bind(), like every other dependency here. Reading
     it off a global would be a second source of truth for the reader's language, and the one this
     module invented would be the one that went stale.
     ⚠⚠ AND IT RESOLVES THROUGH js/lang-registry.js, never through a five-positional helper of this
     module's own (tests/r221 ①). A module that re-grows one returns `undefined` for the sixth
     language the day a sixth is added — which is the entire reason the registry exists. Bound
     lazily because this file is behind a lazy door and `pick` wants a live getter, not a value. */
  let _pick = null;
  const L = function () {
    try {
      if (!_pick) _pick = window.IntMapLang.pick(function () { return (deps && deps.lang && deps.lang()) || 'en'; });
      return _pick.apply(null, arguments);
    } catch (_) { return arguments[0]; }
  };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const grp = (n) => { const v = Math.round(+n || 0); return v.toLocaleString('en-US'); };

  const SRC = 'atl-pandemic-src';
  const LYR = 'atl-pandemic';
  /* ⚠ THE CEILING IS THE ENGINE'S, NOT A ROUND NUMBER. js/pandemic-model.js stops at MAX_DAYS and
     reports `ended.kind === 'endemic'`; asking for more days than it will ever step is a request
     that cannot be honoured, and saying so beats returning day 1095 labelled day 4000. */
  const MAX_DAYS = 365 * 3;
  /* One frame's worth of stepping before yielding. ⚠ NOT A COUNT OF DAYS — a busy day (177 rows,
     an active epidemic) and a quiet one differ by more than an order of magnitude, so a fixed
     stride freezes the tab on exactly the runs worth watching. [[intmap-sync-loop-cannot-be-cancelled]]
     is the round that measured this: the tick must be TIME. */
  const SLICE_MS = 12;
  /* How long to wait for the style before saying so. Observation: a cold local preview took
     longer than a second; a warm tab is ready immediately. Expires if the renderer stops emitting
     `styledata` on style completion. */
  const STYLE_WAIT_MS = 4000;

  let deps = null;
  let last = null;   /* the run `draw()` paints. One at a time: a second run replaces it. */
  let _metric = null, _top = null;   /* which scale the live layer was built for — see the rebuild note in draw() */

  function bind(d) { deps = d || deps; }

  /* ── running ──────────────────────────────────────────────────────────────────────────────── */
  async function run(a) {
    const A = a || {};
    const W = await buildPandemicWorld(deps || {});
    if (!W) return fail(L('Country data could not be loaded, so there is no world to simulate.', '国境データを読み込めなかったため、シミュレーションする世界がありません。', 'Länderdaten konnten nicht geladen werden, es gibt keine Welt zu simulieren.', 'Не удалось загрузить данные по странам — мира для моделирования нет.', 'No se pudieron cargar los datos de países, así que no hay mundo que simular.'), 'no-world');
    /* ⚠ (#R673) THE WORLD MUST BE DECIDED FIRST. `createPandemicModel` freezes the mobility matrix
       at construction, so a run started before the tables settle cannot be reproduced from its
       seed — which is the whole promise the seed field makes. */
    await W.ready;

    const origin = resolveOrigin(W, A);
    if (origin.i < 0) return fail(originRefusal(origin, W), 'origin-' + (origin.why || 'unresolved'));

    const presetKey = A.preset && PANDEMIC_PRESETS[A.preset] ? A.preset : (A.preset ? null : 'covid');
    if (presetKey === null) return fail(L('No such pathogen preset.', 'そのような病原体プリセットはありません。', 'Keine solche Erreger-Vorlage.', 'Такого пресета патогена нет.', 'No existe ese preajuste de patógeno.') + ' ' + Object.keys(PANDEMIC_PRESETS).join(', '), 'preset-unknown');
    const scenario = A.scenario === 'real-world' ? 'real-world' : 'naive';

    const days = Math.round(+A.days);
    if (!(days >= 1)) return fail(L('Say how many days to simulate.', '何日ぶんシミュレーションするか指定してください。', 'Geben Sie an, wie viele Tage simuliert werden sollen.', 'Укажите, сколько дней моделировать.', 'Indique cuántos días simular.'), 'days-missing');
    if (days > MAX_DAYS) return fail(L('This engine steps at most {n} days.', 'このエンジンが進められるのは最大 {n} 日です。', 'Diese Engine simuliert höchstens {n} Tage.', 'Этот движок моделирует максимум {n} дней.', 'Este motor simula como máximo {n} días.').replace('{n}', String(MAX_DAYS)), 'days-too-many');

    /* ⚠ REFUSE, DO NOT CLAMP. A clamped parameter destroys the evidence: the run succeeds at a
       number nobody asked for and the reply describes it as though they had (#R743). */
    const given = (A.params && typeof A.params === 'object') ? A.params : {};
    const bad = checkPandemicParams(given);
    if (bad.length) return fail(paramRefusal(bad), 'params-rejected');

    const seed = (A.seed != null && isFinite(+A.seed)) ? (+A.seed >>> 0) || 1 : 1;
    const params = Object.assign(defaultPandemicParams(presetKey, scenario), given, { scenario: scenario });
    const described = describePandemicParams(presetKey, scenario, given);

    const model = createPandemicModel({ countries: W.world, routes: W.routes, preset: PANDEMIC_PRESETS[presetKey], params: params, seed: seed });
    model.seed(origin.i, params.initialCases);

    /* ⚠ SLICED BY TIME, AND THE LOOP CANNOT OUTLIVE ITS OWN CEILING. `ended` is the engine's, and
       `model.day` is the only authority on how far it actually got — a caller that asked for 600
       days of an epidemic that burned out on day 210 is told 210, not 600. */
    let guard = 0;
    while (model.day < days && !model.ended) {
      const t0 = Date.now();
      while (model.day < days && !model.ended && Date.now() - t0 < SLICE_MS) model.step();
      if (++guard > 100000) break;
      if (model.day < days && !model.ended) await new Promise(r => setTimeout(r, 0));
    }

    const totals = model.totals();
    const rows = [];
    for (let i = 0; i < W.N; i++) {
      const r = model.report(i);
      if (!r || !r.seeded) continue;
      rows.push({ i: i, code: W.world[i].code, name: W.names[i], pop: r.pop, I: r.I, E: r.E, D: r.D, cumInf: r.cumInf,
        border: r.border, lock: r.lock, arrivalDay: r.arrivalDay, prevalence: r.prevalence });
    }
    rows.sort((x, y) => y.cumInf - x.cumInf);

    last = { W: W, model: model, rows: rows, totals: totals, day: model.day, presetKey: presetKey, scenario: scenario,
      seed: seed, origin: origin, described: described, asked: days, ended: model.ended || null };
    return { ok: true, html: runHtml(last), meta: runMeta(last) };
  }

  /* ── drawing ──────────────────────────────────────────────────────────────────────────────── */
  async function draw(a) {
    const A = a || {};
    /* ⚠ TWO METRICS, AND THE STOPS BELONG TO THE METRIC. Deaths are two orders of magnitude rarer
       than infections, so one colour ramp cannot serve both: reused, a country that had buried 1%
       of its people would draw the palest dot on the map. Each metric carries its own breakpoints. */
    const metric = A.metric === 'deaths' ? 'deaths' : 'cases';
    if (!last) return fail(L('No pandemic run to draw yet — run one first.', '描画するパンデミックの実行がまだありません。先に実行してください。', 'Noch kein Pandemielauf zum Zeichnen — führen Sie zuerst einen aus.', 'Пока нет прогона пандемии для отрисовки — сначала выполните его.', 'Todavía no hay una simulación que dibujar: ejecute una primero.'), 'no-run');
    if (!GE() || !GE().hasRenderer()) return fail(L('The map is not ready.', '地図の準備ができていません。', 'Die Karte ist nicht bereit.', 'Карта не готова.', 'El mapa no está listo.'), 'no-renderer');
    /* ⚠⚠⚠ (#R754) THE PREDICATE IS THE OPERATION, NOT A PROXY FOR IT. MEASURED in the local preview,
       in this order:
         · `hasRenderer()` was true and every `addSource` threw «Style is not done loading.», so the
           first draw after a page load accused the map of refusing the layer. A layer added before
           the style is up is not a refusal; it is EARLY.
         · So a `ready()` guard went in — and `ready()` stayed FALSE while the very same draw, retried
           after the pane was forced to composite, succeeded and put 35 countries on the globe. A
           guard on `ready()` would therefore refuse draws that work.
       ⇒ ATTEMPT, and let the attempt be the evidence: retry once behind `styledata` if the paint
       throws. [[intmap-raf-zero-is-not-a-product-defect]] is the round where 25 of 56 production
       failures were the measuring environment rather than the product, and a proxy predicate is how
       that mistake gets frozen into the code. */
    const waitForStyle = () => new Promise((done) => {
      let settled = false;
      const finish = () => { if (settled) return; settled = true; done(); };
      const t = setTimeout(finish, STYLE_WAIT_MS);
      try { GE().events.on('styledata', () => { clearTimeout(t); finish(); }); } catch (_) { clearTimeout(t); finish(); }
    });
    const W = last.W;
    /* ⚠⚠ POINTS AT THE LABEL POINT, NOT COUNTRY FILLS — the same decision js/playground.js made for
       its policy badges and for the same measured reason: refilling every polygon means a second
       upload of Natural Earth's 10 m geometry (tens of megabytes, already in memory once), while a
       point layer is ~200 features and costs nothing. */
    const features = last.rows.map((r) => ({ type: 'Feature', id: r.i,
      geometry: { type: 'Point', coordinates: W.home[r.i] },
      properties: { name: r.name, code: r.code || '', rate: r.pop > 0 ? (metric === 'deaths' ? r.D : r.cumInf) / r.pop : 0,
        cumInf: r.cumInf, D: r.D, I: r.I, border: r.border, lock: r.lock } }));
    /* ══ ⚠⚠⚠ (#R755) THE SCALE BELONGS TO THE DAY, NOT TO A CONSTANT ═══════════════════════════
       MEASURED IN PRODUCTION (build R754), day 60 from Lagos: the worst-hit country was Nigeria at
       a rate of 0.0013, and the fixed ramp's FIRST step was 0.02 — fifteen times higher. So all 35
       countries drew the identical smallest yellow dot while the reply said «shaded by cases». The
       map was not wrong about the data; it was wrong about ITSELF, which is the family of defect
       #R565 named when `painted` reported an intention instead of an effect.
       ⚠ A FIXED RAMP CANNOT SERVE AN EPIDEMIC. Day 5 and day 600 of the same run differ by orders
       of magnitude, and so do measles and Ebola — any constant is legible for one of them.
       ⚠ THE PRICE IS STATED, NOT HIDDEN: a scale derived from this day's own maximum means two
       runs are NOT comparable by eye, so the reply says what the darkest dot means. A legend that
       does not name its top is a legend that invites the reader to invent one. */
    let top = 0;
    for (const f of features) { const v = +f.properties.rate; if (isFinite(v) && v > top) top = v; }
    /* ⚠⚠⚠ (#R757) AND THE RAMP IS LOGARITHMIC, BECAUSE THE DATA IS. MEASURED in production (build
       R755, day 60 from Nigeria): the rates ran from 8.9e-9 to 1.3e-3 — FIVE ORDERS OF MAGNITUDE —
       and #R755's linear ramp over that range put 33 of 34 countries between radius 3.00 and 3.27
       px. Deriving the top from the data was necessary and not sufficient: a linear scale on a
       log-distributed quantity shows the maximum and nothing else, which is what the screenshot
       showed. An epidemic's prevalence is log-distributed by construction — it starts in one
       country and arrives elsewhere by rare events — so the scale that reads it is log too.
       `rateLog` is what the paint expression interpolates; `rate` stays on the feature because it
       is the quantity, and a reader inspecting a dot should see the number, not its logarithm. */
    const FLOOR = 1e-9;   /* one case in a billion people: below this a country is «not really hit» */
    const lg = (v) => Math.log10(Math.max(FLOOR, v || 0));
    for (const f of features) f.properties.rateLog = lg(f.properties.rate);
    const loTop = lg(top), loBottom = lg(FLOOR);
    const STOPS = top > 0 && loTop > loBottom
      ? [loBottom, loBottom + (loTop - loBottom) / 3, loBottom + (2 * (loTop - loBottom)) / 3, loTop]
      : [loBottom, loBottom + 1, loBottom + 2, loBottom + 3];
    const paint = () => {
      if (!GE().layers.hasSource(SRC)) GE().layers.addSource(SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: features } });
      else GE().layers.setSourceData(SRC, { type: 'FeatureCollection', features: features });
      /* ⚠ THE LAYER IS REBUILT WHEN THE METRIC CHANGES, because the stops are baked into the paint
         expression: keeping a layer drawn for `cases` and feeding it `deaths` values would show the
         right data under the wrong scale, which is worse than not drawing. */
      if (GE().layers.has(LYR) && (_metric !== metric || _top !== top)) { try { GE().layers.remove(LYR); } catch (_) {} }
      if (!GE().layers.has(LYR)) GE().layers.add({ id: LYR, type: 'circle', source: SRC,
        paint: { 'circle-radius': ['interpolate', ['linear'], ['get', 'rateLog'], STOPS[0], 3, STOPS[1], 7, STOPS[2], 12, STOPS[3], 20],
          'circle-color': ['interpolate', ['linear'], ['get', 'rateLog'], STOPS[0], '#ffd60a', STOPS[1], '#ff9f0a', STOPS[2], '#ff453a', STOPS[3], '#bf5af2'],
          'circle-opacity': 0.82, 'circle-stroke-width': 1, 'circle-stroke-color': 'rgba(0,0,0,0.35)' } });
      _metric = metric; _top = top;
    };
    try { paint(); }
    catch (first) {
      /* one retry, behind the style — see the note above on why the attempt is the predicate */
      await waitForStyle();
      try { paint(); }
      catch (e) { return fail(L('The map style is still loading — nothing was drawn.', '地図のスタイルを読み込み中のため、描画していません。', 'Der Kartenstil lädt noch — es wurde nichts gezeichnet.', 'Стиль карты ещё загружается — ничего не нарисовано.', 'El estilo del mapa aún se está cargando; no se dibujó nada.'), 'style-loading'); }
    }
    const now = painted();
    /* ⚠ THE CLAIM IS VERIFIED GEOMETRICALLY BEFORE IT IS MADE. «I drew N» is checked against what
       the source actually holds, because a drawer that reports its intention rather than its effect
       is the defect #R565 named (`painted` reporting intent kept a dead layer green). */
    if (!now || now.features !== features.length) return fail(L('The pandemic layer did not take.', 'パンデミックのレイヤーが反映されませんでした。', 'Die Pandemie-Ebene wurde nicht übernommen.', 'Слой пандемии не применился.', 'La capa de pandemia no se aplicó.'), 'not_rendered');
    return { ok: true, html: drawHtml(last, features.length, metric, top), meta: { day: last.day, metric: metric, countries: features.length, scaleTopShareOfPopulation: top, source: SRC, layer: LYR } };
  }

  /* What is on the map right now, read off the map. The observer in js/atlas-capabilities.js calls
     this rather than counting a source id written into its own hand-written list. */
  function painted() {
    try {
      if (!GE() || !GE().layers || !GE().layers.hasSource(SRC)) return { features: 0, layer: false };
      /* ⚠ `sourceData` IS THE CONTRACT'S NAME (js/atlas-capabilities.js sourceFeatureCount reads it
         the same way). #R621 shipped an INVENTED door — `GE().popup()` for `GE().ui.popup()` — and a
         try/catch swallowed it, so a layer that never drew reported no error for a whole round. */
      const d = GE().layers.sourceData(SRC);
      const n = (d && d.features && d.features.length) || 0;
      return { features: n, layer: !!GE().layers.has(LYR), day: last ? last.day : null };
    } catch (_) { return null; }   /* unreadable is not zero (#R736) */
  }

  function clear() {
    try { if (GE().layers.has(LYR)) GE().layers.remove(LYR); } catch (_) {}
    try { if (GE().layers.hasSource(SRC)) GE().layers.removeSource(SRC); } catch (_) {}
    return true;
  }

  /* ── what the reader is told ──────────────────────────────────────────────────────────────── */
  function fail(msg, code) { return { ok: false, html: '⚠ ' + esc(msg), meta: { code: code || 'failed' } }; }

  function originRefusal(o, W) {
    if (o.why === 'no-origin-given') return L('Say where the outbreak starts — a country, a place name, or coordinates.', '流行の開始地点を指定してください（国名・地名・座標のいずれか）。', 'Geben Sie an, wo der Ausbruch beginnt — Land, Ortsname oder Koordinaten.', 'Укажите, где начинается вспышка — страна, название места или координаты.', 'Indique dónde comienza el brote: un país, un nombre de lugar o coordenadas.');
    if (o.why === 'place-not-found') return L('No place called «{q}» is in the gazetteer. Name a country, or give coordinates.', '「{q}」という地名は地名辞典にありません。国名か座標を指定してください。', 'Kein Ort namens «{q}» im Verzeichnis. Nennen Sie ein Land oder Koordinaten.', 'Места «{q}» нет в справочнике. Укажите страну или координаты.', 'No hay ningún lugar llamado «{q}» en el nomenclátor. Indique un país o coordenadas.').replace('{q}', String(o.place));
    /* ⚠ (#R755) «not found» and «found somewhere else» are DIFFERENT FACTS, and the second is the
       more useful one: it tells the caller the name was right and the country was wrong. A resolver
       that produces `foundIn` and a reply that never reads it is the same two-readers defect this
       round is fixing twice over. */
    if (o.why === 'place-not-in-that-country') return (o.foundIn
      ? L('«{q}» is not in {c} — the name resolves in {f}.', '「{q}」は {c} にはありません——この名前は {f} で解決されます。', '«{q}» liegt nicht in {c} — der Name löst sich in {f} auf.', '«{q}» не находится в {c} — это имя разрешается в {f}.', '«{q}» no está en {c}: el nombre se resuelve en {f}.').replace('{f}', String(o.foundIn))
      : L('«{q}» is not a place this map holds inside {c}.', '「{q}」は {c} の中にはありません。', '«{q}» liegt nicht in {c}.', '«{q}» нет внутри {c}.', '«{q}» no está dentro de {c}.')
    ).replace('{q}', String(o.place)).replace('{c}', String(o.qualifier));
    if (o.why === 'place-outside-every-country') return L('«{q}» resolves to a point that is not inside any simulated country.', '「{q}」の座標は、シミュレーション対象のどの国の中にもありません。', '«{q}» liegt in keinem simulierten Land.', '«{q}» находится вне всех моделируемых стран.', '«{q}» cae fuera de todos los países simulados.').replace('{q}', String(o.place));
    if (o.why === 'no-country-at-point') return L('There is no simulated country at those coordinates.', 'その座標には、シミュレーション対象の国がありません。', 'An diesen Koordinaten liegt kein simuliertes Land.', 'В этих координатах нет моделируемой страны.', 'No hay ningún país simulado en esas coordenadas.');
    return L('The starting place could not be resolved.', '開始地点を解決できませんでした。', 'Der Startort konnte nicht aufgelöst werden.', 'Не удалось определить начальное место.', 'No se pudo resolver el lugar de inicio.');
  }

  /* ⚠ THE REFUSAL CARRIES THE VOCABULARY, so one wrong call becomes one corrected call rather than
     a search (#R743). The ranges are `paramBounds` — the engine's own — not a second copy. */
  function paramRefusal(bad) {
    return bad.map((b) => {
      const acc = Array.isArray(b.accepts) ? b.accepts.join(', ')
        : (b.accepts && b.accepts.min != null) ? (b.accepts.min + '…' + b.accepts.max) : '';
      return b.key + ': ' + b.why + (acc ? ' (' + acc + ')' : '');
    }).join(' · ');
  }

  function runMeta(r) {
    return { day: r.day, asked: r.asked, preset: r.presetKey, scenario: r.scenario, seed: r.seed,
      origin: { index: r.origin.i, code: r.W.world[r.origin.i].code, name: r.W.names[r.origin.i], how: r.origin.how, matched: r.origin.matched || null, via: r.origin.via || null, disputed: r.origin.disputed || null },
      totals: { cumInf: r.totals.cumInf, D: r.totals.D, I: r.totals.I, affected: r.totals.affected, reached: r.totals.reached, worldPop: r.totals.worldPop },
      ended: r.ended ? (r.ended.kind || String(r.ended)) : null,
      dataState: r.W.dataState,
      assumed: r.described.filter(d => d.origin !== 'caller').map(d => ({ key: d.key, value: d.display, engineValue: d.value, unit: d.unit, from: d.origin })),
      countries: r.rows.slice(0, 20).map(x => ({ code: x.code, name: x.name, cumInf: x.cumInf, D: x.D, I: x.I, border: x.border, arrivalDay: x.arrivalDay })) };
  }

  function runHtml(r) {
    const o = r.W.names[r.origin.i];
    const head = esc(L('Day {d}: {inf} infected to date, {dead} dead, in {n} countries.', '{d} 日目: 累計感染 {inf} 人、死亡 {dead} 人、{n} か国。', 'Tag {d}: {inf} Infizierte insgesamt, {dead} Tote, in {n} Ländern.', 'День {d}: всего заражено {inf}, умерло {dead}, в {n} странах.', 'Día {d}: {inf} infectados en total, {dead} muertos, en {n} países.')
      .replace('{d}', String(r.day)).replace('{inf}', grp(r.totals.cumInf)).replace('{dead}', grp(r.totals.D)).replace('{n}', String(r.totals.reached)));
    const from = esc(L('Seeded in {place}', '開始地点: {place}', 'Ausgangspunkt: {place}', 'Начало: {place}', 'Origen: {place}').replace('{place}', o))
      + (r.origin.how === 'place' && r.origin.matched && String(r.origin.matched).toLowerCase() !== String(o).toLowerCase()
        ? ' <span style="opacity:.7">(' + esc(String(r.origin.matched)) + ' → ' + esc(o) + ')</span>' : '');
    const top = r.rows.slice(0, 8).map(x => '<li>' + esc(x.name) + ' — ' + grp(x.cumInf) + ' ' + esc(L('infected', '感染', 'infiziert', 'заражено', 'infectados')) + ', ' + grp(x.D) + ' ' + esc(L('dead', '死亡', 'Tote', 'умерло', 'muertos')) + '</li>').join('');
    /* ⚠⚠⚠ THE ASSUMPTIONS ARE PART OF THE ANSWER, NOT A FOOTNOTE NOBODY READS. A run reported
       without them puts IntMap's defaults in the reader's mouth (#R675); every line here names the
       preset field it came from, derived from PANDEMIC_PARAMS' pointer. */
    const assumed = r.described.filter(d => d.origin !== 'caller');
    const asmp = assumed.length ? '<p style="opacity:.75;font-size:.9em">' + esc(L('Not specified, so taken from the model:', '指定が無かったため、モデルの値を使用:', 'Nicht angegeben, daher aus dem Modell übernommen:', 'Не задано, поэтому взято из модели:', 'No especificado, tomado del modelo:')) + ' '
      + assumed.map(d => esc(d.key) + ' = ' + esc(String(d.display)) + (d.unit ? esc(d.unit) : '') + ' <span style="opacity:.7">[' + esc(d.origin) + ']</span>').join(' · ') + '</p>' : '';
    const ended = r.ended ? '<p>' + esc(L('The epidemic ended on day {d} ({k}).', '流行は {d} 日目に終息しました（{k}）。', 'Die Epidemie endete an Tag {d} ({k}).', 'Эпидемия закончилась на {d}-й день ({k}).', 'La epidemia terminó el día {d} ({k}).').replace('{d}', String(r.day)).replace('{k}', String(r.ended.kind || r.ended))) + '</p>' : '';
    const short = r.day < r.asked ? '<p style="opacity:.75">' + esc(L('Asked for {a} days; the run reached day {d}.', '{a} 日を要求されましたが、{d} 日目まで進みました。', '{a} Tage angefordert; der Lauf erreichte Tag {d}.', 'Запрошено {a} дней; прогон дошёл до дня {d}.', 'Se pidieron {a} días; la simulación llegó al día {d}.').replace('{a}', String(r.asked)).replace('{d}', String(r.day))) + '</p>' : '';
    const seedNote = '<p style="opacity:.7;font-size:.9em">' + esc(L('Seed {s} — the same seed reproduces this run exactly.', '乱数種 {s} — 同じ種なら同じ結果が再現されます。', 'Startwert {s} — derselbe Startwert reproduziert diesen Lauf exakt.', 'Зерно {s} — то же зерно точно воспроизводит прогон.', 'Semilla {s}: la misma semilla reproduce esta simulación exactamente.').replace('{s}', String(r.seed))) + '</p>';
    return '<p><b>' + head + '</b></p><p>' + from + ' · ' + esc(String(r.presetKey)) + ' · ' + esc(String(r.scenario)) + '</p>'
      + ended + short + (top ? '<ul>' + top + '</ul>' : '') + asmp + seedNote;
  }

  function drawHtml(r, n, metric, top) {
    const what = metric === 'deaths' ? L('deaths', '死亡', 'Todesfälle', 'смерти', 'muertes') : L('cases', '症例', 'Fälle', 'случаи', 'casos');
    /* ⚠ THE LEGEND NAMES ITS OWN TOP. The ramp is this day's, so without this sentence the darkest
       dot means whatever the reader assumes it means (#R755). */
    const pc = (top > 0) ? (top * 100 < 0.1 ? (top * 100).toPrecision(2) : (top * 100).toFixed(1)) : '0';
    const scale = (top > 0)
      ? ' ' + L('The darkest mark is the worst-hit country at this day ({p}% of its people).',
                '最も濃い印はこの日の最悪の国（人口の {p}%）です。',
                'Die dunkelste Markierung ist das am stärksten betroffene Land an diesem Tag ({p} % seiner Bevölkerung).',
                'Самая тёмная метка — самая пострадавшая страна на этот день ({p}% населения).',
                'La marca más oscura es el país más afectado ese día ({p}% de su población).').replace('{p}', pc)
      : '';
    return esc(L('Day {d} of the run is on the map — {n} countries, shaded by {m}.', '実行の {d} 日目を地図に表示しました（{n} か国・{m} で濃淡）。', 'Tag {d} des Laufs liegt auf der Karte — {n} Länder, eingefärbt nach {m}.', 'День {d} прогона нанесён на карту — {n} стран, оттенок по {m}.', 'El día {d} está en el mapa: {n} países, sombreados por {m}.')
      .replace('{d}', String(r.day)).replace('{n}', String(n)).replace('{m}', what) + scale);
  }

  /* ⚠ THE CATALOGUE ENTRY IS DERIVED FROM THIS, NOT WRITTEN BESIDE IT (#R743's DECL discipline).
     A preset added to js/pandemic-model.js, or a parameter added to PANDEMIC_PARAMS, is offered to
     the planner without anybody editing prose — which is the only version of this that stays true. */
  function declaration() {
    return { presets: Object.keys(PANDEMIC_PRESETS), maxDays: MAX_DAYS,
      scenarios: PANDEMIC_PARAMS.scenario.values.slice(),
      params: Object.keys(PANDEMIC_PARAMS).map(k => {
        const d = PANDEMIC_PARAMS[k], b = paramBounds(k);
        return { key: k, kind: d.kind, unit: d.unit || '', values: d.values || null, range: b ? [b.min, b.max] : null };
      }) };
  }

  window.IntMapPandemicAtlas = { bind, run, draw, painted, clear, declaration };
})();
