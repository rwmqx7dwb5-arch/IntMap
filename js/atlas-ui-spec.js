/* ============================================================================
 *  IntMap · Atlas — A VIEW ATLAS DECLARES, CHECKED AND DRAWN WITH PARTS IntMap ALREADY HAS
 *                                                                          js/atlas-ui-spec.js
 * ----------------------------------------------------------------------------
 *  「Atlas に生成 UI／ダッシュボードが無い」 — the reply could carry a chart (chart.compose) or a row of
 *  switches (ui.inlineControls), one at a time, but not a VIEW: a titled arrangement of figures, a table,
 *  a chart, the switches that adjust it and the places it is about, kept together as one thing the reader
 *  can come back to. This file is the declarative half of `ui.compose` (js/atlas-cap-ui.js): Atlas writes a
 *  JSON spec, and the spec is
 *    · CHECKED here, completely, before anything is drawn — every problem in one list, each with the path
 *      it sits at and the reason, so the model fixes the whole spec in one more call rather than meeting
 *      the problems one by one (.agents/rules/one-pass-or-a-reason.md). Nothing is dropped silently: an
 *      unknown block kind, an unknown field, an oversized list or string, a URL, a piece of markup is a
 *      refusal with its reason, never a part that quietly does not appear;
 *    · DRAWN only with IntMap's own parts. A block is either one of the small pieces below (figures, a
 *      table, prose, places) or a call to a capability that already draws into the reply — `chart` is
 *      chart.compose's own arguments, `controls` is ui.inlineControls' own items — run through the same
 *      dispatch, so there is one chart renderer and one control renderer in the product, not two.
 *
 *  ⚠ NO MARKUP FROM THE SPEC REACHES THE PAGE. Every string is TEXT: prose and table cells go through the
 *  reply's own Markdown renderer (js/atlas-reply.js mdMini — it escapes every run it is given); every other
 *  string through IntMapSafe.html (js/safe-html.js). A string that carries a tag is refused rather than
 *  shown as escaped noise, and a URL is refused because a link drawn in an answer claims IntMap fetched the
 *  page (js/atlas-answer-render.js demoteProseLinks) — sources are cited through the answer, not a view.
 *
 *  ⚠ THE KINDS ARE THIS TABLE. The schema (js/atlas-cap-ui.js → js/atlas-schemas.js → TOOLS.schemaOf), the
 *  catalogue sentence the planner reads and the checker are all derived from BLOCKS; a kind added here is
 *  a kind in all three. A delegated kind names the DISPATCH SPELLING it runs (`via`) — the registry decides
 *  whether that capability exists, not this file.
 *  Pure: no DOM, no globals at load. tests/declarative-workspace-checks.test.mjs evaluates it.
 * ==========================================================================*/

/* ── the limits, and why each is the number it is ─────────────────────────────────────────────────────
   Observed 2026-11-20 against the Atlas panel (js/atlas-styles.js: the reply column is ≤ 400 px wide):
   twelve blocks is three screens of a phone; a metric grid of twelve is four rows of three; a table is cut at
   200 rows because a reply is not a spreadsheet (the query engine's own table, js/atlas-query.js, shows its
   rows in the same element); 32 768 characters of JSON is what the notebook keeps comfortably per step
   inside its 1 MiB entry (supabase/migrations/20261003170000_atlas_notebook.sql). They expire when the panel
   layout or the notebook's ceiling changes. This table is the one place they are written. */
import * as BoardSpec from './board-spec.js';

export const LIMITS = Object.freeze({
  specChars: 32768, blocks: 12, title: 120, text: 4000, label: 60, short: 40, unit: 16, note: 160, source: 300,
  metrics: 12, columns: 12, rows: 200, cell: 200, places: 12, place: 120, command: 160, controls: 8,
});

/* ── a field's shape ── t: text (n chars) · v: text or a finite number · num · rows · list (of an item) · obj (passed whole to `via`) */
const T = (n, req) => ({ t: 'text', n, req: !!req });
const V = (n, req) => ({ t: 'value', n, req: !!req });
const N = (req, min, max) => ({ t: 'num', req: !!req, min, max });
const LIST = (item, max, req) => ({ t: 'list', item, max, req: !!req });
const ROWS = (req) => ({ t: 'rows', req: !!req });
const OBJ = (req) => ({ t: 'obj', req: !!req });

/* ══ THE BLOCKS ════════════════════════════════════════════════════════════════════════════════════════
   `fields` — every field the kind may carry (and nothing else: an unknown field is refused, it is a typo or a
   misunderstanding nothing would read). `via` — the dispatch spelling of the capability that draws it.
   `one` — of these fields at least one must be given (a place is a name or a coordinate). `doc` — its shape
   for the planner. Every block may also carry `title`. */
export const BLOCKS = Object.freeze({
  metrics: {
    fields: { items: LIST({ label: T(LIMITS.label, true), value: V(LIMITS.short, true), unit: T(LIMITS.unit), delta: N(false), note: T(LIMITS.note) }, LIMITS.metrics, true), source: T(LIMITS.source, true) },
    doc: '{"kind":"metrics","items":[{"label":str,"value":num|str,"unit"?:str,"delta"?:num,"note"?:str}],"source":str} (headline figures as tiles; "delta" is the signed change and is printed with its sign)',
  },
  table: {
    fields: { columns: LIST(T(LIMITS.label, true), LIMITS.columns, true), rows: ROWS(true), source: T(LIMITS.source, true), caption: T(LIMITS.note) },
    doc: '{"kind":"table","columns":[str],"rows":[[str|num]],"source":str,"caption"?:str} (every row has one cell per column)',
  },
  chart: {
    fields: { chart: OBJ(true) }, via: 'chart',
    doc: '{"kind":"chart","chart":{…the arguments of `chart` without "type": kind, source, series/events…}}',
  },
  controls: {
    fields: { items: LIST(null, LIMITS.controls, true) }, via: 'controls',
    doc: '{"kind":"controls","items":[…the items of `controls`: layerToggle / opacity / button…]}',
  },
  places: {
    fields: { items: LIST({ label: T(LIMITS.label, true), place: T(LIMITS.place), lat: N(false, -90, 90), lng: N(false, -180, 180), zoom: N(false, 0, 22) }, LIMITS.places, true) },
    one: { items: [['place'], ['lat', 'lng']] },
    doc: '{"kind":"places","items":[{"label":str,"place":str}|{"label":str,"lat":num,"lng":num,"zoom"?:num}]} (buttons that move the map there when pressed)',
  },
  board: {
    fields: { board: OBJ(true) },
    doc: '{"kind":"board","board":{…the arguments of `board.compose` without "type": source, data, widgets…}} (a compact card in the answer that opens the full linked workspace — table, chart, filter, time, the real map — when pressed; the SAME declaration as board.compose, so a small view and a full analysis board are one thing at two sizes)',
  },
  text: {
    fields: { md: T(LIMITS.text, true) },
    doc: '{"kind":"text","md":str} (Markdown prose — **bold**, lists, a pipe table; no links, no HTML)',
  },
});
export const KINDS = Object.freeze(Object.keys(BLOCKS));

/* ══ THE SCHEMA, FROM THE TABLE ═══════════════════════════════════════════════════════════════════════
   In js/atlas-schemas.js' small dialect (no oneOf): a block is an object whose `kind` is one of KINDS and whose
   properties are the union of every kind's fields — a field name means the same type in every kind that has it
   (`items` is always a list of objects), so the union is exact. Which fields belong to WHICH kind is checked by
   checkView, with the reason. Built fresh on every call: a shared literal would let one consumer's annotation
   reach another. */
function fieldSchema(f) {
  if (!f) return { type: 'object' };
  if (f.t === 'text') return { type: 'string' };
  if (f.t === 'num') { const o = { type: 'number' }; if (f.min != null) o.minimum = f.min; if (f.max != null) o.maximum = f.max; return o; }
  if (f.t === 'value') return {};
  if (f.t === 'rows') return { type: 'array', items: { type: 'array' } };
  if (f.t === 'obj') return { type: 'object' };
  if (f.t === 'list') {
    const item = f.item == null ? { type: 'object' } : (f.item.t ? fieldSchema(f.item) : { type: 'object', properties: Object.fromEntries(Object.keys(f.item).map((k) => [k, fieldSchema(f.item[k])])) });
    return { type: 'array', items: item, minItems: 1 };
  }
  return {};
}
export function viewSchema() {
  const props = { kind: { type: 'string', enum: KINDS.slice() }, title: { type: 'string' } }, seen = {};
  KINDS.forEach((k) => { const fs = BLOCKS[k].fields; Object.keys(fs).forEach((n) => { (seen[n] = seen[n] || []).push(fieldSchema(fs[n])); }); });
  /* a name two kinds give different item shapes (`items`: tiles, controls, places) is stated at the shape they share —
     a list of objects — so the schema never shows one kind's item fields as every kind's */
  Object.keys(seen).forEach((n) => {
    const all = seen[n], same = all.every((x) => JSON.stringify(x) === JSON.stringify(all[0]));
    props[n] = same ? all[0] : (all.every((x) => x.type === 'array') ? { type: 'array', minItems: 1, items: { type: 'object' } } : {});
  });
  return { type: 'object', required: ['blocks'], properties: { title: { type: 'string' }, blocks: { type: 'array', minItems: 1, items: { type: 'object', required: ['kind'], properties: props } } } };
}
/** the shapes, for the catalogue sentence (js/atlas-cap-ui.js `doc`) */
export function blockShapes() { return KINDS.map((k) => BLOCKS[k].doc).join(' | '); }

/* ══ THE CHECK ═════════════════════════════════════════════════════════════════════════════════════════
   checkView(spec, L) → { ok, problems: [{ at, code, why }] } — ALL the problems, never the first one only.
   `L` is the reader's language picker (two positional strings, en and jp); `why` is written for the reader and
   the model alike. ⚠ A STRING IS JUDGED, NOT CLEANED: a value with a URL or a tag is refused by name — removing
   the offending part would draw something the model did not write. */
const URL_RE = /\b(?:https?|ftp|javascript|vbscript|data|file|blob):|\bwww\.[a-z0-9-]+\./i;
/* a tag is a `<` followed AT ONCE by a name (or `</name`, `<!`, `<?`) — or a name followed by an attribute, closed or not;
   `a < b`, `<5%` and `x > y` are prose and pass */
const TAG_RE = /<\/?[a-z][a-z0-9-]*(?:[\s/][^<>]*)?>|<[a-z][a-z0-9-]*\s+[a-z-]+\s*=|<[!?]/i;
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const isNum = (v) => typeof v === 'number' && isFinite(v);
/* a reason with its numbers put in — the sentence is written once per language with {name} holes, so check:i18n reads it whole */
const F = (s, o) => String(s).replace(/\{(\w+)\}/g,(m, k) => (o && o[k] != null ? String(o[k]) : m));

export function checkView(spec, L) {
  const P = [];
  const add = (at, code, why) => { P.push({ at, code, why }); };
  /* a string's two refusals, shared by every string the spec carries (including the delegated objects) */
  const scan = (at, s) => {
    if (URL_RE.test(s)) add(at, 'url', L('contains a link or URL — a view draws no links (a link in an answer would claim IntMap fetched the page); cite sources in your answer instead',
      'リンクまたは URL が含まれています——ビューはリンクを描きません（回答の中のリンクは IntMap がそのページを取得したと主張してしまうため）。出典は回答の本文で示してください'));
    if (TAG_RE.test(s)) add(at, 'markup', L('contains HTML markup — a view is drawn only from IntMap\'s own parts; write plain text (Markdown in a "text" block)',
      'HTML が含まれています——ビューは IntMap 自身の部品だけで描きます。プレーンテキスト（"text" ブロックでは Markdown）で書いてください'));
  };
  const deep = (at, v, depth) => {   /* every string inside a delegated object, the same two refusals */
    if (depth > 8) { add(at, 'too_deep', L('is nested too deeply', '入れ子が深すぎます')); return; }
    if (typeof v === 'string') scan(at, v);
    else if (Array.isArray(v)) v.forEach((x, i) => deep(at + '[' + i + ']', x, depth + 1));
    else if (isObj(v)) Object.keys(v).forEach((k) => deep(at + '.' + k, v[k], depth + 1));
  };
  const text = (at, v, n, req) => {
    if (v == null || v === '') { if (req) add(at, 'missing', L('is required', 'が必要です')); return; }
    if (typeof v !== 'string') { add(at, 'type', L('must be text', 'は文字列にしてください')); return; }
    if (!v.trim()) { if (req) add(at, 'missing', L('is required', 'が必要です')); return; }
    if (v.length > n) add(at, 'too_long', F(L('is longer than {n} characters', 'が {n} 文字を超えています'), { n }));
    scan(at, v);
  };
  const field = (at, f, v) => {
    if (f.t === 'text') return text(at, v, f.n, f.req);
    if (f.t === 'value') {
      if (v == null || v === '') { if (f.req) add(at, 'missing', L('is required', 'が必要です')); return; }
      if (typeof v === 'number') { if (!isFinite(v)) add(at, 'type', L('must be a finite number or text', 'は有限の数値か文字列にしてください')); return; }
      return text(at, v, f.n, f.req);
    }
    if (f.t === 'num') {
      if (v == null) { if (f.req) add(at, 'missing', L('is required', 'が必要です')); return; }
      if (!isNum(v)) { add(at, 'type', L('must be a number', 'は数値にしてください')); return; }
      if ((f.min != null && v < f.min) || (f.max != null && v > f.max)) add(at, 'range', F(L('must be between {a} and {b}', 'は {a}〜{b} にしてください'), { a: f.min, b: f.max }));
      return;
    }
    if (f.t === 'obj') {
      if (v == null) { if (f.req) add(at, 'missing', L('is required', 'が必要です')); return; }
      if (!isObj(v)) { add(at, 'type', L('must be an object', 'はオブジェクトにしてください')); return; }
      return deep(at, v, 0);
    }
    if (f.t === 'rows' || f.t === 'list') {
      if (v == null) { if (f.req) add(at, 'missing', L('is required', 'が必要です')); return; }
      if (!Array.isArray(v)) { add(at, 'type', L('must be a list', 'はリストにしてください')); return; }
      if (!v.length) { if (f.req) add(at, 'empty', L('is empty', 'が空です')); return; }
      const max = f.t === 'rows' ? LIMITS.rows : f.max;
      if (v.length > max) add(at, 'too_many', F(L('has {n} entries; at most {max} are drawn — choose which ones matter', 'が {n} 件あります。描けるのは {max} 件までです——要るものを選んでください'), { n: v.length, max }));
      if (f.t === 'rows') return;   /* the cells are checked against the columns, in the block */
      v.slice(0, max).forEach((it, i) => {
        const a = at + '[' + i + ']';
        if (f.item == null) { if (!isObj(it)) add(a, 'type', L('must be an object', 'はオブジェクトにしてください')); else deep(a, it, 0); return; }
        if (f.item.t) return field(a, f.item, it);
        if (!isObj(it)) { add(a, 'type', L('must be an object', 'はオブジェクトにしてください')); return; }
        Object.keys(it).forEach((k) => { if (!f.item[k]) add(a + '.' + k, 'unknown_field', F(L('is not a field of this item (fields: {list})', 'はこの項目の欄ではありません（欄: {list}）'), { list: Object.keys(f.item).join(', ') })); });
        Object.keys(f.item).forEach((k) => field(a + '.' + k, f.item[k], it[k]));
      });
    }
  };

  if (!isObj(spec)) { add('', 'type', L('the view must be an object with "blocks"', 'ビューは "blocks" を持つオブジェクトにしてください')); return { ok: false, problems: P }; }
  let size = 0; try { size = JSON.stringify(spec).length; } catch (_) { size = Infinity; }
  if (size > LIMITS.specChars) add('', 'too_large', F(L('the view is {n} characters of JSON; at most {max} are drawn — keep what the reader needs and say the rest in words',
    'ビューの JSON が {n} 文字あります。描けるのは {max} 文字までです——読者に要るものだけを残し、残りは文章で述べてください'), { n: size, max: LIMITS.specChars }));
  Object.keys(spec).forEach((k) => { if (k !== 'title' && k !== 'blocks' && k !== 'type' && k.slice(0, 2) !== '__') add(k, 'unknown_field', L('is not a field of a view (fields: title, blocks)', 'はビューの欄ではありません（欄: title, blocks）')); });
  text('title', spec.title, LIMITS.title, false);
  const blocks = spec.blocks;
  if (!Array.isArray(blocks) || !blocks.length) { add('blocks', 'missing', L('must be a list of at least one block', 'は 1 つ以上のブロックのリストにしてください')); return { ok: false, problems: P }; }
  if (blocks.length > LIMITS.blocks) add('blocks', 'too_many', F(L('has {n} blocks; at most {max} are drawn', 'が {n} 個あります。描けるのは {max} 個までです'), { n: blocks.length, max: LIMITS.blocks }));
  blocks.slice(0, LIMITS.blocks).forEach((b, i) => {
    const at = 'blocks[' + i + ']';
    if (!isObj(b)) { add(at, 'type', L('must be an object', 'はオブジェクトにしてください')); return; }
    const def = BLOCKS[b.kind];
    if (!def) { add(at + '.kind', 'unknown_kind', F(L('«{kind}» is not a block kind (kinds: {list})', '«{kind}» はブロックの種類ではありません（種類: {list}）'), { kind: String(b.kind == null ? '' : b.kind).slice(0, 40), list: KINDS.join(', ') })); return; }
    Object.keys(b).forEach((k) => { if (k !== 'kind' && k !== 'title' && !def.fields[k]) add(at + '.' + k, 'unknown_field', F(L('is not a field of a «{kind}» block (fields: {list})', 'は «{kind}» ブロックの欄ではありません（欄: {list}）'), { kind: b.kind, list: Object.keys(def.fields).concat('title').join(', ') })); });
    text(at + '.title', b.title, LIMITS.title, false);
    Object.keys(def.fields).forEach((k) => field(at + '.' + k, def.fields[k], b[k]));
    /* at least one of the alternative field sets (a place is a name or a coordinate pair) */
    if (def.one) Object.keys(def.one).forEach((k) => (Array.isArray(b[k]) ? b[k].slice(0, LIMITS.places) : []).forEach((it, j) => {
      if (isObj(it) && !def.one[k].some((set) => set.every((n) => it[n] != null && it[n] !== ''))) add(at + '.' + k + '[' + j + ']', 'missing', F(L('needs {a} or {b}', 'には {a} か {b} が必要です'), { a: def.one[k][0].join(' + '), b: def.one[k].slice(1).map((s) => s.join(' + ')).join(' / ') }));
    }));
    /* a board block is a board declaration (js/board-spec.js): the same gate decides it, so a view cannot carry a board the board would refuse */
    if (b.kind === 'board' && isObj(b.board)) { const r = BoardSpec.normalise(b.board, null); if (!r.ok) r.issues.forEach((is) => add(at + '.board' + (is.path ? '.' + is.path : ''), 'board', is.why)); }
    /* a table's cells: one per column, each a short text or a number */
    if (b.kind === 'table' && Array.isArray(b.rows) && Array.isArray(b.columns)) {
      const w = b.columns.length;
      b.rows.slice(0, LIMITS.rows).forEach((r, j) => {
        const a = at + '.rows[' + j + ']';
        if (!Array.isArray(r)) { add(a, 'type', L('must be a list of cells', 'はセルのリストにしてください')); return; }
        if (r.length !== w) add(a, 'shape', F(L('has {n} cells for {w} columns', 'のセルは {n} 個ですが列は {w} 個です'), { n: r.length, w }));
        r.forEach((c, x) => { if (c == null || isNum(c)) return; if (typeof c !== 'string') add(a + '[' + x + ']', 'type', L('must be text or a number', 'は文字列か数値にしてください')); else if (c.length > LIMITS.cell) add(a + '[' + x + ']', 'too_long', F(L('is longer than {n} characters', 'が {n} 文字を超えています'), { n: LIMITS.cell })); else scan(a + '[' + x + ']', c); });
      });
    }
  });
  return { ok: !P.length, problems: P };
}

/* ══ THE PIECES THAT ARE DRAWN HERE ════════════════════════════════════════════════════════════════════
   `X` is what the drawer needs from the page: { esc (IntMapSafe.html), L, num(v) → the reader's locale's
   number, icon(name) → IntMap's own icon markup }. Prose and tables are not drawn here: they become Markdown
   for the reply's one renderer (tableMarkdown below). */

/** a table block → GFM the reply's renderer draws (.atl-md-table). A cell's pipe is escaped the way that renderer
    splits (an unescaped `|` only); a column whose every cell is a number is right-aligned. */
export function tableMarkdown(b, num) {
  const cols = b.columns.map((c) => String(c));
  const cell = (v) => (typeof v === 'number' ? String(num(v)) : String(v == null ? '' : v)).replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim() || '—';
  const numeric = cols.map((_, x) => b.rows.every((r) => r[x] == null || typeof r[x] === 'number'));
  const line = (cells) => '| ' + cells.join(' | ') + ' |';
  return [line(cols.map(cell)), line(numeric.map((n) => (n ? '---:' : '---'))), ...b.rows.map((r) => line(cols.map((_, x) => cell(r[x]))))].join('\n');
}

export function metricsHtml(b, X) {
  const esc = X.esc;
  const tiles = b.items.map((m) => {
    const v = typeof m.value === 'number' ? X.num(m.value) : String(m.value);
    const d = isNum(m.delta) ? m.delta : null;
    return '<div class="atl-ui-mi"><div class="atl-ui-ml">' + esc(m.label) + '</div>'
      + '<div class="atl-ui-mv">' + esc(v) + (m.unit ? '<span class="atl-ui-mu">' + esc(m.unit) + '</span>' : '') + '</div>'
      /* the sign is printed: colour is never the only carrier */
      + (d != null ? '<div class="atl-ui-md' + (d > 0 ? ' up' : d < 0 ? ' down' : '') + '">' + esc((d > 0 ? '+' : d < 0 ? '−' : '±') + X.num(Math.abs(d)) + (m.unit ? ' ' + m.unit : '')) + '</div>' : '')
      + (m.note ? '<div class="atl-ui-mn">' + esc(m.note) + '</div>' : '') + '</div>';
  }).join('');
  return '<div class="atl-ui-m">' + tiles + '</div>';
}

/** a place is a button; the press is read by js/atlas-console.js (`.atl-ui-go`), which builds the `flyTo` call from these
    attributes only — never from a serialized action — and runs it through the Atlas thread like any other step. */
export function placesHtml(b, X) {
  const esc = X.esc;
  return '<div class="atl-ui-p">' + b.items.map((p) => {
    const at = (p.place ? ' data-place="' + esc(p.place) + '"' : '')
      + (isNum(p.lat) && isNum(p.lng) ? ' data-lat="' + esc(String(p.lat)) + '" data-lng="' + esc(String(p.lng)) + '"' : '')
      + (isNum(p.zoom) ? ' data-zoom="' + esc(String(p.zoom)) + '"' : '');
    return '<button type="button" class="atl-ui-go" data-effect="none"' + at + '>' + X.icon('pin') + '<span>' + esc(p.label) + '</span></button>';
  }).join('') + '</div>';
}

/** a board block → a compact card. The spec itself is staged with IntMapBoard (js/board.js `stage`), never put in the markup; the button carries only the key it came back with. */
export function boardHtml(b, key, X) {
  const esc = X.esc, spec = b.board || {}, ws = Array.isArray(spec.widgets) ? spec.widgets.map((w) => w && w.kind).filter(Boolean) : [];
  const rows = spec.data && Array.isArray(spec.data.rows) ? spec.data.rows.length : null;
  return '<div class="atl-ui-bd"><div class="atl-ui-bds">' + esc((rows != null ? rows + X.L(' rows · ', ' 行 · ') : '') + ws.join(' + ')) + '</div>'
    + '<button type="button" class="atl-ui-bdo" data-effect="none" data-bd="' + esc(key) + '">' + esc(X.L('Open the workspace', 'ワークスペースを開く')) + '</button></div>';
}

export function sourceHtml(b, X) {
  return b.source ? '<div class="atl-ui-src">' + X.esc(X.L('Source', '出典') + ': ' + b.source) + '</div>' : '';
}
