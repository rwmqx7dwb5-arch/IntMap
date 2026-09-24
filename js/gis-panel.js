/* ============================================================================
 *  IntMap · THE GIS CONSOLE — window.IntMapGisPanel   (#R729)
 * ----------------------------------------------------------------------------
 *  js/gis-datasets.js made 「地図に載せたデータ」 and 「分析できるデータ」 the same thing, js/gis-ops.js
 *  turns one of those into another one, and js/gis-project.js can put the recipe back tomorrow.
 *  None of the three has a door a reader can open. This file is that door: what exists, what it is
 *  made of, where it came from, what can be run on it, and what a saved project holds.
 *
 *  ══ ⚠⚠⚠ THE PANEL IS BUILT FROM THE DECLARATIONS, NOT FROM A LIST OF OPS ══════════════════════
 *  There is no form in this file for «buffer», none for «clip», none for «filter». `IntMapGisOps
 *  .ops()` hands back what each op SAYS it takes — how many inputs, the geometry each input may be,
 *  what it produces, and one row per parameter with its type, its unit, which input a column name
 *  is chosen from (`params[].input`), which operators a condition may use (`params[].ops`) and the
 *  one conditional requirement (`params[].requiredWhen`) — and everything below is a loop over that.
 *  Written the other way (a hand-made form per op) the panel is a second, quieter copy of the ops
 *  module's signature list, and the two drift the moment an op grows a parameter: the op would
 *  accept it, the screen would never ask for it, and nothing would be wrong anywhere anybody could
 *  see. It is the record-per-case shape .agents/rules/no-ad-hoc-hardcoding.md §1 forbids, and it is
 *  the decision #R725 made for Atlas's work list, for the same reason — the capability already
 *  states its own arguments, so the screen reads them instead of repeating them.
 *  ⚠ Consequently an op added tomorrow is drawable TODAY, and a `type` this file has never heard of
 *  falls to a plain text box carrying its type name rather than being silently dropped.
 *
 *  ══ ⚠ NOTHING IS TRUNCATED WITHOUT SAYING SO ══════════════════════════════════════════════════
 *  The attribute table draws 200 rows because a dataset may hold hundreds of thousands, and it
 *  prints 「200 / 12,345」 on the same line. A table that quietly stops at 200 teaches the reader
 *  that the dataset is 200 rows long, and every count they take off the screen afterwards is wrong.
 *
 *  ══ ⚠ A CONTROL THAT CANNOT WORK IS NOT DRAWN, AND THE REASON IS ══════════════════════════════
 *  「地図に描く」 goes through `window.IntMapGis.draw(id)` (js/gis-core.js) and never through the
 *  renderer, so a layer made by an ANALYSIS is the same object as a layer made by a dropped FILE —
 *  one list, one delete path, one Object List entry. Where a whole section cannot work (no storage
 *  for projects, ops module absent, no geodesy for an op that declares `needsGeodesy`) the section
 *  is drawn WITH the sentence that says why, because a dead control with no explanation is the
 *  defect this project keeps re-finding: the feature is not broken, it was never there.
 *
 *  ══ ⚠ (#R738) EVERY FACE THE LAYER GREW HAS A DOOR HERE ══════════════════════════════════════
 *  #R738 gave js/gis-datasets.js an editing face, js/gis-ops.js two attribute ops whose parameters
 *  are new KINDS of parameter, js/map-ui.js a classifier, and #R735 gave both runners a signal and a
 *  progress callback. An export nothing calls is not a feature — the finding #R735 recorded about
 *  js/gis-layers.js, which had been built, tested and documented while no reader could reach it — so
 *  each of those is opened from this file, and each is opened the way the rest of the panel is:
 *  · the three new parameter types are drawn by §1 from the DECLARATION. There is no form here that
 *    knows the word «join», and the next parameter type falls to the same fallback as before.
 *  · the editing controls ask js/gis-datasets.js's own gate (`editable`) what may be edited, and
 *    print ITS refusal — this file does not decide that an op's output is read-only, it is told.
 *  · the column types offered are the registry's own vocabulary, asked for rather than listed.
 *  · the expression's function list is `IntMapGisExpr.functions()`, which exists for this.
 *  · the colouring calls `window.GeoJSONUpload.style()` and draws the legend IT returns. The classes
 *    are not counted a second time here (#R650: two calculations of one fact always drift).
 *
 *  ══ WHY THE REFUSALS ARE SENTENCES HERE ═══════════════════════════════════════════════════════
 *  The three modules return a CODE, exactly as js/geo-import.js does, and `reasonText()` below is
 *  the same answer js/map-ui.js's importer gives: an op has no business knowing which UI it is in,
 *  and the reader needs a sentence rather than `clip-window-not-convex`. Every code js/gis-ops.js,
 *  js/gis-project.js and js/gis-core.js can produce has a row, each one names whatever the `detail`
 *  carries (the column, the parameter, the geometry that was expected, the count that was wanted),
 *  and an unrecognised code still becomes a sentence WITH the code in it — a refusal the reader
 *  cannot act on is a dead end, and one they cannot even quote is worse.
 *
 *  ── RULES THIS FILE OBEYS ─────────────────────────────────────────────────────────────────────
 *  · One panel, built once, refilled — `open()` twice is one element (`#gis-panel`).
 *  · Values reach the DOM through `textContent`, never through an HTML string.
 *  · Numbers are `toLocaleString`d in the reader's locale, and a unit is printed whenever the
 *    declaration states one — this file never converts, because it does not know what the op meant.
 *  · Calling `makeGisPanel()` where there is no `document` builds the API and touches nothing.
 * ==========================================================================*/

export function makeGisPanel(HOST) {
  return (function () {
    HOST = HOST || {};

    /* ── the environment, asked at use time ───────────────────────────────────────────────────
       Everything this panel talks to may be absent: in Node there is no document, and in the app
       the ops, project and core modules arrive when they arrive. A handle cached at construction
       time would be a permanent `null` for a module that loads one tick later, so every accessor
       asks now and answers `null` rather than throwing. */
    const doc = () => { try { return (typeof document !== 'undefined' && document) ? document : null; } catch (_) { return null; } };
    const DATA = () => { try { return window.IntMapData || null; } catch (_) { return null; } };
    const OPS = () => { try { return window.IntMapGisOps || null; } catch (_) { return null; } };
    const PROJ = () => { try { return window.IntMapGisProject || null; } catch (_) { return null; } };
    const CORE = () => { try { return window.IntMapGis || null; } catch (_) { return null; } };
    const UP = () => { try { return window.GeoJSONUpload || null; } catch (_) { return null; } };
    const GEODESY = () => { try { return window.IntMapGeodesy || null; } catch (_) { return null; } };
    /* js/gis-geometry.js. ⚠ PRESENT IS NOT READY: it fetches its sweep-line on first use, so the
       panel can only say 「まだ使えない」 before an op has ever run, and run() is what actually
       waits. Used to warn early, never to decide. */
    const GEOM = () => { try { return window.IntMapGisGeometry || null; } catch (_) { return null; } };
    /* js/gis-expr.js (#R738). Only the `expression` control asks for it, and only to LIST what can be
       written — the parse itself happens inside the op, so a missing module here costs the reader the
       function list and not the ability to type. */
    const EXPR = () => { try { return window.IntMapGisExpr || null; } catch (_) { return null; } };
    /* js/gis-export.js (#R756). Asked at use time like every other handle here: where it is absent
       the section is drawn WITH the sentence that says so, because a missing exit that says nothing
       is exactly the state this round found the GIS layer in.
       ⚠ AND IT IS FETCHED WHEN THE READER LOOKS AT THE WAY OUT, not when the panel mounts. The three
       file READERS (js/gis-shapefile.js · js/gis-geotiff.js · js/gis-geopackage.js) are already their
       own chunks for exactly this reason — a session that never exports should not carry the writer.
       ⚠ 天井を上げて自分の変更を通さない: js/lazy-modules.js:154 が「自分の変更に合わせて天井を
       上げるのは、その検査が捕まえるための動き」と書いており、`gis-core` の 322.2 kB がそれである。
       ⚠ 「まだ来ていない」と「来られなかった」は別の文で、読者には別のことが起きている。 */
    let exportPending = false, exportFailed = false;
    const EXPORT = () => {
      try { if (window.IntMapGisExport) return window.IntMapGisExport; } catch (_) { return null; }
      if (!exportPending && !exportFailed) {
        exportPending = true;
        /* ⚠ THE SPELLING IS `(await import(…)).NAME`, not `.then(m => m.NAME())`.
           tests/r175-checks ③ reads a dynamic import as an import OF A NAME only in that shape, and
           js/screenshot.js and js/geo-import.js already use it — a second spelling here would make
           the export read as dead code while it is being called. ⚠ その検査は散文の中の import も
           本物として読むので、ここに例を「書いて」はならない（書いた結果、存在しないモジュールを
           動的に読み込んでいると報告された）。 */
        (async () => {
          try { (await import('./gis-export.js')).makeGisExport(); } catch (_) { exportFailed = true; }
          exportPending = false;
          try { render(); } catch (_) { }
        })();
      }
      return null;
    };

    function nf(v) {
      const n = Number(v);
      if (!isFinite(n)) return String(v == null ? '' : v);
      try { return n.toLocaleString(window.IntMapLang.locale(HOST.lang)); } catch (_) { return String(n); }
    }

    /* ── chrome ───────────────────────────────────────────────────────────────────────────────
       ⚠ OPAQUE BY DEFAULT (#R261): `--card-bg` rather than `--popup-bg`, because this panel carries
       a TABLE, and digits read through 26 % of a moving map are not digits. */
    const CSS_PANEL = 'position:absolute;top:84px;right:24px;width:min(360px,94vw);max-height:min(74vh,660px);z-index:1500;display:none;flex-direction:column;background:var(--card-bg,#1c1c1e);border:1px solid var(--glass-border,rgba(128,128,128,0.28));border-radius:16px;overflow:hidden;box-shadow:0 18px 48px rgba(0,0,0,0.42);font-size:12.5px;color:var(--text-main,#f2f2f7);';
    const CSS_HEAD = 'flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:9px 12px;background:var(--input-bg,rgba(120,120,128,0.18));cursor:move;';
    const CSS_BODY = 'flex:1 1 auto;overflow:auto;-webkit-overflow-scrolling:touch;padding:11px 12px 15px;display:flex;flex-direction:column;gap:14px;';
    const CSS_SECT = 'display:flex;flex-direction:column;gap:7px;min-width:0;';
    const CSS_SECTH = 'font-size:10.5px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;color:var(--text-muted,#98989f);';
    const CSS_CARD = 'border:1px solid var(--glass-border,rgba(128,128,128,0.22));border-radius:12px;background:var(--input-bg,rgba(120,120,128,0.10));overflow:hidden;min-width:0;';
    const CSS_BTN = 'min-height:32px;padding:0 10px;border:1px solid var(--glass-border,rgba(128,128,128,0.28));background:var(--input-bg,rgba(120,120,128,0.18));color:var(--text-main,#f2f2f7);border-radius:9px;cursor:pointer;font-size:12px;line-height:1.2;';
    const CSS_BTNP = 'min-height:32px;padding:0 12px;border:1px solid var(--primary-color,#0a84ff);background:var(--primary-color,#0a84ff);color:#fff;border-radius:9px;cursor:pointer;font-size:12px;font-weight:600;line-height:1.2;';
    const CSS_BTND = 'min-height:32px;padding:0 10px;border:1px solid rgba(255,69,58,0.55);background:transparent;color:#ff453a;border-radius:9px;cursor:pointer;font-size:12px;line-height:1.2;';
    const CSS_IN = 'min-height:32px;width:100%;padding:0 8px;border:1px solid var(--glass-border,rgba(128,128,128,0.28));background:var(--input-bg,rgba(120,120,128,0.14));color:var(--text-main,#f2f2f7);border-radius:9px;font-size:12px;';
    const CSS_NOTE = 'font-size:11px;line-height:1.5;color:var(--text-muted,#98989f);overflow-wrap:anywhere;';
    const CSS_WARN = 'font-size:11px;line-height:1.5;color:#ff9f0a;overflow-wrap:anywhere;';

    function el(tag, css, text) {
      const d = doc(); if (!d) return null;
      const e = d.createElement(tag);
      if (css) e.style.cssText = css;
      e.style.boxSizing = 'border-box';
      if (text != null) e.textContent = String(text);
      return e;
    }
    function row(css) { return el('div', 'display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0;' + (css || '')); }

    /* ══ REFUSAL CODES → SENTENCES ════════════════════════════════════════════════════════════
       ⚠ THE SET IS THE UNION OF WHAT THE THREE MODULES RETURN — js/gis-ops.js, js/gis-project.js
       and js/gis-core.js — and the last line is not a fallthrough to silence: an unrecognised code
       still becomes a sentence and CARRIES the code, so what a reader saw can be reported rather
       than paraphrased. Where the `detail` names the thing that went wrong, the sentence names it
       too: a refusal that does not say WHICH column, WHICH parameter or WHICH geometry leaves the
       reader with nothing to change. */
    function reasonText(why, detail) {
      const code = String(why == null ? '' : why);
      const d = (detail && typeof detail === 'object') ? detail : {};
      const txt = (typeof detail === 'string') ? detail : '';
      const par = (v) => (v == null || v === '' ? '' : ' (' + String(v) + ')');

      /* ── js/gis-ops.js ───────────────────────────────────────────────────────────────────── */
      if (code === 'registry-missing') return window.IntMapLang.t(HOST.lang, 'The dataset registry is not loaded, so nothing can be read or written', 'データセット台帳が読み込まれていないため、読み書きができません', 'Das Datensatz-Register ist nicht geladen, daher ist kein Lesen oder Schreiben möglich', 'Реестр наборов данных не загружен, поэтому чтение и запись невозможны', 'El registro de conjuntos de datos no está cargado, así que no se puede leer ni escribir');
      /* ⚠ ONE SPELLING, AND IT IS THE ONE js/gis-ops.js ACTUALLY WRITES. This line briefly carried
         two (`unknown-op` and `op-unknown`) because the module was renamed mid-round, and a second
         spelling of one fact is a second fact: the dead one can never arrive, so it can never be
         found wrong, and the day the live one is renamed the table looks complete while the reader
         gets the fallback. The integration picked the live spelling and deleted the other. */
      if (code === 'op-unknown') return window.IntMapLang.t(HOST.lang, 'That analysis step is not registered', 'その処理は登録されていません', 'Dieser Analyseschritt ist nicht registriert', 'Этот шаг анализа не зарегистрирован', 'Ese paso de análisis no está registrado') + par(d.op);
      if (code === 'geodesy-missing') return window.IntMapLang.t(HOST.lang, 'The distance and area library this step needs has not loaded', 'この処理に必要な距離・面積の計算部品が読み込まれていません', 'Die für diesen Schritt nötige Distanz- und Flächenbibliothek ist nicht geladen', 'Библиотека расстояний и площадей, нужная этому шагу, не загружена', 'No se ha cargado la biblioteca de distancias y áreas que necesita este paso');
      if (code === 'input-count') return window.IntMapLang.t(HOST.lang, 'This step takes a different number of inputs', 'この処理が取る入力の数が違います', 'Dieser Schritt nimmt eine andere Anzahl von Eingaben', 'Этот шаг принимает другое число входов', 'Este paso toma otra cantidad de entradas')
        + ' (' + window.IntMapLang.t(HOST.lang, 'expected', '必要', 'erwartet', 'нужно', 'se esperan') + ': ' + nf(d.expected) + ' / ' + window.IntMapLang.t(HOST.lang, 'given', '指定', 'angegeben', 'указано', 'indicadas') + ': ' + nf(d.got) + ')';
      if (code === 'input-missing') return window.IntMapLang.t(HOST.lang, 'The input dataset is gone', '入力のデータセットがありません', 'Der Eingabedatensatz fehlt', 'Входной набор данных отсутствует', 'Falta el conjunto de datos de entrada') + par(d.id);
      if (code === 'geometry-type') return window.IntMapLang.t(HOST.lang, 'This step needs a different geometry', 'この処理には別の図形の種類が必要です', 'Dieser Schritt braucht eine andere Geometrie', 'Этому шагу нужна другая геометрия', 'Este paso necesita otra geometría')
        + ' (' + window.IntMapLang.t(HOST.lang, 'needs', '必要', 'braucht', 'нужно', 'necesita') + ': ' + String(d.expected == null ? '' : d.expected) + ' / ' + window.IntMapLang.t(HOST.lang, 'has', '実際', 'hat', 'фактически', 'tiene') + ': ' + String(d.geometryType == null ? '' : d.geometryType) + ')';
      if (code === 'missing-param') return window.IntMapLang.t(HOST.lang, 'A setting this step needs has not been filled in', 'この処理に必要な引数が入力されていません', 'Eine benötigte Einstellung wurde nicht ausgefüllt', 'Не заполнена настройка, нужная этому шагу', 'Falta rellenar un ajuste que necesita este paso') + par(d.param);
      if (code === 'bad-param') {
        let s = window.IntMapLang.t(HOST.lang, 'A setting is not a value this step can use', '引数が、この処理で使える値になっていません', 'Eine Einstellung ist kein für diesen Schritt brauchbarer Wert', 'Настройка содержит значение, непригодное для шага', 'Un ajuste no tiene un valor utilizable por este paso') + par(d.param);
        if (d.min != null && d.max != null) s += ' — ' + nf(d.min) + '–' + nf(d.max);
        else if (Array.isArray(d.values) && d.values.length) s += ' — ' + d.values.join(', ');
        return s;
      }
      if (code === 'unknown-condition-op') return window.IntMapLang.t(HOST.lang, 'That comparison is not one this filter knows', 'その比較演算子は、この絞り込みが知らないものです', 'Dieser Vergleich ist diesem Filter unbekannt', 'Такое сравнение фильтру неизвестно', 'Esa comparación no la conoce este filtro') + par(d.op);
      if (code === 'unknown-field') return window.IntMapLang.t(HOST.lang, 'That column is not in the input dataset', 'その列が入力データセットにありません', 'Diese Spalte gibt es im Eingabedatensatz nicht', 'Такого столбца нет во входном наборе данных', 'Esa columna no está en el conjunto de datos de entrada') + par(d.field);
      if (code === 'no-clip-polygons') return window.IntMapLang.t(HOST.lang, 'The second input holds no polygon to clip with', '2つ目の入力に、切り抜きに使える多角形がありません', 'Die zweite Eingabe enthält kein Polygon zum Zuschneiden', 'Во втором входе нет полигона для обрезки', 'La segunda entrada no tiene ningún polígono para recortar');
      if (code === 'output-column-in-use') return window.IntMapLang.t(HOST.lang, 'The input already has a column of that name, and the result would overwrite it', '入力に同じ名前の列が既にあり、結果がそれを上書きしてしまいます', 'Die Eingabe hat bereits eine Spalte dieses Namens; das Ergebnis würde sie überschreiben', 'Во входе уже есть столбец с таким именем — результат перезаписал бы его', 'La entrada ya tiene una columna con ese nombre y el resultado la sobrescribiría') + par(d.name);
      /* ⚠ THE THREE SENTENCES ABOVE THIS ONE WERE DELETED IN #R732, not renamed: `buffer-needs-points`,
         `clip-window-not-convex` and `clip-window-crosses-antimeridian` are not returned by anything
         any more. A sentence for a code that can never arrive can never be found wrong, which is the
         reason the note higher up gives for keeping exactly one spelling of each live one. */
      if (code === 'geometry-missing') return window.IntMapLang.t(HOST.lang, "The shape engine this step needs is not loaded", "この処理に必要な図形計算の部品が読み込まれていません", "Die für diesen Schritt nötige Geometrie-Engine ist nicht geladen", "Движок геометрии, нужный этому шагу, не загружен", "No está cargado el motor de formas que necesita este paso");
      if (code === 'geometry-unavailable') return window.IntMapLang.t(HOST.lang, "The shape engine could not be fetched, so this step was not run at all — this is not an empty result", "図形計算の部品を取得できなかったため、この処理は実行されていません。結果が0件だったのではありません", "Die Geometrie-Engine konnte nicht geladen werden; dieser Schritt lief gar nicht — das ist kein leeres Ergebnis", "Движок геометрии не удалось загрузить, поэтому шаг вообще не выполнялся — это не пустой результат", "No se pudo obtener el motor de formas, así que este paso no se ejecutó — no es un resultado vacío");
      if (code === 'input-stale') return window.IntMapLang.t(HOST.lang, "This input is out of date: a recomputation above it failed, so it still holds the earlier answer", "この入力は古いままです。上流の再計算が失敗したため、前の設定での結果が残っています", "Diese Eingabe ist veraltet: eine Neuberechnung darüber schlug fehl, sie hält noch das frühere Ergebnis", "Этот вход устарел: пересчёт выше по цепочке не удался, и в нём осталcя прежний результат", "Esta entrada está desactualizada: falló un recálculo anterior y conserva el resultado previo") + par(d.id);
      /* ⚠ (#R743) THE STEP RAN AND COULD NOT COMPUTE. Not 「該当なし」 — js/gis-geometry.js now says
         which of its own limits it hit, and that reason is carried here rather than flattened into
         an empty result the reader would have read as an answer about their data. */
      if (code === 'geometry-failed') return window.IntMapLang.t(HOST.lang, 'The geometry could not be computed, so this result would have been smaller than the answer', '幾何計算ができなかったため、この結果は本来の答えより小さくなってしまいます', 'Die Geometrie konnte nicht berechnet werden; dieses Ergebnis wäre kleiner als die Antwort', 'Геометрию вычислить не удалось, поэтому результат был бы меньше настоящего ответа', 'No se pudo calcular la geometría, por lo que este resultado sería menor que la respuesta') + par(d.why) + par(d.failed);
      if (code === 'unknown-predicate') return window.IntMapLang.t(HOST.lang, 'That spatial relation is declared but not wired to a test', 'その空間関係は宣言されていますが、判定に配線されていません', 'Diese räumliche Beziehung ist deklariert, aber nicht an einen Test angeschlossen', 'Это пространственное отношение объявлено, но не подключено к проверке', 'Esa relación espacial está declarada pero no conectada a una prueba') + par(d.predicate);
      if (code === 'inward-buffer-needs-area') return window.IntMapLang.t(HOST.lang, "A negative radius shrinks a shape inwards, and points and lines have no inside to shrink", "半径が負の値だと図形を内側へ縮めますが、点や線には縮める内側がありません", "Ein negativer Radius verkleinert eine Fläche nach innen; Punkte und Linien haben kein Inneres", "Отрицательный радиус сжимает фигуру внутрь, а у точек и линий нет внутренней части", "Un radio negativo encoge la forma hacia dentro, y los puntos y líneas no tienen interior") + par(d.geometryType);
      if (code === 'no-overlay-polygons') return window.IntMapLang.t(HOST.lang, "The second input holds no polygon to overlay with", "2つ目の入力に、重ね合わせに使える多角形がありません", "Die zweite Eingabe enthält kein Polygon zum Überlagern", "Во втором входе нет полигона для наложения", "La segunda entrada no tiene ningún polígono con el que superponer");
      if (code === 'no-features') return window.IntMapLang.t(HOST.lang, "That input holds nothing this step can work on", "その入力に、この処理が扱える地物がありません", "Diese Eingabe enthält nichts, womit dieser Schritt arbeiten kann", "В этом входе нет объектов, с которыми может работать шаг", "Esa entrada no contiene nada con lo que este paso pueda trabajar");
      if (code === 'op-not-wired') return window.IntMapLang.t(HOST.lang, "That step is declared but has no implementation in this build", "その処理は宣言されていますが、このビルドに実装がありません", "Dieser Schritt ist deklariert, hat in diesem Build aber keine Implementierung", "Этот шаг объявлен, но в этой сборке нет реализации", "Ese paso está declarado pero no tiene implementación en esta compilación") + par(d.op);
      /* ⚠ (#R752) NOT RUN, RATHER THAN RUN WITHOUT REPROJECTING. js/gis-ops.js refuses a step whose
         declaration says it needs the warp when that kernel is absent: running it anyway would put
         the answer somewhere on Earth nobody computed, which is worse than no answer. */
      if (code === 'warp-unavailable') return window.IntMapLang.t(HOST.lang, 'The reprojection module is not loaded, so this step was not run at all — nothing was placed by guesswork', '座標変換の部品が読み込まれていないため、この処理は実行していません。推測で配置することもしていません');
      /* ⚠ (#R752) THE TWO THE GRID STEPS STOP ON WITHOUT A REASON OF THEIR OWN. A kernel that
         refuses says why and that reason is carried verbatim; these two are the case where it
         stopped and named nothing, and saying so is the honest answer — the reader is told the
         step did not run, not that their grids have no answer. */
      if (code === 'align-failed') return window.IntMapLang.t(HOST.lang, 'The two grids could not be put on one common lattice, and the step stopped without naming a reason', '2つの格子を共通の格子に合わせられず、処理は理由を述べずに止まりました');
      if (code === 'resample-failed') return window.IntMapLang.t(HOST.lang, 'The resampling stopped without naming a reason', '再標本化が、理由を述べずに止まりました');
      if (code === 'calc-failed') return window.IntMapLang.t(HOST.lang, 'The grid calculation stopped without naming a reason', '格子の計算が、理由を述べずに止まりました');
      if (code === 'mosaic-failed') return window.IntMapLang.t(HOST.lang, 'Joining the two sheets stopped without naming a reason', '2枚の格子の結合が、理由を述べずに止まりました');
      if (code === 'rasterize-failed') return window.IntMapLang.t(HOST.lang, 'Burning the features onto the lattice stopped without naming a reason', '地物を格子に焼き込む処理が、理由を述べずに止まりました');
      if (code === 'polygonize-failed') return window.IntMapLang.t(HOST.lang, 'Tracing the regions stopped without naming a reason', '領域の抽出が、理由を述べずに止まりました');
      /* ⚠ (#R752) THE EXPRESSION RAN AND ANSWERED NOTHING, ANYWHERE. A grid of voids registered
         under the reader's own expression would look like a result; it is the 「もっともらしいものを
         描かない」 rule that makes this a refusal instead. The first error the kernel saw is carried,
         because that is the sentence that tells them which name or operator was wrong. */
      if (code === 'expr-failed-every-pixel') return window.IntMapLang.t(HOST.lang, 'The expression failed on every pixel, so no grid was made', '式がすべての画素で失敗したため、格子は作っていません') + par([d.pixels, d.error && d.error.why].filter((x) => x != null && x !== '').join(' · '));
      /* ⚠ (#R752) TWO GRIDS WITH NOTHING BETWEEN THEM. Touching is not overlapping — a common
         lattice of zero width is the same disjointness with a rounding error in front of it. */
      if (code === 'grids-disjoint') return window.IntMapLang.t(HOST.lang, 'The two grids do not overlap, so there is no common area to answer about', '2つの格子が重なっていないため、共通の範囲がありません');
      /* ⚠ (#R752) FROM THE GRID KERNEL — see js/gis-raster.js. A mosaic's overlap rule and a
         polygonize on a lattice whose rows are not latitudes are both 「読者が述べていない」 rather
         than 「データが悪い」, and the sentence has to say which. */
      if (code === 'merge-overlap-not-stated') return window.IntMapLang.t(HOST.lang, 'Say what the pixels both sheets cover should become — the rule is not chosen for you, because the answer depends on it', '両方の格子が覆っている画素をどうするかを指定してください。答えがそれで変わるので、こちらでは選びません') + par((d.overlaps || []).join(' / '));
      if (code === 'merge-overlap-unknown') return window.IntMapLang.t(HOST.lang, 'That is not one of the rules for overlapping pixels', 'それは重なった画素の扱い方として用意されていません') + par([d.overlap, (d.overlaps || []).join(' / ')].filter(Boolean).join(' · '));
      if (code === 'grid-not-degrees') return window.IntMapLang.t(HOST.lang, 'That grid has declared that its rows are not latitudes, so its regions cannot be placed on the Earth — convert it to degrees first', 'その格子は行が緯度ではないと述べているため、領域を地球上に置けません。先に度の格子へ変換してください');
      if (code === 'combine-fn-not-a-function') return window.IntMapLang.t(HOST.lang, 'The grid calculation was asked to run something that is not a calculation', '格子の計算に、計算ではないものが渡されました');
      /* ⚠ (#R752) MEASURING ON A NAMED PLANE. Both are about the coordinate system the reader
         asked to measure on, and neither is about their data: one is a part that did not load,
         the other a plane the kernel would not build — and it says why, so that reason is shown
         rather than flattened into 「引数が不正です」. */
      if (code === 'crs-unavailable') return window.IntMapLang.t(HOST.lang, 'The coordinate-conversion module did not load, so this step was not run at all — nothing was measured on a guessed plane', '座標変換の部品を読み込めなかったため、この処理は実行していません。推測した平面の上で測ることもしていません') + par(d.crs);
      /* ⚠ (#R783) 「精度を満たせない」と「精度を測れなかった」は別の答えである。前者は面の性質で、
         満たせる面が横に並ぶ（上限ではなく道・CONSTITUTION.md §5）。後者は**この データについて包絡を
         測れなかった**ので、要求は判定されていない——「満たした」でも「満たさない」でもない。
         この 2 つに同じ文を返すと、読者は数が無い理由を取り違える。 */
      if (code === 'crs-accuracy-outside-tolerance') return window.IntMapLang.t(HOST.lang, 'On that surface the number cannot be held to the accuracy you asked for, so none was produced — the surfaces that can are listed beside this', 'その面では、指定された精度を満たす数を出せないため、何も測っていません。満たせる面をこの横に挙げています') + par([d.what, d.surface, d.tolerance, d.worst].filter((x) => x != null && x !== '').join(' · '));
      if (code === 'crs-accuracy-unmeasured') return window.IntMapLang.t(HOST.lang, 'How far off the number could be could not be measured over this data, so your accuracy requirement was not judged at all', 'このデータについて、数がどれだけ外れるかを測れませんでした。指定された精度は判定していません') + par([d.what, d.surface, d.tolerance].filter((x) => x != null && x !== '').join(' · '));
      if (code === 'crs-plane-unusable') return window.IntMapLang.t(HOST.lang, 'That coordinate system could not be turned into a plane to measure on — name one this build can build, or leave it off to measure on the ellipsoid', 'その座標系から、測るための平面を作れませんでした。このビルドが作れる座標系を指定するか、指定を外して回転楕円体上で測ってください') + par([d.crs, d.why].filter((x) => x != null && x !== '').join(' · '));

      /* ── js/gis-datasets.js — a time declaration that did not hold (#R735, worded in #R738) ───
         ⚠ THESE NINE HAD NO SENTENCE FOR TWO ROUNDS, AND NOTHING NOTICED — because the gate that
         measures 「コードを足したら文も足す」 did not have js/gis-datasets.js in its population, and a
         gate's population is what decides what it cannot see. `timeRefused` is the field #R735 built
         so a declaration the data does not bear out is REFUSED rather than copied into the record;
         the panel shows it now, and a reader who names the wrong column is told which rule broke
         instead of silently getting a dataset that timeWindow will refuse later. */
      if (code === 'time-declaration-not-an-object') return window.IntMapLang.t(HOST.lang, 'The time declaration is not in a form this layer can read', '時刻の宣言が、この層が読める形になっていません', 'Die Zeitangabe hat keine Form, die diese Schicht lesen kann', 'Объявление времени задано в форме, которую слой прочитать не может', 'La declaración de tiempo no tiene una forma legible para esta capa');
      if (code === 'time-kind-unknown') return window.IntMapLang.t(HOST.lang, 'That is not a shape of time axis this layer knows', 'その時間軸の種類は、この層が知らないものです', 'Das ist keine Zeitachsen-Form, die diese Schicht kennt', 'Такой вид временной оси слою неизвестен', 'Esa no es una forma de eje temporal que esta capa conozca') + par(d.kind);
      if (code === 'time-kind-not-for-raster') return window.IntMapLang.t(HOST.lang, 'A grid has no rows to carry a time column, so only a time for the whole dataset can apply', '格子には時刻の列を持つ行が無いため、データセット全体の時刻しか指定できません', 'Ein Raster hat keine Zeilen für eine Zeitspalte — nur eine Zeit für den ganzen Datensatz ist möglich', 'У сетки нет строк для столбца времени, поэтому применимо только время всего набора', 'Una rejilla no tiene filas que lleven una columna de tiempo, así que solo cabe un tiempo para todo el conjunto') + par(d.kind);
      if (code === 'time-field-not-named') return window.IntMapLang.t(HOST.lang, 'The time declaration does not say which column holds the time', '時刻の宣言が、どの列を時刻とするかを述べていません', 'Die Zeitangabe nennt nicht die Spalte mit der Zeit', 'Объявление времени не указывает столбец со временем', 'La declaración de tiempo no dice qué columna contiene el tiempo');
      if (code === 'time-field-missing') return window.IntMapLang.t(HOST.lang, 'The column the time declaration names is not in the data', '時刻の宣言が指している列が、データにありません', 'Die in der Zeitangabe genannte Spalte fehlt in den Daten', 'Столбца, названного в объявлении времени, в данных нет', 'La columna que nombra la declaración de tiempo no está en los datos') + par(d.field);
      if (code === 'time-unreadable') return window.IntMapLang.t(HOST.lang, 'The values in that column do not read as times, so the declaration was refused rather than believed', 'その列の値が時刻として読めないため、宣言は信用せずに拒否しました', 'Die Werte dieser Spalte lesen sich nicht als Zeiten; die Angabe wurde abgelehnt statt geglaubt', 'Значения столбца не читаются как время, поэтому объявление отклонено, а не принято на веру', 'Los valores de esa columna no se leen como tiempos, así que la declaración se rechazó en vez de creerse')
        + par([d.field, d.example].filter((x) => x != null && x !== '').join(' · '));
      /* ⚠ (#R774) A PERIOD THAT ENDS BEFORE IT BEGINS IS NOT A PERIOD, and until this round it was
         stored as the dataset's own statement about itself. The sentence is en + jp
         (CONSTITUTION.md §7): this is IntMap writing, not an upstream's label being carried. */
      if (code === 'time-constant-reversed') return window.IntMapLang.t(HOST.lang, 'The period declared for the whole dataset ends before it begins, so it was refused rather than kept as the data’s own statement', 'データセット全体に宣言された期間が、始まりより前に終わっています。データ自身の主張として持たずに拒否しました') + par([d.start, d.end].filter((x) => x != null && x !== '').join(' → '));
      if (code === 'time-constant-empty') return window.IntMapLang.t(HOST.lang, 'A time for the whole dataset was declared without a readable start or end', 'データセット全体の時刻が宣言されましたが、読める開始も終了もありません', 'Eine Zeit für den ganzen Datensatz wurde ohne lesbaren Anfang oder Ende angegeben', 'Время для всего набора объявлено без читаемого начала или конца', 'Se declaró un tiempo para todo el conjunto sin inicio ni fin legibles');
      if (code === 'time-track-not-an-array') return window.IntMapLang.t(HOST.lang, 'A per-position time axis has to be a list of times running alongside the positions', '位置ごとの時間軸は、位置と並ぶ時刻の一覧である必要があります', 'Eine Zeitachse je Position muss eine Liste von Zeiten parallel zu den Positionen sein', 'Ось времени по позициям должна быть списком времён параллельно позициям', 'Un eje temporal por posición debe ser una lista de tiempos paralela a las posiciones') + par(d.field);
      /* ⚠ THE COUNTS ARE IN THE SENTENCE. One dropped position shifts every timestamp after it by
         one — the defect #R735 names — and 「4,001 対 4,000」 is what lets a reader see that rather
         than a vague 「軌跡の時刻が合いません」. */
      if (code === 'time-track-misaligned') return window.IntMapLang.t(HOST.lang, 'The list of times is not the same length as the positions, so every time after the gap would describe the wrong point', '時刻の一覧が位置の数と一致しないため、ずれた先の時刻がすべて別の点のものになります', 'Die Zeitliste ist nicht so lang wie die Positionen — ab der Lücke beschriebe jede Zeit den falschen Punkt', 'Список времён не совпадает по длине с позициями, поэтому после разрыва каждое время описывало бы не ту точку', 'La lista de tiempos no tiene la misma longitud que las posiciones, así que tras el hueco cada tiempo describiría otro punto')
        + par([d.field, (d.times != null && d.positions != null) ? (nf(d.times) + ' ≠ ' + nf(d.positions)) : null].filter(Boolean).join(' · '));

      /* ── js/gis-datasets.js — the editing layer (#R738) ───────────────────────────────────────
         ⚠ THE REFUSALS ARE THE FEATURE. Editing attributes is a small thing to implement and an easy
         thing to get wrong: the two that matter here say NO to work the reader is entitled to expect
         would be silently destructive. An op's output is the answer to its recipe, so editing it
         would make `setParams` quietly discard what was typed; a column another dataset was built
         from cannot be removed without making that recipe unrunnable. Both name the reason, and
         both name what the reader can do instead. */
      if (code === 'edit-needs-features') return window.IntMapLang.t(HOST.lang, 'A grid holds pixels, not attributes, so there is nothing here to edit', '格子が持つのは画素であって属性ではないため、編集できるものがありません', 'Ein Raster hält Pixel, keine Attribute — hier gibt es nichts zu bearbeiten', 'Сетка содержит пиксели, а не атрибуты, поэтому редактировать нечего', 'Una rejilla contiene píxeles, no atributos, así que aquí no hay nada que editar');
      if (code === 'edit-would-contradict-recipe') return window.IntMapLang.t(HOST.lang, 'This dataset is the result of a step, and its values are what that step produces — edit the imported data, or make a copy to edit', 'このデータセットは処理の結果で、値はその処理が出すものです。取り込んだ側を編集するか、編集用の複製を作ってください', 'Dieser Datensatz ist das Ergebnis eines Schritts; seine Werte sind dessen Ausgabe — bearbeiten Sie die importierten Daten oder eine Kopie', 'Этот набор — результат шага, и его значения производит этот шаг — редактируйте импортированные данные или копию', 'Este conjunto es el resultado de un paso y sus valores son lo que ese paso produce — edite los datos importados o una copia') + par(d.op);
      if (code === 'field-not-named') return window.IntMapLang.t(HOST.lang, 'No column was named', '列が指定されていません', 'Es wurde keine Spalte genannt', 'Столбец не указан', 'No se indicó ninguna columna');
      if (code === 'nothing-declared') return window.IntMapLang.t(HOST.lang, 'Nothing was declared about that column — give it a type, a unit, or both', 'その列について何も宣言されていません。型か単位か、その両方を指定してください', 'Über diese Spalte wurde nichts erklärt — geben Sie Typ, Einheit oder beides an', 'О столбце ничего не заявлено — укажите тип, единицу или и то и другое', 'No se declaró nada sobre esa columna — indique tipo, unidad o ambos');
      if (code === 'field-type-unknown') return window.IntMapLang.t(HOST.lang, 'That is not a column type this layer knows', 'その型は、この層が扱う列の型ではありません', 'Das ist kein Spaltentyp, den diese Schicht kennt', 'Такого типа столбца этот слой не знает', 'Ese no es un tipo de columna que esta capa conozca') + par(d.type);
      /* ⚠ THE COUNT AND AN EXAMPLE, because the declaration was refused by the DATA. A reader told
         only 「数値にできません」 has to go looking for the cell; told 「3 件・例: 01100」 they can see
         at once whether it is a code column or three typos. */
      if (code === 'field-type-refused') return window.IntMapLang.t(HOST.lang, 'The values in that column do not all read as that type, so the declaration was refused rather than written down as a fact', 'その列の値がすべてその型として読めないため、宣言は事実として記録せずに拒否しました', 'Nicht alle Werte dieser Spalte lesen sich als dieser Typ; die Angabe wurde abgelehnt statt als Tatsache festgehalten', 'Не все значения столбца читаются как этот тип, поэтому объявление отклонено, а не записано как факт', 'No todos los valores de esa columna se leen como ese tipo, así que la declaración se rechazó en vez de anotarse como un hecho')
        + par([d.type, d.bad != null ? (nf(d.bad) + '/' + nf(d.checked)) : null, d.example].filter((x) => x != null && x !== '').join(' · '));
      if (code === 'unit-not-a-string') return window.IntMapLang.t(HOST.lang, 'A unit has to be written as text', '単位は文字列で指定してください', 'Eine Einheit muss als Text angegeben werden', 'Единицу нужно задавать текстом', 'La unidad debe escribirse como texto');
      if (code === 'no-edits') return window.IntMapLang.t(HOST.lang, 'No changes were given', '変更が渡されていません', 'Es wurden keine Änderungen übergeben', 'Изменения не переданы', 'No se indicó ningún cambio');
      if (code === 'index-not-a-number') return window.IntMapLang.t(HOST.lang, 'A row has to be named by its position', '行は位置の番号で指定してください', 'Eine Zeile muss über ihre Position angegeben werden', 'Строка задаётся её позицией', 'Una fila se indica por su posición') + par(d.index);
      if (code === 'index-out-of-range') return window.IntMapLang.t(HOST.lang, 'There is no row at that position', 'その位置に行がありません', 'An dieser Position gibt es keine Zeile', 'В этой позиции строки нет', 'No hay ninguna fila en esa posición') + par(d.index != null ? (nf(d.index) + ' / ' + nf(d.count)) : null);
      if (code === 'value-undefined') return window.IntMapLang.t(HOST.lang, 'No value was given — to empty a cell, give it an empty text', '値が渡されていません。空にするには空文字列を渡してください', 'Es wurde kein Wert übergeben — zum Leeren einen leeren Text angeben', 'Значение не передано — чтобы очистить ячейку, передайте пустой текст', 'No se dio ningún valor — para vaciar una celda, use un texto vacío') + par(d.field);
      if (code === 'field-exists') return window.IntMapLang.t(HOST.lang, 'A column of that name is already there', 'その名前の列は既にあります', 'Eine Spalte dieses Namens gibt es bereits', 'Столбец с таким именем уже есть', 'Ya hay una columna con ese nombre') + par(d.field);
      if (code === 'field-in-time-axis') return window.IntMapLang.t(HOST.lang, "That column is the dataset's time axis — removing or renaming it would leave the declaration naming a column that is not there", 'その列はこのデータセットの時間軸です。消すか名前を変えると、宣言が存在しない列を指すことになります', 'Diese Spalte ist die Zeitachse des Datensatzes — Entfernen oder Umbenennen ließe die Angabe auf eine fehlende Spalte zeigen', 'Этот столбец — временная ось набора: удаление или переименование оставит объявление указывающим на несуществующий столбец', 'Esa columna es el eje temporal del conjunto — quitarla o renombrarla dejaría la declaración apuntando a una columna inexistente') + par(d.field);
      if (code === 'field-has-dependents') return window.IntMapLang.t(HOST.lang, 'Another dataset was built from this one, and it may be reading that column — delete the results first, or keep the column', 'このデータセットから作られた結果があり、その列を読んでいるかもしれません。先に結果を消すか、列を残してください', 'Aus diesem Datensatz wurde ein anderer gebaut, der diese Spalte lesen könnte — löschen Sie zuerst die Ergebnisse oder behalten Sie die Spalte', 'Из этого набора построен другой, который может читать этот столбец — сначала удалите результаты или оставьте столбец', 'De este conjunto se construyó otro que puede estar leyendo esa columna — borre primero los resultados o conserve la columna') + par(Array.isArray(d.dependents) ? d.dependents.join(', ') : d.field);
      /* ⚠ NOT A REFUSAL — IT IS WHY A RECORD IS MARKED. js/gis-datasets.js invalidates the dependents
         of an edited dataset with this reason, and the 「古いまま」 badge used to say `input-stale`
         («a recomputation above it failed») about it, which is a diagnosis of something that did not
         happen. What the reader has to do here is different too: re-run the step. */
      if (code === 'input-edited') return window.IntMapLang.t(HOST.lang, 'A dataset this was built from has been edited since, so this still holds the answer to the earlier values — recompute it', 'これを作った元のデータセットがその後編集されたため、これは編集前の値に対する結果のままです。再計算してください');
      if (code === 'nothing-to-undo') return window.IntMapLang.t(HOST.lang, 'There is nothing left to undo', '元に戻せる操作がありません', 'Es gibt nichts mehr rückgängig zu machen', 'Отменять больше нечего', 'No queda nada que deshacer');
      if (code === 'nothing-to-redo') return window.IntMapLang.t(HOST.lang, 'There is nothing to redo', 'やり直せる操作がありません', 'Es gibt nichts zu wiederholen', 'Повторять нечего', 'No hay nada que rehacer');
      if (code === 'edit-not-reversible') return window.IntMapLang.t(HOST.lang, 'That change cannot be undone from what was recorded, so it was left alone rather than half-applied', 'その変更は記録から元に戻せないため、中途半端に適用せずそのままにしました', 'Diese Änderung lässt sich aus dem Aufgezeichneten nicht rückgängig machen; sie blieb unangetastet statt halb angewendet', 'Это изменение нельзя отменить по записанному, поэтому оно оставлено как есть, а не применено наполовину', 'Ese cambio no se puede deshacer con lo registrado, así que se dejó intacto en vez de aplicarse a medias');
      /* ⚠ THREE THINGS SHARE ONE EMPTY `geometryType` — an empty dataset, a grid, and a table of rows
         that state no place — so the sentence has to say WHICH, and js/gis-datasets.js measures it
         (`withGeometry`) rather than inferring it. */
      if (code === 'input-has-no-geometry') return window.IntMapLang.t(HOST.lang, 'That input is a table: it has rows but no shapes, so a step that measures places cannot use it', 'その入力は表です。行はありますが図形が無いため、場所を測る処理では使えません', 'Diese Eingabe ist eine Tabelle: Zeilen ohne Formen — ein Schritt, der Orte misst, kann sie nicht verwenden', 'Этот вход — таблица: строки есть, а фигур нет, поэтому шаг, измеряющий места, её использовать не может', 'Esa entrada es una tabla: tiene filas pero no formas, así que un paso que mide lugares no puede usarla') + par(d.rows != null ? (nf(d.rows) + ' ' + window.IntMapLang.t(HOST.lang, 'rows', '行', 'Zeilen', 'строк', 'filas')) : null);

      /* ── the attribute steps (#R738) ──────────────────────────────────────────────────────────
         ⚠ EACH OF THESE NAMES WHAT TO CHANGE. A join that refuses without saying WHICH column
         collided, or WHICH key appeared twice, leaves the reader holding two files and no next move
         — and these two refusals exist precisely because the alternative (overwrite, or pick one) is
         a silently wrong table rather than an error. */
      if (code === 'join-column-collision') return window.IntMapLang.t(HOST.lang, 'The table brings a column the target already has — give the joined columns a prefix, or choose fewer of them', '結合先に同じ名前の列が既にあります。結合する列に接頭辞を付けるか、列を選び直してください', 'Die Tabelle bringt eine Spalte mit, die das Ziel schon hat — vergeben Sie ein Präfix oder wählen Sie weniger Spalten', 'Таблица приносит столбец, который уже есть в цели — задайте префикс или выберите меньше столбцов', 'La tabla aporta una columna que el destino ya tiene — ponga un prefijo o elija menos columnas') + par(Array.isArray(d.columns) ? d.columns.join(', ') : null);
      if (code === 'join-right-not-unique') return window.IntMapLang.t(HOST.lang, 'The same code appears more than once in the table, so each match would be ambiguous — say which row to take, or make the codes unique', '同じコードが表の中に複数回あるため、どの行に結合するかが決まりません。どの行を使うか指定するか、コードを一意にしてください', 'Derselbe Code kommt in der Tabelle mehrfach vor, daher wäre jede Zuordnung mehrdeutig — sagen Sie, welche Zeile gilt, oder machen Sie die Codes eindeutig', 'Один и тот же код встречается в таблице несколько раз, поэтому соответствие неоднозначно — укажите, какую строку брать, или сделайте коды уникальными', 'El mismo código aparece más de una vez en la tabla, así que cada coincidencia sería ambigua — indique qué fila tomar o haga únicos los códigos') + par(Array.isArray(d.keys) ? d.keys.join(', ') : d.field);
      if (code === 'compute-column-exists') return window.IntMapLang.t(HOST.lang, 'That column already exists — choose another name, or say explicitly that it should be replaced', 'その列は既にあります。別の名前にするか、置き換えることを明示してください', 'Diese Spalte existiert bereits — wählen Sie einen anderen Namen oder erlauben Sie das Ersetzen ausdrücklich', 'Такой столбец уже есть — выберите другое имя или явно разрешите замену', 'Esa columna ya existe — elija otro nombre o indique explícitamente que se reemplace') + par(d.field);
      /* ── js/gis-expr.js (#R738) ───────────────────────────────────────────────────────────────
         ⚠ HANDED BACK VERBATIM, like the grid kernel's above: 「式のどこが読めなかったか」 is the only
         sentence that tells the reader what to retype, and `at` is the character position the parser
         stopped at. A single 「式が正しくありません」 for all nine would be the paraphrase this table
         exists to avoid. */
      if (code === 'expr-unavailable') return window.IntMapLang.t(HOST.lang, 'The expression module is not loaded, so this step was not run at all', '式を読む部品が読み込まれていないため、この処理は実行されていません', 'Das Ausdrucks-Modul ist nicht geladen, daher lief dieser Schritt gar nicht', 'Модуль выражений не загружен, поэтому шаг вообще не выполнялся', 'El módulo de expresiones no está cargado, así que este paso no se ejecutó');
      if (code === 'expr-empty') return window.IntMapLang.t(HOST.lang, 'The expression is empty', '式が空です', 'Der Ausdruck ist leer', 'Выражение пустое', 'La expresión está vacía');
      if (code === 'expr-syntax') return window.IntMapLang.t(HOST.lang, 'The expression could not be read here', 'この位置で式を読み取れませんでした', 'Der Ausdruck konnte an dieser Stelle nicht gelesen werden', 'Выражение не удалось прочитать в этом месте', 'No se pudo leer la expresión en este punto')
        + par([d.at != null ? (window.IntMapLang.t(HOST.lang, 'position', '位置', 'Position', 'позиция', 'posición') + ' ' + nf(d.at)) : null, d.token, d.expected ? ('→ ' + d.expected) : null].filter(Boolean).join(' · '));
      if (code === 'expr-unterminated') return window.IntMapLang.t(HOST.lang, 'Something in the expression is left open — a quote or a bracket is never closed', '式の中に閉じていないものがあります（引用符か括弧）', 'Im Ausdruck bleibt etwas offen — ein Anführungszeichen oder eine Klammer', 'В выражении что-то не закрыто — кавычка или скобка', 'Algo queda abierto en la expresión — una comilla o un paréntesis') + par(d.token);
      if (code === 'expr-unknown-function') return window.IntMapLang.t(HOST.lang, 'There is no function by that name', 'その名前の関数はありません', 'Es gibt keine Funktion dieses Namens', 'Функции с таким именем нет', 'No existe ninguna función con ese nombre') + par(d.token);
      if (code === 'expr-arity') return window.IntMapLang.t(HOST.lang, 'That function was given the wrong number of arguments', 'その関数に渡した引数の数が違います', 'Diese Funktion hat die falsche Anzahl Argumente bekommen', 'Функции передано неверное число аргументов', 'Esa función recibió un número de argumentos incorrecto')
        + par([d.token, d.expected != null ? (window.IntMapLang.t(HOST.lang, 'expected', '必要', 'erwartet', 'нужно', 'se esperan') + ': ' + d.expected) : null, d.got != null ? (window.IntMapLang.t(HOST.lang, 'given', '指定', 'angegeben', 'указано', 'indicadas') + ': ' + nf(d.got)) : null].filter(Boolean).join(' · '));
      if (code === 'expr-no-number-rule') return window.IntMapLang.t(HOST.lang, 'The registry that decides what counts as a number is not loaded, and this expression will not guess', '何を数とみなすかを決める台帳が読み込まれていないため、式は推測せずに止まりました', 'Das Register, das entscheidet, was als Zahl gilt, ist nicht geladen — der Ausdruck rät nicht', 'Реестр, решающий, что считается числом, не загружен, и выражение не гадает', 'El registro que decide qué cuenta como número no está cargado, y la expresión no adivina');
      if (code === 'expr-type') return window.IntMapLang.t(HOST.lang, 'Arithmetic was asked of a value that is text — use concat() to join text', '文字列の値に算術を求めています。文字列をつなぐには concat() を使ってください', 'Arithmetik wurde auf einen Textwert angewendet — zum Verbinden von Text concat() verwenden', 'Арифметика применена к тексту — для соединения текста используйте concat()', 'Se pidió aritmética sobre un valor de texto — use concat() para unir texto') + par([d.op, d.value].filter((x) => x != null && x !== '').join(' '));
      if (code === 'expr-bad-ast') return window.IntMapLang.t(HOST.lang, 'That expression tree is not one this evaluator can read', 'その式の構造は、この評価器が読めるものではありません', 'Dieser Ausdrucksbaum ist für diesen Auswerter nicht lesbar', 'Такое дерево выражения этот вычислитель прочитать не может', 'Ese árbol de expresión no es legible para este evaluador');
      if (code === 'expr-internal') return window.IntMapLang.t(HOST.lang, 'The expression failed on a row for a reason it could not name', '式がある行で失敗しましたが、理由を名指しできませんでした', 'Der Ausdruck schlug in einer Zeile fehl, ohne den Grund benennen zu können', 'Выражение не сработало на строке по неназванной причине', 'La expresión falló en una fila por un motivo que no pudo nombrar') + par(d.message);

      /* ── js/gis-layers.js ────────────────────────────────────────────────────────────────── */
      if (code === 'map-unavailable') return window.IntMapLang.t(HOST.lang, "The map is not ready, so its layers cannot be handed over as data", "地図がまだ使えないため、レイヤーをデータとして受け取れません", "Die Karte ist nicht bereit, daher können ihre Ebenen nicht als Daten übergeben werden", "Карта не готова, поэтому её слои нельзя передать как данные", "El mapa no está listo, así que sus capas no se pueden entregar como datos");
      if (code === 'layer-unknown') return window.IntMapLang.t(HOST.lang, "There is no layer or map source by that name", "その名前のレイヤーも地図ソースもありません", "Es gibt keine Ebene und keine Kartenquelle dieses Namens", "Слоя или источника карты с таким именем нет", "No hay ninguna capa ni fuente de mapa con ese nombre") + par(d.id || d.layer);

      /* (#R765) manifest()/verify() are asked about an id, and 「その記録はもう無い」 is the one
         answer they can give that is about the reader's own state rather than about the data. */
      if (code === 'unknown-dataset') return window.IntMapLang.t(HOST.lang, 'There is no dataset with that id — it may have been removed or rebuilt under a new one', 'その ID のデータセットはありません。削除されたか、作り直されて別の ID になった可能性があります') + par(d.id);
      if (code === 'id-in-use') return window.IntMapLang.t(HOST.lang, 'A dataset with that id is already registered', 'その ID のデータセットは既に登録されています', 'Ein Datensatz mit dieser ID ist bereits registriert', 'Набор данных с таким идентификатором уже зарегистрирован', 'Ya hay un conjunto de datos registrado con ese identificador') + par(d.id);
      /* ⚠ (#R749) TWO CODES, ONE FACT FOR THE READER. js/gis-sources.js answers 'layer-not-visible'
         when a switched-off supplier returned nothing, and js/gis-layers.js translates it back to the
         older spelling at the door a reader actually reaches — but the code can arrive here directly
         from the acquisition layer too, and a refusal with no sentence is the defect
         tests/r729-gis-core-checks ④ exists for. The reader's action is the same in both: turn the
         layer on. */
      if (code === 'layer-not-visible') return window.IntMapLang.t(HOST.lang, 'That layer is switched off, so it answered with nothing — turn it on and try again', 'そのレイヤーは表示がオフなので、何も返しませんでした。オンにしてからもう一度お試しください') + par(d.layer || d.id);
      if (code === 'layer-not-sampling') return window.IntMapLang.t(HOST.lang, 'That layer is switched off, so it has no values to give — turn it on first', 'そのレイヤーは表示されていないため、渡せる値がありません。先に表示してください', 'Diese Ebene ist ausgeschaltet und hat daher keine Werte — schalten Sie sie zuerst ein', 'Слой выключен, поэтому значений нет — сначала включите его', 'Esa capa está apagada, así que no tiene valores — actívala primero') + par(d.id);
      if (code === 'layer-values-not-numeric') return window.IntMapLang.t(HOST.lang, 'That layer answers with text rather than numbers, so it cannot become a grid', 'そのレイヤーは数値ではなく文字列を返すため、格子にできません', 'Diese Ebene antwortet mit Text statt mit Zahlen und kann daher kein Raster werden', 'Слой отвечает текстом, а не числами, поэтому сетку из него не сделать', 'Esa capa responde con texto y no con números, así que no puede volverse una rejilla') + par(d.sample);
      /* ⚠ (#R763) THE SENTENCE ABOVE USED TO BE SAID ABOUT THESE TWO AS WELL, AND IT WAS FALSE FOR
         BOTH. A window of open ocean over a land-only field has values everywhere it has land and
         none here; an upstream that fell over has not told us anything about its numbers at all.
         Each states what happened and what the reader can do about it, which is different in each. */
      if (code === 'layer-values-all-missing') return window.IntMapLang.t(HOST.lang, 'That layer answered everywhere in this window and had no value anywhere in it — try a wider or different area', 'そのレイヤーはこの範囲のどこでも応答しましたが、値はどこにもありませんでした。範囲を広げるか、別の場所でお試しください') + par(d.empty);
      /* ⚠ (#R763) 「読み込めなかった」 is not 「表示されていない」. A row that can be read undrawn is
         read by fetching its document; when that fetch fails the reader's action is to retry, not to
         switch a layer on, and telling them to switch it on would send them somewhere that fixes
         nothing. */
      if (code === 'layer-load-failed') return window.IntMapLang.t(HOST.lang, 'That layer could not load its data — it does not need to be switched on, so try again in a moment', 'そのレイヤーのデータを読み込めませんでした。表示をオンにする必要はないので、少し待ってからもう一度お試しください') + par(d.id);
      if (code === 'layer-is-a-field') return window.IntMapLang.t(HOST.lang, 'That layer is a field of values, not a set of shapes — ask for it as a grid over a window', 'そのレイヤーは図形の集まりではなく値の場です。範囲を指定して格子として取得してください') + par(d.id);
      if (code === 'band-not-selectable') return window.IntMapLang.t(HOST.lang, 'That layer gives one value at a point, so there is no band to choose', 'そのレイヤーは 1 地点につき 1 つの値を返すため、選べるバンドがありません') + par(d.band);
      if (code === 'layer-sample-failed') return window.IntMapLang.t(HOST.lang, 'That layer was asked and could not answer — this is a failure to fetch, not an absence of data', 'そのレイヤーに問い合わせましたが応答が得られませんでした。データが無いのではなく、取得に失敗しています') + par(d.failed);
      if (code === 'cancelled') return window.IntMapLang.t(HOST.lang, 'Stopped before it finished, so nothing was registered', '完了前に中止したため、何も登録されていません', 'Vor dem Ende abgebrochen, daher wurde nichts registriert', 'Остановлено до завершения, поэтому ничего не зарегистрировано', 'Se detuvo antes de terminar, así que no se registró nada') + par(d.done != null ? (d.done + '/' + d.total) : null);

      /* ── js/gis-raster.js (#R735) ─────────────────────────────────────────────────────────────
         ⚠ THESE COME BACK VERBATIM. js/gis-ops.js hands the kernel's refusal on rather than rewriting
         it, for the same reason js/gis-project.js keeps an op's code: the reason a grid could not be
         read is the only sentence that tells the reader what to change. So they reach this panel, and
         tests/r729-gis-core-checks ④ scans that file for exactly that. */
      if (code === 'raster-unavailable') return window.IntMapLang.t(HOST.lang, 'The grid module is not loaded, so this step was not run at all', '格子計算の部品が読み込まれていないため、この処理は実行されていません', 'Das Raster-Modul ist nicht geladen, daher lief dieser Schritt gar nicht', 'Модуль сетки не загружен, поэтому шаг вообще не выполнялся', 'El módulo de rejilla no está cargado, así que este paso no se ejecutó');
      if (code === 'input-kind') return window.IntMapLang.t(HOST.lang, 'This step needs the other kind of data in that slot — features where it was given a grid, or the other way round', 'この処理はその入力に別の種類のデータを必要とします（地物のところに格子、またはその逆）', 'Dieser Schritt braucht in diesem Feld die andere Datenart — Objekte statt Raster oder umgekehrt', 'Этому шагу нужен другой вид данных в этом входе — объекты вместо сетки или наоборот', 'Este paso necesita el otro tipo de datos en esa entrada — objetos donde recibió una rejilla, o al revés') + par(d.expected ? (d.expected + ' ≠ ' + d.kind) : null);
      if (code === 'unknown-band') return window.IntMapLang.t(HOST.lang, 'That grid has no band of that name', 'その名前のバンドは、その格子にありません', 'Dieses Raster hat kein Band dieses Namens', 'В этой сетке нет полосы с таким именем', 'Esa rejilla no tiene ninguna banda con ese nombre') + par(d.band);
      /* ⚠ (#R739) 「描いた」は誰かが測った事実である。 This code exists because the renderer can accept a
         source and refuse every layer: production measured draw() answering ok:true with nothing on the
         map, and the reader then being told 'no-such-layer' when they asked to colour it. */
      if (code === 'draw-not-rendered') return window.IntMapLang.t(HOST.lang, 'This map view could not draw those shapes — switch to the flat map and try again', 'この地図表示ではその図形を描けませんでした。平面地図に切り替えてもう一度お試しください') + par(d.id);
      if (code === 'raster-invalid') return window.IntMapLang.t(HOST.lang, 'That grid does not describe a grid: one of its size or spacing fields is missing or not a positive number', 'その格子は格子の形になっていません（大きさか間隔のどれかが欠けている、または正の数ではない）', 'Dieses Raster beschreibt kein Raster: Größe oder Abstand fehlt oder ist nicht positiv', 'Эта сетка не описывает сетку: размер или шаг отсутствует либо не положителен', 'Esa rejilla no describe una rejilla: falta un tamaño o espaciado, o no es positivo') + par(d.field);
      if (code === 'raster-too-large') return window.IntMapLang.t(HOST.lang, 'This browser could not allocate a grid that size', 'このブラウザでは、その大きさの格子を確保できませんでした', 'Dieser Browser konnte kein Raster dieser Größe belegen', 'Браузер не смог выделить память под сетку такого размера', 'Este navegador no pudo asignar una rejilla de ese tamaño') + par(d.cells);
      if (code === 'band-out-of-range') return window.IntMapLang.t(HOST.lang, 'That grid has fewer bands than the one asked for', 'その格子には、指定された番号のバンドがありません', 'Dieses Raster hat weniger Bänder als angefragt', 'В сетке меньше полос, чем запрошено', 'Esa rejilla tiene menos bandas de la solicitada') + par(d.bandIndex);
      if (code === 'read-not-array' || code === 'read-length-mismatch') return window.IntMapLang.t(HOST.lang, 'The grid handed back samples that do not match the size it declares', '格子が、宣言している大きさと合わない標本を返しました', 'Das Raster gab Werte zurück, die nicht zu seiner angegebenen Größe passen', 'Сетка вернула значения, не соответствующие объявленному размеру', 'La rejilla devolvió muestras que no coinciden con el tamaño que declara') + par(d.length != null ? (d.length + ' ≠ ' + d.expected) : null);
      if (code === 'outside') return window.IntMapLang.t(HOST.lang, 'That point is not on this grid', 'その地点は、この格子の範囲外です', 'Dieser Punkt liegt nicht auf diesem Raster', 'Эта точка вне сетки', 'Ese punto no está en esta rejilla');
      if (code === 'position-invalid') return window.IntMapLang.t(HOST.lang, 'That position is not a pair of finite coordinates', 'その位置が、有限な経度緯度の組になっていません', 'Diese Position ist kein Paar endlicher Koordinaten', 'Эта позиция не является парой конечных координат', 'Esa posición no es un par de coordenadas finitas');
      if (code === 'row-out-of-range') return window.IntMapLang.t(HOST.lang, 'That row is outside the grid', 'その行は格子の外です', 'Diese Zeile liegt außerhalb des Rasters', 'Эта строка вне сетки', 'Esa fila está fuera de la rejilla') + par(d.row);
      if (code === 'sample-method-unknown') return window.IntMapLang.t(HOST.lang, 'That is not a sampling method this build knows', 'その標本の取り方は、このビルドが知らないものです', 'Diese Abtastmethode kennt dieser Build nicht', 'Такой способ выборки этой сборке неизвестен', 'Ese método de muestreo no lo conoce esta compilación') + par(d.method);
      if (code === 'zone-invalid' || code === 'zone-not-areal') return window.IntMapLang.t(HOST.lang, 'A zone has to be an area: a point or a line has no inside for the grid to be counted in', '区域は面である必要があります。点や線には、格子を数える内側がありません', 'Eine Zone muss eine Fläche sein: Punkt oder Linie haben kein Inneres', 'Зона должна быть площадью: у точки или линии нет внутренней части', 'Una zona debe ser un área: un punto o una línea no tienen interior') + par(d.type);
      if (code === 'zone-wraps-world') return window.IntMapLang.t(HOST.lang, 'That zone wraps the whole world, which leaves no inside and no outside — split it into two halves', 'その区域は地球を一周しており、内と外の区別がなくなります。東西 2 つに分けてください', 'Diese Zone umläuft die ganze Erde — es gibt kein Innen und Außen; teilen Sie sie in zwei Hälften', 'Эта зона огибает весь мир, поэтому нет ни внутри, ни снаружи — разделите её на две половины', 'Esa zona rodea todo el mundo, así que no hay dentro ni fuera — divídela en dos mitades');
      if (code === 'zone-degenerate-in-plane') return window.IntMapLang.t(HOST.lang, 'That zone encloses no area at all', 'その区域は、面積をまったく囲んでいません', 'Diese Zone umschließt keine Fläche', 'Эта зона не охватывает никакой площади', 'Esa zona no encierra ninguna área');
      if (code === 'values-not-integer') return window.IntMapLang.t(HOST.lang, 'Areas per class need a grid of codes, and this one holds measurements — rounding them would invent classes nobody defined', '区分ごとの面積には符号の格子が必要ですが、これは測定値です。丸めれば、誰も定義していない区分を作ってしまいます', 'Flächen je Klasse brauchen ein Raster aus Codes; dieses enthält Messwerte — Runden würde Klassen erfinden', 'Площади по классам требуют сетки кодов, а здесь измерения — округление придумало бы классы', 'Las áreas por clase necesitan una rejilla de códigos, y esta tiene medidas — redondear inventaría clases') + par(d.value);
      /* ══ ⚠⚠⚠ (#R783) THE CODES THIS ROUND ADDED, AND WHY THEY ARE SENTENCES AND NOT NUMBERS ══
         Three groups. ⑴ UNITS AND QUANTITY: js/gis-units.js can now say what a number MEANS (kind,
         space, time, period) and which totals are allowed, so `convert` / `aggregate` / `zonal`
         refuse instead of multiplying anyway — and a refusal that reaches a reader as
         «aggregation-refused» is not a refusal anybody can act on. ⑵ THE ONE-TO-MANY JOIN: the
         cardinality is required, so the reader has to be told what the three answers do. ⑶ THE
         ASSEMBLY OF THE RUNTIME (`scope-*` / `dependency-missing` / `kernel-not-reachable`): these
         come from makeGisRuntime() and normally reach a PROGRAM, not this panel — the browser door
         throws instead. They are written here anyway because the gate's subject is «no code reaches
         anyone without a sentence», and a sentence that is never shown costs one line while a
         missing one costs the reader the whole answer. ⚠ If a later round makes the assembly stage
         declare itself (a `stage` on the refusal), narrow the gate's population from THAT and
         delete these three — do not hand-write an exclusion list (#R707). */
      if (code === 'unit-not-stated') return window.IntMapLang.t(HOST.lang, 'Nobody has said what unit that column is in, so it cannot be converted — state the unit on the column, or name it in `from`', 'その列の単位を誰も述べていないので換算できません。列に単位を宣言するか、`from` で指定してください');
      if (code === 'unit-incompatible') return window.IntMapLang.t(HOST.lang, 'Those two units measure different quantities, so no factor connects them', 'その 2 つの単位は別の量の測定なので、両者をつなぐ係数はありません');
      if (code === 'unit-unreadable') return window.IntMapLang.t(HOST.lang, 'That unit is one this app has never been taught to read — it is not a mistake, it is a spelling with no rule behind it', 'その単位はこのアプリが読み方を教わっていないものです。間違いではなく、規則を持たない綴りです');
      if (code === 'unit-from-contradicts-column') return window.IntMapLang.t(HOST.lang, 'The unit you gave is not the one the column states about itself, and guessing which is right would change the numbers', '指定された単位は、その列自身が述べている単位と違います。どちらが正しいかの推測は数値を変えてしまいます');
      if (code === 'convert-nothing-numeric') return window.IntMapLang.t(HOST.lang, 'That column holds nothing that can be converted — every value read as text, not as a measurement', 'その列に換算できる値がありません。どの値も測定値ではなく文字列として読めました');
      if (code === 'units-unavailable') return window.IntMapLang.t(HOST.lang, 'The unit kernel is not loaded in this build, so what the numbers mean cannot be checked — and unchecked is not the same as allowed', 'この build には単位カーネルが読み込まれていないため、数値の意味を検査できません。検査できないことは「してよい」ではありません');
      if (code === 'aggregation-refused') return window.IntMapLang.t(HOST.lang, 'What these numbers mean does not allow that summary: a density cannot be added up, and a category has no total at all', 'これらの数値の意味はその集計を許しません。密度は足せず、区分には合計がありません');
      if (code === 'aggregation-needs-weight') return window.IntMapLang.t(HOST.lang, 'That average needs a weight to be meaningful — the refusal names the statistic that carries one', 'その平均は重みが無いと意味を持ちません。重みを持つ統計の名前を拒否の中で述べています');
      if (code === 'total-rule-refused') return window.IntMapLang.t(HOST.lang, 'That total is not one these numbers can produce — pick the rule that matches what they measure', 'その合計はこれらの数値からは作れません。測っているものに合う規則を選んでください');
      if (code === 'total-rule-does-not-fit-the-quantity') return window.IntMapLang.t(HOST.lang, 'That rule and what the band says it measures do not fit together, so the number would be the wrong number rather than a rounded one', 'その規則と、帯が述べている測定内容がかみ合いません。出てくる数は丸めた数ではなく、別の数になります');
      if (code === 'join-one-to-many') return window.IntMapLang.t(HOST.lang, 'One row matched several — say which answer you want: every pair, the first match only, or stop here', '1 行が複数に一致しました。どの答えが要るかを指定してください（すべての組、最初の 1 件だけ、またはここで中止）');
      if (code === 'scope-missing') return window.IntMapLang.t(HOST.lang, 'This GIS runtime was asked for without the one place its kernels live in', 'この GIS 実行環境は、カーネルが載る場所を渡されずに要求されました');
      if (code === 'scope-conflict') return window.IntMapLang.t(HOST.lang, 'Another set of kernels is already installed here, and replacing it silently would leave two answers to the same question', 'ここには既に別のカーネル一式が載っています。黙って置き換えると、同じ問いに 2 つの答えができます');
      if (code === 'scope-install-failed') return window.IntMapLang.t(HOST.lang, 'The kernels could not be installed, and nothing was left half-installed behind', 'カーネルを設置できませんでした。途中の状態は残していません');
      if (code === 'scope-not-writable') return window.IntMapLang.t(HOST.lang, 'The place the kernels would live in cannot be written to', 'カーネルを載せる場所に書き込めません');
      if (code === 'scope-carries-uninjected') return window.IntMapLang.t(HOST.lang, 'Something needed was found lying around rather than handed over, and this runtime uses only what it was given', '必要なものが「渡された」のではなく「その場に在った」ので使いません。この実行環境は渡されたものだけを使います');
      if (code === 'dependency-missing') return window.IntMapLang.t(HOST.lang, 'A part this runtime borrows was not supplied — the refusal names it and says what it is for', 'この実行環境が借りている部品が渡されていません。拒否の中に名前と用途を書いています');
      if (code === 'kernel-not-reachable') return window.IntMapLang.t(HOST.lang, 'A kernel says it was published but cannot be reached under its own name, so nothing here would have called it', 'あるカーネルは「公開した」と述べていますが、その名前で到達できません。誰も呼べない状態です');
      /* ⚠ (#R774) THE READER IS TOLD BOTH SPELLINGS, because 「単位が合いません」 about a twelve-term
         expression is not something anyone can act on. `verdict` separates 「別の量です」 from
         「この綴りが読めません」: the first is a mistake, the second is a unit this app has never been
         taught, and the fix for the two is not the same. Sentences are en + jp (CONSTITUTION.md §7). */
      if (code === 'unit-mismatch') return window.IntMapLang.t(HOST.lang, 'Those two are not measurements of the same thing, so one cannot be taken from the other', 'その 2 つは同じ量の測定ではないので、一方を他方から引くことはできません') + par([d.a, d.b].filter((x) => x != null).join(' / ') + (d.verdict === 'unknown' ? ' — unknown unit' : ''));
      if (code === 'grid-mismatch') return window.IntMapLang.t(HOST.lang, 'Those two grids are not the same grid, and a difference is not computed by quietly resampling one of them', 'その2つは同じ格子ではありません。差分のために黙って再標本化はしません', 'Die beiden Raster sind nicht dasselbe Raster; eine Differenz wird nicht durch stilles Neuabtasten gebildet', 'Эти две сетки не совпадают, а разность не считается молчаливым пересчётом одной из них', 'Esas dos rejillas no son la misma, y una diferencia no se calcula remuestreando en silencio') + par(d ? Object.keys(d).join(', ') : null);
      if (code === 'condition-invalid' || code === 'condition-value-invalid') return window.IntMapLang.t(HOST.lang, 'That test cannot be read as a comparison against a number', 'その条件は、数値との比較として読めません', 'Dieser Test ist nicht als Vergleich mit einer Zahl lesbar', 'Это условие нельзя прочесть как сравнение с числом', 'Esa prueba no se puede leer como una comparación con un número');
      if (code === 'condition-op-unknown') return window.IntMapLang.t(HOST.lang, 'That comparison is not one the grid filter knows', 'その比較演算子は、格子の絞り込みが知らないものです', 'Diesen Vergleich kennt der Rasterfilter nicht', 'Такое сравнение фильтру сетки неизвестно', 'Esa comparación no la conoce el filtro de rejilla') + par(d.op);
      if (code === 'sampler-spec-invalid' || code === 'sampler-not-a-function' || code === 'sampler-bounds-invalid' || code === 'sampler-size-invalid') return window.IntMapLang.t(HOST.lang, 'The description of the grid to bake is incomplete: it needs a window, a size and something that answers for a point', '焼き込む格子の指定が足りません（範囲・大きさ・地点に答えるものが必要）', 'Die Beschreibung des zu erzeugenden Rasters ist unvollständig: Fenster, Größe und ein Punktwert-Geber fehlen', 'Описание создаваемой сетки неполно: нужны окно, размер и источник значения в точке', 'La descripción de la rejilla está incompleta: hacen falta ventana, tamaño y algo que responda por un punto');
      if (code === 'mask-failed' || code === 'diff-failed' || code === 'zonal-failed') return window.IntMapLang.t(HOST.lang, 'The grid step stopped without naming a reason', '格子の処理が、理由を述べずに止まりました', 'Der Rasterschritt brach ohne Angabe eines Grundes ab', 'Шаг над сеткой прервался без указания причины', 'El paso sobre la rejilla se detuvo sin dar una razón');
      if (code === 'time-not-declared') return window.IntMapLang.t(HOST.lang, 'This dataset does not state which of its columns is time, so it cannot be narrowed to a period', 'このデータセットはどの列が時刻かを述べていないため、期間で絞り込めません', 'Dieser Datensatz sagt nicht, welche Spalte die Zeit ist, daher ist keine Einschränkung auf einen Zeitraum möglich', 'Набор не указывает, какой столбец — время, поэтому по периоду не отфильтровать', 'Este conjunto no dice qué columna es el tiempo, así que no se puede limitar a un periodo') + par(d.refused);

      /* ══ (#R819) js/gis-geometry.js — THE SHAPE ENGINE'S OWN VOCABULARY ════════════════════════
         ⚠ THESE SENTENCES WERE MISSING WHILE THE GATE WAS GREEN, and the reason is the one this
         repository keeps recording: tests/r729-gis-core-checks ④ read eight files, and the engine
         that actually refuses `coverage`, `union`, `buffer` and `relate` was not one of them.
         js/gis-ops.js hands this kernel's refusal back VERBATIM — on purpose, because 「どの図形の
         どこが計算できなかったか」 is the only sentence that tells the reader what to change, and a
         second spelling invented in the runner would be two names for one fact. So the codes arrive
         here exactly as the ops' own do, and #R819 widened the gate's population before writing a
         word of this block: a set that is written down after the sentences cannot tell anybody what
         was not being seen. Sentences are en + jp (CONSTITUTION.md §7). */
      if (code === 'clipper-unavailable') return window.IntMapLang.t(HOST.lang, 'The polygon engine has not been fetched, so this step was not run at all — this is not an empty result. Try it again once the page has finished loading', '多角形の計算部品を取得できていないため、この処理は実行されていません（結果が0件だったのではありません）。読み込みが終わってから、もう一度実行してください');
      if (code === 'clipper-failed') return window.IntMapLang.t(HOST.lang, 'The polygon engine stopped on these shapes rather than returning something it could not stand behind — run `repair` on the input and try this step again', 'この図形に対して多角形の計算が止まりました（根拠のない結果は返しません）。入力に `repair` をかけてから、もう一度実行してください') + par([d.op, d.message].filter((x) => x != null && x !== '').join(' · '));
      if (code === 'geometry-wraps-world') return window.IntMapLang.t(HOST.lang, 'One shape goes all the way round the world (a polar cap or a whole-world ring), and it has no ordinary outline to compute with — clip it to a window first, or split it into parts that do not wrap', 'その図形は地球を一周しています（極冠、または全球を囲む環）。通常の輪郭として計算できないので、先に範囲で切り抜くか、一周しない部分に分けてください') + par([d.operand != null ? ('input ' + nf(d.operand)) : null, d.feature != null ? ('#' + nf(d.feature)) : null, d.lngSpanDeg != null ? (nf(d.lngSpanDeg) + '°') : null].filter((x) => x != null).join(' · '));
      if (code === 'missing-geometry') return window.IntMapLang.t(HOST.lang, 'A row in the input carries no shape at all, so there is nothing to measure it against — filter those rows out, or use `validate` to see which they are', '入力の中に図形を持たない行があるため、比較する相手がありません。その行を絞り込みで外すか、`validate` でどの行かを確認してください');
      if (code === 'geodesy-unavailable') return window.IntMapLang.t(HOST.lang, 'The distance and area library this shape step needs has not loaded, so the measurement was not attempted', 'この図形処理に必要な距離・面積の計算部品が読み込まれていないため、測定そのものを行っていません');
      if (code === 'no-comparable-parts') return window.IntMapLang.t(HOST.lang, 'Neither shape holds a part the other can be measured against — one of them is empty once its rings are read', 'どちらの図形にも、相手と測り合える部分がありません。環まで読むと、片方が空になっています');
      if (code === 'bad-radius') return window.IntMapLang.t(HOST.lang, 'The radius has to be a real distance — 0 would be a copy of the input presented as a buffer', '半径には実際の距離が必要です。0 はバッファではなく入力そのものになってしまいます') + par(d.radiusKm);
      if (code === 'bad-tolerance') return window.IntMapLang.t(HOST.lang, 'A tolerance is a distance in km and cannot be negative or unreadable — leave it empty to measure exactly as written', '許容距離は km の距離で、負の数や読めない値は使えません。書かれたとおりに厳密に測るなら、空欄のままにしてください') + par([d.which, d.got].filter((x) => x != null && x !== '').join(' · '));
      if (code === 'coverage-nothing-asked') return window.IntMapLang.t(HOST.lang, 'Name at least one thing to look for — overlaps, gaps or edges. A run that asks nothing would answer 「問題なし」 about a question nobody put', '何を探すのかを 1 つ以上指定してください（重なり・隙間・境界）。何も訊かない実行は、誰も出していない問いに「問題なし」と答えてしまいます') + par((d.expected || []).join(' / '));
      if (code === 'coverage-unknown-condition') return window.IntMapLang.t(HOST.lang, 'Each condition takes one of the listed words: forbid (a violation), report (measure it without calling it wrong) or allow (do not look)', '各条件には、次のいずれかの語を指定してください: forbid（違反とする）／report（違反とはせずに測る）／allow（見ない）') + par([d.condition, d.got, (d.expected || []).join(' / ')].filter((x) => x != null && x !== '').join(' · '));
      if (code === 'coverage-bad-extent') return window.IntMapLang.t(HOST.lang, 'The ground these areas are supposed to cover was not given as a shape, so 「覆えていない部分」 has nothing to be measured against', '「覆っているはずの範囲」が図形として渡されていないため、覆えていない部分を測る相手がありません') + par(d.got);
      if (code === 'geometry-op-unavailable') return window.IntMapLang.t(HOST.lang, 'This build of the shape engine does not carry that operation — the refusal lists the ones it does carry', 'この構築の図形エンジンには、その演算がありません。持っている演算は拒否の中に挙げています') + par([d.op, (d.have || []).join(' / ')].filter((x) => x != null && x !== '').join(' · '));
      if (code === 'geometry-args-invalid') return window.IntMapLang.t(HOST.lang, 'That shape operation was called without the arguments it takes, so nothing was computed', 'その図形演算が引数の無いまま呼ばれたため、何も計算していません') + par([d.op, d.got].filter((x) => x != null && x !== '').join(' · '));

      /* ══ (#R819) js/gis-raster.js — THE FIVE THE OLD SCAN COULD NOT SEE ════════════════════════
         ⚠ js/gis-raster.js HAS BEEN IN THE GATE SINCE #R735 AND THESE FIVE WERE STILL INVISIBLE:
         the scan was taught three spellings (`why:`, `fail(`, `mismatchWhy:`) and this kernel raises
         through `refuse(`. A gate that measures the spellings it was taught is a gate whose reach is
         decided by a list somewhere, so #R819 made it find the refusal-maker in each file instead. */
      if (code === 'boundary-rule-unknown') return window.IntMapLang.t(HOST.lang, 'That is not one of the boundary rules — the refusal lists them, and which one you pick changes the area a zone is credited with', 'それは境界の扱いの規則にありません（拒否の中に一覧があります）。どれを選ぶかで、区域に数える面積が変わります') + par([d.boundary, (d.rules || []).join(' / ')].filter((x) => x != null && x !== '').join(' · '));
      if (code === 'fraction-needs-area-rule') return window.IntMapLang.t(HOST.lang, 'Counting a boundary pixel as a fraction means measuring how much of it the zone covers, and this build has no area rule to measure it with — use the whole-pixel rules instead', '境界の画素を割合で数えるには、その画素のどれだけを区域が覆うかを測る必要があり、この構築にはその面積規則がありません。画素まるごとで数える規則を使ってください');
      if (code === 'total-rule-unknown') return window.IntMapLang.t(HOST.lang, 'That is not one of the totals this step can produce — the refusal lists them, and they are different questions rather than different roundings', 'それは、この処理が出せる合計の種類にありません（拒否の中に一覧があります）。丸め方の違いではなく、別の問いです') + par([d.total, (d.rules || []).join(' / ')].filter((x) => x != null && x !== '').join(' · '));
      if (code === 'sample-cell-not-stated') return window.IntMapLang.t(HOST.lang, 'This sampling method reads an area, so it needs the shape of the cell to read — state the cell as a box or as a ring', 'この標本化の方法は面を読むため、読む範囲の形が必要です。セルを矩形または環として指定してください') + par([d.method, (d.forms || []).join(' / ')].filter((x) => x != null && x !== '').join(' · '));
      if (code === 'sample-cell-invalid') return window.IntMapLang.t(HOST.lang, 'The cell given is not a shape this step can read an area out of — a box needs four numbers in order, a ring needs at least three positions that enclose ground', '指定されたセルは、面積を読み取れる形になっていません。矩形なら順序どおりの4つの数、環なら面を囲む3つ以上の座標が必要です') + par([d.method, d.form, (d.forms || []).join(' / ')].filter((x) => x != null && x !== '').join(' · '));

      /* ══ (#R819) js/gis-warp.js — THE RESAMPLER, WHICH IS ALSO AN ANALYSIS STEP ════════════════
         ⚠ THE OLD NOTE IN tests/r729-gis-core-checks ④ SAID THIS FILE SURFACES THROUGH THE IMPORT
         PATH, AND THAT WAS HALF THE TRUTH: js/map-ui.js words what `to4326` returns when a file is
         read, and it is measured there (tests/r749-gis-raster-pipeline-checks ⑪). But `resample` and
         `mosaic` are STEPS ON THIS PANEL, and js/gis-ops.js hands this kernel's refusal back
         verbatim exactly as it does the grid kernel's — so the same codes arrive on this screen with
         no sentence at all. Two readers, one vocabulary: the import path keeps its wording, and this
         is the analysis path's. */
      if (code === 'affine-invalid' || code === 'affine-singular' || code === 'affine-missing') return window.IntMapLang.t(HOST.lang, 'This grid does not say where on the earth its pixels sit, or says it in a way that cannot be read back — a grid with no readable placement cannot be put onto another lattice', 'この格子は、画素が地球上のどこに載るかを述べていないか、読み戻せない形で述べています。位置が読めない格子は、別の格子に合わせられません') + par([d.field, d.reason, d.missing].filter((x) => x != null && x !== '').join(' · '));
      if (code === 'align-grid-rotated' || code === 'align-grid-not-north-up') return window.IntMapLang.t(HOST.lang, 'One of these grids is turned or flipped rather than lying north-up, and lining two lattices up by pretending otherwise would move every pixel — resample it onto a north-up lattice first', 'どちらかの格子が north-up ではなく、回転または反転しています。そうでないふりをして重ねると全画素がずれるので、先に north-up の格子へ再標本化してください') + par(d.which);
      if (code === 'align-needs-4326' || code === 'resample-source-not-4326') return window.IntMapLang.t(HOST.lang, 'This step works on grids in EPSG:4326, and this one is in something else — convert it when it is imported, so the conversion is recorded where it happened', 'この処理は EPSG:4326 の格子を対象にしています。別の座標系のものは、取り込みの時点で変換してください（変換が起きた場所に記録が残ります）') + par([d.which, d.crs].filter((x) => x != null && x !== '').join(' · '));
      if (code === 'align-rule-not-stated' || code === 'align-rule-unknown') return window.IntMapLang.t(HOST.lang, 'Say which of the two grids decides the shared lattice — the finer one, the coarser one, or the first. Choosing for you would decide how much detail the answer keeps', '共通の格子をどちらに合わせるかを指定してください（細かいほう・粗いほう・1つ目）。こちらで選ぶと、答えがどれだけ細かさを保つかを勝手に決めることになります') + par([d.rule, (d.rules || []).join(' / ')].filter((x) => x != null && x !== '').join(' · '));
      if (code === 'crs-not-stated') return window.IntMapLang.t(HOST.lang, 'This grid does not state which coordinate system it is in, and assuming one would place it by assertion — state it on the dataset', 'この格子は座標系を述べていません。仮定して置くのは根拠のない配置になるので、データセット側で座標系を述べてください') + par(d.which);
      if (code === 'bilinear-on-categorical') return window.IntMapLang.t(HOST.lang, 'This band holds categories, and averaging two categories invents a third — resample it with the nearest-value method', 'この帯は区分を保持しており、2つの区分を平均すると存在しない3つ目ができます。最近傍の方法で再標本化してください') + par([d.name, d.method].filter((x) => x != null && x !== '').join(' · '));
      if (code === 'block-invalid' || code === 'block-too-large') return window.IntMapLang.t(HOST.lang, 'The block of rows this run asked for cannot be held — it is being retried in smaller pieces, and a result that never arrives is refused rather than half-written', 'この実行が要求した行の塊を確保できません。より小さく分けて再試行しており、届かなかった結果は中途半端に書かずに拒否します') + par([d.cells != null ? (nf(d.cells) + ' cells') : null, d.rows != null ? (nf(d.rows) + ' rows') : null].filter((x) => x != null).join(' · '));
      if (code === 'extent-degenerate' || code === 'size-invalid' || code === 'pixel-size-underivable') return window.IntMapLang.t(HOST.lang, 'The window or the size asked for does not describe a grid: a window needs to enclose ground, and a width and height have to be whole counts above zero', '指定された範囲または大きさが格子になっていません。範囲は面を囲む必要があり、幅と高さは 1 以上の整数である必要があります') + par([d.field, d.value, Array.isArray(d.bbox) ? d.bbox.join(', ') : null].filter((x) => x != null && x !== '').join(' · '));
      if (code === 'warp-spans-world') return window.IntMapLang.t(HOST.lang, 'The window asked for goes right round the world, so its left and right edges are the same meridian — ask for less than a full turn', '指定された範囲が地球を一周しており、左右の端が同じ経線になります。一周未満の範囲を指定してください') + par(d.lngSpan);
      if (code === 'target-invalid') return window.IntMapLang.t(HOST.lang, 'The lattice to resample onto is incomplete — it needs a corner, a pixel size in both directions, and a whole-number width and height', '合わせ先の格子の指定が足りません。基準となる角・縦横それぞれの画素の大きさ・整数の幅と高さが必要です') + par([d.field, d.value].filter((x) => x != null && x !== '').join(' · '));
      if (code === 'resample-method-not-stated' || code === 'resample-method-unknown') return window.IntMapLang.t(HOST.lang, 'Name the resampling method — the refusal lists them, and they answer different questions: nearest keeps the value that is there, the others make a new one', '再標本化の方法を指定してください（拒否の中に一覧があります）。最近傍はそこにある値をそのまま保ち、他は新しい値を作るもので、答える問いが違います') + par([d.method, (d.methods || []).join(' / ')].filter((x) => x != null && x !== '').join(' · '));
      if (code === 'warp-accuracy-outside-tolerance' || code === 'warp-accuracy-unmeasured') return window.IntMapLang.t(HOST.lang, 'The grid this would produce could not be shown to be within the accuracy asked for, so it is refused instead of handed over as if it were — widen the tolerance deliberately, or resample a smaller window', '作られる格子が、指定された精度の中に収まることを示せませんでした。収まっているかのように渡さず拒否します。許容を意図して広げるか、より小さい範囲で実行してください') + par([d.of, d.measured != null ? (nf(d.measured) + ' > ' + nf(d.tolerance)) : d.reason].filter((x) => x != null && x !== '').join(' · '));
      if (code === 'warp-area-tolerance-invalid' || code === 'warp-footprint-tolerance-invalid' || code === 'warp-footprint-tolerance-not-stated') return window.IntMapLang.t(HOST.lang, 'This run measures how far it may be off before it refuses, so the tolerance has to be stated as a number above zero — there is no default, because a default would be this app choosing how wrong the answer may be', 'この実行は「どこまでずれたら拒否するか」を測るため、許容値を 0 より大きい数で述べる必要があります。既定値はありません（既定を置くことは、答えの誤りの許容量をこちらが決めることになります）') + par([d.areaTolerance, d.footprintTolerance, d.footprint, d.unit].filter((x) => x != null && x !== '').join(' · '));
      if (code === 'warp-footprint-unknown' || code === 'warp-footprint-not-areal' || code === 'warp-footprint-unsupported') return window.IntMapLang.t(HOST.lang, 'Reading the ground a target pixel covers needs a method that reads an area and a footprint this build can draw — the refusal names the ones it has', '出力の画素が覆う範囲を読むには、面を読む方法と、この構築が描ける形が要ります。持っているものは拒否の中に挙げています') + par([d.footprint, d.method, (d.modes || d.forms || []).join(' / ')].filter((x) => x != null && x !== '').join(' · '));
      if (code === 'warp-budget-invalid' || code === 'warp-budget-not-stated') return window.IntMapLang.t(HOST.lang, 'This run hands its rows out as they are made, and it will not start without being told how much memory it may hold at once — stating none would make 「予算を超えた」 unmeasurable rather than untrue', 'この実行は行を作りながら渡すため、一度に保持してよいメモリ量を述べないと開始しません。述べない場合、「予算を超えた」ことが偽になるのではなく測れなくなります') + par([d.budgetBytes, d.reason, (d.from || []).join(' / ')].filter((x) => x != null && x !== '').join(' · '));
      if (code === 'warp-library-missing') return window.IntMapLang.t(HOST.lang, 'A part of the resampler was not handed to the thread that runs it, so the run was refused rather than quietly done another way', '再標本化の部品が、それを実行するスレッドへ渡されていません。黙って別の方法で実行せず、拒否しました') + par(d.missing);
      if (code === 'warp-sink-invalid') return window.IntMapLang.t(HOST.lang, 'The place the output was to be written to does not answer the calls a writer has to answer, so nothing was started', '出力の書き出し先が、書き出し側として必要な呼び出しに答えられません。実行を開始していません') + par([d.field, d.missing].filter((x) => x != null && x !== '').join(' · '));
      if (code === 'warp-sink-failed') return window.IntMapLang.t(HOST.lang, 'The place the output was being written to stopped part way, so the grid is incomplete and is not being handed back as a finished one — run the step again', '出力の書き出し先が途中で止まったため、格子は不完全です。完成したものとしては返しません。もう一度実行してください') + par([d.at, d.row0 != null ? ('row ' + nf(d.row0)) : null, d.why, d.error].filter((x) => x != null && x !== '').join(' · '));
      if (code === 'walk-ended') return window.IntMapLang.t(HOST.lang, 'The run over the output rows ended before the grid was finished, and the reason it ended is carried with it rather than replaced by this one', '出力の行を走る処理が、格子を作り終える前に終了しました。終了の理由はこの語で置き換えず、そのまま一緒に運んでいます');
      if (code === 'worker-answer-malformed') return window.IntMapLang.t(HOST.lang, 'The other thread answered in a shape this step cannot read, so its answer was refused rather than half-read — the same rows are being computed on this thread instead', '別スレッドの答えが読み取れない形だったため、中途半端に読まずに拒否しました。同じ行はこちらのスレッドで計算し直しています') + par([d.row0 != null ? ('row ' + nf(d.row0)) : null, d.rows != null ? (nf(d.rows) + ' rows') : null].filter((x) => x != null).join(' · '));

      /* ── js/gis-project.js ───────────────────────────────────────────────────────────────── */
      if (code === 'storage-unavailable') return window.IntMapLang.t(HOST.lang, 'This browser is not letting the page store anything, so projects cannot be saved', 'このブラウザが保存を許可していないため、プロジェクトを保存できません', 'Dieser Browser lässt kein Speichern zu, daher können Projekte nicht gesichert werden', 'Браузер не разрешает сохранение, поэтому проекты сохранить нельзя', 'Este navegador no permite almacenar datos, así que no se pueden guardar proyectos');
      if (code === 'nothing-to-save') return window.IntMapLang.t(HOST.lang, 'A project saves the steps, and no step has been run yet', 'プロジェクトが保存するのは処理の手順で、処理がまだ1つも実行されていません', 'Ein Projekt speichert die Schritte, und es wurde noch keiner ausgeführt', 'Проект сохраняет шаги, а не выполнен ещё ни один', 'Un proyecto guarda los pasos y aún no se ha ejecutado ninguno');
      if (code === 'not-found') return window.IntMapLang.t(HOST.lang, 'That project is not in the store any more', 'そのプロジェクトは保存領域にもうありません', 'Dieses Projekt ist nicht mehr im Speicher', 'Этого проекта больше нет в хранилище', 'Ese proyecto ya no está en el almacén');
      if (code === 'read-failed') return window.IntMapLang.t(HOST.lang, 'The store could not be read', '保存領域から読み出せませんでした', 'Der Speicher konnte nicht gelesen werden', 'Не удалось прочитать хранилище', 'No se pudo leer el almacén') + par(txt || d.message);
      if (code === 'write-failed') return window.IntMapLang.t(HOST.lang, 'The store could not be written to', '保存領域へ書き込めませんでした', 'In den Speicher konnte nicht geschrieben werden', 'Не удалось записать в хранилище', 'No se pudo escribir en el almacén') + par(txt || d.message);
      if (code === 'add-failed') return window.IntMapLang.t(HOST.lang, 'The result could not be registered as a dataset', '結果をデータセットとして登録できませんでした', 'Das Ergebnis konnte nicht als Datensatz registriert werden', 'Результат не удалось зарегистрировать как набор данных', 'No se pudo registrar el resultado como conjunto de datos') + par(txt || d.message);
      if (code === 'ops-unavailable') return window.IntMapLang.t(HOST.lang, 'The analysis module is not loaded, so the steps cannot be run again', '処理モジュールが読み込まれていないため、手順を再実行できません', 'Das Analysemodul ist nicht geladen, daher lassen sich die Schritte nicht erneut ausführen', 'Модуль анализа не загружен, поэтому шаги нельзя выполнить снова', 'El módulo de análisis no está cargado, así que los pasos no se pueden volver a ejecutar');
      if (code === 'op-failed') return window.IntMapLang.t(HOST.lang, 'The step stopped part way through', '処理が途中で止まりました', 'Der Schritt ist mittendrin abgebrochen', 'Шаг прервался на середине', 'El paso se detuvo a medio camino') + par(txt || d.message);
      if (code === 'upstream-failed') return window.IntMapLang.t(HOST.lang, 'An earlier step failed, so this one was never run', '前の処理が失敗したため、この処理は実行されていません', 'Ein früherer Schritt ist fehlgeschlagen, daher wurde dieser nie ausgeführt', 'Предыдущий шаг не удался, поэтому этот не выполнялся', 'Un paso anterior falló, así que este no llegó a ejecutarse');
      if (code === 'not-an-op') return window.IntMapLang.t(HOST.lang, 'This dataset came from a file, not from a step, so it has no settings to change', 'このデータセットは処理の結果ではなく取り込んだものなので、変えられる引数がありません', 'Dieser Datensatz stammt aus einer Datei, nicht aus einem Schritt, und hat keine Einstellungen', 'Этот набор получен из файла, а не из шага, поэтому у него нет настроек', 'Este conjunto viene de un archivo, no de un paso, así que no tiene ajustes que cambiar');
      if (code === 'no-such-dataset') return window.IntMapLang.t(HOST.lang, 'That dataset is not registered any more', 'そのデータセットはもう登録されていません', 'Dieser Datensatz ist nicht mehr registriert', 'Этот набор данных больше не зарегистрирован', 'Ese conjunto de datos ya no está registrado') + par(d.id);
      if (code === 'cycle') return window.IntMapLang.t(HOST.lang, 'That would make a step depend on its own result', 'それでは処理が自分自身の結果を入力にしてしまいます', 'Damit würde ein Schritt von seinem eigenen Ergebnis abhängen', 'Тогда шаг зависел бы от собственного результата', 'Eso haría que un paso dependiera de su propio resultado');

      /* ── js/gis-sources.js — the supplier contract (#R752) ─────────────────────────────────
         ⚠ THESE ARE ABOUT THE SUPPLIER, NOT ABOUT THE DATA. A reader who asked for a filtered or
         a continued fetch and got 「取得できませんでした」 would go looking at their conditions;
         what actually happened is that this particular supplier cannot do that, and the sentence
         has to say so — and say what is left to try, because in every one of these cases there is
         something (drop the condition, fetch the lot, use the slow door, look at the supplier). */
      if (code === 'where-not-supported') return window.IntMapLang.t(HOST.lang, 'That supplier cannot narrow a fetch by attribute — fetch without the condition, and filter the result afterwards', 'この供給元は属性の条件で絞り込めません。条件なしで取得してから、結果を絞り込んでください') + par(d.id);
      if (code === 'cursor-not-supported') return window.IntMapLang.t(HOST.lang, 'That supplier cannot resume, so there is no page to continue from — fetch it in one go', 'この供給元は途中から再開できないため、続きを取得できません。一度にまとめて取得してください') + par(d.id);
      if (code === 'supplier-is-async') return window.IntMapLang.t(HOST.lang, 'That supplier does not answer immediately — ask for it as a fetch that takes time, not as an answer on the spot', 'この供給元は即座には答えません。その場で答えを得るのではなく、時間のかかる取得として実行してください') + par(d.id);
      if (code === 'supplier-failed') return window.IntMapLang.t(HOST.lang, 'The supplier itself stopped part way through, so nothing was fetched — this is not an empty answer about your area', '供給元の取得そのものが途中で止まったため、何も取得していません。これは、その範囲に何も無いという答えではありません') + par([d.id, d.message].filter((x) => x != null && x !== '').join(' · '));
      if (code === 'supplier-answer-invalid') return window.IntMapLang.t(HOST.lang, 'The supplier answered in a shape the contract does not have, so its answer was refused rather than half-read', '供給元が契約どおりの形で答えなかったため、その答えは中途半端に読まずに拒否しました') + par([d.id, d.expected, d.got].filter((x) => x != null && x !== '').join(' · '));

      /* ⚠ (#R819) 取得の実行計画についての 2 文。どちらも「取れなかった」ではなく「その条件では
         答えにならない」と述べる——前者は上流が全件を渡しきれないのに後段の条件を名乗ることになる
         場合（取れた分だけを答えにすると、読者は自分が指定した条件で世界を見たと信じる）、後者は
         いま画面に出ているものが答えになってしまう場合（カメラを動かすと同じ問いの母集団が変わる）。 */
      if (code === 'plan-unsatisfiable') return window.IntMapLang.t(HOST.lang, 'The upstream could not hand over the whole of the area you named, so a condition applied afterwards would describe only the part that arrived — narrow the area, or use a supplier that can be read to the end', '指定した範囲の全部を上流から受け取れなかったため、そのあとに条件を適用しても、届いた分についてしか述べられません。範囲を狭めるか、最後まで読み切れる供給元を使ってください') + par([d.id, d.reason].filter((x) => x != null && x !== '').join(' · '));
      if (code === 'renderer-view-dependent') return window.IntMapLang.t(HOST.lang, 'That data is only what the map currently holds, so the answer would change when the view moves — this request asked for data that does not depend on the screen', 'そのデータは地図がいま保持している分だけなので、表示を動かすと答えが変わります。この要求は、画面に依存しないデータを求めています') + par([d.id, d.reason].filter((x) => x != null && x !== '').join(' · '));


      /* ── js/gis-export.js — the way out (#R756) ────────────────────────────────────────────
         ⚠ EVERY ONE OF THESE IS A SENTENCE THE READER CAN ACT ON, because every one of them has a
         next move: choose a format, choose a band, choose a sample type, or state a missing value.
         A 「書き出せませんでした」 over sixteen causes would leave a reader with a dataset they can
         see and cannot take anywhere — which is the defect this whole path exists to remove.
         ⚠ en + jp only (CONSTITUTION.md §7, 2026-09-11): IntMap's own prose is authored in two. */
      if (code === 'export-registry-missing') return window.IntMapLang.t(HOST.lang, 'The dataset registry is not loaded, so there is nothing to write out', 'データセット台帳が読み込まれていないため、書き出す対象がありません');
      if (code === 'export-dataset-missing') return window.IntMapLang.t(HOST.lang, 'That dataset is not registered any more, so nothing was written', 'そのデータセットはもう登録されていないため、何も書き出していません') + par(d.id);
      if (code === 'export-format-not-named') return window.IntMapLang.t(HOST.lang, 'Choose a file format — they keep different things, so one is not chosen for you', '書き出す形式を選んでください。形式ごとに保てるものが違うので、こちらでは選びません') + par((d.formats || []).join(' / '));
      if (code === 'export-format-unknown') return window.IntMapLang.t(HOST.lang, 'That is not a format this build can write', 'それは、このビルドが書き出せる形式ではありません') + par([d.format, (d.formats || []).join(' / ')].filter(Boolean).join(' · '));
      if (code === 'export-format-not-for-kind') return window.IntMapLang.t(HOST.lang, 'That format cannot hold this kind of data — a grid is not a list of shapes, and a list of shapes is not a grid', 'その形式では、この種類のデータを保持できません。格子は図形の一覧ではなく、図形の一覧は格子ではありません') + par([d.format, d.kind].filter(Boolean).join(' · '));
      if (code === 'export-empty') return window.IntMapLang.t(HOST.lang, 'There is nothing to write — a file with nothing in it would look tomorrow like an analysis that produced nothing', '書き出すものがありません。中身の無いファイルは、後日「処理の結果が0件だった」と読めてしまいます');
      if (code === 'export-band-out-of-range') return window.IntMapLang.t(HOST.lang, 'This grid does not have that band', 'この格子には、そのバンドがありません') + par([d.band, d.bands].filter((x) => x != null).join(' / '));
      if (code === 'export-band-unreadable') return window.IntMapLang.t(HOST.lang, 'The grid did not hand back a full band, so nothing was written — a short band written as an image would shift every row after the gap', 'バンドの値を最後まで取得できなかったため、何も書き出していません。足りないまま書くと、欠けた先の行がすべてずれます') + par([d.band, d.got != null ? (nf(d.got) + ' / ' + nf(d.expected)) : d.message].filter((x) => x != null && x !== '').join(' · '));
      if (code === 'export-datatype-unknown') return window.IntMapLang.t(HOST.lang, 'That is not a sample type this build writes', 'それは、このビルドが書き出せる数値の型ではありません') + par([d.dataType, (d.dataTypes || []).join(' / ')].filter(Boolean).join(' · '));
      if (code === 'export-value-out-of-range') return window.IntMapLang.t(HOST.lang, 'A value does not fit the whole-number type chosen, and truncating it would write a different grid — choose a wider type, or a floating-point one', '選ばれた整数型に収まらない値があります。切り捨てれば別の格子になるので、より広い型か小数の型を選んでください') + par([d.value, d.dataType, d.pixel != null ? ('#' + nf(d.pixel)) : null].filter((x) => x != null).join(' · '));
      if (code === 'export-missing-not-representable') return window.IntMapLang.t(HOST.lang, 'This grid has missing pixels and the whole-number type has no way to say so — 0 is a sea-level elevation and a rainless day, so it is not written. Choose a floating-point type, or state a no-data value on the band', 'この格子には欠損した画素があり、整数型にはそれを表す値がありません。0 は「標高0m」「降水量0」であって欠損ではないので書きません。小数の型を選ぶか、バンドに欠損値を指定してください') + par([d.dataType, d.pixel != null ? ('#' + nf(d.pixel)) : null].filter((x) => x != null).join(' · '));
      if (code === 'export-nodata-conflict') return window.IntMapLang.t(HOST.lang, 'The bands state different no-data values, and one file can only carry one — write them as separate files', 'バンドごとに欠損値が違い、1つのファイルには1つしか書けません。バンドを分けて書き出してください') + par((d.values || []).join(' / '));
      if (code === 'export-nodata-not-representable') return window.IntMapLang.t(HOST.lang, 'The no-data value this band states does not fit the sample type chosen', 'このバンドが述べている欠損値は、選ばれた数値の型に収まりません') + par([d.nodata, d.dataType].filter((x) => x != null).join(' · '));
      if (code === 'export-crs-unsupported') return window.IntMapLang.t(HOST.lang, 'This writer states EPSG:4326 in the file, and this grid is in something else — converting it silently would place it by assertion', 'この書き出しはファイルに EPSG:4326 と記します。この格子は別の座標系なので、黙って変換すると根拠のない場所に置くことになります') + par(d.crs);
      if (code === 'export-geometry-mixed-dimensions') return window.IntMapLang.t(HOST.lang, 'One shape mixes 2-D and 3-D positions, and a WKT column states one or the other — export it as GeoJSON, which carries both', '1つの図形の中で2次元と3次元の座標が混ざっています。WKT の列はどちらか一方しか述べられないため、両方を運べる GeoJSON で書き出してください') + par(d.geometryType);
      if (code === 'export-serialise-failed') return window.IntMapLang.t(HOST.lang, 'A value in this dataset could not be written into a file', 'このデータセットの値のうち、ファイルに書けないものがありました') + par([d.column, d.message].filter((x) => x != null && x !== '').join(' · '));

      /* ── js/gis-core.js ──────────────────────────────────────────────────────────────────── */
      if (code === 'map-unavailable') return window.IntMapLang.t(HOST.lang, 'The map is not ready to take a layer yet', '地図がまだレイヤーを受け取れる状態ではありません', 'Die Karte kann noch keine Ebene aufnehmen', 'Карта пока не готова принять слой', 'El mapa aún no puede recibir una capa');

      const dflt = window.IntMapLang.t(HOST.lang, 'The step could not be run', '処理を実行できませんでした', 'Der Schritt konnte nicht ausgeführt werden', 'Не удалось выполнить шаг', 'No se pudo ejecutar el paso');
      return code ? dflt + ' (' + code + ')' : dflt;
    }

    /* ══ STATE ════════════════════════════════════════════════════════════════════════════════
       ⚠ The typed-but-not-yet-run values live OUTSIDE the DOM. The registry emits on every add and
       remove and this panel repaints on that, so a half-filled form held only in its own <input>s
       would be erased the moment another module finished an import. */
    let panel = null, bodyEl = null, unsub = null;
    const openRows = new Set();          /* dataset ids whose detail is unfolded */
    const drawn = new Set();             /* dataset ids handed to the map this session */
    /* (#R749) raster dataset id → which band the reader chose to paint. ⚠ NOT A DEFAULT HIDDEN IN
       draw(): a three-band grid is three pictures, and picking one without being asked would put a
       claim on the map that nobody made. Absent here means band 0, which is what the control shows. */
    const drawBand = new Map();
    const confirmDel = new Set();        /* dataset ids showing 「本当に消しますか」 */
    const dsMsg = new Map();             /* dataset id → the last recompute sentence */
    const dsParams = new Map();          /* dataset id → the edited copy of its step's settings */
    let opId = null;                     /* the op chosen in §3 */
    let opInputs = [];                   /* dataset id per input slot */
    const opParams = new Map();          /* opId + '|' + param name → the value typed for it */
    let opMsg = '', opBusy = false;
    /* ⚠ (#R738) A RUN OUTLIVES THE DOM IT WAS STARTED FROM, exactly as the bake in §2b does, and for
       the same measured reason: render() runs on every registry event, so somebody else's import
       detaches the button and the progress line while the step is still going. The controller lives
       here so the next repaint hands the reader back the only way to stop what they started. `node`
       is re-pointed at each repaint, so progress can be written without repainting the whole panel —
       a run that yields every 16 ms must not cost a full rebuild every 16 ms. */
    let opRun = null;                    /* {ac, progress, node} while §3's step is running */
    const dsRun = new Map();             /* dataset id → {ac, progress, node} while its chain re-runs */
    /* The one cell being typed into, held outside the DOM for the same reason. */
    let cellEdit = null;                 /* {id, index, field, value} */
    const editMsg = new Map();           /* dataset id → the last sentence from an edit */
    const colForm = new Map();           /* dataset id → what is typed in its column controls */
    const styleForm = new Map();         /* dataset id → the colouring the reader is composing */
    const styleMsg = new Map();          /* dataset id → the last sentence from style() */
    /* (#R756) 書き出し。The chosen format and the last sentence about a file that was written — held
       outside the DOM for the reason the block above gives: the registry repaints this panel. */
    const exportForm = new Map();        /* dataset id → the format id chosen for it */
    const exportMsg = new Map();         /* dataset id → what the last write actually did */
    let projName = '', projMsg = '';
    let projRows = null, projLoading = false;   /* list() is asynchronous — see sectionProject() */

    /* ── small questions about records ───────────────────────────────────────────────────────── */
    const titleOf = (ds) => String((ds && ds.title) || (ds && ds.id) || '');
    function originText(ds) {
      const p = (ds && ds.provenance) || {};
      if (p.kind === 'op') return window.IntMapLang.t(HOST.lang, 'Analysis step', '処理', 'Analyseschritt', 'Шаг анализа', 'Paso de análisis') + ': ' + String(p.op || '');
      if (p.kind === 'import') return window.IntMapLang.t(HOST.lang, 'Imported', '取り込み', 'Importiert', 'Импорт', 'Importado') + (p.file ? ': ' + String(p.file) : '');
      return window.IntMapLang.t(HOST.lang, 'Origin not stated', '由来が記録されていません', 'Herkunft nicht angegeben', 'Происхождение не указано', 'Origen no indicado');
    }
    /* ⚠ THREE STATES, NOT TWO. `sourceCrs === crs` is 「届いた座標系がそのまま」, a different
       `sourceCrs` is 「変換して持ち込んだ」 and NULL is 「ファイルが何も述べなかった」 — the last one
       is not a claim that it was 4326, and printing nothing there would turn it into one. */
    function crsText(ds) {
      const src = ds && ds.sourceCrs;
      const here = (ds && ds.crs) || 'EPSG:4326';
      if (!src) {
        return window.IntMapLang.t(HOST.lang, 'CRS not stated by the file', 'ファイルが座標系を述べていません', 'Datei nennt kein Koordinatensystem', 'Файл не указывает систему координат', 'El archivo no indica el sistema de coordenadas');
      }
      if (String(src) === String(here)) return String(here);
      return String(src) + ' → ' + String(here);
    }

    /* ══ (#R749) WHAT A REOPENED PROJECT IS NOT TELLING YOU UNLESS SOMEBODY SAYS IT ══════════════
       js/gis-project.js stores a derived dataset as its RECIPE and replays it on load, so what comes
       back is computed by TODAY's kernel. #R743 changed what union and the distance prefilter return
       — a project saved before it reopens with different numbers in it — and until this round the
       record did not even carry which implementation had made it.

       ⚠ THREE STATES, NOT TWO. The engine that saved it and the one replaying it are the same, are
       different, or COULD NOT BE COMPARED (a record from before version 2, a module that publishes no
       version). Folding the third into the first is the shape memory keeps recording: 「読めなかった」
       used as the evidence for 「同じ」. So each gets its own sentence.

       ⚠ AND A DECLARATION THAT NO LONGER HOLDS IS NEWS. The reader's own 「この列は人数で、単位は人」
       is verified against the data again on the way back in; where the data moved under it, the
       declaration is refused rather than copied, and a refusal nobody is shown is a refusal that did
       not happen as far as the reader is concerned. */
    function reopenNotes(res) {
      if (!res) return '';
      const changed = Array.isArray(res.engineChanged) ? res.engineChanged : [];
      const unknown = Array.isArray(res.engineUnknown) ? res.engineUnknown : [];
      const refused = Array.isArray(res.declarationsRefused) ? res.declarationsRefused : [];
      const out = [];
      if (changed.length) {
        out.push(window.IntMapLang.t(HOST.lang,
          'Recomputed by a different version of the engine than the one that saved it, so these results can differ',
          '保存したときとは別の版のエンジンで再計算しました。結果が変わっていることがあります')
          + ' (' + nf(changed.length) + ')');
      }
      if (unknown.length) {
        out.push(window.IntMapLang.t(HOST.lang,
          'This project does not say which engine computed it, so whether these results changed cannot be told',
          'このプロジェクトは、どの版のエンジンで計算されたかを述べていません。結果が変わったかどうかは分かりません')
          + ' (' + nf(unknown.length) + ')');
      }
      if (refused.length) {
        /* Naming the columns matters more than counting them: the reader's next action is to look at
           one of them. */
        const names = refused.map((r) => (r && r.field) ? String(r.field) : '').filter(Boolean).slice(0, 4);
        out.push(window.IntMapLang.t(HOST.lang,
          'Some column types or units you had declared no longer hold for this data and were not restored',
          '宣言されていた列の型や単位のうち、いまのデータでは成り立たないものは復元していません')
          + (names.length ? ' (' + names.join(', ') + ')' : ''));
      }
      return out.length ? (' — ' + out.join(' / ')) : '';
    }

    function geomText(ds) {
      /* ⚠ (#R735) A GRID IS NOT 「図形なし」. Both records answer `geometryType: null` — one because its
         features disagree about nothing, the other because a raster has no geometry to have a type —
         and saying the same words about both would tell the reader the grid is an empty table. Its
         shape is its extent and its spacing, so that is what is said. */
      if (ds && ds.kind === 'raster') {
        const g = ds.grid || {};
        const bands = Array.isArray(ds.bands) ? ds.bands.length : 0;
        const size = nf(ds.width) + '×' + nf(ds.height);
        const step = (typeof g.pixelLng === 'number') ? (g.pixelLng.toPrecision(3) + '°×' + Number(g.pixelLat).toPrecision(3) + '°') : '';
        const head = window.IntMapLang.t(HOST.lang, 'Grid', '格子', 'Raster', 'Сетка', 'Rejilla');
        const bandWord = window.IntMapLang.t(HOST.lang, 'bands', 'バンド', 'Bänder', 'полос', 'bandas');
        return head + ' ' + size + (step ? (' @ ' + step) : '') + ' · ' + nf(bands) + ' ' + bandWord;
      }
      const g = ds && ds.geometryType;
      return g ? String(g) : window.IntMapLang.t(HOST.lang, 'no geometry', '図形なし', 'keine Geometrie', 'без геометрии', 'sin geometría');
    }
    /* A moment, in the reader's locale. ⚠ The registry's unit is milliseconds and 「-5364662400000」
       is not a date to anybody; the clock is printed only when the moment is not midnight UTC,
       because a dataset stamped 「1889」 with a time of day on it reads as a precision it does not
       have. UTC, because that is the frame the registry stored. */
    function whenText(ms) {
      const n = Number(ms);
      if (!isFinite(n)) return String(ms == null ? '' : ms);
      const opts = (n % 86400000 === 0) ? { dateStyle: 'medium', timeZone: 'UTC' } : { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' };
      try { return new Date(n).toLocaleString(window.IntMapLang.locale(HOST.lang), opts); } catch (_) { return String(n); }
    }

    /* ⚠ (#R738) WHAT THIS RECORD SAYS ABOUT TIME, AND THE SHAPES ARE NOT LISTED HERE. §1.5 declares
       four kinds today and js/gis-datasets.js may declare a fifth; the declaration the record carries
       is walked instead, so a kind this file has never heard of still reaches the reader with the
       columns it names. Without this line a reader could not see WHICH column timeWindow is about to
       narrow on, and `timeRefused` (the field #R735 built so an unbearable declaration is refused
       rather than copied) had no reader at all. */
    function timeText(ds) {
      const t = ds && ds.time;
      if (!t || typeof t !== 'object') return '';
      const bits = [];
      for (const k of Object.keys(t)) {
        const v = t[k];
        if (k === 'kind' || v == null || v === '') continue;
        bits.push(k + ': ' + ((k === 'start' || k === 'end') ? whenText(v) : (typeof v === 'number' ? nf(v) : String(v))));
      }
      return window.IntMapLang.t(HOST.lang, 'Time axis', '時間軸') + ': ' + String(t.kind || '') + (bits.length ? ' · ' + bits.join(' · ') : '');
    }

    /* The two progress shapes, which are two different questions. js/gis-ops.js answers 「この処理の
       どこまで」 ({done,total}); js/gis-project.js answers that AND 「鎖の何本目か」 ({step,steps,op,…}),
       because only the outer one knows there is a chain. Both fall back to the label the button was
       already carrying, so nothing new is said before there is anything new to say. */
    function progressText(p) {
      const head = window.IntMapLang.t(HOST.lang, 'Running…', '実行中…', 'Läuft…', 'Выполняется…', 'Ejecutando…');
      if (!p || p.done == null) return head;
      return head + ' · ' + nf(p.done) + (p.total != null ? ' / ' + nf(p.total) : '');
    }
    function chainProgressText(p) {
      const head = window.IntMapLang.t(HOST.lang, 'Recomputing…', '再計算中…', 'Wird neu berechnet…', 'Пересчёт…', 'Recalculando…');
      if (!p) return head;
      const bits = [];
      if (p.step != null) bits.push(nf(p.step) + ' / ' + nf(p.steps) + (p.op ? ' · ' + String(p.op) : ''));
      if (p.done != null) bits.push(nf(p.done) + (p.total != null ? ' / ' + nf(p.total) : ''));
      return bits.length ? head + ' · ' + bits.join(' · ') : head;
    }

    /* ⚠ (#R738) WHAT THE STEP ANSWERED, NOT ONLY THAT IT ANSWERED. runJoin returns how many rows found
       a partner, how many did not and a sample of the keys that missed — and a join of two files that
       spell the municipality code differently is structurally perfect, empty of information, and
       indistinguishable on screen from a good one unless those counts are printed. The pairs are
       printed as the RUNNER wrote them, like the `detail` of a refusal: a sentence per statistic would
       be the hand-written per-op list docs/GIS-CORE.md §2.1 forbids, and it would go stale the first
       time an op learns to report something new. */
    function statsText(st) {
      if (!st || typeof st !== 'object') return '';
      const bits = [];
      for (const k of Object.keys(st)) {
        const v = st[k];
        if (v == null || v === '') continue;
        if (Array.isArray(v)) { if (v.length) bits.push(k + ': ' + v.slice(0, 5).join(', ')); continue; }
        if (typeof v === 'object') continue;   /* nested reports (firstError) are refusals, and those have sentences */
        bits.push(k + ': ' + (typeof v === 'number' ? nf(v) : String(v)));
      }
      return bits.join(' · ');
    }

    /* ⚠ (#R738) THE COLUMN TYPES A READER MAY DECLARE ARE ASKED FOR, NOT LISTED. js/gis-datasets.js
       refuses an unknown type WITH its own vocabulary in the detail (`field-type-unknown`), so the
       options on screen are exactly the set the module enforces — a copy here would be a second
       spelling of one fact, and the day a type is added this control would be the only place in the
       program that had not heard of it. The probe writes nothing: declareField validates the type
       before it touches the record, and this string cannot be a type in any vocabulary. Cached for
       the session, because the answer belongs to the module and not to the dataset it was asked on. */
    const TYPE_PROBE = '(ask)';
    let declTypes = null;
    function declarableTypes(id, field) {
      if (declTypes) return declTypes;
      const D = DATA();
      if (!D || typeof D.declareField !== 'function' || !id || !field) return [];
      let r = null;
      try { r = D.declareField(id, field, { type: TYPE_PROBE }); } catch (_) { r = null; }
      const list = (r && r.detail && Array.isArray(r.detail.types)) ? r.detail.types.map(String) : [];
      if (list.length) declTypes = list;
      return list;
    }

    /* Everything that was made FROM this dataset, however many steps away — what a delete takes
       with it, and what has to be NAMED before one happens. */
    function downstream(id) {
      const D = DATA(); if (!D) return [];
      const out = [], seen = new Set([id]);
      let front = [id];
      for (let guard = 0; guard < 64 && front.length; guard++) {
        const next = [];
        for (const x of front) {
          for (const dep of (D.dependents(x) || [])) {
            if (seen.has(dep.id)) continue;
            seen.add(dep.id); out.push(dep); next.push(dep.id);
          }
        }
        front = next;
      }
      return out;
    }

    /* ══ §1 · THE PARAMETER CONTROLS — ONE PLACE, DRIVEN BY `type` ════════════════════════════
       `paramControl` returns { node, read() }. The caller never learns which control it got, which
       is what keeps a new parameter type a one-line change here instead of an edit per op.
       `columnsOf(slot)` answers 「which columns may this parameter offer」 — the slot comes from the
       declaration's `params[].input`, so this file never has to know that aggregate's `field`
       belongs to the points and not to the polygons. */
    function paramControl(spec, initial, columnsOf) {
      const type = String((spec && spec.type) || 'text');
      const name = String((spec && spec.name) || '');
      const slot = (spec && isFinite(Number(spec.input))) ? Number(spec.input) : 0;
      const cols = () => columnsOf(slot);
      const wrap = el('div', 'display:flex;flex-direction:column;gap:3px;min-width:0;');
      wrap.className = 'gis-param';
      wrap.setAttribute('data-param', name);
      const lab = row('gap:5px;');
      lab.appendChild(el('span', 'font-size:11px;color:var(--text-muted,#98989f);', name));
      if (spec && spec.unit) lab.appendChild(el('span', 'font-size:10.5px;color:var(--text-muted,#98989f);opacity:0.85;', '(' + String(spec.unit) + ')'));
      if (spec && spec.required) lab.appendChild(el('span', 'font-size:10.5px;color:#ff9f0a;', window.IntMapLang.t(HOST.lang, 'required', '必須', 'erforderlich', 'обязательно', 'obligatorio')));
      wrap.appendChild(lab);

      if (type === 'conditions') {
        /* ⚠ THE OPERATORS ARE THE DECLARATION'S (`params[].ops`). A list written here would be a
           second copy of js/gis-ops.js's CONDITION_OPS, and the first operator added there would be
           one the reader could not choose — while `unknown-condition-op` says the opposite. */
        const OPERATORS = (Array.isArray(spec && spec.ops) && spec.ops.length) ? spec.ops.map(String) : ['>=', '>', '<=', '<', '==', '!=', 'contains', 'in', 'between'];
        const rowsArr = Array.isArray(initial) ? initial.map((c) => Object.assign({}, c)) : [];
        const box = el('div', 'display:flex;flex-direction:column;gap:5px;min-width:0;');
        box.className = 'gis-cond';
        function paint() {
          box.textContent = '';
          const columns = cols();
          rowsArr.forEach((c, i) => {
            const r = row('gap:4px;'); r.className = 'gis-cond-row';
            const f = el('select', CSS_IN + 'flex:2 1 96px;width:auto;min-width:84px;'); f.className = 'gis-cond-field';
            if (!columns.length) { const o = el('option', '', window.IntMapLang.t(HOST.lang, 'Choose an input dataset first', '先に入力データセットを選んでください', 'Wählen Sie zuerst einen Eingabedatensatz', 'Сначала выберите входной набор данных', 'Elige primero un conjunto de datos de entrada')); o.value = ''; f.appendChild(o); f.disabled = true; }
            if (columns.length && !c.field) c.field = columns[0].name;
            columns.forEach((col) => { const o = el('option', '', col.name + ' · ' + col.type); o.value = col.name; if (col.name === c.field) o.selected = true; f.appendChild(o); });
            f.onchange = () => { c.field = f.value; };
            const o2 = el('select', CSS_IN + 'flex:0 0 auto;width:auto;min-width:76px;'); o2.className = 'gis-cond-op';
            if (OPERATORS.indexOf(c.op) < 0) c.op = OPERATORS[0];
            OPERATORS.forEach((op) => { const o = el('option', '', op); o.value = op; if (op === c.op) o.selected = true; o2.appendChild(o); });
            o2.onchange = () => { c.op = o2.value; paint(); };
            r.appendChild(f); r.appendChild(o2);
            /* ⚠ `between` and `in` carry an ARRAY in `value` — that is what js/gis-ops.js's
               evalCondition reads (a pair for between, a list for in). A second field named
               `value2` would be a shape only this panel understands. */
            if (c.op === 'between') {
              const pair = Array.isArray(c.value) ? c.value : [];
              const v1 = el('input', CSS_IN + 'flex:1 1 60px;width:auto;min-width:52px;'); v1.className = 'gis-cond-val'; v1.type = 'text'; v1.value = pair[0] == null ? '' : String(pair[0]);
              const v2 = el('input', CSS_IN + 'flex:1 1 60px;width:auto;min-width:52px;'); v2.className = 'gis-cond-val2'; v2.type = 'text'; v2.value = pair[1] == null ? '' : String(pair[1]);
              const sync = () => { c.value = [v1.value, v2.value]; };
              v1.oninput = sync; v2.oninput = sync;
              if (!Array.isArray(c.value)) sync();
              r.appendChild(v1); r.appendChild(v2);
            } else if (c.op === 'in') {
              const v1 = el('input', CSS_IN + 'flex:1 1 68px;width:auto;min-width:56px;'); v1.className = 'gis-cond-val'; v1.type = 'text';
              v1.value = Array.isArray(c.value) ? c.value.join(', ') : (c.value == null ? '' : String(c.value));
              v1.oninput = () => { c.value = v1.value.split(',').map((s) => s.trim()).filter((s) => s !== ''); };
              r.appendChild(v1);
            } else {
              const v1 = el('input', CSS_IN + 'flex:1 1 68px;width:auto;min-width:56px;'); v1.className = 'gis-cond-val'; v1.type = 'text';
              v1.value = (c.value == null || Array.isArray(c.value)) ? '' : String(c.value);
              v1.oninput = () => { c.value = v1.value; };
              r.appendChild(v1);
            }
            const rm = el('button', CSS_BTN + 'flex:0 0 auto;min-width:32px;', '×'); rm.className = 'gis-cond-rm';
            rm.title = window.IntMapLang.t(HOST.lang, 'Remove this condition', 'この条件を削除', 'Diese Bedingung entfernen', 'Удалить это условие', 'Quitar esta condición');
            rm.onclick = () => { rowsArr.splice(i, 1); paint(); };
            r.appendChild(rm);
            box.appendChild(r);
            if (c.op === 'in') box.appendChild(el('div', CSS_NOTE, window.IntMapLang.t(HOST.lang, 'Separate the values with commas', '値はコンマで区切ってください', 'Werte mit Kommas trennen', 'Значения разделяйте запятыми', 'Separa los valores con comas')));
            if (c.op === 'between') box.appendChild(el('div', CSS_NOTE, window.IntMapLang.t(HOST.lang, 'From and to, both ends included', '下限と上限（どちらも含みます）', 'Von und bis, beide Enden eingeschlossen', 'От и до, оба конца включительно', 'Desde y hasta, ambos extremos incluidos')));
          });
          const add = el('button', CSS_BTN, '+ ' + window.IntMapLang.t(HOST.lang, 'Add a condition', '条件を追加', 'Bedingung hinzufügen', 'Добавить условие', 'Añadir condición'));
          add.className = 'gis-cond-add';
          add.onclick = () => { const columns2 = cols(); rowsArr.push({ field: columns2.length ? columns2[0].name : '', op: OPERATORS[0], value: '' }); paint(); };
          box.appendChild(add);
          if (!rowsArr.length) box.appendChild(el('div', CSS_NOTE, window.IntMapLang.t(HOST.lang, 'A filter with no condition is refused, because it would say nothing about the data', '条件のない絞り込みは、データについて何も述べないため実行できません', 'Ein Filter ohne Bedingung wird abgelehnt, weil er nichts über die Daten aussagt', 'Фильтр без условия отклоняется: он ничего не говорит о данных', 'Un filtro sin condición se rechaza, porque no dice nada sobre los datos')));
        }
        paint();
        wrap.appendChild(box);
        return { node: wrap, read: () => (rowsArr.length ? rowsArr.map((c) => Object.assign({}, c)) : null) };
      }

      if (type === 'enum' || type === 'field') {
        const sel = el('select', CSS_IN);
        sel.className = type === 'field' ? 'gis-param-field' : 'gis-param-enum';
        const values = type === 'enum'
          ? (Array.isArray(spec && spec.values) ? spec.values.map((v) => ({ v: String(v), t: String(v) })) : [])
          : cols().map((c) => ({ v: c.name, t: c.name + ' · ' + c.type }));
        if (!spec || !spec.required) { const o = el('option', '', '—'); o.value = ''; sel.appendChild(o); }
        if (!values.length) {
          const o = el('option', '', type === 'field'
            ? window.IntMapLang.t(HOST.lang, 'Choose an input dataset first', '先に入力データセットを選んでください', 'Wählen Sie zuerst einen Eingabedatensatz', 'Сначала выберите входной набор данных', 'Elige primero un conjunto de datos de entrada')
            : window.IntMapLang.t(HOST.lang, 'no choices declared', '選択肢が宣言されていません', 'keine Auswahl deklariert', 'варианты не объявлены', 'sin opciones declaradas'));
          o.value = ''; sel.appendChild(o); sel.disabled = true;
        }
        values.forEach((v) => {
          const o = el('option', '', v.t); o.value = v.v;
          if (initial != null && String(initial) === v.v) o.selected = true;
          else if (initial == null && spec && spec.default != null && String(spec.default) === v.v) o.selected = true;
          sel.appendChild(o);
        });
        wrap.appendChild(sel);
        return { node: wrap, read: () => (sel.disabled || sel.value === '' ? null : sel.value) };
      }

      /* ⚠ (#R738) `fields` — SEVERAL COLUMNS OF ONE INPUT, and 「何も選ばない」 is a real answer.
         js/gis-ops.js's runJoin reads an empty list as 「相手の列を全部（鍵は除く）」, so a control that
         showed nothing there would be read as 「0 列を持ってくる」 — the opposite of what would happen.
         The sentence under the box says which of the two the reader is looking at. */
      if (type === 'fields') {
        const columns = cols();
        const chosen = new Set(Array.isArray(initial) ? initial.map(String) : []);
        const box = el('div', CSS_CARD + 'padding:5px 7px;display:flex;flex-direction:column;gap:2px;max-height:132px;overflow:auto;');
        box.className = 'gis-param-fields';
        const note = el('div', CSS_NOTE, '');
        const sayCount = () => {
          note.textContent = chosen.size
            ? window.IntMapLang.t(HOST.lang, 'Chosen', '選択中', 'Ausgewählt', 'Выбрано', 'Seleccionadas') + ': ' + nf(chosen.size) + ' / ' + nf(columns.length)
            : window.IntMapLang.t(HOST.lang, 'Nothing ticked means every column of that input', '何も選ばなければ、その入力の全部の列を持ってきます');
        };
        if (!columns.length) {
          box.appendChild(el('div', CSS_NOTE, window.IntMapLang.t(HOST.lang, 'Choose an input dataset first', '先に入力データセットを選んでください', 'Wählen Sie zuerst einen Eingabedatensatz', 'Сначала выберите входной набор данных', 'Elige primero un conjunto de datos de entrada')));
        }
        columns.forEach((col) => {
          /* the checkbox lives INSIDE the label, so no id has to be invented and a repaint cannot
             leave a label pointing at an input that is gone */
          const lb = el('label', 'display:flex;align-items:center;gap:6px;font-size:11.5px;cursor:pointer;min-height:22px;');
          const cb = el('input', 'min-width:15px;min-height:15px;flex:0 0 auto;');
          cb.type = 'checkbox'; cb.className = 'gis-param-field-cb'; cb.value = col.name;
          cb.checked = chosen.has(col.name);
          cb.onchange = () => { if (cb.checked) chosen.add(col.name); else chosen.delete(col.name); sayCount(); };
          lb.appendChild(cb);
          lb.appendChild(el('span', 'flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;', col.name + ' · ' + col.type));
          box.appendChild(lb);
        });
        sayCount();
        wrap.appendChild(box); wrap.appendChild(note);
        return { node: wrap, read: () => (chosen.size ? Array.from(chosen) : null) };
      }

      /* ⚠ (#R738) `expression` — AND THE LIST BESIDE IT IS THE KERNEL'S OWN. js/gis-expr.js exists
         with `functions()` for exactly this ({name, arity, returns, doc}); a list of names typed here
         would be the second list that file's header forbids, and the first function added there would
         be one the reader could never learn about. Columns are inserted as `[name]`, which is the
         parser's own reference form, so a column whose name has a space or a comma still works. */
      if (type === 'expression') {
        const ta = el('textarea', CSS_IN + 'min-height:64px;padding:6px 8px;line-height:1.5;resize:vertical;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;');
        ta.className = 'gis-param-expr';
        if (initial != null) ta.value = String(initial);
        else if (spec && spec.default != null) ta.value = String(spec.default);
        const put = (frag, caretBack) => {
          const s = ta.selectionStart == null ? ta.value.length : ta.selectionStart;
          const e = ta.selectionEnd == null ? s : ta.selectionEnd;
          ta.value = ta.value.slice(0, s) + frag + ta.value.slice(e);
          const at = s + frag.length - (caretBack || 0);
          try { ta.focus(); ta.setSelectionRange(at, at); } catch (_) { }
        };
        wrap.appendChild(ta);

        const columns = cols();
        if (columns.length) {
          const cbar = row('gap:4px;');
          cbar.className = 'gis-expr-cols';
          cbar.appendChild(el('span', CSS_NOTE, window.IntMapLang.t(HOST.lang, 'Columns', '列', 'Spalten', 'столбцы', 'columnas') + ':'));
          columns.forEach((col) => {
            const b = el('button', CSS_BTN + 'min-height:26px;padding:0 7px;font-size:11px;', col.name);
            b.title = col.name + ' · ' + col.type;
            b.onclick = () => put('[' + col.name + ']', 0);
            cbar.appendChild(b);
          });
          wrap.appendChild(cbar);
        }

        const X = EXPR();
        if (!X || typeof X.functions !== 'function') {
          wrap.appendChild(el('div', CSS_NOTE, reasonText('expr-unavailable')));
        } else {
          let fns = [];
          try { fns = X.functions() || []; } catch (_) { fns = []; }
          const fbox = el('div', CSS_CARD + 'padding:5px 7px;display:flex;flex-wrap:wrap;gap:4px;max-height:120px;overflow:auto;');
          fbox.className = 'gis-expr-funcs';
          fns.forEach((f) => {
            const b = el('button', CSS_BTN + 'min-height:26px;padding:0 7px;font-size:11px;', f.name);
            /* `doc` is a SIGNATURE, not prose (js/gis-expr.js says so): it is shown as written, and
               the type it answers with is the kernel's word too. */
            b.title = String(f.doc || f.name) + (f.returns ? ' → ' + String(f.returns) : '');
            b.onclick = () => put(f.name + '()', 1);
            fbox.appendChild(b);
          });
          wrap.appendChild(fbox);
        }
        return { node: wrap, read: () => (ta.value.trim() === '' ? null : ta.value) };
      }

      /* ⚠ (#R738) `boolean` — FALSE IS AN ANSWER AND IS SENT. paramBlock drops only null/undefined,
         so an unticked box reaches the op as `false`: compute's `replace` has to be able to SAY no,
         because its refusal (`compute-column-exists`) is what stops a column being overwritten. */
      if (type === 'boolean') {
        /* the name is already printed by the label above this control, so the box carries no second
           copy of it — a wide <label> is here only to give the tick a finger-sized target */
        const lb = el('label', 'display:flex;align-items:center;min-height:30px;cursor:pointer;');
        const cb = el('input', 'min-width:18px;min-height:18px;flex:0 0 auto;');
        cb.type = 'checkbox'; cb.className = 'gis-param-bool';
        cb.checked = (initial != null) ? (initial === true || String(initial) === 'true') : ((spec && spec.default) === true);
        lb.appendChild(cb);
        wrap.appendChild(lb);
        return { node: wrap, read: () => !!cb.checked };
      }

      /* number, text, and anything this file has never heard of — a control it cannot draw is
         still a control the reader can fill, which is strictly better than dropping the row. */
      const inp = el('input', CSS_IN);
      inp.className = 'gis-param-input';
      inp.type = type === 'number' ? 'number' : 'text';
      if (initial != null) inp.value = String(initial);
      else if (spec && spec.default != null) inp.value = String(spec.default);
      wrap.appendChild(inp);
      if (type !== 'number' && type !== 'text') wrap.appendChild(el('div', CSS_NOTE, window.IntMapLang.t(HOST.lang, 'Type:', '型:', 'Typ:', 'Тип:', 'Tipo:') + ' ' + type));
      return {
        node: wrap,
        read: () => {
          const raw = inp.value;
          if (raw === '') return null;
          if (type !== 'number') return raw;
          const n = Number(raw);
          /* ⚠ AN UNUSABLE NUMBER IS HANDED ON AS TYPED. The op answers `bad-param` with the
             parameter's name, which is a better sentence than anything this file could invent — and
             silently substituting a default would run a step the reader did not ask for. */
          return isFinite(n) ? n : raw;
        },
      };
    }

    /* The whole parameter block of one declaration, plus the two questions the caller asks of it.
       ⚠ `requiredWhen` is honoured HERE, from the declaration ({stat:['sum','mean','min','max']}),
       so 「合計なのに列が空」 is caught before the run instead of coming back as `missing-param`. */
    function paramBlock(decl, initialOf, columnsOf) {
      const specs = Array.isArray(decl && decl.params) ? decl.params : [];
      const box = el('div', 'display:flex;flex-direction:column;gap:7px;min-width:0;');
      box.className = 'gis-params';
      const readers = [];
      specs.forEach((sp) => {
        const c = paramControl(sp, initialOf(String(sp && sp.name)), columnsOf);
        box.appendChild(c.node);
        readers.push({ name: String(sp && sp.name), spec: sp, read: c.read });
      });
      if (!specs.length) box.appendChild(el('div', CSS_NOTE, window.IntMapLang.t(HOST.lang, 'This step takes no settings', 'この処理に引数はありません', 'Dieser Schritt hat keine Einstellungen', 'У этого шага нет настроек', 'Este paso no tiene ajustes')));
      const readAll = () => { const o = {}; readers.forEach((r) => { const v = r.read(); if (v !== null && v !== undefined) o[r.name] = v; }); return o; };
      const missing = () => {
        const now = readAll();
        const out = [];
        readers.forEach((r) => {
          const sp = r.spec || {};
          let need = !!sp.required;
          const rw = sp.requiredWhen;
          if (!need && rw && typeof rw === 'object') {
            Object.keys(rw).forEach((other) => {
              const want = Array.isArray(rw[other]) ? rw[other] : [rw[other]];
              if (want.map(String).indexOf(String(now[other])) >= 0) need = true;
            });
          }
          const v = now[r.name];
          if (need && (v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length))) out.push(r.name);
        });
        return out;
      };
      return { node: box, readAll, missing };
    }

    /* ══ §2 · DATASETS ════════════════════════════════════════════════════════════════════════ */
    function fieldsTable(ds) {
      const cols = Array.isArray(ds.fields) ? ds.fields : [];
      const out = el('div', 'display:flex;flex-direction:column;gap:4px;min-width:0;');
      const wrap = el('div', CSS_CARD + 'overflow:auto;max-height:230px;');
      wrap.className = 'gis-fields';
      if (!cols.length) {
        wrap.appendChild(el('div', CSS_NOTE + 'padding:8px 10px;', window.IntMapLang.t(HOST.lang, 'This dataset carries no attribute columns', 'このデータセットには属性の列がありません', 'Dieser Datensatz hat keine Attributspalten', 'В этом наборе нет столбцов атрибутов', 'Este conjunto no tiene columnas de atributos')));
        out.appendChild(wrap); return out;
      }
      /* ⚠ (#R738) THE CELLS ARE EDITABLE WHERE THE REGISTRY SAYS THEY ARE, AND THIS FILE DOES NOT
         SECOND-GUESS IT. `editable()` is the same gate the five mutating doors ask, so an op's output,
         a grid and a stale record are refused here with the sentence they would be refused with
         later — and 「処理の結果は編集できない」 reaches the reader as advice (edit the import, or
         copy it) instead of as a cell that swallows a keystroke. */
      const D0 = DATA();
      const gate = (D0 && typeof D0.editable === 'function') ? D0.editable(ds.id) : { ok: false, why: 'registry-missing' };
      const table = el('table', 'border-collapse:collapse;font-size:11px;white-space:nowrap;');
      const thead = el('thead', ''), htr = el('tr', '');
      cols.forEach((c) => {
        const th = el('th', 'text-align:left;padding:5px 8px;border-bottom:1px solid var(--glass-border,rgba(128,128,128,0.22));position:sticky;top:0;background:var(--card-bg,#1c1c1e);');
        th.appendChild(el('div', 'font-weight:600;color:var(--text-main,#f2f2f7);', c.name));
        /* ⚠ THE MEASUREMENT AND THE DECLARATION ARE TWO FACTS AND BOTH ARE SHOWN. js/gis-datasets.js
           never overwrites the measured `type` with a declared one, precisely so 「測ると text・読者が
           number と宣言」 can be read as the two statements it is; collapsing them here would throw
           away the distinction the registry went to the trouble of keeping. */
        const meta = [window.IntMapLang.t(HOST.lang, 'measured', '測定', 'gemessen', 'измерено', 'medido') + ': ' + String(c.type)];
        if (c.typeStated) meta.push(window.IntMapLang.t(HOST.lang, 'declared', '宣言', 'erklärt', 'заявлено', 'declarado') + ': ' + String(c.typeStated) + (c.typeStatedBy ? ' (' + String(c.typeStatedBy) + ')' : ''));
        if (c.unit) meta.push(String(c.unit) + (c.unitStated ? ' (' + String(c.unitStated) + ')' : ''));
        if (c.empty) meta.push(nf(c.empty) + ' ' + window.IntMapLang.t(HOST.lang, 'empty', '空', 'leer', 'пусто', 'vacías'));
        th.appendChild(el('div', 'font-weight:400;color:var(--text-muted,#98989f);', meta.join(' · ')));
        htr.appendChild(th);
      });
      thead.appendChild(htr); table.appendChild(thead);
      const tbody = el('tbody', '');
      let feats = [];
      try { feats = ds.features() || []; } catch (_) { feats = []; }
      const LIMIT = 200;
      const commitCell = () => {
        const e = cellEdit;
        if (!e) return;
        cellEdit = null;
        /* ⚠ AN UNCHANGED CELL IS NOT AN EDIT, AND IT DOES NOT REPAINT. Leaving a cell by clicking the
           next one blurs this input; repainting on that would detach the cell the reader is in the
           middle of clicking, so moving across the table would take two clicks per cell. Nothing is
           left on screen either way — the next repaint is the one that removes this input. */
        if (e.value === e.was) return;
        const D = DATA();
        if (!D || typeof D.editValues !== 'function') { editMsg.set(ds.id, reasonText('registry-missing')); render(); return; }
        /* ⚠ THE TEXT IS HANDED OVER AS TYPED. What a value IS — a number, a zero-padded code, a date
           — is decided by the registry over the whole column (docs/GIS-CORE.md §1.1), and a
           conversion invented here would be a second typing rule: 「01100」 turned into 1100 on its
           way in is the very defect that rule exists to prevent. */
        const r = D.editValues(ds.id, [{ index: e.index, field: e.field, value: e.value }]);
        if (r && r.ok === false) editMsg.set(ds.id, reasonText(r.why, r.detail)); else editMsg.delete(ds.id);
        render();
      };
      feats.slice(0, LIMIT).forEach((f, i) => {
        const tr = el('tr', '');
        cols.forEach((c) => {
          const v = ((f && f.properties) || {})[c.name];
          const s = v == null ? '' : (typeof v === 'number' ? nf(v) : String(v));
          const base = 'padding:4px 8px;border-bottom:1px solid rgba(128,128,128,0.12);color:var(--text-main,#f2f2f7);max-width:180px;overflow:hidden;text-overflow:ellipsis;';
          if (cellEdit && cellEdit.id === ds.id && cellEdit.index === i && cellEdit.field === c.name) {
            const td = el('td', base + 'padding:2px 4px;');
            const inp = el('input', CSS_IN + 'min-height:26px;font-size:11px;min-width:96px;');
            inp.className = 'gis-cell-input'; inp.type = 'text'; inp.value = cellEdit.value;
            inp.oninput = () => { if (cellEdit) cellEdit.value = inp.value; };
            inp.onkeydown = (ev) => {
              if (ev.key === 'Enter') { ev.preventDefault(); commitCell(); }
              else if (ev.key === 'Escape') { ev.preventDefault(); cellEdit = null; render(); }
            };
            inp.onblur = () => commitCell();
            td.appendChild(inp);
            /* the panel is rebuilt wholesale, so the caret is put back after the node is in the
               document rather than at construction time */
            try { setTimeout(() => { try { inp.focus(); inp.select(); } catch (_) { } }, 0); } catch (_) { }
            tr.appendChild(td);
            return;
          }
          const td = el('td', base + (gate.ok ? 'cursor:text;' : ''), s.length > 60 ? s.slice(0, 60) + '…' : s);
          if (s.length > 60) td.title = s;
          if (gate.ok) {
            /* ⚠ THE RAW CELL, NOT WHAT IS ON SCREEN. `s` has been localised (1,234) and possibly cut
               at 60 characters; opening the editor with that would let a reader save the display of
               their own data over the data. */
            td.onclick = () => { const raw = v == null ? '' : String(v); cellEdit = { id: ds.id, index: i, field: c.name, value: raw, was: raw }; render(); };
          }
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      wrap.appendChild(table);
      out.appendChild(wrap);
      /* ⚠ A REFUSED TYPE DECLARATION IS SHOWN WITH ITS EVIDENCE. `typeRefused` holds the count that
         did not read as that type and one of them, which is what lets a reader see at once whether
         they have a code column or three typos — the sentence is reasonText's, so this is only a
         matter of putting it where it can be read. */
      cols.forEach((c) => {
        if (!c.typeRefused) return;
        const tr = c.typeRefused;
        const w = el('div', CSS_WARN, c.name + ' — ' + reasonText('field-type-refused', { field: c.name, type: tr.type, bad: tr.bad, checked: tr.checked, example: tr.example }));
        w.className = 'gis-type-refused';
        out.appendChild(w);
      });
      /* ⚠ BOTH NUMBERS, ALWAYS. 「200」 on its own is read as 「all of it」, and every count a reader
         takes off this screen afterwards would be wrong by however much was cut. */
      const shown = Math.min(LIMIT, feats.length);
      const note = el('div', CSS_NOTE, window.IntMapLang.t(HOST.lang, 'Showing', '表示中', 'Angezeigt', 'Показано', 'Mostrando')
        + ' ' + nf(shown) + ' / ' + nf(feats.length) + ' ' + window.IntMapLang.t(HOST.lang, 'rows', '行', 'Zeilen', 'строк', 'filas'));
      note.className = 'gis-truncated';
      out.appendChild(note);
      return out;
    }

    function lineageBlock(ds) {
      const D = DATA();
      const chain = (D && D.lineage(ds.id)) || [];
      const box = el('div', 'display:flex;flex-direction:column;gap:3px;min-width:0;');
      box.className = 'gis-lineage';
      box.appendChild(el('div', CSS_SECTH, window.IntMapLang.t(HOST.lang, 'Where this came from', 'これはどこから来たか', 'Woher das stammt', 'Откуда это взялось', 'De dónde procede')));
      if (!chain.length) { box.appendChild(el('div', CSS_NOTE, originText(ds))); return box; }
      chain.forEach((step, i) => {
        const r = row('gap:5px;'); r.className = 'gis-lin-step';
        r.appendChild(el('span', 'color:var(--text-muted,#98989f);font-size:11px;', i === 0 ? '·' : '→'));
        r.appendChild(el('span', 'font-size:11.5px;color:var(--text-main,#f2f2f7);overflow-wrap:anywhere;', titleOf(step)));
        r.appendChild(el('span', CSS_NOTE, originText(step)));
        box.appendChild(r);
      });
      return box;
    }

    /* The columns a `field` parameter may offer, for a step that already exists: the slot index is
       the declaration's, and the dataset is whatever that slot of the recorded recipe names. */
    function columnsFromInputs(inputs) {
      return (slot) => {
        const D = DATA(); if (!D) return [];
        const id = (Array.isArray(inputs) ? inputs : [])[slot];
        const rec = id ? D.get(id) : null;
        return (rec && rec.fields) ? rec.fields.slice() : [];
      };
    }

    function stepParamsBlock(ds) {
      const prov = (ds && ds.provenance) || {};
      if (prov.kind !== 'op') return null;
      const box = el('div', 'display:flex;flex-direction:column;gap:6px;min-width:0;');
      box.appendChild(el('div', CSS_SECTH, window.IntMapLang.t(HOST.lang, 'Settings of this step', 'この処理の引数', 'Einstellungen dieses Schritts', 'Настройки этого шага', 'Ajustes de este paso')));
      const O = OPS();
      if (!O || typeof O.op !== 'function') { box.appendChild(el('div', CSS_NOTE, reasonText('ops-unavailable'))); return box; }
      const decl = O.op(prov.op);
      if (!decl) { box.appendChild(el('div', CSS_WARN, reasonText('op-unknown', { op: prov.op }))); return box; }
      const held = dsParams.get(ds.id) || Object.assign({}, prov.params || {});
      dsParams.set(ds.id, held);
      const block = paramBlock(decl, (n) => held[n], columnsFromInputs(prov.inputs));
      box.appendChild(block.node);
      if (decl.needsGeodesy && !GEODESY()) box.appendChild(el('div', CSS_WARN, reasonText('geodesy-missing')));
      if (decl.needsGeometry && !GEOM()) box.appendChild(el('div', CSS_WARN, reasonText('geometry-missing')));
      /* ⚠ (#R738) THE RUNNING CHAIN IS DRAWN FROM MODULE STATE, NOT FROM THIS CLOSURE. A rebuild
         removes and re-adds every downstream record, and the registry emits on each — so the panel
         repaints several times DURING the run, and a stop button held in this closure would be
         detached at the first of them. `dsRun` is the same answer §2b's bake found. */
      const live = dsRun.get(ds.id);
      if (live) {
        const lrow = row('');
        const sp = el('div', CSS_NOTE + 'flex:1 1 auto;min-width:0;', live.progress || chainProgressText(null));
        sp.className = 'gis-recalc-progress';
        live.node = sp;
        const stop = el('button', CSS_BTND, window.IntMapLang.t(HOST.lang, 'Stop this run', '実行を中止する'));
        stop.className = 'gis-recalc-stop';
        stop.onclick = () => { try { if (live.ac) live.ac.abort(); } catch (_) { } };
        lrow.appendChild(sp); lrow.appendChild(stop);
        box.appendChild(lrow);
      }
      const bar = row('');
      const go = el('button', CSS_BTNP, window.IntMapLang.t(HOST.lang, 'Recompute', '再計算', 'Neu berechnen', 'Пересчитать', 'Recalcular'));
      go.className = 'gis-recalc';
      go.disabled = !!live;
      go.onclick = () => {
        const P = PROJ();
        const params = block.readAll();
        dsParams.set(ds.id, params);
        const miss = block.missing();
        if (miss.length) { dsMsg.set(ds.id, reasonText('missing-param', { param: miss[0] })); render(); return; }
        if (!P || typeof P.setParams !== 'function') { dsMsg.set(ds.id, reasonText('ops-unavailable')); render(); return; }
        /* ⚠ (#R738) THE SIGNAL IS ACTUALLY PASSED. js/gis-project.js takes `{signal,onProgress}` and
           hands it down to every step of the chain, and the only caller in the program that had ever
           handed one over was a test — an argument nothing passes is the same nothing as an export
           nothing calls. Cancelling between steps disturbs no record, and `cancelled` already has its
           sentence, so recomputeText prints it without anything new being said here. */
        const ac = (typeof AbortController === 'function') ? new AbortController() : null;
        const run = { ac: ac, progress: chainProgressText(null), node: null };
        dsRun.set(ds.id, run);
        dsMsg.delete(ds.id);
        render();
        const finish = (fn) => { dsRun.delete(ds.id); fn(); render(); };
        Promise.resolve().then(() => P.setParams(ds.id, params, {
          signal: ac ? ac.signal : null,
          /* written straight onto the live line: the chain yields about every 16 ms, and a full
             repaint of the panel at that rate is the frame budget the yielding was bought with */
          onProgress: (p) => { run.progress = chainProgressText(p); if (run.node) { try { run.node.textContent = run.progress; } catch (_) { } } },
        })).then((res) => {
          finish(() => {
            dsMsg.set(ds.id, recomputeText(res));
            /* the rebuild removes and re-adds every downstream dataset, so anything that was on the
               map is a layer of the OLD result — the row says so rather than pretending otherwise */
            ((res && res.rebuilt) || []).forEach((id) => drawn.delete(id));
          });
        }).catch((e) => { finish(() => { dsMsg.set(ds.id, reasonText('op-failed', { message: e && e.message })); }); });
      };
      bar.appendChild(go);
      box.appendChild(bar);
      const msg = dsMsg.get(ds.id);
      if (msg) box.appendChild(el('div', CSS_NOTE, msg));
      return box;
    }

    /* ⚠ BOTH NUMBERS ARE PRINTED, INCLUDING THE ZERO. 「5 rebuilt」 on its own leaves a reader who
       had six downstream datasets believing all six are current. */
    function recomputeText(res) {
      const r = res || {};
      const rebuilt = Array.isArray(r.rebuilt) ? r.rebuilt.length : Number(r.rebuilt || 0);
      const failedArr = Array.isArray(r.failed) ? r.failed : [];
      const failed = Array.isArray(r.failed) ? r.failed.length : Number(r.failed || 0);
      if (r.ok === false && !failedArr.length && !rebuilt) return reasonText(r.why, r.detail);
      let s = window.IntMapLang.t(HOST.lang, 'Rebuilt', '再計算しました', 'Neu berechnet', 'Пересчитано', 'Recalculado') + ': ' + nf(rebuilt)
        + ' · ' + window.IntMapLang.t(HOST.lang, 'Failed', '失敗', 'Fehlgeschlagen', 'Ошибок', 'Fallidos') + ': ' + nf(failed);
      const why = failedArr.map((f) => (f && f.why) ? reasonText(f.why, f.detail) : '').filter(Boolean);
      if (why.length) s += ' — ' + why.slice(0, 3).join(' / ');
      else if (r.ok === false && r.why) s += ' — ' + reasonText(r.why, r.detail);
      return s;
    }

    /* ══ §2c · EDITING THE ATTRIBUTES (#R738) ═════════════════════════════════════════════════
       ⚠ THE REFUSALS ARE THE POINT OF THE SECTION, not an edge of it. js/gis-datasets.js will not let
       an op's output be edited (its values are what its recipe produces), will not remove a column
       another dataset was built from, and will not let the time axis be renamed out from under the
       declaration that names it — and each of those says what the reader can do instead. So the
       section asks the module and prints the module's answer; nothing here decides what is editable.
       ⚠ Undo and redo are the MODULE's stacks, and their depth is on screen: a button that is greyed
       with no number is a control the reader cannot reason about. */
    function editBlock(ds) {
      const D = DATA();
      if (!D || typeof D.editable !== 'function') return null;
      const box = el('div', 'display:flex;flex-direction:column;gap:6px;min-width:0;');
      box.className = 'gis-edit';
      box.appendChild(el('div', CSS_SECTH, window.IntMapLang.t(HOST.lang, 'Edit the attributes', '属性を編集する')));
      const gate = D.editable(ds.id);
      if (!gate.ok) { box.appendChild(el('div', CSS_NOTE, reasonText(gate.why, gate.detail))); return box; }

      const say = (r) => {
        if (r && r.ok === false) editMsg.set(ds.id, reasonText(r.why, r.detail));
        else editMsg.delete(ds.id);
        render();
      };

      const hist = (typeof D.history === 'function') ? D.history(ds.id) : { undo: 0, redo: 0 };
      const hbar = row('');
      const mkStep = (label, count, cls, why, go) => {
        const b = el('button', CSS_BTN, label + ' (' + nf(count) + ')');
        b.className = cls;
        if (!count) {
          /* ⚠ DISABLED AND SAYING WHY. An empty history is not a failure, and the reason is already
             a sentence — so the control is unpressable and carries it, rather than being pressable
             and answering with a refusal the reader could have been spared. */
          b.disabled = true; b.style.opacity = '0.45'; b.style.cursor = 'default';
          b.title = reasonText(why);
        } else b.onclick = () => say(go());
        return b;
      };
      hbar.appendChild(mkStep(window.IntMapLang.t(HOST.lang, 'Undo', '元に戻す', 'Rückgängig', 'Отменить', 'Deshacer'), hist.undo, 'gis-undo', 'nothing-to-undo', () => D.undo(ds.id)));
      hbar.appendChild(mkStep(window.IntMapLang.t(HOST.lang, 'Redo', 'やり直す', 'Wiederholen', 'Повторить', 'Rehacer'), hist.redo, 'gis-redo', 'nothing-to-redo', () => D.redo(ds.id)));
      box.appendChild(hbar);
      box.appendChild(el('div', CSS_NOTE, window.IntMapLang.t(HOST.lang, 'Click a cell in the table above to change its value', '上の表のセルを押すと値を編集できます')));

      const cols = Array.isArray(ds.fields) ? ds.fields : [];
      const held = colForm.get(ds.id) || { field: '', type: '', unit: '', rename: '', newName: '', newValue: '' };
      colForm.set(ds.id, held);
      if (!cols.some((c) => c.name === held.field)) held.field = cols.length ? cols[0].name : '';

      if (cols.length) {
        const pick = el('select', CSS_IN);
        pick.className = 'gis-col-pick';
        cols.forEach((c) => { const o = el('option', '', c.name + ' · ' + c.type); o.value = c.name; if (c.name === held.field) o.selected = true; pick.appendChild(o); });
        pick.onchange = () => { held.field = pick.value; render(); };
        box.appendChild(pick);

        /* Declare — a type, a unit, or both. ⚠ The empty option is 「宣言しない」 and not a type:
           sending it would be a claim, and a claim about a column is the thing this face exists to
           make deliberate. */
        const dbar = row('');
        const tsel = el('select', CSS_IN + 'flex:1 1 92px;width:auto;min-width:84px;');
        tsel.className = 'gis-col-type';
        const blank = el('option', '', '—'); blank.value = ''; tsel.appendChild(blank);
        const types = declarableTypes(ds.id, held.field);
        types.forEach((t) => { const o = el('option', '', t); o.value = t; if (t === held.type) o.selected = true; tsel.appendChild(o); });
        if (!types.length) tsel.disabled = true;
        tsel.onchange = () => { held.type = tsel.value; };
        const usel = el('input', CSS_IN + 'flex:1 1 84px;width:auto;min-width:72px;');
        usel.className = 'gis-col-unit'; usel.type = 'text'; usel.value = held.unit;
        usel.placeholder = window.IntMapLang.t(HOST.lang, 'Unit', '単位', 'Einheit', 'Единица', 'Unidad');
        usel.oninput = () => { held.unit = usel.value; };
        const dgo = el('button', CSS_BTN, window.IntMapLang.t(HOST.lang, 'Declare', '宣言する'));
        dgo.className = 'gis-col-declare';
        dgo.onclick = () => {
          const spec = {};
          if (held.type) spec.type = held.type;
          if (String(held.unit).trim() !== '') spec.unit = held.unit;
          /* An empty spec is not silently ignored: the module answers `nothing-declared`, which is
             the sentence that tells the reader what the control wanted. */
          say(D.declareField(ds.id, held.field, spec));
        };
        dbar.appendChild(tsel); dbar.appendChild(usel); dbar.appendChild(dgo);
        box.appendChild(dbar);

        const rbar = row('');
        const rin = el('input', CSS_IN + 'flex:1 1 104px;width:auto;min-width:88px;');
        rin.className = 'gis-col-rename'; rin.type = 'text'; rin.value = held.rename;
        rin.placeholder = window.IntMapLang.t(HOST.lang, 'New name for this column', 'この列の新しい名前');
        rin.oninput = () => { held.rename = rin.value; };
        const rgo = el('button', CSS_BTN, window.IntMapLang.t(HOST.lang, 'Rename', '名称変更'));
        rgo.className = 'gis-col-rename-go';
        rgo.onclick = () => { const r = D.renameField(ds.id, held.field, String(held.rename || '')); if (r && r.ok) held.rename = ''; say(r); };
        const rm = el('button', CSS_BTND, window.IntMapLang.t(HOST.lang, 'Delete this column', 'この列を削除'));
        rm.className = 'gis-col-remove';
        rm.onclick = () => say(D.removeField(ds.id, held.field));
        rbar.appendChild(rin); rbar.appendChild(rgo); rbar.appendChild(rm);
        box.appendChild(rbar);
      }

      const abar = row('');
      const nin = el('input', CSS_IN + 'flex:1 1 96px;width:auto;min-width:82px;');
      nin.className = 'gis-col-new'; nin.type = 'text'; nin.value = held.newName;
      nin.placeholder = window.IntMapLang.t(HOST.lang, 'Name of a new column', '新しい列の名前');
      nin.oninput = () => { held.newName = nin.value; };
      const vin = el('input', CSS_IN + 'flex:1 1 84px;width:auto;min-width:72px;');
      vin.className = 'gis-col-new-value'; vin.type = 'text'; vin.value = held.newValue;
      vin.placeholder = window.IntMapLang.t(HOST.lang, 'Value on every row', '全行に入れる値');
      vin.oninput = () => { held.newValue = vin.value; };
      const ago = el('button', CSS_BTN, window.IntMapLang.t(HOST.lang, 'Add a column', '列を追加'));
      ago.className = 'gis-col-add';
      /* ⚠ EMPTY MEANS EMPTY, NOT THE TEXT 「」. addField(…, null) leaves every cell absent, which is
         what an empty column looks like everywhere else in this layer; writing '' would make a column
         that the registry types as text because the reader typed nothing. */
      ago.onclick = () => { const r = D.addField(ds.id, String(held.newName || ''), String(held.newValue) === '' ? null : held.newValue); if (r && r.ok) { held.newName = ''; held.newValue = ''; } say(r); };
      abar.appendChild(nin); abar.appendChild(vin); abar.appendChild(ago);
      box.appendChild(abar);

      const m = editMsg.get(ds.id);
      if (m) { const mm = el('div', CSS_WARN, m); mm.className = 'gis-edit-msg'; box.appendChild(mm); }
      return box;
    }

    /* ══ §2d · COLOURING THE MAP BY A COLUMN (#R738) ═══════════════════════════════════════════
       ⚠ THE CLASSIFIER IS js/map-ui.js's, AND SO IS THE LEGEND. `style()` returns the snapshot the
       map was painted from; recomputing the classes here to draw them would be the #R650 shape — two
       calculations of one fact, which drift the first time either is touched — so this reads
       `styleOf()` and prints what is there. The refusals are `styleReason()`'s for the same reason
       the ops' are reasonText's: one sentence per fact, in one place. */
    function styleBlock(ds) {
      const u = UP();
      if (!u || typeof u.style !== 'function' || typeof u.find !== 'function') return null;
      /* A grid is not drawn as features, so there is nothing for a per-feature colouring to paint. */
      if (ds.kind === 'raster') return null;
      const cols = Array.isArray(ds.fields) ? ds.fields : [];
      const box = el('div', 'display:flex;flex-direction:column;gap:6px;min-width:0;');
      box.className = 'gis-style';
      box.appendChild(el('div', CSS_SECTH, window.IntMapLang.t(HOST.lang, 'Colour the map by a column', '属性で地図を色分けする')));
      if (!cols.length) {
        box.appendChild(el('div', CSS_NOTE, window.IntMapLang.t(HOST.lang, 'This dataset carries no attribute columns', 'このデータセットには属性の列がありません', 'Dieser Datensatz hat keine Attributspalten', 'В этом наборе нет столбцов атрибутов', 'Este conjunto no tiene columnas de atributos')));
        return box;
      }
      const held = styleForm.get(ds.id) || { field: '', mode: 'categorical', method: 'quantile', classes: '' };
      styleForm.set(ds.id, held);
      if (!cols.some((c) => c.name === held.field)) held.field = cols[0].name;

      const bar1 = row('');
      const fsel = el('select', CSS_IN + 'flex:1 1 104px;width:auto;min-width:88px;');
      fsel.className = 'gis-style-field';
      cols.forEach((c) => { const o = el('option', '', c.name + ' · ' + c.type); o.value = c.name; if (c.name === held.field) o.selected = true; fsel.appendChild(o); });
      fsel.onchange = () => { held.field = fsel.value; };
      /* The two modes the classifier declares in its own contract (js/map-ui.js style(ref, spec)).
         Their words are the reader's, their values are the API's. */
      const msel = el('select', CSS_IN + 'flex:1 1 104px;width:auto;min-width:88px;');
      msel.className = 'gis-style-mode';
      [['categorical', window.IntMapLang.t(HOST.lang, 'One colour per value', '値ごとに1色')],
       ['graduated', window.IntMapLang.t(HOST.lang, 'A ladder of numbers', '数値の段階')]].forEach((p) => {
        const o = el('option', '', p[1]); o.value = p[0]; if (p[0] === held.mode) o.selected = true; msel.appendChild(o);
      });
      msel.onchange = () => { held.mode = msel.value; render(); };
      bar1.appendChild(fsel); bar1.appendChild(msel);
      box.appendChild(bar1);

      if (held.mode === 'graduated') {
        const bar2 = row('');
        const sel = el('select', CSS_IN + 'flex:1 1 96px;width:auto;min-width:84px;');
        sel.className = 'gis-style-method';
        [['quantile', window.IntMapLang.t(HOST.lang, 'quantiles', '分位')],
         ['equal', window.IntMapLang.t(HOST.lang, 'equal intervals', '等間隔')]].forEach((p) => {
          const o = el('option', '', p[1]); o.value = p[0]; if (p[0] === held.method) o.selected = true; sel.appendChild(o);
        });
        sel.onchange = () => { held.method = sel.value; };
        const cin = el('input', CSS_IN + 'flex:0 1 74px;width:auto;min-width:64px;');
        cin.className = 'gis-style-classes'; cin.type = 'number'; cin.value = held.classes;
        cin.placeholder = window.IntMapLang.t(HOST.lang, 'Classes', '区分数');
        cin.oninput = () => { held.classes = cin.value; };
        bar2.appendChild(sel); bar2.appendChild(cin);
        box.appendChild(bar2);
        /* ⚠ NO DEFAULT IS INVENTED HERE. The classifier has its own, and its ceiling is the number of
           distinguishable colours the app ships — a number this file cannot see. Left empty, the
           parameter is not sent at all, so the reader gets the classifier's answer rather than one
           this panel made up. */
        box.appendChild(el('div', CSS_NOTE, window.IntMapLang.t(HOST.lang, 'Leave the number of classes empty to use the map’s own', '区分数を空欄にすると、地図側の既定に従います')));
      }

      const acts = row('');
      const go = el('button', CSS_BTN, window.IntMapLang.t(HOST.lang, 'Colour it', '色分けする'));
      go.className = 'gis-style-go';
      go.onclick = () => {
        /* ⚠ A DATASET THAT IS NOT ON THE MAP IS DRAWN FIRST, NOT REFUSED. Asking to colour something
           IS asking to see it, and 「先に地図に描いてください」 would be an instruction the panel could
           have carried out — the dead control this file's header is about. draw() is the same one door
           the row's own button uses, and it binds the dataset id, which is how style() finds it. */
        let it = u.find(ds.id);
        if (!it) {
          const C = CORE();
          if (!C || typeof C.draw !== 'function') { styleMsg.set(ds.id, reasonText('map-unavailable')); render(); return; }
          let dr = null;
          try { dr = C.draw(ds.id); } catch (e) { dr = { ok: false, why: 'map-unavailable', detail: { message: e && e.message } }; }
          if (dr && dr.ok === false) { styleMsg.set(ds.id, reasonText(dr.why, dr.detail)); render(); return; }
          drawn.add(ds.id);
          it = u.find(ds.id);
        }
        const spec = { field: held.field, mode: held.mode };
        if (held.mode === 'graduated') {
          spec.method = held.method;
          const n = Number(held.classes);
          if (String(held.classes).trim() !== '' && isFinite(n)) spec.classes = n;
        }
        Promise.resolve().then(() => u.style(ds.id, spec)).then((res) => {
          if (res && res.ok) styleMsg.delete(ds.id);
          else styleMsg.set(ds.id, (typeof u.styleReason === 'function') ? u.styleReason(res && res.why) : reasonText(res && res.why, res && res.detail));
          render();
        }).catch((e) => { styleMsg.set(ds.id, reasonText('op-failed', { message: e && e.message })); render(); });
      };
      acts.appendChild(go);

      const now = (typeof u.styleOf === 'function') ? u.styleOf(ds.id) : null;
      if (now && now.legend) {
        const off = el('button', CSS_BTN, window.IntMapLang.t(HOST.lang, 'Back to one colour', '単色に戻す'));
        off.className = 'gis-style-off';
        off.onclick = () => {
          Promise.resolve().then(() => u.style(ds.id, null)).then(() => { styleMsg.delete(ds.id); render(); })
            .catch((e) => { styleMsg.set(ds.id, reasonText('op-failed', { message: e && e.message })); render(); });
        };
        acts.appendChild(off);
      }
      box.appendChild(acts);
      if (now && now.legend) box.appendChild(legendBox(now.legend));
      const m = styleMsg.get(ds.id);
      if (m) { const mm = el('div', CSS_WARN, m); mm.className = 'gis-style-msg'; box.appendChild(mm); }
      return box;
    }

    /* The legend of the colouring that is ON THE MAP — the snapshot `style()` painted from, printed,
       never re-derived. ⚠ Both greys are named rather than shown as a class: 「その他」 is a fold of
       real values and 「値なし」 is the absence of one, and a reader who reads either as a step of the
       ramp has been told something untrue about their data. */
    function legendBox(lg) {
      const b = el('div', 'display:flex;flex-direction:column;gap:2px;min-width:0;');
      b.className = 'gis-legend';
      const how = (lg.mode === 'graduated')
        ? (lg.method === 'equal' ? window.IntMapLang.t(HOST.lang, 'equal intervals', '等間隔') : window.IntMapLang.t(HOST.lang, 'quantiles', '分位'))
        : window.IntMapLang.t(HOST.lang, 'categories', '分類');
      b.appendChild(el('div', CSS_NOTE, String(lg.field) + ' · ' + how));
      const line = (colour, label, count) => {
        const r = row('gap:6px;'); r.className = 'gis-legend-row';
        const sw = el('span', 'width:10px;height:10px;border-radius:3px;flex:0 0 auto;');
        sw.style.background = String(colour || '');
        r.appendChild(sw);
        r.appendChild(el('span', CSS_NOTE + 'flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;', label));
        r.appendChild(el('span', CSS_NOTE + 'flex:0 0 auto;', nf(count)));
        b.appendChild(r);
      };
      (lg.classes || []).forEach((c) => line(c.color, c.label != null ? String(c.label) : (nf(c.from) + ' – ' + nf(c.to)), c.count));
      if (lg.other) line(lg.other.color, window.IntMapLang.t(HOST.lang, 'Other', 'その他') + ' (' + nf(lg.other.distinct) + ')', lg.other.count);
      if (lg.missing && lg.missing.count) line(lg.missing.color, window.IntMapLang.t(HOST.lang, 'No value', '値なし'), lg.missing.count);
      if (lg.collapsed > 0) b.appendChild(el('div', CSS_NOTE, window.IntMapLang.t(HOST.lang, 'Tied values merged classes', '同値が多く区分が統合されました') + ' (−' + nf(lg.collapsed) + ')'));
      return b;
    }

    /* ══ §2e · THE WAY OUT (#R756) ════════════════════════════════════════════════════════════
       ⚠ THE GIS LAYER COULD TAKE DATA IN AND NOT LET IT OUT. A reader could drop a file, clip it,
       join a table onto it and resample a grid, and then had nowhere to put the answer — and
       js/gis-project.js's own header told such a reader to 「書き出せばよい」 about an export that did
       not exist. This block is that exit, and it is built from js/gis-export.js's DECLARATIONS for
       the reason §1 gives: a hand-made list of formats here would be a second copy of what that
       module can write, and the two would drift the moment one of them learned a format.
       ⚠ WHAT THE FILE DID AND DID NOT KEEP IS PRINTED AFTER IT IS WRITTEN. A CSV cannot hand a
       polygon back as a polygon and cannot carry a licence; saying 「書き出しました」 and nothing
       else is how a reader finds that out a week later, from the wrong file. */

    /* The one place the bytes become a file. ⚠ The anchor is attached to the document before it is
       clicked — a detached one does nothing in Firefox — and the object URL is revoked on the next
       turn of the loop rather than immediately, because revoking it synchronously cancels the
       download that was just started. */
    function saveBytes(bytes, filename, mediaType) {
      const d = doc();
      if (!d || typeof Blob === 'undefined' || !window.URL || typeof URL.createObjectURL !== 'function') return false;
      let url = null;
      try {
        url = URL.createObjectURL(new Blob([bytes], { type: mediaType || 'application/octet-stream' }));
        const a = d.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        (d.body || d.documentElement).appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => { try { URL.revokeObjectURL(url); } catch (_) { } }, 0);
        return true;
      } catch (_) {
        if (url) { try { URL.revokeObjectURL(url); } catch (_) { } }
        return false;
      }
    }

    /* What was written, in the reader's language, out of the answer's own `stated` — never out of
       what the panel assumed the format does. ⚠ The losses come FIRST: a sentence that opens with
       「書き出しました」 and mentions the missing shapes at the end is read as a success. */
    function exportedText(res) {
      const st = (res && res.stated) || {};
      const parts = [window.IntMapLang.t(HOST.lang, 'Written to a file', '書き出しました') + ': ' + String(res.filename || '')];
      if (st.geometry === 'wkt' && st.geometryRoundTrip === false) {
        parts.push(window.IntMapLang.t(HOST.lang,
          'The shapes are in the file as WKT text, but this app reads a CSV back as attributes only — use GeoJSON to bring the shapes back',
          '図形は WKT のテキストとしてファイルに入っていますが、この地図が CSV を読み直すときは属性だけになります。図形ごと戻したい場合は GeoJSON を使ってください'));
      }
      if (st.rowsWithoutGeometry) {
        parts.push(window.IntMapLang.t(HOST.lang, 'Rows with no shape', '図形を持たない行') + ': ' + nf(st.rowsWithoutGeometry));
      }
      if (st.nonFiniteCells) {
        parts.push(window.IntMapLang.t(HOST.lang, 'Cells whose value has no notation in a CSV, left empty', 'CSV に書ける表記が無く空欄にした値') + ': ' + nf(st.nonFiniteCells));
      }
      if (st.nodata != null) {
        parts.push(window.IntMapLang.t(HOST.lang, 'Missing pixels are written as', '欠損した画素は次の値で書いています') + ': ' + nf(st.nodata));
      }
      /* ⚠ BOTH DIRECTIONS, because a sentence that only ever appears when there IS a licence teaches
         nothing about the file that has none ([[intmap-licence-must-be-a-value]]). */
      if (st.license != null) parts.push(window.IntMapLang.t(HOST.lang, 'Licence carried into the file', 'ライセンスをファイルに入れました') + ': ' + String(st.license));
      else if (st.provenanceCarried) parts.push(window.IntMapLang.t(HOST.lang, 'This dataset states no licence, so the file claims none', 'このデータセットはライセンスを述べていないため、ファイルにも何も書いていません'));
      else parts.push(window.IntMapLang.t(HOST.lang, 'This format carries no origin — the GeoJSON export does', 'この形式は出典を運びません。出典ごと渡すには GeoJSON を使ってください'));
      return parts.join(' · ');
    }

    function exportBlock(ds) {
      const sec = el('div', CSS_SECT);
      if (!sec) return null;
      sec.className = 'gis-export';
      sec.appendChild(el('div', CSS_SECTH, window.IntMapLang.t(HOST.lang, 'Export', '書き出し')));
      const X = EXPORT();
      if (!X || typeof X.write !== 'function') {
        /* ⚠ 「まだ来ていない」を「来られなかった」と言わない。 The first is a moment and redraws
           itself; the second is a state the reader can act on. One sentence for both would tell a
           reader with a slow connection that the feature is broken. */
        sec.appendChild(el('div', CSS_NOTE, exportFailed
          ? window.IntMapLang.t(HOST.lang,
            'The export module could not be loaded, so nothing can be written out',
            '書き出しの部品を読み込めなかったため、ファイルに出すことができません')
          : window.IntMapLang.t(HOST.lang,
            'Getting the export module ready',
            '書き出しの部品を用意しています')));
        return sec;
      }
      const list = X.formats(ds.kind === 'raster' ? 'raster' : 'vector') || [];
      if (!list.length) {
        sec.appendChild(el('div', CSS_NOTE, reasonText('export-format-not-for-kind', { kind: ds.kind })));
        return sec;
      }
      const bar = row('');
      const sel = el('select', CSS_IN + 'flex:0 1 auto;width:auto;min-width:104px;');
      sel.className = 'gis-export-format';
      list.forEach((f) => {
        const o = document.createElement('option');
        o.value = f.id;
        /* ⚠ THE LABEL IS THE DECLARATION'S OWN ID, not a table of pretty names here — that table is
           the second copy §1 forbids. What a reader needs beyond the name is on the tooltip: the
           media type and the module that reads the file back. */
        o.textContent = f.id.toUpperCase();
        o.title = String(f.mediaType || '') + (f.readBackBy ? ' · ' + String(f.readBackBy) : '');
        sel.appendChild(o);
      });
      const chosen = exportForm.get(ds.id);
      sel.value = (chosen && list.some((f) => f.id === chosen)) ? chosen : list[0].id;
      exportForm.set(ds.id, sel.value);
      sel.onchange = () => { exportForm.set(ds.id, sel.value); exportMsg.delete(ds.id); render(); };
      bar.appendChild(sel);

      const btn = el('button', CSS_BTN, window.IntMapLang.t(HOST.lang, 'Save to a file', 'ファイルに書き出す'));
      btn.className = 'gis-export-run';
      btn.onclick = () => {
        const opts = { format: exportForm.get(ds.id) || list[0].id };
        /* the band the reader already chose for drawing is the band they mean here too; a second
           picker for the same choice would be two answers to one question */
        const b = drawBand.get(ds.id);
        if (ds.kind === 'raster' && b != null) opts.band = b;
        let res = null;
        try { res = X.write(ds.id, opts); }
        catch (e) { res = { ok: false, why: 'export-serialise-failed', detail: { message: e && e.message } }; }
        if (!res || res.ok === false) exportMsg.set(ds.id, reasonText(res && res.why, res && res.detail));
        else if (!saveBytes(res.bytes, res.filename, res.mediaType)) {
          exportMsg.set(ds.id, window.IntMapLang.t(HOST.lang,
            'The file was written but this browser would not save it',
            'ファイルは作れましたが、このブラウザが保存を受け付けませんでした'));
        } else exportMsg.set(ds.id, exportedText(res));
        render();
      };
      bar.appendChild(btn);
      sec.appendChild(bar);
      const msg = exportMsg.get(ds.id);
      if (msg) { const m = el('div', CSS_NOTE, msg); m.className = 'gis-export-msg'; sec.appendChild(m); }
      return sec;
    }

    function dsCard(ds) {
      const card = el('div', CSS_CARD);
      card.className = 'gis-ds';
      card.setAttribute('data-ds', ds.id);
      const head = el('button', 'width:100%;display:flex;align-items:center;gap:8px;padding:8px 10px;background:transparent;border:none;color:inherit;cursor:pointer;text-align:left;min-height:38px;');
      head.className = 'gis-ds-row';
      const isOpenRow = openRows.has(ds.id);
      head.appendChild(el('span', 'flex:0 0 auto;color:var(--text-muted,#98989f);font-size:10px;', isOpenRow ? '▾' : '▸'));
      const nameCol = el('span', 'flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:2px;');
      const nm = el('span', 'font-size:12.5px;font-weight:600;color:var(--text-main,#f2f2f7);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;', titleOf(ds));
      nm.className = 'gis-ds-name';
      nameCol.appendChild(nm);
      /* 「行」 counts records, and a grid's `count` is PIXELS — the same number under the wrong noun
         would read as a table of 65,536 rows. */
      const unit = (ds.kind === 'raster')
        ? window.IntMapLang.t(HOST.lang, 'pixels', '画素', 'Pixel', 'пикселей', 'píxeles')
        : window.IntMapLang.t(HOST.lang, 'rows', '行', 'Zeilen', 'строк', 'filas');
      const meta = el('span', CSS_NOTE + 'white-space:normal;',
        geomText(ds) + ' · ' + nf(ds.count) + ' ' + unit + ' · ' + crsText(ds) + ' · ' + originText(ds));
      meta.className = 'gis-ds-meta';
      nameCol.appendChild(meta);
      head.appendChild(nameCol);
      /* ⚠ BEFORE THE 「地図に表示中」 BADGE, because it is the more urgent of the two: a dataset that
         is drawn AND stale is being looked at, which is the worst moment for it to say only that it
         is drawn. */
      if (ds.stale) {
        const st = el('span', 'flex:0 0 auto;font-size:10px;color:#ff9f0a;', window.IntMapLang.t(HOST.lang, 'Out of date', '古いまま', 'Veraltet', 'Устарело', 'Desactualizado'));
        st.className = 'gis-ds-stale';
        /* ⚠ (#R738) THE BADGE CARRIES THE RECORD'S OWN REASON. It used to say `input-stale` whatever
           had happened — 「上流の再計算が失敗した」 — and an edit marks its dependents stale for a
           completely different reason (`input-edited`). One wrong sentence on a true badge sends the
           reader looking for a failure that never happened. */
        st.title = reasonText(String(ds.stale.why || 'input-stale'), { id: ds.id });
        head.appendChild(st);
      }
      if (drawn.has(ds.id)) head.appendChild(el('span', 'flex:0 0 auto;font-size:10px;color:var(--primary-color,#0a84ff);', window.IntMapLang.t(HOST.lang, 'Drawn on the map', '地図に表示中', 'Auf der Karte gezeichnet', 'Показан на карте', 'Dibujado en el mapa')));
      head.onclick = () => { if (openRows.has(ds.id)) openRows.delete(ds.id); else openRows.add(ds.id); render(); };
      card.appendChild(head);
      if (!isOpenRow) return card;

      const det = el('div', 'display:flex;flex-direction:column;gap:9px;padding:2px 10px 10px;min-width:0;');
      det.className = 'gis-ds-detail';
      /* ⚠ (#R738) WHAT THE RECORD SAYS ABOUT TIME, AND WHAT IT REFUSED TO SAY. `timeRefused` was
         built in #R735 so a declaration the data does not bear out is refused instead of copied into
         the record — and until now it reached neither this panel nor the map, so a reader who named
         the wrong column got a dataset that looked ordinary and a `time-not-declared` from timeWindow
         much later, with nothing connecting the two. */
      const tTxt = timeText(ds);
      if (tTxt) { const tl = el('div', CSS_NOTE, tTxt); tl.className = 'gis-ds-time'; det.appendChild(tl); }
      if (ds.timeRefused) {
        const tw = el('div', CSS_WARN, reasonText(ds.timeRefused.why, ds.timeRefused.detail));
        tw.className = 'gis-time-refused';
        det.appendChild(tw);
      }
      det.appendChild(fieldsTable(ds));
      const ed = editBlock(ds);
      if (ed) det.appendChild(ed);
      const st = styleBlock(ds);
      if (st) det.appendChild(st);
      const xp = exportBlock(ds);
      if (xp) det.appendChild(xp);
      det.appendChild(lineageBlock(ds));
      const sp = stepParamsBlock(ds);
      if (sp) det.appendChild(sp);

      const bar = row('');
      const C = CORE();
      const u = UP();
      /* ⚠ THE BUTTON EXISTS WHEN THE PATH EXISTS. js/gis-core.js's draw() is the one door to the
         map (it hands the features to window.GeoJSONUpload, which is what the Object List and the
         layer rows already read); where that door is missing the reader gets the SENTENCE instead
         of a control that would do nothing. */
      if (C && typeof C.draw === 'function' && u && typeof u.add === 'function') {
        const on = el('button', CSS_BTN, drawn.has(ds.id)
          ? window.IntMapLang.t(HOST.lang, 'Draw again', 'もう一度描く', 'Erneut zeichnen', 'Показать снова', 'Dibujar otra vez')
          : window.IntMapLang.t(HOST.lang, 'Draw on the map', '地図に描く', 'Auf der Karte zeichnen', 'Показать на карте', 'Dibujar en el mapa'));
        on.className = 'gis-draw';
        /* ⚠ (#R749) A GRID WITH MORE THAN ONE BAND NEEDS THE READER TO SAY WHICH. One band is not a
           choice and gets no control; two or more without one would mean the map is showing whichever
           came first in the file — 「誰も述べていない主張」 in the most literal sense. */
        if (ds.kind === 'raster' && Array.isArray(ds.bands) && ds.bands.length > 1) {
          const bs = el('select', CSS_IN + 'flex:0 1 auto;width:auto;min-width:90px;');
          bs.className = 'gis-draw-band';
          ds.bands.forEach((bd, i) => {
            const o = document.createElement('option');
            o.value = String(i);
            o.textContent = (bd && bd.name != null && String(bd.name)) || (window.IntMapLang.t(HOST.lang, 'Band', 'バンド') + ' ' + (i + 1));
            bs.appendChild(o);
          });
          bs.value = String(drawBand.get(ds.id) || 0);
          bs.onchange = () => { drawBand.set(ds.id, Math.max(0, Math.round(Number(bs.value) || 0))); };
          bar.appendChild(bs);
        }
        on.onclick = () => {
          let res = null;
          const b = drawBand.get(ds.id);
          try { res = C.draw(ds.id, (b == null ? null : { band: b })); } catch (e) { res = { ok: false, why: 'map-unavailable', detail: { message: e && e.message } }; }
          if (res && res.ok === false) dsMsg.set(ds.id, reasonText(res.why, res.detail));
          else { drawn.add(ds.id); dsMsg.delete(ds.id); }
          render();
        };
        bar.appendChild(on);
      } else if (!u || typeof u.add !== 'function') {
        det.appendChild(el('div', CSS_NOTE, reasonText('map-unavailable')));
      }
      const del = el('button', CSS_BTND, window.IntMapLang.t(HOST.lang, 'Delete', '削除', 'Löschen', 'Удалить', 'Eliminar'));
      del.className = 'gis-del';
      del.onclick = () => { confirmDel.add(ds.id); render(); };
      bar.appendChild(del);
      det.appendChild(bar);
      if (drawn.has(ds.id)) det.appendChild(el('div', CSS_NOTE, window.IntMapLang.t(HOST.lang, 'The layer is removed from the import list on the map, not from here', '地図に出したレイヤーを消すのは、地図側の読み込み一覧からです', 'Die Ebene wird in der Importliste auf der Karte entfernt, nicht hier', 'Слой убирается из списка импорта на карте, а не отсюда', 'La capa se quita desde la lista de importación del mapa, no desde aquí')));

      if (confirmDel.has(ds.id)) {
        const kids = downstream(ds.id);
        const warn = el('div', 'display:flex;flex-direction:column;gap:6px;border:1px solid rgba(255,69,58,0.4);border-radius:10px;padding:8px 9px;');
        warn.className = 'gis-del-confirm';
        warn.appendChild(el('div', CSS_WARN, kids.length
          ? window.IntMapLang.t(HOST.lang, 'Deleting this also deletes what was made from it', 'これを削除すると、これから作られたものも一緒に消えます', 'Das Löschen entfernt auch alles, was daraus entstanden ist', 'Удаление уберёт и всё, что из него получено', 'Al eliminarlo se borra también lo que se hizo a partir de él')
            + ' (' + nf(kids.length) + '): ' + kids.map(titleOf).join(', ')
          : window.IntMapLang.t(HOST.lang, 'Delete this dataset?', 'このデータセットを削除しますか', 'Diesen Datensatz löschen?', 'Удалить этот набор данных?', '¿Eliminar este conjunto de datos?')));
        const wbar = row('');
        const yes = el('button', CSS_BTND, window.IntMapLang.t(HOST.lang, 'Delete', '削除', 'Löschen', 'Удалить', 'Eliminar'));
        yes.className = 'gis-del-yes';
        yes.onclick = () => {
          const D = DATA();
          /* deepest first, so nothing is removed while something still names it as its input */
          const all = downstream(ds.id).reverse().concat([ds]);
          all.forEach((rec) => {
            drawn.delete(rec.id); openRows.delete(rec.id); dsMsg.delete(rec.id); dsParams.delete(rec.id);
            /* (#R738) the editing and colouring state is per dataset too, and a later dataset can be
               given the same id by a restored project — state left behind would reappear under it */
            editMsg.delete(rec.id); colForm.delete(rec.id); styleForm.delete(rec.id); styleMsg.delete(rec.id); dsRun.delete(rec.id);
            exportForm.delete(rec.id); exportMsg.delete(rec.id);
            if (cellEdit && cellEdit.id === rec.id) cellEdit = null;
            try { D && D.remove(rec.id); } catch (_) { }
          });
          confirmDel.delete(ds.id); render();
        };
        const no = el('button', CSS_BTN, window.IntMapLang.t(HOST.lang, 'Keep it', 'やめる', 'Behalten', 'Отмена', 'Conservar'));
        no.className = 'gis-del-no';
        no.onclick = () => { confirmDel.delete(ds.id); render(); };
        wbar.appendChild(yes); wbar.appendChild(no);
        warn.appendChild(wbar);
        det.appendChild(warn);
      }
      /* the step block already prints this row for a dataset that HAS one; printing it twice would
         be two sentences about one event */
      const msg = dsMsg.get(ds.id);
      if (msg && !sp) det.appendChild(el('div', CSS_NOTE, msg));
      card.appendChild(det);
      return card;
    }

    function sectionDatasets() {
      const sec = el('div', CSS_SECT); sec.className = 'gis-sect gis-sect-data';
      const D = DATA();
      const list = (D && D.list()) || [];
      sec.appendChild(el('div', CSS_SECTH, window.IntMapLang.t(HOST.lang, 'Datasets', 'データセット', 'Datensätze', 'Наборы данных', 'Conjuntos de datos') + ' · ' + nf(list.length)));
      if (!D) { sec.appendChild(el('div', CSS_WARN, reasonText('registry-missing'))); return sec; }
      if (!list.length) {
        sec.appendChild(el('div', CSS_NOTE, window.IntMapLang.t(HOST.lang, 'Nothing here yet. Drop a file on the map, or run a step below.', 'まだ何もありません。地図にファイルを落とすか、下の処理を実行してください。', 'Noch nichts vorhanden. Legen Sie eine Datei auf die Karte oder führen Sie unten einen Schritt aus.', 'Пока пусто. Перетащите файл на карту или выполните шаг ниже.', 'Aún no hay nada. Suelta un archivo en el mapa o ejecuta un paso abajo.')));
        return sec;
      }
      list.forEach((ds) => sec.appendChild(dsCard(ds)));
      return sec;
    }

    /* ══ §2b · THE MAP'S OWN LAYERS AS INPUT ══════════════════════════════════════════════════
       ⚠ (#R735) js/gis-layers.js HAD NO CALLER. #R732 built the bridge that turns what is already on
       the map into a dataset — sources(), read(), toDataset() — tested it, documented it in three
       files, and then the only references to it anywhere in the program were those tests and that
       prose. A reader could not reach it: this panel knew its refusal codes and not its entrance.
       That is the shape the memory note 「完成した配線が通電しているかは、配線を描く門からは見えない」
       records, and an export nothing calls is not a feature.

       Two doors, because the map holds two kinds of thing. A vector layer becomes features
       (toDataset); a NUMERIC layer — precipitation, elevation, land cover — becomes a grid
       (toRaster, #R735). The window is the reader's choice and it is stated on the record either way. */
    const LAYERS = () => { try { return window.IntMapGisLayers || null; } catch (_) { return null; } };
    const MAPBOUNDS = () => {
      try { const E = window.IntMapGeoEngine; const b = E && E.camera && E.camera.getBounds ? E.camera.getBounds() : null; return b || null; } catch (_) { return null; }
    };

    /* One bake at a time, and the reader can stop it: toRaster awaits one sample per pixel, so a
       256 × 256 window is 65,536 turns of the event loop. `null` when nothing is running. */
    let bake = null;

    function sectionLayers() {
      const sec = el('div', CSS_SECT); sec.className = 'gis-sect gis-sect-layers';
      sec.appendChild(el('div', CSS_SECTH, window.IntMapLang.t(HOST.lang, 'Take from the map', '地図から取り込む', 'Von der Karte übernehmen', 'Взять с карты', 'Tomar del mapa')));
      const L = LAYERS();
      if (!L || typeof L.sources !== 'function') { sec.appendChild(el('div', CSS_NOTE, reasonText('map-unavailable'))); return sec; }
      let list = [];
      try { list = L.sources() || []; } catch (_) { list = []; }
      if (!list.length) {
        sec.appendChild(el('div', CSS_NOTE, window.IntMapLang.t(HOST.lang,
          'No layer on the map is handing features over right now. Switch one on, or move to where its data is.',
          'いま地物を渡せるレイヤーが地図にありません。レイヤーを表示するか、データがある場所へ移動してください。',
          'Derzeit gibt keine Kartenebene Objekte heraus. Schalten Sie eine ein oder bewegen Sie sich dorthin, wo ihre Daten liegen.',
          'Сейчас ни один слой карты не отдаёт объекты. Включите слой или переместитесь туда, где есть его данные.',
          'Ninguna capa del mapa está entregando objetos ahora. Activa una o ve a donde estén sus datos.')));
      }

      /* Shared by both doors: 「表示範囲だけ」. ⚠ Unticked means the WHOLE layer, and that is the
         default because a window is a narrowing a reader should choose, not one they inherit from
         wherever the camera happened to be. */
      const opt = row('');
      const cb = el('input', 'min-width:16px;min-height:16px;');
      cb.type = 'checkbox'; cb.id = 'gis-layer-view-only';
      const lab = el('label', 'font-size:11px;color:var(--text-muted,#98989f);cursor:pointer;',
        window.IntMapLang.t(HOST.lang, 'Only what is in view', '表示範囲だけ', 'Nur der sichtbare Bereich', 'Только то, что видно', 'Solo lo visible'));
      lab.htmlFor = cb.id;
      opt.appendChild(cb); opt.appendChild(lab);
      if (list.length) sec.appendChild(opt);
      const boundsNow = () => (cb.checked ? MAPBOUNDS() : null);

      const msg = el('div', CSS_NOTE, '');
      const say = (t, warn) => { msg.style.cssText = (warn ? CSS_WARN : CSS_NOTE); msg.textContent = String(t || ''); };

      /* ⚠ A RUNNING BAKE OUTLIVES THIS DOM. render() runs on every registry event — somebody else's
         import lands, and the whole panel is rebuilt while 256 rows are still being sampled. The
         controller and the progress live in `bake` (module scope) rather than in a closure over a
         node that is about to be detached, so the line and the STOP BUTTON come back on the next
         repaint. Without this the reader would lose the only way to stop the thing they started. */
      if (bake) {
        const live = row('');
        live.appendChild(el('span', CSS_NOTE, (bake.label || bake.id) + ' · ' + (bake.progress || '…')));
        const stopLive = el('button', CSS_BTND, window.IntMapLang.t(HOST.lang, 'Stop sampling', '取り込みを中止', 'Abtastung abbrechen', 'Остановить выборку', 'Detener el muestreo'));
        stopLive.onclick = () => { try { if (bake && bake.ac) bake.ac.abort(); } catch (_) { } };
        live.appendChild(stopLive);
        sec.appendChild(live);
      }

      list.forEach((s) => {
        const card = el('div', CSS_CARD + 'padding:8px 9px;display:flex;flex-direction:column;gap:5px;');
        card.appendChild(el('div', 'font-size:12px;font-weight:600;overflow-wrap:anywhere;', s.label || s.id));
        const bits = [];
        if (s.geometryType) bits.push(s.geometryType);
        if (typeof s.count === 'number') bits.push(nf(s.count) + ' ' + window.IntMapLang.t(HOST.lang, 'features', '件', 'Objekte', 'объектов', 'objetos'));
        bits.push(s.from === 'layer' ? window.IntMapLang.t(HOST.lang, 'layer', 'レイヤー', 'Ebene', 'слой', 'capa') : window.IntMapLang.t(HOST.lang, 'map source', '地図ソース', 'Kartenquelle', 'источник карты', 'fuente del mapa'));
        card.appendChild(el('div', CSS_NOTE, bits.join(' · ')));

        const acts = row('');
        const take = el('button', CSS_BTN, window.IntMapLang.t(HOST.lang, 'Use as dataset', 'データセットにする', 'Als Datensatz nutzen', 'Сделать набором данных', 'Usar como conjunto'));
        take.onclick = () => {
          const r = L.toDataset(s.id, { bounds: boundsNow() });
          if (r && r.ok) say(window.IntMapLang.t(HOST.lang, 'Registered', '登録しました', 'Registriert', 'Зарегистрировано', 'Registrado') + ' · ' + r.dataset.id);
          else say(reasonText(r && r.why, r && r.detail), true);
        };
        acts.appendChild(take);

        /* ⚠ THE SECOND BUTTON APPEARS ONLY WHERE THE LAYER ANSWERS 「その地点の値は」. Offering it on
           a layer with no sampleAt would be a control whose only outcome is a refusal. */
        if (typeof L.canSample === 'function' && L.canSample(s.id)) {
          const size = el('select', CSS_IN + 'width:auto;min-width:92px;');
          /* Powers of two from 64 to 512: the cost is one await per pixel, so this is 4k to 262k
             awaits — a choice the reader makes with the progress line and the stop button in view,
             rather than a ceiling written here for a cost that depends on which layer is asked. */
          [64, 128, 256, 512].forEach((n) => { const o = el('option', '', n + '×' + n); o.value = String(n); if (n === 128) o.selected = true; size.appendChild(o); });
          const grid = el('button', CSS_BTN, window.IntMapLang.t(HOST.lang, 'Sample into a grid', '格子にする', 'In ein Raster abtasten', 'Собрать в сетку', 'Muestrear en una rejilla'));
          grid.onclick = async () => {
            if (bake) return;
            const n = Number(size.value) || 128;
            const ac = (typeof AbortController === 'function') ? new AbortController() : null;
            bake = { id: s.id, label: s.label || s.id, ac, progress: '' };
            grid.disabled = true;
            const stop = el('button', CSS_BTND, window.IntMapLang.t(HOST.lang, 'Stop sampling', '取り込みを中止', 'Abtastung abbrechen', 'Остановить выборку', 'Detener el muestreo'));
            stop.onclick = () => { try { if (ac) ac.abort(); } catch (_) { } };
            acts.appendChild(stop);
            const r = await L.toRaster(s.id, {
              bounds: MAPBOUNDS(), width: n, height: n, signal: ac ? ac.signal : null,
              onProgress: (p) => {
                const line = window.IntMapLang.t(HOST.lang, 'Reading the layer', 'レイヤーを読んでいます', 'Ebene wird gelesen', 'Чтение слоя', 'Leyendo la capa') + ' · ' + p.rows + '/' + p.of;
                if (bake) bake.progress = line;
                say(line);
              },
            });
            bake = null; grid.disabled = false;
            try { acts.removeChild(stop); } catch (_) { }
            if (r && r.ok) { say(window.IntMapLang.t(HOST.lang, 'Registered', '登録しました', 'Registriert', 'Зарегистрировано', 'Registrado') + ' · ' + r.dataset.id); render(); }
            else say(reasonText(r && r.why, r && r.detail), true);
          };
          acts.appendChild(size); acts.appendChild(grid);
        }
        card.appendChild(acts);
        sec.appendChild(card);
      });
      sec.appendChild(msg);
      return sec;
    }

    /* ══ §3 · RUN A STEP ══════════════════════════════════════════════════════════════════════ */
    const opLabel = (d) => String((d && (d.title || d.label || d.name || d.id)) || '');

    /* What the declaration accepts in slot `i`. A single-entry `accepts` applies to every slot,
       which is what an op with two inputs of the same kind declares. */
    function acceptsAt(decl, i) {
      const a = Array.isArray(decl && decl.accepts) ? decl.accepts : [];
      if (!a.length) return 'any';
      return String(a.length === 1 ? a[0] : (a[i] == null ? 'any' : a[i]));
    }
    /* '' when the pairing is fine, and the SENTENCE when it is not. ⚠ The dataset is still OFFERED
       in the select — an option that quietly vanishes teaches the reader nothing, while a refusal
       that names the geometry tells them which of their datasets to use instead. The code is the
       declaration's own `mismatchWhy` where it states one, so the sentence a reader gets here is
       the same sentence the op would have given after the run. */
    function mismatchText(decl, i, ds) {
      if (!ds) return '';
      /* ⚠ (#R735) THE PAYLOAD IS CHECKED FIRST, because it is the mismatch that makes the geometry
         question meaningless: offering a grid to `dissolve` is not a geometry problem, and answering
         with the geometry sentence would send the reader looking for the wrong thing. Same code the
         op will return after the run, so the sentence before and after agree. */
      const kinds = Array.isArray(decl && decl.kinds) ? decl.kinds : null;
      const wantKind = kinds ? String(kinds.length === 1 ? kinds[0] : (kinds[i] == null ? 'vector' : kinds[i])) : 'vector';
      const gotKind = String(ds.kind || 'vector');
      /* ⚠ (#R819) 'any' IS A SLOT THAT DOES NOT ASK, and this screen has to read it the way the op
         does. js/gis-ops.js run() checks `want !== 'any' && got !== want`; this pre-check said only
         `got !== want`, so a slot declaring 'any' refused a grid HERE that the op would have run —
         the reader could not hand `profile` or `reach` the grid those ops exist to read. The word is
         the declaration's, not a second vocabulary kept here: nothing is listed, the slot is simply
         not asking. ⚠ 'vector' stays the default for a slot that declares nothing, so every op
         written before `kinds` existed is untouched. */
      if (wantKind !== 'any' && gotKind !== wantKind) return reasonText('input-kind', { input: i, expected: wantKind, kind: gotKind });
      const want = acceptsAt(decl, i);
      if (want === 'any') return '';
      const got = ds.geometryType;
      if (String(got || '') === want) return '';
      return reasonText(decl.mismatchWhy || 'geometry-type', { input: i, expected: want, geometryType: got || null });
    }
    function outputText(decl) {
      const o = String((decl && decl.output) || '');
      if (!o) return '';
      const head = window.IntMapLang.t(HOST.lang, 'Produces', '出力', 'Ergebnis', 'Результат', 'Produce') + ': ';
      if (o === 'same-as-input') return head + window.IntMapLang.t(HOST.lang, 'the same geometry as the input', '入力と同じ図形の種類', 'dieselbe Geometrie wie die Eingabe', 'ту же геометрию, что и вход', 'la misma geometría que la entrada');
      return head + o;
    }

    function sectionOps() {
      const sec = el('div', CSS_SECT); sec.className = 'gis-sect gis-sect-ops';
      sec.appendChild(el('div', CSS_SECTH, window.IntMapLang.t(HOST.lang, 'Run a step', '処理を足す', 'Schritt ausführen', 'Выполнить шаг', 'Ejecutar un paso')));
      const O = OPS();
      if (!O || typeof O.ops !== 'function') { sec.appendChild(el('div', CSS_NOTE, reasonText('ops-unavailable'))); return sec; }
      const decls = O.ops() || [];
      if (!decls.length) { sec.appendChild(el('div', CSS_NOTE, window.IntMapLang.t(HOST.lang, 'No steps are registered', '登録されている処理がありません', 'Keine Schritte registriert', 'Шаги не зарегистрированы', 'No hay pasos registrados'))); return sec; }
      if (!opId || !decls.some((d) => String(d.id) === String(opId))) opId = String(decls[0].id);
      const decl = decls.filter((d) => String(d.id) === String(opId))[0];

      const pick = el('select', CSS_IN); pick.className = 'gis-op-select';
      decls.forEach((d) => { const o = el('option', '', opLabel(d)); o.value = String(d.id); if (String(d.id) === String(opId)) o.selected = true; pick.appendChild(o); });
      pick.onchange = () => { opId = pick.value; opMsg = ''; render(); };
      sec.appendChild(pick);
      const outTxt = outputText(decl);
      if (outTxt) sec.appendChild(el('div', CSS_NOTE, outTxt));
      if (decl.needsGeodesy && !GEODESY()) sec.appendChild(el('div', CSS_WARN, reasonText('geodesy-missing')));
      if (decl.needsGeometry && !GEOM()) sec.appendChild(el('div', CSS_WARN, reasonText('geometry-missing')));

      const D = DATA();
      const all = (D && D.list()) || [];
      const nIn = Math.max(0, Number(decl.inputs || 0) || 0);
      const inBox = el('div', 'display:flex;flex-direction:column;gap:6px;min-width:0;'); inBox.className = 'gis-op-inputs';
      if (nIn && !all.length) inBox.appendChild(el('div', CSS_NOTE, window.IntMapLang.t(HOST.lang, 'There is no dataset to run this on yet', 'この処理にかけられるデータセットがまだありません', 'Es gibt noch keinen Datensatz dafür', 'Пока нет набора данных для этого шага', 'Todavía no hay un conjunto de datos para esto')));
      for (let i = 0; i < nIn; i++) {
        const wrap = el('div', 'display:flex;flex-direction:column;gap:3px;min-width:0;');
        wrap.appendChild(el('div', 'font-size:11px;color:var(--text-muted,#98989f);',
          window.IntMapLang.t(HOST.lang, 'Input', '入力', 'Eingabe', 'Вход', 'Entrada') + ' ' + nf(i + 1) + ' · ' + acceptsAt(decl, i)));
        const sel = el('select', CSS_IN); sel.className = 'gis-in-select'; sel.setAttribute('data-slot', String(i));
        const blank = el('option', '', '—'); blank.value = ''; sel.appendChild(blank);
        all.forEach((ds) => {
          const o = el('option', '', titleOf(ds) + ' · ' + geomText(ds) + ' · ' + nf(ds.count));
          o.value = ds.id; if (opInputs[i] === ds.id) o.selected = true; sel.appendChild(o);
        });
        sel.onchange = () => { opInputs[i] = sel.value || null; opMsg = ''; render(); };
        wrap.appendChild(sel);
        const chosen = opInputs[i] ? (D && D.get(opInputs[i])) : null;
        const bad = mismatchText(decl, i, chosen);
        if (bad) wrap.appendChild(el('div', CSS_WARN, bad));
        inBox.appendChild(wrap);
      }
      sec.appendChild(inBox);

      const key = (n) => String(opId) + '|' + n;
      const block = paramBlock(decl, (n) => (opParams.has(key(n)) ? opParams.get(key(n)) : undefined), columnsFromInputs(opInputs));
      sec.appendChild(block.node);

      /* ⚠ (#R738) THE RUNNING STEP AND ITS STOP BUTTON, FROM MODULE STATE. #R735 made five of the
         runners yield every frame so that a signal could be read at all; nothing in the program set
         one. `opRun` holds the controller because render() runs on every registry event — the panel
         is rebuilt while the step is still going, and the reader must not lose the only way to stop
         a 40,000-polygon aggregate they started by mistake. */
      if (opRun) {
        const lrow = row('');
        const sp = el('div', CSS_NOTE + 'flex:1 1 auto;min-width:0;', opRun.progress || progressText(null));
        sp.className = 'gis-op-progress';
        opRun.node = sp;
        const stop = el('button', CSS_BTND, window.IntMapLang.t(HOST.lang, 'Stop this run', '実行を中止する'));
        stop.className = 'gis-op-stop';
        stop.onclick = () => { try { if (opRun && opRun.ac) opRun.ac.abort(); } catch (_) { } };
        lrow.appendChild(sp); lrow.appendChild(stop);
        sec.appendChild(lrow);
      }
      const bar = row('');
      const go = el('button', CSS_BTNP, opBusy
        ? window.IntMapLang.t(HOST.lang, 'Running…', '実行中…', 'Läuft…', 'Выполняется…', 'Ejecutando…')
        : window.IntMapLang.t(HOST.lang, 'Run', '実行', 'Ausführen', 'Выполнить', 'Ejecutar'));
      go.className = 'gis-run';
      go.disabled = !!opBusy;
      go.onclick = () => {
        const params = block.readAll();
        Object.keys(params).forEach((n) => opParams.set(key(n), params[n]));
        const inputs = [];
        for (let i = 0; i < nIn; i++) inputs.push(opInputs[i] || null);
        /* ⚠ CHECKED IN THE ORDER A READER WOULD FIX THEM: a missing input, then a geometry that
           cannot be used, then a setting. */
        const emptySlot = inputs.findIndex((x) => !x);
        if (nIn && emptySlot >= 0) {
          opMsg = window.IntMapLang.t(HOST.lang, 'Choose a dataset for input', '入力のデータセットを選んでください', 'Wählen Sie einen Datensatz für die Eingabe', 'Выберите набор данных для входа', 'Elige un conjunto de datos para la entrada') + ' ' + nf(emptySlot + 1);
          render(); return;
        }
        for (let i = 0; i < nIn; i++) {
          const bad = mismatchText(decl, i, D && D.get(inputs[i]));
          if (bad) { opMsg = window.IntMapLang.t(HOST.lang, 'Input', '入力', 'Eingabe', 'Вход', 'Entrada') + ' ' + nf(i + 1) + ' — ' + bad; render(); return; }
        }
        const miss = block.missing();
        if (miss.length) { opMsg = reasonText('missing-param', { param: miss[0] }); render(); return; }
        opBusy = true; opMsg = '';
        const ac = (typeof AbortController === 'function') ? new AbortController() : null;
        opRun = { ac: ac, progress: progressText(null), node: null };
        render();
        Promise.resolve().then(() => O.run({ op: String(opId), inputs: inputs, params: params }, {
          signal: ac ? ac.signal : null,
          onProgress: (p) => { if (!opRun) return; opRun.progress = progressText(p); if (opRun.node) { try { opRun.node.textContent = opRun.progress; } catch (_) { } } },
        })).then((res) => {
          opBusy = false; opRun = null;
          if (res && res.ok && res.dataset) {
            openRows.add(res.dataset.id);
            opMsg = window.IntMapLang.t(HOST.lang, 'Made', '作成しました', 'Erstellt', 'Создано', 'Creado') + ': ' + titleOf(res.dataset)
              + ' · ' + nf(res.dataset.count) + ' ' + window.IntMapLang.t(HOST.lang, 'rows', '行', 'Zeilen', 'строк', 'filas');
            /* ⚠ AND WHAT THE STEP MEASURED WHILE IT RAN. A join that matched nothing produces a
               perfectly ordinary 「作成しました · 1,741 行」 unless its counts are printed. */
            const st = statsText(res.stats);
            if (st) opMsg += ' — ' + st;
          } else opMsg = reasonText(res && res.why, res && res.detail);
          render();
        }).catch((e) => { opBusy = false; opRun = null; opMsg = reasonText('op-failed', { message: e && e.message }); render(); });
      };
      bar.appendChild(go);
      sec.appendChild(bar);
      if (opMsg) { const m = el('div', CSS_NOTE, opMsg); m.className = 'gis-op-msg'; sec.appendChild(m); }
      return sec;
    }

    /* ══ §4 · PROJECTS ════════════════════════════════════════════════════════════════════════ */
    function reloadProjects() {
      const P = PROJ();
      if (!P || typeof P.list !== 'function' || projLoading) return;
      projLoading = true;
      Promise.resolve().then(() => P.list()).then((rows) => {
        projRows = Array.isArray(rows) ? rows : [];
        projLoading = false; render();
      }).catch(() => { projRows = []; projLoading = false; render(); });
    }

    function sectionProject() {
      const sec = el('div', CSS_SECT); sec.className = 'gis-sect gis-sect-proj';
      sec.appendChild(el('div', CSS_SECTH, window.IntMapLang.t(HOST.lang, 'Project', 'プロジェクト', 'Projekt', 'Проект', 'Proyecto')));
      const P = PROJ();
      if (!P || typeof P.save !== 'function') {
        sec.appendChild(el('div', CSS_NOTE, window.IntMapLang.t(HOST.lang, 'The project module has not loaded, so nothing can be saved or reopened', 'プロジェクトモジュールが読み込まれていないため、保存も読み込みもできません', 'Das Projektmodul ist nicht geladen, daher kann nichts gespeichert oder geöffnet werden', 'Модуль проекта не загружен, поэтому сохранение и открытие недоступны', 'El módulo de proyecto no está cargado, así que no se puede guardar ni reabrir')));
        return sec;
      }
      let ok = true;
      try { ok = (typeof P.available === 'function') ? !!P.available() : true; } catch (_) { ok = false; }
      if (!ok) { sec.appendChild(el('div', CSS_WARN, reasonText('storage-unavailable'))); return sec; }

      const saveRow = row('');
      const nameIn = el('input', CSS_IN + 'flex:1 1 130px;width:auto;min-width:110px;');
      nameIn.className = 'gis-proj-name'; nameIn.type = 'text'; nameIn.value = projName;
      nameIn.placeholder = window.IntMapLang.t(HOST.lang, 'Project name', 'プロジェクト名', 'Projektname', 'Название проекта', 'Nombre del proyecto');
      nameIn.oninput = () => { projName = nameIn.value; };
      const save = el('button', CSS_BTNP, window.IntMapLang.t(HOST.lang, 'Save', '保存', 'Speichern', 'Сохранить', 'Guardar'));
      save.className = 'gis-proj-save';
      save.onclick = () => {
        const nm = String(nameIn.value || '').trim();
        if (!nm) { projMsg = window.IntMapLang.t(HOST.lang, 'Give the project a name first', '先にプロジェクト名を入れてください', 'Geben Sie dem Projekt zuerst einen Namen', 'Сначала укажите название проекта', 'Primero dale un nombre al proyecto'); render(); return; }
        Promise.resolve().then(() => P.save(nm)).then((res) => {
          if (res && res.ok === false) projMsg = reasonText(res.why, res.detail);
          else {
            projMsg = window.IntMapLang.t(HOST.lang, 'Project saved', 'プロジェクトを保存しました', 'Projekt gespeichert', 'Проект сохранён', 'Proyecto guardado') + ': ' + nm
              + ((res && res.datasets != null) ? ' · ' + nf(res.datasets) + ' ' + window.IntMapLang.t(HOST.lang, 'datasets', 'データセット', 'Datensätze', 'наборов данных', 'conjuntos de datos') : '');
            projName = '';
          }
          projRows = null; reloadProjects(); render();
        }).catch((e) => { projMsg = reasonText('write-failed', { message: e && e.message }); render(); });
      };
      saveRow.appendChild(nameIn); saveRow.appendChild(save);
      sec.appendChild(saveRow);

      const listBox = el('div', 'display:flex;flex-direction:column;gap:5px;min-width:0;'); listBox.className = 'gis-proj-list';
      if (projRows == null) {
        listBox.appendChild(el('div', CSS_NOTE, window.IntMapLang.t(HOST.lang, 'Reading the saved projects…', '保存されたプロジェクトを読み出しています…', 'Gespeicherte Projekte werden gelesen…', 'Чтение сохранённых проектов…', 'Leyendo los proyectos guardados…')));
        reloadProjects();
      } else if (!projRows.length) {
        listBox.appendChild(el('div', CSS_NOTE, window.IntMapLang.t(HOST.lang, 'No saved projects yet', '保存されたプロジェクトはまだありません', 'Noch keine gespeicherten Projekte', 'Сохранённых проектов пока нет', 'Aún no hay proyectos guardados')));
      } else {
        projRows.forEach((p) => {
          const r = row(''); r.className = 'gis-proj-row';
          const label = String((p && (p.name || p.id)) || '');
          const cell = el('span', 'flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:1px;');
          cell.appendChild(el('span', 'font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;', label));
          if (p && p.datasets != null) cell.appendChild(el('span', CSS_NOTE, nf(p.datasets) + ' ' + window.IntMapLang.t(HOST.lang, 'datasets', 'データセット', 'Datensätze', 'наборов данных', 'conjuntos de datos')));
          r.appendChild(cell);
          const ld = el('button', CSS_BTN, window.IntMapLang.t(HOST.lang, 'Open', '開く', 'Öffnen', 'Открыть', 'Abrir'));
          ld.className = 'gis-proj-load';
          ld.onclick = () => {
            Promise.resolve().then(() => P.load(p && p.id)).then((res) => {
              const restored = (res && res.restored != null) ? Number(res.restored) : null;
              const failed = (res && Array.isArray(res.failed)) ? res.failed : [];
              if (res && res.ok === false && !restored) projMsg = reasonText(res.why, res.detail);
              else {
                projMsg = window.IntMapLang.t(HOST.lang, 'Project opened', 'プロジェクトを読み込みました', 'Projekt geöffnet', 'Проект открыт', 'Proyecto abierto') + ': ' + label
                  + (restored == null ? '' : ' · ' + nf(restored) + ' ' + window.IntMapLang.t(HOST.lang, 'datasets', 'データセット', 'Datensätze', 'наборов данных', 'conjuntos de datos'));
                if (failed.length) projMsg += ' — ' + failed.slice(0, 3).map((f) => reasonText(f && f.why, f && f.detail)).join(' / ');
                projMsg += reopenNotes(res);
              }
              render();
            }).catch((e) => { projMsg = reasonText('read-failed', { message: e && e.message }); render(); });
          };
          const rm = el('button', CSS_BTND, window.IntMapLang.t(HOST.lang, 'Delete', '削除', 'Löschen', 'Удалить', 'Eliminar'));
          rm.className = 'gis-proj-del';
          rm.onclick = () => {
            Promise.resolve().then(() => P.remove(p && p.id)).then((res) => {
              projMsg = (res && res.ok === false)
                ? reasonText(res.why, res.detail)
                : window.IntMapLang.t(HOST.lang, 'Deleted', '削除しました', 'Gelöscht', 'Удалено', 'Eliminado') + ': ' + label;
              projRows = null; reloadProjects(); render();
            }).catch((e) => { projMsg = reasonText('write-failed', { message: e && e.message }); render(); });
          };
          r.appendChild(ld); r.appendChild(rm);
          listBox.appendChild(r);
        });
      }
      sec.appendChild(listBox);
      if (projMsg) { const m = el('div', CSS_NOTE, projMsg); m.className = 'gis-proj-msg'; sec.appendChild(m); }
      return sec;
    }

    /* ══ §5 · THE PANEL ITSELF ════════════════════════════════════════════════════════════════ */
    function ensurePanel() {
      const d = doc(); if (!d) return null;
      if (panel) return panel;
      const existing = d.getElementById('gis-panel');
      if (existing) { panel = existing; bodyEl = panel.querySelector('.gis-body'); return panel; }
      panel = el('div', CSS_PANEL);
      panel.id = 'gis-panel';
      panel.className = 'gis-panel';
      const head = el('div', CSS_HEAD); head.className = 'gis-head';
      const ttl = el('span', 'flex:1 1 auto;font-size:13px;font-weight:600;color:var(--text-main,#f2f2f7);', window.IntMapLang.t(HOST.lang, 'Data and analysis', 'データと分析', 'Daten und Analyse', 'Данные и анализ', 'Datos y análisis'));
      ttl.className = 'gis-title';
      const x = el('button', 'flex:0 0 auto;min-width:32px;min-height:32px;border:none;background:transparent;color:var(--text-muted,#98989f);font-size:17px;line-height:1;cursor:pointer;', '×');
      x.className = 'gis-close';
      x.title = window.IntMapLang.t(HOST.lang, 'Close', '閉じる', 'Schließen', 'Закрыть', 'Cerrar');
      x.onclick = () => close();
      head.appendChild(ttl); head.appendChild(x);
      bodyEl = el('div', CSS_BODY); bodyEl.className = 'gis-body';
      panel.appendChild(head); panel.appendChild(bodyEl);
      (d.getElementById('map-container') || d.body).appendChild(panel);
      try { if (HOST && typeof HOST.makeDraggable === 'function') HOST.makeDraggable(panel, head); else if (typeof window.makeDraggable === 'function') window.makeDraggable(panel, head); } catch (_) { }
      return panel;
    }

    /* One repaint for the whole panel. ⚠ The scroll position is carried across, because the registry
       emits on every add — a repaint that jumped to the top would move the table out from under a
       reader who is reading it while somebody else's import finishes. */
    function render() {
      if (!isOpen()) return;
      const p = ensurePanel(); if (!p || !bodyEl) return;
      const top = bodyEl.scrollTop;
      bodyEl.textContent = '';
      bodyEl.appendChild(sectionDatasets());
      bodyEl.appendChild(sectionLayers());
      bodyEl.appendChild(sectionOps());
      bodyEl.appendChild(sectionProject());
      try { bodyEl.scrollTop = top; } catch (_) { }
    }

    function isOpen() { return !!(panel && panel.style && panel.style.display !== 'none'); }

    function open() {
      const p = ensurePanel(); if (!p) return false;
      p.style.display = 'flex';
      const D = DATA();
      if (!unsub && D && typeof D.subscribe === 'function') { try { unsub = D.subscribe(() => render()); } catch (_) { unsub = null; } }
      try { if (typeof window.bringToFront === 'function') window.bringToFront(p); } catch (_) { }
      render();
      return true;
    }

    function close() {
      if (!panel) return false;
      panel.style.display = 'none';
      if (unsub) { try { unsub(); } catch (_) { } unsub = null; }
      return true;
    }

    function toggle() { return isOpen() ? close() : open(); }
    function refresh() { render(); return isOpen(); }

    const API = { open, close, toggle, isOpen, refresh, reasonText };
    try { window.IntMapGisPanel = API; } catch (_) { }
    return API;
  })();
}
