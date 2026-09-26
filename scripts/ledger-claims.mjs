/* ============================================================================
 *  IntMap · ファイル台帳（docs/FILES.md の木）が述べる「ここに何があるか」を実体に訊く
 * ----------------------------------------------------------------------------
 *  `scripts/doc-facts.mjs` の `ledger-*` 規則が使う純関数。検査が直に測れるよう、読み手を
 *  doc-facts の外に置いた（shared-roster.mjs と同じ理由——7 秒の門を回さずに掃ける）。
 *
 *  ⚠ なぜ要るのか（2026-09-27 の監査で実測）。docs/FILES.md の木には 3 種類の事実があり、
 *  どれも誰にも照合されていなかった:
 *    · 本数 — `tests/*_test.sql … 12本`（実体 13）、`*.spec.js（114本）`（実体 122）、
 *      `r<n>-checks.test.mjs（349本）`（どの数え方でも 349 にならない）。
 *    · 名簿 — `.github/workflows/` は 11 本のうち `aviation-sweep.yml` を載せていなかった。
 *    · 在ること — 台帳に行があるのに実体が無い、を測る者がいなかった。
 *  migrations の本数だけは doc-facts の規則 3 が 1 つの綴りで測っていた——規則が事実ではなく
 *  1 つの行に付いていた（.agents/rules/no-ad-hoc-hardcoding.md §1）。ここは木の**全行**に付ける。
 *
 *  規則（どれも行の種類から決まり、ディレクトリ名を 1 つも手で書かない）:
 *    1. 名前にワイルドカード（`*` か `<…>`）を持つ行が「（…N本）」と述べたら、その glob は N 件。
 *    2. ワイルドカードを持たない行は、その場所に実在する。
 *    3. ディレクトリの行が自分の説明に「全件」と書いたら、その子の行は実体の全部を挙げる。
 * ==========================================================================*/
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/* 木の行とその説明の継続行を分ける境。台帳の説明欄は 32 桁前後から始まり、木の深さは
   2 桁ずつ。観測（2026-09-27）: 最も深い行の字下げは 4、継続行の最も浅い字下げは 30。
   失効条件: 木が 7 段より深くなる、または説明欄が 14 桁より左へ寄る。 */
const MAX_TREE_INDENT = 12;

const isGlob = (name) => /[*<]/.test(name);

/** fenced block の中の木を {path, name, desc, indent, line, isDir} の列にする。 */
export function ledgerRows(md) {
  const rows = [];
  let inFence = false;
  let stack = []; // [{indent, path}]
  const lines = String(md || '').split(/\r?\n/);
  lines.forEach((raw, i) => {
    if (/^```/.test(raw)) { inFence = !inFence; stack = []; return; }
    if (!inFence || !raw.trim()) return;
    const indent = raw.match(/^ */)[0].length;
    if (indent > MAX_TREE_INDENT) {
      const last = rows[rows.length - 1];
      if (last) last.cont = (last.cont ? last.cont + ' ' : '') + raw.trim();
      return;
    }
    const m = raw.slice(indent).match(/^(\S+)(.*)$/);
    if (!m) return;
    const name = m[1];
    /* 「a.html / b.html   説明」のように 1 行に複数の名前を並べた行は、1 つの場所を名指して
       いないので木の節にしない（その下に子を持たない） */
    const compound = /^\s+\/\s+\S/.test(m[2]);
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    const parent = stack.length ? stack[stack.length - 1].path : '';
    const isDir = name.endsWith('/');
    const path = parent + name;
    /* 木の根（その block の最上位のディレクトリ行）。根を持たない行と、根がリポジトリの
       最上位に無い行（`railways/` のように節の見出しが data/ を与えている block）は、場所を
       block の中だけでは決められないので測らない——位置を推測して赤にしない。 */
    const root = stack.length ? stack[0].path : (isDir ? path : null);
    const row = { path, name, desc: m[2].trim(), indent, line: i + 1, isDir, compound, cont: '', root };
    rows.push(row);
    if (isDir && !compound) stack.push({ indent, path });
  });
  return rows;
}

/** glob の 1 区間を正規表現に: `*` は区切りを越えない任意列、`<…>` は 1 文字以上の名前。 */
const segRe = (seg) => new RegExp('^' + seg.split(/(\*|<[^>]+>)/).map((p) => (
  p === '*' ? '[^/]*' : /^<[^>]+>$/.test(p) ? '[^/]+' : p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
)).join('') + '$');

/** glob（ルートからの相対）に当たる実体の数。 */
export function countGlob(root, glob) {
  const segs = glob.replace(/\/$/, '').split('/');
  let here = [''];
  segs.forEach((seg, k) => {
    const last = k === segs.length - 1;
    const next = [];
    for (const base of here) {
      const dir = join(root, base);
      if (!isGlob(seg)) {
        const p = base ? `${base}/${seg}` : seg;
        if (existsSync(join(root, p))) next.push(p);
        continue;
      }
      let names = [];
      try { names = readdirSync(dir); } catch { continue; }
      const re = segRe(seg);
      for (const n of names) {
        if (!re.test(n)) continue;
        const p = base ? `${base}/${n}` : n;
        const isD = statSync(join(root, p)).isDirectory();
        if (last ? (glob.endsWith('/') ? isD : !isD) : isD) next.push(p);
      }
    }
    here = next;
  });
  return here.length;
}

/** 行の説明が述べる本数（最初の「（…N本）」）。述べていなければ null。 */
export const statedCount = (desc) => {
  const m = String(desc || '').match(/（[^（）]*?(\d[\d,]*)\s*本[^（）]*）/);
  return m ? Number(m[1].replace(/,/g, '')) : null;
};

/** 台帳全体を実体と突き合わせる。返すのは問題の列と、何を測ったか。 */
export function auditLedger(md, root) {
  const rows = ledgerRows(md);
  const problems = [];
  let counted = 0, located = 0, rosters = 0;
  const rooted = (r) => r.root && r.path !== r.root && existsSync(join(root, r.root));
  for (const r of rows) {
    if (r.compound || !rooted(r)) continue;
    if (isGlob(r.path)) {
      const n = statedCount(r.desc);
      if (n == null) continue;
      counted++;
      const actual = countGlob(root, r.path);
      if (actual !== n) problems.push({ kind: 'count', path: r.path, line: r.line, stated: n, actual });
      continue;
    }
    located++;
    if (!existsSync(join(root, r.path))) problems.push({ kind: 'missing', path: r.path, line: r.line });
  }
  for (const d of rows.filter((r) => r.isDir && !r.compound && /全件/.test(r.desc) && existsSync(join(root, r.root)))) {
    rosters++;
    const kids = new Set(rows.filter((r) => !r.compound && r.path !== d.path && r.path.startsWith(d.path)
      && !r.path.slice(d.path.length).replace(/\/$/, '').includes('/')).map((r) => r.path.slice(d.path.length)));
    let real = [];
    try {
      real = readdirSync(join(root, d.path)).filter((n) => !n.startsWith('.'))
        .map((n) => (statSync(join(root, d.path, n)).isDirectory() ? `${n}/` : n));
    } catch { /* missing dir is reported by rule 2 */ }
    const omits = real.filter((n) => !kids.has(n));
    if (omits.length) problems.push({ kind: 'omits', path: d.path, line: d.line, names: omits });
  }
  return { problems, counted, located, rosters, rows: rows.length };
}
