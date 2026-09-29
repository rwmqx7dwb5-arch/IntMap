/* dead-code-removal — a window publication that nothing reads is found by a rule, not by hand.
 *
 * The defect: 60 of the 683 names js/ and src/ put on window had no reader anywhere — not in js/,
 * src/, a page, a test or a script, and not in the one code path that enumerates window (Atlas's
 * module catalogue). They were found by a one-off census, removed with the owner's approval, and
 * nothing would have noticed the 61st. scripts/global-surface.mjs (`npm run check:surface`) now
 * records the published names that have no reader (`unread` in tests/global-surface-baseline.json)
 * and ratchets them both ways. This file holds the RULE to what it claims, on fixtures that differ in
 * exactly one respect, and holds the tree to the baseline. It names none of the removed globals: a
 * list of what was deleted protects those names and nothing else (.agents/rules/no-ad-hoc-hardcoding.md).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unreadPublications, windowEnumerators } from '../scripts/global-surface.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* a throwaway tree: { 'js/a.js': '…', 'tests/t.test.mjs': '…', 'index.html': '…' } */
function tree(files, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'intmap-unread-'));
  try {
    for (const [rel, text] of Object.entries(files)) { mkdirSync(dirname(join(dir, rel)), { recursive: true }); writeFileSync(join(dir, rel), text); }
    return fn(dir);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
const PUB = { 'js/a.js': 'function helper(){ return 1; }\nwindow._probeName=helper;\n' };

test('① a published name with no reader is reported', () => {
  tree(PUB, (d) => assert.deepEqual(unreadPublications(d), ['_probeName']));
});

test('② a reader in any of js/ src/ tests/ scripts/ or a page takes it off the list', () => {
  for (const [rel, text] of [
    ['js/b.js', 'window._probeName();\n'],
    ['src/c.js', 'if (typeof _probeName === "function") _probeName();\n'],
    ['tests/t.test.mjs', "await page.evaluate(() => window._probeName());\n"],
    ['scripts/s.mjs', "page.evaluate(() => window['_probeName']);\n"],
    ['index.html', '<button onclick="_probeName()">x</button>\n'],
  ]) tree({ ...PUB, [rel]: text }, (d) => assert.deepEqual(unreadPublications(d), [], rel + ' is a reader'));
});

test('③ a string is a use (an inline handler), a comment is not', () => {
  tree({ ...PUB, 'js/b.js': "el.innerHTML='<a onclick=\"_probeName()\">';\n" }, (d) => assert.deepEqual(unreadPublications(d), []));
  tree({ ...PUB, 'js/b.js': '/* _probeName used to be called from here */\n// _probeName()\n' }, (d) => assert.deepEqual(unreadPublications(d), ['_probeName']));
  tree({ ...PUB, 'index.html': '<!-- see _probeName -->\n' }, (d) => assert.deepEqual(unreadPublications(d), ['_probeName']));
});

test('④ a second assignment is not a reader; reading it back is', () => {
  tree({ ...PUB, 'js/b.js': 'window._probeName=()=>{};\n' }, (d) => assert.deepEqual(unreadPublications(d), ['_probeName']));
  tree({ ...PUB, 'js/b.js': 'window._probeName=window._probeName||(()=>{});\n' }, (d) => assert.deepEqual(unreadPublications(d), []));
});

/* the enumerator in these fixtures has the shape of js/atlas-controls.js moduleCatalog(): a regex over
   Object.keys(window), and a list of entry points the object must offer */
const ENUM = "const METHODS=['open','toggle'];\nconst RE=/^Probe[A-Za-z]*$/;\n"
  + "function catalog(){ return Object.keys(window).filter(k=>RE.test(k)&&METHODS.some(m=>typeof window[k][m]==='function')); }\ncatalog();\n";

test('⑤ a window enumerator is discovered from the source, with the entry points it demands', () => {
  tree({ 'js/enum.js': ENUM }, (d) => {
    const e = windowEnumerators(d);
    assert.equal(e.length, 1);
    assert.equal(String(e[0].regex), '/^Probe[A-Za-z]*$/');
    assert.deepEqual(e[0].methods, ['open', 'toggle']);
  });
  /* …and on the real tree the Atlas catalogue is one of them, with a non-empty list — if this walk
     stops finding it, every IntMap* module Atlas can reach would start reading as unread */
  const atlas = windowEnumerators(ROOT).find((x) => x.file === 'js/atlas-controls.js');
  assert.ok(atlas && atlas.methods && atlas.methods.length > 0, 'the Atlas module catalogue is found with its entry points');
});

test('⑥ a name the enumerator can reach is read; one without an entry point is not', () => {
  tree({ 'js/enum.js': ENUM, 'js/p.js': 'window.ProbeModule={ open(){}, state:1 };\n' }, (d) => assert.deepEqual(unreadPublications(d), []));
  tree({ 'js/enum.js': ENUM, 'js/p.js': 'window.ProbeModule={ state:1 };\n' }, (d) => assert.deepEqual(unreadPublications(d), ['ProbeModule']));
  tree({ 'js/enum.js': ENUM, 'js/p.js': 'window.OtherModule={ open(){} };\n' }, (d) => assert.deepEqual(unreadPublications(d), ['OtherModule']), 'outside the regex, the entry point does not help');
});

test('⑦ the tree has exactly the unread names the baseline records (check:surface)', () => {
  const base = JSON.parse(readFileSync(join(ROOT, 'tests', 'global-surface-baseline.json'), 'utf8'));
  assert.ok(Array.isArray(base.unread), 'the baseline records the unread names');
  assert.deepEqual(unreadPublications(ROOT), base.unread,
    'a published name gained or lost its last reader — remove the publication or give it a reader, then `node scripts/global-surface.mjs --update`');
});
