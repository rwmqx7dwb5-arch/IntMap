/* ============================================================================
 *  IntMap · Atlas — 添付ファイルの中身を読者に見せる  (#R773)
 * ----------------------------------------------------------------------------
 *  「Atlasに添付したファイルを、IntMap内でみれるようにして。プレビュー表示」
 *  「添付したファイルをクリックしたら、画像の時と同じ要領で見れるように」
 *
 *  #R232 は添付した画像をタップで全画面にした。非画像の添付は、#R540 が「何を受け取るか」を
 *  拡張子の一覧からバイト列の問いへ替えたあとも、**名前のチップ 1 個**でしかなかった——
 *  .docx を添付した読者は、IntMap がそこから何を読み取って Atlas に渡したのかを、
 *  自分の画面では一度も見られなかった。
 *
 *  ⚠ ここが見せるのは「ファイル」ではなく **IntMap が実際に読み取って送ったもの**である。
 *  .docx の本文・.xlsx の表・.zip の中の各部は、`ATL_FILE.read` が抽出したテキストであって
 *  元の書式ではない。抽出であること・切り詰めたこと・どの文字コードで読んだことは
 *  **見出しが文として述べる**（.agents/rules/... の「述べていないことを述べさせない」）。
 *  PDF だけは元のバイトをそのまま持っているので、ブラウザ自身の PDF 表示器に渡す。
 *
 *  ⚠ 表かどうかは**名前ではなく中身に訊く**。`.csv` という綴りも `text/csv` という申告も
 *  見ない——候補の区切り文字それぞれで行を割り、**列数が行をまたいで一定であるか**を測って
 *  一番よく揃ったものを採る。揃わなければ表ではない。だから拡張子の無い TSV も、
 *  .xlsx から起こした TSV も、`;` 区切りの欧州式 CSV も、一覧に足さずに表になる。
 *
 *  ⚠ 全画面の枠（暗転・×・Escape・戻る）はこのファイルには無い。それは js/atlas-attach.js の
 *  ライトボックスが 1 本持っていて、ここは**その中に置く要素を組むだけ**。枠が 2 実装ある
 *  状態を作らない。
 * ==========================================================================*/

/* ⚠ (#R773) 会話 1 本ぶんの台帳はここの主題ではない（別ファイル）。ここが通しているのは
   js/atlas-console.js に import 1 行ぶんの余白も無いから——あの中心部は shrink-only で、
   新しい主題はファイルごと外へ出し、入口だけをまとめる（tests/r419 ⑨ / r511 / r667）。 */
import { ATTACH_LOG } from './atlas-attach-log.js';
export { ATTACH_LOG };

/** 添付の記録（ATL_FILE.read が返したもの）に id を与えて預かる場所。
 *  チップは DOM 文字列として組まれるので、記録そのものを要素に持たせられない——
 *  チップは `data-atlvid` を持ち、クリックされたときにここへ引き取りに来る。 */
export const ATTACH_STORE = (function () {
  const m = new Map();
  let seq = 0;
  return {
    /** 記録に vid を 1 度だけ与える（再描画で増えないよう、2 度目は同じ id を返す）。 */
    put(rec) { if (!rec || typeof rec !== 'object') return ''; if (!rec.vid) { rec.vid = 'af' + (++seq); m.set(rec.vid, rec); } return rec.vid; },
    get(vid) { return m.get(String(vid || '')) || null; },
    /** 送る前に外された添付は、誰も開けないので預かり続けない。 */
    drop(rec) { if (rec && rec.vid) m.delete(rec.vid); },
  };
})();

export const ATTACH_VIEW = (function () {
  /* 表の判定に使う区切り文字。⚠ これは「対応している形式の一覧」ではなく、
     区切り文字として世に在る候補そのもの——どれを採るかは下の測定が決める。 */
  const DELIMS = [',', '\t', ';', '|'];
  /* 最初に見せる量。⚠ 由来: 添付 1 件のテキストは 120,000 字が上限（ATL_FILE.LIMITS.textPerFile）で、
     その全量を最初から DOM に置くと、1 行 30 字なら 4,000 行・表なら数万セルになる——
     開いた瞬間に読者が見たいのは**冒頭**であって全量ではない。だから畳んで開き、
     **残りが何字・何行あるかを述べたボタン**が開閉する（切り捨てではない。全量は畳みの中に在る）。 */
  const FOLD_CHARS = 4000, FOLD_ROWS = 200, MAX_COLS = 60;

  /** 1 行を区切り文字で割る。⚠ 引用符の中の区切りは区切りではない（CSV の唯一の文法）。 */
  function cells(line, d) {
    const out = []; let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line.charAt(i);
      if (q) {
        if (c === '"') { if (line.charAt(i + 1) === '"') { cur += '"'; i++; } else q = false; }
        else cur += c;
      } else if (c === '"') q = true;
      else if (c === d) { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur);
    return out;
  }

  /** この文字列は表か。答えるのは綴りではなく**列数の揃い方**。
   *  返すのは {delim, rows} か null。 */
  function asTable(text) {
    const lines = String(text || '').split(/\r?\n/).filter((l) => l.length);
    if (lines.length < 2) return null;
    const probe = lines.slice(0, 50);
    let best = null;
    for (const d of DELIMS) {
      const counts = probe.map((l) => cells(l, d).length);
      const n = counts[0];
      if (n < 2) continue;
      const same = counts.filter((c) => c === n).length / counts.length;
      /* 「だいたい揃っている」では表にしない——散文に句読点として現れる `,` は
         行ごとに個数が違うので、この床がそれを落とす。 */
      if (same < 0.9) continue;
      if (!best || n > best.cols) best = { delim: d, cols: n, same: same };
    }
    if (!best) return null;
    const rows = lines.map((l) => cells(l, best.delim).slice(0, MAX_COLS));
    return { delim: best.delim, rows: rows, total: lines.length };
  }

  function el(tag, cls, txt) { const d = document.createElement(tag); if (cls) d.className = cls; if (txt != null) d.textContent = txt; return d; }

  /** 開閉するボタン。⚠ 押す前と押したあとで**違うことを述べる**——「残り N を表示」と「折りたたむ」。
   *  何も述べないシェブロン 1 個は、畳まれているものの量を読者に隠す。 */
  function folder(L, hidden, onToggle) {
    const b = el('button', 'atl-fv-fold'); b.type = 'button';
    let open = false;
    const label = () => { b.textContent = open ? (L.collapse || '') : hidden(); };
    b.addEventListener('click', (e) => { e.stopPropagation(); open = !open; onToggle(open); label(); });
    label();
    return b;
  }

  function tableNode(tb, L) {
    const wrap = el('div', 'atl-fv-tablewrap');
    const t = el('table', 'atl-fv-table');
    const head = document.createElement('thead'), hr = document.createElement('tr');
    tb.rows[0].forEach((c) => hr.appendChild(el('th', null, c)));
    head.appendChild(hr); t.appendChild(head);
    const body = document.createElement('tbody');
    const rowNode = (i) => {
      const tr = document.createElement('tr');
      for (let c = 0; c < tb.rows[0].length; c++) tr.appendChild(el('td', null, tb.rows[i][c] == null ? '' : tb.rows[i][c]));
      return tr;
    };
    const shown = Math.min(tb.rows.length, FOLD_ROWS + 1);   /* +1 は見出しの行 */
    for (let i = 1; i < shown; i++) body.appendChild(rowNode(i));
    t.appendChild(body); wrap.appendChild(t);
    const rest = tb.rows.length - shown;
    if (rest > 0) {
      /* ⚠ 残りは押されたときに初めて作る。開かれない表のために数万セルを組まない。 */
      let built = null;
      wrap.appendChild(folder(L, () => L.moreRows(rest), (open) => {
        if (open && !built) { built = document.createDocumentFragment(); for (let i = shown; i < tb.rows.length; i++) built.appendChild(rowNode(i)); body.appendChild(built); built = true; }
        else if (open) body.querySelectorAll('tr').forEach((tr, i) => { if (i >= shown - 1) tr.hidden = false; });
        else body.querySelectorAll('tr').forEach((tr, i) => { if (i >= shown - 1) tr.hidden = true; });
      }));
    }
    return wrap;
  }

  /** 長い本文は畳んで開く。短ければボタンは出ない（畳むものが無いのにボタンだけ在る状態を作らない）。 */
  function textNode(text, cls, L) {
    const box = el('div', 'atl-fv-textbox');
    const s = String(text || '');
    if (s.length <= FOLD_CHARS) { box.appendChild(el('pre', cls, s)); return box; }
    /* 切るのは行の途中ではなく**直前の改行**——文の途中で畳むと、畳まれた 1 行目が読めない。 */
    let cut = s.lastIndexOf('\n', FOLD_CHARS);
    if (cut < FOLD_CHARS / 2) cut = FOLD_CHARS;
    const pre = el('pre', cls, s.slice(0, cut));
    box.appendChild(pre);
    box.appendChild(folder(L, () => L.moreChars(s.length - cut), (open) => { pre.textContent = open ? s : s.slice(0, cut); }));
    return box;
  }

  /** JSON として読めるなら整形して返す。読めなければ null——**整形できたことが答え**で、
      拡張子は訊かない。 */
  function prettyJson(text) {
    const s = String(text || '').trim();
    if (!(s.charAt(0) === '{' || s.charAt(0) === '[')) return null;
    try { return JSON.stringify(JSON.parse(s), null, 2); } catch (_) { return null; }
  }

  function bytesToBlob(b64, mime) {
    const bin = atob(String(b64 || ''));
    const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return new Blob([u], { type: mime || 'application/octet-stream' });
  }

  /** 見出し——名前・大きさ・そして**この画面が何を見せているのか**。
   *  抽出したものを「ファイル」と呼ばないための行がここにある。 */
  function headNode(rec, L, fmtBytes) {
    const h = el('div', 'atl-fv-head');
    h.appendChild(el('div', 'atl-fv-name', rec.name || ''));
    const meta = [];
    if (rec.size) meta.push(fmtBytes(rec.size));
    const from = L.from(rec.from);
    if (from) meta.push(from);
    if (rec.encoding && rec.encoding !== 'utf-8') meta.push(rec.encoding);
    if (rec.truncated) meta.push(L.truncated);
    if (meta.length) h.appendChild(el('div', 'atl-fv-meta', meta.join(' · ')));
    return h;
  }

  /** 添付 1 件を、全画面ビューアに置ける要素にする。
   *  返す要素は `__release()` を持つことがある（PDF の Blob URL を閉じるときに返すため）。
   *  @param rec      ATL_FILE.read が返した記録（kind:'text' | 'doc' | 'image'）
   *  @param opts.L        localised strings（呼び出し元が言語を持っている）
   *  @param opts.fmtBytes atlFmtBytes（同じ書式を 2 実装しない）
   */
  function render(rec, opts) {
    const L = (opts && opts.L) || {}, fmtBytes = (opts && opts.fmtBytes) || ((n) => String(n));
    const box = el('div', 'atl-fv');
    if (!rec) { box.appendChild(el('div', 'atl-fv-empty', L.gone || '')); return box; }
    box.appendChild(headNode(rec, L, fmtBytes));
    const body = el('div', 'atl-fv-body');

    if (rec.kind === 'image' && rec.dataUrl) {
      const im = el('img', 'atl-fv-img'); im.src = rec.dataUrl; im.alt = '';
      body.appendChild(im);
    } else if (rec.kind === 'doc' && rec.b64) {
      /* ⚠ data: URL ではなく Blob URL。8 MB の PDF を data: にすると 11 MB の URL 文字列になり、
         その一本を frame の属性に置くことになる。Blob なら参照が渡るだけで、閉じるときに返せる。 */
      let url = '';
      try { url = URL.createObjectURL(bytesToBlob(rec.b64, rec.mime)); } catch (_) { url = ''; }
      if (url) {
        const f = document.createElement('iframe');
        f.className = 'atl-fv-frame'; f.src = url; f.setAttribute('title', rec.name || 'PDF');
        body.appendChild(f);
        box.__release = () => { try { URL.revokeObjectURL(url); } catch (_) {} };
        /* ⚠ 表示器を持たないブラウザ（多くの携帯）は frame を空白にして何も言わない。
           開く道を必ず 1 本添える。 */
        const a = el('a', 'atl-fv-open', L.openExternally || '');
        a.href = url; a.target = '_blank'; a.rel = 'noopener';
        box.appendChild(a);
      } else body.appendChild(el('div', 'atl-fv-empty', L.gone || ''));
    } else {
      const text = String(rec.text || '');
      const js = prettyJson(text);
      const tb = js ? null : asTable(text);
      if (js) body.appendChild(textNode(js, 'atl-fv-pre', L));
      else if (tb) body.appendChild(tableNode(tb, L));
      else body.appendChild(textNode(text, 'atl-fv-pre', L));
    }
    box.appendChild(body);
    return box;
  }

  return { render: render, asTable: asTable, prettyJson: prettyJson, cells: cells, FOLD_CHARS: FOLD_CHARS, FOLD_ROWS: FOLD_ROWS };
})();

/** ビューアの文。⚠ js/atlas-console.js は行の天井を持つ（tests/r318 ⑤ ほか）ので、主題ごと
 *  こちらに置く——「この画面が何を見せているのか」を述べる文は、その画面を組むコードの隣に在る。
 *  `L` は console の 5 言語ヘルパをそのまま受け取る（訳を 2 か所に持たない）。 */
export function attachViewStrings(L) {
  return {
    /* ⚠ (#R790) もう「送ったのはここまで、残りは消えた」ではない——全文は保たれていて、
       Atlas は尋ねられれば続きを取り寄せる（js/atlas-attach-log.js の page()）。この文はその
       事実を述べる。旧文言「先頭部分のみ送信」は消えた残りを示唆しており、実装が直った今は
       それ自体が読者への誤った説明だった。 */
    truncated: L('Only the first part is sent automatically — ask and Atlas reads on', '自動で送るのは先頭部分のみ。続きは尋ねれば読み込みます', 'Nur der erste Teil wird automatisch gesendet — frag nach, dann liest Atlas weiter', 'Автоматически отправляется только начало — спросите, и Atlas прочитает дальше', 'Solo se envía automáticamente el principio; pregunta y Atlas seguirá leyendo'),
    gone: L('This attachment is no longer available', 'この添付はもう開けません', 'Dieser Anhang ist nicht mehr verfügbar', 'Это вложение больше недоступно', 'Este adjunto ya no está disponible'),
    openExternally: L('Open in a new tab', '新しいタブで開く', 'In neuem Tab öffnen', 'Открыть в новой вкладке', 'Abrir en una pestaña nueva'),
    /* ⚠ 畳みのボタンは**残りの量を述べる**。「…」や矢印 1 個では、畳まれているものが 3 行なのか
       3 万行なのかを読者が知りようがない。押す前と押したあとで違うことを述べる。 */
    moreRows: (n) => L('Show ' + n + ' more rows', '残り ' + n + ' 行を表示', n + ' weitere Zeilen anzeigen', 'Показать ещё ' + n + ' строк', 'Mostrar ' + n + ' filas más'),
    moreChars: (n) => L('Show the remaining ' + n.toLocaleString() + ' characters', '残り ' + n.toLocaleString() + ' 字を表示', 'Restliche ' + n.toLocaleString() + ' Zeichen anzeigen', 'Показать остальные ' + n.toLocaleString() + ' символов', 'Mostrar los ' + n.toLocaleString() + ' caracteres restantes'),
    collapse: L('Collapse', '折りたたむ', 'Einklappen', 'Свернуть', 'Contraer'),
    /* 抽出元は ATL_FILE が答えた容器そのもの（docx/xlsx/pptx/odf/kmz/zip/gzip/text）。綴りの一覧では
       なく**その答えの言い換え**なので、知らない容器でも名前をそのまま出す。 */
    from: (k) => (!k || k === 'text') ? '' : L('text read from this ' + k, 'この ' + k + ' から読み取ったテキスト', 'Text aus dieser ' + k + '-Datei', 'текст из ' + k, 'texto extraído de este ' + k),
  };
}

/** ビューアの中身の CSS。枠（暗転・×）は js/atlas-attach.js の LIGHTBOX_CSS が持つ。 */
export const ATTACH_VIEW_CSS =
  '.atl-lightbox .atl-fv{display:flex;flex-direction:column;max-width:1000px;width:100%;max-height:100%;background:var(--card-bg,#fff);color:var(--text-main,#111);border-radius:12px;box-shadow:0 18px 60px rgba(0,0,0,0.55);overflow:hidden;cursor:auto;}'
  + '.atl-lightbox .atl-fv-head{padding:12px 46px 10px 16px;border-bottom:1px solid var(--atlas-glass-edge,rgba(128,128,128,0.22));flex:0 0 auto;}'
  + '.atl-lightbox .atl-fv-name{font-size:14px;font-weight:600;word-break:break-all;}'
  + '.atl-lightbox .atl-fv-meta{font-size:11.5px;opacity:.66;margin-top:3px;}'
  + '.atl-lightbox .atl-fv-body{flex:1 1 auto;min-height:0;overflow:auto;-webkit-overflow-scrolling:touch;}'
  + '.atl-lightbox .atl-fv-pre{margin:0;padding:14px 16px;font:12.5px/1.65 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;white-space:pre-wrap;word-break:break-word;}'
  + '.atl-lightbox .atl-fv-img{display:block;max-width:100%;height:auto;margin:0 auto;}'
  + '.atl-lightbox .atl-fv-frame{display:block;width:100%;height:78vh;border:0;background:#fff;}'
  + '.atl-lightbox .atl-fv-open{display:block;padding:10px 16px;font-size:12.5px;color:var(--primary-color,#0a84ff);text-decoration:none;border-top:1px solid var(--atlas-glass-edge,rgba(128,128,128,0.22));flex:0 0 auto;}'
  + '.atl-lightbox .atl-fv-tablewrap{overflow:auto;}'
  + '.atl-lightbox .atl-fv-table{border-collapse:collapse;font-size:12.5px;width:100%;}'
  + '.atl-lightbox .atl-fv-table th,.atl-lightbox .atl-fv-table td{border:1px solid var(--atlas-glass-edge,rgba(128,128,128,0.22));padding:5px 9px;text-align:left;white-space:nowrap;max-width:320px;overflow:hidden;text-overflow:ellipsis;}'
  + '.atl-lightbox .atl-fv-table th{position:sticky;top:0;background:var(--input-bg,#f2f2f7);font-weight:600;z-index:1;}'
  + '.atl-lightbox .atl-fv-empty{padding:10px 16px;font-size:12px;opacity:.66;}'
  /* (#R773) 畳みのボタン。表の下にも本文の下にも同じ 1 つが出る。 */
  + '.atl-lightbox .atl-fv-fold{display:block;width:100%;padding:9px 16px;border:0;border-top:1px solid var(--atlas-glass-edge,rgba(128,128,128,0.22));background:transparent;color:var(--primary-color,#0a84ff);font-size:12.5px;text-align:left;cursor:pointer;font-family:inherit;}'
  + '.atl-lightbox .atl-fv-fold:hover{background:var(--input-bg,rgba(128,128,128,0.08));}'
  + '.atl-lightbox .atl-fv-textbox{display:flex;flex-direction:column;}'
  + '@media(max-width:768px){ .atl-lightbox .atl-fv-frame{height:70vh;} }';
