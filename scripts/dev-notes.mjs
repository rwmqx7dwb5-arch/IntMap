#!/usr/bin/env node
/* ============================================================================
 *  IntMap · THE DEVELOPMENT RECORD IS ONE FILE PER ENTRY, AND ITS INDEX IS RENDERED ON DEMAND
 * ----------------------------------------------------------------------------
 *  「ラウンド番号を名前として使うのをやめる」「DEV-NOTES の 1 本ファイルをやめる」（利用者承認済み）
 *
 *  MEASURED on the tree this replaced (2026-09-25, 51,048 lines / 11.3 MB in a CRLF checkout):
 *    · 341 entries under `## R<N>` headings, newest first — and a round's entry could be CUT IN
 *      HALF: #R494's body stopped mid-sentence at 「…退避されていて（#R156/#R463）、`」 and
 *      resumed 2,086 lines later, because a prepend script had searched for the file's own title
 *      `# IntMap — Developer / Context Notes` and found it QUOTED inside that entry.
 *    · the index block (`- **#R<N>** — …`) existed in NINE copies: 1,598 index lines of which
 *      342 were distinct. Every prepend that anchored on the title re-inserted the whole preamble
 *      and index, so the file grew by one index per landing (≈5.9 MB of repetition).
 *    · the page title had lost its `#` (` IntMap — Developer / Context Notes`).
 *    · every parallel round prepended to the SAME first line, so two sessions always conflicted
 *      on it, and the entry was named by a round number both of them might hold.
 *
 *  So an entry is a FILE (dev-notes/), named by its subject. The list of entries is RENDERED ON
 *  DEMAND (--list) and never tracked: a tracked generated index made every open PR conflict on it
 *  the moment another landed (measured the first hour — see renderStub). DEV-NOTES.md is a fixed
 *  pointer. Two sessions writing two entries now touch two different paths and nothing else.
 *
 *      node scripts/dev-notes.mjs --split    # legacy DEV-NOTES.md → dev-notes/R<N>.md (re-runnable)
 *      node scripts/dev-notes.mjs --list     # the entries, newest first (rendered now, never tracked)
 *      node scripts/dev-notes.mjs --write    # (re)write the fixed pointer DEV-NOTES.md
 *      node scripts/dev-notes.mjs --check    # exit 1 when dev-notes/ is malformed or DEV-NOTES.md is not the pointer
 *      node scripts/dev-notes.mjs --latest   # the newest entry (the ONE answer to «what was the last record»)
 *
 *  ⚠ --split IS MEANT TO BE RUN AGAIN. A branch that still prepends `## R<N>` to the old single
 *    file can land after this one; the landing takes that file, runs --split, then --write (the pointer). It
 *    only ever ADDS or REWRITES the files it derives; it never deletes one, and on a file that is
 *    already the generated index it finds nothing to split and says so.
 *  ⚠ NOT ONE BYTE OF AN ENTRY IS LOST. --split refuses to write unless the segments it cut
 *    (entry bodies and index/preamble regions, in file order) re-join to the input exactly, and
 *    every non-blank line of a region survives at least once in dev-notes/legacy-index.md.
 *    The duplicate copies of that region are the only thing not kept — as copies.
 *  ⚠ DEV-NOTES-ARCHIVE.md IS NOT TOUCHED (read-only, never appended to — AGENTS.md §9).
 * ==========================================================================*/
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, '..');

export const NOTES_DIR = 'dev-notes';
export const INDEX_FILE = 'DEV-NOTES.md';
export const LEGACY_INDEX = `${NOTES_DIR}/legacy-index.md`;
export const LEGACY_PRS = `${NOTES_DIR}/legacy-prs.json`;
export const LEGACY_MANIFEST = `${NOTES_DIR}/legacy-manifest.json`;

/* The header of dev-notes/legacy-index.md. Its lines are recognised on a re-run so they are not
   mistaken for a region line the previous run kept. */
const RESIDUE_HEAD_MARK = '<!-- dev-notes:legacy-index';
function residueHeader() {
  return [
    `${RESIDUE_HEAD_MARK} — scripts/dev-notes.mjs --split が書く。手で足さない -->`,
    '# 旧 DEV-NOTES.md の索引と前書き（重複を畳んだもの）',
    '',
    '> 1 本ファイルだった頃の DEV-NOTES.md から、各回の本文（`dev-notes/R<N>.md`）を除いた残り——',
    '> 題・前書き・索引の行——を、**どの行も 1 回だけ**、最初に現れた順で置いている。旧ファイルでは',
    '> 先頭挿入の手順が題を目印にしていたため、前書きと索引が何重にも積まれていた（`scripts/dev-notes.mjs` の冒頭）。',
    '> 文中の「このファイル」は当時の DEV-NOTES.md を指す。',
    '',
  ].join('\n') + '\n';
}

/* The first line of the generated index. --split stops an entry body at it, so a `## R<N>`
   entry that a stale branch prepends ABOVE the generated index is still cut out cleanly. */
export const GENERATED_MARK = '<!-- dev-notes:index';

/* ── the three shapes a legacy line can have ──────────────────────────────────────────────── */
const ROUND_HEAD = /^## R(\d+)\b/;
const TITLE_MARK = 'IntMap — Developer / Context Notes';
/* an index row: `- **#R494** — …` or `- **#R285 追記** — …`. ⚠ `- **#R242** が…` inside an entry
   body is NOT one (no ` — ` straight after the bold), and neither is `- **#R276 ⑰ / #R310 ⑤** —`
   — but the latter never matters: regions only exist after a title line (see parseLegacy). */
const INDEX_ROW = /^- \*\*#R\d+[^*\n]*\*\* — /;

/* New entries: dev-notes/<YYYY-MM-DD>-<slug>.md. The slug is the subject, never a number first
   (the same rule scripts/round-names.mjs applies to tests/). */
export const DATED = /^(\d{4}-\d{2}-\d{2})-([a-z][a-z0-9-]*)\.md$/;
const LEGACY = /^R(\d+)(?:-(.+))?\.md$/;

const lf = (s) => String(s).replace(/\r\n/g, '\n');
const rd = (root, rel) => lf(readFileSync(join(root, rel), 'utf8'));
const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
export const gitBlobId = (s) => {
  const buf = Buffer.from(s, 'utf8');
  return createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${buf.length}\0`), buf])).digest('hex');
};

/* ══ PARSING THE LEGACY FILE ════════════════════════════════════════════════════════════════
   Returns the file as an ordered list of segments that re-join to it exactly:
     { kind: 'body',   round, lines }   — part of one `## R<N>` entry (an entry may have 2 parts)
     { kind: 'region', lines }          — title + preamble + index copies, cut out of the flow
     { kind: 'prelude', lines }         — anything before the first entry (none today)
     { kind: 'generated', lines }       — the generated index, when a stale branch prepended to it
   A REGION starts at a line carrying the title — at that line when it begins a paragraph, at the
   next line when the title is the tail of a sentence (#R494's quoted title) — and ends at the last
   index row before the next `## R<N>` heading. With no index row before that heading, the title
   was only quoted and nothing is cut. */
export function parseLegacy(text) {
  const src = lf(text);
  /* every line is newline-terminated; `finalNewline` says whether the last one was too */
  const finalNewline = src.endsWith('\n');
  const lines = (finalNewline ? src.slice(0, -1) : src).split('\n');
  if (src === '') lines.length = 0;
  const segs = [];
  let cur = null;
  let round = null;
  const push = (kind, extra = {}) => { cur = { kind, lines: [], ...extra }; segs.push(cur); return cur; };
  /* the segment an ordinary line belongs to: the entry being read, or the prelude before any */
  const flow = () => {
    if (!cur || cur.kind === 'region') { if (round === null) push('prelude'); else push('body', { round }); }
    return cur;
  };
  const nextHead = (from) => {
    for (let k = from; k < lines.length; k++) if (ROUND_HEAD.test(lines[k]) || lines[k].startsWith(GENERATED_MARK)) return k;
    return lines.length;
  };

  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (l.startsWith(GENERATED_MARK)) { push('generated').lines.push(...lines.slice(i)); break; }
    const h = ROUND_HEAD.exec(l);
    if (h) { round = +h[1]; push('body', { round }).lines.push(l); i++; continue; }
    if (l.includes(TITLE_MARK)) {
      const stop = nextHead(i + 1);
      let last = -1;
      for (let k = i + 1; k < stop; k++) if (INDEX_ROW.test(lines[k])) last = k;
      if (last >= 0) {
        /* the title as the tail of a sentence (#R494's) belongs to that sentence */
        const startsParagraph = i === 0 || lines[i - 1].trim() === '';
        if (!startsParagraph) flow().lines.push(l);
        push('region').lines.push(...lines.slice(startsParagraph ? i : i + 1, last + 1));
        i = last + 1;
        continue;
      }
    }
    flow().lines.push(l);
    i++;
  }
  return { lines, segs, finalNewline };
}

const joinLines = (ls) => ls.map((l) => l + '\n').join('');

/* Everything --split writes, computed without touching the disk (so the gate and the tests can
   run it on any text). Throws if the cut does not re-join to the input byte for byte. */
export function splitLegacy(text, { existingNames = {} } = {}) {
  const src = lf(text);
  const { segs, finalNewline } = parseLegacy(src);
  /* ⚠ THE PROOF, BEFORE ANYTHING IS WRITTEN: the segments, in order, are the input. */
  const rejoined = joinLines(segs.flatMap((s) => s.lines));
  if ((finalNewline ? rejoined : rejoined.replace(/\n$/, '')) !== src) {
    throw new Error('dev-notes --split: the segments do not re-join to the input — refusing to write');
  }

  const bodies = new Map();            /* round → lines, in file order (an entry cut in two is re-joined) */
  const order = [];
  const titles = new Map();
  for (const s of segs) {
    if (s.kind !== 'body') continue;
    if (!bodies.has(s.round)) { bodies.set(s.round, []); order.push(s.round); }
    bodies.get(s.round).push(...s.lines);
  }
  for (const r of order) {
    const head = bodies.get(r)[0];
    titles.set(r, head.replace(/^## R\d+\s*—\s*/, '').trim());
  }

  /* ⚠ ONE HEADING PER ROUND. Two `## R<N>` for the same N would be two entries glued into one
     file here; the legacy file never had that (measured: 341 headings, 341 rounds), and if it
     ever does, that is for a person to look at. */
  const headCount = new Map();
  for (const s of segs) {
    const h = s.kind === 'body' && ROUND_HEAD.exec(s.lines[0]);
    if (h) headCount.set(+h[1], (headCount.get(+h[1]) || 0) + 1);
  }
  for (const [r, n] of headCount) if (n > 1) throw new Error(`dev-notes --split: ${n} headings for R${r} — resolve by hand`);

  const files = {};
  for (const r of order) {
    const name = existingNames[r] || `R${r}.md`;
    /* every line keeps its own terminator — the entry is its lines, byte for byte */
    files[`${NOTES_DIR}/${name}`] = joinLines(bodies.get(r));
  }

  /* the regions: every non-blank line kept once, in first-seen order */
  const seen = new Set();
  const kept = [];
  let regionLines = 0;
  for (const s of segs) {
    if (s.kind !== 'region' && s.kind !== 'prelude') continue;
    for (const l of s.lines) {
      regionLines++;
      /* blank lines are kept as the paragraph breaks of the FIRST copy (never two in a row) */
      if (!l.trim()) { if (kept.length && kept[kept.length - 1] !== '') kept.push(''); continue; }
      if (seen.has(l)) continue;
      seen.add(l); kept.push(l);
    }
  }
  while (kept.length && kept[kept.length - 1] === '') kept.pop();
  const rows = kept.filter((l) => INDEX_ROW.test(l)).length;

  return {
    order, titles, files,
    residue: kept,
    residueDistinct: seen.size,
    stats: {
      entries: order.length,
      regionLines,
      indexRowsTotal: segs.filter((s) => s.kind === 'region').reduce((a, s) => a + s.lines.filter((l) => INDEX_ROW.test(l)).length, 0),
      indexRowsDistinct: rows,
      sourceSha256: sha256(src),
      /* the git BLOB id of the input (git stores this file with LF): whoever has the history can
         `git cat-file blob <id>`, run the split again and compare byte for byte — which is what
         tests/process-without-round-numbers-checks.test.mjs does whenever the object is present */
      sourceBlob: gitBlobId(src),
      sourceBytes: Buffer.byteLength(src, 'utf8'),
    },
    segs,
  };
}

/* A short subject for a legacy file name, from the entry's own heading. ⚠ ASCII ONLY: git prints a
   non-ASCII path quoted and octal-escaped (core.quotepath), so every reader that takes `git ls-files` /
   `git grep -l` output line by line opened a path that does not exist (measured: check:docs died with
   ENOENT on the first Japanese file name). Letters and digits of ASCII are kept; the rest becomes «-». */
export function slugOf(title) {
  const plain = String(title).replace(/\*\*|`/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  const cps = [...plain.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '')];
  return cps.slice(0, 28).join('').replace(/-+$/, '') || 'entry';
}

/* ══ READING dev-notes/ ═════════════════════════════════════════════════════════════════════ */
function frontMatter(text) {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!m) return null;
  const o = {};
  for (const line of m[1].split('\n')) {
    const kv = /^([a-z]+):\s*(.*)$/.exec(line.trim());
    if (kv) o[kv[1]] = kv[2].trim();
  }
  return o;
}

/** Every entry, NEWEST FIRST. Dated entries (the current form) are newer than every legacy
 *  `R<N>` entry, because the legacy form stopped being written when the dated one started. */
export function entries(root = ROOT) {
  const dir = join(root, NOTES_DIR);
  if (!existsSync(dir)) return [];
  const prs = existsSync(join(root, LEGACY_PRS)) ? JSON.parse(rd(root, LEGACY_PRS)) : {};
  const out = [];
  for (const name of readdirSync(dir)) {
    const rel = `${NOTES_DIR}/${name}`;
    let m;
    if ((m = DATED.exec(name))) {
      const body = rd(root, rel);
      const fm = frontMatter(body) || {};
      out.push({ file: rel, kind: 'dated', date: m[1], slug: m[2], title: fm.title || '', fmDate: fm.date || '', pr: fm.pr ? String(fm.pr).replace(/^#/, '') : null, round: null });
    } else if ((m = LEGACY.exec(name))) {
      const body = rd(root, rel);
      const first = body.split('\n', 1)[0];
      const h = ROUND_HEAD.exec(first);
      out.push({ file: rel, kind: 'legacy', round: +m[1], headRound: h ? +h[1] : null, title: first.replace(/^## R\d+\s*—\s*/, '').trim(), date: null, pr: (prs[m[1]] || []).join(', #') || null });
    }
  }
  out.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'dated' ? -1 : 1;
    if (a.kind === 'dated') {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      const pa = +(a.pr || 0), pb = +(b.pr || 0);
      if (pa !== pb) return pb - pa;
      return a.file < b.file ? 1 : -1;
    }
    return b.round - a.round;
  });
  return out;
}

/** THE newest record. Every reader that asks «what was the last entry» asks this — the old file had
 *  five spellings of that question (`/^## R(\d+) —/`, `/^## R(\d+)\b/`, …) and #R756 wrote an entry
 *  none of them could see. */
export function latestEntry(root = ROOT) { return entries(root)[0] || null; }

/** The text of one numbered (legacy) entry, or null — for the old rounds' checks that ask «is this
 *  round written down, and does its record say X». */
export function entryText(round, root = ROOT) {
  const e = entries(root).find((x) => x.kind === 'legacy' && x.round === Number(round));
  return e ? rd(root, e.file) : null;
}

/** The text of every entry, newest first — for checks that ask «is this said anywhere in the record». */
export function allNotesText(root = ROOT) {
  return entries(root).map((e) => rd(root, e.file)).join('\n');
}

/* ══ THE GENERATED INDEX ════════════════════════════════════════════════════════════════════ */
const linkText = (t) => String(t).replace(/\s+/g, ' ').replace(/([\\[\]])/g, '\\$1').trim();
/* the file names hold only letters, digits and «-» (slugOf), so the path is written as it is —
   percent-encoding every kana tripled the size of this index for nothing */
const href = (rel) => rel.replace(/ /g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29');

export function renderIndex(root = ROOT) {
  const list = entries(root);
  const lines = [
    `${GENERATED_MARK} — \`node scripts/dev-notes.mjs --list\` がその場で生成した一覧（追跡しない） -->`,
    '# IntMap — 開発記録（索引）',
    '',
    '> **いつ・なぜ・どう直したか**の記録。**1 エントリ＝1 ファイル**で [`dev-notes/`](dev-notes/) にある。',
    '> **今どうなっているか**は `Architecture.md`、製品の不文律は `CONSTITUTION.md`。',
    '> 新しい記録は `dev-notes/<YYYY-MM-DD>-<slug>.md`（front matter に `title` と `date`、分かれば `pr`）として足し、',
    '> 手順は `.agents/skills/intmap-round/` §3。',
    '> `R<N>.md` の名前は番号で呼んでいた頃の記録（名前は当時のまま）。旧索引の各行（回ごとの長い要約）は',
    `> [\`${LEGACY_INDEX}\`](${LEGACY_INDEX})、それより前（Round 1 〜 #R259）は \`DEV-NOTES-ARCHIVE.md\`（古い順・読むだけ）。`,
    '',
    `## 記録（新しい順・${list.length} 件）`,
    '',
  ];
  for (const e of list) {
    const tag = e.kind === 'dated' ? e.date : `R${e.round}`;
    const pr = e.pr ? ` · #${e.pr}` : '';
    lines.push(`- ${tag} · [${linkText(e.title || e.file)}](${href(e.file)})${pr}`);
  }
  return lines.join('\n') + '\n';
}

/* ══ DEV-NOTES.md IS A FIXED POINTER, NOT THE INDEX ═════════════════════════════════════════
   MEASURED 2026-09-25, the first hour after the index became generated-and-committed: every open
   PR carried its own regenerated DEV-NOTES.md, so the moment one landed, FOUR others went
   CONFLICTING on that one file — the same first-line collision the single file had, moved one
   directory up. A derived artefact that every change rewrites cannot be tracked by parallel
   branches. So the tracked file says where the record is and how to list it, and never changes
   when an entry is added; the list itself is rendered on demand (renderIndex / --list). */
export const STUB_MARK = '<!-- dev-notes:pointer';
export function renderStub() {
  return [
    `${STUB_MARK} — 固定の案内。記録を足してもこのファイルは変わらない（\`node scripts/dev-notes.mjs --check\` が照合する） -->`,
    '# IntMap — 開発記録',
    '',
    '> **いつ・なぜ・どう直したか**の記録。**1 エントリ＝1 ファイル**で [`dev-notes/`](dev-notes/) にある。',
    '> **今どうなっているか**は `Architecture.md`、製品の不文律は `CONSTITUTION.md`。',
    '',
    '- **新しい順の一覧**: `node scripts/dev-notes.mjs --list`（その場で生成する。このファイルには書かない——',
    '  書くと、並行する PR が全部このファイルで衝突する）',
    '- **最新の 1 件**: `node scripts/dev-notes.mjs --latest`',
    '- **新しい記録**: `dev-notes/<YYYY-MM-DD>-<slug>.md`（front matter に `title` と `date`、分かれば `pr`）。手順は `.agents/skills/intmap-round/` §3',
    '- `dev-notes/R<N>.md` は番号で呼んでいた頃の記録（名前は当時のまま）。旧索引の各行（回ごとの長い要約）は',
    `  [\`${LEGACY_INDEX}\`](${LEGACY_INDEX})、それより前（Round 1 〜 #R259）は \`DEV-NOTES-ARCHIVE.md\`（古い順・読むだけ）`,
    '',
  ].join('\n');
}

/** Problems with dev-notes/ and the pointer file, as sentences (empty = consistent). */
export function checkNotes(root = ROOT) {
  const problems = [];
  const dir = join(root, NOTES_DIR);
  if (!existsSync(dir)) return [`${NOTES_DIR}/ does not exist — the record has nowhere to live`];
  const known = new Set([LEGACY_INDEX, LEGACY_PRS, LEGACY_MANIFEST].map((p) => p.slice(NOTES_DIR.length + 1)));
  const rounds = new Map();
  for (const name of readdirSync(dir)) {
    if (known.has(name)) continue;
    const d = DATED.exec(name), l = LEGACY.exec(name);
    if (!d && !l) { problems.push(`${NOTES_DIR}/${name} is neither <YYYY-MM-DD>-<slug>.md nor a legacy R<N>.md — the index cannot place it`); continue; }
    const body = rd(root, `${NOTES_DIR}/${name}`);
    if (d) {
      const fm = frontMatter(body);
      if (!fm) { problems.push(`${NOTES_DIR}/${name} has no front matter (--- title / date ---)`); continue; }
      if (!fm.title) problems.push(`${NOTES_DIR}/${name} has no title in its front matter`);
      if (fm.date !== d[1]) problems.push(`${NOTES_DIR}/${name}: front-matter date «${fm.date || ''}» is not the date in its name (${d[1]})`);
      if (fm.pr && !/^#?\d+$/.test(fm.pr)) problems.push(`${NOTES_DIR}/${name}: pr «${fm.pr}» is not a pull-request number`);
    } else {
      const h = ROUND_HEAD.exec(body.split('\n', 1)[0]);
      if (!h || +h[1] !== +l[1]) problems.push(`${NOTES_DIR}/${name} does not begin with its own «## R${l[1]}» heading`);
      if (rounds.has(+l[1])) problems.push(`R${l[1]} has two files: ${rounds.get(+l[1])} and ${name}`);
      rounds.set(+l[1], name);
    }
  }
  const idx = existsSync(join(root, INDEX_FILE)) ? rd(root, INDEX_FILE) : '';
  if (ROUND_HEAD.test(idx.split('\n').find((x) => ROUND_HEAD.test(x)) || '')) {
    problems.push(`${INDEX_FILE} carries a «## R<N>» entry — it is generated now. Move the entry into ${NOTES_DIR}/ `
      + '(`node scripts/dev-notes.mjs --split` does it for the old form) and run --write');
  } else if (idx !== renderStub()) {
    problems.push(`${INDEX_FILE} is not the fixed pointer \`node scripts/dev-notes.mjs --write\` writes — run it (the list itself is \`--list\`, never tracked)`);
  }
  return problems;
}

/* the PRs each legacy round landed in, read off the squash subjects «R806: … (#726)» */
function legacyPrs(root) {
  let log = '';
  try { log = execFileSync('git', ['log', '--format=%s', 'HEAD'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); } catch { return null; }
  const map = {};
  for (const s of log.split('\n')) {
    const m = /^R(\d+)\b.*\(#(\d+)\)\s*$/.exec(s);
    if (!m) continue;
    (map[m[1]] ||= []);
    if (!map[m[1]].includes(m[2])) map[m[1]].push(m[2]);
  }
  for (const k of Object.keys(map)) map[k].sort((a, b) => +a - +b);
  return map;
}

/* ══ CLI ═══════════════════════════════════════════════════════════════════════════════════ */
const isCLI = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCLI) {
  const has = (k) => process.argv.includes(k);
  const at = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
  const root = at('--root') ? resolve(at('--root')) : ROOT;

  if (has('--split')) {
    const src = at('--from') || INDEX_FILE;
    const text = lf(readFileSync(resolve(root, src), 'utf8'));
    /* keep a legacy round's existing file name, so a re-run rewrites the same file */
    const existingNames = {};
    if (existsSync(join(root, NOTES_DIR))) {
      for (const n of readdirSync(join(root, NOTES_DIR))) { const m = LEGACY.exec(n); if (m) existingNames[+m[1]] = n; }
    }
    const out = splitLegacy(text, { existingNames });
    if (!out.order.length) { console.log(`dev-notes --split: ${src} has no «## R<N>» entry — nothing to split (it is already the generated index).`); process.exit(0); }
    mkdirSync(join(root, NOTES_DIR), { recursive: true });
    let wrote = 0, same = 0;
    for (const [rel, body] of Object.entries(out.files)) {
      const p = join(root, rel);
      if (existsSync(p) && lf(readFileSync(p, 'utf8')) === body) { same++; continue; }
      writeFileSync(p, body); wrote++;
    }
    /* the regions: merged with what an earlier run kept, so a re-run on a newer copy only adds */
    const prevResidue = existsSync(join(root, LEGACY_INDEX))
      ? rd(root, LEGACY_INDEX).split('\n').filter((l) => l.trim()) : [];
    const residue = [...out.residue];
    const have = new Set(residue);
    const residueHead = residueHeader();
    const headLines = new Set(residueHead.split('\n'));
    for (const l of prevResidue) if (!have.has(l) && !headLines.has(l)) { residue.push(l); have.add(l); }
    writeFileSync(join(root, LEGACY_INDEX), residueHead + residue.join('\n') + '\n');
    const prs = legacyPrs(root);
    if (prs) {
      const prev = existsSync(join(root, LEGACY_PRS)) ? JSON.parse(rd(root, LEGACY_PRS)) : {};
      const merged = { ...prev };
      for (const r of out.order) if (prs[r]) merged[r] = [...new Set([...(prev[r] || []), ...prs[r]])].sort((a, b) => +a - +b);
      const sorted = Object.fromEntries(Object.keys(merged).sort((a, b) => +b - +a).map((k) => [k, merged[k]]));
      writeFileSync(join(root, LEGACY_PRS), JSON.stringify(sorted, null, 1) + '\n');
    }
    const manifest = existsSync(join(root, LEGACY_MANIFEST)) ? JSON.parse(rd(root, LEGACY_MANIFEST)) : { runs: [] };
    /* one row per DISTINCT input: re-running on the same file must not change the tree */
    if (!manifest.runs.some((r) => r.sourceSha256 === out.stats.sourceSha256)) manifest.runs.push({ at: new Date().toLocaleDateString('sv-SE'), ...out.stats });
    writeFileSync(join(root, LEGACY_MANIFEST), JSON.stringify(manifest, null, 1) + '\n');
    console.log(`dev-notes --split: ${out.order.length} entries (${wrote} written, ${same} unchanged) · `
      + `index rows ${out.stats.indexRowsTotal} → ${out.stats.indexRowsDistinct} distinct · `
      + `${out.residueDistinct} distinct region lines kept in ${LEGACY_INDEX}`);
    console.log('  next: node scripts/dev-notes.mjs --write');
    process.exit(0);
  }
  if (has('--write')) {
    writeFileSync(join(root, INDEX_FILE), renderStub());
    console.log(`dev-notes --write: ${INDEX_FILE} ← the fixed pointer (the list is --list)`);
    process.exit(0);
  }
  if (has('--list')) {
    process.stdout.write(renderIndex(root));
    process.exit(0);
  }
  if (has('--latest')) {
    const e = latestEntry(root);
    console.log(e ? `${e.kind === 'dated' ? e.date : 'R' + e.round} ${e.title}  (${e.file})` : '(none)');
    process.exit(0);
  }
  const p = checkNotes(root);
  if (p.length) { for (const x of p) console.error('✗ ' + x); process.exit(1); }
  console.log(`dev-notes: ${entries(root).length} entries, ${INDEX_FILE} is the fixed pointer (the list is --list)`);
  process.exit(0);
}
