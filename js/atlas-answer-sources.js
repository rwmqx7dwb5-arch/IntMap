/* ============================================================================
 *  IntMap · ATLAS — AN ANSWER'S SOURCES, FROM THE TOOLS IT RAN  (atlas-cited-answers)
 * ----------------------------------------------------------------------------
 *  「Atlas の回答の数字や地図の線ごとに、既存の出自カードと『この地図を引用する（Cite）』を自動で付け、
 *    報道や授業でそのまま根拠として使える回答にする。」
 *
 *  A tool-loop answer (js/atlas-agent.js) reached the reader as Atlas's prose over the fragments its
 *  tools rendered. The fragments named their sources — a query prints one under every column, the era
 *  borders carry a record per shape — but nothing joined them to the prose, so 「人口 3,124,000 の都市」
 *  in a sentence had no way back to GeoNames, and a reporter who wanted to put the answer under a story
 *  had to rebuild every credit by hand. The structured analysis path solved the same problem for web
 *  evidence (js/atlas-evidence.js: code fills a registry, the model may only reference it). This is
 *  that rule for everything else, with one change: the model references NOTHING. Code joins.
 *
 *  ⚠ WHERE AN ITEM COMES FROM — three facts, all read off what the turn actually did:
 *    number  a tool result's `meta.provenance` — the capability that fetched the data states, per
 *            printed quantity, its source and the values it returned (js/atlas-query.js `provenanceOf`).
 *    line    the era borders drawn when the answer was written: each record that draws a shape, its
 *            licence and the citation its publisher asks for (js/map-cite.js `citeNow` → border extract),
 *            with the line card (js/border-provenance-card.js) one press away.
 *    map     every other source the map credits while it shows the answer (js/map-recorder.js `mapCredits`,
 *            the same credits the postcard burns in and Cite lists).
 *  ⚠ A NUMBER IS MARKED ONLY WHEN IT EQUALS A VALUE A SOURCE RETURNED, at the precision the prose wrote it.
 *  Code compares; nobody infers. A number that matches nothing is left unmarked, and the list says what an
 *  unmarked number means — an answer must never look more sourced than it is
 *  ([[intmap-data-must-not-claim-an-author-it-lacks]]).
 *  ⚠ NOTHING HERE IS WRITTEN BY A MODEL. Credits, licences and citations are the records' own words; the
 *  only sentences this file writes are its own labels, in en + jp (CONSTITUTION.md §7).
 *
 *  The core (`collect`, `numbersIn`, `linkNumbers`, `footerHtml`, `plainItems`) touches no DOM and no
 *  global (the escaper is handed in — window.IntMapSafe.html in the page), so tests/atlas-cited-answers-checks.test.mjs
 *  drives the module the browser runs. `attach` and
 *  `bind` are the browser half.
 * ==========================================================================*/

import { IntMapLang } from './lang-registry.js';

const SOURCE_KINDS = Object.freeze(['number', 'line', 'map']);

/* ⚠ A NUMBER OF ONE DIGIT IS NOT MATCHED. Observed (2026-11-16, the prose of production Atlas answers read for this
   work): the one-digit numbers in Atlas's sentences are counts and ordinals of its own — 「3つの都市」「第1に」「上位5件」 —
   and a table of a few dozen rows nearly always holds every digit 0–9 somewhere, so a one-digit match would mark a
   count as a measurement. Two digits is where a coincidence stops being the expected case. Void when: the prose is
   tokenised with its unit (then «3 km» can be told from «3つ»). The one place this number is used. */
const MIN_DIGITS = 2;

export function makeAtlasAnswerSources(deps) {
  deps = deps || {};
  const lang = () => { try { return String(deps.lang ? deps.lang() : 'en'); } catch (_) { return 'en'; } };
  const T = IntMapLang.pick(lang), LA = IntMapLang.pickArgs();
  const esc = deps.esc;   /* the one encoder, handed in (window.IntMapSafe.html — js/atlas-console.js `esc`) */
  /* a label held as data: a positional tuple (js/lang-registry.js pickArgs — English first), or a string */
  function say(x) {
    if (x == null) return '';
    if (Array.isArray(x)) return String(T.arr(x));
    return String(x);
  }

  /* ── reading numbers out of prose ─────────────────────────────────────────────────────────────── */
  /* a date or a time written with digits is not a quantity — «2026-11-16», «14:30» are masked before numbers are
     read, so their parts are never matched as values */
  const NOT_A_QUANTITY = /\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}|\d{1,2}:\d{2}(?::\d{2})?/g;
  /* a number glued to a LATIN letter is part of a name — «R515», «A4», «COVID-19», «M5.2» — and is not read; one glued
     to kana or kanji is not, because Japanese writes «人口3,124,000人» with no space */
  const NUMBER = /(^|[^\d.,A-Za-z])([-−]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)(?![\d,]*\d)/g;
  /** numbersIn(text) → [{ raw, value, decimals, digits, index, length }] in reading order */
  function numbersIn(text) {
    const s = String(text == null ? '' : text).replace(NOT_A_QUANTITY, (m) => ' '.repeat(m.length));
    const out = [];
    let m;
    NUMBER.lastIndex = 0;
    while ((m = NUMBER.exec(s))) {
      const raw = m[2];
      const plain = raw.replace(/,/g, '').replace('−', '-');
      const value = Number(plain);
      if (!isFinite(value)) continue;
      const dot = plain.indexOf('.');
      out.push({ raw, value, decimals: dot < 0 ? 0 : plain.length - dot - 1, digits: plain.replace(/[^\d]/g, '').length,
        index: m.index + m[1].length, length: raw.length });
    }
    return out;
  }
  /* equal at the precision the prose wrote it: «35.68» is 35.6789 rounded to two places; «3,124,000» is exact */
  function sameAt(tok, v) {
    if (typeof v !== 'number' || !isFinite(v)) return false;
    return Number(v.toFixed(tok.decimals)) === tok.value;
  }

  /* ── what the turn's results state ────────────────────────────────────────────────────────────── */
  /**
   * collect(results, extra) → items
   *   results  the reply's kept results ({ ok, meta } — js/atlas-console.js `_atlCompose`'s `keep`)
   *   extra    { borders: { at, data:[{credit, cite, url, licence}] } | null, credits: [string], at: {lng, lat} | null }
   * Each item: { n, kind, what, of?, unit?, source, licence?, url?, cite?, origin?, values?, date?, at? }.
   * The same source stated twice for the same thing is one item.
   */
  function collect(results, extra) {
    const items = [], seen = Object.create(null);
    const add = (it) => {
      const k = it.kind + '|' + say(it.what) + '|' + say(it.of) + '|' + it.source;
      if (seen[k]) { if (it.values && seen[k].values) seen[k].values = seen[k].values.concat(it.values); return; }
      const x = Object.assign({}, it, { n: items.length + 1 }); seen[k] = x; items.push(x);
    };
    (results || []).forEach((r) => {
      if (!r || r.ok === false) return;
      const prov = r.meta && Array.isArray(r.meta.provenance) ? r.meta.provenance : [];
      prov.forEach((p) => {
        const source = p ? say(p.source) : '';
        if (!p || SOURCE_KINDS.indexOf(p.kind) < 0 || !source) return;   /* no author, no item */
        add({ kind: p.kind, what: p.what, of: p.of, unit: p.unit || '', source, licence: p.licence || '', url: p.url || '',
          origin: p.origin || '', values: Array.isArray(p.values) ? p.values.filter((v) => typeof v === 'number' && isFinite(v)) : [],
          date: p.date || '', at: p.at || null });
      });
    });
    const x = extra || {};
    const b = x.borders;
    if (b && Array.isArray(b.data)) b.data.forEach((d) => {
      if (!d || !d.credit) return;
      add({ kind: 'line', what: b.at ? LA('Historical borders of ' + b.at, b.at + ' の過去の国境') : LA('Historical borders', '過去の国境'),
        source: String(d.credit), licence: d.licence || '', url: d.url || '', cite: d.cite || '', date: b.at || '', at: x.at || null });
    });
    /* the map's other credits — the ones the border records do not already account for */
    const lineSources = items.filter((i) => i.kind === 'line').map((i) => i.source);
    (x.credits || []).forEach((c) => {
      const s = String(c || '').trim();
      if (!s || lineSources.some((l) => s.indexOf(l) >= 0 || l.indexOf(s) >= 0)) return;
      add({ kind: 'map', what: LA('Credited on the map', '地図の出典表記'), source: s });
    });
    return items;
  }

  /* ── marking the prose ────────────────────────────────────────────────────────────────────────── */
  const SKIP = { a: 1, code: 1, pre: 1, sup: 1, script: 1, style: 1, textarea: 1, button: 1 };
  /**
   * linkNumbers(html, items, id) → html with [n] after each number that equals a value of a `number` item.
   * Text inside links, code and existing superscripts is left alone; entities are never read as digits.
   */
  function linkNumbers(html, items, id) {
    const nums = (items || []).filter((i) => i.kind === 'number' && i.values && i.values.length);
    if (!nums.length) return html;
    const parts = String(html || '').split(/(<[^>]*>)/);
    let skip = 0;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (!p) continue;
      if (p[0] === '<') {
        const m = /^<\s*(\/)?\s*([a-zA-Z0-9]+)/.exec(p);
        if (m && SKIP[m[2].toLowerCase()] && !/\/\s*>$/.test(p)) skip = Math.max(0, skip + (m[1] ? -1 : 1));
        continue;
      }
      if (skip) continue;
      /* split out entities so `&#39;` is never read as 39 */
      parts[i] = p.split(/(&[#a-zA-Z0-9]+;)/).map((seg) => {
        if (!seg || seg[0] === '&') return seg;
        const toks = numbersIn(seg).filter((t) => t.digits >= MIN_DIGITS);
        if (!toks.length) return seg;
        let out = '', last = 0;
        toks.forEach((t) => {
          const hit = nums.filter((it) => it.values.some((v) => sameAt(t, v)));
          out += seg.slice(last, t.index + t.length);
          if (hit.length) out += mark(hit, id);
          last = t.index + t.length;
        });
        return out + seg.slice(last);
      }).join('');
    }
    return parts.join('');
  }
  function mark(hit, id) {
    return '<sup class="atl-srcn">' + hit.map((it) => '<a href="#' + esc(anchor(id, it.n)) + '" data-atl-srcn="' + it.n + '" title="'
      + esc(T('This value is in ', 'この値の出典: ') + say(it.what) + (it.of ? ' (' + say(it.of) + ')' : '') + ' — ' + it.source) + '">[' + it.n + ']</a>').join('') + '</sup>';
  }
  const anchor = (id, n) => 'atl-src-' + String(id || 'a').replace(/[^a-zA-Z0-9_-]/g, '') + '-' + n;

  /* ── the list under the answer ────────────────────────────────────────────────────────────────── */
  function itemText(it) {
    const what = say(it.what) + (it.of ? ' (' + say(it.of) + ')' : '') + (it.unit ? ' [' + it.unit + ']' : '');
    return { what, source: it.source, licence: it.licence || '', cite: it.cite || '' };
  }
  /** footerHtml(items, { id, pending }) — '' when nothing is sourced (an answer without sources shows none) */
  function footerHtml(items, o) {
    o = o || {};
    if (!(items && items.length) && !o.pending) return '';
    let h = '<div class="atl-srcs" data-atl-srcs="' + esc(o.id || '') + '">';
    h += '<div class="atl-srcs-h">' + esc(T('Sources of this answer', 'この回答の出典')) + '</div>';
    h += '<div class="atl-srcs-note">' + esc(T('Read from the tools this answer ran — not written by Atlas. A number marked [n] equals a value that source returned; a number without a mark was not matched to any of them.',
      'この回答が実行した道具の結果から IntMap が組み立てたもので、Atlas が書いたものではありません。[n] の付いた数字は、その出典が返した値と一致したものです。印の無い数字は、どの結果とも照合できなかったものです。')) + '</div>';
    if (items && items.length) {
      h += '<ol class="atl-srcs-list">';
      items.forEach((it) => {
        const x = itemText(it);
        h += '<li id="' + esc(anchor(o.id, it.n)) + '" data-n="' + it.n + '" data-kind="' + esc(it.kind) + '"><span class="atl-srcs-n">[' + it.n + ']</span> '
          + '<span class="atl-srcs-what">' + esc(x.what) + '</span> — <span class="atl-srcs-src">' + esc(x.source) + '</span>'
          + (x.licence ? ' <span class="atl-srcs-lic">· ' + esc(x.licence) + '</span>' : '')
          + (it.date && it.kind !== 'line' ? ' <span class="atl-srcs-lic">· ' + esc(it.date) + '</span>' : '')
          + (x.cite ? '<div class="atl-srcs-cite-line">' + esc(T('Cite as: ', '引用: ') + x.cite) + '</div>' : '')
          + (it.kind === 'line' && it.at ? ' <button type="button" class="atl-srcs-btn" data-atl-line="' + esc(it.at.lng + ',' + it.at.lat) + '">'
            + esc(T('Where this line comes from', 'この線の根拠')) + '</button>' : '')
          + '</li>';
      });
      h += '</ol>';
    }
    if (o.credit) h += '<div class="atl-srcs-credit-line">' + esc(T('Credit line: ', '出典表記: ') + o.credit) + '</div>';
    if (o.pending) h += '<div class="atl-srcs-note atl-srcs-wait">' + esc(T('Reading the records of the lines on the map…', '地図の線の記録を読んでいます…')) + '</div>';
    h += '<details class="atl-srcs-citebox"><summary>' + esc(T('Cite this answer', 'この回答を引用する')) + '</summary><div class="atl-srcs-citebody"></div></details>';
    return h + '</div>';
  }

  /** plainItems(items) → the list as stored data and as text (the notebook, a briefing, a copy): no values, no markup */
  function plainItems(items) {
    return (items || []).map((it) => {
      const x = itemText(it);
      return { n: it.n, kind: it.kind, what: x.what, source: x.source, licence: x.licence, cite: x.cite, url: it.url || '', date: it.date || '' };
    });
  }
  /** the credits a citation of the answer names: every source once, in the list's order */
  function creditsOf(items) {
    const out = [];
    (items || []).forEach((it) => { const c = it.source + (it.licence ? ' (' + it.licence + ')' : ''); if (out.indexOf(c) < 0) out.push(c); });
    return out;
  }

  return { numbersIn, collect, linkNumbers, footerHtml, plainItems, creditsOf, anchor, say, T, lang, MIN_DIGITS };
}

/* ══ THE BROWSER HALF ═════════════════════════════════════════════════════════════════════════════════
   js/atlas-console.js hands one reply bubble here each time it composes it. What needs the network or the
   map — the border records and the map's credits (js/map-cite.js, fetched on first use), the line card, the
   citation — is done here, once per bubble, and the bubble is repainted when it arrives. */
const CSS = '.atl-srcs{margin-top:10px;padding-top:8px;border-top:1px solid rgba(128,128,128,0.18);font-size:11.5px;line-height:1.5;}'
  + '.atl-srcs-h{font-weight:700;font-size:12px;margin-bottom:2px;}'
  + '.atl-srcs-note{color:var(--text-muted);font-size:11px;margin:2px 0 4px;}'
  + '.atl-srcs-list{margin:2px 0 4px;padding-left:4px;list-style:none;}'
  + '.atl-srcs-list li{margin:3px 0;border-radius:6px;transition:background .4s;}'
  + '.atl-srcs-list li.atl-srcs-flash{background:rgba(10,132,255,0.14);}'
  + '.atl-srcs-n{font-variant-numeric:tabular-nums;color:var(--accent,#0a84ff);font-weight:650;}'
  + '.atl-srcs-lic,.atl-srcs-cite-line{color:var(--text-muted);}'
  + '.atl-srcs-credit-line{margin:4px 0 2px;}'
  + '.atl-srcs-btn{margin-left:4px;border:1px solid var(--glass-border,rgba(128,128,128,0.25));background:var(--input-bg);color:var(--text-main);border-radius:8px;font-size:11px;padding:2px 8px;cursor:pointer;}'
  + '.atl-srcs-citebox summary{cursor:pointer;color:var(--accent,#0a84ff);font-weight:600;margin-top:4px;}'
  + '.atl-srcs-citebody textarea{width:100%;box-sizing:border-box;min-height:56px;resize:vertical;border:1px solid var(--glass-border,rgba(128,128,128,0.25));border-radius:8px;background:var(--input-bg);color:var(--text-main);font:11px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;padding:6px 8px;margin-top:4px;}'
  + '.atl-srcs-citebody select{margin-top:6px;height:28px;border-radius:8px;border:1px solid var(--glass-border,rgba(128,128,128,0.25));background:var(--input-bg);color:var(--text-main);font-size:11.5px;}'
  + 'sup.atl-srcn a{color:var(--accent,#0a84ff);text-decoration:none;font-size:0.78em;font-weight:650;margin-left:1px;}';
let _styled = false;
function style() {
  if (_styled || typeof document === 'undefined') return; _styled = true;
  try { const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st); } catch (_) { /* unstyled still reads */ }
}

/**
 * attachSources(ctx) → the per-console face.
 *   ctx: { core (makeAtlasAnswerSources), GE, HOST, shareLink:()=>string, onReady:(bubble)=>void }
 * compose(bubble, keep, { final }) → { head(html), footer } — sync; starts the map's half once, when the reply's
 * results changed the map, and calls `onReady(bubble)` when it lands so the console repaints.
 * bind(bubble) — the presses: [n] → its row, the line card, the citation.
 * ready(bubble) → Promise<{ items:[plain item], credit }> — what the notebook and a briefing keep, once the map's half landed.
 */
export function attachSources(ctx) {
  const core = ctx.core;
  let seq = 0;
  const changedMap = (keep) => (keep || []).some((r) => r && r.ok !== false && r.meta && (
    (Array.isArray(r.meta.produced) && r.meta.produced.indexOf('map') >= 0) || /^time\./.test(String(r.meta.capabilityId || ''))));
  function viewCentre() { try { const c = ctx.GE().camera.getCenter(); return c ? { lng: +(+c.lng).toFixed(5), lat: +(+c.lat).toFixed(5) } : null; } catch (_) { return null; } }
  function startMap(bubble, question) {
    if (bubble.__atlSrcMap) return bubble.__atlSrcMap;
    const at = viewCentre();
    bubble.__atlSrcMap = import('./map-cite.js').then((m) => m.citeNow(ctx.shareLink(), { title: question || '' }).then((r) => ({ m, r })))
      .then(({ m, r }) => {
        const borders = r && r.borders && r.borders.summary ? { at: r.borders.summary.at, data: r.borders.data || [] } : null;
        bubble.__atlSrcExtra = { borders, credits: (r && r.facts && r.facts.credits) || [], at, facts: r && r.facts, refs: m.references, formats: m.CITE_FORMATS };
      }, () => { bubble.__atlSrcExtra = { borders: null, credits: [], at, failed: true }; })
      .then(() => { try { ctx.onReady(bubble); } catch (_) { /* the next compose shows it */ } });
    return bubble.__atlSrcMap;
  }
  function compose(bubble, keep, o) {
    o = o || {};
    if (!bubble.__atlSrcId) bubble.__atlSrcId = 's' + (++seq);
    /* the map's lines and credits belong to an answer only when one of its results changed the map */
    const mapped = changedMap(keep);
    const items = core.collect(keep, mapped ? (bubble.__atlSrcExtra || {}) : {});
    /* the map's half is fetched once the answer is written: for its lines and credits when it changed the map, and
       for the citation's facts (the link, the date the map shows) whenever there is anything to cite */
    if (o.final && (mapped || items.length)) startMap(bubble, o.question);
    const ex = bubble.__atlSrcExtra;
    const pending = mapped && !!bubble.__atlSrcMap && !ex;
    bubble.__atlSrcItems = items;
    let credit = '';
    if (ex && ex.refs && ex.facts && items.length) {
      try { const cr = ex.refs(Object.assign({}, ex.facts, { title: o.question || ex.facts.title, credits: core.creditsOf(items) })).credit; credit = cr[core.lang() === 'jp' ? 'jp' : 'en']; } catch (_) { credit = ''; }
    }
    bubble.__atlSrcCredit = credit;
    return {
      head: (html) => core.linkNumbers(html, items, bubble.__atlSrcId),
      footer: o.final ? core.footerHtml(items, { id: bubble.__atlSrcId, pending, credit }) : '',
      items,
    };
  }
  function ready(bubble) {
    const done = () => ({ items: core.plainItems(bubble.__atlSrcItems || []), credit: bubble.__atlSrcCredit || '' });
    if (!bubble.__atlSrcMap || bubble.__atlSrcExtra) return Promise.resolve(done());
    return bubble.__atlSrcMap.then(done, done);
  }
  async function fillCite(bubble, box, question) {
    const ex = bubble.__atlSrcExtra;
    let refs = ex && ex.refs, facts = ex && ex.facts, formats = ex && ex.formats;
    if (!refs) {
      try {
        const m = await import('./map-cite.js'); const r = await m.citeNow(ctx.shareLink(), { title: question || '' });
        refs = m.references; facts = r.facts; formats = m.CITE_FORMATS;
      } catch (_) { box.textContent = core.T('The citation could not be made.', '引用を作れませんでした。'); return; }
    }
    const f = Object.assign({}, facts, { title: question || facts.title, credits: core.creditsOf(bubble.__atlSrcItems || []) });
    const R = refs(f);
    const node = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
    const area = (v) => { const a = /** @type {HTMLTextAreaElement} */ (node('textarea')); a.readOnly = true; a.value = v; a.spellcheck = false; return a; };
    const credit = area(R.credit[core.lang() === 'jp' ? 'jp' : 'en']); credit.className = 'atl-srcs-credit';
    const sel = /** @type {HTMLSelectElement} */ (node('select'));
    (formats || ['apa']).forEach((k) => { const op = /** @type {HTMLOptionElement} */ (node('option', null, k.toUpperCase())); op.value = k; sel.append(op); });
    const ref = area(R[sel.value] || ''); ref.className = 'atl-srcs-ref';
    sel.onchange = () => { ref.value = R[sel.value] || ''; };
    box.replaceChildren(node('div', 'atl-srcs-note', core.T('Credit line (the map and every source above), then a reference to this view — the link reopens the map as it is now.', '出典表記（地図と上のすべての出典）と、この表示の参考文献。リンクは地図をいまの状態で開きます。')), credit, sel, ref);
  }
  function bind(bubble, question) {
    style();
    const root = bubble && bubble.querySelector && bubble.querySelector('.atl-srcs');
    if (!root || root.__atlBound) return;
    root.__atlBound = true;
    bubble.addEventListener('click', (e) => {
      const t = /** @type {HTMLElement} */ (e.target);
      const a = t && t.closest ? t.closest('a[data-atl-srcn]') : null;
      if (a) {
        e.preventDefault();
        const li = bubble.querySelector('.atl-srcs-list li[data-n="' + a.getAttribute('data-atl-srcn') + '"]');
        if (li) { try { li.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (_) { /* old engine */ } li.classList.add('atl-srcs-flash'); setTimeout(() => li.classList.remove('atl-srcs-flash'), 1400); }
        return;
      }
      const b = t && t.closest ? t.closest('button[data-atl-line]') : null;
      if (b) {
        const p = String(b.getAttribute('data-atl-line') || '').split(',').map(Number);
        if (p.length === 2 && p.every(isFinite)) import('./border-provenance-card.js').then((m) => m.BorderProvenanceCard.openArea({ GE: ctx.GE, HOST: ctx.HOST, lngLat: { lng: p[0], lat: p[1] } })).catch(() => {});
      }
    });
    const box = root.querySelector('.atl-srcs-citebox');
    if (box) box.addEventListener('toggle', () => { const body = box.querySelector('.atl-srcs-citebody'); if (box.open && body && !body.childNodes.length) fillCite(bubble, body, question); });
  }
  return { compose, bind, ready };
}

/** the list as Markdown lines — the notebook's export and a copied answer write it the same way */
export function sourcesMarkdown(plain, lang, credit) {
  const t = IntMapLang.pick(() => String(lang || 'en'));
  if (!(plain && plain.length)) return [];
  const out = ['**' + t('Sources of this answer', 'この回答の出典') + '**', ''];
  plain.forEach((p) => out.push('[' + p.n + '] ' + p.what + ' — ' + p.source + (p.licence ? ' · ' + p.licence : '') + (p.cite ? ' — ' + t('cite as: ', '引用: ') + p.cite : '')));
  if (credit) out.push('', t('Credit line: ', '出典表記: ') + credit);
  out.push('');
  return out;
}
