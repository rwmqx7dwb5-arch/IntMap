/* ============================================================================
 *  ATLAS — how a reply is printed (js/atlas-reply.js, js/atlas-markdown.js, js/atlas-attach.js)
 * ----------------------------------------------------------------------------
 *  ⚠ NOT A HAZARD SUBJECT. These tests were in round files assigned to the hazards/simulator
 *  consolidation; the `hazard-` prefix only keeps this file from colliding with the other
 *  consolidations. The owning subject is named in the title — merge it there when both exist.
 *  Consolidated from the round files named in each section below; every test keeps its original
 *  title, tagged with the round that wrote it. Each section is a block so its helpers stay its own.
 *
 *  ⚠ WHY SOME OF THESE STILL READ SOURCE TEXT. The reply pipeline is spread over page closures
 *    (js/atlas-console.js) and DOM helpers; these read the source.
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly } from '../scripts/code-only.mjs';
import { capsSource } from './helpers/atlas-kernel.mjs';   /* (atlas-capability-modules) what each capability does lives in js/atlas-cap-<namespace>.js now — the kernel is both */

/* one reader for the whole file — the CONTENT of a repository file, whatever line endings this
   checkout produced (scripts/eol.mjs, #R283). Sections that need another shape keep their own. */
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (p) => readLF(join(ROOT, p));

/* ═══ from tests/r232-checks.test.mjs (tests #10, #11, #12 of 18) ═══
   R232 source-level regression checks (deterministic, no browser).
   Guards this round's batch:
     ①  a language is ONE FILE — the locale directory is the list, and the generated list follows it
     ②  …and the locales are LAZY: only English is eager, the reader's own is awaited on the boot barrier
     ③  the day/night SHADING replaced the flat night layer, and one owner writes the boolean
     ④  the seismic simulator: past-earthquake presets, rupture directivity, named wavefronts,
         observation points that are major cities which actually shake
     ⑤  Atlas: the place name is printed once, headings do not double-count their spacing, and a
         source card must be about the topic
     ⑥  the phone's layer sheet is the desktop's tile grid, not a second implementation
     ⑦  「戻る」 returns to the tab you came from, the readout stays out of screenshots, and the
         locate button is outlined until it is following you */
{
const ROOT = new URL('../', import.meta.url);
/* ⚠ (#R283) THE CONTENT OF A FILE, NOT THE BYTES THIS CHECKOUT PRODUCED — scripts/eol.mjs. ① also
   runs the generator's own staleness gate, which compared js/locales/_langs.js byte for byte with
   what it renders and therefore called the committed copy stale on every CRLF working copy. */

/* ⚠ COMMENTS ARE STRIPPED BEFORE EVERY NEGATIVE CHECK. #R231 hit this five times and #R208/#R229
   before it: a note that QUOTES the thing it says was removed makes "it is gone" fail. Match syntax,
   never prose. */
const noJs = (s) => codeOnly(String(s));

/* ── ⑤ Atlas ─────────────────────────────────────────────────────────────────────────────────── */
test('R232 Atlas: the place name is printed once, not twice', () => {
  const k = noJs((read('js/atlas-console.js') + '\n' + capsSource()));
  assert.doesNotMatch(k, /<div style="font-weight:600;margin:2px 0 5px;">'\+esc\(nm3\)/,
    "the brief no longer prints the place name above a bubble that already says it");
  assert.match(k, /const bodyB=dropLeadTitle\(txtB,nm3\)/, "…and the model's own copy is stripped");
  assert.match(read('js/atlas-reply.js'), /function dropLeadTitle\(text, name\)/, 'the helper lives with the text pipeline');
});

test('R232 Atlas: a heading is not spaced twice, and a source card must be about the topic', () => {
  const rep = read('js/atlas-reply.js');
  /* ⚠ (#R494) THE DOUBLE GAP IS NOT DELETED ANY MORE — IT CANNOT BE EXPRESSED.
     #R232's mechanism was a POST-PASS over finished HTML that removed the `atl-gap` spacer element
     landing beside a heading, because the heading rule and the paragraph rule each emitted air and
     nothing could see the sum. Both the spacer and the post-pass are gone: spacing is a margin on a
     real <p> and a real <h2>, and adjacent margins COLLAPSE, so the browser computes what the
     post-pass computed by hand. What this test can prove offline is that the double-emitting shape
     is gone; the resulting gap is MEASURED on screen in tests/r494.spec.js. */
  const md = read('js/atlas-markdown.js');
  assert.match(md, /class="atl-h atl-h/, 'headings are marked, and now they are real <h1>…<h6>');
  assert.ok(!/class="atl-gap"/.test(rep + md), 'the paragraph SPACER ELEMENT is gone');
  assert.ok(!/atl-gap"\[\^>\]\*><\\\/div>/.test(rep), 'and so is the post-pass that deleted it');
  assert.match(read('js/atlas-styles.js'), /\.atl-p\{margin:0 0 1\.5em;/, 'the paragraph gap is a margin that can collapse');
  assert.match(rep, /function _atlTopicKeys\(topic\)/, 'relevance judges against the topic');
  assert.match(rep, /cross-script: TWO tokens/, 'the cross-script fallback needs two, not none');
  assert.match((read('js/atlas-console.js') + '\n' + capsSource()), /linkCards\(srcSink,txtB,nm3\+' \/ '\+String\(a\.place\|\|''\)\)/,
    'the brief passes both spellings of the topic');
});

test('R232 Atlas: a sent picture opens full-screen, from its own module', () => {
  const m = read('js/atlas-attach.js');
  assert.match(m, /export function attachLightbox/, 'one entry point');
  assert.match(m, /el.className = 'atl-lightbox';/, 'the overlay');
  assert.match(m, /history\.pushState/, 'Back closes the picture, not the map');
  assert.match(m, /document\.body\.appendChild\(el\)/, 'it lives on <body>, not inside the panel');
  assert.match((read('js/atlas-console.js') + '\n' + capsSource()), /attachLightbox\(chatEl,/, 'the chat delegates to it');
});
}
