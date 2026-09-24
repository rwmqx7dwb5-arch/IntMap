#!/usr/bin/env node
/* ============================================================================
 *  IntMap · DATASETS THAT LIVE OUTSIDE GIT  (data-outside-git)
 * ----------------------------------------------------------------------------
 *  THE DEFECT. data/border-detail/ (410 MB) and data/hist-eras.js (10.6 MB) were ordinary tracked
 *  files. Three things followed from that, and none of them said so:
 *
 *    ① EVERY CHECKOUT CARRIED ALL OF IT. `node scripts/worktree.mjs new` makes one worktree per
 *      session, and every one of them expanded the whole 420 MB again — on a machine that routinely
 *      holds a dozen at once. The OneDrive master carried it too, and uploaded every regeneration.
 *    ② NOTHING SAID WHICH BYTES WERE MEANT. A regenerated chunk, a half-copied directory or a
 *      CRLF-rewritten file (this Windows checkout stores both with CRLF; the blobs are LF) all read
 *      as «the data» to every reader, because there was no statement of what the data IS.
 *    ③ AND A MISSING DATASET COULD BE GREEN. `npm run check:assets` walks dist/ and judges what it
 *      finds: a build with no data/border-detail/ in it has 5,000 fewer files to judge and passes.
 *
 *  THE SHAPE NOW. `data-assets.json` (tracked) is the ONE statement of what each outside dataset is:
 *  its path, the sha256 of its content, and the GitHub Release asset that carries those bytes. The
 *  bytes live in a content-addressed store OUTSIDE the checkout (and outside OneDrive), and each
 *  checkout gets a link into it — so twelve worktrees cost one copy, and a checkout of any commit
 *  names exactly the bytes that commit was built with (rollback.yml relies on that).
 *
 *      node scripts/data-assets.mjs pull [--set <id>] [--copy] [--force]   # npm run data:pull
 *      node scripts/data-assets.mjs verify                                    # placed == manifest?
 *      node scripts/data-assets.mjs status                                    # where each set is
 *      node scripts/data-assets.mjs list [-z]           # every file of every set (the USB mirror reads this)
 *      node scripts/data-assets.mjs unlink              # remove the links (worktree.mjs done)
 *      node scripts/data-assets.mjs materialize <id>    # a writable copy, so a generator can rewrite it
 *      node scripts/data-assets.mjs publish <id> [--from-git <rev>] [--dry-run]   # npm run data:publish
 *
 *  ⚠ THE DIGEST (what `sha256` in the manifest means — one definition, used by every reader):
 *      a FILE set:      sha256 of the file's bytes          (so `sha256sum data/hist-eras.js` reproduces it)
 *      a DIRECTORY set: sha256 of the lines «<rel>\0<sha256 of the file>\n», one per regular file,
 *                       rel = the '/'-separated path under the set's directory, sorted by code unit.
 *  ⚠ WHERE THE STORE IS: $INTMAP_DATA_STORE, else %LOCALAPPDATA%\intmap-data (Windows) or
 *    ~/.cache/intmap-data. It REFUSES a location inside OneDrive (AGENTS.md §6: nothing large is
 *    written there) — the master's link is a junction, and OneDrive does not follow reparse points.
 *  ⚠ WHAT IS PLACED: a directory set is LINKED (a junction on Windows, a symlink elsewhere); a file
 *    set is COPIED (10 MB is cheaper than the class of reader that enumerates data/ with Dirent and
 *    skips a link). The store's files are read-only, so a generator that writes through a link fails
 *    loudly (EPERM) instead of silently rewriting the store — `materialize` first, then `publish`.
 *  ⚠ IT NEVER GOES QUIET. A set that cannot be placed is named with the reason and the exit is 1;
 *    a placed copy that differs from the manifest is REFUSED rather than overwritten (it may be a
 *    regeneration nobody has published yet) unless --force says to replace it.
 *  ⚠ ONE PASS (.agents/rules/one-pass-or-a-reason.md §5): a download is retried only after an
 *    OBSERVED failure (a thrown network error or a 5xx), at most 3 times, and every attempt is printed.
 * ==========================================================================*/
import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import {
  chmodSync, copyFileSync, cpSync, createReadStream, createWriteStream, existsSync, lstatSync, mkdirSync, readdirSync,
  readFileSync, readlinkSync, realpathSync, renameSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { createGunzip, createGzip, constants as Z } from 'node:zlib';

const HERE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const MANIFEST = 'data-assets.json';
const WIN = process.platform === 'win32';
const PULL_HINT = 'npm run data:pull';

/* ── the manifest ─────────────────────────────────────────────────────────────────────────────── */
/** The manifest at `root`, or null when that checkout has none (a commit from before data-outside-git — its
 *  data is in git, and there is nothing outside to fetch). */
export function readManifest(root = HERE_ROOT) {
  const p = join(root, MANIFEST);
  if (!existsSync(p)) return null;
  const m = JSON.parse(readFileSync(p, 'utf8'));
  if (m.v !== 1 || !m.sets || typeof m.sets !== 'object') throw new Error(`${MANIFEST}: not a v1 manifest`);
  if (!/^[\w.-]+\/[\w.-]+$/.test(m.repo || '')) throw new Error(`${MANIFEST}: "repo" must be <owner>/<name> — the Releases are that repository's`);
  for (const [id, s] of Object.entries(m.sets)) {
    for (const k of ['path', 'kind', 'sha256']) if (!s[k]) throw new Error(`${MANIFEST}: set «${id}» has no ${k}`);
    if (s.kind !== 'dir' && s.kind !== 'file') throw new Error(`${MANIFEST}: set «${id}» kind must be dir|file`);
    if (!/^[a-f0-9]{64}$/.test(s.sha256)) throw new Error(`${MANIFEST}: set «${id}» sha256 is not a sha256`);
    if (/(^|\/)\.\.(\/|$)/.test(s.path) || s.path.startsWith('/')) throw new Error(`${MANIFEST}: set «${id}» path escapes the checkout`);
  }
  return m;
}

const writeManifest = (root, m) => writeFileSync(join(root, MANIFEST), JSON.stringify(m, null, 2) + '\n');

/* ── the digest ───────────────────────────────────────────────────────────────────────────────── */
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/** Every regular file under `dir`, as sorted '/'-separated relative paths. A link or anything else
 *  that is not a regular file inside a set is an error — the store never contains one, so meeting
 *  one means the tree is not what the digest would describe. */
export function filesUnder(dir) {
  const out = [];
  const walk = (d, pre) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const rel = pre ? pre + '/' + e.name : e.name;
      if (e.isDirectory()) walk(join(d, e.name), rel);
      else if (e.isFile()) out.push(rel);
      else throw new Error(`${join(d, e.name)} is neither a file nor a directory`);
    }
  };
  walk(dir, '');
  return out.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** The digest of what is at `abs` (following a link at `abs` itself), with its file count and bytes. */
export function digestOf(abs, kind) {
  const st = statSync(abs);
  if (kind === 'file') {
    if (!st.isFile()) throw new Error(`${abs} is not a file`);
    const b = readFileSync(abs);
    return { sha256: sha256(b), files: 1, bytes: b.length };
  }
  if (!st.isDirectory()) throw new Error(`${abs} is not a directory`);
  const h = createHash('sha256');
  let bytes = 0;
  const rels = filesUnder(abs);
  for (const rel of rels) {
    const b = readFileSync(join(abs, ...rel.split('/')));
    bytes += b.length;
    h.update(rel + '\0' + sha256(b) + '\n');
  }
  return { sha256: h.digest('hex'), files: rels.length, bytes };
}

/* ── the store ────────────────────────────────────────────────────────────────────────────────── */
export function storeRoot() {
  const s = process.env.INTMAP_DATA_STORE
    || (WIN ? join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'intmap-data')
            : join(process.env.XDG_CACHE_HOME || join(homedir(), '.cache'), 'intmap-data'));
  const abs = resolve(s);
  for (const k of ['OneDrive', 'OneDriveConsumer', 'OneDriveCommercial']) {
    const od = process.env[k];
    if (od && (abs + sep).toLowerCase().startsWith(resolve(od).toLowerCase() + sep)) {
      throw new Error(`the data store ${abs} is inside OneDrive (${od}). AGENTS.md §6 keeps large trees out of it; set INTMAP_DATA_STORE elsewhere.`);
    }
  }
  return abs;
}
/** Where set `id` at digest `sha` lives in the store: a directory set IS this directory; a file set
 *  is the one file inside it, under its own basename. */
export const storeEntry = (id, sha) => join(storeRoot(), id, sha);
const payloadOf = (id, set) => (set.kind === 'dir' ? storeEntry(id, set.sha256) : join(storeEntry(id, set.sha256), basename(set.path)));

const setWritable = (dir, writable) => {
  for (const rel of filesUnder(dir)) chmodSync(join(dir, ...rel.split('/')), writable ? 0o644 : 0o444);
};
const removeTree = (dir) => {
  if (!existsSync(dir)) return;
  try { setWritable(dir, true); } catch { /* removal below says what is wrong */ }
  rmSync(dir, { recursive: true, force: true });
};

/* ── tar (ustar), both directions — written here so the asset's bytes do not depend on which tar a
   machine happens to have (bsdtar on Windows, GNU tar on the runners). Regular files only; a
   stream that holds anything else is refused, never skipped. ─────────────────────────────────── */
const BLOCK = 512;
function tarHeader(name, size) {
  const h = Buffer.alloc(BLOCK, 0);
  let nm = name, prefix = '';
  if (Buffer.byteLength(nm) > 100) {
    const cut = name.lastIndexOf('/', name.length - 1);
    prefix = name.slice(0, cut); nm = name.slice(cut + 1);
    if (Buffer.byteLength(nm) > 100 || Buffer.byteLength(prefix) > 155) throw new Error(`path too long for ustar: ${name}`);
  }
  h.write(nm, 0, 'utf8');
  h.write('0000644\0', 100); h.write('0000000\0', 108); h.write('0000000\0', 116);
  h.write(size.toString(8).padStart(11, '0') + '\0', 124);
  h.write('00000000000\0', 136);                 // mtime 0: the archive is a function of the content
  h.write('        ', 148);
  h.write('0', 156);
  h.write('ustar\0', 257); h.write('00', 263);
  h.write(prefix, 345, 'utf8');
  let sum = 0; for (const b of h) sum += b;
  h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);
  return h;
}

async function* tarStream(entries) {            // entries: [{ name, abs }]
  for (const { name, abs } of entries) {
    const b = readFileSync(abs);
    yield tarHeader(name, b.length);
    yield b;
    const pad = (BLOCK - (b.length % BLOCK)) % BLOCK;
    if (pad) yield Buffer.alloc(pad, 0);
  }
  yield Buffer.alloc(BLOCK * 2, 0);
}

const octal = (buf) => parseInt(buf.toString('latin1').replace(/\0.*$/s, '').trim() || '0', 8);
const cstr = (buf) => buf.toString('utf8').replace(/\0.*$/s, '');

/** Read a tar stream and call `onFile(name, bytes)` for every regular file. Directory entries and
 *  pax headers (git archive writes both) are understood; any other entry type is an error. */
export async function readTar(stream, onFile) {
  let chunks = [], have = 0;
  const take = (n) => {
    const all = chunks.length === 1 ? chunks[0] : Buffer.concat(chunks, have);
    const out = all.subarray(0, n), rest = all.subarray(n);
    chunks = rest.length ? [rest] : []; have = rest.length;
    return out;
  };
  let state = 'header', need = BLOCK, cur = null, paxPath = null, done = false;
  for await (const c of stream) {
    if (done) continue;
    chunks.push(c); have += c.length;
    while (!done && have >= need) {
      if (state === 'header') {
        const h = take(BLOCK);
        if (h.every((b) => b === 0)) { done = true; break; }
        const type = String.fromCharCode(h[156] || 48);
        const size = octal(h.subarray(124, 136));
        let name = cstr(h.subarray(0, 100));
        const prefix = cstr(h.subarray(345, 500));
        if (prefix) name = prefix + '/' + name;
        if (paxPath) { name = paxPath; paxPath = null; }
        cur = { type, size, name };
        state = 'body'; need = Math.ceil(size / BLOCK) * BLOCK;
        if (need === 0) { if (type === '0' && !name.endsWith('/')) onFile(name, Buffer.alloc(0)); state = 'header'; need = BLOCK; }
      } else {
        const body = take(need).subarray(0, cur.size);
        if (cur.type === '0') onFile(cur.name, Buffer.from(body));
        else if (cur.type === 'x') { const m = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(body.toString('utf8')); if (m) paxPath = m[1]; }
        else if (cur.type === 'g' || cur.type === '5') { /* a pax global header (git archive's commit id) / a directory */ }
        else throw new Error(`tar entry «${cur.name}» has type ${cur.type} — only regular files are carried`);
        state = 'header'; need = BLOCK;
      }
    }
  }
  if (!done) throw new Error('tar stream ended before its end-of-archive marker (truncated download?)');
}

/** Write `entries` under `dir`, refusing any name that would land outside it. */
const safeJoin = (dir, name) => {
  const clean = name.replace(/^\.\//, '');
  if (!clean || clean.startsWith('/') || /(^|\/)\.\.(\/|$)/.test(clean) || /^[A-Za-z]:/.test(clean)) throw new Error(`refusing tar path «${name}»`);
  return join(dir, ...clean.split('/'));
};

/* ── download ─────────────────────────────────────────────────────────────────────────────────── */
export const assetUrl = (m, set) => `https://github.com/${m.repo}/releases/download/${set.release.tag}/${set.release.asset}`;

async function download(url, to) {
  for (let attempt = 1; ; attempt++) {
    let why;
    try {
      const res = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'intmap-data-assets' } });
      if (res.ok && res.body) {
        const h = createHash('sha256');
        let bytes = 0;
        const tap = new Transform({ transform(c, _e, cb) { h.update(c); bytes += c.length; cb(null, c); } });
        await pipeline(Readable.fromWeb(res.body), tap, createWriteStream(to));
        return { sha256: h.digest('hex'), bytes };
      }
      if (res.status < 500) throw Object.assign(new Error(`HTTP ${res.status} for ${url}`), { final: true });
      why = `HTTP ${res.status}`;
    } catch (e) {
      if (e.final) throw e;
      why = e.cause?.code || e.code || e.message;
    }
    console.error(`  download attempt ${attempt} failed: ${why}`);
    if (attempt >= 3) throw new Error(`could not download ${url} after ${attempt} attempts (last: ${why})`);
  }
}

/** Unpack `archive` (a .tar.gz) into a fresh store entry for set `id`, and prove it is the set. */
async function fillStore(id, set, archive) {
  const final = storeEntry(id, set.sha256);
  const work = join(dirname(final), `.x-${process.pid}-${Date.now()}`);
  mkdirSync(work, { recursive: true });
  try {
    await readTar(createReadStream(archive).pipe(createGunzip()), (name, bytes) => {
      const to = safeJoin(work, name);
      mkdirSync(dirname(to), { recursive: true });
      writeFileSync(to, bytes);
    });
    const got = set.kind === 'dir' ? digestOf(work, 'dir') : digestOf(join(work, basename(set.path)), 'file');
    if (set.kind === 'file' && filesUnder(work).length !== 1) throw new Error(`the asset for «${id}» holds more than its one file`);
    if (got.sha256 !== set.sha256) throw new Error(`the asset for «${id}» unpacks to ${got.sha256.slice(0, 12)}, the manifest says ${set.sha256.slice(0, 12)}`);
    setWritable(work, false);
    try { renameSync(work, final); }
    catch (e) {
      /* another process filled the same entry first — theirs must be the same set, or it is not a store */
      if (existsSync(final) && digestOfSet(final, set) === set.sha256) removeTree(work);
      else throw e;
    }
  } catch (e) { removeTree(work); throw e; }
}

const digestOfSet = (entryDir, set) => (set.kind === 'dir' ? digestOf(entryDir, 'dir') : digestOf(join(entryDir, basename(set.path)), 'file')).sha256;

/** The store entry for set `id`, verified; fetched from the Release when absent or altered. */
async function ensureStore(m, id, set, say) {
  const entry = storeEntry(id, set.sha256);
  if (existsSync(entry)) {
    let ok = false;
    try { ok = digestOfSet(entry, set) === set.sha256; } catch { ok = false; }
    if (ok) return entry;
    say(`  ⚠ ${id}: the store copy at ${entry} was altered — replacing it from the Release`);
    removeTree(entry);
  }
  if (!set.release?.tag || !set.release?.asset) throw new Error(`«${id}» names no Release asset in ${MANIFEST}`);
  mkdirSync(dirname(entry), { recursive: true });
  const tmp = join(dirname(entry), `.dl-${process.pid}-${Date.now()}.tar.gz`);
  try {
    const url = assetUrl(m, set);
    say(`  ↓ ${id}: ${url}`);
    const got = await download(url, tmp);
    if (set.release.sha256 && got.sha256 !== set.release.sha256) {
      throw new Error(`the downloaded asset hashes to ${got.sha256.slice(0, 12)}, the manifest says ${set.release.sha256.slice(0, 12)}`);
    }
    await fillStore(id, set, tmp);
  } finally { rmSync(tmp, { force: true }); }
  return entry;
}

/* ── what is placed in a checkout ─────────────────────────────────────────────────────────────── */
/** { state: 'missing' | 'link' | 'real', to? } for the set's path in `root`. */
export function placed(root, set) {
  const p = join(root, ...set.path.split('/'));
  let st;
  try { st = lstatSync(p); } catch { return { state: 'missing', abs: p }; }
  if (st.isSymbolicLink()) {
    let to = null;
    try { to = realpathSync(p); } catch { /* dangling */ }
    return { state: 'link', abs: p, to, target: (() => { try { return readlinkSync(p); } catch { return null; } })() };
  }
  return { state: 'real', abs: p };
}

/** The reason set `id` is not usable in `root`, or null when it is. `verify` hashes the content
 *  (≈ 3 s for the largest set) — the gates pass it, because «present» is not «the bytes meant». */
export function problemWith(root, id, set, { verify = true } = {}) {
  const pl = placed(root, set);
  if (pl.state === 'missing') return `${set.path} is not in this checkout — it lives outside git (${MANIFEST}). Run \`${PULL_HINT}\`.`;
  if (pl.state === 'link' && !pl.to) return `${set.path} is a link to ${pl.target}, which does not exist. Run \`${PULL_HINT}\`.`;
  if (!verify) return null;
  let d;
  try { d = digestOf(pl.abs, set.kind); } catch (e) { return `${set.path} cannot be read (${e.message}). Run \`${PULL_HINT}\`.`; }
  if (d.sha256 !== set.sha256) {
    return `${set.path} is not the content ${MANIFEST} names (${d.sha256.slice(0, 12)} ≠ ${set.sha256.slice(0, 12)}, ${d.files} file(s)). `
      + `Run \`${PULL_HINT}\` — or, if you regenerated it on purpose, \`npm run data:publish ${id}\`.`;
  }
  return null;
}

/** For a gate: throw a sentence naming the fix when the set at `relPath` is absent or not the
 *  manifest's content. A checkout with no manifest (a commit before data-outside-git) has the file in git and
 *  passes through untouched. */
export function requireData(root, relPath, { verify = true } = {}) {
  const m = readManifest(root);
  if (!m) return;
  const hit = Object.entries(m.sets).find(([, s]) => s.path === relPath);
  if (!hit) throw new Error(`${relPath} is not a set in ${MANIFEST}`);
  const why = problemWith(root, hit[0], hit[1], { verify });
  if (why) throw new Error(why);
}

/** Every problem across all sets in `root` (empty when all are placed and verified). */
export function problems(root = HERE_ROOT, opts) {
  const m = readManifest(root);
  if (!m) return [];
  return Object.entries(m.sets).map(([id, s]) => problemWith(root, id, s, opts)).filter(Boolean);
}

function link(to, at) {
  mkdirSync(dirname(at), { recursive: true });
  symlinkSync(to, at, WIN ? 'junction' : 'dir');
}

async function pullOne(root, m, id, set, { copy, force }, say) {
  const pl = placed(root, set);
  const payload = payloadOf(id, set);
  if (pl.state === 'link' && pl.to && resolve(pl.to).toLowerCase() === resolve(realpathOr(payload)).toLowerCase()) {
    await ensureStore(m, id, set, say);        // the link is right; the store it points at is verified here
    say(`  ✓ ${id}: ${set.path} → ${payload}`);
    return;
  }
  if (pl.state === 'real') {
    let d = null;
    try { d = digestOf(pl.abs, set.kind); } catch { /* unreadable counts as different */ }
    if (d && d.sha256 === set.sha256) { say(`  ✓ ${id}: ${set.path} (a real copy, already the manifest's content)`); return; }
    if (!force) {
      throw new Error(`${set.path} exists and is NOT the manifest's content${d ? ` (${d.sha256.slice(0, 12)} ≠ ${set.sha256.slice(0, 12)})` : ''}. `
        + `It may be a regeneration nobody has published: \`npm run data:publish ${id}\` publishes it; \`${PULL_HINT} -- --force\` replaces it.`);
    }
    say(`  ⚠ ${id}: replacing ${set.path} (--force)`);
    if (set.kind === 'dir') removeTree(pl.abs); else { chmodSync(pl.abs, 0o644); unlinkSync(pl.abs); }
  } else if (pl.state === 'link') {
    unlinkSync(pl.abs);                        // removes the link itself, never what it points at
  }
  await ensureStore(m, id, set, say);
  mkdirSync(dirname(pl.abs), { recursive: true });
  if (set.kind === 'file') {
    copyFileSync(payload, pl.abs);
    chmodSync(pl.abs, 0o644);
    say(`  ✓ ${id}: ${set.path} (copied from ${payload})`);
  } else if (copy) {
    cpSync(payload, pl.abs, { recursive: true });
    setWritable(pl.abs, true);
    say(`  ✓ ${id}: ${set.path} (copied from ${payload})`);
  } else {
    link(payload, pl.abs);
    say(`  ✓ ${id}: ${set.path} → ${payload}`);
  }
  const why = problemWith(root, id, set, { verify: set.kind === 'file' || copy });
  if (why) throw new Error(why);
}
const realpathOr = (p) => { try { return realpathSync(p); } catch { return p; } };

/** Place every set (or `only`) into `root`. Returns the list of failures (empty = all placed). */
export async function pull(root = HERE_ROOT, { only = null, copy = false, force = false, say = console.log } = {}) {
  const m = readManifest(root);
  if (!m) { say(`data-assets: ${root} has no ${MANIFEST} — nothing lives outside git at this commit.`); return []; }
  const failed = [];
  for (const [id, set] of Object.entries(m.sets)) {
    if (only && id !== only) continue;
    try { await pullOne(root, m, id, set, { copy, force }, say); }
    catch (e) { failed.push(`${id}: ${e.message}`); }
  }
  if (only && !m.sets[only]) failed.push(`${only}: no such set in ${MANIFEST} (sets: ${Object.keys(m.sets).join(', ')})`);
  return failed;
}

/* ── publish ──────────────────────────────────────────────────────────────────────────────────── */
const git = (root, args, opts = {}) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 1 << 30, ...opts });
const gh = (root, args) => execFileSync(WIN ? 'gh.exe' : 'gh', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

/** Materialise `set` as committed at `rev`, byte for byte as git stores it (LF, whatever
 *  core.autocrlf says), and prove it: every file's blob id is recomputed and compared with ls-tree. */
async function fromGit(root, set, rev, into) {
  const listing = git(root, ['ls-tree', '-r', '-z', rev, '--', set.path]).split('\0').filter(Boolean);
  if (!listing.length) throw new Error(`${set.path} is not tracked at ${rev}`);
  const want = new Map(listing.map((l) => { const [meta, p] = l.split('\t'); return [p, meta.split(' ')[2]]; }));
  const child = spawn('git', ['-C', root, '-c', 'core.autocrlf=false', '-c', 'core.eol=lf', 'archive', '--format=tar', rev, '--', set.path], { stdio: ['ignore', 'pipe', 'inherit'] });
  const exited = new Promise((res) => child.on('close', res));
  let n = 0;
  try {
  await readTar(child.stdout, (name, bytes) => {
    const blob = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
    if (want.get(name) !== blob) throw new Error(`${name}: archived bytes are not the committed blob`);
    const rel = set.kind === 'dir' ? name.slice(set.path.length + 1) : basename(name);
    const to = safeJoin(into, rel);
    mkdirSync(dirname(to), { recursive: true });
    writeFileSync(to, bytes); n++;
  });
  } catch (e) { child.kill(); throw e; }
  if ((await exited) !== 0) throw new Error('git archive failed');
  if (n !== want.size) throw new Error(`git archive gave ${n} file(s); ls-tree lists ${want.size}`);
}

async function pack(src, set, to) {
  const entries = set.kind === 'dir'
    ? filesUnder(src).map((rel) => ({ name: rel, abs: join(src, ...rel.split('/')) }))
    : [{ name: basename(set.path), abs: src }];
  const h = createHash('sha256');
  let bytes = 0;
  const tap = new Transform({ transform(c, _e, cb) { h.update(c); bytes += c.length; cb(null, c); } });
  await pipeline(Readable.from(tarStream(entries)), createGzip({ level: Z.Z_BEST_COMPRESSION }), tap, createWriteStream(to));
  return { sha256: h.digest('hex'), bytes };
}

export async function publish(root, id, { fromGitRev = null, dryRun = false, say = console.log } = {}) {
  const m = readManifest(root);
  if (!m) throw new Error(`${root} has no ${MANIFEST}`);
  const set = m.sets[id];
  if (!set) throw new Error(`no set «${id}» in ${MANIFEST} (sets: ${Object.keys(m.sets).join(', ')})`);
  const base = join(storeRoot(), id);
  mkdirSync(base, { recursive: true });
  const stage = join(base, `.stage-${process.pid}-${Date.now()}`);
  mkdirSync(stage, { recursive: true });
  try {
    let src;
    if (fromGitRev) {
      await fromGit(root, set, fromGitRev, stage);
      src = set.kind === 'dir' ? stage : join(stage, basename(set.path));
      say(`  ${id}: ${set.path} as committed at ${fromGitRev} (every blob id re-derived and matched)`);
    } else {
      const pl = placed(root, set);
      if (pl.state === 'missing') throw new Error(`${set.path} is not in this checkout — nothing to publish`);
      src = pl.abs;
    }
    const d = digestOf(src, set.kind);
    const sha12 = d.sha256.slice(0, 12);
    const tag = `data-${id}-${sha12}`, asset = `${id}-${sha12}.tar.gz`;
    say(`  ${id}: ${d.files} file(s) · ${d.bytes} B · sha256 ${d.sha256}`);
    if (d.sha256 === set.sha256 && set.release?.tag === tag) {
      say(`  ${id}: already published as ${tag} — the manifest is unchanged.`);
      return { changed: false, set };
    }
    const dir = join(stage, '.asset'); mkdirSync(dir);
    const file = join(dir, asset);
    const a = await pack(src, set, file);
    say(`  ${id}: packed ${asset} · ${a.bytes} B · sha256 ${a.sha256}`);
    if (dryRun) { say('  --dry-run: nothing uploaded, manifest unchanged.'); return { changed: false }; }

    let exists = true;
    try { gh(root, ['release', 'view', tag, '--repo', m.repo, '--json', 'tagName']); } catch { exists = false; }
    if (!exists) {
      /* a PRE-release, so the repository's «latest release» is never a dataset — measured: `--latest=false`
         alone still made the first data Release «Latest», because GitHub had no other to choose */
      gh(root, ['release', 'create', tag, file, '--repo', m.repo, '--prerelease', '--latest=false',
        '--title', `data: ${id} ${sha12}`,
        '--notes', `Dataset \`${set.path}\` for IntMap, outside git (see ${MANIFEST} and scripts/data-assets.mjs).\n\n`
          + `- content sha256 (the manifest's digest): \`${d.sha256}\`\n- files: ${d.files}, bytes: ${d.bytes}\n`
          + `- asset sha256: \`${a.sha256}\`\n- built by: \`${set.builder || '(see docs)'}\`\n`]);
      say(`  ${id}: Release ${tag} created`);
    } else {
      say(`  ${id}: Release ${tag} already exists — checking that its asset is these bytes`);
    }
    /* ⚠ THE UPLOAD IS NOT THE PROOF. Read it back from the public URL a reader will use, and only
       then let the manifest name it. */
    const next = { ...set, sha256: d.sha256, files: d.files, bytes: d.bytes, release: { tag, asset, sha256: a.sha256, bytes: a.bytes } };
    const back = join(stage, 'readback.tar.gz');
    const got = await download(assetUrl(m, next), back);
    if (got.sha256 !== a.sha256) throw new Error(`the Release asset at ${assetUrl(m, next)} hashes to ${got.sha256.slice(0, 12)}, not the ${a.sha256.slice(0, 12)} just packed`);
    say(`  ${id}: read back from the Release — identical`);
    m.sets[id] = next;
    writeManifest(root, m);
    say(`  ${id}: ${MANIFEST} updated`);
    if (!existsSync(storeEntry(id, d.sha256))) await fillStore(id, next, back);
    return { changed: true, set: next, fromTarget: !fromGitRev };
  } finally { removeTree(stage); }
}

/* ── the CLI ──────────────────────────────────────────────────────────────────────────────────── */
async function main(argv) {
  const [cmd, ...rest] = argv;
  const flag = (f) => rest.includes(f);
  const val = (f) => { const i = rest.indexOf(f); return i >= 0 ? rest[i + 1] : null; };
  const root = resolve(val('--root') || HERE_ROOT);

  if (cmd === 'pull') {
    console.log(`data-assets: placing the datasets ${MANIFEST} names (store: ${storeRoot()})`);
    const failed = await pull(root, { only: val('--set'), copy: flag('--copy'), force: flag('--force') });
    if (failed.length) {
      console.error(`\ndata-assets: ${failed.length} set(s) could NOT be placed:`);
      for (const f of failed) console.error('  ✖ ' + f);
      return 1;
    }
    return 0;
  }
  if (cmd === 'verify') {
    const bad = problems(root, { verify: true });
    if (bad.length) { for (const b of bad) console.error('data-assets: ✖ ' + b); return 1; }
    const m = readManifest(root);
    console.log(m ? `data-assets: ${Object.keys(m.sets).length} set(s) placed, each the content ${MANIFEST} names.` : `data-assets: no ${MANIFEST} here.`);
    return 0;
  }
  if (cmd === 'status') {
    const m = readManifest(root);
    if (!m) { console.log(`no ${MANIFEST}`); return 0; }
    console.log(`store ${storeRoot()}`);
    for (const [id, s] of Object.entries(m.sets)) {
      const pl = placed(root, s);
      console.log(`  ${id.padEnd(16)} ${s.path.padEnd(22)} ${s.sha256.slice(0, 12)}  ${pl.state}${pl.to ? ' → ' + pl.to : ''}  ${s.release?.tag || '(no release)'}`);
    }
    return 0;
  }
  if (cmd === 'list') {
    const m = readManifest(root);
    if (!m) return 0;
    const bad = problems(root, { verify: true });
    if (bad.length) { for (const b of bad) console.error('data-assets: ✖ ' + b); return 1; }
    const out = [];
    for (const s of Object.values(m.sets)) {
      if (s.kind === 'file') out.push(s.path);
      else for (const rel of filesUnder(join(root, ...s.path.split('/')))) out.push(s.path + '/' + rel);
    }
    process.stdout.write(flag('-z') ? out.join('\0') + (out.length ? '\0' : '') : out.join('\n') + '\n');
    return 0;
  }
  if (cmd === 'unlink') {
    const m = readManifest(root);
    for (const [id, s] of Object.entries(m?.sets || {})) {
      const pl = placed(root, s);
      if (pl.state === 'link') { unlinkSync(pl.abs); console.log(`  ✓ ${id}: removed the link ${s.path} (the store is untouched)`); }
    }
    return 0;
  }
  if (cmd === 'materialize') {
    const id = rest[0];
    const m = readManifest(root);
    const set = m?.sets[id];
    if (!set) { console.error(`no set «${id}» in ${MANIFEST}`); return 1; }
    const pl = placed(root, set);
    if (pl.state === 'real') { console.log(`${set.path} is already a real, writable copy.`); return 0; }
    const failed = await pull(root, { only: id });
    if (failed.length) { for (const f of failed) console.error('  ✖ ' + f); return 1; }
    if (set.kind === 'file') { console.log(`${set.path} is a copy already — write to it, then \`npm run data:publish ${id}\`.`); return 0; }
    const payload = payloadOf(id, set);
    const tmp = pl.abs + `.materialize-${process.pid}`;
    cpSync(payload, tmp, { recursive: true });
    setWritable(tmp, true);
    unlinkSync(pl.abs);
    renameSync(tmp, pl.abs);
    console.log(`${set.path} is now a writable copy. Regenerate it, then \`npm run data:publish ${id}\`.`);
    return 0;
  }
  if (cmd === 'publish') {
    const id = rest.find((a) => !a.startsWith('--') && a !== val('--from-git') && a !== val('--root'));
    if (!id) { console.error('usage: node scripts/data-assets.mjs publish <set> [--from-git <rev>] [--dry-run]'); return 1; }
    const r = await publish(root, id, { fromGitRev: val('--from-git'), dryRun: flag('--dry-run') });
    if (r.changed && r.fromTarget) {
      /* the regenerated copy becomes the store's: put the link back, so the checkout is a checkout again */
      const failed = await pull(root, { only: id, force: true });
      if (failed.length) { for (const f of failed) console.error('  ✖ ' + f); return 1; }
    }
    if (r.changed) console.log(`\nCommit ${MANIFEST}: it is what makes every other checkout fetch these bytes.`);
    return 0;
  }
  console.error('usage: node scripts/data-assets.mjs pull|verify|status|list|unlink|materialize <set>|publish <set>  (see the header)');
  return 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (e) => { console.error('data-assets: ' + (e.message || e)); process.exitCode = 1; });
}

export { pack as packSet, fillStore as storeFromArchive };
