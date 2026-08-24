/* ============================================================================
 *  IntMap · THE APP'S TEXT — which face draws it, and how wide it comes out   (#R242)
 * ----------------------------------------------------------------------------
 *  Three answers to one subject, all of which used to sit inline in js/app-body.js and none of which
 *  belongs to the shell (tests/r168 #8 and tests/r200 ⑤ budget that file; the rule is that a feature
 *  moves OUT, never that the ceiling moves up).
 *
 *  ① WHICH FACE.  「IntMap内のすべての文字は…Latin/Cyrillic → Inter、日本語 → Noto Sans JP、
 *    简体 → Noto Sans SC、繁體 → Noto Sans TC、한국어 → Pretendard。地名ラベルも例外ではない。」
 *    css/fonts.css answers that for the PAGE. A symbol layer does not read CSS, so the map is
 *    answered in two more places:
 *      · CJK and Hangul — MapLibre rasterises those blocks in the BROWSER from a CSS family
 *        (`localIdeographFontFamily`), so `cjkFamily()` hands it the same stack css/fonts.css gives
 *        the UI for the current language. One screen, one typeface.
 *      · Latin and Cyrillic — those come from SDF atlases, and no public glyph server has Inter
 *        (measured: `Inter Regular/0-255.pbf` is a 404 on tiles.openfreemap.org, and
 *        fonts.openmaptiles.org publishes Metropolis / Open Sans / Noto only). So the app ships its
 *        own, generated from the bundled font by scripts/build-glyphs.mjs, and `glyphRewrite()`
 *        points the renderer at them.
 *        ⚠ IT REWRITES THE URL, NOT THE STYLE. Forty-odd symbol layers in this app — and every one a
 *        module adds later — ask for the fontstack «Noto Sans Regular»; MapLibre's glyph parser reads
 *        only the GLYPHS out of the response and never checks the name inside it. Redirecting the
 *        ranges turns every Latin and Cyrillic label into Inter at once, with no per-layer edit and
 *        therefore no round of «this layer was missed» afterwards. The atlases are a strict SUPERSET
 *        of the Noto ranges they replace (a codepoint Inter lacks keeps its Noto glyph), so nothing
 *        drawn today stops being drawn, and ranges outside GLYPH_RANGES — Arabic, Thai, Devanagari,
 *        Hebrew, the CJK atlases a non-CJK UI still needs — are untouched.
 *
 *  ② HOW WIDE.  「ニュースピンから出る帯は重なりすぎないようにしろ。」 #R36 took the news bands out of
 *    GL's own collision (they were losing it to base-map place labels) and de-clutters them in JS
 *    instead — which only works if the box reserved for a pill is the box the pill will occupy. It
 *    was `min(len,16)·6.4 + 28` wide and 19 px tall: the layer carries `text-max-width:14` em so a
 *    headline WRAPS (two and three-line pills are the common case, all of them given 19 px), and
 *    6.4 px a character is a Latin average while a Japanese headline is about twice that per glyph.
 *    `bandBox()` measures the string the way the renderer will draw it — the real text size at this
 *    zoom (js/label-scale.js owns that ladder), a canvas measurement in the app's own font, a greedy
 *    wrap at 14 em, and the layer's `icon-text-fit-padding` added back.
 *
 *  ③ THE FLAGS, which are text too — see `installFlagFont` at the bottom.
 * ==========================================================================*/
window.IntMapMapTypography = (function () {
  /* the ranges scripts/build-glyphs.mjs emits. ⚠ tests/r242-checks asserts this list is identical to
     that script's RANGES — one list, two readers ([[intmap-recurring-lessons]] G). */
  const GLYPH_RANGES = [0, 256, 512, 768, 1024, 1280, 7680, 8192, 8448, 8704];
  const GLYPH_STACK = 'Inter Regular';

  /* ══ ⚠⚠ (#R253) THIS WAS ANSWERING WITH THE BCP-47 TAG, NOT THE APP'S LANGUAGE CODE ═════════════
     `window.IM_HOST` and `window.currentLang` do not exist — `IM_HOST` is a module-local `const` in
     js/app-body.js and was never published — so since #R242 every caller has been handed
     `document.documentElement.lang`. For Japanese that is 「ja」 while this app's code is 「jp」, and
     nothing noticed because `cjkFamily()`'s JP branch is its DEFAULT branch: the wrong answer and the
     right answer happened to be the same string. It stopped being harmless the moment a caller looked
     the code up in a table (`placeFont` asks `IntMapOsmNameKeys`, which is keyed by app code and
     returned no Japanese key at all — measured: `OSM_NAME_KEYS('ja')` → ['name:en','name:latin',
     'name_int'], so every label fell to the reader's stack and the per-label choice never happened).
     ⚠ THE TAG IS WALKED BACK THROUGH THE ONE LIST that produced it (`IntMapLang.LANGS[].html`), not
     through a second table — a language added to the registry needs no edit here. */
  function _lang() {
    try {
      var raw = String(document.documentElement.lang || 'en').toLowerCase();
      var R = window.IntMapLang;
      if (!R) return raw;
      if (R.has && R.has(raw)) return R.normalise(raw);
      var rows = R.LANGS || [];
      for (var i = 0; i < rows.length; i++) {
        if (String(rows[i] && rows[i].html || '').toLowerCase() === raw) return rows[i].code;
      }
      return R.normalise ? R.normalise(raw) : raw;
    } catch (_) { return 'en'; }
  }
  /* A language whose script MapLibre does not treat as "local ideograph" (fr, de, ru, es, en) still
     gets a stack: a French map of Japan writes the Japanese exonyms it has, and those glyphs come
     from here. */
  function cjkFamily() {
    const l = _lang(), jp = "'Noto Sans JP'", sc = "'Noto Sans SC'", tc = "'Noto Sans TC'", ko = 'Pretendard', tail = ',sans-serif';
    if (l === 'zh-hans') return sc + ',' + tc + ',' + jp + ',' + ko + tail;
    if (l === 'zh' || l === 'zh-hant') return tc + ',' + sc + ',' + jp + ',' + ko + tail;
    if (l === 'ko') return ko + ',' + jp + ',' + tc + ',' + sc + tail;
    return jp + ',' + tc + ',' + sc + ',' + ko + tail;   /* jp, and the default for a Latin UI */
  }
  /* ══ ⚠⚠⚠ (#R252) …AND THE RENDERER IS TOLD, EVERY TIME THE LANGUAGE CHANGES ═══════════════════
     `cjkFamily()` has answered correctly since #R242 and was asked exactly once — in the map's
     constructor options (js/app-body.js). So a reader who SWITCHED to 简体中文 (the only way to get
     there; nothing auto-detects) kept the boot language's stack, and the browser's per-character
     fallback split every Japanese place name across two faces: the kanji Japanese shares came from
     Noto Sans JP, the simplified-only characters from Noto Sans SC. That is 「簡体字に変換した部分
     だけ別のフォントになって浮く」, and it applies to every language pair, not just this one.
     ⚠ IDEMPOTENT AND FREE WHEN NOTHING CHANGED — the adapter returns early when the family is
     already the one asked for, so the boot language never pays for a glyph reload. */
  /* ══ ⚠⚠⚠ (#R253) THE FACE FOLLOWS THE LABEL'S LANGUAGE, NOT THE READER'S ═══════════════════════
     「日本語の地名は日本語フォント、中国語の地名は中国語フォント。中国語設定の日本語地名は中国語
       フォントに統一。」
     `cjkFamily()` above answers 「which face does THIS READER get」, and that question cannot produce
     a single-face label: a Japanese reader looking at 南护城河 needs Noto Sans JP for 南城河 and
     something else for 护, because Google's Noto Sans JP genuinely does not carry the
     simplified-only characters (measured: 东县岛宫庆贵护凤 are all absent). Over 687 real labels
     pulled from the tiles in Tokyo/Osaka/Beijing/Shanghai/Taipei/Guangzhou, 216 — 31.4 % — came out
     in more than one face under the ja stack, and 185 (26.9 %) under the zh-Hant one.
     ⚠ SO THE LABEL PICKS, NOT THE READER. `placeFont()` is a data-driven `text-font`: a feature that
     carries the reader's own name key is drawn in the reader's face, and one that does not — i.e. the
     label is the LOCAL name, in somebody else's script — is drawn wholly in Noto Sans SC, the one
     Google face measured to carry Japanese, Traditional and Simplified together. Measured coverage:
     in Japan 100 % of place features carry `name:ja` (Tokyo 20/20, Osaka 33/33, Sendai 7/7); in
     Beijing 44 %, Shanghai 38 %, Taipei 0 % — which is exactly the split wanted, because the ones
     that DO carry it are the ones whose drawn text is the Japanese exonym.
     ⚠ AND THE CONDITION IS THE SAME `coalesce` THAT CHOOSES THE TEXT (js/place-labels.js
     `applyLabelLang`), read from `IntMapOsmNameKeys` rather than from a second copy of the list.
     ⚠⚠⚠ AND THE `text-font` IS *HOW* THE FACE IS DELIVERED, not merely which layer gets which name.
     `localIdeographFontFamily` — the whole #R242 / #R252 mechanism — never reached a single map label:
     MapLibre 5's `_drawGlyph` only consults it when the stack IS the style-spec default
     («Open Sans Regular,Arial Unicode MS Regular»), and this app's layers asked for «Noto Sans
     Regular». For every other stack MapLibre builds its rasteriser from `_createTinySDF(stack)` —
     i.e. it treats THE STACK NAME AS A CSS FONT-FAMILY LIST. «Noto Sans Regular» is not an installed
     family, so it fell to the generic `sans-serif` and Windows' per-character font linking drew
     Japanese kanji, simplified-only and traditional-only characters in three different SYSTEM faces
     inside one place name. Measured on the shipped build after panning across Tokyo:
       entries['Noto Sans Regular']  cjk 111 cached · ideographTinySDF **null**
                                     tinySDF.ctx.font  48px "Noto Sans Regular", sans-serif
     Naming the real families in `text-font` is therefore the fix AND the delivery mechanism in one:
       48px "Noto Sans JP", "Noto Sans SC", sans-serif   ← measured, after
     No renderer patch is involved; this is MapLibre's own documented-by-code behaviour. */
  const HAN_ALL = 'Noto Sans SC';        /* the one Google face measured to cover JP ∪ TC ∪ SC */
  function _readerFaces() {
    const l = _lang();
    if (l === 'zh-hans') return [HAN_ALL];
    if (l === 'zh' || l === 'zh-hant') return ['Noto Sans TC', HAN_ALL];
    if (l === 'ko') return ['Pretendard', HAN_ALL];
    return ['Noto Sans JP', HAN_ALL];    /* ja, and the default for a Latin UI */
  }
  /* the `text-font` for a place-name layer: the reader's face when the label IS in the reader's
     language, the pan-Han face when it is somebody else's local name. */
  /* the `text-font` for a layer whose text is ALREADY in the reader's language — the curated sea
     gazetteer resolves one string per feature (#R242), so there is no name key to test and the
     per-label `case` below would wrongly send every sea name to the pan-Han face. */
  function readerFont() { return _readerFaces(); }
  function placeFont() {
    const l = _lang(), own = _readerFaces();
    /* ⚠ THE TRADITIONAL SETTING NEEDS THE SAME `case`, NOT AN EXEMPTION. 「中国語設定の日本語地名は
       中国語フォントに統一」 reads as «one Chinese face for the whole label», and for zh-Hant that
       cannot be Noto Sans TC: measured, TC does not carry 区 / 渋 / 峠 / 蔵, so a Japanese place name
       under a Traditional UI came out TC+SC — 30.2 % of labels. Noto Sans SC is the Chinese face that
       can draw the whole of such a label, so a feature without a Chinese name key takes it whole.
       zh-Hans needs no branch of its own: both arms resolve to the same single face there. */
    let keys = [];
    try { keys = (window.IntMapOsmNameKeys && window.IntMapOsmNameKeys(l)) || []; } catch (_) { }
    /* the Latin keys are dropped: `name:en` / `name:latin` produce LATIN text, which never reaches
       this decision (it is drawn from the Inter atlases), so testing them would send every CJK
       fallback label to the reader's stack. */
    keys = keys.filter((k) => /^name:/.test(k) && k !== 'name:latin' && k !== 'name:en');
    /* ⚠ A LATIN UI HAS NO CJK KEY OF ITS OWN, AND STILL NEEDS THE SAME RULE. `_readerFaces()` puts
       Noto Sans JP first for en/de/fr/ru/es because the CJK such a reader meets is the Japanese
       exonym the tiles carry (#R242) — so the key that justifies that face is the Japanese one. An
       English map of China then falls to `name`, which is Chinese, and gets the pan-Han face whole. */
    if (!keys.length) keys = ['name:ja'];
    return ['case', ['any'].concat(keys.map((k) => ['has', k])), ['literal', own], ['literal', [HAN_ALL]]];
  }
  function syncCjkFamily() {
    try {
      var GE = window.IntMapGeoEngine;
      if (!GE || !GE.scene || !GE.scene.setCjkFontFamily) return false;
      return !!GE.scene.setCjkFontFamily(cjkFamily());
    } catch (_) { return false; }
  }
  try { window.addEventListener('intmap-lang', syncCjkFamily); } catch (_) { }

  /* ⚠ (#R253) …AND THE SERVER HAS NEVER HEARD OF THOSE STACK NAMES. `text-font` doubles as the glyph
     URL, so a stack called «Noto Sans JP,Noto Sans SC» would 404 for every range the local
     rasteriser does NOT handle (Arabic, Thai, Devanagari…). The Latin/Cyrillic ranges already come
     from this origin's Inter atlases; everything else is folded back onto the one stack OpenFreeMap
     actually serves, so a non-CJK label in a place-name layer is byte-identical to before. */
  const SERVER_STACK = 'Noto Sans Regular';
  function glyphRewrite(url, type) {
    try {
      if (type !== 'Glyphs' || typeof url !== 'string') return undefined;
      const m = /\/fonts\/([^/]+)\/(\d+)-(\d+)\.pbf/.exec(url);
      if (!m) return undefined;
      if (GLYPH_RANGES.indexOf(+m[2]) >= 0) return { url: new URL('fonts/' + encodeURIComponent(GLYPH_STACK) + '/' + m[2] + '-' + m[3] + '.pbf', document.baseURI).href };
      const stack = decodeURIComponent(m[1]);
      if (!/Noto Sans (JP|SC|TC)|Pretendard/.test(stack)) return undefined;
      return { url: url.replace('/fonts/' + m[1] + '/', '/fonts/' + encodeURIComponent(SERVER_STACK) + '/') };
    } catch (_) { return undefined; }
  }

  let _ctx = null, _px = 0; const _cache = new Map();
  function bandBox(txt) {
    const fallback = { w: Math.min(txt.length, 16) * 6.4 + 28, h: 19 };
    try {
      const z = window.IntMapGeoEngine.camera.getZoom();
      const px = Math.max(6, Math.round((window.IntMapLabelScale.subAt(z, 0.92) || 10) * 10) / 10);
      if (px !== _px) { _cache.clear(); _px = px; }
      const got = _cache.get(txt); if (got) return got;
      if (!_ctx) { const c = document.createElement('canvas'); _ctx = c.getContext('2d'); }
      if (!_ctx) return fallback;
      _ctx.font = px + 'px ' + (getComputedStyle(document.body).fontFamily || 'sans-serif');
      const maxW = 14 * px;                       /* the layer's text-max-width, in the renderer's ems */
      const parts = txt.split(/(\s+)/).filter((t) => t !== '');
      const lines = []; let cur = '';
      const push = () => { if (cur !== '') { lines.push(cur); cur = ''; } };
      for (const part of parts) {
        if (/^\s+$/.test(part)) { if (cur !== '') cur += ' '; continue; }
        let word = part;
        while (word) {
          const tryS = cur + word;
          if (_ctx.measureText(tryS).width <= maxW) { cur = tryS; word = ''; }
          else if (cur === '') {
            /* a word longer than a whole line — CJK has no spaces, so cut it where it fits */
            let n = 1; while (n < word.length && _ctx.measureText(word.slice(0, n + 1)).width <= maxW) n++;
            cur = word.slice(0, n); word = word.slice(n); push();
          } else push();
        }
      }
      push();
      const wide = lines.reduce((m, l) => Math.max(m, _ctx.measureText(l).width), 0);
      const box = { w: Math.ceil(Math.min(wide, maxW)) + 18, h: Math.ceil(Math.max(1, lines.length) * px * 1.2) + 4 };
      if (_cache.size > 4000) _cache.clear();
      _cache.set(txt, box);
      return box;
    } catch (_) { return fallback; }
  }

  /* ══ (#R416) WHAT THE BAND SAYS ══════════════════════════════════════════════════════════════
     One rule, one place. The pill beside a news pin is a HEADLINE PREVIEW, and until #R416 the
     rule that shortens it lived inside `analyzeContext` (js/news-context.js) — a function the
     EVENT path never calls. So the event path filled the field the layer reads with `''`
     (js/news-events.js) and the layer, whose `icon-text-fit:'both'` has nothing to fit when the
     text is empty, drew the pill sprite at its natural size: measured 46 of 46 bands on screen
     were empty white boxes. ⚠ The fix is not "give events their own shortener" — that is how the
     two answers disagreed in the first place. `bandBox()` two hundred lines above already owns how
     wide this string comes out; owning what the string IS belongs beside it, and both news paths
     now call this one function.
     ⚠ The `…` is appended only when something was actually cut. The old rule appended it to every
     Latin headline, so a five-word headline claimed to be truncated when it was complete. */
  function bandText(title) {
    const t = String(title == null ? '' : title).trim();
    if (!t) return '';
    if (_lang() === 'jp') return t.length > 20 ? t.slice(0, 20) + '…' : t;
    const w = t.split(/\s+/);
    return w.length > 5 ? w.slice(0, 5).join(' ') + '…' : t;
  }

  /* ══ (#R242) …AND WHICH BANDS GET THE ROOM ════════════════════════════════════════════════════
     Moved here from js/app-body.js with `bandBox`, because it is the same subject and because that
     file is under a shrink-only ceiling. `feats` is the caller's list — this module holds no app
     state. (#R161) everything below talks to IntMapGeoEngine rather than to the raw renderer. */
  function declutterNewsBands(feats) {
    try {
      const GE = window.IntMapGeoEngine; if (!GE) return;
      if (!GE.layers.hasSource('news-points') || !GE.layers.has('news-labels')) return;
      feats = feats || []; if (!feats.length) return;
      const sz = GE.render.size(), W = sz.width, H = sz.height;
      const M = 48;   /* off-screen margin: keep a band as the pin scrolls just past the edge */
      const items = [];
      for (const f of feats) {
        const g = f.geometry, p = f.properties || {}; const fid = p.fid;
        if (!g || g.type !== 'Point' || fid == null) continue;
        let pt; try { pt = GE.coords.project(g.coordinates); } catch (_) { continue; }
        if (!pt) continue;
        if (pt.x < -M || pt.x > W + M || pt.y < -M || pt.y > H + M) { items.push({ fid, off: true }); continue; }
        const box = bandBox(String(p.short || p.title || ''));
        const pr = (p.mapped === 'true') ? 0 : (p.mapped === 'publisher') ? 1 : 2;
        items.push({ fid, x: pt.x, y: pt.y, w: box.w, h: box.h, pr });
      }
      const vis = items.filter((i) => !i.off).sort((a, b) => a.pr - b.pr || a.y - b.y || a.x - b.x);
      const claimed = [], win = new Set();
      /* ⚠ (#R242) the pills are kept APART, not merely non-overlapping: a 2 px kiss reads as a
         collision at a glance, and the reported defect is 「重なりすぎ」. */
      const GAP = 5;
      const hit = (r) => { for (const c of claimed) { if (r.x < c.x + c.w + GAP && r.x + r.w + GAP > c.x && r.y < c.y + c.h + GAP && r.y + r.h + GAP > c.y) return true; } return false; };
      for (const it of vis) { const r = { x: it.x + 9, y: it.y - it.h / 2, w: it.w, h: it.h }; if (!hit(r)) { claimed.push(r); win.add(it.fid); } }
      for (const it of items) { try { GE.layers.setFeatureState({source:'news-points',id:it.fid}, { bnd: win.has(it.fid) }); } catch (_) { } }
    } catch (_) { }
  }

  /* ══ (#R79e / moved here #R242) THE COUNTRY-FLAG WEBFONT ══════════════════════════════════════
     「スマホでは国旗が出るがパソコンでは出ない」 — Windows ships NO flag glyphs in its emoji font, so a
     regional-indicator pair renders as letter boxes ("US"), never a flag. The Twemoji Country Flags
     face is self-hosted (~78 KB) and scoped by unicode-range to the flag codepoints ONLY, so it
     touches nothing else; it is applied only where the platform cannot draw flags itself, which is
     why phones and Macs keep their own.
     ⚠ (#R242) IT PREPENDS THE VARIABLE, NOT THE COMPUTED VALUE. Freezing `getComputedStyle(body)`
     into an inline style would outlive every language change now that css/fonts.css picks a face per
     <html lang> — a Japanese screen would keep the English stack and never load Noto Sans JP. */
  function installFlagFont() {
    try {
      const ff = document.createElement('style');
      ff.textContent = '@font-face{font-family:"Twemoji Country Flags";unicode-range:U+1F1E6-1F1FF,U+1F3F4,U+E0062-E0063,U+E0065,U+E0067,U+E006C,U+E006E,U+E0073-E0074,U+E0077,U+E007F;src:url("TwemojiCountryFlags.woff2") format("woff2");font-display:swap;}';
      document.head.appendChild(ff);
      /* a real flag paints colour; the letter-box fallback stays monochrome */
      const nativeFlags = () => {
        try {
          const c = document.createElement('canvas'); c.width = c.height = 16;
          const x = c.getContext('2d'); if (!x) return true;
          x.textBaseline = 'top'; x.font = '16px sans-serif'; x.fillStyle = '#000';
          x.fillText(String.fromCodePoint(0x1F1E8, 0x1F1E6), 0, 0);   /* CA — red and white */
          const d = x.getImageData(0, 0, 16, 16).data;
          for (let i = 0; i < d.length; i += 4) {
            if (d[i + 3] > 0 && (Math.abs(d[i] - d[i + 1]) > 28 || Math.abs(d[i + 1] - d[i + 2]) > 28 || Math.abs(d[i] - d[i + 2]) > 28)) return true;
          }
          return false;
        } catch (_) { return true; }
      };
      const ok = nativeFlags(); window.__flagFont = { native: ok, applied: false };
      const apply = () => {
        try {
          const b = document.body; if (!b) return false;
          if ((b.style.fontFamily || '').indexOf('Twemoji Country Flags') < 0) b.style.fontFamily = '"Twemoji Country Flags", var(--im-font)';
          window.__flagFont.applied = true; return true;
        } catch (_) { return false; }
      };
      window.__applyFlagFont = apply;   /* exposed so it can be forced if the canvas probe is unreliable */
      if (!ok) { if (!apply()) document.addEventListener('DOMContentLoaded', apply); }
    } catch (_) { }
  }
  installFlagFont();

  return { GLYPH_RANGES, GLYPH_STACK, cjkFamily, placeFont, readerFont, syncCjkFamily, glyphRewrite, bandBox, bandText, declutterNewsBands, installFlagFont };
})();
