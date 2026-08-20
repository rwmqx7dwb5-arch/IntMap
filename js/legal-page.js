/* ============================================================================
 *  IntMap · privacy.html / terms.html — THE PAGE SHELL
 * ----------------------------------------------------------------------------
 *  The Terms and the Privacy Policy also exist as ORDINARY PAGES with their own URL, because a
 *  policy that can only be reached by opening the app and clicking a footer link cannot be
 *  linked to, cited, bookmarked or read by anyone deciding whether to sign in at all.
 *
 *  ⚠ THE WORDS COME FROM js/legal-text.js — the same file the in-app modal reads. Nothing here
 *  restates any part of the policy, so the page and the modal cannot drift apart.
 *
 *  ⚠ TWO LANGUAGE LAYERS, ON PURPOSE.
 *    · THE CHROME — the tab title, the description, the headings, the back link and the notice
 *      below — is in all nine UI languages, because those are labels.
 *    · THE DOCUMENT ITSELF is Japanese or English, because that is the only pair it has been
 *      written and checked in. A machine translation of a liability clause is a different
 *      document that nobody has read. The page SAYS so, in the reader's own language, and
 *      offers the choice rather than picking silently.
 *
 *  Same skeleton as sources.html / science.html (css/pages.css, the .pg-* classes and the
 *  language picker) so the four reading pages are one family.
 * ==========================================================================*/

window.IntMapLegalPage = (function () {
  'use strict';

  var STORE = 'intmap_science_lang';        /* the key the reading pages have shared since #R211 */

  /* ── the chrome, in the nine UI languages ──────────────────────────────────────────────────
     `terms` / `privacy` / `back` are the app's own strings, copied from js/locales/ui.*.js
     (`lnkTerms` / `lnkPrivacy`) and js/locales/pages.*.js (`common.backToMap`) so the four
     reading pages and the app footer name these documents identically. */
  var S = {
    en: { terms: 'Terms of Service', privacy: 'Privacy Policy', back: 'Back to the map',
          note: 'These documents are published in Japanese and English only. A machine translation of a legal text is not the same document, so only a version we have checked is shown.' },
    ja: { terms: '利用規約', privacy: 'プライバシーポリシー', back: '地図に戻る',
          note: '本文書は日本語と英語でのみ公開しています。法務文書の機械翻訳は同じ文書ではないため、当方が内容を確認した版だけを表示します。' },
    de: { terms: 'Nutzungsbedingungen', privacy: 'Datenschutzerklärung', back: 'Zurück zur Karte',
          note: 'Diese Dokumente werden nur auf Japanisch und Englisch veröffentlicht. Die maschinelle Übersetzung eines Rechtstextes ist nicht dasselbe Dokument, daher wird nur eine von uns geprüfte Fassung angezeigt.' },
    ru: { terms: 'Условия использования', privacy: 'Политика конфиденциальности', back: 'Назад к карте',
          note: 'Эти документы публикуются только на японском и английском языках. Машинный перевод юридического текста — не тот же документ, поэтому показывается только проверенная нами версия.' },
    es: { terms: 'Términos del servicio', privacy: 'Política de privacidad', back: 'Volver al mapa',
          note: 'Estos documentos se publican únicamente en japonés e inglés. La traducción automática de un texto legal no es el mismo documento, por lo que solo se muestra una versión que hemos revisado.' },
    fr: { terms: 'Conditions d’utilisation', privacy: 'Politique de confidentialité', back: 'Retour à la carte',
          note: 'Ces documents ne sont publiés qu’en japonais et en anglais. La traduction automatique d’un texte juridique n’est pas le même document ; seule une version que nous avons vérifiée est affichée.' },
    ko: { terms: '이용약관', privacy: '개인정보 처리방침', back: '지도로 돌아가기',
          note: '이 문서는 일본어와 영어로만 제공됩니다. 법률 문서의 기계 번역은 같은 문서가 아니므로, 저희가 확인한 판본만 표시합니다.' },
    'zh-hant': { terms: '服務條款', privacy: '隱私權政策', back: '回到地圖',
          note: '本文件僅以日文與英文發布。法律文件的機器翻譯並非同一份文件，因此只顯示我們確認過的版本。' },
    'zh-hans': { terms: '服务条款', privacy: '隐私权政策', back: '回到地图',
          note: '本文件仅以日文与英文发布。法律文件的机器翻译并非同一份文件，因此只显示我们确认过的版本。' }
  };
  var FALLBACK = 'en';

  function reg() { return window.IntMapLang || null; }

  /* the app writes Japanese as 'jp' and Traditional Chinese as 'zh'; every page writes the
     BCP-47 tag. The registry owns both spellings, so ask it and fall back to the 'jp' case. */
  function normalise(c) {
    c = String(c || '').toLowerCase();
    var R = reg();
    try { if (R && R.has(c)) return String(R.htmlTag(c)).toLowerCase(); } catch (e) {}
    return (c === 'jp') ? 'ja' : c;
  }
  function chrome(code) { return S[code] || S[FALLBACK]; }

  function detectUi() {
    var q = null;
    try { q = new URLSearchParams(location.search).get('lang'); } catch (e) {}
    if (q && S[normalise(q)]) return normalise(q);
    var saved = null;
    try { saved = localStorage.getItem(STORE); } catch (e) {}
    if (saved && S[normalise(saved)]) return normalise(saved);
    try {
      var s = JSON.parse(localStorage.getItem('intmap_settings') || '{}');
      if (s && s.lang && S[normalise(s.lang)]) return normalise(s.lang);
    } catch (e) {}
    var navs = [];
    try { navs = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language || '']; } catch (e) {}
    for (var i = 0; i < navs.length; i++) {
      var c = normalise(String(navs[i]).toLowerCase());
      if (S[c]) return c;
      c = normalise(String(navs[i]).slice(0, 2).toLowerCase());
      if (S[c]) return c;
    }
    return FALLBACK;
  }

  /* Which of the TWO texts to show. `?text=ja|en` wins; otherwise Japanese readers get the
     Japanese one and everyone else the English one — and the switch is always visible. */
  var textLang = null;
  function detectText(ui) {
    var q = null;
    try { q = new URLSearchParams(location.search).get('text'); } catch (e) {}
    if (q === 'ja' || q === 'en') return q;
    return (ui === 'ja') ? 'ja' : 'en';
  }

  /* the app's own theme, so this page opens in the mode the map was in */
  function applyTheme() {
    try {
      var s = JSON.parse(localStorage.getItem('intmap_settings') || '{}');
      if (s && (s.theme === 'light' || s.theme === 'dark')) document.documentElement.setAttribute('data-theme', s.theme);
    } catch (e) {}
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  var which = 'privacy', uiLang = FALLBACK, built = false;

  function buildPicker() {
    var host = document.querySelector('.pg-lang');
    if (!host || built) return;
    built = true;
    var R = reg();
    var rows = (R && R.LANGS) ? R.LANGS : [{ code: 'en', label: 'English', html: 'en' }];
    host.appendChild(el('span', 'pg-lang-globe', '\u{1F310}'));
    var sel = document.createElement('select');
    sel.id = 'pg-lang-select';
    sel.setAttribute('aria-label', 'Language');
    rows.forEach(function (l) {
      var tag = normalise(l.code);
      if (!S[tag]) return;                       /* only languages this page has chrome for */
      var o = document.createElement('option');
      o.value = tag; o.textContent = l.label;
      sel.appendChild(o);
    });
    sel.value = uiLang;
    sel.addEventListener('change', function () { setLang(sel.value); });
    host.appendChild(sel);
    host.appendChild(el('span', 'pg-lang-chev', '▾'));
  }

  function render() {
    var c = chrome(uiLang);
    var title = (which === 'terms') ? c.terms : c.privacy;
    var T = window.IntMapLegalText;

    document.documentElement.setAttribute('lang', uiLang);
    document.title = 'IntMap — ' + title;
    var m = document.querySelector('meta[name="description"]');
    if (m) m.setAttribute('content', title + ' — IntMap.');

    var back = document.querySelector('.pg-back');
    if (back) {
      back.innerHTML = '← <span class="pg-back-t"></span>';
      back.querySelector('.pg-back-t').textContent = c.back;
      back.setAttribute('aria-label', c.back);
    }
    var sib = document.querySelector('.pg-sibling');
    if (sib) {
      var otherName = (which === 'terms') ? c.privacy : c.terms;
      sib.href = (which === 'terms') ? './privacy.html' : './terms.html';
      sib.innerHTML = '<span class="pg-sibling-t"></span> →';
      sib.querySelector('.pg-sibling-t').textContent = otherName;
      sib.setAttribute('aria-label', otherName);
    }

    var root = document.getElementById('pg-root');
    if (!root) return;
    root.innerHTML = '';

    var hero = el('header', 'pg-hero');
    hero.appendChild(el('h1', null, title));
    hero.appendChild(el('p', 'pg-sub', c.note));
    root.appendChild(hero);

    /* the two-language switch — a real control, not a sentence telling you to edit the URL */
    var pickRow = el('nav', 'lg-textpick');
    T && T.langs.forEach(function (code) {
      var b = el('button', 'lg-textbtn' + (code === textLang ? ' is-on' : ''), code === 'ja' ? '日本語' : 'English');
      b.type = 'button';
      b.setAttribute('aria-pressed', code === textLang ? 'true' : 'false');
      b.addEventListener('click', function () { textLang = code; syncUrl(); render(); });
      pickRow.appendChild(b);
    });
    root.appendChild(pickRow);

    var sec = el('section', 'pg-sec');
    sec.id = which;
    if (T) sec.innerHTML = T.html(which, textLang === 'ja' ? 'jp' : 'en');
    root.appendChild(sec);

    var foot = el('footer', 'pg-foot');
    var p = el('p');
    var a = el('a', null, '← ' + c.back);
    a.href = './index.html';
    p.appendChild(a); foot.appendChild(p);
    root.appendChild(foot);

    window.scrollTo(0, 0);
  }

  /* keep the URL shareable: whatever is on screen is what the link reproduces */
  function syncUrl() {
    try {
      var u = new URL(location.href);
      u.searchParams.set('lang', uiLang);
      u.searchParams.set('text', textLang);
      history.replaceState(null, '', u.toString());
    } catch (e) {}
  }

  function setLang(code) {
    uiLang = S[code] ? code : FALLBACK;
    try { localStorage.setItem(STORE, uiLang); } catch (e) {}
    syncUrl();
    render();
  }

  function mount(w) {
    which = (w === 'terms') ? 'terms' : 'privacy';
    applyTheme();
    uiLang = detectUi();
    textLang = detectText(uiLang);
    buildPicker();
    render();
  }

  return { mount: mount, _strings: S };
})();
