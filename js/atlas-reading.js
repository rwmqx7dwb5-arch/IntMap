/* ============================================================================
 *  IntMap · Atlas — ARRIVING ON A SUBJECT                                   (#R776)
 * ----------------------------------------------------------------------------
 *  「News の details から Ask Atlas を押しても、単にタブが切り替わるだけなのは不親切だと
 *    思いませんか？」
 *
 *  Two buttons in IntMap say «Ask Atlas». The map's right-click one (askHere) has, since #R392,
 *  opened onto a bubble that NAMES what the reader pointed at and offers starters measured around
 *  it. The reading surface's one — the bar js/article-reader.js `readerBar()` builds once and both
 *  the article reader and the Event detail wear — called `open()` and nothing else. Pressing it
 *  switched the tab: the console opened on its generic intro, and a reader with a headline in front
 *  of them had to type that headline back in before Atlas could be asked anything.
 *
 *  ⚠⚠⚠ THE SUBJECT WAS NEVER MISSING. `window._imReader` has carried it since #R430 and the
 *  kernel's `_selectionState()` reads it, so Atlas could already answer 「この記事の背景は？」.
 *  What was missing was any sign, at the moment of arrival, that it could. The defect was not a
 *  gap in what Atlas knew; it was a record with no reader.
 *
 *  ⚠⚠ AND THAT IS WHY THE ARRIVAL LIVES HERE RATHER THAN INSIDE EITHER BUTTON. The two entries
 *  drifted apart because «arrive naming the subject» was written inside askHere. `arrive()` is the
 *  one builder now and the kernel's askHere calls it, so the next surface that wants an arrival
 *  calls it too instead of copying one of them.
 *
 *  ⚠ IT SENDS NOTHING. The starters are a starter; asking freely stays open (the reader's own
 *  instruction: 「1に。自由送信もできるように、」). The last thing `arrive()` does is focus a field,
 *  not submit it.
 *  ⚠ (#R783) …AND THAT FIELD IS NOW IN THE ARRIVAL. #R776 met 「自由送信もできるように」 by focusing
 *  the panel's composer at the far end of the pane, and the reader read the three chips as the whole
 *  of what they were allowed to ask (「選択肢に自由入力欄がない」). See `arrive()`.
 *  ⚠⚠⚠ (#R783) AND «THE SUBJECT WAS NEVER MISSING» ABOVE IS WRONG, MEASURED. The headline arrived;
 *  the news did not. The bridge's only live writer fills `body` from an event's synthesis and gist,
 *  which 43.5% of production events do not have — so 「Atlas はニュースの内容を見ていない」 was a
 *  correct reading of the prompt. `askReading` reads the surface itself now (`surfaceText` below).
 *
 *  ⚠ ITS OWN FILE FOR THE REASON js/atlas-gloss.js AND js/atlas-msg-tools.js ARE: js/atlas-console.js
 *  is under a shrink-only line ceiling (tests/r318 ⑨b — under 4,908, and it was sitting ONE line
 *  below it), and the rule beside that ceiling is that «a feature moves out, never that the ceiling
 *  moves up». Measured: writing this inside the kernel put it at 4,964 and five checks went red.
 * ==========================================================================*/

/* HOST is the app-body host object (only `lang` matters here, and only through the picker the
   kernel already owns). `D` is what this module cannot do for itself and must be handed:
     L      the 5-argument language picker (the other four languages come from js/locales/)
     esc    the kernel's escaper — every value below is upstream text
     bubble append a chat bubble and return the element
     run    put a question through the normal turn (what a starter chip means)
     ensure the console pane (for the intro block this arrival retires)
     focus  put the caret in the panel's composer (the fallback for #R783's field in the arrival)
     open   open the console
     pin    remember a point as «here» so 「ここ」/「現地」 resolve to the story's place
     reset  clear the last typed message (a button entry has none — #R64) */
export const makeAtlasReading = (HOST, D) => {
  const { L, esc, bubble, run, ensure, focus, open, pin, reset } = D;

  /* The arrival bubble: a head that names the subject, one line saying what Atlas is holding, up to
     three starters, and a field to ask in the reader's own words. ⚠ The chip markup exists ONCE —
     tests/r776 ③ measures that, because a second copy is how the two «Ask Atlas» buttons came to
     disagree in the first place.

     ⚠⚠⚠ (#R783) TWO THINGS THE ARRIVAL OWED THE READER AND DID NOT PAY.
       ⑴ 「選択肢に自由入力欄がない」. #R776 decided — correctly — that the arrival SENDS NOTHING and
         that the composer below stays free, and then expressed that decision as a `focus()` call on a
         composer that is at the far end of the panel, behind the arrival bubble the reader is looking
         at. A caret somewhere off the subject is not the same offer as a field IN it, and the reader
         read the three chips as the whole of what they were allowed to ask. The field is here now,
         inside the group it belongs to, and it is what gets focused — the #R776 rule is unchanged
         (nothing is sent until the reader sends it; the chips are still a starter, not a menu).
       ⑵ 「どれかの選択肢を押しても、選択肢が消えない」. Pressing a chip put the question into the
         conversation and left the chips sitting above the answer, so the arrival stayed offered after
         it had been taken — three stale buttons over a running turn. ⚠ THE RULE IS ABOUT THE ARRIVAL
         BEING USED, NOT ABOUT WHICH CONTROL WAS TOUCHED: typing a question retires the starters too
         (the reader has said what they want in their own words; offering them three guesses at it
         underneath is the same staleness). The head and the note stay — they are the RECORD of what
         Atlas is holding, not an offer, and the reader still needs to see which article this is. */
  function arrive(headHtml, note, qs) {
    const p = ensure();
    try { const exw = p.querySelector('.atl-ex'); if (exw) exw.style.display = 'none'; const subw = p.querySelector('.atl-sub'); if (subw) subw.style.display = 'none'; } catch (_) { }   /* (#R103) drop the intro sub-text once a conversation starts (don't stick it to the top) */
    const chips = (qs || []).filter(Boolean).map((e) => '<button class="atl-here-q" style="display:block;width:100%;text-align:left;margin:3px 0;padding:7px 10px;font-size:11.5px;border-radius:9px;border:1px solid var(--glass-border,rgba(128,128,128,0.28));background:var(--input-bg);color:var(--text-main);cursor:pointer;">' + esc(e) + '</button>').join('');
    /* ⚠ the send glyph is the composer's own up-arrow (#R149: 「白背景黒文字に。plain textの→はやめて」),
       and `Send` is the string the composer's button already carries in all nine languages. */
    const askRow = '<div class="atl-arrive-ask" style="display:flex;gap:6px;margin-top:6px;">'
      + '<input class="atl-arrive-in" type="text" placeholder="' + esc(L('or ask in your own words…', 'または自分の言葉で聞く…', 'oder in eigenen Worten fragen…', 'или спросите своими словами…', 'o pregunta con tus propias palabras…'))
      + '" style="flex:1 1 auto;min-width:0;height:32px;padding:0 11px;box-sizing:border-box;font-size:11.5px;border-radius:9px;border:1px solid var(--glass-border,rgba(128,128,128,0.28));background:var(--input-bg);color:var(--text-main);outline:none;">'
      + '<button class="atl-arrive-send" type="button" title="' + esc(L('Send', '送信', 'Senden', 'Отправить', 'Enviar'))
      + '" style="flex:0 0 auto;width:32px;height:32px;border-radius:50%;border:1px solid rgba(0,0,0,0.08);background:#fff;color:#111;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="M5.5 11.5 12 5l6.5 6.5"/></svg></button></div>';
    const b = bubble('a', headHtml
      + '<div style="font-size:12px;color:var(--text-muted);margin-bottom:6px;line-height:1.5;">' + esc(note) + '</div>'
      + '<div class="atl-arrive-qs">' + chips + askRow + '</div>');
    /* Asking retires the offer — one path for both controls, so a chip and a typed question cannot
       come to behave differently (which is exactly how the two «Ask Atlas» buttons drifted). An empty
       field is not a question: nothing is sent and nothing is retired. */
    const grp = b.querySelector('.atl-arrive-qs');
    const inp = b.querySelector('.atl-arrive-in');
    const ask = (q) => {
      const t = String(q || '').trim(); if (!t) return;
      try { if (grp && grp.parentNode) grp.parentNode.removeChild(grp); } catch (_) { }
      run(t);
    };
    try { b.querySelectorAll('.atl-here-q').forEach((btn) => { btn.onclick = () => ask(btn.textContent.trim()); }); } catch (_) { }
    try { const sb = b.querySelector('.atl-arrive-send'); if (sb) sb.onclick = () => ask(inp && inp.value); } catch (_) { }
    try { if (inp) inp.onkeydown = (e) => { if (e && (e.key === 'Enter' || e.keyCode === 13) && !e.shiftKey) { try { e.preventDefault(); } catch (_) { } ask(inp.value); } }; } catch (_) { }
    /* ⚠ the field IN the arrival is what the caret goes to; `focus` (the panel's composer) is the
       fallback for a caller whose bubble could not be built. Still nothing sent (#R776). */
    setTimeout(() => { try { if (inp) inp.focus(); else focus(); } catch (_) { } }, 80);
    return b;
  }

  /* ⚠⚠⚠ THE STARTERS ARE DERIVED, NOT A FIXED TRIO. #R392 took fixed sentences out of askHere for
     the same reason: what this item HAS (a place, a cluster of sources, a body) is what it can
     usefully be asked about, and an item that has none of them must not be offered a question about
     one. ⚠ The substitution runs on the PICKED string, so it lands in whichever language the reader
     is in — doing it to the English argument alone would leave 「{p} を地図で見せて」 on screen for
     eight of the nine (tests/r776 ②). */
  function readingStarters(rd) {
    const ev = rd.kind === 'event', place = String(rd.place || '').trim().slice(0, 60), out = [];
    out.push(ev ? L('Explain the background of this event', 'この出来事の背景を説明して', 'Erkläre den Hintergrund dieses Ereignisses', 'Объясни предысторию этого события', 'Explica el trasfondo de este suceso')
      : L('Explain the background of this article', 'この記事の背景を説明して', 'Erkläre den Hintergrund dieses Artikels', 'Объясни предысторию этой статьи', 'Explica el trasfondo de este artículo'));
    if (place) out.push(String(L('Show {p} on the map', '{p} を地図で見せて', 'Zeige {p} auf der Karte', 'Покажи {p} на карте', 'Muestra {p} en el mapa')).replace('{p}', place));
    else out.push(L('Which places does this involve? Put them on the map', 'この話に出てくる場所を地図に出して', 'Welche Orte betrifft das? Zeige sie auf der Karte', 'Каких мест это касается? Покажи их на карте', '¿Qué lugares implica esto? Ponlos en el mapa'));
    if (rd.body) out.push(ev ? L('What do the sources actually agree on?', '出典が実際に一致しているのはどこ？', 'Worin stimmen die Quellen tatsächlich überein?', 'В чём источники действительно сходятся?', '¿En qué coinciden realmente las fuentes?')
      : L('What does this article not say?', 'この記事が書いていないことは？', 'Was sagt dieser Artikel nicht?', 'О чём эта статья умалчивает?', '¿Qué no dice este artículo?'));
    else if (place) out.push(String(L('What else is happening around {p}?', '{p} の周辺で他に何が起きている？', 'Was passiert sonst rund um {p}?', 'Что ещё происходит вокруг {p}?', '¿Qué más ocurre alrededor de {p}?')).replace('{p}', place));
    return out.slice(0, 3);
  }

  /* ⚠⚠⚠ (#R783) WHAT IS ACTUALLY IN FRONT OF THE READER, READ OFF THE SURFACE THAT IS SHOWING IT.
     「Atlas はニュースの内容を見ていない。意味がない。」 — and measured, that was literally true. The
     bridge `window._imReader` has a `body`, `_selectionState()` copies it and js/atlas-state.js
     renders it as [ARTICLE BODY], but the only live writer of the bridge is js/news-events.js
     `openDetail()`, which fills `body` from `synthesis.lines` + `brief.gist` ALONE. That same file
     records the measurement (2026-08-24, 400 production events): two or more gist sentences exist for
     15.0% of events, one for 37.8%, and **43.5% have no article text at all**. So for most events the
     prompt carried ONE LINE — the headline — while the detail pane in front of the reader showed the
     coverage headlines of every outlet, the key figures, what the latest report changed and where the
     outlets disagree. None of it was sent. The reader was not wrong: Atlas had not seen the event.
     ⚠ THE FIX IS NOT A LONGER LIST OF FIELDS TO COPY. A bridge whose completeness depends on each
       writer remembering another key is the shape this repository keeps paying for (memory:
       object-built-twice, carried-but-never-read). The subject of this button is «what I am reading»,
       and the only thing that knows all of that is the surface DISPLAYING it — so that is who gets
       asked, once, at the moment of the press, and whatever any writer put in `body` stands when the
       surface has less to say (an embedded page, whose text is the publisher's frame and not the
       article, or an article carried over from a surface that is already gone).
     ⚠ THE SURFACE IS IDENTIFIED BY THE BAR IT WEARS, not by an element id. `readerBar()`
       (js/article-reader.js) is the one builder of a reading surface's chrome and the «Ask Atlas»
       button pressed to get here is IN it, so its parent is the surface by construction — the next
       reading surface is read the same way without being named here. The bar's own text (‹ back,
       Reader⇄Web, the outlet chip, «Ask Atlas») is chrome, so the walk skips it. */
  const BLOCK = /^(DIV|P|H1|H2|H3|H4|H5|H6|LI|UL|OL|SECTION|ARTICLE|ASIDE|DETAILS|SUMMARY|BLOCKQUOTE|FIGURE|FIGCAPTION|BR|TR|HR|A)$/;
  function surfaceText(root) {
    const out = [];
    const walk = (n) => {
      if (!n) return;
      if (n.nodeType === 3) { const t = String(n.nodeValue || '').replace(/\s+/g, ' '); if (t.trim()) out.push(t); return; }
      if (n.nodeType !== 1) return;
      const tag = String(n.tagName || '').toUpperCase();
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'IFRAME' || tag === 'BUTTON') return;   /* ⚠ BUTTON: a control is an offer to act, never a statement about the subject */
      try { if (n.classList && n.classList.contains('nrp-bar')) return; } catch (_) { }
      const kids = n.childNodes || [];
      for (let i = 0; i < kids.length; i++) walk(kids[i]);
      if (BLOCK.test(tag)) out.push('\n');
    };
    walk(root);
    return out.join('').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  /* The surface as it stands RIGHT NOW. ⚠ Called before `open()`: entering Atlas leaves the reading
     surface (js/app-body.js `closeReaderPane`, which empties the pane), so a read taken afterwards
     measures an empty div — the one ordering fact this function depends on. */
  function readingText() {
    try {
      const bar = document.querySelector('.nrp-bar');
      const root = bar && bar.parentNode;
      return root ? surfaceText(root) : '';
    } catch (_) { return ''; }
  }

  /* The reading surface's entry. ⚠ It opens FIRST and returns false only when nothing is being
     read, so the caller needs no second plan for that case — a press with no open article lands
     exactly where it used to. */
  function askReading() {
    const shown = readingText();   /* ⚠ BEFORE open() — see readingText() */
    try { open(); } catch (_) { }
    let rd = null; try { rd = window._imReader; } catch (_) { }
    if (!rd || !rd.open || !rd.title) return false;
    /* ⚠ written back onto the bridge, because the bridge has ONE reader (`_selectionState()`) and a
       second channel to the same prompt would be a second answer to «what is being read». The clip
       is the 6,000 the bridge's own writers use; the prompt's own bound is js/atlas-state.js. */
    try { if (shown.length > String(rd.body || '').length) rd.body = shown.slice(0, 6000); } catch (_) { }
    reset();   /* (#R64) button entry has no typed message → the mirror falls back to the UI language */
    const title = String(rd.title).slice(0, 160);
    const place = String(rd.place || '').trim().slice(0, 60);
    /* ⚠ pin the article's own point so 「ここ」/「現地」 in the follow-ups resolve to the story's
       place and not to whatever the camera happened to be over. NO flyTo: the reader is still
       reading, and moving the map under them is not what this button was pressed for. */
    try { if (rd.loc && isFinite(rd.loc[0])) pin(+rd.loc[0], +rd.loc[1], place); } catch (_) { }
    const meta = [String(rd.publisher || '').slice(0, 60), (rd.pubDate ? String(rd.pubDate).slice(0, 10) : ''), place].filter(Boolean).join(' · ');
    const head = '<div class="atl-read-hd" style="font-weight:600;margin-bottom:3px;line-height:1.4;">' + esc(title) + '</div>'
      + (meta ? ('<div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">' + esc(meta) + '</div>') : '');
    arrive(head, (rd.kind === 'event')
      ? L('I have this event open — ask me anything about it.', 'いまこの出来事を把握しています。何でも聞いてください。', 'Ich habe dieses Ereignis offen — fragen Sie mich alles dazu.', 'Это событие сейчас передо мной — спрашивайте что угодно.', 'Tengo este suceso abierto — pregúntame lo que quieras.')
      : L('I have this article open — ask me anything about it.', 'いまこの記事を把握しています。何でも聞いてください。', 'Ich habe diesen Artikel offen — fragen Sie mich alles dazu.', 'Эта статья сейчас передо мной — спрашивайте что угодно.', 'Tengo este artículo abierto — pregúntame lo que quieras.'),
      readingStarters(rd));
    return true;
  }

  return { arrive, askReading, readingStarters };   /* ⚠ (#R175 ③) nothing is exported for a test's sake — `surfaceText` is reached by the checks the way `readingStarters` is: extracted from this source and RUN (#R505) */
};
