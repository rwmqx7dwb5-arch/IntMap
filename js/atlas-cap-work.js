/* ============================================================================
 *  IntMap · Atlas capabilities — the `work.*` namespace   (js/atlas-cap-work.js)
 * ----------------------------------------------------------------------------
 *  ONE ROW, because a job is one thing with several verbs (js/atlas-cap-data.js `gisProject` is the same shape).
 *  The data and the rules are js/atlas-work-store.js; this file is the DOOR, and every action CALLS an existing part:
 *    dataset out  → js/gis-export.js write()+save()   (the one dataset writer; a dataset is snapshotted with it)
 *    dataset back → the GIS registry's add()          (window.IntMapData — what compute.run's outputs also use)
 *    chart        → js/atlas-chart.js render()        (the same renderer chart.compose draws with; the spec is kept too, so it re-renders)
 *    attachments  → ATTACH_LOG.find()                 (the conversation's own files; a PDF stays an attachment — it is read by the model)
 *    Python       → compute.run                       (its code and result are filed as a `code` product; this file never runs code)
 *    persistence  → the notebook's store technique    (makeNotebookStore with the work normalizer — see the store's header)
 *  The investigation notebook stays hidden (NOTEBOOK_SHOWN is not touched and not read): a work is not a notebook turn.
 * ==========================================================================*/
import { str, num, list, one, obj } from './atlas-caps.js';
import { ATTACH_LOG } from './atlas-attach-log.js';
import { PRODUCT_KINDS, productKinds, WORKSPACES, chooseWorkspace, newWorkId, normalizeWork, withProduct, currentProducts, findProduct,
  compareProducts, fileOf, workToMarkdown, workToFile, deviceWorkStore, WORK_STATE } from './atlas-work-store.js';


export function workStore() { return WORK_STATE.store || (WORK_STATE.store = deviceWorkStore(typeof indexedDB !== 'undefined' ? indexedDB : null)); }
/** tests and the page reset the module's memory of "the job we are on" */
export function _setStoreForTest(s) { WORK_STATE.store = s; WORK_STATE.current = null; }

async function target(a) {
  const S = workStore();
  const id = String(a.id || a.work || '').trim() || WORK_STATE.current;
  if (id) { const w = await S.get(id); if (w) return { w }; if (a.id || a.work) return { w: null, why: 'not-found', q: id }; }
  const q = String(a.query || '').trim();
  const hits = await S.list(q);
  if (q) return hits.length ? { w: hits[0], also: hits.slice(1, 6) } : { w: null, why: 'not-found', q };
  const open = hits.find((w) => w.status === 'open');
  return open ? { w: open } : { w: null, why: 'no-work' };
}

const when = (ms) => { try { return new Date(ms).toISOString().replace('T', ' ').slice(0, 16) + ' UTC'; } catch (_) { return ''; } };
function describe(w, esc, L) {
  const ps = currentProducts(w);
  return '<div><b>' + esc(w.title) + '</b> · <code>' + esc(w.id) + '</code> · ' + esc(w.status) + ' · ' + esc(when(w.updatedAt)) + '</div>'
    + (w.workspace && w.workspace.id ? '<div>' + esc(L('Workspace', '作業場')) + ': ' + esc(w.workspace.id) + '</div>' : '')
    + (ps.length ? '<ul style="margin:3px 0 3px 18px;padding:0;">' + ps.map((p) => '<li><b>' + esc(p.name) + '</b> · ' + esc(p.kind) + (p.version > 1 ? ' v' + p.version : '') + ' · <code>' + esc(p.id) + '</code>' + (p.note ? ' — ' + esc(p.note.slice(0, 100)) : '') + '</li>').join('') + '</ul>'
      : '<div>' + esc(L('No products yet.', 'まだ成果物はありません。')) + '</div>');
}

/* what the page can measure about the workspaces (the store cannot probe a window) */
function availability() {
  const w = typeof window !== 'undefined' ? window : {}, out = {};
  WORKSPACES.forEach((x) => { if (x.probe) out[x.id] = !!w[x.probe] || (w.IntMapLazy ? true : false); });   /* a lazy chunk not loaded yet is still obtainable */
  return out;
}

/* the content of a product from what the call carried — `from` names an existing part to read it out of */
async function gather(a, K) {
  const kind = String(a.kind || '');
  const from = obj_(a.from);
  if (kind === 'dataset') {
    const ref = String(from.dataset || a.dataset || '').trim();
    if (!ref) return { problem: 'needs-source', detail: 'from.dataset' };
    await window.IntMapLazy.need('gisCore');
    const D = window.IntMapData, ds = D && typeof D.get === 'function' ? D.get(ref) : null;
    if (!ds) return { problem: 'no-such-dataset', detail: ref };
    const feats = typeof ds.features === 'function' ? ds.features() : (ds.features || []);
    const geo = ds.withGeometry > 0 || ds.kind === 'raster';
    if (ds.kind === 'raster') return { problem: 'raster-not-kept-inline', detail: 'export it as a file with gisExport (GeoTIFF)' };
    const licence = ds.provenance && (ds.provenance.licence || ds.provenance.license);
    const fields = (ds.fields || []).map((f) => ({ name: f.name, type: f.type }));
    if (geo) return { content: { format: 'geojson', features: feats, fields, licence }, from: { dataset: ds.id, title: ds.title } };
    const cols = fields.map((f) => f.name);
    return { content: { format: 'table', columns: cols, rows: feats.map((f) => cols.map((c) => (f.properties || {})[c])), fields, licence }, from: { dataset: ds.id, title: ds.title } };
  }
  if (kind === 'chart' && obj_(a.spec).kind) {
    await window.IntMapLazy.need('atlasChart');
    const C = window.IntMapAtlasChart, r = C && C.render ? C.render(a.spec) : null;
    if (!r || !r.ok) return { problem: 'chart-refused', detail: r ? r.reason + (r.detail ? ' ' + r.detail : '') : 'renderer-unavailable' };
    const m = /<svg[\s\S]*<\/svg>/.exec(r.html || '');
    return { content: { spec: a.spec, svg: m ? m[0] : undefined }, from: { chart: a.spec.kind } };
  }
  if (from.attachment && (kind === 'image' ? a.dataUrl == null && a.svg == null : kind === 'document' && a.text == null)) {
    const rec = ATTACH_LOG.find(K._curTurn, from.attachment);
    if (!rec) return { problem: 'no-such-attachment', detail: ATTACH_LOG.names(K._curTurn).join(', ') };
    if (kind === 'image' && rec.kind === 'image') return { content: { dataUrl: rec.dataUrl }, from: { attachment: rec.name } };
    if (kind === 'document' && rec.kind === 'text') return { content: { text: rec.text, format: 'text' }, from: { attachment: rec.name } };
    return { problem: 'attachment-kind-mismatch', detail: rec.kind + ' → ' + kind + ' (a PDF is read by the model, then filed as a document or table it wrote)' };
  }
  const c = {};
  ['text', 'language', 'columns', 'rows', 'format', 'svg', 'spec', 'dataUrl', 'mime', 'projectId', 'recipe', 'result', 'features', 'fields'].forEach((k) => { if (a[k] != null) c[k] = a[k]; });
  if (kind === 'table' && !c.columns && Array.isArray(a.rows) && a.rows[0] && !Array.isArray(a.rows[0])) { c.columns = Object.keys(a.rows[0]); }
  return { content: c, from: a.from ? from : null };
}
const obj_ = (x) => (x && typeof x === 'object' && !Array.isArray(x)) ? x : {};

export default [
  /* column 7 'persist' — a job is written to this device's IndexedDB and `export` hands a file to the reader; column 8 'none':
     nothing here reaches outside the device or runs code, and a button in front of a save is a blind approval (as for gisProject). */
  {
    row: ['work.job',                   'work',           'workProduct,workProducts,saveWork,myWork,deliverable,deliverables,continueWork',  'research','none',    '',                       'explanation',         'persist', 'none',   '',         ''],
    ui: { none: '2026-11-20' },
    doc: [
      { in: 'work.job', text: '{"type":"work","action":"start"|"add"|"list"|"open"|"get"|"restore"|"compare"|"export"|"workspace"|"finish"|"remove","id"?:str,"goal"?:str,"title"?:str,"kind"?:"dataset"|"table"|"code"|"image"|"document"|"chart"|"analysis"|"answer","name"?:str,"from"?:{"dataset"?:ID,"attachment"?:str},"text"?:str,"columns"?:[str],"rows"?:[[…]],"language"?:str,"spec"?:obj,"svg"?:str,"summary"?:str,"needs"?:{"language"?:"none"|"python"|"gis","binaryFiles"?:bool,"network"?:bool,"geometry"?:bool,"persistFiles"?:bool,"packages"?:[str]},"as"?:"md"|"json"|"file"} = 作業成果物 / 調査の継続 / KEEP WHAT A JOB LEAVES, TOGETHER, AND PICK IT UP AGAIN. A JOB is more than one reply — "compare these PDFs in a table", "make a briefing with charts from open data", "write code, compute, explain", "carry on tomorrow" — and it leaves DIFFERENT things that belong together. `start` opens a job with its goal (give `id` to carry on an earlier one; the newest open job is the default for every other action); `add` files a PRODUCT into it: kind "table" ({columns,rows} — e.g. the comparison you built from the attached PDFs, with from.attachment naming a source), "dataset" (from.dataset = a dataset id of this session, snapshotted with the file writer; restorable), "code" ({language,text,result?} — the Python you ran with compute.run and what it answered), "chart" ({spec} as for the chart step — it is drawn and kept), "image" (from.attachment or dataUrl/svg), "document"/"answer" ({text}), "analysis" ({projectId} of a saved gisProject). The same name+kind filed again is the NEXT VERSION — the earlier stays and `compare` shows what changed BY CODE (rows by their first-column key, text by lines). `list`/`open` find jobs (by words or id), `get` returns one product\'s content, `restore` puts a dataset product back into the session as a NEW dataset, `export` hands the reader a file (as "md" a write-up of the whole job, "json" the bundle another device can import, "file" one product as its own file — a dataset product is written by the dataset writer with the format you name). `finish` records the summary and marks it done. A product is refused BY NAME when it cannot be kept whole (too-large: export it as a file instead) — nothing is truncated. WHERE CODE RUNS is a choice from what the job NEEDS: `workspace` with `needs` returns the workspaces that satisfy it and the reason each other one does not — "reading" (you read the attachments yourself; no code), "gis", "pyodide" (compute.run), and "server-files" (NOT IN THIS BUILD: code that must parse PDF/Excel bytes or write files that outlive the tab cannot be run — say so and do the reading yourself, never pretend). ' },
    ],
    /* the reader's own words for it (scored as spellings — js/atlas-capabilities.js scoreParts): the Japanese phrases, then the English ones */
    phrases: () => ['作業成果物', '成果物', '調査の継続', '仕事の続き'].concat(['work product', 'deliverable', 'carry on the job']),
    schema: () => ({ type: 'object', required: ['action'], properties: {
      action: one('start', 'add', 'list', 'open', 'get', 'restore', 'compare', 'export', 'workspace', 'finish', 'remove'),
      id: str(), work: str(), query: str(), goal: str(), title: str(), summary: str(), status: one('open', 'done', 'blocked'),
      kind: one.apply(null, productKinds()), name: str(), product: str(), versions: list(num(1), 2, 2), note: str(),
      from: obj(), text: str(), language: str(), format: str(), columns: list(str()), rows: list({}), svg: str(), spec: obj(), dataUrl: str(), mime: str(), projectId: str(), result: obj(),
      needs: obj(), as: one('md', 'json', 'file'), dataset: str(), limit: num(1, 200) } }),
    async run(a, dctx, K) { const R = K.R, warn = K.warn, L = K.L, esc = K.esc, note = K.note;
      const S = workStore(), act = String(a.action || '');
      const refuse = (code, text, extra) => R(false, warn(esc(text) + ' (' + esc(code) + ')'), { meta: { work: Object.assign({ action: act, code }, extra || {}) } });
      const say = (html, meta) => R(true, html, { meta: { work: Object.assign({ action: act }, meta || {}) } });
      const needWork = async () => { const t = await target(a); if (t.w) return t;
        return { refusal: refuse(t.why === 'not-found' ? 'not_found' : 'needs_input', t.why === 'not-found' ? L('No job matches', '一致する作業はありません') + ' «' + String(t.q) + '»' : L('There is no job yet — start one with action "start" and its goal.', '作業がまだありません。action "start" と goal で始めてください。')) }; };

      if (act === 'workspace') {
        const r = chooseWorkspace(obj_(a.needs), availability());
        const lines = r.considered.map((c) => '<li><b>' + esc(c.id) + '</b> — ' + (c.ok ? esc(L('satisfies the needs', '要件を満たす')) : esc(L('does not', '満たさない')) + ': <code>' + esc(c.unmet.join(', ')) + '</code>') + '<div style="color:var(--text-muted);font-size:11.5px;">' + esc(c.detail) + '</div></li>').join('');
        let kept = '';
        if (r.choice && (a.id || WORK_STATE.current)) { const t = await target(a); if (t.w) { await S.put(Object.assign({}, t.w, { workspace: { id: r.choice, needs: r.needs, reason: 'chosen from the job\'s declared needs' } })); kept = ' ' + L('(recorded on the job)', '（作業に記録しました）'); } }
        return r.choice ? say('<div><b>' + esc(L('Workspace', '作業場')) + ': ' + esc(r.choice) + '</b>' + esc(kept) + '</div><ul style="margin:3px 0 3px 18px;padding:0;">' + lines + '</ul>', { workspace: r.choice, considered: r.considered.map((c) => ({ id: c.id, ok: c.ok, unmet: c.unmet })) })
          : R(false, warn(esc(L('No workspace in this build satisfies these needs — do not pretend: say what cannot be done.', 'このビルドにはこの要件を満たす作業場がありません。できないことをそのまま述べてください。'))) + '<ul style="margin:3px 0 3px 18px;padding:0;">' + lines + '</ul>',
            { meta: { work: { action: act, code: 'no_workspace', considered: r.considered.map((c) => ({ id: c.id, ok: c.ok, unmet: c.unmet })) } } });
      }

      if (act === 'start') {
        if (a.id) { const t = await target({ id: a.id }); if (!t.w) return refuse('not_found', L('No job matches', '一致する作業はありません') + ' «' + a.id + '»');
          WORK_STATE.current = t.w.id; return say(note(esc(L('Carrying on:', '続きから:'))) + describe(t.w, esc, L), { id: t.w.id, resumed: true, products: currentProducts(t.w).length }); }
        const goal = String(a.goal || a.title || '').trim();
        if (!goal) return refuse('needs_input', L('Say what the job is (goal).', '作業の目的（goal）を指定してください。'));
        const now = Date.now(), ws = a.needs ? chooseWorkspace(obj_(a.needs), availability()) : null;
        const w = normalizeWork({ id: newWorkId(now), at: now, updatedAt: now, goal, title: a.title, status: 'open',
          workspace: ws && ws.choice ? { id: ws.choice, needs: ws.needs, reason: 'chosen from the job\'s declared needs' } : null, turns: [], products: [] });
        try { await S.put(w); } catch (e) { return refuse('not_saved', L('The job could not be saved on this device', 'この端末に作業を保存できませんでした') + ': ' + String((e && e.message) || e)); }
        WORK_STATE.current = w.id;
        return say('<div><b>' + esc(L('Started', '作業を開始')) + '</b> · <code>' + esc(w.id) + '</code> — ' + esc(w.title) + '</div>' + (w.workspace ? note(esc(L('Workspace', '作業場') + ': ' + w.workspace.id)) : ''), { id: w.id, workspace: w.workspace && w.workspace.id });
      }

      if (act === 'list') {
        const all = await S.list(String(a.query || '').trim()), n = Math.max(1, Math.min(200, +a.limit || 20));
        if (!all.length) return say(note(esc(a.query ? L('No job matches', '一致する作業はありません') + ' «' + a.query + '»' : L('No jobs kept on this device.', 'この端末に保存された作業はありません。'))), { count: 0 });
        return say('<div style="font-weight:600;">' + esc(L('Jobs', '作業')) + ' · ' + all.length + '</div><ul style="margin:3px 0 3px 18px;padding:0;">' + all.slice(0, n).map((w) => '<li><b>' + esc(w.title) + '</b> · <code>' + esc(w.id) + '</code> · ' + esc(w.status) + ' · ' + currentProducts(w).length + ' ' + esc(L('products', '件')) + ' · ' + esc(when(w.updatedAt)) + '</li>').join('') + '</ul>', { count: all.length, ids: all.slice(0, n).map((w) => w.id) });
      }

      const t = await needWork(); if (t.refusal) return t.refusal;
      const w = t.w;

      if (act === 'open') { WORK_STATE.current = w.id;
        return say(describe(w, esc, L) + (w.summary ? '<div style="font-size:12px;margin-top:4px;white-space:pre-wrap;">' + esc(w.summary.slice(0, 1500)) + '</div>' : '') + '<div>' + esc(L('Goal', '目的')) + ': ' + esc(w.goal) + '</div>'
          + note(esc(L('Read a product with action "get"; put a dataset back with "restore".', '成果物は "get"、データセットは "restore" で取り出せます。'))), { id: w.id, products: currentProducts(w).map((p) => ({ id: p.id, name: p.name, kind: p.kind, version: p.version })) }); }

      if (act === 'add') {
        if (!PRODUCT_KINDS[a.kind]) return refuse('needs_input', L('Name the kind of product', '成果物の種類（kind）を指定してください') + ': ' + productKinds().join(', '));
        const g = await gather(a, K); if (g.problem) return refuse(g.problem, L('The product could not be filed', '成果物を保存できませんでした') + ': ' + g.problem + (g.detail ? ' — ' + g.detail : ''));
        const r = withProduct(w, { kind: a.kind, name: a.name || (g.from && (g.from.title || g.from.attachment)) || a.title, content: g.content, note: a.note, from: g.from }, Date.now());
        if (r.problem) return refuse(r.problem, L('The product could not be filed', '成果物を保存できませんでした') + ': ' + r.problem + (r.maxBytes ? ' (' + Math.round(r.maxBytes / 1024) + ' KB)' : ''));
        try { await S.put(r.work); } catch (e) { return refuse('not_saved', L('Not saved on this device', 'この端末に保存できませんでした') + ': ' + String((e && e.message) || e)); }
        WORK_STATE.current = w.id;
        const p = r.product;
        return say('<div><b>' + esc(L('Filed', '保存しました')) + '</b>: ' + esc(p.name) + ' · ' + esc(p.kind) + ' v' + p.version + ' · <code>' + esc(p.id) + '</code> → ' + esc(w.title) + ' <code>' + esc(w.id) + '</code></div>'
          + (p.supersedes ? note(esc(L('This is the next version; the earlier one is kept (compare).', '次の版として保存しました。前の版も残っています（compare）。'))) : ''), { id: w.id, product: p.id, name: p.name, kind: p.kind, version: p.version });
      }

      if (act === 'get' || act === 'restore' || act === 'compare' || (act === 'export' && a.as === 'file')) {
        const ref = a.product || a.name;
        if (act === 'compare') {
          const name = String(ref || '').replace(/@\d+$/, ''), vs = (w.products || []).filter((p) => p.name === name).sort((x, y) => x.version - y.version);
          const pick = Array.isArray(a.versions) && a.versions.length === 2 ? a.versions : (vs.length >= 2 ? [vs[vs.length - 2].version, vs[vs.length - 1].version] : null);
          if (!pick) return refuse('needs_two_versions', L('Compare needs a product filed at least twice (name it).', '比較には 2 回以上保存した成果物（name）が要ります。') + (vs.length ? '' : ' ' + (ref ? '' : '')));
          const r = compareProducts(vs.find((p) => p.version === pick[0]), vs.find((p) => p.version === pick[1]));
          if (!r.ok) return refuse(r.why, L('Cannot compare', '比較できません') + ': ' + r.why + (r.detail ? ' ' + r.detail : ''));
          let h;
          if (r.by === 'rows') h = '<div><b>' + esc(name) + '</b> v' + r.from + ' → v' + r.to + ' · ' + esc(L('rows matched by', '行の突き合わせキー')) + ' <code>' + esc(r.key) + '</code></div>'
            + '<div>' + esc(L('added', '追加')) + ' ' + r.added.length + ' · ' + esc(L('removed', '削除')) + ' ' + r.removed.length + ' · ' + esc(L('changed', '変更')) + ' ' + r.changed.length + ' · ' + esc(L('unchanged', '変化なし')) + ' ' + r.unchanged + '</div>'
            + (r.added.length ? '<div>+ ' + esc(r.added.slice(0, 40).join(', ')) + '</div>' : '') + (r.removed.length ? '<div>− ' + esc(r.removed.slice(0, 40).join(', ')) + '</div>' : '')
            + (r.changed.length ? '<ul style="margin:3px 0 3px 18px;padding:0;">' + r.changed.slice(0, 40).map((c) => '<li>' + esc(c.id) + ': ' + esc(c.diffs.map((d) => d.column + ' ' + d.then + ' → ' + d.now).join('; ')) + '</li>').join('') + '</ul>' : '')
            + (r.keyUnique === false ? warn(esc(L('The key column repeats, so rows with the same key were folded together.', 'キー列に重複があり、同じキーの行は 1 行にまとまっています。'))) : '');
          else if (r.by === 'lines') h = '<div><b>' + esc(name) + '</b> v' + r.from + ' → v' + r.to + ' · ' + (r.identical ? esc(L('identical', '同一')) : '+' + r.added + ' / −' + r.removed + ' ' + esc(L('lines', '行'))) + ' (' + r.linesThen + ' → ' + r.linesNow + ')</div>';
          else h = '<div><b>' + esc(name) + '</b> v' + r.from + ' → v' + r.to + ' · ' + (r.identical ? esc(L('identical', '同一')) : esc(L('differs', '異なる'))) + '</div>' + note(esc(r.note));
          return say(h, { id: w.id, compared: name, by: r.by, added: r.added && r.added.length != null ? r.added.length : r.added, removed: r.removed && r.removed.length != null ? r.removed.length : r.removed, changed: r.changed ? r.changed.length : null, identical: r.identical });
        }
        const p = findProduct(w, ref);
        if (!p) return refuse('not_found', L('No product matches', '一致する成果物はありません') + ' «' + String(ref || '') + '» — ' + currentProducts(w).map((x) => x.name).join(', '));
        if (act === 'get') {
          const body = JSON.stringify(p.content); const cut = body.length > 20000;
          return say('<div><b>' + esc(p.name) + '</b> · ' + esc(p.kind) + ' v' + p.version + '</div><pre style="white-space:pre-wrap;word-break:break-word;font-size:11.5px;">' + esc(cut ? body.slice(0, 20000) : body) + '</pre>' + (cut ? note(esc(L('Cut at 20,000 characters of ' + body.length + '.', body.length + ' 文字のうち先頭 20,000 文字です。'))) : ''), { id: w.id, product: p.id, kind: p.kind, version: p.version, bytes: body.length, cut });
        }
        if (act === 'restore') {
          if (p.kind !== 'dataset') return refuse('not_a_dataset', L('Only a dataset product can be put back into the session; read this one with "get".', 'セッションに戻せるのはデータセットだけです。これは "get" で読んでください。'));
          await window.IntMapLazy.need('gisCore');
          const D = window.IntMapData; if (!D || typeof D.add !== 'function') return refuse('registry_missing', L('The dataset registry could not be loaded.', 'データセットのレジストリを読み込めませんでした。'));
          const c = p.content, feats = c.format === 'geojson' ? c.features : c.rows.map((r) => ({ type: 'Feature', geometry: null, properties: Object.fromEntries(c.columns.map((n, i) => [n, r[i]])) }));
          const ds = D.add({ title: p.name + (p.version > 1 ? ' (v' + p.version + ')' : ''), features: feats, provenance: { kind: 'work-product', work: w.id, product: p.id, licence: c.licence || undefined } });
          return say('<div><b>' + esc(L('Put back as a new dataset', '新しいデータセットとして戻しました')) + '</b>: <code>' + esc(ds.id) + '</code> · ' + ds.count + ' ' + esc(L('rows', '行')) + '</div>' + note(esc(L('Use this id as the input of the next step.', 'この id を次の処理の入力に使えます。'))), { id: w.id, product: p.id, dataset: ds.id, count: ds.count });
        }
        /* export as one file */
        const X = (await import('./gis-export.js')).makeGisExport();
        let res;
        if (p.kind === 'dataset') {
          await window.IntMapLazy.need('gisCore');
          const src = p.from && p.from.dataset, D = window.IntMapData;
          let id = src && D && D.get && D.get(src) && D.get(src).count === p.content.count ? src : null;
          if (!id && D && D.add) { const c = p.content; id = D.add({ title: p.name, features: c.format === 'geojson' ? c.features : c.rows.map((r) => ({ type: 'Feature', geometry: null, properties: Object.fromEntries(c.columns.map((n, i) => [n, r[i]])) })), provenance: { kind: 'work-product', work: w.id, product: p.id } }).id; }
          res = id ? X.write(id, { format: String(a.format || (p.content.format === 'geojson' ? 'geojson' : 'csv')) }) : { ok: false, why: 'registry-missing' };
          if (!res || res.ok === false) return refuse((res && res.why) || 'export-serialise-failed', L('The dataset could not be written', 'データセットを書き出せませんでした'));
        } else {
          const f = fileOf(p); if (!f) return refuse('no_file_form', L('This kind has no file of its own — export the job as "json".', 'この種類には単体のファイルがありません。"json" で書き出してください。'));
          const bytes = f.base64 ? Uint8Array.from(atob(f.base64), (ch) => ch.charCodeAt(0)) : new TextEncoder().encode(f.text);
          res = { ok: true, filename: f.filename, bytes, mediaType: f.mime, format: f.filename.split('.').pop() };
        }
        if (!X.save(res)) return refuse('export_not_saved', L('This environment has no way to save a file.', 'この環境にはファイルを保存する手段がありません。'));
        return say('<div><b>' + esc(L('Saved as a file', 'ファイルに書き出しました')) + '</b>: ' + esc(res.filename) + ' · ' + res.bytes.length + ' B</div>', { id: w.id, product: p.id, filename: res.filename, bytes: res.bytes.length });
      }

      if (act === 'export') {
        const asJson = a.as === 'json', X = (await import('./gis-export.js')).makeGisExport();
        const text = asJson ? JSON.stringify(workToFile(w)) : workToMarkdown(w);
        const slug = (w.title.replace(/[^\w぀-ヿ一-鿿]+/g, '-').replace(/^-+|-+$/g, '') || 'work').slice(0, 50);
        const res = { ok: true, filename: slug + (asJson ? '.intmap-work.json' : '.md'), bytes: new TextEncoder().encode(text), mediaType: asJson ? 'application/json' : 'text/markdown;charset=utf-8' };
        if (!X.save(res)) return refuse('export_not_saved', L('This environment has no way to save a file.', 'この環境にはファイルを保存する手段がありません。'));
        return say('<div><b>' + esc(L('Saved as a file', 'ファイルに書き出しました')) + '</b>: ' + esc(res.filename) + ' · ' + res.bytes.length + ' B · ' + currentProducts(w).length + ' ' + esc(L('products', '件')) + '</div>', { id: w.id, filename: res.filename, bytes: res.bytes.length, products: currentProducts(w).length });
      }

      if (act === 'finish') {
        const n = await S.update(w.id, { summary: a.summary != null ? String(a.summary) : w.summary, status: a.status || 'done' });
        return say('<div><b>' + esc(n.status) + '</b> · ' + esc(n.title) + '</div>', { id: n.id, status: n.status });
      }

      if (act === 'remove') {
        if (!a.id) return refuse('needs_input', L('Name the job to remove (id).', '削除する作業（id）を指定してください。'));
        await S.remove(w.id); if (WORK_STATE.current === w.id) WORK_STATE.current = null;
        return say(note(esc(L('Removed the job and its products from this device.', '作業と成果物をこの端末から削除しました。'))), { id: w.id });
      }
      return refuse('unknown_action', L('Unknown action: ', '不明な操作: ') + act);
    },
  },
];
