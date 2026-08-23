/* ============================================================================
 *  IntMap · ATLAS — DRAWING A STRUCTURED ANSWER  (#R347)
 * ----------------------------------------------------------------------------
 *  ⚠ EVERY LINK ON THE SCREEN IS BUILT HERE, FROM THE REGISTRY, AND FROM NOWHERE ELSE.
 *
 *  The old path rendered the model's prose through `mdMini()`, which linkifies markdown links AND
 *  bare URLs — so a URL the model invented became a real, clickable anchor in the reader's answer.
 *  This renderer takes the same prose and NEUTRALISES every URL-shaped run in it before the markdown
 *  pass (`stripModelUrls`), then attaches the citations itself from the evidence records the claims
 *  name. A model-written URL therefore cannot be a link even if the audit somehow let it through:
 *  there are two independent stops, and this is the second one.
 *
 *  ⚠ THE HEADING 「Web検証済みソース」 IS A CLAIM ABOUT PROVENANCE. Only records whose origin is
 *  `hosted_web` reach it — and js/atlas-evidence.js only admits those when the hosted search actually
 *  ran for THIS call and the annotation is stamped with this call's id. Everything IntMap fetched
 *  itself is filed under the ordinary 「Sources」 heading, because that is what it is.
 *
 *  It renders; it does not judge. The audit has already run and its verdict arrives as
 *  `env.audit.status` — a degraded answer says so, above the prose, in the reader's language.
 * ==========================================================================*/

import { makeAtlasAnswerContract } from './atlas-answer-contract.js';

export function makeAtlasAnswerRender() {
  return (function () {
  const { renderedTexts } = makeAtlasAnswerContract();


  /* Neutralise anything URL-shaped so the markdown pass cannot turn it into an anchor. A markdown
     link keeps its LABEL (the readable half); a bare URL is reduced to its host in plain text. */
  function stripModelUrls(text) {
    return String(text == null ? '' : text)
      .replace(/\[([^\]\n]{1,160})\]\(\s*https?:\/\/[^)\s]{1,400}\s*\)/gi, '$1')
      .replace(/<\s*(https?:\/\/[^>\s]{1,400})\s*>/gi, (m, u) => hostOf(u))
      .replace(/https?:\/\/[^\s<)"'）】]{2,400}/gi, (u) => hostOf(u))
      .replace(/(^|[^\w@/])www\.([a-z0-9-]+\.[a-z]{2,})(\/[^\s<)"']*)?/gi, (m, pre, h) => pre + h);
  }
  function hostOf(u) { try { return new URL(String(u)).hostname.replace(/^www\./, ''); } catch (_) { return ''; } }

  /** The whole answer as plain text — what the prose↔map reconciliation and the tests read. */
  function answerPlainText(env) {
    return renderedTexts(env).map((t) => t.text).join('\n\n');
  }

  /**
   * renderAnswer(env, registry, ui) -> HTML string
   * ui = { L, esc, mdMini, linkCards }  — the same four the rest of the Atlas reply pipeline uses.
   */
  function renderAnswer(env, registry, ui) {
    const L = ui.L, esc = ui.esc, mdMini = ui.mdMini, linkCards = ui.linkCards;
    if (!env || !env.answer) return '';

    /* ── citation numbering: first reference order, so [1] is the first source the reader meets ── */
    const num = new Map();
    const order = [];
    const cite = (ids) => {
      const marks = [];
      (ids || []).forEach((cid) => {
        const c = (env.claims || []).find((x) => x.id === cid);
        if (!c) return;
        (c.evidenceIds || []).forEach((eid) => {
          const r = registry.get(eid);
          if (!r) return;
          if (!num.has(r.id)) { num.set(r.id, order.length + 1); order.push(r); }
          const n = num.get(r.id);
          if (marks.indexOf(n) < 0) marks.push(n);
        });
      });
      if (!marks.length) return '';
      return marks.sort((a, b) => a - b).map((n) => {
        const r = order[n - 1];
        const label = esc(r.publisher || r.host || r.title);
        /* ⚠ A RECORD WITH NO URL IS STILL A CITATION. IntMap's own measured data (country statistics,
           a displayed layer's live value, a computed figure) has no page to open, and rendering it as
           nothing would make a figure look unsourced precisely when its source is the most solid one
           available. It gets the same number, as a pill that does not pretend to be a link. */
        return r.finalUrl
          ? '<a class="atl-cite" href="' + esc(r.finalUrl) + '" target="_blank" rel="noopener" title="' + label + '">' + n + '</a>'
          : '<span class="atl-cite atl-cite-data" title="' + label + '">' + n + '</span>';
      }).join('');
    };

    let html = '';

    /* the honest banner a degraded answer carries — above the prose, never hidden */
    if (env.audit && env.audit.status === 'degraded') {
      html += '<div class="atl-degraded">⚠ ' + esc(L(
        'Unverified statements were removed from this answer.',
        '裏付けを確認できなかった記述は、この回答から取り除きました。',
        'Nicht belegte Aussagen wurden aus dieser Antwort entfernt.',
        'Неподтверждённые утверждения удалены из этого ответа.',
        'Se eliminaron de esta respuesta las afirmaciones no verificadas.')) + '</div>';
    }

    const da = env.answer.directAnswer || { text: '', claimIds: [] };
    if (String(da.text || '').trim()) {
      html += '<div class="atl-lead">' + mdMini(stripModelUrls(da.text)) + cite(da.claimIds) + '</div>';
    }

    (env.answer.sections || []).forEach((s) => {
      if (s.heading) html += mdMini('## ' + stripModelUrls(s.heading));
      (s.blocks || []).forEach((b) => {
        const body = stripModelUrls(b.text || '');
        if (!body.trim()) return;
        const md = (b.type === 'bullet_list')
          ? body.split(/\r?\n/).map((l) => l.replace(/^\s*[-・*]\s*/, '')).filter(Boolean).map((l) => '- ' + l).join('\n')
          : body;
        html += '<div class="atl-blk">' + mdMini(md) + cite(b.claimIds) + '</div>';
      });
    });

    const lim = (env.answer.limitations || []).filter(Boolean);
    if (lim.length) {
      html += '<div class="atl-lim"><div class="atl-lim-h">' + esc(L(
        'Limitations', '限界', 'Grenzen', 'Ограничения', 'Limitaciones')) + '</div>'
        + mdMini(lim.map((t) => '- ' + stripModelUrls(t)).join('\n')) + '</div>';
    }

    /* ── the source cards, built from the registry — never from the prose ─────────────────────── */
    const used = order.slice();
    const web = used.filter((r) => r.origin === 'hosted_web' && r.finalUrl);
    const own = used.filter((r) => r.origin !== 'hosted_web' && r.finalUrl);
    const card = (r) => ({ url: r.finalUrl, title: r.title || r.publisher || r.host, src: r.publisher || '' });
    if (web.length) {
      const c = linkCards(web.map(card));
      if (c) html += '<div class="atl-src-h">' + esc(L(
        'Web-verified sources', 'Web検証済みソース', 'Web-verifizierte Quellen',
        'Проверенные в интернете источники', 'Fuentes verificadas en la web')) + '</div>' + c;
    }
    if (own.length) {
      const c = linkCards(own.map(card));
      if (c) html += '<div class="atl-src-h">' + esc(L('Sources', 'ソース', 'Quellen', 'Источники', 'Fuentes')) + '</div>' + c;
    }
    return html;
  }

  /** The stylesheet for the pieces this file introduces. Appended to the Atlas panel CSS. */
  const answerCSS = `
  .atl-lead{font-size:1.06em;line-height:1.62;margin:0 0 .5em;}
  .atl-blk{margin:0 0 .1em;}
  .atl-cite{display:inline-block;min-width:1.15em;height:1.15em;line-height:1.15em;text-align:center;margin:0 .12em;padding:0 .22em;
    border-radius:.6em;background:var(--input-bg,rgba(128,128,128,.16));color:var(--text-muted);font-size:.68em;font-weight:600;
    text-decoration:none;vertical-align:.35em;transition:background .15s,color .15s;}
  .atl-cite:hover{background:var(--primary-color);color:#fff;}
  .atl-cite-data{cursor:default;}
  .atl-cite-data:hover{background:var(--input-bg,rgba(128,128,128,.16));color:var(--text-muted);}
  .atl-lim{margin-top:.9em;padding:.55em .75em;border-radius:10px;background:var(--input-bg,rgba(128,128,128,.09));}
  .atl-lim-h{font-size:.82em;font-weight:600;color:var(--text-muted);margin-bottom:.15em;letter-spacing:.02em;}
  .atl-degraded{margin:0 0 .6em;padding:.5em .7em;border-radius:10px;border:1px solid var(--warn-color,#c98a00);
    background:rgba(201,138,0,.09);font-size:.86em;line-height:1.5;color:var(--text-main);}
  .atl-aux{margin-top:.7em;font-size:.82em;line-height:1.5;color:var(--text-muted);}
  `;

    const API = { answerCSS, answerPlainText, renderAnswer, stripModelUrls };
    try { window.IntMapAnswerRender = API; } catch (_) { /* non-browser (the node checks) */ }
    return API;
  })();
}