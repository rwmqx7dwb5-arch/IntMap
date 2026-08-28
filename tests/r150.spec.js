// R150 runtime regression tests — the work-order (#10) explicitly requires tests that VERIFY behavior,
// not just string existence. These exercise the code-side research-mapping audit + typography + Köppen
// stretch through the real page (IntMapAtlasDebug pure surface), fully hermetic (no network).
//   #10 model omits the list → text extraction; partial placement + text↔pins mismatch → verdict buckets;
//       same-name → ambiguous; one-domain sources → concentration; honest note rendering.
//   #4  flat run-on prose is grouped into stanzas; structured text is left untouched.
//   #3  Köppen legend can be dragged to the screen bottom (viewport-based ceiling).
import { test, expect } from '@playwright/test';
import { installHermeticRouting, collectPageDiagnostics } from './helpers/network.js';
import { seededStorageState } from './helpers/session-seed.js';

const CRITICAL = ['IntMapConsole', 'IntMapAtlasDebug'];
test.describe.configure({ mode: 'serial' });

let page, diag;
test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ storageState: seededStorageState() });
  await installHermeticRouting(context);
  page = await context.newPage();
  diag = collectPageDiagnostics(page);
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForFunction((g) => g.every((k) => typeof window[k] !== 'undefined'), CRITICAL, { timeout: 45_000 });
  await page.waitForTimeout(600);
});
test.afterAll(async () => { await page?.context()?.close(); });

test('#10 model OMITS the structured list — the major spots are still extracted from the answer text', async () => {
  const r = await page.evaluate(() => {
    const D = window.IntMapAtlasDebug;
    const text = "Kyoto's Fushimi Inari Taisha, Kinkaku-ji and the Arashiyama Bamboo Grove are its icons. Nearby, Nijo Castle and Gion draw visitors.";
    return { places: D.extractPlaces(text) };
  });
  // no PLACES list was provided; extraction is the safety net so nothing completes with 0 candidates
  expect(r.places.length).toBeGreaterThanOrEqual(3);
  expect(r.places.join(' | ')).toMatch(/Fushimi Inari|Kinkaku|Arashiyama|Nijo|Gion/);
});

test('#10 partial placement + text↔pins mismatch → mapped / unplaced / ambiguous, no false alarms', async () => {
  const r = await page.evaluate(() => window.IntMapAtlasDebug.mappingVerdict([
    { name: 'Rome', src: 'structured', verdict: 'mapped' },
    { name: 'Colosseum', src: 'text', verdict: 'mapped' },
    { name: 'Atlantis', src: 'structured', verdict: 'unplaced' },   // model claimed it → surfaced honestly
    { name: 'Springfield', src: 'structured', verdict: 'ambiguous' }, // same-name → ambiguous, never guessed
    { name: 'However', src: 'text', verdict: 'unplaced' },           // lone capitalized word → NOT surfaced
  ]));
  expect(r.mapped).toEqual(['Rome', 'Colosseum']);
  expect(r.ambiguous).toEqual(['Springfield']);
  expect(r.unplaced).toContain('Atlantis');
  expect(r.unplaced).not.toContain('However');
});

test('#10 source concentration on ONE domain is detected; a diverse/official set is not', async () => {
  const r = await page.evaluate(() => {
    const D = window.IntMapAtlasDebug;
    return {
      one: D.auditSources([{ url: 'https://blog.example.com/a' }, { url: 'https://blog.example.com/b' }, { url: 'https://blog.example.com/c' }]),
      mixed: D.auditSources([{ url: 'https://who.int/x' }, { url: 'https://reuters.com/y' }, { url: 'https://bbc.co.uk/z' }]),
      dom: [D.regDomain('https://www.bbc.co.uk/n'), D.regDomain('https://mod.go.jp/e'), D.regDomain('https://cnn.com/a')],
    };
  });
  expect(r.one.concentrated).toBe(true);      // one unofficial site → flag it
  expect(r.one.official.length).toBe(0);
  expect(r.mixed.concentrated).toBe(false);   // 3 independent domains → fine
  expect(r.mixed.official).toContain('who.int');
  expect(r.dom).toEqual(['bbc.co.uk', 'mod.go.jp', 'cnn.com']);
});

test('#10 the self-audit NOTE honestly lists mapped, ambiguous and unplaced spots + a one-domain caveat', async () => {
  const r = await page.evaluate(() => {
    const D = window.IntMapAtlasDebug;
    return {
      full: D.mappingNote({ mapped: ['Rome'], unplaced: ['Xanadu'], ambiguous: ['Springfield'] }, { concentrated: false, official: [], dominant: '' }, {}),
      concentrated: D.mappingNote({ mapped: ['Rome'], unplaced: [], ambiguous: [] }, { concentrated: true, official: [], dominant: 'blog.example.com' }, {}),
    };
  });
  expect(r.full).toMatch(/mapped|地図/i);
  expect(r.full).toMatch(/Springfield/);   // ambiguous surfaced
  expect(r.full).toMatch(/Xanadu/);        // unplaced surfaced (never guessed onto the map)
  expect(r.concentrated).toMatch(/blog\.example\.com/);   // one-domain honesty
});

test('#4 typography: a flat run-on wall is grouped into stanzas; structured text is left untouched', async () => {
  const r = await page.evaluate(() => {
    const D = window.IntMapAtlasDebug;
    const wall = 'Rome sits on the Tiber and has ruled empires for millennia. Its ancient core packs the Forum and the Palatine. The baroque city layered churches and fountains over that base. Modern Rome is a capital of nearly three million. Tourism and the Holy See anchor its economy. It rewards slow, unhurried wandering.';
    const structured = '## Overview\nRome is old.\n\n- Forum\n- Palatine';
    return {
      wallParas: D.stanza(wall).split('\n\n').length,
      structuredUnchanged: D.stanza(structured) === structured,
      /* (#R494) the gap used to be an empty div with an inline `height:`; it is a paragraph's own
         bottom margin now, so what the rendered HTML shows is SEVERAL PARAGRAPH BOXES. */
      mdParas: (D.mdMini(wall).match(/class="atl-p/g) || []).length,
      mdHasSpacerDiv: /style="height:[\d.]+em"/.test(D.mdMini(wall)),
    };
  });
  expect(r.wallParas).toBeGreaterThanOrEqual(2);   // the monotone wall gets breathing room
  expect(r.structuredUnchanged).toBe(true);        // never fights the model's own structure
  expect(r.mdParas).toBeGreaterThanOrEqual(2);      // rendered HTML has real paragraphs to space apart
  expect(r.mdHasSpacerDiv).toBe(false);             // …and no empty div doing the spacing
});

test('#3 Köppen legend STOPS when all classes are shown (R151: clamp to content, no empty space)', async () => {
  // (#R151) supersedes R150. The user asked that the legend "stop once every climate class is displayed" — it must
  // NOT keep stretching into empty space past the last class. On a tall viewport the 30 zones fit, so the box stops at
  // the content height (all shown, small gap below), rather than being dragged all the way to the screen bottom.
  await page.setViewportSize({ width: 1280, height: 900 });
  const r = await page.evaluate(() => {
    let lg = document.getElementById('koppen-legend');
    if (!lg) { lg = document.createElement('div'); lg.id = 'koppen-legend'; lg.className = 'koppen-legend'; document.body.appendChild(lg); }
    lg.innerHTML = '<h4>K</h4><div class="kl-scroll"></div><div class="kl-hint">h</div>';
    lg.style.display = 'flex'; lg.style.top = '74px'; lg.style.height = ''; lg.style.maxHeight = '';
    const sc = lg.querySelector('.kl-scroll');
    for (let i = 0; i < 30; i++) { const d = document.createElement('div'); d.className = 'kl-item'; d.innerHTML = '<span class="kl-sw"></span>Zone ' + i; sc.appendChild(d); }
    window._fitKoppenLegend(lg);
    lg.style.height = '4000px';   // try to drag the grip all the way down — it must NOT go past the content
    // natural content height (every class), measured with the caps neutralised
    const sh = lg.style.height, smh = lg.style.maxHeight;
    lg.style.maxHeight = 'none'; lg.style.height = 'auto';
    const natural = lg.getBoundingClientRect().height;
    lg.style.height = sh; lg.style.maxHeight = smh;
    const rect = lg.getBoundingClientRect();
    const info = { boxH: Math.round(rect.height), natural: Math.round(natural), bottom: Math.round(rect.bottom), vh: window.innerHeight, innerHidden: sc.scrollHeight - sc.clientHeight };
    lg.remove();
    return info;
  });
  expect(r.innerHidden).toBeLessThanOrEqual(2);                    // all 30 classes visible (nothing hidden by the inner scroll)
  expect(r.bottom).toBeLessThanOrEqual(r.vh);                      // never past the screen bottom
  expect(Math.abs(r.boxH - r.natural)).toBeLessThanOrEqual(12);    // box == content height → it stopped exactly at the last class
});

test('no uncaught page errors during R150 interactions', () => {
  expect(diag.pageErrors, 'pageErrors: ' + JSON.stringify(diag.pageErrors)).toEqual([]);
});
