/* ============================================================================
 *  IntMap · «WHERE THIS LINE COMES FROM» — the card  (border-provenance)
 * ----------------------------------------------------------------------------
 *  Fetched on the first press of a line (js/border-provenance.js `wireLineClick`), or from an era card's
 *  «Where this border comes from», or by Atlas (`time.borderSource`). It asks every registered reader for the
 *  shapes on either side of the press, reads the provenance indexes the build wrote beside the bundles
 *  (scripts/build-border-provenance.mjs), and says — for each shape — which record drew it, which row, who
 *  stated each of its dates, how its outline was made, what the reviews say about it, its licence, and how
 *  to report it wrong.
 *  ⚠ AN EMPTY FIELD IS SAID TO BE EMPTY. A date nobody stated is «not stated», a relation the index cannot
 *  name is «the index does not describe this row», a shape with no row is «not attributable to a shipped
 *  row» — never a value borrowed from a neighbour (CONSTITUTION「偽物・ハリボテ禁止」,
 *  [[intmap-data-must-not-claim-an-author-it-lacks]]).
 *  ⚠ NEW TEXT IS en + jp (CONSTITUTION §7; scripts/lang-policy.mjs `authoredLangs`). Upstream's own words
 *  (tags, notes, titles, dossier sentences) are shown verbatim, in the language the source wrote them.
 * ==========================================================================*/
import { IntMapLang } from './lang-registry.js';
import { jsonWithin } from './fetch-deadline.js';
import { clockFor } from './proxy-fetch.js';
import { IntMapGeoEngine } from './geo-engine.js';
import { PROVENANCE_INDEX, remember, last, sidesAt } from './border-provenance.js';

export const BorderProvenanceCard = (function () {
  const _ix = new Map();
  /* one flight per index per session; a failed read is not remembered as an answer */
  function loadIndex(name) {
    if (_ix.has(name)) return _ix.get(name);
    const u = PROVENANCE_INDEX[name]; if (!u) return Promise.resolve(null);
    const p = Promise.resolve().then(() => jsonWithin(u, clockFor(u))).then((j) => (j && j.v === 1 && j.sets ? j : null), () => null)
      .then((j) => { if (!j) _ix.delete(name); return j; });
    _ix.set(name, p); return p;
  }
  /* the row the index holds for a side, only when its fingerprint is the drawn row's */
  async function indexRow(side) {
    const ix = side && side.index; if (!ix) return null;
    const j = await loadIndex(ix.name); if (!j) return { missing: 'index' };
    const set = j.sets[ix.file]; const rows = set ? (Array.isArray(set) ? set : set.rows) : null;
    const r = rows && rows[ix.i];
    if (!r) return { missing: 'row', head: j };
    if (r[0] !== ix.key) return { missing: 'stale', head: j };
    return { row: r, head: j, set: Array.isArray(set) ? null : set };
  }

  /* ── words ───────────────────────────────────────────────────────────────── */
  /* (safe-dom-template) the card is built in templates of the one markup tag: a value is escaped for where it
     lands (text, attribute, the start of an href — js/safe-html.js), so nothing here escapes by hand */
  const html = window.IntMapSafe.markup;
  const link = (u, text) => html`<a href="${window.IntMapSafe.url(u)}" target="_blank" rel="noopener" style="color:var(--accent,#0a84ff);text-decoration:none;">${text}</a>`;
  const br = (arr) => arr.map((x, i) => (i ? html`<br>${x}` : html`${x}`));
  const sep = (arr, s) => arr.map((x, i) => (i ? html`${s}${x}` : html`${x}`));
  function W(HOST) {
    const T = (en, jp) => IntMapLang.t(HOST.lang, en, jp);
    const tag = (() => { try { return IntMapLang.htmlTag(HOST.lang) || 'en'; } catch (_) { return 'en'; } })();
    const year = (y) => { try { return window.IntMapHistScale.yearText(y, tag, HOST.lang === 'jp' ? '年' : null); } catch (_) { return String(y); } };
    const pad = (n) => String(n).padStart(2, '0');
    const day = (a) => (a && a.length === 3) ? (a[0] >= 1 ? a[0] + '-' + pad(a[1]) + '-' + pad(a[2]) : year(a[0]) + ' ' + pad(a[1]) + '-' + pad(a[2])) : '?';
    /* Cliopatria writes BCE years negative with no year zero; the map is astronomical (js/hist-scale.js) */
    const ceYear = (raw) => year(raw < 0 ? raw + 1 : raw);
    return { T, year, day, ceYear };
  }
  const metres = (dec) => { const m = 111320 * Math.pow(10, -dec); return m >= 1000 ? (m / 1000).toFixed(m >= 10000 ? 0 : 1) + ' km' : (m >= 1 ? Math.round(m) + ' m' : m.toFixed(2) + ' m'); };
  const degKm = (deg) => { const km = deg * 111.32; return km >= 1 ? km.toFixed(km >= 10 ? 0 : 1) + ' km' : Math.round(km * 1000) + ' m'; };

  /* the record a side came from, in the reader's language — the name only; the licence is in the record's own `src` */
  function recordName(side, w) {
    const T = w.T;
    switch (side.rec) {
      case 'cshapes': return T('CShapes 2.0 (sovereign states, day-exact)', 'CShapes 2.0（主権国家・日単位）');
      case 'ohm': return T('OpenHistoricalMap relation (day-exact, 1689–1885)', 'OpenHistoricalMap のリレーション（日単位・1689–1885）');
      case 'ohm-late': return T('OpenHistoricalMap relation (where CShapes is silent, from 1886)', 'OpenHistoricalMap のリレーション（1886 年以降、CShapes が述べない土地）');
      case 'clio': return T('Seshat Cliopatria (dated to the year)', 'Seshat Cliopatria（年単位）');
      case 'sheet': return T('historical-basemaps sheet', 'historical-basemaps の年代図');
      case 'sheet-rest': return T('historical-basemaps sheet (where the dated records are silent)', 'historical-basemaps の年代図（日付付きの記録が述べない土地）');
      case 'ohm-admin': return T('OpenHistoricalMap subdivision relation', 'OpenHistoricalMap の地方区分リレーション');
      /* (coast-snap-gaps) a snap piece whose parent row is not at hand (with it, the side is the parent's record) */
      case 'coast-snap': return T('IntMap: the land between a record’s coast and the real coastline (Natural Earth 1:10m), drawn with the one polity that bounds it', 'IntMap: 記録の海岸と本物の海岸線（Natural Earth 1:10m）のあいだの陸。接する唯一の政体として描く');
      case 'gap': return side.gap && side.gap.reconstructed ? T('IntMap reconstruction from cited facts', 'IntMap による復元（出典付きの事実から）')
        : side.gap && side.gap.derived ? T('IntMap derived record', 'IntMap が組み立てた記録') : T('surveyed atlas record', '出版された地図帳の記録');
      default: return T('record not identified', '記録を特定できない');
    }
  }

  /* one edge of a side, as a sentence */
  function edgeText(side, which, ixr, w) {
    const T = w.T, isEnd = which === 'end', arr = side[which];
    const lab = isEnd ? T('Until', 'まで') : T('From', 'から');
    const shown = w.day(arr);
    if (side.rec === 'cshapes') return isEnd
      ? T('Until ' + shown + ' inclusive — as CShapes 2.0 states it (gwedate)', shown + ' まで（当日を含む）— CShapes 2.0 が述べるとおり（gwedate）')
      : T('From ' + shown + ' — as CShapes 2.0 states it (gwsdate)', shown + ' から — CShapes 2.0 が述べるとおり（gwsdate）');
    if ((side.rec === 'ohm' || side.rec === 'ohm-late') && ixr && ixr.row && ixr.row[1] != null) {
      const r = ixr.row, raw = isEnd ? r[5] : r[2], by = isEnd ? r[6] : r[3], basis = isEnd ? r[7] : r[4];
      const tagName = isEnd ? 'end_date' : 'start_date', q = raw == null ? null : '«' + raw + '»';
      const read = ixr.head ? (ixr.head.retrievedAt || ixr.head.built || '?') : '?';
      const own = raw == null ? T('the relation itself states no ' + tagName, 'リレーション自身は ' + tagName + ' を述べていない') : T('the relation\'s own ' + tagName + ' is ' + q, 'リレーション自身の ' + tagName + ' は ' + q);
      if (by === 'upstream') return isEnd ? T('Until ' + shown + ' (exclusive) — OpenHistoricalMap\'s ' + tagName + ' ' + q, shown + ' まで（当日は含まない）— OpenHistoricalMap の ' + tagName + ' ' + q)
        : T('From ' + shown + ' — OpenHistoricalMap\'s ' + tagName + ' ' + q, shown + ' から — OpenHistoricalMap の ' + tagName + ' ' + q);
      if (by === 'partial') return isEnd ? T('Until ' + shown + ' — OpenHistoricalMap states only ' + q + ', so the map draws it to the end of that period', shown + ' まで — OpenHistoricalMap は ' + q + ' としか述べていないので、その期間の終わりまで描いている')
        : T('From ' + shown + ' — OpenHistoricalMap states only ' + q + ', so the map reads its first day', shown + ' から — OpenHistoricalMap は ' + q + ' としか述べていないので、その最初の日から描いている');
      if (by === 'unstated') return isEnd ? T('No end stated by OpenHistoricalMap — drawn as still in force', '終わりは OpenHistoricalMap が述べていない — 継続中として描いている')
        : T('No start stated by OpenHistoricalMap — drawn as open', '始まりは OpenHistoricalMap が述べていない — 始点なしとして描いている');
      if (by === 'unparsed') return T(tagName + ' ' + q + ' is not a date the build can read', tagName + ' ' + q + ' は、ビルドが読める日付ではない');
      if (basis === 'successor') return T(lab + ' ' + shown + ' — ended where the next record of the same entity (same Wikidata item) begins; ' + own, shown + ' まで — 同じ実体（同じ Wikidata 項目）の次の記録が始まる日で終わらせている。' + own);
      if (basis === 'one-day') return T(lab + ' ' + shown + ' — start and end are the same day, read as that one day; ' + own, shown + ' まで — 始まりと終わりが同じ日なので、その 1 日として読んでいる。' + own);
      if (basis === 'window-start') return T('From ' + shown + ' — this file begins where CShapes begins; ' + own, shown + ' から — この記録は CShapes が始まる日から始まる。' + own);
      if (basis === 'window-end') return T('Until ' + shown + ' — this file ends there; ' + own, shown + ' まで — この記録はそこで終わる。' + own);
      if (basis === 'cut-cshapes') return T(lab + ' ' + shown + ' — cut where CShapes changes the ground beside it; ' + own, shown + (isEnd ? ' まで' : ' から') + ' — 隣の CShapes が土地を変える日で切っている。' + own);
      return T(lab + ' ' + shown + ' — the map draws this day; ' + own + ' (read ' + read + ')', shown + (isEnd ? ' まで' : ' から') + ' — 地図はこの日で描いている。' + own + '（' + read + ' に読んだもの）');
    }
    if (side.rec === 'clio' && ixr && ixr.row && ixr.row[1] != null) {
      const r = ixr.row, by = isEnd ? r[6] : r[4], basis = isEnd ? r[7] : r[5], raw = isEnd ? r[3] : r[2];
      const said = isEnd ? T('Cliopatria\'s ToYear ' + raw + ' (' + w.ceYear(raw) + ')', 'Cliopatria の ToYear ' + raw + '（' + w.ceYear(raw) + '）')
        : T('Cliopatria\'s FromYear ' + raw + ' (' + w.ceYear(raw) + ')', 'Cliopatria の FromYear ' + raw + '（' + w.ceYear(raw) + '）');
      if (by === 'partial') return isEnd ? T('Until the end of ' + w.ceYear(raw) + ' — ' + said + '; Cliopatria states years, not days', w.ceYear(raw) + ' の終わりまで — ' + said + '。Cliopatria は年だけを述べ、日を述べない')
        : T('From ' + w.ceYear(raw) + ' — ' + said + '; no day is stated, so the map uses 1 January', w.ceYear(raw) + ' から — ' + said + '。日は述べられていないので 1 月 1 日から描いている');
      if (basis === 'held') return T('From ' + shown + ' — drawn back before ' + said + ' by IntMap\'s review (see the note below)', shown + ' から — ' + said + ' より前へ、IntMap の査読で描き戻している（下の註）');
      if (basis === 'window-end') return T('Until ' + shown + ' — where the record above (CShapes) takes over; ' + said, shown + ' まで — 上位の記録（CShapes）に引き継ぐところ。' + said);
      return T(lab + ' ' + shown + ' — cut where a more precise record (OpenHistoricalMap or CShapes) takes over this ground; ' + said, shown + (isEnd ? ' まで' : ' から') + ' — より精密な記録（OpenHistoricalMap か CShapes）がこの土地を引き継ぐところで切っている。' + said);
    }
    if (side.rec === 'ohm-admin' || side.rec === 'gap') {
      const d = side.dates && side.dates[which];
      if (!d) return isEnd ? T('No end stated', '終わりは述べられていない') : T('No start stated', '始まりは述べられていない');
      const bits = [];
      if (d.raw) bits.push((d.derived ? T('derived', '導出') : T('as the record states', '記録が述べるとおり')) + ' «' + d.raw + '»' + (d.precision ? ' (' + d.precision + ')' : ''));
      else if (d.derived && d.bound) bits.push(T('not stated upstream; drawn from ' + d.bound + ', taken from other units of the same system', '上流は述べていない。同じ制度の他の単位が述べる ' + d.bound + ' から描いている'));
      else bits.push(T('not stated', '述べられていない'));
      if (d.derived && d.basis) bits.push(T('basis: ', '根拠: ') + d.basis);
      if (d.corrected && d.corrected.at) bits.push(T('drawn from the reviewed date ' + d.corrected.at + (d.corrected.wareki ? ' (' + d.corrected.wareki + ')' : ''), '査読済みの日付 ' + d.corrected.at + (d.corrected.wareki ? '（' + d.corrected.wareki + '）' : '') + ' で描いている'));
      return lab + ' ' + shown + ' — ' + bits.join(' · ');
    }
    if (side.index && ixr && (ixr.missing || (ixr.row && ixr.row[1] == null))) return lab + ' ' + shown + ' — ' + T('who stated this day is not known: ', 'この日を誰が述べたかは分からない: ') + missingText(ixr, w, side);
    return lab + ' ' + shown;
  }

  function idsHtml(side, ixr, w) {
    const T = w.T, out = [];
    for (const id of side.ids || []) {
      if (id.kind === 'gw') out.push('CShapes gwcode ' + id.value);
      else if (id.kind === 'wikidata' || id.kind === 'wikidata-withheld') out.push(link('https://www.wikidata.org/wiki/' + encodeURIComponent(id.value), 'Wikidata ' + id.value));
      else if (id.kind === 'ohm-relation') out.push(link('https://www.openhistoricalmap.org/relation/' + encodeURIComponent(id.value), 'OpenHistoricalMap relation ' + id.value));
    }
    if ((side.rec === 'ohm' || side.rec === 'ohm-late') && ixr) {
      if (ixr.row && ixr.row[1] != null) {
        const rel = Array.isArray(ixr.row[1]) ? ixr.row[1] : [ixr.row[1]];
        out.push(html`${rel.length > 1 ? T('one of these OpenHistoricalMap relations: ', '次の OpenHistoricalMap リレーションのいずれか: ') : ''}${sep(rel.map((r) => link('https://www.openhistoricalmap.org/relation/' + encodeURIComponent(r), 'OpenHistoricalMap relation ' + r)), ', ')}`);
      } else out.push(T('OpenHistoricalMap relation: not known — ', 'OpenHistoricalMap のリレーション: 不明 — ') + missingText(ixr, w, side));
    }
    if (side.rec === 'clio' && ixr && ixr.row && ixr.row[1] != null) {
      const r = ixr.row;
      out.push(r[8] ? 'Seshat ID ' + r[8] : T('Seshat ID: none stated by Cliopatria', 'Seshat ID: Cliopatria は述べていない'));
      if (r[1] > 1) out.push(T(r[1] + ' Cliopatria rows share this name and span; the first is shown', 'この名前と期間を持つ Cliopatria の行が ' + r[1] + ' 件あり、最初のものを示している'));
    }
    if (side.wiki) out.push(link('https://en.wikipedia.org/wiki/' + encodeURIComponent(String(side.wiki).replace(/ /g, '_')), 'Wikipedia: ' + side.wiki));
    if (!(side.ids || []).some((x) => x.kind === 'wikidata' || x.kind === 'wikidata-withheld') && side.rec && side.rec !== 'cshapes' && side.rec.indexOf('sheet') < 0) out.push(T('Wikidata: none stated', 'Wikidata: 述べられていない'));
    return out;
  }
  function missingText(ixr, w, side) {
    const T = w.T;
    if (!ixr) return T('no index', '索引なし');
    if (ixr.missing === 'index') return T('the provenance index could not be read', '出自の索引を読めなかった');
    if (ixr.missing === 'stale') return T('the bundle was rebuilt after the provenance index, so the index does not describe this row', 'バンドルが出自の索引より後に作り直されたので、索引はこの行を記述していない');
    if (ixr.missing === 'row') return T('the provenance index has no row here', '出自の索引にこの行がない');
    if (side && side.rec === 'clio') return T('the build found no Cliopatria row with this row\'s name and years', 'この行の名前と年を持つ Cliopatria の行をビルドが見つけられなかった');
    return T('the build found no upstream relation with this row\'s name and dates (OpenHistoricalMap has changed since the bundle was built)', 'この行の名前と日付を持つ上流のリレーションをビルドが見つけられなかった（バンドルを作った後に OpenHistoricalMap が変わった）');
  }

  function geometryLines(side, set, w) {
    const T = w.T, g = side.geometry, out = [];
    if (g) {
      out.push(T('Outline: ' + g.vertices + ' vertices, written to ' + g.decimals + ' decimal places (about ' + metres(g.decimals) + ')', '輪郭: 頂点 ' + g.vertices + ' 個、小数 ' + g.decimals + ' 桁で記録（約 ' + metres(g.decimals) + '）'));
      const tol = g.tolerance != null ? g.tolerance : (set && set.tolerance != null ? set.tolerance : null);
      if (tol === 0) out.push(T('Not simplified: every source bend is kept', '簡略化していない: 出典の折れ点をすべて保っている'));
      else if (tol != null) out.push(T('Simplified by the build at a target tolerance of ' + tol + '° (about ' + degKm(tol) + ')', 'ビルドが目標許容誤差 ' + tol + '°（約 ' + degKm(tol) + '）で簡略化している'));
      else out.push(T('Simplification: the record does not state its tolerance to the page', '簡略化: 記録はページに許容誤差を述べていない'));
    }
    const d = side.detail;
    if (d && d.state === 'available') out.push(T('Zoomed in, the line is redrawn from ' + d.source + ' at ' + d.tolerance + '° / ' + d.decimals + ' decimals', '拡大時は ' + d.source + ' から ' + d.tolerance + '°・小数 ' + d.decimals + ' 桁で描き直している'));
    else if (d && d.state === 'none') out.push(T('No finer zoomed-in outline exists for this row', 'この行には拡大時のより細かい輪郭がない'));
    else if (d && d.state === 'mismatch') out.push(T('A finer outline exists for a different version of this shape, so it is not used', 'この形の別版の細かい輪郭はあるが、一致しないので使っていない'));
    else if (d && d.state === 'unread') out.push(T('Whether a finer zoomed-in outline exists is read only when you zoom in', '拡大時の細かい輪郭があるかは、拡大したときに読み込む'));
    if (side.tiles === 'live') out.push(T('The subdivision line you see is OpenHistoricalMap\'s own vector-tile geometry, not simplified by IntMap', '見えている区分線は OpenHistoricalMap 自身のベクタタイルの形で、IntMap は簡略化していない'));
    else if (side.tiles === 'absent') out.push(T('OpenHistoricalMap\'s tiles did not arrive, so the line is this record\'s outline', 'OpenHistoricalMap のタイルが届かなかったので、線はこの記録の輪郭'));
    return out;
  }
  function courseHtml(side, w) {
    const T = w.T, out = [];
    if (side.courses === null && side.rec === 'clio') out.push(T('Reviewed river and wall courses: not read yet', '査読済みの川・壁の経路: まだ読み込んでいない'));
    for (const c of side.courses || []) {
      const src = sep((c.sources || []).map((s) => (s.url ? link(s.url, s.cite || s.url) : html`${s.cite || ''}`)), '; ');
      out.push(html`${T('Part of this line is redrawn along the ' + c.name + ' (' + c.kind + ', ' + (c.span || []).join('–') + '), a reviewed fact: ', 'この線の一部は ' + c.name + '（' + c.kind + '、' + (c.span || []).join('–') + '）に沿って描き直している。査読済みの事実: ')}${src}`);
    }
    return out;
  }

  async function sideHtml(side, w, HOST) {
    const T = w.T;
    const ixr = await indexRow(side);
    const set = ixr && ixr.set;
    const lt = (() => { try { return IntMapLang.htmlTag(HOST.lang) || 'en'; } catch (_) { return 'en'; } })();
    const nm = (side.i18n && (side.i18n[lt] || side.i18n[HOST.lang])) || side.name || side.withheld || '';
    const head = nm ? html`${nm}` : html`<i>${T('unnamed shape', '名前のない形')}</i>`;
    const rows = [];
    const row = (label, content) => rows.push(html`<div style="display:flex;gap:8px;margin-top:4px;"><div style="flex:0 0 74px;color:var(--text-muted);">${label}</div><div style="flex:1;min-width:0;overflow-wrap:anywhere;">${content}</div></div>`);
    row(T('Record', '記録'), recordName(side, w));
    if (side.unattributed) row(T('Row', '行'), side.corrected ? T('re-composed by IntMap\'s era correction (js/time-borders.js) — not attributable to one shipped row', 'IntMap の年代補正（js/time-borders.js）で組み直した形 — 出荷された 1 行には帰属できない')
      : T('not attributable to a shipped row (drawn from a remote copy, or re-composed)', '出荷された行には帰属できない（リモートの写しから描いたか、組み直した形）'));
    if (side.recordName && side.recordName !== side.name) row(T('Row name', '行の名前'), '«' + side.recordName + '»' + (side.name ? T(' — drawn as «' + side.name + '» at this date', ' — この日付では「' + side.name + '」と描いている') : ''));
    if (side.realm) row(T('Realm', '上位'), T('a realm Cliopatria draws over its members', 'Cliopatria がその構成国の上に重ねて描く上位の政体'));
    if (side.of) row(T('Part of', '所属'), side.of);
    const ids = idsHtml(side, ixr, w); if (ids.length) row(T('Identifiers', '識別子'), br(ids));
    if (side.sheet != null) row(T('Dates', '日付'), T('none — this shape belongs to the sheet for ' + w.year(side.sheet) + '; the map shows the sheet nearest to the date', 'なし — この形は ' + w.year(side.sheet) + ' の年代図のもので、地図はその日付に最も近い年代図を示している'));
    else if (side.start) { row(T('From', 'から'), edgeText(side, 'start', ixr, w)); row(T('Until', 'まで'), edgeText(side, 'end', ixr, w)); }
    const geo = geometryLines(side, set, w); if (geo.length) row(T('Geometry', '幾何'), br(geo));
    /* (coast-snap-gaps) the press fell on the land between this row's copy of the coast and the real coastline */
    if (side.coastSnap) row(T('Coast', '海岸'), T('matched to the real coastline (Natural Earth 1:10m) — ' + side.coastSnap.file + ' row ' + side.coastSnap.i + (side.coastSnap.start ? ', ' + w.day(side.coastSnap.start) + ' – ' + w.day(side.coastSnap.end) + ' (exclusive)' : ''),
      '本物の海岸線（Natural Earth 1:10m）に合わせた — ' + side.coastSnap.file + ' の行 ' + side.coastSnap.i + (side.coastSnap.start ? '、' + w.day(side.coastSnap.start) + ' – ' + w.day(side.coastSnap.end) + '（終わりの日は含まない）' : '')));
    const cs = courseHtml(side, w); if (cs.length) row(T('Reviewed', '査読'), br(cs));
    if (side.notes && side.notes.length) row(T('Notes', '註'), br(side.notes.filter(Boolean)));
    if ((side.rec === 'ohm' || side.rec === 'ohm-late') && ixr && ixr.row && ixr.row[8]) {
      const tags = ixr.row[8];
      row(T('OHM tags', 'OHM のタグ'), br(Object.keys(tags).map((k) => html`<span style="font-family:ui-monospace,Menlo,monospace;font-size:10px;">${k}</span> = ${/^https?:\/\//.test(tags[k]) ? link(tags[k], tags[k]) : tags[k]}`)));
    } else if ((side.rec === 'ohm' || side.rec === 'ohm-late') && ixr && ixr.row && ixr.row[1] != null) row(T('OHM tags', 'OHM のタグ'), T('the relation carries no source, fixme, note or event tags', 'リレーションは source・fixme・note・event のタグを持たない'));
    if (side.rec === 'clio' && ixr && ixr.row && ixr.row[1] != null && (ixr.row[10] || ixr.row[11])) row('Cliopatria', [ixr.row[10] ? 'MemberOf: ' + ixr.row[10] : '', ixr.row[11] ? 'Components: ' + ixr.row[11] : ''].filter(Boolean).join(' · '));
    let dossier = null;
    if (side.rec === 'gap') {
      if (ixr && ixr.row) {
        const r = ixr.row, srcs = (set && set.sources) || {}, s = r[1] != null ? srcs[r[1]] : null;
        if (set && set.src) row(T('Licence', 'ライセンス'), set.src);
        if (s) row(T('Source', '出典'), html`${s.url ? link(s.url, s.title || s.publisher || s.url) : (s.title || s.publisher || '')}${s.citation ? html`<br>${s.citation}` : ''}`);
        if (r[2] != null) row(T('Unit', '単位'), String(r[2]) + (r[3] ? ' · ' + String(r[3]) : ''));
        if (side.gap && side.gap.reconstructed && s && s.url) dossier = { url: s.url, unit: r[2] };
      } else row(T('Source', '出典'), missingText(ixr, w, side));
    } else if (side.src) row(T('Licence', 'ライセンス'), html`${side.src}${side.citation ? html`<br>${side.citation}` : ''}${side.upstream && side.upstream.release ? html`<br>${T('upstream release ', '上流の版 ') + side.upstream.release + (side.upstream.commit ? ' · ' + String(side.upstream.commit).slice(0, 12) : '')}` : ''}`);
    const did = dossier ? 'bp-d' + Math.random().toString(36).slice(2, 9) : null;
    const dossierHtml = dossier ? html`<div style="margin-top:6px;"><button type="button" data-bp-dossier="${did}" data-url="${dossier.url}" data-unit="${String(dossier.unit || '')}" style="border:none;border-radius:7px;padding:5px 9px;font-size:11px;font-weight:600;background:var(--input-bg);color:var(--text-main);cursor:pointer;">${T('Read the dossier', '調書を読む')}</button> ${link(dossier.url, T('open on GitHub', 'GitHub で開く'))}<div id="${did}"></div></div>` : '';
    return html`<details open style="margin-top:8px;border-top:0.5px solid var(--border-color,rgba(128,128,128,.3));padding-top:6px;"><summary style="cursor:pointer;font-weight:600;font-size:12px;color:var(--text-main);">${head}</summary><div style="font-size:10.5px;line-height:1.45;color:var(--text-main);">${rows}${dossierHtml}</div></details>`;
  }

  /* a source's attribution is markup (links); the card wants its words. Read by the browser's own parser as an inert document
     (no script runs, nothing is fetched) — not by a tag-stripping pattern, which cannot be complete. The text is then escaped
     by the `html` tag like every other value. */
  function _textOf(markup) {
    try { return new DOMParser().parseFromString(String(markup), 'text/html').body.textContent || ''; } catch (_) { return ''; }
  }

  function lineHtml(sec, w, GE) {
    const T = w.T, lf = sec.line;
    if (!lf) return '';
    const attr = (src) => { try { const st = GE().scene.getStyle(); const a = st && st.sources && st.sources[src] && st.sources[src].attribution; return a ? _textOf(a) : null; } catch (_) { return null; } };
    if (lf.supply === 'modern') {
      const p = lf.props || {}, a = attr(lf.source), bits = [];
      if (p.adm0_l || p.adm0_r) bits.push(T('the tile names the two sides: ', 'タイルは両側を次のように名指している: ') + [p.adm0_l, p.adm0_r].filter(Boolean).join(' / '));
      bits.push(p.disputed ? T('marked disputed in the tile', 'タイルでは係争中と記されている') : T('not marked disputed in the tile', 'タイルでは係争中と記されていない'));
      if (p.claimed_by) bits.push(T('claimed by ', '主張: ') + p.claimed_by);
      bits.push(T('the tile carries no dates: it is today\'s map', 'タイルは日付を持たない（今日の地図）'));
      return html`<div style="font-size:10.5px;line-height:1.45;margin-top:4px;">${T('Today\'s border, drawn from ', '今日の国境。描画元: ') + (a || lf.source || '?') + ' — ' + bits.join(' · ')}</div>`;
    }
    if (lf.supply === 'tiles') {
      const ways = (lf.ways || []).map((x) => {
        const rv = (x.reviewed || []).map((r) => T(' · ' + r.edge + ' drawn from the reviewed date ' + r.at + (r.wareki ? ' (' + r.wareki + ')' : '') + '; the tile says «' + r.raw + '»', ' · ' + (r.edge === 'start' ? '始まり' : '終わり') + 'は査読済みの日付 ' + r.at + (r.wareki ? '（' + r.wareki + '）' : '') + ' で描いている（タイルは「' + r.raw + '」）')).join('');
        return html`${link('https://www.openhistoricalmap.org/way/' + encodeURIComponent(x.way), 'OpenHistoricalMap way ' + x.way)}${(x.level != null ? ' (admin_level ' + x.level + ')' : '') + ' · start_date ' + (x.start_date != null ? '«' + x.start_date + '»' : T('not stated', '述べられていない')) + ' · end_date ' + (x.end_date != null ? '«' + x.end_date + '»' : T('not stated', '述べられていない')) + rv}`;
      });
      return html`<div style="font-size:10.5px;line-height:1.45;margin-top:4px;">${T('This line is drawn from OpenHistoricalMap\'s vector tiles, at upstream\'s own geometry:', 'この線は OpenHistoricalMap のベクタタイルから、上流自身の形で描いている:')}<br>${br(ways)}</div>`;
    }
    if (lf.supply === 'bundle') return html`<div style="font-size:10.5px;margin-top:4px;">${T('OpenHistoricalMap\'s tiles did not arrive, so this line is the bundled outline of the units below.', 'OpenHistoricalMap のタイルが届かなかったので、この線は下の単位の同梱の輪郭。')}</div>`;
    if (lf.supply === 'gap') return html`<div style="font-size:10.5px;margin-top:4px;">${T('OpenHistoricalMap holds no relation here, so this line is the outline of the record below.', 'OpenHistoricalMap にはここのリレーションがないので、この線は下の記録の輪郭。')}</div>`;
    return '';
  }

  /* ── the facts → the card ────────────────────────────────────────────────── */
  async function render(prov, HOST, GE) {
    const w = W(HOST), T = w.T;
    const when = prov.date ? (prov.date.exact ? w.day([prov.date.y, prov.date.m, prov.date.d]) : w.year(prov.date.y)) : null;
    const title = prov.kind === 'line' ? T('Where this line comes from', 'この線の根拠') : T('Where these borders come from', 'この場所の境界の根拠');
    const body = [];
    for (const sec of prov.sections) {
      const fam = sec.family === 'country' ? T('Country borders', '国境') : T('Subdivision boundaries', '地方区分の境界');
      const sides = sec.sides || [];
      let lead = '';
      if (prov.kind === 'line') {
        const names = sides.filter((s) => !s.realm).map((s) => s.name || s.withheld || T('an unnamed shape', '名前のない形'));
        lead = names.length >= 2 ? T('Between ' + names.slice(0, 2).join(' and ') + (names.length > 2 ? ' (and ' + (names.length - 2) + ' more drawn here)' : ''), names.slice(0, 2).join(' と ') + ' の境界' + (names.length > 2 ? '（ほかに ' + (names.length - 2) + ' 件がここに描かれている）' : ''))
          : names.length === 1 ? T('The edge of ' + names[0] + ' — no shape of this kind is drawn on the other side at this date', names[0] + ' の縁 — この日付では反対側にこの種類の形は描かれていない')
            : (sec.line ? '' : T('No shape of this kind is drawn under the press', '押した場所にこの種類の形は描かれていない'));
      } else lead = sides.length ? '' : T('No shape of this kind is drawn here at this date', 'この日付ではここにこの種類の形は描かれていない');
      const sh = []; for (const s of sides) sh.push(await sideHtml(s, w, HOST));
      body.push(html`<div style="margin-top:10px;"><div style="font-size:11px;font-weight:700;letter-spacing:.02em;color:var(--text-muted);text-transform:uppercase;">${fam}</div>${lead ? html`<div style="font-size:12px;margin-top:3px;color:var(--text-main);">${lead}</div>` : ''}${lineHtml(sec, w, GE)}${sh}</div>`);
    }
    if (!prov.sections.length) body.push(html`<div style="font-size:12px;margin-top:6px;">${T('No border record is drawn here right now.', 'いまここに描かれている境界の記録はない。')}</div>`);
    return html`<div class="bp-card" style="min-width:236px;max-height:62vh;overflow:auto;-webkit-overflow-scrolling:touch;"><div style="font-weight:700;font-size:13px;color:var(--text-main);padding-right:30px;line-height:1.35;">${title}</div>${when ? html`<div style="font-size:10.5px;color:var(--text-muted);margin-top:2px;">${T('Map date: ', '地図の日付: ') + when}</div>` : ''}${body}<div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap;"><button type="button" class="bp-report" style="border:none;border-radius:7px;padding:6px 10px;font-size:11px;font-weight:600;background:var(--input-bg);color:var(--text-main);cursor:pointer;">${T('Report an error here', 'ここの誤りを報告')}</button></div></div>`;
  }

  /* the dossier, fetched on the press of its button: the raw file is the same document the GitHub link opens */
  async function showDossier(btn, HOST) {
    const w = W(HOST), T = w.T, box = document.getElementById(btn.getAttribute('data-bp-dossier')); if (!box) return;
    box.textContent = T('Reading…', '読み込み中…');
    const blob = btn.getAttribute('data-url') || '', unit = btn.getAttribute('data-unit') || '';
    const raw = blob.replace(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\//, 'https://raw.githubusercontent.com/$1/$2/');
    let D = null; try { D = raw !== blob ? await jsonWithin(raw, clockFor(raw, 'direct')) : null; } catch (_) { D = null; }
    if (!D) { box.textContent = T('The dossier could not be read — open it on GitHub.', '調書を読めなかった — GitHub で開いてください。'); return; }
    const parts = [];
    /* ⚠ TWO FORMS OF DOSSIER. scripts/histrecon/dossiers/*.json list `units` with dated `spans`; an assembled
       reconstruction (scripts/histrecon/assembled/, e.g. fuken1891-changes.json) is a dated CHANGE LIST — `moves`,
       `mixed`, `islands`, `counts` — under a `note` and a `scope`. The second is read by the facts that name the
       unit, in the document's own fields; nothing is restated. */
    if (!Array.isArray(D.units)) {
      const bare = String(unit).replace(/（[^）]*）|\([^)]*\)/g, '').trim();
      const names = (v) => typeof v === 'string' && (v === unit || v === bare || v.indexOf(bare + '/') === 0);
      const mentions = (x) => Object.values(x || {}).some((v) => names(v) || (Array.isArray(v) && v.some(names)));
      if (D.note) parts.push(html`<div style="margin-top:4px;">${D.note}</div>`);
      if (D.scope) parts.push(html`<div style="margin-top:4px;color:var(--text-muted);">${T('Scope: ', '範囲: ') + (D.scope.from || '?') + ' – ' + (D.scope.to || '?')}</div>`);
      let n = 0;
      for (const [k, arr] of Object.entries(D)) {
        if (!Array.isArray(arr) || k === 'unresolved') continue;
        for (const x of arr) {
          if (!x || typeof x !== 'object' || !mentions(x)) continue; n++;
          const when = x.date || (x.from && x.until ? x.from + ' – ' + x.until : (x.from || (x.until ? '– ' + x.until : '')));
          const src = (x.sources || []).map((s) => html`<li style="margin-top:3px;">${s.url ? link(s.url, s.title || s.url) : (s.title || '')}${s.says ? html`<br><span style="color:var(--text-muted);">${T('says: ', '記述: ') + s.says}</span>` : ''}</li>`);
          parts.push(html`<div style="margin-top:6px;"><b>${k + (when ? ' · ' + when : '')}</b>${x.what || x.basis ? html`<div>${x.what || x.basis}</div>` : ''}${x.dateNote ? html`<div style="color:var(--text-muted);">${x.dateNote}</div>` : ''}${src.length ? html`<ul style="margin:2px 0 0 14px;padding:0;">${src}</ul>` : ''}</div>`);
        }
      }
      if (!n) parts.push(html`<div style="margin-top:6px;">${T('No dated change in this file names «' + unit + '»: the unit is drawn as its 1920 extent for the whole scope, as the note above says.', 'このファイルには「' + unit + '」を名指す日付付きの変更がない。上の註のとおり、範囲の全期間を 1920 年の範囲で描いている。')}</div>`);
      for (const x of (D.unresolved || []).filter(mentions)) parts.push(html`<div style="margin-top:6px;">${T('Unresolved: ', '未解決: ') + (x.what || '') + ' — ' + (x.why || '')}</div>`);
      box.innerHTML = html`<div style="margin-top:4px;padding:6px 8px;border-radius:8px;background:var(--input-bg);">${parts}</div>`;
      return;
    }
    const u = D.units.find((x) => x.id === unit);
    if (D.polityNote) parts.push(html`<div style="margin-top:4px;">${D.polityNote}</div>`);
    if (!u) parts.push(html`<div style="margin-top:4px;">${T('This dossier has no unit «' + unit + '» (it may have changed since this map was built).', 'この調書には単位「' + unit + '」がない（この地図を作った後に変わった可能性がある）。')}</div>`);
    else for (const sp of u.spans || []) {
      const src = (sp.sources || []).map((s) => html`<li style="margin-top:3px;">${s.url ? link(s.url, s.title || s.url) : (s.title || '')}${s.says ? html`<br><span style="color:var(--text-muted);">${T('says: ', '記述: ') + s.says}</span>` : ''}${s.accessed ? html` <span style="color:var(--text-muted);">(${s.accessed})</span>` : ''}</li>`);
      parts.push(html`<div style="margin-top:6px;"><b>${(sp.from || '?') + ' – ' + (sp.to || '?')}</b>${sp.dateNote ? html`<div style="color:var(--text-muted);">${sp.dateNote}</div>` : ''}${src.length ? html`<ul style="margin:2px 0 0 14px;padding:0;">${src}</ul>` : T(' — no source listed for this span', ' — この期間に出典の記載がない')}</div>`);
    }
    for (const x of (D.unresolved || []).filter((x) => x.unit === unit)) parts.push(html`<div style="margin-top:6px;">${T('Unresolved: ', '未解決: ') + (x.what || '') + ' (' + (x.from || '?') + ' – ' + (x.to || '?') + ') — ' + (x.why || '')}</div>`);
    box.innerHTML = html`<div style="margin-top:4px;padding:6px 8px;border-radius:8px;background:var(--input-bg);">${parts}</div>`;
  }

  let _pop = null;
  function _close() { try { if (_pop) _pop.remove(); } catch (_) { /* gone */ } _pop = null; }
  async function present(GE, HOST, lngLat, prov) {
    remember(prov);
    const card = await render(prov, HOST, GE);
    _close();
    _pop = GE().ui.attach(GE().ui.popup({ closeButton: true, closeOnClick: true, maxWidth: '340px', className: 'plc-popup bp-popup' }).setLngLat(lngLat).setHTML(html`${card}`));
    const el = (_pop && _pop.getElement) ? _pop.getElement() : document;
    try {
      el.querySelectorAll('[data-bp-dossier]').forEach((b) => b.addEventListener('click', () => showDossier(b, HOST)));
      const rep = el.querySelector('.bp-report');
      if (rep) rep.addEventListener('click', () => {
        const fam = prov.sections[0] && prov.sections[0].family;
        const names = []; const about = [];
        for (const s of prov.sections) for (const sd of s.sides || []) {
          if (sd.name) names.push(sd.name);
          about.push((sd.name || '?') + ' [' + (sd.rec || '?') + (sd.ids || []).map((i) => ' ' + i.kind + ':' + i.value).join('') + (sd.index ? ' row ' + sd.index.i : '') + ']');
        }
        import('./map-corrections.js').then((m) => m.openCorrection(HOST, { lng: lngLat.lng, lat: lngLat.lat,
          placeLabel: names.slice(0, 3).join(' / ') || null, what: 'boundary', layerId: fam === 'subdivision' ? 'cb-admin1' : 'cb-borders',
          message: ('About: ' + about.join(' | ')).slice(0, 1500) + '\n' })).catch(() => {});
      });
    } catch (_) { /* the card still reads */ }
    return prov;
  }

  /* the tap radius in degrees of latitude, measured on the renderer at the press */
  function radiusDeg(GE, point, pad) {
    try { const a = GE().coords.unproject([point.x, point.y]), b = GE().coords.unproject([point.x, point.y + pad * 1.5]); return Math.abs(a.lat - b.lat) || 0; } catch (_) { return 0; }
  }
  async function buildLine(GE, lngLat, point, hits, pad) {
    const r = radiusDeg(GE, point, pad), sections = [];
    let date = null;
    for (const h of hits) {
      let sides = [], line = null;
      try { sides = (await h.reader.sidesAt(lngLat, r)) || []; } catch (_) { sides = []; }
      try { line = h.reader.lineFacts ? await h.reader.lineFacts(h.features) : null; } catch (_) { line = null; }
      if (!date && h.reader.date) date = h.reader.date();
      sections.push({ family: h.reader.family, reader: h.reader.id, sides, line });
    }
    return { kind: 'line', at: lngLat, date, sections };
  }
  async function buildArea(lngLat, rDeg) {
    const got = await sidesAt(lngLat, rDeg || 0);
    const date = (got.find((g) => g.date) || {}).date || null;
    return { kind: rDeg ? 'line' : 'area', at: lngLat, date, sections: got.map((g) => ({ family: g.family, reader: g.reader, sides: g.sides, line: null })) };
  }

  /* ── Atlas (js/atlas-cap-time.js `time.borderSource`) ──────────────────────── */
  async function atlas(a, K) {
    const R = K.R, note = K.note, warn = K.warn, HOST = K.HOST, geocode = K.geocode;
    const w = W(HOST), T = w.T;
    let pt = null;
    if (a.lng != null && a.lat != null && isFinite(+a.lng) && isFinite(+a.lat)) pt = { lng: +a.lng, lat: +a.lat };
    else if (a.place) { const ll = await geocode(String(a.place)); if (!ll) return R(false, warn(K.esc(T('Could not find that place', 'その場所が見つかりません') + ': ' + a.place)), { meta: { code: 'PLACE_NOT_FOUND', category: 'input', retryable: true, userGoalSatisfied: false, produced: [] } }); pt = { lng: +ll.lng, lat: +ll.lat }; }
    let prov = null;
    if (pt) prov = await buildArea(pt, a.radiusKm && isFinite(+a.radiusKm) ? Math.max(0, +a.radiusKm) / 111.32 : 0);
    else prov = last();
    if (!prov) return R(false, warn(K.esc(T('Which line? Press a border on the map, or name a place or give coordinates.', 'どの線ですか？ 地図の境界線を押すか、地名か座標を指定してください。'))), { meta: { code: 'NEEDS_INPUT', category: 'input', retryable: true, userGoalSatisfied: false, produced: [] } });
    if (!prov.sections.length) return R(true, note(K.esc(T('No historical border record is drawn there at the map\'s date (on today\'s map, press the border line itself to read the tile it comes from).', 'その場所には、地図の日付で描かれている歴史的な境界の記録がない（今日の地図では、境界線そのものを押すと描画元のタイルを読める）。'))));
    const GE = () => IntMapGeoEngine;
    const card = await render(prov, HOST, GE);
    /* the same card on the map, at the point asked about — the reader sees what Atlas read */
    if (pt && a.open !== false) { try { await present(GE, HOST, pt, prov); } catch (_) { /* the answer stands */ } }
    return R(true, String(card), { meta: { code: 'OK', category: 'ok', retryable: false, userGoalSatisfied: true, produced: ['explanation'] } });
  }

  return {
    async openAt({ GE, HOST, lngLat, point, hits, pad }) { const prov = await buildLine(GE, lngLat, point, hits, pad); return present(GE, HOST, lngLat, prov); },
    async openArea({ GE, HOST, lngLat }) { const prov = await buildArea(lngLat, 0); return present(GE, HOST, lngLat, prov); },
    atlas,
  };
})();
