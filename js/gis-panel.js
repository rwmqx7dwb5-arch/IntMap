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
      if (code === 'buffer-needs-points') return window.IntMapLang.t(HOST.lang, 'A buffer is drawn around points, and this dataset holds none', 'バッファは点のまわりに描くもので、このデータセットには点がありません', 'Ein Puffer wird um Punkte gelegt; dieser Datensatz enthält keine', 'Буфер строится вокруг точек, а в этом наборе их нет', 'El área de influencia se traza alrededor de puntos y este conjunto no tiene ninguno') + par(d.geometryType);
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
      if (code === 'clip-window-not-convex') return window.IntMapLang.t(HOST.lang, 'The clipping shape must be convex, and this one is not', '切り抜きの形は凸形でなければなりませんが、これは凸形ではありません', 'Die Zuschneideform muss konvex sein; diese ist es nicht', 'Форма обрезки должна быть выпуклой, а эта — нет', 'La forma de recorte debe ser convexa y esta no lo es') + par(d.feature == null ? '' : (window.IntMapLang.t(HOST.lang, 'feature', '地物', 'Objekt', 'объект', 'elemento') + ' ' + nf(d.feature)));
      if (code === 'clip-window-crosses-antimeridian') return window.IntMapLang.t(HOST.lang, 'The clipping shape crosses the 180° meridian; split it in two', '切り抜きの形が経度180度線をまたいでいます。2つに分けてください', 'Die Zuschneideform überquert den 180°-Meridian; teilen Sie sie in zwei', 'Форма обрезки пересекает 180-й меридиан — разделите её надвое', 'La forma de recorte cruza el meridiano 180°; divídela en dos');
      if (code === 'output-column-in-use') return window.IntMapLang.t(HOST.lang, 'The input already has a column of that name, and the result would overwrite it', '入力に同じ名前の列が既にあり、結果がそれを上書きしてしまいます', 'Die Eingabe hat bereits eine Spalte dieses Namens; das Ergebnis würde sie überschreiben', 'Во входе уже есть столбец с таким именем — результат перезаписал бы его', 'La entrada ya tiene una columna con ese nombre y el resultado la sobrescribiría') + par(d.name);
      if (code === 'id-in-use') return window.IntMapLang.t(HOST.lang, 'A dataset with that id is already registered', 'その ID のデータセットは既に登録されています', 'Ein Datensatz mit dieser ID ist bereits registriert', 'Набор данных с таким идентификатором уже зарегистрирован', 'Ya hay un conjunto de datos registrado con ese identificador') + par(d.id);

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
    const confirmDel = new Set();        /* dataset ids showing 「本当に消しますか」 */
    const dsMsg = new Map();             /* dataset id → the last recompute sentence */
    const dsParams = new Map();          /* dataset id → the edited copy of its step's settings */
    let opId = null;                     /* the op chosen in §3 */
    let opInputs = [];                   /* dataset id per input slot */
    const opParams = new Map();          /* opId + '|' + param name → the value typed for it */
    let opMsg = '', opBusy = false;
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
    function geomText(ds) {
      const g = ds && ds.geometryType;
      return g ? String(g) : window.IntMapLang.t(HOST.lang, 'no geometry', '図形なし', 'keine Geometrie', 'без геометрии', 'sin geometría');
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
      const table = el('table', 'border-collapse:collapse;font-size:11px;white-space:nowrap;');
      const thead = el('thead', ''), htr = el('tr', '');
      cols.forEach((c) => {
        const th = el('th', 'text-align:left;padding:5px 8px;border-bottom:1px solid var(--glass-border,rgba(128,128,128,0.22));position:sticky;top:0;background:var(--card-bg,#1c1c1e);');
        th.appendChild(el('div', 'font-weight:600;color:var(--text-main,#f2f2f7);', c.name));
        const meta = String(c.type) + (c.empty ? ' · ' + nf(c.empty) + ' ' + window.IntMapLang.t(HOST.lang, 'empty', '空', 'leer', 'пусто', 'vacías') : '');
        th.appendChild(el('div', 'font-weight:400;color:var(--text-muted,#98989f);', meta));
        htr.appendChild(th);
      });
      thead.appendChild(htr); table.appendChild(thead);
      const tbody = el('tbody', '');
      let feats = [];
      try { feats = ds.features() || []; } catch (_) { feats = []; }
      const LIMIT = 200;
      feats.slice(0, LIMIT).forEach((f) => {
        const tr = el('tr', '');
        cols.forEach((c) => {
          const v = ((f && f.properties) || {})[c.name];
          const s = v == null ? '' : (typeof v === 'number' ? nf(v) : String(v));
          const td = el('td', 'padding:4px 8px;border-bottom:1px solid rgba(128,128,128,0.12);color:var(--text-main,#f2f2f7);max-width:180px;overflow:hidden;text-overflow:ellipsis;', s.length > 60 ? s.slice(0, 60) + '…' : s);
          if (s.length > 60) td.title = s;
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      wrap.appendChild(table);
      out.appendChild(wrap);
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
      const bar = row('');
      const go = el('button', CSS_BTNP, window.IntMapLang.t(HOST.lang, 'Recompute', '再計算', 'Neu berechnen', 'Пересчитать', 'Recalcular'));
      go.className = 'gis-recalc';
      go.onclick = () => {
        const P = PROJ();
        const params = block.readAll();
        dsParams.set(ds.id, params);
        const miss = block.missing();
        if (miss.length) { dsMsg.set(ds.id, reasonText('missing-param', { param: miss[0] })); render(); return; }
        if (!P || typeof P.setParams !== 'function') { dsMsg.set(ds.id, reasonText('ops-unavailable')); render(); return; }
        dsMsg.set(ds.id, window.IntMapLang.t(HOST.lang, 'Recomputing…', '再計算中…', 'Wird neu berechnet…', 'Пересчёт…', 'Recalculando…'));
        render();
        Promise.resolve().then(() => P.setParams(ds.id, params)).then((res) => {
          dsMsg.set(ds.id, recomputeText(res));
          /* the rebuild removes and re-adds every downstream dataset, so anything that was on the
             map is a layer of the OLD result — the row says so rather than pretending otherwise */
          ((res && res.rebuilt) || []).forEach((id) => drawn.delete(id));
          render();
        }).catch((e) => { dsMsg.set(ds.id, reasonText('op-failed', { message: e && e.message })); render(); });
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
      const meta = el('span', CSS_NOTE + 'white-space:normal;',
        geomText(ds) + ' · ' + nf(ds.count) + ' ' + window.IntMapLang.t(HOST.lang, 'rows', '行', 'Zeilen', 'строк', 'filas') + ' · ' + originText(ds));
      meta.className = 'gis-ds-meta';
      nameCol.appendChild(meta);
      head.appendChild(nameCol);
      if (drawn.has(ds.id)) head.appendChild(el('span', 'flex:0 0 auto;font-size:10px;color:var(--primary-color,#0a84ff);', window.IntMapLang.t(HOST.lang, 'Drawn on the map', '地図に表示中', 'Auf der Karte gezeichnet', 'Показан на карте', 'Dibujado en el mapa')));
      head.onclick = () => { if (openRows.has(ds.id)) openRows.delete(ds.id); else openRows.add(ds.id); render(); };
      card.appendChild(head);
      if (!isOpenRow) return card;

      const det = el('div', 'display:flex;flex-direction:column;gap:9px;padding:2px 10px 10px;min-width:0;');
      det.className = 'gis-ds-detail';
      det.appendChild(fieldsTable(ds));
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
        on.onclick = () => {
          let res = null;
          try { res = C.draw(ds.id); } catch (e) { res = { ok: false, why: 'map-unavailable', detail: { message: e && e.message } }; }
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
        opBusy = true; opMsg = ''; render();
        Promise.resolve().then(() => O.run({ op: String(opId), inputs: inputs, params: params })).then((res) => {
          opBusy = false;
          if (res && res.ok && res.dataset) {
            openRows.add(res.dataset.id);
            opMsg = window.IntMapLang.t(HOST.lang, 'Made', '作成しました', 'Erstellt', 'Создано', 'Creado') + ': ' + titleOf(res.dataset)
              + ' · ' + nf(res.dataset.count) + ' ' + window.IntMapLang.t(HOST.lang, 'rows', '行', 'Zeilen', 'строк', 'filas');
          } else opMsg = reasonText(res && res.why, res && res.detail);
          render();
        }).catch((e) => { opBusy = false; opMsg = reasonText('op-failed', { message: e && e.message }); render(); });
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
