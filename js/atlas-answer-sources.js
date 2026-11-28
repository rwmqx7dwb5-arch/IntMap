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
/* (safe-output-single-module) the ONE URL guard — js/safe-html.js publishes globalThis.IntMapSafe */
import './safe-html.js';

/* ⚠ (atlas-figure-sources) FOUR KINDS, TWO QUESTIONS. number / line / map answer 「where does this come from」 for DATA and for the BACKGROUND the answer sits on.
   'figure' answers it for what ATLAS MADE — the zone, the route, the ring it drew. The basemap's credit (Esri, NASA …) is not the basis of a shape Atlas
   computed on top of it, and a list that only carried the first made every figure look sourced by the imagery under it. */
const SOURCE_KINDS = Object.freeze(['number', 'line', 'map', 'figure']);

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
  /* (atlas-capability-inputs) A NUMBER WRITTEN WITH ITS SCALE WORD IS THE SAME QUANTITY — 「120万人」 is 1,200,000 rounded to the
     nearest ten thousand, «3.1 million» is 3,100,000 rounded to the nearest hundred thousand. The token used to stop at the digits,
     so the one rounding every prose answer uses for a population carried no mark (dev-notes/2026-11-16-atlas-cited-answers.md §2).
     The scale words are the closed set of magnitude words the two answer languages write; the token still has to equal the value
     AT THE PRECISION IT WAS WRITTEN (sameAt), so «120万» marks 1,200,000 and not 1,500,000. */
  const SCALE_WORD = /^ ?(万|億|兆|千|thousand|million|billion|trillion)(?![A-Za-z])/i;
  const SCALE_OF = { '千': 1e3, '万': 1e4, '億': 1e8, '兆': 1e12, thousand: 1e3, million: 1e6, billion: 1e9, trillion: 1e12 };
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
      const at = m.index + m[1].length, sw = SCALE_WORD.exec(s.slice(at + raw.length));
      const scale = sw ? SCALE_OF[sw[1].toLowerCase()] : 1;
      const nd = plain.replace(/[^\d]/g, '').length;
      out.push({ raw, value, scale, decimals: dot < 0 ? 0 : plain.length - dot - 1, digits: sw ? Math.max(2, nd) : nd,   /* a scale word says it is a measurement, not a count */
        index: at, length: raw.length + (sw ? sw[0].length : 0) });
    }
    return out;
  }
  /* equal at the precision the prose wrote it: «35.68» is 35.6789 rounded to two places; «3,124,000» is exact */
  function sameAt(tok, v) {
    if (typeof v !== 'number' || !isFinite(v)) return false;
    if (tok.scale && tok.scale !== 1) return Number((v / tok.scale).toFixed(tok.decimals)) === tok.value;
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
      const k = JSON.stringify([it.kind, say(it.what), say(it.of), it.source, it.unit, it.url, it.date, it.version]);
      const old = seen[k];
      if (old) {
        if (it.values) old.values.push(...it.values);
        if (it.facts) old.facts.push(...it.facts);
        return;
      }
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
          facts: Array.isArray(p.facts) ? p.facts.filter((f) => f && Number.isFinite(f.value)) : [],
          date: p.date || '', version: p.version || '', at: p.at || null });
      });
      /* (atlas-float-typography) A FIGURE WHOSE TOOL STATED NO BASIS IS NOT LISTED. It used to get a row 「Drawn by Atlas — no data source was recorded」, one per
         shape («説明の図 1»): a source list line that names no source tells the reader nothing and is not a source. A tool that DOES state one
         (meta.provenance kind 'figure', added above) still lists it. The shape itself is on the map and in Objects. */
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
      add({ kind: 'map', what: LA('Map background credit', '背景地図の出典表記'), source: s });
    });
    return items;
  }

  /* ── marking the prose ────────────────────────────────────────────────────────────────────────── */
  const PHRASE_END = /[\s、。，．,.;；:：!?！？()（）「」『』\[\]]/;
  const INLINE_STYLE = /^(a|b|code|em|i|mark|s|small|span|strong|sub|sup|u|wbr)$/i;
  const SKIP = { a: 1, code: 1, pre: 1, sup: 1, script: 1, style: 1, textarea: 1, button: 1 };
  const SENTENCE_END = /[。；;!?！？\n]|\.(?!\d)/g;
  const CLAUSE_END = /[、。，；;!?！？\n]|,(?!\d)|\.(?!\d)/g;
  const escapePattern = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const normalized = (s) => String(s || '').normalize('NFKC').toLowerCase();
  function mentions(text, label) {
    const name = normalized(label).trim();
    if (!name) return false;
    const left = /^[a-z0-9]/i.test(name) ? '(?<![a-z0-9])' : '';
    const right = /[a-z0-9]$/i.test(name) ? '(?![a-z0-9])' : '';
    return new RegExp(left + escapePattern(name) + right).test(normalized(text));
  }
  function quantityCitation(text, token, items, left) {
    const before = text.slice(0, token.index);
    const lastBreak = [...before.matchAll(CLAUSE_END)].at(-1);
    const clauseStart = lastBreak ? lastBreak.index + 1 : 0;
    const beforeMeasure = text.slice(Math.max(clauseStart, left), token.index);
    const after = text.slice(token.index + token.length);
    const context = text.slice(clauseStart, token.index + token.length) + after.split(CLAUSE_END, 1)[0];
    const sentence = before.split(SENTENCE_END).at(-1) + token.raw + after.split(SENTENCE_END, 1)[0];
    const measures = items.filter((item) => mentions(beforeMeasure, say(item.what)));
    const places = new Set(measures.flatMap((item) => (item.facts || []).map((fact) => fact.geography)).filter(Boolean));
    const namedPlaces = new Set([...places].filter((place) => mentions(context, place)));
    if (lastBreak && /[,、]/.test(lastBreak[0])) {
      const surrounding = normalized(text.slice(0, clauseStart) + context);
      const boundary = normalized(before.slice(0, clauseStart)).length;
      for (const place of places) {
        const name = normalized(place).trim();
        const start = surrounding.lastIndexOf(name, boundary - 1);
        // A comma inside the recorded name is not the boundary of the claim.
        if (start >= 0 && start + name.length > boundary &&
            mentions(surrounding.slice(Math.max(0, start - 1), start + name.length + 1), place)) namedPlaces.add(place);
      }
    }
    const periods = new Set(measures.flatMap((item) => [item.date, ...(item.facts || []).map((fact) => fact.period)]).filter((period) => mentions(sentence, period)));
    const matchesPeriod = (period) => !period || mentions(context, period) || (periods.size === 1 && periods.has(period));
    const matches = [];
    for (const item of measures) {
      const unit = say(item.unit).trim();
      const tail = after.trimStart();
      if (unit && !(normalized(tail).startsWith(normalized(unit)) &&
          !/[a-z\d²³]/i.test(tail.slice(unit.length, unit.length + 1)))) continue;
      const equivalent = item.facts?.length ? item.facts.filter((fact) => sameAt(token, fact.value)) : null;
      if (equivalent) {
        const matchingFacts = equivalent.filter((fact) => matchesPeriod(fact.period || item.date) &&
          (!fact.geography || namedPlaces.has(fact.geography)));
        if (new Set(matchingFacts.map((fact) => fact.subjectId || fact.geography || '')).size !== 1) continue;
      } else if (!matchesPeriod(item.date) || !item.values.some((value) => sameAt(token, value))) continue;
      matches.push({ item, end: token.index + token.length + (unit ? after.length - tail.length + unit.length : 0) });
    }
    return matches.length === 1 ? matches[0] : null;
  }
  /**
   * linkNumbers(html, items, id) adds a mark when the quantity has a unique matching source and named measure.
   * Text inside links, code and existing superscripts is left alone; entities are never read as digits.
   */
  function linkNumbers(html, items, id) {
    const nums = (items || []).filter((i) => i.kind === 'number' && i.values && i.values.length);
    if (!nums.length) return html;
    const parts = String(html || '').split(/(<[^>]*>)/);
    let skip = 0, contextBefore = '';
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (!p) continue;
      if (p[0] === '<') {
        const m = /^<\s*(\/)?\s*([a-zA-Z0-9]+)/.exec(p);
        if (m && SKIP[m[2].toLowerCase()] && !/\/\s*>$/.test(p)) skip = Math.max(0, skip + (m[1] ? -1 : 1));
        if (!m || !INLINE_STYLE.test(m[2])) contextBefore = '';
        continue;
      }
      if (skip) continue;
      /* split out entities so `&#39;` is never read as 39 */
      parts[i] = p.split(/(&[#a-zA-Z0-9]+;)/).map((seg) => {
        if (!seg) return seg;
        if (seg[0] === '&') {
          contextBefore += ' ';
          return seg;
        }
        const text = contextBefore + seg, offset = contextBefore.length;
        contextBefore = text;
        const toks = numbersIn(text).filter((t) => t.digits >= MIN_DIGITS);
        if (!toks.length || toks.at(-1).index < offset) return seg;
        /* ⚠ (atlas-result-delivery) THE MARK GOES AFTER THE PHRASE THE NUMBER BELONGS TO, NOT AFTER THE NUMBER. A Japanese quantity is its unit
           («40か国», «11月11日», «1,463,865,525人», «40位»), so a mark written at the digits' last character split the word: 「40[1]か国」. The
           number says which values to cite; the mark is written where the phrase ends (the next space, punctuation or bracket, or the end of
           the text run), once per source for all the numbers of that phrase — «2026年11月11日» cites its source once, not three times. */
        const ends = [];
        toks.forEach((t, i) => {
          if (t.index < offset) return;
          const previous = toks.slice(0, i).findLast((prior) => nums.some((item) => item.values.some((value) => sameAt(prior, value))));
          const citation = quantityCitation(text, t, nums, previous ? previous.index + previous.length : 0);
          if (!citation) return;
          let e = citation.end - offset;
          while (e < seg.length && !PHRASE_END.test(seg[e])) e++;
          const at = ends.find((x) => x.e === e);
          if (at) {
            if (!at.hit.includes(citation.item)) at.hit.push(citation.item);
          } else ends.push({ e, hit: [citation.item] });
        });
        if (!ends.length) return seg;
        let out = '', last = 0;
        ends.forEach((x) => { out += seg.slice(last, x.e) + mark(x.hit, id); last = x.e; });
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

  /* ── (atlas-answer-sources) 「(apnews.com)」 IN THE PROSE IS A SOURCE, NOT A LINK ───────────────────────────────────────
     The prose cites a page as a parenthesised host, and the markdown pass makes it a blue underlined anchor — twenty of them down one
     answer read as noise over the sentences (reported 2026-11-25). A link whose label IS a host (what Atlas writes when it cites a
     page) becomes a small rounded source chip; a run of them in one pair of brackets becomes one cluster (the first two shown, the
     rest behind 「+N」). The anchor's own href is kept, so nothing that was reachable became unreachable; the card with the publisher,
     title and date is the browser half's. A link with descriptive text is a link in a sentence and stays one.
     ⚠ CODE RESHAPES MARKUP THAT IS ALREADY SAFE — every href and label here came out of js/atlas-markdown.js's escaped anchors. */
  const A_HOST = '<a href="([^"]*)" class="atl-a(?: atl-a-url)?" target="_blank" rel="noopener">([^<]*)</a>';
  /* a host name: dot-separated labels of letters, digits and hyphens, the last at least two letters — read label by label, never by a backtracking pattern */
  const HOSTISH = { test: (v) => { const p = String(v).toLowerCase().split('.'); return p.length >= 2 && p.every((l) => /^[a-z0-9-]+$/.test(l) && l[0] !== '-') && /^[a-z]{2,}$/.test(p[p.length - 1]); } };
  const hostName = (u) => { try { return new URL(String(u).replace(/&amp;/g, '&')).hostname.replace(/^www\./, ''); } catch (_) { return ''; } };
  function chipHtml(href, label, hidden) {
    const host = hostName(href) || String(label).replace(/^www\./, '');
    return '<a class="atl-sc" href="' + esc(globalThis.IntMapSafe.url(String(href).replace(/&amp;/g, '&'))) + '" target="_blank" rel="noopener" data-host="' + esc(host) + '"' + (hidden ? ' hidden' : '') + '>'
      + '<img class="atl-sc-ico" src="https://www.google.com/s2/favicons?domain=' + esc(encodeURIComponent(host)) + '&amp;sz=32" alt="" width="12" height="12" loading="lazy" data-im-error="hideSelf">'
      + '<span class="atl-sc-name">' + esc(host) + '</span></a>';
  }
  /** chipSources(html) → { html, sources:[{ url, host }] } — every distinct page the prose cited, once */
  function chipSources(html) {
    const sources = [], seen = Object.create(null);
    const note = (href) => { const u = String(href).replace(/&amp;/g, '&'); if (seen[u]) return; seen[u] = 1; sources.push({ url: u, host: hostName(u) }); };
    const one = new RegExp(A_HOST, 'g');
    const cluster = (inner) => {
      const hits = []; inner.replace(one, (m, href, label) => { if (HOSTISH.test(String(label).trim())) hits.push({ href, label }); return m; });
      /* the group is rewritten only when it holds nothing but host anchors and their separators */
      if (!hits.length || inner.replace(one, '').replace(/[\s,、;；·・]+/g, '') !== '') return null;
      hits.forEach((h) => note(h.href));
      const shown = hits.slice(0, 2), rest = hits.slice(2);
      return '<span class="atl-scs">' + shown.map((h) => chipHtml(h.href, h.label, false)).join('')
        + (rest.length ? rest.map((h) => chipHtml(h.href, h.label, true)).join('') + '<button type="button" class="atl-sc-more" aria-expanded="false">+' + rest.length + '</button>' : '') + '</span>';
    };
    const group = new RegExp('[(（]\\s*((?:' + A_HOST + '[\\s,、;；·・]*)+)\\s*[)）]', 'g');
    let out = String(html == null ? '' : html).replace(group, (m, inner) => cluster(inner) || m);
    /* a host anchor standing alone, outside brackets and not already a chip */
    out = out.replace(one, (m, href, label, off, whole) => {
      if (!HOSTISH.test(String(label).trim())) return m;
      note(href); return '<span class="atl-scs">' + chipHtml(href, label, false) + '</span>';
    });
    /* ⚠ (atlas-answer-panel) A CITATION THAT FILLS A PARAGRAPH ON ITS OWN IS THE END OF THE PARAGRAPH BEFORE IT. The model often writes
       «…本文。» and then the host in brackets on a line of its own; the markdown pass makes that a paragraph of its own, so the chip sat
       below the text with a paragraph's gap above it (reported 2026-11-26) instead of continuing the sentence. A paragraph whose whole
       content is source chips (and the separators between them) is folded into the paragraph before it — decided by what the paragraph
       CONTAINS, not by where the model happened to break the line. The first paragraph of an answer has nothing before it and stays. */
    /* what a chip paragraph is made of, read without a nested pattern: the host names are the chips' only text, the tags are markup, and «+N» is the fold button's */
    const chipsOnly = (body) => /^(?:<[^<>]*>|[\s,、;；·・+0-9])*$/.test(body.replace(/<span class="atl-sc-name">[^<]*<\/span>/g, ''));   /* tags, and whitespace/separators/«+N» between them — and nothing else; tested, never stripped */
    out = out.replace(/<\/p>\s*<p class="atl-p[^"]*">(<span class="atl-scs">[\s\S]*?)<\/p>/g, (m, body) => (chipsOnly(body) ? ' ' + body + '</p>' : m));
    return { html: out, sources };
  }

  /* ── the list under the answer ────────────────────────────────────────────────────────────────── */
  function itemText(it) {
    const what = say(it.what) + (it.of ? ' (' + say(it.of) + ')' : '') + (it.unit ? ' [' + it.unit + ']' : '');
    return { what, source: it.source, licence: it.licence || '', cite: it.cite || '' };
  }
  /** footerHtml(items, { id, pending }) — '' when nothing is sourced (an answer without sources shows none) */
  function footerHtml(items, o) {
    o = o || {};
    if (!(items && items.length) && !o.pending && !(o.web && o.web.length)) return '';
    /* ONE COLLAPSED LINE: how many sources and the first two by name; the list, the credit line and Cite open under it. */
    /* ⚠ (atlas-answer-sources) THE MAP BACKGROUND'S CREDIT IS THE MAP'S, NOT THE ANSWER'S. Esri, NASA, OSM … under a satellite view made 「この回答の出典 · 5」 out of one real source and four tiles.
       They are listed apart and never counted. A source the answer's tools actually READ is a 'number' or 'line' item and is counted; the legal credit stays on the map and in Cite. */
    const mapRows = (items || []).filter((it) => it.kind === 'map');
    const own = (items || []).filter((it) => it.kind !== 'map');
    const web = Array.isArray(o.web) ? o.web : [];
    const names = [];
    own.forEach((it) => { const n = String(it.source || '').trim(); if (n && names.indexOf(n) < 0) names.push(n); });
    web.forEach((w) => { if (w.host && names.indexOf(w.host) < 0) names.push(w.host); });
    const count = own.length + web.length;
    const sum = (count || !mapRows.length ? T('Sources of this answer', 'この回答の出典') : T('Map credits', '地図の帰属')) + (count ? ' · ' + count : '')
      + (names.length ? ' — ' + names.slice(0, 2).join(', ') + (names.length > 2 ? ' …' : '') : '');
    let h = '<details class="atl-srcs" data-atl-srcs="' + esc(o.id || '') + '"' + (o.open ? ' open' : '') + '>';
    h += '<summary class="atl-srcs-h" title="' + esc(T('Read from the tools this answer ran — not written by Atlas. A number marked [n] equals a value that source returned; a number without a mark was not matched to any of them.',
      'この回答が実行した道具の結果から IntMap が組み立てたもので、Atlas が書いたものではありません。[n] の付いた数字は、その出典が返した値と一致したものです。印の無い数字は、どの結果とも照合できなかったものです。')) + '">' + esc(sum) + '</summary>';
    /* (atlas-answer-integrity) ONE LINE, AND IT SAYS WHAT THE MARK MEANS. The note was three sentences about how the list is
       assembled («not written by Atlas», «only numbered numbers are verified») set at the same weight as the sources, and
       readers asked what the answer was based on could not find the sources under it (2026-11-17). The whole account is
       still here — in the line's tooltip, for whoever asks how the list was made. */
    /* the key to the mark is shown only when the answer actually carries marks (o.linked) — the account of how the list was made is the summary's tooltip */
    if (o.linked) h += '<div class="atl-srcs-note">' + esc(T('[n] marks a number that matches that source.', '[n] は、その出典の値と一致した数字です。')) + '</div>';
    if (web.length) {
      h += '<ol class="atl-srcs-list" data-group="web">';
      web.forEach((w) => { h += '<li data-kind="web"><span class="atl-srcs-what">' + esc(w.title || w.host) + '</span> — <a class="atl-srcs-src" href="' + esc(globalThis.IntMapSafe.url(w.url)) + '" target="_blank" rel="noopener">' + esc(w.host) + '</a>'
        + (w.date ? ' <span class="atl-srcs-lic">· ' + esc(w.date) + '</span>' : '') + '</li>'; });
      h += '</ol>';
    }
    if (own.length) {
      /* what Atlas made, and what the background and the data are credited to, are two lists: one answers for the figures, the other for everything under them */
      const groups = [
        { k: 'figure', head: T('Shapes Atlas drew', 'Atlas が描いた図形'), rows: own.filter((it) => it.kind === 'figure') },
        { k: 'data', head: T('Data', 'データ'), rows: own.filter((it) => it.kind !== 'figure') },
      ].filter((g) => g.rows.length);
      groups.forEach((g) => {
        if (groups.length > 1) h += '<div class="atl-srcs-group">' + esc(g.head) + '</div>';
        h += '<ol class="atl-srcs-list" data-group="' + g.k + '">';
        g.rows.forEach((it) => {
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
      });
    }
    if (mapRows.length) h += '<div class="atl-srcs-mapcredit">' + esc(T('Map background credits (not a source of the answer): ', '背景地図の帰属（この回答の出典ではありません）: ') + mapRows.map((it) => it.source).join(' · ')) + '</div>';
    if (o.credit) h += '<div class="atl-srcs-credit-line">' + esc(T('Credit line: ', '出典表記: ') + o.credit) + '</div>';
    if (o.pending) h += '<div class="atl-srcs-note atl-srcs-wait">' + esc(T('Reading the records of the lines on the map…', '地図の線の記録を読んでいます…')) + '</div>';
    /* the citation formats (APA · Chicago · BibTeX · RIS) stay whole — behind one small menu instead of a heading of their own */
    h += '<details class="atl-srcs-citebox atl-menu"><summary>' + esc(T('Cite this answer', 'この回答を引用する')) + '</summary><div class="atl-srcs-citebody"></div></details>';
    return h + '</details>';
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

  return { numbersIn, collect, linkNumbers, chipSources, footerHtml, plainItems, creditsOf, anchor, say, T, lang, MIN_DIGITS };
}

/* ══ THE BROWSER HALF ═════════════════════════════════════════════════════════════════════════════════
   js/atlas-console.js hands one reply bubble here each time it composes it. What needs the network or the
   map — the border records and the map's credits (js/map-cite.js, fetched on first use), the line card, the
   citation — is done here, once per bubble, and the bubble is repainted when it arrives. */
const CSS = '.atl-srcs{margin-top:var(--atl-zone-gap,10px);padding-top:6px;border-top:1px solid rgba(128,128,128,0.18);font-size:12px;line-height:1.5;color:var(--text-muted);}'
  + '.atl-srcs-h{cursor:pointer;font-weight:600;font-size:12px;margin-bottom:2px;list-style-position:inside;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
  + '.atl-srcs[open]>.atl-srcs-h{white-space:normal;}'
  + '.atl-srcs-group{margin:6px 0 0;font-size:11px;font-weight:650;letter-spacing:.02em;}'
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
  + '.atl-srcs-mapcredit{margin:4px 0 2px;font-size:11px;opacity:.8;}'
  + '.atl-srcs-src{color:inherit;text-decoration:underline;text-decoration-color:rgba(128,128,128,.5);}'
  + '.atl-scs{display:inline-flex;flex-wrap:wrap;gap:3px;vertical-align:baseline;margin:0 .15em;}'
  + '.atl-sc{display:inline-flex;align-items:center;gap:4px;max-width:11.5em;padding:0 .55em 0 .38em;height:1.55em;border-radius:.8em;background:var(--input-bg,rgba(128,128,128,.14));'
  + 'border:1px solid var(--glass-border,rgba(128,128,128,.2));color:var(--text-muted);font-size:.78em;font-weight:560;line-height:1;text-decoration:none;white-space:nowrap;vertical-align:.08em;}'
  + '.atl-sc[hidden]{display:none;}'
  + '.atl-sc:hover{color:var(--text-main);border-color:rgba(128,128,128,.45);}'
  + '.atl-sc-ico{width:12px;height:12px;border-radius:3px;flex:none;}'
  + '.atl-sc-name{overflow:hidden;text-overflow:ellipsis;}'
  + '.atl-sc-more{border:1px solid var(--glass-border,rgba(128,128,128,.2));background:var(--input-bg,rgba(128,128,128,.14));color:var(--text-muted);border-radius:.8em;height:1.55em;padding:0 .55em;font-size:.78em;font-weight:600;cursor:pointer;}'
  + '.atl-scard{box-sizing:border-box;position:fixed;z-index:var(--z-toast);padding:10px 12px;border-radius:14px;background:color-mix(in srgb,var(--popup-bg,var(--card-bg)) 66%,transparent);color:var(--text-main);border:1px solid color-mix(in srgb,var(--text-main) 14%,transparent);'
  + 'box-shadow:0 12px 36px rgba(0,0,0,.35);backdrop-filter:saturate(170%) blur(22px);-webkit-backdrop-filter:saturate(170%) blur(22px);font-size:12.5px;line-height:1.5;}'
  + '.atl-scard[hidden]{display:none;}'
  + '.atl-scard-h{display:flex;align-items:center;gap:6px;font-weight:600;color:var(--text-muted);margin-bottom:3px;}'
  + '.atl-scard-t{font-weight:600;font-size:13.5px;line-height:1.4;}'
  + '.atl-scard-d{color:var(--text-muted);font-size:11.5px;margin-top:2px;}'
  + '.atl-scard-s{margin-top:5px;color:var(--text-main);opacity:.85;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden;}'
  + '.atl-scard-open{color:inherit;text-underline-offset:.18em;}'
  + '.atl-menu>summary{display:inline-block;list-style:none;border:1px solid var(--glass-border,rgba(128,128,128,.25));border-radius:999px;padding:3px 11px;font-size:11.5px;color:var(--text-muted);font-weight:600;}'
  + '.atl-menu>summary::-webkit-details-marker{display:none;}'
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
    (Array.isArray(r.meta.produced) && r.meta.produced.indexOf('map') >= 0) || /^time\./.test(String(r.meta.capabilityId || ''))) || (Array.isArray(r.drew) && r.drew.length > 0));
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
    /* the sources list is read after head() ran, so a link the prose cites is counted even when no tool produced a source */
    const items = core.collect(keep, mapped ? (bubble.__atlSrcExtra || {}) : {});
    /* the map's half is fetched once the answer is written: for its lines and credits when it changed the map, and
       for the citation's facts (the link, the date the map shows) whenever there is anything to cite */
    if (o.final && (mapped || items.length || (bubble.__atlWeb || []).length)) startMap(bubble, o.question);
    const ex = bubble.__atlSrcExtra;
    const pending = mapped && !!bubble.__atlSrcMap && !ex;
    bubble.__atlSrcItems = items;
    let credit = '';
    let linked = false;
    if (ex && ex.refs && ex.facts && items.length) {
      try { const cr = ex.refs(Object.assign({}, ex.facts, { title: o.question || ex.facts.title, credits: core.creditsOf(items) })).credit; credit = cr[core.lang() === 'jp' ? 'jp' : 'en']; } catch (_) { credit = ''; }
    }
    bubble.__atlSrcCredit = credit;
    let web = [];
    return {
      head: (html) => {
        let out = core.linkNumbers(html, items, bubble.__atlSrcId); if (out !== html) linked = true;
        const c = core.chipSources(out); out = c.html;
        const known = (typeof ctx.cites === 'function' ? (ctx.cites() || []) : []);
        web = c.sources.map((w) => { const m = known.find((k) => k && k.url === w.url) || known.find((k) => k && String(k.url || '').replace(/^https?:\/\/(www\.)?/, '') === w.url.replace(/^https?:\/\/(www\.)?/, '')) || {};
          return { url: w.url, host: w.host, title: m.title || '', date: m.date || '', name: m.publisher || m.src || '', summary: m.summary || '' }; });
        bubble.__atlWeb = web;
        return out;
      },
      /* read AFTER head(): whether any number was actually linked decides whether the mark's key is shown */
      get footer() { return o.final ? core.footerHtml(items, { id: bubble.__atlSrcId, pending, credit, linked, web, open: !!bubble.__atlSrcsOpen }) : ''; },
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
  /* a source chip's card: who published it, what it is called, when, and the way to the page. Desktop: hover; touch: the first press (a press on the card's own link goes on). */
  const touchOnly = () => { try { return !!(window.matchMedia && window.matchMedia('(hover: none)').matches); } catch (_) { return false; } };
  let cardEl = null, cardTimer = 0;
  function hideCard() { clearTimeout(cardTimer); if (cardEl) cardEl.hidden = true; }
  function hideCardSoon() { clearTimeout(cardTimer); cardTimer = setTimeout(hideCard, 220); }
  function showCard(bubble, chip, toggle) {
    clearTimeout(cardTimer);
    const url = chip.getAttribute('href') || '', host = chip.getAttribute('data-host') || '';
    const w = (bubble.__atlWeb || []).find((x) => x.url === url) || { url, host };
    if (!cardEl) {
      cardEl = document.createElement('div'); cardEl.className = 'atl-scard'; cardEl.setAttribute('role', 'dialog'); cardEl.hidden = true; document.body.appendChild(cardEl);
      cardEl.addEventListener('pointerenter', () => clearTimeout(cardTimer)); cardEl.addEventListener('pointerleave', hideCardSoon);
      document.addEventListener('pointerdown', (e) => { if (cardEl && !cardEl.hidden && !cardEl.contains(e.target) && !(e.target.closest && e.target.closest('a.atl-sc'))) hideCard(); }, true);
    }
    if (toggle && !cardEl.hidden && cardEl.__for === chip) { hideCard(); return; }
    cardEl.__for = chip;
    const node = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
    const link = (cls, text) => {
      const a = document.createElement('a'); a.className = cls + ' atl-scard-open';
      a.textContent = text; a.href = url; a.target = '_blank'; a.rel = 'noopener';
      return a;
    };
    const head = node('div', 'atl-scard-h');
    const ico = document.createElement('img'); ico.width = 16; ico.height = 16; ico.alt = ''; ico.src = 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(host) + '&sz=32'; ico.onerror = () => ico.remove();
    const publisher = w.name || host;
    head.append(ico, w.title ? node('span', 'atl-scard-pub', publisher) : link('atl-scard-pub', publisher));
    const kids = [head];
    if (w.title) kids.push(link('atl-scard-t', w.title));
    if (w.date) kids.push(node('div', 'atl-scard-d', w.date));
    if (w.summary) kids.push(node('div', 'atl-scard-s', w.summary));
    cardEl.replaceChildren(...kids);
    cardEl.hidden = false;
    const r = chip.getBoundingClientRect(), cw = Math.min(320, window.innerWidth - 16);
    cardEl.style.width = cw + 'px';
    cardEl.style.left = Math.max(8, Math.min(window.innerWidth - cw - 8, r.left)) + 'px';
    const below = r.bottom + 8, h = cardEl.offsetHeight;
    cardEl.style.top = (below + h > window.innerHeight - 8 ? Math.max(8, r.top - h - 8) : below) + 'px';
  }
  function bind(bubble, question) {
    style();
    const root = bubble && bubble.querySelector && bubble.querySelector('.atl-srcs');
    if (!root || root.__atlBound) return;
    root.__atlBound = true;
    if (!bubble.__atlSrcsClick) bubble.__atlSrcsClick = true;   /* the delegated press below belongs to the bubble, which outlives every repaint of the list */
    else { bindRoot(); return; }
    bubble.addEventListener('click', (e) => {
      const t = /** @type {HTMLElement} */ (e.target);
      const a = t && t.closest ? t.closest('a[data-atl-srcn]') : null;
      if (a) {
        e.preventDefault();
        const li = bubble.querySelector('.atl-srcs-list li[data-n="' + a.getAttribute('data-atl-srcn') + '"]');
        const dt = bubble.querySelector('details.atl-srcs'); if (dt && !dt.open) dt.open = true;   /* the list is collapsed by default — open it before scrolling to the row */
        if (li) { try { li.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (_) { /* old engine */ } li.classList.add('atl-srcs-flash'); setTimeout(() => li.classList.remove('atl-srcs-flash'), 1400); }
        return;
      }
      const more = t && t.closest ? t.closest('button.atl-sc-more') : null;
      if (more) { const grp = more.parentNode; Array.prototype.forEach.call(grp.querySelectorAll('.atl-sc[hidden]'), (c) => { c.hidden = false; }); more.remove(); return; }
      const sc = t && t.closest ? t.closest('a.atl-sc') : null;
      if (sc && touchOnly()) { e.preventDefault(); showCard(bubble, sc, true); return; }
      const b = t && t.closest ? t.closest('button[data-atl-line]') : null;
      if (b) {
        const p = String(b.getAttribute('data-atl-line') || '').split(',').map(Number);
        if (p.length === 2 && p.every(isFinite)) import('./border-provenance-card.js').then((m) => m.BorderProvenanceCard.openArea({ GE: ctx.GE, HOST: ctx.HOST, lngLat: { lng: p[0], lat: p[1] } })).catch(() => {});
      }
    });
    bubble.addEventListener('pointerover', (e) => { const sc = e.target && e.target.closest ? e.target.closest('a.atl-sc') : null; if (sc && e.pointerType === 'mouse') showCard(bubble, sc, false); });
    bubble.addEventListener('pointerout', (e) => { const sc = e.target && e.target.closest ? e.target.closest('a.atl-sc') : null; if (sc && e.pointerType === 'mouse') hideCardSoon(); });
    bindRoot();
    function bindRoot() {
      root.addEventListener('toggle', (ev) => { if (ev.target === root) bubble.__atlSrcsOpen = root.open; });   /* a repaint (the map's half landing) keeps what the reader opened */
      const box = root.querySelector('.atl-srcs-citebox');
      if (box) box.addEventListener('toggle', () => { const body = box.querySelector('.atl-srcs-citebody'); if (box.open && body && !body.childNodes.length) fillCite(bubble, body, question); });
    }
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
