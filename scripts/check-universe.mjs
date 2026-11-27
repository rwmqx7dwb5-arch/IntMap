/* The files a repository-wide check judges: what git would commit (tracked, plus untracked-but-not-ignored).
   Measured 2026-11-28: scripts/static-checks.mjs walked the directory tree and so also read the gitignored
   data/border-detail/ (9,143 files, 773 MB; a link into %LOCALAPPDATA% in a worktree) three times each — ~34k reads,
   the gate never finished on a machine that holds it (CI does not). Ignored files are not committed, so no check
   is about them. Same universe scripts/secret-scan.mjs calls "every file git would commit".
   Expires if: a check must judge a built or generated file that is ignored — then that check names it itself. */
import { execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { join, extname } from 'node:path';

/** gitUniverse(root, skipDirs) → [{abs, rel, ext, size}], or null when root is not a git checkout */
export function gitUniverse(root, skipDirs = new Set()) {
  let names;
  try {
    names = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8', maxBuffer: 256 << 20, stdio: ['ignore', 'pipe', 'ignore'] }).split('\0').filter(Boolean);
  } catch { return null; }
  const out = [];
  for (const name of new Set(names)) {
    if (name.endsWith('/')) continue;   /* a nested checkout (another worktree): a different branch */
    if (name.split('/').some((seg) => skipDirs.has(seg))) continue;
    const abs = join(root, name);
    let s;
    try { s = statSync(abs); } catch { continue; }   /* listed but gone (a deletion not yet staged) */
    if (s.isDirectory()) continue;
    out.push({ abs, rel: name, ext: extname(name).toLowerCase(), size: s.size });
  }
  return out;
}
