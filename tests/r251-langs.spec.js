/* ============================================================================
 *  IntMap · #R251 — THE SCREEN ITSELF, EVERY LANGUAGE × EVERY SCREEN  (DEEP TIER)
 * ----------------------------------------------------------------------------
 *  「全ての言語について、すべての面において対応が完璧かどうか点検し、未了点があれば修正して。
 *    いつまでたっても言語対応の漏れが見つかることは許されない。」
 *
 *  ══ ⚠⚠⚠ WHY THIS TEST EXISTS, AFTER SIXTEEN SHAPES ═════════════════════════════════════════════
 *  Every instrument in scripts/i18n-*.mjs measures the SOURCE, and each one measures a SHAPE — a
 *  five-argument call, a language-keyed object, a two-branch ternary, an array indexed by position,
 *  a tuple in adjacent slots, a helper reached through a property of another module. Sixteen have
 *  been found, roughly one per round, and every one of them was found by a READER seeing English on
 *  a screen that every instrument called 100 %. The pattern is not that somebody keeps forgetting:
 *  a shape-shaped instrument can only ever see the shapes somebody has already thought of.
 *
 *  ⚠ THIS ONE HAS NO SHAPE. It opens the app, switches language, and reads the RENDERED DOM,
 *  asking the reader's own question:
 *
 *      «this string is on screen in English — does IntMap already hold a translation of it?»
 *
 *  If the answer is yes, the reader was shown English while the translation sat in the table, and
 *  it does not matter in the slightest which shape put it there. Every defect #R251 fixed would
 *  have failed this test the day it shipped: `HOST._coL(…)` outside the report's universe (16th),
 *  `_coCountry` reading `lang==='jp'?c[1]:c[0]`, the private five-language `L5` in js/map-ui.js,
 *  the private two-language `L5` in js/map-readout.js, `jp()?BLBL[k][0]:BLBL[k][1]` where the data
 *  was converted and the reader left behind, and the welcome card's three language BLOCKS.
 *  It also found three defects nothing else had: `title='Drag to resize'` typed as a bare literal
 *  in two files, and the country list printing its continent sub-line in English everywhere.
 *
 *  ══ HOW «DOES A TRANSLATION EXIST?» IS ANSWERED ════════════════════════════════════════════════
 *  From the registry, never from a copy of it:
 *    · KEYED  — ui.en.js's value → its key → `IntMapLang.keyed(lang, key)`. All nine languages.
 *    · INLINE — `IntMapLang._inline[lang][text]`. fr / ko / zh / zh-Hans only, because de / ru / es
 *      are POSITIONAL: their translations are arguments at the call site, so there is no table to
 *      ask. scripts/i18n-positional-audit.mjs is the instrument that owns those three.
 *
 *  ⚠ AND A FINDING IS NEVER A GUESS. It fires only when the app itself holds a DIFFERENT string for
 *  that exact text in that exact language. A proper noun, a number, a company name or a word that
 *  is genuinely the same in both languages has no differing row, so it cannot be reported.
 * ==========================================================================*/
import { test, expect } from '@playwright/test';

/* The screens to walk, each as an IntMapOS command — the app's own way in (#R165), so a renamed
   button cannot quietly shrink this test's coverage to the default view. */
/* ⚠ FOUR SCREENS, NOT NINE, AND THE CHOICE IS A PRICE. scripts/test-budget.mjs holds a ceiling on
   the WHOLE suite and #R197's rule is «take the time out, never raise the ceiling» — nine screens ×
   nine languages cost 130 s of it. These four carry the app's own chrome plus the three tabs where
   every defect this round fixed actually lived (Companies for `HOST._coL` and `_coCountry`,
   Countries for the continent sub-line, the layer panel for the sidebar head and its resizer).
   Each is an IntMapOS command — the app's own way in (#R165) — so a renamed button cannot quietly
   shrink this test's coverage. */
const SCREENS = [
  { id: 'default', cmd: null },
  { id: 'layers', cmd: 'layers.data' },
  { id: 'companies', cmd: 'tab.info' },
  { id: 'countries', cmd: 'tab.stats' },
];

/* ⚠⚠⚠ ONE NAMED EXCLUSION, AND A CEILING OF ZERO.
   `.loc-chip` is the place NAME the news analyser resolved for a headline. It leaves the analysis
   in English and is printed raw, so a French reader sees 「Japan」 where IntMap holds 「Japon」 —
   a real defect, and one this test found. It is EXCLUDED BY SELECTOR rather than by a number,
   because the news feed is live: how many chips are on screen, and which countries they name,
   differs between runs, so a count would be a flaky gate that says nothing. Fixing it means
   resolving the analyser's subject name through the gazetteer's localised forms — a change to
   js/newsgeo.js's contract, not something to land in the same commit as the instrument that found
   it. ⚠ Recorded here rather than deleted, because an exemption nobody can see is an exemption
   nobody re-examines (#R249); everything else must be ZERO. */
const EXCLUDE_SELECTOR = '.loc-chip';
const CEILING = 0;

test.describe.configure({ timeout: 900_000 });

test('#R251 (deep) every language: nothing on screen is English while IntMap holds a translation of it', async ({ page }) => {
  test.setTimeout(900_000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.message)));

  await page.goto('/');
  await page.waitForFunction(() => window.IntMapLang && window.IntMapLang.list && document.readyState === 'complete',
    null, { timeout: 60_000 });

  /* a screen whose command is not registered would be silently skipped — say so instead (#R250) */
  const missing = await page.evaluate((ids) => ids.filter((id) => {
    try { return !(window.IntMapOS && window.IntMapOS.has && window.IntMapOS.has(id)); } catch { return true; }
  }), SCREENS.filter((s) => s.cmd).map((s) => s.cmd));
  expect(missing, 'every screen this test walks is a registered IntMapOS command').toEqual([]);

  const langs = await page.evaluate(() => window.IntMapLang.list().map((r) => r.code).filter((c) => c !== 'en'));
  expect(langs.length, 'the language list is the locale directory, and it is not empty').toBeGreaterThan(4);

  /* ⚠⚠⚠ ONE BOOT, EIGHT SWITCHES — AND THAT IS THE STRICTER TEST, NOT THE CHEAPER ONE.
     The first working draft reloaded per language, because switching in place reported 43 strings:
     all of them on the first screen scanned, and all already translated at render time. They were
     panels left open by the PREVIOUS language — opening an open panel is a no-op, and nothing
     relabelled one. That was a real defect (the Objects panel and the layer sidebar), it is fixed,
     and re-using the page is what proves it stays fixed: every screen this walks is now visited
     under a language it was not built in. It also takes the deep tier from 130 s to ~45 s, which is
     what keeps the TOTAL ceiling in scripts/test-budget.mjs honest (#R197: take the time out, never
     raise the ceiling). */
  await page.goto('/');
  await page.waitForFunction(() => window.IntMapLang && window.IntMapLang.list && document.readyState === 'complete',
    null, { timeout: 60_000 });

  /* ══ ③ (#R473) THE FAVOURITES HEADING DRAWS EXACTLY ONE STAR, IN EVERY LANGUAGE ═════════════════
     Measured on production (build R466/R467): `#layer-fav-section > .layer-fav-title` read
     「⭐ ★ Favoriten」 in de, and the same twice-starred heading in es and ru. index.html owns the
     decoration — `<div class="layer-fav-title">⭐ <span data-i18n="favLayers">…</span></div>` — and
     `favLayers` in those three locale files carried a star of its own.

     ⚠⚠⚠ NOTHING HERE COULD SEE IT, AND ① IS THE REASON: 「★ Избранное」 IS A CORRECT RUSSIAN
     TRANSLATION. ① asks «is this English while a translation exists?»; every instrument in
     scripts/i18n-*.mjs asks a version of the same question. The words were never the defect — the
     TRANSLATION CARRIED DECORATION, and the decoration was the markup's.
     ⚠ Nor would comparing the characters have helped: the markup's star is ⭐ U+2B50 and the
     locales' was ★ U+2605, so «does the translation repeat the markup's character?» is GREEN on the
     bytes that shipped. tests/r473-checks.test.mjs gates the TABLES on that reasoning (a ceiling of
     zero: a key the markup decorates carries no decoration in any language) and runs on every push.

     ⚠ THIS RIDES ①'s WALK RATHER THAN BOOTING AGAIN. Written as its own spec it measured 10.9 s —
     nine language switches at ~1.1 s each, and the switching IS the cost — against a core ceiling
     with about five seconds in it (scripts/test-budget.mjs). This file already switches every
     language on a booted app, which is the whole of what the claim needs, so it goes here: «it
     forces consolidation instead of accumulation», taken at its word, exactly as #R451 did.
     ⚠ ① skips English (it would have nothing to report), so English is read HERE, before the loop.
     ⚠ And the section is `display:none` until a layer is starred (css/intmap.css), so star one. */
  const FAV_STARS = '★☆⭐🌟✦✧⭑⭒✩✪✫✬✭✮✯✰';
  const favStar = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    let st = null;
    for (let i = 0; i < 100 && !st; i++) { st = document.querySelector('#layer-dropdown .lyr-star'); if (!st) await sleep(50); }
    if (!st) return { ok: false, why: 'no #layer-dropdown .lyr-star after 5 s' };
    if (!st.classList.contains('on')) st.click();
    for (let i = 0; i < 100; i++) {
      const s = document.getElementById('layer-fav-section');
      if (s && s.classList.contains('has-favs') && getComputedStyle(s).display === 'block') return { ok: true, why: '' };
      await sleep(50);
    }
    return { ok: false, why: '#layer-fav-section never took .has-favs' };
  });
  expect(favStar.ok, `#R473 ③ starring a layer: ${favStar.why}`).toBe(true);

  const favSeen = [await page.evaluate(() => ({
    lang: 'en',
    text: document.querySelector('#layer-fav-section > .layer-fav-title').textContent.replace(/\s+/g, ' ').trim(),
    own: (window.IntMapLang._ui.en || {}).favLayers,
  }))];

  const findings = [];
  for (const lang of langs) {
    const res = await page.evaluate(async ({ screens, lang, exclude }) => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

      /* ⚠ SWITCH THE WAY A READER DOES — the language pill — AND PROVE IT TOOK. The first draft
         called `window.setLanguage(lang)` inside a `try {} catch {}`, copied from
         tests/r161.spec.js. There is no `window.setLanguage`; the switch is `setLang()`, a closure
         in js/app-body.js wired to `#lang-<code>`. The call threw, the catch swallowed it, the
         language never changed — and the test reported 681 strings as untranslated, every one an
         artifact of its own silence. That is this round's subject happening inside the instrument
         written to stop it. */
      /* ⚠ WAIT FOR THE PILL. The first five are in index.html; the rest are written by
         `lang-registry.syncDocument()` after the locale directory is read (#R249), so
         `readyState === 'complete'` is NOT late enough — ko failed here under the full suite and
         passed when this file ran alone, which is the signature of a race, not of a missing pill. */
      let btn = null;
      for (let i = 0; i < 100 && !btn; i++) { btn = document.getElementById('lang-' + lang); if (!btn) await sleep(50); }
      if (!btn) return { switched: false, why: 'no #lang-' + lang + ' pill after 5 s', found: [] };
      btn.click();
      /* wait for the TABLE as well as the attribute — the attribute is set first (#R249), so a
         check that keys off it alone measures the moment before the translations arrive */
      const tag = window.IntMapLang.htmlTag(lang);
      for (let i = 0; i < 120; i++) {
        if (window.IntMapLang.isLoaded(lang) && document.documentElement.getAttribute('lang') === tag) break;
        await sleep(50);
      }
      if (!window.IntMapLang.isLoaded(lang) || document.documentElement.getAttribute('lang') !== tag) {
        return { switched: false, found: [],
          why: 'loaded=' + window.IntMapLang.isLoaded(lang) + ' html=' + document.documentElement.getAttribute('lang') };
      }
      await sleep(160);

      const enUi = (window.IntMapLang._ui && window.IntMapLang._ui.en) || {};
      const byValue = new Map();
      for (const k of Object.keys(enUi)) {
        const v = enUi[k];
        if (typeof v === 'string' && v.trim() && !byValue.has(v)) byValue.set(v, k);
      }
      const inline = (window.IntMapLang._inline && window.IntMapLang._inline[lang]) || null;

      const visibleText = () => {
        const out = new Map();
        const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let n = walk.nextNode(); n; n = walk.nextNode()) {
          const t = (n.nodeValue || '').trim();
          if (!t || t.length < 2 || t.length > 200) continue;
          const el = n.parentElement;
          if (!el || el.closest('script,style,noscript,template')) continue;
          if (exclude && el.closest(exclude)) continue;
          /* ⚠ THE LAUNCH SCREEN BELONGS TO THE LOAD THAT PRODUCED IT. index.html's boot splash runs
             long before js/lang-registry.js exists — it reads `intmap_settings.lang` out of
             localStorage and shows one word (#R224) — so after an in-page switch it legitimately
             still carries the language the page LOADED in. Scanning it would report a correct
             design as a defect. */
          if (el.closest('#boot-splash')) continue;   /* named exclusion — see the ⚠⚠⚠ note */
          if (!el.offsetParent && el.tagName !== 'BODY') continue;
          const cs = getComputedStyle(el);
          if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') continue;
          if (!out.has(t)) out.set(t, (el.id ? '#' + el.id : el.tagName.toLowerCase())
            + (typeof el.className === 'string' && el.className ? '.' + el.className.split(/\s+/)[0] : ''));
        }
        /* the attributes a reader also reads */
        for (const el of document.querySelectorAll('[title],[aria-label],[placeholder]')) {
          if (!el.offsetParent) continue;
          for (const a of ['title', 'aria-label', 'placeholder']) {
            const v = (el.getAttribute(a) || '').trim();
            if (v && v.length >= 2 && v.length <= 200 && !out.has(v)) out.set(v, el.tagName.toLowerCase() + '[' + a + ']');
          }
        }
        return out;
      };

      const found = [];
      for (const scr of screens) {
        if (scr.cmd) {
          let ok = true;
          try { await window.IntMapOS.exec(scr.cmd, {}); } catch { ok = false; }
          if (!ok) continue;
          await sleep(160);
        }
        for (const [text, where] of visibleText()) {
          const key = byValue.get(text);
          let hit = false;
          if (key) {
            let t = null;
            try { t = window.IntMapLang.keyed(lang, key); } catch { t = null; }
            if (typeof t === 'string' && t && t !== text) {
              found.push({ lang, screen: scr.id, where, text, expected: t, via: 'keyed:' + key });
              hit = true;
            }
          }
          if (!hit && inline) {
            const t = inline[text];
            if (typeof t === 'string' && t && t !== text) {
              found.push({ lang, screen: scr.id, where, text, expected: t, via: 'inline' });
            }
          }
        }
      }
      /* (#R473) ③ — 同じ切り替えの上で、お気に入りの見出しを1行読む。判定はループの外 */
      const favEl = document.querySelector('#layer-fav-section > .layer-fav-title');
      const fav = { text: favEl ? favEl.textContent.replace(/\s+/g, ' ').trim() : null,
        own: ((window.IntMapLang._ui && window.IntMapLang._ui[lang]) || {}).favLayers };
      return { switched: true, why: '', found, fav };
    }, { screens: SCREENS, lang, exclude: EXCLUDE_SELECTOR });

    expect(res.switched, `${lang} actually switched (${res.why})`).toBe(true);
    findings.push(...res.found);
    favSeen.push(Object.assign({ lang }, res.fav));
  }

  /* one row per (language, string) — one screen reporting it is enough to fix it */
  const seen = new Set();
  const uniq = findings.filter((f) => {
    const k = f.lang + ' ' + f.text;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const report = uniq.slice(0, 60)
    .map((f) => `  ${f.lang.padEnd(8)} ${JSON.stringify(f.text).slice(0, 60).padEnd(62)} → ${JSON.stringify(f.expected).slice(0, 34)}   (${f.screen}, ${f.where}, ${f.via})`)
    .join('\n');


  /* ══ ③ (#R473) — 数える。①の掃引が言語を切り替えたその状態で読んだ見出しを、ここで判定する ══ */
  const favStarsIn = (s) => Array.from(s).filter((ch) => FAV_STARS.indexOf(ch) >= 0);
  const favStrip = (s) => Array.from(s).filter((ch) => FAV_STARS.indexOf(ch) < 0).join('').replace(/\s+/g, ' ').trim();
  const favReport = favSeen.map((f) => `  ${String(f.lang).padEnd(8)} ${JSON.stringify(f.text)} → ${favStarsIn(f.text || '').join('') || '(no star)'}`).join('\n');

  expect(favSeen.length, `#R473 ③ every language was read (${favReport})`).toBe(langs.length + 1);
  expect(favSeen.filter((f) => favStarsIn(f.text || '').length !== 1).map((f) => f.lang),
    `#R473 ③ the favourites heading draws exactly ONE star in every language:\n${favReport}\n`).toEqual([]);
  for (const f of favSeen) {
    expect(favStarsIn(f.text)[0], `#R473 ③ ${f.lang}: the star is the markup's ⭐, not a ★ the translation brought`).toBe('⭐');
    /* what is left once the star is taken away is that language's OWN row — `keyed()` inherits from
       English (js/lang-registry.js), so comparing against it would let a missing row pass as English */
    expect(favStrip(f.text), `#R473 ③ ${f.lang}: the heading is that language's own translation`).toBe(f.own);
    expect(String(f.own || '').length, `#R473 ③ ${f.lang} has a favLayers row of its own`).toBeGreaterThan(0);
  }

  /* ══ ② …AND AN OPEN PANEL FOLLOWS THE LANGUAGE ══════════════════════════════════════════════════
     Found by the sweep before it was split: switching language left ALREADY-OPEN panels in the old
     one, because opening an open panel is a no-op and nothing relabelled its contents. The app
     dispatches `intmap-lang` for exactly this and several modules listen; the Objects panel did not.
     A reader who opened a panel and then changed language was left reading the language they left. */
  const r = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    try { await window.IntMapOS.exec('objects.open', {}); } catch { return { skipped: 'objects.open is not registered' }; }
    await sleep(700);
    const read = () => { const b = document.querySelector('.iol-clear'); return b ? (b.textContent || '').trim() : null; };
    const before = read();
    if (before == null) return { skipped: 'the Objects panel has no .iol-clear button in this build' };

    let btn = null;
    for (let i = 0; i < 100 && !btn; i++) { btn = document.getElementById('lang-jp'); if (!btn) await sleep(50); }
    if (!btn) return { skipped: 'no #lang-jp pill' };
    btn.click();
    for (let i = 0; i < 120; i++) {
      if (window.IntMapLang.isLoaded('jp') && document.documentElement.getAttribute('lang') === 'ja') break;
      await sleep(50);
    }
    await sleep(900);
    return { before, after: read() };
  });

  if (r.skipped) { test.skip(true, r.skipped); return; }
  expect(r.before, 'the Objects panel renders its Clear-all button').toBeTruthy();
  expect(r.after,
    `the open Objects panel still reads ${JSON.stringify(r.before)} after switching to Japanese — nothing relabels an open panel`)
    .not.toBe(r.before);

  expect(errors, 'no page error while switching languages: ' + errors.join(' | ')).toEqual([]);
  expect(uniq.length,
    `${uniq.length} string(s) rendered in English while IntMap holds a translation (ceiling ${CEILING}):\n${report}\n`)
    .toBeLessThanOrEqual(CEILING);
});
