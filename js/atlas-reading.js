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
 *  ⚠ IT SENDS NOTHING. The starters are a starter; the composer below stays free (the reader's own
 *  instruction: 「1に。自由送信もできるように、」). The last thing `arrive()` does is focus the
 *  composer, not submit it.
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
     focus  put the caret in the composer
     open   open the console
     pin    remember a point as «here» so 「ここ」/「現地」 resolve to the story's place
     reset  clear the last typed message (a button entry has none — #R64) */
export const makeAtlasReading = (HOST, D) => {
  const { L, esc, bubble, run, ensure, focus, open, pin, reset } = D;

  /* The arrival bubble: a head that names the subject, one line saying what Atlas is holding, and
     up to three starters. ⚠ The chip markup exists ONCE — tests/r776 ③ measures that, because a
     second copy is how the two «Ask Atlas» buttons came to disagree in the first place. */
  function arrive(headHtml, note, qs) {
    const p = ensure();
    try { const exw = p.querySelector('.atl-ex'); if (exw) exw.style.display = 'none'; const subw = p.querySelector('.atl-sub'); if (subw) subw.style.display = 'none'; } catch (_) { }   /* (#R103) drop the intro sub-text once a conversation starts (don't stick it to the top) */
    const chips = (qs || []).filter(Boolean).map((e) => '<button class="atl-here-q" style="display:block;width:100%;text-align:left;margin:3px 0;padding:7px 10px;font-size:11.5px;border-radius:9px;border:1px solid var(--glass-border,rgba(128,128,128,0.28));background:var(--input-bg);color:var(--text-main);cursor:pointer;">' + esc(e) + '</button>').join('');
    const b = bubble('a', headHtml
      + '<div style="font-size:12px;color:var(--text-muted);margin-bottom:6px;line-height:1.5;">' + esc(note) + '</div>' + chips);
    /* ⚠ the chips are a STARTER, not the only way out: the composer below stays free, which is why
       this focuses it instead of sending anything. Nothing is asked until the reader asks it. */
    try { b.querySelectorAll('.atl-here-q').forEach((btn) => { btn.onclick = () => run(btn.textContent.trim()); }); } catch (_) { }
    setTimeout(() => { try { focus(); } catch (_) { } }, 80);
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

  /* The reading surface's entry. ⚠ It opens FIRST and returns false only when nothing is being
     read, so the caller needs no second plan for that case — a press with no open article lands
     exactly where it used to. */
  function askReading() {
    try { open(); } catch (_) { }
    let rd = null; try { rd = window._imReader; } catch (_) { }
    if (!rd || !rd.open || !rd.title) return false;
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

  return { arrive, askReading, readingStarters };
};
