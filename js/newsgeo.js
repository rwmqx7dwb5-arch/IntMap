/* ============================================================================
 *  IntMap · NewsGeo  —  deterministic (NON-AI) news location analyser  (#R161)
 * ----------------------------------------------------------------------------
 *  ONE shared engine for the browser (index.html) and the server
 *  (supabase/functions/refresh-news via the mirrored copy in _shared/). No
 *  network, no AI, no randomness: the same headline always yields the same
 *  place, so the result is testable and auditable.
 *
 *  Why it exists
 *  -------------
 *  The previous locator ran ~2 000 regexes over every headline and kept the
 *  best-scoring hit. That is a BAG-OF-WORDS matcher: it cannot tell
 *    · "Tripoli" (Libya) from "Tripoli" (Lebanon),
 *    · "Paris Hilton" / "New York Times" / "Bank of America" from a place,
 *    · "Blinken in Washington warns over Gaza" (subject = Gaza, not Washington),
 *    · "Kharkiv, Ukraine" (subject = Kharkiv — Ukraine must NOT split the vote).
 *  Those four failure classes are the bulk of real-world mis-pins, and none of
 *  them is fixable by adding more dictionary rows.
 *
 *  What this engine adds on top of matching
 *  ----------------------------------------
 *   1. LONGEST-MATCH span consumption over a hashed n-gram index (Latin/Cyrillic
 *      token n-grams + a CJK character scanner) — so a longer name always wins
 *      the span and TRAP entries ("New York Times") can swallow a place name.
 *   2. AMBIGUITY RESOLUTION — a surface may map to many real places; the winner
 *      is chosen from country/admin-1 cues in the same text, geographic
 *      proximity to unambiguous anchors, and a prominence prior.
 *   3. HIERARCHY ABSORPTION — when a city and its own country/state are both
 *      named, the city is boosted and the parent is suppressed instead of
 *      competing with its own child.
 *   4. DATELINE / SPEAKER SUPPRESSION — a place next to a speech verb
 *      ("Washington said…", 「ワシントンで表明」) is where somebody TALKED, not
 *      where the event happened; it is docked whenever another place exists.
 *   5. EVENT AFFINITY — a place next to an event noun ("strike", "earthquake",
 *      「地震」) is much more likely to be the subject.
 *   6. TRAPS — organisations, sports clubs, companies, treaties and person
 *      names that merely CONTAIN a place name, resolved explicitly instead of
 *      being mis-pinned.
 *   7. CONFIDENCE — every answer carries a 0‥1 score plus the reasons, so the
 *      caller can fall back instead of pinning a guess.
 *
 *  Data tables live at the bottom of this file (countries / places / admin-1 /
 *  traps). They are packed pipe-delimited strings to keep the file small.
 *
 *  Public API (globalThis.IntMapNewsGeo)
 *    locate(title, {desc, publisher, lang})  → result | null
 *    analyze(title, {…})                     → {result, mentions, scores}
 *    register(rows)                          → merge extra places (geo_pins)
 *    stats()                                 → index sizes
 *  result = { lng, lat, name:{en,jp}, kind, iso2, confidence, surface, why[] }
 * ==========================================================================*/
(function () {
  'use strict';

  var VERSION = 'r161.1';

  /* ------------------------------------------------------------------ *
   *  0.  Text helpers
   * ------------------------------------------------------------------ */
  var CJK_RE = /[぀-ヿ㐀-鿿豈-﫿ｦ-ﾟ]/;
  var CYR_RE = /[Ѐ-ԯ]/;
  var DIA_RE = /[̀-ͯ]/g;

  /* ══ (#R208) KATAKANA IS WRITTEN AS AN UNBROKEN RUN, AND THAT IS A WORD BOUNDARY ═══════════════
     The CJK scanner below matches any indexed surface of two or more characters at any position,
     because Japanese has no spaces. For kanji that is right — 東京 inside 東京都 is the same place.
     For KATAKANA it is not: a katakana run is one borrowed word, so a place name that begins in the
     MIDDLE of one is a coincidence of syllables and never a mention. MEASURED against the bundled
     15,048-row world gazetteer, five of nineteen ordinary Japanese headlines pinned a real city:

         ハンディファン → ディファ (Diffa, Niger)      ワクチン接種 → クチン (Kuching)
         マイナンバーカード → バー (Barh)              ドライブレコーダー → コーダ (Khordha)
         プラスチックごみ → ラス (Rath)

     ⚠ U+30FB (・) IS IN THE KATAKANA BLOCK AND IS NOT PART OF A WORD — it is the separator in
     「ロシア・モスクワ」, so counting it as katakana would reject the very form Japanese uses to
     write "Moscow, Russia". U+30FC (ー) IS part of one (ニューヨーク), so it must count.
     ⚠ AND THE GUARD IS LEFT-ONLY. A match that ends early inside a run is sometimes right
     (パリオリンピック = the Paris Olympics) and sometimes wrong (ニューヨークタイムズ); which of the
     two it is, is what the TRAP table decides, and it decides it for the Latin spelling already. A
     match that STARTS inside a run is wrong every time, which is why this side can be a rule
     rather than a list. */
  var KATA_RE = /[ァ-ヺー-ヿㇰ-ㇿ]/;   /* deliberately excludes ・ U+30FB */

  function hasCJK(s) { return CJK_RE.test(s); }
  function isKata(ch) { return !!ch && KATA_RE.test(ch); }
  function hasCyr(s) { return CYR_RE.test(s); }
  function stripDia(s) { try { return s.normalize('NFD').replace(DIA_RE, ''); } catch (_) { return s; } }

  /* Normalise ONE surface token/term for index lookup. CJK is left alone
     (NFD would split dakuten: ガ → カ+゛ and break every Japanese key). */
  function normTerm(t) {
    var s = String(t || '');
    s = s.replace(/[’']s(?=$|[^A-Za-z])/g, '');   // possessive: Ukraine's → Ukraine
    s = s.replace(/[.·’']/g, '');            // U.S. → US ; Sana'a → Sanaa
    s = s.replace(/[‐-―−]/g, '-');      // unicode dashes → ASCII
    s = s.replace(/[-()（）\[\],]/g, ' ');               // hyphen/brackets == space (Nagorno-Karabakh)
    s = s.replace(/\s+/g, ' ').trim().toLowerCase();
    if (!hasCJK(s)) s = stripDia(s);
    return s;
  }

  /* NFKC so full-width Latin/digits and half-width katakana fold to one form. */
  function prep(s) {
    var t = String(s == null ? '' : s);
    try { t = t.normalize('NFKC'); } catch (_) { }
    return t.replace(/[ 　]/g, ' ');
  }

  /* Latin/Cyrillic/Greek word tokens. CJK is deliberately EXCLUDED here — it is
     handled by the character scanner, because it has no spaces. */
  var TOK_RE = /[0-9A-Za-zÀ-ɏͰ-ϿЀ-ԯ][0-9A-Za-zÀ-ɏͰ-ϿЀ-ԯ'’.‐-―-]*/g;

  function tokenize(text) {
    var out = [], m; TOK_RE.lastIndex = 0;
    while ((m = TOK_RE.exec(text))) {
      var raw = m[0], at = m.index;
      /* trailing punctuation is not part of the word ("Washington." / "U.S.") */
      var trimmed = raw.replace(/[.‐-―-]+$/, '');
      if (!trimmed) continue;
      /* split hyphenated compounds so "Guinea-Bissau" also yields "guinea","bissau" */
      var parts = trimmed.split(/[‐-―-]/), off = 0;
      for (var p = 0; p < parts.length; p++) {
        var piece = parts[p];
        if (piece) {
          out.push({ o: piece, n: normTerm(piece), at: at + off, end: at + off + piece.length,
                     caps: /^[A-ZÀ-ÞЀ-Я]/.test(piece) });
        }
        off += piece.length + 1;
      }
    }
    return out;
  }

  function haversine(a, b) {
    var R = 6371, r = Math.PI / 180;
    var dLa = (b[1] - a[1]) * r, dLo = (b[0] - a[0]) * r;
    var s = Math.sin(dLa / 2) * Math.sin(dLa / 2) +
      Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLo / 2) * Math.sin(dLo / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
  }

  /* ------------------------------------------------------------------ *
   *  1.  Lexicons — the linguistic signals the scorer reads
   * ------------------------------------------------------------------ */
  /* "in Gaza" / "ガザで" / "в Киеве" → the place is the SETTING of the story. */
  var PREP_LATIN = /(?:^|[\s("«„'])(?:in|at|to|from|near|into|inside|outside|across|over|around|toward|towards|off|via|en|a|de|desde|hacia|im|bei|nach|aus|von|an|auf|zu|w|na|do)\s+$/i;
  var PREP_CYR = /(?:^|[\s("«„'])(?:в|во|на|из|под|у|около|близ|через|до|к|по)\s+$/i;
  var PREP_JA = /^(?:で|では|でも|に|には|へ|を|から|まで|の|・)/;

  /* Somebody TALKED here — the dateline trap. Three distinct patterns:
       SPEAKER — the place is the SUBJECT of a speech verb ("Moscow said…")
       VENUE   — the place hosts a meeting ("summit in Brussels…")
       TOPIC   — the place is what is being talked ABOUT ("…over Taiwan")
     Only SPEAKER/VENUE are docked, and only when a TOPIC-ish alternative
     exists — otherwise the only place in the headline would be thrown away. */
  var SPEECH_LATIN = /\b(?:said|says|saying|told|tells|warned?|warns|urged?|urges|announced?|announces|declared?|declares|stated?|states|claimed?|claims|denied|denies|accused?|accuses|pledged?|pledges|vowed?|vows|calls?|called|demands?|demanded|condemns?|condemned|denounce\w*|hails?|backs?|welcomes?|criticis\w+|criticiz\w+|comments?|commented|reiterat\w+|insists?|responds?|rejects?|rejected|approves?|approved|agrees?|agreed|dijo|declar[oó]|advirti[oó]|pide|pidi[oó]|sagte|erkl[aä]rte|ber[aä]t|fordert|k[uü]ndigt\w*|warnt|заявил\w*|сообщил\w*|сказал\w*|призвал\w*|осудил\w*)\b/i;
  var SPEECH_JA = /(?:表明|発言|声明|会見|述べ|語っ|談話|抗議した|批判した|要求した|呼びかけ)/;
  /* Meeting / venue nouns — "<event> in <place>" makes <place> the host. */
  var VENUE_LATIN = /\b(?:summit|talks|meeting|meets?|met|conference|negotiations?|forum|session|hosts?|hosted|gipfel|treffen|verhandlungen|konferenz|cumbre|reuni[oó]n|conversaciones|саммит|переговор\w*|встреч\w*)\b/i;
  var VENUE_JA = /(?:会談|会議|首脳会議|サミット|開幕|開催)/;
  /* What the talking is ABOUT — introduces the real subject of the story. */
  var TOPIC_LATIN = /(?:^|[\s(])(?:over|about|on|regarding|concerning|amid|against|toward|towards|for|[uü]ber|gegen|wegen|sobre|acerca\s+de|contra|по|о|об|против)\s+$/i;
  var TOPIC_JA = /^(?:を巡|をめぐ|について|に関して|に対して|への|に向け)/;
  /* Addressee of a transitive speech verb — "warns Washington over X": the
     addressee is not the subject either. `said/says` is deliberately EXCLUDED
     (the noun after it is normally the clause subject: "said Kharkiv was hit"). */
  var ADDRESS_LATIN = /\b(?:warned?|warns|told|tells|urged?|urges|pressed?|presses|accused?|accuses|asked|assured|briefed)\s+$/i;

  /* An EVENT happened here — the strongest positive subject signal. */
  var EVENT_LATIN = /\b(?:strikes?|struck|attacks?|attacked|blast|explosion|bombing|bombed|shelling|shelled|missile|drone|airstrike|raid|offensive|invasion|clashes?|fighting|battle|war|killed|deaths?|casualt\w+|earthquake|quake|tsunami|flood(?:s|ing|ed)?|wildfire|hurricane|typhoon|cyclone|storm|eruption|volcano|landslide|drought|heatwave|protests?|riot|unrest|coup|election|vote|referendum|verdict|crash(?:ed|es)?|derail\w*|sank|sinking|hostage|kidnap\w*|shooting|stabbing|outbreak|evacuat\w+|blackout|terremoto|inundaci|Erdbeben|Angriff|взрыв|удар|землетрясение)\b/i;
  var EVENT_JA = /(?:攻撃|空爆|爆発|爆弾|砲撃|ミサイル|無人機|侵攻|戦闘|交戦|衝突|死亡|死者|負傷|地震|津波|洪水|豪雨|台風|噴火|土砂|山火事|火災|干ばつ|猛暑|抗議|デモ|暴動|クーデター|選挙|投票|国民投票|判決|墜落|脱線|沈没|人質|誘拐|銃撃|刺傷|流行|避難|停電|事故)/;

  /* Index keys that are ALWAYS written in capitals in real copy. Requiring
     all-caps for these is free precision: it removes the entire class of
     "Who / Us / La / Ice / No" false positives without losing a single real
     mention. Acronyms that are legitimately title-cased in some languages
     (Nato, Opec, Isis…) are deliberately NOT listed. */
  var ACRONYM = new Set(['us', 'usa', 'uk', 'un', 'eu', 'who', 'wto', 'icc', 'icj', 'imf', 'ioc',
    'dc', 'la', 'prc', 'rok', 'drc', 'uae', 'dprk', 'ice', 'm23', 'hts', 'sco', 'sdf', 'rsf',
    'pkk', 'dmz', 'nrw', 'nsw', 'aws', 'byd', 'bis', 'ecb', 'nyt', 'nyc', 'psg', 'cdmx', 'gcc',
    'fomc', 'idf', 'irgc', 'tplf', 'tsmc', 'opcw', 'osce', 'no 10']);

  /* Titles that mark the NEXT capitalised word as a person, not a place. */
  var HONORIFIC = /\b(?:mr|mrs|ms|miss|dr|prof|sir|lord|lady|sen|rep|gov|amb|gen|col|capt|judge|coach|king|queen|prince|princess|pope|president|premier|chancellor|minister|mayor|ceo|secretary|senator|governor|manager)\.?\s+$/i;

  /* ------------------------------------------------------------------ *
   *  2.  Entity model
   * ------------------------------------------------------------------ */
  /* kind → how SPECIFIC (tie-break) and how NEWS-RELEVANT (score) it is. */
  var KIND_SCORE = { flashpoint: 5, seat: 4, feature: 3, city: 2, admin1: 1, country: 0, org: 0 };
  var KIND_LOCAL = { seat: 6, flashpoint: 5, city: 4, feature: 3, admin1: 2, country: 1, org: 1 };

  var ENTS = [];            // every entity, index === id
  var IDX = new Map();      // normalised latin surface  → [entity id …]
  var CIDX = new Map();     // raw CJK surface           → [entity id …]
  var STEM = new Map();     // russian stem (normalised) → [entity id …]
  var LSTEM = new Map();    // latin stem of a DOCKED surface → [entity id …]
  var BY_ISO = new Map();   // iso2 → country entity id
  var A1KEY = new Map();    // iso2 + '/' + a1 → admin1 entity id
  var MAXG = 5;             // longest latin n-gram in the index
  var MAXCJK = 12;          // longest CJK surface in the index
  var built = false;

  function addEnt(e) {
    e.id = ENTS.length;
    if (!e.name) e.name = { en: e.en || '', jp: e.jp || e.en || '' };
    if (e.rank == null) e.rank = 3;
    ENTS.push(e);
    return e;
  }

  /* (#R208) is any of these candidate entities a CURATED place rather than a long-tail gazetteer
     row? ⚠ RANK COUNTS UPWARDS HERE — it is a prominence prior (`score` adds `e.rank * 2` and the
     tie-break sorts it descending), so the bulk import register() files at 3 is the FLOOR and the
     hand-written tables sit at 4–7 above it. Getting this backwards is silent: `rank < 3` is true
     for nothing, so the caller's guard would apply to every place including Paris. */
  var BULK_RANK = 3;
  function anyCurated(ids) {
    for (var q = 0; q < ids.length; q++) { var e = ENTS[ids[q]]; if (e && e.rank > BULK_RANK) return true; }
    return false;
  }

  function indexSurface(surf, id) {
    if (!surf) return;
    if (hasCJK(surf)) {
      var raw = prep(surf);
      if (raw.length < 2) return;               // never index a single kanji (中/米 are words)
      if (raw.length > MAXCJK) MAXCJK = raw.length;
      var lc = CIDX.get(raw); if (lc) { if (lc.indexOf(id) < 0) lc.push(id); } else CIDX.set(raw, [id]);
      return;
    }
    var k = normTerm(surf);
    if (!k || k.length < 2) return;
    var g = k.split(' ').length; if (g > MAXG) MAXG = g;
    var l = IDX.get(k); if (l) { if (l.indexOf(id) < 0) l.push(id); } else IDX.set(k, [id]);
    /* Russian inflects heavily — index the supplied form as a STEM too so
       «Москв» matches Москва/Москве/Москвы/Москву without listing every case. */
    if (hasCyr(k) && k.length >= 4) {
      var s = STEM.get(k); if (s) { if (s.indexOf(id) < 0) s.push(id); } else STEM.set(k, [id]);
    }
    /* Adjectives and possessives inflect in German/Spanish/English too
       ("russisch"→russischen, "ruso"→rusos, "Maduro"→Maduros). Only DOCKED
       surfaces (demonyms, organisations, people) get a stem entry: they can
       never outrank an explicit place, so a loose match here is cheap. */
    if (ENTS[id] && ENTS[id].dock && g === 1 && k.length >= 5) {
      var ls = LSTEM.get(k); if (ls) { if (ls.indexOf(id) < 0) ls.push(id); } else LSTEM.set(k, [id]);
    }
  }

  /* ------------------------------------------------------------------ *
   *  3.  Scanning — longest match wins the span
   * ------------------------------------------------------------------ */
  function scanField(text, field, out) {
    if (!text) return;
    var toks = tokenize(text), n = toks.length, i, len, key, ids, k;

    for (i = 0; i < n;) {
      var hit = null, hitLen = 0, hitKey = '';
      for (len = Math.min(MAXG, n - i); len >= 1; len--) {
        key = '';
        for (k = 0; k < len; k++) { if (k) key += ' '; key += toks[i + k].n; }
        ids = IDX.get(key);
        if (ids) { hit = ids; hitLen = len; hitKey = key; break; }
      }
      if (!hit && toks[i].n.length >= 5) {
        /* Stem fallback — shave inflectional endings off a single token.
           Cyrillic uses the full stem table; Latin only the docked one. */
        var t = toks[i].n, tbl = hasCyr(t) ? STEM : LSTEM, maxCut = hasCyr(t) ? 4 : 3;
        for (var cut = 1; cut <= maxCut && t.length - cut >= 4; cut++) {
          ids = tbl.get(t.slice(0, t.length - cut));
          if (ids) { hit = ids; hitLen = 1; hitKey = t; break; }
        }
      }
      if (hit) {
        var allCaps = true;
        for (k = 0; k < hitLen; k++) if (!/^[A-ZÀ-ÞЀ-Я0-9.]+$/.test(toks[i + k].o)) { allCaps = false; break; }
        out.push({ ids: hit, field: field, at: toks[i].at, end: toks[i + hitLen - 1].end,
                   caps: toks[i].caps, allcaps: allCaps, surface: hitKey, cjk: false, text: text });
        i += hitLen;
      } else i++;
    }

    /* CJK character scanner — longest surface at each position. */
    if (hasCJK(text)) {
      for (i = 0; i < text.length;) {
        if (!CJK_RE.test(text.charAt(i))) { i++; continue; }
        /* (#R208) …but never START inside a katakana run — see KATA_RE above. Checked before the
           lookups rather than after a hit, because at such a position EVERY length is invalid: the
           left boundary depends only on where the match begins, so a shorter surface here would be
           rejected for the same reason. Skipping the position outright is the same answer, cheaper,
           and it lets the scan resume at the character after it (a run's own first character is a
           legitimate start, and that position was already visited). */
        if (isKata(text.charAt(i)) && isKata(text.charAt(i - 1))) { i++; continue; }
        var chit = null, clen = 0, ckey = '';
        for (len = Math.min(MAXCJK, text.length - i); len >= 2; len--) {
          ckey = text.substr(i, len);
          ids = CIDX.get(ckey);
          if (!ids) continue;
          /* ══ (#R208) …AND THE RIGHT EDGE, FOR THE LONG TAIL ONLY ═══════════════════════════════
             The left guard above cannot see 「ドライブレコーダー」 → ドラ (Dorra, Djibouti): the
             match is at the START of the run, so its left boundary is legitimate. What is wrong is
             the RIGHT one, and that side cannot be a flat rule, because ending early inside a run is
             sometimes exactly right (パリオリンピック).
             What separates the two is not the shape — it is WHICH PLACE. パリ is one of the 334
             curated rows, i.e. a place world news is about; ドラ is one of 148,083 long-tail rows
             from the gazetteer build, where a two-character coincidence with the head of a loanword
             is far likelier than a mention. So the rule is scoped by rank: a LONG-TAIL entity
             (rank 3, the floor — see anyCurated) must match a COMPLETE katakana run, while a
             curated one may end inside it and is judged by the TRAP table as before
             (ニューヨークタイムズ, whose Japanese spelling this round added to that table).
             ⚠ MEASURED: this is the only false pin left out of 24 ordinary Japanese headlines after
             the catalogue went 15,048 → 148,083, and it is the class that GROWS with the catalogue,
             which is why it is worth a rule rather than another trap row. */
          if (isKata(text.charAt(i)) && isKata(text.charAt(i + len)) && !anyCurated(ids)) continue;
          chit = ids; clen = len; break;
        }
        if (chit) {
          out.push({ ids: chit, field: field, at: i, end: i + clen, caps: true,
                     surface: ckey, cjk: true, text: text });
          i += clen;
        } else i++;
      }
    }
  }

  /* ------------------------------------------------------------------ *
   *  4.  Per-mention context features
   * ------------------------------------------------------------------ */
  function features(m) {
    var text = m.text, before = text.slice(Math.max(0, m.at - 24), m.at);
    var after = text.slice(m.end, m.end + 24);
    var win = text.slice(Math.max(0, m.at - 70), Math.min(text.length, m.end + 70));

    m.prep = m.cjk ? PREP_JA.test(after) : (PREP_LATIN.test(before) || PREP_CYR.test(before));
    m.event = m.cjk ? EVENT_JA.test(win) : EVENT_LATIN.test(win);
    m.topic = m.cjk ? TOPIC_JA.test(after) : TOPIC_LATIN.test(before);
    /* SPEAKER — the verb follows the place within ~2 words ("Moscow said…",
       「北朝鮮が…と表明」). Text BEFORE the place is deliberately NOT enough:
       "Gaza strikes, officials said" must never dock Gaza. */
    if (m.cjk) {
      m.speaker = SPEECH_JA.test(text.slice(m.end, m.end + 40));
    } else {
      /* first three words after the place, up to a clause break */
      var tail = text.slice(m.end, m.end + 40).replace(/^[\s,;:'"”’)\]]+/, '').split(/[.;–—]/)[0] || '';
      m.speaker = SPEECH_LATIN.test(tail.split(/\s+/).slice(0, 3).join(' '));
    }
    /* VENUE — "<summit|talks|会談> in <place>": the place merely hosts it. */
    /* The hosting noun sits BEFORE the place in Latin word order ("summit in
       Brussels") and AFTER it in Japanese (「ドバイで国際会議」), so look on the
       correct side only — a wide symmetric window wrongly marks the TOPIC
       place as a venue too, and then nothing can be docked. */
    m.venue = !!(m.prep && (m.cjk ? VENUE_JA.test(text.slice(m.end, m.end + 30))
                                  : VENUE_LATIN.test(text.slice(Math.max(0, m.at - 30), m.at))));
    m.address = m.cjk ? false : ADDRESS_LATIN.test(before);
    m.honor = m.cjk ? false : HONORIFIC.test(before);
    m.lead = m.field === 't' ? Math.max(0, 3 - Math.floor((m.at / Math.max(1, text.length)) * 4)) : 0;
    /* Japanese nominative/topic particle right after the name marks the ACTOR
       — the strongest "this is who the story is about" signal the language has. */
    m.actor = m.cjk ? /^(?:が|は)/.test(after) : false;
    return m;
  }

  /* ------------------------------------------------------------------ *
   *  5.  Ambiguity resolution — which real place is this surface?
   * ------------------------------------------------------------------ */
  /* Several index entries can describe the SAME place — a curated `geo_pins`
     row sits on top of a built-in one, so "Lebanon" ends up with two entries at
     identical coordinates. That is a DUPLICATE, not an ambiguity, and treating it
     as one is actively harmful: an "ambiguous" mention stops seeding the country
     context, so `Army shells Tripoli in northern Lebanon` loses its only cue and
     falls back to the Libyan capital. Collapse candidates that are within 50 km of
     each other and keep the richest one (an iso2 beats none, then higher rank). */
  function collapse(ids) {
    var first = ENTS[ids[0]], i;
    for (i = 1; i < ids.length; i++) if (haversine(first.loc, ENTS[ids[i]].loc) > 50) return null;
    var best = first;
    for (i = 1; i < ids.length; i++) {
      var e = ENTS[ids[i]], a = e.iso2 ? 1 : 0, b = best.iso2 ? 1 : 0;
      if (a > b || (a === b && e.rank > best.rank)) best = e;
    }
    return best;
  }

  function resolveMentions(ments) {
    var ctxISO = new Map(), ctxA1 = new Map(), anchors = [];

    /* Pass 1 — unambiguous mentions define the geographic context. */
    ments.forEach(function (m) {
      var e = m.ids.length === 1 ? ENTS[m.ids[0]] : collapse(m.ids);
      if (!e) return;
      m.solo = e;
      if (e.kind === 'trap') return;
      var w = (m.field === 't' ? 2 : 1);
      if (e.iso2) ctxISO.set(e.iso2, (ctxISO.get(e.iso2) || 0) + w);
      if (e.a1key) ctxA1.set(e.a1key, (ctxA1.get(e.a1key) || 0) + w);
      if (e.loc && e.kind !== 'country' && e.kind !== 'org') anchors.push(e.loc);
    });

    /* Pass 2 — pick one entity per mention. */
    ments.forEach(function (m) {
      if (m.solo) { m.ent = m.solo; m.margin = 9; return; }
      var best = null, bestS = -1e9, second = -1e9;
      for (var i = 0; i < m.ids.length; i++) {
        var e = ENTS[m.ids[i]], s = e.rank * 2;
        /* a verified built-in entry (it knows its country) outranks a bare
           runtime-registered row when everything else is equal */
        if (e.iso2) s += 2;
        if (e.iso2 && ctxISO.get(e.iso2)) s += 10 + 2 * ctxISO.get(e.iso2);
        if (e.a1key && ctxA1.get(e.a1key)) s += 9;
        if (e.capital) s += 2;
        if (e.kind === 'country') s += 3;              // "Georgia" alone → the country
        if (e.loc && anchors.length) {
          var d = 1e9;
          for (var a = 0; a < anchors.length; a++) d = Math.min(d, haversine(e.loc, anchors[a]));
          if (d < 400) s += 7; else if (d < 1500) s += 4; else if (d < 4000) s += 1;
        }
        if (s > bestS) { second = bestS; bestS = s; best = e; }
        else if (s > second) second = s;
      }
      m.ent = best; m.margin = bestS - second;
    });
    return { ctxISO: ctxISO, ctxA1: ctxA1 };
  }

  /* ------------------------------------------------------------------ *
   *  6.  Scoring — aggregate mentions into one subject
   * ------------------------------------------------------------------ */
  function score(ments) {
    var agg = new Map();

    ments.forEach(function (m) {
      var e = m.ent; if (!e || e.kind === 'trap') return;
      var a = agg.get(e.id);
      if (!a) { a = { e: e, t: 0, d: 0, prep: false, event: false, topic: false, actor: false,
                      spoke: true, address: false, honor: false, lead: 0, why: [], n: 0 }; agg.set(e.id, a); }
      a.n++;
      if (m.field === 't') { a.t++; a.lead = Math.max(a.lead, m.lead); } else a.d++;
      if (m.prep) a.prep = true;
      if (m.event) a.event = true;
      if (m.topic) a.topic = true;
      if (m.actor) a.actor = true;
      if (m.address) a.address = true;
      /* one mention that is neither speaker nor venue clears the dateline flag */
      if (!(m.speaker || m.venue)) a.spoke = false;
      if (m.honor) a.honor = true;
      if (!a.surface) a.surface = m.surface;
      if (!a.caps && m.caps) a.caps = true;
    });
    if (!agg.size) return [];

    /* Hierarchy: a mentioned child suppresses its own parent. */
    var present = new Set();
    agg.forEach(function (a) { present.add(a.e.id); });
    agg.forEach(function (a) {
      var e = a.e;
      if (e.parentIso && BY_ISO.has(e.parentIso) && present.has(BY_ISO.get(e.parentIso))) {
        a.childOfPresent = true;
        var p = agg.get(BY_ISO.get(e.parentIso)); if (p) p.absorbed = true;
      }
      if (e.a1key && A1KEY.has(e.a1key) && present.has(A1KEY.get(e.a1key)) && e.kind !== 'admin1') {
        a.childOfPresent = true;
        var pa = agg.get(A1KEY.get(e.a1key)); if (pa) pa.absorbed = true;
      }
    });

    /* Is there a candidate that is NOT a speaker/venue? Only then is the
       dateline dock safe — otherwise we would throw away the only place. */
    var anyClean = false, anyRealPlace = false, anyMarkedSubject = false;
    agg.forEach(function (a) {
      if (!a.spoke) anyClean = true;
      if (!a.e.weak && !a.e.dock && a.e.kind !== 'org') anyRealPlace = true;
      /* an alternative that is EXPLICITLY marked as the subject — "…over Taiwan",
         "…in Sudan", "clashes in Bamako" — is what makes a venue definitively not
         the story. A bare country actor ("US-China trade talks in Geneva") is not. */
      if (!a.spoke && (a.topic || a.prep || a.event)) anyMarkedSubject = true;
    });

    var out = [];
    agg.forEach(function (a) {
      var e = a.e, s = 0, why = [];
      if (a.t) { s += 10; why.push('title'); }
      if (a.d) { s += 3; why.push('desc'); }
      if (a.t && a.d) { s += 2; why.push('corroborated'); }
      if (a.n > 1) { s += Math.min(3, a.n - 1); }
      s += a.lead; if (a.lead) why.push('lead');
      if (a.prep) { s += 4; why.push('locative'); }
      if (a.event) { s += 4; why.push('event'); }
      if (a.topic) { s += 3; why.push('topic'); }
      if (a.actor) { s += 6; why.push('actor'); }
      s += (KIND_SCORE[e.kind] || 0);
      if (e.dock) { s -= 3; why.push('indirect'); }
      if (a.childOfPresent) { s += 5; why.push('hierarchy'); }
      if (a.absorbed) { s -= 9; why.push('parent-of-named-child'); }
      if (a.spoke && anyClean) { s -= (anyMarkedSubject ? 6 : 3); why.push('dateline'); }
      if (a.address) { s -= 4; why.push('addressee'); }
      if (a.honor) { s -= 5; why.push('person-title'); }
      if (e.weak) {
        /* Common-word places ("Turkey", "Chad", "Nice", "Reading"): demand a
           capitalised surface AND real corroboration. With none, the word is
           far more likely to be the ordinary noun — drop it rather than pin. */
        if (!a.caps) return;
        /* anyRealPlace already implies a NON-weak entity elsewhere in the text
           (this one is weak), which is corroboration enough. */
        if (!(a.prep || a.event || a.childOfPresent || a.topic || anyRealPlace)) return;
      }
      if (s <= 0) return;
      out.push({ e: e, s: s, why: why, surface: a.surface });
    });

    out.sort(function (x, y) {
      if (y.s !== x.s) return y.s - x.s;
      var lx = KIND_LOCAL[x.e.kind] || 0, ly = KIND_LOCAL[y.e.kind] || 0;
      if (ly !== lx) return ly - lx;
      return (y.e.rank || 0) - (x.e.rank || 0);
    });
    return out;
  }

  /* ------------------------------------------------------------------ *
   *  7.  Public entry points
   * ------------------------------------------------------------------ */
  function analyze(title, opts) {
    build();
    opts = opts || {};
    var T = prep(title), D = prep(opts.desc || '');
    /* Never let the outlet's own name geolocate its story. */
    var pub = String(opts.publisher || '').trim();
    if (pub && pub.length > 2) {
      try {
        var re = new RegExp(pub.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        T = T.replace(re, ' '); D = D.replace(re, ' ');
      } catch (_) { }
    }
    var ments = [];
    scanField(T, 't', ments);
    scanField(D, 'd', ments);
    /* CASE GUARD (Latin/Cyrillic only — CJK has no case). Runs BEFORE context
       resolution so a bogus hit can never even seed the geographic context.
         · A place name is a PROPER NOUN, capitalised in every headline style
           this app ingests, so a lower-case hit is the ordinary word:
           "helps us grow" ≠ US, "la guerra" ≠ LA, "male voters" ≠ Malé.
           Demonyms are exempt — de/es/ru adjectives are lower-case by rule
           ("russisch", "ruso", "российский").
         · ACRONYMS must additionally be ALL-CAPS, so a sentence-initial
           "Who…" never becomes the WHO and "Ice…" never becomes ICE. */
    ments = ments.filter(function (m) {
      if (m.cjk) return true;
      if (ACRONYM.has(m.surface) && !m.allcaps) return false;
      if (m.caps) return true;
      var keep = m.ids.filter(function (id) { return ENTS[id].demonym; });
      if (!keep.length) return false;
      m.ids = keep; return true;
    });
    ments.forEach(features);
    resolveMentions(ments);
    var ranked = score(ments);
    var top = ranked[0] || null, res = null;
    if (top) {
      var margin = ranked.length > 1 ? (top.s - ranked[1].s) : top.s;
      var conf = Math.min(1, top.s / 24) * 0.6 + Math.min(1, margin / 8) * 0.4;
      res = {
        lng: top.e.loc[0], lat: top.e.loc[1],
        name: { en: top.e.name.en, jp: top.e.name.jp || top.e.name.en },
        kind: top.e.kind, iso2: top.e.iso2 || '', rank: top.e.rank,
        confidence: Math.round(conf * 100) / 100, score: top.s,
        surface: top.surface, why: top.why
      };
    }
    return { result: res, ranked: ranked, mentions: ments };
  }

  function locate(title, opts) { return analyze(title, opts).result; }

  /* ------------------------------------------------------------------ *
   *  8.  Data tables → entities
   * ------------------------------------------------------------------ */
  /* Packed rows. `split('|')` fields, `;` sub-lists, blank = "same as English".
       COUNTRY : iso2|lng|lat|capLng|capLat|en|ja|capEn|capJa|alt…|demonym…
       PLACE   : en|ja|iso2|a1|lng|lat|kind|rank|alt…
       ADMIN1  : en|ja|iso2|a1|lng|lat|alt…
       TRAP    : surfaces…|kind|targetKey|en|ja        (kind x=notplace o=org s=seat)
     Coordinates are decimal degrees, lng first (GeoJSON order). */
  var CO = [], PL = [], A1 = [], TR = [];

  /* ---- COUNTRIES : iso2|lng|lat|capLng|capLat|en|ja|capEn|capJa|alt…|demonym… ---- */
  CO.push(
    'AF|66.0|34.0|69.18|34.53|Afghanistan|アフガニスタン|Kabul|カブール|Afganistán;Афганистан|Afghan;Afghans;afghanisch;афганск',
    'AL|20.0|41.15|19.82|41.33|Albania|アルバニア|Tirana|ティラナ|Albanien;Албани|Albanian;Albanians;albanisch;албанск',
    'DZ|2.6|28.0|3.06|36.75|Algeria|アルジェリア|Algiers|アルジェ|Algerien;Argelia;Алжир|Algerian;Algerians;algerisch;алжирск',
    'AD|1.52|42.5|1.52|42.51|Andorra|アンドラ|Andorra la Vella|アンドラ・ラ・ベリャ||Andorran',
    'AO|17.9|-11.2|13.23|-8.84|Angola|アンゴラ|Luanda|ルアンダ|Ангол|Angolan;angolanisch',
    'AG|-61.8|17.06|-61.85|17.12|Antigua and Barbuda|アンティグア・バーブーダ|St. John’s|セントジョンズ||Antiguan',
    'AR|-64.0|-34.0|-58.38|-34.6|Argentina|アルゼンチン|Buenos Aires|ブエノスアイレス|Argentinien;Аргентин|Argentine;Argentinian;Argentinians;argentinisch;argentino;argentina;аргентинск',
    'AM|45.0|40.2|44.51|40.18|Armenia|アルメニア|Yerevan|エレバン|Armenien;Армени|Armenian;Armenians;armenisch;армянск',
    'AU|134.0|-25.5|149.13|-35.28|Australia|オーストラリア|Canberra|キャンベラ|Australien;Австрали|Australian;Australians;australisch;австралийск',
    'AT|14.5|47.6|16.37|48.21|Austria|オーストリア|Vienna|ウィーン|Österreich;Austria;Австри|Austrian;Austrians;österreichisch;австрийск',
    'AZ|47.9|40.4|49.87|40.41|Azerbaijan|アゼルバイジャン|Baku|バクー|Aserbaidschan;Азербайджан|Azerbaijani;Azeri;aserbaidschanisch;азербайджанск',
    'BS|-77.4|25.0|-77.35|25.06|Bahamas|バハマ|Nassau|ナッソー||Bahamian',
    'BH|50.55|26.05|50.59|26.23|Bahrain|バーレーン|Manama|マナーマ|Бахрейн|Bahraini;bahrainisch',
    'BD|90.3|23.8|90.41|23.81|Bangladesh|バングラデシュ|Dhaka|ダッカ|Бангладеш|Bangladeshi;bangladeschisch;бангладешск',
    'BB|-59.5|13.19|-59.62|13.1|Barbados|バルバドス|Bridgetown|ブリッジタウン||Barbadian',
    'BY|28.0|53.7|27.57|53.9|Belarus|ベラルーシ|Minsk|ミンスク|Weißrussland;Belarús;Белорусси;Беларус|Belarusian;Belarusians;belarussisch;белорусск',
    'BE|4.6|50.6|4.35|50.85|Belgium|ベルギー|Brussels|ブリュッセル|Belgien;Bélgica;Бельги|Belgian;Belgians;belgisch;бельгийск',
    'BZ|-88.7|17.2|-88.19|17.5|Belize|ベリーズ|Belmopan|ベルモパン||Belizean',
    'BJ|2.4|9.5|2.62|6.5|Benin|ベナン|Porto-Novo|ポルトノボ|Бенин|Beninese',
    'BT|90.4|27.5|89.64|27.47|Bhutan|ブータン|Thimphu|ティンプー|Бутан|Bhutanese;bhutanisch',
    'BO|-64.7|-16.3|-68.15|-16.5|Bolivia|ボリビア|La Paz|ラパス|Bolivien;བ;Боливи|Bolivian;Bolivians;bolivianisch;boliviano;боливийск',
    'BA|17.8|44.0|18.41|43.86|Bosnia and Herzegovina|ボスニア・ヘルツェゴビナ|Sarajevo|サラエボ|Bosnien;Bosnia;Босни|Bosnian;Bosnians;bosnisch;боснийск',
    'BW|24.7|-22.2|25.91|-24.65|Botswana|ボツワナ|Gaborone|ハボローネ|Ботсван|Botswanan',
    'BR|-51.0|-10.5|-47.88|-15.79|Brazil|ブラジル|Brasília|ブラジリア|Brasilien;Brasil;Бразили|Brazilian;Brazilians;brasilianisch;brasileño;бразильск',
    'BN|114.7|4.5|114.94|4.89|Brunei|ブルネイ|Bandar Seri Begawan|バンダルスリブガワン|Бруней|Bruneian',
    'BG|25.3|42.7|23.32|42.7|Bulgaria|ブルガリア|Sofia|ソフィア|Bulgarien;Болгари|Bulgarian;Bulgarians;bulgarisch;болгарск',
    'BF|-1.7|12.3|-1.53|12.37|Burkina Faso|ブルキナファソ|Ouagadougou|ワガドゥグー|Буркина|Burkinabe;Burkinabé',
    'BI|29.9|-3.4|29.36|-3.38|Burundi|ブルンジ|Gitega|ギテガ|Бурунди|Burundian',
    'KH|105.0|12.6|104.92|11.56|Cambodia|カンボジア|Phnom Penh|プノンペン|Kambodscha;Camboya;Камбодж|Cambodian;Cambodians;kambodschanisch;камбоджийск',
    'CM|12.4|5.7|11.5|3.85|Cameroon|カメルーン|Yaoundé|ヤウンデ|Kamerun;Camerún;Камерун|Cameroonian;kamerunisch',
    'CA|-106.0|56.0|-75.7|45.42|Canada|カナダ|Ottawa|オタワ|Kanada;Канад|Canadian;Canadians;kanadisch;canadiense;канадск',
    'CV|-23.6|15.1|-23.51|14.93|Cape Verde|カーボベルデ|Praia|プライア|Cabo Verde|Cape Verdean',
    'CF|20.9|6.6|18.56|4.36|Central African Republic|中央アフリカ共和国|Bangui|バンギ|Zentralafrikanische Republik;Центральноафрикан|Central African',
    'TD|18.7|15.5|15.05|12.11|Chad!|チャド|N’Djamena|ンジャメナ|Tschad;Чад|Chadian;tschadisch',
    'CL|-71.3|-35.7|-70.65|-33.45|Chile|チリ|Santiago|サンティアゴ|Чили|Chilean;Chileans;chilenisch;chileno;чилийск',
    'CN|104.0|35.0|116.4|39.9|China|中国|Beijing|北京|Volksrepublik China;PRC;People’s Republic of China;Китай;Кита;中華人民共和国|Chinese;chinesisch;chino;китайск;中国人;中国語;中国製',
    'CO|-73.0|4.0|-74.07|4.71|Colombia|コロンビア|Bogotá|ボゴタ|Kolumbien;Колумби|Colombian;Colombians;kolumbianisch;colombiano;колумбийск',
    'KM|43.3|-11.7|43.26|-11.7|Comoros|コモロ|Moroni|モロニ||Comorian',
    'CG|15.8|-0.8|15.28|-4.27|Republic of the Congo|コンゴ共和国|Brazzaville|ブラザビル|Congo-Brazzaville|Congolese',
    'CD|23.6|-2.9|15.31|-4.32|DR Congo|コンゴ民主共和国|Kinshasa|キンシャサ|Democratic Republic of the Congo;DRC;Congo-Kinshasa;Kongo;Конго|Congolese;kongolesisch;конголезск',
    'CR|-84.1|9.9|-84.09|9.93|Costa Rica|コスタリカ|San José|サンホセ|Коста-Рика|Costa Rican;costarricense',
    'CI|-5.5|7.6|-4.03|5.35|Côte d’Ivoire|コートジボワール|Abidjan|アビジャン|Ivory Coast;Cote d’Ivoire;Elfenbeinküste;Кот-д|Ivorian;ivorisch',
    'HR|16.4|45.1|15.98|45.81|Croatia|クロアチア|Zagreb|ザグレブ|Kroatien;Croacia;Хорвати|Croatian;Croatians;kroatisch;хорватск',
    'CU|-79.5|21.5|-82.38|23.13|Cuba|キューバ|Havana|ハバナ|Kuba;Куба|Cuban;Cubans;kubanisch;cubano;кубинск',
    'CY|33.2|35.1|33.36|35.17|Cyprus|キプロス|Nicosia|ニコシア|Zypern;Chipre;Кипр|Cypriot;zyprisch;кипрск',
    'CZ|15.5|49.8|14.42|50.09|Czechia|チェコ|Prague|プラハ|Czech Republic;Tschechien;Chequia;Чехи|Czech;Czechs;tschechisch;чешск',
    'DK|9.5|56.0|12.57|55.68|Denmark|デンマーク|Copenhagen|コペンハーゲン|Dänemark;Dinamarca;Дани|Danish;Danes;dänisch;датск',
    'DJ|42.6|11.7|43.15|11.59|Djibouti|ジブチ|Djibouti|ジブチ市|Джибути|Djiboutian',
    'DM|-61.4|15.4|-61.39|15.3|Dominica|ドミニカ国|Roseau|ロゾー||Dominican',
    'DO|-70.2|18.8|-69.93|18.47|Dominican Republic|ドミニカ共和国|Santo Domingo|サントドミンゴ|República Dominicana;Доминикан|Dominican',
    'EC|-78.4|-1.5|-78.47|-0.18|Ecuador|エクアドル|Quito|キト|Эквадор|Ecuadorian;Ecuadorians;ecuatoriano;эквадорск',
    'EG|30.0|27.0|31.24|30.04|Egypt|エジプト|Cairo|カイロ|Ägypten;Egipto;Египет;Египт|Egyptian;Egyptians;ägyptisch;egipcio;египетск',
    'SV|-88.9|13.8|-89.19|13.69|El Salvador|エルサルバドル|San Salvador|サンサルバドル|Сальвадор|Salvadoran;salvadoreño',
    'GQ|10.5|1.6|8.78|3.75|Equatorial Guinea|赤道ギニア|Malabo|マラボ|Guinea Ecuatorial|Equatoguinean',
    'ER|38.8|15.2|38.93|15.34|Eritrea|エリトリア|Asmara|アスマラ|Эритре|Eritrean;eritreisch',
    'EE|25.5|58.7|24.75|59.44|Estonia|エストニア|Tallinn|タリン|Estland;Estonia;Эстони|Estonian;Estonians;estnisch;эстонск',
    'SZ|31.5|-26.5|31.14|-26.32|Eswatini|エスワティニ|Mbabane|ムババーネ|Swaziland|Swazi',
    'ET|39.5|9.1|38.74|9.03|Ethiopia|エチオピア|Addis Ababa|アディスアベバ|Äthiopien;Etiopía;Эфиопи|Ethiopian;Ethiopians;äthiopisch;эфиопск',
    'FJ|178.0|-17.8|178.44|-18.14|Fiji|フィジー|Suva|スバ|Фиджи|Fijian',
    'FI|26.0|64.0|24.94|60.17|Finland|フィンランド|Helsinki|ヘルシンキ|Finnland;Finlandia;Финлянди|Finnish;Finns;finnisch;финск',
    'FR|2.2|46.5|2.35|48.85|France|フランス|Paris|パリ|Frankreich;Francia;Франци|French;Frenchman;französisch;francés;французск',
    'GA|11.8|-0.8|9.45|0.39|Gabon|ガボン|Libreville|リーブルビル|Габон|Gabonese',
    'GM|-15.4|13.4|-16.58|13.45|Gambia|ガンビア|Banjul|バンジュール|Гамби|Gambian',
    'GE|43.4|42.2|44.83|41.72|Georgia|ジョージア|Tbilisi|トビリシ|Georgien;Грузи|Georgian;Georgians;georgisch;грузинск',
    'DE|10.0|51.0|13.4|52.52|Germany|ドイツ|Berlin|ベルリン|Deutschland;Alemania;Германи;Герман|German;Germans;deutsch;alemán;немецк;германск',
    'GH|-1.0|7.9|-0.19|5.6|Ghana|ガーナ|Accra|アクラ|Гана|Ghanaian;ghanaisch',
    'GR|22.0|39.0|23.73|37.98|Greece|ギリシャ|Athens|アテネ|Griechenland;Grecia;Греци|Greek;Greeks;griechisch;griego;греческ',
    'GD|-61.7|12.1|-61.75|12.05|Grenada|グレナダ|St. George’s|セントジョージズ||Grenadian',
    'GT|-90.4|15.6|-90.51|14.63|Guatemala|グアテマラ|Guatemala City|グアテマラシティ|Гватемал|Guatemalan;guatemalteco',
    'GN|-10.9|10.4|-13.7|9.51|Guinea!|ギニア|Conakry|コナクリ|Guinée;Гвине|Guinean',
    'GW|-15.0|12.0|-15.6|11.86|Guinea-Bissau|ギニアビサウ|Bissau|ビサウ||Bissau-Guinean',
    'GY|-58.9|4.9|-58.16|6.8|Guyana|ガイアナ|Georgetown|ジョージタウン|Гайан|Guyanese',
    'HT|-72.4|19.0|-72.34|18.54|Haiti|ハイチ|Port-au-Prince|ポルトープランス|Haïti;Гаити;Гаит|Haitian;Haitians;haitianisch;гаитянск',
    'HN|-86.5|14.8|-87.21|14.07|Honduras|ホンジュラス|Tegucigalpa|テグシガルパ|Гондурас|Honduran;hondureño',
    'HU|19.5|47.2|19.04|47.5|Hungary|ハンガリー|Budapest|ブダペスト|Ungarn;Hungría;Венгри|Hungarian;Hungarians;ungarisch;венгерск',
    'IS|-19.0|65.0|-21.94|64.15|Iceland|アイスランド|Reykjavík|レイキャビク|Island;Islandia;Исланди|Icelandic;Icelanders;isländisch;исландск',
    'IN|79.0|22.0|77.21|28.61|India|インド|New Delhi|ニューデリー|Indien;Инди|Indian;Indians;indisch;indio;индийск',
    'ID|113.0|-2.5|106.85|-6.21|Indonesia|インドネシア|Jakarta|ジャカルタ|Indonesien;Индонези|Indonesian;Indonesians;indonesisch;индонезийск',
    'IR|53.0|32.5|51.39|35.69|Iran|イラン|Tehran|テヘラン|Persia;Иран|Iranian;Iranians;iranisch;iraní;иранск',
    'IQ|43.7|33.2|44.36|33.31|Iraq|イラク|Baghdad|バグダッド|Irak;Ирак|Iraqi;Iraqis;irakisch;iraquí;иракск',
    'IE|-8.0|53.2|-6.26|53.35|Ireland|アイルランド|Dublin|ダブリン|Irland;Irlanda;Ирланди|Irish;irisch;ирландск',
    'IL|34.85|31.5|35.21|31.77|Israel|イスラエル|Jerusalem|エルサレム|Изра|Israeli;Israelis;israelisch;israelí;израильск',
    'IT|12.5|42.8|12.5|41.9|Italy|イタリア|Rome|ローマ|Italien;Italia;Итали|Italian;Italians;italienisch;italiano;итальянск',
    'JM|-77.3|18.1|-76.79|17.99|Jamaica|ジャマイカ|Kingston|キングストン|Ямайк|Jamaican',
    'JP|138.0|37.0|139.69|35.69|Japan|日本|Tokyo|東京|Nippon;Japón;Япони;日本国|Japanese;japanisch;japonés;японск;日本人',
    'JO|36.5|31.2|35.94|31.95|Jordan!|ヨルダン|Amman|アンマン|Jordanien;Иордани|Jordanian;Jordanians;jordanisch;иорданск',
    'KZ|68.0|48.0|71.45|51.18|Kazakhstan|カザフスタン|Astana|アスタナ|Kasachstan;Казахстан|Kazakh;Kazakhs;kasachisch;казахстанск',
    'KE|37.9|0.2|36.82|-1.29|Kenya|ケニア|Nairobi|ナイロビ|Kenia;Кени|Kenyan;Kenyans;kenianisch;кенийск',
    'KI|173.0|1.4|172.98|1.33|Kiribati|キリバス|Tarawa|タラワ||I-Kiribati',
    'KP|127.5|40.0|125.76|39.04|North Korea|北朝鮮|Pyongyang|平壌|DPRK;Nordkorea;Corea del Norte;Северная Корея;Корея;朝鮮民主主義人民共和国|North Korean;North Koreans;nordkoreanisch;северокорейск;北朝鮮の',
    'KR|127.8|36.5|126.98|37.57|South Korea|韓国|Seoul|ソウル|Republic of Korea;ROK;Südkorea;Corea del Sur;Южная Корея;大韓民国|South Korean;South Koreans;südkoreanisch;южнокорейск;韓国人',
    'KW|47.6|29.3|47.98|29.38|Kuwait|クウェート|Kuwait City|クウェート市|Kuweit;Кувейт|Kuwaiti;kuwaitisch',
    'KG|74.6|41.2|74.6|42.87|Kyrgyzstan|キルギス|Bishkek|ビシュケク|Kirgisistan;Киргиз;Кыргыз|Kyrgyz;kirgisisch',
    'LA|103.8|18.2|102.6|17.97|Laos|ラオス|Vientiane|ビエンチャン|Лаос|Lao;Laotian;laotisch',
    'LV|24.6|56.9|24.11|56.95|Latvia|ラトビア|Riga|リガ|Lettland;Letonia;Латви|Latvian;Latvians;lettisch;латвийск',
    'LB|35.8|33.9|35.5|33.89|Lebanon|レバノン|Beirut|ベイルート|Libanon;Líbano;Ливан|Lebanese;libanesisch;libanés;ливанск',
    'LS|28.2|-29.6|27.48|-29.31|Lesotho|レソト|Maseru|マセル|Лесото|Basotho',
    'LR|-9.4|6.4|-10.8|6.31|Liberia|リベリア|Monrovia|モンロビア|Либери|Liberian',
    'LY|17.2|27.0|13.19|32.89|Libya|リビア|Tripoli|トリポリ|Libyen;Libia;Ливи|Libyan;Libyans;libysch;ливийск',
    'LI|9.55|47.15|9.52|47.14|Liechtenstein|リヒテンシュタイン|Vaduz|ファドゥーツ||Liechtensteiner',
    'LT|23.9|55.2|25.28|54.69|Lithuania|リトアニア|Vilnius|ビリニュス|Litauen;Lituania;Литв|Lithuanian;Lithuanians;litauisch;литовск',
    'LU|6.13|49.8|6.13|49.61|Luxembourg|ルクセンブルク|Luxembourg City|ルクセンブルク市|Luxemburg;Люксембург|Luxembourgish',
    'MG|46.9|-19.0|47.51|-18.88|Madagascar|マダガスカル|Antananarivo|アンタナナリボ|Мадагаскар|Malagasy',
    'MW|34.3|-13.3|33.79|-13.96|Malawi|マラウイ|Lilongwe|リロングウェ|Малави|Malawian',
    'MY|101.9|4.2|101.69|3.14|Malaysia|マレーシア|Kuala Lumpur|クアラルンプール|Malasia;Малайзи|Malaysian;Malaysians;malaysisch;малайзийск',
    'MV|73.5|3.2|73.51|4.18|Maldives|モルディブ|Malé!|マレ|Мальдив|Maldivian',
    'ML|-4.0|17.6|-8.0|12.65|Mali!|マリ|Bamako|バマコ|Мали|Malian;malisch',
    'MT|14.4|35.9|14.51|35.9|Malta|マルタ|Valletta|バレッタ|Мальт|Maltese',
    'MH|171.2|7.1|171.38|7.09|Marshall Islands|マーシャル諸島|Majuro|マジュロ||Marshallese',
    'MR|-10.9|20.3|-15.98|18.08|Mauritania|モーリタニア|Nouakchott|ヌアクショット|Мавритани|Mauritanian',
    'MU|57.6|-20.3|57.5|-20.16|Mauritius|モーリシャス|Port Louis|ポートルイス|Маврики|Mauritian',
    'MX|-102.0|23.5|-99.13|19.43|Mexico|メキシコ|Mexico City|メキシコシティ|México;Mexiko;Мексик|Mexican;Mexicans;mexikanisch;mexicano;мексиканск',
    'FM|150.5|6.9|158.16|6.92|Micronesia|ミクロネシア|Palikir|パリキール||Micronesian',
    'MD|28.5|47.2|28.86|47.01|Moldova|モルドバ|Chișinău|キシナウ|Moldau;Молдав;Молдов|Moldovan;moldauisch;молдавск',
    'MC|7.42|43.74|7.42|43.73|Monaco|モナコ|Monaco|モナコ|Монако|Monegasque',
    'MN|103.8|46.9|106.92|47.92|Mongolia|モンゴル|Ulaanbaatar|ウランバートル|Mongolei;Монголи|Mongolian;Mongolians;mongolisch;монгольск',
    'ME|19.3|42.8|19.26|42.44|Montenegro|モンテネグロ|Podgorica|ポドゴリツァ|Черногори|Montenegrin;montenegrinisch',
    'MA|-6.0|32.0|-6.84|34.02|Morocco|モロッコ|Rabat|ラバト|Marokko;Marruecos;Марокк|Moroccan;Moroccans;marokkanisch;marroquí;мароккан',
    'MZ|35.5|-18.3|32.58|-25.97|Mozambique|モザンビーク|Maputo|マプト|Mosambik;Мозамбик|Mozambican;mosambikanisch',
    'MM|96.0|21.0|96.13|19.75|Myanmar|ミャンマー|Naypyidaw|ネピドー|Burma;Birmania;Мьянм;ビルマ|Burmese;Myanmar;birmanisch;мьянманск',
    'NA|17.1|-22.0|17.08|-22.56|Namibia|ナミビア|Windhoek|ウィントフック|Намиби|Namibian;namibisch',
    'NP|84.1|28.4|85.32|27.7|Nepal|ネパール|Kathmandu|カトマンズ|Непал|Nepali;Nepalese;nepalesisch;непальск',
    'NL|5.6|52.2|4.9|52.37|Netherlands|オランダ|Amsterdam|アムステルダム|Holland;Niederlande;Países Bajos;Нидерланд;Голланди|Dutch;Netherlander;niederländisch;neerlandés;нидерландск;голландск',
    'NZ|172.5|-41.0|174.78|-41.29|New Zealand|ニュージーランド|Wellington|ウェリントン|Neuseeland;Nueva Zelanda;Новая Зеландия;Зеланди|New Zealander;Kiwi;neuseeländisch;новозеландск',
    'NI|-85.2|12.9|-86.25|12.11|Nicaragua|ニカラグア|Managua|マナグア|Никарагуа|Nicaraguan;nicaragüense',
    'NE|9.4|17.6|2.12|13.51|Niger!|ニジェール|Niamey|ニアメ|Нигер|Nigerien;nigrisch',
    'NG|8.1|9.6|7.49|9.06|Nigeria|ナイジェリア|Abuja|アブジャ|Нигери|Nigerian;Nigerians;nigerianisch;нигерийск',
    'MK|21.7|41.6|21.43|41.99|North Macedonia|北マケドニア|Skopje|スコピエ|Macedonia;Mazedonien;Македони|Macedonian;mazedonisch;македонск',
    'NO|9.0|61.0|10.75|59.91|Norway|ノルウェー|Oslo|オスロ|Norwegen;Noruega;Норвеги|Norwegian;Norwegians;norwegisch;норвежск',
    'OM|56.1|20.6|58.41|23.59|Oman|オマーン|Muscat|マスカット|Оман|Omani;omanisch',
    'PK|69.3|30.0|73.06|33.69|Pakistan|パキスタン|Islamabad|イスラマバード|Пакистан|Pakistani;Pakistanis;pakistanisch;paquistaní;пакистанск',
    'PW|134.5|7.5|134.62|7.5|Palau|パラオ|Ngerulmud|ゲルルムド||Palauan',
    'PS|35.2|31.9|35.23|31.9|Palestine|パレスチナ|Ramallah|ラマラ|Palestinian territories;Palästina;Palestina;Палестин|Palestinian;Palestinians;palästinensisch;palestino;палестинск',
    'PA|-80.1|8.5|-79.52|8.98|Panama|パナマ|Panama City|パナマシティ|Panamá;Панам|Panamanian;panameño',
    'PG|145.0|-6.5|147.19|-9.44|Papua New Guinea|パプアニューギニア|Port Moresby|ポートモレスビー|Papua-Neuguinea;Папуа|Papua New Guinean',
    'PY|-58.4|-23.4|-57.58|-25.3|Paraguay|パラグアイ|Asunción|アスンシオン|Парагвай|Paraguayan;paraguayo;парагвайск',
    'PE|-75.0|-9.2|-77.04|-12.05|Peru|ペルー|Lima|リマ|Perú;Перу|Peruvian;Peruvians;peruanisch;peruano;перуанск',
    'PH|122.0|12.0|120.98|14.6|Philippines|フィリピン|Manila|マニラ|Filipinas;Philippinen;Филиппин|Filipino;Filipinos;Philippine;philippinisch;филиппинск',
    'PL|19.5|52.0|21.01|52.23|Poland|ポーランド|Warsaw|ワルシャワ|Polen;Polonia;Польш;Польск|Polish;Poles;polnisch;polaco;польск',
    'PT|-8.2|39.6|-9.14|38.72|Portugal|ポルトガル|Lisbon|リスボン|Португали|Portuguese;portugiesisch;portugués;португальск',
    'QA|51.2|25.3|51.53|25.29|Qatar|カタール|Doha|ドーハ|Katar;Катар|Qatari;katarisch;катарск',
    'RO|25.0|45.9|26.1|44.43|Romania|ルーマニア|Bucharest|ブカレスト|Rumänien;Rumania;Румыни|Romanian;Romanians;rumänisch;румынск',
    'RU|93.0|62.0|37.62|55.75|Russia|ロシア|Moscow|モスクワ|Russian Federation;Russland;Rusia;Росси;Русск;РФ|Russian;Russians;russisch;ruso;rusa;российск;русск',
    'RW|29.9|-2.0|30.06|-1.94|Rwanda|ルワンダ|Kigali|キガリ|Ruanda;Руанд|Rwandan;ruandisch;руандийск',
    'KN|-62.7|17.3|-62.73|17.3|Saint Kitts and Nevis|セントクリストファー・ネイビス|Basseterre|バセテール||Kittitian',
    'LC|-60.98|13.9|-60.99|14.01|Saint Lucia|セントルシア|Castries|カストリーズ||Saint Lucian',
    'VC|-61.2|13.25|-61.22|13.16|Saint Vincent and the Grenadines|セントビンセント・グレナディーン|Kingstown|キングスタウン||Vincentian',
    'WS|-172.4|-13.6|-171.76|-13.83|Samoa|サモア|Apia|アピア||Samoan',
    'SM|12.46|43.94|12.45|43.94|San Marino|サンマリノ|San Marino|サンマリノ市||Sammarinese',
    'ST|6.6|0.3|6.73|0.34|São Tomé and Príncipe|サントメ・プリンシペ|São Tomé|サントメ||Santomean',
    'SA|45.0|24.0|46.72|24.69|Saudi Arabia|サウジアラビア|Riyadh|リヤド|Saudi-Arabien;Arabia Saudí;Саудовская Аравия;Саудовск|Saudi;Saudis;saudisch;saudí;саудовск',
    'SN|-14.5|14.5|-17.45|14.69|Senegal|セネガル|Dakar|ダカール|Sénégal;Сенегал|Senegalese;senegalesisch',
    'RS|20.9|44.0|20.46|44.79|Serbia|セルビア|Belgrade|ベオグラード|Serbien;Сербия;Серби|Serbian;Serbs;serbisch;сербск',
    'SC|55.5|-4.6|55.45|-4.62|Seychelles|セーシェル|Victoria|ビクトリア||Seychellois',
    'SL|-11.8|8.5|-13.23|8.48|Sierra Leone|シエラレオネ|Freetown|フリータウン|Сьерра-Леоне|Sierra Leonean',
    'SG|103.85|1.29|103.85|1.29|Singapore|シンガポール|Singapore|シンガポール市|Singapur;Сингапур|Singaporean;singapurisch;сингапурск',
    'SK|19.5|48.7|17.11|48.15|Slovakia|スロバキア|Bratislava|ブラチスラバ|Slowakei;Eslovaquia;Словаки|Slovak;Slovaks;slowakisch;словацк',
    'SI|14.8|46.1|14.51|46.05|Slovenia|スロベニア|Ljubljana|リュブリャナ|Slowenien;Eslovenia;Словени|Slovenian;Slovenes;slowenisch;словенск',
    'SB|160.0|-9.6|159.96|-9.43|Solomon Islands|ソロモン諸島|Honiara|ホニアラ|Соломоновы|Solomon Islander',
    'SO|46.2|5.2|45.34|2.05|Somalia|ソマリア|Mogadishu|モガディシュ|Сомали|Somali;Somalis;somalisch;сомалийск',
    'ZA|24.7|-29.0|28.19|-25.75|South Africa|南アフリカ|Pretoria|プレトリア|Südafrika;Sudáfrica;Южная Африка;ЮАР|South African;South Africans;südafrikanisch;южноафрикан',
    'SS|31.3|7.3|31.58|4.85|South Sudan|南スーダン|Juba|ジュバ|Südsudan;Южный Судан|South Sudanese',
    'ES|-3.7|40.2|-3.7|40.42|Spain|スペイン|Madrid|マドリード|España;Spanien;Испани|Spanish;Spaniards;spanisch;español;española;испанск',
    'LK|80.7|7.9|79.86|6.93|Sri Lanka|スリランカ|Colombo|コロンボ|Шри-Ланка|Sri Lankan;srilankisch',
    'SD|30.0|15.5|32.53|15.5|Sudan|スーダン|Khartoum|ハルツーム|Sudán;Судан|Sudanese;sudanesisch;суданск',
    'SR|-56.0|4.1|-55.17|5.85|Suriname|スリナム|Paramaribo|パラマリボ|Суринам|Surinamese',
    'SE|15.0|61.0|18.07|59.33|Sweden|スウェーデン|Stockholm|ストックホルム|Schweden;Suecia;Швеци|Swedish;Swedes;schwedisch;sueco;шведск',
    'CH|8.2|46.8|7.45|46.95|Switzerland|スイス|Bern|ベルン|Schweiz;Suiza;Швейцари|Swiss;schweizerisch;suizo;швейцарск',
    'SY|38.0|35.0|36.3|33.51|Syria|シリア|Damascus|ダマスカス|Syrien;Siria;Сири|Syrian;Syrians;syrisch;sirio;сирийск',
    'TW|121.0|23.7|121.56|25.03|Taiwan|台湾|Taipei|台北|Chinese Taipei;Republic of China;Тайван;中華民国|Taiwanese;taiwanesisch;тайваньск',
    'TJ|71.0|38.6|68.79|38.56|Tajikistan|タジキスタン|Dushanbe|ドゥシャンベ|Tadschikistan;Таджикистан|Tajik;tadschikisch',
    'TZ|34.9|-6.4|35.75|-6.16|Tanzania|タンザニア|Dodoma|ドドマ|Tansania;Танзани|Tanzanian;tansanisch;танзанийск',
    'TH|100.5|15.0|100.5|13.75|Thailand|タイ|Bangkok|バンコク|Tailandia;Таиланд|Thai;Thais;thailändisch;тайск',
    'TL|125.9|-8.8|125.57|-8.56|Timor-Leste|東ティモール|Dili|ディリ|East Timor;Восточный Тимор|Timorese',
    'TG|0.9|8.6|1.22|6.13|Togo|トーゴ|Lomé|ロメ|Того|Togolese',
    'TO|-175.2|-21.2|-175.2|-21.14|Tonga|トンガ|Nukuʻalofa|ヌクアロファ||Tongan',
    'TT|-61.3|10.5|-61.51|10.65|Trinidad and Tobago|トリニダード・トバゴ|Port of Spain|ポートオブスペイン|Тринидад|Trinidadian',
    'TN|9.6|34.1|10.18|36.81|Tunisia|チュニジア|Tunis|チュニス|Tunesien;Túnez;Тунис|Tunisian;Tunisians;tunesisch;тунисск',
    'TR|35.0|39.0|32.86|39.93|Turkey!|トルコ|Ankara|アンカラ|Türkiye;Turkei;Türkei;Turquía;Турци|Turkish;Turks;türkisch;turco;турецк',
    'TM|59.6|39.1|58.38|37.95|Turkmenistan|トルクメニスタン|Ashgabat|アシガバート|Туркмени|Turkmen;turkmenisch',
    'TV|179.2|-8.5|179.19|-8.52|Tuvalu|ツバル|Funafuti|フナフティ||Tuvaluan',
    'UG|32.4|1.4|32.58|0.35|Uganda|ウガンダ|Kampala|カンパラ|Уганд|Ugandan;ugandisch;угандийск',
    'UA|31.5|49.0|30.52|50.45|Ukraine|ウクライナ|Kyiv|キーウ|Ucrania;Украин;Україн|Ukrainian;Ukrainians;ukrainisch;ucraniano;украинск',
    'AE|54.0|24.0|54.37|24.45|United Arab Emirates|アラブ首長国連邦|Abu Dhabi|アブダビ|UAE;U.A.E.;Emirates;Vereinigte Arabische Emirate;Emiratos;ОАЭ;Эмират|Emirati;Emiratis;emiratisch',
    'GB|-1.5|53.0|-0.13|51.51|United Kingdom|イギリス|London|ロンドン|UK;U.K.;Britain;Great Britain;Großbritannien;Reino Unido;Великобритани;Британи;英国|British;Briton;Britons;britisch;británico;британск',
    'US|-98.0|39.5|-77.04|38.91|United States|アメリカ|Washington|ワシントンD.C.|USA;U.S.;U.S.A.;US;America;Vereinigte Staaten;Estados Unidos;EEUU;EE.UU.;США;米国;合衆国;アメリカ合衆国|American;Americans;US-amerikanisch;estadounidense;американск;米',
    'UY|-56.0|-32.8|-56.16|-34.9|Uruguay|ウルグアイ|Montevideo|モンテビデオ|Уругвай|Uruguayan;uruguayo;уругвайск',
    'UZ|64.6|41.4|69.24|41.31|Uzbekistan|ウズベキスタン|Tashkent|タシケント|Usbekistan;Узбекистан|Uzbek;usbekisch;узбекск',
    'VU|167.0|-16.0|168.32|-17.73|Vanuatu|バヌアツ|Port Vila|ポートビラ||Ni-Vanuatu',
    'VA|12.45|41.9|12.45|41.9|Vatican City|バチカン|Vatican City|バチカン市国|Holy See;Vatikan;Ватикан|Vatican',
    'VE|-66.0|8.0|-66.9|10.49|Venezuela|ベネズエラ|Caracas|カラカス|Венесуэл|Venezuelan;Venezuelans;venezolanisch;venezolano;венесуэльск',
    'VN|107.0|16.0|105.83|21.03|Vietnam|ベトナム|Hanoi|ハノイ|Viet Nam;Vietnam;Вьетнам|Vietnamese;vietnamesisch;вьетнамск',
    'YE|47.5|15.5|44.21|15.35|Yemen|イエメン|Sanaa|サヌア|Jemen;Йемен|Yemeni;Yemenis;jemenitisch;yemení;йеменск',
    'ZM|27.9|-13.5|28.28|-15.42|Zambia|ザンビア|Lusaka|ルサカ|Sambia;Замби|Zambian;sambisch;замбийск',
    'ZW|29.9|-19.0|31.05|-17.83|Zimbabwe|ジンバブエ|Harare|ハラレ|Simbabwe;Зимбабве|Zimbabwean;simbabwisch;зимбабвийск',
    'XK|20.9|42.6|21.17|42.67|Kosovo|コソボ|Pristina|プリシュティナ|Kosov;Косово|Kosovar;Kosovan;kosovarisch',
    'EU|10.0|50.0|4.35|50.85|European Union|欧州連合|Brussels|ブリュッセル|EU;E.U.;Europäische Union;Unión Europea;Евросоюз;欧州委員会;EU圏|European;europäisch;европейск'
  );

  /* Capital-name aliases the packed country row has no field for. iso2|alias;… */
  /* @i18n-entity-data  capital-name SPELLINGS a headline is matched against, packed as `iso2|alias;…`
     — not text the app writes. Translating them would break the matcher they exist for. (#R251) */
  var CAPALT = [
    'UA|Kiev;キエフ;Киев;Київ', 'YE|Sana’a;Sanaʽa;サナア;Сана', 'MM|Nay Pyi Taw;Naypyitaw',
    'CN|Peking;Пекин;北京市', 'JP|Tokio;Токио;東京都;Tôkyô', 'KR|Séoul;Сеул;서울;ソウル特別市',
    'RU|Moskau;Moscú;Москв;モスクワ市', 'FR|París;Париж', 'DE|Berlín;Берлин',
    'IT|Roma;Rom;Рим', 'ES|Madrid;Мадрид', 'GB|Londres;Лондон;倫敦', 'US|Washington DC;Washington, D.C.;Вашингтон;ワシントン',
    'TR|Ankara;Анкар', 'IR|Teheran;Teherán;Тегеран', 'IQ|Bagdad;Багдад', 'SY|Damaskus;Damasco;Дамаск',
    'IL|Jerusalén;Иерусалим;Yerushalayim;Al-Quds', 'EG|Kairo;El Cairo;Каир', 'IN|Delhi;デリー;Нью-Дели',
    'PK|Исламабад', 'ID|Джакарта', 'TH|Бангкок', 'VN|Ханой', 'PH|Манила', 'SA|Эр-Рияд', 'AE|Абу-Даби',
    'PL|Warschau;Varsovia;Варшав', 'CZ|Prag;Praga;Прага', 'HU|Будапешт', 'RO|Bukarest;Бухарест',
    'AT|Wien;Viena;Вена', 'NL|Ámsterdam;Амстердам', 'BE|Brüssel;Bruselas;Брюссель;ブリュッセル市',
    'SE|Stockholm;Estocolmo;Стокгольм', 'NO|Oslo;Осло', 'FI|Хельсинки', 'DK|Kopenhagen;Copenhague;Копенгаген',
    'GR|Athen;Atenas;Афин', 'PT|Lissabon;Lisboa;Лиссабон', 'CH|Berne;Берн', 'CA|Оттава',
    'MX|Ciudad de México;CDMX;Мехико', 'BR|Brasilia;Бразилиа', 'AR|Буэнос-Айрес', 'ZA|Претория',
    'NG|Абудж', 'KE|Найроби', 'ET|Аддис-Абеб', 'AF|Кабул', 'KP|Пхеньян', 'TW|Taipeh;Тайбэй;台北市',
    'CU|La Habana;Гаван', 'VE|Каракас', 'CO|Bogota;Богот', 'CL|Сантьяго', 'PE|Лима', 'MA|Рабат',
    'DZ|Argel;Алжир (город)', 'LY|Trípoli;Триполи', 'TN|Тунис (город)', 'SD|Хартум', 'SO|Могадишо',
    'SG|Сингапур (город)', 'MY|Куала-Лумпур', 'BD|Дакк', 'LK|Коломбо', 'NP|Катманду', 'KZ|Астан',
    'UZ|Ташкент', 'AZ|Баку', 'AM|Ереван', 'GE|Tiflis;Тбилиси', 'BY|Минск', 'MD|Кишинёв', 'RS|Белград',
    'HR|Загреб', 'BA|Сараев', 'AL|Тиран', 'BG|София', 'SK|Братислав', 'SI|Любляна', 'LT|Вильнюс',
    'LV|Рига', 'EE|Таллин', 'IE|Дублин', 'IS|Рейкьявик', 'NZ|Веллингтон', 'AU|Канберр'
  ];

  /* ---- PLACES : en|ja|iso2|a1|lng|lat|kind|rank|alt… ----
       kind: city | flashpoint | feature | seat.  A trailing "!" on the English
       name marks a COMMON-WORD place that needs corroboration to count. */
  PL.push(
    /* ---------- Israel / Palestine / Levant ---------- */
    'Gaza|ガザ|PS||34.47|31.5|flashpoint|9|Gaza Strip;Gazastreifen;Franja de Gaza;Газа;Сектор Газа;ガザ地区',
    'Rafah|ラファ|PS||34.25|31.29|flashpoint|8|Рафах',
    'Khan Younis|ハンユニス|PS||34.3|31.34|flashpoint|7|Khan Yunis;Chan Yunis',
    'Deir al-Balah|デイル・アル・バラハ|PS||34.35|31.42|flashpoint|5|Deir el-Balah',
    'Jabalia|ジャバリア|PS||34.48|31.53|flashpoint|5|Jabaliya',
    'Gaza City|ガザ市|PS||34.45|31.52|flashpoint|7|',
    'West Bank|ヨルダン川西岸|PS||35.3|31.95|flashpoint|8|Cisjordania;Westjordanland;Западный берег',
    'Jenin|ジェニン|PS||35.3|32.46|flashpoint|6|Дженин',
    'Hebron|ヘブロン|PS||35.1|31.53|flashpoint|6|Al-Khalil;Хеврон',
    'Nablus|ナブルス|PS||35.26|32.22|flashpoint|6|Наблус',
    'Bethlehem|ベツレヘム|PS||35.2|31.7|city|5|Belén;Вифлеем',
    'Tel Aviv|テルアビブ|IL||34.78|32.08|city|9|Tel Aviv-Yafo;Тель-Авив',
    'Haifa|ハイファ|IL||34.99|32.79|city|6|Хайфа',
    'Ashkelon|アシュケロン|IL||34.57|31.67|flashpoint|5|Ашкелон',
    'Ashdod|アシュドッド|IL||34.65|31.8|city|5|',
    'Beersheba|ベエルシェバ|IL||34.79|31.25|city|5|Beer Sheva',
    'Eilat|エイラート|IL||34.95|29.56|city|4|Эйлат',
    'Golan Heights|ゴラン高原|IL||35.74|32.95|flashpoint|6|Golan;Голанские высоты',
    'Sderot|スデロット|IL||34.6|31.52|flashpoint|4|',
    'Southern Lebanon|南レバノン|LB||35.4|33.2|flashpoint|6|South Lebanon;Südlibanon',
    'Tyre|ティール|LB||35.2|33.27|flashpoint|4|Sour',
    'Sidon|シドン|LB||35.38|33.56|city|4|Saida',
    'Tripoli (Lebanon)|トリポリ（レバノン）|LB||35.85|34.44|city|4|Tripoli',
    'Baalbek|バールベック|LB||36.21|34.0|flashpoint|4|',
    'Aleppo|アレッポ|SY||37.16|36.2|flashpoint|7|Alep;Алеппо',
    'Idlib|イドリブ|SY||36.63|35.93|flashpoint|6|Идлиб',
    'Homs|ホムス|SY||36.72|34.73|flashpoint|5|Хомс',
    'Hama|ハマ|SY||36.75|35.13|city|4|',
    'Latakia|ラタキア|SY||35.79|35.53|city|4|Латакия',
    'Raqqa|ラッカ|SY||38.99|35.95|flashpoint|5|Ar-Raqqah;Ракка',
    'Deir ez-Zor|デリゾール|SY||40.15|35.34|flashpoint|4|Deir el-Zor',
    'Palmyra|パルミラ|SY||38.28|34.55|flashpoint|4|Пальмира',
    /* ---------- Iraq / Iran / Gulf ---------- */
    'Mosul|モスル|IQ||43.13|36.34|flashpoint|6|Мосул',
    'Basra|バスラ|IQ||47.78|30.51|city|5|Basrah;Басра',
    'Erbil|アルビル|IQ||44.01|36.19|flashpoint|5|Irbil;Arbil;Эрбиль',
    'Kirkuk|キルクーク|IQ||44.39|35.47|flashpoint|5|Киркук',
    'Najaf|ナジャフ|IQ||44.33|31.99|city|4|',
    'Karbala|カルバラ|IQ||44.02|32.61|city|4|',
    'Fallujah|ファルージャ|IQ||43.78|33.35|flashpoint|4|',
    'Isfahan|イスファハン|IR||51.68|32.66|city|6|Esfahan;Исфахан',
    'Mashhad|マシュハド|IR||59.61|36.3|city|5|Мешхед',
    'Tabriz|タブリーズ|IR||46.29|38.08|city|5|Тебриз',
    'Shiraz|シーラーズ|IR||52.53|29.6|city|5|Шираз',
    'Bandar Abbas|バンダレ・アッバース|IR||56.28|27.19|flashpoint|4|',
    'Natanz|ナタンズ|IR||51.92|33.51|flashpoint|5|',
    'Fordow|フォルドゥ|IR||50.99|34.88|flashpoint|4|Fordo',
    'Bushehr|ブーシェフル|IR||50.84|28.92|flashpoint|4|',
    'Jeddah|ジッダ|SA||39.2|21.49|city|6|Jidda;Джидда',
    'Mecca|メッカ|SA||39.83|21.42|city|6|Makkah;La Meca;Мекка',
    'Medina|メディナ|SA||39.61|24.47|city|5|',
    'Dammam|ダンマーム|SA||50.1|26.43|city|4|',
    'Dhahran|ダーラン|SA||50.15|26.29|city|4|',
    'Neom|ネオム|SA||35.3|28.0|city|4|NEOM',
    'Dubai|ドバイ|AE||55.27|25.2|city|9|Dubái;Дубай;ドバイ首長国',
    'Sharjah|シャルジャ|AE||55.39|25.35|city|4|',
    'Muscat|マスカット|OM||58.41|23.59|city|5|',
    'Aden|アデン|YE||45.04|12.79|flashpoint|6|Аден',
    'Hodeidah|ホデイダ|YE||42.95|14.8|flashpoint|6|Al Hudaydah;Hudaydah;Ходейда',
    'Marib|マアリブ|YE||45.32|15.46|flashpoint|4|',
    /* ---------- Ukraine / Russia war ---------- */
    'Kharkiv|ハルキウ|UA||36.23|49.99|flashpoint|8|Kharkov;Charkiw;Харьков;Харків',
    'Odesa|オデーサ|UA||30.73|46.48|flashpoint|7|Odessa;Одесс;Одес',
    'Lviv|リヴィウ|UA||24.03|49.84|flashpoint|6|Lvov;Lemberg;Львов;Львів',
    'Dnipro|ドニプロ|UA||35.05|48.46|flashpoint|6|Dnipropetrovsk;Днепр',
    'Zaporizhzhia|ザポリージャ|UA||35.14|47.84|flashpoint|7|Zaporozhye;Запорожь;Запоріж',
    'Kherson|ヘルソン|UA||32.62|46.64|flashpoint|7|Херсон',
    'Mykolaiv|ミコライウ|UA||31.99|46.98|flashpoint|5|Nikolaev;Николаев',
    'Donetsk|ドネツク|UA||37.8|48.0|flashpoint|8|Донецк',
    'Luhansk|ルハンスク|UA||39.32|48.57|flashpoint|6|Lugansk;Луганск',
    'Mariupol|マリウポリ|UA||37.54|47.1|flashpoint|7|Мариуполь',
    'Bakhmut|バフムート|UA||38.0|48.59|flashpoint|7|Artemivsk;Бахмут',
    'Avdiivka|アウディーイウカ|UA||37.74|48.14|flashpoint|6|Авдеевка',
    'Pokrovsk|ポクロウシク|UA||37.18|48.28|flashpoint|6|Покровск',
    'Kramatorsk|クラマトルスク|UA||37.55|48.72|flashpoint|5|Краматорск',
    'Sloviansk|スロビャンスク|UA||37.6|48.85|flashpoint|4|Slavyansk',
    'Chasiv Yar|チャシウヤール|UA||37.83|48.59|flashpoint|4|',
    'Sumy|スームィ|UA||34.8|50.91|flashpoint|5|Сумы',
    'Chernihiv|チェルニヒウ|UA||31.29|51.49|flashpoint|4|Чернигов',
    'Vinnytsia|ヴィーンヌィツャ|UA||28.48|49.23|city|4|Винниц',
    'Kryvyi Rih|クルィヴィーイ・リーフ|UA||33.39|47.91|city|4|Кривой Рог',
    'Donbas|ドンバス|UA||37.8|48.3|flashpoint|7|Donbass;Донбасс',
    'Crimea|クリミア|UA||34.1|45.3|flashpoint|8|Krim;Crimea;Крым;Крим',
    'Sevastopol|セヴァストポリ|UA||33.52|44.6|flashpoint|6|Севастополь',
    'Simferopol|シンフェロポリ|UA||34.1|44.95|city|4|Симферополь',
    'Kerch Bridge|クリミア大橋|UA||36.5|45.31|flashpoint|5|Crimean Bridge;Керченский мост',
    'Belgorod|ベルゴロド|RU||36.59|50.6|flashpoint|6|Белгород',
    'Kursk|クルスク|RU||36.19|51.73|flashpoint|7|Курск',
    'Bryansk|ブリャンスク|RU||34.36|53.24|flashpoint|4|Брянск',
    'Rostov-on-Don|ロストフ・ナ・ドヌ|RU||39.72|47.24|city|5|Rostov;Ростов',
    'Saint Petersburg|サンクトペテルブルク|RU||30.36|59.93|city|8|St Petersburg;St. Petersburg;Sankt Petersburg;San Petersburgo;Петербург;Петерб',
    'Novosibirsk|ノヴォシビルスク|RU||82.93|55.03|city|5|Новосибирск',
    'Yekaterinburg|エカテリンブルク|RU||60.61|56.84|city|5|Ekaterinburg;Екатеринбург',
    'Kazan|カザン|RU||49.11|55.79|city|5|Казань',
    'Vladivostok|ウラジオストク|RU||131.89|43.12|city|5|Владивосток',
    'Sochi|ソチ|RU||39.73|43.6|city|4|Сочи',
    'Murmansk|ムルマンスク|RU||33.08|68.97|city|4|Мурманск',
    'Kaliningrad|カリーニングラード|RU||20.51|54.71|flashpoint|6|Königsberg;Калининград',
    'Chechnya|チェチェン|RU||45.7|43.4|flashpoint|5|Grozny;Chechen Republic;Чечн;Чечен',
    'Dagestan|ダゲスタン|RU||47.0|42.8|flashpoint|4|Дагестан',
    'Engels|エンゲルス|RU||46.12|51.48|flashpoint|4|Энгельс',
    'Transnistria|沿ドニエストル|MD||29.48|46.84|flashpoint|5|Transdniestria;Приднестровь',
    'Nagorno-Karabakh|ナゴルノ・カラバフ|AZ||46.75|39.82|flashpoint|6|Artsakh;Нагорный Карабах',
    'Suwalki Gap|スバウキ回廊|PL||23.1|54.1|flashpoint|4|Suwałki Gap',
    /* ---------- Europe ---------- */
    'Munich|ミュンヘン|DE|BY|11.58|48.14|city|7|München;Muenchen;Múnich;Мюнхен',
    'Hamburg|ハンブルク|DE|HH|9.99|53.55|city|6|Гамбург',
    'Frankfurt|フランクフルト|DE|HE|8.68|50.11|city|7|Frankfurt am Main;Франкфурт',
    'Cologne|ケルン|DE|NW|6.96|50.94|city|5|Köln;Colonia;Кёльн',
    'Düsseldorf|デュッセルドルフ|DE|NW|6.78|51.23|city|5|Duesseldorf;Dusseldorf;Дюссельдорф',
    'Stuttgart|シュツットガルト|DE|BW|9.18|48.78|city|5|Штутгарт',
    'Dresden|ドレスデン|DE|SN|13.74|51.05|city|4|Дрезден',
    'Leipzig|ライプツィヒ|DE|SN|12.37|51.34|city|4|Лейпциг',
    'Ramstein|ラムシュタイン|DE|RP|7.6|49.44|flashpoint|5|Ramstein Air Base',
    'Lyon|リヨン|FR||4.84|45.76|city|5|Лион',
    'Marseille|マルセイユ|FR||5.37|43.3|city|6|Marsella;Марсель',
    'Toulouse|トゥールーズ|FR||1.44|43.6|city|4|Тулуза',
    'Nice!|ニース|FR||7.27|43.7|city|5|Niza;Ницц',
    'Bordeaux|ボルドー|FR||-0.58|44.84|city|4|Бордо',
    'Strasbourg|ストラスブール|FR||7.75|48.58|city|6|Straßburg;Estrasburgo;Страсбург',
    'Calais|カレー|FR||1.86|50.95|city|4|',
    'Normandy|ノルマンディー|FR||0.1|49.2|feature|4|Normandie',
    'Milan|ミラノ|IT||9.19|45.46|city|7|Milano;Mailand;Милан',
    'Naples|ナポリ|IT||14.27|40.85|city|6|Napoli;Neapel;Nápoles;Неаполь',
    'Turin|トリノ|IT||7.69|45.07|city|5|Torino;Турин',
    'Venice|ヴェネツィア|IT||12.32|45.44|city|6|Venezia;Venedig;Venecia;Венеци',
    'Florence|フィレンツェ|IT||11.26|43.77|city|5|Firenze;Florenz;Флоренци',
    'Genoa|ジェノヴァ|IT||8.95|44.41|city|4|Genova;Génova',
    'Palermo|パレルモ|IT||13.36|38.12|city|4|Палермо',
    'Bologna|ボローニャ|IT||11.34|44.49|city|4|Болонь',
    'Lampedusa|ランペドゥーサ|IT||12.61|35.5|flashpoint|5|Лампедуза',
    'Barcelona|バルセロナ|ES||2.17|41.39|city|8|Barcelone;Барселон',
    'Valencia|バレンシア|ES||-0.38|39.47|city|5|València;Валенси',
    'Seville|セビリア|ES||-5.98|37.39|city|4|Sevilla;Севиль',
    'Bilbao|ビルバオ|ES||-2.93|43.26|city|4|Бильбао',
    'Catalonia|カタルーニャ|ES|CT|1.5|41.8|feature|5|Cataluña;Catalunya;Katalonien;Каталони',
    'Canary Islands|カナリア諸島|ES|CN|-15.6|28.1|feature|5|Islas Canarias;Kanarische Inseln;Канарские;Tenerife;Teneriffa;Gran Canaria;テネリフェ',
    'Porto|ポルト|PT||-8.61|41.15|city|4|Oporto;Порту',
    'Rotterdam|ロッテルダム|NL||4.48|51.92|city|5|Роттердам',
    'The Hague|ハーグ|NL||4.3|52.08|seat|8|Den Haag;La Haya;Гаага;デン・ハーグ',
    'Antwerp|アントワープ|BE||4.4|51.22|city|4|Antwerpen;Amberes;Антверпен',
    'Zurich|チューリッヒ|CH||8.54|47.37|city|6|Zürich;Цюрих',
    'Geneva|ジュネーブ|CH||6.14|46.2|seat|8|Genève;Genf;Ginebra;Женев',
    'Davos|ダボス|CH||9.83|46.8|seat|6|Давос',
    'Basel|バーゼル|CH||7.59|47.56|city|4|Basilea;Базель',
    'Salzburg|ザルツブルク|AT||13.05|47.81|city|4|Зальцбург',
    'Gothenburg|ヨーテボリ|SE||11.97|57.71|city|4|Göteborg;Гётеборг',
    'Malmö|マルメ|SE||13.0|55.6|city|4|Malmo',
    'Bergen|ベルゲン|NO||5.32|60.39|city|4|Берген',
    'Svalbard|スバールバル|NO||16.0|78.2|feature|4|Spitsbergen;Шпицберген',
    'Turku|トゥルク|FI||22.27|60.45|city|3|',
    'Gdansk|グダニスク|PL||18.65|54.35|city|4|Gdańsk;Danzig;Гданьск',
    'Krakow|クラクフ|PL||19.94|50.06|city|5|Kraków;Cracow;Krakau;Краков',
    'Rzeszow|ジェシュフ|PL||21.99|50.04|city|3|Rzeszów',
    'Brno|ブルノ|CZ||16.61|49.2|city|3|Брно',
    'Thessaloniki|テッサロニキ|GR||22.94|40.64|city|4|Salónica;Салоники',
    'Crete|クレタ島|GR||24.8|35.24|feature|4|Kreta;Creta;Крит',
    'Lesbos|レスボス島|GR||26.35|39.2|flashpoint|4|Lesvos;Лесбос',
    'Istanbul|イスタンブール|TR||28.98|41.01|city|9|Estambul;Стамбул;İstanbul',
    'Izmir|イズミル|TR||27.14|38.42|city|5|İzmir;Измир',
    'Antalya|アンタルヤ|TR||30.71|36.89|city|4|Анталь',
    'Gaziantep|ガジアンテップ|TR||37.38|37.07|flashpoint|5|Газиантеп',
    'Diyarbakir|ディヤルバクル|TR||40.23|37.91|flashpoint|4|Diyarbakır',
    'Incirlik|インジルリク|TR||35.42|37.0|flashpoint|4|Incirlik Air Base',
    'Bosphorus|ボスポラス海峡|TR||29.06|41.12|feature|6|Bosporus;Босфор',
    'Dardanelles|ダーダネルス海峡|TR||26.4|40.2|feature|4|Дарданеллы',
    'Manchester|マンチェスター|GB|ENG|-2.24|53.48|city|7|Манчестер',
    'Birmingham|バーミンガム|GB|ENG|-1.9|52.48|city|6|Бирмингем',
    'Liverpool|リヴァプール|GB|ENG|-2.99|53.41|city|6|Ливерпуль',
    'Leeds|リーズ|GB|ENG|-1.55|53.8|city|4|',
    'Glasgow|グラスゴー|GB|SCT|-4.25|55.86|city|5|Глазго',
    'Edinburgh|エディンバラ|GB|SCT|-3.19|55.95|city|6|Эдинбург',
    'Belfast|ベルファスト|GB|NIR|-5.93|54.6|city|6|Белфаст',
    'Cardiff|カーディフ|GB|WLS|-3.18|51.48|city|4|Кардифф',
    /* ⚠ (#R208) ENGLAND WAS THE ONE OF THE FOUR THAT WAS NOT HERE. Scotland, Wales and Northern
       Ireland have been curated since #R161 and England never was, so the app could not locate the
       most-named of them at all — and once the gazetteer went to cities1000 the only thing in the
       index answering to the name was England, ARKANSAS (population 2,791), which then out-scored
       Cambridge in 「Cambridge scientists in England publish fusion result」 on the labelled corpus.
       As an admin1 with the ENG code every English city already carries, the hierarchy rule
       absorbs it into the city instead of competing with it, which is the behaviour the other
       three have always had. */
    'England|イングランド|GB|ENG|-1.5|52.8|admin1|7|Inglaterra;Англи;イングランド地方',
    'Scotland|スコットランド|GB|SCT|-4.2|56.8|admin1|7|Schottland;Escocia;Шотланди;スコットランド地方',
    'Northern Ireland|北アイルランド|GB|NIR|-6.7|54.6|admin1|6|Nordirland;Северная Ирландия',
    'Wales|ウェールズ|GB|WLS|-3.8|52.3|admin1|5|Gales;Уэльс',
    'Dover|ドーバー|GB|ENG|1.31|51.13|city|4|Дувр',
    'Gibraltar|ジブラルタル|GB||-5.35|36.14|feature|5|Гибралтар',
    /* ---------- Asia-Pacific ---------- */
    'Shanghai|上海|CN|SH|121.47|31.23|city|9|Shanghái;Шанхай;上海市',
    'Guangzhou|広州|CN|GD|113.26|23.13|city|7|Cantón;Гуанчжоу;広州市',
    'Shenzhen|深圳|CN|GD|114.06|22.54|city|8|Шэньчжэнь;深セン',
    'Chengdu|成都|CN|SC|104.07|30.57|city|6|Чэнду',
    'Chongqing|重慶|CN|CQ|106.55|29.56|city|6|Чунцин',
    'Wuhan|武漢|CN|HB|114.3|30.59|city|7|Ухань',
    'Tianjin|天津|CN|TJ|117.2|39.13|city|5|Тяньцзинь',
    'Xian|西安|CN|SN|108.94|34.34|city|5|Xi’an;Сиань;西安市',
    'Hangzhou|杭州|CN|ZJ|120.16|30.27|city|5|Ханчжоу',
    'Nanjing|南京|CN|JS|118.8|32.06|city|5|Нанкин',
    'Qingdao|青島|CN|SD|120.38|36.07|city|4|Циндао',
    'Dalian|大連|CN|LN|121.62|38.91|city|4|Далянь',
    'Hong Kong|香港|CN|HK|114.16|22.28|city|9|Hongkong;Гонконг;ホンコン',
    'Macau|マカオ|CN|MO|113.54|22.19|city|5|Macao;Макао',
    'Xinjiang|新疆|CN|XJ|85.0|41.0|flashpoint|7|Uyghur;Uighur;Синьцзян;ウイグル',
    'Urumqi|ウルムチ|CN|XJ|87.62|43.83|flashpoint|5|Ürümqi;Урумчи',
    'Tibet|チベット|CN|XZ|88.0|31.5|flashpoint|7|Xizang;Tíbet;Тибет',
    'Lhasa|ラサ|CN|XZ|91.17|29.65|flashpoint|5|Лхаса',
    'Inner Mongolia|内モンゴル|CN|NM|112.0|43.0|admin1|4|Внутренняя Монголия',
    'Taiwan Strait|台湾海峡|TW||119.5|24.4|flashpoint|8|Taiwanstraße;Estrecho de Taiwán;Тайваньский пролив',
    'Kaohsiung|高雄|TW||120.31|22.63|city|5|Гаосюн',
    'Taichung|台中|TW||120.68|24.15|city|4|',
    'Hsinchu|新竹|TW||120.97|24.8|city|5|',
    'Kinmen|金門|TW||118.32|24.43|flashpoint|5|Quemoy;Цзиньмэнь',
    'Osaka|大阪|JP|27|135.5|34.69|city|8|Ōsaka;Осака;大阪市;大阪府',
    'Kyoto|京都|JP|26|135.77|35.01|city|7|Киото;京都市;京都府',
    'Yokohama|横浜|JP|14|139.64|35.44|city|6|Иокогама;横浜市',
    'Nagoya|名古屋|JP|23|136.91|35.18|city|6|Нагоя;名古屋市',
    'Sapporo|札幌|JP|1|141.35|43.06|city|5|Саппоро;札幌市',
    'Fukuoka|福岡|JP|40|130.4|33.59|city|5|Фукуока;福岡市;福岡県',
    'Kobe|神戸|JP|28|135.2|34.69|city|5|Кобе;神戸市',
    'Hiroshima|広島|JP|34|132.46|34.39|city|6|Хиросима;広島市;広島県',
    'Nagasaki|長崎|JP|42|129.87|32.75|city|5|Нагасаки;長崎市;長崎県',
    'Sendai|仙台|JP|4|140.87|38.27|city|4|仙台市',
    'Okinawa|沖縄|JP|47|127.68|26.21|flashpoint|7|Okinawa Prefecture;Окинава;沖縄県;那覇',
    'Fukushima|福島|JP|7|140.47|37.75|flashpoint|7|Фукусима;福島県;福島第一;フクシマ;福島原発',
    'Senkaku Islands|尖閣諸島|JP|47|123.47|25.74|flashpoint|6|Senkaku;Diaoyu;Diaoyutai;Сенкаку;尖閣',
    'Busan|釜山|KR||129.08|35.18|city|5|Pusan;Пусан;プサン',
    'Incheon|仁川|KR||126.7|37.46|city|4|Инчхон',
    'Gyeongju|慶州|KR||129.22|35.86|city|3|',
    'Panmunjom|板門店|KR||126.68|37.96|flashpoint|5|Panmunjeom;Пханмунджом',
    'Korean Demilitarized Zone|軍事境界線|KR||126.9|38.0|flashpoint|6|DMZ;Demilitarized Zone;非武装地帯',
    'Yongbyon|寧辺|KP||125.75|39.8|flashpoint|5|Nyongbyon',
    'Mumbai|ムンバイ|IN|MH|72.88|19.08|city|9|Bombay;Бомбей;ムンバイ市',
    'Bengaluru|ベンガルール|IN|KA|77.59|12.97|city|7|Bangalore;Бангалор',
    'Chennai|チェンナイ|IN|TN|80.27|13.08|city|6|Madras;Ченнаи',
    'Kolkata|コルカタ|IN|WB|88.36|22.57|city|7|Calcutta;Калькутта',
    'Hyderabad|ハイデラバード|IN|TG|78.47|17.38|city|6|Хайдарабад',
    'Ahmedabad|アーメダバード|IN|GJ|72.57|23.02|city|5|',
    'Pune|プネ|IN|MH|73.86|18.52|city|4|',
    'Jaipur|ジャイプル|IN|RJ|75.79|26.91|city|4|',
    'Lucknow|ラクナウ|IN|UP|80.95|26.85|city|4|',
    'Kashmir|カシミール|IN|JK|75.0|34.0|flashpoint|8|Cachemira;Kaschmir;Кашмир;カシミール地方',
    'Srinagar|スリナガル|IN|JK|74.8|34.08|flashpoint|6|Сринагар',
    'Ladakh|ラダック|IN|LA|77.6|34.2|flashpoint|5|Ладакх',
    'Manipur|マニプール|IN|MN|93.9|24.7|flashpoint|4|',
    'Karachi|カラチ|PK|SD|67.01|24.86|city|7|Карачи',
    'Lahore|ラホール|PK|PB|74.34|31.55|city|6|Лахор',
    'Peshawar|ペシャワル|PK|KP|71.58|34.02|flashpoint|5|Пешавар',
    'Quetta|クエッタ|PK|BA|67.0|30.18|flashpoint|4|Кветта',
    'Balochistan|バルチスタン|PK|BA|65.5|28.5|flashpoint|5|Baluchistan;Белуджистан',
    'Rawalpindi|ラワルピンディ|PK|PB|73.07|33.6|city|4|',
    'Kandahar|カンダハル|AF||65.71|31.61|flashpoint|6|Кандагар',
    'Herat|ヘラート|AF||62.2|34.35|flashpoint|4|Герат',
    'Jalalabad|ジャララバード|AF||70.44|34.42|flashpoint|4|',
    'Chittagong|チッタゴン|BD||91.83|22.36|city|4|Chattogram',
    'Cox’s Bazar|コックスバザール|BD||91.98|21.44|flashpoint|4|Coxs Bazar',
    'Ho Chi Minh City|ホーチミン|VN||106.66|10.82|city|7|Saigon;Ciudad Ho Chi Minh;Хошимин',
    'Da Nang|ダナン|VN||108.22|16.05|city|4|Дананг',
    'Haiphong|ハイフォン|VN||106.68|20.86|city|3|',
    'Chiang Mai|チェンマイ|TH||98.99|18.79|city|4|Чиангмай',
    'Phuket|プーケット|TH||98.4|7.88|city|4|Пхукет',
    'Mandalay|マンダレー|MM||96.08|21.97|flashpoint|5|Мандалай',
    'Yangon|ヤンゴン|MM||96.16|16.87|city|6|Rangoon;Rangún;Янгон',
    'Rakhine|ラカイン|MM||93.5|20.0|flashpoint|5|Arakan;Rohingya;ロヒンギャ',
    'Surabaya|スラバヤ|ID||112.75|-7.25|city|4|Сурабая',
    'Bali|バリ島|ID||115.19|-8.41|feature|6|Бали',
    'Medan|メダン|ID||98.67|3.59|city|4|',
    'Papua|パプア|ID||138.0|-4.0|flashpoint|4|West Papua;Западное Папуа',
    'Nusantara|ヌサンタラ|ID||116.8|-0.9|city|4|',
    'Penang|ペナン|MY||100.33|5.41|city|4|Пинанг',
    'Johor|ジョホール|MY||103.76|1.49|city|3|Johor Bahru',
    'Cebu|セブ|PH||123.89|10.32|city|4|Себу',
    'Davao|ダバオ|PH||125.61|7.07|city|4|Давао',
    'Mindanao|ミンダナオ|PH||125.0|7.5|flashpoint|4|Минданао',
    'Second Thomas Shoal|セカンド・トーマス礁|PH||115.86|9.72|flashpoint|5|Ayungin Shoal;Ren’ai Jiao',
    'Scarborough Shoal|スカボロー礁|PH||117.76|15.15|flashpoint|5|Huangyan;Панатаг',
    'Sydney|シドニー|AU|NSW|151.21|-33.87|city|8|Сидней;シドニー市',
    'Melbourne|メルボルン|AU|VIC|144.96|-37.81|city|7|Мельбурн',
    'Brisbane|ブリスベン|AU|QLD|153.03|-27.47|city|5|Брисбен',
    'Perth|パース|AU|WA|115.86|-31.95|city|5|Перт',
    'Adelaide|アデレード|AU|SA|138.6|-34.93|city|4|Аделаида',
    'Darwin|ダーウィン|AU|NT|130.84|-12.46|city|4|Дарвин',
    'Auckland|オークランド|NZ||174.76|-36.85|city|6|Окленд',
    'Christchurch|クライストチャーチ|NZ||172.64|-43.53|city|4|Крайстчерч',
    /* ---------- Americas ---------- */
    'New York|ニューヨーク|US|NY|-74.0|40.71|city|9|New York City;NYC;Nueva York;Нью-Йорк;ニューヨーク市',
    'Los Angeles|ロサンゼルス|US|CA|-118.24|34.05|city|9|LA;Лос-Анджелес',
    'Chicago|シカゴ|US|IL|-87.63|41.88|city|8|Чикаго',
    'Houston|ヒューストン|US|TX|-95.37|29.76|city|7|Хьюстон',
    'Phoenix|フェニックス|US|AZ|-112.07|33.45|city|6|Финикс',
    'Philadelphia|フィラデルフィア|US|PA|-75.17|39.95|city|6|Филадельфия',
    'San Antonio|サンアントニオ|US|TX|-98.49|29.42|city|5|',
    'San Diego|サンディエゴ|US|CA|-117.16|32.72|city|6|Сан-Диего',
    'Dallas|ダラス|US|TX|-96.8|32.78|city|6|Даллас',
    'San Francisco|サンフランシスコ|US|CA|-122.42|37.77|city|8|Сан-Франциско',
    'Austin|オースティン|US|TX|-97.74|30.27|city|6|Остин',
    'Seattle|シアトル|US|WA|-122.33|47.61|city|7|Сиэтл',
    'Denver|デンバー|US|CO|-104.99|39.74|city|5|Денвер',
    'Boston|ボストン|US|MA|-71.06|42.36|city|7|Бостон',
    'Atlanta|アトランタ|US|GA|-84.39|33.75|city|6|Атланта',
    'Miami|マイアミ|US|FL|-80.19|25.76|city|7|Майами',
    'Detroit|デトロイト|US|MI|-83.05|42.33|city|5|Детройт',
    'Minneapolis|ミネアポリス|US|MN|-93.27|44.98|city|5|Миннеаполис',
    'Las Vegas|ラスベガス|US|NV|-115.14|36.17|city|6|Лас-Вегас',
    'Portland|ポートランド|US|OR|-122.68|45.52|city|5|Портленд',
    'New Orleans|ニューオーリンズ|US|LA|-90.07|29.95|city|5|Новый Орлеан',
    'Baltimore|ボルチモア|US|MD|-76.61|39.29|city|5|Балтимор',
    'Nashville|ナッシュビル|US|TN|-86.78|36.16|city|4|',
    'Cleveland|クリーブランド|US|OH|-81.69|41.5|city|4|Кливленд',
    'Pittsburgh|ピッツバーグ|US|PA|-79.99|40.44|city|4|Питтсбург',
    'St. Louis|セントルイス|US|MO|-90.2|38.63|city|4|St Louis;Saint Louis',
    'Kansas City|カンザスシティ|US|MO|-94.58|39.1|city|4|',
    'Sacramento|サクラメント|US|CA|-121.49|38.58|city|4|Сакраменто',
    'Milwaukee|ミルウォーキー|US|WI|-87.91|43.04|city|4|',
    'Charlotte|シャーロット|US|NC|-80.84|35.23|city|4|',
    'Salt Lake City|ソルトレイクシティ|US|UT|-111.89|40.76|city|4|',
    'Anchorage|アンカレッジ|US|AK|-149.9|61.22|city|4|Анкоридж',
    'Honolulu|ホノルル|US|HI|-157.86|21.31|city|5|Гонолулу',
    'Buffalo|バッファロー|US|NY|-78.88|42.89|city|3|',
    'Uvalde|ユバルデ|US|TX|-99.79|29.21|city|3|',
    'Silicon Valley|シリコンバレー|US|CA|-122.05|37.37|seat|8|Силиконовая долина',
    'Cupertino|クパチーノ|US|CA|-122.03|37.32|city|4|',
    'Mountain View|マウンテンビュー|US|CA|-122.08|37.39|city|4|',
    'Redmond|レドモンド|US|WA|-122.12|47.67|city|4|',
    'Palo Alto|パロアルト|US|CA|-122.14|37.44|city|4|',
    'Santa Clara|サンタクララ|US|CA|-121.96|37.35|city|4|',
    'Toronto|トロント|CA|ON|-79.38|43.65|city|8|Торонто',
    'Montreal|モントリオール|CA|QC|-73.57|45.5|city|7|Montréal;Монреаль',
    'Vancouver|バンクーバー|CA|BC|-123.12|49.28|city|7|Ванкувер',
    'Calgary|カルガリー|CA|AB|-114.07|51.05|city|5|Калгари',
    'Edmonton|エドモントン|CA|AB|-113.49|53.55|city|4|Эдмонтон',
    'Quebec|ケベック|CA|QC|-71.21|46.81|admin1|6|Québec;Quebec City;Квебек',
    'Guadalajara|グアダラハラ|MX||-103.35|20.67|city|5|Гвадалахара',
    'Monterrey|モンテレイ|MX||-100.32|25.69|city|5|Монтеррей',
    'Tijuana|ティファナ|MX||-117.04|32.51|flashpoint|6|Тихуана',
    'Ciudad Juárez|シウダー・フアレス|MX||-106.49|31.74|flashpoint|5|Ciudad Juarez;Juárez',
    'Acapulco|アカプルコ|MX||-99.88|16.86|city|4|Акапулько',
    'Cancún|カンクン|MX||-86.85|21.16|city|4|Cancun;Канкун',
    'Sinaloa|シナロア|MX||-107.5|25.0|flashpoint|4|Синалоа',
    'São Paulo|サンパウロ|BR|SP|-46.63|-23.55|city|9|Sao Paulo;Сан-Паулу',
    'Rio de Janeiro|リオデジャネイロ|BR|RJ|-43.2|-22.91|city|8|Rio;Río de Janeiro;Рио-де-Жанейро',
    'Belo Horizonte|ベロオリゾンテ|BR|MG|-43.94|-19.92|city|4|',
    'Salvador|サルバドール|BR|BA|-38.5|-12.97|city|4|',
    'Manaus|マナウス|BR|AM|-60.02|-3.12|city|4|Манаус',
    'Amazon|アマゾン|BR|AM|-60.0|-4.0|feature|7|Amazonia;Amazonas;Amazon rainforest;Амазон;アマゾン熱帯雨林',
    'Medellín|メデジン|CO||-75.56|6.25|city|5|Medellin;Медельин',
    'Cali|カリ|CO||-76.52|3.44|city|4|',
    'Guayaquil|グアヤキル|EC||-79.89|-2.19|city|4|Гуаякиль',
    'Córdoba|コルドバ|AR||-64.18|-31.42|city|4|Cordoba',
    'Rosario|ロサリオ|AR||-60.64|-32.95|city|4|',
    'Patagonia|パタゴニア|AR||-69.0|-45.0|feature|4|Патагони',
    'Valparaíso|バルパライソ|CL||-71.62|-33.05|city|3|Valparaiso',
    'Antofagasta|アントファガスタ|CL||-70.4|-23.65|city|3|',
    'Cusco|クスコ|PE||-71.97|-13.53|city|3|Cuzco',
    'Maracaibo|マラカイボ|VE||-71.61|10.65|city|4|Маракайбо',
    'Essequibo|エセキボ|GY||-59.5|5.5|flashpoint|5|Esequibo;Гайана-Эссекибо',
    'Guantanamo Bay|グアンタナモ|CU||-75.09|19.9|flashpoint|6|Guantánamo;Гуантанамо',
    'Puerto Rico|プエルトリコ|US|PR|-66.5|18.2|admin1|6|Пуэрто-Рико;サンフアン',
    /* ---------- Africa ---------- */
    'Lagos|ラゴス|NG||3.38|6.52|city|7|Лагос',
    'Kano|カノ|NG||8.52|12.0|city|4|Кано',
    'Port Harcourt|ポートハーコート|NG||7.01|4.82|city|4|',
    'Alexandria|アレクサンドリア|EG||29.92|31.2|city|6|Alejandría;Александри',
    'Sharm el-Sheikh|シャルム・エル・シェイク|EG||34.33|27.92|city|4|Sharm El Sheikh',
    'Rafah Crossing|ラファ検問所|EG||34.26|31.25|flashpoint|5|',
    'Suez Canal|スエズ運河|EG||32.35|30.7|feature|7|Suezkanal;Canal de Suez;Суэцкий канал',
    'Casablanca|カサブランカ|MA||-7.59|33.57|city|6|Касабланка',
    'Marrakesh|マラケシュ|MA||-8.0|31.63|city|4|Marrakech;Марракеш',
    'Tangier|タンジール|MA||-5.83|35.76|city|4|Tánger;Танжер',
    'Western Sahara|西サハラ|MA||-13.0|24.5|flashpoint|5|Sahara Occidental;Западная Сахара',
    'Benghazi|ベンガジ|LY||20.07|32.12|flashpoint|6|Бенгази',
    'Misrata|ミスラタ|LY||15.09|32.38|flashpoint|4|Misurata',
    'Derna|デルナ|LY||22.64|32.77|flashpoint|4|Дерна',
    'El Fasher|エルファシル|SD||25.35|13.63|flashpoint|6|Al-Fashir;El-Fasher;Эль-Фашир',
    'Darfur|ダルフール|SD||24.0|13.5|flashpoint|7|Дарфур',
    'Omdurman|オムドゥルマン|SD||32.48|15.64|flashpoint|5|Омдурман',
    'Port Sudan|ポートスーダン|SD||37.22|19.62|flashpoint|5|Порт-Судан',
    'Nyala|ニャラ|SD||24.88|12.05|flashpoint|4|',
    'Tigray|ティグレ|ET||38.5|14.0|flashpoint|6|Tigré;Тыграй',
    'Amhara|アムハラ|ET||38.0|11.5|flashpoint|4|',
    'Mekelle|メケレ|ET||39.48|13.5|flashpoint|4|Mekele',
    'Goma|ゴマ|CD||29.22|-1.68|flashpoint|6|Гома',
    'Bukavu|ブカブ|CD||28.85|-2.51|flashpoint|5|',
    'North Kivu|北キブ|CD||29.0|-0.7|flashpoint|5|Nord-Kivu;Северное Киву',
    'Lubumbashi|ルブンバシ|CD||27.48|-11.66|city|4|',
    'Mombasa|モンバサ|KE||39.67|-4.05|city|4|Момбаса',
    'Zanzibar|ザンジバル|TZ||39.2|-6.16|city|4|Занзибар',
    'Dar es Salaam|ダルエスサラーム|TZ||39.28|-6.79|city|5|Дар-эс-Салам',
    'Cape Town|ケープタウン|ZA|WC|18.42|-33.92|city|8|Kapstadt;Ciudad del Cabo;Кейптаун',
    'Johannesburg|ヨハネスブルグ|ZA|GP|28.05|-26.2|city|7|Йоханнесбург',
    'Durban|ダーバン|ZA|KZN|31.02|-29.86|city|4|Дурбан',
    'Timbuktu|トンブクトゥ|ML||-3.0|16.77|flashpoint|4|Tombouctou',
    'Gao|ガオ|ML||-0.04|16.27|flashpoint|4|',
    'Sahel|サヘル|ML||3.0|15.5|feature|7|Sahelzone;Сахель;サヘル地域',
    'Lake Chad|チャド湖|TD||14.5|13.0|feature|4|Tschadsee;Озеро Чад',
    'Sahara|サハラ砂漠|DZ||2.0|23.0|feature|5|Sahara Desert;Сахар',
    'Kivu|キブ|CD||29.0|-2.0|flashpoint|4|',
    'Abidjan|アビジャン|CI||-4.03|5.35|city|5|Абиджан',
    'Accra|アクラ|GH||-0.19|5.6|city|5|Аккра',
    /* ---------- Straits, seas, features, shared flashpoints ---------- */
    'Strait of Hormuz|ホルムズ海峡|IR||56.5|26.6|feature|8|Hormuz;Straße von Hormus;Estrecho de Ormuz;Ормузский пролив',
    'Red Sea|紅海|YE||38.0|20.0|feature|8|Rotes Meer;Mar Rojo;Красное море',
    'Bab el-Mandeb|バブ・エル・マンデブ海峡|YE||43.33|12.58|feature|7|Bab al-Mandab;Баб-эль-Мандеб',
    'Gulf of Aden|アデン湾|YE||47.0|12.5|feature|5|Golfo de Adén;Аденский залив',
    'South China Sea|南シナ海|CN||114.0|14.0|flashpoint|8|Südchinesisches Meer;Mar de China Meridional;Южно-Китайское море',
    'East China Sea|東シナ海|CN||125.0|29.0|flashpoint|6|Ostchinesisches Meer;Восточно-Китайское море',
    'Sea of Japan|日本海|JP||135.0|39.0|feature|5|East Sea;Японское море',
    'Yellow Sea|黄海|CN||123.0|36.0|feature|4|Жёлтое море',
    'Spratly Islands|南沙諸島|PH||114.0|10.0|flashpoint|6|Spratlys;Nansha;Спратли;スプラトリー',
    'Paracel Islands|西沙諸島|CN||112.0|16.5|flashpoint|4|Paracels;Xisha',
    'Black Sea|黒海|UA||34.0|43.5|flashpoint|7|Schwarzes Meer;Mar Negro;Чёрное море',
    'Sea of Azov|アゾフ海|UA||36.5|46.0|flashpoint|5|Азовское море',
    'Baltic Sea|バルト海|SE||19.0|58.0|feature|6|Ostsee;Mar Báltico;Балтийское море',
    'Mediterranean|地中海|IT||16.0|35.0|feature|6|Mediterranean Sea;Mittelmeer;Mediterráneo;Средиземное море',
    'Arctic|北極|NO||10.0|82.0|feature|5|Arctic Ocean;Arktis;Ártico;Арктик;北極海',
    'Antarctica|南極|AQ||0.0|-82.0|feature|5|Antarktis;Antártida;Антарктид;南極大陸',
    'Panama Canal|パナマ運河|PA||-79.68|9.08|feature|7|Panamakanal;Canal de Panamá;Панамский канал',
    'English Channel|イギリス海峡|GB||-1.0|50.2|feature|5|La Manche;Ärmelkanal;Ла-Манш',
    'Persian Gulf|ペルシャ湾|IR||51.5|27.0|feature|6|Arabian Gulf;Persischer Golf;Golfo Pérsico;Персидский залив',
    'Taiwan Strait crossing|台湾海峡通過|TW||119.5|24.4|feature|3|',
    'Himalayas|ヒマラヤ|NP||84.0|28.5|feature|4|Himalaya;Гималаи',
    'Kuril Islands|千島列島|RU||147.0|45.5|flashpoint|5|Kurils;Northern Territories;Курильские;北方領土',
    'Diego Garcia|ディエゴガルシア|GB||72.42|-7.31|flashpoint|4|Диего-Гарсия',
    'Falkland Islands|フォークランド諸島|GB||-59.0|-51.7|flashpoint|5|Falklands;Malvinas;Фолклендские',
    'Cyprus buffer zone|キプロス緩衝地帯|CY||33.3|35.1|flashpoint|3|',
    /* ---------- Seats of power / landmark metonyms ---------- */
    'White House|ホワイトハウス|US|DC|-77.04|38.9|seat|9|Casa Blanca;Weißes Haus;Белый дом',
    'Pentagon|ペンタゴン|US|VA|-77.06|38.87|seat|8|Pentágono;Department of Defense;Department of War;Пентагон;国防総省',
    'Capitol Hill|連邦議会議事堂|US|DC|-77.01|38.89|seat|7|US Capitol;Capitol;Капитолий',
    'Wall Street|ウォール街|US|NY|-74.01|40.71|seat|8|Wall St;Уолл-стрит;ウォールストリート',
    'Langley|ラングレー|US|VA|-77.15|38.95|seat|5|CIA headquarters',
    'Mar-a-Lago|マールアラーゴ|US|FL|-80.04|26.68|seat|5|',
    'Camp David|キャンプデービッド|US|MD|-77.47|39.65|seat|4|',
    'Kremlin|クレムリン|RU||37.62|55.75|seat|9|Kreml;Кремль',
    'Downing Street|ダウニング街|GB|ENG|-0.13|51.5|seat|8|Number 10;No 10;Даунинг-стрит',
    'Westminster|ウェストミンスター|GB|ENG|-0.12|51.5|seat|6|Вестминстер',
    'Élysée|エリゼ宮|FR||2.32|48.87|seat|6|Elysee;Elysée Palace;Елисейский',
    'Zhongnanhai|中南海|CN|BJ|116.38|39.91|seat|6|Чжуннаньхай',
    'Kasumigaseki|霞が関|JP|13|139.75|35.67|seat|5|霞ヶ関',
    'Nagatacho|永田町|JP|13|139.74|35.68|seat|5|永田町地区',
    'Berlaymont|ベルレモン|BE||4.38|50.84|seat|5|European Commission headquarters',
    'Vatican|バチカン|VA||12.45|41.9|seat|7|Holy See;Vatikan;Ватикан;ローマ教皇庁',
    'Bundestag|連邦議会|DE|BE|13.38|52.52|seat|5|Reichstag;Бундестаг',
    'Knesset|クネセト|IL||35.21|31.78|seat|5|Кнессет',
    'Kaaba|カアバ|SA||39.83|21.42|seat|4|',
    'Chernobyl|チェルノブイリ|UA||30.1|51.39|flashpoint|6|Chornobyl;Tschernobyl;Чернобыл',
    'Three Mile Island|スリーマイル島|US|PA|-76.72|40.15|seat|4|',
    /* ---------- Same-name pairs. These exist SO THAT the resolver has real
                  alternatives to choose between; without them an ambiguous
                  surface would silently collapse onto one arbitrary place. --- */
    'Springfield|スプリングフィールド|US|IL|-89.65|39.8|city|4|', 'Springfield (MO)|スプリングフィールド（ミズーリ）|US|MO|-93.29|37.21|city|3|Springfield',
    'Springfield (MA)|スプリングフィールド（マサチューセッツ）|US|MA|-72.59|42.1|city|3|Springfield',
    'Cambridge|ケンブリッジ|GB|ENG|0.12|52.21|city|5|Кембридж', 'Cambridge (MA)|ケンブリッジ（マサチューセッツ）|US|MA|-71.11|42.37|city|4|Cambridge',
    'Vancouver (WA)|バンクーバー（ワシントン州）|US|WA|-122.67|45.63|city|2|Vancouver',
    'San José|サンノゼ|US|CA|-121.89|37.34|city|6|San Jose;Сан-Хосе',
    'Córdoba (Spain)|コルドバ（スペイン）|ES||-4.78|37.89|city|3|Córdoba;Cordoba',
    'Santiago de Compostela|サンティアゴ・デ・コンポステーラ|ES||-8.54|42.88|city|3|Santiago de Compostela',
    'Valencia (Venezuela)|バレンシア（ベネズエラ）|VE||-68.0|10.16|city|3|Valencia',
    'Toledo (Ohio)|トレド（オハイオ）|US|OH|-83.55|41.65|city|3|Toledo', 'Toledo|トレド|ES||-4.02|39.86|city|3|',
    'Odessa (Texas)|オデッサ（テキサス）|US|TX|-102.37|31.85|city|2|Odessa',
    'Birmingham (Alabama)|バーミングハム（アラバマ）|US|AL|-86.8|33.52|city|4|Birmingham',
    'Manchester (New Hampshire)|マンチェスター（ニューハンプシャー）|US|NH|-71.45|42.99|city|2|Manchester',
    'Perth (Scotland)|パース（スコットランド）|GB|SCT|-3.44|56.4|city|2|Perth',
    'Alexandria (Virginia)|アレクサンドリア（バージニア）|US|VA|-77.05|38.8|city|3|Alexandria',
    'Kingston (Ontario)|キングストン（オンタリオ）|CA|ON|-76.48|44.23|city|2|Kingston',
    'Richmond|リッチモンド|US|VA|-77.44|37.54|city|4|Ричмонд',
    'Newcastle|ニューカッスル|GB|ENG|-1.61|54.98|city|5|Newcastle upon Tyne',
    'Hamilton (Ontario)|ハミルトン（オンタリオ）|CA|ON|-79.87|43.26|city|3|Hamilton',
    'Naples (Florida)|ネープルズ（フロリダ）|US|FL|-81.79|26.14|city|2|Naples',
    'Athens (Georgia)|アセンズ（ジョージア州）|US|GA|-83.38|33.96|city|2|Athens',
    'Berlin (New Hampshire)|バーリン（ニューハンプシャー）|US|NH|-71.19|44.47|city|1|Berlin',
    'Moscow (Idaho)|モスクワ（アイダホ）|US|ID|-117.0|46.73|city|1|Moscow',
    'Dublin (Ohio)|ダブリン（オハイオ）|US|OH|-83.11|40.1|city|1|Dublin',
    'Tripoli (Greece)|トリポリ（ギリシャ）|GR||22.38|37.51|city|1|Tripoli',
    'Lima (Ohio)|ライマ（オハイオ）|US|OH|-84.1|40.74|city|1|Lima',
    'Guadalupe|グアダルーペ|MX||-100.25|25.68|city|1|',
    /* ---------- Remaining high-frequency metros ---------- */
    'Columbus|コロンバス|US|OH|-82.99|39.96|city|4|', 'Indianapolis|インディアナポリス|US|IN|-86.16|39.77|city|4|',
    'Jacksonville|ジャクソンビル|US|FL|-81.66|30.33|city|3|', 'Memphis|メンフィス|US|TN|-90.05|35.15|city|4|',
    'Louisville|ルイビル|US|KY|-85.76|38.25|city|3|', 'Oklahoma City|オクラホマシティ|US|OK|-97.52|35.47|city|3|',
    'Tucson|ツーソン|US|AZ|-110.93|32.22|city|3|', 'Fresno|フレズノ|US|CA|-119.79|36.75|city|3|',
    'Omaha|オマハ|US|NE|-95.94|41.26|city|3|', 'Raleigh|ローリー|US|NC|-78.64|35.78|city|3|',
    'Tampa|タンパ|US|FL|-82.46|27.95|city|3|', 'Orlando|オーランド|US|FL|-81.38|28.54|city|4|',
    'El Paso|エルパソ|US|TX|-106.49|31.76|city|4|', 'Newark|ニューアーク|US|NJ|-74.17|40.74|city|3|',
    'Hartford|ハートフォード|US|CT|-72.68|41.76|city|2|',
    'Guangzhou Baiyun|広州白雲|CN|GD|113.3|23.39|city|1|',
    'Suzhou|蘇州|CN|JS|120.62|31.3|city|4|', 'Shenyang|瀋陽|CN|LN|123.43|41.8|city|4|',
    'Harbin|ハルビン|CN|HL|126.53|45.8|city|4|Харбин', 'Kunming|昆明|CN|YN|102.83|24.88|city|3|',
    'Xiamen|厦門|CN|FJ|118.09|24.48|city|3|', 'Zhengzhou|鄭州|CN|HA|113.63|34.75|city|3|',
    'Kawasaki|川崎|JP|14|139.7|35.53|city|3|', 'Saitama|さいたま|JP|11|139.66|35.86|city|3|',
    'Chiba|千葉|JP|12|140.12|35.6|city|3|', 'Kitakyushu|北九州|JP|40|130.87|33.88|city|3|',
    'Naha|那覇|JP|47|127.68|26.21|city|4|', 'Kanazawa|金沢|JP|17|136.63|36.59|city|3|',
    'Noto|能登|JP|17|136.9|37.3|flashpoint|4|能登半島',
    'Daegu|大邱|KR||128.6|35.87|city|3|', 'Gwangju|光州|KR||126.85|35.16|city|3|',
    'Surat|スーラト|IN|GJ|72.83|21.17|city|3|', 'Kanpur|カーンプル|IN|UP|80.35|26.45|city|3|',
    'Nagpur|ナーグプル|IN|MH|79.09|21.15|city|3|', 'Varanasi|バラナシ|IN|UP|82.97|25.32|city|3|',
    'Multan|ムルターン|PK|PB|71.52|30.2|city|3|', 'Faisalabad|ファイサラーバード|PK|PB|73.09|31.42|city|3|',
    'Aleppo countryside|アレッポ郊外|SY||37.0|36.3|flashpoint|1|',
    'Rostock|ロストック|DE|MV|12.14|54.09|city|2|', 'Nuremberg|ニュルンベルク|DE|BY|11.08|49.45|city|3|Nürnberg',
    'Bilbao port|ビルバオ港|ES||-3.03|43.35|city|1|',
    'Porto Alegre|ポルトアレグレ|BR|RS|-51.23|-30.03|city|4|', 'Recife|レシフェ|BR|PE|-34.88|-8.05|city|3|',
    'Fortaleza|フォルタレザ|BR|CE|-38.54|-3.72|city|3|', 'Curitiba|クリチバ|BR|PR|-49.27|-25.43|city|3|',
    'Brasilia federal district|連邦直轄区|BR|DF|-47.88|-15.79|city|1|',
    'Rosario port|ロサリオ港|AR||-60.7|-32.94|city|1|',
    'Kigali|キガリ|RW||30.06|-1.94|city|4|', 'Kampala|カンパラ|UG||32.58|0.35|city|4|',
    'Bujumbura|ブジュンブラ|BI||29.36|-3.38|city|3|', 'Juba|ジュバ|SS||31.58|4.85|city|4|',
    'Aswan|アスワン|EG||32.9|24.09|city|2|', 'Luxor|ルクソール|EG||32.64|25.69|city|2|',
    'Bengasi port|ベンガジ港|LY||20.05|32.11|city|1|',
    /* ---------- Macro-regions. Coarse, but a real answer beats "unknown":
                  a story about "Europe" or "the Middle East" IS about a place. */
    'Europe|ヨーロッパ|||15.0|50.0|feature|6|Europa;Европ;欧州;西欧;東欧',
    'Middle East|中東|||43.0|30.0|feature|7|Naher Osten;Oriente Medio;Ближний Восток',
    'Africa|アフリカ|||20.0|3.0|feature|5|Afrika;África;Африк',
    'Asia|アジア|||95.0|30.0|feature|5|Asien;Азия;アジア地域',
    'Southeast Asia|東南アジア|||110.0|8.0|feature|5|Südostasien;Sudeste Asiático;Юго-Восточная Азия',
    'Central Asia|中央アジア|||65.0|43.0|feature|4|Zentralasien;Центральная Азия',
    'South Asia|南アジア|||78.0|22.0|feature|4|Südasien;Южная Азия',
    'Latin America|中南米|||-60.0|-15.0|feature|5|Lateinamerika;América Latina;Латинская Америка;ラテンアメリカ',
    'South America|南米|||-60.0|-15.0|feature|4|Südamerika;Sudamérica;Южная Америка',
    'North America|北米|||-100.0|45.0|feature|4|Nordamerika;Norteamérica;Северная Америка',
    'Caribbean|カリブ海|||-73.0|17.0|feature|4|Karibik;Caribe;Кариб',
    'Balkans|バルカン半島|||20.0|43.0|feature|5|Balkan;Balcanes;Балкан',
    'Caucasus|コーカサス|||44.0|42.0|feature|5|Kaukasus;Cáucaso;Кавказ;カフカス',
    'Scandinavia|スカンジナビア|||15.0|62.0|feature|4|Skandinavien;Escandinavia;Скандинав;北欧',
    'Baltic states|バルト三国|||24.5|57.0|feature|4|Baltikum;Bálticos;Прибалтик',
    'Horn of Africa|アフリカの角|||45.0|8.0|feature|4|Horn von Afrika;Cuerno de África',
    'West Africa|西アフリカ|||-2.0|10.0|feature|4|Westafrika;África Occidental;Западная Африка',
    'East Africa|東アフリカ|||37.0|0.0|feature|4|Ostafrika;Восточная Африка',
    'North Africa|北アフリカ|||15.0|28.0|feature|4|Nordafrika;Северная Африка;マグレブ;Maghreb',
    'Levant|レバント|||36.0|33.5|feature|4|Levante',
    'Gulf region|湾岸|||51.0|26.0|feature|5|the Gulf;Golfregion;Golfo Pérsico region;湾岸諸国',
    'Indo-Pacific|インド太平洋|||100.0|0.0|feature|5|Indopazifik;Индо-Тихоокеан',
    'Pacific|太平洋|||-160.0|0.0|feature|3|Pazifik;Pacífico;Тихий океан',
    'Arctic Council region|北極圏|||0.0|80.0|feature|2|',
    /* ---------- Landmarks that headlines name instead of the city ---------- */
    'Mount Fuji|富士山|JP|19|138.73|35.36|feature|5|Fuji;Фудзи',
    'Mount Everest|エベレスト|NP||86.93|27.99|feature|4|Everest;Эверест',
    'Kilimanjaro|キリマンジャロ|TZ||37.35|-3.07|feature|3|',
    'Mount Etna|エトナ山|IT||14.99|37.75|feature|4|Etna;Ätna;Этна',
    'Vesuvius|ベスビオ山|IT||14.43|40.82|feature|3|Vesuv;Везувий',
    'Pompeii|ポンペイ|IT||14.49|40.75|feature|3|Pompeji;Pompeya;Помпе',
    'Giza|ギザ|EG||31.13|29.98|feature|4|Pyramids of Giza;ピラミッド',
    'Machu Picchu|マチュピチュ|PE||-72.55|-13.16|feature|3|',
    'Angkor Wat|アンコールワット|KH||103.87|13.41|feature|3|',
    'Petra|ペトラ|JO||35.44|30.33|feature|3|',
    'Uluru|ウルル|AU|NT|131.04|-25.34|feature|3|Ayers Rock',
    'Niagara Falls|ナイアガラの滝|CA|ON|-79.07|43.08|feature|3|',
    'Great Barrier Reef|グレートバリアリーフ|AU|QLD|147.7|-18.29|feature|4|',
    'Eiffel Tower|エッフェル塔|FR||2.29|48.86|feature|3|Tour Eiffel',
    'Notre-Dame|ノートルダム大聖堂|FR||2.35|48.85|feature|3|Notre Dame',
    'Colosseum|コロッセオ|IT||12.49|41.89|feature|3|Kolosseum;Coliseo',
    'Acropolis|アクロポリス|GR||23.73|37.97|feature|3|',
    'Al-Aqsa|アルアクサ|IL||35.24|31.78|flashpoint|6|Al Aqsa;Temple Mount;アルアクサ・モスク;神殿の丘',
    'Pearl Harbor|真珠湾|US|HI|-157.96|21.35|feature|3|',
    /* ---------- Bases, airports, nuclear sites named in the news ---------- */
    'Guam|グアム|US||144.79|13.44|flashpoint|5|Гуам',
    'Kadena|嘉手納|JP|47|127.77|26.36|flashpoint|4|Kadena Air Base;嘉手納基地',
    'Yokosuka|横須賀|JP|14|139.67|35.28|city|4|横須賀基地',
    'Al Udeid|アル・ウデイド|QA||51.31|25.12|flashpoint|4|Al Udeid Air Base',
    'Ain al-Asad|アイン・アルアサド|IQ||42.44|33.79|flashpoint|4|Ain al-Assad',
    'Heathrow|ヒースロー|GB|ENG|-0.45|51.47|feature|4|Heathrow Airport;ヒースロー空港',
    'Narita|成田|JP|12|140.39|35.77|feature|4|Narita Airport;成田空港',
    'Haneda|羽田|JP|13|139.78|35.55|feature|4|Haneda Airport;羽田空港',
    'Schiphol|スキポール|NL||4.76|52.31|feature|3|Schiphol Airport',
    'Antakya|アンタキヤ|TR||36.16|36.2|flashpoint|5|Antioch;Антакья',
    'Hatay|ハタイ|TR||36.2|36.4|flashpoint|4|',
    'Kahramanmaras|カフラマンマラシュ|TR||36.93|37.58|flashpoint|4|Kahramanmaraş;Maras',
    'Adana|アダナ|TR||35.33|37.0|city|3|Адана',
    'Bursa|ブルサ|TR||29.06|40.19|city|3|',
    'Konya|コンヤ|TR||32.49|37.87|city|2|',
    'Kaduna|カドゥナ|NG||7.44|10.52|flashpoint|4|',
    'Maiduguri|マイドゥグリ|NG||13.15|11.83|flashpoint|4|',
    'Doha talks venue|ドーハ会場|QA||51.53|25.29|city|1|',
    'Sharm summit venue|シャルム会場|EG||34.33|27.92|city|1|'
  );

  /* ---- ADMIN-1 : en|ja|iso2|a1|lng|lat|alt… ----
       States / provinces / oblasts / prefectures. Their real job is
       DISAMBIGUATION ("Springfield, Illinois" / 「兵庫県の…」). */
  A1.push(
    /* United States */
    'Alabama|アラバマ州|US|AL|-86.8|32.8|', 'Alaska|アラスカ州|US|AK|-152.0|64.0|Аляск',
    'Arizona|アリゾナ州|US|AZ|-111.7|34.3|Аризон', 'Arkansas|アーカンソー州|US|AR|-92.4|34.8|',
    'California|カリフォルニア州|US|CA|-119.4|36.8|Kalifornien;Калифорни', 'Colorado|コロラド州|US|CO|-105.5|39.0|Колорадо',
    'Connecticut|コネチカット州|US|CT|-72.7|41.6|', 'Delaware|デラウェア州|US|DE|-75.5|39.0|',
    'Florida|フロリダ州|US|FL|-81.5|28.0|Флорид', 'Georgia (US)|ジョージア州|US|GA|-83.5|32.7|Georgia;Georgia state;State of Georgia',
    'Hawaii|ハワイ州|US|HI|-156.3|20.8|Hawai;Гавайи', 'Idaho|アイダホ州|US|ID|-114.6|44.2|',
    'Illinois|イリノイ州|US|IL|-89.2|40.0|Иллинойс', 'Indiana|インディアナ州|US|IN|-86.3|39.9|',
    'Iowa|アイオワ州|US|IA|-93.5|42.0|', 'Kansas|カンザス州|US|KS|-98.4|38.5|Канзас',
    'Kentucky|ケンタッキー州|US|KY|-84.9|37.5|', 'Louisiana|ルイジアナ州|US|LA|-92.0|31.0|Луизиан',
    'Maine|メイン州|US|ME|-69.2|45.4|', 'Maryland|メリーランド州|US|MD|-76.8|39.0|',
    'Massachusetts|マサチューセッツ州|US|MA|-71.8|42.3|Массачусетс', 'Michigan|ミシガン州|US|MI|-84.5|43.3|Мичиган',
    'Minnesota|ミネソタ州|US|MN|-94.3|46.3|', 'Mississippi|ミシシッピ州|US|MS|-89.7|32.7|Миссисипи',
    'Missouri|ミズーリ州|US|MO|-92.5|38.4|Миссури', 'Montana|モンタナ州|US|MT|-110.0|47.0|Монтан',
    'Nebraska|ネブラスカ州|US|NE|-99.8|41.5|', 'Nevada|ネバダ州|US|NV|-116.6|39.3|Невад',
    'New Hampshire|ニューハンプシャー州|US|NH|-71.6|43.7|', 'New Jersey|ニュージャージー州|US|NJ|-74.5|40.2|Нью-Джерси',
    'New Mexico|ニューメキシコ州|US|NM|-106.0|34.5|Нью-Мексико', 'New York State|ニューヨーク州|US|NY|-75.5|43.0|',
    'North Carolina|ノースカロライナ州|US|NC|-79.4|35.5|', 'North Dakota|ノースダコタ州|US|ND|-100.5|47.5|',
    'Ohio|オハイオ州|US|OH|-82.8|40.3|Огайо', 'Oklahoma|オクラホマ州|US|OK|-97.5|35.5|Оклахом',
    'Oregon|オレゴン州|US|OR|-120.5|43.9|Орегон', 'Pennsylvania|ペンシルベニア州|US|PA|-77.8|40.9|Пенсильвани',
    'Rhode Island|ロードアイランド州|US|RI|-71.5|41.7|', 'South Carolina|サウスカロライナ州|US|SC|-80.9|33.9|',
    'South Dakota|サウスダコタ州|US|SD|-100.2|44.4|', 'Tennessee|テネシー州|US|TN|-86.4|35.9|Теннесси',
    'Texas|テキサス州|US|TX|-99.0|31.5|Texas state;Техас', 'Utah|ユタ州|US|UT|-111.7|39.3|Юта',
    'Vermont|バーモント州|US|VT|-72.7|44.0|', 'Virginia|バージニア州|US|VA|-78.5|37.5|Виргини',
    'Washington State|ワシントン州|US|WA|-120.5|47.4|Washington state', 'West Virginia|ウェストバージニア州|US|WV|-80.6|38.6|',
    'Wisconsin|ウィスコンシン州|US|WI|-89.5|44.5|Висконсин', 'Wyoming|ワイオミング州|US|WY|-107.5|43.0|Вайоминг',
    'District of Columbia|コロンビア特別区|US|DC|-77.02|38.9|D.C.;DC',
    /* Canada / Australia / Germany / Brazil / India / China / Japan / Ukraine / Russia */
    'Ontario|オンタリオ州|CA|ON|-85.0|50.0|Онтарио', 'British Columbia|ブリティッシュコロンビア州|CA|BC|-125.0|54.0|Британская Колумбия',
    'Alberta|アルバータ州|CA|AB|-115.0|54.0|Альберт', 'Manitoba|マニトバ州|CA|MB|-98.0|55.0|',
    'Saskatchewan|サスカチュワン州|CA|SK|-106.0|54.0|', 'Nova Scotia|ノバスコシア州|CA|NS|-63.0|45.0|',
    'New South Wales|ニューサウスウェールズ州|AU|NSW|146.9|-32.2|NSW', 'Victoria (Australia)|ビクトリア州|AU|VIC|144.3|-36.9|',
    'Queensland|クイーンズランド州|AU|QLD|144.4|-22.5|Квинсленд', 'Western Australia|西オーストラリア州|AU|WA|122.0|-25.5|',
    'South Australia|南オーストラリア州|AU|SA|135.0|-30.0|', 'Tasmania|タスマニア州|AU|TAS|146.6|-42.0|Тасмани',
    'Bavaria|バイエルン州|DE|BY|11.4|48.9|Bayern;Бавари', 'North Rhine-Westphalia|ノルトライン＝ヴェストファーレン州|DE|NW|7.5|51.5|Nordrhein-Westfalen;NRW',
    'Saxony|ザクセン州|DE|SN|13.3|51.0|Sachsen;Саксони', 'Brandenburg|ブランデンブルク州|DE|BB|13.4|52.4|Бранденбург',
    'Baden-Württemberg|バーデン＝ヴュルテンベルク州|DE|BW|9.1|48.6|Baden-Wuerttemberg', 'Hesse|ヘッセン州|DE|HE|9.0|50.6|Hessen',
    'São Paulo State|サンパウロ州|BR|SP|-48.5|-22.0|Estado de São Paulo', 'Rio Grande do Sul|リオグランデ・ド・スル州|BR|RS|-53.5|-30.0|',
    'Bahia|バイーア州|BR|BA|-41.7|-12.5|', 'Amazonas|アマゾナス州|BR|AM|-64.0|-4.0|',
    'Maharashtra|マハラシュトラ州|IN|MH|75.7|19.7|Махараштра', 'Karnataka|カルナータカ州|IN|KA|76.0|14.5|',
    'Tamil Nadu|タミル・ナードゥ州|IN|TN|78.6|11.1|', 'West Bengal|西ベンガル州|IN|WB|87.9|23.0|Западная Бенгалия',
    'Uttar Pradesh|ウッタル・プラデーシュ州|IN|UP|80.9|26.8|', 'Gujarat|グジャラート州|IN|GJ|71.7|22.3|Гуджарат',
    'Punjab|パンジャブ|IN|PB|75.3|31.1|Пенджаб', 'Kerala|ケーララ州|IN|KL|76.3|10.5|Керал',
    'Rajasthan|ラージャスターン州|IN|RJ|74.2|27.0|', 'Telangana|テランガーナ州|IN|TG|79.0|18.1|',
    'Jammu and Kashmir|ジャンムー・カシミール|IN|JK|75.3|33.8|',
    'Guangdong|広東省|CN|GD|113.4|23.4|Гуандун', 'Sichuan|四川省|CN|SC|102.9|30.6|Сычуань',
    'Zhejiang|浙江省|CN|ZJ|120.1|29.2|Чжэцзян', 'Jiangsu|江蘇省|CN|JS|119.4|33.0|Цзянсу',
    'Shandong|山東省|CN|SD|118.0|36.4|Шаньдун', 'Henan|河南省|CN|HA|113.6|33.9|Хэнань',
    'Hubei|湖北省|CN|HB|112.3|30.9|Хубэй', 'Fujian|福建省|CN|FJ|118.3|26.1|Фуцзянь',
    'Liaoning|遼寧省|CN|LN|122.6|41.8|Ляонин', 'Shaanxi|陝西省|CN|SN|108.9|35.6|',
    'Hokkaido|北海道|JP|1|142.8|43.4|Хоккайдо', 'Aomori|青森県|JP|2|140.74|40.82|',
    'Iwate|岩手県|JP|3|141.15|39.7|', 'Miyagi|宮城県|JP|4|140.87|38.44|',
    'Fukushima Prefecture|福島県|JP|7|140.47|37.4|', 'Ibaraki|茨城県|JP|8|140.45|36.34|',
    'Tokyo Metropolis|東京都|JP|13|139.69|35.69|', 'Kanagawa|神奈川県|JP|14|139.64|35.45|',
    'Niigata|新潟県|JP|15|139.02|37.9|', 'Ishikawa|石川県|JP|17|136.63|36.59|',
    'Nagano|長野県|JP|20|138.18|36.65|', 'Shizuoka|静岡県|JP|22|138.38|34.98|',
    'Aichi|愛知県|JP|23|136.91|35.18|', 'Kyoto Prefecture|京都府|JP|26|135.76|35.02|',
    'Osaka Prefecture|大阪府|JP|27|135.52|34.69|', 'Hyogo|兵庫県|JP|28|135.18|34.69|',
    'Hiroshima Prefecture|広島県|JP|34|132.46|34.4|', 'Ehime|愛媛県|JP|38|132.77|33.84|',
    'Fukuoka Prefecture|福岡県|JP|40|130.42|33.61|', 'Kumamoto|熊本県|JP|43|130.74|32.79|',
    'Kagoshima|鹿児島県|JP|46|130.56|31.56|', 'Okinawa Prefecture|沖縄県|JP|47|127.68|26.21|',
    'Kharkiv Oblast|ハルキウ州|UA|KH|36.5|49.8|Харьковская', 'Donetsk Oblast|ドネツク州|UA|DO|37.5|48.2|Донецкая',
    'Luhansk Oblast|ルハンスク州|UA|LU|39.0|48.8|Луганская', 'Zaporizhzhia Oblast|ザポリージャ州|UA|ZP|35.5|47.5|Запорожская',
    'Kherson Oblast|ヘルソン州|UA|KS|33.3|46.6|Херсонская', 'Odesa Oblast|オデーサ州|UA|OD|30.2|46.5|Одесская',
    'Moscow Oblast|モスクワ州|RU|MOS|37.5|55.6|Московская', 'Krasnodar Krai|クラスノダール地方|RU|KDA|39.5|45.3|Краснодарск',
    'Siberia|シベリア|RU|SIB|90.0|60.0|Sibirien;Siberia;Сибир', 'Far East|極東|RU|FE|135.0|55.0|Дальний Восток',
    'Bavaria region|バイエルン地方|DE|BY2|11.4|48.9|'
  );

  /* ---- TRAPS / ORGS / SEATS : surfaces…|kind|targetKey|en|ja ----
       kind  x = NOT a place at all (consumes the span so the place inside it
                 can never be matched: "New York Times", "Paris Hilton")
             o = organisation / company / club → docked, only wins when no
                 explicit place is named
             s = seat / bureau → a precise place, not docked            */
  /* @i18n-entity-data  matcher SPELLINGS packed as `alias;alias;…|kind||` — the strings a headline
     is compared against, not text the app writes. Translating them would break the matcher. (#R251) */
  TR.push(
    /* --- publications & brands that swallow a place name ---
       ⚠ (#R208) AND IN JAPANESE, WHICH IS THE HALF THAT WAS MISSING. Every row below already knew
       the Latin spelling; MEASURED against the bundled gazetteer, sixteen of eighteen ordinary
       Japanese forms of these same names still pinned the city inside them — 「ニューヨークタイムズ
       が報じた」 → New York, 「パリ協定からの離脱」 → Paris, 「京都議定書」 → Kyoto. The katakana
       run-start guard in §0 cannot reach these: the place is at the START of the run, so the
       boundary is legitimate and only a name can say the whole span is not a place. The surfaces go
       on the EXISTING rows rather than into new ones — a second `o` row for the same seat would
       make two entities for one city and let them compete with each other. */
    'New York Times;NY Times;NYT;New York Post;New Yorker;ニューヨークタイムズ;ニューヨーク・タイムズ;NYタイムズ;ニューヨークポスト;ニューヨーク・ポスト;ニューヨーカー|x||',
    'Washington Post;Washington Examiner;Washington Times;ワシントンポスト;ワシントン・ポスト|x||',
    'Los Angeles Times;LA Times;ロサンゼルスタイムズ;ロサンゼルス・タイムズ;LAタイムズ|x||',
    'Chicago Tribune;Chicago Sun-Times;シカゴ・トリビューン|x||', 'Boston Globe;ボストン・グローブ|x||',
    'Financial Times;フィナンシャルタイムズ;フィナンシャル・タイムズ|x||',
    'Wall Street Journal;ウォールストリートジャーナル;ウォールストリート・ジャーナル|x||',
    'Hollywood Reporter|x||', 'Moscow Times;モスクワタイムズ;モスクワ・タイムズ|x||',
    'Times of India;Times of Israel;Times of Malta|x||',
    'South China Morning Post;サウスチャイナ・モーニング・ポスト|x||', 'Japan Times;ジャパンタイムズ|x||',
    'Jerusalem Post;エルサレム・ポスト|x||', 'Kyiv Independent;Kyiv Post|x||', 'Korea Herald;Korea Times|x||',
    'Bangkok Post;Jakarta Post;バンコクポスト;バンコク・ポスト;ジャカルタポスト|x||',
    'Global Times|x||', 'China Daily|x||', 'Irish Times|x||',
    'Sydney Morning Herald|x||', 'Toronto Star|x||', 'Buenos Aires Times|x||', 'Brussels Times|x||',
    'Berlin Wall;ベルリンの壁|x||', 'Great Wall of China;万里の長城|x||', 'Chinese Wall|x||',
    'Bank of America;Bank of England;Bank of Japan;Bank of Canada;Bank of Korea|x||',
    'Boston Consulting Group;Boston Dynamics;ボストン・ダイナミクス;ボストンダイナミクス|x||',
    'Manhattan Project;マンハッタン計画|x||',
    'Paris Agreement;Paris Accord;Paris climate agreement;パリ協定|x||',
    'Geneva Convention;Geneva Conventions;ジュネーブ条約;ジュネーヴ条約|x||',
    'Vienna Convention;ウィーン条約|x||', 'Kyoto Protocol;京都議定書|x||', 'Chicago Convention|x||',
    'Budapest Memorandum;ブダペスト覚書|x||',
    'Minsk agreements;Minsk accords;ミンスク合意|x||', 'Abraham Accords;アブラハム合意|x||', 'Good Friday Agreement|x||',
    'Brussels sprouts;Turkey Day;China Sea shipping|x||', 'India Pale Ale|x||',
    'Paris Hilton;Paris Jackson|x||', 'Michael Jordan;Jordan Peterson;Jordan Bardella;Jordan Spieth|x||',
    'Sydney Sweeney|x||', 'Florence Pugh|x||', 'Milan Kundera|x||', 'Denzel Washington|x||',
    'Charlotte Tilbury|x||', 'Austin Butler|x||', 'Madison Square Garden|x||', 'Victoria Beckham|x||',
    'Georgia Meloni;Giorgia Meloni|x||', 'Chad Michael|x||', 'India Today;India Inc|x||',
    'Alexandria Ocasio-Cortez|x||', 'Georgia Tech;Georgia Institute of Technology|x||',
    'Austin Powers|x||', 'Florence Nightingale|x||', 'Cambridge Analytica;ケンブリッジ・アナリティカ|x||', 'Oxford University Press|x||',
    'Havana syndrome;ハバナ症候群|x||', 'Stockholm syndrome;ストックホルム症候群|x||', 'Dutch disease|x||', 'Spanish flu;スペイン風邪|x||',
    'Mexican standoff|x||', 'Roman Empire|x||', 'Turkey shoot|x||', 'Nice guy|x||',
    /* --- international organisations → their seat --- */
    'United Nations;U.N.;UN Security Council;Security Council;General Assembly;国連;国際連合;Vereinte Nationen;Naciones Unidas;ООН|o|New York|United Nations|国連',
    'NATO;North Atlantic Treaty Organization;北大西洋条約機構;OTAN;НАТО|o|Brussels|NATO|NATO',
    'European Commission;European Parliament;European Council;欧州委員会;欧州議会;Еврокомисси|o|Brussels|European Union|欧州連合',
    'IMF;International Monetary Fund;国際通貨基金;МВФ|o|Washington|IMF|IMF',
    'World Bank;世界銀行;Weltbank;Всемирный банк|o|Washington|World Bank|世界銀行',
    'Federal Reserve;the Fed;Fed chair;Fed officials;Fed meeting;Fed rate;FOMC;連邦準備制度;米連邦準備制度;ФРС|o|Washington|Federal Reserve|連邦準備制度',
    'WHO;World Health Organization;世界保健機関;ВОЗ|o|Geneva|WHO|WHO',
    'WTO;World Trade Organization;世界貿易機関;ВТО|o|Geneva|WTO|WTO',
    'UNHCR;Human Rights Council;国連人権理事会|o|Geneva|UNHCR|UNHCR',
    'ICC;International Criminal Court;International Court of Justice;ICJ;国際刑事裁判所;国際司法裁判所;МУС|o|The Hague|International courts|国際司法機関',
    'OPCW;Organisation for the Prohibition of Chemical Weapons|o|The Hague|OPCW|OPCW',
    'IAEA;International Atomic Energy Agency;国際原子力機関;МАГАТЭ|o|Vienna|IAEA|IAEA',
    'OPEC;OPEC+;石油輸出国機構;ОПЕК|o|Vienna|OPEC|OPEC',
    'OSCE;欧州安全保障協力機構|o|Vienna|OSCE|OSCE',
    'African Union;AU summit;アフリカ連合|o|Addis Ababa|African Union|アフリカ連合',
    'ASEAN;東南アジア諸国連合;АСЕАН|o|Jakarta|ASEAN|ASEAN',
    'ECB;European Central Bank;欧州中央銀行;ЕЦБ|o|Frankfurt|European Central Bank|欧州中央銀行',
    'BIS;Bank for International Settlements;国際決済銀行|o|Basel|BIS|国際決済銀行',
    'IOC;International Olympic Committee;国際オリンピック委員会|o|Geneva|IOC|IOC',
    'FIFA|o|Zurich|FIFA|FIFA', 'UEFA|o|Geneva|UEFA|UEFA',
    'Arab League;アラブ連盟|o|Cairo|Arab League|アラブ連盟',
    'GCC;Gulf Cooperation Council;湾岸協力会議|o|Riyadh|GCC|湾岸協力会議',
    'SCO;Shanghai Cooperation Organisation;上海協力機構|o|Beijing|SCO|上海協力機構',
    /* --- armed groups / militaries → their base of operations --- */
    'Hamas;ハマス;ХАМАС|o|Gaza|Hamas (Gaza)|ハマス（ガザ）',
    'Palestinian Islamic Jihad;Islamic Jihad|o|Gaza|Islamic Jihad (Gaza)|イスラム聖戦（ガザ）',
    'Hezbollah;Hizbollah;Hizbullah;ヒズボラ;Хезболла|o|Southern Lebanon|Hezbollah (Lebanon)|ヒズボラ（レバノン）',
    'Houthi;Houthis;Ansar Allah;フーシ;хуситы|o|Sanaa|Houthis (Yemen)|フーシ派（イエメン）',
    'IDF;Israel Defense Forces;イスラエル軍;ЦАХАЛ|o|Tel Aviv|Israel (IDF)|イスラエル軍',
    'IRGC;Revolutionary Guard;Revolutionary Guards;革命防衛隊;КСИР|o|Tehran|Iran (IRGC)|イラン革命防衛隊',
    'Taliban;タリバン;Талибан|o|Kabul|Afghanistan (Taliban)|アフガニスタン（タリバン）',
    'Wagner;Wagner Group;Wagner mercenaries;ワグネル;Вагнер|o|Moscow|Russia (Wagner)|ロシア（ワグネル）',
    'Islamic State;ISIS;ISIL;Daesh;イスラム国;ИГИЛ|o|Raqqa|Islamic State|イスラム国',
    'Boko Haram;ボコ・ハラム|o|Kano|Boko Haram|ボコ・ハラム',
    'Al-Shabaab;Al Shabaab;アルシャバブ|o|Mogadishu|Al-Shabaab|アルシャバブ',
    'Al-Qaeda;Al Qaeda;アルカイダ|o|Kandahar|Al-Qaeda|アルカイダ',
    'RSF;Rapid Support Forces;即応支援部隊|o|Khartoum|Sudan (RSF)|スーダン（RSF）',
    'M23|o|Goma|M23 (DR Congo)|M23（コンゴ）',
    'PKK;クルド労働者党|o|Diyarbakir|PKK|PKK',
    'SDF;Syrian Democratic Forces|o|Raqqa|Syrian Democratic Forces|シリア民主軍',
    'Hayat Tahrir al-Sham;HTS|o|Idlib|HTS (Idlib)|HTS（イドリブ）',
    'Polisario|o|Western Sahara|Polisario|ポリサリオ',
    'Tigray People’s Liberation Front;TPLF|o|Mekelle|TPLF (Tigray)|TPLF（ティグレ）',
    'Cartel de Sinaloa;Sinaloa cartel|o|Sinaloa|Sinaloa cartel|シナロア・カルテル',
    /* --- companies → headquarters city (docked: only when nothing else places) --- */
    'Apple Inc;アップル|o|Cupertino|Apple|アップル', 'Google;Alphabet;Alphabet Inc;グーグル|o|Mountain View|Google|グーグル',
    'Microsoft;マイクロソフト|o|Redmond|Microsoft|マイクロソフト', 'Amazon.com;Amazon Web Services;AWS|o|Seattle|Amazon|アマゾン',
    'Meta Platforms;Facebook|o|Palo Alto|Meta|メタ', 'Nvidia;エヌビディア|o|Santa Clara|Nvidia|エヌビディア',
    'Tesla;テスラ|o|Austin|Tesla|テスラ', 'SpaceX|o|Austin|SpaceX|スペースX',
    'OpenAI|o|San Francisco|OpenAI|OpenAI', 'Anthropic|o|San Francisco|Anthropic|Anthropic',
    'Boeing|o|Seattle|Boeing|ボーイング', 'Airbus|o|Toulouse|Airbus|エアバス',
    'Toyota;トヨタ|o|Nagoya|Toyota|トヨタ', 'Sony;ソニー|o|Tokyo|Sony|ソニー',
    'Nintendo;任天堂|o|Kyoto|Nintendo|任天堂', 'Samsung;サムスン|o|Seoul|Samsung|サムスン',
    'TSMC;台湾積体電路|o|Hsinchu|TSMC|TSMC', 'Huawei;ファーウェイ|o|Shenzhen|Huawei|ファーウェイ',
    'Alibaba;アリババ|o|Hangzhou|Alibaba|アリババ', 'Tencent;テンセント|o|Shenzhen|Tencent|テンセント',
    'BYD|o|Shenzhen|BYD|BYD', 'Saudi Aramco;Aramco|o|Dhahran|Aramco|サウジアラムコ',
    'Gazprom;Газпром|o|Saint Petersburg|Gazprom|ガスプロム', 'Rosneft|o|Moscow|Rosneft|ロスネフチ',
    'Volkswagen;フォルクスワーゲン|o|Munich|Volkswagen|フォルクスワーゲン', 'Siemens|o|Munich|Siemens|シーメンス',
    'Nestlé;Nestle|o|Geneva|Nestlé|ネスレ', 'Shell plc;Royal Dutch Shell|o|The Hague|Shell|シェル',
    'BP plc;British Petroleum|o|London|BP|BP', 'TotalEnergies|o|Paris|TotalEnergies|トタル',
    'Rheinmetall|o|Düsseldorf|Rheinmetall|ラインメタル', 'Lockheed Martin|o|Washington|Lockheed Martin|ロッキード・マーチン',
    'BAE Systems;BAE|o|London|BAE Systems|BAEシステムズ', 'Rolls-Royce|o|Birmingham|Rolls-Royce|ロールス・ロイス',
    'Intel;インテル|o|Santa Clara|Intel|インテル', 'AMD;Advanced Micro Devices|o|Santa Clara|AMD|AMD',
    'Oracle;オラクル|o|Austin|Oracle|オラクル', 'IBM|o|New York|IBM|IBM',
    'Qualcomm|o|San Diego|Qualcomm|クアルコム', 'Broadcom|o|Palo Alto|Broadcom|ブロードコム',
    'Walmart;ウォルマート|o|Dallas|Walmart|ウォルマート', 'Costco|o|Seattle|Costco|コストコ',
    'Target Corporation|o|Minneapolis|Target|ターゲット', 'Home Depot|o|Atlanta|Home Depot|ホームデポ',
    'Blackstone|o|New York|Blackstone|ブラックストーン', 'BlackRock|o|New York|BlackRock|ブラックロック',
    'Goldman Sachs;ゴールドマン・サックス|o|New York|Goldman Sachs|ゴールドマン・サックス',
    'JPMorgan;J.P. Morgan;JP Morgan|o|New York|JPMorgan|JPモルガン',
    'Morgan Stanley|o|New York|Morgan Stanley|モルガン・スタンレー', 'Citigroup|o|New York|Citigroup|シティグループ',
    'Berkshire Hathaway|o|Omaha|Berkshire Hathaway|バークシャー・ハサウェイ',
    'Eli Lilly|o|Indianapolis|Eli Lilly|イーライリリー', 'Pfizer|o|New York|Pfizer|ファイザー',
    'Moderna|o|Cambridge (MA)|Moderna|モデルナ', 'Johnson & Johnson|o|Newark|Johnson & Johnson|J&J',
    'Novo Nordisk|o|Copenhagen|Novo Nordisk|ノボノルディスク', 'AstraZeneca|o|Cambridge|AstraZeneca|アストラゼネカ',
    'Netflix|o|Los Angeles|Netflix|ネットフリックス', 'Disney;ディズニー|o|Los Angeles|Disney|ディズニー',
    'Salesforce|o|San Francisco|Salesforce|セールスフォース',
    'Exxon;ExxonMobil|o|Houston|ExxonMobil|エクソンモービル', 'Chevron|o|Houston|Chevron|シェブロン',
    'Ford Motor|o|Detroit|Ford|フォード', 'General Motors;GM Motors|o|Detroit|General Motors|GM',
    'Honda;ホンダ|o|Tokyo|Honda|ホンダ', 'Nissan;日産|o|Yokohama|Nissan|日産',
    'SoftBank;ソフトバンク|o|Tokyo|SoftBank|ソフトバンク', 'Hitachi;日立|o|Tokyo|Hitachi|日立',
    'Toshiba;東芝|o|Tokyo|Toshiba|東芝', 'Panasonic;パナソニック|o|Osaka|Panasonic|パナソニック',
    'SK Hynix;SK하이닉스|o|Seoul|SK Hynix|SKハイニックス', 'Hyundai;現代自動車|o|Seoul|Hyundai|現代自動車',
    'Foxconn;鴻海|o|Taipei|Foxconn|鴻海', 'Xiaomi;シャオミ|o|Beijing|Xiaomi|シャオミ',
    'ByteDance;TikTok|o|Beijing|ByteDance|バイトダンス', 'CATL|o|Shenzhen|CATL|CATL',
    'Maersk|o|Copenhagen|Maersk|マースク', 'Glencore|o|Zurich|Glencore|グレンコア',
    'ASML|o|Amsterdam|ASML|ASML', 'Ericsson|o|Stockholm|Ericsson|エリクソン',
    'Nokia|o|Helsinki|Nokia|ノキア', 'LVMH|o|Paris|LVMH|LVMH',
    /* --- sports clubs → their home city --- */
    'Manchester United;Manchester City;Man United;Man City;マンチェスター・ユナイテッド;マンチェスターユナイテッド;マンチェスター・シティ;マンチェスターシティ|o|Manchester|Manchester|マンチェスター',
    'Real Madrid;Atletico Madrid;Atlético Madrid;レアル・マドリード;レアルマドリード;アトレティコ・マドリード|o|Madrid|Madrid|マドリード',
    'FC Barcelona;Barça;Barca;FCバルセロナ|o|Barcelona|Barcelona|バルセロナ',
    'Bayern Munich;FC Bayern;バイエルン・ミュンヘン;バイエルンミュンヘン|o|Munich|Munich|ミュンヘン',
    'Paris Saint-Germain;PSG;パリ・サンジェルマン;パリサンジェルマン|o|Paris|Paris|パリ',
    'Liverpool FC|o|Liverpool|Liverpool|リヴァプール', 'Chelsea FC;Arsenal FC;Tottenham Hotspur|o|London|London|ロンドン',
    'Inter Milan;AC Milan|o|Milan|Milan|ミラノ', 'Juventus|o|Turin|Turin|トリノ',
    'Yankees;New York Knicks;Brooklyn Nets|o|New York|New York|ニューヨーク',
    'Dodgers;Lakers|o|Los Angeles|Los Angeles|ロサンゼルス',
    /* --- Japanese single-kanji country prefixes. 「米」「中」「英」 alone are
           ordinary words, so ONLY the compound forms are indexed — that keeps
           the precision while covering the way JP headlines actually write
           "the US government / the Chinese military". --- */
    '米国務省;米国防総省;米司法省;米財務省;米政府;米議会;米下院;米上院;米当局;米大統領;米副大統領;米高官|o|Washington|United States|アメリカ',
    '米軍;米海軍;米空軍;米陸軍;米軍機;米艦|o|Pentagon|United States (military)|米軍',
    '中国軍;中国政府;中国当局;中国外相;中国海警局;中国共産党|o|Beijing|China|中国',
    '英政府;英当局;英軍;英首相|o|London|United Kingdom|イギリス',
    '仏政府;仏軍;仏大統領|o|Paris|France|フランス',
    '独政府;独首相|o|Berlin|Germany|ドイツ',
    '露軍;ロシア軍;露政府|o|Moscow|Russia|ロシア',
    '韓国軍;韓国政府|o|Seoul|South Korea|韓国',
    '北朝鮮軍;朝鮮中央通信|o|Pyongyang|North Korea|北朝鮮',
    'コンゴ;コンゴ民主共和国|o|Kinshasa|DR Congo|コンゴ民主共和国',
    'イスラエル軍;イスラエル政府|o|Tel Aviv|Israel|イスラエル',
    'ウクライナ軍;ウクライナ政府|o|Kyiv|Ukraine|ウクライナ',
    '日本政府;日本銀行;日銀;防衛省;外務省;首相官邸|o|Tokyo|Japan|日本',
    /* --- heads of state / government → their country. Names are stable data:
           a former leader still identifies the same country. Docked, so an
           explicit place in the same headline always wins. --- */
    'Trump;Donald Trump;トランプ;Трамп|o|Washington|United States|アメリカ',
    'Biden;Joe Biden;バイデン|o|Washington|United States|アメリカ',
    'Vance;JD Vance;バンス|o|Washington|United States|アメリカ',
    'Rubio;Marco Rubio;ルビオ|o|Washington|United States|アメリカ',
    'Putin;Vladimir Putin;プーチン;Путин|o|Moscow|Russia|ロシア',
    'Lavrov;ラブロフ;Лавров|o|Moscow|Russia|ロシア',
    'Zelensky;Zelenskyy;ゼレンスキー;Зеленск|o|Kyiv|Ukraine|ウクライナ',
    'Xi Jinping;習近平|o|Beijing|China|中国',
    'Netanyahu;ネタニヤフ|o|Tel Aviv|Israel|イスラエル',
    'Khamenei;ハメネイ|o|Tehran|Iran|イラン',
    'Pezeshkian;ペゼシュキアン|o|Tehran|Iran|イラン',
    'Kim Jong Un;金正恩;キム・ジョンウン|o|Pyongyang|North Korea|北朝鮮',
    'Modi;Narendra Modi;モディ|o|New Delhi|India|インド',
    'Macron;マクロン|o|Paris|France|フランス',
    'Merz;Scholz;メルツ;ショルツ|o|Berlin|Germany|ドイツ',
    'Starmer;Keir Starmer;スターマー|o|London|United Kingdom|イギリス',
    'Meloni;メローニ|o|Rome|Italy|イタリア',
    'Sánchez;Pedro Sánchez;サンチェス|o|Madrid|Spain|スペイン',
    'Erdogan;Erdoğan;エルドアン|o|Ankara|Turkey|トルコ',
    'Lula;ルーラ|o|Brasília|Brazil|ブラジル',
    'Milei;ミレイ|o|Buenos Aires|Argentina|アルゼンチン',
    'Sheinbaum;シェインバウム|o|Mexico City|Mexico|メキシコ',
    'Maduro;マドゥロ|o|Caracas|Venezuela|ベネズエラ',
    'Ishiba;Takaichi;石破;高市;岸田|o|Tokyo|Japan|日本',
    'Lee Jae-myung;Yoon Suk-yeol;李在明;尹錫悦|o|Seoul|South Korea|韓国',
    'Lai Ching-te;頼清徳|o|Taipei|Taiwan|台湾',
    'Albanese|o|Canberra|Australia|オーストラリア',
    'Carney;Trudeau|o|Ottawa|Canada|カナダ',
    'Ramaphosa|o|Pretoria|South Africa|南アフリカ',
    'Mohammed bin Salman;ムハンマド皇太子|o|Riyadh|Saudi Arabia|サウジアラビア',
    'Sisi;シシ|o|Cairo|Egypt|エジプト',
    'von der Leyen;フォンデアライエン|o|Brussels|European Union|欧州連合',
    'Guterres;グテレス|o|New York|United Nations|国連',
    'Rutte;ルッテ|o|Brussels|NATO|NATO',
    /* --- bureaux / precise seats --- */
    'Foggy Bottom;State Department;US State Department;国務省|s|Washington|State Department|米国務省',
    'Whitehall;Foreign Office|s|Downing Street|Whitehall|ホワイトホール',
    'Quai d’Orsay|s|Élysée|Quai d’Orsay|フランス外務省',
    'Kirtland;Los Alamos|s|Silicon Valley|Los Alamos|ロスアラモス'
  );


  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : null; }
  /* A trailing "!" marks a COMMON-WORD name (Turkey / Chad / Nice) that needs
     corroboration before it counts. Strip the marker, keep the flag. */
  function weakName(s) { return /!$/.test(s || ''); }
  function cleanName(s) { return String(s || '').replace(/!$/, ''); }

  function build() {
    if (built) return; built = true;
    var i, r, f, alts, d;

    /* --- countries (+ their capitals as separate city entities) --- */
    var capAlt = new Map();
    for (i = 0; i < CAPALT.length; i++) { f = CAPALT[i].split('|'); capAlt.set(f[0], (f[1] || '').split(';')); }
    for (i = 0; i < CO.length; i++) {
      f = CO[i].split('|');
      var iso = f[0], wk = weakName(f[5]);
      var ce = addEnt({ kind: 'country', iso2: iso, loc: [num(f[1]), num(f[2])],
        name: { en: cleanName(f[5]), jp: f[6] || cleanName(f[5]) }, rank: 6, weak: wk,
        /* the EU is a union of countries, not a place: dock it like an org so an
           explicit member state or city always outranks "EU summit" boilerplate */
        dock: iso === 'EU' });
      BY_ISO.set(iso, ce.id);
      indexSurface(ce.name.en, ce.id); indexSurface(f[6], ce.id);
      alts = (f[9] || '').split(';');
      for (r = 0; r < alts.length; r++) if (alts[r]) indexSurface(alts[r], ce.id);
      /* demonyms → same country but DOCKED (an explicit place always outranks) */
      d = (f[10] || '').split(';');
      if (d.length && d[0]) {
        var de = addEnt({ kind: 'country', iso2: iso, loc: [num(f[1]), num(f[2])],
          name: { en: ce.name.en, jp: ce.name.jp }, rank: 5, dock: true, demonym: true });
        for (r = 0; r < d.length; r++) if (d[r]) indexSurface(d[r], de.id);
      }
      if (f[3] && f[7]) {
        var cap = addEnt({ kind: 'city', iso2: iso, parentIso: iso, capital: true,
          loc: [num(f[3]), num(f[4])], name: { en: cleanName(f[7]), jp: f[8] || cleanName(f[7]) },
          rank: 7, weak: weakName(f[7]) });
        indexSurface(cap.name.en, cap.id); indexSurface(f[8], cap.id);
        var ca = capAlt.get(iso);
        if (ca) for (r = 0; r < ca.length; r++) if (ca[r]) indexSurface(ca[r], cap.id);
      }
    }

    /* --- admin-1 (states / provinces / oblasts / prefectures) --- */
    for (i = 0; i < A1.length; i++) {
      f = A1[i].split('|');
      var akey = f[2] + '/' + f[3];
      var ae = addEnt({ kind: 'admin1', iso2: f[2], parentIso: f[2], a1: f[3], a1key: akey,
        loc: [num(f[4]), num(f[5])], name: { en: cleanName(f[0]), jp: f[1] || cleanName(f[0]) },
        rank: 4, weak: weakName(f[0]) });
      A1KEY.set(akey, ae.id);
      indexSurface(ae.name.en, ae.id); indexSurface(f[1], ae.id);
      alts = (f[6] || '').split(';');
      for (r = 0; r < alts.length; r++) if (alts[r]) indexSurface(alts[r], ae.id);
    }

    /* --- places (cities, flashpoints, features, seats) --- */
    for (i = 0; i < PL.length; i++) {
      f = PL[i].split('|');
      var pe = addEnt({ kind: f[6] || 'city', iso2: f[2] || '', parentIso: f[2] || '',
        a1: f[3] || '', a1key: (f[2] && f[3]) ? f[2] + '/' + f[3] : '',
        loc: [num(f[4]), num(f[5])], name: { en: cleanName(f[0]), jp: f[1] || cleanName(f[0]) },
        rank: f[7] ? parseInt(f[7], 10) : 4, weak: weakName(f[0]) });
      /* a sub-national area shipped in the PLACES table still anchors hierarchy */
      if (pe.kind === 'admin1' && pe.a1key && !A1KEY.has(pe.a1key)) A1KEY.set(pe.a1key, pe.id);
      indexSurface(pe.name.en, pe.id); indexSurface(f[1], pe.id);
      alts = (f[8] || '').split(';');
      for (r = 0; r < alts.length; r++) if (alts[r]) indexSurface(alts[r], pe.id);
    }

    /* --- traps: organisations, clubs, companies, treaties, people --- */
    var byName = new Map();
    for (i = 0; i < ENTS.length; i++) { if (!byName.has(ENTS[i].name.en)) byName.set(ENTS[i].name.en, ENTS[i]); }
    for (i = 0; i < TR.length; i++) {
      f = TR[i].split('|');
      var surfaces = f[0].split(';'), kind = f[1], target = f[2];
      var ent;
      if (kind === 'x') {
        ent = addEnt({ kind: 'trap', loc: [0, 0], name: { en: f[0], jp: f[0] } });
      } else {
        var tgt = byName.get(target);
        if (!tgt) continue;                                   // unknown target → skip, never invent
        ent = addEnt({ kind: kind === 's' ? 'seat' : 'org', iso2: tgt.iso2, parentIso: tgt.iso2,
          a1: tgt.a1 || '', a1key: tgt.a1key || '', loc: tgt.loc.slice(),
          name: { en: f[3] || tgt.name.en, jp: f[4] || f[3] || tgt.name.jp },
          rank: kind === 's' ? 7 : 4, dock: kind === 'o' });
      }
      for (r = 0; r < surfaces.length; r++) if (surfaces[r]) indexSurface(surfaces[r], ent.id);
    }
  }

  /* Extra places contributed at runtime (Supabase `geo_pins`, admin-curated).
     Registered at a LOWER rank than the built-in gazetteer so curated data
     adds coverage without overriding a verified place. */
  var REGISTERED = new Set();
  function register(rows) {
    build();
    if (!rows || !rows.length) return 0;
    var added = 0;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!r || !isFinite(r.lng) || !isFinite(r.lat)) continue;
      var terms = r.terms || []; if (!terms.length) continue;
      /* idempotent: the client re-runs this on every geo_pins realtime update */
      var sig = terms.join(',') + '@' + r.lng + ',' + r.lat;
      if (REGISTERED.has(sig)) continue;
      REGISTERED.add(sig);
      var e = addEnt({ kind: r.type === 'region' ? 'feature' : (r.type || 'city'),
        iso2: r.iso2 || '', loc: [+r.lng, +r.lat],
        name: { en: r.name_en || terms[0], jp: r.name_jp || r.name_en || terms[0] }, rank: 3 });
      for (var t = 0; t < terms.length; t++) indexSurface(terms[t], e.id);
      added++;
    }
    return added;
  }

  function stats() { build(); return { version: VERSION, entities: ENTS.length, latin: IDX.size, cjk: CIDX.size, stems: STEM.size }; }

  var API = { version: VERSION, locate: locate, analyze: analyze, register: register, stats: stats,
    _norm: normTerm, _tokenize: tokenize, _build: build, _ents: function () { build(); return ENTS; },
    _idx: function () { build(); return IDX; }, _cidx: function () { build(); return CIDX; } };

  if (typeof globalThis !== 'undefined') globalThis.IntMapNewsGeo = API;
  else if (typeof window !== 'undefined') window.IntMapNewsGeo = API;
})();
