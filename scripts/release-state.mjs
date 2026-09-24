#!/usr/bin/env node
/* ============================================================================
 *  IntMap · 本番で走っている「組み合わせ」を、綴りではなく中身で測る  (#R745)
 * ----------------------------------------------------------------------------
 *  IntMap は 3 つの独立した配備単位でできている。静的サイト（GitHub Pages）、Edge Functions
 *  （Supabase）、データベース（migration）。`main` が緑であることは、その 3 つが **同じ組み合わせ
 *  で動いている**ことを一度も意味していない。`npm test` はチェックアウトを測るのであって、配備
 *  された先を測らない。
 *
 *  ⚠ 実測 2026-09-16（この道具が最初に測った本番）:
 *    · Edge Functions **17 本のうち 7 本**が、リポジトリと違うソースで走っていた。
 *    · うち 3 本（`monitor-run` `news-ingest` `refresh-news`）は **Atlas の persona に
 *      `workspace` の段落が無い版**＝挙動そのものが違う。`ai-proxy` だけが新しい版だった。
 *    · 残りはラウンド番号の付け替えなど註だけの差で、それでも「配備されているのは古い版」である。
 *    · 一方 `ais-feed` は **1 バイトも違わなかった**——コミット時刻は「ソースのほうが新しい」と
 *      言っていたのに（下の ⚠⚠⚠）。
 *    · migration は local 7 本が remote に無く、remote 2 本が local に無い。
 *    · 静的サイトだけが一致していた（`build-info.json` の sha ＝ `origin/main`）。
 *
 *  ⚠⚠⚠ **時刻は配備の同一性を答えない。** この道具の最初の版はコミット時刻と `updated_at` を
 *  比べていて、17 本すべてを「ソースのほうが新しい」と報告した。そのうち実際に中身が違ったのは
 *  一部で、`ais-feed` のように完全に一致しているものまで赤く塗っていた。理由は 2 つあり、どちらも
 *  時刻では原理的に解けない: ① ラウンドの途中（merge の前）に worktree から deploy すると、
 *  正しく配備されていても「コミットのほうが新しい」に見える。② squash merge のコミット時刻は
 *  そのラウンドが**始まった**時刻ではない。だからここは **配備されたソースを実際に取り寄せて
 *  中身を突き合わせる**（`supabase functions download`）。時刻は文脈として印字するだけで、
 *  判定には一切使わない。
 *
 *      node scripts/release-state.mjs            # 3 面を測って表にする
 *      node scripts/release-state.mjs --json     # 同じものを JSON で
 *      node scripts/release-state.mjs --check    # 食い違いがあれば exit 1 / 測れなければ exit 2
 *      node scripts/release-state.mjs --web      # 面を指定（--web / --edge / --db, 併用可）
 *      node scripts/release-state.mjs --diff who-don   # その関数の実際の差分を出す
 *
 *  ⚠ これは **CI のゲートではない**（`npm test` に入れない）。3 面とも資格情報とネットワークを
 *  必要とし、CI のチェックアウトは detached な PR ref なので「main と一致しない」が正常な状態
 *  になる。CI が証明できることは `tests/r745-arch-review-followup-checks.test.mjs` が別に測る。
 *  ⚠ ただし **nightly の読み手はある**: `.github/workflows/supabase-deploy.yml` の drift job が
 *  main のチェックアウトで `--edge --db --check` を走らせ、exit 1（食い違い）も exit 2（測れない）も赤にする。
 *  ⚠ **「測れなかった」を「一致している」の代わりにしない。** 取得に失敗した面は `unknown` と
 *  して報告し、`--check` は exit 2 で終わる（`intmap-one-store-was-asked` の教訓）。
 *  ⚠ **名前を 1 つも手で書かない。** 関数の名簿は `supabase/functions/` の実体、Supabase の
 *  project ref は**出荷しているコードが使っている URL**（`src/vendor.js`）、Pages の URL は
 *  `origin` の remote から導出する。手で並べた一覧は、次に足されたものを黙って落とす。
 * ==========================================================================*/
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* ---------------------------------------------------------------- 導出（手で書かない） */

/** `origin` の remote URL から GitHub Pages の公開 URL を導く。 */
export const pagesUrlFromRemote = (remote) => {
  const m = /github\.com[/:]([^/]+)\/(.+?)(?:\.git)?\s*$/.exec(String(remote || ''));
  return m ? `https://${m[1].toLowerCase()}.github.io/${m[2]}/` : null;
};

/** 出荷しているコードが実際に叩いている Supabase の project ref。 */
export const supabaseRefFrom = (vendorSource) => {
  const m = /https:\/\/([a-z0-9]+)\.supabase\.co/.exec(String(vendorSource || ''));
  return m ? m[1] : null;
};

/** Edge Function の名簿＝ディレクトリの実体。`_shared/` はライブラリであって関数ではない。 */
export const edgeRoster = (root) => {
  const dir = path.join(root, 'supabase/functions');
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('_'))
    .map((e) => e.name)
    .sort();
};

/** `supabase migration list` の表を、local だけ / remote だけ / 両方に分ける。
 *  ⚠ 見出しと罫線と CLI の更新案内を落とす。行は `local | remote | time` の 3 欄で、
 *  片側が空欄のとき「もう片方にしか無い」。 */
export const parseMigrationTable = (text) => {
  const both = [], localOnly = [], remoteOnly = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const cells = raw.split('|').map((c) => c.trim());
    if (cells.length !== 3) continue;
    const [local, remote] = cells;
    const stamp = /^\d{14}$/;
    if (stamp.test(local) && stamp.test(remote)) both.push(local);
    else if (stamp.test(local) && !remote) localOnly.push(local);
    else if (!local && stamp.test(remote)) remoteOnly.push(remote);
  }
  return { both, localOnly, remoteOnly };
};

/* ---------------------------------------------------------------- 突き合わせ */

const walk = (dir, base = dir) => {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p, base));
    else out.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return out.sort();
};

/** 変更された行がすべてコメント（または空行）なら真。
 *  ⚠ これは**判定ではなく観察**である。「コメントだけなら配備しなくてよい」とは言わない
 *  ——配備されているのが古い版であることに変わりはない。読み手が優先順位を付けられるように
 *  述べるだけ。
 *  ⚠ **行の頭だけを見る**ので、ブロックコメントの途中の行（`⚠ …` で始まる続き）はコメントと
 *  判定できない。取り違える向きは片側だけ——「コメントだけ」と**言い足りない**ことはあっても、
 *  コードの違いを「コメントだけ」と呼ぶことはない。安全な側に倒してある。 */
export const commentsOnly = (diffText) => {
  const changed = String(diffText).split(/\r?\n/)
    .filter((l) => /^[+-]/.test(l) && !/^(\+\+\+|---)/.test(l))
    .map((l) => l.slice(1).trim());
  if (!changed.length) return false;
  return changed.every((l) => l === '' || l.startsWith('//') || l.startsWith('*') || l.startsWith('/*') || l.startsWith('*/'));
};

/** 配備されたファイル木とリポジトリの木を、1 ファイルずつ中身で比べる。
 *  ⚠ 歩くのは**配備された木**である。deploy が束ねるのは import で到達したものだけなので、
 *  リポジトリにしか無いファイル（到達されていない控えなど）は食い違いではない。 */
export const compareTrees = (deployedDir, repoRoot, git) => {
  const files = walk(deployedDir);
  const same = [], differs = [], missingInRepo = [];
  for (const rel of files) {
    const a = path.join(deployedDir, rel);
    const b = path.join(repoRoot, rel);
    if (!existsSync(b)) { missingInRepo.push(rel); continue; }
    /* ⚠⚠⚠ 判定はバイトそのものに付ける。git は「何行動いたか」を飾るためだけに呼ぶ。
       この関数の最初の版は `git diff --numstat` の出力が空かどうかで一致を決めていて、
       渡された呼び出し側が失敗時に空文字列を返す作りだったため、**違っている 17 本すべてが
       「一致」として報告された**。「読めなかった」が「同じだ」の証拠として通る形は、
       上流でも自分の道具の中でも同じように壊れる（memory: intmap-one-store-was-asked）。 */
    if (readFileSync(a).equals(readFileSync(b))) { same.push(rel); continue; }
    const num = git(['diff', '--no-index', '--numstat', '--', a, b]);
    const [plus, minus] = String(num || '').split(/\s+/);
    const body = git(['diff', '--no-index', '-U0', '--', a, b]);
    differs.push({ file: rel, plus: Number(plus) || 0, minus: Number(minus) || 0, commentsOnly: commentsOnly(body) });
  }
  return { files: files.length, same, differs, missingInRepo };
};

/** 突き合わせの結果から、その 1 本についての判定を出す。
 *  ⚠ **0 ファイルは「一致」ではない**——取り寄せられなかったということ。ここを `differs.length`
 *  だけで決めると、取得に失敗した関数が緑になる。 */
export const edgeState = (cmp) =>
  !cmp || !cmp.files ? 'unknown'
    : cmp.differs.length || cmp.missingInRepo.length ? 'differs'
      : 'identical';

/* ---------------------------------------------------------------- 実行 */

const ARGS = process.argv.slice(2);
const flag = (f) => ARGS.includes(f);
const valueOf = (f) => { const i = ARGS.indexOf(f); return i >= 0 ? ARGS[i + 1] : null; };

const run = (cmd, args, { cwd, allowFail = false, timeout = 180_000 } = {}) => {
  try {
    return execFileSync(cmd, args, { cwd, encoding: 'utf8', timeout, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (e) {
    if (allowFail) return e.stdout != null ? String(e.stdout).trim() : '';
    throw e;
  }
};

const ROOT = run('git', ['rev-parse', '--show-toplevel']);
/* 原本＝main worktree。Supabase の link 状態（`supabase/.temp/`）はそこにしか無いので、
   migration はそこを workdir にして訊く（原本の場所は `master-sync.mjs` と同じ導出——
   `--git-common-dir` が、どの worktree から呼ばれても原本の .git を名指す）。 */
const MASTER = path.dirname(run('git', ['-C', ROOT, 'rev-parse', '--path-format=absolute', '--git-common-dir']));
const git = (args, opts = {}) => run('git', ['-C', ROOT, ...args], { allowFail: opts.allowFail !== false });

const REF = supabaseRefFrom(existsSync(path.join(ROOT, 'src/vendor.js')) ? readFileSync(path.join(ROOT, 'src/vendor.js'), 'utf8') : '');
const PAGES = process.env.PROD_URL || pagesUrlFromRemote(git(['remote', 'get-url', 'origin'], { allowFail: true }));

const planes = ['web', 'edge', 'db'].filter((p) => flag('--' + p));
const WANT = planes.length ? new Set(planes) : new Set(['web', 'edge', 'db']);

/* --------- 面 1: 静的サイト */

const measureWeb = async () => {
  if (!PAGES) return { state: 'unknown', why: 'origin の remote から Pages の URL を導けなかった' };
  let info;
  try {
    const r = await fetch(new URL('build-info.json', PAGES).href, { cache: 'no-store', signal: AbortSignal.timeout(30_000) });
    if (!r.ok) return { state: 'unknown', why: `build-info.json が HTTP ${r.status}` };
    info = await r.json();
  } catch (e) { return { state: 'unknown', why: `build-info.json を取得できない: ${e.message}` }; }
  git(['fetch', '--quiet', 'origin', 'main']);
  const head = git(['rev-parse', 'origin/main']);
  /* ⚠ 「その commit をこのチェックアウトが持っているか」を先に訊く。持っていない commit を
     rev-list に渡すと落ちるので、距離は null（＝測れなかった）として報告する。 */
  const known = Boolean(git(['rev-parse', '--verify', '--quiet', `${info.sha}^{commit}`]));
  const behind = known ? Number(git(['rev-list', '--count', `${info.sha}..origin/main`]) || 0) : null;
  return {
    state: info.sha === head ? 'aligned' : 'behind',
    url: PAGES, sha: info.sha, ref: info.ref, runId: info.runId, builtAt: info.builtAt,
    head, behind,
  };
};

/* --------- 面 2: Edge Functions */

const measureEdge = () => {
  const roster = edgeRoster(ROOT);
  if (!REF) return { state: 'unknown', why: 'src/vendor.js から Supabase の project ref を読めなかった', roster };
  let listed;
  try {
    /* ⚠ `-o json` を明示する。実測 2026-09-25（CLI 2.106.0）: 旗が無いときの形式は CLI が
       「エージェントの中から呼ばれたか」を環境変数で推測して決める——Claude Code の中では JSON、
       `--agent no`（＝GitHub Actions の nightly）では表を出す。表からは配列が取れないので、
       nightly は毎晩「測れなかった」になるところだった。 */
    const raw = run('supabase', ['functions', 'list', '--project-ref', REF, '-o', 'json'], { cwd: ROOT });
    /* CLI は版によって更新案内を混ぜるので、配列そのものだけを取り出す。 */
    listed = JSON.parse(raw.slice(raw.indexOf('['), raw.lastIndexOf(']') + 1));
  } catch (e) { return { state: 'unknown', why: `supabase functions list が失敗した: ${String(e.message).split('\n')[0]}`, roster }; }

  const deployed = new Map(listed.map((f) => [f.slug || f.name, f]));
  const tmp = mkdtempSync(path.join(tmpdir(), 'intmap-release-'));
  const rows = [];
  try {
    for (const slug of roster) {
      const meta = deployed.get(slug);
      if (!meta) { rows.push({ slug, state: 'not-deployed' }); continue; }
      /* ⚠ 1 本ずつ別の workdir へ落とす。同じ木へ重ねると、あとから落とした関数の `_shared/` が
         前の関数のものを上書きし、比較が「別の関数について」の答えになる。 */
      const dest = path.join(tmp, slug);
      mkdirSync(dest, { recursive: true });
      try {
        run('supabase', ['functions', 'download', slug, '--project-ref', REF, '--workdir', dest], { timeout: 120_000 });
      } catch (e) {
        rows.push({ slug, state: 'unknown', why: String(e.message).split('\n')[0], version: meta.version });
        continue;
      }
      const cmp = compareTrees(path.join(dest, 'supabase/functions'), path.join(ROOT, 'supabase/functions'), git);
      rows.push({
        slug, version: meta.version, updatedAt: new Date(meta.updated_at).toISOString(), verifyJwt: meta.verify_jwt,
        state: edgeState(cmp),
        why: cmp.files ? undefined : '配備されたソースを 1 ファイルも取り寄せられなかった',
        ...cmp,
      });
    }
    for (const [slug] of deployed) if (!roster.includes(slug)) rows.push({ slug, state: 'not-in-repo' });
  } finally { rmSync(tmp, { recursive: true, force: true }); }

  const bad = rows.filter((r) => r.state === 'differs' || r.state === 'not-deployed' || r.state === 'not-in-repo');
  const unknown = rows.filter((r) => r.state === 'unknown');
  return { state: unknown.length ? 'unknown' : bad.length ? 'drift' : 'aligned', rows, ref: REF };
};

/* --------- 面 3: データベース */

const measureDb = () => {
  /* link は原本にしか無い。ここだけ cwd を原本へ向ける。 */
  let text;
  try { text = run('supabase', ['migration', 'list', '--linked', '--workdir', MASTER], { timeout: 180_000 }); }
  catch (e) { return { state: 'unknown', why: `supabase migration list が失敗した: ${String(e.message).split('\n')[0]}` }; }
  const t = parseMigrationTable(text);
  return { state: t.localOnly.length || t.remoteOnly.length ? 'drift' : 'aligned', ...t, measuredIn: MASTER };
};

/* --------- --diff <slug>: 1 本の実際の差分 */

const showDiff = (slug) => {
  if (!REF) { console.error('project ref を読めない'); process.exit(2); }
  const tmp = mkdtempSync(path.join(tmpdir(), 'intmap-release-'));
  try {
    mkdirSync(path.join(tmp, slug), { recursive: true });
    run('supabase', ['functions', 'download', slug, '--project-ref', REF, '--workdir', path.join(tmp, slug)]);
    const base = path.join(tmp, slug, 'supabase/functions');
    for (const rel of walk(base)) {
      const a = path.join(base, rel), b = path.join(ROOT, 'supabase/functions', rel);
      console.log(`\n--- 配備 ${rel}\n+++ リポジトリ ${rel}`);
      console.log(git(['diff', '--no-index', '--', a, b]) || '  （一致）');
    }
  } finally { rmSync(tmp, { recursive: true, force: true }); }
};

/* --------- 印字 */

const mark = { aligned: '✓', identical: '✓', behind: '⚠', drift: '⚠', differs: '⚠', 'not-deployed': '⚠', 'not-in-repo': '⚠', unknown: '?' };

const report = (r) => {
  console.log('\nIntMap · 本番で走っている組み合わせ\n');
  if (r.web) {
    const w = r.web;
    console.log(`  ${mark[w.state] || '?'} 静的サイト   ${w.state === 'unknown' ? w.why : `${w.sha?.slice(0, 8)} (${w.builtAt})`}`);
    if (w.state === 'behind') console.log(`      origin/main ${w.head?.slice(0, 8)} より ${w.behind ?? '?'} コミット遅れている`);
    if (w.state === 'aligned') console.log(`      origin/main と同じ commit`);
  }
  if (r.edge) {
    const e = r.edge;
    if (e.state === 'unknown' && e.why) console.log(`  ? Edge        ${e.why}`);
    else {
      const bad = e.rows.filter((x) => x.state !== 'identical');
      console.log(`  ${mark[e.state] || '?'} Edge        ${e.rows.length} 本中 ${e.rows.length - bad.length} 本が本番と一致`);
      for (const x of bad) {
        const d = (x.differs || []).map((f) => `${f.file} (+${f.plus}/-${f.minus}${f.commentsOnly ? '・コメントのみ' : ''})`).join(', ');
        console.log(`      ${mark[x.state] || '?'} ${x.slug.padEnd(16)} ${x.state}${x.version ? ` v${x.version}` : ''}${d ? ' · ' + d : ''}${x.why ? ' · ' + x.why : ''}`);
      }
    }
  }
  if (r.db) {
    const d = r.db;
    if (d.state === 'unknown') console.log(`  ? データベース ${d.why}`);
    else {
      console.log(`  ${mark[d.state] || '?'} データベース ${d.both.length} 本が両側・local だけ ${d.localOnly.length} 本・remote だけ ${d.remoteOnly.length} 本`);
      if (d.localOnly.length) console.log(`      local のみ:  ${d.localOnly.join(' ')}`);
      if (d.remoteOnly.length) console.log(`      remote のみ: ${d.remoteOnly.join(' ')}`);
    }
  }
  console.log('');
};

const main = async () => {
  const diffSlug = valueOf('--diff');
  if (diffSlug) { showDiff(diffSlug); return; }

  const out = {};
  if (WANT.has('web')) out.web = await measureWeb();
  if (WANT.has('edge')) out.edge = measureEdge();
  if (WANT.has('db')) out.db = measureDb();

  if (flag('--json')) console.log(JSON.stringify(out, null, 2));
  else report(out);

  if (!flag('--check')) return;
  const states = Object.values(out).map((p) => p.state);
  if (states.includes('unknown')) process.exit(2);
  if (states.some((s) => s !== 'aligned')) process.exit(1);
};

/* ⚠ import されたときは何も走らせない。上の純関数（`compareTrees` ほか）は検査が import して
   直に測るもので、その import が本番へ 17 回の取得を始めては困る。 */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
