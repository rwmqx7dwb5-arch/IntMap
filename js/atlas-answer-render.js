/* ============================================================================
 *  IntMap · ATLAS — DRAWING A STRUCTURED ANSWER  (#R350)
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
 *  It renders; it does not judge — and as of #R472 nothing else does either. The banner
 *  「裏付けを確認できなかった記述は、この回答から取り除きました」 used to stand here because code had
 *  just deleted those statements; it is gone with the deleting (js/atlas-answer-pipeline.js). The
 *  audit's findings go to Atlas instead. What still protects the reader from an invented URL is
 *  right here and unchanged: `stripModelUrls()` on every rendered field, and citation pills built
 *  ONLY from records the registry holds.
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

  /* ── (#R799) A HEADING IS A FIELD, AND A FIELD IS ITS OWN ONLY SOURCE OF TRUTH ─────────────────
     Observed in production (build 2026-09-18-R783, 「南極大陸の1人あたりGDP」): every heading of the
     answer was drawn TWICE — 「条約上の位置 / 条約上の位置」, in all three sections — because the
     section's heading reached the reader by two routes at once. `section.heading` is a field of the
     answer contract, and the prose FORMAT rules the same call carries (js/atlas-console.js) tell the
     model «EACH section started by a "## " heading on its OWN line»; so the model wrote the heading
     into the field AND as the first line of the section's first block, and this renderer drew both.

     ⚠ THE DE-DUPLICATION IS HERE, NOT IN THE PROMPT. Softening the instruction would fix this one
     answer and nothing else: the next model that restates its heading anyway — or the same one on a
     turn where the prose rules matter more — would put the reader back in front of two identical
     lines. The side that does not depend on the model having obeyed is this one.

     ⚠ IT DROPS AN EXACT RESTATEMENT AND NOTHING ELSE. The block's first line must itself BE a
     heading (an ATX `## ` run, or a whole line of bold, which the markdown pass also draws as a
     heading — js/atlas-markdown.js RE_LEAD), and its text must EQUAL the field's once the heading
     marks, the surrounding space and a trailing colon are off. A DIFFERENT heading in that position
     is a sub-heading of the section, not a duplicate, and both survive. A field-less section whose
     block carries the only heading keeps it, because there is nothing there to be a duplicate OF. */
  const RE_ATX_LINE  = /^[ \t]{0,3}#{1,6}[ \t]+\S/;
  const RE_BOLD_LINE = /^[ \t]{0,3}\*\*[^*\n]+\*\*[ \t]*[:：]?[ \t]*$/;

  /** A heading reduced to the words in it: heading marks, space (`.trim()` covers U+3000) and a
      trailing colon are typography, not identity. Two headings are the same heading when these match. */
  function headingKey(text) {
    let s = String(text == null ? '' : text).trim();
    s = s.replace(/^#{1,6}[ \t]+/, '').replace(/[ \t]*#+$/, '');
    const b = /^\*\*([\s\S]*?)\*\*$/.exec(s);
    if (b && b[1].indexOf('**') < 0) s = b[1];
    return s.replace(/\s*[:：]+$/, '').trim();
  }

  /** `body` with its opening line removed iff that line is a heading restating `heading`. */
  function dropRestatedHeading(body, heading) {
    const key = headingKey(heading);
    if (!key) return body;
    const lines = String(body == null ? '' : body).split(/\r?\n/);
    let i = 0;
    while (i < lines.length && !lines[i].trim()) i++;
    if (i >= lines.length) return body;
    const line = lines[i];
    if (!RE_ATX_LINE.test(line) && !RE_BOLD_LINE.test(line)) return body;
    if (headingKey(line) !== key) return body;
    lines.splice(i, 1);
    return lines.join('\n');
  }

  /* ⚠ (#R799) EMPHASIS OVER THE WHOLE OF A FIELD EMPHASISES NOTHING, AND IS READ AS A HEADING.
     Same production answer: the direct answer — a 50-character declarative sentence — was drawn as
     `<h4 class="atl-h atl-h4 atl-hb">`. `atl-hb` is only reachable through js/atlas-markdown.js's
     RE_LEAD, which reads a line that is nothing but a bold run as an author-written section lead;
     the model had wrapped the entire sentence in `**…**` because the format rules ask it to bold
     «the pivotal term or figure». Bold marks one part of a text against the rest, so a wrapper
     around ALL of a single-statement field marks nothing — and `directAnswer.text` is a statement by
     contract, never a label. Unwrapping it restores the sentence; every other emphasis, including a
     bold line inside a multi-line block, is untouched and still becomes a lead where it belongs. */
  function unwrapWholeEmphasis(text) {
    const t = String(text == null ? '' : text).trim();
    const m = /^\*\*([\s\S]+?)\*\*[ \t]*[:：]?$/.exec(t);
    if (!m || m[1].indexOf('**') >= 0) return text;
    return m[1];
  }

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
      /* ⚠ (#R494) [1][2][3] IS THREE PILLS OF NOISE FOR ONE ACT OF CITING. A sentence backed by three
         records rendered three separate rounded chips with a gap between each, and a paragraph with
         two such sentences read as a scatter of numbers. They are ONE pill now — one background, one
         outline, hairlines between the numbers — which is a citation cluster in the typographic sense
         and costs nothing: every number is still its own anchor to its own source, so nothing that was
         reachable before became unreachable. A single mark keeps the plain pill it always had. */
      const pills = marks.sort((a, b) => a - b).map((n) => {
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
      return marks.length > 1 ? '<span class="atl-cites">' + pills + '</span>' : pills;
    };

    let html = '';

    const da = env.answer.directAnswer || { text: '', claimIds: [] };
    if (String(da.text || '').trim()) {
      html += '<div class="atl-lead">' + mdMini(stripModelUrls(unwrapWholeEmphasis(da.text))) + cite(da.claimIds) + '</div>';
    }

    (env.answer.sections || []).forEach((s) => {
      const headText = s.heading ? stripModelUrls(s.heading) : '';
      if (s.heading) html += mdMini('## ' + headText);
      let firstBlock = true;
      (s.blocks || []).forEach((b) => {
        let body = stripModelUrls(b.text || '');
        if (!body.trim()) return;
        if (firstBlock) { body = dropRestatedHeading(body, headText); firstBlock = false; }
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
  /* (#R494) the citation CLUSTER: several marks for one statement share one pill instead of scattering
     several. Each number is still its own anchor — only the chrome around them is merged. */
  .atl-cites{display:inline-flex;vertical-align:.35em;margin:0 .12em;border-radius:.6em;overflow:hidden;
    background:var(--input-bg,rgba(128,128,128,.16));}
  .atl-cites .atl-cite{margin:0;border-radius:0;background:none;vertical-align:baseline;}
  .atl-cites .atl-cite+.atl-cite{border-left:1px solid rgba(128,128,128,.3);}
  .atl-lim{margin-top:.9em;padding:.55em .75em;border-radius:10px;background:var(--input-bg,rgba(128,128,128,.09));}
  .atl-lim-h{font-size:.82em;font-weight:600;color:var(--text-muted);margin-bottom:.15em;letter-spacing:.02em;}
  .atl-aux{margin-top:.7em;font-size:.82em;line-height:1.5;color:var(--text-muted);}
  `;

  /* ── (#R589) A LINK IS A CLAIM THAT SOMETHING WAS FETCHED ───────────────────────────────────────
     「これなに」 over 名古屋 came back citing 「(mapion.co.jp)」 — a live, clickable anchor to a page no
     part of the turn had ever requested. `stripModelUrls` above could not stop it, because the model
     did not write a bare URL: it wrote a markdown link, and js/atlas-markdown.js turns `[text](url)`
     into a real anchor exactly as it is supposed to. The structured path never showed it because that
     path builds every anchor from the registry; the CONVERSATIONAL path renders the prose as written,
     and that is the whole difference between the two.

     ⚠⚠⚠ THIS DOES NOT DELETE A SENTENCE AND MUST NEVER START TO. The words stay, the reader keeps the
     answer, and Atlas keeps every capability it had — cf. the standing rule that Atlas gets no new
     limits. What it removes is the FALSE PART: the assertion, carried by the anchor rather than by the
     prose, that IntMap went and looked. An unfetched host degrades to plain text.

     ⚠ `allowed` is the set of hosts THIS TURN actually retrieved. Not an allow-list of sites — there
     is deliberately no such list here, and there must not become one; a hand-written roster of
     «trustworthy domains» is the case-by-case hardcoding .agents/rules/no-ad-hoc-hardcoding.md
     forbids, and it would bless an invented mapion.co.jp link the moment mapion appeared on it. */
  function demoteUnfetchedLinks(html, allowed) {
    const ok = new Set();
    (allowed || []).forEach((h) => { const s = String(h || '').toLowerCase().replace(/^www\./, ''); if (s) ok.add(s); });
    return String(html == null ? '' : html).replace(
      /<a\s+href="([^"]*)"([^>]*)>([\s\S]*?)<\/a>/gi,
      (m, href, attrs, label) => {
        /* citation pills are built from the registry, never from prose — they are not this rule's business */
        if (/atl-cite/.test(attrs)) return m;
        const h = hostOf(href);
        if (!h || ok.has(h)) return m;
        return label;   /* the readable half survives; the unearned claim does not */
      });
  }

  /* demoteProseLinks(html, planCites, records) -> html
     The whole rule in one call, so js/atlas-console.js needs a line rather than a block: that file is
     shrink-only (tests/r419 ⑨d / r511 ⑨) and «the kernel shrinks by moving» is the standing answer.
     `planCites` are the planner call's own citations and `records` the compose records this reply drew
     — together, every host THIS TURN actually retrieved, and nothing else. */
  function demoteProseLinks(html, planCites, records) {
    const hosts = [];
    (planCites || []).forEach((c) => { try { hosts.push(new URL(String(c && c.url)).hostname); } catch (_) { /* unparseable is not a fetch */ } });
    (records || []).forEach((r) => {
      try { if (r && (r.host || r.finalUrl)) hosts.push(r.host || new URL(r.finalUrl).hostname); } catch (_) { /* same */ }
    });
    return demoteUnfetchedLinks(html, hosts);
  }

    const API = { answerCSS, answerPlainText, renderAnswer, stripModelUrls, demoteUnfetchedLinks, demoteProseLinks };
    try { window.IntMapAnswerRender = API; } catch (_) { /* non-browser (the node checks) */ }
    return API;
  })();
}