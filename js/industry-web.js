/* ============================================================================
 *  IntMap · THE INDUSTRY WEB — window.IntMapIndustry  (#R213)
 * ----------------------------------------------------------------------------
 *  「似た要領で、業界を選べば、そのなかでの利害関係や実際の数値が人物相関図的にマッピングされる
 *    レイヤーも作って。名称は任せます。」
 *
 *  Outstanding since #R211 §11 and untouched through #R212 §12, so this is the third round it has
 *  been asked for. What it has to be, read literally from the sentence: pick an INDUSTRY → the
 *  players in it, the RELATIONSHIPS BETWEEN THEM drawn as a web (人物相関図), and the REAL NUMBERS
 *  (実際の数値) beside each one. Not a choropleth: a relationship diagram that happens to live on a
 *  map, because where a company sits is itself one of the facts.
 *
 *  ══ WHERE EVERY NUMBER AND EVERY EDGE COMES FROM ═══════════════════════════════════════════════
 *  WIKIDATA, through its public SPARQL endpoint (query.wikidata.org). CORS was measured from a real
 *  cross-origin request before anything was wired — `access-control-allow-origin: *` — which is the
 *  #R212 rule (a Node check is not the browser's answer; this one was checked with an Origin header
 *  and is re-checked from the page by tests/r213).
 *
 *  The NODES are companies with property P452 (industry) = the chosen industry, that also have a
 *  headquarters (P159) with coordinates (P625). The EDGES are Wikidata's own ownership statements:
 *
 *      P749  parent organization      →  drawn from the parent to the child
 *      P127  owned by                 →  drawn from the owner to the owned
 *      P355  has subsidiary           →  drawn from the parent to the child
 *
 *  and nothing else. There is no inferred relationship anywhere in this file: if Wikidata does not
 *  state that A owns B, no line is drawn between A and B. The numbers are P2139 (revenue), P1128
 *  (employees) and P2226 (market capitalisation), each shown WITH the year Wikidata attaches to the
 *  statement, because a revenue figure without its year is not a figure.
 *
 *  ⚠ WHAT THIS IS NOT, AND THE PANEL SAYS SO. Wikidata is a community-maintained database, so its
 *  coverage is uneven — a large private company with no editor is simply absent, and "the biggest in
 *  this industry" is therefore "the biggest Wikidata knows a revenue for". That is a real limit and
 *  it is printed, not hidden. And an ownership graph is not a market-share or influence graph: it
 *  says who owns whom, which is one kind of 利害関係 and not all of them.
 *
 *  ⚠ ONE PANEL. 「いやなんで凡例とポップアップをわざわざ分割するねんあほか」 (#R212, twice). The
 *  legend, the industry picker and whatever is currently selected are ONE window — clicking a
 *  company fills the same panel that carries the legend, and closing that window unchecks the layer
 *  row (「ポップアップを消してもレイヤーは選択状態とかやめろ。連動させろ。」).
 * ==========================================================================*/
window.IntMapModules = window.IntMapModules || {};
window.IntMapModules.industryWeb = function (HOST) {
  const GE = () => window.IntMapGeoEngine;

  window.IntMapIndustry = (function () {
    if (!GE().hasRenderer()) return { state: () => ({ on: false }) };
    /* the shared layer-family toolkit — see js/world-packs.js `_ui` for why it is handed over
       rather than copied. If world-packs has not registered yet this module simply does not build;
       src/main.js imports it after, so that is a boot-order assertion rather than a hope. */
    const W = (window.IntMapWorld && window.IntMapWorld._ui) || null;
    if (!W) return { state: () => ({ on: false, err: 'world-packs not loaded' }) };
    const { makePanel, ensureHead, row, esc, usdShort, usdExact, whenDrawable, L } = W;

    const SRC = 'https://query.wikidata.org/sparql';
    const SRC_URL = 'https://www.wikidata.org/';
    const UA = 'IntMap/1.0 (https://github.com/rwmqx7dwb5-arch/IntMap)';

    /* ── THE INDUSTRIES ───────────────────────────────────────────────────────────────────────────
       Each entry is a Wikidata item id. The list is editorial in WHICH industries are offered and
       in nothing else — every company, coordinate, number and edge under them comes from the query.
       ⚠ Each `q` below was probed against the live endpoint for how many companies actually carry
       it WITH headquarters coordinates; an industry that returns nothing is not offered, because a
       menu entry that always draws an empty map is a worse answer than no entry. */
    /* ⚠ (#R246) THE NAMES ARE A CALL. They were `{en,ja,de,ru,es}` read by a four-step `HOST.lang===`
       chain, which is the eleventh shape with a hand-written resolver bolted on: fr/ko/zh/zh-Hans hit
       the final `: i.en` and read English for ever. `LA(…)` is IntMapLang.pickArgs() — same data, and
       `L.arr()` resolves it through pick() itself, so those four reach the inline table. */
    const LA = window.IntMapLang.pickArgs();
    const INDUSTRIES = [
      { q: 'Q190117', nm: LA('Automotive', '自動車', 'Automobil', 'Автомобильная', 'Automoción') },
      { q: 'Q507443', nm: LA('Pharmaceuticals', '医薬品', 'Pharma', 'Фармацевтика', 'Farmacéutica') },
      { q: 'Q11661', nm: LA('Information technology', '情報技術', 'Informationstechnik', 'ИТ', 'Tecnologías de la información') },
      { q: 'Q806718', nm: LA('Banking', '銀行', 'Bankwesen', 'Банковское дело', 'Banca') },
      { q: 'Q44497', nm: LA('Mining', '鉱業', 'Bergbau', 'Горное дело', 'Minería') },
      { q: 'Q1058314', nm: LA('Software', 'ソフトウェア', 'Software', 'Программное обеспечение', 'Software') },
      { q: 'Q1663017', nm: LA('Chemicals', '化学', 'Chemie', 'Химическая', 'Química') },
      { q: 'Q3591124', nm: LA('Aerospace', '航空宇宙', 'Luft- und Raumfahrt', 'Аэрокосмическая', 'Aeroespacial') },
      { q: 'Q188572', nm: LA('Telecommunications', '電気通信', 'Telekommunikation', 'Телекоммуникации', 'Telecomunicaciones') },
      { q: 'Q216107', nm: LA('Insurance', '保険', 'Versicherung', 'Страхование', 'Seguros') },
      { q: 'Q638608', nm: LA('Food industry', '食品', 'Lebensmittel', 'Пищевая', 'Alimentación') },
      { q: 'Q11451', nm: LA('Agriculture', '農業', 'Landwirtschaft', 'Сельское хозяйство', 'Agricultura') },
      { q: 'Q881531', nm: LA('Energy', 'エネルギー', 'Energie', 'Энергетика', 'Energía') },
      { q: 'Q1420', nm: LA('Motor vehicle manufacturing', '自動車製造', 'Kfz-Bau', 'Автопроизводство', 'Fabricación de vehículos') },
    ];
    const indName = (i) => L.arr(i.nm);

    const SRC_NODE = 'iw-nodes', SRC_EDGE = 'iw-edges';
    const LYR = ['iw-edge-line', 'iw-node-halo', 'iw-node', 'iw-label'];

    let on = false, qid = INDUSTRIES[0].q, status = 'idle', err = null, moneyErr = [], edgeErr = false;
    let nodes = [], edges = [], sel = null, ctrl = null;
    const cache = {};
    /* (#R215) one box, and it is the app's own legend — see js/world-packs.js `makePanel`. */
    const panel = makePanel('iw-panel', () => '🕸 ' + L('Industry web', '業界の相関', 'Branchennetz', 'Отраслевая сеть', 'Red del sector'), 'wp-dl-industry',
      { legendId: 'wpindustry', layers: () => LYR.slice(),
        names: () => (LA('🕸 Industry web','🕸 業界の相関','🕸 Branchennetz','🕸 Отраслевая сеть','🕸 Red del sector')) });

    /* ── THE QUERIES ──────────────────────────────────────────────────────────────────────────────
       TWO, run together, because they are two different shapes. WHO is one row per company and can
       be aggregated; the MONEY is many rows per company — several years of revenue, each with its
       own currency — and aggregating it is exactly how a value and its year come apart. See the ⚠
       above `sparqlMoney` for what that cost the first version of this file. */
    const langPref = () => HOST.lang === 'jp' ? 'ja,en' : HOST.lang === 'de' ? 'de,en' : HOST.lang === 'ru' ? 'ru,en' : HOST.lang === 'es' ? 'es,en' : 'en';
    /* ══ ⚠⚠ (#R215) THE OWNERSHIP JOIN WAS IN THE SAME PLAN AS THE NODES, AND THAT IS WHAT TIMED OUT ══
       「Wikidata に接続できませんでした：クエリが25秒を超えました。何も描いていません。これは『企業が
       無い』ではなく『取得に失敗した』状態です。←は？」 — REPRODUCED from the page, automotive
       (Q190117), same browser, same minute:

           the shipped WHO query (nodes + OPTIONAL ownership + GROUP_CONCAT)   > 30 s on the first
                                                                               run, 5.8 s on the next
           the same query with the ownership OPTIONAL removed                   2.95 s
           nodes without even the label service                                 2.68 s

       So the nodes are cheap and the OPTIONAL is what makes the query's cost a coin toss: WDQS plans
       `?c (wdt:P749|wdt:P127) ?owner . ?owner wdt:P452 wd:Q…` against the whole property graph before
       the LIMIT can bound anything, then GROUP_CONCATs the result. This is the SAME lesson the money
       queries already carry three paragraphs below — **one property per query, bound by a VALUES list
       of ids that are already known** — and it was applied there and not here.

       Two shapes now: the nodes (fast, and the only query whose failure means "no industry"), then
       the ownership statements, VALUES-bound by the ids the nodes returned, one property each and
       run concurrently with the money. P355 (has subsidiary) joins P749/P127 as the header always
       said it did. An ownership query that fails costs the EDGES, not the layer, and says so. */
    function sparqlNodes(q, limit) {
      return `SELECT ?c ?cLabel ?coord ?ctryLabel WHERE {
  ?c wdt:P452 wd:${q} .
  ?c wdt:P159/wdt:P625 ?coord .
  OPTIONAL { ?c wdt:P17 ?ctry }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "${langPref()}" }
}
LIMIT ${limit}`;
    }
    /* `prop` runs owner → owned. P355 states it the other way round, so the caller flips it. */
    function sparqlOwners(ids, prop) {
      return `SELECT ?c ?other WHERE {
  VALUES ?c { ${ids.map(i => 'wd:' + i).join(' ')} }
  ?c wdt:${prop} ?other .
}`;
    }
    const EDGE_PROPS = [['P749', false], ['P127', false], ['P355', true]];
    /* ══ ⚠⚠ A REVENUE HAS A CURRENCY, AND THE FIRST VERSION OF THIS FILE THREW IT AWAY ═══════════
       Measured on the built site with the automotive industry: the panel ranked «Hyundai Mobis
       $36.02T» above «Toyota $28.40T». Neither number is a dollar figure — Wikidata holds Toyota's
       revenue in YEN and Hyundai Mobis's in WON, and printing both behind a `$` is not a rounding
       problem, it is a false statement about the size of a company, by a factor of 150 and 1,400.
       Standing instruction 4 (no fabricated data) is broken by a unit as surely as by a value.

       So the money is its own query and it comes back through `psv:` — the VALUE NODE — which is
       the only place the unit lives; `wdt:`/`ps:` give the bare amount with no unit at all. The unit
       item's ISO 4217 code (P498) travels with it, and the year (P585) too, because a revenue
       without its year is not a figure either.

       ⚠ AND IT IS NOT AGGREGATED. A company routinely has five years of revenue statements, and
       SAMPLE() would take an arbitrary one while MAX(?year) reported a different one — a mismatched
       pair that reads as a precise fact. All the statements come back and the LATEST is chosen here,
       where the value and its year cannot come apart. */
    /* ⚠⚠ AND IT IS ONE PROPERTY PER QUERY, BOUND BY A VALUES LIST — WHICH IS 37× FASTER. Measured
       against the live endpoint, automotive industry:

         one UNION of the three properties, joined from ?c wdt:P452 …    65.6 s → server timeout
         the same UNION with VALUES ?c { … 220 ids … }                   65.6 s → server timeout
         ONE property, VALUES-bound                                       1.7 s → 158 rows

       The UNION is what costs: WDQS plans each branch against the whole `psv:` value-node graph, and
       three branches is not three times one, it is a different plan. Three separate requests run
       concurrently answer the same question in the time of the slowest. This is not a micro-
       optimisation — at 65 s the layer did not work at all, and the first build of it shipped a
       25-second deadline that could therefore never be met. */
    function sparqlProp(ids, prop) {
      return `SELECT ?c ?amount ?iso ?year WHERE {
  VALUES ?c { ${ids.map(i => 'wd:' + i).join(' ')} }
  ?c p:${prop} ?st . ?st psv:${prop} ?vn .
  ?vn wikibase:quantityAmount ?amount .
  OPTIONAL { ?vn wikibase:quantityUnit ?u . OPTIONAL { ?u wdt:P498 ?iso } }
  OPTIONAL { ?st pq:P585 ?t . BIND(YEAR(?t) AS ?year) }
}`;
    }
    const MONEY_PROPS = [['rev', 'P2139'], ['cap', 'P2226'], ['emp', 'P1128']];

    /* ── EXCHANGE RATES: real, dated, and named ───────────────────────────────────────────────────
       European Central Bank reference rates through Frankfurter (CORS `*`, measured). One request,
       cached for the session. ⚠ A CONVERTED FIGURE IS NOT THE PUBLISHED FIGURE — both are shown,
       and the rate's own date is printed beside them, because an ECB rate from today applied to a
       2019 revenue is a comparison and not a historical fact. A currency the ECB does not publish
       (there are many) leaves the company OUT OF THE RANKING rather than being converted at a made-
       up rate; the panel counts how many that is. */
    let fx = null, fxState = 'idle';
    function loadFx() {
      if (fx || fxState === 'loading') return Promise.resolve(fx);
      fxState = 'loading';
      return fetch('https://api.frankfurter.dev/v1/latest?base=USD')
        .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(j => { fx = { date: j.date, rates: Object.assign({ USD: 1 }, j.rates) }; fxState = 'ok'; return fx; })
        .catch(() => { fxState = 'error'; return null; });
    }
    /* the published amount expressed in USD, or null when this app cannot honestly say */
    function usdOf(amount, iso) {
      if (amount == null) return null;
      if (!iso) return null;                       /* no unit stated → not a currency we can name */
      if (!fx || !fx.rates[iso]) return null;      /* no ECB rate → not converted, and not ranked */
      return amount / fx.rates[iso];
    }

    const MAX = 220;
    function fetchIndustry(q) {
      if (cache[q]) { nodes = cache[q].nodes; edges = cache[q].edges; status = 'ok'; return Promise.resolve(); }
      status = 'loading'; err = null; moneyErr = []; edgeErr = false; paint();
      if (ctrl) { try { ctrl.abort(); } catch (_) { } }
      ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      /* ⚠ A COMPETITION WITHOUT A CLOCK IS NOT A COMPETITION (#R212 §7). WDQS has a 60 s server
         limit and a slow query is indistinguishable from a dead one from here, so this one has its
         own deadline and says which of the two happened. */
      /* (#R215) 45 s, not 25. The 25 was chosen when ONE query carried the whole question and could
         not finish inside it; the shape above is four small queries whose slowest measured leg is
         about 3 s, so this is now a genuine "something is wrong" deadline rather than a limit the
         normal case had to beat. WDQS's own server limit is 60 s. */
      const to = setTimeout(() => { try { ctrl && ctrl.abort(); } catch (_) { } }, 45000);
      /* ⚠ 429 IS A REAL ANSWER AND IT IS NOT "NO DATA". The public WDQS endpoint throttles by IP, so
         a user who flips between four industries in a minute will meet it — measured here, twice.
         It comes with `Retry-After`, so the request waits that long and tries ONCE more, and if it
         is refused again the panel says the endpoint is throttling rather than reporting an empty
         industry. (#R212: a layer that cannot distinguish "not yet" from "none" tells lies.) */
      const ask = (query, second) => fetch(SRC + '?format=json&query=' + encodeURIComponent(query),
        { headers: { 'Accept': 'application/sparql-results+json', 'Api-User-Agent': UA }, signal: ctrl ? ctrl.signal : undefined })
        .then(r => {
          if (r.status === 429 && !second) {
            const s = Math.min(30, Math.max(2, +(r.headers.get('Retry-After') || 5) || 5));
            return new Promise(res => setTimeout(res, s * 1000)).then(() => ask(query, true));
          }
          if (r.status === 429) { const e = new Error('429'); e.throttled = true; throw e; }
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json().then(j => (j && j.results && j.results.bindings) || []);
        })
        .then(j => Array.isArray(j) ? j : ((j && j.results && j.results.bindings) || []));
      /* WHO first, because everything else is bound by the ids it returns; then the ownership
         statements, the three money properties and the exchange rates all at once. */
      return ask(sparqlNodes(q, MAX)).then(who => {
        const ids = who.map(b => String(b.c.value).split('/entity/')[1]).filter(Boolean);
        if (!ids.length) return [who, [], []];
        /* ══ ⚠⚠ (#R215) SIX QUERIES AT ONCE IS SIX QUERIES AT ONCE, AND WDQS COUNTS ════════════
           Measured after the split above landed: the nodes came back in 4 s with **201 companies**,
           and then every single one of the six secondary queries failed — `moneyErr: [rev, cap, emp]`
           and `edgeErr: true`, i.e. a map of companies with no figures and no lines. Each of those
           queries was then run BY HAND against the same endpoint from the same browser: the full
           220-id VALUES list answered **200 in 984 ms**. Nothing is wrong with the queries. What was
           wrong is that all six were fired in the same tick, and the public endpoint limits concurrent
           queries per client — so five of them were refused for being the sixth.
           They are run two at a time. Same requests, same total work, about three rounds of ~1.5 s. */
        const lane = (jobs, n) => new Promise(res => {
          const out = new Array(jobs.length); let i = 0, done = 0;
          if (!jobs.length) return res(out);
          const next = () => {
            if (i >= jobs.length) return;
            const k = i++;
            jobs[k]().then(v => { out[k] = v; }, () => { out[k] = []; })
              .then(() => { if (++done === jobs.length) res(out); else next(); });
          };
          for (let k = 0; k < Math.min(n, jobs.length); k++) next();
        });
        /* ⚠ A PROPERTY QUERY THAT FAILED IS NOT A COMPANY WITH NO FIGURE. If the employees query
           is refused, every card would print «—» for employees, which is the app SAYING that
           Wikidata holds no such number — a claim it has no basis for. The failures are collected
           and named. (Measured: Volkswagen genuinely has no P1128 statement, so «—» there IS the
           truth; the two cases must be distinguishable.) */
        /* ⚠ ONE RETRY, AFTER A PAUSE. Measured at two lanes, four of the six came back and two did
           not — a refusal that is not a 429 (which `ask` already retries) and not a timeout, i.e. the
           endpoint declining that instant. Re-asking once a second and a half later is the difference
           between «Wikidata holds no employee count for any of these» and «we asked at a bad moment». */
        const once = (mk) => mk().catch(() => new Promise(r => setTimeout(r, 1500)).then(mk));
        const moneyJobs = MONEY_PROPS.map(([kind, prop]) => () =>
          once(() => ask(sparqlProp(ids, prop))).then(rows => rows.map(r => Object.assign({ _kind: kind }, r)))
            .catch(() => { moneyErr.push(kind); return []; }));
        /* the edges. Same shape, same reason, and a refusal here loses the LINES and not the map. */
        const edgeJobs = EDGE_PROPS.map(([prop, flip]) => () =>
          once(() => ask(sparqlOwners(ids, prop))).then(rows => rows.map(r => ({ flip, a: r.c, b: r.other })))
            .catch(() => { edgeErr = true; return []; }));
        loadFx();          /* a different host, so it does not compete for a WDQS slot */
        return lane(moneyJobs.concat(edgeJobs), 2).then(all => [
          who,
          all.slice(0, moneyJobs.length).flat(),
          all.slice(moneyJobs.length).flat(),
        ]);
      })
        .then(([who, money, links]) => {
          clearTimeout(to);
          const byId = new Map();
          for (const b of who) {
            const id = String(b.c.value).split('/entity/')[1];
            const m = /Point\(([-\d.eE]+)\s+([-\d.eE]+)\)/.exec(b.coord ? b.coord.value : '');
            if (!id || !m) continue;
            byId.set(id, {
              id, name: b.cLabel ? b.cLabel.value : id,
              lng: +m[1], lat: +m[2],
              country: b.ctryLabel ? b.ctryLabel.value : '',
              rev: null, revIso: '', revYear: '', revUsd: null,
              cap: null, capIso: '', capYear: '', capUsd: null,
              emp: null, empYear: '',
              owners: [],
            });
          }
          /* an ownership statement becomes an edge only when BOTH ends are companies this query
             returned — see the note by `outside` below. The direction is always owner → owned. */
          for (const l of (links || [])) {
            const A = String(l.a && l.a.value || '').split('/entity/')[1];
            const B = String(l.b && l.b.value || '').split('/entity/')[1];
            if (!A || !B) continue;
            const owner = l.flip ? A : B, owned = l.flip ? B : A;
            const n = byId.get(owned); if (!n) continue;
            if (n.owners.indexOf(owner) < 0) n.owners.push(owner);
          }
          /* the LATEST statement of each kind wins, and its year and unit stay attached to it */
          for (const b of money) {
            const id = String(b.c.value).split('/entity/')[1];
            const n = byId.get(id); if (!n) continue;
            const kind = b._kind, amount = +b.amount.value;
            if (!isFinite(amount)) continue;
            const year = b.year ? String(b.year.value) : '';
            const iso = b.iso ? String(b.iso.value) : '';
            const cur = kind === 'rev' ? n.revYear : kind === 'cap' ? n.capYear : n.empYear;
            const have = kind === 'rev' ? n.rev != null : kind === 'cap' ? n.cap != null : n.emp != null;
            if (have && cur && year && year <= cur) continue;
            if (have && !year) continue;                 /* an undated statement never displaces a dated one */
            if (kind === 'rev') { n.rev = amount; n.revIso = iso; n.revYear = year; n.revUsd = usdOf(amount, iso); }
            else if (kind === 'cap') { n.cap = amount; n.capIso = iso; n.capYear = year; n.capUsd = usdOf(amount, iso); }
            else { n.emp = amount; n.empYear = year; }
          }
          nodes = [...byId.values()];
          /* ⚠ THE RANKING AND THE CIRCLE SIZE ARE THE CONVERTED FIGURE, so they are comparable; the
             DISPLAY is the published figure in its own currency, so it is true. A company whose
             currency the ECB does not publish has revUsd null and is neither ranked nor scaled. */
          nodes.sort((a, b2) => (b2.revUsd || -1) - (a.revUsd || -1));
          /* ⚠ AN EDGE ONLY EXISTS IF BOTH ENDS ARE ON THE MAP. Wikidata will happily say a company
             is owned by a holding company that has no coordinates, or that is in another industry —
             drawing that would mean inventing a position for one end. Those statements are counted
             and reported instead of drawn, so the panel can say "12 ownership links point outside
             this view" rather than quietly showing fewer relationships than exist. */
          let outside = 0;
          edges = [];
          for (const n of nodes) for (const o of n.owners) {
            const p = byId.get(o);
            if (!p) { outside++; continue; }
            if (p.id === n.id) continue;
            edges.push({ from: p, to: n });
          }
          cache[q] = { nodes, edges, outside };
          status = 'ok';
        })
        .catch(e => {
          clearTimeout(to);
          status = 'error';
          err = (e && e.name === 'AbortError')
            ? L('the query took longer than 45 s', 'クエリが45秒を超えました', 'Abfrage über 45 s', 'запрос дольше 45 с', 'la consulta superó 45 s')
            : (e && e.throttled)
              ? L('Wikidata’s public endpoint is rate-limiting this browser — wait a moment and switch the layer on again',
                  'Wikidata の公開エンドポイントがこのブラウザに回数制限をかけています。少し待ってからもう一度オンにしてください',
                  'Der öffentliche Wikidata-Endpunkt drosselt gerade — kurz warten und erneut einschalten',
                  'Публичная точка Wikidata ограничивает частоту запросов — подождите и включите слой снова',
                  'El punto público de Wikidata está limitando la frecuencia — espere y vuelva a activarlo')
              : ((e && e.message) || String(e));
          nodes = []; edges = [];
        });
    }

    /* ── DRAWING ──────────────────────────────────────────────────────────────────────────────────
       Circles at the headquarters, sized by revenue where there is one; lines along the great circle
       between owner and owned. ⚠ THE LINE IS A GREAT CIRCLE, not a straight segment in screen space
       — #R212 §6 settled that for the 3-D solids and the same geometry applies here: a straight line
       from Detroit to Seoul on a globe is not the path between them, and at these distances the
       error is visible. */
    function greatCircle(a, b, n) {
      const D = Math.PI / 180, R = 180 / Math.PI;
      const φ1 = a.lat * D, λ1 = a.lng * D, φ2 = b.lat * D, λ2 = b.lng * D;
      const d = 2 * Math.asin(Math.sqrt(Math.pow(Math.sin((φ2 - φ1) / 2), 2) + Math.cos(φ1) * Math.cos(φ2) * Math.pow(Math.sin((λ2 - λ1) / 2), 2)));
      if (!(d > 1e-9)) return [[a.lng, a.lat], [b.lng, b.lat]];
      const out = [];
      for (let i = 0; i <= n; i++) {
        const f = i / n, A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d);
        const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
        const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
        const z = A * Math.sin(φ1) + B * Math.sin(φ2);
        out.push([Math.atan2(y, x) * R, Math.atan2(z, Math.sqrt(x * x + y * y)) * R]);
      }
      return out;
    }

    function geo() {
      const nf = { type: 'FeatureCollection', features: nodes.map(n => ({
        type: 'Feature', id: undefined,
        /* ⚠ `rev` in the STYLE is the converted figure, because a circle area is a comparison and a
           comparison across currencies has to be in one currency. The published figure never enters
           the paint — it is only ever printed, with its own currency beside it. */
        properties: { id: n.id, name: n.name, rev: n.revUsd || 0, emp: n.emp || 0,
          country: n.country, revYear: n.revYear, hasRev: n.revUsd ? 1 : 0, sel: (sel && sel.id === n.id) ? 1 : 0 },
        geometry: { type: 'Point', coordinates: [n.lng, n.lat] },
      })) };
      const ef = { type: 'FeatureCollection', features: edges.map(e => ({
        type: 'Feature',
        properties: { from: e.from.id, to: e.to.id, lit: (sel && (sel.id === e.from.id || sel.id === e.to.id)) ? 1 : 0 },
        geometry: { type: 'LineString', coordinates: greatCircle(e.from, e.to, 48) },
      })) };
      return { nf, ef };
    }

    function ensureLayers() {
      const { nf, ef } = geo();
      /* ══ ⚠⚠ (#R216) THE SECOND INDUSTRY NEVER REACHED THE MAP ═════════════════════════════════════
         「業界の相関で、凡例から業界を変更しても、地図上はずっと自動車の業界のまま。」 These two lines
         called `GE().layers.setData(…)`, and the renderer contract's name for that operation is
         `setSourceData` (js/geo-engine.js) — `setData` is undefined on it. This file was the only
         caller of the wrong name in the app, so nothing else ever noticed.
         ⚠ WHY IT LOOKED LIKE THE PICKER WAS IGNORED RATHER THAN LIKE A CRASH: on the FIRST industry
         the sources do not exist yet, so the `addSource` branch runs and the map is correct. Every
         later industry takes the `else`, throws a TypeError inside `whenDrawable`'s try/catch — which
         warns and moves on — and the map keeps the geometry of the first one. The panel meanwhile
         re-rendered from the new `nodes`, so the window and the map disagreed, with the map stuck on
         whatever was picked first: the default, automotive. */
      if (!GE().layers.hasSource(SRC_EDGE)) GE().layers.addSource(SRC_EDGE, { type: 'geojson', data: ef });
      else GE().layers.setSourceData(SRC_EDGE, ef);
      if (!GE().layers.hasSource(SRC_NODE)) GE().layers.addSource(SRC_NODE, { type: 'geojson', data: nf });
      else GE().layers.setSourceData(SRC_NODE, nf);
      if (!GE().layers.has('iw-edge-line')) GE().layers.add({
        id: 'iw-edge-line', type: 'line', source: SRC_EDGE,
        paint: {
          'line-color': ['case', ['==', ['get', 'lit'], 1], '#ffd23f', '#7d8ea8'],
          'line-width': ['case', ['==', ['get', 'lit'], 1], 2.2, 1.1],
          'line-opacity': ['case', ['==', ['get', 'lit'], 1], 0.95, 0.42],
        },
      });
      if (!GE().layers.has('iw-node-halo')) GE().layers.add({
        id: 'iw-node-halo', type: 'circle', source: SRC_NODE,
        filter: ['==', ['get', 'sel'], 1],
        paint: { 'circle-radius': ['+', radiusExpr(), 5], 'circle-color': '#ffd23f', 'circle-opacity': 0.28 },
      });
      if (!GE().layers.has('iw-node')) GE().layers.add({
        id: 'iw-node', type: 'circle', source: SRC_NODE,
        paint: {
          'circle-radius': radiusExpr(),
          /* ⚠ a company with no published revenue is a DIFFERENT colour, not a small dot — a small
             dot would read as "small company", which is a claim the data does not make. */
          'circle-color': ['case', ['==', ['get', 'hasRev'], 1], '#4da3ff', '#9aa0a6'],
          'circle-opacity': 0.9, 'circle-stroke-width': 1, 'circle-stroke-color': 'rgba(255,255,255,0.75)',
        },
      });
      if (!GE().layers.has('iw-label')) GE().layers.add({
        id: 'iw-label', type: 'symbol', source: SRC_NODE,
        /* only the ones big enough to be readable get a name, and the threshold is the revenue rank
           rather than the zoom, so panning does not change who is labelled */
        filter: ['>', ['get', 'rev'], 0],
        layout: { 'text-field': ['get', 'name'], 'text-size': 11, 'text-offset': [0, 1.1], 'text-anchor': 'top',
          'text-font': ['literal', ['Noto Sans Regular']], 'text-allow-overlap': false, 'text-optional': true },
        paint: { 'text-color': '#e8eaf0', 'text-halo-color': 'rgba(0,0,0,0.75)', 'text-halo-width': 1.4 },
      });
      wireClick();
    }
    /* the radius IS the revenue — √ of it, so AREA is proportional to the figure rather than the
       diameter (a diameter ramp exaggerates the big ones by the square) */
    function radiusExpr() {
      return ['interpolate', ['linear'], ['sqrt', ['max', ['get', 'rev'], 0]],
        0, 4, 1e4, 6, 1e5, 11, 3e5, 18, 6e5, 26];
    }

    /* ⚠ THE PANEL MUST NOT DEPEND ON THE MAP ACCEPTING A LAYER UPDATE. Measured: clicking a company
       set the selection (state reported Q246) and the window went on showing the ranking, because
       `ensureLayers()` threw first — the renderer refuses `setData` whenever the style is mid-parse —
       and took `paint()` down with it. Same shape as the loading/repaint coupling above: two
       different questions, one of which was silently gating the other. */
    function refresh() { try { ensureLayers(); } catch (_) { } paint(); }

    let clickWired = false;
    function wireClick() {
      if (clickWired) return; clickWired = true;
      try {
        GE().events.onLayer('click', 'iw-node', (e) => {
          const f = e && e.features && e.features[0]; if (!f) return;
          try { if (window.IntMapEvents && window.IntMapEvents.claimClick) window.IntMapEvents.claimClick(e); } catch (_) { }
          const id = f.properties && f.properties.id;
          sel = nodes.find(n => n.id === id) || null;
          refresh();
        });
      } catch (_) { }
    }

    function clear() {
      LYR.slice().reverse().forEach(l => { try { if (GE().layers.has(l)) GE().layers.remove(l); } catch (_) { } });
      [SRC_NODE, SRC_EDGE].forEach(s => { try { if (GE().layers.hasSource(s)) GE().layers.removeSource(s); } catch (_) { } });
    }

    /* ── THE PANEL: picker + legend + selection, in ONE window ────────────────────────────────────
       「いやなんで凡例とポップアップをわざわざ分割するねんあほか」 — so there is no second window and
       no map popup. Selecting a company rewrites the lower half of this one. */
    function paint() {
      if (!on) { panel.hide(); return; }
      const body = panel.open(html());
      const sel$ = body.querySelector('.iw-pick');
      if (sel$) sel$.onchange = () => { qid = sel$.value; sel = null; load(); };
      const cl = body.querySelector('.iw-clear'); if (cl) cl.onclick = () => { sel = null; refresh(); };
      body.querySelectorAll('.iw-goto').forEach(b => b.onclick = () => {
        const n = nodes.find(x => x.id === b.getAttribute('data-id')); if (!n) return;
        sel = n; refresh();
        try { GE().camera.flyTo({ center: [n.lng, n.lat], zoom: Math.max(4, GE().camera.getZoom() || 4) }); } catch (_) { }
      });
    }
    /* the published figure in ITS OWN currency, and — only when the ECB publishes a rate for it —
       the same figure in USD with the rate's date. Never one without saying which it is. */
    const CURSYM = { USD:'$', EUR:'€', JPY:'¥', GBP:'£', CNY:'¥', KRW:'₩', INR:'₹', CHF:'CHF ', CAD:'CA$', AUD:'A$', BRL:'R$', SEK:'kr ', NOK:'kr ', DKK:'kr ', PLN:'zł ', TRY:'₺', ZAR:'R ', MXN:'MX$', SGD:'S$', HKD:'HK$', THB:'฿', TWD:'NT$', RUB:'₽' };
    function curShort(v, iso) {
      const sym = CURSYM[iso] || (iso ? iso + ' ' : ''); const a = Math.abs(v);
      if (a >= 1e12) return sym + (v / 1e12).toFixed(2) + 'T';
      if (a >= 1e9) return sym + (v / 1e9).toFixed(1) + 'B';
      if (a >= 1e6) return sym + (v / 1e6).toFixed(1) + 'M';
      if (a >= 1e3) return sym + (v / 1e3).toFixed(1) + 'k';
      return sym + Math.round(v).toLocaleString('en-US');
    }
    function money(v, iso, usd) {
      if (v == null) return '—';
      const pub = curShort(v, iso) + ' (' + (CURSYM[iso] || (iso ? iso + ' ' : '')) + Math.round(v).toLocaleString('en-US') + ')';
      if (usd == null || iso === 'USD') return pub + (iso ? '' : ' ' + L('(currency not stated)', '（通貨の記載なし）', '(Währung nicht angegeben)', '(валюта не указана)', '(moneda no indicada)'));
      return pub + ' ≈ ' + usdShort(usd) + ((fx && fx.date) ? ' @ ECB ' + fx.date : '');
    }
    function html() {
      const cur = INDUSTRIES.find(i => i.q === qid) || INDUSTRIES[0];
      let s = '<label style="font-size:11px;color:var(--text-muted);">' + esc(L('Industry', '業界', 'Branche', 'Отрасль', 'Sector')) + '</label>'
        + '<select class="iw-pick" style="width:100%;padding:7px 9px;border-radius:9px;border:1px solid var(--glass-border,rgba(128,128,128,0.3));background:var(--input-bg);color:var(--text-main);font-size:12.5px;">'
        + INDUSTRIES.map(i => '<option value="' + esc(i.q) + '"' + (i.q === qid ? ' selected' : '') + '>' + esc(indName(i)) + '</option>').join('')
        + '</select>';
      if (status === 'loading') return s + '<div style="font-size:12px;color:var(--text-muted);">' + esc(L('Querying Wikidata…', 'Wikidata に問い合わせ中…', 'Wikidata wird abgefragt…', 'Запрос к Wikidata…', 'Consultando Wikidata…')) + '</div>';
      if (status === 'error') return s + '<div style="font-size:12px;color:#ff9f0a;line-height:1.5;">'
        + esc(L('Wikidata could not be reached: ', 'Wikidata に接続できませんでした：', 'Wikidata nicht erreichbar: ', 'Не удалось получить данные Wikidata: ', 'No se pudo acceder a Wikidata: ') + (err || '')) + '<br>'
        + esc(L('Nothing is drawn — this is a failed query, not an industry with no companies.', '何も描いていません。これは「企業が無い」ではなく「取得に失敗した」状態です。', 'Nichts gezeichnet — fehlgeschlagene Abfrage, keine leere Branche.', 'Ничего не нарисовано — это сбой запроса, а не пустая отрасль.', 'No se dibuja nada: es una consulta fallida, no un sector vacío.')) + '</div>';

      const withRev = nodes.filter(n => n.rev != null).length;
      const unconverted = nodes.filter(n => n.rev != null && n.revUsd == null).length;
      const outside = (cache[qid] && cache[qid].outside) || 0;
      s += '<div style="font-size:11.5px;color:var(--text-main);line-height:1.55;">'
        + '<b>' + nodes.length + '</b> ' + esc(L('companies', '社', 'Unternehmen', 'компаний', 'empresas'))
        + ' · <b>' + edges.length + '</b> ' + esc(L('ownership links', '資本関係', 'Beteiligungen', 'связей владения', 'vínculos de propiedad'))
        + ' · <b>' + withRev + '</b> ' + esc(L('with a published revenue', 'に売上高の記載', 'mit Umsatzangabe', 'с указанной выручкой', 'con ingresos publicados'))
        + '</div>';
      /* the legend — same window, and the circle sizes it describes are the ones the paint uses */
      s += '<div style="display:flex;align-items:center;gap:10px;font-size:10.5px;color:var(--text-muted);flex-wrap:wrap;">'
        + '<span style="display:inline-flex;align-items:center;gap:4px;"><span style="width:8px;height:8px;border-radius:50%;background:#4da3ff;"></span>' + esc(L('revenue known — area ∝ revenue', '売上高あり（面積が売上高に比例）', 'Umsatz bekannt — Fläche ∝ Umsatz', 'выручка известна — площадь ∝ выручке', 'ingresos conocidos — área ∝ ingresos')) + '</span>'
        + '<span style="display:inline-flex;align-items:center;gap:4px;"><span style="width:8px;height:8px;border-radius:50%;background:#9aa0a6;"></span>' + esc(L('no published revenue', '売上高の記載なし', 'kein Umsatz angegeben', 'выручка не указана', 'sin ingresos publicados')) + '</span>'
        + '<span style="display:inline-flex;align-items:center;gap:4px;"><span style="width:16px;height:2px;background:#7d8ea8;"></span>' + esc(L('owner → owned', '親会社 → 子会社', 'Eigner → Beteiligung', 'владелец → актив', 'propietario → participada')) + '</span>'
        + '</div>';

      if (sel) {
        s += '<div style="border-top:1px solid var(--glass-border,rgba(128,128,128,0.25));padding-top:8px;">'
          + '<div style="display:flex;align-items:baseline;gap:6px;"><b style="font-size:13px;">' + esc(sel.name) + '</b>'
          + '<span style="flex:1;"></span><button class="iw-clear" style="border:none;background:transparent;color:var(--text-muted);font-size:11px;cursor:pointer;text-decoration:underline;">' + esc(L('clear', '選択解除', 'Auswahl aufheben', 'снять', 'quitar')) + '</button></div>'
          + (sel.country ? '<div style="font-size:11px;color:var(--text-muted);">' + esc(sel.country) + '</div>' : '')
          + rowKV(L('Revenue', '売上高', 'Umsatz', 'Выручка', 'Ingresos') + (sel.revYear ? ' (' + sel.revYear + ')' : ''), money(sel.rev, sel.revIso, sel.revUsd))
          + rowKV(L('Market capitalisation', '時価総額', 'Marktkapitalisierung', 'Капитализация', 'Capitalización') + (sel.capYear ? ' (' + sel.capYear + ')' : ''), money(sel.cap, sel.capIso, sel.capUsd))
          + rowKV(L('Employees', '従業員数', 'Beschäftigte', 'Сотрудники', 'Empleados'), sel.emp == null ? '—' : Math.round(sel.emp).toLocaleString('en-US'))
          + relatedHtml(sel)
          + '<div style="margin-top:5px;"><a href="' + esc('https://www.wikidata.org/wiki/' + sel.id) + '" target="_blank" rel="noopener" style="font-size:10.5px;color:var(--primary-color);">' + esc(L('this company on Wikidata ↗', 'この企業の Wikidata ページ ↗', 'auf Wikidata ↗', 'на Wikidata ↗', 'en Wikidata ↗')) + '</a></div>'
          + '</div>';
      } else {
        /* with nothing selected, the panel is the ranking — which is the other half of 「実際の数値」 */
        const top = nodes.filter(n => n.revUsd != null).slice(0, 12);
        if (top.length) s += '<div style="border-top:1px solid var(--glass-border,rgba(128,128,128,0.25));padding-top:7px;font-size:11px;">'
          + '<div style="color:var(--text-muted);margin-bottom:3px;">' + esc(L('Largest by revenue, ranked at ECB rates' + (fx && fx.date ? ' of ' + fx.date : ''), '売上高順（順位は' + (fx && fx.date ? fx.date + 'の' : '') + 'ECB参照レート換算、表示は公表通貨のまま）', 'Größte nach Umsatz (EZB-Kurse)', 'Крупнейшие по выручке (курсы ЕЦБ)', 'Mayores por ingresos (tipos BCE)')) + '</div>'
          + top.map(n => '<button class="iw-goto" data-id="' + esc(n.id) + '" style="display:flex;width:100%;gap:6px;align-items:baseline;background:none;border:none;color:var(--text-main);font-size:11px;padding:2px 0;cursor:pointer;text-align:left;">'
            + '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(n.name) + '</span>'
            + '<b style="font-variant-numeric:tabular-nums;">' + esc(curShort(n.rev, n.revIso)) + '</b></button>').join('')
          + '</div>';
      }

      s += '<div style="font-size:9.5px;color:var(--text-muted);line-height:1.5;border-top:1px solid var(--glass-border,rgba(128,128,128,0.25));padding-top:6px;">'
        + esc(L(
          'Companies, headquarters coordinates, revenue, market capitalisation, employees and every ownership link come from Wikidata (CC0). Only P452 «industry» members with a headquarters coordinate are shown, ordered by revenue and capped at ' + MAX + '.',
          '企業・本社座標・売上高・時価総額・従業員数・資本関係はすべて Wikidata（CC0）から取得しています。P452「業種」が一致し、かつ本社座標を持つ企業のみを、売上高順に最大' + MAX + '社まで表示します。',
          'Unternehmen, Sitz, Umsatz, Marktkapitalisierung, Beschäftigte und Beteiligungen stammen aus Wikidata (CC0); max. ' + MAX + '.',
          'Компании, координаты штаб-квартир, выручка, капитализация, сотрудники и связи владения — из Wikidata (CC0); не более ' + MAX + '.',
          'Empresas, sedes, ingresos, capitalización, empleados y vínculos de propiedad proceden de Wikidata (CC0); máx. ' + MAX + '.'))
        + ' ' + esc(L(
          '⚠ Wikidata is community-maintained, so coverage is uneven: a company nobody has entered is simply absent, and «the largest» means «the largest Wikidata has a revenue for». An ownership graph is not a market-share or influence graph.',
          '⚠ Wikidata は有志が編集するデータベースなので網羅性は一様ではありません。誰も登録していない企業は単に存在しないものとして扱われ、「最大手」は「Wikidata に売上高が載っている中での最大」という意味です。また資本関係の図はシェアや影響力の図ではありません。',
          '⚠ Wikidata wird von der Community gepflegt — die Abdeckung ist ungleichmäßig. Ein Beteiligungsgraph ist kein Marktanteilsgraph.',
          '⚠ Wikidata ведётся сообществом, полнота неравномерна. Граф владения — не граф доли рынка.',
          '⚠ Wikidata la mantiene la comunidad; la cobertura es desigual. Un grafo de propiedad no es un grafo de cuota de mercado.'))
        + ' ' + esc(L(
          'Revenue and market capitalisation are shown in the currency Wikidata states them in. The ranking and the circle sizes convert them at European Central Bank reference rates' + (fx && fx.date ? ' of ' + fx.date : '') + ' — today’s rate applied to an older figure, which is a comparison rather than a historical value.',
          '売上高と時価総額は Wikidata が記載している通貨のまま表示しています。順位と円の大きさは欧州中央銀行の参照レート' + (fx && fx.date ? '（' + fx.date + '）' : '') + 'で換算したもので、過去の数字に現在のレートを当てた「比較のための値」であって当時の実額ではありません。',
          'Umsatz und Marktkapitalisierung in der angegebenen Währung; Rangfolge zu EZB-Referenzkursen umgerechnet.',
          'Выручка и капитализация показаны в указанной валюте; ранжирование — по справочным курсам ЕЦБ.',
          'Ingresos y capitalización en su moneda; el orden se convierte a tipos de referencia del BCE.'))
        + (unconverted ? (' ' + esc(L(
          unconverted + ' companies publish their revenue in a currency the ECB does not quote, so they are shown but not ranked or scaled.',
          unconverted + '社は ECB が公表していない通貨で売上高を記載しているため、表示はしますが順位付けと大きさの対象から外しています。',
          unconverted + ' Unternehmen nutzen eine Währung ohne EZB-Kurs und werden nicht eingeordnet.',
          unconverted + ' компаний используют валюту без курса ЕЦБ и не ранжируются.',
          unconverted + ' empresas usan una moneda sin tipo del BCE y no se ordenan.'))) : '')
        + (moneyErr.length ? (' ' + esc(L(
          'These figures could not be fetched this time and are shown as «—» for every company: ' + moneyErr.join(', ') + '. That is a failed query, not an absence in Wikidata.',
          '今回取得できなかった項目があります（' + moneyErr.join('、') + '）。全社で「—」と表示されますが、これは取得失敗であって Wikidata に記載が無いという意味ではありません。',
          'Nicht abrufbar und daher überall «—»: ' + moneyErr.join(', ') + '.',
          'Не удалось получить: ' + moneyErr.join(', ') + ' — это сбой запроса, а не отсутствие данных.',
          'No se pudieron obtener: ' + moneyErr.join(', ') + '; es un fallo de consulta, no una ausencia.'))) : '')
        /* (#R215) the edges are their own query now, so their failure is its own sentence — an empty
           web is not the same claim as "these companies own nobody". */
        + (edgeErr ? (' ' + esc(L(
          'The ownership statements could not be fetched this time, so no lines are drawn. That is a failed query, not an absence of ownership.',
          '今回は資本関係の取得に失敗したため、線を描いていません。これは取得失敗であって「資本関係が無い」という意味ではありません。',
          'Die Eigentumsangaben konnten nicht abgerufen werden — es werden keine Linien gezeichnet.',
          'Не удалось получить сведения о владении — линии не нарисованы.',
          'No se pudieron obtener las participaciones; no se dibujan líneas.'))) : '')
        + (fxState === 'error' ? (' ' + esc(L('Exchange rates could not be fetched, so nothing is converted.', '為替レートを取得できなかったため、換算は行っていません。', 'Wechselkurse nicht abrufbar — keine Umrechnung.', 'Курсы не получены — конвертация не выполнена.', 'No se obtuvieron tipos de cambio; sin conversión.'))) : '')
        + (outside ? (' ' + esc(L(
          outside + ' ownership statements point at a company that is outside this industry or has no headquarters coordinate, so they are counted here rather than drawn.',
          '資本関係のうち' + outside + '件は、この業種に属さない企業や本社座標を持たない企業を指しているため、線としては描かず件数だけを示しています。',
          outside + ' Beteiligungen zeigen aus dieser Branche heraus und werden nur gezählt.',
          outside + ' связей указывают за пределы отрасли и только подсчитаны.',
          outside + ' vínculos apuntan fuera del sector y solo se cuentan.'))) : '')
        + '</div>';
      return s;
    }
    const rowKV = (k, v) => '<div style="display:flex;justify-content:space-between;gap:8px;font-size:11.5px;"><span style="opacity:.72;">' + esc(k) + '</span><b style="text-align:right;">' + esc(v) + '</b></div>';
    function relatedHtml(n) {
      const par = edges.filter(e => e.to.id === n.id).map(e => e.from);
      const kid = edges.filter(e => e.from.id === n.id).map(e => e.to);
      if (!par.length && !kid.length) return '<div style="font-size:10.5px;color:var(--text-muted);margin-top:4px;">'
        + esc(L('Wikidata states no ownership link between this company and another one in this industry.', 'この業種の中では、Wikidata にこの企業の資本関係の記載がありません。', 'Keine Beteiligung innerhalb dieser Branche angegeben.', 'В этой отрасли связей владения не указано.', 'No consta ningún vínculo de propiedad dentro del sector.')) + '</div>';
      const list = (t, a) => a.length ? ('<div style="font-size:10.5px;margin-top:4px;"><span style="color:var(--text-muted);">' + esc(t) + '</span> '
        + a.map(x => '<button class="iw-goto" data-id="' + esc(x.id) + '" style="background:none;border:none;color:var(--primary-color);font-size:10.5px;cursor:pointer;padding:0 3px 0 0;">' + esc(x.name) + '</button>').join('') + '</div>') : '';
      return list(L('Owned by', '親会社', 'Eigner', 'Владелец', 'Propietario'), par)
        + list(L('Owns', '子会社', 'Beteiligungen', 'Владеет', 'Participadas'), kid);
    }

    /* ⚠ THE PANEL DOES NOT WAIT FOR THE MAP. Measured on the built site: the answer came back in
       12.7 s with 191 companies and 53 links, and the window still read «Querying Wikidata…» —
       because the repaint had been put INSIDE `whenDrawable`, which waits for the renderer to be
       willing to accept a layer. Those are two different questions, and tying the text to the map's
       readiness is how a finished fetch keeps reporting itself as unfinished (#R212's 「取得中を
       無いと答えるな」 with the two states swapped). The panel repaints the instant the data lands;
       the layers are added whenever the renderer is ready for them. */
    function load() {
      fetchIndustry(qid).then(() => { if (!on) return; paint(); whenDrawable(() => { if (on) ensureLayers(); }); });
      paint();
    }

    function toggle(v) {
      on = !!v;
      if (!on) { clear(); panel.hide(); return; }
      load();
    }

    /* the layer row, under the same "World data" heading the other five use */
    function buildUI() {
      const dd = ensureHead(); if (!dd) return;
      const cb = row(dd, 'wp-dl-industry', L('Industry web', '業界の相関', 'Branchennetz', 'Отраслевая сеть', 'Red del sector'), '#c77dff');
      if (!cb || cb.__iwWired) return; cb.__iwWired = true;
      cb.addEventListener('change', e => {
        const r = e.target.closest('.lyr-row'); if (r) r.classList.toggle('on', e.target.checked);
        try { toggle(e.target.checked); } catch (err) { console.warn('industryWeb toggle', err); }
      });
    }
    if (document.readyState !== 'loading') setTimeout(buildUI, 0); else document.addEventListener('DOMContentLoaded', buildUI);
    window.addEventListener('intmap-lang', () => setTimeout(() => {
      const e = document.getElementById('wp-dl-industry-lbl');
      if (e) e.textContent = L('Industry web', '業界の相関', 'Branchennetz', 'Отраслевая сеть', 'Red del sector');
      if (on) paint();
    }, 20));

    /* the choice travels in a share link, like the other five (#R211) */
    try {
      window.IntMapShareState && window.IntMapShareState.register('industry', {
        get() { return on ? { q: qid, s: sel ? sel.id : '' } : null; },
        set(v) { if (!v || !v.q) return; qid = v.q; const cb = document.getElementById('wp-dl-industry'); if (cb && !cb.checked) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); } },
      });
    } catch (_) { }

    return {
      toggle, select: (id) => { sel = nodes.find(n => n.id === id) || null; if (on) { ensureLayers(); paint(); } return !!sel; },
      setIndustry: (q) => { if (!INDUSTRIES.some(i => i.q === q)) return false; qid = q; sel = null; if (on) load(); return true; },
      industries: () => INDUSTRIES.map(i => ({ q: i.q, name: indName(i) })),
      state: () => ({ on, q: qid, status, err, moneyErr: moneyErr.slice(), edgeErr, fx: fxState, nodes: nodes.length, edges: edges.length, sel: sel ? sel.id : null, source: SRC_URL }),
    };
  })();
};
