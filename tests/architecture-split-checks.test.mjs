/* ============================================================================
 *  architecture-split — the one-file spec became a map and eighteen chapters, and lost nothing
 * ----------------------------------------------------------------------------
 *  MEASURED 2026-10-01: Architecture.md was 741 KB / 6,166 lines / eighteen H2 chapters, and 68 of the
 *  last 101 commits touched it. A session could only read it by grepping for a heading, and parallel
 *  branches collided in it on every landing. The chapters moved to docs/architecture/<NN>-<slug>.md
 *  KEEPING THEIR SECTION NUMBERS, and Architecture.md became the map «§N → file».
 *
 *  ① CONTENT: every H2 and every H3 body of the one-file spec is present, byte for byte, in the files
 *     the split produced. The comparison does NOT use the split tool's own link rewriting: both sides
 *     have every relative link resolved to a repository path from the directory of the file it sits
 *     in (plain path semantics), so the only difference allowed is that a link which pointed at the
 *     same file still points at the same file.
 *     The one-file spec is read from git — HEAD while the split is uncommitted, otherwise the parent
 *     of the commit that created docs/architecture/, compared with THAT commit's chapters (so later,
 *     legitimate edits to a chapter do not make this red). ⚠ A shallow checkout (CI clones one
 *     commit) does not hold that parent; the test then SAYS it could not look and skips, rather than
 *     passing an empty comparison.
 *  ② THE RULES READ THE NEW PLACE: scripts/doc-facts.mjs, run on a private copy of the tree
 *     (tests/helpers/scratch-tree.mjs), goes red when a round reference is written into a chapter,
 *     when a chapter is missing from the map, and when a §-reference names a section no chapter has —
 *     and stays green for «Architecture.md §N.M» whose heading now lives in a chapter.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scratchTree } from './helpers/scratch-tree.mjs';
import { readSpec, specFiles, specFileWith, chapters, guideRows, numberSpace } from '../scripts/architecture-spec.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'] });
const lf = (s) => s.replace(/\r\n/g, '\n');
const isOneFile = (s) => /^## 1\. /m.test(s) && /^## 2\. /m.test(s);

/* Resolve every relative markdown link to a repository path, from the directory of the file it is in. */
const resolveLinks = (text, file) => {
  const dir = posix.dirname(file);
  return text.replace(/\]\(([^)\s]+)\)/g, (all, t) => {
    if (/^(?:[a-z][a-z0-9+.-]*:|#|\/)/i.test(t)) return all;
    const [p, ...a] = t.split('#');
    return '](@/' + posix.normalize(posix.join(dir, p)) + (a.length ? '#' + a.join('#') : '') + ')';
  });
};

/* the H2 and H3 sections of a markdown text (outside code fences), trailing blank / `---` lines trimmed */
const sectionsOf = (text) => {
  const lines = text.split('\n');
  const heads = [];
  let fence = false;
  lines.forEach((l, i) => {
    if (/^\s*```/.test(l)) fence = !fence;
    const m = !fence && l.match(/^(#{2,3}) (.+)$/);
    if (m) heads.push({ i, level: m[1].length, title: m[2] });
  });
  return heads.map((h, k) => {
    let end = lines.length;
    for (let j = k + 1; j < heads.length; j++) if (heads[j].level <= h.level) { end = heads[j].i; break; }
    const body = lines.slice(h.i, end);
    while (body.length && /^(\s*|---)$/.test(body[body.length - 1])) body.pop();
    return { level: h.level, title: h.title, body: body.join('\n') };
  });
};

/* where the one-file spec and the split's output are, as texts */
function sources() {
  const head = lf(git('show', 'HEAD:Architecture.md'));
  if (isOneFile(head)) {
    /* the split is not committed yet: HEAD holds the one-file spec, the working tree the chapters */
    const files = chapters(ROOT);
    return { from: 'HEAD:Architecture.md', original: head,
      parts: files.map((f) => [f, lf(readFileSync(join(ROOT, f), 'utf8'))]) };
  }
  const first = chapters(ROOT)[0];
  if (!first) return { skip: 'docs/architecture/ holds no chapter' };
  const added = git('log', '--diff-filter=A', '--format=%H', '--', first).trim().split('\n').filter(Boolean).pop();
  if (!added) return { skip: 'git has no commit that added ' + first };
  let parent = '';
  try { parent = git('rev-parse', '--verify', '-q', added + '^').trim(); } catch { /* shallow */ }
  if (!parent) return { skip: `the commit that added ${first} (${added.slice(0, 10)}) has no parent in this checkout (shallow clone) — the one-file spec cannot be read here` };
  const original = lf(git('show', parent + ':Architecture.md'));
  assert.ok(isOneFile(original), `${parent.slice(0, 10)}:Architecture.md is not the one-file spec — the split commit was not found correctly`);
  const names = git('ls-tree', '--name-only', added, 'docs/architecture/').trim().split('\n').filter((f) => f.endsWith('.md'));
  return { from: parent.slice(0, 10) + ':Architecture.md', original,
    parts: names.map((f) => [f, lf(git('show', added + ':' + f))]) };
}

test('① every H2 and H3 of the one-file spec is in the chapters, byte for byte (links resolved on both sides)', (t) => {
  const src = sources();
  if (src.skip) { t.skip(src.skip); return; }
  const secs = sectionsOf(src.original);
  const h2 = secs.filter((s) => s.level === 2);
  assert.ok(h2.length >= 18, `${src.from} has only ${h2.length} H2 — this is not the one-file spec`);
  assert.equal(src.parts.length, h2.length, `${h2.length} chapters in ${src.from}, ${src.parts.length} chapter files`);

  const corpus = src.parts.map(([f, s]) => resolveLinks(s, f)).join('\n\u0000\n');
  /* the ONE heading that was not moved: the map's own «how to read this document», which described a
     one-file document and was rewritten to describe the map. It is named here so that exactly one,
     and only that one, is excused. */
  const REWRITTEN = ['この文書の読み方'];
  const excused = secs.filter((s) => REWRITTEN.includes(s.title));
  assert.equal(excused.length, REWRITTEN.length, 'the excused heading is not where it was — re-read what this test excuses');
  const missing = [];
  let bytes = 0;
  for (const s of secs) {
    if (REWRITTEN.includes(s.title)) continue;
    const want = resolveLinks(s.body, 'Architecture.md');
    if (!corpus.includes(want)) missing.push(`${'#'.repeat(s.level)} ${s.title}`);
    else if (s.level === 2) bytes += Buffer.byteLength(want);
  }
  assert.deepEqual(missing, [], 'these sections of ' + src.from + ' are not present byte for byte in the chapters');
  /* …and each chapter file carries exactly one of them, whole */
  for (const s of h2) {
    const want = resolveLinks(s.body, 'Architecture.md');
    const holders = src.parts.filter(([f, text]) => resolveLinks(text, f).includes(want)).map(([f]) => f);
    assert.equal(holders.length, 1, `«## ${s.title}» is in ${holders.length} chapter file(s): ${holders.join(', ')}`);
  }
  t.diagnostic(`${secs.length - excused.length} sections (${h2.length} H2) of ${src.from} found byte for byte — ${bytes} bytes of chapter text`);
});

test('the map names every chapter, and every §N it names is a heading of the file it points at', () => {
  const guide = readFileSync(join(ROOT, 'Architecture.md'), 'utf8');
  const rows = guideRows(guide);
  const chs = chapters(ROOT);
  assert.ok(chs.length >= 18, `only ${chs.length} chapter file(s) under docs/architecture/`);
  assert.equal(rows.length, chs.length, `${rows.length} row(s) in the map for ${chs.length} chapter(s)`);
  for (const f of chs) {
    const n = (readFileSync(join(ROOT, f), 'utf8').match(/^## (\d+)\. /m) || [])[1];
    assert.ok(n, `${f} has no «## N.» heading`);
    assert.ok(rows.some((r) => r.sec === n && r.files[0] === f), `the map has no row «§${n} → ${f}»`);
  }
  assert.ok(!/^## \d+\. /m.test(guide), 'Architecture.md carries a chapter again — the map only points');
  /* the number space: the chapters plus the two documents that took §3.x and §7.x earlier */
  const space = numberSpace(ROOT);
  for (const f of ['docs/FILES.md', 'docs/MAP-LAYERS.md']) assert.ok(space.includes(f), `${f} left the spec's number space`);
  /* the spec, read as one text, still holds the chapters in order */
  const spec = readSpec(ROOT);
  const order = [...spec.matchAll(/^## (\d+)\. /gm)].map((m) => Number(m[1]));
  assert.deepEqual(order, order.slice().sort((a, b) => a - b), 'readSpec() does not return the chapters in order');
  assert.equal(specFiles(ROOT)[0], 'Architecture.md');
  /* every relative link in a chapter lands on a file (they were rewritten when the text moved down two directories) */
  const dangling = [];
  for (const f of chs) {
    for (const m of readFileSync(join(ROOT, f), 'utf8').matchAll(/\]\(([^)\s#]+)(?:#[^)\s]*)?\)/g)) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(m[1])) continue;
      if (!existsSync(join(ROOT, posix.dirname(f), m[1]))) dangling.push(`${f} → ${m[1]}`);
    }
  }
  assert.deepEqual(dangling, [], 'links in the chapters that point at nothing');
});

/* ── ② the gate reads the new place ───────────────────────────────────────────────────────── */
{
  const SCRATCH = scratchTree();
  const docFacts = (rule) => {
    try {
      return { code: 0, out: execFileSync(process.execPath, [SCRATCH.path('scripts/doc-facts.mjs'), '--check', '--rule=' + rule], { cwd: SCRATCH.root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) };
    } catch (e) { return { code: e.status, out: String(e.stdout || '') + String(e.stderr || '') }; }
  };
  const withText = (file, edit, rule) => {
    const original = SCRATCH.read(file);
    const text = edit(original);
    assert.notEqual(text, original, `the mutation of ${file} changed nothing`);
    try { SCRATCH.write(file, text); return docFacts(rule); } finally { SCRATCH.write(file, original); }
  };

  test('② arch-split, arch-rounds and section-refs are green on the tree and say how much they read', () => {
    for (const [rule, shape] of [
      ['arch-split', /arch-split: \d+ chapter\(s\) under docs\/architecture\/ read/],
      ['arch-rounds', /arch-rounds: \d+ lines across \d+ file\(s\)/],
      ['section-refs', /section-refs: \d+ cross-document §-references, all resolving .*\(\d+ file\(s\) share/],
    ]) {
      const r = docFacts(rule);
      assert.equal(r.code, 0, r.out);
      assert.match(r.out, shape, rule + ' no longer says what it read:\n' + r.out);
    }
  });

  test('② a round reference written into a CHAPTER is red (the rule does not read the map alone)', () => {
    const f = chapters(ROOT).find((x) => /07-/.test(x)) || chapters(ROOT)[0];
    const r = withText(f, (s) => s.replace(/(\n## \d+\. [^\n]*\n)/, '$1\n（#R999 で直した）\n'), 'arch-rounds');
    assert.equal(r.code, 1, 'a round reference in ' + f + ' stayed green:\n' + r.out);
    assert.ok(r.out.includes(f), 'arch-rounds went red without naming the chapter file:\n' + r.out);
  });

  test('② a chapter the map does not name is red; a map row pointing at a missing heading is red', () => {
    const a = withText('Architecture.md', (s) => s.replace(/^\| §12 \|[^\n]*\n/m, ''), 'arch-split');
    assert.equal(a.code, 1, 'a chapter dropped from the map stayed green:\n' + a.out);
    assert.match(a.out, /12-[a-z-]+\.md is §12, and Architecture\.md's table has no row/);
    const b = withText('Architecture.md', (s) => s.replace(/^\| §12 \|/m, '| §19 |'), 'arch-split');
    assert.equal(b.code, 1, 'a row naming a heading the file lacks stayed green:\n' + b.out);
  });

  test('② «Architecture.md §N.M» resolves through the map, and a section no chapter has is red', () => {
    /* a live reference into a chapter: some document in the tree already writes one */
    const live = specFileWith(ROOT, /^### 7\.4 /m);
    assert.ok(live && live.startsWith('docs/architecture/'), '§7.4 is not in a chapter any more (found in ' + live + ')');
    const r = withText('docs/TESTING.md', (s) => s + '\n\n`Architecture.md` §7.4 と `Architecture.md` §17.3。\n', 'section-refs');
    assert.equal(r.code, 0, 'a reference into a chapter through the map was refused:\n' + r.out);
    const bad = withText('docs/TESTING.md', (s) => s + '\n\n`Architecture.md` §7.99。\n', 'section-refs');
    assert.equal(bad.code, 1, 'a reference to a section no chapter has stayed green:\n' + bad.out);
    assert.match(bad.out, /Architecture\.md §7\.99/);
  });
}

test('the chapters are what the index lists', () => {
  const idx = readFileSync(join(ROOT, 'docs/README.md'), 'utf8');
  const missing = readdirSync(join(ROOT, 'docs/architecture')).filter((f) => f.endsWith('.md') && !idx.includes('architecture/' + f));
  assert.deepEqual(missing, [], 'docs/README.md does not list these chapters');
});
