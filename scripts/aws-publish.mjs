#!/usr/bin/env node
/*
 *  IntMap · aws-publish — PUBLISH dist/ TO THE S3 BUCKET BEHIND CLOUDFRONT, WITH THE SAME HEADERS PAGES GIVES
 *
 *  The site is moving off GitHub Pages (it is over the 1 GB published-site limit, and Pages' terms
 *  exclude running a commercial service on it — DECISIONS.md «配信先は AWS（S3 + CloudFront）»). The
 *  new host is ONE origin serving the very same dist/, so nothing in the page changes: relative data
 *  paths, the Range reads of data/hvt, the service worker and the CSP all keep working as they are.
 *  What this script owns is the part Pages used to decide for us — the response headers — and the
 *  part S3 does not do by itself — knowing which objects actually changed.
 *
 *  HEADERS. Each object is stored with the Content-Type Pages sends for it, MEASURED 2026-10-06 with
 *  one HEAD per extension against the live Pages site (table CONTENT_TYPES below). An extension that
 *  is not in the table is an ERROR, not a guess: a wrong type is silent (application/gzip read as
 *  text, a font refused), so the next new kind of file must be looked up once and written down here.
 *  Pages also sends `Access-Control-Allow-Origin: *` on every response (measured the same day) —
 *  that is CloudFront's response-headers policy (infra/aws/hosting.yaml), not object metadata.
 *
 *  CACHE. Pages sends `Cache-Control: max-age=600` on everything. Browsers keep exactly that here
 *  (nothing about how long a reader's browser holds a file changes with the move), except Vite's
 *  content-hashed files, whose name changes when their bytes do — those are immutable for a year.
 *  The CDN itself may keep everything for a year (`s-maxage`) because every publish invalidates it.
 *
 *  COMPRESSION. CloudFront compresses text on the fly, but only objects of 1,000 to 10,000,000 bytes
 *  (docs.aws.amazon.com «Serve compressed files», read 2026-10-06). The bundles above that — up to
 *  41 MB of JavaScript today — would go out uncompressed, where Pages gzips them. So a text object
 *  over that size is stored gzipped (deterministically: no name, no mtime) with Content-Encoding:
 *  gzip. The `.gz` archives are NOT text types, are never re-encoded, and keep being served as the
 *  stored bytes — which is what js/hist-bundles.js's Range reads need.
 *
 *  CHANGES. A deploy is 15,000+ files and ~1 GB. Re-uploading it all on every merge would make each
 *  publish minutes long and churn every ETag. The bucket carries `_publish/manifest.json` — what
 *  the last publish stored for each key (md5 of the stored bytes and every header) — and only keys
 *  whose entry differs, or which the bucket does not hold, are uploaded. `--full` ignores it.
 *
 *  DELETIONS. A key the new dist/ does not have is deleted only once it is older than the grace
 *  period: a reader whose page is the previous version (max-age 600, or an open tab) may still ask
 *  for the previous hashed chunk. The bucket is versioned (30 days of noncurrent versions), so a
 *  deletion is never the loss of a rollback.
 *
 *  ORDER. Everything that a page refers to goes up before the pages that refer to it (HTML, the
 *  service worker, the web manifest, build-info.json last), then the CDN is invalidated.
 *
 *  Usage:
 *    node scripts/aws-publish.mjs --dist dist --bucket <name> --distribution <id> [--stamp] [--grace-days 7] [--full] [--dry-run]
 *      --stamp writes dist/build-info.json from the GitHub Actions environment first
 *    node scripts/aws-publish.mjs --guard --bucket <name> --sha <candidate>   (needs GITHUB_TOKEN, GITHUB_REPOSITORY)
 *  The AWS CLI does the transfers (it is on every GitHub-hosted runner); credentials come from the
 *  environment (in CI: the OIDC role, aws-actions/configure-aws-credentials).
 */
import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync, constants as zc } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { compareStatus, decidePublish } from './pages-publish-guard.mjs';

/* MEASURED 2026-10-06: `curl -sI` of one file per extension in dist/ against the live Pages site.
   ⚠ Not «what the type should be» — what readers' browsers have been receiving. .tle, .pbf and .bin
   really are application/octet-stream there, and .gz is application/gzip with no Content-Encoding. */
export const CONTENT_TYPES = Object.freeze({
  html: 'text/html; charset=utf-8',
  js: 'application/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8',
  css: 'text/css; charset=utf-8',
  gz: 'application/gzip',
  png: 'image/png',
  jpg: 'image/jpeg',
  woff2: 'font/woff2',
  woff: 'font/woff',
  ttf: 'font/ttf',
  pbf: 'application/octet-stream',
  bin: 'application/octet-stream',
  tle: 'application/octet-stream',
  xml: 'application/xml',
  geojson: 'application/geo+json',
  md: 'text/markdown; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  webmanifest: 'application/manifest+json; charset=utf-8',
  svg: 'image/svg+xml',
  wasm: 'application/wasm',
  gif: 'image/gif',
});

/* Types that are text, i.e. that CloudFront (and Pages) would compress. The archives and images are
   not: compressing compressed bytes costs CPU and wins nothing, and a .gz must stay its own bytes. */
const TEXT_TYPE = /^(text\/|image\/svg\+xml|application\/(javascript|json|xml|geo\+json|manifest\+json|wasm)\b)/;

/* docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/ServingCompressedFiles.html (2026-10-06):
   CloudFront compresses objects between 1,000 and 10,000,000 bytes. Above that we compress ourselves. */
export const CLOUDFRONT_COMPRESS_MAX = 10_000_000;

export const BROWSER_MAX_AGE = 600;          // = what Pages sends on every response (measured above)
export const HASHED_MAX_AGE = 31_536_000;     // a year: the name changes when the bytes do
export const MANIFEST_KEY = '_publish/manifest.json';
export const BUILD_INFO_KEY = 'build-info.json';

export function extensionOf(key) {
  const m = /\.([^./]+)$/.exec(key);
  return m ? m[1].toLowerCase() : '';
}

export function contentTypeOf(key) {
  const t = CONTENT_TYPES[extensionOf(key)];
  if (!t) {
    throw new Error(`aws-publish: no Content-Type is known for «${key}». Look up what Pages serves for this extension (curl -sI) and add it to CONTENT_TYPES — do not guess.`);
  }
  return t;
}

/* Vite's output names: <name>-<8-char base64url hash>.<ext> (vite.config.js leaves Rollup's default
   [name]-[hash] pattern). Decided by the NAME, not the directory: dist/assets also receives files a
   plugin copies under their own names. */
export function isContentHashed(key) {
  return key.startsWith('assets/') && /-[A-Za-z0-9_-]{8}\.[a-z0-9]+$/.test(key);
}

export function cacheControlOf(key) {
  return isContentHashed(key)
    ? `public, max-age=${HASHED_MAX_AGE}, immutable`
    : `public, max-age=${BROWSER_MAX_AGE}, s-maxage=${HASHED_MAX_AGE}`;
}

export function encodingOf(key, size) {
  return TEXT_TYPE.test(contentTypeOf(key)) && size > CLOUDFRONT_COMPRESS_MAX ? 'gzip' : '';
}

/* Uploaded last: the files that NAME the others. A page arriving before its chunks would 404 them. */
export function isEntry(key) {
  return extensionOf(key) === 'html' || key === 'sw.js' || key === 'manifest.webmanifest' || key === BUILD_INFO_KEY;
}

/* Deterministic gzip: no file name, mtime 0 — the same bytes give the same md5 on every run, so an
   unchanged 41 MB bundle is not re-uploaded. */
export function gzipBytes(buf) {
  return gzipSync(buf, { level: zc.Z_BEST_COMPRESSION });
}

const md5 = (buf) => createHash('md5').update(buf).digest('hex');

/* build-info.json — the file production is asked «which commit are you?» with (scripts/release-state.mjs,
   the guard below). The Pages publish writes it with a printf in ci.yml's «Assemble site» step; this is
   the same four fields for the AWS publish, and tests/aws-hosting-checks reads that printf and fails if
   the two ever name different fields. */
export function buildInfo(env = process.env, now = new Date()) {
  for (const k of ['GITHUB_SHA', 'GITHUB_REF_NAME', 'GITHUB_RUN_ID']) {
    if (!env[k]) throw new Error(`aws-publish --stamp: ${k} is not set (it is, in every GitHub Actions run)`);
  }
  return { sha: env.GITHUB_SHA, ref: env.GITHUB_REF_NAME, runId: env.GITHUB_RUN_ID, builtAt: now.toISOString().replace(/\.\d{3}Z$/, 'Z') };
}

/** One record per file: what will be stored under its key. */
export function describe(key, bytes) {
  const encoding = encodingOf(key, bytes.length);
  const stored = encoding ? gzipBytes(bytes) : bytes;
  return { key, contentType: contentTypeOf(key), cacheControl: cacheControlOf(key), encoding, md5: md5(stored), size: stored.length, stored };
}

const sameEntry = (a, b) => !!a && !!b && a.md5 === b.md5 && a.contentType === b.contentType
  && a.cacheControl === b.cacheControl && (a.encoding || '') === (b.encoding || '');

/** Which records to upload: not in the bucket, or different from what the last publish stored. */
export function planUploads(records, manifest, remoteKeys, { full = false } = {}) {
  const prev = (manifest && manifest.files) || {};
  return records.filter((r) => full || !remoteKeys.has(r.key) || !sameEntry(r, prev[r.key]));
}

/** Which remote keys to delete: absent from dist/, not ours (_publish/), older than the grace period. */
export function planDeletions(remote, localKeys, { now = Date.now(), graceDays = 7 } = {}) {
  const cutoff = now - graceDays * 86_400_000;
  const del = [], kept = [];
  for (const o of remote) {
    if (localKeys.has(o.key) || o.key.startsWith('_publish/')) continue;
    (Date.parse(o.lastModified) < cutoff ? del : kept).push(o.key);
  }
  return { del, kept };
}

/** Upload groups: records sharing every header go up in one `aws s3 cp --recursive`. Entries last. */
export function groupUploads(records) {
  const groups = new Map();
  for (const r of records) {
    const id = [isEntry(r.key) ? 1 : 0, r.contentType, r.cacheControl, r.encoding].join('\u0000');
    if (!groups.has(id)) groups.set(id, { entry: isEntry(r.key), contentType: r.contentType, cacheControl: r.cacheControl, encoding: r.encoding, records: [] });
    groups.get(id).records.push(r);
  }
  return [...groups.values()].sort((a, b) => Number(a.entry) - Number(b.entry));
}

export function walk(dir) {
  const out = [];
  (function w(d) {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) w(p);
      else if (e.isFile()) out.push(relative(dir, p).split(sep).join('/'));
      else throw new Error(`aws-publish: «${p}» is neither a file nor a directory (a link would publish what it points at, or nothing)`);
    }
  })(dir);
  return out.sort();
}

/* ── the AWS CLI ───────────────────────────────────────────────────────────────────────────── */
function aws(args, { input, allowFail = false } = {}) {
  const r = spawnSync('aws', args, { encoding: 'utf8', input, maxBuffer: 1 << 30 });
  if (r.error) throw r.error;
  if (r.status !== 0 && !allowFail) throw new Error(`aws ${args.slice(0, 3).join(' ')} … failed (${r.status}): ${(r.stderr || '').trim()}`);
  return r;
}

function listRemote(bucket) {
  const out = [];
  let token;
  do {
    const args = ['s3api', 'list-objects-v2', '--bucket', bucket, '--output', 'json', '--max-items', '100000'];
    if (token) args.push('--starting-token', token);
    const j = JSON.parse(aws(args).stdout || '{}');
    for (const o of j.Contents || []) out.push({ key: o.Key, lastModified: o.LastModified });
    token = j.NextToken;
  } while (token);
  return out;
}

function readRemoteJson(bucket, key) {
  const r = aws(['s3', 'cp', `s3://${bucket}/${key}`, '-'], { allowFail: true });
  if (r.status !== 0) return null;
  try { return JSON.parse(r.stdout); } catch { return null; }
}

function uploadGroup(bucket, g, stage) {
  rmSync(stage, { recursive: true, force: true });
  for (const r of g.records) {
    const p = join(stage, ...r.key.split('/'));
    mkdirSync(join(p, '..'), { recursive: true });
    writeFileSync(p, r.stored);
  }
  const args = ['s3', 'cp', stage, `s3://${bucket}/`, '--recursive', '--only-show-errors', '--no-guess-mime-type',
    '--content-type', g.contentType, '--cache-control', g.cacheControl];
  if (g.encoding) args.push('--content-encoding', g.encoding);
  aws(args);
}

function summary(line) {
  console.log(line);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n`);
}

async function publish({ dist, bucket, distribution, graceDays, full, dryRun, stamp }) {
  if (stamp) writeFileSync(join(dist, BUILD_INFO_KEY), `${JSON.stringify(buildInfo())}
`);
  const keys = walk(dist);
  if (!keys.includes('index.html')) throw new Error(`aws-publish: ${dist}/index.html is missing — the build produced no site`);
  const records = keys.map((k) => describe(k, readFileSync(join(dist, ...k.split('/')))));
  const remote = dryRun && !bucket ? [] : listRemote(bucket);
  const remoteKeys = new Set(remote.map((o) => o.key));
  const manifest = dryRun && !bucket ? null : readRemoteJson(bucket, MANIFEST_KEY);
  const up = planUploads(records, manifest, remoteKeys, { full });
  const { del, kept } = planDeletions(remote, new Set(keys), { graceDays });
  const groups = groupUploads(up);
  const bytes = up.reduce((s, r) => s + r.size, 0);
  summary(`**AWS publish** — ${keys.length} files in dist/; upload ${up.length} (${bytes.toLocaleString('en')} B in ${groups.length} header groups); delete ${del.length}; keep ${kept.length} stale key(s) inside the ${graceDays}-day grace; gzip-stored ${records.filter((r) => r.encoding).length}`);
  if (dryRun) {
    for (const g of groups) console.log(`  ${g.entry ? 'entry' : 'asset'} ${g.records.length}\t${g.contentType}\t${g.cacheControl}${g.encoding ? `\t${g.encoding}` : ''}`);
    return 0;
  }
  const stage = join(tmpdir(), `intmap-aws-publish-${process.pid}`);
  try { for (const g of groups) uploadGroup(bucket, g, stage); }
  finally { rmSync(stage, { recursive: true, force: true }); }
  const files = Object.fromEntries(records.map((r) => [r.key, { md5: r.md5, contentType: r.contentType, cacheControl: r.cacheControl, encoding: r.encoding }]));
  aws(['s3', 'cp', '-', `s3://${bucket}/${MANIFEST_KEY}`, '--content-type', 'application/json; charset=utf-8', '--cache-control', 'no-store'],
    { input: JSON.stringify({ v: 1, at: new Date().toISOString(), files }) });
  for (let i = 0; i < del.length; i += 1000) {
    const batch = { Objects: del.slice(i, i + 1000).map((Key) => ({ Key })), Quiet: true };
    aws(['s3api', 'delete-objects', '--bucket', bucket, '--delete', JSON.stringify(batch)]);
  }
  if (up.length || del.length) {
    const inv = JSON.parse(aws(['cloudfront', 'create-invalidation', '--distribution-id', distribution, '--paths', '/*', '--output', 'json']).stdout);
    summary(`CloudFront invalidation ${inv.Invalidation && inv.Invalidation.Id} for /*`);
  }
  return 0;
}

/* Production never moves backward: the same decision as pages-publish-guard.mjs (imported, not
   copied), with «what is live» read from the bucket's own build-info.json — read from S3 directly,
   never through the CDN, so it cannot trail the last publish. */
async function guardMain({ bucket, sha }) {
  const repo = process.env.GITHUB_REPOSITORY, token = process.env.GITHUB_TOKEN;
  if (!bucket || !sha || !repo || !token) { console.error('aws-publish --guard: needs --bucket, --sha, GITHUB_REPOSITORY and GITHUB_TOKEN'); return 1; }
  const getJson = async (path) => {
    const r = await fetch(`https://api.github.com/${path}`, { headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' } });
    if (!r.ok) throw new Error(`GET ${path} → HTTP ${r.status}`);
    return r.json();
  };
  let v;
  try {
    const info = readRemoteJson(bucket, BUILD_INFO_KEY);
    const live = info && info.sha ? info.sha : null;
    const status = !live ? undefined : live === sha ? 'identical' : await compareStatus(getJson, repo, live, sha);
    v = { ...decidePublish({ candidate: sha, live, status }), live };
  } catch (e) {
    console.error(`::error::aws-publish --guard could not tell what is live (${e.message}). Not publishing blind.`);
    return 1;
  }
  const line = `${v.publish ? 'publish' : 'REFUSED'}: ${v.reason}`;
  console.log(v.publish ? (v.warn ? `::warning::${line}` : line) : `::notice::${line}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `publish=${v.publish}\nlive=${v.live || ''}\n`);
  summary(`**AWS publish guard** — ${line}`);
  return 0;
}

function parse(argv) {
  const o = { dist: 'dist', graceDays: 7, full: false, dryRun: false, guard: false, stamp: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dist') o.dist = argv[++i];
    else if (a === '--bucket') o.bucket = argv[++i];
    else if (a === '--distribution') o.distribution = argv[++i];
    else if (a === '--grace-days') o.graceDays = Number(argv[++i]);
    else if (a === '--sha') o.sha = argv[++i];
    else if (a === '--full') o.full = true;
    else if (a === '--dry-run') o.dryRun = true;
    else if (a === '--guard') o.guard = true;
    else if (a === '--stamp') o.stamp = true;
    else throw new Error(`aws-publish: unknown argument ${a}`);
  }
  if (!Number.isFinite(o.graceDays) || o.graceDays < 0) throw new Error('aws-publish: --grace-days must be a non-negative number');
  return o;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  (async () => {
    const o = parse(process.argv.slice(2));
    if (o.guard) return guardMain(o);
    if (!o.dryRun && (!o.bucket || !o.distribution)) { console.error('aws-publish: needs --bucket and --distribution (or --dry-run)'); return 1; }
    statSync(o.dist);
    return publish(o);
  })().then((c) => { process.exitCode = c; }, (e) => { console.error(`::error::${e.message}`); process.exitCode = 1; });
}
