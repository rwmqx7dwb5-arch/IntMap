/*
 *  (aws-hosting) The site moves to S3 + CloudFront with the SAME response headers Pages gives.
 *  What is pinned here is not the AWS side (that is tested on the live address once the account exists —
 *  docs/RELEASE.md «AWS（S3 + CloudFront）での配信») but the decisions this repository makes for it:
 *    ① every file the build produces has a known Content-Type — an unknown one is an error, not a guess
 *    ② cache and compression rules: browsers keep Pages' 600 s except Vite's hashed names; text over
 *       CloudFront's 10 MB compression ceiling is stored gzipped, deterministically; .gz never is
 *    ③ only changed objects are uploaded; stale keys wait out the grace period; entries go last
 *    ④ build-info.json carries the same fields as the Pages publish's printf
 *    ⑤ the templates: one origin, Pages' CORS header, OIDC role bound to this repo's environment,
 *       DNS untouched until PointDns=true, the certificate stack refuses any region but us-east-1
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import * as yaml from 'js-yaml';
import {
  CONTENT_TYPES, CLOUDFRONT_COMPRESS_MAX, MANIFEST_KEY, buildInfo, cacheControlOf, contentTypeOf, describe,
  encodingOf, groupUploads, isContentHashed, planDeletions, planUploads,
} from '../scripts/aws-publish.mjs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('① a known type per extension; an unknown extension is refused, not guessed', () => {
  assert.equal(contentTypeOf('index.html'), 'text/html; charset=utf-8');
  assert.equal(contentTypeOf('data/hvt/cshapes.jsonl.gz'), 'application/gzip', 'a .gz is an archive the page Range-reads, never Content-Encoding');
  assert.equal(contentTypeOf('data/tle/catalogue.tle'), 'application/octet-stream', 'what Pages actually sends (measured), not what it «should» be');
  assert.equal(contentTypeOf('DATA/X.JSON'), CONTENT_TYPES.json, 'extensions are case-insensitive');
  assert.throws(() => contentTypeOf('data/new-kind.parquet'), /no Content-Type is known/);
  assert.throws(() => contentTypeOf('LICENSE'), /no Content-Type is known/);
});

test('② cache: Pages\' 600 s for browsers, a year only for content-hashed names', () => {
  assert.equal(cacheControlOf('assets/main-DVmfbYnT.js'), 'public, max-age=31536000, immutable');
  assert.ok(isContentHashed('assets/KaTeX_AMS-Regular-BQhdFMY1.woff2'));
  assert.ok(!isContentHashed('assets/IntMap.Icon.png'), 'a file copied into assets/ under its own name is not hashed');
  assert.ok(!isContentHashed('data/hist-admin1.js'), 'data/ names do not change with their bytes');
  for (const k of ['index.html', 'sw.js', 'data/border-detail/index.json', 'assets/IntMap.Icon.png']) {
    assert.match(cacheControlOf(k), /^public, max-age=600, s-maxage=\d+$/, `${k}: browsers keep exactly what Pages gave them`);
  }
});

test('② compression: text above CloudFront\'s ceiling is stored gzipped, deterministically; archives never', () => {
  assert.equal(encodingOf('data/hist-admin1.js', CLOUDFRONT_COMPRESS_MAX + 1), 'gzip');
  assert.equal(encodingOf('data/hist-admin1.js', CLOUDFRONT_COMPRESS_MAX), '', 'CloudFront itself compresses up to its ceiling');
  assert.equal(encodingOf('data/huge.jsonl.gz', 50_000_000), '', 'a .gz is stored as its own bytes, whatever its size');
  assert.equal(encodingOf('data/huge.png', 50_000_000), '');
  const big = Buffer.from('x'.repeat(CLOUDFRONT_COMPRESS_MAX + 10));
  const a = describe('data/big.js', big), b = describe('data/big.js', big);
  assert.equal(a.encoding, 'gzip');
  assert.equal(a.md5, b.md5, 'the same bytes give the same stored bytes — an unchanged bundle is not re-uploaded');
  assert.deepEqual(gunzipSync(a.stored), big);
});

test('③ only what changed goes up; stale keys wait out the grace; pages go up after what they name', () => {
  const r = (key, md5, extra = {}) => ({ key, md5, contentType: contentTypeOf(key), cacheControl: cacheControlOf(key), encoding: '', ...extra });
  const local = [r('index.html', 'h1'), r('data/a.json', 'a1'), r('data/b.json', 'b2'), r('data/c.json', 'c1')];
  const manifest = { files: { 'index.html': r('index.html', 'h1'), 'data/a.json': r('data/a.json', 'a1'), 'data/b.json': r('data/b.json', 'b1'), 'data/c.json': r('data/c.json', 'c1') } };
  const remote = new Set(['index.html', 'data/a.json', 'data/b.json']);
  assert.deepEqual(planUploads(local, manifest, remote).map((x) => x.key), ['data/b.json', 'data/c.json'],
    'b changed bytes; c is in the manifest but not in the bucket');
  assert.equal(planUploads(local, manifest, remote, { full: true }).length, 4);
  const changedHeader = { files: { ...manifest.files, 'data/a.json': { ...manifest.files['data/a.json'], cacheControl: 'max-age=1' } } };
  assert.ok(planUploads(local, changedHeader, remote).some((x) => x.key === 'data/a.json'), 'a header change alone re-uploads');

  const now = Date.parse('2026-10-20T00:00:00Z');
  const { del, kept } = planDeletions([
    { key: 'assets/old-AAAAAAAA.js', lastModified: '2026-10-01T00:00:00Z' },
    { key: 'assets/prev-BBBBBBBB.js', lastModified: '2026-10-19T00:00:00Z' },
    { key: MANIFEST_KEY, lastModified: '2026-01-01T00:00:00Z' },
    { key: 'index.html', lastModified: '2026-01-01T00:00:00Z' },
  ], new Set(['index.html']), { now, graceDays: 7 });
  assert.deepEqual(del, ['assets/old-AAAAAAAA.js']);
  assert.deepEqual(kept, ['assets/prev-BBBBBBBB.js'], 'a reader on the previous page may still ask for it');

  const groups = groupUploads([r('index.html', '1'), r('sw.js', '2'), r('data/a.json', '3'), r('build-info.json', '4')]);
  const firstEntry = groups.findIndex((g) => g.entry);
  assert.ok(firstEntry > 0 && groups.slice(firstEntry).every((g) => g.entry), 'every entry group comes after every asset group');
  assert.ok(groups.slice(firstEntry).flatMap((g) => g.records.map((x) => x.key)).includes('build-info.json'));
});

test('④ build-info.json names the same fields as the Pages publish\'s printf', () => {
  const ci = read('.github/workflows/ci.yml');
  const printf = /printf '(\{[^']*\})\\n'/.exec(ci);
  assert.ok(printf, 'ci.yml «Assemble site» printf not found');
  const pagesFields = [...printf[1].matchAll(/"([a-zA-Z]+)":/g)].map((m) => m[1]);
  const ours = Object.keys(buildInfo({ GITHUB_SHA: 'a'.repeat(40), GITHUB_REF_NAME: 'main', GITHUB_RUN_ID: '1' }, new Date(0)));
  assert.deepEqual(ours, pagesFields);
  assert.throws(() => buildInfo({}), /GITHUB_SHA is not set/);
});

/* CloudFormation's long-form intrinsics are plain YAML (the templates say so); a short tag would make
   this parse throw, which is the point. */
const tpl = (p) => yaml.load(read(p));

test('⑤ hosting.yaml: one private origin, Pages\' CORS header, a role only this repo\'s environment can take', () => {
  const t = tpl('infra/aws/hosting.yaml');
  const R = t.Resources;
  const pab = R.SiteBucket.Properties.PublicAccessBlockConfiguration;
  assert.ok(pab.BlockPublicAcls && pab.BlockPublicPolicy && pab.IgnorePublicAcls && pab.RestrictPublicBuckets, 'the bucket is never public');
  assert.equal(R.SiteBucket.Properties.VersioningConfiguration.Status, 'Enabled');
  const dc = R.Distribution.Properties.DistributionConfig;
  assert.equal(dc.Origins.length, 1, 'one origin: the page keeps its relative paths');
  assert.equal(dc.DefaultCacheBehavior.ResponseHeadersPolicyId, '60669652-455b-4ae9-85a4-c4c02393f86c', 'managed SimpleCORS = Access-Control-Allow-Origin: * as on Pages');
  assert.equal(dc.DefaultCacheBehavior.ViewerProtocolPolicy, 'redirect-to-https');
  const code = R.ViewerRequest.Properties.FunctionCode['Fn::Sub'];
  assert.doesNotMatch(code.replace('${DomainName}', ''), /\$\{/, 'Fn::Sub owns ${…} in the function code');

  const trust = R.PublishRole.Properties.AssumeRolePolicyDocument.Statement[0].Condition.StringEquals;
  assert.equal(trust['token.actions.githubusercontent.com:sub']['Fn::Sub'], 'repo:${GitHubRepository}:environment:${PublishEnvironment}');
  assert.equal(t.Parameters.PublishEnvironment.Default, yaml.load(read('.github/workflows/ci.yml')).jobs.aws.environment.name,
    'the role trusts the environment the publishing job runs in');
  const actions = R.PublishRole.Properties.Policies.flatMap((p) => p.PolicyDocument.Statement.flatMap((s) => [].concat(s.Action)));
  assert.deepEqual([...new Set(actions)].sort(), ['cloudfront:CreateInvalidation', 'cloudfront:GetInvalidation', 's3:DeleteObject', 's3:GetObject', 's3:ListBucket', 's3:PutObject']);

  assert.equal(t.Parameters.PointDns.Default, 'false', 'creating the stack must not move the domain');
  for (const [id, r] of Object.entries(R)) {
    if (r.Type === 'AWS::Route53::RecordSet') assert.equal(r.Condition, 'DnsHere', `${id} would move DNS before the cut-over`);
  }
});

test('⑤ certificate.yaml can only be created in us-east-1', () => {
  const t = tpl('infra/aws/certificate.yaml');
  assert.deepEqual(t.Rules.MustBeUsEast1.Assertions[0].Assert['Fn::Equals'], [{ Ref: 'AWS::Region' }, 'us-east-1']);
  assert.equal(t.Resources.Certificate.Properties.ValidationMethod, 'DNS');
});

/* ① against the real build, wherever one exists (the CI shard that downloads the build artifact, or a
   local `npm run build`). Without it this cannot be measured, and says so instead of passing. */
test('① every file in dist/ has a known Content-Type', async (t) => {
  const { existsSync } = await import('node:fs');
  const { walk } = await import('../scripts/aws-publish.mjs');
  const dist = new URL('../dist/', import.meta.url);
  if (!existsSync(new URL('index.html', dist))) { t.skip('no dist/ here — the publish job refuses an unknown type at publish time'); return; }
  const unknown = walk(fileURLToPath(dist)).filter((k) => { try { contentTypeOf(k); return false; } catch { return true; } });
  assert.deepEqual(unknown, [], 'look up what Pages serves for these and add them to CONTENT_TYPES');
});
