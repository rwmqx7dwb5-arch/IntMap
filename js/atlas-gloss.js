/* ============================================================================
 *  IntMap · Atlas — SELECT A PHRASE IN AN ANSWER AND ASK WHAT IT MEANS   (#R491)
 * ----------------------------------------------------------------------------
 *  「Atlas内の回答文を選択して、右クリックしたらミニポップアップがでて、その言葉の辞書的解説が
 *    AI生成される」
 *
 *  Right-click a selection inside an Atlas reply (long-press it on a touch screen) and a small card
 *  opens beside it: what the phrase means, what it means HERE, and — when there is something worth
 *  knowing — a few lines of background.
 *
 *  ══ WHAT MAKES THIS DIFFERENT FROM A BROWSER DICTIONARY ═════════════════════════════════════
 *  The passage is sent with the phrase. A dictionary can tell you that «Georgia» is a proper noun;
 *  only something holding the paragraph can tell you WHICH Georgia this sentence is about. The
 *  card's `inContext` field exists for exactly that and the model is told to resolve the referent
 *  from the passage rather than from the phrase.
 *
 *  ⚠ THE CONTEXT COMES FROM THE DOM, NOT FROM THE KERNEL. The bubble carries the answer, its
 *  previous sibling carries the question, and both are already rendered — so this module needs no
 *  access to the turn history, the envelope or the evidence registry, and cannot go stale when they
 *  change. CTX is four small things and none of them is state.
 *
 *  ⚠ IT DOES NOT SPEND THE READER'S QUESTIONS. Looking a word up runs on the SEPARATE lane added in
 *  the same round — `askAIGloss` (js/ai-core.js) → `x-intmap-lane: gloss` → public.ai_gloss_usage.
 *  A reader with the free plan has ten questions a day; three lookups while reading one answer would
 *  have taken a third of them, which would have made the feature useless for what it is for. The
 *  two lanes cannot block each other in either direction.
 *
 *  ⚠ AND IT ASKS ONCE PER PHRASE PER ANSWER. The cache is keyed by (language, bubble, phrase): the
 *  same word re-selected in the same reply is free and instant, while the same word in a DIFFERENT
 *  reply is a different question — the whole point is that the answer depends on the passage.
 *
 *  ⚠ ITS OWN FILE FOR THE REASON js/atlas-msg-tools.js IS: js/atlas-console.js is under a
 *  shrink-only line ceiling (tests/r278 ⑦ — under 5,300), and the rule beside that ceiling is that
 *  «a feature moves out, never that the ceiling moves up». The CSS is exported the same way, because
 *  the kernel owns the one <style> element.
 * ==========================================================================*/

import { personaPrompt } from './atlas-persona.js';   /* (#R285) WHO Atlas is — the ONE copy. A call site adds its task role and its task rules, never a trait */

/* The desktop rules. Solid --card-bg rather than a translucent pane: #R483 measured that the body of
   "glassing" a surface is the TEXT colour, and a definition is something you read. */
export const GLOSS_CSS = ''
  + '.atl-gloss{position:fixed;z-index:100060;width:min(344px,92vw);max-height:min(62vh,520px);display:flex;flex-direction:column;'
  + 'background:var(--card-bg);color:var(--text-main);border:1px solid var(--glass-border,rgba(128,128,128,0.26));border-radius:16px;'
  + 'box-shadow:0 12px 38px rgba(0,0,0,0.30),0 2px 8px rgba(0,0,0,0.16);overflow:hidden;'
  + 'font-size:12.5px;line-height:1.6;opacity:0;transform:translateY(-4px) scale(0.985);transition:opacity .13s ease,transform .13s ease;}'
  + '.atl-gloss.in{opacity:1;transform:none;}'
  + '.atl-gloss-head{flex:0 0 auto;display:flex;align-items:flex-start;gap:8px;padding:11px 12px 8px 14px;border-bottom:1px solid var(--glass-border,rgba(128,128,128,0.16));}'
  + '.atl-gloss-term{flex:1 1 auto;min-width:0;font-size:14px;font-weight:650;line-height:1.35;word-break:break-word;}'
  + '.atl-gloss-kind{display:block;margin-top:3px;font-size:10.5px;font-weight:500;color:var(--text-muted);letter-spacing:.02em;}'
  + '.atl-gloss-x{flex:0 0 auto;background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:17px;line-height:1;padding:2px 4px;border-radius:8px;font-family:inherit;}'
  + '.atl-gloss-x:hover{background:var(--input-bg);color:var(--text-main);}'
  + '.atl-gloss-body{flex:1 1 auto;overflow-y:auto;padding:10px 14px 4px;-webkit-overflow-scrolling:touch;}'
  + '.atl-gloss-sec{margin:0 0 10px;}'
  + '.atl-gloss-lbl{display:block;margin:0 0 2px;font-size:10px;font-weight:650;letter-spacing:.06em;text-transform:uppercase;color:var(--text-muted);}'
  + '.atl-gloss-txt{margin:0;color:var(--text-main);word-break:break-word;}'
  /* the one field a browser dictionary cannot fill is the one the eye should land on */
  + '.atl-gloss-sec.here{border-left:2px solid var(--primary-color);padding-left:9px;margin-left:-2px;}'
  + '.atl-gloss-also{display:flex;flex-wrap:wrap;gap:5px;margin-top:1px;}'
  + '.atl-gloss-also button{background:var(--input-bg);border:1px solid var(--glass-border,rgba(128,128,128,0.22));color:var(--text-main);border-radius:11px;padding:3px 9px;font-size:11px;font-family:inherit;cursor:pointer;}'
  + '.atl-gloss-also button:hover{border-color:var(--primary-color);color:var(--primary-color);}'
  + '.atl-gloss-foot{flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 12px 9px 14px;border-top:1px solid var(--glass-border,rgba(128,128,128,0.16));}'
  + '.atl-gloss-note{font-size:10px;color:var(--text-muted);line-height:1.4;}'
  + '.atl-gloss-more{flex:0 0 auto;background:var(--primary-color);border:1px solid transparent;color:#fff;border-radius:12px;padding:5px 12px;font-size:11px;font-weight:600;font-family:inherit;cursor:pointer;white-space:nowrap;}'
  + '.atl-gloss-more:hover{filter:brightness(1.07);}'
  + '.atl-gloss-load{display:flex;align-items:center;gap:8px;padding:6px 0 12px;color:var(--text-muted);font-size:12px;}'
  + '.atl-gloss-err{color:#ff453a;font-size:12px;line-height:1.5;padding:2px 0 10px;}'
  + '.atl-gloss-retry{background:var(--input-bg);border:1px solid var(--glass-border,rgba(128,128,128,0.28));color:var(--text-main);border-radius:12px;padding:5px 12px;font-size:11px;font-weight:600;font-family:inherit;cursor:pointer;}'
  /* the touch affordance: a long-press selects, and this is what it can then be tapped on */
  + '.atl-gloss-pill{position:fixed;z-index:100061;background:var(--primary-color);color:#fff;border:none;border-radius:14px;'
  + 'padding:6px 13px;font-size:12px;font-weight:600;font-family:inherit;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,0.30);'
  + 'display:inline-flex;align-items:center;gap:5px;line-height:1;}'
  ;

/* …and what changes on a phone: the card stops chasing the selection and becomes a sheet, because a
   344 px box anchored to a rect near the bottom of a 375 px screen has nowhere to be. */
export const GLOSS_CSS_MOBILE = ''
  + '.atl-gloss{left:8px!important;right:8px!important;width:auto!important;top:auto!important;'
  + 'bottom:calc(10px + env(safe-area-inset-bottom,0px))!important;max-height:64vh;border-radius:18px;font-size:13.5px;}'
  + '.atl-gloss-term{font-size:15px;}.atl-gloss-body{padding:12px 16px 6px;}'
  + '.atl-gloss-more{font-size:12.5px;padding:8px 15px;}'   /* a real touch target */
  + '.atl-gloss-also button{font-size:12px;padding:5px 11px;}'
  ;

/** THE ONE ENTRY POINT.
 *  CTX = { L, esc, chat, ask } — the picker, the escaper, an accessor for the .atl-chat element
 *  (null until the panel is built, so it is a function), and «put this question to Atlas».
 */
export function makeAtlasGloss(HOST, CTX) {
  const L = CTX.L, esc = CTX.esc;

  /* ══ THE THREE PURE ONES ══════════════════════════════════════════════════════════════════════
     They decide what the model is SHOWN, which is the whole quality of the card: the sentence the
     phrase sits in, the passage clipped around it, and the phrase itself.
     ⚠ NOT `export`ed: nothing in js/ would import them and tests/r175 ③ is right that an export
     nothing imports is dead code. The factory returns them under `text` — the same three functions it
     uses itself — so tests/r491-checks drives the shipped ones rather than a copy. */

  /** Collapse whitespace — a selection dragged across a line break carries the break. */
  function glossTidy(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }

  /** The sentence the phrase sits in — the smallest honest unit of context. */
  function glossSentence(text, term, max) {
    const cap = max || 420;
    const t = glossTidy(text);
    const i = t.toLowerCase().indexOf(String(term || '').toLowerCase());
    if (i < 0 || !term) return t.slice(0, cap);
    /* sentence enders in every language IntMap speaks, the CJK ones included */
    const ENDER = /[.!?。．！？…]|\n/;
    let s = i, e = i + term.length;
    while (s > 0 && !ENDER.test(t[s - 1])) s--;
    while (e < t.length && !ENDER.test(t[e])) e++;
    return t.slice(s, Math.min(t.length, e + 1)).trim().slice(0, cap);
  }

  /** The passage: the answer, clipped AROUND the phrase so the half that matters survives the bound.
   *  ⚠ CLIPPED AROUND IT, NOT FROM THE FRONT. A 4,000-character answer cut to its first 1,400 loses
   *  the paragraph a phrase near the end lives in — which is the only paragraph that could have
   *  answered «what does it mean HERE». */
  function glossPassage(text, term, max) {
    const cap = max || 1400;
    const t = glossTidy(text);
    if (t.length <= cap) return t;
    const i = t.toLowerCase().indexOf(String(term || '').toLowerCase());
    if (i < 0 || !term) return t.slice(0, cap);
    const half = Math.floor(cap / 2);
    const s = Math.max(0, i - half);
    return (s > 0 ? '…' : '') + t.slice(s, s + cap) + (s + cap < t.length ? '…' : '');
  }


  /* ── what counts as a phrase ──────────────────────────────────────────────────────────────
     A gloss card explains an EXPRESSION. Below the floor there is nothing to explain; above the
     ceiling the reader has selected a paragraph, and answering that as if it were a term would be
     answering a question nobody asked. */
  const MIN_LEN = 1, MAX_LEN = 200;
  const MAX_SENTENCE = 420, MAX_PASSAGE = 1400, MAX_QUESTION = 300;

  /* ── the cache: (language, answer, phrase) → the card ─────────────────────────────────────
     Keyed by the BUBBLE and not by the conversation, because `inContext` is an answer about THIS
     passage: the same word in the next reply is a different question and must be asked again. */
  const CACHE = new Map();
  const CACHE_MAX = 200;
  let _bubbleSeq = 0;
  const BUBBLE_ID = new WeakMap();
  function bubbleId(el) {
    if (!el) return '0';
    let id = BUBBLE_ID.get(el);
    if (!id) { id = 'b' + (++_bubbleSeq); BUBBLE_ID.set(el, id); }
    return id;
  }
  function cacheKey(bub, term) {
    let lang = 'en'; try { lang = String(HOST.lang || 'en'); } catch (_) { /* boot */ }
    return lang + ' ' + bubbleId(bub) + ' ' + term.toLowerCase();
  }
  function cacheGet(k) { return CACHE.has(k) ? CACHE.get(k) : null; }
  function cachePut(k, v) {
    CACHE.set(k, v);
    /* a Map iterates in insertion order, so the first key is the oldest */
    while (CACHE.size > CACHE_MAX) { const first = CACHE.keys().next(); if (first.done) break; CACHE.delete(first.value); }
  }

  /* ── reading the selection ────────────────────────────────────────────────────────────────── */
  const tidy = glossTidy;
  /** The answer bubble a selection lies in — or null if it is not wholly inside one. */
  function answerBubbleOf(sel) {
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
    const r = sel.getRangeAt(0);
    const el = (n) => (n && n.nodeType === 1 ? n : (n && n.parentElement) || null);
    const a = el(r.startContainer), b = el(r.endContainer);
    if (!a || !b) return null;
    const bubA = a.closest && a.closest('.atl-b.a'), bubB = b.closest && b.closest('.atl-b.a');
    /* both ends in the SAME answer: a selection dragged across two replies has no single passage */
    return (bubA && bubA === bubB) ? bubA : null;
  }
  const sentenceAround = (text, term) => glossSentence(text, term, MAX_SENTENCE);
  const passageAround = (text, term) => glossPassage(text, term, MAX_PASSAGE);
  /** The question that produced this answer — the bubble before it, or its tool bar's sibling. */
  function questionFor(bub) {
    let n = bub && bub.previousElementSibling;
    for (let i = 0; n && i < 4; i++, n = n.previousElementSibling) {
      if (n.classList && n.classList.contains('atl-b') && n.classList.contains('u')) return tidy(n.textContent).slice(0, MAX_QUESTION);
    }
    return '';
  }

  /* ── the prompt ───────────────────────────────────────────────────────────────────────────── */
  function systemPrompt() {
    let langLine = '';
    try { langLine = window._aiLangLine ? window._aiLangLine() : ''; } catch (_) { langLine = ''; }
    return personaPrompt('the term glossary of the IntMap world map')
      + 'The reader has selected a phrase inside an answer you gave and wants to know what it means. Write about THAT PHRASE ONLY.\n'
      + '· "term": the phrase as it should be shown — the reader\'s selection, tidied (fix a truncated word boundary, nothing else).\n'
      + '· "kind": what kind of expression it is, in one short noun phrase (e.g. noun phrase, military term, place name, treaty article, economic indicator).\n'
      + '· "sense": the general, dictionary meaning — independent of this answer.\n'
      + '· "inContext": what it means HERE. Resolve the referent from the passage: which country, which body, which of two identically-spelled places. This is the field the reader cannot get from a dictionary, so it must be specific — name the thing. If the passage genuinely does not settle the reading, say which readings are possible and that the passage does not choose.\n'
      + '· "background": one to three sentences, and ONLY when there is real background worth knowing. Omit it for an ordinary word.\n'
      + '· "also": up to four closely related terms worth looking up next, or omit.\n'
      + 'Be exact and brief — this is a card beside the text, not an essay. Do not repeat the passage back. Never state a fact you are not sure of.'
      + langLine;
  }
  function userPrompt(term, sentence, passage, question) {
    let p = 'PHRASE: ' + term + '\n\nSENTENCE IT APPEARS IN: ' + sentence + '\n\nPASSAGE (the answer the reader is reading):\n' + passage;
    if (question) p += '\n\nTHE READER ORIGINALLY ASKED: ' + question;
    return p;
  }

  /* ── the card ─────────────────────────────────────────────────────────────────────────────── */
  let card = null, pill = null, anchorRange = null, anchorRect = null, closeWired = false, reqSeq = 0;

  function ensureCard() {
    if (card) return card;
    card = document.createElement('div');
    card.className = 'atl-gloss';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-live', 'polite');
    document.body.appendChild(card);
    /* a click INSIDE the card must not reach the outside-click closer below */
    card.addEventListener('mousedown', (e) => { e.stopPropagation(); });
    card.addEventListener('touchstart', (e) => { e.stopPropagation(); }, { passive: true });
    return card;
  }
  function wireGlobalClosers() {
    if (closeWired) return; closeWired = true;
    document.addEventListener('mousedown', (e) => { if (card && card.style.display !== 'none' && !card.contains(e.target)) closeCard(); }, true);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && card && card.style.display !== 'none') { closeCard(); } });
    /* the card is position:fixed and the answer scrolls under it — follow the phrase, and leave when
       the phrase does. Passive: this listener never cancels the scroll it is watching. */
    const follow = () => { if (card && card.style.display !== 'none') place(); };
    window.addEventListener('scroll', follow, true);
    window.addEventListener('resize', follow);
  }
  function closeCard() {
    if (card) { card.classList.remove('in'); card.style.display = 'none'; }
    anchorRange = null; anchorRect = null;
    hidePill();
  }
  function isMobile() { try { return window.matchMedia('(max-width:768px)').matches; } catch (_) { return false; } }
  /** Put the card beside the phrase — below it if there is room, above it if there is not. */
  function place() {
    if (!card) return;
    if (isMobile()) return;   /* the sheet rules in GLOSS_CSS_MOBILE own the geometry there */
    let r = anchorRect;
    /* the live range is preferred: the passage may have scrolled since the card opened */
    try { if (anchorRange) { const lr = anchorRange.getBoundingClientRect(); if (lr && (lr.width || lr.height)) { r = lr; anchorRect = lr; } } } catch (_) { /* detached */ }
    if (!r) return;
    const vw = window.innerWidth || 1024, vh = window.innerHeight || 768;
    const w = card.offsetWidth || 344, h = card.offsetHeight || 240, GAP = 8, PAD = 8;
    let top = r.bottom + GAP;
    if (top + h > vh - PAD) { const above = r.top - GAP - h; top = above >= PAD ? above : Math.max(PAD, vh - PAD - h); }
    let left = r.left + (r.width / 2) - (w / 2);
    left = Math.max(PAD, Math.min(left, vw - PAD - w));
    card.style.top = Math.round(top) + 'px';
    card.style.left = Math.round(left) + 'px';
  }

  const T = {
    meaning: () => L('Meaning', '意味', 'Bedeutung', 'Значение', 'Significado'),
    here: () => L('In this passage', 'この文での意味', 'In dieser Stelle', 'В этом фрагменте', 'En este pasaje'),
    background: () => L('Background', '背景', 'Hintergrund', 'Контекст', 'Contexto'),
    also: () => L('Related', '関連語', 'Verwandt', 'Связанное', 'Relacionado'),
    thinking: () => L('Looking it up…', '調べています…', 'Wird nachgeschlagen…', 'Ищу…', 'Buscando…'),
    ai: () => L('AI-generated — verify anything important.', 'AIによる生成です。重要な情報は確認してください。', 'KI-generiert — Wichtiges bitte prüfen.', 'Сгенерировано ИИ — важное проверяйте.', 'Generado por IA: verifica lo importante.'),
    more: () => L('Ask Atlas for more', 'Atlasで詳しく', 'Atlas fragen', 'Спросить Atlas', 'Preguntar a Atlas'),
    close: () => L('Close', '閉じる', 'Schließen', 'Закрыть', 'Cerrar'),
    explain: () => L('Explain', '解説', 'Erklären', 'Пояснить', 'Explicar'),
    retry: () => L('Try again', '再試行', 'Erneut versuchen', 'Повторить', 'Reintentar'),
    tooLong: () => L('That is a passage, not a term — select a word or a phrase.', '長すぎます。語句を選択してください。', 'Das ist ein Abschnitt, kein Begriff — bitte ein Wort oder eine Wendung wählen.', 'Это фрагмент, а не термин — выделите слово или словосочетание.', 'Eso es un pasaje, no un término: selecciona una palabra o frase.'),
    left: (n) => L('{n} lookups left today', '本日の解説は残り{n}回', 'Noch {n} Erklärungen heute', 'Осталось разборов сегодня: {n}', 'Quedan {n} consultas hoy').split('{n}').join(n),
    /* the follow-up that goes to Atlas itself, in the reader's language and about this phrase */
    askMore: (term) => L('Explain "{term}" in more depth.', '「{term}」についてもっと詳しく説明して。', 'Erkläre „{term}“ ausführlicher.', 'Объясни «{term}» подробнее.', 'Explica «{term}» con más detalle.').split('{term}').join(term),
  };

  function shell(inner) {
    return '<div class="atl-gloss-head"><span class="atl-gloss-term" id="atl-gloss-term"></span>'
      + '<button class="atl-gloss-x" title="' + esc(T.close()) + '" aria-label="' + esc(T.close()) + '">×</button></div>'
      + '<div class="atl-gloss-body">' + inner + '</div>';
  }
  function renderLoading(term) {
    const c = ensureCard();
    c.innerHTML = shell('<div class="atl-gloss-load"><span class="ai-spin"></span><span>' + esc(T.thinking()) + '</span></div>');
    c.querySelector('#atl-gloss-term').textContent = term;
    c.querySelector('.atl-gloss-x').onclick = closeCard;
  }
  function renderError(term, msg, onRetry) {
    const c = ensureCard();
    c.innerHTML = shell('<div class="atl-gloss-err">' + esc(msg || '') + '</div>'
      + '<div style="padding-bottom:10px;"><button class="atl-gloss-retry">' + esc(T.retry()) + '</button></div>');
    c.querySelector('#atl-gloss-term').textContent = term;
    c.querySelector('.atl-gloss-x').onclick = closeCard;
    const rb = c.querySelector('.atl-gloss-retry'); if (rb && onRetry) rb.onclick = onRetry;
    place();
  }
  function renderCard(term, g, bub) {
    const c = ensureCard();
    const sec = (cls, label, text) => (text ? '<div class="atl-gloss-sec ' + cls + '"><span class="atl-gloss-lbl">' + esc(label) + '</span><p class="atl-gloss-txt">' + esc(text) + '</p></div>' : '');
    const also = (g.also || []).filter((x) => x && String(x).trim()).slice(0, 4);
    const alsoHtml = also.length
      ? '<div class="atl-gloss-sec"><span class="atl-gloss-lbl">' + esc(T.also()) + '</span><div class="atl-gloss-also">'
        + also.map((x) => '<button data-term="' + esc(String(x)) + '">' + esc(String(x)) + '</button>').join('') + '</div></div>'
      : '';
    /* ⚠ THE COUNT COMES BACK WITH THE ANSWER, not from a second question to a second mirror. It is
       the gloss lane's own number (js/ai-core.js), and it is shown only when it is running out. */
    let leftNote = '';
    try { const n = (g && g.__left); if (typeof n === 'number' && isFinite(n) && n <= 10) leftNote = ' · ' + T.left(n); } catch (_) { /* not answered yet */ }
    c.innerHTML = shell(
      sec('', T.meaning(), g.sense)
      + sec('here', T.here(), g.inContext)
      + sec('', T.background(), g.background)
      + alsoHtml
    ) + '<div class="atl-gloss-foot"><span class="atl-gloss-note">' + esc(T.ai() + leftNote) + '</span>'
      + '<button class="atl-gloss-more">' + esc(T.more()) + '</button></div>';
    const termEl = c.querySelector('#atl-gloss-term');
    termEl.textContent = g.term || term;
    if (g.kind) { const k = document.createElement('span'); k.className = 'atl-gloss-kind'; k.textContent = g.kind; termEl.appendChild(k); }
    c.querySelector('.atl-gloss-x').onclick = closeCard;
    /* a related term is glossed in the SAME passage — that is what makes the chip worth a tap */
    c.querySelectorAll('.atl-gloss-also button').forEach((b) => { b.onclick = () => { open(b.getAttribute('data-term') || '', bub); }; });
    const mb = c.querySelector('.atl-gloss-more');
    if (mb) mb.onclick = () => { const q = T.askMore(g.term || term); closeCard(); try { CTX.ask(q); } catch (_) { /* the panel is gone */ } };
    place();
  }

  /* ── opening one ──────────────────────────────────────────────────────────────────────────── */
  /**
   * open(term, bubble) — show the card for `term`, explained inside `bubble`'s answer.
   * `bubble` may be null (Atlas asked for the gloss itself); then the LAST answer is the passage.
   */
  async function open(rawTerm, bubble) {
    const term = tidy(rawTerm);
    if (term.length < MIN_LEN) return;
    wireGlobalClosers();
    const c = ensureCard();
    c.style.display = 'flex';
    requestAnimationFrame(() => { try { c.classList.add('in'); } catch (_) { /* removed */ } });
    if (term.length > MAX_LEN) { renderError(term.slice(0, 60) + '…', T.tooLong(), null); return; }

    let bub = bubble;
    if (!bub) { try { const chat = CTX.chat(); const all = chat ? chat.querySelectorAll('.atl-b.a') : []; bub = all.length ? all[all.length - 1] : null; } catch (_) { bub = null; } }
    const answer = bub ? tidy(bub.textContent) : '';
    const key = cacheKey(bub, term);
    const hit = cacheGet(key);
    if (hit) { renderCard(term, hit, bub); return; }

    renderLoading(term);
    place();
    const mine = ++reqSeq;
    const run = () => open(rawTerm, bubble);
    try {
      const out = await HOST.askAIGloss(
        userPrompt(term, sentenceAround(answer, term), passageAround(answer, term), questionFor(bub)),
        systemPrompt()
      );
      if (mine !== reqSeq) return;   /* a later lookup superseded this one */
      const g = out && out.data;
      if (!g || (!g.sense && !g.inContext)) { renderError(term, L('The lookup came back empty.', '解説を取得できませんでした。', 'Die Erklärung kam leer zurück.', 'Разбор вернулся пустым.', 'La consulta volvió vacía.'), run); return; }
      try { if (typeof out.left === 'number') g.__left = out.left; } catch (_) { /* frozen */ }
      cachePut(key, g);
      renderCard(term, g, bub);
    } catch (e) {
      if (mine !== reqSeq) return;
      renderError(term, (e && e.message) || 'AI error', run);
    }
  }

  /* ── the touch affordance ─────────────────────────────────────────────────────────────────── */
  function hidePill() { if (pill) pill.style.display = 'none'; }
  function showPill(rect, term, bub) {
    if (!pill) {
      pill = document.createElement('button');
      pill.className = 'atl-gloss-pill';
      pill.type = 'button';
      document.body.appendChild(pill);
    }
    pill.textContent = T.explain();
    pill.style.display = 'inline-flex';
    const vw = window.innerWidth || 375, PAD = 8;
    const w = pill.offsetWidth || 86, h = pill.offsetHeight || 30;
    let top = rect.top - h - 10; if (top < PAD) top = rect.bottom + 10;
    let left = rect.left + (rect.width / 2) - (w / 2);
    left = Math.max(PAD, Math.min(left, vw - PAD - w));
    pill.style.top = Math.round(top) + 'px';
    pill.style.left = Math.round(left) + 'px';
    pill.onclick = (e) => { e.preventDefault(); e.stopPropagation(); hidePill(); open(term, bub); };
  }

  /* ── wiring ───────────────────────────────────────────────────────────────────────────────── */
  /** wire(panel) — one delegated listener per gesture, on the panel, for every message in it. */
  function wire(panel) {
    if (!panel || panel.__glossWired) return; panel.__glossWired = true;

    /* ⚠ THE RIGHT-CLICK IS TAKEN ONLY WHEN THERE IS A SELECTION INSIDE AN ANSWER. Right-clicking
       the panel anywhere else — a link, the composer, the reader's own message, an answer with
       nothing selected — must still open the browser's own menu, which is where Copy lives. */
    panel.addEventListener('contextmenu', (e) => {
      let sel = null; try { sel = window.getSelection(); } catch (_) { return; }
      const bub = answerBubbleOf(sel);
      if (!bub) return;
      const term = tidy(sel.toString());
      if (term.length < MIN_LEN) return;
      let r = null; try { r = sel.getRangeAt(0); } catch (_) { return; }
      /* the click has to be ON the selection, not merely in the same bubble */
      if (!bub.contains(e.target)) return;
      e.preventDefault();
      try { anchorRange = r.cloneRange(); anchorRect = anchorRange.getBoundingClientRect(); } catch (_) { anchorRange = null; anchorRect = { left: e.clientX, top: e.clientY, right: e.clientX, bottom: e.clientY, width: 0, height: 0 }; }
      open(term, bub);
    });

    /* Touch: there is no right-click, and a long-press raises the platform's own selection UI. The
       pill sits above the selection so the gesture is «long-press, then tap 解説» — one extra tap,
       and no fight with the callout the OS is already showing. */
    let selTimer = 0;
    document.addEventListener('selectionchange', () => {
      if (!isTouch()) return;
      clearTimeout(selTimer);
      selTimer = setTimeout(() => {
        let sel = null; try { sel = window.getSelection(); } catch (_) { hidePill(); return; }
        const bub = answerBubbleOf(sel);
        const term = bub ? tidy(sel.toString()) : '';
        if (!bub || term.length < MIN_LEN || term.length > MAX_LEN) { hidePill(); return; }
        let rect = null;
        try { const r = sel.getRangeAt(0); anchorRange = r.cloneRange(); rect = anchorRange.getBoundingClientRect(); anchorRect = rect; } catch (_) { hidePill(); return; }
        if (!rect || (!rect.width && !rect.height)) { hidePill(); return; }
        showPill(rect, term, bub);
      }, 240);   /* one settle, not one per character the drag crosses */
    });
  }
  function isTouch() { try { return window.matchMedia('(hover:none)').matches || navigator.maxTouchPoints > 0; } catch (_) { return false; } }

  /* ══ THE ATLAS ACTION ═════════════════════════════════════════════════════════════════════
     `{"type":"gloss","term":str}` — the SAME card the reader raises by right-clicking a phrase, so
     no capability is reachable only through a gesture (CONSTITUTION.md / Atlas is the control plane).
     ⚠ THE WHOLE BODY IS HERE AND NOT IN THE SWITCH. js/atlas-console.js is at its shrink-only
     ceiling (tests/r318 ⑨b, tests/r419 ⑨d), so the case line is one line and this is what it calls.
     The result helpers arrive through CTX because they are the kernel's, not this file's. */
  function dispatch(a) {
    const R = CTX.R, note = CTX.note, warn = CTX.warn;
    const term = glossTidy((a && (a.term || a.text || a.query)) || '');
    if (!term) return R(false, warn('⚠ ' + L('Name the phrase to explain.', '解説する語句を指定してください。', 'Bitte den zu erklärenden Ausdruck nennen.', 'Укажите, какое выражение пояснить.', 'Indica la expresión que hay que explicar.')));
    try { open(term, null); } catch (_) {
      return R(false, warn('⚠ ' + L('The glossary card could not open.', '解説カードを開けませんでした。', 'Die Erklärungskarte konnte nicht geöffnet werden.', 'Не удалось открыть карточку разбора.', 'No se pudo abrir la tarjeta de explicación.')));
    }
    return R(true, note('✓ ' + esc(term) + ' — ' + L('opened the term card', '用語カードを開きました', 'Begriffskarte geöffnet', 'карточка термина открыта', 'tarjeta del término abierta')));
  }

  /* `text` is the three pure functions this file decides context with — returned so the gate can
     drive the SHIPPED ones (tests/r491-checks ①–③) rather than a copy of them. */
  return { wire, open, dispatch, close: closeCard, text: { tidy: glossTidy, sentence: glossSentence, passage: glossPassage }, _cacheSize: () => CACHE.size };
}
